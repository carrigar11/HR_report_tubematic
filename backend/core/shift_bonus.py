"""
Shift overtime bonus: if total_working_hours in a shift > 12h, award 1 bonus hour per 2 extra hours.
Stored in ShiftOvertimeBonus (one per emp per date) so we never award twice for the same day.
Bonus hours are added to Salary.bonus for that month.
Only calculated for today, yesterday, and day-before-yesterday.
"""
from datetime import timedelta
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

MAX_WORK_HOURS_BEFORE_BONUS = 12
BONUS_HOURS_PER_EXTRA_2 = 1  # every 2 extra hours -> 1 bonus hour


def _allowed_bonus_dates():
    """Only today, yesterday, and day-before-yesterday are eligible for shift OT bonus."""
    today = timezone.localdate()
    return {today, today - timedelta(days=1), today - timedelta(days=2)}


def apply_shift_overtime_bonus_for_date(emp_code, date):
    """
    Only runs for date in (today, yesterday, day-before-yesterday).
    If attendance for (emp_code, date) has total_working_hours > 12:
    - extra = total_working_hours - 12
    - bonus_hours = floor(extra / 2)
    If bonus_hours > 0 and we have not already awarded for this (emp_code, date):
    - Add bonus_hours to Salary for that month
    - Create ShiftOvertimeBonus record with description (so we don't award again).
    """
    if date not in _allowed_bonus_dates():
        return
    from .models import Attendance, Salary, ShiftOvertimeBonus

    att = Attendance.objects.filter(emp_code=emp_code, date=date).first()
    if not att:
        return
    twh = att.total_working_hours
    if twh is None:
        return
    try:
        twh = Decimal(str(twh))
    except Exception:
        return
    if twh < MAX_WORK_HOURS_BEFORE_BONUS:
        return
    extra = twh - MAX_WORK_HOURS_BEFORE_BONUS
    bonus_hours = int(extra / 2)
    if bonus_hours <= 0:
        return
    if ShiftOvertimeBonus.objects.filter(emp_code=emp_code, date=date).exists():
        return
    with transaction.atomic():
        from .salary_logic import ensure_monthly_salaries
        ensure_monthly_salaries(date.year, date.month)
        sal = Salary.objects.filter(
            emp_code=emp_code, month=date.month, year=date.year
        ).first()
        if not sal:
            return
        sal.bonus = (sal.bonus or Decimal('0')) + Decimal(bonus_hours)
        sal.save(update_fields=['bonus'])
        extra_str = str(round(float(extra), 2))
        desc = (
            f"Shift OT bonus: {twh}h worked (max 12h), {extra_str}h extra, "
            f"{bonus_hours}h bonus (1h per 2h extra)"
        )
        ShiftOvertimeBonus.objects.create(
            emp_code=emp_code,
            date=date,
            bonus_hours=Decimal(bonus_hours),
            description=desc[:500],
        )


def _compute_bonus_hours_from_att(att):
    """Given an attendance instance, return (bonus_hours int, description str) or (0, '')."""
    if not att or att.total_working_hours is None:
        return 0, ''
    try:
        twh = Decimal(str(att.total_working_hours))
    except Exception:
        return 0, ''
    if twh < MAX_WORK_HOURS_BEFORE_BONUS:
        return 0, ''
    extra = twh - MAX_WORK_HOURS_BEFORE_BONUS
    bonus_hours = int(extra / 2)
    if bonus_hours <= 0:
        return 0, ''
    extra_str = str(round(float(extra), 2))
    desc = (
        f"Shift OT bonus: {twh}h worked (max 12h), {extra_str}h extra, "
        f"{bonus_hours}h bonus (1h per 2h extra)"
    )
    return bonus_hours, desc[:500]


def recalculate_shift_overtime_bonus_for_date(emp_code, date):
    """
    Recompute shift OT bonus from current attendance and sync Salary + ShiftOvertimeBonus.
    Call this after manual adjust so bonus updates when punch in/out changes.
    Only runs for today, yesterday, day-before-yesterday.
    """
    if date not in _allowed_bonus_dates():
        return
    from .models import Attendance, Salary, ShiftOvertimeBonus

    att = Attendance.objects.filter(emp_code=emp_code, date=date).first()
    new_bonus_hours, new_desc = _compute_bonus_hours_from_att(att)
    new_bonus = Decimal(new_bonus_hours)
    existing = ShiftOvertimeBonus.objects.filter(emp_code=emp_code, date=date).first()
    old_bonus = (existing.bonus_hours or Decimal('0')) if existing else Decimal('0')

    with transaction.atomic():
        from .salary_logic import ensure_monthly_salaries
        ensure_monthly_salaries(date.year, date.month)
        sal = Salary.objects.filter(
            emp_code=emp_code, month=date.month, year=date.year
        ).first()
        if not sal:
            return
        diff = new_bonus - old_bonus
        if diff != 0:
            sal.bonus = (sal.bonus or Decimal('0')) + diff
            sal.save(update_fields=['bonus'])
        if new_bonus_hours > 0:
            if existing:
                existing.bonus_hours = new_bonus
                existing.description = new_desc or existing.description
                existing.save(update_fields=['bonus_hours', 'description'])
            else:
                ShiftOvertimeBonus.objects.create(
                    emp_code=emp_code,
                    date=date,
                    bonus_hours=new_bonus,
                    description=new_desc,
                )
        elif existing:
            existing.delete()
