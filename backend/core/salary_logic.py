"""
Salary history: ensure monthly records exist; bonus = floor(overtime_hours/2) for hourly.
"""
from decimal import Decimal
from django.db.models import Sum, Count, Q

from .models import Employee, Attendance, Salary


def ensure_monthly_salaries(year, month):
    """Create or update salary records for the month from attendance (overtime, bonus, total hours, days present)."""
    from datetime import date
    from calendar import monthrange
    first = date(year, month, 1)
    _, last_day = monthrange(year, month)
    last = date(year, month, last_day)

    # All attendance in month — aggregate OT, total working hours, and days present
    agg = Attendance.objects.filter(
        date__gte=first, date__lte=last
    ).values('emp_code').annotate(
        total_ot=Sum('over_time'),
        total_hours=Sum('total_working_hours'),
        present_days=Count('id', filter=Q(status='Present')),
    )
    stats_by_emp = {}
    for r in agg:
        stats_by_emp[r['emp_code']] = {
            'total_ot': r['total_ot'] or Decimal('0'),
            'total_hours': r['total_hours'] or Decimal('0'),
            'present_days': r['present_days'] or 0,
        }

    for emp in Employee.objects.filter(status__in=Employee.EMPLOYED_STATUSES):
        base = emp.base_salary or Decimal('0')
        stats = stats_by_emp.get(emp.emp_code, {})
        overtime_hours = stats.get('total_ot', Decimal('0'))
        total_working_hours = stats.get('total_hours', Decimal('0'))
        days_present = stats.get('present_days', 0)

        # Preserve existing manually-given bonus; only auto-calc for new records
        existing = Salary.objects.filter(
            emp_code=emp.emp_code, month=month, year=year
        ).first()

        if existing:
            # Update attendance-derived fields; for Hourly, bonus = floor(OT/2) (every 2 OT → 1 bonus)
            existing.salary_type = emp.salary_type
            existing.base_salary = base
            existing.overtime_hours = overtime_hours
            existing.total_working_hours = total_working_hours
            existing.days_present = days_present
            if emp.salary_type == 'Hourly' and overtime_hours > 0:
                existing.bonus = (overtime_hours / 2).to_integral_value()
            existing.save()
        else:
            # New record — auto-calc bonus for hourly employees
            bonus = Decimal('0')
            if emp.salary_type == 'Hourly' and overtime_hours > 0:
                bonus = (overtime_hours / 2).to_integral_value()
            Salary.objects.create(
                emp_code=emp.emp_code,
                month=month,
                year=year,
                salary_type=emp.salary_type,
                base_salary=base,
                overtime_hours=overtime_hours,
                total_working_hours=total_working_hours,
                days_present=days_present,
                bonus=bonus,
            )
    return True
