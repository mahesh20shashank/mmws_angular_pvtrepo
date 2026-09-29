from django.urls import include, path
from rest_framework.routers import DefaultRouter
from swmmapi.views import (
    CMMSClosedDartPushAPI,
    CMMSDartPushSelectedAPI,
    CMMSDartSyncAllAPI,
)

from . import views
from .views import (
    AddDartMetadataAPIView,
    AssistanceMasterListAPIView,
    CertificateTypeMasterListAPIView,
    ClosedDartsReportAPIView,
    CompleteDartListAPIView,
    CompleteDefectAPIView,
    CreateDLFunAPIView,
    CreateRADLFunAPIView,
    DartDashboardAPIView,
    DartDashboardViewSet,
    DartHistoryDefaultDataAPIView,
    DartHistoryPDFAPIView,
    DartsReportAPIView,
    DeleteDLRowAPIView,
    ExportPendingDefectsDL2APIView,
    GeneratedDLIIReportsAPIView,
    GetDartDetailsAPIView,
    GetDartSparesDataAPIView,
    GetEquipmentObjectsAPIView,
    GetNomenclatureDetailsAPIView,
    GuaranteeMonitoringReportAPIView,
    InitiateDartAPIView,
    MaintenancePeriodsListAPIView,
    OPMReportExportAPIView,
    OPMReportExportJobDownloadAPIView,
    OPMReportExportJobStatusAPIView,
    OPMReportFilterOptionsAPIView,
    PendingDefectAPIView,
    PendingDefectsExportAPIView,
    RaStatusReportAPIView,
    ReasonMasterListAPIView,
    RefitOperationalOccasionAPIView,
    RepairAgencyMasterListAPIView,
    SaveDLRowsAPIView,
    ServiceRequiredReportAPIView,
    ServicesMasterListAPIView,
    SeverityMasterListAPIView,
    ShipRemarksMasterListAPIView,
    SparesConsumedReportAPIView,
)

router = DefaultRouter()

router.register(
    r"dashboard",
    DartDashboardViewSet,
    basename="dart-dashboard",
)


