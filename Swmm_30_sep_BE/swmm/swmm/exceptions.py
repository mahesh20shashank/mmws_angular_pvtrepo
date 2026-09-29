import logging

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler


logger = logging.getLogger(__name__)


def get_error_message(errors):
    if isinstance(errors, dict):
        messages = []
        for field, error in errors.items():
            if isinstance(error, (dict, list)):
                messages.append(f"{field}: {get_error_message(error)}")
            else:
                messages.append(f"{field}: {error}")
        return "; ".join(messages)
    elif isinstance(errors, list):
        return ", ".join([get_error_message(e) for e in errors])
    return str(errors)


def custom_exception_handler(exc, context):
    # Call DRF's default exception handler first to get the standard error response
    response = exception_handler(exc, context)

    if response is not None:
        if isinstance(exc, ValidationError):
            error_msg = get_error_message(response.data)
            field_errors = response.data if isinstance(response.data, dict) else {}
            response.data = {
                "status": "error",
                "message": error_msg,
                **field_errors,
            }
        else:
            # Handle other DRF exceptions (e.g. 404 NotFound, 401 Unauthorized, etc.)
            message = response.data.get("detail", str(response.data))
            response.data = {"status": "error", "message": message}
    else:
        logger.error("Unhandled exception in request", exc_info=True)

        if settings.DEBUG:
            message = f"{exc.__class__.__name__}: {str(exc)}"
        else:
            message = "Internal server error."

        response = Response(
            {"status": "error", "message": message},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return response
