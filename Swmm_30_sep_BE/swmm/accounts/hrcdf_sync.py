# Developed with Understanding: the HRCDF roster sync engine for swmm (CP-C). It reads the
# HRCDF roster through accounts.hrcdf_client, routes every record by unit (D19), writes
# own-ship personnel into CustomUserProfile under AR1 in its contained form (auth_source
# HRCDF, has_credentials False, is_role False - never a CustomUser, a role or a credential)
# and other-unit personnel into OtherCustomUserProfile (D2), closes and moves leavers (D4,
# D21). Get Ship Names is a job of mode units that refreshes master.HrcdfCommand and
# master.HrcdfUnit from HRCDF only, and roster runs never write those tables. Owning
# service swmm, schema swmm. No sibling service is called. The logic is IIMA's
# accountApp/hrcdf_sync.py re-expressed per R1 G2 - no daemon thread and no process memory. Progress lines and the single-run lock
# live in the swmm Django cache, counters on the HrcdfSyncJob row, and the run itself is a
# Celery task dispatched through swmm.async_jobs.dispatch_task.
"""HRCDF roster sync engine - routing, writes, progress, lock and dispatch."""

import logging
import time
import uuid
from datetime import date, datetime

from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from django.utils.dateparse import parse_date

from master.models import (
    ActiveShipConfig,
    Department,
    HrcdfCommand,
    HrcdfUnit,
    MasterCommand,
    Unit,
)
from swmm.async_jobs import accepted_task_response, dispatch_task, sync_task_response

from .hrcdf_client import LINE_INFO, HrcdfClient, HrcdfSyncError, as_text
from .models import (
    AUTH_SOURCE_HRCDF,
    CustomUserProfile,
    HrcdfSyncJob,
    OtherCustomUserProfile,
    Rank,
    ShipIdentity,
)
from .serializers import HrcdfSyncJobSummarySerializer

logger = logging.getLogger(__name__)

# Developed with Understanding: the five console line kinds, the same vocabulary IIMA's
# browser paints (IIMA sync lines 135-139). LINE_INFO lives in the client module.
LINE_RECORD = "record"
LINE_WARN = "warn"
LINE_ERROR = "error"
LINE_DONE = "done"

# Developed with Understanding: cache keys. The swmm cache adds its own "swmm" prefix
# (settings CACHES KEY_PREFIX), so these never collide with another service's keys.
CACHE_PREFIX = "hrcdf_sync"
LOCK_KEY = f"{CACHE_PREFIX}:lock"
# Developed with Understanding: IIMA MAX_LOG_LINES and MAX_LINES_PER_POLL (sync lines
# 104-107), and the flush cadence the CP-C prompt fixes - every 200 lines or every second.
MAX_LOG_LINES = 20000
MAX_LINES_PER_POLL = 2000
FLUSH_EVERY_LINES = 200
FLUSH_EVERY_SECONDS = 1.0
# Developed with Understanding: progress keys outlive the run by a day so a finished run
# can still be read back, then Redis drops them on its own.
PROGRESS_TTL_SECONDS = 86400
# Developed with Understanding: IIMA MAX_ERRORS_REPORTED (sync line 148). The worker log
# holds every error, the job row the first 200.
MAX_ERRORS_REPORTED = 200

ORIGIN_HRCDF = "HRCDF"
# Developed with Understanding: plain string values, so a mode read back from the job row
# matches by value in both the tuple and the dict.
RUN_MODES = (HrcdfSyncJob.Mode.OWN.value, HrcdfSyncJob.Mode.OTHERS.value)
# Developed with Understanding: the modes start_sync accepts. units is Get Ship Names,
# started only through units/refresh/, so runs/ keeps to RUN_MODES.
MODE_UNITS = HrcdfSyncJob.Mode.UNITS.value
START_MODES = (*RUN_MODES, MODE_UNITS)
MODE_LABELS = {
    HrcdfSyncJob.Mode.OWN.value: "own-ship",
    HrcdfSyncJob.Mode.OTHERS.value: "other-units",
    HrcdfSyncJob.Mode.UNITS.value: "unit",
}

# Developed with Understanding: every counter the CP-C prompt names, in console order.
STAT_KEYS = (
    "fetched",
    "own_created",
    "own_updated",
    "own_unchanged",
    "others_created",
    "others_updated",
    "others_unchanged",
    "leavers",
    # Developed with Understanding: kept so the stats shape is unchanged. Roster runs no
    # longer create units, so it stays 0 on own and others runs.
    "units_created",
    "skipped",
    "skipped_other_mode",
    "failed",
)

# Developed with Understanding: the counters of a units job (Get Ship Names). fetched is
# the number of HRCDF records read, so the progress bar works as it does for a roster run.
UNITS_STAT_KEYS = (
    "fetched",
    "units_seen",
    "units_created",
    "units_updated",
    "units_unchanged",
    "commands_created",
    "commands_updated",
    "skipped",
    "failed",
)

# Developed with Understanding: THE FIELD MAP - HRCDF key on the left, column on the right,
# for both personnel tables. It is IIMA's HRCDF_USER_FIELD_MAP (sync lines 167-203) aimed
# at the HrcdfPersonnelFields columns of CP-A, plus the five keys that land on columns the
# two tables already had. A key HRCDF does not send is left untouched on the row.
HRCDF_FIELD_MAP = {
    "firstName": "firstname",
    "lastName": "lastname",
    "middleName": "middle_name",
    "fullName": "full_name",
    "isActive": "hrcdf_is_active",
    "dateOfJoining": "date_of_joining",
    "dateOfBirth": "date_of_birth",
    "dateOfCommission": "date_of_commission",
    "dateOfSeniority": "date_of_seniority",
    "dateOfRetirement": "date_of_retirement",
    "officialMobileNumber": "official_mobile",
    "personalMobileNumber": "personal_mobile",
    "nudEmailId": "nud_email",
    "personnelEmailId": "personnel_email",
    "govEmailId": "gov_email",
    "userTypeCode": "user_type_code",
    "userTypeName": "user_type_name",
    "genderId": "gender_id",
    "gender": "gender",
    "genderName": "gender_name",
    "unitId": "hrcdf_unit_id",
    "unitCode": "unit_code",
    "unitName": "section",
    "commandId": "hrcdf_command_id",
    "commandCode": "command_code",
    "rankId": "hrcdf_rank_id",
    "rankCode": "rank_code",
    "rankName": "rank_name",
    "branchId": "branch_id",
    "branchCode": "branch_code",
    "branchName": "branch_name",
    "cadreId": "cadre_id",
    "cadreCode": "cadre_code",
    "cadreName": "cadre_name",
    "designationIdm": "hrcdf_designation",
    "serviceCode": "service_code",
    "commissionType": "commission_type",
}

# Developed with Understanding: IIMA NON_NULL_USER_COLUMNS (sync line 207) - a null from
# HRCDF never blanks a person's name, the current value is kept.
NON_NULL_TEXT_COLUMNS = ("firstname", "lastname")

