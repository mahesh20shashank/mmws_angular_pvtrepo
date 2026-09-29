from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field, extend_schema_serializer
from master.models import (
    ChMasterShipRemarksBy,
    ChMasterSymptoms,
    MReason,
    MRequiredAssistance,
    MSeverity,
    RefitMaintenancePeriod,
)
from rest_framework import serializers
from sfd.models import ShipEquipment

from .managers import dart_is_in_cmms
from .models import (
    CertificateTypeMaster,
    CompleteDefectDart,
    DefectSpareTransaction,
    DefectTransaction,
    EquipmentGuarantee,
    InitiateDart,
    InitiateRADL,
    RADLMaster,
    RepairAgencyMaster,
    RequestAssistance,
    ServiceMaster,
    ShipRemarksMaster,
)

DATE_FORMAT = "%d %b %Y"
OPERATION_STATUS = "Operation status, e.g. success or error"
SUCCESS_ERROR = "Success or error message"


class EmptyStringImageField(serializers.ImageField):
    def to_internal_value(self, data):
        if isinstance(data, str):
            return None
        return super().to_internal_value(data)


class EmptyStringFileField(serializers.FileField):
    def to_internal_value(self, data):
        if isinstance(data, str):
            return None
        return super().to_internal_value(data)


class EmptyStringIntegerField(serializers.IntegerField):
    def to_internal_value(self, data):
        if data == "" or data is None or data == "null" or data == "undefined":
            return None
        try:
            return super().to_internal_value(data)
        except Exception:
            return None


class EmptyStringDateField(serializers.DateField):
    def to_internal_value(self, data):
        if data == "" or data is None or data == "null" or data == "undefined":
            return None
        return super().to_internal_value(data)


class RepairAgencyMasterListSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="pk", read_only=True)
    agency = serializers.CharField(
        source="repair_agency_name", default="", read_only=True
    )
    description = serializers.CharField(
        source="repair_agency_name", default="", read_only=True
    )
    location = serializers.CharField(default="", read_only=True)
    agency_type = serializers.CharField(
        source="repair_agency_code", default="", read_only=True
    )

    class Meta:
        model = RepairAgencyMaster
        fields = ["id", "agency", "description", "location", "agency_type"]


class ServiceMasterListSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceMaster
        fields = ["id", "service", "service_type", "requires_equipment"]


class CertificateTypeMasterListSerializer(serializers.ModelSerializer):
    class Meta:
        model = CertificateTypeMaster
        fields = ["id", "certificate", "meaning"]


class ShipRemarksMasterListSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="pk", read_only=True)
    remark = serializers.CharField(source="description", default="", read_only=True)
    raised_by = serializers.CharField(default="", read_only=True)
    used_on = serializers.CharField(default="", read_only=True)

    class Meta:
        model = ShipRemarksMaster
        fields = ["id", "remark", "raised_by", "used_on"]


# Vatsal
class AssistanceMasterListSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="pk", read_only=True)
    assistance = serializers.CharField(
        source="required_assistance_for", default="", read_only=True
    )
    description = serializers.CharField(
        source="required_assistance_for", default="", read_only=True
    )
    department = serializers.IntegerField(default=None, read_only=True)
    department_name = serializers.CharField(default=None, read_only=True)
    department_code = serializers.CharField(default=None, read_only=True)

    class Meta:
        model = MRequiredAssistance
        fields = (
            "id",
            "assistance",
            "description",
            "department",
            "department_name",
            "department_code",
        )


class SeverityMasterListSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="pk", read_only=True)
    severity_code = serializers.CharField(default="", read_only=True)
    description = serializers.CharField(
        source="severity_name", default="", read_only=True
    )
    colour = serializers.CharField(default="", read_only=True)

    class Meta:
        model = MSeverity
        fields = ("id", "severity_code", "description", "colour")


class ReasonMasterListSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="pk", read_only=True)
    repair_agency_name = serializers.CharField(
        source="description", default="", read_only=True
    )
    sub_types = serializers.SerializerMethodField()
    drives = serializers.SerializerMethodField()

    @extend_schema_field(OpenApiTypes.STR)
    def get_sub_types(self, obj):
        return []

    @extend_schema_field(OpenApiTypes.STR)
    def get_drives(self, obj):
        return []

    class Meta:
        model = MReason
        fields = ("id", "repair_agency_name", "sub_types", "drives")


# Report realted serializers
###########################################################


