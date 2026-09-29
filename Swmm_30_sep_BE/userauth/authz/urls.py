from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

app_name = "authz"

router = DefaultRouter()
router.register("processes", views.ProcessViewSet, basename="process")
router.register("roles", views.UserRoleViewSet, basename="userrole")
router.register(
    "role-process-mappings",
    views.RoleProcessMappingViewSet,
    basename="roleprocessmapping",
)
router.register(
    "user-process-roles",
    views.UserProcessRoleMappingViewSet,
    basename="userprocessrole",
)
router.register("menus", views.MenuViewSet, basename="menu")
router.register("privileges", views.PrivilegeViewSet, basename="privilege")
router.register(
    "role-menu-mappings", views.RoleMenuMappingViewSet, basename="rolemenumapping"
)
router.register(
    "user-menu-mappings", views.UserMenuMappingViewSet, basename="usermenumapping"
)
router.register("access-levels", views.AccessLevelViewSet, basename="accesslevel")
router.register(
    "user-access-levels", views.UserAccessLevelViewSet, basename="useraccesslevel"
)
router.register(
    "role-access-level-mappings",
    views.RoleAccessLevelMappingViewSet,
    basename="roleaccesslevelmapping",
)
router.register("nav-items", views.NavItemViewSet, basename="navitem")
router.register(
    "nav-visibility", views.NavVisibilityViewSet, basename="navvisibility"
)

urlpatterns = [
    path("", include(router.urls)),
    path("permissions/", views.PermissionTreeView.as_view(), name="permissions"),
    path("me/scope/", views.MeScopeView.as_view(), name="me-scope"),
    path("role-requests/", views.RoleRequestView.as_view(), name="role-requests"),
    path(
        "role-requests/<int:pk>/act/",
        views.RoleRequestActView.as_view(),
        name="role-request-act",
    ),
    path(
        "notification-recipients/",
        views.NotificationRecipientsView.as_view(),
        name="notification-recipients",
    ),
]