# Developed with Understanding: keys read to route a record and to set its relations
# rather than copied straight into one column. Listed so the reader sees they are handled.
HRCDF_KEYS_USED_FOR_RELATIONS = (
    "personnelNumber",
    "unitCode",
    "unitId",
    "unitName",
    "commandCode",
    "commandName",
    "rankName",
    "branchName",
)

# Developed with Understanding: IIMA HRCDF_KEYS_NOT_STORED (sync lines 219-228) kept as it
# is (D14 OQ12). designation and dateOfMarriage are on it, so the sync never writes the
# designation or marriage_date columns.
HRCDF_KEYS_NOT_STORED = (
    "serialNumber",
    "nationalityId",
    "nationalityCode",
    "nationalityName",
    "entryTypeId",
    "entryType",
    "entryTypeName",
    "userTypeId",
    "bloodGroupId",
    "bloodGroupCode",
    "bloodGroupName",
    "maritalStatusId",
    "maritalStatusCode",
    "maritalStatusName",
    "religionId",
    "religionCode",
    "religionName",
    "designationId",
    "designationCode",
    "designationName",
    "designation",
    "createdBy",
    "createdDate",
    "modifiedBy",
    "modifiedDate",
    "sourceApp",
    "group",
    "personalImage",
    "personsDesignations",
    "aadharNumber",
    "panNumber",
    "voterId",
    "gxUnitCode",
    "gxUnitName",
    "unitIdm",
    "reemployedYn",
    "reemployedDate",
    "icardNumber",
    "icardType",
    "dateOfMarriage",
)

# Developed with Understanding: the legacy branch folding at LEGACY users/views.py lines
# 1125 to 1137 (save_hrcdf_to_db) - these branches belong to the EXECUTIVE department, any
# other branch is looked up by its own upper-cased name (D20). The list is copied as the
# legacy code holds it, including its mixed-case 'Hygiene' entry.
EXECUTIVE_BRANCHES = (
    "HULL",
    "NBCD",
    "GUNNERY",
    "ASW",
    "COMMUNICATION",
    "ND",
    "AVIATION",
    "Hygiene",
    "HYGIENE",
    "LOGISTICS",
)
EXECUTIVE_DEPARTMENT = "EXECUTIVE"

# Developed with Understanding: HRCDF unit codes are five-digit zero-padded text (R1 A5,
# 3061 of 3061 userauth codes are 5 characters). A code that arrives as a JSON number has
# lost its padding, so it is padded back to this width.
UNIT_CODE_WIDTH = 5

_TRUE_TEXT = {"1", "true", "t", "yes", "y"}
_FALSE_TEXT = {"0", "false", "f", "no", "n"}


# --------------------------------------------------------------------------
# Value normalisation
# --------------------------------------------------------------------------


# Developed with Understanding: the configuration dict, read fresh on every call so an
# override_settings in a test and a settings reload both apply.
def sync_config():
    """Return settings.HRCDF_SYNC or an empty dict."""
    return getattr(settings, "HRCDF_SYNC", None) or {}


# Developed with Understanding: personnelNumber stripped and upper-cased - the match key.
def personnel_number_of(record):
    """Return the record's personnel number upper-cased, or None when blank."""
    text = as_text(record.get("personnelNumber"), None)
    return text.upper() if text else None


# Developed with Understanding: unitCode stays text, never a number (R1 B4, OB4).
def unit_code_of(value):
    """Return a unit code as zero-padded text, or "" when blank."""
    if isinstance(value, int) and not isinstance(value, bool):
        return f"{value:0{UNIT_CODE_WIDTH}d}"
    return as_text(value, 10) or ""


# Developed with Understanding: a whole number from an int or a digit string, else None.
def _as_int(value):
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    text = str(value).strip()
    if text.lstrip("-").isdigit():
        return int(text)
    return None


# Developed with Understanding: HRCDF sends ISO datetimes such as 1990-05-12T00:00:00. The
# date part is taken literally, so a timezone suffix can never move the stored day.
def _as_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    try:
        return parse_date(text[:10])
    except ValueError:
        return None


# Developed with Understanding: isActive arrives as 0 or 1, sometimes as text or a bool.
def _as_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value) if value in (0, 1) else None
    text = str(value).strip().lower()
    if text in _TRUE_TEXT:
        return True
    if text in _FALSE_TEXT:
        return False
    return None


# Developed with Understanding: converts one HRCDF value for one model column, driven by
# the column's own type. Returns (usable, value). usable False leaves the column as it is -
# a value that cannot be read is never allowed to blank good data or fail the record.
def _convert_value(field, column, raw):
    kind = field.get_internal_type()
    if kind in ("CharField", "EmailField", "SlugField", "TextField"):
        if column == "unit_code":
            return True, unit_code_of(raw)
        text = as_text(raw, field.max_length)
        if text is None:
            return column not in NON_NULL_TEXT_COLUMNS, ""
        return True, text
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return True, None
    if kind == "DateField":
        converted = _as_date(raw)
    elif kind == "BooleanField":
        converted = _as_bool(raw)
    elif kind in ("IntegerField", "BigIntegerField"):
        converted = _as_int(raw)
    else:
        return False, None
    if converted is None:
        logger.warning(
            "HRCDF value for %s could not be read: %r", column, str(raw)[:40]
        )
        return False, None
    return True, converted


# Developed with Understanding: the mapped column values of one record for one model.
def mapped_values(model, record):
    """Return {column: value} for every mapped HRCDF key present in record."""
    values = {}
    for hrcdf_key, column in HRCDF_FIELD_MAP.items():
        if hrcdf_key not in record:
            continue
        field = model._meta.get_field(column)
        usable, value = _convert_value(field, column, record.get(hrcdf_key))
        if usable:
            values[column] = value
    return values


# Developed with Understanding: IIMA _update_user delta rule (sync lines 686-713) - only
# the columns whose value differs are set, and their names are returned for update_fields.
def _apply_delta(instance, values):
    changed = []
    for column, value in values.items():
        if getattr(instance, column) != value:
            setattr(instance, column, value)
            changed.append(column)
    return changed


# Developed with Understanding: D19 routing of one record against a home unit, extracted
# as it was from _SyncRun.is_own_ship (CP-K) so login routing applies the same rule - own
# ship when unitCode equals the home unit code, or failing that when unitId equals the home
# unit hrcdf_unit_id.
def is_own_ship_record(record, home_code, home_unit_id):
    """Return True when record places the person in the home unit."""
    code = unit_code_of(record.get("unitCode"))
    if code and home_code and code == home_code:
        return True
    unit_id = _as_int(record.get("unitId"))
    return unit_id is not None and home_unit_id is not None and unit_id == home_unit_id