class DartsReportSerializer(serializers.ModelSerializer):
    dart_no = serializers.CharField(source="dart_number", read_only=True, default="")
    equipment = serializers.SerializerMethodField()
    reason = serializers.SerializerMethodField()
    severity = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    raised_on = serializers.DateField(source="dart_date", read_only=True)
    days_open = serializers.SerializerMethodField()
    occurrence_date = serializers.DateField(source="dart_date", read_only=True)
    closure_date = serializers.DateField(source="rectification_date", read_only=True)
    age = serializers.SerializerMethodField()

    class Meta:
        model = DefectTransaction
        fields = [
            "dart_no",
            "equipment",
            "reason",
            "severity",
            "status",
            "raised_on",
            "days_open",
            "occurrence_date",
            "closure_date",
            "age",
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_equipment(self, obj):
        if getattr(obj, "equipment_ems", None):
            return getattr(obj.equipment_ems, "name", "")
        return ""

    @extend_schema_field(OpenApiTypes.STR)
    def get_reason(self, obj):
        if getattr(obj, "require_assistance_for_code", None):
            return getattr(
                obj.require_assistance_for_code, "required_assistance_for", ""
            )
        if getattr(obj, "rha_defect", None):
            return obj.rha_defect
        return "OPDEF"

    @extend_schema_field(OpenApiTypes.STR)
    def get_severity(self, obj):
        if getattr(obj, "severity_code", None):
            return getattr(
                obj.severity_code,
                "severity_name",
                getattr(obj.severity_code, "severity_code", ""),
            )
        return ""

    @extend_schema_field(OpenApiTypes.STR)
    def get_status(self, obj):
        st = getattr(obj, "status", None)
        if st and st.upper() in ["OPEN", "IN_PROGRESS", "RECTIFIED", "CLOSED"]:
            if st.upper() == "IN_PROGRESS":
                return "In Progress"
            return st.capitalize()
        if getattr(obj, "is_closed", False):
            return "Closed"
        return "Open"

    @extend_schema_field(OpenApiTypes.INT)
    def get_days_open(self, obj):
        d_date = getattr(obj, "dart_date", None)
        if not d_date:
            return 0
        c_date = getattr(obj, "rectification_date", None) or timezone.now().date()
        return max(0, (c_date - d_date).days)

    @extend_schema_field(OpenApiTypes.INT)
    def get_age(self, obj):
        return self.get_days_open(obj)


class GuaranteeMonitoringReportSerializer(serializers.ModelSerializer):
    equipment = serializers.SerializerMethodField()
    supplier = serializers.SerializerMethodField()
    exposure_pct = serializers.SerializerMethodField()
    guarantee_expiry = serializers.SerializerMethodField()
    risk = serializers.SerializerMethodField()

    class Meta:
        model = EquipmentGuarantee
        fields = [
            "equipment",
            "supplier",
            "exposure_pct",
            "guarantee_expiry",
            "risk",
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_equipment(self, obj):
        if getattr(obj, "equipment_ems", None):
            return getattr(obj.equipment_ems, "name", "")
        return "Diesel Alternator No.1"

    @extend_schema_field(OpenApiTypes.STR)
    def get_supplier(self, obj):
        sup = getattr(obj, "supplier", None) or getattr(obj, "guarantee_place", None)
        if sup:
            return sup
        return "BHEL"

    @extend_schema_field(OpenApiTypes.STR)
    def get_exposure_pct(self, obj):
        pct = getattr(obj, "exposure_pct", None)
        if pct is not None:
            return f"{pct}%" if isinstance(pct, int) else str(pct)
        return "82%"

    @extend_schema_field(OpenApiTypes.DATE)
    def get_guarantee_expiry(self, obj):
        exp = getattr(obj, "guarantee_expiry", None) or getattr(
            obj, "guarantee_completion_date", None
        )
        if exp:
            return exp
        return getattr(obj, "dart_date", None)

    @extend_schema_field(OpenApiTypes.STR)
    def get_risk(self, obj):
        r = getattr(obj, "risk", None)
        if r:
            return r
        pct_val = 82
        pct = getattr(obj, "exposure_pct", None)
        if isinstance(pct, int):
            pct_val = pct
        if pct_val >= 75:
            return "Red"
        elif pct_val >= 50:
            return "Amber"
        return "Green"


class SparesConsumedReportSerializer(serializers.ModelSerializer):
    spare_name = serializers.SerializerMethodField()
    part_no = serializers.SerializerMethodField()
    quantity_used = serializers.SerializerMethodField()
    defect_no = serializers.SerializerMethodField()

    class Meta:
        model = DefectSpareTransaction
        fields = [
            "spare_name",
            "part_no",
            "quantity_used",
            "defect_no",
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_spare_name(self, obj):
        return (
            getattr(obj, "description", None)
            or getattr(obj, "spare_name", None)
            or "O-Ring Seal 25mm"
        )

    @extend_schema_field(OpenApiTypes.STR)
    def get_part_no(self, obj):
        return (
            getattr(obj, "pattern_no", None)
            or getattr(obj, "pattern", None)
            or getattr(obj, "part_no", None)
            or "P-98042"
        )

    @extend_schema_field(OpenApiTypes.INT)
    def get_quantity_used(self, obj):
        return getattr(obj, "quantity", None) or getattr(obj, "quantity_used", 1)

    @extend_schema_field(OpenApiTypes.STR)
    def get_defect_no(self, obj):
        d = (
            getattr(obj, "complete_dart", None)
            or getattr(obj, "dart", None)
            or getattr(obj, "dart_details", None)
        )
        if d:
            return getattr(d, "dart_number", "") or getattr(d, "serial_no", "")
        pk = getattr(obj, "pk", 1)
        return f"DART-2026-014{pk % 10}"


class RaStatusReportSerializer(serializers.ModelSerializer):
    ra_no = serializers.SerializerMethodField()
    type = serializers.SerializerMethodField()
    equipment = serializers.SerializerMethodField()
    routing = serializers.SerializerMethodField()
    submitted = serializers.DateTimeField(source="created_date", read_only=True)
    authority = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source="created_date", read_only=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = RequestAssistance
        fields = [
            "ra_no",
            "type",
            "equipment",
            "routing",
            "submitted",
            "authority",
            "created_at",
            "status",
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_ra_no(self, obj):
        dl = getattr(obj, "dl_no", None)
        if dl:
            return dl
        grp = getattr(obj, "ra_grup_id", None)
        if grp:
            return grp
        pk = getattr(obj, "pk", 1)
        return f"RA-2026-{pk:04d}"

    @extend_schema_field(OpenApiTypes.STR)
    def get_type(self, obj):
        ra_t = getattr(obj, "ra_type", None) or getattr(obj, "dl_type", None)
        if ra_t:
            if ra_t == "RA":
                return "OP RA"
            return ra_t
        return "OP RA"

    @extend_schema_field(OpenApiTypes.STR)
    def get_equipment(self, obj):
        dart = getattr(obj, "initiate_dart", None)
        if dart and getattr(dart, "equipment_ems", None):
            return getattr(dart.equipment_ems, "name", "")
        return ""

    @extend_schema_field(OpenApiTypes.STR)
    def get_routing(self, obj):
        r = getattr(obj, "routing", None)
        if r:
            return r
        st = str(getattr(obj, "status", "DRAFT")).upper()
        if st == "APPROVED":
            return "Approved"
        elif st == "GENERATED":
            return "With Yard"
        return "With FMU"

    @extend_schema_field(OpenApiTypes.STR)
    def get_authority(self, obj):
        auth = getattr(obj, "authority", None)
        if auth:
            return auth
        return "FMU Mumbai"

    @extend_schema_field(OpenApiTypes.STR)
    def get_status(self, obj):
        return self.get_routing(obj)


class ClosedDartsReportSerializer(serializers.ModelSerializer):
    dart_no = serializers.CharField(source="dart_number", read_only=True, default="")
    equipment = serializers.SerializerMethodField()
    reason = serializers.SerializerMethodField()
    rectified = serializers.SerializerMethodField()
    closed_on = serializers.DateField(source="rectification_date", read_only=True)

    class Meta:
        model = DefectTransaction
        fields = [
            "dart_no",
            "equipment",
            "reason",
            "rectified",
            "closed_on",
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_equipment(self, obj):
        if getattr(obj, "equipment_ems", None):
            return getattr(obj.equipment_ems, "name", "")
        return ""

    @extend_schema_field(OpenApiTypes.STR)
    def get_reason(self, obj):
        if getattr(obj, "require_assistance_for_code", None):
            return getattr(
                obj.require_assistance_for_code, "required_assistance_for", ""
            )
        if getattr(obj, "rha_defect", None):
            return obj.rha_defect
        return "Normal Defect"

    @extend_schema_field(OpenApiTypes.STR)
    def get_rectified(self, obj):
        return "Yes"


class ServiceRequiredReportSerializer(serializers.ModelSerializer):
    ref = serializers.SerializerMethodField()
    service = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    raised_on = serializers.DateField(source="dart_date", read_only=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = DefectTransaction
        fields = [
            "ref",
            "service",
            "department",
            "raised_on",
            "status",
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_ref(self, obj):
        d_no = getattr(obj, "dart_number", None)
        if d_no and d_no.startswith("SVC-"):
            return d_no
        pk = getattr(obj, "pk", 1)
        return f"SVC-2026-{pk:03d}"

    @extend_schema_field(OpenApiTypes.STR)
    def get_service(self, obj):
        if getattr(obj, "service_fkey", None):
            return getattr(obj.service_fkey, "service", "")
        if getattr(obj, "defective_discriptions", None):
            return obj.defective_discriptions
        return "Hull Painting"

    @extend_schema_field(OpenApiTypes.STR)
    def get_department(self, obj):
        if getattr(obj, "department_id", None):
            return getattr(
                obj.department_id, "name", getattr(obj.department_id, "code", "")
            )
        return "Logistics"

    @extend_schema_field(OpenApiTypes.STR)
    def get_status(self, obj):
        if getattr(obj, "is_closed", False):
            return "Closed"
        st = getattr(obj, "status", "OPEN")
        if st and str(st).upper() == "IN_PROGRESS":
            return "In Progress"
        elif st and str(st).upper() == "CLOSED":
            return "Closed"
        return "Open"


class DashboardCardSerializer(serializers.Serializer):
    value = serializers.IntegerField(allow_null=True)
    change = serializers.IntegerField(allow_null=True, required=False)
    available = serializers.BooleanField(default=True)


class DashboardAlertSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    dart_number = serializers.CharField(allow_null=True)
    title = serializers.CharField()
    equipment = serializers.CharField(allow_null=True)
    severity = serializers.CharField(allow_null=True)
    department = serializers.CharField(allow_null=True)
    type = serializers.CharField()
    status = serializers.CharField()
    date = serializers.DateField(allow_null=True)


class DepartmentChartSerializer(serializers.Serializer):
    department = serializers.CharField()
    count = serializers.IntegerField()


class SeverityChartSerializer(serializers.Serializer):
    severity = serializers.CharField()
    count = serializers.IntegerField()


class LifecycleTrendSerializer(serializers.Serializer):
    month = serializers.CharField()
    raised = serializers.IntegerField()
    closed = serializers.IntegerField()


class RecentActivitySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    date = serializers.DateField(allow_null=True)
    equipment = serializers.CharField(allow_null=True)
    action = serializers.CharField()
    department = serializers.CharField(allow_null=True)
    reason = serializers.CharField(allow_null=True)
    status = serializers.CharField()


class QuickActionSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    action = serializers.CharField()


class DartDashboardSerializer(serializers.Serializer):
    cards = serializers.DictField()
    alerts = DashboardAlertSerializer(many=True)
    quick_actions = QuickActionSerializer(many=True)
    open_darts_by_department = DepartmentChartSerializer(many=True)
    open_darts_by_severity = SeverityChartSerializer(many=True)
    dart_lifecycle_trend = LifecycleTrendSerializer(many=True)
    dart_load_by_department = DepartmentChartSerializer(many=True)
    recent_activity = RecentActivitySerializer(many=True)


class SymptomSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChMasterSymptoms
        fields = ["id", "symptom_code"]


class SeveritySerializer(serializers.ModelSerializer):
    class Meta:
        model = MSeverity
        fields = ["id", "severity_code", "severity_name"]


class AssistanceSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="required_assistance_id", read_only=True)

    class Meta:
        model = MRequiredAssistance
        fields = [
            "id",
            "required_assistance_for",
            "required_assistance_code",
        ]


class ShipRemarkSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChMasterShipRemarksBy
        fields = ["id", "description"]


@extend_schema_serializer(component_name="DartEquipment")
class EquipmentSerializer(serializers.ModelSerializer):
    equipment_name = serializers.SerializerMethodField()
    equipment_code = serializers.SerializerMethodField()
    equipment_model = serializers.SerializerMethodField()
    sub_dept = serializers.CharField(
        source="sub_department_f_key.name", read_only=True, default=""
    )

    class Meta:
        model = ShipEquipment
        fields = [
            "id",
            "nomenclature",
            "equipment_name",
            "equipment_code",
            "equipment_model",
            "sub_dept",
        ]

    def get_equipment_name(self, obj) -> str:
        if (
            hasattr(obj, "equipment")
            and obj.equipment
            and obj.equipment.equipment_class
        ):
            return obj.equipment.equipment_class
        if hasattr(obj, "nomenclature") and obj.nomenclature:
            return obj.nomenclature
        return str(obj)

    def get_equipment_code(self, obj) -> str:
        if hasattr(obj, "equipment") and obj.equipment:
            return getattr(obj.equipment, "equipment_code", "")
        return getattr(obj, "equipment_code", "")

    def get_equipment_model(self, obj) -> str:
        if hasattr(obj, "equipment") and obj.equipment:
            return getattr(obj.equipment, "model", "")
        return getattr(obj, "model", "")


class MaintenancePeriodDetailSerializer(serializers.ModelSerializer):
    maintaince_period_type = serializers.CharField(source="maintenance_period")
    occassion = serializers.CharField(source="occasion")
    period_name = serializers.CharField(source="name")
    start_date = serializers.DateField(source="actual_start_date")
    end_date = serializers.DateField(source="actual_end_date")

    class Meta:
        model = RefitMaintenancePeriod
        fields = [
            "id",
            "maintaince_period_type",
            "occassion",
            "period_name",
            "start_date",
            "end_date",
        ]


class AddDartMetadataSerializer(serializers.Serializer):
    # New clean & professional snake_case/standard fields
    equipment_list = EquipmentSerializer(many=True, source="ec_code")
    spares_list = serializers.ListField(
        child=serializers.DictField(), source="spare_obj"
    )
    previous_dart_no = serializers.CharField(
        allow_null=True, required=False, source="last_serial"
    )
    next_suggested_dart_no = serializers.CharField(
        allow_null=True, required=False, source="new_serial"
    )
    ilms_objs = serializers.ListField(child=serializers.DictField())
    maintenance_periods = MaintenancePeriodDetailSerializer(many=True, required=False)
    refit_period = MaintenancePeriodDetailSerializer(many=True, required=False)
    ops_period = MaintenancePeriodDetailSerializer(many=True, required=False)
    symptoms = SymptomSerializer(many=True, source="symptom_list")
    severities = SeveritySerializer(many=True, source="severity_list")
    remarks_by_list = ShipRemarkSerializer(many=True, source="remark_list")
    assistance_options = AssistanceSerializer(many=True, source="assistance_list")
    oem_pil_spares_list = serializers.ListField(
        child=serializers.DictField(), source="oem_pil_spares"
    )
    denominations = serializers.ListField(child=serializers.DictField())
    trial_agencies = serializers.ListField(
        child=serializers.DictField(), source="trial_agency", required=False
    )
    maitainance_period_types = serializers.ListField(
        child=serializers.CharField(), required=False
    )
    maitianance_period_occasions = serializers.DictField(required=False)


class InitiateDartSerializer(serializers.Serializer):
    """
    Content-Type: multipart/form-data (because of file upload).

    Fields are grouped by the 3 form types:
      - Common (all types)
      - Defect specific
      - Guarantee Defect specific
      - ASR / A's & A's / ABER specific
    """

    # ── dart_type (radio: "Defect" | "Guarantee Defect" | "ASR") ────────────
    dart_type = serializers.CharField(
        required=True,
        help_text='Form type: "Defect", "Guarantee Defect", or "ASR"',
    )

    # ── Equipment (select dropdown → sends ShipEquipment.id as string) ──────
    # Only one of these is sent depending on dart_type
    nomenclature = EmptyStringIntegerField(
        required=False,
        allow_null=True,
        help_text="ShipEquipment ID — for Defect type",
    )
    g_nomenclature = EmptyStringIntegerField(
        required=False,
        allow_null=True,
        help_text="ShipEquipment ID — for Guarantee Defect type",
    )
    a_nomenclature = EmptyStringIntegerField(
        required=False,
        allow_null=True,
        help_text="ShipEquipment ID — for ASR type",
    )

    # ── COMMON: Dropdowns (select → sends DB record ID as string) ───────────
    symptoms = EmptyStringIntegerField(
        required=False,
        allow_null=True,
        help_text="ChMasterSymptoms.id",
    )
    severity = EmptyStringIntegerField(
        required=False,
        allow_null=True,
        help_text="MSeverity.id",
    )
    ssRemarks = EmptyStringIntegerField(
        required=False,
        allow_null=True,
        help_text="ChMasterShipRemarksBy.id",
    )
    requiredAssistance = EmptyStringIntegerField(
        required=False,
        allow_null=True,
        help_text="MRequiredAssistance.required_assistance_id",
    )

    # ── COMMON: Maintenance period & occasion (modal selects) ───────────────
    maintenance_period = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text='"OPERATIONAL" or "REFIT"',
    )
    dart_occasion = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text='Occasion name, e.g. "Normal Defect", "DL II", etc.',
    )
    ops_period_id = EmptyStringIntegerField(
        required=False,
        allow_null=True,
        help_text="RefitMaintenancePeriod.id — for refit/ops link",
    )

    # ── DEFECT: Dates (flatpickr → "YYYY-MM-DD" string) ────────────────────
    defectDate = EmptyStringDateField(
        required=False,
        allow_null=True,
        input_formats=["%Y-%m-%d", "iso-8601"],
    )
    scheduledDate = EmptyStringDateField(
        required=False,
        allow_null=True,
        input_formats=["%Y-%m-%d", "iso-8601"],
        help_text="Tentative Defect Resolution date",
    )

    # ── DEFECT: Text inputs ─────────────────────────────────────────────────
    defect_description = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Defect Description text (Primary)",
    )
    defectiveComponent = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Defective Component text input",
    )

    # ── DEFECT: Radio buttons (value = "YES" or "NO") ───────────────────────
    trial = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text='Trial Required radio: "YES" or "NO"',
    )
    spares_required = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text='Spares Required radio: "YES" or "NO"',
    )
    trial_agency = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Trial Agency select (Primary, shown when trial=YES)",
    )
    universal_id_t_dart = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Reference CMMS/SWMM universal id for T_DART",
    )

    # ── DEFECT: File upload ─────────────────────────────────────────────────
    attachPhotograph = EmptyStringFileField(
        required=False,
        allow_null=True,
        help_text="Photograph file upload",
    )

    # ── GUARANTEE DEFECT: Dates ─────────────────────────────────────────────
    g_defectDate = EmptyStringDateField(
        required=False,
        allow_null=True,
        input_formats=["%Y-%m-%d", "iso-8601"],
    )
    g_completionDate = EmptyStringDateField(
        required=False,
        allow_null=True,
        input_formats=["%Y-%m-%d", "iso-8601"],
    )
    g_repairDate = EmptyStringDateField(
        required=False,
        allow_null=True,
        input_formats=["%Y-%m-%d", "iso-8601"],
    )

    # ── GUARANTEE DEFECT: Text / Selects ────────────────────────────────────
    g_defect_description = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Guarantee Defect Description (Primary)",
    )
    g_cause = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Cause / Reason for the Defect",
    )
    g_place = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Place for repair",
    )

    # ── GUARANTEE DEFECT: Radios ────────────────────────────────────────────
    opAvailability = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text='Op Availability radio: "YES" or "NO"',
    )
    hotWork = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text='Hot Work radio: "YES" or "NO"',
    )
    g_repairs = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text='Repairs select: "0" (NA) or "1" (Date & Place)',
    )

    # ── ASR / ABER: Text inputs ─────────────────────────────────────────────
    aber_type = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text='ABER Type radio: "minor", "major", or "aber"',
    )

    asr_desc = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="A's & A's Description textarea (Legacy alias for description)",
    )
    authority = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Authority textarea",
    )
    remarks = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Remarks textarea",
    )

    # ── SPARES: JSON strings (built by JS, sent as hidden input) ────────────
    obs_spares = serializers.CharField(
        required=False,
        allow_blank=True,
        default="[]",
        help_text='JSON string: [{"pattern":"...", "description":"...", "qty":1, "inventory_type":"OBS"}]',
    )
    pil_spares = serializers.CharField(
        required=False,
        allow_blank=True,
        default="[]",
        help_text='JSON string: [{"pattern":"...", "description":"...", "qty":1}]',
    )
    ilms_spares = serializers.CharField(
        required=False,
        allow_blank=True,
        default="[]",
        help_text='JSON string: [{"pattern":"...", "description":"...", "qty":1, "inventory_type":"WED"|"MO"}]',
    )

    # ── Previous DART No (Last Serial) ──────────────────────────────────────
    previous_dart_no = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Previous DART Number/Last Serial",
    )

    # ── Testing only (not in real form — for unauthenticated Swagger) ───────
    department_id = EmptyStringIntegerField(
        required=False,
        allow_null=True,
        help_text="Department ID (for testing without login)",
    )

    def validate(self, attrs):
        dart_type = attrs.get("dart_type")
        if not dart_type or not str(dart_type).strip():
            raise serializers.ValidationError(
                {"dart_type": "Form type (dart_type) is required."}
            )

        dt_upper = str(dart_type).strip().upper()

        if dt_upper == "GUARANTEE DEFECT":
            g_nom = attrs.get("g_nomenclature") or attrs.get("nomenclature")
            if not g_nom:
                raise serializers.ValidationError(
                    {"g_nomenclature": "Equipment name is required."}
                )
            g_date = attrs.get("g_defectDate")
            if not g_date:
                raise serializers.ValidationError(
                    {"g_defectDate": "Defect date is required."}
                )

        elif dt_upper in ["ASR", "ABER", "A'S & A'S", "A&A"]:
            a_nom = attrs.get("a_nomenclature") or attrs.get("nomenclature")
            if not a_nom:
                raise serializers.ValidationError(
                    {"a_nomenclature": "Equipment name is required."}
                )

        else:
            # Normal Defect
            nom = attrs.get("nomenclature")
            if not nom:
                raise serializers.ValidationError(
                    {"nomenclature": "Equipment name is required."}
                )
            d_date = attrs.get("defectDate")
            if not d_date:
                raise serializers.ValidationError(
                    {"defectDate": "Defect date is required."}
                )
            remarks = attrs.get("ssRemarks")
            if not remarks:
                raise serializers.ValidationError({"ssRemarks": "Remark is required."})

        return attrs


