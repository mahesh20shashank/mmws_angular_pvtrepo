"""Shadow-sync an ``authz_service`` token into SWMM's local identity rows.

SWMM no longer authenticates anyone; it verifies an RS256 bearer minted by
``authz_service`` and, on each request, projects that token's identity + role +
org scope onto a real local ``CustomUser`` / ``CustomUserProfile``. Keeping real
rows (rather than a ``SimpleNamespace`` principal) is what lets the ~260
``users/rbac.py`` call sites across the app keep working unchanged -- they read
``user.user_profile.role_master.role_name`` / ``.department`` and run
``CustomUserProfile`` querysets.

The identity rows live in this app (``AUTH_USER_MODEL = accounts.CustomUser``);
this module reads and writes them.

The join key is ``CustomUserProfile.authz_user_id`` == the token's ``user_id``.
"""

import logging

# Developed with Understanding: timedelta for the 24 hour HRCDF refresh window (CP-K, D27).
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone
from master.models import Department, MasterCommand, Ship

from . import authz_roles, hrcdf_sync, login_routing
from .models import CustomUser, CustomUserProfile, OtherCustomUserProfile, Role

logger = logging.getLogger(__name__)

AUTH_SOURCE = "authz"
_CACHE_PREFIX = "authz:principal:"
# Developed with Understanding: record_origin of an other-unit row made by a login (CP-K).
ORIGIN_LOGIN = "LOGIN"
# Developed with Understanding: a row read from HRCDF within this window is not re-read (D27).
HRCDF_REFRESH_AGE = timedelta(hours=24)


def authz_claims(request):
    """The decoded token payload (dict-like) for a request authenticated by
    ``FleetJWTAuthentication`` -- ``request.auth`` -- or ``{}``. Views read
    ``scope`` / ``process_id`` / ``session_id`` off this."""
    return getattr(request, "auth", None) or {}


# Developed with Understanding: login_class (own or other, CP-K) is the last element, so a
# cached fingerprint names the class it was computed for and a transfer takes effect on the
# next miss (D26).
def _fingerprint(username, role_name, is_admin, token, login_class):
    scope = token.get("scope") or {}
    return repr(
        (
            username,
            role_name,
            bool(is_admin),
            token.get("department_id"),
            tuple(scope.get("command_ids") or ()),
            tuple(scope.get("ship_ids") or ()),
            login_class,
        )
    )


def _ttl():
    return int(getattr(settings, "AUTHZ_LIVE_CHECK_TTL", 45))


def sync_principal(token):
    """Return the local ``CustomUser`` for this verified token, creating /
    updating its ``CustomUserProfile`` from the claims as needed."""
    uid = token["user_id"]
    if uid is None:
        # An explicit ``user_id: null`` claim is as unusable as a missing one;
        # FleetJWTAuthentication.get_user turns this KeyError into a 401.
        raise KeyError("user_id")
    username = (token.get("username") or "").strip().upper()
    is_admin = bool(token.get("is_super_admin"))
    role_name = authz_roles.swmm_role_name_for(
        token.get("role_code"), is_super_admin=is_admin
    )
    cache_key = f"{_CACHE_PREFIX}{uid}"
    cached = cache.get(cache_key)

    if cached == _fingerprint(
        username, role_name, is_admin, token, login_routing.LOGIN_OWN
    ):
        user = (
            CustomUser.objects.select_related("user_profile")
            .filter(user_profile__authz_user_id=uid)
            .first()
        )
        if user is not None:
            return user
    # Developed with Understanding: the cache hit of an other-ship login (CP-K), joined on
    # the other-unit row's authz_user_id because such a login has no user_profile.
    elif cached == _fingerprint(
        username, role_name, is_admin, token, login_routing.LOGIN_OTHER
    ):
        user = (
            CustomUser.objects.select_related("other_profile")
            .filter(other_profile__authz_user_id=uid, user_profile__isnull=True)
            .first()
        )
        if user is not None:
            return user

    # Developed with Understanding: D26 classification on every fingerprint miss. found
    # carries the HRCDF record when classification already read it, so the refresh below
    # makes at most one HRCDF call per miss.
    found = {}
    login_class = login_routing.classify_login(token, found)
    if login_class == login_routing.LOGIN_OTHER:
        # Developed with Understanding: D25 - no CustomUserProfile is created or adopted,
        # and _apply_role, _apply_org and _apply_flags do not run for this class.
        user, other = _upsert_other_user(uid, username, token)
        _refresh_from_hrcdf(other, token, found)
    else:
        _move_to_own(uid, username, token)
        user, profile = _upsert_user(uid, username, token)
        _apply_role(profile, role_name)
        _apply_org(profile, token)
        _apply_flags(user, is_admin)
        _refresh_from_hrcdf(profile, token, found)

    cache.set(
        cache_key,
        _fingerprint(username, role_name, is_admin, token, login_class),
        timeout=_ttl(),
    )
    return user


