# Generated manually for shift overtime bonus (12h+ rule)

from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0008_add_salary_advance'),
    ]

    operations = [
        migrations.CreateModel(
            name='ShiftOvertimeBonus',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('emp_code', models.CharField(db_index=True, max_length=50)),
                ('date', models.DateField(db_index=True)),
                ('bonus_hours', models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=5)),
                ('description', models.CharField(blank=True, max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'shift_overtime_bonus',
                'ordering': ['-date', 'emp_code'],
                'unique_together': {('emp_code', 'date')},
            },
        ),
    ]
