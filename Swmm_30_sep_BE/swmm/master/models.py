from datetime import date

# from accounts.models import CustomUserProfile
from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

from .managers import BaseManager



class Base(models.Model):
    objects = BaseManager()
    # created_at = models.DateTimeField(auto_now_add=True)
    # updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(default=timezone.now, blank=True, null=True)
    updated_at = models.DateTimeField(default=timezone.now, blank=True, null=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_created",
        null=True,
        blank=True,
    )

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_updated",
        null=True,
        blank=True,
    )

    active = models.BooleanField(default=True)
    synced = models.BooleanField(default=False)

    class Meta:
        abstract = True


class AppInfo(Base):
    """App-identity strings the frontend footer shows (version, copyright text) — read via
    `master.views.AppInfoAPIView`. A row of history, not a single mutable row: only ever ONE row
    has `active=True` at a time (this model's own `active`, from `Base`) — that's the "current"
    one the API returns. Changing the version means creating a new row with `active=True` and
    flipping the old one to `active=False`, rather than editing a row in place, so past
    versions/copyright text stay on record instead of being overwritten.
    """

    version = models.CharField(max_length=50, default="V0.0 Beta")
    copyright_text = models.CharField(max_length=255, default="Copyright @2026 | Content Owned")

    class Meta:
        db_table = "master_app_info"
        verbose_name = "App Info"
        verbose_name_plural = "App Info"

    def __str__(self):
        return f"{self.version} ({'active' if self.active else 'inactive'})"


class MShipCategory(Base):
    objects = BaseManager()
    ship_category_id = models.BigIntegerField(
        db_column="ShipCategoryID", primary_key=True
    )
    ship_category_name = models.CharField(
        db_column="ShipCategoryName", max_length=255, null=True, blank=True
    )
    ar_report_order = models.IntegerField(
        db_column="ARReportOrder", null=True, blank=True
    )
    created_by = models.CharField(
        db_column="CreatedBy", max_length=255, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    active = models.BooleanField(db_column="Active", null=True, blank=True)
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)
    universal_id_m_ship_category = models.CharField(
        db_column="Universal_ID_M_ShipCategory", max_length=255, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=255,
        null=True,
        blank=True,
    )
    mfa = models.CharField(db_column="MFA", max_length=255, null=True, blank=True)

    class Meta:
        db_table = "Master_ship_category"

    def __str__(self):
        return self.ship_category_name or str(self.ship_category_id)


