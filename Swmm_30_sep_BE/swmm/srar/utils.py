import calendar
from datetime import date, datetime, timedelta

from django.db import models
from django.db.models import Q
from django.utils import timezone

from ems.models import PostEquipmentStateChangeHistorySave
from master.utils import get_this_ship

from .models import (
    DGUF,
    DGUFSeaHarbourRunningHourDataInput,
    DieselReductionGearExploitation,
    EEF,
    STP,
    SrarMonthlyHeader,
    SrarMonthlyShipRunning,
    AnnualSRMRRoutineUndertaken,
    AnnualSRMRRoutineUndertakenofGTG,
    AvcatStatus,
    DGUFLimits,
    EquipmentRoutineDueOn,
    FPTDieselAlternators,
    FPTEquipmentWise,
    FuelConsumptionMonth,
    FullPowerTrialsMainEngine,
    GasTurbineExploitation,
    GasTurbineGeneratorExploitation,
    GasTurbineGeneratorExploitationGufEntry,
    GTGParameters,
    GTGrecordOfCleaningServiceTank,
    H2SSensor,
    Iccp,
    InjectorFIPCalibrationReplacement,
    MagazineFFSystemFloodingSystem,
    OpsStatusofLubOilandCoolantTestKits,
    ReductionGearExploitation,
    ReductionGearExploitationofGTG,
    ReplacementOfMajorAssemblies,
    ReplacementOfMajorAssembliesofGTG,
    RHExtension,
    SafetyDeviceCheckTrial,
    SrarAdjustment,
    SrarBoilerAlkalinitySalinityDetail,
    SrarCentrifuge,
    SrarEquipmentExploitation,
    SrarMonthlyBoiler,
    SrarMonthlyLubricant,
    SrarMonthlyShipActivity,
    TorsionMeter,
)
from .serializers import (
    AnnualSRMRRoutineUndertakenofGTGSerializer,
    AnnualSRMRRoutineUndertakenSerializer,
    AvcatStatusSerializer,
    DGUFLimitsSerializer,
    DGUFSeaHarbourRunningHourDataInputSerializer,
    DGUFSerializer,
    DieselReductionGearExploitationSerializer,
    EEFSerializer,
    EquipmentRoutineDueOnSerializer,
    FPTDieselAlternatorsSerializer,
    FPTEquipmentWiseSerializer,
    FuelConsumptionMonthSerializer,
    FullPowerTrialsMainEngineSerializer,
    GasTurbineExploitationSerializer,
    GasTurbineGeneratorExploitationGufEntrySerializer,
    GasTurbineGeneratorExploitationSerializer,
    GTGParametersSerializer,
    GTGrecordOfCleaningServiceTankSerializer,
    H2SSensorSerializer,
    IccpSerializer,
    InjectorFIPCalibrationReplacementSerializer,
    MagazineFFSystemFloodingSystemSerializer,
    OpsStatusofLubOilandCoolantTestKitsSerializer,
    ReductionGearExploitationofGTGSerializer,
    ReductionGearExploitationSerializer,
    ReplacementOfMajorAssembliesofGTGSerializer,
    ReplacementOfMajorAssembliesSerializer,
    RHExtensionSerializer,
    SafetyDeviceCheckTrialSerializer,
    SrarAdjustmentSerializer,
    SrarBoilerAlkalinitySalinityDetailSerializer,
    SrarCentrifugeSerializer,
    SrarEquipmentExploitationSerializer,
    SrarMonthlyBoilerSerializer,
    SrarMonthlyHeaderSerializer,
    SrarMonthlyLubricantSerializer,
    SrarMonthlyShipActivitySerializer,
    STPSerializer,
    TorsionMeterSerializer,
)


def get_max_hours_for_month(year: int, month: int) -> int:
    """
    Returns maximum possible hours in a month based on calendar days:
    - 31 days month -> 744 hours
    - 30 days month -> 720 hours
    - 29 days month (February in leap year) -> 696 hours
    - 28 days month (February in non-leap year) -> 672 hours
    """
    _, num_days = calendar.monthrange(year, month)
    return num_days * 24


def _month_bounds(year: int, month: int, tz=None):
    """Return (month_start, month_end) as timezone-aware datetimes.
    month_end is start of next month (exclusive)."""
    if tz is None:
        tz = timezone.get_current_timezone()

    # naive datetimes for boundaries
    start_naive = datetime(year, month, 1, 0, 0, 0)
    if month == 12:
        next_naive = datetime(year + 1, 1, 1, 0, 0, 0)
    else:
        next_naive = datetime(year, month + 1, 1, 0, 0, 0)

    month_start = timezone.make_aware(start_naive, tz)
    month_end = timezone.make_aware(next_naive, tz)
    return month_start, month_end


