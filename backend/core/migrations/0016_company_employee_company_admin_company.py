# Company model and company FK on Admin and Employee

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0015_employee_password_leave_penalty_inquiry'),
    ]

    operations = [
        migrations.CreateModel(
            name='Company',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('code', models.CharField(db_index=True, help_text='Short code e.g. HQ, BR1', max_length=50, unique=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'companies',
                'ordering': ['name'],
            },
        ),
        migrations.AddField(
            model_name='admin',
            name='company',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='admins', to='core.company'),
        ),
        migrations.AddField(
            model_name='employee',
            name='company',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='employees', to='core.company'),
        ),
    ]
