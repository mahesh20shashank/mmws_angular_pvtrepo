from .filters import (
    ClosedDartsReportFilter,
    DartsReportFilter,
    GuaranteeMonitoringReportFilter,
    RaStatusReportFilter,
    ServiceRequiredReportFilter,
    SparesConsumedReportFilter,
)
from .models import (
    DefectSpareTransaction,
    DefectTransaction,
    EquipmentGuarantee,
    RequestAssistance,
)
from .serializers import (
    ClosedDartsReportSerializer,
    DartsReportSerializer,
    GuaranteeMonitoringReportSerializer,
    RaStatusReportSerializer,
    ServiceRequiredReportSerializer,
    SparesConsumedReportSerializer,
)


from django.db.models import Q


def darts_report_queryset():
    return (
        DefectTransaction.objects.filter(Q(is_closed=False) | Q(is_closed__isnull=True))
        .exclude(status__iexact="CLOSED")
        .select_related("equipment_ems", "severity_code", "require_assistance_for_code")
        .order_by("-dart_date", "-pk")
    )


def closed_darts_report_queryset():
    return (
        DefectTransaction.objects.filter(Q(is_closed=True) | Q(status__iexact="CLOSED"))
        .select_related("equipment_ems", "severity_code", "require_assistance_for_code")
        .order_by("-rectification_date", "-pk")
    )


def service_required_report_queryset():
    return (
        DefectTransaction.objects.filter(
            Q(defect_type="SERVICE")
            | Q(service_fkey__isnull=False)
            | Q(require_assistance_for_code__isnull=False)
        )
        .select_related("service_fkey", "department_id")
        .order_by("-dart_date", "-pk")
    )


def guarantee_report_query():
    return (
        EquipmentGuarantee.objects.filter(
            Q(is_guarantee_defect=True) | Q(defect_type="GUARANTEE")
        )
        .select_related("equipment_ems")
        .order_by("-pk")
    )


def spares_report_query():
    return DefectSpareTransaction.objects.all().order_by("-pk")


def ra_status_report_queryset():
    return RequestAssistance.objects.select_related(
        "initiate_dart__equipment_ems"
    ).order_by("-created_date", "-pk")


class ReportDefinition:
    def __init__(
        self, queryset_fn, serializer_class, filterset_class, title, context_fn=None
    ):
        self.queryset_fn = queryset_fn
        self.serializer_class = serializer_class
        self.filterset_class = filterset_class
        self.title = title
        self.context_fn = context_fn

    def get_queryset(self):
        return self.queryset_fn()

    def get_context(self):
        return self.context_fn() if self.context_fn else {}


REPORT_REGISTRY = {
    "darts-report": ReportDefinition(
        queryset_fn=darts_report_queryset,
        serializer_class=DartsReportSerializer,
        filterset_class=DartsReportFilter,
        title="DARTs Report",
    ),
    "closed-darts-report": ReportDefinition(
        queryset_fn=closed_darts_report_queryset,
        serializer_class=ClosedDartsReportSerializer,
        filterset_class=ClosedDartsReportFilter,
        title="Closed DARTs Report",
    ),
    "service-required-report": ReportDefinition(
        queryset_fn=service_required_report_queryset,
        serializer_class=ServiceRequiredReportSerializer,
        filterset_class=ServiceRequiredReportFilter,
        title="Service Required Report",
    ),
    "guarantee-monitoring-report": ReportDefinition(
        queryset_fn=guarantee_report_query,
        serializer_class=GuaranteeMonitoringReportSerializer,
        filterset_class=GuaranteeMonitoringReportFilter,
        title="Guarantee Monitoring Report",
    ),
    "spares-consumed-report": ReportDefinition(
        queryset_fn=spares_report_query,
        serializer_class=SparesConsumedReportSerializer,
        filterset_class=SparesConsumedReportFilter,
        title="Spares Consumed Report",
    ),
    "ra-status": ReportDefinition(
        queryset_fn=ra_status_report_queryset,
        serializer_class=RaStatusReportSerializer,
        filterset_class=RaStatusReportFilter,
        title="RA Status Report",
    ),
}


def get_report_definition(report_key):
    return REPORT_REGISTRY.get(report_key)


class _StoredParamsRequest:
    """Minimal stand-in for a DRF request, exposing query_params to FilterSets."""

    def __init__(self, query_params):
        self.query_params = query_params


def apply_filterset(definition, query_params):
    queryset = definition.get_queryset()
    filterset = definition.filterset_class(
        query_params, queryset=queryset, request=_StoredParamsRequest(query_params)
    )
    return filterset.qs
