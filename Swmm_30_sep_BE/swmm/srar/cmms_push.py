"""Push a completed SRAR return from SWMM into the CMMS database.

Why this exists
---------------
The SRAR push used to POST its payload as JSON to ``{SWMM_API_URL}/api/srar/save-srar/``.
That path is a route of *this* codebase, and SWMM_API_URL ships as ``http://localhost:8000``
— so the return was posted straight back into SWMM's own tables, answered 200, and marked
``cmms_sync_status = True`` while CMMS never heard about it. Even pointed at a peer SWMM
deployment it would not have helped: that receiver (``SRARDataSaveAPI``) writes Django
models, not CMMS tables.

Every other CMMS interaction in this project already goes over MSSQL — the whole SRAR
pull, and the dart push — so this does too, through the same ``get_mssql_connection()``.
The connection is env-driven (``CMMS_DB_HOST``), which is what makes dev and deployment
the same code: only the IP changes, exactly as it does for the pull.

Writing the SQL here rather than handing JSON to someone else's endpoint also removes the
guesswork that dogged the old payload: columns are named against the live CMMS schema, so
fields the JSON contract had no agreed key for (fuel totals, EEF, EO details,
Is_Final_Submit) are simply written to their columns.

Identity and idempotency
------------------------
The header is keyed on ``Universal_ID_T_SRARMthlyHeader`` — the stable UUID SWMM now
persists per return (see ``SRARSyncAPIView``'s universal_id handling). Pushing the same
return twice updates that row instead of adding another.

Child rows are keyed the way the pull keys them on the SWMM side: header + equipment
(``Universal_ID_T_SRARMthlyHeader`` + ``Universal_ID_T_EquipmentShipDetail``). Their own
``Universal_ID_<table>`` is minted once on insert and left alone afterwards, so CMMS keeps
whatever identity it first saw.
"""

import datetime
import logging
import uuid

from django.utils import timezone

from sfd.utils import get_mssql_connection
from srar import ops_status
from swmmapi.sync_ledger import ledgered

logger = logging.getLogger(__name__)

# CMMS marks rows it owns with Source = 1; a return raised in SWMM is flagged so the two
# origins stay distinguishable on the CMMS side too, mirroring srar.models.CmmsProvenance
# on ours. 2 is what the dart push already uses for SWMM-raised records.
SOURCE_SWMM = 2


def _hr_min_to_decimal(hr, minute, fallback=None):
    """(2, 30) -> 2.5. CMMS stores these as decimal hours, not H.MM."""
    has_hr = hr is not None and str(hr).strip() != ""
    has_min = minute is not None and str(minute).strip() != ""
    if not has_hr and not has_min:
        return fallback
    try:
        return round(
            (float(hr) if has_hr else 0.0) + (float(minute) if has_min else 0.0) / 60.0,
            4,
        )
    except (TypeError, ValueError):
        return fallback


def _num(value, fallback=None):
    """Best-effort numeric, for the CharFields SWMM stores numbers in."""
    if value is None or str(value).strip() == "":
        return fallback
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return fallback


def _hours_text(value, fallback=None):
    """Decimal hours from the free text SWMM stores several of these in.

    The boiler figures are CharFields holding either "12:30" or "12.5" depending on
    which screen wrote them, while CMMS wants a decimal. Plain _num() returned None
    for every HH:MM value, which is part of why the boiler push landed so little.
    """
    if value is None:
        return fallback
    text = str(value).strip()
    if not text:
        return fallback
    if ":" in text:
        hours, _, minutes = text.partition(":")
        return _hr_min_to_decimal(hours or 0, minutes or 0, fallback=fallback)
    return _num(text, fallback)


class CmmsPushError(RuntimeError):
    """Raised when the return cannot be pushed. Carries a message fit for the UI."""


# Column names per CMMS table, filled on first use. Schemas are static for the life of
# a process, so this is a process-wide cache rather than a per-push one.
_COLUMN_CACHE = {}


def _table_columns(cursor, table):
    """{lowercased column name: SQL type} for `table` on the live CMMS.

    Every write is filtered through this. CMMS schemas differ between deployments --
    and even between tables on one instance: `Source` exists on T_SRARMthlyEquipments
    and T_SRARMthlyBoiler but not on Ch_Ship_Mnthly_ICCP or the fuel/AVCAT tables, and
    `EquipmentSrNumber` only on the first. MSSQL rejects the entire statement on the
    first unknown column, so without this a column added for one table would break the
    push everywhere it does not exist -- the same trap that made Step 1 fail outright
    on ILMSCustomerCode.
    """
    if table not in _COLUMN_CACHE:
        cursor.execute(
            "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_NAME = ?",
            table,
        )
        _COLUMN_CACHE[table] = {
            name.lower(): data_type for name, data_type in cursor.fetchall()
        }
    return _COLUMN_CACHE[table]


class _ExplicitNull:
    """Marks a column that must be written as NULL rather than left as it stands.

    The pushes otherwise drop every None, so an unresolved field leaves CMMS's own
    figure alone. That is right for a value SWMM simply does not know, and wrong for one
    SWMM has positively retracted: a row switched to Non OPS or Not Held would keep the
    reading CMMS was given while the row was still OPS.
    """

    def __repr__(self):
        return "<explicit NULL>"


EXPLICIT_NULL = _ExplicitNull()


# SQL types that will not accept the text SWMM often keeps its figures in.
_NUMERIC_SQL_TYPES = frozenset(
    (
        "decimal",
        "numeric",
        "int",
        "smallint",
        "bigint",
        "tinyint",
        "float",
        "real",
        "money",
        "smallmoney",
    )
)


def _bindable(value, data_type=None):
    """A value the CMMS ODBC driver will actually bind into a `data_type` column.

    Two conversions, both of which cost a whole push when they are missed, because
    MSSQL rejects the entire statement rather than the one column:

    Dates -- the legacy "SQL Server" driver this connects through cannot bind a plain
    datetime.date ("Optional feature not implemented (SQLBindParameter)"). Every
    calibration, trial and cleaning date on the SRAR forms is a DateField.

    Numbers held as text -- a great many SWMM fields are CharFields carrying "12:30",
    "42.5" or "" while the CMMS column is decimal ("Error converting data type nvarchar
    to numeric"). T_SRARMthlyBoiler.EquipmentCode is the sharpest case: it is decimal,
    and the push was sending an equipment serial like "66TT0121C192" into it. Text that
    is not a number at all becomes None, so the column is simply left alone.
    """
    if value is EXPLICIT_NULL:
        return None
    if isinstance(value, datetime.datetime):
        return value.replace(tzinfo=None) if value.tzinfo else value
    if isinstance(value, datetime.date):
        return datetime.datetime(value.year, value.month, value.day)
    if isinstance(value, str) and data_type in _NUMERIC_SQL_TYPES:
        return _hours_text(value) if ":" in value else _num(value)
    return value


def _naive(value):
    """A datetime CMMS will accept: it stores these without a timezone."""
    if value is None:
        return None
    return value.replace(tzinfo=None) if value.tzinfo else value


def _existing_row(cursor, table, key_columns, extra_columns=()):
    """The row already sitting at `key_columns`, or None if there is none.

    Returns a dict of whichever `extra_columns` this deployment actually has, so a
    caller can ask for a column only some CMMS schemas carry. This replaces the bare
    `SELECT COUNT(*)` the pushes used to do: they need more than existence -- the
    identity CMMS already holds for the row, and whether it has a CreatedDate worth
    leaving alone.
    """
    known = _table_columns(cursor, table)
    wanted = [c for c in extra_columns if c.lower() in known]
    select = ", ".join(f"[{c}]" for c in wanted) or "1"
    where = " AND ".join(f"[{c}] = ?" for c in key_columns)
    cursor.execute(
        f"SELECT TOP 1 {select} FROM [{table}] WHERE {where}", *key_columns.values()
    )
    row = cursor.fetchone()
    if row is None:
        return None
    return dict(zip(wanted, row))


