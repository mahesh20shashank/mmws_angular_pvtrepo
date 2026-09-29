from drf_spectacular.utils import extend_schema_serializer
from rest_framework import serializers

from op_maintenance.models import InitiateDart
from sfd.models import ShipEquipment

from . import models


class WLMSEquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.WLMSEquipment
        fields = (
            "id",
            "eqpt_id",
            "eqpt_name",
            "remarks",
            # "is_active",
            "active",
            "control_cell_id",
            "sco_id",
            "depot_id",
            "created_by",
            "created_date",
            "updated_by",
            "updated_date",
        )
        read_only_fields = ("created_date", "updated_date")


class WLMSSpareSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.WLMSSpare
        fields = (
            "id",
            "wlms_inventory",
            "item_code",
            "item_desc",
            "category",
            "eqpt",
            "denom_id",
            "sh_name",
            "latest_qty",
            # "is_active",
            "active",
            "typeofspare",
        )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["typeofspare"] = data.get("typeofspare") or "WED"
        return data


class SpareDataMapSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.SpareDataMap
        fields = ("id", "equipment", "wed_equipment", "wed_spares", "created_at")
        read_only_fields = ("created_at",)


class PlannedSparesDescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PlannedSparesDescription
        fields = (
            "id",
            "wlms_spare_id",
            "routine_description_id",
            "spares_required",
            "is_deleted",
        )


class PlannedWEDSpareListSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PlannedWEDSpareList
        fields = (
            "id",
            "pattern_number",
            "planned_spares_description",
            "quantity_required",
            "is_deleted",
        )


class DartWedSpareSerializer(serializers.ModelSerializer):
    equipment_id = serializers.PrimaryKeyRelatedField(
        queryset=ShipEquipment.objects.all(),
        allow_null=True,
        required=False,
    )
    dart_id = serializers.PrimaryKeyRelatedField(
        queryset=InitiateDart.objects.all(),
        allow_null=True,
        required=False,
    )
    quantity = serializers.IntegerField(max_value=9999, min_value=1)

    class Meta:
        model = models.DartWedSpare
        fields = (
            "id",
            "issue_obj",
            "equipment_id",
            "wed_spare",
            "dart_id",
            "pattern",
            "description",
            "quantity",
            "created_date",
            "modified_date",
            "is_delete",
        )
        read_only_fields = ("created_date", "modified_date")


class SurveyReceiptsDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.SurveyReceiptsDetails
        fields = (
            "id",
            "user_id",
            "wed_spares_id",
            "spare_cart_name",
            "obs_spare_id",
            "wed_routine_plan",
            "wed_dart",
            "is_save",
            "is_survey",
            "is_sync",
            "is_hod",
            "is_approval",
            "wlms_status",
            "sync_date",
            "wlms_survey_status",
        )


class SurveyFormsDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.SurveyFormsDetails
        fields = (
            "id",
            "survey_rec_id",
            "rece_qty",
            "held_certificate_type",
            "held_certificate_no",
            "held_certificate_date",
            "held_certificate",
            "survey_no",
            "wlms_survey_no",
            "ss_remarks",
            "created_by",
            "created_date",
            "updated_by",
            "updated_date",
            "scrap_qty",
        )
        read_only_fields = ("created_date", "updated_date")


class SurveyFormsItemsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.SurveyFormsItems
        fields = (
            "id",
            "survey_details_id",
            "wed_spares_id",
            "item_serial_no",
        )


class PTSItemsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PTSItems
        fields = (
            "id",
            "pts_details_id",
            "wed_spares_id",
            "item_serial_no",
        )


class PTSDemandDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PTSDemandDetails
        fields = (
            "id",
            "user_id",
            "wed_spares_id",
            "obs_spare_id",
            "wed_routine_plan",
            "wed_dart",
            "survey_no",
            "PTS_demand_no",
            "demand_no",
            "demand_qty",
            "remarks",
            "is_save",
            "is_pts",
            "is_sync",
            "is_rejected",
            "spare_cart_name",
            "is_hod",
            "is_approval",
            "sync_date",
            "wlms_pts_status",
            "wed_demandno",
        )


@extend_schema_serializer(component_name="WlmsDemandDetails")
class DemandDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.DemandDetails
        fields = (
            "id",
            "user_id",
            "wed_spares_id",
            "obs_spare_id",
            "wed_routine_plan",
            "wed_dart",
            "survey_no",
            "PTS_no",
            "demand_no",
            "demand_qty",
            "remarks",
            "is_save",
            "is_demand",
            "is_sync",
            "sync_date",
            "is_rejected",
            "spare_cart_name",
            "demand_pdf",
            "is_hod",
            "is_approval",
            "is_delete",
            "wlms_demand_status",
            "wed_demandno",
        )


class ReceiveDemandDetailsSerializer(serializers.ModelSerializer):
    demand_details = serializers.PrimaryKeyRelatedField(
        allow_null=True,
        queryset=models.DemandDetails.objects.all(),
        required=False,
    )
    demand_quantity = serializers.IntegerField(
        max_value=999999,
        min_value=0,
        required=False,
    )

    class Meta:
        model = models.ReceiveDemandDetails
        fields = (
            "id",
            "demand_details",
            "pts_details",
            "demand_number",
            "demand_date",
            "demand_quantity",
            "original_demand_qty",
            "demand_status",
            "swmm_demandno",
            "dart_no",
            "created_at",
            "updated_at",
            "gate_pass_no",
            "gate_pass_date",
            "received_qty",
            "received_date",
        )
        read_only_fields = ("created_at", "updated_at")


class WEDIIFSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.WEDIIF
        fields = (
            "id",
            "user_id",
            "spare_id",
            "is_sync",
            "is_hod",
            "is_approval",
            "sync_response",
            "is_delete",
            "sync_date",
            "wlms_iif_status",
            "iif_cart",
        )


class WEDIIFDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.WEDIIFDetails
        fields = (
            "id",
            "wed_iif",
            "iif_no",
            "comly_in_other_eqpt",
            "annual_req",
            "phone_no",
            "Specification",
            "address",
            "Qty_fitted_in_eqpt",
            "iif_photo",
            "proposed_MSL",
            "drawing_no",
            "drawing_doc",
            "poev_costing_rs",
            "bq_amount_rs",
            "bq_doc",
            "ss_remarks",
            "category",
            "denomination",
            "pattern_number",
            "description",
        )


class SignalDemandSerializer(serializers.ModelSerializer):
    requesting_ship = serializers.PrimaryKeyRelatedField(
        queryset=models.SignalDemand._meta.get_field(
            "requesting_ship"
        ).remote_field.model.objects.all(),
        required=False,
    )

    class Meta:
        model = models.SignalDemand
        fields = (
            "id",
            "demand_type",
            "demand_number",
            "dtg",
            "requesting_ship",
            "receiver_ship",
            "equipment",
            "wed_spare",
            "obs_spare",
            "pts_number",
            "demand_quantity",
            "attachment",
            "remarks",
            "status",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "status",
            "created_by",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        demand_type = attrs.get(
            "demand_type",
            getattr(self.instance, "demand_type", None),
        )
        requesting_ship = attrs.get(
            "requesting_ship",
            getattr(self.instance, "requesting_ship", None),
        )
        receiver_ship = attrs.get(
            "receiver_ship",
            getattr(self.instance, "receiver_ship", None),
        )
        wed_spare = attrs.get(
            "wed_spare",
            getattr(self.instance, "wed_spare", None),
        )
        obs_spare = attrs.get(
            "obs_spare",
            getattr(self.instance, "obs_spare", None),
        )
        errors = {}

        if requesting_ship is None:
            errors["requesting_ship"] = "Requesting ship is required."
        if wed_spare is None and obs_spare is None:
            errors["inventory_item"] = (
                "Either a WED spare or an onboard spare is required."
            )
        if demand_type == models.SignalDemand.CANDEM:
            if receiver_ship is None:
                errors["receiver_ship"] = "Receiver ship is required for a CANDEM."
            elif requesting_ship and receiver_ship == requesting_ship:
                errors["receiver_ship"] = (
                    "Receiver ship must differ from requesting ship."
                )
        elif receiver_ship is not None:
            errors["receiver_ship"] = "Receiver ship is only applicable to a CANDEM."

        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class AddToWorkflowCartSerializer(serializers.Serializer):
    SOURCE_CHOICES = (
        ("planned", "Planned WED spare"),
        ("dart", "DART WED spare"),
        ("obs", "Onboard spare"),
    )

    source = serializers.ChoiceField(choices=SOURCE_CHOICES)
    source_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )

    class Meta:
        ref_name = "WLMSAddToWorkflowCart"


class AddToIIFCartSerializer(serializers.Serializer):
    spare_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )
    # Mirrors source's `cart_type` POST field ('survey' | 'pts') — only consulted for a
    # PERMANENT-category spare; every other category always resolves to 'demand' regardless
    # of what the caller sends. See `WEDIIFViewSet.add_items`.
    cart_type = serializers.ChoiceField(
        choices=["survey", "pts"],
        required=False,
    )

    class Meta:
        ref_name = "WLMSAddToIIFCart"


class RaiseIIFSerializer(serializers.Serializer):
    """Request shape for `WEDIIFViewSet.raise_iif` — mirrors source's `wlms_raise_iif`
    POST fields. `spare_id` is either an existing `obs.Spares` pk (as a string) or the
    literal `"other"`, in which case `pattern_number`/`description`/`category` become
    required and `denomination` (a name, looked up case-insensitively) is optional.
    """

    spare_id = serializers.CharField()
    pattern_number = serializers.CharField(required=False, allow_blank=True, default="")
    description = serializers.CharField(required=False, allow_blank=True, default="")
    category = serializers.CharField(required=False, allow_blank=True, default="")
    denomination = serializers.CharField(required=False, allow_blank=True, default="")
    comly_in_other_eqpt = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    annual_req = serializers.CharField(required=False, allow_blank=True, default="")
    phone_no = serializers.CharField(required=False, allow_blank=True, default="")
    Specification = serializers.CharField(required=False, allow_blank=True, default="")
    address = serializers.CharField(required=False, allow_blank=True, default="")
    Qty_fitted_in_eqpt = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    proposed_MSL = serializers.CharField(required=False, allow_blank=True, default="")
    drawing_no = serializers.CharField(required=False, allow_blank=True, default="")
    poev_costing_rs = serializers.CharField(required=False, allow_blank=True, default="")
    bq_amount_rs = serializers.CharField(required=False, allow_blank=True, default="")
    ss_remarks = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        ref_name = "WLMSRaiseIIF"
