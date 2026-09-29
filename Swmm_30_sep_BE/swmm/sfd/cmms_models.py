"""Unmanaged models mirroring the slice of CMMS's own MSSQL schema that this project's raw-pyodbc
CMMS integration code touches — originally just `sfd/source_contract.py`'s write-back/lookup
functions (`M_Ship`, `M_Equipment`, `M_Supplier`, `T_EquipmentShipDetail`, `T_SFDChangeRequest`,
`Ch_SFD_Remove_Equipment_Request`), now also other apps' CMMS pull-sync code (e.g. `srar`'s
`Ch_Master_Full_Power_Conducted_By`/`M_Lubricant`/`M_ShipClassEEF`) as it's converted from
`cursor.execute(...)` to the ORM. Living in `sfd` rather than each consuming app because
`sfd.utils.get_mssql_connection()` (and now the "cmms" DB alias) was already the shared,
established place this project's CMMS connection logic lives — other apps already depend on it.

CMMS is a separate, externally-owned database (see the "cmms" alias in settings.DATABASES) —
these models exist purely so the ORM (`Model.objects.using("cmms")`) can replace hand-written
pyodbc SQL, not to be migrated by this project: `managed = False` on every Meta means `migrate`
never touches these tables, CMMS's own DBA owns that schema. Column subsets match exactly what
the converted code reads/writes today — CMMS has plenty of other real columns with no local use,
deliberately left off here too (see each call site's own docstring for why).

Every real integer PK below that's a SQL Server IDENTITY column (`ShipID`, `EquipmentID`,
`SupplierID`, `EquipmentShipID`, `ID`, `Ch_SFD_Remove_Equipment_Request_ID`, `EEFID`,
`LubricantID`, `Full_Power_Conducted_By_ID`) is modeled as `AutoField` so the ORM omits it from
INSERTs and lets CMMS assign it, same as the raw SQL never supplied it either.
"""

from django.db import models


class CmmsShip(models.Model):
    ship_id = models.AutoField(primary_key=True, db_column="ShipID")
    ship_sr_no = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True, db_column="ShipSrNo"
    )
    ship_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="ShipCode"
    )
    ship_name = models.CharField(
        max_length=255, null=True, blank=True, db_column="ShipName"
    )
    ship_category_id = models.IntegerField(
        null=True, blank=True, db_column="ShipCategoryID"
    )
    sfd_hierarchy_id = models.IntegerField(
        null=True, blank=True, db_column="SFDHierarchyID"
    )
    class_id = models.IntegerField(null=True, blank=True, db_column="ClassID")
    class_code = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True, db_column="ClassCode"
    )
    commission_date = models.DateTimeField(
        null=True, blank=True, db_column="CommissionDate"
    )
    command_id = models.IntegerField(null=True, blank=True, db_column="CommandID")
    authority_id = models.IntegerField(null=True, blank=True, db_column="AuthorityID")
    ops_code = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True, db_column="OpsCode"
    )
    ship_builder = models.CharField(
        max_length=255, null=True, blank=True, db_column="ShipBuilder"
    )
    decommission_date = models.DateTimeField(
        null=True, blank=True, db_column="DecommissionDate"
    )
    displacement = models.IntegerField(null=True, blank=True, db_column="Displacement")
    hours_underway = models.IntegerField(
        null=True, blank=True, db_column="HoursUnderway"
    )
    distance_run = models.IntegerField(null=True, blank=True, db_column="DistanceRun")
    decommission_scheduled_date = models.DateTimeField(
        null=True, blank=True, db_column="DecommissionScheduledDate"
    )
    propulsion_id = models.IntegerField(null=True, blank=True, db_column="PropulsionID")
    sdrsref = models.CharField(
        max_length=255, null=True, blank=True, db_column="SDRSREF"
    )
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    created_by = models.IntegerField(null=True, blank=True, db_column="CreatedBy")
    created_date = models.DateTimeField(null=True, blank=True, db_column="CreatedDate")
    updated_by = models.IntegerField(null=True, blank=True, db_column="UpdatedBy")
    updated_date = models.DateTimeField(null=True, blank=True, db_column="UpdatedDate")
    yard_no = models.CharField(
        max_length=255, null=True, blank=True, db_column="YardNo"
    )
    reference_no = models.CharField(
        max_length=255, null=True, blank=True, db_column="ReferenceNo"
    )
    classification_society = models.CharField(
        max_length=255, null=True, blank=True, db_column="ClassificationSociety"
    )
    length_overall = models.CharField(
        max_length=255, null=True, blank=True, db_column="LengthOverall"
    )
    length_perpen = models.CharField(
        max_length=255, null=True, blank=True, db_column="LengthPerpen"
    )
    module_breadth = models.CharField(
        max_length=255, null=True, blank=True, db_column="ModuleBreadth"
    )
    wetted_under_water = models.CharField(
        max_length=255, null=True, blank=True, db_column="WettedUnderWater"
    )
    depth_main = models.CharField(
        max_length=255, null=True, blank=True, db_column="DepthMain"
    )
    standard_disp = models.CharField(
        max_length=255, null=True, blank=True, db_column="StandardDisp"
    )
    full_load_disp = models.CharField(
        max_length=255, null=True, blank=True, db_column="FullLoadDisp"
    )
    stand_draft = models.CharField(
        max_length=255, null=True, blank=True, db_column="StandDraft"
    )
    full_load_draft = models.CharField(
        max_length=255, null=True, blank=True, db_column="FullloadDraft"
    )
    wetted_boot_top = models.CharField(
        max_length=255, null=True, blank=True, db_column="WettedBootTop"
    )
    engine_rating = models.CharField(
        max_length=255, null=True, blank=True, db_column="Enginerating"
    )
    max_cont_speed = models.CharField(
        max_length=255, null=True, blank=True, db_column="MaxContSpeed"
    )
    eco_speed = models.CharField(
        max_length=255, null=True, blank=True, db_column="EcoSpeed"
    )
    endurance = models.CharField(
        max_length=255, null=True, blank=True, db_column="Endurance"
    )
    remark = models.CharField(
        max_length=1000, null=True, blank=True, db_column="Remark"
    )
    universal_id_m_ship = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Ship"
    )
    universal_id_m_ship_category = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_ShipCategory"
    )
    universal_id_m_ship_class = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_ShipClass"
    )
    universal_id_m_command = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Command"
    )
    universal_id_m_ops_authority = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_OpsAuthority"
    )
    universal_id_m_propulsion = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Propulsion"
    )
    universal_id_a_user_created_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Created_By",
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Updated_By",
    )
    refit_authority = models.CharField(
        max_length=255, null=True, blank=True, db_column="Refit_Authority"
    )
    signal_name = models.CharField(
        max_length=255, null=True, blank=True, db_column="Signal_Name"
    )
    address = models.CharField(
        max_length=255, null=True, blank=True, db_column="Address"
    )
    contact_number = models.CharField(
        max_length=255, null=True, blank=True, db_column="Contact_Number"
    )
    nud_email_id = models.CharField(
        max_length=255, null=True, blank=True, db_column="NUD_Email_ID"
    )
    nic_email_id = models.CharField(
        max_length=255, null=True, blank=True, db_column="NIC_Email_ID"
    )
    universal_id_m_overseeing_team = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_M_Overseeing_Team",
    )
    is_cmms_install = models.BooleanField(
        null=True, blank=True, db_column="IsCMMSInstall"
    )
    is_in_gd = models.BooleanField(null=True, blank=True, db_column="IsInGD")
    universal_id_m_ship_unit_category = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_M_ShipUnitCategory",
    )
    # Deployment-specific — not every CMMS install has this column (see cmms_columns() in
    # swmmapi/views.py). Declaring it here is safe even where it's absent: Django only touches a
    # field when a query explicitly asks for it (.values("ilms_customer_code")/.only(...)), so
    # code must check cmms_columns("M_Ship") before ever referencing this field in a queryset.
    ilms_customer_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="ILMSCustomerCode"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_Ship"


