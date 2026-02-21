"""
Start a background thread that syncs the Google Sheet every 1 minute
when the Django server is running. No Celery or Redis needed.
"""
import logging
import threading
import time

from django.apps import AppConfig

logger = logging.getLogger(__name__)


def _google_sheet_sync_loop():
    """Run sync_all every 60 seconds; also check daily Plant Report email time."""
    while True:
        try:
            from core.google_sheets_sync import get_sheet_id, sync_all
            if get_sheet_id():
                result = sync_all()
                if result.get('success'):
                    logger.debug('Google Sheet auto-sync OK')
                else:
                    logger.warning('Google Sheet auto-sync: %s', result.get('message', ''))
            else:
                logger.debug('Google Sheet ID not set; skipping auto-sync')
        except Exception as e:
            logger.warning('Google Sheet auto-sync error: %s', e, exc_info=True)
        try:
            from core.plant_report_email import maybe_send_plant_report_daily
            maybe_send_plant_report_daily()
        except Exception as e:
            logger.warning('Plant Report daily email check error: %s', e, exc_info=True)
        try:
            from core.inactive_mark import mark_inactive_no_punch_6_days
            mark_inactive_no_punch_6_days()
        except Exception as e:
            logger.warning('Auto mark-inactive (no punch 6 days) error: %s', e, exc_info=True)
        time.sleep(60)


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'
    verbose_name = 'HR Core'

    def ready(self):
        # Avoid starting the thread twice when using runserver (reloader spawns two processes)
        import os
        if os.environ.get('RUN_MAIN') != 'true':
            return
        thread = threading.Thread(target=_google_sheet_sync_loop, daemon=True)
        thread.start()
        logger.info('Google Sheet auto-sync started (every 1 minute)')
