"""Thin HTTP client for the few ``authz_service`` calls SWMM makes at runtime.

SWMM verifies bearers locally and never needs ``authz_service`` for the happy
path. This client is only for:

* ``me(bearer)``  -- the liveness / revocation probe (``GET /api/v1/auth/me/``),
  used by ``accounts.live_permissions.IsLiveAuthzUser`` on destructive
  endpoints.
* ``notification_recipients(role_code, ...)`` -- the machine-to-machine
  "who holds role X?" back-channel (``X-Service-Key``, no bearer).

Every call has a short timeout and one retry; failures raise ``AuthzUnavailable``
so callers can decide whether to fail open or closed.
"""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

_TIMEOUT = 3  # seconds
_RETRIES = 1


class AuthzError(Exception):
    """Base class for authz_service client failures."""


class AuthzUnavailable(AuthzError):
    """authz_service could not be reached / did not answer in time."""


def _base_url():
    return (getattr(settings, "AUTHZ_BASE_URL", "") or "").rstrip("/")


def _request(method, path, *, headers=None, json=None):
    url = f"{_base_url()}{path}"
    last_exc = None
    for attempt in range(_RETRIES + 1):
        try:
            return requests.request(
                method, url, headers=headers or {}, json=json, timeout=_TIMEOUT
            )
        except requests.RequestException as exc:  # network / timeout
            last_exc = exc
            logger.warning(
                "authz_service %s %s failed (attempt %d/%d): %s",
                method,
                path,
                attempt + 1,
                _RETRIES + 1,
                exc,
            )
    raise AuthzUnavailable(str(last_exc)) from last_exc


def me(bearer):
    """``GET /api/v1/auth/me/`` forwarding the caller's bearer. Returns the parsed
    JSON body on 200. Raises ``AuthzError`` on a 401/403 (revoked user /
    session / role) and ``AuthzUnavailable`` if the service is unreachable."""
    token = bearer or ""
    if not token.lower().startswith("bearer "):
        token = f"Bearer {token}"
    # Developed with Understanding: userauth mounts accounts at api/v1/auth/ (authz_service
    # urls.py line 53). The old /api/auth/me/ answered 404, so every live check failed closed.
    resp = _request("GET", "/api/v1/auth/me/", headers={"Authorization": token})
    if resp.status_code == 200:
        return resp.json()
    if resp.status_code in (401, 403):
        raise AuthzError(f"authz_service rejected the token ({resp.status_code}).")
    raise AuthzUnavailable(f"authz_service /api/v1/auth/me/ -> HTTP {resp.status_code}")


def notification_recipients(role_code, process_id=None):
    """``POST /api/v1/authz/notification-recipients/`` with ``X-Service-Key``.
    Returns the ``recipients`` list. For fan-out / audit -- never in a user
    request's critical path."""
    key = getattr(settings, "INTERNAL_SERVICE_KEY", "") or ""
    if not key:
        raise AuthzError("INTERNAL_SERVICE_KEY is not configured.")
    body = {"role_code": role_code}
    if process_id is not None:
        body["process_id"] = process_id
    resp = _request(
        "POST",
        # Developed with Understanding: userauth mounts authz at api/v1/authz/.
        "/api/v1/authz/notification-recipients/",
        headers={"X-Service-Key": key},
        json=body,
    )
    if resp.status_code == 200:
        return resp.json().get("recipients", [])
    raise AuthzUnavailable(
        f"authz_service notification-recipients/ -> HTTP {resp.status_code}"
    )
