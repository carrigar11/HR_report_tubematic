"""
Start a background thread that syncs the Google Sheet every 2 minutes
when the Django server is running. No Celery or Redis needed.
"""
import logging
import threading
import time

from django.apps import AppConfig

logger = logging.getLogger(__name__)

_SYNC_INTERVAL_SECONDS = 120  # 2 minutes


def _google_sheet_sync_loop():
    """Run sync_all every 2 minutes per company only. Each company's sheet gets only that company's employees/departments.
    No global sync (company_id=None) so a company's sheet is never overwritten with all companies' data."""
    while True:
        try:
            from core.google_sheets_sync import get_sheet_id, sync_all
            from core.models import CompanySetting
            # Per-company sheets only: each company with google_sheet_id gets only its own data
            for row in CompanySetting.objects.filter(key='google_sheet_id', company_id__isnull=False).exclude(value='').values_list('company_id', flat=True).distinct():
                if get_sheet_id(company_id=row):
                    result = sync_all(company_id=row)
                    if result.get('success'):
                        logger.debug('Google Sheet auto-sync OK (company %s)', row)
                    else:
                        logger.warning('Google Sheet auto-sync (company %s): %s', row, result.get('message', ''))
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
        time.sleep(_SYNC_INTERVAL_SECONDS)


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
        logger.info('Google Sheet auto-sync started (every 2 minutes)')