class CmmsShipCategory(models.Model):
    ship_category_id = models.AutoField(primary_key=True, db_column="ShipCategoryID")
    ship_category_name = models.CharField(
        max_length=255, null=True, blank=True, db_column="ShipCategoryName"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_ShipCategory"


class CmmsShipClass(models.Model):
    class_id = models.AutoField(primary_key=True, db_column="ClassID")
    class_code = models.IntegerField(null=True, blank=True, db_column="ClassCode")
    description = models.CharField(
        max_length=255, null=True, blank=True, db_column="Description"
    )
    universal_id_m_ship_class = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_ShipClass"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_ShipClass"


class CmmsCommand(models.Model):
    command_id = models.AutoField(primary_key=True, db_column="CommandID")
    command_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="CommandCode"
    )
    command_name = models.CharField(
        max_length=255, null=True, blank=True, db_column="CommandName"
    )
    command_ref = models.CharField(
        max_length=255, null=True, blank=True, db_column="CommandRef"
    )
    sfd_hierarchy_id = models.IntegerField(
        null=True, blank=True, db_column="SFDHierarchyID"
    )
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    created_by = models.IntegerField(null=True, blank=True, db_column="CreatedBy")
    created_date = models.DateTimeField(null=True, blank=True, db_column="CreatedDate")
    updated_by = models.IntegerField(null=True, blank=True, db_column="UpdatedBy")
    updated_date = models.DateTimeField(null=True, blank=True, db_column="UpdatedDate")
    universal_id_m_command = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Command"
    )
    universal_id_a_user_created_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Created_By",
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Updated_By",
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_Command"


class CmmsOpsAuthority(models.Model):
    authority_id = models.AutoField(primary_key=True, db_column="AuthorityID")
    ops_authority = models.CharField(
        max_length=255, null=True, blank=True, db_column="OpsAuthority"
    )
    command_id = models.IntegerField(null=True, blank=True, db_column="CommandID")

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_OpsAuthority"


class CmmsPropulsion(models.Model):
    propulsion_id = models.AutoField(primary_key=True, db_column="PropulsionID")
    propulsion_name = models.CharField(
        max_length=255, null=True, blank=True, db_column="PropulsionName"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_Propulsion"


class CmmsDepartment(models.Model):
    department_id = models.AutoField(primary_key=True, db_column="DepartmentID")
    description = models.CharField(
        max_length=255, null=True, blank=True, db_column="Description"
    )
    dept_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="DeptCode"
    )
    sfd_applicable = models.BooleanField(
        null=True, blank=True, db_column="SFDApplicable"
    )
    universal_id_m_department = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Department"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_Department"


class CmmsSubDepartment(models.Model):
    sub_department_id = models.AutoField(primary_key=True, db_column="SubDepartmentID")
    description = models.CharField(
        max_length=255, null=True, blank=True, db_column="Description"
    )
    sub_dept_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="SubDeptCode"
    )
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    universal_id_m_department = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Department"
    )
    universal_id_m_sub_department = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_SubDepartment"
    )
    universal_id_m_ship_class = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_ShipClass"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_SubDepartment"


class CmmsSrarMonthlyEquipment(models.Model):
    srar_mthly_equipment_id = models.AutoField(
        primary_key=True, db_column="SRARMthlyEquipmentID"
    )
    hrs_from_installation = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="HrsFromInstallation",
    )
    rh_last_rh_routien_undertaken = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="RHLastRHRoutienUndertaken",
    )
    universal_id_t_srar_mthly_header = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_T_SRARMthlyHeader",
    )
    universal_id_t_equipment_ship_detail = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_T_EquipmentShipDetail",
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "T_SRARMthlyEquipments"


class CmmsSrarMonthlyHeader(models.Model):
    srar_mthly_id = models.AutoField(primary_key=True, db_column="SrarMthlyID")
    srar_month = models.IntegerField(null=True, blank=True, db_column="SrarMonth")
    srar_year = models.IntegerField(null=True, blank=True, db_column="SrarYear")
    hours_underway_month = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="HoursUnderwayMonth",
    )
    distance_run_month = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="DistanceRunMonth",
    )
    hours_underway_since_commissioning = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="HoursUnderwaySinceCommissioning",
    )
    distance_run_since_commissioning = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="DistanceRunSinceCommissioning",
    )
    max_speed = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True, db_column="MaxSpeed"
    )
    max_duration = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True, db_column="MaxDuration"
    )
    eoname = models.CharField(max_length=255, null=True, blank=True, db_column="EONAME")
    eornak = models.CharField(max_length=255, null=True, blank=True, db_column="EORNAK")
    eo_personal_no = models.CharField(
        max_length=255, null=True, blank=True, db_column="EOPersonalNo"
    )
    eo_contact_no = models.CharField(
        max_length=255, null=True, blank=True, db_column="EOContactNo"
    )
    eo_writter_no = models.CharField(
        max_length=255, null=True, blank=True, db_column="EOWritterNo"
    )
    universal_id_m_ship = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Ship"
    )
    universal_id_t_srar_mthly_header = models.CharField(
        max_length=100, db_column="Universal_ID_T_SRARMthlyHeader"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "T_SRARMthlyHeader"


class CmmsSrarMonthlyShipRunning(models.Model):
    id = models.AutoField(primary_key=True, db_column="ID")
    months = models.CharField(max_length=100, null=True, blank=True, db_column="Months")
    at_sea_in_month = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True, db_column="AtSeaInMonth"
    )
    at_harbour_in_month = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="AtHarbourInMonth",
    )
    remark_of_month = models.CharField(
        max_length=1000, null=True, blank=True, db_column="RemarkOfMonth"
    )
    universal_id_t_srar_mthly_header = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_T_SRARMthlyHeader",
    )
    universal_id_m_ship = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Ship"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "T_SRARMthlyShipRunning"


class CmmsCountry(models.Model):
    country_id = models.AutoField(primary_key=True, db_column="CountryID")
    country_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="CountryCode"
    )
    country_name = models.CharField(
        max_length=255, null=True, blank=True, db_column="CountryName"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_Country"


class CmmsEquipment(models.Model):
    equipment_id = models.AutoField(primary_key=True, db_column="EquipmentID")
    equipment_code = models.CharField(
        max_length=100, null=True, blank=True, db_column="EquipmentCode"
    )
    equipment_name = models.CharField(
        max_length=255, null=True, blank=True, db_column="EquipmentName"
    )
    equipment_model = models.CharField(
        max_length=255, null=True, blank=True, db_column="EquipmentModel"
    )
    universal_id_t_maintop_header = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_MaintopHeader"
    )
    maintop_number = models.IntegerField(
        null=True, blank=True, db_column="MaintopNumber"
    )
    manufacturer_name = models.CharField(
        max_length=255, null=True, blank=True, db_column="ManufacturerName"
    )
    authority = models.CharField(
        max_length=255, null=True, blank=True, db_column="authority"
    )
    obsolete = models.BooleanField(null=True, blank=True, db_column="obsolete")
    acquaint_issued = models.CharField(
        max_length=255, null=True, blank=True, db_column="AcquaintIssued"
    )
    country_id = models.IntegerField(null=True, blank=True, db_column="CountryID")
    group_id = models.IntegerField(null=True, blank=True, db_column="GroupID")
    group_code = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True, db_column="GroupCode"
    )
    generic_sr_no = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True, db_column="GenericSrNo"
    )
    # Deployment-specific — see CmmsShip.ilms_customer_code's comment; only ever referenced in a
    # queryset after checking cmms_columns("M_Equipment") first.
    ilms_equipment_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="ILMSEquipmentCode"
    )
    universal_id_m_equipment = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Equipment"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_Equipment"


