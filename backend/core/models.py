"""
HR Employee & Attendance Management System - Database Models.
All tables linked by emp_code (unique employee identifier).
"""
from django.db import models
from decimal import Decimal


class Admin(models.Model):
    """Login system for HR admins."""
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    password = models.CharField(max_length=255)  # plain text for now as per spec

    class Meta:
        db_table = 'admins'
        verbose_name_plural = 'Admins'

    def __str__(self):
        return self.email


class Employee(models.Model):
    """Master employee table - source of truth. Linked by emp_code."""
    STATUS_CHOICES = [('Active', 'Active'), ('Inactive', 'Inactive')]
    EMPLOYMENT_TYPE_CHOICES = [('Full-time', 'Full-time'), ('Hourly', 'Hourly')]
    SALARY_TYPE_CHOICES = [('Monthly', 'Monthly'), ('Hourly', 'Hourly')]

    emp_code = models.CharField(max_length=50, unique=True, db_index=True)
    name = models.CharField(max_length=255)
    mobile = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    gender = models.CharField(max_length=20, blank=True)
    dept_name = models.CharField(max_length=100, blank=True)
    designation = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Active')
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_TYPE_CHOICES, default='Full-time')
    salary_type = models.CharField(max_length=20, choices=SALARY_TYPE_CHOICES, default='Monthly')
    base_salary = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
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
    month = models.PositiveSmallIntegerField()
    year = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'salaries'
        ordering = ['-year', '-month']

    def __str__(self):
        return f"{self.emp_code} {self.year}-{self.month}"


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
