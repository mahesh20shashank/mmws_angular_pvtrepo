# Developed with Understanding: CP-L test for manage.py export_identity_parity (D31) - the
# command writes the parity header and one row per accounts_user, and writes nothing to
# the database.
import csv
import io
import tempfile
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase

from accounts.models import CustomUser, CustomUserProfile

from .factories import make_user

PARITY_HEADER = [
    "username",
    "authz_user_id",
    "class",
    "personal_number",
    "full_name",
    "unit_code",
    "unit_name",
    "rank_name",
]


class ExportIdentityParityTests(TestCase):
    def test_writes_header_and_one_row(self):
        user = make_user(
            "parity1",
            personal_number="PA100X",
            firstname="Arun",
            lastname="Kumar",
            unit_id=162,
            unit_name="INS TEST",
            rankName="LT",
        )
        users_before = CustomUser.objects.count()
        profiles_before = CustomUserProfile.objects.count()
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder) / "parity" / "userauth.csv"
            call_command("export_identity_parity", out=str(out), stdout=io.StringIO())
            with out.open(newline="", encoding="utf-8") as handle:
                rows = list(csv.reader(handle))
        self.assertEqual(rows[0], PARITY_HEADER)
        self.assertEqual(len(rows), users_before + 1)
        row = next(r for r in rows[1:] if r[0] == "PARITY1")
        self.assertEqual(
            row,
            [
                "PARITY1",
                str(user.pk),
                "",
                "PA100X",
                "Arun Kumar",
                "162",
                "INS TEST",
                "LT",
            ],
        )
        self.assertEqual(CustomUser.objects.count(), users_before)
        self.assertEqual(CustomUserProfile.objects.count(), profiles_before)
