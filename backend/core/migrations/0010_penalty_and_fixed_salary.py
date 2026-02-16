# Penalty model + Fixed salary type

from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_shift_overtime_bonus'),
    ]

    operations = [
        migrations.AlterField(
            model_name='employee',
            name='salary_type',
            field=models.CharField(
                choices=[('Monthly', 'Monthly'), ('Hourly', 'Hourly'), ('Fixed', 'Fixed')],
                default='Monthly',
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name='Penalty',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('emp_code', models.CharField(db_index=True, max_length=50)),
                ('date', models.DateField(db_index=True)),
                ('month', models.PositiveSmallIntegerField()),
                ('year', models.PositiveIntegerField()),
                ('minutes_late', models.PositiveSmallIntegerField(default=0, help_text='Minutes late (0 for manual)')),
                ('deduction_amount', models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10)),
                ('rate_used', models.DecimalField(blank=True, decimal_places=2, help_text='Rs per min used (2.5 or 5)', max_digits=5, null=True)),
                ('description', models.CharField(blank=True, max_length=500)),
                ('is_manual', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'penalty',
                'ordering': ['-date', 'emp_code'],
            },
        ),
    ]
