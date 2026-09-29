"""The standalone `@api_view` functions that aren't ViewSets: WLMS-to-ILMS sync
endpoints (`demand_data_send_ilms`, `pts_data_send_ilms`), HOD approval (`approve_pts`),
and the combined history/inbox/outbox reads (`ilms_history`, `ilms_combined_inbox`,
`ilms_combined_outbox`).
"""

from django.db import transaction
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts import rbac

from .. import models, serializers
from ..rbac_scope import (
    filter_by_custom_user_department,
    scoped_custom_user_department_id,
)
from .base import _annotate_pending_ilms_entry, _scoped_equipment_class_ids


def _normalize_ids(value):
    if value in (None, ""):
        return []
    if isinstance(value, (str, int)):
        return [value]
    return list(value)


def _extract_sync_ids(request):
    ids = _normalize_ids(request.data.get("ids") or request.data.get("pks"))
    items = request.data.get("items") or []
    for item in items:
        if isinstance(item, dict) and item.get("id"):
            ids.append(item["id"])
    return ids


def _sync_workflow_rows(
    request,
    model,
    serializer_class,
    completion_field,
    status_field,
    ids,
):
    queryset = model.objects.filter(is_sync=False)
    queryset = filter_by_custom_user_department(queryset, request)
    if ids:
        queryset = queryset.filter(pk__in=ids)
    else:
        queryset = queryset.filter(is_hod_approval=True)

    with transaction.atomic():
        rows = list(queryset.select_for_update())
        for row in rows:
            setattr(row, completion_field, True)
            row.is_sync = True
            row.in_progress_status = "Synced"
            setattr(row, status_field, "Synced")

        if rows:
            model.objects.bulk_update(
                rows,
                [completion_field, "is_sync", "in_progress_status", status_field],
            )

    return Response(
        {
            "status": "success" if rows else "warning",
            "message": (
                "Data processed successfully"
                if rows
                else "No approved unsynced records found"
            ),
            "updated": len(rows),
            "count": len(rows),
            "data": serializer_class(rows, many=True).data,
        }
    )


@extend_schema(
    summary="Demand data sync to ILMS",
    tags=["ILMS"],
)
@api_view(["POST"])
def demand_data_send_ilms(request):
    return _sync_workflow_rows(
        request,
        models.DemandDetails,
        serializers.DemandDetailsSerializer,
        "is_demand",
        "mo_status",
        _extract_sync_ids(request),
    )


@extend_schema(
    summary="PTS data sync to ILMS",
    tags=["ILMS"],
)
@api_view(["POST"])
def pts_data_send_ilms(request):
    return _sync_workflow_rows(
        request,
        models.PTSDetails,
        serializers.PTSDetailsSerializer,
        "is_pts",
        "mo_pts_status",
        _extract_sync_ids(request),
    )


def _request_user_department_id(request):
    profile = getattr(request.user, "user_profile", None)
    department_id = getattr(profile, "department_id", None)
    if department_id is None:
        department_id = getattr(request.user, "department_id", None)
    return department_id


@api_view(["POST"])
def approve_pts(request):
    pk = request.data.get("pts_id") or request.data.get("id") or request.data.get("pk")
    cart_type = request.data.get("cart_name") or request.data.get("cart_type") or "PTS"

    if not pk:
        raise ValidationError({"pts_id": "PTS ID is required."})

    model_map = {
        "PTS": models.PTSDetails,
        "Demand": models.DemandDetails,
        "Survey": models.SurveyDetails,
    }
    model = model_map.get(str(cart_type).strip())
    if model is None:
        raise ValidationError({"cart_name": f"Invalid cart type: {cart_type}"})

    obj = model.objects.filter(pk=pk).first()
    if obj is None:
        raise ValidationError({"pts_id": "Record not found."})

    if not rbac.can_see_all_departments(request.user):
        department_id = scoped_custom_user_department_id(request)
        obj_department_id = getattr(obj.custom_user, "department_id", None)
        if department_id is None or obj_department_id != department_id:
            return Response(
                {
                    "status": "error",
                    "message": "You may not approve another department's entry.",
                },
                status=403,
            )

    if obj.is_hod_approval:
        return Response({"status": "warning", "message": "Already approved"})

    obj.is_hod_approval = True
    obj.in_progress_status = "Approved"
    update_fields = ["is_hod_approval", "in_progress_status"]
    status_field = {
        models.PTSDetails: "mo_pts_status",
        models.DemandDetails: "mo_status",
        models.SurveyDetails: "mo_survey_status",
    }[model]
    setattr(obj, status_field, "Approved")
    update_fields.append(status_field)
    obj.save(update_fields=update_fields)

    return Response(
        {
            "status": "success",
            "message": f"{cart_type} approved successfully",
        }
    )


@extend_schema(
    summary="ILMS item issue/receive history",
    description=(
        "Real issue/receive records per item, backed by ItemIssued/"
        "IssuedDetails, replacing the raw Item list previously used here."
    ),
    tags=["ILMS"],
)
@api_view(["GET"])
def ilms_history(request):
    issued = models.ItemIssued.objects.select_related("customer", "item").order_by(
        "-id"
    )
    details = models.IssuedDetails.objects.select_related("item").order_by("-id")
    return Response(
        {
            "issued": serializers.ItemIssuedSerializer(issued, many=True).data,
            "issued_summary": serializers.IssuedDetailsSerializer(
                details, many=True
            ).data,
        }
    )