class CmmsSupplier(models.Model):
    supplier_id = models.AutoField(primary_key=True, db_column="SupplierID")
    supplier_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="SupplierCode"
    )
    supplier_name = models.CharField(
        max_length=255, null=True, blank=True, db_column="SupplierName"
    )
    supplier_manufacturer = models.IntegerField(
        null=True, blank=True, db_column="SupplierManufacturer"
    )
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    address = models.CharField(
        max_length=255, null=True, blank=True, db_column="Address"
    )
    area_street = models.CharField(
        max_length=255, null=True, blank=True, db_column="AreaStreet"
    )
    city = models.CharField(max_length=255, null=True, blank=True, db_column="City")
    country_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="CountryCode"
    )
    country_id = models.IntegerField(null=True, blank=True, db_column="CountryID")
    universal_id_m_country = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Country"
    )
    contact_person = models.CharField(
        max_length=255, null=True, blank=True, db_column="Contact_Person"
    )
    contact_number = models.CharField(
        max_length=255, null=True, blank=True, db_column="Contact_Number"
    )
    email_id = models.CharField(
        max_length=255, null=True, blank=True, db_column="Email_ID"
    )
    universal_id_m_supplier = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Supplier"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_Supplier"


class CmmsEquipmentSupplier(models.Model):
    equipment_supplier_id = models.AutoField(
        primary_key=True, db_column="EquipmentSupplierID"
    )
    equipment_id = models.IntegerField(null=True, blank=True, db_column="EquipmentID")
    supplier_id = models.IntegerField(null=True, blank=True, db_column="SupplierID")
    supplier_manufacturer = models.IntegerField(
        null=True, blank=True, db_column="SupplierManufacturer"
    )
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    universal_id_t_equipment_supplier = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_T_EquipmentSupplier",
    )
    universal_id_m_supplier = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Supplier"
    )
    universal_id_m_equipment = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Equipment"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "T_EquipmentSupplier"


class CmmsEquipmentShipDetail(models.Model):
    equipment_ship_id = models.AutoField(primary_key=True, db_column="EquipmentShipID")
    universal_id_t_equipment_ship_detail = models.CharField(
        max_length=100, db_column="Universal_ID_T_EquipmentShipDetail"
    )
    universal_id_m_ship = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Ship"
    )
    universal_id_m_department = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Department"
    )
    universal_id_m_sub_department = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_SubDepartment"
    )
    universal_id_m_equipment = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Equipment"
    )
    universal_id_m_srar_type = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_SrarType"
    )
    universal_id_m_supplier_supplier = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_M_Supplier_Supplier",
    )
    universal_id_m_supplier_manufacturer = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_M_Supplier_Manufacturer",
    )
    universal_id_m_equipment_parent_equipment = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_M_Equipment_ParentEquipment",
    )
    ship_id = models.IntegerField(null=True, blank=True, db_column="ShipID")
    ship_sr_no = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True, db_column="ShipSrNo"
    )
    equipment_id = models.IntegerField(null=True, blank=True, db_column="EquipmentID")
    equipment_code = models.CharField(
        max_length=100, null=True, blank=True, db_column="EquipmentCode"
    )
    supplier_id = models.IntegerField(null=True, blank=True, db_column="SupplierID")
    manufacturer_id = models.IntegerField(
        null=True, blank=True, db_column="ManufacturerID"
    )
    nomenclature = models.CharField(
        max_length=100, null=True, blank=True, db_column="Nomenclature"
    )
    installation_date = models.DateField(
        null=True, blank=True, db_column="InstallationDate"
    )
    equipment_sr_no = models.CharField(
        max_length=255, null=True, blank=True, db_column="EquipmentSrNo"
    )
    location_on_board = models.CharField(
        max_length=255, null=True, blank=True, db_column="LocationOnBoard"
    )
    location_code = models.CharField(
        max_length=100, null=True, blank=True, db_column="LocationCode"
    )
    srar_applicable = models.BooleanField(
        null=True, blank=True, db_column="SRARApplicable"
    )
    authority_of_installation = models.CharField(
        max_length=500, null=True, blank=True, db_column="Authority_of_Installation"
    )
    no_of_fits = models.IntegerField(null=True, blank=True, db_column="NoOfFits")
    removal_date = models.DateField(null=True, blank=True, db_column="RemovalDate")
    oem_part_no = models.CharField(
        max_length=255, null=True, blank=True, db_column="OEMPartNo"
    )
    remark = models.TextField(null=True, blank=True, db_column="Remark")
    maintop_id = models.IntegerField(null=True, blank=True, db_column="MaintopID")
    service_life = models.CharField(
        max_length=100, null=True, blank=True, db_column="ServiceLife"
    )
    removal_remark = models.CharField(
        max_length=1000, null=True, blank=True, db_column="Removal_Remark"
    )
    authority_of_removal = models.CharField(
        max_length=500, null=True, blank=True, db_column="Authority_Of_Removal"
    )
    rh_of_new_equipment_at_time_of_installation = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        db_column="RH_Of_New_Equipemnt_At_Time_Of_Installation",
    )
    insma_remarks = models.TextField(null=True, blank=True, db_column="INSMAREMARKS")
    status = models.IntegerField(null=True, blank=True, db_column="Status")
    is_synced = models.BooleanField(null=True, blank=True, db_column="IsSynced")

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "T_EquipmentShipDetail"


class CmmsSfdChangeRequest(models.Model):
    id = models.AutoField(primary_key=True, db_column="ID")
    equipment_ship_id = models.IntegerField(
        null=True, blank=True, db_column="EquipmentShipId"
    )
    equipment = models.CharField(
        max_length=255, null=True, blank=True, db_column="Equipment"
    )
    model = models.CharField(max_length=255, null=True, blank=True, db_column="Model")
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    universal_id_t_sfd_change_request = models.CharField(
        max_length=100, db_column="Universal_ID_T_SFDChangeRequest"
    )
    universal_id_t_equipment_ship_detail = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_T_EquipmentShipDetail",
    )
    universal_id_a_user_created_by = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Created_By",
    )
    is_synced = models.BooleanField(null=True, blank=True, db_column="IsSynced")
    approved_by = models.IntegerField(null=True, blank=True, db_column="ApprovedBy")
    approved_date = models.DateTimeField(
        null=True, blank=True, db_column="ApprovedDate"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "T_SFDChangeRequest"


class CmmsRemoveEquipmentRequest(models.Model):
    id = models.AutoField(
        primary_key=True, db_column="Ch_SFD_Remove_Equipment_Request_ID"
    )
    universal_id_t_equipment_ship_detail = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_T_EquipmentShipDetail",
    )
    universal_id_ch_sfd_remove_equipment_request = models.CharField(
        max_length=100, db_column="Universal_ID_Ch_SFD_Remove_Equipment_Request"
    )
    removal_date = models.DateField(null=True, blank=True, db_column="Removal_Date")
    removal_remark = models.CharField(
        max_length=1000, null=True, blank=True, db_column="Removal_Remark"
    )
    authority_of_removal = models.CharField(
        max_length=500, null=True, blank=True, db_column="Authority_Of_Removal"
    )
    equipment_serial_no = models.CharField(
        max_length=255, null=True, blank=True, db_column="Equipment_Serial_No"
    )
    authority_of_installation = models.CharField(
        max_length=500, null=True, blank=True, db_column="Authority_Of_Installation"
    )
    rh_of_new_equipment_at_time_of_installation = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        db_column="RH_Of_New_Equipemnt_At_Time_Of_Installation",
    )
    request_type = models.IntegerField(null=True, blank=True, db_column="Request_Type")
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    installation_date = models.DateField(
        null=True, blank=True, db_column="InstallationDate"
    )
    installation_remark = models.CharField(
        max_length=1000, null=True, blank=True, db_column="InstallationRemark"
    )
    is_synced = models.BooleanField(null=True, blank=True, db_column="IsSynced")

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "Ch_SFD_Remove_Equipment_Request"