class _PushContext:
    """Per-push state every table writer shares.

    Beyond the cursor and the actor this carries two things the writers used to do
    without. First, the CMMS identities that must be written back onto the SWMM rows
    once the push commits. Second, a cache of CMMS's own integer keys: CMMS fills
    Ship_ID / SrarMthlyID / EquipmentShipID / CreatedBy on its native rows and still
    joins and reports on them, but a SWMM push only ever knew the universal ids, so
    every row it wrote left them NULL. They are one lookup away from the uid SWMM
    already holds, so they are looked up.
    """

    def __init__(self, cursor, ship, header_uid, actor_uid):
        self.cursor = cursor
        self.ship = ship
        self.ship_uid = getattr(ship, "universal_id_m_ship", None)
        self.header_uid = header_uid
        self.actor_uid = actor_uid
        self.now = timezone.now().replace(tzinfo=None)
        self.pending_uid_writes = []
        self._int_ids = {}
        # Filled by _resolve_half_yearly_header once, then linked onto every row of the
        # seven CMMS tables that key on a half-yearly return instead of a monthly one.
        self.half_yearly_uid = None

    def int_id(self, table, id_column, uid_column, uid):
        """CMMS's own integer key for the row `uid` addresses, or None.

        A miss is cached as None too, so a return full of equipment CMMS does not
        know re-queries once rather than once per row.
        """
        if not uid:
            return None
        cache_key = (table, str(uid))
        if cache_key not in self._int_ids:
            self.cursor.execute(
                f"SELECT TOP 1 [{id_column}] FROM [{table}] WHERE [{uid_column}] = ?",
                str(uid),
            )
            row = self.cursor.fetchone()
            self._int_ids[cache_key] = row[0] if row else None
        return self._int_ids[cache_key]

    @property
    def ship_int_id(self):
        return self.int_id("M_Ship", "ShipID", "Universal_ID_M_Ship", self.ship_uid)

    @property
    def header_int_id(self):
        # Only meaningful once the header row itself has been upserted, which is why
        # push_srar_return writes the header before anything that links to it.
        return self.int_id(
            "T_SRARMthlyHeader",
            "SrarMthlyID",
            "Universal_ID_T_SRARMthlyHeader",
            self.header_uid,
        )

    @property
    def actor_int_id(self):
        return self.int_id("A_User", "UserID", "Universal_ID_A_User", self.actor_uid)

    def uid_by_name(self, table, uid_column, name_column, name):
        """The CMMS universal id of a master row addressed by its name.

        SWMM's own activity lookups (ShipState, ShipLocation, ShipActivityType,
        ShipActivityDetail) were seeded locally and their Universal_ID columns are all
        null, so Form 3 had nothing to send CMMS for the four columns that actually say
        what the activity was. Matching on the name is the same adopt-by-name step the
        Step 1 sub-department sync already does, and the result is written back onto the
        SWMM row so this happens once rather than on every push.
        """
        cleaned = (name or "").strip().upper()
        if not cleaned:
            return None
        cache_key = ("name", table, cleaned)
        if cache_key not in self._int_ids:
            self.cursor.execute(
                f"SELECT [{uid_column}], [{name_column}] FROM [{table}]"
            )
            found = None
            for uid, row_name in self.cursor.fetchall():
                if (row_name or "").strip().upper() == cleaned:
                    found = uid
                    break
            self._int_ids[cache_key] = found
        return self._int_ids[cache_key]

    def master_uid(self, obj, uid_field, table, uid_column, name_column):
        """`obj`'s CMMS universal id, adopting it by name the first time."""
        if obj is None:
            return None
        uid = getattr(obj, uid_field, None)
        if uid:
            return uid
        uid = self.uid_by_name(
            table, uid_column, name_column, getattr(obj, "name", None)
        )
        if uid:
            self.pending_uid_writes.append((obj, uid_field, uid))
        return uid

    def equipment_int_id(self, eq_uid):
        return self.int_id(
            "T_EquipmentShipDetail",
            "EquipmentShipID",
            "Universal_ID_T_EquipmentShipDetail",
            eq_uid,
        )

    @property
    def half_yearly_int_id(self):
        return self.int_id(
            "T_SRARHlfYrlyHeader",
            "SRARHfyrlyID",
            "Universal_ID_T_SRARHlfYrlyHeader",
            self.half_yearly_uid,
        )

    def link_values(self, eq_uid=None):
        """The ship / return / equipment keys, in both the universal and legacy forms.

        `_upsert` drops whichever of these the table does not have -- T_SRARMthlyBoiler
        has no Ship_ID, the header-level tables have no equipment.
        """
        values = {
            "Universal_ID_M_Ship": self.ship_uid,
            "Ship_ID": self.ship_int_id,
            "SrarMthlyID": self.header_int_id,
        }
        if self.half_yearly_uid:
            # Ch_SRAR_Qrtrly_Full_Power_Trails carries both period keys; the rest carry
            # one or the other, and _upsert drops whichever the table does not have.
            values["Universal_ID_T_SRARHlfYrlyHeader"] = self.half_yearly_uid
            values["SRARHfyrlyID"] = self.half_yearly_int_id
        if eq_uid:
            values["Universal_ID_T_EquipmentShipDetail"] = eq_uid
            values["EquipmentShipID"] = self.equipment_int_id(eq_uid)
        return values

    def audit_values(self, existing, created_on=None):
        """The bookkeeping columns every pushed row should carry.

        None of these were written on the child tables, which is why rows SWMM had
        pushed sat in CMMS with NULL CreatedDate/UpdatedDate and no user attribution
        beside CMMS's own rows, and why `Source` fell back to the column default of 1
        -- marking a SWMM-raised row as CMMS-owned, the opposite of what the header
        already records for the same return.

        The creation stamp is written when the row is new *or* when the row that is
        there has none: rows pushed before this all carry NULL, and SWMM knows the
        real date from its own record. A CreatedDate CMMS already set is left alone.
        """
        # Ch_ShipMonthlyMasterActivity spells these Created_By / Created_Date /
        # Updated_By / Updated_Date, everything else spells them CreatedBy / CreatedDate.
        # Both go out and _upsert drops whichever the table does not have, rather than
        # this carrying a per-table naming table.
        values = {
            "Active": 1,
            "Source": SOURCE_SWMM,
            "UpdatedDate": self.now,
            "Updated_Date": self.now,
        }
        if self.actor_uid:
            values["Universal_ID_A_User_Updated_By"] = self.actor_uid
            values["UpdatedBy"] = self.actor_int_id
            values["Updated_By"] = self.actor_int_id
        if existing is None or not (
            existing.get("CreatedDate") or existing.get("Created_Date")
        ):
            created = _naive(created_on) or self.now
            values["CreatedDate"] = created
            values["Created_Date"] = created
            if self.actor_uid:
                values["Universal_ID_A_User_Created_By"] = self.actor_uid
                values["CreatedBy"] = self.actor_int_id
                values["Created_By"] = self.actor_int_id
        return values


def _upsert(cursor, table, key_columns, values):
    """UPDATE the row matching `key_columns`, or INSERT it when there is none.

    `key_columns` and `values` are both {column: value}; the key columns are written on
    insert too. Returns "updated" or "inserted".

    Done as select-then-write rather than MERGE deliberately: MERGE needs privileges and
    a locking story this integration does not have, and these are single-row writes inside
    one transaction.
    """
    known = _table_columns(cursor, table)
    values = {
        column: bound
        for column, bound in (
            (c, _bindable(v, known.get(c.lower())))
            for c, v in values.items()
            if c.lower() in known
        )
        # A value that could not be coerced (text in a numeric column) is dropped
        # rather than written, matching what the callers do with an unresolved field.
        # EXPLICIT_NULL has already become None above and is meant to be written.
        if bound is not None or values.get(column) is EXPLICIT_NULL
    }

    where = " AND ".join(f"[{c}] = ?" for c in key_columns)
    cursor.execute(
        f"SELECT COUNT(*) FROM [{table}] WHERE {where}", *key_columns.values()
    )
    exists = cursor.fetchone()[0] > 0

    if exists:
        if not values:
            return "updated"
        sets = ", ".join(f"[{c}] = ?" for c in values)
        cursor.execute(
            f"UPDATE [{table}] SET {sets} WHERE {where}",
            *(list(values.values()) + list(key_columns.values())),
        )
        return "updated"

    row = dict(key_columns)
    row.update(values)
    cols = ", ".join(f"[{c}]" for c in row)
    marks = ", ".join("?" for _ in row)
    cursor.execute(f"INSERT INTO [{table}] ({cols}) VALUES ({marks})", *row.values())
    return "inserted"


