from datetime import date
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.urls import reverse
from master.models import Department, SubDepartment
from openpyxl import Workbook
from rest_framework import status
from rest_framework.test import APITestCase

from .models import DLClose, DLTracker


class DLMonitoringTests(APITestCase):
    def setUp(self):
        self.department = Department.objects.create(
            name="Engineering", code="ENGINEERING"
        )
        self.sub_department = SubDepartment.objects.create(
            name="Mechanical", department_name=self.department
        )
        self.user = get_user_model().objects.create_user(
            username="testuser",
            password="password",
            first_name="Test",
            last_name="User",
            personnel_number="PN111",
            department=self.department,
        )
        self.client.force_authenticate(user=self.user)

        # Create a sample DLTracker
        self.tracker = DLTracker.objects.create(
            defect_no="DEF-001",
            sub_dept_id=self.sub_department,
            dl_type="DL1",
            equip_name="Pump",
            defect_description="Leakage in pump",
            status="Not yet started",
        )

    def _build_excel_file(self, headers, rows, filename="dl_import.xlsx"):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.append(headers)
        for row in rows:
            worksheet.append(row)

        buffer = BytesIO()
        workbook.save(buffer)
        return SimpleUploadedFile(
            filename,
            buffer.getvalue(),
            content_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
        )

    def test_dl_dashboard(self):
        url = reverse("dl_monitor:dashboard")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message"], "DL Monitoring Dashboard API")
        self.assertIn("dl_counts", response.data)
        self.assertIn("dl_breakdown", response.data)
        self.assertIn("pending_dls", response.data)
        self.assertEqual(response.data["dl_counts"]["dl1"], 1)

    def test_dl_master(self):
        url = reverse("dl_monitor:dl_master")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("dl_types", response.data)

    def test_dl_tracking(self):
        url = reverse("dl_monitor:dl_tracking")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["defect_no"], "DEF-001")

    def test_update_dl_tracking(self):
        url = reverse("dl_monitor:update_dl_tracking")
        payload = {
            "id": self.tracker.id,
            "yard_remarks": "Work started",
            "status": "In progress",
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "success")

        self.tracker.refresh_from_db()
        self.assertEqual(self.tracker.status, "In progress")
        self.assertEqual(self.tracker.yard_remarks, "Work started")

    def test_close_dl_tracking(self):
        url = reverse("dl_monitor:close_dl_tracking")
        payload = {
            "id": self.tracker.id,
            "er_date": "2026-06-01",
            "start_work": "2026-06-02",
            "complete_work": "2026-06-04",
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "success")

        self.tracker.refresh_from_db()
        self.assertTrue(self.tracker.is_closed)
        self.assertEqual(DLClose.objects.filter(dl_tracker=self.tracker).count(), 1)

        # Test dl_history
        history_url = reverse("dl_monitor:dl_history")
        history_response = self.client.get(history_url)
        self.assertEqual(history_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(history_response.data), 1)
        self.assertEqual(history_response.data[0]["dl_work"], 2)

    def test_dl_dashboard_counts(self):
        url = reverse("dl_monitor:dl_dashboard_counts")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["dl1"], 1)
        self.assertEqual(response.data["dl2"], 0)
        self.assertEqual(response.data["dl3"], 0)

    def test_import_excel_rejects_missing_required_headers(self):
        url = reverse("dl_monitor:import_excel_file")
        excel = self._build_excel_file(
            ["Equip Name", "Dart No"],
            [["Pump", "DART-1"]],
        )

        response = self.client.post(
            url,
            {"excel": excel, "dl_type": "DL1"},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["message"],
            "Invalid Excel format. Missing required column(s).",
        )
        self.assertIn("Defect No", response.data["missing_headers"])
        self.assertIn("Defect Description", response.data["missing_headers"])

    def test_import_excel_rejects_file_with_no_valid_rows(self):
        url = reverse("dl_monitor:import_excel_file")
        excel = self._build_excel_file(
            ["Defect No", "Equip Name", "Defect Description"],
            [["", "Pump", "Leakage"]],
        )

        response = self.client.post(
            url,
            {"excel": excel, "dl_type": "DL1"},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["message"],
            "No valid rows found in the uploaded Excel file. Please ensure each row has a value in 'Defect No'.",
        )
        self.assertEqual(response.data["created"], 0)
        self.assertEqual(response.data["updated"], 0)

    def test_import_excel_allows_unmapped_equipment(self):
        url = reverse("dl_monitor:import_excel_file")
        excel = self._build_excel_file(
            [
                "Equip Name",
                "Defect Description",
                "Defect No",
                "Dart No",
                "Ship Remarks",
            ],
            [
                [
                    "Unknown Equipment",
                    "Imported without mapped sub department",
                    "DEF-IMPORT-001",
                    "DART-IMPORT-001",
                    "Ship remark",
                ]
            ],
        )

        response = self.client.post(
            url,
            {"dl_type": "DL1", "excel": excel},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["created"], 1)

        tracker = DLTracker.objects.get(defect_no="DEF-IMPORT-001", dl_type="DL1")
        self.assertIsNone(tracker.sub_dept_id)
        self.assertEqual(tracker.equip_name, "Unknown Equipment")

    def test_open_dl_monitoring_records_command_reopens_closed_records(self):
        extra_trackers = []
        for idx in range(2, 5):
            tracker = DLTracker.objects.create(
                defect_no=f"DEF-00{idx}",
                sub_dept_id=self.sub_department,
                dl_type="DLX",
                equip_name=f"Equipment {idx}",
                defect_description=f"Defect {idx}",
                is_closed=True,
            )
            DLClose.objects.create(
                dl_tracker=tracker,
                er_date_by_yard=date(2026, 6, 1),
                start_work_by_yard=date(2026, 6, 2),
                complete_work_by_yard=date(2026, 6, 3),
            )
            extra_trackers.append(tracker)

        self.tracker.is_closed = True
        self.tracker.save(update_fields=["is_closed"])
        DLClose.objects.create(
            dl_tracker=self.tracker,
            er_date_by_yard=date(2026, 6, 1),
            start_work_by_yard=date(2026, 6, 2),
            complete_work_by_yard=date(2026, 6, 3),
        )

        call_command(
            "open_dl_monitoring_records",
            username=self.user.CustomUsername,
            count=1,
        )

        reopened = list(
            DLTracker.objects.filter(is_closed=False, sub_dept_id=self.sub_department)
            .order_by("dl_type")
            .values_list("dl_type", flat=True)
        )
        self.assertEqual(reopened, ["DL1", "DL2", "DL3"])
        self.assertEqual(DLClose.objects.count(), 1)
