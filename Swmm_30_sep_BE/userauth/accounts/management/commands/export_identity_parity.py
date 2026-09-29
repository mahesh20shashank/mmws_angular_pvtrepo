# Developed with Understanding: manage.py export_identity_parity --out <path> (CP-L, D31).
# Read only - writes one CSV row per userauth accounts_user with the same columns the swmm
# command of the same name writes, so Tools\compare-identity-parity.ps1 can join the two
# files on username. Nothing in the database is written and no other schema is read. The
# column list is repeated here on purpose - the two services share no code (doctrine
# 5.13.5 rule 9).
"""Export userauth identities to a CSV file for the identity parity check."""

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


# Developed with Understanding: one CSV row. authz_user_id is the accounts_user id (the
# user_id claim swmm stores), class is blank because only swmm classifies logins,
# unit_code is the profile unit_id (HRCDF unitCode as a number), rank_name is rankName.
def parity_row(user):
    """Return the parity CSV row of one CustomUser."""
    profile = user.user_profile
    if profile is None:
        return [user.username, str(user.pk), "", "", "", "", "", ""]
    return [
        user.username,
        str(user.pk),
        "",
        profile.personal_number or "",
        profile.get_full_name(),
        "" if profile.unit_id is None else str(profile.unit_id),
        profile.unit_name or "",
        profile.rankName or "",
    ]


class Command(BaseCommand):
    help = "Write one identity parity CSV row per userauth user to --out (read only)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--out", required=True, help="Path of the CSV file to write."
        )

    def handle(self, *args, **options):
        out = Path(options["out"])
        out.parent.mkdir(parents=True, exist_ok=True)
        users = CustomUser.objects.select_related("user_profile").order_by("username")
        count = 0
        with out.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(PARITY_COLUMNS)
            for user in users:
                writer.writerow(parity_row(user))
                count += 1
        self.stdout.write(f"{count} userauth user(s) written to {out}")
