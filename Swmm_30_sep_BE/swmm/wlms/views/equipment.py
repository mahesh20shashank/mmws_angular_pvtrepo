"""WLMS equipment/spare catalogue viewsets: `WLMSEquipmentViewSet`, `WLMSSpareViewSet`,
`SpareDataMapViewSet`, `PlannedSparesDescriptionViewSet`, `PlannedWEDSpareListViewSet`,
`DartWedSpareViewSet`.

Split out of the former flat `wlms/views.py` (the wlms file-structure split, mirroring
the earlier `obs/views/` package split).
"""

from django.db.models import Q, Sum
from drf_spectacular.utils import OpenApiExample, extend_schema_view, extend_schema
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.models import AUTH_SOURCE_HRCDF, CustomUserProfile

from .. import models, serializers
from ..utils import parse_pts_survey_cart_name, tagged_viewset
from .base import WLMSModelViewSet, _department_scoped, _scoped_equipment_class_ids


@tagged_viewset("WLMS")
class WLMSEquipmentViewSet(WLMSModelViewSet):
    queryset = models.WLMSEquipment.objects.all()
    serializer_class = serializers.WLMSEquipmentSerializer

    @action(detail=False, methods=["get"], url_path="insma-equipment")
    def insma_equipment(self, request):
        from sfd.models import ShipEquipment

        equipment = (
            ShipEquipment.objects.filter(status__iexact="active")
            .exclude(nomenclature__isnull=True)
            .values("id", "nomenclature")
            .distinct()
        )
        return Response(
            [
                {"id": entry["id"], "name": entry["nomenclature"] or "N/A"}
                for entry in equipment
            ]
        )

    @action(detail=False, methods=["get"], url_path="unmapped")
    def unmapped(self, request):
        mapped_ids = models.SpareDataMap.objects.values_list(
            "wed_equipment_id", flat=True
        )
        equipment = self.get_queryset().exclude(id__in=mapped_ids)
        return Response(self.get_serializer(equipment, many=True).data)