def _header_values(header, ctx, existing, eef, fuel):
    """SWMM's monthly header mapped onto T_SRARMthlyHeader's columns."""
    values = {
        # Resolved, not coerced: this used to be _num(universal_id_m_ship), which
        # only produced the right integer because this CMMS happens to use numeric
        # ship uids. Elsewhere the uid is a GUID-shaped string and it wrote nothing.
        "ShipID": ctx.ship_int_id,
        "SrarMonth": header.srar_month,
        "SrarYear": header.srar_year,
        "HoursUnderwayMonth": _hr_min_to_decimal(
            header.hours_underway_month_hr, header.hours_underway_month_min
        ),
        "DistanceRunMonth": _num(header.distance_run_month),
        "HoursUnderwaySinceCommissioning": _hr_min_to_decimal(
            header.hours_underway_since_commissioning_hr,
            header.hours_underway_since_commissioning_min,
        ),
        "DistanceRunSinceCommissioning": _num(header.distance_run_since_commissioning),
        "MaxSpeed": _num(header.max_speed),
        "MaxDuration": _hr_min_to_decimal(
            header.max_duration_hr,
            header.max_duration_min,
            fallback=_num(header.max_duration),
        ),
        "Universal_ID_M_Ship": ctx.ship_uid,
        # The ship's own sign-off block. These columns exist on CMMS but the old JSON
        # payload had no agreed keys for them, so they were never populated.
        "EONAME": header.eo_name,
        "EORNAK": header.eo_rank,
        "EOPersonalNo": header.eo_personal_no,
        "EOContactNo": header.eo_contact_no,
        "EOWritterNo": header.eo_writer_contact_no,
        # CO approval is what gates this push, so a pushed return is a submitted one.
        "Is_Final_Submit": 1 if header.co_approved else 0,
        "Is_Pushed_To_CMMS": 1,
    }

    values.update(ctx.audit_values(existing, created_on=header.created_on))

    if eef is not None:
        values["EEFDesigned"] = _num(eef.designed)
        values["EEF"] = _num(eef.actual)
        values["EO_Remarks"] = eef.ship_remarks
        if eef.reason_for_exceeding is not None:
            values["Reason_ID"] = eef.reason_for_exceeding

    if fuel is not None:
        values["FuelAtHarb"] = _num(fuel.consumed_in_harbour)
        values["FuelAtAnchorage"] = _num(fuel.consumed_at_anchorage)
        values["FuelAtSea"] = _num(fuel.consumed_at_sea)
        values["FuelTotal"] = _num(fuel.total_consumed)
        values["IsFuelReceived"] = 1 if _num(fuel.recieved, 0) else 0

    # Never send a key whose value we could not resolve — leaving the column untouched is
    # better than overwriting CMMS's own figure with a null.
    return {k: v for k, v in values.items() if v is not None}


def _ensure_header_uid(header):
    """The return's stable CMMS identity, minting and persisting one if it has none.

    A return pulled from CMMS already carries CMMS's own id; one raised in the SWMM form
    has none until its first push, so the id is minted here, once, and reused by every
    later push — that reuse is what lets CMMS recognise the same monthly return again
    instead of receiving a new record each time.

    This used to refuse the push instead, with "save it once more so a universal id is
    assigned". That advice could not work: nothing in the SRAR save path assigns this
    field. The id was minted by the payload-build step of the calling view — on its own
    freshly-loaded copy of the header — while the push was handed the caller's older
    instance, which still had the field blank in memory. So the first push of every
    SWMM-raised return failed on a value that had in fact just been written to the
    database one call earlier, and only a second click got through. Minting here makes
    the push self-sufficient and independent of what the caller did first.
    """
    header_uid = (header.universal_id_t_srar_mthly_header or "").strip()
    if header_uid:
        return header_uid

    header_uid = str(uuid.uuid4())
    header.universal_id_t_srar_mthly_header = header_uid
    header.save(update_fields=["universal_id_t_srar_mthly_header"])
    logger.info(
        "Minted CMMS identity %s for SRAR header %s (%s/%s).",
        header_uid,
        header.pk,
        header.srar_month,
        header.srar_year,
    )
    return header_uid


def _ledger_totals(summary):
    """Roll the per-table push summary up into one set of ledger counts.

    Values come in two shapes: a {"inserted"/"updated"/"skipped": n} dict for the tables
    that push row collections, and a bare "inserted"/"updated"/"no data" string for the
    single-row ones. Both are counted; "no data" is neither a write nor a skip, since there
    was nothing to write.
    """
    created = updated = skipped = 0
    for value in (summary or {}).values():
        if isinstance(value, dict):
            created += value.get("inserted", 0)
            updated += value.get("updated", 0)
            skipped += value.get("skipped", 0)
        elif value == "inserted":
            created += 1
        elif value == "updated":
            updated += 1
    return {
        "fetched": created + updated + skipped,
        "created": created,
        "updated": updated,
        "skipped": skipped,
    }


