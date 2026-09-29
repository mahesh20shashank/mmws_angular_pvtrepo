"""`IIFViewSet`: the Item Issue Form cart-and-issue flow. Has no `ApprovalWorkflowMixin`
base of its own — its cart shape doesn't match the Survey/PTS/Demand approval workflow —
so its own HOD-numbering and sync actions are defined directly here.
"""

from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts import rbac

from .. import models, serializers
from ..utils import generate_ilms_reference, tagged_viewset
from .base import ILMSModelViewSet


@tagged_viewset("ILMS")
class IIFViewSet(ILMSModelViewSet):
    queryset = models.IIF.objects.select_related("spare_id")
    serializer_class = serializers.IIFSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list":
            queryset = queryset.filter(is_delete=False)
        return queryset

    @action(detail=False, methods=["get"])
    def history(self, request):
        queryset = models.IIF.objects.select_related("spare_id").filter(is_sync=True)
        return Response(self.get_serializer(queryset, many=True).data)

    @extend_schema(request=serializers.AddToIIFCartSerializer)
    @action(detail=False, methods=["post"], url_path="add-items")
    def add_items(self, request):
        serializer = serializers.AddToIIFCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        spare_ids = serializer.validated_data["spare_ids"]

        from obs.models import Demand, Issue, Spares, Survey

        spares = list(Spares.objects.filter(pk__in=spare_ids))
        if len(spares) != len(set(spare_ids)):
            raise ValidationError(
                {"spare_ids": "One or more onboard spares were not found."}
            )

        created = []
        existing = []
        with transaction.atomic():
            for spare in spares:
                entry, was_created = models.IIF.objects.get_or_create(
                    spare_id=spare,
                    is_delete=False,
                    defaults={
                        "is_sync": False,
                        "is_hod": False,
                    },
                )
                (created if was_created else existing).append(entry)

                demand_issue_ids = Demand.objects.filter(
                    spare=spare,
                    is_iif=True,
                    issue_entry__isnull=False,
                ).values_list("issue_entry_id", flat=True)
                survey_issue_ids = Survey.objects.filter(
                    spare=spare,
                    is_iif=True,
                    issue_entry__isnull=False,
                ).values_list("issue_entry_id", flat=True)
                issue_ids = set(demand_issue_ids) | set(survey_issue_ids)
                if issue_ids:
                    Issue.objects.filter(pk__in=issue_ids).update(is_wed_mo=True)

        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(
            {
                "created": self.get_serializer(created, many=True).data,
                "existing": self.get_serializer(existing, many=True).data,
            },
            status=response_status,
        )

    @action(detail=True, methods=["post"], url_path="mark-synced")
    def mark_synced(self, request, pk=None):
        entry = self.get_object()
        entry.is_sync = True
        entry.is_hod = True
        entry.is_delete = True
        entry.save(update_fields=["is_sync", "is_hod", "is_delete"])
        return Response(self.get_serializer(entry).data)

    @action(detail=False, methods=["post"], url_path="bulk-send-for-approval")
    def bulk_send_for_approval(self, request):
        """IIF's HOD-numbering equivalent of `ApprovalWorkflowMixin.bulk_send_for_approval`
        (IIF has no `ApprovalWorkflowMixin` base of its own — its cart-and-issue flow
        doesn't share the Survey/PTS/Demand approval shape), porting source's
        `iif_send_hod_approval` (`ILMS/views.py:2371-2410`): each selected, not-yet-deleted
        row gets its own `swmm_iifno` and is flipped to pending-HOD."""
        ids = request.data.get("ids", request.data.get("pks", []))
        if not ids:
            raise ValidationError({"ids": "At least one record id is required."})

        profile = getattr(request.user, "user_profile", None)
        department = rbac.department_of(request.user)
        updated = 0
        with transaction.atomic():
            entries = (
                models.IIF.objects.select_for_update()
                .filter(pk__in=ids, is_delete=False, is_hod_approval=False)
            )
            for entry in entries:
                if not entry.swmm_iifno:
                    entry.swmm_iifno = generate_ilms_reference(
                        models.IIF, "swmm_iifno", "IIF", department=department
                    )
                entry.is_hod = True
                entry.mo_status = "Pending HOD Approval"
                entry.in_progress_status = "IIF"
                if profile is not None:
                    entry.custom_user = profile
                entry.save(
                    update_fields=[
                        "swmm_iifno",
                        "is_hod",
                        "mo_status",
                        "in_progress_status",
                        "custom_user",
                    ]
                )
                updated += 1
        return Response({"success": True, "updated": updated})
