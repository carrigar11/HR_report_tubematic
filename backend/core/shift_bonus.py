"""
Shift overtime bonus: if total_working_hours in a shift > 12h, award 1 bonus hour per 2 extra hours.
Stored in ShiftOvertimeBonus (one per emp per date) so we never award twice for the same day.
Bonus hours are added to Salary.bonus for that month.
Runs for any date up to today (so past months like January get bonus when data is uploaded or recalculated).
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

MAX_WORK_HOURS_BEFORE_BONUS = 12
BONUS_HOURS_PER_EXTRA_2 = 1  # every 2 extra hours -> 1 bonus hour


def _is_allowed_bonus_date(d):
    """Allow any date that is not in the future (so Jan and other past months are calculated)."""
    return d <= timezone.localdate()


def apply_shift_overtime_bonus_for_date(emp_code, date):
    """
    Runs for any date <= today (so past months get shift OT when upload/recalc runs).
    If attendance for (emp_code, date) has total_working_hours > 12:
    - extra = total_working_hours - 12
    - bonus_hours = floor(extra / 2)
    If bonus_hours > 0 and we have not already awarded for this (emp_code, date):
    - Add bonus_hours to Salary for that month
    - Create ShiftOvertimeBonus record with description (so we don't award again).
    """
    if not _is_allowed_bonus_date(date):
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
    Runs for any date <= today so past months (e.g. January) can be recalculated.
    """
    if not _is_allowed_bonus_date(date):
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


def backfill_shift_overtime_bonus_for_month(year, month):
    """
    For every (emp_code, date) in the month with attendance and no ShiftOvertimeBonus yet,
    apply shift OT bonus so past months (e.g. January) get calculated when viewing Bonus page.
    Call from Bonus overview when selected month is in the past.
    """
    from datetime import date
    from calendar import monthrange
    from .models import Attendance, ShiftOvertimeBonus

    today = timezone.localdate()
    first = date(year, month, 1)
    if first > today:
        return 0
    _, last_day = monthrange(year, month)
    last = date(year, month, last_day)
    last = min(last, today)

    # Distinct (emp_code, date) in month that have attendance and no ShiftOvertimeBonus
    att_pairs = set(
        Attendance.objects.filter(
            date__gte=first, date__lte=last
        ).values_list('emp_code', 'date')
    )
    existing = set(
        ShiftOvertimeBonus.objects.filter(
            date__gte=first, date__lte=last
        ).values_list('emp_code', 'date')
    )
    to_apply = [(ec, d) for (ec, d) in att_pairs if (ec, d) not in existing]
    applied = 0
    for emp_code, d in to_apply:
        try:
            apply_shift_overtime_bonus_for_date(emp_code, d)
            applied += 1
        except Exception:
            pass
    return applied
