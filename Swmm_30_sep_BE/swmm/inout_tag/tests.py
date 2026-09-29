"""Tests for the In/Out Tag API.

They lock in the behaviour that is easy to break while porting the legacy
server-rendered views, and that a new developer is most likely to trip over:

* **Tag number** - ``TAG-<year>-<seq>`` minted once, incrementing.
* **Tag Out approval** - only the owning department's HOD / Dy HOD; the
  ``approval_list`` endpoint actually returns the ``in_progress`` rows (an
  earlier port queried a state that never existed, so it was always empty).
* **Filing a Tag In** - only the person who raised the parent Tag Out; doing so
  fans out one :class:`TagInApproval` per affected department.
* **Tag In approval** - one per-department sign-off at a time; the parent
  ``approval_status`` rolls up via ``check_all_approvals``.
* **print_slip** - renders the PDF from ``inout_tag/tagout_slip_pdf.html``
  (the template name the view passes must match where the file lives).
* **Excel** - import goes through ``perform_create`` so app rules still apply.

Users are non-privileged unless a test needs a command role, so the
``can_see_all_departments`` bypass never silently masks a scoping check.
"""

from datetime import date
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import resolve
from openpyxl import Workbook
from rest_framework.test import APITestCase

from master.models import Department
from sfd.models import ShipEquipment
from accounts.models import CustomUser, CustomUserProfile, Role

from .models import TagIn, TagInApproval, TagOut

BASE = "/api/v1/inout-tags"


def _make_user(username, *, role_name, department, pno):
    """A ``CustomUser`` whose profile has ``role_name`` in ``department``.

    ``role_name`` maps straight onto the ``users_role`` table, so pass the
    literal names ``users.rbac`` checks for: ``"Head of Department"``,
    ``"DY HOD"``, ``"CO"`` (privileged), or anything else (plain user).
    """
    role = Role.objects.create(role_name=role_name) if role_name else None
    profile = CustomUserProfile.objects.create(
        firstname=username.title(),
        lastname="Test",
        personal_number=pno,
        department=department,
        role_master=role,
        designation=role_name or "Sailor",
        user_active=True,
    )
    return CustomUser.objects.create_user(
        username=username.upper(), user_profile=profile.id, password="pw"
    )


class InOutTagTestBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.eng = Department.objects.create(name="Engineering", code="ENG")
        cls.elec = Department.objects.create(name="Electrical", code="ELEC")
        cls.ops = Department.objects.create(name="Operations", code="OPS")

        cls.maintainer = _make_user(
            "maintainer", role_name="Sailor", department=cls.eng, pno="1001"
        )
        cls.eng_hod = _make_user(
            "eng-hod", role_name="Head of Department", department=cls.eng, pno="1002"
        )
        cls.eng_dyhod = _make_user(
            "eng-dyhod", role_name="DY HOD", department=cls.eng, pno="1003"
        )
        cls.elec_hod = _make_user(
            "elec-hod", role_name="Head of Department", department=cls.elec, pno="1004"
        )
        cls.co = _make_user("co", role_name="CO", department=cls.eng, pno="1005")

        cls.equipment = ShipEquipment.objects.create(nomenclature="Hydraulic Valve")
        cls.other_equipment = ShipEquipment.objects.create(nomenclature="Fire Panel")

    # --- helpers -------------------------------------------------------------
    def _raise_tagout(self, *, creator=None, affected=None, approved=False):
        creator = creator or self.maintainer
        tagout = TagOut.objects.create(
            date=date(2026, 6, 4),
            user_profile=creator.user_profile,
            created_by=creator.user_profile,
            tagout_equipment_name=self.equipment,
            name_of_subsystem="HYDRAULICS",
            name_of_component="PRESSURE VALVE",
            serial_number_of_component="HV-001",
            weight_of_component="12.50",
            type="danger",
            condition="non_ops",
            expected_date_of_tagin=date(2026, 6, 10),
            tagout_reason="repair_or_overhauling",
            tagout_description="Valve removed for repair",
            tagout_maintainer_name_rank="PO TECH",
            approval_status="approved" if approved else "in_progress",
        )
        tagout.departments_affected.set(affected or [self.eng, self.elec])
        return tagout

    def _file_tagin(self, tagout):
        tagin = TagIn.objects.create(
            tagout=tagout,
            tagin_date=date(2026, 6, 9),
            tagin_description="Valve refitted",
            tagin_maintainer="PO TECH",
        )
        TagInApproval.objects.bulk_create(
            TagInApproval(tagin=tagin, department=dept)
            for dept in tagout.departments_affected.all()
        )
        return tagin

    def _tagin_payload(self, tagout, **overrides):
        payload = {
            "tagout": tagout.pk,
            "tagin_date": "2026-06-09",
            "tagin_description": "Valve refitted after repair",
            "tagin_maintainer": "PO TECH",
            "all_items_returned": True,
        }
        payload.update(overrides)
        return payload


