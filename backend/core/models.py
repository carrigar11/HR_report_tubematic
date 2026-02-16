"""
HR Employee & Attendance Management System - Database Models.
All tables linked by emp_code (unique employee identifier).
"""
from django.db import models
from decimal import Decimal


class Admin(models.Model):
    """Login system for HR admins. id=1 is super admin; others can be department admins."""
    ROLE_SUPER = 'super_admin'
    ROLE_DEPT = 'dept_admin'
    ROLE_CHOICES = [(ROLE_SUPER, 'Super Admin'), (ROLE_DEPT, 'Department Admin')]

    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    password = models.CharField(max_length=255)  # plain text for now as per spec
    # Department admin: only see data for this department (blank = all for super)
    department = models.CharField(max_length=100, blank=True)
    # super_admin = full access; dept_admin = restricted by department + access flags
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_DEPT)
    # JSON: which modules this admin can use. e.g. {"dashboard": true, "attendance": true, "salary": true, "leaderboard": true, "export": true, "adjustment": true, "manage_admins": false}
    # Super admin (id=1) ignores this and has full access. Others use this; super can edit.
    access = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'admins'
        verbose_name_plural = 'Admins'

    def __str__(self):
        return self.email

    @property
    def is_super_admin(self):
        return self.pk == 1 or self.role == self.ROLE_SUPER

    def can_access(self, module):
        """Check if this admin can access a module (dashboard, attendance, salary, leaderboard, export, adjustment, manage_admins)."""
        if self.is_super_admin:
            return True
        return self.access.get(module, False)


class Employee(models.Model):
    """Master employee table - source of truth. Linked by emp_code."""
    STATUS_ACTIVE = 'Active'
    STATUS_INACTIVE = 'Inactive'      # left the work
    STATUS_WEEK_OFF = 'Week off'
    STATUS_HOLIDAY = 'Holiday'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_INACTIVE, 'Inactive'),   # left the company
        (STATUS_WEEK_OFF, 'Week off'),
        (STATUS_HOLIDAY, 'Holiday'),
    ]
    # Statuses that mean still employed (exclude from salary/lists when filtering "current" only)
    EMPLOYED_STATUSES = (STATUS_ACTIVE, STATUS_WEEK_OFF, STATUS_HOLIDAY)

    EMPLOYMENT_TYPE_CHOICES = [('Full-time', 'Full-time'), ('Hourly', 'Hourly')]
    SALARY_TYPE_CHOICES = [('Monthly', 'Monthly'), ('Hourly', 'Hourly'), ('Fixed', 'Fixed')]

    emp_code = models.CharField(max_length=50, unique=True, db_index=True)
    name = models.CharField(max_length=255)
    mobile = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    gender = models.CharField(max_length=20, blank=True)
    dept_name = models.CharField(max_length=100, blank=True)
    designation = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_TYPE_CHOICES, default='Full-time')
    salary_type = models.CharField(max_length=20, choices=SALARY_TYPE_CHOICES, default='Monthly')
    base_salary = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    shift = models.CharField(max_length=100, blank=True, help_text='Assigned shift name (e.g. General Shift)')
    shift_from = models.TimeField(null=True, blank=True, help_text='Shift start time')
    shift_to = models.TimeField(null=True, blank=True, help_text='Shift end time')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'employees'
        ordering = ['emp_code']

    def __str__(self):
        return f"{self.emp_code} - {self.name}"


class Attendance(models.Model):
    """Daily attendance. UNIQUE (emp_code, date)."""
    STATUS_CHOICES = [
        ('Present', 'Present'),
        ('Absent', 'Absent'),
        ('FD', 'FD'),
        ('Half-Day', 'Half-Day'),
    ]

    emp_code = models.CharField(max_length=50, db_index=True)
    name = models.CharField(max_length=255, blank=True)
    date = models.DateField(db_index=True)
    shift = models.CharField(max_length=100, blank=True)
    shift_from = models.TimeField(null=True, blank=True)
    shift_to = models.TimeField(null=True, blank=True)
    punch_in = models.TimeField(null=True, blank=True)
    punch_out = models.TimeField(null=True, blank=True)
    punch_spans_next_day = models.BooleanField(default=False, help_text='True when punch_out is next day (e.g. night shift)')
    total_working_hours = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    total_break = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Present')
    over_time = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'attendance'
        ordering = ['-date', 'emp_code']
        constraints = [
            models.UniqueConstraint(fields=['emp_code', 'date'], name='unique_emp_date')
        ]

    def save(self, *args, **kwargs):
        # Auto status: If punched in, mark as Present
        if self.punch_in:
            self.status = 'Present'
        elif not self.status or self.status == 'Present':
            # If no punch_in and no explicit status, mark as Absent
            self.status = 'Absent'
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.emp_code} {self.date} {self.status}"


class Salary(models.Model):
    """Salary history tracking."""
    emp_code = models.CharField(max_length=50, db_index=True)
    salary_type = models.CharField(max_length=20)
    base_salary = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    overtime_hours = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('0'))
    bonus = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('0'))
    total_working_hours = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('0'), help_text='Total hours worked in the month')
    days_present = models.PositiveSmallIntegerField(default=0, help_text='Days marked Present in the month')
    month = models.PositiveSmallIntegerField()
    year = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'salaries'
        ordering = ['-year', '-month']

    def __str__(self):
        return f"{self.emp_code} {self.year}-{self.month}"


