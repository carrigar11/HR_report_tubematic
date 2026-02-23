"""
Backfill shift OT bonus for past month(s) so Jan and other months get counted.
Run: python manage.py backfill_bonus_month
      python manage.py backfill_bonus_month --year 2025 --month 1
"""
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = 'Backfill shift overtime bonus for past month(s) so bonus is calculated (e.g. January)'

    def add_arguments(self, parser):
        parser.add_argument('--year', type=int, help='Year (default: current year)')
        parser.add_argument('--month', type=int, help='Month 1-12 (default: all past months of year)')

    def handle(self, *args, **options):
        from core.shift_bonus import backfill_shift_overtime_bonus_for_month
        from core.salary_logic import ensure_monthly_salaries

        today = timezone.localdate()
        year = options.get('year') or today.year
        month_arg = options.get('month')

        if month_arg is not None:
            month = month_arg
            if month < 1 or month > 12:
                self.stderr.write(self.style.ERROR('Month must be 1-12'))
                return
            if (year, month) > (today.year, today.month):
                self.stdout.write(self.style.WARNING(f'{year}-{month:02d} is future, skipping'))
                return
            self.stdout.write(f'Backfilling {year}-{month:02d}...')
            n = backfill_shift_overtime_bonus_for_month(year, month)
            ensure_monthly_salaries(year, month)
            self.stdout.write(self.style.SUCCESS(f'Done {year}-{month:02d}: applied shift OT for {n} (emp,date) pairs'))
            return

        # No month: do all past months of the year
        total = 0
        for m in range(1, 13):
            if (year, m) > (today.year, today.month):
                break
            self.stdout.write(f'Backfilling {year}-{m:02d}...')
            n = backfill_shift_overtime_bonus_for_month(year, m)
            ensure_monthly_salaries(year, m)
            total += n
            self.stdout.write(self.style.SUCCESS(f'  {year}-{m:02d}: {n} (emp,date) pairs'))
        self.stdout.write(self.style.SUCCESS(f'Done. Total applied: {total}'))
