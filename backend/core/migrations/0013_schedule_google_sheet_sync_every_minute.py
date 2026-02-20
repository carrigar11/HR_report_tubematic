# Generated migration: schedule Google Sheet sync every 1 minute via Celery Beat.

from django.db import migrations


def create_google_sheet_sync_schedule(apps, schema_editor):
    """Create IntervalSchedule (1 minute) and PeriodicTask for core.tasks.sync_google_sheet_task."""
    IntervalSchedule = apps.get_model('django_celery_beat', 'IntervalSchedule')
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    schedule, _ = IntervalSchedule.objects.get_or_create(
        every=1,
        period='minutes',
        defaults={},
    )
    PeriodicTask.objects.get_or_create(
        name='Google Sheet sync every 1 minute',
        defaults={
            'task': 'core.tasks.sync_google_sheet_task',
            'interval': schedule,
            'enabled': True,
        },
    )


def remove_google_sheet_sync_schedule(apps, schema_editor):
    """Remove the periodic task (optional reverse)."""
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    PeriodicTask.objects.filter(name='Google Sheet sync every 1 minute').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0012_insert_default_smtp_config'),
        ('django_celery_beat', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_google_sheet_sync_schedule, remove_google_sheet_sync_schedule),
    ]
