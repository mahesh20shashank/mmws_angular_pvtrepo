from accounts.models import CustomUserProfile
from django.conf import settings
from django.core.validators import MaxLengthValidator
from django.db import models
from ems.models import EquipmentName
from master.models import (
    Base,
    ChMasterShipRemarksBy,
    ChMasterSymptoms,
    Department,
    MDelay,
    MDiagnostic,
    MRanklist,
    MRepair,
    MRepairAgency,
    MRequiredAssistance,
    MSeverity,
    RefitMaintenancePeriod,
)
from sfd.models import CompartmentMaster, ShipEquipment

from .defect.models import (
    AS_AND_AS_TYPE_CHOICES,
    CATEGORY_CHOICES,
    DEFECT_TYPE_CHOICES,
    STATUS_CHOICES,
)
from .managers import (
    CompleteDefectDartQuerySet,
    CompletedRoutineQuerySet,
    InitiateDartQuerySet,
    TempDartSpareQuerySet,
)




class ServiceMaster(Base):
    service = models.CharField(max_length=100, unique=True)
    service_type = models.CharField(max_length=100, blank=True, null=True)
    requires_equipment = models.BooleanField(default=False)

    class Meta:
        db_table = "dart_service_master"

    def __str__(self):
        return self.service or ""


class CertificateTypeMaster(Base):
    certificate = models.CharField(max_length=10, unique=True)
    meaning = models.CharField(max_length=200)

    class Meta:
        db_table = "dart_certificate_type_master"

    def __str__(self):
        return self.certificate or ""


class EquipmentStatusMaster(Base):
    class EquipmentStatus(models.TextChoices):
        OPERATIONAL = "operational", "Operational"
        PARTIALLY_NON_OPS = "partially_non_ops", "Partially Non Ops"
        NON_OPS = "non_ops", "Non Ops"

    status = models.CharField(
        choices=EquipmentStatus.choices, max_length=25, unique=True
    )
    description = models.CharField(max_length=250, blank=True, null=True)
    readiness_impact = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = "dart_equipment_status_master"

    def __str__(self):
        return self.status or ""


class AuthorityDocumentMaster(Base):
    document_name = models.CharField(max_length=100, unique=True)
    authority_name = models.CharField(max_length=100)
    valid_from_date = models.DateField()

    class Meta:
        db_table = "dart_authority_document_master"
        indexes = [
            models.Index(fields=["document_name"], name="ix_dart_authdoc_name"),
            models.Index(fields=["authority_name"], name="ix_dart_authdoc_authority"),
            models.Index(fields=["valid_from_date"], name="ix_dart_authdoc_valid_from"),
        ]

    def __str__(self):
        return self.document_name or str(self.pk)


class DTNRMaster(Base):
    dtnr_code = models.CharField(max_length=50, unique=True)
    dtnr_meaning = models.CharField(max_length=250)
    applies_when = models.CharField(max_length=250, null=True, blank=True)

    class Meta:
        db_table = "dart_dtnr_master"

    def __str__(self):
        return self.dtnr_meaning or str(self.pk)


class ASTypeMaster(Base):
    as_type_name = models.CharField(max_length=100, unique=True)

    class Meta:
        db_table = "dart_as_type_master"

    def __str__(self):
        return self.as_type_name or str(self.pk)


class DARTTriggerMaster(Base):
    trigger_code = models.CharField(max_length=50, unique=True)
    trigger_name = models.CharField(max_length=100)

    class Meta:
        db_table = "dart_trigger_master"

    def __str__(self):
        return self.trigger_name or str(self.pk)


class DockyardServiceMaster(Base):
    dockyard_service_code = models.CharField(max_length=50, unique=True)
    dockyard_service_name = models.CharField(max_length=100)

    class Meta:
        db_table = "dart_dockyard_service_master"

    def __str__(self):
        return self.dockyard_service_name or str(self.pk)