class CmmsFullPowerConductedBy(models.Model):
    full_power_conducted_by_id = models.AutoField(
        primary_key=True, db_column="Full_Power_Conducted_By_ID"
    )
    full_power_conducted_by = models.CharField(
        max_length=255, null=True, blank=True, db_column="Full_Power_Conducted_By"
    )
    status = models.IntegerField(null=True, blank=True, db_column="Status")
    universal_id_ch_master_full_power_conducted_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_Ch_Master_Full_Power_Conducted_By",
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "Ch_Master_Full_Power_Conducted_By"


class CmmsLubricant(models.Model):
    lubricant_id = models.AutoField(primary_key=True, db_column="LubricantID")
    lubricant_type = models.CharField(
        max_length=255, null=True, blank=True, db_column="LubricantType"
    )
    lubricant_name = models.CharField(
        max_length=255, null=True, blank=True, db_column="LubricantName"
    )
    unit = models.CharField(max_length=100, null=True, blank=True, db_column="Unit")
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    lubricant_code = models.CharField(
        max_length=100, null=True, blank=True, db_column="LubricantCode"
    )
    universal_id_m_lubricant = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Lubricant"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_Lubricant"


class CmmsShipClassEef(models.Model):
    eef_id = models.AutoField(primary_key=True, db_column="EEFID")
    class_id = models.IntegerField(null=True, blank=True, db_column="ClassId")
    eef_value = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True, db_column="EEFValue"
    )
    active = models.BooleanField(null=True, blank=True, db_column="Active")

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_ShipClassEEF"


# --- swmmapi's defect/DART master lookups (CMMSFDDataAPI._DEFECT_MASTERS) ---
# Originally read with `SELECT *` on purpose, since these 5 tables' schemas differ between CMMS
# deployments and MSSQL rejects the whole statement on the first unknown column name — an
# explicit, fixed field list can't replicate that per-deployment tolerance the way `SELECT *`
# did, so declaring these as ordinary models is a deliberate (and only) narrowing of behavior in
# the swmmapi conversion: a deployment whose copy of one of these tables is missing a column
# below would now hard-fail that fetch instead of just not having the column in the row dict.


class CmmsChMasterSymptoms(models.Model):
    symptom_id = models.AutoField(primary_key=True, db_column="Symptom_ID")
    symptom_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="Symptom_Code"
    )
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    created_by = models.IntegerField(null=True, blank=True, db_column="CreatedBy")
    created_date = models.DateTimeField(null=True, blank=True, db_column="CreatedDate")
    updated_by = models.IntegerField(null=True, blank=True, db_column="UpdatedBy")
    updated_date = models.DateTimeField(null=True, blank=True, db_column="UpdatedDate")
    department_id = models.IntegerField(null=True, blank=True, db_column="DepartmentID")
    universal_id_m_department = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Department"
    )
    universal_id_ch_master_symptoms = models.CharField(
        max_length=100, db_column="Universal_ID_Ch_Master_Symptoms"
    )
    universal_id_a_user_created_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Created_By",
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Updated_By",
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "Ch_Master_Symptoms"


class CmmsMSeverity(models.Model):
    severity_id = models.AutoField(primary_key=True, db_column="SeverityID")
    severity_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="SeverityCode"
    )
    severity_name = models.CharField(
        max_length=255, null=True, blank=True, db_column="SeverityName"
    )
    isms_severity_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="ISMSSeverityCode"
    )
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    created_by = models.IntegerField(null=True, blank=True, db_column="CreatedBy")
    created_date = models.DateTimeField(null=True, blank=True, db_column="CreatedDate")
    updated_by = models.IntegerField(null=True, blank=True, db_column="UpdatedBy")
    updated_date = models.DateTimeField(null=True, blank=True, db_column="UpdatedDate")
    universal_id_m_severity = models.CharField(
        max_length=100, db_column="Universal_ID_M_Severity"
    )
    universal_id_a_user_created_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Created_By",
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Updated_By",
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_Severity"


class CmmsChMasterOtherShipRemarksBy(models.Model):
    # A decimal-typed PK on CMMS's side (not a true int IDENTITY) — AutoField assumes
    # auto-increment integer semantics, so this stays a plain DecimalField; nothing here ever
    # writes to this table, only reads, so omitting it from an INSERT never comes up.
    ship_remarks_id = models.DecimalField(
        max_digits=18, decimal_places=0, primary_key=True, db_column="ShipRemarksID"
    )
    description = models.CharField(
        max_length=255, null=True, blank=True, db_column="Description"
    )
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    universal_id_ch_master_other_ship_remarks_by = models.CharField(
        max_length=100, db_column="Universal_ID_Ch_Master_Other_Ship_Remarks_By"
    )
    universal_id_a_user_created_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Created_By",
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Updated_By",
    )
    created_date = models.DateTimeField(null=True, blank=True, db_column="CreatedDate")
    updated_date = models.DateTimeField(null=True, blank=True, db_column="UpdatedDate")

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "Ch_Master_Other_Ship_Remarks_By"


class CmmsChMasterShipRemarksBy(models.Model):
    # Decimal PK — same reasoning as CmmsChMasterOtherShipRemarksBy.ship_remarks_id.
    ship_remark_by_id = models.DecimalField(
        max_digits=18, decimal_places=0, primary_key=True, db_column="Ship_Remark_By_ID"
    )
    description = models.CharField(
        max_length=255, null=True, blank=True, db_column="Description"
    )
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    universal_id_ch_master_ship_remarks_by = models.CharField(
        max_length=100, db_column="Universal_ID_Ch_Master_Ship_Remarks_By"
    )
    universal_id_a_user_created_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Created_By",
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Updated_By",
    )
    created_date = models.DateTimeField(null=True, blank=True, db_column="CreatedDate")
    updated_date = models.DateTimeField(null=True, blank=True, db_column="UpdatedDate")

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "Ch_Master_Ship_Remarks_By"


class CmmsMRepairAgency(models.Model):
    repair_agency_id = models.AutoField(primary_key=True, db_column="RepairAgencyID")
    repair_agency_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="RepairAgencyCode"
    )
    repair_agency_name = models.CharField(
        max_length=255, null=True, blank=True, db_column="RepairAgencyName"
    )
    isms_repair_agency_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="ISMSRepairAgencyCode"
    )
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    created_by = models.IntegerField(null=True, blank=True, db_column="CreatedBy")
    created_date = models.DateTimeField(null=True, blank=True, db_column="CreatedDate")
    updated_by = models.IntegerField(null=True, blank=True, db_column="UpdatedBy")
    updated_date = models.DateTimeField(null=True, blank=True, db_column="UpdatedDate")
    universal_id_m_repair_agency = models.CharField(
        max_length=100, db_column="Universal_ID_M_RepairAgency"
    )
    universal_id_a_user_created_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Created_By",
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Updated_By",
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_RepairAgency"


# --- swmmapi's CMMSMaintopSyncAPI (STEP 2 — fleet-wide Maintop header/routine sync) ---


