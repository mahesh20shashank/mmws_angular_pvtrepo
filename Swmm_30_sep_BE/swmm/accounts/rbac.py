"""Single source of truth for department-based visibility scoping.

A user can either see every department's data (a "privileged" account:
administrators, superusers) or only their own department's data. Every
view/viewset that needs department scoping should go through the helpers
here instead of re-deriving the rule inline, so the privilege check and the
"can't escape your own department via a query param" protection stay
consistent across apps.
"""

from collections import namedtuple

from master.models import Department
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.filters import BaseFilterBackend
from rest_framework.permissions import BasePermission

PRIVILEGED_ACCESS_LEVELS = {"0", "1"}  # ADMINISTRATOR, SUPERUSER

# Role names as they exist in the users_role table -- kept verbatim from the
# source project's role-request/nav-visibility layer so no existing role
# assignment shifts underneath us.
ROLE_COMMAND = "COMMAND"
ROLE_HOD = "Head of Department"
ROLE_DY_HOD = "DY HOD"
ROLE_GUEST = "Guest user"
ROLE_CO = "CO"

# The two admin roles, split apart. ROLE_APP_ADMIN is the application
# superuser -- the static "ADMIN" login that installs and configures the
# system. ROLE_SHIP_ADMIN ("SHIPADMIN") is the ship's IT Officer, a real
# ship's officer holding that billet as an additional duty. They carry
# different scope: the app admin sees/does everything, the ship admin is
# department-scoped like any other officer except for the account-approval
# and configuration rights explicitly granted below.
ROLE_APP_ADMIN = "ADMIN"
ROLE_SHIP_ADMIN = "SHIPADMIN"
# Aliases kept for existing call sites outside this module (users/views.py,
# users/serializers.py, users/permissions.py) -- do not rename or delete.
ROLE_ADMIN = ROLE_SHIP_ADMIN
ROLE_ADMIN_LEGACY = ROLE_APP_ADMIN

# The username of the seeded application-admin login. Matched on the
# USERNAME as well as the role: the ADMIN role may be granted to a second
# account (assignable_roles lets the app admin grant anything), and only
# this one installation account manages the seeded STATIC logins.
STATIC_ADMIN_USERNAME = "ADMIN"

# Roles a HOD or Dy HOD may never grant -- the HOD role itself comes from
# Command, and ADMIN/SHIPADMIN/COMMAND come from the application admin, so
# letting a HOD grant them would be a privilege escalation.
HOD_FORBIDDEN_ROLES = frozenset(
    {ROLE_APP_ADMIN, ROLE_SHIP_ADMIN, ROLE_COMMAND, ROLE_HOD}
)


# Deliberately narrowed to the APPLICATION admin -- the ship's IT Officer is a
# real officer and sees their own department's records like anyone else. See
# can_see_all_departments below, which is the department-scoping mirror of
# this set.
PRIVILEGED_ROLES_LEVELS = frozenset({ROLE_CO, ROLE_APP_ADMIN, ROLE_COMMAND})

# Departments that still exist as rows but must never be offered for
# assignment/selection. ADMIN holds the seeded admin account; HULL and NBCD
# were retired to EXECUTIVE sub-departments but the rows are kept alive
# because other code (e.g. Hotwork's department-id approval lanes) still
# references them by id.
HIDDEN_DEPARTMENTS = frozenset({"ADMIN", "NBCD", "HULL"})


def department_of(user):
    profile = getattr(user, "user_profile", None)
    return getattr(profile, "department", None)


def is_privileged_profile(profile):
    """Privilege check for call sites that only have a CustomUserProfile
    (not the CustomUser), e.g. dashboard KPI aggregation in services.py."""
    role_master = getattr(profile, "role_master", None)
    role_name = getattr(role_master, "role_name", None)
    return role_name in PRIVILEGED_ROLES_LEVELS


def is_app_admin_role(user):
    """True for the APPLICATION admin only -- the static ADMIN login that
    installs and configures the system. Use this where a right must belong
    to the application superuser and not to the ship's IT Officer."""
    return role_name_of(user) == ROLE_APP_ADMIN


def is_ship_admin_role(user):
    """True for the ship's IT Officer only. Narrow, the mirror of
    is_app_admin_role above."""
    return role_name_of(user) == ROLE_SHIP_ADMIN


def is_admin_role(user):
    """True for EITHER admin role.

    This is the load-bearing line of the admin split: it used to mean "is
    SHIPADMIN". Widening it to "app admin OR ship admin" is what lets every
    gate that already reads it (IsAdminOrShipAdmin, can_manage_co_messages,
    assignable_roles, can_assign_role, visible_profiles_for,
    pending_requests_for, NavVisibilityView) keep working for both roles.
    Only the handful of gates that must genuinely differ -- can_see_all_departments,
    assignable_roles/can_assign_role's ceiling, hierarchy_edit_scope -- use the
    narrow helpers above instead."""
    return is_app_admin_role(user) or is_ship_admin_role(user)