class InitiateDart(Base):
    objects = InitiateDartQuerySet.as_manager()

    symptom_code = models.ForeignKey(
        ChMasterSymptoms,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="initiate_symptoms",
    )
    severity_code = models.ForeignKey(
        MSeverity,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="initiate_severity",
        db_column="serverity_code_id",
    )
    remark_code = models.ForeignKey(
        ChMasterShipRemarksBy,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="initiate_ship_remarks",
    )
    require_assistance_for_code = models.ForeignKey(
        MRequiredAssistance,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="initiate_ra_for",
    )

    refit_maintenance_period_f_key = models.ForeignKey(
        RefitMaintenancePeriod,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )

    equipment_ship = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    department_id = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    equipment_ems = models.ForeignKey(
        EquipmentName,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )

    dart_number = models.CharField(
        db_column="dart_number", max_length=200, blank=True, null=True
    )
    dart_sr_number = models.CharField(
        db_column="dart_sr_number", max_length=200, blank=True, null=True
    )

    dart_date = models.DateField(
        db_column="dart_date", auto_now_add=False, blank=True, null=True
    )
    rectification_date = models.DateField(
        auto_now_add=False, blank=True, null=True
    )  # schedule date
    ops_status = models.BooleanField(db_column="ops_status", blank=True, null=True)
    trial_required = models.BooleanField(
        db_column="trial_required", blank=True, null=True
    )
    defective_discriptions = models.TextField(
        db_column="defective_discriptions",
        validators=[MaxLengthValidator(600)],
        null=True,
        blank=True,
    )
    defective_component = models.CharField(
        db_column="defective_component", max_length=200, blank=True, null=True
    )
    rha_defect = models.CharField(
        db_column="RHA_defect", max_length=200, blank=True, null=True
    )
    universal_id_trial_required = models.CharField(
        max_length=500, blank=True, null=True
    )
    universal_id_t_dart = models.CharField(max_length=200, blank=True, null=True)
    is_closed = models.BooleanField(default=False)
    sapres_required = models.BooleanField(default=False)
    photograph = models.FileField(upload_to="dart_photos/", null=True, blank=True)
    created_date = models.DateField(auto_now_add=True, blank=True, null=True)
    is_ra_initiate = models.BooleanField(default=False)
    is_dl_initiate = models.BooleanField(default=False)
    is_ra_draft = models.BooleanField(default=False)
    is_dl_draft = models.BooleanField(default=False)

    maintenance_period = models.CharField(
        db_column="maintenance_period", max_length=50, blank=True, null=True
    )
    dart_occasion = models.CharField(
        db_column="dart_occasion", max_length=100, blank=True, null=True
    )

    cmms_sync_date = models.DateField(db_column="cmms_sync_date", blank=True, null=True)
    cmms_sync_status = models.BooleanField(db_column="cmms_sync_status", default=False)
    is_guarantee_defect = models.BooleanField(
        db_column="is_guarantee_defect", default=False
    )

    guarantee_cause = models.TextField(
        db_column="guarantee_cause", null=True, blank=True
    )
    guarantee_op_availability = models.BooleanField(
        default=False, null=True, blank=True
    )
    guarantee_hot_work = models.BooleanField(
        db_column="guarantee_hot_work", default=False, null=True, blank=True
    )
    guarantee_repairs = models.TextField(
        db_column="guarantee_repairs", null=True, blank=True
    )
    guarantee_completion_date = models.DateField(
        db_column="guarantee_completion_date", null=True, blank=True
    )
    guarantee_repair_date = models.DateField(
        db_column="guarantee_repair_date", null=True, blank=True
    )
    guarantee_place = models.TextField(
        db_column="guarantee_place", null=True, blank=True
    )

    # Consolidated Transaction & Operational Fields
    defect_type = models.CharField(
        max_length=30,
        choices=DEFECT_TYPE_CHOICES,
        default="SERVICE",
        blank=True,
        null=True,
    )
    category = models.CharField(
        max_length=10,
        choices=CATEGORY_CHOICES,
        blank=True,
        null=True,
    )
    as_and_as_type = models.CharField(
        max_length=10,
        choices=AS_AND_AS_TYPE_CHOICES,
        blank=True,
        null=True,
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="OPEN",
        blank=True,
        null=True,
    )
    action_taken_to_repair = models.TextField(null=True, blank=True)
    diagnosed_reason_of_defect = models.TextField(null=True, blank=True)
    standby_available = models.BooleanField(null=True, blank=True)
    equipment_status_text = models.CharField(max_length=50, null=True, blank=True)
    place_of_ship_availability = models.CharField(max_length=255, null=True, blank=True)
    supplier = models.CharField(max_length=100, null=True, blank=True)
    exposure_pct = models.IntegerField(null=True, blank=True)
    guarantee_expiry = models.DateField(null=True, blank=True)
    risk = models.CharField(max_length=20, null=True, blank=True)
    defect_closed_remark = models.TextField(null=True, blank=True)
    defect_closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="closed_dart_defects",
    )
    compartment = models.ForeignKey(
        CompartmentMaster,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dart_defects",
    )
    service_fkey = models.ForeignKey(
        ServiceMaster,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_dart_defects",
    )
    certificate_type_fkey = models.ForeignKey(
        CertificateTypeMaster,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cert_dart_defects",
    )

    class Meta:
        db_table = "dart_initiate_dart"

    def __str__(self):
        return str(self.dart_number or self.pk)

    @property
    def dart_no(self):
        return self.dart_number

    @property
    def last_dart_no(self):
        return getattr(self, "previous_dart_no", self.dart_sr_number)

    @property
    def defect_date(self):
        return self.dart_date

    @property
    def defect_description(self):
        return self.defective_discriptions

    @property
    def spare_required(self):
        return self.sapres_required