class CmmsMaintopHeader(models.Model):
    maintop_id = models.IntegerField(primary_key=True, db_column="MaintopID")
    maintop_no = models.IntegerField(null=True, blank=True, db_column="MaintopNo")
    maintop_title = models.CharField(
        max_length=500, null=True, blank=True, db_column="MaintopTitle"
    )
    original_date = models.DateTimeField(
        null=True, blank=True, db_column="OriginalDate"
    )
    amendment_no = models.IntegerField(null=True, blank=True, db_column="AmendmentNo")
    amendment_date = models.DateTimeField(
        null=True, blank=True, db_column="AmendmentDate"
    )
    authority = models.CharField(
        max_length=255, null=True, blank=True, db_column="Authority"
    )
    flag = models.IntegerField(null=True, blank=True, db_column="Flag")
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    created_by = models.IntegerField(null=True, blank=True, db_column="CreatedBy")
    created_date = models.DateTimeField(null=True, blank=True, db_column="CreatedDate")
    updated_by = models.IntegerField(null=True, blank=True, db_column="UpdatedBy")
    updated_date = models.DateTimeField(null=True, blank=True, db_column="UpdatedDate")
    reference = models.CharField(
        max_length=255, null=True, blank=True, db_column="Reference"
    )
    department = models.CharField(
        max_length=255, null=True, blank=True, db_column="Department"
    )
    is_non_digitized = models.BooleanField(
        null=True, blank=True, db_column="IsNonDigitized"
    )
    fuss_id = models.IntegerField(null=True, blank=True, db_column="FussID")
    # Real CMMS column is "Equipmentcode" (lowercase c) — kept exact rather than "corrected" to
    # "EquipmentCode", since swmmapi's own _header_instance() already reads row.get("EquipmentCode")
    # (capital C) and has never matched this column; preserving that mismatch keeps this
    # conversion behavior-identical to the raw SQL it replaces rather than silently fixing a bug
    # that's out of scope here.
    equipmentcode = models.CharField(
        max_length=255, null=True, blank=True, db_column="Equipmentcode"
    )
    equipment_specification = models.CharField(
        max_length=255, null=True, blank=True, db_column="EquipmentSpecification"
    )
    ship_applicable = models.CharField(
        max_length=255, null=True, blank=True, db_column="ShipApplicable"
    )
    documents = models.CharField(
        max_length=255, null=True, blank=True, db_column="Documents"
    )
    reason = models.CharField(max_length=255, null=True, blank=True, db_column="Reason")
    issue_date = models.DateTimeField(null=True, blank=True, db_column="IssueDate")
    universal_id_a_user_created_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Created_By",
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Updated_By",
    )
    universal_id_t_maintopheader = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_MaintopHeader"
    )
    universal_id_t_fuss = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_Fuss"
    )
    # Real column is "Authority_Date" — same pre-existing-mismatch situation as equipmentcode
    # above (_header_instance reads row.get("AuthorityDate"), no underscore).
    authority_date = models.DateTimeField(
        null=True, blank=True, db_column="Authority_Date"
    )
    # Real column is "Is_Draft" — same situation (_header_instance reads row.get("IsDraft")).
    is_draft = models.IntegerField(null=True, blank=True, db_column="Is_Draft")

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "T_MaintopHeader"


class CmmsMaintopDetail(models.Model):
    routine_id = models.IntegerField(primary_key=True, db_column="RoutineID")
    routine_no = models.IntegerField(null=True, blank=True, db_column="RoutineNo")
    routine_description = models.CharField(
        max_length=1000, null=True, blank=True, db_column="RoutineDescription"
    )
    routine_brief_description = models.CharField(
        max_length=1000, null=True, blank=True, db_column="RoutineBriefDescription"
    )
    maintop_id = models.IntegerField(null=True, blank=True, db_column="MaintopID")
    maintop_no = models.IntegerField(null=True, blank=True, db_column="MaintopNo")
    amendment_no = models.IntegerField(null=True, blank=True, db_column="AmendmentNo")
    frequency_id = models.IntegerField(null=True, blank=True, db_column="FrequencyID")
    frequency = models.CharField(
        max_length=255, null=True, blank=True, db_column="Frequency"
    )
    frequency_sr_no = models.IntegerField(
        null=True, blank=True, db_column="FrequencySrNo"
    )
    group_heading = models.CharField(
        max_length=255, null=True, blank=True, db_column="GroupHeading"
    )
    para_heading = models.CharField(
        max_length=255, null=True, blank=True, db_column="ParaHeading"
    )
    alternate_info = models.CharField(
        max_length=255, null=True, blank=True, db_column="AlternateInfo"
    )
    by_whom = models.CharField(
        max_length=255, null=True, blank=True, db_column="ByWhom"
    )
    category = models.CharField(
        max_length=255, null=True, blank=True, db_column="Category"
    )
    dockyard_remarks = models.CharField(
        max_length=1000, null=True, blank=True, db_column="DockyardRemarks"
    )
    admin_remarks = models.CharField(
        max_length=1000, null=True, blank=True, db_column="AdminRemarks"
    )
    jic_id = models.IntegerField(null=True, blank=True, db_column="JICID")
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    created_by = models.IntegerField(null=True, blank=True, db_column="CreatedBy")
    created_date = models.DateTimeField(null=True, blank=True, db_column="CreatedDate")
    updated_by = models.IntegerField(null=True, blank=True, db_column="UpdatedBy")
    updated_date = models.DateTimeField(null=True, blank=True, db_column="UpdatedDate")
    amendment_date = models.DateTimeField(
        null=True, blank=True, db_column="AmendmentDate"
    )
    by_whom_id1 = models.IntegerField(null=True, blank=True, db_column="ByWhomId1")
    by_whom_id2 = models.IntegerField(null=True, blank=True, db_column="ByWhomId2")
    by_whom_id3 = models.IntegerField(null=True, blank=True, db_column="ByWhomId3")
    freq_priority = models.IntegerField(null=True, blank=True, db_column="FreqPriority")
    universal_id_a_user_created_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Created_By",
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Updated_By",
    )
    universal_id_t_maintopdetail = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_MaintopDetail"
    )
    universal_id_t_maintopheader = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_MaintopHeader"
    )
    universal_id_m_frequency = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Frequency"
    )
    universal_id_t_maintopjic = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_MaintopJIC"
    )
    universal_id_m_bywhom1 = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_ByWhom1"
    )
    universal_id_m_bywhom2 = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_ByWhom2"
    )
    universal_id_m_bywhom3 = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_ByWhom3"
    )
    jic = models.CharField(max_length=255, null=True, blank=True, db_column="JIC")
    ss_proposal = models.CharField(
        max_length=1000, null=True, blank=True, db_column="SSProposal"
    )
    applicable_eqpt = models.CharField(
        max_length=1000, null=True, blank=True, db_column="ApplicableEqpt"
    )
    insma_recommendations = models.CharField(
        max_length=1000, null=True, blank=True, db_column="INSMARecommendations"
    )
    remarks = models.CharField(
        max_length=1000, null=True, blank=True, db_column="Remarks"
    )
    reason = models.CharField(max_length=255, null=True, blank=True, db_column="Reason")
    routine_type = models.CharField(
        max_length=255, null=True, blank=True, db_column="RoutineType"
    )
    ship_id = models.IntegerField(null=True, blank=True, db_column="Ship_ID")
    comment = models.CharField(
        max_length=1000, null=True, blank=True, db_column="Comment"
    )
    remove_reason = models.CharField(
        max_length=1000, null=True, blank=True, db_column="Remove_Reason"
    )
    is_synced = models.IntegerField(null=True, blank=True, db_column="IsSynced")

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "T_MaintopDetail"


