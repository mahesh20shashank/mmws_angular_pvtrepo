from accounts.models import CustomUserProfile
from django.contrib.postgres.indexes import GinIndex
from django.db import models
from django.db.models import Value
from django.db.models.functions import Replace, Upper
from master.models import Base
from op_maintenance.models import InitiateDart

from .managers import BaseManager

# Developed by Unknown: The same normalisation `obs.services.import_rules
# ._normalised_item_code_expression` applies at query time - space/tab/nbsp stripped,
# upper-cased - duplicated here rather than imported, since `obs` imports FROM `ilms` and an
# import the other way would be circular. `obs.services.import_rules.resolve_pattern_sources`
# filters `Item` on exactly this expression to cross-check a typed pattern number against the
# live CMMS-synced table (whose `item_code` is not itself stored normalised, unlike the two
# source-of-truth tables). Without an index backing it, that filter cannot use `item_code`'s
# own primary-key index at all and forces Postgres to compute the expression fresh for every
# row of the table - a full scan of ~1M rows, unconditionally, on every single import preview
# regardless of how many rows the uploaded sheet has. This functional index is what turns that
# into an index scan instead.
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


class MOItemEquipment(Base):
    objects = BaseManager()
    itemcode = models.CharField(max_length=50, null=True, blank=True)
    eask_item_code = models.CharField(max_length=50, null=True, blank=True)
    eask_type = models.CharField(max_length=50, null=True, blank=True)
    qty_constituent = models.IntegerField(null=True, blank=True)
    qty_range_scale = models.IntegerField(null=True, blank=True)
    eask_book_ref = models.CharField(max_length=100, null=True, blank=True)
    datetime_approved = models.DateTimeField(null=True, blank=True)
    approved_by = models.CharField(max_length=50, null=True, blank=True)
    datetime_closed = models.DateTimeField(null=True, blank=True)
    closed_by = models.CharField(max_length=50, null=True, blank=True)
    trigger_remarks = models.TextField(null=True, blank=True)
    user_remarks = models.TextField(null=True, blank=True)
    eask_serial = models.CharField(max_length=50, null=True, blank=True)

    def __str__(self):
        return self.itemcode

    class Meta:
        db_table = "ILMS_moitemequipment"


class MOItemSourceOfTruth(Base):
    """Statically seeded MO item codes, read by the onboard-spares import's pattern-number
    cross-check after `Item` and before the WED sources. Ported from source alongside the
    `obs` merge, since `obs.services` depends on it for the pattern-number cross-check."""

    objects = BaseManager()
    # THE NORMALISED CODE IS WHAT IS STORED, not the code as the file spelled it.
    # `obs.services.normalise_item_code` upper-cases and removes every space, and the seeder
    # applies it before writing, so this column is both the stored value and the matching key
    # and no second `item_code_norm` column is needed. The measured maximum normalised length
    # in the seeding file is 34, well inside 50.
    item_code = models.CharField(max_length=50, primary_key=True)
    # NOT NULLABLE, by explicit instruction. A code the source file leaves without a category,
    # and a code the source file gives two different categories, are both seeded `P`.
    crp_category = models.CharField(max_length=10)

    def __str__(self):
        return self.item_code

    class Meta:
        db_table = "ILMS_mo_item_sot"
        # GIN index over `gin_trgm_ops` is what makes `TrigramSimilarity` over ~1M rows cheap
        # enough to run inside an import preview. Requires the `pg_trgm` extension.
        indexes = [
            GinIndex(
                fields=["item_code"],
                opclasses=["gin_trgm_ops"],
                name="mo_sot_code_trgm",
            ),
        ]


