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

from .models import Employee, Attendance
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


def _calc_overtime(total_working_hours, shift_from, shift_to):
    """
    Overtime = total_working_hours - expected_shift_hours when positive.
    Returns HOURS ONLY (no minutes) - floor of the difference.
    """
    if total_working_hours is None or total_working_hours <= 0:
        return Decimal('0')
    expected = _shift_duration_hours(shift_from, shift_to)
    if expected is None or expected <= 0:
        return Decimal('0')
    ot = total_working_hours - expected
    if ot <= 0:
        return Decimal('0')
    # Hours only, no minutes - use int (floor)
    return Decimal(int(ot))


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


def upload_employees_excel(file, preview=False) -> dict:
    """
    If emp_code does not exist -> create.
    If exists -> update only non-sensitive fields.
    Never create duplicate emp_code.
    If preview=True, returns changes without applying them.
    """
    df = pd.read_excel(file)
    col_map = map_columns_to_schema(df.columns.tolist(), EMPLOYEE_COLUMN_ALIASES)
    required = ['code', 'name']
    for r in required:
        if r not in col_map:
            return {'success': False, 'error': f'Missing required column for: {r}. Found columns: {list(df.columns)}'}

    created = updated = errors = 0
    to_create = []
    to_update = []
    
    # Get existing employees for comparison
    emp_codes = []
    rows_data = []
    for _, row in df.iterrows():
        emp_code = _safe_str(row.get(col_map['code'], ''), 50)
        if emp_code:
            emp_codes.append(emp_code)
        rows_data.append(row)
    
    existing_employees = {}
    if emp_codes:
        for emp in Employee.objects.filter(emp_code__in=emp_codes).values('emp_code', 'name', 'dept_name', 'designation', 'status'):
            existing_employees[emp['emp_code']] = emp
    
    for row in rows_data:
        emp_code = _safe_str(row.get(col_map['code'], ''), 50)
        if not emp_code:
            errors += 1
            continue
        def _cell(k, default=''):
            return row.get(col_map[k], default) if k in col_map else default

        name = _safe_str(_cell('name'), 255)
        mobile = _safe_str(_cell('mobile no'), 20)
        email = _safe_str(_cell('email'), 254)
        gender = _safe_str(_cell('gender'), 20)
        dept = _safe_str(_cell('department name'), 100)
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

        if status not in ('Active', 'Inactive'):
            status = 'Active'
        if emp_type not in ('Full-time', 'Hourly'):
            emp_type = 'Full-time'
        if salary_type not in ('Monthly', 'Hourly'):
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

        if emp_code in existing_employees:
            existing = existing_employees[emp_code]
            # Check if there are actual changes
            has_changes = (
                existing['name'] != name or
                existing.get('dept_name') != dept or
                existing.get('designation') != designation or
                existing.get('status') != status
            )
            if has_changes:
                to_update.append({
                    'emp_code': emp_code,
                    'old': existing,
                    'new': emp_data,
                })
                updated += 1
        else:
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
        Employee.objects.filter(emp_code=update_data['emp_code']).update(**update_data['new'])

    return {'success': True, 'created': created, 'updated': updated, 'errors': errors}


def upload_attendance_excel(file, preview=False) -> dict:
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
    
    existing_attendance = {}
    if emp_dates:
        for att in Attendance.objects.filter(
            emp_code__in=[e[0] for e in emp_dates],
            date__in=[e[1] for e in emp_dates]
        ).values('emp_code', 'date', 'punch_in', 'punch_out', 'status', 'name', 'shift', 'shift_from', 'shift_to', 'over_time'):
            key = (att['emp_code'], att['date'])
            existing_attendance[key] = att
    
    # Get employee names for new records
    emp_codes = list(set([e[0] for e in emp_dates]))
    employee_names = {}
    if emp_codes:
        for emp in Employee.objects.filter(emp_code__in=emp_codes).values('emp_code', 'name'):
            employee_names[emp['emp_code']] = emp['name']

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

        # Auto status: If punched in, mark as Present
        if punch_in or eff_punch_in:
            status = 'Present'
        else:
            status = _safe_str(row.get(col_map.get('status', ''), ''), 20) or 'Absent'
            if status not in ('Present', 'Absent', 'FD', 'Half-Day'):
                status = 'Absent'
        
        punch_spans_next_day = _punch_spans_next_day(eff_punch_in, eff_punch_out)

        att_data = {
            'emp_code': emp_code,
            'date': str(att_date),
            'name': name or employee_names.get(emp_code, ''),
            'punch_in': str(eff_punch_in) if eff_punch_in else None,
            'punch_out': str(eff_punch_out) if eff_punch_out else None,
            'punch_spans_next_day': punch_spans_next_day,
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
                # Recalc overtime if record has shift (total_working from attendance Excel)
                if existing.get('shift_from') and existing.get('shift_to') and total_working and total_working > 0:
                    over_time = _calc_overtime(total_working, existing['shift_from'], existing['shift_to'])
                    att_data['over_time'] = str(over_time)
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
            total_working_hours=data['total_working_hours'],
            total_break=data['total_break'],
            over_time=data['over_time'],
            status=data['status'],
        )

    return {
        'success': True,
        'inserted': inserted,
        'updated': updated,
        'skipped': skipped,
        'errors': errors,
    }


