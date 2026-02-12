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


def upload_employees_excel(file) -> dict:
    """
    If emp_code does not exist -> create.
    If exists -> update only non-sensitive fields.
    Never create duplicate emp_code.
    """
    df = pd.read_excel(file)
    col_map = map_columns_to_schema(df.columns.tolist(), EMPLOYEE_COLUMN_ALIASES)
    required = ['code', 'name']
    for r in required:
        if r not in col_map:
            return {'success': False, 'error': f'Missing required column for: {r}. Found columns: {list(df.columns)}'}

    created = updated = errors = 0
    for _, row in df.iterrows():
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

        obj, created_flag = Employee.objects.update_or_create(
            emp_code=emp_code,
            defaults={
                'name': name,
                'mobile': mobile,
                'email': email,
                'gender': gender,
                'dept_name': dept,
                'designation': designation,
                'status': status,
                'employment_type': emp_type,
                'salary_type': salary_type,
                'base_salary': base_salary,
            }
        )
        if created_flag:
            created += 1
        else:
            updated += 1

    return {'success': True, 'created': created, 'updated': updated, 'errors': errors}


def upload_attendance_excel(file) -> dict:
    """
    Insert if (emp_code, date) not exists.
    If exists: only update missing punch_out (and recalc total_working_hours, over_time).
    Never delete existing row; never overwrite full row.
    """
    df = pd.read_excel(file)
    col_map = map_columns_to_schema(df.columns.tolist(), ATTENDANCE_COLUMN_ALIASES)
    required = ['emp id', 'date']
    for r in required:
        if r not in col_map:
            return {'success': False, 'error': f'Missing required column: {r}. Found: {list(df.columns)}'}

    inserted = updated = skipped = errors = 0
    for _, row in df.iterrows():
        emp_code = _safe_str(row.get(col_map['emp id'], ''), 50)
        if not emp_code:
            errors += 1
            continue
        att_date = _safe_date(row.get(col_map['date']))
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

        existing = Attendance.objects.filter(emp_code=emp_code, date=att_date).first()
        if existing:
            # Smart update: only fill missing punch_out
            if existing.punch_out is None and punch_out is not None:
                existing.punch_out = punch_out
                existing.total_working_hours = total_working
                existing.total_break = total_break
                existing.over_time = over_time
                if not existing.name and name:
                    existing.name = name
                existing.status = status
                existing.save()
                updated += 1
            else:
                skipped += 1
        else:
            # Insert new row
            if not name:
                emp = Employee.objects.filter(emp_code=emp_code).first()
                name = emp.name if emp else ''
            Attendance.objects.create(
                emp_code=emp_code,
                name=name,
                date=att_date,
                punch_in=punch_in,
                punch_out=punch_out,
                total_working_hours=total_working,
                total_break=total_break,
                status=status,
                over_time=over_time,
            )
            inserted += 1

    return {
        'success': True,
        'inserted': inserted,
        'updated': updated,
        'skipped': skipped,
        'errors': errors,
    }
