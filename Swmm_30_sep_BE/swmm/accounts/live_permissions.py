"""DRF permission classes for revocation freshness and service-to-service auth.

SWMM verifies bearers locally, so a revoked user / ended session / lost role
keeps working here until the access token's ``exp`` (worst case one token
lifetime). For destructive or privilege-changing endpoints that is too long:
``IsLiveAuthzUser`` calls ``authz_service`` ``GET /api/v1/auth/me/`` (the
liveness probe that runs the full re-validation) and rejects on 401/403, with
the result cached briefly per ``user_id``.

``IsInternalService`` guards machine-to-machine endpoints with the shared
``X-Service-Key`` header (no bearer, no user) -- same contract as
``userauth/authz/permissions.py::IsInternalService``.
"""

import logging

from django.conf import settings
from django.core.cache import cache
from rest_framework.permissions import BasePermission

from . import authz_client

logger = logging.getLogger(__name__)

_CACHE_PREFIX = "authz:live:"


class IsInternalService(BasePermission):
    """Request carries a valid ``X-Service-Key``. Non-empty match required --
    an unset ``INTERNAL_SERVICE_KEY`` denies everyone."""

    message = "Valid X-Service-Key header required."

    def has_permission(self, request, view):
        expected = getattr(settings, "INTERNAL_SERVICE_KEY", "") or ""
        return bool(expected) and request.headers.get("X-Service-Key", "") == expected


class IsLiveAuthzUser(BasePermission):
    """The caller is authenticated *and* still live according to
    ``authz_service``. Attach to destructive / privilege-changing endpoints
    only -- it adds one (cached) round trip.

    Fails **closed**: if ``authz_service`` is unreachable the request is
    denied, because these endpoints are the ones where a stale grant is most
    dangerous. Cache the positive result per ``user_id`` for
    ``AUTHZ_LIVE_CHECK_TTL`` seconds so a burst of writes is one probe.
    """

    message = "Your session is no longer valid. Please sign in again."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return False

        claims = getattr(request, "auth", None) or {}
        uid = claims.get("user_id") or getattr(user, "id", None)
        if uid is None:
            return False

        cache_key = f"{_CACHE_PREFIX}{uid}"
        if cache.get(cache_key) is True:
            return True

        # Optional fast path: a present shared-Redis profile key means live.
        redis_url = getattr(settings, "AUTHZ_REDIS_URL", "") or ""
        if redis_url and _redis_profile_present(redis_url, uid):
            cache.set(cache_key, True, timeout=_ttl())
            return True

        bearer = request.META.get("HTTP_AUTHORIZATION", "")
        try:
            authz_client.me(bearer)
        except authz_client.AuthzError as exc:
            logger.info("live check denied user_id=%s: %s", uid, exc)
            return False
        except authz_client.AuthzUnavailable as exc:
            logger.warning("live check unavailable user_id=%s: %s", uid, exc)
            return False

        cache.set(cache_key, True, timeout=_ttl())
        return True


def _ttl():
    return int(getattr(settings, "AUTHZ_LIVE_CHECK_TTL", 45))


def _redis_profile_present(redis_url, uid):
    try:
        import redis  # optional dependency; only imported if AUTHZ_REDIS_URL set

        client = redis.Redis.from_url(redis_url, socket_timeout=1)
        return client.exists(f"authz:user_profile:{uid}") == 1
    except Exception as exc:  # noqa: BLE001 -- any failure = fall back to HTTP probe
        logger.debug("redis liveness fast-path skipped: %s", exc)
        return False
