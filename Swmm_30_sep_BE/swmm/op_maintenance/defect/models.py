import os

from django.conf import settings
from django.core.validators import MaxLengthValidator
from django.db import models
from django.utils import timezone
from ems.models import EquipmentName
from master.models import (
    Base,
    ChMasterShipRemarksBy,
    ChMasterSymptoms,
    Department,
    Manufacturer,
    MRequiredAssistance,
    MSeverity,
    RefitMaintenancePeriod,
    Supplier,
)
from master.models import EquipmentType as MasterEquipmentType
from sfd.models import CompartmentMaster, EquipmentType, ShipEquipment

DEFECT_TYPE_CHOICES = [
    ("DEFECT","Defect"),
    ("AS_AND_AS", "AS & AS"),
    ("ABER", "ABER"),
    ("GUARANTEE", "Guarantee"),
    ("SERVICE", "Service"),
]

CATEGORY_CHOICES = [
    ("CAT1", "CAT1"),
    ("CAT2", "CAT2"),
    ("CAT3", "CAT3"),
]

AS_AND_AS_TYPE_CHOICES = [
    ("MAJOR", "Major"),
    ("MINOR", "Minor"),
]

NATURE_OF_AS_AND_AS_CHOICES = [
    ("ALTERATION", "Alteration"),
    ("ADDITION", "Addition"),
]

STATUS_CHOICES = [
    ("OPEN", "Open"),
    ("DRAFT", "Draft"),
    ("IN_PROGRESS", "In Progress"),
    ("RECTIFIED", "Rectified"),
    ("CLOSED", "Closed"),
]

INVENTORY_TYPE_CHOICES = [
    ("OBS", "OBS"),
    ("PIL", "PIL"),
    ("WED", "WED"),
    ("MO", "MO"),
]

DECK_NO_CHOICES = [(f"deck{n:02d}", f"Deck {n:02d}") for n in range(1, 11)]


def defect_photograph_upload_to(instance, filename):
    """Builds: dart_photos/<DEFECT_TYPE>/<DEFECT_TYPE>_<yyyyMMddHHmmss><ext>"""
    ext = os.path.splitext(filename)[1]
    defect_type = (instance.defect_type or "DEFECT").upper()
    timestamp = timezone.now().strftime("%Y%m%d%H%M%S")
    return f"dart_photos/{defect_type}/{defect_type}_{timestamp}{ext}"


