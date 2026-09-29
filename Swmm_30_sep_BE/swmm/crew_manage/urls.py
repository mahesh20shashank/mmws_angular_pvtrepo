"""
URL routing for the Ship Crew API. Mounted under /api/v1/crew-management/
(see swmm/urls.py).

Most endpoints are ViewSets registered on the router below. The plain `path()`
entries in `urlpatterns` are the few APIView-based endpoints (personnel
status, leave forecast, the watchbill dashboard/personnel reads, and the
per-SailingPersonnel-row edit).
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

app_name = "crew_manage"

router = DefaultRouter()
router.register(
    "leave-applications", views.LeaveApplicationViewSet, basename="leave-application"
)
router.register("civilians", views.CivilianOfficialViewSet, basename="civilian")
router.register("sailings", views.SailingViewSet, basename="sailing")
router.register(
    "action-stations", views.ActionStationMasterViewSet, basename="action-station"
)
router.register(
    "defence-stations", views.DefenceStationMasterViewSet, basename="defence-station"
)
router.register(
    "cruising-stations", views.CruisingStationMasterViewSet, basename="cruising-station"
)
router.register(
    "shelter-stations", views.ShelterStationMasterViewSet, basename="shelter-station"
)
router.register(
    "emergency-stations",
    views.EmergencyStationMasterViewSet,
    basename="emergency-station",
)
router.register(
    "rank-classifications",
    views.SailorRankClassificationViewSet,
    basename="rank-classification",
)

urlpatterns = [
    # Personnel status (dashboard + inline status edit)
    path(
        "personnel-status/",
        views.PersonnelStatusView.as_view(),
        name="personnel-status",
    ),
    path(
        "personnel-status/counts/",
        views.PersonnelStatusCountsView.as_view(),
        name="personnel-status-counts",
    ),
    path(
        "personnel-status/update/",
        views.UpdatePersonnelStatusView.as_view(),
        name="personnel-status-update",
    ),
    # Leave forecast calendar (past logs + planned applications)
    path(
        "leave-forecast/logs/",
        views.LeaveForecastLogsView.as_view(),
        name="leave-forecast-logs",
    ),
    path(
        "leave-forecast/applications/",
        views.LeaveForecastApplicationsView.as_view(),
        name="leave-forecast-applications",
    ),
    # Watch & Station Bill reads (the sailing CRUD itself is on the router)
    path(
        "watchbill/dashboard/",
        views.WatchbillDashboardView.as_view(),
        name="watchbill-dashboard",
    ),
    path(
        "watchbill/personnel/",
        views.WatchbillPersonnelListView.as_view(),
        name="watchbill-personnel",
    ),
    # Edit/remove one person on a sailing, keyed by the SailingPersonnel id.
    # Listed before the router include so it wins over "sailings/<pk>/...".
    path(
        "sailings/personnel/<int:sp_id>/",
        views.SailingPersonnelDetailView.as_view(),
        name="sailing-personnel-detail",
    ),
    path("", include(router.urls)),
]
