"""PTS/Demand/Receive workflow tests: `PtsDemandApiTests`.

Split out of the former flat `wlms/tests.py` (the wlms file-structure split, mirroring
the earlier `obs/tests/` package split).
"""

from django.test import TestCase
from django.utils import timezone

from ..models import (
    DemandDetails,
    PlannedSparesDescription,
    PlannedWEDSpareList,
    PTSDemandDetails,
    ReceiveDemandDetails,
)
from ._shared import WLMSApiFixtureMixin


class PtsDemandApiTests(WLMSApiFixtureMixin, TestCase):
    def test_reject_invalid_receive_quantity(self):
        response = self.client.post(
            "/api/v1/wlms/receive-demands/",
            {
                "demand_number": "DEM-WED-002",
                "demand_quantity": 1000000,
                "demand_status": "received",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("demand_quantity", response.data)

    def test_planned_spare_can_be_added_to_demand_cart(self):
        description = PlannedSparesDescription.objects.create(
            wlms_spare_id=self.spare,
            routine_description_id=self.routine_description,
            spares_required=True,
        )
        planned_spare = PlannedWEDSpareList.objects.create(
            pattern_number=self.spare.item_code,
            planned_spares_description=description,
            quantity_required=2,
        )

        first_response = self.client.post(
            "/api/v1/wlms/demands/add-to-cart/",
            {"source": "planned", "source_ids": [planned_spare.pk]},
            format="json",
        )
        second_response = self.client.post(
            "/api/v1/wlms/demands/add-to-cart/",
            {"source": "planned", "source_ids": [planned_spare.pk]},
            format="json",
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 200)
        demand = DemandDetails.objects.get(wed_spares_id=self.spare)
        self.assertEqual(demand.demand_qty, "2")
        self.assertEqual(demand.wed_routine_plan, description)

    def test_demand_approval_generates_reference_and_lists_outbox(self):
        demand = DemandDetails.objects.create(
            user_id=self.user_profile,
            wed_spares_id=self.spare,
            demand_qty="1",
            spare_cart_name="Demand",
        )

        send_response = self.client.post(
            f"/api/v1/wlms/demands/{demand.pk}/send-for-approval/"
        )
        approve_response = self.client.post(
            f"/api/v1/wlms/demands/{demand.pk}/approve/"
        )
        number_response = self.client.post(
            f"/api/v1/wlms/demands/{demand.pk}/generate-number/"
        )
        outbox_response = self.client.get("/api/v1/wlms/demands/outbox/")

        self.assertEqual(send_response.status_code, 200)
        self.assertEqual(approve_response.status_code, 200)
        self.assertEqual(number_response.status_code, 200)
        self.assertEqual(
            number_response.data["demand_no"],
            f"SWMM/DEMAND/{timezone.now().year}/{demand.pk:03d}",
        )
        self.assertEqual(outbox_response.status_code, 200)
        self.assertEqual(outbox_response.data[0]["id"], demand.pk)

    def test_receive_demand_updates_wed_stock_once(self):
        demand = DemandDetails.objects.create(
            user_id=self.user_profile,
            wed_spares_id=self.spare,
            demand_no="SWMM/DEMAND/2026/001",
            demand_qty="2",
            is_demand=True,
            is_approval=True,
        )

        first_response = self.client.post(
            "/api/v1/wlms/receive-demands/",
            {
                "demand_details": demand.pk,
                "demand_number": demand.demand_no,
                "demand_quantity": 2,
                "demand_status": "received",
            },
            format="json",
        )
        second_response = self.client.post(
            "/api/v1/wlms/receive-demands/",
            {
                "demand_details": demand.pk,
                "demand_number": demand.demand_no,
                "demand_quantity": 2,
                "demand_status": "received",
            },
            format="json",
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 400)
        self.spare.refresh_from_db()
        self.assertEqual(self.spare.latest_qty, 5)

    def test_approved_pts_gets_a_unique_reference_number(self):
        pts = PTSDemandDetails.objects.create(
            user_id=self.user_profile,
            wed_spares_id=self.spare,
            demand_qty="1",
            spare_cart_name="PTS",
            is_hod=True,
            is_approval=True,
        )

        response = self.client.post(
            f"/api/v1/wlms/pts-demands/{pts.pk}/generate-number/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["PTS_demand_no"],
            f"SWMM/PTS/{timezone.now().year}/{pts.pk:03d}",
        )
        pts.refresh_from_db()
        self.assertTrue(pts.is_pts)

    def test_completed_demand_can_be_marked_synced(self):
        demand = DemandDetails.objects.create(
            user_id=self.user_profile,
            wed_spares_id=self.spare,
            demand_no="SWMM/DEMAND/2026/003",
            demand_qty="1",
            is_demand=True,
            is_hod=True,
            is_approval=True,
        )

        response = self.client.post(f"/api/v1/wlms/demands/{demand.pk}/mark-synced/")

        self.assertEqual(response.status_code, 200)
        demand.refresh_from_db()
        self.assertTrue(demand.is_sync)
        self.assertIsNotNone(demand.sync_date)

    def test_receive_queue_excludes_demands_already_received(self):
        pending = DemandDetails.objects.create(
            user_id=self.user_profile,
            wed_spares_id=self.spare,
            demand_no="SWMM/DEMAND/2026/004",
            demand_qty="1",
            is_demand=True,
        )
        received = DemandDetails.objects.create(
            user_id=self.user_profile,
            wed_spares_id=self.spare,
            demand_no="SWMM/DEMAND/2026/005",
            demand_qty="1",
            is_demand=True,
        )
        ReceiveDemandDetails.objects.create(
            demand_details=received,
            demand_number=received.demand_no,
            demand_quantity=1,
            demand_status="received",
        )

        response = self.client.get("/api/v1/wlms/demands/receive-queue/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], pending.pk)

    def test_demand_consolidation_groups_pending_wed_spares(self):
        DemandDetails.objects.create(
            user_id=self.user_profile,
            wed_spares_id=self.spare,
            demand_qty="2",
        )
        DemandDetails.objects.create(
            user_id=self.user_profile,
            wed_spares_id=self.spare,
            demand_qty="3",
        )

        response = self.client.get("/api/v1/wlms/demands/consolidation/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["item_code"], "WLMS-1001")
        self.assertEqual(response.data[0]["record_count"], 2)
        self.assertEqual(response.data[0]["total_quantity"], 5)

    def test_wlms_bulk_hod_actions_update_reference_status_fields(self):
        demand = DemandDetails.objects.create(
            user_id=self.user_profile,
            wed_spares_id=self.spare,
            demand_qty="2",
        )

        send_response = self.client.post(
            "/api/v1/wlms/demands/bulk-send-for-approval/",
            {"ids": [demand.pk]},
            format="json",
        )
        approve_response = self.client.post(
            "/api/v1/wlms/demands/bulk-approve/",
            {"ids": [demand.pk]},
            format="json",
        )

        self.assertEqual(send_response.status_code, 200)
        self.assertEqual(approve_response.status_code, 200)
        demand.refresh_from_db()
        self.assertTrue(demand.is_hod)
        self.assertTrue(demand.is_approval)
        self.assertEqual(demand.wlms_demand_status, "Approved")
