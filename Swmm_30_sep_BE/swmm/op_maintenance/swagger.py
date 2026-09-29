from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiExample,
    OpenApiParameter,
    extend_schema,
    extend_schema_view,
)

EQUIPMENTMASTERLISTAPIVIEW_SCHEMA = extend_schema_view(
    get=extend_schema(tags=["OP Maintenance Configuration"]),
)

REASONMASTERLISTAPIVIEW_SCHEMA = extend_schema_view(
    get=extend_schema(tags=["OP Maintenance Configuration"]),
)

SEVERITYMASTERLISTAPIVIEW_SCHEMA = extend_schema_view(
    get=extend_schema(tags=["OP Maintenance Configuration"]),
)

SERVICESMASTERLISTAPIVIEW_SCHEMA = extend_schema_view(
    get=extend_schema(tags=["OP Maintenance Configuration"]),
)

GUARANTEETHRESHOLDLISTAPIVIEW_SCHEMA = extend_schema_view(
    get=extend_schema(tags=["OP Maintenance Configuration"]),
)

SHIPREMARKSMASTERLISTAPIVIEW_SCHEMA = extend_schema_view(
    get=extend_schema(tags=["OP Maintenance Configuration"]),
)

CERTIFICATETYPEMASTERLISTAPIVIEW_SCHEMA = extend_schema_view(
    get=extend_schema(tags=["OP Maintenance Configuration"]),
)

DEFERRALOUTCOMEMASTERLISTAPIVIEW_SCHEMA = extend_schema_view(
    get=extend_schema(tags=["OP Maintenance Configuration"]),
)

EQUIPMENTGUARANTEEMASTERLISTAPIVIEW_SCHEMA = extend_schema_view(
    get=extend_schema(tags=["OP Maintenance Configuration"]),
)

REPAIRAGENCYMASTERLISTAPIVIEW_SCHEMA = extend_schema_view(
    get=extend_schema(tags=["OP Maintenance Configuration"]),
)

ASSISTANCEMASTERLISTAPIVIEW_SCHEMA = extend_schema_view(
    get=extend_schema(tags=["OP Maintenance Configuration"]),
)

EQUIPMENTSTATUSMASTERLISTAPIVIEW_SCHEMA = extend_schema_view(
    get=extend_schema(tags=["OP Maintenance Configuration"]),
)

DEFECTTRANSACTIONVIEWSET_SCHEMA = extend_schema_view(
    list=extend_schema(tags=["Defects"]),
    create=extend_schema(tags=["Defects"]),
    retrieve_record=extend_schema(tags=["Defects"]),
    update_record=extend_schema(tags=["Defects"]),
    delete_record=extend_schema(tags=["Defects"]),
    add_spare=extend_schema(tags=["Defects"]),
    add_trial=extend_schema(tags=["Defects"]),
    add_attachment=extend_schema(tags=["Defects"]),
)

DARTS_REPORT_API_SCHEMA = extend_schema(
    tags=["DART Report"],
    summary="Get DARTs Report list",
    parameters=[
        OpenApiParameter(
            name="status",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Filter by status (OPEN, IN_PROGRESS, RECTIFIED, CLOSED).",
        ),
        OpenApiParameter(
            name="severity",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Filter by severity.",
        ),
        OpenApiParameter(
            name="date_filter",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Date filter preset (last_30_days, last_90_days, this_year, last_year).",
        ),
        OpenApiParameter(
            name="page",
            type=OpenApiTypes.INT,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Page number.",
        ),
        OpenApiParameter(
            name="page_size",
            type=OpenApiTypes.INT,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Number of records per page.",
        ),
    ],
)

CLOSED_DARTS_REPORT_API_SCHEMA = extend_schema(
    tags=["DART Report"],
    summary="Get Closed DARTs Report list",
    parameters=[
        OpenApiParameter(
            name="equipment",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Filter by equipment.",
        ),
        OpenApiParameter(
            name="date_filter",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Date filter preset (last_30_days, last_90_days, this_year, last_year).",
        ),
        OpenApiParameter(
            name="page",
            type=OpenApiTypes.INT,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Page number.",
        ),
        OpenApiParameter(
            name="page_size",
            type=OpenApiTypes.INT,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Number of records per page.",
        ),
    ],
)

SERVICE_REQUIRED_REPORT_API_SCHEMA = extend_schema(
    tags=["DART Report"],
    summary="Get Service Required Report list",
    parameters=[
        OpenApiParameter(
            name="service",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Filter by service name.",
        ),
        OpenApiParameter(
            name="department",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Filter by department.",
        ),
        OpenApiParameter(
            name="status",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Filter by status (Open, In Progress, Closed).",
        ),
        OpenApiParameter(
            name="date_filter",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Date filter preset (last_30_days, last_90_days, this_year, last_year).",
        ),
        OpenApiParameter(
            name="page",
            type=OpenApiTypes.INT,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Page number.",
        ),
        OpenApiParameter(
            name="page_size",
            type=OpenApiTypes.INT,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Number of records per page.",
        ),
    ],
)

