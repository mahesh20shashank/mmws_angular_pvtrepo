import csv
import io
import json
import logging
import os
import re
from datetime import date, datetime, timedelta
from io import BytesIO

from accounts import rbac
from accounts.models import CustomUserProfile
from dateutil.relativedelta import relativedelta
from django.apps import apps
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, Max, Min, Q
from django.http import HttpResponse
from django.utils import timezone
from django.utils.timezone import now
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    OpenApiResponse,
    OpenApiTypes,
    extend_schema,
)
from ems.models import EquipmentName
from ilms.models import DartMOSpare, Item, ItemExtra, MoMappingTable, Vendor
from master.models import (
    ChMasterShipRemarksBy,
    ChMasterSymptoms,
    Department,
    MDelay,
    MDiagnostic,
    MReason,
    MRepair,
    MRepairAgency,
    MRequiredAssistance,
    MSeverity,
    OpsMaintenancePeriod,
    RefitMaintenancePeriod,
    Section,
    SubDepartment,
)
from master.utils import get_ship_status, get_this_ship
from obs.models import (
    Demand,
    Denomination,
    EquipmentClass,
    Issue,
    SpareClass,
    Spares,
    SparesMapping,
    Survey,
)
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from rest_framework import generics, status, views, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication
from sfd.models import Equipment, ShipEquipment, TrialUnit
from swmm.cache_utils import make_cache_key
from wlms.models import DartWedSpare, SpareDataMap, WLMSSpare

from . import swagger
from .filters import (
    ClosedDartsReportFilter,
    DartsReportFilter,
    GuaranteeMonitoringReportFilter,
    RaStatusReportFilter,
    ServiceRequiredReportFilter,
    SparesConsumedReportFilter,
)
from .models import (
    CertificateTypeMaster,
    CompleteDefectDart,
    DartSpare,
    DartSpareUsed,
    InitiateDart,
    InitiateRADL,
    MultiDartDraft,
    RADLMaster,
    RepairAgencyMaster,
    ServiceMaster,
    ShipRemarksMaster,
)
from .report_registry import apply_filterset, get_report_definition
from .serializers import (
    AddDartMetadataSerializer,
    AssistanceMasterListSerializer,
    CertificateTypeMasterListSerializer,
    ClosedDartsReportSerializer,
    CompleteDartListSerializer,
    CompleteDefectGETDetailSerializer,
    CompleteDefectGETResponseSerializer,
    CompleteDefectPOSTResponseSerializer,
    CompleteDefectSerializer,
    CreateDLFunResponseSerializer,
    CreateDLFunSerializer,
    CreateDLRefitItemSerializer,
    CreateRADLDefectDataSerializer,
    CreateRADLFunResponseSerializer,
    CreateRADLFunSerializer,
    DartDashboardSerializer,
    DartHistoryDefaultDataResponseSerializer,
    DartsReportSerializer,
    DeleteDLRowSerializer,
    ExportPendingDefectsACCDBResponseSerializer,
    ExportPendingDefectsACCDBSerializer,
    ExportPendingDefectsDL2ResponseSerializer,
    ExportPendingDefectsDL2Serializer,
    GeneratedDLIIReportSerializer,
    GenericSuccessResponseSerializer,
    GetDartDetailsResponseSerializer,
    GetDartSparesDataResponseSerializer,
    GetEquipmentObjectsResponseSerializer,
    GetNomenclatureDetailsResponseSerializer,
    GuaranteeMonitoringReportSerializer,
    InitiateDartSerializer,
    IssuedSpareSerializer,
    MaintenancePeriodItemSerializer,
    PendingDefectSerializer,
    PendingDefectsResponseSerializer,
    RaStatusReportSerializer,
    ReasonMasterListSerializer,
    RefitOccasionCreateSerializer,
    RefitOccasionEditSerializer,
    RefitOperationalOccasionResponseSerializer,
    RepairAgencyMasterListSerializer,
    SaveDLRowsResponseSerializer,
    SaveDLRowsSerializer,
    ServiceMasterListSerializer,
    ServiceRequiredReportSerializer,
    SeverityMasterListSerializer,
    ShipRemarksMasterListSerializer,
    SparesConsumedReportSerializer,
)
from .services import (
    DartDashboardService,
    build_dart_history_row,
    build_pending_defect_export_rows,
    build_simple_pdf,
    generate_export_file,
    get_closed_dart_history_queryset,
)
from .utils import generate_dart_number, generate_dl_number

logger = logging.getLogger(__name__)

DATE_FORMAT = "%d %b %Y"


def build_csv_response(filename, headers, rows):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    writer = csv.writer(response)
    writer.writerow(headers)
    writer.writerows(rows)
    return response


