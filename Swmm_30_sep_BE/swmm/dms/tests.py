from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import resolve
from openpyxl import Workbook
from rest_framework.test import APIClient

from master.models import Department

from .models import CategoryName, Certificate, EquipmentCategory, EquipmentDocument


class DMSApiFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username="dms-manager",
            password="Pass@12345",
            is_staff=True,
        )
        self.client.force_authenticate(self.user)
        self.category = CategoryName.objects.create(
            category_name="TECHNICAL",
            is_system=False,
        )
        self.department = Department.objects.create(
            name="Engineering",
            code="ENG",
        )
        self.equipment = EquipmentCategory.objects.create(
            equipment_name="RADAR",
        )
        self.certificate = Certificate.objects.create(
            name="Radar Safety Certificate",
            certificate_type="technical",
            certificate_subtype="Safety",
            certificate_id="CERT-001",
            expiry_date="2026-12-31",
            place_of_issue="Mumbai",
            remarks="Initial upload",
            category="RADAR",
            equipment="SURVEILLANCE RADAR",
            equipment_id="EQ-001",
            is_shared=False,
        )

    def test_category_excel_import_and_export(self):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.append(["category_name", "is_system"])
        worksheet.append(["LOGISTICS", False])
        content = BytesIO()
        workbook.save(content)

        response = self.client.post(
            "/api/v1/documents/categories/import-excel/",
            {
                "file": SimpleUploadedFile(
                    "document_categories.xlsx",
                    content.getvalue(),
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(CategoryName.objects.filter(category_name="LOGISTICS").exists())
        export_response = self.client.get("/api/v1/documents/categories/export-excel/")
        self.assertEqual(export_response.status_code, 200)
        self.assertIn("spreadsheetml", export_response["Content-Type"])

    def test_create_document_category(self):
        payload = {
            "category_name": "CORRESPONDENCE",
            "is_system": False,
        }

        response = self.client.post(
            "/api/v1/documents/categories/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            CategoryName.objects.filter(category_name="CORRESPONDENCE").exists()
        )

    def test_create_certificate(self):
        payload = {
            "name": "Fire Control Certificate",
            "certificate_type": "technical",
            "certificate_subtype": "Readiness",
            "certificate_id": "CERT-002",
            "expiry_date": "2026-12-31",
            "place_of_issue": "Mumbai",
            "remarks": "Uploaded after inspection",
            "category": "FIRE CONTROL",
            "equipment": "FIRE CONTROL RADAR",
            "equipment_id": "EQ-002",
            "is_shared": False,
        }

        response = self.client.post(
            "/api/v1/documents/certificates/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(Certificate.objects.filter(certificate_id="CERT-002").exists())

    def test_certificate_can_link_to_master_department(self):
        response = self.client.post(
            "/api/v1/documents/certificates/",
            {
                "name": "Engineering Certificate",
                "certificate_type": "technical",
                "linked_department": self.department.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        certificate = Certificate.objects.get(pk=response.data["id"])
        self.assertEqual(certificate.linked_department, self.department)

    def test_filter_certificates_by_type(self):
        Certificate.objects.create(
            name="Outgoing Letter",
            certificate_type="correspondence",
            certificate_subtype="Letter",
            certificate_id="LTR-001",
            expiry_date="2026-12-31",
            place_of_issue="Mumbai",
            category="LETTER",
            is_shared=False,
        )

        response = self.client.get(
            "/api/v1/documents/certificates/?certificate_type=technical"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["certificate_id"], "CERT-001")

    def test_filter_shared_certificates(self):
        Certificate.objects.create(
            name="Shared Technical Certificate",
            certificate_type="technical",
            certificate_subtype="Safety",
            certificate_id="CERT-SHARED-001",
            expiry_date="2026-12-31",
            place_of_issue="Mumbai",
            category="RADAR",
            is_shared=True,
        )

        response = self.client.get("/api/v1/documents/certificates/?is_shared=true")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["certificate_id"], "CERT-SHARED-001")

    def test_certificate_validity_uses_reference_date_format(self):
        valid_certificate = Certificate.objects.create(
            name="Valid Certificate",
            certificate_type="technical",
            certificate_id="CERT-VALID-001",
            expiry_date="2099-12-31",
        )
        invalid_certificate = Certificate.objects.create(
            name="Invalid Certificate",
            certificate_type="technical",
            certificate_id="CERT-INVALID-001",
            expiry_date=None,
        )

        self.assertTrue(valid_certificate.is_valid)
        self.assertFalse(invalid_certificate.is_valid)

    def test_create_equipment_category(self):
        payload = {
            "equipment_name": "SONAR",
        }

        response = self.client.post(
            "/api/v1/documents/equipment-categories/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            EquipmentCategory.objects.filter(equipment_name="SONAR").exists()
        )

    def test_reject_duplicate_equipment_category(self):
        payload = {
            "equipment_name": self.equipment.equipment_name,
        }

        response = self.client.post(
            "/api/v1/documents/equipment-categories/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("equipment_name", response.data)

    def test_create_equipment_document(self):
        payload = {
            "equipment": self.equipment.id,
            "document_name": "Radar Technical Manual",
            "document_type": "TD",
        }

        response = self.client.post(
            "/api/v1/documents/equipment-documents/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        document = EquipmentDocument.objects.get(id=response.data["id"])
        self.assertEqual(document.equipment_id, self.equipment.id)
        self.assertEqual(document.document_type, "TD")

    def test_filter_equipment_documents(self):
        EquipmentDocument.objects.create(
            equipment=self.equipment,
            document_name="Radar Operating Instruction",
            document_type="OI",
        )
        other_equipment = EquipmentCategory.objects.create(
            equipment_name="SONAR",
        )
        EquipmentDocument.objects.create(
            equipment=other_equipment,
            document_name="Sonar Technical Manual",
            document_type="TD",
        )

        response = self.client.get(
            f"/api/v1/documents/equipment-documents/?equipment={self.equipment.id}"
            "&document_type=OI"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["document_name"],
            "Radar Operating Instruction",
        )

    def test_dms_routes_are_available(self):
        paths = [
            "/api/v1/documents/certificates/",
            f"/api/v1/documents/certificates/{self.certificate.id}/",
            "/api/v1/documents/categories/",
            f"/api/v1/documents/categories/{self.category.id}/",
            "/api/v1/documents/equipment-categories/",
            f"/api/v1/documents/equipment-categories/{self.equipment.id}/",
            "/api/v1/documents/equipment-documents/",
        ]

        for path in paths:
            with self.subTest(path=path):
                self.assertIsNotNone(resolve(path))
