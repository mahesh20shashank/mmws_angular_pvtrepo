# Developed with Understanding: the bundled HRCDF command and unit-name master seed for
# swmm (AR3, D14 OQ2). It writes only master.HrcdfCommand (Master_hrcdf_command) and
# master.HrcdfUnit (Master_hrcdf_unit), the two tables behind the Step 1 Command and Ship
# Name dropdowns of the Sync HRCDF page. It never writes Master_unit (the this-ship row),
# Master_master_command or Master_unittype. It is run by the seed_data management command.
"""Idempotent seed of the swmm HRCDF masters from management/data/unit_master.csv."""

import csv
from pathlib import Path

from django.db import transaction
from django.utils import timezone

from .models import HrcdfCommand, HrcdfUnit

# Developed with Understanding: resolved from this file, never from the working directory,
# so the command, a Celery worker and a test all find the same file.
UNIT_MASTER_CSV = (
    Path(__file__).resolve().parent / "management" / "data" / "unit_master.csv"
)

UNIT_MASTER_COLUMNS = (
    "hrcdf_unit_id",
    "code",
    "name",
    "station_code",
    "command_code",
    "description",
    "unit_type",
)

# Developed with Understanding: the six seeded commands, in seed order, with the names the
# Step 1 Command dropdown shows. The four naval commands carry the names seed_all.COMMANDS
# uses. NHQ and OTHERS are the two extra commands of OQ8. All six are always seeded, and
# any other command code the CSV carries is added after them with its code as its name.
SEED_COMMAND_NAMES = {
    "WNC": "Western Naval Command",
    "ENC": "Eastern Naval Command",
    "SNC": "Southern Naval Command",
    "ANC": "Andaman and Nicobar Command",
    "NHQ": "NAVAL HEADQUARTERS",
    "OTHERS": "OTHERS",
}

RECORD_ORIGIN_SEED = "SEED"
RECORD_ORIGIN_HRCDF = "HRCDF"

# Developed with Understanding: the columns this seed owns on each table. updated_at is
# written alongside them because Base.updated_at is a default, not auto_now.
COMMAND_UPDATE_FIELDS = ("name", "record_origin", "updated_at")
UNIT_UPDATE_FIELDS = (
    "name",
    "description",
    "hrcdf_unit_id",
    "station_code",
    "command",
    "unit_type",
    "record_origin",
    "updated_at",
)

BULK_BATCH_SIZE = 500

# Developed with Understanding: the width of an HRCDF unit code, the same value as
# accounts.hrcdf_sync.UNIT_CODE_WIDTH. It is not imported from there, because master must
# not depend on accounts.
UNIT_CODE_WIDTH = 5


# Developed with Understanding: reads the bundled CSV with the csv module only (no
# openpyxl, no pandas). utf-8-sig tolerates a byte order mark and newline="" lets csv
# handle either line ending. A row with no code is skipped, as the workbook ghost rows were.
def _read_seed_rows():
    """Return (rows_read, rows) where rows is a list of cleaned dicts."""
    with UNIT_MASTER_CSV.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = [
            column
            for column in UNIT_MASTER_COLUMNS
            if column not in (reader.fieldnames or [])
        ]
        if missing:
            raise ValueError(
                f"{UNIT_MASTER_CSV.name} is missing column(s): {', '.join(missing)}"
            )

        rows_read = 0
        rows = []
        for line_number, raw in enumerate(reader, start=2):
            rows_read += 1
            row = {
                column: (raw.get(column) or "").strip()
                for column in UNIT_MASTER_COLUMNS
            }
            if not row["code"]:
                continue
            # Developed with Understanding: the bundled CSV carries codes such as 162
            # where HRCDF sends 00162 (R1 A5, five-digit zero-padded text). An all-digit
            # code is padded back to UNIT_CODE_WIDTH so a seeded row and the HRCDF unit
            # it stands for share one code.
            if row["code"].isdigit():
                row["code"] = row["code"].zfill(UNIT_CODE_WIDTH)
            unit_id_text = row["hrcdf_unit_id"]
            if unit_id_text and not unit_id_text.isdigit():
                raise ValueError(
                    f"{UNIT_MASTER_CSV.name} line {line_number}: hrcdf_unit_id "
                    f"{unit_id_text!r} is not a whole number"
                )
            row["hrcdf_unit_id"] = int(unit_id_text) if unit_id_text else None
            rows.append(row)
    return rows_read, rows


# Developed with Understanding: writes the seeded values onto an existing row and says
# whether anything changed. A row the HRCDF sync created keeps its name and only has
# empty seeded fields filled - the IIMA fill-empty rule (R1 G1 step 10, borrowed from
# IIMA/accountApp__hrcdf_sync.py lines 577-638). Its record_origin HRCDF is never empty,
# so it is kept as well.
def _apply_seeded_values(instance, seeded):
    """Return True when instance was changed."""
    fill_empty_only = instance.record_origin == RECORD_ORIGIN_HRCDF
    changed = False
    for attname, value in seeded.items():
        if fill_empty_only and attname == "name":
            if not instance.name and value:
                instance.name = value
                changed = True
            continue
        current = getattr(instance, attname)
        if fill_empty_only and current not in (None, ""):
            continue
        if current != value:
            setattr(instance, attname, value)
            changed = True
    return changed


