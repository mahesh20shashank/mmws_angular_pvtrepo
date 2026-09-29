from rest_framework import serializers

from . import ops_status

from .models import (
    DGUF,
    EEF,
    STP,
    AnnualSRMRRoutineUndertaken,
    AnnualSRMRRoutineUndertakenofGTG,
    AvcatStatus,
    ChMasterFullPowerConductedBy,
    CmmsLubricant,
    DGUFLimits,
    DGUFSeaHarbourRunningHourDataInput,
    DieselReductionGearExploitation,
    EquipmentRoutineDueOn,
    FPTDieselAlternators,
    FPTEquipmentWise,
    FuelConsumptionMonth,
    FullPowerTrialsMainEngine,
    GasTurbineExploitation,
    GasTurbineGeneratorExploitation,
    GasTurbineGeneratorExploitationGufEntry,
    GTGParameters,
    GTGrecordOfCleaningServiceTank,
    H2SSensor,
    Iccp,
    InjectorFIPCalibrationReplacement,
    MagazineFFSystemFloodingSystem,
    OpsStatusofLubOilandCoolantTestKits,
    ReductionGearExploitation,
    ReductionGearExploitationofGTG,
    ReplacementOfMajorAssemblies,
    ReplacementOfMajorAssembliesofGTG,
    RHExtension,
    SafetyDeviceCheckTrial,
    ShipActivityDetail,
    ShipActivityType,
    ShipLocation,
    ShipState,
    SrarAdjustment,
    SrarBoilerAlkalinitySalinityDetail,
    SrarCentrifuge,
    SrarEquipmentExploitation,
    SrarEquipmentTypeList,
    SrarEquipmentValidity,
    SrarLinkedEquipment,
    SrarMonthlyBoiler,
    SrarMonthlyEquipment,
    SrarMonthlyHeader,
    SrarMonthlyLubricant,
    SrarMonthlyShipActivity,
    TorsionMeter,
)


class EquipmentJoinSerializerMixin:
    """
    Overrides eqpt_name/nomenclature/eqpt_code/loc_on_board in the API response with
    values joined from `sfd_details` (sfd.ShipEquipment) when the row is linked to one,
    so these display columns are always sourced from the equipment master rather than
    whatever free text was typed into the row historically.
    """

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        sfd_details = getattr(instance, "sfd_details", None)
        if sfd_details is not None:
            if "eqpt_name" in ret:
                ret["eqpt_name"] = sfd_details.equipment_name or ret.get("eqpt_name")
            if "nomenclature" in ret:
                ret["nomenclature"] = sfd_details.nomenclature or ret.get(
                    "nomenclature"
                )
            if "eqpt_code" in ret:
                ret["eqpt_code"] = sfd_details.equipment_code or ret.get("eqpt_code")
            if "loc_on_board" in ret:
                ret["loc_on_board"] = sfd_details.location_on_board or ret.get(
                    "loc_on_board"
                )
        return ret


