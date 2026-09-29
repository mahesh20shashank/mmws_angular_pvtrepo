from master.models import MRanklist, RefitMaintenancePeriod
from rest_framework import serializers

from .models import (
    AddRoutineDetails,
    DataPointsAirprHPC,
    DataPointsExtTemp,
    DataPointsExtTempGTG,
    DataPointsGTLPC,
    EquipmentName,
    FussRaiseDetails,
    FussSpare,
    LessAddRoutineDetails,
    LessRoutineDescription,
    MaintopDetail,
    MaintopHeader,
    MeasurementFuelsondingFinal,
    PlannedAddRoutineDetails,
    PlannedRoutineDescription,
    PostCalculateGTG,
    PostCalculateLPC,
    PostEquipmentStateChangeHistorySave,
    PostRoutineDetails,
    RADLMaster,
    RADLRoutineDescription,
    RoutineDescription,
    SectionName,
    ShipMaster,
    SlipLimit,
    UniqueRoutineName,
)


class MaintopHeaderSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintopHeader
        fields = "__all__"


class MaintopDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintopDetail
        fields = "__all__"


class ShipMasterSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShipMaster
        fields = "__all__"


class SectionNameSerializer(serializers.ModelSerializer):
    class Meta:
        model = SectionName
        fields = "__all__"


class EquipmentNameSerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentName
        fields = "__all__"


class EquipmentStatusEquipmentSerializer(serializers.ModelSerializer):
    section = serializers.CharField(source="section.name", allow_null=True)

    class Meta:
        model = EquipmentName
        fields = (
            "id",
            "name",
            "equipment_code",
            "nomenclature",
            "rhsi",
            "state",
            "section",
        )


class EquipmentStatusResponseSerializer(serializers.Serializer):
    AER_equipment_list = EquipmentStatusEquipmentSerializer(many=True)
    AMR_equipment_list = EquipmentStatusEquipmentSerializer(many=True)
    FER_equipment_list = EquipmentStatusEquipmentSerializer(many=True)
    OMS_equipment_list = EquipmentStatusEquipmentSerializer(many=True)


class PostEquipmentStateChangeHistorySaveSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostEquipmentStateChangeHistorySave
        fields = "__all__"


class UniqueRoutineNameSerializer(serializers.ModelSerializer):
    class Meta:
        model = UniqueRoutineName
        fields = "__all__"


class AddRoutineDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = AddRoutineDetails
        fields = "__all__"


class RoutineDescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoutineDescription
        fields = "__all__"


class PlannedAddRoutineDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlannedAddRoutineDetails
        fields = "__all__"


class PlannedRoutineDescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlannedRoutineDescription
        fields = "__all__"


class PostRoutineDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostRoutineDetails
        fields = "__all__"


class LessAddRoutineDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = LessAddRoutineDetails
        fields = "__all__"


class LessRoutineDescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = LessRoutineDescription
        fields = "__all__"


class SlipLimitSerializer(serializers.ModelSerializer):
    class Meta:
        model = SlipLimit
        fields = "__all__"


class DataPointsExtTempSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataPointsExtTemp
        fields = "__all__"


class DataPointsExtTempGTGSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataPointsExtTempGTG
        fields = "__all__"


class DataPointsAirprHPCSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataPointsAirprHPC
        fields = "__all__"


class DataPointsGTLPCSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataPointsGTLPC
        fields = "__all__"


class PostCalculateLPCSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostCalculateLPC
        fields = "__all__"


class PostCalculateGTGSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostCalculateGTG
        fields = "__all__"


class MeasurementFuelsondingFinalSerializer(serializers.ModelSerializer):
    class Meta:
        model = MeasurementFuelsondingFinal
        fields = "__all__"


class FussRaiseDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = FussRaiseDetails
        fields = "__all__"


class FussSpareSerializer(serializers.ModelSerializer):
    class Meta:
        model = FussSpare
        fields = "__all__"


class RADLMasterSerializer(serializers.ModelSerializer):
    class Meta:
        model = RADLMaster
        fields = "__all__"


class RADLRoutineDescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RADLRoutineDescription
        fields = "__all__"


# ==================== Request/Response Serializers ====================


class UpdateEquipmentStateRequestSerializer(serializers.Serializer):
    equipment_id = serializers.IntegerField(
        required=True, help_text="ID of the equipment to update"
    )
    state = serializers.ChoiceField(
        choices=["ACTIVE", "INACTIVE"],
        required=True,
        help_text="New state: ACTIVE or INACTIVE",
    )
    started_at_location = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, help_text="Location name"
    )
    start_timedate = serializers.DateTimeField(
        required=False,
        allow_null=True,
        help_text="Start timestamp (YYYY-MM-DDTHH:MM:SS)",
    )
    stop_timedate = serializers.DateTimeField(
        required=False,
        allow_null=True,
        help_text="Stop timestamp (YYYY-MM-DDTHH:MM:SS)",
    )


class MulRaiseFussRoutineSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    routine_no = serializers.CharField(allow_blank=True, allow_null=True)
    routine_description = serializers.CharField(allow_blank=True, allow_null=True)
    maintop_no = serializers.CharField(allow_blank=True, allow_null=True)
    frequency = serializers.CharField(allow_blank=True, allow_null=True)
    category = serializers.CharField(allow_blank=True, allow_null=True)
    equipment_name = serializers.CharField(allow_blank=True, allow_null=True)
    dart_no = serializers.CharField(allow_blank=True, allow_null=True)

    # Flat detail fields to populate form from routines[0]
    ship = serializers.CharField(allow_blank=True, allow_null=True)
    sub_department = serializers.CharField(allow_blank=True, allow_null=True)
    serial_no = serializers.CharField(allow_blank=True, allow_null=True)
    location_on_board = serializers.CharField(allow_blank=True, allow_null=True)
    location_code = serializers.CharField(allow_blank=True, allow_null=True)
    equipment_sr_no = serializers.CharField(allow_blank=True, allow_null=True)


class MulRaiseFussDefermentSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    description = serializers.CharField()
    code = serializers.CharField(allow_blank=True, allow_null=True)


class MulRaiseFussReasonSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    description = serializers.CharField()
    code = serializers.CharField(allow_blank=True, allow_null=True)
    universal_id_m_reason = serializers.CharField(allow_blank=True, allow_null=True)


class MulRaiseFussInabilitySerializer(serializers.Serializer):
    id = serializers.IntegerField(source="inability_id")
    description = serializers.CharField()
    universal_id_m_reason = serializers.CharField(allow_blank=True, allow_null=True)


class MulRaiseFussSpareSerializer(serializers.Serializer):
    pattern_number = serializers.CharField()
    description = serializers.CharField(allow_blank=True, allow_null=True)
    name = serializers.CharField(allow_blank=True, allow_null=True)


class MulRaiseFussEstablishmentSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class MulRaiseFussOrganizationSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class MulRaiseFussResponseSerializer(serializers.Serializer):
    routines = MulRaiseFussRoutineSerializer(many=True)
    selected_ids = serializers.ListField(child=serializers.CharField())
    deferments = MulRaiseFussDefermentSerializer(many=True)
    inabilities = MulRaiseFussInabilitySerializer(many=True)
    reasons = MulRaiseFussReasonSerializer(many=True)
    spare_obj = MulRaiseFussSpareSerializer(many=True)
    establishment_obj = MulRaiseFussEstablishmentSerializer(many=True)
    organizations_obj = MulRaiseFussOrganizationSerializer(many=True)


class MulRaiseFussRequestSerializer(serializers.Serializer):
    selected_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        default=[],
        help_text="List of Routine ID integers",
    )
    add_routine_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="The ID of the master AddRoutineDetails record",
    )
    spares_data = serializers.DictField(
        required=False,
        default={},
        help_text="Spares data dictionary e.g. {'pattern1': {'description': 'Desc', 'qty': 2}}",
    )
    spares_json = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Spares data as a JSON string (for backward compatibility)",
    )
    ship = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    department = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    serial_no = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    fuss_date = serializers.DateField(required=False, allow_null=True)
    last_undertaken = serializers.DateField(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    schedule_date = serializers.DateField(required=False, allow_null=True)
    equipment = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    location_on_board = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    equipment_sr_no = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    location_code = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    maintop_no = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    frequency = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    amendment_no = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    new_equipment = serializers.BooleanField(required=False, default=False)
    recomm_deferment = serializers.IntegerField(required=False, allow_null=True)
    inability = serializers.IntegerField(required=False, allow_null=True)
    reason = serializers.IntegerField(required=False, allow_null=True)
    mos_wed = serializers.IntegerField(required=False, allow_null=True)
    yard = serializers.IntegerField(required=False, allow_null=True)
    last_smp_completed = serializers.DateField(required=False, allow_null=True)
    last_smp_duration = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    last_amp_completed = serializers.DateField(required=False, allow_null=True)
    last_amp_duration = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    amp_smp_required_wef = serializers.DateField(required=False, allow_null=True)
    amp_smp_duration = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    demand_details = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )


class CompleteFussRequestSerializer(serializers.Serializer):
    complete_date = serializers.DateField(
        required=True, help_text="Date of completion (YYYY-MM-DD)"
    )
    hours = serializers.IntegerField(required=False, allow_null=True)
    minutes = serializers.IntegerField(required=False, allow_null=True)
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    spares = serializers.ListField(
        child=serializers.CharField(), required=False, default=[]
    )
    carried_by = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    p_no = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    rank = serializers.IntegerField(required=False, allow_null=True)
    other_rank = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    total_manpower = serializers.IntegerField(required=False, allow_null=True)
    running_hour = serializers.FloatField(required=False, allow_null=True)
    due_running_hour = serializers.FloatField(required=False, allow_null=True)
    completion_details = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    trial_team = serializers.BooleanField(required=False, default=False)
    rec_for_deletion = serializers.BooleanField(required=False, default=False)
    old_dart_number = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    not_applicable = serializers.BooleanField(required=False, default=False)
    rec_deletion = serializers.BooleanField(required=False, default=False)


class SaveOemSpareRequestSerializer(serializers.Serializer):
    pattern_number = serializers.CharField(required=True)
    equipment_class_id = serializers.IntegerField(required=True)
    name = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    description = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    denomination_id = serializers.IntegerField(required=False, allow_null=True)
    price = serializers.FloatField(required=False, allow_null=True)
    authority_id = serializers.IntegerField(required=False, allow_null=True)


class SaveRoutineInitializationRowRequestSerializer(serializers.Serializer):
    routine_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=1,
        help_text="Primary key of RoutineDescription (or use pk/id)",
    )
    pk = serializers.IntegerField(required=False, allow_null=True)
    id = serializers.IntegerField(required=False, allow_null=True)
    completion_date = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        default="12 Apr 2026 12:36 PM",
        help_text="Completion date string (e.g. '12 Apr 2026 12:36 PM' or '2026-04-12')",
    )
    previous_completed_date = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    undertaken_rh = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        default="1250",
        help_text="Running hours value at completion (e.g. '1250')",
    )
    previous_completed_at_rh = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )


class SaveRoutineInitBulkRequestSerializer(serializers.Serializer):
    pks = serializers.ListField(child=serializers.IntegerField(), required=True)
    completion_date = serializers.DateField(required=False, allow_null=True)
    undertaken_rh = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )


class DlDraftRowSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=True)
    dl_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    additional_remarks = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class SaveDlDraftRowsRequestSerializer(serializers.Serializer):
    rows = serializers.ListField(child=DlDraftRowSerializer(), required=True)
    yard = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    refit_type = serializers.IntegerField(required=False, allow_null=True)


class DeleteDlDraftRowRequestSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=True)


class LookupFuelSoundingRequestSerializer(serializers.Serializer):
    mm_measurement = serializers.FloatField(required=False, allow_null=True)
    mm_value = serializers.FloatField(required=False, allow_null=True)
    tank_type = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    manual_name = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )


class GenerateDl1RequestSerializer(serializers.Serializer):
    pk_list = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=[]
    )