def calculate_month_running_hours(equipment, year: int, month: int, tz=None):
    """
    Returns (total_hours, breakdown_list)
    breakdown_list: list of dicts {history_id, clipped_start, clipped_stop, hours, location}
    """
    if tz is None:
        tz = timezone.get_current_timezone()

    month_start, month_end = _month_bounds(year, month, tz)

    # Query history entries that might overlap the month:
    qs = (
        PostEquipmentStateChangeHistorySave.objects.filter(
            equipment_name__sfd_equipment=equipment,
            start_time__lt=month_end,  # started before month end
        )
        .filter(
            models.Q(stop_time__isnull=True)
            | models.Q(
                stop_time__gt=month_start
            )  # still running or stopped after month start
        )
        .order_by("start_time")
    )

    total_seconds = 0.0
    breakdown = []
    now = timezone.now().astimezone(tz)

    for h in qs:
        s = h.start_time
        e = h.stop_time or now

        # Ensure awareness and convert both into the same tz
        if timezone.is_naive(s):
            s = timezone.make_aware(s, tz)
        else:
            s = s.astimezone(tz)

        if timezone.is_naive(e):
            e = timezone.make_aware(e, tz)
        else:
            e = e.astimezone(tz)

        # Clip interval to the month window
        clip_start = s if s > month_start else month_start
        clip_end = e if e < month_end else month_end

        if clip_end > clip_start:
            secs = (clip_end - clip_start).total_seconds()
            total_seconds += secs
            breakdown.append(
                {
                    "history_id": h.pk,
                    "clipped_start": clip_start,
                    "clipped_stop": clip_end,
                    "minutes": round(secs / 60.0, 2),
                    # 'hours': round(secs / 3600.0, 3),  # keep more precision in breakdown
                    "location": h.started_at_location,
                }
            )
    total_minutes = round(total_seconds / 60.0, 2)
    hh_mm = minutes_to_hhmm(int(total_minutes))
    return total_minutes, hh_mm, breakdown


def minutes_to_hhmm(total):
    if total is None:
        return "0:00"
    h = total // 60
    m = total % 60
    return f"{h}:{m:02d}"


