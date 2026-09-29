"""Single source of truth for authorization.

One documented module, in the spirit of SWMM ``users/rbac.py`` -- every view
that needs a role check, a scope decision, a grant guard or a menu-permission
lookup goes through the helpers here instead of re-deriving the rule inline.
No ad-hoc unit/role checks in views (review gate -- it is the #1 historical bug
class in both source projects).

Each helper's docstring cites the rule and the failure it prevents.

Origins:
- role-grant / escalation guards, approval routing, nav lock ... SWMM users/rbac.py
- process-scoped roles, effective menu tree, org scope ........ ITTTM access/*
"""

from __future__ import annotations

from collections import namedtuple

from django.utils import timezone

# Re-export the org-scope toolkit so call sites have one import.
from .master_client import get_master_client  # noqa: F401
from .models import (
    Menu,
    Privilege,
    RoleMenuMapping,
    RoleRequest,
    UserMenuMapping,
    UserProcessRoleMapping,
    UserRole,
)
from .scope import (  # noqa: F401
    OrgScopedFilterBackend,
    OrgScopedObjectPermission,
    get_effective_scope,
    resolve_selected_scope,
    scope_as_claim,
    scope_queryset,
    user_can_access_resource,
)

# --------------------------------------------------------------------------
# Stable role codes. NEVER string-match on UserRole.name (build prompt).
# The seed command (seed_rbac) creates exactly these.
# --------------------------------------------------------------------------
ROLE_SUPER_ADMIN = "SUPER_ADMIN"
ROLE_COMMAND_ADMIN = "COMMAND_ADMIN"
ROLE_UNIT_ADMIN = "UNIT_ADMIN"
ROLE_INITIATOR = "INITIATOR"
ROLE_RECOMMENDER = "RECOMMENDER"
ROLE_APPROVER = "APPROVER"
ROLE_USER = "USER"
ROLE_HOD = "HOD"
ROLE_DY_HOD = "DY_HOD"
ROLE_HODWRITER = "HODWRITER"
ROLE_MAINTAINER = "MAINTAINER"
ROLE_STOREKEEPER = "STOREKEEPER"

# SWMM-derived admin roles (seed_all.py port). Both are "admin-ish": their
# authority rank lets can_grant / assignable_roles hand out weaker roles, and
# both are lock-protected (NAV_VISIBILITY_LOCKED_ROLES) so they cannot edit the
# matrix to remove their own access to the nav-admin screen. They do NOT make
# is_super_admin() true -- that stays SUPER_ADMIN / is_admin only.
ROLE_ADMIN = "ADMIN"
ROLE_SHIPADMIN = "SHIPADMIN"

# Authority ranking (lower = more powerful). A grantor may never grant a role
# at or above their own best (lowest-numbered) rank -- see can_grant.
ROLE_AUTHORITY = {
    ROLE_SUPER_ADMIN: 0,
    ROLE_ADMIN: 5,
    ROLE_COMMAND_ADMIN: 10,
    ROLE_UNIT_ADMIN: 20,
    ROLE_SHIPADMIN: 25,
    ROLE_APPROVER: 30,
    ROLE_RECOMMENDER: 40,
    ROLE_INITIATOR: 50,
    ROLE_USER: 90,
}
DEFAULT_AUTHORITY = 100

# The nav key for the RBAC / nav-visibility admin screen. Roles in
# NAV_VISIBILITY_LOCKED_ROLES can never lose nav access to it (visible_nav_keys
# + NavVisibilityViewSet both enforce this), so a mistake in the matrix cannot
# lock an admin out of the screen that fixes RBAC. Origin: SWMM
# NAV_VISIBILITY_LOCKED_ROLES. RBAC_ADMIN_MENU_CODE below is the separate
# Menu/privilege code and is unaffected.
NAV_KEY_RBAC_ADMIN = "nav_visibility"
NAV_VISIBILITY_LOCKED_ROLES = frozenset({ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_SHIPADMIN})
RBAC_ADMIN_MENU_CODE = "rbac_admin"

# Last-resort nav keys for a user with no role / a role with no matrix rows.
GUEST_FALLBACK_KEYS = frozenset({"home"})

