"""`WedInventoryViewSet`: read-only WED-inventory views over `obs` models, matching the
reference ILMS wed_item_search/wed_survey_list/etc. views — a distinct, obs-backed
inventory view separate from the ILMS/MO models.
"""

from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .base import _scoped_equipment_class_ids


@extend_schema(tags=["ILMS"])
class WedInventoryViewSet(viewsets.ViewSet):
    """Read-only WED-inventory views over `obs` models, matching the
    reference ILMS wed_item_search/wed_survey_list/etc. views (these are a
    distinct, obs-backed inventory view separate from the ILMS/MO models).
    """

    @action(detail=False, methods=["get"], url_path="item-search")
    def item_search(self, request):
        from obs.models import Spares
        from obs.serializers import SparesSerializer

        item_code = request.query_params.get("item_code", "").strip()
        item_description = request.query_params.get("item_description", "").strip()
        vendor_code = request.query_params.get("vendor_code", "").strip()

        spares = Spares.objects.filter(
            Q(authority__name="WED ITEM") | Q(authority__name="B & D")
        )
        if item_code:
            spares = spares.filter(pattern_number__icontains=item_code)
        if item_description:
            spares = spares.filter(description__icontains=item_description)
        if vendor_code:
            spares = spares.filter(pattern_number__startswith=vendor_code)

        return Response(SparesSerializer(spares, many=True).data)

    @action(detail=False, methods=["get"], url_path="survey-list")
    def survey_list(self, request):
        from obs.models import Survey
        from obs.serializers import SurveySerializer

        equipment_class_ids = _scoped_equipment_class_ids(request)
        entries = list(
            Survey.objects.filter(spare__equipment_class_id__in=equipment_class_ids)
        )
        for entry in entries:
            if not entry.dart_number:
                entry.dart_number = "Pending"
        return Response(SurveySerializer(entries, many=True).data)

    @action(detail=False, methods=["get"], url_path="demand-list")
    def demand_list(self, request):
        from obs.models import Demand
        from obs.serializers import DemandSerializer

        equipment_class_ids = _scoped_equipment_class_ids(request)
        entries = list(
            Demand.objects.filter(spare__equipment_class_id__in=equipment_class_ids)
        )
        for entry in entries:
            if not entry.dart_number:
                entry.dart_number = "Pending"
        return Response(DemandSerializer(entries, many=True).data)

    @action(detail=False, methods=["get"], url_path="receive-list")
    def receive_list(self, request):
        from obs.models import Receive
        from obs.serializers import ReceiveSerializer

        entries = Receive.objects.filter(
            spare__equipment_class_id__in=_scoped_equipment_class_ids(request)
        )
        return Response(ReceiveSerializer(entries, many=True).data)

    @action(detail=False, methods=["get"], url_path="pts-list")
    def pts_list(self, request):
        from obs.models import PostSurvey
        from obs.serializers import PostSurveySerializer

        entries = PostSurvey.objects.filter(
            survey_number__in=["PTS", "OPDEM", "ONETIME APPROVAL"],
            spare__equipment_class_id__in=_scoped_equipment_class_ids(request),
            has_pts=True,
        )
        return Response(PostSurveySerializer(entries, many=True).data)

    @action(detail=False, methods=["get"], url_path="generate-demand-list")
    def generate_demand_list(self, request):
        from obs.models import Demand, PostDemand, Spares
        from obs.serializers import DemandSerializer

        equipment_class_ids = _scoped_equipment_class_ids(request)
        spare_ids = Spares.objects.filter(
            equipment_class_id__in=equipment_class_ids
        ).values_list("id", flat=True)
        post_demand_spare_ids = PostDemand.objects.filter(
            spare_id__in=spare_ids
        ).values_list("spare_id", flat=True)
        entries = Demand.objects.filter(spare_id__in=spare_ids).exclude(
            spare_id__in=post_demand_spare_ids
        )
        return Response(DemandSerializer(entries, many=True).data)

    @action(detail=False, methods=["post"], url_path="save-demand")
    def save_demand(self, request):
        from django.utils import timezone

        from obs.models import Demand, PostDemand

        demand_id = request.data.get("id")
        quantity = request.data.get("quantity")
        demand_obj = Demand.objects.filter(id=demand_id).first()
        if not demand_obj:
            raise ValidationError({"id": "Demand not found."})

        post_demand = PostDemand.objects.create(
            spare=demand_obj.spare,
            quantity_demanded=quantity,
            demand_number="",
            demand_date=timezone.now(),
        )
        demand_number = f"DEMAND_{str(post_demand.id).zfill(4)}"
        post_demand.demand_number = demand_number
        post_demand.save(update_fields=["demand_number"])
        return Response({"status": "success", "demand_number": demand_number})

    @action(detail=False, methods=["get"], url_path="demanded-spares")
    def demanded_spares(self, request):
        from obs.models import PostDemand
        from obs.serializers import PostDemandSerializer

        entries = PostDemand.objects.all().order_by("-id")
        return Response(PostDemandSerializer(entries, many=True).data)
