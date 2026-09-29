from datetime import date, time, timedelta

from accounts.models import User, UserMessage
from django.urls import reverse
from master.models import Department, Ship, UnitType
from rest_framework import status
from rest_framework.test import APITestCase

from .constants import get_lane_for_department
from .models import Event, PlannerActivity
from .serializers import PlannerActivityContractSerializer

PASS_WORD = "test123"


class EventViewSetTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            password=PASS_WORD,
            first_name="Vatsal",
        )

        self.unit_type = UnitType.objects.create(name="Surface Combatant")
        self.department = Department.objects.create(
            name="Engineering",
            code="ENG",
            dep_code="ENG",
            description="Engineering Department",
            sfd_applicable=1,
        )
        self.user.department = self.department
        self.user.save(update_fields=["department"])

        self.ship = Ship.objects.create(
            ship_external_id=1001,
            name="INS Vikrant",
            unit_type=self.unit_type,
        )

        self.event = Event.objects.create(
            user=self.user,
            title="Routine Maintenance",
            start_date=date.today(),
            start_time=time(10, 0),
            end_time=time(12, 0),
            category="routine",
            description="Routine maintenance activity",
            ship=self.ship,
        )

    # =====================================================
    # LIST EVENTS
    # =====================================================

    def test_get_event_list(self):
        self.client.force_authenticate(user=self.user)

        url = reverse("events-list")

        response = self.client.get(url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(len(response.data), 1)

    # =====================================================
    # RETRIEVE EVENT
    # =====================================================

    def test_get_event_detail(self):
        self.client.force_authenticate(user=self.user)

        url = reverse(
            "events-detail",
            kwargs={"pk": self.event.id},
        )

        response = self.client.get(url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            response.data["title"],
            "Routine Maintenance",
        )

    # =====================================================
    # CREATE EVENT
    # =====================================================

    def test_create_event(self):
        self.client.force_authenticate(user=self.user)

        url = reverse("events-list")

        payload = {
            "title": "Dock Trial",
            "start_date": "2026-06-06",
            "start_time": "09:00:00",
            "end_time": "11:00:00",
            "category": "trial",
            "description": "Dock trial event",
        }

        response = self.client.post(
            url,
            payload,
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

        self.assertEqual(
            Event.objects.count(),
            2,
        )

    # =====================================================
    # UPDATE EVENT
    # =====================================================

    def test_update_event(self):
        self.client.force_authenticate(user=self.user)

        url = reverse(
            "events-detail",
            kwargs={"pk": self.event.id},
        )

        payload = {
            "title": "Updated Event",
            "start_date": str(self.event.start_date),
            "start_time": "10:00:00",
            "end_time": "12:00:00",
            "category": "routine",
        }

        response = self.client.put(
            url,
            payload,
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.event.refresh_from_db()

        self.assertEqual(
            self.event.title,
            "Updated Event",
        )

    # =====================================================
    # DELETE EVENT
    # =====================================================

    def test_delete_event(self):
        self.client.force_authenticate(user=self.user)

        url = reverse(
            "events-detail",
            kwargs={"pk": self.event.id},
        )

        response = self.client.delete(url)

        self.assertEqual(
            response.status_code,
            status.HTTP_204_NO_CONTENT,
        )

        self.assertFalse(Event.objects.filter(id=self.event.id).exists())


class PlannerActivityViewSetTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="planneruser",
            password=PASS_WORD,
            first_name="Plan",
            last_name="Ner",
        )
        self.unit_type = UnitType.objects.create(name="Surface Combatant")
        self.department = Department.objects.create(
            name="Engineering",
            code="ENG",
            dep_code="ENG",
            description="Engineering Department",
            sfd_applicable=1,
        )
        self.user.department = self.department
        self.user.save(update_fields=["department"])
        self.ship = Ship.objects.create(
            ship_external_id=2001,
            name="INS Shakti",
            unit_type=self.unit_type,
        )
        self.activity = PlannerActivity.objects.create(
            title="Main Air Compressor Maintenance",
            subtitle="AMP-ENG",
            description="Routine maintenance activity",
            date=date.today(),
            start_time=time(10, 0),
            end_time=time(12, 0),
            department=self.department,
            ship=self.ship,
            category="routine",
            status="scheduled",
            priority="medium",
            progress=25,
            active=False,
            delayed=False,
            conflict=False,
            selected=True,
            isolation=True,
            equipment="Main Air Compressor",
            reference="WO-ENG-2025-0456",
            location="ER Main Air Compartment",
        )
        self.event = Event.objects.create(
            user=self.user,
            title="Routine Maintenance",
            date=date.today(),
            start_time=time(10, 0),
            end_time=time(12, 0),
            category="focus",
            description="Routine maintenance activity",
            ship=self.ship,
        )
        self.inbox_message = UserMessage.objects.create(
            sender=self.user,
            recipient=self.user,
            msg_title="Planner Sync",
            msg_short_title="Planner sync",
            msg_body="Review the latest planner updates before noon.",
            status="unread",
        )

    def test_list_requires_authentication(self):
        response = self.client.get(reverse("planner-activities-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_returns_planner_activity(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(reverse("planner-activities-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["title"], self.activity.title)

    def test_create_derives_lane_from_department(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            reverse("planner-activities-list"),
            {
                "title": "Generator Inspection",
                "date": "2026-06-20",
                "start_time": "09:00:00",
                "end_time": "11:00:00",
                "department_id": self.department.id,
                "ship_id": self.ship.id,
                "category": "maint",
                "status": "scheduled",
                "progress": 0,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = PlannerActivity.objects.latest("id")
        self.assertEqual(created.created_by, self.user)

    def test_create_rejects_invalid_time_window(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            reverse("planner-activities-list"),
            {
                "title": "Bad Window",
                "date": "2026-06-20",
                "start_time": "12:00:00",
                "end_time": "10:00:00",
                "department_id": self.department.id,
                "ship_id": self.ship.id,
                "category": "maint",
                "status": "scheduled",
                "progress": 0,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("End time must be after start time", str(response.data))

    def test_summary_endpoint(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(reverse("planner-activities-summary"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("category_cards", response.data)
        self.assertIn("conflict_count", response.data)

    def test_choices_endpoint(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(reverse("planner-activities-choices"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(any(item["value"] == "eng" for item in response.data["lanes"]))

    def test_dashboard_endpoint(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(reverse("planner-activities-dashboard"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("summary", response.data)
        self.assertIn("notifications", response.data)
        self.assertIn("inbox", response.data)
        self.assertIn("conflicts", response.data)
        self.assertGreaterEqual(response.data["unread_count"], 1)
        self.assertGreaterEqual(len(response.data["notifications"]), 1)
        self.assertGreaterEqual(len(response.data["inbox"]), 1)

    def test_active_flag_is_computed_from_current_window(self):
        activity = PlannerActivity.objects.create(
            title="All Day Patrol",
            date=date.today(),
            start_time=time(0, 0),
            end_time=time(23, 59),
            department=self.department,
            ship=self.ship,
            category="routine",
            status="scheduled",
            progress=0,
        )

        activity.refresh_from_db()

        self.assertTrue(activity.active)
        self.assertFalse(activity.delayed)

    def test_delayed_flag_is_computed_when_window_has_passed(self):
        activity = PlannerActivity.objects.create(
            title="Yesterday Routine",
            date=date.today() - timedelta(days=1),
            start_time=time(10, 0),
            end_time=time(12, 0),
            department=self.department,
            ship=self.ship,
            category="routine",
            status="scheduled",
            progress=0,
        )

        activity.refresh_from_db()

        self.assertFalse(activity.active)
        self.assertTrue(activity.delayed)

    def test_conflict_flag_is_computed_for_overlapping_same_lane_activities(self):
        overlapping = PlannerActivity.objects.create(
            title="Generator Check",
            date=self.activity.date,
            start_time=time(11, 0),
            end_time=time(13, 0),
            department=self.department,
            ship=self.ship,
            category="routine",
            status="scheduled",
            progress=0,
        )

        self.activity.refresh_from_db()
        overlapping.refresh_from_db()

        self.assertTrue(self.activity.conflict)
        self.assertTrue(overlapping.conflict)

    def test_conflict_clears_after_deleting_overlapping_activity(self):
        overlapping = PlannerActivity.objects.create(
            title="Generator Check",
            date=self.activity.date,
            start_time=time(11, 0),
            end_time=time(13, 0),
            department=self.department,
            ship=self.ship,
            category="routine",
            status="scheduled",
            progress=0,
        )

        self.client.force_authenticate(user=self.user)
        response = self.client.delete(
            reverse("planner-activities-detail", kwargs={"pk": overlapping.id})
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        self.activity.refresh_from_db()
        self.assertFalse(self.activity.conflict)

    # =====================================================
    # SHIP EVENTS ACTION
    # =====================================================

    def test_ship_events(self):
        url = f"{reverse('events-ship-events')}?ship_id={self.ship.id}"

        response = self.client.get(url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            len(response.data),
            1,
        )

        self.assertEqual(
            response.data[0]["title"],
            "Routine Maintenance",
        )

    def test_ship_events_no_data(self):
        url = f"{reverse('events-ship-events')}?ship_id=99999"

        response = self.client.get(url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            len(response.data),
            0,
        )

    # =====================================================
    # AUTHENTICATION
    # =====================================================

    def test_event_list_requires_authentication(self):
        url = reverse("events-list")

        response = self.client.get(url)

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )


class PlannerContractTestCase(APITestCase):
    def test_department_to_lane_mapping(self):
        self.assertEqual(get_lane_for_department("Engineering"), "eng")
        self.assertEqual(get_lane_for_department("FMU / Support"), "fmu")
        self.assertEqual(get_lane_for_department("Unknown"), "eng")

    def test_planner_activity_contract_serializer_accepts_canonical_payload(self):
        serializer = PlannerActivityContractSerializer(
            data={
                "id": "a1001",
                "title": "Main Air Compressor Maintenance",
                "subtitle": "AMP-ENG",
                "description": "Routine maintenance activity",
                "date": "2026-06-19",
                "start_time": "10:00:00",
                "end_time": "12:00:00",
                "time_label": "1000 hrs - 1200 hrs",
                "lane": "eng",
                "lane_label": "Engineering",
                "department": "Engineering",
                "category": "maint",
                "category_label": "Maintenance",
                "status": "scheduled",
                "status_label": "Scheduled",
                "priority": "medium",
                "priority_label": "Medium",
                "progress": 25,
                "active": False,
                "delayed": False,
                "conflict": False,
                "selected": True,
                "isolation": True,
                "equipment": "Main Air Compressor",
                "reference": "WO-ENG-2025-0456",
                "location": "ER Main Air Compartment",
                "ship": "INS Vikrant",
                "created_by": "Vatsal",
                "created_at": "2026-06-19T09:00:00Z",
                "updated_at": "2026-06-19T09:30:00Z",
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["lane"], "eng")
        self.assertEqual(serializer.validated_data["status"], "scheduled")
        self.assertEqual(serializer.validated_data["priority"], "medium")
