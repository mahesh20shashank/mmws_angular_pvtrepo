from datetime import date
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import CustomUserProfile
from master.models import Department

from op_maintenance.models import CompletedRoutine

from .models import (
    AddRoutineDetails,
    EquipmentName,
    FussRaiseDetails,
    PlannedRoutineDescription,
    RoutineDescription,
    SectionName,
    UniqueRoutineName,
)


class EMSTestBase(TestCase):
    """Base test class providing authenticated client and routine fixture data."""

    def setUp(self):
        self.client = APIClient()
        self.department = Department.objects.create(name="Engineering", code="ENG")
        self.user_profile = CustomUserProfile.objects.create(
            firstname="EMS",
            lastname="User",
            access_level="1",
            department=self.department,
        )
        self.user = get_user_model().objects.create_user(
            username="ems-user",
            password="pass",
            user_profile=self.user_profile.pk,
        )
        self.user.CustomUser_profile = self.user_profile
        self.client.force_authenticate(self.user)

        self.section = SectionName.objects.create(name="Propulsion", department=self.department)
        self.equipment = EquipmentName.objects.create(
            name="GT Engine",
            equipment_code="GT-001",
            section=self.section,
        )
        self.routine_name = UniqueRoutineName.objects.create(name="Lube Oil Check")
        self.add_routine = AddRoutineDetails.objects.create(
            equipment_name=self.equipment,
            routine_name=self.routine_name,
            by_whom="SS",
            routine_category="CALENDAR BASED",
            frequency="MONTHLY",
            frequency_in_months=1,
        )
        self.routine = RoutineDescription.objects.create(
            equipment_name=self.equipment,
            routine_name=self.routine_name,
            add_routine_details=self.add_routine,
            routine_no="R-001",
            routine_description="Check lube oil level",
            by_whom="SS",
            maintop_no="MTP-001",
            department_f_key=self.department,
        )