class relativedelta:
    def __init__(self, years=0, months=0, days=0):
        self.years = years
        self.months = months
        self.days = days

    def __radd__(self, other):
        return self._apply(other)

    def __add__(self, other):
        return self._apply(other)

    def _apply(self, value):
        if not isinstance(value, (date, datetime)):
            return NotImplemented

        month_index = value.month - 1 + self.months + (self.years * 12)
        year = value.year + (month_index // 12)
        month = (month_index % 12) + 1
        day = min(value.day, calendar.monthrange(year, month)[1])
        updated = value.replace(year=year, month=month, day=day)
        if self.days:
            updated = updated + timedelta(days=self.days)
        return updated


def build_srar_context(header):
    month, year = header.srar_month, header.srar_year
    total_minutes = header.hours_underway_month_minutes or 0
    header.hh = total_minutes // 60
    header.mm = total_minutes % 60

    try:
        max_hours = calendar.monthrange(year, month)[1] * 24
    except Exception:
        max_hours = 744

    # Fetch related lists
    iccp_saved = Iccp.objects.filter(srar_monthly_header=header).select_related(
        "sfd_details", "sfd_details__equipment"
    )
    h2s_saved = H2SSensor.objects.filter(srar_monthly_header=header).select_related(
        "sfd_details", "sfd_details__equipment"
    )
    stp_saved = STP.objects.filter(srar_monthly_header=header).select_related(
        "sfd_details", "sfd_details__equipment"
    )
    magazine_saved = MagazineFFSystemFloodingSystem.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")
    testkits_saved = OpsStatusofLubOilandCoolantTestKits.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")
    centrifuge_saved = SrarCentrifuge.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")

    expo_saved = SrarEquipmentExploitation.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")
    boiler_saved = SrarMonthlyBoiler.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")
    alkalinity_saved = SrarBoilerAlkalinitySalinityDetail.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")

    ship_activity_saved = SrarMonthlyShipActivity.objects.filter(
        srar_monthly_header=header
    ).select_related(
        "ship_activity_detail", "ship_activity_type", "ship_location", "ship_state"
    )
    fuel_saved = FuelConsumptionMonth.objects.filter(srar_monthly_header=header)
    avcat_saved = AvcatStatus.objects.filter(srar_monthly_header=header).first()
    torsion_saved = TorsionMeter.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")

    safety_device_saved = SafetyDeviceCheckTrial.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")
    calibration_saved = InjectorFIPCalibrationReplacement.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")
    dguf_saved = DGUF.objects.filter(srar_monthly_header=header).select_related(
        "sfd_details", "sfd_details__equipment"
    )
    dguf_running_hours_saved = DGUFSeaHarbourRunningHourDataInput.objects.filter(
        srar_monthly_header=header
    ).first()
    dguf_limits_saved = DGUFLimits.objects.filter(srar_monthly_header=header)

    fpt_me_saved = FullPowerTrialsMainEngine.objects.filter(srar_monthly_header=header)
    fpt_eq_saved = FPTEquipmentWise.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "fpt_main_engine")
    fpt_da_saved = FPTDieselAlternators.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details")

    diesel_rg_saved = DieselReductionGearExploitation.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")
    rg_saved = ReductionGearExploitation.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")
    gt_saved = GasTurbineExploitation.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")
    replacement_saved = ReplacementOfMajorAssemblies.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")
    srmr_saved = AnnualSRMRRoutineUndertaken.objects.filter(
        srar_monthly_header=header
    ).select_related("equipment")

    gtg_saved = GasTurbineGeneratorExploitation.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")
    gtg_guf_saved = GasTurbineGeneratorExploitationGufEntry.objects.filter(
        srar_monthly_header=header
    )
    gtg_rg_saved = ReductionGearExploitationofGTG.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")
    gtg_rep_saved = ReplacementOfMajorAssembliesofGTG.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")
    gtg_srmr_saved = AnnualSRMRRoutineUndertakenofGTG.objects.filter(
        srar_monthly_header=header
    ).select_related("equipment")
    gtg_params_saved = GTGParameters.objects.filter(
        srar_monthly_header=header
    ).select_related("gtg_exploitation")
    gtg_tank_saved = GTGrecordOfCleaningServiceTank.objects.filter(
        srar_monthly_header=header
    ).select_related("gtg_exploitation")

    lubricant_saved = SrarMonthlyLubricant.objects.filter(
        srar_monthly_header=header
    ).select_related("lubricant")
    rh_extension_saved = RHExtension.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")
    eef_saved = EEF.objects.filter(srar_monthly_header=header).first()
    routine_due_saved = EquipmentRoutineDueOn.objects.filter(
        srar_monthly_header=header
    ).select_related("sfd_details", "sfd_details__equipment")
    adjustment_saved = SrarAdjustment.objects.filter(
        srar_monthly_header=header
    ).select_related("ship", "sfd_details", "sfd_details__equipment")

    context = {
        "srar_header": header,
        "srar_month": month,
        "srar_year": year,
        "max_hours": max_hours,
        "iccp_saved": iccp_saved,
        "h2s_saved": h2s_saved,
        "stp_saved": stp_saved,
        "magazine_saved": magazine_saved,
        "testkits_saved": testkits_saved,
        "centrifuge_saved": centrifuge_saved,
        "expo_saved": expo_saved,
        "boiler_saved": boiler_saved,
        "alkalinity_saved": alkalinity_saved,
        "ship_activity_saved": ship_activity_saved,
        "fuel_saved": fuel_saved,
        "avcat_saved": avcat_saved,
        "torsion_saved": torsion_saved,
        "safety_device_saved": safety_device_saved,
        "calibration_saved": calibration_saved,
        "dguf_saved": dguf_saved,
        "dguf_running_hours_saved": dguf_running_hours_saved,
        "dguf_limits_saved": dguf_limits_saved,
        "fpt_me_saved": fpt_me_saved,
        "fpt_eq_saved": fpt_eq_saved,
        "fpt_da_saved": fpt_da_saved,
        "diesel_rg_saved": diesel_rg_saved,
        "rg_saved": rg_saved,
        "gt_saved": gt_saved,
        "replacement_saved": replacement_saved,
        "srmr_saved": srmr_saved,
        "gtg_saved": gtg_saved,
        "gtg_guf_saved": gtg_guf_saved,
        "gtg_rg_saved": gtg_rg_saved,
        "gtg_rep_saved": gtg_rep_saved,
        "gtg_srmr_saved": gtg_srmr_saved,
        "gtg_params_saved": gtg_params_saved,
        "gtg_tank_saved": gtg_tank_saved,
        "lubricant_saved": lubricant_saved,
        "rh_extension_saved": rh_extension_saved,
        "eef_saved": eef_saved,
        "routine_due_saved": routine_due_saved,
        "adjustment_saved": adjustment_saved,
    }
    return context


