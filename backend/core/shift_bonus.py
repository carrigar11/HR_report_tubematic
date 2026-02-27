"""
Shift overtime bonus: if total_working_hours in a shift > min_hours, award bonus (e.g. 1 hour per 2 extra hours).
Min hours and ratio configurable per company via CompanySetting.
Stored in ShiftOvertimeBonus (one per emp per date). Bonus hours added to Salary.bonus for that month.
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone


def _get_shift_bonus_settings(company_id=None):
    """Return (min_work_hours, extra_hours_for_1_bonus) from company settings or defaults (12, 2)."""
    from .settings_utils import get_company_setting
    min_h = get_company_setting('shift_ot_min_hours', company_id=company_id, default='12')
    extra_for_1 = get_company_setting('shift_ot_extra_hours_for_1_bonus', company_id=company_id, default='2')
    try:
        m = float(min_h)
    except Exception:
        m = 12.0
    try:
        e = float(extra_for_1)
    except Exception:
        e = 2.0
    return m, e


def _is_allowed_bonus_date(d):
    """Allow any date that is not in the future (so Jan and other past months are calculated)."""
    return d <= timezone.localdate()


def apply_shift_overtime_bonus_for_date(emp_code, date):
    """
    If attendance (emp_code, date) has total_working_hours > min_hours (company setting, default 12):
    extra = total_working_hours - min_hours; bonus_hours = floor(extra / extra_hours_for_1_bonus) (default 2).
    If bonus_hours > 0 and not already awarded: add to Salary.bonus and create ShiftOvertimeBonus.
    """
    if not _is_allowed_bonus_date(date):
        return
    from .models import Attendance, Employee, Salary, ShiftOvertimeBonus

    emp = Employee.objects.filter(emp_code=emp_code).values('company_id').first()
    company_id = emp.get('company_id') if emp else None
    MAX_WORK_HOURS_BEFORE_BONUS, EXTRA_HOURS_FOR_1_BONUS = _get_shift_bonus_settings(company_id=company_id)

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
    extra = twh - Decimal(str(MAX_WORK_HOURS_BEFORE_BONUS))
    denom = max(Decimal('0.01'), Decimal(str(EXTRA_HOURS_FOR_1_BONUS)))
    bonus_hours = int(extra / denom)
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
            f"Shift OT bonus: {twh}h worked (min {MAX_WORK_HOURS_BEFORE_BONUS}h), {extra_str}h extra, "
            f"{bonus_hours}h bonus (1h per {EXTRA_HOURS_FOR_1_BONUS}h extra)"
        )
        ShiftOvertimeBonus.objects.create(
            emp_code=emp_code,
            date=date,
            bonus_hours=Decimal(bonus_hours),
            description=desc[:500],
        )


def _compute_bonus_hours_from_att(att, company_id=None):
    """Given an attendance instance, return (bonus_hours int, description str) or (0, ''). Uses company settings if company_id provided."""
    if not att or att.total_working_hours is None:
        return 0, ''
    if company_id is None and att:
        from .models import Employee
        emp = Employee.objects.filter(emp_code=att.emp_code).values('company_id').first()
        company_id = emp.get('company_id') if emp else None
    MAX_WORK_HOURS_BEFORE_BONUS, EXTRA_HOURS_FOR_1_BONUS = _get_shift_bonus_settings(company_id=company_id)
    try:
        twh = Decimal(str(att.total_working_hours))
    except Exception:
        return 0, ''
    if twh < MAX_WORK_HOURS_BEFORE_BONUS:
        return 0, ''
    extra = twh - Decimal(str(MAX_WORK_HOURS_BEFORE_BONUS))
    denom = max(Decimal('0.01'), Decimal(str(EXTRA_HOURS_FOR_1_BONUS)))
    bonus_hours = int(extra / denom)
    if bonus_hours <= 0:
        return 0, ''
    extra_str = str(round(float(extra), 2))
    desc = (
        f"Shift OT bonus: {twh}h worked (min {MAX_WORK_HOURS_BEFORE_BONUS}h), {extra_str}h extra, "
        f"{bonus_hours}h bonus (1h per {EXTRA_HOURS_FOR_1_BONUS}h extra)"
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