class MInability(Base):
    objects = BaseManager()
    inability_id = models.IntegerField(db_column="InabilityID", primary_key=True)
    inability_code = models.CharField(
        db_column="InabilityCode", max_length=50, null=True, blank=True
    )
    description = models.TextField(db_column="Description", null=True, blank=True)
    isms_inability_code = models.CharField(
        db_column="ISMSInabilityCode", max_length=50, null=True, blank=True
    )
    active = models.BooleanField(db_column="Active", default=True)
    created_by = models.CharField(
        db_column="CreatedBy", max_length=100, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_by = models.CharField(
        db_column="UpdatedBy", max_length=100, null=True, blank=True
    )
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)
    universal_id_m_inability = models.CharField(
        db_column="Universal_ID_M_Inability", max_length=255, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_m_reason = models.CharField(
        db_column="Universal_ID_M_Reason", max_length=255, null=True, blank=True
    )

    class Meta:
        db_table = "Master_m_inability"

    def __str__(self):
        return str(self.inability_code)


class Department(Base):
    name = models.CharField(max_length=250)
    code = models.CharField(max_length=250)
    dep_code = models.CharField(max_length=250, null=True, blank=True)
    description = models.TextField(null=True)
    sfd_applicable = models.SmallIntegerField(null=True, blank=True)
    universal_id_m_department = models.CharField(null=True, blank=True)

    class Meta:
        db_table = "Master_department"

    def __str__(self):
        return str(self.name) or ""


class MDelay(Base):
    objects = BaseManager()
    delay_id = models.IntegerField(db_column="DelayID", null=True, blank=True)
    delay_code = models.CharField(
        db_column="DelayCode", max_length=50, null=True, blank=True
    )
    delay_name = models.CharField(
        db_column="DelayName", max_length=255, null=True, blank=True
    )
    isms_delay_code = models.CharField(
        db_column="ISMSDelayCode", max_length=50, null=True, blank=True
    )
    active = models.IntegerField(db_column="Active", null=True, blank=True)
    created_by = models.CharField(
        db_column="CreatedBy", max_length=100, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_by = models.CharField(
        db_column="UpdatedBy", max_length=100, null=True, blank=True
    )
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)
    universal_id_m_delay = models.CharField(
        db_column="Universal_ID_M_Delay", max_length=100, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=100,
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "Master_m_delay"

    def __str__(self):
        return self.delay_name or ""


class MDiagnostic(Base):
    objects = BaseManager()
    diagnostic_id = models.IntegerField(db_column="DiagnosticId", null=True, blank=True)
    diagnostic_code = models.CharField(
        db_column="DiagnosticCode", max_length=50, null=True, blank=True
    )
    diagnostic_name = models.CharField(
        db_column="DiagnosticName", max_length=255, null=True, blank=True
    )
    isms_diagnostic_code = models.CharField(
        db_column="ISMSDiagnosticCode", max_length=50, null=True, blank=True
    )
    active = models.IntegerField(db_column="Active", null=True, blank=True)
    created_by = models.CharField(
        db_column="CreatedBy", max_length=100, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_by = models.CharField(
        db_column="UpdatedBy", max_length=100, null=True, blank=True
    )
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)
    universal_id_m_diagnostic = models.CharField(
        db_column="Universal_ID_M_Diagnostic", max_length=100, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_m_department = models.CharField(
        db_column="Universal_ID_M_Department", max_length=100, null=True, blank=True
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_DEFAULT,
        default="",
        blank=True,
        null=True,
        db_column="Department_id",
    )

    class Meta:
        db_table = "Master_m_diagnostic"

    def __str__(self):
        return self.diagnostic_name or ""


class MRepairAgency(Base):
    objects = BaseManager()
    repair_agency_id = models.IntegerField(
        db_column="RepairAgencyID", null=True, blank=True
    )
    repair_agency_code = models.CharField(
        db_column="RepairAgencyCode", max_length=50, null=True, blank=True
    )
    repair_agency_name = models.CharField(
        db_column="RepairAgencyName", max_length=255, null=True, blank=True
    )
    isms_repair_agency_code = models.CharField(
        db_column="ISMSRepairAgencyCode", max_length=50, null=True, blank=True
    )
    active = models.IntegerField(db_column="Active", null=True, blank=True)
    created_by = models.CharField(
        db_column="CreatedBy", max_length=100, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_by = models.CharField(
        db_column="UpdatedBy", max_length=100, null=True, blank=True
    )
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)
    universal_id_m_repair_agency = models.CharField(
        db_column="Universal_ID_M_RepairAgency", max_length=100, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=100,
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "Master_m_repairagency"

    def __str__(self):
        return self.repair_agency_name or ""


class MRepair(Base):
    objects = BaseManager()
    repair_id = models.IntegerField(db_column="RepairID", null=True, blank=True)
    repair_code = models.CharField(
        db_column="RepairCode", max_length=50, null=True, blank=True
    )
    repair_name = models.CharField(
        db_column="RepairName", max_length=255, null=True, blank=True
    )
    isms_repair_code = models.CharField(
        db_column="ISMSRepairCode", max_length=50, null=True, blank=True
    )
    active = models.IntegerField(db_column="Active", null=True, blank=True)
    created_by = models.CharField(
        db_column="CreatedBy", max_length=100, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_by = models.CharField(
        db_column="UpdatedBy", max_length=100, null=True, blank=True
    )
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)
    universal_id_m_repair = models.CharField(
        db_column="Universal_ID_M_Repair", max_length=100, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_m_department = models.CharField(
        db_column="Universal_ID_M_Department", max_length=100, null=True, blank=True
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_DEFAULT,
        default="",
        blank=True,
        null=True,
        db_column="Department_id",
    )

    class Meta:
        db_table = "Master_m_repair"

    def __str__(self):
        return self.repair_name or ""


class MSeverity(Base):
    objects = BaseManager()
    severity_id = models.IntegerField(db_column="SeverityID", null=True, blank=True)
    severity_code = models.CharField(
        db_column="SeverityCode", max_length=50, null=True, blank=True
    )
    severity_name = models.CharField(
        db_column="SeverityName", max_length=255, null=True, blank=True
    )
    isms_severity_code = models.CharField(
        db_column="ISMSSeverityCode", max_length=50, null=True, blank=True
    )
    active = models.IntegerField(db_column="Active", null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        db_column="CreatedBy",
    )

    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="mseverity_updated_by",
        db_column="UpdatedBy",
    )
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)
    universal_id_m_severity = models.CharField(
        db_column="Universal_ID_M_Severity", max_length=100, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=100,
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "Master_m_severity"

    def __str__(self):
        return self.severity_name or ""


class MRanklist(Base):
    objects = BaseManager()
    rankid = models.IntegerField(db_column="rankid", primary_key=True)
    rankdescription = models.CharField(
        db_column="rankdescription", max_length=255, null=True, blank=True
    )

    universal_id_m_ranklist = models.CharField(
        db_column="universal_id_m_ranklist", max_length=100, null=True, blank=True
    )
    universal_id_m_department = models.CharField(
        db_column="universal_id_m_department", max_length=100, null=True, blank=True
    )

    createdby = models.BigIntegerField(db_column="createdby", null=True, blank=True)
    createddate = models.DateTimeField(db_column="createddate", null=True, blank=True)

    updatedby = models.BigIntegerField(db_column="updatedby", null=True, blank=True)
    updateddate = models.DateTimeField(db_column="updateddate", null=True, blank=True)

    active = models.BooleanField(db_column="active", default=True)

    class Meta:
        db_table = "Master_mranklist"

    def __str__(self):
        return self.rankdescription or str(self.rankid)


class MShipClass(Base):
    objects = BaseManager()
    class_id = models.BigIntegerField(db_column="ClassID", primary_key=True)
    class_code = models.CharField(
        db_column="ClassCode", max_length=255, null=True, blank=True
    )
    description = models.TextField(db_column="Description", null=True, blank=True)
    hull_code = models.CharField(
        db_column="HullCode", max_length=255, null=True, blank=True
    )
    active = models.BooleanField(db_column="Active", null=True, blank=True)
    created_by = models.CharField(
        db_column="CreatedBy", max_length=255, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_by = models.CharField(
        db_column="UpdatedBy", max_length=255, null=True, blank=True
    )
    updated_date = models.DateTimeField(null=True, blank=True)
    universal_id_m_ship_class = models.CharField(max_length=255, null=True, blank=True)
    universal_id_a_user_created_by = models.CharField(
        max_length=255, null=True, blank=True
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=255, null=True, blank=True
    )
    mfl = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = "Master_ship_class"

    def __str__(self):
        return self.class_code or str(self.class_id)


class MShipCommand(Base):
    objects = BaseManager()
    command_id = models.BigIntegerField(db_column="CommandID", primary_key=True)
    command_code = models.CharField(
        db_column="CommandCode", max_length=255, null=True, blank=True
    )
    command_name = models.CharField(
        db_column="CommandName", max_length=255, null=True, blank=True
    )
    command_ref = models.CharField(
        db_column="CommandRef", max_length=255, null=True, blank=True
    )
    sfd_hierarchy_id = models.BigIntegerField(
        db_column="SFDHierarchyID", null=True, blank=True
    )
    active = models.BooleanField(db_column="Active", null=True, blank=True)
    created_by = models.CharField(
        db_column="CreatedBy", max_length=255, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_by = models.CharField(
        db_column="UpdatedBy", max_length=255, null=True, blank=True
    )
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)
    universal_id_m_command = models.CharField(
        db_column="Universal_ID_M_Command", max_length=255, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=255,
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "Master_ship_command"

    def __str__(self):
        return self.command_name or self.command_code or str(self.command_id)


class MShipOpsAuthority(Base):
    objects = BaseManager()
    authority_id = models.BigIntegerField(db_column="AuthorityID", primary_key=True)
    ops_code = models.CharField(
        db_column="OpsCode", max_length=255, null=True, blank=True
    )
    ops_authority = models.CharField(
        db_column="OpsAuthority", max_length=255, null=True, blank=True
    )
    command = models.ForeignKey(
        MShipCommand,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="ship_ops_authorities",
        db_column="CommandID",
    )
    command_name = models.CharField(
        db_column="CommandName", max_length=255, null=True, blank=True
    )
    sfd_hierarchy_id = models.BigIntegerField(
        db_column="SFDHierarchyID", null=True, blank=True
    )
    ops_order = models.IntegerField(db_column="OpsOrder", null=True, blank=True)
    active = models.BooleanField(db_column="Active", null=True, blank=True)
    created_by = models.CharField(
        db_column="CreatedBy", max_length=255, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_by = models.CharField(
        db_column="UpdatedBy", max_length=255, null=True, blank=True
    )
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)
    universal_id_m_ops_authority = models.CharField(
        db_column="Universal_ID_M_OpsAuthority", max_length=255, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_m_command = models.CharField(
        db_column="Universal_ID_M_Command", max_length=255, null=True, blank=True
    )
    address = models.TextField(db_column="Address", null=True, blank=True)

    class Meta:
        db_table = "Master_ship_opsauthority"

    def __str__(self):
        return self.ops_authority or self.ops_code or str(self.authority_id)


class MShipPropulsion(Base):
    objects = BaseManager()
    propulsion_id = models.BigIntegerField(db_column="PropulsionID", primary_key=True)
    propulsion_name = models.CharField(
        db_column="PropulsionName", max_length=255, null=True, blank=True
    )
    active = models.BooleanField(db_column="Active", null=True, blank=True)
    created_by = models.CharField(
        db_column="CreatedBy", max_length=255, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_by = models.CharField(
        db_column="UpdatedBy", max_length=255, null=True, blank=True
    )
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)
    universal_id_m_propulsion = models.CharField(
        db_column="Universal_ID_M_Propulsion", max_length=255, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=255,
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "Master_ship_propulsion"

    def __str__(self):
        return self.propulsion_name or str(self.propulsion_id)


class MShipUnitCategory(Base):
    objects = BaseManager()
    ship_unit_category_id = models.BigIntegerField(
        db_column="ShipUnitCategoryID", primary_key=True
    )
    ship_unit_category = models.CharField(
        db_column="ShipUnitCategory", max_length=255, null=True, blank=True
    )
    universal_id_m_ship_unitcategory = models.CharField(
        db_column="Universal_ID_M_ShipUnitcategory",
        max_length=255,
        null=True,
        blank=True,
    )
    created_by = models.CharField(
        db_column="Created_by", max_length=255, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="Created_Date", null=True, blank=True)
    updated_by = models.CharField(
        db_column="Updated_By", max_length=255, null=True, blank=True
    )
    updated_date = models.DateTimeField(db_column="Updated_Date", null=True, blank=True)
    active = models.BooleanField(db_column="Active", null=True, blank=True)

    class Meta:
        db_table = "Master_ship_unitcategory"

    def __str__(self):
        return self.ship_unit_category or str(self.ship_unit_category_id)


class FrequencyType(models.TextChoices):
    HOURLY = "hourly", "Hourly"
    DAILY = "daily", "Daily"
    WEEKLY = "weekly", "Weekly"
    MONTHLY = "monthly", "Monthly"
    QUARTERLY = "quarterly", "Quarterly"
    SIX_MONTHLY = "six_monthly", "Six Monthly"
    ANNUAL = "annual", "Annual"
    OCCASIONAL = "occasional", "Occasional"


class Frequency(Base):
    objects = BaseManager()
    frequency_id = models.BigIntegerField(
        db_column="FrequencyID", blank=True, null=True
    )

    frequency = models.CharField(
        db_column="Frequency", max_length=255, blank=True, null=True
    )
    frequency_prefix = models.CharField(
        db_column="FrequencyPrefix", max_length=100, blank=True, null=True
    )
    description = models.TextField(db_column="Description", blank=True, null=True)

    hourly_freq = models.BooleanField(db_column="HourlyFreq", blank=True, null=True)

    hours = models.CharField(
        db_column="Hours",
        max_length=255,  # ⚠️ IMPORTANT (because 0.30 exists in DB)
        blank=True,
        null=True,
    )

    months = models.IntegerField(db_column="Months", blank=True, null=True)

    active = models.BooleanField(db_column="Active", default=True)

    created_by = models.CharField(
        db_column="CreatedBy", max_length=255, blank=True, null=True
    )
    created_date = models.DateTimeField(db_column="CreatedDate", blank=True, null=True)

    updated_by = models.CharField(
        db_column="UpdatedBy", max_length=255, blank=True, null=True
    )
    updated_date = models.DateTimeField(db_column="UpdatedDate", blank=True, null=True)

    universal_id_m_frequency = models.CharField(
        db_column="Universal_ID_M_Frequency", max_length=255, blank=True, null=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=255,
        blank=True,
        null=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=255,
        blank=True,
        null=True,
    )

    class Meta:
        db_table = "Master_frequency"

    def __str__(self):
        return str(self.description or self.pk)


class ChMasterSymptoms(Base):
    objects = BaseManager()
    symptom_id = models.IntegerField(db_column="Symptom_ID", null=True, blank=True)
    symptom_code = models.CharField(
        db_column="Symptom_Code", max_length=50, null=True, blank=True
    )
    active = models.IntegerField(db_column="Active", null=True, blank=True)
    created_by = models.CharField(
        db_column="CreatedBy", max_length=100, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_by = models.CharField(
        db_column="UpdatedBy", max_length=100, null=True, blank=True
    )
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)
    universal_id_m_department = models.CharField(
        db_column="Universal_ID_M_Department", max_length=100, null=True, blank=True
    )
    universal_id_ch_master_symptoms = models.CharField(
        db_column="Universal_ID_Ch_Master_Symptoms",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=100,
        null=True,
        blank=True,
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_DEFAULT,
        default="",
        blank=True,
        null=True,
        db_column="Department_id",
    )

    class Meta:
        db_table = "Master_ch_master_symptoms"

    def __str__(self):
        return self.symptom_code or ""


class ChMasterShipRemarksBy(Base):
    objects = BaseManager()
    ship_remark_by_id = models.IntegerField(
        db_column="Ship_Remark_By_ID", null=True, blank=True
    )
    description = models.CharField(
        db_column="Description", max_length=255, null=True, blank=True
    )
    active = models.IntegerField(db_column="Active", null=True, blank=True)
    universal_id_ch_master_ship_remarks_by = models.CharField(
        db_column="Universal_ID_Ch_Master_Ship_Remarks_By",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=100,
        null=True,
        blank=True,
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)

    class Meta:
        db_table = "Master_ch_master_ship_remarks_by"

    def __str__(self):
        return self.description or ""


class ChMasterOtherShipRemarksBy(Base):
    """CMMS Ch_Master_Other_Ship_Remarks_By — the remark-raiser options for anything
    other than the ship itself (DAN, DOSSRR, FMUSSRR, FMUDAN). Mirrors
    ChMasterShipRemarksBy, except CMMS names the identity column ShipRemarksID here
    rather than Ship_Remark_By_ID.
    """

    objects = BaseManager()
    ship_remarks_id = models.IntegerField(
        db_column="ShipRemarksID", null=True, blank=True
    )
    description = models.CharField(
        db_column="Description", max_length=255, null=True, blank=True
    )
    active = models.IntegerField(db_column="Active", null=True, blank=True)
    universal_id_ch_master_other_ship_remarks_by = models.CharField(
        db_column="Universal_ID_Ch_Master_Other_Ship_Remarks_By",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=100,
        null=True,
        blank=True,
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)

    class Meta:
        db_table = "Master_ch_master_other_ship_remarks_by"

    def __str__(self):
        return self.description or ""


class MRequiredAssistance(Base):
    objects = BaseManager()
    required_assistance_id = models.AutoField(primary_key=True)
    required_assistance_for = models.CharField(max_length=255, blank=True, null=True)
    active = models.BooleanField(default=True)
    created_by = models.IntegerField(blank=True, null=True)
    created_date = models.DateTimeField(blank=True, null=True)
    updated_by = models.IntegerField(blank=True, null=True)
    updated_date = models.DateTimeField(blank=True, null=True)
    universal_id_m_required_assistance = models.CharField(
        max_length=100, blank=True, null=True
    )
    universal_id_m_department = models.CharField(max_length=100, blank=True, null=True)
    universal_id_a_user_created_by = models.CharField(
        max_length=100, blank=True, null=True
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=100, blank=True, null=True
    )
    required_assistance_code = models.CharField(max_length=50, blank=True, null=True)

    def __str__(self):
        return f"{self.required_assistance_for} ({self.required_assistance_code})"

    def get_active_display(self):
        return {1: "active", 2: "Inactive", 3: "Delete"}.get(self.active, "Unknown")

    class Meta:
        db_table = "Master_mrequiredassistance"


class Command(Base):
    unit_name = models.CharField(max_length=250, blank=True, null=True)
    command_name = models.CharField(max_length=250, blank=True, null=True)

    class Meta:
        db_table = "Master_command"

    def __str__(self):
        return self.command_name or self.unit_name or "command"


# Developed with Understanding: Master_unit is THE singleton row of this ship. Step 1 of
# the Sync HRCDF page fills it from the picked HrcdfUnit (name, code, hrcdf_unit_id,
# station_code, description, command, hrcdf_ship_name). CMMS Step 0 never writes this
# row (D22). The seeded HRCDF command and unit-name masters live in HrcdfCommand and
# HrcdfUnit, never here.
class Unit(Base):
    # Developed with Understanding: blank with default "" so the row can exist before
    # Step 1 has picked a unit, for example when CMMS Step 0 runs first.
    name = models.CharField(max_length=250, blank=True, default="")
    # Developed with Understanding: nullable for the same reason, still unique.
    code = models.CharField(max_length=250, unique=True, null=True, blank=True)
    description = models.TextField(blank=True, null=True)
    # Developed with Understanding: the HRCDF unitId of this ship.
    hrcdf_unit_id = models.BigIntegerField(unique=True, null=True, blank=True)
    # Developed with Understanding: the HRCDF station code of this ship.
    station_code = models.CharField(max_length=16, blank=True, default="")
    # Developed with Understanding: string references, because MasterCommand and UnitType
    # are declared further down this module.
    command = models.ForeignKey(
        "MasterCommand",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hrcdf_units",
    )
    unit_type = models.ForeignKey(
        "UnitType",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="units",
    )
    # Developed with Understanding: HRCDF once Step 1 has filled the row.
    record_origin = models.CharField(max_length=10, blank=True, default="")
    # Developed with Understanding: the ship name picked in Step 1 of the Sync HRCDF page.
    # Prefixed "INS " it is the ship name shown everywhere (api/v1/master/this-ship/).
    hrcdf_ship_name = models.CharField(max_length=250, blank=True, default="")

    class Meta:
        db_table = "Master_unit"

    def __str__(self):
        return str(self.name or self.pk)

    # Developed with Understanding: the one this-ship row, the lowest id, created empty
    # when absent. Read-only callers use Unit.objects.order_by("id").first() instead.
    @classmethod
    def get_this_ship_unit(cls):
        row = cls.objects.order_by("id").first()
        if row is None:
            row = cls.objects.create(name="", code=None)
        return row


# Developed with Understanding: the seeded HRCDF command master behind the Step 1 Command
# dropdown. Seeded with the unit_master.csv command codes and changed only by Get Ship
# Names from HRCDF. record_origin is SEED or HRCDF. HRCDF never renames a SEED row.
class HrcdfCommand(Base):
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=250)
    record_origin = models.CharField(max_length=10, blank=True, default="")

    class Meta:
        db_table = "Master_hrcdf_command"

    def __str__(self):
        return self.code


# Developed with Understanding: the seeded HRCDF unit-name master behind the Step 1 Ship
# Name dropdown, one row per HRCDF unit. unit_type is plain text, so seeding it never
# creates UnitType rows. Roster runs never write this table.
class HrcdfUnit(Base):
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=250)
    hrcdf_unit_id = models.BigIntegerField(unique=True, null=True, blank=True)
    station_code = models.CharField(max_length=16, blank=True, default="")
    command = models.ForeignKey(
        HrcdfCommand,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="units",
    )
    description = models.TextField(blank=True, null=True)
    unit_type = models.CharField(max_length=50, blank=True, default="")
    # Developed with Understanding: SEED or HRCDF, which path created the row.
    record_origin = models.CharField(max_length=10, blank=True, default="")

    class Meta:
        db_table = "Master_hrcdf_unit"

    def __str__(self):
        return self.name


class SubDepartment(Base):
    objects = BaseManager()
    department_name = models.ForeignKey(
        Department, blank=True, on_delete=models.CASCADE, null=True
    )
    name = models.CharField(
        max_length=250,
        null=True,
        blank=True,
        validators=[
            RegexValidator(
                r"^[A-Za-z0-9 _/-]+$",
                "Sub-department name may only contain letters, numbers, spaces, "
                "hyphens, underscores and slashes.",
            )
        ],
    )
    description = models.CharField(
        db_column="Description", max_length=255, null=True, blank=True
    )
    universal_id_m_sub_department = models.CharField(null=True, blank=True)
    code = models.CharField(max_length=50, null=True, blank=True)
    active = models.BooleanField(default=True)
    equipment_count = models.PositiveIntegerField(default=0)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        db_table = "Master_sub_department"

    def __str__(self):
        return self.name or ""


class Country(Base):
    name = models.CharField(max_length=250)
    code = models.CharField(max_length=250, unique=True)

    class Meta:
        db_table = "Master_country"

    def __str__(self):
        return str(self.name or self.pk)


class Generic(Base):
    sr_no = models.CharField(max_length=250)
    code = models.CharField(max_length=250, unique=True)
    type = models.CharField(max_length=250)

    class Meta:
        db_table = "Master_generic"

    def __str__(self):
        return str(self.code or self.pk)


class SFDHierarchy(Base):
    name = models.CharField(max_length=250)
    code = models.CharField(max_length=250, unique=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="hierarchy",
    )
    sfd_level = models.IntegerField()
    h_code = models.CharField(max_length=250)

    class Meta:
        db_table = "Master_sfdhierarchy"

    def __str__(self):
        return str(self.name or self.pk)


class OpsAuthority(Base):
    authority = models.CharField(max_length=250)
    code = models.CharField(max_length=250, blank=True, null=True)
    command = models.ForeignKey(
        Command,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    name = models.CharField(max_length=250, blank=True, null=True)
    ops_order = models.CharField(max_length=250, blank=True, null=True)
    address = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "Master_opsauthority"

    def __str__(self):
        return str(self.name or self.pk)


class Propulsion(Base):
    name = models.CharField(max_length=250)

    class Meta:
        db_table = "Master_propulsion"

    def __str__(self):
        return str(self.name or self.pk)


class Section(Base):
    code = models.CharField(max_length=250, blank=True, null=True)
    name = models.CharField(max_length=250)
    department = models.ForeignKey(
        Department, on_delete=models.CASCADE, blank=True, null=True
    )
    itttm_section = models.CharField(max_length=250, blank=True, null=True)

    class Meta:
        db_table = "Master_section"

    def __str__(self):
        return self.name or ""


class Group(Base):
    code = models.CharField(max_length=250, unique=True)
    name = models.CharField(max_length=250)
    section = models.ForeignKey(
        Section,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    generic = models.ForeignKey(
        Generic,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )

    class Meta:
        db_table = "Master_group"

    def __str__(self):
        return str(self.name or self.pk)


class EquipmentType(Base):
    code = models.CharField(max_length=250, unique=True)
    name = models.CharField(max_length=250)

    class Meta:
        db_table = "Master_equipmenttype"

    def __str__(self):
        return str(self.name or self.pk)


class Lubricant(Base):
    class LubricantType(models.TextChoices):
        OIL = "oil", "Oil"
        GAS = "gas", "Gas"

    name = models.CharField(max_length=250)
    code = models.CharField(max_length=250, unique=True)
    type = models.CharField(
        max_length=50,
        choices=LubricantType.choices,
        default=LubricantType.OIL,
        help_text="Select whether this lubricant type is Oil or Gas.",
    )
    description = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "Master_lubricant"

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"


class Supplier(Base):
    code = models.CharField(max_length=250, unique=True)
    name = models.CharField(max_length=250)
    address = models.TextField(blank=True, null=True)
    area_street = models.TextField(blank=True, null=True)
    city = models.CharField(max_length=250, blank=True, null=True)
    country = models.ForeignKey(
        Country, on_delete=models.CASCADE, blank=True, null=True
    )
    supplier_manufacture = models.CharField(max_length=250, blank=True, null=True)
    contact_person = models.CharField(max_length=250, blank=True, null=True)
    contact_number = models.CharField(max_length=250, blank=True, null=True)
    email_id = models.EmailField(blank=True, null=True)

    class Meta:
        db_table = "Master_supplier"

    def __str__(self):
        return str(self.name or self.pk)


class ShipCategory(Base):
    code = models.CharField(max_length=250, unique=True)
    name = models.CharField(max_length=250)

    class Meta:
        db_table = "Master_shipcategory"

    def __str__(self):
        return str(self.name or self.pk)


class MasterCommand(Base):
    unit_name = models.CharField(max_length=250, null=True, blank=True)
    command_name = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return self.unit_name

    class Meta:
        db_table = "Master_master_command"


class OverseeingTeam(Base):
    code = models.CharField(max_length=250, unique=True)
    name = models.CharField(max_length=250)

    class Meta:
        db_table = "Master_overseeingteam"

    def __str__(self):
        return str(self.name or self.pk)


class UnitType(Base):
    name = models.CharField(max_length=250)

    class Meta:
        db_table = "Master_unittype"

    def __str__(self):
        return str(self.name or self.pk)


class ShipCategoryLookup(Base):
    objects = BaseManager()
    ship_category_id = models.BigIntegerField(primary_key=True)
    ship_category_name = models.CharField(max_length=255, blank=True, null=True)
    ar_report_order = models.IntegerField(blank=True, null=True)
    created_by = models.CharField(max_length=255, blank=True, null=True)
    created_date = models.DateTimeField(blank=True, null=True)
    active = models.BooleanField(blank=True, null=True)
    updated_date = models.DateTimeField(blank=True, null=True)
    universal_id_m_ship_category = models.CharField(
        max_length=255, blank=True, null=True
    )
    universal_id_a_user_created_by = models.CharField(
        max_length=255, blank=True, null=True
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=255, blank=True, null=True
    )
    mfa = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = "Master_shipcategorylookup"

    def __str__(self):
        return self.ship_category_name or str(self.ship_category_id)


class ShipClassLookup(Base):
    objects = BaseManager()
    class_id = models.BigIntegerField(primary_key=True)
    class_code = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    hull_code = models.CharField(max_length=255, blank=True, null=True)
    active = models.BooleanField(blank=True, null=True)
    created_by = models.CharField(max_length=255, blank=True, null=True)
    created_date = models.DateTimeField(blank=True, null=True)
    updated_by = models.CharField(max_length=255, blank=True, null=True)
    updated_date = models.DateTimeField(blank=True, null=True)
    universal_id_m_ship_class = models.CharField(max_length=255, blank=True, null=True)
    universal_id_a_user_created_by = models.CharField(
        max_length=255, blank=True, null=True
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=255, blank=True, null=True
    )
    mfl = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = "Master_shipclasslookup"

    def __str__(self):
        return self.class_code or str(self.class_id)


class ShipCommandLookup(Base):
    objects = BaseManager()
    command_id = models.BigIntegerField(primary_key=True)
    command_code = models.CharField(max_length=255, blank=True, null=True)
    command_name = models.CharField(max_length=255, blank=True, null=True)
    command_ref = models.CharField(max_length=255, blank=True, null=True)
    sfd_hierarchy_id = models.BigIntegerField(blank=True, null=True)
    active = models.BooleanField(blank=True, null=True)
    created_by = models.CharField(max_length=255, blank=True, null=True)
    created_date = models.DateTimeField(blank=True, null=True)
    updated_by = models.CharField(max_length=255, blank=True, null=True)
    updated_date = models.DateTimeField(blank=True, null=True)
    universal_id_m_command = models.CharField(max_length=255, blank=True, null=True)
    universal_id_a_user_created_by = models.CharField(
        max_length=255, blank=True, null=True
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=255, blank=True, null=True
    )

    class Meta:
        db_table = "Master_shipcommandlookup"

    def __str__(self):
        return self.command_name or self.command_code or str(self.command_id)


class ShipOpsAuthorityLookup(Base):
    objects = BaseManager()
    authority_id = models.BigIntegerField(primary_key=True)
    ops_code = models.CharField(max_length=255, blank=True, null=True)
    ops_authority = models.CharField(max_length=255, blank=True, null=True)
    command = models.ForeignKey(
        ShipCommandLookup,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="ship_ops_authorities",
    )
    command_name = models.CharField(max_length=255, blank=True, null=True)
    sfd_hierarchy_id = models.BigIntegerField(blank=True, null=True)
    ops_order = models.IntegerField(blank=True, null=True)
    active = models.BooleanField(blank=True, null=True)
    created_by = models.CharField(max_length=255, blank=True, null=True)
    created_date = models.DateTimeField(blank=True, null=True)
    updated_by = models.CharField(max_length=255, blank=True, null=True)
    updated_date = models.DateTimeField(blank=True, null=True)
    universal_id_m_ops_authority = models.CharField(
        max_length=255, blank=True, null=True
    )
    universal_id_a_user_created_by = models.CharField(
        max_length=255, blank=True, null=True
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=255, blank=True, null=True
    )
    universal_id_m_command = models.CharField(max_length=255, blank=True, null=True)
    address = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "Master_shipopsauthoritylookup"

    def __str__(self):
        return self.ops_authority or self.ops_code or str(self.authority_id)


class ShipPropulsionLookup(Base):
    objects = BaseManager()
    propulsion_id = models.BigIntegerField(primary_key=True)
    propulsion_name = models.CharField(max_length=255, blank=True, null=True)
    active = models.BooleanField(blank=True, null=True)
    created_by = models.CharField(max_length=255, blank=True, null=True)
    created_date = models.DateTimeField(blank=True, null=True)
    updated_by = models.CharField(max_length=255, blank=True, null=True)
    updated_date = models.DateTimeField(blank=True, null=True)
    universal_id_m_propulsion = models.CharField(max_length=255, blank=True, null=True)
    universal_id_a_user_created_by = models.CharField(
        max_length=255, blank=True, null=True
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=255, blank=True, null=True
    )

    class Meta:
        db_table = "Master_shippropulsionlookup"

    def __str__(self):
        return self.propulsion_name or str(self.propulsion_id)


class OrderDuty(Base):
    objects = BaseManager()
    filename = models.CharField(db_column="filename", max_length=255)
    uploaded_at = models.DateTimeField(db_column="uploaded_at", auto_now_add=True)
    source = models.CharField(db_column="source", max_length=100)
    pdf_path = models.FileField(
        db_column="pdf_path",
        upload_to="master/order_duty/",
        blank=True,
        null=True,
    )
    roster_name = models.CharField(
        db_column="roster_name", max_length=255, blank=True, null=True
    )
    from_date = models.DateField(db_column="from_date", blank=True, null=True)
    to_date = models.DateField(db_column="to_date", blank=True, null=True)
    description = models.TextField(db_column="description", blank=True, null=True)
    date = models.DateField(db_column="date", blank=True, null=True)
    officer_details = models.CharField(
        db_column="officer_details", max_length=255, blank=True, null=True
    )
    routine_details = models.CharField(
        db_column="routine_details", max_length=255, blank=True, null=True
    )
    batch_id = models.CharField(
        db_column="batch_id",
        max_length=255,
        blank=True,
        null=True,
        help_text="Groups records from same Multiple Day submission",
    )
    allocation_type = models.CharField(
        db_column="allocation_type",
        max_length=20,
        blank=True,
        null=True,
        choices=[("SINGLE", "Single Day"), ("MULTIPLE", "Multiple Day")],
    )

    class Meta:
        db_table = "masters_ordersduty_table"

    def __str__(self):
        return self.filename or ""


class UpdateEntry(Base):
    objects = BaseManager()
    uploaded_date = models.DateTimeField(db_column="uploaded_date", auto_now_add=True)
    from_date = models.DateField(db_column="from_date", blank=True, null=True)
    to_date = models.DateField(db_column="to_date", blank=True, null=True)
    update_text = models.TextField(db_column="update_text")
    event_file = models.FileField(
        db_column="event_file",
        upload_to="master/event_updates/",
        blank=True,
        null=True,
    )

    class Meta:
        db_table = "masters_updates_table"

    def __str__(self):
        return f"Update {self.pk}"


class Quote(Base):
    objects = BaseManager()
    quote_text = models.TextField(db_column="quote_text")
    uploaded_date = models.DateTimeField(db_column="uploaded_date", auto_now_add=True)
    # is_active = models.BooleanField(db_column="is_active", default=False)
    active = models.BooleanField(db_column="is_active", default=False)
    is_displayed = models.BooleanField(db_column="is_displayed", default=False)
    last_displayed_date = models.DateField(
        db_column="last_displayed_date", blank=True, null=True
    )

    class Meta:
        db_table = "masters_quote_table"

    def __str__(self):
        return f"Quote {self.pk}"


class ShipRole(Base):
    objects = BaseManager()
    role_title = models.CharField(
        db_column="role_title", max_length=255, blank=True, null=True
    )
    current_text = models.TextField(db_column="current_text")
    uploaded_date = models.DateTimeField(db_column="uploaded_date", auto_now_add=True)

    class Meta:
        db_table = "masters_shiprole_table"

    def __str__(self):
        return f"Ship Role {self.pk}"


class ShipRoleImage(Base):
    objects = BaseManager()
    ship = models.ForeignKey(
        ShipRole,
        on_delete=models.CASCADE,
        related_name="images",
        db_column="ship_id",
    )
    image = models.ImageField(db_column="image", upload_to="master/ship_role/")

    class Meta:
        db_table = "masters_shiproleimage"

    def __str__(self):
        return f"Image {self.pk} for Ship {self.ship_id}"


class MemberDetail(Base):
    objects = BaseManager()
    name = models.CharField(db_column="name", max_length=255)
    designation = models.CharField(db_column="designation", max_length=255)
    image_path = models.ImageField(
        db_column="image_path",
        upload_to="master/members/",
        blank=True,
        null=True,
    )
    rank = models.CharField(db_column="rank", max_length=100)
    uploaded_date = models.DateTimeField(db_column="uploaded_date", auto_now_add=True)
    date_joining = models.DateField(db_column="date_joining", blank=True, null=True)

    class Meta:
        db_table = "masters_memberdetails_table"

    def __str__(self):
        return self.name or ""


class CoMessage(Base):
    objects = BaseManager()
    message = models.TextField(db_column="message")
    valid_till_date = models.DateField(db_column="valid_till_date", default=date.today)
    uploaded_date = models.DateTimeField(db_column="uploaded_date", auto_now_add=True)

    class Meta:
        db_table = "masters_comessage"

    def __str__(self):
        return f"Co Message {self.pk}"


class HierarchyForChart(Base):
    objects = BaseManager()
    node_type = models.CharField(db_column="node_type", max_length=50, default="co")
    division_name = models.CharField(
        db_column="division_name", max_length=255, blank=True, null=True
    )
    user = models.ForeignKey(
    "accounts.CustomUserProfile",
    on_delete=models.CASCADE,
    max_length=255,
    blank=True,
    null=True,
    db_column="user_id",
)
    photo = models.ImageField(
        db_column="photo",
        upload_to="master/hierarchy/",
        blank=True,
        null=True,
    )
    is_regulator = models.BooleanField(db_column="is_regulator", default=False)

    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="children",
        db_column="parent_id",
    )
    is_commander_officer = models.BooleanField(
        db_column="is_commander_officer", default=False
    )
    is_departmental_officer = models.BooleanField(default=False)
    date = models.DateTimeField(db_column="date", default=timezone.now)
    assigned_regulator = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="assigned_sailors",
        db_column="assigned_regulator_id",
    )

    NODE_TYPE_PLACEHOLDER_LABELS = {
        "co": "Commanding Officer",
        "hod": "Head of Department",
        "divisional_officer": "Divisional Officer",
    }

    class Meta:
        db_table = "masters_hierarchyforchart"

    @property
    def name(self):
        if self.node_type == "division":
            return self.division_name or "Division"

        if self.user:
            return f"{self.user.firstname} {self.user.lastname}"
        return self.division_name or self.NODE_TYPE_PLACEHOLDER_LABELS.get(
            self.node_type, ""
        )

    @property
    def rank(self):
        """Return a JSON-safe display value for the linked user's rank."""
        return self.user.rank.name if self.user and self.user.rank_id else ""

    @property
    def designation(self):
        # This field is not currently connected to a real user relation.
        return self.user.designation if self.user else ""

    @property
    def personal_number(self):
        # This field is not currently connected to a real user relation.
        return ""

    def __str__(self):
        return self.node_type or ""


class Ship(Base):
    ship_external_id = models.BigIntegerField(null=True, blank=True, unique=True)
    sr_no = models.CharField(max_length=250, null=True, blank=True)
    code = models.CharField(max_length=250, null=True, blank=True)
    name = models.CharField(max_length=250, null=True, blank=True)
    ship_image = models.ImageField(upload_to="master/ship_image/", blank=True)
    ship_description = models.TextField(max_length=500, blank=True)
    ship_role_description = models.TextField(max_length=500, blank=True)
    ship_category = models.ForeignKey(
        MShipCategory,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="ship_category",
    )
    sfd_hierarchy_id = models.BigIntegerField(null=True, blank=True)
    class_master = models.ForeignKey(
        MShipClass,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="ship_class",
    )
    class_code = models.CharField(max_length=250, null=True, blank=True)
    commission_date = models.DateField(null=True, blank=True)
    command = models.ForeignKey(
        MShipCommand,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="ship_command",
    )
    authority = models.ForeignKey(
        MShipOpsAuthority,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="ship_authority",
    )
    ops_code = models.CharField(max_length=250, null=True, blank=True)
    ship_builder = models.CharField(max_length=250, null=True, blank=True)
    decommission_date = models.DateField(null=True, blank=True)
    displacement = models.CharField(max_length=250, null=True, blank=True)
    hours_underway = models.CharField(max_length=250, null=True, blank=True)
    distance_run = models.CharField(max_length=250, null=True, blank=True)
    decommission_scheduled_date = models.DateField(null=True, blank=True)
    propulsion = models.ForeignKey(
        MShipPropulsion,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="ship_propulsion",
    )
    sdrsref = models.CharField(max_length=250, null=True, blank=True)
    active_external = models.BooleanField(null=True, blank=True)
    created_by_external = models.CharField(max_length=255, null=True, blank=True)
    created_date_external = models.DateTimeField(null=True, blank=True)
    updated_by_external = models.CharField(max_length=255, null=True, blank=True)
    updated_date_external = models.DateTimeField(null=True, blank=True)
    yard_no = models.CharField(max_length=250, null=True, blank=True)
    reference_no = models.CharField(max_length=250, null=True, blank=True)
    classification_society = models.CharField(
        max_length=250,
        null=True,
        blank=True,
    )
    length_overall = models.CharField(max_length=250, null=True, blank=True)
    length_perpen = models.CharField(max_length=250, null=True, blank=True)
    module_breath = models.CharField(max_length=250, null=True, blank=True)
    wetted_under_water = models.CharField(
        max_length=250,
        null=True,
        blank=True,
    )
    depth_main = models.CharField(max_length=250, null=True, blank=True)
    standard_disp = models.CharField(max_length=250, null=True, blank=True)
    full_load_disp = models.CharField(max_length=250, null=True, blank=True)
    stand_draft = models.CharField(max_length=250, null=True, blank=True)
    full_load_draft = models.CharField(max_length=250, null=True, blank=True)
    wetted_boot_top = models.CharField(max_length=250, null=True, blank=True)
    engine_rating = models.CharField(max_length=250, null=True, blank=True)
    max_cont_speed = models.CharField(max_length=250, null=True, blank=True)
    eco_speed = models.CharField(max_length=250, null=True, blank=True)
    endurance = models.CharField(max_length=250, null=True, blank=True)
    remark = models.TextField(null=True, blank=True)

    universal_id_m_ship = models.CharField(
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_m_ship_category = models.CharField(
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_m_ship_class = models.CharField(
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_m_command = models.CharField(
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_m_ops_authority = models.CharField(
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_m_propulsion = models.CharField(
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_a_user_created_by = models.CharField(
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        max_length=255,
        null=True,
        blank=True,
    )
    refit_authority = models.CharField(max_length=250, null=True, blank=True)
    signal_name = models.CharField(max_length=250, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    contact_number = models.CharField(max_length=250, null=True, blank=True)
    nud_email_id = models.CharField(max_length=250, null=True, blank=True)
    nic_email_id = models.CharField(max_length=250, null=True, blank=True)
    universal_id_m_overseeing_team = models.CharField(
        max_length=255,
        null=True,
        blank=True,
    )
    is_cmms_install = models.BooleanField(null=True, blank=True)
    is_in_gd = models.BooleanField(null=True, blank=True)
    universal_id_m_ship_unit_category = models.CharField(
        max_length=255,
        null=True,
        blank=True,
    )

    # Existing local links/compatibility fields retained.
    unit_type = models.ForeignKey(UnitType, on_delete=models.CASCADE, blank=True)
    overseeing_team = models.ForeignKey(
        OverseeingTeam,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )

    ship_category_string = models.CharField(max_length=255, null=True, blank=True)
    class_master_string = models.CharField(max_length=255, null=True, blank=True)
    unit_type_string = models.CharField(max_length=255, null=True, blank=True)
    propulsion_string = models.CharField(max_length=255, null=True, blank=True)
    overseeing_team_string = models.CharField(max_length=255, null=True, blank=True)
    command_string = models.CharField(max_length=255, null=True, blank=True)
    authority_string = models.CharField(max_length=255, null=True, blank=True)
    customer_code = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        db_table = "Master_ship"

    def __str__(self):
        return self.name or ""


class ActiveShipConfig(Base):
    """Singleton: the one ship this SWMM install operates on.

    Set via Step 0 (Nomenclature Synchronization -> Update Ship Names from CMMS) once
    an operator picks a ship from the Command/Ship Name dropdowns. Every CMMS sync in
    this codebase used to resolve its ship exclusively from the SWMM_SHIP_CODE .env
    var (see swmmapi.views.env_ship_code / master.utils.get_this_ship /
    sfd.utils.get_this_ship) -- this record now takes precedence over that env var
    wherever those helpers are used, so the ship only has to be entered once, here,
    instead of edited into .env on every deployment. Falls back to .env when no row
    exists yet (fresh installs, or before Step 0 has ever been run).
    """

    ship = models.OneToOneField(
        Ship, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    selected_at = models.DateTimeField(auto_now=True)
    # Which of the 5 Nomenclature Synchronization wizard steps (cmms/maintop/routine/
    # missingRoutine/defect) have completed a run for `ship`. The frontend's own
    # completed-step tracking lives in a page-scoped signal that a full browser refresh
    # wipes, forcing operators back through steps they'd already run; this is the durable
    # copy the frontend hydrates from on load so a refresh doesn't look like a reset.
    completed_steps = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "master_active_ship_config"

    def __str__(self):
        return self.ship.name if self.ship else "(no ship selected)"

    @classmethod
    def get_selected_ship(cls):
        row = cls.objects.select_related("ship").first()
        return row.ship if row and row.ship_id else None

    @classmethod
    def set_selected_ship(cls, ship):
        row = cls.objects.first()
        if row is None:
            row = cls(pk=1)
        if row.ship_id != getattr(ship, "id", None):
            row.completed_steps = []
        row.ship = ship
        row.save()
        return row

    @classmethod
    def get_completed_steps(cls):
        row = cls.objects.first()
        return list(row.completed_steps) if row and row.completed_steps else []

    @classmethod
    def mark_step_completed(cls, step_key):
        row = cls.objects.first()
        if row is None:
            row = cls(pk=1)
        steps = set(row.completed_steps or [])
        steps.add(step_key)
        row.completed_steps = sorted(steps)
        row.save()
        return list(row.completed_steps)


class MRefitCategory(Base):
    objects = BaseManager()
    refit_category_id = models.IntegerField(
        db_column="refit_category_id", primary_key=True
    )
    refit_category_name = models.CharField(
        db_column="refit_category_name", max_length=255, null=True, blank=True
    )
    active = models.BooleanField(db_column="active", default=True)

    created_by = models.IntegerField(db_column="created_by", null=True, blank=True)
    created_date = models.DateTimeField(db_column="created_date", null=True, blank=True)
    updated_by = models.IntegerField(db_column="updated_by", null=True, blank=True)
    updated_date = models.DateTimeField(db_column="updated_date", null=True, blank=True)

    universal_id_m_refitcategory = models.CharField(
        db_column="universal_id_m_refitcategory", max_length=255, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="universal_id_a_user_created_by",
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="universal_id_a_user_updated_by",
        max_length=255,
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "Master_mrefitcategory"

    def __str__(self):
        return self.refit_category_name or ""


class MRefit(Base):
    objects = BaseManager()
    refit_category_f_key = models.ForeignKey(
        MRefitCategory,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        db_column="refit_category_f_key_id",
    )
    refit_id = models.IntegerField(db_column="refit_id", primary_key=True)
    refit_type = models.CharField(
        db_column="refit_type", max_length=100, null=True, blank=True
    )
    description = models.TextField(db_column="description", null=True, blank=True)
    refit_category_id = models.IntegerField(
        db_column="refit_category_id", null=True, blank=True
    )
    active = models.BooleanField(db_column="active", default=True)

    created_by = models.IntegerField(db_column="created_by", null=True, blank=True)
    created_date = models.DateTimeField(db_column="created_date", null=True, blank=True)
    updated_by = models.IntegerField(db_column="updated_by", null=True, blank=True)
    updated_date = models.DateTimeField(db_column="updated_date", null=True, blank=True)

    universal_id_m_refit = models.CharField(
        db_column="universal_id_m_refit", max_length=255, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="universal_id_a_user_created_by",
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="universal_id_a_user_updated_by",
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_m_refitcategory = models.CharField(
        db_column="universal_id_m_refitcategory", max_length=255, null=True, blank=True
    )

    class Meta:
        db_table = "Master_mrefit"

    def __str__(self):
        return self.refit_type or ""


class OpsMaintenancePeriod(Base):
    objects = BaseManager()
    name = models.CharField(db_column="name", max_length=50, blank=True, null=True)
    maintenance_period = models.CharField(
        db_column="maintenance_period", max_length=50, blank=True, null=True
    )
    occasion = models.CharField(
        db_column="occasion", max_length=100, blank=True, null=True
    )
    start_date = models.DateField(db_column="start_date", blank=True, null=True)
    end_date = models.DateField(db_column="end_date", blank=True, null=True)

    class Meta:
        db_table = "Master_opsmaintenanceperiod"

    def __str__(self):
        return str(self.name or self.pk)


class MMaterialOrganizations(Base):
    objects = BaseManager()
    mo_id = models.IntegerField(db_column="mo_id", primary_key=True)
    mo_name = models.CharField(
        db_column="mo_name", max_length=255, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="created_date", null=True, blank=True)
    updated_date = models.DateTimeField(db_column="updated_date", null=True, blank=True)
    universal_id_m_materialorganizations = models.CharField(
        db_column="universal_id_m_materialorganizations",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="universal_id_a_user_created_by",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="universal_id_a_user_updated_by",
        max_length=100,
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "Master_mmaterialorganizations"

    def __str__(self):
        return self.mo_name or str(self.mo_id)


class MDeferment(Base):
    objects = BaseManager()
    deferment_id = models.IntegerField(db_column="DefermentID", primary_key=True)
    deferment_code = models.CharField(
        db_column="DefermentCode", max_length=50, null=True, blank=True
    )
    description = models.TextField(db_column="Description", null=True, blank=True)
    isms_deferment_code = models.CharField(
        db_column="ISMSDefermentCode", max_length=50, null=True, blank=True
    )
    active = models.BooleanField(db_column="Active", default=True)
    created_by = models.CharField(
        db_column="CreatedBy", max_length=100, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_by = models.CharField(
        db_column="UpdatedBy", max_length=100, null=True, blank=True
    )
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)
    universal_id_m_deferment = models.CharField(
        db_column="Universal_ID_M_Deferment", max_length=255, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=255,
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "Master_m_deferment"

    def __str__(self):
        return str(self.deferment_code) or ""


class RefitMaintenancePeriod(Base):
    objects = BaseManager()
    name = models.CharField(db_column="name", max_length=50, blank=True, null=True)
    maintenance_period = models.CharField(
        db_column="maintenance_period", max_length=50, blank=True, null=True
    )
    occasion = models.CharField(
        db_column="occasion", max_length=100, blank=True, null=True
    )

    actual_start_date = models.DateField(
        db_column="actual_start_date", blank=True, null=True
    )
    actual_end_date = models.DateField(
        db_column="actual_end_date", blank=True, null=True
    )

    plan_start_date = models.DateField(
        db_column="plan_start_date", blank=True, null=True
    )
    plan_end_date = models.DateField(db_column="plan_end_date", blank=True, null=True)

    universal_id_t_ref_comp = models.CharField(
        db_column="Universal_ID_T_RefComp", max_length=50, blank=True, null=True
    )
    universal_id_m_command = models.CharField(
        db_column="Universal_ID_M_Command", max_length=50, blank=True, null=True
    )
    universal_id_m_ship = models.CharField(
        db_column="Universal_ID_M_Ship", max_length=50, blank=True, null=True
    )
    universal_id_m_refit = models.CharField(
        db_column="Universal_ID_M_Refit", max_length=50, blank=True, null=True
    )
    universal_id_m_refit_place = models.CharField(
        db_column="Universal_ID_M_RefitPlace", max_length=50, blank=True, null=True
    )

    ship_universal_f_key = models.ForeignKey(
        Ship,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        db_column="ship_universal_f_key_id",
    )
    refit_category_f_key = models.ForeignKey(
        MRefitCategory,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        db_column="refit_category_f_key_id",
    )
    universal_m_refit = models.ForeignKey(
        MRefit,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        db_column="universal_m_refit_id",
    )

    class Meta:
        db_table = "Master_refitmaintenanceperiod"

    def __str__(self):
        return str(self.name or self.pk)


class MEstablishment(Base):
    objects = BaseManager()
    est_id = models.IntegerField(db_column="est_id", primary_key=True)
    est_name = models.CharField(
        db_column="est_name", max_length=255, null=True, blank=True
    )
    command_id = models.IntegerField(db_column="command_id", null=True, blank=True)
    authority_id = models.IntegerField(db_column="authority_id", null=True, blank=True)
    active = models.BooleanField(db_column="active", default=True)
    created_by = models.BigIntegerField(db_column="created_by", null=True, blank=True)
    created_date = models.DateTimeField(db_column="created_date", null=True, blank=True)
    updated_by = models.BigIntegerField(db_column="updated_by", null=True, blank=True)
    updated_date = models.DateTimeField(db_column="updated_date", null=True, blank=True)
    universal_id_m_establishment = models.CharField(
        db_column="universal_id_m_establishment", max_length=100, null=True, blank=True
    )
    universal_id_m_command = models.CharField(
        db_column="universal_id_m_command", max_length=100, null=True, blank=True
    )
    universal_id_m_opsauthority = models.CharField(
        db_column="universal_id_m_opsauthority", max_length=100, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="universal_id_a_user_created_by",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="universal_id_a_user_updated_by",
        max_length=100,
        null=True,
        blank=True,
    )
    universal_id_m_establishmentcategory = models.IntegerField(
        db_column="universal_id_m_establishmentcategory", null=True, blank=True
    )

    class Meta:
        db_table = "Master_mestablishment"

    def __str__(self):
        return self.est_name or str(self.est_id)


class MReason(Base):
    objects = BaseManager()
    reason_id = models.IntegerField(db_column="ReasonID", primary_key=True)
    reason_code = models.CharField(
        db_column="ReasonCode", max_length=50, null=True, blank=True
    )
    description = models.TextField(db_column="Description", null=True, blank=True)
    isms_reason_code = models.CharField(
        db_column="ISMSReasonCode", max_length=50, null=True, blank=True
    )
    active = models.BooleanField(db_column="Active", default=True)
    created_by = models.CharField(
        db_column="CreatedBy", max_length=100, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    updated_by = models.CharField(
        db_column="UpdatedBy", max_length=100, null=True, blank=True
    )
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)
    universal_id_m_reason = models.CharField(
        db_column="Universal_ID_M_Reason", max_length=255, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="Universal_ID_A_User_Created_By",
        max_length=255,
        null=True,
        blank=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="Universal_ID_A_User_Updated_By",
        max_length=255,
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "Master_m_reason"

    def __str__(self):
        return str(self.reason_code)


class Manufacturer(Base):
    name = models.CharField(max_length=250)
    code = models.CharField(max_length=250, unique=True)
    country = models.ForeignKey(
        Country, on_delete=models.PROTECT, null=True, blank=True
    )
    address = models.TextField(null=True, blank=True)
    area = models.TextField(null=True, blank=True)
    city = models.TextField(null=True, blank=True)
    contact_person = models.TextField(null=True, blank=True)
    contact_number = models.TextField(null=True, blank=True)
    email = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "Master_manufacturer"

    def __str__(self):
        return str(self.name or self.pk)


class MEquipment(Base):
    code = models.CharField(max_length=250, unique=True)
    name = models.CharField(max_length=250)
    country = models.ForeignKey(
        Country, on_delete=models.PROTECT, null=True, blank=True
    )
    group = models.ForeignKey(Group, on_delete=models.CASCADE, null=True, blank=True)
    image = models.FileField(upload_to="equipment/", null=True, blank=True)
    model = models.CharField(max_length=250, blank=True, null=True)
    manufacturer = models.ForeignKey(
        Manufacturer, on_delete=models.CASCADE, null=True, blank=True
    )
    supplier = models.ForeignKey(
        Supplier, on_delete=models.CASCADE, null=True, blank=True
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="parent_equipment",
    )
    obsolete = models.CharField(max_length=250)
    authority = models.CharField(max_length=250)
    generic_code = models.CharField(max_length=250, null=True, blank=True)
    ilms_equipment_code = models.CharField(max_length=250, null=True, blank=True)
    acquaint_issued = models.CharField(max_length=250, null=True, blank=True)
    maintop_number = models.CharField(max_length=250, null=True, blank=True)
    type = models.ForeignKey(
        EquipmentType, on_delete=models.CASCADE, null=True, blank=True
    )

    class Meta:
        db_table = "Master_equipment"

    def __str__(self):
        return f"{self.id}-{self.code}-{self.name}"


class MaintenanceOccasionMaster(Base):
    objects = BaseManager()
    maintenance_period = models.CharField(max_length=255)  # "Operational" or "Refit"
    occasion = models.CharField(max_length=255)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="maintenance_occasions_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "Master_maintenance_occasion_master"

    def __str__(self):
        return f"{self.maintenance_period} - {self.occasion}"


class RHSIEquipment(Base):
    objects = BaseManager()
    ship = models.ForeignKey(
        Ship,
        on_delete=models.CASCADE,
        related_name="equipments_master",
        blank=True,
        null=True,
    )
    ship_type = models.CharField(max_length=255, blank=True, null=True)
    insma_equipment_code = models.CharField(max_length=255, blank=True, null=True)
    equipment_code = models.CharField(max_length=255, blank=True, null=True)
    equipment_name = models.CharField(max_length=255, blank=True, null=True)
    nomenclature = models.CharField(max_length=100, blank=True, null=True)
    ilms_eq_code = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=255, blank=True, null=True, default="Active")
    ilms_vendor = models.ForeignKey(
        "ilms.VendorList",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="supplied_equipments_sfd_master",
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="supplied_equipments_sfd_master",
    )
    # --- Equipment fields ---
    equipment_serial_no = models.CharField(max_length=255, blank=True, null=True)
    oem_part_no = models.CharField(max_length=255, blank=True, null=True)
    deck = models.CharField(max_length=255, blank=True, null=True)
    frame = models.CharField(max_length=255, blank=True, null=True)
    equipment_direction = models.CharField(max_length=255, blank=True, null=True)
    compartment = models.CharField(max_length=255, blank=True, null=True)
    installation_date = models.DateField(null=True, blank=True)
    no_of_fits = models.PositiveIntegerField(default=1)
    # --- Extra fields from modal ---
    rshi = models.CharField("RH at Installation", max_length=100, blank=True, null=True)
    eq_rhsi = models.CharField(
        "RH Value at Installation", max_length=100, blank=True, null=True
    )
    rhsi_updated_until = models.DateTimeField(null=True, blank=True)
    equipment_section = models.CharField(max_length=255, blank=True, null=True)
    system_status = models.CharField(max_length=255, blank=True, null=True)
    department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )
    sub_department_f_key = models.ForeignKey(
        SubDepartment,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )
    installation_remarks = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.equipment_name or ""


class ShipSDRS(Base):
    objects = BaseManager()
    ship = models.ForeignKey(
        Ship,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ship_sdrs_rows",
        db_column="ShipID",
    )
    ship_name = models.CharField(
        db_column="Shipname", max_length=255, null=True, blank=True
    )
    ndmbi_code = models.CharField(
        db_column="NDMBICode", max_length=255, null=True, blank=True
    )
    ndmbi_ship_name = models.CharField(
        db_column="NDMBIShipName", max_length=255, null=True, blank=True
    )
    ndmbi_short_name = models.CharField(
        db_column="NDMBIShortName", max_length=255, null=True, blank=True
    )
    nsrykar_code = models.CharField(
        db_column="NSRYKARCode", max_length=255, null=True, blank=True
    )
    nsrykar_ship_name = models.CharField(
        db_column="NSRYKARShipName", max_length=255, null=True, blank=True
    )
    nsrykar_short_name = models.CharField(
        db_column="NSRYKARShortName", max_length=255, null=True, blank=True
    )
    nsrykoc_ship_code = models.CharField(
        db_column="NSRYKOCShipCode", max_length=255, null=True, blank=True
    )
    nsrykoc_ship_name = models.CharField(
        db_column="NSRYKOCShipName", max_length=255, null=True, blank=True
    )
    nsrykoc_short_name = models.CharField(
        db_column="NSRYKOCShortName", max_length=255, null=True, blank=True
    )
    ndvzg_ship_code = models.CharField(
        db_column="NDVZGShipCode", max_length=255, null=True, blank=True
    )
    ndvzg_ship_name = models.CharField(
        db_column="NDVZGShipName", max_length=255, null=True, blank=True
    )
    ndvzg_short_name = models.CharField(
        db_column="NDVZGShortName", max_length=255, null=True, blank=True
    )
    active = models.BooleanField(db_column="Active", null=True, blank=True)
    created_by = models.CharField(
        db_column="CreatedBy", max_length=255, null=True, blank=True
    )
    created_date = models.DateTimeField(db_column="CreatedDate", null=True, blank=True)
    universal_id_m_ship = models.CharField(
        db_column="Universal_ID_M_Ship", max_length=255, null=True, blank=True
    )
    updated_by = models.CharField(
        db_column="UpdatedBy", max_length=255, null=True, blank=True
    )
    updated_date = models.DateTimeField(db_column="UpdatedDate", null=True, blank=True)

    class Meta:
        db_table = "Master_ship_sdrs"

    def __str__(self):
        return self.ship_name or str(self.ship_id or "")


class Addressee(Base):
    name = models.TextField(db_column="name")

    class Meta:
        db_table = "Master_addressee"

    def __str__(self):
        return self.name[:50] if self.name else ""


class DistributionAddress(Base):
    name = models.TextField(db_column="name")
    addressee = models.ForeignKey(
        Addressee,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        db_column="addresse_id",
    )

    class Meta:
        db_table = "Master_distributionaddress"

    def __str__(self):
        return self.name[:50] if self.name else ""


class Activity(Base):
    name = models.CharField(db_column="name", max_length=250)
    code = models.CharField(db_column="code", max_length=250, unique=True)

    class Meta:
        db_table = "Master_activity"

    def __str__(self):
        return f"{self.name} ({self.code})"


class Location(Base):
    name = models.CharField(db_column="name", max_length=250)
    code = models.CharField(db_column="code", max_length=250, unique=True)

    class Meta:
        db_table = "Master_location"

    def __str__(self):
        return f"{self.name} ({self.code})"


class MasterEquipmentType(Base):
    objects = BaseManager()
    equipment_type_id = models.CharField(
        db_column="equipment_type_id", max_length=255, blank=True, null=True
    )
    equipment_desc = models.CharField(
        db_column="equipment_desc", max_length=255, blank=True, null=True
    )
    status = models.CharField(db_column="status", max_length=255, blank=True, null=True)
    cmms_id = models.CharField(
        db_column="cmms_id", max_length=255, blank=True, null=True
    )
    cmms_ship_id = models.CharField(
        db_column="cmms_ship_id", max_length=255, blank=True, null=True
    )
    equipment_category_code = models.CharField(
        db_column="equipment_category_code", max_length=255, blank=True, null=True
    )
    universal_id_a_user_created_by = models.CharField(
        db_column="universal_id_a_user_created_by",
        max_length=255,
        blank=True,
        null=True,
    )
    universal_id_a_user_updated_by = models.CharField(
        db_column="universal_id_a_user_updated_by",
        max_length=255,
        blank=True,
        null=True,
    )
    createddate = models.CharField(
        db_column="createddate", max_length=255, blank=True, null=True
    )
    updateddate = models.CharField(
        db_column="updateddate", max_length=255, blank=True, null=True
    )
    universal_id_ch_master_equipment_type = models.CharField(
        db_column="universal_id_ch_master_equipment_type",
        max_length=255,
        blank=True,
        null=True,
    )
    order_by = models.CharField(
        db_column="order_by", max_length=255, blank=True, null=True
    )

    class Meta:
        db_table = "Master_master_equipmenttype"

    def __str__(self):
        return self.equipment_desc or str(self.equipment_type_id)
