from django.db import transaction
from django.db.models import Q, Sum
from rest_framework.exceptions import ValidationError

from master.utils import get_this_ship

# A calendar month has at most 31 * 24 = 744 hours, and no plausible warship covers
# more than ~25,000nm running flat-out for an entire month — mirrors
# srar.utils.get_dynamic_exploitation_kpis, which excludes the same handful of
# corrupted/legacy-migrated monthly figures for the same reason.
MAX_PLAUSIBLE_MONTH_HOURS = 744
MAX_PLAUSIBLE_MONTH_DISTANCE_NM = 25000


def _this_ship_scope_q(explicit_ship_id=None):
    """Q filter matching "this ship"'s SrarMonthlyHeader rows — mirrors
    srar.utils._current_ship_scope_q (SWMM is one install per ship). ORs in
    `ship__isnull=True` because the transaction form doesn't consistently stamp
    `ship` on save (new headers are created with ship=null while CMMS-synced
    history carries the real ship FK) — an exact `ship=this_ship` match alone would
    silently disconnect every newly-created return from that real history, breaking
    "previous month" lookups (carry-forward, since-commissioning totals) the moment
    a ship has both null- and real-ship-tagged headers, as this deployment now does.
    `explicit_ship_id`, when given (e.g. a specific header's own ship_id), is OR'd in
    too so a header already correctly stamped with a real ship still matches its
    own kind even if it differs from the deployment's configured "current" ship.
    """
    this_ship = get_this_ship()
    scope = Q(ship__isnull=True)
    if this_ship is not None:
        scope |= Q(ship=this_ship)
    if explicit_ship_id:
        scope |= Q(ship_id=explicit_ship_id)
    return scope


def _period_before_q(month, year):
    """Q matching every SrarMonthlyHeader strictly earlier than (month, year)."""
    return Q(srar_year__lt=year) | Q(srar_year=year, srar_month__lt=month)


def cumulative_since_commissioning_before(ship_id, month, year):
    """Ship-life running hours/distance totals as of the END of the period before
    (month, year) — the SUM of every one of this ship's own monthly figures
    (`hours_underway_month_hr/_min`, `distance_run_month`) across every
    SrarMonthlyHeader strictly earlier than that period.

    This is the "Since Commissioning" baseline a report adds its own month's hours and
    distance onto. Two things it deliberately does NOT do:

    * It does not read `header.hours_underway_since_commissioning_hr/_min` /
      `distance_run_since_commissioning` off any single header. Those columns go
      stale/frozen across consecutive returns and sit empty on the most recent one
      (see srar.utils.get_dynamic_exploitation_kpis' docstring), and a report saved
      before this total started being persisted holds a literal 0 — which, if trusted,
      would pin that report's baseline to 0 forever, including every time it was
      reopened for edit.
    * It does not require the immediately-preceding calendar month to exist. Summing
      everything earlier means a gap in the returns (this ship's history stops at
      3/2024, so any 2025/2026 return has no "last month" at all) no longer resets the
      ship-life total to zero.

    Being a pure function of the periods already on file, it is also self-healing: the
    same period always resolves to the same baseline no matter what a past save wrote.

    Returns (hours: int, minutes: int, distance: float).
    """
    from srar.models import SrarMonthlyHeader

    headers_qs = SrarMonthlyHeader.objects.filter(
        _this_ship_scope_q(ship_id) & _period_before_q(month, year)
    )

    hours_agg = headers_qs.filter(
        hours_underway_month_hr__lte=MAX_PLAUSIBLE_MONTH_HOURS
    ).aggregate(
        hr=Sum("hours_underway_month_hr"), minute=Sum("hours_underway_month_min")
    )
    distance_agg = headers_qs.filter(
        distance_run_month__lte=MAX_PLAUSIBLE_MONTH_DISTANCE_NM
    ).aggregate(total=Sum("distance_run_month"))

    total_minutes = int(hours_agg["hr"] or 0) * 60 + int(hours_agg["minute"] or 0)
    return total_minutes // 60, total_minutes % 60, float(distance_agg["total"] or 0)


