"""Shared viewset infrastructure for the `wlms` app: `WLMSModelViewSet`, the
`ApprovalWorkflowMixin` every Survey/PTS/Demand/IIF viewset builds on, and the
module-level QR/numbering/annotation/scoping helpers those share.

Split out of the former flat `wlms/views.py` (the wlms file-structure split, mirroring
the earlier `obs/views/` package split).
"""

import base64
import io

import qrcode
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts import rbac

from .. import models, serializers
from ..excel import ExcelImportExportMixin


def _zero_padded(value, width):
    return str(value).zfill(width)


def _next_ref_seq():
    year = timezone.localdate().year
    count = models.SurveyFormsDetails.objects.filter(created_date__year=year).count()
    return _zero_padded(count + 1, 3)


def _base_cert_offset():
    return models.SurveyFormsItems.objects.count()


def _generate_qr_b64(data):
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=4,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("utf-8")


def _routine_description_summary(routine_description_id):
    if not routine_description_id:
        return None

    from ems.models import RoutineDescription

    return (
        RoutineDescription.objects.filter(pk=routine_description_id)
        .values(
            "dart_number",
            "routine_description",
            "equipment_name__name",
            "equipment_name__extra",
        )
        .first()
    )


def _annotate_pending_wlms_entry(item, qty_field=None):
    """Attach dart_number/equipment_nomenclature/equipment_class/qty display
    fields to a Survey/Demand/PTS cart entry, matching the reference list views.
    """
    item.dart_number = ""
    item.dart_description = "-"
    item.equipment_nomenclature = ""
    item.equipment_class = "-"
    item.scrap_qty = getattr(item, qty_field, None) if qty_field else None
    item.scrap_qty = item.scrap_qty or "-"

    if item.wed_spares_id_id:
        dart_wed = None
        if item.wed_routine_plan_id:
            planned = item.wed_routine_plan
            rd = _routine_description_summary(planned.routine_description_id_id)
            if rd:
                item.dart_number = rd.get("dart_number") or ""
                item.dart_description = rd.get("routine_description") or "-"
                item.equipment_nomenclature = rd.get("equipment_name__name") or ""
        elif item.wed_dart_id:
            dart_wed = item.wed_dart
            if dart_wed.dart_id:
                item.dart_number = dart_wed.dart_id.dart_number or ""
                item.dart_description = dart_wed.dart_id.defective_discriptions or "-"
                if dart_wed.dart_id.equipment_ship:
                    item.equipment_nomenclature = (
                        dart_wed.dart_id.equipment_ship.nomenclature or ""
                    )

        if not qty_field or item.scrap_qty == "-":
            if item.wed_routine_plan_id:
                wed_spare_entry = models.PlannedWEDSpareList.objects.filter(
                    planned_spares_description=item.wed_routine_plan
                ).first()
                item.scrap_qty = (
                    wed_spare_entry.quantity_required
                    if wed_spare_entry and wed_spare_entry.quantity_required
                    else "-"
                )
            elif dart_wed and dart_wed.quantity:
                item.scrap_qty = dart_wed.quantity

        mapping = models.SpareDataMap.objects.filter(
            wed_equipment=item.wed_spares_id.eqpt
        ).first()
        if mapping and mapping.equipment:
            item.equipment_class = (
                getattr(mapping.equipment.equipment_type_f_key, "Equipment_Desc", None)
                or "-"
            )

    elif item.obs_spare_id_id:
        from op_maintenance.models import InitiateDart

        dart_obj = (
            InitiateDart.objects.filter(
                spares__pattern=item.obs_spare_id.pattern_number
            )
            .select_related("equipment_ship")
            .order_by("-id")
            .first()
        )
        if dart_obj:
            item.dart_number = dart_obj.dart_number or ""
            item.dart_description = dart_obj.defective_discriptions or "-"
            if dart_obj.equipment_ship:
                item.equipment_nomenclature = dart_obj.equipment_ship.nomenclature or ""

        if not qty_field or item.scrap_qty == "-":
            from obs.models import Survey as ObsSurvey

            survey_qty = (
                ObsSurvey.objects.filter(spare=item.obs_spare_id)
                .order_by("-id")
                .first()
            )
            if survey_qty:
                item.scrap_qty = survey_qty.quantity_tosurvey

    return item


def _expand_by_qty(base_item, qty, offset, idx_start):
    try:
        count = int(qty)
    except (TypeError, ValueError):
        count = 1

    expanded = []
    for i in range(count):
        row = dict(base_item)
        row["qty"] = 1
        row["cert_seq"] = _zero_padded(offset + idx_start + i, 4)
        expanded.append(row)
    return expanded


def _department_scoped(queryset, request):
    if rbac.can_see_all_departments(request.user):
        return queryset
    department = rbac.department_of(request.user)
    if department is None:
        return queryset.none()
    return queryset.filter(user_id__department_id=department.pk)