def build_srar_report_payload(header):
    ctx = build_srar_context(header)
    return {
        "header": SrarMonthlyHeaderSerializer(header).data,
        "tab_1_equipment_exploitations": SrarEquipmentExploitationSerializer(
            ctx["expo_saved"], many=True
        ).data,
        "tab_2_boiler_data": SrarMonthlyBoilerSerializer(
            ctx["boiler_saved"], many=True
        ).data,
        "tab_2_boiler_alkalinity": SrarBoilerAlkalinitySalinityDetailSerializer(
            ctx["alkalinity_saved"], many=True
        ).data,
        "tab_3_ship_activities": SrarMonthlyShipActivitySerializer(
            ctx["ship_activity_saved"], many=True
        ).data,
        "tab_4_fuel_consumptions": FuelConsumptionMonthSerializer(
            ctx["fuel_saved"], many=True
        ).data,
        "tab_4_avcat_status": (
            AvcatStatusSerializer(ctx["avcat_saved"]).data
            if ctx["avcat_saved"]
            else None
        ),
        "tab_4_torsion_meters": TorsionMeterSerializer(
            ctx["torsion_saved"], many=True
        ).data,
        "tab_5_iccp": IccpSerializer(ctx["iccp_saved"], many=True).data,
        "tab_5_h2s": H2SSensorSerializer(ctx["h2s_saved"], many=True).data,
        "tab_5_stp": STPSerializer(ctx["stp_saved"], many=True).data,
        "tab_5_magazine": MagazineFFSystemFloodingSystemSerializer(
            ctx["magazine_saved"], many=True
        ).data,
        "tab_6_centrifuges": SrarCentrifugeSerializer(
            ctx["centrifuge_saved"], many=True
        ).data,
        "tab_6_test_kits": OpsStatusofLubOilandCoolantTestKitsSerializer(
            ctx["testkits_saved"], many=True
        ).data,
        "tab_7_safety_device_checks": SafetyDeviceCheckTrialSerializer(
            ctx["safety_device_saved"], many=True
        ).data,
        "tab_7_calibrations": InjectorFIPCalibrationReplacementSerializer(
            ctx["calibration_saved"], many=True
        ).data,
        "tab_7_diesel_reduction_gear": DieselReductionGearExploitationSerializer(
            ctx["diesel_rg_saved"], many=True
        ).data,
        "tab_8_dguf": DGUFSerializer(ctx["dguf_saved"], many=True).data,
        "tab_8_dguf_running_hours": (
            DGUFSeaHarbourRunningHourDataInputSerializer(
                ctx["dguf_running_hours_saved"]
            ).data
            if ctx["dguf_running_hours_saved"]
            else None
        ),
        "tab_8_dguf_limits": DGUFLimitsSerializer(
            ctx["dguf_limits_saved"], many=True
        ).data,
        "tab_9_fpt_me": FullPowerTrialsMainEngineSerializer(
            ctx["fpt_me_saved"], many=True
        ).data,
        "tab_9_fpt_eq": FPTEquipmentWiseSerializer(ctx["fpt_eq_saved"], many=True).data,
        "tab_9_fpt_da": FPTDieselAlternatorsSerializer(
            ctx["fpt_da_saved"], many=True
        ).data,
        "tab_10_reduction_gear": ReductionGearExploitationSerializer(
            ctx["rg_saved"], many=True
        ).data,
        "tab_10_gas_turbine": GasTurbineExploitationSerializer(
            ctx["gt_saved"], many=True
        ).data,
        "tab_10_replacements": ReplacementOfMajorAssembliesSerializer(
            ctx["replacement_saved"], many=True
        ).data,
        "tab_10_srmr": AnnualSRMRRoutineUndertakenSerializer(
            ctx["srmr_saved"], many=True
        ).data,
        "tab_11_gtg": GasTurbineGeneratorExploitationSerializer(
            ctx["gtg_saved"], many=True
        ).data,
        "tab_11_gtg_guf": GasTurbineGeneratorExploitationGufEntrySerializer(
            ctx["gtg_guf_saved"], many=True
        ).data,
        "tab_11_gtg_rg": ReductionGearExploitationofGTGSerializer(
            ctx["gtg_rg_saved"], many=True
        ).data,
        "tab_11_gtg_rep": ReplacementOfMajorAssembliesofGTGSerializer(
            ctx["gtg_rep_saved"], many=True
        ).data,
        "tab_11_gtg_srmr": AnnualSRMRRoutineUndertakenofGTGSerializer(
            ctx["gtg_srmr_saved"], many=True
        ).data,
        "tab_11_gtg_params": GTGParametersSerializer(
            ctx["gtg_params_saved"], many=True
        ).data,
        "tab_11_gtg_tanks": GTGrecordOfCleaningServiceTankSerializer(
            ctx["gtg_tank_saved"], many=True
        ).data,
        "tab_12_lubricants": SrarMonthlyLubricantSerializer(
            ctx["lubricant_saved"], many=True
        ).data,
        "tab_13_rh_extensions": RHExtensionSerializer(
            ctx["rh_extension_saved"], many=True
        ).data,
        "tab_14_eef": (
            EEFSerializer(ctx["eef_saved"]).data if ctx["eef_saved"] else None
        ),
        "tab_15_routine_due": EquipmentRoutineDueOnSerializer(
            ctx["routine_due_saved"], many=True
        ).data,
        "tab_15_adjustments": SrarAdjustmentSerializer(
            ctx["adjustment_saved"], many=True
        ).data,
    }


def get_dynamic_kpis_data():
    """
    Computes dynamic KPI metrics from Django ORM database queries.
    """
    today = date.today()
    six_months_ago = today - timedelta(days=180)

    past_6_months_count = SrarMonthlyHeader.objects.filter(
        Q(created_on__gte=six_months_ago) | Q(srar_year__gt=today.year - 1)
    ).count()

    total_reports = SrarMonthlyHeader.objects.count()
    drafts_count = SrarMonthlyHeader.objects.filter(
        send_to_co=False, is_saved=True
    ).count()
    pending_co_count = SrarMonthlyHeader.objects.filter(
        send_to_co=True, co_approved=False, cmms_sync_status=False
    ).count()
    co_approved_count = SrarMonthlyHeader.objects.filter(
        co_approved=True, cmms_sync_status=False
    ).count()
    synced_count = SrarMonthlyHeader.objects.filter(cmms_sync_status=True).count()
    not_synced_count = total_reports - synced_count

    editable_srar_count = SrarMonthlyHeader.objects.filter(
        is_saved=True, send_to_co=False
    ).count()

    return {
        "past_6_months_count": past_6_months_count,
        "active_status_count": co_approved_count + synced_count,
        "pending_drafts_count": drafts_count,
        "application_status": {
            "draft": drafts_count,
            "pending_co_review": pending_co_count,
            "co_approved": co_approved_count,
            "synced": synced_count,
            "total": total_reports,
        },
        "editable_srar_count": editable_srar_count,
        "synced_count": synced_count,
        "not_synced_count": not_synced_count,
        "history_logs_count": total_reports,
    }


