"""WLMS PTS/Demand/Receive workflow viewsets: `PTSItemsViewSet`,
`PTSDemandDetailsViewSet`, `DemandDetailsViewSet`, `ReceiveDemandDetailsObjectPermission`,
`ReceiveDemandDetailsViewSet`.

Split out of the former flat `wlms/views.py` (the wlms file-structure split, mirroring
the earlier `obs/views/` package split).
"""

from django.db import transaction
from django.db.models import F, Q, Sum
from django.utils import timezone
from drf_spectacular.utils import OpenApiExample, extend_schema, extend_schema_view
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from accounts import rbac

from .. import models, serializers
from ..utils import generate_sequence_number, parse_pts_survey_cart_name, resolve_cart_qty, tagged_viewset
from .base import (
    ApprovalWorkflowMixin,
    WLMSModelViewSet,
    _annotate_pending_wlms_entry,
    _department_scoped,
)


@tagged_viewset("WLMS")
class PTSItemsViewSet(WLMSModelViewSet):
    queryset = models.PTSItems.objects.all()
    serializer_class = serializers.PTSItemsSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "pts_details_id__user_id__department_id"


@tagged_viewset("WLMS")
class PTSDemandDetailsViewSet(ApprovalWorkflowMixin, WLMSModelViewSet):
    workflow_name = "PTS"
    completion_field = "is_pts"
    status_field = "wlms_pts_status"
    queryset = models.PTSDemandDetails.objects.all()
    serializer_class = serializers.PTSDemandDetailsSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "user_id__department_id"

    @action(detail=False, methods=["get"], url_path="pending-list")
    def pending_list(self, request):
        items = self._pending_annotated_entries(request, qty_field="demand_qty")
        item_ids = [item.pk for item in items]
        latest_receipts = {}
        for receipt in models.ReceiveDemandDetails.objects.filter(
            pts_details_id__in=item_ids
        ).order_by("pts_details_id", "-id"):
            latest_receipts.setdefault(receipt.pts_details_id, receipt)
        for item in items:
            receipt = latest_receipts.get(item.pk)
            item.swmm_demandno = receipt.swmm_demandno if receipt else "-"

        completed = (
            self.get_queryset()
            .filter(is_hod=True)
            .exclude(PTS_demand_no="")
            .select_related("wed_spares_id__eqpt", "obs_spare_id")
            .order_by("-id")
        )
        completed = _department_scoped(completed, request)

        pending_data = []
        for item in items:
            row = self.get_serializer(item).data
            for field in (
                "scrap_qty",
                "equipment_nomenclature",
                "dart_number",
                "dart_description",
                "equipment_class",
                "swmm_demandno",
            ):
                row[field] = getattr(item, field, "-")
            pending_data.append(row)

        return Response(
            {
                "pending_pts": pending_data,
                "completed_pts": self.get_serializer(completed, many=True).data,
            }
        )

    @action(detail=True, methods=["post"], url_path="generate-number")
    def generate_number(self, request, pk=None):
        with transaction.atomic():
            pts = self.get_queryset().select_for_update().get(pk=pk)
            if not pts.is_approval:
                raise ValidationError(
                    {
                        "detail": (
                            "HOD approval is required before generating a PTS number."
                        )
                    }
                )
            if not pts.PTS_demand_no:
                pts.PTS_demand_no = generate_sequence_number(
                    models.PTSDemandDetails, "PTS_demand_no", "SWMM/PTS"
                )
                pts.is_pts = True
                pts.save(update_fields=["PTS_demand_no", "is_pts"])
        return Response(self.get_serializer(pts).data)

    @action(
        detail=False,
        methods=["get"],
        url_path="raised-survey-pending",
    )
    def raised_survey_pending(self, request):
        pending = (
            self.get_queryset()
            .filter(is_pts=False, wlms_pts_status="Approved")
            .select_related(
                "wed_spares_id__eqpt",
                "obs_spare_id",
            )
            .order_by("-id")
        )
        pending = list(pending)
        pks = [item.pk for item in pending]

        receipts_map = {}
        for receipt in models.ReceiveDemandDetails.objects.filter(
            pts_details_id__in=pks
        ):
            receipts_map[receipt.pts_details_id] = receipt

        surveys_map = {}
        for survey in models.SurveyReceiptsDetails.objects.filter(
            spare_cart_name__startswith="PTS:"
        ):
            pts_id = parse_pts_survey_cart_name(survey.spare_cart_name)
            if pts_id is not None:
                surveys_map[pts_id] = survey

        enriched = []
        for item in pending:
            survey = surveys_map.get(item.pk)
            if survey and survey.is_sync and survey.is_approval:
                continue

            item.demand_qty_resolved = resolve_cart_qty(item, qty_field="demand_qty")
            receipt = receipts_map.get(item.pk)
            item.receipt_status = receipt.demand_status if receipt else "Awaiting Issue"
            item.received_qty = receipt.received_qty if receipt else 0
            _annotate_pending_wlms_entry(item, qty_field="demand_qty")
            enriched.append(item)

        data = []
        for item in enriched:
            row = self.get_serializer(item).data
            for field in (
                "demand_qty_resolved",
                "receipt_status",
                "received_qty",
                "equipment_nomenclature",
                "dart_number",
                "dart_description",
                "equipment_class",
            ):
                row[field] = getattr(item, field, "-")
            data.append(row)
        return Response({"data": data})

    # Named "prefill", not "detail" — DRF's ViewSetMixin.as_view() sets
    # `cls.detail = None` on every call (its own reserved introspection flag),
    # which silently clobbers an @action method literally named "detail" and
    # turns the bound handler into None (dispatch then raises "'NoneType'
    # object is not callable").
    @action(detail=True, methods=["get"])
    def prefill(self, request, pk=None):
        pts = self.get_object()
        qty = resolve_cart_qty(pts, qty_field="demand_qty")
        items = list(models.PTSItems.objects.filter(pts_details_id=pts).order_by("id"))
        preview_number = pts.PTS_demand_no or generate_sequence_number(
            models.PTSDemandDetails, "PTS_demand_no", "SWMM/PTS", lock=False
        )
        return Response(
            {
                "pts": self.get_serializer(pts).data,
                "quantity": qty,
                "generated_pts_demand_no": preview_number,
                "items": serializers.PTSItemsSerializer(items, many=True).data,
            }
        )

    @action(detail=True, methods=["post"], url_path="save")
    def save(self, request, pk=None):
        with transaction.atomic():
            pts = self.get_queryset().select_for_update().get(pk=pk)
            pts.demand_qty = request.data.get("demand_qty", pts.demand_qty)
            pts.remarks = request.data.get("authority_remarks", pts.remarks)
            pts.is_save = True
            if not pts.PTS_demand_no:
                pts.PTS_demand_no = generate_sequence_number(
                    models.PTSDemandDetails, "PTS_demand_no", "SWMM/PTS"
                )
            pts.save(
                update_fields=["demand_qty", "remarks", "is_save", "PTS_demand_no"]
            )

            qty = resolve_cart_qty(pts, qty_field="demand_qty")
            try:
                qty = int(qty)
            except (TypeError, ValueError):
                qty = 1

            existing_items = list(
                models.PTSItems.objects.filter(pts_details_id=pts).order_by("id")
            )
            serials = request.data.get("serial_numbers", [])
            for index in range(qty):
                serial_no = serials[index] if index < len(serials) else ""
                if index < len(existing_items):
                    item = existing_items[index]
                    if serial_no and item.item_serial_no != serial_no:
                        item.item_serial_no = serial_no
                        item.save(update_fields=["item_serial_no"])
                else:
                    models.PTSItems.objects.create(
                        pts_details_id=pts,
                        wed_spares_id=pts.wed_spares_id,
                        item_serial_no=serial_no,
                    )
            if len(existing_items) > qty:
                stale_ids = [item.pk for item in existing_items[qty:]]
                models.PTSItems.objects.filter(pk__in=stale_ids).delete()

        return Response({"status": "success", "PTS_demand_no": pts.PTS_demand_no})