class EMSReferenceParityTests(EMSTestBase):
    """Parity tests checking legacy reference routes and FUSS raise behavior."""

    def test_mul_raise_fuss_persists_reference_new_equipment_flag(self):
        response = self.client.post(
            reverse("ems:mulraisefuss"),
            {
                "selected_ids": [self.routine.pk],
                "ship": "INS TEST",
                "department": "ENG",
                "serial_no": "FUSS-001",
                "equipment": "GT Engine",
                "maintop_no": "MTP-001",
                "frequency": "MONTHLY",
                "new_equipment": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        fuss = FussRaiseDetails.objects.get()
        self.assertTrue(fuss.new_equipment)
        self.routine.refresh_from_db()
        self.assertTrue(self.routine.is_fuss)

    def test_reference_ems_alias_routes_are_available(self):
        alias_names = [
            "complete_routine",
            "search_detail_planned",
            "search_detail_planned_pk",
            "save_oem_spare",
            "history_close_routine_legacy",
            "routine_init_data",
            "save_routine_init",
            "generatedl1",
            "generatedl1_list",
            "report_inner_rows",
        ]

        for name in alias_names:
            kwargs = {"pk": self.routine.pk} if name.endswith("_pk") else {}
            if name in {"complete_routine"}:
                kwargs = {"pk": self.routine.pk}
            if name == "report_inner_rows":
                kwargs = {"id": 1}
            with self.subTest(name=name):
                self.assertTrue(reverse(f"ems:{name}", kwargs=kwargs))


class RoutineMasterAPITests(EMSTestBase):
    """Unit tests for Routine master data, sections, equipments, and routine definitions."""

    def test_get_routine_names_list(self):
        response = self.client.get(reverse("ems:get_routine_names"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Verify routine names / categories returned
        names = response.data.get("routine_names", [])
        self.assertTrue(len(names) > 0)
        self.assertIn("MONTHLY ROUTINES", names)

    def test_get_routine_name_single(self):
        response = self.client.get(reverse("ems:routine_name"), {"id": self.routine_name.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_get_routine_by_equipment(self):
        url = reverse(
            "ems:getroutinename_pk",
            kwargs={
                "equipment_name_id": self.equipment.id,
                "routine_category": "CALENDAR BASED",
            },
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_get_section_names(self):
        response = self.client.get(reverse("ems:getsectionname"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_get_equipment_names(self):
        response = self.client.get(reverse("ems:getequipmentname"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_get_equipment_by_section(self):
        response = self.client.get(
            reverse("ems:get_equipment_by_section"),
            {"section_id": self.section.id},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_add_routine_description_success(self):
        response = self.client.post(
            reverse("ems:addroutinedescription"),
            {
                "equipment_name": self.equipment.id,
                "routine_name": self.routine_name.id,
                "maintop_no": "MTP-002",
                "routine_no": "R-002",
                "routine_description": "Clean and inspect lube oil filter",
                "by_whom": "SS",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            RoutineDescription.objects.filter(routine_no="R-002", routine_description="Clean and inspect lube oil filter").exists()
        )

    def test_add_routine_description_duplicate_rejected(self):
        # Attempting to add the exact same description again should return 400
        response = self.client.post(
            reverse("ems:addroutinedescription"),
            {
                "equipment_name": self.equipment.id,
                "routine_name": self.routine_name.id,
                "maintop_no": "MTP-001",
                "routine_no": "R-001",
                "routine_description": "Check lube oil level",
                "by_whom": "SS",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class RoutinePlanningAPITests(EMSTestBase):
    """Unit tests for Routine Planning, Scheduling, and Planned Routine Management."""

    def test_plan_routine_form_get(self):
        url = reverse("ems:Planroutine", kwargs={"pk": self.routine.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("routine", response.data)
        self.assertEqual(response.data["routine"]["id"], self.routine.pk)

    def test_plan_routine_save(self):
        url = reverse("ems:plan_routine_save", kwargs={"pk": self.routine.pk})
        response = self.client.post(
            url,
            {
                "planned_commencement_date": date.today().strftime("%Y-%m-%d"),
                "spares_required": "NO",
                "spares": [],
            },
            format="json",
        )
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertTrue(
            PlannedRoutineDescription.objects.filter(routine_description_id=self.routine).exists()
        )

    def test_planned_routines_master_list(self):
        response = self.client.get(reverse("ems:planned_routines_master"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_delete_planned_routine(self):
        # First plan a routine
        PlannedRoutineDescription.objects.create(
            routine_description_id=self.routine,
            planned_commencement_date=date.today(),
            spares_required=False,
            is_deleted=False,
        )
        url = reverse("ems:DeletePlanned_routine", kwargs={"pk": self.routine.pk})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(
            PlannedRoutineDescription.objects.filter(routine_description_id=self.routine).exists()
        )


class RoutineExecutionAPITests(EMSTestBase):
    """Unit tests for Routine Initiation and Completion/Closure workflows."""

    def test_initiate_close_routine_details_get(self):
        url = reverse("ems:initiate_close_routine", kwargs={"pk": self.routine.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_complete_routine_post(self):
        url = reverse("ems:complete_routine", kwargs={"pk": self.routine.pk})
        payload = {
            "date_of_completion": date.today().strftime("%Y-%m-%d"),
            "carried_by": "SS",
            "total_manpower": 2,
            "remarks": "Lube oil inspected and verified OK",
            "completion_details": "Completed smoothly",
            "hours": 1,
            "minutes": 30,
            "old_dart_number": "DART-001",
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Verify old routine marked closed
        self.routine.refresh_from_db()
        self.assertTrue(self.routine.is_close)

        # Verify CompletedRoutine record created
        completed = CompletedRoutine.objects.filter(routine=self.routine).first()
        self.assertIsNotNone(completed)
        self.assertEqual(completed.carried_by, "SS")

        # Verify next due routine description was automatically generated
        next_routine = RoutineDescription.objects.filter(previous_routine=self.routine).first()
        self.assertIsNotNone(next_routine)
        self.assertFalse(next_routine.is_close)


class RoutineSearchAndHistoryAPITests(EMSTestBase):
    """Unit tests for Routine Search, FUSS listings, and Slip History."""

    def test_search_merged_routines(self):
        response = self.client.get(reverse("ems:search"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_fuss_raised_details(self):
        response = self.client.get(reverse("ems:fuss_raised_details"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_fuss_raised_routines(self):
        response = self.client.get(reverse("ems:fuss_raised_routines"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_slip_history(self):
        response = self.client.get(reverse("ems:history"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class RoutineValidationAndSecurityTests(EMSTestBase):
    """Unit tests for authentication barriers and invalid inputs."""

    def test_unauthenticated_request_rejected(self):
        self.client.logout()
        # Unauthenticated request to complete_routine should be blocked
        url = reverse("ems:complete_routine", kwargs={"pk": self.routine.pk})
        response = self.client.get(url)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_plan_routine_nonexistent_pk_returns_404(self):
        url = reverse("ems:Planroutine", kwargs={"pk": 999999})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
