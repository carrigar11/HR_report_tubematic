"""
JWT issue and verify for admin authentication.
Access token: short-lived, sent on every API request.
Refresh token: long-lived, used only to obtain new access tokens.
"""
import time
from django.conf import settings
import jwt

# TTL in seconds: access 15 min, refresh 7 days
JWT_ACCESS_TTL = getattr(settings, 'JWT_ACCESS_TTL', 15 * 60)
JWT_REFRESH_TTL = getattr(settings, 'JWT_REFRESH_TTL', 7 * 24 * 3600)
JWT_SECRET = getattr(settings, 'JWT_SECRET_KEY', None) or settings.SECRET_KEY
JWT_ALGORITHM = 'HS256'


def _encode(payload, ttl_seconds):
    payload = dict(payload)
    payload['exp'] = int(time.time()) + ttl_seconds
    payload['iat'] = int(time.time())
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def encode_access(admin_id):
    """Return a JWT access token string for the given admin_id."""
    return _encode({'admin_id': int(admin_id), 'type': 'access'}, JWT_ACCESS_TTL)


def encode_refresh(admin_id):
    """Return a JWT refresh token string for the given admin_id."""
    return _encode({'admin_id': int(admin_id), 'type': 'refresh'}, JWT_REFRESH_TTL)


def decode_token(token):
    """
    Decode and validate token. Returns payload dict or None if invalid/expired.
    """
    if not token or not isinstance(token, str):
        return None
    token = token.strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.InvalidTokenError:
        return None
