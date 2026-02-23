from django.contrib import admin
from .models import (
    Admin, Company, Employee, Attendance, Salary, SalaryAdvance, Adjustment,
    ShiftOvertimeBonus, Penalty, PenaltyInquiry, PerformanceReward, Holiday,
    LeaveRequest, SystemSetting, EmailSmtpConfig,
)


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ('id', 'code', 'name', 'is_active')
    list_filter = ('is_active',)


@admin.register(Admin)
class AdminModelAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'email', 'phone', 'company', 'department', 'role')


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ('emp_code', 'name', 'company', 'dept_name', 'designation', 'status', 'employment_type', 'salary_type')
    list_filter = ('status', 'employment_type', 'salary_type', 'company')
    search_fields = ('emp_code', 'name', 'email')


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ('emp_code', 'name', 'date', 'punch_in', 'punch_out', 'status', 'total_working_hours', 'over_time')
    list_filter = ('date', 'status')
    search_fields = ('emp_code', 'name')


@admin.register(Salary)
class SalaryAdmin(admin.ModelAdmin):
    list_display = ('emp_code', 'month', 'year', 'base_salary', 'overtime_hours', 'bonus')


@admin.register(SalaryAdvance)
class SalaryAdvanceAdmin(admin.ModelAdmin):
    list_display = ('emp_code', 'amount', 'month', 'year', 'date_given', 'note', 'created_at')
    list_filter = ('year', 'month')


@admin.register(Adjustment)
class AdjustmentAdmin(admin.ModelAdmin):
    list_display = ('emp_code', 'adj_date', 'reason', 'created_by_admin', 'created_at')


@admin.register(ShiftOvertimeBonus)
class ShiftOvertimeBonusAdmin(admin.ModelAdmin):
    list_display = ('emp_code', 'date', 'bonus_hours', 'description', 'created_at')
    list_filter = ('date',)
    search_fields = ('emp_code', 'description')


@admin.register(Penalty)
class PenaltyAdmin(admin.ModelAdmin):
    list_display = ('emp_code', 'date', 'minutes_late', 'deduction_amount', 'rate_used', 'is_manual', 'description', 'created_at')
    list_filter = ('date', 'is_manual')
    search_fields = ('emp_code', 'description')


@admin.register(PerformanceReward)
class PerformanceRewardAdmin(admin.ModelAdmin):
    list_display = ('emp_code', 'entry_type', 'trigger_reason', 'is_on_leaderboard', 'admin_action_status', 'created_at')
    list_filter = ('entry_type', 'admin_action_status')


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ('id', 'emp_code', 'from_date', 'to_date', 'status', 'dept_name', 'requested_at', 'reviewed_by')
    list_filter = ('status', 'dept_name')


@admin.register(PenaltyInquiry)
class PenaltyInquiryAdmin(admin.ModelAdmin):
    list_display = ('id', 'penalty', 'emp_code', 'status', 'created_at', 'reviewed_by')
    list_filter = ('status',)


@admin.register(Holiday)
class HolidayAdmin(admin.ModelAdmin):
    list_display = ('date', 'name', 'year')


@admin.register(SystemSetting)
class SystemSettingAdmin(admin.ModelAdmin):
    list_display = ('key', 'value', 'description')


@admin.register(EmailSmtpConfig)
class EmailSmtpConfigAdmin(admin.ModelAdmin):
    list_display = ('id', 'smtp_server', 'smtp_port', 'auth_username', 'force_sender', 'is_active', 'updated_at')
    list_filter = ('is_active',)
    fields = ('smtp_server', 'smtp_port', 'auth_username', 'auth_password', 'force_sender', 'error_logfile', 'debug_logfile', 'is_active')
