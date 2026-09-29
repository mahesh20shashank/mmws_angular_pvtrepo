"""
Tests for the Ship Crew API. These lock in the behaviour that is easy to break:

* authorization - only an approver role may approve / reject / edit someone
  else's leave or write personnel status (IsCrewApprover); a plain user can
  still submit and list their own
* apply_on_behalf creates the application already Approved and writes the
  per-day status logs
* the watchbill dashboard returns real counts
* DELETE /civilians/{id}/ is a soft delete (is_active=False)
* PATCH /leave-applications/{id}/ accepts {"new_end_date": ...} and rebuilds
  the status logs, clamping a date before the start date
* creating a sailing with copy_from_sailing_id copies the crew across
"""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from master.models import Department
from rest_framework import status
from rest_framework.test import APITestCase
from accounts.models import CustomUserProfile, Role

from .models import (
    CivilianOfficial,
    LeaveApplication,
    PersonnelStatusLog,
    Sailing,
    SailingPersonnel,
)

User = get_user_model()


def _make_user(username, *, role_name, department, pno):
    role = Role.objects.create(role_name=role_name) if role_name else None
    profile = CustomUserProfile.objects.create(
        firstname=username.title(),
        lastname="Test",
        personal_number=pno,
        department=department,
        role_master=role,
        designation="Tester",
        user_active=True,
    )
    return User.objects.create_user(
        username=username.upper(), user_profile=profile.id, password="pw"
    )


class CrewManageTestBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.eng = Department.objects.create(name="Engineering", code="ENGINEERING")
        cls.gun = Department.objects.create(name="Gunnery", code="GUNNERY")

        cls.sailor = _make_user(
            "sailor", role_name="Sailor", department=cls.eng, pno="1001"
        )
        cls.hod = _make_user(
            "hod", role_name="Head of Department", department=cls.eng, pno="1002"
        )
        cls.other_hod = _make_user(
            "ghod", role_name="Head of Department", department=cls.gun, pno="1003"
        )
        cls.co = _make_user("co", role_name="CO", department=cls.eng, pno="1004")

    def _pending_leave(self, *, department, pno="1001", applied_by=None):
        return LeaveApplication.objects.create(
            personal_number=pno,
            name="Sailor Test",
            department=department.name,
            leave_type="On Leave",
            start_date=date.today(),
            end_date=date.today() + timedelta(days=3),
            application_status="Pending",
            applied_by=applied_by or self.sailor.user_profile,
        )