GUARANTEE_MONITORING_REPORT_API_SCHEMA = extend_schema(
    tags=["DART Report"],
    summary="Get Guarantee Monitoring Report list",
    parameters=[
        OpenApiParameter(
            name="threshold colour",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Filter by status (Green, Yellow, Red).",
        ),
        OpenApiParameter(
            name="date_filter",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Date filter preset (last_30_days, last_90_days, this_year, last_year).",
        ),
        OpenApiParameter(
            name="page",
            type=OpenApiTypes.INT,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Page number.",
        ),
        OpenApiParameter(
            name="page_size",
            type=OpenApiTypes.INT,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Number of records per page.",
        ),
    ],
)

SPARES_CONSUMED_REPORT_API_SCHEMA = extend_schema(
    tags=["DART Report"],
    summary="Get Spares Consumed Report list",
    parameters=[
        OpenApiParameter(
            name="spares",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Filter by spare names.",
        ),
        OpenApiParameter(
            name="equipment",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Filter by equipment.",
        ),
        OpenApiParameter(
            name="date_filter",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Date filter preset (last_30_days, last_90_days, this_year, last_year).",
        ),
        OpenApiParameter(
            name="page",
            type=OpenApiTypes.INT,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Page number.",
        ),
        OpenApiParameter(
            name="page_size",
            type=OpenApiTypes.INT,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Number of records per page.",
        ),
    ],
)

OPM_REPORT_FILTER_OPTIONS_SCHEMA = extend_schema(
    tags=["DART Report"],
    summary="Get filter options for OPM reports",
    parameters=[
        OpenApiParameter(
            name="fields",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=True,
            description="Comma-separated field names to get options for. Mandatory parameter. Accepted values: status, severity, ra_type, ra_status",
        ),
    ],
)

OPM_REPORT_EXPORT_SCHEMA = extend_schema(
    tags=["DART Report"],
    summary="Request an Excel/PDF export of an OPM report",
    description="Creates a report export job and returns the job ID.",
    parameters=[
        OpenApiParameter(
            name="format",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=True,
            description="Export format: excel or pdf.",
        ),
    ],
    request={
        "application/json": OpenApiTypes.OBJECT,
    },
    examples=[
        OpenApiExample(
            "Export request with filters",
            description="Filter params to apply to the exported report.",
            value={"status": "OPEN", "date_filter": "last_30_days"},
            request_only=True,
        ),
    ],
)

OPM_REPORT_EXPORT_JOB_STATUS_SCHEMA = extend_schema(
    tags=["DART Report"],
    summary="Get status of OPM report export job",
)

OPM_REPORT_EXPORT_JOB_DOWNLOAD_SCHEMA = extend_schema(
    tags=["DART Report"],
    summary="Download completed OPM report export file",
)

RA_STATUS_REPORT_API_SCHEMA = extend_schema(
    tags=["DART Report"],
    summary="Get RA Status Report list",
    parameters=[
        OpenApiParameter(
            name="ra_no",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Filter by RA number.",
        ),
        OpenApiParameter(
            name="ra_type",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Filter by RA type (OP_RA, AMP, SMP, SIGNAL_RA).",
        ),
        OpenApiParameter(
            name="status",
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Filter by status (DRAFT, SUBMITTED, ACKNOWLEDGED, IN_PROGRESS, COMPLETED, CANCELLED, REJECTED).",
        ),
        OpenApiParameter(
            name="page",
            type=OpenApiTypes.INT,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Page number.",
        ),
        OpenApiParameter(
            name="page_size",
            type=OpenApiTypes.INT,
            location=OpenApiParameter.QUERY,
            required=False,
            description="Number of records per page.",
        ),
    ],
)

REQUESTASSISTANCEVIEWSET_SCHEMA = extend_schema_view(
    list=extend_schema(tags=["Required Assistance"]),
    create=extend_schema(tags=["Required Assistance"]),
    retrieve_record=extend_schema(tags=["Required Assistance"]),
    update_record=extend_schema(tags=["Required Assistance"]),
    delete_record=extend_schema(tags=["Required Assistance"]),
    save_draft=extend_schema(tags=["Required Assistance"]),
    send_to_navyojana=extend_schema(tags=["Required Assistance"]),
    add_defect=extend_schema(tags=["Required Assistance"]),
)
DEFECTDASHBOARDAPIVIEW_SCHEMA = extend_schema_view(
    get=extend_schema(tags=["OP Maintenance Configuration"]),
)
