"""
Create one admin per department (from Employee.dept_name).
Same password for all: 12345678
Role: dept_admin, access: full except Manage Admins and Settings.
Run: python manage.py create_dept_admins
"""
import re
from django.core.management.base import BaseCommand
from django.db import connection
from core.models import Admin, Employee


# Same as Dept Admin preset: full access except manage_admins and settings
DEPT_ACCESS = {
    'dashboard': True,
    'attendance': True,
    'salary': True,
    'leaderboard': True,
    'export': True,
    'adjustment': True,
    'upload': True,
    'employees': True,
    'bonus': True,
    'penalty': True,
    'absentee_alert': True,
    'holidays': True,
    'settings': False,
    'manage_admins': False,
}

DEFAULT_PASSWORD = '12345678'


def slugify(s):
    """Make a safe email local part from department name."""
    s = (s or '').strip().lower()
    s = re.sub(r'[^a-z0-9]+', '_', s)
    s = s.strip('_') or 'dept'
    return s[:50]


class Command(BaseCommand):
    help = 'Create one admin per department (from employees). Password for all: 12345678'

    def add_arguments(self, parser):
        parser.add_argument(
            '--password',
            type=str,
            default=DEFAULT_PASSWORD,
            help=f'Password for all created admins (default: {DEFAULT_PASSWORD})',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Only print what would be created, do not save',
        )

    def handle(self, *args, **options):
        password = options['password'] or DEFAULT_PASSWORD
        dry_run = options['dry_run']

        depts = list(
            Employee.objects.exclude(dept_name='').exclude(dept_name__isnull=True)
            .values_list('dept_name', flat=True)
            .distinct()
        )
        depts = sorted(set(d.strip() for d in depts if (d or '').strip()))

        if not depts:
            self.stdout.write(self.style.WARNING('No departments found in employees. Add employees with dept_name first.'))
            return

        # Ensure sequence is past existing ids (e.g. id=1 super admin)
        with connection.cursor() as cur:
            cur.execute(
                "SELECT setval(pg_get_serial_sequence('admins', 'id'), COALESCE((SELECT MAX(id) FROM admins), 1))"
            )
        self.stdout.write(f'Found {len(depts)} department(s): {", ".join(depts)}')

        created = 0
        skipped = 0
        for dept in depts:
            slug = slugify(dept)
            email = f'admin_{slug}@dept.hr'
            name = f'Admin - {dept}'

            if Admin.objects.filter(email__iexact=email).exists():
                self.stdout.write(f'  Skip (exists): {email}')
                skipped += 1
                continue

            if dry_run:
                self.stdout.write(self.style.SUCCESS(f'  Would create: {email} / {name} / dept={dept}'))
                created += 1
                continue

            Admin.objects.create(
                name=name,
                email=email,
                password=password,
                phone='',
                department=dept,
                role=Admin.ROLE_DEPT,
                access=DEPT_ACCESS,
            )
            self.stdout.write(self.style.SUCCESS(f'  Created: {email} ({name})'))
            created += 1

        if dry_run:
            self.stdout.write(self.style.SUCCESS(f'Dry run: would create {created}, skip {skipped}.'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Done. Created {created}, skipped {skipped}. Password for all: {password}'))