class Item(Base):
    objects = BaseManager()
    item_code = models.CharField(max_length=50, primary_key=True)
    item_desc = models.TextField(null=True, blank=True)
    item_deno = models.CharField(max_length=50, null=True, blank=True)
    crp_category = models.CharField(max_length=10, null=True, blank=True)
    inventory_holder = models.CharField(max_length=50, null=True, blank=True)
    obsolescence = models.CharField(max_length=50, null=True, blank=True)
    obsolete = models.CharField(max_length=50, null=True, blank=True)
    oem_name = models.CharField(max_length=50, null=True, blank=True)
    oem_vendor_code = models.CharField(max_length=50, null=True, blank=True)
    datetime_approved = models.DateTimeField(null=True, blank=True)
    approved_by = models.CharField(max_length=50, null=True, blank=True)
    incat_yn = models.BooleanField(default=False)

    def __str__(self):
        return self.item_code

    class Meta:
        db_table = "ILMS_item"
        indexes = [_normalised_item_code_index("ilms_item_code_norm_idx")]


class Vendor(Base):
    objects = BaseManager()
    vendor_code = models.CharField(max_length=200, primary_key=True)
    name = models.CharField(max_length=200, null=True, blank=True)
    vendor_class = models.CharField(max_length=200, null=True, blank=True)
    manufacturer_priority = models.CharField(
        max_length=200,
        null=True,
        blank=True,
    )
    addressee = models.CharField(max_length=200, null=True, blank=True)
    address_line1 = models.CharField(max_length=555, null=True, blank=True)
    address_line2 = models.CharField(max_length=555, null=True, blank=True)
    address_line3 = models.CharField(max_length=555, null=True, blank=True)
    city = models.CharField(max_length=200, null=True, blank=True)
    state = models.CharField(max_length=200, null=True, blank=True)
    pin_code = models.CharField(max_length=200, null=True, blank=True)
    country_code = models.CharField(max_length=200, null=True, blank=True)
    datetime_approved = models.DateTimeField(null=True, blank=True)
    approved_by = models.CharField(max_length=200, null=True, blank=True)
    date_banned_upto = models.DateField(null=True, blank=True)
    section_head = models.CharField(max_length=200, null=True, blank=True)
    kompass_control_no = models.CharField(
        max_length=200,
        null=True,
        blank=True,
    )
    remarks = models.TextField(null=True, blank=True)
    station_code = models.CharField(max_length=200, null=True, blank=True)
    ncage = models.CharField(max_length=200, null=True, blank=True)
    gem_seller_id = models.CharField(max_length=200, null=True, blank=True)
    business_id = models.CharField(max_length=200, null=True, blank=True)
    def_proc_id = models.CharField(max_length=200, null=True, blank=True)
    msme_registration_no = models.CharField(
        max_length=200,
        null=True,
        blank=True,
    )
    gst_no = models.CharField(max_length=200, null=True, blank=True)
    pan = models.CharField(max_length=200, null=True, blank=True)

    def __str__(self):
        return str(self.vendor_code)

    class Meta:
        db_table = "ILMS_vendor"


class MoMappingTable(Base):
    objects = BaseManager()
    ilms_spare_id = models.ForeignKey(
        Item, on_delete=models.CASCADE, blank=True, null=True
    )
    vendor_id = models.ForeignKey(
        Vendor, on_delete=models.CASCADE, blank=True, null=True
    )
    equipment = models.ForeignKey(
        "sfd.ShipEquipment",
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="ilms_mappings",
    )

    def __str__(self):
        return str(self.pk)

    class Meta:
        db_table = "ILMS_momappingtable"


class MOPlannedSparesDescription(Base):
    objects = BaseManager()
    item_id = models.ForeignKey(Item, on_delete=models.CASCADE, blank=True, null=True)
    routine_description_id = models.ForeignKey(
        "ems.RoutineDescription",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="ilms_planned_spares",
        db_column="routine_description_id",
    )
    is_deleted = models.BooleanField(default=False)

    def __str__(self):
        return str(self.pk)

    class Meta:
        db_table = "ILMS_moplannedsparesdescription"