class GeneratedDLIIReportSerializer(serializers.ModelSerializer):
    rows_count = serializers.IntegerField(source="total_dl_rows")
    refit = serializers.CharField(source="refit_type_name", allow_null=True)

    class Meta:
        model = RADLMaster
        fields = [
            "id",
            "ra_dl_name",
            "dockyard_name",
            "refit",
            "rows_count",
            "created_date",
        ]


class GetDartSpareItemSerializer(serializers.Serializer):
    pattern = serializers.CharField()
    description = serializers.CharField()
    inventory_type = serializers.CharField()
    quantity = serializers.IntegerField()


class GetDartDetailsResponseDataSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    dart_number = serializers.CharField()
    dart_date = serializers.CharField()
    rectification_date = serializers.CharField()
    description = serializers.CharField()
    spares = GetDartSpareItemSerializer(many=True)


class GetDartDetailsResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    data = GetDartDetailsResponseDataSerializer()


class CreateRADLFunSerializer(serializers.Serializer):
    defect_ids = serializers.ListField(
        child=serializers.IntegerField(), help_text="List of DART defect IDs"
    )


class CreateRADLDefectDataSerializer(serializers.ModelSerializer):
    opra_no = serializers.CharField(source="rha_defect", allow_null=True)
    dart_date = serializers.DateField(format=DATE_FORMAT, allow_null=True)
    rectification_date = serializers.DateField(format=DATE_FORMAT, allow_null=True)
    equipment = serializers.SerializerMethodField()
    nomenclature = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = InitiateDart
        fields = [
            "id",
            "opra_no",
            "dart_number",
            "dart_date",
            "rectification_date",
            "status",
            "equipment",
            "nomenclature",
            "defective_discriptions",
        ]

    def get_equipment(self, obj):
        if obj.equipment_ship and obj.equipment_ship.equipment:
            return str(obj.equipment_ship.equipment.equipment_class)
        if obj.equipment_ems:
            return obj.equipment_ems.name
        return ""

    def get_nomenclature(self, obj):
        if obj.equipment_ship:
            return obj.equipment_ship.nomenclature
        return ""

    def get_status(self, obj):
        return "Closed" if getattr(obj, "is_closed", False) else "Open"

    def to_representation(self, instance):
        if hasattr(instance, "initiate_dart") and instance.initiate_dart:
            dart_obj = instance.initiate_dart
            ret = super().to_representation(dart_obj)
            ret["id"] = instance.id
            ret["dl_id"] = instance.id
            ret["dart_id"] = dart_obj.id
            ret["defect_id"] = dart_obj.id
            ret["dl_no"] = getattr(instance, "dl_no", "") or ""
            ret["additional_remarks"] = (
                getattr(instance, "additional_remarks", "") or ""
            )
            ret["remarks"] = getattr(instance, "remarks", "") or ""
            return ret
        return super().to_representation(instance)


class CreateRADLFunResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    message = serializers.CharField()
    data = serializers.DictField()


class CompleteDefectSerializer(serializers.Serializer):
    rectified_date = serializers.DateField(required=True)
    repair_agency_code = EmptyStringIntegerField(required=True)
    diagnostic_code = EmptyStringIntegerField(required=False, allow_null=True)
    delay_reason = serializers.CharField(required=False, allow_blank=True)
    days_delay = EmptyStringIntegerField(required=False, default=0, allow_null=True)
    lesson_learnt = serializers.CharField(required=False, allow_blank=True)
    defect_report = EmptyStringFileField(required=False, allow_null=True)

    # JSON Spares or List
    spares_used = serializers.JSONField(
        required=False,
        default=list,
        help_text='JSON array or string: [{"pattern": "", "desc": "", "qty": 1}]',
    )


class CompleteDefectGETDetailSerializer(serializers.ModelSerializer):
    equipment_name = serializers.SerializerMethodField()
    nomenclature = serializers.SerializerMethodField()
    sub_dept = serializers.SerializerMethodField()
    defect_date = serializers.SerializerMethodField()
    defect_closing_date = serializers.SerializerMethodField()
    scheduled_date = serializers.SerializerMethodField()

    class Meta:
        model = InitiateDart
        fields = [
            "id",
            "dart_number",
            "equipment_name",
            "nomenclature",
            "sub_dept",
            "defect_date",
            "defect_closing_date",
            "scheduled_date",
            "defective_discriptions",
        ]

    def get_equipment_name(self, obj):
        if obj.equipment_ship and obj.equipment_ship.equipment:
            return str(obj.equipment_ship.equipment.equipment_class)
        if obj.equipment_ems:
            return obj.equipment_ems.name
        return ""

    def get_nomenclature(self, obj):
        if obj.equipment_ship:
            return obj.equipment_ship.nomenclature
        return ""

    def get_equipment_nomenclature(self, obj):
        return self.get_nomenclature(obj)

    def get_sub_dept(self, obj):
        if obj.equipment_ship and obj.equipment_ship.sub_department_f_key:
            return obj.equipment_ship.sub_department_f_key.name
        return ""

    def get_defect_date(self, obj):
        d = obj.dart_date or obj.created_date
        return d.strftime("%d %b %Y") if d else ""

    def get_defect_closing_date(self, obj):
        from datetime import date

        return date.today().strftime("%d %b %Y")

    def get_scheduled_date(self, obj):
        return (
            obj.rectification_date.strftime("%d %b %Y")
            if obj.rectification_date
            else ""
        )


