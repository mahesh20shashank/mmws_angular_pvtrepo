import hashlib
import json
from urllib.parse import urlencode

from django.core.cache import cache


def make_cache_key(
    prefix,
    request=None,
    *,
    extra=None,
    vary_on_user=False,
    vary_on_department=False,
):
    payload = {
        "prefix": prefix,
    }

    if request is not None:
        payload["path"] = getattr(request, "path", "")
        query_params = getattr(request, "query_params", None)
        if query_params:
            query_items = []
            for key in sorted(query_params.keys()):
                for value in query_params.getlist(key):
                    query_items.append((key, "" if value is None else str(value)))
            payload["query"] = urlencode(query_items, doseq=True)

        user = getattr(request, "user", None)
        if vary_on_user and getattr(user, "is_authenticated", False):
            payload["user_id"] = user.pk

        if vary_on_department and getattr(user, "is_authenticated", False):
            payload["department_id"] = getattr(user, "department_id", None)

    if extra:
        payload["extra"] = extra

    digest = hashlib.sha256(
        json.dumps(
            payload,
            sort_keys=True,
            default=str,
        ).encode("utf-8")
    ).hexdigest()
    return f"{prefix}:{digest}"


def get_or_set_cached_payload(cache_key, builder, timeout=300):
    cached_payload = cache.get(cache_key)
    if cached_payload is not None:
        return cached_payload

    payload = builder()
    cache.set(cache_key, payload, timeout=timeout)
    return payload
