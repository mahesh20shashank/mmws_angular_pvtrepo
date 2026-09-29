from rest_framework import permissions

from . import rbac


class IsAdminOrShipAdmin(permissions.BasePermission):
    """
    Allows access only to users who are administrators or have the SHIPADMIN role.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_admin:
            return True

        profile = getattr(request.user, "user_profile", None)
        if not profile:
            return False

        role_name = getattr(profile.role_master, "role_name", "")
        return role_name.upper() == "SHIPADMIN"


class CanInitialiseShipData(permissions.BasePermission):
    """Gates the Nomenclature Synchronization screen's CMMS sync steps (ship directory
    pull/select, then Steps 1-5) — matches the reference project's own
    `_can_initialise_ship_data` exactly: `rbac.is_admin_role` (ADMIN or SHIPADMIN) or a
    Head of Department. Deliberately narrower than `rbac.can_see_all_departments`
    (which also admits CO/COMMAND) — a re-sync writes across the whole ship's data and
    the reference project scopes that specifically to the two admin roles plus HOD, not
    every ship-wide-visible role.

    Previously these endpoints had no role check at all beyond IsAuthenticated (the
    project default) — any logged-in user, any role, could trigger a full CMMS
    re-sync via a direct API call, not just through the gated frontend button.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return (
            rbac.is_admin_role(request.user)
            or rbac.role_name_of(request.user) == rbac.ROLE_HOD
        )


class IsShipAdminRole(permissions.BasePermission):
    """Allows access only to users whose role is exactly SHIPADMIN
    (`accounts.rbac.ROLE_ADMIN`). Deliberately narrower than
    `IsAdminOrShipAdmin` -- does NOT accept the `CustomUser.is_admin` flag
    as an alternate path in. Reserved for destructive, admin-only actions
    (e.g. the database reset endpoint) where the RBAC role is the single
    source of truth for who holds that authority."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and rbac.is_admin_role(request.user)
        )


class HasRequiredRole(permissions.BasePermission):
    """
    Checks if the user has at least one of the roles defined in the view's `required_roles` attribute.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_admin:
            return True

        required_roles = getattr(view, "required_roles", None)
        if not required_roles:
            return True

        profile = getattr(request.user, "user_profile", None)
        if not profile:
            return False

        user_role = getattr(profile.role_master, "role_name", "")
        if not user_role:
            return False

        return user_role.upper() in [r.upper() for r in required_roles]


class CanEditConfiguration(permissions.BasePermission):
    """Gates home-page panels and masters/config screens to the application
    admin and the EXECUTIVE department's HOD. See accounts.rbac.can_edit_configuration."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and rbac.can_edit_configuration(request.user)
        )


class CanManageCoMessages(permissions.BasePermission):
    """Only the Commanding Officer or ShipAdmin may create/update/delete a
    dashboard command message. See accounts.rbac.can_manage_co_messages."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and rbac.can_manage_co_messages(request.user)
        )


class HierarchyEditPermission(permissions.BasePermission):
    """Confines writes on the divisional organisation chart to the actor's
    hierarchy_edit_scope (see accounts.rbac): SHIPADMIN and the EXECUTIVE HOD
    may edit anything; any other HOD/Dy HOD only their own department's
    branch; everyone else, nothing.

    `create` is checked here against the submitted parent id. `update`,
    `partial_update` and `destroy` are detail routes, so DRF calls
    has_object_permission via get_object() and that does the real check.
    toggle_sailor_regulator/assign_regulator_bulk are detail=False actions
    that DRF never runs has_object_permission for -- those views do their
    own scope check on the specific node ids they receive.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        scope = rbac.hierarchy_edit_scope(request.user)
        if scope.mode == rbac.HIERARCHY_SCOPE_NONE:
            return False
        if getattr(view, "action", None) == "create":
            return rbac.can_add_hierarchy_child(
                request.user, request.data.get("parent"), scope
            )
        return True

    def has_object_permission(self, request, view, obj):
        scope = rbac.hierarchy_edit_scope(request.user)
        return rbac.can_edit_hierarchy_node(request.user, obj.pk, scope)