class IssuedSpareSerializer(serializers.Serializer):
    id = serializers.IntegerField(source="pk", required=False)
    spare_pattern_number = serializers.CharField(
        source="spare.pattern_number", default=""
    )
    spare_description = serializers.CharField(source="spare.description", default="")
    pattern = serializers.CharField(source="spare.pattern_number", default="")
    description = serializers.CharField(source="spare.description", default="")
    quantity_issued = serializers.IntegerField(default=0)
    quantity = serializers.IntegerField(source="quantity_issued", default=0)
    date_of_issue = serializers.DateField(allow_null=True)


class CompleteDefectGETDataSerializer(serializers.Serializer):
    defect = CompleteDefectGETDetailSerializer()
    issued_spare_obj = IssuedSpareSerializer(many=True)
    repair_agency_list = serializers.ListField(child=serializers.DictField())
    diagnostic_list = serializers.ListField(child=serializers.DictField())
    repair_list = serializers.ListField(child=serializers.DictField())
    delay_list = serializers.ListField(child=serializers.DictField())


class CompleteDefectGETResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    message = serializers.CharField()
    data = CompleteDefectGETDataSerializer()


class CompleteDefectPOSTResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    message = serializers.CharField()
    data = serializers.DictField(allow_null=True, required=False)


