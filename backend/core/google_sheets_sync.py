"""
Live sync of reports to a Google Sheet. Credentials from .env; sheet ID from DB (SystemSetting key=google_sheet_id).
Sheets: 1=All dates by month, 2=Current year, 3=Plant Report (Previous day), 4=Employees, 5+=one tab per department (Payroll - DeptName).
"""
import os
import logging
from calendar import monthrange
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings as django_settings
from django.db.models import Sum
from django.utils import timezone

from .models import Employee, Attendance, Salary, SalaryAdvance, Penalty, SystemSetting, ShiftOvertimeBonus
from .export_excel import (
    _get_date_filter_queryset,
    _get_advance_by_emp,
    _get_penalty_by_emp,
    build_payroll_rows,
    _add_bonus_to_payroll_rows,
    build_plant_report_rows,
    _shift_hours,
)

logger = logging.getLogger(__name__)

# First 4 sheets are fixed; department payroll is one tab per department (see _build_sheet5_sheets_data).
FIXED_SHEET_NAMES = [
    'All dates by month',
    'Current year',
    'Plant Report (Previous day)',
    'Employees',
]
SHEET_NAMES = FIXED_SHEET_NAMES + ['Department payroll']  # legacy; sync uses FIXED_SHEET_NAMES + dept tabs


def _get_credentials():
    """Build service account credentials from .env (client_email + private_key) or from JSON file path."""
    try:
        from google.oauth2 import service_account
    except ImportError:
        raise ImportError('Install google-api-python-client and google-auth: pip install google-api-python-client google-auth')

    client_email = os.environ.get('GOOGLE_SHEETS_CLIENT_EMAIL', '').strip()
    private_key = os.environ.get('GOOGLE_SHEETS_PRIVATE_KEY', '').strip()
    if private_key:
        private_key = private_key.replace('\\n', '\n')

    if client_email and private_key:
        from google.auth import credentials
        cred_dict = {
            'type': 'service_account',
            'client_email': client_email,
            'private_key': private_key,
            'token_uri': 'https://oauth2.googleapis.com/token',
        }
        return service_account.Credentials.from_service_account_info(cred_dict)

    path = os.environ.get('GOOGLE_SHEETS_CREDENTIALS_PATH') or os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
    if path and os.path.isfile(path):
        return service_account.Credentials.from_service_account_file(path)

    raise ValueError(
        'Set GOOGLE_SHEETS_CLIENT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY in .env, '
        'or GOOGLE_SHEETS_CREDENTIALS_PATH / GOOGLE_APPLICATION_CREDENTIALS to JSON file.'
    )


def get_sheet_id():
    """Sheet ID from SystemSetting (key=google_sheet_id) or from env GOOGLE_SHEET_ID."""
    try:
        obj = SystemSetting.objects.get(key='google_sheet_id')
        if obj.value and obj.value.strip():
            return obj.value.strip()
    except SystemSetting.DoesNotExist:
        pass
    return (os.environ.get('GOOGLE_SHEET_ID') or '').strip()


def _sheets_service():
    """Build Sheets API v4 service."""
    from googleapiclient.discovery import build
    creds = _get_credentials()
    return build('sheets', 'v4', credentials=creds)


def _ensure_sheets_exist(service, spreadsheet_id, sheet_names=None):
    """Ensure spreadsheet has tabs with the given names. Create any that are missing. If sheet_names is None, use FIXED_SHEET_NAMES."""
    names = sheet_names if sheet_names is not None else FIXED_SHEET_NAMES
    if not names:
        return
    try:
        meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    except Exception as e:
        logger.warning('Could not get spreadsheet metadata: %s', e)
        return
    existing = {s['properties']['title'] for s in meta.get('sheets', [])}
    missing = [t for t in names if t not in existing]
    if not missing:
        return
    requests = []
    for title in missing:
        requests.append({'addSheet': {'properties': {'title': title}}})
    body = {'requests': requests}
    try:
        service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body=body).execute()
        logger.info('Created missing sheets: %s', missing)
    except Exception as e:
        logger.warning('Could not add sheets: %s', e)


