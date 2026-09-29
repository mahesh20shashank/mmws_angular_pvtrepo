"""WLMS standalone `@api_view` endpoints: `send_wed_common_api`, `hod_approval`,
`sync_equipment_from_wed`, `sync_spares_from_wed`, `wlms_combined_outbox`. Not
ViewSets, so `wlms/urls.py` binds these with manual `path()`s alongside the router.

Split out of the former flat `wlms/views.py` (the wlms file-structure split, mirroring
the earlier `obs/views/` package split).
"""

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from accounts import rbac

from .. import models, serializers
from .base import _department_scoped, _routine_description_summary, _scoped_equipment_class_ids


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


def _sync_wlms_rows(
    request,
    model,
    completion_field,
    status_field,
    ids,
    delete_after_sync=False,
):
    queryset = _department_scoped(
        model.objects.filter(is_sync=False, is_approval=True),
        request,
    )
    if ids:
        queryset = queryset.filter(pk__in=ids)

    sync_date = timezone.now()
    with transaction.atomic():
        rows = list(queryset.select_for_update())
        for row in rows:
            if completion_field:
                setattr(row, completion_field, True)
            row.is_sync = True
            row.sync_date = sync_date
            setattr(row, status_field, "Synced")
            if hasattr(row, "sync_response"):
                row.sync_response = True
            if delete_after_sync:
                row.is_delete = True

        update_fields = ["is_sync", "sync_date", status_field]
        if completion_field:
            update_fields.insert(0, completion_field)
        if rows and hasattr(rows[0], "sync_response"):
            update_fields.append("sync_response")
        if delete_after_sync:
            update_fields.append("is_delete")
        if rows:
            model.objects.bulk_update(rows, update_fields)

    return rows


@extend_schema(
    summary="WED common API sync",
    description=(
        "Marks approved-but-unsynced Survey/PTS/Demand/IIF cart entries as synced. "
        "This is a local, department-scoped operation only — it does not call the "
        "external legacy WLMS_IP service, which is not reachable from this "
        "deployment."
    ),
    tags=["WLMS"],
)
@api_view(["POST"])
def send_wed_common_api(request):
    ids = _extract_sync_ids(request)
    synced = {
        "survey": _sync_wlms_rows(
            request,
            models.SurveyReceiptsDetails,
            "is_survey",
            "wlms_survey_status",
            ids,
        ),
        "pts": _sync_wlms_rows(
            request,
            models.PTSDemandDetails,
            "is_pts",
            "wlms_pts_status",
            ids,
        ),
        "demand": _sync_wlms_rows(
            request,
            models.DemandDetails,
            "is_demand",
            "wlms_demand_status",
            ids,
        ),
        "iif": _sync_wlms_rows(
            request,
            models.WEDIIF,
            None,
            "wlms_iif_status",
            ids,
            delete_after_sync=True,
        ),
    }
    total = sum(len(rows) for rows in synced.values())
    return Response(
        {
            "status": "success" if total else "warning",
            "message": (
                "Data processed successfully"
                if total
                else "No approved unsynced records found"
            ),
            "updated": total,
            "created": 0,
            "counts": {name: len(rows) for name, rows in synced.items()},
        }
    )


@extend_schema(
    summary="Generic single-record HOD approval",
    description=(
        "Approves a single Survey/PTS/Demand/IIF cart entry by id and cart "
        "type, matching the reference hod_approval endpoint."
    ),
    tags=["WLMS"],
)
@api_view(["POST"])
def hod_approval(request):
    cart_id = request.data.get("id") or request.data.get("pts_id")
    cart_name = request.data.get("cart_name")
    if not cart_id:
        return Response(
            {"status": "error", "message": "Record id is required."}, status=400
        )

    model_by_cart_name = {
        "Survey": models.SurveyReceiptsDetails,
        "PTS-Survey": models.SurveyReceiptsDetails,
        "Demand": models.DemandDetails,
        "PTS": models.PTSDemandDetails,
        "IIF": models.WEDIIF,
    }
    model = model_by_cart_name.get(cart_name)
    if model is None:
        return Response(
            {"status": "error", "message": f"Invalid cart type: {cart_name}"},
            status=400,
        )

    obj = model.objects.filter(pk=cart_id).first()
    if obj is None:
        return Response({"status": "error", "message": "Record not found"}, status=404)
    if not rbac.can_see_all_departments(request.user):
        own_department = rbac.department_of(request.user)
        obj_department_id = getattr(obj.user_id, "department_id", None)
        if own_department is None or obj_department_id != own_department.pk:
            return Response(
                {
                    "status": "error",
                    "message": "You may not approve another department's entry.",
                },
                status=403,
            )
    if obj.is_approval:
        return Response({"status": "warning", "message": "Already approved"})

    obj.is_approval = True
    obj.save(update_fields=["is_approval"])
    return Response(
        {"status": "success", "message": f"{cart_name} approved successfully"}
    )