def is_static_user_manager(user):
    """True ONLY for the seeded application-admin login -- the ADMIN role
    held by the account whose username is literally ADMIN.

    Narrower than is_app_admin_role on purpose: a seeded STATIC login is an
    installation/test fixture rather than crew, and the rule is that they
    are visible and manageable from that one seeded account and nowhere
    else. A second ADMIN-role holder created later on a live ship is
    deliberately NOT one of these managers -- they get the ordinary admin
    view of the real crew."""
    if not is_app_admin_role(user):
        return False
    return (
        getattr(user, "username", "") or ""
    ).strip().upper() == STATIC_ADMIN_USERNAME


def is_static_profile(profile):
    """True when this profile is a seeded static login account.

    getattr-guarded so this never raises against a database where the
    auth_source migration has not been applied yet -- a missing/blank value
    means "not static", which is the safe answer."""
    if profile is None:
        return False
    from .models import AUTH_SOURCE_STATIC

    return getattr(profile, "auth_source", None) == AUTH_SOURCE_STATIC


def can_set_account_status(actor, target_user):
    """May `actor` activate or deactivate `target_user`'s CustomUser account.

    The two admin roles only -- the application admin and the ship's IT
    Officer. Command and the HODs are deliberately excluded: for them,
    saving the edit page still MEANS "approve", which is how a
    self-registered user (created is_active=False by RegisterView) is let
    in. Handing them a status switch as well would give the same action two
    contradictory jobs.

    Never your own account -- the seeded ADMIN and, on a real ship, the
    single ITO are often the only people who can undo a deactivation, so one
    careless self-toggle would lock the installation out of its own
    administration."""
    if not is_admin_role(actor):
        return False
    if target_user is None:
        return False
    actor_pk = getattr(actor, "pk", None)
    return actor_pk is not None and actor_pk != getattr(target_user, "pk", None)


def is_command_role(user):
    """True for the Commanding Officer role."""
    return role_name_of(user) == ROLE_COMMAND


def is_co_role(user):
    """True when the user may act as the Commanding Officer (CO) approver.

    Case-insensitive on the role name, and `is_admin` accounts count -- the same
    two allowances `IsAdminOrShipAdmin` and the frontend's
    `AccessControlService.hasAnyRole(["CO"])` already make. An exact `== "CO"`
    comparison here is what left CO approval silently doing nothing: the UI
    offered the Approve button (its check is case-insensitive and lets admins
    through), the API accepted the request, and the report came back still
    un-approved with the CMMS sync button disabled.
    """
    if getattr(user, "is_admin", False):
        return True
    return role_name_of(user).upper() == ROLE_CO.upper()


def is_dy_hod_role(user):
    """True only for DY HOD -- narrower than is_hod_role, which also matches
    HOD. HOD sees their whole department; a DY HOD *of EXECUTIVE* is further
    narrowed to their own sub-department wherever a view opts into that (see
    is_executive_dy_hod / scope_queryset_to_department's sub_department_field).
    DY HOD in any other department is not a sub-department-scoped role at
    all -- use is_executive_dy_hod, not this, to gate that narrowing."""
    return role_name_of(user) == ROLE_DY_HOD


def is_executive_dy_hod(user):
    """True only for a DY HOD whose own department is EXECUTIVE -- the one
    department that actually has sub-divisions (HULL, NBCD, GUNNERY, ASW,
    COMMUNICATION, ND, AVIATION, HYGIENE). EXECUTIVE's HOD still sees the
    whole department; a DY HOD in any other department is not narrowed by
    sub-department at all and also sees their whole department, exactly
    like a HOD. This is the gate scope_queryset_to_department's
    sub_department_field and DepartmentScopedObjectPermission's
    department_scope_sub_field consult -- narrower than is_dy_hod_role."""
    if not is_dy_hod_role(user):
        return False
    department = department_of(user)
    return (
        department is not None
        and (department.name or "").strip().upper() == EXECUTIVE_DEPARTMENT
    )


def executive_sub_department_of(user):
    """The free-text EXECUTIVE sub-department (HULL, NBCD, GUNNERY, ...) a DY
    HOD belongs to, or None if unset. Only meaningful once department
    scoping has already confirmed the caller is in EXECUTIVE -- a DY HOD in
    any other department has nothing here and callers should treat that as
    "no visibility" rather than "see everything", per scope_queryset_to_department."""
    profile = getattr(user, "user_profile", None)
    value = (getattr(profile, "executive_sub_department", "") or "").strip()
    return value or None


def is_hod_role(user):
    """True for HOD and Dy HOD, treated identically for role-grant rights."""
    return role_name_of(user) in (ROLE_HOD, ROLE_DY_HOD)


def is_guest_or_unassigned(user):
    """True when the user has no role yet, or holds Guest user."""
    name = role_name_of(user)
    return name == "" or name == ROLE_GUEST