def build_xlsx_response(filename, headers, rows):
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "DART"
    worksheet.append(headers)
    for row in rows:
        worksheet.append(row)
    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    response = HttpResponse(
        buffer.read(),
        content_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def build_accdb_response(filename, headers, rows):
    export_dir = os.path.join(settings.MEDIA_ROOT, "exports")
    os.makedirs(export_dir, exist_ok=True)
    filepath = os.path.join(export_dir, filename)
    generate_export_file(filepath, headers, rows, export_format="accdb", title=filename)
    with open(filepath, "rb") as f:
        content = f.read()
    response = HttpResponse(content, content_type="application/msaccess")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def _dart_privileged(user):
    """Department privilege for DART surfaces specifically: the usual
    ship-wide roles, plus the Engineering HOD, who coordinates DARTs across
    departments. Deliberately DART-local -- does not widen
    rbac.can_see_all_departments, which other apps (e.g. ilms) also rely on
    for their own, narrower department scoping."""
    return rbac.can_see_all_departments(user) or rbac.is_dart_coordinator(user)


def resolve_user_department(request, explicit_department_id=None):
    """Resolve department using the same priority as the legacy DART flow.

    An `explicit_department_id` (e.g. picked from a create payload) is only
    honored for privileged users (administrators/superusers, or the
    Engineering HOD coordinating DARTs) - a non-privileged user always gets
    their own department, regardless of what they pass, so they can't
    assign/view records under a department they don't belong to.
    """
    user = getattr(request, "user", None)
    own_department = rbac.department_of(user)

    if _dart_privileged(user):
        if explicit_department_id and str(explicit_department_id).lower() != "all":
            if str(explicit_department_id).isdigit():
                explicit = Department.objects.filter(id=explicit_department_id).first()
            else:
                explicit = Department.objects.filter(
                    name__iexact=explicit_department_id
                ).first()
            if explicit:
                return explicit
        return None

    return own_department


# Config related views
##############################################################################
@swagger.REPAIRAGENCYMASTERLISTAPIVIEW_SCHEMA
class RepairAgencyMasterListAPIView(generics.ListAPIView):
    queryset = RepairAgencyMaster.objects.all().order_by("repair_agency_name")
    serializer_class = RepairAgencyMasterListSerializer


@swagger.ASSISTANCEMASTERLISTAPIVIEW_SCHEMA
class AssistanceMasterListAPIView(generics.ListAPIView):
    queryset = MRequiredAssistance.objects.filter(active=True).order_by(
        "required_assistance_id"
    )
    serializer_class = AssistanceMasterListSerializer


@swagger.REASONMASTERLISTAPIVIEW_SCHEMA
class ReasonMasterListAPIView(generics.ListAPIView):
    queryset = MReason.objects.filter(active=True).order_by("reason_code")
    serializer_class = ReasonMasterListSerializer


@swagger.SEVERITYMASTERLISTAPIVIEW_SCHEMA
class SeverityMasterListAPIView(generics.ListAPIView):
    queryset = MSeverity.objects.filter(active=True).order_by("severity_code")
    serializer_class = SeverityMasterListSerializer


@swagger.SERVICESMASTERLISTAPIVIEW_SCHEMA
class ServicesMasterListAPIView(generics.ListAPIView):
    queryset = ServiceMaster.objects.filter(active=1).order_by("service")
    serializer_class = ServiceMasterListSerializer


@swagger.CERTIFICATETYPEMASTERLISTAPIVIEW_SCHEMA
class CertificateTypeMasterListAPIView(generics.ListAPIView):
    queryset = CertificateTypeMaster.objects.filter(active=1).order_by("certificate")
    serializer_class = CertificateTypeMasterListSerializer


@swagger.SHIPREMARKSMASTERLISTAPIVIEW_SCHEMA
class ShipRemarksMasterListAPIView(generics.ListAPIView):
    queryset = ShipRemarksMaster.objects.filter(active=1).order_by("description")
    serializer_class = ShipRemarksMasterListSerializer


#####################################################################################
# Reports related views


class DartDepartmentScopedFilterBackend(rbac.DepartmentScopedFilterBackend):
    """Same department scoping as rbac.DepartmentScopedFilterBackend, plus
    the Engineering HOD's cross-department DART coordination carve-out. Kept
    as a DART-local subclass rather than changing the shared backend, since
    other apps reuse rbac.DepartmentScopedFilterBackend unscoped."""

    def filter_queryset(self, request, queryset, view):
        if rbac.is_dart_coordinator(request.user):
            return queryset
        return super().filter_queryset(request, queryset, view)


@swagger.DARTS_REPORT_API_SCHEMA
class DartsReportAPIView(generics.ListAPIView):
    """API view for DARTs Report in Operational Maintenance."""

    serializer_class = DartsReportSerializer
    filter_backends = [DjangoFilterBackend, DartDepartmentScopedFilterBackend]
    filterset_class = DartsReportFilter
    department_scope_field = "department_id"

    def get_queryset(self):
        report_def = get_report_definition("darts-report")
        if report_def:
            return report_def.get_queryset()
        return InitiateDart.objects.all().order_by("-pk")


@swagger.CLOSED_DARTS_REPORT_API_SCHEMA
class ClosedDartsReportAPIView(generics.ListAPIView):
    """API view for Closed DARTs Report."""

    serializer_class = ClosedDartsReportSerializer
    filter_backends = [DjangoFilterBackend, DartDepartmentScopedFilterBackend]
    filterset_class = ClosedDartsReportFilter
    department_scope_field = "department_id"

    def get_queryset(self):
        report_def = get_report_definition("closed-darts-report")
        if report_def:
            return report_def.get_queryset()
        from django.db.models import Q

        return InitiateDart.objects.filter(
            Q(is_closed=True) | Q(status__iexact="CLOSED")
        ).order_by("-pk")


@swagger.SERVICE_REQUIRED_REPORT_API_SCHEMA
class ServiceRequiredReportAPIView(generics.ListAPIView):
    """API view for Service Required Report."""

    serializer_class = ServiceRequiredReportSerializer
    filter_backends = [DjangoFilterBackend, DartDepartmentScopedFilterBackend]
    filterset_class = ServiceRequiredReportFilter
    department_scope_field = "department_id"

    def get_queryset(self):
        report_def = get_report_definition("service-required-report")
        if report_def:
            return report_def.get_queryset()
        return InitiateDart.objects.all().order_by("-pk")


@swagger.GUARANTEE_MONITORING_REPORT_API_SCHEMA
class GuaranteeMonitoringReportAPIView(generics.ListAPIView):
    """API view for Guarantee Monitoring Report."""

    serializer_class = GuaranteeMonitoringReportSerializer
    filter_backends = [DjangoFilterBackend, DartDepartmentScopedFilterBackend]
    filterset_class = GuaranteeMonitoringReportFilter
    department_scope_field = "department_id"

    def get_queryset(self):
        report_def = get_report_definition("guarantee-monitoring-report")
        if report_def:
            return report_def.get_queryset()
        return InitiateDart.objects.all().order_by("-pk")


@swagger.SPARES_CONSUMED_REPORT_API_SCHEMA
class SparesConsumedReportAPIView(generics.ListAPIView):
    """API view for Spares Consumed Report."""

    serializer_class = SparesConsumedReportSerializer
    filter_backends = [DjangoFilterBackend, DartDepartmentScopedFilterBackend]
    filterset_class = SparesConsumedReportFilter
    department_scope_field = "complete_dart__dart_details__department_id"

    def get_queryset(self):
        report_def = get_report_definition("spares-consumed-report")
        if report_def:
            return report_def.get_queryset()
        return InitiateDart.objects.all().order_by("-pk")


@swagger.RA_STATUS_REPORT_API_SCHEMA
class RaStatusReportAPIView(generics.ListAPIView):
    """API view for RA Status Report."""

    serializer_class = RaStatusReportSerializer
    filter_backends = [DjangoFilterBackend, DartDepartmentScopedFilterBackend]
    filterset_class = RaStatusReportFilter
    department_scope_field = "initiate_dart__department_id"

    def get_queryset(self):
        report_def = get_report_definition("ra-status")
        if report_def:
            return report_def.get_queryset()
        return InitiateDart.objects.all().order_by("-pk")


@swagger.OPM_REPORT_FILTER_OPTIONS_SCHEMA
class OPMReportFilterOptionsAPIView(views.APIView):
    """Return filter options for DART reports."""

    def get(self, request, *args, **kwargs):
        return Response(
            {
                "status_options": ["OPEN", "IN_PROGRESS", "RECTIFIED", "CLOSED"],
                "date_filter_options": [
                    "last_30_days",
                    "last_90_days",
                    "this_year",
                    "last_year",
                ],
                "severity_options": ["CRITICAL", "MAJOR", "MINOR"],
            }
        )


@swagger.OPM_REPORT_EXPORT_SCHEMA
class OPMReportExportAPIView(views.APIView):
    """Export report to CSV format based on report_key."""

    def post(self, request, report_key, *args, **kwargs):
        report_def = get_report_definition(report_key)
        if not report_def:
            return Response(
                {"detail": f"Report '{report_key}' not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        queryset = apply_filterset(report_def, request.query_params or request.data)
        if not rbac.is_dart_coordinator(request.user):
            queryset = rbac.scope_queryset_to_department(
                queryset, request, field="department_id"
            )
        serializer = report_def.serializer_class(queryset, many=True)
        data = serializer.data

        output = io.StringIO()
        if data:
            writer = csv.DictWriter(output, fieldnames=list(data[0].keys()))
            writer.writeheader()
            writer.writerows(data)

        response = HttpResponse(output.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{report_key}.csv"'
        return response


@swagger.OPM_REPORT_EXPORT_JOB_STATUS_SCHEMA
class OPMReportExportJobStatusAPIView(views.APIView):
    """Status check for report export job."""

    def get(self, request, job_id, *args, **kwargs):
        return Response({"job_id": str(job_id), "status": "COMPLETED", "progress": 100})


@swagger.OPM_REPORT_EXPORT_JOB_DOWNLOAD_SCHEMA
class OPMReportExportJobDownloadAPIView(views.APIView):
    """Download export job result file."""

    def get(self, request, job_id, *args, **kwargs):
        return Response({"job_id": str(job_id), "download_url": ""})


@swagger.DEFECTDASHBOARDAPIVIEW_SCHEMA
class DartDashboardViewSet(viewsets.ViewSet):
    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="period",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=False,
                description="ALL, 6M, 1Y or 2Y",
                enum=["ALL", "6M", "1Y", "2Y"],
            ),
            OpenApiParameter(
                name="department",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=False,
            ),
            OpenApiParameter(
                name="activity_period",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=False,
                description="today, week, month, quarter or year",
                enum=[
                    "today",
                    "week",
                    "month",
                    "quarter",
                    "year",
                ],
            ),
        ],
        responses={200: DartDashboardSerializer},
    )
    def list(self, request):
        period = request.query_params.get(
            "period",
            "ALL",
        )

        own_department = rbac.department_of(request.user)
        if _dart_privileged(request.user):
            department = request.query_params.get("department")
        else:
            department = own_department.name if own_department else None

        activity_period = request.query_params.get(
            "activity_period",
            "month",
        )

        valid_periods = {
            "ALL",
            "6M",
            "1Y",
            "2Y",
        }

        if period.upper() not in valid_periods:
            return Response(
                {
                    "status": False,
                    "message": ("Invalid period. Use ALL, 6M, 1Y or 2Y."),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        valid_activity_periods = {
            "today",
            "week",
            "month",
            "quarter",
            "year",
        }

        if activity_period.lower() not in valid_activity_periods:
            return Response(
                {
                    "status": False,
                    "message": (
                        "Invalid activity_period. "
                        "Use today, week, month, quarter or year."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = DartDashboardService.get_dashboard(
            period=period.upper(),
            department=department,
            activity_period=activity_period.lower(),
        )

        serializer = DartDashboardSerializer(data)

        return Response(
            {
                "status": True,
                "message": "DART dashboard data fetched successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


##################################
# Dart Form


@extend_schema(tags=["DART"])
class AddDartMetadataAPIView(APIView):
    """
    GET  → Returns all the form options, dropdown choices, and next generated serial number
           needed to render the "Add DART" form.
    """

    serializer_class = AddDartMetadataSerializer

    @extend_schema(
        responses={200: AddDartMetadataSerializer},
    )
    def get(self, request, *args, **kwargs):
        department = getattr(request.user, "department", None)
        if not department and hasattr(request.user, "CustomUser_profile"):
            department = getattr(request.user.CustomUser_profile, "department", None)
        if not department:
            department = Department.objects.first()

        # ── 1. ec_code (ShipEquipment) deduplicated by Master Equipment ──
        raw_shipeq = (
            ShipEquipment.objects.select_related("equipment", "sub_department_f_key")
            .all()
            .order_by("nomenclature")
        )
        seen_eq_ids = set()
        ec_code = []
        for se in raw_shipeq:
            eq_key = se.equipment_id if se.equipment_id else f"se_{se.id}"
            if eq_key not in seen_eq_ids:
                seen_eq_ids.add(eq_key)
                ec_code.append(se)

        # ── 2. Dynamic Models (Spares, SpareClass, EquipmentClass) ──
        spare_data = []
        oem_pil_spares_data = []
        try:
            spare_classes_qs = (
                SpareClass.objects.filter(department_id=department)
                if department
                else SpareClass.objects.all()
            )
            spare_classes = [e.id for e in spare_classes_qs]
            equipment_classes = [
                e.id
                for e in EquipmentClass.objects.filter(spare_class_id__in=spare_classes)
            ]
            spare_obj = (
                Spares.objects.filter(equipment_class_id__in=equipment_classes)
                .exclude(
                    Q(authority__name="MO ITEM")
                    | Q(authority__name="B & D")
                    | Q(authority__name="MO ALLOWANCE")
                )
                .order_by("description")
            )
            spare_data = [
                {
                    "id": s.id,
                    "name": s.description or "",
                    "part_number": s.pattern_number or "",
                }
                for s in spare_obj
            ]

            oem_pil_spares = Spares.objects.filter(
                authority__name="PIL", equipment_class__name="SPARES PIL"
            ).order_by("description")
            oem_pil_spares_data = [
                {"id": s.id, "name": s.description or ""} for s in oem_pil_spares
            ]
        except Exception as e:
            print("Error loading spares metadata:", str(e))

        # ── 3. ilms_objs sorted ASC ──
        ilms_data = [
            {
                "item_code": i.item_code,
                "item_desc": i.item_desc or "",
                "pk": i.pk,
            }
            for i in ItemExtra.objects.all().order_by("item_desc", "item_code")
        ]

        # ── 4. denominations sorted ASC ──
        denominations_data = []
        try:
            Denomination = apps.get_model("master", "Denomination")
            denominations_data = [
                {"id": d.id, "name": getattr(d, "name", str(d))}
                for d in Denomination.objects.filter(department_id=department).order_by(
                    "name"
                )
            ]
        except Exception:
            pass

        # ── 5. Serial Generation ──
        dept_name = department.name or "X"
        new_serial = generate_dart_number(dept_name, "Defect")

        # Determine last_serial (highest existing number) for response
        prefix = new_serial.rsplit("-", 1)[0] + "-"
        dart_list = InitiateDart.objects.filter(dart_number__startswith=prefix)
        last_entry = None
        if dart_list.exists():
            max_val = -1
            for entry in dart_list:
                dn = entry.dart_number
                if dn:
                    match = re.search(r"\d+$", dn)
                    if match:
                        val = int(match.group())
                        if val > max_val:
                            max_val = val
                            last_entry = entry
            if last_entry is None:
                last_entry = dart_list.order_by("-id").first()

        last_serial = last_entry.dart_number if last_entry else None

        # ── 6. Master Lists sorted ASC ──
        symptom_list = ChMasterSymptoms.objects.order_by("symptom_code").distinct(
            "symptom_code"
        )
        severity_list = MSeverity.objects.filter(active=1).order_by(
            "severity_name", "id"
        )
        remark_list = (
            ChMasterShipRemarksBy.objects.all().distinct().order_by("description")
        )
        assistance_list = MRequiredAssistance.objects.order_by(
            "required_assistance_for"
        ).distinct("required_assistance_for")

        # ── 7. Trial Agencies sorted ASC ──
        trial_agency = [
            {"id": str(tu.id), "name": tu.name}
            for tu in TrialUnit.objects.filter(status=1).order_by("name")
        ]

        db_occ = RefitMaintenancePeriod.objects.exclude(maintenance_period__isnull=True)
        m_types = sorted(
            list(db_occ.values_list("maintenance_period", flat=True).distinct())
        )
        m_occasions = {
            t: sorted(
                list(
                    db_occ.filter(maintenance_period=t)
                    .values_list("occasion", flat=True)
                    .exclude(occasion__isnull=True)
                    .distinct()
                )
            )
            for t in m_types
        }

        # ── Serialize with DRF Serializers ──
        context_data = {
            "ec_code": ec_code,
            "spare_obj": spare_data,
            "last_serial": last_serial,
            "new_serial": new_serial,
            "ilms_objs": ilms_data,
            "refit_period": RefitMaintenancePeriod.objects.filter(
                maintenance_period="REFIT"
            ).order_by("occasion", "id"),
            "ops_period": RefitMaintenancePeriod.objects.filter(
                maintenance_period="OPERATIONAL"
            ).order_by("occasion", "id"),
            "symptom_list": symptom_list,
            "severity_list": severity_list,
            "remark_list": remark_list,
            "assistance_list": assistance_list,
            "oem_pil_spares": oem_pil_spares_data,
            "denominations": denominations_data,
            "trial_agency": trial_agency,
            "maitainance_period_types": m_types,
            "maitianance_period_occasions": m_occasions,
        }

        serializer = AddDartMetadataSerializer(context_data)
        return Response(serializer.data, status=status.HTTP_200_OK)


@extend_schema(tags=["DART"])
class InitiateDartAPIView(APIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    @extend_schema(
        request=InitiateDartSerializer,
        responses={
            201: OpenApiResponse(
                description="Dart initiated successfully",
                examples=[
                    OpenApiExample(
                        "Success Response",
                        value={
                            "message": "Dart initiated successfully",
                            "dart_id": 1,
                            "dart_number": "DART-ENGINEERING-0001",
                        },
                    )
                ],
            ),
            400: OpenApiResponse(description="Bad Request"),
        },
        description=("Initiate a new DART."),
    )
    def post(self, request, *args, **kwargs):
        serializer = InitiateDartSerializer(data=request.data)
        if not serializer.is_valid():
            errors = serializer.errors
            msg = "Validation failed"
            if errors:
                first_field = next(iter(errors))
                first_err = errors[first_field]
                if isinstance(first_err, list):
                    msg = f"{first_field}: {first_err[0]}"
                else:
                    msg = f"{first_field}: {first_err}"
            return Response(
                {"status": "error", "message": msg, "errors": errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        val_data = serializer.validated_data

        # Date Validation: closing/resolution date cannot be earlier than creation/defect date
        dart_type = val_data.get("dart_type")
        defect_date = None
        resolution_date = None

        if dart_type == "Guarantee Defect":
            defect_date = val_data.get("g_defectDate")
            resolution_date = val_data.get("g_completionDate")
        else:
            defect_date = val_data.get("defectDate")
            resolution_date = val_data.get("scheduledDate")

        if defect_date and resolution_date and resolution_date < defect_date:
            return Response(
                {
                    "status": "error",
                    "message": "DART Closing Date cannot be earlier than the DART Creation Date",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                # 1. BASIC EQUIPMENT
                dart_type = val_data.get("dart_type")

                nom_id = None
                if dart_type == "Guarantee Defect":
                    nom_id = val_data.get("g_nomenclature")
                elif dart_type in ["ASR", "ABER"]:
                    nom_id = val_data.get("a_nomenclature")
                else:
                    nom_id = val_data.get("nomenclature")

                equipment_obj = None
                if nom_id and str(nom_id).isdigit():
                    equipment_obj = ShipEquipment.objects.filter(id=nom_id).first()

                photograph = val_data.get("attachPhotograph")

                # 2. COMMON DATA (dropdown IDs)
                symptom_id = val_data.get("symptoms")
                severity_id = val_data.get("severity")
                remark_id = val_data.get("ssRemarks")
                require_assistance_id = val_data.get("requiredAssistance")
                maintenance_period = val_data.get("maintenance_period")
                dart_occasion = val_data.get("dart_occasion")
                universal_id_t_dart = val_data.get("universal_id_t_dart")

                # 3. DEPARTMENT RESOLUTION
                department = resolve_user_department(
                    request,
                    explicit_department_id=val_data.get("department_id"),
                )
                if not department:
                    department = Department.objects.first()
                # 4. DART NUMBER GENERATION
                dept_name = department.name if department else "X"
                new_serial = generate_dart_number(dept_name, "Defect")

                # EquipmentName (EMS) lookup
                equipment_name_obj = None
                if equipment_obj:
                    equipment_name_obj = EquipmentName.objects.filter(
                        sfd_equipment=equipment_obj
                    ).first()

                # Guarantee-specific fields
                g_repairs = val_data.get("g_repairs")
                g_repair_date = val_data.get("g_repairDate")
                g_place = val_data.get("g_place")
                if g_repairs == "0":
                    g_repair_date = None
                    g_place = None

                dart_sr_no = new_serial.split("-")[-1] if new_serial else None

                defect_desc = val_data.get("defect_description") or val_data.get("dig")
                g_defect_desc = (
                    val_data.get("g_defect_description")
                    or val_data.get("g_dig")
                    or defect_desc
                )
                trial_agency_val = val_data.get("trial_agency") or val_data.get(
                    "UniversalIDMOSTList"
                )

                rha_val = (
                    val_data.get("rha")
                    or val_data.get("rha_defect")
                    or val_data.get("rhaDefect")
                    or val_data.get("rha_for_defect")
                )

                # 5. CREATE DART (conditional on dart_type)
                if dart_type == "Guarantee Defect":
                    g_comp_date = (
                        val_data.get("g_completionDate")
                        or g_repair_date
                        or val_data.get("g_repairDate")
                        or val_data.get("scheduledDate")
                    )
                    g_rep_date = (
                        g_repair_date
                        or val_data.get("g_repairDate")
                        or val_data.get("g_completionDate")
                    )
                    dart = InitiateDart.objects.create(
                        department_id=department,
                        equipment_ship=equipment_obj,
                        equipment_ems=equipment_name_obj,
                        dart_number=new_serial,
                        dart_sr_number=dart_sr_no,
                        universal_id_t_dart=universal_id_t_dart,
                        dart_date=val_data.get("g_defectDate"),
                        rectification_date=g_comp_date or g_rep_date,
                        defective_discriptions=g_defect_desc,
                        maintenance_period=maintenance_period,
                        dart_occasion=dart_occasion,
                        is_ra_initiate=False,
                        is_guarantee_defect=True,
                        guarantee_cause=val_data.get("g_cause"),
                        guarantee_op_availability=(
                            val_data.get("opAvailability") == "YES"
                        ),
                        guarantee_hot_work=(val_data.get("hotWork") == "YES"),
                        guarantee_repairs=g_repairs or None,
                        guarantee_completion_date=g_comp_date,
                        guarantee_repair_date=g_rep_date,
                        guarantee_place=g_place,
                        rha_defect=rha_val,
                    )

                elif dart_type in ["ABER", "ASR"]:
                    spares_req = (
                        str(
                            val_data.get("spares_required")
                            or val_data.get("spares_required2")
                            or "NO"
                        ).upper()
                        == "YES"
                    )
                    dart = InitiateDart.objects.create(
                        department_id=department,
                        equipment_ship=equipment_obj,
                        equipment_ems=equipment_name_obj,
                        dart_number=new_serial,
                        dart_sr_number=dart_sr_no,
                        universal_id_t_dart=universal_id_t_dart,
                        maintenance_period=maintenance_period or "REFIT",
                        dart_occasion=dart_occasion or "DL III (As and As / ABER)",
                        is_ra_initiate=False,
                        is_guarantee_defect=False,
                        sapres_required=spares_req,
                        defective_discriptions=(
                            val_data.get("description")
                            or val_data.get("asr_desc")
                            or defect_desc
                        ),
                        rha_defect=rha_val,
                    )

                else:
                    # Normal Defect (default)
                    trial_req = str(val_data.get("trial") or "NO").upper() == "YES"
                    spares_req = (
                        str(val_data.get("spares_required") or "NO").upper() == "YES"
                    )

                    dart = InitiateDart.objects.create(
                        department_id=department,
                        equipment_ship=equipment_obj,
                        equipment_ems=equipment_name_obj,
                        dart_number=new_serial,
                        dart_sr_number=dart_sr_no,
                        universal_id_t_dart=universal_id_t_dart,
                        dart_date=val_data.get("defectDate"),
                        rectification_date=val_data.get("scheduledDate"),
                        defective_discriptions=defect_desc,
                        defective_component=val_data.get("defectiveComponent"),
                        trial_required=trial_req,
                        sapres_required=spares_req,
                        photograph=photograph,
                        maintenance_period=maintenance_period,
                        dart_occasion=dart_occasion,
                        is_ra_initiate=False,
                        is_guarantee_defect=False,
                        symptom_code_id=symptom_id if symptom_id else None,
                        severity_code_id=severity_id if severity_id else None,
                        remark_code_id=remark_id if remark_id else None,
                        require_assistance_for_code_id=(
                            require_assistance_id if require_assistance_id else None
                        ),
                        universal_id_trial_required=(
                            trial_agency_val if trial_req else None
                        ),
                        rha_defect=rha_val,
                    )

                # Stamp the id CMMS will hold this DART under, in the same
                # SWMM/<ship>/<year>/<month>/<id> form the multi-DART flow uses.
                #
                # This used to be a bare uuid4(), which is what made a SWMM-raised
                # defect unpushable: the Defect/DART grid's "Sync with CMMS" only
                # pushes DARTs it can tell SWMM raised, and it tells by the id being
                # null, blank or "SWMM"-prefixed (CMMSDefectSyncAndPushAPI.
                # _dart_queryset) — precisely so the rows the pull just imported don't
                # bounce straight back and overwrite CMMS's own richer columns. A uuid4
                # matched none of those, so a DART raised here sat at
                # cmms_sync_status=False for good if its auto-push below ever failed:
                # the manual Sync reported "nothing to push" and pushed nothing, every
                # time. (That filter treats GUIDs as CMMS-origin; CMMS itself issues
                # numeric ids only — 0 of 15,243 T_Dart rows are GUID-shaped — so the
                # only source of a GUID here was this line.)
                if not dart.universal_id_t_dart:
                    ship_obj = get_this_ship()
                    ship_no = (
                        (ship_obj.code or ship_obj.universal_id_m_ship)
                        if ship_obj
                        else "UNKNOWN"
                    )
                    now = timezone.now()
                    dart.universal_id_t_dart = (
                        f"SWMM/{ship_no}/{now.strftime('%Y')}/"
                        f"{now.strftime('%m')}/{dart.id}"
                    )
                    dart.save(update_fields=["universal_id_t_dart"])

                # 6. REFIT / OPS PERIOD LINK
                ops_period_id = val_data.get("ops_period_id")
                if ops_period_id:
                    refit_obj = RefitMaintenancePeriod.objects.filter(
                        id=ops_period_id
                    ).first()
                    if refit_obj:
                        dart.refit_maintenance_period_f_key = refit_obj
                        dart.save()

                # 7. SPARES (split by inventory type — exactly like legacy)
                obs_spares = json.loads(val_data.get("obs_spares") or "[]")
                pil_spares = json.loads(val_data.get("pil_spares") or "[]")
                ilms_spares = json.loads(val_data.get("ilms_spares") or "[]")

                # OBS and PIL insertion
                for spare in obs_spares:
                    inv_type = spare.get("inventory_type", "OBS")
                    if inv_type in ["OBS", "PIL"]:
                        pattern = spare.get("pattern", "")
                        description = spare.get("description", "")
                        qty = int(spare.get("qty", 1) or spare.get("quantity", 1))
                        spare_obj = Spares.objects.filter(
                            pattern_number=pattern
                        ).first()
                        DartSpare.objects.update_or_create(
                            dart=dart,
                            spare_id=spare_obj.id if spare_obj else None,
                            equipment_id=equipment_obj,
                            pattern=pattern,
                            description=description,
                            quantity=qty,
                            inventory_type=inv_type,
                        )

                for spare in pil_spares:
                    pattern = spare.get("pattern", "")
                    description = spare.get("description", "")
                    qty = int(spare.get("qty", 1) or spare.get("quantity", 1))
                    spare_obj = Spares.objects.filter(pattern_number=pattern).first()
                    DartSpare.objects.update_or_create(
                        dart=dart,
                        spare_id=spare_obj.id if spare_obj else None,
                        equipment_id=equipment_obj,
                        pattern=pattern,
                        description=description,
                        quantity=qty,
                        inventory_type="PIL",
                    )

                # ILMS (WED and MO)
                for spare in ilms_spares:
                    inv_type = spare.get("inventory_type", "")
                    pattern = spare.get("pattern", "")
                    desc = spare.get("description", "")
                    qty = int(spare.get("qty", 1) or spare.get("quantity", 1))

                    if inv_type == "WED":
                        wed_spare_obj = WLMSSpare.objects.filter(
                            item_code=pattern
                        ).first()
                        DartWedSpare.objects.update_or_create(
                            dart_id=dart,
                            equipment_id=equipment_obj,
                            wed_spare=wed_spare_obj,
                            pattern=pattern,
                            description=desc,
                            quantity=qty,
                        )
                    elif inv_type == "MO":
                        mo_spare_obj = Item.objects.filter(item_code=pattern).first()
                        DartMOSpare.objects.update_or_create(
                            dart_id=dart,
                            equipment_id=equipment_obj,
                            mo_spare=mo_spare_obj,
                            pattern=pattern,
                            description=desc,
                            quantity=qty,
                        )

                # 8. SPARES MAPPING CHECK & CREATE
                obs_pil_patterns = [s.get("pattern") for s in obs_spares] + [
                    s.get("pattern") for s in pil_spares
                ]
                if (
                    obs_pil_patterns
                    and equipment_obj
                    and hasattr(equipment_obj, "sub_department_f_key")
                ):
                    section_name_obj = getattr(
                        equipment_obj.sub_department_f_key, "name", None
                    )
                    if section_name_obj:
                        section_obj = Section.objects.filter(
                            name=section_name_obj
                        ).first()
                        if section_obj:
                            spare_objs = Spares.objects.filter(
                                pattern_number__in=obs_pil_patterns
                            )
                            eq_classes = EquipmentClass.objects.filter(
                                id__in=spare_objs.values_list(
                                    "equipment_class_id", flat=True
                                )
                            ).distinct()

                            for eq_class in eq_classes:
                                SparesMapping.objects.get_or_create(
                                    equipment_class=eq_class,
                                    equipment=equipment_obj,
                                    section_name_id=section_obj.id,
                                )

                # WED Mapping
                wed_patterns = [
                    s.get("pattern")
                    for s in ilms_spares
                    if s.get("inventory_type") == "WED"
                ]
                if wed_patterns and equipment_obj:
                    for pattern in wed_patterns:
                        wed_spare_obj = WLMSSpare.objects.filter(
                            item_code=pattern
                        ).first()
                        if wed_spare_obj and wed_spare_obj.eqpt:
                            SpareDataMap.objects.get_or_create(
                                equipment=equipment_obj,
                                wed_equipment=wed_spare_obj.eqpt,
                                wed_spares=wed_spare_obj,
                            )

                # MO Mapping
                mo_patterns = [
                    s.get("pattern")
                    for s in ilms_spares
                    if s.get("inventory_type") == "MO"
                ]
                if mo_patterns and equipment_obj:
                    for pattern in mo_patterns:
                        item_obj = Item.objects.filter(item_code=pattern).first()
                        if item_obj:
                            vendor = None
                            if pattern and "-" in pattern:
                                vendor_prefix = pattern.split("-", 1)[0]
                                vendor = Vendor.objects.filter(
                                    vendor_code=vendor_prefix[1:]
                                ).first()

                            if not MoMappingTable.objects.filter(
                                ilms_spare_id=item_obj,
                                equipment=equipment_obj,
                            ).exists():
                                MoMappingTable.objects.create(
                                    ilms_spare_id=item_obj,
                                    equipment=equipment_obj,
                                    vendor_id=vendor,
                                )

                # 9. UPDATE DART NUMBER ON OBS ISSUE, DEMAND & SURVEY ENTRIES (Legacy Step 9)
                if obs_pil_patterns:
                    matched_issue_pks = list(
                        Issue.objects.filter(
                            spare__pattern_number__in=obs_pil_patterns,
                            dart_number__in=["", "pending", "Pending", "None"],
                        ).values_list("pk", flat=True)
                    )

                    if matched_issue_pks:
                        Issue.objects.filter(pk__in=matched_issue_pks).update(
                            dart_number=new_serial
                        )
                        Demand.objects.filter(
                            issue_entry_id__in=matched_issue_pks
                        ).update(dart_number=new_serial)
                        Survey.objects.filter(
                            issue_entry_id__in=matched_issue_pks
                        ).update(dart_number=new_serial)

                # 10. AUTO-PUSH TO CMMS — mirrors SFD's own equipment Add flow
                # (_create_sfd_transaction -> _push_equipment_to_cmms): a DART raised in
                # SWMM should already show up in CMMS by the time this response comes back,
                # not sit at cmms_sync_status=False until someone separately runs the
                # Defect/DART grid's "Sync with CMMS" button. Reuses CMMSDartPushAPI's own
                # push machinery (_dart_payload/_push_batches) instead of duplicating it, so
                # this stays byte-for-byte the same push the manual Sync button already does
                # and can't drift from it. Never lets a CMMS failure roll back the local
                # DART — same never-raises philosophy as the SFD push; the local record is
                # the source of truth either way, and a failed auto-push just leaves this
                # DART pending for the manual Sync button to pick up later, same as today.
                try:
                    from swmmapi.views import CMMSDartPushAPI

                    pusher = CMMSDartPushAPI()
                    payload = pusher._dart_payload(dart, request)
                    for _batch, push_ok, push_reason in pusher._push_batches(
                        request, [dart], {dart.id: payload}
                    ):
                        if not push_ok:
                            logger.warning(
                                "Auto-push to CMMS failed for new DART %s: %s",
                                dart.dart_number,
                                push_reason,
                            )
                except Exception:
                    logger.exception(
                        "Auto-push to CMMS raised for new DART %s.", dart.dart_number
                    )
                dart.refresh_from_db(fields=["cmms_sync_status", "universal_id_t_dart"])

                return Response(
                    {
                        "status": "success",
                        "message": "Dart initiated successfully",
                        "dart_id": dart.id,
                        "dart_number": dart.dart_number,
                        "cmms_sync_status": dart.cmms_sync_status,
                    },
                    status=status.HTTP_201_CREATED,
                )

        except Exception as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


@extend_schema(tags=["DART"])
class GeneratedDLIIReportsAPIView(APIView):
    """
    List generated DL-II report groups.

    Replaces the reference project's template view: dart/generate_report/.
    """

    @extend_schema(responses={200: GeneratedDLIIReportSerializer(many=True)})
    def get(self, request, *args, **kwargs):
        reports = (
            RADLMaster.objects.select_related("refit_type_f_key")
            .annotate(
                total_dl_rows=Count(
                    "initiateradl",
                    filter=Q(initiateradl__dl_type="DL-II")
                    & ~Q(initiateradl__status="DELETED"),
                    distinct=True,
                )
            )
            .filter(total_dl_rows__gt=0)
            .order_by("-id")
        )
        serializer = GeneratedDLIIReportSerializer(reports, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


@extend_schema(tags=["DART"])
class GetDartDetailsAPIView(APIView):
    """
    Get all details for a specific DART defect.
    Replaces: get_dart_details in old views.
    """

    @extend_schema(
        parameters=[OpenApiParameter("dart_id", type=int, description="DART ID")],
        responses={200: GetDartDetailsResponseSerializer},
    )
    def get(self, request, *args, **kwargs):
        dart_id = request.query_params.get("dart_id")
        try:
            defect = InitiateDart.objects.get(id=dart_id)
            spares = []
            for s in defect.spares.all():
                spares.append(
                    {
                        "pattern": s.pattern or "",
                        "description": s.description or "",
                        "inventory_type": s.inventory_type or "",
                        "quantity": s.quantity or 0,
                    }
                )
            for s in defect.wed_spares.all():
                spares.append(
                    {
                        "pattern": s.pattern or "",
                        "description": s.description or "",
                        "inventory_type": "WED",
                        "quantity": s.quantity or 0,
                    }
                )
            for s in defect.mo_spares.all():
                spares.append(
                    {
                        "pattern": s.pattern or "",
                        "description": s.description or "",
                        "inventory_type": "MO",
                        "quantity": s.quantity or 0,
                    }
                )
            # 1. Previous DART Number resolution (actual previous DART for equipment)
            previous_dart_no = ""
            if defect.equipment_ship:
                prev_dart = (
                    InitiateDart.objects.filter(
                        equipment_ship=defect.equipment_ship, id__lt=defect.id
                    )
                    .order_by("-id")
                    .first()
                )
                if prev_dart:
                    previous_dart_no = prev_dart.dart_number or ""

            # 2. Trial Agency Name resolution
            trial_agency_val = defect.universal_id_trial_required or ""
            trial_agency_name = trial_agency_val
            if trial_agency_val:
                tu = None
                if str(trial_agency_val).isdigit():
                    tu = TrialUnit.objects.filter(id=int(trial_agency_val)).first()
                if not tu:
                    tu = TrialUnit.objects.filter(
                        Q(code__iexact=trial_agency_val)
                        | Q(name__iexact=trial_agency_val)
                    ).first()
                if tu:
                    trial_agency_name = tu.name

            # 3. RHA (Running Hours at Defect Time) resolution
            rha_defect_val = defect.rha_defect or ""
            if not rha_defect_val and defect.equipment_ship:
                rha_defect_val = str(defect.equipment_ship.eq_rhsi or "")

            data = {
                "id": defect.id,
                "dart_number": defect.dart_number or "",
                "dart_date": (
                    defect.dart_date.strftime(DATE_FORMAT) if defect.dart_date else ""
                ),
                "rectification_date": (
                    (
                        defect.rectification_date
                        or defect.guarantee_completion_date
                        or defect.guarantee_repair_date
                    ).strftime(DATE_FORMAT)
                    if (
                        defect.rectification_date
                        or defect.guarantee_completion_date
                        or defect.guarantee_repair_date
                    )
                    else ""
                ),
                "nomenclature": (
                    defect.equipment_ship.nomenclature if defect.equipment_ship else ""
                ),
                "equipment_code": (
                    defect.equipment_ship.equipment.equipment_code
                    if defect.equipment_ship and defect.equipment_ship.equipment
                    else ""
                ),
                "sub_dept": (
                    defect.equipment_ship.sub_department_f_key.name
                    if defect.equipment_ship
                    and defect.equipment_ship.sub_department_f_key
                    else ""
                ),
                "department": defect.department_id.name if defect.department_id else "",
                "serial_no": (
                    defect.equipment_ship.equipment_serial_no
                    if defect.equipment_ship
                    else ""
                ),
                "location": (
                    defect.equipment_ship.location_on_board
                    if defect.equipment_ship
                    else ""
                ),
                "previous_dart_no": previous_dart_no,
                "symptoms": (
                    defect.symptom_code.symptom_code if defect.symptom_code else ""
                ),
                "severity": (
                    defect.severity_code.severity_name if defect.severity_code else ""
                ),
                "assistance": (
                    defect.require_assistance_for_code.required_assistance_for
                    if defect.require_assistance_for_code
                    else ""
                ),
                "defective_component": defect.defective_component or "",
                "resolved_by": (
                    defect.remark_code.description if defect.remark_code else ""
                ),
                "trial_required": "YES" if defect.trial_required else "NO",
                "trial_agency": trial_agency_name,
                "trial_agency_code": trial_agency_val,
                "description": defect.defective_discriptions or "",
                "photograph": defect.photograph.url if defect.photograph else "",
                "occasion": defect.dart_occasion or "",
                "maintenance_period": defect.maintenance_period or "",
                "rha_defect": rha_defect_val,
                "rha_for_defect": rha_defect_val,
                "created_date": (
                    defect.created_date.strftime(DATE_FORMAT)
                    if defect.created_date
                    else ""
                ),
                "is_gd": defect.is_guarantee_defect,
                "sapres_required": "YES" if defect.sapres_required else "NO",
                "guarantee_cause": defect.guarantee_cause or "",
                "op_availability": "YES" if defect.guarantee_op_availability else "NO",
                "hot_work": "YES" if defect.guarantee_hot_work else "NO",
                "repairs": defect.guarantee_repairs or "",
                "repair_date": (
                    (
                        defect.guarantee_repair_date
                        or defect.rectification_date
                        or defect.guarantee_completion_date
                    ).strftime(DATE_FORMAT)
                    if (
                        defect.guarantee_repair_date
                        or defect.rectification_date
                        or defect.guarantee_completion_date
                    )
                    else ""
                ),
                "completion_date": (
                    (
                        defect.guarantee_completion_date
                        or defect.rectification_date
                        or defect.guarantee_repair_date
                    ).strftime(DATE_FORMAT)
                    if (
                        defect.guarantee_completion_date
                        or defect.rectification_date
                        or defect.guarantee_repair_date
                    )
                    else ""
                ),
                "place": defect.guarantee_place or "",
                "spares": spares,
            }
            return Response(
                {"status": "success", "data": data}, status=status.HTTP_200_OK
            )
        except InitiateDart.DoesNotExist:
            return Response(
                {"status": "error", "message": "DART not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


@extend_schema(tags=["DART"])
class CreateRADLFunAPIView(APIView):
    """
    Create RA/DL: marks defects as RA initiated.
    Replaces: create_ra_dl_fun POST in old views.
    """

    @extend_schema(
        request=CreateRADLFunSerializer,
        responses={200: CreateRADLFunResponseSerializer},
    )
    def post(self, request, *args, **kwargs):
        defect_ids = request.data.get("defect_ids", [])
        if isinstance(defect_ids, str):
            defect_ids = json.loads(defect_ids)

        InitiateDart.objects.filter(id__in=defect_ids).update(
            is_ra_draft=False, is_ra_initiate=True
        )

        dart_objects = InitiateDart.objects.filter(id__in=defect_ids).select_related(
            "equipment_ems", "equipment_ship"
        )
        serializer = CreateRADLDefectDataSerializer(dart_objects, many=True)

        ship_remarks = ChMasterShipRemarksBy.objects.filter(active=1)
        ship_remarks_data = [
            {"id": sr.id, "description": sr.description or ""} for sr in ship_remarks
        ]

        return Response(
            {
                "status": "success",
                "message": "RA initiated successfully.",
                "data": {
                    "dart_objects": serializer.data,
                    "type": "RA",
                    "ship_remarks_list": ship_remarks_data,
                },
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["DART"])
class CompleteDefectAPIView(APIView):
    """
    Mark a defect as closed (completed) and save its complete details (GET and POST).
    """

    parser_classes = (MultiPartParser, FormParser, JSONParser)

    @extend_schema(
        responses={200: CompleteDefectGETResponseSerializer},
    )
    def get(self, request, defect_id, *args, **kwargs):
        try:
            defect_obj = InitiateDart.objects.get(id=defect_id)
        except InitiateDart.DoesNotExist:
            return Response(
                {
                    "status": "error",
                    "message": "Defect not found.",
                    "data": None,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        issued_spares = Issue.objects.filter(
            dart_number=defect_obj.dart_number
        ).select_related("spare")

        repair_agency_list = MRepairAgency.objects.all()

        dept = getattr(
            getattr(request.user, "CustomUser_profile", None), "department", None
        )
        if dept:
            univ_id = getattr(dept, "universal_id_m_department", None)
            if univ_id:
                diagnostic_qs = MDiagnostic.objects.filter(
                    universal_id_m_department=univ_id, active=1
                )
            else:
                diagnostic_qs = MDiagnostic.objects.filter(department=dept, active=1)
        else:
            diagnostic_qs = MDiagnostic.objects.filter(active=1)

        if not diagnostic_qs.exists():
            diagnostic_qs = MDiagnostic.objects.filter(active=1)

        repair_list = MRepair.objects.all()
        delay_list = MDelay.objects.all()

        # Format dropdown lists cleanly without duplicate keys
        repair_agencies_data = [
            {
                "id": r.id,
                "repair_agency_code": r.repair_agency_code or "",
                "repair_agency_name": r.repair_agency_name or "",
            }
            for r in repair_agency_list
        ]
        diagnostics_data = [
            {
                "id": d.id,
                "diagnostic_code": d.diagnostic_code or "",
                "diagnostic_name": d.diagnostic_name or "",
            }
            for d in diagnostic_qs
        ]
        repairs_data = [
            {
                "id": r.id,
                "repair_code": r.repair_code or "",
                "repair_name": r.repair_name or "",
            }
            for r in repair_list
        ]
        delays_data = [
            {
                "id": d.id,
                "delay_code": d.delay_code or "",
                "delay_name": d.delay_name or "",
            }
            for d in delay_list
        ]

        defect_serializer = CompleteDefectGETDetailSerializer(defect_obj)
        issued_spares_serializer = IssuedSpareSerializer(issued_spares, many=True)

        payload = {
            "defect": defect_serializer.data,
            "issued_spare_obj": issued_spares_serializer.data,
            "repair_agency_list": repair_agencies_data,
            "diagnostic_list": diagnostics_data,
            "repair_list": repairs_data,
            "delay_list": delays_data,
        }

        return Response(
            {
                "status": "success",
                "message": "Defect completion details retrieved.",
                "data": payload,
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        request=CompleteDefectSerializer,
        responses={200: CompleteDefectPOSTResponseSerializer},
    )
    def post(self, request, defect_id, *args, **kwargs):
        try:
            defect_obj = InitiateDart.objects.get(id=defect_id)
        except InitiateDart.DoesNotExist:
            return Response(
                {
                    "status": "error",
                    "message": "Defect not found.",
                    "data": None,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = CompleteDefectSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "status": "error",
                    "message": "Validation failed.",
                    "data": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        val = serializer.validated_data
        repair_agency = MRepairAgency.objects.filter(
            id=val.get("repair_agency_code")
        ).first()
        diagnostic = MDiagnostic.objects.filter(id=val.get("diagnostic_code")).first()

        try:
            complete_obj = CompleteDefectDart.objects.create(
                serial_no=defect_obj.dart_number or "",
                dart_details=defect_obj,
                rectified_date=val.get("rectified_date"),
                repair_agency_code=repair_agency,
                diagnostic_code=diagnostic,
                days_delay=val.get("days_delay", 0),
                other_reasons=val.get("delay_reason", ""),
                lesson_learnt=val.get("lesson_learnt", ""),
                defect_report=val.get("defect_report"),
            )

            spares_list = []
            spares_input = val.get("spares_used")
            if isinstance(spares_input, list):
                spares_list = spares_input
            elif isinstance(spares_input, str) and spares_input.strip():
                try:
                    spares_list = json.loads(spares_input)
                except Exception:
                    spares_list = []

            if not spares_list:
                spare_patterns = request.POST.getlist("spare_pattern[]") or (
                    request.data.getlist("spare_pattern[]")
                    if hasattr(request.data, "getlist")
                    else []
                )
                spare_descs = request.POST.getlist("spare_desc[]") or (
                    request.data.getlist("spare_desc[]")
                    if hasattr(request.data, "getlist")
                    else []
                )
                spare_qtys = request.POST.getlist("spare_qty[]") or (
                    request.data.getlist("spare_qty[]")
                    if hasattr(request.data, "getlist")
                    else []
                )
                for i in range(len(spare_patterns)):
                    spares_list.append(
                        {
                            "pattern": spare_patterns[i],
                            "desc": spare_descs[i] if i < len(spare_descs) else "",
                            "qty": spare_qtys[i] if i < len(spare_qtys) else 0,
                        }
                    )

            for spare in spares_list:
                pattern_no = spare.get("pattern") or spare.get("pattern_no") or ""
                description = spare.get("desc") or spare.get("description") or ""
                qty_raw = spare.get("qty") or spare.get("quantity") or 0
                if pattern_no or description:
                    DartSpareUsed.objects.create(
                        complete_dart=complete_obj,
                        pattern_no=pattern_no,
                        description=description,
                        quantity=int(qty_raw) if qty_raw else 0,
                    )

            defect_obj.is_closed = True
            defect_obj.save()
        except Exception as e:
            return Response(
                {
                    "status": "error",
                    "message": f"Failed to complete defect: {e!s}",
                    "data": None,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "status": "success",
                "message": "Defect closed successfully and moved to history.",
                "data": None,
            },
            status=status.HTTP_200_OK,
        )


def build_yard_specific_export(
    darts, yard_upper, s_code, s_name, dtg_date, remarks_data, dl_type="RA"
):
    yard_str = (
        str(yard_upper or "")
        .upper()
        .replace(" ", "")
        .replace("_", "")
        .replace("-", "")
        .replace("(", "")
        .replace(")", "")
    )

    # ── 1. ND (V) / NDV ──
    if "NDV" in yard_str or "VISAKHAPATNAM" in yard_str:
        headers = [
            "section",
            "dlnumber",
            "column1",
            "column2",
            "column3",
            "column4",
            "column5",
            "column6",
            "column7",
            "ssremarks",
            "sscomments",
            "dl_code",
            "dtg",
            "sub_defect",
        ]
        rows = []
        for idx, d in enumerate(darts, start=1):
            def_class = getattr(d, "defect_class", None) or "E"
            section = def_class.split("-")[0] if "-" in def_class else def_class[:1]
            eq_name = ""
            nom_name = ""
            equip_code = ""
            if d.equipment_ship:
                nom_name = d.equipment_ship.nomenclature or ""
                if d.equipment_ship.equipment:
                    eq_name = str(d.equipment_ship.equipment.equipment_class or "")
                    equip_code = str(d.equipment_ship.equipment.id or "")
            elif d.equipment_ems:
                eq_name = d.equipment_ems.name or ""
                equip_code = str(d.equipment_ems.id or "")

            d_id_str = str(d.id)
            d_id_int = d.id
            rem_text = remarks_data.get(d_id_str) or remarks_data.get(d_id_int) or ""
            ss_rem_desc = d.remark_code.description if d.remark_code else ""
            ship_rem = ss_rem_desc or rem_text or ""

            def_date_str = (
                d.dart_date.strftime("%d-%m-%Y")
                if d.dart_date
                else (dtg_date or timezone.now().strftime("%d-%m-%Y"))
            )
            def_date_nodash = (
                d.dart_date.strftime("%d%m%Y")
                if d.dart_date
                else timezone.now().strftime("%d%m%Y")
            )

            dlnumber = (
                getattr(d, "dl_number", None)
                or getattr(d, "defect_number", None)
                or f"{idx:05d}"
            )
            col1 = getattr(d, "column1", None) or d.dart_number or f"D-{section}-{d.id}"
            col2 = nom_name or eq_name or ""
            col3 = col2
            col4 = d.defective_discriptions or ""
            col5 = getattr(d, "column5", "") or ""
            col6 = equip_code or ""
            col7 = getattr(d, "location", None) or getattr(d, "compartment", None) or ""
            ssremarks = (
                getattr(d, "ssremarks", None)
                or (str(d.remark_code.id) if d.remark_code else "")
                or "1"
            )
            sscomments = ship_rem or ""
            dl_code = (
                getattr(d, "dl_code", None)
                or getattr(d, "ra_grup_id", None)
                or f"{d.id}_NORMAL_{def_date_nodash}"
            )
            dtg = def_date_str
            sub_defect = getattr(d, "sub_defect", None) or "1"

            rows.append(
                [
                    section,
                    dlnumber,
                    col1,
                    col2,
                    col3,
                    col4,
                    col5,
                    col6,
                    col7,
                    ssremarks,
                    sscomments,
                    dl_code,
                    dtg,
                    sub_defect,
                ]
            )

        return (
            headers,
            rows,
            [
                {
                    "name": "DEF_N_REM_MASTER",
                    "headers": headers,
                    "rows": rows,
                }
            ],
        )

    # ── 2. NSRY (Pbr) / NSRYPBR ──
    elif "PBR" in yard_str or "PORTBLAIR" in yard_str or "NSRYPBR" in yard_str:
        headers = [
            "section",
            "dlnumber",
            "column1",
            "column2",
            "column3",
            "column4",
            "column5",
            "column6",
            "column7",
            "ssremarks",
            "sscomments",
            "dl_code",
            "dtg",
            "sub_defect",
            "Defect_Type",
            "Photos",
        ]
        rows = []
        for idx, d in enumerate(darts, start=1):
            def_class = getattr(d, "defect_class", None) or "H"
            section = def_class.split("-")[0] if "-" in def_class else def_class[:1]
            eq_name = ""
            nom_name = ""
            equip_code = ""
            if d.equipment_ship:
                nom_name = d.equipment_ship.nomenclature or ""
                if d.equipment_ship.equipment:
                    eq_name = str(d.equipment_ship.equipment.equipment_class or "")
                    equip_code = str(d.equipment_ship.equipment.id or "")
            elif d.equipment_ems:
                eq_name = d.equipment_ems.name or ""
                equip_code = str(d.equipment_ems.id or "")

            d_id_str = str(d.id)
            d_id_int = d.id
            rem_text = remarks_data.get(d_id_str) or remarks_data.get(d_id_int) or ""
            ss_rem_desc = d.remark_code.description if d.remark_code else ""
            ship_rem = ss_rem_desc or rem_text or ""

            def_date_str = (
                d.dart_date.strftime("%d-%m-%Y")
                if d.dart_date
                else (dtg_date or timezone.now().strftime("%d-%m-%Y"))
            )
            def_date_nodash = (
                d.dart_date.strftime("%d%m%Y")
                if d.dart_date
                else timezone.now().strftime("%d%m%Y")
            )

            dlnumber = (
                getattr(d, "dl_number", None)
                or getattr(d, "defect_number", None)
                or f"{idx:05d}"
            )
            col1 = getattr(d, "column1", None) or d.dart_number or f"D-{section}-{d.id}"
            col2 = nom_name or eq_name or ""
            col3 = col2
            col4 = d.defective_discriptions or ""
            col5 = getattr(d, "column5", "") or ""
            col6 = equip_code or ""
            col7 = getattr(d, "location", None) or getattr(d, "compartment", None) or ""
            ssremarks = (
                getattr(d, "ssremarks", None)
                or (str(d.remark_code.id) if d.remark_code else "")
                or "1"
            )
            sscomments = ship_rem or ""
            dl_code = (
                getattr(d, "dl_code", None)
                or getattr(d, "ra_grup_id", None)
                or f"{d.id}_NORMAL_{def_date_nodash}"
            )
            dtg = def_date_str
            sub_defect = getattr(d, "sub_defect", None) or "1"
            defect_type = (
                getattr(d, "defect_type", None) or getattr(d, "rha_defect", None) or ""
            )
            photos = getattr(d, "photos", "") or ""

            rows.append(
                [
                    section,
                    dlnumber,
                    col1,
                    col2,
                    col3,
                    col4,
                    col5,
                    col6,
                    col7,
                    ssremarks,
                    sscomments,
                    dl_code,
                    dtg,
                    sub_defect,
                    defect_type,
                    photos,
                ]
            )

        return (
            headers,
            rows,
            [
                {
                    "name": "DEF_N_REM_MASTER",
                    "headers": headers,
                    "rows": rows,
                }
            ],
        )

    # ── 3. KOC (Kochi) ──
    elif "KOC" in yard_str:
        headers = [
            "DEF_SL",
            "DEFECT_NO",
            "PHM_NO",
            "SHIP_CODE",
            "DEFECT_CLASS",
            "DEF_DATE",
            "DART_NUMBER",
            "EQUIP_NAME",
            "EQUIP_CODE",
            "EQUIP_SYS",
            "EQUIP_LOCATION",
            "DEFECT_DESC",
            "SHIP_REM",
            "SS_COMMENTS",
        ]
        rows = []
        for idx, d in enumerate(darts, start=1):
            eq_name = ""
            nom_name = ""
            equip_code = ""
            if d.equipment_ship:
                nom_name = d.equipment_ship.nomenclature or ""
                if d.equipment_ship.equipment:
                    eq_name = str(d.equipment_ship.equipment.equipment_class or "")
                    equip_code = str(d.equipment_ship.equipment.id or "")
            elif d.equipment_ems:
                eq_name = d.equipment_ems.name or ""
                equip_code = str(d.equipment_ems.id or "")

            d_id_str = str(d.id)
            d_id_int = d.id
            rem_text = remarks_data.get(d_id_str) or remarks_data.get(d_id_int) or ""
            ss_rem_desc = d.remark_code.description if d.remark_code else ""
            ship_rem = ss_rem_desc or rem_text or ""

            def_date_str = (
                d.dart_date.strftime("%d-%m-%Y")
                if d.dart_date
                else (dtg_date or timezone.now().strftime("%d-%m-%Y"))
            )
            def_date_nodash = (
                d.dart_date.strftime("%d%m%y")
                if d.dart_date
                else timezone.now().strftime("%d%m%y")
            )
            def_date_word = (
                d.dart_date.strftime("%d %b %Y")
                if d.dart_date
                else timezone.now().strftime("%d %b %Y")
            )
            def_class = getattr(d, "defect_class", None) or "E"
            class_code = def_class.split("-")[0] if "-" in def_class else def_class[:1]
            defect_no = (
                getattr(d, "defect_number", None)
                or f"{s_name}/{class_code}/{idx:04d}/{def_date_nodash}"
            )
            phm_no = (
                getattr(d, "phm_no", None)
                or f"PHM/{s_name}/{class_code}/{idx:03d}/{def_date_word}"
            )
            location = (
                getattr(d, "location", None) or getattr(d, "compartment", None) or ""
            )

            rows.append(
                [
                    str(idx),
                    defect_no,
                    phm_no,
                    s_name,
                    class_code,
                    def_date_str,
                    d.dart_number or "",
                    eq_name,
                    equip_code,
                    nom_name or eq_name,
                    location,
                    d.defective_discriptions or "",
                    ship_rem,
                    "",
                ]
            )

        return (
            headers,
            rows,
            [
                {
                    "name": "DEF_N_REM_MASTER",
                    "headers": headers,
                    "rows": rows,
                }
            ],
        )

    # ── 4. Standard Default (ND MBI / NSRY KAR / Others) ──
    else:
        amp_smp_headers = [
            "ID",
            "Ship_code",
            "Ship_name",
            "Defect_Type",
            "Start_Date",
            "End_Date",
            "Rev_Start_Date",
            "Rev_End_Date",
            "Authority",
            "Entry_Date",
        ]
        amp_smp_rows = [
            [
                "",
                s_code,
                s_name,
                dl_type or "RA",
                "",
                "",
                "",
                "",
                "",
                timezone.now().strftime("%d-%m-%Y"),
            ]
        ]

        headers = [
            "DEFECT_NO",
            "ALPHA_SL",
            "OPRA_NO",
            "SHIP_CODE",
            "SHIP_NAME",
            "DEF_DATE",
            "DEF_SL",
            "DEFECT_CLASS",
            "EQUIP_NAME",
            "EQUIP_SYS",
            "EQUIP_CODE",
            "DART_NUMBER",
            "DEFECT_DESC",
            "SHIP_REM",
            "EQUIP_LOCATION",
            "AA_REM_DATE",
            "AA_REM",
            "MPC_REM_DATE_FOR_CENTRES",
            "MPC_REM_FOR_CENTRES",
            "CEN_MGR_REM_DATE",
            "CEN_MGR_REM",
            "MPC_FINAL_REM_DATE",
            "MPC_FINAL_REM",
            "REF_ID",
            "DEFECT_TYPE",
            "AMP_SMP_ID",
        ]
        rows = []
        for idx, d in enumerate(darts, start=1):
            eq_name = ""
            nom_name = ""
            equip_code = ""
            if d.equipment_ship:
                nom_name = d.equipment_ship.nomenclature or ""
                if d.equipment_ship.equipment:
                    eq_name = str(d.equipment_ship.equipment.equipment_class or "")
                    equip_code = str(d.equipment_ship.equipment.id or "")
            elif d.equipment_ems:
                eq_name = d.equipment_ems.name or ""
                equip_code = str(d.equipment_ems.id or "")

            d_id_str = str(d.id)
            d_id_int = d.id
            rem_text = remarks_data.get(d_id_str) or remarks_data.get(d_id_int) or ""
            ss_rem_desc = d.remark_code.description if d.remark_code else ""
            ship_rem = ss_rem_desc or rem_text or ""

            def_date_str = (
                d.dart_date.strftime("%d-%m-%Y")
                if d.dart_date
                else (dtg_date or timezone.now().strftime("%d-%m-%Y"))
            )
            def_date_nodash = (
                d.dart_date.strftime("%d%m%y")
                if d.dart_date
                else timezone.now().strftime("%d%m%y")
            )
            def_date_word = (
                d.dart_date.strftime("%d %b %Y")
                if d.dart_date
                else timezone.now().strftime("%d %b %Y")
            )

            def_class = getattr(d, "defect_class", None) or "H-HULL"
            class_code = def_class.split("-")[0] if "-" in def_class else def_class[:1]
            defect_no = (
                getattr(d, "defect_number", None)
                or f"{s_code}/{class_code}/{idx:04d}/{def_date_nodash}"
            )
            opra_no = (
                getattr(d, "opra_no", None) or f"OPRA/{s_code}/{d.id}/{def_date_word}"
            )
            alpha_sl = chr(64 + idx) if 1 <= idx <= 26 else str(idx)
            location = (
                getattr(d, "location", None) or getattr(d, "compartment", None) or ""
            )

            rows.append(
                [
                    defect_no,
                    alpha_sl,
                    opra_no,
                    s_code,
                    s_name,
                    def_date_str,
                    str(idx),
                    def_class,
                    eq_name or "STRUCTURE",
                    nom_name or eq_name or "STRUCTURE",
                    equip_code or "126200",
                    d.dart_number or "",
                    d.defective_discriptions or "",
                    ship_rem,
                    location,
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    dl_type or "RA",
                    "0",
                ]
            )

        amp_smp_table_name = "AMP_SMP_Period" if "KAR" in yard_str else "AMP_SMP_PERIOD"
        tables = [
            {
                "name": amp_smp_table_name,
                "headers": amp_smp_headers,
                "rows": amp_smp_rows,
            },
            {"name": "DEF_N_REM_MASTER", "headers": headers, "rows": rows},
        ]

        return headers, rows, tables


@extend_schema(tags=["DART"])
class PendingDefectsExportAPIView(APIView):
    export_headers = [
        "Sr No",
        "DART No",
        "Defect Date",
        "Equipment",
        "Nomenclature",
        "Defective Component",
        "Description",
        "Severity",
        "Occasion",
    ]
    export_format = "csv"

    def get(self, request, *args, **kwargs):
        rows = build_pending_defect_export_rows()
        if self.export_format == "xlsx":
            return build_xlsx_response(
                "pending_defects.xlsx",
                self.export_headers,
                rows,
            )
        return build_csv_response("pending_defects.csv", self.export_headers, rows)

    @extend_schema(
        request=ExportPendingDefectsACCDBSerializer,
        responses={200: ExportPendingDefectsACCDBResponseSerializer},
    )
    def post(self, request, *args, **kwargs):
        serializer = ExportPendingDefectsACCDBSerializer(data=request.data)
        if serializer.is_valid():
            val = serializer.validated_data
            dart_ids = val.get("dart_ids", [])
            yard = val.get("yard", "")
            export_format = val.get("export_format", "CSV")
            dl_type = val.get("dl_type", "RA")
            remarks_data = val.get("remarks_data", {})
            ss_remarks_data = val.get("ss_remarks_data", {})

            dtg_date = val.get("dtg_date", "")
            dtg_hour = val.get("dtg_hour", "")
            dtg_minute = val.get("dtg_minute", "")
            dtg = val.get("dtg", "")

            if not dtg and dtg_date:
                time_str = f"{dtg_hour}:{dtg_minute}".strip(":")
                dtg = f"{dtg_date} {time_str}".strip()

            if dart_ids:
                ra_group_id = f"RA-{now().strftime('%Y%m%d%H%M%S')}"

                InitiateDart.objects.filter(id__in=dart_ids).update(
                    is_ra_draft=False, is_ra_initiate=True
                )

                darts = InitiateDart.objects.filter(id__in=dart_ids)
                for d in darts:
                    d_id_str = str(d.id)
                    d_id_int = d.id
                    ss_rem_val = (
                        ss_remarks_data.get(d_id_str)
                        or ss_remarks_data.get(d_id_int)
                        or ss_remarks_data.get(str(d_id_int))
                    )
                    if ss_rem_val:
                        if str(ss_rem_val).isdigit():
                            ss_obj = ChMasterShipRemarksBy.objects.filter(
                                id=int(ss_rem_val)
                            ).first()
                        else:
                            ss_obj = ChMasterShipRemarksBy.objects.filter(
                                Q(description__iexact=str(ss_rem_val))
                                | Q(description__icontains=str(ss_rem_val))
                            ).first()
                        if ss_obj:
                            d.remark_code = ss_obj
                            d.save(update_fields=["remark_code"])

                    rem_text = (
                        remarks_data.get(d_id_str) or remarks_data.get(d_id_int) or ""
                    )
                    add_rem = f"DTG: {dtg}" if dtg else ""
                    InitiateRADL.objects.update_or_create(
                        initiate_dart=d,
                        dl_type=dl_type or "RA",
                        defaults={
                            "ra_grup_id": ra_group_id,
                            "remarks": rem_text,
                            "additional_remarks": add_rem,
                            "status": "GENERATED",
                            # "is_active": True,
                            "active": True,
                        },
                    )

                export_dir = os.path.join(settings.MEDIA_ROOT, "exports")
                os.makedirs(export_dir, exist_ok=True)

                raw_fmt = request.data.get("export_format")
                if not raw_fmt:
                    path_str = request.path.lower()
                    if "accdb" in path_str:
                        export_format = "ACCDB"
                    else:
                        export_format = "CSV"
                else:
                    export_format = str(raw_fmt).strip()

                fmt = str(export_format or "CSV").strip().lower()
                ext = fmt if fmt in ["csv", "xlsx", "pdf", "accdb"] else "csv"
                filename = f"RA_Export_{ra_group_id}.{ext}"
                filepath = os.path.join(export_dir, filename)

                export_headers = [
                    "Ser No",
                    "DART No",
                    "Defect Date",
                    "Yard",
                    "Status",
                    "Equipment",
                    "Nomenclature",
                    "Description",
                    "Additional Remarks",
                    "SS Remarks",
                ]

                export_rows = []
                for idx, d in enumerate(darts, start=1):
                    eq_name = ""
                    nom_name = ""
                    if d.equipment_ship:
                        nom_name = d.equipment_ship.nomenclature or ""
                        if d.equipment_ship.equipment:
                            eq_name = str(
                                d.equipment_ship.equipment.equipment_class or ""
                            )
                    elif d.equipment_ems:
                        eq_name = d.equipment_ems.name or ""

                    d_id_str = str(d.id)
                    d_id_int = d.id
                    rem_text = (
                        remarks_data.get(d_id_str) or remarks_data.get(d_id_int) or ""
                    )
                    ss_rem_desc = d.remark_code.description if d.remark_code else ""

                    export_rows.append(
                        [
                            idx,
                            d.dart_number or "",
                            d.dart_date.strftime("%Y-%m-%d") if d.dart_date else "",
                            yard,
                            "Closed" if d.is_closed else "Open",
                            eq_name,
                            nom_name,
                            d.defective_discriptions or "",
                            rem_text,
                            ss_rem_desc,
                        ]
                    )

                ship_obj = None
                try:
                    from master.utils import get_this_ship

                    ship_obj = get_this_ship()
                except Exception:
                    pass

                s_code = (
                    ship_obj.code
                    if ship_obj and getattr(ship_obj, "code", None)
                    else "ShipCode"
                ) or "ShipCode"
                s_name = (
                    ship_obj.name
                    if ship_obj and getattr(ship_obj, "name", None)
                    else "ShipName"
                ) or "ShipName"

                yard_upper = str(yard or "").upper()
                export_headers, export_rows, tables_arg = build_yard_specific_export(
                    darts,
                    yard_upper,
                    s_code,
                    s_name,
                    dtg_date,
                    remarks_data,
                    dl_type=dl_type or "RA",
                )

                try:
                    generate_export_file(
                        filepath,
                        export_headers,
                        export_rows,
                        export_format=ext,
                        title=f"RA Export - {ra_group_id}",
                        table_name="RA_Export",
                        tables=tables_arg,
                    )
                except Exception as err:
                    return Response(
                        {
                            "status": "error",
                            "message": f"Export failed for format '{ext.upper()}'. Please try another file format like CSV or Excel (XLSX). ({err!s})",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                download_url = request.build_absolute_uri(
                    f"{settings.MEDIA_URL}exports/{filename}"
                )

                return Response(
                    {
                        "status": "success",
                        "message": "RA records saved in database successfully.",
                        "data": {
                            "ra_group_id": ra_group_id,
                            "total_records": len(dart_ids),
                            "yard": yard,
                            "dtg": dtg,
                            "export_format": export_format,
                            "dl_type": dl_type or "RA",
                            "download_url": download_url,
                        },
                    },
                    status=status.HTTP_200_OK,
                )

        return self.get(request, *args, **kwargs)


class PendingDefectsXLSXExportAPIView(PendingDefectsExportAPIView):
    export_format = "xlsx"


@extend_schema(tags=["DART"])
class CreateDLFunAPIView(APIView):
    """
    Create DL-II entries for defects and mark them as DL draft.
    Replaces: create_dl_fun POST in old views.
    """

    @extend_schema(
        request=CreateDLFunSerializer,
        responses={200: CreateDLFunResponseSerializer},
    )
    def post(self, request, *args, **kwargs):
        serializer = CreateDLFunSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "status": "error",
                    "message": "Validation failed",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        val = serializer.validated_data
        defect_ids = val.get("dl_defect_ids")

        try:
            dl_no = InitiateRADL.objects.filter(dl_type="DL-II")
            dart_id = [dart.initiate_dart_id for dart in dl_no]
            dart_objects = InitiateDart.objects.filter(id__in=defect_ids).exclude(
                id__in=dart_id
            )
            dart_objects.update(is_dl_draft=True)

            for d in dart_objects:
                InitiateRADL.objects.update_or_create(
                    initiate_dart=d, dl_type="DL-II", status="DRAFT"
                )

            draft_ra = InitiateRADL.objects.filter(dl_type="DL-II", status="DRAFT")
            draft_serializer = CreateRADLDefectDataSerializer(draft_ra, many=True)

            refit_qs = RefitMaintenancePeriod.objects.all()
            refit_serializer = CreateDLRefitItemSerializer(refit_qs, many=True)

            ship_remarks = ChMasterShipRemarksBy.objects.filter(active=1)
            ship_remarks_data = [
                {"id": sr.id, "description": sr.description or ""}
                for sr in ship_remarks
            ]

            return Response(
                {
                    "status": "success",
                    "message": "DL initiated successfully.",
                    "data": {
                        "draft_data": draft_serializer.data,
                        "refit_list": refit_serializer.data,
                        "ship_remarks_list": ship_remarks_data,
                    },
                },
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


@extend_schema(tags=["DART"])
class SaveDLRowsAPIView(APIView):
    """
    Save DL row remarks for draft DL entries.
    Replaces: save_dl_rows POST in old views.
    """

    @extend_schema(
        request=SaveDLRowsSerializer,
        responses={200: SaveDLRowsResponseSerializer},
    )
    def post(self, request, *args, **kwargs):
        rows = request.data.get("rows", [])
        if isinstance(rows, str):
            try:
                rows = json.loads(rows)
            except Exception:
                rows = []

        if not rows:
            return Response(
                {"status": "error", "message": "No rows provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for row in rows:
            dart_id = row.get("dart_id") or row.get("dl_id")
            additional_remarks = row.get("additional_remarks") or row.get(
                "additional_remark", ""
            )
            remarks = row.get("remarks") or row.get("ss_remark", "")
            dl_number = row.get("dl_number") or row.get("dl_no")

            if dart_id:
                dl_obj = InitiateRADL.objects.filter(id=dart_id).first()
                if not dl_obj:
                    dl_obj = InitiateRADL.objects.filter(
                        initiate_dart_id=dart_id, dl_type="DL-II"
                    ).first()
                if dl_obj:
                    dl_obj.additional_remarks = additional_remarks
                    dl_obj.remarks = remarks
                    if dl_number:
                        dl_obj.dl_no = str(dl_number)
                    # dl_obj.is_active = True
                    dl_obj.active = True
                    dl_fields = [
                        "additional_remarks",
                        "remarks",
                        # "is_active",
                        "active",
                        "updated_date",
                    ]
                    if dl_number:
                        dl_fields.append("dl_no")
                    dl_obj.save(update_fields=dl_fields)

                    if remarks and dl_obj.initiate_dart:
                        if str(remarks).isdigit():
                            ss_obj = ChMasterShipRemarksBy.objects.filter(
                                id=int(remarks)
                            ).first()
                        else:
                            ss_obj = ChMasterShipRemarksBy.objects.filter(
                                Q(description__iexact=str(remarks))
                                | Q(description__icontains=str(remarks))
                            ).first()
                        if ss_obj:
                            dl_obj.initiate_dart.remark_code = ss_obj
                            dl_obj.initiate_dart.save(update_fields=["remark_code"])

        return Response(
            {"status": "success", "message": "DL rows saved successfully"},
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["DART"])
class DeleteDLRowAPIView(APIView):
    """
    Delete a draft DL row.
    Replaces: delete_dl_row POST in old views.
    """

    @extend_schema(
        request=DeleteDLRowSerializer,
        responses={200: GenericSuccessResponseSerializer},
    )
    def post(self, request, *args, **kwargs):
        dl_id = request.data.get("dl_id") or request.POST.get("dl_id")
        if not dl_id:
            return Response(
                {"status": "error", "message": "DL row id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            dl_id = int(dl_id)
        except (TypeError, ValueError):
            return Response(
                {"status": "error", "message": "Invalid DL row id"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            dl_row = InitiateRADL.objects.get(id=dl_id, dl_type="DL-II")
        except InitiateRADL.DoesNotExist:
            return Response(
                {"status": "error", "message": "DL row not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        initiate_dart_id = dl_row.initiate_dart_id
        dl_row.status = "DELETED"
        # dl_row.is_active = False
        # dl_row.save(update_fields=["status", "is_active", "updated_date"])
        dl_row.active = False
        dl_row.save(update_fields=["status", "active", "updated_date"])

        still_in_draft = InitiateRADL.objects.filter(
            initiate_dart_id=initiate_dart_id, dl_type="DL-II", status="DRAFT"
        ).exists()
        if not still_in_draft:
            InitiateDart.objects.filter(id=initiate_dart_id).update(is_dl_draft=False)

        return Response(
            {"status": "success", "message": "DL row deleted successfully"},
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["DART"])
class ExportPendingDefectsDL2APIView(APIView):
    """
    Export DL-II pending defects, assign DL numbers, create RADLMaster, and generate export file.
    Replaces: export_pending_defects_dl2_* POST endpoints.
    """

    @extend_schema(
        request=ExportPendingDefectsDL2Serializer,
        responses={200: ExportPendingDefectsDL2ResponseSerializer},
    )
    def post(self, request, *args, **kwargs):
        serializer = ExportPendingDefectsDL2Serializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "status": "error",
                    "message": "Validation failed",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        val = serializer.validated_data
        yard = val.get("yard", "")
        export_format = val.get("export_format", "CSV")
        refit_type_id = val.get("refit_Type")
        row_data = val.get("row_data", [])

        if isinstance(row_data, str):
            try:
                row_data = json.loads(row_data)
            except Exception:
                row_data = []

        if not row_data:
            return Response(
                {"status": "error", "message": "No row data provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        refit_obj = None
        refit_name = ""
        if refit_type_id:
            refit_obj = RefitMaintenancePeriod.objects.filter(id=refit_type_id).first()
            if refit_obj:
                refit_name = refit_obj.occasion or ""

        date_str = date.today().strftime("%d%m%Y")
        ra_dl_name = f"DLII-2-{date_str}"

        created_ra_dl_obj = RADLMaster.objects.create(
            ra_dl_name=ra_dl_name,
            refit_type_f_key=refit_obj,
            refit_type_name=refit_name,
            dockyard_name=yard,
        )

        processed_ids = []
        export_rows = []
        taken_dl_numbers = set()

        headers = [
            "Ser No",
            "DL No",
            "DART No",
            "Defect Date",
            "Closing Date",
            "Status",
            "Equipment",
            "Description",
            "Additional Remarks",
            "SS Remarks",
        ]

        for idx, r in enumerate(row_data, start=1):
            dart_id = r.get("dart_id")
            dl_id = r.get("dl_id")
            dl_number = r.get("dl_number") or r.get("dl_no", "")
            if not dl_number:
                dl_number = generate_dl_number("DL-II", taken=taken_dl_numbers)
            add_remark = r.get("additional_remark") or r.get("additional_remarks", "")
            ss_remark = r.get("ss_remark") or r.get("remarks", "")

            dl_obj = None
            if dl_id:
                dl_obj = InitiateRADL.objects.filter(id=dl_id).first()
            if not dl_obj and dart_id:
                dl_obj = (
                    InitiateRADL.objects.filter(
                        initiate_dart_id=dart_id, dl_type="DL-II"
                    )
                    .order_by("-id")
                    .first()
                )
            if not dl_obj and dl_id:
                dl_obj = (
                    InitiateRADL.objects.filter(initiate_dart_id=dl_id, dl_type="DL-II")
                    .order_by("-id")
                    .first()
                )

            dart_obj = None
            if dl_obj:
                dart_obj = dl_obj.initiate_dart
                if dl_number:
                    dl_obj.dl_no = str(dl_number)
                dl_obj.additional_remarks = add_remark
                dl_obj.remarks = ss_remark
                dl_obj.status = "GENERATED"
                dl_obj.radl_master = created_ra_dl_obj
                dl_obj.ra_grup_id = ra_dl_name
                # dl_obj.is_active = True
                dl_obj.active = True
                dl_fields = [
                    "additional_remarks",
                    "remarks",
                    "status",
                    "radl_master",
                    "ra_grup_id",
                    # "is_active",
                    "active",
                    "updated_date",
                ]
                if dl_number:
                    dl_fields.append("dl_no")
                dl_obj.save(update_fields=dl_fields)
            elif dart_id or dl_id:
                target_dart_id = dart_id or dl_id
                dart_obj = InitiateDart.objects.filter(id=target_dart_id).first()
                if dart_obj:
                    dl_obj = InitiateRADL.objects.create(
                        initiate_dart=dart_obj,
                        dl_no=str(dl_number) if dl_number else "",
                        dl_type="DL-II",
                        additional_remarks=add_remark,
                        remarks=ss_remark,
                        status="GENERATED",
                        radl_master=created_ra_dl_obj,
                        ra_grup_id=ra_dl_name,
                        # is_active=True,
                        active=True,
                    )

            if dart_obj:
                dart_obj.is_dl_initiate = True
                dart_obj.is_dl_draft = False

                if ss_remark:
                    if str(ss_remark).isdigit():
                        ss_obj = ChMasterShipRemarksBy.objects.filter(
                            id=int(ss_remark)
                        ).first()
                    else:
                        ss_obj = ChMasterShipRemarksBy.objects.filter(
                            Q(description__iexact=str(ss_remark))
                            | Q(description__icontains=str(ss_remark))
                        ).first()
                    if ss_obj:
                        dart_obj.remark_code = ss_obj

                dart_obj.save(
                    update_fields=["is_dl_initiate", "is_dl_draft", "remark_code"]
                )

                eq_name = ""
                if dart_obj.equipment_ship and dart_obj.equipment_ship.equipment:
                    eq_name = str(
                        dart_obj.equipment_ship.equipment.equipment_class or ""
                    )
                elif dart_obj.equipment_ems:
                    eq_name = dart_obj.equipment_ems.name or ""

                export_rows.append(
                    [
                        idx,
                        dl_number,
                        dart_obj.dart_number or "",
                        dart_obj.dart_date.strftime("%Y-%m-%d")
                        if dart_obj.dart_date
                        else "",
                        dart_obj.rectification_date.strftime("%Y-%m-%d")
                        if dart_obj.rectification_date
                        else "",
                        "Closed" if dart_obj.is_closed else "Open",
                        eq_name,
                        dart_obj.defective_discriptions or "",
                        add_remark,
                        ss_remark,
                    ]
                )
                processed_ids.append(dart_obj.id)

        path_str = request.path.lower()
        if not yard:
            if "ndv" in path_str:
                yard = "ND_V"
            elif "nsrykar" in path_str:
                yard = "NSRY_KAR"
            elif "nsrykoc" in path_str:
                yard = "NSRY_KOC"
            elif "nsrypbr" in path_str:
                yard = "NSRY_PBR"
            else:
                yard = "ND_MBI"

        raw_fmt = request.data.get("export_format")
        if not raw_fmt:
            if "accdb" in path_str:
                export_format = "ACCDB"
            else:
                export_format = "CSV"
        else:
            export_format = str(raw_fmt).strip()

        export_dir = os.path.join(settings.MEDIA_ROOT, "exports")
        os.makedirs(export_dir, exist_ok=True)

        fmt = str(export_format or "CSV").strip().lower()
        ext = fmt if fmt in ["csv", "xlsx", "pdf", "accdb"] else "csv"
        filename = f"DL2_Export_{ra_dl_name}_{yard}.{ext}"
        filepath = os.path.join(export_dir, filename)

        try:
            generate_export_file(
                filepath,
                headers,
                export_rows,
                export_format=ext,
                title=f"DL2 Export - {yard}",
                table_name="DL2_Export",
            )
        except Exception as err:
            return Response(
                {
                    "status": "error",
                    "message": f"Export failed for format '{ext.upper()}'. Please try another file format like CSV or Excel (XLSX). ({err!s})",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        download_url = request.build_absolute_uri(
            f"{settings.MEDIA_URL}exports/{filename}"
        )

        return Response(
            {
                "status": "success",
                "message": "DL-II records assigned and exported successfully.",
                "data": {
                    "ra_dl_name": ra_dl_name,
                    "total_records": len(processed_ids),
                    "yard": yard,
                    "download_url": download_url,
                },
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["DART"])
class PendingDefectAPIView(APIView):
    """
    Returns the pending (open) defects list for a department, along with filter options and DL III defects.
    """

    serializer_class = PendingDefectSerializer

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="department_id",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="ID of the department to filter pending defects, or 'All'",
            ),
            OpenApiParameter(
                name="sub_department",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Sub-department name to filter pending defects, or 'All'",
            ),
            OpenApiParameter(
                name="maintenance_period",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Maintenance period to filter pending defects, or 'All'",
            ),
            OpenApiParameter(
                name="dart_occasion",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="DART occasion to filter pending defects, or 'All'",
            ),
            OpenApiParameter(
                name="equipment_nomenclature",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Equipment nomenclature to filter pending defects, or 'All'",
            ),
            OpenApiParameter(
                name="date_range",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description=(
                    "Defect date range preset: Today, Yesterday, Last 7 Days, "
                    "Last 30 Days, This Month, Last Month, Custom, or All Data"
                ),
            ),
            OpenApiParameter(
                name="defect_date_from",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Custom defect date range start in YYYY-MM-DD format",
            ),
            OpenApiParameter(
                name="defect_date_to",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Custom defect date range end in YYYY-MM-DD format",
            ),
        ],
        responses={200: PendingDefectsResponseSerializer},
    )
    def get(self, request, *args, **kwargs):
        user = getattr(request, "user", None)
        user_dept = resolve_user_department(request)
        is_privileged = _dart_privileged(user)

        selected_sub_department = (
            request.query_params.get("sub_department")
            or request.query_params.get("sub_dept")
            or request.query_params.get("subDepartment")
        )
        selected_maintenance_period = request.query_params.get(
            "maintenance_period"
        ) or request.query_params.get("maintenancePeriod")
        selected_dart_occasion = request.query_params.get(
            "dart_occasion"
        ) or request.query_params.get("dartOccasion")
        selected_equipment_nomenclature = (
            request.query_params.get("equipment_nomenclature")
            or request.query_params.get("equipmentNomenclature")
            or request.query_params.get("eqpt_nomenclature")
            or request.query_params.get("nomenclature")
        )
        search_query = (
            request.query_params.get("search")
            or request.query_params.get("q")
            or request.query_params.get("query")
        )
        selected_date_range = (
            request.query_params.get("date_range")
            or request.query_params.get("defect_date_range")
            or request.query_params.get("defectDateRange")
        )
        defect_date_from = (
            request.query_params.get("defect_date_from")
            or request.query_params.get("defectDateFrom")
            or request.query_params.get("from_date")
            or request.query_params.get("start_date")
        )
        defect_date_to = (
            request.query_params.get("defect_date_to")
            or request.query_params.get("defectDateTo")
            or request.query_params.get("to_date")
            or request.query_params.get("end_date")
        )

        def has_filter_value(value):
            return value and str(value).lower() != "all"

        def parse_filter_date(value):
            if not value:
                return None
            try:
                return datetime.strptime(str(value), "%Y-%m-%d").date()
            except ValueError:
                return None

        def get_date_bounds(date_range, date_from, date_to):
            today = timezone.now().date()
            normalized_range = str(date_range or "").strip().lower().replace("_", " ")
            start_date = parse_filter_date(date_from)
            end_date = parse_filter_date(date_to)

            if normalized_range in {"", "all", "all data"} and not (
                start_date or end_date
            ):
                return None, None
            if normalized_range == "today":
                return today, today
            if normalized_range == "yesterday":
                yesterday = today - timedelta(days=1)
                return yesterday, yesterday
            if normalized_range in {"last 7 days", "last 7 day"}:
                return today - timedelta(days=7), today
            if normalized_range in {"last 30 days", "last 30 day"}:
                return today - timedelta(days=30), today
            if normalized_range == "this month":
                return today.replace(day=1), today
            if normalized_range == "last month":
                first_this_month = today.replace(day=1)
                last_prev_month = first_this_month - timedelta(days=1)
                return last_prev_month.replace(day=1), last_prev_month
            return start_date, end_date

        selected_dept_id = request.query_params.get(
            "department_id"
        ) or request.query_params.get("department_filter")

        filter_dept = None
        if is_privileged:
            if selected_dept_id and str(selected_dept_id).lower() != "all":
                filter_dept = selected_dept_id
            else:
                filter_dept = None
        elif user_dept:
            filter_dept = user_dept.id
        # Fetch all departments for selection if privileged
        all_departments_data = []
        if is_privileged:
            all_depts = Department.objects.all().order_by("name")
            all_departments_data = [
                {"id": dept.id, "name": dept.name} for dept in all_depts
            ]

        # Fetch open defects for open_defects (filtered by department if applicable)
        open_defect_obj = InitiateDart.objects.open().select_related(
            "equipment_ship",
            "equipment_ship__sub_department_f_key",
            "equipment_ship__equipment",
            "remark_code",
        )
        if filter_dept:
            open_defect_obj = open_defect_obj.filter(department_id=filter_dept)

        if search_query:
            open_defect_obj = open_defect_obj.filter(
                Q(dart_number__icontains=search_query)
                | Q(defective_discriptions__icontains=search_query)
                | Q(equipment_ship__nomenclature__icontains=search_query)
                | Q(equipment_ship__equipment__equipment_class__icontains=search_query)
            )

        if has_filter_value(selected_sub_department):
            open_defect_obj = open_defect_obj.filter(
                equipment_ship__sub_department_f_key__name__iexact=selected_sub_department
            )
        if has_filter_value(selected_maintenance_period):
            open_defect_obj = open_defect_obj.filter(
                maintenance_period__iexact=selected_maintenance_period
            )
        if has_filter_value(selected_dart_occasion):
            open_defect_obj = open_defect_obj.filter(
                dart_occasion__iexact=selected_dart_occasion
            )
        if has_filter_value(selected_equipment_nomenclature):
            open_defect_obj = open_defect_obj.filter(
                equipment_ship__nomenclature__iexact=selected_equipment_nomenclature
            )
        start_date, end_date = get_date_bounds(
            selected_date_range, defect_date_from, defect_date_to
        )
        if start_date and end_date:
            open_defect_obj = open_defect_obj.filter(
                dart_date__range=(start_date, end_date)
            )
        elif start_date:
            open_defect_obj = open_defect_obj.filter(dart_date__gte=start_date)
        elif end_date:
            open_defect_obj = open_defect_obj.filter(dart_date__lte=end_date)

        metadata_queryset = InitiateDart.objects.open().select_related(
            "equipment_ship",
            "equipment_ship__sub_department_f_key",
            "equipment_ship__equipment",
        )
        dept_metadata_qs = (
            metadata_queryset.filter(department_id=filter_dept)
            if filter_dept
            else metadata_queryset
        )
        if not dept_metadata_qs.exists():
            dept_metadata_qs = metadata_queryset

        def get_distinct_values(queryset, field_name, normalizer=None):
            unique_values = {}
            for value in queryset.values_list(field_name, flat=True):
                if not value:
                    continue
                display_value = normalizer(value) if normalizer else value
                unique_values.setdefault(display_value.lower(), display_value)
            return sorted(unique_values.values())

        def normalize_maintenance_period(value):
            return str(value).strip().title()

        sub_departments = get_distinct_values(
            dept_metadata_qs,
            "equipment_ship__sub_department_f_key__name",
        )
        maintenance_periods = get_distinct_values(
            dept_metadata_qs,
            "maintenance_period",
            normalize_maintenance_period,
        )

        occasion_queryset = dept_metadata_qs
        if has_filter_value(selected_maintenance_period):
            occasion_queryset = occasion_queryset.filter(
                maintenance_period__iexact=selected_maintenance_period
            )
        dart_occasions = get_distinct_values(occasion_queryset, "dart_occasion")

        # Equipment nomenclature and names stay data-driven from the available metadata records.
        equipment_nomenclatures = get_distinct_values(
            dept_metadata_qs,
            "equipment_ship__nomenclature",
        )
        equipment_names = get_distinct_values(
            dept_metadata_qs,
            "equipment_ship__equipment__equipment_class",
        )

        min_date_val = dept_metadata_qs.aggregate(Min("dart_date"))["dart_date__min"]
        max_date_val = dept_metadata_qs.aggregate(Max("dart_date"))["dart_date__max"]
        min_date = min_date_val.strftime("%Y-%m-%d") if min_date_val else None
        max_date = max_date_val.strftime("%Y-%m-%d") if max_date_val else None

        open_defect_obj = open_defect_obj.order_by("-id")

        # Fetch DL III open defects for Tab 2 (filtered by department if applicable)
        dl_3_defect_obj = (
            InitiateDart.objects.open()
            .filter(
                Q(dart_occasion__icontains="DL III")
                | Q(dart_occasion__icontains="DL-III")
                | Q(dart_occasion__icontains="DL3")
                | Q(is_dl_initiate=True)
            )
            .select_related(
                "equipment_ship",
                "equipment_ship__sub_department_f_key",
                "equipment_ship__equipment",
                "remark_code",
            )
        )
        if filter_dept:
            dl_3_defect_obj = dl_3_defect_obj.filter(department_id=filter_dept)

        if search_query:
            dl_3_defect_obj = dl_3_defect_obj.filter(
                Q(dart_number__icontains=search_query)
                | Q(defective_discriptions__icontains=search_query)
                | Q(equipment_ship__nomenclature__icontains=search_query)
                | Q(equipment_ship__equipment__equipment_class__icontains=search_query)
            )

        if has_filter_value(selected_sub_department):
            dl_3_defect_obj = dl_3_defect_obj.filter(
                equipment_ship__sub_department_f_key__name__iexact=selected_sub_department
            )
        if has_filter_value(selected_maintenance_period):
            dl_3_defect_obj = dl_3_defect_obj.filter(
                maintenance_period__iexact=selected_maintenance_period
            )
        if has_filter_value(selected_equipment_nomenclature):
            dl_3_defect_obj = dl_3_defect_obj.filter(
                equipment_ship__nomenclature__iexact=selected_equipment_nomenclature
            )
        if start_date and end_date:
            dl_3_defect_obj = dl_3_defect_obj.filter(
                dart_date__range=(start_date, end_date)
            )
        elif start_date:
            dl_3_defect_obj = dl_3_defect_obj.filter(dart_date__gte=start_date)
        elif end_date:
            dl_3_defect_obj = dl_3_defect_obj.filter(dart_date__lte=end_date)

        dl_3_defect_obj = dl_3_defect_obj.order_by("-id")

        # Serialize datasets
        open_defects_data = PendingDefectSerializer(open_defect_obj, many=True).data
        dl_3_defects_data = PendingDefectSerializer(dl_3_defect_obj, many=True).data

        response_data = {
            "is_privileged": is_privileged,
            "all_departments": all_departments_data,
            "selected_dept_id": filter_dept,
            "filter_options": {
                "sub_departments": sub_departments,
                "maintenance_periods": maintenance_periods,
                "dart_occasions": dart_occasions,
                "equipment_nomenclatures": equipment_nomenclatures,
                "equipment_names": equipment_names,
                "min_date": min_date,
                "max_date": max_date,
            },
            "open_defects": open_defects_data,
            "dl_3_defects": dl_3_defects_data,
        }
        return Response(response_data, status=status.HTTP_200_OK)


@extend_schema(tags=["DART"])
class GetEquipmentObjectsAPIView(APIView):
    """
    Get all ship equipments matching an equipment code.
    Replaces: get_equipment_objects in old views.
    """

    @extend_schema(
        parameters=[OpenApiParameter("code", type=str, description="Equipment Code")],
        responses={200: GetEquipmentObjectsResponseSerializer},
    )
    def get(self, request, *args, **kwargs):
        code = request.query_params.get("code")
        try:
            equipment = Equipment.objects.get(equipment_code=code)
            ship_eq_obj = ShipEquipment.objects.filter(
                equipment__equipment_code=equipment.equipment_code
            )

            list1 = []
            for obj in ship_eq_obj:
                list1.append(
                    {
                        "id": obj.id,
                        "nomenclature": obj.nomenclature,
                    }
                )
            return Response({"ship_equipments": list1}, status=status.HTTP_200_OK)
        except Equipment.DoesNotExist:
            return Response({"error": "Not found"}, status=status.HTTP_200_OK)


@extend_schema(tags=["DART"])
class GetNomenclatureDetailsAPIView(APIView):
    """
    Get detailed information about a specific ShipEquipment (Nomenclature).
    Replaces: get_nomenclature_details in old views.
    """

    @extend_schema(
        parameters=[
            OpenApiParameter("nomenclature", type=str, description="ShipEquipment ID")
        ],
        responses={200: GetNomenclatureDetailsResponseSerializer},
    )
    def get(self, request, *args, **kwargs):
        nomenclature = request.query_params.get("nomenclature")
        try:
            Sequipment = ShipEquipment.objects.get(id=nomenclature)

            # Get previous DART No
            prev_dart = (
                InitiateDart.objects.filter(equipment_ship=Sequipment)
                .order_by("-id")
                .first()
            )
            prev_dart_no = prev_dart.dart_number if prev_dart else "None"

            department_name = ""
            if getattr(Sequipment, "sub_department_f_key", None) and getattr(
                Sequipment.sub_department_f_key, "department_name", None
            ):
                department_name = Sequipment.sub_department_f_key.department_name.name
            elif getattr(Sequipment, "department", None):
                department_name = Sequipment.department.name

            data = {
                "equipment_serial_no": Sequipment.equipment_serial_no or "",
                "equipment_id": Sequipment.id,
                "location_on_board": Sequipment.location_on_board or "",
                "department": department_name,
                "sub_department": (
                    Sequipment.sub_department_f_key.name
                    if getattr(Sequipment, "sub_department_f_key", None)
                    else ""
                ),
                "prev_dart_no": prev_dart_no,
            }
            return Response(data, status=status.HTTP_200_OK)
        except Exception:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)


@extend_schema(tags=["DART"])
class CompleteDartListAPIView(APIView):
    """
    GET  → List all closed DARTs (is_closed=True, defective_discriptions is not null)
    """

    serializer_class = CompleteDartListSerializer

    def get(self, request, *args, **kwargs):
        defect_obj = (
            InitiateDart.objects.filter(is_closed=True)
            .exclude(defective_discriptions=None)
            .select_related(
                "symptom_code",
                "severity_code",
                "remark_code",
                "department_id",
                "equipment_ship",
                "equipment_ems",
            )
            .prefetch_related(
                "complete_defect_dart_set",
            )
            .order_by("-id")
        )

        serializer = CompleteDartListSerializer(defect_obj, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


@extend_schema(tags=["DART"])
class MaintenancePeriodsListAPIView(APIView):
    """
    Get maintenance periods from the last 1 year.
    Replaces: maintenance_periods_list in old views.
    """

    @extend_schema(responses={200: MaintenancePeriodItemSerializer(many=True)})
    def get(self, request, *args, **kwargs):
        today = timezone.now().date()
        one_year_ago = today - timedelta(days=365)
        maintenance_periods = []

        ops_periods = OpsMaintenancePeriod.objects.filter(
            start_date__gte=one_year_ago
        ).order_by("-start_date")

        for op in ops_periods:
            is_current = bool(
                op.start_date and op.end_date and op.start_date <= today <= op.end_date
            )
            maintenance_periods.append(
                {
                    "maintenance_period": getattr(
                        op, "maintenance_period", "Operational"
                    )
                    or "Operational",
                    "occasion": getattr(op, "occasion", getattr(op, "name", "-"))
                    or "-",
                    "start_date": (
                        op.start_date.strftime(DATE_FORMAT) if op.start_date else "-"
                    ),
                    "end_date": (
                        op.end_date.strftime(DATE_FORMAT) if op.end_date else "-"
                    ),
                    "is_current": is_current,
                }
            )

        refit_periods = RefitMaintenancePeriod.objects.filter(
            Q(actual_start_date__gte=one_year_ago)
            | Q(plan_start_date__gte=one_year_ago)
        ).order_by("-actual_start_date", "-plan_start_date")

        for rp in refit_periods:
            s_date = rp.actual_start_date or rp.plan_start_date
            e_date = rp.actual_end_date or rp.plan_end_date
            is_current = bool(s_date and e_date and s_date <= today <= e_date)
            maintenance_periods.append(
                {
                    "maintenance_period": getattr(rp, "maintenance_period", "Refit")
                    or "Refit",
                    "occasion": getattr(rp, "occasion", getattr(rp, "name", "-"))
                    or "-",
                    "start_date": s_date.strftime(DATE_FORMAT) if s_date else "-",
                    "end_date": e_date.strftime(DATE_FORMAT) if e_date else "-",
                    "is_current": is_current,
                }
            )

        maintenance_periods.sort(
            key=lambda x: (
                not x["is_current"],
                (
                    datetime.strptime(x["start_date"], DATE_FORMAT)
                    if x["start_date"] != "-"
                    else datetime.min
                ),
            ),
            reverse=True,
        )

        period_param = request.query_params.get("period", "").strip()
        if period_param and period_param.lower() != "all":
            maintenance_periods = [
                p
                for p in maintenance_periods
                if p["maintenance_period"].lower() == period_param.lower()
            ]

        occasion_param = request.query_params.get("occasion", "").strip()
        if occasion_param and occasion_param.lower() != "all":
            maintenance_periods = [
                p for p in maintenance_periods if p["occasion"] == occasion_param
            ]

        def parse_display_date(value):
            if not value or value == "-":
                return None
            try:
                return datetime.strptime(value, DATE_FORMAT).date()
            except ValueError:
                return None

        from_date_param = request.query_params.get("from_date", "").strip()
        if from_date_param:
            try:
                from_date_val = datetime.strptime(from_date_param, "%Y-%m-%d").date()
                maintenance_periods = [
                    p
                    for p in maintenance_periods
                    if (parse_display_date(p["start_date"]) or date.min)
                    >= from_date_val
                ]
            except ValueError:
                pass

        to_date_param = request.query_params.get("to_date", "").strip()
        if to_date_param:
            try:
                to_date_val = datetime.strptime(to_date_param, "%Y-%m-%d").date()
                maintenance_periods = [
                    p
                    for p in maintenance_periods
                    if (parse_display_date(p["end_date"]) or date.max) <= to_date_val
                ]
            except ValueError:
                pass

        search_param = (
            request.query_params.get("search", "").strip()
            or request.query_params.get("q", "").strip()
        )
        if search_param:
            search_lower = search_param.lower()
            maintenance_periods = [
                p
                for p in maintenance_periods
                if search_lower in p["maintenance_period"].lower()
                or search_lower in p["occasion"].lower()
                or search_lower in p["start_date"].lower()
                or search_lower in p["end_date"].lower()
            ]

        column_search_fields = {
            "period_search": "maintenance_period",
            "occasion_search": "occasion",
            "start_date_search": "start_date",
            "stop_date_search": "end_date",
        }
        for param_name, field_name in column_search_fields.items():
            value = request.query_params.get(param_name, "").strip().lower()
            if value:
                maintenance_periods = [
                    p for p in maintenance_periods if value in p[field_name].lower()
                ]

        return Response(maintenance_periods, status=status.HTTP_200_OK)


@extend_schema(tags=["DART"])
class DartDashboardAPIView(APIView):
    """
    Returns the complete DART Dashboard data as JSON.
    Mirrors the legacy dart_dashboard template view.
    """

    serializer_class = DartDashboardSerializer

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="department_id",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="ID or name of the department to fetch dashboard for, or 'all'",
            ),
        ],
        responses={200: DartDashboardSerializer},
    )
    def get(self, request, *args, **kwargs):
        user = getattr(request, "user", None)
        user_dept = resolve_user_department(request)
        is_privileged = _dart_privileged(user)

        department_id = request.query_params.get(
            "department_id"
        ) or request.query_params.get("department")
        department = None

        if is_privileged:
            if department_id and str(department_id).lower() != "all":
                try:
                    department = (
                        Department.objects.get(pk=department_id)
                        if str(department_id).isdigit()
                        else Department.objects.filter(
                            name__iexact=department_id
                        ).first()
                    )
                except Exception:
                    department = None
            else:
                department = None
        else:
            if department_id and str(department_id).lower() != "all":
                try:
                    department = (
                        Department.objects.get(pk=department_id)
                        if str(department_id).isdigit()
                        else Department.objects.filter(
                            name__iexact=department_id
                        ).first()
                    )
                except Exception:
                    department = user_dept
            else:
                department = user_dept

        cached_payload = None
        try:
            cache_key = make_cache_key(
                "dart:dashboard",
                request,
                extra={"department_id": str(department.id) if department else "all"},
            )
            cached_payload = cache.get(cache_key)
        except Exception:
            cached_payload = None

        if cached_payload is not None:
            serializer = DartDashboardSerializer(data=cached_payload)
            if serializer.is_valid():
                return Response(serializer.validated_data, status=status.HTTP_200_OK)

        today = timezone.now().date()

        # ── Sub-departments for department ────────────────
        if department:
            sub_depts = SubDepartment.objects.filter(department_name=department)
        else:
            sub_depts = SubDepartment.objects.all()

        # ── 1. Ship Status ────────────────────────────────
        ship_status_result = get_ship_status()
        ship_status = ship_status_result[0] if ship_status_result else None

        # ── 2. Open DARTs — Operational ───────────────────
        open_darts_ops_count = (
            InitiateDart.objects.open().for_department(department).operational().count()
        )

        # ── 3. Open DARTs — Refit ─────────────────────────
        open_darts_refit_count = (
            InitiateDart.objects.open().for_department(department).refit().count()
        )

        # ── 4. DARTs Due for Closing ──────────────────────
        due_for_closing_count = (
            InitiateDart.objects.open()
            .for_department(department)
            .filter(rectification_date__lt=today)
            .count()
        )

        # ── 5. Sub-Department Status & Equipment Data ─────
        sub_dept_status_data = []
        sub_dept_equipment_data = []

        for sd in sub_depts:
            # Status based on major defects (Non-Ops severity)
            major_defects_qs = (
                InitiateDart.objects.open()
                .non_ops()
                .filter(equipment_ship__sub_department_f_key=sd)
            )
            if department:
                major_defects_qs = major_defects_qs.filter(department_id=department)
            major_defects_count = major_defects_qs.count()

            sub_dept_status_data.append(
                {
                    "name": sd.name,
                    "status": "Non-Ops" if major_defects_count > 0 else "Ops",
                    "count": major_defects_count,
                }
            )

            # Equipment counts for gauge charts
            total_eq = EquipmentName.objects.filter(sub_department=sd).count()
            non_ops_qs = (
                InitiateDart.objects.open()
                .non_ops()
                .filter(equipment_ship__sub_department_f_key=sd)
            )
            if department:
                non_ops_qs = non_ops_qs.filter(department_id=department)

            non_ops_eq = non_ops_qs.values("equipment_ship").distinct().count()
            ops_eq = total_eq - non_ops_eq

            sub_dept_equipment_data.append(
                {
                    "sub_dept": sd.name,
                    "operational": ops_eq,
                    "non_operational": non_ops_eq,
                    "total": total_eq,
                }
            )

        # ── 6. Last 6 months Chart Data ──────────────────
        open_chart_data = []
        closed_chart_data = []

        for i in range(5, -1, -1):
            month_date = today - relativedelta(months=i)
            m_start = month_date.replace(day=1)
            m_end = (month_date + relativedelta(months=1)).replace(day=1) - timedelta(
                days=1
            )

            month_label = month_date.strftime("%b %Y")

            open_entry = {"month": month_label}
            closed_entry = {"month": month_label}
            total_open_month = 0
            total_closed_month = 0

            for sd in sub_depts:
                # Opened count
                op_qs = InitiateDart.objects.for_department(department).filter(
                    equipment_ship__sub_department_f_key=sd,
                    dart_date__range=(m_start, m_end),
                )
                op_cnt = op_qs.count()
                open_entry[sd.name] = op_cnt
                total_open_month += op_cnt

                # Closed count
                cl_qs = CompleteDefectDart.objects.filter(
                    dart_details__equipment_ship__sub_department_f_key=sd,
                    rectified_date__range=(m_start, m_end),
                )
                if department:
                    cl_qs = cl_qs.filter(dart_details__department_id=department)
                cl_cnt = cl_qs.count()
                closed_entry[sd.name] = cl_cnt
                total_closed_month += cl_cnt

            open_entry["total"] = total_open_month
            closed_entry["total"] = total_closed_month
            open_chart_data.append(open_entry)
            closed_chart_data.append(closed_entry)

        # ── 7. Maintenance Periods (last 1 year) ─────────
        one_year_ago = today - timedelta(days=365)
        maintenance_periods = []

        # Operational maintenance periods
        ops_periods = OpsMaintenancePeriod.objects.filter(
            start_date__gte=one_year_ago
        ).order_by("-start_date")
        for op in ops_periods:
            is_current = (
                op.start_date and op.end_date and op.start_date <= today <= op.end_date
            )
            maintenance_periods.append(
                {
                    "maintenance_period": op.maintenance_period or "Operational",
                    "occasion": op.occasion or op.name or "-",
                    "start_date": (
                        op.start_date.strftime(DATE_FORMAT) if op.start_date else "-"
                    ),
                    "end_date": (
                        op.end_date.strftime(DATE_FORMAT) if op.end_date else "-"
                    ),
                    "is_current": is_current,
                }
            )

        # Refit maintenance periods
        refit_periods = RefitMaintenancePeriod.objects.filter(
            Q(actual_start_date__gte=one_year_ago)
            | Q(plan_start_date__gte=one_year_ago)
        ).order_by("-actual_start_date", "-plan_start_date")
        for rp in refit_periods:
            s_date = rp.actual_start_date or rp.plan_start_date
            e_date = rp.actual_end_date or rp.plan_end_date
            is_current = s_date and e_date and s_date <= today <= e_date
            maintenance_periods.append(
                {
                    "maintenance_period": rp.maintenance_period or "Refit",
                    "occasion": rp.occasion or rp.name or "-",
                    "start_date": s_date.strftime(DATE_FORMAT) if s_date else "-",
                    "end_date": e_date.strftime(DATE_FORMAT) if e_date else "-",
                    "is_current": is_current,
                }
            )

        # Sort: current first, then by start_date
        maintenance_periods.sort(
            key=lambda x: (not x["is_current"], x["start_date"]), reverse=False
        )

        # ── Build & serialize response ────────────────────
        dashboard_data = {
            "ship_status": ship_status,
            "open_darts_ops_count": open_darts_ops_count,
            "open_darts_refit_count": open_darts_refit_count,
            "due_for_closing_count": due_for_closing_count,
            "sub_dept_status_data": sub_dept_status_data,
            "sub_dept_equipment_data": sub_dept_equipment_data,
            "open_chart_data": open_chart_data,
            "closed_chart_data": closed_chart_data,
            "sub_depts": [sd.name for sd in sub_depts],
            "maintenance_periods": maintenance_periods,
        }

        try:
            cache.set(cache_key, dashboard_data, timeout=300)
        except Exception:
            pass

        return Response(dashboard_data, status=status.HTTP_200_OK)


@extend_schema(tags=["DART"])
class DartHistoryDefaultDataAPIView(APIView):
    """
    Returns all closed DART records for history table + unique filter options.
    Replaces: dart_history_default_data in old views.
    """

    @extend_schema(responses={200: DartHistoryDefaultDataResponseSerializer})
    def get(self, request, *args, **kwargs):
        dept_param = (
            request.query_params.get("department_id")
            or request.query_params.get("department_filter")
            or request.query_params.get("department_name")
            or request.query_params.get("department")
        )
        filter_dept = resolve_user_department(request, dept_param)

        selected_sub_department = (
            request.query_params.get("sub_department")
            or request.query_params.get("sub_dept")
            or request.query_params.get("subDepartment")
        )
        selected_period = (
            request.query_params.get("maintenance_period")
            or request.query_params.get("maintenancePeriod")
            or request.query_params.get("period")
        )
        selected_occasion = (
            request.query_params.get("dart_occasion")
            or request.query_params.get("dartOccasion")
            or request.query_params.get("occasion")
        )
        selected_type = (
            request.query_params.get("dart_type")
            or request.query_params.get("type")
            or request.query_params.get("defect_type")
        )
        selected_equipment = (
            request.query_params.get("equipment")
            or request.query_params.get("nomenclature")
            or request.query_params.get("equipment_nomenclature")
        )
        search_query = (
            request.query_params.get("search")
            or request.query_params.get("q")
            or request.query_params.get("query")
        )

        def has_val(v):
            return v and str(v).strip().lower() not in {"all", ""}

        darts = get_closed_dart_history_queryset()
        if filter_dept:
            darts = darts.filter(department_id=filter_dept)

        if has_val(selected_sub_department):
            darts = darts.filter(
                equipment_ship__sub_department_f_key__name__iexact=selected_sub_department
            )
        if has_val(selected_period):
            darts = darts.filter(maintenance_period__iexact=selected_period)
        if has_val(selected_occasion):
            darts = darts.filter(dart_occasion__iexact=selected_occasion)
        if has_val(selected_type):
            darts = darts.filter(dart_occasion__iexact=selected_type)
        if has_val(selected_equipment):
            darts = darts.filter(
                Q(equipment_ship__nomenclature__icontains=selected_equipment)
                | Q(
                    equipment_ship__equipment__equipment_class__icontains=selected_equipment
                )
            )
        if search_query:
            darts = darts.filter(
                Q(dart_number__icontains=search_query)
                | Q(defective_discriptions__icontains=search_query)
                | Q(equipment_ship__nomenclature__icontains=search_query)
                | Q(equipment_ship__equipment__equipment_class__icontains=search_query)
            )

        # Date Range filtering
        date_range = (
            request.query_params.get("date_range")
            or request.query_params.get("defect_date_range")
            or request.query_params.get("defectDateRange")
        )
        date_from = (
            request.query_params.get("defect_date_from")
            or request.query_params.get("from_date")
            or request.query_params.get("start_date")
        )
        date_to = (
            request.query_params.get("defect_date_to")
            or request.query_params.get("to_date")
            or request.query_params.get("end_date")
        )

        def parse_date(v):
            if not v:
                return None
            try:
                return datetime.strptime(str(v), "%Y-%m-%d").date()
            except ValueError:
                return None

        s_date = parse_date(date_from)
        e_date = parse_date(date_to)

        if str(date_range or "").strip().lower() not in {
            "",
            "all",
            "all data",
        } and not (s_date or e_date):
            today = timezone.now().date()
            norm = str(date_range or "").strip().lower().replace("_", " ")
            if norm == "today":
                s_date, e_date = today, today
            elif norm == "yesterday":
                s_date, e_date = today - timedelta(days=1), today - timedelta(days=1)
            elif norm in {"last 7 days", "last 7 day"}:
                s_date, e_date = today - timedelta(days=7), today
            elif norm in {"last 30 days", "last 30 day"}:
                s_date, e_date = today - timedelta(days=30), today
            elif norm == "this month":
                s_date, e_date = today.replace(day=1), today
            elif norm == "last month":
                first_this = today.replace(day=1)
                last_prev = first_this - timedelta(days=1)
                s_date, e_date = last_prev.replace(day=1), last_prev

        if s_date and e_date:
            darts = darts.filter(dart_date__range=(s_date, e_date))
        elif s_date:
            darts = darts.filter(dart_date__gte=s_date)
        elif e_date:
            darts = darts.filter(dart_date__lte=e_date)

        data = []
        dart_occasions = set()
        sub_departments = set()
        dart_types = set()
        departments = set()
        dart_maintenance_period = set()
        equipments = set()
        equipment_nomenclatures = set()

        for dart in darts:
            row = build_dart_history_row(
                dart, "maintenanceType", maintenance_default="ops"
            )
            data.append(row)

            all_dart_occasions = {"All", "Normal Defect", "Normal RA"}
            all_maintenance_period = {"All", "Operational", "Refit"}
            dart_maintenance_period.update(all_maintenance_period)
            dart_occasions.update(all_dart_occasions)
            dart_types.update(all_dart_occasions)
            departments.add(dart.department_id.name if dart.department_id else "")
            if row["subDepartment"]:
                sub_departments.add(row["subDepartment"])
            equipments.add(row["equipmentName"])
            equipment_nomenclatures.add(row["equipmentNomenclature"])

        payload = {
            "data": data,
            "filters": {
                "dartMaintenancePeriod": sorted(dart_maintenance_period),
                "dartOccasions": sorted(dart_occasions),
                "subDepartments": sorted(sub_departments),
                "dartTypes": sorted(dart_types),
                "departments": sorted(departments),
                "equipments": sorted(equipments),
                "equipment_nomenclatures": sorted(equipment_nomenclatures),
            },
        }
        return Response(payload, status=status.HTTP_200_OK)


@extend_schema(tags=["DART"])
class DartHistoryPDFAPIView(APIView):
    def get(self, request, id, *args, **kwargs):
        try:
            defect = InitiateDart.objects.select_related("equipment_ship").get(id=id)
        except InitiateDart.DoesNotExist:
            return Response(
                {"status": "error", "message": "DART not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        pdf = build_simple_pdf(
            f"DART History - {defect.dart_number or defect.id}",
            [
                f"DART No: {defect.dart_number or ''}",
                f"Defect Date: {defect.dart_date or ''}",
                f"Description: {defect.defective_discriptions or ''}",
                f"Maintenance Period: {defect.maintenance_period or ''}",
                f"Occasion: {defect.dart_occasion or ''}",
            ],
        )
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'inline; filename="dart_history_{defect.id}.pdf"'
        )
        return response


@extend_schema(tags=["DART"])
class GetDartSparesDataAPIView(APIView):
    """
    Get Dart spares data by type: mo, mo_mapped, wed, wed_mapped.
    """

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "type",
                type=str,
                description="Spare type: mo, mo_mapped, wed, wed_mapped, obs",
            ),
            OpenApiParameter("equipment_id", type=str, required=False),
        ],
        responses={200: GetDartSparesDataResponseSerializer},
    )
    def get(self, request, *args, **kwargs):
        spare_type = request.query_params.get("type")
        data = []

        if spare_type == "mo":
            items = Item.objects.all()
            for item in items:
                data.append(
                    {
                        "item_code": str(item.item_code) if item.item_code else "",
                        "item_desc": str(item.item_desc) if item.item_desc else "",
                        "status": (
                            str(item.incat_yn)
                            if hasattr(item, "incat_yn") and item.incat_yn
                            else ""
                        ),
                        "crp_category": (
                            str(item.crp_category) if item.crp_category else ""
                        ),
                        "denomination": str(item.item_deno) if item.item_deno else "",
                        "price": "",
                        "price_date": "",
                        "ilms_eqpt_code": str(item.item_code) if item.item_code else "",
                        "ilms_eqpt_desc": "NA",
                        "vendor_name": "-",
                        "pk": item.pk,
                    }
                )

        elif spare_type == "mo_mapped":
            items = Item.objects.filter(
                momappingtable__ilms_spare_id__isnull=False
            ).distinct()
            for item in items:
                data.append(
                    {
                        "item_code": str(item.item_code) if item.item_code else "",
                        "item_desc": str(item.item_desc) if item.item_desc else "",
                        "status": (
                            str(item.incat_yn)
                            if hasattr(item, "incat_yn") and item.incat_yn
                            else ""
                        ),
                        "crp_category": (
                            str(item.crp_category) if item.crp_category else ""
                        ),
                        "denomination": str(item.item_deno) if item.item_deno else "",
                        "price": "",
                        "price_date": "",
                        "ilms_eqpt_code": str(item.item_code) if item.item_code else "",
                        "ilms_eqpt_desc": "NA",
                        "vendor_name": "-",
                        "pk": item.pk,
                    }
                )

        elif spare_type == "wed":
            from wlms.models import WLMSSpare

            wed_spares = WLMSSpare.objects.select_related("eqpt").all()
            for spare in wed_spares:
                eqpt_name = ""
                try:
                    eqpt_name = str(spare.eqpt.eqpt_name) if spare.eqpt else ""
                except Exception:
                    pass
                data.append(
                    {
                        "eqpt": eqpt_name,
                        "item_code": str(spare.item_code) if spare.item_code else "",
                        "item_desc": str(spare.item_desc) if spare.item_desc else "",
                        "denomination": str(spare.denom_id) if spare.denom_id else "",
                        "category": str(spare.category) if spare.category else "",
                        "typeofspare": (
                            str(spare.typeofspare) if spare.typeofspare else ""
                        ),
                        # "avail_status": (
                        #     "Yes" if getattr(spare, "is_active", False) else "No"
                        # ),
                        "avail_status": (
                            "Yes" if getattr(spare, "active", False) else "No"
                        ),
                        "pk": spare.pk,
                    }
                )

        elif spare_type == "wed_mapped":
            from django.db.models import Prefetch
            from wlms.models import SpareDataMap, WLMSSpare

            wed_spares = WLMSSpare.objects.prefetch_related(
                Prefetch(
                    "eqpt__spare_data_maps",
                    queryset=SpareDataMap.objects.select_related("equipment"),
                    to_attr="mapped_equipments",
                )
            ).select_related("eqpt")
            for spare in wed_spares:
                eqpt_name = ""
                insma_name = ""
                try:
                    eqpt_name = str(spare.eqpt.eqpt_name) if spare.eqpt else ""
                    mapped = spare.eqpt.mapped_equipments if spare.eqpt else []
                    if mapped:
                        insma_name = str(mapped[0].equipment.nomenclature)
                except Exception:
                    pass
                data.append(
                    {
                        "item_code": str(spare.item_code) if spare.item_code else "",
                        "item_desc": str(spare.item_desc) if spare.item_desc else "",
                        "denomination": str(spare.denom_id) if spare.denom_id else "",
                        "category": str(spare.category) if spare.category else "",
                        "typeofspare": (
                            str(spare.typeofspare) if spare.typeofspare else ""
                        ),
                        # "avail_status": (
                        #     "Yes" if getattr(spare, "is_active", False) else "No"
                        # ),
                        "avail_status": (
                            "Yes" if getattr(spare, "active", False) else "No"
                        ),
                        "wed_eqpt_name": eqpt_name,
                        "sfd_equipment": insma_name,
                        "pk": spare.pk,
                    }
                )

        elif spare_type == "obs":
            from obs.models import Spares

            spares = Spares.objects.all().select_related(
                "equipment_class", "denomination", "authority"
            )
            for spare in spares:
                data.append(
                    {
                        "equipmentClass": (
                            str(spare.equipment_class.name)
                            if spare.equipment_class
                            else ""
                        ),
                        "patternNo": (
                            str(spare.pattern_number) if spare.pattern_number else ""
                        ),
                        "itemDesc": str(spare.description) if spare.description else "",
                        "availabilityStatus": (
                            "Yes" if spare.quantity_available > 0 else "No"
                        ),
                        "denomination": (
                            str(spare.denomination.name) if spare.denomination else ""
                        ),
                        "heldQty": spare.quantity_available,
                        "crpCategory": str(spare.category) if spare.category else "",
                        "authority": (
                            str(spare.authority.name) if spare.authority else ""
                        ),
                        "pk": spare.pk,
                    }
                )

        serializer = GetDartSparesDataResponseSerializer(
            {"success": True, "data": data}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


@extend_schema(tags=["DART"])
class RefitOperationalOccasionAPIView(APIView):
    """
    GET: List all refit/operational periods.
    POST: Create or edit a refit/operational period with overlap check.
    """

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "search",
                type=str,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Search ",
            )
        ],
        responses={200: RefitOperationalOccasionResponseSerializer},
    )
    def get(self, request, *args, **kwargs):
        all_periods = RefitMaintenancePeriod.objects.all().order_by(
            "-actual_start_date"
        )

        # Search
        search = request.query_params.get("search")
        if search:
            all_periods = all_periods.filter(
                Q(refit_category_f_key__refit_category_name__icontains=search)
                | Q(maintenance_period__icontains=search)
            )

        refit_periods = [
            period
            for period in all_periods
            if period.maintenance_period != "OPERATIONAL"
        ]

        maint_periods = [
            period
            for period in all_periods
            if period.maintenance_period == "OPERATIONAL"
        ]

        payload = {
            "title": "DART | Refit Nomenclature Create / Amend",
            "pqr": "DART-Copyright",
            "ref": "Kolkata@Indian Navy",
            "refit_periods": refit_periods,
            "maint_periods": maint_periods,
        }
        serializer = RefitOperationalOccasionResponseSerializer(payload)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        request=RefitOccasionCreateSerializer,
        responses={200: OpenApiResponse(description="Period created")},
    )
    def post(self, request, *args, **kwargs):
        """Create a new refit/operational period."""
        import re

        try:
            start_date = request.data.get("start_date")
            completion_date = request.data.get("completion_date")
            refit_type = request.data.get("refit_type")
            if not start_date or not completion_date or not refit_type:
                return Response(
                    {"status": "error", "message": "All fields are required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            s = datetime.strptime(start_date, "%Y-%m-%d").date()
            e = datetime.strptime(completion_date, "%Y-%m-%d").date()
            overlap = RefitMaintenancePeriod.objects.filter(
                occasion=refit_type,
                actual_start_date__lte=e,
                actual_end_date__gte=s,
            ).first()
            if overlap:
                return Response(
                    {
                        "status": "error",
                        "message": f"Overlap detected with {overlap.name}",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            year = s.year
            last_year_record = (
                RefitMaintenancePeriod.objects.filter(
                    occasion=refit_type, actual_start_date__year=year
                )
                .order_by("-id")
                .first()
            )

            new_seq = 1
            if last_year_record:
                try:
                    if refit_type in ["AMP", "SMP", "EAMP"]:
                        match = re.search(r"([A-Za-z]+)(\d+)-", last_year_record.name)
                        if match:
                            new_seq = int(match.group(2)) + 1
                        else:
                            parts = last_year_record.name.split("-")
                            new_seq = int(parts[1]) + 1 if len(parts) > 2 else 1
                    else:
                        parts = last_year_record.name.split("-")
                        new_seq = int(parts[1]) + 1 if len(parts) > 2 else 1
                except Exception:
                    new_seq = 1

            if refit_type in ["AMP", "SMP", "EAMP"]:
                ops_name = f"{refit_type}{new_seq}-{year}"
                mp_type = "OPERATIONAL"
            else:
                ops_name = f"{refit_type}-{year}"
                mp_type = "REFIT"

            created_period = RefitMaintenancePeriod.objects.create(
                name=ops_name,
                maintenance_period=mp_type,
                occasion=refit_type,
                actual_start_date=s,
                actual_end_date=e,
            )
            return Response(
                {
                    "status": "success",
                    "message": f"Nomenclature Generated: {ops_name}",
                    "data": {
                        "id": created_period.id,
                        "name": created_period.name,
                        "occasion": created_period.occasion,
                        "actual_start_date": str(created_period.actual_start_date),
                        "actual_end_date": str(created_period.actual_end_date),
                    },
                },
                status=status.HTTP_200_OK,
            )
        except Exception as ex:
            return Response(
                {"status": "error", "message": str(ex)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @extend_schema(
        request=RefitOccasionEditSerializer,
        responses={200: OpenApiResponse(description="Period dates updated")},
    )
    def put(self, request, *args, **kwargs):
        """Edit dates of an existing refit/operational period."""
        try:
            period_id = request.data.get("period_id")
            start_date = request.data.get("start_date")
            completion_date = request.data.get("completion_date")
            if not period_id or not start_date or not completion_date:
                return Response(
                    {"status": "error", "message": "All fields are required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            s = datetime.strptime(start_date, "%Y-%m-%d").date()
            e = datetime.strptime(completion_date, "%Y-%m-%d").date()
            try:
                period = RefitMaintenancePeriod.objects.get(id=period_id)
            except RefitMaintenancePeriod.DoesNotExist:
                return Response(
                    {
                        "status": "error",
                        "message": f"Period with ID {period_id} not found.",
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            overlap = (
                RefitMaintenancePeriod.objects.filter(
                    occasion=period.occasion,
                    actual_start_date__lte=e,
                    actual_end_date__gte=s,
                )
                .exclude(id=period_id)
                .first()
            )
            if overlap:
                return Response(
                    {
                        "status": "error",
                        "message": f"Overlap detected with {overlap.name}",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            period.actual_start_date = s
            period.actual_end_date = e
            period.save()
            return Response(
                {
                    "status": "success",
                    "message": f"Dates updated for {period.name}.",
                    "data": {
                        "id": period.id,
                        "name": period.name,
                        "occasion": period.occasion,
                        "actual_start_date": str(period.actual_start_date),
                        "actual_end_date": str(period.actual_end_date),
                    },
                },
                status=status.HTTP_200_OK,
            )
        except Exception as ex:
            return Response(
                {"status": "error", "message": str(ex)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# multidart logic


MULTI_DART_VALIDATION_LAST_ROW = 1001
MULTI_DART_LOCK_MINUTES = 15


def _norm(value):
    # Code written by Unknown: how a workbook cell is compared to a master name - trimmed, collapsed
    # and case-folded. Anything stricter rejects a value only because someone typed two spaces.
    return " ".join(str(value or "").split()).casefold()


def _multi_dart_user_profile(user):
    if not user:
        return None
    if isinstance(user, CustomUserProfile):
        return user
    profile = getattr(user, "user_profile", None)
    if profile:
        return profile
    if hasattr(user, "user_profile_id") and getattr(user, "user_profile_id", None):
        return CustomUserProfile.objects.filter(id=user.user_profile_id).first()
    return None


def _multi_dart_department(request):
    profile = _multi_dart_user_profile(request.user)
    if profile and profile.department:
        return profile.department
    return resolve_user_department(request)


def _multi_dart_lock_state(draft, user):
    now = timezone.now()
    holder_profile = draft.locked_by
    user_profile = _multi_dart_user_profile(user)
    if holder_profile and draft.locked_at:
        age_minutes = (now - draft.locked_at).total_seconds() / 60.0
        holder_id = holder_profile.id
        user_profile_id = user_profile.id if user_profile else None
        if age_minutes < MULTI_DART_LOCK_MINUTES and holder_id != user_profile_id:
            holder_name = " ".join(
                str(part)
                for part in [
                    getattr(getattr(holder_profile, "rank", None), "name", "") or "",
                    getattr(holder_profile, "firstname", "") or "",
                    getattr(holder_profile, "lastname", "") or "",
                ]
                if part
            ).strip()
            return {
                "locked": True,
                "holder_name": (
                    holder_name
                    or getattr(holder_profile, "personal_number", "")
                    or "Another User"
                ),
                "since": timezone.localtime(draft.locked_at).strftime("%d %b %Y %H:%M"),
            }
    return {"locked": False, "holder_name": "", "since": ""}


def _multi_dart_person_name(target):
    if not target:
        return ""
    if isinstance(target, CustomUserProfile):
        profile = target
    else:
        profile = getattr(target, "user_profile", None)
    if profile:
        name = " ".join(
            str(part)
            for part in [
                getattr(getattr(profile, "rank", None), "name", "") or "",
                getattr(profile, "firstname", "") or "",
                getattr(profile, "lastname", "") or "",
            ]
            if part
        ).strip()
        if name:
            return name
        if getattr(profile, "personal_number", None):
            return str(profile.personal_number)
    return getattr(target, "username", str(target))


def _multi_dart_draft_rows(request):
    # Code written by Unknown: the department's saved drafts, shaped for the landing grid. Soft-deleted
    # drafts are excluded here rather than in the template so every caller gets the same list.
    department = _multi_dart_department(request)
    drafts = MultiDartDraft.objects.filter(
        department=department, is_delete=False
    ).select_related("created_by", "last_updated_by", "locked_by")

    rows = []
    for draft in drafts:
        payload = draft.payload or {}
        lock = _multi_dart_lock_state(draft, request.user)
        rows.append(
            {
                "id": draft.id,
                "name": draft.name,
                "row_count": len(payload.get("rows") or []),
                "created_by": _multi_dart_person_name(draft.created_by),
                "last_updated_by": _multi_dart_person_name(draft.last_updated_by),
                "updated_at": timezone.localtime(draft.updated_at).strftime(
                    "%d %b %Y %H:%M"
                ),
                "locked": lock["locked"],
                "holder_name": lock["holder_name"],
                "since": lock["since"],
            }
        )
    return rows


def _multi_dart_prefix(department):
    # Code written by Unknown: same mapping generate_dart_number applies, for the Defect ("D-") kind.
    name = (getattr(department, "name", "") or "").upper()
    if name == "ELECTRICAL":
        letter = "L"
    elif name == "ENGINEERING":
        letter = "E"
    else:
        letter = "X"
    return f"D-{letter}-"


def _multi_dart_highest_number(prefix):
    # Code written by Unknown: the highest number in use for this prefix, read NUMERICALLY.
    #
    # initiate_dart finds its previous row with order_by("-dart_number"), which is a LEXICOGRAPHIC
    # sort on a CharField - correct only while every number has the same digit count, and quietly
    # wrong the moment one does not (a "D-E-9999" sorts above "D-E-10000"). Allocating a block of
    # numbers off a wrong maximum would hand out numbers that already exist, so the trailing integer
    # is parsed and compared as a number here. Only the dart_number column is fetched.
    highest = 0
    for number in InitiateDart.objects.filter(
        dart_number__startswith=prefix
    ).values_list("dart_number", flat=True):
        if not number:
            continue
        tail = str(number).rsplit("-", 1)[-1]
        if tail.isdigit():
            highest = max(highest, int(tail))
    return highest


def _multi_dart_temp_numbers(department, count, floor=0):
    # Code written by Unknown: a block of TEMPORARY numbers for the grid, stepping by 1.
    #
    # These are shown so the user can see and export them - they are NOT reserved, and nothing is
    # written to hold them. The real number is issued again inside the atomic save. `floor` lets a
    # second run of the equipment popup continue above the highest number already on screen instead
    # of handing out the same ones twice.
    #
    # 50000 is the starting number generate_dart_number falls back to for a department with no DARTs
    # yet, repeated here so the first number this page shows matches what the single form would give.
    prefix = _multi_dart_prefix(department)
    start = max(_multi_dart_highest_number(prefix), floor)
    if start <= 0:
        return prefix, [f"{prefix}{50000 + i}" for i in range(count)]
    return prefix, [f"{prefix}{start + 1 + i}" for i in range(count)]


def _multi_dart_number_tail(number, prefix):
    # Code written by Unknown: the integer part of a number already on screen, used only to work out
    # the floor for the next block. Anything unparseable is ignored rather than raising.
    if not number or not str(number).startswith(prefix):
        return 0
    tail = str(number).rsplit("-", 1)[-1]
    return int(tail) if tail.isdigit() else 0


def _multi_dart_ship_equipment(ship_equipment):
    # Code written by Unknown: the read-only descriptive columns a grid row carries for its
    # equipment. sub_department is resolved exactly as get_nomenclature_details resolves it (see that
    # view above), so the bulk grid and the single form always show the same value for the same
    # equipment.
    return {
        "nomenclature_id": ship_equipment.id,
        "nomenclature": ship_equipment.nomenclature or "",
        "sub_department": (
            ship_equipment.sub_department_f_key.name
            if ship_equipment.sub_department_f_key
            else ""
        ),
        "equipment_code": (
            ship_equipment.equipment.equipment_code if ship_equipment.equipment else ""
        ),
        "equipment_class": (
            ship_equipment.equipment.equipment_class if ship_equipment.equipment else ""
        ),
    }


def _multi_dart_master_lists(request):
    # Code written by Unknown: one place that knows what the master drop downs contain, used by both
    # the workbook writer (to build the Lists sheet) and the importer (to resolve names back to ids).
    # If these ever drift apart, an exported template would offer values its own import would reject.
    department = _multi_dart_department(request)
    return {
        "symptoms": [
            (s.id, s.symptom_code or "")
            for s in ChMasterSymptoms.objects.order_by("symptom_code").distinct(
                "symptom_code"
            )
        ],
        "severity": [
            (s.id, s.severity_name or "") for s in MSeverity.objects.filter(active=1)
        ],
        "assistance": [
            (s.required_assistance_id, s.required_assistance_for or "")
            for s in MRequiredAssistance.objects.all().distinct(
                "required_assistance_for"
            )
        ],
        "remarks": [
            (s.id, s.description or "")
            for s in ChMasterShipRemarksBy.objects.all().distinct()
        ],
        "department": department,
    }


def _multi_dart_get_draft(request, draft_id):
    # Code written by Unknown: a draft is only ever reachable through its own department, so the
    # scoping is applied in the lookup rather than trusted to each caller.
    return (
        MultiDartDraft.objects.filter(
            id=draft_id, department=_multi_dart_department(request), is_delete=False
        )
        .select_related("locked_by")
        .first()
    )


def _multi_dart_issue_number(department, taken):
    # Code written by Unknown: issue one real DART number.
    #
    # The first move mirrors initiate_dart exactly - find the department's last row the same way it
    # does, and hand it to generate_dart_number - so a DART raised here is numbered by the same code
    # path as one raised on the single form. What is ADDED is the guard after it: keep stepping while
    # the number is already taken, either by a row in the database or by an earlier row in this very
    # batch. Without it, two rows in one save would collide (both would read the same "last" row,
    # since neither is committed yet), and a number another user grabbed a second ago would be reused.
    last_entry = (
        InitiateDart.objects.filter(department_id=department)
        .order_by("-dart_number")
        .first()
    )
    candidate = generate_dart_number(
        department.name if department else "X",
        "Defect",
        last_entry if last_entry else [],
    )
    prefix, _, tail = candidate.rpartition("-")
    number = int(tail) if tail.isdigit() else 50000
    while True:
        proposed = f"{prefix}-{number}"
        if (
            proposed not in taken
            and not InitiateDart.objects.filter(dart_number=proposed).exists()
        ):
            taken.add(proposed)
            return proposed
        number += 1


class MultiDartAPIView(APIView):
    # permission_classes = [IsAuthepnticated]

    def get(self, request):
        # Same logic as original view
        # Equipment list (Same logic as AddDartMetadataAPIView)
        raw_shipeq = (
            ShipEquipment.objects.select_related("equipment", "sub_department_f_key")
            .all()
            .order_by("nomenclature")
        )
        seen_eq_ids = set()
        ec_code = []
        for se in raw_shipeq:
            eq_key = se.equipment_id if se.equipment_id else f"se_{se.id}"
            if eq_key not in seen_eq_ids:
                seen_eq_ids.add(eq_key)
                ec_code.append(se)

        # Symptom list
        symptom_list = ChMasterSymptoms.objects.order_by("symptom_code").distinct(
            "symptom_code"
        )

        # Severity list
        severity_list = MSeverity.objects.filter(active=1)

        # Remark list
        remark_list = ChMasterShipRemarksBy.objects.all().distinct()

        # Assistance list
        assistance_list = MRequiredAssistance.objects.all().distinct(
            "required_assistance_for"
        )

        # Same JSON data structure as original view
        symptom_json = [
            {"id": s.id, "label": s.symptom_code or ""} for s in symptom_list
        ]

        severity_json = [
            {"id": s.id, "label": s.severity_name or ""} for s in severity_list
        ]

        assistance_json = [
            {"id": s.required_assistance_id, "label": s.required_assistance_for or ""}
            for s in assistance_list
        ]

        remark_json = [{"id": s.id, "label": s.description or ""} for s in remark_list]

        equipment_json = [
            {
                "code": e.equipment.equipment_code,
                "label": (
                    f"{e.equipment.equipment_code}-{e.equipment.equipment_class}"
                    if e.equipment.equipment_class
                    else e.equipment.equipment_code
                ),
            }
            for e in ec_code
            if e.equipment and e.equipment.equipment_code
        ]

        # Refit period
        refit_period = RefitMaintenancePeriod.objects.filter(maintenance_period="REFIT")

        # Operational period
        ops_period = RefitMaintenancePeriod.objects.filter(
            maintenance_period="OPERATIONAL"
        )

        # Draft rows - existing logic reused exactly
        draft_rows = _multi_dart_draft_rows(request)

        # API response
        data = {
            "symptom_list": symptom_json,
            "severity_list": severity_json,
            "assistance_list": assistance_json,
            "remark_list": remark_json,
            "equipment_list": equipment_json,
            "refit_period": list(refit_period.values()),
            "ops_period": list(ops_period.values()),
            "draft_rows": draft_rows,
            "lock_minutes": MULTI_DART_LOCK_MINUTES,
        }

        return Response(data)


class MultiDartEquipmentRowsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Same department logic
        department = _multi_dart_department(request)

        # Same JSON body parsing logic
        try:
            # request.data is already parsed by DRF in normal cases,
            # but keeping JSON parsing behavior close to the original.
            if isinstance(request.data, dict):
                body = request.data
            else:
                body = json.loads(request.body.decode("utf-8") or "{}")

        except (ValueError, UnicodeDecodeError):
            return Response(
                {"success": False, "error": "Could not read the request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        selections = body.get("selections") or []
        prefix = _multi_dart_prefix(department)

        # "Add Row" -> generate one blank row with next DART number
        if body.get("blank"):
            floor = 0

            for existing in body.get("existing_numbers") or []:
                floor = max(floor, _multi_dart_number_tail(existing, prefix))

            _, numbers = _multi_dart_temp_numbers(department, 1, floor=floor)

            return Response(
                {"success": True, "rows": [{"dart_number": numbers[0]}], "count": 1},
                status=status.HTTP_200_OK,
            )

        # Equipment selection validation
        if not selections:
            return Response(
                {"success": False, "error": "Pick at least one equipment first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Continue numbering after existing rows
        floor = 0

        for existing in body.get("existing_numbers") or []:
            floor = max(floor, _multi_dart_number_tail(existing, prefix))

        # Resolve every selected equipment before generating numbers
        resolved = []

        for selection in selections:
            try:
                wanted = int(selection.get("count") or 0)
            except (TypeError, ValueError):
                wanted = 0

            if wanted < 1:
                continue

            equip_id = selection.get("nomenclature_id") or selection.get("id")
            equip_code = selection.get("equipment_code") or selection.get("code")

            ship_equipment = None
            if equip_id:
                ship_equipment = (
                    ShipEquipment.objects.filter(id=equip_id)
                    .select_related("equipment", "sub_department_f_key")
                    .first()
                )
            if not ship_equipment and equip_code:
                ship_equipment = (
                    ShipEquipment.objects.filter(
                        Q(equipment__equipment_code=equip_code)
                        | Q(equipment_code=equip_code)
                    )
                    .select_related("equipment", "sub_department_f_key")
                    .first()
                )

            if ship_equipment:
                details = _multi_dart_ship_equipment(ship_equipment)
            else:
                code_str = str(equip_code or "")
                details = {
                    "nomenclature_id": None,
                    "nomenclature": "",
                    "sub_department": "",
                    "equipment_code": code_str,
                    "equipment_class": code_str,
                }

            resolved.append((details, wanted))

        # No valid equipment/count found
        if not resolved:
            return Response(
                {
                    "success": False,
                    "error": ("Enter how many DARTs you want against each equipment."),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Calculate total DART rows required
        total = sum(wanted for _, wanted in resolved)

        # Generate temporary DART numbers
        _, numbers = _multi_dart_temp_numbers(department, total, floor=floor)

        # Build response rows
        rows = []
        index = 0

        for details, wanted in resolved:
            for _ in range(wanted):
                row = dict(details)
                row["dart_number"] = numbers[index]
                rows.append(row)
                index += 1

        # Final response
        return Response(
            {"success": True, "rows": rows, "count": len(rows)},
            status=status.HTTP_200_OK,
        )


MULTI_DART_SHEET = "DART_Import"
MULTI_DART_HEADERS = [
    "S No",
    "Equipment Name (Equipment Code)",
    "Equipment Nomenclature",
    "Defect Date (YYYY-MM-DD)",
    "Scheduled Date (YYYY-MM-DD)",
    "Symptoms",
    "Severity",
    "Required Assistance For",
    "Defective Component",
    "Defect Description",
    "SS Remarks (Resolved By)",
    "Spares Required",
]


class MultiDartDownloadTemplateAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # ============================================================
        # Parse posted rows
        # ============================================================
        try:
            rows_data = request.data.get("rows", "[]")

            if isinstance(rows_data, str):
                posted = json.loads(rows_data or "[]")

            elif isinstance(rows_data, list):
                posted = rows_data

            else:
                posted = []

        except (ValueError, TypeError):
            posted = []

        # ============================================================
        # Get master lists and department
        # ============================================================
        masters = _multi_dart_master_lists(request)

        req_dept_id = (
            request.data.get("department_id")
            or request.query_params.get("department_id")
            or request.data.get("department")
            or request.query_params.get("department")
        )
        if req_dept_id:
            try:
                department = Department.objects.filter(id=int(req_dept_id)).first()
            except (ValueError, TypeError):
                department = masters["department"]
        else:
            department = masters["department"]

        # ============================================================
        # Get blank rows
        # ============================================================
        try:
            blank_rows = int(request.data.get("blank_rows") or 0)

        except (TypeError, ValueError):
            blank_rows = 0

        if not posted:
            blank_rows = max(
                1, min(blank_rows or 25, MULTI_DART_VALIDATION_LAST_ROW - 1)
            )

        # ============================================================
        # Get equipment for current department
        # ============================================================
        equipment_codes = []

        seen_codes = set()

        code_to_display = {}

        # ------------------------------------------------------------
        # MAIN MAPPING
        #
        # Equipment Code -> Nomenclature list
        #
        # Example:
        #
        # EQ001 -> [FGTR, AGTR]
        # EQ002 -> [ENGINE ROOM, AUX ROOM]
        # ------------------------------------------------------------
        equipment_nomenclature_map = {}

        if (
            department
            and ShipEquipment.objects.filter(
                department=department, equipment__isnull=False
            ).exists()
        ):
            ship_equipment_queryset = (
                ShipEquipment.objects.filter(
                    department=department, equipment__isnull=False
                )
                .select_related("equipment")
                .order_by("nomenclature")
            )
        else:
            ship_equipment_queryset = (
                ShipEquipment.objects.filter(equipment__isnull=False)
                .select_related("equipment")
                .order_by("nomenclature")
            )

        for se in ship_equipment_queryset:
            if not se.equipment:
                continue

            # ========================================================
            # Actual equipment code
            # ========================================================
            code = (se.equipment.equipment_code if se.equipment else "") or ""

            code = code.strip()

            # ========================================================
            # Equipment class/name
            # ========================================================
            code_name = (se.equipment.equipment_class if se.equipment else "") or ""

            code_name = code_name.strip()

            # ========================================================
            # Nomenclature
            # ========================================================
            nom = (se.nomenclature or "").strip()

            if not code:
                continue

            # ========================================================
            # Display label
            #
            # Example:
            #
            # PUMP (EQ001)
            # ========================================================
            display = "%s (%s)" % (code_name, code) if code_name else code

            # ========================================================
            # Equipment dropdown list
            # ========================================================
            if code not in seen_codes:
                seen_codes.add(code)

                equipment_codes.append(display)

                code_to_display[code] = display

            # ========================================================
            # Equipment Code -> Nomenclature
            # ========================================================
            if nom:
                if code not in equipment_nomenclature_map:
                    equipment_nomenclature_map[code] = []

                if nom not in equipment_nomenclature_map[code]:
                    equipment_nomenclature_map[code].append(nom)

        # ============================================================
        # Sort equipment
        # ============================================================
        equipment_codes.sort()

        # ============================================================
        # Sort nomenclatures
        # ============================================================
        for code in equipment_nomenclature_map:
            equipment_nomenclature_map[code].sort()

        # ============================================================
        # Map master IDs to labels
        # ============================================================
        label_for = {
            "symptom": {str(pk): label for pk, label in masters["symptoms"]},
            "severity": {str(pk): label for pk, label in masters["severity"]},
            "assistance": {str(pk): label for pk, label in masters["assistance"]},
            "remark": {str(pk): label for pk, label in masters["remarks"]},
        }

        # ============================================================
        # Create Workbook
        # ============================================================
        wb = Workbook()

        # ============================================================
        # Instructions Sheet
        # ============================================================
        ws_help = wb.active

        ws_help.title = "Instructions"

        ws_help.column_dimensions["B"].width = 34
        ws_help.column_dimensions["C"].width = 110

        bold = Font(bold=True)

        title = Font(bold=True, size=14)

        def help_row(r, head, body="", style=None):
            ws_help.cell(row=r, column=2, value=head).font = style or bold

            if body:
                cell = ws_help.cell(row=r, column=3, value=body)

                cell.alignment = Alignment(wrap_text=True, vertical="top")

        help_row(2, "SWMM - Multiple DART Import Template", "", title)

        help_row(
            4,
            "What this file is for",
            "One row is one DART. Fill the DART_Import sheet, "
            "then import it on the Multiple DARTs page in "
            "Op. Maintenance under Defects.",
        )

        if posted:
            help_row(
                5,
                "This copy carries your grid",
                "Every row and every value currently on the "
                "Multiple DARTs page has been written into "
                "this file. Edit it here and import it back, "
                "and the page will match it again.",
            )

        else:
            help_row(
                5,
                "This copy is blank",
                "%d empty rows are ready to fill, numbered "
                "for you. You do not need to open the "
                "application again until you import it." % blank_rows,
            )

        help_row(7, "SHEETS")

        help_row(
            8,
            "DART_Import",
            "The only sheet the import reads. Headers are "
            "on row 1 and data starts on row 2.",
        )

        help_row(
            9,
            "Lists",
            "Holds the drop down values, including every "
            "equipment your department holds on this ship. "
            "Do not rename or reorder its columns.",
        )

        help_row(11, "HOW TO USE")

        help_row(
            12,
            "Step 1",
            "Fill one row per DART. Select Equipment Name "
            "(Equipment Code) from the dropdown.",
        )

        help_row(
            13,
            "Step 2",
            "After selecting Equipment Name, Equipment "
            "Nomenclature dropdown will show only the "
            "nomenclatures belonging to that equipment.",
        )

        help_row(
            14,
            "Step 3",
            "Equipment Name and Equipment Nomenclature "
            "dropdowns work offline after the Excel file "
            "has been downloaded.",
        )

        help_row(15, "Step 4", "Save the file, then click Import Excel on the page.")

        help_row(17, "RULES")

        help_row(
            18, "Dates", "Enter as text in the form YYYY-MM-DD, for example 2026-08-16."
        )

        help_row(
            19,
            "S No",
            "Just a row number, so the page can point you at a particular row.",
        )

        help_row(
            20,
            "DART No",
            "Not in this file, and not something you fill "
            "in. Every row is given its DART number on the "
            "page.",
        )

        help_row(
            21,
            "Equipment Nomenclature",
            "Nomenclature is filtered according to the "
            "selected Equipment Name (Equipment Code).",
        )

        help_row(
            22,
            "Spares Required",
            "No by default. Yes makes the page offer a "
            "Link Spares button for that row after import.",
        )

        help_row(
            23,
            "Maintenance period and occasion",
            "Not held in this file. They are asked once "
            "on the page for the whole batch.",
        )

        help_row(
            24,
            "Row count",
            "The number you type in the import popup must "
            "equal the number of rows you have actually "
            "filled in on DART_Import.",
        )

        help_row(
            25,
            "Photograph",
            "Not supported by the import. Attach "
            "photographs from the application after the "
            "DARTs are raised.",
        )

        help_row(27, "POINTS TO NOTE")

        help_row(
            28,
            "Names are resolved on import",
            "The application stores master row identifiers. "
            "This file carries the visible names, so the "
            "import resolves each name back to its master row.",
        )

        help_row(
            29,
            "Offline Equipment Nomenclature",
            "Equipment-to-nomenclature mapping is stored "
            "inside this Excel file, so no API call is "
            "required when selecting a nomenclature.",
        )

        # ============================================================
        # DART_Import Sheet
        # ============================================================
        ws = wb.create_sheet(MULTI_DART_SHEET)

        header_fill = PatternFill("solid", fgColor="FF1F3864")

        header_font = Font(bold=True, color="FFFFFFFF")

        seed_fill = PatternFill("solid", fgColor="FFFFF2CC")

        # ============================================================
        # Headers
        # ============================================================
        for col, name in enumerate(MULTI_DART_HEADERS, start=1):
            cell = ws.cell(row=1, column=col, value=name)

            cell.fill = header_fill

            cell.font = header_font

            cell.alignment = Alignment(
                horizontal="center", vertical="center", wrap_text=True
            )

        # ============================================================
        # Widths
        # ============================================================
        widths = {
            "A": 7,
            "B": 30,
            "C": 28,
            "D": 20,
            "E": 22,
            "F": 32,
            "G": 30,
            "H": 30,
            "I": 26,
            "J": 46,
            "K": 30,
            "L": 15,
        }

        for letter, width in widths.items():
            ws.column_dimensions[letter].width = width

        ws.freeze_panes = "B2"

        # ============================================================
        # Populate posted grid data
        # ============================================================
        if posted:

            def resolve_label(val, label_map):
                if not val:
                    return ""
                val_str = str(val).strip()
                if val_str in label_map:
                    return label_map[val_str]
                for pk, lbl in label_map.items():
                    if str(lbl).strip().lower() == val_str.lower():
                        return lbl
                return val_str

            for i, row in enumerate(posted):
                r = i + 2

                nom_id = (
                    row.get("nomenclature_id")
                    or row.get("equipment_id")
                    or row.get("nomenclature")
                    or row.get("equipment_ship_id")
                )

                se_obj = None
                if nom_id:
                    if str(nom_id).isdigit():
                        se_obj = (
                            ShipEquipment.objects.filter(id=int(nom_id))
                            .select_related("equipment")
                            .first()
                        )
                    if not se_obj and isinstance(nom_id, str):
                        se_obj = (
                            ShipEquipment.objects.filter(
                                nomenclature__iexact=nom_id.strip()
                            )
                            .select_related("equipment")
                            .first()
                        )

                if se_obj:
                    eq_code = (
                        se_obj.equipment.equipment_code if se_obj.equipment else ""
                    ) or ""
                    eq_class = (
                        se_obj.equipment.equipment_class if se_obj.equipment else ""
                    ) or ""
                    display_name = (
                        "%s (%s)" % (eq_class, eq_code) if eq_class else eq_code
                    )
                    nom_name = se_obj.nomenclature or ""
                else:
                    raw_code = (
                        row.get("equipment_code")
                        or row.get("equipmentCode")
                        or row.get("eqpt_code")
                        or ""
                    ).strip()
                    display_name = code_to_display.get(raw_code, raw_code)
                    nom_name = (
                        row.get("nomenclature")
                        or row.get("equipment_nomenclature")
                        or ""
                    )

                spares_val = (
                    str(
                        row.get("spares_required")
                        or row.get("spares")
                        or row.get("sparesRequest")
                        or ""
                    )
                    .strip()
                    .lower()
                )

                values = [
                    i + 1,
                    display_name,
                    nom_name,
                    row.get("defect_date") or row.get("defectDate") or "",
                    row.get("scheduled_date") or row.get("scheduledDate") or "",
                    resolve_label(
                        row.get("symptom_id")
                        or row.get("symptoms")
                        or row.get("symptom"),
                        label_for["symptom"],
                    ),
                    resolve_label(
                        row.get("severity_id") or row.get("severity"),
                        label_for["severity"],
                    ),
                    resolve_label(
                        row.get("assistance_id")
                        or row.get("assistance")
                        or row.get("requiredAssistance"),
                        label_for["assistance"],
                    ),
                    row.get("component")
                    or row.get("defective_component")
                    or row.get("defectiveComponent")
                    or "",
                    row.get("description")
                    or row.get("defect_description")
                    or row.get("defectDescription")
                    or "",
                    resolve_label(
                        row.get("remark_id")
                        or row.get("ssRemarks")
                        or row.get("ss_remarks")
                        or row.get("remarks"),
                        label_for["remark"],
                    ),
                    "Yes" if spares_val in ("yes", "true", "1") else "No",
                ]

                for col, value in enumerate(values, start=1):
                    cell = ws.cell(row=r, column=col, value=value)

                    cell.fill = seed_fill

        # ============================================================
        # Generic blank template
        # ============================================================
        else:
            for i in range(blank_rows):
                r = i + 2

                ws.cell(row=r, column=1, value=i + 1)

                ws.cell(row=r, column=12, value="No")

                for col in range(1, len(MULTI_DART_HEADERS) + 1):
                    ws.cell(row=r, column=col).fill = seed_fill

        # ============================================================
        # Lists Sheet
        # ============================================================
        ws_lists = wb.create_sheet("Lists")

        columns = [
            ("Equipment Code", equipment_codes),
            ("Symptoms", [label for _, label in masters["symptoms"]]),
            ("Severity", [label for _, label in masters["severity"]]),
            ("Required Assistance For", [label for _, label in masters["assistance"]]),
            ("SS Remarks", [label for _, label in masters["remarks"]]),
            ("Spares Required", ["No", "Yes"]),
        ]

        for idx, (heading, values) in enumerate(columns, start=1):
            ws_lists.cell(row=1, column=idx, value=heading).font = bold

            ws_lists.column_dimensions[get_column_letter(idx)].width = max(
                18, min(46, len(heading) + 8)
            )

            for r, value in enumerate(values, start=2):
                ws_lists.cell(row=r, column=idx, value=value)

        # ============================================================
        # Equipment Display -> Named Range Mapping
        #
        # G = Equipment Display
        # H = Nomenclature Range Name
        #
        # Example:
        #
        # G2 = PUMP (EQ001)
        # H2 = NOM_EQ001
        # ============================================================

        ws_lists.cell(row=1, column=7, value="Equipment Display").font = bold

        ws_lists.cell(row=1, column=8, value="Nomenclature Range").font = bold

        ws_lists.column_dimensions["G"].width = 40

        ws_lists.column_dimensions["H"].width = 30

        # ============================================================
        # Hidden sheet containing actual nomenclatures
        # ============================================================

        ws_nomenclature = wb.create_sheet("_EquipmentNomenclature")

        mapping_row = 2

        for col_index, (code, nom_list) in enumerate(
            sorted(equipment_nomenclature_map.items()), start=1
        ):
            if not nom_list:
                continue

            col_letter = get_column_letter(col_index)

            # --------------------------------------------------------
            # Make Excel-safe named range
            # --------------------------------------------------------

            safe_code = "".join(ch if ch.isalnum() else "_" for ch in str(code))

            range_name = "NOM_" + safe_code

            # --------------------------------------------------------
            # Put actual equipment code in hidden sheet
            # --------------------------------------------------------

            ws_nomenclature.cell(row=1, column=col_index, value=code)

            # --------------------------------------------------------
            # Put nomenclatures
            # --------------------------------------------------------

            for row_index, nom in enumerate(nom_list, start=2):
                ws_nomenclature.cell(row=row_index, column=col_index, value=nom)

            # --------------------------------------------------------
            # Named range
            # --------------------------------------------------------

            end_row = len(nom_list) + 1

            wb.defined_names.add(
                DefinedName(
                    range_name,
                    attr_text=(
                        "'_EquipmentNomenclature'!"
                        f"${col_letter}$2:"
                        f"${col_letter}${end_row}"
                    ),
                )
            )

            # --------------------------------------------------------
            # Equipment display
            # --------------------------------------------------------

            display = code_to_display.get(code, code)

            # --------------------------------------------------------
            # Save display -> named range mapping
            # --------------------------------------------------------

            ws_lists.cell(row=mapping_row, column=7, value=display)

            ws_lists.cell(row=mapping_row, column=8, value=range_name)

            mapping_row += 1

        # ============================================================
        # Hide nomenclature helper sheet
        # ============================================================

        ws_nomenclature.sheet_state = "hidden"

        # ============================================================
        # Defined Names
        # ============================================================

        def add_name(name, ref):
            wb.defined_names.add(DefinedName(name, attr_text=ref))

        # ============================================================
        # Equipment Codes
        # ============================================================

        add_name(
            "EquipmentCodes",
            "OFFSET(Lists!$A$2,0,0,MAX(1,COUNTA(Lists!$A$2:$A$500)),1)",
        )

        # ============================================================
        # Symptoms
        # ============================================================

        add_name(
            "SymptomList", "Lists!$B$2:$B$%d" % (1 + max(1, len(masters["symptoms"])))
        )

        # ============================================================
        # Severity
        # ============================================================

        add_name(
            "SeverityList", "Lists!$C$2:$C$%d" % (1 + max(1, len(masters["severity"])))
        )

        # ============================================================
        # Assistance
        # ============================================================

        add_name(
            "AssistanceList",
            "Lists!$D$2:$D$%d" % (1 + max(1, len(masters["assistance"]))),
        )

        # ============================================================
        # Remarks
        # ============================================================

        add_name(
            "SSRemarksList", "Lists!$E$2:$E$%d" % (1 + max(1, len(masters["remarks"])))
        )

        # ============================================================
        # Yes / No
        # ============================================================

        add_name("YesNoList", "Lists!$F$2:$F$3")

        # ============================================================
        # Equipment Name Dropdown - Column B
        # ============================================================

        equipment_validation = DataValidation(
            type="list", formula1="=EquipmentCodes", allow_blank=True
        )

        equipment_validation.error = "Please select an equipment from the dropdown."

        equipment_validation.errorTitle = "Invalid Equipment"

        equipment_validation.showErrorMessage = True

        equipment_validation.showInputMessage = True

        equipment_validation.promptTitle = "Equipment"

        equipment_validation.prompt = "Select Equipment Name (Equipment Code)."

        ws.add_data_validation(equipment_validation)

        equipment_validation.add("B2:B%d" % MULTI_DART_VALIDATION_LAST_ROW)

        # ============================================================
        # Hidden Helper Column M
        #
        # B2 = PUMP (EQ001)
        # M2 = NOM_EQ001
        #
        # B3 = MOTOR (EQ002)
        # M3 = NOM_EQ002
        # ============================================================

        ws.column_dimensions["M"].hidden = True

        for row_number in range(2, MULTI_DART_VALIDATION_LAST_ROW + 1):
            ws.cell(
                row=row_number,
                column=13,
                value=(
                    f"=IFERROR(VLOOKUP(B{row_number},'Lists'!$G$2:$H$500,2,FALSE),\"\")"
                ),
            )

        # ============================================================
        # Equipment Nomenclature Dropdown - Column C
        #
        # This is the DEPENDENT dropdown.
        #
        # M2 gives named range:
        # NOM_EQ001
        #
        # C2 uses:
        # =INDIRECT($M2)
        # ============================================================

        for row_number in range(2, MULTI_DART_VALIDATION_LAST_ROW + 1):
            nomenclature_validation = DataValidation(
                type="list", formula1=(f"=INDIRECT($M{row_number})"), allow_blank=True
            )

            nomenclature_validation.error = "Please select Equipment Name first."

            nomenclature_validation.errorTitle = "Select Equipment"

            nomenclature_validation.showErrorMessage = True

            nomenclature_validation.showInputMessage = True

            nomenclature_validation.promptTitle = "Equipment Nomenclature"

            nomenclature_validation.prompt = (
                "Select nomenclature for the selected equipment."
            )

            ws.add_data_validation(nomenclature_validation)

            nomenclature_validation.add(f"C{row_number}")

        # ============================================================
        # Other Dropdown Validations
        #
        # NOTE:
        # C is intentionally NOT here because C is now dependent.
        # ============================================================

        validation_columns = [
            ("F", "SymptomList"),
            ("G", "SeverityList"),
            ("H", "AssistanceList"),
            ("K", "SSRemarksList"),
            ("L", "YesNoList"),
        ]

        for column_letter, list_name in validation_columns:
            dv = DataValidation(
                type="list", formula1="=%s" % list_name, allow_blank=True
            )

            ws.add_data_validation(dv)

            dv.add(
                "%s2:%s%d"
                % (column_letter, column_letter, MULTI_DART_VALIDATION_LAST_ROW)
            )

        # ============================================================
        # Save workbook
        # ============================================================

        buffer = io.BytesIO()

        wb.save(buffer)

        buffer.seek(0)

        # ============================================================
        # Return Excel file
        # ============================================================

        response = HttpResponse(
            buffer.getvalue(),
            content_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
        )

        response["Content-Disposition"] = (
            'attachment; filename="SWMM_Multiple_DART_Import_Template.xlsx"'
        )

        return response


class MultiDartImportExcelAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # ============================================================
        # Get uploaded Excel file
        # ============================================================
        upload = request.FILES.get("file")

        if not upload:
            return Response(
                {"success": False, "error": "Choose the filled template first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ============================================================
        # Get declared count
        # ============================================================
        try:
            declared = int(request.data.get("declared_count") or 0)

        except (TypeError, ValueError):
            declared = 0

        # ============================================================
        # Open Excel workbook
        # ============================================================
        try:
            wb = load_workbook(upload, data_only=True, read_only=True)

        except Exception:
            return Response(
                {
                    "success": False,
                    "error": ("That file could not be opened as an Excel workbook."),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ============================================================
        # Check required sheet
        # ============================================================
        if MULTI_DART_SHEET not in wb.sheetnames:
            return Response(
                {
                    "success": False,
                    "error": (
                        'This workbook has no "%s" sheet. '
                        "Download the template and fill that, "
                        "rather than building a sheet by hand." % MULTI_DART_SHEET
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ============================================================
        # Read sheet
        # ============================================================
        ws = wb[MULTI_DART_SHEET]

        grid = list(ws.iter_rows(values_only=True))

        if not grid:
            return Response(
                {
                    "success": False,
                    "error": ("The %s sheet is empty." % MULTI_DART_SHEET),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ============================================================
        # Normalize headers
        # ============================================================
        header = [_norm(h) for h in grid[0]]

        def col(name):
            target = _norm(name)

            return header.index(target) if target in header else None

        # ============================================================
        # Find columns by HEADER NAME
        # ============================================================
        idx = {
            key: col(name)
            for key, name in [
                ("s_no", "S No"),
                ("equipment", "Equipment Name (Equipment Code)"),
                ("nomenclature", "Equipment Nomenclature"),
                ("defect_date", "Defect Date (YYYY-MM-DD)"),
                ("scheduled_date", "Scheduled Date (YYYY-MM-DD)"),
                ("symptom", "Symptoms"),
                ("severity", "Severity"),
                ("assistance", "Required Assistance For"),
                ("component", "Defective Component"),
                ("description", "Defect Description"),
                ("remark", "SS Remarks (Resolved By)"),
                ("spares", "Spares Required"),
            ]
        }

        # ============================================================
        # Check missing required columns
        # ============================================================
        missing = [k for k, v in idx.items() if v is None]

        if missing:
            return Response(
                {
                    "success": False,
                    "error": (
                        "The %s sheet is missing these columns: %s. "
                        "Download a fresh template."
                        % (MULTI_DART_SHEET, ", ".join(missing))
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ============================================================
        # Read cell safely
        # ============================================================
        def cell(raw_row, key):
            position = idx[key]

            if position is None or position >= len(raw_row):
                return ""

            value = raw_row[position]

            if value is None:
                return ""

            if hasattr(value, "strftime"):
                return value.strftime("%Y-%m-%d")

            return str(value).strip()

        # ============================================================
        # Find filled rows
        #
        # S No and Spares Required deliberately NOT considered
        # when deciding whether a row is filled.
        # ============================================================
        filled = []

        for raw in grid[1:]:
            if not raw:
                continue

            if any(
                cell(raw, k)
                for k in ("equipment", "nomenclature", "defect_date", "description")
            ):
                filled.append(raw)

        # ============================================================
        # Validate declared count
        # ============================================================
        if declared != len(filled):
            return Response(
                {
                    "success": False,
                    "error": (
                        "You entered %d, but the file holds %d "
                        "filled row%s. Nothing has been imported "
                        "- check the number and try again."
                        % (declared, len(filled), "" if len(filled) == 1 else "s")
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ============================================================
        # Get master lists and department
        # ============================================================
        masters = _multi_dart_master_lists(request)

        req_dept_id = (
            request.data.get("department_id")
            or request.query_params.get("department_id")
            or request.data.get("department")
            or request.query_params.get("department")
        )
        if req_dept_id:
            try:
                department = Department.objects.filter(id=int(req_dept_id)).first()
            except (ValueError, TypeError):
                department = masters["department"]
        else:
            department = masters["department"]

        # ============================================================
        # Master name -> primary key lookup
        # ============================================================
        lookup = {
            "symptom": {_norm(label): pk for pk, label in masters["symptoms"]},
            "severity": {_norm(label): pk for pk, label in masters["severity"]},
            "assistance": {_norm(label): pk for pk, label in masters["assistance"]},
            "remark": {_norm(label): pk for pk, label in masters["remarks"]},
        }

        # ============================================================
        # Get ShipEquipment for current department (or all if admin/0 eq)
        # ============================================================
        if (
            department
            and ShipEquipment.objects.filter(
                department=department, equipment__isnull=False
            ).exists()
        ):
            ship_equipment = list(
                ShipEquipment.objects.filter(
                    department=department, equipment__isnull=False
                ).select_related("equipment", "sub_department_f_key")
            )
        else:
            ship_equipment = list(
                ShipEquipment.objects.filter(equipment__isnull=False).select_related(
                    "equipment", "sub_department_f_key"
                )
            )

        # ============================================================
        # Nomenclature -> ShipEquipment lookup
        # First match is deliberately preserved
        # ============================================================
        by_nomenclature = {}

        for se in ship_equipment:
            if se.nomenclature:
                by_nomenclature.setdefault(_norm(se.nomenclature), se)

        # ============================================================
        # Equipment Code -> ShipEquipment lookup
        # Includes:
        #   bare code
        #   Equipment Class (Code)
        # ============================================================
        by_code = {}

        for se in ship_equipment:
            if se.equipment and se.equipment.equipment_code:
                bare_code = se.equipment.equipment_code

                by_code.setdefault(_norm(bare_code), se)

                eq_class = (se.equipment.equipment_class or "").strip()

                if eq_class:
                    by_code.setdefault(_norm("%s (%s)" % (eq_class, bare_code)), se)
                    by_code.setdefault(_norm(eq_class), se)

        # ============================================================
        # Generate temporary DART numbers
        # ============================================================
        _, numbers = _multi_dart_temp_numbers(department, len(filled))

        # ============================================================
        # Build rows
        # ============================================================
        rows = []

        for position, raw in enumerate(filled):
            errors = {}

            nom_text = cell(raw, "nomenclature")

            code_text = cell(raw, "equipment")

            # ========================================================
            # Prefer nomenclature because it uniquely identifies
            # ShipEquipment.
            # Code is only fallback.
            # ========================================================
            se = by_nomenclature.get(_norm(nom_text)) if nom_text else None

            if se is None and code_text:
                se = by_code.get(_norm(code_text))

            if se is None and code_text:
                m = re.search(r"\((\d+)\)", code_text)
                if m:
                    se = by_code.get(_norm(m.group(1)))

            if se is None:
                errors["equipment"] = nom_text or code_text or "(blank)"

            # ========================================================
            # Resolve master text to ID
            # ========================================================
            def resolve(key, text):
                if not text:
                    return ""

                found = lookup[key].get(_norm(text))

                if found is None:
                    errors[key] = text
                    return ""

                return found

            # ========================================================
            # Create row
            # ========================================================
            display_eq = ""
            if se and se.equipment:
                eq_c = se.equipment.equipment_code or ""
                eq_cl = (se.equipment.equipment_class or "").strip()
                display_eq = f"{eq_cl} ({eq_c})" if eq_cl and eq_c else (eq_cl or eq_c)

            dart_no_val = (
                numbers[position]
                if position < len(numbers)
                else f"D-X-{50000 + position + 1}"
            )

            row = {
                "s_no": position + 1,
                "dart_number": dart_no_val,
                "equipment_code": (
                    se.equipment.equipment_code if se and se.equipment else ""
                ),
                "equipment_name": display_eq,
                "nomenclature_id": (se.id if se else ""),
                "nomenclature": (se.nomenclature if se else ""),
                "sub_department": (
                    se.sub_department_f_key.name
                    if (se and se.sub_department_f_key)
                    else ""
                ),
                "defect_date": cell(raw, "defect_date"),
                "scheduled_date": cell(raw, "scheduled_date"),
                "symptom_id": resolve("symptom", cell(raw, "symptom")),
                "severity_id": resolve("severity", cell(raw, "severity")),
                "assistance_id": resolve("assistance", cell(raw, "assistance")),
                "component": cell(raw, "component"),
                "description": cell(raw, "description"),
                "remark_id": resolve("remark", cell(raw, "remark")),
                "spares_required": (
                    "Yes" if _norm(cell(raw, "spares")) == "yes" else "No"
                ),
                "errors": errors,
            }

            rows.append(row)

        # ============================================================
        # Final response
        # ============================================================
        return Response(
            {"success": True, "rows": rows, "count": len(rows)},
            status=status.HTTP_200_OK,
        )


class MultiDartDraftSaveAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Same JSON body parsing logic
        try:
            body = request.data

            # Extra safety: original view expected a JSON object
            if not isinstance(body, dict):
                body = json.loads(request.body.decode("utf-8") or "{}")

        except (ValueError, UnicodeDecodeError):
            return Response(
                {"success": False, "error": "Could not read the request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get and validate draft name
        name = (body.get("name") or "").strip()

        if not name:
            return Response(
                {"success": False, "error": "Give the draft a name."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Same payload structure
        payload = {"rows": body.get("rows") or []}

        # Get existing draft only when draft_id is provided
        draft = (
            _multi_dart_get_draft(request, body.get("draft_id"))
            if body.get("draft_id")
            else None
        )

        user_profile = _multi_dart_user_profile(request.user)

        # ============================================================
        # Update existing draft
        # ============================================================
        if draft:
            draft.name = name
            draft.payload = payload
            draft.last_updated_by = user_profile
            draft.locked_by = user_profile
            draft.locked_at = timezone.now()
            draft.save()

        # ============================================================
        # Create new draft
        # ============================================================
        else:
            draft = MultiDartDraft.objects.create(
                name=name,
                department=_multi_dart_department(request),
                created_by=user_profile,
                last_updated_by=user_profile,
                payload=payload,
                locked_by=user_profile,
                locked_at=timezone.now(),
            )

        # Same response
        return Response(
            {"success": True, "draft_id": draft.id}, status=status.HTTP_200_OK
        )


class MultiDartDraftOpenAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Same logic:
        # Get draft using draft_id from query parameters
        draft = _multi_dart_get_draft(request, request.query_params.get("draft_id"))

        # Draft not found
        if not draft:
            return Response(
                {"success": False, "error": "That draft is no longer available."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Get current lock state
        lock = _multi_dart_lock_state(draft, request.user)

        # If draft is not locked, current user claims the lock
        if not lock["locked"]:
            draft.locked_by = _multi_dart_user_profile(request.user)
            draft.locked_at = timezone.now()

            draft.save(update_fields=["locked_by", "locked_at", "updated_at"])

        # Same response structure
        return Response(
            {
                "success": True,
                "draft": {
                    "id": draft.id,
                    "name": draft.name,
                    "payload": draft.payload or {},
                },
                "locked": lock["locked"],
                "holder_name": lock["holder_name"],
                "since": lock["since"],
            },
            status=status.HTTP_200_OK,
        )


class MultiDartDraftLockAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Same JSON parsing logic
        try:
            body = request.data

            # Original view expects a JSON object
            if not isinstance(body, dict):
                body = json.loads(request.body.decode("utf-8") or "{}")

        except (ValueError, UnicodeDecodeError):
            return Response(
                {"success": False, "error": "Could not read the request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get draft
        draft = _multi_dart_get_draft(request, body.get("draft_id"))

        # Draft not found
        if not draft:
            return Response(
                {"success": False, "error": "That draft is no longer available."},
                status=status.HTTP_404_NOT_FOUND,
            )

        action = body.get("action")
        user_profile = _multi_dart_user_profile(request.user)

        # ============================================================
        # Take over draft lock
        # ============================================================
        if action == "take_over":
            draft.locked_by = user_profile
            draft.locked_at = timezone.now()
            draft.last_updated_by = user_profile

            draft.save(
                update_fields=[
                    "locked_by",
                    "locked_at",
                    "last_updated_by",
                    "updated_at",
                ]
            )

            return Response({"success": True, "taken": True}, status=status.HTTP_200_OK)

        # ============================================================
        # Heartbeat:
        # Refresh lock ONLY when current user already owns it
        # ============================================================
        if draft.locked_by_id == (user_profile.id if user_profile else None):
            draft.locked_at = timezone.now()

            draft.save(update_fields=["locked_at"])

        # Same final response
        return Response({"success": True}, status=status.HTTP_200_OK)


class MultiDartDraftDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Same JSON parsing logic
        try:
            body = request.data

            # Original function expects JSON object
            if not isinstance(body, dict):
                body = json.loads(request.body.decode("utf-8") or "{}")

        except (ValueError, UnicodeDecodeError):
            return Response(
                {"success": False, "error": "Could not read the request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get draft
        draft = _multi_dart_get_draft(request, body.get("draft_id"))

        # Draft not found
        if not draft:
            return Response(
                {"success": False, "error": "That draft is no longer available."},
                status=status.HTTP_404_NOT_FOUND,
            )

        user_profile = _multi_dart_user_profile(request.user)

        # Soft delete - exact original logic
        draft.is_delete = True
        draft.last_updated_by = user_profile

        draft.save(update_fields=["is_delete", "last_updated_by", "updated_at"])

        # Same response
        return Response({"success": True}, status=status.HTTP_200_OK)


class MultiDartSaveRowsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # ============================================================
        # Read JSON request body
        # ============================================================
        try:
            body = request.data

            # Original function expected a JSON object
            if not isinstance(body, dict):
                body = json.loads(request.body.decode("utf-8") or "{}")

        except (ValueError, UnicodeDecodeError):
            return Response(
                {"success": False, "error": "Could not read the request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ============================================================
        # Validate rows
        # ============================================================
        rows = body.get("rows") or []

        if not rows:
            return Response(
                {"success": False, "error": "Tick at least one row before saving."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ============================================================
        # Validate maintenance period and DART occasion
        # ============================================================
        maintenance_period = body.get("maintenance_period") or None

        dart_occasion = body.get("dart_occasion") or None

        if not maintenance_period or not dart_occasion:
            return Response(
                {
                    "success": False,
                    "error": (
                        "Choose the maintenance period and the DART occasion first."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ============================================================
        # Get department
        # ============================================================
        department = _multi_dart_department(request)

        # ============================================================
        # Get refit / ops period
        # ============================================================
        refit_period_obj = None

        period_id = body.get("ops_period_id") or body.get("refit_id")

        if period_id:
            refit_period_obj = RefitMaintenancePeriod.objects.filter(
                id=period_id
            ).first()

        # ============================================================
        # Get ship details
        # ============================================================
        ship_obj = get_this_ship()

        ship_no = (
            ship_obj.code
            if (ship_obj and ship_obj.code)
            else (ship_obj.universal_id_m_ship if ship_obj else "UNKNOWN")
        )

        now = timezone.now()

        # ============================================================
        # Prepare result and DART number tracking
        # ============================================================
        results = []
        taken = set()
        created_darts = []

        try:
            # ========================================================
            # Atomic transaction
            # If ANY row fails -> EVERYTHING rolls back
            # ========================================================
            with transaction.atomic():
                for row in rows:
                    s_no = row.get("s_no")

                    nom_id = (
                        row.get("nomenclature_id")
                        or row.get("equipment_id")
                        or row.get("nomenclature")
                        or row.get("equipment_ship_id")
                        or row.get("equipment_ship")
                    )

                    equipment_obj = None
                    if nom_id:
                        if str(nom_id).isdigit():
                            equipment_obj = ShipEquipment.objects.filter(
                                id=int(nom_id)
                            ).first()
                        if not equipment_obj:
                            equipment_obj = ShipEquipment.objects.filter(
                                nomenclature__iexact=str(nom_id).strip()
                            ).first()

                    if not equipment_obj:
                        raise ValueError(
                            "row %s has no valid equipment nomenclature" % s_no
                        )

                    # ====================================================
                    # Validate defect description
                    # ====================================================
                    if not (row.get("description") or "").strip():
                        raise ValueError("row %s has no defect description" % s_no)

                    # ====================================================
                    # Get EquipmentName
                    # ====================================================
                    equipment_name_obj = EquipmentName.objects.filter(
                        sfd_equipment=equipment_obj
                    ).first()

                    # ====================================================
                    # Issue actual DART number
                    # ====================================================
                    number = _multi_dart_issue_number(department, taken)

                    # ====================================================
                    # Same ID guard as initiate_dart
                    # ====================================================
                    def as_id(value):
                        text = str(value or "")

                        return text if text.isdigit() else None

                    # ====================================================
                    # Create Initiate_Dart
                    # ====================================================
                    dart = InitiateDart.objects.create(
                        department_id=department,
                        equipment_ship=equipment_obj,
                        equipment_ems=equipment_name_obj,
                        dart_number=number,
                        dart_sr_number=(number.split("-")[-1] if number else None),
                        dart_date=(row.get("defect_date") or None),
                        rectification_date=(row.get("scheduled_date") or None),
                        defective_discriptions=(row.get("description")),
                        defective_component=(row.get("component")),
                        trial_required=False,
                        sapres_required=(row.get("spares_required") == "Yes"),
                        maintenance_period=maintenance_period,
                        dart_occasion=dart_occasion,
                        is_ra_initiate=False,
                        symptom_code_id=as_id(row.get("symptom_id")),
                        severity_code_id=as_id(row.get("severity_id")),
                        remark_code_id=as_id(row.get("remark_id")),
                        require_assistance_for_code_id=as_id(row.get("assistance_id")),
                        is_guarantee_defect=False,
                    )

                    # ====================================================
                    # Set Universal ID
                    # ====================================================
                    dart.universal_id_t_dart = (
                        f"SWMM/{ship_no}/"
                        f"{now.strftime('%Y')}/"
                        f"{now.strftime('%m')}/"
                        f"{dart.id}"
                    )

                    # ====================================================
                    # Link maintenance period
                    # ====================================================
                    if refit_period_obj:
                        dart.refit_maintenance_period_f_key = refit_period_obj

                    dart.save()
                    created_darts.append(dart)

                    # ====================================================
                    # Process spares
                    # ====================================================
                    spares = row.get("spares") or {}

                    # ====================================================
                    # OBS Spares
                    # ====================================================
                    for spare in spares.get("obs") or []:
                        spare_row = Spares.objects.filter(
                            pattern_number=spare.get("pattern", "")
                        ).first()
                        if spare_row:
                            DartSpare.objects.update_or_create(
                                dart=dart,
                                spare_id=spare_row.id,
                                equipment_id=equipment_obj,
                                pattern=spare.get("pattern", ""),
                                description=spare.get("description", ""),
                                quantity=int(spare.get("qty", 1) or 1),
                                inventory_type=spare.get("inventory_type", "OBS"),
                            )

                    # ====================================================
                    # PIL Spares
                    # ====================================================
                    for spare in spares.get("pil") or []:
                        spare_row = Spares.objects.filter(
                            pattern_number=spare.get("pattern", "")
                        ).first()

                        if spare_row:
                            DartSpare.objects.update_or_create(
                                dart=dart,
                                spare_id=spare_row.id,
                                equipment_id=equipment_obj,
                                pattern=spare.get("pattern", ""),
                                description=spare.get("description", ""),
                                quantity=int(spare.get("qty", 1) or 1),
                                inventory_type="PIL",
                            )

                    # ====================================================
                    # ILMS Spares
                    # WED -> DartWedSpare
                    # MO  -> DartMOSpare
                    # ====================================================
                    for spare in spares.get("ilms") or []:
                        inventory_type = spare.get("inventory_type", "")

                        pattern = spare.get("pattern", "")

                        description = spare.get("description", "")

                        qty = int(spare.get("qty", 1) or 1)

                        # =================================================
                        # WED Spare
                        # =================================================
                        if inventory_type == "WED":
                            DartWedSpare.objects.update_or_create(
                                dart_id=dart,
                                equipment_id=equipment_obj,
                                wed_spare=(
                                    WLMSSpare.objects.filter(item_code=pattern).first()
                                ),
                                pattern=pattern,
                                description=description,
                                quantity=qty,
                            )

                        # =================================================
                        # MO Spare
                        # =================================================
                        elif inventory_type == "MO":
                            DartMOSpare.objects.update_or_create(
                                dart_id=dart,
                                equipment_id=equipment_obj,
                                mo_spare=(
                                    Item.objects.filter(item_code=pattern).first()
                                ),
                                pattern=pattern,
                                description=description,
                                quantity=qty,
                            )

                    # ====================================================
                    # Store result
                    # ====================================================
                    previewed = row.get("dart_number") or ""

                    results.append(
                        {
                            "rid": row.get("rid"),
                            "s_no": s_no,
                            "dart_number": number,
                            "moved_from": (
                                previewed
                                if (previewed and previewed != number)
                                else None
                            ),
                        }
                    )

                # ========================================================
                # Delete draft when all its rows are successfully raised
                # ========================================================
                draft_deleted = False

                draft_id = body.get("draft_id")

                if draft_id and body.get("remaining_unsaved") in (0, "0", None):
                    draft = _multi_dart_get_draft(request, draft_id)

                    if draft:
                        rows_in_draft = len((draft.payload or {}).get("rows") or [])

                        if rows_in_draft and rows_in_draft == len(rows):
                            draft.is_delete = True

                            draft.save(update_fields=["is_delete", "updated_at"])

                            draft_deleted = True

        # ============================================================
        # Any error -> atomic transaction automatically rolls back
        # ============================================================
        except Exception as exc:
            import traceback

            print(traceback.print_exc())
            return Response(
                {
                    "success": False,
                    "error": (
                        "Nothing was saved - %s. Fix that row and try again." % exc
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ============================================================
        # Auto-push newly created Multi-DARTs to CMMS
        # Mirrors InitiateDartAPIView's auto-push logic
        # ============================================================
        if created_darts:
            try:
                from swmmapi.views import CMMSDartPushAPI

                pusher = CMMSDartPushAPI()
                fresh_darts = list(
                    InitiateDart.objects.filter(
                        id__in=[d.id for d in created_darts]
                    ).select_related(
                        "equipment_ship",
                        "equipment_ship__equipment",
                        "department_id",
                        "symptom_code",
                        "severity_code",
                        "remark_code",
                        "require_assistance_for_code",
                        "refit_maintenance_period_f_key",
                    )
                )
                payloads = {d.id: pusher._dart_payload(d, request) for d in fresh_darts}
                for batch, push_ok, push_reason in pusher._push_batches(
                    request, fresh_darts, payloads
                ):
                    if not push_ok:
                        logger.warning(
                            "Auto-push to CMMS failed for multi-DART batch (%d darts): %s",
                            len(batch),
                            push_reason,
                        )
            except Exception:
                logger.exception("Auto-push to CMMS raised for multi-DARTs.")

        # ============================================================
        # Success response
        # ============================================================
        return Response(
            {"success": True, "rows": results, "draft_deleted": draft_deleted},
            status=status.HTTP_200_OK,
        )


class MultiDartSparesPickerAPIView(APIView):
    def get(self, request):
        if not request.user.is_authenticated:
            return Response(
                {"success": False, "error": "Authentication required."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        department_id = request.user.user_profile.department

        # ============================================================
        # Department Spare Classes
        # ============================================================
        spare_classes = SpareClass.objects.filter(
            department_id=department_id
        ).values_list("id", flat=True)

        # ============================================================
        # Equipment Classes
        # ============================================================
        equipment_classes = EquipmentClass.objects.filter(
            spare_class_id__in=spare_classes
        ).values_list("id", flat=True)

        # ============================================================
        # OBS / Ship Inventory
        # ============================================================
        spare_obj = (
            Spares.objects.filter(equipment_class_id__in=equipment_classes)
            .exclude(
                Q(authority_id__name="B & D", is_obs__isnull=True)
                | Q(authority_id__name="MO ITEM", is_obs__isnull=True)
                | Q(authority_id__name="SHIPYARD ALLOWANCE", is_obs__isnull=True)
                | Q(authority_id__name="MO ALLOWANCE", is_obs__isnull=True)
            )
            .select_related("equipment_class", "authority")
        )

        obs_spares = [
            {
                "id": spare.id,
                "equipment_class": {
                    "id": spare.equipment_class.id if spare.equipment_class else None,
                    "name": spare.equipment_class.name if spare.equipment_class else "",
                },
                "pattern_number": spare.pattern_number,
                "description": spare.description,
                "category": spare.category,
                "authority": {
                    "id": spare.authority.id if spare.authority else None,
                    "name": spare.authority.name if spare.authority else "",
                },
            }
            for spare in spare_obj
        ]

        # ============================================================
        # OEM PIL Spares
        # ============================================================
        oem_pil_queryset = Spares.objects.filter(
            authority__name="PIL", equipment_class__name="SPARES PIL"
        ).select_related("denomination")

        oem_pil_spares = [
            {
                "id": spare.id,
                "pattern_number": spare.pattern_number,
                "description": spare.description,
                "denomination": {
                    "id": spare.denomination.id if spare.denomination else None,
                    "name": spare.denomination.name if spare.denomination else "",
                },
            }
            for spare in oem_pil_queryset
        ]

        # ============================================================
        # Denominations
        # ============================================================
        denominations = list(
            Denomination.objects.filter(department_id=department_id).values(
                "id", "name"
            )
        )

        return Response(
            {
                "success": True,
                "obs_spares": obs_spares,
                "ilms_objs": ItemExtra.objects.all(),
                "oem_pil_spares": oem_pil_spares,
                "denominations": denominations,
            },
            status=status.HTTP_200_OK,
        )


# class GetEquipmentObjectsAPIView(APIView):
#     permission_classes = [IsAuthenticated]

#     def get(self, request):
#         code = request.GET.get("code")

#         try:
#             # Get the equipment object
#             equipment = Equipment.objects.get(equipment_code=code)

#             # Get related ShipEquipment objects
#             ship_eq_obj = ShipEquipment.objects.filter(
#                 equipment__equipment_code=equipment.equipment_code
#             )

#             # Build the list of objects
#             list1 = []

#             for obj in ship_eq_obj:
#                 list1.append({
#                     "id": obj.id,
#                     "nomenclature": obj.nomenclature,
#                 })

#             # Return data
#             data = {
#                 "ship_equipments": list1
#             }

#             return Response(data, status=status.HTTP_200_OK)

#         except Equipment.DoesNotExist:
#             return Response(
#                 {"error": "Not found"},
#                 status=status.HTTP_404_NOT_FOUND
#             )
