from django.http import JsonResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Count, Q
from django.utils import timezone
from datetime import date, timedelta
from decimal import Decimal

from .models import (
    Admin, Employee, Attendance, Salary, SalaryAdvance, Adjustment,
    PerformanceReward, Holiday, SystemSetting, AuditLog
)
from .serializers import (
    AdminSerializer, AdminProfileSerializer, AdminUpdateSerializer,
    AdminListSerializer, AdminAccessUpdateSerializer, AdminCreateSerializer,
    DEFAULT_ACCESS,
    AuditLogSerializer,
    EmployeeSerializer, AttendanceSerializer,
    SalarySerializer, SalaryAdvanceSerializer, AdjustmentSerializer,
    PerformanceRewardSerializer, HolidaySerializer, SystemSettingSerializer,
    AdminLoginSerializer, AttendanceAdjustPayloadSerializer,
)
from .excel_upload import upload_employees_excel, upload_attendance_excel, upload_shift_excel, upload_force_punch_excel
from .reward_engine import run_reward_engine
from .export_excel import generate_payroll_excel, generate_payroll_excel_previous_day
from .audit_logging import log_activity, log_activity_manual


# ---------- Auth & request admin ----------
def get_request_admin(request):
    """
    Get current admin from X-Admin-Id header. Returns (admin, allowed_emp_codes).
    allowed_emp_codes = None means no filter (super admin or no header); list of emp_codes for dept admin.
    """
    admin_id = request.headers.get('X-Admin-Id', '').strip()
    if not admin_id:
        return None, None
    try:
        admin = Admin.objects.get(pk=int(admin_id))
    except (ValueError, Admin.DoesNotExist):
        return None, None
    if admin.is_super_admin:
        return admin, None
    if not admin.department:
        return admin, []
    emp_codes = list(
        Employee.objects.filter(dept_name=admin.department).values_list('emp_code', flat=True)
    )
    return admin, emp_codes


class AdminLoginView(APIView):
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
        return Response({
            'success': True,
            'admin': data,
            'message': 'Login successful',
        })


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
            admin.email = ser.validated_data['email']
        if 'password' in ser.validated_data:
            admin.password = ser.validated_data['password']
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
        result = upload_employees_excel(f, preview=preview)
        if not result.get('success'):
            return Response(result, status=400)
        if not preview:
            log_activity(request, 'upload', 'upload', 'employees', '', details={'filename': getattr(f, 'name', ''), 'result': result})
        return Response(result)


class UploadAttendanceView(APIView):
    def post(self, request):
        f = request.FILES.get('file')
        if not f:
            return Response({'success': False, 'error': 'No file'}, status=400)
        preview = request.data.get('preview', 'false').lower() == 'true'
        result = upload_attendance_excel(f, preview=preview)
        if not result.get('success'):
            return Response(result, status=400)
        # Auto-run reward engine after actual upload (not preview)
        if not preview:
            try:
                reward_result = run_reward_engine()
                result['rewards'] = reward_result
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
        result = upload_shift_excel(f, preview=preview)
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
        result = upload_force_punch_excel(f, preview=preview)
        if not result.get('success'):
            return Response(result, status=400)
        if not preview:
            try:
                reward_result = run_reward_engine()
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

        # Also return distinct filter options
        if request.query_params.get('include_filters', '').lower() == 'true':
            all_emps = self.get_queryset().filter(status='Active')
            departments = sorted(set(all_emps.values_list('dept_name', flat=True).distinct()) - {''})
            designations = sorted(set(all_emps.values_list('designation', flat=True).distinct()) - {''})
            shifts = sorted(set(all_emps.exclude(shift='').values_list('shift', flat=True).distinct()))
            genders = sorted(set(all_emps.values_list('gender', flat=True).distinct()) - {''})
            join_years = sorted(set(
                Employee.objects.dates('created_at', 'year').values_list('created_at__year', flat=True)
            ))
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


class AttendanceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Attendance.objects.all()
    serializer_class = AttendanceSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['emp_code', 'status']

    def get_queryset(self):
        today = timezone.localdate()
        Attendance.objects.filter(
            date=today,
            punch_in__isnull=False
        ).exclude(status='Present').update(status='Present')
        qs = super().get_queryset()
        _, allowed_emp_codes = get_request_admin(self.request)
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


class SystemSettingViewSet(viewsets.ModelViewSet):
    queryset = SystemSetting.objects.all()
    serializer_class = SystemSettingSerializer
    lookup_field = 'key'
    lookup_url_kwarg = 'key'

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


def _calc_overtime_from_punch(punch_in, punch_out, shift_from, shift_to):
    """OT = working_hours - expected_shift_hours (whole hours only)."""
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
        # Update
        punch_in = data.get('punch_in') if data.get('punch_in') is not None else att.punch_in
        punch_out = data.get('punch_out') if data.get('punch_out') is not None else att.punch_out
        if data.get('punch_in') is not None:
            att.punch_in = data['punch_in']
        if data.get('punch_out') is not None:
            att.punch_out = data['punch_out']
        # Auto-calculate overtime when punch_in and punch_out are set
        # Use shift from attendance record, or fallback to employee's assigned shift
        shift_from = att.shift_from
        shift_to = att.shift_to
        if not shift_from or not shift_to:
            emp = Employee.objects.filter(emp_code=emp_code).values('shift', 'shift_from', 'shift_to').first()
            if emp and emp.get('shift_from') and emp.get('shift_to'):
                shift_from = emp['shift_from']
                shift_to = emp['shift_to']
                att.shift = emp.get('shift', '')
                att.shift_from = shift_from
                att.shift_to = shift_to
        if punch_in and punch_out and shift_from and shift_to:
            att.over_time = _calc_overtime_from_punch(punch_in, punch_out, shift_from, shift_to)
            # Also update total_working_hours and punch_spans_next_day from punch times
            in_h = _time_to_decimal_hours(punch_in)
            out_h = _time_to_decimal_hours(punch_out)
            diff = out_h - in_h
            if diff < 0:
                diff += 24
            att.total_working_hours = Decimal(str(round(diff, 2)))
            att.punch_spans_next_day = _punch_spans_next_day(punch_in, punch_out)
        elif data.get('over_time') is not None:
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
        return Response({
            'success': True,
            'attendance': AttendanceSerializer(att).data,
        })


# ---------- Dashboard ----------
class DashboardView(APIView):
    _last_reward_run_date = None  # class-level cache to avoid running every request

    def get(self, request):
        current_admin, allowed_emp_codes = get_request_admin(request)
        today = timezone.localdate()
        emp_filter = Q()
        if allowed_emp_codes is not None:
            emp_filter = Q(emp_code__in=allowed_emp_codes) if allowed_emp_codes else Q(pk=None)
        # Auto-run reward engine once per day on first dashboard load (super only to avoid partial run)
        if not current_admin or current_admin.is_super_admin:
            if DashboardView._last_reward_run_date != today:
                try:
                    run_reward_engine(today)
                    DashboardView._last_reward_run_date = today
                except Exception:
                    pass
        total_employees = Employee.objects.filter(status='Active').filter(emp_filter).count()
        att_qs = Attendance.objects.filter(date=today)
        if allowed_emp_codes is not None:
            att_qs = att_qs.filter(emp_filter)
        Attendance.objects.filter(
            date=today,
            punch_in__isnull=False
        ).exclude(status='Present').update(status='Present')
        today_present = att_qs.filter(Q(punch_in__isnull=False) | Q(status='Present')).count()
        today_absent = max(total_employees - today_present, 0)
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
            'today_present': today_present,
            'today_absent': today_absent,
            'overtime_leaders': ot_leaders,
            'red_flag_employees': red_flags,
            'streak_rewards': streak_list,
        })


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
        search = request.query_params.get('search', '').strip()
        if search:
            emp_codes = Employee.objects.filter(
                Q(emp_code__icontains=search) | Q(name__icontains=search)
            ).values_list('emp_code', flat=True)
            salaries = salaries.filter(emp_code__in=emp_codes)
        data = SalarySerializer(salaries.order_by('emp_code'), many=True).data
        advance_by_emp = get_advance_totals_by_emp(month=month, year=year)
        if allowed_emp_codes is not None:
            advance_by_emp = {k: v for k, v in advance_by_emp.items() if k in allowed_emp_codes} if allowed_emp_codes else {}
        # Attach today's working hours per employee (live calc if still punched in)
        today = timezone.localdate()
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
            # Gross: Monthly = base + bonus + (OT hrs * hourly_rate); Hourly = total_hrs * rate + bonus
            base = Decimal(str(row.get('base_salary') or 0))
            bonus = Decimal(str(row.get('bonus') or 0))
            ot_hrs = Decimal(str(row.get('overtime_hours') or 0))
            total_hrs = Decimal(str(row.get('total_working_hours') or 0))
            if (row.get('salary_type') or '').strip() == 'Hourly':
                gross = (total_hrs * base) + bonus
            else:
                hourly_rate = base / Decimal('208') if base else Decimal('0')  # 26*8
                gross = (total_hrs * hourly_rate) + bonus + (ot_hrs * hourly_rate)
            row['gross_salary'] = str(round(gross, 2))
            row['net_pay'] = str(round(gross - advance_total, 2))
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
        if not month or not year:
            return Response({'error': 'month and year required'}, status=400)
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


