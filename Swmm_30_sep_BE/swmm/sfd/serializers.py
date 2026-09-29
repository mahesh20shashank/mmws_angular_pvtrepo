from drf_spectacular.utils import extend_schema_serializer
from master.models import RHSIEquipment
from rest_framework import serializers

from .models import (
    Equipment,
    EquipmentCategory,
    EquipmentChangeRequest,
    EquipmentType,
    Generic,
    GenericSpecification,
    RemoveEquipment,
    SatelliteUnit,
    ShipEquipment,
    Supplier,
    TrialUnit,
)


class OptionalDateField(serializers.DateField):
    def to_internal_value(self, value):
        if (
            value == ""
            or value is None
            or str(value).strip().lower() in ["null", "none", "undefined"]
        ):
            return None
        return super().to_internal_value(value)


class GenericSpecificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = GenericSpecification
        fields = "__all__"


class GenericSerializer(serializers.ModelSerializer):
    class Meta:
        model = Generic
        fields = "__all__"


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = "__all__"


class EquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Equipment
        fields = "__all__"


class TrialUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrialUnit
        fields = "__all__"


class SatelliteUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = SatelliteUnit
        fields = "__all__"


class EquipmentCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentCategory
        fields = "__all__"


class EquipmentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentType
        fields = "__all__"


@extend_schema_serializer(component_name="SfdShipEquipment")
class ShipEquipmentSerializer(serializers.ModelSerializer):
    equipment_code = serializers.CharField(
        source="equipment.equipment_code", read_only=True
    )
    equipment_model = serializers.CharField(source="equipment.model", read_only=True)
    equipment_class = serializers.CharField(
        source="equipment.equipment_class", read_only=True
    )
    department_name = serializers.CharField(source="department.name", read_only=True)
    sub_department_name = serializers.CharField(
        source="sub_department_f_key.name", read_only=True
    )
    section_name = serializers.CharField(source="section_f_key.name", read_only=True)
    supplier_name = serializers.CharField(
        source="supplier.SupplierName", read_only=True
    )
    ilms_vendor_name = serializers.CharField(source="ilms_vendor.name", read_only=True)
    equipment_type_desc = serializers.CharField(
        source="equipment_type_f_key.Equipment_Desc", read_only=True
    )
    maintop_number = serializers.CharField(
        source="equipment.maintop_number", read_only=True
    )
    insma_equipment_code = serializers.CharField(required=False, allow_null=True)

    class Meta:
        model = ShipEquipment
        fields = "__all__"


class EquipmentChangeRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentChangeRequest
        fields = "__all__"


class RemoveEquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = RemoveEquipment
        fields = "__all__"


# --- Request Serializers for Swagger and validation ---


class AddSFDEquipmentRequestSerializer(serializers.Serializer):
    # Existing fields
    equipment_code = serializers.CharField(required=False, allow_null=True)
    department = serializers.IntegerField(required=False, allow_null=True)
    section = serializers.IntegerField(required=False, allow_null=True)
    location_code = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    deck = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    frame = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    location_board = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    installation_date = OptionalDateField(required=False, allow_null=True)
    removal_date = OptionalDateField(required=False, allow_null=True)
    no_of_fits = serializers.IntegerField(required=False, default=1)
    service_life = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    sub_department = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    installation_remarks = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    parent_equipment = serializers.CharField(
        required=False, default="Child", allow_null=True
    )
    authority_installation = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    authority_removal = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    removal_remarks = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    quantity = serializers.IntegerField(required=False, default=1)
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rh_since_install = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )

    # New PEP8 snake_case fields
    equipment_name = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    serial_number = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    manufacturer = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    model = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    category = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    priority = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    capacity = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    power_rating = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    location = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    status = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    equipment_section = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    oem_part_no = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    ilms_vendor = serializers.IntegerField(required=True)
    nomenclature = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    ship_type = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    supplier = serializers.IntegerField(required=True)
    direction = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rshi = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    system_status = serializers.IntegerField(required=False)