# Developed with Understanding: whether a record carries any unit to route by, extracted as
# it was from _SyncRun.apply (CP-K).
def record_has_unit(record):
    """Return True when record carries a unitCode or a unitId."""
    return bool(unit_code_of(record.get("unitCode")) or _as_int(record.get("unitId")))


# Developed with Understanding: the delta write of an existing own-ship row, extracted as it
# was from _SyncRun._write_own (CP-K). Returns the changed column names, [] when none.
def _update_own(profile, values, now):
    changed = _apply_delta(profile, values)
    if changed:
        profile.hrcdf_synced_at = now
        profile.updated_at = now
        profile.save(update_fields=[*changed, "hrcdf_synced_at", "updated_at"])
    return changed


# Developed with Understanding: the other-unit column values of one record - the field map
# plus command_name from the commandName text - extracted as it was from
# _SyncRun._write_other (CP-K).
def _other_values(record):
    values = mapped_values(OtherCustomUserProfile, record)
    if "commandName" in record:
        command_width = OtherCustomUserProfile._meta.get_field(
            "command_name"
        ).max_length
        values["command_name"] = as_text(record.get("commandName"), command_width) or ""
    return values


# Developed with Understanding: the delta write of an existing other-unit row, extracted as
# it was from _SyncRun._write_other (CP-K) - mapped columns that differ, the row made
# current again and an empty record_origin filled. Returns the changed column names.
def _update_other(other, values, now):
    changed = _apply_delta(other, values)
    if not other.is_current_other_unit:
        other.is_current_other_unit = True
        changed.append("is_current_other_unit")
    if not (other.record_origin or "").strip():
        other.record_origin = ORIGIN_HRCDF
        changed.append("record_origin")
    if changed:
        other.hrcdf_synced_at = now
        other.updated_at = now
        other.save(update_fields=[*changed, "hrcdf_synced_at", "updated_at"])
    return changed


# Developed with Understanding: writes one HRCDF record into an existing own-ship
# (CustomUserProfile) or other-unit (OtherCustomUserProfile) row with the roster engine's
# own helpers - the same field map, parsing, delta rule and existing-row relation rules
# (D27, CP-K). Used by the login refresh in accounts.authz_sync. Returns the changed
# column names, [] when the row already matched.
def apply_person_record(record, target):
    """Write one HRCDF record into target and return the changed column names."""
    now = timezone.now()
    if isinstance(target, OtherCustomUserProfile):
        return _update_other(target, _other_values(record), now)
    if isinstance(target, CustomUserProfile):
        return _update_own(target, mapped_values(CustomUserProfile, record), now)
    raise TypeError("target must be a CustomUserProfile or an OtherCustomUserProfile")


# Developed with Understanding: name, number and rank of a profile for a 409 message.
def profile_label(profile):
    """Return a short readable label for a CustomUserProfile, or "" for None."""
    if profile is None:
        return ""
    name = f"{profile.firstname or ''} {profile.lastname or ''}".strip()
    name = name or profile.full_name or ""
    if profile.personal_number:
        return f"{name} ({profile.personal_number})".strip()
    return name


# --------------------------------------------------------------------------
# Unit harvest (fill-empty rule)
# --------------------------------------------------------------------------


# Developed with Understanding: finds the MasterCommand for an HRCDF commandCode, which
# swmm holds in unit_name (R1 Q-A5b, D20). A command is never created here (IIMA
# _resolve_command, sync lines 577-588).
def command_for_code(code):
    """Return the MasterCommand whose unit_name equals code, or None."""
    code = (code or "").strip()
    if not code:
        return None
    return MasterCommand.objects.filter(unit_name__iexact=code).order_by("id").first()


# Developed with Understanding: upserts one master.HrcdfCommand by code for Get Ship
# Names. A new command is created with record_origin HRCDF and the commandName, or its
# code when HRCDF sends no name. An existing command, SEED or HRCDF, is never renamed and
# only an empty name is filled. Returns (outcome, command) where outcome is "created",
# "filled", "unchanged" or "skipped".
def upsert_harvested_command(code, name):
    """Return (outcome, HrcdfCommand or None) for one HRCDF commandCode."""
    width = HrcdfCommand._meta.get_field("code").max_length
    code = (as_text(code, width) or "").upper()
    if not code:
        return "skipped", None
    name = as_text(name, HrcdfCommand._meta.get_field("name").max_length)
    command = HrcdfCommand.objects.filter(code__iexact=code).order_by("id").first()
    if command is None:
        command = HrcdfCommand.objects.create(
            code=code, name=name or code, record_origin=ORIGIN_HRCDF
        )
        return "created", command
    if not command.name and name:
        command.name = name
        command.updated_at = timezone.now()
        command.save(update_fields=["name", "updated_at"])
        return "filled", command
    return "unchanged", command


# Developed with Understanding: upserts one master.HrcdfUnit by code with record_origin
# HRCDF, the IIMA fill-empty rule re-expressed (IIMA _resolve_unit, sync lines 591-638, R1
# G1 step 10). A new unit needs a code and a name. An existing unit only has empty fields
# filled and is never renamed. hrcdf_unit_id is unique, so an id another unit already holds
# is left alone rather than failing the write. Units are never deleted. Returns
# (outcome, changed field names).
def upsert_harvested_unit(code, name, hrcdf_unit_id=None, command=None):
    """Return ("created" | "filled" | "unchanged" | "skipped", [changed fields])."""
    code = (code or "").strip()
    name = as_text(name, HrcdfUnit._meta.get_field("name").max_length)
    if not code:
        return "skipped", []
    id_taken = hrcdf_unit_id is not None and HrcdfUnit.objects.filter(
        hrcdf_unit_id=hrcdf_unit_id
    ).exclude(code=code).exists()
    unit = HrcdfUnit.objects.filter(code=code).first()
    if unit is None:
        if not name:
            return "skipped", []
        HrcdfUnit.objects.create(
            code=code,
            name=name,
            hrcdf_unit_id=None if id_taken else hrcdf_unit_id,
            command=command,
            record_origin=ORIGIN_HRCDF,
        )
        return "created", []
    changed = []
    if not unit.name and name:
        unit.name = name
        changed.append("name")
    if unit.hrcdf_unit_id is None and hrcdf_unit_id is not None and not id_taken:
        unit.hrcdf_unit_id = hrcdf_unit_id
        changed.append("hrcdf_unit_id")
    if unit.command_id is None and command is not None:
        unit.command = command
        changed.append("command")
    if not changed:
        return "unchanged", []
    unit.updated_at = timezone.now()
    unit.save(update_fields=[*changed, "updated_at"])
    return "filled", changed


# --------------------------------------------------------------------------
# Progress - numbered chunks in the swmm cache, one writer per job
# --------------------------------------------------------------------------


def _progress_key(job_id, *parts):
    return ":".join((CACHE_PREFIX, str(job_id), *(str(part) for part in parts)))


