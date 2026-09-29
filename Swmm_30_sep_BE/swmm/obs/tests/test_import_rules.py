"""Import Data validation tests: `SparesImportRuleRegisterTests`,
`MasterAdditionsFromTheSheetTests`, `PatternOnlyFailureTests`, `ImportColumnVocabularyTests`,
`ImportCategoryTests`, `DefaultEquipmentClassFromTheModelTests`,
`PreviewShowsWhatTheSaveWillWriteTests`.

Split out of the former flat `obs/tests.py` (Part 1 of the obs file-structure split).
"""

import json
from io import BytesIO

from accounts import rbac
from django.core.files.uploadedfile import SimpleUploadedFile
from ilms.models import MOItemSourceOfTruth
from master.models import Department, SubDepartment
from openpyxl import Workbook, load_workbook
from rest_framework import status
from rest_framework.test import APITestCase

from .. import services
from ..models import Authority, Denomination, EquipmentClass, SpareClass, Spares
from ..views import _D787J_IMPORT_DENIED_MESSAGE as D787J_IMPORT_DENIED_MESSAGE
from ..views import IMPORT_TEMPLATE_DIR, SparesViewSet
from ._shared import IMPORT_PASSWORD, MastersImportFixtureMixin

# Developed by Unknown: The acceptance test for the import rule register.
#
# Each of the seven curated template workbooks is uploaded exactly as it is shipped, by a
# login of the department that workbook belongs to, against a ship whose master data has
# been set up the way a real ship's would be. The assertion is the workbook's own GUIDANCE
# sheet - twelve rows pass, three fail, and each of the three fails for the clause its
# TRIAL DATA NOTE names.
#
# Ported from source's `obs/tests.py`. Every `users.rbac` / `users.models` reference has been
# remapped to `accounts.rbac` / `accounts.models` (1:1, per the merge's verified symbol table),
# and every URL has been rewritten from source's flat, unprefixed style
# (`/api/v1/onboard-spares/import-excel-preview/`) to target's router-based, `spares/`-prefixed
# style (`/api/v1/onboard-spares/spares/import-excel-preview/`) - `import_excel_preview` and
# `import_excel_commit_valid` are `@action`s on `SparesViewSet` in the merged `obs/views.py`,
# registered the same way `download-template`, `check-wed-mapping` etc. already are in this
# file's own `OnboardSparesFlowTests`. `import-authorities/`, `template-routes/`,
# `import-value-lists/` and `import-ship-customer-code/` do not exist yet in the merged
# `obs/views.py` at the time of this merge (it is being finished concurrently) - these tests
# are ported anyway, on the same `spares/` convention, and will start passing once that work
# lands; see the merge report for this file.
CANONICAL_IMPORT_WORKBOOKS = {
    "ELEC_SWMM_IMPORT_TEMPLATE_D787.xlsx": {
        "department": "ELECTRICAL",
        "route": services.IMPORT_ROUTE_D787J,
        "authority": "D787J",
        # SER 15 (row 16) holds MO ALLOWANCE on the D787J route - the workbook's own
        # deliberate breach of rule 2.17.1. The whole file is now refused for it.
        "refused": [(16, "MO ALLOWANCE")],
        "valid": None,
        "invalid": None,
        "breaches": {
            14: {"denomination_name": [services.RULE_MESSAGES["R-024"]]},
            15: {"pattern_number": [services.RULE_MESSAGES["R-019"]]},
            16: {"authority_name": [services.RULE_MESSAGES["R-038"]]},
        },
    },
    "ELEC_SWMM_IMPORT_TEMPLATE_NOND787.xlsx": {
        "department": "ELECTRICAL",
        "route": services.IMPORT_ROUTE_OTHERS,
        "authority": "SHIPYARD ALLOWANCE",
        "refused": [
            (4, "B & D"),
            (5, "MO ITEM"),
            (6, "MO ALLOWANCE"),
            (7, "MO ALLOWANCE"),
            (8, "DELEGATED POWERS"),
            (9, "MO ITEM"),
            (10, "MO ITEM"),
            (11, "B & D"),
            (12, "OTHERS"),
            (13, "DELEGATED POWERS"),
            (14, "OTHERS"),
            (15, "MO ALLOWANCE"),
        ],
        "valid": None,
        "invalid": None,
        "breaches": {
            14: {"spare_class_name": [services.RULE_MESSAGES["R-010"]]},
            15: {"equipment_class_name": [services.RULE_MESSAGES["R-013"]]},
            16: {"quantity_authorised": [services.RULE_MESSAGES["R-028"]]},
        },
    },
    "ENGG_SWMM_IMPORT_TEMPLATE_D787.xlsx": {
        "department": "ENGINEERING",
        "route": services.IMPORT_ROUTE_D787J,
        "authority": "D787J",
        "refused": [],
        "valid": 12,
        "invalid": 3,
        "breaches": {
            14: {"equipment_class_name": [services.RULE_MESSAGES["R-015"]]},
            15: {"quantity_authorised": [services.RULE_MESSAGES["R-026"]]},
            16: {"line": [services.RULE_MESSAGES["R-042"]]},
        },
    },
    "ENGG_SWMM_IMPORT_TEMPLATE_NOND787.xlsx": {
        "department": "ENGINEERING",
        "route": services.IMPORT_ROUTE_OTHERS,
        "authority": "SHIPYARD ALLOWANCE",
        "refused": [
            (4, "MO ALLOWANCE"),
            (5, "MO ALLOWANCE"),
            (6, "DELEGATED POWERS"),
            (7, "DELEGATED POWERS"),
            (8, "MO ITEM"),
            (9, "MO ITEM"),
            (10, "B & D"),
            (11, "B & D"),
            (12, "OTHERS"),
            (13, "DELEGATED POWERS"),
            (14, "MO ITEM"),
            (15, "MO ALLOWANCE"),
        ],
        "valid": None,
        "invalid": None,
        "breaches": {
            14: {"equipment_class_name": [services.RULE_MESSAGES["R-014"]]},
            15: {"pattern_number": [services.RULE_MESSAGES["R-019"]]},
            16: {"category": [services.RULE_MESSAGES["R-023"]]},
        },
    },
    "HULL_SWMM_IMPORT_TEMPLATE_D787.xlsx": {
        "department": "HULL",
        "route": services.IMPORT_ROUTE_D787J,
        "authority": "D787J",
        "refused": [],
        "valid": 12,
        "invalid": 3,
        "breaches": {
            14: {"category": [services.RULE_MESSAGES["R-021"]]},
            15: {"rack_position": [services.RULE_MESSAGES["R-035"]]},
            16: {"page": [services.RULE_MESSAGES["R-041"]]},
        },
    },
    "HULL_SWMM_IMPORT_TEMPLATE_NOND787.xlsx": {
        "department": "HULL",
        "route": services.IMPORT_ROUTE_OTHERS,
        "authority": "SHIPYARD ALLOWANCE",
        "refused": [
            (4, "MO ALLOWANCE"),
            (5, "MO ALLOWANCE"),
            (6, "DELEGATED POWERS"),
            (7, "B & D"),
            (8, "MO ITEM"),
            (9, "MO ITEM"),
            (10, "OTHERS"),
            (11, "OTHERS"),
            (12, "DELEGATED POWERS"),
            (13, "MO ALLOWANCE"),
            (15, "B & D"),
            # SER 15 - the workbook's own deliberate breach of rule 2.17.2.
            (16, "SHIP STAFF"),
        ],
        "valid": None,
        "invalid": None,
        "breaches": {
            14: {"description": [services.RULE_MESSAGES["R-020"]]},
            15: {"ship_customer_code": [services.RULE_MESSAGES["R-046"]]},
            16: {"authority_name": [services.RULE_MESSAGES["R-039"]]},
        },
    },
    "NBCD_SWMM_IMPORT_TEMPLATE_NOND787.xlsx": {
        "department": "NBCD",
        "route": services.IMPORT_ROUTE_OTHERS,
        # NBCD's own workbook locks its AUTHORITY dropdown to CNAL alone and every row
        # holds it, so this is the one others-route workbook the authority gate lets past.
        "authority": "CNAL",
        "refused": [],
        "valid": 12,
        "invalid": 3,
        "breaches": {
            14: {"quantity_authorised": [services.RULE_MESSAGES["R-026"]]},
            15: {"quantity_available": [services.RULE_MESSAGES["R-032"]]},
            # SER 15 breaches three clauses at once and the GUIDANCE sheet says so -
            # "DOUBLE SPACE AND TRAILING SPACE IN DESCRIPTION AND CRITICAL ENTERED AS
            # MAYBE - RULES 2.3, 2.4 AND 2.20". Each is carried separately, so the screen
            # can put each on its own line rather than joining them into one sentence.
            16: {
                "description": [
                    services.RULE_MESSAGES["R-004"],
                    services.RULE_MESSAGES["R-005"],
                ],
                "critical": [services.RULE_MESSAGES["R-043"]],
            },
        },
    },
}