# ---------- Sheet 1: All dates by year-month, Total Salary = all-time ----------
def _build_sheet1_data():
    """Rows for Sheet 1: columns = Sr No, PLANT, Total Man Hrs, [year-month cols], Present, Absent, Avg Salary, Avg/hr, Absenteeism %, Total Salary (all-time), Bonus hrs, Bonus Rs."""
    att_dates = Attendance.objects.values_list('date', flat=True).distinct()
    if not att_dates:
        return [['Sr No', 'PLANT', 'Total Man Hrs', 'Total Worker Present', 'Total Worker Absent',
                  'Average Salary', 'Average Salary/hr', 'Absenteeism %', 'Total Salary + Bonus (payout)',
                  'Total Bonus (hrs)', 'Total Bonus (Rs)']]

    min_date = min(att_dates)
    max_date = max(att_dates)
    # Include all months from attendance; also any month with bonus in Salary (oldest to newest)
    year_months_set = set()
    d = min_date.replace(day=1)
    while d <= max_date:
        year_months_set.add((d.year, d.month))
        _, last = monthrange(d.year, d.month)
        d = date(d.year, d.month, last) + timedelta(days=1)
    for (y, m) in Salary.objects.filter(bonus__gt=0).values_list('year', 'month').distinct():
        year_months_set.add((int(y), int(m)))
    year_months = sorted(year_months_set)

    att_all = Attendance.objects.all()
    employees = list(Employee.objects.all().order_by('dept_name', 'emp_code'))
    advance_all = _get_advance_by_emp(date_from=min_date, date_to=max_date)
    penalty_all = _get_penalty_by_emp(date_from=min_date, date_to=max_date)
    att_qs = _get_date_filter_queryset(date_from=min_date, date_to=max_date)
    sorted_dates = sorted(set(att_qs.values_list('date', flat=True)))
    _, payroll_rows = build_payroll_rows(employees, att_qs, advance_by_emp=advance_all, penalty_by_emp=penalty_all)
    _set_bonus_columns_for_sheet1(payroll_rows, year_months)

    # Aggregate by (dept, year, month): man_hrs, salary, present, absent
    att_list = list(att_qs.values('emp_code', 'date', 'total_working_hours', 'status'))
    emp_to_dept = {r['emp_code']: (r.get('department') or '') for r in payroll_rows}
    dept_ym_man_hrs = defaultdict(float)
    dept_ym_salary = defaultdict(float)
    dept_ym_present = defaultdict(int)
    dept_ym_absent = defaultdict(int)
    dept_all_bonus_hrs = defaultdict(float)
    dept_all_bonus_amt = defaultdict(float)
    dept_all_total = defaultdict(float)

    for r in att_list:
        dept = emp_to_dept.get(r['emp_code'], '')
        dt = r['date']
        ym = (dt.year, dt.month)
        dept_ym_man_hrs[(dept, ym)] += float(r.get('total_working_hours') or 0)
        if (r.get('status') or 'Present') == 'Present':
            dept_ym_present[(dept, ym)] += 1
        else:
            dept_ym_absent[(dept, ym)] += 1

    for row in payroll_rows:
        dept = row.get('department') or ''
        dept_all_bonus_hrs[dept] += float(row.get('bonus_hours') or 0)
        dept_all_bonus_amt[dept] += float(row.get('bonus_amount') or 0)
        dept_all_total[dept] += float(row.get('total') or 0)
        for i, d in enumerate(row.get('_dates', [])):
            amt = row.get('_day_totals', [])[i] if i < len(row.get('_day_totals', [])) else 0
            dept_ym_salary[(dept, (d.year, d.month))] += amt

    depts = sorted(set(emp_to_dept.values()))
    dept_list = [d for d in depts if d]
    if '' in depts:
        dept_list.append('')

    headers = ['Sr No', 'PLANT', 'Total Man Hrs']
    for y, m in year_months:
        headers.append(f'{y}-{m:02d}')
    headers.extend([
        'Total Worker Present', 'Total Worker Absent', 'Average Salary', 'Average Salary/hr',
        'Absenteeism %', 'Total Salary + Bonus (payout)', 'Total Bonus (hrs)', 'Total Bonus (Rs)',
    ])
    rows = [headers]
    n_cols = len(year_months)

    for sr, dept in enumerate(dept_list, 1):
        total_man_hrs = 0.0
        month_totals = []
        total_present = 0
        total_absent = 0
        total_salary_by_day = 0.0
        for y, m in year_months:
            man_hrs = dept_ym_man_hrs.get((dept, (y, m)), 0)
            sal = dept_ym_salary.get((dept, (y, m)), 0)
            total_man_hrs += man_hrs
            month_totals.append(round(sal, 2))
            total_salary_by_day += sal
            total_present += dept_ym_present.get((dept, (y, m)), 0)
            total_absent += dept_ym_absent.get((dept, (y, m)), 0)

        total_worker = total_present + total_absent
        avg_salary = round(total_salary_by_day / total_present, 2) if total_present else 0
        avg_salary_hr = round(total_salary_by_day / total_man_hrs, 2) if total_man_hrs else 0
        absenteeism = round(100.0 * total_absent / total_worker, 2) if total_worker else 0
        all_time_salary = round(dept_all_total.get(dept, 0), 2)
        bonus_hrs = round(dept_all_bonus_hrs.get(dept, 0), 2)
        bonus_amt = round(dept_all_bonus_amt.get(dept, 0), 2)

        row = [sr, dept if dept else 'No Dept', round(total_man_hrs, 2)] + month_totals + [
            total_present, total_absent, avg_salary, avg_salary_hr, absenteeism,
            all_time_salary, bonus_hrs, bonus_amt,
        ]
        rows.append(row)

    # Total row
    if len(rows) > 1:
        total_row = ['TOTAL SALARY', '', 0]
        for i in range(n_cols):
            total_row.append(round(sum(r[3 + i] for r in rows[1:] if len(r) > 3 + i), 2))
        total_man_hrs_all = sum(r[2] for r in rows[1:] if len(r) > 2)
        total_row[2] = round(total_man_hrs_all, 2)
        tot_present = sum(r[3 + n_cols] for r in rows[1:] if len(r) > 3 + n_cols)
        tot_absent = sum(r[4 + n_cols] for r in rows[1:] if len(r) > 4 + n_cols)
        # Total Salary column per dept already includes bonus (from dept_all_total). Sum for grand total.
        tot_salary_incl_bonus = sum((r[3 + n_cols + 5] if len(r) > 3 + n_cols + 5 else 0) for r in rows[1:])
        tot_bonus_hrs = sum((r[3 + n_cols + 6] if len(r) > 3 + n_cols + 6 else 0) for r in rows[1:])
        tot_bonus_rs = sum((r[3 + n_cols + 7] if len(r) > 3 + n_cols + 7 else 0) for r in rows[1:])
        total_row.extend([
            tot_present,
            tot_absent,
            round(tot_salary_incl_bonus / max(1, tot_present), 2),
            round(tot_salary_incl_bonus / max(1e-9, total_man_hrs_all), 2),
            round(100.0 * tot_absent / max(1, tot_present + tot_absent), 2),
            round(tot_salary_incl_bonus, 2),  # Total payout = salary + bonus (amount given)
            round(tot_bonus_hrs, 2),
            round(tot_bonus_rs, 2),
        ])
        rows.append(total_row)

    return rows


