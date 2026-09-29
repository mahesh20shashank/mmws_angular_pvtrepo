"""DRF exception handler -> SWMM-style error contract.

Build prompt anti-pattern #7: no more HTTP 200 + ``{"status": 2, ...}``. Every
error carries a correct HTTP status code and the shape
``{"status": "error", "message": ..., <field errors>}``
(SWMM ``users/views.py`` / ``serializers.py`` convention).
"""

from rest_framework.views import exception_handler as drf_exception_handler


def swmm_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    data = response.data
    payload = {"status": "error"}

    if isinstance(data, dict):
        detail = data.get("detail")
        if detail is not None:
            payload["message"] = str(detail)
        else:
            # Field errors -- keep them, and synthesize a top-line message.
            first_key = next(iter(data), None)
            first_val = data.get(first_key) if first_key else None
            if isinstance(first_val, (list, tuple)) and first_val:
                payload["message"] = f"{first_key}: {first_val[0]}"
            else:
                payload["message"] = "Request could not be processed."
            payload.update(data)
    elif isinstance(data, list):
        payload["message"] = str(data[0]) if data else "Request could not be processed."
        payload["errors"] = data
    else:
        payload["message"] = str(data)

    response.data = payload
    return response
