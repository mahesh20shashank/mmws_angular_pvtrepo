import ast
import json

from rest_framework import serializers

from master.models import (
    ChMasterShipRemarksBy,
    ChMasterSymptoms,
    Manufacturer,
    MSeverity,
    Section,
    Supplier,
)
from master.models import EquipmentType as MasterEquipmentType
from sfd.models import CompartmentMaster, EquipmentType, ShipEquipment, TrialUnit

from ..models import (
    AS_AND_AS_TYPE_CHOICES,
    CATEGORY_CHOICES,
    DARTTriggerMaster,
    DEFECT_TYPE_CHOICES,
    STATUS_CHOICES,
)
from .models import (
    DECK_NO_CHOICES,
    DefectDartSpare,
    DefectEquipmentStatusMaster,
    DefectInitiateDart,
    INVENTORY_TYPE_CHOICES,
    NATURE_OF_AS_AND_AS_CHOICES,
)


class ShipEquipmentSimpleSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nomenclature = serializers.CharField()


class GetEquipmentObjectsResponseSerializer(serializers.Serializer):
    ship_equipments = ShipEquipmentSimpleSerializer(many=True)


class CompartmentDetailSerializer(serializers.ModelSerializer):
    deck_no = serializers.SerializerMethodField()
    frame_station = serializers.SerializerMethodField()

    class Meta:
        model = CompartmentMaster
        fields = [
            "id",
            "name",
            "deck_no",
            "frame_station",
            "location",
        ]

    def get_deck_no(self, obj):
        # main_deck/upper_deck/lower_deck are mutually exclusive in practice -- return
        # whichever one is actually set instead of exposing all three raw columns.
        if obj.main_deck:
            return "Main Deck"
        if obj.upper_deck:
            return obj.get_upper_deck_display()
        if obj.lower_deck:
            return obj.get_lower_deck_display()
        return None

    def get_frame_station(self, obj):
        if obj.frame_station_from is not None and obj.frame_station_to is not None:
            return f"{obj.frame_station_from}-{obj.frame_station_to}"
        if obj.frame_station_from is not None:
            return str(obj.frame_station_from)
        if obj.frame_station_to is not None:
            return str(obj.frame_station_to)
        return None


class EquipmentDropdownSerializer(serializers.ModelSerializer):
   
    compartment = serializers.SerializerMethodField()
    system_id = serializers.SerializerMethodField()
    system_name = serializers.SerializerMethodField()
    equipment_display_label = serializers.SerializerMethodField()

    class Meta:
        model = ShipEquipment
        fields = [
            "id",
            "equipment_code",
            "equipment_name",
            "equipment_model",
            "equipment_serial_no",
            "rhsi_initialised",
            "service_life",
            "nomenclature",
            "oem_part_no",
            "system_id",
            "system_name",
            "compartment",
            "equipment_display_label",
        ]

    def get_equipment_display_label(self, obj):
        parts = [
            obj.equipment_code,
            obj.equipment_name,
            obj.nomenclature,
            obj.equipment_serial_no,
            obj.service_life,
        ]
        return " | ".join(str(part) for part in parts if part)

    def _get_mapped_system(self, obj):
        # mapped_to holds the id (pk) of the ShipEquipment row that represents the
        # "system" this equipment is mapped to.
        mapped_to = getattr(obj, "mapped_to", None)
        if not mapped_to:
            return None
        if not hasattr(obj, "_mapped_system_cache"):
            obj._mapped_system_cache = ShipEquipment.objects.filter(
                t_equipment_ship_detail=mapped_to
            ).first()
        return obj._mapped_system_cache

    def get_system_id(self, obj):
        return getattr(obj, "mapped_to", None)

    def get_system_name(self, obj):
        system = self._get_mapped_system(obj)
        return system.equipment_name if system else None



    def get_compartment(self, obj):
        # ShipEquipment.compartment is a plain CharField holding the CompartmentMaster id
        # as text (a denormalized reference, not a real FK) -- not the
        # Equipment -> EquipmentCompartmentMapping -> CompartmentMaster path, which is a
        # separate, unrelated mapping at the master-Equipment level.
        raw = getattr(obj, "compartment", None)
        if not raw or not str(raw).isdigit():
            return None
        compartment = CompartmentMaster.objects.filter(id=int(raw)).first()
        return CompartmentDetailSerializer(compartment).data if compartment else None