@tagged_viewset("WLMS")
class DemandDetailsViewSet(ApprovalWorkflowMixin, WLMSModelViewSet):
    workflow_name = "Demand"
    completion_field = "is_demand"
    status_field = "wlms_demand_status"
    queryset = models.DemandDetails.objects.all()
    serializer_class = serializers.DemandDetailsSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "user_id__department_id"

    @action(detail=False, methods=["get"], url_path="pending-list")
    def pending_list(self, request):
        bridged_surveys = models.SurveyReceiptsDetails.objects.filter(
            spare_cart_name__startswith="PTS:"
        )
        excluded_wed_spare_ids = set(
            bridged_surveys.filter(wed_spares_id__isnull=False).values_list(
                "wed_spares_id", flat=True
            )
        )
        excluded_obs_spare_ids = set(
            bridged_surveys.filter(obs_spare_id__isnull=False).values_list(
                "obs_spare_id", flat=True
            )
        )

        def exclude_pts_surveyed(queryset):
            if excluded_wed_spare_ids:
                queryset = queryset.exclude(wed_spares_id__in=excluded_wed_spare_ids)
            if excluded_obs_spare_ids:
                queryset = queryset.exclude(obs_spare_id__in=excluded_obs_spare_ids)
            return queryset

        items = self._pending_annotated_entries(
            request,
            qty_field="demand_qty",
            extra_filter=exclude_pts_surveyed,
        )
        return Response({"pending_demands": self._serialize_pending(items)})

    @action(detail=True, methods=["post"], url_path="generate-number")
    def generate_number(self, request, pk=None):
        with transaction.atomic():
            demand = self.get_queryset().select_for_update().get(pk=pk)
            if not demand.is_approval:
                raise ValidationError(
                    {
                        "detail": (
                            "HOD approval is required before generating "
                            "a demand number."
                        )
                    }
                )
            if not demand.demand_no:
                demand.demand_no = generate_sequence_number(
                    models.DemandDetails, "demand_no", "SWMM/DEMAND"
                )
                demand.is_demand = True
                demand.save(update_fields=["demand_no", "is_demand"])
        return Response(self.get_serializer(demand).data)

    # Named "prefill", not "detail" — see the identical note on
    # PTSDemandDetailsViewSet.prefill above.
    @action(detail=True, methods=["get"])
    def prefill(self, request, pk=None):
        demand = self.get_object()
        preview_number = demand.demand_no or generate_sequence_number(
            models.DemandDetails, "demand_no", "SWMM/DEMAND", lock=False
        )
        return Response(
            {
                "demand": self.get_serializer(demand).data,
                "generated_demand_no": preview_number,
                "demand_pdf_name": (
                    demand.demand_pdf.name.split("/")[-1] if demand.demand_pdf else None
                ),
            }
        )

    @action(detail=True, methods=["post"], url_path="save")
    def save(self, request, pk=None):
        with transaction.atomic():
            demand = self.get_queryset().select_for_update().get(pk=pk)
            demand.demand_no = demand.demand_no or generate_sequence_number(
                models.DemandDetails, "demand_no", "SWMM/DEMAND"
            )
            demand.demand_qty = request.data.get("demand_qty", demand.demand_qty)
            demand.remarks = request.data.get("authority_remarks", demand.remarks)
            demand.is_save = True
            demand.is_demand = False
            update_fields = [
                "demand_no",
                "demand_qty",
                "remarks",
                "is_save",
                "is_demand",
            ]
            if "certificate_upload" in request.FILES:
                demand.demand_pdf = request.FILES["certificate_upload"]
                update_fields.append("demand_pdf")
            demand.save(update_fields=update_fields)

        return Response({"status": "success", "demand_no": demand.demand_no})

    @action(detail=False, methods=["get"], url_path="receive-queue")
    def receive_queue(self, request):
        queryset = (
            self.get_queryset()
            .exclude(demand_no="")
            .exclude(receivedemanddetails__demand_status__iexact="received")
            .distinct()
        )
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=["get"])
    def consolidation(self, request):
        pending = (
            self.get_queryset()
            .filter(
                is_demand=False,
                is_delete=False,
                wed_spares_id__isnull=False,
            )
            .select_related("wed_spares_id")
        )
        grouped = {}
        for demand in pending:
            key = demand.wed_spares_id_id
            if key not in grouped:
                grouped[key] = {
                    "item_code": demand.wed_spares_id.item_code,
                    "item_description": demand.wed_spares_id.item_desc,
                    "record_count": 0,
                    "total_quantity": 0,
                }
            grouped[key]["record_count"] += 1
            try:
                grouped[key]["total_quantity"] += int(demand.demand_qty)
            except (TypeError, ValueError):
                pass
        return Response(list(grouped.values()))


