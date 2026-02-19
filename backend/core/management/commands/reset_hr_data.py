"""
Reset all HR data for a clean test: employees, attendance, advances, penalties,
bonus logs, adjustments, salaries, performance rewards. Optionally clear audit log.
Keeps: admins, system_settings, email_smtp_config, holidays.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import (
    Adjustment,
    Attendance,
    Employee,
    Penalty,
    PerformanceReward,
    Salary,
    SalaryAdvance,
    ShiftOvertimeBonus,
    AuditLog,
)


class Command(BaseCommand):
    help = (
        'Delete all HR data (employees, attendance, advances, penalties, bonuses, '
        'adjustments, salaries, rewards) so you can test from scratch. Keeps admins, settings, holidays.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--yes',
            action='store_true',
            dest='yes',
            help='Skip confirmation prompt',
        )
        parser.add_argument(
            '--clear-audit',
            action='store_true',
            dest='clear_audit',
            help='Also clear audit_log table',
        )

    def handle(self, *args, **options):
        skip_confirm = options.get('yes', False)
        clear_audit = options.get('clear_audit', False)

        # Counts for confirmation
        counts = {
            'adjustment': Adjustment.objects.count(),
            'attendance': Attendance.objects.count(),
            'penalty': Penalty.objects.count(),
            'shift_overtime_bonus': ShiftOvertimeBonus.objects.count(),
            'performance_rewards': PerformanceReward.objects.count(),
            'salary_advances': SalaryAdvance.objects.count(),
            'salaries': Salary.objects.count(),
            'employees': Employee.objects.count(),
        }
        if clear_audit:
            counts['audit_log'] = AuditLog.objects.count()

        total = sum(counts.values())
        if total == 0:
            self.stdout.write('No HR data to delete. Database is already empty for employees/attendance/advance/penalty/etc.')
            return

        msg = (
            f"About to permanently delete:\n"
            f"  Adjustment: {counts['adjustment']}, Attendance: {counts['attendance']}, "
            f"Penalty: {counts['penalty']}, Shift OT Bonus: {counts['shift_overtime_bonus']},\n"
            f"  Performance rewards: {counts['performance_rewards']}, Salary advances: {counts['salary_advances']}, "
            f"Salaries: {counts['salaries']}, Employees: {counts['employees']}"
        )
        if clear_audit:
            msg += f", Audit log: {counts['audit_log']}"
        msg += f"\nTotal: {total} record(s). This cannot be undone."
        self.stdout.write(msg)

        if not skip_confirm:
            confirm = input('Type "yes" to proceed: ')
            if confirm.strip().lower() != 'yes':
                self.stdout.write('Aborted.')
                return

        with transaction.atomic():
            deleted_adj, _ = Adjustment.objects.all().delete()
            deleted_att, _ = Attendance.objects.all().delete()
            deleted_pen, _ = Penalty.objects.all().delete()
            deleted_sob, _ = ShiftOvertimeBonus.objects.all().delete()
            deleted_pr, _ = PerformanceReward.objects.all().delete()
            deleted_adv, _ = SalaryAdvance.objects.all().delete()
            deleted_sal, _ = Salary.objects.all().delete()
            deleted_emp, _ = Employee.objects.all().delete()
            total_deleted = deleted_adj + deleted_att + deleted_pen + deleted_sob + deleted_pr + deleted_adv + deleted_sal + deleted_emp

            if clear_audit:
                deleted_audit, _ = AuditLog.objects.all().delete()
                total_deleted += deleted_audit
                self.stdout.write(self.style.SUCCESS(f'Cleared audit_log: {deleted_audit} record(s).'))

        self.stdout.write(
            self.style.SUCCESS(
                f'Done. Deleted {total_deleted} record(s). You can now add employees and upload attendance from scratch.'
            )
        )