@ledgered(
    "push",
    "srar",
    # The per-table summary is {table: {"inserted": n, "updated": n, "skipped": n}} or the
    # string "updated"/"no data", so it is rolled up across tables rather than read directly.
    adapter=lambda summary: _ledger_totals(summary),
)
def push_srar_return(header, actor=None):
    """Write one SRAR return into CMMS. Returns a per-table summary dict.

    Raises CmmsPushError with a UI-ready message when the return cannot be pushed.
    Everything happens in one transaction: either the whole return lands or none of it.
    """
    from srar.models import (
        STP,
        AvcatStatus,
        ChMasterFullPowerConductedBy,
        DGUFSeaHarbourRunningHourDataInput,
        EEF,
        FPTEquipmentWise,
        FuelConsumptionMonth,
        H2SSensor,
        Iccp,
        InjectorFIPCalibrationReplacement,
        MagazineFFSystemFloodingSystem,
        OpsStatusofLubOilandCoolantTestKits,
        SafetyDeviceCheckTrial,
        FPTDieselAlternators,
        GasTurbineExploitation,
        GasTurbineGeneratorExploitation,
        RHExtension,
        ReductionGearExploitation,
        ReductionGearExploitationofGTG,
        SrarCentrifuge,
        SrarEquipmentExploitation,
        SrarHalfYearlyHeader,
        SrarMonthlyBoiler,
        SrarMonthlyLubricant,
        SrarMonthlyShipActivity,
        SrarMonthlyShipRunning,
        TorsionMeter,
    )

    header_uid = _ensure_header_uid(header)

    ship = header.ship
    if ship is None or not getattr(ship, "universal_id_m_ship", None):
        raise CmmsPushError(
            "The return is not linked to a ship with a CMMS id, so CMMS would not know "
            "which hull it belongs to."
        )

    actor_uid = getattr(actor, "universal_id_a_user", None) or None
    eef = EEF.objects.filter(srar_monthly_header=header).first()
    fuel = FuelConsumptionMonth.objects.filter(srar_monthly_header=header).first()
    avcat = AvcatStatus.objects.filter(srar_monthly_header=header).first()

    summary = {}
    conn = get_mssql_connection()
    try:
        cursor = conn.cursor()
        ctx = _PushContext(cursor, ship, header_uid, actor_uid)

        # ---- header ----------------------------------------------------------------
        header_key = {"Universal_ID_T_SRARMthlyHeader": header_uid}
        header_existing = _existing_row(
            cursor, "T_SRARMthlyHeader", header_key, ("CreatedDate",)
        )
        summary["T_SRARMthlyHeader"] = _upsert(
            cursor,
            "T_SRARMthlyHeader",
            header_key,
            _header_values(header, ctx, header_existing, eef, fuel),
        )

        # ---- equipment running hours (Form 1) --------------------------------------
        # Everything below links to the header by its integer SrarMthlyID as well as
        # its uid, so the header write above has to have happened first.
        summary["T_SRARMthlyEquipments"] = _push_equipment_rows(
            ctx, header, SrarEquipmentExploitation
        )

        # ---- fuel / avcat ----------------------------------------------------------
        summary["Ch_Ship_Mthly_Fuel_Consumption"] = _push_fuel(ctx, fuel)
        summary["Ch_Ship_Mnthly_Avcat_Status"] = _push_avcat(ctx, avcat)

        # ---- equipment-linked monthly tables ---------------------------------------
        summary["T_SRARMthlyBoiler"] = _push_simple_equipment_table(
            ctx,
            header,
            SrarMonthlyBoiler,
            "T_SRARMthlyBoiler",
            "Universal_ID_T_SRARMthlyBoiler",
            # Was five columns of the twenty-odd CMMS keeps, and two of those five never
            # arrived because _num() cannot read the "HH:MM" the hours fields hold.
            lambda row: {
                "HrsSteamedMonth": _hours_text(row.hrs_steamed_in_month),
                "HrsSteamedSinceCommissioning": _hours_text(
                    row.hrs_steamed_since_commissioning
                ),
                "HrAbove": _hours_text(row.hrs_above_20_percent),
                "HighestSalinity": row.highest_salinity_during_month,
                "LowestSalinity": row.lowest_salinity_during_month,
                "EquipmentCode": row.serial_no,
                "LastInternalCleaning": row.last_int_clg_date,
                "HrsSteamedInternalCleaning": _hours_text(
                    row.hrs_steamed_since_last_int_clg
                ),
                "HrsSteamedAtLastInternalCleaning": _hours_text(
                    row.hrs_steamed_at_last_int_clg
                ),
                "LastExternalCleaning": row.last_ext_clg_date,
                "HrsSteamedExternalCleaning": _hours_text(
                    row.hrs_steamed_since_last_ext_clg
                ),
                "HrsSteamedAtLastExternalCleaning": _hours_text(
                    row.hrs_steamed_at_last_ext_clg
                ),
                "LastRetublingDate": row.last_retubing_date,
                "HrsSteamedSinceLastRetubling": _hours_text(
                    row.hrs_steamed_since_last_retubing
                ),
                "HrsSteamedAtLastRetubling": _hours_text(
                    row.hrs_steamed_at_last_retubing
                ),
                "LastDurabilityDate": row.date_of_last_durability_test,
                "InspectionNxDueDate": row.due_date_for_next_inspection,
                "LifeAssessMonths": _num(row.life_assessed_in_months),
            },
        )
        summary["Ch_Ship_Mnthly_ICCP"] = _push_simple_equipment_table(
            ctx,
            header,
            Iccp,
            "Ch_Ship_Mnthly_ICCP",
            "Universal_ID_Ch_Ship_Mnthly_ICCP",
            lambda row: {
                "ICCP_Ops_NonOps": row.ops_or_non_ops,
                "ICCP_Non_Ops_Since": row.non_ops_since,
            },
        )

        # ---- the remaining monthly equipment tables --------------------------------
        # All four are the same shape as ICCP above: one row per equipment per return,
        # an ops/non-ops code, a "non ops since" date and a pair of calibration or trial
        # dates. Nothing was pushing any of them, which is why all four sit empty in
        # CMMS while SWMM's SRAR forms hold the data.
        summary["Ch_Ship_Mnthly_Torsion_Meter"] = _push_simple_equipment_table(
            ctx,
            header,
            TorsionMeter,
            "Ch_Ship_Mnthly_Torsion_Meter",
            "Universal_ID_Ch_Ship_Mnthly_Torsion_Meter",
            lambda row: {
                "Torsion_Ops_NonOps": row.ops_or_non_ops,
                "Torsionm_Eter_RDG": row.torsion_meter_rdg,
                "Max_SRPM_Achieved": row.max_rpm_achieved,
                "NON_Ops_Since": row.non_ops_since,
                "Last_Calibration": row.last_calibration_date,
                "Next_Calibration_Due": row.next_calibration_date,
            },
            ops_only_columns=(
                "Torsionm_Eter_RDG",
                "Max_SRPM_Achieved",
                "Last_Calibration",
                "Next_Calibration_Due",
            ),
        )
        summary["Ch_Ship_Mnthly_HS_Sensor"] = _push_simple_equipment_table(
            ctx,
            header,
            H2SSensor,
            "Ch_Ship_Mnthly_HS_Sensor",
            "Universal_ID_Ch_Ship_Mnthly_HS_Sensor",
            lambda row: {
                "Sensor_Ops_NonOps": row.ops_or_non_ops,
                "Sensor_Non_Ops_Since": row.non_ops_since,
                "Sensor_Last_Calibration": row.last_calibration_date,
                "Sensor_Next_Calibration_Due": row.next_calibration_date,
            },
            ops_only_columns=(
                "Sensor_Last_Calibration",
                "Sensor_Next_Calibration_Due",
            ),
        )
        # The magazine form calls these trials rather than calibrations; CMMS reuses its
        # calibration columns for them.
        summary["Ch_Ship_Mnthly_Magazine_System"] = _push_simple_equipment_table(
            ctx,
            header,
            MagazineFFSystemFloodingSystem,
            "Ch_Ship_Mnthly_Magazine_System",
            "Universal_ID_Ch_Ship_Mnthly_Magazine_System",
            lambda row: {
                "Magazine_Ops_NonOps": row.ops_or_non_ops,
                "Magazine_Non_Ops_Since": row.non_ops_since,
                "Magazine_Last_Calibration": row.last_trials_taken,
                "Magazine_Next_Calibration_Due": row.next_trials_due,
            },
            ops_only_columns=(
                "Magazine_Last_Calibration",
                "Magazine_Next_Calibration_Due",
            ),
        )
        # STP is the odd one: its own identity column is Universal_ID_STP, and the table
        # carries none of the legacy int keys or Source/CreatedBy columns the others do.
        # _upsert drops whatever the table does not have, so no special casing is needed.
        summary["Ch_Ship_Mnthly_STP"] = _push_simple_equipment_table(
            ctx,
            header,
            STP,
            "Ch_Ship_Mnthly_STP",
            "Universal_ID_STP",
            lambda row: {
                "STP_Ops_NonOps": row.ops_or_non_ops,
                "EffluentTestStatus": row.effluent_status,
                "EffluentTestDate": row.effluent_test_date,
                "Remarks": row.remarks,
            },
            ops_only_columns=(
                "EffluentTestStatus",
                "EffluentTestDate",
            ),
        )
        # ---- Form 3 ship activity, and the monthly tables nothing was pushing ------
        summary["T_SRARShipActivity"] = _push_ship_activity(
            ctx, header, SrarMonthlyShipActivity
        )
        summary["T_SRARMthlyShipRunning"] = _push_header_only_rows(
            ctx,
            SrarMonthlyShipRunning.objects.filter(srar_monthly_header=header),
            "T_SRARMthlyShipRunning",
            # More than one row per return is possible (one per month covered), so the
            # month is part of the key.
            lambda row: {"Months": row.months},
            lambda row: {
                "AtSeaInMonth": _num(row.at_sea_in_month),
                "AtHarbourInMonth": _num(row.at_harbour_in_month),
                "RemarkOfMonth": row.remark_of_month,
            },
        )
        summary["T_SRARMthlyShipActivity"] = _push_header_only_rows(
            ctx,
            DGUFSeaHarbourRunningHourDataInput.objects.filter(
                srar_monthly_header=header
            ),
            "T_SRARMthlyShipActivity",
            lambda row: {},
            lambda row: {
                "HoursUnderway": _hours_text(row.hours_underway),
                "HourAtSea": _hours_text(row.total_rh_at_sea),
                "HourAtAnchorage": _hours_text(row.anchorage),
                "HourAtHarbour": _hours_text(row.no_of_hours_in_harbour),
                "HourSupplyAvailable": _hours_text(
                    row.hours_shore_supply_avl_when_alongs
                ),
                "MoveInHarbour": _num(row.no_of_cold_moves_in_harbour),
                "CommentsSupplyAtHarbour": row.cmts_wrt_to_non_avl_shore_supply,
                # CMMS has no column of its own for the "other comments" box, and TEXT2
                # is the only free-text column left unused on this table.
                "TEXT2": row.other_cmts_wrt_to_non_avl_shore_supply,
            },
        )
        summary["Ch_Ship_Mnthly_Coolant_Test_Kits"] = _push_own_uid_rows(
            ctx,
            OpsStatusofLubOilandCoolantTestKits.objects.filter(
                srar_monthly_header=header
            ),
            "Ch_Ship_Mnthly_Coolant_Test_Kits",
            "Universal_ID_Ch_Ship_Mnthly_Coolant_Test_Kits",
            "universal_id",
            # Test_Kit_Description is an int FK into Ch_Master_Ship_Lub_Coolant_Kits,
            # not the free text SWMM holds, so the text is resolved against that master
            # by name -- sending the string put nothing there at all.
            lambda row: {
                "Test_Kit_Description": ctx.int_id(
                    "Ch_Master_Ship_Lub_Coolant_Kits",
                    "Coolant_Kits_ID",
                    "Universal_ID_Ch_Master_Ship_Lub_Coolant_Kits",
                    ctx.uid_by_name(
                        "Ch_Master_Ship_Lub_Coolant_Kits",
                        "Universal_ID_Ch_Master_Ship_Lub_Coolant_Kits",
                        "Coolant_Kit_Description",
                        row.description,
                    ),
                ),
                "Universal_ID_Ch_Master_Ship_Lub_Coolant_Kits": ctx.uid_by_name(
                    "Ch_Master_Ship_Lub_Coolant_Kits",
                    "Universal_ID_Ch_Master_Ship_Lub_Coolant_Kits",
                    "Coolant_Kit_Description",
                    row.description,
                ),
                "Test_Ops_NonOps": row.ops_or_non_ops,
                "Test_Ops_NonOps_Since": row.non_ops_since,
                "Test_Calibration_Date": row.calibration,
                "Test_Next_Calibration_Due": row.next_calibration_due_date,
            },
            ops_only_columns=(
                "Test_Calibration_Date",
                "Test_Next_Calibration_Due",
            ),
        )
        summary["Ch_Ship_Mnthly_Injector_Replacement"] = _push_simple_equipment_table(
            ctx,
            header,
            InjectorFIPCalibrationReplacement,
            "Ch_Ship_Mnthly_Injector_Replacement",
            "Universal_ID_Ch_Ship_Mnthly_Injector_Replacement",
            # CMMS's load bands are named for their lower bound and SWMM's for the whole
            # band, so 33-50 lands in HrsBelow50 and 50-70 in HrsAbove50.
            lambda row: {
                "Injector_Occasion": row.occasion,
                "InjectorDate": row.date_of_inj_fip_calibration,
                "Running_Hrs_Which_Replaced": _num(row.rh_at_which_replaced),
                "RHMnth": _hours_text(row.running_hours_months),
                "RHSinceInstallation": _hours_text(
                    row.running_hours_since_installation
                ),
                "HrsBelow33": _hours_text(row.hrs_run_below_33_percent),
                "HrsBelow50": _hours_text(row.hrs_run_33_to_50_percent),
                "HrsAbove50": _hours_text(row.hrs_run_50_to_70_percent),
                "HrsAbove70": _hours_text(row.hrs_run_70_to_100_percent),
                "LUBOil": _num(row.lub_oil_consumption_in_month),
                "FuelConsumptionInMonth": _num(row.fuel_consumption_in_month),
                "Remarks": row.remarks,
            },
        )
        summary["Ch_Ship_Mnthly_Status_Safety"] = _push_simple_equipment_table(
            ctx,
            header,
            SafetyDeviceCheckTrial,
            "Ch_Ship_Mnthly_Status_Safety",
            "Universal_ID_Ch_Ship_Mnthly_Status_Safety",
            lambda row: {
                "SDC_Conducted": row.sdc_conducted_by,
                "Safety_Date": row.date_of_sdc,
                "SafetySFCNumber": _num(row.sfc_in_gm_kwh),
                "SafetySFCDate": row.last_sfc_trial_date,
                "SafetySFCDisplacement": _num(row.displacement_during_sfc_trial),
            },
        )
        # ---- the half-yearly half of the return ------------------------------------
        # Resolved before the full-power push rather than after it. That table is the one
        # carrying both period keys, so it needs half_yearly_uid already on ctx --
        # resolved afterwards, link_values had nothing to add and every row SWMM wrote
        # landed with Universal_ID_T_SRARHlfYrlyHeader and SRARHfyrlyID null, beside
        # CMMS's own rows for the same trial which carry both.
        ctx.half_yearly_uid = _resolve_half_yearly_header(
            ctx, header, SrarHalfYearlyHeader
        )

        summary["Ch_SRAR_Qrtrly_Full_Power_Trails"] = _push_full_power_trials(
            ctx, header, FPTEquipmentWise, ChMasterFullPowerConductedBy
        )

        if ctx.half_yearly_uid:
            summary.update(
                _push_half_yearly_tables(
                    ctx,
                    header,
                    {
                        "ChMasterFullPowerConductedBy": ChMasterFullPowerConductedBy,
                        "FPTDieselAlternators": FPTDieselAlternators,
                        "GasTurbineExploitation": GasTurbineExploitation,
                        "GasTurbineGeneratorExploitation": (
                            GasTurbineGeneratorExploitation
                        ),
                        "RHExtension": RHExtension,
                        "ReductionGearExploitation": ReductionGearExploitation,
                        "ReductionGearExploitationofGTG": ReductionGearExploitationofGTG,
                        "SrarMonthlyLubricant": SrarMonthlyLubricant,
                    },
                )
            )

        summary["Ch_Ship_Mnthly_Lub_Fuel_Centrifuge"] = _push_simple_equipment_table(
            ctx,
            header,
            SrarCentrifuge,
            "Ch_Ship_Mnthly_Lub_Fuel_Centrifuge",
            "Universal_ID_Ch_Ship_Mnthly_Lub_Fuel_Centrifuge",
            lambda row: {"Centrifuge_NonOps_Since": row.non_ops_since},
        )

        conn.commit()
    except CmmsPushError:
        conn.rollback()
        raise
    except Exception as exc:
        conn.rollback()
        logger.exception("SRAR push to CMMS failed for header %s", header.pk)
        raise CmmsPushError(f"CMMS rejected the write: {exc}") from exc
    finally:
        conn.close()

    # Only now that CMMS holds the rows: record the identities it minted, so the next
    # CMMS -> SWMM pull matches these rows instead of duplicating them.
    for obj, field, value in ctx.pending_uid_writes:
        setattr(obj, field, value)
        obj.save(update_fields=[field])

    return summary


