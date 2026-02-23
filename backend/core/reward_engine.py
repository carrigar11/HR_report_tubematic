"""
Automation: Streak reward, Weekly overtime reward, Absentee red flag.
Uses Holiday model so absentee logic doesn't flag holidays.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import TruncDate

from .models import Attendance, PerformanceReward, Holiday, SystemSetting


def _get_setting(key, default):
    try:
        s = SystemSetting.objects.get(key=key)
        return s.value
    except SystemSetting.DoesNotExist:
        return default


def _is_holiday(d):
    """Treat Sundays as auto holiday; also any date in Holiday table."""
    if d.weekday() == 6:  # Sunday
        return True
    return Holiday.objects.filter(date=d).exists()


def run_streak_reward(target_date=None):
    """Present 4 consecutive days -> REWARD, leaderboard."""
    target_date = target_date or date.today()
    streak_days = int(_get_setting('streak_days', '4'))
    # Consider last N+5 days to find streaks ending near target_date
    start = target_date - timedelta(days=streak_days + 5)
    end = target_date
    att = Attendance.objects.filter(date__gte=start, date__lte=end, status='Present').order_by('emp_code', 'date')
    by_emp = {}
    for a in att:
        if a.emp_code not in by_emp:
            by_emp[a.emp_code] = []
        by_emp[a.emp_code].append(a.date)

    created = 0
    for emp_code, dates in by_emp.items():
        sorted_dates = sorted(set(dates))
        i = 0
        while i <= len(sorted_dates) - streak_days:
            window = sorted_dates[i:i + streak_days]
            if (window[-1] - window[0]).days == streak_days - 1:
                # Consecutive streak
                if not PerformanceReward.objects.filter(
                    emp_code=emp_code,
                    trigger_reason=f'{streak_days} Day Streak',
                    metric_data=f'{streak_days} consecutive present days',
                    created_at__date=target_date,
                ).exists():
                    PerformanceReward.objects.create(
                        emp_code=emp_code,
                        entry_type='REWARD',
                        trigger_reason=f'{streak_days} Day Streak',
                        metric_data=f'{streak_days} consecutive present days',
                        is_on_leaderboard=True,
                    )
                    created += 1
                i += streak_days
            else:
                i += 1
    return created


def run_weekly_overtime_reward(target_date=None):
    """Sum over_time in last 7 days > 6 hours -> REWARD, leaderboard."""
    target_date = target_date or date.today()
    week_start = target_date - timedelta(days=6)
    threshold_hours = float(_get_setting('weekly_overtime_threshold_hours', '6'))
    agg = Attendance.objects.filter(
        date__gte=week_start, date__lte=target_date
    ).values('emp_code').annotate(total_ot=Sum('over_time'))
    created = 0
    for row in agg:
        total_ot = row['total_ot'] or Decimal('0')
        if total_ot >= Decimal(str(threshold_hours)):
            if not PerformanceReward.objects.filter(
                emp_code=row['emp_code'],
                trigger_reason='High Weekly Overtime',
                created_at__date=target_date,
            ).exists():
                PerformanceReward.objects.create(
                    emp_code=row['emp_code'],
                    entry_type='REWARD',
                    trigger_reason='High Weekly Overtime',
                    metric_data=f'{total_ot} hours this week',
                    is_on_leaderboard=True,
                )
                created += 1
    return created


def run_absentee_red_flag(target_date=None):
    """Absent 3 consecutive days (excluding holidays) -> ACTION, Pending, not leaderboard."""
    target_date = target_date or date.today()
    absent_days = int(_get_setting('absent_streak_days', '3'))
    start = target_date - timedelta(days=absent_days + 10)
    # Get all absents in range
    absents = Attendance.objects.filter(
        date__gte=start, date__lte=target_date, status='Absent'
    ).values_list('emp_code', 'date')
    by_emp = {}
    for emp_code, d in absents:
        by_emp.setdefault(emp_code, []).append(d)

    created = 0
    for emp_code, dates in by_emp.items():
        sorted_dates = sorted(set(dates))
        i = 0
        while i <= len(sorted_dates) - absent_days:
            window = sorted_dates[i:i + absent_days]
            if (window[-1] - window[0]).days == absent_days - 1:
                # Consecutive absent streak - check none are holidays
                if all(not _is_holiday(d) for d in window):
                    if not PerformanceReward.objects.filter(
                        emp_code=emp_code,
                        entry_type='ACTION',
                        trigger_reason=f'{absent_days} Days Absent',
                        created_at__date=target_date,
                    ).exists():
                        PerformanceReward.objects.create(
                            emp_code=emp_code,
                            entry_type='ACTION',
                            trigger_reason=f'{absent_days} Days Absent',
                            metric_data=f'{absent_days} consecutive absents',
                            is_on_leaderboard=False,
                            admin_action_status='Pending',
                        )
                        created += 1
                i += absent_days
            else:
                i += 1
    return created


def run_reward_engine(target_date=None):
    """Run all three automations."""
    target_date = target_date or date.today()
    a = run_streak_reward(target_date)
    b = run_weekly_overtime_reward(target_date)
    c = run_absentee_red_flag(target_date)
    return {'streak': a, 'overtime': b, 'absentee': c}
