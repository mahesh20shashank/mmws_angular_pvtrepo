"""MO planning/DART-cart viewsets: `MOPlannedSparesDescriptionViewSet`,
`PlannedMOSpareListViewSet` (routine/department lookups feeding the survey/demand
carts) and `DartMOSpareViewSet` (the MO/WED DART cart, including its
bulk-create-from-obs intake action).
"""

from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .. import models, serializers
from ..rbac_scope import filter_by_custom_user_department
from ..utils import tagged_viewset
from .base import ILMSModelViewSet


@tagged_viewset("ILMS")
class MOPlannedSparesDescriptionViewSet(ILMSModelViewSet):
    queryset = models.MOPlannedSparesDescription.objects.select_related(
        "item_id",
        "routine_description_id",
    )
    serializer_class = serializers.MOPlannedSparesDescriptionSerializer


@tagged_viewset("ILMS")
class PlannedMOSpareListViewSet(ILMSModelViewSet):
    queryset = models.PlannedMOSpareList.objects.select_related(
        "planned_spares_description",
    )
    serializer_class = serializers.PlannedMOSpareListSerializer

    @action(detail=False, methods=["get"], url_path="by-routine")
    def by_routine(self, request):
        routine_description = request.query_params.get("routine_description")
        if not routine_description:
            raise ValidationError(
                {"routine_description": "This query parameter is required."}
            )
        queryset = self.get_queryset().filter(
            planned_spares_description__routine_description_id=(routine_description),
            is_deleted=False,
            planned_spares_description__is_deleted=False,
        )
        return Response(self.get_serializer(queryset, many=True).data)

    @action(
        detail=False,
        methods=["get"],
        url_path="routines-by-department",
    )
    def routines_by_department(self, request):
        from ems.models import RoutineDescription

        routines = filter_by_custom_user_department(
            RoutineDescription.objects.exclude(dart_number__isnull=True).exclude(
                dart_number=""
            ),
            request,
            field="department_f_key_id",
        ).values(
            "id",
            "dart_number",
            "routine_description",
            "maintop_no",
            "equipment_name__name",
            "equipment_name__nomenclature",
            "equipment_name__extra",
        )
        return Response({"success": True, "routines": list(routines)})


@tagged_viewset("ILMS")
class DartMOSpareViewSet(ILMSModelViewSet):
    queryset = models.DartMOSpare.objects.select_related(
        "issue_obj",
        "equipment_id",
        "dart_id",
        "mo_spare",
    )
    serializer_class = serializers.DartMOSpareSerializer

    @action(detail=False, methods=["post"], url_path="bulk-create-from-obs")
    def bulk_create_from_obs(self, request):
        """Creates one `DartMOSpare` cart row per OBS requisition row forwarded from
        Requisitions ("Send to Cart (MO/WED)"). `mo_spare` is resolved by `pattern_number` the
        same way `SparesViewSet.verify_pattern` already cross-checks a pattern number against
        ILMS/WLMS — if nothing matches, the row is still created (`pattern`/`description` carry
        the OBS-side data) so MO staff can link it to a catalog item manually, rather than
        silently dropping requisitions ILMS doesn't recognise yet."""
        items = request.data.get("items")
        if not isinstance(items, list) or not items:
            return Response({"error": "No items provided."}, status=400)

        created = []
        for entry in items:
            if not isinstance(entry, dict):
                continue
            pattern_number = str(entry.get("pattern_number") or "").strip()
            description = str(entry.get("description") or "").strip()
            try:
                quantity = max(1, int(entry.get("quantity") or 1))
            except (TypeError, ValueError):
                quantity = 1

            mo_spare = (
                models.Item.objects.filter(item_code__iexact=pattern_number).first()
                if pattern_number
                else None
            )
            row = models.DartMOSpare.objects.create(
                pattern=pattern_number,
                description=description,
                quantity=quantity,
                mo_spare=mo_spare,
            )
            created.append(
                {
                    "id": row.id,
                    "pattern_number": pattern_number,
                    "matched": mo_spare is not None,
                }
            )

        return Response({"created": created})
