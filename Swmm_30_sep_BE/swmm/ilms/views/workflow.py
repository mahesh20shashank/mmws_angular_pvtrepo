"""The Survey/PTS/Demand HOD-approval workflow viewsets (`SurveyDetailsViewSet`,
`PTSDetailsViewSet`, `DemandDetailsViewSet`, all built on `base.ApprovalWorkflowMixin`)
and the Receive/goods-in stage that follows them (`ReceiveDetailsViewSet` and its
`ReceiveDetailsObjectPermission`).
"""

from django.db import transaction
from django.db.models import Count, F, Q, Sum
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from accounts import rbac

from .. import models, serializers
from ..utils import tagged_viewset
from .base import (
    ApprovalWorkflowMixin,
    ILMSModelViewSet,
    _annotate_pending_ilms_entry,
    _routine_description_summary,
    _scoped_item_ids,
)


@tagged_viewset("ILMS")
class SurveyDetailsViewSet(ApprovalWorkflowMixin, ILMSModelViewSet):
    workflow_name = "Survey"
    completion_field = "is_survey"
    status_field = "mo_survey_status"
    reference_field = "survey_cart_no"
    reference_tag = "SVY"
    queryset = models.SurveyDetails.objects.select_related(
        "ilms_spare_id",
        "obs_spare_id",
        "vendor_id",
    )
    serializer_class = serializers.SurveyDetailsSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "custom_user__department_id"


@tagged_viewset("ILMS")
class PTSDetailsViewSet(ApprovalWorkflowMixin, ILMSModelViewSet):
    workflow_name = "PTS"
    completion_field = "is_pts"
    status_field = "mo_pts_status"
    reference_field = "pts_cart_no"
    reference_tag = "PTS"
    queryset = models.PTSDetails.objects.select_related(
        "ilms_spare_id",
        "obs_spare_id",
        "vendor_id",
    )
    serializer_class = serializers.PTSDetailsSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "custom_user__department_id"

    @action(
        detail=False,
        methods=["get"],
        url_path="raised-survey-pending",
    )
    def raised_survey_pending(self, request):
        approved_pts = (
            self.get_queryset()
            .filter(is_pts=True, mo_pts_status="Approved")
            .order_by("-id")
        )

        result = []
        for pts in approved_pts:
            survey_match = models.SurveyDetails.objects.filter(
                ilms_spare_id=pts.ilms_spare_id,
                obs_spare_id=pts.obs_spare_id,
                mo_routine_plan=pts.mo_routine_plan,
                mo_dart=pts.mo_dart,
            ).first()
            if survey_match and survey_match.is_survey:
                continue
            result.append(pts)

        entries = [_annotate_pending_ilms_entry(entry) for entry in result]
        data = []
        for entry in entries:
            row = self.get_serializer(entry).data
            for field in (
                "dart_number",
                "equipment_name",
                "equipment_nomenclature",
                "dart_description",
                "quantity_required",
                "equipment_class",
            ):
                row[field] = getattr(entry, field, "—")
            data.append(row)
        return Response(data)


