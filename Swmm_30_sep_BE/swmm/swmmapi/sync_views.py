"""Read-only views over the CMMS health check and the sync ledger.

Kept out of views.py deliberately: that module is ~15k lines and already the hardest file in
the project to review. Nothing here syncs anything — these only report.
"""

from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from swmmapi.cmms_health import cmms_health
from swmmapi.models import CmmsSyncRun
from swmmapi.views import CommonPagination

# The modules the ledger records, in the order a full sync runs them: masters before the
# transactions that resolve against them. The status endpoint reports all of them, including
# ones that have never run, so "never synced" is visible rather than absent.
LEDGER_MODULES = [
    "routine_list",
    "completed_routines",
    "fuss",
    "change_requests",
    "remove_requests",
    "equipment_status",
    "dart",
    "srar",
]


class CmmsHealthAPIView(APIView):
    """Is CMMS reachable right now?

    The frontend polls this to tell "the ship has a network" apart from "CMMS is up" — the
    distinction `navigator.onLine` cannot make, and the reason sync buttons used to look
    available while every sync failed.

    `?refresh=1` bypasses the short-lived cache, for the moment a user has just been told
    CMMS is down and wants to retry rather than wait out the TTL.
    """

    def get(self, request):
        refresh = str(request.query_params.get("refresh", "")).lower() in (
            "1",
            "true",
            "yes",
        )
        return Response(cmms_health(force_refresh=refresh))


class CmmsSyncRunListAPIView(APIView):
    """The sync ledger, newest first. `?module=` and `?status=` narrow it."""

    pagination_class = CommonPagination

    def get(self, request):
        runs = CmmsSyncRun.objects.all()

        module = (request.query_params.get("module") or "").strip()
        if module:
            runs = runs.filter(module=module)

        run_status = (request.query_params.get("status") or "").strip()
        if run_status:
            runs = runs.filter(status=run_status)

        direction = (request.query_params.get("direction") or "").strip()
        if direction:
            runs = runs.filter(direction=direction)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(list(runs), request, view=self)
        return paginator.get_paginated_response([self._serialize(run) for run in page])

    @staticmethod
    def _serialize(run):
        return {
            "id": run.id,
            "direction": run.direction,
            "module": run.module,
            "trigger": run.trigger,
            "status": run.status,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "duration_seconds": run.duration_seconds,
            "fetched": run.fetched,
            "created": run.created,
            "updated": run.updated,
            "skipped": run.skipped,
            "conflicts": run.conflicts,
            "was_full_pull": run.was_full_pull,
            "error": run.error,
        }


class CmmsSyncStatusAPIView(APIView):
    """Per-module: when it last succeeded, and what happened on its most recent attempt.

    Those are two different questions and the answer is often two different runs — a module
    that succeeded this morning and has failed every attempt since looks healthy if you only
    ask the first. Reporting both is what makes a stale-but-green module visible.
    """

    def get(self, request):
        latest_by_module = {}
        last_ok_by_module = {}

        # One pass over the recent history rather than 2 queries per module. Bounded because
        # this is a status widget, not an audit: older detail lives in the run list endpoint.
        for run in CmmsSyncRun.objects.all()[:2000]:
            latest_by_module.setdefault(run.module, run)
            if run.status in (CmmsSyncRun.Status.SUCCESS, CmmsSyncRun.Status.PARTIAL):
                last_ok_by_module.setdefault(run.module, run)

        modules = []
        for module in LEDGER_MODULES:
            latest = latest_by_module.get(module)
            last_ok = last_ok_by_module.get(module)
            modules.append(
                {
                    "module": module,
                    "last_success_at": (
                        last_ok.started_at.isoformat() if last_ok else None
                    ),
                    "last_attempt_at": (
                        latest.started_at.isoformat() if latest else None
                    ),
                    "last_attempt_status": latest.status if latest else None,
                    "last_attempt_error": latest.error if latest else None,
                    "never_run": latest is None,
                }
            )

        health = cmms_health()
        return Response(
            {
                "cmms": health,
                "modules": modules,
                "pending_push": pending_push_counts(),
                "running": CmmsSyncRun.objects.filter(
                    status=CmmsSyncRun.Status.RUNNING
                ).count(),
            },
            status=status.HTTP_200_OK,
        )


def pending_push_counts():
    """How much work is waiting to go to CMMS, per module.

    The dirty flags this reads were added per-module over time and never named alike --
    `cmms_sync_status` on darts and SRAR, `is_synced` on FUSS and SFD equipment, and on the
    SFD side a nullable *integer* rather than a boolean. They are read here as they are
    rather than renamed: a migration to unify them would touch live operational tables for
    a cosmetic gain, and this is the one place that has to know.
    """
    from ems.models import FussRaiseDetails
    from op_maintenance.models import CompleteDefectDart, InitiateDart
    from srar.models import SrarMonthlyHeader

    unsynced = Q(cmms_sync_status=False) | Q(cmms_sync_status__isnull=True)
    return {
        "dart_initiate": InitiateDart.objects.filter(unsynced).count(),
        "dart_complete": CompleteDefectDart.objects.filter(unsynced).count(),
        "fuss": FussRaiseDetails.objects.filter(
            Q(is_sync=False) | Q(is_sync__isnull=True)
        ).count(),
        # Only CO-approved returns are pushable at all, so an unapproved one is not pending
        # -- counting it would show work that no sync run could ever clear.
        "srar": SrarMonthlyHeader.objects.filter(co_approved=True)
        .filter(unsynced)
        .count(),
    }