class PlannedMOSpareList(Base):
    objects = BaseManager()
    pattern_number = models.CharField(max_length=200, blank=True, default="")
    planned_spares_description = models.ForeignKey(
        MOPlannedSparesDescription,
        on_delete=models.CASCADE,
    )
    quantity_required = models.PositiveIntegerField(default=0)
    is_deleted = models.BooleanField(default=False)

    def __str__(self):
        return str(self.pattern_number or self.pk)

    class Meta:
        db_table = "ILMS_plannedmosparelist"


class SurveyDetails(Base):
    objects = BaseManager()
    custom_user = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="ilms_survey_details",
    )
    vendor_id = models.ForeignKey(
        Vendor, on_delete=models.SET_NULL, blank=True, null=True
    )
    ilms_spare_id = models.ForeignKey(
        Item, on_delete=models.CASCADE, blank=True, null=True
    )
    obs_spare_id = models.ForeignKey(
        "obs.Spares",
        on_delete=models.SET_DEFAULT,
        default="",
        blank=True,
        null=True,
        related_name="obs_speare_survey",
    )
    mo_routine_plan = models.ForeignKey(
        MOPlannedSparesDescription,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    mo_dart = models.ForeignKey(
        "DartMOSpare",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    demand_number = models.CharField(max_length=200, blank=True, default="")
    # The HOD-approval-time reference number (source's `survey_cart_no`, generated by
    # `ilms.utils.generate_ilms_reference` when a Survey is sent for approval) —
    # `demand_number` already serves a different, looser purpose on this model and isn't
    # reused for it.
    survey_cart_no = models.CharField(max_length=200, blank=True, default="")
    in_progress_status = models.CharField(max_length=200, blank=True, default="")
    is_survey = models.BooleanField(default=False)
    is_sync = models.BooleanField(default=False)
    is_hod = models.BooleanField(default=False)
    is_hod_approval = models.BooleanField(default=False)
    mo_survey_status = models.CharField(max_length=200, default="Pending")

    def __str__(self):
        return str(self.demand_number or self.pk)

    class Meta:
        db_table = "ILMS_surveydetails"


class PTSDetails(Base):
    objects = BaseManager()
    custom_user = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="ilms_pts_details",
    )
    vendor_id = models.ForeignKey(
        Vendor, on_delete=models.SET_NULL, blank=True, null=True
    )
    ilms_spare_id = models.ForeignKey(
        Item, on_delete=models.CASCADE, blank=True, null=True
    )
    obs_spare_id = models.ForeignKey(
        "obs.Spares",
        on_delete=models.SET_DEFAULT,
        default="",
        blank=True,
        null=True,
        related_name="obs_speare_PTS",
    )
    mo_routine_plan = models.ForeignKey(
        MOPlannedSparesDescription,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    mo_dart = models.ForeignKey(
        "DartMOSpare",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    in_progress_status = models.CharField(max_length=200, blank=True, default="")
    pts_number = models.CharField(max_length=200, blank=True, default="")
    # The HOD-approval-time reference number (source's `pts_cart_no`) — a distinct field
    # from `pts_number` above, matching source where both exist side by side.
    pts_cart_no = models.CharField(max_length=200, blank=True, default="")
    is_pts = models.BooleanField(default=False)
    is_sync = models.BooleanField(default=False)
    is_hod = models.BooleanField(default=False)
    is_hod_approval = models.BooleanField(default=False)
    mo_pts_status = models.CharField(max_length=200, default="Pending")

    def __str__(self):
        return str(self.in_progress_status or self.pk)

    class Meta:
        db_table = "ILMS_ptsdetails"


class DemandDetails(Base):
    objects = BaseManager()
    custom_user = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="ilms_demand_details",
    )
    vendor_id = models.ForeignKey(
        Vendor, on_delete=models.SET_NULL, blank=True, null=True
    )
    ilms_spare_id = models.ForeignKey(
        Item, on_delete=models.CASCADE, blank=True, null=True
    )
    obs_spare_id = models.ForeignKey(
        "obs.Spares",
        on_delete=models.SET_DEFAULT,
        default="",
        blank=True,
        null=True,
        related_name="obs_speare_demand",
    )
    mo_routine_plan = models.ForeignKey(
        MOPlannedSparesDescription,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    mo_dart = models.ForeignKey(
        "DartMOSpare",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    in_progress_status = models.CharField(max_length=200, blank=True, default="")
    demand_number = models.CharField(max_length=200, blank=True, default="")
    # The HOD-approval-time reference number (source's `demand_cart_no`) — kept separate
    # from `demand_number`, which is already generated later by `generate_number` (a
    # different, post-approval numbering step target already had).
    demand_cart_no = models.CharField(max_length=200, blank=True, default="")
    is_demand = models.BooleanField(default=False)
    is_sync = models.BooleanField(default=False)
    is_hod = models.BooleanField(default=False)
    is_hod_approval = models.BooleanField(default=False)
    mo_status = models.CharField(max_length=200, default="Pending")

    def __str__(self):
        return str(self.demand_number or self.pk)

    class Meta:
        db_table = "ILMS_modemanddetails"


class Customer(Base):
    objects = BaseManager()
    customer_code = models.CharField(max_length=50, primary_key=True)
    name = models.CharField(max_length=100, null=True, blank=True)
    customer_type = models.CharField(max_length=50, null=True, blank=True)
    mother_depot = models.CharField(max_length=50, null=True, blank=True)
    addressee = models.CharField(max_length=100, null=True, blank=True)
    address_line1 = models.CharField(max_length=200, null=True, blank=True)
    address_line2 = models.CharField(max_length=200, null=True, blank=True)
    address_line3 = models.CharField(max_length=200, null=True, blank=True)
    city = models.CharField(max_length=100, null=True, blank=True)
    state = models.CharField(max_length=100, null=True, blank=True)
    pin_code = models.CharField(max_length=10, null=True, blank=True)
    allowance_annual_rs = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    date_introduced = models.DateField(null=True, blank=True)
    date_closed = models.DateField(null=True, blank=True)
    remarks = models.TextField(null=True, blank=True)
    admin_authority = models.CharField(max_length=100, null=True, blank=True)
    station_code = models.CharField(max_length=50, null=True, blank=True)
    added_by = models.CharField(max_length=50, null=True, blank=True)
    closed_by = models.CharField(max_length=50, null=True, blank=True)

    def __str__(self):
        return str(self.name or self.pk)

    class Meta:
        db_table = "ILMS_customer"


class ItemLine(Base):
    objects = BaseManager()
    item_code = models.ForeignKey(Item, on_delete=models.CASCADE)
    station_code = models.CharField(max_length=50, null=True, blank=True)
    sh_no = models.CharField(max_length=50, null=True, blank=True)
    qty_war_reserve = models.IntegerField(null=True, blank=True)
    qty_msl = models.IntegerField(null=True, blank=True)
    qty_usl = models.IntegerField(null=True, blank=True)
    qty_acl = models.IntegerField(null=True, blank=True)
    days_lt_proc = models.IntegerField(null=True, blank=True)
    datetime_added = models.DateTimeField(null=True, blank=True)
    datetime_closed = models.DateTimeField(null=True, blank=True)
    item_line_serial = models.AutoField(primary_key=True)

    def __str__(self):
        return str(self.station_code or self.pk)

    class Meta:
        db_table = "ILMS_itemline"


class CustomerEquipment(Base):
    objects = BaseManager()
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)
    equipment = models.ForeignKey(
        "sfd.Equipment",
        on_delete=models.PROTECT,
        related_name="ilms_customer_equipment",
    )
    qty_ship_fit = models.IntegerField(null=True, blank=True)
    qty_present = models.IntegerField(null=True, blank=True)
    date_quantity_present = models.DateField(null=True, blank=True)
    added_by = models.CharField(max_length=50, null=True, blank=True)
    datetime_added = models.DateTimeField(null=True, blank=True)
    approved_by = models.CharField(max_length=50, null=True, blank=True)
    datetime_approved = models.DateTimeField(null=True, blank=True)
    closed_by = models.CharField(max_length=50, null=True, blank=True)
    datetime_closed = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return str(self.added_by or self.pk)

    class Meta:
        db_table = "ILMS_customerequipment"


class CustomerEquipmentLine(Base):
    objects = BaseManager()
    customer_eqpt_line_ser = models.AutoField(primary_key=True)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)
    equipment = models.ForeignKey(
        "sfd.Equipment",
        on_delete=models.PROTECT,
        related_name="ilms_customer_equipment_lines",
    )
    eqpt_serial_number = models.CharField(max_length=100, null=True, blank=True)
    position_specific_yn = models.BooleanField(null=True, blank=True)
    fitment_port_stbd = models.CharField(max_length=50, null=True, blank=True)
    rotation_rl = models.CharField(max_length=50, null=True, blank=True)
    eqpt_nomenclature = models.CharField(max_length=100, null=True, blank=True)
    generic_code = models.CharField(max_length=50, null=True, blank=True)
    eqpt_type = models.CharField(max_length=50, null=True, blank=True)
    manufacturer_name = models.CharField(max_length=100, null=True, blank=True)
    supplier_name = models.CharField(max_length=100, null=True, blank=True)
    parent_eqpt = models.CharField(max_length=100, null=True, blank=True)
    location_code = models.CharField(max_length=100, null=True, blank=True)
    location_onboard = models.CharField(max_length=100, null=True, blank=True)
    location_fit = models.CharField(max_length=100, null=True, blank=True)
    remarks = models.TextField(null=True, blank=True)
    added_by = models.CharField(max_length=50, null=True, blank=True)
    datetime_added = models.DateTimeField(null=True, blank=True)
    closed_by = models.CharField(max_length=50, null=True, blank=True)
    datetime_closed = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return str(self.eqpt_serial_number or self.pk)

    class Meta:
        db_table = "ILMS_customerequipmentline"


class Price(Base):
    objects = BaseManager()
    item = models.ForeignKey(Item, on_delete=models.CASCADE)
    price_type = models.CharField(max_length=50, null=True, blank=True)
    price_date = models.DateField(null=True, blank=True)
    price_ref = models.CharField(max_length=100, null=True, blank=True)
    price_cc = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )
    currency_code = models.CharField(max_length=10, null=True, blank=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE)
    qty = models.IntegerField(null=True, blank=True)
    datetime_approved = models.DateTimeField(null=True, blank=True)
    approved_by = models.CharField(max_length=50, null=True, blank=True)
    station_code = models.CharField(max_length=50, null=True, blank=True)

    def __str__(self):
        return str(self.price_type or self.pk)

    class Meta:
        db_table = "ILMS_price"


class ItemIssued(Base):
    objects = BaseManager()
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)
    demand_no = models.CharField(max_length=50, null=True, blank=True)
    item = models.ForeignKey(Item, on_delete=models.CASCADE)
    sh_no = models.CharField(max_length=50, null=True, blank=True)
    qty = models.IntegerField(null=True, blank=True)
    price_rs = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    datetime_obd = models.DateTimeField(null=True, blank=True)
    issue_datetime = models.DateTimeField(null=True, blank=True)
    issued_by = models.CharField(max_length=50, null=True, blank=True)
    station_code = models.CharField(max_length=50, null=True, blank=True)
    issued_type = models.CharField(max_length=50, null=True, blank=True)

    def __str__(self):
        return str(self.demand_no or self.pk)

    class Meta:
        db_table = "ILMS_itemissued"