@tagged_viewset("WLMS")
class WLMSSpareViewSet(WLMSModelViewSet):
    queryset = models.WLMSSpare.objects.select_related("eqpt")
    serializer_class = serializers.WLMSSpareSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        specific_ids = [
            value.strip()
            for value in self.request.query_params.get("specific_ids", "").split(",")
            if value.strip().isdigit()
        ]
        if specific_ids:
            return queryset.filter(pk__in=specific_ids)

        equipment_id = self.request.query_params.get("equipment_id")
        query = self.request.query_params.get("q")
        active = self.request.query_params.get("active")
        if equipment_id:
            queryset = queryset.filter(eqpt_id=equipment_id)
        if query:
            queryset = queryset.filter(
                Q(item_code__icontains=query)
                | Q(item_desc__icontains=query)
                | Q(eqpt__eqpt_name__icontains=query)
                | Q(category__icontains=query)
            )
        if active is not None:
            # queryset = queryset.filter(is_active=active.lower() in {"1", "true", "yes"})
            queryset = queryset.filter(active=active.lower() in {"1", "true", "yes"})
        return queryset

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        # active_spares = models.WLMSSpare.objects.filter(is_active=True)
        active_spares = models.WLMSSpare.objects.filter(active=True)
        allowed_equipment_class_ids = _scoped_equipment_class_ids(request)

        def dept_scoped(queryset):
            queryset = queryset.filter(
                Q(wed_routine_plan__isnull=False)
                | Q(wed_dart__isnull=False)
                | Q(obs_spare_id__equipment_class_id__in=allowed_equipment_class_ids)
            )
            return _department_scoped(queryset, request)

        synced_pts_ids = {
            pts_id
            for pts_id in (
                parse_pts_survey_cart_name(name)
                for name in models.SurveyReceiptsDetails.objects.filter(
                    is_sync=True,
                    is_approval=True,
                ).values_list("spare_cart_name", flat=True)
            )
            if pts_id is not None
        }
        survey_pending_count = (
            models.PTSDemandDetails.objects.filter(is_save=False)
            .exclude(pk__in=synced_pts_ids)
            .count()
        )

        return Response(
            {
                # "equipment": models.WLMSEquipment.objects.filter(
                #     is_active=True
                # ).count(),
                "equipment": models.WLMSEquipment.objects.filter(
                    active=True
                ).count(),
                "active_spares": active_spares.count(),
                "available_quantity": (
                    active_spares.aggregate(total=Sum("latest_qty"))["total"] or 0
                ),
                "pending_surveys": dept_scoped(
                    models.SurveyReceiptsDetails.objects.filter(is_survey=False)
                ).count(),
                "pending_pts": dept_scoped(
                    models.PTSDemandDetails.objects.filter(is_pts=False)
                ).count(),
                "pending_demands": dept_scoped(
                    models.DemandDetails.objects.filter(
                        is_demand=False,
                        is_delete=False,
                    )
                ).count(),
                "pending_iif": models.WEDIIF.objects.filter(
                    is_sync=False,
                    is_delete=False,
                ).count(),
                "outstanding_demand_count": (
                    models.ReceiveDemandDetails.objects.filter(
                        demand_status__icontains="Outstanding"
                    ).count()
                ),
                "survey_pending_count": survey_pending_count,
                # Developed with Understanding: HRCDF-synced rows with no credentials are
                # crew, not pending registrations (D3, OQ13).
                "count": CustomUserProfile.objects.filter(is_role=False)
                .exclude(auth_source=AUTH_SOURCE_HRCDF, has_credentials=False)
                .count(),
            }
        )

    @action(detail=False, methods=["get"], url_path="equipment-list")
    def equipment_list(self, request):
        queryset = models.WLMSEquipment.objects.all()
        if request.query_params.get("active") is not None:
            # queryset = queryset.filter(
            #     is_active=request.query_params["active"].lower() in {"1", "true", "yes"}
            # )
            queryset = queryset.filter(
                active=request.query_params["active"].lower() in {"1", "true", "yes"}
            )
        return Response(serializers.WLMSEquipmentSerializer(queryset, many=True).data)

    @action(detail=False, methods=["get"], url_path="by-equipment")
    def by_equipment(self, request):
        equipment_id = request.query_params.get("equipment_id")
        if not equipment_id:
            raise ValidationError({"equipment_id": "This query parameter is required."})
        queryset = self.get_queryset().filter(eqpt_id=equipment_id)
        item_desc = request.query_params.get("item_desc")
        part_no = request.query_params.get("part_no")
        if item_desc:
            queryset = queryset.filter(item_desc__icontains=item_desc)
        if part_no:
            queryset = queryset.filter(item_code=part_no)
        page = self.paginate_queryset(queryset)
        if page is not None:
            return self.get_paginated_response(
                self.get_serializer(page, many=True).data
            )
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=["get"], url_path="equipment-for-spares")
    def equipment_for_spares(self, request):
        spare_ids = request.query_params.getlist("spare_ids")
        if not spare_ids:
            raise ValidationError({"spare_ids": "This query parameter is required."})

        spares = self.get_queryset().filter(pk__in=spare_ids)
        equipment_data = {}
        for spare in spares:
            equipment_data[str(spare.pk)] = {"equipment_id": "", "equipment_code": ""}
            if not spare.eqpt_id:
                continue
            mapping = (
                models.SpareDataMap.objects.filter(
                    wed_equipment=spare.eqpt,
                    equipment__isnull=False,
                )
                .select_related("equipment")
                .first()
            )
            if mapping and mapping.equipment:
                equipment_data[str(spare.pk)] = {
                    "equipment_id": str(mapping.equipment_id),
                    "equipment_code": mapping.equipment.equipment_code or "",
                }
        return Response({"equipment_data": equipment_data})

    @action(detail=True, methods=["get"])
    def context(self, request, pk=None):
        spare = self.get_object()
        equipment_mappings = models.SpareDataMap.objects.filter(
            wed_equipment=spare.eqpt
        ).select_related("equipment", "wed_equipment")
        surveys = models.SurveyReceiptsDetails.objects.filter(wed_spares_id=spare)
        pts_entries = models.PTSDemandDetails.objects.filter(wed_spares_id=spare)
        demands = models.DemandDetails.objects.filter(wed_spares_id=spare)
        receipts = models.ReceiveDemandDetails.objects.filter(
            demand_details__wed_spares_id=spare
        )
        return Response(
            {
                "spare": self.get_serializer(spare).data,
                "equipment_mappings": serializers.SpareDataMapSerializer(
                    equipment_mappings,
                    many=True,
                ).data,
                "surveys": serializers.SurveyReceiptsDetailsSerializer(
                    surveys,
                    many=True,
                ).data,
                "pts": serializers.PTSDemandDetailsSerializer(
                    pts_entries,
                    many=True,
                ).data,
                "demands": serializers.DemandDetailsSerializer(
                    demands,
                    many=True,
                ).data,
                "receipts": serializers.ReceiveDemandDetailsSerializer(
                    receipts,
                    many=True,
                ).data,
            }
        )

    def context_from_query(self, request):
        spare_id = (
            request.query_params.get("spare_id")
            or request.query_params.get("spare")
            or request.query_params.get("pk")
            or request.query_params.get("id")
        )
        if not spare_id:
            raise ValidationError({"spare_id": "This query parameter is required."})
        self.kwargs[self.lookup_url_kwarg or self.lookup_field] = spare_id
        return self.context(request, pk=spare_id)

    @action(detail=True, methods=["get"], url_path="routine-context")
    def routine_context(self, request, pk=None):
        spare = self.get_object()
        mapping = (
            models.SpareDataMap.objects.filter(
                wed_equipment=spare.eqpt,
                equipment__isnull=False,
            )
            .select_related("equipment")
            .first()
        )
        planned = models.PlannedSparesDescription.objects.filter(
            wlms_spare_id=spare,
            is_deleted=False,
        ).first()
        return Response(
            {
                "mapped": mapping is not None,
                "ship_equipment_id": (mapping.equipment_id if mapping else None),
                "routine_description_id": (
                    planned.routine_description_id_id if planned else None
                ),
            }
        )


