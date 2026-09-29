"""The Survey/PTS/Demand HOD-approval workflow tests and the Receive/goods-in stage
that follows them: `WorkflowApiTests`.

Split out of the former flat `ilms/tests.py` (the ilms file-structure split).
"""

from django.test import TestCase

from ..models import (
    DartMOSpare,
    DemandDetails,
    MOPlannedSparesDescription,
    PlannedMOSpareList,
    PTSDetails,
    ReceiveDetails,
    SurveyDetails,
)
from ._shared import ILMSApiFixtureMixin


class WorkflowApiTests(ILMSApiFixtureMixin, TestCase):
    def test_create_demand_details(self):
        payload = {
            "vendor_id": self.vendor.vendor_code,
            "ilms_spare_id": self.item.item_code,
            "in_progress_status": "draft",
            "demand_number": "MO-DEM-001",
            "is_demand": True,
            "is_sync": False,
            "is_hod": False,
            "is_hod_approval": False,
        }

        response = self.client.post("/api/v1/ilms/demands/", payload, format="json")

        self.assertEqual(response.status_code, 201)
        demand = DemandDetails.objects.get(id=response.data["id"])
        self.assertEqual(demand.vendor_id_id, self.vendor.vendor_code)
        self.assertEqual(demand.ilms_spare_id_id, self.item.item_code)
        self.assertEqual(demand.demand_number, "MO-DEM-001")

    def test_planned_spare_can_be_added_to_survey_cart(self):
        planned_description = MOPlannedSparesDescription.objects.create(
            item_id=self.item,
            routine_description_id=self.routine_description,
        )
        planned_spare = PlannedMOSpareList.objects.create(
            pattern_number=self.item.item_code,
            planned_spares_description=planned_description,
            quantity_required=2,
        )

        response = self.client.post(
            "/api/v1/ilms/surveys/add-to-cart/",
            {
                "source": "planned",
                "source_ids": [planned_spare.pk],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        survey = SurveyDetails.objects.get(ilms_spare_id=self.item)
        self.assertEqual(survey.in_progress_status, "Pending")
        self.assertFalse(survey.is_hod)

    def test_demand_can_be_sent_and_approved_by_hod(self):
        demand = DemandDetails.objects.create(
            vendor_id=self.vendor,
            ilms_spare_id=self.item,
            demand_number="MO-DEM-APP-1",
            in_progress_status="Pending",
        )

        send_response = self.client.post(
            f"/api/v1/ilms/demands/{demand.pk}/send-for-approval/"
        )
        approve_response = self.client.post(
            f"/api/v1/ilms/demands/{demand.pk}/approve/"
        )

        self.assertEqual(send_response.status_code, 200)
        self.assertEqual(approve_response.status_code, 200)
        demand.refresh_from_db()
        self.assertTrue(demand.is_hod)
        self.assertTrue(demand.is_hod_approval)
        self.assertEqual(demand.in_progress_status, "Approved")

    def test_hod_inbox_and_outbox_filter_workflow_records(self):
        pending = PTSDetails.objects.create(
            ilms_spare_id=self.item,
            in_progress_status="PTS",
            is_hod=True,
        )
        approved = SurveyDetails.objects.create(
            ilms_spare_id=self.item,
            in_progress_status="Approved",
            is_hod=True,
            is_hod_approval=True,
        )

        inbox_response = self.client.get("/api/v1/ilms/pts/inbox/")
        outbox_response = self.client.get("/api/v1/ilms/surveys/outbox/")

        self.assertEqual(inbox_response.status_code, 200)
        self.assertEqual(inbox_response.data[0]["id"], pending.pk)
        self.assertEqual(outbox_response.status_code, 200)
        self.assertEqual(outbox_response.data[0]["id"], approved.pk)

    def test_demand_number_generation_and_receive_queue(self):
        demand = DemandDetails.objects.create(
            vendor_id=self.vendor,
            ilms_spare_id=self.item,
            in_progress_status="Approved",
            is_hod=True,
            is_hod_approval=True,
        )

        number_response = self.client.post(
            f"/api/v1/ilms/demands/{demand.pk}/generate-number/"
        )
        queue_response = self.client.get("/api/v1/ilms/demands/receive-queue/")

        self.assertEqual(number_response.status_code, 200)
        self.assertEqual(
            number_response.data["demand_number"],
            f"MO-DEMAND-{demand.pk:06d}",
        )
        self.assertEqual(queue_response.status_code, 200)
        self.assertEqual(queue_response.data[0]["id"], demand.pk)

    def test_workflow_record_can_be_completed_and_marked_synced(self):
        survey = SurveyDetails.objects.create(
            ilms_spare_id=self.item,
            in_progress_status="Approved",
            is_hod=True,
            is_hod_approval=True,
        )

        complete_response = self.client.post(
            f"/api/v1/ilms/surveys/{survey.pk}/complete/"
        )
        sync_response = self.client.post(
            f"/api/v1/ilms/surveys/{survey.pk}/mark-synced/"
        )

        self.assertEqual(complete_response.status_code, 200)
        self.assertEqual(sync_response.status_code, 200)
        survey.refresh_from_db()
        self.assertTrue(survey.is_survey)
        self.assertTrue(survey.is_sync)
        self.assertEqual(survey.in_progress_status, "Synced")

    def test_demand_consolidation_groups_pending_records_by_item(self):
        DemandDetails.objects.create(
            ilms_spare_id=self.item,
            vendor_id=self.vendor,
            in_progress_status="Pending",
        )
        DemandDetails.objects.create(
            ilms_spare_id=self.item,
            vendor_id=self.vendor,
            in_progress_status="Pending",
        )

        response = self.client.get("/api/v1/ilms/demands/consolidation/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["item_code"], "ILMS-1001")
        self.assertEqual(response.data[0]["record_count"], 2)

    def test_planned_cart_preserves_mo_routine_context(self):
        planned_description = MOPlannedSparesDescription.objects.create(
            item_id=self.item,
            routine_description_id=self.routine_description,
        )
        planned_spare = PlannedMOSpareList.objects.create(
            pattern_number=self.item.item_code,
            planned_spares_description=planned_description,
            quantity_required=2,
        )

        response = self.client.post(
            "/api/v1/ilms/surveys/add-to-cart/",
            {"source": "planned", "source_ids": [planned_spare.pk]},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        survey = SurveyDetails.objects.get(pk=response.data[0]["id"])
        self.assertEqual(survey.custom_user, self.user.user_profile)
        self.assertEqual(survey.mo_routine_plan, planned_description)
        self.assertIsNone(survey.mo_dart)

    def test_dart_cart_preserves_mo_dart_context(self):
        dart_spare = DartMOSpare.objects.create(
            dart_id=self.dart,
            equipment_id=self.ship_equipment,
            mo_spare=self.item,
            pattern=self.item.item_code,
            description=self.item.item_desc,
            quantity=1,
        )

        response = self.client.post(
            "/api/v1/ilms/demands/add-to-cart/",
            {"source": "dart", "source_ids": [dart_spare.pk]},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        demand = DemandDetails.objects.get(pk=response.data[0]["id"])
        self.assertEqual(demand.custom_user, self.user.user_profile)
        self.assertEqual(demand.mo_dart, dart_spare)
        self.assertEqual(demand.mo_status, "Pending")

    def test_ilms_bulk_hod_actions_update_reference_status_fields(self):
        pts = PTSDetails.objects.create(
            ilms_spare_id=self.item,
            vendor_id=self.vendor,
            in_progress_status="Pending",
        )

        send_response = self.client.post(
            "/api/v1/ilms/pts/bulk-send-for-approval/",
            {"ids": [pts.pk]},
            format="json",
        )
        approve_response = self.client.post(
            "/api/v1/ilms/pts/bulk-approve/",
            {"ids": [pts.pk]},
            format="json",
        )

        self.assertEqual(send_response.status_code, 200)
        self.assertEqual(approve_response.status_code, 200)
        pts.refresh_from_db()
        self.assertTrue(pts.is_hod)
        self.assertTrue(pts.is_hod_approval)
        self.assertEqual(pts.mo_pts_status, "Approved")

    # -- Receive stage (item 4) ----------------------------------------------------

    def _make_obs_spare(self, pattern_number, quantity_available=0):
        from obs.models import Authority, EquipmentClass, SpareClass, Spares

        spare_class, _ = SpareClass.objects.get_or_create(name="MO RECEIVE CLASS")
        equipment_class, _ = EquipmentClass.objects.get_or_create(
            name="MO RECEIVE EQUIPMENT",
            spare_class=spare_class,
        )
        authority, _ = Authority.objects.get_or_create(name="WED ITEM")
        return Spares.objects.create(
            equipment_class=equipment_class,
            pattern_number=pattern_number,
            description="Receive-stage spare",
            quantity_authorised=100,
            quantity_available=quantity_available,
            authority=authority,
        )

    def test_receive_against_demand_increments_stock_and_reassigns_authority(self):
        from obs.models import Authority

        spare = self._make_obs_spare("OBS-RECV-1", quantity_available=2)
        demand = DemandDetails.objects.create(
            ilms_spare_id=self.item,
            obs_spare_id=spare,
            demand_number="10",
        )

        response = self.client.post(
            "/api/v1/ilms/receive-details/",
            {
                "demand_details": demand.pk,
                "demand_quantity": 10,
                "original_demand_qty": 10,
                "demand_status": "Received",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["demand_status"], "Received")
        self.assertEqual(response.data["received_qty"], 10)
        spare.refresh_from_db()
        self.assertEqual(spare.quantity_available, 12)
        self.assertEqual(spare.authority, Authority.objects.get(name="ILMS ITEM"))

    def test_receive_against_pts_partial_then_completing_receipt(self):
        spare = self._make_obs_spare("OBS-RECV-2")
        pts = PTSDetails.objects.create(
            ilms_spare_id=self.item,
            obs_spare_id=spare,
        )

        first = self.client.post(
            "/api/v1/ilms/receive-details/",
            {
                "pts_details": pts.pk,
                "demand_quantity": 4,
                "original_demand_qty": 10,
                "demand_status": "Received",
            },
            format="json",
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.data["demand_status"], "Outstanding")
        self.assertEqual(first.data["received_qty"], 4)

        second = self.client.post(
            "/api/v1/ilms/receive-details/",
            {
                "pts_details": pts.pk,
                "demand_quantity": 6,
                "demand_status": "Received",
            },
            format="json",
        )
        self.assertEqual(second.status_code, 201)
        self.assertEqual(second.data["demand_status"], "Received")
        self.assertEqual(second.data["received_qty"], 10)

        spare.refresh_from_db()
        self.assertEqual(spare.quantity_available, 10)

    def test_receive_rejects_over_receipt(self):
        spare = self._make_obs_spare("OBS-RECV-3")
        demand = DemandDetails.objects.create(
            ilms_spare_id=self.item,
            obs_spare_id=spare,
        )

        response = self.client.post(
            "/api/v1/ilms/receive-details/",
            {
                "demand_details": demand.pk,
                "demand_quantity": 20,
                "original_demand_qty": 10,
                "demand_status": "Received",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_receive_against_survey_uses_third_optional_fk(self):
        spare = self._make_obs_spare("OBS-RECV-4")
        survey = SurveyDetails.objects.create(
            ilms_spare_id=self.item,
            obs_spare_id=spare,
        )

        response = self.client.post(
            "/api/v1/ilms/receive-details/",
            {
                "survey_details": survey.pk,
                "demand_quantity": 5,
                "original_demand_qty": 5,
                "demand_status": "Received",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        receive = ReceiveDetails.objects.get(pk=response.data["id"])
        self.assertEqual(receive.survey_details, survey)
        self.assertIsNone(receive.demand_details)
        self.assertIsNone(receive.pts_details)

    # -- Shared HOD-approval numbering utility (item 5) -----------------------------

    def test_send_for_approval_generates_shaped_reference_number(self):
        survey = SurveyDetails.objects.create(
            ilms_spare_id=self.item,
            in_progress_status="Pending",
        )

        response = self.client.post(
            f"/api/v1/ilms/surveys/{survey.pk}/send-for-approval/"
        )

        self.assertEqual(response.status_code, 200)
        survey.refresh_from_db()
        self.assertTrue(survey.survey_cart_no)
        # `{2-digit year}{customer code}{department code}{TAG}{00001}` — with no ship
        # configured and no department on the test user, the year and "SVY00001"
        # sequence tail are still the parts guaranteed present.
        self.assertIn("SVY", survey.survey_cart_no)
        self.assertTrue(survey.survey_cart_no.endswith("00001"))

    def test_bulk_send_for_approval_assigns_sequential_references_without_collision(
        self,
    ):
        demand_one = DemandDetails.objects.create(ilms_spare_id=self.item)
        demand_two = DemandDetails.objects.create(ilms_spare_id=self.item)

        response = self.client.post(
            "/api/v1/ilms/demands/bulk-send-for-approval/",
            {"ids": [demand_one.pk, demand_two.pk]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        demand_one.refresh_from_db()
        demand_two.refresh_from_db()
        self.assertTrue(demand_one.demand_cart_no)
        self.assertTrue(demand_two.demand_cart_no)
        self.assertNotEqual(demand_one.demand_cart_no, demand_two.demand_cart_no)
        suffixes = {
            demand_one.demand_cart_no[-5:],
            demand_two.demand_cart_no[-5:],
        }
        self.assertEqual(suffixes, {"00001", "00002"})
