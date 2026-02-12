from django.core.management.base import BaseCommand
from core.models import Admin, SystemSetting


class Command(BaseCommand):
    help = 'Seed admin user and default system settings'

    def handle(self, *args, **options):
        admin, created = Admin.objects.get_or_create(
            id=1,
            defaults={
                'name': 'admin',
                'email': 'admin@gmail.com',
                'phone': '9999999999',
                'password': '123456789',
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS('Created admin: admin@gmail.com / 123456789'))
        else:
            self.stdout.write('Admin already exists.')

        defaults = [
            ('streak_days', '4', 'Consecutive present days for streak reward'),
            ('weekly_overtime_threshold_hours', '6', 'Min weekly OT hours for reward'),
            ('absent_streak_days', '3', 'Consecutive absent days for red flag'),
        ]
        for key, value, desc in defaults:
            SystemSetting.objects.get_or_create(key=key, defaults={'value': value, 'description': desc})
        self.stdout.write(self.style.SUCCESS('System settings seeded.'))
