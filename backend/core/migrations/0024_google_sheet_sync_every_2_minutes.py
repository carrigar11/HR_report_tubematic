# Update Google Sheet sync from every 1 minute to every 2 minutes (Celery Beat).

from django.db import migrations


def update_google_sheet_sync_to_2_minutes(apps, schema_editor):
    IntervalSchedule = apps.get_model('django_celery_beat', 'IntervalSchedule')
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    schedule_2min, _ = IntervalSchedule.objects.get_or_create(
        every=2,
        period='minutes',
        defaults={},
    )
    task = PeriodicTask.objects.filter(name='Google Sheet sync every 1 minute').first()
    if task:
        task.interval = schedule_2min
        task.name = 'Google Sheet sync every 2 minutes'
        task.save()


def reverse_google_sheet_sync_to_1_minute(apps, schema_editor):
    IntervalSchedule = apps.get_model('django_celery_beat', 'IntervalSchedule')
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    schedule_1min, _ = IntervalSchedule.objects.get_or_create(
        every=1,
        period='minutes',
        defaults={},
    )
    task = PeriodicTask.objects.filter(name='Google Sheet sync every 2 minutes').first()
    if task:
        task.interval = schedule_1min
        task.name = 'Google Sheet sync every 1 minute'
        task.save()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0023_schedule_today_attendance_sync_hourly'),
        ('django_celery_beat', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(update_google_sheet_sync_to_2_minutes, reverse_google_sheet_sync_to_1_minute),
    ]
