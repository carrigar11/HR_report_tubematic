"""
Late-coming penalty for Hourly and Monthly employees.
Shift start = 9:00 AM (or employee's shift_from). 2.5 Rs per minute late until total deduction in month reaches 300 Rs, then 5 Rs per minute.
Resets on 1st of each month. Fixed employees are not auto-penalized.
"""
from datetime import time
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum


SHIFT_START_DEFAULT = time(9, 0, 0)
RATE_PER_MINUTE_RS = Decimal('2.5')
RATE_AFTER_300_RS = Decimal('5')
THRESHOLD_RS = Decimal('300')


def _minutes_late(punch_in, shift_start=None):
    """Minutes punch_in is after shift_start. Returns 0 if on time or no punch_in."""
    if not punch_in:
        return 0
    start = shift_start or SHIFT_START_DEFAULT
    punch_minutes = punch_in.hour * 60 + punch_in.minute
    start_minutes = start.hour * 60 + start.minute
    return max(0, punch_minutes - start_minutes)


def _monthly_deduction_so_far(emp_code, year, month, exclude_penalty_id=None):
    """Total deduction amount for this emp in this month (excluding one record if given)."""
    from .models import Penalty
    qs = Penalty.objects.filter(emp_code=emp_code, year=year, month=month)
    if exclude_penalty_id:
        qs = qs.exclude(id=exclude_penalty_id)
    total = qs.aggregate(s=Sum('deduction_amount'))['s']
    return total or Decimal('0')


def recalculate_late_penalty_for_date(emp_code, date, attendance=None):
    """
    For Hourly and Monthly employees: if punch_in is after shift start (default 9:00 AM), compute penalty and create/update Penalty record.
    Uses 2.5 Rs/min until monthly total reaches 300, then 5 Rs/min. Resets each month.
    Fixed employees are not auto-penalized.
    If attendance is provided (e.g. just-saved from adjustment), use it to avoid stale read.
    """
    from .models import Attendance, Employee, Penalty

    emp = Employee.objects.filter(emp_code=emp_code).values('salary_type').first()
    if not emp:
        return
    salary_type = (emp.get('salary_type') or '').strip().lower()
    if salary_type not in ('hourly', 'monthly'):
        return
    att = attendance if attendance is not None else Attendance.objects.filter(emp_code=emp_code, date=date).first()
    if not att or not att.punch_in:
        # Remove auto penalty if they removed punch or are on time
        existing = Penalty.objects.filter(emp_code=emp_code, date=date, is_manual=False).first()
        if existing:
            existing.delete()
        return

    shift_start = att.shift_from or SHIFT_START_DEFAULT
    minutes = _minutes_late(att.punch_in, shift_start)
    if minutes <= 0:
        existing = Penalty.objects.filter(emp_code=emp_code, date=date, is_manual=False).first()
        if existing:
            existing.delete()
        return

    year, month = date.year, date.month
    existing_auto = Penalty.objects.filter(emp_code=emp_code, date=date, is_manual=False).first()
    deduction_so_far = _monthly_deduction_so_far(emp_code, year, month, exclude_penalty_id=existing_auto.id if existing_auto else None)

    # First 300 Rs at 2.5/min, then 5/min
    remaining_at_low = max(Decimal('0'), THRESHOLD_RS - deduction_so_far)
    minutes_at_25 = min(minutes, int(remaining_at_low / RATE_PER_MINUTE_RS))
    minutes_at_5 = minutes - minutes_at_25
    deduction = minutes_at_25 * RATE_PER_MINUTE_RS + minutes_at_5 * RATE_AFTER_300_RS
    rate_used = RATE_AFTER_300_RS if minutes_at_5 > 0 else RATE_PER_MINUTE_RS
    desc = f"Late punch: {minutes} min after {shift_start.strftime('%H:%M')} — {minutes_at_25} min @ 2.5 Rs, {minutes_at_5} min @ 5 Rs"

    with transaction.atomic():
        if existing_auto:
            existing_auto.minutes_late = minutes
            existing_auto.deduction_amount = deduction
            existing_auto.rate_used = rate_used
            existing_auto.description = desc[:500]
            existing_auto.month = month
            existing_auto.year = year
            existing_auto.save()
        else:
            Penalty.objects.create(
                emp_code=emp_code,
                date=date,
                month=month,
                year=year,
                minutes_late=minutes,
                deduction_amount=deduction,
                rate_used=rate_used,
                description=desc[:500],
                is_manual=False,
            )
