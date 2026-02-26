from celery import shared_task
from .reward_engine import run_reward_engine


@shared_task
def run_reward_engine_task():
    """Run daily reward/flag engine. Schedule via Celery Beat or cron."""
    return run_reward_engine()


@shared_task
def sync_google_sheet_task():
    """Push reports to Google Sheet. Scheduled every 1 minute via Celery Beat."""
    from .google_sheets_sync import sync_all
    return sync_all()


@shared_task
def run_today_attendance_sync_task():
    """Sync today's attendance: mark Present for punch-in rows; after cutoff mark Absent and create missing rows. Runs every 1 hour."""
    from .attendance_sync import run_today_attendance_sync
    run_today_attendance_sync(force_absent=False)
