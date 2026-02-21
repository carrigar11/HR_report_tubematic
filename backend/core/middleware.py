"""
Auto-sync: every few minutes, mark today's punch-in records as Present.
JWT: set request.jwt_admin_id from Authorization Bearer token; return 401 if Bearer present but invalid/expired.
"""
import time
import json
from django.utils import timezone
from django.http import HttpResponse

from .models import Attendance
from .jwt_auth import decode_token

_LAST_SYNC = 0.0
_INTERVAL = 180  # 3 minutes


class JWTAdminMiddleware:
    """
    If request has Authorization: Bearer <token>, decode JWT and set request.jwt_admin_id
    when token is a valid access token. get_request_admin() uses this first, then X-Admin-Id.
    If Bearer is present but token is invalid or expired, return 401 so the client can try refresh.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.jwt_admin_id = None
        request.had_bearer_token = False
        auth_header = request.headers.get('Authorization') or request.META.get('HTTP_AUTHORIZATION')
        if auth_header and auth_header.startswith('Bearer '):
            request.had_bearer_token = True
            token = auth_header[7:].strip()
            payload = decode_token(token)
            if not payload or payload.get('type') != 'access':
                return HttpResponse(
                    json.dumps({'error': 'Invalid or expired token', 'code': 'token_invalid'}),
                    status=401,
                    content_type='application/json',
                )
            admin_id = payload.get('admin_id')
            if admin_id is not None:
                request.jwt_admin_id = int(admin_id)
        return self.get_response(request)


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
