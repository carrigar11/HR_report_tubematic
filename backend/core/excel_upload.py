"""
Excel upload: Employee and Attendance with flexible column mapping.
Smart attendance: insert if not exists; update only missing punch_out.
"""
import pandas as pd
from datetime import datetime, date, time
from decimal import Decimal
from django.utils import timezone

from .models import Employee, Attendance
from .utils import (
    normalize_column_name,
    map_columns_to_schema,
    ATTENDANCE_COLUMN_ALIASES,
    EMPLOYEE_COLUMN_ALIASES,
)


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
        ).values('emp_code', 'date', 'punch_in', 'punch_out', 'status', 'name'):
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
        total_working = _safe_decimal(row.get(col_map.get('total working hours', '')))
        total_break = _safe_decimal(row.get(col_map.get('total break', '')))
        status = _safe_str(row.get(col_map.get('status', ''), ''), 20) or 'Present'
        over_time = _safe_decimal(row.get(col_map.get('over_time', ''))) if 'over_time' in col_map else Decimal('0')

        if status not in ('Present', 'Absent', 'FD', 'Half-Day'):
            status = 'Present'

        key = (emp_code, att_date)
        existing = existing_attendance.get(key)
        
        att_data = {
            'emp_code': emp_code,
            'date': str(att_date),
            'name': name or employee_names.get(emp_code, ''),
            'punch_in': str(punch_in) if punch_in else None,
            'punch_out': str(punch_out) if punch_out else None,
            'total_working_hours': str(total_working),
            'total_break': str(total_break),
            'status': status,
            'over_time': str(over_time),
        }
        
        if existing:
            # Smart update: only fill missing punch_out
            if existing['punch_out'] is None and punch_out is not None:
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
        Attendance.objects.filter(
            emp_code=update_data['emp_code'],
            date=update_data['date']
        ).update(
            punch_out=update_data['new_punch_out'],
            total_working_hours=update_data['data']['total_working_hours'],
            total_break=update_data['data']['total_break'],
            over_time=update_data['data']['over_time'],
            status=update_data['data']['status'],
        )

    return {
        'success': True,
        'inserted': inserted,
        'updated': updated,
        'skipped': skipped,
        'errors': errors,
    }