def _scoped_equipment_class_ids(request):
    from obs.models import EquipmentClass

    if rbac.can_see_all_departments(request.user):
        return EquipmentClass.objects.values_list("id", flat=True)
    department = rbac.department_of(request.user)
    if department is None:
        return EquipmentClass.objects.none().values_list("id", flat=True)
    return EquipmentClass.objects.filter(
        spare_class__department_id=department.pk
    ).values_list("id", flat=True)


@extend_schema(tags=["WLMS"])
class WLMSModelViewSet(ExcelImportExportMixin, viewsets.ModelViewSet):
    pass


class ApprovalWorkflowMixin:
    workflow_name = ""
    completion_field = ""
    status_field = ""
    workflow_send_status = "Pending HOD Approval"
    mark_synced_sets_delete = False

    @extend_schema(request=serializers.AddToWorkflowCartSerializer)
    @action(detail=False, methods=["post"], url_path="add-to-cart")
    def add_to_cart(self, request):
        serializer = serializers.AddToWorkflowCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        source = serializer.validated_data["source"]
        source_ids = serializer.validated_data["source_ids"]
        records = self._resolve_cart_records(source, source_ids)
        if len(records) != len(set(source_ids)):
            raise ValidationError(
                {"source_ids": "One or more source records were not found."}
            )

        created_entries = []
        existing_entries = []
        with transaction.atomic():
            for record in records:
                lookup = {
                    "user_id": request.user.user_profile,
                    "wed_spares_id": record["wed_spares_id"],
                    "obs_spare_id": record["obs_spare_id"],
                    "wed_routine_plan": record["wed_routine_plan"],
                    "wed_dart": record["wed_dart"],
                }
                defaults = {"spare_cart_name": self.workflow_name}
                if hasattr(self.queryset.model, "demand_qty"):
                    defaults["demand_qty"] = str(record["quantity"])
                entry, was_created = self.get_queryset().get_or_create(
                    **lookup,
                    defaults=defaults,
                )
                target = created_entries if was_created else existing_entries
                target.append(entry)

                if self.workflow_name == "Survey" and record["obs_spare_id"]:
                    self._flip_return_issue_to_wed_mo(record["obs_spare_id"])

        response_status = (
            status.HTTP_201_CREATED if created_entries else status.HTTP_200_OK
        )
        return Response(
            {
                "created": self.get_serializer(
                    created_entries,
                    many=True,
                ).data,
                "existing": self.get_serializer(
                    existing_entries,
                    many=True,
                ).data,
            },
            status=response_status,
        )

    def _flip_return_issue_to_wed_mo(self, obs_spare):
        from obs.models import Issue as ObsIssue
        from obs.models import Survey as ObsSurvey

        survey_entry = ObsSurvey.objects.filter(spare=obs_spare).order_by("-id").first()
        dart_number = survey_entry.dart_number if survey_entry else None
        return_issue = (
            ObsIssue.objects.filter(
                spare=obs_spare,
                dart_number=dart_number,
                is_return=True,
            )
            .order_by("-id")
            .first()
        )
        if return_issue:
            return_issue.is_wed_mo = True
            return_issue.is_deleted = True
            return_issue.save(update_fields=["is_wed_mo", "is_deleted"])

    def _resolve_cart_records(self, source, source_ids):
        if source == "planned":
            entries = models.PlannedWEDSpareList.objects.filter(
                pk__in=source_ids,
                is_deleted=False,
                planned_spares_description__is_deleted=False,
            ).select_related("planned_spares_description__wlms_spare_id")
            return [
                {
                    "wed_spares_id": (entry.planned_spares_description.wlms_spare_id),
                    "obs_spare_id": None,
                    "wed_routine_plan": (entry.planned_spares_description),
                    "wed_dart": None,
                    "quantity": entry.quantity_required,
                }
                for entry in entries
                if entry.planned_spares_description.wlms_spare_id
            ]
        if source == "dart":
            entries = models.DartWedSpare.objects.filter(
                pk__in=source_ids,
                is_delete=False,
            ).select_related("wed_spare")
            return [
                {
                    "wed_spares_id": entry.wed_spare,
                    "obs_spare_id": None,
                    "wed_routine_plan": None,
                    "wed_dart": entry,
                    "quantity": entry.quantity,
                }
                for entry in entries
                if entry.wed_spare
            ]

        from obs.models import Spares

        return [
            {
                "wed_spares_id": None,
                "obs_spare_id": spare,
                "wed_routine_plan": None,
                "wed_dart": None,
                "quantity": 1,
            }
            for spare in Spares.objects.filter(pk__in=source_ids)
        ]

    @action(detail=True, methods=["post"], url_path="send-for-approval")
    def send_for_approval(self, request, pk=None):
        entry = self.get_object()
        if entry.is_approval:
            raise ValidationError(
                {"detail": "Approved records cannot be submitted again."}
            )
        entry.is_hod = True
        update_fields = ["is_hod"]
        if hasattr(entry, "spare_cart_name"):
            entry.spare_cart_name = self.workflow_name
            update_fields.append("spare_cart_name")
        if self.status_field:
            setattr(entry, self.status_field, self.workflow_send_status)
            update_fields.append(self.status_field)
        entry.save(update_fields=update_fields)
        return Response(self.get_serializer(entry).data)

    @action(detail=False, methods=["post"], url_path="bulk-send-for-approval")
    def bulk_send_for_approval(self, request):
        ids = request.data.get("ids", request.data.get("pks", []))
        if not ids:
            raise ValidationError({"ids": "At least one record id is required."})
        queryset = self.filter_queryset(self.get_queryset()).filter(
            pk__in=ids, is_approval=False
        )
        update_kwargs = {"is_hod": True}
        if hasattr(self.queryset.model, "spare_cart_name"):
            update_kwargs["spare_cart_name"] = self.workflow_name
        if self.status_field:
            update_kwargs[self.status_field] = self.workflow_send_status
        updated = queryset.update(**update_kwargs)
        return Response({"success": True, "updated": updated})

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        entry = self.get_object()
        if not entry.is_hod:
            raise ValidationError({"detail": "Record must be submitted to HOD first."})
        entry.is_approval = True
        update_fields = ["is_approval"]
        if self.status_field:
            setattr(entry, self.status_field, "Approved")
            update_fields.append(self.status_field)
        entry.save(update_fields=update_fields)
        return Response(self.get_serializer(entry).data)

    @action(detail=False, methods=["post"], url_path="bulk-approve")
    def bulk_approve(self, request):
        ids = request.data.get("ids", request.data.get("pks", []))
        if not ids:
            raise ValidationError({"ids": "At least one record id is required."})
        queryset = self.filter_queryset(self.get_queryset()).filter(
            pk__in=ids,
            is_hod=True,
            is_approval=False,
        )
        update_kwargs = {"is_approval": True}
        if self.status_field:
            update_kwargs[self.status_field] = "Approved"
        updated = queryset.update(**update_kwargs)
        return Response({"success": True, "updated": updated})

    @action(detail=False, methods=["get"])
    def inbox(self, request):
        queryset = self.filter_queryset(self.get_queryset()).filter(
            is_hod=True,
            is_approval=False,
        )
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=["get"])
    def outbox(self, request):
        queryset = self.filter_queryset(self.get_queryset()).filter(
            is_hod=True,
            is_approval=True,
        )
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=True, methods=["post"], url_path="mark-synced")
    def mark_synced(self, request, pk=None):
        entry = self.get_object()
        if not entry.is_approval:
            raise ValidationError(
                {"detail": "HOD approval is required before marking it synced."}
            )
        entry.is_sync = True
        update_fields = ["is_sync"]
        if self.completion_field:
            setattr(entry, self.completion_field, True)
            update_fields.append(self.completion_field)
        if hasattr(entry, "sync_date"):
            entry.sync_date = timezone.now()
            update_fields.append("sync_date")
        if hasattr(entry, "sync_response"):
            entry.sync_response = True
            update_fields.append("sync_response")
        if self.mark_synced_sets_delete:
            entry.is_delete = True
            update_fields.append("is_delete")
        if self.status_field:
            setattr(entry, self.status_field, "Synced")
            update_fields.append(self.status_field)
        entry.save(update_fields=update_fields)
        return Response(self.get_serializer(entry).data)

    def _pending_annotated_entries(self, request, qty_field, extra_filter=None):
        pending = (
            self.get_queryset()
            .select_related(
                "wed_spares_id__eqpt",
                "obs_spare_id",
                "wed_routine_plan",
                "wed_dart__dart_id__equipment_ship",
            )
            .order_by("-id")
        )
        if self.status_field:
            pending = pending.exclude(**{self.status_field: "Approved"})

        allowed_equipment_class_ids = _scoped_equipment_class_ids(request)
        pending = pending.filter(
            Q(wed_routine_plan__isnull=False)
            | Q(wed_dart__isnull=False)
            | Q(obs_spare_id__equipment_class_id__in=allowed_equipment_class_ids)
        )
        pending = _department_scoped(pending, request)
        if extra_filter:
            pending = extra_filter(pending)

        return [
            _annotate_pending_wlms_entry(item, qty_field=qty_field) for item in pending
        ]

    def _serialize_pending(self, items):
        data = []
        for item in items:
            row = self.get_serializer(item).data
            for field in (
                "scrap_qty",
                "equipment_nomenclature",
                "dart_number",
                "dart_description",
                "equipment_class",
            ):
                row[field] = getattr(item, field, "-")
            data.append(row)
        return data
