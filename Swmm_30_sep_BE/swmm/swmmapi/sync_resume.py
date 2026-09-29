"""Resume an interrupted CMMS sync where it stopped, instead of from the top.

The problem
-----------
Every sync here streams: the view is a generator, the browser reads it chunk by chunk, and
the rows are written as they are processed. When the link drops mid-stream -- routine on a
ship's shore connection -- the reader dies, WSGI closes the generator, and the sync stops
partway. The rows already written stay written. What was missing was any record of *where*
it stopped, so the next attempt re-fetched all N rows and re-processed them from row 1. The
writes are upserts, so nothing corrupted; it just meant redoing minutes of work to arrive
back where the interruption happened, on the very link that is least able to afford it.

The mechanism
-------------
`ResumeCursor` wraps the row loop. It reads `CmmsSyncCheckpoint` for its (module, phase),
skips the rows already confirmed, and writes its position back as it advances. The next
attempt picks up from there.

Correctness before speed
------------------------
Skipping work that was never done is silent data loss, while redoing work that was already
done costs only time (every write on these paths is an upsert keyed on a CMMS identity
column). Every judgement here is therefore biased towards redoing:

* A checkpoint is only honoured when its `signature` matches the batch now in hand -- same
  ship, same filter, same row count, same first and last key. CMMS changing underneath us
  invalidates the position, because row 230 of today's result set is not row 230 of
  yesterday's.
* On top of that, the key of the row at `processed - 1` must match the recorded `last_key`.
  Signature collisions are unlikely; this makes acting on one harmless.
* The position is only advanced *after* the consumer's loop body has finished with a row.
  A row interrupted halfway is not counted, so it is processed again next time.
* Anything unexpected -- a malformed checkpoint, a failed write -- starts the phase from the
  beginning rather than guessing.

Committing as it goes is the precondition
-----------------------------------------
A phase wrapped in one `transaction.atomic()` has nothing to resume: the interruption rolls
the whole thing back. Callers that want resumability therefore commit per batch (or per row)
instead, which is a real trade-off -- an interrupted phase now leaves the rows it got
through in place -- and so it is made explicitly at each call site rather than assumed here.

Checkpoints are deleted once the module finishes. A completed sync must run in full next
time -- re-running is how an operator picks up whatever CMMS changed -- so a checkpoint lives
exactly as long as an interruption is outstanding. `CmmsSyncRun` remains the durable history
of what ran; this table is only the bookmark.
"""

import hashlib
import logging
import time

from django.db import DatabaseError, transaction

from swmmapi.models import CmmsSyncCheckpoint

logger = logging.getLogger(__name__)

# Rows between checkpoint writes. One write per row would add a round trip to every row of a
# few-thousand-row pull for no real gain: the cost of a stale checkpoint is redoing at most
# this many rows, which on these upserts is a second or two. The position is also flushed
# when the loop is torn down (see ResumeCursor.__iter__), so an ordinary interruption
# normally loses nothing at all -- this bound only matters when the process dies outright.
FLUSH_EVERY = 50

# ...and a time bound as well, so a phase whose rows are slow (Step 4 does several ORM round
# trips per row) still records progress at a sane interval rather than only every
# FLUSH_EVERY rows.
FLUSH_SECONDS = 5.0


def _fingerprint(*parts):
    """Short stable hash of whatever identifies this batch."""
    joined = "\x1f".join("" if part is None else str(part) for part in parts)
    return hashlib.sha256(joined.encode("utf-8", "replace")).hexdigest()[:32]


def _key_text(value):
    return "" if value is None else str(value)


class _CheckpointWriter:
    """Shared position-recording for the two resume styles below.

    Both need the same thing -- write "we are at row N, whose key is K" to the checkpoint
    row, not too often -- and differ only in how they decide where to start.
    """

    def __init__(self, module, phase, *, signature, total, enabled=True):
        self.module = module
        self.phase = phase or ""
        self.signature = signature
        self.total = total
        self.enabled = enabled
        self.processed = 0
        self._flushed = 0
        self._last_flush_at = time.monotonic()

    @property
    def label(self):
        return f"{self.module}.{self.phase}" if self.phase else self.module

    def _due_for_flush(self):
        if self.processed - self._flushed >= FLUSH_EVERY:
            return True
        return (time.monotonic() - self._last_flush_at) >= FLUSH_SECONDS

    def _write(self, processed, last_key):
        if not self.enabled:
            return
        try:
            # Its own transaction: the caller may be mid-batch, and a checkpoint that rolled
            # back with the batch it was recording would point past rows that no longer
            # exist. Committing it separately can only ever under-report progress, which is
            # the safe direction.
            with transaction.atomic():
                CmmsSyncCheckpoint.objects.update_or_create(
                    module=self.module,
                    phase=self.phase,
                    defaults={
                        "signature": self.signature,
                        "processed": processed,
                        "total": self.total,
                        "last_key": last_key,
                        "completed": False,
                    },
                )
        except DatabaseError:
            logger.exception("Could not save sync checkpoint for %s", self.label)
            return
        self._flushed = processed
        self._last_flush_at = time.monotonic()

    def _load(self):
        try:
            return CmmsSyncCheckpoint.objects.filter(
                module=self.module, phase=self.phase
            ).first()
        except DatabaseError:
            logger.exception("Could not read sync checkpoint for %s", self.label)
            return None

    def finish(self):
        """Mark the phase done so a resume of a later phase does not re-run this one."""
        self.processed = self.total
        mark_phase_complete(self.module, self.phase)


