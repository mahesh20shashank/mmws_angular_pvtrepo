"""Delegation lifecycle sweep -- the transition engine.

Origin: ITTTM transfer_rights/tasks.py::manage_rights_lifecycle. Kept as a
plain function so it can run under Celery beat (delegation/tasks.py) or the
``run_delegation_lifecycle`` management command with identical behavior.

Transitions:
  PENDING  + start_date_time <= now      -> ACTIVE   (log ACTIVATED)
  ACTIVE/EXTENDED + end_date_time <= now  -> COMPLETED (log COMPLETED)

Revocation (-> REDUCED) is operator-driven in the view, not here.
"""

import logging

from django.db import transaction
from django.utils import timezone

from authz.cache import invalidate_user_profile

from .models import RightsTransfer, RightsTransferLog

logger = logging.getLogger("delegation")


def run_lifecycle(now=None) -> dict:
    now = now or timezone.now()
    activated = 0
    completed = 0

    pending = RightsTransfer.objects.filter(
        status=RightsTransfer.STATUS_PENDING, start_date_time__lte=now
    )
    for transfer in pending:
        with transaction.atomic():
            prev = transfer.status
            transfer.status = RightsTransfer.STATUS_ACTIVE
            transfer.save(update_fields=["status", "modified_on"])
            RightsTransferLog.objects.create(
                transfer=transfer,
                action_type="ACTIVATED",
                previous_status=prev,
                new_status=transfer.status,
                previous_end_date_time=transfer.end_date_time,
                new_end_date_time=transfer.end_date_time,
                performed_by=None,
                reason="System auto-activation: start time reached.",
            )
        invalidate_user_profile(transfer.delegatee_id)
        activated += 1

    expired = RightsTransfer.objects.filter(
        status__in=RightsTransfer.LIVE_STATUSES, end_date_time__lte=now
    )
    for transfer in expired:
        with transaction.atomic():
            prev = transfer.status
            transfer.status = RightsTransfer.STATUS_COMPLETED
            transfer.actual_retrieved_at = now
            transfer.save(
                update_fields=["status", "actual_retrieved_at", "modified_on"]
            )
            RightsTransferLog.objects.create(
                transfer=transfer,
                action_type="COMPLETED",
                previous_status=prev,
                new_status=transfer.status,
                previous_end_date_time=transfer.end_date_time,
                new_end_date_time=transfer.end_date_time,
                performed_by=None,
                reason="System auto-completion: duration elapsed.",
            )
        invalidate_user_profile(transfer.delegatee_id)
        completed += 1

    if activated or completed:
        logger.info(
            "delegation lifecycle: activated=%s completed=%s", activated, completed
        )
    return {"activated": activated, "completed": completed}