# Developed with Understanding: IIMA's in-memory _PROGRESS buffer re-expressed for many
# processes (R1 G2). The worker is the only writer of a job. Lines are buffered and flushed
# every FLUSH_EVERY_LINES lines or FLUSH_EVERY_SECONDS seconds into chunk keys
# hrcdf_sync:<job_id>:chunk:<n>, with a meta key carrying next_seq, dropped, the first
# retained seq and the chunk index. Only the most recent MAX_LOG_LINES lines are kept -
# the oldest chunk is deleted or trimmed and the loss is counted in dropped, never hidden.
# Counters go to the HrcdfSyncJob row at each flush.
class ProgressWriter:
    """Buffers console lines and counters for one job and flushes them."""

    def __init__(self, job):
        self.job_id = str(job.pk)
        self.next_seq = 1
        self.dropped = 0
        self.retained = 0
        self.next_chunk = 0
        # Developed with Understanding: one [chunk number, first seq, last seq] per chunk.
        self.chunks = []
        self.buffer = []
        self.counters = {}
        self.errors = []
        self.last_flush = time.monotonic()

    def emit(self, level, text):
        """Append one console line and flush when the cadence says so."""
        self.buffer.append(
            {
                "seq": self.next_seq,
                "ts": timezone.now().isoformat(),
                "level": level,
                "text": text,
            }
        )
        self.next_seq += 1
        self._maybe_flush()

    def note(self, **fields):
        """Record counters (processed, total, pages, stats, host) for the job row."""
        self.counters.update(fields)

    def add_error(self, personnel_number, message):
        """Keep the first MAX_ERRORS_REPORTED row errors, log every one."""
        logger.error(
            "HRCDF sync row failed personnelNumber=%r: %s", personnel_number, message
        )
        if len(self.errors) < MAX_ERRORS_REPORTED:
            self.errors.append({"personnelNumber": personnel_number, "error": message})

    def _maybe_flush(self):
        elapsed = time.monotonic() - self.last_flush
        if len(self.buffer) >= FLUSH_EVERY_LINES or elapsed >= FLUSH_EVERY_SECONDS:
            self.flush()

    def flush(self):
        """Write buffered lines, the meta key and the counters."""
        if self.buffer:
            number = self.next_chunk
            self.next_chunk += 1
            cache.set(
                _progress_key(self.job_id, "chunk", number),
                self.buffer,
                PROGRESS_TTL_SECONDS,
            )
            self.chunks.append(
                [number, self.buffer[0]["seq"], self.buffer[-1]["seq"]]
            )
            self.retained += len(self.buffer)
            self.buffer = []
            self._evict()
        cache.set(
            _progress_key(self.job_id, "meta"),
            {
                "next_seq": self.next_seq,
                "dropped": self.dropped,
                "first_seq": self.chunks[0][1] if self.chunks else 0,
                "chunks": self.chunks,
            },
            PROGRESS_TTL_SECONDS,
        )
        if self.counters:
            HrcdfSyncJob.objects.filter(pk=self.job_id).update(**self.counters)
        self.last_flush = time.monotonic()

    def _evict(self):
        while self.retained > MAX_LOG_LINES and self.chunks:
            number, first_seq, last_seq = self.chunks[0]
            size = last_seq - first_seq + 1
            excess = self.retained - MAX_LOG_LINES
            chunk_key = _progress_key(self.job_id, "chunk", number)
            if size <= excess:
                cache.delete(chunk_key)
                self.chunks.pop(0)
                self.retained -= size
                self.dropped += size
                continue
            new_first = first_seq + excess
            stored = cache.get(chunk_key) or []
            kept = [line for line in stored if line["seq"] >= new_first]
            cache.set(chunk_key, kept, PROGRESS_TTL_SECONDS)
            self.chunks[0][1] = new_first
            self.retained -= excess
            self.dropped += excess


def _clamp_int(value, default, low, high):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, number))


# Developed with Understanding: one poll's worth of a run, reading the meta key and the
# chunks after `since`. The since, limit, gap and truncated semantics are IIMA's
# progress_snapshot (sync lines 833-887). Counters come from the job row, so the snapshot is
# correct even after the cache keys have expired.
def progress_snapshot(job, since=0, limit=MAX_LINES_PER_POLL):
    """Return the progress payload of the API contract for one job."""
    since = _clamp_int(since, 0, 0, 2**62)
    limit = _clamp_int(limit, MAX_LINES_PER_POLL, 1, MAX_LINES_PER_POLL)
    meta = cache.get(_progress_key(job.pk, "meta")) or {}
    first_seq = meta.get("first_seq") or 0
    last_written = max(0, (meta.get("next_seq") or 1) - 1)
    pending = []
    for number, _chunk_first, chunk_last in meta.get("chunks") or []:
        if chunk_last <= since:
            continue
        lines = cache.get(_progress_key(job.pk, "chunk", number)) or []
        pending.extend(line for line in lines if line["seq"] > since)
        if len(pending) > limit:
            break
    lines = pending[:limit]
    total = job.total
    percent = None
    if total:
        percent = round(min(100.0, (job.processed * 100.0) / total), 1)
    return {
        "job_id": str(job.pk),
        "mode": job.mode,
        "status": job.status,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "host": job.host,
        "total": total,
        "processed": job.processed,
        "pages": job.pages,
        "percent": percent,
        "stats": job.stats or {},
        "message": job.message,
        "dropped": meta.get("dropped") or 0,
        "first_seq": first_seq,
        "last_seq": lines[-1]["seq"] if lines else max(since, last_written),
        "gap": bool(first_seq and since and since < first_seq - 1),
        "truncated": len(pending) > limit,
        "lines": lines,
    }


# --------------------------------------------------------------------------
# Single-run lock - cache.add with a TTL (R1 G2)
# --------------------------------------------------------------------------


def _lock_ttl():
    return int(getattr(settings, "HRCDF_SYNC_LOCK_TTL_SECONDS", 21600))


def lock_holder():
    """Return the job id holding the run lock, or None."""
    return cache.get(LOCK_KEY)


# Developed with Understanding: extends the lock while this job still holds it. Called at
# every page so a long run never outlives its own lock.
def refresh_lock(job_id):
    """Extend the lock TTL when job_id holds it."""
    if cache.get(LOCK_KEY) == str(job_id):
        cache.touch(LOCK_KEY, _lock_ttl())


# Developed with Understanding: releases the lock only for its own holder, so a stale
# release can never free a newer run's lock.
def release_lock(job_id):
    """Delete the lock when job_id holds it."""
    if cache.get(LOCK_KEY) == str(job_id):
        cache.delete(LOCK_KEY)