def _set_bonus_columns_for_sheet1(payroll_rows, year_months):
    """Add bonus_hours and bonus_amount for full date range (all year-months). year_months = list of (year, month)."""
    if not payroll_rows or not year_months:
        return
    emp_codes = [r['emp_code'] for r in payroll_rows]
    salary_type_by_emp = {
        e['emp_code']: (e.get('salary_type') or 'Monthly').strip() or 'Monthly'
        for e in Employee.objects.filter(emp_code__in=emp_codes).values('emp_code', 'salary_type')
    }
    bonus_data = {}
    for (y, m) in year_months:
        for s in Salary.objects.filter(emp_code__in=emp_codes, month=m, year=y).values('emp_code', 'bonus', 'base_salary'):
            key = (s['emp_code'], m, y)
            bonus_data[key] = (float(s.get('bonus') or 0), float(s.get('base_salary') or 0))
    for row in payroll_rows:
        ec = row['emp_code']
        st = salary_type_by_emp.get(ec, 'Monthly')
        total_hrs = 0.0
        total_amt = 0.0
        for (y, m) in year_months:
            bonus_hrs, base = bonus_data.get((ec, m, y), (0.0, 0.0))
            if bonus_hrs <= 0:
                continue
            if st == 'Hourly':
                hourly_rate = base
            elif st == 'Fixed':
                hourly_rate = base / 208.0 if base else 0.0
            else:
                hourly_rate = base / 208.0 if base else 0.0
            total_hrs += bonus_hrs
            total_amt += bonus_hrs * hourly_rate
        row['bonus_hours'] = round(total_hrs, 2)
        row['bonus_amount'] = round(total_amt, 2)
        if total_amt > 0:
            row['total'] = round((row.get('total') or 0) + total_amt, 2)


