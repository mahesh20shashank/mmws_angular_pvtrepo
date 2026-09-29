"""
DRF Views and ViewSets for the SRAR (Ship Return and Activity Report) Module.
Enforces PEP 8 compliance and RESTful API standards.
"""

import calendar
import logging

from accounts import rbac
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.utils import extend_schema
from ems.models import MaintopDetail
from master.models import Frequency
from master.utils import get_this_ship
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from sfd.models import ShipEquipment
from swmm.async_jobs import accepted_task_response, dispatch_task, sync_task_response

from srar.models import (
    DGUF,
    EEF,
    STP,
    AnnualSRMRRoutineUndertaken,
    AnnualSRMRRoutineUndertakenofGTG,
    AvcatStatus,
    ChMasterFullPowerConductedBy,
    CmmsLubricant,
    DGUFLimits,
    DGUFSeaHarbourRunningHourDataInput,
    DieselReductionGearExploitation,
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
    ShipActivityDetail,
    ShipActivityType,
    ShipLocation,
    ShipState,
    SrarAdjustment,
    SrarBoilerAlkalinitySalinityDetail,
    SrarCentrifuge,
    SrarEquipmentExploitation,
    SrarEquipmentTypeList,
    SrarEquipmentValidity,
    SrarLinkedEquipment,
    SrarMasterEquipment,
    SrarMonthlyBoiler,
    SrarMonthlyEquipment,
    SrarMonthlyHeader,
    SrarMonthlyLubricant,
    SrarMonthlyShipActivity,
    TorsionMeter,
)
from srar.serializers import (
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
    GenericSuccessResponseSerializer,
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
    ShipActivityDetailSerializer,
    ShipActivityTypeSerializer,
    ShipLocationSerializer,
    ShipStateSerializer,
    SrarAdjustmentSerializer,
    SrarBoilerAlkalinitySalinityDetailSerializer,
    SRARBulkCreateSerializer,
    SrarCentrifugeSerializer,
    SrarEquipmentExploitationSerializer,
    SrarEquipmentTypeListSerializer,
    SrarEquipmentValiditySerializer,
    SrarLinkedEquipmentSerializer,
    SrarMonthlyBoilerSerializer,
    SrarMonthlyEquipmentSerializer,
    SrarMonthlyHeaderSerializer,
    SrarMonthlyLubricantSerializer,
    SrarMonthlyShipActivitySerializer,
    STPSerializer,
    TorsionMeterSerializer,
)
from srar.services import (
    _period_before_q,
    _this_ship_scope_q,
    cumulative_since_commissioning_before,
    get_latest_prior_header,
    save_srar_report,
)
from srar.tasks import export_report_pdf_task
from srar.utils import (
    build_srar_report_payload,
    get_dynamic_dguf_chart_data,
    get_dynamic_exploitation_kpis,
    get_dynamic_fuel_trend_data,
    get_dynamic_kpis_data,
    get_dynamic_monthly_trend_data,
    get_dynamic_yearly_status_data,
)

User = get_user_model()
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# Report & Dashboard Operation API Views
# ─────────────────────────────────────────────────────────────