# Privilege action keys.
ACTION_VIEW = "view"
ACTION_ADD = "add"
ACTION_EDIT = "edit"
ACTION_DELETE = "delete"
ACTION_EXPORT = "export"
VALID_ACTIONS = frozenset(
    {ACTION_VIEW, ACTION_ADD, ACTION_EDIT, ACTION_DELETE, ACTION_EXPORT}
)


EffectiveRole = namedtuple(
    "EffectiveRole",
    "role_id role_code process_id process_code is_delegated delegation_id delegator_id",
)


# --------------------------------------------------------------------------
# Roles
# --------------------------------------------------------------------------
def _own_role_rows(user, process_id=None):
    qs = UserProcessRoleMapping.objects.filter(
        user=user, is_active=True
    ).select_related("process_role__user_role", "process_role__process")
    if process_id is not None:
        qs = qs.filter(process_role__process_id=process_id)
    return qs


def _delegated_role_rows(user, process_id=None):
    """ACTIVE delegated (role, process) pairs, re-derived live from
    RightsTransfer -- the JWT `delegated_roles` claim is NOT trusted for
    enforcement (build prompt criterion 9)."""
    from delegation.models import RightsTransfer

    out = []
    live = RightsTransfer.objects.filter(
        delegatee=user, status__in=RightsTransfer.LIVE_STATUSES
    ).select_related("delegator")
    for transfer in live:
        rows = _own_role_rows(transfer.delegator, process_id=process_id)
        for row in rows:
            out.append((row, transfer))
    return out


def effective_roles(user, process_id=None):
    """All (role, process) pairs in force for this user right now: own active
    ``UserProcessRoleMapping`` rows plus ACTIVE delegated roles, deduped by
    (role, process). A dead mapping or a revoked delegation disappears here on
    the very next call (build prompt criteria 8 & 9)."""
    if user is None or not getattr(user, "is_authenticated", False):
        return []

    seen = set()
    result = []

    for row in _own_role_rows(user, process_id=process_id):
        pr = row.process_role
        key = (pr.user_role_id, pr.process_id)
        if key in seen:
            continue
        seen.add(key)
        result.append(
            EffectiveRole(
                role_id=pr.user_role_id,
                role_code=pr.user_role.code,
                process_id=pr.process_id,
                process_code=pr.process.code,
                is_delegated=False,
                delegation_id=None,
                delegator_id=None,
            )
        )

    for row, transfer in _delegated_role_rows(user, process_id=process_id):
        pr = row.process_role
        key = (pr.user_role_id, pr.process_id)
        if key in seen:
            continue
        seen.add(key)
        result.append(
            EffectiveRole(
                role_id=pr.user_role_id,
                role_code=pr.user_role.code,
                process_id=pr.process_id,
                process_code=pr.process.code,
                is_delegated=True,
                delegation_id=transfer.id,
                delegator_id=transfer.delegator_id,
            )
        )

    return result


def role_codes_of(user, process_id=None):
    """The set of role codes in force for this user (own + delegated)."""
    return {er.role_code for er in effective_roles(user, process_id=process_id)}


def is_super_admin(user):
    """True for a platform superuser (``is_admin``) or anyone holding the
    SUPER_ADMIN role in any process. Role-based, not merely the Django flag --
    matches SWMM's `can_see_all_departments` intent."""
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_admin", False):
        return True
    return ROLE_SUPER_ADMIN in role_codes_of(user)


def has_role(user, code, process_id=None):
    """True if the user holds ``code`` (optionally within ``process_id``).
    SUPER_ADMIN satisfies every role check."""
    if is_super_admin(user):
        return True
    return code in role_codes_of(user, process_id=process_id)


def best_authority_rank(user, process_id=None):
    """The strongest (numerically lowest) authority rank this user holds.
    Returns DEFAULT_AUTHORITY when the user holds no known role."""
    if is_super_admin(user):
        return ROLE_AUTHORITY[ROLE_SUPER_ADMIN]
    codes = role_codes_of(user, process_id=process_id)
    if not codes:
        return DEFAULT_AUTHORITY
    return min(ROLE_AUTHORITY.get(c, DEFAULT_AUTHORITY) for c in codes)


def authority_of_role(role):
    """Authority rank of a ``UserRole`` -- prefer the stored ``authority_rank``
    column, fall back to the code table."""
    if role is None:
        return DEFAULT_AUTHORITY
    stored = getattr(role, "authority_rank", None)
    if stored is not None:
        return stored
    return ROLE_AUTHORITY.get(role.code, DEFAULT_AUTHORITY)


