"""Centralized audit middleware.

Origin: ITTTM middleware.py::AuditLogMiddleware, with its issues fixed
(build prompt cross-cutting):
  (a) ``clear_current_request()`` in ``finally``,
  (b) never swallow the request/response -- exceptions propagate,
  (c) redact ``password`` / tokens / ``authorization`` / encrypted blobs,
  (d) key from env (``settings.AUDIT_SERVICE_KEY``), no default in prod.

No bare ``except`` (anti-pattern #8): every catch is specific or logged.
"""

import logging
import time

from django.conf import settings

from .client import sanitize_payload, send_audit_event
from .context import clear_current_request, set_current_request

logger = logging.getLogger("audit")

SKIP_PREFIXES = ("/static/", "/media/", "/favicon.ico", "/health", "/admin/jsi18n")


class AuditLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith(SKIP_PREFIXES):
            return self.get_response(request)

        set_current_request(request)
        started = time.monotonic()
        response = None
        error = None
        try:
            response = self.get_response(request)
            return response
        except Exception as exc:  # noqa: BLE001 - record then re-raise, never swallow
            error = exc
            raise
        finally:
            try:
                self._emit(request, response, error, started)
            except Exception as exc:  # noqa: BLE001 - audit must not break requests
                logger.warning("audit emit failed: %s", exc)
            clear_current_request()

    def _emit(self, request, response, error, started):
        if not getattr(settings, "AUDIT_ENABLED", False):
            return

        elapsed_ms = round((time.monotonic() - started) * 1000, 2)
        status_code = getattr(response, "status_code", 500 if error else 0)

        if error is not None:
            status = "error"
        elif status_code >= 400:
            status = "failure"
        else:
            status = "success"

        user = getattr(request, "user", None)
        auth = request.auth if isinstance(getattr(request, "auth", None), dict) else {}
        user_id = getattr(user, "id", None) if getattr(
            user, "is_authenticated", False
        ) else None

        body = {}
        if request.content_type and "json" in request.content_type:
            try:
                body = sanitize_payload(getattr(request, "data", {}) or {})
            except Exception:  # noqa: BLE001 - request body may be unparsed/streamed
                body = {}

        payload = {
            "service_name": settings.SERVICE_NAME,
            "user_id": user_id,
            "username": getattr(user, "username", None)
            if user_id
            else auth.get("username"),
            "role_code": auth.get("role_code"),
            "process_id": auth.get("process_id"),
            "session_id": auth.get("session_id"),
            "http_method": request.method,
            "api_endpoint": request.get_full_path(),
            "backend_url": request.build_absolute_uri(),
            "ip_address": _client_ip(request),
            "device_source": request.META.get("HTTP_USER_AGENT", ""),
            "status": status,
            "status_code": status_code,
            "response_time_ms": elapsed_ms,
            "error_message": str(error) if error else None,
            "error_code": type(error).__name__ if error else None,
            "request_payload": body,
        }
        send_audit_event(payload)


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")
