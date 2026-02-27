from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.db.models import Sum, Count, Q, Max
from django.utils import timezone
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from .models import (
    Admin, Company, CompanyRegistrationRequest, Employee, Attendance, Salary, SalaryAdvance, Adjustment,
    ShiftOvertimeBonus, Penalty, PenaltyInquiry, PerformanceReward, Holiday,
    LeaveRequest, SystemSetting, CompanySetting, PlantReportRecipient, EmailSmtpConfig, AuditLog
)
from .serializers import (
    AdminSerializer, AdminProfileSerializer, AdminUpdateSerializer,
    AdminListSerializer, AdminAccessUpdateSerializer, AdminCreateSerializer,
    CompanySerializer,
    DEFAULT_ACCESS,
    AuditLogSerializer,
    EmployeeSerializer, AttendanceSerializer,
    SalarySerializer, SalaryAdvanceSerializer, AdjustmentSerializer,
    PenaltySerializer,
    PerformanceRewardSerializer, HolidaySerializer, SystemSettingSerializer,
    EmailSmtpConfigSerializer, PlantReportRecipientSerializer,
    AdminLoginSerializer, AttendanceAdjustPayloadSerializer,
)
from .excel_upload import (
    upload_employees_excel,
    upload_attendance_excel,
    upload_shift_excel,
    upload_force_punch_excel,
    build_employee_sample_rows,
    build_attendance_sample_rows,
    build_shift_sample_rows,
    build_force_punch_sample_rows,
)
from .reward_engine import run_reward_engine
from .export_excel import generate_payroll_excel, generate_payroll_excel_previous_day
from .audit_logging import log_activity, log_activity_manual
from .google_sheets_sync import get_sheet_id, sync_all
from .settings_utils import get_company_setting, set_company_setting
from .jwt_auth import encode_access, encode_refresh, encode_access_employee, encode_refresh_employee, decode_token


# ---------- Auth & request admin ----------
def get_request_admin(request):
    """
    Get current admin from JWT (request.jwt_admin_id) or X-Admin-Id header.
    Returns (admin, allowed_emp_codes). JWT takes precedence when present.
    """
    admin_id = getattr(request, 'jwt_admin_id', None)
    if admin_id is None:
        admin_id = request.headers.get('X-Admin-Id', '').strip()
        if admin_id:
            try:
                admin_id = int(admin_id)
            except ValueError:
                admin_id = None
    if not admin_id:
        return None, None
    try:
        admin = Admin.objects.get(pk=admin_id)
    except (ValueError, Admin.DoesNotExist):
        return None, None
    # System owner sees all companies' data; no filter.
    if getattr(admin, 'is_system_owner', False):
        return admin, None
    # When admin is linked to a company, restrict to that company's employees only (even if role is super_admin).
    qs = Employee.objects.all()
    if admin.company_id:
        qs = qs.filter(company_id=admin.company_id)
    if admin.department:
        qs = qs.filter(dept_name=admin.department)
    emp_codes = list(qs.values_list('emp_code', flat=True))
    return admin, emp_codes


def get_request_employee(request):
    """
    Get current employee from JWT (request.jwt_employee_emp_code).
    Returns (emp_code, employee_obj) or (None, None). Only set when EMPLOYEE_LOGIN_ENABLED.
    """
    if not getattr(settings, 'EMPLOYEE_LOGIN_ENABLED', True):
        return None, None
    emp_code = getattr(request, 'jwt_employee_emp_code', None)
    if not emp_code:
        return None, None
    try:
        emp = Employee.objects.get(emp_code=emp_code)
        return emp_code, emp
    except Employee.DoesNotExist:
        return None, None


def _company_registration_recipient_emails():
    """List of email addresses that receive 'Register your company' requests. Configurable via SystemSetting (comma-separated)."""
    raw = None
    try:
        obj = SystemSetting.objects.get(key='company_registration_email')
        if obj.value and str(obj.value).strip():
            raw = str(obj.value).strip()
    except SystemSetting.DoesNotExist:
        pass
    if not raw:
        raw = getattr(settings, 'COMPANY_REGISTRATION_EMAIL', 'deveshgoswami191@gmail.com')
    return [e.strip() for e in raw.split(',') if e.strip()]


@method_decorator(csrf_exempt, name='dispatch')
class ConfigView(APIView):
    """GET: public config e.g. employee_login_enabled (for login page toggle)."""
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response({
            'employee_login_enabled': getattr(settings, 'EMPLOYEE_LOGIN_ENABLED', True),
        })


@method_decorator(csrf_exempt, name='dispatch')
class CompanyRegistrationView(APIView):
    """POST: public 'Register your company' form. Sends email to main admin; stores request in DB."""
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        company_name = (request.data.get('company_name') or '').strip()
        contact_email = (request.data.get('contact_email') or '').strip()
        if not company_name or not contact_email:
            return Response({'error': 'company_name and contact_email required'}, status=400)
        contact_phone = (request.data.get('contact_phone') or '').strip()[:50]
        address = (request.data.get('address') or '').strip()
        extra = {}
        for k, v in request.data.items():
            if k not in ('company_name', 'contact_email', 'contact_phone', 'address') and v not in (None, ''):
                extra[k] = str(v)[:500]
        req = CompanyRegistrationRequest.objects.create(
            company_name=company_name,
            contact_email=contact_email,
            contact_phone=contact_phone,
            address=address,
            extra_data=extra,
        )
        to_emails = _company_registration_recipient_emails()
        lines = [
            f'Company name: {company_name}',
            f'Contact email: {contact_email}',
            f'Contact phone: {contact_phone or "—"}',
            f'Address: {address or "—"}',
        ]
        for k, v in extra.items():
            lines.append(f'{k}: {v}')
        body = '\n'.join(lines)
        subject = f'New company registration request: {company_name}'
        from .email_smtp import send_simple_email
        sent_any = False
        for to_email in to_emails:
            ok, _ = send_simple_email(to_email, subject, body)
            if ok:
                sent_any = True
        if sent_any:
            return Response({'success': True, 'message': 'Request submitted. We will get back to you.', 'email_sent': True})
        return Response({
            'success': True,
            'message': 'Request submitted. We will get back to you.',
            'email_sent': False,
            'email_note': 'Notification email could not be sent. Check System Owner → Settings (SMTP and notification emails). Requests are saved under Company requests.',
        })


@method_decorator(csrf_exempt, name='dispatch')
class AdminLoginView(APIView):
    """JWT login: returns access + refresh tokens and admin profile."""
    def post(self, request):
        ser = AdminLoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        admin = Admin.objects.filter(
            email=ser.validated_data['email'],
            password=ser.validated_data['password']
        ).first()
        if not admin:
            return Response({'success': False, 'message': 'Invalid credentials'}, status=401)
        log_activity_manual(admin, request, 'login', 'auth', details={'email': admin.email})
        data = AdminSerializer(admin).data
        if admin.pk == 1:
            data['role'] = 'super_admin'
            data['access'] = {k: True for k in DEFAULT_ACCESS}
        else:
            data['access'] = {**DEFAULT_ACCESS, **(admin.access or {})}
        access = encode_access(admin.pk)
        refresh = encode_refresh(admin.pk)
        return Response({
            'success': True,
            'admin': data,
            'access': access,
            'refresh': refresh,
            'message': 'Login successful',
        })


@method_decorator(csrf_exempt, name='dispatch')
class AdminRefreshTokenView(APIView):
    """POST { \"refresh\": \"<token>\" } -> { \"access\": \"...\" } or employee access. Accepts admin or employee refresh."""
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        refresh_token = (request.data.get('refresh') or request.data.get('refresh_token') or '').strip()
        if not refresh_token:
            return Response({'error': 'refresh token required'}, status=400)
        payload = decode_token(refresh_token)
        if not payload:
            return Response({'error': 'Invalid or expired refresh token'}, status=401)
        if payload.get('type') == 'refresh':
            admin_id = payload.get('admin_id')
            if admin_id is None:
                return Response({'error': 'Invalid refresh token'}, status=401)
            try:
                Admin.objects.get(pk=admin_id)
            except Admin.DoesNotExist:
                return Response({'error': 'Admin no longer exists'}, status=401)
            access = encode_access(admin_id)
            return Response({'access': access})
        if payload.get('type') == 'employee_refresh' and getattr(settings, 'EMPLOYEE_LOGIN_ENABLED', True):
            emp_code = payload.get('emp_code')
            if not emp_code:
                return Response({'error': 'Invalid refresh token'}, status=401)
            try:
                Employee.objects.get(emp_code=emp_code)
            except Employee.DoesNotExist:
                return Response({'error': 'Employee no longer exists'}, status=401)
            access = encode_access_employee(emp_code)
            return Response({'access': access})
        return Response({'error': 'Invalid or expired refresh token'}, status=401)


def _employee_company_display(emp):
    """Safe company name/code for an employee (handles deleted company)."""
    if not getattr(emp, 'company_id', None):
        return None, None
    try:
        return emp.company.name, emp.company.code
    except Exception:
        return None, None


@method_decorator(csrf_exempt, name='dispatch')
class EmployeeLoginView(APIView):
    """POST { email, password } or { mobile, password }. Login by email OR phone number.
    If one employee matches -> return tokens. If multiple (same person in multiple companies) -> return requires_company_choice and list; frontend calls select-company with emp_code to get tokens."""
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        if not getattr(settings, 'EMPLOYEE_LOGIN_ENABLED', True):
            return Response({'success': False, 'message': 'Employee login is disabled'}, status=403)
        identifier = (request.data.get('email') or request.data.get('mobile') or '').strip()
        password = (request.data.get('password') or '').strip()
        if not identifier or not password:
            return Response({'success': False, 'message': 'Email or phone and password required'}, status=400)
        candidates = list(Employee.objects.filter(
            Q(email__iexact=identifier) | Q(mobile=identifier)
        ).filter(status__in=Employee.EMPLOYED_STATUSES).select_related('company'))
        matching = [e for e in candidates if e.password and e.password == password]
        if not matching:
            return Response({'success': False, 'message': 'Invalid credentials'}, status=401)
        if len(matching) == 1:
            emp = matching[0]
            company_name, company_code = _employee_company_display(emp)
            access = encode_access_employee(emp.emp_code)
            refresh = encode_refresh_employee(emp.emp_code)
            return Response({
                'success': True,
                'employee': {
                    'emp_code': emp.emp_code,
                    'name': emp.name,
                    'dept_name': emp.dept_name or '',
                    'designation': emp.designation or '',
                    'company': company_name,
                    'company_code': company_code,
                },
                'access': access,
                'refresh': refresh,
                'message': 'Login successful',
            })
        # Multiple: same person in multiple companies — ask to select company
        employees = []
        for emp in matching:
            company_name, company_code = _employee_company_display(emp)
            employees.append({
                'emp_code': emp.emp_code,
                'name': emp.name,
                'company_id': emp.company_id,
                'company_name': company_name or '—',
                'company_code': company_code or '—',
            })
        return Response({
            'success': True,
            'requires_company_choice': True,
            'employees': employees,
            'message': 'Select the company to view data for',
        })


@method_decorator(csrf_exempt, name='dispatch')
class EmployeeSelectCompanyView(APIView):
    """POST { email or mobile, password, emp_code }. After login returned requires_company_choice, user picks company; this returns tokens for that emp_code."""
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        if not getattr(settings, 'EMPLOYEE_LOGIN_ENABLED', True):
            return Response({'success': False, 'message': 'Employee login is disabled'}, status=403)
        identifier = (request.data.get('email') or request.data.get('mobile') or '').strip()
        password = (request.data.get('password') or '').strip()
        emp_code = (request.data.get('emp_code') or '').strip()
        if not identifier or not password or not emp_code:
            return Response({'success': False, 'message': 'Email/phone, password and emp_code required'}, status=400)
        emp = Employee.objects.filter(emp_code=emp_code).filter(
            Q(email__iexact=identifier) | Q(mobile=identifier)
        ).filter(status__in=Employee.EMPLOYED_STATUSES).select_related('company').first()
        if not emp or not emp.password or emp.password != password:
            return Response({'success': False, 'message': 'Invalid credentials'}, status=401)
        company_name, company_code = _employee_company_display(emp)
        access = encode_access_employee(emp.emp_code)
        refresh = encode_refresh_employee(emp.emp_code)
        return Response({
            'success': True,
            'employee': {
                'emp_code': emp.emp_code,
                'name': emp.name,
                'dept_name': emp.dept_name or '',
                'designation': emp.designation or '',
                'company': company_name,
                'company_code': company_code,
            },
            'access': access,
            'refresh': refresh,
            'message': 'Login successful',
        })


# ---------- Employee API (all require employee JWT; EMPLOYEE_LOGIN_ENABLED) ----------
def _require_employee(request):
    """Return (emp_code, employee) or (None, None). Response 403 if disabled or not employee."""
    if not getattr(settings, 'EMPLOYEE_LOGIN_ENABLED', True):
        return None, None
    emp_code, emp = get_request_employee(request)
    return emp_code, emp