class BaseFlexibleSerializer(serializers.ModelSerializer):
    """
    Base serializer mixin that automatically converts empty strings ('') in Date fields,
    Integer fields, Decimal fields, and ForeignKeys into None, avoiding 400 Bad Request errors.
    Also maps common frontend choice strings ('Ops', 'Non-Ops', 'SAT', 'UNSAT', 'Trial Team', 'Ship Staff')
    to model choice integers.
    """

    def to_internal_value(self, data):
        if hasattr(data, "dict"):
            data = data.dict()
        else:
            data = dict(data)

        field_aliases = {
            "max_speed_duration_hr": "max_duration_hr",
            "max_speed_duration_min": "max_duration_min",
            "lastCalibrationDate": "last_calibration_date",
            "validityMonths": "validity_months",
            "nextCalibrationDue": "next_calibration_due",
        }
        for alias, field_name in field_aliases.items():
            if alias in data and field_name not in data:
                data[field_name] = data[alias]

        valid_fields = set(self.fields.keys())
        for field_name in list(data.keys()):
            if field_name not in valid_fields:
                data.pop(field_name)

        choice_mappings = {
            # Keyed on the model's actual field name. It read "ops_non_ops" until
            # 2026-08-27, which matches no field on any SRAR model, so this mapping
            # never fired and every Ops/Non-Ops string was rejected as an invalid
            # choice (or silently dropped along with the mis-named payload key).
            "ops_or_non_ops": {
                "ops": 1,
                "op": 1,
                "non-ops": 2,
                "non ops": 2,
                "non_ops": 2,
                "not held": 3,
                "not-held": 3,
                "1": 1,
                "2": 2,
                "3": 3,
            },
            "status": {
                "sat": 1,
                "unsat": 2,
                "ops": 1,
                "non-ops": 2,
                "satisfactory": 1,
                "unsatisfactory": 2,
                "1": 1,
                "2": 2,
            },
            "effluent_status": {
                "satisfactory": 1,
                "unsatisfactory": 2,
                "sat": 1,
                "unsat": 2,
                "1": 1,
                "2": 2,
            },
        }

        month_map = {
            "january": 1,
            "february": 2,
            "march": 3,
            "april": 4,
            "may": 5,
            "june": 6,
            "july": 7,
            "august": 8,
            "september": 9,
            "october": 10,
            "november": 11,
            "december": 12,
            "jan": 1,
            "feb": 2,
            "mar": 3,
            "apr": 4,
            "jun": 6,
            "jul": 7,
            "aug": 8,
            "sep": 9,
            "oct": 10,
            "nov": 11,
            "dec": 12,
        }
        m_val = data.get("srar_month")
        if isinstance(m_val, str):
            m_clean = m_val.strip().lower()
            if m_clean.isdigit():
                data["srar_month"] = int(m_clean)
            elif m_clean in month_map:
                data["srar_month"] = month_map[m_clean]

        y_val = data.get("srar_year")
        if isinstance(y_val, str) and y_val.strip().isdigit():
            data["srar_year"] = int(y_val.strip())

        for field_name in list(self.fields.keys()):
            if field_name in data:
                val = data[field_name]

                if val == "" or val == "N/A" or val == "null":
                    data[field_name] = None
                    continue

                if field_name in choice_mappings and isinstance(val, str):
                    key = val.strip().lower()
                    if key in choice_mappings[field_name]:
                        data[field_name] = choice_mappings[field_name][key]

        # A row marked Non OPS or Not Held has no reading to give -- see
        # srar.ops_status. Done here rather than per serializer so it holds for every
        # form that has a status, and below the choice mapping so the status is already
        # an int by now.
        #
        # The fields are forced into the payload rather than only blanked when present:
        # a save that flips a row to Not Held has to drop the reading the row already
        # carried, and the screens post only what their inputs hold.
        model = getattr(getattr(self, "Meta", None), "model", None)
        reading_fields = ops_status.reading_fields_for(model) if model else ()
        if reading_fields:
            status = data.get(
                "ops_or_non_ops", getattr(self.instance, "ops_or_non_ops", None)
            )
            if ops_status.is_not_ops(status):
                for field_name in reading_fields:
                    if field_name in self.fields:
                        data[field_name] = None

        return super().to_internal_value(data)


class ShipStateSerializer(BaseFlexibleSerializer):
    class Meta:
        model = ShipState
        fields = "__all__"


class ShipLocationSerializer(BaseFlexibleSerializer):
    class Meta:
        model = ShipLocation
        fields = "__all__"


class ShipActivityTypeSerializer(BaseFlexibleSerializer):
    class Meta:
        model = ShipActivityType
        fields = "__all__"


class ShipActivityDetailSerializer(BaseFlexibleSerializer):
    class Meta:
        model = ShipActivityDetail
        fields = "__all__"


class SrarMonthlyHeaderSerializer(BaseFlexibleSerializer):
    class Meta:
        model = SrarMonthlyHeader
        fields = "__all__"