@extend_schema(summary="Sync equipment from WED", tags=["WLMS"])
@api_view(["POST"])
def sync_equipment_from_wed(request):
    return Response(
        {
            "status": "warning",
            "message": "External WED equipment source is not configured.",
            "created": 0,
            "updated": 0,
        }
    )


@extend_schema(summary="Sync spares from WED", tags=["WLMS"])
@api_view(["POST"])
def sync_spares_from_wed(request):
    return Response(
        {
            "status": "warning",
            "message": "External WED spares source is not configured.",
            "created": 0,
            "updated": 0,
        }
    )


def _annotate_wlms_cart_entry(entry):
    from op_maintenance.models import DartSpare
    from obs.models import Issue as ObsIssue

    entry.dart_number = "—"
    entry.equipment_name = "—"
    entry.routine_description = "—"
    entry.equipment_nomenclature = "—"
    entry.quantity_required = "—"
    entry.item_serial_no = getattr(entry, "item_serial_no", "—")

    try:
        if entry.obs_spare_id_id:
            dart_spare = (
                DartSpare.objects.filter(spare_id=entry.obs_spare_id_id)
                .select_related("dart", "dart__equipment_ship")
                .order_by("-id")
                .first()
            )
            if dart_spare and dart_spare.dart:
                dart_obj = dart_spare.dart
                entry.dart_number = dart_obj.dart_number or "—"
                entry.routine_description = dart_obj.defective_discriptions or "—"
                entry.equipment_nomenclature = (
                    dart_obj.equipment_ship.nomenclature
                    if dart_obj.equipment_ship
                    else "—"
                )
            issue_obj = (
                ObsIssue.objects.filter(spare_id=entry.obs_spare_id_id)
                .order_by("-id")
                .first()
            )
            entry.quantity_required = issue_obj.quantity_issued if issue_obj else "—"
        elif entry.wed_dart_id and entry.wed_dart.dart_id:
            dart_obj = entry.wed_dart.dart_id
            entry.dart_number = dart_obj.dart_number or "—"
            entry.routine_description = dart_obj.defective_discriptions or "—"
            entry.equipment_nomenclature = (
                dart_obj.equipment_ship.nomenclature if dart_obj.equipment_ship else "—"
            )
            entry.quantity_required = entry.wed_dart.quantity
        elif entry.wed_routine_plan_id:
            planned_desc = entry.wed_routine_plan
            rd = _routine_description_summary(
                planned_desc.routine_description_id_id if planned_desc else None
            )
            if rd:
                entry.dart_number = rd.get("dart_number") or "—"
                entry.equipment_name = rd.get("equipment_name__extra") or "—"
                entry.routine_description = rd.get("routine_description") or "—"
                entry.equipment_nomenclature = rd.get("equipment_name__name") or "—"
                planned_spare = models.PlannedWEDSpareList.objects.filter(
                    planned_spares_description=planned_desc
                ).first()
                entry.quantity_required = (
                    planned_spare.quantity_required if planned_spare else "—"
                )
    except Exception:
        entry.dart_number = "—"
        entry.equipment_name = "—"
        entry.routine_description = "—"
        entry.equipment_nomenclature = "—"
        entry.quantity_required = "—"
        entry.item_serial_no = getattr(entry, "item_serial_no", "—")

    return entry


