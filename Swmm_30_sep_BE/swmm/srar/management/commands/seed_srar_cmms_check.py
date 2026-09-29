"""Give each SRAR equipment form one row that will actually reach CMMS.

Why this exists
---------------
The SRAR equipment forms each had a row on this ship, but every one of them pointed at
a SWMM-seeded demo equipment with no `t_equipment_ship_detail` -- no CMMS identity. The
push keys its child rows on (header uid, equipment uid), so all it could do with those
rows was skip them, and the matching CMMS tables stayed empty. That left no way to check
the push by looking at CMMS, because there was nothing to look at.

This relinks (or creates) exactly one row per form onto an equipment CMMS genuinely
holds for this ship, and fills the fields that form pushes, so a sync writes a visible
row into every one of those tables.

It picks equipment out of whatever CMMS actually has for the ship in question -- nothing
is hardcoded to one hull -- so it does the same job on another deployment, and an
equipment that only appears once that ship's nomenclature sync has run is picked up on
the next run.

Nothing is written to CMMS here: this only touches SWMM's own SRAR tables. Run the
normal SRAR push afterwards to send the rows across.

    python manage.py seed_srar_cmms_check
    python manage.py seed_srar_cmms_check --header 1e226924-... --dry-run
"""

import datetime

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from sfd.models import ShipEquipment
from sfd.utils import get_mssql_connection
from srar.models import (
    STP,
    GasTurbineExploitation,
    GasTurbineGeneratorExploitation,
    H2SSensor,
    Iccp,
    MagazineFFSystemFloodingSystem,
    ReductionGearExploitation,
    ReductionGearExploitationofGTG,
    SrarMonthlyBoiler,
    SrarMonthlyHeader,
    TorsionMeter,
)

# (label, model, equipment-name keywords, field defaults builder)
#
# The keywords only decide which equipment reads most sensibly on each form. When CMMS
# has nothing matching -- this ship has no ICCP or torsion meter equipment at all, for
# instance -- any other verified equipment is used instead, because the point is to get
# one checkable row into each CMMS table, not to model the ship accurately.
FORMS = [
    ("Boiler", SrarMonthlyBoiler, ("BOILER",)),
    # The half-yearly forms sit on seeded equipment too, so their CMMS tables could not
    # be checked either. They take no sample values here -- only a real equipment link,
    # which is all their push needs to stop skipping them.
    ("GasTurbine", GasTurbineExploitation, ("GAS TURBINE",)),
    ("ReductionGear", ReductionGearExploitation, ("REDUCTION GEAR",)),
    ("GTG", GasTurbineGeneratorExploitation, ("GENERATOR", "GTG")),
    ("GTGReductionGear", ReductionGearExploitationofGTG, ("REDUCTION GEAR",)),
    ("ICCP", Iccp, ("ICCP", "CATHODIC")),
    ("TorsionMeter", TorsionMeter, ("TORSION",)),
    ("H2SSensor", H2SSensor, ("H2S", "SENSOR")),
    ("MagazineSystem", MagazineFFSystemFloodingSystem, ("MAGAZINE", "FLOOD")),
    ("STP", STP, ("STP", "SEWAGE")),
]


