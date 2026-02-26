# Schedule today's attendance sync (Present/Absent, active employees) every 1 hour via Celery Beat.

from django.db import migrations


def create_hourly_attendance_sync_schedule(apps, schema_editor):
    """Create IntervalSchedule (1 hour) and PeriodicTask for core.tasks.run_today_attendance_sync_task."""
    IntervalSchedule = apps.get_model('django_celery_beat', 'IntervalSchedule')
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    schedule, _ = IntervalSchedule.objects.get_or_create(
        every=1,
        period='hours',
        defaults={},
    )
    PeriodicTask.objects.get_or_create(
        name='Today attendance sync every 1 hour',
        defaults={
            'task': 'core.tasks.run_today_attendance_sync_task',
            'interval': schedule,
            'enabled': True,
        },
    )


def remove_hourly_attendance_sync_schedule(apps, schema_editor):
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    PeriodicTask.objects.filter(name='Today attendance sync every 1 hour').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0022_companyregistrationrequest_status'),
        ('django_celery_beat', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_hourly_attendance_sync_schedule, remove_hourly_attendance_sync_schedule),
    ]
