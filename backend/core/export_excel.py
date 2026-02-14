"""
Generate payroll-style Excel export for Export Center.
Uses Django ORM. Date filter: month+year, single_date, or date_from/date_to.
previous_day: daily data = yesterday only, Total Salary = current month (1st through yesterday).
"""
from datetime import date, timedelta
from io import BytesIO

from django.db.models import Q, Sum
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

from .models import Employee, Attendance, SalaryAdvance


def _time_to_hours(t):
    if t is None:
        return None
    return t.hour + t.minute / 60.0 + t.second / 3600.0


def _shift_hours(shift_from, shift_to):
    if shift_from is None or shift_to is None:
        return 8.0
    f = _time_to_hours(shift_from)
    t = _time_to_hours(shift_to)
    if f is None or t is None:
        return 8.0
    if t <= f:
        t += 24.0
    return round(t - f, 2)


def _get_date_filter_queryset(date_from=None, date_to=None, single_date=None, month=None, year=None):
    """Return Attendance queryset filtered by the given date options."""
    qs = Attendance.objects.all()
    if single_date:
        qs = qs.filter(date=single_date)
    elif month is not None and year is not None:
        from calendar import monthrange
        _, last_day = monthrange(year, month)
        start = date(year, month, 1)
        end = date(year, month, last_day)
        qs = qs.filter(date__gte=start, date__lte=end)
    elif date_from or date_to:
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
    return qs


def _get_advance_by_emp(month=None, year=None, date_from=None, date_to=None, allowed_emp_codes=None):
    """Return dict emp_code -> total advance (float) for the given period."""
    qs = SalaryAdvance.objects.values('emp_code').annotate(total=Sum('amount'))
    if month is not None and year is not None:
        qs = qs.filter(month=month, year=year)
    elif date_from or date_to:
        from calendar import monthrange
        months_years = set()
        start = date_from or date(2000, 1, 1)
        end = date_to or date(2100, 12, 31)
        d = start.replace(day=1)
        while d <= end:
            months_years.add((d.month, d.year))
            _, last = monthrange(d.year, d.month)
            d = d.replace(day=last) + timedelta(days=1)
        if months_years:
            q = Q()
            for m, y in months_years:
                q = q | Q(month=m, year=y)
            qs = qs.filter(q)
    else:
        return {}
    if allowed_emp_codes is not None:
        qs = qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else qs.none()
    return {r['emp_code']: float(r['total'] or 0) for r in qs}


def build_payroll_rows(employees, attendance_queryset, advance_by_emp=None):
    """Build payroll matrix: one row per employee, date cols = daily earnings (rate × hours). advance_by_emp: dict emp_code -> advance amount."""
    if advance_by_emp is None:
        advance_by_emp = {}
    # (emp_code, date) -> total_working_hours
    att_list = list(attendance_queryset.values('emp_code', 'date', 'total_working_hours'))
    att_map = {}
    dates_set = set()
    for r in att_list:
        key = (r['emp_code'], r['date'])
        h = r.get('total_working_hours')
        att_map[key] = float(h) if h is not None else 0.0
        dates_set.add(r['date'])
    sorted_dates = sorted(dates_set)

    payroll_rows = []
    for emp in employees:
        base = float(emp.base_salary or 0)
        salary_type = (emp.salary_type or 'Monthly').strip() or 'Monthly'
        if salary_type == 'Hourly':
            hourly_rate = base
        else:
            hourly_rate = base / (26 * 8) if base else 0.0
        du = _shift_hours(emp.shift_from, emp.shift_to)
        advance_val = round(advance_by_emp.get(emp.emp_code, 0), 2)

        row = {
            'emp_code': emp.emp_code,
            'name': emp.name or '',
            'pla': 'A',
            'status': emp.status or 'Working',
            'under_work': '',
            'department': emp.dept_name or '',
            'sala': round(hourly_rate, 2),
            'du': du,
            'advance': advance_val,
        }
        day_totals = []
        row_total = 0.0
        for d in sorted_dates:
            hours = att_map.get((emp.emp_code, d), 0.0)
            amount = round(hourly_rate * hours, 2)
            day_totals.append(amount)
            row_total += amount
        row['total'] = round(row_total, 2)
        row['_dates'] = sorted_dates
        row['_day_totals'] = day_totals
        payroll_rows.append(row)

    return sorted_dates, payroll_rows