class GetSectionNameResponseSerializer(serializers.Serializer):
    section_name = serializers.DictField(child=serializers.IntegerField())


class GetEquipmentNameResponseSerializer(serializers.Serializer):
    equipment_name = serializers.DictField(child=serializers.IntegerField())


class GetsrarEquipmentNameResponseSerializer(serializers.Serializer):
    equipment_name = serializers.DictField(child=serializers.IntegerField())


class GetEquipmentNameWithoutRHSINullRowsResponseSerializer(serializers.Serializer):
    equipment_name = serializers.DictField(child=serializers.IntegerField())


class GetRoutineNameResponseSerializer(serializers.Serializer):
    routine_name = serializers.DictField(child=serializers.IntegerField())


class EmsSectionCreateRequestSerializer(serializers.Serializer):
    form_id = serializers.CharField(required=True)
    section_id = serializers.IntegerField(required=False, allow_null=True)
    sub_dep = serializers.IntegerField(required=False, allow_null=True)
    section_name = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )


class EmsEquipmentCreateRequestSerializer(serializers.Serializer):
    form_id = serializers.CharField(required=True)
    name = serializers.CharField(required=True)
    section = serializers.IntegerField(required=True)


class EmsTotalRunningHoursCreateRequestSerializer(serializers.Serializer):
    equipment = serializers.IntegerField(required=False, allow_null=True)
    name = serializers.IntegerField(required=False, allow_null=True)
    rhsi_updated_until = serializers.CharField(required=True)
    rhsi = serializers.FloatField(required=True)


class MonthlyRunningHoursRowSerializer(serializers.Serializer):
    start = serializers.CharField(required=True)
    stop = serializers.CharField(required=True)
    location = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class EmsMonthlyRunningHoursSaveRequestSerializer(serializers.Serializer):
    equipment_id = serializers.IntegerField(required=True)
    rows = serializers.ListField(
        child=MonthlyRunningHoursRowSerializer(), required=True
    )


class GetEquipmentHistoryItemSerializer(serializers.Serializer):
    start = serializers.CharField()
    stop = serializers.CharField()
    duration = serializers.CharField()
    location = serializers.CharField(allow_null=True)


class GetEquipmentHistoryResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    history = serializers.ListField(child=GetEquipmentHistoryItemSerializer())
    last_updated_until = serializers.CharField(allow_null=True)


# ── SearchDetailForStateChange serializers ────────────────────────────────────

class EquipmentStateChangeHistorySerializer(serializers.ModelSerializer):
    """
    Mirrors legacy ``history`` queryset passed to searchdetails_forstatechange.html.
    Date format matches legacy ``get_equipment_history`` response exactly.
    """

    start = serializers.SerializerMethodField()
    stop = serializers.SerializerMethodField()
    duration = serializers.SerializerMethodField()

    class Meta:
        from .models import PostEquipmentStateChangeHistorySave

        model = PostEquipmentStateChangeHistorySave
        fields = ("month_name", "start", "stop", "duration", "started_at_location")

    def get_start(self, obj):
        return (
            obj.start_time.strftime("%d %b %Y, %I:%M %p") if obj.start_time else ""
        )

    def get_stop(self, obj):
        return (
            obj.stop_time.strftime("%d %b %Y, %I:%M %p") if obj.stop_time else ""
        )

    def get_duration(self, obj):
        from .utils import pseudo_hours_to_hhmm

        return pseudo_hours_to_hhmm(obj.diff_in_hours)


class EquipmentNameStateDetailSerializer(serializers.ModelSerializer):
    """
    Full equipment projection for the state-change detail page.
    Mirrors every field legacy ``SearchDetailForStateChangeView`` put in context.
    """

    rhsi_formatted = serializers.SerializerMethodField()
    # ISO strings — Angular can parse these directly
    rhsi_updated_until = serializers.DateTimeField(
        read_only=True, allow_null=True, format="iso-8601"
    )
    start_timedate = serializers.DateTimeField(
        read_only=True, allow_null=True, format="iso-8601"
    )
    stop_timedate = serializers.DateTimeField(
        read_only=True, allow_null=True, format="iso-8601"
    )
    section_id = serializers.PrimaryKeyRelatedField(
        source="section", read_only=True, allow_null=True
    )
    sub_department_id = serializers.PrimaryKeyRelatedField(
        source="sub_department", read_only=True, allow_null=True
    )

    class Meta:
        from .models import EquipmentName

        model = EquipmentName
        fields = (
            "id",
            "name",
            "nomenclature",
            "equipment_code",
            "state",
            "rhsi",
            "rhsi_formatted",
            "rhsi_updated_until",
            "start_timedate",
            "stop_timedate",
            "started_at_location",
            "sub_department_id",
            "section_id",
        )

    def get_rhsi_formatted(self, obj):
        from .utils import pseudo_hours_to_hhmm

        return pseudo_hours_to_hhmm(obj.rhsi)


class SearchDetailForStateChangeResponseSerializer(serializers.Serializer):
    """Top-level response — matches every key the legacy HTML template consumed."""

    equipment_detail = EquipmentNameStateDetailSerializer()
    section_detail = serializers.CharField(allow_null=True)
    # ACTIVE only — ISO datetime; INACTIVE only — human-readable string
    start_time_display = serializers.CharField(allow_null=True)
    rhsi_updated_until_display = serializers.CharField(allow_null=True)
    next_equipment = serializers.IntegerField(allow_null=True)
    previous_equipment = serializers.IntegerField(allow_null=True)
    history = EquipmentStateChangeHistorySerializer(many=True)
    # Mirrors legacy EquipmentStateChangeForm — Angular uses this to build the form
    form_options = serializers.DictField()



