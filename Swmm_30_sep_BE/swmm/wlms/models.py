from accounts.models import CustomUserProfile
from django.contrib.postgres.indexes import GinIndex
from django.db import models
from django.db.models import Value
from django.db.models.functions import Replace, Upper
from op_maintenance.models import InitiateDart
from master.models import Base

# Developed by Unknown: The same normalisation `obs.services.import_rules
# ._normalised_item_code_expression` applies at query time - space/tab/nbsp stripped,
# upper-cased - duplicated here rather than imported (see `ilms.models` for the identical
# helper and the circular-import reason). `resolve_pattern_sources` filters `WLMSSpare` on
# exactly this expression to cross-check a typed pattern number against the live WLMS-synced
# table; without an index backing it, that filter forces a full scan on every import preview.
def _normalised_item_code_index(name):
    return models.Index(
        Upper(
            Replace(
                Replace(Replace("item_code", Value(" "), Value("")), Value("\t"), Value("")),
                Value("\xa0"),
                Value(""),
            )
        ),
        name=name,
    )


class BaseQuerySet(models.QuerySet):
    def _status_filter(self, enabled=True):
        # if any(field.name == "is_active" for field in self.model._meta.fields):
        #     return {"is_active": enabled}
        if any(field.name == "active" for field in self.model._meta.fields):
            return {"active": enabled}
        return {}

    def active(self):
        filters = self._status_filter(True)
        return self.filter(**filters) if filters else self

    def inactive(self):
        filters = self._status_filter(False)
        return self.filter(**filters) if filters else self.none()


class BaseManager(models.Manager):
    def get_queryset(self):
        return BaseQuerySet(self.model, using=self._db)

    def active(self):
        return self.get_queryset().active()

    def inactive(self):
        return self.get_queryset().inactive()


class WLMSEquipment(Base):
    objects = BaseManager()
    eqpt_id = models.IntegerField(blank=True, null=True)
    eqpt_name = models.CharField(max_length=255, null=True, blank=True)
    remarks = models.TextField(null=True, blank=True)
    # is_active = models.BooleanField(default=False)
    active = models.BooleanField(default=False)
    control_cell_id = models.IntegerField(blank=True, null=True)
    sco_id = models.IntegerField(blank=True, null=True)
    depot_id = models.IntegerField(blank=True, null=True)
    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="wed_equipment_created",
    )
    created_date = models.DateTimeField(auto_now_add=True, blank=True, null=True)
    updated_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="wed_equipment_updated",
    )
    updated_date = models.DateTimeField(auto_now_add=True, blank=True, null=True)

    def __str__(self):
        return self.eqpt_name or ""

    class Meta:
        db_table = "WLMS_wlmsequipment"


class WedItemSourceOfTruth(Base):
    """Statically seeded WED item codes, read last by the onboard-spares import's
    pattern-number cross-check. Ported from source alongside the `obs` merge, since
    `obs.services` depends on it for the pattern-number cross-check."""

    objects = BaseManager()
    # THE NORMALISED CODE IS WHAT IS STORED, not the code as the workbook spelled it.
    # `obs.services.normalise_item_code` upper-cases and removes every space, and the seeder
    # applies it before writing, so this column is both the stored value and the matching key.
    # 255 and not 100: the source workbook holds codes longer than 100 characters (up to 155).
    item_code = models.CharField(max_length=255, primary_key=True)
    # NOT NULLABLE, by explicit instruction. A code the source file leaves without a category,
    # and a code the source file gives two different categories, are both seeded `P`.
    crp_category = models.CharField(max_length=100)

    def __str__(self):
        return self.item_code

    class Meta:
        db_table = "WLMS_wed_item_sot"
        # GIN index over `gin_trgm_ops` is what makes `TrigramSimilarity` cheap enough to run
        # inside an import preview. Requires the `pg_trgm` extension.
        indexes = [
            GinIndex(
                fields=["item_code"],
                opclasses=["gin_trgm_ops"],
                name="wed_sot_code_trgm",
            ),
        ]