def _equipment_uid(row):
    """The CMMS equipment id behind a SWMM child row, or None if it has no equipment."""
    sfd = getattr(row, "sfd_details", None)
    if sfd is None:
        return None
    return getattr(sfd, "universal_id_t_equipment_ship_detail", None) or None


def _push_equipment_rows(ctx, header, model):
    """Form 1 running hours -> T_SRARMthlyEquipments."""
    cursor = ctx.cursor
    counts = {"inserted": 0, "updated": 0, "skipped": 0}
    rows = model.objects.filter(srar_monthly_header=header).select_related(
        "sfd_details"
    )
    for row in rows:
        eq_uid = _equipment_uid(row)
        if not eq_uid:
            counts["skipped"] += 1
            continue
        key = {
            "Universal_ID_T_SRARMthlyHeader": ctx.header_uid,
            "Universal_ID_T_EquipmentShipDetail": eq_uid,
        }
        existing = _existing_row(cursor, "T_SRARMthlyEquipments", key, ("CreatedDate",))

        values = {
            "HrsForMonth": _hr_min_to_decimal(
                row.hrs_for_month_hrs,
                row.hrs_for_month_min,
                fallback=_num(row.hrs_for_month),
            ),
            # Both figures are decimal hours in CMMS, so both go through the h/m pair.
            # This used to send _num(rhsi_till_current_month) -- the whole-hours field --
            # which silently dropped the minutes on any return that had been pulled from
            # CMMS and pushed back (the pull splits 28826.55 into 28826h 33m, and only
            # the 28826 was sent back).
            "HrsFromInstallation": _hr_min_to_decimal(
                row.rhsi_till_current_month_hr,
                row.rhsi_till_current_month_min,
                fallback=_num(row.rhsi_till_current_month),
            ),
            # CMMS records this against its own rows; SWMM knows it from the SFD, so
            # there is no reason for a pushed row to be the only one without it.
            "EquipmentSrNumber": getattr(row.sfd_details, "equipment_serial_no", None)
            or None,
        }
        values.update(ctx.link_values(eq_uid))
        values.update(ctx.audit_values(existing, created_on=row.created_on))
        values = {k: v for k, v in values.items() if v is not None}
        # Its own identity is required and must survive re-pushes, so it is only ever
        # written on the insert.
        if existing is None:
            values["Universal_ID_T_SRARMthlyEquipments"] = str(uuid.uuid4())
        counts[_upsert(cursor, "T_SRARMthlyEquipments", key, values)] += 1
    return counts


def _push_header_linked_table(
    ctx,
    table,
    own_uid_column,
    obj,
    uid_field,
    column_map,
):
    """One header-level monthly table (fuel / AVCAT) into CMMS.

    A shared body on purpose, mirroring the pull side's
    `_pull_srar_header_linked_table`: these were two near-identical functions and they
    drifted. The AVCAT one wrote only 2 of its 7 figures, so CMMS held NULLs for
    Avcat_Given_Ac / Used_For_Trials_Drained / Avcat_TotalConsumption / Avcat_Defuelled
    / Balance_Left_Onboard while SWMM had every one of them recorded. One body and one
    column map per table means the next column added cannot go missing from one side.

    `column_map` is {cmms_column: local_model_field} -- the inverse of the pull's map,
    which is keyed the other way round.
    """
    if obj is None:
        return "no data"

    cursor = ctx.cursor
    key = {"Universal_ID_T_SRARMthlyHeader": ctx.header_uid}
    values = dict(ctx.link_values())
    for cmms_column, field in column_map.items():
        values[cmms_column] = _num(getattr(obj, field, None))

    # Read the identity rather than just counting: the row's own uid is minted once on
    # insert and left alone afterwards, but either way SWMM has to end up holding it.
    # The CMMS -> SWMM pull keys on exactly this column, so a local row that was never
    # told the uid CMMS has for it comes back from the next pull as a second copy of
    # the same return's figures instead of updating in place. It used to be minted here
    # and thrown away, so already-pushed returns are picked up on this pass too.
    existing = _existing_row(cursor, table, key, (own_uid_column, "CreatedDate"))
    known_uid = getattr(obj, uid_field, None) or None

    values.update(ctx.audit_values(existing, created_on=obj.created_on))
    # Never send a key whose value we could not resolve -- see _header_values.
    values = {k: v for k, v in values.items() if v is not None}

    if existing is None:
        row_uid = known_uid or str(uuid.uuid4())
        # The uid SWMM holds can already belong to a CMMS row filed under a different
        # header -- a return re-created locally keeps its child rows' old uids. That
        # column is the primary key on these tables, so reusing it aborts the entire
        # push on a duplicate-key violation. Mint a fresh one in that case.
        if (
            known_uid
            and _existing_row(cursor, table, {own_uid_column: known_uid}) is not None
        ):
            row_uid = str(uuid.uuid4())
        values[own_uid_column] = row_uid
    else:
        row_uid = existing.get(own_uid_column) or known_uid

    if row_uid and row_uid != known_uid:
        ctx.pending_uid_writes.append((obj, uid_field, row_uid))

    return _upsert(cursor, table, key, values)


