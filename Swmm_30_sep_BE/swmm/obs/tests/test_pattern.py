"""Pattern-number tests: `D787JDeficiencyTests`, `NormaliseItemCodeTests`,
`SpaceInsensitivePatternMatchingTests`, `PatternSuggestionTests`.

Split out of the former flat `obs/tests.py` (Part 1 of the obs file-structure split).
"""

from django.db import models
from django.test import SimpleTestCase
from rest_framework import status
from rest_framework.test import APITestCase

from accounts import rbac
from ilms.models import Item, MOItemSourceOfTruth
from master.models import Department
from wlms.models import WedItemSourceOfTruth

from .. import models as obs_models
from .. import services
from ..models import Authority, Denomination, EquipmentClass, SpareClass, Spares
from .test_import_rules import ImportCategoryTests
from ._shared import MastersImportFixtureMixin, make_user


class D787JDeficiencyTests(APITestCase):
    """The D787J Deficiency endpoint - a spare fully held is not a deficiency, only one held
    short of authorised is. Pinned at its one definition, `SparesQuerySet.d787j_deficiencies()`.
    """

    URL = "/api/v1/onboard-spares/spares/d787j-deficiency/"

    def setUp(self):
        self.department = Department.objects.create(name="Engineering", code="ENG")
        self.user = make_user(
            "deficiency-user",
            department=self.department,
            role_name=rbac.ROLE_ADMIN,
        )
        self.client.force_authenticate(self.user)

        self.spare_class = SpareClass.objects.create(
            name="mechanical", department=self.department
        )
        self.equipment_class = EquipmentClass.objects.create(
            name="compressor spares", spare_class=self.spare_class
        )
        self.denomination = Denomination.objects.create(
            name="nos", department=self.department
        )
        self.d787j = Authority.objects.create(name="D787J")
        self.other_authority = Authority.objects.create(name="MO ITEM")

        # Short by 2 - the largest shortfall, so it must sort first.
        self.short_by_two = self._spare("pn-vbelt", "v belt for compressor drive", 6, 4)
        # Short by 1.
        self.short_by_one = self._spare("pn-gasket", "gasket set for condenser", 3, 2)
        # Fully held. This is the row the defect surfaced.
        self.fully_held = self._spare("pn-oilseal", "oil seal kit", 3, 3)
        # Held ABOVE authorised. Excess holding is out of scope and must vanish silently.
        self.over_held = self._spare("pn-impeller", "impeller key", 3, 5)
        # Short, but on another authority.
        self.other_scale = self._spare(
            "pn-other", "spindle nut", 5, 1, authority=self.other_authority
        )

    def _spare(self, pattern, description, authorised, held, authority=None):
        # `Spares.clean()` rejects held > authorised, so the excess row is written with
        # `update` to bypass full_clean - which is exactly how such a row could exist in
        # imported legacy data.
        spare = Spares.objects.create(
            equipment_class=self.equipment_class,
            pattern_number=pattern,
            description=description,
            category=Spares.PERMANENT,
            denomination=self.denomination,
            quantity_authorised=authorised,
            quantity_available=min(held, authorised),
            authority=authority or self.d787j,
        )
        if held > authorised:
            Spares.objects.filter(pk=spare.pk).update(quantity_available=held)
            spare.refresh_from_db()
        return spare

    def _rows(self):
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def _patterns(self):
        return [row["pattern_number"] for row in self._rows()]

    def test_excludes_rows_held_at_authorised(self):
        """3 authorised against 3 held is fully held, not a deficiency."""
        self.assertNotIn(self.fully_held.pattern_number, self._patterns())

    def test_excludes_rows_held_above_authorised(self):
        """Excess holding is out of scope: dropped, and flagged nowhere in the payload."""
        rows = self._rows()
        self.assertNotIn(self.over_held.pattern_number, [r["pattern_number"] for r in rows])
        for row in rows:
            self.assertGreaterEqual(row["deficiency_quantity"], 1)

    def test_excludes_other_authorities(self):
        self.assertNotIn(self.other_scale.pattern_number, self._patterns())

    def test_includes_only_the_genuinely_short_rows(self):
        self.assertCountEqual(
            self._patterns(),
            [self.short_by_two.pattern_number, self.short_by_one.pattern_number],
        )

    def test_every_row_satisfies_held_below_authorised(self):
        for row in self._rows():
            self.assertLess(row["quantity_available"], row["quantity_authorised"], msg=row)

    def test_deficiency_quantity_is_authorised_minus_held(self):
        for row in self._rows():
            self.assertEqual(
                row["deficiency_quantity"],
                row["quantity_authorised"] - row["quantity_available"],
                msg=row,
            )

    def test_ordered_by_deficiency_quantity_descending(self):
        """Largest shortfalls at the top, which is the grid's default sort."""
        quantities = [row["deficiency_quantity"] for row in self._rows()]
        self.assertEqual(quantities, sorted(quantities, reverse=True))
        self.assertEqual(self._patterns()[0], self.short_by_two.pattern_number)

    def test_tile_count_equals_grid_row_count(self):
        rows = self._rows()
        tile_count = len(rows)
        self.assertEqual(tile_count, 2)
        self.assertEqual(
            tile_count,
            Spares.objects.d787j_deficiencies().count(),
        )
        self.assertLess(
            tile_count,
            Spares.objects.filter(authority=self.d787j).count(),
            msg="the tile must not be counting every D787J row",
        )

    def test_empty_when_nothing_is_short(self):
        Spares.objects.filter(authority=self.d787j).update(
            quantity_available=models.F("quantity_authorised")
        )
        self.assertEqual(self._rows(), [])

    def test_quantity_fields_are_non_null_integers(self):
        for field_name in ("quantity_authorised", "quantity_available"):
            field = Spares._meta.get_field(field_name)
            self.assertIsInstance(field, models.PositiveSmallIntegerField)
            self.assertFalse(field.null, msg=field_name)

    def test_authority_constant_matches_services(self):
        """`services.AUTHORITY_D787J` is imported from `models.AUTHORITY_D787J`, not
        restated - this is what keeps the two names honest."""
        self.assertEqual(obs_models.AUTHORITY_D787J, services.AUTHORITY_D787J)

    def test_respects_department_scope(self):
        """The filter composes onto the existing RBAC scoping rather than replacing it."""
        other_department = Department.objects.create(name="Electrical", code="ELEC")
        outsider = make_user(
            "other-dept-user",
            department=other_department,
            role_name=rbac.ROLE_HOD,
        )
        self.client.force_authenticate(outsider)
        self.assertEqual(self._rows(), [])