def assignable_roles(actor):
    """The Role queryset this actor is permitted to grant:
    - application admin : every role, to anyone
    - ship IT Officer   : every role EXCEPT ADMIN, to anyone in any department
    - Command           : the Head of Department role only
    - HOD and Dy HOD    : any role except ADMIN, SHIPADMIN and HOD (and COMMAND)
    - anyone else       : nothing
    """
    from .models import Role

    if is_app_admin_role(actor):
        return Role.objects.all().order_by("role_name")
    # Code note: approving the role of everyone who logs in is the ITO's job, so
    # he may grant any role to anyone in any department -- but NOT the
    # application superuser role, or he could mint a second one and escalate
    # past his own ceiling.
    if is_ship_admin_role(actor):
        return Role.objects.exclude(role_name=ROLE_APP_ADMIN).order_by("role_name")
    if is_command_role(actor):
        return Role.objects.filter(role_name=ROLE_HOD)
    if is_hod_role(actor):
        return Role.objects.exclude(role_name__in=list(HOD_FORBIDDEN_ROLES)).order_by(
            "role_name"
        )
    return Role.objects.none()


def can_assign_role(actor, target_profile, role):
    """May `actor` grant `role` to `target_profile`:
      - application admin : unconstrained -- any role, to anyone
      - ship IT Officer   : any role except ADMIN, to anyone in any department
      - Command           : the Head of Department role only
      - HOD and Dy HOD    : any role except ADMIN, SHIPADMIN, COMMAND and HOD,
                            and only to a user in their OWN (current) department
      - anyone else       : nobody
    Every assignment should still be recorded via stamp_role_assignment so
    a HOD can see whether a grant came from themselves or the admin."""
    if target_profile is None:
        return False
    if is_app_admin_role(actor):
        return True
    if role is None:
        return False
    role_name = (role.role_name or "").strip()
    # Code note: mirrors the assignable_roles branch above -- this is the
    # boundary that actually stops privilege escalation; the dropdown
    # filtering in assignable_roles is only the UX half of the same rule.
    if is_ship_admin_role(actor):
        return role_name != ROLE_APP_ADMIN
    if is_command_role(actor):
        return role_name == ROLE_HOD
    if is_hod_role(actor):
        if role_name in HOD_FORBIDDEN_ROLES:
            return False
        actor_department = department_of(actor)
        if actor_department is None or target_profile.department_id is None:
            return False
        return actor_department.id == target_profile.department_id
    return False


def _exclude_app_admin(queryset):
    """Drop the application-superuser profiles from a list. Nobody browses
    or edits an ADMIN-role account from the Users page -- not even the
    admin itself -- since exposing an Edit button against it only offers a
    way to lock the installation out of its own superuser."""
    return queryset.exclude(role_master__role_name=ROLE_APP_ADMIN)


def _exclude_static(queryset):
    """Drop the seeded static login accounts from a list."""
    from .models import AUTH_SOURCE_STATIC

    return queryset.exclude(auth_source=AUTH_SOURCE_STATIC)


def visible_profiles_for(actor):
    """The CustomUserProfile queryset this actor may browse and act on from
    the Users page:
      - application admin, ship IT Officer, Command : everyone
      - HOD and Dy HOD                               : their own department only
      - anyone else                                  : nobody

    Two exclusions sit on top of every branch:
      1. ADMIN-role profiles are never listed, to anyone.
      2. STATIC profiles -- the seeded installation logins -- are listed
         ONLY to the seeded ADMIN account (is_static_user_manager). Everyone
         else sees real crew only, which is what they actually administer.
    """
    from .models import CustomUserProfile

    manages_static = is_static_user_manager(actor)

    if is_admin_role(actor) or is_command_role(actor):
        queryset = CustomUserProfile.objects.all()
    elif is_hod_role(actor):
        department = department_of(actor)
        if department is None:
            return CustomUserProfile.objects.none()
        queryset = CustomUserProfile.objects.filter(department=department)
    else:
        return CustomUserProfile.objects.none()

    queryset = _exclude_app_admin(queryset)
    if not manages_static:
        queryset = _exclude_static(queryset)
    return queryset


def pending_requests_for(user):
    """The pending RoleRequest rows this user is entitled to act on:
    - application admin : every department, any role
    - Command           : requests for the Head of Department role only,
                          ship-wide (not confined to their own department)
    - HOD and Dy HOD    : requests whose department SNAPSHOT
                          (RoleRequest.department, taken at request time)
                          matches their own -- NOT the requester's
                          current department, which may have moved since
    - anyone else       : none
    """
    from .models import RoleRequest

    base = RoleRequest.objects.filter(status=RoleRequest.STATUS_PENDING)

    if is_admin_role(user):
        return base
    if is_command_role(user):
        return base.filter(requested_role__role_name=ROLE_HOD)
    if is_hod_role(user):
        department = department_of(user)
        if department is None:
            return base.none()
        return base.filter(department=department)
    return base.none()


def can_act_on_request(user, role_request):
    """May this user approve or reject this specific pending role request."""
    if role_request is None:
        return False
    return pending_requests_for(user).filter(pk=role_request.pk).exists()


# Roles that predate the Nav Visibility matrix and were deliberately left
# out of it. Anyone holding one falls back to the Guest menu, so offering
# them in an "assign a role" dropdown is a trap. Used only as the fallback
# inside active_roles() below, for a database where the matrix hasn't been
# seeded yet.
LEGACY_ROLES = frozenset({"CO", "Sailor", "Regulator", "Divisional Officer", "GX"})


