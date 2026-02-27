# Unique emp_code per company (same number cannot exist twice in same company)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0024_google_sheet_sync_every_2_minutes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='employee',
            name='emp_code',
            field=models.CharField(db_index=True, max_length=50),
        ),
        migrations.AddConstraint(
            model_name='employee',
            constraint=models.UniqueConstraint(
                condition=models.Q(company__isnull=False),
                fields=('company', 'emp_code'),
                name='unique_emp_code_per_company',
            ),
        ),
        migrations.AddConstraint(
            model_name='employee',
            constraint=models.UniqueConstraint(
                condition=models.Q(company__isnull=True),
                fields=('emp_code',),
                name='unique_emp_code_when_no_company',
            ),
        ),
    ]
