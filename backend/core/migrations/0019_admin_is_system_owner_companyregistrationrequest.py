# Generated manually for system owner and company registration

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0018_employee_leave_allowances'),
    ]

    operations = [
        migrations.CreateModel(
            name='CompanyRegistrationRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('company_name', models.CharField(max_length=255)),
                ('contact_email', models.EmailField(max_length=254)),
                ('contact_phone', models.CharField(blank=True, max_length=50)),
                ('address', models.TextField(blank=True)),
                ('extra_data', models.JSONField(blank=True, default=dict, help_text='Additional fields from form')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'company_registration_requests',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddField(
            model_name='admin',
            name='is_system_owner',
            field=models.BooleanField(default=False),
        ),
    ]