class SrarMonthlyShipActivitySerializer(BaseFlexibleSerializer):
    def to_internal_value(self, data):
        data = dict(data)

        # Bulk pre-fetch lookup datasets on the first record to maximize speed and ensure cache freshness
        if not hasattr(self, "_state_cache_inst"):
            self._state_cache_inst = {
                s.name.strip().lower(): s.id for s in ShipState.objects.all()
            }
            self._loc_cache_inst = {
                p.name.strip().lower(): p.id for p in ShipLocation.objects.all()
            }
            self._type_cache_inst = {
                t.name.strip().lower(): t.id for t in ShipActivityType.objects.all()
            }
            self._detail_cache_inst = {
                d.name.strip().lower(): d.id for d in ShipActivityDetail.objects.all()
            }

        # Resolve ship_state from name string or ID
        state_val = data.get("ship_state")
        if isinstance(state_val, str):
            state_clean = state_val.strip()
            if state_clean.isdigit():
                data["ship_state"] = int(state_clean)
            else:
                state_obj = ShipState.objects.filter(name__iexact=state_clean).first()
                if state_obj:
                    data["ship_state"] = state_obj.id
                else:
                    data["ship_state"] = None

        # Resolve ship_location/location from name string or ID
        loc_val = data.get("location") or data.get("ship_location")
        if isinstance(loc_val, str):
            loc_clean = loc_val.strip()
            if loc_clean.isdigit():
                data["ship_location"] = int(loc_clean)
            else:
                loc_obj = ShipLocation.objects.filter(name__iexact=loc_clean).first()
                if loc_obj:
                    data["ship_location"] = loc_obj.id
                else:
                    data["ship_location"] = None
        elif loc_val:
            data["ship_location"] = loc_val

        # Resolve ship_activity_type/activity_type from name string or ID
        type_val = data.get("activity_type") or data.get("ship_activity_type")
        if isinstance(type_val, str):
            type_clean = type_val.strip()
            if type_clean.isdigit():
                data["ship_activity_type"] = int(type_clean)
            else:
                type_obj = ShipActivityType.objects.filter(
                    name__iexact=type_clean
                ).first()
                if type_obj:
                    data["ship_activity_type"] = type_obj.id
                else:
                    data["ship_activity_type"] = None
        elif type_val:
            data["ship_activity_type"] = type_val

        # Resolve ship_activity_detail/activity_detail from name string or ID
        detail_val = data.get("activity_detail") or data.get("ship_activity_detail")
        if isinstance(detail_val, str):
            detail_clean = detail_val.strip()
            if not detail_clean:
                data["ship_activity_detail"] = None
            elif detail_clean.isdigit():
                data["ship_activity_detail"] = int(detail_clean)
            else:
                detail_obj = (
                    ShipActivityDetail.objects.filter(name__iexact=detail_clean).first()
                    or ShipActivityDetail.objects.filter(
                        code__iexact=detail_clean
                    ).first()
                )
                if detail_obj:
                    data["ship_activity_detail"] = detail_obj.id
                else:
                    detail_obj, _ = ShipActivityDetail.objects.get_or_create(
                        name=detail_clean, defaults={"code": detail_clean}
                    )
                    data["ship_activity_detail"] = detail_obj.id
        elif detail_val is not None:
            data["ship_activity_detail"] = detail_val

        return super().to_internal_value(data)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if instance.ship_state:
            ret["ship_state"] = instance.ship_state.name
        if instance.ship_location:
            ret["ship_location"] = instance.ship_location.name
        if instance.ship_activity_type:
            ret["ship_activity_type"] = instance.ship_activity_type.name
        if instance.ship_activity_detail:
            ret["ship_activity_detail"] = instance.ship_activity_detail.name
        return ret

    class Meta:
        model = SrarMonthlyShipActivity
        fields = "__all__"


class SrarMonthlyLubricantSerializer(BaseFlexibleSerializer):
    class Meta:
        model = SrarMonthlyLubricant
        fields = "__all__"


class SrarMonthlyBoilerSerializer(BaseFlexibleSerializer):
    class Meta:
        model = SrarMonthlyBoiler
        fields = "__all__"