class SparesImportRuleRegisterTests(MastersImportFixtureMixin, APITestCase):
    """The seven curated workbooks, each validated against its own stated outcome."""

    def _master_counts(self):
        return (
            SpareClass.objects.count(),
            EquipmentClass.objects.count(),
            Denomination.objects.count(),
            Authority.objects.count(),
        )

    def _assert_workbook(self, file_name):
        expected = CANONICAL_IMPORT_WORKBOOKS[file_name]
        department = self._department(expected["department"])
        self._login_for(department)
        self._seed_masters(department, IMPORT_TEMPLATE_DIR / file_name)

        master_counts_before = self._master_counts()

        response = self._preview(file_name, expected["route"], expected["authority"])

        if expected["refused"]:
            self._assert_refused(response, expected)
        else:
            self._assert_classified(response, expected)

        # No import may create master data. This is the whole of the change's answer to
        # a workbook cell reading PCS, SHIP STAFF or a mis-typed equipment name.
        self.assertEqual(self._master_counts(), master_counts_before)

    def _assert_refused(self, response, expected):
        """The file-level authority gate - the whole workbook is refused, nothing classified."""
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn("rows", response.data)
        message = response.data["file"][0]
        for row_number, held in expected["refused"]:
            self.assertIn(
                f"row {row_number} holds {held}",
                message,
                msg=f"the refusal must name row {row_number} and what it holds",
            )

    def _assert_classified(self, response, expected):
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        summary = response.data["summary"]
        self.assertEqual(summary["total_rows"], 15)
        self.assertEqual(summary["valid_rows"], expected["valid"])
        self.assertEqual(summary["invalid_rows"], expected["invalid"])

        rows_by_number = {row["row"]: row for row in response.data["rows"]}
        for row_number, fields in expected["breaches"].items():
            row = rows_by_number[row_number]
            self.assertEqual(row["status"], "invalid", msg=f"row {row_number}")
            for field, messages in fields.items():
                self.assertEqual(
                    row["errors"].get(field),
                    messages,
                    msg=f"row {row_number}, column {field}",
                )

        # Every row the workbook expects to pass, passes.
        for row_number in range(2, 14):
            self.assertEqual(
                rows_by_number[row_number]["status"],
                "valid",
                msg=f"row {row_number} was expected to import cleanly",
            )

    def test_electrical_d787j_workbook_matches_its_guidance_sheet(self):
        self._assert_workbook("ELEC_SWMM_IMPORT_TEMPLATE_D787.xlsx")

    def test_electrical_others_workbook_matches_its_guidance_sheet(self):
        self._assert_workbook("ELEC_SWMM_IMPORT_TEMPLATE_NOND787.xlsx")

    def test_engineering_d787j_workbook_matches_its_guidance_sheet(self):
        self._assert_workbook("ENGG_SWMM_IMPORT_TEMPLATE_D787.xlsx")

    def test_engineering_others_workbook_matches_its_guidance_sheet(self):
        self._assert_workbook("ENGG_SWMM_IMPORT_TEMPLATE_NOND787.xlsx")

    def test_hull_d787j_workbook_matches_its_guidance_sheet(self):
        self._assert_workbook("HULL_SWMM_IMPORT_TEMPLATE_D787.xlsx")

    def test_hull_others_workbook_matches_its_guidance_sheet(self):
        self._assert_workbook("HULL_SWMM_IMPORT_TEMPLATE_NOND787.xlsx")

    def test_nbcd_others_workbook_matches_its_guidance_sheet(self):
        self._assert_workbook("NBCD_SWMM_IMPORT_TEMPLATE_NOND787.xlsx")

    def test_unknown_equipment_class_is_offered_as_an_addition_and_creates_nothing(
        self,
    ):
        """Rule 2.6.1 - an equipment name the ship's list does not hold is NEW, not wrong.

        WHAT MATTERS: the PREVIEW creates nothing. The addition is reported and written by
        the commit, so a file the operator abandons leaves no trace in the master list.

        Separated from the seven workbook cases because those seed their equipment classes
        from their own sheets, so none of them exercises a genuine master-data miss.
        """
        department = self._department("ENGINEERING")
        self._login_for(department)
        spare_class = SpareClass.objects.create(
            name="SPARES_EQUIPMENT",
            department=department,
        )
        EquipmentClass.objects.create(
            name="AIR CONDITIONING PLANT",
            spare_class=spare_class,
        )
        Denomination.objects.create(name="NOS", department=department)
        Authority.objects.create(name="MO ITEM")

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
        worksheet.append(
            [
                "SPARES_EQUIPMENT",
                "CHILLED WATER PUMP",
                "SHAFT SLEEVE",
                "P",
                "NOS",
                2,
                2,
                "MO ITEM",
                "4121",
            ]
        )
        content = BytesIO()
        workbook.save(content)

        response = self.client.post(
            self.IMPORT_PREVIEW_URL,
            {
                "file": SimpleUploadedFile(
                    "unknown_equipment.xlsx", content.getvalue()
                ),
                "route": services.IMPORT_ROUTE_OTHERS,
                "authority": "MO ITEM",
                "password": IMPORT_PASSWORD,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = response.data["rows"][0]
        # VALID: the preview materialises the class inside the transaction it rolls back, so
        # the row is validated in full rather than skipped for a null foreign key.
        self.assertEqual(row["status"], "valid")
        self.assertFalse(row["needs_master_confirmation"])
        # ON `advisories`, NOT ON `errors` - the save adds the equipment class itself, so this
        # is not the operator's to act on, only worth telling somebody about.
        self.assertIsNone((row["errors"] or {}).get("equipment_class_name"))
        self.assertEqual(
            row["advisories"]["equipment_class_name"],
            [
                services.MASTER_ADDITION_AUTOMATIC_MESSAGE.format(
                    column="EQUIPMENT CLASS", value="CHILLED WATER PUMP"
                )
            ],
        )

        # Reported once, for the sheet, and marked as needing nobody's approval.
        addition = next(
            entry
            for entry in response.data["master_additions"]
            if entry["value"] == "CHILLED WATER PUMP"
        )
        self.assertEqual(addition["field"], "equipment_class_name")
        self.assertEqual(addition["column"], "EQUIPMENT CLASS")
        self.assertFalse(addition["confirmation_required"])
        self.assertEqual(addition["rows"], [2])

        # The preview wrote nothing.
        self.assertFalse(
            EquipmentClass.objects.filter(name="CHILLED WATER PUMP").exists()
        )

    def test_a_row_that_breaches_no_clause_still_meets_the_model_quantity_guard(self):
        """Held may never exceed authorised, on any route.

        The rule engine does not carry this one - `Spares.clean()` already does, and is
        already reached through `full_clean()` on the import path. The test is here to
        prove the engine did not displace it, and that the row is reported rather than
        silently rewritten.
        """
        department = self._department("ENGINEERING")
        self._login_for(department)
        spare_class = SpareClass.objects.create(
            name="SPARES_EQUIPMENT",
            department=department,
        )
        EquipmentClass.objects.create(
            name="AIR CONDITIONING PLANT",
            spare_class=spare_class,
        )
        Denomination.objects.get_or_create(name="NOS", department=department)
        # Developed by Unknown: `Authority.name` is unique SHIP-WIDE, not per department, so
        # the parametrised route-refusal cases - which call this once per department inside a
        # single test - must not try to create D787J twice.
        Authority.objects.get_or_create(name="D787J")

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
                "D787J PAGE NUMBER",
                "D787J LINE NUMBER",
                "SHIP CUSTOMER CODE",
            ]
        )
        worksheet.append(
            [
                "SPARES_EQUIPMENT",
                "AIR CONDITIONING PLANT",
                "SHAFT SLEEVE",
                "P",
                "NOS",
                2,
                5,
                "D787J",
                "J1",
                "4",
                "4121",
            ]
        )
        content = BytesIO()
        workbook.save(content)

        response = self.client.post(
            self.IMPORT_PREVIEW_URL,
            {
                "file": SimpleUploadedFile("over_held.xlsx", content.getvalue()),
                "route": services.IMPORT_ROUTE_D787J,
                "authority": "D787J",
                "password": IMPORT_PASSWORD,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = response.data["rows"][0]
        self.assertEqual(row["status"], "invalid")
        self.assertIn("quantity_available", row["errors"])

    # ------------------------------------------------------------------------------
    # Developed by Unknown: The four gates.
    # ------------------------------------------------------------------------------

    def _one_row_d787j_workbook(self):
        """A single-row, entirely valid D787J workbook, so only the gate under test fails."""
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
                "D787J PAGE NUMBER",
                "D787J LINE NUMBER",
                "SHIP CUSTOMER CODE",
            ]
        )
        worksheet.append(
            [
                "SPARES_EQUIPMENT",
                "AIR CONDITIONING PLANT",
                "SHAFT SLEEVE",
                "P",
                "NOS",
                2,
                2,
                "D787J",
                "J1",
                "4",
                "4121",
            ]
        )
        content = BytesIO()
        workbook.save(content)
        return SimpleUploadedFile("d787j.xlsx", content.getvalue())

    def _seed_minimal_engineering_masters(self, department):
        spare_class = SpareClass.objects.create(
            name="SPARES_EQUIPMENT",
            department=department,
        )
        EquipmentClass.objects.create(
            name="AIR CONDITIONING PLANT",
            spare_class=spare_class,
        )
        Denomination.objects.get_or_create(name="NOS", department=department)
        Authority.objects.get_or_create(name="D787J")

    def _post_d787j_preview(self, password=IMPORT_PASSWORD):
        return self.client.post(
            self.IMPORT_PREVIEW_URL,
            {
                "file": self._one_row_d787j_workbook(),
                "route": services.IMPORT_ROUTE_D787J,
                "authority": "D787J",
                "password": password,
            },
            format="multipart",
        )

    def test_head_of_department_may_import_on_the_d787j_route(self):
        department = self._department("ENGINEERING")
        self._login_for(department, rbac.ROLE_HOD)
        self._seed_minimal_engineering_masters(department)

        response = self._post_d787j_preview()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"]["valid_rows"], 1)

    def test_a_d787j_amendment_may_be_imported_again(self):
        """There is no once-only lock. An amendment imports as often as one arrives."""
        department = self._department("ENGINEERING")
        self._login_for(department, rbac.ROLE_HOD)
        self._seed_minimal_engineering_masters(department)

        self.assertEqual(self._post_d787j_preview().status_code, status.HTTP_200_OK)
        self.assertEqual(self._post_d787j_preview().status_code, status.HTTP_200_OK)

    # Developed by Unknown (merge note): the next few cases exercise sub-department scoping
    # and the D787J denial message. `resolve_selected_sub_department` and
    # `D787J_IMPORT_DENIED_MESSAGE` exist in source's `users/rbac.py` as plain RBAC helpers,
    # but are absent from `accounts.rbac` - bridged locally in `obs/views.py` instead (see
    # `_resolve_selected_sub_department`/`_D787J_IMPORT_DENIED_MESSAGE` there). Tests that need
    # the denial message import it from `.views` rather than `accounts.rbac` for this reason.
    def test_executive_dy_hod_may_import_on_the_d787j_route(self):
        department = self._department("EXECUTIVE")
        SubDepartment.objects.create(name="HULL", department_name=department)
        self._login_for(department, rbac.ROLE_DY_HOD, sub_department="HULL")
        self._seed_minimal_engineering_masters(department)

        self.assertEqual(self._post_d787j_preview().status_code, status.HTTP_200_OK)

    def test_executive_without_hull_is_refused_the_d787j_route(self):
        """Developed by Unknown: the EXECUTIVE branch holds no D787J of its own.

        Clause 2.5.1 names Engg, Elec and Hull. A Dy HOD of GUNNERY carries a role that may
        import D787J and a department that may not, so this proves the two gates are separate
        and that the department one bites.
        """
        department = self._department("EXECUTIVE")
        SubDepartment.objects.create(name="GUNNERY", department_name=department)
        self._login_for(department, rbac.ROLE_DY_HOD, sub_department="GUNNERY")
        self._seed_minimal_engineering_masters(department)

        response = self._post_d787j_preview()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("GUNNERY", response.data["route"][0])

    def test_medical_and_logistics_are_refused_the_d787j_route(self):
        """Neither department is named by clause 2.5.1."""
        for name in ("MEDICAL", "LOGISTICS"):
            with self.subTest(department=name):
                department = self._department(name)
                self._login_for(department, rbac.ROLE_HOD)
                self._seed_minimal_engineering_masters(department)

                response = self._post_d787j_preview()

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(name, response.data["route"][0])

    def test_departmental_dy_hod_is_refused_the_d787j_route(self):
        """A DY HOD who holds no Executive sub-department is refused, as the reference did."""
        department = self._department("ENGINEERING")
        self._login_for(department, rbac.ROLE_DY_HOD)
        self._seed_minimal_engineering_masters(department)

        response = self._post_d787j_preview()

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["message"], D787J_IMPORT_DENIED_MESSAGE)

    def test_storekeeper_is_refused_the_d787j_route(self):
        department = self._department("ENGINEERING")
        self._login_for(department, "STOREKEEPER")
        self._seed_minimal_engineering_masters(department)

        self.assertEqual(
            self._post_d787j_preview().status_code, status.HTTP_403_FORBIDDEN
        )

    def test_role_less_account_is_refused_the_d787j_route(self):
        department = self._department("ENGINEERING")
        self._login_for(department, role_name=None)
        self._seed_minimal_engineering_masters(department)

        self.assertEqual(
            self._post_d787j_preview().status_code, status.HTTP_403_FORBIDDEN
        )

    def test_the_d787j_route_is_refused_on_the_commit_endpoint_too(self):
        """The gate is not preview-only. Every import endpoint carries it.

        Developed by Unknown (merge note): source also checked two legacy alias endpoints
        (`import/`, `import-excel-file/`) that have no equivalent action on target's merged
        `SparesViewSet` - only `import-excel-commit-valid` exists, so only it is asserted here.
        """
        department = self._department("ENGINEERING")
        self._login_for(department, "STOREKEEPER")
        self._seed_minimal_engineering_masters(department)

        response = self.client.post(
            "/api/v1/onboard-spares/spares/import-excel-commit-valid/",
            {
                "file": self._one_row_d787j_workbook(),
                "route": services.IMPORT_ROUTE_D787J,
                "authority": "D787J",
                "password": IMPORT_PASSWORD,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_submit_validated_inventory_data_refuses_the_d787j_route(self):
        department = self._department("ENGINEERING")
        self._login_for(department, "STOREKEEPER")

        response = self.client.post(
            "/api/v1/onboard-spares/spares/submit-validated-inventory-data/",
            {
                "route": services.IMPORT_ROUTE_D787J,
                "authority": "D787J",
                "password": IMPORT_PASSWORD,
                "rows": [{"data": {"pattern_number": "X-1", "authority": "D787J"}}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_submit_validated_inventory_data_creates_no_authority(self):
        department = self._department("ENGINEERING")
        self._login_for(department, rbac.ROLE_HOD)

        before = Authority.objects.count()
        response = self.client.post(
            "/api/v1/onboard-spares/spares/submit-validated-inventory-data/",
            {
                "route": services.IMPORT_ROUTE_OTHERS,
                "authority": "CNAL",
                "password": IMPORT_PASSWORD,
                "rows": [{"data": {"pattern_number": "X-1", "authority": "CNAL"}}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["details"]["failed"], 1)
        self.assertEqual(Authority.objects.count(), before)

    def test_a_missing_route_is_a_field_error(self):
        department = self._department("ENGINEERING")
        self._login_for(department, rbac.ROLE_HOD)

        response = self.client.post(
            self.IMPORT_PREVIEW_URL,
            {
                "file": self._one_row_d787j_workbook(),
                "authority": "D787J",
                "password": IMPORT_PASSWORD,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("route", response.data)

    def test_d787j_is_not_a_selectable_authority_on_the_others_route(self):
        department = self._department("ENGINEERING")
        self._login_for(department, rbac.ROLE_HOD)

        response = self.client.post(
            self.IMPORT_PREVIEW_URL,
            {
                "file": self._one_row_d787j_workbook(),
                "route": services.IMPORT_ROUTE_OTHERS,
                "authority": "D787J",
                "password": IMPORT_PASSWORD,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("authority", response.data)

    def test_a_wrong_password_stops_the_import(self):
        department = self._department("ENGINEERING")
        self._login_for(department, rbac.ROLE_HOD)
        self._seed_minimal_engineering_masters(department)

        response = self._post_d787j_preview(password="not-my-password")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_a_missing_password_stops_the_import(self):
        department = self._department("ENGINEERING")
        self._login_for(department, rbac.ROLE_HOD)
        self._seed_minimal_engineering_masters(department)

        response = self._post_d787j_preview(password="")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_the_import_authority_list_hides_d787j_from_an_unentitled_role(self):
        department = self._department("ENGINEERING")
        self._login_for(department, rbac.ROLE_DY_HOD)

        response = self.client.get("/api/v1/onboard-spares/spares/import-authorities/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["can_import_d787j"])
        values = [item["value"] for item in response.data["authorities"]]
        self.assertNotIn("D787J", values)
        self.assertEqual(values, list(services.AUTHORITY_OPTIONS_OTHERS))

    def test_a_storekeeper_cannot_reach_the_masters_screen_at_all(self):
        """Developed by Unknown: the Masters screen is departmental-command work.

        The gate is per action, never on the whole viewset, so the same account must still be
        able to search spares - which the next assertion proves, because taking Search away
        from a storekeeper would be a serious regression.
        """
        department = self._department("ENGINEERING")
        self._login_for(department, "STOREKEEPER")

        refused = self.client.get("/api/v1/onboard-spares/spares/import-authorities/")
        self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)

        allowed = self.client.get("/api/v1/onboard-spares/spares/")
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)

    def test_the_import_authority_list_prepends_d787j_for_a_head_of_department(self):
        department = self._department("ENGINEERING")
        self._login_for(department, rbac.ROLE_HOD)

        response = self.client.get("/api/v1/onboard-spares/spares/import-authorities/")

        self.assertTrue(response.data["can_import_d787j"])
        values = [item["value"] for item in response.data["authorities"]]
        self.assertEqual(values[0], "D787J")
        self.assertEqual(values[1:], list(services.AUTHORITY_OPTIONS_OTHERS))
        self.assertEqual(response.data["authorities"][0]["route"], "D787J")

    def test_the_import_authority_list_is_locked_to_cnal_for_nbcd(self):
        department = self._department("NBCD")
        self._login_for(department, rbac.ROLE_HOD)

        response = self.client.get("/api/v1/onboard-spares/spares/import-authorities/")

        values = [item["value"] for item in response.data["authorities"]]
        self.assertEqual(values, ["CNAL"])

    def test_the_rule_engine_still_fails_every_row_a_refused_workbook_breaches(self):
        """The per-row oracle for the mixed-authority workbooks, asserted directly.

        Those four workbooks are now refused whole by the file-level authority gate, so
        their rows never reach classification through the endpoint. The rules they breach
        are still rules, so the engine is driven over the same rows here rather than losing
        the assertions with the endpoint path.
        """
        for file_name, expected in CANONICAL_IMPORT_WORKBOOKS.items():
            if not expected["refused"]:
                continue
            with self.subTest(workbook=file_name):
                department = self._department(expected["department"])
                self._seed_masters(department, IMPORT_TEMPLATE_DIR / file_name)
                rows = self._obs_rows(IMPORT_TEMPLATE_DIR / file_name)
                sheet_code = services.sheet_customer_code_of(rows[2])
                for row_number, fields in expected["breaches"].items():
                    result = services.validate_import_row(
                        rows[row_number],
                        department=department,
                        route=expected["route"],
                        sheet_customer_code=sheet_code,
                    )
                    for field, messages in fields.items():
                        self.assertEqual(
                            result.errors.get(field),
                            messages,
                            msg=f"{file_name} row {row_number}, column {field}",
                        )

    def _obs_rows(self, workbook_path):
        """`{excel row number: {header target: cell value}}` for one workbook's OBS sheet."""
        header_map = {
            source.upper(): target
            for source, target in SparesViewSet().get_excel_import_header_map().items()
        }
        workbook = load_workbook(workbook_path, read_only=True, data_only=True)
        worksheet = workbook["OBS"]
        raw = list(worksheet.iter_rows(values_only=True))
        workbook.close()
        headers = [
            header_map.get(str(header).strip().upper(), "") if header else ""
            for header in raw[0]
        ]
        return {
            number: dict(zip(headers, values, strict=False))
            for number, values in enumerate(raw[1:], start=2)
        }


# ------------------------------------------------------------------------------------------
# Developed by Unknown: THE THREE THINGS THE MASTERS SCREEN NOW DOES THAT IT DID NOT BEFORE -
# adopt the ship's MO customer code from its first workbook, clear spares so a mistaken import
# can be redone, and refuse the screen to a role that has no business on it.
#
# All three take `MastersImportFixtureMixin` - `setUp`, `_department`, `_make_user`,
# `_login_for`, `_seed_masters`, `_preview` - and NOT `SparesImportRuleRegisterTests`, which owns
# the workbook cases. Subclassing that would have re-run all twenty-nine workbook imports inside
# each of these three. The ship the mixin's `setUp` builds is created with NO customer code, which
# is exactly the fresh-install state these cases are about.
# ------------------------------------------------------------------------------------------


class MasterAdditionsFromTheSheetTests(MastersImportFixtureMixin, APITestCase):
    """A master value the rules document does not list, and how one gets in.

    The value is reported by the preview and written by nothing; the commit writes it only
    when the operator names it back; and a commit that does not name it back leaves the row
    uncommitted and says which value it is waiting on.

    Every case runs as a Head of Department, because `CanUseMastersPage` (defined locally in
    the merged `obs/views.py`, not on `accounts.permissions`) admits nobody else to these two
    endpoints.
    """

    IMPORT_PREVIEW_URL = "/api/v1/onboard-spares/spares/import-excel-preview/"
    IMPORT_COMMIT_URL = "/api/v1/onboard-spares/spares/import-excel-commit-valid/"

    HEADERS = [
        "SPARE CLASS",
        "EQUIPMENT CLASS",
        "PATTERN NUMBER",
        "DESCRIPTION",
        "CATEGORY",
        "DENOMINATION",
        "QUANTITY AUTHORISED",
        "QUANTITY HELD",
        "AUTHORITY",
        "SHIP CUSTOMER CODE",
    ]

    def setUp(self):
        super().setUp()
        self.department = self._department("ENGINEERING")
        self._login_for(self.department)
        spare_class = SpareClass.objects.create(
            name="SPARES_EQUIPMENT",
            department=self.department,
        )
        EquipmentClass.objects.create(
            name="AIR CONDITIONING PLANT",
            spare_class=spare_class,
        )
        Denomination.objects.create(name="NOS", department=self.department)
        Authority.objects.create(name="MO ITEM")

    def _sheet(self, *rows):
        """A workbook carrying the ten columns these cases need and nothing else."""
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "OBS"
        worksheet.append(self.HEADERS)
        for row in rows:
            worksheet.append(list(row))
        content = BytesIO()
        workbook.save(content)
        return content.getvalue()

    def _row(self, denomination="NOS", equipment="AIR CONDITIONING PLANT", pattern=""):
        return [
            "SPARES_EQUIPMENT",
            equipment,
            pattern,
            "SHAFT SLEEVE",
            "P",
            denomination,
            2,
            2,
            "MO ITEM",
            "4121",
        ]

    def _post(self, url, content, extra=None):
        body = {
            "file": SimpleUploadedFile("masters.xlsx", content),
            "route": services.IMPORT_ROUTE_OTHERS,
            "authority": "MO ITEM",
            "password": IMPORT_PASSWORD,
        }
        body.update(extra or {})
        return self.client.post(url, body, format="multipart")

    # ---------------------------------------------------------------------------------
    # DENOMINATION - the worked example, and the one that has to be asked about
    # ---------------------------------------------------------------------------------

    def test_an_unlisted_denomination_is_offered_rather_than_refused(self):
        """Clause 2.10.1 lists five units. A sixth is a question, not a rejection."""
        response = self._post(self.IMPORT_PREVIEW_URL, self._sheet(self._row("PCS")))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = response.data["rows"][0]
        self.assertTrue(row["needs_master_confirmation"])
        self.assertIsNone(
            row["errors"],
            msg="an unlisted denomination is no longer a breach of clause 2.10.1",
        )
        self.assertEqual(
            row["advisories"]["denomination_name"],
            [
                services.MASTER_ADDITION_PENDING_MESSAGE.format(
                    column="DENOMINATION", value="PCS"
                )
            ],
        )

        addition = response.data["master_additions"][0]
        self.assertEqual(addition["field"], "denomination_name")
        self.assertEqual(addition["column"], "DENOMINATION")
        self.assertEqual(addition["value"], "PCS")
        self.assertEqual(addition["clause"], "2.10")
        self.assertFalse(addition["in_rules"])
        self.assertTrue(addition["confirmation_required"])
        self.assertEqual(addition["rows"], [2])
        self.assertEqual(response.data["summary"]["confirmation_rows"], 1)

    def test_the_preview_writes_no_master_row(self):
        """A file the operator may never commit settles nothing."""
        self._post(self.IMPORT_PREVIEW_URL, self._sheet(self._row("PCS")))

        self.assertFalse(Denomination.objects.filter(name="PCS").exists())

    def test_one_value_used_on_many_rows_is_asked_about_once(self):
        """The dialogue asks a question per VALUE, not per row."""
        response = self._post(
            self.IMPORT_PREVIEW_URL,
            self._sheet(self._row("PCS"), self._row("PCS"), self._row("PCS")),
        )

        additions = response.data["master_additions"]
        self.assertEqual(len(additions), 1)
        self.assertEqual(additions[0]["rows"], [2, 3, 4])
        self.assertEqual(response.data["summary"]["confirmation_rows"], 3)

    def test_a_commit_without_the_confirmation_writes_nothing_and_skips_the_row(self):
        """The confirmation is the gate, and an absent one is a no rather than a yes."""
        response = self._post(self.IMPORT_COMMIT_URL, self._sheet(self._row("PCS")))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["imported"], 0)
        self.assertEqual(response.data["masters_added"], 0)
        self.assertEqual(
            response.data["masters_unconfirmed"],
            [{"column": "DENOMINATION", "value": "PCS", "clause": "2.10"}],
            msg="the operator must be told which value the skipped rows are waiting on",
        )
        self.assertFalse(Denomination.objects.filter(name="PCS").exists())
        self.assertFalse(Spares.objects.exists())

    def test_a_confirmed_commit_creates_the_master_row_and_imports_the_row(self):
        """The whole of the feature, end to end."""
        response = self._post(
            self.IMPORT_COMMIT_URL,
            self._sheet(self._row("PCS")),
            {
                "confirmed_master_additions": json.dumps(
                    [{"field": "denomination_name", "value": "PCS"}]
                )
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["imported"], 1)
        self.assertEqual(response.data["masters_added"], 1)
        self.assertEqual(response.data["masters_unconfirmed"], [])

        denomination = Denomination.objects.get(name="PCS", department=self.department)
        self.assertEqual(Spares.objects.get().denomination, denomination)

    def test_a_second_commit_of_the_same_sheet_creates_no_second_master_row(self):
        """`get_or_create` throughout - the seed's contract, held here too."""
        confirmation = {
            "confirmed_master_additions": json.dumps(
                [{"field": "denomination_name", "value": "PCS"}]
            )
        }
        self._post(self.IMPORT_COMMIT_URL, self._sheet(self._row("PCS")), confirmation)
        response = self._post(
            self.IMPORT_COMMIT_URL, self._sheet(self._row("PCS")), confirmation
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["masters_added"], 0)
        self.assertEqual(
            Denomination.objects.filter(name="PCS", department=self.department).count(),
            1,
        )

    def test_the_department_scope_holds(self):
        """`obs_denomination` is unique per (name, department), and the row lands on the
        importing user's own department rather than becoming a ship-wide value."""
        self._post(
            self.IMPORT_COMMIT_URL,
            self._sheet(self._row("PCS")),
            {
                "confirmed_master_additions": json.dumps(
                    [{"field": "denomination_name", "value": "PCS"}]
                )
            },
        )

        self.assertEqual(
            list(
                Denomination.objects.filter(name="PCS").values_list(
                    "department", flat=True
                )
            ),
            [self.department.pk],
        )

    # ---------------------------------------------------------------------------------
    # EQUIPMENT CLASS - added without a question, per clause 2.6.1
    # ---------------------------------------------------------------------------------

    def test_a_new_equipment_class_needs_no_confirmation(self):
        response = self._post(
            self.IMPORT_PREVIEW_URL,
            self._sheet(self._row(equipment="CHILLED WATER PUMP")),
        )

        addition = response.data["master_additions"][0]
        self.assertEqual(addition["field"], "equipment_class_name")
        self.assertFalse(addition["confirmation_required"])
        self.assertFalse(response.data["rows"][0]["needs_master_confirmation"])
        self.assertEqual(response.data["summary"]["confirmation_rows"], 0)

    def test_a_new_equipment_class_is_created_by_the_commit_alone(self):
        """No `confirmed_master_additions` is sent and the row still imports."""
        response = self._post(
            self.IMPORT_COMMIT_URL,
            self._sheet(self._row(equipment="CHILLED WATER PUMP")),
        )

        self.assertEqual(response.data["imported"], 1)
        self.assertEqual(response.data["masters_added"], 1)
        equipment_class = EquipmentClass.objects.get(
            name="CHILLED WATER PUMP", department=self.department
        )
        self.assertEqual(equipment_class.spare_class.name, "SPARES_EQUIPMENT")

    # ---------------------------------------------------------------------------------
    # SPARE CLASS - fixed, and now actually fixed
    # ---------------------------------------------------------------------------------

    def test_an_unlisted_spare_class_is_still_refused_outright(self):
        """Clause 2.5's list is closed. It is the one master register no sheet may extend."""
        row = self._row()
        row[0] = "SPARES_INVENTED"
        response = self._post(self.IMPORT_PREVIEW_URL, self._sheet(row))

        preview_row = response.data["rows"][0]
        self.assertEqual(preview_row["status"], "invalid")
        self.assertFalse(preview_row["needs_master_confirmation"])
        self.assertEqual(
            preview_row["errors"]["spare_class_name"],
            [services.RULE_MESSAGES["R-010"]],
        )
        self.assertEqual(
            [addition["field"] for addition in response.data["master_additions"]],
            [],
            msg="a spare class is never offered as an addition",
        )

    def test_the_spare_class_endpoint_no_longer_creates_one(self):
        """`POST spare_class/` was a full ModelViewSet create and nothing called it."""
        response = self.client.post(
            "/api/v1/onboard-spares/spare_class/",
            {"name": "SPARES_INVENTED", "department": self.department.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertFalse(SpareClass.objects.filter(name="SPARES_INVENTED").exists())

    def test_the_miscellaneous_endpoint_refuses_a_spare_class(self):
        """The second create path, closed with a clause-led message rather than a bare 403."""
        response = self.client.post(
            "/api/v1/onboard-spares/miscellaneous/",
            {"type": "spare_class", "name": "SPARES_INVENTED"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Rule 2.5", response.data["type"][0])
        self.assertFalse(SpareClass.objects.filter(name="SPARES_INVENTED").exists())


class PatternOnlyFailureTests(MastersImportFixtureMixin, APITestCase):
    """`pattern_only_error` - the flag that stops a lookup being painted as a breach.

    It changes NO verdict: the row is still `invalid`, still under Invalid Only, still not
    committed. These cases pin both halves of that - the flag where it belongs, and the
    status where it was.
    """

    IMPORT_PREVIEW_URL = "/api/v1/onboard-spares/spares/import-excel-preview/"

    HEADERS = MasterAdditionsFromTheSheetTests.HEADERS

    def setUp(self):
        super().setUp()
        self.department = self._department("ENGINEERING")
        self._login_for(self.department)
        spare_class = SpareClass.objects.create(
            name="SPARES_EQUIPMENT",
            department=self.department,
        )
        EquipmentClass.objects.create(
            name="AIR CONDITIONING PLANT",
            spare_class=spare_class,
        )
        Denomination.objects.create(name="NOS", department=self.department)
        Authority.objects.create(name="MO ITEM")

    def _preview_with_pattern(self, pattern, description="SHAFT SLEEVE"):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "OBS"
        worksheet.append(self.HEADERS)
        worksheet.append(
            [
                "SPARES_EQUIPMENT",
                "AIR CONDITIONING PLANT",
                pattern,
                description,
                "P",
                "NOS",
                2,
                2,
                "MO ITEM",
                "4121",
            ]
        )
        content = BytesIO()
        workbook.save(content)
        return self.client.post(
            self.IMPORT_PREVIEW_URL,
            {
                "file": SimpleUploadedFile("patterns.xlsx", content.getvalue()),
                "route": services.IMPORT_ROUTE_OTHERS,
                "authority": "MO ITEM",
                "password": IMPORT_PASSWORD,
            },
            format="multipart",
        )

    def test_a_pattern_number_no_source_knows_is_flagged_and_still_invalid(self):
        response = self._preview_with_pattern("EK3330B-0000000001")

        row = response.data["rows"][0]
        self.assertTrue(row["pattern_only_error"])
        self.assertEqual(
            row["status"],
            "invalid",
            msg="clause 4.3 - a wrong pattern number still may not reach the spares table",
        )
        self.assertEqual(response.data["summary"]["pattern_only_rows"], 1)

    def test_a_forbidden_symbol_in_the_pattern_number_is_not_flagged(self):
        """Clause 2.7.4's / and backslash land on the same field and ARE a breach. Keying the
        flag on the field alone rather than on the message would have softened them."""
        response = self._preview_with_pattern("NPT504\\25468979")

        row = response.data["rows"][0]
        self.assertIn(services.RULE_MESSAGES["R-019"], row["errors"]["pattern_number"])
        self.assertFalse(row["pattern_only_error"])

    def test_a_row_failing_a_second_clause_is_not_flagged(self):
        """The flag means the pattern number is the ONLY thing wrong."""
        response = self._preview_with_pattern("EK3330B-0000000001", description="")

        row = response.data["rows"][0]
        self.assertEqual(
            row["errors"]["description"], [services.RULE_MESSAGES["R-020"]]
        )
        self.assertFalse(row["pattern_only_error"])

    def test_an_empty_pattern_number_is_not_flagged(self):
        """Clause 2.7.1 permits an empty cell and the application generates a number for it.
        Nothing was checked, so nothing failed."""
        response = self._preview_with_pattern("")

        row = response.data["rows"][0]
        self.assertFalse(row["pattern_only_error"])
        self.assertEqual(row["status"], "valid")


class ImportColumnVocabularyTests(MastersImportFixtureMixin, APITestCase):
    """The columns the screen names, against the columns the workbook has.

    These cases pin the header vocabulary from the back end, which is the only side either
    the screen or the column report can be wrong about.
    """

    IMPORT_PREVIEW_URL = "/api/v1/onboard-spares/spares/import-excel-preview/"

    # The one header row all ten curated workbooks carry on their `OBS` sheet, in order.
    TEMPLATE_HEADERS = [
        "SER",
        "SPARE CLASS",
        "EQUIPMENT CLASS",
        "PATTERN NUMBER",
        "DESCRIPTION",
        "CATEGORY",
        "DENOMINATION",
        "QUANTITY AUTHORISED",
        "QUANTITY HELD",
        "COMPARTMENT NAME",
        "RACK POSITION",
        "RACK NUMBER",
        "BOX NUMBER",
        "AUTHORITY",
        "D787J PAGE NUMBER",
        "D787J LINE NUMBER",
        "CRITICAL",
        "PICTURE PATH",
        "REMARKS",
        "SHIP CUSTOMER CODE",
    ]

    def setUp(self):
        super().setUp()
        self.department = self._department("ENGINEERING")
        self._login_for(self.department)
        spare_class = SpareClass.objects.create(
            name="SPARES_EQUIPMENT",
            department=self.department,
        )
        EquipmentClass.objects.create(
            name="AIR CONDITIONING PLANT",
            spare_class=spare_class,
        )
        Denomination.objects.create(name="NOS", department=self.department)
        Authority.objects.create(name="MO ITEM")

    def _preview(self, headers, row):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "OBS"
        worksheet.append(list(headers))
        worksheet.append(list(row))
        content = BytesIO()
        workbook.save(content)
        return self.client.post(
            self.IMPORT_PREVIEW_URL,
            {
                "file": SimpleUploadedFile("columns.xlsx", content.getvalue()),
                "route": services.IMPORT_ROUTE_OTHERS,
                "authority": "MO ITEM",
                "password": IMPORT_PASSWORD,
            },
            format="multipart",
        )

    def _template_row(self):
        """One row filling every one of the twenty template columns."""
        return [
            1,
            "SPARES_EQUIPMENT",
            "AIR CONDITIONING PLANT",
            "",
            "SHAFT SLEEVE",
            "P",
            "NOS",
            2,
            2,
            "FWD SG STORE",
            "PORT",
            "3",
            "101A",
            "MO ITEM",
            "",
            "",
            "YES",
            "D:\\SPTA PICS\\1.JPG",
            "",
            "4121",
        ]

    def test_a_template_sheet_reports_no_missing_and_no_extra_columns(self):
        """A workbook straight off `download-template/` must not be told it is missing a
        column or carrying one the application does not want."""
        response = self._preview(self.TEMPLATE_HEADERS, self._template_row())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        summary = response.data["summary"]
        self.assertEqual(summary["missing_essential_columns"], [])
        self.assertEqual(
            summary["missing_optional_columns"],
            [],
            msg="`MO DEMAND NO` and `sub_department` were reported here on every import",
        )
        self.assertEqual(
            summary["extra_columns"],
            [],
            msg="SER and PICTURE PATH were reported as ignored extras on every import",
        )

    def test_mo_demand_no_is_no_longer_a_column_this_application_knows(self):
        """It was a leftover from the reference application's static templates. A sheet that
        still carries it is not refused - the column is simply reported as extra and ignored."""
        headers = self.TEMPLATE_HEADERS + ["MO DEMAND NO"]
        response = self._preview(headers, self._template_row() + ["MOD-4582"])

        summary = response.data["summary"]
        self.assertEqual(summary["extra_columns"], ["MO DEMAND NO"])
        self.assertNotIn("MO DEMAND NO", summary["missing_optional_columns"])
        self.assertNotIn("mo_demand_number", response.data["rows"][0]["data"])

    def test_the_three_columns_outside_the_payload_reach_the_working_table(self):
        """SER, PICTURE PATH and SHIP CUSTOMER CODE are absent from the payload the serializer
        is given and shown anyway - the operator has to be able to find their own row and read
        back what they typed."""
        response = self._preview(self.TEMPLATE_HEADERS, self._template_row())

        data = response.data["rows"][0]["data"]
        self.assertEqual(data["ser"], "1")
        self.assertEqual(data["picture_path"], "D:\\SPTA PICS\\1.JPG")
        self.assertEqual(data["ship_customer_code"], "4121")

    def test_a_picture_path_is_not_put_through_the_general_rules(self):
        """Clause 2.21's own worked example is `D:\\New Folder\\1.jpg`. Rule 2.1 requires
        capitals, so a picture path inside `GENERAL_RULE_FIELDS` would fail a row for holding
        exactly what the rules document prints."""
        row = self._template_row()
        row[17] = "D:\\New Folder\\1.jpg"
        response = self._preview(self.TEMPLATE_HEADERS, row)

        self.assertEqual(response.data["rows"][0]["status"], "valid")

    def test_a_missing_column_is_named_the_way_the_template_names_it(self):
        """`friendly_label` takes the first alias in the header map, so the template's own
        spelling has to be written first. It used to say `PATTERN NO` and `BOX NO`."""
        headers = [
            header
            for header in self.TEMPLATE_HEADERS
            if header not in {"PATTERN NUMBER", "BOX NUMBER"}
        ]
        row = [
            value
            for header, value in zip(self.TEMPLATE_HEADERS, self._template_row())
            if header not in {"PATTERN NUMBER", "BOX NUMBER"}
        ]
        response = self._preview(headers, row)

        missing = response.data["summary"]["missing_optional_columns"]
        self.assertIn("PATTERN NUMBER", missing)
        self.assertIn("BOX NUMBER", missing)
        self.assertNotIn("PATTERN NO", missing)
        self.assertNotIn("BOX NO", missing)

    def test_the_short_aliases_are_still_accepted(self):
        """Naming the long form first must not stop a sheet using the short one importing."""
        headers = [
            "BOX NO" if header == "BOX NUMBER" else header
            for header in self.TEMPLATE_HEADERS
        ]
        headers = ["PATTERN NO" if h == "PATTERN NUMBER" else h for h in headers]
        response = self._preview(headers, self._template_row())

        summary = response.data["summary"]
        self.assertEqual(summary["missing_optional_columns"], [])
        self.assertEqual(summary["extra_columns"], [])
        self.assertEqual(response.data["rows"][0]["data"]["location"], "101A")

    def test_every_shipped_workbook_reports_a_clean_column_report(self):
        """The claim, made against the real files rather than a rebuilt approximation."""
        for path in sorted(IMPORT_TEMPLATE_DIR.glob("*.xlsx")):
            with self.subTest(workbook=path.name):
                headers = self._workbook_headers(path)
                self.assertEqual(
                    headers,
                    self.TEMPLATE_HEADERS,
                    msg=f"{path.name} does not carry the shared header row",
                )

    @staticmethod
    def _workbook_headers(path):
        workbook = load_workbook(path, read_only=True, data_only=True)
        try:
            worksheet = workbook["OBS"]
            header_row = next(worksheet.iter_rows(values_only=True))
        finally:
            workbook.close()
        return [str(value).strip().upper() for value in header_row if value is not None]

    def test_the_screen_and_the_workbook_name_the_same_columns(self):
        """Every header the templates carry is one the header map knows, and every target the
        map resolves to is one the working table's `data` carries or deliberately drops."""
        header_map = SparesViewSet().get_excel_import_header_map()
        for header in self.TEMPLATE_HEADERS:
            self.assertIn(
                header,
                header_map,
                msg=f"the workbook carries {header!r} and the import does not know it",
            )
            self.assertTrue(
                header_map[header],
                msg=f"{header!r} maps to nothing, so the table cannot show it",
            )

        response = self._preview(self.TEMPLATE_HEADERS, self._template_row())
        data = response.data["rows"][0]["data"]
        for header in self.TEMPLATE_HEADERS:
            target = header_map[header]
            key = {
                "spare_class_name": "spare_class",
                "equipment_class_name": "equipment_class",
                "denomination_name": "denomination",
                "authority_name": "authority",
            }.get(target, target)
            self.assertIn(
                key,
                data,
                msg=f"{header!r} reaches no cell of the working table",
            )


class ImportCategoryTests(MastersImportFixtureMixin, APITestCase):
    """Clause 2.9's column, in both of its two representations.

    The workbook carries a LETTER and `Spares.category` stores the FULL WORD. These cases pin
    the crossing in both directions, and the third pins the bug that hid behind it: a row the
    application itself corrected to a different category was then failed by its own rule
    engine, on a value the operator never typed and could not remove.
    """

    IMPORT_PREVIEW_URL = "/api/v1/onboard-spares/spares/import-excel-preview/"
    IMPORT_COMMIT_URL = "/api/v1/onboard-spares/spares/import-excel-commit-valid/"

    HEADERS = ImportColumnVocabularyTests.TEMPLATE_HEADERS

    def setUp(self):
        super().setUp()
        self.department = self._department("ENGINEERING")
        self._login_for(self.department)
        spare_class = SpareClass.objects.create(
            name="SPARES_EQUIPMENT",
            department=self.department,
        )
        EquipmentClass.objects.create(
            name="AIR CONDITIONING PLANT",
            spare_class=spare_class,
        )
        Denomination.objects.create(name="NOS", department=self.department)
        Authority.objects.create(name="MO ITEM")

    def _row(self, category="P", pattern=""):
        return [
            1,
            "SPARES_EQUIPMENT",
            "AIR CONDITIONING PLANT",
            pattern,
            "SHAFT SLEEVE",
            category,
            "NOS",
            2,
            2,
            "FWD SG STORE",
            "PORT",
            "3",
            "101A",
            "MO ITEM",
            "",
            "",
            "",
            "",
            "",
            "4121",
        ]

    def _post(self, url, row):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "OBS"
        worksheet.append(list(self.HEADERS))
        worksheet.append(list(row))
        content = BytesIO()
        workbook.save(content)
        return self.client.post(
            url,
            {
                "file": SimpleUploadedFile("category.xlsx", content.getvalue()),
                "route": services.IMPORT_ROUTE_OTHERS,
                "authority": "MO ITEM",
                "password": IMPORT_PASSWORD,
            },
            format="multipart",
        )

    def test_the_working_table_shows_the_letter_the_sheet_carries(self):
        """The whole of the reported fault. `P` in, `P` on screen - not `PERMANENT`."""
        response = self._post(self.IMPORT_PREVIEW_URL, self._row("P"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = response.data["rows"][0]
        self.assertEqual(row["data"]["category"], "P")
        self.assertEqual(row["status"], "valid")

    def test_the_database_still_stores_the_word(self):
        """The two representations both survive, each where it belongs."""
        response = self._post(self.IMPORT_COMMIT_URL, self._row("C"))

        self.assertEqual(response.data["imported"], 1)
        self.assertEqual(Spares.objects.get().category, Spares.CONSUMABLE)

    def test_a_source_corrected_category_neither_blanks_nor_fails_its_own_rule(self):
        """`apply_source_of_truth` writes `source.category` - a full WORD - into the row when
        the source disagrees with the sheet. The rule engine then read that same row and
        tested it against a tuple of LETTERS, so the row failed R-021 on a value the
        application had just written over the operator's own."""
        MOItemSourceOfTruth.objects.create(
            item_code="EK3330B-7529730001",
            crp_category="C",
        )
        response = self._post(
            self.IMPORT_PREVIEW_URL, self._row("P", pattern="EK3330B-7529730001")
        )

        row = response.data["rows"][0]
        self.assertNotIn(
            services.RULE_MESSAGES["R-021"],
            (row["errors"] or {}).get("category", []),
            msg="the row must not fail a rule on a value the import itself corrected",
        )
        self.assertEqual(row["status"], "valid")
        self.assertEqual(row["data"]["category"], "C")

    def test_qp_is_offered_accepted_and_stored(self):
        """Clause 2.9.2 - the category may be updated through the UI once ILMS knows better,
        and QP is a category ILMS and WLMS genuinely hold."""
        options = self.client.get(
            "/api/v1/onboard-spares/spares/import-value-lists/",
            {"route": services.IMPORT_ROUTE_OTHERS},
        )
        self.assertIn(
            {"value": "QP", "label": "QP - Quasi-Permanent"},
            options.data["categories"],
        )

        response = self._post(self.IMPORT_COMMIT_URL, self._row("QP"))

        self.assertEqual(response.data["imported"], 1)
        self.assertEqual(Spares.objects.get().category, Spares.QUASI_PERMANENT)

    def test_an_unknown_category_still_fails(self):
        """Widening the list to four is not opening it."""
        response = self._post(self.IMPORT_PREVIEW_URL, self._row("X"))

        row = response.data["rows"][0]
        self.assertEqual(row["errors"]["category"], [services.RULE_MESSAGES["R-021"]])
        self.assertEqual(row["status"], "invalid")

    def test_an_empty_category_still_fails(self):
        """Clause 2.9.3, unchanged."""
        response = self._post(self.IMPORT_PREVIEW_URL, self._row(""))

        row = response.data["rows"][0]
        self.assertEqual(row["errors"]["category"], [services.RULE_MESSAGES["R-023"]])


class DefaultEquipmentClassFromTheModelTests(APITestCase):
    """`SpareClass.save()` creates the one equipment class a department cannot import without.

    Clauses 2.6.2 and 2.6.3 make MICELLANEOUS the whole of the permitted equipment class for
    SPARES_PLL and SPARES_MICELLANEOUS and half of it for SPARES_CONSUMABLE, so a department
    holding spare classes and no MICELLANEOUS cannot import a PLL row at all.
    """

    def setUp(self):
        self.department = Department.objects.create(name="ENGINEERING", code="ENGG")
        self.other = Department.objects.create(name="ELECTRICAL", code="ELEC")

    def _micellaneous(self, department):
        return EquipmentClass.objects.filter(
            name="MICELLANEOUS", spare_class__department=department
        )

    def test_saving_spares_micellaneous_creates_it(self):
        spare_class = SpareClass.objects.create(
            name="SPARES_MICELLANEOUS", department=self.department
        )

        equipment_class = self._micellaneous(self.department).get()
        self.assertEqual(equipment_class.spare_class, spare_class)
        self.assertEqual(equipment_class.department, self.department)

    def test_saving_it_again_creates_no_second_row(self):
        """`obs_equipmentclass_unique_name_per_department` allows exactly one, and the guard has
        to be on the DEPARTMENT for that reason - not on the spare class."""
        spare_class = SpareClass.objects.create(
            name="SPARES_MICELLANEOUS", department=self.department
        )
        spare_class.save()
        spare_class.save()

        self.assertEqual(self._micellaneous(self.department).count(), 1)

    def test_the_other_seven_spare_classes_create_nothing(self):
        for name in ("SPARES_EQUIPMENT", "SPARES_PLL", "SPARES_CONSUMABLE"):
            SpareClass.objects.create(name=name, department=self.department)

        self.assertFalse(EquipmentClass.objects.exists())

    def test_a_spare_class_with_no_department_creates_nothing(self):
        """`EquipmentClass.department` is nullable and Postgres treats NULLs in a unique index as
        distinct, so the constraint does not bind an undepartmented row."""
        SpareClass.objects.create(name="SPARES_MICELLANEOUS", department=None)

        self.assertFalse(EquipmentClass.objects.exists())

    def test_each_department_gets_its_own(self):
        SpareClass.objects.create(
            name="SPARES_MICELLANEOUS", department=self.department
        )
        SpareClass.objects.create(name="SPARES_MICELLANEOUS", department=self.other)

        self.assertEqual(self._micellaneous(self.department).count(), 1)
        self.assertEqual(self._micellaneous(self.other).count(), 1)

    def test_a_department_that_already_holds_it_elsewhere_keeps_it_where_it_is(self):
        """A ship that files MICELLANEOUS under some other spare class is not corrected."""
        consumable = SpareClass.objects.create(
            name="SPARES_CONSUMABLE", department=self.department
        )
        EquipmentClass.objects.create(name="MICELLANEOUS", spare_class=consumable)

        SpareClass.objects.create(
            name="SPARES_MICELLANEOUS", department=self.department
        )

        equipment_class = self._micellaneous(self.department).get()
        self.assertEqual(equipment_class.spare_class, consumable)


class PreviewShowsWhatTheSaveWillWriteTests(MastersImportFixtureMixin, APITestCase):
    """The preview creates the master rows nobody has to approve, then throws them away.

    `_classify_import_rows_guarded` runs inside a transaction it rolls back - that is what
    lets a preview mint pattern numbers without burning counter values. It also creates the
    equipment classes the sheet introduces, before classifying.
    """

    IMPORT_PREVIEW_URL = "/api/v1/onboard-spares/spares/import-excel-preview/"
    IMPORT_COMMIT_URL = "/api/v1/onboard-spares/spares/import-excel-commit-valid/"

    HEADERS = ImportColumnVocabularyTests.TEMPLATE_HEADERS

    def setUp(self):
        super().setUp()
        self.department = self._department("ENGINEERING")
        self._login_for(self.department)
        self.spare_class = SpareClass.objects.create(
            name="SPARES_EQUIPMENT",
            department=self.department,
        )
        Denomination.objects.create(name="NOS", department=self.department)
        Authority.objects.create(name="MO ITEM")

    def _row(
        self, ser=1, equipment="CHILLED WATER PUMP", pattern="", denomination="NOS"
    ):
        return [
            ser,
            "SPARES_EQUIPMENT",
            equipment,
            pattern,
            "SHAFT SLEEVE",
            "P",
            denomination,
            2,
            2,
            "FWD SG STORE",
            "PORT",
            "3",
            "101A",
            "MO ITEM",
            "",
            "",
            "",
            "",
            "",
            "4121",
        ]

    def _post(self, url, *rows, extra=None):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "OBS"
        worksheet.append(list(self.HEADERS))
        for row in rows:
            worksheet.append(list(row))
        content = BytesIO()
        workbook.save(content)
        body = {
            "file": SimpleUploadedFile("preview.xlsx", content.getvalue()),
            "route": services.IMPORT_ROUTE_OTHERS,
            "authority": "MO ITEM",
            "password": IMPORT_PASSWORD,
        }
        body.update(extra or {})
        return self.client.post(url, body, format="multipart")

    def test_a_new_equipment_class_leaves_the_row_valid_and_still_says_so(self):
        """The report, in one case: green row, warning kept."""
        response = self._post(self.IMPORT_PREVIEW_URL, self._row())

        row = response.data["rows"][0]
        self.assertEqual(row["status"], "valid")
        self.assertIsNone(row["errors"])
        self.assertEqual(
            row["advisories"]["equipment_class_name"],
            [
                services.MASTER_ADDITION_AUTOMATIC_MESSAGE.format(
                    column="EQUIPMENT CLASS", value="CHILLED WATER PUMP"
                )
            ],
            msg="the row is valid and the operator is still told a master row will be created",
        )

    def test_a_blank_pattern_cell_gets_its_generated_number(self):
        """Clause 2.7.1. The number could not be minted while the equipment class did not
        exist, so the cell came back empty and the count of generated numbers stayed zero."""
        response = self._post(self.IMPORT_PREVIEW_URL, self._row())

        row = response.data["rows"][0]
        self.assertTrue(row["pattern_generated"])
        self.assertTrue(
            row["data"]["pattern_number"],
            msg="a blank PATTERN NUMBER cell must show the number the save will write",
        )
        self.assertIn("4121", row["data"]["pattern_number"])
        self.assertEqual(response.data["summary"]["patterns_generated"], 1)

    def test_the_preview_still_creates_no_master_rows(self):
        """The invariant the whole design rests on."""
        before = EquipmentClass.objects.count()

        self._post(self.IMPORT_PREVIEW_URL, self._row())

        self.assertEqual(EquipmentClass.objects.count(), before)
        self.assertFalse(
            EquipmentClass.objects.filter(name="CHILLED WATER PUMP").exists()
        )

    def test_the_counter_is_rolled_back_too(self):
        """Two previews of the same sheet must offer the same number."""
        first = self._post(self.IMPORT_PREVIEW_URL, self._row())
        second = self._post(self.IMPORT_PREVIEW_URL, self._row())

        self.assertEqual(
            first.data["rows"][0]["data"]["pattern_number"],
            second.data["rows"][0]["data"]["pattern_number"],
        )

    def test_a_repeated_pattern_number_is_still_caught_behind_a_new_equipment_class(
        self,
    ):
        """An invalid row never reached the duplicate check and never entered
        `seen_pattern_numbers`, so a genuine duplicate behind two such rows went unreported."""
        MOItemSourceOfTruth.objects.create(
            item_code="EK3330B-7529730001", crp_category=""
        )
        response = self._post(
            self.IMPORT_PREVIEW_URL,
            self._row(ser=1, pattern="EK3330B-7529730001"),
            self._row(ser=2, pattern="EK3330B-7529730001"),
        )

        rows = {row["row"]: row for row in response.data["rows"]}
        self.assertEqual(rows[2]["status"], "valid")
        self.assertEqual(
            rows[3]["status"],
            "duplicate",
            msg="the second row carrying one pattern number is a duplicate",
        )
        self.assertEqual(response.data["summary"]["duplicate_rows"], 1)

    def test_clearing_a_rejected_pattern_number_turns_the_row_valid(self):
        """Clause 2.7.1 - an empty cell is not checked and the application generates a number.
        So removing a pattern number nothing recognised is a fix, and the row must say so."""
        rejected = self._post(
            self.IMPORT_PREVIEW_URL, self._row(pattern="EK3330B-0000000001")
        )
        self.assertTrue(rejected.data["rows"][0]["pattern_only_error"])
        self.assertEqual(rejected.data["rows"][0]["status"], "invalid")

        cleared = self._post(self.IMPORT_PREVIEW_URL, self._row(pattern=""))

        row = cleared.data["rows"][0]
        self.assertEqual(row["status"], "valid")
        self.assertFalse(row["pattern_only_error"])
        self.assertTrue(
            row["data"]["pattern_number"],
            msg="clearing the cell must hand the row a generated number, not leave it blank",
        )

    def test_a_value_needing_confirmation_still_holds_the_row(self):
        """The line between the two kinds of addition. An equipment class needs nobody's
        approval and no longer colours anything; an unlisted DENOMINATION is a question for the
        Head of Department and still keeps the row out of `valid` until it is answered."""
        response = self._post(self.IMPORT_PREVIEW_URL, self._row(denomination="PCS"))

        row = response.data["rows"][0]
        self.assertEqual(row["status"], "invalid")
        self.assertTrue(row["needs_master_confirmation"])
        self.assertEqual(response.data["summary"]["confirmation_rows"], 1)

    def test_the_commit_writes_the_equipment_class_and_the_generated_number(self):
        """End to end: what the preview showed is what the save writes."""
        preview = self._post(self.IMPORT_PREVIEW_URL, self._row())
        previewed_number = preview.data["rows"][0]["data"]["pattern_number"]

        response = self._post(self.IMPORT_COMMIT_URL, self._row())

        self.assertEqual(response.data["imported"], 1)
        self.assertEqual(response.data["masters_added"], 1)
        equipment_class = EquipmentClass.objects.get(
            name="CHILLED WATER PUMP", department=self.department
        )
        spare = Spares.objects.get()
        self.assertEqual(spare.equipment_class, equipment_class)
        self.assertEqual(spare.pattern_number, previewed_number)


# ---------------------------------------------------------------------------------------
# `MastersPageRoleTests` - who may reach the References > Masters screen.
#
# Folded in from the former `tests/test_masters_page.py` during the obs
# package-consolidation pass - masters-page role gating is an import-access-rule test, a
# natural fit here.
# ---------------------------------------------------------------------------------------


class MastersPageRoleTests(MastersImportFixtureMixin, APITestCase):
    """Who may reach the Masters screen at all.

    The gate is applied PER ACTION in `SparesViewSet.get_permissions`, not class-wide, because
    the same viewset serves Search and Add Spare - which every role on the ship uses. The last
    case here is the one that proves that separation actually holds.
    """

    AUTHORITIES_URL = "/api/v1/onboard-spares/spares/import-authorities/"
    TEMPLATE_ROUTES_URL = "/api/v1/onboard-spares/spares/template-routes/"

    def test_the_four_entitled_roles_reach_the_masters_endpoints(self):
        for suffix, role_name in enumerate(
            (
                rbac.ROLE_HOD,
                rbac.ROLE_DY_HOD,
                rbac.ROLE_ADMIN,
                rbac.ROLE_ADMIN_LEGACY,
            ),
            start=1,
        ):
            with self.subTest(role=role_name):
                department = self._department("ENGINEERING")
                user = self._make_user(department, role_name, suffix=f"r{suffix}")
                self.client.force_authenticate(user)
                response = self.client.get(
                    self.AUTHORITIES_URL, {"department": department.pk}
                )
                self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_a_storekeeper_is_refused_every_masters_endpoint(self):
        department = self._department("ENGINEERING")
        self.client.force_authenticate(self._make_user(department, suffix="98"))

        for url in (self.AUTHORITIES_URL, self.TEMPLATE_ROUTES_URL):
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url, {"department": department.pk}).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_a_storekeeper_may_still_search_the_ship_inventory(self):
        """The gate is per action. If this ever fails, the Masters restriction has been applied
        class-wide and has taken the day job of every rating on the ship with it."""
        department = self._department("ENGINEERING")
        self.client.force_authenticate(self._make_user(department, suffix="97"))

        response = self.client.get("/api/v1/onboard-spares/spares/search/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