# Developed with Understanding: the IIMA 409 message (sync lines 1031-1038), naming who
# started the run in flight and how far it has got, read from the job row.
def _busy_message(holder):
    job = None
    try:
        job = (
            HrcdfSyncJob.objects.select_related("started_by").filter(pk=holder).first()
        )
    except (DjangoValidationError, ValueError):
        job = None
    if job is None:
        return "An HRCDF sync is already running. Wait for it to finish and try again."
    who = profile_label(job.started_by) or "another administrator"
    started = timezone.localtime(job.started_at).strftime("%d %b %Y %H:%M")
    total = job.total if job.total is not None else "?"
    return (
        f"An HRCDF {MODE_LABELS.get(job.mode, job.mode)} sync is already running - "
        f"started by {who} at {started}, {job.processed} of {total} record(s) "
        "processed. Watch it finish on this page."
    )


# Developed with Understanding: takes the lock for job_id or refuses with 409. A refusal
# with no holder means the cache did not accept the key at all (for example Redis down
# with IGNORE_EXCEPTIONS), which is answered 503 rather than a misleading 409.
def acquire_lock_or_refuse(job_id):
    """Take the run lock for job_id or raise HrcdfSyncError."""
    if cache.add(LOCK_KEY, str(job_id), timeout=_lock_ttl()):
        return
    holder = lock_holder()
    if holder:
        raise HrcdfSyncError(409, _busy_message(holder))
    raise HrcdfSyncError(
        503,
        "The swmm cache did not accept the HRCDF sync lock. Check that Redis is "
        "reachable from the swmm service and try again.",
    )


# --------------------------------------------------------------------------
# Home unit (D15)
# --------------------------------------------------------------------------


def ship_identity():
    """Return the ShipIdentity row with its unit, or None. Never creates one."""
    return (
        ShipIdentity.objects.select_related("unit", "unit__command")
        .order_by("id")
        .first()
    )


def home_unit():
    """Return the home master.Unit (the this-ship row) picked for the sync, or None."""
    identity = ship_identity()
    return identity.unit if identity is not None and identity.unit_id else None


# Developed with Understanding: the columns set_home_unit copies from the picked HrcdfUnit
# onto the Master_unit this-ship row. unit_type is left as it is.
HOME_UNIT_FIELDS = (
    "name",
    "code",
    "hrcdf_unit_id",
    "station_code",
    "description",
    "hrcdf_ship_name",
    "record_origin",
    "command",
    "updated_at",
)


# Developed with Understanding: the Step 0 confirm-and-lock pattern (R1 C2, D15). unit_id
# is an HrcdfUnit id from units/. In one transaction the Master_unit this-ship row is
# filled from that HrcdfUnit, command mapped to the MasterCommand whose unit_name is the
# HRCDF command code (else None), and ShipIdentity is pointed at the row and locked. Once
# a unit is set the answer is 409 and a change needs an administrator. ship_name takes the
# unit name, cut to the column's width because workbook names reach 52 (CP-A OQ-A2).
def set_home_unit(unit_id):
    """Fill the this-ship Unit from HrcdfUnit unit_id and lock it. Return ShipIdentity."""
    with transaction.atomic():
        solo = ShipIdentity.get_solo()
        # Developed with Understanding: of=("self",) locks only the ShipIdentity row.
        # Postgres refuses FOR UPDATE on the nullable side of the unit outer join.
        identity = (
            ShipIdentity.objects.select_for_update(of=("self",))
            .select_related("unit")
            .get(pk=solo.pk)
        )
        if identity.unit_id is not None:
            raise HrcdfSyncError(
                409,
                f"The home unit is already set to {identity.unit.name} "
                f"({identity.unit.code}). Only an administrator can change it.",
            )
        source = HrcdfUnit.objects.select_related("command").filter(pk=unit_id).first()
        if source is None:
            raise HrcdfSyncError(400, f"Unit {unit_id} does not exist.")
        unit = Unit.get_this_ship_unit()
        # Developed with Understanding: code and hrcdf_unit_id are unique on Master_unit.
        # A stray second row holding either value is answered 409, never an IntegrityError.
        clash = Unit.objects.exclude(pk=unit.pk).filter(code=source.code)
        if source.hrcdf_unit_id is not None:
            clash = clash | Unit.objects.exclude(pk=unit.pk).filter(
                hrcdf_unit_id=source.hrcdf_unit_id
            )
        if clash.exists():
            raise HrcdfSyncError(
                409,
                f"Another Master_unit row already holds unit {source.code}. Only an "
                "administrator can resolve it.",
            )
        command_code = source.command.code if source.command_id else None
        unit.name = source.name
        unit.code = source.code
        unit.hrcdf_unit_id = source.hrcdf_unit_id
        unit.station_code = source.station_code or ""
        unit.description = source.description
        unit.hrcdf_ship_name = source.name
        unit.record_origin = ORIGIN_HRCDF
        unit.command = command_for_code(command_code)
        unit.updated_at = timezone.now()
        unit.save(update_fields=list(HOME_UNIT_FIELDS))
        width = ShipIdentity._meta.get_field("ship_name").max_length
        identity.unit = unit
        identity.ship_name = (unit.name or "")[:width]
        identity.is_locked = True
        identity.updated_at = timezone.now()
        identity.save(
            update_fields=["unit", "ship_name", "is_locked", "updated_on", "updated_at"]
        )
    return ship_identity()


# --------------------------------------------------------------------------
# One run over the roster
# --------------------------------------------------------------------------