# ---------- Sheet 2: Current year, Jan–Dec columns, no Absenteeism ----------
def _build_sheet2_data():
    """Current year: one row per plant, cols = Sr No, PLANT, Jan..Dec (salary per month), Average Salary, Average Salary/hr, Total Salary, Total Bonus (hrs), Total Bonus (Rs)."""
    today = timezone.localdate()
    year = today.year
    month_start = date(year, 1, 1)
    month_end = today  # only months that have passed or current

    employees = list(Employee.objects.all().order_by('dept_name', 'emp_code'))
    advance_by_emp = _get_advance_by_emp(month=None, year=None, date_from=month_start, date_to=month_end)
    penalty_by_emp = _get_penalty_by_emp(month=None, year=None, date_from=month_start, date_to=month_end)
    att_qs = _get_date_filter_queryset(date_from=month_start, date_to=month_end)
    sorted_dates = sorted(set(att_qs.values_list('date', flat=True)))
    _, payroll_rows = build_payroll_rows(employees, att_qs, advance_by_emp=advance_by_emp, penalty_by_emp=penalty_by_emp)
    from .export_excel import _set_bonus_columns_for_date_range
    _set_bonus_columns_for_date_range(payroll_rows, sorted_dates, add_bonus_to_total=True)

    month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    att_list = list(att_qs.values('emp_code', 'date', 'total_working_hours', 'status'))
    emp_to_dept = {r['emp_code']: (r.get('department') or '') for r in payroll_rows}
    dept_month_salary = defaultdict(lambda: defaultdict(float))
    dept_month_man_hrs = defaultdict(lambda: defaultdict(float))
    dept_month_present = defaultdict(lambda: defaultdict(int))
    dept_bonus_hrs = defaultdict(float)
    dept_bonus_amt = defaultdict(float)

    for r in att_list:
        dept = emp_to_dept.get(r['emp_code'], '')
        dt = r['date']
        m = dt.month
        dept_month_man_hrs[dept][m] += float(r.get('total_working_hours') or 0)
        if (r.get('status') or 'Present') == 'Present':
            dept_month_present[dept][m] += 1

    for row in payroll_rows:
        dept = row.get('department') or ''
        dept_bonus_hrs[dept] += float(row.get('bonus_hours') or 0)
        dept_bonus_amt[dept] += float(row.get('bonus_amount') or 0)
        for i, d in enumerate(row.get('_dates', [])):
            amt = row.get('_day_totals', [])[i] if i < len(row.get('_day_totals', [])) else 0
            dept_month_salary[dept][d.month] += amt

    depts = sorted(set(emp_to_dept.values()))
    dept_list = [d for d in depts if d]
    if '' in depts:
        dept_list.append('')

    headers = ['Sr No', 'PLANT'] + month_names + [
        'Average Salary', 'Average Salary/hr', 'Total Salary + Bonus (payout)', 'Total Bonus (hrs)', 'Total Bonus (Rs)',
    ]
    rows = [headers]

    for sr, dept in enumerate(dept_list, 1):
        month_vals = []
        total_salary = 0.0
        total_man_hrs = 0.0
        total_present = 0
        for m in range(1, 13):
            sal = dept_month_salary[dept].get(m, 0)
            month_vals.append(round(sal, 2))
            total_salary += sal
            total_man_hrs += dept_month_man_hrs[dept].get(m, 0)
            total_present += dept_month_present[dept].get(m, 0)
        bonus_amt = dept_bonus_amt.get(dept, 0)
        total_payout = total_salary + bonus_amt  # salary + bonus = amount given
        avg_salary = round(total_salary / total_present, 2) if total_present else 0
        avg_salary_hr = round(total_salary / total_man_hrs, 2) if total_man_hrs else 0
        rows.append([
            sr, dept if dept else 'No Dept',
            *month_vals,
            avg_salary, avg_salary_hr, round(total_payout, 2),
            round(dept_bonus_hrs.get(dept, 0), 2), round(bonus_amt, 2),
        ])

    if len(rows) > 1:
        total_row = ['TOTAL SALARY', ''] + [
            round(sum(r[2 + i] for r in rows[1:] if len(r) > 2 + i), 2) for i in range(12)
        ]
        n_plants = len(rows[1:])
        tot_payout = sum((r[16] if len(r) > 16 else 0) for r in rows[1:])  # Total Salary + Bonus column
        tot_man = sum(
            sum(dept_month_man_hrs.get(r[1], {}).values()) for r in rows[1:] if len(r) > 1
        )
        total_row.extend([
            round(tot_payout / max(1, n_plants), 2),
            round(tot_payout / max(1e-9, tot_man), 2) if tot_man else 0,
            round(tot_payout, 2),  # Total payout = salary + bonus for the year
            round(sum((r[17] if len(r) > 17 else 0) for r in rows[1:]), 2),
            round(sum((r[18] if len(r) > 18 else 0) for r in rows[1:]), 2),
        ])
        rows.append(total_row)

    return rows


