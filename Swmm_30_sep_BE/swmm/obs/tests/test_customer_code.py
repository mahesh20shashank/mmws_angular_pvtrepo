"""`ShipCustomerCodeAdoptionTests` - the SHIP CUSTOMER CODE reconciliation.

Split out of the former flat `obs/tests.py` (Part 1 of the obs file-structure split).
"""

import unittest
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook
from rest_framework import status
from rest_framework.test import APITestCase

from .. import services
from ..models import Spares
from ..views import IMPORT_TEMPLATE_DIR
from ._shared import IMPORT_PASSWORD, MastersImportFixtureMixin, make_user


class ShipCustomerCodeAdoptionTests(MastersImportFixtureMixin, APITestCase):
    """Rule 2.23, as source's suite meets it - and as the merge's blocker #2 changes it here.

    Developed by Unknown (merge note - blocker #2): source's `rbac.resolve_ship_customer_code`
    / `rbac.adopt_ship_customer_code` / `rbac.clear_ship_customer_code` read and write a
    persisted `ShipIdentity.customer_code`, which does not exist anywhere in target's
    `accounts` app and is deliberately not being added there in this pass (see
    `obs/services.py`'s `_resolve_adopted_ship_customer_code`, which is a stub that always
    returns `None` - "nothing ever adopted"). That changes the actual behaviour under test:
    every import is now treated as the first-ever import, and a code from an EARLIER request
    is never remembered or enforced against a later one.

    Cases below that only exercise WITHIN-ONE-REQUEST behaviour (a blank pattern cell reads
    the CURRENT sheet's own code; a sheet that contradicts itself within its own rows adopts
    nothing; the ship reports "no code adopted" out of the box) are kept, rewritten to call
    `services.import_adopted_customer_code()` - the stub - instead of the now-nonexistent
    `rbac.resolve_ship_customer_code()`. Cases that are fundamentally about CROSS-REQUEST
    persistence (a first commit's code binding a later, different commit; the setter/clearer
    pair; the admin-only clear permission over a persisted code) are skipped outright with a
    reason, per the merge's explicit instruction not to invent real persistence here.
    """

    IMPORT_COMMIT_URL = "/api/v1/onboard-spares/spares/import-excel-commit-valid/"
    CODE_STATE_URL = "/api/v1/onboard-spares/spares/import-ship-customer-code/"
    WORKBOOK = "NBCD_SWMM_IMPORT_TEMPLATE_NOND787.xlsx"

    def _nbcd(self):
        """The NBCD OTHERS workbook's department, seeded and logged in.

        Chosen because it is the one canonical workbook that CLASSIFIES rather than being
        refused whole by the file-level authority gate, so a commit can actually be driven
        through it.
        """
        department = self._department("NBCD")
        self._login_for(department)
        self._seed_masters(department, IMPORT_TEMPLATE_DIR / self.WORKBOOK)
        return department

    def _commit(self, file_name, route, authority):
        path = IMPORT_TEMPLATE_DIR / file_name
        with path.open("rb") as handle:
            content = handle.read()
        return self.client.post(
            self.IMPORT_COMMIT_URL,
            {
                "file": SimpleUploadedFile(file_name, content),
                "route": route,
                "authority": authority,
                "password": IMPORT_PASSWORD,
            },
            format="multipart",
        )

    def _workbook_with_codes(self, codes):
        """A one-row-per-code workbook carrying the columns the import reads."""
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "OBS"
        worksheet.append(
            [
                "SPARE CLASS",
                "EQUIPMENT CLASS",
                "DESCRIPTION",
                "CATEGORY",
                "DENOMINATION",
                "QUANTITY AUTHORISED",
                "QUANTITY HELD",
                "AUTHORITY",
                "SHIP CUSTOMER CODE",
            ]
        )
        for code in codes:
            worksheet.append(
                [
                    "SPARES_EQUIPMENT",
                    "FIRE EXTINGUISHER",
                    "SHAFT SLEEVE",
                    "P",
                    "NOS",
                    2,
                    2,
                    "CNAL",
                    code,
                ]
            )
        content = BytesIO()
        workbook.save(content)
        return SimpleUploadedFile("codes.xlsx", content.getvalue())

    def _preview_file(self, uploaded):
        return self.client.post(
            self.IMPORT_PREVIEW_URL,
            {
                "file": uploaded,
                "route": services.IMPORT_ROUTE_OTHERS,
                "authority": "CNAL",
                "password": IMPORT_PASSWORD,
            },
            format="multipart",
        )

    def test_the_ship_starts_with_no_adopted_customer_code(self):
        """The fresh-install state - and, under the stub, also every OTHER state."""
        self._nbcd()
        response = self.client.get(self.CODE_STATE_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["customer_code"], "")
        self.assertFalse(response.data["is_adopted"])

    def test_the_very_first_preview_is_allowed_and_adopts_nothing(self):
        """The first import is always allowed. A PREVIEW writes nothing, adoption included."""
        self._nbcd()
        response = self._preview(self.WORKBOOK, services.IMPORT_ROUTE_OTHERS, "CNAL")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(services.import_adopted_customer_code(), "")

    def test_a_first_workbook_that_contradicts_itself_adopts_nothing(self):
        """Two different codes down one sheet is not an answer, so nothing is learned from it.

        This case does not depend on cross-request persistence - the contradiction and its
        refusal both happen within this one request - so it holds under the stub unchanged.
        """
        self._nbcd()
        response = self._preview_file(self._workbook_with_codes(["4121", "5006"]))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(services.import_adopted_customer_code(), "")

    def test_a_blank_pattern_cell_is_generated_against_the_sheets_own_code(self):
        """Developed by Unknown (merge note - rewritten for the stub, was
        `test_a_blank_pattern_cell_is_generated_against_the_adopted_code`): the point of the
        resolver at all - a generated pattern number leads with a customer code. Under the
        stub every import is a "first" import, so the code a blank cell is generated against
        is this WORKBOOK's own SHIP CUSTOMER CODE column, resolved and validated within this
        one commit - not a code remembered from an earlier request. The behaviour a rating
        actually sees (a generated number carrying a real code, never the literal `SHIP-`) is
        unchanged; only the sentence describing where the code comes from has been corrected.
        """
        self._nbcd()
        self._commit(self.WORKBOOK, services.IMPORT_ROUTE_OTHERS, "CNAL")

        self.assertTrue(
            Spares.objects.filter(pattern_number__startswith="4121-").exists(),
            msg="a blank PATTERN NUMBER must generate against the sheet's own customer code",
        )
        self.assertFalse(
            Spares.objects.filter(pattern_number__startswith="SHIP-").exists()
        )

    # Developed by Unknown (merge note - blocker #2, SKIPPED): asserted that a first commit's
    # code persists and binds every commit after it. `_resolve_adopted_ship_customer_code` is
    # stubbed to always return `None`, so nothing a commit does is ever remembered by the next
    # one - there is no "code already in force" this test's premise could still be about.
    @unittest.skip(
        "MO customer code persistence/adoption is not implemented in target (no "
        "ShipIdentity.customer_code on accounts/ in this pass - see obs/services.py's "
        "_resolve_adopted_ship_customer_code stub, merge blocker #2)."
    )
    def test_the_first_commit_adopts_the_code_from_its_own_workbook(self):
        self._nbcd()
        response = self._commit(self.WORKBOOK, services.IMPORT_ROUTE_OTHERS, "CNAL")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    @unittest.skip(
        "MO customer code persistence/adoption is not implemented in target (no "
        "ShipIdentity.customer_code on accounts/ in this pass - see obs/services.py's "
        "_resolve_adopted_ship_customer_code stub, merge blocker #2)."
    )
    def test_a_later_workbook_carrying_another_code_is_refused_and_names_the_ships_code(self):
        self._nbcd()
        self._commit(self.WORKBOOK, services.IMPORT_ROUTE_OTHERS, "CNAL")

        response = self._preview_file(self._workbook_with_codes(["5006"]))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @unittest.skip(
        "MO customer code persistence/adoption is not implemented in target (no "
        "ShipIdentity.customer_code on accounts/ in this pass - `rbac.adopt_ship_customer_code` "
        "/ `clear_ship_customer_code` have no accounts.rbac equivalent - see "
        "obs/services.py's _resolve_adopted_ship_customer_code stub, merge blocker #2)."
    )
    def test_adoption_never_overwrites_a_code_already_in_force(self):
        pass

    @unittest.skip(
        "MO customer code persistence/adoption is not implemented in target (no "
        "ShipIdentity.customer_code on accounts/ in this pass - `rbac.adopt_ship_customer_code` "
        "/ `clear_ship_customer_code` have no accounts.rbac equivalent - see "
        "obs/services.py's _resolve_adopted_ship_customer_code stub, merge blocker #2)."
    )
    def test_clearing_the_code_is_idempotent_and_lets_the_next_workbook_adopt_again(self):
        pass

    @unittest.skip(
        "MO customer code persistence/adoption is not implemented in target - there is no "
        "persisted code for an administrator to clear (see obs/services.py's "
        "_resolve_adopted_ship_customer_code stub, merge blocker #2)."
    )
    def test_only_an_administrator_may_clear_the_adopted_code(self):
        pass