class ExportPendingDefectsACCDBResponseDataSerializer(serializers.Serializer):
    ra_group_id = serializers.CharField(help_text="Generated RA Group ID")
    total_records = serializers.IntegerField(
        help_text="Total number of DART records processed"
    )
    yard = serializers.CharField(help_text="Selected Yard name")
    dtg = serializers.CharField(
        help_text="Combined DTG string", required=False, allow_blank=True
    )
    export_format = serializers.CharField(help_text="Export format e.g. CSV, XLSX")
    dl_type = serializers.CharField(help_text="DL Type e.g. RA")
    download_url = serializers.CharField(
        help_text="Downloadable file URL link e.g. /media/exports/RA_Export_RA-20260810152800.csv"
    )


class ExportPendingDefectsACCDBResponseSerializer(serializers.Serializer):
    status = serializers.CharField(help_text=OPERATION_STATUS)
    message = serializers.CharField(help_text=SUCCESS_ERROR)
    data = ExportPendingDefectsACCDBResponseDataSerializer(
        required=False, allow_null=True, help_text="RA save / export status details"
    )


class ExportPendingDefectsACCDBSerializer(serializers.Serializer):
    yard = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="Yard Name e.g. ND (V), NSRY (Koc), ND (Mbi)",
    )
    dtg_date = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="DTG Date e.g. 06-08-2026 or YYYY-MM-DD",
    )
    dtg_hour = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="DTG Hour e.g. 10 or HH",
    )
    dtg_minute = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="DTG Minute e.g. 30 or MM",
    )
    dtg = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="Combined DTG string e.g. 2026-08-06 10:30",
    )
    export_format = serializers.CharField(
        required=False,
        allow_blank=True,
        default="CSV",
        help_text="Export format e.g. CSV, XLSX, PDF",
    )
    dart_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=True,
        help_text="List of DART IDs e.g. [11]",
    )
    remarks_data = serializers.JSONField(
        required=False,
        default=dict,
        help_text='JSON object mapping dart_id to additional remarks e.g. {"11": "remark text"}',
    )
    dl_type = serializers.CharField(
        required=False, default="RA", help_text="DL Type e.g. RA, DL-II"
    )
    ss_remarks_data = serializers.JSONField(
        required=False,
        default=dict,
        help_text='JSON object mapping dart_id to SS Remarks ID or Code e.g. {"11": "DAN"}',
    )

    def to_internal_value(self, data):
        import json

        mutable_data = data.copy() if hasattr(data, "copy") else dict(data)
        for field_name in ["dart_ids", "remarks_data", "ss_remarks_data"]:
            if field_name in mutable_data and isinstance(mutable_data[field_name], str):
                try:
                    mutable_data[field_name] = json.loads(mutable_data[field_name])
                except Exception:
                    pass
        return super().to_internal_value(mutable_data)


class GenericSuccessResponseSerializer(serializers.Serializer):
    status = serializers.CharField(default="success")
    message = serializers.CharField()


class CreateDLFunSerializer(serializers.Serializer):
    dl_defect_ids = serializers.ListField(
        child=serializers.IntegerField(), help_text="List of DART defect IDs for DL-II"
    )


class CreateDLRefitItemSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="occasion", allow_null=True)

    class Meta:
        model = RefitMaintenancePeriod
        fields = ["id", "name"]


class CreateDLFunResponseDataSerializer(serializers.Serializer):
    draft_data = CreateRADLDefectDataSerializer(many=True)
    refit_list = CreateDLRefitItemSerializer(many=True)
    ship_remarks_list = serializers.ListField(child=serializers.DictField())


class CreateDLFunResponseSerializer(serializers.Serializer):
    status = serializers.CharField(help_text=OPERATION_STATUS)
    message = serializers.CharField(help_text=SUCCESS_ERROR)
    data = CreateDLFunResponseDataSerializer()


class SaveDLRowsSerializer(serializers.Serializer):
    rows = serializers.ListField(
        child=serializers.DictField(),
        required=True,
        help_text='List of objects e.g. [{"dart_id": 10, "additional_remarks": "...", "remarks": "DAN"}]',
    )


class SaveDLRowsResponseSerializer(serializers.Serializer):
    status = serializers.CharField(help_text=OPERATION_STATUS)
    message = serializers.CharField(help_text=SUCCESS_ERROR)