def write_payroll_sheet(ws, sorted_dates, payroll_rows):
    header_fill = PatternFill(start_color='366092', end_color='366092', fill_type='solid')
    header_font = Font(bold=True, color='FFFFFF')
    headers = ['Emp Code', 'STAFF', 'Pla', 'Status', 'Under Work', 'Department', 'Sala', 'Du']
    for d in sorted_dates:
        headers.append(d.strftime('%d-%m-%y') if hasattr(d, 'strftime') else str(d))
    headers.append('TOTAL')
    headers.append('Advance')

    for col_idx, h in enumerate(headers, 1):
        c = ws.cell(row=1, column=col_idx, value=h)
        c.fill = header_fill
        c.font = header_font

    for row_idx, row in enumerate(payroll_rows, 2):
        ws.cell(row=row_idx, column=1, value=row.get('emp_code'))
        ws.cell(row=row_idx, column=2, value=row.get('name'))
        ws.cell(row=row_idx, column=3, value=row.get('pla'))
        ws.cell(row=row_idx, column=4, value=row.get('status'))
        ws.cell(row=row_idx, column=5, value=row.get('under_work'))
        ws.cell(row=row_idx, column=6, value=row.get('department'))
        ws.cell(row=row_idx, column=7, value=row.get('sala'))
        ws.cell(row=row_idx, column=8, value=row.get('du'))
        for col_idx, day_val in enumerate(row.get('_day_totals', []), 9):
            ws.cell(row=row_idx, column=col_idx, value=day_val)
        ws.cell(row=row_idx, column=9 + len(sorted_dates), value=row.get('total'))
        ws.cell(row=row_idx, column=10 + len(sorted_dates), value=row.get('advance'))

    tot_row = len(payroll_rows) + 2
    ws.cell(row=tot_row, column=1, value='Total').font = Font(bold=True)
    for col_idx in range(2, 9):
        ws.cell(row=tot_row, column=col_idx, value='')
    col_totals = [0.0] * len(sorted_dates)
    grand_total = 0.0
    advance_total = 0.0
    for row in payroll_rows:
        for i, v in enumerate(row.get('_day_totals', [])):
            if i < len(col_totals):
                col_totals[i] += v
        grand_total += row.get('total') or 0
        advance_total += row.get('advance') or 0
    for col_idx, tot in enumerate(col_totals, 9):
        ws.cell(row=tot_row, column=col_idx, value=round(tot, 2)).font = Font(bold=True)
    ws.cell(row=tot_row, column=9 + len(sorted_dates), value=round(grand_total, 2)).font = Font(bold=True)
    ws.cell(row=tot_row, column=10 + len(sorted_dates), value=round(advance_total, 2)).font = Font(bold=True)

    ws.column_dimensions['A'].width = 12
    ws.column_dimensions['B'].width = 20
    for col_idx in range(9, 9 + len(sorted_dates)):
        ws.column_dimensions[get_column_letter(col_idx)].width = 12


