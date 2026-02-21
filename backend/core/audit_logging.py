"""
Central audit logging: record who did what and where.
Call log_activity() from views after successful actions.
"""
from .models import AuditLog


def _get_client_ip(request):
    if not request:
        return None
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _get_user_agent(request):
    if not request:
        return ''
    return (request.META.get('HTTP_USER_AGENT') or '')[:500]


def log_activity(request, action, module, target_type='', target_id='', details=None):
    """
    Log an action by the current admin from request (X-Admin-Id).
    action: e.g. login, create, update, delete, export, upload, adjust
    module: e.g. auth, attendance, employees, export, admins, holidays
    target_type: e.g. employee, attendance, admin
    target_id: e.g. emp_code, record id
    details: optional dict for extra context
    """
    admin_id = None
    admin_name = ''
    admin_email = ''
    if request:
        aid = getattr(request, 'jwt_admin_id', None)  # JWT takes precedence
        if aid is None:
            aid = request.headers.get('X-Admin-Id', '').strip()
            if aid:
                try:
                    aid = int(aid)
                except (ValueError, TypeError):
                    aid = None
        if aid is not None:
            try:
                from .models import Admin
                admin = Admin.objects.filter(pk=int(aid)).first()
                if admin:
                    admin_id = admin.pk
                    admin_name = admin.name or ''
                    admin_email = admin.email or ''
            except (ValueError, TypeError):
                pass
    AuditLog.objects.create(
        admin_id=admin_id,
        admin_name=admin_name,
        admin_email=admin_email,
        action=action,
        module=module,
        target_type=target_type or '',
        target_id=str(target_id) if target_id else '',
        details=details or {},
        ip_address=_get_client_ip(request),
        user_agent=_get_user_agent(request),
    )


def log_activity_manual(admin, request, action, module, target_type='', target_id='', details=None):
    """Log when you have the admin object (e.g. after login)."""
    AuditLog.objects.create(
        admin_id=admin.pk if admin else None,
        admin_name=(admin.name or '') if admin else '',
        admin_email=(admin.email or '') if admin else '',
        action=action,
        module=module,
        target_type=target_type or '',
        target_id=str(target_id) if target_id else '',
        details=details or {},
        ip_address=_get_client_ip(request),
        user_agent=_get_user_agent(request),
    )
