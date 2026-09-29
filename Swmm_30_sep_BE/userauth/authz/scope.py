"""Multi-tier org-hierarchy scoping toolkit.

The analogue of SWMM's department scoping (users/rbac.py
`resolve_selected_department` / `scope_queryset_to_department` /
`DepartmentScopedFilterBackend` / `DepartmentScopedObjectPermission`),
generalized to the ITTTM hierarchy
(SUPER_ADMIN -> NHQ -> COMMAND -> AA_OA -> NATAA -> TRIAL_AGENCY ->
SATELLITE_UNIT -> SHIP).

Ported from ITTTM access/services.py, with the cross-schema `sys.path` master
import removed (anti-pattern #10): expansion of a parent level into child unit
ids goes through the pluggable `master` client
(`authz.master_client.get_master_client`), which defaults to a no-op that only
honors ids explicitly recorded on `UserAccessLevel` rows.
"""

from __future__ import annotations

from functools import reduce
from operator import or_

from django.db.models import Q
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.filters import BaseFilterBackend
from rest_framework.permissions import BasePermission

from .master_client import get_master_client
from .models import UserAccessLevel

# Level codes, high -> low.
LEVEL_SUPER_ADMIN = "SUPER_ADMIN"
LEVEL_NHQ = "NHQ"
LEVEL_COMMAND = "COMMAND"
LEVEL_AA_OA = "AA_OA"
LEVEL_NATAA = "NATAA"
LEVEL_TRIAL_AGENCY = "TRIAL_AGENCY"
LEVEL_SATELLITE_UNIT = "SATELLITE_UNIT"
LEVEL_SHIP = "SHIP"

_EMPTY_SCOPE_KEYS = (
    "command_ids",
    "satellite_unit_ids",
    "trial_unit_ids",
    "ship_ids",
)

# Maps a `resolve_selected_scope` level name to the scope-dict key that holds
# the ids the caller is allowed to select from.
_LEVEL_TO_SCOPE_KEY = {
    "command": "command_ids",
    "command_id": "command_ids",
    "satellite_unit": "satellite_unit_ids",
    "satellite_unit_id": "satellite_unit_ids",
    "trial_unit": "trial_unit_ids",
    "trial_unit_id": "trial_unit_ids",
    "ship": "ship_ids",
    "ship_id": "ship_ids",
}


def _empty_scope(is_super_admin=False):
    return {
        "is_super_admin": bool(is_super_admin),
        "all_commands": bool(is_super_admin),
        "command_ids": set(),
        "satellite_unit_ids": set(),
        "trial_unit_ids": set(),
        "ship_ids": set(),
    }


def get_user_access_levels(user):
    return (
        UserAccessLevel.objects.filter(user=user, is_active=True)
        .select_related("access_level")
        .order_by("access_level__sequence")
    )


