"""
DRF Serializers for Tank Module.
Enforces PEP 8 compliance and standard ModelSerializer patterns.
"""

from rest_framework import serializers

from .models import (
    Fluid,
    FluidInTank,
    FluidType,
    FuellingDetails,
    Hierarchyforchart,
    MeasurementFuelsondingFinal,
    SoundingDraft,
    TankCategory,
    TankFluidUnit,
    TankFuelSounding,
    TankLocation,
    TankOil,
    TankRecord,
    TankSoundingData,
    TankSoundingMaster,
    TankTypeDetail,
)


class TankFluidUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = TankFluidUnit
        fields = "__all__"


class TankTypeDetailSerializer(serializers.ModelSerializer):
    tank_name = serializers.CharField(source="tank.manual_name", read_only=True)
    unit_name = serializers.CharField(source="unit.fluid_unit", read_only=True)

    class Meta:
        model = TankTypeDetail
        fields = "__all__"


class TankSoundingMasterSerializer(serializers.ModelSerializer):
    class Meta:
        model = TankSoundingMaster
        fields = "__all__"


class TankSoundingDataSerializer(serializers.ModelSerializer):
    tank_name = serializers.CharField(
        source="tank_category_detail.tank.manual_name", read_only=True
    )

    class Meta:
        model = TankSoundingData
        fields = "__all__"


class FuelSoundingSerializer(serializers.ModelSerializer):
    class Meta:
        model = MeasurementFuelsondingFinal
        fields = "__all__"


class MeasurementFuelsondingFinalSerializer(serializers.ModelSerializer):
    class Meta:
        model = MeasurementFuelsondingFinal
        fields = "__all__"


class TankCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = TankCategory
        fields = "__all__"


class FluidTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = FluidType
        fields = "__all__"


class FluidSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fluid
        fields = "__all__"


class TankLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TankLocation
        fields = "__all__"


class TankOilSerializer(serializers.ModelSerializer):
    class Meta:
        model = TankOil
        fields = "__all__"


class FuellingDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = FuellingDetails
        fields = "__all__"


class FluidInTankSerializer(serializers.ModelSerializer):
    class Meta:
        model = FluidInTank
        fields = "__all__"


class TankRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = TankRecord
        fields = "__all__"


class SoundingDraftSerializer(serializers.ModelSerializer):
    class Meta:
        model = SoundingDraft
        fields = "__all__"


class TankFuelSoundingSerializer(serializers.ModelSerializer):
    class Meta:
        model = TankFuelSounding
        fields = "__all__"


class HierarchyforchartSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hierarchyforchart
        fields = "__all__"


# ─────────────────────────────────────────────────────────────
# Request serializers for Onboard POL Status workflow endpoints
# ─────────────────────────────────────────────────────────────


class BulkSoundingItemSerializer(serializers.Serializer):
    tank_id = serializers.IntegerField()
    sounding_mm = serializers.FloatField()
    during_ras_ton = serializers.FloatField(required=False, allow_null=True)
    reading_time = serializers.DateTimeField()


class BulkSoundingSaveRequestSerializer(serializers.Serializer):
    data = BulkSoundingItemSerializer(many=True)


class UpdateGraphNoRequestSerializer(serializers.Serializer):
    graph_slot = serializers.ChoiceField(choices=[1, 2, 3, 4])
    new_category_id = serializers.IntegerField()