class GetNomenclatureDetailsResponseSerializer(serializers.Serializer):
    equipment_serial_no = serializers.CharField()
    equipment_id = serializers.IntegerField()
    location_on_board = serializers.CharField()
    department = serializers.CharField()
    sub_department = serializers.CharField()
    prev_dart_no = serializers.CharField()


class SeverityMasterSerializer(serializers.ModelSerializer):
    class Meta:
        model = MSeverity
        fields = [
            "id",
            "severity_id",
            "severity_code",
            "severity_name",
            "isms_severity_code",
        ]


class TrialAgencySerializer(serializers.ModelSerializer):
    class Meta:
        model = TrialUnit
        fields = ["id", "name", "description", "code", "sequence"]


class EquipmentStatusMasterSerializer(serializers.ModelSerializer):
    class Meta:
        model = DefectEquipmentStatusMaster
        fields = ["id", "status", "description", "readiness_impact"]


class EquipmentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentType
        fields = ["id", "Equipment_Type_ID", "Equipment_Desc"]


class ManufacturerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Manufacturer
        fields = ["id", "name", "code"]


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ["id", "name", "code"]


class MasterEquipmentTypeSerializer(serializers.ModelSerializer):
    """master.models.EquipmentType (table Master_equipmenttype) -- a different model
    from sfd.models.EquipmentType (SFD_equipment_type), which already backs
    EquipmentTypeSerializer / GetEquipmentTypeAPIView above."""

    class Meta:
        model = MasterEquipmentType
        fields = ["id", "name", "code"]


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ["id", "name", "code", "department"]


class ShipRemarksBySerializer(serializers.ModelSerializer):
    class Meta:
        model = ChMasterShipRemarksBy
        fields = ["id", "description"]


class SymptomsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChMasterSymptoms
        fields = ["id", "symptom_id", "symptom_code"]


def _parse_spares_string(raw):
    """Best-effort parse of a "spares" form-data value into a list of dicts. Tried in
    order: straight JSON, JSON of just the bracketed [...] substring (covers a caller
    pasting the whole `"spares": [...]` key/value fragment as the field's value instead
    of the bare array), then the same two attempts via ast.literal_eval for
    Python-repr-style quoting (single quotes, True/None)."""
    candidates = [raw]
    if "[" in raw and "]" in raw:
        candidates.append(raw[raw.index("[") : raw.rindex("]") + 1])

    last_exc = None
    for candidate in candidates:
        for loader in (json.loads, ast.literal_eval):
            try:
                parsed = loader(candidate)
            except (TypeError, ValueError, SyntaxError) as exc:
                last_exc = exc
                continue
            if isinstance(parsed, list):
                return parsed
            last_exc = ValueError("parsed value is not a list")

    raise serializers.ValidationError(
        {
            "spares": (
                "Must be a JSON array of spare objects, e.g. "
                '[{"inventory_type": "OBS", "pattern": "...", "quantity": 1}] '
                f"(received: {raw!r}, error: {last_exc})."
            )
        }
    )


class DefectSpareItemSerializer(serializers.Serializer):
    inventory_type = serializers.ChoiceField(choices=INVENTORY_TYPE_CHOICES)
    pattern = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    quantity = serializers.IntegerField(required=False, default=1, min_value=1)
    spare_ref_id = serializers.IntegerField(required=False, allow_null=True)