# Developed with Understanding: the per-run state and the per-record rules. IIMA
# apply_records (sync lines 723-793) re-expressed - every record in its own
# transaction.atomic, errors bounded, one console line per record - with the swmm routing
# of D19, the own-ship and other-unit writes and the leaver rule. No unit is written.
class _SyncRun:
    def __init__(self, mode, home, progress):
        self.mode = mode
        self.home_code = (home.code or "").strip()
        self.home_unit_id = home.hrcdf_unit_id
        self.progress = progress
        self.stats = dict.fromkeys(STAT_KEYS, 0)
        self.ship = ActiveShipConfig.get_selected_ship()
        self._commands = {}
        self._ranks = {}
        self._departments = {}
        # Developed with Understanding: open own-ship numbers loaded once, so the leaver
        # check costs no query for the many records of people who were never on board.
        self.open_own_numbers = {
            (number or "").strip().upper()
            for number in CustomUserProfile.objects.filter(
                ship_leaving_date__isnull=True
            ).values_list("personal_number", flat=True)
            if (number or "").strip()
        }

    # Developed with Understanding: D19 - own ship when unitCode equals the home unit
    # code, or failing that when unitId equals the home unit hrcdf_unit_id.
    # Developed with Understanding: the rule now lives in is_own_ship_record (CP-K).
    def is_own_ship(self, record):
        return is_own_ship_record(record, self.home_code, self.home_unit_id)

    def _cached(self, cache_dict, key, loader):
        if key not in cache_dict:
            cache_dict[key] = loader()
        return cache_dict[key]

    def command_for(self, record):
        code = (as_text(record.get("commandCode"), None) or "").upper()
        return self._cached(self._commands, code, lambda: command_for_code(code))

    # Developed with Understanding: D20 - the rank FK only when a Rank of that name
    # exists. rank_name text is always kept through the field map.
    def rank_for(self, record):
        name = as_text(record.get("rankName"), None) or ""
        return self._cached(
            self._ranks,
            name.upper(),
            lambda: Rank.objects.filter(name__iexact=name).order_by("id").first()
            if name
            else None,
        )

    # Developed with Understanding: D20 - LEGACY users/views.py lines 1125 to 1137.
    def department_for(self, record):
        branch = as_text(record.get("branchName"), None) or ""
        upper = branch.upper()
        target = EXECUTIVE_DEPARTMENT if upper in EXECUTIVE_BRANCHES else upper
        return self._cached(
            self._departments,
            target,
            lambda: Department.objects.filter(name=target).first() if target else None,
        )

    # Developed with Understanding: one record, start to end. The outcome counters and
    # the in-memory sets move only after the record's transaction has committed.
    def apply(self, record):
        personnel_number = None
        name = ""
        after = []
        if not isinstance(record, dict):
            outcome, detail = "SKIPPED", "(record is not a JSON object)"
            keys = ["skipped"]
            self.progress.add_error(None, "record is not a JSON object")
        else:
            personnel_number = personnel_number_of(record)
            name = as_text(record.get("fullName"), None) or ""
            # Developed with Understanding: the test now lives in record_has_unit (CP-K).
            unit_known = record_has_unit(record)
            if not personnel_number:
                outcome, detail = "SKIPPED", "(personnelNumber is missing or blank)"
                keys = ["skipped"]
                self.progress.add_error(None, "personnelNumber is missing or blank")
            elif not unit_known:
                # Developed with Understanding: a record with no unit cannot be routed,
                # and treating it as another unit would close an own-ship row wrongly.
                outcome, detail = "SKIPPED", "(record carries no unitCode or unitId)"
                keys = ["skipped"]
                self.progress.add_error(
                    personnel_number, "record carries no unitCode or unitId"
                )
            else:
                try:
                    with transaction.atomic():
                        outcome, detail, keys, after = self._route(
                            record, personnel_number
                        )
                except Exception as exc:
                    logger.exception(
                        "HRCDF sync failed on personnelNumber=%r", personnel_number
                    )
                    message = f"{exc.__class__.__name__}: {exc}"
                    self.progress.add_error(personnel_number, message)
                    outcome, detail, keys, after = "FAILED", message, ["failed"], []
        self.stats["fetched"] += 1
        for key in keys:
            self.stats[key] += 1
        for callback in after:
            callback()
        level = LINE_RECORD
        if outcome == "FAILED":
            level = LINE_ERROR
        elif outcome == "SKIPPED":
            level = LINE_WARN
        label = personnel_number or "(no personnel number)"
        line = f"{label:<12} {outcome:<9} {name} {detail}"
        self.progress.emit(level, line.rstrip())

    # Developed with Understanding: D19 routing and the mode rules. mode own writes
    # own-ship records, mode others writes other-unit records, and both apply the leaver
    # rule. A record the mode does not write costs no write at all (skipped_other_mode).
    def _route(self, record, personnel_number):
        if self.is_own_ship(record):
            if self.mode != HrcdfSyncJob.Mode.OWN:
                return (
                    "SKIPPED",
                    "(own ship, written by an own-ship run)",
                    ["skipped_other_mode"],
                    [],
                )
            outcome, detail, keys, after = self._write_own(record, personnel_number)
        else:
            closed = self._close_leaver(personnel_number)
            if self.mode != HrcdfSyncJob.Mode.OTHERS and not closed:
                return (
                    "SKIPPED",
                    "(other unit, written by an other-units run)",
                    ["skipped_other_mode"],
                    [],
                )
            outcome, detail, keys, after = self._write_other(record, personnel_number)
            if closed:
                keys = [*keys, "leavers"]
                detail = f"(left the ship, own-ship row closed) {detail}".strip()
                after = [
                    *after,
                    lambda: self.open_own_numbers.discard(personnel_number),
                ]
        # Developed with Understanding: roster runs no longer upsert units. HrcdfUnit,
        # HrcdfCommand and Master_unit change only through Get Ship Names and Step 1.
        return outcome, detail, keys, after

    # Developed with Understanding: own-ship write into CustomUserProfile (AR1 contained,
    # D14 OQ6, D20). Match on personal_number alone, newest ship_joining_date first. A
    # newest row that is already closed means the person has come back on board, so a new
    # row is created and the closed one is kept as history. On an existing row ONLY the
    # mapped columns that differ are written - never authz_user_id, role_master,
    # has_credentials, auth_source, designation or marriage_date.
    def _write_own(self, record, personnel_number):
        width = CustomUserProfile._meta.get_field("personal_number").max_length
        if len(personnel_number) > width:
            raise ValueError(f"personnelNumber is longer than {width} characters")
        values = mapped_values(CustomUserProfile, record)
        now = timezone.now()
        profile = (
            CustomUserProfile.objects.filter(personal_number__iexact=personnel_number)
            .order_by(F("ship_joining_date").desc(nulls_last=True), "-id")
            .first()
        )
        after = []
        if profile is None or profile.ship_leaving_date is not None:
            hrcdf_active = values.get("hrcdf_is_active")
            CustomUserProfile.objects.create(
                personal_number=personnel_number,
                auth_source=AUTH_SOURCE_HRCDF,
                has_credentials=False,
                is_role=False,
                user_active=hrcdf_active is not False,
                command_name=self.command_for(record),
                rank=self.rank_for(record),
                department=self.department_for(record),
                ship=self.ship,
                hrcdf_synced_at=now,
                **values,
            )
            outcome, detail, keys = "CREATED", "", ["own_created"]
            after.append(lambda: self.open_own_numbers.add(personnel_number))
        else:
            # Developed with Understanding: the delta write now lives in _update_own (CP-K).
            changed = _update_own(profile, values, now)
            if changed:
                outcome = "UPDATED"
                detail = f"(changed: {', '.join(changed)})"
                keys = ["own_updated"]
            else:
                outcome, detail, keys = "UNCHANGED", "", ["own_unchanged"]
        # Developed with Understanding: the person now belongs to the home unit, so a
        # current other-unit row stops being offered by the Ty Loan picker (D19).
        moved = OtherCustomUserProfile.objects.filter(
            personal_number=personnel_number, is_current_other_unit=True
        ).update(is_current_other_unit=False, updated_at=now)
        if moved:
            detail = f"{detail} (other-unit row marked not current)".strip()
        return outcome, detail, keys, after

    # Developed with Understanding: other-unit write into OtherCustomUserProfile (D2).
    # Match on personal_number, create with record_origin HRCDF and is_current_other_unit
    # True, delta update otherwise. command_name is the commandName text.
    def _write_other(self, record, personnel_number):
        width = OtherCustomUserProfile._meta.get_field("personal_number").max_length
        if len(personnel_number) > width:
            raise ValueError(f"personnelNumber is longer than {width} characters")
        # Developed with Understanding: the values now come from _other_values (CP-K).
        values = _other_values(record)
        now = timezone.now()
        other = OtherCustomUserProfile.objects.filter(
            personal_number=personnel_number
        ).first()
        if other is None:
            OtherCustomUserProfile.objects.create(
                personal_number=personnel_number,
                record_origin=ORIGIN_HRCDF,
                is_current_other_unit=True,
                hrcdf_synced_at=now,
                **{"firstname": "", "lastname": "", **values},
            )
            return "CREATED", "", ["others_created"], []
        # Developed with Understanding: the delta write now lives in _update_other (CP-K).
        changed = _update_other(other, values, now)
        if not changed:
            return "UNCHANGED", "", ["others_unchanged"], []
        return "UPDATED", f"(changed: {', '.join(changed)})", ["others_updated"], []

    # Developed with Understanding: the leaver rule (D4, D21) - every open own-ship row of
    # this person gets ship_leaving_date now and user_active False. The row is kept.
    def _close_leaver(self, personnel_number):
        if personnel_number not in self.open_own_numbers:
            return 0
        now = timezone.now()
        return CustomUserProfile.objects.filter(
            personal_number__iexact=personnel_number,
            ship_leaving_date__isnull=True,
        ).update(ship_leaving_date=now, user_active=False, updated_at=now)


