from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from master.models import Department

from .models import (
    AddHotwork,
    ApprovalStatus,
    DayType,
    HotworkHODApproval,
    HotworkProgressActivity,
    HotworkType,
    OpsNonOpsChoices,
)


class HotworkAPITestCase(APITestCase):
    def setUp(self):
        self.department = Department.objects.create(
            name="Engineering",
            code="ENGINEERING",
        )
        self.electrical_department = Department.objects.create(
            name="Electrical",
            code="ELECTRICAL",
        )
        self.nbcd_department = Department.objects.create(
            name="NBCD",
            code="NBCD",
        )
        self.user = get_user_model().objects.create_user(
            username="test_user",
            password="password",
            first_name="Test",
            last_name="User",
            personnel_number="PN001",
            department=self.department,
            designation="DY HOD",
            is_ood=True,
        )
        self.other_user = get_user_model().objects.create_user(
            username="other_user",
            password="password",
            first_name="Other",
            last_name="User",
            personnel_number="PN002",
            department=self.department,
        )
        self.hod_user = get_user_model().objects.create_user(
            username="hod_user",
            password="password",
            first_name="Hod",
            last_name="User",
            personnel_number="PN003",
            department=self.department,
            designation="Head of Department",
        )
        self.client.force_authenticate(user=self.user)

    def hotwork_payload(self, **overrides):
        payload = {
            "hotwork_code": "HW-001",
            "date_of_hotwork": "2026-06-04",
            "location_of_hotwork": "Engine Room",
            "type_of_hotwork": HotworkType.WELDING,
            "holiday_or_working_day": DayType.WORKING_DAY,
            "night_work": False,
            "sentries_required": True,
            "hotwork_incharge": self.user.id,
            "officer_of_the_day": self.user.id,
        }
        payload.update(overrides)
        return payload

    def create_hotwork(self, **overrides):
        return AddHotwork.objects.create(
            hotwork_code=overrides.pop("hotwork_code", "HW-001"),
            date_of_hotwork=overrides.pop("date_of_hotwork", "2026-06-04"),
            location_of_hotwork=overrides.pop("location_of_hotwork", "Engine Room"),
            type_of_hotwork=overrides.pop("type_of_hotwork", HotworkType.WELDING),
            **overrides,
        )

    def test_create_hotwork(self):
        response = self.client.post(
            reverse("hotwork-list"),
            self.hotwork_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(AddHotwork.objects.count(), 1)

        hotwork = AddHotwork.objects.get()
        # hotwork_code is server-generated (sequential), not client-supplied.
        self.assertEqual(hotwork.hotwork_code, "1")
        self.assertEqual(hotwork.created_by, self.user)
        # self.user is a DYHOD creator, so it always requires manual DYHOD approval.
        self.assertEqual(hotwork.approval_status, ApprovalStatus.PENDING_DYHOD)
        self.assertIn("current_status", response.data)

    def test_create_hotwork_by_non_dyhod_working_day_goes_to_dyhod(self):
        self.client.force_authenticate(user=self.other_user)

        response = self.client.post(
            reverse("hotwork-list"),
            self.hotwork_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        hotwork = AddHotwork.objects.get()
        self.assertEqual(hotwork.approval_status, ApprovalStatus.PENDING_DYHOD)

    def test_create_hotwork_by_non_dyhod_night_work_skips_to_ood(self):
        self.client.force_authenticate(user=self.other_user)

        response = self.client.post(
            reverse("hotwork-list"),
            self.hotwork_payload(night_work=True),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        hotwork = AddHotwork.objects.get()
        self.assertEqual(hotwork.approval_status, ApprovalStatus.PENDING_OOD)

    def test_hotwork_code_increments_sequentially(self):
        self.client.post(reverse("hotwork-list"), self.hotwork_payload(), format="json")
        second_response = self.client.post(
            reverse("hotwork-list"), self.hotwork_payload(), format="json"
        )

        codes = list(
            AddHotwork.objects.order_by("created_at").values_list(
                "hotwork_code", flat=True
            )
        )
        self.assertEqual(codes, ["1", "2"])
        self.assertEqual(second_response.data["hotwork_code"], "2")

    def test_list_and_retrieve_hotworks(self):
        hotwork = self.create_hotwork(hotwork_code="HW-002")

        list_response = self.client.get(reverse("hotwork-list"))
        detail_response = self.client.get(reverse("hotwork-detail", args=[hotwork.id]))

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data[0]["hotwork_code"], "HW-002")
        self.assertEqual(detail_response.data["hotwork_code"], "HW-002")
        self.assertEqual(detail_response.data["current_status"], "Not Started")

    def test_my_hotworks_returns_created_or_assigned_records(self):
        self.create_hotwork(hotwork_code="HW-MINE", created_by=self.user)
        self.create_hotwork(
            hotwork_code="HW-OTHER",
            created_by=self.other_user,
            hotwork_incharge=self.other_user,
        )

        response = self.client.get(reverse("hotwork-my-hotworks"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["hotwork_code"], "HW-MINE")

    def test_pending_approvals_returns_matching_approval_stages(self):
        self.create_hotwork(
            hotwork_code="HW-DYHOD",
            approval_status=ApprovalStatus.PENDING_DYHOD,
            created_by=self.user,
        )
        self.create_hotwork(
            hotwork_code="HW-OOD",
            approval_status=ApprovalStatus.PENDING_OOD,
            officer_of_the_day=self.user,
        )
        self.create_hotwork(
            hotwork_code="HW-APPROVED",
            approval_status=ApprovalStatus.APPROVED,
        )

        response = self.client.get(reverse("hotwork-pending-approvals"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {item["hotwork_code"] for item in response.data},
            {"HW-DYHOD", "HW-OOD"},
        )

    def test_tracking_filters_by_status_and_date(self):
        self.create_hotwork(
            hotwork_code="HW-TRACK",
            approval_status=ApprovalStatus.PENDING_OOD,
            date_of_hotwork="2026-06-04",
        )
        self.create_hotwork(
            hotwork_code="HW-NOPE",
            approval_status=ApprovalStatus.REJECTED,
            date_of_hotwork="2026-06-05",
        )

        response = self.client.get(
            reverse("hotwork-tracking"),
            {
                "status": ApprovalStatus.PENDING_OOD,
                "date": "2026-06-04",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["hotwork_code"], "HW-TRACK")

    def test_dyhod_approval_moves_working_day_to_hods(self):
        hotwork = self.create_hotwork(
            approval_status=ApprovalStatus.PENDING_DYHOD,
            created_by=self.user,
        )

        response = self.client.post(
            reverse("hotwork-dyhod-approve", args=[hotwork.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        hotwork.refresh_from_db()
        self.assertTrue(hotwork.dyhod_approved)
        self.assertEqual(hotwork.dyhod_approved_by, self.user)
        self.assertIsNotNone(hotwork.dyhod_approved_at)
        self.assertEqual(hotwork.approval_status, ApprovalStatus.PENDING_HODS)
        # Eligible-department HOD approval rows are pre-created at this stage.
        self.assertEqual(
            set(hotwork.hod_approvals.values_list("department__code", flat=True)),
            {"ENGINEERING"},
        )

    def test_dyhod_approval_rejects_cross_department_attempt(self):
        other_department = Department.objects.create(name="Ops", code="OPS")
        creator = get_user_model().objects.create_user(
            username="creator",
            password="password",
            personnel_number="PN010",
            department=other_department,
        )
        hotwork = self.create_hotwork(
            approval_status=ApprovalStatus.PENDING_DYHOD,
            created_by=creator,
        )

        response = self.client.post(
            reverse("hotwork-dyhod-approve", args=[hotwork.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        hotwork.refresh_from_db()
        self.assertEqual(hotwork.approval_status, ApprovalStatus.PENDING_DYHOD)

    def test_dyhod_approval_moves_holiday_or_night_work_to_ood(self):
        hotwork = self.create_hotwork(
            approval_status=ApprovalStatus.PENDING_DYHOD,
            holiday_or_working_day=DayType.HOLIDAY,
            night_work=True,
            created_by=self.user,
        )

        response = self.client.post(
            reverse("hotwork-dyhod-approve", args=[hotwork.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        hotwork.refresh_from_db()
        self.assertEqual(hotwork.approval_status, ApprovalStatus.PENDING_OOD)

    def test_hod_approval_requires_remarks_when_non_ops(self):
        electrical_hod = get_user_model().objects.create_user(
            username="electrical_hod",
            password="password",
            personnel_number="PN004",
            department=self.electrical_department,
            designation="Head of Department",
        )
        self.client.force_authenticate(user=electrical_hod)
        hotwork = self.create_hotwork(approval_status=ApprovalStatus.PENDING_HODS)

        response = self.client.post(
            reverse("hotwork-hod-approve", args=[hotwork.id]),
            {"fire_sensor_ops": OpsNonOpsChoices.NON_OPS},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        approval = HotworkHODApproval.objects.get(
            hotwork=hotwork, department=self.electrical_department
        )
        self.assertFalse(approval.approved)

    def test_hod_approval_completes_checklist_and_progresses_status(self):
        self.client.force_authenticate(user=self.hod_user)
        hotwork = self.create_hotwork(approval_status=ApprovalStatus.PENDING_FIRST_HOD)

        response = self.client.post(
            reverse("hotwork-hod-approve", args=[hotwork.id]),
            {"earthing_gts": "YES"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        approval = HotworkHODApproval.objects.get(
            hotwork=hotwork, department=self.department
        )
        self.assertTrue(approval.approved)
        self.assertEqual(approval.earthing_gts, "YES")
        hotwork.refresh_from_db()
        self.assertEqual(hotwork.approval_status, ApprovalStatus.PENDING_HODS)

    def test_hod_approval_blocked_when_excluded(self):
        with override_settings(
            HOTWORK_EXCLUDED_HOD_PERSONNEL_NUMBERS=[self.hod_user.personnel_number]
        ):
            self.client.force_authenticate(user=self.hod_user)
            hotwork = self.create_hotwork(approval_status=ApprovalStatus.PENDING_HODS)

            response = self.client.post(
                reverse("hotwork-hod-approve", args=[hotwork.id]),
                {},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_ood_approval_marks_hotwork_approved_and_prevents_duplicate(self):
        hotwork = self.create_hotwork(
            approval_status=ApprovalStatus.PENDING_OOD,
            officer_of_the_day=self.user,
        )

        first_response = self.client.post(
            reverse("hotwork-ood-approve", args=[hotwork.id]),
            {},
            format="json",
        )
        second_response = self.client.post(
            reverse("hotwork-ood-approve", args=[hotwork.id]),
            {},
            format="json",
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)
        hotwork.refresh_from_db()
        self.assertTrue(hotwork.ood_approved)
        self.assertEqual(hotwork.approval_status, ApprovalStatus.APPROVED)

    def test_ood_approval_auto_fills_hod_checklist_for_night_work(self):
        hotwork = self.create_hotwork(
            approval_status=ApprovalStatus.PENDING_OOD,
            officer_of_the_day=self.user,
            night_work=True,
        )

        response = self.client.post(
            reverse("hotwork-ood-approve", args=[hotwork.id]),
            {"earthing_gts": "YES"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        approval = HotworkHODApproval.objects.get(
            hotwork=hotwork, department=self.department
        )
        self.assertTrue(approval.approved)
        self.assertEqual(approval.approved_by, self.user)
        self.assertEqual(approval.earthing_gts, "YES")
        # Electrical/NBCD have no eligible HOD in this test setup, so no
        # placeholder checklist rows are created for them.
        self.assertEqual(hotwork.hod_approvals.count(), 1)

    def test_ood_approval_rejects_non_assigned_officer(self):
        hotwork = self.create_hotwork(
            approval_status=ApprovalStatus.PENDING_OOD,
            officer_of_the_day=self.other_user,
        )

        response = self.client.post(
            reverse("hotwork-ood-approve", args=[hotwork.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_reject_marks_hotwork_rejected(self):
        hotwork = self.create_hotwork(
            approval_status=ApprovalStatus.PENDING_DYHOD,
            created_by=self.user,
        )

        response = self.client.post(
            reverse("hotwork-reject", args=[hotwork.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        hotwork.refresh_from_db()
        self.assertEqual(hotwork.approval_status, ApprovalStatus.REJECTED)

    def test_reject_blocked_for_non_pending_hotwork(self):
        hotwork = self.create_hotwork(approval_status=ApprovalStatus.APPROVED)

        response = self.client.post(
            reverse("hotwork-reject", args=[hotwork.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        hotwork.refresh_from_db()
        self.assertEqual(hotwork.approval_status, ApprovalStatus.APPROVED)

    def test_start_requires_approved_hotwork(self):
        hotwork = self.create_hotwork()

        response = self.client.post(
            reverse("hotwork-start", args=[hotwork.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(HotworkProgressActivity.objects.count(), 0)

    def test_start_blocked_when_time_window_expired(self):
        hotwork = self.create_hotwork(
            approval_status=ApprovalStatus.APPROVED,
            date_of_hotwork="2020-01-01",
        )

        response = self.client.post(
            reverse("hotwork-start", args=[hotwork.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        hotwork.refresh_from_db()
        self.assertFalse(hotwork.is_started)

    @patch("hotwork.views._is_hotwork_window_expired", return_value=False)
    def test_start_pause_resume_and_complete_hotwork(self, _mock_expired):
        hotwork = self.create_hotwork(approval_status=ApprovalStatus.APPROVED)

        start_response = self.client.post(
            reverse("hotwork-start", args=[hotwork.id]),
            {},
            format="json",
        )
        pause_response = self.client.post(
            reverse("hotwork-pause", args=[hotwork.id]),
            {"pause_reason": "Ventilation check"},
            format="json",
        )
        resume_response = self.client.post(
            reverse("hotwork-start", args=[hotwork.id]),
            {},
            format="json",
        )
        complete_response = self.client.post(
            reverse("hotwork-complete", args=[hotwork.id]),
            {"completion_remarks": "Completed safely"},
            format="json",
        )

        self.assertEqual(start_response.status_code, status.HTTP_200_OK)
        self.assertEqual(pause_response.status_code, status.HTTP_200_OK)
        self.assertEqual(resume_response.status_code, status.HTTP_200_OK)
        self.assertEqual(complete_response.status_code, status.HTTP_200_OK)

        hotwork.refresh_from_db()
        self.assertTrue(hotwork.is_started)
        self.assertFalse(hotwork.is_paused)
        self.assertTrue(hotwork.is_completed)
        self.assertEqual(hotwork.completion_remarks, "Completed safely")
        self.assertEqual(
            set(
                HotworkProgressActivity.objects.filter(hotwork=hotwork).values_list(
                    "action",
                    flat=True,
                )
            ),
            {"started", "paused", "resumed", "completed"},
        )

    def test_pause_requires_reason(self):
        hotwork = self.create_hotwork(
            approval_status=ApprovalStatus.APPROVED,
            is_started=True,
        )

        response = self.client.post(
            reverse("hotwork-pause", args=[hotwork.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("pause_reason", response.data)

    def test_active_and_completed_endpoints(self):
        self.create_hotwork(
            hotwork_code="HW-ACTIVE",
            is_started=True,
            is_completed=False,
        )
        self.create_hotwork(
            hotwork_code="HW-DONE",
            is_started=True,
            is_completed=True,
        )

        active_response = self.client.get(reverse("hotwork-active"))
        completed_response = self.client.get(reverse("hotwork-completed"))

        self.assertEqual(active_response.status_code, status.HTTP_200_OK)
        self.assertEqual(completed_response.status_code, status.HTTP_200_OK)
        self.assertEqual(active_response.data[0]["hotwork_code"], "HW-ACTIVE")
        self.assertEqual(completed_response.data[0]["hotwork_code"], "HW-DONE")


class HotworkModelTestCase(APITestCase):
    def create_hotwork(self, **overrides):
        defaults = {
            "hotwork_code": "HW-MODEL",
            "date_of_hotwork": "2026-06-04",
            "location_of_hotwork": "Paint Locker",
            "type_of_hotwork": HotworkType.GRINDING,
        }
        defaults.update(overrides)
        return AddHotwork.objects.create(**defaults)

    def test_current_status_returns_completed_before_approval_display(self):
        hotwork = self.create_hotwork(
            approval_status=ApprovalStatus.APPROVED,
            is_completed=True,
        )

        self.assertEqual(hotwork.current_status, "Completed")

    def test_check_all_hods_approved_updates_status_after_first_and_final_approval(
        self,
    ):
        hotwork = self.create_hotwork(
            approval_status=ApprovalStatus.PENDING_FIRST_HOD,
        )
        departments = [
            Department.objects.create(name="Engineering", code="ENGINEERING"),
            Department.objects.create(name="Electrical", code="ELECTRICAL"),
            Department.objects.create(name="NBCD", code="NBCD"),
        ]

        HotworkHODApproval.objects.create(
            hotwork=hotwork,
            department=departments[0],
            approved=True,
        )

        self.assertFalse(hotwork.check_all_hods_approved())
        hotwork.refresh_from_db()
        self.assertFalse(hotwork.all_hods_approved)
        self.assertEqual(hotwork.approval_status, ApprovalStatus.PENDING_HODS)

        for department in departments[1:]:
            HotworkHODApproval.objects.create(
                hotwork=hotwork,
                department=department,
                approved=True,
            )

        self.assertTrue(hotwork.check_all_hods_approved())
        hotwork.refresh_from_db()
        self.assertTrue(hotwork.all_hods_approved)
        self.assertEqual(hotwork.approval_status, ApprovalStatus.PENDING_OOD)

    def test_department_approval_helpers_return_matching_approvals(self):
        hotwork = self.create_hotwork()
        engineering = Department.objects.create(
            name="Engineering",
            code="ENGINEERING",
        )
        approval = HotworkHODApproval.objects.create(
            hotwork=hotwork,
            department=engineering,
            approved=True,
        )

        self.assertEqual(hotwork.get_eng_approval(), approval)
        self.assertIsNone(hotwork.get_elec_approval())
