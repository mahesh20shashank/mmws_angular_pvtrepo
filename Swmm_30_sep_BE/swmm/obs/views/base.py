"""Shared viewset infrastructure for the `obs` app: mixins, permissions, and the
sub-department scoping bridge every other `obs/views/*.py` module builds on.

Split out of the former flat `obs/views.py` (Part 1 of the obs file-structure split).
"""

from collections import namedtuple

from accounts import rbac
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema
from master.models import SubDepartment
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.filters import BaseFilterBackend
from rest_framework.permissions import BasePermission

from ..excel import ExcelImportExportMixin
from ..serializers import _is_sub_department_confined, _own_sub_department_row
from ..utils import django_validation_error_detail


class CleanValidationMixin:
    def perform_create(self, serializer):
        try:
            serializer.save()
        except DjangoValidationError as error:
            raise DRFValidationError(django_validation_error_detail(error)) from error

    def perform_update(self, serializer):
        try:
            serializer.save()
        except DjangoValidationError as error:
            raise DRFValidationError(django_validation_error_detail(error)) from error


@extend_schema(tags=["OBS"])
class CleanValidationModelViewSet(
    ExcelImportExportMixin,
    CleanValidationMixin,
    viewsets.ModelViewSet,
):
    pass


def payload_pk(request, *keys):
    for key in keys:
        value = request.data.get(key)
        if value not in (None, ""):
            return value
    raise DRFValidationError({keys[0]: "This field is required."})


def request_user_department_id(request):
    profile = getattr(request.user, "user_profile", None)
    department_id = getattr(profile, "department_id", None)
    if department_id is None:
        department_id = getattr(request.user, "department_id", None)
    if department_id is None:
        raise DRFValidationError(
            {"department": "Authenticated user has no department assigned."}
        )
    return department_id