class IssuedDetails(Base):
    objects = BaseManager()
    abc_ved_year = models.CharField(max_length=10, null=True, blank=True)
    station_code = models.CharField(max_length=50, null=True, blank=True)
    item = models.ForeignKey(Item, on_delete=models.CASCADE)
    no_of_issues = models.IntegerField(null=True, blank=True)
    qty_issued = models.IntegerField(null=True, blank=True)
    issued_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )

    def __str__(self):
        return str(self.abc_ved_year or self.pk)

    class Meta:
        db_table = "ILMS_issueddetails"


class ItemVendor(Base):
    objects = BaseManager()
    item = models.ForeignKey(Item, on_delete=models.CASCADE)
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE)
    active_yn = models.BooleanField(null=True, blank=True)
    rating = models.IntegerField(null=True, blank=True)
    certification_no = models.CharField(max_length=100, null=True, blank=True)
    certification_type = models.CharField(max_length=50, null=True, blank=True)
    pac_ref = models.CharField(max_length=50, null=True, blank=True)
    date_pac = models.DateField(null=True, blank=True)
    datetime_approved = models.DateTimeField(null=True, blank=True)
    approved_by = models.CharField(max_length=50, null=True, blank=True)
    remarks = models.TextField(null=True, blank=True)
    datetime_till = models.DateTimeField(null=True, blank=True)
    closed_by = models.CharField(max_length=50, null=True, blank=True)
    station_code = models.CharField(max_length=50, null=True, blank=True)
    datetime_closed = models.DateTimeField(null=True, blank=True)
    item_vendor_serial_no = models.AutoField(primary_key=True)

    def __str__(self):
        return str(self.certification_no or self.pk)

    class Meta:
        db_table = "ILMS_itemvendor"


