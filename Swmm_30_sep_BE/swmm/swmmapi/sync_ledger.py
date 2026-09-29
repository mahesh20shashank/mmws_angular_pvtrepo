"""Records every CMMS sync into CmmsSyncRun, without the sync functions having to care.

The pull functions already return their own tallies, and the push views already know whether
they worked. What was missing was somewhere to put that. Rather than thread a ledger object
through every one of them, this wraps them: `@ledgered(...)` on the function, and the run
row is opened, filled from whatever the function returns, and closed — success or exception.

Why a decorator and not edits at the call sites: several of these functions are called from
more than one place (the Step 5 stream, Sync All, the individual module buttons), so a
call-site wrapper would have to be repeated and would drift. Wrapping the definition means
every caller is covered, including ones added later.

The trigger (manual / scheduled / on-reconnect) is ambient rather than a parameter, for the
same reason: it is a property of *why* the sync is running, which the sync function has no
way to know and every caller would otherwise have to pass down. It defaults to manual, and
the scheduled reconnect sets it for the duration of its run with `sync_trigger()`.
"""

import contextvars
import functools
import logging
from contextlib import contextmanager

from django.utils import timezone

from swmmapi.models import CmmsSyncRun

logger = logging.getLogger(__name__)

_current_trigger = contextvars.ContextVar(
    "cmms_sync_trigger", default=CmmsSyncRun.Trigger.MANUAL
)


@contextmanager
def sync_trigger(trigger):
    """Mark everything synced inside this block as `trigger`-driven."""
    token = _current_trigger.set(trigger)
    try:
        yield
    finally:
        _current_trigger.reset(token)


class _RunRecorder:
    """Handed to the caller inside `sync_run()`; collects the tallies for the row."""

    def __init__(self, run):
        self.run = run
        self._touched = False
        self._failed = False
        self._failure_message = None

    def record(self, fetched=None, created=None, updated=None, skipped=None,
               conflicts=None, linked=None, inserted=None, total=None, **_ignored):
        """Accepts the several vocabularies the existing sync functions already use.

        `linked` (routine list), `inserted` (change/remove requests) and `total` (the
        equipment status refresh) are the same three concepts under different names; they
        are folded onto the canonical columns rather than renamed at ~six call sites.
        Unknown keys are ignored so a sync function can grow a tally without breaking here.
        """
        self._touched = True
        if fetched is None and total is not None:
            fetched = total
        if created is None and inserted is not None:
            created = inserted
        if updated is None and linked is not None:
            updated = linked

        for field, value in (
            ("fetched", fetched),
            ("created", created),
            ("updated", updated),
            ("skipped", skipped),
            ("conflicts", conflicts),
        ):
            if value is not None:
                setattr(self.run, field, int(value))

    def record_result(self, result, adapter=None):
        """Fill the row from whatever a sync function returned."""
        if adapter is not None:
            self.record(**adapter(result))
        elif isinstance(result, dict):
            self.record(**result)
        # Anything else (None, a streamed generator) carries no tallies; the row still
        # records that the run happened and whether it raised.

        # The view-level pushes catch their own exceptions and answer with an error
        # Response instead of propagating, so "did not raise" is not the same as "worked".
        # Without this the ledger would file every one of those as a success -- which is
        # the exact failure mode it exists to make visible.
        failed, message = _response_failure(result)
        if failed:
            self.mark_failed(message)

    def mark_failed(self, message=None):
        self._failed = True
        self._failure_message = message

    @property
    def failed(self):
        return self._failed

    @property
    def failure_message(self):
        return self._failure_message

    @property
    def touched(self):
        return self._touched


def _response_failure(result):
    """(failed, message) for a DRF Response — (False, None) for anything else.

    Two conventions coexist in this codebase: an HTTP status of 400+, and a 200 carrying
    `{"status": False}` or `{"status": "error"}` in the body. Both count.
    """
    status_code = getattr(result, "status_code", None)
    data = getattr(result, "data", None)
    if status_code is None and data is None:
        return False, None

    body_message = data.get("message") if isinstance(data, dict) else None

    if status_code is not None and status_code >= 400:
        return True, body_message or f"HTTP {status_code}"

    if isinstance(data, dict) and "status" in data:
        flag = data["status"]
        if flag is False or (
            isinstance(flag, str) and flag.strip().lower() in ("error", "false")
        ):
            return True, body_message or "Reported failure."

    return False, None


@contextmanager
def sync_run(direction, module, trigger=None, was_full_pull=True):
    """Open a CmmsSyncRun around a block, and close it however the block ends.

    An exception is recorded as `failed` with its message and then re-raised — the ledger
    observes, it never swallows. A block that completes but reports skipped rows and no
    successes is recorded as `partial`, so "ran fine, matched nothing" is distinguishable
    from "ran fine" at a glance.
    """
    run = CmmsSyncRun.objects.create(
        direction=direction,
        module=module,
        trigger=trigger or _current_trigger.get(),
        was_full_pull=was_full_pull,
        status=CmmsSyncRun.Status.RUNNING,
    )
    recorder = _RunRecorder(run)
    try:
        yield recorder
    except Exception as exc:
        run.status = CmmsSyncRun.Status.FAILED
        run.error = str(exc)[:2000]
        run.finished_at = timezone.now()
        run.save()
        raise
    else:
        if recorder.failed:
            run.status = CmmsSyncRun.Status.FAILED
            run.error = (recorder.failure_message or "Reported failure.")[:2000]
        elif recorder.touched and run.skipped and not (run.created or run.updated):
            run.status = CmmsSyncRun.Status.PARTIAL
        else:
            run.status = CmmsSyncRun.Status.SUCCESS
        run.finished_at = timezone.now()
        run.save()


def ledgered(direction, module, adapter=None):
    """Record every call of the decorated sync function.

    `adapter` maps a non-dict return value onto record() keywords, for the functions that
    hand back a bare tuple.
    """

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            with sync_run(direction, module) as run:
                result = func(*args, **kwargs)
                run.record_result(result, adapter=adapter)
                return result

        return wrapper

    return decorator


def tuple_stats(*names):
    """Adapter for the sync functions that return a positional tuple instead of a dict."""

    def adapt(result):
        if not isinstance(result, (tuple, list)):
            return {}
        return dict(zip(names, result))

    return adapt


def last_successful_run(module, direction=None):
    """The most recent successful run for a module, or None. What "last synced" reads."""
    runs = CmmsSyncRun.objects.filter(
        module=module,
        status__in=[CmmsSyncRun.Status.SUCCESS, CmmsSyncRun.Status.PARTIAL],
    )
    if direction:
        runs = runs.filter(direction=direction)
    return runs.first()
