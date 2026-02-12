from rest_framework import serializers
from .models import (
    Admin, Employee, Attendance, Salary, Adjustment,
    PerformanceReward, Holiday, SystemSetting
)


class AdminLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class AdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Admin
        fields = ['id', 'name', 'email', 'phone']


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


class EmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = [
            'id', 'emp_code', 'name', 'mobile', 'email', 'gender',
            'dept_name', 'designation', 'status', 'employment_type', 'salary_type',
            'base_salary', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class AttendanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attendance
        fields = [
            'id', 'emp_code', 'name', 'date', 'punch_in', 'punch_out',
            'total_working_hours', 'total_break', 'status', 'over_time',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class SalarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Salary
        fields = ['id', 'emp_code', 'salary_type', 'base_salary', 'overtime_hours', 'bonus', 'month', 'year', 'created_at']


class AdjustmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Adjustment
        fields = [
            'id', 'emp_code', 'adj_date', 'adj_punch_in', 'adj_punch_out',
            'adj_overtime', 'reason', 'created_by_admin', 'created_at'
        ]
        read_only_fields = ['created_at']


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


class AttendanceAdjustPayloadSerializer(serializers.Serializer):
    emp_code = serializers.CharField()
    date = serializers.DateField()
    punch_in = serializers.TimeField(required=False, allow_null=True)
    punch_out = serializers.TimeField(required=False, allow_null=True)
    over_time = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True)