def _day_bonus_per_dept(single_date):
    """OT bonus (hrs) and (rs) for that day only, by department. Uses ShiftOvertimeBonus."""
    from collections import defaultdict
    emp_codes = list(Employee.objects.values_list('emp_code', flat=True))
    if not emp_codes:
        return {}
    qs = ShiftOvertimeBonus.objects.filter(
        date=single_date, emp_code__in=emp_codes
    ).values('emp_code').annotate(total_hrs=Sum('bonus_hours'))
    emp_bonus_hrs = {r['emp_code']: float(r['total_hrs'] or 0) for r in qs}
    emp_to_dept = {
        e.emp_code: (e.dept_name or '')
        for e in Employee.objects.filter(emp_code__in=emp_codes).only('emp_code', 'dept_name')
    }
    salary_type_by_emp = {
        e['emp_code']: (e.get('salary_type') or 'Monthly').strip() or 'Monthly'
        for e in Employee.objects.filter(emp_code__in=emp_codes).values('emp_code', 'salary_type')
    }
    base_by_emp = {
        e['emp_code']: float(e.get('base_salary') or 0)
        for e in Employee.objects.filter(emp_code__in=emp_codes).values('emp_code', 'base_salary')
    }
    dept_hrs = defaultdict(float)
    dept_amt = defaultdict(float)
    for ec in emp_codes:
        hrs = emp_bonus_hrs.get(ec, 0)
        if hrs <= 0:
            continue
        dept = emp_to_dept.get(ec, '')
        st = salary_type_by_emp.get(ec, 'Monthly')
        base = base_by_emp.get(ec, 0)
        rate = base if st == 'Hourly' else (base / 208.0 if base else 0.0)
        dept_hrs[dept] += hrs
        dept_amt[dept] += round(hrs * rate, 2)
    return {dept: (round(dept_hrs[dept], 2), round(dept_amt[dept], 2)) for dept in dept_hrs}


