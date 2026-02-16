"""
Recalc OT and salary for a month using the hourly rule: normal = 12h, over that = OT; bonus = floor(OT/2).
For each attendance in the month where employee is Hourly: over_time = max(0, total_working_hours - 12).
Then refreshes Salary rows for that month (overtime_hours, total_working_hours, bonus).
Usage: python manage.py recalc_monthly_ot 2 2026   # February 2026
"""
from calendar import monthrange
from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand

from core.models import Attendance, Employee
from core.salary_logic import ensure_monthly_salaries
from core.excel_upload import HOURLY_NORMAL_WORK_HOURS, _calc_overtime_for_employee


class Command(BaseCommand):
    help = 'Recalc OT for hourly (12h normal) and refresh salary for a month. Args: month year'

    def add_arguments(self, parser):
        parser.add_argument('month', type=int, help='Month (1-12)')
        parser.add_argument('year', type=int, help='Year (e.g. 2026)')

    def handle(self, *args, **options):
        month = options['month']
        year = options['year']
        if month < 1 or month > 12:
            self.stdout.write(self.style.ERROR('Month must be 1-12'))
            return
        first = date(year, month, 1)
        _, last_day = monthrange(year, month)
        last = date(year, month, last_day)

        hourly_emp_codes = set(
            Employee.objects.filter(salary_type='Hourly').values_list('emp_code', flat=True)
        )
        updated = 0
        for att in Attendance.objects.filter(date__gte=first, date__lte=last).only(
            'id', 'emp_code', 'total_working_hours', 'over_time'
        ):
            if att.emp_code not in hourly_emp_codes:
                continue
            twh = att.total_working_hours or Decimal('0')
            new_ot = _calc_overtime_for_employee(
                twh, att.shift_from, att.shift_to, 'Hourly'
            )
            if new_ot != (att.over_time or Decimal('0')):
                Attendance.objects.filter(id=att.id).update(over_time=new_ot)
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Updated over_time for {updated} attendance record(s) (hourly, {first}–{last}).'
            )
        )
        ensure_monthly_salaries(year, month)
        self.stdout.write(
            self.style.SUCCESS(
                f'Refreshed salary records for {year}-{month:02d} (overtime_hours, total_working_hours, bonus).'
            )
        )
