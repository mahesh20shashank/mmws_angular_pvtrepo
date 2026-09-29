"""Shared ILMS viewset infrastructure and module-level helpers used across the other
`ilms/views/` submodules: `ILMSModelViewSet` (the common `ExcelImportExportMixin` +
`ModelViewSet` base every ILMS viewset inherits), `ApprovalWorkflowMixin` (the
Survey/PTS/Demand HOD-approval workflow shared by `workflow.py`'s viewsets), and the
scoping/annotation helpers (`_annotate_pending_ilms_entry`, `_scoped_equipment_class_ids`,
`_scoped_item_ids`, `_routine_description_summary`, `_request_user_profile`) those
viewsets and `sync.py`'s standalone views both depend on.
"""

from django.db import transaction
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts import rbac

from .. import models, serializers
from ..excel import ExcelImportExportMixin
from ..rbac_scope import (
    filter_by_custom_user_department,
    scoped_custom_user_department_id,
)
from ..utils import generate_ilms_reference


def _request_user_profile(request):
    profile = getattr(request.user, "user_profile", None)
    if profile is None:
        raise ValidationError(
            {"user_profile": "Authenticated user has no linked user profile."}
        )
    return profile


def _scoped_equipment_class_ids(request):
    from obs.models import EquipmentClass

    if rbac.can_see_all_departments(request.user):
        return EquipmentClass.objects.values_list("id", flat=True)

    department_id = scoped_custom_user_department_id(request)
    if department_id is None:
        return EquipmentClass.objects.none().values_list("id", flat=True)

    return EquipmentClass.objects.filter(
        spare_class__department_id=department_id
    ).values_list("id", flat=True)


def _scoped_item_ids(request):
    """Item ids (pks are `item_code` strings) referenced by Survey/PTS/Demand
    rows in the caller's own department — the "items relevant to my
    department's dashboard" set. Was previously called as `self._scoped_item_ids`
    from `ItemViewSet._mo_dashboard` and as a bare name from
    `DemandDetailsViewSet.receive_queue`, but was never actually defined
    anywhere, so both call sites crashed (NameError/AttributeError) the
    first time they were hit."""
    if rbac.can_see_all_departments(request.user):
        return models.Item.objects.values_list("item_code", flat=True)

    department_id = scoped_custom_user_department_id(request)
    if department_id is None:
        return models.Item.objects.none().values_list("item_code", flat=True)

    return (
        models.SurveyDetails.objects.filter(custom_user__department_id=department_id)
        .values_list("ilms_spare_id", flat=True)
        .union(
            models.PTSDetails.objects.filter(
                custom_user__department_id=department_id
            ).values_list("ilms_spare_id", flat=True),
            models.DemandDetails.objects.filter(
                custom_user__department_id=department_id
            ).values_list("ilms_spare_id", flat=True),
        )
    )


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
            "equipment_name__sfd_equipment_id",
        )
        .first()
    )


