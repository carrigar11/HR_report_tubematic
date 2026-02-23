"""
Set all existing data to company "Tubematic" and set every employee password to 123456789.

Run: python manage.py set_tubematic_company
"""
from django.core.management.base import BaseCommand
from core.models import Company, Employee, Admin


class Command(BaseCommand):
    help = 'Create company Tubematic, assign all employees and admins to it, set all employee passwords to 123456789'

    def handle(self, *args, **options):
        company, created = Company.objects.get_or_create(
            code='TUBEMATIC',
            defaults={'name': 'Tubematic', 'is_active': True}
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'Created company: {company.name} ({company.code})'))
        else:
            company.name = 'Tubematic'
            company.is_active = True
            company.save()
            self.stdout.write(f'Using existing company: {company.name} ({company.code})')

        emp_count = Employee.objects.count()
        Employee.objects.all().update(company=company, password='123456789')
        self.stdout.write(self.style.SUCCESS(f'Updated {emp_count} employee(s): company=Tubematic, password=123456789'))

        # Assign admins to Tubematic except super admin (id=1) so they keep full access
        admin_updated = Admin.objects.exclude(id=1).update(company=company)
        self.stdout.write(self.style.SUCCESS(f'Updated {admin_updated} admin(s): company=Tubematic (super admin id=1 left unchanged)'))

        self.stdout.write(self.style.SUCCESS('Done.'))