def matrix_roles():
    """The role columns of the Nav Visibility matrix -- only roles that
    actually have matrix rows."""
    from .models import NavVisibility, Role

    role_ids = NavVisibility.objects.values_list("role_id", flat=True).distinct()
    return Role.objects.filter(id__in=list(role_ids)).order_by("role_name")


def active_roles():
    """The canonical set of live roles, and the single source every role
    dropdown should draw from. Falls back to 'everything except the legacy
    roles' when the matrix has no rows at all (not seeded yet)."""
    from .models import Role

    roles = matrix_roles()
    if roles.exists():
        return roles
    return Role.objects.exclude(role_name__in=list(LEGACY_ROLES)).order_by("role_name")


def get_role(role_id):
    """Look up a Role by id, raising Role.DoesNotExist if unknown."""
    from .models import Role

    return Role.objects.get(pk=role_id)


def is_in_scope_department(actor_user, target_profile):
    """True if actor_user is privileged, or shares target_profile's
    department. Generic, access_level-based department gate for account
    management (see UserViewSet._authorize_manage). Role-request approval
    uses can_act_on_request/pending_requests_for instead, which understand
    Command's ship-wide (not department-scoped) authority over HOD
    requests."""
    if can_see_all_departments(actor_user):
        return True
    caller_department = department_of(actor_user)
    return (
        caller_department is not None
        and target_profile is not None
        and target_profile.department_id == caller_department.id
    )


def stamp_role_assignment(target_profile, actor_profile):
    """Record who granted a role and when, so a HOD/admin can always see
    whether a role change came from themselves or someone else. Caller is
    responsible for saving target_profile, and for only calling this when
    the role actually changed."""
    if target_profile is None:
        return
    from django.utils import timezone

    target_profile.role_assigned_by = actor_profile
    target_profile.role_assigned_on = timezone.now()


def can_see_all_departments(user):
    """True for the roles entitled to every department's records anywhere in
    the application -- the Commanding Officer, the APPLICATION admin and
    Command. Role-based only: an `is_admin` (Django-superuser) account
    without one of these role_master rows does NOT get this.

    SHIPADMIN is deliberately EXCLUDED: the ship's IT Officer is a real
    officer holding that billet as an additional duty, so they see their own
    department's inventory/DART/maintenance records like anyone else --
    is_admin_role (which admits both admin roles) is what still gives them
    the account-approval and configuration rights that must not be
    department-scoped."""
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    return role_name_of(user) in PRIVILEGED_ROLES_LEVELS


def selectable_departments():
    """The departments a user may be assigned to or choose from -- active
    rows minus the hidden ones (ADMIN, NBCD, HULL). This is what department
    dropdowns should draw from, so the retired/reserved rows stay out of
    reach while remaining present for code that still needs them by id.

    Department.name has no DB-level uniqueness constraint and the table has
    accumulated duplicate rows sharing the same name, which showed up as
    repeated entries in the Home Gallery dropdown. distinct("name") (a
    Postgres DISTINCT ON, matching order_by's leading field) collapses those
    to the lowest-id row per name without touching the underlying data."""
    return (
        Department.objects.exclude(name__in=list(HIDDEN_DEPARTMENTS))
        .order_by("name", "id")
        .distinct("name")
    )


def visible_departments_for(user):
    if can_see_all_departments(user):
        return selectable_departments()
    department = department_of(user)
    if department is None:
        return Department.objects.none()
    return Department.objects.filter(pk=department.pk)


def resolve_selected_department(request, param="department_id"):
    """Resolve which department a request should be scoped to.

    Returns ``(selected_department_id, is_all)``:
    - ``is_all=True`` -> caller may see everything, do not filter.
    - ``selected_department_id`` set, ``is_all=False`` -> filter to that pk.
    - ``selected_department_id=None``, ``is_all=False`` -> caller has no
      visible department at all; callers should return ``queryset.none()``.

    A non-privileged user passing a ``department_id`` that isn't their own
    raises ``PermissionDenied`` instead of silently being ignored or honored
    - this is what stops a forged query param from leaking another
    department's data.
    """
    user = request.user
    requested = request.query_params.get(param)
    privileged = can_see_all_departments(user)
    own_department = department_of(user)

    if privileged:
        if not requested or str(requested).lower() == "all":
            return None, True
        if not Department.objects.filter(pk=requested).exists():
            raise ValidationError({param: "Unknown department."})
        return requested, False

    if requested and str(requested).lower() != "all":
        if own_department is None or str(requested) != str(own_department.pk):
            raise PermissionDenied("You may not view another department's data.")

    if own_department is None:
        return None, False
    return own_department.pk, False