# --------------------------------------------------------------------------
# Role predicates (SWMM users/rbac.py::is_*_role). Code-keyed -- NEVER
# string-match on UserRole.name. Each is a thin, named wrapper over
# role_codes_of so call sites read like the SWMM originals they replace.
# --------------------------------------------------------------------------
def _actor_department_id(user):
    """The denormalized home-department id on the user's profile, or None --
    the authz analogue of SWMM's ``department_of(user)``. Authoritative org
    scope still lives in ``scope.py``; this is the "home unit" hint only."""
    return getattr(getattr(user, "user_profile", None), "department_id", None)


def is_app_admin(user):
    """The application-superuser role -- authz ``ROLE_ADMIN`` (SWMM role name
    "ADMIN"). Narrow: does NOT fold in SUPER_ADMIN; use ``is_super_admin`` for
    the platform superuser. Origin: SWMM users/rbac.py::is_app_admin_role."""
    return ROLE_ADMIN in role_codes_of(user)


def is_ship_admin(user):
    """The ship's IT Officer -- authz ``ROLE_SHIPADMIN``. A real unit officer
    holding the billet as extra duty: unit-scoped like anyone else except for
    the account-approval / config rights granted explicitly below. Mirror of
    ``is_app_admin``. Origin: SWMM users/rbac.py::is_ship_admin_role."""
    return ROLE_SHIPADMIN in role_codes_of(user)


def is_admin(user):
    """EITHER admin role, or a platform super-admin. The load-bearing widened
    check every admin gate reads -- account status, config edit, nav-matrix
    edit, CO messages. Gates that must stay narrow (``can_see_all_units`` and
    the grant ceiling in ``can_grant``) call ``is_super_admin`` /
    ``is_app_admin`` directly. Origin: SWMM users/rbac.py::is_admin_role."""
    return is_super_admin(user) or is_app_admin(user) or is_ship_admin(user)


def is_command_admin(user):
    """The command-level administrator -- authz ``ROLE_COMMAND_ADMIN`` (SWMM
    role name "COMMAND"). Authority over the whole command, not one unit.
    Origin: SWMM users/rbac.py::is_command_role."""
    return ROLE_COMMAND_ADMIN in role_codes_of(user)


def is_hod(user):
    """Head of Department or Deputy HOD -- treated alike for role-grant and
    approval-routing rights. Origin: SWMM users/rbac.py::is_hod_role."""
    codes = role_codes_of(user)
    return ROLE_HOD in codes or ROLE_DY_HOD in codes


def is_dy_hod(user):
    """Deputy HOD only -- narrower than ``is_hod``. A DY HOD's finer
    sub-department narrowing is a SWMM-domain concern and stays in SWMM's
    facade. Origin: SWMM users/rbac.py::is_dy_hod_role."""
    return ROLE_DY_HOD in role_codes_of(user)


def is_guest_or_unassigned(user):
    """True when the user holds no role at all, or only the fallback
    ``ROLE_USER`` guest role -- nothing that grants a real right. Origin: SWMM
    users/rbac.py::is_guest_or_unassigned."""
    codes = role_codes_of(user)
    return not codes or codes <= {ROLE_USER}


def can_see_all_units(user):
    """Role-based "sees every unit's records anywhere" check -- the authz
    analogue of SWMM's ``can_see_all_departments``. True for a super-admin, an
    app-admin, a command admin, or anyone whose org scope resolves to
    ``all_commands``. Deliberately EXCLUDES the ship IT Officer
    (``is_ship_admin``), who is unit-scoped like any officer -- ``is_admin`` is
    what still gives them the approval / config rights that are not
    unit-scoped. Origin: SWMM users/rbac.py::can_see_all_departments."""
    if is_super_admin(user):
        return True
    if is_app_admin(user) or is_command_admin(user):
        return True
    return bool(get_effective_scope(user).get("all_commands"))


