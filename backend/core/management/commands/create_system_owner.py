"""
Create or update the system owner admin. Removes system owner from all others first.
  python manage.py create_system_owner

Default: email=deveshgoswami191@gmail.com, phone=9321726093, password=Seeta#4597
"""
from django.core.management.base import BaseCommand
from core.models import Admin


SYSTEM_OWNER_EMAIL = 'deveshgoswami191@gmail.com'
SYSTEM_OWNER_PHONE = '9321726093'
SYSTEM_OWNER_NAME = 'System Owner'
DEFAULT_PASSWORD = 'System Owner'


class Command(BaseCommand):
    help = 'Remove system owner from all admins, then create/update one system owner'

    def add_arguments(self, parser):
        parser.add_argument('--password', type=str, default=DEFAULT_PASSWORD, help=f'Password (default: {DEFAULT_PASSWORD})')

    def handle(self, *args, **options):
        password = options.get('password') or DEFAULT_PASSWORD

        # Remove system owner from everyone
        updated = Admin.objects.filter(is_system_owner=True).update(is_system_owner=False)
        if updated:
            self.stdout.write(self.style.WARNING(f'Removed system owner from {updated} admin(s).'))

        # Create or update the single system owner
        admin = Admin.objects.filter(email__iexact=SYSTEM_OWNER_EMAIL).first()
        if admin:
            admin.name = SYSTEM_OWNER_NAME
            admin.phone = SYSTEM_OWNER_PHONE
            admin.password = password
            admin.is_system_owner = True
            admin.save()
            self.stdout.write(self.style.SUCCESS(f'Updated system owner: {admin.email} (id={admin.pk})'))
        else:
            admin = Admin.objects.create(
                name=SYSTEM_OWNER_NAME,
                email=SYSTEM_OWNER_EMAIL,
                phone=SYSTEM_OWNER_PHONE,
                password=password,
                role=Admin.ROLE_DEPT,
                access={},
                is_system_owner=True,
            )
            self.stdout.write(self.style.SUCCESS(f'Created system owner: {admin.email} (id={admin.pk})'))

        self.stdout.write(f'  Login: {SYSTEM_OWNER_EMAIL}')
        self.stdout.write(f'  Password: {password}')
