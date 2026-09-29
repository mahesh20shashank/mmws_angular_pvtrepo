# Developed with Understanding: manage.py reclassify_login_profiles (CP-L, D32). Logins made
# before CP-K always got an accounts_customuserprofile row, also for people of another unit.
# This command runs the CP-K classification (accounts.login_routing.classify_login, D26) on
# stored data only - steps 1, 2, 3 and 5, never the HRCDF call of step 4 - for every
# CustomUser whose user_profile carries an authz_user_id, and moves each row classed other
# ship to accounts_othercustomuserprofile the way a CP-K login would. Dry run by default,
# --apply writes. Nothing is ever deleted. Owning service swmm, schema swmm only.
"""Move stored login rows of people now classed other ship to OtherCustomUserProfile."""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts import authz_sync, login_routing
from accounts.hrcdf_sync import HRCDF_FIELD_MAP, _as_int
from accounts.models import CustomUser, CustomUserProfile, OtherCustomUserProfile

# Developed with Understanding: the D32 remark appended to the kept own-ship row.
MOVE_REMARK = "moved to other unit on {date}"


# Developed with Understanding: the stored stand-in for the personal_number claim - the
# profile's own personal_number, else the upper-cased username (userauth's own fallback for
# that claim, D1), stripped and upper-cased as login_routing.claim_personal_number does.
def stored_personal_number(user, profile):
    """Return the personal number a login of this row would carry."""
    return str(profile.personal_number or user.username or "").strip().upper()


# Developed with Understanding: D26 on stored data. Each token claim is replaced by the
# profile or user field sync_principal projected it into -
#   step 1  is_super_admin  -> CustomUser.is_admin (written from that claim by _apply_flags)
#           role_code       -> CustomUserProfile.role_master.role_name (the swmm name
#                              _apply_role mapped the code to, so no role map is read)
#   step 2  unchanged       -> the Master_unit this-ship code
#   step 3  personal_number -> stored_personal_number above
#   step 4  skipped         -> no HRCDF call
#   step 5  unit_id         -> CustomUserProfile.unit_code, compared numerically with the
#                              home code as step 5 compares the claim
#   step 6  unchanged       -> other ship
# Returns (class, the step that decided it).
def stored_login_class(user, profile, home_code):
    """Return (LOGIN_OWN or LOGIN_OTHER, reason) for one stored login row."""
    if user.is_admin:
        return login_routing.LOGIN_OWN, "step 1 is_admin"
    role_name = profile.role_master.role_name if profile.role_master_id else None
    if role_name in login_routing.ALWAYS_OWN_ROLES:
        return login_routing.LOGIN_OWN, "step 1 role"
    if not home_code:
        return login_routing.LOGIN_OWN, "step 2 no home unit"
    number = stored_personal_number(user, profile)
    if number:
        if CustomUserProfile.objects.filter(
            personal_number=number,
            user_active=True,
            ship_leaving_date__isnull=True,
        ).exists():
            return login_routing.LOGIN_OWN, "step 3 open own-ship row"
        if OtherCustomUserProfile.objects.filter(
            personal_number=number, is_current_other_unit=True
        ).exists():
            return login_routing.LOGIN_OTHER, "step 3 current other-unit row"
    unit = _as_int(profile.unit_code)
    home_number = _as_int(home_code)
    if unit is not None and home_number is not None and unit == home_number:
        return login_routing.LOGIN_OWN, "step 5 unit code"
    return login_routing.LOGIN_OTHER, "step 6 not placed"


# Developed with Understanding: D32 remark appended to the existing remarks. When the two do
# not fit the 200 character column, the end of the old text is cut so the whole new remark
# is always kept.
def with_move_remark(remarks, today):
    """Return remarks with the move remark appended."""
    remark = MOVE_REMARK.format(date=today.isoformat())
    width = CustomUserProfile._meta.get_field("remarks").max_length
    existing = (remarks or "").strip()
    if not existing:
        return remark[:width]
    room = width - len(remark) - 1
    if room <= 0:
        return remark[:width]
    return f"{existing[:room]} {remark}"


