from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AppInfoAPIView,
    CoMessageViewSet,
    CreateRegulatorAPIView,
    DeleteRegulatorAPIView,
    DepartmentViewSet,
    ExportRoutineExcelAPIView,
    HierarchyForChartViewSet,
    ImportExcelFileView,
    KnowYourShipAPIView,
    MaintenanceNomenclatureAPIView,
    MaintenanceNomenclatureDeleteAPIView,
    MemberDetailViewSet,
    OrderDutyViewSet,
    QuoteViewSet,
    RefitCompletionsView,
    RefitDelinquencyView,
    RefitDryDockView,
    RefitOcrView,
    # Integration Views
    RefitPayloadView,
    RegulatorListAPIView,
    ShipRoleViewSet,
    ThisShipAPIView,
    UpdateEntryViewSet,
    UpdateRegulatorPhotoAPIView,
    UpdateRegulatorProfileAPIView,
)

router = DefaultRouter()
router.register(r"update-entries", UpdateEntryViewSet, basename="updateentry")
router.register(r"ship-roles", ShipRoleViewSet, basename="shiprole")
router.register(r"member-details", MemberDetailViewSet, basename="memberdetail")
router.register(r"order-duties", OrderDutyViewSet, basename="orderduty")
router.register(r"quotes", QuoteViewSet, basename="quote")
router.register(r"co-messages", CoMessageViewSet, basename="comessage")
router.register(r"hierarchy", HierarchyForChartViewSet, basename="hierarchy")
router.register("departments", DepartmentViewSet, basename="department")

urlpatterns = [
    path(
        "app-info/",
        AppInfoAPIView.as_view(),
        name="app-info",
    ),
    path(
        "create-regulator/",
        CreateRegulatorAPIView.as_view(),
        name="create-regulator",
    ),
    path(
        "update-regulator-profile/",
        UpdateRegulatorProfileAPIView.as_view(),
        name="update-regulator-profile",
    ),
    path(
        "update-regulator-photo/",
        UpdateRegulatorPhotoAPIView.as_view(),
        name="update-regulator-photo",
    ),
    path(
        "delete-regulator/",
        DeleteRegulatorAPIView.as_view(),
        name="delete-regulator",
    ),
    # path("import-excel/", ImportExcelFileView.as_view(), name="import_excel"),
    path("", include(router.urls)),
    # Expose ImportExcelFile endpoint at /api/v1/master/import-excel/
    path("master/import-excel/", ImportExcelFileView.as_view(), name="import_excel"),
    path(
        "ships/know-your-ship/",
        KnowYourShipAPIView.as_view(),
        name="know-your-ship",
    ),
    # Developed with Understanding: the ship display name, AllowAny like know-your-ship.
    path("this-ship/", ThisShipAPIView.as_view(), name="this-ship"),
    path(
        "regulator-list/",
        RegulatorListAPIView.as_view(),
        name="regulator-list",
    ),
    path(
        "export-routine-excel/",
        ExportRoutineExcelAPIView.as_view(),
        name="export-routine-excel",
    ),
    path(
        "maintenance-nomenclature/",
        MaintenanceNomenclatureAPIView.as_view(),
        name="maintenance-nomenclature",
    ),
    path(
        "maintenance-nomenclature/delete/",
        MaintenanceNomenclatureDeleteAPIView.as_view(),
        name="maintenance-nomenclature-delete",
    ),
]


integration_urlpatterns = [
    # CMMS Refit Paths
    path(
        "cmms/refit",
        RefitPayloadView.as_view(),
        name="cmms-refit-payload",
    ),
    path(
        "cmms/refit/completions",
        RefitCompletionsView.as_view(),
        name="cmms-refit-completions",
    ),
    path(
        "cmms/refit/completions/<str:uid>/delinquency",
        RefitDelinquencyView.as_view(),
        name="cmms-refit-delinquency",
    ),
    path(
        "cmms/refit/completions/<str:uid>/drydock",
        RefitDryDockView.as_view(),
        name="cmms-refit-drydock",
    ),
    path(
        "cmms/refit/completions/<str:uid>/ocr",
        RefitOcrView.as_view(),
        name="cmms-refit-ocr",
    ),
]
urlpatterns += router.urls