class WLMSSpare(Base):
    objects = BaseManager()
    wlms_inventory = models.CharField(max_length=100, null=True, blank=True)
    item_code = models.CharField(max_length=100, null=True, blank=True)
    item_desc = models.TextField(null=True, blank=True)
    category = models.CharField(max_length=100, null=True, blank=True)
    eqpt = models.ForeignKey(
        WLMSEquipment,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    denom_id = models.CharField(max_length=100, null=True, blank=True)
    sh_name = models.CharField(max_length=100, null=True, blank=True)
    latest_qty = models.IntegerField(blank=True, null=True)
    # is_active = models.BooleanField(default=False)
    active = models.BooleanField(default=False)
    typeofspare = models.CharField(max_length=100, null=True, blank=True)

    def __str__(self):
        return self.item_code or ""

    class Meta:
        db_table = "WLMS_wlmsspare"
        indexes = [_normalised_item_code_index("wlms_wlmsspare_code_norm_idx")]


class SpareDataMap(Base):
    objects = BaseManager()
    equipment = models.ForeignKey(
        "sfd.ShipEquipment",
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="wlms_spare_data_maps",
    )
    wed_equipment = models.ForeignKey(
        WLMSEquipment,
        on_delete=models.CASCADE,
        related_name="spare_data_maps",
        blank=True,
        null=True,
    )
    wed_spares = models.ForeignKey(
        WLMSSpare,
        on_delete=models.CASCADE,
        related_name="spare_data_maps",
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.equipment} | {self.wed_equipment}"

    class Meta:
        db_table = "WLMS_sparedataMap"


class PlannedSparesDescription(Base):
    objects = BaseManager()
    wlms_spare_id = models.ForeignKey(WLMSSpare, on_delete=models.CASCADE, blank=True)
    routine_description_id = models.ForeignKey(
        "ems.RoutineDescription",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="wlms_planned_spares",
        db_column="routine_description_id",
    )
    spares_required = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)

    def __str__(self):
        return str(self.pk)

    class Meta:
        db_table = "WLMS_plannedsparesdescription"


class PlannedWEDSpareList(Base):
    objects = BaseManager()
    pattern_number = models.CharField(max_length=200, blank=True, default="")
    planned_spares_description = models.ForeignKey(
        PlannedSparesDescription,
        on_delete=models.CASCADE,
    )
    quantity_required = models.PositiveIntegerField(default=0)
    is_deleted = models.BooleanField(default=False)

    def __str__(self):
        return str(self.pattern_number or self.pk)

    class Meta:
        db_table = "WLMS_plannedwedsparelist"


