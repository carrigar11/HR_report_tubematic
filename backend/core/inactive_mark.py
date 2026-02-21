"""
Auto-mark employees as Inactive if they have not punched in for more than 6 days.
Runs daily from the background sync loop.
"""
import logging
from django.db.models import Max
from django.utils import timezone

from .models import Employee, Attendance, SystemSetting

logger = logging.getLogger(__name__)

INACTIVE_NO_PUNCH_DAYS = 6
LAST_RUN_KEY = 'inactive_mark_last_run'


def mark_inactive_no_punch_6_days():
    """
    Mark as Inactive any employee (currently Active / Week off / Holiday) whose last
    punch_in date is more than 6 days ago, or who has never punched in.
    Runs at most once per day; returns count of employees marked inactive.
    """
    today = timezone.localdate()
    try:
        last_run = SystemSetting.objects.get(key=LAST_RUN_KEY)
        if last_run.value == today.isoformat():
            return 0
    except SystemSetting.DoesNotExist:
        pass

    # Last date each emp_code had a punch_in (any attendance row with punch_in set)
    last_punch = {
        row['emp_code']: row['last']
        for row in Attendance.objects.filter(punch_in__isnull=False)
        .values('emp_code')
        .annotate(last=Max('date'))
    }

    to_inactive = []
    for emp in Employee.objects.filter(status__in=Employee.EMPLOYED_STATUSES):
        last = last_punch.get(emp.emp_code)
        if last is None or (today - last).days > INACTIVE_NO_PUNCH_DAYS:
            to_inactive.append(emp.emp_code)

    if to_inactive:
        updated = Employee.objects.filter(emp_code__in=to_inactive).update(status=Employee.STATUS_INACTIVE)
        logger.info('Marked %s employee(s) Inactive (no punch in > %s days): %s', updated, INACTIVE_NO_PUNCH_DAYS, to_inactive)
    else:
        updated = 0

    SystemSetting.objects.update_or_create(
        key=LAST_RUN_KEY,
        defaults={'value': today.isoformat(), 'description': 'Last run of auto mark-inactive (no punch 6+ days)'},
    )
    return updated