class EditSFDEquipmentRequestSerializer(serializers.Serializer):
    equipment_id = serializers.CharField(required=True)
    equipment_code = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    model = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    nomenclature = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    supplier = serializers.IntegerField(required=False, allow_null=True)
    deck = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    frame = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    compartment = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    sub_department = serializers.IntegerField(required=False, allow_null=True)
    is_srar = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    oem_part_no = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    equipment_serial_no = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    location_on_board = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    no_of_fits = serializers.IntegerField(required=False, allow_null=True)
    service_life = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    installation_remarks = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    equipment_type = serializers.IntegerField(required=False, allow_null=True)
    authority_installation = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    authority_removal = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    removal_remarks = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    ilms_vendor_code = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    equipment_system = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    installation_date = OptionalDateField(required=False, allow_null=True)
    removal_date = OptionalDateField(required=False, allow_null=True)
    parent_equipment = serializers.IntegerField(required=False, allow_null=True)
    equipment_image = serializers.ImageField(required=False, allow_null=True)


class SaveEquipmentChangeRequestSerializer(serializers.Serializer):
    eqp_Id = serializers.IntegerField(required=True)
    removal_remarks = serializers.CharField(required=False, allow_blank=True)
    new_serial = serializers.CharField(required=False, allow_blank=True)
    rh_new_eqpt = serializers.CharField(required=False, allow_blank=True)


class RemoveEquipmentRequestSerializer(serializers.Serializer):
    eqp_Id = serializers.IntegerField(required=True)
    removal_remark = serializers.CharField(required=False, allow_blank=True)
    removal_date = OptionalDateField(required=False, allow_null=True)
    authority_removal = serializers.CharField(required=False, allow_blank=True)


class SaveSingleRHSISerializer(serializers.Serializer):
    eq_id = serializers.IntegerField(required=True)
    vendor_code = serializers.CharField(required=False, allow_blank=True)
    sub_department = serializers.IntegerField(required=False, allow_null=True)
    system_status = serializers.CharField(required=False, allow_blank=True)
    rhsi_status = serializers.CharField(required=False, allow_blank=True)
    rhsi_value = serializers.CharField(required=False, allow_blank=True)
    rhsi_date = OptionalDateField(required=False, allow_null=True)


class SectionCreateRequestSerializer(serializers.Serializer):
    form_id = serializers.CharField(required=True)
    section_id = serializers.IntegerField(required=False, allow_null=True)
    sub_dep = serializers.IntegerField(required=False, allow_null=True)
    name = serializers.CharField(required=False, allow_blank=True)


# --- Response Serializers for Swagger ---


class SFDDashboardResponseSerializer(serializers.Serializer):
    section = serializers.CharField()
    count = serializers.IntegerField()


class MetadataSubDeptSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class MetadataSupplierSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class MetadataDeptSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class MetadataEqTypeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    desc = serializers.CharField()


class SFDListMetadataSerializer(serializers.Serializer):
    sub_departments = MetadataSubDeptSerializer(many=True)
    suppliers = MetadataSupplierSerializer(many=True)
    departments = MetadataDeptSerializer(many=True)
    equipment_types = MetadataEqTypeSerializer(many=True)
    nomenclatures = serializers.ListField(child=serializers.CharField())


class SFDListResponseSerializer(serializers.Serializer):
    equipments = ShipEquipmentSerializer(many=True)


@extend_schema_serializer(component_name="SfdGetEquipmentDetailsResponse")
class GetEquipmentDetailsResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    equipment_details = serializers.CharField(required=False)
    message = serializers.CharField(required=False)


class AddSFDEquipmentResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    id = serializers.IntegerField(required=False)
    message = serializers.CharField(required=False)


class GetEquipmentDataResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    equipment = serializers.DictField()


class EditSFDEquipmentResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    message = serializers.CharField(required=False)


class RemoveEquipmentResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    id = serializers.IntegerField(required=False)
    message = serializers.CharField(required=False)


class SaveEquipmentChangeResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    id = serializers.IntegerField(required=False)
    message = serializers.CharField(required=False)


class GetChangeEquipmentDataResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    data = serializers.DictField()


class FetchSFDFromCMMSResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    data = serializers.ListField(child=serializers.DictField())


class ImportSFDFromExcelResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    message = serializers.CharField()


class SyncResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    message = serializers.CharField()


class SectionCreateResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    message = serializers.CharField(required=False)


class SaveSingleRHSIResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    message = serializers.CharField(required=False)


class RHSIMasterResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    data = serializers.DictField()


class AberListResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    data = serializers.ListField(child=serializers.DictField())


class RHSIMasterBulkUpdateRequestSerializer(serializers.Serializer):
    rows = SaveSingleRHSISerializer(many=True, required=False)


class ImportSFDFromExcelRequestSerializer(serializers.Serializer):
    excel_file = serializers.FileField(required=True)


# ─────────────────────────────────────────────────────────────
# CMMS ABER & SFD Integration Serializers
# ─────────────────────────────────────────────────────────────


class AberEquipmentResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nomenclature = serializers.CharField()
    equipment_code = serializers.CharField()
    installation_date = serializers.DateField(required=False, allow_null=True)
    age_years = serializers.FloatField()
    universal_id_m_ship = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )


class AberSubmitRequestSerializer(serializers.Serializer):
    ship_id = serializers.IntegerField(required=True)
    fitted_equipment_id = serializers.IntegerField(required=True)
    budget_year = serializers.IntegerField(required=True)
    estimate_cost = serializers.FloatField(required=True)
    currency = serializers.CharField(required=False, default="INR")
    aber_authority = serializers.CharField(required=True)
    repair_agency_id = serializers.IntegerField(required=True)
    remarks = serializers.CharField(required=False, allow_null=True, allow_blank=True)


class AberSubmitResponseSerializer(serializers.Serializer):
    ABERID = serializers.IntegerField()
    Universal_ID_T_ABER = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    Universal_ID_M_Ship = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    BudgetYear = serializers.IntegerField(required=False, allow_null=True)
    EstimateCost = serializers.FloatField(required=False, allow_null=True)
    Currency = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    ABERAuthority = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    RepairAgencyID = serializers.IntegerField(required=False, allow_null=True)
    Remarks = serializers.CharField(required=False, allow_null=True, allow_blank=True)


class SfdShipEquipmentResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nomenclature = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    equipment_sr_no = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    location_on_board = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    installation_date = serializers.DateField(required=False, allow_null=True)


class SfdShipResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    code = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    universal_id_m_ship = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    command_name = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    authority_name = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )


class SfdSyncPayloadResponseSerializer(serializers.Serializer):
    T_genericspecification = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )
    M_group = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )
    M_Section = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )
    M_Equipment = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )
    M_ship = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )
    M_generic = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )
    M_command = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )
    T_EquipmentShipDetail = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )
    M_propulsion = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )
    M_country = serializers.ListField(
        child=serializers.DictField(), required=False, default=[]
    )


class RHSIEquipmentSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(
        source="department.name",
        read_only=True,
    )

    sub_department_name = serializers.CharField(
        source="sub_department_f_key.name",
        read_only=True,
    )

    ilms_vendor_code = serializers.CharField(
        source="ilms_vendor.vendorcode",
        read_only=True,
    )

    class Meta:
        model = RHSIEquipment
        fields = [
            "id",
            "insma_equipment_code",
            "equipment_code",
            "equipment_name",
            "nomenclature",
            "department",
            "department_name",
            "ilms_eq_code",
            "ilms_vendor_code",
            "sub_department_f_key",
            "sub_department_name",
            "system_status",
            "rshi",
            "eq_rhsi",
            "rhsi_updated_until",
            "no_of_fits",
            "compartment",
            "installation_remarks",
        ]


class RHSIEquipmentCreateSerializer(serializers.ModelSerializer):
    other_comment = serializers.CharField(
        source="installation_remarks",
        required=False,
        allow_blank=True,
    )

    compartment_name = serializers.CharField(
        source="compartment",
        required=False,
        allow_blank=True,
    )

    class Meta:
        model = RHSIEquipment
        fields = (
            "ship_type",
            "equipment_code",
            "equipment_name",
            "nomenclature",
            "ilms_eq_code",
            "ilms_vendor",
            "supplier",
            "oem_part_no",
            "equipment_serial_no",
            "deck",
            "frame",
            "equipment_direction",
            "compartment_name",
            "installation_date",
            "no_of_fits",
            "rshi",
            "eq_rhsi",
            "equipment_section",
            "system_status",
            "other_comment",
            "sub_department_f_key",
            "rhsi_updated_until",
        )