# Developed with Understanding: the whole run for one job - IIMA _run_sync_locked (sync
# lines 890-939) re-expressed. client is injectable so tests use a fake. Raises
# HrcdfSyncError for an expected refusal. Returns the operator's completion message.
def execute_sync(job, progress, client=None):
    """Run the roster sync for job, writing progress, and return the done message."""
    # Developed with Understanding: a units job is Get Ship Names. It needs no home unit.
    if job.mode == MODE_UNITS:
        return execute_units_refresh(job, progress, client=client)
    home = home_unit()
    if home is None:
        raise HrcdfSyncError(400, "Pick the home unit before running the HRCDF sync.")
    if client is None:
        unit_filter = home.code if job.mode == HrcdfSyncJob.Mode.OWN else None
        client = HrcdfClient(sync_config(), unit_filter=unit_filter)
    label = MODE_LABELS.get(job.mode, job.mode)
    try:
        client.ensure_configured()
        progress.note(host=client.host)
        who = profile_label(job.started_by) or "an administrator"
        progress.emit(
            LINE_INFO,
            f"HRCDF {label} sync started by {who}. Home unit {home.name} "
            f"({home.code}).",
        )
        progress.emit(LINE_INFO, f"Connecting to HRCDF at {client.host} ...")
        client.authenticate()
        progress.emit(
            LINE_INFO,
            "Authenticated with HRCDF."
            if client.auth_username
            else "No token required, authentication step skipped.",
        )
        progress.emit(
            LINE_INFO,
            f"Reading {client.users_path}, {client.page_size} record(s) per page.",
        )
        run = _SyncRun(job.mode, home, progress)
        clock = time.monotonic()
        pages_seen = 0
        for record in client.iter_records(emit=progress.emit):
            if client.pages_fetched != pages_seen:
                pages_seen = client.pages_fetched
                refresh_lock(job.pk)
                progress.note(pages=pages_seen, total=client.total_records)
            run.apply(record)
            progress.note(processed=run.stats["fetched"], stats=dict(run.stats))
        progress.note(
            pages=client.pages_fetched,
            total=client.total_records,
            processed=run.stats["fetched"],
            stats=dict(run.stats),
        )
    finally:
        client.close()
    stats = run.stats
    duration = round(time.monotonic() - clock, 2)
    text = (
        f"HRCDF {label} sync completed in {duration} s. {stats['fetched']} fetched. "
        f"Own ship {stats['own_created']} created, {stats['own_updated']} updated, "
        f"{stats['own_unchanged']} unchanged. Other units {stats['others_created']} "
        f"created, {stats['others_updated']} updated, {stats['others_unchanged']} "
        f"unchanged. {stats['leavers']} leaver(s) closed. {stats['skipped']} skipped, "
        f"{stats['skipped_other_mode']} not written by this mode, {stats['failed']} "
        "failed."
    )
    # Developed with Understanding: the completion message is the last console line, so
    # the operator reads the outcome where the rows landed (IIMA sync lines 974-977).
    progress.emit(LINE_DONE, text)
    return text


# --------------------------------------------------------------------------
# Get Ship Names - a job of mode units, started through units/refresh/
# --------------------------------------------------------------------------


# Developed with Understanding: one distinct unit of a units job. The command is upserted
# first (cached per code for the run), then the unit, each outcome counted and every
# change written as one console line. Runs in its own transaction.atomic.
def _refresh_one_unit(record, stats, commands, progress):
    code = unit_code_of(record.get("unitCode"))
    name = as_text(record.get("unitName"), None) or ""
    command_code = (as_text(record.get("commandCode"), None) or "").upper()
    with transaction.atomic():
        command = None
        if command_code:
            if command_code not in commands:
                outcome, command = upsert_harvested_command(
                    command_code, record.get("commandName")
                )
                if outcome == "created":
                    stats["commands_created"] += 1
                    progress.emit(
                        LINE_RECORD, f"New command {command.code} {command.name}"
                    )
                elif outcome == "filled":
                    stats["commands_updated"] += 1
                    progress.emit(
                        LINE_RECORD, f"Updated command {command.code} {command.name}"
                    )
                commands[command_code] = command
            command = commands[command_code]
        outcome, changed = upsert_harvested_unit(
            code, record.get("unitName"), _as_int(record.get("unitId")), command
        )
    if outcome == "created":
        stats["units_created"] += 1
        progress.emit(LINE_RECORD, f"New unit {code} {name}".rstrip())
    elif outcome == "filled":
        stats["units_updated"] += 1
        progress.emit(
            LINE_RECORD,
            f"Updated unit {code} {name} (filled: {', '.join(changed)})",
        )
    elif outcome == "unchanged":
        stats["units_unchanged"] += 1
    else:
        stats["skipped"] += 1
        progress.emit(LINE_WARN, f"Skipped unit {code} (HRCDF sent no unitName)")