# Developed with Understanding: the open synced own-ship rows CP-F match 3 may adopt for one
# personal number, newest first - the query of match 3 extracted as it was (CP-K), so the
# own-class move below applies the same rule.
def _open_synced_profile_ids(pn):
    return list(
        CustomUserProfile.objects.filter(
            personal_number=pn,
            authz_user_id__isnull=True,
            customuser__isnull=True,
            user_active=True,
            ship_leaving_date__isnull=True,
        )
        .order_by(F("ship_joining_date").desc(nulls_last=True), "-id")
        .values_list("id", flat=True)
    )


# Developed with Understanding: own class only (CP-K). A login whose CustomUser points at an
# other-unit row is moved back to own ship - other_profile is cleared and, when it has no
# user_profile, it is pointed at the own-ship row already carrying this authz user id, else
# at the open synced row CP-F would adopt. With neither, user_profile stays empty and
# _upsert_user creates the profile as it does today. The other-unit row is kept.
def _move_to_own(uid, username, token):
    user = (
        CustomUser.objects.filter(username=username, other_profile__isnull=False)
        .select_related("user_profile")
        .first()
    )
    if user is None:
        return
    with transaction.atomic():
        user.other_profile = None
        fields = ["other_profile"]
        if user.user_profile_id is None:
            profile = CustomUserProfile.objects.filter(authz_user_id=uid).first()
            if profile is None:
                profile = _adopt_open_synced(uid, token)
            if (
                profile is not None
                and not CustomUser.objects.filter(user_profile=profile).exists()
            ):
                user.user_profile = profile
                fields.append("user_profile")
        user.save(update_fields=fields)


# Developed with Understanding: the CP-F adoption for the own-class move (CP-K) - the newest
# open synced row is locked by pk, re-checked unlinked, and given this authz user id and
# has_credentials True, exactly as match 3 writes it. Runs inside the caller's transaction.
def _adopt_open_synced(uid, token):
    pn = str(token.get("personal_number") or "").strip().upper()
    candidate_ids = _open_synced_profile_ids(pn) if pn else []
    if not candidate_ids:
        return None
    locked = (
        CustomUserProfile.objects.select_for_update()
        .filter(pk=candidate_ids[0])
        .first()
    )
    if (
        locked is None
        or locked.authz_user_id is not None
        or CustomUser.objects.filter(user_profile=locked).exists()
    ):
        return None
    locked.authz_user_id = uid
    locked.has_credentials = True
    locked.save(update_fields=["authz_user_id", "has_credentials"])
    return locked


# Developed with Understanding: the other-ship login (D25, D33, CP-K). The other-unit row is
# found by authz_user_id, else by personal_number with authz_user_id null (D33), else made
# from the claims with record_origin LOGIN, and then carries this authz user id and
# last_login_at. The CustomUser is the one already linked to that row, else found by
# username, else created as today - always with user_profile None, other_profile set and
# is_admin False. An own-ship row that carried this authz user id keeps the row but loses
# the id, so the link moves and no accounts_customuserprofile row serves this login.
def _upsert_other_user(uid, username, token):
    pn = login_routing.claim_personal_number(token)
    now = timezone.now()
    with transaction.atomic():
        other = (
            OtherCustomUserProfile.objects.select_for_update()
            .filter(authz_user_id=uid)
            .first()
        )
        if other is None and pn:
            other = (
                OtherCustomUserProfile.objects.select_for_update()
                .filter(personal_number=pn)
                .first()
            )
            if other is not None and other.authz_user_id is not None:
                # Developed with Understanding: personal_number is unique, so the one row
                # of this person is taken over rather than a second one failing to insert.
                # The id only, never the person.
                logger.warning(
                    "authz user id %s takes over an other-unit row linked to another"
                    " authz user id",
                    uid,
                )
        if other is None:
            other = _create_other_from_claims(uid, username, token, pn, now)
        other.authz_user_id = uid
        other.last_login_at = now
        other.save(update_fields=["authz_user_id", "last_login_at"])

        CustomUserProfile.objects.filter(authz_user_id=uid).update(authz_user_id=None)

        user = CustomUser.objects.filter(other_profile=other).first()
        if user is None:
            user = CustomUser.objects.filter(username=username).first()
        if user is None:
            user = CustomUser(username=username, other_profile=other)
            user.set_unusable_password()
            user.save()
            return user, other
        fields = []
        if user.user_profile_id is not None:
            user.user_profile = None
            fields.append("user_profile")
        if user.other_profile_id != other.pk:
            user.other_profile = other
            fields.append("other_profile")
        if user.is_admin:
            user.is_admin = False
            fields.append("is_admin")
        if fields:
            user.save(update_fields=fields)
    return user, other


