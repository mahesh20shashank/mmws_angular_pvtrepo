"""authz_service project package.

Import the Celery app so shared_task picks up the right instance, but do not
hard-fail import when Celery's broker libs are unavailable (e.g. a minimal
CI image) -- the service and its tests must still run.
"""

try:  # pragma: no cover - import guard
    from .celery import app as celery_app

    __all__ = ("celery_app",)
except Exception:  # noqa: BLE001 - best effort, Celery is optional at import time
    celery_app = None
    __all__ = ()