@extend_schema(
    summary="Combined ILMS inbox",
    description=(
        "Merges HOD-submitted PTS, Demand and Survey entries into a single "
        "annotated list, matching the reference ILMS Action/inbox view."
    ),
    tags=["ILMS"],
)
@api_view(["GET"])
def ilms_combined_inbox(request):
    allowed_equipment_class_ids = _scoped_equipment_class_ids(request)

    def scoped(queryset):
        return queryset.filter(
            Q(mo_routine_plan__isnull=False)
            | Q(mo_dart__isnull=False)
            | Q(obs_spare_id__equipment_class_id__in=allowed_equipment_class_ids)
        )

    pts_qs = scoped(
        models.PTSDetails.objects.filter(is_hod=True).select_related(
            "ilms_spare_id",
            "vendor_id",
            "obs_spare_id",
            "mo_routine_plan__item_id",
            "mo_dart__dart_id__equipment_ems",
        )
    ).order_by("-id")
    demand_qs = scoped(
        models.DemandDetails.objects.filter(is_hod=True).select_related(
            "ilms_spare_id",
            "vendor_id",
            "obs_spare_id",
            "mo_routine_plan__item_id",
            "mo_dart__dart_id__equipment_ems",
        )
    ).order_by("-id")
    survey_qs = scoped(
        models.SurveyDetails.objects.filter(is_hod=True).select_related(
            "ilms_spare_id",
            "obs_spare_id",
            "mo_routine_plan__item_id",
            "mo_dart__dart_id__equipment_ems",
        )
    ).order_by("-id")

    pts_qs = filter_by_custom_user_department(pts_qs, request)
    demand_qs = filter_by_custom_user_department(demand_qs, request)
    survey_qs = filter_by_custom_user_department(survey_qs, request)

    pts_entries = [_annotate_pending_ilms_entry(entry) for entry in pts_qs]
    demand_entries = [_annotate_pending_ilms_entry(entry) for entry in demand_qs]
    survey_entries = [_annotate_pending_ilms_entry(entry) for entry in survey_qs]

    def serialize(entry, serializer_class):
        data = serializer_class(entry).data
        for field in (
            "dart_number",
            "equipment_name",
            "equipment_nomenclature",
            "dart_description",
            "quantity_required",
            "equipment_class",
        ):
            data[field] = getattr(entry, field, "—")
        return data

    all_entries = (
        [serialize(entry, serializers.PTSDetailsSerializer) for entry in pts_entries]
        + [
            serialize(entry, serializers.DemandDetailsSerializer)
            for entry in demand_entries
        ]
        + [
            serialize(entry, serializers.SurveyDetailsSerializer)
            for entry in survey_entries
        ]
    )
    return Response({"pts_entries": all_entries})


@extend_schema(
    summary="Combined ILMS outbox",
    description=(
        "Merges HOD-approved PTS, Demand and Survey entries into a single "
        "annotated list, mirroring ilms_combined_inbox but scoped to "
        "already-approved (outbox) entries rather than pending ones."
    ),
    tags=["ILMS"],
)
@api_view(["GET"])
def ilms_combined_outbox(request):
    allowed_equipment_class_ids = _scoped_equipment_class_ids(request)

    def scoped(queryset):
        return queryset.filter(
            Q(mo_routine_plan__isnull=False)
            | Q(mo_dart__isnull=False)
            | Q(obs_spare_id__equipment_class_id__in=allowed_equipment_class_ids)
        )

    pts_qs = scoped(
        models.PTSDetails.objects.filter(
            is_hod=True, is_hod_approval=True
        ).select_related(
            "ilms_spare_id",
            "vendor_id",
            "obs_spare_id",
            "mo_routine_plan__item_id",
            "mo_dart__dart_id__equipment_ems",
        )
    ).order_by("-id")
    demand_qs = scoped(
        models.DemandDetails.objects.filter(
            is_hod=True, is_hod_approval=True
        ).select_related(
            "ilms_spare_id",
            "vendor_id",
            "obs_spare_id",
            "mo_routine_plan__item_id",
            "mo_dart__dart_id__equipment_ems",
        )
    ).order_by("-id")
    survey_qs = scoped(
        models.SurveyDetails.objects.filter(
            is_hod=True, is_hod_approval=True
        ).select_related(
            "ilms_spare_id",
            "obs_spare_id",
            "mo_routine_plan__item_id",
            "mo_dart__dart_id__equipment_ems",
        )
    ).order_by("-id")

    pts_qs = filter_by_custom_user_department(pts_qs, request)
    demand_qs = filter_by_custom_user_department(demand_qs, request)
    survey_qs = filter_by_custom_user_department(survey_qs, request)

    pts_entries = [_annotate_pending_ilms_entry(entry) for entry in pts_qs]
    demand_entries = [_annotate_pending_ilms_entry(entry) for entry in demand_qs]
    survey_entries = [_annotate_pending_ilms_entry(entry) for entry in survey_qs]

    def serialize(entry, serializer_class):
        data = serializer_class(entry).data
        for field in (
            "dart_number",
            "equipment_name",
            "equipment_nomenclature",
            "dart_description",
            "quantity_required",
            "equipment_class",
        ):
            data[field] = getattr(entry, field, "—")
        return data

    all_entries = (
        [serialize(entry, serializers.PTSDetailsSerializer) for entry in pts_entries]
        + [
            serialize(entry, serializers.DemandDetailsSerializer)
            for entry in demand_entries
        ]
        + [
            serialize(entry, serializers.SurveyDetailsSerializer)
            for entry in survey_entries
        ]
    )
    return Response({"pts_entries": all_entries})