class CompleteRoutineRequestSerializer(serializers.Serializer):
    date_of_completion = serializers.CharField(required=False, allow_null=True)
    running_hour = serializers.FloatField(required=False, default=0.0)
    rank_routine = serializers.IntegerField(required=False, allow_null=True)
    rank_other = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    hours = serializers.IntegerField(required=False, allow_null=True)
    minutes = serializers.IntegerField(required=False, allow_null=True)
    carried_by = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    p_no = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    total_manpower = serializers.IntegerField(required=False, allow_null=True)
    due_running_hour = serializers.FloatField(required=False, allow_null=True)
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    completion_details = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    trial_team = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    rec_for_deletion = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    old_dart_number = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    spares = serializers.ListField(
        child=serializers.CharField(), required=False, default=[]
    )


class PlanRoutineSaveSpareSerializer(serializers.Serializer):
    pattern = serializers.CharField(
        required=True,
        help_text="Spare pattern number or item code (e.g. 'PAT-101')",
    )
    qty = serializers.FloatField(
        required=True,
        help_text="Quantity required (e.g. 2.0)",
    )
    inventory_type = serializers.CharField(
        required=False,
        default="",
        help_text="Inventory type: 'OBS', 'PIL', 'WED', or 'MO'",
    )


class PlanRoutineSaveRequestSerializer(serializers.Serializer):
    planned_commencement_date = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Planned commencement date formatted as YYYY-MM-DD",
    )
    spares_required = serializers.ChoiceField(
        choices=["YES", "NO"],
        required=False,
        default="NO",
        help_text="Whether spares are required ('YES' or 'NO')",
    )
    spares = serializers.ListField(
        child=PlanRoutineSaveSpareSerializer(),
        required=False,
        default=[],
        help_text="List of spare items required for this routine",
    )


class PlanRoutineMultiSaveRequestSerializer(serializers.Serializer):
    selected_ids = serializers.CharField(
        required=True,
        help_text="Comma-separated string of Routine IDs, e.g., '1,2,3'",
    )
    planned_commencement_date = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Planned commencement date formatted as YYYY-MM-DD",
    )


class SearchResultViewPlanRequestSerializer(serializers.Serializer):
    department = serializers.IntegerField(required=False, allow_null=True)
    section = serializers.IntegerField(required=False, allow_null=True)
    equipment_name = serializers.IntegerField(required=False, allow_null=True)
    routine_category = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    routine_name = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    equipment_name_text = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    year = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    hours = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class GetManualNamesRequestSerializer(serializers.Serializer):
    tank_type = serializers.CharField(required=True)


class GetRoutineNameRequestSerializer(serializers.Serializer):
    category = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    sectionId = serializers.IntegerField(required=False, allow_null=True)
    equipment_id = serializers.IntegerField(required=False, allow_null=True)


class GetEquipmentBySectionRequestSerializer(serializers.Serializer):
    section_id = serializers.IntegerField(required=True)


# ─────────────────────────────────────────────────────────────
# CMMS FUSS & MAINTOP Integration Serializers
# ─────────────────────────────────────────────────────────────


class GenericSuccessResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    message = serializers.CharField()
    data = serializers.JSONField(required=False, default=None, allow_null=True)


class FussRaiseRequestSerializer(serializers.Serializer):
    routine_description_id = serializers.IntegerField(required=True)
    fuss_date = serializers.DateField(required=False, allow_null=True)
    last_undertaken = serializers.DateField(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    schedule_date = serializers.DateField(required=False, allow_null=True)
    equipment = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    location_on_board = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    maintop_no = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, default=""
    )
    frequency = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, default=""
    )


class FussRaiseDetailResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    isclosed_fuss = serializers.BooleanField(default=False)
    serial_no = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    routine_description_id = serializers.IntegerField(required=False, allow_null=True)
    fuss_date = serializers.DateField(required=False, allow_null=True)
    last_undertaken = serializers.DateField(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    schedule_date = serializers.DateField(required=False, allow_null=True)
    equipment = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    location_on_board = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    maintop_no = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    frequency = serializers.CharField(required=False, allow_null=True, allow_blank=True)


class MDefermentResponseSerializer(serializers.Serializer):
    DefermentID = serializers.IntegerField(source="id")
    DefermentCode = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, source="code"
    )
    Description = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, source="description"
    )
    Active = serializers.BooleanField(required=False, allow_null=True, source="active")
    Universal_ID_M_Deferment = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, source="universal_id"
    )


class MReasonResponseSerializer(serializers.Serializer):
    ReasonID = serializers.IntegerField(source="id")
    ReasonCode = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, source="code"
    )
    Description = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, source="description"
    )
    Active = serializers.BooleanField(required=False, allow_null=True, source="active")
    Universal_ID_M_Reason = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, source="universal_id"
    )


class MInabilityResponseSerializer(serializers.Serializer):
    InabilityID = serializers.IntegerField(source="id")
    InabilityCode = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, source="code"
    )
    Description = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, source="description"
    )
    Active = serializers.BooleanField(required=False, allow_null=True, source="active")
    Universal_ID_M_Inability = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, source="universal_id"
    )


class FussSyncPayloadResponseSerializer(serializers.Serializer):
    T_fuss = FussRaiseDetailResponseSerializer(many=True, required=False, default=[])
    M_Deferment = MDefermentResponseSerializer(many=True, required=False, default=[])
    M_Reason = MReasonResponseSerializer(many=True, required=False, default=[])
    M_Inability = MInabilityResponseSerializer(many=True, required=False, default=[])


class FussMastersResponseSerializer(serializers.Serializer):
    M_deferment = MDefermentResponseSerializer(many=True, required=False, default=[])
    M_reason = MReasonResponseSerializer(many=True, required=False, default=[])
    M_inability = MInabilityResponseSerializer(many=True, required=False, default=[])


class MaintopHeaderSyncItemSerializer(serializers.Serializer):
    MaintopID = serializers.IntegerField()
    MaintopNo = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    MaintopTitle = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    AmendmentNo = serializers.IntegerField(required=False, allow_null=True)
    Active = serializers.IntegerField(required=False, allow_null=True)
    Universal_ID_T_MaintopHeader = serializers.CharField(required=True)


