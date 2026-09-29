from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from op_maintenance.models import CompletedRoutine, CompletedRoutineSpare
from ems.models import (
    AddRoutineDetails,
    EquipmentName,
    FussRaiseDetails,
    PlannedRoutineDescription,
    PostCalculateGTG,
    PostCalculateLPC,
    PostEquipmentStateChangeHistorySave,
    RADLMaster,
    RADLRoutineDescription,
    RoutineDescription,
    SectionName,
    UniqueRoutineName,
)
from master.models import (
    Department,
    MRanklist,
    RefitMaintenancePeriod,
    Section,
    SubDepartment,
)
from obs.models import PlannedRoutineSpareList
from sfd.models import Equipment, ShipEquipment


class Command(BaseCommand):
    help = "Comprehensive demo data populator for all EMS, Refit, Fuss, and Planned Routine endpoints across all departments."

    @transaction.atomic
    def handle(self, *args, **options):
        today = timezone.localdate()
        now = timezone.now()
        rank = MRanklist.objects.first()

        departments = list(Department.objects.all())
        if not departments:
            dept, _ = Department.objects.get_or_create(
                code="EMS-RI",
                defaults={
                    "name": "EMS Routine Initialization",
                    "dep_code": "EMS-RI",
                    "description": "EMS routine initialization demo department",
                },
            )
            departments = [dept]

        routine_type_rh, _ = UniqueRoutineName.objects.get_or_create(
            name="EMS RI RUNNING HOUR"
        )
        routine_type_cal, _ = UniqueRoutineName.objects.get_or_create(
            name="EMS RI CALENDAR"
        )
        routine_type_refit_short, _ = UniqueRoutineName.objects.get_or_create(
            name="EMS RI SHORT REFIT"
        )
        routine_type_refit_normal, _ = UniqueRoutineName.objects.get_or_create(
            name="EMS RI NORMAL REFIT"
        )

        created_details = []
        created_routine_objs = []

        for dept in departments:
            sub_dept, _ = SubDepartment.objects.get_or_create(
                name=f"SubDept {dept.name}",
                department_name=dept,
                defaults={"description": f"Sub department for {dept.name}"},
            )

            ems_section, _ = SectionName.objects.get_or_create(
                name=f"EMS Section {dept.name}",
                department=dept,
            )

            master_section, _ = Section.objects.get_or_create(
                name=f"Master Section {dept.name}",
                defaults={"department": dept, "code": f"SEC-{dept.pk}"},
            )
            if master_section.department_id != dept.id:
                master_section.department = dept
                master_section.save(update_fields=["department"])

            # Equipment Specs for this department
            eq_specs = [
                (f"EQ-{dept.pk}-01", f"{dept.name} Main Machinery", 1250.0),
                (f"EQ-{dept.pk}-02", f"{dept.name} Generator Set", 780.0),
                (f"EQ-{dept.pk}-03", f"{dept.name} Auxiliary System", 420.0),
            ]

            dept_equipments = []
            for idx, (code, eq_name, rhsi_val) in enumerate(eq_specs):
                eq_obj, _ = EquipmentName.objects.get_or_create(
                    equipment_code=code,
                    defaults={
                        "name": eq_name,
                        "nomenclature": f"{eq_name} Nomenclature",
                        "section": ems_section,
                        "sub_department": sub_dept,
                        "rhsi": rhsi_val,
                        "state": "ACTIVE",
                        "started_at_location": "AT HARBOUR",
                    },
                )
                eq_obj.section = ems_section
                eq_obj.sub_department = sub_dept
                eq_obj.rhsi = rhsi_val
                eq_obj.state = "ACTIVE"
                eq_obj.save(
                    update_fields=["section", "sub_department", "rhsi", "state"]
                )
                dept_equipments.append(eq_obj)

                # Seed ShipEquipment for AberTriggerListAPIView
                sfd_eq, _ = Equipment.objects.get_or_create(
                    equipment_code=code,
                    defaults={"equipment_class": eq_name},
                )
                install_date = today - timedelta(days=365 * (8 if idx % 2 == 0 else 3))
                ShipEquipment.objects.update_or_create(
                    t_equipment_ship_detail=f"T-EQ-SHIP-{code}",
                    defaults={
                        "equipment": sfd_eq,
                        "equipment_code": code,
                        "section_f_key": master_section,
                        "nomenclature": eq_obj.nomenclature,
                        "equipment_name": eq_name,
                        "installation_date": install_date,
                        "compartment": "ENG-ROOM-01" if idx % 2 == 0 else "AUX-ROOM-02",
                        "status": "active",
                    },
                )

                # Seed Equipment Running History (PostEquipmentStateChangeHistorySave)
                months = ["AUG-2026", "JUL-2026", "JUN-2026"]
                locations = ["AT SEA", "AT HARBOUR", "AT ANCHORAGE"]
                for m_idx, m_name in enumerate(months):
                    st_t = now - timedelta(days=(m_idx * 7) + 2, hours=8)
                    sp_t = st_t + timedelta(hours=12 + m_idx * 2)
                    PostEquipmentStateChangeHistorySave.objects.get_or_create(
                        equipment_name=eq_obj,
                        month_name=m_name,
                        start_time=st_t,
                        defaults={
                            "stop_time": sp_t,
                            "started_at_location": locations[m_idx % len(locations)],
                            "diff_in_hours": 12.0 + m_idx * 2,
                            "entry_creation_date": st_t,
                        },
                    )

                # Seed Slip History (PostCalculateLPC & PostCalculateGTG)
                for s_idx in range(2):
                    c_time = now - timedelta(days=(s_idx * 4) + 1, hours=3)
                    PostCalculateLPC.objects.get_or_create(
                        gt_name=eq_obj,
                        calculation_time=c_time,
                        defaults={
                            "recorded_lpc": round(12.5 + s_idx * 0.5, 2),
                            "recorded_air_pr_after_hpc": round(4.2 + s_idx * 0.2, 2),
                            "recorded_amb_pr_gtinlet": 1.013,
                            "recorded_ext_temp": round(31.0 + s_idx * 1.5, 1),
                            "at_hpc_rpm": 8600.0 + s_idx * 150,
                            "current_amb_temp": round(30.0 + s_idx, 1),
                            "calculated_lpc_slip": round(1.2 + s_idx * 0.1, 2),
                            "calculated_air_slip": round(0.8 + s_idx * 0.05, 2),
                            "calculated_ext_slip": round(0.55 + s_idx * 0.05, 2),
                        },
                    )
                    PostCalculateGTG.objects.get_or_create(
                        gt_name=eq_obj,
                        calculation_time=c_time,
                        defaults={
                            "recorded_el_load": round(460.0 + s_idx * 40, 1),
                            "recorded_ext_temp_gtg": round(380.0 + s_idx * 10, 1),
                            "recorded_amb_temp": round(30.5 + s_idx, 1),
                            "calculated_gtg_slip_ext": round(1.1 + s_idx * 0.1, 2),
                        },
                    )

            # Seed specific routines for this department
            routine_specs = [
                {
                    "maintop_no": f"MT-{dept.pk}-RH",
                    "routine_no": f"ROUTINE-{dept.pk}-RH",
                    "category": "RUNNING HOUR BASED",
                    "frequency": "250H",
                    "frequency_hours": 250,
                    "frequency_months": 0,
                    "equipment": dept_equipments[0],
                    "routine_type": routine_type_rh,
                    "description": f"Running hour routine for {dept.name}",
                    "due_at_rh": "1400",
                    "due_date": today + timedelta(days=12),
                    "is_close": False,
                },
                {
                    "maintop_no": f"MT-{dept.pk}-CAL",
                    "routine_no": f"ROUTINE-{dept.pk}-CAL",
                    "category": "CALENDAR BASED",
                    "frequency": "3M",
                    "frequency_hours": 0,
                    "frequency_months": 3,
                    "equipment": dept_equipments[1],
                    "routine_type": routine_type_cal,
                    "description": f"Calendar quarterly routine for {dept.name}",
                    "due_at_rh": "",
                    "due_date": today + timedelta(days=20),
                    "is_close": False,
                },
                {
                    "maintop_no": f"MT-{dept.pk}-WEEKLY",
                    "routine_no": f"ROUTINE-{dept.pk}-WEEKLY",
                    "category": "CALENDAR BASED",
                    "frequency": "1W",
                    "frequency_hours": 0,
                    "frequency_months": 1,
                    "equipment": dept_equipments[2],
                    "routine_type": routine_type_cal,
                    "description": f"Weekly maintenance check for {dept.name}",
                    "due_at_rh": "",
                    "due_date": today + timedelta(days=2),
                    "is_close": False,
                },
                {
                    "maintop_no": f"MT-{dept.pk}-FORT",
                    "routine_no": f"ROUTINE-{dept.pk}-FORT",
                    "category": "CALENDAR BASED",
                    "frequency": "2W",
                    "frequency_hours": 0,
                    "frequency_months": 1,
                    "equipment": dept_equipments[0],
                    "routine_type": routine_type_cal,
                    "description": f"Fortnightly check for {dept.name}",
                    "due_at_rh": "",
                    "due_date": today + timedelta(days=10),
                    "is_close": False,
                },
                {
                    "maintop_no": f"MT-{dept.pk}-MONTH",
                    "routine_no": f"ROUTINE-{dept.pk}-MONTH",
                    "category": "CALENDAR BASED",
                    "frequency": "1M",
                    "frequency_hours": 0,
                    "frequency_months": 1,
                    "equipment": dept_equipments[1],
                    "routine_type": routine_type_cal,
                    "description": f"Monthly inspection for {dept.name}",
                    "due_at_rh": "",
                    "due_date": today + timedelta(days=22),
                    "is_close": False,
                },
                {
                    "maintop_no": f"MT-{dept.pk}-SIX",
                    "routine_no": f"ROUTINE-{dept.pk}-SIX",
                    "category": "CALENDAR BASED",
                    "frequency": "6M",
                    "frequency_hours": 0,
                    "frequency_months": 6,
                    "equipment": dept_equipments[2],
                    "routine_type": routine_type_cal,
                    "description": f"Six monthly overhaul for {dept.name}",
                    "due_at_rh": "",
                    "due_date": today + timedelta(days=75),
                    "is_close": False,
                },
                {
                    "maintop_no": f"MT-{dept.pk}-ANNUAL",
                    "routine_no": f"ROUTINE-{dept.pk}-ANNUAL",
                    "category": "CALENDAR BASED",
                    "frequency": "1Y",
                    "frequency_hours": 0,
                    "frequency_months": 12,
                    "equipment": dept_equipments[0],
                    "routine_type": routine_type_cal,
                    "description": f"Annual major overhaul for {dept.name}",
                    "due_at_rh": "",
                    "due_date": today + timedelta(days=180),
                    "is_close": False,
                },
                {
                    "maintop_no": f"MT-{dept.pk}-OVERDUE",
                    "routine_no": f"ROUTINE-{dept.pk}-OVERDUE",
                    "category": "CALENDAR BASED",
                    "frequency": "1M",
                    "frequency_hours": 0,
                    "frequency_months": 1,
                    "equipment": dept_equipments[1],
                    "routine_type": routine_type_cal,
                    "description": f"Overdue trigger routine for {dept.name}",
                    "due_at_rh": "",
                    "due_date": today - timedelta(days=10),
                    "is_close": False,
                },
                {
                    "maintop_no": f"MT-{dept.pk}-CLOSED",
                    "routine_no": f"ROUTINE-{dept.pk}-CLOSED",
                    "category": "RUNNING HOUR BASED",
                    "frequency": "100H",
                    "frequency_hours": 100,
                    "frequency_months": 0,
                    "equipment": dept_equipments[2],
                    "routine_type": routine_type_rh,
                    "description": f"Closed routine for {dept.name}",
                    "due_at_rh": "500",
                    "due_date": today - timedelta(days=20),
                    "is_close": True,
                },
                {
                    "maintop_no": f"MT-{dept.pk}-REFIT-01",
                    "routine_no": f"ROUTINE-{dept.pk}-REFIT-01",
                    "category": "ALTERNATE PERIODIC",
                    "frequency": "6M",
                    "frequency_hours": 0,
                    "frequency_months": 6,
                    "equipment": dept_equipments[0],
                    "routine_type": routine_type_refit_short,
                    "description": f"Short refit routine candidate for {dept.name}",
                    "due_at_rh": "",
                    "due_date": today + timedelta(days=40),
                    "is_close": False,
                },
                {
                    "maintop_no": f"MT-{dept.pk}-REFIT-02",
                    "routine_no": f"ROUTINE-{dept.pk}-REFIT-02",
                    "category": "ALTERNATE PERIODIC",
                    "frequency": "1Y",
                    "frequency_hours": 0,
                    "frequency_months": 12,
                    "equipment": dept_equipments[1],
                    "routine_type": routine_type_refit_normal,
                    "description": f"Normal refit routine candidate for {dept.name}",
                    "due_at_rh": "",
                    "due_date": today + timedelta(days=90),
                    "is_close": False,
                },
            ]

            for spec_idx, spec in enumerate(routine_specs):
                add_routine, _ = AddRoutineDetails.objects.update_or_create(
                    maintop_no=spec["maintop_no"],
                    routine_no=spec["routine_no"],
                    defaults={
                        "equipment_name": spec["equipment"],
                        "equipment_code": spec["equipment"].equipment_code,
                        "nomenclature": spec["equipment"].nomenclature,
                        "routine_name": spec["routine_type"],
                        "routine_category": spec["category"],
                        "frequency": spec["frequency"],
                        "frequency_in_hours": spec["frequency_hours"],
                        "frequency_in_months": spec["frequency_months"],
                        "last_routine_completion_date": (
                            now - timedelta(days=30)
                            if spec["category"]
                            in ["CALENDAR BASED", "ALTERNATE PERIODIC"]
                            else None
                        ),
                        "last_routine_completion_atrunning_hrs": (
                            "1200"
                            if spec["category"]
                            in ["RUNNING HOUR BASED", "ALTERNATE PERIODIC"]
                            else None
                        ),
                        "rhs_i": str(spec["equipment"].rhsi or ""),
                        "by_whom": "SHIP STAFF",
                        "remarks": "EMS-DEMO",
                    },
                )

                is_closed_flag = spec.get("is_close", False)
                prev_date = (today - timedelta(days=15)) if is_closed_flag else None
                prev_rh = "1100" if is_closed_flag else None

                detail, _ = RoutineDescription.objects.update_or_create(
                    add_routine_details=add_routine,
                    routine_no=spec["routine_no"],
                    defaults={
                        "equipment_name": spec["equipment"],
                        "routine_name": spec["routine_type"],
                        "maintop_no": spec["maintop_no"],
                        "dart_number": f"DART-{spec['routine_no']}",
                        "routine_description": spec["description"],
                        "by_whom": "SHIP STAFF",
                        "due_date": spec["due_date"],
                        "due_at_rh": spec["due_at_rh"],
                        "previous_completed_date": prev_date,
                        "previous_completed_at_rh": prev_rh,
                        "department_f_key": dept,
                        "is_close": is_closed_flag,
                        "is_dl_draft": True,
                    },
                )

                created_details.append(detail.pk)
                created_routine_objs.append(detail)

                # Seed PlannedRoutineDescription for search_detail_plan/{id} on even specs
                if spec_idx % 2 == 0:
                    planned_desc = PlannedRoutineDescription.objects.filter(
                        routine_description_id=detail
                    ).first()
                    if not planned_desc:
                        planned_desc = PlannedRoutineDescription.objects.create(
                            routine_description_id=detail,
                            spares_required=True,
                            planned_commencement_date=today + timedelta(days=5),
                            is_deleted=False,
                        )
                    elif planned_desc.is_deleted:
                        planned_desc.is_deleted = False
                        planned_desc.save(update_fields=["is_deleted"])

                    try:
                        PlannedRoutineSpareList.objects.get_or_create(
                            planned_routine_description=planned_desc,
                            spare_name="O-Ring Seal Pack",
                            defaults={
                                "part_number": "OR-101",
                                "quantity": 2,
                                "is_deleted": False,
                            },
                        )
                    except Exception:
                        pass
                else:
                    PlannedRoutineDescription.objects.filter(
                        routine_description_id=detail
                    ).delete()

                # Seed FussRaiseDetails for Raised Fuss endpoint (/api/v1/ems/fuss_raised_routines/ & /api/v1/ems/mulraisefuss/)
                if spec["routine_no"].endswith("-OVERDUE") or spec[
                    "routine_no"
                ].endswith("-REFIT-01"):
                    FussRaiseDetails.objects.get_or_create(
                        routine_description_id=detail,
                        defaults={
                            "isclosed_fuss": False,
                            "ship": "INS INSIGNIA",
                            "department": dept.name,
                            "department_f_key": dept,
                            "serial_no": f"FUSS-{dept.pk}-{spec['routine_no']}",
                            "fuss_date": today - timedelta(days=5),
                            "last_undertaken": today - timedelta(days=60),
                            "due_date": spec["due_date"],
                            "schedule_date": today + timedelta(days=15),
                            "equipment": spec["equipment"].name,
                            "location_on_board": "ENGINE ROOM MAIN DECK",
                            "equipment_sr_no": f"SR-{spec['equipment'].equipment_code}",
                            "location_code": "LOC-01",
                            "maintop_no": spec["maintop_no"],
                            "frequency": spec["frequency"],
                        },
                    )

                # Seed Multiple Completed Routine History entries
                timeline_samples = [
                    (
                        today - timedelta(days=60),
                        "800",
                        f"DART-{spec['routine_no']}-HIST1",
                        f"DART-{spec['routine_no']}-01",
                    ),
                    (
                        today - timedelta(days=30),
                        "1000",
                        f"DART-{spec['routine_no']}-HIST2",
                        f"DART-{spec['routine_no']}-02",
                    ),
                    (
                        today - timedelta(days=15),
                        "1200",
                        f"DART-{spec['routine_no']}-HIST3",
                        f"DART-{spec['routine_no']}-03",
                    ),
                ]
                for comp_date, run_hr, old_dart, new_dart in timeline_samples:
                    comp_obj, created = CompletedRoutine.objects.get_or_create(
                        routine=detail,
                        old_dart_number=old_dart,
                        defaults={
                            "new_dart_number": new_dart,
                            "date_of_completion": comp_date,
                            "hours": 4,
                            "minutes": 30,
                            "carried_by": "SHIP STAFF",
                            "p_no": "P-1001",
                            "other_rank": "MECH 1ST CLASS",
                            "rank": rank,
                            "total_manpower": 2,
                            "running_hour": run_hr,
                            "due_running_hour": spec["due_at_rh"] or "1250",
                            "completion_details": (
                                f"Completed routine {spec['routine_no']} for {spec['equipment'].name}"
                            ),
                            "repair_remark": (
                                "Satisfactory performance recorded during trial."
                            ),
                            "trial_team": False,
                        },
                    )
                    if created:
                        CompletedRoutineSpare.objects.create(
                            completed_routine=comp_obj,
                            spare_name="O-Ring Seal Pack",
                        )

        # Ensure ALL existing AddRoutineDetails in DB have child RoutineDescription & PlannedRoutineDescription records
        for ar in AddRoutineDetails.objects.all():
            ar_dept = (
                ar.equipment_name.section.department
                if ar.equipment_name
                and ar.equipment_name.section
                and ar.equipment_name.section.department
                else departments[0]
            )

            ar_updates = []
            if ar.routine_category in ["CALENDAR BASED", "ALTERNATE PERIODIC"]:
                if not ar.last_routine_completion_date:
                    ar.last_routine_completion_date = now - timedelta(days=30)
                    ar_updates.append("last_routine_completion_date")
                if not ar.frequency_in_months or ar.frequency_in_months == 0:
                    ar.frequency_in_months = 3
                    ar_updates.append("frequency_in_months")
            if ar.routine_category in ["RUNNING HOUR BASED", "ALTERNATE PERIODIC"]:
                if not ar.last_routine_completion_atrunning_hrs:
                    ar.last_routine_completion_atrunning_hrs = "1000"
                    ar_updates.append("last_routine_completion_atrunning_hrs")
                if not ar.frequency_in_hours or ar.frequency_in_hours == 0:
                    ar.frequency_in_hours = 250
                    ar_updates.append("frequency_in_hours")
                if ar.equipment_name and (
                    ar.equipment_name.rhsi is None or ar.equipment_name.rhsi == 0
                ):
                    ar.equipment_name.rhsi = 1150.0
                    ar.equipment_name.save(update_fields=["rhsi"])
            if ar_updates:
                ar.save(update_fields=ar_updates)

            existing_rd = RoutineDescription.objects.filter(
                Q(add_routine_details=ar) | Q(maintop_no=ar.maintop_no)
            ).first()
            if not existing_rd and ar.equipment_name and ar.routine_name:
                existing_rd = RoutineDescription.objects.create(
                    add_routine_details=ar,
                    equipment_name=ar.equipment_name,
                    routine_name=ar.routine_name,
                    maintop_no=ar.maintop_no or f"MT-{ar.pk}",
                    dart_number=getattr(ar, "dart_number", None)
                    or f"DART-{ar.routine_no or ar.pk}",
                    routine_no=ar.routine_no or f"ROUTINE-{ar.pk}",
                    routine_description=getattr(ar, "remarks", None)
                    or f"Routine initialization for {ar.routine_name.name}",
                    by_whom=getattr(ar, "by_whom", None) or "SHIP STAFF",
                    due_date=today + timedelta(days=15),
                    due_at_rh=str(ar.frequency_in_hours or "500"),
                    previous_completed_date=None,
                    previous_completed_at_rh=None,
                    department_f_key=ar_dept,
                    is_close=False,
                )
                created_details.append(existing_rd.pk)

            # Ensure PlannedRoutineDescription exists for even AddRoutineDetails, leave odd unplanned for SearchMergedView (/api/v1/ems/search/)
            if existing_rd:
                if ar.pk % 2 == 0:
                    planned_desc = PlannedRoutineDescription.objects.filter(
                        routine_description_id=existing_rd
                    ).first()
                    if not planned_desc:
                        planned_desc = PlannedRoutineDescription.objects.create(
                            routine_description_id=existing_rd,
                            spares_required=True,
                            planned_commencement_date=today + timedelta(days=5),
                            is_deleted=False,
                        )
                    elif planned_desc.is_deleted:
                        planned_desc.is_deleted = False
                        planned_desc.save(update_fields=["is_deleted"])
                else:
                    PlannedRoutineDescription.objects.filter(
                        routine_description_id=existing_rd
                    ).delete()

                # Ensure CompletedRoutine timeline entries exist for EVERY RoutineDescription
                comp_count = CompletedRoutine.objects.filter(
                    routine=existing_rd
                ).count()
                if comp_count == 0:
                    timeline_samples = [
                        (
                            today - timedelta(days=60),
                            "800",
                            f"DART-{existing_rd.routine_no or existing_rd.pk}-HIST1",
                            f"DART-{existing_rd.routine_no or existing_rd.pk}-01",
                        ),
                        (
                            today - timedelta(days=30),
                            "1000",
                            f"DART-{existing_rd.routine_no or existing_rd.pk}-HIST2",
                            f"DART-{existing_rd.routine_no or existing_rd.pk}-02",
                        ),
                        (
                            today - timedelta(days=15),
                            "1200",
                            f"DART-{existing_rd.routine_no or existing_rd.pk}-HIST3",
                            f"DART-{existing_rd.routine_no or existing_rd.pk}-03",
                        ),
                    ]
                    for comp_date, run_hr, old_dart, new_dart in timeline_samples:
                        comp_obj, created = CompletedRoutine.objects.get_or_create(
                            routine=existing_rd,
                            old_dart_number=old_dart,
                            defaults={
                                "new_dart_number": new_dart,
                                "date_of_completion": comp_date,
                                "hours": 4,
                                "minutes": 30,
                                "carried_by": "SHIP STAFF",
                                "p_no": "P-1001",
                                "other_rank": "MECH 1ST CLASS",
                                "rank": rank,
                                "total_manpower": 2,
                                "running_hour": run_hr,
                                "due_running_hour": "1250",
                                "completion_details": (
                                    f"Completed routine {existing_rd.routine_no}"
                                ),
                                "repair_remark": (
                                    "Satisfactory performance recorded during trial."
                                ),
                                "trial_team": False,
                            },
                        )

        # Seed DL-I Generated Reports (RADLMaster & RADLRoutineDescription for /api/v1/ems/generatedl1_list/)
        refit_period, _ = RefitMaintenancePeriod.objects.get_or_create(
            name="SHORT MAINTENANCE PERIOD 2026",
            defaults={"maintenance_period": "REFIT", "occasion": "SMP"},
        )
        radl_master, _ = RADLMaster.objects.get_or_create(
            ra_dl_name="DL-I DEMO MASTER REPORT 2026",
            defaults={
                "dockyard_name": "NSRY DOCKYARD MUMBAI",
                "refit_type_name": refit_period.name,
                "refit_type_f_key": refit_period,
            },
        )
        for idx, r_obj in enumerate(created_routine_objs, start=1):
            RADLRoutineDescription.objects.get_or_create(
                radl_master=radl_master,
                routine_description=r_obj,
                dl_type="DL-I",
                defaults={
                    "dl_no": f"DL-I-{idx:03d}",
                    "dl_key": f"DL-KEY-{idx:03d}",
                    "status": "GENERATED",
                    "ra_grup_id": f"GRP-{idx:03d}",
                    "remarks": "Generated for DL-I defect list demo",
                    "is_active": True,
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                "EMS demo data populated across ALL departments, planned routines, and fuss endpoints successfully! "
                f"{len(created_details)} routine initialization rows, planned routines, timeline histories, running histories, slip histories, raised fuss details, refit candidates, and trigger lists are ready."
            )
        )