# --------------------------------------------------------------------------
# Grant / escalation guards (SWMM assignable_roles / can_assign_role)
# --------------------------------------------------------------------------
def assignable_roles(actor, process_id=None):
    """The ``UserRole`` queryset ``actor`` may grant:
    - SUPER_ADMIN            : every role
    - anyone else with an    : every role strictly weaker than their own best
      admin-ish authority       authority
    - everyone else          : nothing

    Prevents privilege escalation: a grantor can never hand out a role at or
    above their own authority. Origin: SWMM users/rbac.py::assignable_roles.
    """
    if is_super_admin(actor):
        return UserRole.objects.all().order_by("authority_rank", "name")

    my_rank = best_authority_rank(actor, process_id=process_id)
    if my_rank >= DEFAULT_AUTHORITY:
        return UserRole.objects.none()
    return UserRole.objects.filter(authority_rank__gt=my_rank).order_by(
        "authority_rank", "name"
    )


def can_grant(actor, target_user, role, process, access_level=None, org_ids=None):
    """May ``actor`` grant ``role`` in ``process`` to ``target_user`` at
    ``access_level`` / ``org_ids``.

    Two independent guards, both required (SWMM's `can_assign_role`):
      1. Escalation guard -- ``role``'s authority must be strictly weaker than
         the actor's own best authority (SUPER_ADMIN bypasses).
      2. Scope guard -- every org id being granted must lie inside the actor's
         effective scope (SUPER_ADMIN / all_commands bypasses).

    Re-checked at execution time in ``role-requests/{id}/act/`` -- never only at
    menu-render time (build prompt criterion 7).
    """
    if target_user is None or role is None or process is None:
        return False

    if is_super_admin(actor):
        return True

    # 1. escalation guard
    if authority_of_role(role) <= best_authority_rank(actor, process_id=process.id):
        return False

    # actor must actually operate in this process
    if process.id not in {er.process_id for er in effective_roles(actor)}:
        return False

    # 2. scope guard
    scope = get_effective_scope(actor)
    if scope["is_super_admin"] or scope["all_commands"]:
        return True

    org_ids = org_ids or {}
    checks = (
        ("command_id", "command_ids"),
        ("satellite_unit_id", "satellite_unit_ids"),
        ("trial_unit_id", "trial_unit_ids"),
        ("ship_id", "ship_ids"),
    )
    any_id = False
    for id_key, scope_key in checks:
        value = org_ids.get(id_key)
        if value is None:
            continue
        any_id = True
        if value not in scope[scope_key]:
            return False
    # A grant with no org ids at all is only allowed for an admin-ish actor
    # who is scoped to a single unit (their own).
    if not any_id:
        return (
            best_authority_rank(actor, process_id=process.id)
            <= ROLE_AUTHORITY[ROLE_UNIT_ADMIN]
        )
    return True


def stamp_role_assignment(target_profile, actor_profile):
    """Record who granted a role and when. Caller saves ``target_profile``.
    Origin: SWMM users/rbac.py::stamp_role_assignment."""
    if target_profile is None:
        return
    target_profile.role_assigned_by = actor_profile
    target_profile.role_assigned_on = timezone.now()


# --------------------------------------------------------------------------
# Account-management gates (SWMM can_set_account_status /
# is_in_scope_department / visible_profiles_for). "Department" here is the
# denormalized ``CustomUserProfile.department_id`` home unit; the
# authoritative org scope still lives in ``scope.py``.
# --------------------------------------------------------------------------
def can_set_account_status(actor, target_user):
    """May ``actor`` activate or deactivate ``target_user``'s account.

    Admin roles only (``is_admin``) -- Command and the HODs are excluded
    because for them "save the edit" already MEANS "approve", and a second
    status switch would give one action two contradictory jobs. Never your own
    account: the admin is often the only person who can undo a deactivation, so
    one careless self-toggle would lock the installation out of its own
    administration. Origin: SWMM users/rbac.py::can_set_account_status.
    """
    if not is_admin(actor) or target_user is None:
        return False
    actor_pk = getattr(actor, "pk", None)
    return actor_pk is not None and actor_pk != getattr(target_user, "pk", None)


def is_in_scope_department(actor, target_profile):
    """True if ``actor`` sees every unit (``can_see_all_units`` / ``is_admin``)
    or shares ``target_profile``'s home ``department_id``. The generic
    department gate for account management -- approval routing uses
    ``pending_requests_for`` / ``can_act_on_request`` instead, which understand
    a command admin's command-wide (not unit-scoped) authority. Origin: SWMM
    users/rbac.py::is_in_scope_department.
    """
    if can_see_all_units(actor) or is_admin(actor):
        return True
    dept_id = _actor_department_id(actor)
    return (
        dept_id is not None
        and target_profile is not None
        and getattr(target_profile, "department_id", None) == dept_id
    )