def build_plant_report_rows(payroll_rows, sorted_dates, attendance_queryset, month_total_per_dept=None):
    """
    One row per department (PLANT). Columns: Sr No, PLANT, Total Man Hrs, [date cols], Total Worker Present,
    Total Worker Absent, Average Salary, Average Salary/hr, Absenteeism %, Total Salary.
    If month_total_per_dept is provided (dept -> total), use it for Total Salary column; else use sum of date cols.
    """
    att_list = list(attendance_queryset.values('emp_code', 'date', 'total_working_hours', 'status'))
    emp_to_dept = {r['emp_code']: (r.get('department') or '') for r in payroll_rows}
    date_to_idx = {d: i for i, d in enumerate(sorted_dates)}

    # (dept, date) -> total_man_hrs, salary (from payroll), present_count, absent_count
    from collections import defaultdict
    dept_date_man_hrs = defaultdict(float)
    dept_date_salary = defaultdict(float)
    dept_date_present = defaultdict(int)
    dept_date_absent = defaultdict(int)

    for r in att_list:
        dept = emp_to_dept.get(r['emp_code'], '')
        dt = r['date']
        dept_date_man_hrs[(dept, dt)] += float(r.get('total_working_hours') or 0)
        if (r.get('status') or 'Present') == 'Present':
            dept_date_present[(dept, dt)] += 1
        else:
            dept_date_absent[(dept, dt)] += 1

    for row in payroll_rows:
        dept = row.get('department') or ''
        for i, d in enumerate(row.get('_dates', [])):
            amt = row.get('_day_totals', [])[i] if i < len(row.get('_day_totals', [])) else 0
            dept_date_salary[(dept, d)] += amt

    depts = sorted(set(emp_to_dept.values()))
    dept_list = [d for d in depts if d]
    if '' in depts:
        dept_list.append('')

    plant_rows = []
    for sr, dept in enumerate(dept_list, 1):
        total_man_hrs = 0.0
        day_totals = []
        total_salary = 0.0
        total_present = 0
        total_absent = 0
        for d in sorted_dates:
            man_hrs = dept_date_man_hrs.get((dept, d), 0)
            sal = dept_date_salary.get((dept, d), 0)
            total_man_hrs += man_hrs
            day_totals.append(round(sal, 2))
            total_salary += sal
            total_present += dept_date_present.get((dept, d), 0)
            total_absent += dept_date_absent.get((dept, d), 0)

        avg_salary = round(total_salary / total_present, 2) if total_present else 0
        avg_salary_hr = round(total_salary / total_man_hrs, 2) if total_man_hrs else 0
        total_worker = total_present + total_absent
        absenteeism = round(100.0 * total_absent / total_worker, 2) if total_worker else 0
        # Total Salary: whole month when month_total_per_dept provided, else sum of date cols
        if month_total_per_dept is not None:
            total_salary = month_total_per_dept.get(dept, 0)
        day_salary_sum = sum(day_totals)  # for avg_salary (always day-based: salary to give that day / present)
        plant_rows.append({
            'sr': sr,
            'plant': dept if dept else 'No Dept',
            'total_man_hrs': round(total_man_hrs, 2),
            '_day_totals': day_totals,
            'total_salary': round(total_salary, 2),
            'total_present': total_present,
            'total_absent': total_absent,
            'avg_salary': round(day_salary_sum / total_present, 2) if total_present else 0,
            'avg_salary_hr': avg_salary_hr,
            'absenteeism': absenteeism,
        })
    return plant_rows


