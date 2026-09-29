import uuid
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone

from master.models import Command as MasterCommand
from master.models import Department, Ship, SubDepartment, UnitType
from sfd.models import (
    CompartmentMaster,
    Equipment,
    EquipmentCategory,
    EquipmentChangeRequest,
    EquipmentCompartmentMapping,
    EquipmentPolicy,
    EquipmentSpecification,
    EquipmentType,
    Generic,
    GenericSpecification,
    RemoveEquipment,
    ReportExportJob,
    SatelliteUnit,
    ShipEquipment,
    Supplier,
    TrialUnit,
)


class Command(BaseCommand):
    help = "Populate every SFD model table with demo data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--count",
            type=int,
            default=10,
            help="Minimum records to create per SFD table. Default: 10.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        count = max(options["count"], 10)
        today = timezone.localdate()

        department = self._ensure_department()
        sub_departments = self._ensure_sub_departments(department, count)
        ship = self._ensure_ship()
        command = self._ensure_command()

        generic_specs = self._ensure_generic_specifications(count)
        generics = self._ensure_generics(generic_specs, count)
        equipment_specs = self._ensure_equipment_specifications(count)
        policies = self._ensure_equipment_policies(count)
        suppliers = self._ensure_suppliers(count)
        equipments = self._ensure_equipment(
            generic_specs,
            generics,
            equipment_specs,
            policies,
            count,
        )
        compartments = self._ensure_compartments(count)
        self._ensure_equipment_compartment_mappings(equipments, compartments, count)
        trial_units = self._ensure_trial_units(count)
        satellite_units = self._ensure_satellite_units(trial_units, command, count)
        categories = self._ensure_equipment_categories(
            trial_units,
            satellite_units,
            command,
            ship,
            count,
        )
        equipment_types = self._ensure_equipment_types(count)
        ship_equipments = self._ensure_ship_equipment(
            ship,
            department,
            sub_departments,
            suppliers,
            equipments,
            categories,
            satellite_units,
            trial_units,
            equipment_types,
            count,
            today,
        )
        self._ensure_change_requests(equipments, ship_equipments, count, today)
        self._ensure_remove_equipment_requests(
            equipments,
            ship_equipments,
            suppliers,
            generics,
            count,
            today,
        )
        self._ensure_report_export_jobs(count)

        self.stdout.write(
            self.style.SUCCESS(
                f"SFD demo data is ready. Ensured at least {count} records for each "
                "SFD model table."
            )
        )

    def _ensure_department(self):
        department, _ = Department.objects.update_or_create(
            code="SFD-DEMO",
            defaults={
                "name": "SFD Demo Department",
                "dep_code": "SFD-DEMO",
                "description": "Department used by SFD populate_db demo data.",
                "universal_id_m_department": "U-SFD-DEMO-DEPT",
            },
        )
        return department

    def _ensure_sub_departments(self, department, count):
        rows = []
        for index in range(1, count + 1):
            uid = f"U-SFD-DEMO-SUB-{index:03d}"
            name = f"SFD Demo Sub Department {index:02d}"
            description = f"SFD demo sub department {index:02d}"
            row_id = self._upsert_sub_department(
                department.id,
                name,
                description,
                uid,
            )
            row = SubDepartment(
                id=row_id,
                department_name=department,
                name=name,
                description=description,
                universal_id_m_sub_department=uid,
                active=True,
                equipment_count=0,
                is_deleted=False,
            )
            rows.append(row)
        return rows

    def _upsert_sub_department(self, department_id, name, description, uid):
        description_column = self._table_column_name(
            "Master_sub_department",
            "Description",
            "description",
        )
        quoted_description = (
            connection.ops.quote_name(description_column)
            if description_column
            else None
        )
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id
                FROM "Master_sub_department"
                WHERE universal_id_m_sub_department = %s
                """,
                [uid],
            )
            row = cursor.fetchone()
            if row:
                if quoted_description:
                    cursor.execute(
                        f"""
                        UPDATE "Master_sub_department"
                        SET department_name_id = %s,
                            name = %s,
                            {quoted_description} = %s,
                            active = %s,
                            equipment_count = %s,
                            is_deleted = %s
                        WHERE id = %s
                        """,
                        [department_id, name, description, True, 0, False, row[0]],
                    )
                else:
                    cursor.execute(
                        """
                        UPDATE "Master_sub_department"
                        SET department_name_id = %s,
                            name = %s,
                            active = %s,
                            equipment_count = %s,
                            is_deleted = %s
                        WHERE id = %s
                        """,
                        [department_id, name, True, 0, False, row[0]],
                    )
                return row[0]

            if quoted_description:
                cursor.execute(
                    f"""
                    INSERT INTO "Master_sub_department"
                        (
                            department_name_id,
                            name,
                            {quoted_description},
                            universal_id_m_sub_department,
                            active,
                            equipment_count,
                            is_deleted
                        )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    [department_id, name, description, uid, True, 0, False],
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO "Master_sub_department"
                        (
                            department_name_id,
                            name,
                            universal_id_m_sub_department,
                            active,
                            equipment_count,
                            is_deleted
                        )
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    [department_id, name, uid, True, 0, False],
                )
            return cursor.fetchone()[0]

    def _table_column_name(self, table_name, *column_names):
        with connection.cursor() as cursor:
            columns = connection.introspection.get_table_description(
                cursor,
                table_name,
            )
        available = {column.name.lower(): column.name for column in columns}
        for column_name in column_names:
            exact_name = available.get(column_name.lower())
            if exact_name:
                return exact_name
        return None

    def _ensure_ship(self):
        unit_type, _ = UnitType.objects.get_or_create(name="SFD Demo Unit Type")
        ship, _ = Ship.objects.update_or_create(
            code="SFD-DEMO-SHIP",
            defaults={
                "name": "SFD Demo Ship",
                "sr_no": "SFD-DEMO-SHIP",
                "ship_external_id": 900001,
                "ship_description": "Demo ship for SFD seed data.",
                "ship_role_description": "SFD demo platform.",
                "unit_type": unit_type,
                "unit_type_string": unit_type.name,
                "universal_id_m_ship": "U-SFD-DEMO-SHIP",
                "active": 1,
            },
        )
        return ship

    def _ensure_command(self):
        command, _ = MasterCommand.objects.update_or_create(
            command_name="SFD Demo Command",
            defaults={
                "unit_name": "SFD Demo Unit",
            },
        )
        return command

    def _ensure_generic_specifications(self, count):
        rows = []
        for index in range(1, count + 1):
            row, _ = GenericSpecification.objects.update_or_create(
                name=f"SFD Demo Generic Specification {index:02d}",
                defaults={},
            )
            rows.append(row)
        return rows

    def _ensure_generics(self, generic_specs, count):
        rows = []
        for index in range(1, count + 1):
            row, _ = Generic.objects.update_or_create(
                code=f"SFD-GEN-{index:03d}",
                defaults={"specification": generic_specs[index - 1]},
            )
            rows.append(row)
        return rows

    def _ensure_equipment_specifications(self, count):
        rows = []
        for index in range(1, count + 1):
            row, _ = EquipmentSpecification.objects.update_or_create(
                name=f"SFD Demo Equipment Specification {index:02d}",
                defaults={},
            )
            rows.append(row)
        return rows

    def _ensure_equipment_policies(self, count):
        rows = []
        for index in range(1, count + 1):
            row, _ = EquipmentPolicy.objects.update_or_create(
                policy=f"SFD Demo Policy {index:02d}",
                defaults={
                    "directive": f"Demo maintenance directive {index:02d}.",
                },
            )
            rows.append(row)
        return rows

    def _ensure_suppliers(self, count):
        rows = []
        for index in range(1, (count * 2) + 1):
            supplier_manufacture = 1 if index <= count else 2
            role_label = "Supplier" if supplier_manufacture == 1 else "Manufacturer"
            row, _ = Supplier.objects.update_or_create(
                Universal_ID_M_Supplier=f"U-SFD-DEMO-SUP-{index:03d}",
                defaults={
                    "SupplierID": f"SFD-SUP-ID-{index:03d}",
                    "SupplierCode": f"SFD-SUP-{index:03d}",
                    "SupplierName": f"SFD Demo {role_label} {index:02d}",
                    "address": f"SFD Demo Address {index:02d}",
                    "AreaStreet": f"Demo Street {index:02d}",
                    "City": "Demo City",
                    "CountryCode": "IN",
                    "CountryID": "IND",
                    "SupplierManufacturer": str(supplier_manufacture),
                    "active": "1",
                    "created_by": "populate_db",
                    "updated_by": "populate_db",
                    "Universal_ID_M_Country": "U-SFD-DEMO-COUNTRY",
                    "Contact_Person": f"Demo Contact {index:02d}",
                    "Contact_Number": f"900000{index:04d}",
                    "Email_ID": f"sfd.{role_label.lower()}{index:02d}@example.com",
                    "supplier_name": f"SFD Demo {role_label} {index:02d}",
                    "supplier_code": f"SFD-SUP-{index:03d}",
                    "supplier_manufacture": supplier_manufacture,
                },
            )
            rows.append(row)
        return rows

    def _ensure_equipment(
        self,
        generic_specs,
        generics,
        equipment_specs,
        policies,
        count,
    ):
        rows = []
        for index in range(1, count + 1):
            row, _ = Equipment.objects.update_or_create(
                universal_id_m_equipment=f"U-SFD-DEMO-EQ-{index:03d}",
                defaults={
                    "equipment_code": f"SFD-EQ-{index:03d}",
                    "ilms_eq_code": f"SFD-ILMS-{index:03d}",
                    "equipment_class": "SFD Demo Class",
                    "model": f"SFD-MODEL-{index:03d}",
                    "maintop_number": f"SFD-MT-{index:03d}",
                    "generic_specification": generic_specs[index - 1],
                    "generic": generics[index - 1],
                    "specification": equipment_specs[index - 1],
                    "policy": policies[index - 1],
                },
            )
            rows.append(row)
        return rows

    def _ensure_compartments(self, count):
        upper_decks = [choice[0] for choice in CompartmentMaster.UpperDeck.choices]
        lower_decks = [choice[0] for choice in CompartmentMaster.LowerDeck.choices]
        locations = [choice[0] for choice in CompartmentMaster.Location.choices]
        rows = []
        for index in range(1, count + 1):
            row, _ = CompartmentMaster.objects.update_or_create(
                name=f"SFD Demo Compartment {index:02d}",
                defaults={
                    "main_deck": index % 2 == 0,
                    "upper_deck": upper_decks[(index - 1) % len(upper_decks)],
                    "lower_deck": lower_decks[(index - 1) % len(lower_decks)],
                    "frame_station_from": index * 10,
                    "frame_station_to": index * 10 + 8,
                    "location": locations[(index - 1) % len(locations)],
                    "is_deleted": False,
                },
            )
            rows.append(row)
        return rows

    def _ensure_equipment_compartment_mappings(self, equipments, compartments, count):
        rows = []
        for index in range(1, count + 1):
            row, _ = EquipmentCompartmentMapping.objects.update_or_create(
                equipment=equipments[index - 1],
                compartment=compartments[index - 1],
                defaults={},
            )
            rows.append(row)
        return rows

    def _ensure_trial_units(self, count):
        rows = []
        for index in range(1, count + 1):
            row, _ = TrialUnit.objects.update_or_create(
                code=f"TR{index:03d}",
                defaults={
                    "name": f"SFD Demo Trial Unit {index:02d}",
                    "description": f"SFD demo trial unit {index:02d}",
                    "sequence": index,
                    "status": 1,
                    "created_ip": "127.0.0.1",
                    "modified_by": "populate_db",
                    "modified_ip": "127.0.0.1",
                },
            )
            rows.append(row)
        return rows

    def _ensure_satellite_units(self, trial_units, command, count):
        rows = []
        for index in range(1, count + 1):
            row, _ = SatelliteUnit.objects.update_or_create(
                code=f"SAT{index:03d}",
                defaults={
                    "trial_unit": trial_units[index - 1],
                    "command": command,
                    "name": f"SFD Demo Satellite Unit {index:02d}",
                    "description": f"SFD demo satellite unit {index:02d}",
                    "sequence": index,
                    "status": 1,
                    "created_ip": "127.0.0.1",
                    "modified_by": "populate_db",
                    "modified_ip": "127.0.0.1",
                },
            )
            rows.append(row)
        return rows

    def _ensure_equipment_categories(
        self,
        trial_units,
        satellite_units,
        command,
        ship,
        count,
    ):
        rows = []
        for index in range(1, count + 1):
            row, _ = EquipmentCategory.objects.update_or_create(
                name=f"SFD Demo Equipment Category {index:02d}",
                defaults={
                    "trial_unit": trial_units[index - 1],
                    "command": command,
                    "satellite_unit": satellite_units[index - 1],
                    "ship": ship,
                    "description": f"SFD demo equipment category {index:02d}",
                },
            )
            rows.append(row)
        return rows

    def _ensure_equipment_types(self, count):
        rows = []
        for index in range(1, count + 1):
            row, _ = EquipmentType.objects.update_or_create(
                Equipment_Type_ID=f"SFD-TYPE-{index:03d}",
                defaults={
                    "Equipment_Desc": f"SFD Demo Equipment Type {index:02d}",
                    "status": "Active",
                    "CMMS_ID": f"CMMS-TYPE-{index:03d}",
                    "CMMS_Ship_ID": "CMMS-SHIP-SFD-DEMO",
                    "Equipment_Category_Code": f"SFD-CAT-{index:03d}",
                    "universal_id_a_user_created_by": "populate_db",
                    "universal_id_a_user_updated_by": "populate_db",
                    "Universal_ID_Ch_Master_Equipment_Type": (
                        f"U-SFD-DEMO-EQTYPE-{index:03d}"
                    ),
                    "order_by": index,
                },
            )
            rows.append(row)
        return rows

    def _ensure_ship_equipment(
        self,
        ship,
        department,
        sub_departments,
        suppliers,
        equipments,
        categories,
        satellite_units,
        trial_units,
        equipment_types,
        count,
        today,
    ):
        rows = []
        category_values = [
            choice[0] for choice in ShipEquipment.TransactionCategory.choices
        ]
        location_values = [choice[0] for choice in ShipEquipment.Location.choices]
        for index in range(1, count + 1):
            parent = equipments[(index % count)]
            mapped_to = f"U-SFD-DEMO-TX-{((index % count) + 1):03d}"
            row, _ = ShipEquipment.objects.update_or_create(
                universal_id_t_equipment_ship_detail=f"U-SFD-DEMO-TX-{index:03d}",
                defaults={
                    "t_equipment_ship_detail": f"SFD-DEMO-TX-{index:03d}",
                    "active": True,
                    "ship": ship,
                    "supplier": suppliers[(index - 1) % len(suppliers)],
                    "equipment_category": categories[index - 1],
                    "satelite_unit": satellite_units[index - 1],
                    "trial_unit": trial_units[index - 1],
                    "department": department,
                    "equipment": equipments[index - 1],
                    "system": parent,
                    "ship_type": "Demo",
                    "equipment_name": f"SFD Demo Ship Equipment {index:02d}",
                    "new_equipment_name": f"SFD Demo New Equipment {index:02d}",
                    "new_system_name": f"SFD Demo System {index:02d}",
                    "equipment_model": f"SFD Ship Model {index:02d}",
                    "equipment_code": f"SFD-SHIP-EQ-{index:03d}",
                    "ilms_eq_code": f"SFD-SHIP-ILMS-{index:03d}",
                    "equipment_direction": "Forward",
                    "equipment_section": f"SFD Section {index:02d}",
                    "parent_equipment": parent,
                    "equipment_type_f_key": equipment_types[index - 1],
                    "sub_department_f_key": sub_departments[index - 1],
                    "status": str((index % 3) + 1),
                    "equipment_serial_no": f"SFD-SN-{index:03d}",
                    "oem_part_no": f"SFD-OEM-{index:03d}",
                    "nomenclature": f"SFD Nomenclature {index:02d}",
                    "location_code": location_values[
                        (index - 1) % len(location_values)
                    ],
                    "location_on_board": f"SFD Demo Location {index:02d}",
                    "compartment": f"SFD Demo Compartment {index:02d}",
                    "deck": str(index),
                    "frame": f"{index * 10}-{index * 10 + 8}",
                    "installation_date": today - timedelta(days=index * 7),
                    "new_installation_date": today + timedelta(days=index),
                    "authority_date": today - timedelta(days=index),
                    "removal_date": today + timedelta(days=index * 5),
                    "no_of_fits": index,
                    "service_life": str(5 + index),
                    "new_service_life": 10 + index,
                    "installation_remarks": "Created by sfd.populate_db",
                    "is_srar": index % 2 == 0,
                    "equipment_type": "Child" if index % 2 else "Parent",
                    "authority_installation": f"SFD-AUTH-INST-{index:03d}",
                    "authority_removal": f"SFD-AUTH-REM-{index:03d}",
                    "authority_of_removal": f"SFD removal authority {index:02d}",
                    "authority_of_installation": f"SFD installation authority {index:02d}",
                    "removal_remarks": f"SFD removal remarks {index:02d}",
                    "removal_remark": f"SFD removal remark {index:02d}",
                    "quantity": index,
                    "remarks": f"SFD ship equipment demo row {index:02d}",
                    "ilms_vendor_code": f"SFD-VENDOR-{index:03d}",
                    "system_status": "Operational",
                    "type": (
                        ShipEquipment.TransactionType.SYSTEM
                        if index % 3 == 0
                        else ShipEquipment.TransactionType.EQUIPMENT
                    ),
                    "category": category_values[(index - 1) % len(category_values)],
                    "mapping_status": (
                        ShipEquipment.MappingStatus.MAPPED
                        if index % 2 == 0
                        else ShipEquipment.MappingStatus.UNMAPPED
                    ),
                    "mapped_to": mapped_to,
                    "mapped_at": timezone.now() - timedelta(days=index),
                    "is_system": index % 3 == 0,
                    "maintop_id": 7000 + index,
                    "manufacturer": suppliers[count + ((index - 1) % count)],
                    "new_supplier_name": f"SFD Demo Supplier {index:02d}",
                    "new_manufacturer_name": f"SFD Demo Manufacturer {index:02d}",
                    "new_nomenclature": f"SFD New Nomenclature {index:02d}",
                    "new_equipment_sr_no": f"SFD-NEW-SN-{index:03d}",
                    "new_oem_part_no": f"SFD-NEW-OEM-{index:03d}",
                    "universal_id_m_ship": ship.universal_id_m_ship,
                    "universal_id_m_equipment": equipments[
                        index - 1
                    ].universal_id_m_equipment,
                    "universal_id_m_srar_type": f"U-SFD-DEMO-SRAR-{index:03d}",
                    "universal_id_m_supplier": suppliers[
                        (index - 1) % len(suppliers)
                    ].Universal_ID_M_Supplier,
                    "universal_id_m_manufacturer": suppliers[
                        count + ((index - 1) % count)
                    ].Universal_ID_M_Supplier,
                    "universal_id_m_equipment_parent": parent.universal_id_m_equipment,
                    "universal_id_m_department": "U-SFD-DEMO-DEPT",
                    "universal_id_t_maintop_header": f"U-SFD-DEMO-MT-{index:03d}",
                    "universal_id_ch_master_equipment_type": equipment_types[
                        index - 1
                    ].Universal_ID_Ch_Master_Equipment_Type,
                    "universal_id_m_sub_department": sub_departments[
                        index - 1
                    ].universal_id_m_sub_department,
                    "rshi": str(100 + index),
                    "eq_rhsi": str(200 + index),
                    "rhsi_updated_until": timezone.now() + timedelta(days=index),
                    "eqp_specs": f"SFD demo equipment specification text {index:02d}",
                    "insma_remarks": f"SFD INSMA remarks {index:02d}",
                    "request_reason": f"SFD request reason {index:02d}",
                    "universal_id_t_ship_detail": f"U-SFD-DEMO-SHIPDET-{index:03d}",
                    "is_synced": index % 2 == 0,
                },
            )
            rows.append(row)
        return rows

    def _ensure_change_requests(self, equipments, ship_equipments, count, today):
        rows = []
        for index in range(1, count + 1):
            row, _ = EquipmentChangeRequest.objects.update_or_create(
                ship_equipment=ship_equipments[index - 1],
                defaults={
                    "equipment": equipments[index - 1],
                    "removal_remark": f"SFD change request remark {index:02d}",
                    "new_serial": f"SFD-CHANGE-SN-{index:03d}",
                    "rh_at_installation": str(300 + index),
                    "approved_reject": (index % 3) + 1,
                    "approved_by": "SFD Demo Approver",
                    "approved_date": today - timedelta(days=index),
                    "amendment_note": f"SFD amendment note {index:02d}",
                    "is_synced": index % 2,
                },
            )
            rows.append(row)
        return rows

    def _ensure_remove_equipment_requests(
        self,
        equipments,
        ship_equipments,
        suppliers,
        generics,
        count,
        today,
    ):
        rows = []
        for index in range(1, count + 1):
            row, _ = RemoveEquipment.objects.update_or_create(
                ship_equipment=ship_equipments[index - 1],
                request_type=1,
                defaults={
                    "equipment": equipments[index - 1],
                    "removal_remark": f"SFD removal request remark {index:02d}",
                    "removal_date": today + timedelta(days=index),
                    "authority_of_removal": f"SFD-AUTH-REM-{index:03d}",
                    "equipment_serial_no": f"SFD-REM-SN-{index:03d}",
                    "installation_date": today - timedelta(days=index * 4),
                    "installation_remark": f"SFD installation remark {index:02d}",
                    "rh_of_new_equipment_at_time_of_installation": 400 + index,
                    "approved_reject": (index % 3) + 1,
                    "approved_by": "SFD Demo Approver",
                    "approved_date": today - timedelta(days=index),
                    "amendment_note": f"SFD removal amendment {index:02d}",
                    "is_synced": index % 2,
                    "supplier": suppliers[(index - 1) % len(suppliers)],
                    "generic": generics[index - 1],
                },
            )
            rows.append(row)
            change_row, _ = RemoveEquipment.objects.update_or_create(
                ship_equipment=ship_equipments[index - 1],
                request_type=2,
                defaults={
                    "equipment": equipments[index - 1],
                    "removal_remark": f"SFD serial change request remark {index:02d}",
                    "removal_date": today + timedelta(days=index + count),
                    "authority_of_removal": f"SFD-AUTH-CHANGE-{index:03d}",
                    "equipment_serial_no": f"SFD-CHANGE-REM-SN-{index:03d}",
                    "installation_date": today - timedelta(days=index * 3),
                    "installation_remark": f"SFD serial change install remark {index:02d}",
                    "rh_of_new_equipment_at_time_of_installation": 500 + index,
                    "approved_reject": (index % 3) + 1,
                    "approved_by": "SFD Demo Approver",
                    "approved_date": today - timedelta(days=index),
                    "amendment_note": f"SFD serial change amendment {index:02d}",
                    "is_synced": (index + 1) % 2,
                    "supplier": suppliers[(index - 1) % len(suppliers)],
                    "generic": generics[index - 1],
                },
            )
            rows.append(change_row)
        return rows

    def _ensure_report_export_jobs(self, count):
        statuses = [choice[0] for choice in ReportExportJob.Status.choices]
        formats = [choice[0] for choice in ReportExportJob.ExportFormat.choices]
        rows = []
        for index in range(1, count + 1):
            job_id = uuid.uuid5(uuid.NAMESPACE_DNS, f"sfd-demo-report-job-{index:03d}")
            row, _ = ReportExportJob.objects.update_or_create(
                id=job_id,
                defaults={
                    "report_key": f"sfd-demo-report-{index:03d}",
                    "export_format": formats[(index - 1) % len(formats)],
                    "status": statuses[(index - 1) % len(statuses)],
                    "file_path": f"sfd/demo/report-{index:03d}.xlsx",
                    "error": "" if index % 4 else "Demo failed export placeholder",
                },
            )
            rows.append(row)
        return rows