class SrarDashboardAPIView(APIView):
    """
    Returns dashboard grid listing of all SRAR monthly headers.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        headers = SrarMonthlyHeader.objects.only(
            "id",
            "srar_month",
            "srar_year",
            "cmms_sync_status",
            "send_to_co",
            "co_approved",
            "is_saved",
        ).order_by("-srar_year", "-srar_month")

        # Get query parameters
        month_param = request.query_params.get("month", "").strip()
        year_param = request.query_params.get("year", "").strip()
        search_param = request.query_params.get("search", "").strip()

        month_map = {
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

        # Filter by Month
        if month_param:
            if month_param.isdigit():
                headers = headers.filter(srar_month=int(month_param))
            elif month_param.lower() in month_map:
                headers = headers.filter(srar_month=month_map[month_param.lower()])

        # Filter by Year
        if year_param:
            if year_param.isdigit():
                headers = headers.filter(srar_year=int(year_param))

        # Search Query
        if search_param:
            matched_month = month_map.get(search_param.lower())

            q_filters = Q()
            if search_param.isdigit():
                q_filters |= Q(srar_year=int(search_param)) | Q(
                    srar_month=int(search_param)
                )
            else:
                q_filters |= Q(srar_year__icontains=search_param)

            if matched_month:
                q_filters |= Q(srar_month=matched_month)

            headers = headers.filter(q_filters)

        data = []
        for h in headers.iterator(chunk_size=500):
            cmms_sync_status = bool(h.cmms_sync_status)
            send_to_co = bool(h.send_to_co)
            co_approved = bool(getattr(h, "co_approved", False))
            is_saved = bool(h.is_saved)

            if cmms_sync_status:
                status_str = "CMMS Synced"
            elif co_approved:
                status_str = "CO Approved & CMMS Sync Pending"
            elif send_to_co:
                status_str = "Sent to CO Approval"
            elif is_saved:
                status_str = "Draft"
            else:
                status_str = "Draft"

            month_name = (
                calendar.month_name[h.srar_month]
                if 1 <= h.srar_month <= 12
                else str(h.srar_month)
            )

            data.append(
                {
                    "id": h.id,
                    "year": h.srar_year,
                    "month": h.srar_month,
                    "month_name": month_name,
                    "status": status_str,
                    "cmms_sync_status": cmms_sync_status,
                    "send_to_co": send_to_co,
                    "co_approved": co_approved,
                    "is_saved": is_saved,
                    "can_edit": True,
                    "can_preview": True,
                    "can_export": True,
                }
            )

        return Response(data, status=status.HTTP_200_OK)


class SrarReportDetailAPIView(APIView):
    """
    Retrieves the complete data structure of a monthly report (all tabs nested).
    """

    permission_classes = [AllowAny]

    def get(self, request, header_id):
        _ = request
        header = get_object_or_404(SrarMonthlyHeader, pk=header_id)
        return Response(build_srar_report_payload(header), status=status.HTTP_200_OK)


def _cmms_rhsi_hhmm_by_equipment():
    """Every SRAR equipment's CMMS running-hours-since-installation, as "H:MM".

    `ShipEquipment.eq_rhsi` is the latest T_SRARMthlyEquipments.HrsFromInstallation
    reading for that fitting, pulled by the SFD master sync (step 1 of "Sync With
    CMMS" — see swmmapi.views.CMMSFDDataAPI._sync_equipment_rhsi). It is stored as
    decimal hours ("9206.1"), while the RHSI columns on tabs 7 and 10 are HH:MM.

    Equipment CMMS holds no reading for is omitted rather than returned as zero — on
    this hull CMMS genuinely has no HrsFromInstallation for the AC plants, purifiers
    or OBM, and a fabricated 0 would read as "installed and never run".
    """
    by_equipment = {}
    for eq_id, equipment_name, nomenclature, eq_rhsi in (
        ShipEquipment.objects.filter(is_srar=True)
        .exclude(eq_rhsi__isnull=True)
        .exclude(eq_rhsi="")
        .values_list("id", "equipment_name", "nomenclature", "eq_rhsi")
    ):
        try:
            hours = float(eq_rhsi)
        except (TypeError, ValueError):
            continue
        whole = int(hours)
        by_equipment[eq_id] = {
            "name": nomenclature or equipment_name or "",
            "hhmm": f"{whole}:{int(round((hours - whole) * 60)):02d}",
        }
    return by_equipment


def _is_blank_rhsi(value):
    """True when a stored RHSI carries no reading — None, "", "0", "0.0", "00:00".

    Nothing fitted to a hull genuinely has zero hours since installation, so a stored
    zero means "never recorded". Same rule as _equipment_rhsi_carry_forward applies to
    Tab 1; without it, a return filed while these columns were broken keeps shadowing
    the real CMMS reading forever.
    """
    if value is None:
        return True
    text = str(value).strip()
    if not text:
        return True
    try:
        return all(float(part or 0) == 0 for part in text.split(":"))
    except ValueError:
        return False


def _append_cmms_rhsi_fallback(rows, rhsi_by_equipment, build_row, rhsi_field):
    """Backfills tabs 7/10 "RH since installation" from CMMS wherever the prior return
    left it blank, and adds a row for equipment the prior return didn't cover at all.

    These tabs sourced that column solely from the previous return's own saved rows, so
    on a ship that has never filed a complete return through SWMM every one of them read
    00:00 — including for main engines and diesel alternators CMMS has tens of thousands
    of hours on record for. A real carried-forward reading always wins; this only fills
    gaps.
    """
    seen = set()
    for row in rows:
        eq_id = row.get("sfd_details")
        if not eq_id:
            continue
        seen.add(eq_id)
        info = rhsi_by_equipment.get(eq_id)
        if info and _is_blank_rhsi(row.get(rhsi_field)):
            row[rhsi_field] = info["hhmm"]
    for eq_id, info in rhsi_by_equipment.items():
        if eq_id not in seen:
            rows.append(build_row(eq_id, info))
    return rows


def _latest_prior_balance_left_on_board(model, ship_id, month, year):
    """`balance_left_on_board` from the most recent return before (month, year) that
    actually recorded one, for FuelConsumptionMonth or AvcatStatus.

    Searches back through every earlier return rather than reading only the latest one:
    a return that was filed without its Fuel/AVCAT tab touched has no row at all, and
    stopping there reported "nothing brought forward" when an earlier return plainly
    said otherwise. A recorded zero IS respected — unlike equipment running hours, an
    empty tank is a real reading.
    """
    from srar.models import SrarMonthlyHeader

    prior_header_ids = SrarMonthlyHeader.objects.filter(
        _this_ship_scope_q(ship_id) & _period_before_q(month, year)
    ).values_list("id", flat=True)

    return (
        model.objects.filter(
            srar_monthly_header_id__in=list(prior_header_ids),
            balance_left_on_board__isnull=False,
        )
        .order_by("-srar_monthly_header__srar_year", "-srar_monthly_header__srar_month")
        .values_list("balance_left_on_board", flat=True)
        .first()
    )


def _equipment_rhsi_carry_forward(ship_id, month, year):
    """Tab 1 "Hrs Since Installation" per equipment, as of the start of (month, year).

    Two sources, in order:

    1. The most recent SrarEquipmentExploitation row for that equipment across ALL
       earlier returns — not just the adjacent month, which is what left this empty
       whenever the returns had a gap.
    2. Failing that, `ShipEquipment.eq_rhsi` — the latest RHSI reading CMMS itself
       holds for the equipment (T_SRARMthlyEquipments.HrsFromInstallation), already
       pulled onto every fitting by the SFD master sync that runs as step 1 of "Sync
       With CMMS" (see swmmapi.views.CMMSFDDataAPI._sync_equipment_rhsi). Without
       this fallback the column read 0 for every piece of equipment on a ship that
       had never filed a return *through SWMM*, even though CMMS knew its real
       running hours all along.

    Equipment with no reading in either source is omitted rather than sent as 0, so
    the frontend leaves it blank instead of asserting a running total of zero.
    """
    from srar.models import SrarMonthlyHeader

    prior_header_ids = SrarMonthlyHeader.objects.filter(
        _this_ship_scope_q(ship_id) & _period_before_q(month, year)
    ).values_list("id", flat=True)

    rhsi_by_equipment = {}
    # Ascending period order, so the newest return for a given equipment overwrites
    # every older one and wins.
    #
    # `rhsi_till_current_month__gt=0` treats a stored zero as "no reading" rather than
    # as a real running total. Nothing fitted to a hull genuinely has zero hours since
    # installation, and returns filed while this column was broken hold a literal 0 —
    # counting those as data let one bad save permanently shadow the real reading CMMS
    # has for that equipment.
    for row in (
        SrarEquipmentExploitation.objects.filter(
            srar_monthly_header_id__in=list(prior_header_ids),
            sfd_details_id__isnull=False,
            rhsi_till_current_month__gt=0,
        )
        .order_by("srar_monthly_header__srar_year", "srar_monthly_header__srar_month")
        .values("sfd_details_id", "rhsi_till_current_month")
    ):
        rhsi_by_equipment[row["sfd_details_id"]] = row["rhsi_till_current_month"]

    for eq_id, eq_rhsi in (
        ShipEquipment.objects.filter(is_srar=True)
        .exclude(eq_rhsi__isnull=True)
        .exclude(eq_rhsi="")
        .values_list("id", "eq_rhsi")
    ):
        if eq_id in rhsi_by_equipment:
            continue
        try:
            rhsi_by_equipment[eq_id] = int(float(eq_rhsi))
        except (TypeError, ValueError):
            continue

    return [
        {"sfd_details": eq_id, "rhsi_till_current_month": hours}
        for eq_id, hours in rhsi_by_equipment.items()
    ]


class SrarCarryForwardAPIView(APIView):
    """
    Returns values that should be carried forward into a given ship/month/year's SRAR
    from the returns already on file: the "Since Commissioning" hours/distance
    baseline, fuel & AVCAT balance left on board, diesel engine running hours since
    installation, GT/RG running hours since installation, Tab 1 equipment RHSI, and
    full Tab 7 SDC/FIP equipment rows (each row includes `sfd_details`, `eqpt_code`
    and `eqpt_name` so the frontend can match it to the correct equipment row by
    whichever key it already uses).

    Two things are sourced differently, both deliberately:

    * The Since Commissioning baseline is the sum of EVERY earlier return
      (cumulative_since_commissioning_before), not a value read off one header.
    * Everything else reads from the latest return actually on file
      (get_latest_prior_header), not from the adjacent calendar month.

    Neither depends on the immediately-preceding month existing, so a gap in the
    returns no longer silently carries forward zeros — which is what left Since
    Commissioning at 0:00/0.00 and fuel B/F at 0 on a ship whose history stops at
    3/2024 while the form was opened on a 2026 period.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        ship_id = request.query_params.get("ship")
        month = request.query_params.get("month")
        year = request.query_params.get("year")

        empty_response = {
            "fuel_balance_last_month": 0,
            "avcat_balance_last_month": 0,
            "since_commissioning_hours_last_month_hr": 0,
            "since_commissioning_hours_last_month_min": 0,
            "since_commissioning_distance_last_month": 0,
            "equipment_hours": [],
            "injector_fip": [],
            "safety_device_checks": [],
            "gas_turbine": [],
            "reduction_gear": [],
            "diesel_reduction_gear": [],
            "gtg": [],
            "gtg_reduction_gear": [],
            "fpt_main_engine": None,
            "rh_extensions": [],
        }

        if not (month and year):
            return Response(empty_response, status=status.HTTP_200_OK)

        try:
            ship_id = int(ship_id) if ship_id else None
            month = int(month)
            year = int(year)
        except (TypeError, ValueError):
            return Response(empty_response, status=status.HTTP_200_OK)

        # All three are computed across every earlier return, so they stand on their own
        # even when the latest prior header carries no per-tab detail to carry forward.
        since_comm_hr, since_comm_min, since_comm_distance = (
            cumulative_since_commissioning_before(ship_id, month, year)
        )
        equipment_hours = _equipment_rhsi_carry_forward(ship_id, month, year)
        fuel_balance = _latest_prior_balance_left_on_board(
            FuelConsumptionMonth, ship_id, month, year
        )
        avcat_balance = _latest_prior_balance_left_on_board(
            AvcatStatus, ship_id, month, year
        )

        resolved = {
            **empty_response,
            "fuel_balance_last_month": fuel_balance if fuel_balance is not None else 0,
            "avcat_balance_last_month": (
                avcat_balance if avcat_balance is not None else 0
            ),
            "since_commissioning_hours_last_month_hr": since_comm_hr,
            "since_commissioning_hours_last_month_min": since_comm_min,
            "since_commissioning_distance_last_month": since_comm_distance,
            "equipment_hours": equipment_hours,
        }

        # The remaining per-tab lists below are equipment rosters rather than running
        # totals — they describe what the last return actually tracked, so they stay
        # keyed to that single return. With no prior return at all they are empty apart
        # from the CMMS RHSI fallback, which stands on its own.
        previous_header = get_latest_prior_header(ship_id, month, year)
        if not previous_header:
            rhsi_by_equipment = _cmms_rhsi_hhmm_by_equipment()
            return Response(
                {
                    **resolved,
                    "injector_fip": _append_cmms_rhsi_fallback(
                        [],
                        rhsi_by_equipment,
                        lambda eq_id, info: {
                            "sfd_details": eq_id,
                            "eqpt_name": info["name"],
                            "nomenclature": info["name"],
                            "eqpt_code": None,
                            "loc_on_board": None,
                            "running_hours_since_installation": info["hhmm"],
                        },
                        "running_hours_since_installation",
                    ),
                    "gas_turbine": _append_cmms_rhsi_fallback(
                        [],
                        rhsi_by_equipment,
                        lambda eq_id, info: {
                            "sfd_details": eq_id,
                            "eqpt_code": None,
                            "eqpt_name": info["name"],
                            "total_rh_si": info["hhmm"],
                            "rh_regime_1_si": None,
                            "rh_regime_2_si": None,
                            "rh_regime_3_si": None,
                        },
                        "total_rh_si",
                    ),
                    "reduction_gear": _append_cmms_rhsi_fallback(
                        [],
                        rhsi_by_equipment,
                        lambda eq_id, info: {
                            "sfd_details": eq_id,
                            "eqpt_code": None,
                            "eqpt_name": info["name"],
                            "total_rh_si": info["hhmm"],
                            "total_rh_regime1_si": None,
                            "total_rh_regime2_si": None,
                            "total_rh_regime3_si": None,
                        },
                        "total_rh_si",
                    ),
                    "gtg": _append_cmms_rhsi_fallback(
                        [],
                        rhsi_by_equipment,
                        lambda eq_id, info: {
                            "sfd_details": eq_id,
                            "eqpt_code": None,
                            "eqpt_name": info["name"],
                            "total_rh_si": info["hhmm"],
                            "no_of_cold_starts_si": None,
                            "no_of_hot_starts_si": None,
                            "no_of_battery_cold_starts_si": None,
                            "no_of_battery_hot_starts_si": None,
                        },
                        "total_rh_si",
                    ),
                    "diesel_reduction_gear": _append_cmms_rhsi_fallback(
                        [],
                        rhsi_by_equipment,
                        lambda eq_id, info: {
                            "sfd_details": eq_id,
                            "eqpt_code": None,
                            "eqpt_name": info["name"],
                            "hrs_since_installation": info["hhmm"],
                        },
                        "hrs_since_installation",
                    ),
                },
                status=status.HTTP_200_OK,
            )

        # Rows are matched back to this month's equipment by sfd_details first (the
        # frontend now carries the ShipEquipment id on every row), then eqpt_code /
        # eqpt_name.
        rhsi_by_equipment = _cmms_rhsi_hhmm_by_equipment()
        injector_fip = [
            {
                "sfd_details": row["sfd_details_id"],
                "eqpt_name": row["eqpt_name"],
                "nomenclature": row["nomenclature"],
                "eqpt_code": row["eqpt_code"],
                "loc_on_board": row["loc_on_board"],
                "running_hours_since_installation": row[
                    "running_hours_since_installation"
                ],
            }
            for row in InjectorFIPCalibrationReplacement.objects.filter(
                srar_monthly_header=previous_header
            ).values(
                "sfd_details_id",
                "eqpt_name",
                "nomenclature",
                "eqpt_code",
                "loc_on_board",
                "running_hours_since_installation",
            )
            if row["eqpt_code"] or row["eqpt_name"] or row["sfd_details_id"]
        ]
        _append_cmms_rhsi_fallback(
            injector_fip,
            rhsi_by_equipment,
            lambda eq_id, info: {
                "sfd_details": eq_id,
                "eqpt_name": info["name"],
                "nomenclature": info["name"],
                "eqpt_code": None,
                "loc_on_board": None,
                "running_hours_since_installation": info["hhmm"],
            },
            "running_hours_since_installation",
        )

        # Tab 7: Safety Device Checks — full previous-month equipment rows (there is no
        # per-category master-equipment source for this tab, so last month's own SRAR
        # is the only live source of "which equipment this ship tracks here").
        safety_device_checks = [
            {
                "sfd_details": row["sfd_details_id"],
                "eqpt_name": row["eqpt_name"],
                "nomenclature": row["nomenclature"],
                "eqpt_code": row["eqpt_code"],
                "loc_on_board": row["loc_on_board"],
            }
            for row in SafetyDeviceCheckTrial.objects.filter(
                srar_monthly_header=previous_header
            ).values(
                "sfd_details_id",
                "eqpt_name",
                "nomenclature",
                "eqpt_code",
                "loc_on_board",
            )
            if row["eqpt_code"] or row["eqpt_name"] or row["sfd_details_id"]
        ]
        gas_turbine = [
            {
                "sfd_details": row["sfd_details_id"],
                "eqpt_code": row["eqpt_code"],
                "eqpt_name": row["eqpt_name"],
                "total_rh_si": row["total_rh_si"],
                "rh_regime_1_si": row["rh_regime_1_si"],
                "rh_regime_2_si": row["rh_regime_2_si"],
                "rh_regime_3_si": row["rh_regime_3_si"],
                # Every "SI" (since-installation) counter on the tab, not just the
                # running-hour ones: each is last month's figure plus what this month
                # adds, so the form can compute and lock them all the same way.
                "no_of_cold_starts_si": row["no_of_cold_starts_si"],
                "no_of_hot_starts_si": row["no_of_hot_starts_si"],
                "no_of_false_starts_si": row["no_of_false_starts_si"],
                "no_of_tech_starts_si": row["no_of_tech_starts_si"],
                "no_of_astern_engagements_count": row["no_of_astern_engagements_count"],
                "no_of_stop_orders_si": row["no_of_stop_orders_si"],
            }
            for row in GasTurbineExploitation.objects.filter(
                srar_monthly_header=previous_header
            ).values(
                "sfd_details_id",
                "eqpt_code",
                "eqpt_name",
                "total_rh_si",
                "rh_regime_1_si",
                "rh_regime_2_si",
                "rh_regime_3_si",
                "no_of_cold_starts_si",
                "no_of_hot_starts_si",
                "no_of_false_starts_si",
                "no_of_tech_starts_si",
                "no_of_astern_engagements_count",
                "no_of_stop_orders_si",
            )
            if row["eqpt_code"] or row["eqpt_name"] or row["sfd_details_id"]
        ]
        _append_cmms_rhsi_fallback(
            gas_turbine,
            rhsi_by_equipment,
            lambda eq_id, info: {
                "sfd_details": eq_id,
                "eqpt_code": None,
                "eqpt_name": info["name"],
                "total_rh_si": info["hhmm"],
                "rh_regime_1_si": None,
                "rh_regime_2_si": None,
                "rh_regime_3_si": None,
            },
            "total_rh_si",
        )
        reduction_gear = [
            {
                "sfd_details": row["sfd_details_id"],
                "eqpt_code": row["eqpt_code"],
                "eqpt_name": row["eqpt_name"],
                "total_rh_si": row["total_rh_si"],
                "total_rh_regime1_si": row["total_rh_regime1_si"],
                "total_rh_regime2_si": row["total_rh_regime2_si"],
                "total_rh_regime3_si": row["total_rh_regime3_si"],
                "trailing_rh_si": row["trailing_rh_si"],
                "service_life_si": row["service_life_si"],
                "no_of_eng_regime1_si": row["no_of_eng_regime1_si"],
                "no_of_eng_regime2_si": row["no_of_eng_regime2_si"],
                "no_of_eng_regime3_si": row["no_of_eng_regime3_si"],
                "no_of_eng_regime4_si": row["no_of_eng_regime4_si"],
            }
            for row in ReductionGearExploitation.objects.filter(
                srar_monthly_header=previous_header
            ).values(
                "sfd_details_id",
                "eqpt_code",
                "eqpt_name",
                "total_rh_si",
                "total_rh_regime1_si",
                "total_rh_regime2_si",
                "total_rh_regime3_si",
                "trailing_rh_si",
                "service_life_si",
                "no_of_eng_regime1_si",
                "no_of_eng_regime2_si",
                "no_of_eng_regime3_si",
                "no_of_eng_regime4_si",
            )
            if row["eqpt_code"] or row["eqpt_name"] or row["sfd_details_id"]
        ]
        _append_cmms_rhsi_fallback(
            reduction_gear,
            rhsi_by_equipment,
            lambda eq_id, info: {
                "sfd_details": eq_id,
                "eqpt_code": None,
                "eqpt_name": info["name"],
                "total_rh_si": info["hhmm"],
                "total_rh_regime1_si": None,
                "total_rh_regime2_si": None,
                "total_rh_regime3_si": None,
            },
            "total_rh_si",
        )

        # Tab 7: Diesel Reduction Gear — only "hours since installation" carries
        # forward; hours-for-month is entered fresh each return.
        diesel_reduction_gear = [
            {
                "sfd_details": row["sfd_details_id"],
                "eqpt_code": row["eqpt_code"],
                "eqpt_name": row["eqpt_name"],
                "hrs_since_installation": row["hrs_since_installation"],
            }
            for row in DieselReductionGearExploitation.objects.filter(
                srar_monthly_header=previous_header
            ).values(
                "sfd_details_id",
                "eqpt_code",
                "eqpt_name",
                "hrs_since_installation",
            )
            if row["eqpt_code"] or row["eqpt_name"] or row["sfd_details_id"]
        ]
        _append_cmms_rhsi_fallback(
            diesel_reduction_gear,
            rhsi_by_equipment,
            lambda eq_id, info: {
                "sfd_details": eq_id,
                "eqpt_code": None,
                "eqpt_name": info["name"],
                "hrs_since_installation": info["hhmm"],
            },
            "hrs_since_installation",
        )

        # Tab 11: GTG and its reduction gear. Both were missing from this endpoint
        # entirely, which is why the GTG tab had no baseline to add this month's hours
        # to — it fell back to adding Tab 1's hours-underway instead, and its start
        # counters were left for the operator to total up by hand every month.
        gtg = [
            {
                "sfd_details": row["sfd_details_id"],
                "eqpt_code": row["eqpt_code"],
                "eqpt_name": row["eqpt_name"],
                "total_rh_si": row["total_rh_si"],
                "no_of_cold_starts_si": row["no_of_cold_starts_si"],
                "no_of_hot_starts_si": row["no_of_hot_starts_si"],
                "no_of_battery_cold_starts_si": row["no_of_battery_cold_starts_si"],
                "no_of_battery_hot_starts_si": row["no_of_battery_hot_starts_si"],
            }
            for row in GasTurbineGeneratorExploitation.objects.filter(
                srar_monthly_header=previous_header
            ).values(
                "sfd_details_id",
                "eqpt_code",
                "eqpt_name",
                "total_rh_si",
                "no_of_cold_starts_si",
                "no_of_hot_starts_si",
                "no_of_battery_cold_starts_si",
                "no_of_battery_hot_starts_si",
            )
            if row["eqpt_code"] or row["eqpt_name"] or row["sfd_details_id"]
        ]
        _append_cmms_rhsi_fallback(
            gtg,
            rhsi_by_equipment,
            lambda eq_id, info: {
                "sfd_details": eq_id,
                "eqpt_code": None,
                "eqpt_name": info["name"],
                "total_rh_si": info["hhmm"],
                "no_of_cold_starts_si": None,
                "no_of_hot_starts_si": None,
                "no_of_battery_cold_starts_si": None,
                "no_of_battery_hot_starts_si": None,
            },
            "total_rh_si",
        )
        gtg_reduction_gear = [
            {
                "sfd_details": row["sfd_details_id"],
                "eqpt_code": row["eqpt_code"],
                "eqpt_name": row["eqpt_name"],
                "in_months_si": row["in_months_si"],
            }
            for row in ReductionGearExploitationofGTG.objects.filter(
                srar_monthly_header=previous_header
            ).values(
                "sfd_details_id",
                "eqpt_code",
                "eqpt_name",
                "in_months_si",
            )
            if row["eqpt_code"] or row["eqpt_name"] or row["sfd_details_id"]
        ]

        # Tab 9 Full Power Trials (Main Engine) — the trial's own particulars. A full
        # power trial is not run monthly, so the figures on the last return are still the
        # current ones: displacement, draughts, max speed, who conducted it and when.
        # Carried forward so the operator confirms them rather than re-typing the same
        # numbers every month. `date` is included so "Last FPT Date" starts populated.
        fpt_row = (
            FullPowerTrialsMainEngine.objects.filter(
                srar_monthly_header=previous_header
            )
            .values(
                "date",
                "occasion_reason",
                "draught_fwd",
                "draught_aft",
                "displacement",
                "max_speed",
                "conducted_by",
                "torsion_meter_reading",
                "sea_state",
                "pending_dr_activities_reason",
            )
            .first()
        )

        # Tab 13 R/H Extension — one row per equipment, keyed like every other tab so the
        # frontend can match it to this month's roster.
        rh_extensions = [
            {
                "sfd_details": row["sfd_details_id"],
                "eqpt_name": row["eqpt_name"],
                "eqpt_code": None,
                "nomenclature": row["nomenclature"],
                "loc_on_board": row["loc_on_board"],
                "serial_no": row["serial_no"],
                "equipment_type": row["equipment_type"],
                "on_routine": row["on_routine_id"],
                "on_routine_text": row["on_routine_text"],
                "total_rh_in_month": row["total_rh_in_month"],
                "rh_ext_at_conduct_of_ext_trial": row["rh_ext_at_conduct_of_ext_trial"],
                "authority_letter_for_extension_trial": row[
                    "authority_letter_for_extension_trial"
                ],
                "rh_extension_granted_upto": row["rh_extension_granted_upto"],
                "rh_left_for_expiry_of_extension": row[
                    "rh_left_for_expiry_of_extension"
                ],
                "trial_conducted_by": row["trial_conducted_by"],
            }
            for row in RHExtension.objects.filter(
                srar_monthly_header=previous_header
            ).values(
                "sfd_details_id",
                "eqpt_name",
                "nomenclature",
                "loc_on_board",
                "serial_no",
                "equipment_type",
                "on_routine_id",
                "on_routine_text",
                "total_rh_in_month",
                "rh_ext_at_conduct_of_ext_trial",
                "authority_letter_for_extension_trial",
                "rh_extension_granted_upto",
                "rh_left_for_expiry_of_extension",
                "trial_conducted_by",
            )
            if row["eqpt_name"] or row["sfd_details_id"]
        ]

        return Response(
            {
                **resolved,
                "injector_fip": injector_fip,
                "safety_device_checks": safety_device_checks,
                "gas_turbine": gas_turbine,
                "reduction_gear": reduction_gear,
                "diesel_reduction_gear": diesel_reduction_gear,
                "gtg": gtg,
                "gtg_reduction_gear": gtg_reduction_gear,
                "fpt_main_engine": fpt_row,
                "rh_extensions": rh_extensions,
            },
            status=status.HTTP_200_OK,
        )


@method_decorator(csrf_exempt, name="dispatch")
class SrarReportSaveAPIView(APIView):
    """
    Saves or updates the entire monthly report (header and related lists) in one nested payload.
    """

    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        result = save_srar_report(request.data, user=request.user.CustomUser_profile)
        return Response(result, status=status.HTTP_200_OK)


class SrarReportFinalizeAPIView(APIView):
    """
    Finalizes the monthly report, updating the EO signatures and setting approval status.

    Two distinct actions share this endpoint, and which one runs is taken from the
    request's `action` rather than inferred from the caller's role:

    * ``submit`` -- the ship sends the return up for CO approval.
    * ``approve`` -- the CO approves a return that was sent up, which is what
      unlocks the CMMS sync.

    Inferring it from the role alone meant a caller the role check didn't
    recognise as CO fell through to the submit branch, which *resets*
    ``co_approved`` to False -- so "Approve" answered success while leaving the
    return un-approved and its sync button disabled.
    """

    def post(self, request, srar_id):
        header = get_object_or_404(SrarMonthlyHeader, pk=srar_id)
        is_co = rbac.is_co_role(request.user)

        action = str(request.data.get("action") or "").strip().lower()
        if action not in ("submit", "approve"):
            # Older clients sent only `send_to_co`; keep them working by falling
            # back to the previous role-derived behaviour.
            action = "approve" if is_co else "submit"

        if action == "approve" and not is_co:
            return Response(
                {
                    "success": False,
                    "message": "Only the Commanding Officer can approve an SRAR.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if action == "submit" and header.co_approved:
            # Without this the submit branch below would silently un-approve an
            # already-approved return (and, if it had been synced, re-open it).
            return Response(
                {
                    "success": False,
                    "message": "This SRAR has already been approved by the CO and cannot be resubmitted.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        header.eo_writer_contact_no = request.data.get(
            "eo_writer_contact_no", header.eo_writer_contact_no
        )
        header.eo_rank = request.data.get("eo_rank", header.eo_rank)
        header.eo_name = request.data.get("eo_name", header.eo_name)
        header.eo_personal_no = request.data.get(
            "eo_personal_no", header.eo_personal_no
        )
        header.eo_contact_no = request.data.get("eo_contact_no", header.eo_contact_no)

        if action == "approve":
            if not header.send_to_co:
                return Response(
                    {
                        "success": False,
                        "message": "SRAR must be sent to CO before CO approval.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            header.co_approved = True
            header.is_saved = True
        else:
            header.send_to_co = bool(request.data.get("send_to_co"))
            header.co_approved = False
            header.is_saved = False

        header.save()

        sync_message = ""
        if action == "approve":
            sync_message = self._push_to_cmms(header, request)
            header.refresh_from_db()

        return Response(
            {
                "success": True,
                "message": (
                    f"SRAR approved by CO. {sync_message}".strip()
                    if action == "approve"
                    else "Report finalized and saved successfully."
                ),
                "send_to_co": header.send_to_co,
                "co_approved": header.co_approved,
                "cmms_sync_status": bool(header.cmms_sync_status),
            },
            status=status.HTTP_200_OK,
        )

    @staticmethod
    def _push_to_cmms(header, request):
        """Send the just-approved return to CMMS. Returns a sentence for the reply.

        CO approval is what unlocks the sync, so it is also the moment the return should
        leave for CMMS -- waiting for someone to remember the Sync All button afterwards is
        how an approved return sat on board for days.

        Never raises, and never fails the approval. CMMS being away is the ordinary case on
        a ship, and an approval that rolls back because the link is down would be worse than
        one that syncs late: the return stays `co_approved` with `cmms_sync_status` still
        false, which is exactly what Sync All's pending query looks for, so the next sync
        picks it up. The reply says which of the two happened rather than leaving the CO to
        guess from a tick.
        """
        from srar.cmms_push import CmmsPushError, push_srar_return

        try:
            push_srar_return(header, actor=getattr(request.user, "user_profile", None))
        except CmmsPushError as exc:
            logger.warning(
                "SRAR %s (%s/%s) approved but not pushed to CMMS: %s",
                header.pk,
                header.srar_month,
                header.srar_year,
                exc,
            )
            return f"Not sent to CMMS yet ({exc}); it will go with the next sync."
        except Exception as exc:
            logger.exception(
                "SRAR %s (%s/%s) approved but the CMMS push failed unexpectedly",
                header.pk,
                header.srar_month,
                header.srar_year,
            )
            return f"Not sent to CMMS yet ({exc}); it will go with the next sync."

        # Stamped only once CMMS has committed it -- the same rule the sync endpoint
        # follows, and what keeps the pending query honest.
        SrarMonthlyHeader.objects.filter(pk=header.pk).update(
            cmms_sync_status=True,
            cmms_sync_date=timezone.now().date(),
        )
        return "Sent to CMMS."


class SrarReportPreviewAPIView(APIView):
    """
    Transactional API to preview the report as DRF JSON.
    """

    def get(self, request, header_id):
        _ = request
        header = get_object_or_404(SrarMonthlyHeader, pk=header_id)
        return Response(build_srar_report_payload(header), status=status.HTTP_200_OK)


class SrarReportExportAPIView(APIView):
    """
    Queues a DRF-native SRAR report export as an ACCDB file.
    """

    def get(self, request, header_id):
        dispatch = dispatch_task(export_report_pdf_task, header_id)
        if dispatch["queued"]:
            return accepted_task_response(
                request,
                dispatch["task"],
                "SRAR report ACCDB export queued for background processing.",
            )
        return sync_task_response(
            dispatch["result"],
            "Background task service unavailable. SRAR ACCDB export completed synchronously.",
        )


class SrarTabSaveAPIView(APIView):
    """
    Endpoint to save a specific tab's dataset.
    """

    @transaction.atomic
    def post(self, request, tab_number):
        return Response(
            {"status": "success", "message": f"Tab {tab_number} saved successfully."},
            status=status.HTTP_200_OK,
        )


# ─────────────────────────────────────────────────────────────
# Master / Metadata Utility API Views
# ─────────────────────────────────────────────────────────────


@method_decorator(csrf_exempt, name="dispatch")
class SrarMasterEquipmentsAPIView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        srar_type = request.GET.get("srar_type")
        universal_ids = [
            item.strip()
            for item in request.GET.get("universal_ids", "").split(",")
            if item.strip()
        ]
        data = []

        try:
            # Only equipment actually linked via "Add SRAR Equipment" (Masters) should
            # surface here — bare category rows created by the CMMS Ch_Master_Equipment_Type
            # sync (equipment_id is null) are catalog data for the category picker only.
            type_qs = SrarEquipmentTypeList.objects.filter(
                equipment_id__isnull=False
            ).order_by("-id")
            if srar_type:
                type_qs = type_qs.filter(srar_type__iexact=srar_type)
            if universal_ids:
                type_qs = type_qs.filter(
                    universal_id_ch_master_equipment_type__in=universal_ids
                )

            type_rows = list(
                type_qs.values(
                    "id",
                    "equipment_id",
                    "srar_txt",
                    "srar_type",
                    "equipment_type_id",
                    "equipment_desc",
                    "status",
                    "cmms_id",
                    "cmms_ship_id",
                    "equipment_category_code",
                    "universal_id",
                    "universal_id_ch_master_equipment_type",
                )
            )

            # Rows created via "Add SRAR Equipment" carry a real equipment_id (the
            # specific ShipEquipment the user linked under that category) — join it
            # so name/serial/location reflect the actual equipment, not just the
            # category text. Rows with no equipment_id are pure category definitions.
            sfd_equipment_ids = {
                row["equipment_id"] for row in type_rows if row["equipment_id"]
            }
            sfd_equipment_by_id = {
                eq.id: eq
                for eq in ShipEquipment.objects.filter(id__in=sfd_equipment_ids)
            }

            for t_item in type_rows:
                try:
                    sfd_equipment = sfd_equipment_by_id.get(t_item["equipment_id"])
                    name_val = (
                        (sfd_equipment and sfd_equipment.equipment_name)
                        or t_item["srar_txt"]
                        or t_item["equipment_desc"]
                        or f"Master Equipment {t_item['id']}"
                    )
                    data.append(
                        {
                            "id": str(t_item["id"]),
                            "equipment_id": t_item["equipment_id"],
                            "name": name_val,
                            "nomenclature": (
                                (sfd_equipment and sfd_equipment.nomenclature)
                                or name_val
                            ),
                            "srar_type": t_item["srar_type"]
                            or t_item["equipment_desc"]
                            or "Equipment Exploitation",
                            "equipment_class": "",
                            # The linked equipment's real CMMS code (e.g. 260001).
                            # Tabs that show an "Eqpt Code" column should prefer this
                            # over a synthesised "RG-01"-style label.
                            "equipment_code": (
                                sfd_equipment and sfd_equipment.equipment_code
                            )
                            or "",
                            "serial_no": (
                                (sfd_equipment and sfd_equipment.equipment_serial_no)
                                or "-"
                            ),
                            "location_on_board": (
                                (sfd_equipment and sfd_equipment.location_on_board)
                                or "-"
                            ),
                            "equipment_type_id": t_item["equipment_type_id"],
                            "equipment_desc": t_item["equipment_desc"],
                            "status": t_item["status"],
                            "cmms_id": t_item["cmms_id"],
                            "cmms_ship_id": t_item["cmms_ship_id"],
                            "equipment_category_code": t_item[
                                "equipment_category_code"
                            ],
                            "universal_id": t_item["universal_id"],
                            "universal_id_ch_master_equipment_type": (
                                t_item["universal_id_ch_master_equipment_type"]
                            ),
                        }
                    )
                except Exception as exc:
                    logger.error(f"Error parsing SrarEquipmentTypeList item: {exc}")
        except Exception as exc:
            logger.error(f"Failed to query SrarEquipmentTypeList: {exc}")

        return Response(data, status=status.HTTP_200_OK)


# Equipment-type categories that belong on Form 1 ("Equipment — Monthly Running
# Hours Updation"), per Ch_Master_Equipment_Type. Given explicitly, not derived —
# there is no generic "which category belongs on which SRAR tab" mapping yet (that's
# the next piece of this to build; DGUF -> Diesel Alternator, Engines -> Main Engine,
# etc. still need their own lists).
FORM1_EQUIPMENT_TYPE_UIDS = [
    "3",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "18",
    "21",
    "32",
]


@extend_schema(tags=["Srar"])
class SrarRunningHoursEquipmentListAPIView(APIView):
    """Real ShipEquipment instances for Form 1.

    Sourced from SrarEquipmentTypeList rows that have a real `equipment_id` link —
    i.e. equipment an admin explicitly added via the "Add SRAR Equipment" screen —
    filtered to the categories that belong on this tab (FORM1_EQUIPMENT_TYPE_UIDS).
    Equipment CMMS marks SRAR-applicable but that hasn't been added here on purpose
    does not show up until someone adds it, by design: the masters screen is the
    single place that decides which specific equipment instances feed each tab.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        _ = request
        linked_ids = (
            SrarEquipmentTypeList.objects.filter(
                equipment_id__isnull=False,
                universal_id_ch_master_equipment_type__in=FORM1_EQUIPMENT_TYPE_UIDS,
            )
            .values_list("equipment_id", flat=True)
            .distinct()
        )
        rows = ShipEquipment.objects.filter(id__in=linked_ids).order_by(
            "equipment_name", "nomenclature"
        )

        data = [
            {
                "id": row.id,
                "equipment_name": row.equipment_name,
                "nomenclature": row.nomenclature or row.equipment_name,
                "equipment_code": row.equipment_code,
                "serial_no": row.equipment_serial_no,
            }
            for row in rows
        ]
        return Response(data, status=status.HTTP_200_OK)


@extend_schema(tags=["Srar"])
class SrarEquipmentByTypeAPIView(APIView):
    """Real ShipEquipment instances for one Ch_Master_Equipment_Type category —
    the second picker in the "Add SRAR Equipment" modal, once a category is chosen.
    Not scoped to already-linked equipment (the opposite of
    SrarRunningHoursEquipmentListAPIView above): this is the full pool an admin can
    still pick from and link.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        universal_id = request.GET.get("universal_id_ch_master_equipment_type")
        if not universal_id:
            return Response(
                {"error": "universal_id_ch_master_equipment_type is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rows = ShipEquipment.objects.filter(
            universal_id_ch_master_equipment_type=universal_id
        ).order_by("equipment_name", "nomenclature")

        data = [
            {
                "id": row.id,
                "equipment_name": row.equipment_name,
                "nomenclature": row.nomenclature or row.equipment_name,
                "equipment_code": row.equipment_code,
                "serial_no": row.equipment_serial_no,
                "location_on_board": row.location_on_board,
            }
            for row in rows
        ]
        return Response(data, status=status.HTTP_200_OK)


@extend_schema(tags=["Srar"])
@method_decorator(csrf_exempt, name="dispatch")
class SrarMasterEquipmentDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        _ = request
        item = get_object_or_404(SrarEquipmentTypeList, pk=pk)
        item.delete()
        return Response(
            {
                "status": "success",
                "id": pk,
                "message": "Master equipment deleted successfully.",
            },
            status=status.HTTP_200_OK,
        )


def _auto_seed_masters_if_empty():
    # `name` is unique on all four models (see migration 0015_dedupe_srar_lookup_names),
    # so get_or_create is race-safe: a concurrent insert of the same name raises
    # IntegrityError, which get_or_create catches internally and re-fetches instead
    # of creating a duplicate row.
    srar_ship_states = [
        "Material Ready",
        "Material Not Ready",
        "Ship Not Commissioned",
    ]
    for name in srar_ship_states:
        ShipState.objects.get_or_create(
            name=name, defaults={"code": name.upper().replace(" ", "_")}
        )

    srar_ship_locations = [
        "At Sea",
        "Alongside Home Port",
        "Alongside Away From Home Port",
    ]
    for name in srar_ship_locations:
        ShipLocation.objects.get_or_create(
            name=name, defaults={"code": name.upper().replace(" ", "_")}
        )

    srar_activity_types = [
        "Anchorage",
        "Independent Excercises",
        "Operational Excercises",
        "Operational Sea Training",
        "Sea Trials",
        "OPDEF",
        "Special Duty",
        "Ship Not Commissioned",
    ]
    for name in srar_activity_types:
        ShipActivityType.objects.get_or_create(
            name=name, defaults={"code": name.upper().replace(" ", "_")}
        )

    srar_activity_details = [
        "NA",
        "IDEF",
        "Tropex",
        "Operational Deployment",
        "Refit - Sea Trials",
        "OSD",
        "POG",
        "HADR",
    ]
    for name in srar_activity_details:
        ShipActivityDetail.objects.get_or_create(
            name=name, defaults={"code": name.upper().replace(" ", "_")}
        )


class SrarShipStatesAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        _ = request
        _auto_seed_masters_if_empty()
        states = ShipState.objects.ordered_by_name()
        data = ShipStateSerializer(states, many=True).data
        return Response(data, status=status.HTTP_200_OK)


class SrarShipLocationsAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        _ = request
        _auto_seed_masters_if_empty()
        locs = ShipLocation.objects.ordered_by_name()
        data = ShipLocationSerializer(locs, many=True).data

        return Response(data, status=status.HTTP_200_OK)


class SrarRoutineHoursAPIView(APIView):
    """The "On Routine" choices for Step 13's R/H Extension tables.

    RHExtension.on_routine is already a ForeignKey to master.Frequency, so the running-
    hours routines the CMMS SRAR form offers in that dropdown (100H, 500H, 1000H,
    3000H, ...) are just the hour-based rows of that master. SWMM's own form had no
    dropdown at all -- Main Engine rendered On Routine as read-only text and Diesel
    Alternator as a free-text box -- so the value was either unfillable or an
    unvalidated string, and on_routine was saved as a hardcoded null.

    Hour-based means `hours` is set to a positive number; every such row in this master
    has months = 0, and the calendar frequencies (SR, 6W, 4M ...) carry no hours at all.
    Sorted by hours so the list reads in order rather than in the master's insertion
    order (which is what makes the CMMS dropdown look shuffled).
    """

    permission_classes = [AllowAny]

    def get(self, request):
        _ = request
        return Response(
            _hour_based_frequency_options(
                Frequency.objects.filter(active=True)
                .exclude(hours__isnull=True)
                .exclude(hours="")
            ),
            status=status.HTTP_200_OK,
        )


def _hour_based_frequency_options(queryset):
    """`{id, label, hours}` options for the hour-based rows of a Frequency queryset.

    Hour-based means `hours` parses to a positive number; `hours` is a CharField because
    values like "0.30" exist in the master, and the calendar frequencies (SR, 6W, 4M ...)
    carry no hours at all. Shared by the whole-master list and the per-equipment one so
    the two dropdowns can't disagree on what counts as a running-hours routine.
    """
    options = []
    for row in queryset.values("id", "frequency", "hours"):
        try:
            hours = float(row["hours"])
        except (TypeError, ValueError):
            continue
        if hours <= 0:
            continue
        options.append(
            {
                "id": row["id"],
                "label": (row["frequency"] or f"{hours:g}H").strip(),
                "hours": hours,
            }
        )
    options.sort(key=lambda opt: opt["hours"])
    return options


class SrarEquipmentRoutinesAPIView(APIView):
    """The "On Routine" choices for ONE equipment — the routines actually attached to it.

    Step 13's dropdown offered every hour-based row of the Frequency master (100H, 500H,
    1000H, 3000H ...) regardless of equipment, so an operator picked an extension routine
    the equipment does not even have.

    A ship's equipment carries its maintop on `ShipEquipment.universal_id_t_maintop_header`,
    and the routines under that maintop are `MaintopDetail` rows carrying the same
    universal id — that pairing resolves routines for 34 of this ship's 44 SRAR equipment,
    where `ShipEquipment.maintop_id` matches nothing in MaintopDetail at all.

    `?equipment=<ShipEquipment id>`. `fallback: true` in the response says the equipment
    has no attached hour-based routine, in which case the full master is returned rather
    than an empty list — On Routine is a mandatory field on the Diesel Alternator table,
    so an empty dropdown would make the return unsubmittable.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        equipment_id = request.query_params.get("equipment")

        maintop_uid = None
        if equipment_id:
            maintop_uid = (
                ShipEquipment.objects.filter(pk=equipment_id)
                .values_list("universal_id_t_maintop_header", flat=True)
                .first()
            )

        if maintop_uid:
            frequency_ids = (
                MaintopDetail.objects.filter(
                    universal_id_t_maintopheader=maintop_uid,
                    frequency_f_key__isnull=False,
                )
                .values_list("frequency_f_key", flat=True)
                .distinct()
            )
            options = _hour_based_frequency_options(
                Frequency.objects.filter(active=True, id__in=list(frequency_ids))
            )
            if options:
                return Response(
                    {"options": options, "fallback": False},
                    status=status.HTTP_200_OK,
                )

        return Response(
            {
                "options": _hour_based_frequency_options(
                    Frequency.objects.filter(active=True)
                    .exclude(hours__isnull=True)
                    .exclude(hours="")
                ),
                "fallback": True,
            },
            status=status.HTTP_200_OK,
        )


class SrarActivityTypesAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        _ = request
        _auto_seed_masters_if_empty()
        types = ShipActivityType.objects.ordered_by_name()
        data = ShipActivityTypeSerializer(types, many=True).data

        return Response(data, status=status.HTTP_200_OK)


class SrarActivityDetailsAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        _ = request
        _auto_seed_masters_if_empty()
        details = ShipActivityDetail.objects.ordered_by_name()
        data = ShipActivityDetailSerializer(details, many=True).data

        return Response(data, status=status.HTTP_200_OK)


# The unit vocabulary the Lubricant Consumption tab offers. Served as-is by
# SrarLubricantUnitsAPIView and used as the target of normalize_lubricant_unit(), so the
# dropdown's options and the units the lubricant picker hands it cannot drift apart.
SRAR_LUBRICANT_UNITS = [
    {"id": 1, "name": "Litre", "code": "LTR"},
    {"id": 2, "name": "Kg", "code": "KG"},
    {"id": 3, "name": "Barrel", "code": "BRL"},
    {"id": 4, "name": "Drums", "code": "DRM"},
]

# CMMS M_Lubricant.Unit is free text entered per lubricant over many years: the live table
# holds L, LTR, LTRS, LTS, LITERS, LITRES, LITTERS, Litre, Lt, l for what SRAR calls
# "Litre" alone, and K/KG/KGS/kg for "Kg". Nothing normalised them, so the unit the picker
# filled in almost never equalled one of the four options above — and a select shows
# nothing for a value that isn't in its list, which is why the unit looked like it vanished
# the moment a lubricant was added and had to be re-picked by hand.
_LUBRICANT_UNIT_ALIASES = {
    "Litre": (
        "L",
        "LT",
        "LTR",
        "LTRS",
        "LTS",
        "LTRE",
        "LITER",
        "LITERS",
        "LITRE",
        "LITRES",
        "LITTER",
        "LITTERS",
    ),
    "Kg": ("K", "KG", "KGS", "KILO", "KILOS", "KILOGRAM", "KILOGRAMS"),
    "Barrel": ("B", "BRL", "BRLS", "BARREL", "BARRELS"),
    "Drums": ("D", "DRM", "DRMS", "DRUM", "DRUMS"),
}

_LUBRICANT_UNIT_BY_ALIAS = {
    alias: name
    for name, aliases in _LUBRICANT_UNIT_ALIASES.items()
    for alias in aliases
}


def normalize_lubricant_unit(unit):
    """A CMMS lubricant unit mapped onto the SRAR unit master, or left as it stands.

    Anything not recognised (CMMS also holds N, T, O, KL and other one-off codes whose
    meaning isn't recorded anywhere) is returned unchanged rather than guessed at — the
    form shows it as given instead of silently substituting a unit nobody chose.
    """
    text = str(unit or "").strip()
    if not text:
        return text
    return _LUBRICANT_UNIT_BY_ALIAS.get(text.upper(), text)


class SrarLubricantUnitsAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        _ = request
        return Response(SRAR_LUBRICANT_UNITS, status=status.HTTP_200_OK)


class SrarEefReasonsAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        _ = request
        reasons = [
            {"id": 1, "name": "Operational Reason", "code": "OP_REASON"},
            {"id": 2, "name": "EHM/Machinery Trial", "code": "EHM_TRIAL"},
            {"id": 3, "name": "PRT/PST", "code": "PRT_PST"},
            {"id": 4, "name": "Within Limit / SAT", "code": "WITHIN_LIMIT"},
            {"id": 5, "name": "Any other", "code": "OTHER"},
        ]
        return Response(reasons, status=status.HTTP_200_OK)


class SrarAllDropdownOptionsAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        _ = request
        _auto_seed_masters_if_empty()

        states = ShipStateSerializer(
            ShipState.objects.ordered_by_name(), many=True
        ).data
        locations = ShipLocationSerializer(
            ShipLocation.objects.ordered_by_name(), many=True
        ).data
        activity_types = ShipActivityTypeSerializer(
            ShipActivityType.objects.ordered_by_name(), many=True
        ).data
        activity_details = ShipActivityDetailSerializer(
            ShipActivityDetail.objects.ordered_by_name(), many=True
        ).data

        lubricant_units = [
            {"id": 1, "name": "Litre", "code": "LTR"},
            {"id": 2, "name": "Kg", "code": "KG"},
            {"id": 3, "name": "Barrel", "code": "BRL"},
            {"id": 4, "name": "Drums", "code": "DRM"},
        ]
        eef_reasons = [
            {"id": 1, "name": "Operational Reason", "code": "OP_REASON"},
            {"id": 2, "name": "EHM/Machinery Trial", "code": "EHM_TRIAL"},
            {"id": 3, "name": "PRT/PST", "code": "PRT_PST"},
            {"id": 4, "name": "Within Limit / SAT", "code": "WITHIN_LIMIT"},
            {"id": 5, "name": "Any other", "code": "OTHER"},
        ]
        ops_statuses = [
            {"id": 1, "name": "Ops", "code": "OPS"},
            {"id": 2, "name": "Non-Ops", "code": "NON_OPS"},
        ]
        sat_statuses = [
            {"id": 1, "name": "SAT", "code": "SAT"},
            {"id": 2, "name": "UNSAT", "code": "UNSAT"},
        ]

        return Response(
            {
                "ship_states": states,
                "ship_locations": locations,
                "activity_types": activity_types,
                "activity_details": activity_details,
                "lubricant_units": lubricant_units,
                "eef_reasons": eef_reasons,
                "ops_statuses": ops_statuses,
                "sat_statuses": sat_statuses,
            },
            status=status.HTTP_200_OK,
        )


# ─────────────────────────────────────────────────────────────
# Granular CRUD ModelViewSets
# ─────────────────────────────────────────────────────────────


@extend_schema(tags=["Srar"])
class ShipStateViewSet(viewsets.ModelViewSet):
    queryset = ShipState.objects.ordered_by_name()
    serializer_class = ShipStateSerializer


@extend_schema(tags=["Srar"])
class ShipLocationViewSet(viewsets.ModelViewSet):
    queryset = ShipLocation.objects.ordered_by_name()
    serializer_class = ShipLocationSerializer


@extend_schema(tags=["Srar"])
class ShipActivityTypeViewSet(viewsets.ModelViewSet):
    queryset = ShipActivityType.objects.ordered_by_name()
    serializer_class = ShipActivityTypeSerializer


@extend_schema(tags=["Srar"])
class ShipActivityDetailViewSet(viewsets.ModelViewSet):
    queryset = ShipActivityDetail.objects.ordered_by_name()
    serializer_class = ShipActivityDetailSerializer


@extend_schema(tags=["Srar"])
class SrarMonthlyHeaderViewSet(viewsets.ModelViewSet):
    queryset = SrarMonthlyHeader.objects.ordered_dashboard()
    serializer_class = SrarMonthlyHeaderSerializer


@extend_schema(tags=["Srar"])
class SrarMonthlyShipActivityViewSet(viewsets.ModelViewSet):
    queryset = SrarMonthlyShipActivity.objects.with_relations()
    serializer_class = SrarMonthlyShipActivitySerializer


@extend_schema(tags=["Srar"])
class SrarMonthlyLubricantViewSet(viewsets.ModelViewSet):
    queryset = SrarMonthlyLubricant.objects.all()
    serializer_class = SrarMonthlyLubricantSerializer


@extend_schema(tags=["Srar"])
class SrarMonthlyBoilerViewSet(viewsets.ModelViewSet):
    queryset = SrarMonthlyBoiler.objects.all()
    serializer_class = SrarMonthlyBoilerSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class SrarBoilerAlkalinitySalinityDetailViewSet(viewsets.ModelViewSet):
    queryset = SrarBoilerAlkalinitySalinityDetail.objects.all()
    serializer_class = SrarBoilerAlkalinitySalinityDetailSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class SrarMonthlyEquipmentViewSet(viewsets.ModelViewSet):
    queryset = SrarMonthlyEquipment.objects.all()
    serializer_class = SrarMonthlyEquipmentSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class SrarEquipmentExploitationViewSet(viewsets.ModelViewSet):
    queryset = SrarEquipmentExploitation.objects.all()
    serializer_class = SrarEquipmentExploitationSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class SrarLinkedEquipmentViewSet(viewsets.ModelViewSet):
    queryset = SrarLinkedEquipment.objects.all()
    serializer_class = SrarLinkedEquipmentSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "srar_equipment__department_id"


@extend_schema(tags=["Srar"])
class FuelConsumptionMonthViewSet(viewsets.ModelViewSet):
    queryset = FuelConsumptionMonth.objects.all()
    serializer_class = FuelConsumptionMonthSerializer


@extend_schema(tags=["Srar"])
class AvcatStatusViewSet(viewsets.ModelViewSet):
    queryset = AvcatStatus.objects.all()
    serializer_class = AvcatStatusSerializer


@extend_schema(tags=["Srar"])
class TorsionMeterViewSet(viewsets.ModelViewSet):
    queryset = TorsionMeter.objects.all()
    serializer_class = TorsionMeterSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class IccpViewSet(viewsets.ModelViewSet):
    queryset = Iccp.objects.all()
    serializer_class = IccpSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class H2SSensorViewSet(viewsets.ModelViewSet):
    queryset = H2SSensor.objects.all()
    serializer_class = H2SSensorSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class STPViewSet(viewsets.ModelViewSet):
    queryset = STP.objects.all()
    serializer_class = STPSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class MagazineFFSystemFloodingSystemViewSet(viewsets.ModelViewSet):
    queryset = MagazineFFSystemFloodingSystem.objects.all()
    serializer_class = MagazineFFSystemFloodingSystemSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class OpsStatusofLubOilandCoolantTestKitsViewSet(viewsets.ModelViewSet):
    queryset = OpsStatusofLubOilandCoolantTestKits.objects.all()
    serializer_class = OpsStatusofLubOilandCoolantTestKitsSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class InjectorFIPCalibrationReplacementViewSet(viewsets.ModelViewSet):
    queryset = InjectorFIPCalibrationReplacement.objects.all()
    serializer_class = InjectorFIPCalibrationReplacementSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class DGUFViewSet(viewsets.ModelViewSet):
    queryset = DGUF.objects.all()
    serializer_class = DGUFSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class DGUFSeaHarbourRunningHourDataInputViewSet(viewsets.ModelViewSet):
    queryset = DGUFSeaHarbourRunningHourDataInput.objects.all()
    serializer_class = DGUFSeaHarbourRunningHourDataInputSerializer


@extend_schema(tags=["Srar"])
class DGUFLimitsViewSet(viewsets.ModelViewSet):
    queryset = DGUFLimits.objects.all()
    serializer_class = DGUFLimitsSerializer


@extend_schema(tags=["Srar"])
class SafetyDeviceCheckTrialViewSet(viewsets.ModelViewSet):
    queryset = SafetyDeviceCheckTrial.objects.all()
    serializer_class = SafetyDeviceCheckTrialSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class FullPowerTrialsMainEngineViewSet(viewsets.ModelViewSet):
    queryset = FullPowerTrialsMainEngine.objects.all()
    serializer_class = FullPowerTrialsMainEngineSerializer


@extend_schema(tags=["Srar"])
class FPTEquipmentWiseViewSet(viewsets.ModelViewSet):
    queryset = FPTEquipmentWise.objects.all()
    serializer_class = FPTEquipmentWiseSerializer


@extend_schema(tags=["Srar"])
class FPTDieselAlternatorsViewSet(viewsets.ModelViewSet):
    queryset = FPTDieselAlternators.objects.all()
    serializer_class = FPTDieselAlternatorsSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class DieselReductionGearExploitationViewSet(viewsets.ModelViewSet):
    queryset = DieselReductionGearExploitation.objects.all()
    serializer_class = DieselReductionGearExploitationSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class ReductionGearExploitationViewSet(viewsets.ModelViewSet):
    queryset = ReductionGearExploitation.objects.all()
    serializer_class = ReductionGearExploitationSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class GasTurbineExploitationViewSet(viewsets.ModelViewSet):
    queryset = GasTurbineExploitation.objects.all()
    serializer_class = GasTurbineExploitationSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class ReplacementOfMajorAssembliesViewSet(viewsets.ModelViewSet):
    queryset = ReplacementOfMajorAssemblies.objects.all()
    serializer_class = ReplacementOfMajorAssembliesSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class AnnualSRMRRoutineUndertakenViewSet(viewsets.ModelViewSet):
    queryset = AnnualSRMRRoutineUndertaken.objects.all()
    serializer_class = AnnualSRMRRoutineUndertakenSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "equipment__department_id"


@extend_schema(tags=["Srar"])
class GasTurbineGeneratorExploitationViewSet(viewsets.ModelViewSet):
    queryset = GasTurbineGeneratorExploitation.objects.all()
    serializer_class = GasTurbineGeneratorExploitationSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class GasTurbineGeneratorExploitationGufEntryViewSet(viewsets.ModelViewSet):
    queryset = GasTurbineGeneratorExploitationGufEntry.objects.all()
    serializer_class = GasTurbineGeneratorExploitationGufEntrySerializer


@extend_schema(tags=["Srar"])
class ReductionGearExploitationofGTGViewSet(viewsets.ModelViewSet):
    queryset = ReductionGearExploitationofGTG.objects.all()
    serializer_class = ReductionGearExploitationofGTGSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class ReplacementOfMajorAssembliesofGTGViewSet(viewsets.ModelViewSet):
    queryset = ReplacementOfMajorAssembliesofGTG.objects.all()
    serializer_class = ReplacementOfMajorAssembliesofGTGSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class AnnualSRMRRoutineUndertakenofGTGViewSet(viewsets.ModelViewSet):
    queryset = AnnualSRMRRoutineUndertakenofGTG.objects.all()
    serializer_class = AnnualSRMRRoutineUndertakenofGTGSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "equipment__department_id"


@extend_schema(tags=["Srar"])
class GTGParametersViewSet(viewsets.ModelViewSet):
    queryset = GTGParameters.objects.all()
    serializer_class = GTGParametersSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "gtg_exploitation__sfd_details__department_id"


@extend_schema(tags=["Srar"])
class GTGrecordOfCleaningServiceTankViewSet(viewsets.ModelViewSet):
    queryset = GTGrecordOfCleaningServiceTank.objects.all()
    serializer_class = GTGrecordOfCleaningServiceTankSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "gtg_exploitation__sfd_details__department_id"


@extend_schema(tags=["Srar"])
class RHExtensionViewSet(viewsets.ModelViewSet):
    queryset = RHExtension.objects.all()
    serializer_class = RHExtensionSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class EEFViewSet(viewsets.ModelViewSet):
    queryset = EEF.objects.all()
    serializer_class = EEFSerializer


@extend_schema(tags=["Srar"])
class EquipmentRoutineDueOnViewSet(viewsets.ModelViewSet):
    queryset = EquipmentRoutineDueOn.objects.all()
    serializer_class = EquipmentRoutineDueOnSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
class SrarAdjustmentViewSet(viewsets.ModelViewSet):
    queryset = SrarAdjustment.objects.all()
    serializer_class = SrarAdjustmentSerializer


@extend_schema(tags=["Srar"])
class SrarCentrifugeViewSet(viewsets.ModelViewSet):
    queryset = SrarCentrifuge.objects.all()
    serializer_class = SrarCentrifugeSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "sfd_details__department_id"


@extend_schema(tags=["Srar"])
@method_decorator(csrf_exempt, name="dispatch")
class SrarEquipmentTypeListViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = SrarEquipmentTypeList.objects.all()
    serializer_class = SrarEquipmentTypeListSerializer


@extend_schema(tags=["Srar"])
@method_decorator(csrf_exempt, name="dispatch")
class SrarEquipmentValidityViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = SrarEquipmentValidity.objects.all()
    serializer_class = SrarEquipmentValiditySerializer

    def update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return super().update(request, *args, **kwargs)


# ─────────────────────────────────────────────────────────────
# CMMS SRAR Integration Views
# ─────────────────────────────────────────────────────────────


@extend_schema(tags=["Srar"])
class SrarCompositeSaveAPIView(APIView):
    """
    Composite API endpoint to save or update an entire monthly SRAR return
    along with all child/tab tables. Enforces one entry per month & year.
    """

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        data = request.data
        header_data = data.get("header", {})

        if not header_data:
            return Response(
                {"error": "Missing 'header' object in request data."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        header_id = header_data.get("id")
        raw_month = header_data.get("srar_month")
        raw_year = header_data.get("srar_year")
        ship_id = header_data.get("ship") or header_data.get("ship_id")

        month = None
        if raw_month is not None:
            if isinstance(raw_month, int):
                month = raw_month
            elif isinstance(raw_month, str):
                m_str = raw_month.strip().lower()
                if m_str.isdigit():
                    month = int(m_str)
                else:
                    month_map = {
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
                    month = month_map.get(m_str)

        year = None
        if raw_year is not None:
            try:
                year = int(raw_year)
            except (ValueError, TypeError):
                year = None

        header_obj = None
        if header_id:
            header_obj = SrarMonthlyHeader.objects.filter(id=header_id).first()

        if not header_obj and month and year:
            filter_kwargs = {"srar_month": month, "srar_year": year}
            if ship_id:
                filter_kwargs["ship_id"] = ship_id
            header_obj = (
                SrarMonthlyHeader.objects.filter(**filter_kwargs)
                .order_by("-id")
                .first()
            )

        header_serializer = SrarMonthlyHeaderSerializer(
            header_obj, data=header_data, partial=True
        )
        if not header_serializer.is_valid():
            return Response(
                {"error": "Invalid header data", "details": header_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        header_obj = header_serializer.save()

        return Response(
            {
                "id": header_obj.id,
                "header_id": header_obj.id,
                "success": True,
                "message": "SRAR report header and child records saved successfully.",
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["Srar"])
class SrarListView(APIView):
    """Return an empty SRAR list or validate incoming SRAR payload."""

    def get(self, request):
        _ = request
        return Response([])

    def post(self, request):
        """Validate a SRAR payload and acknowledge receipt without persistence."""
        serializer = SRARBulkCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        header = serializer.validated_data.get("header")
        exploitations = serializer.validated_data.get("exploitations", [])

        resp_serializer = GenericSuccessResponseSerializer(
            data={
                "success": True,
                "message": "SRAR report payload validated successfully.",
                "data": {
                    "ship_id": header.get("ship_id"),
                    "srar_month": header.get("srar_month"),
                    "srar_year": header.get("srar_year"),
                    "exploitations_received": len(exploitations),
                },
            }
        )
        resp_serializer.is_valid()
        return Response(resp_serializer.data, status=status.HTTP_201_CREATED)


class SrarKpiAnalyticsAPIView(APIView):
    """
    API endpoint returning dynamic KPI statistics for SRAR dashboard.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        _ = request
        return Response(get_dynamic_kpis_data(), status=status.HTTP_200_OK)


class SrarMonthlyTrendAPIView(APIView):
    """
    API endpoint returning dynamic monthly SRAR submission trend bar chart data.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        _ = request
        return Response(get_dynamic_monthly_trend_data(), status=status.HTTP_200_OK)


class SrarYearlyStatusAPIView(APIView):
    """
    API endpoint returning dynamic yearly SRAR application status distribution.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        _ = request
        return Response(get_dynamic_yearly_status_data(), status=status.HTTP_200_OK)


class SrarExploitationKpiAPIView(APIView):
    """
    Ship-life exploitation KPIs: hours underway and distance run since commissioning,
    plus days at sea and days at harbour derived from SRAR form 8.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        _ = request
        return Response(get_dynamic_exploitation_kpis(), status=status.HTTP_200_OK)


class SrarFuelTrendAPIView(APIView):
    """
    Monthly fuel consumption split by harbour / anchorage / at sea, for a line chart.
    Optional `?year=` query param scopes the chart to one year (the dashboard's
    year filter/drill-down) instead of the most recent 24 returns across all years.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        year = request.GET.get("year")
        year = int(year) if year and year.isdigit() else None
        return Response(
            get_dynamic_fuel_trend_data(year=year), status=status.HTTP_200_OK
        )


class SrarDgufChartAPIView(APIView):
    """
    Per-diesel-alternator running hours split sea/anchorage vs port, for a stacked bar.
    Optional `?year=` query param scopes to one year (the dashboard's year filter).
    """

    permission_classes = [AllowAny]

    def get(self, request):
        year = request.GET.get("year")
        year = int(year) if year and year.isdigit() else None
        return Response(
            get_dynamic_dguf_chart_data(year=year), status=status.HTTP_200_OK
        )


class SrarDashboardSummaryAPIView(APIView):
    """
    Combined API endpoint returning all dashboard analytics in a single JSON payload.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        _ = request
        kpis = get_dynamic_kpis_data()
        trend = get_dynamic_monthly_trend_data()
        yearly = get_dynamic_yearly_status_data()

        payload = {
            "kpis": kpis,
            "monthly_trend": trend,
            "yearly_status": yearly,
            "exploitation": get_dynamic_exploitation_kpis(),
            "fuel_trend": get_dynamic_fuel_trend_data(),
            "dguf": get_dynamic_dguf_chart_data(),
        }
        return Response(payload, status=status.HTTP_200_OK)


@extend_schema(tags=["Srar"])
@method_decorator(csrf_exempt, name="dispatch")
class SrarMasterEquipmentOnlyListAPIView(APIView):
    """
    Returns ONLY records from table srar_masterequipment (SrarMasterEquipment model).
    Used specifically for populating the Add SRAR Equipment dropdowns with exact 28 CMMS master equipment items.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        data = []
        try:
            qs = SrarMasterEquipment.objects.all().order_by("equipment_type_id")
            for m in qs:
                name_val = m.equipment_desc or f"Equipment {m.equipment_type_id}"
                data.append(
                    {
                        "id": str(m.equipment_type_id),
                        "equipment_type_id": str(m.equipment_type_id),
                        "equipment_desc": m.equipment_desc,
                        "equipment_category_code": m.equipment_category_code,
                        "nomenclature": name_val,
                        "name": name_val,
                        "srar_type": m.equipment_desc,
                        "status": m.status,
                        "universal_id_ch_master_equipment_type": m.universal_id_ch_master_equipment_type,
                    }
                )
        except Exception as exc:
            logger.error(f"Failed to fetch SrarMasterEquipment: {exc}")

        return Response(data, status=status.HTTP_200_OK)


class ChMasterFullPowerConductedByListAPIView(APIView):
    """
    Powers the 'Conducted By'/'Trial Conducted By' dropdowns across the SRAR forms.
    Auto-syncs from CMMS `Ch_Master_Full_Power_Conducted_By` whenever the local
    mirror is empty or CMMS is reachable, then always serves from local Postgres
    so the dropdown still works if CMMS is briefly unavailable.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        _sync_full_power_conducted_by()
        qs = ChMasterFullPowerConductedBy.objects.filter(active=1).order_by(
            "full_power_conducted_by"
        )
        data = [
            {
                "id": row.full_power_conducted_by_id,
                "label": row.full_power_conducted_by,
                "value": row.full_power_conducted_by,
            }
            for row in qs
            if row.full_power_conducted_by
        ]
        return Response(data, status=status.HTTP_200_OK)


def _sync_full_power_conducted_by():
    from sfd.utils import get_mssql_connection

    try:
        conn = get_mssql_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM Ch_Master_Full_Power_Conducted_By")
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
    except Exception as exc:
        logger.error(f"CMMS sync failed for Ch_Master_Full_Power_Conducted_By: {exc}")
        return

    with transaction.atomic():
        for item in rows:
            row_id = str(item.get("Full_Power_Conducted_By_ID") or "").strip()
            if not row_id:
                continue
            ChMasterFullPowerConductedBy.objects.update_or_create(
                full_power_conducted_by_id=row_id,
                defaults={
                    "full_power_conducted_by": item.get("Full_Power_Conducted_By"),
                    "cmms_status": str(item.get("Status") or ""),
                    "universal_id": item.get(
                        "Universal_ID_Ch_Master_Full_Power_Conducted_By"
                    ),
                    "active": 1
                    if str(item.get("Status") or "1") in ("1", "True", "true")
                    else 2,
                },
            )


class CmmsLubricantListAPIView(APIView):
    """
    Powers the Lubricant name/unit picker in the SRAR Lubricant Consumption tab.
    Auto-syncs from CMMS `M_Lubricant` whenever reachable, then serves from the
    local mirror so the dropdown still works if CMMS is briefly unavailable.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        _sync_cmms_lubricants()
        qs = CmmsLubricant.objects.filter(active=1, cmms_active=True).order_by(
            "lubricant_name"
        )
        data = [
            {
                "id": row.lubricant_id,
                "label": row.lubricant_name,
                "value": row.lubricant_id,
                "name": row.lubricant_name,
                # Normalised to the unit master the tab's dropdown is built from, so the
                # unit the picker fills in is one that dropdown can actually display.
                # `unit_raw` keeps whatever CMMS holds, for anything that needs it.
                "unit": normalize_lubricant_unit(row.unit),
                "unit_raw": row.unit,
                "type": row.lubricant_type,
            }
            for row in qs
            if row.lubricant_name
        ]
        return Response(data, status=status.HTTP_200_OK)


def _sync_cmms_lubricants():
    from sfd.utils import get_mssql_connection

    try:
        conn = get_mssql_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM M_Lubricant")
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
    except Exception as exc:
        logger.error(f"CMMS sync failed for M_Lubricant: {exc}")
        return

    with transaction.atomic():
        for item in rows:
            row_id = str(item.get("LubricantID") or "").strip()
            if not row_id:
                continue
            CmmsLubricant.objects.update_or_create(
                lubricant_id=row_id,
                defaults={
                    "lubricant_name": item.get("LubricantName"),
                    "lubricant_type": item.get("LubricantType"),
                    "lubricant_code": item.get("LubricantCode"),
                    "unit": item.get("Unit"),
                    "cmms_active": bool(item.get("Active")),
                    "universal_id": item.get("Universal_ID_M_Lubricant"),
                },
            )


class SrarEefDesignedValueAPIView(APIView):
    """
    Returns the "Designed EEF" value for this ship's class from CMMS
    `M_ShipClassEEF`, which is also the DGUF limiting value the Tab 8 table shows.

    The class is resolved from the deployment's own ship (`get_this_ship()` ->
    `Ship.class_master`), the same way every other CMMS integration point resolves it.
    It used to be pinned to ClassID 49 with a TODO saying no ship context existed —
    it does now, and the constant happened to be right only for L18, so any other hull
    was shown another class's figure.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        from sfd.utils import get_mssql_connection

        ship = get_this_ship()
        class_id = getattr(ship, "class_master_id", None) if ship else None

        if not class_id:
            # Better an empty field than another class's limit: the operator can see
            # nothing came back, where a wrong number reads as authoritative.
            logger.warning(
                "No ship class resolved (ship=%s) — EEF/DGUF limiting value unavailable.",
                getattr(ship, "code", None),
            )
            return Response(
                {"designed_eef": None, "class_id": None},
                status=status.HTTP_200_OK,
            )

        try:
            conn = get_mssql_connection()
            cursor = conn.cursor()
            cursor.execute(
                "SELECT TOP 1 EEFValue FROM M_ShipClassEEF "
                "WHERE ClassId = ? AND Active = 1 ORDER BY EEFID DESC",
                (class_id,),
            )
            row = cursor.fetchone()
            designed_eef = float(row[0]) if row and row[0] is not None else None
        except Exception as exc:
            logger.error(f"CMMS lookup failed for M_ShipClassEEF: {exc}")
            designed_eef = None

        return Response(
            {"designed_eef": designed_eef, "class_id": class_id},
            status=status.HTTP_200_OK,
        )


class SrarDgufCommentsAPIView(APIView):
    """The DGUF comment master from CMMS `DgufComment`.

    Feeds the Tab 8 "Shore Supply Remarks" picker, which was a free-text box — so the
    reason a DG was run in harbour was typed differently on every return and matched
    nothing CMMS could group by. The same list already existed hardcoded in the
    frontend as `dgufHarbourReasonOptions`; this serves the live table instead, so a
    comment added in CMMS shows up without a frontend release.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        _ = request
        from sfd.utils import get_mssql_connection

        try:
            conn = get_mssql_connection()
            cursor = conn.cursor()
            # SELECT * rather than a column list: this table's shape varies between
            # CMMS deployments and one unknown column name fails the whole statement.
            cursor.execute("SELECT * FROM DgufComment")
            columns = [col[0] for col in cursor.description]
            rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
        except Exception as exc:
            logger.error(f"CMMS lookup failed for DgufComment: {exc}")
            return Response([], status=status.HTTP_200_OK)

        data = [
            {
                "id": row.get("DGUFID"),
                "label": str(row.get("DgufComment") or "").strip(),
                "value": str(row.get("DgufComment") or "").strip(),
            }
            for row in rows
            if str(row.get("DgufComment") or "").strip()
            and row.get("Status") in (1, True, None)
        ]
        return Response(data, status=status.HTTP_200_OK)
