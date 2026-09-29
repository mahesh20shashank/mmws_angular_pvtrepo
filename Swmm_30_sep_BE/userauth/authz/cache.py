"""Cross-service user-profile cache (Redis, TTL'd).

Origin: ITTTM ``itttm_common.user_cache`` -- write on login/refresh, read from
peer services, invalidate on any role / scope / user change.
"""

from django.conf import settings
from django.core.cache import cache

_KEY = "authz:user_profile:{uid}"


def cache_key(uid):
    return _KEY.format(uid=int(uid))


def set_cached_user_profile(uid, profile: dict):
    cache.set(cache_key(uid), profile, timeout=settings.USER_PROFILE_CACHE_TTL)


def get_cached_user_profile(uid):
    return cache.get(cache_key(uid))


def invalidate_user_profile(uid):
    cache.delete(cache_key(uid))