class ItemExtra(Base):
    objects = BaseManager()
    PERMANENT = "PERMANENT"
    RETURNABLE = "RETURNABLE"
    CONSUMABLE = "CONSUMABLE"

    CATEGORY_CHOICES = [
        (PERMANENT, "PERMANENT"),
        (RETURNABLE, "RETURNABLE"),
        (CONSUMABLE, "CONSUMABLE"),
    ]

    item_code = models.CharField(max_length=50, primary_key=True)
    item_desc = models.TextField(null=True, blank=True)
    equipment_name = models.CharField(max_length=255, null=True, blank=True)
    category = models.CharField(
        max_length=30,
        choices=CATEGORY_CHOICES,
        default=PERMANENT,
    )
    critical = models.BooleanField(default=False)
    item_deno = models.ForeignKey(
        "obs.Denomination", on_delete=models.PROTECT, blank=True, null=True
    )
    ved_category = models.CharField(max_length=10, null=True, blank=True)
    abc_category = models.CharField(max_length=10, null=True, blank=True)
    crp_category = models.CharField(max_length=10, null=True, blank=True)
    datetime_approved = models.DateTimeField(null=True, blank=True)
    approved_by = models.CharField(max_length=50, null=True, blank=True)
    remarks = models.TextField(null=True, blank=True)
    image = models.ImageField(
        upload_to="items/",
        default="default.png",
        null=True,
        blank=True,
    )

    def __str__(self):
        return str(self.item_code or self.pk)

    class Meta:
        db_table = "ILMS_item_extra"


