from datetime import date, datetime, timezone as dt_timezone
from django.core.management.base import BaseCommand
from django.db.models import Q

from ems.models import EquipmentName
from master.models import Department, MRequiredAssistance, MSeverity
from op_maintenance.models import (
    InitiateDart,
    InitiateRADL,
    CompleteDefectDart,
    DartSpareUsed,
    ServiceMaster,
)


def get_or_create_dept(name, code):
    obj = Department.objects.filter(Q(name__iexact=name) | Q(code__iexact=code)).first()
    if not obj:
        try:
            obj = Department.objects.create(name=name, code=code)
        except Exception:
            obj = Department.objects.first()
    return obj


def get_or_create_severity(code, name):
    obj = MSeverity.objects.filter(
        Q(severity_code__iexact=code) | Q(severity_name__icontains=name)
    ).first()
    if not obj:
        try:
            obj = MSeverity.objects.create(
                severity_code=code, severity_name=name, active=True
            )
        except Exception:
            obj = MSeverity.objects.first()
    return obj


def get_or_create_assistance(name):
    obj = MRequiredAssistance.objects.filter(
        required_assistance_for__icontains=name
    ).first()
    if not obj:
        try:
            obj = MRequiredAssistance.objects.create(
                required_assistance_for=name, active=True
            )
        except Exception:
            obj = MRequiredAssistance.objects.first()
    return obj


def get_or_create_equipment(name):
    obj = EquipmentName.objects.filter(name__iexact=name).first()
    if not obj:
        try:
            obj = EquipmentName.objects.create(name=name)
        except Exception:
            obj = EquipmentName.objects.first()
    return obj


def get_or_create_service(name):
    obj = ServiceMaster.objects.filter(service__iexact=name).first()
    if not obj:
        try:
            obj = ServiceMaster.objects.create(service=name, active=1)
        except Exception:
            obj = ServiceMaster.objects.first()
    return obj