class CmmsFrequency(models.Model):
    frequency_id = models.AutoField(primary_key=True, db_column="FrequencyID")
    frequency = models.CharField(
        max_length=255, null=True, blank=True, db_column="Frequency"
    )
    description = models.CharField(
        max_length=255, null=True, blank=True, db_column="Description"
    )
    hours = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True, db_column="Hours"
    )
    months = models.IntegerField(null=True, blank=True, db_column="Months")
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    universal_id_m_frequency = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Frequency"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "M_Frequency"


class CmmsDart(models.Model):
    """CMMS's own defect/routine-occurrence log (T_Dart) — has 100+ real columns; only the ones
    read by MissingRoutinesAPIView's Step 4 (fetch_cmms_nomenclature_routines) and
    CMMSDefectDataAPI's open-defects listing are modeled here so far. More fields belong here as
    the remaining raw-SQL DART fetch/write-back call sites get converted too.
    """

    dart_id = models.AutoField(primary_key=True, db_column="DartID")
    dart_number = models.CharField(
        max_length=100, null=True, blank=True, db_column="DartNumber"
    )
    dart_date = models.DateTimeField(null=True, blank=True, db_column="DartDate")
    defect_date = models.DateTimeField(null=True, blank=True, db_column="DefectDate")
    schedule_date = models.DateTimeField(
        null=True, blank=True, db_column="ScheduleDate"
    )
    routine_due_date = models.DateTimeField(
        null=True, blank=True, db_column="RoutineDueDate"
    )
    rectified_date = models.DateTimeField(
        null=True, blank=True, db_column="RectifiedDate"
    )
    running_hour_which_routine_completed = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="Running_Hour_Which_Routine_Completed",
    )
    next_routine_due_at_running_hours = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="Next_Routine_Due_At_Running_Hours",
    )
    routine_carried_out_by = models.CharField(
        max_length=255, null=True, blank=True, db_column="RoutineCarriedOutBy"
    )
    routine_id = models.IntegerField(null=True, blank=True, db_column="RoutineID")
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    is_routine = models.SmallIntegerField(null=True, blank=True, db_column="Is_Routine")
    is_defect = models.SmallIntegerField(null=True, blank=True, db_column="Is_Defect")
    is_closed = models.IntegerField(null=True, blank=True, db_column="IsClosed")
    is_operational = models.SmallIntegerField(
        null=True, blank=True, db_column="Is_Operational"
    )
    is_ost_observation = models.IntegerField(
        null=True, blank=True, db_column="IsOstObservation"
    )
    is_gd_form = models.IntegerField(null=True, blank=True, db_column="IsGDForm")
    routine_defect = models.SmallIntegerField(
        null=True, blank=True, db_column="RoutineDefect"
    )
    serial_number = models.IntegerField(
        null=True, blank=True, db_column="Serial_Number"
    )
    severity_id = models.IntegerField(null=True, blank=True, db_column="SeverityID")
    severity_code = models.CharField(
        max_length=100, null=True, blank=True, db_column="SeverityCode"
    )
    defective_component = models.CharField(
        max_length=500, null=True, blank=True, db_column="DefectiveComponent"
    )
    remarks = models.CharField(
        max_length=1000, null=True, blank=True, db_column="Remarks"
    )
    defect_description = models.CharField(
        max_length=1000, null=True, blank=True, db_column="DefectDescription"
    )
    universal_id_ch_master_symptoms = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_Ch_Master_Symptoms",
    )
    universal_id_m_severity = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Severity"
    )
    universal_id_ch_master_ship_remarks_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_Ch_Master_Ship_Remarks_By",
    )
    universal_id_m_required_assistance = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_M_RequiredAssistance",
    )
    universal_id_t_ref_comp = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_RefComp"
    )
    universal_id_t_dart = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_Dart"
    )
    universal_id_m_ship = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Ship"
    )
    universal_id_m_department = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Department"
    )
    universal_id_t_equipment_ship_detail = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_T_EquipmentShipDetail",
    )
    # --- fields added for the SWMM -> CMMS DART push (build_t_dart_columns) ---
    sr_no = models.CharField(max_length=100, null=True, blank=True, db_column="SrNo")
    ship_sr_no = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True, db_column="ShipSrNo"
    )
    ship_id = models.IntegerField(null=True, blank=True, db_column="Ship_ID")
    source = models.IntegerField(null=True, blank=True, db_column="Source")
    department_id = models.IntegerField(null=True, blank=True, db_column="DepartmentID")
    department = models.CharField(
        max_length=255, null=True, blank=True, db_column="Department"
    )
    ex_dept = models.CharField(max_length=10, null=True, blank=True, db_column="ExDept")
    ex_dept_id = models.IntegerField(null=True, blank=True, db_column="ExDeptID")
    equipment_ship_id = models.IntegerField(
        null=True, blank=True, db_column="EquipmentShipID"
    )
    equipment_code = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="EquipmentCode",
    )
    cancel_date = models.DateTimeField(null=True, blank=True, db_column="CancelDate")
    signal_dtg = models.DateTimeField(null=True, blank=True, db_column="SignalDTG")
    routine_start_date = models.DateTimeField(
        null=True, blank=True, db_column="RoutineStartDate"
    )
    ra_generation_date = models.DateTimeField(
        null=True, blank=True, db_column="RAGenerationDate"
    )
    created_date = models.DateTimeField(null=True, blank=True, db_column="CreatedDate")
    updated_date = models.DateTimeField(null=True, blank=True, db_column="UpdatedDate")
    additional_remarks = models.CharField(
        max_length=1000, null=True, blank=True, db_column="Additional_Remarks"
    )
    admin_remarks = models.CharField(
        max_length=1000, null=True, blank=True, db_column="AdminRemarks"
    )
    ra_additional_remarks = models.CharField(
        max_length=1000, null=True, blank=True, db_column="RA_Additional_Remarks"
    )
    repair_routine_details = models.CharField(
        max_length=1000, null=True, blank=True, db_column="RepairRoutineDetails"
    )
    xdue_refit_remarks = models.CharField(
        max_length=255, null=True, blank=True, db_column="XdueRefitRemarks"
    )
    symptom_id = models.IntegerField(null=True, blank=True, db_column="SymptomID")
    other_symptoms_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="OtherSymptomsCode"
    )
    ship_remarks = models.IntegerField(null=True, blank=True, db_column="Ship_Remarks")
    ship_remarks_id = models.IntegerField(
        null=True, blank=True, db_column="ShipRemarksID"
    )
    present_running_hours = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="Present_Running_Hours",
    )
    hrs_from_installation = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="HrsFromInstallation",
    )
    new_hrs_from_installation = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="NewHrsFromInstallation",
    )
    total_running_hours = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="TotalRunningHours",
    )
    personal_no = models.CharField(
        max_length=100, null=True, blank=True, db_column="PersonalNo"
    )
    other_rank = models.CharField(
        max_length=255, null=True, blank=True, db_column="OtherRank"
    )
    total_no_of_manpower = models.IntegerField(
        null=True, blank=True, db_column="TotalNoOfManpower"
    )
    mandays_consumed = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="MandaysConsumed",
    )
    is_amp = models.SmallIntegerField(null=True, blank=True, db_column="Is_Amp")
    amp_refit = models.SmallIntegerField(null=True, blank=True, db_column="AmpRefit")
    is_refit = models.SmallIntegerField(null=True, blank=True, db_column="Is_Refit")
    nil_dart = models.BooleanField(null=True, blank=True, db_column="NILDart")
    is_final_submit = models.IntegerField(
        null=True, blank=True, db_column="Is_Final_Submit"
    )
    is_newly_added = models.IntegerField(
        null=True, blank=True, db_column="Is_Newly_Added"
    )
    is_drafted = models.IntegerField(null=True, blank=True, db_column="Is_Drafted")
    is_signal_drafted = models.IntegerField(
        null=True, blank=True, db_column="Is_Signal_Drafted"
    )
    is_dliidrafted = models.IntegerField(
        null=True, blank=True, db_column="Is_DLIIDrafted"
    )
    is_refit_ra_draft = models.IntegerField(
        null=True, blank=True, db_column="Is_RefitRADraft"
    )
    is_awrf_drafted = models.IntegerField(
        null=True, blank=True, db_column="Is_AWRFDrafted"
    )
    is_auto_generated_dart = models.IntegerField(
        null=True, blank=True, db_column="Is_Auto_Generated_Dart"
    )
    rec_for_deletion = models.IntegerField(
        null=True, blank=True, db_column="RecForDeletion"
    )
    is_export_to_sdrs = models.IntegerField(
        null=True, blank=True, db_column="IsExportToSDRS"
    )
    is_synced = models.IntegerField(null=True, blank=True, db_column="IsSynced")
    is_fuss = models.CharField(
        max_length=100, null=True, blank=True, db_column="IsFuss"
    )
    fuss_date = models.DateTimeField(null=True, blank=True, db_column="FussDate")
    spares_availability = models.IntegerField(
        null=True, blank=True, db_column="SparesAvailability"
    )
    spare_reason_days = models.IntegerField(
        null=True, blank=True, db_column="SpareReasonDays"
    )
    delay_reason_days = models.IntegerField(
        null=True, blank=True, db_column="DelayReasonDays"
    )
    dl_number = models.CharField(
        max_length=100, null=True, blank=True, db_column="DL_Number"
    )
    dl_type_id = models.IntegerField(null=True, blank=True, db_column="DL_Type_ID")
    opdef_no = models.CharField(
        max_length=100, null=True, blank=True, db_column="OpdefNo"
    )
    opdef_sr_no = models.CharField(
        max_length=100, null=True, blank=True, db_column="OpdefSrNo"
    )
    opdef_dtg = models.DateTimeField(null=True, blank=True, db_column="OpdefDTG")
    file_name = models.CharField(
        max_length=255, null=True, blank=True, db_column="FileName"
    )
    quarter_ending = models.CharField(
        max_length=10, null=True, blank=True, db_column="QuarterEnding"
    )
    universal_id_m_ostlist = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_OSTList"
    )
    universal_id_m_frequency = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Frequency"
    )
    universal_id_t_maintopdetail = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_MaintopDetail"
    )
    universal_id_m_ranklist = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_RankList"
    )
    universal_id_a_user_created_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Created_By",
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Updated_By",
    )
    # --- fields added for CompleteDARTUpdateAPI (defect close-out) ---
    diagnostic_id = models.IntegerField(null=True, blank=True, db_column="DiagnosticID")
    diagnostic_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="DiagnosticCode"
    )
    repair_id = models.IntegerField(null=True, blank=True, db_column="RepairID")
    repair_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="RepairCode"
    )
    repair_agency_id = models.IntegerField(
        null=True, blank=True, db_column="RepairAgencyID"
    )
    agency_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="AgencyCode"
    )
    delay_id = models.IntegerField(null=True, blank=True, db_column="DelayID")
    delay_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="DelayCode"
    )
    universal_id_m_diagnostic = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Diagnostic"
    )
    universal_id_m_repair = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Repair"
    )
    universal_id_m_repair_agency = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_RepairAgency"
    )
    universal_id_m_delay = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Delay"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "T_Dart"


