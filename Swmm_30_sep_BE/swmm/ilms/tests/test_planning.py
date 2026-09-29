"""MO planning/DART-cart viewset tests (`MOPlannedSparesDescriptionViewSet`,
`PlannedMOSpareListViewSet`, `DartMOSpareViewSet`): `PlanningApiTests`.

Split out of the former flat `ilms/tests.py` (the ilms file-structure split).
"""

from django.test import TestCase

from ..models import DartMOSpare, MOPlannedSparesDescription, PlannedMOSpareList
from ._shared import ILMSApiFixtureMixin


class PlanningApiTests(ILMSApiFixtureMixin, TestCase):
    def test_create_planned_spares_description_for_ems_routine(self):
        response = self.client.post(
            "/api/v1/ilms/planned-descriptions/",
            {
                "item_id": self.item.item_code,
                "routine_description_id": self.routine_description.pk,
                "is_deleted": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        planned_description = MOPlannedSparesDescription.objects.get(
            id=response.data["id"]
        )
        self.assertEqual(
            planned_description.routine_description_id,
            self.routine_description,
        )

    def test_reject_invalid_dart_mo_ids(self):
        payload = {
            "equipment_id": 1000000,
            "dart_id": 1000000,
            "mo_spare": self.item.item_code,
            "pattern": "MO-PN-001",
            "description": "MO DART linked spare",
            "quantity": 1,
            "is_delete": False,
        }

        response = self.client.post(
            "/api/v1/ilms/dart-mo-spares/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("equipment_id", response.data)
        self.assertIn("dart_id", response.data)

    def test_create_dart_mo_spare_with_existing_relations(self):
        response = self.client.post(
            "/api/v1/ilms/dart-mo-spares/",
            {
                "equipment_id": self.ship_equipment.pk,
                "dart_id": self.dart.pk,
                "mo_spare": self.item.item_code,
                "pattern": "MO-PN-002",
                "description": "MO spare linked with ship equipment and DART",
                "quantity": 1,
                "is_delete": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        dart_spare = DartMOSpare.objects.get(pk=response.data["id"])
        self.assertEqual(dart_spare.equipment_id, self.ship_equipment)
        self.assertEqual(dart_spare.dart_id, self.dart)

    def test_routine_lookup_returns_planned_mo_spares(self):
        planned_description = MOPlannedSparesDescription.objects.create(
            item_id=self.item,
            routine_description_id=self.routine_description,
        )
        PlannedMOSpareList.objects.create(
            pattern_number=self.item.item_code,
            planned_spares_description=planned_description,
            quantity_required=4,
        )

        response = self.client.get(
            "/api/v1/ilms/planned-spares/by-routine/",
            {"routine_description": self.routine_description.pk},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["pattern_number"], "ILMS-1001")
        self.assertEqual(response.data[0]["quantity_required"], 4)