# ---------- Sheet 3: Plant Report (Previous day) ----------
def _build_sheet3_data():
    """Plant Report for previous day: Average Salary and Average Salary/hr are for that day only; OT bonus (hrs)/(rs) are that day only."""
    today = timezone.localdate()
    yesterday = today - timedelta(days=1)
    month_start = yesterday.replace(day=1)
    att_yesterday = _get_date_filter_queryset(single_date=yesterday)
    att_month = Attendance.objects.filter(date__gte=month_start, date__lte=yesterday)
    employees = list(Employee.objects.all().order_by('dept_name', 'emp_code'))
    advance_by_emp = _get_advance_by_emp(month=yesterday.month, year=yesterday.year)
    penalty_by_emp = _get_penalty_by_emp(month=yesterday.month, year=yesterday.year)
    sorted_dates, payroll_rows = build_payroll_rows(
        employees, att_yesterday, advance_by_emp=advance_by_emp, penalty_by_emp=penalty_by_emp
    )
    _, payroll_month = build_payroll_rows(
        employees, att_month, advance_by_emp=advance_by_emp, penalty_by_emp=penalty_by_emp
    )
    _add_bonus_to_payroll_rows(payroll_month, yesterday.month, yesterday.year)
    emp_to_month_total = {r['emp_code']: r['total'] for r in payroll_month}
    for row in payroll_rows:
        row['total'] = emp_to_month_total.get(row['emp_code'], 0)
    # OT bonus (hrs) and (rs) = that day only (yesterday)
    day_bonus_per_dept = _day_bonus_per_dept(yesterday)
    month_total_per_dept = {}
    for row in payroll_rows:
        dept = row.get('department') or ''
        month_total_per_dept[dept] = month_total_per_dept.get(dept, 0) + row['total']
    plant_rows = build_plant_report_rows(
        payroll_rows, sorted_dates, att_yesterday,
        month_total_per_dept=month_total_per_dept,
        month_bonus_per_dept=day_bonus_per_dept,
    )

    # Override Average Salary and Average Salary/hr to be for previous day only (that day's salary / present, that day's salary / man hrs)
    for row in plant_rows:
        day_salary = (row['_day_totals'][0] if row.get('_day_totals') else 0)
        row['avg_salary'] = round(day_salary / row['total_present'], 2) if row['total_present'] else 0
        row['avg_salary_hr'] = round(day_salary / row['total_man_hrs'], 2) if row['total_man_hrs'] else 0

    # One column for that day's salary (no duplicate E/F); headers: Sr No, PLANT, Total Man Hrs, date, ...
    headers = ['Sr No', 'PLANT', 'Total Man Hrs']
    for d in sorted_dates:
        headers.append(d.strftime('%d-%m-%y'))
    headers.extend([
        'Total Worker Present', 'Total Worker Absent', 'Average Salary', 'Average Salary/hr',
        'Absenteeism %', 'Total Salary', 'OT bonus (hrs)', 'OT bonus (rs)',
    ])
    rows = [headers]
    n_dates = len(sorted_dates)
    for row in plant_rows:
        day_salary = (row['_day_totals'][0] if row.get('_day_totals') else 0)
        # Total Salary column = start of month till report date (month-to-date)
        total_salary_cell = round(float(row.get('total_salary', 0) or 0), 2)
        # OT bonus (hrs)/(rs) must be numeric from bonus data, not row index (sr)
        bonus_hrs = round(float(row.get('total_bonus_hours', 0) or 0), 2)
        bonus_amt = round(float(row.get('total_bonus_amount', 0) or 0), 2)
        r = [
            row['sr'], row['plant'], row['total_man_hrs'],
            *row['_day_totals'],
            row['total_present'], row['total_absent'], row['avg_salary'], row['avg_salary_hr'],
            row['absenteeism'], total_salary_cell, bonus_hrs, bonus_amt,
        ]
        rows.append(r)
    if plant_rows:
        day_salary_total = sum(
            (r['_day_totals'][0] if r.get('_day_totals') else 0) for r in plant_rows
        )
        tot_bonus_amt = sum(float(r.get('total_bonus_amount', 0) or 0) for r in plant_rows)
        tot_salary_mtd = sum(float(r.get('total_salary', 0) or 0) for r in plant_rows)
        tot_present = sum(r['total_present'] for r in plant_rows)
        tot_man_hrs = sum(r['total_man_hrs'] for r in plant_rows)
        tot_row = ['TOTAL SALARY', '', round(tot_man_hrs, 2)]
        for i in range(n_dates):
            tot_row.append(round(sum(
                (r['_day_totals'][i] if i < len(r.get('_day_totals', [])) else 0) for r in plant_rows
            ), 2))
        # Total Salary = month-to-date (start of month till report date)
        total_row_num = 3 + len(plant_rows)
        k_formula = f'=IFERROR(H{total_row_num}/(G{total_row_num}+H{total_row_num})*100,0)'
        # Total OT bonus (hrs) = sum of each department's bonus hours (never use row index/sr)
        tot_bonus_hrs = sum(float(r.get('total_bonus_hours', 0) or 0) for r in plant_rows)
        tot_row.extend([
            tot_present,
            sum(r['total_absent'] for r in plant_rows),
            round(day_salary_total / max(1, tot_present), 2),
            round(day_salary_total / max(1e-9, tot_man_hrs), 2),
            k_formula,  # Absenteeism % column
            round(tot_salary_mtd, 2),  # Total Salary = month-to-date grand total
            round(tot_bonus_hrs, 2),  # Sum of all depts' OT bonus (hrs)
            round(tot_bonus_amt, 2),
        ])
        rows.append(tot_row)
    return rows


