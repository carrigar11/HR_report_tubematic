"""
Helpers for per-company settings. Fallback: CompanySetting (company) -> CompanySetting (global) -> SystemSetting.
"""
from .models import SystemSetting, CompanySetting


def get_company_setting(key, company_id=None, default=''):
    """Get value for key. Prefer company override, then global CompanySetting, then SystemSetting, then default."""
    if company_id is not None:
        try:
            obj = CompanySetting.objects.get(company_id=company_id, key=key)
            if obj.value is not None:
                return obj.value
        except CompanySetting.DoesNotExist:
            pass
    try:
        obj = CompanySetting.objects.get(company_id__isnull=True, key=key)
        if obj.value is not None:
            return obj.value
    except CompanySetting.DoesNotExist:
        pass
    try:
        obj = SystemSetting.objects.get(key=key)
        return obj.value or default
    except SystemSetting.DoesNotExist:
        return default


def set_company_setting(key, value, company_id, description=''):
    """Set or create CompanySetting for this company. Use company_id=None for global default layer."""
    value = str(value).strip() if value is not None else ''
    CompanySetting.objects.update_or_create(
        company_id=company_id,
        key=key,
        defaults={'value': value, 'description': description or key}
    )
