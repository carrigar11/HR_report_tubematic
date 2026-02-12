"""
Salary history: ensure monthly records exist; bonus = floor(overtime_hours/2) for hourly.
"""
from decimal import Decimal
from django.db.models import Sum

from .models import Employee, Attendance, Salary


def ensure_monthly_salaries(year, month):
    """Create or update salary records for the month from attendance (overtime, bonus)."""
    from datetime import date
    from calendar import monthrange
    first = date(year, month, 1)
    _, last_day = monthrange(year, month)
    last = date(year, month, last_day)

    # All attendance in month
    agg = Attendance.objects.filter(
        date__gte=first, date__lte=last
    ).values('emp_code').annotate(
        total_ot=Sum('over_time')
    )
    ot_by_emp = {r['emp_code']: (r['total_ot'] or Decimal('0')) for r in agg}

    for emp in Employee.objects.filter(status='Active'):
        base = emp.base_salary or Decimal('0')
        overtime_hours = ot_by_emp.get(emp.emp_code, Decimal('0'))
        bonus = Decimal('0')
        if emp.salary_type == 'Hourly' and overtime_hours > 0:
            bonus = (overtime_hours / 2).to_integral_value()
        obj, _ = Salary.objects.update_or_create(
            emp_code=emp.emp_code,
            month=month,
            year=year,
            defaults={
                'salary_type': emp.salary_type,
                'base_salary': base,
                'overtime_hours': overtime_hours,
                'bonus': bonus,
            }
        )
    return True