# ---------- Sheet 4: All employee data ----------
def _build_sheet4_data():
    """All columns from Employee model."""
    cols = ['emp_code', 'name', 'mobile', 'email', 'gender', 'dept_name', 'designation', 'status',
            'employment_type', 'salary_type', 'base_salary', 'shift', 'shift_from', 'shift_to', 'created_at', 'updated_at']
    rows = [cols]
    for emp in Employee.objects.all().order_by('emp_code'):
        row = []
        for c in cols:
            v = getattr(emp, c, None)
            if v is None:
                row.append('')
            elif hasattr(v, 'isoformat'):
                row.append(v.isoformat() if v else '')
            else:
                row.append(str(v))
        rows.append(row)
    return rows


def _sanitize_sheet_title(name):
    """Google Sheet tab names cannot contain : \\ / ? * [ ]. Max 100 chars."""
    if not name or not str(name).strip():
        return 'No Dept'
    s = str(name).strip()[:100]
    for c in ':\\/*?[]':
        s = s.replace(c, ' ')
    return s.strip() or 'No Dept'


def _sheet_range(sheet_name, start_cell='A1'):
    """Return range string for a sheet (escape single quotes in name for Sheets API). start_cell e.g. 'A1' or 'C2'."""
    escaped = (sheet_name or '').replace("'", "''")
    return f"'{escaped}'!{start_cell}"


# ---------- Sheet 5: One tab per department (from–to, current month), advance, bonus, penalty ----------
def _build_sheet5_sheets_data():
    """One sheet per department. Each sheet: From–To, employee rows with Salary, Bonus (hrs), Bonus (Rs), Penalty, Advance, and a total row."""
    today = timezone.localdate()
    month_start = today.replace(day=1)
    month_end = today
    employees = list(Employee.objects.all().order_by('dept_name', 'emp_code'))
    advance_by_emp = _get_advance_by_emp(month=today.month, year=today.year)
    penalty_by_emp = _get_penalty_by_emp(month=today.month, year=today.year)
    att_qs = _get_date_filter_queryset(date_from=month_start, date_to=month_end)
    _, payroll_rows = build_payroll_rows(
        employees, att_qs, advance_by_emp=advance_by_emp, penalty_by_emp=penalty_by_emp
    )
    _add_bonus_to_payroll_rows(payroll_rows, today.month, today.year)

    from_to_label = f'{month_start.strftime("%d-%m-%Y")} to {month_end.strftime("%d-%m-%Y")}'
    headers = ['From – To', 'Emp Code', 'Name', 'Salary (this period)', 'Total Bonus (hrs)', 'Total Bonus (Rs)', 'Penalty', 'Advance']
    by_dept = defaultdict(list)
    for r in payroll_rows:
        by_dept[r.get('department') or ''].append(r)

    result = []
    for dept in sorted(by_dept.keys(), key=lambda x: (x == '', x)):
        sheet_title = 'Payroll - ' + _sanitize_sheet_title(dept if dept else 'No Dept')
        rows = [headers]
        dept_rows = by_dept[dept]
        tot_salary = 0.0
        tot_bonus_hrs = 0.0
        tot_bonus_rs = 0.0
        tot_penalty = 0.0
        tot_advance = 0.0
        for r in dept_rows:
            sal = round(r.get('total') or 0, 2)
            bh = round(r.get('bonus_hours') or 0, 2)
            br = round(r.get('bonus_amount') or 0, 2)
            pen = round(r.get('penalty') or 0, 2)
            adv = round(r.get('advance') or 0, 2)
            tot_salary += sal
            tot_bonus_hrs += bh
            tot_bonus_rs += br
            tot_penalty += pen
            tot_advance += adv
            rows.append([
                from_to_label,
                r['emp_code'],
                r.get('name', ''),
                sal, bh, br, pen, adv,
            ])
        if dept_rows:
            rows.append([
                'TOTAL', '', '',
                round(tot_salary, 2), round(tot_bonus_hrs, 2), round(tot_bonus_rs, 2),
                round(tot_penalty, 2), round(tot_advance, 2),
            ])
        result.append((sheet_title, rows))
    return result


