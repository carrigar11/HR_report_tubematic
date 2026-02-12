"""Clear all attendance records. Use before re-uploading a fresh sheet."""
from django.core.management.base import BaseCommand
from core.models import Attendance


class Command(BaseCommand):
    help = 'Delete all attendance records (table structure kept). Re-run migrations if you need to recreate the table.'

    def add_arguments(self, parser):
        parser.add_argument('--yes', action='store_true', help='Skip confirmation')

    def handle(self, *args, **options):
        count = Attendance.objects.count()
        if count == 0:
            self.stdout.write('Attendance table is already empty.')
            return
        if not options.get('yes'):
            confirm = input(f'Delete all {count} attendance records? [y/N]: ')
            if confirm.lower() != 'y':
                self.stdout.write('Aborted.')
                return
        deleted, _ = Attendance.objects.all().delete()
        self.stdout.write(self.style.SUCCESS(f'Deleted {deleted} attendance record(s). You can now re-upload Excel.'))