class EmployeeDashboardView(APIView):
    """GET: stats for logged-in employee: days this month, total hours (month + all-time), bonus hours + Rs."""
    def get(self, request):
        emp_code, emp = _require_employee(request)
        if not emp:
            return Response({'error': 'Not allowed'}, status=403)
        today = timezone.localdate()
        y, m = today.year, today.month
        # Days present this month
        days_this_month = Attendance.objects.filter(emp_code=emp_code, status='Present', date__year=y, date__month=m).count()
        # Total working hours this month
        agg = Attendance.objects.filter(emp_code=emp_code, date__year=y, date__month=m).aggregate(
            tot=Sum('total_working_hours'), ot=Sum('over_time'))
        hours_this_month = float(agg['tot'] or 0) + float(agg['ot'] or 0)
        # All-time total working hours (from joining)
        agg_all = Attendance.objects.filter(emp_code=emp_code).aggregate(tot=Sum('total_working_hours'), ot=Sum('over_time'))
        total_hours_all = float(agg_all['tot'] or 0) + float(agg_all['ot'] or 0)
        # Bonus hours this month + all-time (from Salary.bonus)
        sal_this = Salary.objects.filter(emp_code=emp_code, year=y, month=m).first()
        bonus_hrs_month = float(sal_this.bonus) if sal_this else 0
        bonus_hrs_all = float(Salary.objects.filter(emp_code=emp_code).aggregate(s=Sum('bonus'))['s'] or 0)
        # Bonus in Rs: use base_salary to get hourly rate (monthly/208, hourly=base_salary)
        base = float(emp.base_salary or 0)
        if (emp.salary_type or '').strip().lower() == 'hourly':
            hourly_rate = base
        else:
            hourly_rate = base / 208 if base else 0
        bonus_rs_month = round(bonus_hrs_month * hourly_rate, 2)
        bonus_rs_all = round(bonus_hrs_all * hourly_rate, 2)
        # Today's work hours (for hero display) and punch times (for live counter)
        today_row = Attendance.objects.filter(emp_code=emp_code, date=today).values('punch_in', 'punch_out', 'total_working_hours', 'over_time').first()
        if today_row:
            tot = float(today_row.get('total_working_hours') or 0) + float(today_row.get('over_time') or 0)
            hours_today = tot
            today_punch_in = today_row.get('punch_in')
            today_punch_out = today_row.get('punch_out')
        else:
            hours_today = 0.0
            today_punch_in = None
            today_punch_out = None
        # Daily hours this month (for chart: date -> hours)
        first_day = date(y, m, 1)
        last_day = (first_day.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        daily_qs = Attendance.objects.filter(
            emp_code=emp_code, date__year=y, date__month=m
        ).values('date').annotate(tot=Sum('total_working_hours'), ot=Sum('over_time')).order_by('date')
        daily_map = {}
        for row in daily_qs:
            h = float(row['tot'] or 0) + float(row['ot'] or 0)
            daily_map[str(row['date'])] = round(h, 2)
        daily_hours = []
        for i in range(1, last_day.day + 1):
            d = date(y, m, i)
            key = d.isoformat()
            daily_hours.append({'date': key, 'day': i, 'hours': daily_map.get(key, 0)})
        # Daily status for calendar: date -> status (Present, Absent, Half-Day, FD, etc.)
        status_qs = Attendance.objects.filter(
            emp_code=emp_code, date__year=y, date__month=m
        ).values_list('date', 'status')
        status_map = {str(d): s for d, s in status_qs}
        daily_status = []
        for i in range(1, last_day.day + 1):
            d = date(y, m, i)
            key = d.isoformat()
            daily_status.append({'date': key, 'day': i, 'status': status_map.get(key)})
        # Serialize punch times for live "today's work time" on dashboard (HH:mm or HH:mm:ss)
        def _time_to_str(t):
            if t is None:
                return None
            s = str(t)
            return s[:5] if len(s) >= 5 else s  # "HH:mm"
        return Response({
            'days_this_month': days_this_month,
            'hours_this_month': round(hours_this_month, 2),
            'total_hours_all': round(total_hours_all, 2),
            'bonus_hours_this_month': round(bonus_hrs_month, 2),
            'bonus_hours_all': round(bonus_hrs_all, 2),
            'bonus_rs_this_month': bonus_rs_month,
            'bonus_rs_all': bonus_rs_all,
            'hours_today': round(hours_today, 2),
            'today_punch_in': _time_to_str(today_punch_in),
            'today_punch_out': _time_to_str(today_punch_out),
            'daily_hours': daily_hours,
            'daily_status': daily_status,
        })


class EmployeeAttendanceListView(APIView):
    """GET: list attendance for logged-in employee. Params: month, year."""
    def get(self, request):
        emp_code, emp = _require_employee(request)
        if not emp:
            return Response({'error': 'Not allowed'}, status=403)
        month = request.query_params.get('month', '').strip()
        year = request.query_params.get('year', '').strip()
        if not year:
            year = timezone.localdate().year
        if not month:
            month = timezone.localdate().month
        try:
            y, m = int(year), int(month)
        except ValueError:
            return Response({'error': 'Invalid month/year'}, status=400)
        qs = Attendance.objects.filter(emp_code=emp_code, date__year=y, date__month=m).order_by('-date')
        data = AttendanceSerializer(qs, many=True).data
        return Response(data)


class EmployeeSelfProfileView(APIView):
    """GET: full employee profile (read-only) for logged-in employee."""
    def get(self, request):
        emp_code, emp = _require_employee(request)
        if not emp:
            return Response({'error': 'Not allowed'}, status=403)
        return Response(EmployeeSerializer(emp).data)


class EmployeeSalarySummaryView(APIView):
    """GET: monthly salary summary for logged-in employee. Params: month, year."""
    def get(self, request):
        emp_code, emp = _require_employee(request)
        if not emp:
            return Response({'error': 'Not allowed'}, status=403)
        year = request.query_params.get('year', '').strip()
        month = request.query_params.get('month', '').strip()
        today = timezone.localdate()
        y = int(year) if year else today.year
        m = int(month) if month else today.month
        sal = Salary.objects.filter(emp_code=emp_code, year=y, month=m).first()
        advance = SalaryAdvance.objects.filter(emp_code=emp_code, year=y, month=m).aggregate(s=Sum('amount'))['s'] or Decimal('0')
        penalty = Penalty.objects.filter(emp_code=emp_code, year=y, month=m).aggregate(s=Sum('deduction_amount'))['s'] or Decimal('0')
        base_sal = float(sal.base_salary if sal else (emp.base_salary or 0))
        salary_type = (emp.salary_type or '').strip() or 'Monthly'
        hourly_rate = base_sal / 208 if salary_type.lower() != 'hourly' else base_sal
        bonus_hrs = float(sal.bonus) if sal else 0
        bonus_rs = round(bonus_hrs * hourly_rate, 2)
        if not sal:
            return Response({
                'month': m, 'year': y,
                'salary_type': salary_type,
                'days_present': 0, 'total_working_hours': 0, 'overtime_hours': 0, 'bonus': 0, 'bonus_rs': 0,
                'advance_total': str(advance), 'penalty_total': str(penalty),
                'base_salary': str(emp.base_salary or 0),
                'earned_before_bonus': '0', 'gross_salary': '0', 'amount_to_be_paid': '0',
            })
        total_hrs = float(sal.total_working_hours or 0)
        ot_hrs = float(sal.overtime_hours or 0)
        bonus = float(sal.bonus or 0)
        gross, hr_rate = _gross_and_rate(salary_type, sal.base_salary, total_hrs, ot_hrs, bonus)
        # Earned from hours only (before adding bonus): Hourly = hrs×rate, Monthly/Fixed = base
        if salary_type.strip().lower() == 'hourly':
            earned_before_bonus = Decimal(str(total_hrs)) * Decimal(str(hr_rate))
        else:
            earned_before_bonus = Decimal(str(sal.base_salary or 0))
        amount_to_be_paid = gross - advance - penalty
        return Response({
            'month': m, 'year': y,
            'salary_type': salary_type,
            'days_present': sal.days_present, 'total_working_hours': total_hrs,
            'overtime_hours': ot_hrs, 'bonus': bonus, 'bonus_rs': bonus_rs,
            'advance_total': str(advance), 'penalty_total': str(penalty),
            'base_salary': str(sal.base_salary),
            'earned_before_bonus': str(round(earned_before_bonus, 2)),
            'gross_salary': str(round(gross, 2)),
            'amount_to_be_paid': str(round(amount_to_be_paid, 2)),
        })


class EmployeeLeaveRequestListCreateView(APIView):
    """GET: list my leave requests. POST: create leave request (from_date, to_date, reason)."""
    def get(self, request):
        emp_code, emp = _require_employee(request)
        if not emp:
            return Response({'error': 'Not allowed'}, status=403)
        from .serializers import LeaveRequestSerializer
        qs = LeaveRequest.objects.filter(emp_code=emp_code).order_by('-requested_at')
        return Response(LeaveRequestSerializer(qs, many=True).data)

    def post(self, request):
        emp_code, emp = _require_employee(request)
        if not emp:
            return Response({'error': 'Not allowed'}, status=403)
        from_date = request.data.get('from_date')
        to_date = request.data.get('to_date')
        reason = (request.data.get('reason') or '').strip()
        if not from_date or not to_date:
            return Response({'error': 'from_date and to_date required'}, status=400)
        try:
            fd = date.fromisoformat(str(from_date))
            td = date.fromisoformat(str(to_date))
        except (TypeError, ValueError):
            return Response({'error': 'Invalid date format'}, status=400)
        if fd > td:
            return Response({'error': 'from_date must be before or equal to to_date'}, status=400)
        leave_type = (request.data.get('leave_type') or '').strip() or LeaveRequest.LEAVE_TYPE_CASUAL
        if leave_type not in [c[0] for c in LeaveRequest.LEAVE_TYPE_CHOICES]:
            leave_type = LeaveRequest.LEAVE_TYPE_CASUAL
        obj = LeaveRequest.objects.create(
            emp_code=emp_code,
            leave_type=leave_type,
            from_date=fd,
            to_date=td,
            reason=reason[:2000],
            dept_name=emp.dept_name or '',
            status=LeaveRequest.STATUS_PENDING,
        )
        from .serializers import LeaveRequestSerializer
        return Response(LeaveRequestSerializer(obj).data, status=201)


def _get_leave_allowance(key, default):
    """Get int value from SystemSetting for leave allowance (e.g. casual_allowance_per_year)."""
    try:
        obj = SystemSetting.objects.get(key=key)
        return int(obj.value) if obj.value else default
    except (SystemSetting.DoesNotExist, ValueError):
        return default


class EmployeeLeaveBalanceView(APIView):
    """GET: leave balance by type (casual/sick/earned) and full leave history for logged-in employee."""
    def get(self, request):
        emp_code, emp = _require_employee(request)
        if not emp:
            return Response({'error': 'Not allowed'}, status=403)
        from .serializers import LeaveRequestSerializer
        today = timezone.localdate()
        year = today.year
        # Use employee-specific allowances when set, else system default
        def _emp_allowance(emp_attr, setting_key, default):
            val = getattr(emp, emp_attr, None)
            if val is not None:
                return int(val)
            return _get_leave_allowance(setting_key, default)
        allowances = {
            'casual': _emp_allowance('casual_allowance_per_year', 'casual_allowance_per_year', 12),
            'sick': _emp_allowance('sick_allowance_per_year', 'sick_allowance_per_year', 6),
            'earned': _emp_allowance('earned_allowance_per_year', 'earned_allowance_per_year', 0),
        }
        # Approved days taken this year per leave_type
        taken = {'casual': 0, 'sick': 0, 'earned': 0, 'other': 0}
        qs_approved = LeaveRequest.objects.filter(
            emp_code=emp_code, status=LeaveRequest.STATUS_APPROVED,
            from_date__year=year, to_date__year=year,
        )
        for lr in qs_approved:
            days = (lr.to_date - lr.from_date).days + 1
            lt = lr.leave_type or 'casual'
            taken[lt] = taken.get(lt, 0) + days
        balance = {}
        for lt, allowance in allowances.items():
            balance[lt] = {
                'allowance': allowance,
                'taken': taken.get(lt, 0),
                'balance': max(0, allowance - taken.get(lt, 0)),
            }
        balance['other'] = {'allowance': 0, 'taken': taken.get('other', 0), 'balance': 0}
        history = LeaveRequest.objects.filter(emp_code=emp_code).order_by('-requested_at')
        return Response({
            'balance': balance,
            'history': LeaveRequestSerializer(history, many=True).data,
        })


class EmployeeChangePasswordView(APIView):
    """POST { current_password, new_password }. Change logged-in employee password."""
    def post(self, request):
        emp_code, emp = _require_employee(request)
        if not emp:
            return Response({'error': 'Not allowed'}, status=403)
        current = (request.data.get('current_password') or '').strip()
        new_pw = (request.data.get('new_password') or '').strip()
        if not current:
            return Response({'error': 'Current password is required'}, status=400)
        if not new_pw:
            return Response({'error': 'New password is required'}, status=400)
        if len(new_pw) < 6:
            return Response({'error': 'New password must be at least 6 characters'}, status=400)
        if not emp.password or emp.password != current:
            return Response({'error': 'Current password is incorrect'}, status=400)
        emp.password = new_pw
        emp.save(update_fields=['password'])
        return Response({'message': 'Password updated successfully'})


def _employee_payslip_data(emp_code, emp, y, m):
    """Return dict of salary summary for payslip (same logic as EmployeeSalarySummaryView)."""
    sal = Salary.objects.filter(emp_code=emp_code, year=y, month=m).first()
    advance = SalaryAdvance.objects.filter(emp_code=emp_code, year=y, month=m).aggregate(s=Sum('amount'))['s'] or Decimal('0')
    penalty = Penalty.objects.filter(emp_code=emp_code, year=y, month=m).aggregate(s=Sum('deduction_amount'))['s'] or Decimal('0')
    salary_type = (emp.salary_type or '').strip() or 'Monthly'
    if not sal:
        return {
            'month': m, 'year': y, 'salary_type': salary_type,
            'days_present': 0, 'total_working_hours': 0, 'overtime_hours': 0, 'bonus': 0, 'bonus_rs': 0,
            'advance_total': advance, 'penalty_total': penalty, 'base_salary': emp.base_salary or 0,
            'earned_before_bonus': 0, 'gross_salary': 0, 'amount_to_be_paid': 0,
        }
    total_hrs = float(sal.total_working_hours or 0)
    ot_hrs = float(sal.overtime_hours or 0)
    bonus = float(sal.bonus or 0)
    gross, _ = _gross_and_rate(salary_type, sal.base_salary, total_hrs, ot_hrs, bonus)
    if salary_type.strip().lower() == 'hourly':
        earned_before_bonus = Decimal(str(total_hrs)) * Decimal(str(sal.base_salary or 0))
    else:
        earned_before_bonus = Decimal(str(sal.base_salary or 0))
    amount_to_be_paid = gross - advance - penalty
    base_sal = float(sal.base_salary or 0)
    hourly_rate = base_sal / 208 if salary_type.lower() != 'hourly' else base_sal
    bonus_rs = round(float(sal.bonus or 0) * hourly_rate, 2)
    return {
        'month': m, 'year': y, 'salary_type': salary_type,
        'days_present': sal.days_present, 'total_working_hours': total_hrs, 'overtime_hours': ot_hrs,
        'bonus': bonus, 'bonus_rs': bonus_rs, 'advance_total': advance, 'penalty_total': penalty,
        'base_salary': sal.base_salary, 'earned_before_bonus': earned_before_bonus,
        'gross_salary': round(gross, 2), 'amount_to_be_paid': round(amount_to_be_paid, 2),
    }


class EmployeePayslipPDFView(APIView):
    """GET: download payslip PDF for logged-in employee. Params: month, year."""
    def get(self, request):
        emp_code, emp = _require_employee(request)
        if not emp:
            return Response({'error': 'Not allowed'}, status=403)
        year = request.query_params.get('year', '').strip()
        month = request.query_params.get('month', '').strip()
        today = timezone.localdate()
        y = int(year) if year else today.year
        m = int(month) if month else today.month
        data = _employee_payslip_data(emp_code, emp, y, m)
        from django.http import HttpResponse
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
        import io
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=20*mm, leftMargin=20*mm, topMargin=15*mm, bottomMargin=15*mm)
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=16, spaceAfter=6)
        normal = styles['Normal']
        company_name = emp.company.name if emp.company_id else 'Company'
        month_name = date(y, m, 1).strftime('%B %Y')
        story = [
            Paragraph('Payslip', title_style),
            Paragraph(company_name, normal),
            Spacer(1, 8*mm),
            Paragraph(f'<b>Employee:</b> {emp.name or emp_code}', normal),
            Paragraph(f'<b>Code:</b> {emp_code} &nbsp; <b>Period:</b> {month_name}', normal),
            Spacer(1, 6*mm),
        ]
        # Use "Rs" instead of rupee symbol so PDF font (Helvetica) renders correctly
        def _amt(v):
            return f"Rs {float(v):.2f}"
        rows = [
            ['Earned (from hours)', _amt(data.get('earned_before_bonus', 0))],
            ['Bonus (Rs)', _amt(data.get('bonus_rs', 0))],
            ['Gross salary', _amt(data.get('gross_salary', 0))],
            ['Advance (deduction)', '- ' + _amt(data.get('advance_total', 0))],
            ['Penalty (deduction)', '- ' + _amt(data.get('penalty_total', 0))],
        ]
        t = Table(rows, colWidths=[100*mm, 50*mm])
        t.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('LINEABOVE', (0, 0), (-1, 0), 0.5, colors.grey),
            ('LINEBELOW', (0, -1), (-1, -1), 1, colors.black),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ]))
        story.append(t)
        story.append(Spacer(1, 4*mm))
        story.append(Paragraph(f'<b>Amount to be paid (final):</b> Rs {float(data.get("amount_to_be_paid", 0)):.2f}', normal))
        doc.build(story)
        buf.seek(0)
        response = HttpResponse(buf.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="payslip_{emp_code}_{y}_{m:02d}.pdf"'
        return response


class EmployeeMyRewardsView(APIView):
    """GET: my rewards list and optional rank for logged-in employee (read-only)."""
    def get(self, request):
        emp_code, emp = _require_employee(request)
        if not emp:
            return Response({'error': 'Not allowed'}, status=403)
        rewards = PerformanceReward.objects.filter(emp_code=emp_code).order_by('-created_at')[:50]
        reward_list = list(rewards.values('id', 'emp_code', 'entry_type', 'trigger_reason', 'metric_data', 'is_on_leaderboard', 'admin_action_status', 'created_at'))
        for r in reward_list:
            r['created_at'] = r['created_at'].isoformat() if hasattr(r['created_at'], 'isoformat') else str(r['created_at'])
        today = timezone.localdate()
        year, month = today.year, today.month
        from calendar import monthrange
        _, last_day = monthrange(year, month)
        month_start = date(year, month, 1)
        month_end = date(year, month, last_day)
        rewards_this_month = PerformanceReward.objects.filter(
            is_on_leaderboard=True, entry_type='REWARD',
            created_at__date__gte=month_start, created_at__date__lte=month_end,
        ).order_by('-created_at').values_list('emp_code', flat=True)
        seen = set()
        rank_list = []
        for ec in rewards_this_month:
            if ec not in seen:
                seen.add(ec)
                rank_list.append(ec)
        my_rank = None
        if emp_code in rank_list:
            my_rank = rank_list.index(emp_code) + 1
        return Response({
            'rewards': reward_list,
            'my_rank_this_month': my_rank,
            'total_on_leaderboard_this_month': len(rank_list),
        })


class EmployeePenaltyListView(APIView):
    """GET: list penalties for logged-in employee. Params: month, year. Returns list + total_fine_month."""
    def get(self, request):
        emp_code, emp = _require_employee(request)
        if not emp:
            return Response({'error': 'Not allowed'}, status=403)
        month = request.query_params.get('month', '').strip()
        year = request.query_params.get('year', '').strip()
        today = timezone.localdate()
        y = int(year) if year else today.year
        m = int(month) if month else today.month
        qs = Penalty.objects.filter(emp_code=emp_code, year=y, month=m).order_by('-date')
        total = qs.aggregate(s=Sum('deduction_amount'))['s'] or Decimal('0')
        # Attach inquiry status per penalty
        inquiry_map = {i.penalty_id: i.status for i in PenaltyInquiry.objects.filter(penalty__in=qs).values('penalty_id', 'status')}
        data = []
        for p in qs:
            d = {
                'id': p.id, 'date': str(p.date), 'month': p.month, 'year': p.year,
                'minutes_late': p.minutes_late, 'deduction_amount': str(p.deduction_amount),
                'description': p.description or '', 'is_manual': p.is_manual,
                'inquiry_status': inquiry_map.get(p.id),
            }
            data.append(d)
        return Response({'list': data, 'total_fine_month': str(total)})


class EmployeePenaltyInquiryCreateView(APIView):
    """POST: create inquiry for a penalty (penalty_id, message). One open inquiry per penalty."""
    def post(self, request):
        emp_code, emp = _require_employee(request)
        if not emp:
            return Response({'error': 'Not allowed'}, status=403)
        penalty_id = request.data.get('penalty_id')
        message = (request.data.get('message') or '').strip()[:2000]
        if not penalty_id:
            return Response({'error': 'penalty_id required'}, status=400)
        try:
            pen = Penalty.objects.get(pk=penalty_id)
        except (ValueError, Penalty.DoesNotExist):
            return Response({'error': 'Penalty not found'}, status=404)
        if pen.emp_code != emp_code:
            return Response({'error': 'Not allowed'}, status=403)
        if PenaltyInquiry.objects.filter(penalty=pen, status=PenaltyInquiry.STATUS_OPEN).exists():
            return Response({'error': 'An open inquiry already exists for this penalty'}, status=400)
        obj = PenaltyInquiry.objects.create(penalty=pen, emp_code=emp_code, message=message, status=PenaltyInquiry.STATUS_OPEN)
        from .serializers import PenaltyInquirySerializer
        return Response(PenaltyInquirySerializer(obj).data, status=201)


# ---------- Admin: Leave requests (list, approve/decline) ----------
def _admin_leave_balance_for_employee(emp_code, leave_type_key, year):
    """Return (allowance, days_taken, balance) for this employee and leave type for the year."""
    try:
        emp = Employee.objects.get(emp_code=emp_code)
    except Employee.DoesNotExist:
        return 0, 0, 0
    default = 12 if leave_type_key == 'casual' else 6 if leave_type_key == 'sick' else 0
    emp_val = getattr(emp, f'{leave_type_key}_allowance_per_year', None)
    allowance = int(emp_val) if emp_val is not None else _get_leave_allowance(f'{leave_type_key}_allowance_per_year', default)
    days_taken = 0
    for lr in LeaveRequest.objects.filter(emp_code=emp_code, status=LeaveRequest.STATUS_APPROVED, from_date__year=year, to_date__year=year, leave_type=leave_type_key):
        days_taken += (lr.to_date - lr.from_date).days + 1
    balance = max(0, allowance - days_taken)
    return allowance, days_taken, balance


class LeaveRequestAdminListView(APIView):
    """GET: list leave requests. Filters: status, department, emp_code. Admin only; filtered by company/department."""
    def get(self, request):
        admin, allowed_emp_codes = get_request_admin(request)
        if not admin:
            return Response({'error': 'Not allowed'}, status=403)
        qs = LeaveRequest.objects.all().order_by('-requested_at')
        if allowed_emp_codes is not None:
            qs = qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else qs.none()
        status_filter = request.query_params.get('status', '').strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
        dept = request.query_params.get('department', '').strip()
        if dept:
            qs = qs.filter(dept_name=dept)
        emp = request.query_params.get('emp_code', '').strip()
        if emp:
            qs = qs.filter(emp_code__icontains=emp)
        from .serializers import LeaveRequestSerializer
        data = LeaveRequestSerializer(qs, many=True).data
        today = timezone.localdate()
        year = today.year
        emp_codes = list({r['emp_code'] for r in data})
        name_map = dict(Employee.objects.filter(emp_code__in=emp_codes).values_list('emp_code', 'name'))
        for r in data:
            r['employee_name'] = name_map.get(r['emp_code']) or r['emp_code']
            from_d = r.get('from_date')
            to_d = r.get('to_date')
            if from_d and to_d:
                try:
                    fd = date.fromisoformat(str(from_d))
                    td = date.fromisoformat(str(to_d))
                    r['days_requested'] = (td - fd).days + 1
                except (TypeError, ValueError):
                    r['days_requested'] = None
            else:
                r['days_requested'] = None
            lt = (r.get('leave_type') or 'casual').strip() or 'casual'
            allowance, days_taken, balance = _admin_leave_balance_for_employee(r['emp_code'], lt, year)
            r['leave_allowance'] = allowance
            r['leave_taken'] = days_taken
            r['leave_balance'] = balance
        return Response(data)


class LeaveRequestAdminDetailView(APIView):
    """PATCH: set status (approved/declined), admin_notes. Admin only."""
    def patch(self, request, pk):
        admin, allowed_emp_codes = get_request_admin(request)
        if not admin:
            return Response({'error': 'Not allowed'}, status=403)
        try:
            lr = LeaveRequest.objects.get(pk=pk)
        except LeaveRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        if allowed_emp_codes is not None and lr.emp_code not in allowed_emp_codes:
            return Response({'error': 'Not allowed'}, status=403)
        status = request.data.get('status', '').strip().lower()
        if status in ('approved', 'declined'):
            lr.status = status
            lr.reviewed_at = timezone.now()
            lr.reviewed_by = admin
            lr.admin_notes = (request.data.get('admin_notes') or '')[:2000]
            lr.save()
        from .serializers import LeaveRequestSerializer
        return Response(LeaveRequestSerializer(lr).data)


# ---------- Admin: Penalty inquiries (list, resolve) ----------
class PenaltyInquiryAdminListView(APIView):
    """GET: list penalty inquiries. Filters: status. Admin only; filtered by allowed_emp_codes."""
    def get(self, request):
        admin, allowed_emp_codes = get_request_admin(request)
        if not admin:
            return Response({'error': 'Not allowed'}, status=403)
        qs = PenaltyInquiry.objects.select_related('penalty').all().order_by('-created_at')
        if allowed_emp_codes is not None:
            qs = qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else qs.none()
        status_filter = request.query_params.get('status', '').strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
        out = []
        for i in qs:
            out.append({
                'id': i.id, 'penalty_id': i.penalty_id, 'emp_code': i.emp_code,
                'penalty_date': str(i.penalty.date), 'deduction_amount': str(i.penalty.deduction_amount),
                'message': i.message, 'status': i.status, 'admin_notes': i.admin_notes,
                'reviewed_at': i.reviewed_at.isoformat() if i.reviewed_at else None,
                'created_at': i.created_at.isoformat(),
            })
        return Response(out)


class PenaltyInquiryAdminDetailView(APIView):
    """PATCH: set status (approved/rejected/amount_adjusted), admin_notes. If amount_adjusted, can send new amount to update Penalty."""
    def patch(self, request, pk):
        admin, allowed_emp_codes = get_request_admin(request)
        if not admin:
            return Response({'error': 'Not allowed'}, status=403)
        try:
            inquiry = PenaltyInquiry.objects.get(pk=pk)
        except PenaltyInquiry.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        if allowed_emp_codes is not None and inquiry.emp_code not in allowed_emp_codes:
            return Response({'error': 'Not allowed'}, status=403)
        status = request.data.get('status', '').strip().lower()
        if status not in ('approved', 'rejected', 'amount_adjusted'):
            return Response({'error': 'status must be approved, rejected, or amount_adjusted'}, status=400)
        inquiry.status = status
        inquiry.reviewed_at = timezone.now()
        inquiry.reviewed_by = admin
        inquiry.admin_notes = (request.data.get('admin_notes') or '')[:2000]
        inquiry.save()
        if status == 'amount_adjusted':
            new_amount = request.data.get('deduction_amount')
            if new_amount is not None:
                try:
                    amt = Decimal(str(new_amount))
                    if amt >= 0:
                        inquiry.penalty.deduction_amount = amt
                        inquiry.penalty.save(update_fields=['deduction_amount'])
                except Exception:
                    pass
        from .serializers import PenaltyInquirySerializer
        return Response(PenaltyInquirySerializer(inquiry).data)


# ---------- Admin profile (for settings page) ----------
class AdminProfileView(APIView):
    def get(self, request, pk):
        try:
            admin = Admin.objects.get(pk=pk)
        except Admin.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        return Response(AdminProfileSerializer(admin).data)

    def patch(self, request, pk):
        try:
            admin = Admin.objects.get(pk=pk)
        except Admin.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        current, _ = get_request_admin(request)
        if current and current.pk != pk and not current.is_super_admin:
            return Response({'error': 'Only super admin or self can update'}, status=403)
        ser = AdminUpdateSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        if 'name' in ser.validated_data:
            admin.name = ser.validated_data['name']
        if 'email' in ser.validated_data:
            new_email = ser.validated_data['email']
            if Admin.objects.filter(email__iexact=new_email).exclude(pk=admin.pk).exists():
                return Response({'error': 'This email is already used by another admin.'}, status=400)
            admin.email = new_email
        if 'password' in ser.validated_data:
            admin.password = ser.validated_data['password']
        if 'phone' in ser.validated_data:
            admin.phone = (ser.validated_data['phone'] or '')[:20]
        admin.save()
        log_activity(request, 'update', 'admins', 'admin', str(pk), details={'updated': list(ser.validated_data.keys())})
        return Response(AdminProfileSerializer(admin).data)

    def delete(self, request, pk):
        current, _ = get_request_admin(request)
        if not current or not current.is_super_admin:
            return Response({'error': 'Super admin only'}, status=403)
        if pk == 1:
            return Response({'error': 'Cannot delete super admin (ID 1)'}, status=400)
        try:
            admin = Admin.objects.get(pk=pk)
        except Admin.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        log_activity(request, 'delete', 'admins', 'admin', str(pk), details={'email': admin.email, 'name': admin.name})
        admin.delete()
        return Response(status=204)


# ---------- Super admin: list/create/update other admins (access) ----------
class DepartmentsListView(APIView):
    """GET: list distinct department names from employees and from admins. Scoped by company when admin has company_id."""
    def get(self, request):
        current, allowed_emp_codes = get_request_admin(request)
        if not current:
            return Response({'error': 'Unauthorized'}, status=403)
        qs_emp = Employee.objects.exclude(dept_name='').exclude(dept_name__isnull=True)
        if allowed_emp_codes is not None:
            qs_emp = qs_emp.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else qs_emp.none()
        from_employees = set(qs_emp.values_list('dept_name', flat=True).distinct())
        qs_admin = Admin.objects.exclude(department='').exclude(department__isnull=True)
        if getattr(current, 'company_id', None):
            qs_admin = qs_admin.filter(company_id=current.company_id)
        from_admins = set(qs_admin.values_list('department', flat=True).distinct())
        depts = sorted(set(from_employees) | set(from_admins))
        return Response({'departments': [d.strip() for d in depts if (d or '').strip()]})


class AdminListView(APIView):
    """GET: list all admins. POST: create new admin (super admin only)."""
    def get(self, request):
        current, _ = get_request_admin(request)
        if not current or not current.is_super_admin:
            return Response({'error': 'Super admin only'}, status=403)
        admins = Admin.objects.all().order_by('id')
        return Response(AdminListSerializer(admins, many=True).data)

    def post(self, request):
        current, _ = get_request_admin(request)
        if not current or not current.is_super_admin:
            return Response({'error': 'Super admin only'}, status=403)
        ser = AdminCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        admin = ser.save()
        log_activity(request, 'create', 'admins', 'admin', str(admin.pk), details={'email': admin.email, 'department': admin.department})
        return Response(AdminListSerializer(admin).data, status=201)


class AdminUpdateAccessView(APIView):
    """PATCH: update an admin's department, role, access (super admin only). Cannot edit id=1 role."""
    def patch(self, request, pk):
        current, _ = get_request_admin(request)
        if not current or not current.is_super_admin:
            return Response({'error': 'Super admin only'}, status=403)
        try:
            admin = Admin.objects.get(pk=pk)
        except Admin.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        ser = AdminAccessUpdateSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        if 'department' in ser.validated_data:
            admin.department = ser.validated_data['department'] or ''
        if 'role' in ser.validated_data and admin.pk != 1:
            admin.role = ser.validated_data['role']
        if 'access' in ser.validated_data:
            admin.access = ser.validated_data['access']
        admin.save()
        log_activity(request, 'update', 'admins', 'admin', str(pk), details={'access_updated': True, 'department': admin.department})
        return Response(AdminListSerializer(admin).data)


# ---------- Audit log (super admin only) ----------
class AuditLogListView(APIView):
    """List activity logs with optional filters. Super admin only."""
    def get(self, request):
        current, _ = get_request_admin(request)
        if not current or not current.is_super_admin:
            return Response({'error': 'Super admin only'}, status=403)
        qs = AuditLog.objects.all().order_by('-created_at')
        module = request.query_params.get('module', '').strip()
        action = request.query_params.get('action', '').strip()
        admin_id = request.query_params.get('admin_id', '').strip()
        if module:
            qs = qs.filter(module=module)
        if action:
            qs = qs.filter(action=action)
        if admin_id:
            try:
                qs = qs.filter(admin_id=int(admin_id))
            except ValueError:
                pass
        limit = min(int(request.query_params.get('limit', 200)), 500)
        logs = list(qs[:limit].values(
            'id', 'admin_id', 'admin_name', 'admin_email', 'action', 'module',
            'target_type', 'target_id', 'details', 'ip_address', 'created_at'
        ))
        for log in logs:
            if log.get('details') and isinstance(log['details'], dict):
                log['details'] = log['details']
            if hasattr(log.get('created_at'), 'isoformat'):
                log['created_at'] = log['created_at'].isoformat()
        return Response({'results': logs, 'count': len(logs)})


# ---------- Upload ----------
class UploadEmployeesView(APIView):
    def post(self, request):
        f = request.FILES.get('file')
        if not f:
            return Response({'success': False, 'error': 'No file'}, status=400)
        preview = request.data.get('preview', 'false').lower() == 'true'
        admin, _ = get_request_admin(request)
        company_id = getattr(admin, 'company_id', None) if admin else None
        result = upload_employees_excel(f, preview=preview, company_id=company_id)
        if not result.get('success'):
            return Response(result, status=400)
        if not preview:
            log_activity(request, 'upload', 'upload', 'employees', '', details={'filename': getattr(f, 'name', ''), 'result': result})
        return Response(result)


class UploadTemplateDownloadView(APIView):
    """Download sample or current data for upload sections (employees, attendance, shifts, force_punch)."""
    def get(self, request):
        kind = request.query_params.get('type', '').strip()
        mode = request.query_params.get('mode', 'sample').strip()  # sample | data
        if kind not in ('employees', 'attendance', 'shift', 'force_punch'):
            return Response({'error': 'Invalid type'}, status=400)
        admin, _ = get_request_admin(request)
        company_id = getattr(admin, 'company_id', None) if admin else None

        import csv
        from io import StringIO
        from django.http import HttpResponse

        # Build header + rows
        if kind == 'employees':
            if mode == 'sample':
                header, rows = build_employee_sample_rows()
            else:
                qs = Employee.objects.all().order_by('emp_code')
                if company_id is not None:
                    qs = qs.filter(company_id=company_id)
                header = ['Emp Code', 'Name', 'Mobile No', 'Email', 'Gender', 'Department Name', 'Designation Name', 'Status', 'Employment Type', 'Salary Type', 'Salary']
                rows = [
                    [
                        e.emp_code,
                        e.name,
                        e.mobile or '',
                        e.email or '',
                        e.gender or '',
                        e.dept_name or '',
                        e.designation or '',
                        e.status or '',
                        e.employment_type or '',
                        e.salary_type or '',
                        str(e.base_salary or ''),
                    ]
                    for e in qs
                ]
        elif kind == 'attendance':
            if mode == 'sample':
                header, rows = build_attendance_sample_rows()
            else:
                qs = Attendance.objects.all().order_by('-date', 'emp_code')
                if company_id is not None:
                    emp_codes = list(Employee.objects.filter(company_id=company_id).values_list('emp_code', flat=True))
                    qs = qs.filter(emp_code__in=emp_codes)
                header = ['Emp Id', 'Date', 'Name', 'Punch In', 'Punch Out', 'Total Working Hours', 'Total Break', 'Status']
                rows = [
                    [
                        a.emp_code,
                        a.date.isoformat(),
                        a.name or '',
                        a.punch_in.isoformat()[:5] if a.punch_in else '',
                        a.punch_out.isoformat()[:5] if a.punch_out else '',
                        str(a.total_working_hours or ''),
                        str(a.total_break or ''),
                        a.status or '',
                    ]
                    for a in qs
                ]
        elif kind == 'shift':
            if mode == 'sample':
                header, rows = build_shift_sample_rows()
            else:
                qs = Employee.objects.all().order_by('emp_code')
                if company_id is not None:
                    qs = qs.filter(company_id=company_id)
                header = ['Emp Id', 'Shift', 'Shift From', 'Shift To']
                rows = [
                    [
                        e.emp_code,
                        e.shift or '',
                        e.shift_from.isoformat()[:5] if e.shift_from else '',
                        e.shift_to.isoformat()[:5] if e.shift_to else '',
                    ]
                    for e in qs
                ]
        else:  # force_punch
            if mode == 'sample':
                header, rows = build_force_punch_sample_rows()
            else:
                qs = Attendance.objects.all().order_by('-date', 'emp_code')
                if company_id is not None:
                    emp_codes = list(Employee.objects.filter(company_id=company_id).values_list('emp_code', flat=True))
                    qs = qs.filter(emp_code__in=emp_codes)
                header = ['Emp Id', 'Date', 'Punch In', 'Punch Out', 'Total Working Hours']
                rows = [
                    [
                        a.emp_code,
                        a.date.isoformat(),
                        a.punch_in.isoformat()[:5] if a.punch_in else '',
                        a.punch_out.isoformat()[:5] if a.punch_out else '',
                        str(a.total_working_hours or ''),
                    ]
                    for a in qs
                ]

        # Build CSV response
        buffer = StringIO()
        writer = csv.writer(buffer)
        writer.writerow(header)
        for r in rows:
            writer.writerow(r)
        filename = f'{kind}_{"sample" if mode == "sample" else "data"}.csv'
        resp = HttpResponse(buffer.getvalue(), content_type='text/csv')
        resp['Content-Disposition'] = f'attachment; filename=\"{filename}\"'
        return resp


class UploadAttendanceView(APIView):
    def post(self, request):
        f = request.FILES.get('file')
        if not f:
            return Response({'success': False, 'error': 'No file'}, status=400)
        preview = request.data.get('preview', 'false').lower() == 'true'
        admin, _ = get_request_admin(request)
        company_id = getattr(admin, 'company_id', None) if admin else None
        try:
            result = upload_attendance_excel(f, preview=preview, company_id=company_id)
        except Exception as e:
            return Response({'success': False, 'error': str(e)}, status=500)
        if not result.get('success'):
            return Response(result, status=400)
        # Auto-run reward engine and today attendance sync after actual upload (not preview)
        if not preview:
            try:
                reward_result = run_reward_engine(company_id=company_id)
                result['rewards'] = reward_result
            except Exception:
                pass
            try:
                from .attendance_sync import run_today_attendance_sync
                run_today_attendance_sync(force_absent=True)
            except Exception:
                pass
            log_activity(request, 'upload', 'upload', 'attendance', '', details={'filename': getattr(f, 'name', ''), 'result': result})
        return Response(result)


class UploadShiftView(APIView):
    def post(self, request):
        f = request.FILES.get('file')
        if not f:
            return Response({'success': False, 'error': 'No file'}, status=400)
        preview = request.data.get('preview', 'false').lower() == 'true'
        admin, _ = get_request_admin(request)
        company_id = getattr(admin, 'company_id', None) if admin else None
        result = upload_shift_excel(f, preview=preview, company_id=company_id)
        if not result.get('success'):
            return Response(result, status=400)
        if not preview:
            log_activity(request, 'upload', 'upload', 'shift', '', details={'filename': getattr(f, 'name', '')})
        return Response(result)


class UploadForcePunchView(APIView):
    """Upload Excel to force overwrite punch_in and punch_out for existing attendance records."""
    def post(self, request):
        f = request.FILES.get('file')
        if not f:
            return Response({'success': False, 'error': 'No file'}, status=400)
        preview = request.data.get('preview', 'false').lower() == 'true'
        admin, _ = get_request_admin(request)
        company_id = getattr(admin, 'company_id', None) if admin else None
        result = upload_force_punch_excel(f, preview=preview, company_id=company_id)
        if not result.get('success'):
            return Response(result, status=400)
        if not preview:
            try:
                admin, _ = get_request_admin(request)
                company_id = getattr(admin, 'company_id', None) if admin else None
                reward_result = run_reward_engine(company_id=company_id)
                result['rewards'] = reward_result
            except Exception:
                pass
            log_activity(request, 'upload', 'upload', 'force_punch', '', details={'filename': getattr(f, 'name', '')})
        return Response(result)


# ---------- CRUD ViewSets ----------
class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'dept_name', 'employment_type']

    def get_serializer_context(self):
        context = super().get_serializer_context()
        admin, _ = get_request_admin(self.request)
        if admin and getattr(admin, 'company_id', None):
            context['default_company_id'] = admin.company_id
        return context

    def get_queryset(self):
        qs = super().get_queryset()
        _, allowed_emp_codes = get_request_admin(self.request)
        if allowed_emp_codes is not None:
            qs = qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else qs.none()
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(emp_code__icontains=search) | Q(name__icontains=search))
        # Extra filters
        dept = self.request.query_params.get('department', '').strip()
        if dept:
            qs = qs.filter(dept_name__iexact=dept)
        designation = self.request.query_params.get('designation', '').strip()
        if designation:
            qs = qs.filter(designation__iexact=designation)
        salary_type = self.request.query_params.get('salary_type', '').strip()
        if salary_type:
            qs = qs.filter(salary_type=salary_type)
        shift = self.request.query_params.get('shift', '').strip()
        if shift:
            if shift == 'none':
                qs = qs.filter(Q(shift='') | Q(shift__isnull=True))
            else:
                qs = qs.filter(shift__iexact=shift)
        gender = self.request.query_params.get('gender', '').strip()
        if gender:
            qs = qs.filter(gender__iexact=gender)
        # Joined filters
        joined_month = self.request.query_params.get('joined_month', '').strip()
        if joined_month:
            qs = qs.filter(created_at__month=int(joined_month))
        joined_year = self.request.query_params.get('joined_year', '').strip()
        if joined_year:
            qs = qs.filter(created_at__year=int(joined_year))
        return qs

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        data = response.data
        # If paginated, results are under 'results'
        emp_list = data.get('results', data) if isinstance(data, dict) else data

        # Attach current month total hours from Attendance
        today = timezone.localdate()
        month_start = today.replace(day=1)
        emp_codes = [e['emp_code'] for e in emp_list]
        hours_map = {}
        if emp_codes:
            for a in Attendance.objects.filter(
                emp_code__in=emp_codes, date__gte=month_start, date__lte=today
            ).values('emp_code').annotate(
                total_hours=Sum('total_working_hours'),
                days_present=Count('id', filter=Q(status='Present')),
            ):
                hours_map[a['emp_code']] = {
                    'month_hours': str(a['total_hours'] or 0),
                    'month_days': a['days_present'] or 0,
                }
        for e in emp_list:
            stats = hours_map.get(e['emp_code'], {})
            e['month_hours'] = stats.get('month_hours', '0')
            e['month_days'] = stats.get('month_days', 0)

        # Also return distinct filter options (include departments from admins so admin-created depts appear)
        if request.query_params.get('include_filters', '').lower() == 'true':
            all_emps = self.get_queryset().filter(status__in=Employee.EMPLOYED_STATUSES)
            dept_from_emps = set(all_emps.values_list('dept_name', flat=True).distinct()) - {''}
            dept_from_admins = set(Admin.objects.exclude(department='').exclude(department__isnull=True).values_list('department', flat=True).distinct())
            dept_from_emps = {d for d in dept_from_emps if d is not None}
            departments = sorted(set(dept_from_emps) | set(d for d in dept_from_admins if (d or '').strip()))
            designations = sorted(x for x in (set(all_emps.values_list('designation', flat=True).distinct()) - {''}) if x is not None)
            designations.sort()
            shifts = sorted(x for x in all_emps.exclude(shift='').values_list('shift', flat=True).distinct() if (x or '').strip())
            gender_set = set(all_emps.values_list('gender', flat=True).distinct()) - {''}
            genders = sorted(x for x in gender_set if x is not None)
            join_years = sorted(set(d.year for d in all_emps.dates('created_at', 'year')))
            filter_data = {
                'departments': departments,
                'designations': designations,
                'shifts': shifts,
                'genders': genders,
                'join_years': join_years,
            }
            if isinstance(data, dict):
                data['filters'] = filter_data
            else:
                response.data = {
                    'results': data,
                    'filters': filter_data,
                }
        return response

    def perform_create(self, serializer):
        admin, _ = get_request_admin(self.request)
        if admin and getattr(admin, 'company_id', None):
            serializer.validated_data['company_id'] = admin.company_id
        serializer.save()
        obj = serializer.instance
        log_activity(self.request, 'create', 'employees', 'employee', obj.emp_code, details={'name': obj.name})

    def perform_update(self, serializer):
        obj = serializer.instance
        log_activity(self.request, 'update', 'employees', 'employee', obj.emp_code, details={'name': obj.name})
        serializer.save()

    def perform_destroy(self, instance):
        ec, name = instance.emp_code, instance.name
        log_activity(self.request, 'delete', 'employees', 'employee', ec, details={'name': name})
        instance.delete()

    @action(detail=False, methods=['get'], url_path='next_emp_code')
    def next_emp_code(self, request):
        """Return a suggested next emp_code as plain number (e.g. 380, 381)."""
        import re
        _, allowed_emp_codes = get_request_admin(request)
        qs = Employee.objects.values_list('emp_code', flat=True)
        if allowed_emp_codes is not None:
            qs = qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else qs.none()
        existing = list(qs)
        max_num = 0
        for code in existing:
            if not code:
                continue
            s = str(code).strip()
            m = re.search(r'(\d+)$', s)
            if m:
                max_num = max(max_num, int(m.group(1)))
            elif s.isdigit():
                max_num = max(max_num, int(s))
        next_num = max_num + 1
        return Response({'next_emp_code': str(next_num)})


class AttendanceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Attendance.objects.all()
    serializer_class = AttendanceSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['emp_code', 'status']

    def get_queryset(self):
        today = timezone.localdate()
        _, allowed_emp_codes = get_request_admin(self.request)
        punch_in_update_qs = Attendance.objects.filter(date=today, punch_in__isnull=False).exclude(status='Present')
        if allowed_emp_codes is not None:
            punch_in_update_qs = punch_in_update_qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else punch_in_update_qs.none()
        punch_in_update_qs.update(status='Present')
        qs = super().get_queryset()
        if allowed_emp_codes is not None:
            qs = qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else qs.none()
        date_from = self.request.query_params.get('date_from', '').strip()
        date_to = self.request.query_params.get('date_to', '').strip()
        date_single = self.request.query_params.get('date', '').strip()
        search = self.request.query_params.get('search', '').strip()
        punchin = self.request.query_params.get('punchin', '').strip()
        status_filter = self.request.query_params.get('status', '').strip()
        if date_single:
            qs = qs.filter(date=date_single)
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        if search:
            qs = qs.filter(Q(emp_code__icontains=search) | Q(name__icontains=search))
        if punchin:
            if punchin == 'yes':
                qs = qs.filter(punch_in__isnull=False)
            elif punchin == 'no':
                qs = qs.filter(punch_in__isnull=True)
        if status_filter:
            qs = qs.filter(status=status_filter)
        # Server-side sorting
        ordering = self.request.query_params.get('ordering', '').strip()
        allowed_sort = {
            'date': 'date', '-date': '-date',
            'emp_code': 'emp_code', '-emp_code': '-emp_code',
            'total_working_hours': 'total_working_hours', '-total_working_hours': '-total_working_hours',
            'over_time': 'over_time', '-over_time': '-over_time',
            'status': 'status', '-status': '-status',
            'punch_in': 'punch_in', '-punch_in': '-punch_in',
        }
        if ordering and ordering in allowed_sort:
            return qs.order_by(allowed_sort[ordering], 'emp_code' if not ordering.endswith('emp_code') else 'date')
        return qs.order_by('-date', 'emp_code')


class SalaryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Salary.objects.all()
    serializer_class = SalarySerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['emp_code', 'month', 'year']

    def get_queryset(self):
        qs = super().get_queryset()
        _, allowed_emp_codes = get_request_admin(self.request)
        if allowed_emp_codes is not None:
            qs = qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else qs.none()
        return qs


class AdjustmentViewSet(viewsets.ModelViewSet):
    queryset = Adjustment.objects.all()
    serializer_class = AdjustmentSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['emp_code']

    def get_queryset(self):
        qs = super().get_queryset()
        _, allowed_emp_codes = get_request_admin(self.request)
        if allowed_emp_codes is not None:
            qs = qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else qs.none()
        date_from = self.request.query_params.get('date_from', '').strip()
        date_to = self.request.query_params.get('date_to', '').strip()
        if date_from:
            qs = qs.filter(adj_date__gte=date_from)
        if date_to:
            qs = qs.filter(adj_date__lte=date_to)
        return qs.order_by('-created_at')


class PerformanceRewardViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PerformanceReward.objects.all()
    serializer_class = PerformanceRewardSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['emp_code', 'entry_type', 'admin_action_status', 'is_on_leaderboard']

    def get_queryset(self):
        qs = super().get_queryset()
        _, allowed_emp_codes = get_request_admin(self.request)
        if allowed_emp_codes is not None:
            qs = qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else qs.none()
        return qs


class HolidayViewSet(viewsets.ModelViewSet):
    queryset = Holiday.objects.all()
    serializer_class = HolidaySerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['year']

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        data = response.data
        results = data.get('results') if isinstance(data, dict) else None
        if results is not None:
            data_list = results
        else:
            data_list = data if isinstance(data, list) else []
        try:
            year = int(request.query_params.get('year', date.today().year))
        except ValueError:
            year = date.today().year
        existing_dates = {str(item.get('date')) for item in data_list}
        d = date(year, 1, 1)
        end = date(year, 12, 31)
        while d <= end:
            if d.weekday() == 6:
                key = d.isoformat()
                if key not in existing_dates:
                    data_list.append({
                        'id': None, 'date': key, 'name': 'Sunday (Weekly off)',
                        'year': year, 'created_at': None,
                    })
                    existing_dates.add(key)
            d += timedelta(days=1)
        data_list.sort(key=lambda x: x.get('date') or '')
        if results is not None:
            response.data['count'] = len(data_list)
        return response

    def perform_create(self, serializer):
        serializer.save()
        obj = serializer.instance
        log_activity(self.request, 'create', 'holidays', 'holiday', str(obj.date), details={'name': obj.name})

    def perform_update(self, serializer):
        obj = serializer.instance
        log_activity(self.request, 'update', 'holidays', 'holiday', str(obj.date), details={'name': obj.name})
        serializer.save()

    def perform_destroy(self, instance):
        log_activity(self.request, 'delete', 'holidays', 'holiday', str(instance.date), details={'name': instance.name})
        instance.delete()


# Keys that can be overridden per company (bonus/penalty rules). Company-scoped admin sees and edits these for their company.
COMPANY_SETTING_KEYS = {
    'streak_days': 'Consecutive present days for streak reward',
    'weekly_overtime_threshold_hours': 'Min weekly OT hours for reward',
    'absent_streak_days': 'Consecutive absent days for red flag',
    # Penalty (late punch): Rs per minute
    'penalty_rate_per_minute_rs': 'Rs per minute late (until monthly threshold)',
    'penalty_monthly_threshold_rs': 'Monthly penalty threshold (Rs); after this, higher rate applies',
    'penalty_rate_after_threshold_rs': 'Rs per minute late after monthly threshold',
    # Shift OT bonus: after how many hours, how much bonus
    'shift_ot_min_hours': 'Min work hours in a day before shift OT bonus applies',
    'shift_ot_extra_hours_for_1_bonus': 'Every X extra hours = 1 bonus hour (e.g. 2)',
}