def _annotate_pending_ilms_entry(entry):
    """Attach dart_number/equipment_name/equipment_class/quantity_required
    display fields, matching the reference mo_survey/demand/pts list views.
    """
    entry.dart_number = "—"
    entry.equipment_name = "—"
    entry.equipment_nomenclature = "—"
    entry.dart_description = "—"
    entry.quantity_required = "—"
    entry.equipment_class = "—"

    try:
        if entry.mo_routine_plan_id:
            planned_desc = entry.mo_routine_plan
            rd = _routine_description_summary(planned_desc.routine_description_id_id)
            if rd:
                entry.dart_number = rd.get("dart_number") or "—"
                entry.dart_description = rd.get("routine_description") or "—"
                entry.equipment_nomenclature = rd.get("equipment_name__name") or "—"
                entry.equipment_name = rd.get("equipment_name__extra") or "—"
                sfd_eq_id = rd.get("equipment_name__sfd_equipment_id")
                if sfd_eq_id and planned_desc.item_id:
                    mo_map = (
                        models.MoMappingTable.objects.filter(
                            ilms_spare_id=planned_desc.item_id,
                            equipment_id=sfd_eq_id,
                        )
                        .select_related("equipment__equipment")
                        .first()
                    )
                    if mo_map and mo_map.equipment and mo_map.equipment.equipment:
                        entry.equipment_class = (
                            mo_map.equipment.equipment.equipment_class or "—"
                        )
            planned_spare = models.PlannedMOSpareList.objects.filter(
                planned_spares_description=planned_desc
            ).first()
            entry.quantity_required = (
                planned_spare.quantity_required if planned_spare else "—"
            )
            return entry

        if entry.mo_dart_id:
            dart_mo = entry.mo_dart
            if dart_mo.dart_id:
                entry.dart_number = dart_mo.dart_id.dart_number or "—"
                entry.dart_description = dart_mo.dart_id.defective_discriptions or "—"
                if dart_mo.dart_id.equipment_ems:
                    entry.equipment_nomenclature = (
                        dart_mo.dart_id.equipment_ems.name or "—"
                    )
                    entry.equipment_name = dart_mo.dart_id.equipment_ems.extra or "—"
            entry.quantity_required = dart_mo.quantity or "—"
            if dart_mo.equipment_id_id and entry.ilms_spare_id_id:
                mo_map = (
                    models.MoMappingTable.objects.filter(
                        ilms_spare_id=entry.ilms_spare_id,
                        equipment=dart_mo.equipment_id,
                    )
                    .select_related("equipment__equipment")
                    .first()
                )
                if mo_map and mo_map.equipment and mo_map.equipment.equipment:
                    entry.equipment_class = (
                        mo_map.equipment.equipment.equipment_class or "—"
                    )
            return entry

        if entry.obs_spare_id_id:
            from op_maintenance.models import DartSpare
            from obs.models import Demand as ObsDemand
            from obs.models import Survey as ObsSurvey

            dart_spare = (
                DartSpare.objects.filter(spare_id=entry.obs_spare_id_id)
                .select_related("dart")
                .order_by("-dart_id")
                .first()
            )
            if dart_spare and dart_spare.dart:
                entry.dart_number = dart_spare.dart.dart_number or "—"
                entry.dart_description = dart_spare.dart.defective_discriptions or "—"
                if dart_spare.dart.equipment_ems:
                    entry.equipment_nomenclature = (
                        dart_spare.dart.equipment_ems.name or "—"
                    )
                    entry.equipment_name = dart_spare.dart.equipment_ems.extra or "—"

            if entry.obs_spare_id.equipment_class:
                entry.equipment_class = entry.obs_spare_id.equipment_class.name or "—"

            survey_qty = (
                ObsSurvey.objects.filter(spare=entry.obs_spare_id)
                .order_by("-id")
                .first()
            )
            if survey_qty:
                entry.quantity_required = survey_qty.quantity_tosurvey
            else:
                demand_qty = (
                    ObsDemand.objects.filter(spare=entry.obs_spare_id)
                    .order_by("-id")
                    .first()
                )
                entry.quantity_required = (
                    demand_qty.quantity_todemand if demand_qty else "—"
                )
    except Exception:
        entry.dart_number = "—"
        entry.equipment_name = "—"
        entry.equipment_nomenclature = "—"
        entry.dart_description = "—"
        entry.quantity_required = "—"
        entry.equipment_class = "—"

    return entry


@extend_schema(tags=["ILMS"])
class ILMSModelViewSet(ExcelImportExportMixin, viewsets.ModelViewSet):
    pass


