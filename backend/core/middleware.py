"""
Auto-sync: every few minutes, mark today's punch-in records as Present.
"""
import time
from django.utils import timezone

from .models import Attendance

_LAST_SYNC = 0.0
_INTERVAL = 180  # 3 minutes


class TodayPunchInSyncMiddleware:
    """Runs every ~3 min: if employee has punch_in for today, set status=Present."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        global _LAST_SYNC
        now = time.time()
        if now - _LAST_SYNC >= _INTERVAL:
            _LAST_SYNC = now
            today = timezone.localdate()
            Attendance.objects.filter(
                date=today,
                punch_in__isnull=False
            ).exclude(status='Present').update(status='Present')
        return self.get_response(request)