def can_add_equipment_class(user):
    """True when this account may create an `EquipmentClass`.

    Shared between `catalog.EquipmentClassViewSet.department_master` (the "can I add one"
    flag on the Equipment Classes tab) and `misc_master_data.MiscellaneousMasterDataView`
    (the actual create gate), so the two cannot disagree about who may add one.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    return rbac.is_admin_role(user) or rbac.is_hod_role(user)


def user_display_name(user):
    profile = getattr(user, "user_profile", None)
    if profile:
        full_name = f"{profile.firstname or ''} {profile.lastname or ''}".strip()
        if full_name:
            return full_name

    get_full_name = getattr(user, "get_full_name", None)
    if callable(get_full_name):
        full_name = get_full_name()
        if full_name:
            return full_name

    return getattr(user, "username", "")


# ---------------------------------------------------------------------------
# MERGE BRIDGES (obs/views.py <- guest-repo-unknown's feature-ahead obs/views.py).
#
# Everything in this block exists because source's `views.py` calls a `users.rbac`/
# `users.permissions` primitive that has no equivalent under that name in target's
# `accounts.rbac`/`accounts.permissions` (target's users app is now an empty shell; auth
# lives in the `userauth` microservice and `accounts` is SWMM's local shadow of it). Each
# bridge is built on primitives that DO exist in `accounts.rbac`/`accounts.permissions`, or
# reproduces source's own small, self-contained logic locally. Nothing under `accounts/` is
# changed by any of this.
# ---------------------------------------------------------------------------

# --- Blocker 1: `from users.permissions import CanPurgeSpares, CanUseMastersPage,
# IsShipAdminRole`. `IsShipAdminRole` exists in `accounts.permissions` and is imported
# directly where each viewset needs it. `CanUseMastersPage` and `CanPurgeSpares` do not
# exist anywhere in target's `accounts` app, so they are defined here, built on
# `accounts.rbac` primitives, reproducing source's two rules exactly.
class CanUseMastersPage(BasePermission):
    """References > Masters screen: an admin role, a Head of Department, or a Dy HOD."""

    def has_permission(self, request, view):
        user = request.user
        if user is None or not user.is_authenticated:
            return False
        return rbac.is_admin_role(user) or rbac.role_name_of(user) in (
            rbac.ROLE_HOD,
            rbac.ROLE_DY_HOD,
        )


class CanPurgeSpares(BasePermission):
    """Clear OBS Spares: an admin role or a Head of Department (never a Dy HOD)."""

    def has_permission(self, request, view):
        user = request.user
        if user is None or not user.is_authenticated:
            return False
        return rbac.is_admin_role(user) or rbac.role_name_of(user) == rbac.ROLE_HOD


# --- `rbac.can_import_d787j` / `rbac.D787J_IMPORT_DENIED_MESSAGE`: not on `accounts.rbac`.
# Reproduced from source's `users/rbac.py` verbatim, on `accounts.rbac` primitives.
_D787J_IMPORT_DENIED_MESSAGE = (
    "Only ADMIN, SHIPADMIN, a Head of Department, or a DY HOD of an Executive "
    "sub-department may import on the D787J route."
)


def _can_import_d787j(user):
    """True when this account may run an import on the D787J route."""
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    role_name = rbac.role_name_of(user)
    if rbac.is_admin_role(user) or role_name == rbac.ROLE_HOD:
        return True
    if role_name != rbac.ROLE_DY_HOD:
        return False
    return bool(rbac.executive_sub_department_of(user))


# --- `rbac.resolve_selected_sub_department` / `rbac.scope_queryset_to_sub_department` /
# `rbac.SubDepartmentScopedFilterBackend` / `rbac.SubDepartmentScopedObjectPermission`: none
# of these exist on `accounts.rbac` (the sub-department scoping feature was never ported
# there). Bridged locally on `accounts.rbac.is_executive_dy_hod` /
# `executive_sub_department_of`, reusing the exact same bridging approach already
# established in `obs/serializers.py` (`_is_sub_department_confined` /
# `_own_sub_department_row`, imported above) for the sibling gap
# `is_sub_department_confined` / `own_sub_department_row`. `SubDepartmentScope`,
# `SUB_DEPARTMENT_UNASSIGNED` and the resolution logic are reproduced verbatim from source's
# `users/rbac.py`.
SubDepartmentScope = namedtuple(
    "SubDepartmentScope", "sub_department_id is_all unassigned_only deny"
)
SUB_DEPARTMENT_UNASSIGNED = "unassigned"


def _requested_scope_value(request, param):
    """The scoping value a request carries, from the query string or, failing that, the body."""
    value = request.query_params.get(param)
    if value not in (None, ""):
        return value
    data = getattr(request, "data", None)
    if data is None:
        return None
    try:
        value = data.get(param)
    except AttributeError:  # a list body, e.g. a bulk POST - nothing to read
        return None
    return value


def _resolve_selected_sub_department(request, param="sub_department"):
    """Resolve which sub-department a request should be scoped to.

    The sub-department counterpart of `rbac.resolve_selected_department`, and it refuses in
    the same way: a confined caller who names a sub-department that is not their own gets
    `PermissionDenied` rather than being silently redirected to their own.

    `?sub_department=unassigned` asks for the rows that carry none. It is refused for a
    confined caller for the same reason every other sub-department is - those rows are not
    theirs either.
    """
    requested = _requested_scope_value(request, param)
    requested = str(requested).strip() if requested not in (None, "") else ""

    if _is_sub_department_confined(request.user):
        own = _own_sub_department_row(request.user)
        if own is None:
            # The profile names a sub-department that has no row. Nothing can be attributed
            # to this caller, so they see nothing - never everything.
            return SubDepartmentScope(None, False, False, True)
        if requested and requested.lower() != "all" and requested != str(own.pk):
            raise PermissionDenied("You may not view another sub-department's data.")
        return SubDepartmentScope(own.pk, False, False, False)

    if not requested or requested.lower() == "all":
        return SubDepartmentScope(None, True, False, False)
    if requested.lower() == SUB_DEPARTMENT_UNASSIGNED:
        return SubDepartmentScope(None, False, True, False)

    try:
        requested_pk = int(requested)
    except (TypeError, ValueError) as error:
        raise DRFValidationError({param: "Unknown sub-department."}) from error
    if not SubDepartment.objects.filter(pk=requested_pk).exists():
        raise DRFValidationError({param: "Unknown sub-department."})
    return SubDepartmentScope(requested_pk, False, False, False)


def _scope_queryset_to_sub_department(
    queryset, request, field="sub_department_id", param="sub_department"
):
    """Apply `_resolve_selected_sub_department` to a queryset."""
    scope = _resolve_selected_sub_department(request, param=param)
    if scope.deny:
        return queryset.none()
    if scope.is_all:
        return queryset
    if scope.unassigned_only:
        return queryset.filter(**{f"{field.removesuffix('_id')}__isnull": True})
    return queryset.filter(**{field: scope.sub_department_id})


class _SubDepartmentScopedFilterBackend(BaseFilterBackend):
    """Composes with `accounts.rbac.DepartmentScopedFilterBackend` to add the second
    dimension of visibility. Opt in on a viewset with:
        filter_backends = [..., DepartmentScopedFilterBackend, _SubDepartmentScopedFilterBackend]
        sub_department_scope_field = "sub_department_id"
        sub_department_scope_param = "sub_department"  # optional
    """

    def filter_queryset(self, request, queryset, view):
        field = getattr(view, "sub_department_scope_field", "sub_department_id")
        param = getattr(view, "sub_department_scope_param", "sub_department")
        return _scope_queryset_to_sub_department(queryset, request, field=field, param=param)


class _SubDepartmentScopedObjectPermission(BasePermission):
    """Object-level counterpart to `_SubDepartmentScopedFilterBackend`. Only a CONFINED
    caller is restricted; everyone else passes straight through."""

    def has_object_permission(self, request, view, obj):
        if not _is_sub_department_confined(request.user):
            return True
        own = _own_sub_department_row(request.user)
        if own is None:
            return False
        field = getattr(view, "sub_department_scope_field", "sub_department_id")
        value = obj
        for part in field.split("__"):
            if value is None:
                return False
            value = getattr(value, part, None)
        return value == own.pk


# `canonical_department_name` lives in `.utils` now (shared with `services`, which needs it
# too) — see the bridge note there for why it isn't in `master/utils.py`.