class NormaliseItemCodeTests(SimpleTestCase):
    """The normalisation rule, tested on its own before anything that depends on it."""

    def test_internal_spaces_are_removed_and_not_only_the_ends(self):
        for raw in (
            "SR6001D 92162",
            " SR6001D 92162 ",
            "sr6001d 92162",
            "SR6001D92162",
        ):
            with self.subTest(raw=raw):
                self.assertEqual(services.normalise_item_code(raw), "SR6001D92162")

    def test_the_tab_and_the_non_breaking_space_go_too(self):
        self.assertEqual(
            services.normalise_item_code("N5985\tR14\xa00030"), "N5985R140030"
        )

    def test_a_wrapping_or_leading_single_quote_is_stripped(self):
        self.assertEqual(
            services.normalise_item_code("'N5985-R140030'"), "N5985-R140030"
        )
        self.assertEqual(
            services.normalise_item_code("'N5985-R140030"), "N5985-R140030"
        )

    def test_the_junk_set_reads_as_no_pattern_number_at_all(self):
        for junk in ("NIL", "nil", " NA ", "-", "--", ".", "", "   ", "0", "N/A"):
            with self.subTest(junk=junk):
                self.assertIsNone(services.normalise_item_code(junk))

    def test_a_real_code_is_never_mistaken_for_junk(self):
        self.assertEqual(services.normalise_item_code("N0212-D031434"), "N0212-D031434")