def get_previous_month_header(ship_id, month, year):
    """Returns the SrarMonthlyHeader for the calendar month immediately before
    (month, year) for this deployment's ship, or None if none was filed. Scoped via
    _this_ship_scope_q rather than an exact match on `ship_id` — see that function's
    docstring for why (new headers vs. CMMS-synced history disagree on `ship`).

    Strictly the *adjacent* month, because that is what the "previous month must be
    CMMS-synced first" rule in save_srar_report is about. Carry-forward values use
    get_latest_prior_header instead — see there."""
    from srar.models import SrarMonthlyHeader

    prev_month = month - 1
    prev_year = year
    if prev_month < 1:
        prev_month = 12
        prev_year -= 1

    return SrarMonthlyHeader.objects.filter(
        _this_ship_scope_q(ship_id), srar_month=prev_month, srar_year=prev_year
    ).first()


def get_latest_prior_header(ship_id, month, year):
    """The most recent SrarMonthlyHeader strictly before (month, year), or None.

    Every carry-forward value ("what did the last return leave us with" — fuel and
    AVCAT balance left on board, equipment RHSI, GT/RG/injector/SDC running hours)
    reads from this rather than from get_previous_month_header. A return is genuinely
    the continuation of *the last one filed*, not of whatever calendar month happens to
    sit one step back: this ship's history stops at 3/2024, so keying on the adjacent
    month meant every later period found nothing and silently carried forward zeros —
    the fuel B/F and RHSI columns reading 0 on a ship with years of returns on file."""
    from srar.models import SrarMonthlyHeader

    return (
        SrarMonthlyHeader.objects.filter(
            _this_ship_scope_q(ship_id) & _period_before_q(month, year)
        )
        .order_by("-srar_year", "-srar_month")
        .first()
    )


def earliest_unsynced_prior_header(ship_id, month, year):
    """The oldest return strictly before (month, year) that CMMS has not accepted, or None.

    Returns reach CMMS in period order, so one left pending blocks every later period --
    both raising a new return and syncing one. Scans every earlier period rather than the
    adjacent month alone: this ship's history stops at 3/2024, so a 2026 return has no
    "last month" on file at all, and an adjacent-month check finds nothing and waves it
    through while 5/2024 is still sitting unsynced. Ordered oldest-first so the message
    names the return that actually has to be dealt with first.

    `cmms_sync_status` is null on rows raised before it had a default, hence the isnull
    arm -- a null there means "not synced", the same as False.
    """
    from srar.models import SrarMonthlyHeader

    return (
        SrarMonthlyHeader.objects.filter(
            _this_ship_scope_q(ship_id) & _period_before_q(month, year)
        )
        .filter(Q(cmms_sync_status=False) | Q(cmms_sync_status__isnull=True))
        .order_by("srar_year", "srar_month")
        .first()
    )


def _validated_save(serializer, field_name, item_id=None, **save_kwargs):
    """`save_kwargs` go straight into the model instance, bypassing the serializer's
    declared fields — the way audit stamps have to be applied so a client can't set
    them itself (the header serializer is `fields = "__all__"`, so created_by/
    modified_by would otherwise be writable straight from the request body)."""
    if not serializer.is_valid():
        error = {"errors": serializer.errors}
        if item_id is not None:
            error["id"] = item_id
        raise ValidationError({field_name: error})
    return serializer.save(**save_kwargs)


def _sync_relation(header, field_name, model, key_field, data_list, serializer_class):
    if data_list is None:
        return

    existing_by_id = model.objects.filter(**{key_field: header}).in_bulk()
    existing_ids = set(existing_by_id.keys())
    new_ids = set()

    for item in data_list:
        payload = dict(item)
        payload[key_field] = header.id
        item_id = payload.get("id")

        if item_id and int(item_id) in existing_ids:
            obj = existing_by_id[int(item_id)]
            serializer = serializer_class(obj, data=payload, partial=True)
            new_ids.add(int(item_id))
        else:
            serializer = serializer_class(data=payload)

        saved_obj = _validated_save(serializer, field_name, item_id=item_id)
        new_ids.add(saved_obj.id)

    stale_ids = existing_ids - new_ids
    if stale_ids:
        model.objects.filter(id__in=stale_ids).delete()


def _sync_single_relation(header, field_name, model, key_field, data, serializer_class):
    if data is None:
        return

    payload = dict(data)
    payload[key_field] = header.id
    obj = model.objects.filter(**{key_field: header}).first()
    if obj:
        serializer = serializer_class(obj, data=payload, partial=True)
    else:
        serializer = serializer_class(data=payload)
    _validated_save(serializer, field_name, item_id=payload.get("id"))