def write_plant_report_sheet(ws, sorted_dates, plant_rows):
    """Write Plant Report: one row per department with Total Man Hrs, date cols, Present, Absent, Avg Salary, etc."""
    header_fill = PatternFill(start_color='366092', end_color='366092', fill_type='solid')
    header_font = Font(bold=True, color='FFFFFF')
    headers = ['Sr No', 'PLANT', 'Total Man Hrs']
    for d in sorted_dates:
        headers.append(d.strftime('%d-%m-%y') if hasattr(d, 'strftime') else str(d))
    headers.extend(['Total Worker Present', 'Total Worker Absent', 'Average Salary', 'Average Salary/hr', 'Absenteeism %', 'Total Salary'])

    for col_idx, h in enumerate(headers, 1):
        c = ws.cell(row=1, column=col_idx, value=h)
        c.fill = header_fill
        c.font = header_font

    for row_idx, row in enumerate(plant_rows, 2):
        ws.cell(row=row_idx, column=1, value=row['sr'])
        ws.cell(row=row_idx, column=2, value=row['plant'])
        ws.cell(row=row_idx, column=3, value=row['total_man_hrs'])
        for col_idx, v in enumerate(row['_day_totals'], 4):
            ws.cell(row=row_idx, column=col_idx, value=v)
        off = 4 + len(sorted_dates)
        ws.cell(row=row_idx, column=off, value=row['total_present'])
        ws.cell(row=row_idx, column=off + 1, value=row['total_absent'])
        ws.cell(row=row_idx, column=off + 2, value=row['avg_salary'])
        ws.cell(row=row_idx, column=off + 3, value=row['avg_salary_hr'])
        ws.cell(row=row_idx, column=off + 4, value=row['absenteeism'])
        ws.cell(row=row_idx, column=off + 5, value=row['total_salary'])

    # Total row
    tot_row = len(plant_rows) + 2
    ws.cell(row=tot_row, column=1, value='TOTAL SALARY').font = Font(bold=True)
    ws.cell(row=tot_row, column=2, value='')
    tot_man_hrs = sum(r['total_man_hrs'] for r in plant_rows)
    ws.cell(row=tot_row, column=3, value=round(tot_man_hrs, 2)).font = Font(bold=True)
    for col_idx in range(4, 4 + len(sorted_dates)):
        col_tot = sum(r['_day_totals'][col_idx - 4] for r in plant_rows)
        ws.cell(row=tot_row, column=col_idx, value=round(col_tot, 2)).font = Font(bold=True)
    off = 4 + len(sorted_dates)
    ws.cell(row=tot_row, column=off, value=sum(r['total_present'] for r in plant_rows)).font = Font(bold=True)
    ws.cell(row=tot_row, column=off + 1, value=sum(r['total_absent'] for r in plant_rows)).font = Font(bold=True)
    avg_overall = round(sum(r['total_salary'] for r in plant_rows) / sum(r['total_present'] for r in plant_rows), 2) if sum(r['total_present'] for r in plant_rows) else 0
    ws.cell(row=tot_row, column=off + 2, value=avg_overall).font = Font(bold=True)
    tot_sal = sum(r['total_salary'] for r in plant_rows)
    ws.cell(row=tot_row, column=off + 3, value=round(tot_sal / tot_man_hrs, 2) if tot_man_hrs else 0).font = Font(bold=True)
    ws.cell(row=tot_row, column=off + 4, value='').font = Font(bold=True)
    ws.cell(row=tot_row, column=off + 5, value=round(tot_sal, 2)).font = Font(bold=True)

    ws.column_dimensions['A'].width = 8
    ws.column_dimensions['B'].width = 28
    ws.column_dimensions['C'].width = 14
    for col_idx in range(4, 4 + len(sorted_dates)):
        ws.column_dimensions[get_column_letter(col_idx)].width = 12
    for col_idx in range(off, off + 6):
        ws.column_dimensions[get_column_letter(col_idx)].width = 14