class VendorList(Base):
    objects = BaseManager()
    vendorcode = models.CharField(max_length=255, blank=True, null=True)
    name = models.CharField(max_length=255, blank=True, null=True)
    class_field = models.CharField(max_length=255, blank=True, null=True)
    manufacturerpriority = models.CharField(
        max_length=255,
        blank=True,
        null=True,
    )
    addressee = models.CharField(max_length=255, blank=True, null=True)
    addressline1 = models.CharField(max_length=255, blank=True, null=True)
    addressline2 = models.CharField(max_length=255, blank=True, null=True)
    addressline3 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=255, blank=True, null=True)
    state = models.CharField(max_length=255, blank=True, null=True)
    pincode = models.CharField(max_length=255, blank=True, null=True)
    countrycode = models.CharField(max_length=255, blank=True, null=True)
    datetimeapproved = models.CharField(max_length=255, blank=True, null=True)
    approvedby = models.CharField(max_length=255, blank=True, null=True)
    datebannedupto = models.CharField(max_length=255, blank=True, null=True)
    sectionhead = models.CharField(max_length=255, blank=True, null=True)
    kompasscontrolno = models.CharField(max_length=255, blank=True, null=True)
    remarks = models.CharField(max_length=255, blank=True, null=True)
    stationcode = models.CharField(max_length=255, blank=True, null=True)
    ncage = models.CharField(max_length=255, blank=True, null=True)
    gemsellerid = models.CharField(max_length=255, blank=True, null=True)
    businesstype = models.CharField(max_length=255, blank=True, null=True)
    defprocid = models.CharField(max_length=255, blank=True, null=True)
    msmeregistrationno = models.CharField(max_length=255, blank=True, null=True)
    gstno = models.CharField(max_length=255, blank=True, null=True)
    pan = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return str(self.name)

    class Meta:
        db_table = "ILMS_vendor_list"


