"""
Late-coming penalty for Hourly and Monthly employees.
Shift start = 9:00 AM (or employee's shift_from). Rate and threshold configurable per company via CompanySetting.
Resets on 1st of each month. Fixed employees are not auto-penalized.
"""
from datetime import time
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum


SHIFT_START_DEFAULT = time(9, 0, 0)


def _get_penalty_settings(company_id=None):
    """Return (rate_per_minute, monthly_threshold_rs, rate_after_threshold) from company or defaults."""
    from .settings_utils import get_company_setting
    rate = get_company_setting('penalty_rate_per_minute_rs', company_id=company_id, default='2.5')
    threshold = get_company_setting('penalty_monthly_threshold_rs', company_id=company_id, default='300')
    rate_after = get_company_setting('penalty_rate_after_threshold_rs', company_id=company_id, default='5')
    try:
        r = Decimal(str(rate))
    except Exception:
        r = Decimal('2.5')
    try:
        t = Decimal(str(threshold))
    except Exception:
        t = Decimal('300')
    try:
        ra = Decimal(str(rate_after))
    except Exception:
        ra = Decimal('5')
    return r, t, ra


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
    Rate and threshold from company settings (or defaults: 2.5 Rs/min until 300 Rs, then 5 Rs/min). Resets each month.
    Fixed employees are not auto-penalized.
    If attendance is provided (e.g. just-saved from adjustment), use it to avoid stale read.
    """
    from .models import Attendance, Employee, Penalty

    emp = Employee.objects.filter(emp_code=emp_code).values('salary_type', 'company_id').first()
    if not emp:
        return
    salary_type = (emp.get('salary_type') or '').strip().lower()
    if salary_type not in ('hourly', 'monthly'):
        return
    company_id = emp.get('company_id')
    RATE_PER_MINUTE_RS, THRESHOLD_RS, RATE_AFTER_300_RS = _get_penalty_settings(company_id=company_id)

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

    remaining_at_low = max(Decimal('0'), THRESHOLD_RS - deduction_so_far)
    minutes_at_low = min(minutes, int(remaining_at_low / RATE_PER_MINUTE_RS)) if RATE_PER_MINUTE_RS else 0
    minutes_at_high = minutes - minutes_at_low
    deduction = minutes_at_low * RATE_PER_MINUTE_RS + minutes_at_high * RATE_AFTER_300_RS
    rate_used = RATE_AFTER_300_RS if minutes_at_high > 0 else RATE_PER_MINUTE_RS
    desc = f"Late punch: {minutes} min after {shift_start.strftime('%H:%M')} — {minutes_at_low} min @ {RATE_PER_MINUTE_RS} Rs, {minutes_at_high} min @ {RATE_AFTER_300_RS} Rs"

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
