"""Seed placeholder equipment for the SRAR categories that have none.

Why this exists
---------------
Every equipment-driven table in the SRAR form is populated by filtering the SRAR
equipment lookup on a CMMS ``Ch_Master_Equipment_Type`` category code (see
``SrarMasterEquipmentsAPIView`` and ``loadMasterEquipmentsFromBackend()`` in the
transaction component). A category with no linked equipment renders an empty table,
so most of the form cannot be exercised at all on a hull whose CMMS data covers only
a few categories.

This command creates one ShipEquipment row per empty category and links it exactly the
way the real "Add SRAR Equipment" path does -- by reusing
``swmmapi.views.sync_srar_equipment_links_from_sfd()`` rather than hand-rolling a second
copy of that logic, so the seeded rows behave like linked equipment everywhere.

Only the fields the SRAR form actually reads are filled: name, nomenclature, code,
serial number, location on board, department, ship, ``is_srar`` and the category code.
Everything else is left at its default.

This is demo data
-----------------
Every row it writes is stamped with ``MARKER`` in ``remarks`` and carries a
``SEED-`` serial-number prefix, so it is always identifiable and removable:

    python manage.py seed_srar_demo_equipment            # create what is missing
    python manage.py seed_srar_demo_equipment --dry-run  # show what it would do
    python manage.py seed_srar_demo_equipment --list     # show current coverage
    python manage.py seed_srar_demo_equipment --undo     # delete every seeded row

Re-running is safe: a category that already has equipment -- seeded or real -- is
skipped, so this never produces duplicates and never touches real CMMS data.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from master.models import Department
from master.utils import get_this_ship
from sfd.models import ShipEquipment
from srar.models import SrarEquipmentTypeList

MARKER = "[SRAR-DEMO-SEED]"
SERIAL_PREFIX = "SEED-"

# Boiler has no known Ch_Master_Equipment_Type id: SWMM's category catalog carries a
# "Boiler" row with a null code, and every numeric code this hull uses already belongs to
# something else (1 Main Engine, 3 Refrigeration Plant, 5 AC Plant, 8 RO Plant, ...).
# Guessing a number risks silently filing boilers under a real, different category the
# next time CMMS syncs, so the seed uses a non-numeric code that cannot collide. Replace
# it here and in the frontend's BOILER_CATEGORY_CODE once CMMS tells us the real id.
BOILER_CATEGORY_CODE = "BOILER"

# (category code, equipment name, nomenclature, location on board, department name hint)
# Codes are the ones the SRAR form filters on; see the category list in
# loadMasterEquipmentsFromBackend().
DEMO_EQUIPMENT = [
    (
        "10",
        "SEWAGE TREATMENT PLANT NO 1",
        "SEWAGE TREATMENT PLANT",
        "AMR No. 2",
        "ENGINEERING",
    ),
    ("19", "GAS TURBINE STBD", "GAS TURBINE", "GT Room", "ENGINEERING"),
    ("20", "H2S SENSOR BILGE FWD", "H2S SENSOR", "Bilge Space", "ENGINEERING"),
    ("26", "TORSION METER STBD SHAFT", "TORSION METER", "Shaft Tunnel", "ENGINEERING"),
    ("29", "ICCP SYSTEM NO 1", "ICCP SYSTEM", "Hull Compartment", "ELECTRICAL"),
    ("30", "MAGAZINE SPRINKLING SYSTEM NO 1", "MFFS", "Magazine Space", "ENGINEERING"),
    (
        "34",
        "GAS TURBINE GENERATOR NO 1",
        "GAS TURBINE GENERATOR",
        "GTG Room",
        "ELECTRICAL",
    ),
    (
        "35",
        "REDUCTION GEAR GT STBD",
        "REDUCTION GEAR (GAS TURBINE)",
        "GT Room",
        "ENGINEERING",
    ),
    (
        "36",
        "REDUCTION GEAR GTG NO 1",
        "REDUCTION GEAR (GTG)",
        "GTG Room",
        "ENGINEERING",
    ),
    (
        BOILER_CATEGORY_CODE,
        "AUXILIARY BOILER NO 1",
        "AUXILIARY BOILER",
        "Boiler Room",
        "ENGINEERING",
    ),
]


class Command(BaseCommand):
    help = (
        "Create placeholder SRAR equipment for categories that have none (demo data)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--undo",
            action="store_true",
            help="Delete every row this command created (matched on the seed marker).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be created or deleted without writing anything.",
        )
        parser.add_argument(
            "--list",
            action="store_true",
            help="Show how many equipment each SRAR category currently has, then exit.",
        )

    # ------------------------------------------------------------------ helpers

    def _linked_counts(self):
        """{category code: number of equipment linked under it}."""
        counts = {}
        for code in SrarEquipmentTypeList.objects.filter(
            equipment_id__isnull=False
        ).values_list("universal_id_ch_master_equipment_type", flat=True):
            if code:
                counts[str(code)] = counts.get(str(code), 0) + 1
        return counts

    def _seeded_equipment(self):
        return ShipEquipment.objects.filter(remarks__contains=MARKER)

    def _department(self, name):
        """Departments are duplicated by case in this database ("ELECTRICAL" and
        "Electrical" both exist); prefer the one that already holds equipment so seeded
        rows land beside the real ones rather than in the near-duplicate."""
        candidates = list(Department.objects.filter(name__iexact=name))
        if not candidates:
            return None
        candidates.sort(
            key=lambda d: ShipEquipment.objects.filter(department=d).count(),
            reverse=True,
        )
        return candidates[0]

    # ------------------------------------------------------------------ actions

    def _do_list(self):
        counts = self._linked_counts()
        seeded = self._seeded_equipment().count()
        self.stdout.write("SRAR category coverage:")
        for code, name, *_ in DEMO_EQUIPMENT:
            n = counts.get(code, 0)
            state = f"{n} linked" if n else "EMPTY"
            self.stdout.write(f"  cat {code:<7} {name[:34]:<34} {state}")
        self.stdout.write(f"\nrows carrying the seed marker: {seeded}")

    def _do_undo(self, dry_run):
        equipment = self._seeded_equipment()
        ids = list(equipment.values_list("id", flat=True))
        links = SrarEquipmentTypeList.objects.filter(equipment_id__in=ids)
        self.stdout.write(
            f"{'Would delete' if dry_run else 'Deleting'} "
            f"{len(ids)} seeded equipment and {links.count()} SRAR link rows."
        )
        for eq in equipment:
            self.stdout.write(f"  - {eq.equipment_name} ({eq.equipment_serial_no})")
        if dry_run:
            return
        # Links first: SrarEquipmentTypeList.equipment_id is a PROTECT-free FK, but
        # deleting them explicitly keeps the intent obvious and the order safe.
        links.delete()
        equipment.delete()
        self.stdout.write(self.style.SUCCESS("Seed data removed."))

    def _do_seed(self, dry_run):
        counts = self._linked_counts()
        ship = get_this_ship()
        if ship is None:
            self.stdout.write(
                self.style.WARNING(
                    "No 'this ship' resolved (master.utils.get_this_ship) — seeded rows "
                    "will have no ship set."
                )
            )

        planned = [row for row in DEMO_EQUIPMENT if not counts.get(row[0])]
        skipped = [row for row in DEMO_EQUIPMENT if counts.get(row[0])]

        for code, name, *_ in skipped:
            self.stdout.write(
                f"  skip  cat {code:<7} already has {counts[code]} equipment"
            )

        if not planned:
            self.stdout.write(
                self.style.SUCCESS(
                    "Every SRAR category already has equipment — nothing to do."
                )
            )
            return

        for index, (code, name, nomenclature, location, dept_name) in enumerate(
            planned, start=1
        ):
            dept = self._department(dept_name)
            serial = f"{SERIAL_PREFIX}{code}-{index:02d}"
            self.stdout.write(
                f"  {'would create' if dry_run else 'create'} cat {code:<7} {name[:38]:<38} "
                f"serial={serial} dept={dept or '-'}"
            )
            if dry_run:
                continue
            ShipEquipment.objects.create(
                ship=ship,
                department=dept,
                equipment_name=name,
                nomenclature=nomenclature,
                # Prefixed so it is obvious in any grid that this is not a CMMS code.
                equipment_code=f"{SERIAL_PREFIX}{code}",
                equipment_serial_no=serial,
                location_on_board=location,
                is_srar=True,
                active=True,
                status="active",
                universal_id_ch_master_equipment_type=code,
                universal_id_m_ship=getattr(ship, "universal_id_m_ship", None),
                remarks=f"{MARKER} placeholder equipment for SRAR category {code}",
            )

        if dry_run:
            self.stdout.write("Dry run — nothing written.")
            return

        # Reuse the real linking path so these rows are indistinguishable from equipment
        # linked through the Add SRAR Equipment screen.
        from swmmapi.views import sync_srar_equipment_links_from_sfd

        created_links = sync_srar_equipment_links_from_sfd()
        self.stdout.write(
            self.style.SUCCESS(
                f"Created {len(planned)} equipment and {created_links} SRAR category links."
            )
        )

    # ------------------------------------------------------------------ entry

    def handle(self, *args, **options):
        if options["list"]:
            self._do_list()
            return

        dry_run = options["dry_run"]
        with transaction.atomic():
            if options["undo"]:
                self._do_undo(dry_run)
            else:
                self._do_seed(dry_run)
            if dry_run:
                transaction.set_rollback(True)