class SrarBoilerAlkalinitySalinityDetailSerializer(BaseFlexibleSerializer):
    class Meta:
        model = SrarBoilerAlkalinitySalinityDetail
        fields = "__all__"


class SrarMonthlyEquipmentSerializer(BaseFlexibleSerializer):
    class Meta:
        model = SrarMonthlyEquipment
        fields = "__all__"


class SrarEquipmentExploitationSerializer(BaseFlexibleSerializer):
    def to_internal_value(self, data):
        data = dict(data)

        def parse_to_int(val):
            if val is None or val == "":
                return None
            val_str = str(val).strip()
            if ":" in val_str:
                parts = val_str.split(":")
                try:
                    return int(parts[0])
                except (ValueError, TypeError):
                    return 0
            try:
                return int(float(val_str))
            except (ValueError, TypeError):
                return 0

        for field in [
            "rhsi_till_current_month",
            "rhsi_till_prev_month",
            "hrs_for_month",
            "hrs_for_month_hrs",
            "hrs_for_month_min",
        ]:
            if field in data and data[field] is not None:
                data[field] = parse_to_int(data[field])

        return super().to_internal_value(data)

    # SrarEquipmentExploitation stores only the sfd_details FK -- no name columns of
    # its own -- so EquipmentJoinSerializerMixin has nothing to override and a read
    # of this table came back with no way to tell which equipment a row belonged to.
    # These read-only fields join the display values straight off the linked
    # ShipEquipment, the same values that mixin supplies on the other SRAR tables.
    eqpt_name = serializers.SerializerMethodField(read_only=True)
    nomenclature = serializers.SerializerMethodField(read_only=True)
    eqpt_code = serializers.SerializerMethodField(read_only=True)
    loc_on_board = serializers.SerializerMethodField(read_only=True)

    def _equipment_attr(self, obj, attr):
        equipment = getattr(obj, "sfd_details", None)
        return getattr(equipment, attr, None) if equipment is not None else None

    def get_eqpt_name(self, obj):
        return self._equipment_attr(obj, "equipment_name")

    def get_nomenclature(self, obj):
        return self._equipment_attr(obj, "nomenclature")

    def get_eqpt_code(self, obj):
        return self._equipment_attr(obj, "equipment_code")

    def get_loc_on_board(self, obj):
        return self._equipment_attr(obj, "location_on_board")

    class Meta:
        model = SrarEquipmentExploitation
        fields = "__all__"


class SrarLinkedEquipmentSerializer(BaseFlexibleSerializer):
    class Meta:
        model = SrarLinkedEquipment
        fields = "__all__"


class FuelConsumptionMonthSerializer(BaseFlexibleSerializer):
    class Meta:
        model = FuelConsumptionMonth
        fields = "__all__"


class AvcatStatusSerializer(BaseFlexibleSerializer):
    class Meta:
        model = AvcatStatus
        fields = "__all__"


class TorsionMeterSerializer(EquipmentJoinSerializerMixin, BaseFlexibleSerializer):
    class Meta:
        model = TorsionMeter
        fields = "__all__"


class IccpSerializer(BaseFlexibleSerializer):
    class Meta:
        model = Iccp
        fields = "__all__"


class H2SSensorSerializer(BaseFlexibleSerializer):
    class Meta:
        model = H2SSensor
        fields = "__all__"


class STPSerializer(EquipmentJoinSerializerMixin, BaseFlexibleSerializer):
    class Meta:
        model = STP
        fields = "__all__"


class MagazineFFSystemFloodingSystemSerializer(
    EquipmentJoinSerializerMixin, BaseFlexibleSerializer
):
    class Meta:
        model = MagazineFFSystemFloodingSystem
        fields = "__all__"


class OpsStatusofLubOilandCoolantTestKitsSerializer(BaseFlexibleSerializer):
    class Meta:
        model = OpsStatusofLubOilandCoolantTestKits
        fields = "__all__"