def _values_to_sheet_format(rows):
    """Ensure all values are strings or numbers for Sheets API."""
    out = []
    for row in rows:
        out_row = []
        for v in row:
            if v is None:
                out_row.append('')
            elif isinstance(v, (Decimal, float)):
                out_row.append(round(float(v), 2) if isinstance(v, float) else round(float(v), 2))
            elif isinstance(v, (date,)):
                out_row.append(v.isoformat())
            else:
                out_row.append(str(v))
        out.append(out_row)
    return out


def sync_all(force_full=False):
    """
    Push all 5 sheets to the configured Google Sheet. If not force_full, Sheet 1 and 2 may be updated
    less often (e.g. only when new month) to reduce API calls; for now we always update all.
    Returns dict with success, message, last_sync.
    """
    spreadsheet_id = get_sheet_id()
    if not spreadsheet_id:
        return {'success': False, 'message': 'Google Sheet ID not set. Set it in Settings or GOOGLE_SHEET_ID in .env.'}

    try:
        service = _sheets_service()
        # Build fixed sheets (1–4) and department payroll (one sheet per dept)
        sheets_data_1_4 = [
            _build_sheet1_data(),
            _build_sheet2_data(),
            _build_sheet3_data(),
            _build_sheet4_data(),
        ]
        sheet5_list = _build_sheet5_sheets_data()  # list of (sheet_name, data)
        all_sheet_names = FIXED_SHEET_NAMES + [name for name, _ in sheet5_list]
        _ensure_sheets_exist(service, spreadsheet_id, all_sheet_names)

        for sheet_name, data in zip(FIXED_SHEET_NAMES, sheets_data_1_4):
            if not data:
                continue
            data = _values_to_sheet_format(data)
            start = 'B2' if sheet_name in ('All dates by month', 'Current year', 'Plant Report (Previous day)') else 'A1'
            range_name = _sheet_range(sheet_name, start)
            body = {'values': data}
            try:
                service.spreadsheets().values().update(
                    spreadsheetId=spreadsheet_id,
                    range=range_name,
                    valueInputOption='USER_ENTERED',
                    body=body,
                ).execute()
                logger.info('Updated sheet "%s" with %s rows', sheet_name, len(data))
            except Exception as sheet_err:
                logger.warning('Update failed for "%s": %s; ensuring sheets and retrying', sheet_name, sheet_err)
                _ensure_sheets_exist(service, spreadsheet_id, all_sheet_names)
                service.spreadsheets().values().update(
                    spreadsheetId=spreadsheet_id,
                    range=range_name,
                    valueInputOption='USER_ENTERED',
                    body=body,
                ).execute()
                logger.info('Updated sheet "%s" with %s rows (after retry)', sheet_name, len(data))

        for sheet_name, data in sheet5_list:
            if not data:
                continue
            data = _values_to_sheet_format(data)
            range_name = _sheet_range(sheet_name)
            body = {'values': data}
            try:
                service.spreadsheets().values().update(
                    spreadsheetId=spreadsheet_id,
                    range=range_name,
                    valueInputOption='USER_ENTERED',
                    body=body,
                ).execute()
                logger.info('Updated sheet "%s" with %s rows', sheet_name, len(data))
            except Exception as sheet_err:
                logger.warning('Update failed for "%s": %s; ensuring sheets and retrying', sheet_name, sheet_err)
                _ensure_sheets_exist(service, spreadsheet_id, all_sheet_names)
                service.spreadsheets().values().update(
                    spreadsheetId=spreadsheet_id,
                    range=range_name,
                    valueInputOption='USER_ENTERED',
                    body=body,
                ).execute()
                logger.info('Updated sheet "%s" with %s rows (after retry)', sheet_name, len(data))

        # Optionally store last_sync in SystemSetting
        try:
            from django.utils.dateformat import format as date_format
            from datetime import datetime
            last_sync = timezone.now().isoformat()
            obj, _ = SystemSetting.objects.get_or_create(key='google_sheet_last_sync', defaults={'value': '', 'description': 'Last Google Sheet sync time'})
            obj.value = last_sync
            obj.save(update_fields=['value'])
        except Exception:
            pass

        return {'success': True, 'message': 'All sheets updated.', 'last_sync': timezone.now().isoformat()}
    except Exception as e:
        logger.exception('Google Sheet sync failed')
        return {'success': False, 'message': str(e), 'last_sync': None}
