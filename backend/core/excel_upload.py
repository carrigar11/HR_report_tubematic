"""
Excel upload: Employee and Attendance with flexible column mapping.
- Total working hours: taken from attendance Excel only (e.g. "8h", "11h 59m").
- Overtime: when total_working > expected shift hours, OT = difference (hours only, no minutes).
"""
import pandas as pd
import re
from datetime import datetime, date, time, timedelta
from decimal import Decimal
from django.utils import timezone

from .models import Employee, Attendance, Admin
from .utils import (
    normalize_column_name,
    map_columns_to_schema,
    ATTENDANCE_COLUMN_ALIASES,
    EMPLOYEE_COLUMN_ALIASES,
    SHIFT_COLUMN_ALIASES,
)


def _parse_working_hours(val):
    """
    Parse total working hours from Excel: "8h", "8h ", "11h 59m", "8.5", "0h", "-".
    Returns Decimal hours or None if unparseable.
    """
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip()
    if not s or s in ('-', '–', '—'):
        return None
    s = s.lower()
    # "8h" or "8h " -> 8
    m = re.match(r'^(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*m)?', s)
    if m:
        h = Decimal(m.group(1))
        m_mins = m.group(2)
        if m_mins:
            h += Decimal(m_mins) / 60
        return round(h, 2)
    # Plain number "8" or "8.5"
    try:
        return Decimal(s)
    except Exception:
        return None


def _time_to_decimal_hours(t):
    """Convert time to decimal hours (e.g. 09:30 -> 9.5)."""
    if t is None:
        return None
    if isinstance(t, time):
        return t.hour + t.minute / 60 + t.second / 3600
    return None


def _working_hours_from_punch(punch_in, punch_out):
    """
    Calculate working hours between punch_in and punch_out.
    If punch_out < punch_in (e.g. 09:00 to 08:59 next day), assume next day (+24h).
    Returns Decimal hours or None.
    """
    if punch_in is None or punch_out is None:
        return None
    in_h = _time_to_decimal_hours(punch_in)
    out_h = _time_to_decimal_hours(punch_out)
    if in_h is None or out_h is None:
        return None
    diff = out_h - in_h
    if diff < 0:
        diff += 24  # next day
    return Decimal(str(round(diff, 2)))


def _shift_duration_hours(shift_from, shift_to):
    """
    Expected shift duration in hours (e.g. 09:00–08:59 = 23.98h approx 24h).
    If shift_to < shift_from, shift spans to next day.
    """
    if shift_from is None or shift_to is None:
        return None
    from_h = _time_to_decimal_hours(shift_from)
    to_h = _time_to_decimal_hours(shift_to)
    if from_h is None or to_h is None:
        return None
    diff = to_h - from_h
    if diff <= 0:
        diff += 24  # next day (e.g. 09:00 to 08:59)
    return Decimal(str(round(diff, 2)))


def _punch_spans_next_day(punch_in, punch_out):
    """True when punch_out time is before punch_in (next day, e.g. night shift)."""
    if not punch_in or not punch_out:
        return False
    in_h = _time_to_decimal_hours(punch_in)
    out_h = _time_to_decimal_hours(punch_out)
    if in_h is None or out_h is None:
        return False
    return out_h < in_h  # e.g. 22:00 to 06:00


# For hourly employees: normal working hours = 12; over that is OT. Bonus = 1 per 2 OT (in salary_logic / shift_bonus).
HOURLY_NORMAL_WORK_HOURS = Decimal('12')

def _calc_overtime(total_working_hours, shift_from, shift_to):
    """
    Overtime = total_working_hours - expected_shift_hours when positive.
    Returns HOURS ONLY (no minutes) - floor of the difference.
    Used for non-hourly (Monthly/Fixed) employees.
    """
    if total_working_hours is None or total_working_hours <= 0:
        return Decimal('0')
    expected = _shift_duration_hours(shift_from, shift_to)
    if expected is None or expected <= 0:
        return Decimal('0')
    ot = total_working_hours - expected
    if ot <= 0:
        return Decimal('0')
    return Decimal(int(ot))


def _calc_overtime_for_employee(total_working_hours, shift_from, shift_to, salary_type):
    """
    OT for one day. Hourly: normal = 12h, OT = max(0, twh - 12) (whole hours).
    Otherwise: OT = twh - expected_shift_hours (shift-based).
    """
    if total_working_hours is None or total_working_hours <= 0:
        return Decimal('0')
    st = (salary_type or '').strip()
    if st == 'Hourly':
        ot = total_working_hours - HOURLY_NORMAL_WORK_HOURS
        if ot <= 0:
            return Decimal('0')
        return Decimal(int(ot))
    return _calc_overtime(total_working_hours, shift_from, shift_to)