@tagged_viewset("WLMS")
class SpareDataMapViewSet(WLMSModelViewSet):
    queryset = models.SpareDataMap.objects.select_related(
        "equipment",
        "wed_equipment",
    ).all()
    serializer_class = serializers.SpareDataMapSerializer

    @action(detail=False, methods=["get"], url_path="sfd-equipment-for-wed")
    def sfd_equipment_for_wed(self, request):
        wed_equipment_ids = [
            value.strip()
            for value in request.query_params.get("wed_equipment_ids", "").split(",")
            if value.strip().isdigit()
        ]
        single = request.query_params.get("wed_equipment")
        if single:
            wed_equipment_ids.append(single)
        if not wed_equipment_ids:
            raise ValidationError(
                {"wed_equipment_ids": "This query parameter is required."}
            )

        mappings = self.get_queryset().filter(
            wed_equipment_id__in=wed_equipment_ids,
            equipment__isnull=False,
        )
        result = {}
        for mapping in mappings:
            if mapping.equipment_id and mapping.equipment.equipment_code:
                result[str(mapping.wed_equipment_id)] = {
                    "sfd_equipment_id": mapping.equipment_id,
                    "sfd_equipment_code": mapping.equipment.equipment_code,
                }
        return Response({"data": result})

    @action(detail=False, methods=["get"], url_path="obs-spare-class")
    def obs_spare_class(self, request):
        from obs.models import SpareClass
        from sfd.models import ShipEquipment

        equipment_id = request.query_params.get("equipment_id")
        queryset = SpareClass.objects.select_related("department").distinct("name")
        if equipment_id:
            ship_equipment = ShipEquipment.objects.filter(pk=equipment_id).first()
            if ship_equipment and ship_equipment.department_id:
                queryset = queryset.filter(department_id=ship_equipment.department_id)
        return Response([{"id": entry.id, "name": entry.name} for entry in queryset])


@tagged_viewset("WLMS")
class PlannedSparesDescriptionViewSet(WLMSModelViewSet):
    queryset = models.PlannedSparesDescription.objects.select_related(
        "wlms_spare_id",
    ).all()
    serializer_class = serializers.PlannedSparesDescriptionSerializer