# Developed with Understanding: Get Ship Names from HRCDF only. With HRCDF_SYNC UNITS_PATH
# set it reads that endpoint (repeat rule on unitCode), otherwise it walks the roster pages
# with the same HrcdfClient paging and stop rules and keeps the distinct unitCode,
# unitName, unitId, commandCode and commandName. It upserts HrcdfCommand and HrcdfUnit
# under the fill-empty rule. It never re-applies the bundled seed, never reads stored
# profiles and never writes a person or Master_unit. client is injectable for the tests.
def execute_units_refresh(job, progress, client=None):
    """Refresh the HRCDF command and unit-name masters for job and return the message."""
    config = sync_config()
    units_path = (config.get("UNITS_PATH") or "").strip()
    if client is None:
        if units_path:
            client = HrcdfClient(config, path=units_path, repeat_key="unitCode")
        else:
            client = HrcdfClient(config)
    stats = dict.fromkeys(UNITS_STAT_KEYS, 0)
    seen = set()
    commands = {}
    clock = time.monotonic()
    try:
        client.ensure_configured()
        progress.note(host=client.host)
        who = profile_label(job.started_by) or "an administrator"
        progress.emit(LINE_INFO, f"Get Ship Names from HRCDF started by {who}.")
        progress.emit(LINE_INFO, f"Connecting to HRCDF at {client.host} ...")
        client.authenticate()
        progress.emit(
            LINE_INFO,
            "Authenticated with HRCDF."
            if client.auth_username
            else "No token required, authentication step skipped.",
        )
        source = "unit list" if units_path else "roster"
        progress.emit(
            LINE_INFO,
            f"Reading the HRCDF {source} at {client.users_path}, "
            f"{client.page_size} record(s) per page.",
        )
        progress.emit(LINE_INFO, "Fetching page 1 ...")
        pages_seen = 0
        for record in client.iter_records(emit=progress.emit):
            if client.pages_fetched != pages_seen:
                pages_seen = client.pages_fetched
                refresh_lock(job.pk)
                progress.note(pages=pages_seen, total=client.total_records)
            stats["fetched"] += 1
            if isinstance(record, dict):
                code = unit_code_of(record.get("unitCode"))
                if code and code not in seen:
                    seen.add(code)
                    try:
                        _refresh_one_unit(record, stats, commands, progress)
                    except Exception as exc:
                        logger.exception("HRCDF unit refresh failed on unit %r", code)
                        message = f"{exc.__class__.__name__}: {exc}"
                        progress.add_error(None, f"unit {code}: {message}")
                        stats["failed"] += 1
                        progress.emit(LINE_ERROR, f"Unit {code} failed - {message}")
            stats["units_seen"] = len(seen)
            progress.note(processed=stats["fetched"], stats=dict(stats))
        progress.note(
            pages=client.pages_fetched,
            total=client.total_records,
            processed=stats["fetched"],
            stats=dict(stats),
        )
    finally:
        client.close()
    duration = round(time.monotonic() - clock, 2)
    text = (
        f"Get Ship Names completed in {duration} s. {stats['fetched']} HRCDF "
        f"record(s) read, {stats['units_seen']} distinct unit(s). Units "
        f"{stats['units_created']} created, {stats['units_updated']} updated, "
        f"{stats['units_unchanged']} unchanged. Commands {stats['commands_created']} "
        f"created, {stats['commands_updated']} updated. {stats['skipped']} skipped, "
        f"{stats['failed']} failed. {HrcdfUnit.objects.count()} unit(s) and "
        f"{HrcdfCommand.objects.count()} command(s) in the master."
    )
    progress.emit(LINE_DONE, text)
    return text


# Developed with Understanding: the job summary shape of the API contract, as plain JSON
# so it can travel back through a Celery result.
def job_summary(job):
    """Return the JobSummary dict for job, or None."""
    if job is None:
        return None
    return dict(HrcdfSyncJobSummarySerializer(job).data)


# Developed with Understanding: the latest job of a mode, for readiness last_runs.
def last_run(mode):
    """Return the newest HrcdfSyncJob of mode, or None."""
    return HrcdfSyncJob.objects.filter(mode=mode).order_by("-started_at").first()


# Developed with Understanding: IIMA sync_readiness (sync lines 803-830) re-expressed -
# never the credentials, running from the cache lock, counts from the swmm tables.
def readiness_counts():
    """Return the counts block of the readiness payload."""
    own = CustomUserProfile.objects.filter(auth_source=AUTH_SOURCE_HRCDF)
    return {
        "own_ship": own.count(),
        "own_ship_open": own.filter(ship_leaving_date__isnull=True).count(),
        "other_units": OtherCustomUserProfile.objects.filter(
            record_origin=ORIGIN_HRCDF
        ).count(),
        # Developed with Understanding: the HRCDF unit-name master behind Step 1.
        "units": HrcdfUnit.objects.count(),
    }


# --------------------------------------------------------------------------
# Start a run - request thread
# --------------------------------------------------------------------------


# Developed with Understanding: IIMA start_sync (sync lines 1003-1048) re-expressed. Every
# refusal is decided here in the request thread so it comes back as a real HTTP status -
# mode, configuration and home unit first, then the lock, then the job row, then
# dispatch_task (R1 E1) with its own two response helpers. request is passed because
# accepted_task_response builds task_status_url from it.
def start_sync(profile, mode, request):
    """Validate, lock, create the job and dispatch it. Return the DRF Response."""
    mode = (mode or "").strip().lower()
    if mode not in START_MODES:
        raise HrcdfSyncError(400, 'mode must be "own", "others" or "units".')
    client = HrcdfClient(sync_config())
    client.ensure_configured()
    client.close()
    # Developed with Understanding: Get Ship Names (mode units) runs before a home unit
    # is picked, so only the two roster modes need one.
    if mode != MODE_UNITS and home_unit() is None:
        raise HrcdfSyncError(400, "Pick the home unit before running the HRCDF sync.")

    job_id = uuid.uuid4()
    acquire_lock_or_refuse(job_id)
    label = MODE_LABELS[mode]
    try:
        HrcdfSyncJob.objects.create(
            id=job_id,
            mode=mode,
            status=HrcdfSyncJob.Status.QUEUED,
            started_by=profile,
            host=client.host,
        )
        # Developed with Understanding: imported here because accounts.tasks imports this
        # module at its top.
        from .tasks import run_hrcdf_sync

        dispatch = dispatch_task(run_hrcdf_sync, str(job_id))
    except Exception:
        release_lock(job_id)
        HrcdfSyncJob.objects.filter(pk=job_id).exclude(
            status=HrcdfSyncJob.Status.FINISHED
        ).update(
            status=HrcdfSyncJob.Status.FAILED,
            finished_at=timezone.now(),
            message="The HRCDF sync could not be started. See the swmm server log.",
        )
        raise

    if dispatch["queued"]:
        task = dispatch["task"]
        HrcdfSyncJob.objects.filter(pk=job_id).update(celery_task_id=task.id or "")
        response = accepted_task_response(
            request, task, f"HRCDF {label} sync queued on the background worker."
        )
        response.data["job_id"] = str(job_id)
        return response

    # Developed with Understanding: the inline fallback (REDIS_ENABLED False, or no worker
    # answered the ping) - the run has already finished inside this request and the
    # response carries its final summary (OQ11).
    HrcdfSyncJob.objects.filter(pk=job_id).update(ran_inline=True)
    result = dispatch["result"]
    if isinstance(result, dict) and isinstance(result.get("summary"), dict):
        result["summary"]["ran_inline"] = True
    return sync_task_response(
        result,
        f"Background worker unavailable. The HRCDF {label} sync ran inline.",
    )