def _push_fuel(ctx, fuel):
    return _push_header_linked_table(
        ctx,
        "Ch_Ship_Mthly_Fuel_Consumption",
        "Universal_ID_Ch_Ship_Mthly_Fuel_Consumption",
        fuel,
        "universal_id_ch_ship_mthly_fuel_consumption",
        {
            "BF_From_Last_Month": "b_f_from_last_month",
            "Fuel_Received": "recieved",
            "Fuel_Harbour": "consumed_in_harbour",
            "Fuel_Anchorage": "consumed_at_anchorage",
            "Fuel_Sea": "consumed_at_sea",
            "Fuel_Total_Consumption": "total_consumed",
            "Fuel_Defuelled": "defueled",
            "Fuel_Balance_Left_Onboard": "balance_left_on_board",
        },
    )


def _push_avcat(ctx, avcat):
    return _push_header_linked_table(
        ctx,
        "Ch_Ship_Mnthly_Avcat_Status",
        "Universal_ID_Ch_Ship_Mnthly_Avcat_Status",
        avcat,
        "universal_id_ch_ship_mnthly_avcat_status",
        {
            "Avcat_BF_From_Last_Month": "b_f_from_last_month",
            "Avcat_Received": "recieved",
            "Avcat_Given_Ac": "given_to_ac",
            "Used_For_Trials_Drained": "used_for_trials_drained",
            "Avcat_TotalConsumption": "total_consumed",
            "Avcat_Defuelled": "defuelded",
            "Balance_Left_Onboard": "balance_left_on_board",
        },
    )


def _push_ship_activity(ctx, header, activity_model):
    """Form 3 -> T_SRARShipActivity + Ch_ShipMonthlyMasterActivity.

    CMMS splits Form 3 across two tables: one wrapper row per return, and one row per
    activity line hanging off it by Universal_ID_T_SRARShipActivity. SWMM models only
    the lines (SrarMonthlyShipActivity), so the wrapper is minted here -- push the lines
    without it and CMMS ends up with activity rows referencing nothing.

    Each line's own identity is stored back on the SWMM row
    (universal_id_ch_shipmonthlymasteractivity, which the model already carries) so the
    next push updates it rather than adding a duplicate.
    """
    cursor = ctx.cursor
    rows = list(
        activity_model.objects.filter(srar_monthly_header=header).select_related(
            "ship_state", "ship_location", "ship_activity_type", "ship_activity_detail"
        )
    )
    if not rows:
        return "no data"

    # ---- the wrapper ------------------------------------------------------
    key = {"Universal_ID_T_SRARMthlyHeader": ctx.header_uid}
    existing = _existing_row(
        cursor,
        "T_SRARShipActivity",
        key,
        ("Universal_ID_T_SRARShipActivity", "CreatedDate"),
    )
    dates = [row.from_date for row in rows if row.from_date]
    values = dict(ctx.link_values())
    values["ActivityDate"] = min(dates) if dates else None
    values.update(ctx.audit_values(existing, created_on=rows[0].created_on))
    values = {k: v for k, v in values.items() if v is not None}

    if existing is None:
        wrapper_uid = str(uuid.uuid4())
        values["Universal_ID_T_SRARShipActivity"] = wrapper_uid
    else:
        wrapper_uid = existing.get("Universal_ID_T_SRARShipActivity")
    counts = {
        "wrapper": _upsert(cursor, "T_SRARShipActivity", key, values),
        "inserted": 0,
        "updated": 0,
    }

    # ---- the activity lines ----------------------------------------------
    for row in rows:
        row_uid = row.universal_id_ch_shipmonthlymasteractivity or str(uuid.uuid4())
        line_key = {"Universal_ID_Ch_ShipMonthlyMasterActivity": row_uid}
        line_existing = _existing_row(
            cursor, "Ch_ShipMonthlyMasterActivity", line_key, ("Created_Date",)
        )
        # The four master uids are already on SWMM's own lookup rows -- they are synced
        # from these very CMMS tables -- so no name matching is needed, and CMMS's
        # legacy integer keys resolve from them the same way Ship_ID does.
        state = ctx.master_uid(
            row.ship_state,
            "Universal_ID_Ch_Master_Ship_State",
            "Ch_Master_Ship_State",
            "Universal_ID_Ch_Master_Ship_State",
            "Ship_State_Name",
        )
        location = ctx.master_uid(
            row.ship_location,
            "Universal_ID_Ch_Master_Ship_Location",
            "Ch_Master_Ship_Location",
            "Universal_ID_Ch_Master_Ship_Location",
            "Location_Name",
        )
        act_type = ctx.master_uid(
            row.ship_activity_type,
            "Universal_ID_Ch_Master_Ship_Activity_Type",
            "Ch_Master_Ship_Activity_Type",
            "Universal_ID_Ch_Master_Ship_Activity_Type",
            "Activity_Type_Name",
        )
        detail = ctx.master_uid(
            row.ship_activity_detail,
            "Universal_ID_Ch_Master_Ship_Activity_Detail",
            "Ch_Master_Ship_Activity_Detail",
            "Universal_ID_Ch_Master_Ship_Activity_Detail",
            "Activity_Detail_Name",
        )
        line = {
            "From_Date": row.from_date,
            "To_Date": row.to_date,
            "Comment": row.remarks,
            "Status": 1,
            "Universal_ID_Ch_Master_Ship_State": state,
            "Universal_ID_Ch_Master_Ship_Location": location,
            "Universal_ID_Ch_Master_Ship_Activity_Type": act_type,
            "Universal_ID_Ch_Master_Ship_Activity_Detail": detail,
            "Ship_State_ID": ctx.int_id(
                "Ch_Master_Ship_State",
                "Ship_State_ID",
                "Universal_ID_Ch_Master_Ship_State",
                state,
            ),
            "Location_ID": ctx.int_id(
                "Ch_Master_Ship_Location",
                "Location_ID",
                "Universal_ID_Ch_Master_Ship_Location",
                location,
            ),
            "Activity_Type_ID": ctx.int_id(
                "Ch_Master_Ship_Activity_Type",
                "Activity_Type_ID",
                "Universal_ID_Ch_Master_Ship_Activity_Type",
                act_type,
            ),
            "Activity_Detail_ID": ctx.int_id(
                "Ch_Master_Ship_Activity_Detail",
                "Activity_Detail_ID",
                "Universal_ID_Ch_Master_Ship_Activity_Detail",
                detail,
            ),
            "Universal_ID_T_SRARShipActivity": wrapper_uid,
            "Universal_ID_T_SRARMthlyHeader": ctx.header_uid,
            "Universal_ID_M_Ship": ctx.ship_uid,
        }
        line.update(ctx.audit_values(line_existing, created_on=row.created_on))
        line = {k: v for k, v in line.items() if v is not None}
        counts[_upsert(cursor, "Ch_ShipMonthlyMasterActivity", line_key, line)] += 1
        if row.universal_id_ch_shipmonthlymasteractivity != row_uid:
            ctx.pending_uid_writes.append(
                (row, "universal_id_ch_shipmonthlymasteractivity", row_uid)
            )

    return counts


def _push_header_only_rows(ctx, rows, table, extra_key, value_builder):
    """A monthly table keyed on the header alone (plus `extra_key` when it holds more
    than one row per return). Neither of the two tables that use this carries its own
    universal id column in CMMS, so there is nothing to mint or write back.
    """
    rows = list(rows)
    if not rows:
        return "no data"
    counts = {"inserted": 0, "updated": 0}
    for row in rows:
        key = {"Universal_ID_T_SRARMthlyHeader": ctx.header_uid}
        key.update(extra_key(row))
        existing = _existing_row(ctx.cursor, table, key, ("CreatedDate", "Createddate"))
        values = dict(ctx.link_values())
        values.update(value_builder(row))
        values.update(ctx.audit_values(existing, created_on=row.created_on))
        values = {k: v for k, v in values.items() if v is not None}
        counts[_upsert(ctx.cursor, table, key, values)] += 1
    return counts


def _resolve_half_yearly_header(ctx, header, half_yearly_model):
    """Make sure CMMS holds the half-yearly return this monthly one falls into.

    SWMM raises no half-yearly return, so the period is derived from the monthly one --
    Jan-Jun or Jul-Dec of the same year -- and recorded locally on SrarHalfYearlyHeader
    so its identity survives to the next push. CMMS stores the period as a month, hence
    SRARMonth 6 or 12.

    Returns the universal id, or None when the return has no period to derive one from.
    """
    month = header.srar_month
    year = header.srar_year
    if not month or not year:
        return None

    half = 1 if int(month) <= 6 else 2
    local, _ = half_yearly_model.objects.get_or_create(
        ship=header.ship, srar_year=int(year), srar_half=half
    )
    key = {
        "Universal_ID_T_SRARHlfYrlyHeader": (
            local.universal_id_t_srar_hlf_yrly_header or str(uuid.uuid4())
        )
    }
    existing = _existing_row(ctx.cursor, "T_SRARHlfYrlyHeader", key, ("CreatedDate",))
    values = {
        "ShipID": ctx.ship_int_id,
        "Universal_ID_M_Ship": ctx.ship_uid,
        "SRARMonth": 6 if half == 1 else 12,
        "SRARYear": int(year),
        "Is_Final_Submit": 1 if header.co_approved else 0,
        "Is_Pushed_To_CMMS": 1,
    }
    values.update(ctx.audit_values(existing, created_on=local.created_on))
    values = {k: v for k, v in values.items() if v is not None}
    _upsert(ctx.cursor, "T_SRARHlfYrlyHeader", key, values)

    row_uid = key["Universal_ID_T_SRARHlfYrlyHeader"]
    if local.universal_id_t_srar_hlf_yrly_header != row_uid:
        ctx.pending_uid_writes.append(
            (local, "universal_id_t_srar_hlf_yrly_header", row_uid)
        )
    return row_uid


