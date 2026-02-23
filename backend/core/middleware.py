"""
Auto-sync: every few minutes, mark today's punch-in records as Present.
After 11:50 AM (configurable): mark today's no-punch-in records as Absent; create Absent rows for active employees with no row.
JWT: set request.jwt_admin_id from Authorization Bearer token; return 401 if Bearer present but invalid/expired.
"""
import time
import json
from django.utils import timezone
from django.http import HttpResponse
from .models import Attendance, Employee
from .jwt_auth import decode_token

_LAST_SYNC = 0.0
_INTERVAL = 180  # 3 minutes
_LAST_ABSENT_RUN_DATE = None  # date when we last ran auto-absent (once per day after cutoff)


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


def _run_auto_absent_if_after_cutoff():
    """
    After cutoff time (default 11:50 AM), mark today's no-punch rows as Absent and create
    Absent rows for active employees who have no attendance row for today.
    If they punch in later the same day, model save() will set status=Present.
    """
    global _LAST_ABSENT_RUN_DATE
    try:
        from .models import SystemSetting
        cutoff_val = SystemSetting.objects.filter(key='absent_cutoff_time').values_list('value', flat=True).first()
    except Exception:
        cutoff_val = None
    # Default 11:50 AM (HH:MM or H:MM)
    if not cutoff_val or not str(cutoff_val).strip():
        cutoff_val = '11:50'
    parts = str(cutoff_val).strip().split(':')
    try:
        cutoff_hour = int(parts[0])
        cutoff_min = int(parts[1]) if len(parts) > 1 else 0
    except (ValueError, IndexError):
        cutoff_hour, cutoff_min = 11, 50
    now = timezone.now()
    today = timezone.localdate()
    current_minutes = now.hour * 60 + now.minute
    cutoff_minutes = cutoff_hour * 60 + cutoff_min
    if current_minutes < cutoff_minutes:
        return
    if _LAST_ABSENT_RUN_DATE == today:
        return
    _LAST_ABSENT_RUN_DATE = today
    # Skip Sunday (weekly off)
    if today.weekday() == 6:
        return
    # 1) Update existing today rows with no punch_in -> Absent
    Attendance.objects.filter(
        date=today,
        punch_in__isnull=True
    ).exclude(status='Absent').update(status='Absent')
    # 2) Active employees with no row for today -> create Absent row
    existing_emp_codes = set(
        Attendance.objects.filter(date=today).values_list('emp_code', flat=True)
    )
    active_codes = list(
        Employee.objects.filter(status=Employee.STATUS_ACTIVE).values_list('emp_code', flat=True)
    )
    for emp_code in active_codes:
        if emp_code in existing_emp_codes:
            continue
        Attendance.objects.get_or_create(
            emp_code=emp_code,
            date=today,
            defaults={'status': 'Absent', 'name': ''}
        )


class TodayPunchInSyncMiddleware:
    """Runs every ~3 min: if employee has punch_in for today, set status=Present. After cutoff (11:50), mark no-punch as Absent."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        global _LAST_SYNC
        now = time.time()
        if now - _LAST_SYNC >= _INTERVAL:
            _LAST_SYNC = now
            today = timezone.localdate()
            # If they punched in (same day or any time), mark Present
            Attendance.objects.filter(
                date=today,
                punch_in__isnull=False
            ).exclude(status='Present').update(status='Present')
            # After 11:50 AM: mark no-punch as Absent, create Absent rows for active employees
            _run_auto_absent_if_after_cutoff()
        return self.get_response(request)
