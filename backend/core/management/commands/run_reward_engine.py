from django.core.management.base import BaseCommand
from core.reward_engine import run_reward_engine


class Command(BaseCommand):
    help = 'Run streak, overtime, and absentee reward/flag engine'

    def add_arguments(self, parser):
        parser.add_argument('--date', type=str, help='YYYY-MM-DD (default: today)')

    def handle(self, *args, **options):
        from datetime import date
        d = date.today()
        if options.get('date'):
            d = date.fromisoformat(options['date'])
        result = run_reward_engine(d)
        self.stdout.write(self.style.SUCCESS(f'Reward engine run: {result}'))
