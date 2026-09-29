"""Survey workflow tests: `SurveyApiTests`.

Split out of the former flat `wlms/tests.py` (the wlms file-structure split, mirroring
the earlier `obs/tests/` package split).
"""

from django.test import TestCase
from django.utils import timezone

from ..models import (
    DartWedSpare,
    DemandDetails,
    PlannedSparesDescription,
    PTSDemandDetails,
    ReceiveDemandDetails,
    SurveyFormsDetails,
    SurveyFormsItems,
    SurveyReceiptsDetails,
)
from ._shared import WLMSApiFixtureMixin


class SurveyApiTests(WLMSApiFixtureMixin, TestCase):
    def test_create_survey_to_receive_flow(self):
        planned_description = PlannedSparesDescription.objects.create(
            wlms_spare_id=self.spare,
            routine_description_id=self.routine_description,
            spares_required=True,
        )
        dart_spare = DartWedSpare.objects.create(
            equipment_id=self.ship_equipment,
            wed_spare=self.spare,
            dart_id=self.dart,
            pattern="DART-WED-002",
            description="DART spare for survey and demand",
            quantity=1,
        )

        survey_receipt_response = self.client.post(
            "/api/v1/wlms/survey-receipts/",
            {
                "wed_spares_id": self.spare.id,
                "spare_cart_name": "WED SURVEY CART",
                "wed_routine_plan": planned_description.id,
                "wed_dart": dart_spare.id,
                "is_save": True,
                "is_survey": True,
                "is_sync": False,
                "is_hod": False,
                "is_approval": False,
                "wlms_status": "survey created",
            },
            format="json",
        )
        self.assertEqual(survey_receipt_response.status_code, 201)

        survey_form_response = self.client.post(
            "/api/v1/wlms/survey-forms/",
            {
                "survey_rec_id": survey_receipt_response.data["id"],
                "rece_qty": "1",
                "held_certificate_type": "OEM",
                "held_certificate_no": "CERT-001",
                "survey_no": "SUR-WED-001",
                "wlms_survey_no": "WLMS-SUR-001",
                "ss_remarks": "accepted for survey",
                "scrap_qty": "0",
            },
            format="json",
        )
        self.assertEqual(survey_form_response.status_code, 201)

        survey_item_response = self.client.post(
            "/api/v1/wlms/survey-items/",
            {
                "survey_details_id": survey_form_response.data["id"],
                "wed_spares_id": self.spare.id,
                "item_serial_no": "SER-WED-001",
            },
            format="json",
        )
        self.assertEqual(survey_item_response.status_code, 201)

        pts_response = self.client.post(
            "/api/v1/wlms/pts-demands/",
            {
                "wed_spares_id": self.spare.id,
                "wed_routine_plan": planned_description.id,
                "wed_dart": dart_spare.id,
                "survey_no": "SUR-WED-001",
                "PTS_demand_no": "PTS-WED-001",
                "demand_no": "DEM-WED-001",
                "demand_qty": "1",
                "remarks": "PTS raised after survey",
                "is_save": True,
                "is_pts": True,
                "is_sync": False,
                "is_rejected": False,
                "spare_cart_name": "WED PTS CART",
                "is_hod": False,
                "is_approval": False,
            },
            format="json",
        )
        self.assertEqual(pts_response.status_code, 201)

        demand_response = self.client.post(
            "/api/v1/wlms/demands/",
            {
                "wed_spares_id": self.spare.id,
                "wed_routine_plan": planned_description.id,
                "wed_dart": dart_spare.id,
                "survey_no": "SUR-WED-001",
                "PTS_no": "PTS-WED-001",
                "demand_no": "DEM-WED-001",
                "demand_qty": "1",
                "remarks": "demand raised to WED",
                "is_save": True,
                "is_demand": True,
                "is_sync": False,
                "is_rejected": False,
                "spare_cart_name": "WED DEMAND CART",
                "is_hod": False,
                "is_approval": False,
                "is_delete": False,
            },
            format="json",
        )
        self.assertEqual(demand_response.status_code, 201)

        receive_response = self.client.post(
            "/api/v1/wlms/receive-demands/",
            {
                "demand_details": demand_response.data["id"],
                "demand_number": "DEM-WED-001",
                "demand_date": "2026-06-03",
                "demand_quantity": 1,
                "demand_status": "received",
                "swmm_demandno": "SWMM-WED-001",
                "dart_no": "DART-801",
                "gate_pass_no": "GP-WED-001",
                "gate_pass_date": "2026-06-03T10:00:00Z",
            },
            format="json",
        )

        self.assertEqual(receive_response.status_code, 201)
        self.assertTrue(
            SurveyReceiptsDetails.objects.filter(wed_spares_id=self.spare).exists()
        )
        self.assertTrue(
            SurveyFormsDetails.objects.filter(
                survey_rec_id_id=survey_receipt_response.data["id"]
            ).exists()
        )
        self.assertTrue(
            SurveyFormsItems.objects.filter(wed_spares_id=self.spare).exists()
        )
        self.assertTrue(
            PTSDemandDetails.objects.filter(PTS_demand_no="PTS-WED-001").exists()
        )
        demand = DemandDetails.objects.get(id=demand_response.data["id"])
        receive = ReceiveDemandDetails.objects.get(id=receive_response.data["id"])
        self.assertEqual(demand.wed_spares_id_id, self.spare.id)
        self.assertEqual(receive.demand_details_id, demand.id)
        self.assertEqual(receive.demand_status, "received")

    def test_approved_survey_form_gets_a_unique_survey_number(self):
        survey = SurveyReceiptsDetails.objects.create(
            user_id=self.user_profile,
            wed_spares_id=self.spare,
            spare_cart_name="Survey",
            is_hod=True,
            is_approval=True,
        )
        form = SurveyFormsDetails.objects.create(
            survey_rec_id=survey,
            rece_qty="1",
            scrap_qty="1",
        )

        response = self.client.post(
            f"/api/v1/wlms/survey-forms/{form.pk}/generate-number/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["survey_no"],
            f"SWMM/SURVEY/{timezone.now().year}/{form.pk:03d}",
        )
        survey.refresh_from_db()
        self.assertTrue(survey.is_survey)
