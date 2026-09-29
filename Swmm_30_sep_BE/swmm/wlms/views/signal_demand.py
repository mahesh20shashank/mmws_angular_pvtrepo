"""WLMS ship-to-ship signal demand viewset: `SignalDemandViewSet`.

Split out of the former flat `wlms/views.py` (the wlms file-structure split, mirroring
the earlier `obs/views/` package split).
"""

from django.db.models import Q
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts import rbac

from .. import models, serializers
from ..utils import tagged_viewset
from .base import WLMSModelViewSet


@tagged_viewset("WLMS")
class SignalDemandViewSet(WLMSModelViewSet):
    queryset = models.SignalDemand.objects.select_related(
        "requesting_ship",
        "receiver_ship",
        "equipment",
        "wed_spare",
        "obs_spare",
        "created_by",
    )
    serializer_class = serializers.SignalDemandSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "created_by__department_id"

    def get_queryset(self):
        queryset = super().get_queryset()
        demand_type = self.request.query_params.get("demand_type")
        demand_status = self.request.query_params.get("status")
        ship = self.request.query_params.get("ship")
        query = self.request.query_params.get("q")

        if demand_type:
            queryset = queryset.filter(demand_type=demand_type.upper())
        if demand_status:
            queryset = queryset.filter(status=demand_status.upper())
        if ship:
            queryset = queryset.filter(
                Q(requesting_ship_id=ship) | Q(receiver_ship_id=ship)
            )
        if query:
            queryset = queryset.filter(
                Q(demand_number__icontains=query)
                | Q(wed_spare__item_code__icontains=query)
                | Q(wed_spare__item_desc__icontains=query)
                | Q(obs_spare__pattern_number__icontains=query)
                | Q(obs_spare__description__icontains=query)
            )
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user.user_profile)

    def _change_status(self, demand, target_status, allowed_statuses):
        if demand.status not in allowed_statuses:
            raise ValidationError(
                {
                    "status": (
                        f"{demand.demand_type} cannot move from "
                        f"{demand.status} to {target_status}."
                    )
                }
            )
        demand.status = target_status
        demand.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(demand).data)

    @action(detail=True, methods=["post"])
    def forward(self, request, pk=None):
        return self._change_status(
            self.get_object(),
            models.SignalDemand.FORWARDED,
            {models.SignalDemand.REGISTERED},
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._change_status(
            self.get_object(),
            models.SignalDemand.APPROVED,
            {models.SignalDemand.FORWARDED},
        )

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self._change_status(
            self.get_object(),
            models.SignalDemand.REJECTED,
            {models.SignalDemand.FORWARDED},
        )

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return self._change_status(
            self.get_object(),
            models.SignalDemand.CANCELLED,
            {
                models.SignalDemand.REGISTERED,
                models.SignalDemand.FORWARDED,
            },
        )