class DartWedSpare(Base):
    objects = BaseManager()
    issue_obj = models.ForeignKey(
        "obs.Issue",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    equipment_id = models.ForeignKey(
        "sfd.ShipEquipment",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="dart_wed_spares",
        db_column="equipment_id_id",
    )
    wed_spare = models.ForeignKey(
        WLMSSpare,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    dart_id = models.ForeignKey(
        InitiateDart,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="wed_spares",
        db_column="dart_id_id",
    )
    pattern = models.CharField(max_length=255, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    created_date = models.DateField(auto_now_add=True, blank=True, null=True)
    modified_date = models.DateField(auto_now_add=True, blank=True, null=True)
    is_delete = models.BooleanField(default=False)

    def __str__(self):
        return str(self.description or self.pk)

    class Meta:
        db_table = "WLMS_dartwedspare"


class SurveyReceiptsDetails(Base):
    objects = BaseManager()
    user_id = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )
    wed_spares_id = models.ForeignKey(
        WLMSSpare,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    spare_cart_name = models.CharField(max_length=200, blank=True, default="")
    obs_spare_id = models.ForeignKey(
        "obs.Spares",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    wed_routine_plan = models.ForeignKey(
        PlannedSparesDescription,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    wed_dart = models.ForeignKey(
        DartWedSpare,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    is_save = models.BooleanField(default=False)
    is_survey = models.BooleanField(default=False)
    is_sync = models.BooleanField(default=False)
    is_hod = models.BooleanField(default=False)
    is_approval = models.BooleanField(default=False)
    wlms_status = models.CharField(max_length=200, blank=True, default="")
    sync_date = models.DateTimeField(auto_now=False, blank=True, null=True)
    wlms_survey_status = models.CharField(max_length=200, default="Pending")

    def __str__(self):
        return str(self.spare_cart_name or self.pk)

    class Meta:
        db_table = "WLMS_surveyreceiptsdetails"


class SurveyFormsDetails(Base):
    objects = BaseManager()
    survey_rec_id = models.ForeignKey(
        SurveyReceiptsDetails,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )
    rece_qty = models.CharField(max_length=200, blank=True, default="")
    held_certificate_type = models.CharField(max_length=200, blank=True, default="")
    held_certificate_no = models.CharField(max_length=200, blank=True, default="")
    held_certificate_date = models.DateField(null=True, blank=True)
    held_certificate = models.FileField(
        upload_to="wed_survey/",
        null=True,
        blank=True,
    )
    survey_no = models.CharField(max_length=200, blank=True, default="")
    wlms_survey_no = models.CharField(max_length=200, blank=True, default="")
    ss_remarks = models.CharField(max_length=200, blank=True, default="")
    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="wed_servey_created",
    )
    created_date = models.DateTimeField(auto_now_add=True, blank=True, null=True)
    updated_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="wed_servey_updated",
    )
    updated_date = models.DateTimeField(auto_now_add=True, blank=True, null=True)
    scrap_qty = models.CharField(max_length=200, blank=True, default="")

    def __str__(self):
        return str(self.rece_qty or self.pk)

    class Meta:
        db_table = "WLMS_surveyformsdetails"


class SurveyFormsItems(Base):
    objects = BaseManager()
    survey_details_id = models.ForeignKey(
        SurveyFormsDetails,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )
    wed_spares_id = models.ForeignKey(
        WLMSSpare,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    item_serial_no = models.CharField(max_length=200, blank=True, default="")

    def __str__(self):
        return str(self.id)

    class Meta:
        db_table = "WLMS_surveyformsitems"


class PTSDemandDetails(Base):
    objects = BaseManager()
    user_id = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )
    wed_spares_id = models.ForeignKey(
        WLMSSpare,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    obs_spare_id = models.ForeignKey(
        "obs.Spares",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    wed_routine_plan = models.ForeignKey(
        PlannedSparesDescription,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    wed_dart = models.ForeignKey(
        DartWedSpare,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    survey_no = models.CharField(max_length=200, blank=True, default="")
    PTS_demand_no = models.CharField(max_length=200, blank=True, default="")
    demand_no = models.CharField(max_length=200, blank=True, default="")
    demand_qty = models.CharField(max_length=200, blank=True, default="")
    remarks = models.TextField(null=True, blank=True)
    is_save = models.BooleanField(default=False)
    is_pts = models.BooleanField(default=False)
    is_sync = models.BooleanField(default=False)
    is_rejected = models.BooleanField(default=False)
    spare_cart_name = models.CharField(max_length=200, blank=True, default="")
    is_hod = models.BooleanField(default=False)
    is_approval = models.BooleanField(default=False)
    sync_date = models.DateTimeField(auto_now=False, blank=True, null=True)
    wlms_pts_status = models.CharField(max_length=200, default="Pending")
    wed_demandno = models.CharField(max_length=200, blank=True, null=True)

    def __str__(self):
        return str(self.id)

    class Meta:
        db_table = "WLMS_ptsdemanddetails"


class PTSItems(Base):
    objects = BaseManager()
    pts_details_id = models.ForeignKey(
        PTSDemandDetails,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )
    wed_spares_id = models.ForeignKey(
        WLMSSpare,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    item_serial_no = models.CharField(max_length=200, blank=True, default="")

    def __str__(self):
        return str(self.id)


class DemandDetails(Base):
    objects = BaseManager()
    user_id = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )
    wed_spares_id = models.ForeignKey(
        WLMSSpare,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    obs_spare_id = models.ForeignKey(
        "obs.Spares",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    wed_routine_plan = models.ForeignKey(
        PlannedSparesDescription,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    wed_dart = models.ForeignKey(
        DartWedSpare,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    survey_no = models.CharField(max_length=200, blank=True, default="")
    PTS_no = models.CharField(max_length=200, blank=True, default="")
    demand_no = models.CharField(max_length=200, blank=True, default="")
    demand_qty = models.CharField(max_length=200, blank=True, default="")
    remarks = models.TextField(null=True, blank=True)
    is_save = models.BooleanField(default=False)
    is_demand = models.BooleanField(default=False)
    is_sync = models.BooleanField(default=False)
    sync_date = models.DateTimeField(auto_now=False, blank=True, null=True)
    is_rejected = models.BooleanField(default=False)
    spare_cart_name = models.CharField(max_length=200, blank=True, default="")
    demand_pdf = models.FileField(upload_to="wed_demand/", null=True, blank=True)
    is_hod = models.BooleanField(default=False)
    is_approval = models.BooleanField(default=False)
    is_delete = models.BooleanField(default=False)
    wlms_demand_status = models.CharField(max_length=200, default="Pending")
    wed_demandno = models.CharField(max_length=200, blank=True, null=True)

    def __str__(self):
        return str(self.survey_no or self.pk)

    class Meta:
        db_table = "WLMS_demanddetails"


class ReceiveDemandDetails(Base):
    objects = BaseManager()
    demand_details = models.ForeignKey(
        DemandDetails,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    pts_details = models.ForeignKey(
        PTSDemandDetails,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    demand_number = models.CharField(max_length=200, blank=True, null=True)
    demand_date = models.DateField(blank=True, null=True)
    demand_quantity = models.IntegerField(default=0)
    original_demand_qty = models.IntegerField(default=0, blank=True, null=True)
    demand_status = models.CharField(max_length=100, blank=True, null=True)
    swmm_demandno = models.CharField(max_length=200, blank=True, null=True)
    dart_no = models.CharField(max_length=200, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    gate_pass_no = models.CharField(max_length=200, blank=True, null=True)
    gate_pass_date = models.DateTimeField(auto_now=False, blank=True, null=True)
    received_qty = models.IntegerField(default=0, blank=True, null=True)
    received_date = models.DateField(blank=True, null=True)

    def __str__(self):
        return str(self.demand_number)

    class Meta:
        db_table = "WLMS_receivedemanddetails"


class WEDIIF(Base):
    objects = BaseManager()
    user_id = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )
    spare_id = models.ForeignKey(
        "obs.Spares",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    is_sync = models.BooleanField(default=False)
    is_hod = models.BooleanField(default=False)
    is_approval = models.BooleanField(default=False)
    sync_response = models.BooleanField(default=False)
    is_delete = models.BooleanField(default=False)
    sync_date = models.DateTimeField(auto_now=False, blank=True, null=True)
    wlms_iif_status = models.CharField(max_length=200, default="Pending")
    # Tags whether this IIF entry originated from the 'survey'/'pts'/'demand' workflow, decided
    # by the spare's own category (see `WEDIIFViewSet.add_items`) — never trusted from the
    # frontend alone. Ported from source's `WEDIIF.iif_cart` (`add_to_iif_cart`).
    iif_cart = models.CharField(max_length=20, blank=True, default="")

    def __str__(self):
        return str(self.pk)

    class Meta:
        db_table = "WLMS_wediif"


class WEDIIFDetails(Base):
    objects = BaseManager()
    # Free-form "other spare" fields — populated only when `WEDIIFViewSet.raise_iif` is
    # called for a spare that isn't yet catalogued in `obs.Spares` (`spare_id="other"` on
    # source's `wlms_raise_iif`). Left blank/null on the existing-spare path, where the
    # spare's own data already lives on `obs.Spares` via `WEDIIF.spare_id`.
    CATEGORY_CHOICES = [
        ("P", "P"),
        ("C", "C"),
        ("QP", "QP"),
    ]
    category = models.CharField(
        max_length=30, blank=True, default="", choices=CATEGORY_CHOICES
    )
    denomination = models.ForeignKey(
        "obs.Denomination",
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )
    pattern_number = models.SlugField(max_length=500, blank=True, default="")
    description = models.CharField(max_length=1000, blank=True, default="")
    wed_iif = models.ForeignKey(
        WEDIIF,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="details",
    )
    iif_no = models.CharField(max_length=200, blank=True, null=True)
    comly_in_other_eqpt = models.CharField(max_length=200, blank=True, null=True)
    annual_req = models.CharField(max_length=200, blank=True, null=True)
    phone_no = models.IntegerField(blank=True, null=True)
    Specification = models.CharField(max_length=200, blank=True, null=True)
    address = models.TextField(null=True, blank=True)
    Qty_fitted_in_eqpt = models.CharField(max_length=200, blank=True, null=True)
    iif_photo = models.FileField(upload_to="wed_iif/", null=True, blank=True)
    proposed_MSL = models.CharField(max_length=200, blank=True, null=True)
    drawing_no = models.CharField(max_length=200, blank=True, null=True)
    drawing_doc = models.FileField(upload_to="wed_iif/", null=True, blank=True)
    poev_costing_rs = models.CharField(max_length=200, blank=True, null=True)
    bq_amount_rs = models.CharField(max_length=200, blank=True, null=True)
    bq_doc = models.FileField(upload_to="wed_iif/", null=True, blank=True)
    ss_remarks = models.TextField(null=True, blank=True)

    def __str__(self):
        return str(self.iif_no or self.pk)

    class Meta:
        db_table = "WLMS_wediifdetails"


class SignalDemand(Base):
    objects = BaseManager()
    OPDEM = "OPDEM"
    STOREDEM = "STOREDEM"
    CANDEM = "CANDEM"

    DEMAND_TYPE_CHOICES = [
        (OPDEM, "Operational Demand"),
        (STOREDEM, "Store Demand"),
        (CANDEM, "Cannibalisation Demand"),
    ]

    REGISTERED = "REGISTERED"
    FORWARDED = "FORWARDED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"

    STATUS_CHOICES = [
        (REGISTERED, "Registered"),
        (FORWARDED, "Forwarded"),
        (APPROVED, "Approved"),
        (REJECTED, "Rejected"),
        (CANCELLED, "Cancelled"),
    ]

    demand_type = models.CharField(
        max_length=20,
        choices=DEMAND_TYPE_CHOICES,
    )
    demand_number = models.CharField(max_length=100)
    dtg = models.DateTimeField()
    requesting_ship = models.ForeignKey(
        "master.Ship",
        on_delete=models.PROTECT,
        related_name="raised_signal_demands",
        null=True,
    )
    receiver_ship = models.ForeignKey(
        "master.Ship",
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="received_cannibalisation_demands",
    )
    equipment = models.ForeignKey(
        WLMSEquipment,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="signal_demands",
    )
    wed_spare = models.ForeignKey(
        WLMSSpare,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="signal_demands",
    )
    obs_spare = models.ForeignKey(
        "obs.Spares",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="wlms_signal_demands",
    )
    pts_number = models.CharField(max_length=100, blank=True, default="")
    demand_quantity = models.PositiveIntegerField(default=1)
    attachment = models.FileField(
        upload_to="wlms/signal_demands/",
        null=True,
        blank=True,
    )
    remarks = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=REGISTERED,
    )
    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.PROTECT,
        related_name="created_signal_demands",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "WLMS_signaldemand"
        ordering = ["-dtg", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=("demand_type", "demand_number"),
                name="unique_wlms_signal_demand_number",
            )
        ]

    def __str__(self):
        return f"{self.demand_type} - {self.demand_number}"