class Command(BaseCommand):
    help = "Populate realistic test data for DART Reports safely"

    def handle(self, *args, **kwargs):
        self.stdout.write("Populating DART Reports test data...")

        # 1. Master objects fetch/create
        dept_logistics = get_or_create_dept("Logistics", "LOG")
        dept_marine = get_or_create_dept("Marine Eng", "ME")

        sev_critical = get_or_create_severity("CRITICAL", "Critical")
        sev_major = get_or_create_severity("MAJOR", "Major")
        sev_minor = get_or_create_severity("MINOR", "Minor")

        req_opdef = get_or_create_assistance("OPDEF (STA)")
        req_opdef_simple = get_or_create_assistance("OPDEF")
        req_services = get_or_create_assistance("Services")
        req_normal = get_or_create_assistance("Normal Defect")

        eq_sea_viper = get_or_create_equipment("Sea Viper Director")
        eq_lo_pump = get_or_create_equipment("LO Pump - ME No.1")
        eq_diesel_alt = get_or_create_equipment("Diesel Alternator")
        eq_diesel_alt_1 = get_or_create_equipment("Diesel Alternator No.1")
        eq_painting = get_or_create_equipment("Painting - Hull")
        eq_sonar = get_or_create_equipment("Sonar Transducer")
        eq_gyro = get_or_create_equipment("Gyro Compass")
        eq_fire_pump = get_or_create_equipment("Fire Main Pump")
        eq_switchboard = get_or_create_equipment("440V Switchboard")
        eq_steering = get_or_create_equipment("Steering Gear")
        eq_compressor = get_or_create_equipment("HP Air Compressor")

        svc_hull = get_or_create_service("Hull Painting")
        svc_crane = get_or_create_service("Dockyard Crane")
        svc_tank = get_or_create_service("Tank Cleaning")

        # 2. Seed Open / In Progress DARTs (DARTs Report)
        open_darts_data = [
            {
                "dart_number": "DART-2026-0142",
                "equipment_ems": eq_sea_viper,
                "require_assistance_for_code": req_opdef,
                "severity_code": sev_critical,
                "status": "OPEN",
                "is_closed": False,
                "dart_date": date(2026, 6, 26),
            },
            {
                "dart_number": "DART-2026-0141",
                "equipment_ems": eq_lo_pump,
                "require_assistance_for_code": req_opdef_simple,
                "severity_code": sev_critical,
                "status": "IN_PROGRESS",
                "is_closed": False,
                "dart_date": date(2026, 6, 26),
            },
            {
                "dart_number": "DART-2026-0138",
                "equipment_ems": eq_diesel_alt,
                "require_assistance_for_code": req_opdef_simple,
                "severity_code": sev_major,
                "status": "IN_PROGRESS",
                "is_closed": False,
                "dart_date": date(2026, 6, 24),
            },
            {
                "dart_number": "DART-2026-0119",
                "equipment_ems": eq_painting,
                "require_assistance_for_code": req_services,
                "severity_code": sev_minor,
                "status": "OPEN",
                "is_closed": False,
                "dart_date": date(2026, 6, 17),
            },
            {
                "dart_number": "DART-2026-0111",
                "equipment_ems": eq_sonar,
                "require_assistance_for_code": req_opdef,
                "severity_code": sev_critical,
                "status": "IN_PROGRESS",
                "is_closed": False,
                "dart_date": date(2026, 6, 13),
            },
        ]

        for item in open_darts_data:
            InitiateDart.objects.update_or_create(
                dart_number=item["dart_number"], defaults=item
            )

        # 3. Seed Closed DARTs (Closed DARTs Report)
        closed_darts_data = [
            {
                "dart_number": "DART-2026-0135",
                "equipment_ems": eq_gyro,
                "require_assistance_for_code": req_normal,
                "severity_code": sev_minor,
                "status": "CLOSED",
                "is_closed": True,
                "dart_date": date(2026, 6, 10),
                "rectification_date": date(2026, 6, 24),
            },
            {
                "dart_number": "DART-2026-0131",
                "equipment_ems": eq_fire_pump,
                "require_assistance_for_code": req_normal,
                "severity_code": sev_minor,
                "status": "CLOSED",
                "is_closed": True,
                "dart_date": date(2026, 6, 8),
                "rectification_date": date(2026, 6, 23),
            },
            {
                "dart_number": "DART-2026-0128",
                "equipment_ems": eq_switchboard,
                "require_assistance_for_code": req_normal,
                "severity_code": sev_major,
                "status": "CLOSED",
                "is_closed": True,
                "dart_date": date(2026, 6, 5),
                "rectification_date": date(2026, 6, 21),
            },
            {
                "dart_number": "DART-2026-0115",
                "equipment_ems": eq_steering,
                "require_assistance_for_code": req_normal,
                "severity_code": sev_minor,
                "status": "CLOSED",
                "is_closed": True,
                "dart_date": date(2026, 6, 1),
                "rectification_date": date(2026, 6, 16),
            },
        ]

        for item in closed_darts_data:
            obj, _ = InitiateDart.objects.update_or_create(
                dart_number=item["dart_number"], defaults=item
            )
            CompleteDefectDart.objects.get_or_create(
                dart_details=obj,
                defaults={
                    "serial_no": f"SR-{obj.pk}",
                    "rectified_date": item["rectification_date"],
                },
            )

        # 4. Seed Service Required Report
        services_data = [
            {
                "dart_number": "SVC-2026-021",
                "service_fkey": svc_hull,
                "defective_discriptions": "Hull Painting",
                "department_id": dept_logistics,
                "defect_type": "SERVICE",
                "status": "IN_PROGRESS",
                "is_closed": False,
                "dart_date": date(2026, 6, 23),
            },
            {
                "dart_number": "SVC-2026-018",
                "service_fkey": svc_crane,
                "defective_discriptions": "Dockyard Crane",
                "department_id": dept_logistics,
                "defect_type": "SERVICE",
                "status": "CLOSED",
                "is_closed": True,
                "dart_date": date(2026, 3, 12),
            },
            {
                "dart_number": "SVC-2026-016",
                "service_fkey": svc_tank,
                "defective_discriptions": "Tank Cleaning",
                "department_id": dept_marine,
                "defect_type": "SERVICE",
                "status": "CLOSED",
                "is_closed": True,
                "dart_date": date(2026, 6, 2),
            },
        ]

        for item in services_data:
            InitiateDart.objects.update_or_create(
                dart_number=item["dart_number"], defaults=item
            )

        # 5. Seed Guarantee Monitoring Report
        guarantee_data = [
            {
                "dart_number": "DART-G-001",
                "equipment_ems": eq_diesel_alt_1,
                "is_guarantee_defect": True,
                "defect_type": "GUARANTEE",
                "supplier": "BHEL",
                "exposure_pct": 82,
                "guarantee_expiry": date(2026, 8, 12),
                "risk": "Red",
                "dart_date": date(2026, 1, 1),
            },
            {
                "dart_number": "DART-G-002",
                "equipment_ems": eq_compressor,
                "is_guarantee_defect": True,
                "defect_type": "GUARANTEE",
                "supplier": "Kirloskar",
                "exposure_pct": 79,
                "guarantee_expiry": date(2026, 8, 30),
                "risk": "Red",
                "dart_date": date(2026, 1, 15),
            },
            {
                "dart_number": "DART-G-003",
                "equipment_ems": eq_sea_viper,
                "is_guarantee_defect": True,
                "defect_type": "GUARANTEE",
                "supplier": "MBDA",
                "exposure_pct": 77,
                "guarantee_expiry": date(2026, 9, 18),
                "risk": "Red",
                "dart_date": date(2026, 2, 1),
            },
            {
                "dart_number": "DART-G-004",
                "equipment_ems": eq_gyro,
                "is_guarantee_defect": True,
                "defect_type": "GUARANTEE",
                "supplier": "Raytheon",
                "exposure_pct": 64,
                "guarantee_expiry": date(2026, 12, 5),
                "risk": "Amber",
                "dart_date": date(2026, 2, 15),
            },
            {
                "dart_number": "DART-G-005",
                "equipment_ems": eq_steering,
                "is_guarantee_defect": True,
                "defect_type": "GUARANTEE",
                "supplier": "Rolls-Royce",
                "exposure_pct": 41,
                "guarantee_expiry": date(2027, 3, 22),
                "risk": "Green",
                "dart_date": date(2026, 3, 1),
            },
        ]

        for item in guarantee_data:
            InitiateDart.objects.update_or_create(
                dart_number=item["dart_number"], defaults=item
            )

        # 6. Seed RA Status Report
        ra_dart_1 = InitiateDart.objects.filter(dart_number="DART-2026-0142").first()
        ra_dart_2 = InitiateDart.objects.filter(dart_number="DART-2026-0138").first()
        ra_dart_3 = InitiateDart.objects.filter(dart_number="DART-G-002").first()
        fallback_dart = InitiateDart.objects.first()

        ra_data = [
            {
                "dl_no": "RA-2026-0051",
                "ra_grup_id": "RA-2026-0051",
                "initiate_dart": ra_dart_1 or fallback_dart,
                "dl_type": "RA",
                "ra_type": "OP RA",
                "routing": "With FMU",
                "authority": "FMU Mumbai",
                "status": "DRAFT",
                "created_date": datetime(2026, 6, 26, 10, 0, tzinfo=dt_timezone.utc),
            },
            {
                "dl_no": "RA-2026-0047",
                "ra_grup_id": "RA-2026-0047",
                "initiate_dart": ra_dart_2 or fallback_dart,
                "dl_type": "RA",
                "ra_type": "Guarantee RA",
                "routing": "With Yard",
                "authority": "Naval Dockyard",
                "status": "GENERATED",
                "created_date": datetime(2026, 6, 24, 10, 0, tzinfo=dt_timezone.utc),
            },
            {
                "dl_no": "RA-2026-0044",
                "ra_grup_id": "RA-2026-0044",
                "initiate_dart": ra_dart_3 or fallback_dart,
                "dl_type": "RA",
                "ra_type": "Yard RA",
                "routing": "Approved",
                "authority": "FMU Mumbai",
                "status": "APPROVED",
                "created_date": datetime(2026, 6, 22, 10, 0, tzinfo=dt_timezone.utc),
            },
        ]

        for item in ra_data:
            InitiateRADL.objects.update_or_create(dl_no=item["dl_no"], defaults=item)

        # 7. Seed Spares Consumed Report
        spares_data = [
            {
                "description": "O-Ring Seal 25mm",
                "pattern_no": "P-98042",
                "quantity": 2,
            },
            {
                "description": "Filter Element Fuel Oil",
                "pattern_no": "P-44120",
                "quantity": 4,
            },
            {
                "description": "Pressure Valve Gasket",
                "pattern_no": "P-11209",
                "quantity": 1,
            },
        ]

        for sp in spares_data:
            try:
                DartSpareUsed.objects.get_or_create(
                    description=sp["description"],
                    defaults=sp,
                )
            except Exception:
                pass

        self.stdout.write(
            self.style.SUCCESS("Successfully populated all DART reports test data!")
        )
