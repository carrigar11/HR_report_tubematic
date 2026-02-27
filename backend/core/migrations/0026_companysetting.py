# Per-company settings: Google Sheet ID, bonus/penalty rules, etc.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0025_employee_emp_code_unique_per_company'),
    ]

    operations = [
        migrations.CreateModel(
            name='CompanySetting',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=100)),
                ('value', models.CharField(max_length=500)),
                ('description', models.CharField(blank=True, max_length=255)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('company', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='settings', to='core.company')),
            ],
            options={
                'db_table': 'company_settings',
                'ordering': ['company_id', 'key'],
            },
        ),
        migrations.AddConstraint(
            model_name='companysetting',
            constraint=models.UniqueConstraint(condition=models.Q(company__isnull=False), fields=('company', 'key'), name='unique_company_setting_per_company'),
        ),
        migrations.AddConstraint(
            model_name='companysetting',
            constraint=models.UniqueConstraint(condition=models.Q(company__isnull=True), fields=('key',), name='unique_company_setting_global_key'),
        ),
    ]