# ==========================
# Hierarchy
# ==========================


class HierarchyNodeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    type = serializers.CharField()
    children = serializers.SerializerMethodField()

    def get_children(self, obj):
        children = obj.get("children", [])

        return HierarchyNodeSerializer(
            children,
            many=True,
        ).data


class HierarchySerializer(serializers.Serializer):
    heading = serializers.CharField()
    view_all = serializers.BooleanField()
    tree = HierarchyNodeSerializer(many=True)


# ==========================
# Configuration Validation
# ==========================


class ValidationItemSerializer(serializers.Serializer):
    name = serializers.CharField()
    count = serializers.IntegerField()


class ConfigurationValidationSerializer(serializers.Serializer):
    heading = serializers.CharField()
    view_all = serializers.BooleanField()
    items = ValidationItemSerializer(many=True)


# ==========================
# Active Changes
# ==========================


class ActiveChangeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    count = serializers.IntegerField()
    status = serializers.CharField()


class ActiveChangeDeviationSerializer(serializers.Serializer):
    heading = serializers.CharField()
    view_all = serializers.BooleanField()
    items = ActiveChangeSerializer(many=True)


# ==========================
# Baseline Comparison
# ==========================


class ComparisonRecordSerializer(serializers.Serializer):
    equipment = serializers.CharField()
    from_location = serializers.CharField(
        allow_null=True,
        allow_blank=True,
    )
    to_location = serializers.CharField(
        allow_null=True,
        allow_blank=True,
    )
    status = serializers.CharField()


class ComparisonSummarySerializer(serializers.Serializer):
    total_changes = serializers.IntegerField()
    relocations = serializers.IntegerField()
    replacements = serializers.IntegerField()
    removed = serializers.IntegerField()
    temporary_fitments = serializers.IntegerField()


class BaselineComparisonSerializer(serializers.Serializer):
    heading = serializers.CharField()
    view_all = serializers.BooleanField()
    filters = serializers.ListField(child=serializers.CharField())

    selected_filter = serializers.CharField()

    records = ComparisonRecordSerializer(many=True)

    summary = ComparisonSummarySerializer()


# ==========================
# Movement History
# ==========================


class MovementHistorySerializer(serializers.Serializer):
    date = serializers.DateField()
    event_type = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()


class MovementConfigurationSerializer(serializers.Serializer):
    heading = serializers.CharField()
    view_all = serializers.BooleanField()
    view_all_flag = serializers.BooleanField()

    movement_and_configuration_histories = MovementHistorySerializer(many=True)


# ==========================
# Drill Down
# ==========================


class DrillDownResultSerializer(serializers.Serializer):
    equipment = serializers.CharField()
    location = serializers.CharField()
    status = serializers.CharField()


class SelectedItemSerializer(serializers.Serializer):
    equipment_name = serializers.CharField()
    equipment_status = serializers.CharField()
    location = serializers.CharField()
    system = serializers.CharField()
    status = serializers.CharField()
    equipment_id = serializers.CharField()
    compartment = serializers.CharField()
    last_updated = serializers.DateTimeField(allow_null=True)


class DrillDownSerializer(serializers.Serializer):
    heading = serializers.CharField()

    view_all = serializers.BooleanField()

    filters = serializers.ListField(child=serializers.CharField())

    selected_filter = serializers.CharField()

    search_text = serializers.CharField()

    results = DrillDownResultSerializer(many=True)

    selected_item = SelectedItemSerializer(allow_null=True)


# ==========================
# Final Dashboard Serializer
# ==========================


class DashboardResponseSerializer(serializers.Serializer):
    hierarchy = HierarchySerializer()

    configuration_validation = ConfigurationValidationSerializer()

    active_change_and_deviations = ActiveChangeDeviationSerializer()

    baseline_vs_current_comparison = BaselineComparisonSerializer()

    movement_and_configuration_history = MovementConfigurationSerializer()

    contextual_search_and_drill_down = DrillDownSerializer()


class ShipConfigurationKPIResponseSerializer(serializers.Serializer):
    kpis = serializers.ListField(child=serializers.DictField())
    periods = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    default_period = serializers.CharField(required=False)