def _safe_decimal(val, default=Decimal('0')):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return default
    s = str(val).strip()
    if s in ('', '-', '–', '—'):
        return default
    try:
        return Decimal(s)
    except Exception:
        return default


def _safe_time(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, time):
        return val
    if isinstance(val, datetime):
        return val.time()
    s = str(val).strip()
    if not s or s in ('-', '–', '—'):
        return None
    for fmt in ('%H:%M:%S', '%H:%M', '%I:%M %p', '%I:%M%p'):
        try:
            return datetime.strptime(s, fmt).time()
        except ValueError:
            continue
    return None


def _safe_date(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()
    try:
        # Handle DD-MM-YYYY and other formats (dayfirst for Indian format)
        return pd.to_datetime(val, dayfirst=True).date()
    except Exception:
        return None


def _safe_str(val, max_len=255):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ''
    s = str(val).strip()[:max_len]
    return s if s else ''


# Default password for new department admins (same as seed admin@gmail.com)
DEFAULT_DEPT_ADMIN_PASSWORD = '123456789'

# Department admin access: full except Manage Admins and Settings (same as create_dept_admins)
DEPT_ADMIN_ACCESS = {
    'dashboard': True,
    'attendance': True,
    'salary': True,
    'leaderboard': True,
    'export': True,
    'adjustment': True,
    'upload': True,
    'employees': True,
    'bonus': True,
    'penalty': True,
    'absentee_alert': True,
    'holidays': True,
    'settings': False,
    'manage_admins': False,
}


def _slugify_dept(s):
    """Safe email local part from department name."""
    s = (s or '').strip().lower()
    s = re.sub(r'[^a-z0-9]+', '_', s)
    s = s.strip('_') or 'dept'
    return s[:50]


def ensure_admins_for_departments(dept_names, password=None):
    """
    For each department name that does not yet have an admin, create one.
    Email: admin_{slug}@dept.hr, same access as create_dept_admins.
    Returns list of created admin emails.
    """
    password = password or DEFAULT_DEPT_ADMIN_PASSWORD
    created_emails = []
    for dept in sorted(set(d for d in dept_names if (d or '').strip())):
        dept = (dept or '').strip()
        if not dept:
            continue
        slug = _slugify_dept(dept)
        email = f'admin_{slug}@dept.hr'
        if Admin.objects.filter(email__iexact=email).exists():
            continue
        Admin.objects.create(
            name=f'Admin - {dept}',
            email=email,
            password=password,
            phone='',
            department=dept,
            role=Admin.ROLE_DEPT,
            access=DEPT_ADMIN_ACCESS,
        )
        created_emails.append(email)
    return created_emails


def _next_available_emp_code(existing_codes, used_in_upload, prefix='UPL'):
    """Return an emp_code not in existing_codes and not in used_in_upload."""
    n = 1
    while True:
        code = f"{prefix}{n}"
        if code not in existing_codes and code not in used_in_upload:
            used_in_upload.add(code)
            return code
        n += 1


def upload_employees_excel(file, preview=False, company_id=None) -> dict:
    """
    Rows may have emp_code or not. New employees are linked to company_id when provided.
    - If emp_code present and exists in company with same name OR same phone -> update.
    - If emp_code present and exists in company but both name and phone differ -> create NEW with generated emp_code.
    - If emp_code present and not in company -> create with that emp_code (or generated if duplicate in upload).
    - If emp_code missing: match by phone in company -> update; else create with generated emp_code.
    Never create duplicate emp_code within company.
    If preview=True, returns changes without applying them.
    When new department names appear in the upload, creates admin logins for them (manage-admins).
    """
    df = pd.read_excel(file)
    col_map = map_columns_to_schema(df.columns.tolist(), EMPLOYEE_COLUMN_ALIASES)
    required = ['name']
    for r in required:
        if r not in col_map:
            return {'success': False, 'error': f'Missing required column for: {r}. Found columns: {list(df.columns)}'}

    created = updated = errors = 0
    to_create = []
    to_update = []
    upload_dept_names = set()  # department names seen in this upload

    # Existing emp_codes in this company (for generating new codes)
    _emp_base = Employee.objects.all()
    if company_id is not None:
        _emp_base = _emp_base.filter(company_id=company_id)
    else:
        _emp_base = _emp_base.filter(company_id__isnull=True)
    all_existing_codes = set(_emp_base.values_list('emp_code', flat=True))
    used_in_upload = set()  # codes we assign in this run (to_create with generated code)

    # Get existing employees in this company by emp_code (include mobile for same-person check)
    emp_codes_from_sheet = []
    rows_data = []
    for _, row in df.iterrows():
        code_col = col_map.get('code')
        emp_code = _safe_str(row.get(code_col, ''), 50) if code_col else ''
        if emp_code:
            emp_codes_from_sheet.append(emp_code)
        rows_data.append(row)

    existing_employees = {}
    if emp_codes_from_sheet:
        _existing_qs = Employee.objects.filter(emp_code__in=emp_codes_from_sheet)
        if company_id is not None:
            _existing_qs = _existing_qs.filter(company_id=company_id)
        else:
            _existing_qs = _existing_qs.filter(company_id__isnull=True)
        for emp in _existing_qs.values('emp_code', 'name', 'mobile', 'dept_name', 'designation', 'status'):
            existing_employees[emp['emp_code']] = emp

    # By phone (company-scoped): for rows without emp_code we can match existing employee by mobile
    existing_by_mobile = {}
    _emp_company = _emp_base.exclude(mobile='').exclude(mobile__isnull=True)
    for emp in _emp_company.values('emp_code', 'name', 'mobile', 'dept_name', 'designation', 'status'):
        mob = (emp.get('mobile') or '').strip()
        if mob:
            existing_by_mobile[mob] = emp

    company_key = company_id
    created_codes_this_upload = set()  # (company_key, emp_code) already in to_create

    for row in rows_data:
        code_col = col_map.get('code')
        emp_code = _safe_str(row.get(code_col, ''), 50) if code_col else ''
        def _cell(k, default=''):
            return row.get(col_map[k], default) if k in col_map else default

        name = _safe_str(_cell('name'), 255)
        mobile = _safe_str(_cell('mobile no'), 20)
        mobile_stripped = (mobile or '').strip()
        email = _safe_str(_cell('email'), 254)
        gender = _safe_str(_cell('gender'), 20)
        dept = _safe_str(_cell('department name'), 100)
        if (dept or '').strip():
            upload_dept_names.add(dept.strip())
        designation = _safe_str(_cell('designation name'), 100)
        status = _safe_str(_cell('status'), 20) or 'Active'
        emp_type = _safe_str(_cell('employment type'), 20) or 'Full-time'
        salary_type = _safe_str(_cell('salary type'), 20) or 'Monthly'
        salary_val = _cell('salary') if 'salary' in col_map else None
        base_salary = None
        if salary_val is not None and not (isinstance(salary_val, float) and pd.isna(salary_val)):
            try:
                base_salary = Decimal(str(salary_val))
            except Exception:
                pass

        valid_statuses = ('Active', 'Inactive', 'Week off', 'Holiday')
        if status not in valid_statuses:
            status = 'Active'
        if emp_type not in ('Full-time', 'Hourly'):
            emp_type = 'Full-time'
        if salary_type not in ('Monthly', 'Hourly', 'Fixed'):
            salary_type = 'Monthly'

        emp_data = {
            'emp_code': emp_code,
            'name': name,
            'mobile': mobile,
            'email': email,
            'gender': gender,
            'dept_name': dept,
            'designation': designation,
            'status': status,
            'employment_type': emp_type,
            'salary_type': salary_type,
            'base_salary': str(base_salary) if base_salary else None,
        }
        if company_id is not None:
            emp_data['company_id'] = company_id

        # ---- Row has no emp_code: match by phone or create new ----
        if not emp_code:
            if mobile_stripped and mobile_stripped in existing_by_mobile:
                existing = existing_by_mobile[mobile_stripped]
                has_changes = (
                    existing.get('dept_name') != dept or
                    existing.get('designation') != designation or
                    existing.get('status') != status or
                    (existing.get('name') or '').strip() != (name or '').strip()
                )
                if has_changes:
                    new_data = {k: v for k, v in emp_data.items() if k != 'company_id'}
                    new_data['emp_code'] = existing['emp_code']  # update by existing emp_code
                    to_update.append({
                        'emp_code': existing['emp_code'],
                        'old': existing,
                        'new': new_data,
                    })
                    updated += 1
            else:
                new_code = _next_available_emp_code(all_existing_codes, used_in_upload)
                emp_data_new = dict(emp_data)
                emp_data_new['emp_code'] = new_code
                all_existing_codes.add(new_code)
                to_create.append(emp_data_new)
                created += 1
            continue

        # ---- Row has emp_code ----
        if emp_code in existing_employees:
            existing = existing_employees[emp_code]
            name_match = (existing.get('name') or '').strip() == (name or '').strip()
            phone_match = bool(mobile_stripped and (existing.get('mobile') or '').strip() == mobile_stripped)
            same_person = name_match or phone_match
            if same_person:
                has_changes = (
                    existing.get('dept_name') != dept or
                    existing.get('designation') != designation or
                    existing.get('status') != status
                )
                if has_changes:
                    new_data = {k: v for k, v in emp_data.items() if k != 'company_id'}
                    to_update.append({
                        'emp_code': emp_code,
                        'old': existing,
                        'new': new_data,
                    })
                    updated += 1
            else:
                # Same emp_code but different name and different phone: create NEW employee with generated emp_code
                new_code = _next_available_emp_code(all_existing_codes, used_in_upload)
                emp_data_new = dict(emp_data)
                emp_data_new['emp_code'] = new_code
                all_existing_codes.add(new_code)
                to_create.append(emp_data_new)
                created += 1
        else:
            # New emp_code for this company: ensure we don't duplicate within same upload
            key = (company_key, emp_code)
            if key in created_codes_this_upload:
                new_code = _next_available_emp_code(all_existing_codes, used_in_upload)
                emp_data = dict(emp_data)
                emp_data['emp_code'] = new_code
                all_existing_codes.add(new_code)
                created_codes_this_upload.add((company_key, new_code))
            else:
                created_codes_this_upload.add(key)
            to_create.append(emp_data)
            created += 1

    if preview:
        return {
            'success': True,
            'preview': True,
            'created': created,
            'updated': updated,
            'errors': errors,
            'to_create': to_create[:20],  # Limit preview size
            'to_update': to_update[:20],
            'has_more': len(to_create) > 20 or len(to_update) > 20,
        }

    # Actually apply changes
    for emp_data in to_create:
        Employee.objects.create(**emp_data)

    for update_data in to_update:
        update_qs = Employee.objects.filter(emp_code=update_data['emp_code'])
        if company_id is not None:
            update_qs = update_qs.filter(company_id=company_id)
        else:
            update_qs = update_qs.filter(company_id__isnull=True)
        update_qs.update(**update_data['new'])

    # New departments from this upload: create admin for each that does not exist (manage-admins)
    created_admins = ensure_admins_for_departments(upload_dept_names)

    return {
        'success': True,
        'created': created,
        'updated': updated,
        'errors': errors,
        'created_admins': created_admins,
    }


def upload_attendance_excel(file, preview=False, company_id=None) -> dict:
    """
    Insert if (emp_code, date) not exists.
    If exists: only update missing punch_out (and recalc total_working_hours, over_time).
    Never delete existing row; never overwrite full row.
    If preview=True, returns changes without applying them.
    """
    df = pd.read_excel(file)
    col_map = map_columns_to_schema(df.columns.tolist(), ATTENDANCE_COLUMN_ALIASES)
    required = ['emp id', 'date']
    for r in required:
        if r not in col_map:
            return {'success': False, 'error': f'Missing required column: {r}. Found: {list(df.columns)}'}

    inserted = updated = skipped = errors = 0
    to_insert = []
    to_update = []
    to_skip = []
    
    # Get existing attendance records and employee names
    emp_dates = []
    rows_data = []
    for _, row in df.iterrows():
        emp_code = _safe_str(row.get(col_map['emp id'], ''), 50)
        att_date = _safe_date(row.get(col_map['date']))
        if emp_code and att_date:
            emp_dates.append((emp_code, att_date))
        rows_data.append((row, emp_code, att_date))

    # If company_id is provided, restrict to employees from that company only
    if company_id is not None and emp_dates:
        emp_codes_all = list(set(e[0] for e in emp_dates))
        emp_codes_allowed = set(
            Employee.objects.filter(company_id=company_id, emp_code__in=emp_codes_all).values_list('emp_code', flat=True)
        )
        # Filter emp_dates and rows_data to only allowed emp_codes
        emp_dates = [(ec, d) for (ec, d) in emp_dates if ec in emp_codes_allowed]
        filtered_rows = []
        for row, ec, d in rows_data:
            if not ec or not d:
                filtered_rows.append((row, ec, d))
            elif ec in emp_codes_allowed:
                filtered_rows.append((row, ec, d))
            else:
                errors += 1
        rows_data = filtered_rows
    
    existing_attendance = {}
    if emp_dates:
        for att in Attendance.objects.filter(
            emp_code__in=[e[0] for e in emp_dates],
            date__in=[e[1] for e in emp_dates]
        ).values('emp_code', 'date', 'punch_in', 'punch_out', 'status', 'name', 'shift', 'shift_from', 'shift_to', 'over_time'):
            key = (att['emp_code'], att['date'])
            existing_attendance[key] = att
    
    # Get employee names, shift and salary_type for records
    emp_codes = list(set([e[0] for e in emp_dates]))
    employee_names = {}
    employee_shifts = {}
    employee_salary_types = {}
    if emp_codes:
        emp_qs = Employee.objects.filter(emp_code__in=emp_codes)
        if company_id is not None:
            emp_qs = emp_qs.filter(company_id=company_id)
        for emp in emp_qs.values(
            'emp_code', 'name', 'shift', 'shift_from', 'shift_to', 'salary_type'
        ):
            employee_names[emp['emp_code']] = emp['name']
            employee_salary_types[emp['emp_code']] = (emp.get('salary_type') or 'Monthly').strip() or 'Monthly'
            if emp.get('shift_from') and emp.get('shift_to'):
                employee_shifts[emp['emp_code']] = {
                    'shift': emp.get('shift', ''),
                    'shift_from': emp['shift_from'],
                    'shift_to': emp['shift_to'],
                }

    for row, emp_code, att_date in rows_data:
        if not emp_code:
            errors += 1
            continue
        if not att_date:
            errors += 1
            continue

        name = _safe_str(row.get(col_map.get('name', ''), ''), 255)
        punch_in = _safe_time(row.get(col_map.get('punch in', '')))
        punch_out = _safe_time(row.get(col_map.get('punch out', '')))
        # If punch_out == punch_in, treat as no punch_out (employee hasn't left yet)
        if punch_in and punch_out and punch_in == punch_out:
            punch_out = None
        # Total working hours: from attendance Excel only (e.g. "8h", "11h 59m")
        total_working = _parse_working_hours(row.get(col_map.get('total working hours', '')))
        if total_working is None:
            total_working = _safe_decimal(row.get(col_map.get('total working hours', '')))
        total_working = total_working or Decimal('0')
        total_break = _safe_decimal(row.get(col_map.get('total break', '')))
        over_time = _safe_decimal(row.get(col_map.get('over_time', ''))) if 'over_time' in col_map else Decimal('0')

        key = (emp_code, att_date)
        existing = existing_attendance.get(key)

        # Resolve punch_in, punch_out: from Excel or existing
        eff_punch_in = punch_in or (existing.get('punch_in') if existing else None)
        eff_punch_out = punch_out or (existing.get('punch_out') if existing else None)
        # Also check existing: if punch_out == punch_in, treat as no punch_out
        if eff_punch_in and eff_punch_out and eff_punch_in == eff_punch_out:
            eff_punch_out = None

        # Auto status: If punched in, mark as Present
        if punch_in or eff_punch_in:
            status = 'Present'
        else:
            status = _safe_str(row.get(col_map.get('status', ''), ''), 20) or 'Absent'
            if status not in ('Present', 'Absent', 'FD', 'Half-Day'):
                status = 'Absent'
        
        punch_spans_next_day = _punch_spans_next_day(eff_punch_in, eff_punch_out)

        # Auto-apply employee shift to attendance record
        emp_shift = employee_shifts.get(emp_code)
        shift_name = ''
        shift_from_val = None
        shift_to_val = None
        if existing and existing.get('shift_from') and existing.get('shift_to'):
            shift_name = existing.get('shift', '')
            shift_from_val = existing['shift_from']
            shift_to_val = existing['shift_to']
        elif emp_shift:
            shift_name = emp_shift['shift']
            shift_from_val = emp_shift['shift_from']
            shift_to_val = emp_shift['shift_to']

        # Calculate OT: Hourly = over 12h is OT; others = over shift duration
        if total_working and total_working > 0:
            salary_type = employee_salary_types.get(emp_code, 'Monthly')
            over_time = _calc_overtime_for_employee(
                total_working, shift_from_val, shift_to_val, salary_type
            )

        att_data = {
            'emp_code': emp_code,
            'date': str(att_date),
            'name': name or employee_names.get(emp_code, ''),
            'punch_in': str(eff_punch_in) if eff_punch_in else None,
            'punch_out': str(eff_punch_out) if eff_punch_out else None,
            'punch_spans_next_day': punch_spans_next_day,
            'shift': shift_name,
            'shift_from': str(shift_from_val) if shift_from_val else None,
            'shift_to': str(shift_to_val) if shift_to_val else None,
            'total_working_hours': str(total_working) if total_working is not None else '0',
            'total_break': str(total_break),
            'status': status,
            'over_time': str(over_time),
        }
        
        if existing:
            # Smart update: fill missing punch_out, or update punch when both provided
            do_update = False
            if punch_in and punch_out:
                do_update = True  # We have new punch data
            elif existing['punch_out'] is None and punch_out is not None:
                do_update = True  # Fill missing punch_out

            if do_update:
                to_update.append({
                    'emp_code': emp_code,
                    'date': str(att_date),
                    'old_punch_out': existing.get('punch_out'),
                    'new_punch_out': str(punch_out),
                    'data': att_data,
                })
                updated += 1
            else:
                to_skip.append({
                    'emp_code': emp_code,
                    'date': str(att_date),
                    'reason': 'Already has punch_out' if existing.get('punch_out') else 'No changes needed',
                })
                skipped += 1
        else:
            to_insert.append(att_data)
            inserted += 1

    if preview:
        return {
            'success': True,
            'preview': True,
            'inserted': inserted,
            'updated': updated,
            'skipped': skipped,
            'errors': errors,
            'to_insert': to_insert[:20],
            'to_update': to_update[:20],
            'to_skip': to_skip[:10],
            'has_more': len(to_insert) > 20 or len(to_update) > 20 or len(to_skip) > 10,
        }

    # Actually apply changes
    for att_data in to_insert:
        Attendance.objects.create(**att_data)

    for update_data in to_update:
        data = update_data['data']
        Attendance.objects.filter(
            emp_code=update_data['emp_code'],
            date=update_data['date']
        ).update(
            punch_in=data.get('punch_in'),
            punch_out=data.get('punch_out') or update_data.get('new_punch_out'),
            punch_spans_next_day=data.get('punch_spans_next_day', False),
            shift=data.get('shift', ''),
            shift_from=data.get('shift_from'),
            shift_to=data.get('shift_to'),
            total_working_hours=data['total_working_hours'],
            total_break=data['total_break'],
            over_time=data['over_time'],
            status=data['status'],
        )

    # Shift OT bonus: >12h in a shift -> 1h bonus per 2h extra (once per emp per date)
    from .shift_bonus import apply_shift_overtime_bonus_for_date
    from .penalty_logic import recalculate_late_penalty_for_date

    def _parse_date(d):
        """Parse date from string YYYY-MM-DD or return as-is if already date."""
        if isinstance(d, date) and not isinstance(d, datetime):
            return d
        if isinstance(d, datetime):
            return d.date()
        if isinstance(d, str):
            try:
                return datetime.strptime(d[:10], '%Y-%m-%d').date()
            except (ValueError, TypeError):
                return None
        return None

    for att_data in to_insert:
        d = _parse_date(att_data['date'])
        if d:
            try:
                apply_shift_overtime_bonus_for_date(att_data['emp_code'], d)
                recalculate_late_penalty_for_date(att_data['emp_code'], d)
            except Exception:
                pass  # don't fail upload if bonus/penalty calc fails
    for update_data in to_update:
        d = _parse_date(update_data['date'])
        if d:
            try:
                apply_shift_overtime_bonus_for_date(update_data['emp_code'], d)
                recalculate_late_penalty_for_date(update_data['emp_code'], d)
            except Exception:
                pass

    return {
        'success': True,
        'inserted': inserted,
        'updated': updated,
        'skipped': skipped,
        'errors': errors,
    }


def upload_shift_excel(file, preview=False, company_id=None) -> dict:
    """
    Upload shift assignment per employee. Shift is assigned to the Employee and
    propagated to ALL their attendance records (past, present, future).
    Excel columns: Emp Id, Shift, From, To (Date is optional, kept for reference).
    If shift changed from old, overwrites old data.
    """
    df = pd.read_excel(file)
    col_map = map_columns_to_schema(df.columns.tolist(), SHIFT_COLUMN_ALIASES)
    required = ['emp id', 'shift']
    for r in required:
        if r not in col_map:
            return {'success': False, 'error': f'Missing required column: {r}. Found: {list(df.columns)}'}

    errors = 0
    # Deduplicate: take the last row per emp_code (latest shift wins)
    emp_shift_map = {}
    for _, row in df.iterrows():
        emp_code = _safe_str(row.get(col_map['emp id'], ''), 50)
        if not emp_code:
            errors += 1
            continue
        shift = _safe_str(row.get(col_map['shift'], ''), 100)
        shift_from = _safe_time(row.get(col_map.get('shift_from', '')))
        shift_to = _safe_time(row.get(col_map.get('shift_to', '')))
        if not shift:
            errors += 1
            continue
        emp_shift_map[emp_code] = {
            'shift': shift,
            'shift_from': shift_from,
            'shift_to': shift_to,
        }

    # Restrict to employees in this company when company_id is provided
    if company_id is not None and emp_shift_map:
        allowed_codes = set(
            Employee.objects.filter(company_id=company_id, emp_code__in=emp_shift_map.keys()).values_list('emp_code', flat=True)
        )
        # Drop emp_codes that do not belong to this company
        for ec in list(emp_shift_map.keys()):
            if ec not in allowed_codes:
                errors += 1
                emp_shift_map.pop(ec, None)

    # Get existing employee shift data for comparison
    existing_employees = {}
    if emp_shift_map:
        emp_qs = Employee.objects.filter(emp_code__in=emp_shift_map.keys())
        if company_id is not None:
            emp_qs = emp_qs.filter(company_id=company_id)
        for emp in emp_qs.values(
            'emp_code', 'name', 'shift', 'shift_from', 'shift_to'
        ):
            existing_employees[emp['emp_code']] = emp

    to_assign = []  # new or changed
    to_skip = []    # same as current
    for emp_code, new_shift in emp_shift_map.items():
        old = existing_employees.get(emp_code)
        if not old:
            to_skip.append({'emp_code': emp_code, 'reason': 'Employee not found in this company'})
            continue
        old_shift = old.get('shift') or ''
        old_from = old.get('shift_from')
        old_to = old.get('shift_to')
        changed = (
            new_shift['shift'] != old_shift or
            new_shift['shift_from'] != old_from or
            new_shift['shift_to'] != old_to
        )
        att_count = Attendance.objects.filter(emp_code=emp_code).count()
        entry = {
            'emp_code': emp_code,
            'name': old.get('name', ''),
            'old_shift': old_shift,
            'old_from': str(old_from) if old_from else None,
            'old_to': str(old_to) if old_to else None,
            'new_shift': new_shift['shift'],
            'new_from': str(new_shift['shift_from']) if new_shift['shift_from'] else None,
            'new_to': str(new_shift['shift_to']) if new_shift['shift_to'] else None,
            'attendance_records': att_count,
            'changed': changed,
        }
        if changed:
            to_assign.append(entry)
        else:
            to_skip.append({'emp_code': emp_code, 'name': old.get('name', ''), 'reason': 'Shift unchanged'})

    if preview:
        return {
            'success': True,
            'preview': True,
            'updated': len(to_assign),
            'skipped': len(to_skip),
            'errors': errors,
            'to_update': to_assign[:20],
            'to_skip': to_skip[:10],
            'has_more': len(to_assign) > 20,
        }

    # Apply: update Employee + propagate to all Attendance + recalc OT
    total_att_updated = 0
    for entry in to_assign:
        emp_code = entry['emp_code']
        new = emp_shift_map[emp_code]
        # 1. Update Employee
        emp_qs = Employee.objects.filter(emp_code=emp_code)
        if company_id is not None:
            emp_qs = emp_qs.filter(company_id=company_id)
        emp_qs.update(
            shift=new['shift'],
            shift_from=new['shift_from'],
            shift_to=new['shift_to'],
        )
        # 2. Propagate to ALL attendance records
        Attendance.objects.filter(emp_code=emp_code).update(
            shift=new['shift'],
            shift_from=new['shift_from'],
            shift_to=new['shift_to'],
        )
        # 3. Recalculate OT for attendance records with total_working_hours > 0
        emp = Employee.objects.filter(emp_code=emp_code).values('salary_type').first()
        salary_type = (emp.get('salary_type') or 'Monthly').strip() if emp else 'Monthly'
        for att in Attendance.objects.filter(
            emp_code=emp_code, total_working_hours__gt=0
        ).only('id', 'total_working_hours', 'over_time'):
            ot = _calc_overtime_for_employee(
                att.total_working_hours, new['shift_from'], new['shift_to'], salary_type
            )
            if ot != att.over_time:
                Attendance.objects.filter(id=att.id).update(over_time=ot)
                total_att_updated += 1

    return {
        'success': True,
        'updated': len(to_assign),
        'skipped': len(to_skip),
        'errors': errors,
        'attendance_updated': total_att_updated,
    }


def upload_force_punch_excel(file, preview=False, company_id=None) -> dict:
    """
    Force overwrite punch_in and punch_out from attendance Excel.
    Matches by Emp Id + Date. Only updates existing records; does not create new ones.
    Updates: punch_in, punch_out, punch_spans_next_day.
    Optional: Total Working Hours from Excel (recalcs overtime if shift exists).
    Excel columns: Emp Id, Date, Punch In, Punch Out, Total Working Hours.
    """
    df = pd.read_excel(file)
    col_map = map_columns_to_schema(df.columns.tolist(), ATTENDANCE_COLUMN_ALIASES)
    required = ['emp id', 'date', 'punch in', 'punch out']
    for r in required:
        if r not in col_map:
            return {'success': False, 'error': f'Missing required column: {r}. Found: {list(df.columns)}'}

    updated = skipped = errors = 0
    to_update = []
    to_skip = []

    emp_dates = []
    rows_data = []
    for _, row in df.iterrows():
        emp_code = _safe_str(row.get(col_map['emp id'], ''), 50)
        att_date = _safe_date(row.get(col_map['date']))
        if emp_code and att_date:
            emp_dates.append((emp_code, att_date))
        rows_data.append((row, emp_code, att_date))

    # Restrict to employees in this company when company_id is provided
    if company_id is not None and emp_dates:
        emp_codes_all = list(set(e[0] for e in emp_dates))
        emp_codes_allowed = set(
            Employee.objects.filter(company_id=company_id, emp_code__in=emp_codes_all).values_list('emp_code', flat=True)
        )
        emp_dates = [(ec, d) for (ec, d) in emp_dates if ec in emp_codes_allowed]
        filtered_rows = []
        for row, ec, d in rows_data:
            if not ec or not d:
                filtered_rows.append((row, ec, d))
            elif ec in emp_codes_allowed:
                filtered_rows.append((row, ec, d))
            else:
                errors += 1
        rows_data = filtered_rows

    existing_attendance = {}
    if emp_dates:
        for att in Attendance.objects.filter(
            emp_code__in=[e[0] for e in emp_dates],
            date__in=[e[1] for e in emp_dates]
        ).values('emp_code', 'date', 'punch_in', 'punch_out', 'shift_from', 'shift_to', 'total_working_hours'):
            key = (att['emp_code'], att['date'])
            existing_attendance[key] = att

    emp_codes_fp = list(set(e[0] for e in emp_dates))
    employee_salary_types_fp = {}
    if emp_codes_fp:
        emp_qs = Employee.objects.filter(emp_code__in=emp_codes_fp)
        if company_id is not None:
            emp_qs = emp_qs.filter(company_id=company_id)
        for e in emp_qs.values('emp_code', 'salary_type'):
            employee_salary_types_fp[e['emp_code']] = (e.get('salary_type') or 'Monthly').strip() or 'Monthly'

    for row, emp_code, att_date in rows_data:
        if not emp_code or not att_date:
            errors += 1
            continue

        punch_in = _safe_time(row.get(col_map['punch in']))
        punch_out = _safe_time(row.get(col_map['punch out']))

        if not punch_in or not punch_out:
            errors += 1
            continue

        key = (emp_code, att_date)
        existing = existing_attendance.get(key)

        if not existing:
            to_skip.append({'emp_code': emp_code, 'date': str(att_date), 'reason': 'Record not found'})
            skipped += 1
            continue

        punch_spans_next_day = _punch_spans_next_day(punch_in, punch_out)

        # Total working hours from Excel if present, else keep existing
        total_working = _parse_working_hours(row.get(col_map.get('total working hours', '')))
        if total_working is None:
            total_working = existing.get('total_working_hours')
            if total_working is not None:
                total_working = Decimal(str(total_working))
            else:
                total_working = Decimal('0')
        over_time = existing.get('over_time') or Decimal('0')
        if total_working and total_working > 0:
            salary_type = employee_salary_types_fp.get(emp_code, 'Monthly')
            over_time = _calc_overtime_for_employee(
                total_working, existing.get('shift_from'), existing.get('shift_to'), salary_type
            )

        to_update.append({
            'emp_code': emp_code,
            'date': str(att_date),
            'old_punch_in': str(existing['punch_in']) if existing.get('punch_in') else None,
            'old_punch_out': str(existing['punch_out']) if existing.get('punch_out') else None,
            'new_punch_in': punch_in,
            'new_punch_out': punch_out,
            'punch_spans_next_day': punch_spans_next_day,
            'total_working_hours': str(total_working),
            'over_time': str(over_time),
        })
        updated += 1

    if preview:
        # Serialize time for JSON response
        preview_list = []
        for u in to_update[:20]:
            p = dict(u)
            p['new_punch_in'] = str(u['new_punch_in']) if u.get('new_punch_in') else None
            p['new_punch_out'] = str(u['new_punch_out']) if u.get('new_punch_out') else None
            preview_list.append(p)
        return {
            'success': True,
            'preview': True,
            'updated': updated,
            'skipped': skipped,
            'errors': errors,
            'to_update': preview_list,
            'has_more': len(to_update) > 20,
        }

    for upd in to_update:
        Attendance.objects.filter(
            emp_code=upd['emp_code'],
            date=upd['date']
        ).update(
            punch_in=upd['new_punch_in'],
            punch_out=upd['new_punch_out'],
            punch_spans_next_day=upd['punch_spans_next_day'],
            total_working_hours=upd['total_working_hours'],
            over_time=upd['over_time'],
        )

    # Shift OT bonus + late penalty
    from .shift_bonus import apply_shift_overtime_bonus_for_date
    from .penalty_logic import recalculate_late_penalty_for_date
    for upd in to_update:
        att_date = date.fromisoformat(upd['date']) if isinstance(upd['date'], str) else upd['date']
        apply_shift_overtime_bonus_for_date(upd['emp_code'], att_date)
        recalculate_late_penalty_for_date(upd['emp_code'], att_date)

    return {
        'success': True,
        'updated': updated,
        'skipped': skipped,
        'errors': errors,
    }