def scope_queryset_to_department(
    queryset,
    request,
    field="department_id",
    param="department_id",
    sub_department_field=None,
):
    """sub_department_field, if given, is an additional `__`-separated ORM
    path to a master.SubDepartment's name (e.g. "sub_department__name" or
    "equipment_name__sub_department_f_key__name"). It only takes effect for
    a DY HOD of EXECUTIVE (is_executive_dy_hod) -- the one department with
    real sub-divisions: the queryset is narrowed a second time to rows whose
    sub-department name matches the caller's own executive_sub_department,
    case-insensitively. HOD (EXECUTIVE or otherwise) is unaffected and
    continues to see the whole department, and so is a DY HOD outside
    EXECUTIVE -- this parameter distinguishes only the EXECUTIVE DY HOD
    case. An EXECUTIVE DY HOD with no executive_sub_department set gets
    queryset.none() rather than silently falling back to the whole
    department, matching how resolve_selected_department already refuses to
    silently widen scope. Callers that don't pass sub_department_field are
    unaffected either way -- this is opt-in."""
    selected, is_all = resolve_selected_department(request, param=param)
    if is_all:
        return queryset
    if selected is None:
        return queryset.none()
    queryset = queryset.filter(**{field: selected})
    if sub_department_field and is_executive_dy_hod(request.user):
        sub_department = executive_sub_department_of(request.user)
        if sub_department is None:
            return queryset.none()
        return queryset.filter(**{f"{sub_department_field}__iexact": sub_department})
    return queryset


class DepartmentScopedFilterBackend(BaseFilterBackend):
    """Composes with other filter backends (e.g. DjangoFilterBackend) to
    restrict a viewset's queryset to the caller's visible department(s).

    Opt in on a viewset with:
        filter_backends = [..., DepartmentScopedFilterBackend]
        department_scope_field = "equipment_name__section__department_id"
        department_scope_param = "department_id"  # optional, defaults to "department_id"
        department_scope_sub_field = "equipment_name__sub_department__name"  # optional
    """

    def filter_queryset(self, request, queryset, view):
        field = getattr(view, "department_scope_field", "department_id")
        param = getattr(view, "department_scope_param", "department_id")
        sub_field = getattr(view, "department_scope_sub_field", None)
        return scope_queryset_to_department(
            queryset,
            request,
            field=field,
            param=param,
            sub_department_field=sub_field,
        )


def _resolve_attr_path(obj, orm_path):
    """Walk the same `__`-separated path used for queryset filtering as
    plain attribute access on a model instance, e.g.
    "equipment_name__section__department_id" ->
    obj.equipment_name.section.department_id.
    """
    value = obj
    for part in orm_path.split("__"):
        if value is None:
            return None
        value = getattr(value, part, None)
    return value


class DepartmentScopedObjectPermission(BasePermission):
    """Object-level counterpart to DepartmentScopedFilterBackend, for
    retrieve/update/destroy on a single instance. Reuses the same
    `view.department_scope_field` ORM path (e.g.
    "equipment_name__section__department_id") as plain attribute access, and
    optionally `view.department_scope_sub_field` for the same EXECUTIVE DY
    HOD sub-department narrowing scope_queryset_to_department applies to
    lists.
    """

    def has_object_permission(self, request, view, obj):
        if can_see_all_departments(request.user):
            return True
        own_department = department_of(request.user)
        if own_department is None:
            return False
        field = getattr(view, "department_scope_field", "department_id")
        obj_department_id = _resolve_attr_path(obj, field)
        if obj_department_id is None or obj_department_id != own_department.pk:
            return False
        sub_field = getattr(view, "department_scope_sub_field", None)
        if sub_field and is_executive_dy_hod(request.user):
            sub_department = executive_sub_department_of(request.user)
            if sub_department is None:
                return False
            obj_sub_department = _resolve_attr_path(obj, sub_field)
            return (
                isinstance(obj_sub_department, str)
                and obj_sub_department.strip().upper() == sub_department.upper()
            )
        return True


# ----------------------------------------------------------------------------
# Nav visibility: the role x nav-item matrix the frontend keys its sidebar
# off of. NavItem is only the registry of section identities (key/label/
# order) - icons, routes and markup stay in the frontend; NavVisibility is
# the matrix itself (see accounts.models). Seeded by
# users/management/commands/seed_rbac.py and edited via NavVisibilityView.
# ----------------------------------------------------------------------------

NAV_ITEMS = [
    ("home", "Home", 10),
    ("activity_planner", "Activity Planner", 20),
    ("ship_configuration", "Ship Configuration", 30),
    ("op_maintenance", "Op. Maintenance", 40),
    ("op_utilities", "Op. Utilities", 45),
    ("inventory", "Inventory", 50),
    ("ship_returns", "Ship Returns", 60),
    ("trials", "Trials", 65),
    ("refit_maintenance", "Refit Maintenance", 70),
    ("other_utilities", "Other Utilities", 80),
    ("kms", "KMS", 85),
    ("help_desk", "Help Desk", 90),
    ("ship_crew", "Ship Crew", 100),
    ("nav_visibility", "Nav Visibility", 110),
    ("users", "Users", 120),
]

# Last-resort nav keys for a user with no profile, no role, or a role with
# zero matrix rows (never seeded, or deliberately left out of the matrix).
GUEST_FALLBACK_KEYS = frozenset({"home", "ship_crew"})

