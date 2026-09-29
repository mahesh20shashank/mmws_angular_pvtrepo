"""Concrete, named DRF permission classes.

Every non-public endpoint sets one of these (or uses ``check_access``) -- never
bare ``IsAuthenticated`` outside the allowlist (build prompt criterion 11,
anti-pattern #1).

Origins: SWMM users/permissions.py (concrete BasePermission per view) +
ITTTM access/permissions.py (HasHierarchicalAccess / HasResourceOrgAccess,
which are commented out in Project B and implemented for real here).
"""

from rest_framework.permissions import BasePermission

from . import rbac
from .scope import OrgScopedObjectPermission  # noqa: F401  (re-export)


class IsSuperAdmin(BasePermission):
    """Platform superuser or the SUPER_ADMIN role. Guards every RBAC-config
    CRUD endpoint (build prompt criterion 1)."""

    message = "Super-admin privilege required."

    def has_permission(self, request, view):
        return rbac.is_super_admin(request.user)


class HasRole(BasePermission):
    """User holds at least one of ``view.required_role_codes`` (SUPER_ADMIN
    always satisfies). Origin: SWMM HasRequiredRole."""

    message = "You do not hold a role permitted to use this endpoint."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if rbac.is_super_admin(user):
            return True
        required = set(getattr(view, "required_role_codes", ()) or ())
        if not required:
            return True
        process_id = getattr(view, "process_id", None)
        return bool(required & rbac.role_codes_of(user, process_id=process_id))


class HasMenuPrivilege(BasePermission):
    """User may perform ``view.menu_action`` on ``view.menu_code``.

    Resolves ``UserMenuMapping`` -> ``RoleMenuMapping`` privileges exactly like
    ``check_access``; use this class form when the view is a DRF ViewSet.
    Set on the view::

        menu_code = "rbac_admin"
        menu_action = "edit"          # view/add/edit/delete/export
        menu_action_map = {"GET": "view", "POST": "add", ...}   # optional
    """

    message = "You do not have the required menu privilege."

    def _action_for(self, request, view):
        amap = getattr(view, "menu_action_map", None)
        if amap and request.method in amap:
            return amap[request.method]
        return getattr(view, "menu_action", rbac.ACTION_VIEW)

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        menu_code = getattr(view, "menu_code", None)
        if not menu_code:
            return False
        process_id = getattr(view, "process_id", None)
        if process_id is None and isinstance(getattr(request, "auth", None), dict):
            process_id = request.auth.get("process_id")
        return rbac.resolve_menu_action_allowed(
            user,
            menu_code,
            self._action_for(request, view),
            process_id=process_id,
            unit_id=getattr(view, "unit_id", None),
        )


class HasHierarchicalAccess(BasePermission):
    """Request allowed if the user is super-admin/all-commands, or has ANY
    non-empty org scope from ``UserAccessLevel``.

    Origin: ITTTM access/permissions.py::HasHierarchicalAccess (implemented for
    real -- it is commented out in Project B).
    """

    message = "You have no hierarchical access scope."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        s = rbac.get_effective_scope(user)
        if s["is_super_admin"] or s["all_commands"]:
            return True
        return any(
            (
                s["command_ids"],
                s["satellite_unit_ids"],
                s["trial_unit_ids"],
                s["ship_ids"],
            )
        )


class HasResourceOrgAccess(OrgScopedObjectPermission):
    """Object-level: set ``view.org_lookup`` mapping a
    ``user_can_access_resource`` kwarg to an attribute/ORM path on the object.

    Origin: ITTTM access/permissions.py::HasResourceOrgAccess (implemented for
    real here via ``authz.scope.OrgScopedObjectPermission``).
    """

    message = "This resource is outside your access scope."


class IsInternalService(BasePermission):
    """Guards service-to-service endpoints via the ``X-Service-Key`` header
    (from ``settings.INTERNAL_SERVICE_KEY``, no default)."""

    message = "Valid X-Service-Key header required."

    def has_permission(self, request, view):
        from django.conf import settings

        provided = request.headers.get("X-Service-Key", "")
        expected = settings.INTERNAL_SERVICE_KEY
        return bool(expected) and provided == expected