class SalaryAdvance(models.Model):
    """Advance money taken by employee, deducted from that month's salary."""
    emp_code = models.CharField(max_length=50, db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    month = models.PositiveSmallIntegerField(help_text='Salary month this advance is for')
    year = models.PositiveIntegerField(help_text='Salary year this advance is for')
    date_given = models.DateField(null=True, blank=True, help_text='Date advance was given')
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'salary_advances'
        ordering = ['-year', '-month', '-created_at']

    def __str__(self):
        return f"{self.emp_code} {self.year}-{self.month} {self.amount}"


class Adjustment(models.Model):
    """Manual admin correction log - audit trail."""
    emp_code = models.CharField(max_length=50, db_index=True)
    adj_date = models.DateField()
    adj_punch_in = models.TimeField(null=True, blank=True)
    adj_punch_out = models.TimeField(null=True, blank=True)
    adj_overtime = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    reason = models.TextField(blank=True)
    created_by_admin = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'adjustment'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.emp_code} {self.adj_date}"


class ShiftOvertimeBonus(models.Model):
    """One record per emp per date: bonus hours awarded for working >12h in a shift (1h bonus per 2h extra). No duplicate for same day."""
    emp_code = models.CharField(max_length=50, db_index=True)
    date = models.DateField(db_index=True)
    bonus_hours = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    description = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'shift_overtime_bonus'
        ordering = ['-date', 'emp_code']
        unique_together = [['emp_code', 'date']]

    def __str__(self):
        return f"{self.emp_code} {self.date} {self.bonus_hours}h"


class Penalty(models.Model):
    """Late-coming penalty (Hourly employees only). 2.5 Rs/min until 300 Rs/month, then 5 Rs/min. Reset 1st of month. Manual penalties allowed."""
    emp_code = models.CharField(max_length=50, db_index=True)
    date = models.DateField(db_index=True)
    month = models.PositiveSmallIntegerField()
    year = models.PositiveIntegerField()
    minutes_late = models.PositiveSmallIntegerField(default=0, help_text='Minutes late (0 for manual)')
    deduction_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    rate_used = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text='Rs per min used (2.5 or 5)')
    description = models.CharField(max_length=500, blank=True)
    is_manual = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'penalty'
        ordering = ['-date', 'emp_code']

    def __str__(self):
        return f"{self.emp_code} {self.date} {self.deduction_amount}"


class PerformanceReward(models.Model):
    """Streak, overtime reward, absentee alert, leaderboard."""
    ENTRY_TYPE_CHOICES = [('REWARD', 'REWARD'), ('ACTION', 'ACTION')]
    ADMIN_STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('Contacted', 'Contacted'),
        ('Resolved', 'Resolved'),
    ]

    emp_code = models.CharField(max_length=50, db_index=True)
    entry_type = models.CharField(max_length=20, choices=ENTRY_TYPE_CHOICES)
    trigger_reason = models.CharField(max_length=255)
    metric_data = models.TextField(blank=True)
    is_on_leaderboard = models.BooleanField(default=False)
    admin_action_status = models.CharField(
        max_length=20, choices=ADMIN_STATUS_CHOICES, default='Pending', blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'performance_rewards'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.emp_code} {self.entry_type} {self.trigger_reason}"


class Holiday(models.Model):
    """Yearly public holidays - so absentee logic doesn't flag holidays."""
    date = models.DateField(unique=True)
    name = models.CharField(max_length=255)
    year = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'holidays'
        ordering = ['date']

    def __str__(self):
        return f"{self.date} {self.name}"


class SystemSetting(models.Model):
    """Configurable thresholds for auto reward engine."""
    key = models.CharField(max_length=100, unique=True)
    value = models.CharField(max_length=255)
    description = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'system_settings'

    def __str__(self):
        return f"{self.key}={self.value}"


class EmailSmtpConfig(models.Model):
    """SMTP credentials and options for sending email. One active config is used for push email."""
    smtp_server = models.CharField(max_length=255, default='smtp.gmail.com', help_text='e.g. smtp.gmail.com')
    smtp_port = models.PositiveSmallIntegerField(default=587, help_text='Usually 587 for TLS')
    auth_username = models.CharField(max_length=254, blank=True, help_text='SMTP login email')
    auth_password = models.CharField(max_length=255, blank=True, help_text='App password or account password')
    force_sender = models.CharField(max_length=254, blank=True, help_text='From address (optional, defaults to auth_username)')
    error_logfile = models.CharField(max_length=255, blank=True, help_text='Path to error log file')
    debug_logfile = models.CharField(max_length=255, blank=True, help_text='Path to debug log file')
    is_active = models.BooleanField(default=True, help_text='Use this config when sending email')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'email_smtp_config'
        verbose_name = 'Email SMTP config'
        verbose_name_plural = 'Email SMTP configs'

    def __str__(self):
        return f"{self.smtp_server}:{self.smtp_port} ({self.auth_username or 'no auth'})"


class AuditLog(models.Model):
    """Record of who did what and where in the application."""
    admin_id = models.IntegerField(null=True, blank=True, db_index=True)  # may be deleted later
    admin_name = models.CharField(max_length=255, blank=True)
    admin_email = models.CharField(max_length=254, blank=True)
    action = models.CharField(max_length=64, db_index=True)  # e.g. login, create, update, delete, export
    module = models.CharField(max_length=64, db_index=True)  # e.g. auth, attendance, employees, export
    target_type = models.CharField(max_length=64, blank=True)  # e.g. employee, attendance, admin
    target_id = models.CharField(max_length=100, blank=True)  # emp_code, id, etc.
    details = models.JSONField(default=dict, blank=True)  # extra context
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'audit_log'
        ordering = ['-created_at']
        verbose_name = 'Audit Log'
        verbose_name_plural = 'Audit Logs'

    def __str__(self):
        return f"{self.admin_email} {self.action} {self.module} @ {self.created_at}"