# Command and the application admin must always be able to reach the Nav
# Visibility screen, even if a matrix row was unticked or never seeded -
# otherwise a mistake there could lock everyone (including themselves) out
# of the only place that fixes it. Enforced here (visible_nav_keys) and in
# NavVisibilityView, so the matrix can't be edited to take it away either.
NAV_VISIBILITY_LOCKED_ROLES = frozenset({ROLE_SHIP_ADMIN, ROLE_APP_ADMIN})
NAV_KEY_NAV_VISIBILITY = "nav_visibility"


def get_profile(user):
    """Return the CustomUserProfile or None, never raise - tolerant of
    AnonymousUser and profile-less accounts."""
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    return getattr(user, "user_profile", None)


def role_name_of(user):
    """Return the user's role name, or '' if unresolved."""
    role = getattr(get_profile(user), "role_master", None)
    return (role.role_name or "").strip() if role else ""


def _guest_nav_keys():
    """The live Guest user row of the matrix, or GUEST_FALLBACK_KEYS if that
    role itself has no rows yet (matrix not seeded)."""
    from .models import NavVisibility

    keys = set(
        NavVisibility.objects.filter(
            role__role_name=ROLE_GUEST,
            is_visible=True,
            nav_item__is_active=True,
        ).values_list("nav_item__key", flat=True)
    )
    return keys or set(GUEST_FALLBACK_KEYS)


def visible_nav_keys(user):
    """The set of nav keys this user may see. A role with matrix rows is
    honoured exactly, even if every cell is unticked - that is a deliberate
    admin configuration. A role with no rows at all (unseeded, or never
    added to the matrix) falls back to the live Guest user matrix row
    rather than rendering an empty or unrestricted sidebar."""
    profile = get_profile(user)
    role = getattr(profile, "role_master", None)
    if role is None:
        return _guest_nav_keys()

    from .models import NavVisibility

    rows = list(
        NavVisibility.objects.filter(role=role).values_list(
            "nav_item__key", "is_visible", "nav_item__is_active"
        )
    )
    if not rows:
        keys = _guest_nav_keys()
    else:
        keys = {key for key, is_visible, is_active in rows if is_visible and is_active}

    role_name = (role.role_name or "").strip()
    if role_name in NAV_VISIBILITY_LOCKED_ROLES:
        keys.add(NAV_KEY_NAV_VISIBILITY)
    return keys


# ----------------------------------------------------------------------------
# Configuration-edit rights: home-page panels, masters/config screens, and
# the CO/command-message board. Narrower than can_see_all_departments -- both
# of these are about editing shared, ship-wide content, not about which
# department's records a query returns.
# ----------------------------------------------------------------------------

EXECUTIVE_DEPARTMENT = "EXECUTIVE"

# EXECUTIVE's sub-divisions, per is_executive_dy_hod's docstring above -- the
# free-text values a DY HOD's executive_sub_department can hold. Fixed list
# (not DB-backed) so the Know Your Regulator page's EXECUTIVE grouping renders
# even before any profile has one of these values set.
EXECUTIVE_SUB_DEPARTMENTS = (
    "HULL",
    "NBCD",
    "GUNNERY",
    "ASW",
    "COMMUNICATION",
    "ND",
    "AVIATION",
    "HYGIENE",
    "LOGISTICS",
    "PGD",
    "OMS",
)


def can_edit_configuration(user):
    """May this user edit the home page panels and the masters/config
    screens. Restricted to the application admin and the EXECUTIVE
    department's HOD, mirroring the source project's edit_access rule."""
    if is_admin_role(user):
        return True
    if is_hod_role(user):
        department = department_of(user)
        if (
            department is not None
            and (department.name or "").strip().upper() == EXECUTIVE_DEPARTMENT
        ):
            return True
    return False


def can_manage_co_messages(user):
    """True for the Commanding Officer or ShipAdmin -- the only roles
    allowed to delete a command message from the dashboard."""
    return is_command_role(user) or is_admin_role(user)


# ----------------------------------------------------------------------------
# Divisional organisation chart: branch-scoped edit rights.
#
# can_edit_configuration above is all-or-nothing. A Head of Department
# outside EXECUTIVE must be able to maintain their OWN department's branch of
# the chart (their Divisional Officers, divisions and sailors) without being
# able to touch the Commanding Officer, their own HOD card, or another
# department's branch. The scope below expresses that as an explicit set of
# node ids, computed once per request and passed into the per-node checks.
# ----------------------------------------------------------------------------

HIERARCHY_SCOPE_ALL = "all"  # ADMIN + SHIPADMIN: unrestricted
HIERARCHY_SCOPE_BRANCH = "branch"  # other HOD/Dy HOD: own department's subtree
HIERARCHY_SCOPE_NONE = "none"  # everyone else: nothing

# HierarchyForChart.parent is a nullable self-FK with no cycle constraint, so
# a chart edited directly through Django admin can genuinely contain a loop.
# This caps the descent as a second brake behind the `seen` set below.
HIERARCHY_MAX_DEPTH = 50

HierarchyScope = namedtuple("HierarchyScope", "mode roots editable addable")


