import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hr_system.settings')

app = Celery('hr_system')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Daily at 1 AM; every 1 hour for today's attendance sync (Active Employees / present-absent calculation)
app.conf.beat_schedule = {
    'reward-engine-daily': {
        'task': 'core.tasks.run_reward_engine_task',
        'schedule': crontab(hour=1, minute=0),
    },
    'today-attendance-sync-hourly': {
        'task': 'core.tasks.run_today_attendance_sync_task',
        'schedule': crontab(minute=0),  # every hour at :00
    },
}


@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