# ---------- Leaderboard ----------
class LeaderboardView(APIView):
    def get(self, request):
        _, allowed_emp_codes = get_request_admin(request)
        today = timezone.localdate()
        month_start = today.replace(day=1)
        week_start = today - timedelta(days=6)

        rewards = PerformanceReward.objects.filter(
            is_on_leaderboard=True, entry_type='REWARD'
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

        # Monthly stats per employee
        monthly_stats = {}
        for a in Attendance.objects.filter(
            emp_code__in=emp_codes, date__gte=month_start, date__lte=today
        ).values('emp_code').annotate(
            total_hours=Sum('total_working_hours'),
            total_ot=Sum('over_time'),
            days_present=Count('id', filter=Q(status='Present')),
        ):
            monthly_stats[a['emp_code']] = a

        # Streak count per employee (how many streak rewards this month)
        streak_counts = {}
        for r in PerformanceReward.objects.filter(
            emp_code__in=emp_codes,
            entry_type='REWARD',
            trigger_reason__icontains='Streak',
            created_at__date__gte=month_start,
        ).values('emp_code').annotate(count=Count('id')):
            streak_counts[r['emp_code']] = r['count']

        # Bonus hours from Salary for current month
        bonus_lookup = {}
        for s in Salary.objects.filter(
            emp_code__in=emp_codes, month=today.month, year=today.year
        ).values('emp_code', 'bonus'):
            bonus_lookup[s['emp_code']] = s['bonus']

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
        sal, created = Salary.objects.get_or_create(
            emp_code=emp_code, month=today.month, year=today.year,
            defaults={'salary_type': 'Monthly', 'base_salary': Decimal('0')}
        )
        sal.bonus = sal.bonus + bonus_hours
        sal.save()
        log_activity(request, 'update', 'bonus', 'salary', emp_code, details={'action': 'give_bonus', 'hours': str(bonus_hours), 'new_bonus': str(sal.bonus)})
        return Response({'success': True, 'emp_code': emp_code, 'new_bonus': str(sal.bonus)})


# ---------- Bonus Management ----------
class BonusOverviewView(APIView):
    """Comprehensive bonus data for the Bonus Management page."""
    def get(self, request):
        _, allowed_emp_codes = get_request_admin(request)
        today = timezone.localdate()
        month = int(request.query_params.get('month', today.month))
        year = int(request.query_params.get('year', today.year))
        search = request.query_params.get('search', '').strip()

        from .salary_logic import ensure_monthly_salaries
        ensure_monthly_salaries(year, month)

        salaries = Salary.objects.filter(month=month, year=year)
        if allowed_emp_codes is not None:
            salaries = salaries.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else salaries.none()
        if search:
            emp_codes = Employee.objects.filter(
                Q(emp_code__icontains=search) | Q(name__icontains=search)
            ).values_list('emp_code', flat=True)
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


class SetBonusView(APIView):
    """Set bonus to an exact value (overwrite) or reset to 0."""
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
        sal, created = Salary.objects.get_or_create(
            emp_code=emp_code, month=today.month, year=today.year,
            defaults={'salary_type': 'Monthly', 'base_salary': Decimal('0')}
        )
        sal.bonus = bonus_hours
        sal.save()
        log_activity(request, 'update', 'bonus', 'salary', emp_code, details={'action': 'set_bonus', 'bonus_hours': str(bonus_hours)})
        return Response({'success': True, 'emp_code': emp_code, 'new_bonus': str(sal.bonus)})


# ---------- Run reward engine (manual trigger) ----------
class RunRewardEngineView(APIView):
    def post(self, request):
        result = run_reward_engine()
        log_activity(request, 'run', 'rewards', 'reward_engine', '', details=result if isinstance(result, dict) else {'created': result})
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

        try:
            buf = generate_payroll_excel(
                date_from=d_from, date_to=d_to, single_date=d_single,
                month=month, year=year,
                allowed_emp_codes=allowed_emp_codes
            )
        except Exception as e:
            return Response({'error': str(e)}, status=500)

        filename = 'payroll_export.xlsx'
        if month and year:
            filename = f'payroll_{year}_{month:02d}.xlsx'
        elif d_single:
            filename = f'payroll_{d_single.isoformat()}.xlsx'
        elif d_from or d_to:
            filename = 'payroll_range.xlsx'
        log_activity(request, 'export', 'export', 'payroll', '', details={'filename': filename, 'month': month, 'year': year})
        response = HttpResponse(buf.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
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
            qs = Attendance.objects.all().order_by('date', 'emp_code')
            if allowed_emp_codes is not None:
                qs = qs.filter(emp_code__in=allowed_emp_codes) if allowed_emp_codes else qs.none()
            if emp_code_filter:
                qs = qs.filter(emp_code__iexact=emp_code_filter)
            if date_from:
                qs = qs.filter(date__gte=date_from)
            if date_to:
                qs = qs.filter(date__lte=date_to)
            rows = list(qs.values(
                'emp_code', 'name', 'date', 'shift', 'shift_from', 'shift_to',
                'punch_in', 'punch_out', 'punch_spans_next_day', 'total_working_hours', 'total_break', 'status', 'over_time'
            ))
            fieldnames = ['emp_code', 'name', 'date', 'shift', 'shift_from', 'shift_to', 'punch_in', 'punch_out', 'punch_spans_next_day', 'total_working_hours', 'total_break', 'status', 'over_time']
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
                    return v.isoformat()
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
            base = Decimal(str(row.get('base_salary') or 0))
            bonus = Decimal(str(row.get('bonus') or 0))
            ot_hrs = Decimal(str(row.get('overtime_hours') or 0))
            total_hrs = Decimal(str(row.get('total_working_hours') or 0))
            if (row.get('salary_type') or '').strip() == 'Hourly':
                gross = (total_hrs * base) + bonus
            else:
                hourly_rate = base / Decimal('208') if base else Decimal('0')
                gross = (total_hrs * hourly_rate) + bonus + (ot_hrs * hourly_rate)
            row['gross_salary'] = str(round(gross, 2))
            row['net_pay'] = str(round(gross - advance_total, 2))
        return Response({
            'employee': EmployeeSerializer(emp).data,
            'attendance': AttendanceSerializer(att_list, many=True).data,
            'rewards': PerformanceRewardSerializer(rewards, many=True).data,
            'adjustments': AdjustmentSerializer(adjustments, many=True).data,
            'salaries': sal_list,
        })