class CmmsDartDetailGd(models.Model):
    """Guarantee-Defect detail attached 1:1 to a T_Dart row via Universal_ID_T_Dart, when
    T_Dart.IsGDForm is set."""

    id = models.AutoField(primary_key=True, db_column="ID")
    universal_id_t_dart = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_Dart"
    )
    reason = models.CharField(
        max_length=1000, null=True, blank=True, db_column="Reason"
    )
    defect_affects_sea_going_operational_availability = models.BooleanField(
        null=True,
        blank=True,
        db_column="Defect_affects_sea_going_Operational_Availability",
    )
    hot_work_involved = models.BooleanField(
        null=True, blank=True, db_column="Hot_Work_Involved"
    )
    date_place = models.CharField(
        max_length=255, null=True, blank=True, db_column="Date_place"
    )
    date_for_repairs = models.DateTimeField(
        null=True, blank=True, db_column="Date_for_Repairs"
    )
    place = models.CharField(max_length=255, null=True, blank=True, db_column="Place")
    date_of_completion = models.DateTimeField(
        null=True, blank=True, db_column="DateOfCompletion"
    )
    created_date = models.DateTimeField(null=True, blank=True, db_column="CreatedDate")
    updated_date = models.DateTimeField(null=True, blank=True, db_column="UpdatedDate")
    universal_id_a_user_created_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Created_By",
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Updated_By",
    )
    is_synced = models.IntegerField(null=True, blank=True, db_column="IsSynced")
    universal_id_t_dart_detail_gd = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_DartDetailGD"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "T_DartDetailGD"


class CmmsDartDliiiDetails(models.Model):
    """ABER / A&A detail attached 1:1 to a T_Dart row via Universal_ID_T_Dart."""

    dliii_id = models.AutoField(primary_key=True, db_column="DLIII_ID")
    sr_no = models.CharField(max_length=100, null=True, blank=True, db_column="SrNo")
    department_id = models.IntegerField(null=True, blank=True, db_column="DepartmentID")
    department = models.CharField(
        max_length=255, null=True, blank=True, db_column="Department"
    )
    equipment_ship_id = models.IntegerField(
        null=True, blank=True, db_column="EquipmentShipID"
    )
    equipment_code = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True,
        db_column="EquipmentCode",
    )
    defect_date = models.DateTimeField(null=True, blank=True, db_column="DefectDate")
    defect_description = models.CharField(
        max_length=1000, null=True, blank=True, db_column="DefectDescription"
    )
    rectified_date = models.DateTimeField(
        null=True, blank=True, db_column="RectifiedDate"
    )
    remarks = models.CharField(
        max_length=1000, null=True, blank=True, db_column="Remarks"
    )
    dart_number = models.CharField(
        max_length=100, null=True, blank=True, db_column="DartNumber"
    )
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    created_by = models.IntegerField(null=True, blank=True, db_column="CreatedBy")
    created_date = models.DateTimeField(null=True, blank=True, db_column="CreatedDate")
    updated_by = models.IntegerField(null=True, blank=True, db_column="UpdatedBy")
    updated_date = models.DateTimeField(null=True, blank=True, db_column="UpdatedDate")
    universal_id_t_dart_dliii_details = models.CharField(
        max_length=100, db_column="Universal_ID_T_DartDLIIIDetails"
    )
    universal_id_m_ship = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Ship"
    )
    universal_id_m_department = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Department"
    )
    universal_id_a_user_created_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Created_By",
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Updated_By",
    )
    universal_id_t_equipment_ship_detail = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_T_EquipmentShipDetail",
    )
    is_closed = models.IntegerField(null=True, blank=True, db_column="IsClosed")
    ship_id = models.IntegerField(null=True, blank=True, db_column="Ship_ID")
    dl_number = models.CharField(
        max_length=100, null=True, blank=True, db_column="DL_Number"
    )
    serial_number = models.IntegerField(
        null=True, blank=True, db_column="Serial_Number"
    )
    is_drafted = models.IntegerField(null=True, blank=True, db_column="Is_Drafted")
    ra_additional_remarks = models.CharField(
        max_length=1000, null=True, blank=True, db_column="RA_Additional_Remarks"
    )
    ship_remarks_id = models.IntegerField(
        null=True, blank=True, db_column="ShipRemarksID"
    )
    ra_generation_date = models.DateTimeField(
        null=True, blank=True, db_column="RAGenerationDate"
    )
    authority = models.CharField(
        max_length=255, null=True, blank=True, db_column="Authority"
    )
    universal_id_t_ref_comp = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_RefComp"
    )
    universal_id_m_equipment = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Equipment"
    )
    universal_id_ch_master_ship_remarks_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_Ch_Master_Ship_Remarks_By",
    )
    equipment_name = models.CharField(
        max_length=255, null=True, blank=True, db_column="EquipmentName"
    )
    qty = models.IntegerField(null=True, blank=True, db_column="Qty")
    major_minor = models.CharField(
        max_length=255, null=True, blank=True, db_column="MajorMinor"
    )
    location_on_board = models.CharField(
        max_length=255, null=True, blank=True, db_column="LocationOnBoard"
    )
    universal_id_m_repair_agency = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_RepairAgency"
    )
    other_repair_agency = models.CharField(
        max_length=255, null=True, blank=True, db_column="OtherRepairAgency"
    )
    is_synced = models.IntegerField(null=True, blank=True, db_column="IsSynced")

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "T_DartDLIIIDetails"


