# Generated migration: Plant Report daily email recipients and send time.

from django.db import migrations, models


def create_send_time_setting(apps, schema_editor):
    SystemSetting = apps.get_model('core', 'SystemSetting')
    SystemSetting.objects.get_or_create(
        key='plant_report_send_time',
        defaults={'value': '06:00', 'description': 'Daily Plant Report email time (HH:MM 24h)'},
    )
    SystemSetting.objects.get_or_create(
        key='plant_report_enabled',
        defaults={'value': 'true', 'description': 'Send daily Plant Report email (true/false)'},
    )


def seed_recipients(apps, schema_editor):
    PlantReportRecipient = apps.get_model('core', 'PlantReportRecipient')
    emails = [
        'divyamdharod@tubematic.in',
        'vatsaldedhia@tubematic.in',
        'heetdoshi@tubemati.in',
        'guravkiran7532@gmail.com',
        'deveshgoswami191@gmail.com',
    ]
    for email in emails:
        PlantReportRecipient.objects.get_or_create(email=email, defaults={'is_active': True})


def remove_send_time_setting(apps, schema_editor):
    SystemSetting = apps.get_model('core', 'SystemSetting')
    SystemSetting.objects.filter(key__in=('plant_report_send_time', 'plant_report_enabled')).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0013_schedule_google_sheet_sync_every_minute'),
    ]

    operations = [
        migrations.CreateModel(
            name='PlantReportRecipient',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(max_length=254, unique=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'plant_report_recipients',
                'ordering': ['email'],
            },
        ),
        migrations.RunPython(seed_recipients, migrations.RunPython.noop),
        migrations.RunPython(create_send_time_setting, remove_send_time_setting),
    ]
