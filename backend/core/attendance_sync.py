"""
Today's attendance sync: mark punch-in rows as Present; after cutoff time mark no-punch as Absent
and create Absent rows for active employees with no row. Used by middleware (every ~3 min),
Celery (every 1 hour), and after attendance upload.
"""
from django.utils import timezone
from .models import Attendance, Employee, SystemSetting

_LAST_ABSENT_RUN_DATE = None  # when not force_run, run Absent logic only once per day


def _run_auto_absent(force_run=False):
    """
    After cutoff time (default 11:50 AM): mark today's no-punch rows as Absent and create
    Absent rows for active employees with no row. If force_run=True, run even if already run today.
    """
    global _LAST_ABSENT_RUN_DATE
    try:
        cutoff_val = SystemSetting.objects.filter(key='absent_cutoff_time').values_list('value', flat=True).first()
    except Exception:
        cutoff_val = None
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
    if current_minutes < cutoff_minutes and not force_run:
        return
    if not force_run and _LAST_ABSENT_RUN_DATE == today:
        return
    if not force_run:
        _LAST_ABSENT_RUN_DATE = today
    if today.weekday() == 6:  # Sunday
        return
    Attendance.objects.filter(
        date=today,
        punch_in__isnull=True
    ).exclude(status='Absent').update(status='Absent')
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


def run_today_attendance_sync(force_absent=False):
    """
    Sync today's attendance: (1) Mark rows with punch_in as Present.
    (2) After cutoff time, mark no-punch as Absent and create Absent rows for active employees.
    Call with force_absent=True after attendance upload to recalc immediately.
    """
    today = timezone.localdate()
    Attendance.objects.filter(
        date=today,
        punch_in__isnull=False
    ).exclude(status='Present').update(status='Present')
    _run_auto_absent(force_run=force_absent)
