# Generated migration for leave allowances on Employee

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0017_leaverequest_leave_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='employee',
            name='casual_allowance_per_year',
            field=models.PositiveSmallIntegerField(blank=True, help_text='Casual leave days per year; blank = use system default', null=True),
        ),
        migrations.AddField(
            model_name='employee',
            name='sick_allowance_per_year',
            field=models.PositiveSmallIntegerField(blank=True, help_text='Sick leave days per year; blank = use system default', null=True),
        ),
        migrations.AddField(
            model_name='employee',
            name='earned_allowance_per_year',
            field=models.PositiveSmallIntegerField(blank=True, help_text='Earned leave days per year; blank = use system default', null=True),
        ),
    ]