class VendorPil(Base):
    objects = BaseManager()
    eqpt_code = models.CharField(max_length=100, null=True, blank=True)
    eqpt_desc = models.CharField(max_length=255, null=True, blank=True)
    oem_name = models.CharField(max_length=255, null=True, blank=True)
    vendor_name = models.CharField(max_length=255, null=True, blank=True)
    vendor_code = models.CharField(max_length=255, null=True, blank=True)
    characteristics_name = models.CharField(
        max_length=255,
        null=True,
        blank=True,
    )
    char_value = models.CharField(max_length=255, null=True, blank=True)
    item_code = models.CharField(max_length=100, null=True, blank=True)
    item_desc = models.CharField(max_length=255, null=True, blank=True)
    substitute_item_code = models.CharField(
        max_length=100,
        null=True,
        blank=True,
    )
    substitute_type = models.CharField(max_length=100, null=True, blank=True)
    eask_type = models.CharField(max_length=100, null=True, blank=True)
    country_of_origin = models.CharField(max_length=100, null=True, blank=True)
    currency_code = models.CharField(max_length=10, null=True, blank=True)
    ved_cat = models.CharField(max_length=50, null=True, blank=True)
    make_model = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.eqpt_code} - {self.eqpt_desc}"

    class Meta:
        db_table = "ILMS_vendor_pil"


