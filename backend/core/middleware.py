"""
Auto-sync: every few minutes, mark today's punch-in records as Present.
After 11:50 AM (configurable): mark today's no-punch-in records as Absent; create Absent rows for active employees with no row.
JWT: set request.jwt_admin_id from Authorization Bearer token; return 401 if Bearer present but invalid/expired.
"""
import time
import json
from django.http import HttpResponse
from .attendance_sync import run_today_attendance_sync
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
        request.jwt_employee_emp_code = None
        request.had_bearer_token = False
        auth_header = request.headers.get('Authorization') or request.META.get('HTTP_AUTHORIZATION')
        if auth_header and auth_header.startswith('Bearer '):
            request.had_bearer_token = True
            token = auth_header[7:].strip()
            payload = decode_token(token)
            if payload:
                if payload.get('type') == 'access' and payload.get('admin_id') is not None:
                    request.jwt_admin_id = int(payload['admin_id'])
                elif payload.get('type') == 'employee_access' and payload.get('emp_code'):
                    request.jwt_employee_emp_code = str(payload['emp_code'])
            if request.had_bearer_token and request.jwt_admin_id is None and request.jwt_employee_emp_code is None:
                if payload and payload.get('type') in ('employee_refresh', 'refresh'):
                    pass  # refresh tokens are used on refresh endpoint only
                elif not payload or payload.get('type') not in ('access', 'employee_access'):
                    return HttpResponse(
                        json.dumps({'error': 'Invalid or expired token', 'code': 'token_invalid'}),
                        status=401,
                        content_type='application/json',
                    )
        return self.get_response(request)


class TodayPunchInSyncMiddleware:
    """Runs every ~3 min: if employee has punch_in for today, set status=Present. After cutoff (11:50), mark no-punch as Absent."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        global _LAST_SYNC
        now = time.time()
        if now - _LAST_SYNC >= _INTERVAL:
            _LAST_SYNC = now
            run_today_attendance_sync(force_absent=False)
        return self.get_response(request)