def _defaults(label, header, equipment):
    """Sample values for one form's row, chosen so every column the push maps is set.

    A row of NULLs would land in CMMS and prove nothing -- the whole point is to see
    real values arrive -- so each field the push sends gets something plausible.
    """
    month = int(header.srar_month or 1)
    year = int(header.srar_year or datetime.date.today().year)
    in_month = datetime.date(year, month, 1)
    last_year = in_month.replace(year=year - 1)
    next_year = in_month.replace(year=year + 1)
    serial = equipment.equipment_serial_no or str(equipment.t_equipment_ship_detail)

    common = {
        "sfd_details": equipment,
        "serial_no": serial,
        "ops_or_non_ops": 1,  # OPS
        "non_ops_since": None,
    }
    if label == "Boiler":
        return {
            "sfd_details": equipment,
            "serial_no": serial,
            "name": "SRAR CMMS check boiler",
            "hrs_steamed_in_month": "12:30",
            "hrs_steamed_since_commissioning": "1450:00",
            "hrs_above_20_percent": "3:15",
            "highest_salinity_during_month": "0.8",
            "lowest_salinity_during_month": "0.2",
            "last_int_clg_date": last_year,
            "hrs_steamed_since_last_int_clg": "120:00",
            "hrs_steamed_at_last_int_clg": "1330:00",
            "last_ext_clg_date": last_year,
            "hrs_steamed_since_last_ext_clg": "150:00",
            "hrs_steamed_at_last_ext_clg": "1300:00",
            "last_retubing_date": last_year,
            "hrs_steamed_since_last_retubing": "200:00",
            "hrs_steamed_at_last_retubing": "1250:00",
            "date_of_last_durability_test": last_year,
            "due_date_for_next_inspection": next_year,
            "life_assessed_in_months": 24,
        }
    if label == "ICCP":
        return dict(common, nomenclature="ICCP SYSTEM", loc_on_board="HULL")
    if label == "TorsionMeter":
        return dict(
            common,
            nomenclature="TORSION METER",
            loc_on_board="ENGINE ROOM",
            eqpt_code=serial,
            torsion_meter_rdg="42.5",
            max_rpm_achieved="1800",
            last_calibration_date=last_year,
            next_calibration_date=next_year,
        )
    if label == "H2SSensor":
        return dict(
            common,
            nomenclature="H2S SENSOR",
            loc_on_board="TANK TOP",
            last_calibration_date=last_year,
            next_calibration_date=next_year,
        )
    if label == "MagazineSystem":
        return dict(
            common,
            nomenclature="MAGAZINE FF / FLOODING SYSTEM",
            loc_on_board="MAGAZINE",
            status=1,  # SAT
            last_trials_taken=last_year,
            next_trials_due=next_year,
        )
    if label == "STP":
        return dict(
            common,
            nomenclature="SEWAGE TREATMENT PLANT",
            loc_on_board="AUX MACHINERY ROOM",
            effluent_status=1,  # SAT
            effluent_test_date=in_month,
            remarks="Seeded by seed_srar_cmms_check to verify the CMMS push.",
        )
    # Forms with no sample values of their own: linking them to a real equipment is
    # the whole point, since that alone is what stops the push skipping them.
    return {"sfd_details": equipment, "serial_no": serial}