def _hierarchy_rows():
    """One flat read of the whole chart: (id, parent_id, node_type,
    user_department_id) tuples. The chart is a few hundred rows at most, so a
    single values_list beats walking parent links one query at a time.
    user__department_id follows the nullable user FK and comes back None
    when no person is attached -- exactly the "cannot attribute this node to
    a department" case, which must never match anybody."""
    from master.models import HierarchyForChart

    return list(
        HierarchyForChart.objects.values_list(
            "id", "parent_id", "node_type", "user__department_id"
        )
    )


def hierarchy_edit_scope(user):
    """Which divisional organisation nodes may this user change.

    Building and maintaining the chart is the admin's job -- the application
    admin and the ship's IT Officer, and nobody else. EVERY Head of
    Department, the EXECUTIVE HOD included, is confined to the subtree BELOW
    the 'hod' node(s) whose attached officer sits in their own department.
    Everyone else gets nothing.

    Deliberately NOT can_edit_configuration -- that helper also admits the
    EXECUTIVE HOD, which would give that one officer unrestricted rights over
    every department's branch of the chart. can_edit_configuration itself is
    unchanged, so the EXECUTIVE HOD keeps the home panels and the masters
    page; only the chart right is withdrawn here."""
    if is_app_admin_role(user) or is_ship_admin_role(user):
        return HierarchyScope(HIERARCHY_SCOPE_ALL, frozenset(), None, None)

    if not is_hod_role(user):
        return HierarchyScope(
            HIERARCHY_SCOPE_NONE, frozenset(), frozenset(), frozenset()
        )

    department = department_of(user)
    if department is None:
        # No department recorded -- deny rather than guess which branch is theirs.
        return HierarchyScope(
            HIERARCHY_SCOPE_NONE, frozenset(), frozenset(), frozenset()
        )

    rows = _hierarchy_rows()

    # Every 'hod' node whose attached officer belongs to this department.
    # There may legitimately be more than one (a HOD and a Dy HOD both
    # carded, or a stale row left by a handover), so all of them are treated
    # as roots and their subtrees unioned -- refusing to choose would strand
    # a real branch. Departments are compared by id, not by name: names are
    # free text and drift in case and whitespace, ids do not.
    roots = frozenset(
        node_id
        for node_id, _parent_id, node_type, dept_id in rows
        if node_type == "hod" and dept_id is not None and dept_id == department.id
    )
    if not roots:
        # This HOD has no card on the chart, so there is no branch to own.
        return HierarchyScope(
            HIERARCHY_SCOPE_NONE, frozenset(), frozenset(), frozenset()
        )

    children = {}
    for node_id, parent_id, _node_type, _dept_id in rows:
        if parent_id is not None:
            children.setdefault(parent_id, []).append(node_id)

    descendants = set()
    frontier = list(roots)
    seen = set(roots)
    depth = 0
    while frontier and depth < HIERARCHY_MAX_DEPTH:
        next_frontier = []
        for node_id in frontier:
            for child_id in children.get(node_id, ()):
                if child_id in seen:
                    continue
                seen.add(child_id)
                descendants.add(child_id)
                next_frontier.append(child_id)
        frontier = next_frontier
        depth += 1

    # Roots are deliberately excluded from `editable` -- a HOD may manage
    # what hangs below their card but must not edit or delete the card
    # itself, which would let them reassign their own billet. They ARE in
    # `addable`, so a new Divisional Officer can be hung directly off the
    # HOD node.
    editable = frozenset(descendants - roots)
    return HierarchyScope(
        HIERARCHY_SCOPE_BRANCH, roots, editable, frozenset(editable | roots)
    )


def _as_node_id(value):
    """POST bodies carry ids as strings while the scope sets hold ints.
    Returns None for anything that is not a plain integer id."""
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def can_edit_hierarchy_node(user, node_id, scope=None):
    """May this user edit or delete this existing node. Pass a precomputed
    scope to keep a request to one extra query."""
    scope = hierarchy_edit_scope(user) if scope is None else scope
    if scope.mode == HIERARCHY_SCOPE_ALL:
        return True
    if scope.mode != HIERARCHY_SCOPE_BRANCH:
        return False
    key = _as_node_id(node_id)
    return key is not None and key in scope.editable


def can_add_hierarchy_child(user, parent_id, scope=None):
    """May this user create a node under this parent. A branch-scoped user
    must always name a parent -- a parentless node would be a new root,
    which is the Commanding Officer's slot."""
    scope = hierarchy_edit_scope(user) if scope is None else scope
    if scope.mode == HIERARCHY_SCOPE_ALL:
        return True
    if scope.mode != HIERARCHY_SCOPE_BRANCH:
        return False
    key = _as_node_id(parent_id)
    return key is not None and key in scope.addable


def can_edit_hierarchy(user):
    """May this user change ANYTHING on the chart."""
    return hierarchy_edit_scope(user).mode != HIERARCHY_SCOPE_NONE


# ----------------------------------------------------------------------------
# DART coordinator carve-out.
#
# Deliberately additive: it does NOT widen can_see_all_departments or
# DepartmentScopedFilterBackend above, which other apps (e.g. ilms) reuse
# verbatim for their own department scoping. Only DART call sites should
# consult is_dart_coordinator.
# ----------------------------------------------------------------------------

DART_COORDINATOR_DEPARTMENT = "ENGINEERING"


