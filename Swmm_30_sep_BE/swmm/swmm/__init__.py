try:
    from .celery import app as celery_app
except ImportError:  # pragma: no cover - local dev fallback when celery is absent
    celery_app = None

# Register the connection_created receiver that runs CREATE SCHEMA IF NOT EXISTS
# before the first DDL. It lives in swmm/db.py purely as a @receiver, so it must
# be imported once at startup or the signal is never connected and `migrate`
# fails with MigrationSchemaMissing under the search_path="<DB_SCHEMA>" setup.
from . import db as _db  # noqa: F401

__all__ = ("celery_app",)