class SpaceInsensitivePatternMatchingTests(MastersImportFixtureMixin, APITestCase):
    """What the space-insensitive comparison buys, proved through the import."""

    IMPORT_PREVIEW_URL = "/api/v1/onboard-spares/spares/import-excel-preview/"
    HEADERS = ImportCategoryTests.HEADERS

    def setUp(self):
        super().setUp()
        self.department = self._department("ENGINEERING")
        self._login_for(self.department)
        spare_class = SpareClass.objects.create(
            name="SPARES_EQUIPMENT", department=self.department
        )
        EquipmentClass.objects.create(
            name="AIR CONDITIONING PLANT", spare_class=spare_class
        )
        Denomination.objects.create(name="NOS", department=self.department)
        Authority.objects.create(name="MO ITEM")

    _row = ImportCategoryTests._row
    _post = ImportCategoryTests._post

    def test_a_spaced_database_code_is_reachable_by_the_code_without_the_spaces(self):
        """THE DIRECTION THAT ACTUALLY MATTERS. The DATABASE side carries spaced codes;
        before this change every one of them was unreachable from the code a rating would
        actually type."""
        Item.objects.create(item_code="ILMS 601 A", crp_category="C")

        resolved = services.resolve_pattern_sources(["ILMS601A"])

        self.assertIn("ILMS601A", resolved)
        self.assertEqual(resolved["ILMS601A"].source, services.PATTERN_SOURCE_ITEM)

    def test_the_seeded_list_answers_a_code_the_live_master_does_not_carry(self):
        MOItemSourceOfTruth.objects.create(item_code="SR6001D-92162", crp_category="C")

        response = self._post(
            self.IMPORT_PREVIEW_URL, self._row("C", pattern="SR6001D-92162")
        )

        row = response.data["rows"][0]
        self.assertTrue(row["pattern_matched"])
        self.assertEqual(row["pattern_source"], services.PATTERN_SOURCE_MO_SOT)
        self.assertEqual(row["status"], "valid")

    def test_the_live_table_is_matched_space_insensitively_too(self):
        Item.objects.create(item_code="ILMS 601 A", crp_category="C")

        response = self._post(
            self.IMPORT_PREVIEW_URL, self._row("C", pattern="ilms601a")
        )

        row = response.data["rows"][0]
        self.assertTrue(row["pattern_matched"])
        self.assertEqual(row["pattern_source"], services.PATTERN_SOURCE_ITEM)

    def test_the_category_is_corrected_from_the_source_of_truth(self):
        """The sheet says PERMANENT, the source of truth says CONSUMABLE, the source wins -
        and the row is valid, with no error and no note, exactly as clause 4.4 asks."""
        MOItemSourceOfTruth.objects.create(item_code="SR6001D-92162", crp_category="C")

        response = self._post(
            self.IMPORT_PREVIEW_URL, self._row("P", pattern="SR6001D-92162")
        )

        row = response.data["rows"][0]
        self.assertEqual(row["status"], "valid")
        self.assertEqual(row["data"]["category"], "C")
        self.assertEqual(
            [correction["field"] for correction in row["corrections"]], ["category"]
        )

    def test_the_live_master_still_answers_before_the_seeded_list(self):
        """Clause 4.4's order, unchanged. A code in both is answered by the live CMMS-synced
        row, and the seeded list only ever adds codes it does not carry."""
        Item.objects.create(item_code="SHARED-001", crp_category="C")
        MOItemSourceOfTruth.objects.create(item_code="SHARED-001", crp_category="R")

        response = self._post(
            self.IMPORT_PREVIEW_URL, self._row("C", pattern="SHARED-001")
        )

        self.assertEqual(
            response.data["rows"][0]["pattern_source"], services.PATTERN_SOURCE_ITEM
        )

    def test_an_empty_pattern_number_is_still_valid_and_still_generated(self):
        """Clause 2.7.1, untouched. This change must not start rejecting blank cells."""
        response = self._post(self.IMPORT_PREVIEW_URL, self._row("P", pattern=""))

        row = response.data["rows"][0]
        self.assertIsNone(row["pattern_matched"])
        self.assertTrue(row["pattern_generated"])
        self.assertEqual(row["pattern_suggestions"], [])
        self.assertEqual(row["status"], "valid")

    def test_a_typed_code_that_matches_nothing_is_still_a_pattern_only_failure(self):
        """The flag the working table reads to tint such a row apart from a rule breach."""
        response = self._post(
            self.IMPORT_PREVIEW_URL, self._row("P", pattern="NOTHINGLIKETHISATALL")
        )

        row = response.data["rows"][0]
        self.assertFalse(row["pattern_matched"])
        self.assertEqual(row["status"], "invalid")
        self.assertTrue(row["pattern_only_error"])