def get_effective_scope(user) -> dict:
    """Return the caller's org scope.

    Keys: ``is_super_admin``, ``all_commands`` (bool), and the id sets
    ``command_ids`` / ``satellite_unit_ids`` / ``trial_unit_ids`` /
    ``ship_ids``. When ``is_super_admin`` or ``all_commands`` is true the id
    sets are advisory only -- checks must consult the booleans first.

    Origin: ITTTM access/services.py::get_effective_scope.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return _empty_scope(False)

    # Django-superuser / is_admin short-circuits to unrestricted.
    if getattr(user, "is_admin", False):
        return _empty_scope(True)

    scope = _empty_scope(False)
    master = get_master_client()

    for ual in get_user_access_levels(user):
        code = ual.access_level.access_level_code

        if code == LEVEL_SUPER_ADMIN:
            return _empty_scope(True)

        if code == LEVEL_NHQ:
            scope["all_commands"] = True
            scope["command_ids"].update(master.all_command_ids())
            continue

        if code == LEVEL_COMMAND and ual.command_id:
            scope["command_ids"].add(ual.command_id)
            scope["satellite_unit_ids"].update(
                master.satellite_units_of_command(ual.command_id)
            )
            scope["trial_unit_ids"].update(
                master.trial_units_of_command(ual.command_id)
            )
            scope["ship_ids"].update(master.ships_of_command(ual.command_id))
            continue

        if code in (LEVEL_AA_OA, LEVEL_SATELLITE_UNIT) and ual.satellite_unit_id:
            scope["satellite_unit_ids"].add(ual.satellite_unit_id)
            scope["ship_ids"].update(
                master.ships_of_satellite_unit(ual.satellite_unit_id)
            )
            continue

        if code in (LEVEL_NATAA, LEVEL_TRIAL_AGENCY) and ual.trial_unit_id:
            scope["trial_unit_ids"].add(ual.trial_unit_id)
            scope["ship_ids"].update(
                master.ships_of_trial_unit(ual.trial_unit_id)
            )
            continue

        if code == LEVEL_SHIP and ual.ship_id:
            scope["ship_ids"].add(ual.ship_id)

    return scope


def scope_as_claim(scope: dict) -> dict:
    """JSON-serializable projection for `request.scope_data` and JWT claims."""
    return {
        "is_super_admin": scope["is_super_admin"],
        "all_commands": scope["all_commands"],
        "command_ids": sorted(scope["command_ids"]),
        "satellite_unit_ids": sorted(scope["satellite_unit_ids"]),
        "trial_unit_ids": sorted(scope["trial_unit_ids"]),
        "ship_ids": sorted(scope["ship_ids"]),
    }


def user_can_access_resource(
    user,
    *,
    command_id=None,
    satellite_unit_id=None,
    trial_unit_id=None,
    ship_id=None,
) -> bool:
    """True if the user may touch a resource identified by org ids.

    Origin: ITTTM access/services.py::user_can_access_resource.
    """
    s = get_effective_scope(user)
    if s["is_super_admin"] or s["all_commands"]:
        return True
    if ship_id is not None and ship_id in s["ship_ids"]:
        return True
    if trial_unit_id is not None and trial_unit_id in s["trial_unit_ids"]:
        return True
    if satellite_unit_id is not None and satellite_unit_id in s["satellite_unit_ids"]:
        return True
    if command_id is not None and command_id in s["command_ids"]:
        return True
    if all(
        x is None
        for x in (command_id, satellite_unit_id, trial_unit_id, ship_id)
    ):
        # No org attribution on the object at all -> authenticated is enough.
        return bool(getattr(user, "is_authenticated", False))
    return False


def _as_int(value):
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def resolve_selected_scope(request, level="ship", param=None):
    """SWMM-style scope-param resolution for a single hierarchy level.

    Returns ``(selected_id, is_all)``:
    - ``is_all=True``  -> privileged caller, do not filter.
    - ``selected_id`` set -> filter to exactly that id.
    - ``selected_id=None, is_all=False`` -> caller has no visible scope at this
      level; callers should return ``queryset.none()``.

    A non-privileged caller passing an id that is not in their effective scope
    raises ``PermissionDenied`` -- the forged query param is rejected, never
    silently ignored or honored (anti-IDOR; build prompt criterion 5).

    Origin: SWMM users/rbac.py::resolve_selected_department, generalized.
    """
    param = param or f"{level}_id"
    scope_key = _LEVEL_TO_SCOPE_KEY.get(level)
    if scope_key is None:
        raise ValueError(f"Unknown scope level {level!r}")

    scope = get_effective_scope(request.user)
    privileged = scope["is_super_admin"] or scope["all_commands"]
    params = getattr(request, "query_params", None)
    if params is None:
        params = getattr(request, "GET", {})
    requested_raw = params.get(param)
    allowed_ids = scope[scope_key]

    if privileged:
        if not requested_raw or str(requested_raw).lower() == "all":
            return None, True
        requested = _as_int(requested_raw)
        if requested is None:
            raise ValidationError({param: "Must be an integer id or 'all'."})
        return requested, False

    if requested_raw and str(requested_raw).lower() != "all":
        requested = _as_int(requested_raw)
        if requested is None:
            raise ValidationError({param: "Must be an integer id."})
        if requested not in allowed_ids:
            raise PermissionDenied(
                "You may not view another unit's data at this level."
            )
        return requested, False

    if not allowed_ids:
        return None, False
    if len(allowed_ids) == 1:
        return next(iter(allowed_ids)), False
    # Multiple in-scope ids and no explicit selection -> filter to the whole set
    # via scope_queryset, so signal "not all, not one" with a sentinel list.
    return sorted(allowed_ids), False


def scope_queryset(queryset, user, *, fields=None):
    """Restrict ``queryset`` to the caller's org scope.

    ``fields`` maps scope keys to ORM paths present on the model, e.g.
    ``{"ship_ids": "ship_id", "command_ids": "command_id"}``. Only keys whose
    scope set is non-empty AND that appear in ``fields`` are applied, OR'd
    together. Origin: ITTTM access/services.py::filter_queryset_by_org_scope.
    """
    fields = fields or {
        "command_ids": "command_id",
        "satellite_unit_ids": "satellite_unit_id",
        "trial_unit_ids": "trial_unit_id",
        "ship_ids": "ship_id",
    }
    s = get_effective_scope(user)
    if s["is_super_admin"] or s["all_commands"]:
        return queryset

    parts = []
    for scope_key, orm_path in fields.items():
        ids = s.get(scope_key)
        if ids:
            parts.append(Q(**{f"{orm_path}__in": list(ids)}))

    if not parts:
        return queryset.none()
    return queryset.filter(reduce(or_, parts)).distinct()


class OrgScopedFilterBackend(BaseFilterBackend):
    """Composes with other filter backends to restrict a viewset's queryset to
    the caller's org scope.

    Opt in with::

        filter_backends = [..., OrgScopedFilterBackend]
        org_scope_fields = {"ship_ids": "ship_id", "command_ids": "command_id"}

    Origin: SWMM DepartmentScopedFilterBackend, generalized.
    """

    def filter_queryset(self, request, queryset, view):
        fields = getattr(view, "org_scope_fields", None)
        return scope_queryset(queryset, request.user, fields=fields)


def _resolve_path(obj, orm_path):
    value = obj
    for part in orm_path.split("__"):
        if value is None:
            return None
        value = getattr(value, part, None)
    return value


class OrgScopedObjectPermission(BasePermission):
    """Object-level counterpart to OrgScopedFilterBackend, for
    retrieve/update/destroy. Reuses ``view.org_lookup`` -- a dict mapping the
    ``user_can_access_resource`` kwarg to an attribute/ORM path on the object,
    e.g. ``{"ship_id": "ship_id", "command_id": "unit__command_id"}``.

    Origin: SWMM DepartmentScopedObjectPermission + ITTTM's (commented-out)
    HasResourceOrgAccess.
    """

    def has_object_permission(self, request, view, obj):
        scope = get_effective_scope(request.user)
        if scope["is_super_admin"] or scope["all_commands"]:
            return True
        lookup = getattr(view, "org_lookup", None) or {}
        kwargs = {}
        for kwarg_name, orm_path in lookup.items():
            val = _resolve_path(obj, orm_path)
            if val is not None and hasattr(val, "pk"):
                val = val.pk
            kwargs[kwarg_name] = val
        return user_can_access_resource(request.user, **kwargs)