@tagged_viewset("ILMS")
class DemandDetailsViewSet(ApprovalWorkflowMixin, ILMSModelViewSet):
    workflow_name = "Demand"
    completion_field = "is_demand"
    status_field = "mo_status"
    reference_field = "demand_cart_no"
    reference_tag = "REP"
    queryset = models.DemandDetails.objects.select_related(
        "ilms_spare_id",
        "obs_spare_id",
        "vendor_id",
    )
    serializer_class = serializers.DemandDetailsSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "custom_user__department_id"

    @action(detail=True, methods=["post"], url_path="generate-number")
    def generate_number(self, request, pk=None):
        with transaction.atomic():
            demand = models.DemandDetails.objects.select_for_update().get(pk=pk)
            if not demand.is_hod_approval:
                raise ValidationError(
                    {
                        "detail": (
                            "HOD approval is required before generating "
                            "a demand number."
                        )
                    }
                )
            if not demand.demand_number:
                demand.demand_number = f"MO-DEMAND-{demand.pk:06d}"
                demand.is_demand = True
                demand.in_progress_status = "Demanded"
                demand.save(
                    update_fields=[
                        "demand_number",
                        "is_demand",
                        "in_progress_status",
                    ]
                )
        return Response(self.get_serializer(demand).data)

    @action(detail=False, methods=["get"], url_path="receive-queue")
    def receive_queue(self, request):
        queryset = (
            self.get_queryset()
            .exclude(demand_number="")
            .filter(ilms_spare_id__in=_scoped_item_ids(request))
        )
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=["get"], url_path="status-rollup")
    def status_rollup(self, request):
        rollup = (
            self.get_queryset()
            .values("mo_status")
            .annotate(count=Count("id"))
            .order_by("mo_status")
        )
        return Response(list(rollup))

    @action(detail=False, methods=["get"], url_path="pending-hq")
    def pending_hq(self, request):
        queryset = self.get_queryset().filter(is_hod=True, is_hod_approval=False)
        return Response(self.get_serializer(queryset, many=True).data)

    @staticmethod
    def _receive_row(obj, source):
        planned_desc = (
            models.MOPlannedSparesDescription.objects.filter(item_id=obj.ilms_spare_id)
            .select_related("item_id")
            .first()
        )
        dart_number = "—"
        denomination = "—"
        crp_category = "—"
        quantity_required = "—"

        if planned_desc:
            if planned_desc.item_id:
                denomination = getattr(planned_desc.item_id, "item_deno", None) or "—"
                crp_category = (
                    getattr(planned_desc.item_id, "crp_category", None) or "—"
                )
            rd = _routine_description_summary(planned_desc.routine_description_id_id)
            if rd:
                dart_number = rd.get("dart_number") or "—"

        if obj.ilms_spare_id:
            planned_spare = models.PlannedMOSpareList.objects.filter(
                pattern_number=obj.ilms_spare_id.item_code
            ).first()
            if planned_spare:
                quantity_required = planned_spare.quantity_required

        if source == "Demand":
            return {
                "source": "Demand",
                "mo_item_code": (
                    obj.ilms_spare_id.item_code if obj.ilms_spare_id else "—"
                ),
                "item_description": (
                    obj.ilms_spare_id.item_desc if obj.ilms_spare_id else "—"
                ),
                "crp_category": crp_category,
                "denomination": (
                    obj.ilms_spare_id.item_deno if obj.ilms_spare_id else "-"
                ),
                "dart_number": dart_number,
                "demand_qty": quantity_required,
                "survey_number": "—",
                "qty_issued_by_mo": "—",
                "demand_number": obj.demand_number,
                "in_progress_status": obj.in_progress_status or "Pending",
            }

        return {
            "source": "Survey",
            "mo_item_code": obj.ilms_spare_id.item_code if obj.ilms_spare_id else "—",
            "item_description": (
                obj.ilms_spare_id.item_desc if obj.ilms_spare_id else "—"
            ),
            "crp_category": crp_category,
            "denomination": denomination,
            "dart_number": dart_number,
            "demand_qty": quantity_required,
            "survey_number": obj.demand_number,
            "qty_issued_by_mo": "—",
            "demand_number": obj.demand_number,
            "in_progress_status": obj.in_progress_status or "Pending",
        }

    @action(detail=False, methods=["get"], url_path="merged-receive-list")
    def merged_receive_list(self, request):
        demand_entries = (
            models.DemandDetails.objects.exclude(demand_number="")
            .filter(demand_number__isnull=False)
            .select_related("vendor_id", "ilms_spare_id")
        )
        survey_entries = (
            models.SurveyDetails.objects.exclude(demand_number="")
            .filter(demand_number__isnull=False)
            .select_related("vendor_id", "ilms_spare_id")
        )

        rows = [self._receive_row(obj, "Demand") for obj in demand_entries]
        rows += [self._receive_row(obj, "Survey") for obj in survey_entries]
        return Response({"entries": rows, "inventory_type": "mo"})

    @action(detail=False, methods=["get"])
    def consolidation(self, request):
        queryset = (
            self.get_queryset()
            .filter(is_demand=False)
            .values(
                "ilms_spare_id",
                "ilms_spare_id__item_desc",
                "vendor_id",
            )
            .annotate(record_count=Count("id"))
            .order_by("ilms_spare_id", "vendor_id")
        )
        return Response(
            [
                {
                    "item_code": entry["ilms_spare_id"],
                    "item_description": entry["ilms_spare_id__item_desc"],
                    "vendor_code": entry["vendor_id"],
                    "record_count": entry["record_count"],
                }
                for entry in queryset
            ]
        )


class ReceiveDetailsObjectPermission(BasePermission):
    """`ReceiveDetails` reaches its submitter's department through whichever of its three
    optional parent FKs is set (`demand_details`/`pts_details`/`survey_details`), so it
    can't use the single-path `DepartmentScopedObjectPermission` — same reasoning as
    `wlms.ReceiveDemandDetailsObjectPermission`, extended to ILMS's extra `survey_details`
    parent."""

    def has_object_permission(self, request, view, obj):
        if rbac.can_see_all_departments(request.user):
            return True
        own_department = rbac.department_of(request.user)
        if own_department is None:
            return False
        for parent_field in ("demand_details", "pts_details", "survey_details"):
            parent = getattr(obj, parent_field, None)
            custom_user = getattr(parent, "custom_user", None)
            if (
                custom_user is not None
                and custom_user.department_id == own_department.pk
            ):
                return True
        return False


