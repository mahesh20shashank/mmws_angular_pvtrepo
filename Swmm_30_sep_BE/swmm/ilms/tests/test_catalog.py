"""Catalog viewset tests (`ItemViewSet`/`VendorViewSet`/`MoMappingTableViewSet`):
`CatalogApiTests`.

Split out of the former flat `ilms/tests.py` (the ilms file-structure split, mirroring
the `wlms`/`obs` `tests/` package splits — `test_wlms_routes_are_available` lives in
`wlms/tests/test_equipment.py`, its catalog-equivalent file, so this file's
`test_ilms_routes_are_available` follows the same precedent).
"""

from django.test import TestCase
from django.urls import resolve

from ..models import DemandDetails, MoMappingTable, PTSDetails, SurveyDetails, Vendor
from ._shared import ILMSApiFixtureMixin


class CatalogApiTests(ILMSApiFixtureMixin, TestCase):
    def test_create_ilms_item(self):
        from ..models import Item

        payload = {
            "item_code": "ILMS-1002",
            "item_desc": "SEA WATER PUMP KIT",
            "item_deno": "NOS",
            "crp_category": "C",
            "inventory_holder": "ENGINEERING",
            "obsolescence": "ACTIVE",
            "obsolete": "NO",
            "oem_name": "MARINE PUMPS LTD",
            "oem_vendor_code": "VEN-002",
            "incat_yn": True,
        }

        response = self.client.post("/api/v1/ilms/items/", payload, format="json")

        self.assertEqual(response.status_code, 201)
        item = Item.objects.get(item_code="ILMS-1002")
        self.assertEqual(item.inventory_holder, "ENGINEERING")
        self.assertEqual(item.oem_name, "MARINE PUMPS LTD")
        self.assertEqual(item.oem_vendor_code, "VEN-002")
        self.assertFalse(hasattr(item, "abc_category"))

    def test_search_item_by_description(self):
        from ..models import Item

        Item.objects.create(
            item_code="ILMS-2001",
            item_desc="RADAR POWER SUPPLY",
            item_deno="NOS",
            crp_category="C",
            inventory_holder="ELECTRICAL",
            incat_yn=True,
        )

        response = self.client.get("/api/v1/ilms/items/?q=hydraulic")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["item_code"], "ILMS-1001")

    def test_search_vendor_by_name(self):
        Vendor.objects.create(
            vendor_code="VEN-002",
            name="GENERAL HARDWARE STORE",
            vendor_class="LOCAL",
            country_code="IN",
        )

        response = self.client.get("/api/v1/ilms/vendors/?q=naval")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["vendor_code"], "VEN-001")

    def test_create_mo_mapping(self):
        payload = {
            "ilms_spare_id": self.item.item_code,
            "vendor_id": self.vendor.vendor_code,
            "equipment": self.ship_equipment.pk,
        }

        response = self.client.post(
            "/api/v1/ilms/mo-mappings/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        mapping = MoMappingTable.objects.get(id=response.data["id"])
        self.assertEqual(mapping.ilms_spare_id_id, self.item.item_code)
        self.assertEqual(mapping.vendor_id_id, self.vendor.vendor_code)
        self.assertEqual(mapping.equipment, self.ship_equipment)

    def test_ilms_routes_are_available(self):
        paths = [
            "/api/v1/ilms/items/",
            "/api/v1/ilms/vendors/",
            "/api/v1/ilms/mo-mappings/",
            "/api/v1/ilms/surveys/",
            "/api/v1/ilms/pts/",
            "/api/v1/ilms/demands/",
            "/api/v1/ilms/dart-mo-spares/",
            "/api/v1/ilms/iif/",
        ]

        for path in paths:
            with self.subTest(path=path):
                self.assertIsNotNone(resolve(path))

    def test_item_excel_import_and_export(self):
        from io import BytesIO

        from django.core.files.uploadedfile import SimpleUploadedFile
        from openpyxl import Workbook

        from ..models import Item

        workbook = Workbook()
        worksheet = workbook.active
        worksheet.append(
            [
                "item_code",
                "item_desc",
                "item_deno",
                "crp_category",
                "inventory_holder",
                "oem_name",
                "oem_vendor_code",
                "incat_yn",
            ]
        )
        worksheet.append(
            [
                "ILMS-XLSX-01",
                "Excel imported hydraulic seal",
                "NOS",
                "C",
                "ENGINEERING",
                "ACME HYDRAULICS",
                "VEN-001",
                True,
            ]
        )
        content = BytesIO()
        workbook.save(content)

        response = self.client.post(
            "/api/v1/ilms/items/import-excel/",
            {
                "file": SimpleUploadedFile(
                    "items.xlsx",
                    content.getvalue(),
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(Item.objects.filter(item_code="ILMS-XLSX-01").exists())
        export_response = self.client.get("/api/v1/ilms/items/export-excel/")
        self.assertEqual(export_response.status_code, 200)
        self.assertIn("spreadsheetml", export_response["Content-Type"])

    def test_dashboard_reports_mo_inventory_workflow_counts(self):
        SurveyDetails.objects.create(
            ilms_spare_id=self.item,
            in_progress_status="Pending",
        )
        PTSDetails.objects.create(
            ilms_spare_id=self.item,
            in_progress_status="PTS",
            is_hod=True,
        )
        DemandDetails.objects.create(
            ilms_spare_id=self.item,
            demand_number="MO-DEM-DASH-1",
            in_progress_status="Demand",
            is_hod=True,
            is_hod_approval=True,
        )

        response = self.client.get("/api/v1/ilms/items/dashboard/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["items"], 1)
        self.assertEqual(response.data["vendors"], 1)
        self.assertEqual(response.data["pending_surveys"], 1)
        self.assertEqual(response.data["hod_inbox"], 2)
        self.assertEqual(response.data["approved_actions"], 1)

    def test_item_context_returns_mapping_and_workflow_history(self):
        MoMappingTable.objects.create(
            ilms_spare_id=self.item,
            vendor_id=self.vendor,
            equipment=self.ship_equipment,
        )
        DemandDetails.objects.create(
            ilms_spare_id=self.item,
            vendor_id=self.vendor,
            demand_number="MO-HISTORY-1",
        )

        response = self.client.get(f"/api/v1/ilms/items/{self.item.pk}/context/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["item"]["item_code"], "ILMS-1001")
        self.assertEqual(len(response.data["mappings"]), 1)
        self.assertEqual(len(response.data["demands"]), 1)

    def test_ilms_search_helper_aliases_return_expected_data(self):
        item_response = self.client.get(
            "/api/v1/ilms/items/search-list/",
            {"q": "hydraulic"},
        )
        vendor_response = self.client.get(
            "/api/v1/ilms/vendors/search-list/",
            {"q": "naval"},
        )

        self.assertEqual(item_response.status_code, 200)
        self.assertEqual(vendor_response.status_code, 200)
        self.assertEqual(item_response.data[0]["item_code"], self.item.item_code)
        self.assertEqual(
            vendor_response.data[0]["vendor_code"], self.vendor.vendor_code
        )