class InjectorFIPCalibrationReplacementSerializer(
    EquipmentJoinSerializerMixin, BaseFlexibleSerializer
):
    class Meta:
        model = InjectorFIPCalibrationReplacement
        fields = "__all__"


class DGUFSerializer(BaseFlexibleSerializer):
    class Meta:
        model = DGUF
        fields = "__all__"


class DGUFLimitsSerializer(BaseFlexibleSerializer):
    class Meta:
        model = DGUFLimits
        fields = "__all__"


class DGUFSeaHarbourRunningHourDataInputSerializer(BaseFlexibleSerializer):
    class Meta:
        model = DGUFSeaHarbourRunningHourDataInput
        fields = "__all__"


class SafetyDeviceCheckTrialSerializer(
    EquipmentJoinSerializerMixin, BaseFlexibleSerializer
):
    class Meta:
        model = SafetyDeviceCheckTrial
        fields = "__all__"


class FullPowerTrialsMainEngineSerializer(BaseFlexibleSerializer):
    class Meta:
        model = FullPowerTrialsMainEngine
        fields = "__all__"


class FPTEquipmentWiseSerializer(EquipmentJoinSerializerMixin, BaseFlexibleSerializer):
    class Meta:
        model = FPTEquipmentWise
        fields = "__all__"


class FPTDieselAlternatorsSerializer(
    EquipmentJoinSerializerMixin, BaseFlexibleSerializer
):
    class Meta:
        model = FPTDieselAlternators
        fields = "__all__"


class ReductionGearExploitationSerializer(
    EquipmentJoinSerializerMixin, BaseFlexibleSerializer
):
    class Meta:
        model = ReductionGearExploitation
        fields = "__all__"


class DieselReductionGearExploitationSerializer(
    EquipmentJoinSerializerMixin, BaseFlexibleSerializer
):
    class Meta:
        model = DieselReductionGearExploitation
        fields = "__all__"


class GasTurbineExploitationSerializer(
    EquipmentJoinSerializerMixin, BaseFlexibleSerializer
):
    class Meta:
        model = GasTurbineExploitation
        fields = "__all__"


class ReplacementOfMajorAssembliesSerializer(BaseFlexibleSerializer):
    class Meta:
        model = ReplacementOfMajorAssemblies
        fields = "__all__"


class AnnualSRMRRoutineUndertakenSerializer(BaseFlexibleSerializer):
    class Meta:
        model = AnnualSRMRRoutineUndertaken
        fields = "__all__"


class GasTurbineGeneratorExploitationSerializer(
    EquipmentJoinSerializerMixin, BaseFlexibleSerializer
):
    class Meta:
        model = GasTurbineGeneratorExploitation
        fields = "__all__"


class GasTurbineGeneratorExploitationGufEntrySerializer(BaseFlexibleSerializer):
    class Meta:
        model = GasTurbineGeneratorExploitationGufEntry
        fields = "__all__"


class ReductionGearExploitationofGTGSerializer(
    EquipmentJoinSerializerMixin, BaseFlexibleSerializer
):
    class Meta:
        model = ReductionGearExploitationofGTG
        fields = "__all__"


class ReplacementOfMajorAssembliesofGTGSerializer(BaseFlexibleSerializer):
    class Meta:
        model = ReplacementOfMajorAssembliesofGTG
        fields = "__all__"


class AnnualSRMRRoutineUndertakenofGTGSerializer(BaseFlexibleSerializer):
    class Meta:
        model = AnnualSRMRRoutineUndertakenofGTG
        fields = "__all__"


class GTGParametersSerializer(BaseFlexibleSerializer):
    class Meta:
        model = GTGParameters
        fields = "__all__"


class GTGrecordOfCleaningServiceTankSerializer(BaseFlexibleSerializer):
    class Meta:
        model = GTGrecordOfCleaningServiceTank
        fields = "__all__"


class RHExtensionSerializer(EquipmentJoinSerializerMixin, BaseFlexibleSerializer):
    class Meta:
        model = RHExtension
        fields = "__all__"