def visible_profiles_for(actor):
    """The ``accounts.CustomUserProfile`` queryset ``actor`` may browse and act
    on from the user-admin screen:

    - super-admin / admin role / command admin : everyone
    - HOD and Dy HOD                            : their own ``department_id``
    - anyone else                              : nobody

    App-admin-role profiles are never listed, to anyone -- exposing an Edit
    button against the superuser only offers a way to lock the install out of
    its own administration. SWMM's extra STATIC-login carve-out keys off an
    ``auth_source`` column authz does not model and stays in SWMM's facade.
    Origin: SWMM users/rbac.py::visible_profiles_for.
    """
    from accounts.models import CustomUserProfile

    if is_super_admin(actor) or is_admin(actor) or is_command_admin(actor):
        queryset = CustomUserProfile.objects.all()
    elif is_hod(actor):
        dept_id = _actor_department_id(actor)
        if dept_id is None:
            return CustomUserProfile.objects.none()
        queryset = CustomUserProfile.objects.filter(department_id=dept_id)
    else:
        return CustomUserProfile.objects.none()
    return queryset.exclude(role__code=ROLE_ADMIN)


# --------------------------------------------------------------------------
# Role-request approval routing (SWMM pending_requests_for / can_act_on_request)
# --------------------------------------------------------------------------
def pending_requests_for(user):
    """The pending ``RoleRequest`` rows this user may act on.

    - SUPER_ADMIN : every request
    - admin-ish   : requests whose org-unit SNAPSHOT (taken at request time,
                    not the requester's current posting) lies in the actor's
                    effective scope, and whose requested role is strictly
                    weaker than the actor's authority
    - everyone else : none

    Routing keys off the snapshot so a request stays with the right approver
    even after the requester is transferred. Origin: SWMM.
    """
    base = RoleRequest.objects.filter(status=RoleRequest.STATUS_PENDING)
    if is_super_admin(user):
        return base

    my_rank = best_authority_rank(user)
    if my_rank >= DEFAULT_AUTHORITY:
        return base.none()

    scope = get_effective_scope(user)
    if scope["is_super_admin"] or scope["all_commands"]:
        candidates = base
    else:
        from django.db.models import Q

        q = Q()
        touched = False
        for id_field, scope_key in (
            ("scope_command_id", "command_ids"),
            ("scope_satellite_unit_id", "satellite_unit_ids"),
            ("scope_trial_unit_id", "trial_unit_ids"),
            ("scope_ship_id", "ship_ids"),
        ):
            ids = scope[scope_key]
            if ids:
                q |= Q(**{f"{id_field}__in": list(ids)})
                touched = True
        candidates = base.filter(q) if touched else base.none()

    weaker_role_ids = list(
        UserRole.objects.filter(authority_rank__gt=my_rank).values_list("id", flat=True)
    )
    return candidates.filter(_role_null_or_weaker_q(weaker_role_ids))


def _role_null_or_weaker_q(weaker_role_ids):
    from django.db.models import Q

    return Q(requested_role__isnull=True) | Q(requested_role_id__in=weaker_role_ids)


def can_act_on_request(user, role_request):
    """May this user approve/reject this specific pending request."""
    if role_request is None:
        return False
    return pending_requests_for(user).filter(pk=role_request.pk).exists()


# --------------------------------------------------------------------------
# Role catalog (SWMM matrix_roles / active_roles / get_role) -- the single set
# every "assign a role" dropdown should draw from.
# --------------------------------------------------------------------------
def matrix_roles():
    """The ``UserRole`` rows that actually have ``NavVisibility`` matrix rows --
    the role columns of the nav-visibility grid. Origin: SWMM
    users/rbac.py::matrix_roles."""
    from .models import NavVisibility

    role_ids = NavVisibility.objects.values_list("role_id", flat=True).distinct()
    return UserRole.objects.filter(id__in=list(role_ids)).order_by(
        "authority_rank", "name"
    )