class CompleteDefectDart(Base):
    objects = CompleteDefectDartQuerySet.as_manager()

    serial_no = models.CharField(db_column="serial_no", max_length=200)
    dart_no = models.CharField(
        db_column="dart_no", max_length=200, null=True, blank=True
    )
    dart_details = models.ForeignKey(
        InitiateDart, on_delete=models.CASCADE, db_column="dart_details_id"
    )
    rectified_date = models.DateField(db_column="rectified_date", blank=True, null=True)
    repair_agency_code = models.ForeignKey(
        MRepairAgency,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    diagnostic_code = models.ForeignKey(
        MDiagnostic,
        on_delete=models.SET_DEFAULT,
        default="",
        blank=True,
        null=True,
        db_column="diagnostic_code_id",
    )
    repair_code = models.ForeignKey(
        MRepair,
        on_delete=models.SET_DEFAULT,
        default="",
        blank=True,
        null=True,
        db_column="repair_code_id",
    )
    delay_code = models.ForeignKey(
        MDelay,
        on_delete=models.SET_DEFAULT,
        default="",
        blank=True,
        null=True,
        db_column="delay_code_id",
    )

    days_delay = models.IntegerField(db_column="days_delay", blank=True, null=True)
    spares_delay = models.IntegerField(db_column="spares_delay", blank=True, null=True)
    other_reasons = models.TextField(db_column="other_reasons", blank=True, null=True)
    lesson_learnt = models.TextField(db_column="lesson_learnt", blank=True, null=True)
    # Closure push tracking. Separate from InitiateDart.cmms_sync_status, which only says
    # the DART itself reached CMMS — a DART can be pushed open and closed out later, so the
    # closure needs its own flag or every closure looks already-synced.
    cmms_sync_status = models.BooleanField(db_column="cmms_sync_status", default=False)
    cmms_sync_date = models.DateField(db_column="cmms_sync_date", blank=True, null=True)
    defect_report = models.FileField(
        db_column="defect_report", upload_to="defect_reports/", null=True, blank=True
    )

    class Meta:
        db_table = "dart_complete_defect_dart"

    def __str__(self):
        return str(self.dart_no or self.pk)


class DartSpareUsed(Base):
    complete_dart = models.ForeignKey(
        CompleteDefectDart,
        on_delete=models.CASCADE,
        related_name="spares_used",
        db_column="complete_dart_id",
    )
    pattern_no = models.CharField(
        db_column="pattern_no", max_length=255, blank=True, null=True
    )
    description = models.TextField(db_column="description")
    quantity = models.PositiveIntegerField(db_column="quantity", default=1)

    class Meta:
        db_table = "dart_dartspareused"

    def __str__(self):
        return str(self.description or self.pk)


class CompletedRoutine(Base):
    objects = CompletedRoutineQuerySet.as_manager()

    routine = models.ForeignKey(
        "ems.RoutineDescription",
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        db_column="routine_id",
    )
    old_dart_number = models.CharField(
        db_column="old_dart_number", max_length=200, default=""
    )
    new_dart_number = models.CharField(
        db_column="new_dart_number", max_length=200, default=""
    )

    date_of_completion = models.DateField(
        db_column="date_of_completion", blank=True, null=True
    )
    hours = models.IntegerField(db_column="hours", blank=True, null=True)
    minutes = models.IntegerField(db_column="minutes", blank=True, null=True)

    carried_by = models.CharField(
        db_column="carried_by", max_length=200, blank=True, null=True
    )
    p_no = models.CharField(db_column="p_no", max_length=50, blank=True, null=True)
    other_rank = models.CharField(
        db_column="other_rank", max_length=100, blank=True, null=True
    )
    rank = models.ForeignKey(
        MRanklist, on_delete=models.CASCADE, blank=True, null=True, db_column="rank_id"
    )
    total_manpower = models.IntegerField(
        db_column="total_manpower", blank=True, null=True
    )

    running_hour = models.CharField(
        db_column="running_hour", max_length=100, blank=True, null=True
    )
    due_running_hour = models.CharField(
        db_column="due_running_hour", max_length=100, blank=True, null=True
    )

    repair_remark = models.TextField(db_column="repair_remark", blank=True, null=True)
    completion_details = models.TextField(
        db_column="completion_details", blank=True, null=True
    )

    trial_team = models.BooleanField(default=False)
    rec_for_deletion = models.BooleanField(default=False)

    created_at = models.DateTimeField(db_column="created_at", auto_now_add=True)
    isfuss_close = models.BooleanField(db_column="isfuss_close", default=False)
    not_applicable = models.BooleanField(db_column="not_applicable", default=False)
    rec_deletion = models.BooleanField(db_column="rec_deletion", default=False)
    old_universal_id_t_dart = models.CharField(
        db_column="old_universal_id_t_dart", blank=True, null=True
    )

    class Meta:
        db_table = "dart_completedroutine"

    def __str__(self):
        return f"CompletedRoutine #{self.id} for Routine {self.routine.id}"


class RADLMaster(Base):
    ra_dl_name = models.CharField(max_length=250, null=True, blank=True)
    dockyard_name = models.CharField(max_length=250, null=True, blank=True)
    refit_type_name = models.CharField(max_length=250, null=True, blank=True)
    refit_type_f_key = models.ForeignKey(
        RefitMaintenancePeriod, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_date = models.DateField(auto_now_add=True)
    created_time = models.TimeField(auto_now_add=True)

    class Meta:
        db_table = "dart_radlmaster"

    def __str__(self):
        return self.ra_dl_name or "Unnamed RADL Master"


class DartSpare(Base):
    spare_id = models.IntegerField(
        null=True, blank=True, db_column="spare_id_id"
    )  # FK to obs.Spares (obs app not installed)
    dart = models.ForeignKey(
        InitiateDart,
        on_delete=models.CASCADE,
        related_name="spares",
        db_column="dart_id",
    )
    equipment_id = models.ForeignKey(
        ShipEquipment,
        on_delete=models.SET_DEFAULT,
        default="",
        blank=True,
        null=True,
        db_column="equipment_id_id",
    )
    pattern = models.CharField(db_column="pattern", max_length=255)
    inventory_type = models.CharField(
        db_column="inventory_type", max_length=255, null=True, blank=True
    )
    description = models.TextField(db_column="description")
    quantity = models.PositiveIntegerField(db_column="quantity", default=1)
    is_delete = models.BooleanField(db_column="is_delete", default=False)

    class Meta:
        db_table = "dart_dartspare"

    def __str__(self):
        return str(self.description or self.pk)


class TempDartSpare(Base):
    objects = TempDartSpareQuerySet.as_manager()

    issue_obj = models.ForeignKey(
        "obs.Issue",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column="issue_obj_id",
    )
    equipment_id = models.ForeignKey(
        ShipEquipment,
        on_delete=models.SET_DEFAULT,
        default="",
        blank=True,
        null=True,
        db_column="equipment_id_id",
    )
    spare = models.ForeignKey(
        "obs.Spares",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column="spare_id",
    )
    pattern = models.CharField(db_column="pattern", max_length=255)
    description = models.TextField(db_column="description")
    quantity = models.PositiveIntegerField(db_column="quantity", default=1)
    created_date = models.DateField(
        db_column="created_date", auto_now_add=True, blank=True, null=True
    )
    modified_date = models.DateField(
        db_column="modified_date", auto_now_add=True, blank=True, null=True
    )
    is_delete = models.BooleanField(db_column="is_delete", default=False)

    class Meta:
        db_table = "dart_tempdartspare"

    def __str__(self):
        return str(self.description or self.pk)


class CompletedRoutineSpare(Base):
    completed_routine = models.ForeignKey(
        CompletedRoutine,
        on_delete=models.CASCADE,
        related_name="spares",
        db_column="completed_routine_id",
    )
    spare_name = models.CharField(
        db_column="spare_name", max_length=200, null=False, blank=False
    )

    class Meta:
        db_table = "dart_completedroutine_spare"

    def __str__(self):
        return f"{self.spare_name} (Routine {self.completed_routine.id})"


class InitiateRADL(Base):
    DL_TYPE_CHOICES = (
        ("DL-II", "DL-II"),
        ("DL-III", "DL-III"),
        ("RA", "RA"),
    )

    STATUS_CHOICES = (
        ("DRAFT", "DRAFT"),
        ("GENERATED", "GENERATED"),
        ("APPROVED", "APPROVED"),
        ("DELETED", "DELETED"),
    )
    radl_master = models.ForeignKey(
        RADLMaster,
        on_delete=models.SET_DEFAULT,
        default="",
        blank=True,
        null=True,
        db_column="radl_master_id",
    )

    # 🔗 Link to defect
    initiate_dart = models.ForeignKey(
        InitiateDart,
        on_delete=models.CASCADE,
        related_name="ra_dl_entries",
        db_column="initiate_dart_id",
    )
    status = models.CharField(
        db_column="status", max_length=15, choices=STATUS_CHOICES, default="DRAFT"
    )

    #  DL / RA type
    dl_no = models.CharField(db_column="dl_no", max_length=250, blank=True, null=True)
    dl_type = models.CharField(
        db_column="dl_type", max_length=20, choices=DL_TYPE_CHOICES
    )
    dl_key = models.CharField(db_column="dl_key", max_length=250, null=True, blank=True)
    ra_grup_id = models.CharField(db_column="ra_grup_id", max_length=100)

    remarks = models.TextField(db_column="remarks", blank=True, null=True)
    additional_remarks = models.TextField(
        db_column="additional_remarks", blank=True, null=True
    )
    ra_type = models.CharField(max_length=50, null=True, blank=True)
    routing = models.CharField(max_length=100, null=True, blank=True)
    authority = models.CharField(max_length=100, null=True, blank=True)

    # is_active = models.BooleanField(default=False)
    active = models.BooleanField(default=False)
    #  Audit fields

    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dart_initiateradl"

    def __str__(self):
        return f"{self.initiate_dart} - {self.dl_type}"


class TCandef(Base):
    # Primary Key
    universal_id_t_candef = models.CharField(
        max_length=500, primary_key=True, db_column="Universal_ID_T_Candef"
    )

    # Fields from insert query
    candef_number = models.CharField(
        max_length=500, null=True, blank=True, db_column="CandefNumber"
    )
    sr_no = models.CharField(max_length=500, null=True, blank=True, db_column="SrNo")
    ship_sr_no = models.CharField(
        max_length=500, null=True, blank=True, db_column="ShipSrNo"
    )
    equipment_code = models.CharField(
        max_length=500, null=True, blank=True, db_column="EquipmentCode"
    )
    department_id = models.CharField(
        max_length=500, null=True, blank=True, db_column="DepartmentID"
    )
    department = models.CharField(
        max_length=500, null=True, blank=True, db_column="Department"
    )
    ex_dept = models.CharField(
        max_length=500, null=True, blank=True, db_column="ExDept"
    )
    ex_dept_id = models.CharField(
        max_length=500, null=True, blank=True, db_column="ExDeptID"
    )
    candef_date = models.CharField(
        max_length=100, null=True, blank=True, db_column="CandefDate"
    )
    defect_date = models.CharField(
        max_length=100, null=True, blank=True, db_column="DefectDate"
    )
    schedule_date = models.CharField(
        max_length=100, null=True, blank=True, db_column="ScheduleDate"
    )
    universal_id_ch_master_symptoms = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        db_column="Universal_ID_Ch_Master_Symptoms",
    )

    severity_id = models.CharField(
        max_length=500, null=True, blank=True, db_column="SeverityID"
    )
    severity_code = models.CharField(
        max_length=500, null=True, blank=True, db_column="SeverityCode"
    )
    universal_id_m_severity = models.CharField(
        max_length=500, null=True, blank=True, db_column="Universal_ID_M_Severity"
    )
    universal_id_ch_master_ship_remarks_by = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        db_column="Universal_ID_Ch_Master_Ship_Remarks_By",
    )
    universal_id_m_required_assistance = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        db_column="Universal_ID_M_RequiredAssistance",
    )
    is_ost_observation = models.CharField(
        max_length=100, null=True, blank=True, db_column="IsOstObservation"
    )
    universal_id_m_ost_list = models.CharField(
        max_length=500, null=True, blank=True, db_column="Universal_ID_M_OSTList"
    )
    defective_component = models.CharField(
        max_length=500, null=True, blank=True, db_column="DefectiveComponent"
    )
    remarks = models.TextField(null=True, blank=True, db_column="Remarks")
    defect_description = models.TextField(
        null=True, blank=True, db_column="DefectDescription"
    )
    is_closed = models.IntegerField(default=0, db_column="IsClosed")
    is_defect = models.IntegerField(default=1, db_column="Is_Defect")
    active = models.IntegerField(default=1, db_column="Active")
    nil_dart = models.IntegerField(default=0, db_column="NILDart")
    is_amp = models.IntegerField(default=0, db_column="Is_Amp")
    is_signal_drafted = models.IntegerField(default=0, db_column="Is_Signal_Drafted")
    is_refit = models.IntegerField(default=0, db_column="Is_Refit")
    is_routine = models.IntegerField(default=0, db_column="Is_Routine")
    is_dl_ii_drafted = models.IntegerField(default=0, db_column="Is_DLIIDrafted")
    is_refit_ra_draft = models.IntegerField(default=0, db_column="Is_RefitRADraft")
    is_gd_form = models.IntegerField(default=0, db_column="IsGDForm")
    universal_id_m_ship = models.CharField(
        max_length=500, null=True, blank=True, db_column="Universal_ID_M_Ship"
    )
    universal_id_m_department = models.CharField(
        max_length=500, null=True, blank=True, db_column="Universal_ID_M_Department"
    )
    universal_id_t_equipment_ship_detail = models.CharField(
        max_length=500,
        null=True,
        blank=True,
        db_column="Universal_ID_T_EquipmentShipDetail",
    )
    created_date = models.CharField(
        max_length=100, null=True, blank=True, db_column="CreatedDate"
    )
    routine_defect = models.IntegerField(default=2, db_column="RoutineDefect")
    is_final_submit = models.IntegerField(default=1, db_column="Is_Final_Submit")
    serial_number = models.CharField(
        max_length=500, null=True, blank=True, db_column="Serial_Number"
    )
    is_operational = models.CharField(
        max_length=500, null=True, blank=True, db_column="Is_Operational"
    )
    universal_id_t_ref_comp = models.CharField(
        max_length=500, null=True, blank=True, db_column="Universal_ID_T_RefComp"
    )

    # Fields from update query (CompleteCANDEFUpdateAPI)
    rectified_date = models.CharField(
        max_length=100, null=True, blank=True, db_column="RectifiedDate"
    )
    cancel_date = models.CharField(
        max_length=100, null=True, blank=True, db_column="CancelDate"
    )
    diagnostic_code = models.CharField(
        max_length=500, null=True, blank=True, db_column="DiagnosticCode"
    )
    repair_code = models.CharField(
        max_length=500, null=True, blank=True, db_column="RepairCode"
    )
    delay_reason_days = models.IntegerField(
        null=True, blank=True, db_column="DelayReasonDays"
    )
    additional_remarks = models.TextField(
        null=True, blank=True, db_column="Additional_Remarks"
    )
    spares_availability = models.IntegerField(
        null=True, blank=True, db_column="SparesAvailability"
    )
    diagnostic_id = models.IntegerField(null=True, blank=True, db_column="DiagnosticID")
    repair_id = models.IntegerField(null=True, blank=True, db_column="RepairID")
    repair_agency_id = models.IntegerField(
        null=True, blank=True, db_column="RepairAgencyID"
    )
    agency_code = models.CharField(
        max_length=500, null=True, blank=True, db_column="AgencyCode"
    )
    delay_id = models.IntegerField(null=True, blank=True, db_column="DelayID")
    delay_code = models.CharField(
        max_length=500, null=True, blank=True, db_column="DelayCode"
    )
    universal_id_m_repair = models.CharField(
        max_length=500, null=True, blank=True, db_column="Universal_ID_M_Repair"
    )
    universal_id_m_delay = models.CharField(
        max_length=500, null=True, blank=True, db_column="Universal_ID_M_Delay"
    )
    universal_id_m_diagnostic = models.CharField(
        max_length=500, null=True, blank=True, db_column="Universal_ID_M_Diagnostic"
    )
    universal_id_m_repair_agency = models.CharField(
        max_length=500, null=True, blank=True, db_column="Universal_ID_M_RepairAgency"
    )
    is_auto_generated_dart = models.IntegerField(
        null=True, blank=True, db_column="Is_Auto_Generated_Dart"
    )
    updated_date = models.DateTimeField(auto_now=True, db_column="UpdatedDate")

    class Meta:
        db_table = "T_Candef"


