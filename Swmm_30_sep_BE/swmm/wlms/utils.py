import re

from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view


def tagged_viewset(tag):
    return extend_schema_view(
        list=extend_schema(tags=[tag]),
        create=extend_schema(tags=[tag]),
        retrieve=extend_schema(tags=[tag]),
        update=extend_schema(tags=[tag]),
        partial_update=extend_schema(tags=[tag]),
        destroy=extend_schema(tags=[tag]),
    )


def generate_sequence_number(model, number_field, prefix, year=None, lock=True):
    """Year-scoped, concurrency-safe document number generator.

    Replaces per-pk numbering (``f"{prefix}/{pk:03d}"``) with a real sequence:
    locks all of this year's rows for the field, parses the highest existing
    suffix, and returns the next one. No dedicated counter table is used —
    the existing formatted-number field is the source of truth.

    Pass ``lock=False`` for a display-only preview (e.g. a GET detail view)
    where taking row locks would be inappropriate; callers that will persist
    the returned number must use the default ``lock=True`` inside an atomic
    block.
    """
    year = year or timezone.now().year
    year_prefix = f"{prefix}/{year}/"
    pattern = re.compile(rf"^{re.escape(year_prefix)}(\d+)$")

    queryset = model.objects.filter(**{f"{number_field}__startswith": year_prefix})
    if lock:
        queryset = queryset.select_for_update()
    existing = queryset.values_list(number_field, flat=True)
    max_seq = 0
    for value in existing:
        match = pattern.match(value or "")
        if match:
            max_seq = max(max_seq, int(match.group(1)))
    return f"{year_prefix}{max_seq + 1:03d}"


def pts_survey_cart_name(pts_id):
    """The unified PTS<->Survey bridge cart-name convention."""
    return f"PTS:{pts_id}"


def parse_pts_survey_cart_name(value):
    """Extract the source PTSDemandDetails id from a bridged cart name, or
    None if ``value`` is not a PTS-bridge cart name.
    """
    if not value:
        return None
    match = re.match(r"^PTS:(\d+)$", value)
    return int(match.group(1)) if match else None


def resolve_cart_qty(entry, qty_field="demand_qty"):
    """Priority-chain quantity resolution shared by Survey/PTS/Demand cart
    entries: bridged-PTS quantity -> model qty field -> WED routine-plan path
    -> WED dart path -> OBS survey/demand path -> default 1.
    """
    from . import models

    pts_id = parse_pts_survey_cart_name(getattr(entry, "spare_cart_name", ""))
    if pts_id:
        pts = models.PTSDemandDetails.objects.filter(pk=pts_id).first()
        if pts and pts.demand_qty:
            try:
                return int(pts.demand_qty)
            except (TypeError, ValueError):
                return pts.demand_qty

    field_value = getattr(entry, qty_field, None) if qty_field else None
    if field_value:
        return field_value

    if getattr(entry, "wed_spares_id_id", None):
        if getattr(entry, "wed_routine_plan_id", None):
            planned_spare = models.PlannedWEDSpareList.objects.filter(
                planned_spares_description=entry.wed_routine_plan
            ).first()
            if planned_spare and planned_spare.quantity_required:
                return planned_spare.quantity_required
        elif getattr(entry, "wed_dart_id", None):
            if entry.wed_dart.quantity:
                return entry.wed_dart.quantity
    elif getattr(entry, "obs_spare_id_id", None):
        from obs.models import Survey as ObsSurvey

        survey_qty = (
            ObsSurvey.objects.filter(spare=entry.obs_spare_id).order_by("-id").first()
        )
        if survey_qty and survey_qty.quantity_tosurvey:
            return survey_qty.quantity_tosurvey

    return 1