class ReceiveDemandDetailsObjectPermission(BasePermission):
    """`ReceiveDemandDetails` reaches its submitter's department through
    either `demand_details` or `pts_details` (both optional), so it can't
    use the single-path `DepartmentScopedObjectPermission`."""

    def has_object_permission(self, request, view, obj):
        if rbac.can_see_all_departments(request.user):
            return True
        own_department = rbac.department_of(request.user)
        if own_department is None:
            return False
        for parent_field in ("demand_details", "pts_details"):
            parent = getattr(obj, parent_field, None)
            if (
                parent is not None
                and parent.user_id_id
                and parent.user_id.department_id == own_department.pk
            ):
                return True
        return False


@extend_schema_view(
    list=extend_schema(
        examples=[
            OpenApiExample(
                "Receive demand response",
                value=[
                    {
                        "id": 1,
                        "demand_number": "WLMS-DEM-001",
                        "demand_date": "2026-06-03",
                        "demand_quantity": 5,
                        "demand_status": "received",
                        "swmm_demandno": "SWMM-DEM-001",
                        "dart_no": "DART-001",
                        "created_at": "2026-06-03T10:00:00Z",
                        "updated_at": "2026-06-03T10:00:00Z",
                        "gate_pass_no": "GP-001",
                        "gate_pass_date": "2026-06-03T10:00:00Z",
                        "demand_details": None,
                    }
                ],
                response_only=True,
            )
        ]
    ),
    create=extend_schema(
        examples=[
            OpenApiExample(
                "Create receive demand",
                value={
                    "demand_number": "WLMS-DEM-001",
                    "demand_date": "2026-06-03",
                    "demand_quantity": 5,
                    "demand_status": "received",
                    "swmm_demandno": "SWMM-DEM-001",
                    "dart_no": "DART-001",
                    "gate_pass_no": "GP-001",
                    "gate_pass_date": "2026-06-03T10:00:00Z",
                    "demand_details": None,
                },
                request_only=True,
            )
        ]
    ),
)
@tagged_viewset("WLMS")
class ReceiveDemandDetailsViewSet(WLMSModelViewSet):
    queryset = models.ReceiveDemandDetails.objects.all()
    serializer_class = serializers.ReceiveDemandDetailsSerializer
    permission_classes = [IsAuthenticated, ReceiveDemandDetailsObjectPermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        if rbac.can_see_all_departments(self.request.user):
            return queryset
        own_department = rbac.department_of(self.request.user)
        if own_department is None:
            return queryset.none()
        return queryset.filter(
            Q(demand_details__user_id__department_id=own_department.pk)
            | Q(pts_details__user_id__department_id=own_department.pk)
        )

    def perform_create(self, serializer):
        demand = serializer.validated_data.get("demand_details")
        pts = serializer.validated_data.get("pts_details")
        quantity = serializer.validated_data.get("demand_quantity") or 0
        demand_status = serializer.validated_data.get("demand_status") or ""

        if demand is None and pts is None:
            raise ValidationError(
                {"demand_details": "A demand or PTS record is required."}
            )
        if demand_status.lower() != "received":
            serializer.save()
            return
        if quantity <= 0:
            raise ValidationError(
                {"demand_quantity": "Received qty must be greater than 0."}
            )

        source_field, source_model, source_pk = (
            ("demand_details", models.DemandDetails, demand.pk)
            if demand is not None
            else ("pts_details", models.PTSDemandDetails, pts.pk)
        )

        with transaction.atomic():
            locked_source = source_model.objects.select_for_update().get(pk=source_pk)
            prior_receipts = (
                models.ReceiveDemandDetails.objects.select_for_update().filter(
                    **{source_field: locked_source}
                )
            )
            if prior_receipts.filter(demand_status__iexact="received").exists():
                raise ValidationError(
                    {source_field: "This item has already been fully received."}
                )
            if not locked_source.wed_spares_id_id and not locked_source.obs_spare_id_id:
                raise ValidationError(
                    {source_field: "Record is not linked to any inventory spare."}
                )

            try:
                original_qty = int(locked_source.demand_qty)
            except (TypeError, ValueError):
                original_qty = quantity
            prior_total = (
                prior_receipts.aggregate(total=Sum("received_qty"))["total"] or 0
            )
            if quantity > max(original_qty - prior_total, 0):
                raise ValidationError(
                    {"demand_quantity": "Received qty cannot exceed demanded qty."}
                )

            if locked_source.obs_spare_id_id:
                from obs.models import Authority as ObsAuthority
                from obs.models import Spares as ObsSpares

                wed_authority, _ = ObsAuthority.objects.get_or_create(name="WED ITEM")
                ObsSpares.objects.filter(pk=locked_source.obs_spare_id_id).update(
                    quantity_available=F("quantity_available") + quantity,
                    authority=wed_authority,
                )
            if locked_source.wed_spares_id_id:
                models.WLMSSpare.objects.filter(
                    pk=locked_source.wed_spares_id_id
                ).update(latest_qty=F("latest_qty") + quantity)

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