class SystemSettingViewSet(viewsets.ModelViewSet):
    queryset = SystemSetting.objects.all()
    serializer_class = SystemSettingSerializer
    lookup_field = 'key'
    lookup_url_kwarg = 'key'

    def _check_full_access(self):
        if not _full_settings_access(self.request):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Full access required for System settings.')

    def _company_scoped_settings(self, request):
        """When admin has company_id, return effective settings list and allow update to CompanySetting."""
        admin, _ = get_request_admin(request)
        return getattr(admin, 'company_id', None) if admin else None

    def list(self, request, *args, **kwargs):
        self._check_full_access()
        company_id = self._company_scoped_settings(request)
        if company_id is not None:
            results = [
                {'key': k, 'value': get_company_setting(k, company_id=company_id, default=''), 'description': desc}
                for k, desc in COMPANY_SETTING_KEYS.items()
            ]
            return Response({'results': results})
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        self._check_full_access()
        company_id = self._company_scoped_settings(request)
        if company_id is not None:
            key = kwargs.get(self.lookup_url_kwarg or self.lookup_field)
            if key not in COMPANY_SETTING_KEYS:
                from rest_framework.exceptions import NotFound
                raise NotFound()
            return Response({
                'key': key,
                'value': get_company_setting(key, company_id=company_id, default=''),
                'description': COMPANY_SETTING_KEYS.get(key, ''),
            })
        return super().retrieve(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        self._check_full_access()
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._check_full_access()
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._check_full_access()
        company_id = self._company_scoped_settings(request)
        if company_id is not None:
            key = kwargs.get(self.lookup_url_kwarg or self.lookup_field)
            if key not in COMPANY_SETTING_KEYS:
                from rest_framework.exceptions import NotFound
                raise NotFound()
            value = (request.data.get('value') or '').strip()
            set_company_setting(key, value, company_id, description=COMPANY_SETTING_KEYS.get(key, ''))
            log_activity(request, 'update', 'settings', 'setting', key, details={'company_id': company_id, 'value': value})
            return Response({
                'key': key,
                'value': get_company_setting(key, company_id=company_id, default=''),
                'description': COMPANY_SETTING_KEYS.get(key, ''),
            })
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._check_full_access()
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save()
        obj = serializer.instance
        log_activity(self.request, 'create', 'settings', 'setting', obj.key, details={'value': obj.value})

    def perform_update(self, serializer):
        obj = serializer.instance
        log_activity(self.request, 'update', 'settings', 'setting', obj.key, details={'value': obj.value})
        serializer.save()

    def perform_destroy(self, instance):
        log_activity(self.request, 'delete', 'settings', 'setting', instance.key, details={})
        instance.delete()


# ---------- Full access: super_admin OR (settings AND manage_admins) — for System settings & Google Sheet only ----------
def _full_settings_access(request):
    """True if admin has full access: can see/update System settings and Google Sheet live sync.
    Company super_admin (role=super_admin with company_id) has full access to all data and settings of their company."""
    current_admin, _ = get_request_admin(request)
    if not current_admin:
        return False
    if getattr(current_admin, 'is_super_admin', False):
        return True
    acc = current_admin.access or {}
    return bool(acc.get('settings') and acc.get('manage_admins'))


# ---------- Email SMTP config (for Settings page). Full access only. ----------
class EmailSmtpConfigView(APIView):
    """GET: return first active SMTP config (or first row). PATCH: update by id (body: id required). Full access only."""
    def get(self, request):
        if not _full_settings_access(request):
            return Response({'error': 'Not allowed'}, status=403)
        config = EmailSmtpConfig.objects.filter(is_active=True).first()
        if not config:
            config = EmailSmtpConfig.objects.first()
        if not config:
            return Response({'detail': 'No SMTP config found. Add one in Django Admin or run migration.'}, status=404)
        return Response(EmailSmtpConfigSerializer(config).data)

    def patch(self, request):
        if not _full_settings_access(request):
            return Response({'error': 'Not allowed'}, status=403)
        pk = request.data.get('id')
        if not pk:
            config = EmailSmtpConfig.objects.filter(is_active=True).first() or EmailSmtpConfig.objects.first()
        else:
            try:
                config = EmailSmtpConfig.objects.get(pk=pk)
            except EmailSmtpConfig.DoesNotExist:
                return Response({'error': 'SMTP config not found'}, status=404)
        if not config:
            return Response({'error': 'No SMTP config to update'}, status=404)
        ser = EmailSmtpConfigSerializer(config, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        log_activity(request, 'update', 'settings', 'email_smtp_config', '', details={'id': config.pk})
        return Response(EmailSmtpConfigSerializer(config).data)


# ---------- Google Sheet settings & manual sync (per company when admin has company_id) ----------
class GoogleSheetConfigView(APIView):
    """GET: return google_sheet_id and last_sync for current admin's company. PATCH: update (body: { google_sheet_id }). Full access only."""
    def get(self, request):
        if not _full_settings_access(request):
            return Response({'error': 'Not allowed'}, status=403)
        admin, _ = get_request_admin(request)
        company_id = getattr(admin, 'company_id', None) if admin else None
        sheet_id = get_sheet_id(company_id=company_id)
        last_sync = get_company_setting('google_sheet_last_sync', company_id=company_id, default='') or None
        return Response({'google_sheet_id': sheet_id or '', 'last_sync': last_sync})

    def patch(self, request):
        if not _full_settings_access(request):
            return Response({'error': 'Not allowed'}, status=403)
        admin, _ = get_request_admin(request)
        company_id = getattr(admin, 'company_id', None) if admin else None
        new_id = (request.data.get('google_sheet_id') or '').strip()
        set_company_setting('google_sheet_id', new_id, company_id, description='Google Sheet ID for live sync')
        log_activity(request, 'update', 'settings', 'google_sheet_id', '', details={'company_id': company_id, 'google_sheet_id': new_id[:20] + '...' if len(new_id) > 20 else new_id})
        last_sync = get_company_setting('google_sheet_last_sync', company_id=company_id, default='') or None
        return Response({'google_sheet_id': new_id, 'last_sync': last_sync})


class GoogleSheetSyncView(APIView):
    """POST: trigger manual sync to current admin's company Google Sheet. Returns { success, message, last_sync }. Full access only.
    Only company-scoped admins can push (so the sheet gets only that company's data). System owner has no company_id so cannot push here."""
    def post(self, request):
        if not _full_settings_access(request):
            return Response({'error': 'Not allowed'}, status=403)
        admin, _ = get_request_admin(request)
        company_id = getattr(admin, 'company_id', None) if admin else None
        if company_id is None:
            return Response({
                'success': False,
                'message': 'Push is available only for a company. Log in as a company admin (e.g. Tubematic) and use Settings → Push to Google Sheet now.',
                'last_sync': None,
            }, status=400)
        result = sync_all(force_full=True, company_id=company_id)
        log_activity(request, 'export', 'settings', 'google_sheet_sync', '', details={**result, 'company_id': company_id})
        if result['success']:
            return Response(result, status=200)
        return Response(result, status=400)


# ---------- Plant Report daily email (recipients + send time in DB) ----------
def _plant_report_email_settings_access(request):
    """True if admin can manage Plant Report email settings."""
    current_admin, _ = get_request_admin(request)
    return current_admin and (getattr(current_admin, 'is_super_admin', False) or (current_admin.access or {}).get('settings'))


class PlantReportEmailConfigView(APIView):
    """GET: recipients, send_time, enabled. PATCH: update send_time (HH:MM 24h) and/or enabled (true/false)."""
    def get(self, request):
        if not _plant_report_email_settings_access(request):
            return Response({'error': 'Not allowed'}, status=403)
        from .plant_report_email import get_plant_report_send_time, is_plant_report_email_enabled, get_plant_report_last_sent_date, get_plant_report_maam_amount
        recipients = list(PlantReportRecipient.objects.all().order_by('email').values('id', 'email', 'is_active', 'created_at'))
        h, m = get_plant_report_send_time()
        send_time = f'{h:02d}:{m:02d}'
        enabled = is_plant_report_email_enabled()
        last_sent = get_plant_report_last_sent_date()
        maam_amount = get_plant_report_maam_amount()
        return Response({
            'recipients': recipients,
            'send_time': send_time,
            'enabled': enabled,
            'last_sent': last_sent.isoformat() if last_sent else None,
            'maam_amount': maam_amount,
        })

    def patch(self, request):
        if not _plant_report_email_settings_access(request):
            return Response({'error': 'Not allowed'}, status=403)
        send_time = request.data.get('send_time')
        enabled = request.data.get('enabled')
        if send_time is not None:
            s = (str(send_time).strip() or '06:00')[:5]
            SystemSetting.objects.update_or_create(
                key='plant_report_send_time',
                defaults={'value': s, 'description': 'Daily Plant Report email time (HH:MM 24h)'},
            )
        if enabled is not None:
            v = 'true' if enabled in (True, 'true', '1', 'yes') else 'false'
            SystemSetting.objects.update_or_create(
                key='plant_report_enabled',
                defaults={'value': v, 'description': 'Send daily Plant Report email'},
            )
        maam_amount = request.data.get('maam_amount')
        if maam_amount is not None:
            if maam_amount in ('', None):
                s = ''
            else:
                try:
                    s = str(round(float(maam_amount), 2))
                except (TypeError, ValueError):
                    s = ''
            SystemSetting.objects.update_or_create(
                key='plant_report_maam_amount',
                defaults={'value': s, 'description': 'Ma\'am amount (final total salary) for difference in Plant Report email'},
            )
        return self.get(request)


class PlantReportRecipientListCreateView(APIView):
    """GET: list recipients. POST: add recipient (body: { email })."""
    def get(self, request):
        if not _plant_report_email_settings_access(request):
            return Response({'error': 'Not allowed'}, status=403)
        qs = PlantReportRecipient.objects.all().order_by('email')
        return Response(PlantReportRecipientSerializer(qs, many=True).data)

    def post(self, request):
        if not _plant_report_email_settings_access(request):
            return Response({'error': 'Not allowed'}, status=403)
        email = (request.data.get('email') or '').strip().lower()
        if not email:
            return Response({'error': 'email required'}, status=400)
        obj, created = PlantReportRecipient.objects.get_or_create(email=email, defaults={'is_active': True})
        if not created:
            obj.is_active = True
            obj.save(update_fields=['is_active'])
        log_activity(request, 'create', 'settings', 'plant_report_recipient', obj.email, details={})
        return Response(PlantReportRecipientSerializer(obj).data, status=201)


class PlantReportRecipientDetailView(APIView):
    """PATCH: update recipient (e.g. is_active to include/exclude from daily send). DELETE: remove recipient by id."""
    def patch(self, request, pk):
        if not _plant_report_email_settings_access(request):
            return Response({'error': 'Not allowed'}, status=403)
        try:
            obj = PlantReportRecipient.objects.get(pk=pk)
        except PlantReportRecipient.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        is_active = request.data.get('is_active')
        if is_active is not None:
            obj.is_active = is_active in (True, 'true', '1', 'yes')
            obj.save(update_fields=['is_active'])
            log_activity(request, 'update', 'settings', 'plant_report_recipient', obj.email, details={'is_active': obj.is_active})
        return Response(PlantReportRecipientSerializer(obj).data)

    def delete(self, request, pk):
        if not _plant_report_email_settings_access(request):
            return Response({'error': 'Not allowed'}, status=403)
        try:
            obj = PlantReportRecipient.objects.get(pk=pk)
        except PlantReportRecipient.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        email = obj.email
        obj.delete()
        log_activity(request, 'delete', 'settings', 'plant_report_recipient', email, details={})
        return Response(status=204)


class PlantReportEmailSendNowView(APIView):
    """POST: send Plant Report email immediately (for testing). Optional body: maam_amount (saved before send so difference is included)."""
    def post(self, request):
        if not _plant_report_email_settings_access(request):
            return Response({'error': 'Not allowed'}, status=403)
        # Save Ma'am amount to DB when provided (so it persists and difference appears in email)
        maam_amount = request.data.get('maam_amount')
        if maam_amount is not None:
            s = (str(maam_amount).strip() or '').strip()
            if s:
                try:
                    s = str(round(float(s), 2))
                except (TypeError, ValueError):
                    s = ''
            SystemSetting.objects.update_or_create(
                key='plant_report_maam_amount',
                defaults={'value': s, 'description': 'Ma\'am amount (final total salary) for difference in Plant Report email'},
            )
        from .plant_report_email import send_plant_report_email, get_plant_report_last_sent_date
        result = send_plant_report_email()
        if result.get('success'):
            result['last_sent'] = get_plant_report_last_sent_date()
            if result['last_sent']:
                result['last_sent'] = result['last_sent'].isoformat()
        log_activity(request, 'export', 'settings', 'plant_report_email_send', '', details=result)
        return Response(result, status=200 if result.get('success') else 400)


# ---------- Attendance Adjust (audit trail) ----------
def _time_to_decimal_hours(t):
    """Convert time to decimal hours (e.g. 09:30 -> 9.5)."""
    if t is None:
        return None
    return t.hour + t.minute / 60 + t.second / 3600


def _shift_duration_hours(shift_from, shift_to):
    """Expected shift duration. If shift_to < shift_from, spans next day."""
    if shift_from is None or shift_to is None:
        return None
    from_h = _time_to_decimal_hours(shift_from)
    to_h = _time_to_decimal_hours(shift_to)
    if from_h is None or to_h is None:
        return None
    diff = to_h - from_h
    if diff <= 0:
        diff += 24
    return round(diff, 2)


def _punch_spans_next_day(punch_in, punch_out):
    """True when punch_out < punch_in (next day)."""
    if not punch_in or not punch_out:
        return False
    in_h = _time_to_decimal_hours(punch_in)
    out_h = _time_to_decimal_hours(punch_out)
    return in_h is not None and out_h is not None and out_h < in_h


# Hourly employees: normal = 12h per day; over that is OT (matches excel_upload).
HOURLY_NORMAL_WORK_HOURS = Decimal('12')


def _calc_overtime_from_punch(punch_in, punch_out, shift_from, shift_to, salary_type=None):
    """
    OT for the day. If salary_type == 'Hourly': OT = max(0, total_working - 12) (whole hours).
    Else: OT = total_working - expected_shift_hours (whole hours only).
    """
    if punch_in is None or punch_out is None:
        return Decimal('0')
    in_h = _time_to_decimal_hours(punch_in)
    out_h = _time_to_decimal_hours(punch_out)
    if in_h is None or out_h is None:
        return Decimal('0')
    diff = out_h - in_h
    if diff < 0:
        diff += 24
    total_working = Decimal(str(round(diff, 2)))
    st = (salary_type or '').strip()
    if st == 'Hourly':
        ot = total_working - HOURLY_NORMAL_WORK_HOURS
        if ot <= 0:
            return Decimal('0')
        return Decimal(int(ot))
    expected = _shift_duration_hours(shift_from, shift_to)
    if expected is None or expected <= 0:
        return Decimal('0')
    ot = total_working - Decimal(str(expected))
    if ot <= 0:
        return Decimal('0')
    return Decimal(int(ot))


class AttendanceAdjustView(APIView):
    def post(self, request):
        current_admin, allowed_emp_codes = get_request_admin(request)
        admin_name = (current_admin.name or 'Admin') if current_admin else request.data.get('created_by_admin', 'admin')
        ser = AttendanceAdjustPayloadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        emp_code = data['emp_code']
        adj_date = data['date']
        if allowed_emp_codes is not None and emp_code not in allowed_emp_codes:
            return Response({'error': 'Not allowed to adjust this employee'}, status=403)
        att = Attendance.objects.filter(emp_code=emp_code, date=adj_date).first()
        if not att:
            return Response({'success': False, 'error': 'Attendance record not found'}, status=404)
        # Store previous for audit
        old_punch_in, old_punch_out = att.punch_in, att.punch_out
        old_ot = att.over_time
        # Update punch_in / punch_out (allow explicit null = "no punch out", carry forward to next day)
        if 'punch_in' in data:
            att.punch_in = data['punch_in']
        if 'punch_out' in data:
            att.punch_out = data['punch_out']
        punch_in = att.punch_in
        punch_out = att.punch_out
        # Use shift from attendance record, or fallback to employee's assigned shift
        shift_from = att.shift_from
        shift_to = att.shift_to
        emp_salary_type = 'Monthly'
        emp = Employee.objects.filter(emp_code=emp_code).values('shift', 'shift_from', 'shift_to', 'salary_type').first()
        if emp:
            emp_salary_type = (emp.get('salary_type') or 'Monthly').strip() or 'Monthly'
            if (not shift_from or not shift_to) and emp.get('shift_from') and emp.get('shift_to'):
                shift_from = emp['shift_from']
                shift_to = emp['shift_to']
                att.shift = emp.get('shift', '')
                att.shift_from = shift_from
                att.shift_to = shift_to
        if punch_in and punch_out:
            att.over_time = _calc_overtime_from_punch(punch_in, punch_out, shift_from, shift_to, emp_salary_type)
            in_h = _time_to_decimal_hours(punch_in)
            out_h = _time_to_decimal_hours(punch_out)
            diff = out_h - in_h
            if diff < 0:
                diff += 24
            att.total_working_hours = Decimal(str(round(diff, 2)))
            att.punch_spans_next_day = _punch_spans_next_day(punch_in, punch_out)
        else:
            # No punch out (nil): person has not punched out, work carries to next day
            if not punch_out:
                att.total_working_hours = Decimal('0')
                att.over_time = Decimal('0')
                att.punch_spans_next_day = False
            if data.get('over_time') is not None:
                att.over_time = data['over_time']
        att.save()
        # Audit log (who made the change)
        Adjustment.objects.create(
            emp_code=emp_code,
            adj_date=adj_date,
            adj_punch_in=old_punch_in,
            adj_punch_out=old_punch_out,
            adj_overtime=old_ot,
            reason=data.get('reason', '') or f'Adjusted by {admin_name}',
            created_by_admin=admin_name,
        )
        log_activity(request, 'adjust', 'attendance', 'attendance', emp_code, details={'date': str(adj_date), 'by': admin_name})
        from .shift_bonus import recalculate_shift_overtime_bonus_for_date
        from .penalty_logic import recalculate_late_penalty_for_date, _minutes_late
        recalculate_shift_overtime_bonus_for_date(emp_code, adj_date)
        recalculate_late_penalty_for_date(emp_code, adj_date, attendance=att)
        salary_type = (emp_salary_type or 'Monthly').strip() or 'Monthly'
        shift_start = shift_from or att.shift_from
        minutes_late = _minutes_late(att.punch_in, shift_start) if att.punch_in else 0
        penalty_note = None
        if minutes_late > 0:
            if salary_type.lower() in ('hourly', 'monthly'):
                penalty_note = f'Late-coming penalty applied ({minutes_late} min late). Check Penalty page.'
            else:
                penalty_note = f'No automatic penalty: only Hourly/Monthly get late penalty. This employee is {salary_type}.'
        response_data = {
            'success': True,
            'attendance': AttendanceSerializer(att).data,
        }
        if penalty_note:
            response_data['penalty_note'] = penalty_note
        return Response(response_data)


# ---------- Dashboard ----------
class DashboardView(APIView):
    _last_reward_run_date = None  # class-level cache to avoid running every request

    def get(self, request):
        current_admin, allowed_emp_codes = get_request_admin(request)
        today = timezone.localdate()
        emp_filter = Q()
        if allowed_emp_codes is not None:
            emp_filter = Q(emp_code__in=allowed_emp_codes) if allowed_emp_codes else Q(pk=None)
        # Auto-run reward engine once per day on first dashboard load (super only, for all companies)
        if current_admin and current_admin.is_super_admin and DashboardView._last_reward_run_date != today:
            try:
                run_reward_engine(today, company_id=None)
                DashboardView._last_reward_run_date = today
            except Exception:
                pass
        total_employees = Employee.objects.filter(emp_filter).count()  # all (including Inactive)
        active_employees = Employee.objects.filter(status__in=Employee.EMPLOYED_STATUSES).filter(emp_filter).count()  # not Inactive
        att_qs = Attendance.objects.filter(date=today)
        if allowed_emp_codes is not None:
            att_qs = att_qs.filter(emp_filter)
        punch_in_update_qs = Attendance.objects.filter(date=today, punch_in__isnull=False).exclude(status='Present')
        if allowed_emp_codes is not None:
            punch_in_update_qs = punch_in_update_qs.filter(emp_filter)
        punch_in_update_qs.update(status='Present')
        today_present = att_qs.filter(Q(punch_in__isnull=False) | Q(status='Present')).count()
        today_absent = max(active_employees - today_present, 0)  # absent among active (expected to work)
        week_start = today - timedelta(days=6)
        ot_leaders_qs = Attendance.objects.filter(date__gte=week_start, date__lte=today)
        if allowed_emp_codes is not None:
            ot_leaders_qs = ot_leaders_qs.filter(emp_filter)
        ot_leaders = list(ot_leaders_qs.values('emp_code', 'name').annotate(
            total_ot=Sum('over_time')
        ).order_by('-total_ot')[:10])
        red_flags_qs = PerformanceReward.objects.filter(
            entry_type='ACTION', admin_action_status='Pending'
        )
        if allowed_emp_codes is not None:
            red_flags_qs = red_flags_qs.filter(emp_filter)
        red_flags = list(red_flags_qs.values('emp_code', 'trigger_reason', 'metric_data', 'created_at')[:20])
        streak_qs = PerformanceReward.objects.filter(
            entry_type='REWARD', trigger_reason__icontains='Streak'
        ).order_by('-created_at')
        if allowed_emp_codes is not None:
            streak_qs = streak_qs.filter(emp_filter)
        streak_list = list(streak_qs.values('emp_code', 'trigger_reason', 'metric_data', 'created_at')[:15])
        if streak_list:
            emp_codes = [r['emp_code'] for r in streak_list]
            emp_lookup = {
                e['emp_code']: {'name': e.get('name') or '', 'department': e.get('dept_name') or ''}
                for e in Employee.objects.filter(emp_code__in=emp_codes).values('emp_code', 'name', 'dept_name')
            }
            for r in streak_list:
                r['name'] = emp_lookup.get(r['emp_code'], {}).get('name', '')
                r['department'] = emp_lookup.get(r['emp_code'], {}).get('department', '')
        return Response({
            'total_employees': total_employees,
            'active_employees': active_employees,
            'today_present': today_present,
            'today_absent': today_absent,
            'overtime_leaders': ot_leaders,
            'red_flag_employees': red_flags,
            'streak_rewards': streak_list,
        })


# ---------- Salary gross logic ----------
# Hourly: (total_working_hours + bonus_hours) × per_hour_rate. OT → bonus hours.
# Monthly: base_salary + (bonus_hours × hourly_rate). hourly_rate = base/208.
# Fixed: base_salary + (bonus_hours × hourly_rate). Bonus only when given by admin/leaderboard etc.
def _gross_and_rate(salary_type, base_salary, total_working_hours, overtime_hours, bonus_hours):
    """Returns (gross, hourly_rate). bonus_hours is stored in Salary.bonus."""
    base = Decimal(str(base_salary or 0))
    total_hrs = Decimal(str(total_working_hours or 0))
    bonus = Decimal(str(bonus_hours or 0))
    st = (salary_type or '').strip()
    if st == 'Hourly':
        hourly_rate = base
        gross = (total_hrs + bonus) * base
        return (gross, hourly_rate)
    if st == 'Fixed':
        hourly_rate = base / Decimal('208') if base else Decimal('0')
        gross = base + (bonus * hourly_rate)
        return (gross, hourly_rate)
    # Monthly: full monthly + bonus hours at hourly rate
    hourly_rate = base / Decimal('208') if base else Decimal('0')
    gross = base + (bonus * hourly_rate)
    return (gross, hourly_rate)


# ---------- Salary monthly (compute or return stored) ----------
class SalaryMonthlyView(APIView):
    def get(self, request):
        _, allowed_emp_codes = get_request_admin(request)
        month = request.query_params.get('month')
        year = request.query_params.get('year')
        if not month or not year:
            return Response({'error': 'month and year required'}, status=400)
        month, year = int(month), int(year)
        from .salary_logic import ensure_monthly_salaries
        ensure_monthly_salaries(year, month)
        salaries = Salary.objects.filter(month=month, year=year)
        if allowed_emp_codes is not None:
            salaries = salaries.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else salaries.none()
        emp_code_filter = request.query_params.get('emp_code', '').strip()
        if emp_code_filter:
            salaries = salaries.filter(emp_code__icontains=emp_code_filter)
        search = request.query_params.get('search', '').strip()
        if search:
            emp_qs = Employee.objects.filter(Q(emp_code__icontains=search) | Q(name__icontains=search))
            if allowed_emp_codes is not None:
                emp_qs = emp_qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else emp_qs.none()
            emp_codes = list(emp_qs.values_list('emp_code', flat=True))
            salaries = salaries.filter(emp_code__in=emp_codes)
        data = SalarySerializer(salaries.order_by('emp_code'), many=True).data
        advance_by_emp = get_advance_totals_by_emp(month=month, year=year)
        if allowed_emp_codes is not None:
            advance_by_emp = {k: v for k, v in advance_by_emp.items() if k in allowed_emp_codes} if allowed_emp_codes else {}
        penalty_by_emp = {}
        for r in Penalty.objects.filter(month=month, year=year).values('emp_code').annotate(total=Sum('deduction_amount')):
            penalty_by_emp[r['emp_code']] = r['total'] or Decimal('0')
        if allowed_emp_codes is not None:
            penalty_by_emp = {k: v for k, v in penalty_by_emp.items() if k in allowed_emp_codes} if allowed_emp_codes else {}
        today = timezone.localdate()
        # Earned so far (money from hours worked from 1st of month up to today)
        from calendar import monthrange
        first_day = date(year, month, 1)
        _, last_day_num = monthrange(year, month)
        last_day = date(year, month, last_day_num)
        end_date_so_far = today if (first_day <= today <= last_day) else last_day
        att_so_far = Attendance.objects.filter(
            date__gte=first_day, date__lte=end_date_so_far
        ).values('emp_code').annotate(
            total_hrs=Sum('total_working_hours'),
            total_ot=Sum('over_time'),
        )
        earned_so_far_by_emp = {}
        for r in att_so_far:
            earned_so_far_by_emp[r['emp_code']] = {
                'total_hrs': r['total_hrs'] or Decimal('0'),
                'total_ot': r['total_ot'] or Decimal('0'),
            }
        if allowed_emp_codes is not None:
            earned_so_far_by_emp = {k: v for k, v in earned_so_far_by_emp.items() if k in allowed_emp_codes} if allowed_emp_codes else {}  # noqa: E501
        # Attach today's working hours per employee (live calc if still punched in)
        now_time = timezone.localtime().time()
        today_att = {}
        att_today_qs = Attendance.objects.filter(date=today)
        if allowed_emp_codes is not None and allowed_emp_codes:
            att_today_qs = att_today_qs.filter(emp_code__in=allowed_emp_codes)
        for a in att_today_qs.values('emp_code', 'total_working_hours', 'punch_in', 'punch_out'):
            twh = a['total_working_hours'] or Decimal('0')
            # If punched in but not out yet, calculate live hours
            if a['punch_in'] and not a['punch_out'] and twh == 0:
                punch_h = a['punch_in'].hour + a['punch_in'].minute / 60
                now_h = now_time.hour + now_time.minute / 60
                diff = now_h - punch_h
                if diff < 0:
                    diff += 24
                twh = Decimal(str(round(diff, 2)))
            today_att[a['emp_code']] = twh
        # Attach employee details and today's hours
        emp_lookup = {}
        emp_codes_list = [r['emp_code'] for r in data]
        if emp_codes_list:
            for e in Employee.objects.filter(emp_code__in=emp_codes_list).values(
                'emp_code', 'name', 'dept_name', 'designation', 'shift', 'shift_from', 'shift_to'
            ):
                emp_lookup[e['emp_code']] = e
        # Today's punch status
        today_punch = {}
        for a in att_today_qs.values('emp_code', 'punch_in', 'punch_out', 'status'):
            today_punch[a['emp_code']] = a
        for row in data:
            ec = row['emp_code']
            emp = emp_lookup.get(ec, {})
            punch = today_punch.get(ec, {})
            row['today_hours'] = str(today_att.get(ec, 0))
            row['name'] = emp.get('name', '')
            row['dept_name'] = emp.get('dept_name', '')
            row['designation'] = emp.get('designation', '')
            row['shift'] = emp.get('shift', '')
            row['shift_from'] = str(emp['shift_from'])[:5] if emp.get('shift_from') else None
            row['shift_to'] = str(emp['shift_to'])[:5] if emp.get('shift_to') else None
            row['today_punch_in'] = str(punch['punch_in'])[:5] if punch.get('punch_in') else None
            row['today_punch_out'] = str(punch['punch_out'])[:5] if punch.get('punch_out') else None
            row['today_status'] = punch.get('status', '')
            # Avg daily hours
            dp = row.get('days_present', 0)
            twh = float(row.get('total_working_hours', 0) or 0)
            row['avg_daily_hours'] = str(round(twh / dp, 2)) if dp > 0 else '0'
            # Advance total for this month
            advance_total = advance_by_emp.get(ec, Decimal('0'))
            row['advance_total'] = str(advance_total)
            # Gross: bonus is always HOURS; bonus money = bonus_hours × hourly_rate (same for all types)
            gross, hourly_rate = _gross_and_rate(
                row.get('salary_type'),
                row.get('base_salary'),
                row.get('total_working_hours'),
                row.get('overtime_hours'),
                row.get('bonus'),
            )
            row['gross_salary'] = str(round(gross, 2))
            penalty_total = penalty_by_emp.get(ec, Decimal('0')) if (row.get('salary_type') or '').strip() == 'Hourly' else Decimal('0')
            row['penalty_deduction'] = str(penalty_total)
            row['net_pay'] = str(round(gross - advance_total - penalty_total, 2))
            # Earned so far (from 1st of month up to today, based on hours worked)
            so_far = earned_so_far_by_emp.get(ec, {'total_hrs': Decimal('0'), 'total_ot': Decimal('0')})
            hrs_so_far = so_far['total_hrs'] + so_far['total_ot']
            earned_so_far = (hrs_so_far * hourly_rate).quantize(Decimal('0.01'))
            row['earned_so_far'] = str(earned_so_far)
        return Response(data)


# ---------- Salary Advance ----------
def get_advance_totals_by_emp(month=None, year=None, month_year_list=None):
    """Return dict emp_code -> total advance amount. Either (month, year) or month_year_list [(m,y), ...]."""
    from django.db.models import Sum
    if month is not None and year is not None:
        qs = SalaryAdvance.objects.filter(month=month, year=year).values('emp_code').annotate(total=Sum('amount'))
    elif month_year_list:
        q = Q()
        for m, y in month_year_list:
            q = q | Q(month=m, year=y)
        qs = SalaryAdvance.objects.filter(q).values('emp_code').annotate(total=Sum('amount'))
    else:
        return {}
    return {r['emp_code']: (r['total'] or Decimal('0')) for r in qs}


class SalaryAdvanceListCreateView(APIView):
    def get(self, request):
        _, allowed_emp_codes = get_request_admin(request)
        month = request.query_params.get('month')
        year = request.query_params.get('year')
        emp_code_param = request.query_params.get('emp_code', '').strip()
        if emp_code_param:
            qs = SalaryAdvance.objects.filter(emp_code__iexact=emp_code_param).order_by('-year', '-month', '-created_at')
            if allowed_emp_codes is not None and emp_code_param not in allowed_emp_codes:
                qs = qs.none()
            if month and year:
                qs = qs.filter(month=int(month), year=int(year))
            data = SalaryAdvanceSerializer(qs, many=True).data
            return Response(data)
        if not month or not year:
            return Response({'error': 'month and year required (or provide emp_code for one employee)'}, status=400)
        month, year = int(month), int(year)
        qs = SalaryAdvance.objects.filter(month=month, year=year).order_by('-created_at', 'emp_code')
        if allowed_emp_codes is not None:
            qs = qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else qs.none()
        data = SalaryAdvanceSerializer(qs, many=True).data
        return Response(data)

    def post(self, request):
        _, allowed_emp_codes = get_request_admin(request)
        ser = SalaryAdvanceSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        emp_code = (ser.validated_data.get('emp_code') or '').strip()
        if not emp_code:
            return Response({'error': 'emp_code required'}, status=400)
        if allowed_emp_codes is not None and emp_code not in allowed_emp_codes:
            return Response({'error': 'Not allowed for this employee'}, status=403)
        obj = ser.save()
        log_activity(request, 'create', 'salary', 'advance', emp_code, details={
            'amount': str(obj.amount), 'month': obj.month, 'year': obj.year
        })
        return Response(SalaryAdvanceSerializer(obj).data, status=201)


class SalaryAdvanceDetailView(APIView):
    """Get or delete a single advance record."""
    def delete(self, request, pk):
        _, allowed_emp_codes = get_request_admin(request)
        try:
            obj = SalaryAdvance.objects.get(pk=pk)
        except SalaryAdvance.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        if allowed_emp_codes is not None and obj.emp_code not in allowed_emp_codes:
            return Response({'error': 'Not allowed to remove this advance'}, status=403)
        emp_code = obj.emp_code
        details = {'amount': str(obj.amount), 'month': obj.month, 'year': obj.year}
        obj.delete()
        log_activity(request, 'delete', 'salary', 'advance', emp_code, details=details)
        return Response(status=204)


# ---------- Leaderboard ----------
class LeaderboardView(APIView):
    def get(self, request):
        from calendar import monthrange
        _, allowed_emp_codes = get_request_admin(request)
        today = timezone.localdate()
        try:
            year = int(request.query_params.get('year', today.year))
            month = int(request.query_params.get('month', today.month))
        except (TypeError, ValueError):
            year, month = today.year, today.month
        _, last_day = monthrange(year, month)
        month_start = date(year, month, 1)
        month_end = date(year, month, last_day)

        rewards = PerformanceReward.objects.filter(
            is_on_leaderboard=True, entry_type='REWARD',
            created_at__date__gte=month_start,
            created_at__date__lte=month_end,
        )
        if allowed_emp_codes is not None:
            rewards = rewards.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else rewards.none()
        rewards = rewards.order_by('-created_at')[:50]

        reward_list = list(rewards.values('id', 'emp_code', 'entry_type', 'trigger_reason',
                                          'metric_data', 'is_on_leaderboard', 'admin_action_status',
                                          'created_at'))
        emp_codes = list(set(r['emp_code'] for r in reward_list))

        # Employee details
        emp_lookup = {}
        if emp_codes:
            for e in Employee.objects.filter(emp_code__in=emp_codes).values(
                'emp_code', 'name', 'dept_name', 'designation', 'shift', 'shift_from', 'shift_to'
            ):
                emp_lookup[e['emp_code']] = e

        # Monthly stats for selected month (use month_end or today if future)
        end_date = min(month_end, today)
        monthly_stats = {}
        for a in Attendance.objects.filter(
            emp_code__in=emp_codes, date__gte=month_start, date__lte=end_date
        ).values('emp_code').annotate(
            total_hours=Sum('total_working_hours'),
            total_ot=Sum('over_time'),
            days_present=Count('id', filter=Q(status='Present')),
        ):
            monthly_stats[a['emp_code']] = a

        # Streak count in selected month
        streak_counts = {}
        for r in PerformanceReward.objects.filter(
            emp_code__in=emp_codes,
            entry_type='REWARD',
            trigger_reason__icontains='Streak',
            created_at__date__gte=month_start,
            created_at__date__lte=month_end,
        ).values('emp_code').annotate(count=Count('id')):
            streak_counts[r['emp_code']] = r['count']

        # Bonus hours from Salary for selected month
        bonus_lookup = {}
        for s in Salary.objects.filter(
            emp_code__in=emp_codes, month=month, year=year
        ).values('emp_code', 'bonus'):
            bonus_lookup[s['emp_code']] = s['bonus']

        # Last time bonus was awarded (give_bonus / set_bonus) per employee
        last_bonus_at = {}
        if emp_codes:
            bonus_logs = AuditLog.objects.filter(
                module='bonus', action='update', target_id__in=emp_codes
            ).filter(
                Q(details__action='give_bonus') | Q(details__action='set_bonus')
            ).values('target_id', 'created_at').order_by('-created_at')
            for log in bonus_logs:
                ec = log['target_id']
                if ec not in last_bonus_at:
                    created = log['created_at']
                    last_bonus_at[ec] = created.isoformat() if hasattr(created, 'isoformat') else str(created)

        for r in reward_list:
            ec = r['emp_code']
            emp = emp_lookup.get(ec, {})
            stats = monthly_stats.get(ec, {})
            r['name'] = emp.get('name', '')
            r['dept_name'] = emp.get('dept_name', '')
            r['designation'] = emp.get('designation', '')
            r['shift'] = emp.get('shift', '')
            r['shift_from'] = str(emp['shift_from'])[:5] if emp.get('shift_from') else None
            r['shift_to'] = str(emp['shift_to'])[:5] if emp.get('shift_to') else None
            r['month_hours'] = str(stats.get('total_hours') or 0)
            r['month_ot'] = str(stats.get('total_ot') or 0)
            r['days_present'] = stats.get('days_present', 0)
            r['streak_count'] = streak_counts.get(ec, 0)
            r['bonus_hours'] = str(bonus_lookup.get(ec, 0))
            r['last_bonus_awarded_at'] = last_bonus_at.get(ec)

        return Response(reward_list)


# ---------- Absentee Alert ----------
class AbsenteeAlertView(APIView):
    def get(self, request):
        _, allowed_emp_codes = get_request_admin(request)
        items = PerformanceReward.objects.filter(
            entry_type='ACTION',
            trigger_reason__icontains='Absent'
        )
        if allowed_emp_codes is not None:
            items = items.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else items.none()
        items = items.order_by('-created_at')
        return Response(PerformanceRewardSerializer(items, many=True).data)


# ---------- Give bonus hours ----------
class GiveBonusView(APIView):
    def post(self, request):
        _, allowed_emp_codes = get_request_admin(request)
        emp_code = request.data.get('emp_code')
        bonus_hours = request.data.get('bonus_hours')
        if not emp_code or bonus_hours is None:
            return Response({'error': 'emp_code and bonus_hours required'}, status=400)
        if allowed_emp_codes is not None and emp_code not in allowed_emp_codes:
            return Response({'error': 'Not allowed for this employee'}, status=403)
        try:
            bonus_hours = Decimal(str(bonus_hours))
        except Exception:
            return Response({'error': 'Invalid bonus_hours'}, status=400)
        today = timezone.localdate()
        month = request.data.get('month')
        year = request.data.get('year')
        if month is not None and year is not None:
            try:
                month, year = int(month), int(year)
            except (TypeError, ValueError):
                month, year = today.month, today.year
        else:
            month, year = today.month, today.year
        sal, created = Salary.objects.get_or_create(
            emp_code=emp_code, month=month, year=year,
            defaults={'salary_type': 'Monthly', 'base_salary': Decimal('0')}
        )
        sal.bonus = (sal.bonus or Decimal('0')) + bonus_hours
        sal.save()
        log_activity(request, 'update', 'bonus', 'salary', emp_code, details={'action': 'give_bonus', 'hours': str(bonus_hours), 'new_bonus': str(sal.bonus), 'month': month, 'year': year})
        return Response({'success': True, 'emp_code': emp_code, 'new_bonus': str(sal.bonus)})


class GiveBonusBulkView(APIView):
    """POST { emp_codes: [...], bonus_hours: number, month?, year? } — award same bonus hours to multiple employees."""
    def post(self, request):
        _, allowed_emp_codes = get_request_admin(request)
        emp_codes = request.data.get('emp_codes')
        if not isinstance(emp_codes, list) or not emp_codes:
            return Response({'error': 'emp_codes must be a non-empty list'}, status=400)
        bonus_hours = request.data.get('bonus_hours')
        if bonus_hours is None:
            return Response({'error': 'bonus_hours required'}, status=400)
        try:
            bonus_hours = Decimal(str(bonus_hours))
        except Exception:
            return Response({'error': 'Invalid bonus_hours'}, status=400)
        if bonus_hours <= 0:
            return Response({'error': 'bonus_hours must be > 0'}, status=400)
        today = timezone.localdate()
        month = request.data.get('month')
        year = request.data.get('year')
        if month is not None and year is not None:
            try:
                month, year = int(month), int(year)
            except (TypeError, ValueError):
                month, year = today.month, today.year
        else:
            month, year = today.month, today.year
        awarded = 0
        errors = []
        for emp_code in emp_codes:
            if not emp_code:
                continue
            emp_code = str(emp_code).strip()
            if allowed_emp_codes is not None and emp_code not in allowed_emp_codes:
                errors.append({'emp_code': emp_code, 'reason': 'Not allowed'})
                continue
            try:
                sal, created = Salary.objects.get_or_create(
                    emp_code=emp_code, month=month, year=year,
                    defaults={'salary_type': 'Monthly', 'base_salary': Decimal('0')}
                )
                sal.bonus = (sal.bonus or Decimal('0')) + bonus_hours
                sal.save()
                log_activity(request, 'update', 'bonus', 'salary', emp_code, details={'action': 'give_bonus_bulk', 'hours': str(bonus_hours), 'new_bonus': str(sal.bonus), 'month': month, 'year': year})
                awarded += 1
            except Exception as e:
                errors.append({'emp_code': emp_code, 'reason': str(e)})
        return Response({'success': True, 'awarded': awarded, 'skipped': len(errors), 'errors': errors})


# ---------- Bonus Management ----------
class BonusOverviewView(APIView):
    """Comprehensive bonus data for the Bonus Management page."""
    def get(self, request):
        _, allowed_emp_codes = get_request_admin(request)
        today = timezone.localdate()
        month = int(request.query_params.get('month', today.month))
        year = int(request.query_params.get('year', today.year))
        search = request.query_params.get('search', '').strip()

        # Past months (e.g. January): backfill shift OT so bonus is counted
        if (year, month) < (today.year, today.month):
            try:
                from .shift_bonus import backfill_shift_overtime_bonus_for_month
                backfill_shift_overtime_bonus_for_month(year, month)
            except Exception:
                pass
        from .salary_logic import ensure_monthly_salaries
        ensure_monthly_salaries(year, month)

        salaries = Salary.objects.filter(month=month, year=year)
        if allowed_emp_codes is not None:
            salaries = salaries.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else salaries.none()
        if search:
            emp_qs = Employee.objects.filter(Q(emp_code__icontains=search) | Q(name__icontains=search))
            if allowed_emp_codes is not None:
                emp_qs = emp_qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else emp_qs.none()
            emp_codes = list(emp_qs.values_list('emp_code', flat=True))
            salaries = salaries.filter(emp_code__in=emp_codes)

        sal_list = list(salaries.order_by('-bonus', 'emp_code').values(
            'id', 'emp_code', 'bonus', 'overtime_hours', 'total_working_hours',
            'days_present', 'base_salary', 'salary_type', 'month', 'year'
        ))

        emp_codes_list = [s['emp_code'] for s in sal_list]
        emp_lookup = {}
        if emp_codes_list:
            for e in Employee.objects.filter(emp_code__in=emp_codes_list).values(
                'emp_code', 'name', 'dept_name', 'designation', 'shift', 'shift_from', 'shift_to'
            ):
                emp_lookup[e['emp_code']] = e

        # Compute monthly attendance stats for bonus recipients
        month_start = date(year, month, 1)
        if month == 12:
            month_end = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            month_end = date(year, month + 1, 1) - timedelta(days=1)

        att_stats = {}
        for a in Attendance.objects.filter(
            emp_code__in=emp_codes_list, date__gte=month_start, date__lte=month_end
        ).values('emp_code').annotate(
            total_hours=Sum('total_working_hours'),
            total_ot=Sum('over_time'),
            days=Count('id', filter=Q(status='Present')),
        ):
            att_stats[a['emp_code']] = a

        # Streak count per employee for this month
        streak_counts = {}
        for r in PerformanceReward.objects.filter(
            emp_code__in=emp_codes_list,
            entry_type='REWARD',
            trigger_reason__icontains='Streak',
            created_at__date__gte=month_start,
            created_at__date__lte=month_end,
        ).values('emp_code').annotate(count=Count('id')):
            streak_counts[r['emp_code']] = r['count']

        # Shift OT bonus (12h+ rule: 1h bonus per 2h extra) per employee for this month
        shift_ot_bonus_by_emp = {}
        for r in ShiftOvertimeBonus.objects.filter(
            emp_code__in=emp_codes_list,
            date__gte=month_start,
            date__lte=month_end,
        ).values('emp_code').annotate(total=Sum('bonus_hours')):
            shift_ot_bonus_by_emp[r['emp_code']] = float(r['total'] or 0)

        # Summary stats
        bonused = [s for s in sal_list if float(s['bonus'] or 0) > 0]
        total_bonus = sum(float(s['bonus'] or 0) for s in sal_list)
        highest_bonus = max((float(s['bonus'] or 0) for s in sal_list), default=0)
        avg_bonus = round(total_bonus / len(bonused), 2) if bonused else 0

        # Enrich each salary record
        employees = []
        for s in sal_list:
            ec = s['emp_code']
            emp = emp_lookup.get(ec, {})
            stats = att_stats.get(ec, {})
            employees.append({
                'id': s['id'],
                'emp_code': ec,
                'name': emp.get('name', ''),
                'dept_name': emp.get('dept_name', ''),
                'designation': emp.get('designation', ''),
                'shift': emp.get('shift', ''),
                'shift_from': str(emp['shift_from'])[:5] if emp.get('shift_from') else None,
                'shift_to': str(emp['shift_to'])[:5] if emp.get('shift_to') else None,
                'bonus': str(s['bonus']),
                'overtime_hours': str(s['overtime_hours']),
                'total_working_hours': str(s['total_working_hours']),
                'days_present': s['days_present'],
                'base_salary': str(s['base_salary']),
                'salary_type': s['salary_type'],
                'month_hours': str(stats.get('total_hours') or 0),
                'month_ot': str(stats.get('total_ot') or 0),
                'month_days': stats.get('days', 0),
                'streak_count': streak_counts.get(ec, 0),
                'shift_ot_bonus_hours': round(shift_ot_bonus_by_emp.get(ec, 0), 2),
            })

        return Response({
            'summary': {
                'total_bonus_hours': round(total_bonus, 2),
                'employees_with_bonus': len(bonused),
                'total_employees': len(sal_list),
                'highest_bonus': round(highest_bonus, 2),
                'avg_bonus': avg_bonus,
            },
            'employees': employees,
        })


class BonusEmployeeDetailsView(APIView):
    """GET: for Bonus page Details — when bonus was given (shift OT + manual), OT per day, punch in/out per day."""
    def get(self, request):
        _, allowed_emp_codes = get_request_admin(request)
        emp_code = request.query_params.get('emp_code', '').strip()
        month = request.query_params.get('month', '').strip()
        year = request.query_params.get('year', '').strip()
        if not emp_code or not month or not year:
            return Response({'error': 'emp_code, month, year required'}, status=400)
        try:
            month, year = int(month), int(year)
        except ValueError:
            return Response({'error': 'Invalid month/year'}, status=400)
        if allowed_emp_codes is not None and emp_code not in allowed_emp_codes:
            return Response({'error': 'Not allowed for this employee'}, status=403)
        from calendar import monthrange
        _, last_day = monthrange(year, month)
        month_start = date(year, month, 1)
        month_end = date(year, month, last_day)

        # Shift OT bonus: date, bonus_hours, description (when they were given bonus for 12h+ shift)
        shift_ot_list = list(
            ShiftOvertimeBonus.objects.filter(
                emp_code=emp_code,
                date__gte=month_start,
                date__lte=month_end,
            ).order_by('date').values('date', 'bonus_hours', 'description')
        )
        for r in shift_ot_list:
            r['date'] = r['date'].isoformat()
            r['bonus_hours'] = float(r['bonus_hours'] or 0)

        # Grants the user has "removed" (hidden) — we exclude these from the list
        hidden = set()
        for log in AuditLog.objects.filter(module='bonus', target_id=emp_code, action='update').order_by('-created_at')[:300]:
            d = log.details or {}
            if d.get('action') == 'hide_bonus_grant' and d.get('month') == month and d.get('year') == year:
                hidden.add((str(d.get('hours')), d.get('given_at') or ''))

        # Manual bonus grants from audit log (this month only); skip hidden
        manual_grants = []
        for log in AuditLog.objects.filter(
            module='bonus',
            target_id=emp_code,
            action='update',
        ).order_by('-created_at')[:100]:
            details = log.details or {}
            if details.get('action') != 'give_bonus':
                continue
            log_month = details.get('month')
            log_year = details.get('year')
            if log_month is not None and log_year is not None:
                try:
                    if int(log_month) != month or int(log_year) != year:
                        continue
                except (TypeError, ValueError):
                    pass
            given_at_str = log.created_at.isoformat() if log.created_at else ''
            if (str(details.get('hours')), given_at_str) in hidden:
                continue
            manual_grants.append({
                'given_at': given_at_str or None,
                'hours': details.get('hours'),
                'new_total': details.get('new_bonus'),
            })
        manual_grants.reverse()

        # Attendance for month: date, punch_in, punch_out, total_working_hours, over_time
        att_list = list(
            Attendance.objects.filter(
                emp_code=emp_code,
                date__gte=month_start,
                date__lte=month_end,
            ).order_by('date').values('date', 'punch_in', 'punch_out', 'total_working_hours', 'over_time')
        )
        for r in att_list:
            r['date'] = r['date'].isoformat()
            r['punch_in'] = str(r['punch_in'])[:5] if r.get('punch_in') else None
            r['punch_out'] = str(r['punch_out'])[:5] if r.get('punch_out') else None
            r['total_working_hours'] = float(r['total_working_hours'] or 0)
            r['over_time'] = float(r['over_time'] or 0)

        return Response({
            'emp_code': emp_code,
            'month': month,
            'year': year,
            'shift_ot_bonus': shift_ot_list,
            'manual_bonus_grants': manual_grants,
            'attendance': att_list,
        })


class HideBonusGrantView(APIView):
    """Mark a manual bonus grant as removed so it no longer appears in the list. Call after set_bonus to subtract."""
    def post(self, request):
        _, allowed_emp_codes = get_request_admin(request)
        emp_code = request.data.get('emp_code')
        month = request.data.get('month')
        year = request.data.get('year')
        hours = request.data.get('hours')
        given_at = request.data.get('given_at', '')
        if not emp_code or month is None or year is None:
            return Response({'error': 'emp_code, month, year required'}, status=400)
        if allowed_emp_codes is not None and emp_code not in allowed_emp_codes:
            return Response({'error': 'Not allowed for this employee'}, status=403)
        try:
            month, year = int(month), int(year)
        except (TypeError, ValueError):
            return Response({'error': 'Invalid month/year'}, status=400)
        log_activity(
            request, 'update', 'bonus', 'salary', emp_code,
            details={'action': 'hide_bonus_grant', 'month': month, 'year': year, 'hours': str(hours), 'given_at': given_at}
        )
        return Response({'success': True})


class SetBonusView(APIView):
    """Set bonus to an exact value (overwrite) or reset to 0. Optional month/year for target month."""
    def post(self, request):
        _, allowed_emp_codes = get_request_admin(request)
        emp_code = request.data.get('emp_code')
        bonus_hours = request.data.get('bonus_hours')
        if not emp_code or bonus_hours is None:
            return Response({'error': 'emp_code and bonus_hours required'}, status=400)
        if allowed_emp_codes is not None and emp_code not in allowed_emp_codes:
            return Response({'error': 'Not allowed for this employee'}, status=403)
        try:
            bonus_hours = Decimal(str(bonus_hours))
        except Exception:
            return Response({'error': 'Invalid bonus_hours'}, status=400)
        if bonus_hours < 0:
            return Response({'error': 'bonus_hours cannot be negative'}, status=400)
        today = timezone.localdate()
        month = request.data.get('month')
        year = request.data.get('year')
        if month is not None and year is not None:
            try:
                month, year = int(month), int(year)
            except (TypeError, ValueError):
                month, year = today.month, today.year
        else:
            month, year = today.month, today.year
        sal, created = Salary.objects.get_or_create(
            emp_code=emp_code, month=month, year=year,
            defaults={'salary_type': 'Monthly', 'base_salary': Decimal('0')}
        )
        sal.bonus = bonus_hours
        sal.save()
        log_activity(request, 'update', 'bonus', 'salary', emp_code, details={'action': 'set_bonus', 'bonus_hours': str(bonus_hours), 'month': month, 'year': year})
        return Response({'success': True, 'emp_code': emp_code, 'new_bonus': str(sal.bonus)})


# ---------- Penalty (late-coming deduction for Hourly employees) ----------
class PenaltyListView(APIView):
    """List penalties with filters: search + search_type (emp_code|name), emp_code, month, year, date_from, date_to."""
    def get(self, request):
        _, allowed_emp_codes = get_request_admin(request)
        qs = Penalty.objects.all().order_by('-date', 'emp_code')
        if allowed_emp_codes is not None:
            qs = qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else qs.none()
        emp_code_filter = request.query_params.get('emp_code', '').strip()
        if emp_code_filter:
            qs = qs.filter(emp_code=emp_code_filter)
        search = request.query_params.get('search', '').strip()
        if search:
            # Inbuilt: match emp_code OR name (one search box)
            emp_qs = Employee.objects.filter(
                Q(emp_code__icontains=search) | Q(name__icontains=search)
            )
            if allowed_emp_codes is not None:
                emp_qs = emp_qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else emp_qs.none()
            emp_codes = list(emp_qs.values_list('emp_code', flat=True))
            if emp_codes:
                qs = qs.filter(emp_code__in=emp_codes)
            else:
                qs = qs.none()
        month = request.query_params.get('month', '').strip()
        year = request.query_params.get('year', '').strip()
        if month:
            qs = qs.filter(month=int(month))
        if year:
            qs = qs.filter(year=int(year))
        date_from = request.query_params.get('date_from', '').strip()
        date_to = request.query_params.get('date_to', '').strip()
        if date_from:
            try:
                qs = qs.filter(date__gte=date_from)
            except ValueError:
                pass
        if date_to:
            try:
                qs = qs.filter(date__lte=date_to)
            except ValueError:
                pass
        attendance_map = {}
        name_by_emp_code = {}
        if qs.exists():
            penalty_keys = list(qs.values_list('emp_code', 'date'))
            emp_codes = list(set(k[0] for k in penalty_keys))
            attendances = Attendance.objects.filter(
                emp_code__in=emp_codes,
                date__in=[k[1] for k in penalty_keys]
            ).values('emp_code', 'date', 'punch_in', 'shift_from')
            for a in attendances:
                key = (a['emp_code'], str(a['date']))
                attendance_map[key] = {'punch_in': a['punch_in'], 'shift_from': a['shift_from']}
            for e in Employee.objects.filter(emp_code__in=emp_codes).values('emp_code', 'name'):
                name_by_emp_code[e['emp_code']] = e.get('name') or ''
        data = PenaltySerializer(
            qs, many=True,
            context={'attendance_map': attendance_map, 'name_by_emp_code': name_by_emp_code}
        ).data
        return Response(data)


class PenaltyCreateView(APIView):
    """Create manual penalty: emp_code, deduction_amount, description, date (optional, default today)."""
    def post(self, request):
        _, allowed_emp_codes = get_request_admin(request)
        emp_code = (request.data.get('emp_code') or '').strip()
        amount = request.data.get('deduction_amount') or request.data.get('amount')
        description = (request.data.get('description') or '').strip() or 'Manual penalty'
        penalty_date = request.data.get('date')
        if not emp_code:
            return Response({'error': 'emp_code required'}, status=400)
        if allowed_emp_codes is not None and emp_code not in allowed_emp_codes:
            return Response({'error': 'Not allowed for this employee'}, status=403)
        try:
            amount = Decimal(str(amount))
        except Exception:
            return Response({'error': 'Invalid deduction_amount'}, status=400)
        if amount < 0:
            return Response({'error': 'deduction_amount cannot be negative'}, status=400)
        if penalty_date:
            if isinstance(penalty_date, str):
                try:
                    penalty_date = date.fromisoformat(penalty_date)
                except ValueError:
                    return Response({'error': 'Invalid date'}, status=400)
        else:
            penalty_date = timezone.localdate()
        obj = Penalty.objects.create(
            emp_code=emp_code,
            date=penalty_date,
            month=penalty_date.month,
            year=penalty_date.year,
            minutes_late=0,
            deduction_amount=amount,
            rate_used=None,
            description=description[:500],
            is_manual=True,
        )
        log_activity(request, 'create', 'penalty', 'penalty', emp_code, details={'amount': str(amount), 'date': str(penalty_date)})
        return Response(PenaltySerializer(obj).data, status=201)


class PenaltyDetailView(APIView):
    """Get, update, or delete a penalty record (for adjustment page)."""
    def get(self, request, pk):
        _, allowed_emp_codes = get_request_admin(request)
        try:
            obj = Penalty.objects.get(pk=pk)
        except Penalty.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        if allowed_emp_codes is not None and obj.emp_code not in allowed_emp_codes:
            return Response({'error': 'Not allowed'}, status=403)
        return Response(PenaltySerializer(obj).data)

    def patch(self, request, pk):
        _, allowed_emp_codes = get_request_admin(request)
        try:
            obj = Penalty.objects.get(pk=pk)
        except Penalty.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        if allowed_emp_codes is not None and obj.emp_code not in allowed_emp_codes:
            return Response({'error': 'Not allowed'}, status=403)
        amount = request.data.get('deduction_amount') or request.data.get('amount')
        description = request.data.get('description')
        if amount is not None:
            try:
                obj.deduction_amount = Decimal(str(amount))
                if obj.deduction_amount < 0:
                    return Response({'error': 'deduction_amount cannot be negative'}, status=400)
            except Exception:
                return Response({'error': 'Invalid deduction_amount'}, status=400)
        if description is not None:
            obj.description = str(description)[:500]
        obj.save()
        log_activity(request, 'update', 'penalty', 'penalty', obj.emp_code, details={'id': pk})
        return Response(PenaltySerializer(obj).data)

    def delete(self, request, pk):
        _, allowed_emp_codes = get_request_admin(request)
        try:
            obj = Penalty.objects.get(pk=pk)
        except Penalty.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        if allowed_emp_codes is not None and obj.emp_code not in allowed_emp_codes:
            return Response({'error': 'Not allowed'}, status=403)
        emp_code = obj.emp_code
        obj.delete()
        log_activity(request, 'delete', 'penalty', 'penalty', emp_code, details={'id': pk})
        return Response(status=204)


# ---------- Run reward engine (manual trigger) ----------
class RunRewardEngineView(APIView):
    def post(self, request):
        admin, _ = get_request_admin(request)
        company_id = getattr(admin, 'company_id', None) if admin else None
        result = run_reward_engine(company_id=company_id)
        log_activity(request, 'run', 'rewards', 'reward_engine', '', details={**(result if isinstance(result, dict) else {'created': result}), 'company_id': company_id})
        return Response({'success': True, 'created': result})


# ---------- Export ----------
class ExportPayrollExcelView(APIView):
    """Export payroll-style Excel (Department, Status, date columns = daily earnings, TOTAL, Advance)."""
    def get(self, request):
        from django.http import HttpResponse
        _, allowed_emp_codes = get_request_admin(request)
        previous_day = request.query_params.get('previous_day', '').strip().lower() in ('1', 'true', 'yes')
        if previous_day:
            try:
                buf = generate_payroll_excel_previous_day(allowed_emp_codes=allowed_emp_codes)
            except Exception as e:
                return Response({'error': str(e)}, status=500)
            from django.utils import timezone
            yesterday = timezone.localdate() - timedelta(days=1)
            filename = f'payroll_previous_day_{yesterday.isoformat()}.xlsx'
            log_activity(request, 'export', 'export', 'payroll', '', details={'type': 'previous_day', 'filename': filename})
            response = HttpResponse(buf.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response

        month = request.query_params.get('month', '').strip()
        year = request.query_params.get('year', '').strip()
        single_date = request.query_params.get('date', '').strip()
        date_from = request.query_params.get('date_from', '').strip()
        date_to = request.query_params.get('date_to', '').strip()
        emp_code_param = request.query_params.get('emp_code', '').strip()

        month = int(month) if month else None
        year = int(year) if year else None
        d_from = None
        d_to = None
        d_single = None
        if single_date:
            try:
                d_single = date.fromisoformat(single_date)
            except ValueError:
                pass
        if date_from:
            try:
                d_from = date.fromisoformat(date_from)
            except ValueError:
                pass
        if date_to:
            try:
                d_to = date.fromisoformat(date_to)
            except ValueError:
                pass

        if emp_code_param and allowed_emp_codes is not None and emp_code_param not in allowed_emp_codes:
            return Response({'error': 'Not allowed to export this employee'}, status=403)
        try:
            buf = generate_payroll_excel(
                date_from=d_from, date_to=d_to, single_date=d_single,
                month=month, year=year,
                allowed_emp_codes=allowed_emp_codes,
                emp_code=emp_code_param or None
            )
        except Exception as e:
            return Response({'error': str(e)}, status=500)

        filename = 'payroll_export.xlsx'
        if emp_code_param:
            safe_ec = emp_code_param.replace('/', '_')
            if month and year:
                filename = f'payroll_{safe_ec}_{year}_{month:02d}.xlsx'
            elif d_single:
                filename = f'payroll_{safe_ec}_{d_single.isoformat()}.xlsx'
            elif d_from or d_to:
                filename = f'payroll_{safe_ec}_range.xlsx'
            else:
                filename = f'payroll_{safe_ec}.xlsx'
        elif month and year:
            filename = f'payroll_{year}_{month:02d}.xlsx'
        elif d_single:
            filename = f'payroll_{d_single.isoformat()}.xlsx'
        elif d_from or d_to:
            filename = 'payroll_range.xlsx'
        log_activity(request, 'export', 'export', 'payroll', '', details={'filename': filename, 'month': month, 'year': year})
        response = HttpResponse(buf.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class ExportEmployeeSalaryHistoryView(APIView):
    """Export full salary history for one employee as CSV."""
    def get(self, request):
        import csv
        from django.http import HttpResponse
        _, allowed_emp_codes = get_request_admin(request)
        emp_code = request.query_params.get('emp_code', '').strip()
        if not emp_code:
            return Response({'error': 'emp_code required'}, status=400)
        if allowed_emp_codes is not None and emp_code not in allowed_emp_codes:
            return Response({'error': 'Not allowed to export this employee'}, status=403)
        emp = Employee.objects.filter(emp_code=emp_code).first()
        if not emp:
            return Response({'error': 'Employee not found'}, status=404)
        salaries = Salary.objects.filter(emp_code=emp_code).order_by('-year', '-month')
        sal_list = list(SalarySerializer(salaries, many=True).data)
        for row in sal_list:
            m, y = row.get('month'), row.get('year')
            adv = get_advance_totals_by_emp(month=m, year=y)
            advance_total = adv.get(emp_code, Decimal('0'))
            row['advance_total'] = str(advance_total)
            penalty_total = Decimal('0')
            if (row.get('salary_type') or '').strip() == 'Hourly':
                agg = Penalty.objects.filter(emp_code=emp_code, month=m, year=y).aggregate(s=Sum('deduction_amount'))
                if agg.get('s') is not None:
                    penalty_total = agg['s']
            row['penalty_deduction'] = str(penalty_total)
            gross, _ = _gross_and_rate(
                row.get('salary_type'),
                row.get('base_salary'),
                row.get('total_working_hours'),
                row.get('overtime_hours'),
                row.get('bonus'),
            )
            row['gross_salary'] = str(round(gross, 2))
            row['net_pay'] = str(round(gross - advance_total - penalty_total, 2))
        fieldnames = ['emp_code', 'name', 'month', 'year', 'salary_type', 'base_salary', 'days_present',
                      'total_working_hours', 'overtime_hours', 'bonus', 'advance_total', 'penalty_deduction',
                      'gross_salary', 'net_pay']
        for row in sal_list:
            row['name'] = emp.name or ''
        response = HttpResponse(content_type='text/csv')
        safe_ec = emp_code.replace('/', '_')
        response['Content-Disposition'] = f'attachment; filename="salary_history_{safe_ec}.csv"'
        writer = csv.DictWriter(response, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        for row in sal_list:
            writer.writerow({k: row.get(k, '') for k in fieldnames})
        log_activity(request, 'export', 'export', 'employee_salary_history', emp_code, details={'rows': len(sal_list)})
        return response


class ExportView(APIView):
    def get(self, request):
        _, allowed_emp_codes = get_request_admin(request)
        export_type = request.query_params.get('type', 'csv')
        report = request.query_params.get('report', 'attendance')
        date_from = request.query_params.get('date_from', '').strip()
        date_to = request.query_params.get('date_to', '').strip()
        emp_code_filter = request.query_params.get('emp_code', '').strip()
        if report == 'employees':
            qs = Employee.objects.all()
            if allowed_emp_codes is not None:
                qs = qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else qs.none()
            if emp_code_filter:
                qs = qs.filter(emp_code__iexact=emp_code_filter)
            qs = qs.values(
                'emp_code', 'name', 'mobile', 'email', 'gender', 'dept_name',
                'designation', 'status', 'employment_type', 'salary_type', 'base_salary'
            )
            rows = list(qs)
            fieldnames = ['emp_code', 'name', 'mobile', 'email', 'gender', 'dept_name', 'designation', 'status', 'employment_type', 'salary_type', 'base_salary']
        elif report == 'attendance':
            qs = Attendance.objects.all()
            if allowed_emp_codes is not None:
                qs = qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else qs.none()
            if emp_code_filter:
                qs = qs.filter(emp_code__iexact=emp_code_filter)
            if date_from:
                qs = qs.filter(date__gte=date_from)
            if date_to:
                qs = qs.filter(date__lte=date_to)
            # Newest first so all dates of an employee are easy to read (no limit – full set)
            qs = qs.order_by('-date', 'emp_code')
            raw_rows = list(qs.values(
                'date', 'emp_code', 'name', 'punch_in', 'punch_out', 'status',
                'total_working_hours', 'total_break', 'over_time',
                'shift', 'shift_from', 'shift_to', 'punch_spans_next_day'
            ))
            # Per (emp_code, date): penalty on that day (amount, minutes late) – sum amount if multiple
            date_keys = set((r['emp_code'], r['date']) for r in raw_rows)
            penalty_by_date = {}  # (emp_code, date) -> {'amount': Decimal, 'minutes_late': int}
            if date_keys:
                emp_codes = set(k[0] for k in date_keys)
                dates = set(k[1] for k in date_keys)
                for p in Penalty.objects.filter(emp_code__in=emp_codes, date__in=dates).values(
                    'emp_code', 'date', 'deduction_amount', 'minutes_late'
                ):
                    key = (p['emp_code'], p['date'])
                    amt = p.get('deduction_amount') or Decimal('0')
                    mins = p.get('minutes_late') or 0
                    if key not in penalty_by_date:
                        penalty_by_date[key] = {'amount': amt, 'minutes_late': mins}
                    else:
                        penalty_by_date[key]['amount'] += amt
                        penalty_by_date[key]['minutes_late'] = max(penalty_by_date[key]['minutes_late'], mins)
            # Per (emp_code, month, year): advance, penalty total, to_be_paid (net for that month)
            periods = set((r['date'].month, r['date'].year) for r in raw_rows)
            advance_map = {}  # (emp_code, month, year) -> advance total
            penalty_map = {}  # (emp_code, month, year) -> penalty total
            to_be_paid_map = {}  # (emp_code, month, year) -> net pay
            for (m, y) in periods:
                adv = get_advance_totals_by_emp(month=m, year=y)
                if allowed_emp_codes is not None:
                    adv = {k: v for k, v in adv.items() if k in allowed_emp_codes}
                pen_qs = Penalty.objects.filter(month=m, year=y).values('emp_code').annotate(total=Sum('deduction_amount'))
                pen = {r['emp_code']: (r['total'] or Decimal('0')) for r in pen_qs}
                if allowed_emp_codes is not None:
                    pen = {k: v for k, v in pen.items() if k in allowed_emp_codes}
                emp_codes_in_period = set(r['emp_code'] for r in raw_rows if (r['date'].month, r['date'].year) == (m, y))
                for ec in emp_codes_in_period:
                    advance_map[(ec, m, y)] = adv.get(ec, Decimal('0'))
                    penalty_map[(ec, m, y)] = pen.get(ec, Decimal('0'))
                # Gross and to_be_paid from Salary for this month
                sal_list = list(Salary.objects.filter(month=m, year=y, emp_code__in=emp_codes_in_period).values(
                    'emp_code', 'salary_type', 'base_salary', 'total_working_hours', 'overtime_hours', 'bonus'
                ))
                for s in sal_list:
                    ec = s['emp_code']
                    gross, _ = _gross_and_rate(
                        s.get('salary_type'),
                        s.get('base_salary'),
                        s.get('total_working_hours'),
                        s.get('overtime_hours'),
                        s.get('bonus'),
                    )
                    adv_val = advance_map.get((ec, m, y), Decimal('0'))
                    pen_val = penalty_map.get((ec, m, y), Decimal('0'))
                    to_be_paid_map[(ec, m, y)] = round(gross - adv_val - pen_val, 2)
            # Easy-to-read column order and headers for attendance (with penalty this day, advance, penalty month, to be paid)
            fieldnames = [
                'Date', 'Employee Code', 'Employee Name', 'Punch In', 'Punch Out', 'Status',
                'Working Hours', 'Break (hrs)', 'Overtime', 'Shift', 'Shift Start', 'Shift End', 'Punch to next day',
                'Penalty (this day)', 'Minutes late (this day)',
                'Advance (month)', 'Penalty (month)', 'To be paid (month)'
            ]
            rows = []
            for r in raw_rows:
                d = r.get('date')
                ec = r.get('emp_code')
                m, y = d.month, d.year
                key = (ec, m, y)
                date_key = (ec, d)
                penalty_today = penalty_by_date.get(date_key, {})
                penalty_amount_today = penalty_today.get('amount', Decimal('0'))
                minutes_late_today = penalty_today.get('minutes_late', '')
                advance_val = advance_map.get(key, Decimal('0'))
                penalty_val = penalty_map.get(key, Decimal('0'))
                to_be_paid_val = to_be_paid_map.get(key, '')
                rows.append({
                    'Date': d,
                    'Employee Code': ec,
                    'Employee Name': r.get('name'),
                    'Punch In': r.get('punch_in'),
                    'Punch Out': r.get('punch_out'),
                    'Status': r.get('status'),
                    'Working Hours': r.get('total_working_hours'),
                    'Break (hrs)': r.get('total_break'),
                    'Overtime': r.get('over_time'),
                    'Shift': r.get('shift'),
                    'Shift Start': r.get('shift_from'),
                    'Shift End': r.get('shift_to'),
                    'Punch to next day': 'Yes' if r.get('punch_spans_next_day') else 'No',
                    'Penalty (this day)': penalty_amount_today,
                    'Minutes late (this day)': minutes_late_today,
                    'Advance (month)': advance_val,
                    'Penalty (month)': penalty_val,
                    'To be paid (month)': to_be_paid_val,
                })
        else:
            rows = []
            fieldnames = []
        if export_type == 'csv':
            import csv
            from django.http import HttpResponse

            def csv_value(v):
                if v is None:
                    return ''
                if hasattr(v, 'isoformat'):
                    s = v.isoformat()
                    # Date only: YYYY-MM-DD (strip time if present)
                    if 'T' in s:
                        s = s.split('T')[0]
                    elif len(s) > 10 and s[10:11] == ' ':
                        s = s.split(' ')[0]
                    return s
                if hasattr(v, 'hour'):  # time object
                    return v.strftime('%H:%M') if v else ''
                return str(v)

            csv_filename = f'{report}.csv'
            if emp_code_filter:
                safe_emp = ''.join(c for c in emp_code_filter if c.isalnum() or c in '-_')[:30] or 'employee'
                csv_filename = f'{report}_{safe_emp}.csv'
            log_activity(request, 'export', 'export', report, '', details={'type': 'csv', 'filename': csv_filename, 'rows': len(rows), 'emp_code': emp_code_filter or None})
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="{csv_filename}"'
            if fieldnames:
                writer = csv.DictWriter(response, fieldnames=fieldnames, extrasaction='ignore')
                writer.writeheader()
                for r in rows:
                    writer.writerow({k: csv_value(v) for k, v in r.items()})
            else:
                response.write('No data\n')
            return response
        log_activity(request, 'export', 'export', report, '', details={'type': 'json', 'rows': len(rows)})
        return Response({'rows': rows})


# ---------- Employee profile (detail + history) ----------
class EmployeeProfileView(APIView):
    def get(self, request, emp_code):
        _, allowed_emp_codes = get_request_admin(request)
        emp = Employee.objects.filter(emp_code=emp_code).first()
        if not emp:
            return Response({'error': 'Not found'}, status=404)
        if allowed_emp_codes is not None and emp_code not in allowed_emp_codes:
            return Response({'error': 'Not allowed to view this employee'}, status=403)
        att_list = Attendance.objects.filter(emp_code=emp_code).order_by('-date')[:100]
        rewards = PerformanceReward.objects.filter(emp_code=emp_code).order_by('-created_at')[:50]
        adjustments = Adjustment.objects.filter(emp_code=emp_code).order_by('-created_at')[:20]
        salaries = Salary.objects.filter(emp_code=emp_code).order_by('-year', '-month')[:24]
        sal_list = SalarySerializer(salaries, many=True).data
        for row in sal_list:
            m, y = row.get('month'), row.get('year')
            adv = get_advance_totals_by_emp(month=m, year=y)
            advance_total = adv.get(emp_code, Decimal('0'))
            row['advance_total'] = str(advance_total)
            penalty_total = Decimal('0')
            if (row.get('salary_type') or '').strip() == 'Hourly':
                agg = Penalty.objects.filter(emp_code=emp_code, month=m, year=y).aggregate(s=Sum('deduction_amount'))
                if agg.get('s') is not None:
                    penalty_total = agg['s']
            row['penalty_deduction'] = str(penalty_total)
            gross, _ = _gross_and_rate(
                row.get('salary_type'),
                row.get('base_salary'),
                row.get('total_working_hours'),
                row.get('overtime_hours'),
                row.get('bonus'),
            )
            row['gross_salary'] = str(round(gross, 2))
            row['net_pay'] = str(round(gross - advance_total - penalty_total, 2))
        # Calendar + stats for current month (same as employee dashboard)
        today = timezone.localdate()
        y, m = today.year, today.month
        first_day = date(y, m, 1)
        last_day = (first_day.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        days_this_month = Attendance.objects.filter(
            emp_code=emp_code, date__year=y, date__month=m, status='Present'
        ).count()
        agg = Attendance.objects.filter(
            emp_code=emp_code, date__year=y, date__month=m
        ).aggregate(tot=Sum('total_working_hours'), ot=Sum('over_time'))
        hours_this_month = float(agg['tot'] or 0) + float(agg['ot'] or 0)
        status_qs = Attendance.objects.filter(
            emp_code=emp_code, date__year=y, date__month=m
        ).values_list('date', 'status')
        status_map = {str(d): s for d, s in status_qs}
        daily_status = []
        for i in range(1, last_day.day + 1):
            d = date(y, m, i)
            key = d.isoformat()
            daily_status.append({'date': key, 'day': i, 'status': status_map.get(key)})
        return Response({
            'employee': EmployeeSerializer(emp).data,
            'attendance': AttendanceSerializer(att_list, many=True).data,
            'rewards': PerformanceRewardSerializer(rewards, many=True).data,
            'adjustments': AdjustmentSerializer(adjustments, many=True).data,
            'salaries': sal_list,
            'daily_status': daily_status,
            'days_this_month': days_this_month,
            'hours_this_month': round(hours_this_month, 2),
        })


# ---------- System owner (same login; sees all companies, employees, admins) ----------
def get_system_owner(request):
    """Return current admin if they are system owner, else None."""
    admin, _ = get_request_admin(request)
    if admin and getattr(admin, 'is_system_owner', False):
        return admin
    return None


class SystemOwnerDashboardView(APIView):
    """GET: overview stats, recent activity, and notifications for system owner."""
    def get(self, request):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        companies_count = Company.objects.count()
        employees_count = Employee.objects.count()
        admins_count = Admin.objects.count()
        pending_company_requests_count = CompanyRegistrationRequest.objects.filter(status=CompanyRegistrationRequest.STATUS_PENDING).count()
        recent_requests = CompanyRegistrationRequest.objects.all().order_by('-created_at')[:5]
        recent_companies = Company.objects.all().order_by('-created_at')[:5]
        recent_company_requests = []
        for r in recent_requests:
            recent_company_requests.append({
                'id': r.id,
                'company_name': r.company_name,
                'contact_email': r.contact_email,
                'created_at': r.created_at.isoformat() if r.created_at else None,
            })
        recent_companies_data = []
        for c in recent_companies:
            recent_companies_data.append({
                'id': c.id,
                'name': c.name,
                'code': c.code,
                'created_at': c.created_at.isoformat() if c.created_at else None,
            })
        notifications = []
        for r in recent_requests[:10]:
            notifications.append({
                'type': 'company_request',
                'id': r.id,
                'title': 'New company registration request',
                'message': f'{r.company_name} — {r.contact_email}',
                'link': '/system-owner/company-requests',
                'created_at': r.created_at.isoformat() if r.created_at else None,
            })
        return Response({
            'companies_count': companies_count,
            'employees_count': employees_count,
            'admins_count': admins_count,
            'pending_company_requests_count': pending_company_requests_count,
            'recent_company_requests': recent_company_requests,
            'recent_companies': recent_companies_data,
            'notifications': notifications,
        })


class SystemOwnerNotificationsView(APIView):
    """GET: lightweight notifications for header bell (count + items). System owner only."""
    def get(self, request):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        pending_count = CompanyRegistrationRequest.objects.filter(status=CompanyRegistrationRequest.STATUS_PENDING).count()
        recent = CompanyRegistrationRequest.objects.all().order_by('-created_at')[:8]
        items = []
        for r in recent:
            items.append({
                'type': 'company_request',
                'id': r.id,
                'title': f'Request: {r.company_name}',
                'subtitle': r.contact_email,
                'link': '/system-owner/company-requests',
                'created_at': r.created_at.isoformat() if r.created_at else None,
            })
        return Response({'count': pending_count, 'items': items})


class SystemOwnerProfileView(APIView):
    """GET: current system owner profile. PATCH: update name, email, password, phone (system owner only)."""
    def get(self, request):
        admin = get_system_owner(request)
        if not admin:
            return Response({'error': 'System owner only'}, status=403)
        return Response(AdminProfileSerializer(admin).data)

    def patch(self, request):
        admin = get_system_owner(request)
        if not admin:
            return Response({'error': 'System owner only'}, status=403)
        ser = AdminUpdateSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        if 'name' in ser.validated_data:
            admin.name = ser.validated_data['name']
        if 'email' in ser.validated_data:
            new_email = ser.validated_data['email']
            if Admin.objects.filter(email__iexact=new_email).exclude(pk=admin.pk).exists():
                return Response({'error': 'This email is already used by another admin.'}, status=400)
            admin.email = new_email
        if 'password' in ser.validated_data:
            admin.password = ser.validated_data['password']
        if 'phone' in ser.validated_data:
            admin.phone = (ser.validated_data['phone'] or '')[:20]
        admin.save()
        log_activity(request, 'update', 'system_owner', 'profile', str(admin.pk), details={'updated': list(ser.validated_data.keys())})
        return Response(AdminProfileSerializer(admin).data)


class SystemOwnerSettingsView(APIView):
    """GET/PATCH: system owner settings (e.g. company registration notification emails)."""
    def get(self, request):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        company_registration_emails = ''
        try:
            obj = SystemSetting.objects.get(key='company_registration_email')
            company_registration_emails = (obj.value or '').strip()
        except SystemSetting.DoesNotExist:
            company_registration_emails = getattr(settings, 'COMPANY_REGISTRATION_EMAIL', '')
        return Response({'company_registration_emails': company_registration_emails})

    def patch(self, request):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        company_registration_emails = request.data.get('company_registration_emails')
        if company_registration_emails is not None:
            value = str(company_registration_emails).strip()[:255]
            SystemSetting.objects.update_or_create(
                key='company_registration_email',
                defaults={'value': value, 'description': 'Comma-separated emails to receive company registration requests'}
            )
        return self.get(request)


class SystemOwnerSmtpListView(APIView):
    """GET: list all SMTP configs (by priority). POST: create new config. System owner only."""
    def get(self, request):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        configs = EmailSmtpConfig.objects.all().order_by('priority', 'id')
        return Response(EmailSmtpConfigSerializer(configs, many=True).data)

    def post(self, request):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        ser = EmailSmtpConfigSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        # Default priority to end of list when not provided
        if 'priority' not in (request.data or {}):
            max_prio = EmailSmtpConfig.objects.aggregate(m=Max('priority'))['m']
            ser.validated_data['priority'] = (max_prio or -1) + 1
        config = ser.save()
        log_activity(request, 'create', 'system_owner', 'smtp', str(config.pk), details={'smtp_server': config.smtp_server})
        return Response(EmailSmtpConfigSerializer(config).data, status=201)


class SystemOwnerSmtpDetailView(APIView):
    """GET/PATCH/DELETE: single SMTP config. System owner only."""
    def get(self, request, pk):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        try:
            config = EmailSmtpConfig.objects.get(pk=pk)
        except EmailSmtpConfig.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        return Response(EmailSmtpConfigSerializer(config).data)

    def patch(self, request, pk):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        try:
            config = EmailSmtpConfig.objects.get(pk=pk)
        except EmailSmtpConfig.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        ser = EmailSmtpConfigSerializer(config, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        log_activity(request, 'update', 'system_owner', 'smtp', str(pk), details={})
        return Response(EmailSmtpConfigSerializer(config).data)

    def delete(self, request, pk):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        try:
            config = EmailSmtpConfig.objects.get(pk=pk)
        except EmailSmtpConfig.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        config.delete()
        log_activity(request, 'delete', 'system_owner', 'smtp', str(pk), details={})
        return Response(status=204)


class SystemOwnerCompanyListView(APIView):
    """GET: list all companies with employee/admin counts. POST: create company (system owner only)."""
    def get(self, request):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        companies = Company.objects.all().order_by('name')
        return Response(CompanySerializer(companies, many=True).data)

    def post(self, request):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        name = (request.data.get('name') or '').strip()[:255]
        code = (request.data.get('code') or '').strip()[:50]
        if not name or not code:
            return Response({'error': 'name and code required'}, status=400)
        if Company.objects.filter(code=code).exists():
            return Response({'error': 'Company code already exists'}, status=400)
        contact_email = (request.data.get('contact_email') or '').strip()[:254]
        contact_phone = (request.data.get('contact_phone') or '').strip()[:50]
        address = (request.data.get('address') or '').strip()
        is_active = request.data.get('is_active')
        if is_active is None:
            is_active = True
        else:
            is_active = bool(is_active)
        company = Company.objects.create(
            name=name, code=code,
            contact_email=contact_email, contact_phone=contact_phone, address=address,
            is_active=is_active
        )
        log_activity(request, 'create', 'system_owner', 'company', str(company.pk), details={'name': name, 'code': code})
        return Response(CompanySerializer(company).data, status=201)


class SystemOwnerCompanyDetailView(APIView):
    """GET/PATCH: single company (system owner only)."""
    def get(self, request, pk):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        try:
            company = Company.objects.get(pk=pk)
        except Company.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        return Response(CompanySerializer(company).data)

    def patch(self, request, pk):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        try:
            company = Company.objects.get(pk=pk)
        except Company.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        name = request.data.get('name')
        code = request.data.get('code')
        contact_email = request.data.get('contact_email')
        contact_phone = request.data.get('contact_phone')
        address = request.data.get('address')
        is_active = request.data.get('is_active')
        if name is not None:
            company.name = str(name).strip()[:255]
        if code is not None:
            code = str(code).strip()[:50]
            if code and Company.objects.filter(code=code).exclude(pk=pk).exists():
                return Response({'error': 'Company code already exists'}, status=400)
            company.code = code or company.code
        if contact_email is not None:
            company.contact_email = str(contact_email).strip()[:254] if contact_email else ''
        if contact_phone is not None:
            company.contact_phone = str(contact_phone).strip()[:50] if contact_phone else ''
        if address is not None:
            company.address = str(address).strip() if address else ''
        if is_active is not None:
            company.is_active = bool(is_active)
        company.save()
        log_activity(request, 'update', 'system_owner', 'company', str(pk), details={})
        return Response(CompanySerializer(company).data)

    def delete(self, request, pk):
        """Delete company and all employees and admins under it. System owner only."""
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        try:
            company = Company.objects.get(pk=pk)
        except Company.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        emp_codes = list(Employee.objects.filter(company_id=pk).values_list('emp_code', flat=True))
        with transaction.atomic():
            if emp_codes:
                Penalty.objects.filter(emp_code__in=emp_codes).delete()
                LeaveRequest.objects.filter(emp_code__in=emp_codes).delete()
                PerformanceReward.objects.filter(emp_code__in=emp_codes).delete()
                ShiftOvertimeBonus.objects.filter(emp_code__in=emp_codes).delete()
                Adjustment.objects.filter(emp_code__in=emp_codes).delete()
                SalaryAdvance.objects.filter(emp_code__in=emp_codes).delete()
                Salary.objects.filter(emp_code__in=emp_codes).delete()
                Attendance.objects.filter(emp_code__in=emp_codes).delete()
            Employee.objects.filter(company_id=pk).delete()
            Admin.objects.filter(company_id=pk).exclude(pk=1).filter(is_system_owner=False).delete()
            Admin.objects.filter(company_id=pk).update(company_id=None)
            company.delete()
        log_activity(request, 'delete', 'system_owner', 'company', str(pk), details={'name': getattr(company, 'name', '')})
        return Response(status=204)


class SystemOwnerEmployeeListView(APIView):
    """GET: list all employees (system owner only). Optional ?company_id=. POST: create employee (system owner only)."""
    def get(self, request):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        qs = Employee.objects.all().order_by('emp_code')
        company_id = request.query_params.get('company_id', '').strip()
        if company_id:
            try:
                qs = qs.filter(company_id=int(company_id))
            except ValueError:
                pass
        data = EmployeeSerializer(qs, many=True).data
        return Response(data)

    def post(self, request):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        from .serializers import EmployeeSerializer as EmpSer
        data = dict(request.data)
        company_id = request.data.get('company_id') or request.data.get('company')
        if company_id is not None:
            try:
                data['company'] = int(company_id)
            except (TypeError, ValueError):
                data['company'] = None
        ser = EmpSer(data=data)
        ser.is_valid(raise_exception=True)
        emp = ser.save()
        log_activity(request, 'create', 'system_owner', 'employee', emp.emp_code, details={'name': emp.name})
        return Response(EmployeeSerializer(emp).data, status=201)


class SystemOwnerEmployeeNextEmpCodeView(APIView):
    """GET: return next suggested emp_code (numeric) for system owner add employee."""
    def get(self, request):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        import re
        existing = list(Employee.objects.values_list('emp_code', flat=True))
        max_num = 0
        for code in existing:
            if not code:
                continue
            s = str(code).strip()
            m = re.search(r'(\d+)$', s)
            if m:
                max_num = max(max_num, int(m.group(1)))
            elif s.isdigit():
                max_num = max(max_num, int(s))
        return Response({'next_emp_code': str(max_num + 1)})


class SystemOwnerEmployeeDetailView(APIView):
    """GET/PATCH: single employee by id or emp_code (system owner only)."""
    def get(self, request, pk):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        emp = Employee.objects.filter(pk=pk).first() or Employee.objects.filter(emp_code=pk).first()
        if not emp:
            return Response({'error': 'Not found'}, status=404)
        return Response(EmployeeSerializer(emp).data)

    def patch(self, request, pk):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        emp = Employee.objects.filter(pk=pk).first() or Employee.objects.filter(emp_code=pk).first()
        if not emp:
            return Response({'error': 'Not found'}, status=404)
        from .serializers import EmployeeSerializer as EmpSer
        ser = EmpSer(emp, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        log_activity(request, 'update', 'system_owner', 'employee', emp.emp_code, details={})
        return Response(ser.data)


class SystemOwnerAdminListView(APIView):
    """GET: list all admins with company. POST: create admin (system owner only). Optional company_id to assign admin to company."""
    def get(self, request):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        admins = Admin.objects.all().order_by('id').select_related('company')
        return Response(AdminListSerializer(admins, many=True).data)

    def post(self, request):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        ser = AdminCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        admin = ser.save()
        log_activity(request, 'create', 'system_owner', 'admin', str(admin.pk), details={'email': admin.email, 'company_id': getattr(admin, 'company_id', None)})
        # When admin is assigned to a company (e.g. from Add company flow), send one email with company + admin login (Tubematic)
        if getattr(admin, 'company_id', None):
            try:
                company = Company.objects.get(pk=admin.company_id)
                admin_password = (request.data.get('password') or '').strip()
                lines = [
                    'Your company has been created and an admin account has been set up.',
                    '',
                    '— Company —',
                    f'Company: {company.name}',
                    f'Code: {company.code}',
                    f'Contact email: {company.contact_email or "-"}',
                    f'Contact phone: {company.contact_phone or "-"}',
                    f'Address: {company.address or "-"}',
                    '',
                    '— Admin login (super admin for this company) —',
                    f'Email: {admin.email}',
                    f'Password: {admin_password or "(not set)"}',
                    '',
                    'Do not share this data.',
                ]
                body = '\n'.join(lines)
                subject = f'Company and admin access — {company.name}'
                from .email_smtp import send_simple_email
                to_email = (getattr(company, 'contact_email', None) or '').strip() or admin.email
                ok, err = send_simple_email(to_email, subject, body, from_name='Tubematic')
                if not ok:
                    import logging
                    logging.getLogger(__name__).warning('Company+admin email to %s failed (multi SMTP): %s', to_email, err)
            except Company.DoesNotExist:
                pass
        return Response(AdminListSerializer(admin).data, status=201)


class SystemOwnerAdminDetailView(APIView):
    """PATCH: update admin access/department/company (system owner only)."""
    def patch(self, request, pk):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        try:
            admin = Admin.objects.get(pk=pk)
        except Admin.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        ser = AdminAccessUpdateSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        if 'department' in ser.validated_data:
            admin.department = ser.validated_data['department'] or ''
        if 'role' in ser.validated_data and admin.pk != 1:
            admin.role = ser.validated_data['role']
        if 'access' in ser.validated_data:
            admin.access = ser.validated_data['access']
        company_id = request.data.get('company_id')
        if company_id is not None:
            if company_id == '' or company_id is None:
                admin.company_id = None
            else:
                try:
                    admin.company_id = int(company_id)
                except (ValueError, TypeError):
                    pass
        admin.save()
        log_activity(request, 'update', 'system_owner', 'admin', str(pk), details={})
        return Response(AdminListSerializer(admin).data)


# Owner contact for decline emails (contact for further notice)
COMPANY_REQUEST_OWNER_CONTACTS = 'divyamdharod@tubematic.in / deveshgoswami191@gmail.com'


class SystemOwnerCompanyRegistrationRequestListView(APIView):
    """GET: list all company registration requests (from Register your company form). System owner only."""
    def get(self, request):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        requests = CompanyRegistrationRequest.objects.all().order_by('-created_at')
        data = []
        for r in requests:
            data.append({
                'id': r.id,
                'company_name': r.company_name,
                'contact_email': r.contact_email,
                'contact_phone': r.contact_phone or '',
                'address': r.address or '',
                'extra_data': r.extra_data or {},
                'status': getattr(r, 'status', 'pending'),
                'created_at': r.created_at.isoformat() if r.created_at else None,
            })
        return Response(data)


class SystemOwnerCompanyRegistrationRequestDetailView(APIView):
    """GET: single company registration request. System owner only."""
    def get(self, request, pk):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        try:
            r = CompanyRegistrationRequest.objects.get(pk=pk)
        except CompanyRegistrationRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        return Response({
            'id': r.id,
            'company_name': r.company_name,
            'contact_email': r.contact_email,
            'contact_phone': r.contact_phone or '',
            'address': r.address or '',
            'extra_data': r.extra_data or {},
            'status': getattr(r, 'status', 'pending'),
            'created_at': r.created_at.isoformat() if r.created_at else None,
        })


class SystemOwnerCompanyRegistrationRequestDeclineView(APIView):
    """POST: decline a request with reason; send email to requester. System owner only."""
    def post(self, request, pk):
        if not get_system_owner(request):
            return Response({'error': 'System owner only'}, status=403)
        try:
            r = CompanyRegistrationRequest.objects.get(pk=pk)
        except CompanyRegistrationRequest.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        if getattr(r, 'status', 'pending') == 'declined':
            return Response({'error': 'Request already declined'}, status=400)
        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response({'error': 'reason is required'}, status=400)
        r.status = CompanyRegistrationRequest.STATUS_DECLINED
        r.save(update_fields=['status'])
        body = (
            f'Your company registration request for "{r.company_name}" has been declined.\n\n'
            f'Reason: {reason}\n\n'
            f'For further information, please contact the owner: {COMPANY_REQUEST_OWNER_CONTACTS}\n'
        )
        subject = f'Company registration update: {r.company_name}'
        from .email_smtp import send_simple_email
        ok, err = send_simple_email(r.contact_email, subject, body, from_name='Carrigar')
        if not ok:
            import logging
            logging.getLogger(__name__).warning('Decline email to %s failed (multi SMTP): %s', r.contact_email, err)
        log_activity(request, 'update', 'system_owner', 'company_request', str(pk), details={'action': 'decline', 'reason': reason[:200]})
        return Response({'success': True, 'message': 'Decline email sent.'})