# Developed with Understanding: a new other-unit row from the token (CP-K). personal_number
# is the claim, else the upper-cased username (userauth's own fallback for that claim, D1).
# A concurrent first request that inserted the same row first is picked up, not duplicated.
def _create_other_from_claims(uid, username, token, pn, now):
    number = pn or username
    try:
        with transaction.atomic():
            return OtherCustomUserProfile.objects.create(
                personal_number=number,
                firstname=(token.get("first_name") or token.get("firstname") or ""),
                lastname=(token.get("last_name") or token.get("lastname") or ""),
                record_origin=ORIGIN_LOGIN,
                is_current_other_unit=True,
                authz_user_id=uid,
                last_login_at=now,
            )
    except IntegrityError:
        other = (
            OtherCustomUserProfile.objects.filter(authz_user_id=uid).first()
            or OtherCustomUserProfile.objects.filter(personal_number=number).first()
        )
        if other is None:
            raise
        return other


# Developed with Understanding: the login HRCDF refresh (D27, CP-K). After the profile is
# resolved, a row never read from HRCDF or read more than 24 hours ago is read once and
# written through hrcdf_sync.apply_person_record. A read that changes nothing still stamps
# hrcdf_synced_at, so the 24 hour window holds. The HRCDF record already fetched by
# classification is reused. Any failure is logged with the user id and exception class
# only and ignored - the request never fails, and fetch_person caps the wait at 5 seconds.
def _refresh_from_hrcdf(profile, token, found):
    try:
        synced = profile.hrcdf_synced_at
        if synced is not None and timezone.now() - synced < HRCDF_REFRESH_AGE:
            return
        pn = login_routing.claim_personal_number(token) or (
            (profile.personal_number or "").strip().upper()
        )
        if "record" in found:
            record = found["record"]
        elif pn:
            record = login_routing.person_record(pn)
        else:
            record = None
        if record is None:
            return
        with transaction.atomic():
            changed = hrcdf_sync.apply_person_record(record, profile)
            if not changed:
                now = timezone.now()
                type(profile).objects.filter(pk=profile.pk).update(hrcdf_synced_at=now)
                profile.hrcdf_synced_at = now
    except Exception as exc:
        logger.warning(
            "HRCDF refresh at login skipped for authz user id %s: %s",
            token.get("user_id"),
            exc.__class__.__name__,
        )