class BaseDefectSerializer(serializers.Serializer):
    """Fields and cross-field checks common to every defect_type. Concrete defect_type
    serializers (ServiceDefectSerializer, GuaranteeDefectSerializer,
    AsAndAsDefectSerializer, AberDefectSerializer) subclass this and add only the fields
    specific to their own type -- see AddDefectAPIView.DEFECT_TYPE_SERIALIZERS for which
    subclass handles which defect_type."""

    defect_type = serializers.ChoiceField(choices=DEFECT_TYPE_CHOICES, required=True)

    category = serializers.ChoiceField(
        choices=CATEGORY_CHOICES, required=False, allow_null=True
    )
    equipment_ship = serializers.PrimaryKeyRelatedField(
        queryset=ShipEquipment.objects.all(),
        required=False,
        allow_null=True,
        help_text="Equipment name (ShipEquipment id)",
    )
    dart_date = serializers.DateField(required=True, help_text="Date of occurrence")
    status = serializers.ChoiceField(
        choices=STATUS_CHOICES,
        required=False,
        allow_null=True,
        help_text="Defaults to OPEN when not provided",
    )
    equipment_status = serializers.PrimaryKeyRelatedField(
        queryset=DefectEquipmentStatusMaster.objects.all(),
        required=False,
        allow_null=True,
    )
    severity_code = serializers.PrimaryKeyRelatedField(
        queryset=MSeverity.objects.all(), required=False, allow_null=True
    )
    trial_required = serializers.BooleanField(required=False, default=False)
    trial_agency = serializers.PrimaryKeyRelatedField(
        queryset=TrialUnit.objects.all(),
        required=False,
        allow_null=True,
        help_text="Required when trial_required is true",
    )
    defective_discriptions = serializers.CharField(
        required=True, allow_blank=False, help_text="Defect description"
    )
    sapres_required = serializers.BooleanField(
        required=False, default=False, help_text="Spare required"
    )
    spares = DefectSpareItemSerializer(
        many=True,
        required=False,
        help_text="Required when sapres_required is true",
    )
    photograph = serializers.FileField(required=False, allow_null=True)
    is_defect_rectified = serializers.BooleanField(required=False, default=False)
    defect_closed_remark = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text="Required when is_defect_rectified is true",
    )

    def to_internal_value(self, data):
        # multipart/form-data (e.g. when a photograph is attached alongside) can't carry
        # a real nested array -- "spares" then arrives as a single JSON-encoded string
        # instead of a list, which the nested DefectSpareItemSerializer can't parse. Accept
        # that shape too rather than forcing callers into a bracket-notation form field.
        #
        # Also: a QueryDict (multipart/form parsers) makes every field -- not just
        # spares -- resolve through DRF's HTML-list/dict parsing path instead of a plain
        # .get(), so once we rebuild "spares" as a real list we flatten the whole payload
        # to an ordinary dict too, or the nested list field would just re-parse bracket
        # keys off the QueryDict and ignore what we just built.
        spares = data.get("spares") if hasattr(data, "get") else None
        if isinstance(spares, str):
            parsed = _parse_spares_string(spares)
            flat = data.dict() if hasattr(data, "dict") else dict(data)
            flat["spares"] = parsed
            data = flat
        return super().to_internal_value(data)

    def validate(self, attrs):
        if attrs.get("trial_required") and not attrs.get("trial_agency"):
            raise serializers.ValidationError(
                {"trial_agency": "This field is required when trial_required is true."}
            )

        if attrs.get("sapres_required") and not attrs.get("spares"):
            raise serializers.ValidationError(
                {"spares": "At least one spare is required when sapres_required is true."}
            )

        if attrs.get("is_defect_rectified") and not attrs.get("defect_closed_remark"):
            raise serializers.ValidationError(
                {
                    "defect_closed_remark": (
                        "This field is required when is_defect_rectified is true."
                    )
                }
            )

        return attrs


class DefectDefectSerializer(BaseDefectSerializer):
    """defect_type == DEFECT: adds the remark/symptom/component/trigger fields the
    DEFECT branch of AddDefectAPIView._create_defect writes, on top of the common set."""

    ss_remark_code = serializers.PrimaryKeyRelatedField(
        queryset=ChMasterShipRemarksBy.objects.all(), required=False, allow_null=True
    )
    symptom_code = serializers.PrimaryKeyRelatedField(
        queryset=ChMasterSymptoms.objects.all(), required=False, allow_null=True
    )
    defective_component = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    standby_available = serializers.BooleanField(
        required=False, allow_null=True, default=None
    )
    dart_trigger = serializers.PrimaryKeyRelatedField(
        queryset=DARTTriggerMaster.objects.all(), required=False, allow_null=True
    )
    guarantee_hot_work = serializers.BooleanField(
        required=False, allow_null=True, default=None
    )


class ServiceDefectSerializer(BaseDefectSerializer):
    """defect_type == SERVICE: no fields beyond the common set."""


class GuaranteeDefectSerializer(BaseDefectSerializer):
    """defect_type == GUARANTEE: no extra fields yet -- placeholder for future
    guarantee-specific requirements, kept as its own class so they don't get mixed into
    the other types when added."""