class Command(BaseCommand):
    help = "Point one row of each SRAR equipment form at a real CMMS equipment."

    def add_arguments(self, parser):
        parser.add_argument(
            "--header",
            help=(
                "Universal_ID_T_SRARMthlyHeader or local pk of the return to seed. "
                "Defaults to the most recent return that has a CMMS identity."
            ),
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing anything.",
        )

    def handle(self, *args, **options):
        header = self._resolve_header(options.get("header"))
        ship = header.ship
        if ship is None:
            raise CommandError("That return is not linked to a ship.")

        self.stdout.write(
            f"Return {header.pk} ({header.srar_month}/{header.srar_year}) "
            f"on {ship} -- uid {header.universal_id_t_srar_mthly_header}"
        )

        verified, cmms_names = self._verified_equipment(ship)
        if not verified:
            raise CommandError(
                "CMMS holds no equipment for this ship, so nothing can be linked. "
                "Run the Step 1 nomenclature sync first."
            )
        self.stdout.write(
            f"{len(verified)} of CMMS's {len(cmms_names)} equipment for this ship "
            "are held locally.\n"
        )
        self._report_missing(verified, cmms_names)

        used = set()
        report = []
        with transaction.atomic():
            for label, model, keywords in FORMS:
                equipment = self._pick(verified, keywords, used)
                if equipment is None:
                    report.append((label, "no equipment left to use", None))
                    continue
                used.add(equipment.pk)

                rows = list(
                    model.objects.filter(srar_monthly_header=header).select_related(
                        "sfd_details"
                    )
                )
                already = next(
                    (
                        r
                        for r in rows
                        if getattr(r.sfd_details, "t_equipment_ship_detail", None)
                        in verified
                    ),
                    None,
                )
                if already is not None:
                    used.discard(equipment.pk)
                    report.append(
                        (
                            label,
                            "already linked",
                            already.sfd_details.t_equipment_ship_detail,
                        )
                    )
                    continue

                defaults = _defaults(label, header, equipment)
                # Reuse the form's existing unlinked row rather than adding a second
                # one: the forms show every row they have, and a duplicate would look
                # like real fitted equipment to whoever opens the return.
                target = rows[0] if rows else model(srar_monthly_header=header)
                for field, value in defaults.items():
                    setattr(target, field, value)
                if not options["dry_run"]:
                    target.save()
                report.append(
                    (
                        label,
                        "relinked" if rows else "created",
                        equipment.t_equipment_ship_detail,
                    )
                )

            if options["dry_run"]:
                transaction.set_rollback(True)

        self.stdout.write("")
        for label, action, uid in report:
            self.stdout.write(f"  {label:<16} {action:<18} {uid or ''}")
        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("\nDry run -- nothing saved."))
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    "\nDone. Push this return to CMMS to see the rows land."
                )
            )

    def _resolve_header(self, value):
        queryset = SrarMonthlyHeader.objects.exclude(
            universal_id_t_srar_mthly_header__isnull=True
        ).exclude(universal_id_t_srar_mthly_header="")
        if not value:
            header = queryset.order_by("-srar_year", "-srar_month", "-pk").first()
            if header is None:
                raise CommandError(
                    "No SRAR return has a CMMS identity yet, so none can be pushed. "
                    "Save a return once so it is assigned a universal id."
                )
            return header
        header = queryset.filter(universal_id_t_srar_mthly_header=value).first()
        if header is None and str(value).isdigit():
            header = queryset.filter(pk=int(value)).first()
        if header is None:
            raise CommandError(f"No SRAR return found for {value!r}.")
        return header

    def _verified_equipment(self, ship):
        """{cmms uid: ShipEquipment} for equipment CMMS actually has for this ship.

        Checked against CMMS rather than trusted from the local column: SWMM mints its
        own `SFD-...` identifiers for equipment raised locally, and those look linked
        but resolve to nothing on the CMMS side -- pushing a row against one would leave
        a dangling equipment reference in CMMS.
        """
        candidates = {
            str(uid): pk
            for pk, uid in ShipEquipment.objects.filter(ship=ship)
            .exclude(t_equipment_ship_detail__isnull=True)
            .exclude(t_equipment_ship_detail="")
            .values_list("id", "t_equipment_ship_detail")
        }
        if not candidates:
            return {}

        cursor = get_mssql_connection().cursor()
        ship_uid = getattr(ship, "universal_id_m_ship", None)
        cursor.execute(
            "SELECT esd.Universal_ID_T_EquipmentShipDetail, e.EquipmentName "
            "FROM T_EquipmentShipDetail esd WITH (NOLOCK) "
            "LEFT JOIN M_Equipment e WITH (NOLOCK) "
            "  ON e.Universal_ID_M_Equipment = esd.Universal_ID_M_Equipment "
            "WHERE esd.Universal_ID_M_Ship = ?",
            str(ship_uid),
        )
        names = {str(uid): (name or "") for uid, name in cursor.fetchall()}

        objects = {
            e.pk: e for e in ShipEquipment.objects.filter(pk__in=candidates.values())
        }
        verified = {}
        for uid, pk in candidates.items():
            if uid in names:
                equipment = objects[pk]
                equipment.cmms_name = names[uid]
                verified[uid] = equipment
        return verified, names

    def _report_missing(self, verified, cmms_names):
        """Equipment CMMS has for this ship that SWMM does not hold.

        This is the check that could not be done by hand: a form can only be linked to
        equipment SWMM knows about, so equipment CMMS has and SWMM never synced is
        invisible from inside the app -- and it is exactly the equipment a form would
        otherwise want. Reported per form, since a missing boiler matters to the boiler
        form and to nothing else.
        """
        missing = {uid: name for uid, name in cmms_names.items() if uid not in verified}
        if not missing:
            self.stdout.write("Every CMMS equipment for this ship is held locally.\n")
            return

        self.stdout.write(
            self.style.WARNING(
                f"{len(missing)} equipment exist in CMMS but not in SWMM. "
                "Run the Step 1 nomenclature sync to bring them down."
            )
        )
        for label, _model, keywords in FORMS:
            hits = [
                (uid, name)
                for uid, name in missing.items()
                if any(k in (name or "").upper() for k in keywords)
            ]
            if hits:
                for uid, name in hits[:5]:
                    self.stdout.write(
                        self.style.WARNING(
                            f"    {label:<16} missing: {name} (uid {uid})"
                        )
                    )
        self.stdout.write("")

    def _pick(self, verified, keywords, used):
        """An unused equipment, preferring one CMMS names after this form."""
        for keyword in keywords:
            for equipment in verified.values():
                if equipment.pk in used:
                    continue
                if keyword in (equipment.cmms_name or "").upper():
                    return equipment
        for equipment in verified.values():
            if equipment.pk not in used:
                return equipment
        return None