class ApprovalWorkflowMixin:
    workflow_name = ""
    completion_field = ""
    status_field = ""
    # The HOD-approval-time reference field/tag for this workflow (source's
    # `survey_cart_no`/"SVY", `pts_cart_no`/"PTS", `demand_cart_no`/"REP") — set on the
    # concrete ViewSets below. Left blank on any future subclass that has no such field,
    # in which case `send_for_approval`/`bulk_send_for_approval` simply skip numbering,
    # exactly as they did before this reference generation existed.
    reference_field = ""
    reference_tag = ""

    def get_queryset(self):
        # Every custom action below calls `self.get_queryset()` directly
        # rather than `self.filter_queryset(self.get_queryset())`, so
        # `filter_backends` (set on the concrete ViewSets) never fires for
        # them — this override applies the same department scoping at the
        # source instead, covering inbox/outbox/bulk-send/bulk-approve and
        # (with the redundant inline filter below removed) pending-list too.
        return filter_by_custom_user_department(super().get_queryset(), self.request)

    @action(detail=False, methods=["get"], url_path="pending-list")
    def pending_list(self, request):
        queryset = (
            self.get_queryset()
            .select_related(
                "ilms_spare_id",
                "obs_spare_id",
                "mo_dart__dart_id__equipment_ems",
                "mo_dart__equipment_id__equipment",
                "obs_spare_id__equipment_class",
                "mo_routine_plan__item_id",
            )
            .order_by("-id")
        )
        allowed_equipment_class_ids = _scoped_equipment_class_ids(request)
        queryset = queryset.filter(
            Q(mo_routine_plan__isnull=False)
            | Q(mo_dart__isnull=False)
            | Q(obs_spare_id__equipment_class_id__in=allowed_equipment_class_ids)
        )

        entries = [_annotate_pending_ilms_entry(entry) for entry in queryset]

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

    @action(detail=True, methods=["post"], url_path="send-for-approval")
    def send_for_approval(self, request, pk=None):
        if self.reference_field:
            with transaction.atomic():
                # `of=("self",)`: the concrete querysets here `select_related` several
                # nullable FKs (`obs_spare_id`, `vendor_id`, ...), which become LEFT OUTER
                # JOINs — Postgres refuses `SELECT ... FOR UPDATE` across the nullable
                # side of an outer join. Locking only this model's own rows (not the
                # joined-in related rows) is all this needs anyway.
                entry = (
                    self.get_queryset().select_for_update(of=("self",)).get(pk=pk)
                )
                if entry.is_hod_approval:
                    raise ValidationError(
                        {"detail": "Approved records cannot be submitted again."}
                    )
                if not getattr(entry, self.reference_field):
                    setattr(
                        entry,
                        self.reference_field,
                        generate_ilms_reference(
                            self.get_queryset().model,
                            self.reference_field,
                            self.reference_tag,
                            department=rbac.department_of(request.user),
                        ),
                    )
                entry.is_hod = True
                entry.in_progress_status = self.workflow_name
                update_fields = [self.reference_field, "is_hod", "in_progress_status"]
                if self.status_field:
                    setattr(entry, self.status_field, "Pending HOD Approval")
                    update_fields.append(self.status_field)
                entry.save(update_fields=update_fields)
            return Response(self.get_serializer(entry).data)

        entry = self.get_object()
        if entry.is_hod_approval:
            raise ValidationError(
                {"detail": "Approved records cannot be submitted again."}
            )
        entry.is_hod = True
        entry.in_progress_status = self.workflow_name
        update_fields = ["is_hod", "in_progress_status"]
        if self.status_field:
            setattr(entry, self.status_field, "Pending HOD Approval")
            update_fields.append(self.status_field)
        entry.save(update_fields=update_fields)
        return Response(self.get_serializer(entry).data)

    @action(detail=False, methods=["post"], url_path="bulk-send-for-approval")
    def bulk_send_for_approval(self, request):
        ids = request.data.get("ids", request.data.get("pks", []))
        if not ids:
            raise ValidationError({"ids": "At least one record id is required."})

        if self.reference_field:
            department = rbac.department_of(request.user)
            updated = 0
            with transaction.atomic():
                entries = (
                    self.get_queryset()
                    .select_for_update(of=("self",))
                    .filter(pk__in=ids, is_hod_approval=False)
                )
                for entry in entries:
                    if not getattr(entry, self.reference_field):
                        setattr(
                            entry,
                            self.reference_field,
                            generate_ilms_reference(
                                self.get_queryset().model,
                                self.reference_field,
                                self.reference_tag,
                                department=department,
                            ),
                        )
                    entry.is_hod = True
                    entry.in_progress_status = self.workflow_name
                    update_fields = [
                        self.reference_field,
                        "is_hod",
                        "in_progress_status",
                    ]
                    if self.status_field:
                        setattr(entry, self.status_field, "Pending HOD Approval")
                        update_fields.append(self.status_field)
                    entry.save(update_fields=update_fields)
                    updated += 1
            return Response({"success": True, "updated": updated})

        update_kwargs = {
            "is_hod": True,
            "in_progress_status": self.workflow_name,
        }
        if self.status_field:
            update_kwargs[self.status_field] = "Pending HOD Approval"
        updated = (
            self.get_queryset()
            .filter(
                pk__in=ids,
                is_hod_approval=False,
            )
            .update(**update_kwargs)
        )
        return Response({"success": True, "updated": updated})

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        entry = self.get_object()
        if not entry.is_hod:
            raise ValidationError(
                {"detail": "Record must be submitted to HOD before approval."}
            )
        entry.is_hod_approval = True
        entry.in_progress_status = "Approved"
        update_fields = ["is_hod_approval", "in_progress_status"]
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
        update_kwargs = {
            "is_hod_approval": True,
            "in_progress_status": "Approved",
        }
        if self.status_field:
            update_kwargs[self.status_field] = "Approved"
        updated = (
            self.get_queryset()
            .filter(
                pk__in=ids,
                is_hod=True,
                is_hod_approval=False,
            )
            .update(**update_kwargs)
        )
        return Response({"success": True, "updated": updated})

    @action(detail=False, methods=["get"])
    def inbox(self, request):
        queryset = self.get_queryset().filter(
            is_hod=True,
            is_hod_approval=False,
        )
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=["get"])
    def outbox(self, request):
        queryset = self.get_queryset().filter(
            is_hod=True,
            is_hod_approval=True,
        )
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        entry = self.get_object()
        if not entry.is_hod_approval:
            raise ValidationError(
                {"detail": "HOD approval is required before completion."}
            )
        setattr(entry, self.completion_field, True)
        entry.in_progress_status = "Completed"
        update_fields = [self.completion_field, "in_progress_status"]
        if self.status_field:
            setattr(entry, self.status_field, "Completed")
            update_fields.append(self.status_field)
        entry.save(update_fields=update_fields)
        return Response(self.get_serializer(entry).data)

    @action(detail=True, methods=["post"], url_path="mark-synced")
    def mark_synced(self, request, pk=None):
        entry = self.get_object()
        if not entry.is_hod_approval:
            raise ValidationError(
                {"detail": "HOD approval is required before marking it synced."}
            )
        setattr(entry, self.completion_field, True)
        entry.is_sync = True
        entry.in_progress_status = "Synced"
        update_fields = [self.completion_field, "is_sync", "in_progress_status"]
        if self.status_field:
            setattr(entry, self.status_field, "Synced")
            update_fields.append(self.status_field)
        entry.save(update_fields=update_fields)
        return Response(self.get_serializer(entry).data)

    def _resolve_cart_items(self, source, source_ids):
        if source == "planned":
            entries = models.PlannedMOSpareList.objects.filter(
                pk__in=source_ids,
                is_deleted=False,
            ).select_related("planned_spares_description__item_id")
            return [
                {
                    "ilms_spare_id": entry.planned_spares_description.item_id,
                    "obs_spare_id": None,
                    "mo_routine_plan": entry.planned_spares_description,
                    "mo_dart": None,
                }
                for entry in entries
                if entry.planned_spares_description.item_id
            ]
        if source == "dart":
            entries = models.DartMOSpare.objects.filter(
                pk__in=source_ids,
                is_delete=False,
            ).select_related("mo_spare")
            return [
                {
                    "ilms_spare_id": entry.mo_spare,
                    "obs_spare_id": None,
                    "mo_routine_plan": None,
                    "mo_dart": entry,
                }
                for entry in entries
                if entry.mo_spare
            ]

        from obs.models import Spares

        return [
            {
                "ilms_spare_id": None,
                "obs_spare_id": spare,
                "mo_routine_plan": None,
                "mo_dart": None,
            }
            for spare in Spares.objects.filter(pk__in=source_ids)
        ]

    def _flip_return_issue_to_wed_mo(self, obs_spare):
        from obs.models import Demand as ObsDemand
        from obs.models import Issue as ObsIssue
        from obs.models import Survey as ObsSurvey

        dart_number = None
        source_entry = (
            ObsDemand.objects.filter(spare=obs_spare).order_by("-id").first()
            if self.workflow_name == "Demand"
            else ObsSurvey.objects.filter(spare=obs_spare).order_by("-id").first()
        )
        if source_entry:
            dart_number = source_entry.dart_number
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

    @extend_schema(request=serializers.AddToWorkflowCartSerializer)
    @action(detail=False, methods=["post"], url_path="add-to-cart")
    def add_to_cart(self, request):
        serializer = serializers.AddToWorkflowCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        source = serializer.validated_data["source"]
        source_ids = serializer.validated_data["source_ids"]
        resolved_items = self._resolve_cart_items(source, source_ids)
        if len(resolved_items) != len(set(source_ids)):
            raise ValidationError(
                {"source_ids": "One or more source records were not found."}
            )

        created_entries = []
        with transaction.atomic():
            for item in resolved_items:
                lookup = {
                    "ilms_spare_id": item["ilms_spare_id"],
                    "obs_spare_id": item["obs_spare_id"],
                    "mo_routine_plan": item["mo_routine_plan"],
                    "mo_dart": item["mo_dart"],
                }
                entry, _ = self.get_queryset().get_or_create(
                    **lookup,
                    defaults={
                        "custom_user": _request_user_profile(request),
                        "in_progress_status": "Pending",
                    },
                )
                created_entries.append(entry)

                if (
                    source == "obs"
                    and self.workflow_name in {"PTS", "Demand"}
                    and item["obs_spare_id"]
                ):
                    self._flip_return_issue_to_wed_mo(item["obs_spare_id"])

        return Response(
            self.get_serializer(created_entries, many=True).data,
            status=status.HTTP_201_CREATED,
        )