class AsAndAsDefectSerializer(BaseDefectSerializer):
    """defect_type == AS_AND_AS: category, equipment, equipment_status, severity, and
    the AS & AS descriptor fields are all mandatory, plus the selected equipment must
    already have a serial number and a location on board recorded."""

    category = serializers.ChoiceField(choices=CATEGORY_CHOICES, required=True)
    equipment_ship = serializers.PrimaryKeyRelatedField(
        queryset=ShipEquipment.objects.all(),
        required=True,
        help_text="Equipment name (ShipEquipment id)",
    )
    equipment_status = serializers.PrimaryKeyRelatedField(
        queryset=DefectEquipmentStatusMaster.objects.all(), required=True
    )
    severity_code = serializers.PrimaryKeyRelatedField(
        queryset=MSeverity.objects.all(), required=True
    )
    as_and_as_type = serializers.ChoiceField(choices=AS_AND_AS_TYPE_CHOICES, required=True)
    nature_of_as_and_as = serializers.ChoiceField(
        choices=NATURE_OF_AS_AND_AS_CHOICES,
        required=True,
        help_text="Nature of AS & AS: Alteration or Addition",
    )
    target_completion_date = serializers.DateField(required=True)
    as_and_as_justification = serializers.CharField(required=True, allow_blank=False)
    sanctioning_authority = serializers.CharField(required=True, allow_blank=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)

        equipment_ship = attrs.get("equipment_ship")
        errors = {}
        if not equipment_ship.equipment_serial_no:
            errors["equipment_ship"] = (
                "Selected equipment has no serial number on record; "
                "required for AS & AS defects."
            )
        if not equipment_ship.location_on_board:
            errors.setdefault(
                "equipment_ship",
                "Selected equipment has no location on board on record; "
                "required for AS & AS defects.",
            )

        if errors:
            raise serializers.ValidationError(errors)

        return attrs


class AberDefectSerializer(BaseDefectSerializer):
    """defect_type == ABER: only valid for category CAT1/CAT2. Equipment
    installation/section/type details are always mandatory; repair_cost, book_value and
    aber_justification are mandatory either way, and raised_with_as_and_as additionally
    unlocks the full AS & AS descriptor set when true."""

    category = serializers.ChoiceField(
        choices=[c for c in CATEGORY_CHOICES if c[0] in ("CAT1", "CAT2")],
        required=True,
        help_text="ABER defects must be raised as CAT1 or CAT2.",
    )
    equipment_ship = serializers.PrimaryKeyRelatedField(
        queryset=ShipEquipment.objects.all(),
        required=True,
        help_text="Equipment name (ShipEquipment id)",
    )
    installation_date = serializers.DateField(required=True)
    authority_for_installation = serializers.CharField(required=True, allow_blank=False)
    qty_fitted = serializers.IntegerField(required=True, min_value=0)
    shelf_life_service_life = serializers.CharField(required=True, allow_blank=False)
    running_hours_as_on_date = serializers.CharField(required=True, allow_blank=False)
    equipment_section = serializers.CharField(required=True, allow_blank=False)
    equipment_type = serializers.PrimaryKeyRelatedField(
        queryset=EquipmentType.objects.all(), required=True
    )
    raised_with_as_and_as = serializers.BooleanField(
        required=True,
        help_text="Is this ABER raised with AS & AS?",
    )

    # Required either way (raised_with_as_and_as true or false)
    repair_cost = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=True
    )
    book_value = serializers.DecimalField(max_digits=12, decimal_places=2, required=True)
    aber_justification = serializers.CharField(required=True, allow_blank=False)

    # Only required when raised_with_as_and_as is true -- kept optional at the field
    # level and enforced in validate() below, since their requiredness depends on that
    # other field's value rather than being fixed for this whole defect_type.
    as_and_as_type = serializers.ChoiceField(
        choices=AS_AND_AS_TYPE_CHOICES, required=False, allow_null=True
    )
    as_and_as_reference_number = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    nature_of_as_and_as = serializers.ChoiceField(
        choices=NATURE_OF_AS_AND_AS_CHOICES, required=False, allow_null=True
    )
    as_and_as_justification = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    linked_as_and_as_justification = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    target_completion_date = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        _require_as_and_as_branch_fields(attrs)
        return attrs


def _require_as_and_as_branch_fields(attrs):
    """Shared by AberDefectSerializer and AberCat3DefectSerializer: once
    raised_with_as_and_as is true, the full AS & AS descriptor set becomes required --
    same rule for CAT1/CAT2 and CAT3, just factored out so it isn't duplicated."""
    if attrs.get("raised_with_as_and_as"):
        required_message = "This field is required for ABER defects raised with AS & AS."
        required_fields = (
            "as_and_as_type",
            "as_and_as_reference_number",
            "nature_of_as_and_as",
            "as_and_as_justification",
            "linked_as_and_as_justification",
            "target_completion_date",
        )
        errors = {
            field: required_message
            for field in required_fields
            if attrs.get(field) in (None, "")
        }
        if errors:
            raise serializers.ValidationError(errors)


