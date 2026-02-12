import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hr_system.settings')

app = Celery('hr_system')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Daily at 1 AM
app.conf.beat_schedule = {
    'reward-engine-daily': {
        'task': 'core.tasks.run_reward_engine_task',
        'schedule': crontab(hour=1, minute=0),
    },
}


@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