# Developed with Understanding: the six seeded commands first, then any other command code
# of the CSV in sorted order, so row ids are stable across deployments. Bulk diff on code.
def _upsert_commands(rows):
    """Return ({code: HrcdfCommand}, created, updated)."""
    codes = [*SEED_COMMAND_NAMES]
    codes += sorted(
        {row["command_code"] for row in rows if row["command_code"]} - set(codes)
    )
    existing = {command.code: command for command in HrcdfCommand.objects.all()}
    now = timezone.now()
    to_create = []
    to_update = []
    for code in codes:
        seeded = {
            "name": SEED_COMMAND_NAMES.get(code, code),
            "record_origin": RECORD_ORIGIN_SEED,
        }
        command = existing.get(code)
        if command is None:
            to_create.append(HrcdfCommand(code=code, **seeded))
            continue
        if _apply_seeded_values(command, seeded):
            command.updated_at = now
            to_update.append(command)

    if to_create:
        HrcdfCommand.objects.bulk_create(to_create, batch_size=BULK_BATCH_SIZE)
    if to_update:
        HrcdfCommand.objects.bulk_update(
            to_update, list(COMMAND_UPDATE_FIELDS), batch_size=BULK_BATCH_SIZE
        )
    commands = {command.code: command for command in HrcdfCommand.objects.all()}
    return commands, len(to_create), len(to_update)


# Developed with Understanding: the seed_rbac pattern (R1 D3) - existing rows are loaded
# once into a dict keyed on code, missing rows are bulk created and only rows whose
# seeded values differ are bulk updated.
def _upsert_units(rows, commands):
    """Return (created, updated, unchanged) counts."""
    existing = {unit.code: unit for unit in HrcdfUnit.objects.all()}
    # Developed with Understanding: hrcdf_unit_id is unique. When another code already
    # holds a seeded id, the id is left as it is rather than failing the whole seed.
    id_holders = {
        unit.hrcdf_unit_id: unit.code
        for unit in existing.values()
        if unit.hrcdf_unit_id is not None
    }
    unit_type_width = HrcdfUnit._meta.get_field("unit_type").max_length
    now = timezone.now()
    to_create = []
    to_update = []
    unchanged = 0
    seen_codes = set()

    for row in rows:
        code = row["code"]
        # Developed with Understanding: a code repeated in the CSV is applied once, first
        # row wins, so an unsaved new row is never sent to bulk_update.
        if code in seen_codes:
            continue
        seen_codes.add(code)
        unit = existing.get(code)
        command = commands.get(row["command_code"])
        hrcdf_unit_id = row["hrcdf_unit_id"]
        holder = id_holders.get(hrcdf_unit_id)
        if hrcdf_unit_id is not None and holder is not None and holder != code:
            hrcdf_unit_id = unit.hrcdf_unit_id if unit is not None else None

        seeded = {
            "name": row["name"],
            "description": row["description"] or None,
            "hrcdf_unit_id": hrcdf_unit_id,
            "station_code": row["station_code"],
            "command_id": command.pk if command is not None else None,
            "unit_type": row["unit_type"][:unit_type_width],
            "record_origin": RECORD_ORIGIN_SEED,
        }

        if unit is None:
            to_create.append(HrcdfUnit(code=code, **seeded))
            if hrcdf_unit_id is not None:
                id_holders[hrcdf_unit_id] = code
            continue

        if _apply_seeded_values(unit, seeded):
            unit.updated_at = now
            to_update.append(unit)
        else:
            unchanged += 1

    if to_create:
        HrcdfUnit.objects.bulk_create(to_create, batch_size=BULK_BATCH_SIZE)
    if to_update:
        HrcdfUnit.objects.bulk_update(
            to_update, list(UNIT_UPDATE_FIELDS), batch_size=BULK_BATCH_SIZE
        )
    return len(to_create), len(to_update), unchanged


# Developed with Understanding: the one entry point. Everything runs in one
# transaction.atomic block, so a failure leaves both tables as they were. dry_run marks
# the block for rollback and still returns the counts it would have produced.
def apply_unit_seed(dry_run=False):
    """Seed HrcdfCommand and HrcdfUnit from the bundled CSV and return counts."""
    rows_read, rows = _read_seed_rows()
    with transaction.atomic():
        commands, commands_created, commands_updated = _upsert_commands(rows)
        units_created, units_updated, units_unchanged = _upsert_units(rows, commands)
        if dry_run:
            transaction.set_rollback(True)

    return {
        "commands_created": commands_created,
        "commands_updated": commands_updated,
        "units_created": units_created,
        "units_updated": units_updated,
        "units_unchanged": units_unchanged,
        "rows_read": rows_read,
    }
