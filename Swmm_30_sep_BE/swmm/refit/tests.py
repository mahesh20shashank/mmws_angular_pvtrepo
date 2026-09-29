from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from op_maintenance.models import CompletedRoutine, InitiateDart
from ems.models import (
    AddRoutineDetails,
    EquipmentName,
    PlannedRoutineDescription,
    RoutineDescription,
    SectionName,
    UniqueRoutineName,
)
from master.models import Department


class RefitRoutineAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.department = Department.objects.create(
            name="Engineering",
            code="ENG",
        )
        self.other_department = Department.objects.create(
            name="Electrical",
            code="ELC",
        )
        self.user = get_user_model().objects.create_user(
            username="refit-user",
            password="Pass@12345",
            personnel_number="RF1001",
            department=self.department,
        )
        self.client.force_authenticate(self.user)

        self.section = SectionName.objects.create(
            name="Main Propulsion",
            department=self.department,
        )
        self.other_section = SectionName.objects.create(
            name="Power Generation",
            department=self.other_department,
        )
        self.equipment = EquipmentName.objects.create(
            name="Main Engine",
            section=self.section,
            rhsi=1250,
            state="INACTIVE",
        )
        self.other_equipment = EquipmentName.objects.create(
            name="Generator",
            section=self.other_section,
            rhsi=400,
            state="INACTIVE",
        )
        self.old_routine_name = UniqueRoutineName.objects.create(
            name="SHORT REFIT",
        )
        self.new_routine_name = UniqueRoutineName.objects.create(
            name="NORMAL REFIT",
        )
        self.routine = AddRoutineDetails.objects.create(
            equipment_name=self.equipment,
            routine_name=self.old_routine_name,
            routine_category="ALTERNATE PERIODIC",
            frequency_in_months=6,
            frequency_in_hours=500,
            frequency="6 MONTHS",
            last_routine_completion_date=timezone.now() - timedelta(days=30),
            last_routine_completion_atrunning_hrs=1000,
        )
        self.routine_description = RoutineDescription.objects.create(
            equipment_name=self.equipment,
            routine_name=self.old_routine_name,
            add_routine_details=self.routine,
            maintop_no="MT-101",
            routine_no="R-01",
            routine_description="Inspect and overhaul the main engine.",
            by_whom="DYD",
        )
        self.other_routine = AddRoutineDetails.objects.create(
            equipment_name=self.other_equipment,
            routine_name=self.old_routine_name,
            routine_category="ALTERNATE PERIODIC",
        )
        RoutineDescription.objects.create(
            equipment_name=self.other_equipment,
            routine_name=self.old_routine_name,
            add_routine_details=self.other_routine,
            routine_no="R-02",
            routine_description="Overhaul the generator.",
            by_whom="SS",
        )

    def test_refit_search_returns_only_the_users_department_routines(self):
        response = self.client.get(reverse("refit-routine-list"))

        self.equipment.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.routine.id)
        self.assertEqual(
            response.data["results"][0]["equipment_name"],
            self.equipment.name,
        )

    def test_refit_search_filters_by_equipment_and_routine_name(self):
        response = self.client.get(
            reverse("refit-routine-list"),
            {
                "equipment": "main",
                "routine_name": "short",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.routine.id)

    def test_planned_routine_is_not_returned_in_refit_search(self):
        PlannedRoutineDescription.objects.create(
            routine_description_id=self.routine_description,
        )

        response = self.client.get(reverse("refit-routine-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)

    def test_refit_detail_returns_unplanned_routine_descriptions(self):
        response = self.client.get(
            reverse(
                "refit-routine-detail",
                kwargs={"pk": self.routine.id},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.routine.id)
        self.assertEqual(len(response.data["routine_descriptions"]), 1)
        self.assertEqual(
            response.data["routine_descriptions"][0]["routine_no"],
            "R-01",
        )
        self.assertFalse(
            response.data["routine_descriptions"][0]["spare_used"],
        )

    def test_conversion_updates_matching_routine_and_descriptions(self):
        response = self.client.post(
            reverse(
                "refit-routine-convert",
                kwargs={"pk": self.routine.id},
            ),
            {
                "routine_name": self.new_routine_name.id,
                "routine_category": "ALTERNATE PERIODIC",
                "frequency": "12 MONTHS",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.routine.refresh_from_db()
        self.routine_description.refresh_from_db()
        self.assertEqual(self.routine.routine_name, self.new_routine_name)
        self.assertEqual(
            self.routine_description.routine_name,
            self.new_routine_name,
        )
        self.assertEqual(self.routine.frequency, "12 MONTHS")
        self.assertTrue(self.routine.converted)
        self.assertIsNotNone(self.routine.converted_at)

    def test_conversion_rejects_an_unknown_routine_name(self):
        response = self.client.post(
            reverse(
                "refit-routine-convert",
                kwargs={"pk": self.routine.id},
            ),
            {
                "routine_name": 999999,
                "routine_category": "ALTERNATE PERIODIC",
                "frequency": "12 MONTHS",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        error_container = str(response.data)
        self.assertTrue(
            "routine_name" in error_container or "routine_name" in response.data
        )

    def test_refit_dashboard_reports_available_and_converted_counts(self):
        self.routine.converted = True
        self.routine.converted_at = timezone.now()
        self.routine.save(update_fields=["converted", "converted_at"])

        response = self.client.get(reverse("refit-routine-dashboard"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_refit_routines"], 1)
        self.assertEqual(response.data["converted_routines"], 1)
        self.assertEqual(response.data["pending_conversion"], 0)

    def test_refit_dashboard_endpoint_returns_full_dashboard_payload(self):
        InitiateDart.objects.create(
            department_id=self.department,
            equipment_ems=self.equipment,
            maintenance_period="REFIT",
            dart_number="DART-REFIT-001",
            defective_component="Main Engine",
            defective_discriptions="Awaiting rectification",
            trial_required=True,
            sapres_required=True,
            is_closed=False,
        )
        CompletedRoutine.objects.create(
            routine=self.routine_description,
            date_of_completion=timezone.localdate(),
            hours=4,
            total_manpower=6,
        )

        response = self.client.get(reverse("refit-dashboard-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("kpis", response.data)
        self.assertIn("summary", response.data)
        self.assertIn("operational_restoration_and_readiness", response.data)
        self.assertIn("department_readiness", response.data)
        self.assertIn("contextual_search_and_drill_down", response.data)
        self.assertIn("defect_list_and_work_execution", response.data)
        self.assertIn("dependencies_and_external_coordination", response.data)
        self.assertIn("qa_trial_and_acceptance_readiness", response.data)
        self.assertIn("critical_path_risks_and_completion_forecast", response.data)
        self.assertEqual(len(response.data["kpis"]), 5)

    def test_refit_dashboard_kpis_endpoint_supports_period_query(self):
        response = self.client.get(
            reverse("refit-dashboard-kpis"),
            {"period": "1y"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["kpis"]), 5)
        self.assertEqual(response.data["kpis"][0]["trend"]["period"], "1y")

    def test_conversion_history_returns_only_converted_routines(self):
        self.routine.converted = True
        self.routine.converted_at = timezone.now()
        self.routine.save(update_fields=["converted", "converted_at"])

        response = self.client.get(
            reverse("refit-routine-conversion-history"),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], self.routine.id)

    def test_routine_name_master_is_limited_to_the_users_department(self):
        response = self.client.get(reverse("refit-routine-routine-names"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = {item["id"] for item in response.data}
        self.assertIn(self.old_routine_name.id, returned_ids)
        self.assertNotIn(self.new_routine_name.id, returned_ids)

    def test_anonymous_user_cannot_access_refit_routines(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(reverse("refit-routine-list"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