def _push_half_yearly_tables(ctx, header, models):
    """The seven CMMS tables that hang off the half-yearly return.

    Every SWMM form behind them is filed against the monthly header, so the rows are
    read from this return and written under the half-yearly period it falls into. Column
    naming follows CMMS: QRT is the period figure, SI is "since installation".
    """
    summary = {}

    def push(model, table, own_uid_column, builder):
        return _push_simple_equipment_table(
            ctx,
            header,
            model,
            table,
            own_uid_column,
            builder,
            header_column="Universal_ID_T_SRARHlfYrlyHeader",
        )

    conducted_uid_by_name = {
        (row.full_power_conducted_by or "").strip().upper(): row.universal_id
        for row in models["ChMasterFullPowerConductedBy"].objects.all()
        if row.universal_id
    }

    summary["Ch_SRAR_Qrtrly_Full_Power_Trails_Diesel_Alt"] = push(
        models["FPTDieselAlternators"],
        "Ch_SRAR_Qrtrly_Full_Power_Trails_Diesel_Alt",
        "Universal_ID_Ch_SRAR_Qrtrly_Full_Power_Trails_Diesel_Alt",
        lambda row: {
            "DieselAltDate": row.date,
            "OccasionReason": row.occasion,
            "RatedLoad": _num(row.rated_load),
            "MaxLoadAchieved": _num(row.max_load_achieved),
            "ConductedBy": row.conducted_by,
            "LastEHMTrials": row.last_ehm_trials_undertaken_on,
            "Remarks": row.remarks,
            "Universal_ID_Ch_Master_Full_Power_Conducted_By": conducted_uid_by_name.get(
                (row.conducted_by or "").strip().upper()
            ),
        },
    )

    summary["Ch_SRAR_Qrtly_GTRG_Exploitations_Gas"] = push(
        models["GasTurbineExploitation"],
        "Ch_SRAR_Qrtly_GTRG_Exploitations_Gas",
        "Universal_ID_Ch_SRAR_Qrtly_GTRG_Exploitations_Gas",
        # CMMS names its three running-hour bands HoursAt / HoursGreater / HoursLesser;
        # SWMM calls the same three regimes 1, 2 and 3, in that order.
        lambda row: {
            "HotStartsQRT": _num(row.no_of_hot_starts_in_month),
            "HotStartsSI": _num(row.no_of_hot_starts_si),
            "ColdStartsQRT": _num(row.no_of_cold_starts_in_month),
            "ColdStartsSI": _num(row.no_of_cold_starts_si),
            "FreshStartsQRT": _num(row.no_of_false_starts_in_month),
            "FreshStartsSI": _num(row.no_of_false_starts_si),
            "TechStartsQRT": _num(row.no_of_tech_starts_in_month),
            "TechStartsSI": _num(row.no_of_tech_starts_si),
            "HoursAtQRT": _hours_text(row.rh_regime_1_in_mth),
            "HoursAtSI": _hours_text(row.rh_regime_1_si),
            "HoursGreaterQRT": _hours_text(row.rh_regime_2_in_mth),
            "HoursGreaterSI": _hours_text(row.rh_regime_2_si),
            "HoursLesserQRT": _hours_text(row.rh_regime_3_in_mth),
            "HoursLesserSI": _hours_text(row.rh_regime_3_si),
            "TotalQRT": _hours_text(row.total_rh_in_month),
            "TotalSI": _hours_text(row.total_rh_si),
            "NoAsternQRT": _num(row.no_of_astern_engagements_in_mth),
            "NoAsternSI": _num(row.no_of_astern_engagements_count),
            "PropStopOrdersQRT": _num(row.no_of_stop_orders_in_mth),
            "PropStopOrdersSI": _num(row.no_of_stop_orders_si),
            "LastChemCGL": row.last_chem_clg,
        },
    )

    summary["Ch_SRAR_Qrtly_GTRG_Exploitations_Reduction"] = push(
        models["ReductionGearExploitation"],
        "Ch_SRAR_Qrtly_GTRG_Exploitations_Reduction",
        "Universal_ID_Ch_SRAR_Qrtly_GTRG_Exploitations_Reduction",
        # RegimeI..III carry the running hours per regime; the _2 set carries the
        # engagement counts, which is why regime 1's count goes to RGEngagement.
        lambda row: {
            "TotalQRT": _hours_text(row.total_rh_in_month),
            "TotalSI": _hours_text(row.total_rh_si),
            "TrailingHoursQRT": _hours_text(row.trailing_rh_in_month),
            "TrailingHoursSI": _hours_text(row.trailing_rh_si),
            "ServiceLifeQRT": _hours_text(row.service_life_in_month),
            "ServiceLifeSI": _hours_text(row.service_life_si),
            "RegimeIQRT": _hours_text(row.total_rh_regime1_in_month),
            "RegimeISI": _hours_text(row.total_rh_regime1_si),
            "RegimeIIQRT": _hours_text(row.total_rh_regime2_in_month),
            "RegimeIISI": _hours_text(row.total_rh_regime2_si),
            "RegimeIIIQRT": _hours_text(row.total_rh_regime3_in_month),
            "RegimeIIISI": _hours_text(row.total_rh_regime3_si),
            "RGEngagementQRT": _num(row.no_of_eng_regime1_in_month),
            "RGEngagementSI": _num(row.no_of_eng_regime1_si),
            "RegimeIIQRT_2": _num(row.no_of_eng_regime2_in_month),
            "RegimeIISI_2": _num(row.no_of_eng_regime2_si),
            "RegimeIIIQRT_2": _num(row.no_of_eng_regime3_in_month),
            "RegimeIIISI_2": _num(row.no_of_eng_regime3_si),
            "RegimeIVQRT_2": _num(row.no_of_eng_regime4_in_month),
            "RegimeIVSI_2": _num(row.no_of_eng_regime4_si),
        },
    )

    summary["Ch_Ship_Qtrly_GTG_Gas_Turbine_Generator"] = push(
        models["GasTurbineGeneratorExploitation"],
        "Ch_Ship_Qtrly_GTG_Gas_Turbine_Generator",
        "Universal_ID_Ch_Ship_Qtrly_GTG_Gas_Turbine_Generator",
        lambda row: {
            "No_Of_Hot_Starts_Qtr": _num(row.no_of_hot_starts_in_month),
            "No_Of_Hot_Starts_SI": _num(row.no_of_hot_starts_si),
            "No_Of_Cold_Starts_Qtr": _num(row.no_of_cold_starts_in_month),
            "No_Of_Cold_Starts_SI": _num(row.no_of_cold_starts_si),
            "No_Of_Battery_Cold_Starts_Qtr": _num(
                row.no_of_battery_cold_starts_in_month
            ),
            "No_Of_Battery_Cold_Starts_SI": _num(row.no_of_battery_cold_starts_si),
            "No_Of_Battery_Hot_Starts_Qtr": _num(row.no_of_battery_hot_starts_in_month),
            "No_Of_Battery_Hot_Starts_SI": _num(row.no_of_battery_hot_starts_si),
            "TC_RH_In_Harbour": _hours_text(row.total_rh_in_harbour),
            "TC_RH_At_Sea": _hours_text(row.total_rh_in_sea),
            "TC_Running_Hrs_Qtr": _hours_text(row.total_rh_in_month),
            "TC_Running_Hrs_SI": _hours_text(row.total_rh_si),
        },
    )

    summary["Ch_Ship_Qtrly_GTG_Utilization_Factor"] = push(
        models["ReductionGearExploitationofGTG"],
        "Ch_Ship_Qtrly_GTG_Utilization_Factor",
        "Universal_ID_Ch_Ship_Qtrly_GTG_Utilization_Factor",
        lambda row: {
            "RG_Running_Hrs_Qtr": _hours_text(row.rg_running_hours),
            "RG_Running_Hrs_SI": _hours_text(row.in_months_si),
        },
    )

    summary["Ch_Ship_Qtrly_Running_Hours_Ext_Trial"] = push(
        models["RHExtension"],
        "Ch_Ship_Qtrly_Running_Hours_Ext_Trial",
        "Universal_ID_Ch_Ship_Qtrly_Running_Hours_Ext_Trial",
        lambda row: {
            "OnRoutine": row.on_routine_text or row.on_routine,
            "RHConExTrial": _hours_text(row.rh_ext_at_conduct_of_ext_trial),
            "AuthorityGrant": row.authority_letter_for_extension_trial,
            "HrsExtGranted": _hours_text(row.rh_extension_granted_upto),
            "HrsExpiryExt": _hours_text(row.rh_left_for_expiry_of_extension),
            "DERType": row.equipment_type,
            "RunningHrsDieselAlt": _hours_text(row.total_rh_in_month),
        },
    )

    # Lubricant consumption carries no equipment of its own, so it is keyed on the
    # half-yearly return plus the lubricant it reports.
    lubricant_model = models["SrarMonthlyLubricant"]
    counts = {"inserted": 0, "updated": 0, "skipped": 0}
    for row in lubricant_model.objects.filter(
        srar_monthly_header=header
    ).select_related("lubricant"):
        # SWMM's lubricant rows usually carry only the free-text name, with the FK to
        # the synced lubricant master left unset -- so the uid has to be matched on the
        # name, the same way the Form 3 activity masters are.
        lubricant_uid = getattr(row.lubricant, "universal_id", None) or ctx.uid_by_name(
            "M_Lubricant",
            "Universal_ID_M_Lubricant",
            "LubricantName",
            getattr(row.lubricant, "lubricant_name", None) or row.name,
        )
        if not lubricant_uid:
            counts["skipped"] += 1
            continue
        key = {
            "Universal_ID_T_SRARHlfYrlyHeader": ctx.half_yearly_uid,
            "Universal_ID_M_Lubricant": lubricant_uid,
        }
        existing = _existing_row(
            ctx.cursor,
            "T_SRARHfyrlyLubricantConsumption",
            key,
            ("Universal_ID_T_SRARHfyrlyLubricantConsumption", "CreatedDate"),
        )
        values = dict(ctx.link_values())
        values["LubricantQty"] = _num(row.quantity)
        values["Lubricant_Unit"] = row.unit
        values.update(ctx.audit_values(existing, created_on=row.created_on))
        values = {k: v for k, v in values.items() if v is not None}
        if existing is None:
            values["Universal_ID_T_SRARHfyrlyLubricantConsumption"] = str(uuid.uuid4())
        counts[
            _upsert(ctx.cursor, "T_SRARHfyrlyLubricantConsumption", key, values)
        ] += 1
    summary["T_SRARHfyrlyLubricantConsumption"] = counts

    return summary