class DartMOSpare(Base):
    objects = BaseManager()
    issue_obj = models.ForeignKey(
        "obs.Issue",
        on_delete=models.SET_DEFAULT,
        default="",
        blank=True,
        null=True,
    )
    equipment_id = models.ForeignKey(
        "sfd.ShipEquipment",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="dart_mo_spares",
        db_column="equipment_id_id",
    )
    dart_id = models.ForeignKey(
        InitiateDart,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="mo_spares",
        db_column="dart_id_id",
    )
    mo_spare = models.ForeignKey(
        Item,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
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
        db_table = "ILMS_dartmospare"


class IIF(Base):
    objects = BaseManager()
    custom_user = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="ilms_iif_entries",
    )
    spare_id = models.ForeignKey(
        "obs.Spares",
        on_delete=models.SET_DEFAULT,
        default="",
        blank=True,
        null=True,
    )
    mo_item_id = models.ForeignKey(
        Item, on_delete=models.CASCADE, blank=True, null=True
    )
    vendor_id = models.ForeignKey(
        Vendor, on_delete=models.CASCADE, blank=True, null=True
    )
    eqpt_id = models.ForeignKey(
        MOItemEquipment, on_delete=models.CASCADE, blank=True, null=True
    )
    # HOD-approval-time reference number (source's `swmm_iifno`), generated by
    # `ilms.utils.generate_ilms_reference` — this is IIF's equivalent of
    # Survey/PTS/Demand's `*_cart_no` fields, already named this way in source.
    swmm_iifno = models.CharField(max_length=200, blank=True, null=True)
    in_progress_status = models.CharField(max_length=200, blank=True, default="")
    phone_number = models.CharField(max_length=200, blank=True, null=True)
    addressee = models.CharField(max_length=200, blank=True, null=True)
    state = models.CharField(max_length=200, blank=True, null=True)
    email_id = models.CharField(max_length=200, blank=True, null=True)
    pan_number = models.CharField(max_length=200, blank=True, null=True)
    gst_number = models.CharField(max_length=200, blank=True, null=True)
    fax = models.CharField(max_length=200, blank=True, null=True)
    NCAGE_code = models.CharField(max_length=200, blank=True, null=True)
    year_introduced = models.CharField(max_length=200, blank=True, null=True)
    function_anticipated = models.CharField(max_length=200, blank=True, null=True)
    ACL_anticipated = models.CharField(max_length=200, blank=True, null=True)
    NSN_inventory_type = models.CharField(max_length=200, blank=True, null=True)
    classification_of_item = models.CharField(max_length=200, blank=True, null=True)
    shelf_life = models.CharField(max_length=200, blank=True, null=True)
    price_ref = models.CharField(max_length=200, blank=True, null=True)
    price_date = models.DateField(blank=True, null=True)
    currency_code = models.CharField(max_length=200, blank=True, null=True)
    price_cc = models.CharField(max_length=200, blank=True, null=True)
    qty = models.CharField(max_length=200, blank=True, null=True)
    eask_book_ref = models.CharField(max_length=200, blank=True, null=True)
    qty_war_reserve = models.CharField(max_length=200, blank=True, null=True)
    qty_constituent = models.CharField(max_length=200, blank=True, null=True)
    qty_range_scale = models.CharField(max_length=200, blank=True, null=True)
    qty_ship_fit = models.CharField(max_length=200, blank=True, null=True)
    qty_present = models.CharField(max_length=200, blank=True, null=True)
    immediate_usage = models.CharField(max_length=200, blank=True, null=True)
    end_usage = models.CharField(max_length=200, blank=True, null=True)
    olditem_code = models.CharField(max_length=200, blank=True, null=True)
    is_sync = models.BooleanField(default=False)
    is_hod = models.BooleanField(default=False)
    is_hod_approval = models.BooleanField(default=False)
    mo_status = models.CharField(max_length=200, default="Pending")
    is_delete = models.BooleanField(default=False)

    def __str__(self):
        return str(self.pk)

    class Meta:
        db_table = "ILMS_iif"


class ReceiveDetails(Base):
    """The Receive/goods-in stage — the only place ILMS actually mutates stock. Ported
    from source's `MOReceiveDemandDetails` (`ILMS/models.py:401-420`), but following
    `wlms.ReceiveDemandDetails`/`ReceiveDemandDetailsViewSet` as the engineering template
    per plan decision: that version is the better-built one (cumulative partial receipts
    via `received_qty`/`original_demand_qty`/`demand_quantity`-remaining,
    `select_for_update()` locking, rejects over-receipt) rather than source's simpler
    single-shot balance check.

    Unlike `wlms` (where a receive only ever traces back to a Demand or a PTS, never
    directly to a Survey), this keeps source's third optional FK to `SurveyDetails` —
    source's own `save_receipt_details` (`ILMS/views.py:2251-2351`) genuinely branches
    on all three parents (`demand_details`/`pts_details`/`survey_details`) to resolve the
    linked `obs_spare_id`, so ILMS's Survey stage can be received against directly, unlike
    WLMS's."""

    objects = BaseManager()
    demand_details = models.ForeignKey(
        DemandDetails,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    pts_details = models.ForeignKey(
        PTSDetails,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    survey_details = models.ForeignKey(
        SurveyDetails,
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
    gate_pass_no = models.CharField(max_length=200, blank=True, null=True)
    gate_pass_date = models.DateTimeField(auto_now=False, blank=True, null=True)
    received_qty = models.IntegerField(default=0, blank=True, null=True)
    received_date = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return str(self.demand_number)

    class Meta:
        db_table = "ILMS_receivedetails"