class PatternSuggestionTests(MastersImportFixtureMixin, APITestCase):
    """The near-match suggestions, and the floor that makes them usable."""

    IMPORT_PREVIEW_URL = "/api/v1/onboard-spares/spares/import-excel-preview/"
    HEADERS = ImportCategoryTests.HEADERS

    def setUp(self):
        super().setUp()
        self.department = self._department("ENGINEERING")
        self._login_for(self.department)
        spare_class = SpareClass.objects.create(
            name="SPARES_EQUIPMENT", department=self.department
        )
        EquipmentClass.objects.create(
            name="AIR CONDITIONING PLANT", spare_class=spare_class
        )
        Denomination.objects.create(name="NOS", department=self.department)
        Authority.objects.create(name="MO ITEM")

    _row = ImportCategoryTests._row
    _post = ImportCategoryTests._post

    def test_a_mistyped_code_is_offered_the_one_it_meant(self):
        MOItemSourceOfTruth.objects.bulk_create(
            [
                MOItemSourceOfTruth(item_code="SR6001D-92162", crp_category="C"),
                MOItemSourceOfTruth(item_code="ZZ9999X-11111", crp_category="C"),
            ]
        )

        response = self._post(
            self.IMPORT_PREVIEW_URL, self._row("C", pattern="SR6001D-92163")
        )

        row = response.data["rows"][0]
        self.assertFalse(row["pattern_matched"])
        self.assertEqual(row["pattern_suggestions"][0], "SR6001D-92162")
        self.assertNotIn("ZZ9999X-11111", row["pattern_suggestions"])

    def test_no_more_than_the_cap_are_ever_offered(self):
        """Ten codes one character apart all clear the floor. Five come back."""
        MOItemSourceOfTruth.objects.bulk_create(
            [
                MOItemSourceOfTruth(
                    item_code=f"SR6001D-9216{digit}", crp_category="C"
                )
                for digit in range(10)
            ]
        )

        suggestions = services.suggest_item_codes(["SR6001D-92169X"])

        self.assertEqual(
            len(suggestions["SR6001D-92169X"]), services.PATTERN_SUGGESTION_LIMIT
        )

    def test_a_single_shared_window_does_not_qualify(self):
        """`6001` is shared and nothing else is. This is the case that would otherwise have
        put thirteen thousand codes into one table cell."""
        MOItemSourceOfTruth.objects.create(
            item_code="QQ6001ZZ-88888888", crp_category="C"
        )

        suggestions = services.suggest_item_codes(["WW6001YY-44444444"])

        self.assertEqual(suggestions.get("WW6001YY-44444444", []), [])

    def test_the_wed_source_of_truth_is_searched_as_well(self):
        WedItemSourceOfTruth.objects.create(
            item_code="WEDPUMP-CARTRIDGE-01", crp_category="P"
        )

        suggestions = services.suggest_item_codes(["WEDPUMP-CARTRIDGE-02"])

        self.assertEqual(suggestions["WEDPUMP-CARTRIDGE-02"], ["WEDPUMP-CARTRIDGE-01"])

    def test_a_matched_row_is_offered_nothing(self):
        """The suggestion pass runs only for the rows that failed."""
        MOItemSourceOfTruth.objects.create(item_code="SR6001D-92162", crp_category="C")

        response = self._post(
            self.IMPORT_PREVIEW_URL, self._row("C", pattern="SR6001D-92162")
        )

        self.assertEqual(response.data["rows"][0]["pattern_suggestions"], [])
