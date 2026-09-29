"""Mapping between ``authz_service`` identity claims and SWMM's local RBAC
vocabulary.

``authz_service`` is the source of truth for *who a user is* and *what role
they hold*; SWMM still decides *what that role may see/do* through
``users/rbac.py``, which keys off ``CustomUserProfile.role_master.role_name``
and ``CustomUserProfile.department``. The shadow-sync
(``accounts/authz_sync.py``) uses the helpers here to translate an incoming
token into those local rows.
"""

import logging

from django.conf import settings

logger = logging.getLogger(__name__)

# authz_service ``role_code``  ->  SWMM ``Role.role_name``.
#
# SWMM's fixed role set (seed_all.py::ROLES_FIXED): ADMIN, COMMAND, DY HOD,
# Guest user, Head of Department, HODWRITER, Maintainer, SHIPADMIN, STOREKEEPER.
# Names must match rbac.py's constants exactly (ROLE_ADMIN = "SHIPADMIN",
# ROLE_HOD = "Head of Department", ROLE_DY_HOD = "DY HOD", ROLE_GUEST =
# "Guest user", ROLE_ADMIN_LEGACY = "ADMIN", ROLE_COMMAND = "COMMAND").
DEFAULT_ROLE_MAP = {
    "SUPER_ADMIN": "ADMIN",          # also forces CustomUser.is_admin = True
    "ADMIN": "ADMIN",
    "SHIPADMIN": "SHIPADMIN",
    "COMMAND_ADMIN": "COMMAND",
    "HOD": "Head of Department",
    "DY_HOD": "DY HOD",
    "HODWRITER": "HODWRITER",
    "MAINTAINER": "Maintainer",
    "STOREKEEPER": "STOREKEEPER",
    "USER": "Guest user",
    # Trials-only canonical roles with no clean SWMM analogue -> least privilege.
    # Override per deployment via settings.AUTHZ_ROLE_MAP.
    "UNIT_ADMIN": "Guest user",
    "APPROVER": "Guest user",
    "RECOMMENDER": "Guest user",
    "INITIATOR": "Guest user",
}

GUEST_ROLE_NAME = "Guest user"


def role_map():
    """DEFAULT_ROLE_MAP with settings.AUTHZ_ROLE_MAP (a JSON dict from env)
    merged over it, so ops can retune without a code change."""
    override = getattr(settings, "AUTHZ_ROLE_MAP", None) or {}
    if not override:
        return DEFAULT_ROLE_MAP
    return {**DEFAULT_ROLE_MAP, **override}


def swmm_role_name_for(role_code, *, is_super_admin=False):
    """The SWMM ``Role.role_name`` for a token's ``role_code``.

    - ``is_super_admin`` -> always "ADMIN" (privileged, ship-wide).
    - empty / missing code -> ``None`` (genuinely unassigned: rbac treats this
      as a guest / unassigned account).
    - unknown non-empty code -> "Guest user" + a warning (never invent a Role
      row; an unknown name would not match rbac's checks anyway).
    """
    if is_super_admin:
        return "ADMIN"
    if not role_code:
        return None
    mapped = role_map().get(role_code)
    if mapped is None:
        logger.warning(
            "authz role_code %r has no SWMM mapping; treating as %r",
            role_code,
            GUEST_ROLE_NAME,
        )
        return GUEST_ROLE_NAME
    return mapped


def _scope_ids(scope, key):
    value = (scope or {}).get(key) or []
    return [v for v in value if v is not None]


def department_id_from_claims(token, fallback_id=None):
    """The SWMM ``master.Department`` PK for this token, or ``fallback_id``
    (the value already on the shadow profile) when the claim is absent /
    unresolvable. Resolution against the real table happens in authz_sync so
    this module stays import-light."""
    claimed = token.get("department_id")
    return claimed if claimed is not None else fallback_id


def command_id_from_claims(token, fallback_id=None):
    ids = _scope_ids(token.get("scope"), "command_ids")
    return ids[0] if ids else fallback_id


def ship_id_from_claims(token, fallback_id=None):
    ids = _scope_ids(token.get("scope"), "ship_ids")
    return ids[0] if ids else fallback_id
