from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from master.models import Department

from .models import Duty, TimeSlot, WorkAssignment


class WorkManagementAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.department = Department.objects.create(
            name="OPS",
            code="OPS",
            description="Operations department",
        )
        self.assigner = get_user_model().objects.create_user(
            username="work-assigner",
            password="Pass@12345",
            personnel_number="PN2001",
            department=self.department,
        )
        self.assignee = get_user_model().objects.create_user(
            username="work-assignee",
            password="Pass@12345",
            personnel_number="PN2002",
            department=self.department,
        )
        self.client.force_authenticate(self.assigner)

    def test_duty_is_created_for_logged_in_user_department(self):
        response = self.client.post(
            reverse("work-duty-list"),
            {
                "duty_name": "Quartermaster watch",
                "description": "Maintain quarterdeck watch.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        duty = Duty.objects.get(id=response.data["id"])
        self.assertEqual(duty.created_by, self.assigner)
        self.assertEqual(duty.department, self.department)

    def test_duplicate_duty_name_in_same_department_is_rejected(self):
        Duty.objects.create(
            duty_name="Bridge watch",
            user=self.assigner,
            created_by=self.assigner,
            department=self.department,
        )

        response = self.client.post(
            reverse("work-duty-list"),
            {"duty_name": "bridge watch"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("duty_name", response.data)

    def test_assignment_rejects_time_overlap_for_same_assignee(self):
        duty = self._create_duty()
        first_slot = self._create_slot(time(8, 0), time(10, 0))
        second_slot = self._create_slot(time(9, 0), time(11, 0))
        WorkAssignment.objects.create(
            assigner=self.assigner,
            assignee=self.assignee,
            timeslot=first_slot,
            duty=duty,
            assignment_date=date(2026, 6, 9),
            department=self.department,
        )

        response = self.client.post(
            reverse("work-assignment-list"),
            {
                "assignee": self.assignee.id,
                "timeslot": second_slot.id,
                "duty": duty.id,
                "assignment_date": "2026-06-09",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("timeslot", response.data)

    def test_available_users_excludes_already_assigned_user(self):
        duty = self._create_duty()
        slot = self._create_slot(time(8, 0), time(10, 0))
        WorkAssignment.objects.create(
            assigner=self.assigner,
            assignee=self.assignee,
            timeslot=slot,
            duty=duty,
            assignment_date=date(2026, 6, 9),
            department=self.department,
        )

        response = self.client.get(
            reverse("work-assignment-available-users"),
            {"date": "2026-06-09"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user_ids = [item["id"] for item in response.data["users"]]
        self.assertNotIn(self.assignee.id, user_ids)

    def test_dashboard_counts_assignments_and_timeslots(self):
        duty = self._create_duty()
        slot = self._create_slot(time(8, 0), time(10, 0))
        WorkAssignment.objects.create(
            assigner=self.assigner,
            assignee=self.assignee,
            timeslot=slot,
            duty=duty,
            assignment_date=date(2026, 6, 9),
            department=self.department,
        )

        response = self.client.get(
            reverse("work-assignment-dashboard"),
            {"date": "2026-06-09"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_assignments"], 1)
        self.assertEqual(response.data["total_slots"], 1)

    def test_assignment_status_can_be_marked_completed(self):
        duty = self._create_duty()
        slot = self._create_slot(time(8, 0), time(10, 0))
        assignment = WorkAssignment.objects.create(
            assigner=self.assigner,
            assignee=self.assignee,
            timeslot=slot,
            duty=duty,
            assignment_date=date(2026, 6, 9),
            department=self.department,
        )

        response = self.client.post(
            reverse("work-assignment-complete", kwargs={"pk": assignment.id})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, WorkAssignment.Status.COMPLETED)

    def test_anonymous_user_cannot_access_work_manage(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(reverse("work-duty-list"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def _create_duty(self):
        return Duty.objects.create(
            duty_name="Duty",
            user=self.assigner,
            created_by=self.assigner,
            department=self.department,
        )

    def _create_slot(self, from_time, to_time):
        return TimeSlot.objects.create(
            user=self.assigner,
            created_by=self.assigner,
            department=self.department,
            date=date(2026, 6, 9),
            from_time=from_time,
            to_time=to_time,
        )
