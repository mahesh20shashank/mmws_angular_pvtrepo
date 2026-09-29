"""Ship-to-ship signal demand workflow tests: `SignalDemandApiTests`.

Split out of the former flat `wlms/tests.py` (the wlms file-structure split, mirroring
the earlier `obs/tests/` package split).
"""

from django.test import TestCase
from django.utils import timezone

from ..models import SignalDemand
from ._shared import WLMSApiFixtureMixin


class SignalDemandApiTests(WLMSApiFixtureMixin, TestCase):
    def test_opdem_requires_requesting_ship_and_inventory_item(self):
        response = self.client.post(
            "/api/v1/wlms/signal-demands/",
            {
                "demand_type": "OPDEM",
                "demand_number": "OPDEM-2026-001",
                "dtg": timezone.now().isoformat(),
                "demand_quantity": 2,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("requesting_ship", response.data)
        self.assertIn("inventory_item", response.data)

    def test_storedem_can_be_registered_and_forwarded(self):
        from master.models import MShipCommand, Ship, UnitType

        command = MShipCommand.objects.create(
            command_id=901,
            command_code="ENC",
            command_name="Eastern Naval Command",
            active=True,
        )
        unit_type = UnitType.objects.create(id=901, name="WED test unit")
        ship = Ship.objects.create(
            code="SHIP-WED-01",
            name="WED Test Ship",
            command=command,
            unit_type=unit_type,
        )
        create_response = self.client.post(
            "/api/v1/wlms/signal-demands/",
            {
                "demand_type": "STOREDEM",
                "demand_number": "STOREDEM-2026-001",
                "dtg": timezone.now().isoformat(),
                "requesting_ship": ship.pk,
                "equipment": self.equipment.pk,
                "wed_spare": self.spare.pk,
                "demand_quantity": 2,
                "remarks": "Routine store replenishment",
            },
            format="json",
        )

        self.assertEqual(create_response.status_code, 201)
        demand_id = create_response.data["id"]
        forward_response = self.client.post(
            f"/api/v1/wlms/signal-demands/{demand_id}/forward/"
        )

        self.assertEqual(forward_response.status_code, 200)
        demand = SignalDemand.objects.get(pk=demand_id)
        self.assertEqual(demand.status, SignalDemand.FORWARDED)

    def test_candem_requires_a_different_receiver_ship(self):
        from master.models import MShipCommand, Ship, UnitType

        command = MShipCommand.objects.create(
            command_id=902,
            command_code="SNC",
            command_name="Southern Naval Command",
            active=True,
        )
        unit_type = UnitType.objects.create(id=902, name="Donor unit")
        ship = Ship.objects.create(
            code="SHIP-WED-02",
            name="Donor Ship",
            command=command,
            unit_type=unit_type,
        )

        response = self.client.post(
            "/api/v1/wlms/signal-demands/",
            {
                "demand_type": "CANDEM",
                "demand_number": "CANDEM-2026-001",
                "dtg": timezone.now().isoformat(),
                "requesting_ship": ship.pk,
                "receiver_ship": ship.pk,
                "wed_spare": self.spare.pk,
                "demand_quantity": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("receiver_ship", response.data)

    def test_signal_demand_list_can_be_filtered_by_workflow_type(self):
        from master.models import MShipCommand, Ship, UnitType

        command = MShipCommand.objects.create(
            command_id=903,
            command_code="WNC",
            command_name="Western Naval Command",
            active=True,
        )
        unit_type = UnitType.objects.create(id=903, name="Signal demand unit")
        ship = Ship.objects.create(
            code="SHIP-WED-03",
            name="Signal Demand Ship",
            command=command,
            unit_type=unit_type,
        )
        for demand_type in (SignalDemand.OPDEM, SignalDemand.STOREDEM):
            SignalDemand.objects.create(
                demand_type=demand_type,
                demand_number=f"{demand_type}-2026-010",
                dtg=timezone.now(),
                requesting_ship=ship,
                wed_spare=self.spare,
                demand_quantity=1,
                created_by=self.user_profile,
            )

        response = self.client.get(
            "/api/v1/wlms/signal-demands/",
            {"demand_type": SignalDemand.OPDEM},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["demand_type"], SignalDemand.OPDEM)
