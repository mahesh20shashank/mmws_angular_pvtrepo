from django.db.models import FloatField, OuterRef, Subquery
from drf_spectacular.utils import extend_schema, extend_schema_view

from .models import (
    MeasurementFuelsondingFinal,
    TankCategory,
    TankSoundingData,
    TankSoundingMaster,
    TankTypeDetail,
)


def viewset_schema_tags(tag):
    return extend_schema_view(
        list=extend_schema(tags=[tag]),
        retrieve=extend_schema(tags=[tag]),
        create=extend_schema(tags=[tag]),
        update=extend_schema(tags=[tag]),
        partial_update=extend_schema(tags=[tag]),
        destroy=extend_schema(tags=[tag]),
    )


def get_short_form(tank_type):
    words = tank_type.replace("_", " ").split()
    return "".join(word[0].lower() for word in words if word)


def parse_bool(value):
    if value is None:
        return False
    if isinstance(value, bool):
        return value

    try:
        import pandas as pd

        if pd.isna(value):
            return False
    except ImportError:
        pass

    return str(value).strip().upper() in {"1", "TRUE", "YES", "Y"}


def safe_float(value):
    try:
        if value in {None, "...", "-", ""}:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def calculate_volume_weight(mm_value, tank_type=None, tank_name=None):
    queryset = MeasurementFuelsondingFinal.objects.all()
    if tank_type:
        queryset = queryset.filter(tank_type=tank_type)
    if tank_name:
        queryset = queryset.filter(tank_name=tank_name)

    try:
        mm_value = float(mm_value)
    except (TypeError, ValueError):
        return 0, 0, False, None, None

    base_mm = int(mm_value // 100) * 100
    remainder = mm_value - base_mm
    base_row = queryset.filter(mm=base_mm).first()
    if not base_row:
        return 0, 0, False, None, None

    base_volume = float(base_row.volume or 0)
    base_tone = float(base_row.tone or 0)
    if remainder == 0:
        return base_volume, base_tone, False, None, None

    lower_bracket = int(remainder // 10) * 10
    upper_bracket = lower_bracket + 10
    if lower_bracket == 0:
        lower_volume = base_volume
        lower_tone = base_tone
    else:
        lower_value = getattr(base_row, f"field_{lower_bracket}mm", None)
        lower_volume = float(lower_value) if lower_value is not None else base_volume
        lower_tone = float(lower_value) if lower_value is not None else base_tone

    if upper_bracket == 100:
        next_row = queryset.filter(mm=base_mm + 100).first()
        upper_volume = (
            float(next_row.volume or lower_volume) if next_row else lower_volume
        )
        upper_tone = float(next_row.tone or lower_tone) if next_row else lower_tone
    else:
        upper_value = getattr(base_row, f"field_{upper_bracket}mm", None)
        upper_volume = float(upper_value) if upper_value is not None else lower_volume
        upper_tone = float(upper_value) if upper_value is not None else lower_tone

    factor = (remainder - lower_bracket) / 10
    interpolated_volume = lower_volume + factor * (upper_volume - lower_volume)
    interpolated_weight = lower_tone + factor * (upper_tone - lower_tone)
    return (
        round(interpolated_volume, 2),
        round(interpolated_weight, 2),
        True,
        base_mm,
        remainder,
    )


def get_category_data(category_id):
    empty_summary = {
        "category_id": None,
        "category_name": "",
        "count": 0,
        "total_held": 0,
        "total_95": 0,
        "filled_pct": 0,
        "topup_pct": 0,
        "unit": "",
    }
    if not category_id:
        return [], empty_summary

    category = (
        TankCategory.objects.select_related("fluid").filter(id=category_id).first()
    )
    if not category:
        return [], empty_summary

    latest_readings = TankSoundingData.objects.filter(
        tank_category_detail=OuterRef("pk")
    ).order_by("-reading_time")
    master_95_capacity = TankSoundingMaster.objects.filter(
        tank_category_detail=OuterRef("pk"),
        percentage_flag=95,
    ).values("volume")[:1]
    master_100_capacity = TankSoundingMaster.objects.filter(
        tank_category_detail=OuterRef("pk"),
        percentage_flag=100,
    ).values("volume")[:1]

    tanks = TankTypeDetail.objects.filter(tank_id=category_id).select_related("tank")
    annotated_tanks = tanks.annotate(
        last_tonnes=Subquery(latest_readings.values("tonnes")[:1]),
        last_mm=Subquery(latest_readings.values("mm_measurement")[:1]),
        last_time=Subquery(latest_readings.values("reading_time")[:1]),
        master_c95=Subquery(master_95_capacity, output_field=FloatField()),
        master_c100=Subquery(master_100_capacity, output_field=FloatField()),
    )

    result = []
    total_held = 0
    total_95 = 0
    for tank in annotated_tanks:
        held = float(tank.last_tonnes or 0)
        capacity_95 = float(tank.master_c95 or 0)
        capacity_100 = float(tank.master_c100 or 0)
        total_held += held
        total_95 += capacity_95
        result.append(
            {
                "sno": tank.id,
                "n": tank.tank_type or tank.tank.manual_name,
                "c95": capacity_95,
                "c100": capacity_100,
                "T": held,
                "mm": tank.last_mm or 0,
                "d": (tank.last_time.strftime("%d %b %Y") if tank.last_time else None),
                "ti": (tank.last_time.strftime("%H:%M") if tank.last_time else None),
            }
        )

    filled_percentage = total_held / total_95 * 100 if total_95 > 0 else 0
    return result, {
        "category_id": category_id,
        "category_name": category.tank_category or "",
        "unit": category.fluid.measuring_unit if category.fluid else "Units",
        "count": annotated_tanks.count(),
        "total_held": round(total_held, 2),
        "total_95": round(total_95, 2),
        "filled_pct": round(filled_percentage, 1),
        "topup_pct": round(max(100 - filled_percentage, 0), 1),
    }
