from celery import shared_task

from .lifecycle import run_lifecycle


@shared_task(name="delegation.manage_rights_lifecycle")
def manage_rights_lifecycle():
    """Celery-beat entrypoint (every ``DELEGATION_LIFECYCLE_INTERVAL_SECONDS``).
    Delegates to the shared ``run_lifecycle`` function."""
    return run_lifecycle()