def _push_own_uid_rows(
    ctx,
    rows,
    table,
    own_uid_column,
    uid_field,
    value_builder,
    ops_only_columns=(),
):
    """A monthly table whose rows are keyed on their own universal id.

    The lub-oil / coolant test kits are the case this exists for: CMMS keys that table
    on the equipment like its neighbours, but SWMM's kits are described by free text and
    carry no equipment at all, so keying on the equipment skipped every one of them and
    the table stayed empty. Their own uid is the only stable identity they have.
    """
    rows = list(rows)
    if not rows:
        return "no data"
    counts = {"inserted": 0, "updated": 0}
    for row in rows:
        row_uid = getattr(row, uid_field, None) or str(uuid.uuid4())
        key = {own_uid_column: row_uid}
        existing = _existing_row(ctx.cursor, table, key, ("CreatedDate",))

        ops_status.clear_on_instance(row)
        values = dict(value_builder(row))
        eq_uid = _equipment_uid(row)
        values.update(ctx.link_values(eq_uid))
        values["Universal_ID_T_SRARMthlyHeader"] = ctx.header_uid
        values.update(ctx.audit_values(existing, created_on=row.created_on))
        values = {k: v for k, v in values.items() if v is not None}
        if ops_only_columns and ops_status.is_not_ops(
            getattr(row, "ops_or_non_ops", None)
        ):
            for column in ops_only_columns:
                values[column] = EXPLICIT_NULL

        counts[_upsert(ctx.cursor, table, key, values)] += 1
        if getattr(row, uid_field, None) != row_uid:
            ctx.pending_uid_writes.append((row, uid_field, row_uid))
    return counts


def _push_full_power_trials(ctx, header, equipment_model, conducted_by_model):
    """Form 9 -> Ch_SRAR_Qrtrly_Full_Power_Trails.

    Named quarterly but, unlike its diesel-alternator sibling and the GTG tables, this
    one carries Universal_ID_T_SRARMthlyHeader and SrarMthlyID as well, so a monthly
    return can write it.

    One CMMS row per equipment: the per-equipment figures come from FPTEquipmentWise and
    the trial-wide ones (date, draught, displacement, sea state) from the
    FullPowerTrialsMainEngine row those hang off.
    """
    conducted_uid_by_name = {
        (row.full_power_conducted_by or "").strip().upper(): row.universal_id
        for row in conducted_by_model.objects.all()
        if row.universal_id
    }

    def builder(row):
        parent = row.fpt_main_engine
        conducted = (getattr(parent, "conducted_by", "") or "").strip().upper()
        return {
            "MainEngineDate": getattr(parent, "date", None),
            "OccasionReason": getattr(parent, "occasion_reason", None),
            "Draught": _num(getattr(parent, "draught_fwd", None)),
            "DraughtAFT": _num(getattr(parent, "draught_aft", None)),
            "Displacement": _num(getattr(parent, "displacement", None)),
            "MaxSpeed": _num(getattr(parent, "max_speed", None)),
            "TorsionMtr": getattr(parent, "torsion_meter_reading", None),
            "SeaState": getattr(parent, "sea_state", None),
            "RemarkNotAchievingFPT": getattr(
                parent, "pending_dr_activities_reason", None
            ),
            "Universal_ID_Ch_Master_Full_Power_Conducted_By": conducted_uid_by_name.get(
                conducted
            ),
            "FuelRackDBR": row.fuel_rack_dbr_max,
            "PCLThrottleMarking": row.marking_max,
            "LastEHMTrials": row.undertaken_on,
            "Pitch": _num(row.pitch),
            "Max_RPM": _num(row.max_rpm),
            "Rated_Power": _num(row.rated_power),
            "Max_Achieved_Power": _num(row.max_achieved_power),
            "Remarks": row.remarks,
        }

    return _push_simple_equipment_table(
        ctx,
        header,
        equipment_model,
        "Ch_SRAR_Qrtrly_Full_Power_Trails",
        "Universal_ID_Ch_SRAR_Qrtrly_Full_Power_Trails",
        builder,
    )


def _push_simple_equipment_table(
    ctx,
    header,
    model,
    table,
    own_uid_column,
    value_builder,
    ops_only_columns=(),
    header_column="Universal_ID_T_SRARMthlyHeader",
):
    """One equipment-linked monthly table, keyed on header + equipment.

    `ops_only_columns` are the CMMS columns that may only hold a value while the row is
    OPS -- readings, and the calibration or trial dates that presuppose equipment that
    is actually held. They are nulled in CMMS whenever the row says otherwise. See
    srar.ops_status for the rule and the SWMM-side fields it clears.
    """
    cursor = ctx.cursor
    counts = {"inserted": 0, "updated": 0, "skipped": 0}
    rows = model.objects.filter(srar_monthly_header=header).select_related(
        "sfd_details"
    )
    for row in rows:
        eq_uid = _equipment_uid(row)
        if not eq_uid:
            counts["skipped"] += 1
            continue
        key = {
            header_column: (
                ctx.header_uid
                if header_column == "Universal_ID_T_SRARMthlyHeader"
                else ctx.half_yearly_uid
            ),
            "Universal_ID_T_EquipmentShipDetail": eq_uid,
        }
        existing = _existing_row(cursor, table, key, ("CreatedDate",))

        # Rows saved before the not-OPS rule existed still hold readings for equipment
        # they declare Non OPS or Not Held. Blanked on the in-memory instance only, so
        # nothing stale reaches CMMS without this push rewriting SWMM's own tables.
        ops_status.clear_on_instance(row)

        values = dict(value_builder(row))

        # Retract, do not merely omit. A row that was OPS last month already put its
        # reading into CMMS, and every other None here means "leave CMMS's own figure
        # alone" -- so dropping these keys would leave that reading standing against a
        # row now marked Not Held. Written unconditionally rather than only when the
        # local row still holds something, because by this point the save has usually
        # blanked it already.
        if ops_only_columns and ops_status.is_not_ops(row.ops_or_non_ops):
            for column in ops_only_columns:
                values[column] = EXPLICIT_NULL
        values.update(ctx.link_values(eq_uid))
        values.update(ctx.audit_values(existing, created_on=row.created_on))
        values = {k: v for k, v in values.items() if v is not None}
        if existing is None:
            values[own_uid_column] = str(uuid.uuid4())
        counts[_upsert(cursor, table, key, values)] += 1
    return counts
