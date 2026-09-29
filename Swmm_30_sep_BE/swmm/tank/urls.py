"""
URL Configuration for Tank Module.
Provides v1 Version-Controlled DRF REST API Endpoints relative to /api/v1/tank/ root prefix.
Follows PEP 8 formatting guidelines.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    FluidInTankViewSet,
    FluidTypeViewSet,
    FluidViewSet,
    FuellingDetailsViewSet,
    FuellingHistoryAPIView,
    FuellingSaveAPIView,
    HierarchyforchartViewSet,
    MeasurementViewSet,
    SoundingBulkSaveAPIView,
    SoundingDraftViewSet,
    TankCalibrationAPIView,
    TankCategoryDropdownAPIView,
    TankCategoryViewSet,
    TankDashboardAPIView,
    TankDetailAPIView,
    TankFluidUnitViewSet,
    TankFuelSoundingViewSet,
    TankLocationViewSet,
    TankOilViewSet,
    TankRASMonitorAPIView,
    TankRecordViewSet,
    TanksByTypeAPIView,
    TankSoundingDataViewSet,
    TankSoundingMasterViewSet,
    TankTypeDetailViewSet,
    UnassignedCategoriesAPIView,
    UpdateGraphNoAPIView,
)

router = DefaultRouter()
router.register("fluid-units", TankFluidUnitViewSet, basename="tank-fluid-unit")
router.register("type-details", TankTypeDetailViewSet, basename="tank-type-detail")
router.register(
    "sounding-masters", TankSoundingMasterViewSet, basename="tank-sounding-master"
)
router.register("sounding-data", TankSoundingDataViewSet, basename="tank-sounding-data")
router.register(
    "legacy-fuel-soundings", MeasurementViewSet, basename="tank-legacy-fuel-sounding"
)
router.register("categories", TankCategoryViewSet, basename="tank-category")
router.register("fluid-types", FluidTypeViewSet, basename="tank-fluid-type")
router.register("fluids", FluidViewSet, basename="tank-fluid")
router.register("locations", TankLocationViewSet, basename="tank-location")
router.register("oils", TankOilViewSet, basename="tank-oil")
router.register(
    "fuelling-details", FuellingDetailsViewSet, basename="tank-fuelling-details"
)
router.register("fluids-in-tank", FluidInTankViewSet, basename="tank-fluids-in-tank")
router.register("records", TankRecordViewSet, basename="tank-record")
router.register("sounding-drafts", SoundingDraftViewSet, basename="tank-sounding-draft")
router.register(
    "fuel-soundings", TankFuelSoundingViewSet, basename="tank-fuel-sounding"
)
router.register("hierarchies", HierarchyforchartViewSet, basename="tank-hierarchy")

app_name = "tank"

urlpatterns = [
    # Dashboard & Workflow Operations
    path("dashboard/", TankDashboardAPIView.as_view(), name="tank_dashboard"),
    path("detail/", TankDetailAPIView.as_view(), name="tank_detail"),
    path(
        "fuelling/history/", FuellingHistoryAPIView.as_view(), name="fuelling_history"
    ),
    path("fuelling/save/", FuellingSaveAPIView.as_view(), name="fuelling_save"),
    path("ras-monitor/<int:id>/", TankRASMonitorAPIView.as_view(), name="ras_monitor"),
    path("calibrations/", TankCalibrationAPIView.as_view(), name="tank_calibrations"),
    path(
        "category-dropdown/",
        TankCategoryDropdownAPIView.as_view(),
        name="tank_category_dropdown",
    ),
    path("by-type/", TanksByTypeAPIView.as_view(), name="tanks_by_type"),
    path(
        "sounding/bulk-save/",
        SoundingBulkSaveAPIView.as_view(),
        name="sounding_bulk_save",
    ),
    path(
        "graph-slots/reassign/",
        UpdateGraphNoAPIView.as_view(),
        name="graph_slot_reassign",
    ),
    path(
        "categories/unassigned/",
        UnassignedCategoriesAPIView.as_view(),
        name="categories_unassigned",
    ),
    # Granular Model CRUD Router
    path("crud/", include(router.urls)),
]