class AberCat3DefectSerializer(BaseDefectSerializer):
    """defect_type == ABER, category == CAT3: covers equipment not (yet) in the
    ShipEquipment master, so it's described by free-text name/serial plus its own OEM,
    supplier, deck, frame station and compartment fields instead of picking an existing
    equipment_ship row. raised_with_as_and_as branches exactly like CAT1/CAT2."""

    category = serializers.ChoiceField(
        choices=[c for c in CATEGORY_CHOICES if c[0] == "CAT3"],
        required=True,
    )
    equipment_name_text = serializers.CharField(
        required=True, allow_blank=False, help_text="Equipment name (free text)"
    )
    model_type = serializers.PrimaryKeyRelatedField(
        queryset=MasterEquipmentType.objects.all(),
        required=True,
        help_text="Model (master.EquipmentType id)",
    )
    oem = serializers.PrimaryKeyRelatedField(
        queryset=Manufacturer.objects.all(), required=True, help_text="OEM name"
    )
    supplier_fkey = serializers.PrimaryKeyRelatedField(
        queryset=Supplier.objects.all(), required=True, help_text="Supplier name"
    )
    new_oem_name = serializers.CharField(required=False, allow_blank=True)
    new_oem_supplier = serializers.CharField(required=False, allow_blank=True)
    new_oem_part_no = serializers.CharField(required=False, allow_blank=True)
    equipment_serial_no = serializers.CharField(required=True, allow_blank=False)
    deck_no = serializers.ChoiceField(choices=DECK_NO_CHOICES, required=True)
    frame_station = serializers.CharField(required=True, allow_blank=False)
    compartment = serializers.PrimaryKeyRelatedField(
        queryset=CompartmentMaster.objects.all(), required=True
    )
    installation_date = serializers.DateField(required=True)
    authority_for_installation = serializers.CharField(required=True, allow_blank=False)
    qty_fitted = serializers.IntegerField(required=True, min_value=0)
    shelf_life_service_life = serializers.CharField(required=True, allow_blank=False)
    running_hours_as_on_date = serializers.CharField(required=True, allow_blank=False)
    equipment_section = serializers.CharField(required=True, allow_blank=False)
    equipment_type = serializers.PrimaryKeyRelatedField(
        queryset=EquipmentType.objects.all(), required=True
    )
    raised_with_as_and_as = serializers.BooleanField(
        required=True, help_text="Is this ABER raised with AS & AS?"
    )

    # Required either way (raised_with_as_and_as true or false)
    repair_cost = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=True
    )
    book_value = serializers.DecimalField(max_digits=12, decimal_places=2, required=True)
    aber_justification = serializers.CharField(required=True, allow_blank=False)

    # Only required when raised_with_as_and_as is true -- see
    # _require_as_and_as_branch_fields.
    as_and_as_type = serializers.ChoiceField(
        choices=AS_AND_AS_TYPE_CHOICES, required=False, allow_null=True
    )
    as_and_as_reference_number = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    nature_of_as_and_as = serializers.ChoiceField(
        choices=NATURE_OF_AS_AND_AS_CHOICES, required=False, allow_null=True
    )
    as_and_as_justification = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    linked_as_and_as_justification = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    target_completion_date = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        _require_as_and_as_branch_fields(attrs)
        return attrs


DEFECT_TYPE_SERIALIZERS = {
    "DEFECT": DefectDefectSerializer,
    "SERVICE": ServiceDefectSerializer,
    "GUARANTEE": GuaranteeDefectSerializer,
    "AS_AND_AS": AsAndAsDefectSerializer,
    "ABER": AberDefectSerializer,
}


class DartSparesItemSerializer(serializers.Serializer):
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
        return {k: v for k, v in ret.items() if k in instance}