@transaction.atomic
def save_srar_report(payload, user=None):
    from srar.models import (
        AnnualSRMRRoutineUndertaken,
        AnnualSRMRRoutineUndertakenofGTG,
        AvcatStatus,
        DGUF,
        DGUFSeaHarbourRunningHourDataInput,
        DieselReductionGearExploitation,
        DGUFLimits,
        EEF,
        EquipmentRoutineDueOn,
        FPTDieselAlternators,
        FPTEquipmentWise,
        FuelConsumptionMonth,
        FullPowerTrialsMainEngine,
        GTGParameters,
        GTGrecordOfCleaningServiceTank,
        GasTurbineExploitation,
        GasTurbineGeneratorExploitation,
        GasTurbineGeneratorExploitationGufEntry,
        H2SSensor,
        Iccp,
        InjectorFIPCalibrationReplacement,
        MagazineFFSystemFloodingSystem,
        OpsStatusofLubOilandCoolantTestKits,
        RHExtension,
        ReductionGearExploitation,
        ReductionGearExploitationofGTG,
        ReplacementOfMajorAssemblies,
        ReplacementOfMajorAssembliesofGTG,
        STP,
        SafetyDeviceCheckTrial,
        SrarAdjustment,
        SrarBoilerAlkalinitySalinityDetail,
        SrarCentrifuge,
        SrarEquipmentExploitation,
        SrarMonthlyBoiler,
        SrarMonthlyHeader,
        SrarMonthlyLubricant,
        SrarMonthlyShipActivity,
        TorsionMeter,
    )
    from srar.serializers import (
        AnnualSRMRRoutineUndertakenSerializer,
        AnnualSRMRRoutineUndertakenofGTGSerializer,
        AvcatStatusSerializer,
        DGUFSeaHarbourRunningHourDataInputSerializer,
        DGUFSerializer,
        DGUFLimitsSerializer,
        DieselReductionGearExploitationSerializer,
        EEFSerializer,
        EquipmentRoutineDueOnSerializer,
        FPTDieselAlternatorsSerializer,
        FPTEquipmentWiseSerializer,
        FuelConsumptionMonthSerializer,
        FullPowerTrialsMainEngineSerializer,
        GTGParametersSerializer,
        GTGrecordOfCleaningServiceTankSerializer,
        GasTurbineExploitationSerializer,
        GasTurbineGeneratorExploitationGufEntrySerializer,
        GasTurbineGeneratorExploitationSerializer,
        H2SSensorSerializer,
        IccpSerializer,
        InjectorFIPCalibrationReplacementSerializer,
        MagazineFFSystemFloodingSystemSerializer,
        OpsStatusofLubOilandCoolantTestKitsSerializer,
        RHExtensionSerializer,
        ReductionGearExploitationSerializer,
        ReductionGearExploitationofGTGSerializer,
        ReplacementOfMajorAssembliesSerializer,
        ReplacementOfMajorAssembliesofGTGSerializer,
        STPSerializer,
        SafetyDeviceCheckTrialSerializer,
        SrarAdjustmentSerializer,
        SrarBoilerAlkalinitySalinityDetailSerializer,
        SrarCentrifugeSerializer,
        SrarEquipmentExploitationSerializer,
        SrarMonthlyBoilerSerializer,
        SrarMonthlyHeaderSerializer,
        SrarMonthlyLubricantSerializer,
        SrarMonthlyShipActivitySerializer,
        TorsionMeterSerializer,
    )

    header_data = payload.get("header", {})
    role_name = ""
    if user is not None:
        role = getattr(user, "role_master", None)
        role_name = (getattr(role, "role_name", "") if role else "").strip().upper()
    if role_name != "CO":
        header_data.pop("co_approved", None)
    header_id = header_data.get("id")
    month = header_data.get("srar_month")
    year = header_data.get("srar_year")
    ship_id = header_data.get("ship") or header_data.get("ship_id")

    # Resolve the deployment's own ship when the caller didn't name one. Everything
    # below keys a monthly return on (ship, month, year), so a null ship meant the
    # lookup ran as `ship__isnull=True` and could never match the real rows -- which
    # all carry a ship. Consequences, all of which were live:
    #
    #   * every save of the same month inserted *another* header instead of updating
    #     the existing one, because the "does this period already exist" lookup missed;
    #   * the rows it created were orphaned from the ship, so the dashboard, the
    #     carry-forward lookup and the CMMS push (which resolves the ship the same way
    #     this now does) all disagreed about which return was which;
    #   * on an existing row a literal `"ship": null` in the payload wiped a ship that
    #     was already set, since the header serializer saves partial=True.
    #
    # get_this_ship() is the same single-ship resolution the CMMS integration uses, so
    # the two directions agree on which ship a return belongs to.
    if not ship_id:
        this_ship = get_this_ship()
        if this_ship:
            ship_id = this_ship.id
    if ship_id:
        header_data["ship"] = ship_id
    else:
        # Nothing to resolve — don't let an explicit null overwrite a stored ship.
        header_data.pop("ship", None)
        header_data.pop("ship_id", None)

    if not header_id and month and year:
        try:
            month = int(month)
            year = int(year)
        except (TypeError, ValueError):
            month = None
            year = None

        if month and year:
            current_filter = {"srar_month": month, "srar_year": year}
            if ship_id:
                current_filter["ship_id"] = ship_id
            else:
                current_filter["ship__isnull"] = True
            current_header_exists = SrarMonthlyHeader.objects.filter(
                **current_filter
            ).exists()
            blocking = earliest_unsynced_prior_header(ship_id, month, year)
            if not current_header_exists and blocking is not None:
                raise ValidationError(
                    {
                        "header": (
                            "An earlier SRAR return is still pending CMMS sync "
                            f"({blocking.srar_month}/{blocking.srar_year}). Sync it "
                            "before creating this report."
                        )
                    }
                )

    if header_id:
        header = SrarMonthlyHeader.objects.get(pk=header_id)
    else:
        existing_filter = {
            "srar_month": header_data.get("srar_month"),
            "srar_year": header_data.get("srar_year"),
        }
        if header_data.get("ship"):
            existing_filter["ship_id"] = header_data.get("ship")
        else:
            existing_filter["ship__isnull"] = True
        header = SrarMonthlyHeader.objects.filter(**existing_filter).first()

    # Audit stamp, applied server-side. created_by is written only on the insert, so it
    # keeps naming whoever first raised the return; modified_by is rewritten on every
    # save. Both were simply never set before -- not one row in the table had either.
    # Any client-supplied value is dropped rather than trusted.
    header_data.pop("created_by", None)
    header_data.pop("modified_by", None)
    audit = {}
    if user is not None:
        audit["modified_by"] = user
        if header is None:
            audit["created_by"] = user

    if header:
        header_serializer = SrarMonthlyHeaderSerializer(
            header, data=header_data, partial=True
        )
    else:
        header_serializer = SrarMonthlyHeaderSerializer(data=header_data)

    header = _validated_save(header_serializer, "header", item_id=header_id, **audit)

    relation_configs = [
        (
            "tab_1_equipment_exploitations",
            SrarEquipmentExploitation,
            SrarEquipmentExploitationSerializer,
        ),
        ("tab_2_boiler_data", SrarMonthlyBoiler, SrarMonthlyBoilerSerializer),
        (
            "tab_2_boiler_alkalinity",
            SrarBoilerAlkalinitySalinityDetail,
            SrarBoilerAlkalinitySalinityDetailSerializer,
        ),
        (
            "tab_3_ship_activities",
            SrarMonthlyShipActivity,
            SrarMonthlyShipActivitySerializer,
        ),
        (
            "tab_4_fuel_consumptions",
            FuelConsumptionMonth,
            FuelConsumptionMonthSerializer,
        ),
        ("tab_4_torsion_meters", TorsionMeter, TorsionMeterSerializer),
        ("tab_5_iccp", Iccp, IccpSerializer),
        ("tab_5_h2s", H2SSensor, H2SSensorSerializer),
        ("tab_5_stp", STP, STPSerializer),
        (
            "tab_5_magazine",
            MagazineFFSystemFloodingSystem,
            MagazineFFSystemFloodingSystemSerializer,
        ),
        ("tab_6_centrifuges", SrarCentrifuge, SrarCentrifugeSerializer),
        (
            "tab_6_test_kits",
            OpsStatusofLubOilandCoolantTestKits,
            OpsStatusofLubOilandCoolantTestKitsSerializer,
        ),
        (
            "tab_7_safety_device_checks",
            SafetyDeviceCheckTrial,
            SafetyDeviceCheckTrialSerializer,
        ),
        (
            "tab_7_calibrations",
            InjectorFIPCalibrationReplacement,
            InjectorFIPCalibrationReplacementSerializer,
        ),
        ("tab_8_dguf", DGUF, DGUFSerializer),
        ("tab_8_dguf_limits", DGUFLimits, DGUFLimitsSerializer),
        (
            "tab_9_fpt_me",
            FullPowerTrialsMainEngine,
            FullPowerTrialsMainEngineSerializer,
        ),
        ("tab_9_fpt_eq", FPTEquipmentWise, FPTEquipmentWiseSerializer),
        (
            "tab_9_fpt_da",
            FPTDieselAlternators,
            FPTDieselAlternatorsSerializer,
        ),
        (
            "tab_7_diesel_reduction_gear",
            DieselReductionGearExploitation,
            DieselReductionGearExploitationSerializer,
        ),
        (
            "tab_10_reduction_gear",
            ReductionGearExploitation,
            ReductionGearExploitationSerializer,
        ),
        (
            "tab_10_gas_turbine",
            GasTurbineExploitation,
            GasTurbineExploitationSerializer,
        ),
        (
            "tab_10_replacements",
            ReplacementOfMajorAssemblies,
            ReplacementOfMajorAssembliesSerializer,
        ),
        (
            "tab_10_srmr",
            AnnualSRMRRoutineUndertaken,
            AnnualSRMRRoutineUndertakenSerializer,
        ),
        (
            "tab_11_gtg",
            GasTurbineGeneratorExploitation,
            GasTurbineGeneratorExploitationSerializer,
        ),
        (
            "tab_11_gtg_guf",
            GasTurbineGeneratorExploitationGufEntry,
            GasTurbineGeneratorExploitationGufEntrySerializer,
        ),
        (
            "tab_11_gtg_rg",
            ReductionGearExploitationofGTG,
            ReductionGearExploitationofGTGSerializer,
        ),
        (
            "tab_11_gtg_rep",
            ReplacementOfMajorAssembliesofGTG,
            ReplacementOfMajorAssembliesofGTGSerializer,
        ),
        (
            "tab_11_gtg_srmr",
            AnnualSRMRRoutineUndertakenofGTG,
            AnnualSRMRRoutineUndertakenofGTGSerializer,
        ),
        ("tab_11_gtg_params", GTGParameters, GTGParametersSerializer),
        (
            "tab_11_gtg_tanks",
            GTGrecordOfCleaningServiceTank,
            GTGrecordOfCleaningServiceTankSerializer,
        ),
        (
            "tab_12_lubricants",
            SrarMonthlyLubricant,
            SrarMonthlyLubricantSerializer,
        ),
        ("tab_13_rh_extensions", RHExtension, RHExtensionSerializer),
        (
            "tab_15_routine_due",
            EquipmentRoutineDueOn,
            EquipmentRoutineDueOnSerializer,
        ),
        ("tab_15_adjustments", SrarAdjustment, SrarAdjustmentSerializer),
    ]

    for field_name, model, serializer_class in relation_configs:
        _sync_relation(
            header=header,
            field_name=field_name,
            model=model,
            key_field="srar_monthly_header",
            data_list=payload.get(field_name),
            serializer_class=serializer_class,
        )

    _sync_single_relation(
        header=header,
        field_name="tab_4_avcat_status",
        model=AvcatStatus,
        key_field="srar_monthly_header",
        data=payload.get("tab_4_avcat_status"),
        serializer_class=AvcatStatusSerializer,
    )
    _sync_single_relation(
        header=header,
        field_name="tab_8_dguf_running_hours",
        model=DGUFSeaHarbourRunningHourDataInput,
        key_field="srar_monthly_header",
        data=payload.get("tab_8_dguf_running_hours"),
        serializer_class=DGUFSeaHarbourRunningHourDataInputSerializer,
    )
    _sync_single_relation(
        header=header,
        field_name="tab_14_eef",
        model=EEF,
        key_field="srar_monthly_header",
        data=payload.get("tab_14_eef"),
        serializer_class=EEFSerializer,
    )

    return {
        "status": "success",
        "message": "Report saved successfully",
        "id": header.id,
    }