def active_roles():
    """The canonical live-role set every role dropdown should draw from:
    ``matrix_roles()``, or every role when the matrix has no rows at all (not
    seeded yet). Origin: SWMM users/rbac.py::active_roles."""
    roles = matrix_roles()
    if roles.exists():
        return roles
    return UserRole.objects.all().order_by("authority_rank", "name")


def get_role(role_id):
    """Look up a ``UserRole`` by pk, raising ``UserRole.DoesNotExist`` if
    unknown. Origin: SWMM users/rbac.py::get_role."""
    return UserRole.objects.get(pk=role_id)


# --------------------------------------------------------------------------
# Effective menu permissions -- port of ITTTM access/views.py::getPermission,
# as a server-side callable (not only an endpoint).
# --------------------------------------------------------------------------
def _privileges_for_role_menu(role_ids, process_id, unit_id):
    """{menu_id: set(action codes)} from RoleMenuMapping for these roles in
    this process, honoring the unit_id partial scoping (a NULL unit_id row is
    global; a matching unit_id row also applies)."""
    from django.db.models import Q

    qs = RoleMenuMapping.objects.filter(
        role_id__in=list(role_ids), process_id=process_id
    ).prefetch_related("privileges")
    if unit_id is not None:
        qs = qs.filter(Q(unit_id__isnull=True) | Q(unit_id=unit_id))
    else:
        qs = qs.filter(unit_id__isnull=True)

    out = {}
    for rmm in qs:
        actions = out.setdefault(rmm.menu_id, set())
        actions.update(p.code for p in rmm.privileges.all())
    return out


def _privileges_for_user_menu(user):
    """{menu_id: set(action codes)} from the per-user override table."""
    out = {}
    for umm in UserMenuMapping.objects.filter(user=user).prefetch_related("privileges"):
        out.setdefault(umm.menu_id, set()).update(p.code for p in umm.privileges.all())
    return out


def _all_menu_permissions():
    """{menu_id: [every action]} for every menu -- the SUPER_ADMIN grant."""
    all_actions = sorted(Privilege.objects.values_list("code", flat=True)) or sorted(
        VALID_ACTIONS
    )
    return {
        m_id: list(all_actions)
        for m_id in Menu.objects.values_list("id", flat=True)
    }


def _resolve_process_id(roles, process_id):
    """Fall back to the first effective role's process when none was given."""
    if process_id is not None:
        return process_id
    return roles[0].process_id if roles else None


def role_menu_permissions(user, process_id=None, unit_id=None):
    """``{menu_id: sorted([actions])}`` from ``RoleMenuMapping`` ONLY, for this
    user's effective roles (own + ACTIVE delegated) in the resolved process.
    Ignores ``UserMenuMapping`` overrides -- this is the pure role view.
    SUPER_ADMIN still gets every menu / action."""
    if user is None or not getattr(user, "is_authenticated", False):
        return {}
    if is_super_admin(user):
        return _all_menu_permissions()
    roles = effective_roles(user, process_id=process_id)
    process_id = _resolve_process_id(roles, process_id)
    if process_id is None:
        return {}
    role_ids = {er.role_id for er in roles if er.process_id == process_id}
    return {
        m_id: sorted(actions)
        for m_id, actions in _privileges_for_role_menu(
            role_ids, process_id, unit_id
        ).items()
    }


def user_menu_permissions(user):
    """``{menu_id: sorted([actions])}`` from ``UserMenuMapping`` ONLY (the raw
    per-user override table). Not special-cased for SUPER_ADMIN -- it is the
    literal override set, empty for most users."""
    if user is None or not getattr(user, "is_authenticated", False):
        return {}
    return {
        m_id: sorted(actions)
        for m_id, actions in _privileges_for_user_menu(user).items()
    }


