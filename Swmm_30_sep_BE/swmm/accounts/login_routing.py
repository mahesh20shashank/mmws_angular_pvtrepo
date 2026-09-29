# Developed with Understanding: login routing for swmm (CP-K, D25, D26). On a fingerprint
# miss accounts.authz_sync.sync_principal asks one question - does this verified token
# belong to the ship this deployment serves (own) or to another unit (other)? Only the
# claims userauth already issues are read (is_super_admin, role_code, personal_number,
# unit_id), plus the swmm tables of this schema and one best-effort HRCDF single-person
# read (AR4). No sibling service is called and nothing is written here.
"""Classify a verified authz token as an own-ship or an other-ship login."""

import logging

from master.models import Unit

from . import authz_roles, rbac
from .hrcdf_client import fetch_person
from .hrcdf_sync import (
    _as_int,
    is_own_ship_record,
    personnel_number_of,
    record_has_unit,
)
from .models import CustomUserProfile, OtherCustomUserProfile

logger = logging.getLogger(__name__)

LOGIN_OWN = "own"
LOGIN_OTHER = "other"

# Developed with Understanding: D26 step 1 - the two admin role names of accounts.rbac,
# reused rather than retyped. They are always own ship.
ALWAYS_OWN_ROLES = frozenset({rbac.ROLE_APP_ADMIN, rbac.ROLE_SHIP_ADMIN})


# Developed with Understanding: the personal_number claim (CP-E) stripped and upper-cased,
# the same normalisation CP-F match 3 applies. "" when the claim is absent.
def claim_personal_number(token):
    """Return the token's personal_number claim upper-cased, or ""."""
    return str(token.get("personal_number") or "").strip().upper()


# Developed with Understanding: the Master_unit this-ship row, read only. It is never
# created here - Unit.get_this_ship_unit would create it, which a login must not do.
def this_ship_unit():
    """Return the Master_unit this-ship row (the lowest id), or None."""
    return Unit.objects.order_by("id").first()


# Developed with Understanding: one HRCDF single-person read. A record whose own
# personnelNumber is not the number asked for is ignored, so a loose HRCDF match can never
# route or overwrite the wrong person.
def person_record(personal_number):
    """Return the HRCDF record of personal_number, or None."""
    record = fetch_person(personal_number)
    if record is None or personnel_number_of(record) != personal_number:
        return None
    return record


# Developed with Understanding: D26 step 4 on a record in hand - own when D19 places it in
# the home unit, other when it names some other unit, None when it names no unit at all.
def _placement(record, home):
    home_code = (home.code or "").strip()
    if is_own_ship_record(record, home_code, home.hrcdf_unit_id):
        return LOGIN_OWN
    if record_has_unit(record):
        return LOGIN_OTHER
    return None


# Developed with Understanding: the D26 order, exactly -
#   1 is_super_admin, or a role_code that maps to ADMIN or SHIPADMIN       -> own
#   2 no home unit (the Master_unit this-ship row has no code)            -> own
#   3 personal_number claim - an open own-ship row                        -> own
#                             else a current other-unit row               -> other
#   4 HRCDF single lookup - unitCode against the home code, else unitId against
#     the home hrcdf_unit_id
#   5 token unit_id against int(home code), when both parse as integers
#   6 otherwise                                                           -> other
# found, when a dict is passed, receives found["record"] whenever step 4 read HRCDF (the
# record or None), so the caller's login refresh never makes a second HRCDF call.
def classify_login(token, found=None):
    """Return LOGIN_OWN or LOGIN_OTHER for a verified token."""
    if bool(token.get("is_super_admin")):
        return LOGIN_OWN
    # Developed with Understanding: the role map is read directly, so an unknown code does
    # not log the authz_roles warning a second time on the same request.
    if authz_roles.role_map().get(token.get("role_code")) in ALWAYS_OWN_ROLES:
        return LOGIN_OWN

    home = this_ship_unit()
    home_code = ((home.code if home is not None else "") or "").strip()
    if not home_code:
        return LOGIN_OWN

    number = claim_personal_number(token)
    if number:
        if CustomUserProfile.objects.filter(
            personal_number=number,
            user_active=True,
            ship_leaving_date__isnull=True,
        ).exists():
            return LOGIN_OWN
        if OtherCustomUserProfile.objects.filter(
            personal_number=number, is_current_other_unit=True
        ).exists():
            return LOGIN_OTHER
        record = person_record(number)
        if found is not None:
            found["record"] = record
        if record is not None:
            placed = _placement(record, home)
            if placed is not None:
                return placed

    token_unit = _as_int(token.get("unit_id"))
    home_number = _as_int(home_code)
    if token_unit is not None and home_number is not None and token_unit == home_number:
        return LOGIN_OWN

    # Developed with Understanding: the one log line of step 6 names the user id only.
    logger.warning(
        "login routing could not place authz user id %s, classed other ship (guest)",
        token.get("user_id"),
    )
    return LOGIN_OTHER
