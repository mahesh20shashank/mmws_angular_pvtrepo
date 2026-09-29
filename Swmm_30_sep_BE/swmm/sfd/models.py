import uuid

from accounts.models import CustomUserProfile
from django.db import models
from master.models import Ship, SubDepartment
from master.models import Base

from .managers import EquipmentManager, ShipEquipmentQuerySet


class GenericSpecification(Base):
    name = models.CharField(max_length=255)
    universal_id_m_generic_specification = models.CharField(
        max_length=100, unique=True, null=True, blank=True
    )

    class Meta:
        db_table = "SFD_genericspecification"

    def __str__(self):
        return self.name or ""


class Generic(Base):
    code = models.CharField(max_length=50, unique=True)
    specification = models.ForeignKey(
        GenericSpecification,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    universal_id_m_generic = models.CharField(
        max_length=100, unique=True, null=True, blank=True
    )

    class Meta:
        db_table = "SFD_generic"

    def __str__(self):
        return self.code or ""


class EquipmentSpecification(Base):
    name = models.CharField(max_length=255)
    universal_id_m_equipment_specification = models.CharField(
        max_length=100, unique=True, null=True, blank=True
    )

    class Meta:
        db_table = "SFD_equipmentspecification"

    def __str__(self):
        return str(self.name or self.pk)


class EquipmentPolicy(Base):
    policy = models.CharField(max_length=255)
    directive = models.TextField(blank=True, null=True)
    universal_id_m_equipment_policy = models.CharField(
        max_length=100, unique=True, null=True, blank=True
    )

    class Meta:
        db_table = "SFD_equipmentpolicy"

    def __str__(self):
        return str(self.policy or self.pk)


class Supplier(Base):
    SupplierID = models.CharField(
        db_column="SupplierID", max_length=255, null=True, blank=True
    )
    SupplierCode = models.CharField(
        db_column="SupplierCode", max_length=255, null=True, blank=True
    )
    SupplierName = models.CharField(
        db_column="SupplierName", max_length=255, null=True, blank=True
    )
    address = models.CharField(
        db_column="Address", max_length=255, null=True, blank=True
    )
    AreaStreet = models.CharField(
        db_column="AreaStreet", max_length=255, null=True, blank=True
    )
    City = models.CharField(db_column="City", max_length=255, null=True, blank=True)
    CountryCode = models.CharField(
        db_column="CountryCode", max_length=255, null=True, blank=True
    )
    CountryID = models.CharField(
        db_column="CountryID", max_length=255, null=True, blank=True
    )
    SupplierManufacturer = models.CharField(
        db_column="SupplierManufacturer", max_length=255, null=True, blank=True
    )
    active = models.CharField(db_column="Active", max_length=255, null=True, blank=True)
    created_by = models.CharField(
        db_column="CreatedBy", max_length=255, null=True, blank=True
    )
    created_date = models.CharField(
        db_column="CreatedDate", max_length=255, null=True, blank=True
    )
    updated_by = models.CharField(
        db_column="UpdatedBy", max_length=255, null=True, blank=True
    )
    updated_date = models.CharField(
        db_column="UpdatedDate", max_length=255, null=True, blank=True
    )
    Universal_ID_M_Supplier = models.CharField(
        db_column="Universal_ID_M_Supplier", max_length=255, null=True, blank=True
    )
    Universal_ID_M_Country = models.CharField(
        db_column="Universal_ID_M_Country", max_length=255, null=True, blank=True
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
    Contact_Person = models.CharField(
        db_column="Contact_Person", max_length=255, null=True, blank=True
    )
    Contact_Number = models.CharField(
        db_column="Contact_Number", max_length=255, null=True, blank=True
    )
    Email_ID = models.CharField(
        db_column="Email_ID", max_length=255, null=True, blank=True
    )
    supplier_name = models.CharField(max_length=100, null=True, blank=True)
    supplier_code = models.CharField(max_length=50, null=True, blank=True)
    supplier_manufacture = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "SFD_supplier"

    def __str__(self):
        return self.SupplierName or self.supplier_name or "Unnamed Supplier"


class Equipment(Base):
    objects = EquipmentManager()
    ilms_eq_code = models.CharField(max_length=255, blank=True, null=True)
    equipment_class = models.CharField(max_length=255, blank=True, null=True)
    model = models.CharField(max_length=255, blank=True, null=True)
    equipment_code = models.CharField(max_length=255)
    maintop_number = models.CharField(max_length=255, blank=True, null=True)
    manufacturer_name = models.CharField(max_length=255, blank=True, null=True)
    authority = models.CharField(max_length=255, blank=True, null=True)
    universal_id_m_equipment = models.CharField(max_length=255, blank=True, null=True)
    generic_specification = models.ForeignKey(
        GenericSpecification,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    generic = models.ForeignKey(
        Generic,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    specification = models.ForeignKey(
        EquipmentSpecification,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    policy = models.ForeignKey(
        EquipmentPolicy,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )

    class Meta:
        db_table = "SFD_equipment"

    @property
    def equipment_name(self):
        return self.equipment_code or self.ilms_eq_code or ""

    def __str__(self):
        return self.ilms_eq_code or self.equipment_code or ""


class CompartmentMaster(Base):
    class UpperDeck(models.TextChoices):
        DECK_01 = "deck01", "Deck 01"
        DECK_02 = "deck02", "Deck 02"
        DECK_03 = "deck03", "Deck 03"
        DECK_04 = "deck04", "Deck 04"
        DECK_05 = "deck05", "Deck 05"
        DECK_06 = "deck06", "Deck 06"
        DECK_07 = "deck07", "Deck 07"
        DECK_08 = "deck08", "Deck 08"
        DECK_09 = "deck09", "Deck 09"
        DECK_10 = "deck10", "Deck 10"

    class LowerDeck(models.TextChoices):
        DECK_1 = "deck1", "Deck 1"
        DECK_2 = "deck2", "Deck 2"
        DECK_3 = "deck3", "Deck 3"
        DECK_4 = "deck4", "Deck 4"
        DECK_5 = "deck5", "Deck 5"
        DECK_6 = "deck6", "Deck 6"
        DECK_7 = "deck7", "Deck 7"
        DECK_8 = "deck8", "Deck 8"
        DECK_9 = "deck9", "Deck 9"
        DECK_10 = "deck10", "Deck 10"

    class Location(models.TextChoices):
        PORT_AFT = "port_aft", "Port, Aft"
        PORT_FORWARD = "port_forward", "Port, Forward"
        STARBOARD_FORWARD = "starboard_forward", "Starboard, Forward"
        STARBOARD_AFT = "starboard_aft", "Starboard, Aft"

    name = models.CharField(max_length=250)
    main_deck = models.BooleanField(null=True, blank=True)
    upper_deck = models.CharField(
        max_length=10, choices=UpperDeck.choices, null=True, blank=True
    )
    lower_deck = models.CharField(
        max_length=10, choices=LowerDeck.choices, null=True, blank=True
    )
    frame_station_from = models.PositiveIntegerField(null=True, blank=True)
    frame_station_to = models.PositiveIntegerField(null=True, blank=True)
    location = models.CharField(
        max_length=30, choices=Location.choices, null=True, blank=True
    )
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True, null=True)
    universal_id_m_compartment = models.CharField(
        max_length=100, unique=True, null=True, blank=True
    )

    class Meta:
        verbose_name = "Compartment"
        verbose_name_plural = "Compartments"

    def __str__(self):
        return self.name or ""


class EquipmentCompartmentMapping(Base):
    equipment = models.ForeignKey(
        Equipment,
        on_delete=models.CASCADE,
        related_name="compartment_mappings",
    )
    compartment = models.ForeignKey(
        CompartmentMaster,
        on_delete=models.CASCADE,
        related_name="equipment_mappings",
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="sfd_equipment_compartment_mappings",
    )

    class Meta:
        unique_together = ("equipment", "compartment")

    def __str__(self):
        return f"{self.equipment_id} -> {self.compartment_id}"


class TrialUnit(Base):
    name = models.CharField(max_length=100)
    description = models.TextField(null=True, blank=True)
    code = models.CharField(max_length=15)
    sequence = models.IntegerField(null=True)
    status = models.SmallIntegerField(
        choices=((1, "Active"), (2, "Inactive"), (3, "Delete")), null=True, blank=True
    )
    created_on = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    created_ip = models.GenericIPAddressField(blank=True, null=True)
    modified_on = models.DateTimeField(auto_now=True, blank=True, null=True)
    modified_by = models.CharField(max_length=100, blank=True, null=True)
    modified_ip = models.GenericIPAddressField(blank=True, null=True)

    def __str__(self):
        return self.name or ""

    class Meta:
        db_table = "master.trial_units"
        verbose_name = "trial_unit"
        verbose_name_plural = "trial_units"


class SatelliteUnit(Base):
    trial_unit = models.ForeignKey(
        TrialUnit,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    command = models.ForeignKey(
        "master.Command",
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    name = models.CharField(max_length=100)
    description = models.TextField(null=True, blank=True)
    code = models.CharField(max_length=15)
    sequence = models.IntegerField(null=True)
    status = models.SmallIntegerField(
        choices=((1, "Active"), (2, "Inactive"), (3, "Delete")), null=True, blank=True
    )
    created_on = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    created_ip = models.GenericIPAddressField(blank=True, null=True)
    modified_on = models.DateTimeField(auto_now=True, blank=True, null=True)
    modified_by = models.CharField(max_length=100, blank=True, null=True)
    modified_ip = models.GenericIPAddressField(blank=True, null=True)

    def __str__(self):
        return self.name or ""

    class Meta:
        db_table = "master.satellite_units"
        verbose_name = "satellite_unit"
        verbose_name_plural = "satellite_units"


class EquipmentCategory(Base):
    trial_unit = models.ForeignKey(
        TrialUnit,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    command = models.ForeignKey(
        "master.Command",
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    satellite_unit = models.ForeignKey(
        SatelliteUnit,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    ship = models.ForeignKey(
        "master.Ship",
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    name = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(null=True, blank=True)
    universal_id_m_equipment_category = models.CharField(
        max_length=100, unique=True, null=True, blank=True
    )

    class Meta:
        db_table = "SFD_equipmentcategory"
        verbose_name = "Equipment Category"
        verbose_name_plural = "Equipment Categories"

    def __str__(self):
        return self.name or ""


class EquipmentType(Base):
    Equipment_Type_ID = models.CharField(db_column="Equipment_Type_ID", max_length=255)
    Equipment_Desc = models.CharField(db_column="Equipment_Desc", max_length=255)
    status = models.CharField(db_column="Status", max_length=50)
    CMMS_ID = models.CharField(
        db_column="CMMS_ID", max_length=100, null=True, blank=True
    )
    CMMS_Ship_ID = models.CharField(
        db_column="CMMS_Ship_ID", max_length=100, null=True, blank=True
    )
    Equipment_Category_Code = models.CharField(
        db_column="Equipment_Category_Code", max_length=100, null=True, blank=True
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
    Universal_ID_Ch_Master_Equipment_Type = models.CharField(
        db_column="Universal_ID_Ch_Master_Equipment_Type",
        max_length=100,
        null=True,
        blank=True,
    )
    order_by = models.IntegerField(db_column="Order_By", null=True, blank=True)

    class Meta:
        db_table = "SFD_equipment_type"
        ordering = ["order_by"]

    def __str__(self):
        return f"{self.Equipment_Desc} ({self.Equipment_Type_ID})"


class ShipEquipment(Base):
    class TransactionType(models.TextChoices):
        EQUIPMENT = "equipment", "Equipment"
        SYSTEM = "system", "System"

    class TransactionCategory(models.TextChoices):
        CAT1 = "cat1", "Cat 1"
        CAT2 = "cat2", "Cat 2"
        CAT3 = "cat3", "Cat 3"
        SURVEY = "survey", "Survey & Demand"
        OTHER = "other", "Other"

    class MappingStatus(models.TextChoices):
        MAPPED = "mapped", "Mapped"
        UNMAPPED = "unmapped", "Unmapped"

    class Location(models.TextChoices):
        PORT_AFT = "1", "Port, Aft"
        PORT_FORWARD = "2", "Port, Forward"
        STARBOARD_FORWARD = "3", "Starboard, Forward"
        STARBOARD_AFT = "4", "Starboard, Aft"

    objects = ShipEquipmentQuerySet.as_manager()

    t_equipment_ship_detail = models.CharField(max_length=255, null=True, blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True, null=True)
    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="sfd_ship_equipment_created",
    )
    ship = models.ForeignKey(
        Ship, on_delete=models.CASCADE, related_name="equipments", blank=True, null=True
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="supplied_equipments_sfd",
    )
    ilms_vendor = models.ForeignKey(
        "ilms.VendorList",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="supplied_equipments_sfd",
    )
    equipment_category = models.ForeignKey(
        EquipmentCategory,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    satelite_unit = models.ForeignKey(
        SatelliteUnit,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    trial_unit = models.ForeignKey(
        TrialUnit,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )

    department = models.ForeignKey(
        "master.department",
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )
    equipment = models.ForeignKey(
        Equipment,
        on_delete=models.PROTECT,
        related_name="ship_allocations",
        blank=True,
        null=True,
    )
    system = models.ForeignKey(
        Equipment,
        on_delete=models.SET_NULL,
        related_name="ship_systems_sfd",
        blank=True,
        null=True,
    )
    ship_type = models.CharField(max_length=255, blank=True, null=True)

    equipment_name = models.CharField(max_length=255, blank=True, null=True)
    new_equipment_name = models.CharField(max_length=150, null=True, blank=True)
    new_system_name = models.CharField(max_length=150, null=True, blank=True)
    equipment_model = models.CharField(max_length=150, null=True, blank=True)

    equipment_code = models.CharField(max_length=255, blank=True, null=True)

    ilms_eq_code = models.CharField(max_length=255, blank=True, null=True)

    equipment_direction = models.CharField(max_length=255, blank=True, null=True)

    equipment_section = models.CharField(max_length=255, blank=True, null=True)

    parent_equipment = models.ForeignKey(
        Equipment,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="child_equipments",
    )
    equipment_type_f_key = models.ForeignKey(
        EquipmentType,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    sub_department_f_key = models.ForeignKey(
        SubDepartment,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )
    section_f_key = models.ForeignKey(
        "master.Section",
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )

    status = models.CharField(max_length=100, default="active")

    # --- Equipment fields ---
    equipment_serial_no = models.CharField(max_length=255, blank=True, null=True)
    oem_part_no = models.CharField(max_length=255, blank=True, null=True)

    # --- Ship-specific fields ---
    nomenclature = models.CharField(max_length=100, blank=True, null=True)
    location_code = models.CharField(max_length=100, blank=True, null=True)
    location_on_board = models.CharField(max_length=255, blank=True, null=True)
    compartment = models.CharField(max_length=255, blank=True, null=True)
    deck = models.CharField(max_length=255, blank=True, null=True)
    frame = models.CharField(max_length=255, blank=True, null=True)
    installation_date = models.DateField(null=True, blank=True)
    new_installation_date = models.DateField(null=True, blank=True)
    authority_date = models.DateField(null=True, blank=True)
    removal_date = models.DateField(null=True, blank=True)
    no_of_fits = models.PositiveIntegerField(default=1)
    service_life = models.CharField(max_length=100, blank=True, null=True)
    new_service_life = models.IntegerField(null=True, blank=True)
    installation_remarks = models.TextField(blank=True, null=True)
    is_srar = models.BooleanField(default=False)
    # --- Equipment classification ---
    equipment_type = models.CharField(
        max_length=50,
        choices=[("Parent", "Parent Equipment"), ("Child", "Child Equipment")],
        default="Child",
        null=True,
        blank=True,
    )
    # --- Authority fields ---
    authority_installation = models.CharField(max_length=255, blank=True, null=True)
    authority_removal = models.CharField(max_length=255, blank=True, null=True)
    authority_of_removal = models.CharField(max_length=500, blank=True, null=True)
    authority_of_installation = models.CharField(max_length=500, blank=True, null=True)
    removal_remarks = models.TextField(blank=True, null=True)
    removal_remark = models.CharField(max_length=1000, blank=True, null=True)

    # --- Additional info ---
    quantity = models.PositiveIntegerField(default=1)
    allocated_on = models.DateField(auto_now_add=True)
    remarks = models.TextField(blank=True, null=True)

    ilms_vendor_code = models.CharField(max_length=255, blank=True, null=True)
    system_status = models.CharField(max_length=255, blank=True, null=True)
    type = models.CharField(
        max_length=20,
        choices=TransactionType.choices,
        null=True,
        blank=True,
    )
    category = models.CharField(
        max_length=30,
        choices=TransactionCategory.choices,
        null=True,
        blank=True,
    )
    mapping_status = models.CharField(
        max_length=20,
        choices=MappingStatus.choices,
        null=True,
        blank=True,
    )
    mapped_to = models.CharField(max_length=100, null=True, blank=True)
    mapped_at = models.DateTimeField(null=True, blank=True)
    is_system = models.BooleanField(null=True, blank=True)
    maintop_id = models.IntegerField(null=True, blank=True)
    manufacturer = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        related_name="manufactured_equipments_sfd",
        blank=True,
        null=True,
    )
    new_supplier_name = models.CharField(max_length=150, null=True, blank=True)
    new_manufacturer_name = models.CharField(max_length=150, null=True, blank=True)
    new_nomenclature = models.CharField(max_length=150, null=True, blank=True)
    new_equipment_sr_no = models.TextField(null=True, blank=True)
    new_oem_part_no = models.TextField(null=True, blank=True)
    universal_id_m_ship = models.CharField(max_length=100, blank=True, null=True)
    universal_id_m_equipment = models.CharField(max_length=100, blank=True, null=True)
    universal_id_m_srar_type = models.CharField(max_length=100, blank=True, null=True)
    universal_id_m_supplier = models.CharField(max_length=100, blank=True, null=True)
    universal_id_m_manufacturer = models.CharField(
        max_length=100, blank=True, null=True
    )
    universal_id_m_equipment_parent = models.CharField(
        max_length=100, blank=True, null=True
    )
    universal_id_m_department = models.CharField(max_length=100, blank=True, null=True)
    universal_id_t_maintop_header = models.CharField(
        max_length=100, blank=True, null=True
    )
    universal_id_ch_master_equipment_type = models.CharField(
        max_length=100, blank=True, null=True
    )
    universal_id_m_sub_department = models.CharField(
        max_length=100, blank=True, null=True
    )
    # --- Extra fields from modal ---
    rshi = models.CharField("RH at Installation", max_length=100, blank=True, null=True)
    eq_rhsi = models.CharField(
        "RH Value at Installation", max_length=100, blank=True, null=True
    )
    rhsi_updated_until = models.DateTimeField(null=True, blank=True)
    eqp_specs = models.TextField("Equipment Specification", blank=True, null=True)
    insma_remarks = models.TextField("INSMA remarks", blank=True, null=True)
    request_reason = models.TextField("Request Reason", blank=True, null=True)
    universal_id_t_ship_detail = models.CharField(max_length=100, blank=True, null=True)
    universal_id_t_equipment_ship_detail = models.CharField(
        max_length=100, blank=True, null=True
    )
    equipment_image = models.ImageField(
        upload_to="equipment_images/", blank=True, null=True
    )
    # --- Sync flag ---
    is_synced = models.BooleanField(default=False)

    # Was already a real, NOT NULL column on the live DB (no default) with no model field
    # backing it — STEP 1 CMMS SFD Sync was failing with a NotNullViolation on every insert
    # until this was added.
    rhsi_initialised = models.BooleanField(default=False)

    class Meta:
        db_table = "SFD_shipequipment"
        verbose_name = "Ship Equipment"
        verbose_name_plural = "Ship Equipments"

    def __str__(self):
        return self.t_equipment_ship_detail or self.nomenclature or ""

    @property
    def equipment_ship_id(self):
        return self.pk


class EquipmentChangeRequest(Base):
    equipment = models.ForeignKey(
        Equipment, on_delete=models.PROTECT, related_name="request_equipment"
    )
    ship_equipment = models.ForeignKey(
        ShipEquipment, on_delete=models.PROTECT, related_name="ship_request_equipment"
    )
    removal_remark = models.TextField()
    new_serial = models.CharField(max_length=50, blank=True, null=True)
    rh_at_installation = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True, null=True)
    approved_reject = models.IntegerField(null=True, blank=True)
    approved_by = models.CharField(max_length=255, null=True, blank=True)
    approved_date = models.DateField(null=True, blank=True)
    amendment_note = models.TextField(null=True, blank=True)
    is_synced = models.IntegerField(null=True, blank=True)
    universal_id_t_sfd_change_request = models.CharField(
        max_length=100, unique=True, null=True, blank=True
    )
    universal_id_a_user_created_by = models.CharField(
        max_length=255, null=True, blank=True
    )
    proposed_changes = models.JSONField(
        null=True, blank=True
    )  # staged edit awaiting CMMS approval
    # Set once the operator has opened this request from the Approval Tracking grid ("View Full
    # Form" — see ApprovalTrackingAPIView.post, sfd/source_contract.py). Combined with
    # approved_reject == 1 (Approved), this is what lets a request drop out of that grid entirely
    # once it's been approved AND seen — explicit product direction, persisted here (not client-
    # side) so it's the same for every user/device, not just the one who happened to view it.
    viewed = models.BooleanField(default=False)

    class Meta:
        db_table = "SFD_equipmentchangerequest"

    def __str__(self):
        return f"{self.new_serial}"


class RemoveEquipment(Base):
    equipment = models.ForeignKey(
        Equipment, on_delete=models.PROTECT, related_name="remove_request_equipment"
    )
    ship_equipment = models.ForeignKey(
        ShipEquipment,
        on_delete=models.PROTECT,
        related_name="remove_ship_request_equipment",
    )
    removal_remark = models.TextField()
    removal_date = models.DateField(null=True, blank=True)
    authority_of_removal = models.CharField(max_length=50, blank=True, null=True)
    equipment_serial_no = models.CharField(max_length=255, null=True, blank=True)
    request_type = models.IntegerField(null=True, blank=True)
    installation_date = models.DateField(null=True, blank=True)
    installation_remark = models.TextField(null=True, blank=True)
    rh_of_new_equipment_at_time_of_installation = models.IntegerField(
        null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True, null=True)
    approved_reject = models.IntegerField(null=True, blank=True)
    approved_by = models.CharField(max_length=255, null=True, blank=True)
    approved_date = models.DateField(null=True, blank=True)
    amendment_note = models.TextField(null=True, blank=True)
    is_synced = models.IntegerField(null=True, blank=True)
    # Shared key with CMMS's own Ch_SFD_Remove_Equipment_Request.
    # Universal_ID_Ch_SFD_Remove_Equipment_Request column, so push and pull match on the
    # same UID instead of the pull side creating duplicates of rows this app already pushed.
    universal_id_ch_sfd_remove_equipment_request = models.CharField(
        max_length=100, unique=True, null=True, blank=True
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="supplied_equipments",
    )
    generic = models.ForeignKey(
        Generic,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    proposed_changes = models.JSONField(
        null=True, blank=True
    )  # staged edit awaiting CMMS approval
    # Same "seen" flag as EquipmentChangeRequest.viewed above — see its own doc comment.
    viewed = models.BooleanField(default=False)

    class Meta:
        db_table = "SFD_removeeqipment"

    def __str__(self):
        return f"Removal Request for {self.equipment.equipment_code}"


class ReportExportJob(Base):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"

    class ExportFormat(models.TextChoices):
        EXCEL = "excel", "Excel"
        PDF = "pdf", "PDF"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report_key = models.CharField(max_length=100)
    export_format = models.CharField(max_length=10, choices=ExportFormat.choices)
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING
    )
    file_path = models.CharField(max_length=500, blank=True, null=True)
    error = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "sfd_reportexportjob"


EquipmentMaster = Equipment
SupplierMaster = Supplier
EquipmentTypeMaster = EquipmentType
SFDTransaction = ShipEquipment
RemoveEquipmentRequest = RemoveEquipment
ChangeEquipmentRequest = EquipmentChangeRequest