def get_dynamic_monthly_trend_data():
    """
    Computes dynamic month-by-month submission trend for the past 6 to 12 months.
    """
    today = date.today()
    trend = []

    for i in range(5, -1, -1):
        year = today.year
        month = today.month - i
        if month <= 0:
            month += 12
            year -= 1

        month_name = calendar.month_abbr[month]
        month_label = f"{month_name} {year}"

        qs = SrarMonthlyHeader.objects.filter(srar_year=year, srar_month=month)
        total_count = qs.count()
        submitted_count = qs.filter(send_to_co=True).count()
        draft_count = qs.filter(send_to_co=False).count()

        trend.append(
            {
                "month": month_label,
                "month_num": month,
                "year": year,
                "submitted": submitted_count,
                "draft": draft_count,
                "total": total_count,
            }
        )

    return {"trend": trend}


def get_dynamic_yearly_status_data():
    """
    Computes dynamic status distribution for current calendar year.
    """
    current_year = date.today().year
    qs_year = SrarMonthlyHeader.objects.filter(srar_year=current_year)
    total_year_count = qs_year.count()

    drafts = qs_year.filter(send_to_co=False).count()
    pending_co = qs_year.filter(
        send_to_co=True, co_approved=False, cmms_sync_status=False
    ).count()
    co_approved = qs_year.filter(co_approved=True, cmms_sync_status=False).count()
    cmms_synced = qs_year.filter(cmms_sync_status=True).count()

    def calc_pct(val):
        if total_year_count > 0:
            return round((val / total_year_count) * 100, 1)
        return 0.0

    distribution = [
        {
            "status": "Draft",
            "count": drafts,
            "percentage": calc_pct(drafts),
        },
        {
            "status": "Pending CO Review",
            "count": pending_co,
            "percentage": calc_pct(pending_co),
        },
        {
            "status": "CO Approved",
            "count": co_approved,
            "percentage": calc_pct(co_approved),
        },
        {
            "status": "CMMS Synced",
            "count": cmms_synced,
            "percentage": calc_pct(cmms_synced),
        },
    ]

    return {
        "year": current_year,
        "total_year_records": total_year_count,
        "lifecycle_distribution": distribution,
    }


# ---------------------------------------------------------------------------
# Exploitation analytics: ship-life totals, fuel trend, DGUF split.
#
# The running-hour fields these read are CharFields holding "HH:MM", not numbers
# (SRAR form 8 records them that way), so they are parsed and summed in Python.
# Aggregating them in SQL would mean SUM() over a varchar, which Postgres either
# refuses or silently truncates depending on the value.
# ---------------------------------------------------------------------------


def hhmm_to_hours(value):
    """'HH:MM' -> float hours. Returns None for blank/unparseable input.

    Tolerates the shapes this column actually contains: '182:30', '182', '182.5',
    ' 182:30 ', None and ''. A malformed row yields None rather than raising, so one
    bad entry cannot take down a whole dashboard aggregate.
    """
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    try:
        if ":" in text:
            hours_part, _, minutes_part = text.partition(":")
            hours = float(hours_part or 0)
            minutes = float(minutes_part or 0)
            return hours + minutes / 60.0
        return float(text)
    except (TypeError, ValueError):
        return None


def sum_hhmm(values):
    """Total the parseable 'HH:MM' values, and report how many were usable."""
    total = 0.0
    counted = 0
    for value in values:
        hours = hhmm_to_hours(value)
        if hours is not None:
            total += hours
            counted += 1
    return total, counted


def _format_hhmm(hours):
    """Float hours -> 'HH:MM' for display."""
    if hours is None:
        return None
    whole = int(hours)
    return f"{whole}:{int(round((hours - whole) * 60)):02d}"


