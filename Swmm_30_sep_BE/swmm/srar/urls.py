"""
URL Configuration for SRAR Module.
Provides clean v1 REST API Endpoints relative to /api/v1/srar/ root prefix.
Follows PEP 8 formatting guidelines.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from swmmapi.views import SRARDataSaveAPI, SRARSyncAPIView

from .views import (
    AnnualSRMRRoutineUndertakenofGTGViewSet,
    AnnualSRMRRoutineUndertakenViewSet,
    AvcatStatusViewSet,
    DGUFLimitsViewSet,
    DGUFSeaHarbourRunningHourDataInputViewSet,
    DGUFViewSet,
    DieselReductionGearExploitationViewSet,
    EEFViewSet,
    EquipmentRoutineDueOnViewSet,
    FPTDieselAlternatorsViewSet,
    FPTEquipmentWiseViewSet,
    FuelConsumptionMonthViewSet,
    FullPowerTrialsMainEngineViewSet,
    GasTurbineExploitationViewSet,
    GasTurbineGeneratorExploitationGufEntryViewSet,
    GasTurbineGeneratorExploitationViewSet,
    GTGParametersViewSet,
    GTGrecordOfCleaningServiceTankViewSet,
    H2SSensorViewSet,
    IccpViewSet,
    InjectorFIPCalibrationReplacementViewSet,
    MagazineFFSystemFloodingSystemViewSet,
    OpsStatusofLubOilandCoolantTestKitsViewSet,
    ReductionGearExploitationofGTGViewSet,
    ReductionGearExploitationViewSet,
    ReplacementOfMajorAssembliesofGTGViewSet,
    ReplacementOfMajorAssembliesViewSet,
    RHExtensionViewSet,
    SafetyDeviceCheckTrialViewSet,
    ShipActivityDetailViewSet,
    ShipActivityTypeViewSet,
    ShipLocationViewSet,
    ShipStateViewSet,
    SrarActivityDetailsAPIView,
    ChMasterFullPowerConductedByListAPIView,
    CmmsLubricantListAPIView,
    SrarActivityTypesAPIView,
    SrarAllDropdownOptionsAPIView,
    SrarCarryForwardAPIView,
    SrarDgufCommentsAPIView,
    SrarEquipmentRoutinesAPIView,
    SrarEefDesignedValueAPIView,
    SrarEefReasonsAPIView,
    SrarLubricantUnitsAPIView,
    SrarAdjustmentViewSet,
    SrarBoilerAlkalinitySalinityDetailViewSet,
    SrarCentrifugeViewSet,
    SrarDashboardAPIView,
    SrarDashboardSummaryAPIView,
    SrarEquipmentByTypeAPIView,
    SrarEquipmentExploitationViewSet,
    SrarEquipmentTypeListViewSet,
    SrarEquipmentValidityViewSet,
    SrarDgufChartAPIView,
    SrarExploitationKpiAPIView,
    SrarFuelTrendAPIView,
    SrarKpiAnalyticsAPIView,
    SrarLinkedEquipmentViewSet,
    SrarListView,
    SrarMasterEquipmentDeleteAPIView,
    SrarMasterEquipmentsAPIView,
    SrarMasterEquipmentOnlyListAPIView,
    SrarRunningHoursEquipmentListAPIView,
    SrarMonthlyBoilerViewSet,
    SrarMonthlyEquipmentViewSet,
    SrarMonthlyHeaderViewSet,
    SrarMonthlyLubricantViewSet,
    SrarMonthlyShipActivityViewSet,
    SrarMonthlyTrendAPIView,
    SrarReportDetailAPIView,
    SrarReportExportAPIView,
    SrarReportFinalizeAPIView,
    SrarReportPreviewAPIView,
    SrarReportSaveAPIView,
    SrarRoutineHoursAPIView,
    SrarShipLocationsAPIView,
    SrarShipStatesAPIView,
    SrarTabSaveAPIView,
    SrarYearlyStatusAPIView,
    STPViewSet,
    TorsionMeterViewSet,
)

router = DefaultRouter()
router.register("ship-states", ShipStateViewSet, basename="srar-ship-state")
router.register("ship-locations", ShipLocationViewSet, basename="srar-ship-location")
router.register(
    "activity-types", ShipActivityTypeViewSet, basename="srar-activity-type"
)
router.register(
    "activity-details", ShipActivityDetailViewSet, basename="srar-activity-detail"
)
router.register("headers", SrarMonthlyHeaderViewSet, basename="srar-header")
router.register(
    "ship-activities", SrarMonthlyShipActivityViewSet, basename="srar-ship-activity"
)
router.register("lubricants", SrarMonthlyLubricantViewSet, basename="srar-lubricant")
router.register("boilers", SrarMonthlyBoilerViewSet, basename="srar-boiler")
router.register(
    "boiler-water-details",
    SrarBoilerAlkalinitySalinityDetailViewSet,
    basename="srar-boiler-water-detail",
)
router.register(
    "monthly-equipments", SrarMonthlyEquipmentViewSet, basename="srar-monthly-equipment"
)
router.register(
    "equipment-exploitations",
    SrarEquipmentExploitationViewSet,
    basename="srar-equipment-exploitation",
)
router.register(
    "linked-equipments", SrarLinkedEquipmentViewSet, basename="srar-linked-equipment"
)
router.register(
    "fuel-consumptions", FuelConsumptionMonthViewSet, basename="srar-fuel-consumption"
)
router.register("avcat-status", AvcatStatusViewSet, basename="srar-avcat-status")
router.register("torsion-meters", TorsionMeterViewSet, basename="srar-torsion-meter")
router.register("iccp", IccpViewSet, basename="srar-iccp")
router.register("h2s-sensors", H2SSensorViewSet, basename="srar-h2s-sensor")
router.register("stp", STPViewSet, basename="srar-stp")
router.register(
    "magazine-ff-systems",
    MagazineFFSystemFloodingSystemViewSet,
    basename="srar-magazine-ff-system",
)
router.register(
    "test-kits-status",
    OpsStatusofLubOilandCoolantTestKitsViewSet,
    basename="srar-test-kits-status",
)
router.register(
    "injector-calibrations",
    InjectorFIPCalibrationReplacementViewSet,
    basename="srar-injector-calibration",
)
router.register("dguf", DGUFViewSet, basename="srar-dguf")
router.register(
    "dguf-running-hours",
    DGUFSeaHarbourRunningHourDataInputViewSet,
    basename="srar-dguf-running-hours",
)
router.register("dguf-limits", DGUFLimitsViewSet, basename="srar-dguf-limits")
router.register(
    "safety-device-checks",
    SafetyDeviceCheckTrialViewSet,
    basename="srar-safety-device-check",
)
router.register(
    "full-power-trials-me", FullPowerTrialsMainEngineViewSet, basename="srar-fpt-me"
)
router.register("fpt-equipment-wise", FPTEquipmentWiseViewSet, basename="srar-fpt-eq")
router.register(
    "fpt-diesel-alternators", FPTDieselAlternatorsViewSet, basename="srar-fpt-da"
)
router.register(
    "reduction-gear-exploitations",
    ReductionGearExploitationViewSet,
    basename="srar-rg-exploitation",
)
router.register(
    "diesel-reduction-gear-exploitations",
    DieselReductionGearExploitationViewSet,
    basename="srar-diesel-rg-exploitation",
)
router.register(
    "gas-turbine-exploitations",
    GasTurbineExploitationViewSet,
    basename="srar-gt-exploitation",
)
router.register(
    "replacement-major-assemblies",
    ReplacementOfMajorAssembliesViewSet,
    basename="srar-replacement-assembly",
)
router.register(
    "annual-srmr-routines",
    AnnualSRMRRoutineUndertakenViewSet,
    basename="srar-srmr-routine",
)
router.register(
    "gtg-exploitations",
    GasTurbineGeneratorExploitationViewSet,
    basename="srar-gtg-exploitation",
)
router.register(
    "gtg-guf-entries",
    GasTurbineGeneratorExploitationGufEntryViewSet,
    basename="srar-gtg-guf-entry",
)
router.register(
    "gtg-reduction-gears", ReductionGearExploitationofGTGViewSet, basename="srar-gtg-rg"
)
router.register(
    "gtg-replacements",
    ReplacementOfMajorAssembliesofGTGViewSet,
    basename="srar-gtg-replacement",
)
router.register(
    "gtg-annual-srmr",
    AnnualSRMRRoutineUndertakenofGTGViewSet,
    basename="srar-gtg-annual-srmr",
)
router.register("gtg-parameters", GTGParametersViewSet, basename="srar-gtg-parameters")
router.register(
    "gtg-service-tank-cleanings",
    GTGrecordOfCleaningServiceTankViewSet,
    basename="srar-gtg-tank",
)
router.register("rh-extensions", RHExtensionViewSet, basename="srar-rh-extension")
router.register("eef", EEFViewSet, basename="srar-eef")
router.register(
    "equipment-routine-due", EquipmentRoutineDueOnViewSet, basename="srar-routine-due"
)
router.register("adjustments", SrarAdjustmentViewSet, basename="srar-adjustment")
router.register("centrifuges", SrarCentrifugeViewSet, basename="srar-centrifuge")
router.register(
    "equipment-type-lists",
    SrarEquipmentTypeListViewSet,
    basename="srar-equipment-type-list-plural",
)
router.register(
    "equipment-type-list",
    SrarEquipmentTypeListViewSet,
    basename="srar-equipment-type-list",
)
router.register(
    "equipment-validities",
    SrarEquipmentValidityViewSet,
    basename="srar-equipment-validity-plural",
)
router.register(
    "equipment-validity",
    SrarEquipmentValidityViewSet,
    basename="srar-equipment-validity",
)


app_name = "srar"

urlpatterns = [
    # Analytics & Dashboard Widgets (Dynamic ORM Aggregations)
    path(
        "analytics/kpis/", SrarKpiAnalyticsAPIView.as_view(), name="api_analytics_kpis"
    ),
    path(
        "analytics/monthly-trend/",
        SrarMonthlyTrendAPIView.as_view(),
        name="api_analytics_monthly_trend",
    ),
    path(
        "analytics/yearly-status/",
        SrarYearlyStatusAPIView.as_view(),
        name="api_analytics_yearly_status",
    ),
    path(
        "analytics/exploitation/",
        SrarExploitationKpiAPIView.as_view(),
        name="api_analytics_exploitation",
    ),
    path(
        "analytics/fuel-trend/",
        SrarFuelTrendAPIView.as_view(),
        name="api_analytics_fuel_trend",
    ),
    path(
        "analytics/dguf/",
        SrarDgufChartAPIView.as_view(),
        name="api_analytics_dguf",
    ),
    path(
        "analytics/dashboard-summary/",
        SrarDashboardSummaryAPIView.as_view(),
        name="api_analytics_dashboard_summary",
    ),
    # Dashboard & Report Operations
    path("dashboard/", SrarDashboardAPIView.as_view(), name="api_dashboard"),
    path("report/save/", SrarReportSaveAPIView.as_view(), name="api_report_save"),
    path(
        "report/edit/<int:header_id>/",
        SrarReportDetailAPIView.as_view(),
        name="api_report_edit",
    ),
    path(
        "report/carry-forward/",
        SrarCarryForwardAPIView.as_view(),
        name="api_report_carry_forward",
    ),
    path(
        "report/preview/<int:header_id>/",
        SrarReportPreviewAPIView.as_view(),
        name="api_report_preview",
    ),
    path(
        "report/finalize/<int:srar_id>/",
        SrarReportFinalizeAPIView.as_view(),
        name="api_report_finalize",
    ),
    path(
        "report/export/<int:header_id>/",
        SrarReportExportAPIView.as_view(),
        name="api_report_export",
    ),
    path(
        "tab/<int:tab_number>/save/", SrarTabSaveAPIView.as_view(), name="api_tab_save"
    ),
    # Metadata & Master Data
    path(
        "master/equipments/",
        SrarMasterEquipmentsAPIView.as_view(),
        name="api_master_equipments",
    ),
    path(
        "master/running-hours-equipment/",
        SrarRunningHoursEquipmentListAPIView.as_view(),
        name="api_running_hours_equipment",
    ),
    path(
        "master/sfd-equipment-by-type/",
        SrarEquipmentByTypeAPIView.as_view(),
        name="api_sfd_equipment_by_type",
    ),
    path(
        "master/srar_master_equipments_only/",
        SrarMasterEquipmentOnlyListAPIView.as_view(),
        name="api_srar_master_equipments_only",
    ),
    path(
        "master/equipments/delete/<int:pk>/",
        SrarMasterEquipmentDeleteAPIView.as_view(),
        name="api_master_equipment_delete",
    ),
    path(
        "master/full-power-conducted-by/",
        ChMasterFullPowerConductedByListAPIView.as_view(),
        name="api_master_full_power_conducted_by",
    ),
    path(
        "master/cmms-lubricants/",
        CmmsLubricantListAPIView.as_view(),
        name="api_master_cmms_lubricants",
    ),
    path(
        "master/dguf-comments/",
        SrarDgufCommentsAPIView.as_view(),
        name="api_master_dguf_comments",
    ),
    path(
        "master/eef-designed-value/",
        SrarEefDesignedValueAPIView.as_view(),
        name="api_master_eef_designed_value",
    ),
    path(
        "master/ship-states/",
        SrarShipStatesAPIView.as_view(),
        name="api_master_ship_states",
    ),
    path(
        "master/ship-locations/",
        SrarShipLocationsAPIView.as_view(),
        name="api_master_locations",
    ),
    path(
        "master/equipment-routines/",
        SrarEquipmentRoutinesAPIView.as_view(),
        name="api_master_equipment_routines",
    ),
    path(
        "master/routine-hours/",
        SrarRoutineHoursAPIView.as_view(),
        name="api_master_routine_hours",
    ),
    path(
        "master/activity-types/",
        SrarActivityTypesAPIView.as_view(),
        name="api_master_activity_types",
    ),
    path(
        "master/activity-details/",
        SrarActivityDetailsAPIView.as_view(),
        name="api_master_activity_details",
    ),
    path(
        "master/lubricant-units/",
        SrarLubricantUnitsAPIView.as_view(),
        name="api_master_lubricant_units",
    ),
    path(
        "master/eef-reasons/",
        SrarEefReasonsAPIView.as_view(),
        name="api_master_eef_reasons",
    ),
    path(
        "master/dropdown-options/",
        SrarAllDropdownOptionsAPIView.as_view(),
        name="api_master_dropdown_options",
    ),
    # Granular Model CRUD Router
    path("crud/", include(router.urls)),
]


integration_urlpatterns = [
    # CMMS SRAR Integration Path
    path("cmms/srar", SrarListView.as_view(), name="cmms-srar"),
    path(
        "srar_sync/<str:pk>/",
        SRARSyncAPIView.as_view(),
        name="srar_sync_cmms",
    ),
    path(
        "srar/save-srar/",
        SRARDataSaveAPI.as_view(),
        name="srar_data_save",
    ),
]
urlpatterns += router.urls
