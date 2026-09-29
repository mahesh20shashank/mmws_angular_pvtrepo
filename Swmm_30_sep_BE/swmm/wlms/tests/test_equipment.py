"""Equipment/spare catalogue tests: `EquipmentApiTests`.

Split out of the former flat `wlms/tests.py` (the wlms file-structure split, mirroring
the earlier `obs/tests/` package split).
"""

from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import resolve
from openpyxl import Workbook

from ..models import (
    PlannedSparesDescription,
    PlannedWEDSpareList,
    SpareDataMap,
    SurveyReceiptsDetails,
    WLMSEquipment,
    WLMSSpare,
    DemandDetails,
)
from ._shared import WLMSApiFixtureMixin


class EquipmentApiTests(WLMSApiFixtureMixin, TestCase):
    def test_create_wed_equipment(self):
        payload = {
            "eqpt_id": 502,
            "eqpt_name": "FIRE CONTROL RADAR",
            "remarks": "Weapon support equipment",
            # "is_active": True,
            "active": True,
            "control_cell_id": 12,
            "sco_id": 22,
            "depot_id": 32,
        }

        response = self.client.post(
            "/api/v1/wlms/equipment/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(WLMSEquipment.objects.filter(eqpt_id=502).exists())

    def test_create_wed_spare(self):
        payload = {
            "wlms_inventory": "WED-INV-002",
            "item_code": "WLMS-1002",
            "item_desc": "RADAR COOLING FAN",
            "category": "CONSUMABLE",
            "eqpt": self.equipment.id,
            "denom_id": "NOS",
            "sh_name": "WED",
            "latest_qty": 8,
            # "is_active": True,
            "active": True,
            "typeofspare": "WEAPON SUPPORT",
        }

        response = self.client.post("/api/v1/wlms/spares/", payload, format="json")

        self.assertEqual(response.status_code, 201)
        spare = WLMSSpare.objects.get(item_code="WLMS-1002")
        self.assertEqual(spare.eqpt_id, self.equipment.id)
        self.assertEqual(spare.denom_id, "NOS")
        self.assertEqual(spare.latest_qty, 8)

    def test_filter_spares_by_equipment(self):
        other_equipment = WLMSEquipment.objects.create(
            eqpt_id=601,
            eqpt_name="TORPEDO TUBE",
            # is_active=True,
            active=True,
        )
        WLMSSpare.objects.create(
            item_code="WLMS-2001",
            item_desc="TORPEDO TUBE SEAL",
            eqpt=other_equipment,
            latest_qty=2,
        )

        response = self.client.get(
            f"/api/v1/wlms/spares/?equipment_id={self.equipment.id}"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["item_code"], "WLMS-1001")

    def test_create_spare_data_mapping(self):
        payload = {
            "equipment": self.ship_equipment.pk,
            "wed_equipment": self.equipment.id,
        }

        response = self.client.post(
            "/api/v1/wlms/spare-data-maps/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        mapping = SpareDataMap.objects.get(id=response.data["id"])
        self.assertEqual(mapping.equipment, self.ship_equipment)
        self.assertEqual(mapping.wed_equipment_id, self.equipment.id)

    def test_create_planned_wed_spare(self):
        description_payload = {
            "wlms_spare_id": self.spare.id,
            "routine_description_id": self.routine_description.pk,
            "spares_required": True,
            "is_deleted": False,
        }

        description_response = self.client.post(
            "/api/v1/wlms/planned-descriptions/",
            description_payload,
            format="json",
        )
        self.assertEqual(description_response.status_code, 201)

        list_payload = {
            "pattern_number": "WED-PN-1001",
            "planned_spares_description": description_response.data["id"],
            "quantity_required": 2,
            "is_deleted": False,
        }

        list_response = self.client.post(
            "/api/v1/wlms/planned-spares/",
            list_payload,
            format="json",
        )

        self.assertEqual(list_response.status_code, 201)
        planned_list = PlannedWEDSpareList.objects.get(id=list_response.data["id"])
        self.assertEqual(
            planned_list.planned_spares_description_id,
            description_response.data["id"],
        )
        self.assertEqual(planned_list.pattern_number, "WED-PN-1001")

    def test_reject_invalid_dart_wed_ids(self):
        payload = {
            "equipment_id": 1000000,
            "wed_spare": self.spare.id,
            "dart_id": 1000000,
            "pattern": "DART-WED-001",
            "description": "DART linked WED spare",
            "quantity": 1,
            "is_delete": False,
        }

        response = self.client.post(
            "/api/v1/wlms/dart-wed-spares/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("equipment_id", response.data)
        self.assertIn("dart_id", response.data)

    def test_wlms_routes_are_available(self):
        paths = [
            "/api/v1/wlms/equipment/",
            "/api/v1/wlms/spares/",
            "/api/v1/wlms/spare-data-maps/",
            "/api/v1/wlms/planned-descriptions/",
            "/api/v1/wlms/planned-spares/",
            "/api/v1/wlms/dart-wed-spares/",
            "/api/v1/wlms/survey-receipts/",
            "/api/v1/wlms/survey-forms/",
            "/api/v1/wlms/survey-items/",
            "/api/v1/wlms/pts-demands/",
            "/api/v1/wlms/demands/",
            "/api/v1/wlms/receive-demands/",
            "/api/v1/wlms/wediif/",
        ]

        for path in paths:
            with self.subTest(path=path):
                self.assertIsNotNone(resolve(path))

    def test_equipment_excel_import_and_export(self):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.append(["eqpt_id", "eqpt_name", "remarks", "is_active"])
        worksheet.append([777, "TORPEDO LAUNCHER", "Imported from Excel", True])
        content = BytesIO()
        workbook.save(content)

        response = self.client.post(
            "/api/v1/wlms/equipment/import-excel/",
            {
                "file": SimpleUploadedFile(
                    "wlms_equipment.xlsx",
                    content.getvalue(),
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(WLMSEquipment.objects.filter(eqpt_id=777).exists())
        export_response = self.client.get("/api/v1/wlms/equipment/export-excel/")
        self.assertEqual(export_response.status_code, 200)
        self.assertIn("spreadsheetml", export_response["Content-Type"])

    def test_dashboard_and_search_show_active_wed_inventory(self):
        WLMSSpare.objects.create(
            item_code="WLMS-INACTIVE",
            item_desc="Inactive radar module",
            latest_qty=0,
            # is_active=False,
            active=False,
        )

        search_response = self.client.get(
            "/api/v1/wlms/spares/",
            {"q": "launcher", "active": "true"},
        )
        dashboard_response = self.client.get("/api/v1/wlms/spares/dashboard/")

        self.assertEqual(search_response.status_code, 200)
        self.assertEqual(len(search_response.data), 1)
        self.assertEqual(search_response.data[0]["item_code"], "WLMS-1001")
        self.assertEqual(dashboard_response.status_code, 200)
        self.assertEqual(dashboard_response.data["active_spares"], 1)
        self.assertEqual(dashboard_response.data["available_quantity"], 3)

    def test_item_context_returns_mapping_and_workflow_history(self):
        SpareDataMap.objects.create(
            equipment=self.ship_equipment,
            wed_equipment=self.equipment,
        )
        DemandDetails.objects.create(
            user_id=self.user_profile,
            wed_spares_id=self.spare,
            demand_no="SWMM/DEMAND/2026/002",
        )
        SurveyReceiptsDetails.objects.create(
            user_id=self.user_profile,
            wed_spares_id=self.spare,
            spare_cart_name="Survey",
        )

        response = self.client.get(f"/api/v1/wlms/spares/{self.spare.pk}/context/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["spare"]["item_code"], "WLMS-1001")
        self.assertEqual(len(response.data["equipment_mappings"]), 1)
        self.assertEqual(len(response.data["demands"]), 1)
        self.assertEqual(len(response.data["surveys"]), 1)

    def test_routine_lookup_returns_planned_wed_spares(self):
        description = PlannedSparesDescription.objects.create(
            wlms_spare_id=self.spare,
            routine_description_id=self.routine_description,
            spares_required=True,
        )
        PlannedWEDSpareList.objects.create(
            pattern_number=self.spare.item_code,
            planned_spares_description=description,
            quantity_required=3,
        )

        response = self.client.get(
            "/api/v1/wlms/planned-spares/by-routine/",
            {"routine_description": self.routine_description.pk},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["pattern_number"], "WLMS-1001")
        self.assertEqual(response.data[0]["quantity_required"], 3)

    def test_routine_context_reports_equipment_mapping(self):
        mapping = SpareDataMap.objects.create(
            equipment=self.ship_equipment,
            wed_equipment=self.equipment,
        )
        description = PlannedSparesDescription.objects.create(
            wlms_spare_id=self.spare,
            routine_description_id=self.routine_description,
            spares_required=True,
        )

        response = self.client.get(
            f"/api/v1/wlms/spares/{self.spare.pk}/routine-context/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["mapped"])
        self.assertEqual(
            response.data["ship_equipment_id"],
            mapping.equipment_id,
        )
        self.assertEqual(
            response.data["routine_description_id"],
            description.routine_description_id_id,
        )

    def test_wed_mapping_can_store_specific_spare_link(self):
        response = self.client.post(
            "/api/v1/wlms/spare-data-maps/",
            {
                "equipment": self.ship_equipment.pk,
                "wed_equipment": self.equipment.pk,
                "wed_spares": self.spare.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        mapping = SpareDataMap.objects.get(pk=response.data["id"])
        self.assertEqual(mapping.wed_spares, self.spare)

    def test_wlms_search_helper_aliases_return_expected_data(self):
        equipment_response = self.client.get(
            "/api/v1/wlms/spares/equipment-list/",
            {"active": "true"},
        )
        spares_response = self.client.get(
            "/api/v1/wlms/spares/by-equipment/",
            {"equipment_id": self.equipment.pk},
        )
        SpareDataMap.objects.create(
            equipment=self.ship_equipment,
            wed_equipment=self.equipment,
            wed_spares=self.spare,
        )
        mapping_response = self.client.get(
            "/api/v1/wlms/spare-data-maps/sfd-equipment-for-wed/",
            {"wed_equipment": self.equipment.pk},
        )

        self.assertEqual(equipment_response.status_code, 200)
        self.assertEqual(spares_response.status_code, 200)
        self.assertEqual(mapping_response.status_code, 200)
        self.assertEqual(equipment_response.data[0]["id"], self.equipment.pk)
        self.assertEqual(spares_response.data[0]["id"], self.spare.pk)
        self.assertEqual(mapping_response.data[0]["wed_spares"], self.spare.pk)
