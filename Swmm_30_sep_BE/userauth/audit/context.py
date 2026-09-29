"""Thread-local current-request holder. Origin: ITTTM context.py.

The middleware sets this at request start and ALWAYS clears it in ``finally``
(build prompt cross-cutting fix (a)).
"""

import threading

_local = threading.local()


def set_current_request(request):
    _local.request = request


def get_current_request():
    return getattr(_local, "request", None)


def clear_current_request():
    _local.request = None
