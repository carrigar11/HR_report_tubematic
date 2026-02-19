from django.core.management.base import BaseCommand
from core.google_sheets_sync import sync_all


class Command(BaseCommand):
    help = 'Push reports to the configured Google Sheet (5 sheets). Run via cron every minute if desired.'

    def add_arguments(self, parser):
        parser.add_argument('--force-full', action='store_true', help='Update all sheets (default: same as always)')

    def handle(self, *args, **options):
        result = sync_all(force_full=options.get('force_full', False))
        if result['success']:
            self.stdout.write(self.style.SUCCESS(result['message']))
            if result.get('last_sync'):
                self.stdout.write(f"Last sync: {result['last_sync']}")
        else:
            self.stderr.write(self.style.ERROR(result['message']))