def _upsert_user(uid, username, token):
    profile = CustomUserProfile.objects.filter(authz_user_id=uid).first()
    user = None
    if profile is not None:
        user = CustomUser.objects.filter(user_profile=profile).first()

    if user is None:
        # Fall back to a username match (a pre-existing SWMM row that predates
        # the authz cutover) and adopt it, else create a fresh shadow pair.
        user = (
            CustomUser.objects.select_related("user_profile")
            .filter(username=username)
            .first()
        )
        if user is not None:
            profile = user.user_profile or CustomUserProfile.objects.create()
            if profile.authz_user_id != uid:
                profile.authz_user_id = uid
                profile.save(update_fields=["authz_user_id"])
            if user.user_profile_id != profile.id:
                user.user_profile = profile
                user.save(update_fields=["user_profile"])
        else:
            # Developed with Understanding: match 3 (D1, CP-F) - adopt the open profile the
            # HRCDF roster sync wrote for this person, so a first login does not make a
            # second, empty one. Keyed on the personal_number claim only (no username
            # fallback). Skipped when the claim is absent or blank, which is today's
            # behaviour. auth_source is left as it is so the sync keeps owning its columns.
            pn = str(token.get("personal_number") or "").strip().upper()
            if pn:
                # Developed with Understanding: the query now lives in
                # _open_synced_profile_ids (CP-K), unchanged.
                candidate_ids = _open_synced_profile_ids(pn)
                if len(candidate_ids) > 1:
                    # Developed with Understanding: the count only, never the person.
                    logger.warning(
                        "authz first-login adoption found %d open synced profiles"
                        " for one personal number, adopting the newest",
                        len(candidate_ids),
                    )
                if candidate_ids:
                    # Developed with Understanding: lock the chosen row by pk (no outer
                    # join under FOR UPDATE) and re-check it is still unlinked, so two
                    # concurrent first requests cannot both adopt it.
                    with transaction.atomic():
                        locked = (
                            CustomUserProfile.objects.select_for_update()
                            .filter(pk=candidate_ids[0])
                            .first()
                        )
                        if (
                            locked is not None
                            and locked.authz_user_id is None
                            and not CustomUser.objects.filter(
                                user_profile=locked
                            ).exists()
                        ):
                            locked.authz_user_id = uid
                            locked.has_credentials = True
                            locked.save(
                                update_fields=["authz_user_id", "has_credentials"]
                            )
                            user = CustomUser(username=username, user_profile=locked)
                            user.set_unusable_password()
                            user.save()
                            return user, locked
                        if locked is not None and locked.authz_user_id == uid:
                            # Developed with Understanding: a concurrent request for
                            # the same login adopted it first - use that pair.
                            user = CustomUser.objects.filter(
                                user_profile=locked
                            ).first()
                            if user is not None:
                                return user, locked
            profile = CustomUserProfile.objects.create(
                authz_user_id=uid,
                firstname=(token.get("first_name") or token.get("firstname") or ""),
                lastname=(token.get("last_name") or token.get("lastname") or ""),
                has_credentials=True,
                user_active=True,
                auth_source=AUTH_SOURCE,
            )
            user = CustomUser(username=username, user_profile=profile)
            user.set_unusable_password()
            user.save()

    return user, profile


def _apply_role(profile, role_name):
    if role_name is None:
        if profile.role_master_id is not None:
            profile.role_master = None
            profile.save(update_fields=["role_master"])
        return
    role = Role.objects.filter(role_name=role_name).first()
    if role is None:
        role = Role.objects.create(role_name=role_name)
    if profile.role_master_id != role.id:
        profile.role_master = role
        profile.save(update_fields=["role_master"])


def _resolve_pk(model, pk, label):
    if pk is None:
        return None, False
    if model.objects.filter(pk=pk).exists():
        return pk, True
    logger.warning("authz %s id %r does not resolve to a SWMM %s row", label, pk, label)
    return None, False


def _apply_org(profile, token):
    scope = token.get("scope") or {}
    updates = {}

    dept_pk, ok = _resolve_pk(Department, token.get("department_id"), "department")
    if ok and profile.department_id != dept_pk:
        updates["department_id"] = dept_pk

    command_ids = [c for c in (scope.get("command_ids") or []) if c is not None]
    cmd_pk, ok = _resolve_pk(
        MasterCommand, command_ids[0] if command_ids else None, "command"
    )
    if ok and profile.command_name_id != cmd_pk:
        updates["command_name_id"] = cmd_pk

    ship_ids = [s for s in (scope.get("ship_ids") or []) if s is not None]
    ship_pk, ok = _resolve_pk(Ship, ship_ids[0] if ship_ids else None, "ship")
    if ok and profile.ship_id != ship_pk:
        updates["ship_id"] = ship_pk

    if updates:
        for attr, value in updates.items():
            setattr(profile, attr, value)
        profile.save(update_fields=list(updates))


def _apply_flags(user, is_admin):
    dirty = []
    if user.is_admin != is_admin:
        user.is_admin = is_admin
        dirty.append("is_admin")
    if not user.is_active:
        user.is_active = True
        dirty.append("is_active")
    if dirty:
        user.save(update_fields=dirty)


def invalidate(uid):
    """Drop the cached fingerprint for a user id (e.g. after an admin edits
    their local shadow profile) so the next request re-syncs from claims."""
    cache.delete(f"{_CACHE_PREFIX}{uid}")
