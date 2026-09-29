"""Best-effort audit-service client.

Build prompt cross-cutting: async/best-effort POST, key from env
(``settings.AUDIT_SERVICE_KEY``, no default), redact secrets, never let an
audit failure affect the request. Uses the stdlib in a daemon thread so no
synchronous HTTP sits on the response path and no extra dependency is pulled
in.
"""

import json
import logging
import threading
import urllib.request

from django.conf import settings

logger = logging.getLogger("audit")

REDACT_KEYS = {
    "password",
    "old_password",
    "new_password",
    "token",
    "access",
    "refresh",
    "authorization",
    "x-service-key",
    "encrypted_password",
    "secret",
}
_REDACTED = "***redacted***"


def sanitize_payload(value):
    """Recursively redact sensitive keys and truncate long blobs."""
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if str(k).lower() in REDACT_KEYS:
                out[k] = _REDACTED
            else:
                out[k] = sanitize_payload(v)
        return out
    if isinstance(value, (list, tuple)):
        return [sanitize_payload(v) for v in value]
    if isinstance(value, str) and len(value) > 2000:
        return value[:2000] + "...(truncated)"
    return value


def _post(url, payload, key, timeout):
    try:
        data = json.dumps(payload, default=str).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "X-Service-Key": key,
            },
            method="POST",
        )
        urllib.request.urlopen(req, timeout=timeout)  # noqa: S310 - fixed https url from settings
    except Exception as exc:  # noqa: BLE001 - audit is best effort
        logger.warning("audit post failed: %s", exc)


def send_audit_event(payload: dict):
    """Fire-and-forget. No-op unless ``settings.AUDIT_ENABLED``."""
    if not getattr(settings, "AUDIT_ENABLED", False):
        return
    url = settings.AUDIT_SERVICE_URL
    if not url:
        return
    thread = threading.Thread(
        target=_post,
        args=(url, payload, settings.AUDIT_SERVICE_KEY, settings.AUDIT_HTTP_TIMEOUT),
        daemon=True,
    )
    thread.start()