def upload_shift_excel(file, preview=False) -> dict:
    """
    Upload shift-wise attendance (shift, from, to). Matches by Emp Id and Date.
    Updates existing attendance records or creates new ones with shift info.
    Excel columns: Emp Id, Date, Shift, From, To. Connects by emp_code.
    """
    df = pd.read_excel(file)
    col_map = map_columns_to_schema(df.columns.tolist(), SHIFT_COLUMN_ALIASES)
    required = ['emp id', 'date', 'shift']
    for r in required:
        if r not in col_map:
            return {'success': False, 'error': f'Missing required column: {r}. Found: {list(df.columns)}'}

    updated = created = errors = 0
    to_update = []
    to_create = []

    emp_codes = set()
    rows_data = []
    for _, row in df.iterrows():
        emp_code = _safe_str(row.get(col_map['emp id'], ''), 50)
        att_date = _safe_date(row.get(col_map['date']))
        if emp_code and att_date:
            emp_codes.add(emp_code)
        rows_data.append((row, emp_code, att_date))

    existing_attendance = {}
    if rows_data:
        emp_list = [r[1] for r in rows_data if r[1]]
        date_list = [r[2] for r in rows_data if r[2]]
        for att in Attendance.objects.filter(
            emp_code__in=emp_list,
            date__in=date_list
        ).values('emp_code', 'date', 'shift', 'shift_from', 'shift_to', 'name', 'punch_in', 'punch_out', 'total_working_hours'):
            key = (att['emp_code'], att['date'])
            existing_attendance[key] = att

    employee_names = {}
    if emp_codes:
        for emp in Employee.objects.filter(emp_code__in=emp_codes).values('emp_code', 'name'):
            employee_names[emp['emp_code']] = emp['name']

    for row, emp_code, att_date in rows_data:
        if not emp_code or not att_date:
            errors += 1
            continue

        shift = _safe_str(row.get(col_map['shift'], ''), 100)
        shift_from = _safe_time(row.get(col_map.get('shift_from', '')))
        shift_to = _safe_time(row.get(col_map.get('shift_to', '')))
        punch_in = _safe_time(row.get(col_map.get('punch in', '')))
        punch_out = _safe_time(row.get(col_map.get('punch out', '')))

        key = (emp_code, att_date)
        existing = existing_attendance.get(key)

        # Total working hours: from attendance sheet only (existing record). For new records, from shift Excel if present.
        if existing:
            total_working_hours = Decimal(str(existing.get('total_working_hours') or 0))
        else:
            total_working_hours = _parse_working_hours(row.get(col_map.get('total working hours', '')))
            total_working_hours = total_working_hours if total_working_hours is not None else Decimal('0')

        # Overtime = total_working - expected shift hours (hours only, no minutes)
        over_time = _calc_overtime(total_working_hours, shift_from, shift_to) if shift_from and shift_to else Decimal('0')

        eff_punch_in = punch_in or (existing.get('punch_in') if existing else None)
        eff_punch_out = punch_out or (existing.get('punch_out') if existing else None)
        punch_spans_next_day = _punch_spans_next_day(eff_punch_in, eff_punch_out)

        att_data = {
            'emp_code': emp_code,
            'date': str(att_date),
            'name': employee_names.get(emp_code, ''),
            'shift': shift,
            'shift_from': str(shift_from) if shift_from else None,
            'shift_to': str(shift_to) if shift_to else None,
            'total_working_hours': str(total_working_hours),
            'over_time': str(over_time),
            'punch_spans_next_day': punch_spans_next_day,
        }
        if punch_in and punch_out:
            att_data['punch_in'] = str(punch_in)
            att_data['punch_out'] = str(punch_out)
        elif existing:
            att_data['punch_in'] = str(existing['punch_in']) if existing.get('punch_in') else None
            att_data['punch_out'] = str(existing['punch_out']) if existing.get('punch_out') else None

        if existing:
            to_update.append({
                'emp_code': emp_code,
                'date': str(att_date),
                'old': {'shift': existing.get('shift'), 'shift_from': existing.get('shift_from'), 'shift_to': existing.get('shift_to')},
                'new': att_data,
            })
            updated += 1
        else:
            to_create.append(att_data)
            created += 1

    if preview:
        return {
            'success': True,
            'preview': True,
            'created': created,
            'updated': updated,
            'errors': errors,
            'to_create': to_create[:20],
            'to_update': to_update[:20],
            'has_more': len(to_create) > 20 or len(to_update) > 20,
        }

    for att_data in to_create:
        Attendance.objects.create(**att_data)

    for upd in to_update:
        upd_data = upd['new']
        update_kw = {
            'shift': upd_data['shift'],
            'shift_from': upd_data['shift_from'],
            'shift_to': upd_data['shift_to'],
            'total_working_hours': upd_data['total_working_hours'],
            'over_time': upd_data['over_time'],
            'punch_spans_next_day': upd_data.get('punch_spans_next_day', False),
        }
        if upd_data.get('punch_in') is not None:
            update_kw['punch_in'] = upd_data['punch_in']
        if upd_data.get('punch_out') is not None:
            update_kw['punch_out'] = upd_data['punch_out']
        Attendance.objects.filter(
            emp_code=upd['emp_code'],
            date=upd['date']
        ).update(**update_kw)

    return {
        'success': True,
        'created': created,
        'updated': updated,
        'errors': errors,
    }


def upload_force_punch_excel(file, preview=False) -> dict:
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

    existing_attendance = {}
    if emp_dates:
        for att in Attendance.objects.filter(
            emp_code__in=[e[0] for e in emp_dates],
            date__in=[e[1] for e in emp_dates]
        ).values('emp_code', 'date', 'punch_in', 'punch_out', 'shift_from', 'shift_to', 'total_working_hours'):
            key = (att['emp_code'], att['date'])
            existing_attendance[key] = att

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
        if existing.get('shift_from') and existing.get('shift_to') and total_working and total_working > 0:
            over_time = _calc_overtime(total_working, existing['shift_from'], existing['shift_to'])

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

    return {
        'success': True,
        'updated': updated,
        'skipped': skipped,
        'errors': errors,
    }