@extend_schema(
    summary="Combined WLMS outbox",
    description=(
        "Merges HOD-submitted Survey, Demand, PTS and IIF cart entries into a "
        "single annotated list, matching the reference wlms_outbox view."
    ),
    tags=["WLMS"],
)
@api_view(["GET"])
def wlms_combined_outbox(request):
    allowed_equipment_class_ids = _scoped_equipment_class_ids(request)

    def scoped(queryset):
        return queryset.filter(
            Q(wed_routine_plan__isnull=False)
            | Q(wed_dart__isnull=False)
            | Q(obs_spare_id__equipment_class_id__in=allowed_equipment_class_ids)
        )

    survey_qs = scoped(
        models.SurveyReceiptsDetails.objects.filter(is_hod=True)
        .select_related(
            "wed_spares_id",
            "obs_spare_id",
            "wed_routine_plan",
            "wed_dart__dart_id__equipment_ship",
        )
        .exclude(is_sync=True)
        .order_by("-id")
    )
    demand_qs = scoped(
        models.DemandDetails.objects.filter(is_save=True)
        .select_related(
            "wed_spares_id",
            "obs_spare_id",
            "wed_routine_plan",
            "wed_dart__dart_id__equipment_ship",
        )
        .exclude(is_sync=True)
        .order_by("-id")
    )
    pts_qs = scoped(
        models.PTSDemandDetails.objects.filter(is_save=True)
        .select_related(
            "wed_spares_id",
            "obs_spare_id",
            "wed_routine_plan",
            "wed_dart__dart_id__equipment_ship",
        )
        .exclude(is_sync=True)
        .order_by("-id")
    )
    iif_qs = (
        models.WEDIIF.objects.filter(is_hod=True, is_delete=False)
        .select_related("spare_id", "spare_id__equipment_class", "user_id")
        .exclude(is_sync=True)
        .order_by("-id")
    )

    survey_qs = _department_scoped(survey_qs, request)
    demand_qs = _department_scoped(demand_qs, request)
    pts_qs = _department_scoped(pts_qs, request)
    iif_qs = _department_scoped(iif_qs, request)

    survey_entries = list(survey_qs)
    demand_entries = list(demand_qs)
    pts_entries = list(pts_qs)
    iif_entries = list(iif_qs)

    for entry in survey_entries:
        entry.item_serial_no = "—"
        if entry.spare_cart_name == "Survey":
            survey_form = (
                models.SurveyFormsDetails.objects.filter(survey_rec_id=entry)
                .order_by("-id")
                .first()
            )
            if survey_form:
                serial_nos = [
                    value
                    for value in models.SurveyFormsItems.objects.filter(
                        survey_details_id=survey_form
                    ).values_list("item_serial_no", flat=True)
                    if value
                ]
                entry.item_serial_no = ", ".join(serial_nos) if serial_nos else "—"

    for entry in demand_entries:
        entry.item_serial_no = "—"
    for entry in pts_entries:
        entry.item_serial_no = "—"

    for entry in iif_entries:
        entry.spare_cart_name = "IIF"
        entry.item_serial_no = "—"
        entry.dart_number = "—"
        entry.routine_description = "—"
        entry.equipment_nomenclature = (
            entry.spare_id.equipment_class.name
            if entry.spare_id and entry.spare_id.equipment_class
            else "—"
        )
        entry.quantity_required = (
            entry.spare_id.quantity_authorised
            if entry.spare_id and entry.spare_id.quantity_authorised
            else "—"
        )

    survey_entries = [_annotate_wlms_cart_entry(entry) for entry in survey_entries]
    demand_entries = [_annotate_wlms_cart_entry(entry) for entry in demand_entries]
    pts_entries = [_annotate_wlms_cart_entry(entry) for entry in pts_entries]

    def serialize(entry, serializer_class):
        data = serializer_class(entry).data
        for extra_field in (
            "dart_number",
            "equipment_name",
            "routine_description",
            "equipment_nomenclature",
            "quantity_required",
            "item_serial_no",
            "spare_cart_name",
        ):
            data[extra_field] = getattr(entry, extra_field, "—")
        return data

    all_entries = (
        [
            serialize(entry, serializers.SurveyReceiptsDetailsSerializer)
            for entry in survey_entries
        ]
        + [
            serialize(entry, serializers.DemandDetailsSerializer)
            for entry in demand_entries
        ]
        + [
            serialize(entry, serializers.PTSDemandDetailsSerializer)
            for entry in pts_entries
        ]
        + [serialize(entry, serializers.WEDIIFSerializer) for entry in iif_entries]
    )

    return Response({"pts_entries": all_entries})