class StreamCheckpoint(_CheckpointWriter):
    """Resume position for a phase whose rows are streamed, not held in memory.

    `ResumeCursor` materialises its rows so it can verify the one at the recorded position.
    T_MaintopDetail is ~295k rows and is read in chunks from the server cursor precisely so
    it never all exists locally at once, so that verification has to happen against the
    source instead: the caller re-reads the key at `candidate_offset - 1` and hands it to
    `accept()`, which only then allows the skip.

    Usage::

        checkpoint = StreamCheckpoint("step2", "headers", total=n, scope=(where,))
        offset = 0
        if checkpoint.candidate_offset:
            previous = <read the key at candidate_offset - 1 from CMMS>
            offset = checkpoint.accept(previous)
        for columns, chunk in iter_cmms_rows(..., order_by=key_col, start_offset=offset):
            ...
            checkpoint.advance(rows_done, last_key)
        checkpoint.finish()
    """

    def __init__(self, module, phase, *, total, scope=(), enabled=True):
        super().__init__(
            module,
            phase,
            signature=_fingerprint(module, phase, total, *scope),
            total=total,
            enabled=enabled,
        )
        self._stored = self._load() if enabled else None
        self.candidate_offset = 0
        self.expected_key = ""
        if (
            self._stored is not None
            and not self._stored.completed
            and self._stored.signature == self.signature
            and 0 < self._stored.processed < total
        ):
            self.candidate_offset = self._stored.processed
            self.expected_key = self._stored.last_key
        self.start_index = 0
        self._pending = None

    def accept(self, key_at_previous_row):
        """Confirm the skip against the source. Returns the offset to actually start from."""
        if not self.candidate_offset:
            return 0
        if _key_text(key_at_previous_row) != self.expected_key:
            logger.info(
                "Discarding sync checkpoint for %s (row key mismatch at offset %s)",
                self.label,
                self.candidate_offset,
            )
            self.candidate_offset = 0
            return 0
        self.start_index = self.candidate_offset
        self.processed = self.start_index
        self._flushed = self.start_index
        return self.start_index

    @property
    def resumed(self):
        return self.start_index > 0

    def resume_message(self):
        return (
            f"Resuming from record {self.start_index + 1} of {self.total} -- "
            f"{self.start_index} already synced by the interrupted run, "
            f"{self.total - self.start_index} to go."
        )

    def advance(self, processed, last_key):
        """Record that `processed` rows are now committed, ending with `last_key`.

        Call it after the batch is written, never before: the position must only ever trail
        what is actually in the database.
        """
        self.processed = processed
        # Kept as a pair. The position and the key that proves it have to describe the same
        # row, and by the time an interrupted loop reaches flush() the caller's own "last
        # key seen" variable has usually moved on to rows in an uncommitted batch.
        self._pending = (processed, _key_text(last_key))
        if self._due_for_flush():
            self._write(processed, _key_text(last_key))

    def flush(self):
        """Force the last recorded position out, e.g. on the way out of an interrupted loop."""
        if self._pending is None:
            return
        processed, last_key = self._pending
        if self._flushed < processed < self.total:
            self._write(processed, last_key)


