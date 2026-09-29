# ruff: noqa
import os
import re
from django.core.cache import cache
from django.db import DatabaseError
from django.shortcuts import redirect

try:
    import sweetify
except ImportError:
    # sweetify is not a dependency of this project (it is not in pyproject.toml), so this
    # branch is the one that always runs -- and `sweetify = None` made every
    # `sweetify.success(...)`/`sweetify.error(...)` call site below an AttributeError
    # waiting to happen ("'NoneType' object has no attribute 'success'"). Those calls sit
    # in legacy Django-template views that only ever ran under a request with a session;
    # the SRAR → CMMS push reaches one of them and used to die on the success message
    # *after* the data had already been POSTed to CMMS.
    #
    # A no-op stand-in keeps those call sites harmless, matching what dart_backup's
    # DummySweetify already does for the same reason.
    class _DummySweetify:
        @staticmethod
        def info(*args, **kwargs):
            pass

        @staticmethod
        def success(*args, **kwargs):
            pass

        @staticmethod
        def error(*args, **kwargs):
            pass

    sweetify = _DummySweetify()

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.test import APIRequestFactory, force_authenticate
from drf_spectacular.utils import extend_schema, OpenApiTypes, OpenApiExample
from sfd.models import ShipEquipment, ChangeEquipmentRequest, RemoveEquipment
from master.utils import get_this_ship, get_dart_split
from sfd.utils import get_mssql_connection, resolve_cmms_department_for_dart
from accounts import rbac
from accounts.permissions import CanInitialiseShipData
from master.models import *
import calendar
import logging
import requests
import json
import uuid
from ems.models import (
    AddRoutineDetails,
    EquipmentName,
    FussRaiseDetails,
    MaintopDetail,
    MaintopHeader,
    RoutineDescription,
    SectionName,
    ShipMaster,
    UniqueRoutineName,
)
from datetime import datetime, date
from django.db import transaction
from op_maintenance.managers import SWMM_RAISED_DART
from op_maintenance.models import InitiateDart, CompleteDefectDart, CompletedRoutine
from collections import defaultdict
from django.utils import timezone
from django.core.serializers.json import DjangoJSONEncoder
from srar.models import *
from django.core import signing
from django.db.models import Count, DateField, DateTimeField, IntegerField, Max, Q
from django.db.models.functions import Cast
from django.utils.dateparse import parse_date, parse_datetime

from ems.models import AddRoutineDetails, RoutineDescription


from django.http import HttpResponse, StreamingHttpResponse
from sfd.models import Equipment, EquipmentType, Supplier, TrialUnit
from master.models import MEquipment as MasterEquipment
from master.models import Manufacturer as MasterManufacturer
from master.models import Supplier as MasterSupplier
from master.models import EquipmentType as MasterEquipmentType
from master.models import Country as MasterCountry
from master.models import Group as MasterGroup
from master.utils import parse_iso_date
from swmmapi.sync_ledger import (
    ledgered,
    last_successful_run,
    sync_run,
    tuple_stats,
)
from swmmapi.sync_resume import (
    ResumeCursor,
    StreamCheckpoint,
    clear_module,
    mark_phase_complete,
    phase_completed,
)

import environ

env = environ.Env()
API_URL = env("SWMM_API_URL")
logger = logging.getLogger(__name__)


class CommonPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response(
            {
                "status": True,
                "message": "Data fetched successfully.",
                "pagination": {
                    "count": self.page.paginator.count,
                    "current_page": self.page.number,
                    "page_size": self.get_page_size(self.request),
                    "total_pages": self.page.paginator.num_pages,
                    "next": self.get_next_link(),
                    "previous": self.get_previous_link(),
                },
                "data": data,
            }
        )


def to_int(value):
    if value is None or value == "":
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def date_from_cmms(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return parse_iso_date(str(value))


def datetime_from_cmms(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return timezone.make_aware(value) if timezone.is_naive(value) else value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed
    except ValueError:
        parsed_date = parse_iso_date(str(value))
        if parsed_date:
            return datetime.combine(parsed_date, datetime.min.time())
    return None


def _clean_text(value):
    return str(value or "").strip()


def to_int(value, default=None):
    if value in (None, ""):
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return default


def _clean_upper(value):
    return _clean_text(value).upper()


def _clean_int(value, default=0):
    try:
        if value in (None, ""):
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _cmms_rhsi_to_pseudo(value):
    """Converts one CMMS running-hours figure into the SWMM pseudo-decimal HH.MM string
    RHSI Master's own manual-save path writes (RHSIMasterSaveAPIView does
    `rhsi_value.replace(":", ".")`) — matches the reference project's own
    `_cmms_rhsi_to_pseudo` exactly. Returns `(text, number)`, or `(None, None)` for
    anything missing, unparseable, or not greater than zero — a bare `str(float)` (what
    this sync used to write) is NOT the same convention: "14.5" reads back as 14h 30m
    here, not 14h 5m, so writing a raw float directly silently corrupts the figure every
    other RHSI screen displays.
    """
    try:
        raw = float(value)
    except (TypeError, ValueError):
        return None, None
    if raw <= 0:
        return None, None
    whole_hours = int(raw)
    total_minutes = whole_hours * 60 + int(round((raw - whole_hours) * 100))
    if total_minutes <= 0:
        return None, None
    text = f"{total_minutes // 60}.{total_minutes % 60:02d}"
    return text, float(text)


def _normalized_sub_dept_name(name):
    """Compares two sub-department names the way a person would — ignoring case, spaces
    and punctuation, so 'AMR&CONTROLS', 'AMR & CONTROLS' and 'amr and controls' aren't
    treated as three different sub departments. Matches the reference project's own
    `_normalised_sub_dept_name` (SFD/views.py) exactly. Returns '' for a blank name,
    which never matches anything."""
    if not name:
        return ""
    return "".join(re.sub(r"[^a-zA-Z0-9]", "", str(name)).split()).upper()


def _clean_float_or_none(value):
    """Float, or None when CMMS has no reading — never a substituted 0.

    Running-hour readings must not be defaulted. A stored 0 asserts "this routine was last
    completed at 0 running hours", which makes next-due = 0 + frequency and leaves the
    routine looking permanently overdue against any real RHSI. Every consumer already guards
    with `is not None`, so None correctly means "unknown" and the routine is skipped instead
    of counted as due.
    """
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def env_ship_code():
    """The single hull this SWMM install is deployed on.

    Prefers the ship chosen via Step 0 (ActiveShipConfig, set from the Nomenclature
    Synchronization screen) over the .env SWMM_SHIP_CODE, which now only serves as the
    fallback for installs where Step 0 has never been run.
    """
    selected = ActiveShipConfig.get_selected_ship()
    if selected and selected.universal_id_m_ship:
        return selected.universal_id_m_ship

    return (
        env.str("SWMM_SHIP_CODE", default="").strip()
        or env.str("DEFAULT_SHIP_ID", default="").strip()
        or env.str("SHIP_ID", default="").strip()
        or "L18"
    )


def resolve_cmms_ship_uid(cursor, ship_code=None):
    """Universal_ID_M_Ship for the .env ship code, or None when CMMS has no such ship.

    Deliberately returns None instead of falling back to an arbitrary hull: every sync in
    this module writes into a single-ship database, so pulling another ship's equipment,
    routines or darts in silently corrupts it. A ship code CMMS doesn't know is a
    configuration error and has to surface as one.
    """
    ship_code = ship_code or env_ship_code()
    if not ship_code:
        return None
    cursor.execute(
        """
        SELECT Universal_ID_M_Ship
        FROM M_Ship WITH (NOLOCK)
        WHERE LOWER(CAST(ShipCode AS VARCHAR(255))) = LOWER(?)
           OR LOWER(CAST(Universal_ID_M_Ship AS VARCHAR(255))) = LOWER(?)
           OR LOWER(CAST(ShipName AS VARCHAR(255))) = LOWER(?)
        """,
        [ship_code, ship_code, ship_code],
    )
    row = cursor.fetchone()
    return row[0] if row else None


# Lowercased column names per CMMS table, filled on first use. A schema is static for
# the life of a process, so this is process-wide rather than per-request — without it
# every DART in a push would re-query INFORMATION_SCHEMA for the same three tables.
_CMMS_COLUMN_CACHE = {}

# {table: columns already reported as absent}, so the drop is logged once per process
# rather than once per row pushed.
_CMMS_DROPPED_COLUMNS = {}


def cmms_columns(cursor, table):
    """Lowercased column names `table` actually has in the CMMS DB we're connected to.

    CMMS schemas differ between deployments — CMMSOFFLINE has no M_Ship.ILMSCustomerCode
    or M_Equipment.ILMSEquipmentCode, other dumps do — and MSSQL rejects the *entire*
    statement on the first unknown column name, so a query that touches a
    deployment-specific column has to ask first rather than assume.
    """
    if table not in _CMMS_COLUMN_CACHE:
        cursor.execute(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ?",
            [table],
        )
        _CMMS_COLUMN_CACHE[table] = {row[0].lower() for row in cursor.fetchall()}
    return _CMMS_COLUMN_CACHE[table]


def cmms_optional_column(cursor, table, column, alias=None):
    """`table.column` when the connected CMMS has it, else `NULL AS alias`, so the
    SELECT list keeps its shape and the row.get(alias) downstream still resolves.
    """
    alias = alias or column
    if column.lower() in cmms_columns(cursor, table):
        return f"{table}.{column} AS {alias}"
    return f"NULL AS {alias}"


def _routine_category(frequency):
    """(category, is_greater_than_3_monthly) for a CMMS frequency code.

    RUNNING HOUR BASED is exactly the hour-denominated frequencies — those ending in "H"
    (100H, 600H, 1000H…). Verified against the synced data: `frequency.endswith("H")` and
    `frequency_in_hours > 0` agree on all 3593 rows, with no exceptions either way.

    That matters because every running-hour consumer divides by / adds `frequency_in_hours`
    and compares against the equipment's RHSI. Weekly/Daily/Occasional (W, D, O) and unknown
    codes carry `frequency_in_hours = 0`, so filing them as RUNNING HOUR BASED made them
    compute a next-due of `last_rh + 0`, which reads as permanently overdue. They are
    calendar-driven, so they belong in CALENDAR BASED — as does anything unrecognised,
    since a routine with no hour figure can never be evaluated on running hours.
    """
    frequency = _clean_upper(frequency)
    if frequency.endswith("H"):
        return "RUNNING HOUR BASED", True
    if frequency.endswith(("A", "M", "Y")):
        return "CALENDAR BASED", True
    if frequency.endswith(("NR", "PRT", "SR", "MR", "PRR", "DK", "POLICY")):
        return "ALTERNATE PERIODIC", True
    if frequency.endswith(("O", "W", "D")):
        return "CALENDAR BASED", False
    return "CALENDAR BASED", True


def _find_equipment_name(row):
    equipment_uid = _clean_text(row.get("Universal_ID_T_EquipmentShipDetail"))
    nomenclature = _clean_text(row.get("nomenclature"))
    equipment_code = _clean_text(row.get("equipmentcode"))

    if equipment_uid:
        equipment = (
            EquipmentName.objects.filter(
                universal_id_t_equipment_ship_detail=equipment_uid
            ).first()
            or EquipmentName.objects.filter(
                sfd_equipment__t_equipment_ship_detail=equipment_uid
            ).first()
        )
        if equipment:
            return equipment

    queryset = EquipmentName.objects.all()
    if equipment_code:
        queryset = queryset.filter(equipment_code__iexact=equipment_code)
    if nomenclature:
        return (
            queryset.filter(nomenclature__iexact=nomenclature).first()
            or EquipmentName.objects.filter(name__iexact=nomenclature).first()
        )
    return None


def _next_missing_routine_dart(department):
    if not department:
        return None, None
    try:
        from ems.utils import generate_routine_dart_number

        last_entry = (
            RoutineDescription.objects.select_for_update()
            .filter(department_f_key=department, dart_sr_no__regex=r"^\d+$")
            .annotate(dart_sr_no_int=Cast("dart_sr_no", IntegerField()))
            .aggregate(max_sr=Max("dart_sr_no_int"))["max_sr"]
            or 0
        )
        return generate_routine_dart_number(department.name, "Routine", last_entry)
    except Exception:
        logger.exception("Failed to generate local routine DART number")
        return None, None


def sync_cmms_routine_row(row, create_missing_dart=False):
    equipment = _find_equipment_name(row)
    if not equipment:
        return "SKIPPED", f"Missing equipment: {_clean_text(row.get('nomenclature'))}"

    department_name = _clean_text(row.get("departmentname"))
    department = Department.objects.filter(
        name__iexact=department_name
    ).first() or getattr(getattr(equipment, "sfd_equipment", None), "department", None)
    if not department:
        return "SKIPPED", f"Missing department: {department_name or 'N/A'}"

    routine_name_text = _clean_upper(row.get("routinename")) or _clean_upper(
        row.get("frequency")
    )
    if not routine_name_text:
        return "SKIPPED", "Missing routine name"

    routine_name, _ = UniqueRoutineName.objects.get_or_create(name=routine_name_text)
    ship_name = _clean_upper(row.get("shipname"))
    ship_master = (
        ShipMaster.objects.get_or_create(ship_name=ship_name)[0] if ship_name else None
    )

    frequency_uid = _clean_text(row.get("Universal_ID_M_Frequency"))
    frequency_obj = (
        Frequency.objects.filter(universal_id_m_frequency=frequency_uid).first()
        if frequency_uid
        else None
    )
    frequency = _clean_upper(row.get("frequency"))
    routine_category, is_greater_than_3_monthly = _routine_category(frequency)

    maintop_no = _clean_upper(row.get("maintopno"))
    routine_no = _clean_upper(row.get("routineno"))
    routine_desc = _clean_text(row.get("routinedescription"))
    dart_number = _clean_upper(row.get("dartnumber"))
    dart_sr_no = None
    if dart_number:
        parts = dart_number.split("-")
        dart_sr_no = parts[2] if len(parts) > 2 else None
    elif create_missing_dart:
        dart_number, dart_sr_no = _next_missing_routine_dart(department)

    maintop_detail_uid = _clean_text(row.get("universal_id_t_maintopdetail"))
    maintop_detail = (
        MaintopDetail.objects.filter(
            universal_id_t_maintopdetail=maintop_detail_uid
        ).first()
        if maintop_detail_uid
        else None
    )

    add_lookup = {
        "equipment_name": equipment,
        "routine_name": routine_name,
        "maintop_no": maintop_no,
        "routine_no": routine_no,
        "frequency": frequency,
    }
    add_defaults = {
        "class_name": _clean_upper(row.get("classname")),
        "ship": ship_master,
        "equipment_code": _clean_text(row.get("equipmentcode")),
        "nomenclature": _clean_text(row.get("nomenclature")) or equipment.nomenclature,
        "dart_number": dart_number,
        "by_whom": _clean_upper(row.get("bywhom")),
        "frequency_in_months": _clean_int(row.get("frequencymonth")),
        "frequency_in_hours": _clean_int(row.get("frequencyhours")),
        "rhs_i": _clean_text(row.get("lastroutinecompletedatrh")) or "0",
        "rhs_i_updated_upto": date_from_cmms(row.get("rhsiupdatedupto")),
        "last_routine_completion_date": datetime_from_cmms(
            row.get("lastroutinecompletedatdate")
        ),
        "last_routine_completion_atrunning_hrs": _clean_float_or_none(
            row.get("lastroutinecompletedatrh")
        ),
        "frequency_f_key": frequency_obj,
        "routine_category": routine_category,
        "converted": False,
    }
    add_routine, add_created = AddRoutineDetails.objects.update_or_create(
        **add_lookup, defaults=add_defaults
    )

    if not routine_desc:
        return (
            "CREATED" if add_created else "UPDATED",
            f"{equipment.name} / {maintop_no} / {routine_no}",
        )

    universal_id_t_dart = _clean_text(row.get("Universal_ID_T_Dart"))
    rd_lookup = (
        {"universal_id_t_dart": universal_id_t_dart}
        if universal_id_t_dart
        and RoutineDescription.objects.filter(
            universal_id_t_dart=universal_id_t_dart
        ).exists()
        else {
            "equipment_name": equipment,
            "add_routine_details": add_routine,
            "routine_no": routine_no,
        }
    )
    rd_defaults = {
        "equipment_name": equipment,
        "routine_name": routine_name,
        "add_routine_details": add_routine,
        "maintop_no": maintop_no,
        "dart_number": dart_number,
        "routine_no": routine_no,
        "routine_description": routine_desc,
        "by_whom": _clean_upper(row.get("bywhom")) or "",
        "last_routine_completion_date": datetime_from_cmms(
            row.get("lastroutinecompletedatdate")
        ),
        "last_routine_completion_atrunning_hrs": _clean_text(
            row.get("lastroutinecompletedatrh")
        ),
        "dart_sr_no": dart_sr_no,
        "due_date": date_from_cmms(row.get("routineduedate")),
        "previous_completed_date": date_from_cmms(
            row.get("lastroutinecompletedatdate")
        ),
        "due_at_rh": _clean_text(row.get("dueatrh")),
        "previous_completed_at_rh": _clean_text(row.get("lastroutinecompletedatrh")),
        "department_f_key": department,
        "maintop_detail": maintop_detail,
        "is_greater_than_3_monthly": is_greater_than_3_monthly,
        "universal_id_t_dart": universal_id_t_dart,
    }
    _, rd_created = RoutineDescription.objects.update_or_create(
        **rd_lookup, defaults=rd_defaults
    )

    status_text = "CREATED" if (add_created or rd_created) else "UPDATED"
    return status_text, f"{equipment.name} / {maintop_no} / {routine_no}"


# Nomenclature-wise routines live in T_Dart behind the routine flag. Note the flag column
# is `Is_Routine` (smallint) — there is no `T_Dart.Routines` column on any CMMS schema here;
# `RoutineDefect = 1` mirrors it exactly (4113 rows each) if you ever need the alternative.
_CMMS_NOMENCLATURE_ROUTINES_QUERY = """
    SELECT * FROM (
        SELECT
            d.Universal_ID_T_Dart,
            d.DartNumber,
            sc.Description  AS ClassName,
            s.ShipName,
            dep.Description AS DepartmentName,
            me.EquipmentName,
            me.EquipmentCode,
            esd.Nomenclature,
            esd.Universal_ID_T_EquipmentShipDetail,
            md.MaintopNo,
            md.RoutineNo,
            md.RoutineDescription,
            md.Universal_ID_T_MaintopDetail,
            md.Universal_ID_M_Frequency,
            f.Frequency,
            f.Description   AS RoutineName,
            f.Months        AS FrequencyMonth,
            f.Hours         AS FrequencyHours,
            d.RoutineDueDate,
            -- RectifiedDate, not RoutineStartDate, is when a routine dart was actually
            -- completed: it is set on exactly the 2542 IsClosed=1 routine darts on L18,
            -- while RoutineStartDate is only 45% populated and unrelated to closure.
            d.RectifiedDate,
            d.Running_Hour_Which_Routine_Completed AS LastRoutineCompletedAtRH,
            d.Next_Routine_Due_At_Running_Hours    AS DueAtRH,
            COALESCE(NULLIF(LTRIM(RTRIM(d.RoutineCarriedOutBy)), ''), md.ByWhom) AS ByWhom,
            d.IsClosed,
            ROW_NUMBER() OVER (
                PARTITION BY esd.Universal_ID_T_EquipmentShipDetail,
                             md.MaintopNo, md.RoutineNo, md.Universal_ID_M_Frequency
                ORDER BY d.RoutineDueDate DESC, d.DartDate DESC, d.Universal_ID_T_Dart DESC
            ) AS rn
        FROM T_Dart d WITH (NOLOCK)
        INNER JOIN T_EquipmentShipDetail esd WITH (NOLOCK)
            ON d.Universal_ID_T_EquipmentShipDetail = esd.Universal_ID_T_EquipmentShipDetail
        INNER JOIN M_Ship s WITH (NOLOCK)
            ON d.Universal_ID_M_Ship = s.Universal_ID_M_Ship
        LEFT JOIN M_ShipClass sc WITH (NOLOCK)
            ON s.Universal_ID_M_ShipClass = sc.Universal_ID_M_ShipClass
        LEFT JOIN M_Department dep WITH (NOLOCK)
            ON d.Universal_ID_M_Department = dep.Universal_ID_M_Department
        LEFT JOIN M_Equipment me WITH (NOLOCK)
            ON esd.Universal_ID_M_Equipment = me.Universal_ID_M_Equipment
        INNER JOIN T_MaintopDetail md WITH (NOLOCK)
            ON d.RoutineID = md.RoutineID
        LEFT JOIN M_Frequency f WITH (NOLOCK)
            ON md.Universal_ID_M_Frequency = f.Universal_ID_M_Frequency
        WHERE d.Universal_ID_M_Ship = ?
          AND d.Active = 1
          AND d.Is_Routine = 1
          AND esd.Active = 1
          AND esd.RemovalDate IS NULL
          AND esd.Universal_ID_T_EquipmentShipDetail IN ({equipment_placeholders})
    ) ranked
    WHERE ranked.rn = 1
    ORDER BY ranked.Nomenclature, ranked.MaintopNo, ranked.RoutineNo
"""


def fetch_cmms_nomenclature_routines(cursor, ship_uid, equipment_ship_uids):
    """This ship's own equipment's nomenclature-wise routines from CMMS T_Dart, newest
    dart per routine.

    CMMS stores one T_Dart row per *occurrence* of a routine, so a single
    (equipment, maintop, routine, frequency) accumulates one dart per cycle — on L18 that's
    4063 dart rows for 1535 actual routines, and that was for EVERY T_Dart tagged with this
    ship's Universal_ID_M_Ship regardless of whether the equipment it points at is still
    part of this ship's actual fit (a refit swap, decommission, etc. leaves the old
    T_Dart history behind but SWMM has no use for its routines going forward). Restricting
    to equipment_ship_uids — the T_EquipmentShipDetail this ship's own ShipEquipment rows
    reference (Step 1's sync) — is both correctness (don't offer routines for equipment
    that isn't on this ship) and the fix for how long this step used to take (it was
    processing every historical dart for the ship, not just the current fit).

    Only the newest dart per routine is wanted: it holds the current due date and
    last-completion state, and RoutineDescription is keyed on universal_id_t_dart, so
    keeping them all would write one local row per historical occurrence instead of one
    per routine. Hence the ROW_NUMBER() ... = 1 filter.

    Returns dicts already shaped for sync_cmms_routine_row(). Returns [] without touching
    CMMS if equipment_ship_uids is empty (nothing to scope the pull to).
    """
    if not equipment_ship_uids:
        return []

    placeholders = ",".join(["?"] * len(equipment_ship_uids))
    query = _CMMS_NOMENCLATURE_ROUTINES_QUERY.format(
        equipment_placeholders=placeholders
    )
    cursor.execute(query, [ship_uid, *equipment_ship_uids])
    columns = [column[0] for column in cursor.description]
    rows = []
    for row_tuple in cursor.fetchall():
        row = dict(zip(columns, row_tuple))
        rows.append(
            {
                "Universal_ID_T_Dart": row.get("Universal_ID_T_Dart"),
                "Universal_ID_M_Frequency": row.get("Universal_ID_M_Frequency"),
                "Universal_ID_T_EquipmentShipDetail": row.get(
                    "Universal_ID_T_EquipmentShipDetail"
                ),
                "universal_id_t_maintopdetail": row.get("Universal_ID_T_MaintopDetail"),
                "dartnumber": row.get("DartNumber"),
                "classname": row.get("ClassName"),
                "shipname": row.get("ShipName"),
                "departmentname": row.get("DepartmentName"),
                "equipmentname": row.get("EquipmentName"),
                "equipmentcode": row.get("EquipmentCode"),
                "nomenclature": row.get("Nomenclature"),
                "maintopno": row.get("MaintopNo"),
                "routineno": row.get("RoutineNo"),
                "routinedescription": row.get("RoutineDescription"),
                "routinename": row.get("RoutineName"),
                "bywhom": row.get("ByWhom"),
                "frequency": row.get("Frequency"),
                "frequencymonth": row.get("FrequencyMonth"),
                "frequencyhours": row.get("FrequencyHours"),
                "routineduedate": row.get("RoutineDueDate"),
                "dueatrh": row.get("DueAtRH"),
                # rhs_i is taken from LastRoutineCompletedAtRH, so the date that running-hour
                # reading is valid up to is the same completion date.
                "rhsiupdatedupto": row.get("RectifiedDate"),
                "lastroutinecompletedatrh": row.get("LastRoutineCompletedAtRH"),
                "lastroutinecompletedatdate": row.get("RectifiedDate"),
            }
        )
    return rows


def build_sync_log(title, rows, *, create_missing_dart=False):
    return "\n".join(
        stream_sync_log(title, rows, create_missing_dart=create_missing_dart)
    )


# ---------------------------------------------------------------------------
# Routine & FUSS history pulls (CMMS -> SWMM)
#
# Each reads with `SELECT *` and pulls fields back out through row.get(), for the
# same reason _fetch_defect_masters does: these tables differ between CMMS
# deployments and MSSQL rejects the entire statement on the first unknown column.
# All three key on a CMMS Universal_ID and upsert, so re-running a step updates
# history in place instead of duplicating it.
#
# There is deliberately no FussSpare pull: CMMS has no FUSS-spare table at all.
# T_DartSpare and T_RoutineListSpare belong to darts and routine lists,
# T_FussRoutineDetail is a fuss-to-routine link, and the only other candidate,
# T_Fuss.DemandDetails, is unstructured free text that is NULL on every row.
# FussSpare rows are raised locally through the FUSS form and stay local.
# ---------------------------------------------------------------------------


@ledgered("pull", "routine_list")
def pull_cmms_routine_list(cursor, ship_uid):
    """T_RoutineList -> RoutineDescription.universal_id_t_routine_list.

    T_RoutineList is CMMS's *open* routine list, not completion history -- every
    row for this ship has RectifiedDate NULL and IsClosed 0. So it contributes
    exactly one thing Step 4's T_Dart pull cannot: the Universal_ID_T_RoutineList
    tying a local routine back to its CMMS list row. RoutineDescription has
    carried that column all along with nothing ever populating it.

    Matched on (Universal_ID_T_MaintopDetail, Universal_ID_T_EquipmentShipDetail)
    -- every row carries both -- rather than on maintop-number text, and both
    halves are needed because one maintop routine applies to many equipment fits.
    """
    cursor.execute(
        "SELECT * FROM [T_RoutineList] WITH (NOLOCK) WHERE Universal_ID_M_Ship = ?",
        str(ship_uid),
    )
    columns = [column[0] for column in cursor.description]
    rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    # One query for the whole local side rather than a lookup per CMMS row.
    routine_id_by_key = {}
    for routine in RoutineDescription.objects.exclude(
        maintop_detail__isnull=True
    ).values(
        "id",
        "maintop_detail__universal_id_t_maintopdetail",
        "equipment_name__universal_id_t_equipment_ship_detail",
    ):
        key = (
            _clean_text(routine["maintop_detail__universal_id_t_maintopdetail"]),
            _clean_text(
                routine["equipment_name__universal_id_t_equipment_ship_detail"]
            ),
        )
        routine_id_by_key.setdefault(key, routine["id"])

    linked = skipped = 0
    with transaction.atomic():
        for row in rows:
            list_uid = _clean_text(row.get("Universal_ID_T_RoutineList"))
            maintop_uid = _clean_text(row.get("Universal_ID_T_MaintopDetail"))
            equipment_uid = _clean_text(row.get("Universal_ID_T_EquipmentShipDetail"))
            if not list_uid or not maintop_uid:
                skipped += 1
                continue
            routine_id = routine_id_by_key.get((maintop_uid, equipment_uid))
            if routine_id is None:
                skipped += 1
                continue
            RoutineDescription.objects.filter(id=routine_id).update(
                universal_id_t_routine_list=list_uid
            )
            linked += 1
    return {"fetched": len(rows), "linked": linked, "skipped": skipped}


@ledgered("pull", "completed_routines")
def pull_cmms_completed_routines(cursor, ship_uid):
    """T_Dart (Is_Routine = 1 with a RectifiedDate) -> dart.CompletedRoutine.

    This -- not T_RoutineList -- is where CMMS keeps routine *completion*
    history, and those rows carry the running hours, mandays and repair text a
    completion record needs. Until now nothing pulled it: CompletedRoutineSync
    only ever pushed local completions up.

    Rows are tied to their local routine by universal_id_t_dart first and by
    (Universal_ID_T_MaintopDetail, Universal_ID_T_EquipmentShipDetail) second.
    The pair carries almost all of it: Step 4's first phase only populates
    universal_id_t_dart for *open* darts (1515 of 1518 IsClosed=0 rows locally,
    against 49 of 2611 closed ones), so a dart-uid-only match would find ~2% of
    the history. The pair is also the more honest key -- a completed dart is a
    completion event *of* a routine, and locally a routine just is a
    (maintop, equipment) pair. A pair with no local routine is skipped rather
    than guessed at.

    Keyed on old_universal_id_t_dart, the one CompletedRoutine column holding a
    CMMS dart uid, which is what makes a re-run update in place.
    """
    cursor.execute(
        """
        SELECT * FROM [T_Dart] WITH (NOLOCK)
        WHERE Universal_ID_M_Ship = ?
          AND Is_Routine = 1
          AND RectifiedDate IS NOT NULL
        """,
        str(ship_uid),
    )
    columns = [column[0] for column in cursor.description]
    rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    routine_id_by_dart_uid = {
        _clean_text(uid): routine_id
        for routine_id, uid in RoutineDescription.objects.exclude(
            universal_id_t_dart__isnull=True
        )
        .exclude(universal_id_t_dart="")
        .values_list("id", "universal_id_t_dart")
    }
    routine_id_by_pair = {}
    for routine in RoutineDescription.objects.exclude(
        maintop_detail__isnull=True
    ).values(
        "id",
        "maintop_detail__universal_id_t_maintopdetail",
        "equipment_name__universal_id_t_equipment_ship_detail",
    ):
        key = (
            _clean_text(routine["maintop_detail__universal_id_t_maintopdetail"]),
            _clean_text(
                routine["equipment_name__universal_id_t_equipment_ship_detail"]
            ),
        )
        routine_id_by_pair.setdefault(key, routine["id"])
    rank_id_by_uid = {
        _clean_text(uid): rank_id
        for rank_id, uid in MRanklist.objects.exclude(
            universal_id_m_ranklist__isnull=True
        ).values_list("pk", "universal_id_m_ranklist")
    }

    def _hours_minutes(mandays):
        """CMMS records effort as decimal mandays; CompletedRoutine stores h/m."""
        if mandays in (None, ""):
            return None, None
        try:
            total_minutes = int(round(float(mandays) * 24 * 60))
        except (TypeError, ValueError):
            return None, None
        return total_minutes // 60, total_minutes % 60

    created = updated = skipped = 0
    with transaction.atomic():
        for row in rows:
            dart_uid = _clean_text(row.get("Universal_ID_T_Dart"))
            if not dart_uid:
                skipped += 1
                continue
            routine_id = routine_id_by_dart_uid.get(dart_uid)
            if routine_id is None:
                routine_id = routine_id_by_pair.get(
                    (
                        _clean_text(row.get("Universal_ID_T_MaintopDetail")),
                        _clean_text(row.get("Universal_ID_T_EquipmentShipDetail")),
                    )
                )
            if routine_id is None:
                skipped += 1
                continue
            hours, minutes = _hours_minutes(row.get("MandaysConsumed"))
            _, was_created = CompletedRoutine.objects.update_or_create(
                old_universal_id_t_dart=dart_uid,
                defaults={
                    "routine_id": routine_id,
                    "old_dart_number": _clean_upper(row.get("DartNumber")),
                    "date_of_completion": date_from_cmms(row.get("RectifiedDate")),
                    "hours": hours,
                    "minutes": minutes,
                    "carried_by": _clean_text(row.get("RoutineCarriedOutBy")) or None,
                    "p_no": _clean_text(row.get("PersonalNo")) or None,
                    "other_rank": _clean_text(row.get("OtherRank")) or None,
                    "rank_id": rank_id_by_uid.get(
                        _clean_text(row.get("Universal_ID_M_RankList"))
                    ),
                    "total_manpower": to_int(row.get("TotalNoOfManpower")),
                    "running_hour": _clean_text(
                        row.get("Running_Hour_Which_Routine_Completed")
                    )
                    or None,
                    "due_running_hour": _clean_text(
                        row.get("Next_Routine_Due_At_Running_Hours")
                    )
                    or None,
                    "repair_remark": _clean_text(row.get("RepairRoutineDetails"))
                    or None,
                    "completion_details": _clean_text(row.get("Remarks")) or None,
                    "rec_for_deletion": bool(row.get("RecForDeletion")),
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1
    return {
        "fetched": len(rows),
        "created": created,
        "updated": updated,
        "skipped": skipped,
    }


@ledgered("pull", "fuss")
def pull_cmms_fuss(cursor, ship_uid):
    """T_Fuss -> ems.FussRaiseDetails.

    The mirror image of InitiateFussSyncAPIView, which only ever pushed local FUSS
    up -- so a FUSS raised anywhere else was invisible here. Keyed on
    Universal_ID_T_Fuss so this pull and that push converge on one local row per
    FUSS rather than fighting each other.

    The master FKs are resolved through the Universal_IDs Step 1 syncs into those
    tables; an unmatched uid leaves the FK null rather than inventing a master row.
    """
    cursor.execute(
        "SELECT * FROM [T_Fuss] WITH (NOLOCK) WHERE Universal_ID_M_Ship = ?",
        str(ship_uid),
    )
    columns = [column[0] for column in cursor.description]
    rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    def _by_uid(model, uid_field):
        return {
            _clean_text(uid): pk
            for pk, uid in model.objects.exclude(**{uid_field + "__isnull": True})
            .exclude(**{uid_field: ""})
            .values_list("pk", uid_field)
        }

    deferment_by_uid = _by_uid(MDeferment, "universal_id_m_deferment")
    reason_by_uid = _by_uid(MReason, "universal_id_m_reason")
    inability_by_uid = _by_uid(MInability, "universal_id_m_inability")
    establishment_by_uid = _by_uid(MEstablishment, "universal_id_m_establishment")
    department_by_uid = _by_uid(Department, "universal_id_m_department")
    routine_id_by_dart_uid = {
        _clean_text(uid): pk
        for pk, uid in RoutineDescription.objects.exclude(
            universal_id_t_dart__isnull=True
        )
        .exclude(universal_id_t_dart="")
        .values_list("pk", "universal_id_t_dart")
    }

    ship = get_this_ship()
    ship_name = getattr(ship, "name", None) or ""

    created = updated = skipped = 0
    with transaction.atomic():
        for row in rows:
            fuss_uid = _clean_text(row.get("Universal_ID_T_Fuss"))
            if not fuss_uid:
                skipped += 1
                continue
            _, was_created = FussRaiseDetails.objects.update_or_create(
                universal_id_t_fuss=fuss_uid,
                defaults={
                    "ship": ship_name,
                    "department": _clean_text(row.get("Department")) or None,
                    "department_f_key_id": department_by_uid.get(
                        _clean_text(row.get("Universal_ID_M_Department"))
                    ),
                    "serial_no": _clean_text(row.get("SrNo")) or None,
                    "routine_description_id_id": routine_id_by_dart_uid.get(
                        _clean_text(row.get("Universal_ID_T_Dart"))
                    ),
                    "fuss_date": date_from_cmms(row.get("FussDate")),
                    "last_undertaken": date_from_cmms(row.get("LastUndertaken")),
                    "due_date": date_from_cmms(row.get("DueDate")),
                    "schedule_date": date_from_cmms(row.get("ScheduleDate")),
                    "equipment": _clean_text(row.get("RoutineDescription")) or None,
                    "location_on_board": _clean_text(row.get("LocationCode")) or None,
                    "equipment_sr_no": _clean_text(row.get("EngineSrNo")) or None,
                    "location_code": _clean_text(row.get("LocationCode")) or None,
                    "maintop_no": _clean_text(row.get("SchedMaintopNo")) or None,
                    "frequency": _clean_text(row.get("SchedFrequency")) or None,
                    "amendment_no": _clean_text(row.get("SchedAmendmentNo")) or None,
                    "recomm_deferment_id": deferment_by_uid.get(
                        _clean_text(row.get("Universal_ID_M_Deferment"))
                    ),
                    "reason_id": reason_by_uid.get(
                        _clean_text(row.get("Universal_ID_M_Reason"))
                    ),
                    "inability_id": inability_by_uid.get(
                        _clean_text(row.get("Universal_ID_M_Inability"))
                    ),
                    "establishment_f_key_id": establishment_by_uid.get(
                        _clean_text(row.get("Universal_ID_M_Establishment"))
                    ),
                    "last_smp_completed": date_from_cmms(row.get("LastSMP")),
                    "last_smp_duration": _clean_text(row.get("SMPDuration")) or None,
                    "last_amp_completed": date_from_cmms(row.get("LastAMP")),
                    "last_amp_duration": _clean_text(row.get("AMPDuration")) or None,
                    "amp_smp_required_wef": date_from_cmms(row.get("AMPSMPReqWef")),
                    "amp_smp_duration": _clean_text(row.get("SMPAMPDuration")) or None,
                    "remarks": _clean_text(row.get("Remarks")) or None,
                    "demand_details": _clean_text(row.get("DemandDetails")) or None,
                    # A FUSS is closed in CMMS for either of two reasons, and both have to
                    # count: it was formally cancelled (CancelDate, stamped by a CMMS
                    # operator) or the ship declared the routine not undertaken
                    # (IsNoRoutineUndertaken -- which is the column InitiateFussSyncAPIView's
                    # push actually writes). Reading CancelDate alone meant every locally
                    # closed FUSS was pushed up as IsNoRoutineUndertaken=1 and then read back
                    # as open by the very next pull, silently reverting the operator's close
                    # on every sync cycle.
                    "isclosed_fuss": bool(row.get("IsNoRoutineUndertaken"))
                    or row.get("CancelDate") is not None,
                    "is_mail_sent": bool(row.get("IsMailSent")),
                    # Pulled from CMMS, so already in sync with it by definition.
                    "is_sync": True,
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1
    return {
        "fetched": len(rows),
        "created": created,
        "updated": updated,
        "skipped": skipped,
    }


def _routine_row_key(row):
    """Stable identity for a nomenclature-routine row, for resume positioning.

    CMMS rows carry Universal_ID_T_Dart; the rows Phase B *invents* (routines that should
    exist but have no dart anywhere) do not, so those fall back to the tuple that makes a
    routine unique on this hull. Both have to be stable across runs or the resume position
    means nothing -- see ResumeCursor.
    """
    dart_uid = _clean_text(row.get("Universal_ID_T_Dart"))
    if dart_uid:
        return dart_uid
    return "|".join(
        _clean_upper(row.get(field)) or ""
        for field in (
            "Universal_ID_T_EquipmentShipDetail",
            "universal_id_t_maintopdetail",
            "nomenclature",
            "maintopno",
            "routineno",
            "routinename",
            "frequency",
        )
    )


def stream_sync_log(
    title, rows, *, create_missing_dart=False, module=None, phase="", scope=()
):
    """Generator version of build_sync_log — each row calls sync_cmms_routine_row (several
    individual ORM reads/writes apiece, not bulk-batchable given its per-row FK-resolution
    business logic), so at a few thousand rows the whole thing can take minutes. Yielding line by
    line lets this be wrapped in a StreamingHttpResponse so the frontend's streamSync() shows real
    progress instead of the request just sitting there looking hung until it's all done.

    Minutes is also exactly long enough for a ship's link to drop partway, which is what
    `module` is for: pass one and the loop resumes at the row the interrupted attempt reached
    instead of re-processing every row before it. Each row is written in its own transaction
    already (there is no atomic block around this loop), so the rows before the interruption
    are committed and genuinely do not need doing again.
    """
    cursor = ResumeCursor(
        module or "",
        phase,
        rows,
        key=_routine_row_key,
        scope=scope,
        enabled=bool(module),
    )

    yield f"[SYSTEM] Starting {title}...\n"
    yield f"Fetched {cursor.total} records. Processing start...\n"
    if cursor.resumed:
        yield f"[RESUMED] {cursor.resume_message()}\n"

    created = updated = skipped = 0
    for row in cursor:
        status_text, message = sync_cmms_routine_row(
            row, create_missing_dart=create_missing_dart
        )
        if status_text == "CREATED":
            created += 1
            yield f"[NEW] {message}\n"
        elif status_text == "UPDATED":
            updated += 1
            yield f"[EXISTING] {message}\n"
        else:
            skipped += 1
            yield f"[SKIPPED] {message}\n"

    cursor.finish()
    yield "[Completed] Routine Sync Finished!\n"
    if cursor.resumed:
        # The tallies only cover this attempt, so say so rather than let the operator read
        # them as the whole job's numbers.
        yield (
            f"This run: New: {created}, Existing: {updated}, Skipped: {skipped} "
            f"({cursor.start_index} done by the earlier interrupted run)"
        )
    else:
        yield f"New: {created}, Existing: {updated}, Skipped: {skipped}"


def _default_unit_type():
    """Fallback UnitType for a brand-new Ship row (unit_type has no null=True at the DB
    level, so creation needs *something* -- see Ship.unit_type in master.models)."""
    unit_type = UnitType.objects.order_by("id").first()
    if unit_type:
        return unit_type
    unit_type, _ = UnitType.objects.get_or_create(name="CMMS")
    return unit_type


def cmms_pull_all_commands(cursor):
    """Fleet-wide M_Command -> master.MShipCommand. Returns (inserted, updated, total)."""
    cursor.execute("SELECT * FROM M_Command WITH (NOLOCK)")
    columns = [column[0] for column in cursor.description]
    rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    inserted = updated = 0
    for row in rows:
        command_id = row.get("CommandID")
        if command_id is None:
            continue
        active_raw = row.get("Active")
        _, created = MShipCommand.objects.update_or_create(
            command_id=command_id,
            defaults={
                "command_code": row.get("CommandCode") or None,
                "command_name": row.get("CommandName") or None,
                "command_ref": row.get("CommandRef") or None,
                "sfd_hierarchy_id": row.get("SFDHierarchyID"),
                "active": bool(active_raw) if active_raw is not None else None,
                "created_by": row.get("CreatedBy") or None,
                "created_date": datetime_from_cmms(row.get("CreatedDate")),
                "updated_by": row.get("UpdatedBy") or None,
                "updated_date": datetime_from_cmms(row.get("UpdatedDate")),
                "universal_id_m_command": row.get("Universal_ID_M_Command") or None,
                "universal_id_a_user_created_by": row.get(
                    "Universal_ID_A_User_Created_By"
                )
                or None,
                "universal_id_a_user_updated_by": row.get(
                    "Universal_ID_A_User_Updated_By"
                )
                or None,
            },
        )
        if created:
            inserted += 1
        else:
            updated += 1
    return inserted, updated, len(rows)


def cmms_pull_all_ships(cursor):
    """Fleet-wide M_Ship -> master.Ship, identity + command fields only.

    Deliberately lean: this backs the Step 0 Command/Ship Name dropdowns, not the full
    per-ship equipment/department sync CMMSFDDataAPI (Step 1) does for the one ship this
    install actually operates on. update_or_create's `defaults` only touches the keys
    listed here, so re-running Step 0 never clobbers fields Step 1 already populated for
    an existing ship (unit_type included -- only set when a Ship row is first created).
    Returns (inserted, updated, total).
    """
    ilms_customer_code = cmms_optional_column(cursor, "M_Ship", "ILMSCustomerCode")
    query = f"""
        SELECT
            M_Ship.Universal_ID_M_Ship,
            M_Ship.ShipName,
            M_Ship.ShipCode,
            M_Ship.ShipSrNo,
            M_Ship.SFDHierarchyID,
            M_Ship.CommandID,
            M_Command.CommandName,
            M_Ship.Universal_ID_M_Command,
            M_Ship.Active AS ShipActive,
            {ilms_customer_code}
        FROM M_Ship
        LEFT JOIN M_Command
            ON M_Ship.CommandID = M_Command.CommandID
    """
    cursor.execute(query)
    columns = [column[0] for column in cursor.description]
    rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    inserted = updated = 0
    for row in rows:
        ship_uid = row.get("Universal_ID_M_Ship")
        if not ship_uid:
            continue

        command_obj = None
        command_id = row.get("CommandID")
        if command_id is not None:
            command_obj, _ = MShipCommand.objects.update_or_create(
                command_id=command_id,
                defaults={"command_name": row.get("CommandName") or None},
            )

        active_raw = row.get("ShipActive")
        field_updates = {
            "name": row.get("ShipName") or "",
            "code": row.get("ShipCode") or "",
            "sr_no": (
                str(row.get("ShipSrNo"))
                if row.get("ShipSrNo") not in (None, "")
                else None
            ),
            "sfd_hierarchy_id": row.get("SFDHierarchyID"),
            "command": command_obj,
            "universal_id_m_command": row.get("Universal_ID_M_Command") or None,
            "active_external": bool(active_raw) if active_raw is not None else None,
            "customer_code": row.get("ILMSCustomerCode") or None,
        }

        existing = Ship.objects.filter(universal_id_m_ship=ship_uid).first()
        if existing:
            for field, value in field_updates.items():
                setattr(existing, field, value)
            existing.save(update_fields=list(field_updates.keys()))
            updated += 1
        else:
            unit_type = _default_unit_type()
            Ship.objects.create(
                universal_id_m_ship=ship_uid,
                unit_type=unit_type,
                unit_type_string=unit_type.name,
                **field_updates,
            )
            inserted += 1
    return inserted, updated, len(rows)


class CMMSShipDirectoryPullAPI(APIView):
    """STEP 0 -- Nomenclature Synchronization: Update Ship Names from CMMS.

    Pulls the fleet-wide M_Command and M_Ship masters (every ship CMMS knows about, not
    just the one this install is deployed on) so the Command / Ship Name dropdowns on the
    sync screen can be populated before a ship is ever selected. Run this only when the
    ship you need is missing from the Ship Name list -- it's a one-time directory pull,
    not a per-ship sync (that's CMMSFDDataAPI, Step 1, for whichever ship gets selected).
    """

    permission_classes = [CanInitialiseShipData]

    def post(self, request):
        return self._run()

    def get(self, request):
        return self._run()

    def _run(self):
        conn = None
        cursor = None
        try:
            conn = get_mssql_connection()
            cursor = conn.cursor()
            with transaction.atomic():
                cmd_inserted, cmd_updated, cmd_total = cmms_pull_all_commands(cursor)
                ship_inserted, ship_updated, ship_total = cmms_pull_all_ships(cursor)
            return Response(
                {
                    "status": True,
                    "message": (
                        f"Pulled {cmd_total} commands ({cmd_inserted} new, {cmd_updated} "
                        f"updated) and {ship_total} ships ({ship_inserted} new, "
                        f"{ship_updated} updated) from CMMS."
                    ),
                    "commands": {
                        "total": cmd_total,
                        "inserted": cmd_inserted,
                        "updated": cmd_updated,
                    },
                    "ships": {
                        "total": ship_total,
                        "inserted": ship_inserted,
                        "updated": ship_updated,
                    },
                }
            )
        except Exception as exc:
            logger.exception("CMMS ship directory pull failed")
            return Response(
                {
                    "status": False,
                    "message": f"CMMS ship directory pull failed: {exc}",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()


def _apply_proposed_changes(ship_equipment, proposed_changes):
    """Applies a staged CAT1/2/3 update's `proposed_changes` dict (see `_update_sfd_transaction`
    in sfd/source_contract.py) onto `ship_equipment` once CMMS approves the linked change
    request. Values were JSON-serialized by `_serialize_field_value` at staging time (FK -> pk,
    date/datetime -> isoformat string, Decimal -> str) so relation/date fields need resolving
    back; everything else is used as-is.
    """
    for field_name, value in (proposed_changes or {}).items():
        try:
            field = ShipEquipment._meta.get_field(field_name)
        except Exception:
            continue
        resolved_value = value
        if value is not None:
            if field.is_relation and getattr(field, "related_model", None) is not None:
                resolved_value = field.related_model.objects.filter(pk=value).first()
            elif isinstance(field, DateTimeField):
                resolved_value = (
                    parse_datetime(value) if isinstance(value, str) else value
                )
            elif isinstance(field, DateField):
                resolved_value = parse_date(value) if isinstance(value, str) else value
        setattr(ship_equipment, field_name, resolved_value)
    ship_equipment.save()


@ledgered("pull", "change_requests",
          adapter=tuple_stats("inserted", "updated", "skipped", "total"))
def cmms_pull_change_requests(cursor):
    """CMMS T_SFDChangeRequest -> local sfd.EquipmentChangeRequest (the read-back half of
    _push_change_request_to_cmms in sfd/source_contract.py). Matched on
    universal_id_t_sfd_change_request, the same UID column both push and pull use, so a row
    this app already pushed just gets harmlessly re-matched and updated here, never
    duplicated. Rows whose Universal_ID_T_EquipmentShipDetail has no matching local
    ShipEquipment are skipped -- there's nothing local yet to attach the request to (run
    Step 1 first).

    Also applies CMMS-side approval/rejection: `ApprovedBy` not null means approved -- any
    staged `proposed_changes` get applied onto the linked ShipEquipment (_apply_proposed_changes)
    and its `status` flips to "active". `Active` explicitly false/0 (with `ApprovedBy` still
    null) is the only available CMMS-side rejection signal on this table (no explicit reject
    column) -- flips `status` to "3". Deliberately no longer filters out `Active = 0` rows in
    the SELECT (unlike the original mirror-only version) since those are exactly the rejected
    rows this apply logic needs to see. Returns (inserted, updated, skipped, total).
    """
    cursor.execute("SELECT * FROM T_SFDChangeRequest WITH (NOLOCK)")
    columns = [column[0] for column in cursor.description]
    rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    inserted = updated = skipped = 0
    for row in rows:
        uid = row.get("Universal_ID_T_SFDChangeRequest")
        equipment_uid = row.get("Universal_ID_T_EquipmentShipDetail")
        ship_equipment = (
            ShipEquipment.objects.filter(
                universal_id_t_equipment_ship_detail=equipment_uid
            ).first()
            if equipment_uid
            else None
        )
        if not uid or not ship_equipment:
            skipped += 1
            continue

        change_request, created = ChangeEquipmentRequest.objects.update_or_create(
            universal_id_t_sfd_change_request=uid,
            defaults={
                "equipment": ship_equipment.equipment or Equipment.objects.first(),
                "ship_equipment": ship_equipment,
                "new_serial": row.get("Model") or "",
                "is_synced": 1,
                "universal_id_a_user_created_by": row.get(
                    "Universal_ID_A_User_Created_By"
                ),
            },
        )
        if created:
            inserted += 1
        else:
            updated += 1

        approved_by = row.get("ApprovedBy")
        cmms_active = row.get("Active")
        if approved_by is not None:
            if change_request.proposed_changes:
                try:
                    _apply_proposed_changes(
                        ship_equipment, change_request.proposed_changes
                    )
                except Exception:
                    logger.exception(
                        "Failed to apply proposed_changes for change request %s onto "
                        "ShipEquipment %s.",
                        uid,
                        ship_equipment.pk,
                    )
            ship_equipment.status = "active"
            ship_equipment.save(update_fields=["status"])
            change_request.proposed_changes = None
            change_request.approved_reject = 1
            change_request.save(
                update_fields=["proposed_changes", "approved_reject", "updated_at"]
            )
        elif cmms_active is not None and not cmms_active:
            # Explicit Active=0/False with no ApprovedBy -- rejection. Null ApprovedBy with
            # Active still truthy is the normal "still pending" state and must NOT be treated
            # as rejected.
            change_request.approved_reject = 3
            change_request.save(update_fields=["approved_reject", "updated_at"])
            ship_equipment.status = "3"
            ship_equipment.save(update_fields=["status"])
    return inserted, updated, skipped, len(rows)


@ledgered("pull", "remove_requests",
          adapter=tuple_stats("inserted", "updated", "skipped", "total"))
def cmms_pull_remove_requests(cursor):
    """CMMS Ch_SFD_Remove_Equipment_Request -> local sfd.RemoveEquipment (the read-back half
    of _push_remove_request_to_cmms). Matched on
    universal_id_ch_sfd_remove_equipment_request, same reasoning as
    cmms_pull_change_requests.

    Also applies CMMS-side approval/rejection via `Approved_Reject`: 1 = approved (flips the
    linked ShipEquipment's `active` to False, sets `removal_date` if not already set, clears
    `proposed_changes`); 3 = rejected (no change to ShipEquipment); None/2 = still pending, no
    change. `status` is untouched by this path -- it's the adds/updates signal, `active` is
    what gates removal. No longer filters `Active = 1 OR Active IS NULL` in the SELECT so a
    CMMS-side-deactivated row (if that ever accompanies rejection) still comes through.
    Returns (inserted, updated, skipped, total).
    """
    cursor.execute("SELECT * FROM Ch_SFD_Remove_Equipment_Request WITH (NOLOCK)")
    columns = [column[0] for column in cursor.description]
    rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    inserted = updated = skipped = 0
    for row in rows:
        uid = row.get("Universal_ID_Ch_SFD_Remove_Equipment_Request")
        equipment_uid = row.get("Universal_ID_T_EquipmentShipDetail")
        ship_equipment = (
            ShipEquipment.objects.filter(
                universal_id_t_equipment_ship_detail=equipment_uid
            ).first()
            if equipment_uid
            else None
        )
        if not uid or not ship_equipment:
            skipped += 1
            continue

        rh_raw = row.get("RH_Of_New_Equipemnt_At_Time_Of_Installation")
        try:
            rh_value = int(rh_raw) if rh_raw not in (None, "") else None
        except (TypeError, ValueError):
            rh_value = None

        remove_request, created = RemoveEquipment.objects.update_or_create(
            universal_id_ch_sfd_remove_equipment_request=uid,
            defaults={
                "equipment": ship_equipment.equipment or Equipment.objects.first(),
                "ship_equipment": ship_equipment,
                "removal_remark": row.get("Removal_Remark") or "",
                "removal_date": row.get("Removal_Date"),
                "authority_of_removal": row.get("Authority_Of_Removal"),
                "equipment_serial_no": row.get("Equipment_Serial_No"),
                "request_type": row.get("Request_Type"),
                "installation_date": row.get("InstallationDate"),
                "installation_remark": row.get("InstallationRemark") or "",
                "rh_of_new_equipment_at_time_of_installation": rh_value,
                "is_synced": 1,
            },
        )
        if created:
            inserted += 1
        else:
            updated += 1

        approved_reject = row.get("Approved_Reject")
        if approved_reject == 1:
            update_fields = ["active"]
            ship_equipment.active = False
            if not ship_equipment.removal_date:
                ship_equipment.removal_date = row.get("Removal_Date")
                update_fields.append("removal_date")
            ship_equipment.save(update_fields=update_fields)
            remove_request.proposed_changes = None
            remove_request.approved_reject = 1
            remove_request.save(
                update_fields=["proposed_changes", "approved_reject", "updated_at"]
            )
        elif approved_reject == 3:
            remove_request.approved_reject = 3
            remove_request.save(update_fields=["approved_reject", "updated_at"])
        # None/2 -- still Pending, no change.
    return inserted, updated, skipped, len(rows)


@ledgered("pull", "equipment_status",
          adapter=tuple_stats("updated", "total"))
def cmms_refresh_equipment_status(cursor):
    """T_EquipmentShipDetail.Status/Active -> local ShipEquipment.status/active, for every
    equipment this ship holds a CMMS uid for -- the read-back half of
    `_push_equipment_to_cmms` (sfd/source_contract.py), which pushes new equipment with CMMS
    `Status` left null.

    Two populations, deliberately read by different rules:

    - Awaiting review (local status "2" submitted, or "3" rejected). CMMS `Status`:
      1 = approved (-> local "active"), 3 = rejected (-> "3"), 2/None = review unfinished
      (-> stays "2"). This is the original behaviour and the only one this function used to
      cover, which is why an approval that CMMS later revoked was invisible: once a row went
      "active" it left the queryset for good.
    - Already approved (local status "active"). Only an explicit CMMS signal is acted on --
      `Status` 3 (rejected) or `Active` 0 (deactivated). A null `Status` here means nothing:
      CMMS leaves it null on plenty of long-approved rows, so reading "not 1" as "under
      review" the way the first branch does would drive the entire active fleet back to "2".

    Also mirrors CMMS's `INSMAREMARKS` onto `ShipEquipment.insma_remarks` when present.
    Returns (updated_count, total_checked).
    """
    pending = list(
        ShipEquipment.objects.filter(Q(active=True) | Q(status__in=["2", "3"]))
        .exclude(universal_id_t_equipment_ship_detail__isnull=True)
        .exclude(universal_id_t_equipment_ship_detail="")
        .values_list("id", "universal_id_t_equipment_ship_detail", "status")
    )
    if not pending:
        return 0, 0

    local_by_uid = {uid: (pk, local_status) for pk, uid, local_status in pending}
    uids = list(local_by_uid.keys())

    # Active is read through cmms_optional_column because not every CMMS deployment's
    # T_EquipmentShipDetail carries it, and MSSQL rejects the whole statement on the first
    # unknown column. Where it is absent the alias resolves to NULL, which the loop below
    # treats as "no deactivation signal" rather than as a deactivation.
    active_column = cmms_optional_column(cursor, "T_EquipmentShipDetail", "Active")

    cmms_rows = {}
    batch_size = 1000
    for offset in range(0, len(uids), batch_size):
        batch = uids[offset : offset + batch_size]
        placeholders = ",".join(["?"] * len(batch))
        cursor.execute(
            f"""
            SELECT Universal_ID_T_EquipmentShipDetail, Status, INSMAREMARKS, {active_column}
            FROM T_EquipmentShipDetail WITH (NOLOCK)
            WHERE Universal_ID_T_EquipmentShipDetail IN ({placeholders})
            """,
            batch,
        )
        columns = [column[0] for column in cursor.description]
        for row in cursor.fetchall():
            row_dict = dict(zip(columns, row))
            cmms_rows[row_dict["Universal_ID_T_EquipmentShipDetail"]] = row_dict

    updated = 0
    for uid, (pk, local_status) in local_by_uid.items():
        cmms_row = cmms_rows.get(uid)
        if not cmms_row:
            continue
        cmms_status = cmms_row.get("Status")
        insma_remarks = cmms_row.get("INSMAREMARKS")

        if local_status in ("2", "3"):
            # Still awaiting CMMS review: unchanged from when this function only ever looked
            # at these rows. 1 = approved, 3 = rejected, 2/None = review not finished yet.
            if cmms_status == 1:
                new_status = "active"
            elif cmms_status == 3:
                new_status = "3"
            else:
                new_status = "2"
        else:
            # Already approved locally. CMMS leaves Status null on plenty of long-approved
            # equipment, so here "not 1" must NOT be read the way it is above -- doing that
            # would push every already-active row back to "2" (under review) on the first
            # sync after this filter widened. Only an explicit rejection counts.
            new_status = "3" if cmms_status == 3 else local_status

        ship_equipment = ShipEquipment.objects.filter(pk=pk).first()
        if not ship_equipment:
            continue
        status_changed = ship_equipment.status != new_status
        update_fields = []
        if status_changed:
            ship_equipment.status = new_status
            update_fields.append("status")
        if insma_remarks is not None and ship_equipment.insma_remarks != insma_remarks:
            ship_equipment.insma_remarks = insma_remarks
            update_fields.append("insma_remarks")
        # An explicit Active = 0 from CMMS is a deactivation, and is safe to act on here
        # because it is a value CMMS actually sent for this row -- unlike inferring removal
        # from a row's *absence*, which needs a known-complete pull to be sound and is
        # therefore left to the deactivation sweep. Never flips back to active: local
        # equipment can legitimately be raised in SWMM before CMMS knows about it.
        cmms_active = cmms_row.get("Active")
        if cmms_active is not None and not bool(cmms_active) and ship_equipment.active:
            ship_equipment.active = False
            update_fields.append("active")
        if update_fields:
            ship_equipment.save(update_fields=update_fields)
            updated += 1

        # Keep "Approval Tracking" (which reads ChangeEquipmentRequest/RemoveEquipment.
        # approved_reject, not ShipEquipment.status) in sync with whatever CMMS approval channel
        # the INSMA officer actually used. cmms_pull_change_requests (above, same sync pass)
        # already handles the case where CMMS's own T_SFDChangeRequest.ApprovedBy/Active was set
        # (the dedicated "SFD Change Request" approval screen) — but an officer approving/
        # rejecting straight off T_EquipmentShipDetail.Status (the plain Equipment record) instead,
        # which is exactly what this function tracks, never touches that other table at all, so
        # the linked ChangeEquipmentRequest/RemoveEquipment silently stayed stuck on "Pending"
        # (approved_reject=2) forever — the record's real status flipped locally (this function
        # already did that above), but Approval Tracking never reflected it. Only steps in when
        # this function is the one that just detected the real transition (new_status
        # active/rejected) AND the linked approval row is still genuinely Pending — never
        # overwrites one cmms_pull_change_requests/an operator resubmit already resolved.
        if status_changed and new_status in ("active", "3"):
            resolved = 1 if new_status == "active" else 3
            ChangeEquipmentRequest.objects.filter(
                ship_equipment=ship_equipment, approved_reject=2
            ).update(approved_reject=resolved)
            RemoveEquipment.objects.filter(
                ship_equipment=ship_equipment, approved_reject=2
            ).update(approved_reject=resolved)
    return updated, len(pending)


class CMMSSfdRequestPullAPI(APIView):
    """Pulls CMMS's own T_SFDChangeRequest / Ch_SFD_Remove_Equipment_Request rows (raised
    directly in CMMS, not through this app) into local EquipmentChangeRequest /
    RemoveEquipment -- the read-back half of the bidirectional sync
    _push_change_request_to_cmms / _push_remove_request_to_cmms already provide the other
    way (sfd/source_contract.py). Safe to re-run: matched on the shared UID column both push
    and pull use, so rows this app already pushed just get re-matched and updated, never
    duplicated.
    """

    def post(self, request):
        return self._run()

    def get(self, request):
        return self._run()

    def _run(self):
        conn = None
        cursor = None
        try:
            conn = get_mssql_connection()
            cursor = conn.cursor()
            with transaction.atomic():
                cr_inserted, cr_updated, cr_skipped, cr_total = (
                    cmms_pull_change_requests(cursor)
                )
                rr_inserted, rr_updated, rr_skipped, rr_total = (
                    cmms_pull_remove_requests(cursor)
                )
                eq_updated, eq_total = cmms_refresh_equipment_status(cursor)
            return Response(
                {
                    "status": True,
                    "message": (
                        f"Pulled {cr_total} change requests ({cr_inserted} new, "
                        f"{cr_updated} updated, {cr_skipped} skipped), {rr_total} "
                        f"removal requests ({rr_inserted} new, {rr_updated} updated, "
                        f"{rr_skipped} skipped), and refreshed {eq_updated}/{eq_total} "
                        f"pending equipment statuses from CMMS."
                    ),
                    "change_requests": {
                        "total": cr_total,
                        "inserted": cr_inserted,
                        "updated": cr_updated,
                        "skipped": cr_skipped,
                    },
                    "removal_requests": {
                        "total": rr_total,
                        "inserted": rr_inserted,
                        "updated": rr_updated,
                        "skipped": rr_skipped,
                    },
                    "equipment_status": {
                        "total_checked": eq_total,
                        "updated": eq_updated,
                    },
                }
            )
        except Exception as exc:
            logger.exception("CMMS SFD request pull failed")
            return Response(
                {
                    "status": False,
                    "message": f"CMMS SFD request pull failed: {exc}",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()


def _serialize_selected_ship(ship_obj):
    if not ship_obj:
        return None
    return {
        "id": ship_obj.id,
        "universal_id_m_ship": ship_obj.universal_id_m_ship,
        "name": ship_obj.name,
        "code": ship_obj.code,
        "universal_id_m_command": ship_obj.universal_id_m_command,
    }


class ShipDirectoryOptionsAPI(APIView):
    """Local Command + Ship lists for the Step 0 dropdowns, plus the current selection.

    Ships carry `universal_id_m_command` so the frontend can filter the Ship Name
    dropdown by the chosen Command entirely client-side (both lists are small, fleet-wide
    masters -- no round trip needed per command change).
    """

    def get(self, request):
        commands = list(
            MShipCommand.objects.exclude(command_name__isnull=True)
            .exclude(command_name="")
            .order_by("command_name")
            .values(
                "command_id", "universal_id_m_command", "command_name", "command_code"
            )
        )
        ships = list(
            Ship.objects.exclude(universal_id_m_ship__isnull=True)
            .exclude(universal_id_m_ship="")
            .exclude(name__isnull=True)
            .exclude(name="")
            .order_by("name")
            .values(
                "id", "universal_id_m_ship", "name", "code", "universal_id_m_command"
            )
        )
        return Response(
            {
                "commands": commands,
                "ships": ships,
                "selected_ship": _serialize_selected_ship(
                    ActiveShipConfig.get_selected_ship()
                ),
            }
        )


class SelectActiveShipAPI(APIView):
    """Persists the operator's Step 0 ship choice -- see master.models.ActiveShipConfig.

    Once set, every CMMS sync in this codebase resolves its ship from here instead of the
    .env SWMM_SHIP_CODE (see env_ship_code, master.utils.get_this_ship,
    sfd.utils.get_this_ship) -- a one-time entry instead of an edit-and-redeploy per hull.

    Deliberately one-shot: once a ship is selected it cannot be swapped out through this
    endpoint again. The frontend confirms with the operator before the first call ever
    reaches here, but this check is what actually makes the choice permanent -- a stale
    page or a direct API call can't quietly re-point every downstream sync at another hull.
    """

    permission_classes = [CanInitialiseShipData]

    def post(self, request):
        already_selected = ActiveShipConfig.get_selected_ship()
        if already_selected:
            return Response(
                {
                    "status": False,
                    "message": (
                        f"Active ship is already set to '{already_selected.name}' and "
                        "cannot be changed."
                    ),
                    "selected_ship": _serialize_selected_ship(already_selected),
                },
                status=status.HTTP_409_CONFLICT,
            )

        ship_uid = (request.data.get("universal_id_m_ship") or "").strip()
        ship_id = request.data.get("ship_id")

        ship_obj = None
        if ship_uid:
            ship_obj = Ship.objects.filter(universal_id_m_ship=ship_uid).first()
        if ship_obj is None and ship_id:
            ship_obj = Ship.objects.filter(pk=ship_id).first()

        if ship_obj is None:
            return Response(
                {
                    "status": False,
                    "message": (
                        "Ship not found. Run Step 0 - Update Ship Names from CMMS if "
                        "it's missing from the list."
                    ),
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        ActiveShipConfig.set_selected_ship(ship_obj)
        return Response(
            {
                "status": True,
                "message": f"Active ship set to '{ship_obj.name}'.",
                "selected_ship": _serialize_selected_ship(ship_obj),
            }
        )


class SyncProgressAPIView(APIView):
    """Durable record of which of the 5 Nomenclature Synchronization steps have run.

    The frontend's own step-completion tracking lives in a browser-side signal, which a
    full page refresh wipes — every step but Step 0 (ship selection, already persisted via
    ActiveShipConfig) then looks locked again, forcing the operator to re-click through
    steps they'd already completed. GET lets the page hydrate that state back on load;
    POST is called once a step's stream finishes so the next refresh already knows.
    """

    def get(self, request):
        return Response({"completed_steps": ActiveShipConfig.get_completed_steps()})

    def post(self, request):
        step_key = (request.data.get("step") or "").strip()
        if not step_key:
            return Response(
                {"status": False, "message": "step is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        completed = ActiveShipConfig.mark_step_completed(step_key)
        return Response({"status": True, "completed_steps": completed})


def _sub_department_readiness():
    """(unassigned_total, by_department) — how many Active equipment still have no
    sub_department_f_key, ship-wide. Shared by SubDepartmentReadinessAPIView (the
    read-only check the frontend polls) and CMMSMaintopSyncAPI (the server-side gate
    that actually enforces it), so the two can never disagree about what "ready" means.
    """
    pending = ShipEquipment.objects.filter(
        active=True, sub_department_f_key__isnull=True
    )
    by_department = [
        {
            "department": row["department__name"] or "Unassigned",
            "unassigned": row["total"],
        }
        for row in (
            pending.values("department__name")
            .annotate(total=Count("id"))
            .order_by("department__name")
        )
    ]
    return pending.count(), by_department


class SubDepartmentReadinessAPIView(APIView):
    """Read-only gate for Step 2 (CMMS MAINTOPS Sync) on the Nomenclature Synchronization
    screen — CMMS only supplies `sub_department_f_key` for some of the equipment Step 1
    (CMMSFDDataAPI) pulls in, leaving the rest blank, so this reports how many Active
    equipment still have none before the frontend lets Step 2 run. Assigning the missing
    ones is a manual step done from the SFD Management screen's own edit form (Sub
    Department is already an editable field there); this endpoint only ever reads.
    """

    def get(self, request):
        try:
            unassigned_total, by_department = _sub_department_readiness()
        except Exception:
            logger.exception("SubDepartmentReadinessAPIView failed")
            # A gate that opens when it cannot answer is not a gate — report NOT ready
            # rather than letting an unhandled 500 leave the frontend's own catch()
            # guessing at the response shape.
            return Response(
                {
                    "status": False,
                    "ready": False,
                    "unassigned_total": None,
                    "by_department": [],
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(
            {
                "status": True,
                "ready": unassigned_total == 0,
                "unassigned_total": unassigned_total,
                "by_department": by_department,
            }
        )


# CMMS Universal_ID_M_Department -> SWMM sub department name, for the two CMMS departments that
# aren't real SWMM departments at all: CMMS keeps HULL ("1") and NBCD ("4") as departments of
# their own, but SWMM has always held them as sub departments of "Executive" (confirmed against
# both M_Department, which lists exactly these 4 rows for this CMMS instance, and the reference
# project's own identical CMMS_DEPARTMENT_MAP). "2"/"3" (ENGINEERING/ELECTRICAL) are deliberately
# absent — those map onto SWMM departments of the same name with no sub department forced on them.
CMMS_DEPARTMENT_REMAP = {
    "1": "HULL",
    "4": "NBCD",
}


class CMMSFDDataAPI(APIView):
    pagination_class = CommonPagination
    permission_classes = [CanInitialiseShipData]

    # Module name this step's resume checkpoints are filed under.
    RESUME_MODULE = "step1_sfd"

    def _env_ship_identifier(self):
        return env_ship_code()

    def _fetch_target_ship(self, cursor, ship_identifier):
        ilms_customer_code = cmms_optional_column(cursor, "M_Ship", "ILMSCustomerCode")
        query = f"""
            SELECT
                M_Ship.Universal_ID_M_Ship,
                M_Ship.ShipName,
                M_Ship.ShipCode,
                M_Ship.ShipSrNo,
                M_Ship.SFDHierarchyID,
                M_Ship.ShipCategoryID,
                M_ShipCategory.ShipCategoryName,
                M_Ship.ClassID,
                M_Ship.ClassCode,
                M_ShipClass.Description AS ClassDescription,
                M_Ship.CommissionDate,
                M_Ship.CommandID,
                M_Command.CommandName,
                M_Ship.AuthorityID,
                M_OpsAuthority.OpsAuthority AS AuthorityName,
                M_Ship.OpsCode,
                M_Ship.ShipBuilder,
                M_Ship.DecommissionDate,
                M_Ship.Displacement,
                M_Ship.HoursUnderway,
                M_Ship.DistanceRun,
                M_Ship.DecommissionScheduledDate,
                M_Ship.PropulsionID,
                M_Propulsion.PropulsionName,
                M_Ship.SDRSREF,
                M_Ship.Active AS ShipActive,
                M_Ship.CreatedBy AS ShipCreatedBy,
                M_Ship.CreatedDate AS ShipCreatedDate,
                M_Ship.UpdatedBy AS ShipUpdatedBy,
                M_Ship.UpdatedDate AS ShipUpdatedDate,
                M_Ship.YardNo,
                M_Ship.ReferenceNo,
                M_Ship.ClassificationSociety,
                M_Ship.LengthOverall,
                M_Ship.LengthPerpen,
                M_Ship.ModuleBreadth,
                M_Ship.WettedUnderWater,
                M_Ship.DepthMain,
                M_Ship.StandardDisp,
                M_Ship.FullLoadDisp,
                M_Ship.StandDraft,
                M_Ship.FullloadDraft,
                M_Ship.WettedBootTop,
                M_Ship.Enginerating,
                M_Ship.MaxContSpeed,
                M_Ship.EcoSpeed,
                M_Ship.Endurance,
                M_Ship.Remark AS ShipRemark,
                M_Ship.Universal_ID_M_ShipCategory,
                M_Ship.Universal_ID_M_ShipClass,
                M_Ship.Universal_ID_M_Command,
                M_Ship.Universal_ID_M_OpsAuthority,
                M_Ship.Universal_ID_M_Propulsion,
                M_Ship.Universal_ID_A_User_Created_By AS ShipCreatedByUid,
                M_Ship.Universal_ID_A_User_Updated_By AS ShipUpdatedByUid,
                M_Ship.Refit_Authority,
                M_Ship.Signal_Name,
                M_Ship.Address,
                M_Ship.Contact_Number AS ShipContactNumber,
                M_Ship.NUD_Email_ID,
                M_Ship.NIC_Email_ID,
                M_Ship.Universal_ID_M_Overseeing_Team,
                M_Ship.IsCMMSInstall,
                M_Ship.IsInGD,
                M_Ship.Universal_ID_M_ShipUnitCategory,
                {ilms_customer_code}
            FROM M_Ship
            LEFT JOIN M_ShipCategory
                ON M_Ship.ShipCategoryID = M_ShipCategory.ShipCategoryID
            LEFT JOIN M_ShipClass
                ON M_Ship.ClassID = M_ShipClass.ClassID
            LEFT JOIN M_Command
                ON M_Ship.CommandID = M_Command.CommandID
            LEFT JOIN M_OpsAuthority
                ON M_Ship.AuthorityID = M_OpsAuthority.AuthorityID
            LEFT JOIN M_Propulsion
                ON M_Ship.PropulsionID = M_Propulsion.PropulsionID
            WHERE
                LOWER(CAST(M_Ship.ShipCode AS VARCHAR(255))) = LOWER(?)
                OR LOWER(CAST(M_Ship.Universal_ID_M_Ship AS VARCHAR(255))) = LOWER(?)
                OR LOWER(CAST(M_Ship.ShipName AS VARCHAR(255))) = LOWER(?)
        """
        cursor.execute(query, [ship_identifier, ship_identifier, ship_identifier])
        columns = [column[0] for column in cursor.description]
        rows = cursor.fetchall()
        if not rows:
            # No arbitrary-ship fallback on purpose — see resolve_cmms_ship_uid().
            return None
        return dict(zip(columns, rows[0]))

    def _fetch_ship_equipment_rows(self, cursor, ship_uid):
        ilms_equipment_code = cmms_optional_column(
            cursor, "M_Equipment", "ILMSEquipmentCode"
        )
        query = f"""
            SELECT
                M_Ship.Universal_ID_M_Ship,
                M_Ship.ShipName,
                M_Ship.ShipCode,

                M_Department.Universal_ID_M_Department,
                M_Department.Description AS DeptName,
                M_Department.DeptCode,
                M_Department.SFDApplicable,

                M_SubDepartment.Universal_ID_M_SubDepartment,
                M_SubDepartment.Description AS SubDeptName,

                M_Equipment.Universal_ID_M_Equipment,
                M_Equipment.EquipmentCode,
                M_Equipment.EquipmentName,
                M_Equipment.EquipmentModel,
                M_Equipment.Universal_ID_T_MaintopHeader,
                M_Equipment.MaintopNumber,
                M_Equipment.ManufacturerName,
                M_Equipment.authority,
                M_Equipment.obsolete,
                M_Equipment.AcquaintIssued,
                {ilms_equipment_code},
                M_Equipment.CountryID AS EquipmentCountryID,
                EquipmentCountry.CountryCode AS EquipmentCountryCode,
                EquipmentCountry.CountryName AS EquipmentCountryName,
                M_Equipment.GroupID AS EquipmentGroupID,
                M_Equipment.GroupCode AS EquipmentGroupCode,
                M_Equipment.GenericSrNo AS EquipmentGenericSrNo,

                M_Supplier.SupplierID,
                M_Supplier.SupplierCode,
                M_Supplier.Universal_ID_M_Supplier,
                M_Supplier.SupplierName,
                M_Supplier.SupplierManufacturer,
                M_Supplier.Active AS SupplierActive,
                M_Supplier.Address,
                M_Supplier.AreaStreet,
                M_Supplier.City,
                M_Supplier.CountryCode,
                M_Supplier.CountryID,
                M_Supplier.Universal_ID_M_Country,
                M_Supplier.Contact_Person,
                M_Supplier.Contact_Number,
                M_Supplier.Email_ID,
                M_Country.CountryName,

                T_EquipmentShipDetail.Universal_ID_T_EquipmentShipDetail,
                T_EquipmentShipDetail.Universal_ID_M_Department
                    AS DetailUniversal_ID_M_Department,
                T_EquipmentShipDetail.Universal_ID_M_SubDepartment
                    AS DetailUniversal_ID_M_SubDepartment,
                T_EquipmentShipDetail.Universal_ID_Ch_Master_Equipment_Type,
                M_Equipment.Universal_ID_Ch_Master_Equipment_Type
                    AS EquipmentChMasterEquipmentType,
                T_EquipmentShipDetail.Nomenclature,
                T_EquipmentShipDetail.InstallationDate,
                T_EquipmentShipDetail.EquipmentSrNo,
                T_EquipmentShipDetail.LocationOnBoard,
                T_EquipmentShipDetail.LocationCode,
                T_EquipmentShipDetail.SRARApplicable,
                T_EquipmentShipDetail.Authority_of_Installation,
                T_EquipmentShipDetail.NoOfFits AS Quantity,
                T_EquipmentShipDetail.RemovalDate,
                T_EquipmentShipDetail.OEMPartNo,
                T_EquipmentShipDetail.Remark AS DetailRemark,
                T_EquipmentShipDetail.MaintopID,
                T_EquipmentShipDetail.ServiceLife,
                T_EquipmentShipDetail.Status AS DetailStatus,
                T_EquipmentShipDetail.Universal_ID_M_SrarType,
                T_EquipmentShipDetail.Universal_ID_M_Supplier_Manufacturer,
                T_EquipmentShipDetail.Universal_ID_M_Equipment_ParentEquipment,
                T_EquipmentShipDetail.Removal_Remark,
                T_EquipmentShipDetail.Authority_Of_Removal,
                T_EquipmentShipDetail.RH_Of_New_Equipemnt_At_Time_Of_Installation,
                T_EquipmentShipDetail.INSMAREMARKS,
                T_EquipmentShipDetail.IsSynced AS DetailIsSynced,

                ManufacturerSupplier.Universal_ID_M_Supplier AS ManufacturerUid,
                ManufacturerSupplier.SupplierCode AS ManufacturerSupplierCode,
                ManufacturerSupplier.SupplierName AS ManufacturerSupplierName,
                ManufacturerSupplier.SupplierManufacturer
                    AS ManufacturerSupplierManufacturer,
                ManufacturerSupplier.Active AS ManufacturerSupplierActive
            FROM T_EquipmentShipDetail
            INNER JOIN M_Ship
                ON T_EquipmentShipDetail.Universal_ID_M_Ship =
                   M_Ship.Universal_ID_M_Ship
            -- INNER, not LEFT — matches the reference project's own fetch_sfd_from_cmms exactly.
            -- Equipment whose CMMS-side department reference doesn't resolve to a real M_Department
            -- row is excluded from the sync at the SQL level, the same way the reference's SELECT
            -- does it, instead of coming through with department=None and landing on SWMM's side
            -- as ShipEquipment with no department at all — a state the RHSI Master / Sub-Department
            -- readiness gate then has no clean way to resolve (a sub department can't be assigned
            -- without a parent department to scope it to), which the reference's INNER JOIN simply
            -- never lets happen in the first place.
            INNER JOIN M_Department
                ON T_EquipmentShipDetail.Universal_ID_M_Department =
                   M_Department.Universal_ID_M_Department
            LEFT JOIN M_SubDepartment
                ON T_EquipmentShipDetail.Universal_ID_M_SubDepartment =
                   M_SubDepartment.Universal_ID_M_SubDepartment
            LEFT JOIN M_Equipment
                ON T_EquipmentShipDetail.Universal_ID_M_Equipment =
                   M_Equipment.Universal_ID_M_Equipment
            LEFT JOIN M_Supplier
                ON T_EquipmentShipDetail.SupplierID = M_Supplier.SupplierID
            LEFT JOIN M_Country
                ON M_Supplier.CountryID = M_Country.CountryID
            LEFT JOIN M_Country AS EquipmentCountry
                ON M_Equipment.CountryID = EquipmentCountry.CountryID
            OUTER APPLY (
                SELECT TOP 1 T_EquipmentSupplier.Universal_ID_M_Supplier
                FROM T_EquipmentSupplier
                WHERE T_EquipmentSupplier.Universal_ID_M_Equipment =
                          M_Equipment.Universal_ID_M_Equipment
                    AND T_EquipmentSupplier.Active = 1
                    AND T_EquipmentSupplier.SupplierManufacturer = 2
                ORDER BY T_EquipmentSupplier.EquipmentSupplierID DESC
            ) AS ManufacturerLink(Universal_ID_M_Supplier)
            LEFT JOIN M_Supplier AS ManufacturerSupplier
                ON ManufacturerLink.Universal_ID_M_Supplier =
                   ManufacturerSupplier.Universal_ID_M_Supplier
            WHERE
                T_EquipmentShipDetail.Active = 1
                AND T_EquipmentShipDetail.RemovalDate IS NULL
                AND M_Ship.Universal_ID_M_Ship = ?
        """
        cursor.execute(query, [ship_uid])
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]

    def _resolve_or_adopt_department(
        self, dept_uid, dept_name, dept_code_raw, extra_defaults=None
    ):
        """Finds (or creates) the Department a CMMS row names — same uid-then-name
        adoption ladder as _resolve_or_adopt_subdepartment, for the same reason: a plain
        `update_or_create(universal_id_m_department=dept_uid, ...)` never matched an
        existing SWMM-seeded Department of the same name (seed_all.py's rows carry no
        CMMS uid at all), so the very first sync after a fresh seed created a second
        "ELECTRICAL"/"ENGINEERING"/... row alongside the seeded one instead of
        recognising it — the exact bug a one-off merge script only patched the data for,
        not the code, so it silently came back after the next DB reset + reseed + sync.

        1. Match by CMMS uid first — a name/code change in CMMS updates the existing
           row in place.
        2. No uid match: adopt an existing (typically SWMM-seeded) row of the same name
           (exact, then normalised — case/space/punctuation-insensitive) by stamping the
           CMMS uid onto it, rather than creating a duplicate.
        3. Only creates a new row when nothing local matches at all.

        Never deletes anything, for the same reason _resolve_or_adopt_subdepartment
        doesn't. Returns `(department, created)`.
        """
        defaults = {
            "name": dept_name,
            "code": (dept_code_raw or dept_name)[:250],
            "dep_code": dept_code_raw or None,
            "description": dept_name,
        }
        if extra_defaults:
            defaults.update(extra_defaults)

        existing = Department.objects.filter(universal_id_m_department=dept_uid).first()
        if existing:
            Department.objects.filter(pk=existing.pk).update(**defaults)
            existing.refresh_from_db()
            self._absorb_seeded_department_twins(existing)
            return existing, False

        adopted = Department.objects.filter(name=dept_name).first()
        if not adopted:
            wanted_key = _normalized_sub_dept_name(dept_name)
            if wanted_key:
                for candidate in Department.objects.all():
                    if _normalized_sub_dept_name(candidate.name) == wanted_key:
                        adopted = candidate
                        break

        if adopted:
            Department.objects.filter(pk=adopted.pk).update(
                universal_id_m_department=dept_uid, **defaults
            )
            adopted.refresh_from_db()
            self._absorb_seeded_department_twins(adopted)
            return adopted, False

        created_obj = Department.objects.create(
            universal_id_m_department=dept_uid, **defaults
        )
        # A brand-new CMMS department can still land beside a seeded twin whose name the
        # adoption ladder above did not match (a twin created after the last sync, or one
        # the normaliser reads differently).
        self._absorb_seeded_department_twins(created_obj)
        return created_obj, True

    def _absorb_seeded_department_twins(self, survivor):
        """Fold every uid-less Department that duplicates `survivor` by name into it.

        The adoption ladder above only ever reaches one row per CMMS department: once
        `survivor` matches by uid, a SWMM-seeded twin of the same name is invisible to it
        and sits there for good. That is how this deployment ended up with "ENGINEERING"
        (code "ENGINEERING", no uid) beside CMMS's "ENGINEERING" (code "E", uid 2), and
        "Executive" beside "EXECUTIVE". Users pick a twin out of a dropdown that cannot
        tell them apart, and the DART they raise pushes a department CMMS can join to
        nothing — Department "AD"/ExDept "A"/DepartmentID 0 (see
        sfd.utils.resolve_cmms_department).

        Every reference is re-pointed onto the surviving CMMS row *before* the twin is
        deleted. Seven of the thirty FKs into Department cascade — deleting a twin
        outright would take its DARTs, sub departments and sections with it, the same
        class of accident that made _resolve_or_adopt_subdepartment refuse to delete at
        all — and nine more are PROTECT and would simply raise mid-import.

        Only uid-less rows are ever removed, so a department CMMS itself supplied is never
        a candidate no matter how its name is spelled. A twin whose references cannot be
        moved (a unique constraint already holding the same row against `survivor`) is
        left exactly where it is and logged: a half-merged department is worse than a
        duplicate one, and an import must not fail over this.

        Returns the number of twins absorbed.
        """
        wanted_key = _normalized_sub_dept_name(survivor.name)
        if not wanted_key:
            return 0

        twins = [
            row
            for row in Department.objects.filter(
                universal_id_m_department__isnull=True
            ).exclude(pk=survivor.pk)
            if _normalized_sub_dept_name(row.name) == wanted_key
        ]
        if not twins:
            return 0

        absorbed = 0
        for twin in twins:
            try:
                with transaction.atomic():
                    for rel in Department._meta.related_objects:
                        field_name = rel.field.name
                        # _base_manager, not .objects: several of these models default to
                        # a manager that hides soft-deleted rows, and a hidden row still
                        # holds the FK that would block or cascade the delete below.
                        manager = rel.related_model._base_manager
                        if rel.many_to_many:
                            for obj in manager.filter(**{field_name: twin}):
                                getattr(obj, field_name).remove(twin)
                                getattr(obj, field_name).add(survivor)
                            continue
                        manager.filter(**{field_name: twin}).update(
                            **{field_name: survivor}
                        )
                    twin.delete()
            except Exception:
                logger.exception(
                    "Could not fold seeded department %r (id=%s) into CMMS department "
                    "%r (id=%s) — left in place.",
                    twin.name,
                    twin.pk,
                    survivor.name,
                    survivor.pk,
                )
                continue
            logger.info(
                "Folded seeded department %r (id=%s, code=%r) into CMMS department "
                "%r (id=%s, code=%r).",
                twin.name,
                twin.pk,
                twin.code,
                survivor.name,
                survivor.pk,
                survivor.code,
            )
            absorbed += 1
        return absorbed

    def _resolve_or_adopt_subdepartment(
        self, dept_obj, subdept_uid, subdept_name, extra_defaults=None
    ):
        """Finds (or creates) the SubDepartment a CMMS row for `dept_obj` names —
        matching the reference project's own uid-then-name adoption ladder
        (SFD/views.py's inline sub-department resolution) instead of the plain
        `update_or_create(universal_id_m_sub_department=...)` this used to do, which
        created a second row alongside any SWMM-seeded one of the same name instead of
        recognising it.

        1. Match by CMMS uid first — a description renamed in CMMS updates the existing
           row in place.
        2. No uid match: adopt an existing SWMM-seeded row of the same name (exact, then
           normalised — case/space/punctuation-insensitive) under this department by
           stamping the CMMS uid onto it, rather than creating a duplicate.
        3. Only creates a new row when nothing local matches at all.

        Never deletes anything — the reference project tried unconditionally deleting a
        department's SWMM-seeded sub departments once CMMS supplied any of its own, and
        that silently removed an equipment-linked one ("FER" off ENGINEERING) as a side
        effect of an import. Returns `(subdepartment, created)`.
        """
        defaults = {
            "department_name": dept_obj,
            "name": subdept_name,
            "description": subdept_name,
        }
        if extra_defaults:
            defaults.update(extra_defaults)

        existing = SubDepartment.objects.filter(
            universal_id_m_sub_department=subdept_uid
        ).first()
        if existing:
            SubDepartment.objects.filter(pk=existing.pk).update(**defaults)
            return existing, False

        if dept_obj is None:
            return None, False

        adopted = SubDepartment.objects.filter(
            department_name=dept_obj, name=subdept_name
        ).first()
        if not adopted:
            wanted_key = _normalized_sub_dept_name(subdept_name)
            if wanted_key:
                for candidate in SubDepartment.objects.filter(department_name=dept_obj):
                    if _normalized_sub_dept_name(candidate.name) == wanted_key:
                        adopted = candidate
                        break

        if adopted:
            SubDepartment.objects.filter(pk=adopted.pk).update(
                universal_id_m_sub_department=subdept_uid, **defaults
            )
            return adopted, False

        created_obj = SubDepartment.objects.create(
            universal_id_m_sub_department=subdept_uid, **defaults
        )
        return created_obj, True

    def _leftover_seed_subdepartment_report(self, cmms_spoke_for_departments):
        """Reports (never deletes) SWMM-seeded sub departments still sitting in a
        department CMMS supplied at least one real sub department for this sync — see
        _resolve_or_adopt_subdepartment's doc for why this is report-only."""
        if not cmms_spoke_for_departments:
            return []
        leftovers = (
            SubDepartment.objects.filter(
                department_name_id__in=cmms_spoke_for_departments
            )
            .filter(
                Q(universal_id_m_sub_department__isnull=True)
                | Q(universal_id_m_sub_department="")
            )
            .select_related("department_name")
            .order_by("department_name__name", "name")
        )
        lines = []
        for seeded in leftovers:
            dept_label = seeded.department_name.name if seeded.department_name else "-"
            eq_refs = ShipEquipment.objects.filter(sub_department_f_key=seeded).count()
            lines.append(
                f"[SWMM SUBDEPT KEPT] {seeded.name} ({dept_label}) — {eq_refs} equipment, "
                f"not named by CMMS this sync — review at Reference Data > Sub Departments"
            )
        return lines

    def _resolve_ship_unit_type(self, ship_uid):
        existing_ship = Ship.objects.filter(universal_id_m_ship=ship_uid).first()
        if existing_ship and existing_ship.unit_type_id:
            return existing_ship.unit_type

        unit_type = UnitType.objects.order_by("id").first()
        if unit_type:
            return unit_type

        unit_type, _ = UnitType.objects.get_or_create(name="CMMS")
        return unit_type

    def _sync_rows_to_swmm(self, target_ship, rows):
        counts = {
            "ship": 0,
            "department": 0,
            "sub_department": 0,
            "section": 0,
            "equipment": 0,
            "equipment_type": 0,
            "supplier": 0,
            "ship_equipment": 0,
            "ems_equipment": 0,
            "master_manufacturer": 0,
            "master_equipment_type": 0,
            "master_equipment": 0,
            "master_supplier": 0,
        }

        ship_uid = target_ship.get("Universal_ID_M_Ship")
        ship_name = target_ship.get("ShipName") or ""
        ship_code = target_ship.get("ShipCode") or ""

        with transaction.atomic():
            unit_type = self._resolve_ship_unit_type(ship_uid)

            ship_category_obj = None
            ship_category_id = target_ship.get("ShipCategoryID")
            if ship_category_id is not None:
                ship_category_obj, _ = MShipCategory.objects.update_or_create(
                    ship_category_id=ship_category_id,
                    defaults={
                        "ship_category_name": target_ship.get("ShipCategoryName")
                        or None
                    },
                )

            propulsion_obj = None
            propulsion_id = target_ship.get("PropulsionID")
            if propulsion_id is not None:
                propulsion_obj, _ = MShipPropulsion.objects.update_or_create(
                    propulsion_id=propulsion_id,
                    defaults={
                        "propulsion_name": target_ship.get("PropulsionName") or None
                    },
                )

            class_master_obj = None
            class_id = target_ship.get("ClassID")
            if class_id is not None:
                class_master_obj, _ = MShipClass.objects.update_or_create(
                    class_id=class_id,
                    defaults={
                        "class_code": target_ship.get("ClassCode") or None,
                        "description": target_ship.get("ClassDescription") or None,
                    },
                )

            command_obj = None
            command_id = target_ship.get("CommandID")
            if command_id is not None:
                command_obj, _ = MShipCommand.objects.update_or_create(
                    command_id=command_id,
                    defaults={"command_name": target_ship.get("CommandName") or None},
                )

            ops_authority_obj = None
            authority_id = target_ship.get("AuthorityID")
            if authority_id is not None:
                ops_authority_obj, _ = MShipOpsAuthority.objects.update_or_create(
                    authority_id=authority_id,
                    defaults={
                        "ops_authority": target_ship.get("AuthorityName") or None,
                        "command": command_obj,
                    },
                )

            def _str_or_none(value):
                return str(value) if value not in (None, "") else None

            def _bool_or_none(value):
                return bool(value) if value is not None else None

            ship_obj, created = Ship.objects.update_or_create(
                universal_id_m_ship=ship_uid,
                defaults={
                    "name": ship_name,
                    "code": ship_code,
                    "unit_type": unit_type,
                    "unit_type_string": unit_type.name,
                    "sr_no": _str_or_none(target_ship.get("ShipSrNo")),
                    "sfd_hierarchy_id": target_ship.get("SFDHierarchyID"),
                    "class_master": class_master_obj,
                    "class_code": _str_or_none(target_ship.get("ClassCode")),
                    "commission_date": date_from_cmms(
                        target_ship.get("CommissionDate")
                    ),
                    "command": command_obj,
                    "authority": ops_authority_obj,
                    "ops_code": _str_or_none(target_ship.get("OpsCode")),
                    "ship_builder": _str_or_none(target_ship.get("ShipBuilder")),
                    "decommission_date": date_from_cmms(
                        target_ship.get("DecommissionDate")
                    ),
                    "displacement": _str_or_none(target_ship.get("Displacement")),
                    "hours_underway": _str_or_none(target_ship.get("HoursUnderway")),
                    "distance_run": _str_or_none(target_ship.get("DistanceRun")),
                    "decommission_scheduled_date": date_from_cmms(
                        target_ship.get("DecommissionScheduledDate")
                    ),
                    "sdrsref": _str_or_none(target_ship.get("SDRSREF")),
                    "active_external": _bool_or_none(target_ship.get("ShipActive")),
                    "created_by_external": _str_or_none(
                        target_ship.get("ShipCreatedBy")
                    ),
                    "created_date_external": target_ship.get("ShipCreatedDate"),
                    "updated_by_external": _str_or_none(
                        target_ship.get("ShipUpdatedBy")
                    ),
                    "updated_date_external": target_ship.get("ShipUpdatedDate"),
                    "yard_no": _str_or_none(target_ship.get("YardNo")),
                    "reference_no": _str_or_none(target_ship.get("ReferenceNo")),
                    "classification_society": _str_or_none(
                        target_ship.get("ClassificationSociety")
                    ),
                    "length_overall": _str_or_none(target_ship.get("LengthOverall")),
                    "length_perpen": _str_or_none(target_ship.get("LengthPerpen")),
                    "module_breath": _str_or_none(target_ship.get("ModuleBreadth")),
                    "wetted_under_water": _str_or_none(
                        target_ship.get("WettedUnderWater")
                    ),
                    "depth_main": _str_or_none(target_ship.get("DepthMain")),
                    "standard_disp": _str_or_none(target_ship.get("StandardDisp")),
                    "full_load_disp": _str_or_none(target_ship.get("FullLoadDisp")),
                    "stand_draft": _str_or_none(target_ship.get("StandDraft")),
                    "full_load_draft": _str_or_none(target_ship.get("FullloadDraft")),
                    "wetted_boot_top": _str_or_none(target_ship.get("WettedBootTop")),
                    "engine_rating": _str_or_none(target_ship.get("Enginerating")),
                    "max_cont_speed": _str_or_none(target_ship.get("MaxContSpeed")),
                    "eco_speed": _str_or_none(target_ship.get("EcoSpeed")),
                    "endurance": _str_or_none(target_ship.get("Endurance")),
                    "remark": _str_or_none(target_ship.get("ShipRemark")),
                    "universal_id_m_ship_category": _str_or_none(
                        target_ship.get("Universal_ID_M_ShipCategory")
                    ),
                    "universal_id_m_ship_class": _str_or_none(
                        target_ship.get("Universal_ID_M_ShipClass")
                    ),
                    "universal_id_m_command": _str_or_none(
                        target_ship.get("Universal_ID_M_Command")
                    ),
                    "universal_id_m_ops_authority": _str_or_none(
                        target_ship.get("Universal_ID_M_OpsAuthority")
                    ),
                    "universal_id_m_propulsion": _str_or_none(
                        target_ship.get("Universal_ID_M_Propulsion")
                    ),
                    "universal_id_a_user_created_by": _str_or_none(
                        target_ship.get("ShipCreatedByUid")
                    ),
                    "universal_id_a_user_updated_by": _str_or_none(
                        target_ship.get("ShipUpdatedByUid")
                    ),
                    "refit_authority": _str_or_none(target_ship.get("Refit_Authority")),
                    "signal_name": _str_or_none(target_ship.get("Signal_Name")),
                    "address": _str_or_none(target_ship.get("Address")),
                    "contact_number": _str_or_none(
                        target_ship.get("ShipContactNumber")
                    ),
                    "nud_email_id": _str_or_none(target_ship.get("NUD_Email_ID")),
                    "nic_email_id": _str_or_none(target_ship.get("NIC_Email_ID")),
                    "universal_id_m_overseeing_team": _str_or_none(
                        target_ship.get("Universal_ID_M_Overseeing_Team")
                    ),
                    "is_cmms_install": _bool_or_none(target_ship.get("IsCMMSInstall")),
                    "is_in_gd": _bool_or_none(target_ship.get("IsInGD")),
                    "universal_id_m_ship_unit_category": _str_or_none(
                        target_ship.get("Universal_ID_M_ShipUnitCategory")
                    ),
                    "customer_code": _str_or_none(target_ship.get("ILMSCustomerCode")),
                    "ship_category": ship_category_obj,
                    "propulsion": propulsion_obj,
                },
            )
            if created:
                counts["ship"] += 1

        # The per-row work below is deliberately NOT inside the transaction above. That block
        # covers the prerequisites every row then resolves against (ship, category,
        # propulsion, unit type) and must stay all-or-nothing; the rows themselves are
        # independent upserts, and holding them all open in one transaction meant an
        # interruption -- a dropped link on a ship, which is routine -- rolled back every row
        # the sync had got through, leaving the retry nothing to resume from. A transaction
        # per row commits as it goes, which is what gives the checkpoint something to point
        # at. It also stops a transaction being held open across the heartbeat `yield`s, i.e.
        # across the network, for the whole phase.
        #
        # Heartbeat every ~5% of the batch (min every 10 rows) so the frontend's progress bar
        # has something to move on for this phase specifically -- it used to be one single
        # blocking call between the "Retrieved N records" and "SFD equipment data synced"
        # yields in _stream_sync(), which on a few hundred rows is the single longest-running
        # phase of the whole Step 1 sync with no yields in between: the progress bar sat
        # frozen at whatever percentage it last reached, then jumped straight to 100% once the
        # entire stream finished. This makes _sync_rows_to_swmm itself a generator (the
        # `yield` below); _stream_sync() drains it with `yield from` and still gets the same
        # `counts` dict back as its return value.
        total_rows = len(rows)
        heartbeat_every = max(10, total_rows // 20) if total_rows else 1

        row_cursor = ResumeCursor(
            self.RESUME_MODULE,
            "ship_equipment",
            rows,
            # T_EquipmentShipDetail's own identity — one per fitted equipment, and what every
            # write below keys off (see `detail_uid`), so it is stable between attempts.
            key=lambda r: r.get("Universal_ID_T_EquipmentShipDetail") or "",
            scope=(ship_uid, total_rows),
        )
        if row_cursor.resumed:
            yield f"[RESUMED] {row_cursor.resume_message()}\n"

        for idx, row in enumerate(row_cursor, start=row_cursor.start_index):
            if idx > row_cursor.start_index and idx % heartbeat_every == 0:
                yield f"[SYSTEM] Synced {idx}/{total_rows} equipment rows...\n"
            with transaction.atomic():
                dept_uid = row.get("DetailUniversal_ID_M_Department") or row.get(
                    "Universal_ID_M_Department"
                )
                dept_name = row.get("DeptName") or ""
                dept_code_raw = row.get("DeptCode")
                dept_obj = None
                # CMMS holds HULL (Universal_ID_M_Department "1") and NBCD ("4") as departments of
                # their own; SWMM holds them as sub departments of "Executive" instead (matches the
                # reference project's own CMMS_DEPARTMENT_MAP exactly). Without this remap, syncing
                # them as literal top-level "HULL"/"NBCD" departments left those two with no real
                # sub-department master data at all, so every one of their equipment stayed stuck
                # unassigned no matter how many times Step 1 re-ran. Matched by NAME, never
                # created here — Executive and its HULL/NBCD sub departments are seed data; a
                # deployment missing them is a data problem to report, not paper over.
                forced_subdept_name = CMMS_DEPARTMENT_REMAP.get(dept_uid)
                if forced_subdept_name:
                    # iexact, not exact — seed_all.py's canonical name is "EXECUTIVE"
                    # (all caps), and a case-sensitive `name="Executive"` here always
                    # missed it, silently sending every HULL/NBCD-remapped equipment row
                    # (dept_uid "1"/"4") through with dept_obj=None instead. That was the
                    # actual source of every department-less ShipEquipment row on this
                    # ship (79 of 79) — nothing to do with the CMMS-side data or the
                    # SQL JOIN type at all.
                    dept_obj = Department.objects.filter(
                        name__iexact="Executive"
                    ).first()
                    if dept_obj is None:
                        logger.warning(
                            "CMMS dept uid %s remaps to 'Executive' but no such department "
                            "exists locally — falling back to a literal '%s' department.",
                            dept_uid,
                            dept_name,
                        )
                elif dept_uid and dept_name:
                    # Adopt-by-name before create — see _resolve_or_adopt_department's
                    # doc. Without this, a CMMS uid with the same name as an existing
                    # SWMM-seeded department (e.g. "ELECTRICAL", "ENGINEERING") created
                    # a second row instead of recognising the seeded one.
                    dept_obj, created = self._resolve_or_adopt_department(
                        dept_uid,
                        dept_name,
                        dept_code_raw,
                        extra_defaults={"sfd_applicable": row.get("SFDApplicable")},
                    )
                    if created:
                        counts["department"] += 1

                subdept_uid = row.get("DetailUniversal_ID_M_SubDepartment") or row.get(
                    "Universal_ID_M_SubDepartment"
                )
                subdept_name = row.get("SubDeptName") or ""
                subdept_obj = None
                if forced_subdept_name and dept_obj is not None:
                    # CMMS never sends a sub department of its own for these rows (HULL/NBCD are
                    # its own departments, not SWMM's), so the normal uid-keyed upsert below is
                    # skipped entirely in favour of the fixed HULL/NBCD sub department Executive
                    # already carries as seed data.
                    subdept_obj = SubDepartment.objects.filter(
                        department_name=dept_obj, name=forced_subdept_name
                    ).first()
                    if subdept_obj is None:
                        logger.warning(
                            "CMMS dept uid %s remaps to Executive/%s but no such sub department "
                            "exists locally.",
                            dept_uid,
                            forced_subdept_name,
                        )
                elif subdept_uid and subdept_name:
                    # Adopt-by-name before create — see _resolve_or_adopt_subdepartment's
                    # doc. Without this, a CMMS uid with the same name as an existing
                    # SWMM-seeded sub department (e.g. "WEAPON" under ELECTRICAL) created a
                    # second row instead of recognising the seeded one.
                    subdept_obj, created = self._resolve_or_adopt_subdepartment(
                        dept_obj, subdept_uid, subdept_name
                    )
                    if created:
                        counts["sub_department"] += 1

                eq_uid = row.get("Universal_ID_M_Equipment")
                eq_code = row.get("EquipmentCode") or ""
                eq_name = row.get("EquipmentName") or ""
                eq_model = row.get("EquipmentModel") or ""
                eq_obj = None
                if eq_uid or eq_code:
                    eq_lookup = (
                        {"universal_id_m_equipment": eq_uid}
                        if eq_uid
                        else {"equipment_code": eq_code}
                    )
                    eq_obj, created = Equipment.objects.update_or_create(
                        **eq_lookup,
                        defaults={
                            "equipment_code": eq_code,
                            "model": eq_model,
                            "equipment_class": eq_name,
                            "maintop_number": row.get("MaintopNumber") or None,
                            "manufacturer_name": row.get("ManufacturerName") or None,
                            "authority": row.get("authority") or None,
                        },
                    )
                    if created:
                        counts["equipment"] += 1

                eqtype_obj = None
                if eq_name:
                    # sfd.EquipmentType names its fields after the CMMS columns
                    # (Equipment_Desc / Equipment_Type_ID), not snake_case — the
                    # lowercase spellings raise FieldError before the query is even run.
                    eqtype_obj, created = EquipmentType.objects.get_or_create(
                        Equipment_Desc=eq_name,
                        defaults={
                            "Equipment_Type_ID": str(eq_uid or eq_code or eq_name),
                            "status": "Active",
                        },
                    )
                    if created:
                        counts["equipment_type"] += 1

                supplier_uid = row.get("Universal_ID_M_Supplier")
                supplier_name = row.get("SupplierName") or ""
                supplier_code = row.get("SupplierCode") or ""
                supplier_manufacture_raw = row.get("SupplierManufacturer")
                supplier_manufacture = (
                    int(supplier_manufacture_raw)
                    if supplier_manufacture_raw not in (None, "")
                    else None
                )
                supplier_obj = None
                if supplier_uid or supplier_name:
                    supplier_lookup = (
                        {"Universal_ID_M_Supplier": supplier_uid}
                        if supplier_uid
                        else {"SupplierName": supplier_name}
                    )
                    supplier_obj, created = Supplier.objects.update_or_create(
                        **supplier_lookup,
                        defaults={
                            "SupplierID": row.get("SupplierID"),
                            "SupplierCode": supplier_code,
                            "SupplierName": supplier_name,
                            "SupplierManufacturer": (
                                str(supplier_manufacture_raw)
                                if supplier_manufacture_raw not in (None, "")
                                else None
                            ),
                            "supplier_code": supplier_code,
                            "supplier_name": supplier_name,
                            "supplier_manufacture": supplier_manufacture,
                            "address": (row.get("Address") or "")[:255] or None,
                            "AreaStreet": row.get("AreaStreet") or None,
                            "City": row.get("City") or None,
                            "CountryCode": row.get("CountryCode") or None,
                            "CountryID": (
                                str(row.get("CountryID"))
                                if row.get("CountryID") not in (None, "")
                                else None
                            ),
                            "Universal_ID_M_Country": row.get("Universal_ID_M_Country")
                            or None,
                            "Contact_Person": row.get("Contact_Person") or None,
                            "Contact_Number": row.get("Contact_Number") or None,
                            "Email_ID": row.get("Email_ID") or None,
                            "active": "1" if row.get("SupplierActive") else "0",
                        },
                    )
                    if created:
                        counts["supplier"] += 1

                # Manufacturer is a *separate* relationship from the installation
                # supplier above — CMMS links it via T_EquipmentSupplier
                # (SupplierManufacturer=2), not T_EquipmentShipDetail.SupplierID.
                manufacturer_uid = row.get("ManufacturerUid")
                manufacturer_supplier_name = row.get("ManufacturerSupplierName") or ""
                manufacturer_supplier_code = row.get("ManufacturerSupplierCode") or ""
                manufacturer_supplier_manufacture_raw = row.get(
                    "ManufacturerSupplierManufacturer"
                )
                manufacturer_supplier_obj = None
                if manufacturer_uid or manufacturer_supplier_name:
                    manufacturer_lookup = (
                        {"Universal_ID_M_Supplier": manufacturer_uid}
                        if manufacturer_uid
                        else {"SupplierName": manufacturer_supplier_name}
                    )
                    manufacturer_supplier_obj, created = (
                        Supplier.objects.update_or_create(
                            **manufacturer_lookup,
                            defaults={
                                "SupplierCode": manufacturer_supplier_code,
                                "SupplierName": manufacturer_supplier_name,
                                "SupplierManufacturer": (
                                    str(manufacturer_supplier_manufacture_raw)
                                    if manufacturer_supplier_manufacture_raw
                                    not in (None, "")
                                    else "2"
                                ),
                                "supplier_code": manufacturer_supplier_code,
                                "supplier_name": manufacturer_supplier_name,
                                "supplier_manufacture": (
                                    int(manufacturer_supplier_manufacture_raw)
                                    if manufacturer_supplier_manufacture_raw
                                    not in (None, "")
                                    else 2
                                ),
                                "active": (
                                    "1"
                                    if row.get("ManufacturerSupplierActive")
                                    else "0"
                                ),
                            },
                        )
                    )
                    if created:
                        counts["supplier"] += 1

                manufacturer_name = (
                    manufacturer_supplier_name or row.get("ManufacturerName") or ""
                )
                master_manufacturer_obj = None
                if manufacturer_name:
                    manufacturer_code = (
                        manufacturer_supplier_code or manufacturer_name
                    )[:250]
                    master_manufacturer_obj, created = (
                        MasterManufacturer.objects.update_or_create(
                            code=manufacturer_code,
                            defaults={"name": manufacturer_name},
                        )
                    )
                    if created:
                        counts["master_manufacturer"] += 1

                master_equipment_type_obj = None
                if eq_name:
                    master_equipment_type_obj, created = (
                        MasterEquipmentType.objects.get_or_create(
                            code=eq_name[:250],
                            defaults={"name": eq_name},
                        )
                    )
                    if created:
                        counts["master_equipment_type"] += 1

                if eq_code:
                    equipment_country_obj = None
                    equipment_country_code = row.get("EquipmentCountryCode")
                    if equipment_country_code:
                        equipment_country_obj, _ = MasterCountry.objects.get_or_create(
                            code=equipment_country_code,
                            defaults={
                                "name": row.get("EquipmentCountryName")
                                or equipment_country_code
                            },
                        )

                    equipment_group_obj = None
                    equipment_group_code = row.get("EquipmentGroupCode")
                    if equipment_group_code:
                        equipment_group_obj, _ = MasterGroup.objects.get_or_create(
                            code=equipment_group_code,
                            defaults={"name": equipment_group_code},
                        )

                    _, created = MasterEquipment.objects.update_or_create(
                        code=eq_code,
                        defaults={
                            "name": eq_name,
                            "model": eq_model or None,
                            "manufacturer": master_manufacturer_obj,
                            "type": master_equipment_type_obj,
                            "country": equipment_country_obj,
                            "group": equipment_group_obj,
                            "authority": row.get("authority") or "",
                            "obsolete": row.get("obsolete") or "",
                            "generic_code": row.get("EquipmentGenericSrNo") or None,
                            "maintop_number": row.get("MaintopNumber") or None,
                            "acquaint_issued": row.get("AcquaintIssued") or None,
                            "ilms_equipment_code": row.get("ILMSEquipmentCode") or None,
                        },
                    )
                    if created:
                        counts["master_equipment"] += 1

                if supplier_code:
                    supplier_country_obj = None
                    country_code = row.get("CountryCode")
                    if country_code:
                        supplier_country_obj, _ = MasterCountry.objects.get_or_create(
                            code=country_code,
                            defaults={"name": row.get("CountryName") or country_code},
                        )

                    _, created = MasterSupplier.objects.update_or_create(
                        code=supplier_code,
                        defaults={
                            "name": supplier_name,
                            "supplier_manufacture": (
                                str(supplier_manufacture_raw)
                                if supplier_manufacture_raw not in (None, "")
                                else None
                            ),
                            "address": row.get("Address") or None,
                            "city": row.get("City") or None,
                            "country": supplier_country_obj,
                            "contact_person": row.get("Contact_Person") or None,
                            "contact_number": row.get("Contact_Number") or None,
                            "email_id": row.get("Email_ID") or None,
                        },
                    )
                    if created:
                        counts["master_supplier"] += 1

                detail_uid = row.get("Universal_ID_T_EquipmentShipDetail")
                nomenclature = row.get("Nomenclature") or ""
                if not detail_uid and not nomenclature:
                    continue

                shipeq_lookup = (
                    {"t_equipment_ship_detail": detail_uid}
                    if detail_uid
                    else {"ship": ship_obj, "nomenclature": nomenclature}
                )
                shipeq_defaults = {
                    "ship": ship_obj,
                    "department": dept_obj,
                    "equipment": eq_obj,
                    "equipment_type_f_key": eqtype_obj,
                    "supplier": supplier_obj,
                    "manufacturer": manufacturer_supplier_obj,
                    "nomenclature": nomenclature,
                    "equipment_name": eq_name,
                    "equipment_code": eq_code,
                    "equipment_model": eq_model,
                    "equipment_serial_no": row.get("EquipmentSrNo") or "",
                    "location_on_board": row.get("LocationOnBoard") or "",
                    "location_code": row.get("LocationCode") or None,
                    "maintop_id": _clean_int(row.get("MaintopNumber"), default=None),
                    "installation_date": date_from_cmms(row.get("InstallationDate")),
                    "quantity": row.get("Quantity") or 1,
                    "no_of_fits": row.get("Quantity") or 1,
                    "authority_installation": row.get("Authority_of_Installation"),
                    "authority_of_installation": row.get("Authority_of_Installation"),
                    "is_srar": bool(row.get("SRARApplicable")),
                    "status": "active",
                    "active": True,
                    "removal_date": date_from_cmms(row.get("RemovalDate")),
                    "oem_part_no": row.get("OEMPartNo") or None,
                    "remarks": row.get("DetailRemark") or None,
                    "service_life": (
                        str(row.get("ServiceLife"))
                        if row.get("ServiceLife") not in (None, "")
                        else None
                    ),
                    "removal_remark": row.get("Removal_Remark") or None,
                    "authority_of_removal": row.get("Authority_Of_Removal") or None,
                    "rshi": row.get("RH_Of_New_Equipemnt_At_Time_Of_Installation")
                    or None,
                    "insma_remarks": row.get("INSMAREMARKS") or None,
                    "is_synced": (
                        bool(row.get("DetailIsSynced"))
                        if row.get("DetailIsSynced") is not None
                        else True
                    ),
                    "universal_id_m_ship": ship_uid,
                    "universal_id_m_equipment": eq_uid,
                    "universal_id_m_supplier": supplier_uid,
                    "universal_id_m_department": dept_uid,
                    "universal_id_m_sub_department": subdept_uid,
                    "universal_id_m_srar_type": row.get("Universal_ID_M_SrarType")
                    or None,
                    "universal_id_m_manufacturer": row.get(
                        "Universal_ID_M_Supplier_Manufacturer"
                    )
                    or None,
                    "universal_id_m_equipment_parent": row.get(
                        "Universal_ID_M_Equipment_ParentEquipment"
                    )
                    or None,
                    "universal_id_t_maintop_header": row.get(
                        "Universal_ID_T_MaintopHeader"
                    ),
                    "universal_id_t_equipment_ship_detail": detail_uid,
                    "universal_id_ch_master_equipment_type": (
                        row.get("Universal_ID_Ch_Master_Equipment_Type")
                        or row.get("EquipmentChMasterEquipmentType")
                        or None
                    ),
                }
                # sub_department_f_key is deliberately NOT a key in shipeq_defaults — every
                # key in there is re-applied on every re-run, so putting the sub department
                # there would let a later sync silently overwrite a value someone assigned by
                # hand on the RHSI Master page (or one an earlier sync already filled in),
                # every single time this reruns. Filled below instead, fill-if-blank, exactly
                # matching the source project's own fetch_sfd_from_cmms: CMMS closes the gap
                # at most once per row, and every later correction survives every subsequent
                # import no matter what CMMS says on that later run.
                shipeq_obj, created = ShipEquipment.objects.update_or_create(
                    **shipeq_lookup,
                    defaults=shipeq_defaults,
                )
                if created:
                    counts["ship_equipment"] += 1

                if (
                    subdept_obj is not None
                    and shipeq_obj.sub_department_f_key_id is None
                ):
                    shipeq_obj.sub_department_f_key = subdept_obj
                    shipeq_obj.save(update_fields=["sub_department_f_key"])

                # Read the sub department back off the row that was actually written rather
                # than off the raw CMMS value, so a manual RHSI Master correction preserved by
                # the fill-if-blank rule above also drives the SectionName mirror and the
                # EquipmentName link — matching the reference project's
                # `effective_sub_dept_obj = ship_eq.sub_department_f_key or sub_dept_obj`.
                # Without this, EquipmentName.sub_department got silently reset to whatever
                # (usually blank) CMMS sent on every re-sync, drifting out of sync with the
                # preserved ShipEquipment value.
                effective_subdept_obj = shipeq_obj.sub_department_f_key or subdept_obj

                # ems.SectionName is how the whole EMS/routines side scopes equipment to a
                # department — ~15 querysets in ems/views.py filter on
                # `equipment_name__section__department`, including the running-hour and
                # calendar KPIs. Nothing populated it, so SectionName held zero rows and
                # every one of those filters matched nothing. Deriving it here fixes them
                # all without rewriting a single filter.
                #
                # CMMS gives a department for all 295 of L18's fittings but a sub-department
                # for only 68, so fall back to the department's own name when there is no
                # finer detail: leaving section NULL would keep 227 of 295 equipment
                # invisible to every department-scoped query.
                section_obj = None
                if dept_obj:
                    section_name = (
                        effective_subdept_obj.name
                        if effective_subdept_obj
                        else dept_obj.name
                    ) or ""
                    if section_name:
                        section_obj, created = SectionName.objects.get_or_create(
                            name=section_name,
                            department=dept_obj,
                        )
                        if created:
                            counts["section"] += 1

                if nomenclature:
                    ems_lookup = (
                        {"universal_id_t_equipment_ship_detail": detail_uid}
                        if detail_uid
                        else {"sfd_equipment": shipeq_obj}
                    )
                    _, created = EquipmentName.objects.update_or_create(
                        **ems_lookup,
                        defaults={
                            "name": nomenclature.upper(),
                            "nomenclature": nomenclature,
                            "equipment_code": eq_code,
                            "extra": eq_name,
                            "sub_department": effective_subdept_obj,
                            "section": section_obj,
                            "universal_id_t_equipment_ship_detail": detail_uid,
                            "sfd_equipment": shipeq_obj,
                            "started_at_location": "AT SEA",
                            "state": "INACTIVE",
                        },
                    )
                    if created:
                        counts["ems_equipment"] += 1

        row_cursor.finish()
        return counts

    def _fetch_all_active_suppliers(self, cursor):
        """The full CMMS supplier/manufacturer catalog — deliberately NOT scoped
        to any ship. `SupplierManufacturer` distinguishes role: 1 = Supplier,
        2 = Manufacturer. Matches the reference query:
        `SELECT * FROM M_Supplier WITH (NOLOCK) WHERE Active = 1`.
        """
        query = """
            SELECT
                M_Supplier.SupplierID,
                M_Supplier.SupplierCode,
                M_Supplier.Universal_ID_M_Supplier,
                M_Supplier.SupplierName,
                M_Supplier.SupplierManufacturer,
                M_Supplier.Active,
                M_Supplier.Address,
                M_Supplier.AreaStreet,
                M_Supplier.City,
                M_Supplier.CountryCode,
                M_Supplier.CountryID,
                M_Supplier.Universal_ID_M_Country,
                M_Supplier.Contact_Person,
                M_Supplier.Contact_Number,
                M_Supplier.Email_ID,
                M_Country.CountryName
            FROM M_Supplier
            LEFT JOIN M_Country
                ON M_Supplier.CountryID = M_Country.CountryID
            WHERE M_Supplier.Active = 1
        """
        cursor.execute(query)
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]

    def _sync_all_suppliers(self, rows):
        """Upserts the full, ship-independent supplier/manufacturer catalog
        into sfd.Supplier. Runs once per sync — not scoped/looped per ship
        equipment, unlike `_sync_rows_to_swmm`.
        """
        counts = {"supplier_catalog": 0}
        with transaction.atomic():
            for row in rows:
                supplier_uid = row.get("Universal_ID_M_Supplier")
                supplier_name = row.get("SupplierName") or ""
                supplier_code = row.get("SupplierCode") or ""
                if not (supplier_uid or supplier_name):
                    continue

                supplier_manufacture_raw = row.get("SupplierManufacturer")
                supplier_manufacture = (
                    int(supplier_manufacture_raw)
                    if supplier_manufacture_raw not in (None, "")
                    else None
                )
                supplier_lookup = (
                    {"Universal_ID_M_Supplier": supplier_uid}
                    if supplier_uid
                    else {"SupplierName": supplier_name}
                )
                _, created = Supplier.objects.update_or_create(
                    **supplier_lookup,
                    defaults={
                        "SupplierID": row.get("SupplierID"),
                        "SupplierCode": supplier_code,
                        "SupplierName": supplier_name,
                        "SupplierManufacturer": (
                            str(supplier_manufacture_raw)
                            if supplier_manufacture_raw not in (None, "")
                            else None
                        ),
                        "supplier_code": supplier_code,
                        "supplier_name": supplier_name,
                        "supplier_manufacture": supplier_manufacture,
                        "address": (row.get("Address") or "")[:255] or None,
                        "AreaStreet": row.get("AreaStreet") or None,
                        "City": row.get("City") or None,
                        "CountryCode": row.get("CountryCode") or None,
                        "CountryID": (
                            str(row.get("CountryID"))
                            if row.get("CountryID") not in (None, "")
                            else None
                        ),
                        "Universal_ID_M_Country": row.get("Universal_ID_M_Country")
                        or None,
                        "Contact_Person": row.get("Contact_Person") or None,
                        "Contact_Number": row.get("Contact_Number") or None,
                        "Email_ID": row.get("Email_ID") or None,
                        "active": "1" if row.get("Active") else "0",
                    },
                )
                if created:
                    counts["supplier_catalog"] += 1

                if supplier_code:
                    supplier_country_obj = None
                    country_code = row.get("CountryCode")
                    if country_code:
                        supplier_country_obj, _ = MasterCountry.objects.get_or_create(
                            code=country_code,
                            defaults={"name": row.get("CountryName") or country_code},
                        )
                    MasterSupplier.objects.update_or_create(
                        code=supplier_code,
                        defaults={
                            "name": supplier_name,
                            "supplier_manufacture": (
                                str(supplier_manufacture_raw)
                                if supplier_manufacture_raw not in (None, "")
                                else None
                            ),
                            "address": row.get("Address") or None,
                            "city": row.get("City") or None,
                            "country": supplier_country_obj,
                            "contact_person": row.get("Contact_Person") or None,
                            "contact_number": row.get("Contact_Number") or None,
                            "email_id": row.get("Email_ID") or None,
                        },
                    )

        return counts

    def _fetch_all_subdepartments(self, cursor, ship_class_uid):
        """The full sub-department set defined for the ship's CLASS — not just
        the sub-departments that happen to have equipment currently installed
        on this specific hull.
        """
        if not ship_class_uid:
            return []
        query = """
            SELECT
                M_SubDepartment.Universal_ID_M_SubDepartment,
                M_SubDepartment.Description,
                M_SubDepartment.SubDeptCode,
                M_SubDepartment.Active,
                M_SubDepartment.Universal_ID_M_Department,
                M_Department.Description AS DeptName
            FROM M_SubDepartment
            LEFT JOIN M_Department
                ON M_SubDepartment.Universal_ID_M_Department =
                   M_Department.Universal_ID_M_Department
            WHERE M_SubDepartment.Universal_ID_M_ShipClass = ?
        """
        cursor.execute(query, [ship_class_uid])
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]

    def _sync_all_subdepartments(self, rows):
        counts = {"subdepartment_catalog": 0}
        cmms_spoke_for_departments = set()
        with transaction.atomic():
            for row in rows:
                subdept_uid = row.get("Universal_ID_M_SubDepartment")
                subdept_name = row.get("Description") or ""
                if not (subdept_uid and subdept_name):
                    continue

                dept_uid = row.get("Universal_ID_M_Department")
                dept_name = row.get("DeptName") or ""
                dept_obj = None
                if dept_uid and dept_name:
                    # Adopt-by-name before create — see _resolve_or_adopt_department's doc.
                    dept_obj, _ = self._resolve_or_adopt_department(
                        dept_uid, dept_name, None
                    )

                # Adopt-by-name before create — see _resolve_or_adopt_subdepartment's doc.
                # This is the FULL ship-class catalog (a superset of whatever individual
                # equipment rows reference), so it's also where leftover SWMM-seeded rows
                # in a CMMS-touched department get reported afterward.
                _, created = self._resolve_or_adopt_subdepartment(
                    dept_obj,
                    subdept_uid,
                    subdept_name,
                    extra_defaults={
                        "code": row.get("SubDeptCode") or None,
                        "active": bool(row.get("Active")),
                    },
                )
                if created:
                    counts["subdepartment_catalog"] += 1
                if dept_obj is not None:
                    cmms_spoke_for_departments.add(dept_obj.pk)

            counts["_subdept_report_lines"] = self._leftover_seed_subdepartment_report(
                cmms_spoke_for_departments
            )

        return counts

    # The defect/DART master lookups. Ship-independent, small, and until now never
    # populated by any sync — which is why InitiateDart.symptom_code / severity_code /
    # remark_code / require_assistance_for_code always resolved to None. Each entry is
    # (label, model, CMMS table, upsert key column, WHERE clause or None).
    _DEFECT_MASTERS = [
        (
            "Ch_Master_Symptoms",
            ChMasterSymptoms,
            "Ch_Master_Symptoms",
            "Universal_ID_Ch_Master_Symptoms",
            None,
        ),
        (
            "M_Severity",
            MSeverity,
            "M_Severity",
            "Universal_ID_M_Severity",
            "Active = '1'",
        ),
        (
            "M_Diagnostic",
            MDiagnostic,
            "M_Diagnostic",
            "Universal_ID_M_Diagnostic",
            None,
        ),
        (
            "Ch_Master_Other_Ship_Remarks_By",
            ChMasterOtherShipRemarksBy,
            "Ch_Master_Other_Ship_Remarks_By",
            "Universal_ID_Ch_Master_Other_Ship_Remarks_By",
            None,
        ),
        (
            "Ch_Master_Ship_Remarks_By",
            ChMasterShipRemarksBy,
            "Ch_Master_Ship_Remarks_By",
            "Universal_ID_Ch_Master_Ship_Remarks_By",
            None,
        ),
        (
            "M_RequiredAssistance",
            MRequiredAssistance,
            "M_RequiredAssistance",
            "Universal_ID_M_RequiredAssistance",
            None,
        ),
        (
            "M_OSTList",
            TrialUnit,
            "M_OSTList",
            "OSTList",
            None,
        ),
        (
            "M_RepairAgency",
            MRepairAgency,
            "M_RepairAgency",
            "Universal_ID_M_RepairAgency",
            None,
        ),
        (
            "M_Deferment",
            MDeferment,
            "M_Deferment",
            "Universal_ID_M_Deferment",
            None,
        ),
        (
            "M_Reason",
            MReason,
            "M_Reason",
            "Universal_ID_M_Reason",
            None,
        ),
        (
            "M_Inability",
            MInability,
            "M_Inability",
            "Universal_ID_M_Inability",
            None,
        ),
        (
            "M_Establishment",
            MEstablishment,
            "M_Establishment",
            "universal_id_m_establishment",
            None,
        ),
        (
            "M_RequiredAssistance",
            MRequiredAssistance,
            "M_RequiredAssistance",
            "Universal_ID_M_RequiredAssistance",
            None,
        ),
    ]

    # label -> local model field for the upsert key, for tables where the CMMS column
    # name and the local column name are not the same string. M_RequiredAssistance is
    # the one such case: CMMS spells its uid Universal_ID_M_RequiredAssistance while the
    # local column is universal_id_m_required_assistance, so the usual
    # `field.column == key_column` lookup finds nothing. Everything else keeps the
    # default lookup.
    _DEFECT_MASTER_KEY_FIELDS = {
        "M_RequiredAssistance": "universal_id_m_required_assistance",
    }

    def _fetch_equipment_rhsi(self, cursor, ship_uid):
        """Ship-wide running-hours-since-installation reading per equipment, best effort in
        a fixed order of trust — matches the reference project's own bulk RHSI query
        (SFD/views.py's fetch_sfd_from_cmms) exactly, ported here since our own sync
        previously only ever tried the first of these three sources:

        1. The latest monthly SRAR return's HrsFromInstallation (measured, reported by
           Ship Staff) — the strongest claim.
        2. Else the latest DART's running hours (TotalRunningHours, falling back to
           Present_Running_Hours, then its own HrsFromInstallation) — recorded against a
           defect, not a routine reading.
        3. Else DERIVED: the installation-time baseline
           (T_EquipmentShipDetail.RH_Of_New_Equipemnt_At_Time_Of_Installation) plus the sum
           of every monthly SRAR HrsForMonth on record — the weakest claim, a calculation
           rather than a measurement.

        Every CTE is INNER JOINed back to `esd`, itself filtered on Universal_ID_M_Ship, so
        no other ship's SRAR or DART history can enter the result at any stage. Each row
        carries which source won, so _sync_equipment_rhsi can tell Ship Staff whether a
        figure is measured or calculated.
        """
        query = """
            WITH esd AS (
                SELECT  d.Universal_ID_T_EquipmentShipDetail AS UID,
                        TRY_CONVERT(float, d.RH_Of_New_Equipemnt_At_Time_Of_Installation) AS Baseline
                FROM    T_EquipmentShipDetail d WITH (NOLOCK)
                WHERE   ISNULL(d.Active, 1) = 1
                  AND   d.Universal_ID_M_Ship = ?
            ),
            srar_last AS (
                SELECT UID, RHSI, SrarYear, SrarMonth FROM (
                    SELECT  eq.Universal_ID_T_EquipmentShipDetail AS UID,
                            TRY_CONVERT(float, eq.HrsFromInstallation) AS RHSI,
                            h.SrarYear, h.SrarMonth,
                            ROW_NUMBER() OVER (
                                PARTITION BY eq.Universal_ID_T_EquipmentShipDetail
                                ORDER BY h.SrarYear DESC, h.SrarMonth DESC) AS rn
                    FROM    T_SRARMthlyEquipments eq WITH (NOLOCK)
                    INNER JOIN T_SRARMthlyHeader h WITH (NOLOCK)
                            ON h.Universal_ID_T_SRARMthlyHeader = eq.Universal_ID_T_SRARMthlyHeader
                    INNER JOIN esd
                            ON esd.UID = eq.Universal_ID_T_EquipmentShipDetail
                    WHERE   TRY_CONVERT(float, eq.HrsFromInstallation) > 0
                ) x WHERE rn = 1
            ),
            srar_sum AS (
                SELECT  eq.Universal_ID_T_EquipmentShipDetail AS UID,
                        SUM(ISNULL(TRY_CONVERT(float, eq.HrsForMonth), 0)) AS SumMonthHrs
                FROM    T_SRARMthlyEquipments eq WITH (NOLOCK)
                INNER JOIN esd ON esd.UID = eq.Universal_ID_T_EquipmentShipDetail
                GROUP BY eq.Universal_ID_T_EquipmentShipDetail
            ),
            dart_last AS (
                SELECT UID, RH, DartDate FROM (
                    SELECT  d.Universal_ID_T_EquipmentShipDetail AS UID,
                            COALESCE(TRY_CONVERT(float, d.TotalRunningHours),
                                     TRY_CONVERT(float, d.Present_Running_Hours),
                                     TRY_CONVERT(float, d.HrsFromInstallation)) AS RH,
                            d.DartDate,
                            ROW_NUMBER() OVER (
                                PARTITION BY d.Universal_ID_T_EquipmentShipDetail
                                ORDER BY d.DartDate DESC) AS rn
                    FROM    T_Dart d WITH (NOLOCK)
                    INNER JOIN esd ON esd.UID = d.Universal_ID_T_EquipmentShipDetail
                    WHERE   COALESCE(TRY_CONVERT(float, d.TotalRunningHours),
                                     TRY_CONVERT(float, d.Present_Running_Hours),
                                     TRY_CONVERT(float, d.HrsFromInstallation)) > 0
                ) y WHERE rn = 1
            )
            SELECT  e.UID AS EquipmentShipDetailUid,
                    COALESCE(sl.RHSI, dl.RH,
                             NULLIF(ISNULL(e.Baseline, 0) + ISNULL(ss.SumMonthHrs, 0), 0)) AS RhsiBestEffort,
                    CASE WHEN sl.RHSI IS NOT NULL THEN 'SRAR'
                         WHEN dl.RH   IS NOT NULL THEN 'DART'
                         WHEN (ISNULL(e.Baseline, 0) + ISNULL(ss.SumMonthHrs, 0)) > 0 THEN 'DERIVED'
                         ELSE 'NONE' END AS Source,
                    sl.SrarYear, sl.SrarMonth, dl.DartDate
            FROM        esd e
            LEFT  JOIN  srar_last sl ON sl.UID = e.UID
            LEFT  JOIN  dart_last dl ON dl.UID = e.UID
            LEFT  JOIN  srar_sum  ss ON ss.UID = e.UID
        """
        cursor.execute(query, [ship_uid])
        columns = [column[0] for column in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return [row for row in rows if row.get("Source") != "NONE"]

    def _sync_equipment_rhsi(self, rows):
        """Writes RHSI onto ShipEquipment and the EquipmentName the KPIs read from.

        Two guards, in this order, matching the reference project's own
        (fetch_sfd_from_cmms): `rhsi_initialised` means Ship Staff have already committed
        the one-time RHSI decision on the RHSI Master page — a re-sync must never
        overturn that, including a decision of "no running hours". Then fill-if-blank
        (a non-empty `eq_rhsi` with the flag not yet set), so a figure entered before this
        richer sync existed also survives. Previously this ALWAYS overwrote eq_rhsi
        unconditionally on every Step 1 re-run, silently clobbering anything Ship Staff
        had committed on /RHSI Master.

        ems.EquipmentName.rhsi is what the running-hour KPIs consume
        (ems.views.thumbnail_data and SearchResultRunningHoursBasedLessThanOneKAPIView).
        sfd.views mirrors ShipEquipment.eq_rhsi onto it (see the RHSI screen at
        sfd/views.py), so the same pair is written here — note the two columns differ in
        type: eq_rhsi is a CharField (the "H.MM" pseudo-decimal string), EquipmentName.rhsi
        is a FloatField (the same value as a real number).
        """
        counts = {
            "rhsi_matched": 0,
            "rhsi_unmatched": 0,
            "rhsi_preserved": 0,
            "rhsi_source_counts": {"SRAR": 0, "DART": 0, "DERIVED": 0},
        }
        with transaction.atomic():
            for row in rows:
                detail_uid = _clean_text(row.get("EquipmentShipDetailUid"))
                source = row.get("Source")
                if not detail_uid or not source:
                    continue

                ship_equipment = ShipEquipment.objects.filter(
                    t_equipment_ship_detail=detail_uid
                ).first()
                if not ship_equipment:
                    # A reading for equipment that is no longer fitted on this hull.
                    counts["rhsi_unmatched"] += 1
                    continue

                if ship_equipment.rhsi_initialised or ship_equipment.eq_rhsi:
                    counts["rhsi_preserved"] += 1
                    continue

                text, number = _cmms_rhsi_to_pseudo(row.get("RhsiBestEffort"))
                if text is None:
                    continue

                updated_until = None
                if source == "SRAR":
                    year = to_int(row.get("SrarYear"))
                    month = to_int(row.get("SrarMonth"))
                    if year and month and 1 <= month <= 12:
                        updated_until = datetime_from_cmms(datetime(year, month, 1))
                elif source == "DART":
                    updated_until = row.get("DartDate")

                ship_equipment.eq_rhsi = text
                ship_equipment.rhsi_updated_until = updated_until
                ship_equipment.save(update_fields=["eq_rhsi", "rhsi_updated_until"])

                EquipmentName.objects.filter(sfd_equipment=ship_equipment).update(
                    rhsi=number, rhsi_updated_until=updated_until
                )
                counts["rhsi_matched"] += 1
                counts["rhsi_source_counts"][source] = (
                    counts["rhsi_source_counts"].get(source, 0) + 1
                )
        return counts

    def _fetch_defect_masters(self, cursor):
        """Reads each defect master with `SELECT *`.

        `SELECT *` rather than an explicit column list on purpose: these tables differ
        between CMMS deployments and MSSQL rejects a whole statement on the first unknown
        column — the same trap that made Step 1 fail outright on ILMSCustomerCode. Every
        field is read back through row.get(), so an absent column is simply None.
        """
        fetched = {}
        for label, _model, table, _key, where in self._DEFECT_MASTERS:
            query = f"SELECT * FROM [{table}] WITH (NOLOCK)"
            if where:
                query += f" WHERE {where}"
            cursor.execute(query)
            columns = [column[0] for column in cursor.description]
            fetched[label] = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return fetched

    def _sync_defect_masters(self, fetched):
        counts = {}

        def _int_flag(value):
            # CMMS stores these as `bit`; the local columns are IntegerField.
            return None if value is None else int(bool(value))

        department_by_uid = {}

        def _department(uid):
            uid = _clean_text(uid)
            if not uid:
                return None
            if uid not in department_by_uid:
                department_by_uid[uid] = Department.objects.filter(
                    universal_id_m_department=uid
                ).first()
            return department_by_uid[uid]

        # Per-table field mapping. CreatedBy/UpdatedBy are deliberately omitted for
        # MSeverity: on that model they are FKs to AUTH_USER_MODEL, and CMMS supplies its
        # own integer user ids, which do not correspond to local users.
        builders = {
            "Ch_Master_Symptoms": lambda row: {
                "symptom_id": to_int(row.get("Symptom_ID")),
                "symptom_code": row.get("Symptom_Code"),
                "active": _int_flag(row.get("Active")),
                "created_by": _clean_text(row.get("CreatedBy")) or None,
                "created_date": datetime_from_cmms(row.get("CreatedDate")),
                "updated_by": _clean_text(row.get("UpdatedBy")) or None,
                "updated_date": datetime_from_cmms(row.get("UpdatedDate")),
                "universal_id_m_department": row.get("Universal_ID_M_Department"),
                "department": _department(row.get("Universal_ID_M_Department")),
                "universal_id_a_user_created_by": row.get(
                    "Universal_ID_A_User_Created_By"
                ),
                "universal_id_a_user_updated_by": row.get(
                    "Universal_ID_A_User_Updated_By"
                ),
            },
            "M_Severity": lambda row: {
                "severity_id": to_int(row.get("SeverityID")),
                "severity_code": row.get("SeverityCode"),
                "severity_name": row.get("SeverityName"),
                "isms_severity_code": row.get("ISMSSeverityCode"),
                "active": _int_flag(row.get("Active")),
                "created_date": datetime_from_cmms(row.get("CreatedDate")),
                "updated_date": datetime_from_cmms(row.get("UpdatedDate")),
                "universal_id_a_user_created_by": row.get(
                    "Universal_ID_A_User_Created_By"
                ),
                "universal_id_a_user_updated_by": row.get(
                    "Universal_ID_A_User_Updated_By"
                ),
            },
            # DiagnosticName/DiagnosticCode come back space-padded from CMMS
            # (char columns), hence _clean_text on every text field here.
            "M_Diagnostic": lambda row: {
                "diagnostic_id": to_int(row.get("DiagnosticId")),
                "diagnostic_code": _clean_text(row.get("DiagnosticCode")) or None,
                "diagnostic_name": _clean_text(row.get("DiagnosticName")) or None,
                "isms_diagnostic_code": _clean_text(row.get("ISMSDiagnosticCode"))
                or None,
                "active": _int_flag(row.get("Active")),
                "created_by": _clean_text(row.get("CreatedBy")) or None,
                "created_date": datetime_from_cmms(row.get("CreatedDate")),
                "updated_by": _clean_text(row.get("UpdatedBy")) or None,
                "updated_date": datetime_from_cmms(row.get("UpdatedDate")),
                "universal_id_m_department": row.get("Universal_ID_M_Department"),
                "department": _department(row.get("Universal_ID_M_Department")),
                "universal_id_a_user_created_by": row.get(
                    "Universal_ID_A_User_Created_By"
                ),
                "universal_id_a_user_updated_by": row.get(
                    "Universal_ID_A_User_Updated_By"
                ),
            },
            "Ch_Master_Other_Ship_Remarks_By": lambda row: {
                "ship_remarks_id": to_int(row.get("ShipRemarksID")),
                "description": row.get("Description"),
                "active": _int_flag(row.get("Active")),
                "created_date": datetime_from_cmms(row.get("CreatedDate")),
                "updated_date": datetime_from_cmms(row.get("UpdatedDate")),
                "universal_id_a_user_created_by": row.get(
                    "Universal_ID_A_User_Created_By"
                ),
                "universal_id_a_user_updated_by": row.get(
                    "Universal_ID_A_User_Updated_By"
                ),
            },
            "Ch_Master_Ship_Remarks_By": lambda row: {
                "ship_remark_by_id": to_int(row.get("Ship_Remark_By_ID")),
                "description": row.get("Description"),
                "active": _int_flag(row.get("Active")),
                "created_date": datetime_from_cmms(row.get("CreatedDate")),
                "updated_date": datetime_from_cmms(row.get("UpdatedDate")),
                "universal_id_a_user_created_by": row.get(
                    "Universal_ID_A_User_Created_By"
                ),
                "universal_id_a_user_updated_by": row.get(
                    "Universal_ID_A_User_Updated_By"
                ),
            },
            "M_RequiredAssistance": lambda row: {
                "required_assistance_id": to_int(row.get("RequiredAssistanceID")),
                "required_assistance_for": row.get("RequiredAssistanceFor"),
                "active": bool(row.get("Active", True)),
                "created_by": _clean_text(row.get("CreatedBy")) or None,
                "created_date": datetime_from_cmms(row.get("CreatedDate")),
                "updated_by": _clean_text(row.get("UpdatedBy")) or None,
                "updated_date": datetime_from_cmms(row.get("UpdatedDate")),
                "universal_id_m_department": row.get("Universal_ID_M_Department"),
                "universal_id_a_user_created_by": row.get(
                    "Universal_ID_A_User_Created_By"
                ),
                "universal_id_a_user_updated_by": row.get(
                    "Universal_ID_A_User_Updated_By"
                ),
                "required_assistance_code": row.get("RequiredAssistanceCode"),
            },
            "M_OSTList": lambda row: {
                "name": _clean_text(row.get("OSTList")) or "",
                "code": (_clean_text(row.get("OSTList")) or "")[:15],
                "status": 1 if bool(row.get("Active", True)) else 2,
            },
            "M_RepairAgency": lambda row: {
                "repair_agency_id": to_int(row.get("RepairAgencyID")),
                "repair_agency_code": row.get("RepairAgencyCode"),
                "repair_agency_name": row.get("RepairAgencyName"),
                "isms_repair_agency_code": row.get("ISMSRepairAgencyCode"),
                "active": _int_flag(row.get("Active")),
                "created_by": _clean_text(row.get("CreatedBy")) or None,
                "created_date": datetime_from_cmms(row.get("CreatedDate")),
                "updated_by": _clean_text(row.get("UpdatedBy")) or None,
                "updated_date": datetime_from_cmms(row.get("UpdatedDate")),
                "universal_id_a_user_created_by": row.get(
                    "Universal_ID_A_User_Created_By"
                ),
                "universal_id_a_user_updated_by": row.get(
                    "Universal_ID_A_User_Updated_By"
                ),
            },
            # MDeferment/MReason/MInability's *_id columns are the model's actual
            # primary key (unlike the other masters above, where it's a plain int
            # column alongside an implicit auto id) -- CMMS's own numeric id has to be
            # supplied here since these local ids are not auto-assigned.
            "M_Deferment": lambda row: {
                "deferment_id": to_int(row.get("DefermentID")),
                "deferment_code": row.get("DefermentCode"),
                "description": row.get("Description"),
                "isms_deferment_code": row.get("ISMSDefermentCode"),
                "active": bool(row.get("Active", True)),
                "created_by": _clean_text(row.get("CreatedBy")) or None,
                "created_date": datetime_from_cmms(row.get("CreatedDate")),
                "updated_by": _clean_text(row.get("UpdatedBy")) or None,
                "updated_date": datetime_from_cmms(row.get("UpdatedDate")),
                "universal_id_a_user_created_by": row.get(
                    "Universal_ID_A_User_Created_By"
                ),
                "universal_id_a_user_updated_by": row.get(
                    "Universal_ID_A_User_Updated_By"
                ),
            },
            "M_Reason": lambda row: {
                "reason_id": to_int(row.get("ReasonID")),
                "reason_code": row.get("ReasonCode"),
                "description": row.get("Description"),
                "isms_reason_code": row.get("ISMSReasonCode"),
                "active": bool(row.get("Active", True)),
                "created_by": _clean_text(row.get("CreatedBy")) or None,
                "created_date": datetime_from_cmms(row.get("CreatedDate")),
                "updated_by": _clean_text(row.get("UpdatedBy")) or None,
                "updated_date": datetime_from_cmms(row.get("UpdatedDate")),
                "universal_id_a_user_created_by": row.get(
                    "Universal_ID_A_User_Created_By"
                ),
                "universal_id_a_user_updated_by": row.get(
                    "Universal_ID_A_User_Updated_By"
                ),
            },
            "M_Inability": lambda row: {
                "inability_id": to_int(row.get("InabilityID")),
                "inability_code": row.get("InabilityCode"),
                "description": row.get("Description"),
                "isms_inability_code": row.get("ISMSInabilityCode"),
                "active": bool(row.get("Active", True)),
                "created_by": _clean_text(row.get("CreatedBy")) or None,
                "created_date": datetime_from_cmms(row.get("CreatedDate")),
                "updated_by": _clean_text(row.get("UpdatedBy")) or None,
                "updated_date": datetime_from_cmms(row.get("UpdatedDate")),
                "universal_id_a_user_created_by": row.get(
                    "Universal_ID_A_User_Created_By"
                ),
                "universal_id_a_user_updated_by": row.get(
                    "Universal_ID_A_User_Updated_By"
                ),
                "universal_id_m_reason": row.get("Universal_ID_M_Reason"),
            },
            # CMMS's own M_Establishment uses lowercase column names, unlike the
            # PascalCase tables above -- matches MEstablishment's db_column choices.
            "M_Establishment": lambda row: {
                "est_id": to_int(row.get("est_id")),
                "est_name": row.get("est_name"),
                "command_id": to_int(row.get("command_id")),
                "authority_id": to_int(row.get("authority_id")),
                "active": bool(row.get("active", True)),
                "created_by": to_int(row.get("created_by")),
                "created_date": datetime_from_cmms(row.get("created_date")),
                "updated_by": to_int(row.get("updated_by")),
                "updated_date": datetime_from_cmms(row.get("updated_date")),
                "universal_id_m_command": row.get("universal_id_m_command"),
                "universal_id_m_opsauthority": row.get("universal_id_m_opsauthority"),
                "universal_id_a_user_created_by": row.get(
                    "universal_id_a_user_created_by"
                ),
                "universal_id_a_user_updated_by": row.get(
                    "universal_id_a_user_updated_by"
                ),
                "universal_id_m_establishmentcategory": to_int(
                    row.get("universal_id_m_establishmentcategory")
                ),
            },
            # required_assistance_id is a local AutoField primary key here (unlike
            # MDeferment/MReason/MInability above), so CMMS's RequiredAssistanceID is
            # deliberately not written into it.
            "M_RequiredAssistance": lambda row: {
                "required_assistance_for": _clean_text(row.get("RequiredAssistanceFor"))
                or None,
                "required_assistance_code": _clean_text(
                    row.get("RequiredAssistanceCode")
                )
                or None,
                "active": bool(row.get("Active", True)),
                "created_by": to_int(row.get("CreatedBy")),
                "created_date": datetime_from_cmms(row.get("CreatedDate")),
                "updated_by": to_int(row.get("UpdatedBy")),
                "updated_date": datetime_from_cmms(row.get("UpdatedDate")),
                "universal_id_m_department": row.get("Universal_ID_M_Department"),
                "universal_id_a_user_created_by": row.get(
                    "Universal_ID_A_User_Created_By"
                ),
                "universal_id_a_user_updated_by": row.get(
                    "Universal_ID_A_User_Updated_By"
                ),
            },
        }

        with transaction.atomic():
            for label, model, _table, key_column, _where in self._DEFECT_MASTERS:
                rows = fetched.get(label) or []
                key_field = next(
                    (
                        field.name
                        for field in model._meta.fields
                        if field.column == key_column
                        or field.name == key_column
                        or field.name == key_column.lower()
                    ),
                    (
                        "universal_id_m_required_assistance"
                        if key_column == "Universal_ID_M_RequiredAssistance"
                        else ("name" if key_column == "OSTList" else key_column.lower())
                    ),
                )
                created_count = synced_count = 0
                for row in rows:
                    key_value = _clean_text(row.get(key_column))
                    if not key_value:
                        continue
                    _, created = model.objects.update_or_create(
                        **{key_field: key_value},
                        defaults=builders[label](row),
                    )
                    synced_count += 1
                    if created:
                        created_count += 1
                counts[label] = (created_count, synced_count, len(rows))

        return counts

    def _build_log(
        self, ship_identifier, target_ship, row_count, counts, defect_master_counts=None
    ):
        ship_uid = target_ship.get("Universal_ID_M_Ship")
        ship_name = target_ship.get("ShipName") or ""
        ship_code = target_ship.get("ShipCode") or ""
        defect_master_lines = []
        for label, _model, _table, _key, _where in self._DEFECT_MASTERS:
            created_count, synced_count, fetched_count = (
                defect_master_counts or {}
            ).get(label, (0, 0, 0))
            defect_master_lines.append(
                f"[OK] {label} ({created_count} new, {synced_count} synced "
                f"of {fetched_count} fetched)"
            )
        return "\n".join(
            [
                "[SYSTEM] Starting CMMS SFD Sync...",
                f"[OK] .env ship identifier: {ship_identifier}",
                (
                    "[OK] M_Ship resolved: "
                    f"{ship_name} / {ship_code} / Universal_ID_M_Ship={ship_uid}"
                ),
                f"Fetched {row_count} T_EquipmentShipDetail records. Processing start...",
                f"[OK] M_Ship ({counts['ship']} new ships synced)",
                f"[OK] M_Department ({counts['department']} new departments synced)",
                (
                    "[OK] M_SubDepartment "
                    f"({counts['sub_department']} new sub-departments synced)"
                ),
                f"[OK] EMS SectionName ({counts['section']} new sections synced)",
                f"[OK] M_Equipment ({counts['equipment']} new equipments synced)",
                f"[OK] M_EquipmentType ({counts['equipment_type']} new equipment types synced)",
                f"[OK] M_Supplier ({counts['supplier']} new suppliers synced)",
                (
                    "[OK] T_EquipmentShipDetail "
                    f"({counts['ship_equipment']} new ship equipments synced)"
                ),
                f"[OK] EMS EquipmentName ({counts['ems_equipment']} new records synced)",
                (
                    "[OK] Master_manufacturer "
                    f"({counts['master_manufacturer']} new manufacturers synced)"
                ),
                (
                    "[OK] Master_equipmenttype "
                    f"({counts['master_equipment_type']} new equipment types synced)"
                ),
                (
                    "[OK] Master_equipment "
                    f"({counts['master_equipment']} new master equipment synced)"
                ),
                (
                    "[OK] Master_supplier "
                    f"({counts['master_supplier']} new master suppliers synced)"
                ),
                (
                    "[OK] M_Supplier full catalog (ship-independent) "
                    f"({counts.get('supplier_catalog', 0)} new suppliers/manufacturers synced)"
                ),
                (
                    "[OK] M_SubDepartment full catalog (ship-class scoped) "
                    f"({counts.get('subdepartment_catalog', 0)} new sub-departments synced)"
                ),
                (
                    "[OK] Equipment RHSI from monthly SRAR "
                    f"({counts.get('rhsi_matched', 0)} equipment updated, "
                    f"{counts.get('rhsi_unmatched', 0)} readings for equipment no longer "
                    f"fitted, {counts.get('rhsi_fetched', 0)} readings fetched)"
                ),
                *defect_master_lines,
                "[Completed] Step 1 CMMS SFD Sync completed successfully.",
            ]
        )

    def get(self, request):
        return self.post(request)

    def post(self, request):
        return StreamingHttpResponse(
            self._stream_sync(full=request.GET.get("full") in ("1", "true", "True")),
            content_type="text/plain",
        )

    def _stream_sync(self, full=False):
        """Same phases `get()` used to run blocking (fetch ship -> sync SFD rows -> sync
        suppliers -> sync sub-departments -> sync RHSI -> sync defect masters -> build the
        final log), now yielded as they complete instead of collected and returned in one
        shot -- matching CMMSMaintopSyncAPI/CMMSDefectSyncAPI/CMMSSrarPullAPI's own
        StreamingHttpResponse pattern in this file, and what SfdReferencesApiService.streamSync
        already expects (it was only ever CMMSFDDataAPI/Step 1 still sending one blocking
        response after the whole ~30s sync finished, with nothing shown in the log until then).

        The interim heartbeats below deliberately avoid the exact wording `_build_log()` uses
        for its own counted lines (e.g. "Fetched N ... records") -- the frontend sums every
        "Fetched"/"[OK] Saved" line it sees across the whole stream, so echoing the same
        phrase twice would double-count. `_build_log()` itself is unchanged and still yielded
        once, in full, right at the end, as the single source of truth for every tallied
        count the completion summary reads.

        A run interrupted partway leaves a checkpoint behind and the next one resumes from
        it; `full=True` throws that away and re-syncs everything, which is what a deliberate
        re-sync (rather than a recovery) wants.
        """
        if full:
            clear_module(self.RESUME_MODULE)
        conn = None
        cursor = None

        try:
            yield "[SYSTEM] Starting CMMS SFD Sync...\n"

            ship_identifier = self._env_ship_identifier()
            if not ship_identifier:
                yield "[FATAL] Ship identifier is not configured.\n"
                return

            yield "[SYSTEM] Connecting to CMMS...\n"
            conn = get_mssql_connection()
            cursor = conn.cursor()

            target_ship = self._fetch_target_ship(cursor, ship_identifier)
            if not target_ship:
                yield f"[FATAL] Ship '{ship_identifier}' not found in CMMS M_Ship.\n"
                return
            yield (
                "[OK] M_Ship resolved: "
                f"{target_ship.get('ShipName') or ''} / {target_ship.get('ShipCode') or ''}\n"
            )

            rows = self._fetch_ship_equipment_rows(
                cursor, target_ship.get("Universal_ID_M_Ship")
            )
            yield f"[SYSTEM] Retrieved {len(rows)} equipment records from CMMS, processing...\n"
            # _sync_rows_to_swmm is itself a generator now (see its own heartbeat comment) —
            # `yield from` drains its progress lines through to this stream while still
            # capturing its `return counts` as this expression's value.
            counts = yield from self._sync_rows_to_swmm(target_ship, rows)
            yield "[OK] SFD equipment data synced (ships, departments, equipment, suppliers).\n"

            # The catalog/RHSI/defect-master phases that follow are each a single pass over
            # a few hundred to a few thousand rows, so they are checkpointed whole rather
            # than per row: an interrupted run that already finished the supplier catalog
            # does not pull it again, and the one phase that was actually in flight is the
            # only one redone.
            if phase_completed(self.RESUME_MODULE, "supplier_catalog"):
                yield "[RESUMED] Supplier catalog already synced by the interrupted run.\n"
            else:
                yield "[SYSTEM] Syncing supplier catalog...\n"
                supplier_rows = self._fetch_all_active_suppliers(cursor)
                counts.update(self._sync_all_suppliers(supplier_rows))
                mark_phase_complete(self.RESUME_MODULE, "supplier_catalog")
                yield "[OK] Supplier catalog synced.\n"

            if phase_completed(self.RESUME_MODULE, "subdepartment_catalog"):
                yield (
                    "[RESUMED] Sub-department catalog already synced by the interrupted "
                    "run.\n"
                )
            else:
                yield "[SYSTEM] Syncing sub-department catalog...\n"
                subdept_rows = self._fetch_all_subdepartments(
                    cursor, target_ship.get("Universal_ID_M_ShipClass")
                )
                counts.update(self._sync_all_subdepartments(subdept_rows))
                mark_phase_complete(self.RESUME_MODULE, "subdepartment_catalog")
                yield "[OK] Sub-department catalog synced.\n"
                for line in counts.pop("_subdept_report_lines", []):
                    yield f"{line}\n"

            if phase_completed(self.RESUME_MODULE, "equipment_rhsi"):
                yield "[RESUMED] Equipment RHSI already synced by the interrupted run.\n"
            else:
                yield "[SYSTEM] Syncing equipment RHSI (SRAR, then DART, then derived)...\n"
                rhsi_rows = self._fetch_equipment_rhsi(
                    cursor, target_ship.get("Universal_ID_M_Ship")
                )
                counts.update(self._sync_equipment_rhsi(rhsi_rows))
                counts["rhsi_fetched"] = len(rhsi_rows)
                rhsi_sources = counts.pop("rhsi_source_counts", {})
                mark_phase_complete(self.RESUME_MODULE, "equipment_rhsi")
                yield (
                    "[OK] Equipment RHSI synced — "
                    f"{counts.get('rhsi_matched', 0)} written "
                    f"(SRAR: {rhsi_sources.get('SRAR', 0)}, "
                    f"DART: {rhsi_sources.get('DART', 0)}, "
                    f"derived: {rhsi_sources.get('DERIVED', 0)}), "
                    f"{counts.get('rhsi_preserved', 0)} already committed on RHSI Master and left untouched.\n"
                )

            defect_master_counts = None
            if phase_completed(self.RESUME_MODULE, "defect_masters"):
                yield "[RESUMED] Defect masters already synced by the interrupted run.\n"
            else:
                yield "[SYSTEM] Syncing defect masters...\n"
                master_rows = self._fetch_defect_masters(cursor)
                defect_master_counts = self._sync_defect_masters(master_rows)
                mark_phase_complete(self.RESUME_MODULE, "defect_masters")
                yield "[OK] Defect masters synced.\n"

            yield self._build_log(
                ship_identifier,
                target_ship,
                len(rows),
                counts,
                defect_master_counts,
            )

            # Only a clean run to the end clears them — an interruption never reaches here,
            # which is exactly what leaves the resume point behind.
            clear_module(self.RESUME_MODULE)

        except Exception as e:
            logger.exception("CMMS SFD sync failed")
            yield f"\n[FATAL] CMMS SFD Sync Failed: {e}\n"
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()


def cmms_row_count(cursor, table, where):
    """Row count for `where`, falling back to the whole table when the filter matches none.

    Mirrors the fetch's own primary/fallback choice so the progress denominator and the
    rows actually streamed always come from the same query.
    """
    cursor.execute(f"SELECT COUNT(*) FROM {table} WITH (NOLOCK) WHERE {where}")
    count = cursor.fetchone()[0]
    if count:
        return count, where
    cursor.execute(f"SELECT COUNT(*) FROM {table} WITH (NOLOCK)")
    return cursor.fetchone()[0], None


def iter_cmms_rows(cursor, table, where, chunk_size=5000, order_by=None, start_offset=0):
    """Stream a CMMS table in chunks, yielding (columns, rows) per chunk.

    T_MaintopDetail is ~295k rows: `fetchall()` spent ~19s building the entire result set
    in Python before a single row could be written, and held all of it in memory at once.
    Chunked reads let the local upserts start on the first chunk and overlap the rest of
    the fetch, with bounded memory.

    `order_by` and `start_offset` are what make an interrupted pull resumable. Without an
    ORDER BY, SQL Server is entitled to return the same rows in a different order on a
    different plan, and "we got as far as row 40000" would then skip 40000 rows that are not
    the ones already done — so the offset is only ever honoured alongside an explicit
    ordering, and the caller re-verifies the row at the boundary before trusting it (see
    StreamCheckpoint). Skipping server-side rather than reading and discarding locally is
    the point: the rows already synced are never fetched over the link a second time.
    """
    clause = f" WHERE {where}" if where else ""
    ordering = ""
    if order_by:
        ordering = f" ORDER BY {order_by}"
        if start_offset:
            # OFFSET is only legal after an ORDER BY in T-SQL, which is the same constraint
            # correctness imposes here anyway.
            ordering += f" OFFSET {int(start_offset)} ROWS"
    cursor.execute(f"SELECT * FROM {table}{clause}{ordering}")
    columns = [column[0] for column in cursor.description]
    while True:
        rows = cursor.fetchmany(chunk_size)
        if not rows:
            break
        yield columns, rows


def cmms_key_at_offset(cursor, table, where, order_by, offset):
    """The ordering key of the row at `offset` under the same ORDER BY iter_cmms_rows uses.

    Used to prove a resume offset still points at the row the checkpoint was taken against,
    before any rows are skipped on the strength of it.

    Returns None if the row cannot be read for any reason — including OFFSET/FETCH not being
    available on an older SQL Server. A None answer fails the caller's verification and the
    phase simply runs in full, which is the same outcome as before resume existed; letting
    the exception out would instead turn a resumable sync into a broken one.
    """
    clause = f" WHERE {where}" if where else ""
    try:
        cursor.execute(
            f"SELECT {order_by} FROM {table}{clause} ORDER BY {order_by} "
            f"OFFSET {int(offset)} ROWS FETCH NEXT 1 ROWS ONLY"
        )
        row = cursor.fetchone()
    except Exception:
        logger.exception(
            "Could not read the resume boundary row for %s; re-syncing in full", table
        )
        return None
    return row[0] if row else None


class CMMSMaintopSyncAPI(APIView):
    """Pulls T_MaintopHeader/T_MaintopDetail for only the Maintop headers this ship's own
    equipment actually references.

    CMMS's T_MaintopHeader/T_MaintopDetail together run into the hundreds of thousands of
    rows fleet-wide, but a given ship's fit only ever points at a small subset of them — the
    Universal_ID_T_MaintopHeader that Step 1 (CMMSFDDataAPI) already saved onto each
    ShipEquipment row from M_Equipment.Universal_ID_T_MaintopHeader. Scoping the CMMS query
    to that set (instead of pulling every ship's routines into local tables and filtering
    later) keeps what actually lands locally limited to this ship's own maintops/routines.
    Row-by-row `update_or_create()` would still be far too slow for a single blocking HTTP
    response even at this smaller scope, so this still streams progress as it goes
    (StreamingHttpResponse, matching what SfdReferencesApiService.streamSync already
    expects) and writes in bulk batches (bulk_create(update_conflicts=True), Postgres
    upsert) instead of one query pair per row.
    """

    _BATCH_SIZE = 2000
    permission_classes = [CanInitialiseShipData]

    # Module name this step's resume checkpoints are filed under.
    RESUME_MODULE = "step2_maintop"

    def get(self, request):
        return self.post(request)

    def post(self, request):
        # Server-side enforcement of the same gate the frontend already disables Step 2
        # behind — a gate only the client enforces is not a gate: a direct API call or a
        # stale tab left open from before Step 1 finished could otherwise run Step 2 over
        # equipment that still has no sub department, burying the gap under a second
        # import instead of surfacing it while it's still cheap to fix. Checked before the
        # StreamingHttpResponse is created, since a stream already in flight can't be
        # turned into a different status code.
        try:
            unassigned_total, by_department = _sub_department_readiness()
        except Exception:
            logger.exception("CMMSMaintopSyncAPI readiness check failed")
            return Response(
                {
                    "status": False,
                    "message": "Could not verify Sub Department readiness — Step 2 was not started.",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        if unassigned_total > 0:
            breakdown = ", ".join(
                f"{d['department']}: {d['unassigned']}" for d in by_department
            )
            return Response(
                {
                    "status": False,
                    "message": (
                        f"Step 2 is blocked — {unassigned_total} Active equipment still "
                        f"have no Sub Department ({breakdown}). Assign them from RHSI "
                        f"Master (Reference Data) first, then retry Step 2."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )
        return StreamingHttpResponse(
            self._stream_sync(
                full=request.GET.get("full") in ("1", "true", "True"),
            ),
            content_type="text/plain",
        )

    def _ship_header_uids(self):
        """Universal_ID_T_MaintopHeader values this ship's own equipment points at.

        Populated onto ShipEquipment by Step 1 (CMMSFDDataAPI) from
        M_Equipment.Universal_ID_T_MaintopHeader, which CMMS derives from
        T_EquipmentShipDetail's fitted equipment — i.e. this is the local mirror of
        "every Maintop this ship's own T_EquipmentShipDetail rows reference".
        """
        this_ship = get_this_ship()
        if not this_ship:
            return set()
        return set(
            ShipEquipment.objects.filter(ship=this_ship)
            .exclude(universal_id_t_maintop_header__isnull=True)
            .exclude(universal_id_t_maintop_header="")
            .values_list("universal_id_t_maintop_header", flat=True)
        )

    @staticmethod
    def _uid_in_clause(column, uids):
        quoted = ",".join("'" + uid.replace("'", "''") + "'" for uid in uids)
        return f"{column} IN ({quoted})"

    _HEADER_UPDATE_FIELDS = [
        "maintop_no",
        "maintop_title",
        "original_date",
        "amendment_no",
        "amendment_date",
        "authority",
        "flag",
        "active",
        "created_by",
        "created_date",
        "updated_by",
        "updated_date",
        "reference",
        "department",
        "is_non_digitized",
        "fuss_id",
        "equipmentcode",
        "equipment_specification",
        "ship_applicable",
        "documents",
        "reason",
        "issue_date",
        "universal_id_a_user_created_by",
        "universal_id_a_user_updated_by",
        "universal_id_t_maintopheader",
        "universal_id_t_fuss",
        "authority_date",
        "is_draft",
    ]

    _DETAIL_UPDATE_FIELDS = [
        "maintopheader_f_key",
        "frequency_f_key",
        "routine_no",
        "routine_description",
        "routine_brief_description",
        "maintop_id",
        "maintop_no",
        "amendment_no",
        "frequency_id",
        "frequency",
        "frequency_sr_no",
        "group_heading",
        "para_heading",
        "alternate_info",
        "by_whom",
        "category",
        "dockyard_remarks",
        "admin_remarks",
        "jic_id",
        "active",
        "created_by",
        "created_date",
        "updated_by",
        "updated_date",
        "amendment_date",
        "by_whom_id1",
        "by_whom_id2",
        "by_whom_id3",
        "freq_priority",
        "universal_id_a_user_created_by",
        "universal_id_a_user_updated_by",
        "universal_id_t_maintopdetail",
        "universal_id_t_maintopheader",
        "universal_id_m_frequency",
        "universal_id_t_maintopjic",
        "universal_id_m_bywhom1",
        "universal_id_m_bywhom2",
        "universal_id_m_bywhom3",
        "jic",
        "ss_proposal",
        "applicable_eqpt",
        "insma_recommendations",
        "remarks",
        "reason",
        "routine_type",
        "ship_id",
        "comment",
        "remove_reason",
        "is_synced",
    ]

    def _header_instance(self, row: dict) -> MaintopHeader:
        return MaintopHeader(
            maintop_id=row.get("MaintopID"),
            maintop_no=row.get("MaintopNo"),
            maintop_title=row.get("MaintopTitle"),
            original_date=datetime_from_cmms(row.get("OriginalDate")),
            amendment_no=row.get("AmendmentNo"),
            amendment_date=datetime_from_cmms(row.get("AmendmentDate")),
            authority=row.get("Authority"),
            flag=row.get("Flag"),
            active=row.get("Active"),
            created_by=row.get("CreatedBy"),
            created_date=datetime_from_cmms(row.get("CreatedDate")),
            updated_by=row.get("UpdatedBy"),
            updated_date=datetime_from_cmms(row.get("UpdatedDate")),
            reference=row.get("Reference"),
            department=row.get("Department"),
            is_non_digitized=row.get("IsNonDigitized"),
            fuss_id=row.get("FussID"),
            equipmentcode=row.get("EquipmentCode"),
            equipment_specification=row.get("EquipmentSpecification"),
            ship_applicable=row.get("ShipApplicable"),
            documents=row.get("Documents"),
            reason=row.get("Reason"),
            issue_date=datetime_from_cmms(row.get("IssueDate")),
            universal_id_a_user_created_by=row.get("Universal_ID_A_User_Created_By"),
            universal_id_a_user_updated_by=row.get("Universal_ID_A_User_Updated_By"),
            universal_id_t_maintopheader=row.get("Universal_ID_T_MaintopHeader"),
            universal_id_t_fuss=row.get("Universal_ID_T_Fuss"),
            authority_date=datetime_from_cmms(row.get("AuthorityDate")),
            is_draft=row.get("IsDraft"),
        )

    def _detail_instance(
        self, row: dict, header_ids: set, frequency_pk_map: dict
    ) -> MaintopDetail:
        maintop_id = row.get("MaintopID")
        frequency_uid = row.get("Universal_ID_M_Frequency")
        return MaintopDetail(
            routine_id=row.get("RoutineID"),
            # Only link to a header that's actually present in this same sync run (its own
            # bulk_create just committed it) — Postgres would reject the FK otherwise.
            maintopheader_f_key_id=maintop_id if maintop_id in header_ids else None,
            frequency_f_key_id=frequency_pk_map.get(frequency_uid),
            universal_id_t_maintopdetail=row.get("Universal_ID_T_MaintopDetail"),
            routine_no=row.get("RoutineNo"),
            routine_description=row.get("RoutineDescription"),
            routine_brief_description=row.get("RoutineBriefDescription"),
            maintop_id=maintop_id,
            maintop_no=row.get("MaintopNo"),
            amendment_no=row.get("AmendmentNo"),
            frequency_id=row.get("FrequencyID"),
            frequency=row.get("Frequency"),
            frequency_sr_no=row.get("FrequencySrNo"),
            group_heading=row.get("GroupHeading"),
            para_heading=row.get("ParaHeading"),
            alternate_info=row.get("AlternateInfo"),
            by_whom=row.get("ByWhom"),
            category=row.get("Category"),
            dockyard_remarks=row.get("DockyardRemarks"),
            admin_remarks=row.get("AdminRemarks"),
            jic_id=row.get("JICID"),
            active=row.get("Active"),
            created_by=row.get("CreatedBy"),
            created_date=datetime_from_cmms(row.get("CreatedDate")),
            updated_by=row.get("UpdatedBy"),
            updated_date=datetime_from_cmms(row.get("UpdatedDate")),
            amendment_date=datetime_from_cmms(row.get("AmendmentDate")),
            by_whom_id1=row.get("ByWhomId1"),
            by_whom_id2=row.get("ByWhomId2"),
            by_whom_id3=row.get("ByWhomId3"),
            freq_priority=row.get("FreqPriority"),
            universal_id_a_user_created_by=row.get("Universal_ID_A_User_Created_By"),
            universal_id_a_user_updated_by=row.get("Universal_ID_A_User_Updated_By"),
            universal_id_t_maintopheader=row.get("Universal_ID_T_MaintopHeader"),
            universal_id_m_frequency=frequency_uid,
            universal_id_t_maintopjic=row.get("Universal_ID_T_MaintopJIC"),
            universal_id_m_bywhom1=row.get("Universal_ID_M_ByWhom1"),
            universal_id_m_bywhom2=row.get("Universal_ID_M_ByWhom2"),
            universal_id_m_bywhom3=row.get("Universal_ID_M_ByWhom3"),
            jic=row.get("JIC"),
            ss_proposal=row.get("SSProposal"),
            applicable_eqpt=row.get("ApplicableEqpt"),
            insma_recommendations=row.get("INSMARecommendations"),
            remarks=row.get("Remarks"),
            reason=row.get("Reason"),
            routine_type=row.get("RoutineType"),
            ship_id=row.get("Ship_ID"),
            comment=row.get("Comment"),
            remove_reason=row.get("Remove_Reason"),
            is_synced=True,
        )

    def _stream_sync(self, full=False):
        """`full=True` discards any resume checkpoint and re-pulls everything, which is what
        a deliberate re-sync wants; the default picks up where an interrupted run stopped."""
        if full:
            clear_module(self.RESUME_MODULE)
        conn = None
        cursor = None
        try:
            yield "[SYSTEM] Starting CMMS MAINTOPS Sync...\n"

            header_uids = self._ship_header_uids()
            if not header_uids:
                yield (
                    "[FATAL] No Maintop headers found on this ship's own equipment — run "
                    "Step 1 (CMMS SFD Sync) first so ShipEquipment.universal_id_t_maintop_header "
                    "is populated. Nothing to sync.\n"
                )
                return
            yield (
                f"[OK] This ship's equipment references {len(header_uids)} distinct "
                "Maintop headers — scoping the pull to those.\n"
            )

            conn = get_mssql_connection()
            cursor = conn.cursor()

            # --- T_MaintopHeader -> ems.MaintopHeader --------------------------------------
            active_where = "Active = 1 OR Active IS NULL OR Active = '1'"
            header_scope = self._uid_in_clause(
                "Universal_ID_T_MaintopHeader", header_uids
            )
            header_where = f"({active_where}) AND {header_scope}"
            # Not cmms_row_count(): its "fall back to the whole table if the filter
            # matches zero rows" behaviour would silently re-introduce a fleet-wide pull
            # (and its unfiltered progress denominator) the moment this scope matches
            # nothing, which defeats the point of scoping it at all.
            cursor.execute(
                f"SELECT COUNT(*) FROM T_MaintopHeader WITH (NOLOCK) WHERE {header_where}"
            )
            header_total = cursor.fetchone()[0]
            yield f"Fetched {header_total} T_MaintopHeader records. Processing...\n"

            # Resume position for the header pull. The whole pull used to sit inside one
            # transaction.atomic(): an interruption rolled every row of it back, so there was
            # nothing to resume *to* and the retry genuinely had to start over. Each batch
            # now commits on its own, which is what lets the rows already written survive the
            # drop — and it also stops a transaction being held open across the `yield`s,
            # i.e. across the network, for the length of the pull.
            header_checkpoint = StreamCheckpoint(
                self.RESUME_MODULE,
                "maintop_headers",
                total=header_total,
                scope=(header_where,),
            )
            header_offset = 0
            if header_checkpoint.candidate_offset:
                header_offset = header_checkpoint.accept(
                    cmms_key_at_offset(
                        cursor,
                        "T_MaintopHeader",
                        header_where,
                        "MaintopID",
                        header_checkpoint.candidate_offset - 1,
                    )
                )
            if header_checkpoint.resumed:
                yield f"[RESUMED] {header_checkpoint.resume_message()}\n"

            header_ids: set = set()
            header_synced_count = header_offset
            # Position in the ordered result set, which is what the checkpoint offset means.
            # Tracked separately from header_synced_count because a row can be read and then
            # skipped (null MaintopID), and resuming at "rows synced" would then land short
            # of where the pull actually got to and re-read rows for no reason.
            header_consumed = header_offset
            last_header_key = header_checkpoint.expected_key
            batch: list[MaintopHeader] = []

            def flush_headers(rows):
                MaintopHeader.objects.bulk_create(
                    rows,
                    update_conflicts=True,
                    unique_fields=["maintop_id"],
                    update_fields=self._HEADER_UPDATE_FIELDS,
                )

            try:
                for header_columns, chunk in iter_cmms_rows(
                    cursor,
                    "T_MaintopHeader",
                    header_where,
                    order_by="MaintopID",
                    start_offset=header_offset,
                ):
                    for row_tuple in chunk:
                        header_consumed += 1
                        row = dict(zip(header_columns, row_tuple))
                        maintop_id = row.get("MaintopID")
                        if maintop_id is None:
                            continue
                        header_ids.add(maintop_id)
                        batch.append(self._header_instance(row))
                        last_header_key = maintop_id
                        if len(batch) >= self._BATCH_SIZE:
                            with transaction.atomic():
                                flush_headers(batch)
                            header_synced_count += len(batch)
                            batch = []
                            # Recorded only here, on a row that was just committed and whose
                            # key therefore matches the row at header_consumed - 1 in the
                            # ordering — which is exactly what the next run checks.
                            header_checkpoint.advance(header_consumed, last_header_key)
                            yield f"[OK] T_MaintopHeader progress: {header_synced_count}/{header_total}\n"
                if batch:
                    with transaction.atomic():
                        flush_headers(batch)
                    header_synced_count += len(batch)
                    batch = []
            finally:
                # Records the position reached when the loop is torn down mid-pull, so the
                # next attempt skips what this one committed. Never raises and never yields
                # — this also runs under GeneratorExit.
                header_checkpoint.flush()
            header_checkpoint.finish()
            yield f"[OK] T_MaintopHeader ({header_synced_count} Maintop headers synced)\n"

            # The set of headers a detail row may legally point at is "the headers that
            # exist locally", which is what the FK constraint actually checks — not "the
            # headers this particular attempt happened to fetch". Reading it back matters
            # for a resumed run (the headers written before the interruption were skipped
            # above, so header_ids holds only the remainder) and fixes the same hole on an
            # ordinary re-run, where every detail whose header was synced last time had its
            # link silently nulled.
            header_ids |= set(
                MaintopHeader.objects.values_list("maintop_id", flat=True)
            )

            # --- T_MaintopDetail -> ems.MaintopDetail ---------------------------------------
            detail_scope = self._uid_in_clause(
                "Universal_ID_T_MaintopHeader", header_uids
            )
            detail_where = f"({active_where}) AND {detail_scope}"
            cursor.execute(
                f"SELECT COUNT(*) FROM T_MaintopDetail WITH (NOLOCK) WHERE {detail_where}"
            )
            detail_total = cursor.fetchone()[0]
            yield f"Fetched {detail_total} T_MaintopDetail records. Processing...\n"

            frequency_pk_map = {
                frequency.universal_id_m_frequency: frequency.pk
                for frequency in Frequency.objects.all()
            }

            detail_checkpoint = StreamCheckpoint(
                self.RESUME_MODULE,
                "maintop_details",
                total=detail_total,
                scope=(detail_where,),
            )
            detail_offset = 0
            if detail_checkpoint.candidate_offset:
                detail_offset = detail_checkpoint.accept(
                    cmms_key_at_offset(
                        cursor,
                        "T_MaintopDetail",
                        detail_where,
                        "RoutineID",
                        detail_checkpoint.candidate_offset - 1,
                    )
                )
            if detail_checkpoint.resumed:
                yield f"[RESUMED] {detail_checkpoint.resume_message()}\n"

            detail_synced_count = detail_offset
            detail_consumed = detail_offset
            last_detail_key = detail_checkpoint.expected_key
            batch = []

            def flush_details(rows):
                MaintopDetail.objects.bulk_create(
                    rows,
                    update_conflicts=True,
                    unique_fields=["routine_id"],
                    update_fields=self._DETAIL_UPDATE_FIELDS,
                )

            try:
                for columns, chunk in iter_cmms_rows(
                    cursor,
                    "T_MaintopDetail",
                    detail_where,
                    order_by="RoutineID",
                    start_offset=detail_offset,
                ):
                    for row_tuple in chunk:
                        detail_consumed += 1
                        row = dict(zip(columns, row_tuple))
                        # MaintopDetail.routine_id is the model's actual primary key (mirrors
                        # CMMS's own RoutineID) — Universal_ID_T_MaintopDetail is frequently
                        # NULL on this data, so keying on RoutineID (always populated) instead
                        # is what makes every row actually sync instead of getting silently
                        # skipped.
                        if row.get("RoutineID") is None:
                            continue
                        batch.append(
                            self._detail_instance(row, header_ids, frequency_pk_map)
                        )
                        last_detail_key = row.get("RoutineID")
                        if len(batch) >= self._BATCH_SIZE:
                            with transaction.atomic():
                                flush_details(batch)
                            detail_synced_count += len(batch)
                            batch = []
                            detail_checkpoint.advance(
                                detail_consumed, last_detail_key
                            )
                            yield f"[OK] T_MaintopDetail progress: {detail_synced_count}/{detail_total}\n"
                if batch:
                    with transaction.atomic():
                        flush_details(batch)
                    detail_synced_count += len(batch)
                    batch = []
            finally:
                detail_checkpoint.flush()
            detail_checkpoint.finish()
            yield f"[OK] T_MaintopDetail ({detail_synced_count} Maintop details synced)\n"

            clear_module(self.RESUME_MODULE)
            yield "[Completed] Maintop Sync process completed successfully."

        except Exception as exc:
            logger.exception("CMMS Maintop sync failed")
            yield f"\n[ERROR] {exc}\n"
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()


class CMMSRoutineDataAPI(APIView):
    pagination_class = CommonPagination
    permission_classes = [CanInitialiseShipData]

    # Module name this step's resume checkpoints are filed under.
    RESUME_MODULE = "step3_frequency"

    def get(self, request):
        return self.post(request)

    def post(self, request):
        return StreamingHttpResponse(
            self._stream_sync(full=request.GET.get("full") in ("1", "true", "True")),
            content_type="text/plain",
        )

    def _stream_sync(self, full=False):
        """Same phases `get()` used to run blocking (resolve ship -> sync M_Frequency ->
        link MaintopDetail rows to Frequency -> build the final log), now yielded as they
        complete — see CMMSFDDataAPI._stream_sync's docstring for why (this class had the
        identical one-blocking-HttpResponse-at-the-end gap Step 1 did).

        Checkpointed per phase rather than per row: M_Frequency is ~242 rows and the link
        pass is a single bulk_update, so an interrupted run only ever needs to know which of
        the two it was in — a row-level position would cost more to keep than it saves.
        """
        if full:
            clear_module(self.RESUME_MODULE)
        conn = None
        cursor = None

        try:
            yield "[SYSTEM] Starting CMMS Frequency Sync...\n"

            # 1. Resolve the active ship (Step 0 selection, else .env SWMM_SHIP_CODE)
            selected_ship_code = env_ship_code()

            count_frequency = 0
            count_linked = 0
            count_linked_total = 0

            cmms_ship_uid = None
            cmms_ship_code = selected_ship_code or ""

            try:
                conn = get_mssql_connection()
                cursor = conn.cursor()

                # Step 1: Search M_Ship table in CMMS DB using the active ship code/id
                ship_search_query = """
                    SELECT Universal_ID_M_Ship, ShipName, ShipCode
                    FROM M_Ship WITH (NOLOCK)
                    WHERE ShipCode = ? OR Universal_ID_M_Ship = ? OR ShipName LIKE ?
                """
                cursor.execute(
                    ship_search_query,
                    [selected_ship_code, selected_ship_code, f"%{selected_ship_code}%"],
                )
                ship_row = cursor.fetchone()

                if ship_row:
                    cmms_ship_uid = ship_row[0]
                    cmms_ship_code = ship_row[2] or selected_ship_code
                else:
                    # No arbitrary-ship fallback on purpose — see resolve_cmms_ship_uid().
                    yield (
                        f"[SYSTEM] CMMS Frequency Sync for Ship '{selected_ship_code}'...\n"
                        f"[FATAL] Ship code '{selected_ship_code}' (SWMM_SHIP_CODE) not found in "
                        f"CMMS M_Ship. Fix the .env ship code before syncing.\n"
                    )
                    return
                yield (
                    f"[SYSTEM] CMMS Frequency Sync for Ship '{selected_ship_code}' "
                    f"(Universal ID: {cmms_ship_uid})...\n"
                )

                # Step 2a: M_Frequency is a small, ship-independent master (~242 rows) and
                # everything downstream — _routine_category(), AddRoutineDetails.frequency_f_key,
                # Step 4's frequency_map — keys off it, so sync the WHOLE table rather than only
                # the frequencies that happen to appear on this ship's maintop details.
                cursor.execute(
                    """
                    SELECT
                        Universal_ID_M_Frequency,
                        Frequency,
                        Months,
                        Hours,
                        Description,
                        Active
                    FROM M_Frequency WITH (NOLOCK)
                    """
                )
                freq_columns = [column[0] for column in cursor.description]
                freq_rows = cursor.fetchall()
                yield f"Fetched {len(freq_rows)} M_Frequency records. Processing start...\n"

                frequency_done = phase_completed(self.RESUME_MODULE, "frequency")
                if frequency_done:
                    yield (
                        "[RESUMED] M_Frequency already synced by the interrupted run — "
                        "skipping to the MaintopDetail link pass.\n"
                    )
                with transaction.atomic():
                    for row_tuple in [] if frequency_done else freq_rows:
                        row = dict(zip(freq_columns, row_tuple))
                        freq_uid = row.get("Universal_ID_M_Frequency")
                        freq_name = row.get("Frequency")
                        if not (freq_uid or freq_name):
                            continue
                        lookup = (
                            {"universal_id_m_frequency": freq_uid}
                            if freq_uid
                            else {"frequency": freq_name}
                        )
                        _, created = Frequency.objects.update_or_create(
                            **lookup,
                            defaults={
                                "frequency": freq_name or "",
                                "months": row.get("Months"),
                                "hours": str(row.get("Hours") or ""),
                                "description": row.get("Description") or "",
                                "active": bool(row.get("Active")),
                            },
                        )
                        if created:
                            count_frequency += 1
                mark_phase_complete(self.RESUME_MODULE, "frequency")
                frequency_by_uid = {
                    frequency.universal_id_m_frequency: frequency
                    for frequency in Frequency.objects.exclude(
                        universal_id_m_frequency__isnull=True
                    ).exclude(universal_id_m_frequency="")
                }

                # Step 2b: Link every already-synced MaintopDetail to its Frequency.
                #
                # This step deliberately does NOT create MaintopHeader/MaintopDetail rows —
                # that's Step 2's job and only Step 2 can do it correctly: both models are keyed
                # on CMMS's own identity columns (MaintopHeader.maintop_id = MaintopID,
                # MaintopDetail.routine_id = RoutineID) as their non-null primary keys, and
                # neither is reachable from a Universal_ID_*-based upsert. Attempting it here
                # raised `null value in column "maintop_id" violates not-null constraint`.
                #
                # What is still needed is the FK wiring: Step 2 resolves frequency_f_key from
                # whatever Frequency rows happen to exist when it runs, and on a fresh DB (or
                # when run in UI order 1-2-3) that's none of them. So backfill it now from the
                # universal_id_m_frequency that Step 2 stored on each detail row.
                unlinked = (
                    MaintopDetail.objects.filter(frequency_f_key__isnull=True)
                    .exclude(universal_id_m_frequency__isnull=True)
                    .exclude(universal_id_m_frequency="")
                )
                to_link = []
                for detail in unlinked.only("routine_id", "universal_id_m_frequency"):
                    frequency = frequency_by_uid.get(detail.universal_id_m_frequency)
                    if frequency is None:
                        continue
                    detail.frequency_f_key = frequency
                    to_link.append(detail)
                if to_link:
                    MaintopDetail.objects.bulk_update(
                        to_link, ["frequency_f_key"], batch_size=2000
                    )
                count_linked = len(to_link)
                count_linked_total = MaintopDetail.objects.exclude(
                    frequency_f_key__isnull=True
                ).count()

            except Exception as ex:
                # Previously this fell back to reporting `Model.objects.count()` under an
                # "[OK] ... [Completed] Successfully synchronized" banner, so a failing CMMS
                # query surfaced in the UI as a green success with plausible-looking numbers.
                # Report the failure instead.
                logger.exception("CMMS Frequency/Maintop DB query/sync failed")
                yield (
                    f"[SYSTEM] CMMS Frequency Sync for Ship '{selected_ship_code}' "
                    f"(Universal ID: {cmms_ship_uid})...\n"
                    f"[FATAL] CMMS Frequency Sync Failed: {ex}\n"
                )
                return

            # "Fetched N M_Frequency records..." already went out above, right after the
            # query returned — not repeated here, since the frontend sums every "Fetched"
            # line it sees across the whole stream and a second copy would double-count it.
            clear_module(self.RESUME_MODULE)
            yield (
                f"[OK] Table 1: M_Frequency ({count_frequency} new frequencies synced, "
                f"{0 if frequency_done else len(freq_rows)} processed)\n"
                f"[OK] Table 2: T_MaintopDetail frequency links "
                f"({count_linked} newly linked, {count_linked_total} linked in total)\n"
                f"[Completed] Successfully synchronized CMMS Frequency data for ship "
                f"'{selected_ship_code}' into local SWMM database.\n"
            )

        except Exception as e:
            yield f"[FATAL] {e}\n"
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()


class CMMSDefectDataAPI(APIView):
    pagination_class = CommonPagination

    def get(self, request):
        conn = None
        cursor = None

        try:
            equipment_ship_detail_ids = list(
                ShipEquipment.objects.values_list("t_equipment_ship_detail", flat=True)
            )

            # Remove empty IDs
            equipment_ship_detail_ids = [x for x in equipment_ship_detail_ids if x]

            ship = get_this_ship()
            ship_id = ship.universal_id_m_ship if ship else None

            if not ship_id:
                # Resolve from the .env ship code rather than grabbing an arbitrary
                # hull — see resolve_cmms_ship_uid().
                conn_tmp = get_mssql_connection()
                try:
                    ship_id = resolve_cmms_ship_uid(conn_tmp.cursor())
                finally:
                    conn_tmp.close()

            search = request.GET.get("search", "").strip()

            eq_filter_clause = ""
            params = [ship_id]
            if equipment_ship_detail_ids:
                id_placeholders = ",".join(["?"] * len(equipment_ship_detail_ids))
                eq_filter_clause = f"AND T_Dart.Universal_ID_T_EquipmentShipDetail IN ({id_placeholders})"
                params.extend(equipment_ship_detail_ids)

            query = f"""
                SELECT
                    T_Dart.Universal_ID_T_Dart,
                    T_Dart.DartNumber,
                    T_Dart.DartDate,
                    T_Dart.DefectDate,
                    T_Dart.ScheduleDate,
                    T_Dart.Universal_ID_Ch_Master_Symptoms,
                    T_Dart.SeverityID,
                    T_Dart.SeverityCode,
                    T_Dart.Universal_ID_M_Severity,
                    T_Dart.Universal_ID_Ch_Master_Ship_Remarks_By,
                    T_Dart.Universal_ID_M_RequiredAssistance,
                    T_Dart.IsOstObservation,
                    T_Dart.DefectiveComponent,
                    T_Dart.Remarks AS Remarks,
                    T_Dart.DefectDescription AS DefectDescription,
                    T_Dart.IsClosed,
                    T_Dart.Is_Defect,
                    T_Dart.Active,
                    T_Dart.RoutineDefect,
                    T_Dart.Serial_Number,
                    T_Dart.Is_Operational,
                    T_Dart.Universal_ID_T_RefComp,
                    T_Dart.Universal_ID_M_Ship,
                    T_Dart.Universal_ID_M_Department,
                    T_Dart.Universal_ID_T_EquipmentShipDetail,
                    T_Dart.IsGDForm,

                    T_DartDetailGD.Reason AS GD_Reason,

                    T_DartDetailGD.Defect_affects_sea_going_Operational_Availability
                        AS GD_Defect_affects_sea_going_Operational_Availability,

                    T_DartDetailGD.Hot_Work_Involved
                        AS GD_Hot_Work_Involved,

                    T_DartDetailGD.Date_place
                        AS GD_Date_place,

                    T_DartDetailGD.Date_for_Repairs
                        AS GD_Date_for_Repairs,

                    T_DartDetailGD.Place
                        AS GD_Place,

                    T_DartDetailGD.DateOfCompletion
                        AS GD_DateOfCompletion,

                    T_EquipmentShipDetail.Nomenclature,
                    M_Equipment.EquipmentName,
                    M_Equipment.EquipmentCode,
                    M_Department.Description AS DepartmentName,
                    M_Ship.ShipName,
                    M_ShipClass.Description AS ClassName

                FROM T_Dart WITH (NOLOCK)

                LEFT JOIN T_EquipmentShipDetail WITH (NOLOCK)
                    ON T_Dart.Universal_ID_T_EquipmentShipDetail =
                       T_EquipmentShipDetail.Universal_ID_T_EquipmentShipDetail

                INNER JOIN M_Ship WITH (NOLOCK)
                    ON T_Dart.Universal_ID_M_Ship =
                       M_Ship.Universal_ID_M_Ship

                LEFT JOIN M_ShipClass WITH (NOLOCK)
                    ON M_Ship.Universal_ID_M_ShipClass =
                       M_ShipClass.Universal_ID_M_ShipClass

                LEFT JOIN M_Department WITH (NOLOCK)
                    ON T_Dart.Universal_ID_M_Department =
                       M_Department.Universal_ID_M_Department

                LEFT JOIN M_Equipment WITH (NOLOCK)
                    ON T_EquipmentShipDetail.Universal_ID_M_Equipment =
                       M_Equipment.Universal_ID_M_Equipment

                LEFT JOIN T_DartDetailGD WITH (NOLOCK)
                    ON T_Dart.Universal_ID_T_Dart =
                       T_DartDetailGD.Universal_ID_T_Dart

                WHERE
                    T_Dart.Universal_ID_M_Ship = ?

                    AND T_Dart.Active = 1

                    AND T_Dart.Is_Defect = 1

                    AND T_Dart.IsClosed = 0

                    {eq_filter_clause}
            """

            # First parameter = ship ID
            params = [ship_id]

            # Remaining parameters = equipment IDs
            params.extend(equipment_ship_detail_ids)

            if search:
                query += """
                    AND (
                        CAST(
                            T_Dart.Universal_ID_T_Dart
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            T_Dart.DartNumber
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            T_Dart.DartDate
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            T_Dart.DefectDate
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            T_Dart.ScheduleDate
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            T_Dart.Universal_ID_Ch_Master_Symptoms
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            T_Dart.SeverityID
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            T_Dart.SeverityCode
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            T_Dart.Universal_ID_M_Severity
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            T_Dart.Universal_ID_M_RequiredAssistance
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            T_Dart.DefectiveComponent
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR T_Dart.Remarks LIKE ?

                        OR T_Dart.DefectDescription LIKE ?

                        OR CAST(
                            T_Dart.Serial_Number
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR T_EquipmentShipDetail.Nomenclature LIKE ?

                        OR M_Equipment.EquipmentName LIKE ?

                        OR CAST(
                            M_Equipment.EquipmentCode
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR M_Department.Description LIKE ?

                        OR M_Ship.ShipName LIKE ?

                        OR M_ShipClass.Description LIKE ?

                        OR T_DartDetailGD.Reason LIKE ?

                        OR T_DartDetailGD.Place LIKE ?

                        OR CAST(
                            T_DartDetailGD.Date_place
                            AS VARCHAR(255)
                        ) LIKE ?
                    )
                """

                search_value = f"%{search}%"

                params.extend([search_value] * 22)

            query += """
                ORDER BY
                    T_Dart.DartDate DESC
            """

            conn = get_mssql_connection()
            cursor = conn.cursor()

            cursor.execute(query, params)

            columns = [col[0] for col in cursor.description]

            rows = cursor.fetchall()

            data = []

            for row in rows:
                record = dict(zip(columns, row))

                data.append(
                    {
                        "Universal_ID_T_Dart": record.get("Universal_ID_T_Dart"),
                        "dartnumber": record.get("DartNumber"),
                        "dart_date": record.get("DartDate"),
                        "defect_date": record.get("DefectDate"),
                        "schedule_date": record.get("ScheduleDate"),
                        "Universal_ID_Ch_Master_Symptoms": record.get(
                            "Universal_ID_Ch_Master_Symptoms"
                        ),
                        "severity_id": record.get("SeverityID"),
                        "severity_code": record.get("SeverityCode"),
                        "Universal_ID_M_Severity": record.get(
                            "Universal_ID_M_Severity"
                        ),
                        "Universal_ID_Ch_Master_Ship_Remarks_By": record.get(
                            "Universal_ID_Ch_Master_Ship_Remarks_By"
                        ),
                        "Universal_ID_M_RequiredAssistance": record.get(
                            "Universal_ID_M_RequiredAssistance"
                        ),
                        "trial_required": record.get("IsOstObservation"),
                        "defective_component": record.get("DefectiveComponent"),
                        "remarks": record.get("Remarks"),
                        "defect_description": record.get("DefectDescription"),
                        "isclosed": record.get("IsClosed"),
                        "is_defect": record.get("Is_Defect"),
                        "active": record.get("Active"),
                        "routinedefect": record.get("RoutineDefect"),
                        "serial_number": record.get("Serial_Number"),
                        "is_operational": record.get("Is_Operational"),
                        "Universal_ID_T_RefComp": record.get("Universal_ID_T_RefComp"),
                        "universal_id_m_ship": record.get("Universal_ID_M_Ship"),
                        "universal_id_m_department": record.get(
                            "Universal_ID_M_Department"
                        ),
                        "universal_id_t_equipment_ship_detail": record.get(
                            "Universal_ID_T_EquipmentShipDetail"
                        ),
                        "nomenclature": record.get("Nomenclature"),
                        "equipmentname": record.get("EquipmentName"),
                        "equipmentcode": str(record.get("EquipmentCode"))
                        if record.get("EquipmentCode")
                        else None,
                        "departmentname": record.get("DepartmentName"),
                        "shipname": record.get("ShipName"),
                        "classname": record.get("ClassName"),
                        "is_guarantee_defect": record.get("IsGDForm"),
                        "guarantee_cause": record.get("GD_Reason"),
                        "guarantee_op_availability": record.get(
                            "GD_Defect_affects_sea_going_Operational_Availability"
                        ),
                        "guarantee_hot_work": record.get("GD_Hot_Work_Involved"),
                        "guarantee_repairs": record.get("GD_Date_place"),
                        "guarantee_repair_date": record.get("GD_Date_for_Repairs"),
                        "guarantee_place": record.get("GD_Place"),
                        "guarantee_completion_date": record.get("GD_DateOfCompletion"),
                    }
                )

            print("Total rows from SQL:", len(rows))

            print("Total records in data:", len(data))

            paginator = self.pagination_class()

            paginated_data = paginator.paginate_queryset(data, request, view=self)

            return paginator.get_paginated_response(paginated_data)

        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        finally:
            if cursor:
                cursor.close()

            if conn:
                conn.close()


class CMMSLessRoutineDataAPI(APIView):
    pagination_class = CommonPagination

    def get(self, request):
        conn = None
        cursor = None

        try:
            ship = get_this_ship()

            ship_id = ship.universal_id_m_ship if ship else None

            if not ship_id:
                # Resolve from the .env ship code rather than grabbing an arbitrary
                # hull — see resolve_cmms_ship_uid().
                conn_tmp = get_mssql_connection()
                try:
                    ship_id = resolve_cmms_ship_uid(conn_tmp.cursor())
                finally:
                    conn_tmp.close()

            search = request.GET.get("search", "").strip()

            query = """
                SELECT
                    M_ShipClass.Description AS ClassName,
                    M_Ship.ShipName,
                    M_Department.Description AS DepartmentName,
                    M_Equipment.EquipmentName,
                    M_Equipment.EquipmentCode,

                    T_MaintopDetail.MaintopNo,

                    T_MaintopDetail.Universal_ID_M_Frequency
                        AS Universal_ID_M_Frequency,

                    T_RoutineList.Universal_ID_T_EquipmentShipDetail
                        AS Universal_ID_T_EquipmentShipDetail,

                    T_RoutineList.Universal_ID_T_RoutineList
                        AS Universal_Id_T_RoutineList,

                    T_MaintopDetail.Universal_ID_T_MaintopDetail,

                    T_EquipmentShipDetail.Nomenclature,

                    NULL AS DartNumber,

                    M_Frequency.Frequency,

                    NULL AS RoutineDueDate,

                    T_MaintopDetail.RoutineNo,

                    T_RoutineList.RoutineDescription,

                    [dbo].[Fn_GetByWhomRemark](
                        T_MaintopHeader.MaintopID,
                        T_MaintopDetail.RoutineID
                    ) AS ByWhom,

                    NULL AS Section,

                    M_Frequency.Description AS RoutineName,

                    M_Frequency.Frequency AS RoutineCategory,

                    M_Frequency.Months AS FrequencyMonth,

                    M_Frequency.Hours AS FrequencyHours,

                    0 AS RHSI,

                    0 AS RHSIUpdatedUpto,

                    NULL AS LastRoutineCompletedAtDate,

                    NULL AS LastRoutineCompletedAtRH

                FROM T_RoutineList WITH (NOLOCK)

                INNER JOIN T_EquipmentShipDetail WITH (NOLOCK)
                    ON T_RoutineList.Universal_ID_T_EquipmentShipDetail =
                       T_EquipmentShipDetail.Universal_ID_T_EquipmentShipDetail

                INNER JOIN M_Equipment WITH (NOLOCK)
                    ON T_EquipmentShipDetail.Universal_ID_M_Equipment =
                       M_Equipment.Universal_ID_M_Equipment

                INNER JOIN M_Department WITH (NOLOCK)
                    ON T_EquipmentShipDetail.Universal_ID_M_Department =
                       M_Department.Universal_ID_M_Department

                INNER JOIN M_Ship WITH (NOLOCK)
                    ON T_RoutineList.Universal_ID_M_Ship =
                       M_Ship.Universal_ID_M_Ship

                INNER JOIN T_MaintopHeader WITH (NOLOCK)
                    ON M_Equipment.Universal_ID_T_MaintopHeader =
                       T_MaintopHeader.Universal_ID_T_MaintopHeader

                INNER JOIN M_ShipClass WITH (NOLOCK)
                    ON M_Ship.Universal_ID_M_ShipClass =
                       M_ShipClass.Universal_ID_M_ShipClass

                LEFT JOIN T_MaintopDetail WITH (NOLOCK)
                    ON T_RoutineList.Universal_ID_T_MaintopDetail =
                       T_MaintopDetail.Universal_ID_T_MaintopDetail

                LEFT JOIN M_Frequency WITH (NOLOCK)
                    ON T_MaintopDetail.FrequencyID =
                       M_Frequency.FrequencyID

                LEFT JOIN M_ByWhom WITH (NOLOCK)
                    ON T_MaintopDetail.Universal_ID_M_ByWhom1 =
                       M_ByWhom.Universal_ID_M_ByWhom

                WHERE
                    T_RoutineList.Active = 1

                    AND M_Ship.Universal_ID_M_Ship = ?

                    AND T_RoutineList.IsClosed = 0
            """

            # First parameter = current ship ID
            params = [ship_id]

            if search:
                query += """
                    AND (
                        M_ShipClass.Description LIKE ?

                        OR M_Ship.ShipName LIKE ?

                        OR M_Department.Description LIKE ?

                        OR M_Equipment.EquipmentName LIKE ?

                        OR CAST(
                            M_Equipment.EquipmentCode
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            T_MaintopDetail.MaintopNo
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR T_EquipmentShipDetail.Nomenclature LIKE ?

                        OR CAST(
                            T_MaintopDetail.RoutineNo
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR T_RoutineList.RoutineDescription LIKE ?

                        OR M_Frequency.Description LIKE ?

                        OR CAST(
                            M_Frequency.Frequency
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            M_Frequency.Months
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            M_Frequency.Hours
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            T_RoutineList.Universal_ID_T_RoutineList
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            T_MaintopDetail.Universal_ID_M_Frequency
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            T_RoutineList.Universal_ID_T_EquipmentShipDetail
                            AS VARCHAR(255)
                        ) LIKE ?

                        OR CAST(
                            T_MaintopDetail.Universal_ID_T_MaintopDetail
                            AS VARCHAR(255)
                        ) LIKE ?
                    )
                """

                search_value = f"%{search}%"

                params.extend([search_value] * 17)

            query += """
                ORDER BY
                    M_Ship.ShipName,
                    M_Equipment.EquipmentCode,
                    T_EquipmentShipDetail.Nomenclature,
                    T_MaintopDetail.MaintopNo,
                    M_Frequency.Frequency,
                    T_MaintopDetail.RoutineNo
            """

            conn = get_mssql_connection()
            cursor = conn.cursor()

            cursor.execute(query, params)

            columns = [col[0] for col in cursor.description]

            rows = cursor.fetchall()

            data = []

            for row in rows:
                r = dict(zip(columns, row))

                data.append(
                    {
                        "classname": r.get("ClassName"),
                        "shipname": r.get("ShipName"),
                        "departmentname": r.get("DepartmentName"),
                        "equipmentname": r.get("EquipmentName"),
                        "equipmentcode": str(r.get("EquipmentCode"))
                        if r.get("EquipmentCode")
                        else None,
                        "maintopno": r.get("MaintopNo"),
                        "nomenclature": r.get("Nomenclature"),
                        "dartnumber": r.get("DartNumber"),
                        "routineno": r.get("RoutineNo"),
                        "routinedescription": r.get("RoutineDescription"),
                        "routinename": r.get("RoutineName"),
                        "frequency": r.get("Frequency"),
                        "frequencymonth": r.get("FrequencyMonth"),
                        "frequencyhours": r.get("FrequencyHours"),
                        "routineduedate": r.get("RoutineDueDate"),
                        "bywhom": r.get("ByWhom"),
                        "rhsiupdatedupto": r.get("RHSIUpdatedUpto"),
                        "LastRoutineComplitedatrh": r.get("LastRoutineComplitedAtRH"),
                        "lastroutinecompletedatdate": r.get(
                            "LastRoutineCompletedAtDate"
                        ),
                        "Universal_ID_T_RoutineList": r.get(
                            "Universal_Id_T_RoutineList"
                        ),
                        "Universal_ID_M_Frequency": r.get("Universal_ID_M_Frequency"),
                        "Universal_ID_T_EquipmentShipDetail": r.get(
                            "Universal_ID_T_EquipmentShipDetail"
                        ),
                        "universal_id_t_maintopdetail": r.get(
                            "Universal_ID_T_MaintopDetail"
                        ),
                    }
                )

            print("Total rows from SQL:", len(rows))

            print("Total records in data:", len(data))

            paginator = self.pagination_class()

            paginated_data = paginator.paginate_queryset(data, request, view=self)

            return paginator.get_paginated_response(paginated_data)

        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        finally:
            if cursor:
                cursor.close()

            if conn:
                conn.close()


def norm(val):
    """Strip and uppercase a string value safely."""
    return (val or "").strip().upper()


def natural_key(val):
    """
    Generate a sort key for 'natural' sorting of strings containing numbers.
    Prioritizes integer sorting if the value is purely numeric.
    """
    import re

    val = str(val or "").strip()
    if val.isdigit():
        return [int(val)]
    return [int(s) if s.isdigit() else s.lower() for s in re.split(r"(\d+)", val)]


def build_ard_structures():
    # print("  Loading AddRoutineDetails Ã¢â‚¬Â¦", end=" ", flush=True)

    ard_eq_maintop = defaultdict(set)  # eq_id Ã¢â€ â€™ {maintop_no, Ã¢â‚¬Â¦}
    ard_lookup = {}  # (eq_id, mn, rn, frq) Ã¢â€ â€™ ard_id

    rows = AddRoutineDetails.objects.values(
        "id", "equipment_name_id", "maintop_no", "routine_no", "frequency"
    )
    for row in rows:
        eq_id = row["equipment_name_id"]
        mn = norm(row["maintop_no"])
        rn = norm(row["routine_no"])
        frq = norm(row["frequency"])

        if not mn or eq_id is None:
            continue

        ard_eq_maintop[eq_id].add(mn)
        if rn:
            ard_lookup[(eq_id, mn, rn, frq)] = row["id"]

    # Bootstrap: on a fresh system (or for any equipment with no AddRoutineDetails rows yet),
    # the loop above finds nothing — ard_eq_maintop only ever grows from AddRoutineDetails, which
    # is exactly what MissingRoutinesAPIView is trying to CREATE, so a brand-new equipment could
    # never get its first routine. CMMS already answers "which Maintop applies to this equipment"
    # directly: M_Equipment.Universal_ID_T_MaintopHeader, synced onto
    # ShipEquipment.universal_id_t_maintop_header by CMMSFDDataAPI (Step 1) and onto every
    # MaintopDetail row's own universal_id_t_maintopheader by CMMSMaintopSyncAPI (Step 2). Joining
    # those two gives every equipment's true maintop_no set without depending on
    # AddRoutineDetails already existing.
    header_uid_by_eq = dict(
        EquipmentName.objects.exclude(
            sfd_equipment__universal_id_t_maintop_header__isnull=True
        )
        .exclude(sfd_equipment__universal_id_t_maintop_header="")
        .values_list("id", "sfd_equipment__universal_id_t_maintop_header")
    )
    if header_uid_by_eq:
        maintop_nos_by_header_uid = defaultdict(set)
        detail_header_rows = (
            MaintopDetail.objects.exclude(universal_id_t_maintopheader__isnull=True)
            .exclude(universal_id_t_maintopheader="")
            .values_list("universal_id_t_maintopheader", "maintop_no")
        )
        for header_uid, mn in detail_header_rows:
            mn = norm(mn)
            if mn:
                maintop_nos_by_header_uid[header_uid].add(mn)

        for eq_id, header_uid in header_uid_by_eq.items():
            found = maintop_nos_by_header_uid.get(header_uid)
            if found:
                ard_eq_maintop[eq_id] |= found

    # print(f"{len(ard_lookup):,} rows / {len(ard_eq_maintop):,} equipments.")
    return ard_eq_maintop, ard_lookup


def build_rd_and_ard_sets():
    """
    Returns:
        rd_set  : set of (equipment_name_id, maintop_no_upper, routine_no_upper, freq_upper)
                  built directly from RoutineDescription Ã¢â‚¬â€ the ground-truth for COMPLETE
        ard_set : set of (equipment_name_id, maintop_no_upper, routine_no_upper, freq_upper)
                  built from AddRoutineDetails Ã¢â‚¬â€ used to detect Stage-2
    """
    # Ã¢â€â‚¬Ã¢â€â‚¬ RoutineDescription (through AddRoutineDetails for proper frequency check) Ã¢â€â‚¬Ã¢â€â‚¬
    # print("  Loading RoutineDescription Ã¢â‚¬Â¦", end=" ", flush=True)
    rd_rows = RoutineDescription.objects.select_related("add_routine_details").values(
        "equipment_name_id",
        "maintop_no",
        "routine_no",
        "add_routine_details__frequency",
    )
    rd_set = set()
    for r in rd_rows:
        eq_id = r["equipment_name_id"]
        mn = norm(r["maintop_no"])
        rn = norm(r["routine_no"])
        # Use frequency from linked AddRoutineDetails as the source of truth for initiation
        frq = norm(r["add_routine_details__frequency"])

        if eq_id and mn and rn and frq:
            rd_set.add((eq_id, mn, rn, frq))
    # print(f"{len(rd_set):,} unique initiated entries.")

    ard_rows = AddRoutineDetails.objects.values(
        "equipment_name_id", "maintop_no", "routine_no", "frequency"
    )
    ard_set = set()
    for r in ard_rows:
        eq_id = r["equipment_name_id"]
        mn = norm(r["maintop_no"])
        rn = norm(r["routine_no"])
        frq = norm(r["frequency"])
        if eq_id and mn and rn and frq:
            ard_set.add((eq_id, mn, rn, frq))
    # print(f"{len(ard_set):,} defined entries.")

    return rd_set, ard_set


def build_maintopdetail_map():
    print("  Loading MaintopDetail Ã¢â‚¬Â¦", end=" ", flush=True)

    # (maintop_no, freq) Ã¢â€ â€™ max amendment_no
    amend_map = defaultdict(lambda: None)
    # frequency_upper Ã¢â€ â€™ freq_number string
    freq_num_map = {}
    # maintop_no Ã¢â€ â€™ list of (routine_no, frequency)
    detail_map = defaultdict(list)

    rows = MaintopDetail.objects.select_related("frequency_f_key").values(
        "maintop_no",
        "routine_no",
        "routine_description",
        "universal_id_t_maintopdetail",
        "universal_id_m_frequency",
        "frequency",
        "amendment_no",
        "frequency_f_key__months",
        "frequency_f_key__hours",
        "by_whom",
    )

    seen = set()
    for row in rows:
        mn = norm(row["maintop_no"])
        rn = norm(row["routine_no"])
        frq = norm(row["frequency"])
        by_whom = norm(row["by_whom"])
        amn = row["amendment_no"]

        if not mn or not rn or not frq:
            continue

        # Max amendment per (maintop_no, frequency)
        k = (mn, frq)
        if amend_map[k] is None or (amn is not None and amn > amend_map[k]):
            amend_map[k] = amn

        # Frequency number lookup
        if frq and frq not in freq_num_map:
            m = row["frequency_f_key__months"]
            h = row["frequency_f_key__hours"]
            freq_num_map[frq] = str(m) if m else (str(h) if h else "N/A")

        # Unique (mn, rn, frq) entries per maintop
        if (mn, rn, frq) not in seen:
            seen.add((mn, rn, frq))
            detail_map[mn].append(
                {
                    "routine_no": rn,
                    "frequency": frq,
                    "by_whom": by_whom,
                    "frequency": frq,
                    "freq_number": freq_num_map.get(frq, "N/A"),
                    "highest_amend": amend_map.get((mn, frq)),
                    "universal_id": row["universal_id_t_maintopdetail"],
                    "frequency_id": row["universal_id_m_frequency"],
                    "description": row["routine_description"],
                }
            )
    print(f"{len(seen):,} unique (maintop, routine, freq) rows.")
    return detail_map, amend_map, freq_num_map


class MissingRoutinesAPIView(APIView):
    pagination_class = CommonPagination
    permission_classes = [CanInitialiseShipData]

    # Module name under which this step's resume checkpoints are filed. A constant because
    # both the stream and the reset endpoint have to agree on it.
    RESUME_MODULE = "step4_nomenclature_routines"

    def _stream_nomenclature_routine_sync(self, search, full=False):
        """Step 4, in two phases.

        Phase A pulls the routines CMMS already holds for this ship (T_Dart Is_Routine = 1)
        so their real DartNumber, due date and last-completion state land locally. Phase B then
        recomputes what's *still* missing — maintop routines this hull's equipment should have
        but no dart exists for anywhere — and creates those with locally generated dart numbers.

        Phase B has to run after Phase A's writes: the missing-set is derived from
        RoutineDescription, so computing it first would treat every CMMS routine as missing and
        mint a duplicate local dart number for each one.

        Interrupting any of it (the link drops, the browser goes away) leaves a checkpoint
        behind, and the next run picks up from it rather than re-walking thousands of rows
        it already wrote. `full=True` throws that away and re-runs everything, which is what
        an operator wants when they are re-syncing to pick up CMMS-side changes rather than
        recovering from a dropped connection.
        """
        if full:
            clear_module(self.RESUME_MODULE)
        # Only a run that gets through every phase without an [ERROR] may clear the
        # checkpoints: a phase that failed still has work outstanding, and forgetting where
        # it got to would send the retry back to row 1 — the exact thing this prevents.
        phases_clean = True
        conn = None
        cursor = None
        try:
            yield "[SYSTEM] Starting CMMS Nomenclature wise Routines Sync...\n"
            ship_code = env_ship_code()
            conn = get_mssql_connection()
            cursor = conn.cursor()
            ship_uid = resolve_cmms_ship_uid(cursor, ship_code)
            if not ship_uid:
                yield (
                    f"[FATAL] Ship code '{ship_code}' (SWMM_SHIP_CODE) not found in "
                    f"CMMS M_Ship. Fix the .env ship code before syncing.\n"
                )
                return
            yield f"[OK] M_Ship resolved: {ship_code} / Universal_ID_M_Ship={ship_uid}\n"

            # Scope the pull to this ship's own equipment fit rather than every T_Dart ever
            # tagged with this ship — otherwise it also drags in routine history for
            # equipment that's since been swapped out or removed, which is both wrong
            # (offering routines for equipment not on this ship) and what was making this
            # step slow (see fetch_cmms_nomenclature_routines' docstring).
            equipment_ship_uids = list(
                ShipEquipment.objects.filter(ship=get_this_ship())
                .exclude(t_equipment_ship_detail__isnull=True)
                .exclude(t_equipment_ship_detail="")
                .values_list("t_equipment_ship_detail", flat=True)
                .distinct()
            )
            if not equipment_ship_uids:
                yield (
                    "[FATAL] No equipment found on this ship — run Step 1 (CMMS SFD "
                    "Sync) first. Nothing to sync.\n"
                )
                return
            yield (
                f"[OK] This ship has {len(equipment_ship_uids)} equipment fits — "
                "scoping the routine pull to those.\n"
            )

            if phase_completed(self.RESUME_MODULE, "cmms_routines"):
                yield (
                    "[RESUMED] CMMS Nomenclature wise Routines already completed by the "
                    "interrupted run — skipping to the next phase.\n"
                )
            else:
                cmms_rows = fetch_cmms_nomenclature_routines(
                    cursor, ship_uid, equipment_ship_uids
                )
                yield from stream_sync_log(
                    "CMMS Nomenclature wise Routines (T_Dart Is_Routine = 1)",
                    cmms_rows,
                    create_missing_dart=False,
                    module=self.RESUME_MODULE,
                    phase="cmms_routines",
                    # The position is only meaningful against the same ship and the same
                    # equipment fit; a refit changes which routines are even in scope.
                    scope=(ship_uid, len(equipment_ship_uids)),
                )
            yield "\n"
        except Exception as exc:
            phases_clean = False
            logger.exception("CMMS nomenclature wise routine sync failed")
            yield f"\n[ERROR] CMMS routine pull failed: {exc}\n"
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()

        try:
            if phase_completed(self.RESUME_MODULE, "missing_routines"):
                yield (
                    "[RESUMED] Missing routine creation already completed by the "
                    "interrupted run — skipping to the next phase.\n"
                )
            else:
                missing_rows = self._build_missing_rows(search)
                yield from stream_sync_log(
                    "Create Nomenclature wise Missing Routines",
                    missing_rows,
                    create_missing_dart=True,
                    module=self.RESUME_MODULE,
                    phase="missing_routines",
                    scope=(search,),
                )
        except Exception as exc:
            phases_clean = False
            logger.exception("Missing routine creation failed")
            yield f"\n[ERROR] Missing routine creation failed: {exc}\n"

        # Phase 3 -- routine history. Runs last on purpose: both pulls resolve
        # rows against RoutineDescription, so every routine phases 1 and 2 can
        # create has to exist first or the history would be skipped as unmatched.
        # Opens its own connection because the phase-1 one is already closed above.
        yield "\n[SYSTEM] Pulling routine history from CMMS...\n"
        history_conn = None
        try:
            history_conn = get_mssql_connection()
            history_cursor = history_conn.cursor()
            history_ship_uid = resolve_cmms_ship_uid(history_cursor, env_ship_code())
            if not history_ship_uid:
                yield "[SKIPPED] Ship not resolved in CMMS — routine history not pulled.\n"
            else:
                # Checkpointed per pull rather than per row: each is a single pass that
                # takes seconds, so knowing which of the two was already done is all the
                # resume granularity they need.
                if phase_completed(self.RESUME_MODULE, "routine_list"):
                    yield "[RESUMED] T_RoutineList already pulled by the interrupted run.\n"
                else:
                    stats = pull_cmms_routine_list(history_cursor, history_ship_uid)
                    mark_phase_complete(self.RESUME_MODULE, "routine_list")
                    yield (
                        f"[OK] T_RoutineList -> RoutineDescription "
                        f"({stats['linked']} linked, {stats['skipped']} unmatched "
                        f"of {stats['fetched']} fetched)\n"
                    )
                if phase_completed(self.RESUME_MODULE, "completed_routines"):
                    yield (
                        "[RESUMED] T_Dart completed routines already pulled by the "
                        "interrupted run.\n"
                    )
                else:
                    stats = pull_cmms_completed_routines(
                        history_cursor, history_ship_uid
                    )
                    mark_phase_complete(self.RESUME_MODULE, "completed_routines")
                    yield (
                        f"[OK] T_Dart (completed routines) -> CompletedRoutine "
                        f"({stats['created']} new, {stats['updated']} updated, "
                        f"{stats['skipped']} unmatched of {stats['fetched']} fetched)\n"
                    )
        except Exception as exc:
            phases_clean = False
            logger.exception("CMMS routine history pull failed")
            yield f"[ERROR] Routine history pull failed: {exc}\n"
        finally:
            if history_conn:
                history_conn.close()

        # Reached only when the generator ran to the end, which an interrupted stream never
        # does — that is what leaves the checkpoints in place for the next attempt.
        if phases_clean:
            clear_module(self.RESUME_MODULE)

    def get(self, request):
        if "sfd/missing-routine-sync" in request.path:
            return StreamingHttpResponse(
                self._stream_nomenclature_routine_sync(
                    request.GET.get("search", "").strip().lower(),
                    full=request.GET.get("full") in ("1", "true", "True"),
                ),
                content_type="text/plain",
            )
        try:
            normalized_data = self._build_missing_rows(
                request.GET.get("search", "").strip().lower()
            )
            paginator = self.pagination_class()
            paginated_data = paginator.paginate_queryset(
                normalized_data, request, view=self
            )
            return paginator.get_paginated_response(paginated_data)
        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _build_missing_rows(self, search):
        try:
            ard_eq_maintop, _ = build_ard_structures()
            rd_set, ard_set = build_rd_and_ard_sets()
            detail_map, _, _ = build_maintopdetail_map()

            equipments = list(
                EquipmentName.objects.values(
                    "id",
                    "nomenclature",
                    "name",
                    "universal_id_t_equipment_ship_detail",
                    "equipment_code",
                    "sfd_equipment__department__name",
                    "sub_department__department_name__name",
                )
            )

            ship_obj = get_this_ship()

            frequency_ids = set()

            for items in detail_map.values():
                for item in items:
                    frequency_id = item.get("frequency_id")

                    if frequency_id:
                        frequency_ids.add(frequency_id)

            frequency_map = {
                frequency.universal_id_m_frequency: frequency
                for frequency in Frequency.objects.filter(
                    universal_id_m_frequency__in=frequency_ids
                )
            }

            normalized_data = []

            for eq in equipments:
                eq_id = eq["id"]

                nom = (eq["nomenclature"] or eq["name"] or "").strip()

                eq_uid = eq["universal_id_t_equipment_ship_detail"]

                maintop_nos = ard_eq_maintop.get(eq_id, set())

                if not maintop_nos:
                    continue

                for mn in maintop_nos:
                    expected = detail_map.get(mn, [])

                    if not expected:
                        continue

                    for item in expected:
                        rn = item["routine_no"]
                        frq = item["frequency"]
                        by_whom = item["by_whom"]

                        full_key = (eq_id, mn, rn, frq)

                        if full_key in rd_set:
                            continue

                        frequency = frequency_map.get(item.get("frequency_id"))

                        normalized_record = {
                            "Universal_ID_M_Frequency": item.get("frequency_id"),
                            "Universal_ID_T_EquipmentShipDetail": eq_uid,
                            "Universal_ID_T_Dart": None,
                            "dartnumber": None,
                            "classname": (
                                ship_obj.class_master.description
                                if ship_obj and ship_obj.class_master
                                else None
                            ),
                            "shipname": (ship_obj.name if ship_obj else None),
                            "equipmentname": nom,
                            "departmentname": (
                                eq["sfd_equipment__department__name"]
                                or eq["sub_department__department_name__name"]
                            ),
                            "equipmentcode": eq["equipment_code"],
                            "maintopno": mn,
                            "nomenclature": nom,
                            "routineno": rn,
                            "routinedescription": item.get("description"),
                            "bywhom": by_whom,
                            "routinename": (
                                frequency.description if frequency else None
                            ),
                            "frequency": frq,
                            "frequencymonth": (frequency.months if frequency else None),
                            "frequencyhours": (frequency.hours if frequency else None),
                            "routineduedate": None,
                            "rhsiupdatedupto": None,
                            "lastroutinecompletedatrh": None,
                            "lastroutinecompletedatdate": None,
                            "universal_id_t_maintopdetail": item.get("universal_id"),
                        }

                        normalized_data.append(normalized_record)

            if search:
                filtered_data = []

                for record in normalized_data:
                    searchable_values = [
                        record.get("Universal_ID_M_Frequency"),
                        record.get("Universal_ID_T_EquipmentShipDetail"),
                        record.get("dartnumber"),
                        record.get("classname"),
                        record.get("shipname"),
                        record.get("equipmentname"),
                        record.get("departmentname"),
                        record.get("equipmentcode"),
                        record.get("maintopno"),
                        record.get("nomenclature"),
                        record.get("routineno"),
                        record.get("routinedescription"),
                        record.get("bywhom"),
                        record.get("routinename"),
                        record.get("frequency"),
                        record.get("frequencymonth"),
                        record.get("frequencyhours"),
                        record.get("universal_id_t_maintopdetail"),
                    ]

                    if any(
                        search in str(value).lower()
                        for value in searchable_values
                        if value is not None
                    ):
                        filtered_data.append(record)

                normalized_data = filtered_data

            return normalized_data

        except Exception:
            logger.exception("Failed to build missing routine rows")
            raise


class SaveCMMSDefectsAPI(APIView):
    def get(self, request):
        return Response(
            {
                "status": True,
                "message": "SaveCMMSDefectsAPI endpoint ready for POST payload.",
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        try:
            data = request.data
            if isinstance(data, list):
                defects = data
            elif isinstance(data, dict):
                defects = data.get("defects", [])
            else:
                defects = []

            if not isinstance(defects, list):
                return Response(
                    {"status": False, "error": "defects must be a list."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            saved_count = 0

            dart_universal_ids = set()
            dart_numbers = set()
            equipment_ids = set()
            department_ids = set()
            symptom_ids = set()
            severity_ids = set()
            remark_ids = set()
            required_assistance_ids = set()
            refit_ids = set()

            for d in defects:
                dart_number = d.get("dartnumber")
                universal_id = d.get("Universal_ID_T_Dart")

                if dart_number:
                    dart_numbers.add(dart_number)

                if universal_id:
                    dart_universal_ids.add(universal_id)

                if d.get("universal_id_t_equipment_ship_detail"):
                    equipment_ids.add(d.get("universal_id_t_equipment_ship_detail"))

                if d.get("universal_id_m_department"):
                    department_ids.add(d.get("universal_id_m_department"))

                if d.get("Universal_ID_Ch_Master_Symptoms"):
                    symptom_ids.add(d.get("Universal_ID_Ch_Master_Symptoms"))

                if d.get("Universal_ID_M_Severity"):
                    severity_ids.add(d.get("Universal_ID_M_Severity"))

                if d.get("Universal_ID_Ch_Master_Ship_Remarks_By"):
                    remark_ids.add(d.get("Universal_ID_Ch_Master_Ship_Remarks_By"))

                if d.get("Universal_ID_M_RequiredAssistance"):
                    required_assistance_ids.add(
                        d.get("Universal_ID_M_RequiredAssistance")
                    )

                if d.get("Universal_ID_T_RefComp"):
                    refit_ids.add(d.get("Universal_ID_T_RefComp"))

            ship_equipment_map = {
                obj.t_equipment_ship_detail: obj
                for obj in ShipEquipment.objects.filter(
                    t_equipment_ship_detail__in=equipment_ids
                )
            }

            department_map = {
                obj.universal_id_m_department: obj
                for obj in Department.objects.filter(
                    universal_id_m_department__in=department_ids
                )
            }

            ems_equipment_map = {
                obj.universal_id_t_equipment_ship_detail: obj
                for obj in EquipmentName.objects.filter(
                    universal_id_t_equipment_ship_detail__in=equipment_ids
                )
            }
            symptom_map = {
                obj.universal_id_ch_master_symptoms: obj
                for obj in ChMasterSymptoms.objects.filter(
                    universal_id_ch_master_symptoms__in=symptom_ids
                )
            }
            severity_map = {
                obj.universal_id_m_severity: obj
                for obj in MSeverity.objects.filter(
                    universal_id_m_severity__in=severity_ids
                )
            }
            remark_map = {
                obj.universal_id_ch_master_ship_remarks_by: obj
                for obj in ChMasterShipRemarksBy.objects.filter(
                    universal_id_ch_master_ship_remarks_by__in=remark_ids
                )
            }
            required_assistance_map = {
                obj.universal_id_m_required_assistance: obj
                for obj in MRequiredAssistance.objects.filter(
                    universal_id_m_required_assistance__in=required_assistance_ids
                )
            }
            refit_map = {
                obj.universal_id_m_refit: obj
                for obj in RefitMaintenancePeriod.objects.filter(
                    universal_id_m_refit__in=refit_ids
                )
            }

            existing_by_universal_id = {
                obj.universal_id_t_dart: obj
                for obj in InitiateDart.objects.filter(
                    universal_id_t_dart__in=dart_universal_ids
                )
            }

            existing_by_dart_number = {
                obj.dart_number: obj
                for obj in InitiateDart.objects.filter(dart_number__in=dart_numbers)
            }

            def parse_dt(dt_str):
                if not dt_str:
                    return None

                try:
                    return datetime.strptime(
                        str(dt_str).split("T")[0], "%Y-%m-%d"
                    ).date()

                except (ValueError, TypeError):
                    return None

            with transaction.atomic():
                for d in defects:
                    dart_number = d.get("dartnumber")

                    # Same old behaviour
                    if not dart_number:
                        continue

                    universal_id = d.get("Universal_ID_T_Dart")

                    obj = None

                    if universal_id:
                        obj = existing_by_universal_id.get(universal_id)

                    if not obj:
                        obj = existing_by_dart_number.get(dart_number)

                    if not obj:
                        obj = InitiateDart(dart_number=dart_number)

                    if universal_id:
                        obj.universal_id_t_dart = universal_id

                    t_eq_id = d.get("universal_id_t_equipment_ship_detail")

                    ship_eq = ship_equipment_map.get(t_eq_id)

                    univ_dept_id = d.get("universal_id_m_department")

                    dept = department_map.get(univ_dept_id)

                    symptom_id = d.get("Universal_ID_Ch_Master_Symptoms")

                    symptom = symptom_map.get(symptom_id)

                    severity_id = d.get("Universal_ID_M_Severity")

                    severity = severity_map.get(severity_id)

                    remark_id = d.get("Universal_ID_Ch_Master_Ship_Remarks_By")

                    remark = remark_map.get(remark_id)

                    ra_id = d.get("Universal_ID_M_RequiredAssistance")

                    ra = required_assistance_map.get(ra_id)

                    refit_id = d.get("Universal_ID_T_RefComp")

                    refit = refit_map.get(refit_id)

                    obj.equipment_ship = ship_eq

                    obj.department_id = dept

                    obj.equipment_ems = ems_equipment_map.get(t_eq_id)

                    obj.dart_sr_number = d.get("serial_number")

                    obj.dart_date = parse_dt(d.get("dart_date"))

                    obj.rectification_date = parse_dt(d.get("schedule_date"))

                    ops_val = d.get("is_operational")

                    if ops_val is not None:
                        obj.ops_status = bool(ops_val)

                        obj.maintenance_period = (
                            "OPERATIONAL" if bool(ops_val) else "REFIT"
                        )

                    obj.trial_required = bool(d.get("trial_required"))

                    obj.defective_component = d.get("defective_component")

                    obj.defective_discriptions = d.get("defect_description") or d.get(
                        "remarks"
                    )

                    obj.is_closed = bool(d.get("isclosed"))

                    obj.symptom_code = symptom

                    obj.severity_code = severity

                    obj.remark_code = remark

                    obj.require_assistance_for_code = ra

                    obj.refit_maintenance_period_f_key = refit

                    obj.is_guarantee_defect = bool(d.get("is_guarantee_defect"))

                    obj.guarantee_cause = d.get("guarantee_cause")

                    val_op = d.get("guarantee_op_availability")

                    obj.guarantee_op_availability = (
                        bool(val_op) if val_op is not None else False
                    )

                    val_hw = d.get("guarantee_hot_work")

                    obj.guarantee_hot_work = (
                        bool(val_hw) if val_hw is not None else False
                    )

                    obj.guarantee_repairs = d.get("guarantee_repairs")

                    obj.guarantee_place = d.get("guarantee_place")

                    obj.guarantee_repair_date = parse_dt(d.get("guarantee_repair_date"))

                    obj.guarantee_completion_date = parse_dt(
                        d.get("guarantee_completion_date")
                    )

                    obj.save()

                    saved_count += 1

                    # Keep maps updated for duplicate records
                    if universal_id:
                        existing_by_universal_id[universal_id] = obj

                    existing_by_dart_number[dart_number] = obj

            return Response(
                {
                    "status": True,
                    "message": (f"Successfully saved {saved_count} defects."),
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response(
                {"status": False, "error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class CMMSDefectSyncAPI(APIView):
    def get(self, request):
        return self.post(request)

    def post(self, request):
        conn = None
        cursor = None

        try:
            # ---------------------------------------------------------
            # Get current ship
            # ---------------------------------------------------------
            ship_obj = get_this_ship()

            if not ship_obj:
                return Response(
                    {"status": False, "message": "Local Ship object not found."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Only darts on equipment this ship has actually synced (mirrors
            # CMMSDefectDataAPI's own equipment_ship_detail_ids scoping) — same IsClosed/
            # Active filtering as that endpoint too, so a defect sync doesn't pull in the
            # ~7,900 closed/inactive-equipment darts alongside the currently-open ones.
            equipment_ship_detail_ids = list(
                ShipEquipment.objects.values_list("t_equipment_ship_detail", flat=True)
            )
            equipment_ship_detail_ids = [x for x in equipment_ship_detail_ids if x]

            id_placeholders = ",".join(["?"] * len(equipment_ship_detail_ids))

            query = f"""
                SELECT
                    T_Dart.Universal_ID_T_Dart,
                    T_Dart.DartNumber,
                    T_Dart.DartDate,
                    T_Dart.DefectDate,
                    T_Dart.ScheduleDate,
                    T_Dart.Universal_ID_Ch_Master_Symptoms,
                    T_Dart.SeverityID,
                    T_Dart.SeverityCode,
                    T_Dart.Universal_ID_M_Severity,
                    T_Dart.Universal_ID_Ch_Master_Ship_Remarks_By,
                    T_Dart.Universal_ID_M_RequiredAssistance,
                    T_Dart.IsOstObservation,
                    T_Dart.DefectiveComponent,
                    T_Dart.Remarks AS Remarks,
                    T_Dart.DefectDescription AS DefectDescription,
                    T_Dart.IsClosed,
                    T_Dart.Is_Defect,
                    T_Dart.Active,
                    T_Dart.RoutineDefect,
                    T_Dart.Serial_Number,
                    T_Dart.Is_Operational,
                    T_Dart.Universal_ID_T_RefComp,
                    T_Dart.Universal_ID_M_Ship,
                    T_Dart.Universal_ID_M_Department,
                    T_Dart.Universal_ID_T_EquipmentShipDetail,
                    T_Dart.IsGDForm,

                    T_DartDetailGD.Reason AS GD_Reason,

                    T_DartDetailGD.Defect_affects_sea_going_Operational_Availability
                        AS GD_Defect_affects_sea_going_Operational_Availability,

                    T_DartDetailGD.Hot_Work_Involved
                        AS GD_Hot_Work_Involved,

                    T_DartDetailGD.Date_place
                        AS GD_Date_place,

                    T_DartDetailGD.Date_for_Repairs
                        AS GD_Date_for_Repairs,

                    T_DartDetailGD.Place
                        AS GD_Place,

                    T_DartDetailGD.DateOfCompletion
                        AS GD_DateOfCompletion,

                    T_EquipmentShipDetail.Nomenclature,
                    M_Equipment.EquipmentName,
                    M_Equipment.EquipmentCode,
                    M_Department.Description AS DepartmentName,
                    M_Ship.ShipName,
                    M_ShipClass.Description AS ClassName

                FROM T_Dart WITH (NOLOCK)

                INNER JOIN T_EquipmentShipDetail WITH (NOLOCK)
                    ON T_Dart.Universal_ID_T_EquipmentShipDetail =
                       T_EquipmentShipDetail.Universal_ID_T_EquipmentShipDetail

                INNER JOIN M_Ship WITH (NOLOCK)
                    ON T_Dart.Universal_ID_M_Ship =
                       M_Ship.Universal_ID_M_Ship

                INNER JOIN M_ShipClass WITH (NOLOCK)
                    ON M_Ship.Universal_ID_M_ShipClass =
                       M_ShipClass.Universal_ID_M_ShipClass

                INNER JOIN M_Department WITH (NOLOCK)
                    ON T_Dart.Universal_ID_M_Department =
                       M_Department.Universal_ID_M_Department

                LEFT JOIN M_Equipment WITH (NOLOCK)
                    ON T_EquipmentShipDetail.Universal_ID_M_Equipment =
                       M_Equipment.Universal_ID_M_Equipment

                LEFT JOIN T_DartDetailGD WITH (NOLOCK)
                    ON T_Dart.Universal_ID_T_Dart =
                       T_DartDetailGD.Universal_ID_T_Dart

                WHERE
                    T_Dart.Universal_ID_M_Ship = ?

                    AND T_Dart.Is_Defect = 1

                ORDER BY
                    T_Dart.DartDate DESC
            """
            # No IsClosed / Active / equipment-active / locally-mapped-equipment filters:
            # those used to restrict this pull to ~20 currently-open darts on already-synced
            # equipment, silently skipping the other ~7,900 (mostly closed, mostly on
            # equipment that's since been swapped out or deactivated over the ship's
            # history). Equipment/dept joins are LEFT so a dart missing that link still
            # pulls in with those fields null instead of vanishing — a closed 2019 dart's
            # equipment being inactive today doesn't make the dart itself any less real.
            #
            # Active specifically used to also be filtered to 1, which silently dropped any
            # DART closed through SWMM's own CompleteDARTUpdateAPI: that view sets
            # Active=CMMS_CLOSED_DART_ACTIVE (0 for this deployment) on close, so a pull that
            # required Active=1 could never see it — or any status change on it — again. Real
            # CMMS data shows Active doesn't reliably track open/closed anyway (10,474 of
            # 12,543 closed DARTs there are still Active=1, and 1,152 open ones are Active=0),
            # so filtering on it here was never actually selecting for "open".

            params = [ship_obj.universal_id_m_ship]

            # ---------------------------------------------------------
            # Connect to CMMS MSSQL
            # ---------------------------------------------------------
            conn = get_mssql_connection()
            cursor = conn.cursor()

            cursor.execute(query, params)

            columns = [col[0] for col in cursor.description]

            ship_eq_by_id = {}
            for row in ShipEquipment.objects.exclude(
                t_equipment_ship_detail__isnull=True
            ).exclude(t_equipment_ship_detail=""):
                ship_eq_by_id.setdefault(row.t_equipment_ship_detail, row)

            ems_eq_by_id = {}
            for row in EquipmentName.objects.exclude(
                universal_id_t_equipment_ship_detail__isnull=True
            ).exclude(universal_id_t_equipment_ship_detail=""):
                ems_eq_by_id.setdefault(row.universal_id_t_equipment_ship_detail, row)

            dept_by_id = {}
            for row in Department.objects.order_by("pk"):
                dept_by_id.setdefault(row.universal_id_m_department, row)

            symptom_by_id = {}
            for row in ChMasterSymptoms.objects.order_by("pk"):
                symptom_by_id.setdefault(row.universal_id_ch_master_symptoms, row)

            severity_by_id = {}
            for row in MSeverity.objects.order_by("pk"):
                severity_by_id.setdefault(row.universal_id_m_severity, row)

            remark_by_id = {}
            for row in ChMasterShipRemarksBy.objects.order_by("pk"):
                remark_by_id.setdefault(row.universal_id_ch_master_ship_remarks_by, row)

            ra_by_id = {}
            for row in MRequiredAssistance.objects.order_by("pk"):
                ra_by_id.setdefault(row.universal_id_m_required_assistance, row)

            refit_by_id = {}
            for row in RefitMaintenancePeriod.objects.order_by("pk"):
                refit_by_id.setdefault(row.universal_id_m_refit, row)

            dart_by_uid = {}
            dart_by_number = {}
            for dart in InitiateDart.objects.order_by("pk"):
                if dart.universal_id_t_dart:
                    dart_by_uid.setdefault(dart.universal_id_t_dart, dart)
                dart_by_number.setdefault(dart.dart_number, dart)

            fetched_count = 0
            saved_count = 0
            inserted_count = 0
            updated_count = 0
            error_count = 0
            errors = []

            # ---------------------------------------------------------
            # Date conversion helper
            # ---------------------------------------------------------
            def parse_date_val(value):
                if not value:
                    return None

                if isinstance(value, datetime):
                    return value.date()

                if isinstance(value, date):
                    return value

                try:
                    return datetime.strptime(
                        str(value).split("T")[0], "%Y-%m-%d"
                    ).date()
                except Exception:
                    return None

            # ---------------------------------------------------------
            # Process CMMS defects, chunked so ~7,950 rows don't build one huge
            # in-memory result set before any write can start (same reasoning as
            # iter_cmms_rows elsewhere in this module).
            # ---------------------------------------------------------
            def _iter_rows():
                while True:
                    chunk = cursor.fetchmany(5000)
                    if not chunk:
                        break
                    for row in chunk:
                        yield row

            with transaction.atomic():
                for row in _iter_rows():
                    record = dict(zip(columns, row))

                    fetched_count += 1
                    dart_number = record.get("DartNumber")

                    if not dart_number:
                        continue

                    try:
                        # -------------------------------------------------
                        # Find existing InitiateDart
                        # -------------------------------------------------
                        universal_id = record.get("Universal_ID_T_Dart")

                        obj = None

                        if universal_id:
                            obj = dart_by_uid.get(universal_id)

                        if not obj:
                            obj = dart_by_number.get(dart_number)

                        created_new = False

                        if not obj:
                            obj = InitiateDart(dart_number=dart_number)
                            created_new = True

                        if universal_id:
                            obj.universal_id_t_dart = universal_id

                        # -------------------------------------------------
                        # Equipment mapping
                        # -------------------------------------------------
                        t_eq_id = record.get("Universal_ID_T_EquipmentShipDetail")

                        ship_eq = ship_eq_by_id.get(t_eq_id) if t_eq_id else None
                        ems_eq = ems_eq_by_id.get(t_eq_id) if t_eq_id else None

                        # -------------------------------------------------
                        # Department mapping
                        # -------------------------------------------------
                        univ_dept_id = record.get("Universal_ID_M_Department")

                        dept = dept_by_id.get(univ_dept_id) if univ_dept_id else None

                        # -------------------------------------------------
                        # Symptom mapping
                        # -------------------------------------------------
                        symptom_id = record.get("Universal_ID_Ch_Master_Symptoms")

                        symptom = symptom_by_id.get(symptom_id) if symptom_id else None

                        # -------------------------------------------------
                        # Severity mapping
                        # -------------------------------------------------
                        severity_id = record.get("Universal_ID_M_Severity")

                        severity = (
                            severity_by_id.get(severity_id) if severity_id else None
                        )

                        # -------------------------------------------------
                        # Remark mapping
                        # -------------------------------------------------
                        remark_id = record.get("Universal_ID_Ch_Master_Ship_Remarks_By")

                        remark = remark_by_id.get(remark_id) if remark_id else None

                        # -------------------------------------------------
                        # Required Assistance mapping
                        # -------------------------------------------------
                        ra_id = record.get("Universal_ID_M_RequiredAssistance")

                        ra = ra_by_id.get(ra_id) if ra_id else None

                        # -------------------------------------------------
                        # Refit mapping
                        # -------------------------------------------------
                        refit_id = record.get("Universal_ID_T_RefComp")

                        refit = refit_by_id.get(refit_id) if refit_id else None

                        # -------------------------------------------------
                        # Map main fields
                        # -------------------------------------------------
                        obj.equipment_ship = ship_eq
                        obj.department_id = dept
                        obj.equipment_ems = ems_eq or None

                        obj.dart_sr_number = record.get("Serial_Number")

                        obj.dart_date = parse_date_val(record.get("DartDate"))

                        obj.rectification_date = parse_date_val(
                            record.get("ScheduleDate")
                        )

                        # -------------------------------------------------
                        # Operational status
                        # -------------------------------------------------
                        ops_val = record.get("Is_Operational")

                        if ops_val is not None:
                            obj.ops_status = bool(ops_val)

                            obj.maintenance_period = (
                                "OPERATIONAL" if bool(ops_val) else "REFIT"
                            )

                        obj.trial_required = bool(record.get("IsOstObservation"))

                        obj.defective_component = record.get("DefectiveComponent")

                        obj.defective_discriptions = record.get(
                            "DefectDescription"
                        ) or record.get("Remarks")

                        obj.is_closed = bool(record.get("IsClosed"))

                        # -------------------------------------------------
                        # Related master mappings
                        # -------------------------------------------------
                        obj.symptom_code = symptom
                        obj.severity_code = severity
                        obj.remark_code = remark
                        obj.require_assistance_for_code = ra
                        obj.refit_maintenance_period_f_key = refit

                        # -------------------------------------------------
                        # Guarantee defect fields
                        # -------------------------------------------------
                        obj.is_guarantee_defect = bool(record.get("IsGDForm"))

                        obj.guarantee_cause = record.get("GD_Reason")

                        val_op = record.get(
                            "GD_Defect_affects_sea_going_Operational_Availability"
                        )

                        obj.guarantee_op_availability = (
                            bool(val_op) if val_op is not None else False
                        )

                        val_hw = record.get("GD_Hot_Work_Involved")

                        obj.guarantee_hot_work = (
                            bool(val_hw) if val_hw is not None else False
                        )

                        obj.guarantee_repairs = record.get("GD_Date_place")

                        obj.guarantee_place = record.get("GD_Place")

                        obj.guarantee_repair_date = parse_date_val(
                            record.get("GD_Date_for_Repairs")
                        )

                        obj.guarantee_completion_date = parse_date_val(
                            record.get("GD_DateOfCompletion")
                        )

                        obj.save()

                        if obj.universal_id_t_dart:
                            dart_by_uid[obj.universal_id_t_dart] = obj
                        dart_by_number[obj.dart_number] = obj

                        saved_count += 1

                        if created_new:
                            inserted_count += 1
                        else:
                            updated_count += 1

                    except Exception as ex:
                        error_count += 1

                        errors.append({"dartnumber": dart_number, "error": str(ex)})

            # DartHistoryDefaultDataAPIView and DartDashboardAPIView cache their responses
            # for 5 minutes (swmm.cache_utils.make_cache_key) keyed on a hash that has no
            # way to be selectively invalidated per-department -- without this, freshly
            # pulled/updated DARTs are written to Postgres correctly but the History tab and
            # dashboard keep serving whatever they last cached, up to 5 minutes stale.
            cache.clear()

            if "sfd/open-defects-sync" in request.path:
                log_lines = [
                    "[SYSTEM] Starting CMMS Open Defects Sync...",
                    f"Fetched {fetched_count} open defects from CMMS. Processing start...",
                    f"[OK] Saved {saved_count} defects.",
                    f"[NEW] Inserted: {inserted_count}",
                    f"[EXISTING] Updated: {updated_count}",
                    f"[SKIPPED] Errors: {error_count}",
                    "[Completed] CMMS open defect sync completed successfully.",
                ]
                for item in errors[:25]:
                    log_lines.append(
                        f"[ERROR] {item.get('dartnumber')}: {item.get('error')}"
                    )
                return HttpResponse("\n".join(log_lines), content_type="text/plain")

            return Response(
                {
                    "status": True,
                    "message": ("CMMS open defect sync completed successfully."),
                    "fetched_count": fetched_count,
                    "saved_count": saved_count,
                    "inserted_count": inserted_count,
                    "updated_count": updated_count,
                    "error_count": error_count,
                    "errors": errors,
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response(
                {
                    "status": False,
                    "message": "CMMS defect sync failed.",
                    "error": str(e),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        finally:
            if cursor:
                cursor.close()

            if conn:
                conn.close()


### 2 APis Pending ##


# --------------------------------------------------------------------------
# SWMM -> CMMS defect push
#
# A DART raised in SWMM lands in one of three CMMS tables depending on what
# kind of defect it is:
#
#   normal defect    -> T_Dart
#   guarantee defect -> T_Dart + T_DartDetailGD
#   ABER / A&A       -> T_Dart + T_DartDLIIIDetails
#
# T_Dart always gets a row; the two detail tables hang off it by
# Universal_ID_T_Dart.
# --------------------------------------------------------------------------

DART_KIND_DEFECT = "DEFECT"
DART_KIND_GUARANTEE = "GUARANTEE"
DART_KIND_ABER = "ABER"


def dart_kind(dart):
    """Which of the three CMMS destinations this DART payload belongs to.

    defect_type is the modern discriminator, but rows predating it only carry
    the is_guarantee_defect / is_dl_initiate booleans, so both are honoured.
    """
    defect_type = (dart.get("defect_type") or "").strip().upper()

    if defect_type in ("ABER", "AS_AND_AS", "AS & AS") or dart.get("is_dl_initiate"):
        return DART_KIND_ABER

    if defect_type == "GUARANTEE" or dart.get("is_guarantee_defect"):
        return DART_KIND_GUARANTEE

    return DART_KIND_DEFECT


def cmms_user_uid(user):
    """The CMMS A_User UID mapped onto `user`'s profile, or None if unmapped.

    SWMM logins have no built-in correspondence to a CMMS user record; this is
    populated by hand per operator on CustomUserProfile.universal_id_a_user (there is
    no way to derive it automatically) so that DART/routine pushes can stamp a real
    CreatedBy/UpdatedBy instead of leaving it null. Unmapped users just push null, same
    as before this existed.
    """
    profile = getattr(user, "user_profile", None)
    return getattr(profile, "universal_id_a_user", None) or None


def ensure_routine_dart_uid(routine):
    """routine.universal_id_t_dart, generating + persisting one if it's blank.

    Routines SWMM itself planned (never round-tripped through a CMMS pull) can
    reach the CMMS push with no CMMS UID at all. Reusing whatever gets
    generated here on every future push (instead of re-generating a fresh one
    each time) is what keeps this an UPDATE in CMMS rather than a new row per
    sync.
    """
    if routine.universal_id_t_dart:
        return routine.universal_id_t_dart
    uid = str(uuid.uuid4())
    routine.universal_id_t_dart = uid
    routine.save(update_fields=["universal_id_t_dart"])
    return uid


def ensure_maintop_detail_uid(maintop_detail):
    """Same idea as ensure_routine_dart_uid, for MaintopDetail.universal_id_t_maintopdetail."""
    if not maintop_detail:
        return None
    if maintop_detail.universal_id_t_maintopdetail:
        return maintop_detail.universal_id_t_maintopdetail
    uid = str(uuid.uuid4())
    maintop_detail.universal_id_t_maintopdetail = uid
    maintop_detail.save(update_fields=["universal_id_t_maintopdetail"])
    return uid


# Columns on T_Dart that a *different* API owns: CompleteDARTUpdateAPI fills
# them in when the defect is closed out. An UPDATE from the push path must not
# blank them just because SWMM has nothing to say about them yet.
_T_DART_PRESERVE_WHEN_NULL = frozenset(
    {
        "RectifiedDate",
        "CancelDate",
        "UpdatedDate",
    }
)


def cmms_upsert(cursor, table, key_column, key_value, columns, preserve_when_null=()):
    """UPDATE-else-INSERT one row, built from a single {column: value} mapping.

    Deriving both statements from the same mapping is the whole point: the
    hand-written pair this replaces listed 43 columns against 47 placeholders,
    so every INSERT of a new DART failed while the UPDATE path kept working.

    Columns named in preserve_when_null are left alone on UPDATE when the new
    value is None, so re-pushing a DART cannot erase data another API wrote.

    Columns the connected CMMS doesn't have are dropped rather than written:
    MSSQL rejects the *whole* statement on the first unknown column name, so one
    deployment-specific column takes down every DART in the batch (T_Dart here has
    no OtherRank, which failed the push outright). Same guard the SRAR push already
    applies in srar.cmms_push._upsert — see also cmms_optional_column on the read
    side.

    Returns True if the row was inserted, False if it was updated.
    """
    known = cmms_columns(cursor, table)

    # An empty set means INFORMATION_SCHEMA told us nothing about this table (no
    # metadata rights, say). Filtering on that would drop every column, so fall back
    # to writing what the caller asked for and let SQL Server be the judge.
    if known:
        unknown = [col for col in columns if col.lower() not in known]
        if unknown:
            # Once per table per process, not once per DART: a 500-DART push would
            # otherwise repeat the same line 500 times and bury everything else.
            dropped = _CMMS_DROPPED_COLUMNS.setdefault(table, set())
            if not dropped.issuperset(unknown):
                dropped.update(unknown)
                logger.warning(
                    "CMMS %s has no column(s) %s - dropped from this push.",
                    table,
                    ", ".join(sorted(dropped)),
                )
            columns = {col: val for col, val in columns.items() if col.lower() in known}
        if key_column.lower() not in known:
            raise ValueError(
                f"CMMS table {table} has no key column {key_column}; "
                "this deployment's schema is not one this push understands."
            )

    cursor.execute(
        f"SELECT 1 FROM [{table}] WITH (NOLOCK) WHERE [{key_column}] = ?",
        (key_value,),
    )
    exists = cursor.fetchone() is not None

    payload = {col: val for col, val in columns.items() if col != key_column}

    if exists:
        payload = {
            col: val
            for col, val in payload.items()
            if not (val is None and col in preserve_when_null)
        }

        if not payload:
            # Nothing left to write (everything was preserved or unknown here) —
            # the row already exists, so that is a no-op, not an empty UPDATE.
            return False

        assignments = ", ".join(f"[{col}] = ?" for col in payload)
        cursor.execute(
            f"UPDATE [{table}] SET {assignments} WHERE [{key_column}] = ?",
            tuple(payload.values()) + (key_value,),
        )
        return False

    names = list(payload) + [key_column]
    placeholders = ", ".join("?" * len(names))
    cursor.execute(
        f"INSERT INTO [{table}] ({', '.join(f'[{c}]' for c in names)}) "
        f"VALUES ({placeholders})",
        tuple(payload.values()) + (key_value,),
    )
    return True


def cmms_equipment_ship_ids(cursor):
    """{Universal_ID_T_EquipmentShipDetail: EquipmentShipID} for the whole table.

    T_Dart carries both the universal id and CMMS's own integer
    EquipmentShipID. SWMM only stores the universal id, so the integer has to
    be looked up — cached once per push rather than per DART.
    """
    cursor.execute(
        """
        SELECT Universal_ID_T_EquipmentShipDetail, EquipmentShipID
        FROM T_EquipmentShipDetail WITH (NOLOCK)
        WHERE Universal_ID_T_EquipmentShipDetail IS NOT NULL
        """
    )
    return {str(row[0]): row[1] for row in cursor.fetchall()}


def dart_number_parts(dart_number):
    """'A-E-10001' -> ('A', 'E', '10001'); short/blank numbers degrade quietly."""
    parts = (dart_number or "").split("-")
    prefix = parts[0] if len(parts) > 0 else ""
    section = parts[1] if len(parts) > 1 else ""
    serial = parts[2] if len(parts) > 2 else ""
    return prefix, section, serial


def build_t_dart_columns(
    dart, kind, ship_sr_no, universal_id_m_ship, ship_id, equipment_ship_ids
):
    """Every T_Dart column SWMM has a value for, in CMMS's own column order."""
    dart_number = dart.get("dart_number")
    _prefix, section, serial = dart_number_parts(dart_number)

    universal_eq_ship = dart.get("t_ship_details")

    # CMMS flag conventions, read off the live table: a defect is
    # Is_Defect=1 / Is_Routine=0 / RoutineDefect=2, a routine is the inverse.
    # A&A / ABER darts additionally carry Is_Amp.
    is_amp = 1 if kind == DART_KIND_ABER else 0
    is_gd_form = 1 if kind == DART_KIND_GUARANTEE else 0

    return {
        # ---------------- identity / numbering ----------------
        "DartNumber": dart_number,
        "SrNo": dart_number or f"{section}-{serial}",
        "Serial_Number": to_int(serial, default=None),
        "ShipSrNo": ship_sr_no,
        "Ship_ID": ship_id,
        "Source": 1,
        # ---------------- department ----------------
        "DepartmentID": dart.get("department_DepartmentID"),
        "Department": dart.get("department_Department"),
        "ExDept": dart.get("department_ExDept"),
        "ExDeptID": dart.get("department_ExDeptID"),
        # ---------------- equipment ----------------
        "EquipmentShipID": equipment_ship_ids.get(str(universal_eq_ship)),
        "EquipmentCode": dart.get("equipment_code"),
        "DefectiveComponent": dart.get("defective_component"),
        # ---------------- dates ----------------
        "DartDate": dart.get("dart_date"),
        "DefectDate": dart.get("dart_date"),
        # ScheduleDate is a routine-only concept in CMMS (RoutineDefect=1) — every DART
        # this path pushes is RoutineDefect=2 (see the flags block below), so it never
        # applies here.
        "ScheduleDate": None,
        "RectifiedDate": dart.get("completion_date"),
        "CancelDate": dart.get("cancel_date"),
        "SignalDTG": dart.get("signal_dtg"),
        "RoutineDueDate": dart.get("routine_due_date") or dart.get("due_date"),
        "RoutineStartDate": dart.get("routine_start_date"),
        "RAGenerationDate": dart.get("ra_generation_date"),
        "CreatedDate": dart.get("created_date"),
        "UpdatedDate": dart.get("updated_date"),
        # ---------------- description / remarks ----------------
        "Remarks": dart.get("defective_discriptions"),
        "DefectDescription": dart.get("defective_discriptions"),
        "Additional_Remarks": dart.get("additional_remarks"),
        "AdminRemarks": dart.get("admin_remarks"),
        "RA_Additional_Remarks": dart.get("ra_additional_remarks"),
        "RepairRoutineDetails": dart.get("repair_routine_details"),
        "XdueRefitRemarks": dart.get("xdue_refit_remarks"),
        # ---------------- symptom / severity / remarks-by ----------------
        "SymptomID": dart.get("symptom_id"),
        "OtherSymptomsCode": dart.get("other_symptoms_code"),
        "SeverityID": dart.get("serverity_id"),
        "SeverityCode": dart.get("serverity_code"),
        "Ship_Remarks": dart.get("ship_remarks"),
        "ShipRemarksID": dart.get("ship_remarks_id"),
        # ---------------- running hours ----------------
        "Next_Routine_Due_At_Running_Hours": dart.get("next_routine_due_at_rh"),
        "Present_Running_Hours": dart.get("present_running_hours"),
        "Running_Hour_Which_Routine_Completed": dart.get("rh_routine_completed"),
        "HrsFromInstallation": dart.get("hrs_from_installation"),
        "NewHrsFromInstallation": dart.get("new_hrs_from_installation"),
        "TotalRunningHours": dart.get("total_running_hours"),
        # ---------------- manpower ----------------
        "RoutineCarriedOutBy": dart.get("routine_carried_out_by"),
        "PersonalNo": dart.get("personal_no"),
        "OtherRank": dart.get("other_rank"),
        "TotalNoOfManpower": dart.get("total_no_of_manpower"),
        "MandaysConsumed": dart.get("mandays_consumed"),
        # ---------------- trials / OST ----------------
        "IsOstObservation": dart.get("trial_required"),
        # ---------------- flags ----------------
        "Is_Defect": 1,
        "Is_Routine": 0,
        "RoutineDefect": 2,
        "Is_Amp": is_amp,
        "AmpRefit": dart.get("amp_refit"),
        "Is_Refit": 0 if dart.get("Is_Operational") else 1,
        "Is_Operational": dart.get("Is_Operational"),
        "IsGDForm": is_gd_form,
        "IsClosed": 1 if dart.get("is_closed") else 0,
        "Active": 1,
        "NILDart": 0,
        "Is_Final_Submit": 1,
        "Is_Newly_Added": 0,
        "Is_Drafted": 1 if dart.get("is_drafted") else 0,
        "Is_Signal_Drafted": 1 if dart.get("is_signal_drafted") else 0,
        "Is_DLIIDrafted": 1 if dart.get("is_dl_draft") else 0,
        "Is_RefitRADraft": 1 if dart.get("is_ra_draft") else 0,
        "Is_AWRFDrafted": 0,
        "Is_Auto_Generated_Dart": 0,
        "RecForDeletion": 0,
        "IsExportToSDRS": 0,
        "IsSynced": 0,
        "IsFuss": dart.get("is_fuss"),
        "FussDate": dart.get("fuss_date"),
        # ---------------- spares / delays ----------------
        "SparesAvailability": dart.get("spares_availability"),
        "SpareReasonDays": dart.get("spare_reason_days"),
        "DelayReasonDays": dart.get("delay_reason_days"),
        # ---------------- DL / opdef ----------------
        "DL_Number": dart.get("dl_number"),
        "DL_Type_ID": dart.get("dl_type_id"),
        "OpdefNo": dart.get("opdef_no"),
        "OpdefSrNo": dart.get("opdef_sr_no"),
        "OpdefDTG": dart.get("opdef_dtg"),
        "FileName": dart.get("file_name"),
        "QuarterEnding": dart.get("quarter_ending"),
        # ---------------- universal ids ----------------
        "Universal_ID_M_Ship": universal_id_m_ship,
        "Universal_ID_M_Department": dart.get("Universal_ID_M_Department"),
        "Universal_ID_T_EquipmentShipDetail": universal_eq_ship,
        "Universal_ID_Ch_Master_Symptoms": dart.get("Universal_ID_Ch_Master_Symptoms"),
        "Universal_ID_M_Severity": dart.get("Universal_ID_M_Severity"),
        "Universal_ID_Ch_Master_Ship_Remarks_By": dart.get(
            "Universal_ID_Ch_Master_Ship_Remarks_By"
        ),
        "Universal_ID_M_RequiredAssistance": dart.get(
            "Universal_ID_M_RequiredAssistance"
        ),
        "Universal_ID_M_OSTList": dart.get("Universal_ID_M_OSTList"),
        "Universal_ID_T_RefComp": dart.get("Universal_ID_T_RefComp"),
        "Universal_ID_M_Frequency": dart.get("Universal_ID_M_Frequency"),
        "Universal_ID_T_MaintopDetail": dart.get("Universal_ID_T_MaintopDetail"),
        "Universal_ID_M_RankList": dart.get("Universal_ID_M_RankList"),
        "Universal_ID_A_User_Created_By": dart.get("Universal_ID_A_User_Created_By"),
        "Universal_ID_A_User_Updated_By": dart.get("Universal_ID_A_User_Updated_By"),
        "Universal_ID_T_Dart": dart.get("_cmms_dart_id"),
    }


def build_t_dart_detail_gd_columns(dart, dart_id):
    """T_DartDetailGD — the guarantee-defect form hanging off a T_Dart row."""
    repairs = dart.get("guarantee_repairs")

    repair_date = dart.get("guarantee_repair_date")
    place = dart.get("guarantee_place")

    # "0" means no repair was arranged, so the date/place pair is meaningless.
    if repairs == "0":
        repair_date = None
        place = None

    return {
        "Universal_ID_T_Dart": dart_id,
        "Reason": dart.get("guarantee_cause"),
        "Defect_affects_sea_going_Operational_Availability": bool(
            dart.get("guarantee_op_availability")
        ),
        "Hot_Work_Involved": bool(dart.get("guarantee_hot_work")),
        "Date_place": repairs,
        "Date_for_Repairs": repair_date,
        "Place": place,
        "DateOfCompletion": dart.get("guarantee_completion_date"),
        "CreatedDate": dart.get("created_date"),
        "UpdatedDate": dart.get("updated_date"),
        "Universal_ID_A_User_Created_By": dart.get("Universal_ID_A_User_Created_By"),
        "Universal_ID_A_User_Updated_By": dart.get("Universal_ID_A_User_Updated_By"),
        "IsSynced": 0,
        "Universal_ID_T_DartDetailGD": dart_id,
    }


def build_t_dart_dliii_columns(
    dart, dart_id, ship_sr_no, universal_id_m_ship, ship_id, equipment_ship_ids
):
    """T_DartDLIIIDetails — the ABER / A&A form.

    Note this table is NOT shaped like T_DartDetailGD: it repeats the defect's
    own department / equipment / date columns and adds the A&A-specific
    Authority / Qty / MajorMinor / LocationOnBoard set.
    """
    dart_number = dart.get("dart_number")
    _prefix, section, serial = dart_number_parts(dart_number)

    universal_eq_ship = dart.get("t_ship_details")

    defect_type = (dart.get("defect_type") or "").strip().upper()
    major_minor = dart.get("major_minor") or (
        "Major A's & A's" if defect_type == "AS_AND_AS" else "ABER"
    )

    return {
        # ---------------- identity ----------------
        "DartNumber": dart_number,
        "SrNo": f"{section}-{serial}",
        "Serial_Number": to_int(serial, default=None),
        "Ship_ID": ship_id,
        # ---------------- department / equipment ----------------
        "DepartmentID": dart.get("department_DepartmentID"),
        "Department": dart.get("department_Department"),
        "EquipmentShipID": equipment_ship_ids.get(str(universal_eq_ship)),
        "EquipmentCode": dart.get("equipment_code"),
        "EquipmentName": dart.get("equipment_name"),
        # ---------------- defect ----------------
        "DefectDate": dart.get("dart_date"),
        "DefectDescription": dart.get("defective_discriptions"),
        "RectifiedDate": dart.get("completion_date"),
        "Remarks": dart.get("dl_remarks") or dart.get("defective_discriptions"),
        "RA_Additional_Remarks": dart.get("ra_additional_remarks"),
        # ---------------- A&A specifics ----------------
        "Authority": dart.get("dl_authority"),
        "Qty": dart.get("quantity"),
        "MajorMinor": major_minor,
        "LocationOnBoard": dart.get("location_on_board"),
        "OtherRepairAgency": dart.get("other_repair_agency"),
        # ---------------- DL ----------------
        "DL_Number": dart.get("dl_number"),
        "Is_Drafted": 1 if dart.get("is_drafted") else 0,
        "RAGenerationDate": dart.get("ra_generation_date"),
        # ---------------- status / audit ----------------
        "IsClosed": 1 if dart.get("is_closed") else 0,
        "Active": True,
        "CreatedDate": dart.get("created_date"),
        "UpdatedDate": dart.get("updated_date"),
        "ShipRemarksID": dart.get("ship_remarks_id"),
        "IsSynced": 0,
        # ---------------- universal ids ----------------
        "Universal_ID_M_Ship": universal_id_m_ship,
        "Universal_ID_M_Department": dart.get("Universal_ID_M_Department"),
        "Universal_ID_T_EquipmentShipDetail": universal_eq_ship,
        "Universal_ID_M_Equipment": dart.get("m_equipment"),
        "Universal_ID_Ch_Master_Ship_Remarks_By": dart.get(
            "Universal_ID_Ch_Master_Ship_Remarks_By"
        ),
        "Universal_ID_M_RepairAgency": dart.get("Universal_ID_M_RepairAgency"),
        "Universal_ID_T_RefComp": dart.get("Universal_ID_T_RefComp"),
        "Universal_ID_A_User_Created_By": dart.get("Universal_ID_A_User_Created_By"),
        "Universal_ID_A_User_Updated_By": dart.get("Universal_ID_A_User_Updated_By"),
        "Universal_ID_T_DartDLIIIDetails": dart_id,
    }


class InitiateDARTDataSaveAPI(APIView):
    """Write SWMM DARTs into CMMS: T_Dart plus the GD / DL-III detail tables."""

    def post(self, request):
        conn = None
        cursor = None

        try:
            initiate_darts = request.data.get("initiate_darts", [])

            ship_obj = get_this_ship()

            ship_sr_no = None
            universal_id_m_ship = 0
            ship_id = None

            if ship_obj:
                ship_sr_no = ship_obj.sr_no
                universal_id_m_ship = ship_obj.universal_id_m_ship or 0
                ship_id = ship_obj.ship_external_id or to_int(
                    ship_obj.universal_id_m_ship, default=None
                )

            conn = get_mssql_connection()
            cursor = conn.cursor()

            equipment_ship_ids = cmms_equipment_ship_ids(cursor)

            inserted_ids = []
            success_ids = []
            counts = {
                DART_KIND_DEFECT: 0,
                DART_KIND_GUARANTEE: 0,
                DART_KIND_ABER: 0,
            }

            for dart in initiate_darts:
                dart_id = dart.get("universal_id_t_dart") or f"SWMM-{dart.get('id')}"
                dart["_cmms_dart_id"] = dart_id

                kind = dart_kind(dart)

                try:
                    # ---------------- T_Dart (always) ----------------
                    created = cmms_upsert(
                        cursor,
                        "T_Dart",
                        "Universal_ID_T_Dart",
                        dart_id,
                        build_t_dart_columns(
                            dart,
                            kind,
                            ship_sr_no,
                            universal_id_m_ship,
                            ship_id,
                            equipment_ship_ids,
                        ),
                        preserve_when_null=_T_DART_PRESERVE_WHEN_NULL,
                    )

                    if created:
                        inserted_ids.append(dart_id)

                    # ---------------- guarantee defect ----------------
                    if kind == DART_KIND_GUARANTEE:
                        cmms_upsert(
                            cursor,
                            "T_DartDetailGD",
                            "Universal_ID_T_DartDetailGD",
                            dart_id,
                            build_t_dart_detail_gd_columns(dart, dart_id),
                        )

                    # ---------------- ABER / A&A ----------------
                    elif kind == DART_KIND_ABER:
                        cmms_upsert(
                            cursor,
                            "T_DartDLIIIDetails",
                            "Universal_ID_T_DartDLIIIDetails",
                            dart_id,
                            build_t_dart_dliii_columns(
                                dart,
                                dart_id,
                                ship_sr_no,
                                universal_id_m_ship,
                                ship_id,
                                equipment_ship_ids,
                            ),
                        )

                    counts[kind] += 1
                    success_ids.append(dart.get("id"))

                except Exception as row_error:
                    logger.error(
                        "Failed writing DART to CMMS | DartNumber=%s | kind=%s | Error=%s",
                        dart.get("dart_number"),
                        kind,
                        str(row_error),
                    )

                    raise row_error

            conn.commit()

            if success_ids:
                InitiateDart.objects.filter(id__in=success_ids).update(
                    cmms_sync_status=True
                )

            return Response(
                {
                    "status": True,
                    "message": "DART records saved successfully",
                    "inserted_count": len(inserted_ids),
                    "defect_count": counts[DART_KIND_DEFECT],
                    "guarantee_count": counts[DART_KIND_GUARANTEE],
                    "aber_count": counts[DART_KIND_ABER],
                    "data": inserted_ids,
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception as e:
            if conn:
                conn.rollback()

            logger.exception("DART bulk insert failed")

            return Response(
                {
                    "status": False,
                    "message": "Failed to save DART data",
                    "error": str(e),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        finally:
            if cursor:
                cursor.close()

            if conn:
                conn.close()


# What T_Dart.Active is set to when a DART is closed out from SWMM.
#
# NOTE: this does NOT match CMMS's own data. There, IsClosed=1 <=> RectifiedDate IS NOT
# NULL exactly (12,543 rows), while Active is an independent visibility/soft-delete flag:
# 10,474 of 12,543 closed DARTs are still Active=1, and 1,152 *open* ones are Active=0.
# Set to 0 because that is the documented requirement for this deployment; flip to 1 to
# follow CMMS's own convention instead. Nothing else reads this.
CMMS_CLOSED_DART_ACTIVE = 0


class CompleteDARTUpdateAPI(APIView):
    """
    Update DART completion details in CMMS.dbo.T_Dart
    """

    def post(self, request):
        conn = None
        cursor = None

        try:
            complete_darts = request.data.get("complete_darts", [])

            if not complete_darts:
                return Response(
                    {"status": False, "error": "complete_darts is required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            conn = get_mssql_connection()
            cursor = conn.cursor()

            update_query = """
                UPDATE T_Dart
                SET
                    RectifiedDate = ?,
                    CancelDate = ?,
                    DiagnosticCode = ?,
                    RepairCode = ?,
                    DelayReasonDays = ?,
                    Additional_Remarks = ?,
                    SparesAvailability = ?,
                    DiagnosticID = ?,
                    RepairID = ?,
                    RepairAgencyID = ?,
                    AgencyCode = ?,
                    DelayID = ?,
                    DelayCode = ?,
                    Universal_ID_M_Repair = ?,
                    Universal_ID_M_Delay = ?,
                    Universal_ID_M_Diagnostic = ?,
                    Universal_ID_M_RepairAgency = ?,
                    Is_Auto_Generated_Dart = ?,
                    IsClosed = ?,
                    Active = ?,
                    UpdatedDate = GETDATE()
                WHERE Universal_ID_T_Dart = ?
            """

            updated_ids = []
            not_found_ids = []

            for comp in complete_darts:
                # A DART pulled from CMMS keeps its own universal id; only SWMM-raised ones
                # get the synthetic SWMM-<id>. Hardcoding the prefix meant closing a
                # CMMS-origin DART updated no row at all.
                universal_id = comp.get("universal_id_t_dart") or (
                    f"SWMM-{comp['initiate_dart_id']}"
                )

                values = (
                    comp.get("rectified_date"),
                    comp.get("rectified_date"),
                    comp.get("DiagnosticCode"),
                    comp.get("RepairCode"),
                    comp.get("days_delay"),
                    comp.get("rectification_details"),
                    comp.get("spares_delay"),
                    comp.get("DiagnosticID"),
                    comp.get("RepairID"),
                    comp.get("AgencyID"),
                    comp.get("AgencyCode"),
                    comp.get("DelayID"),
                    comp.get("DelayCode"),
                    comp.get("Universal_ID_M_Repair"),
                    comp.get("Universal_ID_M_Delay"),
                    comp.get("Universal_ID_M_Diagnostic"),
                    comp.get("Universal_ID_M_RepairAgency"),
                    comp.get("Is_Auto_Generated_Dart"),
                    1,
                    CMMS_CLOSED_DART_ACTIVE,
                    universal_id,
                )

                cursor.execute(update_query, values)

                # rowcount is the only signal that the WHERE actually matched a row in
                # CMMS -- without checking it, a stale/wrong universal_id (e.g. a closure
                # queued before the DART's own raise-push had ever run, or run against the
                # synthetic SWMM-<id> instead of the real id CMMS later got) silently
                # updates nothing while this endpoint still reports success, and the
                # caller then marks the closure synced even though CMMS never saw it.
                if cursor.rowcount and cursor.rowcount > 0:
                    updated_ids.append(universal_id)
                else:
                    not_found_ids.append(universal_id)

            conn.commit()

            return Response(
                {
                    "status": True,
                    "message": "DART completion updated successfully",
                    "updated_count": len(updated_ids),
                    "updated_ids": updated_ids,
                    "not_found_ids": not_found_ids,
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            if conn:
                conn.rollback()

            logger.exception("DART completion update failed")

            return Response(
                {"status": False, "error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        finally:
            if cursor:
                cursor.close()

            if conn:
                conn.close()


class CMMSDartPushAPI(APIView):
    """Step 5 — send SWMM DARTs up to CMMS. Push only; nothing comes back down.

    DART data flows one way in this system: SWMM is where a DART is raised and CMMS is the
    system of record it has to reach. The heavy lifting (the T_Dart / T_DartDetailGD upsert)
    already exists in InitiateDARTDataSaveAPI, and InitiateDartSyncAPIView already knows how
    to shape an InitiateDart row into the payload it expects — but that view reaches its own
    backend over HTTP (requests.post to API_URL), which needs a live server and hides errors
    behind a second request. This calls the save view in-process instead, one batch at a time,
    and streams progress the way the other long-running steps do.
    """

    _BATCH_SIZE = 50

    def get(self, request):
        return self.post(request)

    def post(self, request):
        return StreamingHttpResponse(
            self._stream_push(request), content_type="text/plain"
        )

    def _dart_queryset(self, request):
        queryset = (
            InitiateDart.objects.select_related(
                "equipment_ship",
                "equipment_ship__equipment",
                "equipment_ems",
                "department_id",
                "symptom_code",
                "severity_code",
                "remark_code",
                "require_assistance_for_code",
                "refit_maintenance_period_f_key",
            )
            .prefetch_related("ra_dl_entries")
            .exclude(dart_number__isnull=True)
            .exclude(dart_number="")
        )
        # ?all=1 re-pushes everything; by default only what CMMS hasn't accepted yet.
        if request.GET.get("all") not in ("1", "true", "True"):
            queryset = queryset.filter(cmms_sync_status=False)
        return queryset.order_by("id")

    def _stream_push(self, request):
        try:
            yield "[SYSTEM] Starting SWMM -> CMMS DART Push...\n"

            ship_obj = get_this_ship()
            if not ship_obj:
                yield (
                    "[FATAL] No local Ship record — run Step 1 (CMMS SFD Sync) first so "
                    "the ship this install belongs to exists locally.\n"
                )
                return
            yield (
                f"[OK] Ship: {ship_obj.name} / {ship_obj.code} / "
                f"Universal_ID_M_Ship={ship_obj.universal_id_m_ship}\n"
            )

            darts = list(self._dart_queryset(request))
            yield f"Fetched {len(darts)} local DARTs to push. Processing start...\n"
            if not darts:
                yield "[Completed] Nothing to push — every DART is already synced to CMMS.\n"
                return

            payloads = {dart.id: self._dart_payload(dart, request) for dart in darts}

            by_kind = defaultdict(int)
            for payload in payloads.values():
                by_kind[dart_kind(payload)] += 1
            yield (
                f"[OK] Split by destination: "
                f"{by_kind[DART_KIND_DEFECT]} defect -> T_Dart, "
                f"{by_kind[DART_KIND_GUARANTEE]} guarantee -> T_Dart + T_DartDetailGD, "
                f"{by_kind[DART_KIND_ABER]} ABER/A&A -> T_Dart + T_DartDLIIIDetails\n"
            )

            pushed = failed = 0

            for batch, ok, reason in self._push_batches(request, darts, payloads):
                if ok:
                    pushed += len(batch)
                    for dart in batch:
                        yield f"[NEW] Pushed {dart.dart_number}\n"
                else:
                    failed += len(batch)
                    for dart in batch:
                        yield f"[SKIPPED] {dart.dart_number}: {reason}\n"

            yield f"[OK] Pushed {pushed} DARTs to CMMS.\n"
            yield f"[SKIPPED] Failed: {failed}\n"
            yield "[Completed] SWMM -> CMMS DART push completed successfully.\n"

        except Exception as exc:
            logger.exception("SWMM -> CMMS DART push failed")
            yield f"\n[ERROR] {exc}\n"

    def _push_batches(self, request, darts, payloads):
        """Push darts to CMMS in batches, yielding (batch, ok, reason) per batch.

        Shared by the streaming pipeline step and the grid's Sync button so both mark
        cmms_sync_status the same way and neither can drift from the other.
        """
        factory = APIRequestFactory()
        save_view = InitiateDARTDataSaveAPI.as_view()

        for offset in range(0, len(darts), self._BATCH_SIZE):
            batch = darts[offset : offset + self._BATCH_SIZE]
            payload = {"initiate_darts": [payloads[dart.id] for dart in batch]}
            save_request = factory.post(
                "/api/dart/dart_initiate/", payload, format="json"
            )
            if request.user and request.user.is_authenticated:
                force_authenticate(save_request, user=request.user)

            try:
                response = save_view(save_request)
                if hasattr(response, "render"):
                    response.render()
                body = response.data if hasattr(response, "data") else {}
                ok = response.status_code < 400 and body.get("status", False)
            except Exception as exc:
                logger.exception("DART push batch failed")
                ok = False
                body = {"error": str(exc)}

            if ok:
                # Backfill the identity CMMS now actually holds this row under. Without
                # this, a freshly-raised DART's universal_id_t_dart stays empty forever —
                # InitiateDARTDataSaveAPI invents "SWMM-<id>" and writes THAT to CMMS as
                # Universal_ID_T_Dart, but never reports it back, so every later pull had
                # to fall back to matching by DartNumber alone to find this same row again.
                # If that string doesn't round-trip through CMMS exactly, the pull creates
                # a second local row instead of updating this one, and whatever CMMS did to
                # the original (e.g. closing it) never appears to land anywhere.
                cmms_sync_date = timezone.localdate()
                for dart in batch:
                    cmms_dart_id = (
                        payloads[dart.id].get("universal_id_t_dart")
                        or f"SWMM-{dart.id}"
                    )
                    InitiateDart.objects.filter(id=dart.id).update(
                        cmms_sync_status=True,
                        cmms_sync_date=cmms_sync_date,
                        universal_id_t_dart=cmms_dart_id,
                    )
                yield batch, True, None
            else:
                yield (
                    batch,
                    False,
                    (body.get("error") or body.get("message") or "unknown error"),
                )

    @ledgered(
        "push",
        "dart",
        adapter=lambda summary: {
            "fetched": summary.get("pushed", 0) + summary.get("failed", 0),
            "updated": summary.get("pushed", 0),
            "skipped": summary.get("failed", 0),
        },
    )
    def _push_and_summarize(self, request, darts):
        """Push `darts` and build the JSON summary dict shared by the JSON-response
        (non-streaming) push endpoints, so they can't drift from each other on the
        response shape the frontend already parses.
        """
        payloads = {dart.id: self._dart_payload(dart, request) for dart in darts}

        by_kind = defaultdict(int)
        for payload in payloads.values():
            by_kind[dart_kind(payload)] += 1

        pushed = failed = 0
        errors = []
        for batch, ok, reason in self._push_batches(request, darts, payloads):
            if ok:
                pushed += len(batch)
            else:
                failed += len(batch)
                errors.extend(
                    {"dart_number": dart.dart_number, "error": reason} for dart in batch
                )

        return {
            "pushed": pushed,
            "failed": failed,
            "defect_count": by_kind[DART_KIND_DEFECT],
            "guarantee_count": by_kind[DART_KIND_GUARANTEE],
            "aber_count": by_kind[DART_KIND_ABER],
            "errors": errors,
        }

    def _dart_payload(self, dart, request):
        """Shape one InitiateDart the way InitiateDARTDataSaveAPI expects.

        Mirrors InitiateDartSyncAPIView's payload, but tolerates the incomplete rows a
        real database has: that view does bare `int(dart.department_id.dep_code)` and
        `dart.equipment_ship.equipment.…`, so a DART with no department, no equipment or a
        non-numeric dep_code raises and takes the whole sync down with it.
        """

        def _iso(value):
            return value.isoformat() if value else None

        created_by_uid = cmms_user_uid(request.user)
        equipment_ship = dart.equipment_ship
        equipment = getattr(equipment_ship, "equipment", None)
        department = dart.department_id
        (
            cmms_department_code,
            cmms_department_id,
            cmms_department_uid,
        ) = resolve_cmms_department_for_dart(dart)

        # ABER / A&A darts carry their DL-III paperwork on InitiateRADL. Take the
        # newest non-deleted entry; there is one per generated DL.
        radl = (
            dart.ra_dl_entries.exclude(status="DELETED")
            .order_by("-created_date")
            .first()
        )

        return {
            "id": dart.id,
            # ---------------- which CMMS table this belongs in ----------------
            "defect_type": dart.defect_type,
            "is_dl_initiate": dart.is_dl_initiate,
            # ---------------- equipment detail (T_DartDLIIIDetails) ----------------
            "equipment_name": (
                getattr(equipment_ship, "equipment_name", None)
                if equipment_ship
                else None
            ),
            "location_on_board": (
                getattr(equipment_ship, "location_on_board", None)
                if equipment_ship
                else None
            ),
            "quantity": (
                getattr(equipment_ship, "quantity", None) if equipment_ship else None
            ),
            # ---------------- integer master ids CMMS also stores ----------------
            "symptom_id": (dart.symptom_code.symptom_id if dart.symptom_code else None),
            "ship_remarks_id": (
                dart.remark_code.ship_remark_by_id if dart.remark_code else None
            ),
            # ---------------- DL-III / RA paperwork ----------------
            "dl_number": getattr(radl, "dl_no", None),
            "dl_authority": getattr(radl, "authority", None),
            "dl_remarks": getattr(radl, "remarks", None),
            "ra_additional_remarks": getattr(radl, "additional_remarks", None),
            "is_drafted": (getattr(radl, "status", None) == "DRAFT"),
            # ---------------- draft flags ----------------
            "is_dl_draft": dart.is_dl_draft,
            "is_ra_draft": dart.is_ra_draft,
            # ---------------- free-text carried straight over ----------------
            "additional_remarks": dart.action_taken_to_repair,
            "repair_routine_details": dart.diagnosed_reason_of_defect,
            "t_ship_details": (
                str(equipment_ship.t_equipment_ship_detail) if equipment_ship else 0
            ),
            "m_equipment": (
                str(equipment.universal_id_m_equipment) if equipment else None
            ),
            "equipment_code": (str(equipment.equipment_code) if equipment else None),
            "dart_number": dart.dart_number,
            "dart_date": _iso(dart.dart_date),
            "rectified_date": _iso(dart.rectification_date),
            "ops_status": dart.ops_status,
            "Universal_ID_Ch_Master_Symptoms": (
                dart.symptom_code.universal_id_ch_master_symptoms
                if dart.symptom_code
                else None
            ),
            "Universal_ID_M_Severity": (
                dart.severity_code.universal_id_m_severity
                if dart.severity_code
                else None
            ),
            "Universal_ID_Ch_Master_Ship_Remarks_By": (
                dart.remark_code.universal_id_ch_master_ship_remarks_by
                if dart.remark_code
                else None
            ),
            "Universal_ID_M_RequiredAssistance": (
                dart.require_assistance_for_code.universal_id_m_required_assistance
                if dart.require_assistance_for_code
                else None
            ),
            "symptom_code": (
                dart.symptom_code.symptom_code if dart.symptom_code else None
            ),
            "serverity_code": (
                dart.severity_code.severity_code if dart.severity_code else None
            ),
            "serverity_id": (
                dart.severity_code.severity_id if dart.severity_code else None
            ),
            "remark_code": (
                dart.remark_code.universal_id_ch_master_ship_remarks_by
                if dart.remark_code
                else None
            ),
            "trial_required": dart.trial_required,
            "defective_component": dart.defective_component,
            "defective_discriptions": dart.defective_discriptions,
            # Resolved against CMMS's own M_Department (see resolve_cmms_department) rather
            # than derived from the local Department's `code`. T_Dart.Department is
            # varchar(2) and ExDept char(1), and they expect M_Department's DeptCode
            # ("H"/"E"/"L"/"X"); the local `code` is a long descriptive string on every
            # department SWMM seeded itself, so slicing it to fit produced "AD"/"A" beside
            # DepartmentID 0 and a null UID — a row CMMS can join to no department. When the
            # department maps to nothing in CMMS all five columns go out null, which CMMS
            # already holds for hundreds of its own rows, instead of a wrong code.
            #
            # ExDept takes the first letter of the resolved code because CMMS's own rows
            # mirror Department into it (E/E, H/H, X/X). Its ELECTRICAL rows also use it to
            # sub-divide (L paired with P/R/W/N) — SWMM holds nothing that says which, so
            # "L" it is, matching the 445 CMMS rows that already do the same.
            "department_DepartmentID": cmms_department_id,
            "department_Department": cmms_department_code,
            "department_ExDept": (cmms_department_code or "")[:1] or None,
            "department_ExDeptID": cmms_department_id,
            "Universal_ID_M_Department": cmms_department_uid,
            "is_closed": dart.is_closed,
            "sapres_required": dart.sapres_required,
            "is_ra_initiate": dart.is_ra_initiate,
            "photograph": (dart.photograph.url if dart.photograph else None),
            "created_date": _iso(dart.created_date),
            "Is_Operational": (1 if dart.maintenance_period == "OPERATIONAL" else 0),
            "Universal_ID_T_RefComp": (
                dart.refit_maintenance_period_f_key.Universal_ID_M_Refit
                if dart.refit_maintenance_period_f_key
                else None
            ),
            "Universal_ID_M_OSTList": (
                dart.universal_id_trial_required if dart.trial_required else None
            ),
            "is_guarantee_defect": dart.is_guarantee_defect,
            "guarantee_cause": dart.guarantee_cause,
            "guarantee_op_availability": dart.guarantee_op_availability,
            "guarantee_hot_work": dart.guarantee_hot_work,
            "guarantee_repairs": dart.guarantee_repairs,
            "guarantee_completion_date": _iso(dart.guarantee_completion_date),
            "guarantee_repair_date": _iso(dart.guarantee_repair_date),
            "guarantee_place": dart.guarantee_place,
            "universal_id_t_dart": dart.universal_id_t_dart,
            "Universal_ID_A_User_Created_By": created_by_uid,
            "Universal_ID_A_User_Updated_By": created_by_uid,
        }


class CMMSDartPushSelectedAPI(CMMSDartPushAPI):
    """Push the DARTs ticked on the Defect/DART Management grid, skipping ones already synced.

    Returns a JSON summary instead of a progress stream: this is a button on a grid that
    just needs counts for its toast, not a long-running pipeline log.
    """

    def get(self, request):
        return self.post(request)

    def _requested_ids(self, request):
        raw = request.data.get("ids") if isinstance(request.data, dict) else None
        if raw is None:
            raw = request.GET.get("ids", "")
            raw = raw.split(",") if raw else []
        return [value for value in (to_int(item) for item in raw) if value is not None]

    def _dart_queryset(self, request):
        """The selected DARTs, minus any CMMS already has.

        Reuses the parent's `cmms_sync_status=False` filter, which is what makes this
        "the selected ones that haven't gone up yet" rather than a blind re-push.
        """
        return super()._dart_queryset(request).filter(id__in=self._selected_ids)

    def post(self, request):
        self._selected_ids = self._requested_ids(request)

        if not self._selected_ids:
            return Response(
                {"status": False, "message": "Select at least one DART to sync."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ship_obj = get_this_ship()
        if not ship_obj:
            return Response(
                {
                    "status": False,
                    "message": (
                        "No local Ship record — run the CMMS SFD Sync (Step 1) first."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        darts = list(self._dart_queryset(request))
        already_synced = len(self._selected_ids) - len(darts)

        if not darts:
            return Response(
                {
                    "status": True,
                    "message": "Nothing to sync — every selected DART is already in CMMS.",
                    "selected": len(self._selected_ids),
                    "pushed": 0,
                    "failed": 0,
                    "already_synced": already_synced,
                },
                status=status.HTTP_200_OK,
            )

        summary = self._push_and_summarize(request, darts)
        pushed, failed = summary["pushed"], summary["failed"]

        return Response(
            {
                "status": failed == 0,
                "message": (
                    f"Pushed {pushed} DART(s) to CMMS."
                    if failed == 0
                    else f"Pushed {pushed}, failed {failed}."
                ),
                "selected": len(self._selected_ids),
                "already_synced": already_synced,
                **summary,
            },
            status=status.HTTP_200_OK,
        )


class CMMSDefectSyncAndPushAPI(CMMSDartPushAPI):
    """Step 5 — pull CMMS open defects and SRAR data down, then push SWMM-raised DARTs up.

    Defect pull runs first so the push works against a local table that already reflects
    whatever CMMS knows; if that pull fails the push is skipped rather than run against
    half-synced data. The SRAR pull is independent of DARTs (a separate set of tables), so
    it runs next but a failure there doesn't block the DART push — its own log lines just
    surface the error instead of raising.

    The pull leaves `cmms_sync_status` at its default False on every row it imports, so a
    naive push straight afterwards would send every CMMS defect back to CMMS and overwrite
    its own richer columns with SWMM's mapped subset. `_dart_queryset` below therefore
    limits the push to DARTs SWMM actually raised.
    """

    # Only this Step 5 sync subclass is gated, not the base CMMSDartPushAPI — that base
    # class also backs an individual DART's own auto-push-on-initiate (InitiateDartAPIView
    # instantiates it directly, without going through HTTP/permission_classes at all), which
    # any ship staff creating a DART must still be able to trigger.
    permission_classes = [CanInitialiseShipData]

    # Module name this step's resume checkpoints are filed under.
    RESUME_MODULE = "step5_darts"

    def post(self, request):
        return StreamingHttpResponse(
            self._stream_pull_then_push(
                request, full=request.GET.get("full") in ("1", "true", "True")
            ),
            content_type="text/plain",
        )

    def _dart_queryset(self, request):
        """Only DARTs SWMM raised, so the rows just pulled don't bounce straight back.

        A SWMM-raised DART has no CMMS id yet (`universal_id_t_dart` null/blank), or carries
        a locally-assigned placeholder: either the synthetic `SWMM-<id>` InitiateDARTDataSaveAPI
        assigns on push, or the `SWMM/<ship>/<year>/<month>/<id>` one dart.views's DART-raise
        flow backfills onto every new DART immediately at creation (well before it's ever
        pushed) — that second format is what real data actually carries, so matching only the
        hyphenated one meant this filter matched almost nothing: every genuinely-pending
        SWMM-raised DART already has a non-null "SWMM/..." id by the time it gets here, so it
        never fell into the isnull/blank/"SWMM-" branches and silently never got pushed, while
        the endpoint still reported "already synced". CMMS's own ids (bare integers, GUIDs)
        never start with "SWMM" at all, so matching that prefix without the dash still can't
        catch a real CMMS-origin row. `?include_cmms_origin=1` lifts the restriction for a
        deliberate full re-push.
        """
        queryset = super()._dart_queryset(request)

        if request.GET.get("include_cmms_origin") in ("1", "true", "True"):
            return queryset

        # The predicate itself lives on the dart app (managers.SWMM_RAISED_DART) because
        # the Defect grid's "CMMS Sync Status" tick has to answer the same question the
        # other way round. Held apart, the two drifted: the grid showed every pulled DART
        # as un-synced while this correctly refused to push them.
        return queryset.filter(SWMM_RAISED_DART)

    def _stream_pull_then_push(self, request, full=False):
        """The four phases, each checkpointed so an interruption does not redo the ones that
        already finished.

        Phase 4 needs no checkpoint of its own: `_push_batches` marks every DART it lands
        with `cmms_sync_status=True` as it goes, and `_dart_queryset` only ever selects
        un-pushed ones, so the push has always resumed naturally — a re-run picks up exactly
        the DARTs the interrupted one had not got to yet.
        """
        if full:
            clear_module(self.RESUME_MODULE)

        if phase_completed(self.RESUME_MODULE, "defect_pull"):
            yield (
                "[RESUMED] Step 5 phase 1/4 — open defects already pulled by the "
                "interrupted run.\n"
            )
        else:
            yield "[SYSTEM] Step 5 phase 1/4 — pulling open defects from CMMS...\n"
            try:
                for line in self._pull_log_lines(request):
                    yield line
            except Exception as exc:
                logger.exception("CMMS open-defect pull failed")
                yield f"[ERROR] Pull failed: {exc}\n"
                yield "[SKIPPED] Push not attempted — the pull has to succeed first.\n"
                return
            mark_phase_complete(self.RESUME_MODULE, "defect_pull")

        if phase_completed(self.RESUME_MODULE, "srar_pull"):
            yield (
                "\n[RESUMED] Step 5 phase 2/4 — SRAR already pulled by the interrupted "
                "run.\n"
            )
        else:
            yield "\n[SYSTEM] Step 5 phase 2/4 — pulling SRAR data from CMMS...\n"
            for line in CMMSSrarPullAPI()._stream_pull(request):
                yield line
            mark_phase_complete(self.RESUME_MODULE, "srar_pull")

        if phase_completed(self.RESUME_MODULE, "fuss_pull"):
            yield (
                "\n[RESUMED] Step 5 phase 3/4 — FUSS already pulled by the interrupted "
                "run.\n"
            )
        else:
            yield "\n[SYSTEM] Step 5 phase 3/4 — pulling FUSS history from CMMS...\n"
            for line in self._stream_fuss_pull():
                yield line
            mark_phase_complete(self.RESUME_MODULE, "fuss_pull")

        yield "\n[SYSTEM] Step 5 phase 4/4 — pushing SWMM DARTs to CMMS...\n"

        for line in self._stream_push(request):
            yield line

        clear_module(self.RESUME_MODULE)

    def _stream_fuss_pull(self):
        """Pull CMMS-held FUSS down into FussRaiseDetails.

        Lives here rather than in its own step because a FUSS is raised against a
        routine dart -- phases 1 and 2 have just refreshed those, so this is the
        first point in the run where every FUSS can resolve its local routine.
        A failure is reported and swallowed: the DART push that follows does not
        depend on FUSS, so it should still get its chance to run.
        """
        conn = None
        try:
            conn = get_mssql_connection()
            cursor = conn.cursor()
            ship_uid = resolve_cmms_ship_uid(cursor, env_ship_code())
            if not ship_uid:
                yield "[SKIPPED] Ship not resolved in CMMS — FUSS not pulled.\n"
                return
            stats = pull_cmms_fuss(cursor, ship_uid)
            yield (
                f"[OK] T_Fuss -> FussRaiseDetails "
                f"({stats['created']} new, {stats['updated']} updated, "
                f"{stats['skipped']} skipped of {stats['fetched']} fetched)\n"
            )
            # Stated rather than silent: CMMS has no FUSS-spare table to pull, so
            # a reader of this log is not left wondering why spares never appear.
            yield (
                "[INFO] FussSpare not pulled — CMMS holds no FUSS spare table; "
                "those rows are raised locally.\n"
            )
        except Exception as exc:
            logger.exception("CMMS FUSS pull failed")
            yield f"[ERROR] FUSS pull failed: {exc}\n"
        finally:
            if conn:
                conn.close()

    def _pull_log_lines(self, request):
        """Run CMMSDefectSyncAPI in-process and re-emit its log as stream lines.

        That view returns a plain-text log when it sees the open-defects path and a JSON
        body otherwise, so both shapes are handled rather than relying on the path sniff.
        """
        factory = APIRequestFactory()
        pull_request = factory.get("/api/v1/sfd/open-defects-sync/")
        if request.user and request.user.is_authenticated:
            force_authenticate(pull_request, user=request.user)

        response = CMMSDefectSyncAPI.as_view()(pull_request)
        if hasattr(response, "render"):
            response.render()

        body = getattr(response, "data", None)
        if isinstance(body, dict):
            if not body.get("status", True):
                raise RuntimeError(
                    body.get("error") or body.get("message") or "pull failed"
                )
            yield (
                f"Fetched {body.get('fetched_count', 0)} open defects from CMMS. "
                "Processing start...\n"
            )
            yield f"[OK] Saved {body.get('saved_count', 0)} defects.\n"
            yield f"[NEW] Inserted: {body.get('inserted_count', 0)}\n"
            yield f"[EXISTING] Updated: {body.get('updated_count', 0)}\n"
            yield f"[SKIPPED] Errors: {body.get('error_count', 0)}\n"
            for item in (body.get("errors") or [])[:25]:
                yield f"[ERROR] {item.get('dartnumber')}: {item.get('error')}\n"
            return

        if response.status_code >= 400:
            raise RuntimeError(f"pull returned HTTP {response.status_code}")

        for line in response.content.decode("utf-8", "replace").splitlines():
            if line.strip():
                yield f"{line}\n"


class CMMSDartSyncAllAPI(CMMSDefectSyncAndPushAPI):
    """Defect/DART grid's "Sync with CMMS" button.

    Ticking rows before syncing used to be how the push got scoped at all — but that also
    meant the grid's department/section filter silently limited what got pushed, since a
    user only ever ticks what the filtered grid shows them. This button now does what Step
    5 does (pull CMMS's latest, then push every SWMM-raised DART still pending, ship-wide,
    regardless of any grid filter or selection) but replies with a JSON summary like
    CMMSDartPushSelectedAPI, since this is a toast on a button, not the Step 5 pipeline log.
    """

    def post(self, request):
        try:
            for _ in self._pull_log_lines(request):
                pass
        except Exception as exc:
            logger.exception("CMMS open-defect pull failed")
            return Response(
                {"status": False, "message": f"CMMS pull failed: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        ship_obj = get_this_ship()
        if not ship_obj:
            return Response(
                {
                    "status": False,
                    "message": (
                        "No local Ship record — run the CMMS SFD Sync (Step 1) first."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        darts = list(self._dart_queryset(request))

        if not darts:
            return Response(
                {
                    "status": True,
                    "message": (
                        "Pulled the latest from CMMS. Nothing to push — every DART is "
                        "already synced."
                    ),
                    "pushed": 0,
                    "failed": 0,
                },
                status=status.HTTP_200_OK,
            )

        summary = self._push_and_summarize(request, darts)
        pushed, failed = summary["pushed"], summary["failed"]

        return Response(
            {
                "status": failed == 0,
                "message": (
                    f"Pulled the latest from CMMS. Pushed {pushed} DART(s)."
                    if failed == 0
                    else f"Pulled the latest from CMMS. Pushed {pushed}, failed {failed}."
                ),
                **summary,
            },
            status=status.HTTP_200_OK,
        )


# SRARPullFromCMMSAPIView reports each table it wrote as "[NEW] <label> inserted: N" /
# "[EXISTING] <label> updated: N". Reading those back is how Sync All answers "what arrived
# from CMMS this time" without a second implementation of the pull's own counting.
_SRAR_PULL_INSERTED = re.compile(r"\[NEW\].*inserted:\s*(\d+)", re.IGNORECASE)
_SRAR_PULL_UPDATED = re.compile(r"\[EXISTING\].*updated:\s*(\d+)", re.IGNORECASE)


class SyncAllTransactionsAPIView(APIView):
    """Dashboard "Sync All" button — runs every transaction module's existing manual CMMS
    sync in one click: SFD (equipment master pull, then change/remove request pull-back),
    Defect/DART (pull + push), Fuss (push), and SRAR (current month, pull-or-push).

    Deliberately calls each module's own existing endpoint in-process (same pattern as
    CMMSDartSyncAllAPI/CMMSDefectSyncAndPushAPI above) instead of reimplementing any sync
    logic here, so a fix made to one module's sync stays the single source of truth and
    automatically applies here too. One module failing does not stop the others — each
    result is reported independently.
    """

    # Resume checkpoints for the routine read-back below, which walks a few thousand rows
    # and so is the one part of this button worth resuming rather than restarting.
    ROUTINES_RESUME_MODULE = "syncall_routines"

    def post(self, request):
        # Deliberately the same order as the Ship Configuration wizard's Steps 1-5, because
        # it is the same dependency chain: equipment master before the maintops its fit
        # points at, maintops before the frequencies that link to them, both before the
        # routines derived from them, and all of it before the darts and returns that resolve
        # against a routine. Those steps are a first-run wizard; this button is how the same
        # ground gets re-covered every day afterwards, so it has to cover all of it.
        results = [
            self._run_sfd(request),
            self._run_maintop(request),
            self._run_frequency(request),
            self._run_routines(request),
            self._run_defect(request),
            self._run_fuss(request),
            self._run_srar(request),
        ]
        overall_status = all(result["status"] for result in results)
        return Response(
            {
                "status": overall_status,
                "modules": results,
                "completed_at": timezone.now().isoformat(),
            },
            status=(
                status.HTTP_200_OK if overall_status else status.HTTP_207_MULTI_STATUS
            ),
        )

    @staticmethod
    def _module_result(module, status_ok, message):
        return {"module": module, "status": status_ok, "message": message}

    @staticmethod
    def _drain(lines):
        """Run a step's log generator to the end and report (ok, first_failure, summary).

        The streaming steps report failure as a `[FATAL]`/`[ERROR]` line rather than by
        raising, so the only way to know whether one worked is to read what it said. Draining
        is also what *runs* it -- these are generators, so nothing happens until something
        consumes them.

        The summary keeps the step's own `[OK]`/`[Completed]` lines, which already carry the
        counts, rather than re-deriving numbers here that would then drift from the step's.
        """
        failure = None
        highlights = []
        for line in lines:
            for part in line.splitlines():
                text = part.strip()
                if not text:
                    continue
                if ("[FATAL]" in text or "[ERROR]" in text) and failure is None:
                    failure = text
                elif text.startswith("[OK]") or text.startswith("[Completed]"):
                    highlights.append(text)
        return failure is None, failure, " ".join(highlights[-4:])

    def _run_sfd(self, request):
        """Equipment master pull first, then the change/remove request read-back.

        The ordering is not cosmetic. Both halves of the request pull -- and the equipment
        status refresh that runs with them -- resolve CMMS rows against local ShipEquipment,
        so equipment added in CMMS since the last sync has to land locally before anything
        tries to match against it; otherwise those rows are skipped as unmatched and the
        button reports success having quietly dropped them. It is the same parent-before-
        child rule Step 1 and Step 5 already follow internally.

        The master pull is Step 1's own endpoint, reached through as_view() rather than by
        calling the instance directly, so its CanInitialiseShipData permission still applies
        -- this button is reachable by anyone, and Step 1 rewrites ship/department/equipment
        master data. A user without that permission gets the master pull reported as denied
        while the rest of Sync All still runs.
        """
        master_message = ""
        try:
            factory = APIRequestFactory()
            sub_request = factory.post("/api/v1/swmmapi/sfd/join-data")
            if request.user and request.user.is_authenticated:
                force_authenticate(sub_request, user=request.user)
            response = CMMSFDDataAPI.as_view()(sub_request)

            if getattr(response, "streaming", False):
                # _stream_sync() reports failure as a [FATAL] line rather than by raising,
                # so the stream has to be drained and read; it is also what actually runs
                # the sync, since nothing happens until the generator is consumed.
                chunks = [
                    chunk.decode("utf-8", "replace")
                    if isinstance(chunk, bytes)
                    else str(chunk)
                    for chunk in response.streaming_content
                ]
                fatal = next(
                    (line for line in "".join(chunks).splitlines() if "[FATAL]" in line),
                    None,
                )
                if fatal:
                    return self._module_result("sfd", False, fatal.strip())
                master_message = "Equipment master pulled. "
            else:
                if hasattr(response, "render"):
                    response.render()
                body = getattr(response, "data", {}) or {}
                return self._module_result(
                    "sfd",
                    False,
                    body.get("detail")
                    or f"SFD master pull rejected (HTTP {response.status_code}).",
                )
        except Exception as exc:
            logger.exception("Sync-all: SFD master pull failed")
            return self._module_result("sfd", False, f"SFD master pull failed: {exc}")

        try:
            response = CMMSSfdRequestPullAPI()._run()
            body = getattr(response, "data", {}) or {}
            return self._module_result(
                "sfd",
                bool(body.get("status", response.status_code < 400)),
                master_message + body.get("message", "SFD sync completed."),
            )
        except Exception as exc:
            logger.exception("Sync-all: SFD module failed")
            return self._module_result("sfd", False, f"SFD sync failed: {exc}")

    def _run_maintop(self, request):
        """Refresh the T_MaintopHeader / T_MaintopDetail mirror (Step 2's work).

        A routine that CMMS adds to a *new* maintop only reaches SWMM through this: the
        routine pull below resolves against MaintopDetail, so a maintop this mirror has never
        seen makes every routine on it unmatched. Leaving it to Step 2 meant it effectively
        never ran again after the ship was first set up.

        Driven through the view's own generator rather than through as_view(), the way
        CMMSSfdRequestPullAPI()._run() and CMMSSrarPullAPI()._stream_pull() are already
        called from here. That skips Step 2's CanInitialiseShipData gate on purpose: the gate
        exists because the wizard rewrites the ship's own data, whereas this writes nothing
        but a mirror of CMMS-owned rows keyed on CMMS's own ids. The wizard endpoint itself is
        untouched and stays gated.
        """
        try:
            # Step 2's own pre-flight, kept rather than bypassed -- syncing maintops over
            # equipment with no sub department buries the gap under another import. Reported
            # as a skip, not a failure, so one unassigned equipment cannot stop the whole
            # daily sync; the count and the fix are in the message.
            unassigned_total, by_department = _sub_department_readiness()
            if unassigned_total > 0:
                breakdown = ", ".join(
                    f"{row['department']}: {row['unassigned']}" for row in by_department
                )
                return self._module_result(
                    "maintop",
                    True,
                    f"Maintop refresh skipped — {unassigned_total} Active equipment have "
                    f"no Sub Department ({breakdown}). Assign them from RHSI Master, then "
                    f"sync again.",
                )

            ok, failure, summary = self._drain(CMMSMaintopSyncAPI()._stream_sync())
            if not ok:
                return self._module_result("maintop", False, failure)
            return self._module_result(
                "maintop", True, summary or "Maintop data refreshed from CMMS."
            )
        except Exception as exc:
            logger.exception("Sync-all: Maintop module failed")
            return self._module_result("maintop", False, f"Maintop sync failed: {exc}")

    def _run_frequency(self, request):
        """Refresh M_Frequency and re-link MaintopDetail rows to it (Step 3's work).

        Runs after the maintop refresh for the reason Step 3's own docstring gives: it
        backfills `frequency_f_key` from the universal id each detail row carries, so the
        detail rows have to be there first. A frequency CMMS renamed or re-scaled otherwise
        stayed stale locally forever, and a routine on a newly-pulled maintop detail had no
        frequency to categorise it by.
        """
        try:
            ok, failure, summary = self._drain(CMMSRoutineDataAPI()._stream_sync())
            if not ok:
                return self._module_result("frequency", False, failure)
            return self._module_result(
                "frequency", True, summary or "Frequency data refreshed from CMMS."
            )
        except Exception as exc:
            logger.exception("Sync-all: Frequency module failed")
            return self._module_result(
                "frequency", False, f"Frequency sync failed: {exc}"
            )

    def _run_routines(self, request):
        """Read back what CMMS did to this ship's routines while SWMM was not watching.

        This button pushed SWMM's pending work up and pulled equipment, defects and SFD
        requests down, but nothing here ever pulled *routines*. A routine added, re-dated or
        completed in CMMS — which is exactly what accumulates while a ship is off the link —
        had only one route into SWMM: Ship Configuration Step 4. That is a setup-wizard step
        behind CanInitialiseShipData, not something an operator runs after a reconnect, so in
        practice those changes never arrived at all.

        The three pulls are Step 4's own read-back half, in Step 4's order, and nothing else:

        * the nomenclature routine pull, which is what carries a routine's current DartNumber,
          due date and last-completion state;
        * T_RoutineList, which ties each local routine to its CMMS open-list row;
        * T_Dart completed routines, which is where CMMS keeps completion history.

        Then Step 4's second phase, which creates the routines this hull's equipment ought to
        have but that no dart exists for anywhere, with locally generated dart numbers. That
        phase mints local records rather than mirroring CMMS ones, which is why it has to run
        *after* the pull above: the missing-set is derived from what exists locally, so
        computing it first would treat every routine CMMS already holds as missing and mint a
        duplicate number for each. It is included because equipment newly fitted in CMMS
        arrives with no routine darts of its own, and without this its routines would simply
        never appear in the ship's plan.

        Every pull here is an upsert keyed on a CMMS Universal_ID, so re-running only
        refreshes; the missing-routine phase is likewise a no-op once the routines exist,
        since an existing routine is by definition no longer missing.

        Unlike Step 4 this runs for any signed-in user: keeping the ship's routine plan
        current is the everyday operation this button exists for, not the privileged one-off
        that setting a ship up is.
        """
        conn = None
        cursor = None
        try:
            conn = get_mssql_connection()
            cursor = conn.cursor()

            ship_code = env_ship_code()
            ship_uid = resolve_cmms_ship_uid(cursor, ship_code)
            if not ship_uid:
                return self._module_result(
                    "routines",
                    False,
                    f"Ship code '{ship_code}' not found in CMMS M_Ship — routines not "
                    f"pulled.",
                )

            equipment_ship_uids = list(
                ShipEquipment.objects.filter(ship=get_this_ship())
                .exclude(t_equipment_ship_detail__isnull=True)
                .exclude(t_equipment_ship_detail="")
                .values_list("t_equipment_ship_detail", flat=True)
                .distinct()
            )
            if not equipment_ship_uids:
                return self._module_result(
                    "routines",
                    False,
                    "No equipment on this ship yet — run the CMMS SFD Sync (Step 1) "
                    "first. Routines not pulled.",
                )

            cmms_rows = fetch_cmms_nomenclature_routines(
                cursor, ship_uid, equipment_ship_uids
            )
            # Driven through stream_sync_log rather than a second copy of the row loop, for
            # the reason this class exists: one implementation of each sync. Its log lines
            # are counted here instead of streamed, since this endpoint answers with JSON.
            new_count = existing_count = skipped_count = 0
            for line in stream_sync_log(
                "CMMS Nomenclature wise Routines (T_Dart Is_Routine = 1)",
                cmms_rows,
                create_missing_dart=False,
                module=self.ROUTINES_RESUME_MODULE,
                phase="cmms_routines",
                scope=(ship_uid, len(equipment_ship_uids)),
            ):
                if line.startswith("[NEW]"):
                    new_count += 1
                elif line.startswith("[EXISTING]"):
                    existing_count += 1
                elif line.startswith("[SKIPPED]"):
                    skipped_count += 1

            # Phase B, on the state phase A has just written. MissingRoutinesAPIView owns
            # the missing-set derivation; calling its own method keeps that in one place.
            missing_rows = MissingRoutinesAPIView()._build_missing_rows("")
            created_count = 0
            for line in stream_sync_log(
                "Create Nomenclature wise Missing Routines",
                missing_rows,
                create_missing_dart=True,
                module=self.ROUTINES_RESUME_MODULE,
                phase="missing_routines",
            ):
                if line.startswith("[NEW]"):
                    created_count += 1

            list_stats = pull_cmms_routine_list(cursor, ship_uid)
            completed_stats = pull_cmms_completed_routines(cursor, ship_uid)

            clear_module(self.ROUTINES_RESUME_MODULE)
            return self._module_result(
                "routines",
                True,
                (
                    f"Pulled {len(cmms_rows)} routines from CMMS "
                    f"({new_count} new, {existing_count} updated, "
                    f"{skipped_count} unmatched); created {created_count} missing "
                    f"routines; linked {list_stats['linked']} to T_RoutineList; "
                    f"{completed_stats['created']} new and "
                    f"{completed_stats['updated']} updated routine completions."
                ),
            )
        except Exception as exc:
            logger.exception("Sync-all: routine pull failed")
            return self._module_result("routines", False, f"Routine pull failed: {exc}")
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()

    def _run_defect(self, request):
        try:
            factory = APIRequestFactory()
            sub_request = factory.post("/api/v1/dart/sync-all-with-cmms/")
            if request.user and request.user.is_authenticated:
                force_authenticate(sub_request, user=request.user)
            response = CMMSDartSyncAllAPI.as_view()(sub_request)
            if hasattr(response, "render"):
                response.render()
            body = getattr(response, "data", {}) or {}
            return self._module_result(
                "defect",
                bool(body.get("status", response.status_code < 400)),
                body.get("message", "Defect/DART sync completed."),
            )
        except Exception as exc:
            logger.exception("Sync-all: Defect/DART module failed")
            return self._module_result("defect", False, f"Defect sync failed: {exc}")

    def _run_fuss(self, request):
        """Pull CMMS's FUSS down, then push the local ones up.

        The pull half was missing: InitiateFussSyncAPIView only ever pushes, so a FUSS raised
        or progressed in CMMS while the ship was offline had no way into SWMM from this
        button — `pull_cmms_fuss` existed but ran only inside Step 5's pipeline. Both halves
        key on Universal_ID_T_Fuss, so they converge on one local row per FUSS rather than
        duplicating each other.

        Pull before push, so a FUSS CMMS already holds is matched and updated rather than
        pushed back up as if it were new. A failed pull is reported but does not cancel the
        push: local FUSS still waiting to reach CMMS is the more perishable of the two.
        """
        pull_message = ""
        conn = None
        try:
            conn = get_mssql_connection()
            cursor = conn.cursor()
            ship_uid = resolve_cmms_ship_uid(cursor, env_ship_code())
            if ship_uid:
                stats = pull_cmms_fuss(cursor, ship_uid)
                pull_message = (
                    f"Pulled {stats['fetched']} FUSS from CMMS "
                    f"({stats['created']} new, {stats['updated']} updated). "
                )
            else:
                pull_message = "Ship not resolved in CMMS — FUSS not pulled. "
        except Exception as exc:
            logger.exception("Sync-all: Fuss pull failed")
            pull_message = f"FUSS pull failed: {exc}. "
        finally:
            if conn:
                conn.close()

        try:
            factory = APIRequestFactory()
            sub_request = factory.post("/api/v1/swmmapi/initiate-fuss-sync/")
            if request.user and request.user.is_authenticated:
                force_authenticate(sub_request, user=request.user)
            response = InitiateFussSyncAPIView.as_view()(sub_request)
            if hasattr(response, "render"):
                response.render()
            body = getattr(response, "data", {}) or {}
            return self._module_result(
                "fuss",
                bool(body.get("status", response.status_code < 400)),
                pull_message + body.get("message", "Fuss sync completed."),
            )
        except Exception as exc:
            logger.exception("Sync-all: Fuss module failed")
            return self._module_result(
                "fuss", False, pull_message + f"Fuss push failed: {exc}"
            )

    def _run_srar(self, request):
        """Push every CO-approved return CMMS has not been given yet; pull only to bootstrap.

        SRARSyncByMonthYearAPIView picks its own direction when no `mode` is passed, and it
        picks it from `cmms_sync_status` -- so "not yet synced" reads as "first time, pull
        from CMMS". That is exactly backwards for the returns this button exists to send:
        a return the CO has just approved is by definition not yet synced, so the unqualified
        call this used to make took the PULL branch, overwrote the ship's freshly entered
        SRAR data with whatever CMMS held, stamped cmms_sync_status = True, and reported
        success -- while CMMS never received a thing. That endpoint's own `mode=push`
        comment spells the trap out; this caller simply was not using it.

        It also only ever asked for the *current* month, so a return approved late (or a
        backlog after a spell offline) had no way of ever being sent at all.

        So: find what is actually pending, push each one explicitly with mode=push, and fall
        back to the pull only when there is nothing local to send -- which is the one case
        the pull was right for, a fresh database being seeded.
        """
        from srar.models import SrarMonthlyHeader

        pending = list(
            SrarMonthlyHeader.objects.filter(co_approved=True)
            .filter(Q(cmms_sync_status=False) | Q(cmms_sync_status__isnull=True))
            .order_by("srar_year", "srar_month")
            .values_list("srar_month", "srar_year")
        )

        push_ok, push_message = self._push_pending_srar(request, pending)
        # ...and then pull, every time, not only when there was nothing to push. Returns
        # entered in CMMS while the ship was off the link are exactly what an operator
        # expects a sync to bring back, and gating the pull on "nothing local is pending"
        # meant a ship with any backlog of its own never saw them.
        #
        # After the push, never before: pushing mints CMMS's identity onto each local
        # return, so the pull then matches those rows instead of landing a second copy of
        # the same month beside them.
        pull_ok, pull_message = self._pull_srar(request)

        return self._module_result(
            "srar", push_ok and pull_ok, f"{push_message} {pull_message}".strip()
        )

    def _push_pending_srar(self, request, pending):
        """Send every CO-approved return CMMS has not been given yet. Returns (ok, message)."""
        if not pending:
            return True, "No SRAR return pending push."

        # The push branch is CO-only by design (SRARSyncByMonthYearAPIView enforces it).
        # Sync All is reachable by everyone, so for anyone else this is a boundary rather
        # than a fault -- reported as a skip with the pending count, not as a red module.
        if not rbac.is_co_role(request.user):
            return True, (
                f"SRAR push skipped — only a CO login can push SRAR to CMMS "
                f"({len(pending)} approved return(s) pending)."
            )

        pushed, failures = 0, []
        for month, year in pending:
            try:
                factory = APIRequestFactory()
                sub_request = factory.get(
                    "/api/v1/swmmapi/srar_api/srar_sync_by_month_year/",
                    {"month": str(month), "year": str(year), "mode": "push"},
                )
                if request.user and request.user.is_authenticated:
                    force_authenticate(sub_request, user=request.user)
                response = SRARSyncByMonthYearAPIView.as_view()(sub_request)
                if hasattr(response, "render"):
                    response.render()
                body = getattr(response, "data", {}) or {}
                if body.get("status", response.status_code < 400):
                    pushed += 1
                else:
                    failures.append(
                        f"{month}/{year}: {body.get('message', response.status_code)}"
                    )
            except Exception as exc:
                logger.exception("Sync-all: SRAR push failed for %s/%s", month, year)
                failures.append(f"{month}/{year}: {exc}")

        if failures:
            return False, (
                f"Pushed {pushed} of {len(pending)} SRAR return(s). "
                f"Failed: {'; '.join(failures)}"
            )
        return True, f"Pushed {pushed} SRAR return(s) to CMMS."

    def _pull_srar(self, request):
        """Bring CMMS's SRAR returns down. Returns (ok, message).

        Driven through SRARPullFromCMMSAPIView's own generator rather than through
        SRARSyncByMonthYearAPIView: that view auto-picks a direction from cmms_sync_status,
        and asking it to pull is how this used to end up pushing nothing and pulling over
        the ship's own data. Here the direction is not in question -- the push above has
        already run.

        `last_successful_run` supplies the "since when" the message reports, so an operator
        can see the pull covered the period they were off the link rather than having to
        take "synced" on trust. It only has an answer because the run is recorded below:
        only the SRAR *push* was ledgered before this, so "when did SRAR last come down?"
        had nothing to read.
        """
        # Read before the new run row is opened, or it would find the one it is about to
        # write and report "previous pull: just now".
        since = last_successful_run("srar", direction="pull")
        created = updated = 0
        failure = None
        try:
            with sync_run("pull", "srar") as run:
                # Counted from the pull's own per-table lines rather than by re-deriving
                # totals here, so the number reported is the number the pull actually wrote.
                for line in SRARPullFromCMMSAPIView()._stream_pull(request):
                    for part in line.splitlines():
                        text = part.strip()
                        if ("[FATAL]" in text or "[ERROR]" in text) and failure is None:
                            failure = text
                        inserted = _SRAR_PULL_INSERTED.search(text)
                        if inserted:
                            created += int(inserted.group(1))
                        changed = _SRAR_PULL_UPDATED.search(text)
                        if changed:
                            updated += int(changed.group(1))
                run.record(created=created, updated=updated)
                if failure:
                    run.mark_failed(failure)
        except Exception as exc:
            logger.exception("Sync-all: SRAR pull failed")
            return False, f"SRAR pull failed: {exc}"

        if failure:
            return False, failure

        since_text = (
            f"since the last successful pull on {since.started_at:%d %b %Y %H:%M}"
            if since
            else "(first pull on this database)"
        )
        return True, (
            f"Pulled SRAR from CMMS {since_text} — "
            f"{created} new record(s), {updated} updated."
        )


class InitiateDartSyncAPIView(APIView):
    def post(self, request, pk):
        if pk == 0:
            initiate_darts = InitiateDart.objects.select_related(
                "equipment_ship", "equipment_ems"
            ).all()
        else:
            initiate_darts = InitiateDart.objects.select_related(
                "equipment_ship", "equipment_ems"
            ).filter(id=pk)

        initiate_dart_json = []

        for dart in initiate_darts:
            _dart_department = resolve_cmms_department_for_dart(dart)
            dart_json = {
                "id": dart.id,
                # Equipment details
                "t_ship_details": (
                    str(dart.equipment_ship.t_equipment_ship_detail)
                    if dart.equipment_ship
                    else 0
                ),
                "m_equipment": (
                    str(dart.equipment_ship.equipment.universal_id_m_equipment)
                    if dart.equipment_ship
                    else None
                ),
                "equipment_code": (
                    str(dart.equipment_ship.equipment.equipment_code)
                    if dart.equipment_ship
                    else None
                ),
                # Dart details
                "dart_number": dart.dart_number,
                "dart_date": (dart.dart_date.isoformat() if dart.dart_date else None),
                "rectified_date": (
                    dart.rectification_date.isoformat()
                    if dart.rectification_date
                    else None
                ),
                "ops_status": dart.ops_status,
                "Universal_ID_Ch_Master_Symptoms": (
                    dart.symptom_code.universal_id_ch_master_symptoms
                    if dart.symptom_code
                    else None
                ),
                "Universal_ID_M_Severity": (
                    dart.severity_code.universal_id_m_severity
                    if dart.severity_code
                    else None
                ),
                "Universal_ID_Ch_Master_Ship_Remarks_By": (
                    dart.remark_code.universal_id_ch_master_ship_remarks_by
                    if dart.remark_code
                    else None
                ),
                "Universal_ID_M_RequiredAssistance": (
                    dart.require_assistance_for_code.universal_id_m_required_assistance
                    if dart.require_assistance_for_code
                    else None
                ),
                "symptom_code": (
                    dart.symptom_code.symptom_code if dart.symptom_code else None
                ),
                "serverity_code": (
                    dart.severity_code.severity_code if dart.severity_code else None
                ),
                "serverity_id": (
                    dart.severity_code.severity_id if dart.severity_code else None
                ),
                "remark_code": (
                    dart.remark_code.universal_id_ch_master_ship_remarks_by
                    if dart.remark_code
                    else None
                ),
                "trial_required": dart.trial_required,
                # Defect info
                "defective_component": dart.defective_component,
                "defective_discriptions": dart.defective_discriptions,
                # Department info — resolved against CMMS's own M_Department, the same way
                # the streaming push does. `int(dep_code)` here used to raise on every
                # locally seeded department (dep_code is "ADMIN"/"OPS", not a number) and
                # take the whole sync down with it, and the local `code` overflowed
                # T_Dart.Department (varchar(2)) even when it didn't.
                "department_DepartmentID": _dart_department[1],
                "department_Department": _dart_department[0],
                "department_ExDept": (_dart_department[0] or "")[:1] or None,
                "department_ExDeptID": _dart_department[1],
                "Universal_ID_M_Department": _dart_department[2],
                # Status
                "is_closed": dart.is_closed,
                "sapres_required": dart.sapres_required,
                "is_ra_initiate": dart.is_ra_initiate,
                # File
                "photograph": (dart.photograph.url if dart.photograph else None),
                # Date
                "created_date": (
                    dart.created_date.isoformat() if dart.created_date else None
                ),
                "Is_Operational": (
                    1 if dart.maintenance_period == "OPERATIONAL" else 0
                ),
                "Universal_ID_T_RefComp": (
                    dart.refit_maintenance_period_f_key.Universal_ID_M_Refit
                    if dart.refit_maintenance_period_f_key
                    else None
                ),
                "Universal_ID_M_OSTList": (
                    dart.universal_id_trial_required if dart.trial_required else None
                ),
                "is_guarantee_defect": dart.is_guarantee_defect,
                "guarantee_cause": dart.guarantee_cause,
                "guarantee_op_availability": (dart.guarantee_op_availability),
                "guarantee_hot_work": dart.guarantee_hot_work,
                "guarantee_repairs": dart.guarantee_repairs,
                "guarantee_completion_date": (
                    dart.guarantee_completion_date.isoformat()
                    if dart.guarantee_completion_date
                    else None
                ),
                "guarantee_repair_date": (
                    dart.guarantee_repair_date.isoformat()
                    if dart.guarantee_repair_date
                    else None
                ),
                "guarantee_place": dart.guarantee_place,
                "universal_id_t_dart": dart.universal_id_t_dart,
            }

            initiate_dart_json.append(dart_json)

        # ---------------- FINAL PAYLOAD ----------------
        payload = {"initiate_darts": initiate_dart_json}

        json_data = json.dumps(
            payload, indent=4, ensure_ascii=False, cls=DjangoJSONEncoder
        )

        # Save JSON
        with open("initiate_dart_payload.json", "w", encoding="utf-8") as f:
            f.write(json_data)

        api_url = f"{API_URL}/api/dart/dart_initiate/"

        try:
            response = requests.post(
                api_url,
                data=json.dumps(payload, cls=DjangoJSONEncoder),
                headers={"Content-Type": "application/json"},
                timeout=8000,
                verify=False,
            )

            error_data = response.json()

            if error_data["status"] == False:
                return Response(
                    {
                        "status": False,
                        "message": error_data["message"],
                        "response": error_data,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            else:
                return Response(
                    {
                        "status": True,
                        "message": "Data was successfully sent to CMMS",
                        "response": error_data,
                    },
                    status=status.HTTP_200_OK,
                )

        except Exception as e:
            return Response(
                {"status": False, "message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class CompleteDartSyncAPIView(APIView):
    def post(self, request, pk):
        """
        Sync completion data of a DART to CMMS
        """

        completions = CompleteDefectDart.objects.select_related("dart_details").all()

        if not completions.exists():
            return Response(
                {"status": False, "error": "No completion data found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        complete_darts = []

        for comp in completions:
            complete_darts.append(
                {
                    "initiate_dart_id": comp.dart_details.id,
                    "rectified_date": (
                        comp.rectified_date.isoformat() if comp.rectified_date else None
                    ),
                    "DiagnosticCode": (
                        comp.diagnostic_code.DiagnosticCode
                        if comp.diagnostic_code
                        else None
                    ),
                    "DiagnosticID": (
                        comp.diagnostic_code.DiagnosticId
                        if comp.diagnostic_code
                        else None
                    ),
                    "Universal_ID_M_Diagnostic": (
                        comp.diagnostic_code.Universal_ID_M_Diagnostic
                        if comp.diagnostic_code
                        else None
                    ),
                    "days_delay": comp.days_delay,
                    "rectification_details": "",
                    "spares_delay": comp.spares_delay,
                    "RepairCode": (
                        comp.repair_code.RepairCode if comp.repair_code else None
                    ),
                    "RepairID": (
                        comp.repair_code.RepairID if comp.repair_code else None
                    ),
                    "Universal_ID_M_Repair": (
                        comp.repair_code.Universal_ID_M_Repair
                        if comp.repair_code
                        else None
                    ),
                    "AgencyID": (
                        comp.repair_agency_code.RepairAgencyID
                        if comp.repair_agency_code
                        else None
                    ),
                    "AgencyCode": (
                        comp.repair_agency_code.RepairAgencyCode
                        if comp.repair_agency_code
                        else None
                    ),
                    "Universal_ID_M_RepairAgency": (
                        comp.repair_agency_code.Universal_ID_M_RepairAgency
                        if comp.repair_agency_code
                        else None
                    ),
                    "DelayID": (comp.delay_code.DelayID if comp.delay_code else None),
                    "DelayCode": (
                        comp.delay_code.DelayCode if comp.delay_code else None
                    ),
                    "Universal_ID_M_Delay": (
                        comp.delay_code.Universal_ID_M_Delay
                        if comp.delay_code
                        else None
                    ),
                    "Is_Auto_Generated_Dart": getattr(
                        comp, "is_auto_generated_dart", False
                    ),
                }
            )

        payload = {"complete_darts": complete_darts}

        api_url = f"{API_URL}/api/dart/complete/"

        try:
            response = requests.post(
                api_url,
                data=json.dumps(payload, cls=DjangoJSONEncoder),
                headers={"Content-Type": "application/json"},
                timeout=8000,
            )

            response_data = response.json()

            if response_data.get("status") == False:
                return Response(
                    {
                        "status": False,
                        "message": response_data.get("message", "Something went wrong"),
                        "response": response_data,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            return Response(
                {
                    "status": True,
                    "message": "Data was successfully sent to CMMS",
                    "response": response_data,
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response(
                {"status": False, "message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class CMMSClosedDartPushAPI(APIView):
    """Push DART closures ticked on the History grid up to CMMS.

    The DART row itself already exists in CMMS (put there by the initiate push); closing it
    is an UPDATE that stamps RectifiedDate, the diagnostic/repair/agency/delay codes,
    IsClosed=1 and Active. CompleteDARTUpdateAPI owns that SQL, so this view resolves the
    selection, shapes the payload and calls it in-process.

    Unlike CompleteDartSyncAPIView, which posts to itself over HTTP with `requests` and
    pushes every completion that exists, this pushes only what was selected and only what
    has not gone up yet.
    """

    _BATCH_SIZE = 50

    def get(self, request):
        return self.post(request)

    def _requested_ids(self, request):
        raw = request.data.get("ids") if isinstance(request.data, dict) else None
        if raw is None:
            raw = request.GET.get("ids", "")
            raw = raw.split(",") if raw else []
        return [value for value in (to_int(item) for item in raw) if value is not None]

    def _completion_queryset(self, request, ids):
        """Completions for the selected DARTs that CMMS has not been told about yet.

        `ids` are InitiateDart ids — that is what the History grid rows carry — so the
        lookup goes through dart_details.
        """
        queryset = CompleteDefectDart.objects.select_related(
            "dart_details",
            "diagnostic_code",
            "repair_code",
            "delay_code",
            "repair_agency_code",
        ).filter(dart_details_id__in=ids)

        if request.GET.get("all") not in ("1", "true", "True"):
            queryset = queryset.filter(cmms_sync_status=False)

        return queryset.order_by("id")

    def _completion_payload(self, comp):
        """Shape one completion the way CompleteDARTUpdateAPI expects.

        Mirrors CompleteDartSyncAPIView's payload, plus the DART's real universal id so a
        CMMS-origin DART updates its own row instead of a non-existent SWMM-<id> one.
        """
        dart = comp.dart_details
        diagnostic = comp.diagnostic_code
        repair = comp.repair_code
        agency = comp.repair_agency_code
        delay = comp.delay_code

        return {
            "initiate_dart_id": dart.id,
            "universal_id_t_dart": dart.universal_id_t_dart,
            "rectified_date": (
                comp.rectified_date.isoformat() if comp.rectified_date else None
            ),
            "DiagnosticCode": getattr(diagnostic, "DiagnosticCode", None),
            "DiagnosticID": getattr(diagnostic, "DiagnosticId", None),
            "Universal_ID_M_Diagnostic": getattr(
                diagnostic, "Universal_ID_M_Diagnostic", None
            ),
            "RepairCode": getattr(repair, "RepairCode", None),
            "RepairID": getattr(repair, "RepairID", None),
            "Universal_ID_M_Repair": getattr(repair, "Universal_ID_M_Repair", None),
            "AgencyID": getattr(agency, "RepairAgencyID", None),
            "AgencyCode": getattr(agency, "RepairAgencyCode", None),
            "Universal_ID_M_RepairAgency": getattr(
                agency, "Universal_ID_M_RepairAgency", None
            ),
            "DelayID": getattr(delay, "DelayID", None),
            "DelayCode": getattr(delay, "DelayCode", None),
            "Universal_ID_M_Delay": getattr(delay, "Universal_ID_M_Delay", None),
            "days_delay": comp.days_delay,
            "spares_delay": comp.spares_delay,
            "rectification_details": comp.other_reasons or "",
            "Is_Auto_Generated_Dart": getattr(comp, "is_auto_generated_dart", False),
        }

    def post(self, request):
        ids = self._requested_ids(request)

        if not ids:
            return Response(
                {
                    "status": False,
                    "message": "Select at least one closed DART to sync.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        completions = list(self._completion_queryset(request, ids))

        # Selected DARTs with no closure recorded locally can't be closed in CMMS.
        with_completion = {comp.dart_details_id for comp in completions}
        already_synced = CompleteDefectDart.objects.filter(
            dart_details_id__in=ids, cmms_sync_status=True
        ).count()
        not_closed = len(set(ids) - with_completion) - already_synced

        if not completions:
            return Response(
                {
                    "status": True,
                    "message": (
                        "Nothing to sync — the selected DARTs are either already synced "
                        "or have no closure recorded yet."
                    ),
                    "selected": len(ids),
                    "pushed": 0,
                    "failed": 0,
                    "already_synced": already_synced,
                    "not_closed": max(not_closed, 0),
                },
                status=status.HTTP_200_OK,
            )

        factory = APIRequestFactory()
        update_view = CompleteDARTUpdateAPI.as_view()

        pushed = failed = 0
        errors = []

        for offset in range(0, len(completions), self._BATCH_SIZE):
            batch = completions[offset : offset + self._BATCH_SIZE]
            payload = {
                "complete_darts": [self._completion_payload(comp) for comp in batch]
            }
            update_request = factory.post("/api/dart/complete/", payload, format="json")
            if request.user and request.user.is_authenticated:
                force_authenticate(update_request, user=request.user)

            try:
                response = update_view(update_request)
                if hasattr(response, "render"):
                    response.render()
                body = response.data if hasattr(response, "data") else {}
                ok = response.status_code < 400 and body.get("status", False)
            except Exception as exc:
                logger.exception("DART closure push batch failed")
                ok = False
                body = {"error": str(exc)}

            if ok:
                # CompleteDARTUpdateAPI reports success as long as no exception was
                # raised, even for a universal_id CMMS's WHERE clause matched zero rows
                # on — only updated_ids reflects what actually changed in CMMS. Marking
                # the whole batch synced off `ok` alone would flag closures as delivered
                # that CMMS never received.
                updated_uids = set(body.get("updated_ids") or [])
                matched, unmatched = [], []
                for comp in batch:
                    uid = comp.dart_details.universal_id_t_dart or (
                        f"SWMM-{comp.dart_details_id}"
                    )
                    (matched if uid in updated_uids else unmatched).append(comp)

                if matched:
                    CompleteDefectDart.objects.filter(
                        id__in=[comp.id for comp in matched]
                    ).update(cmms_sync_status=True, cmms_sync_date=timezone.localdate())
                pushed += len(matched)
                if unmatched:
                    failed += len(unmatched)
                    errors.extend(
                        {
                            "dart_number": comp.dart_no,
                            "error": (
                                "CMMS has no matching DART to close — the raise push "
                                "may not have reached CMMS yet."
                            ),
                        }
                        for comp in unmatched
                    )
            else:
                failed += len(batch)
                reason = body.get("error") or body.get("message") or "unknown error"
                errors.extend(
                    {"dart_number": comp.dart_no, "error": reason} for comp in batch
                )

        return Response(
            {
                "status": failed == 0,
                "message": (
                    f"Closed {pushed} DART(s) in CMMS."
                    if failed == 0
                    else f"Closed {pushed}, failed {failed}."
                ),
                "selected": len(ids),
                "pushed": pushed,
                "failed": failed,
                "already_synced": already_synced,
                "not_closed": max(not_closed, 0),
                "errors": errors,
            },
            status=status.HTTP_200_OK,
        )


class FussDataSaveAPI(APIView):
    def post(self, request):
        conn = None
        cursor = None

        try:
            data = request.data
            fuss_records = data.get("fuss_records", [])

            conn = get_mssql_connection()
            cursor = conn.cursor()

            # ---------------- CHECK QUERY ----------------
            check_query = """
                SELECT 1
                FROM T_Fuss
                WHERE Universal_ID_T_Fuss = ?
            """

            # ---------------- UPDATE QUERY ----------------
            update_query = """
                UPDATE T_Fuss
                SET
                    DepartmentID = ?,
                    FussDate = ?,
                    FrequencyID = ?,
                    LastUndertaken = ?,
                    DueDate = ?,

                    DefermentID = ?,
                    DefermentCode = ?,
                    ReasonID = ?,
                    ReasonCode = ?,

                    LastSMP = ?,
                    SMPDuration = ?,
                    LastAMP = ?,
                    AMPDuration = ?,
                    AMPSMPReqWef = ?,
                    SMPAMPDuration = ?,

                    InabilityID = ?,
                    InabilityCode = ?,
                    Remarks = ?,

                    CancelDate = ?,
                    CancelRemarks = ?,
                    CancelReference = ?,

                    Active = ?,

                    Universal_ID_M_Ship = ?,
                    Universal_ID_M_Department = ?,
                    Universal_ID_T_EquipmentShipDetail = ?,
                    Universal_ID_M_Frequency = ?,

                    SrNo = ?,
                    ShipSrNo = ?,
                    RoutineID = ?,
                    RoutineDescription = ?,
                    IsNoRoutineUndertaken = ?,
                    EquipmentShipID = ?,
                    EquipmentID = ?,
                    SchedFrequency = ?,
                    SchedAmendmentNo = ?,
                    SchedNo = ?,
                    ScheduleDate = ?,
                    ActualFussCancelDate = ?,
                    ActualFussCreationDate = ?,
                    DemandDetails = ?,

                    Universal_ID_T_MaintopDetail = ?,
                    Universal_ID_M_Equipment = ?,
                    Universal_ID_M_Deferment = ?,
                    Universal_ID_M_Reason = ?,
                    Universal_ID_M_Inability = ?,
                    Universal_ID_T_Dart = ?,
                    Universal_ID_M_Establishment = ?

                WHERE Universal_ID_T_Fuss = ?
            """

            # ---------------- INSERT QUERY ----------------
            insert_query = """
                INSERT INTO T_Fuss
                (
                    DepartmentID,
                    FussDate,
                    FrequencyID,
                    LastUndertaken,
                    DueDate,

                    DefermentID,
                    DefermentCode,
                    ReasonID,
                    ReasonCode,

                    LastSMP,
                    SMPDuration,
                    LastAMP,
                    AMPDuration,
                    AMPSMPReqWef,
                    SMPAMPDuration,

                    InabilityID,
                    InabilityCode,
                    Remarks,

                    CancelDate,
                    CancelRemarks,
                    CancelReference,

                    Active,

                    Universal_ID_M_Ship,
                    Universal_ID_M_Department,
                    Universal_ID_T_EquipmentShipDetail,
                    Universal_ID_M_Frequency,

                    SrNo,
                    ShipSrNo,
                    RoutineID,
                    RoutineDescription,
                    IsNoRoutineUndertaken,
                    EquipmentShipID,
                    EquipmentID,
                    SchedFrequency,
                    SchedAmendmentNo,
                    SchedNo,
                    ScheduleDate,
                    ActualFussCancelDate,
                    ActualFussCreationDate,
                    DemandDetails,

                    Universal_ID_T_MaintopDetail,
                    Universal_ID_M_Equipment,
                    Universal_ID_M_Deferment,
                    Universal_ID_M_Reason,
                    Universal_ID_M_Inability,
                    Universal_ID_T_Dart,
                    Universal_ID_M_Establishment,
                    Universal_ID_T_Fuss
                )
                VALUES
                (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
            """

            inserted_ids = []

            for fuss in fuss_records:
                fuss_id = fuss.get("Universal_ID_T_Fuss")

                # ---------------- CHECK RECORD ----------------
                cursor.execute(check_query, (fuss_id,))

                exists = cursor.fetchone()

                # ---------------- VALUES ----------------
                values = (
                    fuss.get("DepartmentID"),
                    fuss.get("FussDate"),
                    fuss.get("FrequencyID"),
                    fuss.get("LastUndertaken"),
                    fuss.get("DueDate"),
                    fuss.get("DefermentID"),
                    fuss.get("DefermentCode"),
                    fuss.get("ReasonID"),
                    fuss.get("ReasonCode"),
                    fuss.get("LastSMP"),
                    fuss.get("SMPDuration"),
                    fuss.get("LastAMP"),
                    fuss.get("AMPDuration"),
                    fuss.get("AMPSMPReqWef"),
                    fuss.get("SMPAMPDuration"),
                    fuss.get("InabilityID"),
                    fuss.get("InabilityCode"),
                    fuss.get("Remarks"),
                    fuss.get("CancelDate"),
                    fuss.get("CancelRemarks"),
                    fuss.get("CancelReference"),
                    1,
                    fuss.get("Universal_ID_M_Ship"),
                    fuss.get("Universal_ID_T_MaintopDetail"),
                    fuss.get("Universal_ID_M_Equipment"),
                    fuss.get("Universal_ID_M_Department"),
                    fuss.get("Universal_ID_T_EquipmentShipDetail"),
                    fuss.get("Universal_ID_M_Frequency"),
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    fuss.get("Universal_ID_M_Deferment"),
                    fuss.get("Universal_ID_M_Reason"),
                    fuss.get("Universal_ID_M_Inability"),
                    fuss.get("Universal_ID_T_Dart"),
                    fuss.get("Universal_ID_M_Establishment"),
                )

                # ---------------- UPDATE ----------------
                if exists:
                    cursor.execute(update_query, values + (fuss_id,))

                # ---------------- INSERT ----------------
                else:
                    cursor.execute(insert_query, values + (fuss_id,))

                    inserted_ids.append(fuss_id)

            # ---------------- COMMIT ----------------
            conn.commit()

            return Response(
                {
                    "status": True,
                    "message": "FUSS records synced successfully",
                    "inserted_count": len(inserted_ids),
                    "data": inserted_ids,
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception as e:
            if conn:
                conn.rollback()

            logger.exception("FUSS bulk insert failed")

            return Response(
                {
                    "status": False,
                    "message": "Failed to save FUSS data",
                    "error": str(e),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        finally:
            if cursor:
                cursor.close()

            if conn:
                conn.close()


@extend_schema(
    tags=["EMS"],
    summary="Sync Raised FUSS Routines with CMMS",
    description="Serializes local FussRaiseDetails and syncs them to CMMS MSSQL T_Fuss table.",
    responses={200: OpenApiTypes.OBJECT},
)
class InitiateFussSyncAPIView(APIView):
    """
    Sync Raised FUSS Routines with CMMS.
    POST: Serializes local FussRaiseDetails and saves to CMMS MSSQL T_Fuss table.
    """

    @ledgered(
        "push",
        "fuss",
        # This view swallows its own exceptions and answers with {"status": "error"}, so
        # the ledger reads the Response rather than relying on one being raised.
        adapter=lambda response: {
            "fetched": (getattr(response, "data", None) or {}).get("synced_count", 0),
            "created": (getattr(response, "data", None) or {}).get("inserted_count", 0),
            "updated": (getattr(response, "data", None) or {}).get("updated_count", 0),
        },
    )
    def post(self, request=None, pk=None):
        fuss_qs = FussRaiseDetails.objects.select_related(
            "routine_description_id",
            "routine_description_id__routine_name",
            "routine_description_id__equipment_name",
            "routine_description_id__maintop_detail",
            "routine_description_id__add_routine_details",
            "department_f_key",
            "recomm_deferment",
            "reason",
            "inability",
            "establishment_f_key",
        ).all()

        if pk and int(pk) > 0:
            fuss_qs = fuss_qs.filter(id=pk)

        fuss_json = []
        ship_obj = get_this_ship()

        for fuss in fuss_qs:
            fuss_id = (
                getattr(fuss, "universal_id_t_fuss", None) or f"SWMM-FUSS-{fuss.id}"
            )

            # Safely resolve department
            dept_obj = fuss.department_f_key
            if not dept_obj and fuss.routine_description_id:
                dept_obj = getattr(
                    fuss.routine_description_id, "department_f_key", None
                )
            if not dept_obj and fuss.department:
                from master.models import Department

                dept_obj = Department.objects.filter(
                    name__iexact=fuss.department
                ).first()

            dept_uid = None
            dept_code = fuss.department
            if dept_obj:
                dept_uid = getattr(dept_obj, "universal_id_m_department", None) or str(
                    dept_obj.id
                )
                dept_code = (
                    getattr(dept_obj, "code", None)
                    or getattr(dept_obj, "name", None)
                    or fuss.department
                )

            # Safely resolve equipment & sfd_equipment & frequency
            eq_universal_id = None
            eq_ship_detail_uid = None
            eq_code = None
            routine_desc_text = None
            routine_no = None
            maintop_no = fuss.maintop_no
            freq_text = fuss.frequency
            freq_universal_id = None
            freq_id = None

            try:
                if fuss.routine_description_id:
                    rd = fuss.routine_description_id
                    routine_desc_text = rd.routine_description
                    routine_no = rd.routine_no
                    if not maintop_no:
                        maintop_no = rd.maintop_no

                    if hasattr(rd, "equipment_name") and rd.equipment_name:
                        eq_name_obj = rd.equipment_name
                        eq_code = getattr(eq_name_obj, "equipment_code", None)
                        sfd_eq = getattr(eq_name_obj, "sfd_equipment", None)
                        if sfd_eq:
                            eq_ship_detail_uid = getattr(
                                sfd_eq,
                                "universal_id_t_equipment_ship_detail",
                                getattr(
                                    sfd_eq,
                                    "universal_id_t_equipmentshipdetail",
                                    None,
                                ),
                            )
                            if getattr(sfd_eq, "equipment", None):
                                eq_universal_id = getattr(
                                    sfd_eq.equipment, "universal_id_m_equipment", None
                                )
                                if not eq_code:
                                    eq_code = getattr(
                                        sfd_eq.equipment, "equipment_code", None
                                    )

                    if hasattr(rd, "maintop_detail") and rd.maintop_detail:
                        md = rd.maintop_detail
                        freq_f_key = getattr(md, "frequency_f_key", None)
                        if freq_f_key:
                            freq_universal_id = getattr(
                                freq_f_key, "universal_id_m_frequency", None
                            )
                            freq_id = getattr(
                                freq_f_key,
                                "frequency_id",
                                getattr(freq_f_key, "id", None),
                            )

                    if rd.add_routine_details:
                        ard = rd.add_routine_details
                        if not freq_text:
                            freq_text = ard.frequency
                        if not eq_code and getattr(ard, "equipment_code", None):
                            eq_code = ard.equipment_code
            except Exception:
                pass

            if not freq_id and freq_universal_id:
                try:
                    from master.models import Frequency

                    freq_obj = Frequency.objects.filter(
                        universal_id_m_frequency=str(freq_universal_id)
                    ).first()
                    if not freq_obj and str(freq_universal_id).isdigit():
                        freq_obj = Frequency.objects.filter(
                            id=int(freq_universal_id)
                        ).first()
                    if freq_obj:
                        freq_id = getattr(
                            freq_obj, "frequency_id", getattr(freq_obj, "id", None)
                        )
                    elif str(freq_universal_id).isdigit():
                        freq_id = int(freq_universal_id)
                except Exception:
                    pass

            if freq_text and (not freq_universal_id or not freq_id):
                try:
                    from master.models import Frequency

                    freq_obj = Frequency.objects.filter(
                        frequency__iexact=freq_text
                    ).first()
                    if not freq_obj:
                        freq_obj = Frequency.objects.filter(
                            description__iexact=freq_text
                        ).first()
                    if freq_obj:
                        if not freq_universal_id:
                            freq_universal_id = getattr(
                                freq_obj, "universal_id_m_frequency", None
                            )
                        if not freq_id:
                            freq_id = getattr(
                                freq_obj, "frequency_id", getattr(freq_obj, "id", None)
                            )
                except Exception:
                    pass

            if not freq_id and freq_universal_id and str(freq_universal_id).isdigit():
                freq_id = int(freq_universal_id)

            if not eq_code and fuss.equipment:
                try:
                    from master.models import EquipmentName

                    eq_obj = EquipmentName.objects.filter(
                        equipment_name__iexact=fuss.equipment
                    ).first()
                    if eq_obj:
                        eq_code = getattr(eq_obj, "equipment_code", None)
                        if not eq_code and getattr(eq_obj, "sfd_equipment", None):
                            sfd_eq = eq_obj.sfd_equipment
                            if getattr(sfd_eq, "equipment", None):
                                eq_code = getattr(
                                    sfd_eq.equipment, "equipment_code", None
                                )
                except Exception:
                    pass

            if not eq_code:
                eq_code = fuss.equipment

            # Safely resolve maintop detail universal ID
            maintop_detail_uid = None
            try:
                if (
                    fuss.routine_description_id
                    and hasattr(fuss.routine_description_id, "maintop_detail")
                    and fuss.routine_description_id.maintop_detail
                ):
                    maintop_detail_uid = fuss.routine_description_id.maintop_detail.universal_id_t_maintopdetail
            except Exception:
                maintop_detail_uid = None

            fuss_json.append(
                {
                    "local_id": fuss.id,
                    "Universal_ID_T_Fuss": fuss_id,
                    "Universal_ID_M_Ship": (
                        ship_obj.universal_id_m_ship if ship_obj else None
                    ),
                    "ShipID": ship_obj.universal_id_m_ship if ship_obj else None,
                    "ShipSrNo": getattr(ship_obj, "sr_no", None) if ship_obj else None,
                    "Universal_ID_M_Department": dept_uid,
                    "DepartmentID": dept_uid,
                    "Department": dept_code,
                    "Universal_ID_T_MaintopDetail": maintop_detail_uid,
                    "Universal_ID_M_Equipment": eq_universal_id,
                    "EquipmentID": eq_universal_id,
                    "Universal_ID_T_EquipmentShipDetail": eq_ship_detail_uid,
                    "EquipmentShipID": eq_ship_detail_uid,
                    "Universal_ID_M_Frequency": freq_universal_id,
                    "FrequencyID": freq_id,
                    "Universal_ID_M_Deferment": (
                        fuss.recomm_deferment.universal_id_m_deferment
                        if fuss.recomm_deferment
                        and hasattr(fuss.recomm_deferment, "universal_id_m_deferment")
                        else getattr(
                            fuss.recomm_deferment, "Universal_ID_M_Deferment", None
                        )
                    ),
                    "DefermentID": (
                        fuss.recomm_deferment.deferment_id
                        if fuss.recomm_deferment
                        and hasattr(fuss.recomm_deferment, "deferment_id")
                        else getattr(fuss.recomm_deferment, "DefermentID", None)
                    ),
                    "DefermentCode": (
                        fuss.recomm_deferment.deferment_code
                        if fuss.recomm_deferment
                        and hasattr(fuss.recomm_deferment, "deferment_code")
                        else getattr(fuss.recomm_deferment, "DefermentCode", None)
                    ),
                    "Universal_ID_M_Reason": (
                        fuss.reason.universal_id_m_reason
                        if fuss.reason and hasattr(fuss.reason, "universal_id_m_reason")
                        else getattr(fuss.reason, "Universal_ID_M_Reason", None)
                    ),
                    "ReasonCode": (
                        fuss.reason.reason_code
                        if fuss.reason and hasattr(fuss.reason, "reason_code")
                        else getattr(fuss.reason, "ReasonCode", None)
                    ),
                    "ReasonID": (
                        fuss.reason.reason_id
                        if fuss.reason and hasattr(fuss.reason, "reason_id")
                        else getattr(fuss.reason, "ReasonID", None)
                    ),
                    "Universal_ID_M_Inability": (
                        fuss.inability.universal_id_m_inability
                        if fuss.inability
                        and hasattr(fuss.inability, "universal_id_m_inability")
                        else getattr(fuss.inability, "Universal_ID_M_Inability", None)
                    ),
                    "InabilityID": (
                        fuss.inability.inability_id
                        if fuss.inability and hasattr(fuss.inability, "inability_id")
                        else getattr(fuss.inability, "InabilityID", None)
                    ),
                    "InabilityCode": (
                        fuss.inability.inability_code
                        if fuss.inability and hasattr(fuss.inability, "inability_code")
                        else getattr(fuss.inability, "InabilityCode", None)
                    ),
                    "Universal_ID_M_Establishment": (
                        fuss.establishment_f_key.universal_id_m_establishment
                        if fuss.establishment_f_key
                        and hasattr(
                            fuss.establishment_f_key, "universal_id_m_establishment"
                        )
                        else getattr(
                            fuss.establishment_f_key,
                            "Universal_ID_M_Establishment",
                            None,
                        )
                    ),
                    "FussDate": fuss.fuss_date.isoformat() if fuss.fuss_date else None,
                    "LastUndertaken": (
                        fuss.last_undertaken.isoformat()
                        if fuss.last_undertaken
                        else None
                    ),
                    "DueDate": fuss.due_date.isoformat() if fuss.due_date else None,
                    "ScheduleDate": (
                        fuss.schedule_date.isoformat() if fuss.schedule_date else None
                    ),
                    "EquipmentCode": eq_code,
                    "LocationCode": fuss.location_code,
                    "SrNo": fuss.equipment_sr_no or fuss.serial_no,
                    "SchedMaintopNo": maintop_no,
                    "SchedNo": maintop_no,
                    "SchedFrequency": freq_text,
                    "SchedAmendmentNo": fuss.amendment_no,
                    "RoutineDescription": routine_desc_text,
                    "RoutineID": routine_no,
                    "Remarks": fuss.remarks,
                    "DemandDetails": fuss.demand_details,
                    "Active": 1,
                    "IsMailSent": 0,
                    "CreatedBy": getattr(fuss, "created_by_id", None)
                    or getattr(ship_obj, "created_by_external", None),
                    "UpdatedBy": getattr(fuss, "modified_by_id", None)
                    or getattr(ship_obj, "updated_by_external", None),
                    "Universal_ID_A_User_Created_By": getattr(
                        ship_obj, "universal_id_a_user_created_by", None
                    ),
                    "Universal_ID_A_User_Updated_By": getattr(
                        ship_obj, "universal_id_a_user_updated_by", None
                    ),
                    "IsNoRoutineUndertaken": (
                        1 if getattr(fuss, "isclosed_fuss", False) else 0
                    )
                    if hasattr(fuss, "isclosed_fuss") and fuss.isclosed_fuss is not None
                    else None,
                    "CreatedDate": (
                        fuss.created_at.isoformat() if fuss.created_at else None
                    ),
                }
            )

        if not fuss_json:
            return Response(
                {
                    "status": "success",
                    "message": "No FUSS records found to sync.",
                    "synced_count": 0,
                    "data": [],
                },
                status=status.HTTP_200_OK,
            )

        # Directly execute database saving to MSSQL
        conn = None
        cursor = None
        try:
            conn = get_mssql_connection()
            if not conn:
                return Response(
                    {
                        "status": "error",
                        "message": "Failed to connect to CMMS database.",
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            cursor = conn.cursor()

            equipment_ship_ids = cmms_equipment_ship_ids(cursor)

            # Selects CancelDate rather than a literal so the closure write below can reuse
            # whatever CMMS already stamped instead of restamping it on every re-sync. An
            # existing row that was never cancelled still comes back as a (None,) tuple, so
            # presence -- not truthiness of the value -- is what decides insert vs update.
            check_query = (
                "SELECT CancelDate FROM T_Fuss WHERE Universal_ID_T_Fuss = ?"
            )
            update_query = """
                UPDATE T_Fuss
                SET
                    ShipID = ?, ShipSrNo = ?, DepartmentID = ?, Department = ?, SrNo = ?,
                    FussDate = ?, EquipmentShipID = ?, EquipmentID = ?, EquipmentCode = ?, LocationCode = ?,
                    SchedMaintopNo = ?, FrequencyID = ?, SchedFrequency = ?, RoutineID = ?,
                    SchedAmendmentNo = ?, SchedNo = ?, LastUndertaken = ?, DueDate = ?, RoutineDescription = ?,
                    DefermentID = ?, DefermentCode = ?, ReasonID = ?, ReasonCode = ?,
                    LastSMP = ?, SMPDuration = ?, LastAMP = ?, AMPDuration = ?,
                    AMPSMPReqWef = ?, SMPAMPDuration = ?, InabilityID = ?, InabilityCode = ?,
                    Remarks = ?, CancelDate = ?, CancelRemarks = ?, CancelReference = ?,
                    Active = ?, CreatedBy = ?, CreatedDate = ?, UpdatedBy = ?, UpdatedDate = ?,
                    Universal_ID_A_User_Created_By = ?, Universal_ID_A_User_Updated_By = ?,
                    Universal_ID_M_Ship = ?, Universal_ID_M_Department = ?,
                    Universal_ID_T_EquipmentShipDetail = ?, Universal_ID_M_Equipment = ?,
                    Universal_ID_M_Frequency = ?, Universal_ID_T_MaintopDetail = ?,
                    Universal_ID_M_Deferment = ?, Universal_ID_M_Reason = ?,
                    Universal_ID_M_Inability = ?, Universal_ID_T_Dart = ?,
                    Universal_ID_M_Establishment = ?, IsNoRoutineUndertaken = ?,
                    ScheduleDate = ?, DemandDetails = ?, IsSynced = ?
                WHERE Universal_ID_T_Fuss = ?
            """
            insert_query = """
                INSERT INTO T_Fuss
                (
                    ShipID, ShipSrNo, DepartmentID, Department, SrNo,
                    FussDate, EquipmentShipID, EquipmentID, EquipmentCode, LocationCode,
                    SchedMaintopNo, FrequencyID, SchedFrequency, RoutineID,
                    SchedAmendmentNo, SchedNo, LastUndertaken, DueDate, RoutineDescription,
                    DefermentID, DefermentCode, ReasonID, ReasonCode,
                    LastSMP, SMPDuration, LastAMP, AMPDuration,
                    AMPSMPReqWef, SMPAMPDuration, InabilityID, InabilityCode,
                    Remarks, CancelDate, CancelRemarks, CancelReference,
                    Active, CreatedBy, CreatedDate, UpdatedBy, UpdatedDate,
                    Universal_ID_A_User_Created_By, Universal_ID_A_User_Updated_By,
                    Universal_ID_M_Ship, Universal_ID_M_Department,
                    Universal_ID_T_EquipmentShipDetail, Universal_ID_M_Equipment,
                    Universal_ID_M_Frequency, Universal_ID_T_MaintopDetail,
                    Universal_ID_M_Deferment, Universal_ID_M_Reason,
                    Universal_ID_M_Inability, Universal_ID_T_Dart,
                    Universal_ID_M_Establishment, IsNoRoutineUndertaken,
                    ScheduleDate, DemandDetails, IsSynced, Universal_ID_T_Fuss
                )
                VALUES
                (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
            """

            inserted_count = 0
            updated_count = 0

            def _to_sql_val(v, max_len=None):
                if v is None or v == "NA" or v == "":
                    return None
                s = str(v)
                if max_len and len(s) > max_len:
                    return s[:max_len]
                return s

            def _to_sql_dept(v):
                if not v:
                    return "E"
                s = str(v).strip().upper()
                if "ELECT" in s:
                    return "L"
                if "ENG" in s:
                    return "E"
                if "HULL" in s:
                    return "H"
                if "WEAP" in s:
                    return "W"
                if "EXEC" in s or "NBCD" in s:
                    return "X"
                return s[:1]

            def _to_sql_dept_id(dept_uid, dept_code):
                if dept_uid and str(dept_uid).isdigit():
                    return int(dept_uid)
                code = _to_sql_dept(dept_code)
                mapping = {"H": 1, "E": 2, "L": 3, "X": 4, "W": 5}
                return mapping.get(code, 2)

            def _to_sql_int(v):
                if v is None or v == "NA" or v == "":
                    return None
                try:
                    val = int(v)
                    if -2147483648 <= val <= 2147483647:
                        return val
                    return None
                except (ValueError, TypeError):
                    return None

            def _to_sql_decimal(v):
                if v is None or v == "NA" or v == "":
                    return None
                try:
                    return float(v)
                except (ValueError, TypeError):
                    return None

            def _to_sql_datetime(v):
                if not v or v == "NA":
                    return None
                if isinstance(v, str):
                    clean_str = v.replace("T", " ").split("+")[0].split("Z")[0].strip()
                    if len(clean_str) > 19:
                        clean_str = clean_str[:19]
                    return clean_str
                if hasattr(v, "strftime"):
                    return v.strftime("%Y-%m-%d %H:%M:%S")
                return None

            for fuss in fuss_json:
                fuss_id = fuss.get("Universal_ID_T_Fuss")
                cursor.execute(check_query, (fuss_id,))
                existing_row = cursor.fetchone()
                exists = existing_row is not None
                existing_cancel_date = existing_row[0] if existing_row else None

                # CMMS records a FUSS closure in two columns and pull_cmms_fuss reads both:
                # IsNoRoutineUndertaken (set from the payload built above) and CancelDate.
                # Leaving CancelDate null while setting the flag left the two disagreeing on
                # every row this push touched. The date is stamped only on the transition --
                # reusing CMMS's own CancelDate when it already has one keeps a re-push from
                # walking the timestamp forward on every run.
                cancel_date = (
                    (existing_cancel_date or timezone.now())
                    if fuss.get("IsNoRoutineUndertaken")
                    else None
                )

                eq_ship_id = equipment_ship_ids.get(
                    str(fuss.get("Universal_ID_T_EquipmentShipDetail"))
                )

                dept_letter = _to_sql_dept(fuss.get("Department"))
                dept_id_val = _to_sql_dept_id(
                    fuss.get("DepartmentID"), fuss.get("Department")
                )

                values = (
                    _to_sql_int(fuss.get("ShipID")),
                    _to_sql_decimal(fuss.get("ShipSrNo")),
                    dept_id_val,
                    dept_letter,
                    _to_sql_int(fuss.get("SrNo")),
                    _to_sql_datetime(fuss.get("FussDate")),
                    eq_ship_id,
                    _to_sql_int(fuss.get("EquipmentID")),
                    _to_sql_val(fuss.get("EquipmentCode"), 50),
                    _to_sql_decimal(fuss.get("LocationCode")),
                    _to_sql_int(fuss.get("SchedMaintopNo")),
                    _to_sql_int(fuss.get("FrequencyID")),
                    _to_sql_val(fuss.get("SchedFrequency"), 6),
                    _to_sql_int(fuss.get("RoutineID")),
                    _to_sql_int(fuss.get("SchedAmendmentNo")),
                    _to_sql_val(fuss.get("SchedNo"), 8),
                    _to_sql_datetime(fuss.get("LastUndertaken")),
                    _to_sql_datetime(fuss.get("DueDate")),
                    _to_sql_val(fuss.get("RoutineDescription"), 4000),
                    _to_sql_int(fuss.get("DefermentID")),
                    _to_sql_val(fuss.get("DefermentCode"), 50),
                    _to_sql_int(fuss.get("ReasonID")),
                    _to_sql_val(fuss.get("ReasonCode"), 50),
                    _to_sql_datetime(fuss.get("LastSMP")),
                    _to_sql_int(fuss.get("SMPDuration")),
                    _to_sql_datetime(fuss.get("LastAMP")),
                    _to_sql_int(fuss.get("AMPDuration")),
                    _to_sql_datetime(fuss.get("AMPSMPReqWef")),
                    _to_sql_int(fuss.get("SMPAMPDuration")),
                    _to_sql_int(fuss.get("InabilityID")),
                    _to_sql_val(fuss.get("InabilityCode"), 50),
                    _to_sql_val(fuss.get("Remarks"), 4000),
                    _to_sql_datetime(cancel_date),
                    _to_sql_val(fuss.get("CancelRemarks"), 200),
                    _to_sql_val(fuss.get("CancelReference"), 250),
                    _to_sql_int(fuss.get("Active", 1)),
                    _to_sql_int(fuss.get("CreatedBy")),
                    _to_sql_datetime(fuss.get("CreatedDate")),
                    _to_sql_int(fuss.get("UpdatedBy")),
                    _to_sql_datetime(fuss.get("CreatedDate")),
                    _to_sql_val(fuss.get("Universal_ID_A_User_Created_By"), 100),
                    _to_sql_val(fuss.get("Universal_ID_A_User_Updated_By"), 100),
                    _to_sql_val(fuss.get("Universal_ID_M_Ship"), 100),
                    _to_sql_val(fuss.get("Universal_ID_M_Department"), 100),
                    _to_sql_val(fuss.get("Universal_ID_T_EquipmentShipDetail"), 100),
                    _to_sql_val(fuss.get("Universal_ID_M_Equipment"), 100),
                    _to_sql_val(fuss.get("Universal_ID_M_Frequency"), 100),
                    _to_sql_val(fuss.get("Universal_ID_T_MaintopDetail"), 100),
                    _to_sql_val(fuss.get("Universal_ID_M_Deferment"), 100),
                    _to_sql_val(fuss.get("Universal_ID_M_Reason"), 100),
                    _to_sql_val(fuss.get("Universal_ID_M_Inability"), 100),
                    _to_sql_val(fuss.get("Universal_ID_T_Dart"), 300),
                    _to_sql_val(fuss.get("Universal_ID_M_Establishment"), 100),
                    _to_sql_int(fuss.get("IsNoRoutineUndertaken")),
                    _to_sql_datetime(fuss.get("ScheduleDate")),
                    _to_sql_val(fuss.get("DemandDetails"), 500),
                    1,
                )

                if exists:
                    cursor.execute(update_query, values + (fuss_id,))
                    updated_count += 1
                else:
                    cursor.execute(insert_query, values + (fuss_id,))
                    inserted_count += 1

            conn.commit()

            # Mark local records as synced
            synced_local_ids = [
                f.get("local_id") for f in fuss_json if f.get("local_id")
            ]
            if synced_local_ids:
                FussRaiseDetails.objects.filter(id__in=synced_local_ids).update(
                    is_sync=True
                )

            return Response(
                {
                    "status": "success",
                    "message": f"{len(fuss_json)} FUSS record(s) synced to CMMS successfully (Inserted: {inserted_count}, Updated: {updated_count}).",
                    "synced_count": len(fuss_json),
                    "inserted_count": inserted_count,
                    "updated_count": updated_count,
                },
                status=status.HTTP_200_OK,
            )

        except Exception as exc:
            logger.error(f"MSSQL FUSS sync error: {exc}", exc_info=True)
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
            return Response(
                {
                    "status": "error",
                    "message": f"CMMS MSSQL sync failed: {str(exc)}",
                    "error": str(exc),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()


class CompletedRoutineSyncAPIView(APIView):
    def post(self, request, pk=None):
        try:
            completed_routine = CompletedRoutine.objects.select_related(
                "routine",
                "routine__department_f_key",
                "routine__maintop_detail",
                "routine__maintop_detail__frequency_f_key",
            )
            if pk and int(pk) > 0:
                completed_routine = completed_routine.filter(id=pk)

            created_by_uid = cmms_user_uid(request.user)

            all_dart_numbers = set()
            for cr in completed_routine:
                if cr.old_dart_number:
                    all_dart_numbers.add(cr.old_dart_number)
                if cr.new_dart_number:
                    all_dart_numbers.add(cr.new_dart_number)

            routines_by_dart = {}
            if all_dart_numbers:
                routines_by_dart = {
                    r.dart_number: r
                    for r in RoutineDescription.objects.filter(
                        dart_number__in=all_dart_numbers
                    ).select_related(
                        "department_f_key",
                        "maintop_detail",
                        "maintop_detail__frequency_f_key",
                        "equipment_name__sfd_equipment__equipment",
                    )
                }

            jsonpayload = []

            for cr in completed_routine:
                old_routine = (
                    routines_by_dart.get(cr.old_dart_number)
                    if cr.old_dart_number
                    else None
                ) or cr.routine

                if not old_routine:
                    continue

                new_routine = (
                    routines_by_dart.get(cr.new_dart_number)
                    if cr.new_dart_number
                    else None
                ) or old_routine

                # Generate-and-persist so a routine that has never round-tripped
                # through CMMS gets a stable id on this first push instead of a
                # fresh random one every time (which would insert a new CMMS
                # row on every re-sync). Reuse the same value for both sides
                # when old/new resolve to the same underlying row -- otherwise
                # each ensure_* call would mint its own uid for the same row.
                old_dart_uid = ensure_routine_dart_uid(old_routine)
                new_dart_uid = (
                    old_dart_uid
                    if new_routine.id == old_routine.id
                    else ensure_routine_dart_uid(new_routine)
                )

                old_maintop_uid = ensure_maintop_detail_uid(old_routine.maintop_detail)
                if (
                    new_routine.maintop_detail
                    and old_routine.maintop_detail
                    and new_routine.maintop_detail.pk == old_routine.maintop_detail.pk
                ):
                    new_maintop_uid = old_maintop_uid
                else:
                    new_maintop_uid = ensure_maintop_detail_uid(
                        new_routine.maintop_detail
                    )

                old_dart_type, old_dart_section, old_dart_no = get_dart_split(
                    old_routine.dart_number or None
                )

                new_dart_type, new_dart_section, new_dart_no = get_dart_split(
                    new_routine.dart_number or None
                )

                # OLD EQUIPMENT (safe resolution)
                old_eq_code = None
                old_t_equipment_ship_detail = None
                old_eq_name = getattr(old_routine, "equipment_name", None)
                if old_eq_name:
                    sfd_eq = getattr(old_eq_name, "sfd_equipment", None)
                    if sfd_eq:
                        eq_obj = getattr(sfd_eq, "equipment", None)
                        old_eq_code = getattr(
                            eq_obj, "equipment_code", None
                        ) or getattr(old_eq_name, "equipment_code", None)
                        old_t_equipment_ship_detail = (
                            getattr(
                                sfd_eq, "universal_id_t_equipment_ship_detail", None
                            )
                            or getattr(
                                sfd_eq, "universal_id_t_equipmentshipdetail", None
                            )
                            or getattr(sfd_eq, "t_equipment_ship_detail", None)
                        )

                # NEW EQUIPMENT (safe resolution)
                new_eq_code = None
                new_t_equipment_ship_detail = None
                new_eq_name = getattr(new_routine, "equipment_name", None)
                if new_eq_name:
                    sfd_eq = getattr(new_eq_name, "sfd_equipment", None)
                    if sfd_eq:
                        eq_obj = getattr(sfd_eq, "equipment", None)
                        new_eq_code = getattr(
                            eq_obj, "equipment_code", None
                        ) or getattr(new_eq_name, "equipment_code", None)
                        new_t_equipment_ship_detail = (
                            getattr(
                                sfd_eq, "universal_id_t_equipment_ship_detail", None
                            )
                            or getattr(
                                sfd_eq, "universal_id_t_equipmentshipdetail", None
                            )
                            or getattr(sfd_eq, "t_equipment_ship_detail", None)
                        )

                def routine_dart_master_fields(routine):
                    department = getattr(routine, "department_f_key", None)
                    maintop = getattr(routine, "maintop_detail", None)
                    frequency = (
                        getattr(maintop, "frequency_f_key", None) if maintop else None
                    )
                    dept_id = (
                        to_int(
                            getattr(department, "universal_id_m_department", None),
                            default=None,
                        )
                        if department
                        else None
                    )
                    frequency_id = (
                        getattr(frequency, "frequency_id", None)
                        or getattr(maintop, "frequency_id", None)
                        if maintop
                        else None
                    )
                    frequency_name = (
                        getattr(frequency, "frequency", None)
                        or getattr(maintop, "frequency", None)
                        if maintop
                        else None
                    )
                    frequency_uid = (
                        getattr(frequency, "universal_id_m_frequency", None)
                        or getattr(maintop, "universal_id_m_frequency", None)
                        if maintop
                        else None
                    )
                    return {
                        "Dept_ID": dept_id,
                        "Ex_Dept_ID": dept_id,
                        "FrequencyID": frequency_id,
                        "M_frequency": frequency_name,
                        "Universal_ID_M_Frequency": frequency_uid,
                    }

                old_master_fields = routine_dart_master_fields(old_routine)
                new_master_fields = routine_dart_master_fields(new_routine)

                # NOTE: was nested one level inside `if new_eq_name:` above,
                # which silently dropped the whole routine from the CMMS push
                # whenever new_routine had no equipment_name resolved.
                if True:
                    data = {
                        "old_routine": {
                            "routine_id": old_routine.id,
                            "maintop_no": old_routine.maintop_no,
                            "routine_no": old_routine.routine_no,
                            "routine_description": old_routine.routine_description,
                            "dart_number": old_routine.dart_number,
                            "dart_sr_no": old_routine.dart_number
                            or f"{old_dart_section}-{old_dart_no}",
                            "serial_number": old_dart_no,
                            "due_date": (
                                old_routine.due_date.isoformat()
                                if old_routine.due_date
                                else None
                            ),
                            "department_id": (
                                old_routine.department_f_key.id
                                if old_routine.department_f_key
                                else None
                            ),
                            "department_dep_code": old_master_fields["Dept_ID"],
                            "Dept_ID": old_master_fields["Dept_ID"],
                            "Ex_Dept_ID": old_master_fields["Ex_Dept_ID"],
                            "department_code": (
                                old_dart_section
                                or (
                                    old_routine.department_f_key.code[:1]
                                    if old_routine.department_f_key
                                    and old_routine.department_f_key.code
                                    else None
                                )
                            ),
                            "Universal_ID_T_Dart": old_dart_uid,
                            "Universal_ID_T_MaintopDetail": old_maintop_uid,
                            "FrequencyID": old_master_fields["FrequencyID"],
                            "M_frequency": old_master_fields["M_frequency"],
                            "Universal_ID_M_Frequency": old_master_fields[
                                "Universal_ID_M_Frequency"
                            ],
                            "Universal_ID_M_Department": (
                                old_routine.department_f_key.universal_id_m_department
                                if old_routine.department_f_key
                                else None
                            ),
                            "eq_code": old_eq_code,
                            "Universal_ID_T_EquipmentShipDetail": (
                                old_t_equipment_ship_detail
                            ),
                            "is_closed": 1,
                            "date_of_completion": (
                                cr.date_of_completion.isoformat()
                                if cr.date_of_completion
                                else None
                            ),
                            "running_hour": cr.running_hour,
                            "due_running_hour": cr.due_running_hour,
                            "hours": cr.hours,
                            "minutes": cr.minutes,
                            "carried_by": cr.carried_by,
                            "p_no": cr.p_no,
                            "rank": (
                                cr.rank.universal_id_m_ranklist if cr.rank else None
                            ),
                            "other_rank": (cr.other_rank if cr.rank else None),
                            "total_manpower": cr.total_manpower,
                            "repair_remark": cr.repair_remark,
                            "completion_details": cr.completion_details,
                            "trial_team": cr.trial_team,
                            "rec_for_deletion": cr.rec_for_deletion,
                            "created_by_uid": created_by_uid,
                        },
                        "new_routine": {
                            "routine_id": new_routine.id,
                            "maintop_no": new_routine.maintop_no,
                            "routine_no": new_routine.routine_no,
                            "routine_description": new_routine.routine_description,
                            "dart_number": new_routine.dart_number,
                            "dart_sr_no": new_routine.dart_number
                            or f"{new_dart_section}-{new_dart_no}",
                            "serial_number": new_dart_no,
                            "due_date": (
                                new_routine.due_date.isoformat()
                                if new_routine.due_date
                                else None
                            ),
                            "department_id": (
                                new_routine.department_f_key.id
                                if new_routine.department_f_key
                                else None
                            ),
                            "department_dep_code": new_master_fields["Dept_ID"],
                            "Dept_ID": new_master_fields["Dept_ID"],
                            "Ex_Dept_ID": new_master_fields["Ex_Dept_ID"],
                            "department_code": (
                                new_dart_section
                                or (
                                    new_routine.department_f_key.code[:1]
                                    if new_routine.department_f_key
                                    and new_routine.department_f_key.code
                                    else None
                                )
                            ),
                            "Universal_ID_T_Dart": new_dart_uid,
                            "Universal_ID_T_MaintopDetail": new_maintop_uid,
                            "FrequencyID": new_master_fields["FrequencyID"],
                            "M_frequency": new_master_fields["M_frequency"],
                            "Universal_ID_M_Frequency": new_master_fields[
                                "Universal_ID_M_Frequency"
                            ],
                            "Universal_ID_M_Department": (
                                new_routine.department_f_key.universal_id_m_department
                                if new_routine.department_f_key
                                else None
                            ),
                            "eq_code": new_eq_code,
                            "Universal_ID_T_EquipmentShipDetail": (
                                new_t_equipment_ship_detail
                            ),
                            "is_closed": 0,
                            "date_of_completion": None,
                            "running_hour": None,
                            "due_running_hour": None,
                            "hours": None,
                            "minutes": None,
                            "carried_by": None,
                            "p_no": None,
                            "rank": None,
                            "total_manpower": None,
                            "repair_remark": None,
                            "completion_details": None,
                            "trial_team": None,
                            "rec_for_deletion": None,
                            "created_by_uid": created_by_uid,
                        },
                    }

                    jsonpayload.append(data)

            payload = {"routines": jsonpayload}

            # Direct MSSQL sync via RoutineDARTSyncAPI
            sync_view = RoutineDARTSyncAPI()
            dummy_request = type("Request", (), {"data": payload})()
            mssql_response = sync_view.post(dummy_request)
            resp_data = getattr(mssql_response, "data", {})
            if resp_data.get("status") is False:
                return Response(
                    {
                        "status": False,
                        "message": f"CMMS DB Sync failed: {resp_data.get('message')}",
                        "error": resp_data.get("error"),
                        "total_routines": len(jsonpayload),
                        "cmms_response": resp_data,
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return Response(
                {
                    "status": True,
                    "message": "Data was successfully synced to CMMS Database (via direct MSSQL)",
                    "total_routines": len(jsonpayload),
                    "cmms_response": resp_data,
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response(
                {"status": False, "message": "Something went wrong", "error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class RoutineDARTSyncAPI(APIView):
    def post(self, request):
        conn = None
        cursor = None

        try:
            payload = request.data
            routines = payload.get("routines", [])

            if not isinstance(routines, list):
                return Response(
                    {"status": False, "error": "'routines' must be a list"}, status=400
                )

            ship_obj = get_this_ship()

            if not ship_obj:
                return Response(
                    {"status": False, "error": "Ship not found"}, status=400
                )

            ship_sr_no = ship_obj.sr_no
            universal_id_m_ship = ship_obj.universal_id_m_ship or 0

            conn = get_mssql_connection()
            cursor = conn.cursor()

            # {Universal_ID_T_EquipmentShipDetail: EquipmentShipID}, same helper the
            # defect DART push uses -- SWMM only stores the universal id locally, so
            # CMMS's own integer EquipmentShipID has to be looked up.
            equipment_ship_ids = cmms_equipment_ship_ids(cursor)

            inserted_ids = []
            updated_ids = []

            # Batch check which dart_ids exist in CMMS T_Dart with 1 query instead of N individual queries
            all_dart_ids = set()
            for item in routines:
                old = item.get("old_routine") or {}
                new_data = item.get("new_routine") or {}
                if old:
                    all_dart_ids.add(
                        old.get("Universal_ID_T_Dart")
                        or f"SWMM-RD-{old.get('routine_id', 0)}"
                    )
                if new_data:
                    all_dart_ids.add(
                        new_data.get("Universal_ID_T_Dart")
                        or f"SWMM-RD-{new_data.get('routine_id', 0)}"
                    )

            existing_dart_ids = set()
            all_dart_list = [d for d in all_dart_ids if d]
            for i in range(0, len(all_dart_list), 500):
                chunk = all_dart_list[i : i + 500]
                placeholders = ",".join(["?"] * len(chunk))
                cursor.execute(
                    f"SELECT Universal_ID_T_Dart FROM T_Dart WITH (NOLOCK) WHERE Universal_ID_T_Dart IN ({placeholders})",
                    chunk,
                )
                existing_dart_ids.update(str(row[0]) for row in cursor.fetchall())

            # --------------------------------------------------
            # UPDATE QUERY
            # --------------------------------------------------
            update_query = """
                UPDATE T_Dart
                SET
                    DartNumber = ?,
                    SrNo = ?,
                    ShipSrNo = ?,
                    DartDate = ?,
                    DepartmentID = ?,
                    Department = ?,
                    EquipmentCode = ?,
                    RectifiedDate = ?,
                    Remarks = ?,
                    CancelDate = ?,
                    Active = ?,
                    UpdatedDate = ?,
                    Universal_ID_M_Ship = ?,
                    Universal_ID_M_Department = ?,
                    Universal_ID_A_User_Created_By = ?,
                    Universal_ID_A_User_Updated_By = ?,
                    Universal_ID_T_EquipmentShipDetail = ?,
                    Universal_ID_Ch_Master_Ship_Remarks_By = ?,
                    Next_Routine_Due_At_Running_Hours = ?,
                    Present_Running_Hours = ?,
                    Running_Hour_Which_Routine_Completed = ?,
                    Additional_Remarks = ?,
                    RoutineDefect = ?,
                    DefectDate = ?,
                    RoutineDueDate = ?,
                    RoutineStartDate = ?,
                    DefectDescription = ?,
                    RepairRoutineDetails = ?,
                    Is_Auto_Generated_Dart = ?,
                    IsClosed = ?,
                    Is_Amp = ?,
                    Is_Refit = ?,
                    Is_Routine = ?,
                    Is_Defect = ?,
                    Ship_Remarks = ?,
                    RoutineID = ?,
                    DL_Type_ID = ?,
                    DL_Number = ?,
                    Is_Final_Submit = ?,
                    Serial_Number = ?,
                    MandaysConsumed = ?,
                    ScheduleDate = ?,
                    Is_Drafted = ?,
                    RA_Additional_Remarks = ?,
                    Is_Signal_Drafted = ?,
                    Universal_ID_T_MaintopDetail = ?,
                    RAGenerationDate = ?,
                    Is_DLIIDrafted = ?,
                    Is_RefitRADraft = ?,
                    RecForDeletion = ?,
                    HrsFromInstallation = ?,
                    NewHrsFromInstallation = ?,
                    TotalRunningHours = ?,
                    Universal_ID_T_RefComp = ?,
                    FussDate = ?,
                    IsFuss = ?,
                    RoutineCarriedOutBy = ?,
                    PersonalNo = ?,
                    Universal_ID_M_RankList = ?,
                    TotalNoOfManpower = ?,
                    IsExportToSDRS = ?,
                    EquipmentShipID = ?,
                    Universal_ID_M_Frequency = ?,
                    ExDept = ?,
                    ExDeptID = ?,
                    IsSynced = ?
                WHERE Universal_ID_T_Dart = ?
            """

            # --------------------------------------------------
            # INSERT QUERY
            # --------------------------------------------------
            # 66 named columns below, so VALUES needs exactly 66 placeholders
            insert_query = """
                INSERT INTO T_Dart (
                    DartNumber,
                    SrNo,
                    ShipSrNo,
                    DartDate,
                    DepartmentID,
                    Department,
                    EquipmentCode,
                    RectifiedDate,
                    Remarks,
                    CancelDate,
                    Active,
                    CreatedDate,
                    Universal_ID_M_Ship,
                    Universal_ID_M_Department,
                    Universal_ID_A_User_Created_By,
                    Universal_ID_A_User_Updated_By,
                    Universal_ID_T_EquipmentShipDetail,
                    Universal_ID_Ch_Master_Ship_Remarks_By,
                    Next_Routine_Due_At_Running_Hours,
                    Present_Running_Hours,
                    Running_Hour_Which_Routine_Completed,
                    Additional_Remarks,
                    RoutineDefect,
                    DefectDate,
                    RoutineDueDate,
                    RoutineStartDate,
                    DefectDescription,
                    RepairRoutineDetails,
                    Is_Auto_Generated_Dart,
                    IsClosed,
                    Is_Amp,
                    Is_Refit,
                    Is_Routine,
                    Is_Defect,
                    Ship_Remarks,
                    RoutineID,
                    DL_Type_ID,
                    DL_Number,
                    Is_Final_Submit,
                    Serial_Number,
                    MandaysConsumed,
                    ScheduleDate,
                    Is_Drafted,
                    RA_Additional_Remarks,
                    Is_Signal_Drafted,
                    Universal_ID_T_MaintopDetail,
                    RAGenerationDate,
                    Is_DLIIDrafted,
                    Is_RefitRADraft,
                    RecForDeletion,
                    HrsFromInstallation,
                    NewHrsFromInstallation,
                    TotalRunningHours,
                    Universal_ID_T_RefComp,
                    FussDate,
                    IsFuss,
                    RoutineCarriedOutBy,
                    PersonalNo,
                    Universal_ID_M_RankList,
                    TotalNoOfManpower,
                    IsExportToSDRS,
                    EquipmentShipID,
                    Universal_ID_M_Frequency,
                    ExDept,
                    ExDeptID,
                    IsSynced,
                    Universal_ID_T_Dart
                )
                VALUES (
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?,?,?,?,
                    ?,?,?,?,?,?,?
                )
            """

            def _s(val, max_len=None):
                if val is None:
                    return None
                val_str = str(val)
                if max_len is not None:
                    return val_str[:max_len]
                return val_str

            for item in routines:
                old = item.get("old_routine") or {}
                new_data = item.get("new_routine") or {}

                # ==================================================
                # OLD ROUTINE -> UPDATE / INSERT
                # ==================================================
                if old:
                    dart_id = (
                        old.get("Universal_ID_T_Dart")
                        or f"SWMM-RD-{old.get('routine_id', 0)}"
                    )

                    exists = dart_id in existing_dart_ids

                    if exists:
                        values = (
                            _s(old.get("dart_number"), 250),
                            _s(old.get("dart_number") or old.get("dart_sr_no"), 200),
                            ship_sr_no,
                            old.get("date_of_completion"),
                            old.get("department_dep_code"),
                            _s(old.get("department_code"), 2),
                            old.get("eq_code"),
                            old.get("date_of_completion"),
                            _s(old.get("repair_remark")),
                            old.get("date_of_completion"),
                            1,
                            old.get("date_of_completion"),
                            _s(universal_id_m_ship, 100),
                            _s(old.get("Universal_ID_M_Department"), 100),
                            _s(old.get("created_by_uid"), 100),
                            _s(old.get("created_by_uid"), 100),
                            _s(old.get("Universal_ID_T_EquipmentShipDetail"), 100),
                            _s(old.get("remark_code"), 100),
                            None,
                            old.get("running_hour"),
                            old.get("running_hour"),
                            _s(old.get("completion_details"), 2000),
                            1,
                            old.get("date_of_completion"),
                            old.get("due_date"),
                            None,
                            _s(old.get("routine_description")),
                            _s(
                                old.get("completion_details")
                                or old.get("routine_description"),
                                200,
                            ),
                            1,
                            1,
                            0,
                            0,
                            1,
                            0,
                            None,
                            old.get("routine_id"),
                            None,
                            None,
                            1,
                            old.get("serial_number"),
                            None,
                            old.get("date_of_completion"),
                            0,
                            _s(old.get("repair_remark"), 100),
                            0,
                            _s(old.get("Universal_ID_T_MaintopDetail"), 100),
                            None,
                            None,
                            0,
                            old.get("rec_for_deletion"),
                            None,
                            None,
                            old.get("running_hour"),
                            _s(old.get("Universal_ID_T_RefComp"), 100),
                            None,
                            0,
                            _s(old.get("carried_by"), 2000),
                            _s(old.get("p_no"), 20),
                            _s(old.get("rank"), 100),
                            old.get("total_manpower"),
                            0,
                            equipment_ship_ids.get(
                                str(old.get("Universal_ID_T_EquipmentShipDetail"))
                            ),
                            _s(old.get("Universal_ID_M_Frequency"), 100),
                            _s(old.get("department_code"), 1),
                            old.get("department_dep_code"),
                            1,
                            dart_id,
                        )

                        cursor.execute(update_query, values)
                        updated_ids.append(dart_id)
                    else:
                        insert_values = (
                            _s(old.get("dart_number"), 250),
                            _s(old.get("dart_number") or old.get("dart_sr_no"), 200),
                            ship_sr_no,
                            old.get("date_of_completion"),
                            old.get("department_dep_code"),
                            _s(old.get("department_code"), 2),
                            old.get("eq_code"),
                            old.get("date_of_completion"),
                            _s(old.get("repair_remark")),
                            None,
                            1,
                            old.get("date_of_completion"),
                            _s(universal_id_m_ship, 100),
                            _s(old.get("Universal_ID_M_Department"), 100),
                            _s(old.get("created_by_uid"), 100),
                            _s(old.get("created_by_uid"), 100),
                            _s(old.get("Universal_ID_T_EquipmentShipDetail"), 100),
                            _s(old.get("remark_code"), 100),
                            old.get("due_running_hour"),
                            old.get("running_hour"),
                            old.get("running_hour"),
                            _s(old.get("completion_details"), 2000),
                            1,
                            None,
                            old.get("due_date"),
                            None,
                            _s(old.get("routine_description")),
                            _s(
                                old.get("completion_details")
                                or old.get("routine_description"),
                                200,
                            ),
                            1,
                            1,
                            0,
                            0,
                            1,
                            0,
                            None,
                            old.get("routine_id"),
                            None,
                            None,
                            1,
                            old.get("serial_number"),
                            None,
                            None,
                            0,
                            _s(old.get("repair_remark"), 100),
                            0,
                            _s(old.get("Universal_ID_T_MaintopDetail"), 100),
                            None,
                            0,
                            0,
                            old.get("rec_for_deletion"),
                            None,
                            None,
                            old.get("running_hour"),
                            _s(old.get("Universal_ID_T_RefComp"), 100),
                            None,
                            0,
                            _s(old.get("carried_by"), 2000),
                            _s(old.get("p_no"), 20),
                            _s(old.get("rank"), 100),
                            old.get("total_manpower"),
                            0,
                            equipment_ship_ids.get(
                                str(old.get("Universal_ID_T_EquipmentShipDetail"))
                            ),
                            _s(old.get("Universal_ID_M_Frequency"), 100),
                            _s(old.get("department_code"), 1),
                            old.get("department_dep_code"),
                            1,
                            dart_id,
                        )
                        cursor.execute(insert_query, insert_values)
                        inserted_ids.append(dart_id)

                # ==================================================
                # NEW ROUTINE -> INSERT
                # ==================================================
                if new_data:
                    dart_id = (
                        new_data.get("Universal_ID_T_Dart")
                        or f"SWMM-RD-{new_data.get('routine_id', 0)}"
                    )

                    exists = dart_id in existing_dart_ids

                    if not exists:
                        values = (
                            _s(new_data.get("dart_number"), 250),
                            _s(
                                new_data.get("dart_number")
                                or new_data.get("dart_sr_no"),
                                200,
                            ),
                            ship_sr_no,
                            new_data.get("date_of_completion"),
                            new_data.get("department_dep_code"),
                            _s(new_data.get("department_code"), 2),
                            new_data.get("eq_code"),
                            new_data.get("date_of_completion"),
                            _s(new_data.get("completion_details")),
                            None,
                            1,
                            new_data.get("date_of_completion"),
                            _s(universal_id_m_ship, 100),
                            _s(new_data.get("Universal_ID_M_Department"), 100),
                            _s(new_data.get("created_by_uid"), 100),
                            _s(new_data.get("created_by_uid"), 100),
                            _s(new_data.get("Universal_ID_T_EquipmentShipDetail"), 100),
                            None,
                            new_data.get("due_running_hour"),
                            new_data.get("running_hour"),
                            new_data.get("running_hour"),
                            _s(new_data.get("repair_remark"), 2000),
                            1,
                            None,
                            new_data.get("due_date"),
                            None,
                            _s(new_data.get("routine_description")),
                            _s(
                                new_data.get("completion_details")
                                or new_data.get("routine_description"),
                                200,
                            ),
                            1,
                            new_data.get("is_closed"),
                            0,
                            0,
                            1,
                            0,
                            None,
                            new_data.get("routine_id"),
                            None,
                            None,
                            0,
                            new_data.get("serial_number"),
                            None,
                            None,
                            0,
                            None,
                            0,
                            _s(new_data.get("Universal_ID_T_MaintopDetail"), 100),
                            None,
                            0,
                            0,
                            new_data.get("rec_for_deletion"),
                            None,
                            None,
                            None,
                            None,
                            None,
                            0,
                            _s(new_data.get("carried_by"), 2000),
                            _s(new_data.get("p_no"), 20),
                            None,
                            new_data.get("total_manpower"),
                            0,
                            equipment_ship_ids.get(
                                str(new_data.get("Universal_ID_T_EquipmentShipDetail"))
                            ),
                            _s(new_data.get("Universal_ID_M_Frequency"), 100),
                            _s(new_data.get("department_code"), 1),
                            new_data.get("department_dep_code"),
                            1,
                            dart_id,
                        )

                        cursor.execute(insert_query, values)

                        inserted_ids.append(dart_id)

            # ======================================================
            # IMPORTANT:
            # MSSQL COMMIT FIRST
            # ======================================================
            conn.commit()

            # ======================================================
            # ONLY AFTER MSSQL SUCCESS -> UPDATE LOCAL DB
            # ======================================================
            today = timezone.now().date()

            if inserted_ids:
                RoutineDescription.objects.filter(
                    universal_id_t_dart__in=inserted_ids
                ).update(open_cmms_sync_status=True, open_cmms_sync_date=today)

            if updated_ids:
                RoutineDescription.objects.filter(
                    universal_id_t_dart__in=updated_ids
                ).update(close_cmms_sync_status=True, close_cmms_sync_date=today)

            return Response(
                {
                    "status": True,
                    "message": "Routine sync successful",
                    "inserted": inserted_ids,
                    "updated": updated_ids,
                },
                status=200,
            )

        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass

            return Response(
                {
                    "status": False,
                    "message": "Routine sync failed",
                    "error": str(e),
                },
                status=500,
            )

        finally:
            if cursor:
                try:
                    cursor.close()
                except Exception:
                    pass

            if conn:
                try:
                    conn.close()
                except Exception:
                    pass


class SRARSyncAPIView(APIView):
    pagination_class = CommonPagination

    def _get_search(self, request):
        return request.query_params.get("search", "").strip()

    def _paginate(self, queryset, request):
        """
        Pagination helper.

        Query params:
            ?page=1
            ?page_size=10

        Existing frontend response ko disturb na karne ke liye
        pagination metadata alag return ki jayegi.
        """
        paginator = self.pagination_class()

        page = paginator.paginate_queryset(
            queryset,
            request,
            view=self,
        )

        if page is None:
            return queryset, None

        return page, {
            "count": paginator.page.paginator.count,
            "next": paginator.get_next_link(),
            "previous": paginator.get_previous_link(),
        }

    def get(self, request, pk, build_only=False):
        """`build_only=True` stops after writing srar_payload.json — used by
        SRARSyncByMonthYearAPIView, which does its own POST to CMMS. The HTTP route
        never passes it, so the legacy build-and-POST-and-redirect flow is unchanged."""
        active_tab = "T_SRARMthlyHeader"
        active_record_id = pk

        try:
            # ---------------------------------------------------------
            # 1. Signed PK decode
            # ---------------------------------------------------------
            try:
                srar_id = signing.loads(pk)
            except signing.BadSignature:
                return Response(
                    {
                        "status": False,
                        "message": "Invalid or expired SRAR identifier.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # ---------------------------------------------------------
            # 2. Header
            # ---------------------------------------------------------
            try:
                header = SrarMonthlyHeader.objects.select_related().get(pk=srar_id)
            except SrarMonthlyHeader.DoesNotExist:
                return Response(
                    {
                        "status": False,
                        "message": "SRAR monthly header not found.",
                        "srar_id": srar_id,
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            search = self._get_search(request)

            # ---------------------------------------------------------
            # Universal ID
            # ---------------------------------------------------------
            # The return's stable identity, sent as the header's unique_id and stamped on
            # every child row as header_unique_id.
            #
            # This used to be `str(uuid.uuid4())` computed here, which meant a *fresh*
            # id on every push: the same monthly return arrived at CMMS under a different
            # identity each time, so CMMS had no way to recognise it as the same record.
            #
            # A return pulled from CMMS already has CMMS's own id in
            # universal_id_t_srar_mthly_header — reuse it, so a pushed-back return keeps
            # the identity CMMS gave it. A return raised in the SWMM form has none, so mint
            # a UUID once and persist it; every later push then sends the same value.
            universal_id = (header.universal_id_t_srar_mthly_header or "").strip()
            if not universal_id:
                universal_id = str(uuid.uuid4())
                header.universal_id_t_srar_mthly_header = universal_id
                header.save(update_fields=["universal_id_t_srar_mthly_header"])

            # ---------------------------------------------------------
            # Ship details
            # ---------------------------------------------------------
            ship_details = get_this_ship()

            if not ship_details:
                return Response(
                    {
                        "status": False,
                        "message": "Ship details not found.",
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            # =========================================================
            # TAB 1 - EQUIPMENT EXPLOITATION
            # =========================================================

            active_tab = "T_SRARMthlyEquipments"

            equipment_exploitation_qs = SrarEquipmentExploitation.objects.filter(
                srar_monthly_header=header
            ).select_related(
                "sfd_details",
                "sfd_details__equipment",
            )

            if search:
                equipment_exploitation_qs = equipment_exploitation_qs.filter(
                    Q(
                        sfd_details__equipment__universal_id_m_equipment__icontains=search
                    )
                    | Q(sfd_details__t_equipment_ship_detail__icontains=search)
                    | Q(sfd_details__equipment__name__icontains=search)
                ).distinct()

            equipment_exploitation_data = list(equipment_exploitation_qs)

            # ---------------------------------------------------------
            # DGUF optimization
            # ---------------------------------------------------------
            equipment_ids = [
                eq.sfd_details_id
                for eq in equipment_exploitation_data
                if eq.sfd_details_id
            ]

            dguf_map = {}

            if equipment_ids:
                dguf_records = DGUF.objects.filter(
                    srar_monthly_header=header,
                    sfd_details_id__in=equipment_ids,
                ).values(
                    "sfd_details_id",
                    "rh_at_sea_and_anchorage",
                    "rh_at_port",
                )

                for dguf in dguf_records:
                    dguf_map.setdefault(
                        dguf["sfd_details_id"],
                        dguf,
                    )

            # =========================================================
            # TAB 2 - BOILER
            # =========================================================

            active_tab = "T_SRARMthlyBoiler"

            boiler_steaming_details = SrarMonthlyBoiler.objects.filter(
                srar_monthly_header=header
            ).select_related(
                "sfd_details",
                "sfd_details__equipment",
            )

            boiler_alkalinity_salinity_details = (
                SrarBoilerAlkalinitySalinityDetail.objects.filter(
                    srar_monthly_header=header
                ).select_related(
                    "sfd_details",
                    "sfd_details__equipment",
                )
            )

            if search:
                boiler_search = (
                    Q(name__icontains=search)
                    | Q(
                        sfd_details__equipment__universal_id_m_equipment__icontains=search
                    )
                    | Q(sfd_details__t_equipment_ship_detail__icontains=search)
                )

                boiler_steaming_details = boiler_steaming_details.filter(
                    boiler_search
                ).distinct()

                boiler_alkalinity_salinity_details = boiler_alkalinity_salinity_details.filter(
                    Q(
                        sfd_details__equipment__universal_id_m_equipment__icontains=search
                    )
                    | Q(sfd_details__t_equipment_ship_detail__icontains=search)
                ).distinct()

            # =========================================================
            # TAB 3 - SHIP ACTIVITY
            # =========================================================

            active_tab = "Ch_ShipMonthlyMasterActivity"

            ship_activity_details = SrarMonthlyShipActivity.objects.filter(
                srar_monthly_header=header
            ).select_related(
                "ship_state",
                "ship_location",
                "ship_activity_type",
                "ship_activity_detail",
                "srar_monthly_header",
            )

            if search:
                ship_activity_details = ship_activity_details.filter(
                    Q(ship_state__name__icontains=search)
                    | Q(ship_state__code__icontains=search)
                    | Q(ship_location__name__icontains=search)
                    | Q(ship_location__code__icontains=search)
                    | Q(ship_activity_type__name__icontains=search)
                    | Q(ship_activity_type__code__icontains=search)
                    | Q(ship_activity_detail__name__icontains=search)
                    | Q(ship_activity_detail__code__icontains=search)
                    | Q(remarks__icontains=search)
                ).distinct()

            # =========================================================
            # TAB 4 - FUEL / AVCAT / TORSION
            # =========================================================

            active_tab = "Ch_Ship_Mthly_Fuel_Consumption"

            fuel_consumption_months = FuelConsumptionMonth.objects.filter(
                srar_monthly_header=header
            )

            avcat_statuses = AvcatStatus.objects.filter(srar_monthly_header=header)

            torsion_meters = TorsionMeter.objects.filter(
                srar_monthly_header=header
            ).select_related(
                "sfd_details",
                "sfd_details__equipment",
            )

            if search:
                torsion_meters = torsion_meters.filter(
                    Q(
                        sfd_details__equipment__universal_id_m_equipment__icontains=search
                    )
                    | Q(sfd_details__t_equipment_ship_detail__icontains=search)
                ).distinct()

            # =========================================================
            # TAB 5 - ICCP / H2S / STP / MAGAZINE
            # =========================================================

            active_tab = "Ch_Ship_Mnthly_ICCP"

            iccps = Iccp.objects.filter(srar_monthly_header=header).select_related(
                "sfd_details",
                "sfd_details__equipment",
            )

            h2s_sensors = H2SSensor.objects.filter(
                srar_monthly_header=header
            ).select_related(
                "sfd_details",
                "sfd_details__equipment",
            )

            stps = STP.objects.filter(srar_monthly_header=header).select_related(
                "sfd_details",
                "sfd_details__equipment",
            )

            magazine_systems = MagazineFFSystemFloodingSystem.objects.filter(
                srar_monthly_header=header
            ).select_related(
                "sfd_details",
                "sfd_details__equipment",
            )

            if search:
                equipment_search = Q(
                    sfd_details__equipment__universal_id_m_equipment__icontains=search
                ) | Q(sfd_details__t_equipment_ship_detail__icontains=search)

                iccps = iccps.filter(equipment_search).distinct()
                h2s_sensors = h2s_sensors.filter(equipment_search).distinct()
                stps = stps.filter(equipment_search).distinct()
                magazine_systems = magazine_systems.filter(equipment_search).distinct()

            # =========================================================
            # TAB 6 - CENTRIFUGE / TEST KITS
            # =========================================================

            active_tab = "Ch_Ship_Mnthly_Lub_Fuel_Centrifuge"

            centrifuges = SrarCentrifuge.objects.filter(
                srar_monthly_header=header
            ).select_related(
                "sfd_details",
                "sfd_details__equipment",
            )

            test_kits = OpsStatusofLubOilandCoolantTestKits.objects.filter(
                srar_monthly_header=header
            ).select_related(
                "sfd_details",
                "sfd_details__equipment",
            )

            if search:
                centrifuge_search = Q(
                    sfd_details__equipment__universal_id_m_equipment__icontains=search
                ) | Q(sfd_details__t_equipment_ship_detail__icontains=search)

                centrifuges = centrifuges.filter(centrifuge_search).distinct()

                test_kits = test_kits.filter(centrifuge_search).distinct()

            # =========================================================
            # EEF
            # =========================================================

            eef = EEF.objects.filter(srar_monthly_header=header).first()

            tab_14_eef_json = []

            if eef:
                tab_14_eef_json.append(
                    {
                        "id": eef.id,
                        "srar_monthly_header_id": header.id,
                        "serial_no": eef.serial_no,
                        "designed": eef.designed,
                        "actual": eef.actual,
                        "reason_for_exceeding": (eef.reason_for_exceeding),
                        "reason_for_exceeding_label": dict(EEF.REASON_CHOICES).get(
                            eef.reason_for_exceeding
                        ),
                        "ship_remarks": eef.ship_remarks,
                    }
                )

            # =========================================================
            # HEADER JSON
            # =========================================================

            header_json = {
                "id": header.id,
                "unique_id": universal_id,
                "ship_name": str(ship_details.name),
                "sr_no": ship_details.sr_no,
                "ship_code": ship_details.code,
                "srar_month": header.srar_month,
                "srar_year": header.srar_year,
                "hours_underway_month_hr": (header.hours_underway_month_hr),
                "hours_underway_month_min": (header.hours_underway_month_min),
                "hours_underway_month_minutes": (header.hours_underway_month_minutes),
                # Decimal hours, matching what CMMS stores in HoursUnderwayMonth (see
                # _hr_min_to_decimal_hours). This was built from
                # hours_underway_month_minutes, a column nothing in this codebase ever
                # writes -- so it was always None and this always went out as "0", even
                # on returns holding thousands of hours in the hr/min pair beside it.
                "total_hours_underway_month": _hr_min_to_decimal_hours(
                    header.hours_underway_month_hr,
                    header.hours_underway_month_min,
                    fallback=(
                        round((header.hours_underway_month_minutes or 0) / 60.0, 2)
                        if header.hours_underway_month_minutes is not None
                        else None
                    ),
                ),
                "distance_run_month": header.distance_run_month,
                "hours_underway_since_commissioning_hr": _hr_min_to_decimal_hours(
                    header.hours_underway_since_commissioning_hr,
                    header.hours_underway_since_commissioning_min,
                ),
                "distance_run_since_commissioning": (
                    header.distance_run_since_commissioning
                ),
                "max_speed": header.max_speed,
                # max_duration is where the CMMS pull puts MaxDuration; the hr/min pair
                # is what the SWMM form fills in. Whichever of the two holds the value
                # for this return has to be the one that goes back.
                "max_duration": _hr_min_to_decimal_hours(
                    header.max_duration_hr,
                    header.max_duration_min,
                    fallback=header.max_duration,
                ),
                "max_speed_date": (
                    header.max_speed_date.isoformat() if header.max_speed_date else None
                ),
                "max_shaft_rpm": header.max_shaft_rpm,
                "eo_name": header.eo_name,
                "eo_rank": header.eo_rank,
                "eo_personal_no": header.eo_personal_no,
                "eo_contact_no": header.eo_contact_no,
                "eo_writer_contact_no": (header.eo_writer_contact_no),
                "is_saved": header.is_saved,
                "send_to_co": header.send_to_co,
                "co_approved": getattr(header, "co_approved", False),
                "designed": eef.designed if eef else None,
                "actual": eef.actual if eef else None,
                "reason_for_exceeding": (eef.reason_for_exceeding if eef else None),
                "ship_remarks": (eef.ship_remarks if eef else None),
            }

            # =========================================================
            # TAB 1 JSON
            # =========================================================

            equipment_explotion_data_json = []

            for eq in equipment_exploitation_data:
                dguf_val = dguf_map.get(eq.sfd_details_id)

                eq_json = {
                    "id": eq.id,
                    "srar_monthly_header_id": (eq.srar_monthly_header.id),
                    "header_unique_id": universal_id,
                    "equipment_id": (eq.sfd_details.id if eq.sfd_details else None),
                    "m_equipment_id": (
                        eq.sfd_details.equipment.universal_id_m_equipment
                        if (eq.sfd_details and eq.sfd_details.equipment)
                        else None
                    ),
                    "t_equipment_ship_detail": (
                        eq.sfd_details.t_equipment_ship_detail
                        if eq.sfd_details
                        else None
                    ),
                    "equipment_name": (str(eq.sfd_details) if eq.sfd_details else None),
                    "hrs_for_month": (
                        f"{eq.hrs_for_month_hrs or 0}.{eq.hrs_for_month_min or 0}"
                    ),
                    "hrs_for_month_hrs": (eq.hrs_for_month_hrs),
                    "hrs_for_month_min": (eq.hrs_for_month_min),
                    "rhsi_till_prev_month": (eq.rhsi_till_prev_month),
                    "rhsi_till_prev_month_hrs": (eq.rhsi_till_prev_month_hrs),
                    "rhsi_till_prev_month_min": (eq.rhsi_till_prev_month_min),
                    "rhsi_till_current_month": (eq.rhsi_till_current_month),
                    "rhsi_till_current_month_hr": (eq.rhsi_till_current_month_hr),
                    "rhsi_till_current_month_min": (eq.rhsi_till_current_month_min),
                    "rh_at_sea_and_anchorage": (
                        dguf_val["rh_at_sea_and_anchorage"] if dguf_val else "0.0"
                    ),
                    "rh_at_port": (dguf_val["rh_at_port"] if dguf_val else "0.0"),
                }

                equipment_explotion_data_json.append(eq_json)

            # =========================================================
            # TAB 2 - BOILER STEAMING JSON
            # =========================================================

            tab_2_boiler_tab_data_json = []

            for boiler in boiler_steaming_details:
                boiler_json = {
                    "id": boiler.id,
                    "srar_monthly_header_id": (
                        boiler.srar_monthly_header.id
                        if boiler.srar_monthly_header
                        else None
                    ),
                    "header_unique_id": universal_id,
                    "equipment_id": (
                        boiler.sfd_details.id if boiler.sfd_details else None
                    ),
                    "m_equipment_id": (
                        boiler.sfd_details.equipment.universal_id_m_equipment
                        if (boiler.sfd_details and boiler.sfd_details.equipment)
                        else None
                    ),
                    "t_equipment_ship_detail": (
                        boiler.sfd_details.t_equipment_ship_detail
                        if boiler.sfd_details
                        else None
                    ),
                    "name": boiler.name,
                    "hrs_steamed_in_month": (boiler.hrs_steamed_in_month),
                    "hrs_steamed_since_commissioning": (
                        boiler.hrs_steamed_since_commissioning
                    ),
                    "hrs_above_20_percent": (boiler.hrs_above_20_percent),
                    "highest_salinity_during_month": (
                        boiler.highest_salinity_during_month
                    ),
                    "lowest_salinity_during_month": (
                        boiler.lowest_salinity_during_month
                    ),
                    "last_int_clg_date": (boiler.last_int_clg_date),
                    "hrs_steamed_since_last_int_clg": (
                        boiler.hrs_steamed_since_last_int_clg
                    ),
                    "last_ext_clg_date": (boiler.last_ext_clg_date),
                    "hrs_steamed_since_last_ext_clg": (
                        boiler.hrs_steamed_since_last_ext_clg
                    ),
                    "hrs_steamed_at_last_ext_clg": (boiler.hrs_steamed_at_last_ext_clg),
                    "last_retubing_date": (boiler.last_retubing_date),
                    "hrs_steamed_since_last_retubing": (
                        boiler.hrs_steamed_since_last_retubing
                    ),
                    "hrs_steamed_at_last_retubing": (
                        boiler.hrs_steamed_at_last_retubing
                    ),
                    "date_of_last_durability_test": (
                        boiler.date_of_last_durability_test
                    ),
                    "due_date_for_next_inspection": (
                        boiler.due_date_for_next_inspection
                    ),
                    "life_assessed_in_months": (boiler.life_assessed_in_months),
                }

                tab_2_boiler_tab_data_json.append(boiler_json)

            # =========================================================
            # TAB 2 - ALKALINITY / SALINITY JSON
            # =========================================================

            tab_2_boiler_alkalinity_salinity_data_json = []

            for detail in boiler_alkalinity_salinity_details:
                detail_json = {
                    "id": detail.id,
                    "srar_monthly_header_id": (
                        detail.srar_monthly_header.id
                        if detail.srar_monthly_header
                        else None
                    ),
                    "header_unique_id": universal_id,
                    "equipment_id": (
                        detail.sfd_details.id if detail.sfd_details else None
                    ),
                    "m_equipment_id": (
                        detail.sfd_details.equipment.universal_id_m_equipment
                        if (detail.sfd_details and detail.sfd_details.equipment)
                        else None
                    ),
                    "t_equipment_ship_detail": (
                        detail.sfd_details.t_equipment_ship_detail
                        if detail.sfd_details
                        else None
                    ),
                    "salinity_last_week": (detail.salinity_last_week),
                    "chloride_during_month": (detail.chloride_during_month),
                    "lowest_salinity_chloride": (detail.lowest_salinity_chloride),
                    "alkalinity_n": detail.alkalinity_n,
                    "ph": detail.ph,
                    "tds_ppm": detail.tds_ppm,
                    "phosphate_lowest": (detail.phosphate_lowest),
                    "phosphate_ppm_0": (detail.phosphate_ppm_0),
                    "alkalinity_mg_l_lowest": (detail.alkalinity_mg_l_lowest),
                    "alk_ppm": detail.alk_ppm,
                    "y150_alkalinity_percent": (detail.y150_alkalinity_percent),
                    "y150_ph": detail.y150_ph,
                    "y164_tds_ppm": (detail.y164_tds_ppm),
                    "y164_phosphate_lowest": (detail.y164_phosphate_lowest),
                    "vkd_alkalinity_percent": (detail.vkd_alkalinity_percent),
                    "vkd_alk_ppm": detail.vkd_alk_ppm,
                    "vkd_alkalinity_mg_l": (detail.vkd_alkalinity_mg_l),
                    "vkd_phosphate_ppm": (detail.vkd_phosphate_ppm),
                    "jw_common": detail.jw_common,
                }

                tab_2_boiler_alkalinity_salinity_data_json.append(detail_json)

            # =========================================================
            # TAB 2 - MERGED BOILER DATA
            # =========================================================

            boiler_map = {}

            # ---------------------------------------------------------
            # Boiler steaming
            # ---------------------------------------------------------
            for boiler in boiler_steaming_details:
                header_id = boiler.srar_monthly_header.id

                equipment_id = boiler.sfd_details.id if boiler.sfd_details else None

                key = (
                    header_id,
                    equipment_id,
                )

                boiler_map[key] = {
                    "srar_monthly_header_id": header_id,
                    "header_unique_id": universal_id,
                    "equipment_id": equipment_id,
                    "m_equipment_id": (
                        boiler.sfd_details.equipment.universal_id_m_equipment
                        if (boiler.sfd_details and boiler.sfd_details.equipment)
                        else None
                    ),
                    "t_equipment_ship_detail": (
                        boiler.sfd_details.t_equipment_ship_detail
                        if boiler.sfd_details
                        else None
                    ),
                    "equipment_name": (
                        str(boiler.sfd_details) if boiler.sfd_details else None
                    ),
                    "name": boiler.name,
                    "hrs_steamed_in_month": (boiler.hrs_steamed_in_month),
                    "hrs_steamed_since_commissioning": (
                        boiler.hrs_steamed_since_commissioning
                    ),
                    "hrs_above_20_percent": (boiler.hrs_above_20_percent),
                    "highest_salinity_during_month": (
                        boiler.highest_salinity_during_month
                    ),
                    "lowest_salinity_during_month": (
                        boiler.lowest_salinity_during_month
                    ),
                    "last_int_clg_date": (boiler.last_int_clg_date),
                    "hrs_steamed_since_last_int_clg": (
                        boiler.hrs_steamed_since_last_int_clg
                    ),
                    "last_ext_clg_date": (boiler.last_ext_clg_date),
                    "hrs_steamed_since_last_ext_clg": (
                        boiler.hrs_steamed_since_last_ext_clg
                    ),
                    "hrs_steamed_at_last_ext_clg": (boiler.hrs_steamed_at_last_ext_clg),
                    "last_retubing_date": (boiler.last_retubing_date),
                    "hrs_steamed_since_last_retubing": (
                        boiler.hrs_steamed_since_last_retubing
                    ),
                    "hrs_steamed_at_last_retubing": (
                        boiler.hrs_steamed_at_last_retubing
                    ),
                    "date_of_last_durability_test": (
                        boiler.date_of_last_durability_test
                    ),
                    "due_date_for_next_inspection": (
                        boiler.due_date_for_next_inspection
                    ),
                    "life_assessed_in_months": (boiler.life_assessed_in_months),
                }

            # ---------------------------------------------------------
            # Boiler alkalinity / salinity
            # ---------------------------------------------------------
            for detail in boiler_alkalinity_salinity_details:
                header_id = detail.srar_monthly_header.id

                equipment_id = detail.sfd_details.id if detail.sfd_details else None

                key = (
                    header_id,
                    equipment_id,
                )

                if key not in boiler_map:
                    boiler_map[key] = {
                        "srar_monthly_header_id": header_id,
                        "header_unique_id": universal_id,
                        "equipment_id": equipment_id,
                    }

                boiler_map[key].update(
                    {
                        "m_equipment_id": (
                            detail.sfd_details.equipment.universal_id_m_equipment
                            if (detail.sfd_details and detail.sfd_details.equipment)
                            else None
                        ),
                        "t_equipment_ship_detail": (
                            detail.sfd_details.t_equipment_ship_detail
                            if detail.sfd_details
                            else None
                        ),
                        "equipment_name": (
                            str(detail.sfd_details) if detail.sfd_details else None
                        ),
                        "salinity_last_week": (detail.salinity_last_week),
                        "chloride_during_month": (detail.chloride_during_month),
                        "lowest_salinity_chloride": (detail.lowest_salinity_chloride),
                        "alkalinity_n": (detail.alkalinity_n),
                        "ph": detail.ph,
                        "tds_ppm": detail.tds_ppm,
                        "phosphate_lowest": (detail.phosphate_lowest),
                        "phosphate_ppm_0": (detail.phosphate_ppm_0),
                        "alkalinity_mg_l_lowest": (detail.alkalinity_mg_l_lowest),
                        "alk_ppm": detail.alk_ppm,
                        "y150_alkalinity_percent": (detail.y150_alkalinity_percent),
                        "y150_ph": detail.y150_ph,
                        "y164_tds_ppm": (detail.y164_tds_ppm),
                        "y164_phosphate_lowest": (detail.y164_phosphate_lowest),
                        "vkd_alkalinity_percent": (detail.vkd_alkalinity_percent),
                        "vkd_alk_ppm": (detail.vkd_alk_ppm),
                        "vkd_alkalinity_mg_l": (detail.vkd_alkalinity_mg_l),
                        "vkd_phosphate_ppm": (detail.vkd_phosphate_ppm),
                        "jw_common": detail.jw_common,
                    }
                )

            tab_2_boiler_data = list(boiler_map.values())

            # =========================================================
            # TAB 3 - SHIP ACTIVITY JSON
            # =========================================================

            tab_3_ship_activity_details_json = []

            for act in ship_activity_details:
                act_json = {
                    "id": act.id,
                    "srar_monthly_header_id": (
                        act.srar_monthly_header.id if act.srar_monthly_header else None
                    ),
                    "header_unique_id": universal_id,
                    "ship_state_id": (
                        act.ship_state.Universal_ID_Ch_Master_Ship_State
                        if act.ship_state
                        else None
                    ),
                    "ship_state_name": (
                        act.ship_state.name if act.ship_state else None
                    ),
                    "ship_state_code": (
                        act.ship_state.code if act.ship_state else None
                    ),
                    "ship_location_id": (
                        act.ship_location.Universal_ID_Ch_Master_Ship_Location
                        if act.ship_location
                        else None
                    ),
                    "ship_location_name": (
                        act.ship_location.name if act.ship_location else None
                    ),
                    "ship_location_code": (
                        act.ship_location.code if act.ship_location else None
                    ),
                    "ship_activity_type_id": (
                        act.ship_activity_type.Universal_ID_Ch_Master_Ship_Activity_Type
                        if act.ship_activity_type
                        else None
                    ),
                    "ship_activity_type_name": (
                        act.ship_activity_type.name if act.ship_activity_type else None
                    ),
                    "ship_activity_type_code": (
                        act.ship_activity_type.code if act.ship_activity_type else None
                    ),
                    "ship_activity_detail_id": (
                        act.ship_activity_detail.Universal_ID_Ch_Master_Ship_Activity_Detail
                        if act.ship_activity_detail
                        else None
                    ),
                    "ship_activity_detail_name": (
                        act.ship_activity_detail.name
                        if act.ship_activity_detail
                        else None
                    ),
                    "ship_activity_detail_code": (
                        act.ship_activity_detail.code
                        if act.ship_activity_detail
                        else None
                    ),
                    "from_date": act.from_date,
                    "to_date": act.to_date,
                    "serial_no": act.serial_no,
                    "remarks": act.remarks,
                }

                tab_3_ship_activity_details_json.append(act_json)

            # =========================================================
            # TAB 4 - FUEL CONSUMPTION
            # =========================================================

            tab4_fuel_consumption_month_json = []

            for fuel in fuel_consumption_months:
                fuel_json = {
                    "id": fuel.id,
                    "srar_monthly_header_id": (
                        fuel.srar_monthly_header.id
                        if fuel.srar_monthly_header
                        else None
                    ),
                    "header_unique_id": universal_id,
                    "b_f_from_last_month": (fuel.b_f_from_last_month),
                    "recieved": fuel.recieved,
                    "consumed_in_harbour": (fuel.consumed_in_harbour),
                    "consumed_at_anchorage": (fuel.consumed_at_anchorage),
                    "consumed_at_sea": (fuel.consumed_at_sea),
                    "total_consumed": (fuel.total_consumed),
                    "defueled": fuel.defueled,
                    "balance_left_on_board": (fuel.balance_left_on_board),
                    "serial_no": fuel.serial_no,
                }

                tab4_fuel_consumption_month_json.append(fuel_json)

            # =========================================================
            # TAB 4 - AVCAT
            # =========================================================

            tab_4_avcat_status_json = []

            for avcat in avcat_statuses:
                avcat_json = {
                    "id": avcat.id,
                    "srar_monthly_header_id": (
                        avcat.srar_monthly_header.id
                        if avcat.srar_monthly_header
                        else None
                    ),
                    "header_unique_id": universal_id,
                    "b_f_from_last_month": (avcat.b_f_from_last_month),
                    "recieved": avcat.recieved,
                    "given_to_ac": avcat.given_to_ac,
                    "used_for_trials_drained": (avcat.used_for_trials_drained),
                    "total_consumed": (avcat.total_consumed),
                    "defuelded": avcat.defuelded,
                    "balance_left_on_board": (avcat.balance_left_on_board),
                    "serial_no": avcat.serial_no,
                }

                tab_4_avcat_status_json.append(avcat_json)

            # ---------------------------------------------------------
            # TAB 4 : TORSION METER
            # ---------------------------------------------------------

            tab_4_torsion_meter_json = []

            for tm in torsion_meters:
                sfd = tm.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_4_torsion_meter_json.append(
                    {
                        "id": tm.id,
                        # Header
                        "srar_monthly_header_id": (
                            tm.srar_monthly_header.id
                            if tm.srar_monthly_header
                            else None
                        ),
                        "header_unique_id": universal_id,
                        # Equipment mapping
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "equipment_name": (str(sfd) if sfd else None),
                        # Equipment details
                        "nomenclature": tm.nomenclature,
                        "eqpt_code": tm.eqpt_code,
                        "loc_on_board": tm.loc_on_board,
                        "serial_no": tm.serial_no,
                        # Readings
                        "torsion_meter_rdg": tm.torsion_meter_rdg,
                        "max_rpm_achieved": tm.max_rpm_achieved,
                        # Operational status
                        "ops_or_non_ops": tm.ops_or_non_ops,
                        # Dates
                        "non_ops_since": tm.non_ops_since,
                        "last_calibration_date": tm.last_calibration_date,
                        "next_calibration_date": tm.next_calibration_date,
                    }
                )

            # ---------------------------------------------------------
            # TAB 5 : ICCP
            # ---------------------------------------------------------

            tab_iccp_json = []

            for iccp in iccps:
                sfd = iccp.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_iccp_json.append(
                    {
                        "id": iccp.id,
                        # Header
                        "srar_monthly_header_id": (
                            iccp.srar_monthly_header.id
                            if iccp.srar_monthly_header
                            else None
                        ),
                        "header_unique_id": universal_id,
                        # Equipment mapping
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "equipment_name": (str(sfd) if sfd else None),
                        # Details
                        "serial_no": iccp.serial_no,
                        "nomenclature": iccp.nomenclature,
                        "loc_on_board": iccp.loc_on_board,
                        # Ops status
                        "ops_or_non_ops": iccp.ops_or_non_ops,
                        "ops_or_non_ops_label": (
                            dict(Iccp.ops_choices).get(iccp.ops_or_non_ops)
                            if iccp.ops_or_non_ops
                            else None
                        ),
                        "non_ops_since": iccp.non_ops_since,
                    }
                )

            # ---------------------------------------------------------
            # TAB 5 : H2S SENSOR
            # ---------------------------------------------------------

            tab_h2s_sensor_json = []

            for sensor in h2s_sensors:
                sfd = sensor.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_h2s_sensor_json.append(
                    {
                        "id": sensor.id,
                        # Header
                        "srar_monthly_header_id": (
                            sensor.srar_monthly_header.id
                            if sensor.srar_monthly_header
                            else None
                        ),
                        "header_unique_id": universal_id,
                        # Equipment mapping
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "equipment_name": (str(sfd) if sfd else None),
                        # Details
                        "serial_no": sensor.serial_no,
                        "nomenclature": sensor.nomenclature,
                        "loc_on_board": sensor.loc_on_board,
                        # Ops status
                        "ops_or_non_ops": sensor.ops_or_non_ops,
                        "ops_or_non_ops_label": (
                            dict(H2SSensor.ops_choices).get(sensor.ops_or_non_ops)
                            if sensor.ops_or_non_ops
                            else None
                        ),
                        "non_ops_since": sensor.non_ops_since,
                        # Calibration
                        "last_calibration_date": sensor.last_calibration_date,
                        "next_calibration_date": sensor.next_calibration_date,
                    }
                )

            # ---------------------------------------------------------
            # TAB 5 : STP
            # ---------------------------------------------------------

            tab_stp_json = []

            for stp in stps:
                sfd = stp.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_stp_json.append(
                    {
                        "id": stp.id,
                        # Header
                        "srar_monthly_header_id": (
                            stp.srar_monthly_header.id
                            if stp.srar_monthly_header
                            else None
                        ),
                        "header_unique_id": universal_id,
                        # Equipment mapping
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "equipment_name": (str(sfd) if sfd else None),
                        # Details
                        "serial_no": stp.serial_no,
                        "nomenclature": stp.nomenclature,
                        "loc_on_board": stp.loc_on_board,
                        # Ops status
                        "ops_or_non_ops": stp.ops_or_non_ops,
                        "ops_or_non_ops_label": (
                            dict(STP.ops_choices).get(stp.ops_or_non_ops)
                            if stp.ops_or_non_ops
                            else None
                        ),
                        "non_ops_since": stp.non_ops_since,
                        # STP specific
                        "effluent_test_date": stp.effluent_test_date,
                        "effluent_status": stp.effluent_status,
                        "remarks": stp.remarks,
                    }
                )

            # ---------------------------------------------------------
            # TAB 5 : MAGAZINE FF SYSTEM
            # ---------------------------------------------------------

            tab_magazine_ff_system_json = []

            for system in magazine_systems:
                sfd = system.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_magazine_ff_system_json.append(
                    {
                        "id": system.id,
                        # Header
                        "srar_monthly_header_id": (
                            system.srar_monthly_header.id
                            if system.srar_monthly_header
                            else None
                        ),
                        "header_unique_id": universal_id,
                        # Equipment mapping
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "equipment_name": (str(sfd) if sfd else None),
                        # Details
                        "serial_no": system.serial_no,
                        "nomenclature": system.nomenclature,
                        "loc_on_board": system.loc_on_board,
                        # Ops status
                        "ops_or_non_ops": system.ops_or_non_ops,
                        "ops_or_non_ops_label": (
                            dict(MagazineFFSystemFloodingSystem.ops_choices).get(
                                system.ops_or_non_ops
                            )
                            if system.ops_or_non_ops
                            else None
                        ),
                        "non_ops_since": system.non_ops_since,
                        # Trials
                        "last_trials_taken": system.last_trials_taken,
                        "next_trials_due": system.next_trials_due,
                    }
                )

            # ---------------------------------------------------------
            # TAB : LUB OIL & COOLANT TEST KITS
            # ---------------------------------------------------------

            tab_lub_oil_coolant_test_kits_json = []

            for kit in test_kits:
                sfd = kit.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_lub_oil_coolant_test_kits_json.append(
                    {
                        "id": kit.id,
                        # Header
                        "srar_monthly_header_id": (
                            kit.srar_monthly_header.id
                            if kit.srar_monthly_header
                            else None
                        ),
                        "header_unique_id": universal_id,
                        # Equipment mapping
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "equipment_name": (str(sfd) if sfd else None),
                        "universal_id": kit.universal_id,
                        # Description
                        "description": kit.description,
                        # Ops status
                        "ops_or_non_ops": kit.ops_or_non_ops,
                        "ops_or_non_ops_label": (
                            dict(OpsStatusofLubOilandCoolantTestKits.ops_choices).get(
                                kit.ops_or_non_ops
                            )
                            if kit.ops_or_non_ops
                            else None
                        ),
                        "non_ops_since": kit.non_ops_since,
                        # Trials / Calibration
                        "last_trials_taken": kit.last_trials_taken,
                        "next_trials_due": kit.next_trials_due,
                        "calibration": kit.calibration,
                        "next_calibration_due_date": kit.next_calibration_due_date,
                    }
                )

            # ---------------------------------------------------------
            # TAB : SRAR CENTRIFUGE
            # ---------------------------------------------------------

            tab_centrifuge_json = []

            for centrifuge in centrifuges:
                sfd = centrifuge.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_centrifuge_json.append(
                    {
                        "id": centrifuge.id,
                        # Header
                        "srar_monthly_header_id": (
                            centrifuge.srar_monthly_header.id
                            if centrifuge.srar_monthly_header
                            else None
                        ),
                        "header_unique_id": universal_id,
                        # Equipment mapping
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "equipment_name": (str(sfd) if sfd else None),
                        # Ops status
                        "ops_or_non_ops": centrifuge.ops_or_non_ops,
                        "ops_or_non_ops_label": (
                            dict(SrarCentrifuge.ops_choices).get(
                                centrifuge.ops_or_non_ops
                            )
                            if centrifuge.ops_or_non_ops
                            else None
                        ),
                        "non_ops_since": centrifuge.non_ops_since,
                        # Step 6 makes these two mandatory for an Ops purifier; they had
                        # no columns until now, so nothing was ever pushed for them.
                        "last_calibrated_on": centrifuge.last_calibrated_on,
                        "next_calibration": centrifuge.next_calibration,
                    }
                )

            # =========================================================
            # TAB 7A : SAFETY DEVICE CHECK TRIAL
            # =========================================================

            sdc_trials = SafetyDeviceCheckTrial.objects.filter(
                srar_monthly_header=header
            ).select_related(
                "sfd_details",
                "sfd_details__equipment",
            )

            tab_7_safety_device_check_trial_json = []

            for trial in sdc_trials:
                sfd = trial.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_7_safety_device_check_trial_json.append(
                    {
                        "id": trial.id,
                        # Header
                        "srar_monthly_header_id": (
                            trial.srar_monthly_header.id
                            if trial.srar_monthly_header
                            else None
                        ),
                        "header_unique_id": universal_id,
                        # Equipment mapping
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "equipment_name": (str(sfd) if sfd else None),
                        # Trial details
                        "sdc_conducted_by": trial.sdc_conducted_by,
                        "sdc_conducted_by_label": trial.sdc_conducted_by,
                        "date_of_sdc": trial.date_of_sdc,
                        "sfc_in_gm_kwh": trial.sfc_in_gm_kwh,
                        "last_sfc_trial_date": trial.last_sfc_trial_date,
                        "displacement_during_sfc_trial": (
                            trial.displacement_during_sfc_trial
                        ),
                        # Status
                        "status": trial.status,
                        "status_label": (
                            dict(SafetyDeviceCheckTrial.status_choices).get(
                                trial.status
                            )
                            if trial.status
                            else None
                        ),
                    }
                )

            # =========================================================
            # TAB 7B : INJECTOR / FIP CALIBRATION & REPLACEMENT
            # =========================================================

            injector_fip_records = InjectorFIPCalibrationReplacement.objects.filter(
                srar_monthly_header=header
            ).select_related(
                "sfd_details",
                "sfd_details__equipment",
            )

            tab_7_injector_fip_json = []

            for record in injector_fip_records:
                sfd = record.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_7_injector_fip_json.append(
                    {
                        "id": record.id,
                        # Header
                        "srar_monthly_header_id": (
                            record.srar_monthly_header.id
                            if record.srar_monthly_header
                            else None
                        ),
                        "header_unique_id": universal_id,
                        # Equipment mapping
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "equipment_name": (str(sfd) if sfd else None),
                        # Identification
                        "serial_no": record.serial_no,
                        # Ops status
                        "ops_or_non_ops": record.ops_or_non_ops,
                        "ops_or_non_ops_label": (
                            dict(InjectorFIPCalibrationReplacement.ops_choices).get(
                                record.ops_or_non_ops
                            )
                            if record.ops_or_non_ops
                            else None
                        ),
                        "non_ops_since": record.non_ops_since,
                        # Trials
                        "last_trials_taken": record.last_trials_taken,
                        "next_trials_due": record.next_trials_due,
                        # Running hours distribution
                        "hrs_run_below_33_percent": (record.hrs_run_below_33_percent),
                        "hrs_run_33_to_50_percent": (record.hrs_run_33_to_50_percent),
                        "hrs_run_50_to_70_percent": (record.hrs_run_50_to_70_percent),
                        "hrs_run_70_to_100_percent": (record.hrs_run_70_to_100_percent),
                        # Consumption
                        "lub_oil_consumption_in_month": (
                            record.lub_oil_consumption_in_month
                        ),
                        "fuel_consumption_in_month": (record.fuel_consumption_in_month),
                        # Calibration / replacement
                        "date_of_inj_fip_calibration": (
                            record.date_of_inj_fip_calibration
                        ),
                        "occasion": record.occasion,
                        "rh_at_which_replaced": (record.rh_at_which_replaced),
                        "running_hours_at_replaced": (record.running_hours_at_replaced),
                        # Running hours text fields
                        "running_hours_months": record.running_hours_months,
                        "running_hours_since_installation": (
                            record.running_hours_since_installation
                        ),
                        # Remarks
                        "remarks": record.remarks,
                    }
                )

            # =========================================================
            # TAB 8 : DGUF - FLATTENED DATA
            # =========================================================

            dgufs = []

            # Latest sea/harbour record
            sea_record = (
                DGUFSeaHarbourRunningHourDataInput.objects.filter(
                    srar_monthly_header=header
                )
                .order_by("-created_on")
                .first()
            )

            # Latest DGUF limits record
            limit = (
                DGUFLimits.objects.filter(srar_monthly_header=header)
                .order_by("-created_on")
                .first()
            )

            # DGUF equipment records
            dguf_records = DGUF.objects.filter(
                srar_monthly_header=header
            ).select_related(
                "sfd_details",
                "sfd_details__equipment",
            )

            # Calculate common values once
            if limit:
                exceed_reason_sea = (
                    limit.exceed_reason_sea
                    if limit.exceed_reason_sea != "Any other"
                    else limit.other_exceed_reason_sea
                )

                exceed_reason_harbour = (
                    limit.exceed_reason_harbour
                    if limit.exceed_reason_harbour != "Any other"
                    else limit.other_exceed_reason_harbour
                )
            else:
                exceed_reason_sea = None
                exceed_reason_harbour = None

            for dguf in dguf_records:
                sfd = dguf.sfd_details

                dgufs.append(
                    {
                        # Identity
                        "equipment_universal_id": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "serial_no": dguf.serial_no,
                        "da_number": dguf.da_number,
                        # DGUF
                        "rh_at_sea_and_anchorage": (dguf.rh_at_sea_and_anchorage),
                        "rh_at_port": dguf.rh_at_port,
                        "total_rh_in_month": dguf.total_rh_in_month,
                        # Sea / Harbour
                        "total_rh_at_sea": (
                            sea_record.total_rh_at_sea if sea_record else None
                        ),
                        "hours_underway": (
                            sea_record.hours_underway if sea_record else None
                        ),
                        "anchorage": (sea_record.anchorage if sea_record else None),
                        "drifting": (sea_record.drifting if sea_record else None),
                        "no_of_hours_in_harbour": (
                            sea_record.no_of_hours_in_harbour if sea_record else None
                        ),
                        "hours_shore_supply_avl_when_alongs": (
                            sea_record.hours_shore_supply_avl_when_alongs
                            if sea_record
                            else None
                        ),
                        "no_of_cold_moves_in_harbour": (
                            sea_record.no_of_cold_moves_in_harbour
                            if sea_record
                            else None
                        ),
                        "cmts_wrt_to_non_avl_shore_supply": (
                            sea_record.cmts_wrt_to_non_avl_shore_supply
                            if sea_record
                            else None
                        ),
                        # DGUF Limits
                        "limiting_value_sea": (
                            limit.limiting_value_sea if limit else None
                        ),
                        "actual_dguf_sea": (limit.actual_dguf_sea if limit else None),
                        "exceed_reason_sea": exceed_reason_sea,
                        "limiting_value_harbour": (
                            limit.limiting_value_harbour if limit else None
                        ),
                        "actual_dguf_harbour": (
                            limit.actual_dguf_harbour if limit else None
                        ),
                        "exceed_reason_harbour": exceed_reason_harbour,
                    }
                )

            # =========================================================
            # TAB 9 : FULL POWER TRIALS - MAIN ENGINE
            # =========================================================

            tab_9_fpt_main_engine_json = []

            fpt_main = FullPowerTrialsMainEngine.objects.filter(
                srar_monthly_header=header
            )

            for fpt in fpt_main:
                tab_9_fpt_main_engine_json.append(
                    {
                        "id": fpt.id,
                        "srar_monthly_header_id": header.id,
                        "header_unique_id": universal_id,
                        "date": fpt.date,
                        "occasion_reason": fpt.occasion_reason,
                        "draught_fwd": fpt.draught_fwd,
                        "draught_aft": fpt.draught_aft,
                        "displacement": fpt.displacement,
                        "max_speed": fpt.max_speed,
                        "torsion_meter_reading": fpt.torsion_meter_reading,
                        "pending_dr_activities_reason": (
                            fpt.pending_dr_activities_reason
                        ),
                        "sea_state": fpt.sea_state,
                        "conducted_by": fpt.conducted_by,
                        "conducted_by_label": fpt.conducted_by,
                        "serial_no": fpt.serial_no,
                    }
                )

            # =========================================================
            # TAB 9 : FULL POWER TRIALS - EQUIPMENT WISE
            # =========================================================

            tab_9_fpt_equipment_json = []

            fpt_eq = FPTEquipmentWise.objects.filter(
                srar_monthly_header=header
            ).select_related(
                "sfd_details",
                "sfd_details__equipment",
                "fpt_main_engine",
            )

            for eq in fpt_eq:
                sfd = eq.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_9_fpt_equipment_json.append(
                    {
                        "id": eq.id,
                        "srar_monthly_header_id": header.id,
                        "header_unique_id": universal_id,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "fpt_main_engine_id": (
                            eq.fpt_main_engine.id if eq.fpt_main_engine else None
                        ),
                        "equipment_id": (sfd.id if sfd else None),
                        "serial_no": eq.serial_no,
                        "fuel_rack_dbr_max": eq.fuel_rack_dbr_max,
                        "marking_max": eq.marking_max,
                        "undertaken_on": eq.undertaken_on,
                        "pitch": eq.pitch,
                        "max_rpm": eq.max_rpm,
                        "rated_power": eq.rated_power,
                        "max_achieved_power": eq.max_achieved_power,
                        "remarks": eq.remarks,
                    }
                )

            # =========================================================
            # TAB 9 : FULL POWER TRIALS - DIESEL ALTERNATOR
            # =========================================================

            tab_9_fpt_diesel_alternator_json = []

            fpt_da = FPTDieselAlternators.objects.filter(
                srar_monthly_header=header
            ).select_related(
                "sfd_details",
                "sfd_details__equipment",
            )

            for da in fpt_da:
                sfd = da.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_9_fpt_diesel_alternator_json.append(
                    {
                        "id": da.id,
                        "srar_monthly_header_id": header.id,
                        "header_unique_id": universal_id,
                        "equipment_id": (sfd.id if sfd else None),
                        "serial_no": da.serial_no,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "date": da.date,
                        "occasion": da.occasion,
                        "rated_load": da.rated_load,
                        "max_load_achieved": da.max_load_achieved,
                        "conducted_by": da.conducted_by,
                        "conducted_by_label": da.conducted_by,
                        "last_ehm_trials_undertaken_on": (
                            da.last_ehm_trials_undertaken_on
                        ),
                        "remarks": da.remarks,
                    }
                )

            # =========================================================
            # TAB 10 : REDUCTION GEAR + GAS TURBINE
            # =========================================================

            tab_10_reduction_gear_exploitation_json = []
            tab_10_gas_turbine_exploitation_json = []
            tab_10_replacement = []
            tab_10_annual_SRMR = []

            # ---------------------------------------------------------
            # Reduction Gear Exploitation
            # ---------------------------------------------------------
            rg_records = ReductionGearExploitation.objects.filter(
                srar_monthly_header=header
            ).select_related("sfd_details__equipment")

            for rg in rg_records:
                sfd = rg.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_10_reduction_gear_exploitation_json.append(
                    {
                        "id": rg.id,
                        "srar_monthly_header_id": header.id,
                        "header_unique_id": universal_id,
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "serial_no": rg.serial_no,
                        "total_rh_in_month": rg.total_rh_in_month,
                        "total_rh_si": rg.total_rh_si,
                        "total_rh_regime1_in_month": rg.total_rh_regime1_in_month,
                        "total_rh_regime1_si": rg.total_rh_regime1_si,
                        "total_rh_regime2_in_month": rg.total_rh_regime2_in_month,
                        "total_rh_regime2_si": rg.total_rh_regime2_si,
                        "total_rh_regime3_in_month": rg.total_rh_regime3_in_month,
                        "total_rh_regime3_si": rg.total_rh_regime3_si,
                        "trailing_rh_in_month": rg.trailing_rh_in_month,
                        "trailing_rh_si": rg.trailing_rh_si,
                        "service_life_in_month": rg.service_life_in_month,
                        "service_life_si": rg.service_life_si,
                        "no_of_eng_regime1_in_month": rg.no_of_eng_regime1_in_month,
                        "no_of_eng_regime1_si": rg.no_of_eng_regime1_si,
                        "no_of_eng_regime2_in_month": rg.no_of_eng_regime2_in_month,
                        "no_of_eng_regime2_si": rg.no_of_eng_regime2_si,
                        "no_of_eng_regime3_in_month": rg.no_of_eng_regime3_in_month,
                        "no_of_eng_regime3_si": rg.no_of_eng_regime3_si,
                        "no_of_eng_regime4_in_month": rg.no_of_eng_regime4_in_month,
                        "no_of_eng_regime4_si": rg.no_of_eng_regime4_si,
                    }
                )

            # ---------------------------------------------------------
            # Gas Turbine Exploitation
            # ---------------------------------------------------------
            gt_exploitations = GasTurbineExploitation.objects.filter(
                srar_monthly_header=header
            ).select_related("sfd_details__equipment", "rg_exploitation")

            for gt in gt_exploitations:
                sfd = gt.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_10_gas_turbine_exploitation_json.append(
                    {
                        "id": gt.id,
                        "srar_monthly_header_id": header.id,
                        "header_unique_id": universal_id,
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "serial_no": gt.serial_no,
                        "total_rh_in_month": gt.total_rh_in_month,
                        "total_rh_si": gt.total_rh_si,
                        "no_of_hot_starts_in_month": gt.no_of_hot_starts_in_month,
                        "no_of_hot_starts_si": gt.no_of_hot_starts_si,
                        "no_of_cold_starts_in_month": gt.no_of_cold_starts_in_month,
                        "no_of_cold_starts_si": gt.no_of_cold_starts_si,
                        "no_of_false_starts_in_month": gt.no_of_false_starts_in_month,
                        "no_of_false_starts_si": gt.no_of_false_starts_si,
                        "no_of_tech_starts_in_month": gt.no_of_tech_starts_in_month,
                        "no_of_tech_starts_si": gt.no_of_tech_starts_si,
                        "status": gt.status,
                        "non_ops_since": gt.non_ops_since,
                        "last_calibration_date_of_fitted_fuel_eqpt": (
                            gt.last_calibration_date_of_fitted_fuel_eqpt
                        ),
                        "last_ehm_trial_date": gt.last_ehm_trial_date,
                        "last_fpt_date": gt.last_fpt_date,
                        "fuel_eqpt_calibration_due_on": gt.fuel_eqpt_calibration_due_on,
                        "rh_regime_1_in_mth": gt.rh_regime_1_in_mth,
                        "rh_regime_1_si": gt.rh_regime_1_si,
                        "rh_regime_2_in_mth": gt.rh_regime_2_in_mth,
                        "rh_regime_2_si": gt.rh_regime_2_si,
                        "rh_regime_3_in_mth": gt.rh_regime_3_in_mth,
                        "rh_regime_3_si": gt.rh_regime_3_si,
                        "no_of_astern_engagements_in_mth": (
                            gt.no_of_astern_engagements_in_mth
                        ),
                        "no_of_astern_engagements_count": (
                            gt.no_of_astern_engagements_count
                        ),
                        "no_of_stop_orders_in_mth": gt.no_of_stop_orders_in_mth,
                        "no_of_stop_orders_si": gt.no_of_stop_orders_si,
                        "last_chem_clg": gt.last_chem_clg,
                    }
                )

            # ---------------------------------------------------------
            # Replacement Of Major Assemblies
            # ---------------------------------------------------------
            replacement_qs = ReplacementOfMajorAssemblies.objects.filter(
                srar_monthly_header=header
            ).select_related("sfd_details__equipment")

            for rep in replacement_qs:
                sfd = rep.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_10_replacement.append(
                    {
                        "section": "replacement_of_major_assemblies",
                        "id": rep.id,
                        "srar_monthly_header_id": header.id,
                        "header_unique_id": universal_id,
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "serial_no": rep.serial_no,
                        "date_of_replacement": rep.date_of_replacement,
                        "unit_sub_units": rep.unit_sub_units,
                        "reason_for_replacement": rep.reason_for_replacement,
                        "replacement_remarks": rep.replacement_remarks,
                    }
                )

            # ---------------------------------------------------------
            # Annual SRMR Routine Undertaken
            # ---------------------------------------------------------
            srmr_qs = AnnualSRMRRoutineUndertaken.objects.filter(
                srar_monthly_header=header
            ).select_related("equipment__equipment", "by_whom")

            for sr in srmr_qs:
                equipment_detail = sr.equipment
                equipment = equipment_detail.equipment if equipment_detail else None

                tab_10_annual_SRMR.append(
                    {
                        "section": "annual_srmr_routine",
                        "id": sr.id,
                        "srar_monthly_header_id": header.id,
                        "header_unique_id": universal_id,
                        "equipment_id": (
                            equipment_detail.id if equipment_detail else None
                        ),
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            equipment_detail.t_equipment_ship_detail
                            if equipment_detail
                            else None
                        ),
                        "serial_no": sr.serial_no,
                        "date": sr.date,
                        "description_of_routine": sr.description_of_routine,
                        # "by_whom": sr.by_whom.id if sr.by_whom else None,
                        # "by_whom_name": sr.by_whom.username if sr.by_whom else None,
                    }
                )

            # =========================================================
            # TAB 11 : GAS TURBINE GENERATOR
            # =========================================================

            tab_11_gtg_exploitation_json = []
            tab_11_gtg_guf_json = []
            tab_11_gtg_rg_exploitation_json = []
            tab_11_gtg_replacement_json = []
            tab_11_gtg_srmr_json = []

            # ---------------------------------------------------------
            # 1. Gas Turbine Generator Exploitation
            # ---------------------------------------------------------
            gtg_exploitations = GasTurbineGeneratorExploitation.objects.filter(
                srar_monthly_header=header
            ).select_related("sfd_details__equipment")

            for gtg in gtg_exploitations:
                sfd = gtg.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_11_gtg_exploitation_json.append(
                    {
                        "id": gtg.id,
                        "srar_monthly_header_id": header.id,
                        "header_unique_id": universal_id,
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "serial_no": gtg.serial_no,
                        "date": gtg.date,
                        "total_rh_in_month": gtg.total_rh_in_month,
                        "total_rh_si": gtg.total_rh_si,
                        "total_rh_in_harbour": gtg.total_rh_in_harbour,
                        "total_rh_in_sea": gtg.total_rh_in_sea,
                        "no_of_hot_starts_in_month": gtg.no_of_hot_starts_in_month,
                        "no_of_hot_starts_in_si": gtg.no_of_hot_starts_si,
                        "no_of_cold_starts_in_month": gtg.no_of_cold_starts_in_month,
                        "no_of_cold_starts_in_si": gtg.no_of_cold_starts_si,
                        "no_of_battery_cold_starts_in_month": (
                            gtg.no_of_battery_cold_starts_in_month
                        ),
                        # Model field is no_of_battery_cold_starts_si — reading
                        # ..._in_si raised AttributeError and killed the whole push for
                        # any return that had a GTG row.
                        "no_of_battery_cold_starts_in_si": (
                            gtg.no_of_battery_cold_starts_si
                        ),
                        "no_of_battery_hot_starts_in_month": (
                            gtg.no_of_battery_hot_starts_in_month
                        ),
                        "no_of_battery_hot_starts_in_si": (
                            gtg.no_of_battery_hot_starts_si
                        ),
                    }
                )

            # ---------------------------------------------------------
            # 2. GTG GUF Entry
            # ---------------------------------------------------------
            guf_entries = GasTurbineGeneratorExploitationGufEntry.objects.filter(
                srar_monthly_header=header
            )

            for guf in guf_entries:
                tab_11_gtg_guf_json.append(
                    {
                        "id": guf.id,
                        "srar_monthly_header_id": header.id,
                        "header_unique_id": universal_id,
                        "guf_sea": guf.guf_sea,
                        "reason_exceed_sea": guf.reason_exceed_sea,
                        "guf_hbr": guf.guf_hbr,
                        "reason_exceed_hbr": guf.reason_exceed_hbr,
                    }
                )

            # ---------------------------------------------------------
            # 3. Reduction Gear Exploitation of GTG
            # ---------------------------------------------------------
            rg_gtg_records = ReductionGearExploitationofGTG.objects.filter(
                srar_monthly_header=header
            ).select_related("sfd_details__equipment")

            for rg in rg_gtg_records:
                sfd = rg.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_11_gtg_rg_exploitation_json.append(
                    {
                        "id": rg.id,
                        "srar_monthly_header_id": header.id,
                        "header_unique_id": universal_id,
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "serial_no": rg.serial_no,
                        "rg_running_hours": rg.rg_running_hours,
                        "no_of_hot_starts": rg.no_of_hot_starts,
                        "no_of_cold_starts": rg.no_of_cold_starts,
                        "rh_in_harbour": rg.rh_in_harbour,
                        "rh_in_sea": rg.rh_in_sea,
                        "in_months_si": rg.in_months_si,
                    }
                )

            # ---------------------------------------------------------
            # 4. Replacement of Major Assemblies (GTG)
            # ---------------------------------------------------------
            gtg_replacements = ReplacementOfMajorAssembliesofGTG.objects.filter(
                srar_monthly_header=header
            ).select_related("sfd_details__equipment")

            for rep in gtg_replacements:
                sfd = rep.sfd_details
                equipment = sfd.equipment if sfd else None

                tab_11_gtg_replacement_json.append(
                    {
                        "id": rep.id,
                        "srar_monthly_header_id": header.id,
                        "header_unique_id": universal_id,
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "serial_no": rep.serial_no,
                        "date_of_replacement": rep.date,
                        "unit_sub_units": rep.unit_sub_units,
                        "reason_for_replacement": rep.reason_for_replacement,
                        "replacement_remarks": rep.replacement_remarks,
                    }
                )

            # ---------------------------------------------------------
            # 5. Annual SRMR Routine Undertaken (GTG)
            # ---------------------------------------------------------
            gtg_srmr_records = AnnualSRMRRoutineUndertakenofGTG.objects.filter(
                srar_monthly_header=header
            ).select_related("equipment", "by_whom")

            for srmr in gtg_srmr_records:
                equipment = srmr.equipment

                tab_11_gtg_srmr_json.append(
                    {
                        "id": srmr.id,
                        "srar_monthly_header_id": header.id,
                        "header_unique_id": universal_id,
                        "t_equipment_ship_detail": (
                            equipment.t_equipment_ship_detail if equipment else None
                        ),
                        "equipment_id": (equipment.id if equipment else None),
                        "serial_no": srmr.serial_no,
                        "date": srmr.date,
                        "description_of_routine": srmr.description_of_routine,
                        # "by_whom_id": srmr.by_whom.id if srmr.by_whom else None,
                        # "by_whom_name": (
                        #     srmr.by_whom.get_full_name()
                        #     if srmr.by_whom else None
                        # ),
                    }
                )

            # =========================================================
            # TAB 12 : MONTHLY LUBRICANT DETAILS
            # =========================================================

            tab_12_lubricant_json = []

            lubricant_records = SrarMonthlyLubricant.objects.filter(
                srar_monthly_header=header
            ).select_related("lubricant")

            for lub in lubricant_records:
                lubricant = lub.lubricant

                tab_12_lubricant_json.append(
                    {
                        "id": lub.id,
                        "universal_id": (
                            lubricant.Universal_ID_M_Lubricant if lubricant else None
                        ),
                        "srar_monthly_header_id": header.id,
                        "header_unique_id": universal_id,
                        "serial_no": lub.serial_no,
                        "lubricant_name": (
                            lubricant.LubricantName if lubricant else None
                        ),
                        "quantity": lub.quantity,
                        "unit": lub.unit,
                    }
                )

            # =========================================================
            # TAB 13 : RH EXTENSION
            # =========================================================

            tab_13_rh_extension_json = []

            rh_extension_records = RHExtension.objects.filter(
                srar_monthly_header=header
            ).select_related("sfd_details__equipment", "on_routine")

            for rh in rh_extension_records:
                sfd = rh.sfd_details
                equipment = sfd.equipment if sfd else None
                frequency = rh.on_routine

                tab_13_rh_extension_json.append(
                    {
                        "id": rh.id,
                        "srar_monthly_header_id": header.id,
                        "header_unique_id": universal_id,
                        "equipment_id": sfd.id if sfd else None,
                        "m_equipment_id": (
                            equipment.universal_id_m_equipment if equipment else None
                        ),
                        "t_equipment_ship_detail": (
                            sfd.t_equipment_ship_detail if sfd else None
                        ),
                        "serial_no": rh.serial_no,
                        "equipment_type": rh.equipment_type,
                        "total_rh_in_month": rh.total_rh_in_month,
                        "on_routine": (frequency.frequency if frequency else None),
                        # The stored label. Rows saved before Step 13 got its dropdown
                        # carry free text here with no Frequency FK behind it, so without
                        # this the routine they were on is lost on the way to CMMS.
                        "on_routine_text": rh.on_routine_text,
                        "rh_ext_at_conduct_of_ext_trial": (
                            rh.rh_ext_at_conduct_of_ext_trial
                        ),
                        "authority_letter_for_extension_trial": (
                            rh.authority_letter_for_extension_trial
                        ),
                        "rh_extension_granted_upto": rh.rh_extension_granted_upto,
                        "rh_left_for_expiry_of_extension": (
                            rh.rh_left_for_expiry_of_extension
                        ),
                        # Filled on screen (Step 13 "Ext.Trial By") and stored, but never
                        # part of this payload.
                        "trial_conducted_by": rh.trial_conducted_by,
                        "Frequency_id": (
                            frequency.universal_id_m_frequency if frequency else None
                        ),
                    }
                )

            # =========================================================
            # TAB 14 : EEF
            # =========================================================

            tab_14_eef_json = []

            eef_records = EEF.objects.filter(srar_monthly_header=header)

            eef_reason_choices = dict(EEF.REASON_CHOICES)

            for eef in eef_records:
                tab_14_eef_json.append(
                    {
                        "id": eef.id,
                        "srar_monthly_header_id": header.id,
                        "header_unique_id": universal_id,
                        "serial_no": eef.serial_no,
                        "designed": eef.designed,
                        "actual": eef.actual,
                        "reason_for_exceeding": eef.reason_for_exceeding,
                        "reason_for_exceeding_label": (
                            eef_reason_choices.get(eef.reason_for_exceeding)
                        ),
                        "ship_remarks": eef.ship_remarks,
                    }
                )

            # =========================================================
            # FINAL PAYLOAD
            # =========================================================

            # Deliberately NOT in this payload:
            #
            #   * DieselReductionGearExploitation (the form's tab_7_diesel_reduction_gear).
            #     It is real, ship-entered data, but CMMS's /api/srar/save-srar/ receiver
            #     has no agreed key for it and inventing one would silently drop the
            #     section on their side while looking like it had been sent. Held back on
            #     purpose until CMMS supplies the key — do not guess one.
            #   * SrarMonthlyShipRunning (days at sea / harbour). CMMS-origin data: the
            #     pull writes it and every row is data_source="cmms", so CMMS is the
            #     source of truth and there is nothing to send back.
            #   * GTGParameters, GTGrecordOfCleaningServiceTank, EquipmentRoutineDueOn,
            #     SrarAdjustment. save_srar_report accepts keys for these, but the SRAR
            #     form never sends them, so they hold no data to push.
            payload = {
                "header": header_json,
                "tab_1_equipment_exploitations": equipment_explotion_data_json,
                "tab_2_boiler_data": tab_2_boiler_data,
                "tab_2_boiler_steaming_details": tab_2_boiler_tab_data_json,
                "tab_2_boiler_alkalinity_salinity_data": (
                    tab_2_boiler_alkalinity_salinity_data_json
                ),
                "tab_3_ship_activity_details": (tab_3_ship_activity_details_json),
                "tab_4_fuel_consumption_months": (tab4_fuel_consumption_month_json),
                "tab_4_avcat_status_data": tab_4_avcat_status_json,
                "tab_4_torsion_meter_data": tab_4_torsion_meter_json,
                "tab_5_iccp_data": tab_iccp_json,
                "tab_5_h2s_sensor_data": tab_h2s_sensor_json,
                "tab_5_stp_data": tab_stp_json,
                "tab_5_magazine_ff_system_data": (tab_magazine_ff_system_json),
                "tab_6_centrifuge_data": tab_centrifuge_json,
                "tab_6_lub_oil_coolant_test_kits_data": (
                    tab_lub_oil_coolant_test_kits_json
                ),
                "tab_7_safety_device_check_trial": (
                    tab_7_safety_device_check_trial_json
                ),
                "tab_7_injector_fip_calibration_replacement": (tab_7_injector_fip_json),
                "tab_8_dguf_data": dgufs,
                # "tab_8_dguf_sea_harbour_data": tab_8_dguf_sea_harbour_json,
                # "tab_8_dguf_limits_data": tab_8_dguf_limits_json,
                "tab_9_fpt_main_engine": tab_9_fpt_main_engine_json,
                "tab_9_fpt_equipment": tab_9_fpt_equipment_json,
                "tab_9_fpt_diesel_alternator": (tab_9_fpt_diesel_alternator_json),
                "tab_10_reduction_gear_exploitation": (
                    tab_10_reduction_gear_exploitation_json
                ),
                "tab_10_gas_turbine_exploitation": (
                    tab_10_gas_turbine_exploitation_json
                ),
                "tab_10_annual_SRMR": tab_10_annual_SRMR,
                "tab_10_replacement": tab_10_replacement,
                "tab_11_gtg_exploitation": (tab_11_gtg_exploitation_json),
                "tab_11_gtg_guf": tab_11_gtg_guf_json,
                "tab_11_gtg_reduction_gear": (tab_11_gtg_rg_exploitation_json),
                "tab_11_gtg_replacement": (tab_11_gtg_replacement_json),
                "tab_11_gtg_srmr": tab_11_gtg_srmr_json,
                "tab_12_monthly_lubricant": tab_12_lubricant_json,
                "tab_13_rh_extension": tab_13_rh_extension_json,
                "tab_14_eef": tab_14_eef_json,
            }

            # =========================================================
            # JSON SERIALIZATION
            # =========================================================

            json_data = json.dumps(
                payload, indent=4, ensure_ascii=False, cls=DjangoJSONEncoder
            )

            # =========================================================
            # SAVE JSON FILE
            # =========================================================

            with open("srar_payload.json", "w", encoding="utf-8") as f:
                f.write(json_data)

            if build_only:
                # SRARSyncByMonthYearAPIView calls this view only to *build* the payload
                # -- it POSTs to CMMS itself and owns the JSON response. Falling through
                # to the POST below would send the same return to CMMS twice per click,
                # and end in a redirect() that caller cannot use.
                #
                # The dict is handed back directly. That caller used to re-read
                # srar_payload.json to get it, which made a single fixed path in the
                # process's working directory the transport between two requests: two
                # ships (or two clicks) syncing at once would race, and whichever wrote
                # last decided what *both* pushed to CMMS. The file is still written
                # above, but now only as a debugging artefact.
                return payload

            # =========================================================
            # SEND DATA TO CMMS
            # =========================================================

            api_url = f"{API_URL}/api/srar/save-srar/"

            try:
                response = requests.post(
                    api_url,
                    data=json_data,
                    headers={"Content-Type": "application/json"},
                    timeout=8001,
                    verify=False,
                )

                try:
                    error_data = response.json()
                except ValueError:
                    error_data = {
                        "status": False,
                        "message": (
                            f"Invalid response from CMMS. "
                            f"HTTP Status: {response.status_code}"
                        ),
                    }

                if error_data.get("status") is False:
                    error_message = error_data.get(
                        "message", "Unable to send data to CMMS."
                    )

                    sweetify.error(
                        request,
                        title="",
                        icon="error",
                        text=error_message,
                        persistent=True,
                    )

                else:
                    sweetify.success(
                        request,
                        title="",
                        icon="success",
                        text="Data was successfully sent to CMMS",
                        persistent=True,
                    )

            except requests.RequestException as exc:
                sweetify.error(
                    request,
                    title="",
                    icon="error",
                    text=f"Unable to connect to CMMS: {str(exc)}",
                    persistent=True,
                )

        except requests.RequestException as exc:
            sweetify.error(
                request,
                title="",
                icon="error",
                text=f"Unable to connect to CMMS: {str(exc)}",
                persistent=True,
            )
        return redirect("/srar/sraradd/")


# ==============================================================================
# CMMS SRAR SYNC BY MONTH & YEAR Ã¢â‚¬â€ Angular-Compatible JSON API
# ==============================================================================


def _push_target_is_self(request, api_base):
    """True when SWMM_API_URL addresses the instance that is serving this request.

    The SRAR/dart pushes POST to `{SWMM_API_URL}/api/.../`, and those paths belong to this
    same codebase — the setting is meant to name a *peer* SWMM deployment. When it names
    this one (the shipped .env has http://localhost:8000) the push is a loop: the payload
    is written back into the local database and answered with 200, which reads as success.
    Compared on host and port only, so http/https and a trailing slash do not matter.
    """
    from urllib.parse import urlparse

    target = urlparse((api_base or "").strip())
    target_host = (target.hostname or "").lower()
    if not target_host:
        return False

    LOOPBACK = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}
    try:
        own_host = (request.get_host() or "").lower()
    except Exception:
        own_host = ""
    own_name, _, own_port = own_host.partition(":")

    target_port = str(target.port or ("443" if target.scheme == "https" else "80"))
    own_port = own_port or "80"

    # Loopback on both sides is the common misconfiguration and needs no port match:
    # whatever port it names, it is this machine talking to itself.
    if target_host in LOOPBACK and (own_name in LOOPBACK or not own_name):
        return True
    return target_host == own_name and target_port == own_port


class SRARSyncByMonthYearAPIView(APIView):
    """
    Angular-compatible SRAR Ã¢â€ â€™ CMMS sync endpoint.

    Accepts GET with query params:
        ?month=August&year=2026   (month can be name or number)

    1. Resolves SrarMonthlyHeader for the given month/year.
    2. Generates a signed pk (same as SRARSyncAPIView expects).
    3. Calls SRARSyncAPIView.get() internally which builds + POSTs to CMMS,
       and saves payload to srar_payload.json.
    4. Reads result and returns JSON { status, message } Ã¢â‚¬â€ no redirect/sweetify.
    """

    MONTH_MAP = {
        "january": 1,
        "february": 2,
        "march": 3,
        "april": 4,
        "may": 5,
        "june": 6,
        "july": 7,
        "august": 8,
        "september": 9,
        "october": 10,
        "november": 11,
        "december": 12,
        "jan": 1,
        "feb": 2,
        "mar": 3,
        "apr": 4,
        "jun": 6,
        "jul": 7,
        "aug": 8,
        "sep": 9,
        "oct": 10,
        "nov": 11,
        "dec": 12,
    }

    def get(self, request):
        month_param = request.query_params.get("month", "").strip()
        year_param = request.query_params.get("year", "").strip()

        # Ã¢â€â‚¬Ã¢â€â‚¬ Validate params Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        if not month_param or not year_param:
            return Response(
                {
                    "status": False,
                    "message": "Both 'month' and 'year' query parameters are required.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if month_param.isdigit():
            month_num = int(month_param)
        else:
            month_num = self.MONTH_MAP.get(month_param.lower())

        if not month_num or month_num < 1 or month_num > 12:
            return Response(
                {"status": False, "message": f"Invalid month value: '{month_param}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            year_num = int(year_param)
        except ValueError:
            return Response(
                {"status": False, "message": f"Invalid year value: '{year_param}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Ã¢â€â‚¬Ã¢â€â‚¬ Find SrarMonthlyHeader Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        try:
            header = (
                SrarMonthlyHeader.objects.filter(
                    srar_month=month_num, srar_year=year_num
                )
                .order_by("-id")
                .first()
            )
        except Exception as exc:
            return Response(
                {"status": False, "message": f"Database error: {str(exc)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # `mode=push` means "send this return to CMMS and nothing else". Without it the
        # endpoint auto-picks a direction from cmms_sync_status, and a return the CO has
        # just approved is by definition not yet synced -- so the auto-pick sent it down
        # the first-time PULL branch, which overwrites SWMM from CMMS and then marks the
        # header synced without the ship's data ever having been pushed. The one caller
        # that needs a push (the CO's post-approval sync button) states it outright.
        mode = str(request.query_params.get("mode") or "").strip().lower()

        is_first_time = mode != "push" and (
            (header is None) or not bool(getattr(header, "cmms_sync_status", False))
        )

        if mode == "push" and header is None:
            return Response(
                {
                    "status": False,
                    "message": (
                        f"No SRAR return found for {month_param} {year_num} to push to CMMS."
                    ),
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # =========================================================================
        # STRATEGY 1: FIRST TIME SYNC (new DB / header missing / unsynced) -> PULL FROM CMMS
        # =========================================================================
        if is_first_time:
            logger.info(
                f"First-time SRAR sync detected for {month_param} {year_num}. Executing PULL from CMMS..."
            )
            pull_view = SRARPullFromCMMSAPIView()
            pull_resp = pull_view.get(request)

            # That view answers with a StreamingHttpResponse of tagged log lines, which has
            # no `.data` at all -- reading one raised AttributeError and turned every
            # first-time SRAR sync into a 500. Draining it is also what *runs* the pull: the
            # response is generator-backed, so nothing happened until something consumed it.
            # Both together meant this branch pulled nothing, then crashed reporting on it --
            # and before the crash it had already stamped cmms_sync_status = True on the
            # header, marking the month synced over a pull that never took place.
            pull_log = ""
            if getattr(pull_resp, "streaming", False):
                pull_log = "".join(
                    chunk.decode("utf-8", "replace")
                    if isinstance(chunk, bytes)
                    else str(chunk)
                    for chunk in pull_resp.streaming_content
                )
                fatal = next(
                    (
                        line.strip()
                        for line in pull_log.splitlines()
                        if "[FATAL]" in line or "[ERROR]" in line
                    ),
                    None,
                )
                pulled_ok = pull_resp.status_code == 200 and fatal is None
                details = {"log": pull_log}
            else:
                body = getattr(pull_resp, "data", None) or {}
                fatal = None if body.get("status", True) else body.get("message")
                pulled_ok = pull_resp.status_code == 200 and fatal is None
                details = body

            # Only a pull that actually landed may mark the month synced. Stamping it
            # regardless is what let a failed pull read as "already synced" forever after,
            # since that flag is exactly what is_first_time above tests.
            if pulled_ok:
                header_updated = (
                    SrarMonthlyHeader.objects.filter(
                        srar_month=month_num, srar_year=year_num
                    )
                    .order_by("-id")
                    .first()
                )
                if header_updated:
                    header_updated.cmms_sync_status = True
                    header_updated.save(update_fields=["cmms_sync_status"])

            return Response(
                {
                    "status": pulled_ok,
                    "message": (
                        f"First-time sync completed: SRAR data for {month_param} "
                        f"{year_num} successfully pulled from CMMS into SWMM DB."
                        if pulled_ok
                        else (
                            f"First-time SRAR pull for {month_param} {year_num} failed: "
                            f"{fatal or 'CMMS returned no usable data'}"
                        )
                    ),
                    "sync_type": "PULL",
                    "details": details,
                    "cmms_sync_status": pulled_ok,
                },
                status=(
                    pull_resp.status_code
                    if pulled_ok
                    else status.HTTP_502_BAD_GATEWAY
                ),
            )

        # Ã¢â€â‚¬Ã¢â€â‚¬ Generate signed pk Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        # Shared with report/finalize's approval check so "who counts as CO" is answered
        # in exactly one place -- an inline role-name comparison here would drift from it
        # the same way finalize's did.
        if not rbac.is_co_role(request.user):
            return Response(
                {
                    "status": False,
                    "message": "Only CO login can sync SRAR data to CMMS.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if not getattr(header, "co_approved", False):
            return Response(
                {
                    "status": False,
                    "message": "CO approval is required before syncing SRAR to CMMS.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Returns go to CMMS in period order. Nothing enforced that here, so a later
        # return could be pushed and stamped synced while an earlier one still sat CO
        # Approved & CMMS Sync Pending -- which is how 9/2026 came to read CMMS Synced
        # with 5/2024 pending behind it. The same rule guards raising a return in
        # srar.services.save_srar_report; both ask this one function.
        from srar.services import earliest_unsynced_prior_header

        blocking = earliest_unsynced_prior_header(
            getattr(header, "ship_id", None), month_num, year_num
        )
        if blocking is not None:
            return Response(
                {
                    "status": False,
                    "message": (
                        f"SRAR for {blocking.srar_month}/{blocking.srar_year} is still "
                        "pending CMMS sync. Returns must be synced in order."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        signed_pk = signing.dumps(header.id)

        # Ã¢â€â‚¬Ã¢â€â‚¬ Delegate to existing SRARSyncAPIView Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        # build_only stops the delegate after it has written srar_payload.json: the POST
        # to CMMS and the response belong to this view (see below), and letting the
        # delegate run its own POST too pushed the same return twice per click.
        #
        # The swap of sys.modules["sweetify"] that used to guard this call was removed --
        # it could never have worked. swmmapi.views binds `sweetify` as a module global at
        # import time, so the delegate reads that global and never consults sys.modules;
        # the swap suppressed nothing and only mutated global interpreter state. The
        # global is now a no-op stand-in at the top of this file, which is what actually
        # makes those legacy calls safe.
        try:
            sync_view = SRARSyncAPIView()
            built = sync_view.get(request, signed_pk, build_only=True)
        except Exception as exc:
            logger.exception("SRAR payload build failed for header %s", header.id)
            return Response(
                {"status": False, "message": f"Sync process error: {str(exc)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # The delegate answers with a Response instead of the payload when it bails out
        # early (bad signed pk, header or ship not found) -- pass its own message through
        # rather than reporting a generic build failure.
        if isinstance(built, Response):
            return built
        if not isinstance(built, dict):
            return Response(
                {"status": False, "message": "SRAR payload build produced no data."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        # The built payload is kept for the debugging artefact only; the write itself goes
        # straight to CMMS over MSSQL. See srar.cmms_push for why: the old HTTP POST went
        # to `{SWMM_API_URL}/api/srar/save-srar/`, a route of this same codebase, so the
        # return was written back into SWMM and answered 200 while CMMS stayed empty.
        _ = built

        from srar.cmms_push import CmmsPushError, push_srar_return

        # Re-read before pushing: the build step above runs SRARSyncAPIView against its
        # own freshly-loaded copy of this header and writes to it (it mints and saves
        # universal_id_t_srar_mthly_header for a SWMM-raised return). `header` here was
        # loaded before that, so every field the build touched is stale in memory — which
        # is what made the first push of a new return fail on an identity that had just
        # been written to the database.
        header.refresh_from_db()

        actor = getattr(request.user, "user_profile", None)
        try:
            written = push_srar_return(header, actor=actor)
        except CmmsPushError as exc:
            return Response(
                {"status": False, "message": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Only stamped after CMMS has actually committed the return.
        SrarMonthlyHeader.objects.filter(id=header.id).update(
            cmms_sync_status=True,
            cmms_sync_date=timezone.now().date(),
        )

        return Response(
            {
                "status": True,
                "message": "SRAR return written to CMMS.",
                "srar_id": header.id,
                "month": month_param,
                "year": year_num,
                "cmms_sync_status": True,
                "universal_id": header.universal_id_t_srar_mthly_header,
                "tables_written": written,
            },
            status=status.HTTP_200_OK,
        )


# ==============================================================================
# CMMS SRAR DATA SAVE API
# ==============================================================================


class SRARDataSaveAPI(APIView):
    def get(self, request):
        """
        GET /api/srar/save-srar/?ship_code=L18&month=August&year=2026
        Returns SRAR payload JSON for specified month/year or all past data for ship.
        """
        from srar.models import (
            SrarMonthlyHeader,
            SrarEquipmentExploitation,
            SrarMonthlyBoiler,
            SrarMonthlyShipActivity,
            FuelConsumptionMonth,
            AvcatStatus,
            TorsionMeter,
            Iccp,
            H2SSensor,
            STP,
            MagazineFFSystemFloodingSystem,
            OpsStatusofLubOilandCoolantTestKits,
            SafetyDeviceCheckTrial,
            InjectorFIPCalibrationReplacement,
            DGUFSeaHarbourRunningHourDataInput,
            DGUFLimits,
            FullPowerTrialsMainEngine,
            FPTEquipmentWise,
            FPTDieselAlternators,
            GasTurbineExploitation,
            ReductionGearExploitation,
            GasTurbineGeneratorExploitation,
            GasTurbineGeneratorExploitationGufEntry,
            ReductionGearExploitationofGTG,
            ReplacementOfMajorAssemblies,
            ReplacementOfMajorAssembliesofGTG,
            AnnualSRMRRoutineUndertaken,
            AnnualSRMRRoutineUndertakenofGTG,
            RHExtension,
            SrarMonthlyLubricant,
            EEF,
        )

        ship_code = request.query_params.get("ship_code", "").strip()
        month_param = request.query_params.get("month", "").strip()
        year_param = request.query_params.get("year", "").strip()

        headers_qs = SrarMonthlyHeader.objects.all()
        if ship_code:
            headers_qs = headers_qs.filter(
                Q(ship__code__iexact=ship_code)
                | Q(ship__name__icontains=ship_code)
                | Q(ship__universal_id_m_ship__iexact=ship_code)
            )

        if month_param:
            if month_param.isdigit():
                headers_qs = headers_qs.filter(srar_month=int(month_param))
            else:
                m_map = {
                    "january": 1,
                    "february": 2,
                    "march": 3,
                    "april": 4,
                    "may": 5,
                    "june": 6,
                    "july": 7,
                    "august": 8,
                    "september": 9,
                    "october": 10,
                    "november": 11,
                    "december": 12,
                    "jan": 1,
                    "feb": 2,
                    "mar": 3,
                    "apr": 4,
                    "jun": 6,
                    "jul": 7,
                    "aug": 8,
                    "sep": 9,
                    "oct": 10,
                    "nov": 11,
                    "dec": 12,
                }
                m_num = m_map.get(month_param.lower())
                if m_num:
                    headers_qs = headers_qs.filter(srar_month=m_num)

        if year_param and year_param.isdigit():
            headers_qs = headers_qs.filter(srar_year=int(year_param))

        headers = list(headers_qs.order_by("-srar_year", "-srar_month"))

        if not headers:
            # Fallback to all headers
            fallback_qs = SrarMonthlyHeader.objects.all()
            if month_param and month_param.isdigit():
                fallback_qs = fallback_qs.filter(srar_month=int(month_param))
            if year_param and year_param.isdigit():
                fallback_qs = fallback_qs.filter(srar_year=int(year_param))
            headers = list(fallback_qs.order_by("-srar_year", "-srar_month"))

        if not headers:
            return Response(
                {
                    "status": False,
                    "message": f"No SRAR records found for ship '{ship_code}'.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        results = []
        for header in headers:
            h_data = {
                "id": header.id,
                "srar_month": header.srar_month,
                "srar_year": header.srar_year,
                "hours_underway_month_hr": header.hours_underway_month_hr,
                "hours_underway_month_min": header.hours_underway_month_min,
                "hours_underway_month_minutes": header.hours_underway_month_minutes,
                "distance_run_month": header.distance_run_month,
                "hours_underway_since_commissioning_hr": header.hours_underway_since_commissioning_hr,
                "distance_run_since_commissioning": header.distance_run_since_commissioning,
                "max_speed": header.max_speed,
                "max_duration": header.max_duration,
                "eo_name": header.eo_name,
                "eo_rank": header.eo_rank,
                "eo_personal_no": header.eo_personal_no,
                "eo_contact_no": header.eo_contact_no,
                "eo_writer_contact_no": header.eo_writer_contact_no,
                "is_saved": header.is_saved,
                "send_to_co": header.send_to_co,
                "co_approved": getattr(header, "co_approved", False),
                "cmms_sync_status": header.cmms_sync_status,
            }

            eq_list = list(
                SrarEquipmentExploitation.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            boiler_list = list(
                SrarMonthlyBoiler.objects.filter(srar_monthly_header=header).values()
            )
            act_list = list(
                SrarMonthlyShipActivity.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            fuel_list = list(
                FuelConsumptionMonth.objects.filter(srar_monthly_header=header).values()
            )
            avcat_list = list(
                AvcatStatus.objects.filter(srar_monthly_header=header).values()
            )
            torsion_list = list(
                TorsionMeter.objects.filter(srar_monthly_header=header).values()
            )
            iccp_list = list(Iccp.objects.filter(srar_monthly_header=header).values())
            h2s_list = list(
                H2SSensor.objects.filter(srar_monthly_header=header).values()
            )
            stp_list = list(STP.objects.filter(srar_monthly_header=header).values())
            mag_list = list(
                MagazineFFSystemFloodingSystem.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            test_list = list(
                OpsStatusofLubOilandCoolantTestKits.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            safety_list = list(
                SafetyDeviceCheckTrial.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            inj_list = list(
                InjectorFIPCalibrationReplacement.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            dguf_list = list(
                DGUFSeaHarbourRunningHourDataInput.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            fpt_me_list = list(
                FullPowerTrialsMainEngine.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            fpt_eq_list = list(
                FPTEquipmentWise.objects.filter(srar_monthly_header=header).values()
            )
            fpt_da_list = list(
                FPTDieselAlternators.objects.filter(srar_monthly_header=header).values()
            )
            gt_list = list(
                GasTurbineExploitation.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            rg_list = list(
                ReductionGearExploitation.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            gt_rep_list = list(
                ReplacementOfMajorAssemblies.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            gt_srmr_list = list(
                AnnualSRMRRoutineUndertaken.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            gtg_list = list(
                GasTurbineGeneratorExploitation.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            gtg_guf_list = list(
                GasTurbineGeneratorExploitationGufEntry.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            gtg_rg_list = list(
                ReductionGearExploitationofGTG.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            gtg_rep_list = list(
                ReplacementOfMajorAssembliesofGTG.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            gtg_srmr_list = list(
                AnnualSRMRRoutineUndertakenofGTG.objects.filter(
                    srar_monthly_header=header
                ).values()
            )
            lub_list = list(
                SrarMonthlyLubricant.objects.filter(srar_monthly_header=header).values()
            )
            rh_list = list(
                RHExtension.objects.filter(srar_monthly_header=header).values()
            )
            eef_list = list(EEF.objects.filter(srar_monthly_header=header).values())

            payload = {
                "header": h_data,
                "tab_1_equipment_exploitations": eq_list,
                "tab_2_boiler_data": boiler_list,
                "tab_3_ship_activity_details": act_list,
                "tab_4_fuel_consumption_months": fuel_list,
                "tab_4_avcat_status_data": avcat_list,
                "tab_4_torsion_meter_data": torsion_list,
                "tab_5_iccp_data": iccp_list,
                "tab_5_h2s_sensor_data": h2s_list,
                "tab_5_stp_data": stp_list,
                "tab_5_magazine_ff_system_data": mag_list,
                "tab_6_lub_oil_coolant_test_kits_data": test_list,
                "tab_7_safety_device_check_trial": safety_list,
                "tab_7_injector_fip_calibration_replacement": inj_list,
                "tab_8_dguf_data": dguf_list,
                "tab_9_fpt_main_engine": fpt_me_list,
                "tab_9_fpt_equipment": fpt_eq_list,
                "tab_9_fpt_diesel_alternator": fpt_da_list,
                "tab_10_gas_turbine_exploitation": gt_list,
                "tab_10_reduction_gear_exploitation": rg_list,
                "tab_10_replacement": gt_rep_list,
                "tab_10_annual_SRMR": gt_srmr_list,
                "tab_11_gtg_exploitation": gtg_list,
                "tab_11_gtg_guf": gtg_guf_list,
                "tab_11_gtg_reduction_gear": gtg_rg_list,
                "tab_11_gtg_replacement": gtg_rep_list,
                "tab_11_gtg_srmr": gtg_srmr_list,
                "tab_12_monthly_lubricant": lub_list,
                "tab_13_rh_extension": rh_list,
                "tab_14_eef": eef_list,
            }
            results.append(payload)

        if len(results) == 1 and month_param and year_param:
            return Response(results[0], status=status.HTTP_200_OK)
        return Response(
            {
                "status": True,
                "ship_code": ship_code,
                "count": len(results),
                "data": results,
            },
            status=status.HTTP_200_OK,
        )

    """
    API View to save complete SRAR return data using Django ORM models.
    All raw SQL has been converted to Django ORM update_or_create calls
    wrapped in a single @transaction.atomic block.
    """

    @transaction.atomic
    def post(self, request):
        from srar.models import (
            SrarMonthlyHeader,
            SrarEquipmentExploitation,
            SrarMonthlyBoiler,
            SrarMonthlyShipActivity,
            FuelConsumptionMonth,
            AvcatStatus,
            TorsionMeter,
            Iccp,
            H2SSensor,
            STP,
            MagazineFFSystemFloodingSystem,
            OpsStatusofLubOilandCoolantTestKits,
            SafetyDeviceCheckTrial,
            InjectorFIPCalibrationReplacement,
            DGUF,
            DGUFSeaHarbourRunningHourDataInput,
            DGUFLimits,
            FullPowerTrialsMainEngine,
            FPTEquipmentWise,
            FPTDieselAlternators,
            GasTurbineExploitation,
            ReductionGearExploitation,
            GasTurbineGeneratorExploitation,
            GasTurbineGeneratorExploitationGufEntry,
            ReductionGearExploitationofGTG,
            ReplacementOfMajorAssemblies,
            ReplacementOfMajorAssembliesofGTG,
            AnnualSRMRRoutineUndertaken,
            AnnualSRMRRoutineUndertakenofGTG,
            RHExtension,
            SrarMonthlyLubricant,
        )
        from sfd.models import ShipEquipment

        active_tab = "SrarMonthlyHeader"
        active_record_id = "unknown"

        try:
            # -----------------------------------------------------------------
            # Parse request payload
            # -----------------------------------------------------------------
            header = request.data.get("header", {})
            equipment_exploitations = request.data.get(
                "tab_1_equipment_exploitations", []
            )
            boiler_steaming_details = request.data.get("tab_2_boiler_data", [])
            ship_activity_details = request.data.get("tab_3_ship_activity_details", [])
            fuel_consumption_months_1 = request.data.get(
                "tab_4_fuel_consumption_months", []
            )
            fuel_consumption_months_2 = request.data.get("tab_4_avcat_status_data", [])
            fuel_consumption_months_3 = request.data.get("tab_4_torsion_meter_data", [])
            iccp_data_1 = request.data.get("tab_5_iccp_data", [])
            iccp_data_2 = request.data.get("tab_5_h2s_sensor_data", [])
            iccp_data_3 = request.data.get("tab_5_stp_data", [])
            iccp_data_4 = request.data.get("tab_5_magazine_ff_system_data", [])
            centrifuge_data_1 = request.data.get("tab_6_centrifuge_data", [])
            centrifuge_data_2 = request.data.get(
                "tab_6_lub_oil_coolant_test_kits_data", []
            )
            safety_device_check_trial_1 = request.data.get(
                "tab_7_safety_device_check_trial", []
            )
            safety_device_check_trial_2 = request.data.get(
                "tab_7_injector_fip_calibration_replacement", []
            )
            dgufs = request.data.get("tab_8_dguf_data", [])
            fpt_main_engine = request.data.get("tab_9_fpt_main_engine", [])
            fpt_equipment = request.data.get("tab_9_fpt_equipment", [])
            fpt_main_engine_3 = request.data.get("tab_9_fpt_diesel_alternator", [])
            gtg_exploitation = request.data.get("tab_11_gtg_exploitation", [])
            gtg_guf = request.data.get("tab_11_gtg_guf", [])
            gtg_reduction_gear = request.data.get("tab_11_gtg_reduction_gear", [])
            reduction_gear_exploitation = request.data.get(
                "tab_10_reduction_gear_exploitation", []
            )
            gas_turbine_exploitation = request.data.get(
                "tab_10_gas_turbine_exploitation", []
            )
            gt_tab_10_replacement = request.data.get("tab_10_replacement", [])
            gtg_tab_11_replacement = request.data.get("tab_11_gtg_replacement", [])
            gt_tab_10_SRMR = request.data.get("tab_10_annual_SRMR", [])
            gtg_tab_11_SRMR = request.data.get("tab_11_gtg_srmr", [])
            rh_extension = request.data.get("tab_13_rh_extension", [])
            monthly_lubricant = request.data.get("tab_12_monthly_lubricant", [])

            header_id = header["id"]
            universal_id = f"SWMM-{header_id}"
            active_record_id = universal_id

            # -----------------------------------------------------------------
            # Resolve header FK
            # -----------------------------------------------------------------
            header_obj = SrarMonthlyHeader.objects.filter(pk=header_id).first()
            if not header_obj:
                return Response(
                    {"status": False, "message": f"SRAR header {header_id} not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            # -----------------------------------------------------------------
            # Tab 1 â€“ Equipment Exploitation
            # -----------------------------------------------------------------
            active_tab = "SrarEquipmentExploitation"
            for ee in equipment_exploitations:
                active_record_id = f"SWMM-{ee.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=ee.get("t_equipment_ship_detail")
                ).first()
                SrarEquipmentExploitation.objects.update_or_create(
                    pk=ee.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "hrs_for_month": ee.get("hrs_for_month"),
                        "hrs_for_month_hrs": ee.get("running_hour_at_sea"),
                        "hrs_for_month_min": ee.get("running_hour_at_harbour"),
                        "rhsi_till_prev_month": ee.get("rhsi_till_prev_month"),
                        "rhsi_till_current_month": ee.get("rhsi_till_current_month"),
                        # Arrived over the CMMS integration endpoint — see
                        # srar.models.CmmsProvenance.
                        "data_source": "cmms",
                    },
                )

            # -----------------------------------------------------------------
            # Tab 2 â€“ Boiler Steaming
            # -----------------------------------------------------------------
            active_tab = "SrarMonthlyBoiler"
            for bd in boiler_steaming_details:
                active_record_id = f"SWMM-{bd.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=bd.get("t_equipment_ship_detail")
                ).first()
                SrarMonthlyBoiler.objects.update_or_create(
                    pk=bd.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "name": bd.get("name"),
                        "serial_no": bd.get("serial_no"),
                        "hrs_steamed_in_month": bd.get("hrs_steamed_in_month"),
                        "hrs_steamed_since_commissioning": bd.get(
                            "hrs_steamed_since_commissioning"
                        ),
                        "highest_salinity_during_month": bd.get(
                            "highest_salinity_during_month"
                        ),
                        "lowest_salinity_during_month": bd.get(
                            "lowest_salinity_during_month"
                        ),
                        "hrs_above_20_percent": bd.get("hrs_above_20_percent"),
                        "last_int_clg_date": bd.get("last_int_clg_date") or None,
                        "hrs_steamed_since_last_int_clg": bd.get(
                            "hrs_steamed_since_last_int_clg"
                        ),
                        "last_ext_clg_date": bd.get("last_ext_clg_date") or None,
                        "hrs_steamed_since_last_ext_clg": bd.get(
                            "hrs_steamed_since_last_ext_clg"
                        ),
                        "last_retubing_date": bd.get("last_retubing_date") or None,
                        "hrs_steamed_since_last_retubing": bd.get(
                            "hrs_steamed_since_last_retubing"
                        ),
                        "date_of_last_durability_test": bd.get(
                            "date_of_last_durability_test"
                        )
                        or None,
                        "due_date_for_next_inspection": bd.get(
                            "due_date_for_next_inspection"
                        )
                        or None,
                        "life_assessed_in_months": bd.get("life_assessed_in_months"),
                    },
                )

            # -----------------------------------------------------------------
            # Tab 3 â€“ Ship Activity
            # -----------------------------------------------------------------
            active_tab = "SrarMonthlyShipActivity"
            for sa in ship_activity_details:
                active_record_id = f"SWMM-{sa.get('id')}"
                SrarMonthlyShipActivity.objects.update_or_create(
                    pk=sa.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "from_date": sa.get("from_date") or None,
                        "to_date": sa.get("to_date") or None,
                        "serial_no": sa.get("serial_no"),
                        "remarks": sa.get("remarks"),
                    },
                )

            # -----------------------------------------------------------------
            # Tab 4 â€“ Fuel Consumption
            # -----------------------------------------------------------------
            active_tab = "FuelConsumptionMonth"
            for fc in fuel_consumption_months_1:
                active_record_id = f"SWMM-{fc.get('id')}"
                FuelConsumptionMonth.objects.update_or_create(
                    pk=fc.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "b_f_from_last_month": fc.get("b_f_from_last_month"),
                        "recieved": fc.get("recieved"),
                        "consumed_in_harbour": fc.get("consumed_in_harbour"),
                        "consumed_at_anchorage": fc.get("consumed_at_anchorage"),
                        "consumed_at_sea": fc.get("consumed_at_sea"),
                        "total_consumed": fc.get("total_consumed"),
                        "defueled": fc.get("defueled"),
                        "balance_left_on_board": fc.get("balance_left_on_board"),
                        "serial_no": fc.get("serial_no"),
                    },
                )

            # Tab 4 â€“ AVCAT Status
            active_tab = "AvcatStatus"
            for av in fuel_consumption_months_2:
                active_record_id = f"SWMM-{av.get('id')}"
                AvcatStatus.objects.update_or_create(
                    pk=av.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "b_f_from_last_month": av.get("b_f_from_last_month"),
                        "recieved": av.get("recieved"),
                        "given_to_ac": av.get("given_to_ac"),
                        "used_for_trials_drained": av.get("used_for_trials_drained"),
                        "total_consumed": av.get("total_consumed"),
                        "defuelded": av.get("defuelded"),
                        "balance_left_on_board": av.get("balance_left_on_board"),
                        "serial_no": av.get("serial_no"),
                    },
                )

            # Tab 4 â€“ Torsion Meter
            active_tab = "TorsionMeter"
            for tm in fuel_consumption_months_3:
                active_record_id = f"SWMM-{tm.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=tm.get("t_equipment_ship_detail")
                ).first()
                TorsionMeter.objects.update_or_create(
                    pk=tm.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "nomenclature": tm.get("nomenclature"),
                        "eqpt_code": tm.get("eqpt_code"),
                        "loc_on_board": tm.get("loc_on_board"),
                        "serial_no": tm.get("serial_no"),
                        "torsion_meter_rdg": tm.get("torsion_meter_rdg"),
                        "max_rpm_achieved": tm.get("max_rpm_achieved"),
                        "ops_or_non_ops": tm.get("ops_or_non_ops"),
                        "non_ops_since": tm.get("non_ops_since") or None,
                        "last_calibration_date": tm.get("last_calibration_date")
                        or None,
                        "next_calibration_date": tm.get("next_calibration_date")
                        or None,
                    },
                )

            # -----------------------------------------------------------------
            # Tab 5 â€“ ICCP
            # -----------------------------------------------------------------
            active_tab = "Iccp"
            for ic in iccp_data_1:
                active_record_id = f"SWMM-{ic.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=ic.get("t_equipment_ship_detail")
                ).first()
                Iccp.objects.update_or_create(
                    pk=ic.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "serial_no": ic.get("serial_no"),
                        "nomenclature": ic.get("nomenclature"),
                        "loc_on_board": ic.get("loc_on_board"),
                        "ops_or_non_ops": ic.get("ops_or_non_ops"),
                        "non_ops_since": ic.get("non_ops_since") or None,
                    },
                )

            # Tab 5 â€“ H2S Sensor
            active_tab = "H2SSensor"
            for h2 in iccp_data_2:
                active_record_id = f"SWMM-{h2.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=h2.get("t_equipment_ship_detail")
                ).first()
                H2SSensor.objects.update_or_create(
                    pk=h2.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "serial_no": h2.get("serial_no"),
                        "nomenclature": h2.get("nomenclature"),
                        "loc_on_board": h2.get("loc_on_board"),
                        "ops_or_non_ops": h2.get("ops_or_non_ops"),
                        "non_ops_since": h2.get("non_ops_since") or None,
                        "last_calibration_date": h2.get("last_calibration_date")
                        or None,
                        "next_calibration_date": h2.get("next_calibration_date")
                        or None,
                    },
                )

            # Tab 5 â€“ STP
            active_tab = "STP"
            for stp in iccp_data_3:
                active_record_id = f"SWMM-{stp.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=stp.get("t_equipment_ship_detail")
                ).first()
                STP.objects.update_or_create(
                    pk=stp.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "serial_no": stp.get("serial_no"),
                        "nomenclature": stp.get("nomenclature"),
                        "loc_on_board": stp.get("loc_on_board"),
                        "ops_or_non_ops": stp.get("ops_or_non_ops"),
                        "non_ops_since": stp.get("non_ops_since") or None,
                        "effluent_test_date": stp.get("effluent_test_date") or None,
                        "effluent_status": stp.get("effluent_status"),
                        "remarks": stp.get("remarks"),
                    },
                )

            # Tab 5 â€“ Magazine FF / Flooding System
            active_tab = "MagazineFFSystemFloodingSystem"
            for mf in iccp_data_4:
                active_record_id = f"SWMM-{mf.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=mf.get("t_equipment_ship_detail")
                ).first()
                MagazineFFSystemFloodingSystem.objects.update_or_create(
                    pk=mf.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "serial_no": mf.get("serial_no"),
                        "nomenclature": mf.get("nomenclature"),
                        "loc_on_board": mf.get("loc_on_board"),
                        "ops_or_non_ops": mf.get("ops_or_non_ops"),
                        "non_ops_since": mf.get("non_ops_since") or None,
                        "last_trials_taken": mf.get("last_trials_taken") or None,
                        "next_trials_due": mf.get("next_trials_due") or None,
                    },
                )

            # -----------------------------------------------------------------
            # Tab 6 â€“ Centrifuge (SrarCentrifuge â†’ OpsStatusofLubOilandCoolantTestKits)
            # -----------------------------------------------------------------
            active_tab = "OpsStatusofLubOilandCoolantTestKits (centrifuge)"
            for ced in centrifuge_data_1:
                active_record_id = f"SWMM-{ced.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=ced.get("t_equipment_ship_detail")
                ).first()
                OpsStatusofLubOilandCoolantTestKits.objects.update_or_create(
                    pk=ced.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "serial_no": ced.get("serial_no"),
                        "ops_or_non_ops": ced.get("ops_or_non_ops"),
                        "non_ops_since": ced.get("non_ops_since") or None,
                    },
                )

            # Tab 6 â€“ Lub Oil / Coolant Test Kits
            active_tab = "OpsStatusofLubOilandCoolantTestKits"
            for ced2 in centrifuge_data_2:
                active_record_id = f"SWMM-{ced2.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=ced2.get("t_equipment_ship_detail")
                ).first()
                OpsStatusofLubOilandCoolantTestKits.objects.update_or_create(
                    pk=ced2.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "description": ced2.get("description"),
                        "serial_no": ced2.get("serial_no"),
                        "ops_or_non_ops": ced2.get("ops_or_non_ops"),
                        "non_ops_since": ced2.get("non_ops_since") or None,
                        "last_trials_taken": ced2.get("last_trials_taken") or None,
                        "next_trials_due": ced2.get("next_trials_due") or None,
                        "calibration": ced2.get("calibration") or None,
                        "next_calibration_due_date": ced2.get(
                            "next_calibration_due_date"
                        )
                        or None,
                    },
                )

            # -----------------------------------------------------------------
            # Tab 7 â€“ Safety Device Check Trial
            # -----------------------------------------------------------------
            active_tab = "SafetyDeviceCheckTrial"
            for sd1 in safety_device_check_trial_1:
                equip_id = sd1.get("t_equipment_ship_detail")
                sdc_by = sd1.get("sdc_conducted_by")
                if not equip_id or not sdc_by:
                    continue
                active_record_id = f"SWMM-{sd1.get('id')}"
                sfd = ShipEquipment.objects.filter(pk=equip_id).first()
                SafetyDeviceCheckTrial.objects.update_or_create(
                    pk=sd1.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "sdc_conducted_by": sdc_by,
                        "date_of_sdc": sd1.get("date_of_sdc") or None,
                        "sfc_in_gm_kwh": sd1.get("sfc_in_gm_kwh"),
                        "last_sfc_trial_date": sd1.get("last_sfc_trial_date") or None,
                        "displacement_during_sfc_trial": sd1.get(
                            "displacement_during_sfc_trial"
                        ),
                        "status": sd1.get("status"),
                    },
                )

            # Tab 7 â€“ Injector / FIP Calibration Replacement
            active_tab = "InjectorFIPCalibrationReplacement"
            for sd2 in safety_device_check_trial_2:
                equip_id = sd2.get("t_equipment_ship_detail")
                if not equip_id:
                    continue
                active_record_id = f"SWMM-{sd2.get('id')}"
                sfd = ShipEquipment.objects.filter(pk=equip_id).first()
                InjectorFIPCalibrationReplacement.objects.update_or_create(
                    pk=sd2.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "hrs_run_below_33_percent": sd2.get("hrs_run_below_33_percent"),
                        "hrs_run_33_to_50_percent": sd2.get("hrs_run_33_to_50_percent"),
                        "hrs_run_50_to_70_percent": sd2.get("hrs_run_50_to_70_percent"),
                        "hrs_run_70_to_100_percent": sd2.get(
                            "hrs_run_70_to_100_percent"
                        ),
                        "lub_oil_consumption_in_month": sd2.get(
                            "lub_oil_consumption_in_month"
                        ),
                        "fuel_consumption_in_month": sd2.get(
                            "fuel_consumption_in_month"
                        ),
                        "date_of_inj_fip_calibration": sd2.get(
                            "date_of_inj_fip_calibration"
                        )
                        or None,
                        "occasion": sd2.get("occasion"),
                        "running_hours_at_replaced": sd2.get(
                            "running_hours_at_replaced"
                        ),
                        "running_hours_months": sd2.get("running_hours_months"),
                        "running_hours_since_installation": sd2.get(
                            "running_hours_since_installation"
                        ),
                        "remarks": sd2.get("remarks"),
                    },
                )

            # -----------------------------------------------------------------
            # Tab 8 â€“ DGUF Sea/Harbour Running Hours
            # -----------------------------------------------------------------
            active_tab = "DGUFSeaHarbourRunningHourDataInput"
            for dg in dgufs:
                active_record_id = f"SWMM-{dg.get('id')}"
                DGUFSeaHarbourRunningHourDataInput.objects.update_or_create(
                    pk=dg.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "hours_underway": dg.get("hours_underway"),
                        "total_rh_at_sea": dg.get("total_rh_at_sea"),
                        "anchorage": dg.get("anchorage"),
                        "no_of_hours_in_harbour": dg.get("no_of_hours_in_harbour"),
                        "hours_shore_supply_avl_when_alongs": dg.get(
                            "hours_shore_supply_avl_when_alongs"
                        ),
                        "no_of_cold_moves_in_harbour": dg.get(
                            "no_of_cold_moves_in_harbour"
                        ),
                        "cmts_wrt_to_non_avl_shore_supply": dg.get(
                            "cmts_wrt_to_non_avl_shore_supply"
                        ),
                    },
                )
                # DGUFLimits (exceed reasons)
                DGUFLimits.objects.update_or_create(
                    srar_monthly_header=header_obj,
                    defaults={
                        "actual_dguf_sea": dg.get("actual_dguf_sea"),
                        "actual_dguf_harbour": dg.get("actual_dguf_harbour"),
                        "exceed_reason_sea": dg.get("exceed_reason_sea"),
                        "exceed_reason_harbour": dg.get("exceed_reason_harbour"),
                    },
                )

            # -----------------------------------------------------------------
            # Tab 9 â€“ Full Power Trials: Main Engine header
            # -----------------------------------------------------------------
            active_tab = "FullPowerTrialsMainEngine"
            fpt_header_obj = None
            for eng in fpt_main_engine:
                active_record_id = f"SWMM-{eng.get('id')}"
                fpt_header_obj, _ = FullPowerTrialsMainEngine.objects.update_or_create(
                    pk=eng.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "date": eng.get("date") or None,
                        "occasion_reason": eng.get("occasion_reason"),
                        "draught_fwd": eng.get("draught_fwd"),
                        "draught_aft": eng.get("draught_aft"),
                        "displacement": eng.get("displacement"),
                        "max_speed": eng.get("max_speed"),
                        "conducted_by": eng.get("conducted_by"),
                        "torsion_meter_reading": eng.get("torsion_meter_reading"),
                        "sea_state": eng.get("sea_state"),
                        "pending_dr_activities_reason": eng.get(
                            "pending_dr_activities_reason"
                        ),
                    },
                )

            # Tab 9 â€“ FPT Equipment-wise
            active_tab = "FPTEquipmentWise"
            for equipment in fpt_equipment:
                active_record_id = f"SWMM-{equipment.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=equipment.get("t_equipment_ship_detail")
                ).first()
                FPTEquipmentWise.objects.update_or_create(
                    pk=equipment.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "fpt_main_engine": fpt_header_obj,
                        "sfd_details": sfd,
                        "fuel_rack_dbr_max": equipment.get("fuel_rack_dbr_max"),
                        "marking_max": equipment.get("marking_max"),
                        "undertaken_on": equipment.get("undertaken_on") or None,
                        "pitch": equipment.get("pitch"),
                        "max_rpm": equipment.get("max_rpm"),
                        "rated_power": equipment.get("rated_power"),
                        "max_achieved_power": equipment.get("max_achieved_power"),
                        "remarks": equipment.get("remarks"),
                    },
                )

            # Tab 9 â€“ FPT Diesel Alternators
            active_tab = "FPTDieselAlternators"
            for da in fpt_main_engine_3:
                active_record_id = f"SWMM-{da.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=da.get("t_equipment_ship_detail")
                ).first()
                FPTDieselAlternators.objects.update_or_create(
                    pk=da.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "date": da.get("date") or None,
                        "occasion": da.get("occasion"),
                        "rated_load": da.get("rated_load"),
                        "max_load_achieved": da.get("max_load_achieved"),
                        "conducted_by": da.get("conducted_by"),
                        "last_ehm_trials_undertaken_on": da.get(
                            "last_ehm_trials_undertaken_on"
                        )
                        or None,
                        "remarks": da.get("remarks"),
                    },
                )

            # -----------------------------------------------------------------
            # Tab 10 â€“ Gas Turbine Exploitation
            # -----------------------------------------------------------------
            active_tab = "GasTurbineExploitation"
            for gt in gas_turbine_exploitation:
                active_record_id = f"SWMM-{gt.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=gt.get("t_equipment_ship_detail")
                ).first()
                GasTurbineExploitation.objects.update_or_create(
                    pk=gt.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "total_rh_in_month": gt.get("total_rh_in_month"),
                        "total_rh_si": gt.get("total_rh_si"),
                        "no_of_hot_starts_in_month": gt.get(
                            "no_of_hot_starts_in_month"
                        ),
                        "no_of_hot_starts_si": gt.get("no_of_hot_starts_si"),
                        "no_of_cold_starts_in_month": gt.get(
                            "no_of_cold_starts_in_month"
                        ),
                        "no_of_cold_starts_si": gt.get("no_of_cold_starts_si"),
                        "no_of_false_starts_in_month": gt.get(
                            "no_of_false_starts_in_month"
                        ),
                        "no_of_false_starts_si": gt.get("no_of_false_starts_si"),
                        "no_of_tech_starts_in_month": gt.get(
                            "no_of_tech_starts_in_month"
                        ),
                        "no_of_tech_starts_si": gt.get("no_of_tech_starts_si"),
                        "no_of_astern_engagements_in_mth": gt.get(
                            "no_of_astern_engagements_in_mth"
                        ),
                        "no_of_astern_engagements_count": gt.get(
                            "no_of_astern_engagements_count"
                        ),
                        "no_of_stop_orders_in_mth": gt.get("no_of_stop_orders_in_mth"),
                        "no_of_stop_orders_si": gt.get("no_of_stop_orders_si"),
                        "rh_regime_1_in_mth": gt.get("rh_regime_1_in_mth"),
                        "rh_regime_1_si": gt.get("rh_regime_1_in_si"),
                        "rh_regime_2_in_mth": gt.get("rh_regime_2_in_mth"),
                        "rh_regime_2_si": gt.get("rh_regime_2_in_si"),
                        "rh_regime_3_in_mth": gt.get("rh_regime_3_in_mth"),
                        "rh_regime_3_si": gt.get("rh_regime_3_in_si"),
                        "last_chem_clg": gt.get("last_chem_clg") or None,
                    },
                )

            # Tab 10 â€“ Reduction Gear Exploitation
            active_tab = "ReductionGearExploitation"
            for rg in reduction_gear_exploitation:
                active_record_id = f"SWMM-{rg.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=rg.get("t_equipment_ship_detail")
                ).first()
                ReductionGearExploitation.objects.update_or_create(
                    pk=rg.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "total_rh_in_month": rg.get("total_rh_in_month"),
                        "total_rh_si": rg.get("total_rh_si"),
                        "total_rh_regime1_in_month": rg.get(
                            "total_rh_regime1_in_month"
                        ),
                        "total_rh_regime1_si": rg.get("total_rh_regime1_si"),
                        "total_rh_regime2_in_month": rg.get(
                            "total_rh_regime2_in_month"
                        ),
                        "total_rh_regime2_si": rg.get("total_rh_regime2_si"),
                        "total_rh_regime3_in_month": rg.get(
                            "total_rh_regime3_in_month"
                        ),
                        "total_rh_regime3_si": rg.get("total_rh_regime3_si"),
                        "trailing_rh_in_month": rg.get("trailing_rh_in_month"),
                        "trailing_rh_si": rg.get("trailing_rh_si"),
                        "service_life_in_month": rg.get("service_life_in_month"),
                        "service_life_si": rg.get("service_life_si"),
                        "no_of_eng_regime1_in_month": rg.get(
                            "no_of_eng_regime1_in_month"
                        ),
                        "no_of_eng_regime1_si": rg.get("no_of_eng_regime1_si"),
                        "no_of_eng_regime2_in_month": rg.get(
                            "no_of_eng_regime2_in_month"
                        ),
                        "no_of_eng_regime2_si": rg.get("no_of_eng_regime2_si"),
                        "no_of_eng_regime3_in_month": rg.get(
                            "no_of_eng_regime3_in_month"
                        ),
                        "no_of_eng_regime3_si": rg.get("no_of_eng_regime3_si"),
                        "no_of_eng_regime4_in_month": rg.get(
                            "no_of_eng_regime4_in_month"
                        ),
                        "no_of_eng_regime4_si": rg.get("no_of_eng_regime4_si"),
                    },
                )

            # Tab 10 â€“ Replacement of Major Assemblies (GT)
            active_tab = "ReplacementOfMajorAssemblies (GT)"
            for rep in gt_tab_10_replacement:
                equip_id = rep.get("t_equipment_ship_detail")
                if not equip_id:
                    continue
                active_record_id = f"SWMM-{rep.get('id')}"
                sfd = ShipEquipment.objects.filter(pk=equip_id).first()
                ReplacementOfMajorAssemblies.objects.update_or_create(
                    pk=rep.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "date_of_replacement": rep.get("date_of_replacement") or None,
                        "unit_sub_units": rep.get("unit_sub_units"),
                        "reason_for_replacement": rep.get("reason_for_replacement"),
                        "replacement_remarks": rep.get("replacement_remarks"),
                        "tab_value": "tab_10",
                    },
                )

            # Tab 10 â€“ Annual SRMR Routines
            active_tab = "AnnualSRMRRoutineUndertaken (GT)"
            for sr in gt_tab_10_SRMR:
                equip_id = sr.get("t_equipment_ship_detail")
                if not equip_id:
                    continue
                active_record_id = f"SWMM-{sr.get('id')}"
                sfd = ShipEquipment.objects.filter(pk=equip_id).first()
                AnnualSRMRRoutineUndertaken.objects.update_or_create(
                    pk=sr.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "equipment": sfd,
                        "date": sr.get("date") or None,
                        "description_of_routine": sr.get("description_of_routine"),
                        "tab_value": "tab_10",
                    },
                )

            # -----------------------------------------------------------------
            # Tab 11 â€“ GTG Exploitation
            # -----------------------------------------------------------------
            active_tab = "GasTurbineGeneratorExploitation"
            for gtg in gtg_exploitation:
                active_record_id = f"SWMM-{gtg.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=gtg.get("t_equipment_ship_detail")
                ).first()
                GasTurbineGeneratorExploitation.objects.update_or_create(
                    pk=gtg.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "total_rh_in_month": gtg.get("total_rh_in_month"),
                        "total_rh_si": gtg.get("total_rh_si"),
                        "total_rh_in_harbour": gtg.get("total_rh_in_harbour"),
                        "total_rh_in_sea": gtg.get("total_rh_in_sea"),
                        "no_of_hot_starts_in_month": gtg.get(
                            "no_of_hot_starts_in_month"
                        ),
                        "no_of_hot_starts_si": gtg.get("no_of_hot_starts_si"),
                        "no_of_cold_starts_in_month": gtg.get(
                            "no_of_cold_starts_in_month"
                        ),
                        "no_of_cold_starts_si": gtg.get("no_of_cold_starts_si"),
                        "no_of_battery_cold_starts_in_month": gtg.get(
                            "no_of_battery_cold_starts_in_month"
                        ),
                        "no_of_battery_cold_starts_si": gtg.get(
                            "no_of_battery_cold_starts_si"
                        ),
                        "no_of_battery_hot_starts_in_month": gtg.get(
                            "no_of_battery_hot_starts_in_month"
                        ),
                        "no_of_battery_hot_starts_si": gtg.get(
                            "no_of_battery_hot_starts_si"
                        ),
                    },
                )

            # Tab 11 â€“ GTG GUF (Utilization Factor)
            active_tab = "GasTurbineGeneratorExploitationGufEntry"
            if gtg_guf:
                guf = gtg_guf[0]
                GasTurbineGeneratorExploitationGufEntry.objects.update_or_create(
                    srar_monthly_header=header_obj,
                    defaults={
                        "guf_sea": guf.get("guf_sea", 0),
                        "reason_exceed_sea": str(guf.get("reason_exceed_sea", "4")),
                        "guf_hbr": guf.get("guf_hbr", 0),
                        "reason_exceed_hbr": str(guf.get("reason_exceed_hbr", "10")),
                    },
                )

            # Tab 11 â€“ GTG Reduction Gear
            active_tab = "ReductionGearExploitationofGTG"
            for rg in gtg_reduction_gear:
                active_record_id = f"SWMM-{rg.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=rg.get("t_equipment_ship_detail")
                ).first()
                ReductionGearExploitationofGTG.objects.update_or_create(
                    pk=rg.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "rg_running_hours": rg.get("rg_running_hours"),
                        "in_months_si": rg.get("in_months_si"),
                    },
                )

            # Tab 11 â€“ Replacement of Major Assemblies (GTG)
            active_tab = "ReplacementOfMajorAssembliesofGTG"
            for rep in gtg_tab_11_replacement:
                equip_id = rep.get("t_equipment_ship_detail")
                if not equip_id:
                    continue
                active_record_id = f"SWMM-{rep.get('id')}"
                sfd = ShipEquipment.objects.filter(pk=equip_id).first()
                ReplacementOfMajorAssembliesofGTG.objects.update_or_create(
                    pk=rep.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "date": rep.get("date_of_replacement") or None,
                        "unit_sub_units": rep.get("unit_sub_units"),
                        "reason_for_replacement": rep.get("reason_for_replacement"),
                        "replacement_remarks": rep.get("replacement_remarks"),
                    },
                )

            # Tab 11 â€“ Annual SRMR Routines (GTG)
            active_tab = "AnnualSRMRRoutineUndertakenofGTG"
            for sr in gtg_tab_11_SRMR:
                equip_id = sr.get("t_equipment_ship_detail")
                if not equip_id:
                    continue
                active_record_id = f"SWMM-2-{sr.get('id')}"
                sfd = ShipEquipment.objects.filter(pk=equip_id).first()
                AnnualSRMRRoutineUndertakenofGTG.objects.update_or_create(
                    pk=sr.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "equipment": sfd,
                        "date": sr.get("date") or None,
                        "description_of_routine": sr.get("description_of_routine"),
                    },
                )

            # -----------------------------------------------------------------
            # Tab 12 â€“ Monthly Lubricant Consumption
            # -----------------------------------------------------------------
            active_tab = "SrarMonthlyLubricant"
            for ml in monthly_lubricant:
                active_record_id = f"SWMM-{ml.get('id')}"
                SrarMonthlyLubricant.objects.update_or_create(
                    pk=ml.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "name": ml.get("name"),
                        "quantity": ml.get("quantity"),
                        "serial_no": ml.get("serial_no"),
                        "unit": ml.get("unit"),
                    },
                )

            # -----------------------------------------------------------------
            # Tab 13 â€“ RH Extension
            # -----------------------------------------------------------------
            active_tab = "RHExtension"
            for rh in rh_extension:
                active_record_id = f"SWMM-{rh.get('id')}"
                sfd = ShipEquipment.objects.filter(
                    pk=rh.get("t_equipment_ship_detail")
                ).first()
                RHExtension.objects.update_or_create(
                    pk=rh.get("id"),
                    defaults={
                        "srar_monthly_header": header_obj,
                        "sfd_details": sfd,
                        "rh_ext_at_conduct_of_ext_trial": rh.get(
                            "rh_ext_at_conduct_of_ext_trial"
                        ),
                        "authority_letter_for_extension_trial": rh.get(
                            "authority_letter_for_extension_trial"
                        ),
                        "rh_extension_granted_upto": rh.get(
                            "rh_extension_granted_upto"
                        ),
                        "rh_left_for_expiry_of_extension": rh.get(
                            "rh_left_for_expiry_of_extension"
                        ),
                        "equipment_type": rh.get("equipment_type"),
                    },
                )

            # -----------------------------------------------------------------
            # All tabs saved successfully
            # -----------------------------------------------------------------
            return Response(
                {
                    "status": True,
                    "message": "SRAR data saved successfully",
                    "universal_id": universal_id,
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception as exc:
            logger.error(
                "SRAR save failed at Tab: %s, Record: %s. Error: %s",
                active_tab,
                active_record_id,
                str(exc),
                exc_info=True,
            )
            return Response(
                {
                    "status": False,
                    "message": f"Failed to save SRAR data at Tab: {active_tab}, Record: {active_record_id}",
                    "error": str(exc),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ==============================================================================
# CMMS -> SWMM SRAR PULL API
# Pull SRAR data FROM CMMS and save it INTO the SWMM PostgreSQL database.
# ==============================================================================


class SRARPullFromCMMSAPIView(APIView):
    """
    GET /swmmapi/srar_api/srar_pull_from_cmms/

    1. Triggers SFD Master Equipment Sync (CMMSFDDataAPI) to pull all Master data.
    2. Pulls every *monthly* CMMS table the SRAR push writes to, directly over the
       MSSQL connection (see pull_srar_* below) — this ship's *entire* SRAR history,
       not scoped to any particular month/year (any `month`/`year` query params are
       accepted but unused, kept only so existing frontend calls don't need updating):

           T_SRARMthlyHeader            Ch_Ship_Mnthly_Torsion_Meter
           T_SRARMthlyShipRunning       Ch_Ship_Mnthly_HS_Sensor
           T_SRARMthlyEquipments        Ch_Ship_Mnthly_Magazine_System
           T_SRARMthlyBoiler            Ch_Ship_Mnthly_STP
           Ch_Master_Equipment_Type     Ch_Ship_Mnthly_Status_Safety
           Ch_Ship_Mthly_Fuel_Consumption
           Ch_Ship_Mnthly_Avcat_Status  Ch_Ship_Mnthly_Injector_Replacement
           Ch_Ship_Mnthly_ICCP          Ch_Ship_Mnthly_Lub_Fuel_Centrifuge
           Ch_ShipMonthlyMasterActivity

       Deliberately NOT pulled: the quarterly and half-yearly tables the push also
       writes (Ch_SRAR_Qrtrly_Full_Power_Trails and its Diesel_Alt sibling, the two
       Ch_SRAR_Qrtly_GTRG_Exploitations_* tables, both Ch_Ship_Qtrly_GTG_* tables,
       Ch_Ship_Qtrly_Running_Hours_Ext_Trial, T_SRARHfyrlyLubricantConsumption) plus
       Ch_Ship_Mnthly_Coolant_Test_Kits. Those key off a quarterly/half-yearly header
       rather than the monthly one, so the helpers here cannot resolve their parent.
    3. Saves / updates each pulled table into SWMM PostgreSQL via Django ORM, then
       links any newly SRAR-applicable equipment to its tab.
    4. Streams progress the whole way as a StreamingHttpResponse of tagged log
       lines, matching the pattern CMMSFDDataAPI/CMMSSrarPullAPI already use
       ([SYSTEM]/[STEP n/6]/[OK]/[NEW]/[EXISTING]/[SKIPPED]/[FATAL]/[Completed]) —
       this pull covers the ship's whole history and can run long with nothing to
       show for it otherwise, which is exactly what used to leave the SRAR
       Transaction screen's "Sync With CMMS" button looking hung. The frontend
       (SrarService.streamSyncSrarWithCmms, srar-transaction.component.ts) reads it
       with a fetch+reader, the same as SfdReferencesApiService.streamSync does for
       the SFD sync wizard.
    """

    def get(self, request):
        # charset spelled out because these lines carry non-ASCII punctuation and are
        # read straight off the wire by the popup's TextDecoder.
        return StreamingHttpResponse(
            self._stream_pull(request), content_type="text/plain; charset=utf-8"
        )

    def _stream_pull(self, request):
        yield "[SYSTEM] Starting CMMS -> SWMM SRAR sync...\n"

        # -----------------------------------------------------------------
        # Step 1/5: Equipment masters (a prerequisite, not an SRAR step of its own)
        # -----------------------------------------------------------------
        yield "[STEP 1/6] Refreshing equipment masters from CMMS...\n"
        try:
            fd_view = CMMSFDDataAPI()
            # CMMSFDDataAPI.get() returns a StreamingHttpResponse whose generator body
            # only runs while something iterates it, so this loop is what actually
            # performs the sync. Its ~40 lines of SFD master detail (M_Ship,
            # M_Department, M_Supplier, defect masters...) are deliberately NOT
            # forwarded: this popup reports the SRAR sync, and burying five SRAR steps
            # under an unrelated SFD log is what made it unreadable. Only the
            # SRAR-relevant outcome is summarised below.
            for _ in fd_view.get(request).streaming_content:
                pass
            ch_eq_view = CMMSMasterEquipmentTypeSyncAPI()
            ch_eq_view.get(request)
            srar_equipment = ShipEquipment.objects.filter(
                is_srar=True, active=True
            ).count()
            with_rhsi = (
                ShipEquipment.objects.filter(is_srar=True, active=True)
                .exclude(eq_rhsi__isnull=True)
                .exclude(eq_rhsi="")
                .count()
            )
            yield (
                f"[OK] Equipment masters refreshed — {srar_equipment} SRAR-applicable "
                f"equipment, {with_rhsi} with running hours on record.\n"
            )
        except Exception as exc:
            logger.warning(
                f"Master SFD / Ch_Master_Equipment_Type auto-sync notice: {exc}"
            )
            yield f"[SKIPPED] Master sync notice: {exc}\n"

        # -----------------------------------------------------------------
        # Steps 2-5: Pull SRAR data straight from CMMS's MSSQL tables via
        # get_mssql_connection() — the same proven pattern every other working
        # CMMS sync in this codebase (SFD, maintops, frequency, DARTs) uses.
        # This used to HTTP-GET `{API_URL}/api/srar/save-srar/`, but API_URL is
        # SWMM's OWN base URL (see .env's SWMM_API_URL), so that request was
        # calling this application back rather than CMMS — a request that only
        # ever 404s, which is why "Sync With CMMS" always reported "No SRAR data
        # found in CMMS" regardless of month/year/what CMMS actually holds.
        # -----------------------------------------------------------------
        try:
            conn = get_mssql_connection()
        except Exception as exc:
            yield f"[FATAL] Cannot reach CMMS: {exc}\n"
            return

        cursor = None
        try:
            cursor = conn.cursor()
            ship_code = env_ship_code()
            ship_uid = resolve_cmms_ship_uid(cursor, ship_code)
            if not ship_uid:
                yield (
                    f"[FATAL] Ship code {ship_code!r} not found in CMMS — "
                    "check SWMM_SHIP_CODE.\n"
                )
                return

            # Each pull reports its own record type by name — the log is read to see
            # what came across, so "Inserted: 104" alone would say nothing about which
            # of the five tables it belonged to.
            def report(label, created, updated, skipped=0):
                yield f"[NEW] {label} inserted: {created}\n"
                yield f"[EXISTING] {label} updated: {updated}\n"
                if skipped:
                    yield f"[SKIPPED] {label} skipped: {skipped}\n"
                yield f"[OK] {label}: {created + updated} records synced.\n"

            yield "[STEP 2/6] Syncing SRAR equipment type categories...\n"
            eq_created, eq_updated = pull_srar_equipment_types(cursor)
            yield from report("Equipment type categories", eq_created, eq_updated)

            yield "[STEP 3/6] Syncing SRAR monthly returns...\n"
            hdr_created, hdr_updated, hdr_skipped = pull_srar_monthly_headers(
                cursor, ship_uid
            )
            yield from report("Monthly headers", hdr_created, hdr_updated, hdr_skipped)
            run_created, run_updated, run_skipped = pull_srar_ship_running(
                cursor, ship_uid
            )
            yield from report(
                "Ship running (days at sea/harbour)",
                run_created,
                run_updated,
                run_skipped,
            )

            yield "[STEP 4/6] Syncing fuel consumption & AVCAT status...\n"
            # Must run after the monthly headers above — both resolve their
            # srar_monthly_header link off the headers that call just created/updated.
            fuel_created, fuel_updated, fuel_skipped = pull_srar_fuel_consumption(
                cursor, ship_uid
            )
            yield from report(
                "Fuel consumption", fuel_created, fuel_updated, fuel_skipped
            )
            avcat_created, avcat_updated, avcat_skipped = pull_srar_avcat_status(
                cursor, ship_uid
            )
            yield from report(
                "AVCAT status", avcat_created, avcat_updated, avcat_skipped
            )

            yield "[STEP 5/6] Syncing SRAR form tables (equipment-linked)...\n"
            # These five pulls existed but were never wired into this stream, which is
            # the only SRAR sync the frontend calls (`srar_pull_from_cmms/`). Without
            # them a synced return came back header-only: Form 1's running hours, Form
            # 2's boiler steaming, Form 3's ship activity, Form 5's ICCP and Form 6's
            # centrifuge rows all stayed empty, so the History drawer had nothing to
            # render for those tabs. Each runs after the headers phase above so the
            # return it links to already exists.
            #
            # One failing table must not abort the rest -- they are independent tables
            # and a CMMS deployment missing one (these differ between installs) used to
            # take the whole sync down with it.
            for label, puller in (
                ("Equipment exploitation (Form 1)", pull_srar_monthly_equipments),
                ("Ship activity (Form 3)", pull_srar_ship_activity),
                ("Boiler steaming (Form 2)", pull_srar_monthly_boiler),
                ("Torsion meters (Form 4)", pull_srar_torsion_meter),
                ("ICCP (Form 5)", pull_srar_iccp),
                ("H2S sensors (Form 5)", pull_srar_h2s_sensor),
                ("Magazine FF/flooding (Form 5)", pull_srar_magazine_system),
                ("STP (Form 5)", pull_srar_stp),
                ("Centrifuge (Form 6)", pull_srar_centrifuge),
                ("Safety device checks (Form 7)", pull_srar_safety_device_check),
                (
                    "Injector/FIP calibration (Form 7)",
                    pull_srar_injector_replacement,
                ),
            ):
                try:
                    created, updated, skipped = puller(cursor, ship_uid)
                    yield from report(label, created, updated, skipped)
                except Exception as exc:
                    logger.exception("SRAR pull failed for %s", label)
                    yield f"[ERROR] {label} failed: {exc}\n"

            yield "[STEP 6/6] Linking SRAR-applicable equipment to their tabs...\n"
            # Uses the ShipEquipment rows CMMSFDDataAPI (step 1, above) already synced
            # from CMMS this same run — no separate MSSQL query needed. See
            # sync_srar_equipment_links_from_sfd's docstring.
            equipment_links_created = sync_srar_equipment_links_from_sfd()
            yield f"[NEW] Equipment links inserted: {equipment_links_created}\n"
            yield "[OK] Equipment links synced.\n"
        except Exception as exc:
            logger.exception("CMMS SRAR pull failed")
            yield f"[FATAL] CMMS SRAR pull failed: {exc}\n"
            return
        finally:
            if cursor:
                cursor.close()
            conn.close()

        synced_count = hdr_created + hdr_updated
        if synced_count == 0:
            yield "[FATAL] No SRAR data found in CMMS.\n"
            return

        yield (
            f"[Completed] All Masters and SRAR data ({synced_count} SRAR monthly "
            "records) successfully pulled from CMMS and saved to SWMM.\n"
        )


# ==============================================================================
# CMMS Ch_Master_Equipment_Type SYNC API
# Syncs Ch_Master_Equipment_Type from CMMS into SWMM PostgreSQL DB
# ==============================================================================


class CMMSMasterEquipmentTypeSyncAPI(APIView):
    """
    Sync endpoint for Ch_Master_Equipment_Type from CMMS -> SWMM PostgreSQL.
    Populates sfd.models.EquipmentType and master.models.EquipmentType.
    """

    def get(self, request):
        from sfd.models import EquipmentType as SFDEquipmentType
        from master.models import EquipmentType as MasterEquipmentType
        from srar.models import SrarMasterEquipment

        synced_records = []
        try:
            conn = get_mssql_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT
                    Equipment_Type_ID,
                    Equipment_Desc,
                    Status,
                    CMMS_ID,
                    CMMS_Ship_ID,
                    Equipment_Category_Code,
                    Universal_ID_A_User_Created_By,
                    Universal_ID_A_User_Updated_By,
                    CreatedDate,
                    UpdatedDate,
                    Universal_ID_Ch_Master_Equipment_Type,
                    Order_By
                FROM Ch_Master_Equipment_Type
            """)
            columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()
            row_dicts = [dict(zip(columns, row)) for row in rows]
        except Exception as exc:
            # Fallback to existing local DB records if remote DB connection is unavailable
            row_dicts = list(SFDEquipmentType.objects.all().values())

        synced_count = 0
        with transaction.atomic():
            for item in row_dicts:
                eq_id = str(
                    item.get("Equipment_Type_ID") or item.get("equipment_type_id") or ""
                )
                eq_desc = str(
                    item.get("Equipment_Desc") or item.get("equipment_desc") or ""
                )
                status_val = str(item.get("Status") or item.get("status") or "1")
                cmms_id = str(item.get("CMMS_ID") or item.get("cmms_id") or "")
                cmms_ship_id = str(
                    item.get("CMMS_Ship_ID") or item.get("cmms_ship_id") or ""
                )
                cat_code = str(
                    item.get("Equipment_Category_Code")
                    or item.get("equipment_category_code")
                    or ""
                )
                user_created = str(
                    item.get("Universal_ID_A_User_Created_By")
                    or item.get("universal_id_a_user_created_by")
                    or ""
                )
                user_updated = str(
                    item.get("Universal_ID_A_User_Updated_By")
                    or item.get("universal_id_a_user_updated_by")
                    or ""
                )
                uid_ch = str(
                    item.get("Universal_ID_Ch_Master_Equipment_Type")
                    or item.get("universal_id_ch_master_equipment_type")
                    or eq_id
                )
                created_date = (
                    item.get("CreatedDate")
                    or item.get("created_date")
                    or item.get("createddate")
                )
                updated_date = (
                    item.get("UpdatedDate")
                    or item.get("updated_date")
                    or item.get("updateddate")
                )
                order_by_raw = item.get("Order_By") or item.get("order_by")
                try:
                    order_by = (
                        int(order_by_raw) if order_by_raw not in (None, "") else None
                    )
                except (TypeError, ValueError):
                    order_by = None

                if not eq_id:
                    continue

                SFDEquipmentType.objects.update_or_create(
                    Equipment_Type_ID=eq_id,
                    defaults={
                        "Equipment_Desc": eq_desc,
                        "status": status_val,
                        "CMMS_ID": cmms_id,
                        "CMMS_Ship_ID": cmms_ship_id,
                        "Equipment_Category_Code": cat_code,
                        "universal_id_a_user_created_by": user_created,
                        "universal_id_a_user_updated_by": user_updated,
                        "Universal_ID_Ch_Master_Equipment_Type": uid_ch,
                    },
                )

                MasterEquipmentType.objects.update_or_create(
                    code=eq_id,
                    defaults={
                        "name": eq_desc,
                        "active": (str(status_val) in ("1", "True", "true")),
                    },
                )
                SrarMasterEquipment.objects.update_or_create(
                    equipment_type_id=eq_id,
                    defaults={
                        "equipment_desc": eq_desc,
                        "status": status_val,
                        "cmms_id": cmms_id,
                        "cmms_ship_id": cmms_ship_id,
                        "equipment_category_code": cat_code,
                        "universal_id_a_user_created_by": user_created,
                        "universal_id_a_user_updated_by": user_updated,
                        "created_date": created_date,
                        "updated_date": updated_date,
                        "universal_id_ch_master_equipment_type": uid_ch,
                        "order_by": order_by,
                    },
                )
                # NOT written to SrarEquipmentTypeList — that table backs the "SRAR Master
                # Records" grid on the Masters screen (`master/equipments/`), which is meant
                # to show only equipment a ship has explicitly added via "Add SRAR Equipment"/
                # "Lubricant & Test Kits" (see SrarEquipmentTypeListViewSet, the endpoint
                # those Save buttons POST to). Writing the raw CMMS catalog into it here used
                # to flood that grid with every CMMS equipment type on every sync — the
                # catalog itself belongs only in SrarMasterEquipment (above), which is what
                # `master/srar_master_equipments_only/` already correctly feeds into the
                # "Add SRAR Equipment" modal's Select Section / equipment picker.
                synced_count += 1
                synced_records.append(
                    {
                        "equipment_type_id": eq_id,
                        "equipment_desc": eq_desc,
                        "equipment_category_code": cat_code,
                        "status": status_val,
                    }
                )

        return Response(
            {
                "status": True,
                "message": f"Successfully synced {synced_count} records from Ch_Master_Equipment_Type into SWMM PostgreSQL DB.",
                "count": synced_count,
                "data": synced_records,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        return self.get(request)


class CMMSMasterShipRemarksBySyncAPI(APIView):
    """Sync endpoint for Ch_Master_Ship_Remarks_By from CMMS -> SWMM PostgreSQL.

    Populates master.models.ChMasterShipRemarksBy, which backs the DART form's "SS
    Remarks" dropdown (dart.views' remark_list) — nothing was pulling this table down
    before, so it only ever held whatever single row happened to exist locally.
    Column names confirmed live against the real CMMS schema (`select * from
    Ch_Master_Ship_Remarks_By`) — same pattern as CMMSMasterEquipmentTypeSyncAPI above.
    """

    def get(self, request):
        synced_records = []
        try:
            conn = get_mssql_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT
                    Ship_Remark_By_ID,
                    Description,
                    Active,
                    Universal_ID_Ch_Master_Ship_Remarks_By,
                    Universal_ID_A_User_Created_By,
                    Universal_ID_A_User_Updated_By,
                    CreatedDate,
                    UpdatedDate
                FROM Ch_Master_Ship_Remarks_By
            """)
            columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()
            row_dicts = [dict(zip(columns, row)) for row in rows]
        except Exception:
            logger.exception("Ch_Master_Ship_Remarks_By sync failed to reach CMMS.")
            return Response(
                {"status": False, "message": "CMMS connection unavailable."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        synced_count = 0
        with transaction.atomic():
            for item in row_dicts:
                uid = item.get("Universal_ID_Ch_Master_Ship_Remarks_By")
                if not uid:
                    continue
                ChMasterShipRemarksBy.objects.update_or_create(
                    universal_id_ch_master_ship_remarks_by=uid,
                    defaults={
                        "ship_remark_by_id": item.get("Ship_Remark_By_ID"),
                        "description": item.get("Description"),
                        "active": item.get("Active"),
                        "universal_id_a_user_created_by": item.get(
                            "Universal_ID_A_User_Created_By"
                        ),
                        "universal_id_a_user_updated_by": item.get(
                            "Universal_ID_A_User_Updated_By"
                        ),
                        "created_date": datetime_from_cmms(item.get("CreatedDate")),
                        "updated_date": datetime_from_cmms(item.get("UpdatedDate")),
                    },
                )
                synced_count += 1
                synced_records.append(
                    {"universal_id": uid, "description": item.get("Description")}
                )

        return Response(
            {
                "status": True,
                "message": f"Successfully synced {synced_count} records from Ch_Master_Ship_Remarks_By into SWMM PostgreSQL DB.",
                "count": synced_count,
                "data": synced_records,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        return self.get(request)


class CMMSMasterRequiredAssistanceSyncAPI(APIView):
    """Sync endpoint for M_RequiredAssistance from CMMS -> SWMM PostgreSQL.

    Populates master.models.MRequiredAssistance, which backs the DART form's
    "Required Assistance" dropdown (dart.views' assistance_list) — nothing was
    pulling this table down before; the only local rows came from a one-off demo
    seed command, not real CMMS data. Column names confirmed live against the real
    CMMS schema (`select * from M_RequiredAssistance`).
    """

    def get(self, request):
        synced_records = []
        try:
            conn = get_mssql_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT
                    RequiredAssistanceID,
                    RequiredAssistanceFor,
                    Active,
                    CreatedBy,
                    CreatedDate,
                    UpdatedBy,
                    UpdatedDate,
                    Universal_ID_M_RequiredAssistance,
                    Universal_ID_M_Department,
                    Universal_ID_A_User_Created_By,
                    Universal_ID_A_User_Updated_By,
                    RequiredAssistanceCode
                FROM M_RequiredAssistance
            """)
            columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()
            row_dicts = [dict(zip(columns, row)) for row in rows]
        except Exception:
            logger.exception("M_RequiredAssistance sync failed to reach CMMS.")
            return Response(
                {"status": False, "message": "CMMS connection unavailable."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        synced_count = 0
        with transaction.atomic():
            for item in row_dicts:
                uid = item.get("Universal_ID_M_RequiredAssistance")
                if not uid:
                    continue
                MRequiredAssistance.objects.update_or_create(
                    universal_id_m_required_assistance=uid,
                    defaults={
                        "required_assistance_for": item.get("RequiredAssistanceFor"),
                        "active": bool(item.get("Active")),
                        "created_by": item.get("CreatedBy"),
                        "created_date": datetime_from_cmms(item.get("CreatedDate")),
                        "updated_by": item.get("UpdatedBy"),
                        "updated_date": datetime_from_cmms(item.get("UpdatedDate")),
                        "universal_id_m_department": item.get(
                            "Universal_ID_M_Department"
                        ),
                        "universal_id_a_user_created_by": item.get(
                            "Universal_ID_A_User_Created_By"
                        ),
                        "universal_id_a_user_updated_by": item.get(
                            "Universal_ID_A_User_Updated_By"
                        ),
                        "required_assistance_code": item.get("RequiredAssistanceCode"),
                    },
                )
                synced_count += 1
                synced_records.append(
                    {
                        "universal_id": uid,
                        "required_assistance_for": item.get("RequiredAssistanceFor"),
                    }
                )

        return Response(
            {
                "status": True,
                "message": f"Successfully synced {synced_count} records from M_RequiredAssistance into SWMM PostgreSQL DB.",
                "count": synced_count,
                "data": synced_records,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        return self.get(request)


# ---------------------------------------------------------------------------
# SRAR pull: CMMS -> SWMM over a direct SQL connection.
#
# The pre-existing SRARPullFromCMMSAPIView does not read CMMS at all — it HTTP-GETs
# `{API_URL}/api/srar/save-srar/`, and API_URL is SWMM's own base URL, so that path
# calls this application back rather than CMMS. Every other working sync in this
# codebase (SFD, maintops, frequency, DARTs) goes through get_mssql_connection()
# against CMMSOFFLINE; these pulls follow that pattern.
#
# Column names below were read off INFORMATION_SCHEMA, and row.get() is used
# throughout so a schema difference between deployments drops one field instead of
# failing the whole step.
# ---------------------------------------------------------------------------


def pull_srar_equipment_types(cursor):
    """Ch_Master_Equipment_Type -> srar.SrarEquipmentTypeList (fleet-wide master).

    Matches only the bare category rows (equipment_id IS NULL) — the catalog rows
    this function itself owns (see SrarMasterEquipmentsAPIView's docstring: "bare
    category rows created by the CMMS Ch_Master_Equipment_Type sync ... are catalog
    data for the category picker only"). Matching on equipment_type_id alone used to
    also catch every equipment-linked row sharing that same category (there can be
    many — one per piece of equipment under it), so update_or_create's internal
    get() found more than one row and raised MultipleObjectsReturned, 502ing every
    "Sync With CMMS" call once enough equipment had been linked under any one
    category. See the unique_srar_equipment_type_catalog_row constraint (migration
    0017) for why a second concurrent sync can't recreate this by racing a duplicate
    catalog row into existence instead.
    """
    created = updated = 0
    for columns, chunk in iter_cmms_rows(cursor, "Ch_Master_Equipment_Type", None):
        for row_tuple in chunk:
            row = dict(zip(columns, row_tuple))
            type_id = row.get("Equipment_Type_ID")
            if type_id is None:
                continue
            _, was_created = SrarEquipmentTypeList.objects.update_or_create(
                equipment_type_id=str(type_id),
                equipment_id__isnull=True,
                defaults={
                    "equipment_desc": row.get("Equipment_Desc"),
                    "status": (
                        str(row.get("Status"))
                        if row.get("Status") is not None
                        else None
                    ),
                    "cmms_id": (
                        str(row.get("CMMS_ID"))
                        if row.get("CMMS_ID") is not None
                        else None
                    ),
                    "cmms_ship_id": (
                        str(row.get("CMMS_Ship_ID"))
                        if row.get("CMMS_Ship_ID") is not None
                        else None
                    ),
                    "equipment_category_code": row.get("Equipment_Category_Code"),
                    "universal_id": row.get("Universal_ID_Ch_Master_Equipment_Type"),
                    # CMMS-origin row — see srar.models.CmmsProvenance.
                    "data_source": "cmms",
                },
            )
            created += was_created
            updated += not was_created
    return created, updated


def sync_srar_equipment_links_from_sfd():
    """Auto-links every ShipEquipment CMMS marks SRAR-applicable into
    SrarEquipmentTypeList — the table every SRAR tab's equipment list actually reads
    (srar.views.SrarRunningHoursEquipmentListAPIView, SrarMasterEquipmentsAPIView,
    SrarEquipmentByTypeAPIView all filter/join on it), under its own CMMS
    equipment-type category so it lands on the same tab the manual "Add SRAR
    Equipment" screen would put it on.

    `ShipEquipment.is_srar` / `.universal_id_ch_master_equipment_type` are themselves
    already populated straight from CMMS's `T_EquipmentShipDetail.SRARApplicable` /
    `Universal_ID_Ch_Master_Equipment_Type` by CMMSFDDataAPI (the SFD sync step that
    runs immediately before this in SRARPullFromCMMSAPIView.get()) — so this needs no
    MSSQL query of its own, just reading what that sync already pulled in.

    Only ever CREATES a link for equipment that has none yet — one already linked,
    whether by an earlier run of this same auto-sync or by the manual Add screen, is
    left untouched, so re-running "Sync With CMMS" never produces duplicate rows for
    the same equipment.
    """
    already_linked = set(
        SrarEquipmentTypeList.objects.filter(equipment_id__isnull=False).values_list(
            "equipment_id", flat=True
        )
    )
    applicable = (
        ShipEquipment.objects.filter(is_srar=True, active=True)
        .exclude(universal_id_ch_master_equipment_type__isnull=True)
        .exclude(universal_id_ch_master_equipment_type="")
    )
    created = 0
    for eq in applicable:
        if eq.id in already_linked:
            continue
        label = eq.equipment_name or eq.nomenclature or f"Equipment {eq.id}"
        SrarEquipmentTypeList.objects.create(
            # Created from CMMS-synced equipment — see srar.models.CmmsProvenance.
            data_source="cmms",
            equipment_id=eq,
            srar_type=label,
            srar_txt=label,
            equipment_desc=label,
            status="Active",
            cmms_ship_id=eq.universal_id_m_ship,
            equipment_type_id=eq.universal_id_ch_master_equipment_type,
            universal_id_ch_master_equipment_type=eq.universal_id_ch_master_equipment_type,
        )
        already_linked.add(eq.id)
        created += 1
    return created


def _parse_srar_months(value):
    """'July, 2022' -> (7, 2022). Returns (None, None) when unparseable."""
    if not value:
        return None, None
    text = str(value).replace(",", " ").split()
    month = year = None
    for token in text:
        if token.isdigit() and len(token) == 4:
            year = int(token)
            continue
        name = token.strip().lower()[:3]
        for index in range(1, 13):
            if calendar.month_abbr[index].lower() == name:
                month = index
                break
    return month, year


def _hr_min_to_decimal_hours(hr, minute, fallback=None):
    """(123, 30) -> 123.5 decimal hours, the form CMMS stores. The exact inverse of
    `_decimal_hours_to_hr_min` below.

    The SRAR push used to build these values as `f"{hr}.{min}"`, which is not decimal
    hours at all: 2h30m went out as "2.30" (= 2h18m to CMMS) and 2h05m as "2.5"
    (= 2h30m). Only whole hours survived the trip.

    `fallback` is returned when the hr/min pair is empty. That matters because the two
    directions of this integration store the same quantity in different columns -- the
    CMMS pull writes SrarMonthlyHeader.max_duration and leaves max_duration_hr/_min
    null, while the push read only the hr/min pair. So every return pulled from CMMS
    and later pushed back reported 0 for MaxDuration and hours underway, overwriting
    CMMS's own figure with a zero.
    """
    has_hr = hr is not None and str(hr).strip() != ""
    has_min = minute is not None and str(minute).strip() != ""
    if not has_hr and not has_min:
        return fallback
    try:
        hours = float(hr) if has_hr else 0.0
        minutes = float(minute) if has_min else 0.0
    except (TypeError, ValueError):
        return fallback
    return round(hours + minutes / 60.0, 2)


def _decimal_hours_to_hr_min(value):
    """123.5 (decimal hours, as CMMS stores them) -> (123, 30). None input -> (None, None)."""
    if value is None:
        return None, None
    try:
        total = float(value)
    except (TypeError, ValueError):
        return None, None
    hours = int(total)
    minutes = round((total - hours) * 60)
    if minutes == 60:
        hours += 1
        minutes = 0
    return hours, minutes


def pull_srar_monthly_headers(cursor, ship_uid):
    """Every T_SRARMthlyHeader row for this ship -> srar.SrarMonthlyHeader.

    No date/month filter -- this pulls the ship's *entire* CMMS SRAR history, not just
    recent returns, so previously-submitted returns become visible in SWMM (the "Recent
    SRAR Entries" grid and dashboard both read SrarMonthlyHeader with no date cutoff).

    Keyed on Universal_ID_T_SRARMthlyHeader (added to the model specifically for this
    pull) rather than (ship, month, year), since CMMS is the source of truth for its own
    identity and a straight uid match survives header edits that don't touch the period.
    Flagged is_saved/send_to_co/cmms_sync_status = True: these rows already exist in
    CMMS, so marking them synced stops any future SRAR push from re-sending them back.

    A month the ship has filled in locally but not yet pushed is left alone. Such a header
    carries no Universal_ID_T_SRARMthlyHeader yet (the push mints it), so it cannot be
    matched by uid, and creating the CMMS row beside it would leave two returns for one
    month — with the ship's own unsent work the one that looks like the duplicate. The
    return is skipped here and reported; once it is pushed it has CMMS's identity and the
    next pull matches and refreshes it normally.
    """
    created = updated = skipped = 0

    ship_obj = Ship.objects.filter(universal_id_m_ship=ship_uid).first()

    # Both read once for the whole pull rather than per row: two more queries here against
    # two per CMMS row, on a table that holds one row per month of the ship's life.
    #
    # (month, year) of every local return still waiting to reach CMMS...
    unpushed_periods = {
        (month, year)
        for month, year in SrarMonthlyHeader.objects.filter(
            Q(cmms_sync_status=False) | Q(cmms_sync_status__isnull=True)
        )
        .filter(
            Q(universal_id_t_srar_mthly_header__isnull=True)
            | Q(universal_id_t_srar_mthly_header="")
        )
        .values_list("srar_month", "srar_year")
    }
    # ...and every CMMS identity already held locally, so a row that *is* already ours is
    # recognised without asking the database about it again.
    known_header_uids = set(
        SrarMonthlyHeader.objects.exclude(universal_id_t_srar_mthly_header__isnull=True)
        .exclude(universal_id_t_srar_mthly_header="")
        .values_list("universal_id_t_srar_mthly_header", flat=True)
    )

    for columns, chunk in iter_cmms_rows(
        cursor, "T_SRARMthlyHeader", f"Universal_ID_M_Ship = '{ship_uid}'"
    ):
        for row_tuple in chunk:
            row = dict(zip(columns, row_tuple))
            header_uid = row.get("Universal_ID_T_SRARMthlyHeader")
            month = row.get("SrarMonth")
            year = row.get("SrarYear")
            if not header_uid or month is None or year is None:
                skipped += 1
                continue

            if (
                month,
                year,
            ) in unpushed_periods and str(header_uid) not in known_header_uids:
                # This month is the ship's own unsent return. See the docstring.
                skipped += 1
                continue

            underway_hr, underway_min = _decimal_hours_to_hr_min(
                row.get("HoursUnderwayMonth")
            )
            since_hr, since_min = _decimal_hours_to_hr_min(
                row.get("HoursUnderwaySinceCommissioning")
            )

            _, was_created = SrarMonthlyHeader.objects.update_or_create(
                universal_id_t_srar_mthly_header=str(header_uid),
                defaults={
                    "ship": ship_obj,
                    "universal_id_m_ship": row.get("Universal_ID_M_Ship"),
                    "srar_month": month,
                    "srar_year": year,
                    "hours_underway_month_hr": underway_hr,
                    "hours_underway_month_min": underway_min,
                    "distance_run_month": row.get("DistanceRunMonth"),
                    "hours_underway_since_commissioning_hr": (
                        str(since_hr) if since_hr is not None else None
                    ),
                    "hours_underway_since_commissioning_min": (
                        str(since_min) if since_min is not None else None
                    ),
                    "distance_run_since_commissioning": row.get(
                        "DistanceRunSinceCommissioning"
                    ),
                    "max_speed": row.get("MaxSpeed"),
                    "max_duration": row.get("MaxDuration"),
                    "eo_name": row.get("EONAME"),
                    "eo_rank": row.get("EORNAK"),
                    "eo_personal_no": row.get("EOPersonalNo"),
                    "eo_contact_no": row.get("EOContactNo"),
                    "eo_writer_contact_no": row.get("EOWritterNo"),
                    "is_saved": True,
                    "send_to_co": True,
                    "cmms_sync_status": True,
                    "cmms_sync_date": timezone.now().date(),
                    # CMMS-origin row — see srar.models.CmmsProvenance.
                    "data_source": "cmms",
                },
            )
            created += was_created
            updated += not was_created

    return created, updated, skipped


def pull_srar_ship_running(cursor, ship_uid):
    """T_SRARMthlyShipRunning -> srar.SrarMonthlyShipRunning (days at sea / harbour).

    Keyed on Universal_ID_T_SRARMthlyHeader plus Months: the CMMS table carries no
    universal id of its own and several rows can share a header, so that pair is what
    identifies a row across re-pulls.

    The local header FK is resolved first by a direct match on the header's own CMMS uid
    (populated once pull_srar_monthly_headers has run), falling back to parsing Months
    ("July, 2022") into month/year for headers pulled before that field existed. Rows
    whose return is not held locally at all still import, with the CMMS return id
    retained so they can be linked once that header exists.
    """
    created = updated = skipped = 0

    header_by_uid = {
        header.universal_id_t_srar_mthly_header: header
        for header in SrarMonthlyHeader.objects.exclude(
            universal_id_t_srar_mthly_header__isnull=True
        ).exclude(universal_id_t_srar_mthly_header="")
    }
    header_by_period = {}
    for header in SrarMonthlyHeader.objects.all():
        header_by_period[(header.srar_month, header.srar_year)] = header

    for columns, chunk in iter_cmms_rows(
        cursor, "T_SRARMthlyShipRunning", f"Universal_ID_M_Ship = '{ship_uid}'"
    ):
        for row_tuple in chunk:
            row = dict(zip(columns, row_tuple))
            header_uid = row.get("Universal_ID_T_SRARMthlyHeader")
            months = row.get("Months")
            if not header_uid:
                skipped += 1
                continue

            month, year = _parse_srar_months(months)
            resolved_header = header_by_uid.get(
                str(header_uid)
            ) or header_by_period.get((month, year))

            _, was_created = SrarMonthlyShipRunning.objects.update_or_create(
                universal_id_t_srar_mthly_header=str(header_uid),
                months=months,
                defaults={
                    "at_sea_in_month": row.get("AtSeaInMonth"),
                    "at_harbour_in_month": row.get("AtHarbourInMonth"),
                    "remark_of_month": row.get("RemarkOfMonth"),
                    "universal_id_m_ship": row.get("Universal_ID_M_Ship"),
                    "srar_monthly_header": resolved_header,
                    "is_synced": True,
                    # CMMS-origin row — see srar.models.CmmsProvenance.
                    "data_source": "cmms",
                },
            )
            created += was_created
            updated += not was_created

    return created, updated, skipped


def _pull_srar_header_linked_table(
    cursor, cmms_table, ship_uid, local_model, uid_field, uid_column, column_map
):
    """Shared body for pull_srar_fuel_consumption / pull_srar_avcat_status: both CMMS
    tables (Ch_Ship_Mthly_Fuel_Consumption, Ch_Ship_Mnthly_Avcat_Status) carry their
    own real universal id per row (unlike T_SRARMthlyShipRunning, which needed a
    composite key) and link to the SRAR return via Universal_ID_T_SRARMthlyHeader —
    so both pulls are the same shape, just against a different table/model/column
    mapping. `column_map` is {local_model_field: cmms_column_name}. Rows whose header
    hasn't been pulled locally yet still import (srar_monthly_header left unset) —
    the Fuel/AVCAT tabs already tolerate an unlinked row, and a later re-sync (after
    pull_srar_monthly_headers has caught up) links it in place via the same uid.
    """
    created = updated = skipped = 0

    header_by_uid = {
        header.universal_id_t_srar_mthly_header: header
        for header in SrarMonthlyHeader.objects.exclude(
            universal_id_t_srar_mthly_header__isnull=True
        ).exclude(universal_id_t_srar_mthly_header="")
    }

    for columns, chunk in iter_cmms_rows(
        cursor, cmms_table, f"Universal_ID_M_Ship = '{ship_uid}'"
    ):
        for row_tuple in chunk:
            row = dict(zip(columns, row_tuple))
            row_uid = row.get(uid_column)
            if not row_uid:
                skipped += 1
                continue

            header_uid = row.get("Universal_ID_T_SRARMthlyHeader")
            resolved_header = header_by_uid.get(str(header_uid)) if header_uid else None

            defaults = {
                field: row.get(cmms_col) for field, cmms_col in column_map.items()
            }
            defaults["srar_monthly_header"] = resolved_header
            # CMMS-origin row — see srar.models.CmmsProvenance.
            defaults["data_source"] = "cmms"

            _, was_created = local_model.objects.update_or_create(
                **{uid_field: str(row_uid)}, defaults=defaults
            )
            created += was_created
            updated += not was_created

    return created, updated, skipped


def pull_srar_fuel_consumption(cursor, ship_uid):
    """Ch_Ship_Mthly_Fuel_Consumption -> srar.FuelConsumptionMonth."""
    return _pull_srar_header_linked_table(
        cursor,
        "Ch_Ship_Mthly_Fuel_Consumption",
        ship_uid,
        FuelConsumptionMonth,
        "universal_id_ch_ship_mthly_fuel_consumption",
        "Universal_ID_Ch_Ship_Mthly_Fuel_Consumption",
        {
            "b_f_from_last_month": "BF_From_Last_Month",
            "recieved": "Fuel_Received",
            "consumed_in_harbour": "Fuel_Harbour",
            "consumed_at_anchorage": "Fuel_Anchorage",
            "consumed_at_sea": "Fuel_Sea",
            "total_consumed": "Fuel_Total_Consumption",
            "defueled": "Fuel_Defuelled",
            "balance_left_on_board": "Fuel_Balance_Left_Onboard",
        },
    )


def pull_srar_avcat_status(cursor, ship_uid):
    """Ch_Ship_Mnthly_Avcat_Status -> srar.AvcatStatus."""
    return _pull_srar_header_linked_table(
        cursor,
        "Ch_Ship_Mnthly_Avcat_Status",
        ship_uid,
        AvcatStatus,
        "universal_id_ch_ship_mnthly_avcat_status",
        "Universal_ID_Ch_Ship_Mnthly_Avcat_Status",
        {
            "b_f_from_last_month": "Avcat_BF_From_Last_Month",
            "recieved": "Avcat_Received",
            "given_to_ac": "Avcat_Given_Ac",
            "used_for_trials_drained": "Used_For_Trials_Drained",
            "total_consumed": "Avcat_TotalConsumption",
            "defuelded": "Avcat_Defuelled",
            "balance_left_on_board": "Balance_Left_Onboard",
        },
    )


def pull_srar_monthly_equipments(cursor, ship_uid):
    """T_SRARMthlyEquipments -> srar.SrarEquipmentExploitation (Form 1 running hours).

    Without this the SRAR pull produced returns that were header-only: every
    tab_* list came back empty, so the History screen's detail view had nothing
    to show past the running-details block. This is the table that actually holds
    a CMMS return's content -- 8059 rows across this ship's returns.

    Keyed on (header, equipment) rather than a CMMS uid because
    SrarEquipmentExploitation carries no uid column, and that pair is already
    unique: one row per equipment per monthly return. Rows whose header or
    equipment is not held locally are skipped rather than orphaned -- the header
    pull runs earlier in the same step, so in practice only equipment no longer
    fitted falls out.
    """
    created = updated = skipped = 0

    header_by_uid = {
        _clean_text(header.universal_id_t_srar_mthly_header): header
        for header in SrarMonthlyHeader.objects.exclude(
            universal_id_t_srar_mthly_header__isnull=True
        ).exclude(universal_id_t_srar_mthly_header="")
    }
    equipment_by_uid = {
        _clean_text(uid): equipment_id
        for equipment_id, uid in ShipEquipment.objects.exclude(
            t_equipment_ship_detail__isnull=True
        )
        .exclude(t_equipment_ship_detail="")
        .values_list("id", "t_equipment_ship_detail")
    }

    def _hours_minutes(value):
        """CMMS keeps these as decimal hours (12.50); the local model splits h/m."""
        if value in (None, ""):
            return None, None, None
        try:
            total_minutes = int(round(float(value) * 60))
        except (TypeError, ValueError):
            return None, None, None
        return total_minutes // 60, total_minutes % 60, total_minutes // 60

    for columns, chunk in iter_cmms_rows(
        cursor, "T_SRARMthlyEquipments", f"Universal_ID_M_Ship = '{ship_uid}'"
    ):
        for row_tuple in chunk:
            row = dict(zip(columns, row_tuple))
            header = header_by_uid.get(
                _clean_text(row.get("Universal_ID_T_SRARMthlyHeader"))
            )
            equipment_id = equipment_by_uid.get(
                _clean_text(row.get("Universal_ID_T_EquipmentShipDetail"))
            )
            if header is None or equipment_id is None:
                skipped += 1
                continue

            month_hrs, month_min, month_total = _hours_minutes(row.get("HrsForMonth"))
            rhsi_hrs, rhsi_min, rhsi_total = _hours_minutes(
                row.get("HrsFromInstallation")
            )
            _, was_created = SrarEquipmentExploitation.objects.update_or_create(
                srar_monthly_header=header,
                sfd_details_id=equipment_id,
                defaults={
                    "hrs_for_month": month_total,
                    "hrs_for_month_hrs": month_hrs,
                    "hrs_for_month_min": month_min,
                    "rhsi_till_current_month": rhsi_total,
                    "rhsi_till_current_month_hr": rhsi_hrs,
                    "rhsi_till_current_month_min": rhsi_min,
                    # CMMS-origin row — see srar.models.CmmsProvenance.
                    "data_source": "cmms",
                },
            )
            created += was_created
            updated += not was_created

    return created, updated, skipped


def _pull_srar_equipment_linked_table(
    cursor, cmms_table, ship_uid, local_model, column_map
):
    """Shared body for the SRAR pulls whose CMMS table is one row per equipment per
    return: T_SRARMthlyBoiler, Ch_Ship_Mnthly_ICCP,
    Ch_Ship_Mnthly_Lub_Fuel_Centrifuge.

    Unlike Fuel/AVCAT (see _pull_srar_header_linked_table) these local models carry
    no CMMS uid column, so the upsert keys on (header, equipment) instead. That pair
    is already unique -- a return holds one row per fitted equipment -- so it
    converges with the push rather than duplicating what the push created, without
    needing a schema change on three more tables.

    `column_map` is {local_model_field: cmms_column_name}.
    """
    created = updated = skipped = 0

    header_by_uid = {
        _clean_text(header.universal_id_t_srar_mthly_header): header
        for header in SrarMonthlyHeader.objects.exclude(
            universal_id_t_srar_mthly_header__isnull=True
        ).exclude(universal_id_t_srar_mthly_header="")
    }
    equipment_by_uid = {
        _clean_text(uid): equipment_id
        for equipment_id, uid in ShipEquipment.objects.exclude(
            t_equipment_ship_detail__isnull=True
        )
        .exclude(t_equipment_ship_detail="")
        .values_list("id", "t_equipment_ship_detail")
    }

    for columns, chunk in iter_cmms_rows(
        cursor, cmms_table, f"Universal_ID_M_Ship = '{ship_uid}'"
    ):
        for row_tuple in chunk:
            row = dict(zip(columns, row_tuple))
            header = header_by_uid.get(
                _clean_text(row.get("Universal_ID_T_SRARMthlyHeader"))
            )
            equipment_id = equipment_by_uid.get(
                _clean_text(row.get("Universal_ID_T_EquipmentShipDetail"))
            )
            if header is None or equipment_id is None:
                skipped += 1
                continue

            defaults = {
                field: row.get(cmms_col) for field, cmms_col in column_map.items()
            }
            # CMMS-origin row — see srar.models.CmmsProvenance.
            defaults["data_source"] = "cmms"
            _, was_created = local_model.objects.update_or_create(
                srar_monthly_header=header,
                sfd_details_id=equipment_id,
                defaults=defaults,
            )
            created += was_created
            updated += not was_created

    return created, updated, skipped


def _cmms_ops_flag(value):
    """Ch_Master_Ship_Ops uid -> the local ops_or_non_ops choice (1 OPS / 2 Non OPS)."""
    text = _clean_text(value)
    if not text:
        return None
    return 1 if text == "1" else 2


def pull_srar_monthly_boiler(cursor, ship_uid):
    """T_SRARMthlyBoiler -> srar.SrarMonthlyBoiler (Tab 2 boiler steaming)."""
    return _pull_srar_equipment_linked_table(
        cursor,
        "T_SRARMthlyBoiler",
        ship_uid,
        SrarMonthlyBoiler,
        {
            "hrs_steamed_in_month": "HrsSteamedMonth",
            "hrs_steamed_since_commissioning": "HrsSteamedSinceCommissioning",
            "highest_salinity_during_month": "HighestSalinity",
            "lowest_salinity_during_month": "LowestSalinity",
            "serial_no": "EquipmentCode",
        },
    )


def pull_srar_iccp(cursor, ship_uid):
    """Ch_Ship_Mnthly_ICCP -> srar.Iccp (Tab 5 ICCP system parameters)."""
    return _pull_srar_equipment_linked_table(
        cursor,
        "Ch_Ship_Mnthly_ICCP",
        ship_uid,
        Iccp,
        {"non_ops_since": "ICCP_Non_Ops_Since"},
    )


def pull_srar_centrifuge(cursor, ship_uid):
    """Ch_Ship_Mnthly_Lub_Fuel_Centrifuge -> srar.SrarCentrifuge (Tab 6)."""
    return _pull_srar_equipment_linked_table(
        cursor,
        "Ch_Ship_Mnthly_Lub_Fuel_Centrifuge",
        ship_uid,
        SrarCentrifuge,
        {"non_ops_since": "Centrifuge_NonOps_Since"},
    )


def pull_srar_torsion_meter(cursor, ship_uid):
    """Ch_Ship_Mnthly_Torsion_Meter -> srar.TorsionMeter (Form 4 torsion meters)."""
    return _pull_srar_equipment_linked_table(
        cursor,
        "Ch_Ship_Mnthly_Torsion_Meter",
        ship_uid,
        TorsionMeter,
        {
            "torsion_meter_rdg": "Torsionm_Eter_RDG",
            "max_rpm_achieved": "Max_SRPM_Achieved",
            "non_ops_since": "NON_Ops_Since",
            "last_calibration_date": "Last_Calibration",
            "next_calibration_date": "Next_Calibration_Due",
        },
    )


def pull_srar_h2s_sensor(cursor, ship_uid):
    """Ch_Ship_Mnthly_HS_Sensor -> srar.H2SSensor (Form 5 H2S sensors)."""
    return _pull_srar_equipment_linked_table(
        cursor,
        "Ch_Ship_Mnthly_HS_Sensor",
        ship_uid,
        H2SSensor,
        {
            "non_ops_since": "Sensor_Non_Ops_Since",
            "last_calibration_date": "Sensor_Last_Calibration",
            "next_calibration_date": "Sensor_Next_Calibration_Due",
        },
    )


def pull_srar_magazine_system(cursor, ship_uid):
    """Ch_Ship_Mnthly_Magazine_System -> srar.MagazineFFSystemFloodingSystem (Form 5).

    CMMS reuses its calibration column names for what this form calls trials, hence
    the Last/Next_Calibration -> last/next_trials mapping.
    """
    return _pull_srar_equipment_linked_table(
        cursor,
        "Ch_Ship_Mnthly_Magazine_System",
        ship_uid,
        MagazineFFSystemFloodingSystem,
        {
            "non_ops_since": "Magazine_Non_Ops_Since",
            "last_trials_taken": "Magazine_Last_Calibration",
            "next_trials_due": "Magazine_Next_Calibration_Due",
        },
    )


def pull_srar_stp(cursor, ship_uid):
    """Ch_Ship_Mnthly_STP -> srar.STP (Form 5 sewage treatment plant)."""
    return _pull_srar_equipment_linked_table(
        cursor,
        "Ch_Ship_Mnthly_STP",
        ship_uid,
        STP,
        {
            "effluent_status": "EffluentTestStatus",
            "effluent_test_date": "EffluentTestDate",
            "remarks": "Remarks",
        },
    )


def pull_srar_injector_replacement(cursor, ship_uid):
    """Ch_Ship_Mnthly_Injector_Replacement -> srar.InjectorFIPCalibrationReplacement
    (Form 7 injector/FIP calibration).

    The load-band columns are named for their lower bound in CMMS and for the whole
    band in SWMM, so HrsBelow50 is the 33-50% band and HrsAbove50 the 50-70% one --
    the same pairing the push uses in reverse.
    """
    return _pull_srar_equipment_linked_table(
        cursor,
        "Ch_Ship_Mnthly_Injector_Replacement",
        ship_uid,
        InjectorFIPCalibrationReplacement,
        {
            "occasion": "Injector_Occasion",
            "date_of_inj_fip_calibration": "InjectorDate",
            "rh_at_which_replaced": "Running_Hrs_Which_Replaced",
            "running_hours_months": "RHMnth",
            "running_hours_since_installation": "RHSinceInstallation",
            "hrs_run_below_33_percent": "HrsBelow33",
            "hrs_run_33_to_50_percent": "HrsBelow50",
            "hrs_run_50_to_70_percent": "HrsAbove50",
            "hrs_run_70_to_100_percent": "HrsAbove70",
            "lub_oil_consumption_in_month": "LUBOil",
            "fuel_consumption_in_month": "FuelConsumptionInMonth",
            "remarks": "Remarks",
        },
    )


def pull_srar_safety_device_check(cursor, ship_uid):
    """Ch_Ship_Mnthly_Status_Safety -> srar.SafetyDeviceCheckTrial (Form 7 SDC)."""
    return _pull_srar_equipment_linked_table(
        cursor,
        "Ch_Ship_Mnthly_Status_Safety",
        ship_uid,
        SafetyDeviceCheckTrial,
        {
            "sdc_conducted_by": "SDC_Conducted",
            "date_of_sdc": "Safety_Date",
            "sfc_in_gm_kwh": "SafetySFCNumber",
            "last_sfc_trial_date": "SafetySFCDate",
            "displacement_during_sfc_trial": "SafetySFCDisplacement",
        },
    )


def pull_srar_ship_activity(cursor, ship_uid):
    """Ch_ShipMonthlyMasterActivity -> srar.SrarMonthlyShipActivity (Tab 3).

    This -- not T_SRARShipActivity -- is the table the SRAR push writes activity to,
    and it is the only one that carries the four-level hierarchy the local model
    needs. T_SRARShipActivity only references M_SRARActivity, whose ActivityName and
    ActivityCode are NULL throughout this CMMS instance, so nothing there can be
    resolved onto ShipState / ShipLocation / ShipActivityType / ShipActivityDetail.

    The four lookup FKs are resolved by reading what CMMS calls each uid and
    matching that against the ship's own lookup list by name. The CMMS lookup
    tables are deliberately not imported -- doing so adds near-duplicate names to
    those lists and duplicates every Tab 3 dropdown option.
    """
    created = updated = skipped = 0

    header_by_uid = {
        _clean_text(header.universal_id_t_srar_mthly_header): header
        for header in SrarMonthlyHeader.objects.exclude(
            universal_id_t_srar_mthly_header__isnull=True
        ).exclude(universal_id_t_srar_mthly_header="")
    }

    def _norm(value):
        """Collapse internal whitespace as well as trimming.

        CMMS carries lookups whose names differ only by doubled spaces
        ("Alongside  Home Port"); without this they read as distinct names and
        stop matching the local list.
        """
        return " ".join(_clean_text(value).split()).lower()

    def _by_uid(model, cmms_table, uid_column, name_column):
        """CMMS lookup uid -> local lookup pk, resolved purely through the name.

        Deliberately does NOT import the CMMS lookup tables. They hold rows whose
        names collide once whitespace is normalised, and importing them added those
        near-duplicates to ShipLocation / ShipActivityType / ShipActivityDetail,
        which is what put duplicate options in the Tab 3 dropdowns. The local lists
        stay exactly as srar.views._auto_seed_masters_if_empty() seeds them; this
        only reads CMMS to learn what each uid is called, then points at the local
        row of that name. Anything CMMS names that the ship's list does not carry
        simply leaves that FK null.
        """
        pk_by_name = {
            _norm(name): pk for pk, name in model.objects.values_list("pk", "name")
        }
        cursor.execute(
            f"SELECT [{uid_column}], [{name_column}] FROM [{cmms_table}] WITH (NOLOCK)"
        )
        mapping = {}
        for uid, name in cursor.fetchall():
            uid = _clean_text(uid)
            pk = pk_by_name.get(_norm(name))
            if uid and pk is not None:
                mapping[uid] = pk
        return mapping

    state_by_uid = _by_uid(
        ShipState,
        "Ch_Master_Ship_State",
        "Universal_ID_Ch_Master_Ship_State",
        "Ship_State_Name",
    )
    location_by_uid = _by_uid(
        ShipLocation,
        "Ch_Master_Ship_Location",
        "Universal_ID_Ch_Master_Ship_Location",
        "Location_Name",
    )
    type_by_uid = _by_uid(
        ShipActivityType,
        "Ch_Master_Ship_Activity_Type",
        "Universal_ID_Ch_Master_Ship_Activity_Type",
        "Activity_Type_Name",
    )
    detail_by_uid = _by_uid(
        ShipActivityDetail,
        "Ch_Master_Ship_Activity_Detail",
        "Universal_ID_Ch_Master_Ship_Activity_Detail",
        "Activity_Detail_Name",
    )

    for columns, chunk in iter_cmms_rows(
        cursor, "Ch_ShipMonthlyMasterActivity", f"Universal_ID_M_Ship = '{ship_uid}'"
    ):
        for row_tuple in chunk:
            row = dict(zip(columns, row_tuple))
            activity_uid = _clean_text(
                row.get("Universal_ID_Ch_ShipMonthlyMasterActivity")
            )
            header = header_by_uid.get(
                _clean_text(row.get("Universal_ID_T_SRARMthlyHeader"))
            )
            if not activity_uid or header is None:
                skipped += 1
                continue

            _, was_created = SrarMonthlyShipActivity.objects.update_or_create(
                universal_id_ch_shipmonthlymasteractivity=activity_uid,
                defaults={
                    "srar_monthly_header": header,
                    "from_date": date_from_cmms(row.get("From_Date")),
                    "to_date": date_from_cmms(row.get("To_Date")),
                    "remarks": _clean_text(row.get("Comment")) or None,
                    "ship_state_id": state_by_uid.get(
                        _clean_text(row.get("Universal_ID_Ch_Master_Ship_State"))
                    ),
                    "ship_location_id": location_by_uid.get(
                        _clean_text(row.get("Universal_ID_Ch_Master_Ship_Location"))
                    ),
                    "ship_activity_type_id": type_by_uid.get(
                        _clean_text(
                            row.get("Universal_ID_Ch_Master_Ship_Activity_Type")
                        )
                    ),
                    "ship_activity_detail_id": detail_by_uid.get(
                        _clean_text(
                            row.get("Universal_ID_Ch_Master_Ship_Activity_Detail")
                        )
                    ),
                },
            )
            created += was_created
            updated += not was_created

    return created, updated, skipped


class CMMSSrarPullAPI(APIView):
    """Pull SRAR reference and exploitation tables from CMMS into SWMM."""

    def get(self, request):
        return self.post(request)

    def post(self, request):
        return StreamingHttpResponse(
            self._stream_pull(request), content_type="text/plain"
        )

    def _stream_pull(self, request):
        conn = None
        cursor = None
        try:
            yield "[SYSTEM] Starting CMMS -> SWMM SRAR Pull...\n"

            conn = get_mssql_connection()
            cursor = conn.cursor()

            ship_code = env_ship_code()
            ship_uid = resolve_cmms_ship_uid(cursor, ship_code)
            if not ship_uid:
                yield (
                    f"[FATAL] Ship code {ship_code!r} not found in CMMS — check "
                    "SWMM_SHIP_CODE.\n"
                )
                return
            yield f"[OK] Ship: {ship_code} / Universal_ID_M_Ship={ship_uid}\n"

            # ---------------- Ch_Master_Equipment_Type ----------------
            total, _ = cmms_row_count(cursor, "Ch_Master_Equipment_Type", "1=1")
            yield f"Fetched {total} Ch_Master_Equipment_Type records. Processing start...\n"
            created, updated = pull_srar_equipment_types(cursor)
            yield f"[NEW] Inserted: {created}\n"
            yield f"[EXISTING] Updated: {updated}\n"
            yield f"[OK] Saved {created + updated} SRAR equipment types.\n"

            # ---------------- T_SRARMthlyHeader (full history, no date filter) ----------------
            header_total, _ = cmms_row_count(
                cursor, "T_SRARMthlyHeader", f"Universal_ID_M_Ship = '{ship_uid}'"
            )
            yield (
                f"Fetched {header_total} T_SRARMthlyHeader records (full history). "
                "Processing start...\n"
            )
            created, updated, skipped = pull_srar_monthly_headers(cursor, ship_uid)
            yield f"[NEW] Inserted: {created}\n"
            yield f"[EXISTING] Updated: {updated}\n"
            if skipped:
                yield f"[SKIPPED] {skipped} rows with no month/year or CMMS id\n"
            yield f"[OK] Saved {created + updated} SRAR monthly returns.\n"

            # Runs straight after the headers so every return it links to exists.
            yield "\n[SYSTEM] Pulling SRAR monthly equipment running hours...\n"
            created, updated, skipped = pull_srar_monthly_equipments(cursor, ship_uid)
            yield f"[NEW] Inserted: {created}\n"
            yield f"[EXISTING] Updated: {updated}\n"
            if skipped:
                yield (f"[SKIPPED] {skipped} rows with no local return or equipment\n")
            yield (
                f"[OK] Saved {created + updated} SRAR equipment exploitation rows.\n"
            )
            # The remaining tables the SRAR push writes to, so a pull brings back
            # everything a push can send. Each runs after the headers phase so the
            # return it links to already exists.
            for label, puller in (
                (
                    "Ch_ShipMonthlyMasterActivity -> ship activity",
                    pull_srar_ship_activity,
                ),
                ("T_SRARMthlyBoiler -> boiler steaming", pull_srar_monthly_boiler),
                ("Ch_Ship_Mnthly_ICCP -> ICCP", pull_srar_iccp),
                (
                    "Ch_Ship_Mnthly_Lub_Fuel_Centrifuge -> centrifuge",
                    pull_srar_centrifuge,
                ),
            ):
                yield f"\n[SYSTEM] Pulling {label}...\n"
                try:
                    created, updated, skipped = puller(cursor, ship_uid)
                    yield f"[NEW] Inserted: {created}\n"
                    yield f"[EXISTING] Updated: {updated}\n"
                    if skipped:
                        yield (
                            f"[SKIPPED] {skipped} rows with no local return "
                            f"or equipment\n"
                        )
                    yield f"[OK] Saved {created + updated} rows.\n"
                except Exception as exc:
                    logger.exception("SRAR pull failed for %s", label)
                    yield f"[ERROR] {label} failed: {exc}\n"

            # ---------------- T_SRARMthlyShipRunning ----------------
            cursor.execute(
                "SELECT COUNT(*) FROM T_SRARMthlyShipRunning WITH (NOLOCK) "
                "WHERE Universal_ID_M_Ship = ?",
                (ship_uid,),
            )
            running_total = cursor.fetchone()[0]
            yield (
                f"Fetched {running_total} T_SRARMthlyShipRunning records. "
                "Processing start...\n"
            )
            created, updated, skipped = pull_srar_ship_running(cursor, ship_uid)
            yield f"[NEW] Inserted: {created}\n"
            yield f"[EXISTING] Updated: {updated}\n"
            if skipped:
                yield f"[SKIPPED] {skipped} rows with no parent return id\n"
            yield f"[OK] Saved {created + updated} ship-running records.\n"

            yield "[Completed] CMMS SRAR pull completed successfully.\n"

        except Exception as exc:
            logger.exception("CMMS SRAR pull failed")
            yield f"\n[ERROR] {exc}\n"
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()