def generate_payroll_excel_previous_day(allowed_emp_codes=None):
    """
    Report for previous day only: all daily data (date col, man hrs, present, absent, avg salary, avg/hr, absenteeism)
    for yesterday. Total Salary column = current month (1st through yesterday) for each employee/department.
    allowed_emp_codes: if set, only these employees (dept admin filter).
    """
    today = timezone.localdate()
    yesterday = today - timedelta(days=1)
    month_start = yesterday.replace(day=1)
    att_yesterday = _get_date_filter_queryset(single_date=yesterday)
    att_month = Attendance.objects.filter(date__gte=month_start, date__lte=yesterday)
    if allowed_emp_codes is not None:
        att_yesterday = att_yesterday.filter(emp_code__in=allowed_emp_codes)
        att_month = att_month.filter(emp_code__in=allowed_emp_codes)

    emp_qs = Employee.objects.all().order_by('dept_name', 'emp_code')
    if allowed_emp_codes is not None:
        emp_qs = emp_qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else emp_qs.none()
    employees = list(emp_qs)
    advance_by_emp = _get_advance_by_emp(
        month=yesterday.month, year=yesterday.year,
        allowed_emp_codes=allowed_emp_codes
    )
    sorted_dates, payroll_rows = build_payroll_rows(employees, att_yesterday, advance_by_emp=advance_by_emp)
    _, payroll_month = build_payroll_rows(employees, att_month, advance_by_emp=advance_by_emp)
    emp_to_month_total = {r['emp_code']: r['total'] for r in payroll_month}
    for row in payroll_rows:
        row['total'] = emp_to_month_total.get(row['emp_code'], 0)

    month_total_per_dept = {}
    for row in payroll_rows:
        dept = row.get('department') or ''
        month_total_per_dept[dept] = month_total_per_dept.get(dept, 0) + row['total']

    plant_rows = build_plant_report_rows(
        payroll_rows, sorted_dates, att_yesterday,
        month_total_per_dept=month_total_per_dept
    )
    return _write_payroll_workbook(sorted_dates, payroll_rows, plant_rows)


def _write_payroll_workbook(sorted_dates, payroll_rows, plant_rows):
    """Build workbook with Plant Report, Payroll, and per-dept sheets."""
    wb = Workbook()
    ws_plant = wb.active
    ws_plant.title = 'Plant Report'
    write_plant_report_sheet(ws_plant, sorted_dates, plant_rows)
    ws = wb.create_sheet(title='Payroll')
    write_payroll_sheet(ws, sorted_dates, payroll_rows)
    depts = sorted(set(r.get('department') or '' for r in payroll_rows))
    dept_list = [d for d in depts if d]
    if '' in depts:
        dept_list.append('')
    for dept in dept_list:
        subset = [r for r in payroll_rows if (r.get('department') or '') == dept]
        if not subset:
            continue
        title = (dept if dept else 'No_Dept')[:31]
        title = ''.join(c for c in title if c not in r'\/:*?[]')
        ws_dept = wb.create_sheet(title=title)
        write_payroll_sheet(ws_dept, sorted_dates, subset)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def generate_payroll_excel(date_from=None, date_to=None, single_date=None, month=None, year=None, allowed_emp_codes=None):
    """
    Generate payroll Excel workbook. Returns BytesIO.
    Filter: single_date (one day), or month+year, or date_from/date_to (range), or all if none set.
    allowed_emp_codes: if set, only these employees (dept admin filter).
    """
    att_qs = _get_date_filter_queryset(
        date_from=date_from, date_to=date_to,
        single_date=single_date, month=month, year=year
    )
    if allowed_emp_codes is not None:
        att_qs = att_qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else att_qs.none()
    emp_qs = Employee.objects.all().order_by('dept_name', 'emp_code')
    if allowed_emp_codes is not None:
        emp_qs = emp_qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else emp_qs.none()
    employees = list(emp_qs)
    if single_date:
        advance_by_emp = _get_advance_by_emp(
            month=single_date.month, year=single_date.year,
            allowed_emp_codes=allowed_emp_codes
        )
    elif month is not None and year is not None:
        advance_by_emp = _get_advance_by_emp(
            month=month, year=year,
            allowed_emp_codes=allowed_emp_codes
        )
    else:
        advance_by_emp = _get_advance_by_emp(
            date_from=date_from, date_to=date_to,
            allowed_emp_codes=allowed_emp_codes
        )
    sorted_dates, payroll_rows = build_payroll_rows(employees, att_qs, advance_by_emp=advance_by_emp)
    plant_rows = build_plant_report_rows(payroll_rows, sorted_dates, att_qs)
    return _write_payroll_workbook(sorted_dates, payroll_rows, plant_rows)
