"""Thin master-data CRUD viewset tests (`CustomerViewSet`/`CustomerEquipmentViewSet`/
`CustomerEquipmentLineViewSet`, etc.): `MastersApiTests`.

Split out of the former flat `ilms/tests.py` (the ilms file-structure split).
"""

from django.test import TestCase

from ..models import Customer, CustomerEquipment, CustomerEquipmentLine
from ._shared import ILMSApiFixtureMixin


class MastersApiTests(ILMSApiFixtureMixin, TestCase):
    def test_customer_equipment_uses_sfd_equipment(self):
        customer = Customer.objects.create(
            customer_code="SHIP-001",
            name="INS Test Ship",
            customer_type="SHIP",
            mother_depot="MO",
            addressee="Logistics Officer",
            address_line1="Naval Base",
            city="Mumbai",
            state="Maharashtra",
            pin_code="400001",
            allowance_annual_rs="100000.00",
            date_introduced="2026-06-05",
            admin_authority="Command",
            station_code="MUM",
            added_by="store-user",
        )

        customer_equipment = CustomerEquipment.objects.create(
            customer=customer,
            equipment=self.equipment,
            qty_ship_fit=2,
            qty_present=2,
            date_quantity_present="2026-06-05",
            added_by="store-user",
            datetime_added="2026-06-05T10:00:00Z",
        )
        equipment_line = CustomerEquipmentLine.objects.create(
            customer=customer,
            equipment=self.equipment,
            eqpt_serial_number="EQ-SERIAL-001",
            position_specific_yn=False,
            fitment_port_stbd="PORT",
            rotation_rl="RIGHT",
            eqpt_nomenclature="Hydraulic Pump",
            generic_code="HYD-PUMP",
            eqpt_type="PUMP",
            manufacturer_name="OEM",
            supplier_name="Supplier",
            location_code="ENG-01",
            location_onboard="Engine Room",
            location_fit="PORT",
            added_by="store-user",
            datetime_added="2026-06-05T10:00:00Z",
        )

        self.assertEqual(customer_equipment.equipment, self.equipment)
        self.assertEqual(equipment_line.equipment, self.equipment)