def effective_menu_permissions(user, process_id=None, unit_id=None):
    """The effective menu -> {actions} map for this user: own ∪ delegated.

    - If the user has ANY ``UserMenuMapping`` rows, those overrides are the
      whole story for the menus they cover (ITTTM semantics).
    - Otherwise permissions come from ``RoleMenuMapping`` for every effective
      role (own + ACTIVE delegated) in the resolved process.

    Returns ``{menu_id: sorted([actions])}``. Callers that want the nested tree
    can join against ``Menu``.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return {}

    if is_super_admin(user):
        return _all_menu_permissions()

    roles = effective_roles(user, process_id=process_id)
    process_id = _resolve_process_id(roles, process_id)

    merged = {}

    user_overrides = _privileges_for_user_menu(user)
    for menu_id, actions in user_overrides.items():
        merged.setdefault(menu_id, set()).update(actions)

    if not user_overrides and process_id is not None:
        role_ids = {er.role_id for er in roles if er.process_id == process_id}
        role_perms = _privileges_for_role_menu(role_ids, process_id, unit_id)
        for menu_id, actions in role_perms.items():
            merged.setdefault(menu_id, set()).update(actions)

    return {m_id: sorted(a) for m_id, a in merged.items()}


def resolve_menu_action_allowed(user, menu_code, action, process_id=None, unit_id=None):
    """True if ``user`` may perform ``action`` on the menu identified by
    ``menu_code``. Backs the ``check_access`` decorator and
    ``HasMenuPrivilege``. Origin: ITTTM access/decorators.py::check_access
    (implemented for real -- it is 100% commented out in Project B)."""
    if action not in VALID_ACTIONS:
        raise ValueError(f"Unknown action {action!r}")
    if is_super_admin(user):
        return True
    try:
        menu = Menu.objects.get(code=menu_code)
    except Menu.DoesNotExist:
        return False
    perms = effective_menu_permissions(user, process_id=process_id, unit_id=unit_id)
    return action in set(perms.get(menu.id, ()))


# --------------------------------------------------------------------------
# Nav visibility (SWMM visible_nav_keys) + lockout
# --------------------------------------------------------------------------
def _guest_nav_keys():
    from .models import NavVisibility

    keys = set(
        NavVisibility.objects.filter(
            role__code=ROLE_USER, is_visible=True, nav_item__is_active=True
        ).values_list("nav_item__key", flat=True)
    )
    return keys or set(GUEST_FALLBACK_KEYS)


def visible_nav_keys(user):
    """The set of nav keys this user may see.

    A role WITH matrix rows is honored exactly (even an all-unticked row -- a
    deliberate admin config). A role with NO rows falls back to the live USER
    row rather than rendering an empty or unrestricted sidebar. SUPER_ADMIN
    always keeps the RBAC-admin key, so the matrix can never be edited to lock
    the fixer out of the fix (build prompt criterion 10).

    Origin: SWMM users/rbac.py::visible_nav_keys.
    """
    from .models import NavVisibility

    codes = role_codes_of(user)
    if not codes and not is_super_admin(user):
        return _guest_nav_keys()

    rows = list(
        NavVisibility.objects.filter(role__code__in=list(codes)).values_list(
            "nav_item__key", "is_visible", "nav_item__is_active"
        )
    )
    if not rows and not is_super_admin(user):
        keys = _guest_nav_keys()
    else:
        keys = {k for k, vis, act in rows if vis and act}

    if is_super_admin(user) or codes & NAV_VISIBILITY_LOCKED_ROLES:
        keys.add(NAV_KEY_RBAC_ADMIN)
    return keys


def nav_matrix_would_lock_out(role_code, nav_key, is_visible):
    """Guard for NavVisibilityView: reject an edit that would clear a
    LOCKED role's access to the RBAC-admin nav key."""
    return (
        role_code in NAV_VISIBILITY_LOCKED_ROLES
        and nav_key == NAV_KEY_RBAC_ADMIN
        and not is_visible
    )


# --------------------------------------------------------------------------
# Configuration-edit rights (SWMM can_edit_configuration /
# can_manage_co_messages). Narrower than can_see_all_units -- these are about
# editing shared, org-wide content, not about which unit's records a query
# returns.
# --------------------------------------------------------------------------
def can_edit_configuration(user):
    """May this user edit shared config screens (masters / reference data,
    home-page panels). Admin roles only in authz. SWMM additionally admits the
    EXECUTIVE-department HOD -- a SWMM-domain carve-out that stays in SWMM's
    facade, since "EXECUTIVE" is a SWMM department name authz does not know.
    Origin: SWMM users/rbac.py::can_edit_configuration."""
    return is_admin(user)


def can_manage_co_messages(user):
    """May this user delete a command / CO message from the dashboard -- the
    command admin or any admin role. Origin: SWMM
    users/rbac.py::can_manage_co_messages."""
    return is_command_admin(user) or is_admin(user)