class EEFSerializer(BaseFlexibleSerializer):
    def to_internal_value(self, data):
        data = dict(data)
        reason = data.get("reason_for_exceeding")
        if isinstance(reason, str):
            mapping = {
                "operational reason": "1",
                "ehm/machinery trial": "2",
                "prt/pst": "3",
                "within limit / sat": "4",
                "1": "1",
                "2": "2",
                "3": "3",
                "4": "4",
            }
            data["reason_for_exceeding"] = mapping.get(reason.strip().lower(), None)
        return super().to_internal_value(data)

    class Meta:
        model = EEF
        fields = "__all__"


class EquipmentRoutineDueOnSerializer(BaseFlexibleSerializer):
    class Meta:
        model = EquipmentRoutineDueOn
        fields = "__all__"


class SrarAdjustmentSerializer(BaseFlexibleSerializer):
    class Meta:
        model = SrarAdjustment
        fields = "__all__"


class SrarCentrifugeSerializer(EquipmentJoinSerializerMixin, BaseFlexibleSerializer):
    class Meta:
        model = SrarCentrifuge
        fields = "__all__"


class SrarEquipmentTypeListSerializer(BaseFlexibleSerializer):
    def to_internal_value(self, data):
        data = dict(data)
        if "nomenclature" in data and "srar_txt" not in data:
            data["srar_txt"] = data["nomenclature"]
        elif "name" in data and "srar_txt" not in data:
            data["srar_txt"] = data["name"]
        return super().to_internal_value(data)

    class Meta:
        model = SrarEquipmentTypeList
        fields = "__all__"


class ChMasterFullPowerConductedBySerializer(BaseFlexibleSerializer):
    class Meta:
        model = ChMasterFullPowerConductedBy
        fields = "__all__"


class CmmsLubricantSerializer(BaseFlexibleSerializer):
    class Meta:
        model = CmmsLubricant
        fields = "__all__"


class SrarEquipmentValiditySerializer(BaseFlexibleSerializer):
    equipment_name = serializers.CharField(
        source="equipment.nomenclature", read_only=True
    )
    equipmentName = serializers.CharField(
        source="equipment.nomenclature", read_only=True
    )
    source = serializers.CharField(default="General", read_only=True)

    class Meta:
        model = SrarEquipmentValidity
        fields = "__all__"
        extra_kwargs = {"equipment": {"required": False}}


# ─────────────────────────────────────────────────────────────
# CMMS SRAR Integration Serializers
# ─────────────────────────────────────────────────────────────


class SRARMonthlyHeaderCreateSerializer(serializers.Serializer):
    ship_id = serializers.IntegerField(required=False, allow_null=True)
    srar_month = serializers.IntegerField(required=True)
    srar_year = serializers.IntegerField(required=True)
    hours_underway_month_hr = serializers.IntegerField(required=False, allow_null=True)
    hours_underway_month_min = serializers.IntegerField(required=False, allow_null=True)
    distance_run_month = serializers.FloatField(required=False, allow_null=True)
    distance_run_since_commissioning = serializers.FloatField(
        required=False, allow_null=True
    )
    max_speed = serializers.FloatField(required=False, allow_null=True)
    eo_name = serializers.CharField(required=False, allow_null=True, allow_blank=True)


class SrarEquipmentExploitationCreateSerializer(serializers.Serializer):
    sfd_details_id = serializers.IntegerField(required=True)
    hrs_for_month = serializers.IntegerField(required=False, allow_null=True)
    hrs_for_month_min = serializers.IntegerField(required=False, allow_null=True)
    hrs_for_month_hrs = serializers.IntegerField(required=False, allow_null=True)
    rhsi_till_current_month = serializers.IntegerField(required=False, allow_null=True)


class SRARBulkCreateSerializer(serializers.Serializer):
    header = SRARMonthlyHeaderCreateSerializer(required=True)
    exploitations = SrarEquipmentExploitationCreateSerializer(
        many=True, required=False, default=[]
    )


class GenericSuccessResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    message = serializers.CharField()
    data = serializers.JSONField(required=False, default=None, allow_null=True)
