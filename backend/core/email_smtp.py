"""
SMTP config for sending email. Credentials are stored in EmailSmtpConfig table.
Use Django Admin to add/edit: Core -> Email SMTP configs.
Example config: smtp_server=smtp.gmail.com, smtp_port=587, auth_username=..., auth_password=...
"""


def get_active_smtp_config():
    """Return the first active EmailSmtpConfig, or None. Use this when sending email via SMTP."""
    from .models import EmailSmtpConfig
    return EmailSmtpConfig.objects.filter(is_active=True).first()
