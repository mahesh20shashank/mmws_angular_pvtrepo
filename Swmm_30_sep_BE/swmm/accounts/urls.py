from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

app_name = "users"

router = DefaultRouter()
router.register("ranks", views.RankViewSet, basename="rank")
router.register("designations", views.DesignationViewSet, basename="designation")
router.register("roles", views.RoleViewSet, basename="role")
router.register("departments", views.DepartmentViewSet, basename="department")
router.register("commands", views.CommandViewSet, basename="command")
router.register("all_users", views.UserViewSet, basename="user")
router.register("gallery", views.GalleryImageViewSet, basename="gallery")
router.register(
    "regulator-divisions",
    views.MasterRegulatorDivisionViewSet,
    basename="regulator-division",
)
router.register(
    "know-your-regulator",
    views.MasterKnowYourRegulatorViewSet,
    basename="know-your-regulator",
)
router.register(
    "login-images", views.LoginRegistrationImageViewSet, basename="login-image"
)

urlpatterns = [
    # NOTE: auth (token / refresh / logout / register / me / change-password),
    # role requests, nav-visibility and ship-identity are gone -- authz_service
    # (userauth/) owns them now and the SPA calls it directly.
    #
    # regulator hierarchy lookups
    path("regulators/", views.RegulatorLookupView.as_view(), name="regulator-lookup"),
    path("sailors/", views.SailorLookupView.as_view(), name="sailor-lookup"),
    path(
        "regulator-divisions/assign-sailors/",
        views.AssignSailorsToDivisionView.as_view(),
        name="assign-sailors",
    ),
    path(
        "ships/<int:ship_id>/hierarchy/",
        views.ShipHierarchyView.as_view(),
        name="ship-hierarchy",
    ),
    # profile utilities
    path(
        "profiles/<int:pk>/marriage/",
        views.MarriageDetailsView.as_view(),
        name="marriage-details",
    ),
    path(
        "personnel-events/",
        views.PersonnelEventsAPIView.as_view(),
        name="personnel-events",
    ),
    path(
        "technical-dashboard/",
        views.TechnicalDashboardAPIView.as_view(),
        name="technical-dashboard",
    ),
    # role change requests + nav visibility + ship-identity: now owned by
    # authz_service (/api/authz/role-requests/, /api/authz/nav-visibility/).
    # Admin dashboard
    path(
        "admin/dashboard/",
        views.AdminDashboardAPIView.as_view(),
        name="admin-dashboard-api",
    ),
    # User management
    path(
        "users/",
        views.UserListAPIView.as_view(),
        name="user-list-api",
    ),
    path(
        "users/<int:user_id>/",
        views.EditUserProfileAPIView.as_view(),
        name="edit-user-profile-api",
    ),
    # Approve / disapprove
    path(
        "users/<int:user_id>/approve/",
        views.ApproveUserAPIView.as_view(),
        name="approve-user-api",
    ),
    path(
        "users/<int:user_id>/disapprove/",
        views.DisapproveUserAPIView.as_view(),
        name="disapprove-user-api",
    ),
    # Active users
    path(
        "users/active/",
        views.ActiveUserAPIView.as_view(),
        name="active-users-api",
    ),
    path(
        "hrcdf-lookup/",
        views.HRCDFMockLookupView.as_view(),
        name="hrcdf-lookup",
    ),
    # Destructive: wipes and reseeds the entire application database.
    # SHIPADMIN role only, see users.views.DatabaseResetAPIView.
    path(
        "database-reset/",
        views.DatabaseResetAPIView.as_view(),
        name="database-reset",
    ),
    # Developed with Understanding: HRCDF roster sync (CP-C). ADMIN and SHIPADMIN only
    # (IsShipAdminRole plus IsLiveAuthzUser, D16). The progress poll stays a GET.
    path(
        "hrcdf-sync/readiness/",
        views.HrcdfSyncReadinessView.as_view(),
        name="hrcdf-sync-readiness",
    ),
    path(
        "hrcdf-sync/units/",
        views.HrcdfSyncUnitsView.as_view(),
        name="hrcdf-sync-units",
    ),
    path(
        "hrcdf-sync/units/refresh/",
        views.HrcdfSyncUnitsRefreshView.as_view(),
        name="hrcdf-sync-units-refresh",
    ),
    path(
        "hrcdf-sync/home-unit/",
        views.HrcdfSyncHomeUnitView.as_view(),
        name="hrcdf-sync-home-unit",
    ),
    path(
        "hrcdf-sync/runs/",
        views.HrcdfSyncRunsView.as_view(),
        name="hrcdf-sync-runs",
    ),
    path(
        "hrcdf-sync/runs/<uuid:job_id>/progress/",
        views.HrcdfSyncProgressView.as_view(),
        name="hrcdf-sync-progress",
    ),
    path(
        "hrcdf-sync/personnel/own/",
        views.HrcdfOwnPersonnelListView.as_view(),
        name="hrcdf-sync-personnel-own",
    ),
    path(
        "hrcdf-sync/personnel/others/",
        views.HrcdfOtherPersonnelListView.as_view(),
        name="hrcdf-sync-personnel-others",
    ),
    # Developed with Understanding: the signed-in user's unit status (CP-L, D29). Its view
    # name users:me-unit-status is in settings.GUEST_ALLOWED_URL_NAMES.
    path(
        "me/unit-status/",
        views.UnitStatusView.as_view(),
        name="me-unit-status",
    ),
]

urlpatterns += router.urls
