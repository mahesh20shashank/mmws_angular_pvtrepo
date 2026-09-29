"""Celery app + beat schedule.

Origin: ITTTM transfer_rights/tasks.py + a Celery-beat entry every 60s.
The same sweep is also runnable synchronously via
`manage.py run_delegation_lifecycle` for environments without a worker.
"""

import os

from celery import Celery
from django.conf import settings

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "authz_service.settings")

app = Celery("authz_service")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@app.on_after_finalize.connect
def setup_periodic_tasks(sender, **kwargs):
    sender.add_periodic_task(
        float(settings.DELEGATION_LIFECYCLE_INTERVAL_SECONDS),
        _lifecycle_signature(),
        name="delegation.manage_rights_lifecycle",
    )


def _lifecycle_signature():
    from delegation.tasks import manage_rights_lifecycle

    return manage_rights_lifecycle.s()