@tagged_viewset("ILMS")
class ReceiveDetailsViewSet(ILMSModelViewSet):
    """The Receive/goods-in stage — ported per plan decision using
    `wlms.ReceiveDemandDetailsViewSet` as the engineering template (see the docstring on
    `models.ReceiveDetails`), not source's simpler `MOReceiveDemandDetails` +
    `save_receipt_details` (`ILMS/views.py:2251-2351`). `perform_create` mirrors that
    template's structure exactly: lock the source row and any prior receipts against it,
    reject over-receipt, increment `obs.Spares.quantity_available` and reassign its
    `authority` to `get_or_create(name="ILMS ITEM")` on a full or partial receipt.

    Unlike `wlms` (whose own "ILMS-equivalent" spare model, `WLMSSpare`, also gets its
    `latest_qty` bumped when the source is a WED spare), ILMS's own catalog model,
    `Item`, carries no analogous stock-quantity field at all — stock only ever lives on
    `obs.Spares` here — so this version only ever needs the single `obs.Spares` branch,
    not `wlms`'s dual-target one.
    """

    queryset = models.ReceiveDetails.objects.all()
    serializer_class = serializers.ReceiveDetailsSerializer
    permission_classes = [IsAuthenticated, ReceiveDetailsObjectPermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        if rbac.can_see_all_departments(self.request.user):
            return queryset
        own_department = rbac.department_of(self.request.user)
        if own_department is None:
            return queryset.none()
        return queryset.filter(
            Q(demand_details__custom_user__department_id=own_department.pk)
            | Q(pts_details__custom_user__department_id=own_department.pk)
            | Q(survey_details__custom_user__department_id=own_department.pk)
        )

    def perform_create(self, serializer):
        demand = serializer.validated_data.get("demand_details")
        pts = serializer.validated_data.get("pts_details")
        survey = serializer.validated_data.get("survey_details")
        quantity = serializer.validated_data.get("demand_quantity") or 0
        demand_status = serializer.validated_data.get("demand_status") or ""

        if demand is None and pts is None and survey is None:
            raise ValidationError(
                {"demand_details": "A demand, PTS or survey record is required."}
            )
        if demand_status.lower() != "received":
            serializer.save()
            return
        if quantity <= 0:
            raise ValidationError(
                {"demand_quantity": "Received qty must be greater than 0."}
            )

        if demand is not None:
            source_field, source_model, source_pk = (
                "demand_details",
                models.DemandDetails,
                demand.pk,
            )
        elif pts is not None:
            source_field, source_model, source_pk = (
                "pts_details",
                models.PTSDetails,
                pts.pk,
            )
        else:
            source_field, source_model, source_pk = (
                "survey_details",
                models.SurveyDetails,
                survey.pk,
            )

        with transaction.atomic():
            locked_source = source_model.objects.select_for_update().get(pk=source_pk)
            prior_receipts = models.ReceiveDetails.objects.select_for_update().filter(
                **{source_field: locked_source}
            )
            if prior_receipts.filter(demand_status__iexact="received").exists():
                raise ValidationError(
                    {source_field: "This item has already been fully received."}
                )
            if not locked_source.obs_spare_id_id:
                raise ValidationError(
                    {source_field: "Record is not linked to any inventory spare."}
                )

            # `SurveyDetails`/`PTSDetails`/`DemandDetails` carry no numeric "demanded
            # quantity" field of their own (unlike `wlms.DemandDetails.demand_qty`), so
            # the original balance has to come from the caller instead: the first
            # receipt against a source establishes it (`original_demand_qty` in the
            # request, falling back to this receipt's own quantity), and every
            # subsequent partial receipt reuses whatever the most recent prior receipt
            # against the same source already recorded.
            prior_total = (
                prior_receipts.aggregate(total=Sum("received_qty"))["total"] or 0
            )
            latest_prior = prior_receipts.order_by("-id").first()
            original_qty = (
                serializer.validated_data.get("original_demand_qty")
                or (latest_prior.original_demand_qty if latest_prior else None)
                or quantity
            )
            if quantity > max(original_qty - prior_total, 0):
                raise ValidationError(
                    {"demand_quantity": "Received qty cannot exceed demanded qty."}
                )

            from obs.models import Authority as ObsAuthority
            from obs.models import Spares as ObsSpares

            ilms_authority, _ = ObsAuthority.objects.get_or_create(name="ILMS ITEM")
            ObsSpares.objects.filter(pk=locked_source.obs_spare_id_id).update(
                quantity_available=F("quantity_available") + quantity,
                authority=ilms_authority,
            )

            total_received = prior_total + quantity
            fully_received = total_received >= original_qty
            serializer.save(
                **{source_field: locked_source},
                received_qty=total_received,
                original_demand_qty=original_qty,
                demand_quantity=max(original_qty - total_received, 0),
                demand_status="Received" if fully_received else "Outstanding",
                received_date=(
                    serializer.validated_data.get("received_date")
                    or timezone.localdate()
                ),
            )