# Alias & Configuration Models
RepairAgencyMaster = MRepairAgency
ShipRemarksMaster = ChMasterShipRemarksBy
DefectTransaction = InitiateDart
DefectSpareTransaction = DartSpareUsed
EquipmentGuarantee = InitiateDart
RequestAssistance = InitiateRADL


# multidart models


class MultiDartDraft(Base):
    # Code written by Unknown: the name the department sees in the drafts list, asked for on first save.
    name = models.CharField(max_length=200)
    # Code written by Unknown: the sharing boundary. Every user of this department who can reach the
    # Defect module sees this draft, which is the whole point - one person starts a batch at sea and
    # another finishes it. Same Department model Initiate_Dart.department_id points at, so the two
    # scope identically.
    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="multi_dart_drafts",
    )
    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="multi_dart_drafts_created",
    )
    last_updated_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="multi_dart_drafts_updated",
    )
    # Code written by Unknown: the grid exactly as it stands - one entry per row carrying its field
    # values, its temporary DART number and its three linked-spares lists (obs / ilms / pil), in the
    # same shape the single DART form posts them.
    payload = models.JSONField(default=dict, blank=True)

    # Code written by Unknown: the soft lock. locked_by holds whoever currently has the draft open and
    # locked_at is refreshed by a heartbeat from that page. A lock older than the lapse window is
    # treated as gone, so a closed browser or a dropped connection can never strand a draft with
    # nobody able to edit it - the alternative, an explicit unlock on page close, is exactly the
    # signal a browser is least reliable at sending.
    locked_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="multi_dart_drafts_locked",
    )
    locked_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Code written by Unknown: soft delete, matching the is_delete convention DartSpare, TempDartSpare,
    # DartWedSpare and DartMOSpare already use in this codebase.
    is_delete = models.BooleanField(default=False)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.name} ({self.department_id})"
