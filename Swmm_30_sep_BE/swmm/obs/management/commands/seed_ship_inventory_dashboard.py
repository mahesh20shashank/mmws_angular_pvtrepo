from django.core.management.base import BaseCommand
from django.db import transaction

from master.models import Department
from sfd.models import ShipEquipment

from obs.models import (
    Authority,
    Demand,
    Denomination,
    EquipmentClass,
    Receive,
    SpareClass,
    Spares,
    SparesMapping,
)


class Command(BaseCommand):
    help = "Create realistic demo records for the Ship Inventory dashboard."

    @transaction.atomic
    def handle(self, *args, **options):
        authority, _ = Authority.objects.get_or_create(name="NAVAL STORE AUTHORITY")

        demo_records = [
            {
                "department": ("Marine Engineering", "ME"),
                "spare_class": "MECHANICAL",
                "equipment_class": "PROPULSION SYSTEM",
                "equipment": "Main Propulsion Engine",
                "pattern_number": "FUEL-PUMP-ASSY-001",
                "description": "Fuel Pump Assembly",
                "category": Spares.RETURNABLE,
                "critical": True,
                "authorised": 10,
                "available": 2,
                "location": "Engine Room Store",
                "demand": 3,
                "receive": 2,
            },
            {
                "department": ("Marine Engineering", "ME"),
                "spare_class": "FILTERS",
                "equipment_class": "AUXILIARY SYSTEMS",
                "equipment": "Hydraulic Power Pack",
                "pattern_number": "HYD-FILTER-ELEM-002",
                "description": "Hydraulic Filter Element",
                "category": Spares.CONSUMABLE,
                "critical": True,
                "authorised": 12,
                "available": 0,
                "location": "Machinery Store",
                "demand": 4,
                "receive": 4,
            },
            {
                "department": ("Electrical Engineering", "EE"),
                "spare_class": "ELECTRICAL",
                "equipment_class": "ELECTRICAL POWER SYSTEM",
                "equipment": "Main Switchboard",
                "pattern_number": "SERVO-MOTOR-UNIT-003",
                "description": "Servo Motor Unit",
                "category": Spares.RETURNABLE,
                "critical": False,
                "authorised": 8,
                "available": 3,
                "location": "Electrical Store",
                "demand": 2,
                "receive": 1,
            },
            {
                "department": ("Weapons & Electronics", "WE"),
                "spare_class": "WEAPON SUPPORT",
                "equipment_class": "WEAPON SYSTEMS",
                "equipment": "Missile Interface Console",
                "pattern_number": "MISSILE-INTERFACE-004",
                "description": "Missile Interface Kit",
                "category": Spares.PERMANENT,
                "critical": True,
                "authorised": 6,
                "available": 5,
                "location": "Weapon Equipment Store",
                "demand": 0,
                "receive": 0,
            },
            {
                "department": ("Logistics", "LOG"),
                "spare_class": "TOOLS",
                "equipment_class": "TOOLS AND TEST EQUIPMENT",
                "equipment": "Portable Test Station",
                "pattern_number": "TEST-KIT-INSULATION-005",
                "description": "Insulation Resistance Test Kit",
                "category": Spares.PERMANENT,
                "critical": False,
                "authorised": 4,
                "available": 4,
                "location": "Tool Store",
                "demand": 0,
                "receive": 0,
            },
        ]

        denomination, _ = Denomination.objects.get_or_create(name="EA")

        for record in demo_records:
            department_name, department_code = record["department"]
            department, _ = Department.objects.get_or_create(
                code=department_code,
                defaults={
                    "name": department_name,
                    "description": f"{department_name} inventory support",
                },
            )
            if department.name != department_name:
                department.name = department_name
                department.save(update_fields=["name"])

            spare_class, _ = SpareClass.objects.get_or_create(
                name=record["spare_class"],
                department=department,
            )
            equipment_class, _ = EquipmentClass.objects.get_or_create(
                name=record["equipment_class"],
                spare_class=spare_class,
            )
            spare, _ = Spares.objects.update_or_create(
                pattern_number=record["pattern_number"],
                defaults={
                    "equipment_class": equipment_class,
                    "description": record["description"],
                    "category": record["category"],
                    "critical": record["critical"],
                    "compartment": record["location"],
                    "location": record["location"],
                    "denomination": denomination,
                    "quantity_authorised": record["authorised"],
                    "quantity_available": record["available"],
                    "authority": authority,
                    "is_obs": True,
                },
            )
            equipment, _ = ShipEquipment.objects.get_or_create(
                nomenclature=record["equipment"],
                defaults={
                    "department": department,
                    "location_on_board": record["location"],
                },
            )
            SparesMapping.objects.get_or_create(
                equipment_class=equipment_class,
                equipment=equipment,
            )

            Demand.objects.filter(
                spare=spare,
                dart_number="DASHBOARD-DEMO",
            ).delete()
            Receive.objects.filter(
                spare=spare,
                dart_number="DASHBOARD-DEMO",
            ).delete()
            if record["demand"]:
                Demand.objects.create(
                    spare=spare,
                    quantity_todemand=record["demand"],
                    dart_number="DASHBOARD-DEMO",
                )
            if record["receive"]:
                Receive.objects.create(
                    spare=spare,
                    quantity_toreceive=record["receive"],
                    dart_number="DASHBOARD-DEMO",
                )

        self.stdout.write(
            self.style.SUCCESS(
                "Ship Inventory dashboard demo data is ready: 5 records."
            )
        )