class DefectInitiateDart(Base):
    """Standalone table (`defect_initiate_dart`) for the defect_* API surface, field-for-
    field copy of dart.models.InitiateDart. Managed separately from InitiateDart until
    InitiateDart/dart_initiate_dart is retired in favour of this one."""

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
    nature_of_as_and_as = models.CharField(
        max_length=20,
        choices=NATURE_OF_AS_AND_AS_CHOICES,
        blank=True,
        null=True,
    )
    target_completion_date = models.DateField(blank=True, null=True)
    as_and_as_justification = models.TextField(blank=True, null=True)
    sanctioning_authority = models.CharField(max_length=255, blank=True, null=True)

    # ABER (CAT1/CAT2) fields
    installation_date = models.DateField(blank=True, null=True)
    authority_for_installation = models.CharField(max_length=255, blank=True, null=True)
    qty_fitted = models.PositiveIntegerField(blank=True, null=True)
    shelf_life_service_life = models.CharField(max_length=100, blank=True, null=True)
    running_hours_as_on_date = models.CharField(max_length=50, blank=True, null=True)
    equipment_section = models.CharField(max_length=255, blank=True, null=True)
    equipment_type = models.ForeignKey(
        EquipmentType,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="+",
    )
    raised_with_as_and_as = models.BooleanField(blank=True, null=True)
    repair_cost = models.DecimalField(
        max_digits=12, decimal_places=2, blank=True, null=True
    )
    book_value = models.DecimalField(
        max_digits=12, decimal_places=2, blank=True, null=True
    )
    aber_justification = models.TextField(blank=True, null=True)
    as_and_as_reference_number = models.CharField(
        max_length=100, blank=True, null=True
    )
    linked_as_and_as_justification = models.TextField(blank=True, null=True)

    # Denormalized from equipment_ship at creation time (AS_AND_AS and ABER CAT1/CAT2,
    # where an existing ShipEquipment is picked rather than described by free text like
    # CAT3) -- equipment_serial_no and compartment below are the CAT3 equivalents, reused
    # here rather than duplicated again.
    equipment_nomenclature = models.CharField(max_length=255, blank=True, null=True)
    equipment_code = models.CharField(max_length=255, blank=True, null=True)
    location_on_board = models.CharField(max_length=255, blank=True, null=True)

    # ABER CAT3 only -- CAT3 covers equipment not (yet) in the ShipEquipment master, so
    # it's described by free text / its own OEM+supplier dropdowns instead of picking an
    # existing equipment_ship row.
    equipment_name_text = models.CharField(max_length=255, blank=True, null=True)
    model_type = models.ForeignKey(
        MasterEquipmentType,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="+",
    )
    oem = models.ForeignKey(
        Manufacturer,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="+",
    )
    supplier_fkey = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="+",
    )
    new_oem_name = models.CharField(max_length=255, blank=True, null=True)
    new_oem_supplier = models.CharField(max_length=255, blank=True, null=True)
    new_oem_part_no = models.CharField(max_length=255, blank=True, null=True)
    equipment_serial_no = models.CharField(max_length=255, blank=True, null=True)
    deck_no = models.CharField(
        max_length=10, choices=DECK_NO_CHOICES, blank=True, null=True
    )
    frame_station = models.CharField(max_length=100, blank=True, null=True)

    symptom_code = models.ForeignKey(
        ChMasterSymptoms,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="+",
    )
    severity_code = models.ForeignKey(
        MSeverity,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="+",
        db_column="serverity_code_id",
    )
    remark_code = models.ForeignKey(
        ChMasterShipRemarksBy,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="+",
    )
    require_assistance_for_code = models.ForeignKey(
        MRequiredAssistance,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="+",
    )

    refit_maintenance_period_f_key = models.ForeignKey(
        RefitMaintenancePeriod,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="+",
    )

    equipment_ship = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="+",
    )
    department_id = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="+",
    )
    equipment_ems = models.ForeignKey(
        EquipmentName,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="+",
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
    rectification_date = models.DateField(auto_now_add=False, blank=True, null=True)
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
    photograph = models.FileField(
        upload_to=defect_photograph_upload_to, null=True, blank=True
    )
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
    equipment_status_text= models.CharField(max_length=50, null=True, blank=True)
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
        related_name="+",
    )
    compartment = models.ForeignKey(
        CompartmentMaster,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    service_fkey = models.ForeignKey(
        "dart.ServiceMaster",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    certificate_type_fkey = models.ForeignKey(
        "dart.CertificateTypeMaster",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    equipment_status = models.ForeignKey(
        "dart.EquipmentStatusMaster",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    authority_document = models.ForeignKey(
        "dart.AuthorityDocumentMaster",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    dtnr = models.ForeignKey(
        "dart.DTNRMaster",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    as_type = models.ForeignKey(
        "dart.ASTypeMaster",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    dart_trigger = models.ForeignKey(
        "dart.DARTTriggerMaster",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    dockyard_service = models.ForeignKey(
        "dart.DockyardServiceMaster",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        db_table = "defect_initiate_dart"

    def __str__(self):
        return str(self.dart_number or self.pk)


class DefectDartSpare(Base):
    """Single, unified spares table for the defect_* API surface -- one row per spare
    line-item on a defect, segregated by `inventory_type` instead of one table per
    inventory type (the legacy dart_dartspare / wlms_dartwedspare / ilms_dartmospare
    split). `spare_ref_id` is a bare id (not a real FK) into whichever source table
    `inventory_type` points at (obs.Spares for OBS/PIL, wlms.WLMSSpare for WED,
    ilms.Item for MO) -- same "id, not FK" approach the legacy DartSpare.spare_id used,
    since one field can't cleanly FK three different models."""

    dart = models.ForeignKey(
        DefectInitiateDart,
        on_delete=models.CASCADE,
        related_name="dart_spares",
    )
    equipment_ship = models.ForeignKey(
        ShipEquipment,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="+",
    )
    inventory_type = models.CharField(max_length=10, choices=INVENTORY_TYPE_CHOICES)
    spare_ref_id = models.IntegerField(null=True, blank=True)
    pattern = models.CharField(max_length=255, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    quantity = models.PositiveIntegerField(default=1)
    is_delete = models.BooleanField(default=False)
    created_date = models.DateTimeField(auto_now_add=True, blank=True, null=True)

    class Meta:
        db_table = "defect_dart_spare"

    def __str__(self):
        return f"{self.inventory_type}: {self.description or self.pattern or self.pk}"


class DefectEquipmentStatusMaster(Base):
    """Mirrors op_maintenance.models.EquipmentStatusMaster (table
    `dart_equipment_status_master`) for use in the defect_* API surface. Unmanaged: the
    table is owned/migrated by EquipmentStatusMaster."""

    class EquipmentStatus(models.TextChoices):
        OPERATIONAL = "operational", "Operational"
        PARTIALLY_NON_OPS = "partially_non_ops", "Partially Non Ops"
        NON_OPS = "non_ops", "Non Ops"

    status = models.CharField(choices=EquipmentStatus.choices, max_length=25, unique=True)
    description = models.CharField(max_length=250, blank=True, null=True)
    readiness_impact = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = "dart_equipment_status_master"
        managed = False

    def __str__(self):
        return self.status or ""