@tagged_viewset("WLMS")
class PlannedWEDSpareListViewSet(WLMSModelViewSet):
    queryset = models.PlannedWEDSpareList.objects.select_related(
        "planned_spares_description__wlms_spare_id",
    )
    serializer_class = serializers.PlannedWEDSpareListSerializer

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
        url_path="check-routine-mapping",
    )
    def check_routine_mapping(self, request):
        from ems.models import RoutineDescription

        spare_ids = request.query_params.getlist("spare_ids")
        if not spare_ids:
            raise ValidationError({"spare_ids": "At least one spare id is required."})

        unmapped = []
        spares = {}
        for spare_id in spare_ids:
            spare = (
                models.WLMSSpare.objects.select_related("eqpt")
                .filter(pk=spare_id)
                .first()
            )
            if not spare:
                unmapped.append(f"Spare ID {spare_id}")
                continue
            spares[spare_id] = spare
            is_mapped = models.SpareDataMap.objects.filter(
                wed_equipment=spare.eqpt
            ).exists()
            if not is_mapped:
                unmapped.append(
                    spare.eqpt.eqpt_name if spare.eqpt else f"Spare ID {spare_id}"
                )

        if unmapped:
            return Response(
                {
                    "status": "error",
                    "message": (
                        f"Equipment not mapped: {', '.join(unmapped)}. "
                        "Please go to Master and map it first."
                    ),
                }
            )

        first_spare = spares[spare_ids[0]]
        mapping = models.SpareDataMap.objects.filter(
            wed_equipment=first_spare.eqpt
        ).first()
        planned = models.PlannedSparesDescription.objects.filter(
            wlms_spare_id__eqpt=first_spare.eqpt
        ).first()

        target_id = None
        if planned and planned.routine_description_id_id:
            target_id = planned.routine_description_id_id
        elif mapping and mapping.equipment_id:
            routine = (
                RoutineDescription.objects.filter(
                    equipment_name__sfd_equipment__id=mapping.equipment_id
                )
                .values("id")
                .first()
            )
            if routine:
                target_id = routine["id"]

        if target_id:
            return Response(
                {
                    "status": "success",
                    "routine_description_id": target_id,
                    "spare_ids": spare_ids,
                }
            )
        return Response({"status": "error", "message": "No mapping found."})


@extend_schema_view(
    list=extend_schema(
        examples=[
            OpenApiExample(
                "DART WED spare response",
                value=[
                    {
                        "id": 1,
                        "equipment_id": 501,
                        "dart_id": 1001,
                        "pattern": "WED-PN-1001",
                        "description": "Launcher interface module for DART",
                        "quantity": 1,
                        "created_date": "2026-06-02",
                        "modified_date": "2026-06-02",
                        "is_delete": False,
                        "issue_obj": 1,
                        "wed_spare": 1,
                    }
                ],
                response_only=True,
            )
        ]
    ),
    create=extend_schema(
        examples=[
            OpenApiExample(
                "Create DART WED spare",
                value={
                    "equipment_id": 501,
                    "dart_id": 1001,
                    "pattern": "WED-PN-1001",
                    "description": "Launcher interface module for DART",
                    "quantity": 1,
                    "is_delete": False,
                    "issue_obj": 1,
                    "wed_spare": 1,
                },
                request_only=True,
            )
        ]
    ),
)
@tagged_viewset("WLMS")
class DartWedSpareViewSet(WLMSModelViewSet):
    queryset = models.DartWedSpare.objects.select_related(
        "dart_id",
        "equipment_id",
        "issue_obj",
        "wed_spare",
    ).all()
    serializer_class = serializers.DartWedSpareSerializer

    @action(detail=False, methods=["post"], url_path="bulk-create-from-obs")
    def bulk_create_from_obs(self, request):
        """Creates one `DartWedSpare` cart row per OBS requisition row forwarded from
        Requisitions ("Send to Cart (MO/WED)"). `wed_spare` is resolved by `pattern_number` the
        same way `obs.SparesViewSet.verify_pattern` already cross-checks a pattern number against
        ILMS/WLMS — if nothing matches, the row is still created (`pattern`/`description` carry
        the OBS-side data) so WED staff can link it to a catalog item manually, rather than
        silently dropping requisitions WLMS doesn't recognise yet."""
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

            wed_spare = (
                models.WLMSSpare.objects.filter(
                    item_code__iexact=pattern_number
                ).first()
                if pattern_number
                else None
            )
            row = models.DartWedSpare.objects.create(
                pattern=pattern_number,
                description=description,
                quantity=quantity,
                wed_spare=wed_spare,
            )
            created.append(
                {
                    "id": row.id,
                    "pattern_number": pattern_number,
                    "matched": wed_spare is not None,
                }
            )

        return Response({"created": created})