def _current_ship_scope_q(field_prefix=""):
    """Q filter scoping a SrarMonthlyHeader (or a relation to one, via
    `field_prefix`, e.g. "srar_monthly_header__") to this deployment's ship — see
    `master.utils.get_this_ship()`. SWMM is one install per ship, so this mirrors
    the same convention `sfd`/`ems`/`dart`/`swmmapi` already use, rather than
    aggregating across whatever `ship` values happen to be in the table.

    OR's in `ship__isnull=True` because the SRAR transaction form doesn't
    actually stamp `ship` on save yet (it always sends `ship: null`) — every
    return, historical or newly-saved, currently has a null ship FK, so an exact
    `ship=this_ship` filter alone would exclude everything. This keeps today's
    behavior correct while already being ready for whenever that gets wired up.
    """
    this_ship = get_this_ship()
    ship_field = f"{field_prefix}ship"
    isnull_field = f"{ship_field}__isnull"
    if this_ship is None:
        return Q(**{isnull_field: True})
    return Q(**{ship_field: this_ship}) | Q(**{isnull_field: True})


def _ship_activity_sea_harbour_hours(covered_header_ids):
    """Fallback source for days at sea/harbour, for whatever SrarMonthlyHeader rows
    have neither a DGUF form-8 entry nor a T_SRARMthlyShipRunning mirror row
    (`covered_header_ids`). Tab 3 Ship Activity (from_date/to_date spans tagged with
    a ship_location) is filled in on far more historical returns than SRAR form 8
    ever was, so this lets older/simpler returns still contribute to the KPI instead
    of being silently dropped.
    """
    rows = (
        SrarMonthlyShipActivity.objects.filter(
            _current_ship_scope_q(field_prefix="srar_monthly_header__")
        )
        .exclude(srar_monthly_header_id__in=covered_header_ids)
        .filter(from_date__isnull=False, to_date__isnull=False)
        .select_related("ship_location")
        .values_list(
            "srar_monthly_header_id", "ship_location__name", "from_date", "to_date"
        )
    )

    sea_hours = 0.0
    harbour_hours = 0.0
    sea_header_ids = set()
    harbour_header_ids = set()
    for header_id, location_name, from_date, to_date in rows:
        span_days = (to_date - from_date).days + 1
        if span_days <= 0:
            continue
        location = (location_name or "").strip().lower()
        if location == "at sea":
            sea_hours += span_days * 24.0
            sea_header_ids.add(header_id)
        elif location.startswith("alongside"):
            harbour_hours += span_days * 24.0
            harbour_header_ids.add(header_id)

    return sea_hours, len(sea_header_ids), harbour_hours, len(harbour_header_ids)