def is_dart_coordinator(user):
    """True for the Engineering HOD, who coordinates DARTs across the ship
    and therefore sees other departments' DARTs. Derived from data already
    held -- Head of Department of ENGINEERING -- so no new field or role row
    is needed. Grants cross-department sight of DARTs only, not of
    inventory or other domains. HOD only -- Dy HOD is deliberately excluded,
    matching the source project's role_name_of(user) != ROLE_HOD check."""
    if role_name_of(user) != ROLE_HOD:
        return False
    department = department_of(user)
    if department is None:
        return False
    return (department.name or "").strip().upper() == DART_COORDINATOR_DEPARTMENT


# ----------------------------------------------------------------------------
# Single-ship login restriction: this application serves one ship only. A
# user's ship is recorded in CustomUserProfile.section, and is compared
# against the single ShipIdentity row, which self-learns the first ship name
# it sees and then locks.
# ----------------------------------------------------------------------------

BLANK_SECTION_VALUES = frozenset({"", "NA", "N/A", "NONE", "NULL"})


def resolve_ship_name():
    """The configured ship name, upper-cased, or '' if unset."""
    from .models import ShipIdentity

    identity = ShipIdentity.get_solo()
    return (identity.ship_name or "").strip().upper()


def _normalise_section(profile):
    """The ship name recorded on a profile, upper-cased."""
    if profile is None:
        return ""
    return (getattr(profile, "section", "") or "").strip().upper()


def login_ship_check(profile):
    """Returns (allowed, message). A blank or 'NA' section is allowed
    through -- every profile that predates a real HRCDF sync has no ship
    recorded, so refusing them would lock out the entire existing crew.
    Returns True when the ship name has not been configured yet, so a fresh
    install is never bricked before the seed has run."""
    configured = resolve_ship_name()
    if not configured:
        return True, ""

    section = _normalise_section(profile)
    if section in BLANK_SECTION_VALUES:
        return True, ""

    if section == configured:
        return True, ""

    return False, (
        "This application serves %s only. Your record belongs to %s."
        % (configured, section)
    )


def adopt_ship_name_if_unset(profile):
    """Learn the ship name from the first user who carries one. Only fires
    when the name has never been set and the identity row is not locked.
    Once adopted the row is locked and login_ship_check enforces it from
    then on."""
    from .models import ShipIdentity

    identity = ShipIdentity.get_solo()
    if identity.is_locked or (identity.ship_name or "").strip():
        return identity

    section = _normalise_section(profile)
    if section in BLANK_SECTION_VALUES:
        return identity

    identity.ship_name = section
    identity.is_locked = True
    identity.save(update_fields=["ship_name", "is_locked", "updated_on"])
    return identity


def off_ship_profile_count(name):
    """Count the crew records login_ship_check would refuse under `name`.
    Mirrors login_ship_check exactly -- both sides upper-cased, blank/'NA'
    sections let through -- so this is the number of people who would
    actually be turned away, not an estimate. Iterated in Python rather
    than filtered in SQL so the two can never drift apart."""
    from .models import CustomUserProfile

    target = (name or "").strip().upper()
    if not target:
        return 0

    count = 0
    for section in CustomUserProfile.objects.values_list("section", flat=True):
        value = (section or "").strip().upper()
        if value in BLANK_SECTION_VALUES:
            continue
        if value != target:
            count += 1
    return count


# ----------------------------------------------------------------------------
# Auto-raise a role request on login, for a user with no role assigned yet.
# ----------------------------------------------------------------------------


def raise_login_request(profile):
    """Idempotent -- if the user already has a pending request, nothing is
    created, so repeated logins do not flood the HOD's inbox."""
    from .models import RoleRequest

    if profile is None:
        return None

    already_pending = RoleRequest.objects.filter(
        requester=profile, status=RoleRequest.STATUS_PENDING
    ).exists()
    if already_pending:
        return None

    return RoleRequest.objects.create(
        requester=profile,
        requested_role=None,
        department=profile.department,
        status=RoleRequest.STATUS_PENDING,
        source=RoleRequest.SOURCE_AUTO_LOGIN,
        remarks="Raised automatically on login because no role is assigned.",
    )


# ----------------------------------------------------------------------------
# AD / HRCDF login gating.
# ----------------------------------------------------------------------------


def should_attempt_ldap(username, user_entry=None):
    """False for seeded STATIC logins, which must always use their local
    password. A STATIC account is an installation/test login (see
    CustomUserProfile.AUTH_SOURCE_STATIC); sending it to AD would either fail
    harmlessly (slow) or, if the personnel number happens to exist in the
    directory, push it down the HRCDF provisioning path it does not belong
    in.

    An unknown username (no local row yet) is allowed through -- it may well
    be an AD user logging in for the first time."""
    from .models import AUTH_SOURCE_STATIC, CustomUser

    if user_entry is None:
        user_entry = (
            CustomUser.objects.filter(username=username)
            .select_related("user_profile")
            .first()
        )
    if user_entry is None or user_entry.user_profile is None:
        return True
    return user_entry.user_profile.auth_source != AUTH_SOURCE_STATIC
