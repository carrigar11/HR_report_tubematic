"""
Daily Plant Report (Previous day) email: send Excel to recipients at configured time.
Recipients and send time are stored in DB (PlantReportRecipient, SystemSetting).
Attachment is only the Plant Report (Previous day) sheet – same logic and columns as Google Sheet.
"""
import logging
from datetime import date
from io import BytesIO

from django.core.mail import EmailMessage, get_connection
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import ColorScaleRule

from .email_smtp import get_active_smtp_config
from .google_sheets_sync import _build_sheet3_data
from .models import PlantReportRecipient, SystemSetting

logger = logging.getLogger(__name__)


def get_plant_report_send_time():
    """Return (hour, minute) 24h from SystemSetting plant_report_send_time (default 6:00)."""
    try:
        obj = SystemSetting.objects.get(key='plant_report_send_time')
        val = (obj.value or '06:00').strip()
        parts = val.split(':')
        h = int(parts[0]) if parts else 6
        m = int(parts[1]) if len(parts) > 1 else 0
        return (max(0, min(23, h)), max(0, min(59, m)))
    except (SystemSetting.DoesNotExist, ValueError, IndexError):
        return (6, 0)


def is_plant_report_email_enabled():
    try:
        obj = SystemSetting.objects.get(key='plant_report_enabled')
        return (obj.value or 'true').strip().lower() in ('true', '1', 'yes')
    except SystemSetting.DoesNotExist:
        return True


def get_plant_report_last_sent_date():
    """Return the date we last sent the report, or None."""
    try:
        obj = SystemSetting.objects.get(key='plant_report_last_sent')
        if obj.value:
            return date.fromisoformat(obj.value)
    except (SystemSetting.DoesNotExist, ValueError):
        pass
    return None


def set_plant_report_last_sent_date(sent_date):
    SystemSetting.objects.update_or_create(
        key='plant_report_last_sent',
        defaults={'value': sent_date.isoformat(), 'description': 'Last Plant Report email sent date'},
    )


def build_plant_report_previous_day_excel_only():
    """
    Build an Excel file with only the Plant Report (Previous day) sheet.
    Same logic and columns as the Google Sheet tab. Starts at row 2, column 2 (B2).
    Color scale (green -> yellow -> red) on Average Salary/hr, Absenteeism %, OT bonus (hrs), OT bonus (rs).
    Returns BytesIO.
    """
    rows = _build_sheet3_data()
    wb = Workbook()
    ws = wb.active
    ws.title = 'Plant Report (Previous day)'
    header_fill = PatternFill(start_color='366092', end_color='366092', fill_type='solid')
    header_font = Font(bold=True, color='FFFFFF')
    # Start at row 2, column 2 (B2)
    start_row, start_col = 2, 2
    for i, row in enumerate(rows):
        for j, val in enumerate(row):
            cell = ws.cell(row=start_row + i, column=start_col + j, value=val)
            if i == 0:
                cell.fill = header_fill
                cell.font = header_font
    last_row = start_row + len(rows) - 1
    # Column indices (0-based from start_col): 6=H Avg Salary, 7=I Avg Salary/hr, 8=J Absenteeism %, 9=K Total Salary, 10=L OT bonus hrs, 11=M OT bonus rs
    # Color scale (green low -> yellow mid -> red high) for Average Salary/hr (I), Absenteeism % (J), OT bonus (hrs) (L), OT bonus (rs) (M)
    col_I = get_column_letter(start_col + 7)
    col_J = get_column_letter(start_col + 8)
    col_L = get_column_letter(start_col + 10)
    col_M = get_column_letter(start_col + 11)
    data_start_row = start_row + 1  # first data row below header
    range_ij = f'{col_I}{data_start_row}:{col_J}{last_row}'
    range_lm = f'{col_L}{data_start_row}:{col_M}{last_row}'
    color_scale = ColorScaleRule(
        start_type='min', start_color='00FF00',
        mid_type='percentile', mid_value=50, mid_color='FFFF00',
        end_type='max', end_color='FF0000',
    )
    ws.conditional_formatting.add(range_ij, color_scale)
    ws.conditional_formatting.add(range_lm, color_scale)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def send_plant_report_email():
    """
    Build Plant Report (Previous day) Excel (only that sheet, same as Google Sheet) and email to all active recipients.
    Uses EmailSmtpConfig for SMTP. Returns dict with success, message, sent_count.
    """
    recipients = list(
        PlantReportRecipient.objects.filter(is_active=True).values_list('email', flat=True)
    )
    if not recipients:
        return {'success': False, 'message': 'No active recipients.', 'sent_count': 0}

    config = get_active_smtp_config()
    if not config or not config.auth_username:
        return {'success': False, 'message': 'SMTP not configured. Set in Settings / Django Admin.', 'sent_count': 0}

    try:
        buf = build_plant_report_previous_day_excel_only()
        excel_bytes = buf.read()
    except Exception as e:
        logger.exception('Failed to generate Plant Report Excel')
        return {'success': False, 'message': str(e), 'sent_count': 0}

    from_date = (timezone.localdate() - timezone.timedelta(days=1)).strftime('%d-%m-%Y')
    subject = f'Plant Report (Previous day) - {from_date}'
    body = f'Please find the Plant Report for {from_date} attached.\n\nThis is an automated email.'
    from_email = config.force_sender or config.auth_username

    connection = get_connection(
        backend='django.core.mail.backends.smtp.EmailBackend',
        host=config.smtp_server,
        port=config.smtp_port,
        username=config.auth_username,
        password=config.auth_password,
        use_tls=True,
        fail_silently=False,
    )
    filename = f'Plant_Report_{from_date.replace("-", "_")}.xlsx'
    msg = EmailMessage(
        subject=subject,
        body=body,
        from_email=from_email,
        to=recipients,
        connection=connection,
    )
    msg.attach(filename, excel_bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    try:
        msg.send()
        set_plant_report_last_sent_date(timezone.localdate())
        logger.info('Plant Report email sent to %s recipients', len(recipients))
        return {'success': True, 'message': f'Sent to {len(recipients)} recipient(s).', 'sent_count': len(recipients)}
    except Exception as e:
        logger.exception('Plant Report email send failed')
        return {'success': False, 'message': str(e), 'sent_count': 0}


def maybe_send_plant_report_daily():
    """
    Call from a cron/task every minute (or every hour). If current time matches
    plant_report_send_time and we haven't sent today, send the report.
    """
    if not is_plant_report_email_enabled():
        return
    today = timezone.localdate()
    if get_plant_report_last_sent_date() == today:
        return
    hour, minute = get_plant_report_send_time()
    now = timezone.now()
    if now.hour == hour and now.minute == minute:
        send_plant_report_email()