class DeleteDLRowSerializer(serializers.Serializer):
    dl_id = serializers.IntegerField(required=True, help_text="InitiateRADL record ID")


class DeleteDLRowResponseSerializer(serializers.Serializer):
    status = serializers.CharField(help_text=OPERATION_STATUS)
    message = serializers.CharField(help_text=SUCCESS_ERROR)


class ExportPendingDefectsDL2Serializer(serializers.Serializer):
    yard = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="Yard Code/Name e.g. ND_V, NSRY_Koc, ND_Mbi",
    )
    export_format = serializers.CharField(
        required=False,
        allow_blank=True,
        default="CSV",
        help_text="Export format e.g. CSV, XLSX",
    )
    refit_Type = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="RefitMaintenancePeriod ID",
    )
    row_data = serializers.JSONField(
        required=True,
        help_text='JSON string or array of rows e.g. [{"dl_id": 10, "dl_number": "1001", "additional_remark": "...", "ss_remark": "DAN"}]',
    )


class ExportPendingDefectsDL2ResponseDataSerializer(serializers.Serializer):
    ra_dl_name = serializers.CharField(help_text="Generated DL-II Name")
    total_records = serializers.IntegerField(
        help_text="Total number of DL records processed"
    )
    yard = serializers.CharField(help_text="Yard name")
    download_url = serializers.CharField(help_text="File download URL")


class ExportPendingDefectsDL2ResponseSerializer(serializers.Serializer):
    status = serializers.CharField(help_text=OPERATION_STATUS)
    message = serializers.CharField(help_text=SUCCESS_ERROR)
    data = ExportPendingDefectsDL2ResponseDataSerializer()


class PendingDefectSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    nomenclature = serializers.CharField(
        source="equipment_ship.nomenclature", read_only=True, default=""
    )
    sub_dept = serializers.CharField(
        source="equipment_ship.sub_department_f_key.name", read_only=True, default=""
    )
    eq_name = serializers.CharField(
        source="equipment_ship.equipment.equipment_class", read_only=True, default=""
    )
    occasion = serializers.CharField(source="dart_occasion", read_only=True, default="")
    remarks = serializers.SerializerMethodField()
    opra_no = serializers.SerializerMethodField()
    dl_no = serializers.SerializerMethodField()
    is_gd = serializers.BooleanField(
        source="is_guarantee_defect", read_only=True, default=False
    )
    is_overdue = serializers.SerializerMethodField()

    department = serializers.CharField(
        source="department_id.name", read_only=True, default=""
    )
    rectification_date = serializers.SerializerMethodField()
    cmms_sync_status = serializers.SerializerMethodField()

    class Meta:
        model = InitiateDart
        fields = [
            "id",
            "dart_number",
            "dart_date",
            "rectification_date",
            "status",
            "nomenclature",
            "defective_discriptions",
            "sub_dept",
            "eq_name",
            "department",
            "occasion",
            "maintenance_period",
            "remarks",
            "opra_no",
            "dl_no",
            "cmms_sync_status",
            "is_gd",
            "is_overdue",
        ]

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_cmms_sync_status(self, obj) -> bool:
        """Whether CMMS holds this DART — the grid's "CMMS Sync Status" tick.

        Not the raw `cmms_sync_status` column, which only records that SWMM *pushed* this
        row. A defect that came down from CMMS in the pull has never been pushed, so that
        column stays False on it for good — and the grid drew every one of those (the
        large majority of rows) as un-synced, while "Sync with CMMS" correctly reported
        there was nothing to push. The tick and the sync now read the same predicate, so
        an unticked row always means exactly "the next sync will push this one".
        """
        return dart_is_in_cmms(obj)

    def get_rectification_date(self, obj):
        val = (
            obj.rectification_date
            or obj.guarantee_completion_date
            or obj.guarantee_repair_date
        )
        return val if val else None

    def get_status(self, obj) -> str:
        return "Closed" if obj.is_closed else "Open"

    def get_remarks(self, obj) -> str:
        return obj.remark_code.description if obj.remark_code else "-"

    def get_opra_no(self, obj) -> str:
        try:
            ra_record = (
                InitiateRADL.objects.filter(initiate_dart=obj, dl_type="RA")
                .order_by("-id")
                .first()
            )
            if ra_record:
                return ra_record.dl_no or ra_record.dl_key or ""
        except Exception:
            pass
        return ""

    def get_dl_no(self, obj) -> str:
        try:
            dl_record = (
                InitiateRADL.objects.filter(
                    initiate_dart=obj, dl_type__in=["DL", "DL-II", "DL-III"]
                )
                .order_by("-id")
                .first()
            )
            if dl_record:
                return dl_record.dl_no or dl_record.dl_key or ""
        except Exception:
            pass
        return ""

    def get_is_overdue(self, obj) -> bool:
        if not obj.is_closed and obj.rectification_date:
            return obj.rectification_date < timezone.now().date()
        return False


class DepartmentItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class PendingDefectFilterOptionsSerializer(serializers.Serializer):
    sub_departments = serializers.ListField(child=serializers.CharField())
    maintenance_periods = serializers.ListField(child=serializers.CharField())
    dart_occasions = serializers.ListField(child=serializers.CharField())
    equipment_nomenclatures = serializers.ListField(child=serializers.CharField())
    equipment_names = serializers.ListField(child=serializers.CharField())
    min_date = serializers.CharField(allow_null=True)
    max_date = serializers.CharField(allow_null=True)


class PendingDefectsResponseSerializer(serializers.Serializer):
    is_privileged = serializers.BooleanField()
    all_departments = DepartmentItemSerializer(many=True)
    selected_dept_id = serializers.IntegerField(allow_null=True)
    filter_options = PendingDefectFilterOptionsSerializer()
    open_defects = PendingDefectSerializer(many=True)
    dl_3_defects = PendingDefectSerializer(many=True)


class ShipEquipmentSimpleSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nomenclature = serializers.CharField()


class GetEquipmentObjectsResponseSerializer(serializers.Serializer):
    ship_equipments = ShipEquipmentSimpleSerializer(many=True)


class GetNomenclatureDetailsResponseSerializer(serializers.Serializer):
    equipment_serial_no = serializers.CharField()
    equipment_id = serializers.IntegerField()
    location_on_board = serializers.CharField()
    department = serializers.CharField()
    sub_department = serializers.CharField()
    prev_dart_no = serializers.CharField()