class PermissionGateTests(CrewManageTestBase):
    """The core regression: mutating endpoints require an approver role."""

    def test_pending_list_forbidden_for_plain_sailor(self):
        self.client.force_authenticate(self.sailor)
        resp = self.client.get("/api/v1/crew-management/leave-applications/pending/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_pending_list_allowed_for_hod(self):
        self.client.force_authenticate(self.hod)
        resp = self.client.get("/api/v1/crew-management/leave-applications/pending/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_take_action_forbidden_for_plain_sailor(self):
        leave = self._pending_leave(department=self.eng)
        self.client.force_authenticate(self.sailor)
        resp = self.client.post(
            f"/api/v1/crew-management/leave-applications/{leave.id}/action/",
            {"action": "Approved"},
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        leave.refresh_from_db()
        self.assertEqual(leave.application_status, "Pending")

    def test_take_action_allowed_for_hod_same_department(self):
        leave = self._pending_leave(department=self.eng)
        self.client.force_authenticate(self.hod)
        resp = self.client.post(
            f"/api/v1/crew-management/leave-applications/{leave.id}/action/",
            {"action": "Approved"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        leave.refresh_from_db()
        self.assertEqual(leave.application_status, "Approved")

    def test_hod_cannot_action_other_departments_leave(self):
        leave = self._pending_leave(department=self.eng)
        self.client.force_authenticate(self.other_hod)
        resp = self.client.post(
            f"/api/v1/crew-management/leave-applications/{leave.id}/action/",
            {"action": "Approved"},
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_co_can_action_any_department(self):
        leave = self._pending_leave(department=self.gun, pno="1003")
        self.client.force_authenticate(self.co)
        resp = self.client.post(
            f"/api/v1/crew-management/leave-applications/{leave.id}/action/",
            {"action": "Rejected", "rejection_reason": "no"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        leave.refresh_from_db()
        self.assertEqual(leave.application_status, "Rejected")

    def test_delete_and_patch_forbidden_for_plain_sailor(self):
        leave = self._pending_leave(department=self.eng)
        self.client.force_authenticate(self.sailor)
        d = self.client.delete(
            f"/api/v1/crew-management/leave-applications/{leave.id}/"
        )
        p = self.client.patch(
            f"/api/v1/crew-management/leave-applications/{leave.id}/",
            {"new_end_date": str(date.today())},
        )
        self.assertEqual(d.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(p.status_code, status.HTTP_403_FORBIDDEN)

    def test_personnel_status_update_forbidden_for_plain_sailor(self):
        self.client.force_authenticate(self.sailor)
        resp = self.client.post(
            "/api/v1/crew-management/personnel-status/update/",
            {"personal_number": "1001", "status": "On Leave"},
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_is_rejected(self):
        resp = self.client.get("/api/v1/crew-management/leave-applications/pending/")
        self.assertIn(
            resp.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_plain_sailor_can_still_list_own_and_check_conflict(self):
        self._pending_leave(department=self.eng)
        self.client.force_authenticate(self.sailor)
        lst = self.client.get("/api/v1/crew-management/leave-applications/")
        conf = self.client.get(
            "/api/v1/crew-management/leave-applications/check_conflict/",
            {"personal_number": "1001"},
        )
        self.assertEqual(lst.status_code, status.HTTP_200_OK)
        self.assertEqual(conf.status_code, status.HTTP_200_OK)


class ApplyOnBehalfTests(CrewManageTestBase):
    def test_apply_on_behalf_auto_approves_and_logs(self):
        self.client.force_authenticate(self.hod)
        resp = self.client.post(
            "/api/v1/crew-management/leave-applications/apply_on_behalf/",
            {
                "personal_number": "1001",
                "leave_type": "On Leave",
                "start_date": str(date.today()),
                "end_date": str(date.today() + timedelta(days=2)),
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        app = LeaveApplication.objects.get(id=resp.data["application_id"])
        self.assertEqual(app.application_status, "Approved")
        self.assertEqual(app.approved_rejected_by_id, self.hod.user_profile_id)
        self.assertIsNotNone(app.approved_rejected_at)
        self.assertEqual(
            PersonnelStatusLog.objects.filter(leave_application=app).count(), 3
        )

    def test_apply_on_behalf_forbidden_for_plain_sailor(self):
        self.client.force_authenticate(self.sailor)
        resp = self.client.post(
            "/api/v1/crew-management/leave-applications/apply_on_behalf/",
            {
                "personal_number": "1001",
                "leave_type": "On Leave",
                "start_date": str(date.today()),
                "end_date": str(date.today() + timedelta(days=2)),
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class WatchbillDashboardTests(CrewManageTestBase):
    def test_dashboard_returns_real_numbers(self):
        self.client.force_authenticate(self.hod)
        resp = self.client.get("/api/v1/crew-management/watchbill/dashboard/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.data
        self.assertIsInstance(body["total"], int)
        self.assertGreaterEqual(body["total"], 4)  # the 4 profiles from setUpTestData
        self.assertEqual(body["total"], body["present"] + body["absent"])
        self.assertIsInstance(body["dept_strength"], list)
        self.assertIsInstance(body["active_sailings"], list)


class CivilianSoftDeleteTests(CrewManageTestBase):
    def test_delete_civilian_is_soft(self):
        civ = CivilianOfficial.objects.create(
            name_snapshot="Dhobi Singh",
            role="Dhobi",
            person_type="civilian",
            created_by=self.hod,
        )
        self.client.force_authenticate(self.hod)
        resp = self.client.delete(f"/api/v1/crew-management/civilians/{civ.id}/")
        self.assertIn(
            resp.status_code, (status.HTTP_200_OK, status.HTTP_204_NO_CONTENT)
        )
        # self.assertFalse(civ.is_active)
        self.assertFalse(civ.active)


class UpdateLeaveDatesTests(CrewManageTestBase):
    def test_patch_accepts_new_end_date_and_rebuilds_logs(self):
        leave = self._pending_leave(department=self.eng)
        leave.application_status = "Approved"
        leave.save()
        from crew_manage.serializers import _log_status_range

        _log_status_range(leave)
        self.assertEqual(
            PersonnelStatusLog.objects.filter(leave_application=leave).count(), 4
        )

        self.client.force_authenticate(self.hod)
        new_end = date.today() + timedelta(days=1)
        resp = self.client.patch(
            f"/api/v1/crew-management/leave-applications/{leave.id}/",
            {"new_end_date": str(new_end)},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        leave.refresh_from_db()
        self.assertEqual(leave.end_date, new_end)
        self.assertEqual(
            PersonnelStatusLog.objects.filter(leave_application=leave).count(), 2
        )

    def test_patch_clamps_new_end_before_start(self):
        leave = self._pending_leave(department=self.eng)
        self.client.force_authenticate(self.hod)
        resp = self.client.patch(
            f"/api/v1/crew-management/leave-applications/{leave.id}/",
            {"new_end_date": str(leave.start_date - timedelta(days=5))},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        leave.refresh_from_db()
        self.assertEqual(leave.end_date, leave.start_date)


class SailingCopyTests(CrewManageTestBase):
    def test_create_sailing_with_copy_from_does_not_raise(self):
        src = Sailing.objects.create(
            name="Prev Sailing", start_date=None, created_by=self.hod, status="active"
        )
        SailingPersonnel.objects.create(
            sailing=src,
            rank_snapshot="PO",
            name_snapshot="Sailor Test",
            pno_snapshot="1001",
            dept_snapshot="Engineering",
            created_by=self.hod,
        )
        self.client.force_authenticate(self.hod)
        resp = self.client.post(
            "/api/v1/crew-management/sailings/",
            {
                "name": "New Sailing",
                "start": str(date.today()),
                "start_time": "09:00",
                "copy_from_sailing_id": src.id,
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["copied_personnel"], 1)
        new_id = resp.data["id"]
        self.assertEqual(SailingPersonnel.objects.filter(sailing_id=new_id).count(), 1)
