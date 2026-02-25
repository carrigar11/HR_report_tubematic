"""
SMTP config for sending email. Multiple configs stored in EmailSmtpConfig; tried in priority order.
Example config: smtp_server=smtp.gmail.com, smtp_port=587, auth_username=..., auth_password=...
"""
import logging
from email.utils import formataddr
from django.core.mail import get_connection, EmailMessage

logger = logging.getLogger(__name__)


def get_active_smtp_config():
    """Return the first active EmailSmtpConfig (by priority). Kept for backward compatibility."""
    configs = get_active_smtp_configs()
    return configs[0] if configs else None


def get_active_smtp_configs():
    """Return all active EmailSmtpConfigs ordered by priority (lower first), then id. Used for multi-try send."""
    from .models import EmailSmtpConfig
    return list(EmailSmtpConfig.objects.filter(is_active=True).order_by('priority', 'id'))


def send_simple_email(to_email, subject, body, from_name=None):
    """
    Send a plain text email to to_email. Tries each active SMTP config in priority order until one succeeds.
    from_name: optional display name for the sender (e.g. "Carrigar").
    Returns (True, None) on success, (False, error_message) on failure.
    """
    configs = get_active_smtp_configs()
    configs = [c for c in configs if getattr(c, 'auth_username', None)]
    if not configs:
        return False, 'SMTP not configured'
    last_error = None
    for config in configs:
        try:
            connection = get_connection(
                backend='django.core.mail.backends.smtp.EmailBackend',
                host=config.smtp_server,
                port=config.smtp_port,
                username=config.auth_username,
                password=config.auth_password,
            )
            from_email = config.force_sender or config.auth_username
            if from_name:
                from_email = formataddr((str(from_name), from_email))
            msg = EmailMessage(subject, body, from_email, [to_email], connection=connection)
            msg.send()
            return True, None
        except Exception as e:
            last_error = str(e)
            logger.warning('send_simple_email failed with config id=%s (%s:%s): %s', config.pk, config.smtp_server, config.smtp_port, last_error)
            continue
    logger.exception('send_simple_email failed with all %s config(s)', len(configs))
    return False, last_error or 'Send failed'
