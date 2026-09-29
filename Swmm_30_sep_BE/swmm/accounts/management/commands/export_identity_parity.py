# Developed with Understanding: manage.py export_identity_parity --out <path> (CP-L, D31).
# Read only - writes one CSV row per swmm CustomUser with the identity columns the userauth
# command of the same name writes, so Tools\compare-identity-parity.ps1 can join the two
# files on username. Nothing in the database is written and no other schema is read.
"""Export swmm login identities to a CSV file for the identity parity check."""

import csv
from pathlib import Path

from django.core.management.base import BaseCommand

from accounts.models import CustomUser

# Developed with Understanding: the column order both services write (D31).
PARITY_COLUMNS = (
    "username",
    "authz_user_id",
    "class",
    "personal_number",
    "full_name",
    "unit_code",
    "unit_name",
    "rank_name",
)
CLASS_OWN = "own"
CLASS_OTHER = "other"
CLASS_NONE = "none"


# Developed with Understanding: one CSV row. class is own when the login is linked to an
# own-ship row, other for an other-ship login (CustomUser.is_other_unit, CP-K), none when
# neither is linked. full_name is "firstname lastname", built as userauth builds its own
# (CustomUserProfile.get_full_name there), so the two files compare like with like - the
# HRCDF fullName column is not used. unit_name is the section column (HRCDF unitName).
def parity_row(user):
    """Return the parity CSV row of one CustomUser."""
    if user.user_profile_id is not None:
        profile, login_class = user.user_profile, CLASS_OWN
    elif user.is_other_unit:
        profile, login_class = user.other_profile, CLASS_OTHER
    else:
        profile, login_class = None, CLASS_NONE
    if profile is None:
        return [user.username, "", login_class, "", "", "", "", ""]
    full_name = f"{profile.firstname or ''} {profile.lastname or ''}".strip()
    authz_user_id = profile.authz_user_id
    return [
        user.username,
        "" if authz_user_id is None else str(authz_user_id),
        login_class,
        profile.personal_number or "",
        full_name,
        profile.unit_code or "",
        profile.section or "",
        profile.rank_name or "",
    ]


class Command(BaseCommand):
    help = "Write one identity parity CSV row per swmm CustomUser to --out (read only)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--out", required=True, help="Path of the CSV file to write."
        )

    def handle(self, *args, **options):
        out = Path(options["out"])
        out.parent.mkdir(parents=True, exist_ok=True)
        related = ("user_profile", "other_profile")
        users = CustomUser.objects.select_related(*related).order_by("username")
        count = 0
        with out.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(PARITY_COLUMNS)
            for user in users:
                writer.writerow(parity_row(user))
                count += 1
        self.stdout.write(f"{count} swmm login(s) written to {out}")