class ResumeCursor(_CheckpointWriter):
    """Iterates `rows`, skipping the ones a previous interrupted attempt already finished.

    Usage::

        cursor = ResumeCursor("step4", "routines", rows, key=lambda r: r["RoutineID"])
        if cursor.resumed:
            yield "[RESUMED] " + cursor.resume_message() + "\\n"
        for row in cursor:
            ...process and write the row...
        cursor.finish()

    `finish()` marks the phase complete; not calling it (because the loop was interrupted)
    is exactly what leaves the checkpoint in place for the next attempt.
    """

    def __init__(
        self, module, phase, rows, *, key, scope=(), enabled=True, stable_order=True
    ):
        # Materialised on purpose: resuming needs a length and random access to verify the
        # row at the recorded position, neither of which a cursor-backed iterator gives.
        # Phases too large to hold in memory use StreamCheckpoint instead.
        self.rows = list(rows)
        self._key = key

        if stable_order:
            # "Row 230" only means anything if row 230 is the same row next time. None of
            # these pulls carry an ORDER BY -- SQL Server is free to return the same result
            # set in a different order on a different plan -- so the order is imposed here,
            # on the key the position is recorded against. Sorting is safe on these phases
            # because each row is upserted independently of its neighbours; a phase where
            # row order carried meaning would pass stable_order=False and accept that its
            # checkpoint is only as good as the source's own ordering.
            self.rows.sort(key=self._safe_key)

        super().__init__(
            module,
            phase,
            signature=_fingerprint(
                module,
                phase or "",
                len(self.rows),
                *scope,
                self._safe_key(self.rows[0]) if self.rows else "",
                self._safe_key(self.rows[-1]) if self.rows else "",
            ),
            total=len(self.rows),
            enabled=enabled,
        )

        self.start_index = self._resolve_start() if enabled else 0
        self.processed = self.start_index
        self._flushed = self.start_index

    # -- resume decision ---------------------------------------------------------------

    def _safe_key(self, row):
        try:
            return _key_text(self._key(row))
        except Exception:
            # A key function that cannot read this row means we cannot verify a position
            # against it either. Returning a sentinel keeps the signature stable and lets
            # _resolve_start() fail closed below.
            return ""

    def _resolve_start(self):
        checkpoint = self._load()
        if checkpoint is None or checkpoint.completed:
            return 0
        if checkpoint.signature != self.signature:
            # CMMS moved underneath the checkpoint. See module docstring.
            logger.info(
                "Discarding stale sync checkpoint for %s (source batch changed)",
                self.label,
            )
            return 0

        position = checkpoint.processed
        if position <= 0 or position >= self.total:
            return 0
        if self._safe_key(self.rows[position - 1]) != checkpoint.last_key:
            logger.info(
                "Discarding sync checkpoint for %s (row key mismatch)", self.label
            )
            return 0
        return position

    @property
    def resumed(self):
        return self.start_index > 0

    @property
    def remaining(self):
        return self.total - self.start_index

    def resume_message(self):
        return (
            f"Resuming from record {self.start_index + 1} of {self.total} -- "
            f"{self.start_index} already synced by the interrupted run, "
            f"{self.remaining} to go."
        )

    def __str__(self):
        return f"{self.label} @ {self.processed}/{self.total}"

    # -- iteration ---------------------------------------------------------------------

    def __len__(self):
        return self.total

    def __iter__(self):
        try:
            for index in range(self.start_index, self.total):
                row = self.rows[index]
                yield row
                # Only reached once the consumer's loop body has returned for this row, so
                # a row abandoned partway through is never counted as done.
                self.processed = index + 1
                if self._due_for_flush():
                    self._write(self.processed, self._safe_key(row))
        finally:
            # Runs on an ordinary exit and equally on GeneratorExit (the client went away)
            # or an exception, which is what makes an interruption normally lose nothing:
            # the position reached is recorded on the way out. Never yields -- doing so
            # during GeneratorExit is an error -- and never raises, since a checkpoint that
            # cannot be saved must not replace the real reason the sync stopped.
            if self._flushed < self.processed < self.total:
                last_row = self.rows[self.processed - 1]
                self._write(self.processed, self._safe_key(last_row))


# -- coarse, phase-level checkpoints ----------------------------------------------------
#
# Not every phase is a long row loop. Some are a single bulk statement, or small enough (a
# couple of hundred rows) that a row-level position would cost more than it saves. Those
# only need "did this phase already finish in the attempt that was interrupted?", which is
# what these give, so a resumed run starts at the phase that was actually in flight.


def phase_completed(module, phase):
    try:
        return CmmsSyncCheckpoint.objects.filter(
            module=module, phase=phase or "", completed=True
        ).exists()
    except DatabaseError:
        logger.exception("Could not read sync checkpoint for %s.%s", module, phase)
        return False


def mark_phase_complete(module, phase):
    try:
        with transaction.atomic():
            CmmsSyncCheckpoint.objects.update_or_create(
                module=module,
                phase=phase or "",
                defaults={"completed": True},
            )
    except DatabaseError:
        logger.exception("Could not save sync checkpoint for %s.%s", module, phase)


def clear_module(module):
    """Forget every checkpoint for a module.

    Called when the module finishes (so the next run is a full one) and when the caller
    explicitly asks for a full re-sync rather than a resume.
    """
    try:
        CmmsSyncCheckpoint.objects.filter(module=module).delete()
    except DatabaseError:
        logger.exception("Could not clear sync checkpoints for %s", module)


def module_progress(module):
    """What an interrupted run of `module` left behind, for the resume UI. None when clean."""
    try:
        rows = list(CmmsSyncCheckpoint.objects.filter(module=module))
    except DatabaseError:
        logger.exception("Could not read sync checkpoints for %s", module)
        return None
    if not rows:
        return None
    in_flight = next((row for row in rows if not row.completed), None)
    return {
        "module": module,
        "phases_completed": sum(1 for row in rows if row.completed),
        "phase": in_flight.phase if in_flight else None,
        "processed": in_flight.processed if in_flight else 0,
        "total": in_flight.total if in_flight else 0,
        "updated_at": max(row.updated_at for row in rows).isoformat(),
    }