class CmmsFuss(models.Model):
    """CMMS's deferred-maintenance (FUSS) log — modeled with the columns FussDataSaveAPI's
    SWMM -> CMMS push writes."""

    fuss_id = models.AutoField(primary_key=True, db_column="FussID")
    department_id = models.IntegerField(null=True, blank=True, db_column="DepartmentID")
    sr_no = models.IntegerField(null=True, blank=True, db_column="SrNo")
    ship_sr_no = models.DecimalField(
        max_digits=18, decimal_places=4, null=True, blank=True, db_column="ShipSrNo"
    )
    fuss_date = models.DateTimeField(null=True, blank=True, db_column="FussDate")
    equipment_ship_id = models.IntegerField(
        null=True, blank=True, db_column="EquipmentShipID"
    )
    equipment_id = models.IntegerField(null=True, blank=True, db_column="EquipmentID")
    frequency_id = models.IntegerField(null=True, blank=True, db_column="FrequencyID")
    sched_frequency = models.CharField(
        max_length=255, null=True, blank=True, db_column="SchedFrequency"
    )
    routine_id = models.IntegerField(null=True, blank=True, db_column="RoutineID")
    sched_amendment_no = models.IntegerField(
        null=True, blank=True, db_column="SchedAmendmentNo"
    )
    sched_no = models.CharField(
        max_length=255, null=True, blank=True, db_column="SchedNo"
    )
    last_undertaken = models.DateTimeField(
        null=True, blank=True, db_column="LastUndertaken"
    )
    due_date = models.DateTimeField(null=True, blank=True, db_column="DueDate")
    routine_description = models.CharField(
        max_length=1000, null=True, blank=True, db_column="RoutineDescription"
    )
    deferment_id = models.IntegerField(null=True, blank=True, db_column="DefermentID")
    deferment_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="DefermentCode"
    )
    reason_id = models.IntegerField(null=True, blank=True, db_column="ReasonID")
    reason_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="ReasonCode"
    )
    last_smp = models.DateTimeField(null=True, blank=True, db_column="LastSMP")
    smp_duration = models.IntegerField(null=True, blank=True, db_column="SMPDuration")
    last_amp = models.DateTimeField(null=True, blank=True, db_column="LastAMP")
    amp_duration = models.IntegerField(null=True, blank=True, db_column="AMPDuration")
    amp_smp_req_wef = models.DateTimeField(
        null=True, blank=True, db_column="AMPSMPReqWef"
    )
    smp_amp_duration = models.IntegerField(
        null=True, blank=True, db_column="SMPAMPDuration"
    )
    inability_id = models.IntegerField(null=True, blank=True, db_column="InabilityID")
    inability_code = models.CharField(
        max_length=255, null=True, blank=True, db_column="InabilityCode"
    )
    remarks = models.CharField(
        max_length=1000, null=True, blank=True, db_column="Remarks"
    )
    cancel_date = models.DateTimeField(null=True, blank=True, db_column="CancelDate")
    cancel_remarks = models.CharField(
        max_length=1000, null=True, blank=True, db_column="CancelRemarks"
    )
    cancel_reference = models.CharField(
        max_length=255, null=True, blank=True, db_column="CancelReference"
    )
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    schedule_date = models.DateTimeField(
        null=True, blank=True, db_column="ScheduleDate"
    )
    actual_fuss_cancel_date = models.DateTimeField(
        null=True, blank=True, db_column="ActualFussCancelDate"
    )
    actual_fuss_creation_date = models.DateTimeField(
        null=True, blank=True, db_column="ActualFussCreationDate"
    )
    demand_details = models.CharField(
        max_length=1000, null=True, blank=True, db_column="DemandDetails"
    )
    is_no_routine_undertaken = models.IntegerField(
        null=True, blank=True, db_column="IsNoRoutineUndertaken"
    )
    universal_id_t_fuss = models.CharField(
        max_length=100, db_column="Universal_ID_T_Fuss"
    )
    universal_id_m_ship = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Ship"
    )
    universal_id_m_department = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Department"
    )
    universal_id_t_equipment_ship_detail = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_T_EquipmentShipDetail",
    )
    universal_id_m_equipment = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Equipment"
    )
    universal_id_m_frequency = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Frequency"
    )
    universal_id_t_maintopdetail = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_MaintopDetail"
    )
    universal_id_m_deferment = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Deferment"
    )
    universal_id_m_reason = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Reason"
    )
    universal_id_m_inability = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Inability"
    )
    universal_id_t_dart = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_Dart"
    )
    universal_id_m_establishment = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Establishment"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "T_Fuss"


class CmmsMasterEquipmentType(models.Model):
    equipment_type_id = models.BigIntegerField(
        primary_key=True, db_column="Equipment_Type_ID"
    )
    equipment_desc = models.CharField(
        max_length=255, null=True, blank=True, db_column="Equipment_Desc"
    )
    status = models.IntegerField(null=True, blank=True, db_column="Status")
    cmms_id = models.BigIntegerField(null=True, blank=True, db_column="CMMS_ID")
    cmms_ship_id = models.BigIntegerField(
        null=True, blank=True, db_column="CMMS_Ship_ID"
    )
    equipment_category_code = models.CharField(
        max_length=100, null=True, blank=True, db_column="Equipment_Category_Code"
    )
    universal_id_a_user_created_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Created_By",
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_A_User_Updated_By",
    )
    created_date = models.DateTimeField(null=True, blank=True, db_column="CreatedDate")
    updated_date = models.DateTimeField(null=True, blank=True, db_column="UpdatedDate")
    universal_id_ch_master_equipment_type = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_Ch_Master_Equipment_Type",
    )
    order_by = models.IntegerField(null=True, blank=True, db_column="Order_By")

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "Ch_Master_Equipment_Type"


class CmmsRoutineList(models.Model):
    routine_list_id = models.AutoField(primary_key=True, db_column="RoutineListID")
    routine_description = models.CharField(
        max_length=1000, null=True, blank=True, db_column="RoutineDescription"
    )
    active = models.BooleanField(null=True, blank=True, db_column="Active")
    is_closed = models.IntegerField(null=True, blank=True, db_column="IsClosed")
    universal_id_m_ship = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_M_Ship"
    )
    universal_id_t_equipment_ship_detail = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        db_column="Universal_ID_T_EquipmentShipDetail",
    )
    universal_id_t_maintopdetail = models.CharField(
        max_length=100, null=True, blank=True, db_column="Universal_ID_T_MaintopDetail"
    )
    universal_id_t_routine_list = models.CharField(
        max_length=100, db_column="Universal_ID_T_RoutineList"
    )

    class Meta:
        app_label = "sfd"
        managed = False
        db_table = "T_RoutineList"
