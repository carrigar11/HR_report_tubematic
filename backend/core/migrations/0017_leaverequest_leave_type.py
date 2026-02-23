# Generated migration for leave_type on LeaveRequest

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0016_company_employee_company_admin_company'),
    ]

    operations = [
        migrations.AddField(
            model_name='leaverequest',
            name='leave_type',
            field=models.CharField(blank=True, choices=[('casual', 'Casual'), ('sick', 'Sick'), ('earned', 'Earned'), ('other', 'Other')], default='casual', max_length=20),
        ),
    ]
