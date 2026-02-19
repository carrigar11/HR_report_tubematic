from rest_framework import serializers
from .models import (
    Admin, Employee, Attendance, Salary, SalaryAdvance, Adjustment,
    Penalty, PerformanceReward, Holiday, SystemSetting, EmailSmtpConfig, AuditLog
)


class AdminLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


# Default access flags for new dept admins (all True; super can change)
DEFAULT_ACCESS = {
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


class AdminSerializer(serializers.ModelSerializer):
    """Login response: id, name, email, role, department, access (id=1 always super_admin with full access)."""
    role = serializers.SerializerMethodField()
    department = serializers.CharField(read_only=True)
    access = serializers.JSONField(read_only=True)

    class Meta:
        model = Admin
        fields = ['id', 'name', 'email', 'phone', 'role', 'department', 'access']

    def get_role(self, obj):
        return 'super_admin' if obj.pk == 1 else (obj.role or 'dept_admin')


class AdminProfileSerializer(serializers.ModelSerializer):
    """For settings page: name, email, password (all read for display; only name is writable via update)."""
    class Meta:
        model = Admin
        fields = ['id', 'name', 'email', 'password', 'phone']
        read_only_fields = ['email', 'password', 'phone']


class AdminUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    email = serializers.EmailField(required=False)
    password = serializers.CharField(max_length=255, required=False)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)


class AdminListSerializer(serializers.ModelSerializer):
    """For super admin: list all admins with role, department, access."""
    class Meta:
        model = Admin
        fields = ['id', 'name', 'email', 'phone', 'department', 'role', 'access']


class AdminAccessUpdateSerializer(serializers.Serializer):
    """Super admin only: update another admin's department, role, access."""
    department = serializers.CharField(max_length=100, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=Admin.ROLE_CHOICES, required=False)
    access = serializers.JSONField(required=False)


class AdminCreateSerializer(serializers.Serializer):
    """Super admin only: create new admin with name, email, password, department, role, access."""
    name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    password = serializers.CharField(max_length=255)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    department = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    role = serializers.ChoiceField(choices=Admin.ROLE_CHOICES, default='dept_admin')
    access = serializers.JSONField(required=False, default=dict)

    def create(self, validated_data):
        access = validated_data.get('access') or {}
        access = {**DEFAULT_ACCESS, **access}
        return Admin.objects.create(
            name=validated_data['name'],
            email=validated_data['email'],
            password=validated_data['password'],
            phone=validated_data.get('phone', ''),
            department=validated_data.get('department', ''),
            role=validated_data.get('role', 'dept_admin'),
            access=access,
        )

    def validate_email(self, value):
        if Admin.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An admin with this email already exists.')
        return value


class EmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = [
            'id', 'emp_code', 'name', 'mobile', 'email', 'gender',
            'dept_name', 'designation', 'status', 'employment_type', 'salary_type',
            'base_salary', 'shift', 'shift_from', 'shift_to', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class AttendanceSerializer(serializers.ModelSerializer):
    shift_ot_bonus_hours = serializers.SerializerMethodField()
    shift_ot_bonus_description = serializers.SerializerMethodField()
    penalty_amount = serializers.SerializerMethodField()
    penalty_description = serializers.SerializerMethodField()
    penalty_id = serializers.SerializerMethodField()

    class Meta:
        model = Attendance
        fields = [
            'id', 'emp_code', 'name', 'date', 'shift', 'shift_from', 'shift_to',
            'punch_in', 'punch_out', 'punch_spans_next_day', 'total_working_hours', 'total_break',
            'status', 'over_time', 'shift_ot_bonus_hours', 'shift_ot_bonus_description',
            'penalty_amount', 'penalty_description', 'penalty_id',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_shift_ot_bonus_hours(self, obj):
        from .models import ShiftOvertimeBonus
        rec = ShiftOvertimeBonus.objects.filter(emp_code=obj.emp_code, date=obj.date).first()
        return float(rec.bonus_hours) if rec and rec.bonus_hours else 0

    def get_shift_ot_bonus_description(self, obj):
        from .models import ShiftOvertimeBonus
        rec = ShiftOvertimeBonus.objects.filter(emp_code=obj.emp_code, date=obj.date).first()
        return (rec.description or '') if rec else ''

    def get_penalty_amount(self, obj):
        rec = Penalty.objects.filter(emp_code=obj.emp_code, date=obj.date).first()
        return float(rec.deduction_amount) if rec and rec.deduction_amount else 0

    def get_penalty_description(self, obj):
        rec = Penalty.objects.filter(emp_code=obj.emp_code, date=obj.date).first()
        return (rec.description or '') if rec else ''

    def get_penalty_id(self, obj):
        rec = Penalty.objects.filter(emp_code=obj.emp_code, date=obj.date).first()
        return rec.id if rec else None


class SalarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Salary
        fields = ['id', 'emp_code', 'salary_type', 'base_salary', 'overtime_hours', 'total_working_hours', 'days_present', 'bonus', 'month', 'year', 'created_at']


class SalaryAdvanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalaryAdvance
        fields = ['id', 'emp_code', 'amount', 'month', 'year', 'date_given', 'note', 'created_at']
        read_only_fields = ['created_at']


class AdjustmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Adjustment
        fields = [
            'id', 'emp_code', 'adj_date', 'adj_punch_in', 'adj_punch_out',
            'adj_overtime', 'reason', 'created_by_admin', 'created_at'
        ]
        read_only_fields = ['created_at']


class PenaltySerializer(serializers.ModelSerializer):
    punch_in_time = serializers.SerializerMethodField()
    shift_start_time = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()

    class Meta:
        model = Penalty
        fields = [
            'id', 'emp_code', 'name', 'date', 'month', 'year', 'minutes_late',
            'deduction_amount', 'rate_used', 'description', 'is_manual', 'created_at',
            'punch_in_time', 'shift_start_time'
        ]
        read_only_fields = ['created_at']

    def get_name(self, obj):
        return (self.context.get('name_by_emp_code') or {}).get(obj.emp_code, '')

    def get_punch_in_time(self, obj):
        if obj.is_manual:
            return None
        m = self.context.get('attendance_map') or {}
        info = m.get((obj.emp_code, str(obj.date)))
        if not info or not info.get('punch_in'):
            return None
        t = info['punch_in']
        return t.strftime('%I:%M %p').lstrip('0') if t else None  # e.g. 9:23 AM

    def get_shift_start_time(self, obj):
        if obj.is_manual:
            return None
        m = self.context.get('attendance_map') or {}
        info = m.get((obj.emp_code, str(obj.date)))
        if not info:
            return None
        t = info.get('shift_from')
        return t.strftime('%I:%M %p').lstrip('0') if t else None  # e.g. 9:00 AM


class PerformanceRewardSerializer(serializers.ModelSerializer):
    class Meta:
        model = PerformanceReward
        fields = [
            'id', 'emp_code', 'entry_type', 'trigger_reason', 'metric_data',
            'is_on_leaderboard', 'admin_action_status', 'created_at'
        ]
        read_only_fields = ['created_at']


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = ['id', 'date', 'name', 'year', 'created_at']


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = ['id', 'key', 'value', 'description', 'updated_at']


class EmailSmtpConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailSmtpConfig
        fields = [
            'id', 'smtp_server', 'smtp_port', 'auth_username', 'auth_password',
            'force_sender', 'error_logfile', 'debug_logfile', 'is_active',
            'created_at', 'updated_at',
        ]
        extra_kwargs = {'auth_password': {'write_only': False}}  # allow read for editing in settings


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = ['id', 'admin_id', 'admin_name', 'admin_email', 'action', 'module', 'target_type', 'target_id', 'details', 'ip_address', 'user_agent', 'created_at']
        read_only_fields = fields


class AttendanceAdjustPayloadSerializer(serializers.Serializer):
    emp_code = serializers.CharField()
    date = serializers.DateField()
    punch_in = serializers.TimeField(required=False, allow_null=True)
    punch_out = serializers.TimeField(required=False, allow_null=True)
    over_time = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True)