class MaintopDetailSyncItemSerializer(serializers.Serializer):
    RoutineID = serializers.IntegerField()
    MaintopID = serializers.IntegerField(required=False, allow_null=True)
    MaintopNo = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    RoutineNo = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    RoutineDescription = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    Frequency = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    Active = serializers.IntegerField(required=False, allow_null=True)
    Universal_ID_T_MaintopHeader = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    Universal_ID_T_MaintopDetail = serializers.CharField(required=True)


class MaintopSyncRequestSerializer(serializers.Serializer):
    T_maintopheader = MaintopHeaderSyncItemSerializer(many=True, required=True)
    T_maintopdetail = MaintopDetailSyncItemSerializer(many=True, required=True)


class MaintopSyncResponseSerializer(serializers.Serializer):
    status = serializers.BooleanField()
    headers_processed = serializers.IntegerField()
    details_processed = serializers.IntegerField()


class MaintopJICSyncItemSerializer(serializers.Serializer):
    JICID = serializers.IntegerField()
    Universal_ID_T_MaintopJIC = serializers.CharField(required=True)
    Universal_ID_T_MaintopDetail = serializers.CharField(required=True)
    JobSteps = serializers.CharField(required=False, allow_null=True, allow_blank=True)


class JICSparesSyncItemSerializer(serializers.Serializer):
    JICID = serializers.IntegerField(required=False, allow_null=True)
    SpareItemCode = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    Quantity = serializers.IntegerField(required=False, allow_null=True)
    Universal_ID_T_JICspares = serializers.CharField(required=True)


class JICToolsSyncItemSerializer(serializers.Serializer):
    JICID = serializers.IntegerField(required=False, allow_null=True)
    ToolCode = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    ToolName = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    Universal_ID_T_JICtools = serializers.CharField(required=True)


class JICAttachmentsSyncItemSerializer(serializers.Serializer):
    JICID = serializers.IntegerField(required=False, allow_null=True)
    FileName = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    FileUrl = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    Universal_ID_T_JICattachments = serializers.CharField(required=True)


class MaintopJICRequestSerializer(serializers.Serializer):
    T_maintopJIC = MaintopJICSyncItemSerializer(many=True, required=True)
    T_JICspares = JICSparesSyncItemSerializer(many=True, required=True)
    T_JICtools = JICToolsSyncItemSerializer(many=True, required=True)
    T_JICattachments = JICAttachmentsSyncItemSerializer(many=True, required=True)


class MaintopJICResponseSerializer(serializers.Serializer):
    status = serializers.BooleanField()
    jics_processed = serializers.IntegerField()
    spares_processed = serializers.IntegerField()
    tools_processed = serializers.IntegerField()
    attachments_processed = serializers.IntegerField()


class AddressSyncItemSerializer(serializers.Serializer):
    AddressID = serializers.IntegerField()
    AddressName = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    Universal_ID_M_Address = serializers.CharField(required=True)


class DistAddressSyncItemSerializer(serializers.Serializer):
    DistAddressID = serializers.IntegerField()
    AddressID = serializers.IntegerField(required=False, allow_null=True)
    DistName = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    Universal_ID_M_DistributionAddress = serializers.CharField(required=True)


class MaintopListDistSyncItemSerializer(serializers.Serializer):
    MaintopID = serializers.IntegerField(required=False, allow_null=True)
    DistAddressID = serializers.IntegerField(required=False, allow_null=True)
    Active = serializers.IntegerField(required=False, allow_null=True)
    Universal_ID_T_MaintopListDist = serializers.CharField(required=True)


class MaintopLibraryDisDefSyncItemSerializer(serializers.Serializer):
    LibraryID = serializers.IntegerField(required=False, allow_null=True)
    DefaultAddressID = serializers.IntegerField(required=False, allow_null=True)
    IsDefaultActive = serializers.IntegerField(required=False, allow_null=True)
    Universal_ID_T_MaintopLibraryDisDef = serializers.CharField(required=True)


class MaintopDistributionRequestSerializer(serializers.Serializer):
    M_address = AddressSyncItemSerializer(many=True, required=True)
    M_distribution_address = DistAddressSyncItemSerializer(many=True, required=True)
    T_maintoplistdist = MaintopListDistSyncItemSerializer(many=True, required=True)
    T_MaintoplibraryDisDef = MaintopLibraryDisDefSyncItemSerializer(
        many=True, required=True
    )


class MaintopDistributionResponseSerializer(serializers.Serializer):
    status = serializers.BooleanField()
    addresses_processed = serializers.IntegerField()
    distributions_processed = serializers.IntegerField()
    defaults_processed = serializers.IntegerField()


class MRanklistSerializer(serializers.ModelSerializer):
    class Meta:
        model = MRanklist
        fields = "__all__"


class InitiateCloseRoutineResponseSerializer(serializers.Serializer):
    # Form display fields (flattened for easy frontend binding)
    old_dart_number = serializers.CharField(allow_blank=True, allow_null=True)
    equipment_class = serializers.CharField(allow_blank=True, allow_null=True)
    equipment_serial_no = serializers.CharField(allow_blank=True, allow_null=True)
    nomenclature = serializers.CharField(allow_blank=True, allow_null=True)
    due_date = serializers.DateField(allow_null=True)
    last_completion_date = serializers.DateField(allow_null=True)
    maintop_remarks = serializers.CharField(allow_blank=True, allow_null=True)
    location_on_board = serializers.CharField(allow_blank=True, allow_null=True)
    maintop_routine_number = serializers.CharField(allow_blank=True, allow_null=True)
    routine_description = serializers.CharField(allow_blank=True, allow_null=True)

    # Metadata for dropdowns & selection
    minutes_range = serializers.ListField(child=serializers.IntegerField())
    hours_range = serializers.ListField(child=serializers.IntegerField())

    # User info
    fullname = serializers.CharField(allow_blank=True, allow_null=True)
    rankname = serializers.CharField(allow_blank=True, allow_null=True)
    rank_obj = MRanklistSerializer(many=True, allow_null=True)
    max_hours = serializers.FloatField(allow_null=True)

    # Nested objects/lists
    planned_routine = RoutineDescriptionSerializer()
    planned_obj = PlannedRoutineDescriptionSerializer(allow_null=True)
    spares_for_routine = serializers.SerializerMethodField()
    issue_list = serializers.SerializerMethodField()

    def get_spares_for_routine(self, obj):
        from obs.serializers import PlannedRoutineSpareListSerializer

        spares = obj.get("spares_for_routine")
        from ems.models import RoutineDescription

        if spares and not isinstance(spares, RoutineDescription):
            return PlannedRoutineSpareListSerializer(spares, many=True).data
        return []

    def get_issue_list(self, obj):
        from obs.serializers import IssueSerializer

        issues = obj.get("issue_list")
        if issues:
            return IssueSerializer(issues, many=True).data
        return []


