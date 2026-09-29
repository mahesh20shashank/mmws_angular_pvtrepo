"""Durable record of what the CMMS integration has actually done.

Until now a sync left no trace. It ran, the result was rendered into a response or a
streamed log, and a page refresh erased it — so nobody could answer "when did this last
work?", and a module reporting success while CMMS received nothing (which is exactly what
the SRAR push did) was invisible after the fact.

One row per run per module, written whether the run succeeds or fails. That is what turns
"the tick was green" into something checkable, and it is the table the automatic reconnect
will read to decide whether a sync is even needed.
"""

from django.db import models
from master.models import Base


class CmmsSyncRun(Base):
    class Direction(models.TextChoices):
        PULL = "pull", "Pull (CMMS -> SWMM)"
        PUSH = "push", "Push (SWMM -> CMMS)"

    class Trigger(models.TextChoices):
        MANUAL = "manual", "Manual"
        AUTO = "auto", "Scheduled"
        RECONNECT = "reconnect", "On reconnect"

    class Status(models.TextChoices):
        RUNNING = "running", "Running"
        SUCCESS = "success", "Success"
        PARTIAL = "partial", "Partial"
        FAILED = "failed", "Failed"

    direction = models.CharField(max_length=8, choices=Direction.choices)
    # Free text rather than choices: the module set is the list of sync functions, which
    # grows with the integration, and a migration per new sync would be friction for no
    # gain. The API filters on it as a plain string.
    module = models.CharField(max_length=64, db_index=True)
    trigger = models.CharField(
        max_length=16, choices=Trigger.choices, default=Trigger.MANUAL
    )

    started_at = models.DateTimeField(auto_now_add=True, db_index=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.RUNNING
    )

    fetched = models.IntegerField(default=0)
    created = models.IntegerField(default=0)
    updated = models.IntegerField(default=0)
    skipped = models.IntegerField(default=0)
    conflicts = models.IntegerField(default=0)

    error = models.TextField(null=True, blank=True)

    # Whether this run saw the entity's *whole* CMMS population rather than only rows
    # changed since the last watermark. Recorded from the start because the deactivation
    # sweep will hinge on it: "CMMS did not send this row, so it is gone" is only sound
    # after a complete pull, and inferring it from a delta run would deactivate the fleet.
    was_full_pull = models.BooleanField(default=True)

    class Meta:
        db_table = "cmms_sync_run"
        ordering = ["-started_at"]
        indexes = [
            models.Index(
                fields=["module", "direction", "-started_at"],
                name="cmms_sync_run_module_idx",
            ),
            models.Index(
                fields=["status", "-started_at"], name="cmms_sync_run_status_idx"
            ),
        ]

    def __str__(self):
        return f"{self.direction} {self.module} @ {self.started_at:%Y-%m-%d %H:%M} ({self.status})"

    @property
    def duration_seconds(self):
        if not self.finished_at:
            return None
        return (self.finished_at - self.started_at).total_seconds()


class CmmsSyncCheckpoint(Base):
    """How far a sync got, so an interrupted one resumes instead of restarting.

    The syncs stream thousands of rows over a link that drops. When it drops, the browser's
    reader dies, the generator is closed, and everything already written stays written — but
    nothing recorded *how much* was written, so the next attempt re-fetched and re-processed
    every row from the top. On a 2886-row pull over a ship's shore link that is minutes of
    work redone for nothing, every time.

    One row per (module, phase): the sync writes its position here as it goes, and reads it
    back on the next attempt to skip what it already did.

    Why a stored `signature` rather than trusting the position alone
    ---------------------------------------------------------------
    A position is only meaningful against the same source rows in the same order. If CMMS
    has changed underneath us — rows added, removed, the ship rescoped — resuming at row 230
    would silently skip 230 *different* rows. `signature` fingerprints the batch the position
    was taken against (ship, filter, total, and the key of the first and last row); when it
    doesn't match on resume, the checkpoint is discarded and the phase runs in full. Redoing
    work is cheap and idempotent; skipping work that was never done is silent data loss.

    Why the checkpoint is deleted on success rather than kept
    --------------------------------------------------------
    A completed phase must run in full next time — a manual re-sync is how an operator picks
    up rows CMMS changed since. The checkpoint exists only to bridge an interruption, so it
    lives exactly as long as one is outstanding. `CmmsSyncRun` remains the durable history.
    """

    module = models.CharField(max_length=64, db_index=True)
    # Phases within one module run in a fixed order and are checkpointed separately, so an
    # interruption in phase 3 does not re-run phases 1 and 2. Empty for single-phase syncs.
    phase = models.CharField(max_length=64, blank=True, default="")

    signature = models.TextField(blank=True, default="")
    # Rows confirmed written. The resume point: processing restarts at this index.
    processed = models.IntegerField(default=0)
    total = models.IntegerField(default=0)
    # Key of the last confirmed row, checked against the row at `processed - 1` on resume as
    # a second guard on top of `signature`.
    last_key = models.TextField(blank=True, default="")
    # Set once the phase finished, so a multi-phase resume can skip it outright without
    # needing a position. Rows for finished phases are cleared when the whole module ends.
    completed = models.BooleanField(default=False)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cmms_sync_checkpoint"
        constraints = [
            models.UniqueConstraint(
                fields=["module", "phase"], name="cmms_sync_checkpoint_unique"
            )
        ]

    def __str__(self):
        label = f"{self.module}.{self.phase}" if self.phase else self.module
        return f"{label} @ {self.processed}/{self.total}"