class DefectListSerializer(serializers.ModelSerializer):
    """Row shape for GET /list-defects/. Column names match the listing spec: Dart No.,
    Equipment/Services, Reason, Defect Rectified, Status, Date, Severity, plus a handful
    of common fields useful for a grid (category, defect_type, department)."""

    equipment_or_service = serializers.SerializerMethodField()
    reason = serializers.SerializerMethodField()
    defect_rectified = serializers.SerializerMethodField()
    severity = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    category_display = serializers.CharField(source="get_category_display", default=None)

    class Meta:
        model = DefectInitiateDart
        fields = [
            "id",
            "dart_number",
            "equipment_or_service",
            "reason",
            "defect_rectified",
            "status",
            "dart_date",
            "severity",
            "defect_type",
            "category",
            "category_display",
            "department",
            "created_date",
        ]

    def get_equipment_or_service(self, obj):
        # AS_AND_AS/ABER CAT1-2 store the picked ShipEquipment's name here at create
        # time; ABER CAT3 has its own free-text name; SERVICE carries a service_fkey.
        if obj.equipment_nomenclature:
            return obj.equipment_nomenclature
        if obj.equipment_name_text:
            return obj.equipment_name_text
        if obj.service_fkey_id:
            return str(obj.service_fkey)
        return None

    def get_reason(self, obj):
        return obj.get_defect_type_display() if obj.defect_type else None

    def get_defect_rectified(self, obj):
        return bool(obj.rectification_date) or obj.status in ("RECTIFIED", "CLOSED")

    def get_severity(self, obj):
        severity = obj.severity_code
        return severity.severity_name if severity else None

    def get_department(self, obj):
        department = obj.department_id
        return department.name if department else None


class DefectSpareDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = DefectDartSpare
        fields = [
            "id",
            "inventory_type",
            "spare_ref_id",
            "pattern",
            "description",
            "quantity",
        ]


class DefectDetailSerializer(serializers.ModelSerializer):
    """Full detail for GET /defects/<id>/ -- every stored field, with a handful of FKs
    resolved to a readable display value (id + name) instead of a bare id."""

    equipment_ship_name = serializers.SerializerMethodField()
    equipment_status_display = serializers.SerializerMethodField()
    severity = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    equipment_type_display = serializers.SerializerMethodField()
    trial_agency_id = serializers.CharField(
        source="universal_id_trial_required", read_only=True
    )
    category_display = serializers.CharField(source="get_category_display", default=None)
    status_display = serializers.CharField(source="get_status_display", default=None)
    defect_type_display = serializers.CharField(
        source="get_defect_type_display", default=None
    )
    defect_rectified = serializers.SerializerMethodField()
    spares = DefectSpareDetailSerializer(source="dart_spares", many=True, read_only=True)

    class Meta:
        model = DefectInitiateDart
        fields = [
            "id",
            "dart_number",
            "dart_sr_number",
            "defect_type",
            "defect_type_display",
            "category",
            "category_display",
            "status",
            "status_display",
            "dart_date",
            "created_date",
            "defective_discriptions",
            "defect_rectified",
            "rectification_date",
            "department",
            # equipment
            "equipment_ship",
            "equipment_ship_name",
            "equipment_nomenclature",
            "equipment_code",
            "equipment_serial_no",
            "location_on_board",
            "compartment",
            "equipment_status",
            "equipment_status_display",
            # ABER CAT3 free-text equipment
            "equipment_name_text",
            "model_type",
            "oem",
            "supplier_fkey",
            "new_oem_name",
            "new_oem_supplier",
            "new_oem_part_no",
            "deck_no",
            "frame_station",
            "equipment_section",
            "equipment_type",
            "equipment_type_display",
            # severity / trial
            "severity_code",
            "severity",
            "trial_required",
            "trial_agency_id",
            # spares
            "sapres_required",
            "spares",
            # AS & AS
            "as_and_as_type",
            "nature_of_as_and_as",
            "as_and_as_reference_number",
            "as_and_as_justification",
            "linked_as_and_as_justification",
            "target_completion_date",
            "sanctioning_authority",
            # ABER
            "installation_date",
            "authority_for_installation",
            "qty_fitted",
            "shelf_life_service_life",
            "running_hours_as_on_date",
            "raised_with_as_and_as",
            "repair_cost",
            "book_value",
            "aber_justification",
            # attachment
            "photograph",
        ]

    def get_equipment_ship_name(self, obj):
        equipment = obj.equipment_ship
        return str(equipment) if equipment else None

    def get_equipment_status_display(self, obj):
        equipment_status = obj.equipment_status
        return equipment_status.status if equipment_status else None

    def get_severity(self, obj):
        severity = obj.severity_code
        return severity.severity_name if severity else None

    def get_department(self, obj):
        department = obj.department_id
        return department.name if department else None

    def get_equipment_type_display(self, obj):
        equipment_type = obj.equipment_type
        return equipment_type.Equipment_Desc if equipment_type else None

    def get_defect_rectified(self, obj):
        return bool(obj.rectification_date) or obj.status in ("RECTIFIED", "CLOSED")