urlpatterns = [
    path(
        "configuration/repair-agency-master/",
        RepairAgencyMasterListAPIView.as_view(),
        name="op-maintenance-repair-agency-master",
    ),
    path("add_dart/", AddDartMetadataAPIView.as_view(), name="add_dart"),
    path(
        "configuration/assistance-master/",
        AssistanceMasterListAPIView.as_view(),
        name="op-maintenance-assistance-master",
    ),
    path(
        "configuration/reason-master/",
        ReasonMasterListAPIView.as_view(),
        name="op-maintenance-reason-master",
    ),
    path(
        "configuration/severity-master/",
        SeverityMasterListAPIView.as_view(),
        name="op-maintenance-severity-master",
    ),
    path(
        "configuration/services-master/",
        ServicesMasterListAPIView.as_view(),
        name="op-maintenance-services-master",
    ),
    path(
        "configuration/certificate-type-master/",
        CertificateTypeMasterListAPIView.as_view(),
        name="op-maintenance-certificate-type-master",
    ),
    path(
        "configuration/ship-remarks-master/",
        ShipRemarksMasterListAPIView.as_view(),
        name="op-maintenance-ship-remarks-master",
    ),
    #############################################################################
    # Reports
    #############################################################################
    path("reports/darts/", DartsReportAPIView.as_view(), name="opm-darts-report"),
    path(
        "reports/closed-darts/",
        ClosedDartsReportAPIView.as_view(),
        name="opm-closed-darts-report",
    ),
    path(
        "reports/service-required/",
        ServiceRequiredReportAPIView.as_view(),
        name="opm-service-required-report",
    ),
    path(
        "reports/guarantee-monitoring/",
        GuaranteeMonitoringReportAPIView.as_view(),
        name="opm-guarantee-monitoring-report",
    ),
    path(
        "reports/spares-consumed/",
        SparesConsumedReportAPIView.as_view(),
        name="opm-spares-consumed-report",
    ),
    path(
        "reports/ra-status/",
        RaStatusReportAPIView.as_view(),
        name="opm-ra-status-report",
    ),
    path(
        "reports/filter-options/",
        OPMReportFilterOptionsAPIView.as_view(),
        name="opm-report-filter-options",
    ),
    path(
        "reports/export-jobs/<uuid:job_id>/download/",
        OPMReportExportJobDownloadAPIView.as_view(),
        name="opm-report-export-job-download",
    ),
    path(
        "reports/export-jobs/<uuid:job_id>/",
        OPMReportExportJobStatusAPIView.as_view(),
        name="opm-report-export-job-status",
    ),
    path(
        "reports/<str:report_key>/export/",
        OPMReportExportAPIView.as_view(),
        name="opm-report-export",
    ),
    path("", include(router.urls)),
    path("initiate_dart/", InitiateDartAPIView.as_view(), name="initiate_dart"),
    path(
        "generated-dl-ii-reports/",
        GeneratedDLIIReportsAPIView.as_view(),
        name="generated-dl-ii-reports",
    ),
    path("get_dart_details/", GetDartDetailsAPIView.as_view(), name="get_dart_details"),
    path("create_ra/", CreateRADLFunAPIView.as_view(), name="create_ra"),
    path(
        "complete_defect/<int:defect_id>/",
        CompleteDefectAPIView.as_view(),
        name="complete_defect",
    ),
    path(
        "export_pending_defects_accdb/",
        PendingDefectsExportAPIView.as_view(),
        name="export_pending_defects_accdb",
    ),
    # DL-II Endpoints
    path("createdlfun/", CreateDLFunAPIView.as_view(), name="createdlfun"),
    path("save_dl_rows/", SaveDLRowsAPIView.as_view(), name="save_dl_rows"),
    path("delete_dl_row/", DeleteDLRowAPIView.as_view(), name="delete_dl_row"),
    path(
        "export_pending_defects_dl2_accdb/",
        ExportPendingDefectsDL2APIView.as_view(),
        name="export_pending_defects_dl2_accdb",
    ),
    path(
        "export_pending_defects_dl2_ndv/",
        ExportPendingDefectsDL2APIView.as_view(),
        name="export_pending_defects_dl2_ndv",
    ),
    path(
        "export_pending_defects_dl2_nsrykar/",
        ExportPendingDefectsDL2APIView.as_view(),
        name="export_pending_defects_dl2_nsrykar",
    ),
    path(
        "export_pending_defects_dl2_nsrykoc/",
        ExportPendingDefectsDL2APIView.as_view(),
        name="export_pending_defects_dl2_nsrykoc",
    ),
    path(
        "export_pending_defects_dl2_nsrypbr/",
        ExportPendingDefectsDL2APIView.as_view(),
        name="export_pending_defects_dl2_nsrypbr",
    ),
    path("pending_defect/", PendingDefectAPIView.as_view(), name="defectpending"),
    path(
        "get-equipment-objects/",
        GetEquipmentObjectsAPIView.as_view(),
        name="get_equipment_objects",
    ),
    path(
        "get_nomenclature_details/",
        GetNomenclatureDetailsAPIView.as_view(),
        name="get_nomenclature_details",
    ),
    path(
        "complete_dart_list/",
        CompleteDartListAPIView.as_view(),
        name="complete_dart_list",
    ),
    path(
        "maintenance_periods/",
        MaintenancePeriodsListAPIView.as_view(),
        name="maintenance_periods_list",
    ),
    path(
        "refit_and_operational_occation/",
        RefitOperationalOccasionAPIView.as_view(),
        name="refit_operational_occation",
    ),
    path("dartdashboard/", DartDashboardAPIView.as_view(), name="dartdashboard"),
    path(
        "history/data/",
        DartHistoryDefaultDataAPIView.as_view(),
        name="history_data",
    ),
    path(
        "get_dart_spares_data/",
        GetDartSparesDataAPIView.as_view(),
        name="get_dart_spares_data",
    ),
    path("history_pdf/<int:id>/", DartHistoryPDFAPIView.as_view(), name="history_pdf"),
    path(
        "push-selected-to-cmms/",
        CMMSDartPushSelectedAPI.as_view(),
        name="push_selected_darts_to_cmms",
    ),
    path(
        "push-closed-to-cmms/",
        CMMSClosedDartPushAPI.as_view(),
        name="push_closed_darts_to_cmms",
    ),
    path(
        "sync-all-with-cmms/",
        CMMSDartSyncAllAPI.as_view(),
        name="sync_all_darts_with_cmms",
    ),
    # multidart urls
    path("multi-dart/", views.MultiDartAPIView.as_view(), name="multi-dart"),
    path(
        "multi-dart/equipment-rows/",
        views.MultiDartEquipmentRowsAPIView.as_view(),
        name="multi-dart-equipment-rows",
    ),
    path(
        "multi-dart/download-template/",
        views.MultiDartDownloadTemplateAPIView.as_view(),
        name="multi-dart-download-template",
    ),
    path(
        "multi-dart/import-excel/",
        views.MultiDartImportExcelAPIView.as_view(),
        name="multi-dart-import-excel",
    ),
    path(
        "multi-dart/draft-save/",
        views.MultiDartDraftSaveAPIView.as_view(),
        name="multi-dart-draft-save",
    ),
    path(
        "multi-dart/draft-open/",
        views.MultiDartDraftOpenAPIView.as_view(),
        name="multi-dart-draft-open",
    ),
    path(
        "multi-dart/draft-lock/",
        views.MultiDartDraftLockAPIView.as_view(),
        name="multi-dart-draft-lock",
    ),
    path(
        "multi-dart/draft-delete/",
        views.MultiDartDraftDeleteAPIView.as_view(),
        name="multi-dart-draft-delete",
    ),
    path(
        "multi-dart/save-rows/",
        views.MultiDartSaveRowsAPIView.as_view(),
        name="multi-dart-save-rows",
    ),
    path(
        "multi-dart/spares-picker/",
        views.MultiDartSparesPickerAPIView.as_view(),
        name="multi-dart-spares-picker",
    ),
]
urlpatterns += router.urls