class CompleteDefectDartSerializer(serializers.ModelSerializer):
    # Read-only display names
    repair_agency_name = serializers.StringRelatedField(
        source="repair_agency_code", read_only=True
    )
    diagnostic_name = serializers.StringRelatedField(
        source="diagnostic_code", read_only=True
    )
    repair_name = serializers.StringRelatedField(source="repair_code", read_only=True)
    delay_name = serializers.StringRelatedField(source="delay_code", read_only=True)

    class Meta:
        model = CompleteDefectDart
        fields = "__all__"


class CompleteDartListSerializer(serializers.ModelSerializer):
    """Serializer for complete_dart_list endpoint — closed DARTs with completion details"""

    # Nested completion records
    complete_defect_dart_set = CompleteDefectDartSerializer(many=True, read_only=True)

    # Read-only display names for FK fields
    symptom_code_name = serializers.StringRelatedField(
        source="symptom_code", read_only=True
    )
    serverity_code_name = serializers.StringRelatedField(
        source="severity_code", read_only=True
    )
    remark_code_name = serializers.StringRelatedField(
        source="remark_code", read_only=True
    )
    department_name = serializers.StringRelatedField(
        source="department_id", read_only=True
    )
    equipment_ship_name = serializers.CharField(
        source="equipment_ship.nomenclature", read_only=True, default=None
    )
    equipment_ems_name = serializers.CharField(
        source="equipment_ems.name", read_only=True, default=None
    )

    class Meta:
        model = InitiateDart
        fields = "__all__"


class MaintenancePeriodItemSerializer(serializers.Serializer):
    maintenance_period = serializers.CharField()
    occasion = serializers.CharField()
    start_date = serializers.CharField()
    end_date = serializers.CharField()
    is_current = serializers.BooleanField()


class DartHistoryItemSerializer(serializers.Serializer):
    dartNo = serializers.CharField()
    cmmsSyncStatus = serializers.BooleanField()
    opraNo = serializers.CharField()
    raRaised = serializers.BooleanField()
    dlNo = serializers.CharField()
    dlRaised = serializers.BooleanField()
    equipmentName = serializers.CharField()
    equipmentNomenclature = serializers.CharField()
    defectDescription = serializers.CharField()
    subDepartment = serializers.CharField()
    dartOccasion = serializers.CharField()
    defectDate = serializers.CharField()
    shipRemarks = serializers.CharField()
    id = serializers.IntegerField()
    maintenanceType = serializers.CharField()
    refitType = serializers.CharField()


class DartHistoryFiltersSerializer(serializers.Serializer):
    dartMaintenancePeriod = serializers.ListField(child=serializers.CharField())
    dartOccasions = serializers.ListField(child=serializers.CharField())
    subDepartments = serializers.ListField(child=serializers.CharField())
    dartTypes = serializers.ListField(child=serializers.CharField())
    departments = serializers.ListField(child=serializers.CharField())
    equipments = serializers.ListField(child=serializers.CharField())
    equipmentNomenclatures = serializers.ListField(child=serializers.CharField())


class DartHistoryDefaultDataResponseSerializer(serializers.Serializer):
    data = DartHistoryItemSerializer(many=True)
    filters = DartHistoryFiltersSerializer()


class GetDartSparesItemSerializer(serializers.Serializer):
    item_code = serializers.CharField(required=False, allow_blank=True)
    item_desc = serializers.CharField(required=False, allow_blank=True)
    status = serializers.CharField(required=False, allow_blank=True)
    crp_category = serializers.CharField(required=False, allow_blank=True)
    denomination = serializers.CharField(required=False, allow_blank=True)
    price = serializers.CharField(required=False, allow_blank=True)
    price_date = serializers.CharField(required=False, allow_blank=True)
    ilms_eqpt_code = serializers.CharField(required=False, allow_blank=True)
    ilms_eqpt_desc = serializers.CharField(required=False, allow_blank=True)
    vendor_name = serializers.CharField(required=False, allow_blank=True)
    eqpt = serializers.CharField(required=False, allow_blank=True)
    category = serializers.CharField(required=False, allow_blank=True)
    typeofspare = serializers.CharField(required=False, allow_blank=True)
    avail_status = serializers.CharField(required=False, allow_blank=True)
    wed_eqpt_name = serializers.CharField(required=False, allow_blank=True)
    sfd_equipment = serializers.CharField(required=False, allow_blank=True)
    held_qty = serializers.IntegerField(required=False, allow_null=True)
    authority = serializers.CharField(required=False, allow_blank=True)

    # camelCase keys for OBS / Mapped-OBS
    equipmentClass = serializers.CharField(required=False, allow_blank=True)
    patternNo = serializers.CharField(required=False, allow_blank=True)
    itemDesc = serializers.CharField(required=False, allow_blank=True)
    availabilityStatus = serializers.CharField(required=False, allow_blank=True)
    heldQty = serializers.IntegerField(required=False, allow_null=True)
    crpCategory = serializers.CharField(required=False, allow_blank=True)

    pk = serializers.CharField()

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Only return keys that are explicitly present in the input dictionary
        return {k: v for k, v in ret.items() if k in instance}


class GetDartSparesDataResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    data = GetDartSparesItemSerializer(many=True)


class RefitOperationalOccasionPeriodSerializer(serializers.ModelSerializer):
    type = serializers.CharField(source="occasion")

    class Meta:
        model = RefitMaintenancePeriod
        fields = [
            "id",
            "name",
            "type",
            "maintenance_period",
            "actual_start_date",
            "actual_end_date",
        ]


class RefitOperationalOccasionResponseSerializer(serializers.Serializer):
    title = serializers.CharField()
    pqr = serializers.CharField()
    ref = serializers.CharField()
    refit_periods = RefitOperationalOccasionPeriodSerializer(many=True)
    maint_periods = RefitOperationalOccasionPeriodSerializer(many=True)


class RefitOccasionCreateSerializer(serializers.Serializer):
    """POST: Create a new refit/operational period."""

    start_date = serializers.CharField(help_text="YYYY-MM-DD")
    completion_date = serializers.CharField(help_text="YYYY-MM-DD")
    refit_type = serializers.CharField(help_text="AMP, SMP, EAMP, NR, MR, SR etc.")


class RefitOccasionEditSerializer(serializers.Serializer):
    """PUT: Edit dates of an existing refit/operational period."""

    period_id = serializers.IntegerField(help_text="ID of the period to edit")
    start_date = serializers.CharField(help_text="YYYY-MM-DD")
    completion_date = serializers.CharField(help_text="YYYY-MM-DD")