# Developed with Understanding: a new other-unit row from the stored own-ship row - every
# column of the HRCDF field map (both tables carry them, CP-A) plus hrcdf_synced_at, with
# record_origin LOGIN as a CP-K login would create it.
def other_values_from(profile, number):
    """Return create() kwargs for an OtherCustomUserProfile made from profile."""
    columns = set(HRCDF_FIELD_MAP.values())
    values = {column: getattr(profile, column) for column in columns}
    values["firstname"] = profile.firstname or ""
    values["lastname"] = profile.lastname or ""
    values["hrcdf_synced_at"] = profile.hrcdf_synced_at
    width = OtherCustomUserProfile._meta.get_field("personal_number").max_length
    values["personal_number"] = number[:width]
    values["record_origin"] = authz_sync.ORIGIN_LOGIN
    values["is_current_other_unit"] = True
    return values


class Command(BaseCommand):
    help = (
        "Classify stored login rows by ship (CP-K steps 1, 2, 3 and 5, no HRCDF"
        " call) and move rows classed other ship to OtherCustomUserProfile. Dry"
        " run unless --apply is given."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Write the moves. Without it nothing is written.",
        )

    def handle(self, *args, **options):
        apply = bool(options.get("apply"))
        home = login_routing.this_ship_unit()
        home_code = ((home.code if home is not None else "") or "").strip()
        today = timezone.localdate()
        users = (
            CustomUser.objects.filter(
                user_profile__isnull=False, user_profile__authz_user_id__isnull=False
            )
            .select_related("user_profile__role_master")
            .order_by("id")
        )
        examined = others = moved = 0
        for user in users:
            examined += 1
            profile = user.user_profile
            login_class, reason = stored_login_class(user, profile, home_code)
            label = f"{user.username} cup={profile.pk} authz={profile.authz_user_id}"
            if login_class == login_routing.LOGIN_OWN:
                self.stdout.write(f"{label} class=own ({reason}) - kept")
                continue
            others += 1
            number = stored_personal_number(user, profile)
            if not apply:
                self.stdout.write(f"{label} class=other ({reason}) - would move")
                continue
            other, created = self.move(user, profile.pk, number, today)
            moved += 1
            source = "new" if created else "linked"
            self.stdout.write(
                f"{label} class=other ({reason}) - moved to ocup={other.pk} ({source})"
            )
        mode = (
            "applied" if apply else "dry run - nothing written, run again with --apply"
        )
        self.stdout.write(
            f"Total: {examined} examined, {others} classed other, {moved} moved"
            f" ({mode})."
        )

    # Developed with Understanding: one move, in one transaction - the other-unit row is found
    # by this authz user id, else by personal_number, else created. It takes the authz user id,
    # the CustomUser is pointed at it with user_profile cleared, and the old own-ship row is
    # kept with user_active False, the D32 remark and its authz_user_id cleared (the same
    # link move a CP-K own-to-other transfer makes, OQ-K3). The cached fingerprint of the
    # login is dropped afterwards so the next request re-classifies.
    def move(self, user, profile_id, number, today):
        with transaction.atomic():
            profile = CustomUserProfile.objects.select_for_update().get(pk=profile_id)
            uid = profile.authz_user_id
            other = (
                OtherCustomUserProfile.objects.select_for_update()
                .filter(authz_user_id=uid)
                .first()
            )
            if other is None:
                other = (
                    OtherCustomUserProfile.objects.select_for_update()
                    .filter(personal_number=number)
                    .first()
                )
                if other is not None and other.authz_user_id is not None:
                    # Developed with Understanding: personal_number is unique, so the one
                    # row of this person is taken over, as a CP-K login does (OQ-K5).
                    self.stderr.write(
                        f"ocup={other.pk} linked to another authz user id is taken over"
                        f" by authz={uid}"
                    )
            created = other is None
            if created:
                other = OtherCustomUserProfile.objects.create(
                    authz_user_id=uid, **other_values_from(profile, number)
                )
            elif other.authz_user_id != uid:
                other.authz_user_id = uid
                other.save(update_fields=["authz_user_id"])
            CustomUser.objects.filter(pk=user.pk).update(
                user_profile=None, other_profile=other
            )
            profile.user_active = False
            profile.authz_user_id = None
            profile.remarks = with_move_remark(profile.remarks, today)
            profile.updated_at = timezone.now()
            profile.save(
                update_fields=["user_active", "authz_user_id", "remarks", "updated_at"]
            )
        authz_sync.invalidate(uid)
        return other, created