def get_dynamic_exploitation_kpis():
    """Ship-life exploitation KPIs for the SRAR dashboard, scoped to this
    deployment's ship (see `_current_ship_scope_q`).

    Hours underway and distance run since commissioning are the SUM of every
    month's own figure (`hours_underway_month_hr/_min`, `distance_run_month`)
    across every SrarMonthlyHeader on file — not the header's own
    since-commissioning columns, which turn out to be even less reliable in
    practice (stale/frozen across several consecutive returns, and empty on the
    most recent one). Physically-impossible monthly values are excluded from the
    sum rather than trusted — see MAX_PLAUSIBLE_MONTH_* below. Days at sea and
    days at harbour come from the DGUF form's sea/harbour input first (form 8
    section 2 — column (A) Total RH Sea and column (E) Number of Hours in
    Harbour), falling back to T_SRARMthlyShipRunning, then to Tab 3 Ship Activity
    date ranges for whatever returns neither of those cover — so every saved
    return contributes something instead of the KPI being dominated by whichever
    one return happens to have form 8 filled in.
    """
    # A calendar month has at most 31 * 24 = 744 hours, so any row claiming more is
    # not a real monthly figure — a handful of legacy/CMMS-migrated headers have
    # values in the hundreds of thousands here (e.g. 486600), which used to blow the
    # "since commissioning" total up to a nonsensical ~270 years. Same idea for
    # distance: no plausible warship covers more than ~25,000nm running flat-out for
    # an entire month, so anything above that is corrupted, not a real return.
    MAX_PLAUSIBLE_MONTH_HOURS = 744
    MAX_PLAUSIBLE_MONTH_DISTANCE_NM = 25000

    ship_scope = _current_ship_scope_q()
    header_scope = _current_ship_scope_q(field_prefix="srar_monthly_header__")

    underway_agg = SrarMonthlyHeader.objects.filter(
        ship_scope, hours_underway_month_hr__lte=MAX_PLAUSIBLE_MONTH_HOURS
    ).aggregate(
        hr=models.Sum("hours_underway_month_hr"),
        minute=models.Sum("hours_underway_month_min"),
    )
    underway_hours = None
    if underway_agg.get("hr") is not None:
        underway_hours = (
            float(underway_agg["hr"]) + float(underway_agg.get("minute") or 0) / 60.0
        )

    distance_agg = SrarMonthlyHeader.objects.filter(
        ship_scope, distance_run_month__lte=MAX_PLAUSIBLE_MONTH_DISTANCE_NM
    ).aggregate(total=models.Sum("distance_run_month"))
    distance = distance_agg.get("total")

    latest_header = (
        SrarMonthlyHeader.objects.filter(ship_scope)
        .order_by("-srar_year", "-srar_month")
        .first()
    )

    sea_rows = DGUFSeaHarbourRunningHourDataInput.objects.filter(
        header_scope
    ).values_list("total_rh_at_sea", "no_of_hours_in_harbour")
    sea_values = []
    harbour_values = []
    for at_sea, in_harbour in sea_rows:
        sea_values.append(at_sea)
        harbour_values.append(in_harbour)

    sea_hours, sea_counted = sum_hhmm(sea_values)
    harbour_hours, harbour_counted = sum_hhmm(harbour_values)
    sea_source = "dguf_form_8"
    harbour_source = "dguf_form_8"

    covered_header_ids = set(
        DGUFSeaHarbourRunningHourDataInput.objects.filter(header_scope).values_list(
            "srar_monthly_header_id", flat=True
        )
    )

    # T_SRARMthlyShipRunning is a fallback only — DGUF's own sea/harbour input wins
    # whenever it has data, so returns predating T_SRARMthlyShipRunning still show up.
    if not sea_counted or not harbour_counted:
        running = SrarMonthlyShipRunning.objects.filter(header_scope).aggregate(
            sea=models.Sum("at_sea_in_month"), harbour=models.Sum("at_harbour_in_month")
        )
        running_rows = SrarMonthlyShipRunning.objects.filter(header_scope).count()

        if not sea_counted and running_rows and running.get("sea") is not None:
            sea_hours = float(running["sea"]) * 24.0
            sea_counted = running_rows
            sea_source = "T_SRARMthlyShipRunning"
        if not harbour_counted and running_rows and running.get("harbour") is not None:
            harbour_hours = float(running["harbour"]) * 24.0
            harbour_counted = running_rows
            harbour_source = "T_SRARMthlyShipRunning"

    covered_header_ids |= set(
        SrarMonthlyShipRunning.objects.filter(header_scope).values_list(
            "srar_monthly_header_id", flat=True
        )
    )

    # Returns with neither DGUF form 8 nor a T_SRARMthlyShipRunning mirror row still
    # commonly have Tab 3 Ship Activity filled in — sum those in too rather than
    # letting the KPI silently ignore every return that predates/skips form 8.
    (
        activity_sea_hours,
        activity_sea_returns,
        activity_harbour_hours,
        activity_harbour_returns,
    ) = _ship_activity_sea_harbour_hours(covered_header_ids)
    if activity_sea_hours > 0:
        sea_source = (
            f"{sea_source}+srar_monthly_ship_activity"
            if sea_counted
            else "srar_monthly_ship_activity"
        )
        sea_hours += activity_sea_hours
        sea_counted += activity_sea_returns
    if activity_harbour_hours > 0:
        harbour_source = (
            f"{harbour_source}+srar_monthly_ship_activity"
            if harbour_counted
            else "srar_monthly_ship_activity"
        )
        harbour_hours += activity_harbour_hours
        harbour_counted += activity_harbour_returns

    def _as_of(header):
        if header is None:
            return None
        return f"{calendar.month_abbr[header.srar_month]} {header.srar_year}"

    return {
        "hours_underway_since_commissioning": (
            round(underway_hours, 2) if underway_hours is not None else None
        ),
        "hours_underway_since_commissioning_hhmm": _format_hhmm(underway_hours),
        "hours_underway_as_of": _as_of(latest_header),
        "distance_run_since_commissioning": (
            round(float(distance), 2) if distance is not None else None
        ),
        "distance_run_as_of": _as_of(latest_header),
        "days_at_sea": round(sea_hours / 24.0, 1) if sea_counted else None,
        "days_at_sea_hours": round(sea_hours, 2) if sea_counted else None,
        "days_at_sea_returns": sea_counted,
        "days_at_harbour": round(harbour_hours / 24.0, 1) if harbour_counted else None,
        "days_at_harbour_hours": round(harbour_hours, 2) if harbour_counted else None,
        "days_at_harbour_returns": harbour_counted,
        "days_at_sea_source": sea_source,
        "days_at_harbour_source": harbour_source,
    }


def get_available_srar_years():
    """Years where at least one of the Fuel Consumption Trend / DGUF charts has
    real data, newest first — powers the dashboard's year filter for both.

    Deliberately narrower than "every year with a saved SrarMonthlyHeader": this
    module has 429 headers going back to 1988 (mostly bare CMMS-synced records
    with no sub-form data at all), but only 2026 actually has Fuel/AVCAT/DGUF
    entries. Listing every header year in the filter meant picking almost any of
    them landed on an empty chart — this only offers years that will show
    something.
    """
    header_scope = _current_ship_scope_q(field_prefix="srar_monthly_header__")
    fuel_years = FuelConsumptionMonth.objects.filter(header_scope).values_list(
        "srar_monthly_header__srar_year", flat=True
    )
    avcat_years = AvcatStatus.objects.filter(header_scope).values_list(
        "srar_monthly_header__srar_year", flat=True
    )
    dguf_years = DGUF.objects.filter(header_scope).values_list(
        "srar_monthly_header__srar_year", flat=True
    )
    years = {y for y in (*fuel_years, *avcat_years, *dguf_years) if y}
    return sorted(years, reverse=True)