# ---------------------------------------------------------------------------
# TagOut - create / list
# ---------------------------------------------------------------------------
class TagOutCreateListTests(InOutTagTestBase):
    def setUp(self):
        self.client.force_authenticate(self.maintainer)

    def _create_payload(self, **overrides):
        payload = {
            "date": "2026-06-04",
            "tagout_equipment_name": self.other_equipment.pk,
            "name_of_subsystem": "FIRE CONTROL",
            "name_of_component": "CONTROL PANEL",
            "serial_number_of_component": "FCS-001",
            "weight_of_component": "18.25",
            "type": "warning",
            "condition": "partially_ops",
            "expected_date_of_tagin": "2026-06-12",
            "tagout_reason": "survey_and_demand",
            "tagout_description": "Panel tagged out for survey",
            "tagout_maintainer_name_rank": "CPO TECH",
            "departments_affected": [self.ops.pk],
        }
        payload.update(overrides)
        return payload

    def test_create_mints_tag_number_and_forces_own_department(self):
        response = self.client.post(
            f"{BASE}/tagouts/", self._create_payload(), format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["tagout_number"].startswith("TAG-"))
        self.assertEqual(response.data["approval_status"], "in_progress")
        # Operations was submitted; Engineering (the creator's own) is forced in.
        self.assertCountEqual(
            response.data["departments_affected"], [self.ops.pk, self.eng.pk]
        )

    def test_tag_numbers_increment_within_the_year(self):
        year = date.today().year
        first = self.client.post(
            f"{BASE}/tagouts/", self._create_payload(), format="json"
        )
        second = self.client.post(
            f"{BASE}/tagouts/", self._create_payload(), format="json"
        )
        self.assertEqual(first.data["tagout_number"], f"TAG-{year}-001")
        self.assertEqual(second.data["tagout_number"], f"TAG-{year}-002")

    def test_missing_required_field_is_rejected(self):
        response = self.client.post(
            f"{BASE}/tagouts/",
            self._create_payload(tagout_description=""),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("tagout_description", response.data)

    def test_reason_only_fields_for_other_reasons_are_dropped(self):
        response = self.client.post(
            f"{BASE}/tagouts/",
            self._create_payload(
                tagout_reason="survey_and_demand",
                repair_ra_number="RA-999",  # belongs to a different reason
                survery_demand_authority="NHQ",
            ),
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        tagout = TagOut.objects.get(pk=response.data["id"])
        self.assertEqual(tagout.survery_demand_authority, "NHQ")
        self.assertIsNone(tagout.repair_ra_number)

    def test_user_without_department_cannot_create(self):
        rootless = _make_user(
            "rootless", role_name="Sailor", department=None, pno="9001"
        )
        self.client.force_authenticate(rootless)
        response = self.client.post(
            f"{BASE}/tagouts/", self._create_payload(), format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_list_excludes_tagouts_already_tagged_back_in_and_approved(self):
        open_tagout = self._raise_tagout(approved=True)
        closed_tagout = self._raise_tagout(approved=True)
        closed_tagin = self._file_tagin(closed_tagout)
        closed_tagin.approval_status = "approved"
        closed_tagin.save(update_fields=["approval_status"])

        response = self.client.get(f"{BASE}/tagouts/")
        ids = {row["id"] for row in response.data}
        self.assertIn(open_tagout.id, ids)
        self.assertNotIn(closed_tagout.id, ids)

        # ...but include_closed brings it back.
        response = self.client.get(f"{BASE}/tagouts/?include_closed=true")
        self.assertIn(closed_tagout.id, {row["id"] for row in response.data})

    def test_plain_user_sees_only_their_own_tagouts(self):
        mine = self._raise_tagout(creator=self.maintainer)
        theirs = self._raise_tagout(creator=self.eng_hod)
        response = self.client.get(f"{BASE}/tagouts/")
        ids = {row["id"] for row in response.data}
        self.assertIn(mine.id, ids)
        self.assertNotIn(theirs.id, ids)

    def test_hod_sees_the_whole_department(self):
        mine = self._raise_tagout(creator=self.maintainer)
        elec_tagout = self._raise_tagout(creator=self.elec_hod, affected=[self.elec])
        self.client.force_authenticate(self.eng_hod)
        response = self.client.get(f"{BASE}/tagouts/")
        ids = {row["id"] for row in response.data}
        self.assertIn(mine.id, ids)  # raised by an Engineering sailor
        self.assertNotIn(elec_tagout.id, ids)  # Electrical


# ---------------------------------------------------------------------------
# TagOut - approval
# ---------------------------------------------------------------------------
class TagOutApprovalTests(InOutTagTestBase):
    def setUp(self):
        self.tagout = self._raise_tagout(affected=[self.eng])

    def test_owning_hod_can_approve(self):
        self.client.force_authenticate(self.eng_hod)
        response = self.client.post(
            f"{BASE}/tagouts/{self.tagout.id}/approve/",
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.tagout.refresh_from_db()
        self.assertEqual(self.tagout.approval_status, "approved")
        self.assertEqual(self.tagout.approved_by_id, self.eng_hod.user_profile_id)
        self.assertIsNotNone(self.tagout.approved_on)

    def test_owning_dyhod_can_approve(self):
        self.client.force_authenticate(self.eng_dyhod)
        response = self.client.post(
            f"{BASE}/tagouts/{self.tagout.id}/approve/",
            {"action": "reject"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.tagout.refresh_from_db()
        self.assertEqual(self.tagout.approval_status, "rejected")

    def test_plain_user_cannot_approve(self):
        self.client.force_authenticate(self.maintainer)
        response = self.client.post(
            f"{BASE}/tagouts/{self.tagout.id}/approve/",
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_hod_of_another_department_cannot_even_see_it(self):
        self.client.force_authenticate(self.elec_hod)
        response = self.client.post(
            f"{BASE}/tagouts/{self.tagout.id}/approve/",
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_invalid_action_is_rejected(self):
        self.client.force_authenticate(self.eng_hod)
        response = self.client.post(
            f"{BASE}/tagouts/{self.tagout.id}/approve/",
            {"action": "close"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("action", response.data)

    def test_approval_list_returns_in_progress_tagouts_for_the_hod(self):
        self.client.force_authenticate(self.eng_hod)
        response = self.client.get(f"{BASE}/tagouts/approval_list/")
        self.assertEqual(response.status_code, 200)
        ids = {row["id"] for row in response.data}
        self.assertIn(self.tagout.id, ids)

    def test_approval_list_forbidden_for_plain_user(self):
        self.client.force_authenticate(self.maintainer)
        response = self.client.get(f"{BASE}/tagouts/approval_list/")
        self.assertEqual(response.status_code, 403)

    def test_approval_list_ship_wide_for_command_role(self):
        elec_tagout = self._raise_tagout(creator=self.elec_hod, affected=[self.elec])
        self.client.force_authenticate(self.co)
        response = self.client.get(f"{BASE}/tagouts/approval_list/")
        ids = {row["id"] for row in response.data}
        self.assertIn(self.tagout.id, ids)
        self.assertIn(elec_tagout.id, ids)


# ---------------------------------------------------------------------------
# TagOut - print slip
# ---------------------------------------------------------------------------
class TagOutPrintSlipTests(InOutTagTestBase):
    def test_only_approved_tagouts_print(self):
        tagout = self._raise_tagout(affected=[self.eng])
        self.client.force_authenticate(self.maintainer)
        response = self.client.get(f"{BASE}/tagouts/{tagout.id}/print_slip/")
        self.assertEqual(response.status_code, 400)

    def test_creator_gets_a_pdf(self):
        tagout = self._raise_tagout(affected=[self.eng], approved=True)
        self.client.force_authenticate(self.maintainer)
        response = self.client.get(f"{BASE}/tagouts/{tagout.id}/print_slip/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))

    def test_unrelated_user_is_blocked(self):
        tagout = self._raise_tagout(affected=[self.eng], approved=True)
        self.client.force_authenticate(self.elec_hod)
        response = self.client.get(f"{BASE}/tagouts/{tagout.id}/print_slip/")
        self.assertEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# TagIn - create
# ---------------------------------------------------------------------------
class TagInCreateTests(InOutTagTestBase):
    def test_creator_can_file_and_approvals_fan_out(self):
        tagout = self._raise_tagout(affected=[self.eng, self.elec], approved=True)
        self.client.force_authenticate(self.maintainer)
        response = self.client.post(
            f"{BASE}/tagins/", self._tagin_payload(tagout), format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        tagin = TagIn.objects.get(pk=response.data["id"])
        self.assertEqual(tagin.status, "completed")
        self.assertEqual(tagin.approval_status, "pending")
        self.assertEqual(tagin.tagin_maintainer_name_rank, "PO TECH")  # derived
        self.assertCountEqual(
            tagin.tagin_approvals.values_list("department__code", flat=True),
            ["ENG", "ELEC"],
        )

    def test_non_creator_cannot_file(self):
        tagout = self._raise_tagout(approved=True)
        self.client.force_authenticate(self.eng_hod)
        response = self.client.post(
            f"{BASE}/tagins/", self._tagin_payload(tagout), format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_cannot_file_against_an_unapproved_tagout(self):
        tagout = self._raise_tagout()  # still in_progress
        self.client.force_authenticate(self.maintainer)
        response = self.client.post(
            f"{BASE}/tagins/", self._tagin_payload(tagout), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("tagout", response.data)

    def test_duplicate_tagin_is_rejected(self):
        tagout = self._raise_tagout(approved=True)
        self._file_tagin(tagout)
        self.client.force_authenticate(self.maintainer)
        response = self.client.post(
            f"{BASE}/tagins/", self._tagin_payload(tagout), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("tagout", response.data)

    def test_items_pending_required_when_not_all_returned(self):
        tagout = self._raise_tagout(approved=True)
        self.client.force_authenticate(self.maintainer)
        response = self.client.post(
            f"{BASE}/tagins/",
            self._tagin_payload(tagout, all_items_returned=False, items_pending=""),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("items_pending", response.data)

    def test_form_meta_lists_only_own_open_approved_tagouts(self):
        mine_open = self._raise_tagout(creator=self.maintainer, approved=True)
        mine_closed = self._raise_tagout(creator=self.maintainer, approved=True)
        self._file_tagin(mine_closed)
        self._raise_tagout(creator=self.eng_hod, approved=True)  # not mine

        self.client.force_authenticate(self.maintainer)
        response = self.client.get(f"{BASE}/tagins/form_meta/")
        ids = {row["id"] for row in response.data}
        self.assertEqual(ids, {mine_open.id})


# ---------------------------------------------------------------------------
# TagIn - per-department approval
# ---------------------------------------------------------------------------
class TagInApprovalTests(InOutTagTestBase):
    def setUp(self):
        self.tagout = self._raise_tagout(affected=[self.eng, self.elec], approved=True)
        self.tagin = self._file_tagin(self.tagout)

    def _approve_as(self, user, action="approve"):
        self.client.force_authenticate(user)
        return self.client.post(
            f"{BASE}/tagins/{self.tagin.id}/approve/",
            {"action": action},
            format="json",
        )

    def test_department_hod_signs_off_its_own_row(self):
        response = self._approve_as(self.eng_hod)
        self.assertEqual(response.status_code, 200, response.data)
        row = self.tagin.tagin_approvals.get(department=self.eng)
        self.assertEqual(row.approval_status, "approved")
        self.assertEqual(row.approved_by_id, self.eng_hod.user_profile_id)
        # Electrical still outstanding -> parent stays pending.
        self.tagin.refresh_from_db()
        self.assertEqual(self.tagin.approval_status, "pending")

    def test_parent_approved_once_every_department_approves(self):
        self._approve_as(self.eng_hod)
        self._approve_as(self.elec_hod)
        self.tagin.refresh_from_db()
        self.assertEqual(self.tagin.approval_status, "approved")

    def test_any_rejection_rejects_the_parent(self):
        self._approve_as(self.eng_hod, action="reject")
        self.tagin.refresh_from_db()
        self.assertEqual(self.tagin.approval_status, "rejected")

    def test_dyhod_is_not_an_eligible_tagin_approver(self):
        response = self._approve_as(self.eng_dyhod)
        self.assertEqual(response.status_code, 403)

    def test_hod_of_an_uninvolved_department_is_blocked(self):
        # Operations is neither the owning nor an affected department, so the
        # row-level guard hides the Tag In from its HOD entirely (403).
        ops_hod = _make_user(
            "ops-hod", role_name="Head of Department", department=self.ops, pno="1006"
        )
        response = self._approve_as(ops_hod)
        self.assertEqual(response.status_code, 403)

    def test_cannot_action_the_same_row_twice(self):
        self._approve_as(self.eng_hod)
        response = self._approve_as(self.eng_hod, action="reject")
        self.assertEqual(response.status_code, 400)

    def test_approval_list_shows_tagins_pending_the_hods_department(self):
        self.client.force_authenticate(self.eng_hod)
        response = self.client.get(f"{BASE}/tagins/approval_list/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(self.tagin.id, {row["id"] for row in response.data})

    def test_approval_list_forbidden_for_dyhod(self):
        self.client.force_authenticate(self.eng_dyhod)
        response = self.client.get(f"{BASE}/tagins/approval_list/")
        self.assertEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# Dashboard / History
# ---------------------------------------------------------------------------
class DashboardHistoryTests(InOutTagTestBase):
    def test_dashboard_payload(self):
        tagout = self._raise_tagout(creator=self.maintainer, approved=True)
        self._file_tagin(tagout)
        self.client.force_authenticate(self.maintainer)

        response = self.client.get(f"{BASE}/dashboard/")
        self.assertEqual(response.status_code, 200)
        for key in (
            "weekly_tagout_count",
            "weekly_tagin_count",
            "tagout_pending_approval_count",
            "tagout_yet_to_tagin_count",
            "tagin_pending_by_department",
            "history_data",
            "pending_user_registrations_count",
        ):
            self.assertIn(key, response.data)
        self.assertEqual(len(response.data["history_data"]), 7)

    def test_history_envelope_and_scoping(self):
        mine = self._raise_tagout(creator=self.maintainer)
        self._raise_tagout(creator=self.elec_hod, affected=[self.elec])

        self.client.force_authenticate(self.maintainer)
        response = self.client.get(f"{BASE}/history/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "success")
        self.assertIn("departments", response.data)
        self.assertEqual({row["id"] for row in response.data["data"]}, {mine.id})


# ---------------------------------------------------------------------------
# Excel import / export
# ---------------------------------------------------------------------------
class TagOutExcelTests(InOutTagTestBase):
    def setUp(self):
        self.client.force_authenticate(self.maintainer)

    def test_import_then_export_round_trips(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(
            [
                "date",
                "tagout_equipment_name",
                "expected_date_of_tagin",
                "name_of_subsystem",
                "name_of_component",
                "serial_number_of_component",
                "weight_of_component",
                "type",
                "condition",
                "tagout_reason",
                "tagout_description",
                "tagout_maintainer_name_rank",
            ]
        )
        sheet.append(
            [
                "2026-06-06",
                self.other_equipment.pk,
                "2026-06-20",
                "COOLING",
                "COOLING WATER VALVE",
                "CW-01",
                "5.00",
                "warning",
                "non_ops",
                "survey_and_demand",
                "Tagged for survey",
                "CPO TECH",
            ]
        )
        content = BytesIO()
        workbook.save(content)

        response = self.client.post(
            f"{BASE}/tagouts/import-excel/",
            {
                "file": SimpleUploadedFile(
                    "tagouts.xlsx",
                    content.getvalue(),
                    content_type=(
                        "application/vnd.openxmlformats-officedocument."
                        "spreadsheetml.sheet"
                    ),
                )
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(
            TagOut.objects.filter(name_of_component="COOLING WATER VALVE").exists()
        )

        export = self.client.get(f"{BASE}/tagouts/export-excel/")
        self.assertEqual(export.status_code, 200)
        self.assertIn("spreadsheetml", export["Content-Type"])

    def test_unknown_column_is_rejected(self):
        workbook = Workbook()
        workbook.active.append(["date", "not_a_field"])
        content = BytesIO()
        workbook.save(content)
        response = self.client.post(
            f"{BASE}/tagouts/import-excel/",
            {"file": SimpleUploadedFile("bad.xlsx", content.getvalue())},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("headers", response.data)


# ---------------------------------------------------------------------------
# Routing + model unit behaviour
# ---------------------------------------------------------------------------
class RouteResolutionTests(InOutTagTestBase):
    def test_routes_resolve(self):
        tagout = self._raise_tagout()
        for path in (
            f"{BASE}/dashboard/",
            f"{BASE}/history/",
            f"{BASE}/tagouts/",
            f"{BASE}/tagouts/{tagout.id}/",
            f"{BASE}/tagouts/{tagout.id}/approve/",
            f"{BASE}/tagouts/{tagout.id}/print_slip/",
            f"{BASE}/tagouts/approval_list/",
            f"{BASE}/tagouts/import-excel/",
            f"{BASE}/tagins/",
            f"{BASE}/tagins/approval_list/",
        ):
            with self.subTest(path=path):
                self.assertIsNotNone(resolve(path))


class CheckAllApprovalsTests(InOutTagTestBase):
    def test_rollup_states(self):
        tagout = self._raise_tagout(affected=[self.eng, self.elec], approved=True)
        tagin = TagIn.objects.create(
            tagout=tagout,
            tagin_date=date(2026, 6, 9),
            tagin_description="x",
            tagin_maintainer="y",
        )
        eng_row = TagInApproval.objects.create(tagin=tagin, department=self.eng)
        elec_row = TagInApproval.objects.create(tagin=tagin, department=self.elec)

        tagin.check_all_approvals()
        tagin.refresh_from_db()
        self.assertEqual(tagin.approval_status, "pending")

        eng_row.approval_status = "approved"
        eng_row.save()
        elec_row.approval_status = "approved"
        elec_row.save()
        tagin.check_all_approvals()
        tagin.refresh_from_db()
        self.assertEqual(tagin.approval_status, "approved")

        elec_row.approval_status = "rejected"
        elec_row.save()
        tagin.check_all_approvals()
        tagin.refresh_from_db()
        self.assertEqual(tagin.approval_status, "rejected")