class FrontendSelectOptionSerializer(serializers.Serializer):
    value = serializers.CharField()
    label = serializers.CharField()


class FrontendIdLabelOptionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    label = serializers.CharField()


class FrontendRoutinePlanCountsSerializer(serializers.Serializer):
    due = serializers.IntegerField()
    due_lt_3m_500h = serializers.IntegerField()
    due_3_6m_1000h = serializers.IntegerField()
    other = serializers.IntegerField()
    total = serializers.IntegerField()


class FrontendRoutinePlanSearchItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    section_id = serializers.IntegerField(allow_null=True)
    section_name = serializers.CharField(allow_blank=True, allow_null=True)
    equipment_id = serializers.IntegerField(allow_null=True)
    equipment_name = serializers.CharField(allow_blank=True, allow_null=True)
    routine_type = serializers.CharField(allow_blank=True, allow_null=True)
    routine_name = serializers.CharField(allow_blank=True, allow_null=True)
    maintop_no = serializers.CharField(allow_blank=True, allow_null=True)
    last_routine_date = serializers.CharField(allow_blank=True, allow_null=True)
    next_due_date = serializers.CharField(allow_blank=True, allow_null=True)
    last_routine_running_hours = serializers.CharField(
        allow_blank=True,
        allow_null=True,
    )
    next_due_running_hours = serializers.CharField(
        allow_blank=True,
        allow_null=True,
    )
    total_running_hours = serializers.CharField(allow_blank=True, allow_null=True)
    running_hours_updated_till = serializers.CharField(
        allow_blank=True,
        allow_null=True,
    )
    running_hours_available = serializers.CharField(
        allow_blank=True,
        allow_null=True,
    )
    due_status = serializers.CharField(allow_blank=True, allow_null=True)
    due_bucket = serializers.CharField()
    status_color = serializers.CharField()


class FrontendRoutinePlanFiltersSerializer(serializers.Serializer):
    sections = FrontendIdLabelOptionSerializer(many=True)
    equipment = FrontendIdLabelOptionSerializer(many=True)
    routine_types = FrontendSelectOptionSerializer(many=True)
    routine_names = FrontendSelectOptionSerializer(many=True)


class FrontendRoutinePlanSearchResponseSerializer(serializers.Serializer):
    filters = FrontendRoutinePlanFiltersSerializer()
    counts = FrontendRoutinePlanCountsSerializer()
    items = FrontendRoutinePlanSearchItemSerializer(many=True)


class FrontendRoutinePlanDetailItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    routine_name = serializers.CharField(allow_blank=True, allow_null=True)
    equipment_name = serializers.CharField(allow_blank=True, allow_null=True)
    maintop_no = serializers.CharField(allow_blank=True, allow_null=True)
    dart_number = serializers.CharField(allow_blank=True, allow_null=True)
    routine_description = serializers.CharField(allow_blank=True, allow_null=True)
    routine_no = serializers.CharField(allow_blank=True, allow_null=True)
    previous_routine_completed_date = serializers.CharField(
        allow_blank=True,
        allow_null=True,
    )
    due_date = serializers.CharField(allow_blank=True, allow_null=True)
    due_at_rh = serializers.CharField(allow_blank=True, allow_null=True)
    previous_completed_at_rh = serializers.CharField(
        allow_blank=True,
        allow_null=True,
    )
    action_by = serializers.CharField(allow_blank=True, allow_null=True)
    due_status = serializers.CharField(allow_blank=True, allow_null=True)
    due_bucket = serializers.CharField()
    status_color = serializers.CharField()


class FrontendRoutinePlanDetailSummarySerializer(serializers.Serializer):
    add_routine_id = serializers.IntegerField()
    routine_name = serializers.CharField(allow_blank=True, allow_null=True)
    equipment_name = serializers.CharField(allow_blank=True, allow_null=True)
    maintop_no = serializers.CharField(allow_blank=True, allow_null=True)
    routine_type = serializers.CharField(allow_blank=True, allow_null=True)
    section_name = serializers.CharField(allow_blank=True, allow_null=True)
    dynamic_running_hours = serializers.FloatField(allow_null=True)


class FrontendRoutinePlanDetailResponseSerializer(serializers.Serializer):
    routine = FrontendRoutinePlanDetailSummarySerializer()
    counts = FrontendRoutinePlanCountsSerializer()
    items = FrontendRoutinePlanDetailItemSerializer(many=True)


class FrontendRoutinePlanCatalogItemSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField(allow_blank=True, allow_null=True)
    description = serializers.CharField(allow_blank=True, allow_null=True)


class FrontendRoutinePlanWedMappedItemSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField(allow_blank=True, allow_null=True)
    mapped_equipment_class = serializers.CharField(allow_blank=True, allow_null=True)


class FrontendRoutinePlanDenominationSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(allow_blank=True, allow_null=True)


class FrontendRoutinePlanRoutineSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    add_routine_id = serializers.IntegerField(allow_null=True)
    sub_department = serializers.CharField(allow_blank=True, allow_null=True)
    equipment_name = serializers.CharField(allow_blank=True, allow_null=True)
    equipment_nomenclature = serializers.CharField(allow_blank=True, allow_null=True)
    section_name = serializers.CharField(allow_blank=True, allow_null=True)
    rhsi = serializers.CharField(allow_blank=True, allow_null=True)
    maintop_no = serializers.CharField(allow_blank=True, allow_null=True)
    routine_no = serializers.CharField(allow_blank=True, allow_null=True)
    dart_no = serializers.CharField(allow_blank=True, allow_null=True)
    routine_name = serializers.CharField(allow_blank=True, allow_null=True)
    routine_description = serializers.CharField(allow_blank=True, allow_null=True)
    due_date = serializers.CharField(allow_blank=True, allow_null=True)
    due_at_rh = serializers.CharField(allow_blank=True, allow_null=True)
    routine_due_rh = serializers.CharField(allow_blank=True, allow_null=True)
    previous_completed_date = serializers.CharField(allow_blank=True, allow_null=True)
    previous_completed_at_rh = serializers.CharField(
        allow_blank=True,
        allow_null=True,
    )
    action_by = serializers.CharField(allow_blank=True, allow_null=True)
    planned_commencement_date = serializers.CharField(allow_blank=True, allow_null=True)
    spares_required = serializers.CharField(allow_blank=True, allow_null=True)


class FrontendRoutinePlanSpareRowSerializer(serializers.Serializer):
    pattern_number = serializers.CharField(allow_blank=True, allow_null=True)
    oem_part_number = serializers.CharField(allow_blank=True, allow_null=True)
    spare_description = serializers.CharField(allow_blank=True, allow_null=True)
    inventory_type = serializers.CharField(allow_blank=True, allow_null=True)
    wed_inventory_type = serializers.CharField(allow_blank=True, allow_null=True)
    quantity_required = serializers.IntegerField()
    action = serializers.CharField(allow_blank=True, allow_null=True)


class FrontendRoutinePlanLookupSerializer(serializers.Serializer):
    obs_pil_mapped = FrontendRoutinePlanCatalogItemSerializer(many=True)
    obs_pil_unmapped = FrontendRoutinePlanCatalogItemSerializer(many=True)
    mo_all = FrontendRoutinePlanCatalogItemSerializer(many=True)
    mo_mapped = FrontendRoutinePlanCatalogItemSerializer(many=True)
    wed_all = FrontendRoutinePlanCatalogItemSerializer(many=True)
    wed_mapped = FrontendRoutinePlanWedMappedItemSerializer(many=True)
    denominations = FrontendRoutinePlanDenominationSerializer(many=True)


class FrontendRoutinePlanFormResponseSerializer(serializers.Serializer):
    routine = FrontendRoutinePlanRoutineSerializer()
    lookup = FrontendRoutinePlanLookupSerializer()
    spares = FrontendRoutinePlanSpareRowSerializer(many=True)


class FrontendRoutinePlanSaveResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    message = serializers.CharField()
    planned_routine_id = serializers.IntegerField(allow_null=True)


class FrontendPlannedRoutineItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    section_id = serializers.IntegerField(allow_null=True)
    section_name = serializers.CharField(allow_blank=True, allow_null=True)
    equipment_id = serializers.IntegerField(allow_null=True)
    equipment_name = serializers.CharField(allow_blank=True, allow_null=True)
    routine_type = serializers.CharField(allow_blank=True, allow_null=True)
    routine_name = serializers.CharField(allow_blank=True, allow_null=True)
    maintop_no = serializers.CharField(allow_blank=True, allow_null=True)
    last_routine_date = serializers.CharField(allow_blank=True, allow_null=True)
    next_due_date = serializers.CharField(allow_blank=True, allow_null=True)
    last_routine_running_hours = serializers.CharField(
        allow_blank=True,
        allow_null=True,
    )
    next_due_running_hours = serializers.CharField(
        allow_blank=True,
        allow_null=True,
    )
    total_running_hours = serializers.CharField(allow_blank=True, allow_null=True)
    running_hours_updated_till = serializers.CharField(
        allow_blank=True,
        allow_null=True,
    )
    running_hours_available = serializers.CharField(
        allow_blank=True,
        allow_null=True,
    )
    total_routines = serializers.IntegerField()
    dyd_routines = serializers.IntegerField()
    remarks = serializers.CharField(allow_blank=True, allow_null=True)


class FrontendPlannedRoutineSearchResponseSerializer(serializers.Serializer):
    filters = FrontendRoutinePlanFiltersSerializer()
    items = FrontendPlannedRoutineItemSerializer(many=True)


class FrontendPlannedRoutineDetailItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    routine_name = serializers.CharField(allow_blank=True, allow_null=True)
    equipment_name = serializers.CharField(allow_blank=True, allow_null=True)
    maintop_no = serializers.CharField(allow_blank=True, allow_null=True)
    dart_number = serializers.CharField(allow_blank=True, allow_null=True)
    routine_description = serializers.CharField(allow_blank=True, allow_null=True)
    routine_no = serializers.CharField(allow_blank=True, allow_null=True)
    planned_commencement_date = serializers.CharField(allow_blank=True, allow_null=True)
    rhsi = serializers.CharField(allow_blank=True, allow_null=True)
    rhsi_updated_until = serializers.CharField(allow_blank=True, allow_null=True)
    previous_routine_completed_date = serializers.CharField(
        allow_blank=True,
        allow_null=True,
    )
    due_date = serializers.CharField(allow_blank=True, allow_null=True)
    due_at_rh = serializers.CharField(allow_blank=True, allow_null=True)
    previous_completed_at_rh = serializers.CharField(
        allow_blank=True,
        allow_null=True,
    )
    action_by = serializers.CharField(allow_blank=True, allow_null=True)
    spare_req = serializers.CharField(allow_blank=True, allow_null=True)
    category_data = serializers.CharField(allow_blank=True, allow_null=True)


class FrontendPlannedRoutineDetailResponseSerializer(serializers.Serializer):
    routine = FrontendRoutinePlanDetailSummarySerializer()
    items = FrontendPlannedRoutineDetailItemSerializer(many=True)


class FrontendFussRaisedItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    department = serializers.CharField(allow_blank=True, allow_null=True)
    equipment = serializers.CharField(allow_blank=True, allow_null=True)
    routine_name = serializers.CharField(allow_blank=True, allow_null=True)
    status = serializers.CharField()
    maintop_no = serializers.CharField(allow_blank=True, allow_null=True)
    routines_by_dyd = serializers.IntegerField()
    routines_by_ss = serializers.IntegerField()
    total_routines = serializers.IntegerField()
    routines_due = serializers.IntegerField()
    due_date = serializers.CharField(allow_blank=True, allow_null=True)


