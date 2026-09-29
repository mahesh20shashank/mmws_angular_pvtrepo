"""Delegation endpoints.

- GET  /api/delegation/transfers/         incoming + outgoing (non-terminal)
- POST /api/delegation/transfers/         create a transfer (delegator = caller)
- POST /api/delegation/transfers/<id>/    body {"action": "REVOKE"|"EXTEND", ...}

Origin: ITTTM transfer_rights/views.py, with correct HTTP status codes and the
SWMM error shape (anti-pattern #7), and no ``fields = "__all__"`` (#2).
"""

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from authz.cache import invalidate_user_profile

from .models import RightsTransfer, RightsTransferLog
from .serializers import RightsTransferLogSerializer, RightsTransferSerializer


class RightsTransferView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        uid = request.user.id
        outgoing = (
            RightsTransfer.objects.filter(delegator_id=uid)
            .exclude(status__in=RightsTransfer.TERMINAL_STATUSES)
            .select_related("delegator", "delegatee")
        )
        incoming = (
            RightsTransfer.objects.filter(delegatee_id=uid)
            .exclude(status__in=RightsTransfer.TERMINAL_STATUSES)
            .select_related("delegator", "delegatee")
        )
        return Response(
            {
                "outgoing_delegations": RightsTransferSerializer(
                    outgoing, many=True
                ).data,
                "incoming_delegations": RightsTransferSerializer(
                    incoming, many=True
                ).data,
            }
        )

    def post(self, request, pk=None):
        if pk is not None or request.data.get("action"):
            return self._handle_action(request, pk)

        serializer = RightsTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data["delegatee"].id == request.user.id:
            return Response(
                {"status": "error", "message": "You cannot delegate to yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            transfer = serializer.save(
                delegator=request.user, created_by=request.user
            )
            RightsTransferLog.objects.create(
                transfer=transfer,
                action_type="INITIATED",
                previous_status="",
                new_status=transfer.status,
                new_end_date_time=transfer.end_date_time,
                performed_by=request.user,
                reason=transfer.reason,
            )
            if (
                transfer.start_date_time <= timezone.now()
                and transfer.status == RightsTransfer.STATUS_PENDING
            ):
                transfer.status = RightsTransfer.STATUS_ACTIVE
                transfer.save(update_fields=["status", "modified_on"])
                RightsTransferLog.objects.create(
                    transfer=transfer,
                    action_type="ACTIVATED",
                    previous_status=RightsTransfer.STATUS_PENDING,
                    new_status=RightsTransfer.STATUS_ACTIVE,
                    new_end_date_time=transfer.end_date_time,
                    performed_by=request.user,
                    reason="Immediate activation.",
                )
                invalidate_user_profile(transfer.delegatee_id)
        return Response(
            RightsTransferSerializer(transfer).data, status=status.HTTP_201_CREATED
        )

    def _handle_action(self, request, pk):
        transfer_id = pk or request.data.get("id")
        if not transfer_id:
            return Response(
                {"status": "error", "message": "id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        transfer = RightsTransfer.objects.filter(
            pk=transfer_id, delegator_id=request.user.id
        ).first()
        if transfer is None:
            return Response(
                {"status": "error", "message": "Delegation not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        action = request.data.get("action")
        if action == "REVOKE":
            if transfer.status in RightsTransfer.TERMINAL_STATUSES:
                return Response(
                    {"status": "error", "message": "Transfer has already ended."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            with transaction.atomic():
                prev = transfer.status
                transfer.status = RightsTransfer.STATUS_REDUCED
                transfer.actual_retrieved_at = timezone.now()
                transfer.save(
                    update_fields=["status", "actual_retrieved_at", "modified_on"]
                )
                RightsTransferLog.objects.create(
                    transfer=transfer,
                    action_type="REVOKED",
                    previous_status=prev,
                    new_status=transfer.status,
                    previous_end_date_time=transfer.end_date_time,
                    new_end_date_time=transfer.end_date_time,
                    performed_by=request.user,
                    reason=request.data.get("reason", "Manually revoked."),
                )
            invalidate_user_profile(transfer.delegatee_id)
            return Response(RightsTransferSerializer(transfer).data)

        if action == "EXTEND":
            raw = request.data.get("new_end_date_time")
            if not raw:
                return Response(
                    {
                        "status": "error",
                        "message": "new_end_date_time is required for EXTEND.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                new_end = drf_serializers.DateTimeField().to_internal_value(raw)
            except drf_serializers.ValidationError:
                return Response(
                    {"status": "error", "message": "Invalid new_end_date_time."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if new_end <= transfer.end_date_time:
                return Response(
                    {
                        "status": "error",
                        "message": "new_end_date_time must be later than the "
                        "current end.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if transfer.status in RightsTransfer.TERMINAL_STATUSES:
                return Response(
                    {"status": "error", "message": "Transfer has already ended."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            with transaction.atomic():
                prev_status = transfer.status
                prev_end = transfer.end_date_time
                transfer.end_date_time = new_end
                transfer.status = RightsTransfer.STATUS_EXTENDED
                transfer.save(
                    update_fields=["end_date_time", "status", "modified_on"]
                )
                RightsTransferLog.objects.create(
                    transfer=transfer,
                    action_type="EXTENDED",
                    previous_status=prev_status,
                    new_status=transfer.status,
                    previous_end_date_time=prev_end,
                    new_end_date_time=new_end,
                    performed_by=request.user,
                    reason=request.data.get("reason", "Manually extended."),
                )
            invalidate_user_profile(transfer.delegatee_id)
            return Response(RightsTransferSerializer(transfer).data)

        return Response(
            {"status": "error", "message": "Invalid action."},
            status=status.HTTP_400_BAD_REQUEST,
        )


class RightsTransferLogView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, pk):
        transfer = RightsTransfer.objects.filter(pk=pk).first()
        if transfer is None:
            return Response(
                {"status": "error", "message": "Delegation not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if request.user.id not in (transfer.delegator_id, transfer.delegatee_id):
            return Response(
                {"status": "error", "message": "Not your delegation."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(
            RightsTransferLogSerializer(transfer.logs.all(), many=True).data
        )