def get_dynamic_fuel_trend_data(limit=24, year=None):
    """Month-by-month fuel trend for the "Fuel, AVCAT & Torsionmeter" form's two
    balance sheets — one line for Fuel Oil Consumption & Balance (Tons), one for
    AVCAT Status / aviation fuel (Litres). Different units by design; both are
    plotted as raw monthly consumption on one shared axis.

    Ordered oldest-first so the line chart reads left to right. A month with
    neither sheet filled in is skipped; a month with only one is kept, with the
    other side showing as 0 rather than dropping real data for that month.

    With no `year`, shows the most recent `limit` returns (across all years) so the
    chart isn't empty by default. Passing `year` scopes to that year's returns only
    (a year has at most 12, so `limit` doesn't apply) — this is what powers the
    dashboard's year filter/drill-down.
    """
    headers_qs = SrarMonthlyHeader.objects.filter(_current_ship_scope_q()).order_by(
        "-srar_year", "-srar_month"
    )
    headers_qs = (
        headers_qs.filter(srar_year=year) if year is not None else headers_qs[:limit]
    )
    headers = list(headers_qs)
    header_ids = [header.id for header in headers]

    fuel_by_header = dict(
        FuelConsumptionMonth.objects.filter(
            srar_monthly_header_id__in=header_ids
        ).values_list("srar_monthly_header_id", "total_consumed")
    )
    avcat_by_header = dict(
        AvcatStatus.objects.filter(srar_monthly_header_id__in=header_ids).values_list(
            "srar_monthly_header_id", "total_consumed"
        )
    )

    series = []
    for header in reversed(headers):
        fuel_oil = fuel_by_header.get(header.id)
        avcat = avcat_by_header.get(header.id)
        if fuel_oil is None and avcat is None:
            continue
        series.append(
            {
                "header_id": header.id,
                "month": f"{calendar.month_abbr[header.srar_month]} {header.srar_year}",
                "month_num": header.srar_month,
                "year": header.srar_year,
                "fuel_oil_consumed": fuel_oil or 0,
                "avcat_consumed": avcat or 0,
            }
        )

    return {
        "series": series,
        "has_data": bool(series),
        "fuel_oil_units": "Tons",
        "avcat_units": "Litres",
        "available_years": get_available_srar_years(),
        "selected_year": year,
    }


def get_dynamic_dguf_chart_data(year=None):
    """Per-diesel-alternator running hours, split sea/anchorage vs port.

    Sourced from SRAR form 8 section 1. The two segments sum to the form's own
    "Total R/H in Month", which the transaction screen already validates, so the
    stack total is consistent with what the operator entered.

    With no `year`, aggregates across every saved return. Passing `year` scopes to
    that year's returns only — the dashboard's year filter. Each DA bucket also
    carries `breakdown`: the individual returns that make up its total, since one
    bar here (unlike a Fuel Consumption Trend point) spans many returns — the
    dashboard's drill-down for this chart opens that list instead of one report.
    """
    rows = DGUF.objects.select_related("sfd_details", "srar_monthly_header").filter(
        _current_ship_scope_q(field_prefix="srar_monthly_header__")
    )
    if year is not None:
        rows = rows.filter(srar_monthly_header__srar_year=year)
    rows = rows.all()

    buckets = {}
    for row in rows:
        label = (
            row.da_number
            or getattr(row.sfd_details, "equipment_name", None)
            or row.serial_no
            or "Unnamed DA"
        )
        bucket = buckets.setdefault(
            label,
            {
                "da": label,
                "at_sea_anchorage": 0.0,
                "at_port": 0.0,
                "total": 0.0,
                "breakdown": [],
            },
        )
        at_sea = hhmm_to_hours(row.rh_at_sea_and_anchorage) or 0.0
        at_port = hhmm_to_hours(row.rh_at_port) or 0.0
        stated_total = hhmm_to_hours(row.total_rh_in_month)
        row_total = stated_total if stated_total is not None else at_sea + at_port

        bucket["at_sea_anchorage"] += at_sea
        bucket["at_port"] += at_port
        bucket["total"] += row_total

        header = row.srar_monthly_header
        if header is not None:
            bucket["breakdown"].append(
                {
                    "header_id": header.id,
                    "year": header.srar_year,
                    "month_num": header.srar_month,
                    "month": f"{calendar.month_abbr[header.srar_month]} {header.srar_year}",
                    "at_sea_anchorage": round(at_sea, 2),
                    "at_port": round(at_port, 2),
                    "total": round(row_total, 2),
                }
            )

    series = sorted(buckets.values(), key=lambda item: -item["total"])
    for item in series:
        item["breakdown"].sort(key=lambda r: (r["year"], r["month_num"]))
        item["at_sea_anchorage"] = round(item["at_sea_anchorage"], 2)
        item["at_port"] = round(item["at_port"], 2)
        item["total"] = round(item["total"], 2)

    return {
        "series": series,
        "has_data": bool(series),
        "units": "hours",
        "available_years": get_available_srar_years(),
        "selected_year": year,
    }