class FrontendFussRaisedFiltersSerializer(serializers.Serializer):
    departments = serializers.ListField(child=serializers.CharField(), default=list)
    equipments = serializers.ListField(child=serializers.CharField(), default=list)
    routine_types = serializers.ListField(child=serializers.CharField(), default=list)
    dept_equipment_map = serializers.DictField(
        child=serializers.ListField(child=serializers.CharField()),
        default=dict,
    )


class FrontendFussRaisedSearchResponseSerializer(serializers.Serializer):
    filters = FrontendFussRaisedFiltersSerializer()
    items = FrontendFussRaisedItemSerializer(many=True)


class FrontendFussRaisedDetailItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    ship = serializers.CharField(allow_blank=True, allow_null=True)
    department = serializers.CharField(allow_blank=True, allow_null=True)
    serial_no = serializers.CharField(allow_blank=True, allow_null=True)
    fuss_date = serializers.CharField(allow_blank=True, allow_null=True)
    due_date = serializers.CharField(allow_blank=True, allow_null=True)
    equipment = serializers.CharField(allow_blank=True, allow_null=True)
    maintop_no = serializers.CharField(allow_blank=True, allow_null=True)
    frequency = serializers.CharField(allow_blank=True, allow_null=True)
    routine_id = serializers.IntegerField(allow_null=True)
    routine_no = serializers.CharField(allow_blank=True, allow_null=True)
    routine_name = serializers.CharField(allow_blank=True, allow_null=True)


class FrontendFussRaisedDetailResponseSerializer(serializers.Serializer):
    filters = FrontendFussRaisedFiltersSerializer()
    items = FrontendFussRaisedDetailItemSerializer(many=True)


class AddRoutineDetailsRequestSerializer(serializers.Serializer):
    routine_name = serializers.IntegerField()
    equipment_name = serializers.IntegerField()
    last_routine_commencement_date = serializers.DateTimeField(
        required=False, allow_null=True
    )
    last_routine_completion_date = serializers.DateTimeField(
        required=False, allow_null=True
    )
    last_routine_completion_atrunning_hrs = serializers.FloatField(
        required=False, allow_null=True
    )
    remarks = serializers.CharField(required=False, allow_blank=True, default="")


class AddRoutineDescriptionRequestSerializer(serializers.Serializer):
    equipment_name = serializers.IntegerField()
    routine_name = serializers.IntegerField()
    routine_description = serializers.CharField()
    by_whom = serializers.CharField(required=False, allow_blank=True, default="")
    maintop_no = serializers.CharField(required=False, allow_blank=True, default="")
    routine_no = serializers.CharField(required=False, allow_blank=True, default="")


class EditRoutineNameRequestSerializer(serializers.Serializer):
    routine_name = serializers.IntegerField()
    equipment_name = serializers.IntegerField()
    new_name = serializers.CharField()
    routine_category = serializers.CharField()
    frequency_in_months = serializers.IntegerField(required=False, allow_null=True)
    frequency_in_hours = serializers.IntegerField(required=False, allow_null=True)


class EditEquipmentNameRequestSerializer(serializers.Serializer):
    equipment_name = serializers.IntegerField()
    new_name = serializers.CharField()


class CreateRoutineFrequencyRequestSerializer(serializers.Serializer):
    equipment_name = serializers.IntegerField()
    routine_category = serializers.CharField()
    routine_name = serializers.CharField()
    frequency_in_months = serializers.IntegerField(required=False, allow_null=True)
    frequency_in_hours = serializers.IntegerField(required=False, allow_null=True)


class CreateEquipmentNameRequestSerializer(serializers.Serializer):
    name = serializers.CharField()
    section = serializers.IntegerField()


class CalculateGtSlipRequestSerializer(serializers.Serializer):
    gt_name = serializers.IntegerField()
    recorded_lpc = serializers.FloatField()
    recorded_air_pr_after_hpc = serializers.FloatField()
    recorded_amb_pr_gtinlet = serializers.FloatField()
    recorded_ext_temp = serializers.FloatField()
    at_hpc_rpm = serializers.FloatField()
    current_amb_temp = serializers.FloatField()


class CalculateGtgSlipRequestSerializer(serializers.Serializer):
    gt_name = serializers.IntegerField()
    recorded_el_load = serializers.FloatField()
    recorded_ext_temp_gtg = serializers.FloatField()
    recorded_amb_temp = serializers.FloatField()


class SaveSlipLimitRequestSerializer(serializers.Serializer):
    gt_name = serializers.IntegerField()
    delta_n_lpc = serializers.FloatField(required=False, allow_null=True)
    delta_t_ext = serializers.FloatField(required=False, allow_null=True)
    delta_p_air = serializers.FloatField(required=False, allow_null=True)


class SaveOemDataPointRequestSerializer(serializers.Serializer):
    gt_name = serializers.IntegerField()
    dataset = serializers.ChoiceField(
        choices=["lpc", "air", "ext", "ext_gtg"],
    )
    hpc_rpm = serializers.FloatField(required=False, allow_null=True)
    lpc_rpm = serializers.FloatField(required=False, allow_null=True)
    air_pr_hpc = serializers.FloatField(required=False, allow_null=True)
    ext_temp = serializers.FloatField(required=False, allow_null=True)
    el_load = serializers.FloatField(required=False, allow_null=True)
    amb_temp = serializers.FloatField(required=False, allow_null=True)
    amb_pressure = serializers.FloatField(required=False, allow_null=True)


class GenerateDL1RequestSerializer(serializers.Serializer):
    pk_list = serializers.ListField(
        child=serializers.IntegerField(),
        required=True,
        allow_empty=False,
    )


class RoutineDescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoutineDescription
        fields = "__all__"


class RefitMaintenancePeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = RefitMaintenancePeriod
        fields = "__all__"
