"""WLMS survey workflow viewsets: `SurveyReceiptsDetailsViewSet`,
`SurveyFormsDetailsViewSet`, `SurveyFormsItemsViewSet`.

Split out of the former flat `wlms/views.py` (the wlms file-structure split, mirroring
the earlier `obs/views/` package split).
"""

from django.db import transaction
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from weasyprint import HTML

from accounts import rbac

from .. import models, serializers
from ..utils import (
    generate_sequence_number,
    parse_pts_survey_cart_name,
    pts_survey_cart_name,
    resolve_cart_qty,
    tagged_viewset,
)
from .base import (
    ApprovalWorkflowMixin,
    WLMSModelViewSet,
    _base_cert_offset,
    _department_scoped,
    _expand_by_qty,
    _generate_qr_b64,
    _next_ref_seq,
    _zero_padded,
)


@tagged_viewset("WLMS")
class SurveyReceiptsDetailsViewSet(
    ApprovalWorkflowMixin,
    WLMSModelViewSet,
):
    workflow_name = "Survey"
    completion_field = "is_survey"
    status_field = "wlms_survey_status"
    queryset = models.SurveyReceiptsDetails.objects.all()
    serializer_class = serializers.SurveyReceiptsDetailsSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "user_id__department_id"

    @action(detail=False, methods=["post"], url_path="bulk-send-for-approval")
    def bulk_send_for_approval(self, request):
        ids = request.data.get("ids", request.data.get("pks", []))
        if not ids:
            raise ValidationError({"ids": "At least one record id is required."})
        # Only stamp spare_cart_name="Survey" where it's still empty, so
        # PTS-bridged rows (spare_cart_name="PTS:<id>") aren't clobbered.
        self.get_queryset().filter(pk__in=ids, spare_cart_name="").update(
            spare_cart_name="Survey",
            is_hod=True,
            wlms_survey_status=self.workflow_send_status,
        )
        updated = self.get_queryset().filter(pk__in=ids).update(is_hod=True)
        return Response({"success": True, "updated": updated})

    @action(detail=False, methods=["post"], url_path="bridge")
    def bridge(self, request):
        pts_id = request.data.get("pts_id")
        if not pts_id:
            raise ValidationError({"pts_id": "This field is required."})
        pts = models.PTSDemandDetails.objects.filter(pk=pts_id).first()
        if pts is None:
            raise ValidationError({"pts_id": "PTS record not found."})

        survey, _created = models.SurveyReceiptsDetails.objects.get_or_create(
            spare_cart_name=pts_survey_cart_name(pts_id),
            defaults={
                "user_id": pts.user_id,
                "wed_spares_id": pts.wed_spares_id,
                "obs_spare_id": pts.obs_spare_id,
                "wed_routine_plan": pts.wed_routine_plan,
                "wed_dart": pts.wed_dart,
            },
        )
        return Response(self.get_serializer(survey).data)

    @action(detail=False, methods=["post"], url_path="save")
    def save(self, request):
        survey_pks = request.data.get("survey_pks", [])
        if not survey_pks:
            raise ValidationError({"survey_pks": "At least one survey id is required."})

        with transaction.atomic():
            surveys = list(
                models.SurveyReceiptsDetails.objects.select_for_update().filter(
                    pk__in=survey_pks
                )
            )
            if not surveys:
                raise ValidationError({"survey_pks": "No matching surveys found."})

            models.SurveyFormsItems.objects.filter(
                survey_details_id__survey_rec_id__in=surveys
            ).delete()
            models.SurveyFormsDetails.objects.filter(survey_rec_id__in=surveys).delete()

            survey_no = request.data.get("survey_no") or generate_sequence_number(
                models.SurveyFormsDetails, "survey_no", "SWMM/SURVEY"
            )
            ss_remarks = request.data.get("ss_remarks", "")
            if ss_remarks == "Others":
                ss_remarks = request.data.get("other_remarks", "")

            form_entry = models.SurveyFormsDetails.objects.create(
                survey_rec_id=surveys[0],
                survey_no=survey_no,
                held_certificate_type=request.data.get("certificate_type", ""),
                held_certificate_no=request.data.get("held_cert_number", ""),
                held_certificate_date=request.data.get("held_cert_date") or None,
                ss_remarks=ss_remarks,
                scrap_qty=request.data.get("scrap_qty", ""),
                # `request.user` is a `CustomUser` (AUTH_USER_MODEL); this FK expects the
                # linked `CustomUserProfile`, not the raw auth user.
                created_by=request.user.user_profile,
            )
            if "certificate_upload" in request.FILES:
                form_entry.held_certificate = request.FILES["certificate_upload"]
                form_entry.save(update_fields=["held_certificate"])

            serial_numbers = request.data.get("serial_numbers", [])
            serial_idx = 0
            for survey in surveys:
                qty = resolve_cart_qty(survey, qty_field="demand_qty")
                try:
                    qty = int(qty)
                except (TypeError, ValueError):
                    qty = 1
                for _ in range(qty):
                    serial_no = (
                        serial_numbers[serial_idx]
                        if serial_idx < len(serial_numbers)
                        else ""
                    )
                    models.SurveyFormsItems.objects.create(
                        survey_details_id=form_entry,
                        wed_spares_id=survey.wed_spares_id,
                        item_serial_no=serial_no,
                    )
                    serial_idx += 1

                survey.is_save = True
                survey.save(update_fields=["is_save"])

                pts_id = parse_pts_survey_cart_name(survey.spare_cart_name)
                if pts_id:
                    models.PTSDemandDetails.objects.filter(pk=pts_id).update(
                        is_pts=True, survey_no=survey_no
                    )

        return Response({"status": "success", "survey_no": survey_no})

    @action(detail=False, methods=["get"], url_path="pending-list")
    def pending_list(self, request):
        items = self._pending_annotated_entries(request, qty_field=None)
        for item in items:
            survey_form = models.SurveyFormsDetails.objects.filter(
                survey_rec_id=item
            ).first()
            if survey_form and survey_form.scrap_qty:
                item.scrap_qty = survey_form.scrap_qty

        completed = (
            self.get_queryset()
            .filter(is_hod=True)
            .select_related("wed_spares_id__eqpt", "obs_spare_id")
            .order_by("-id")
        )
        completed = _department_scoped(completed, request)

        return Response(
            {
                "pending_surveys": self._serialize_pending(items),
                "completed_surveys": self.get_serializer(completed, many=True).data,
            }
        )

    @action(detail=False, methods=["get"], url_path="edps-pdf")
    def edps_pdf(self, request):
        pk_list = [
            pk.strip()
            for pk in request.query_params.get("survey_pks", "").split(",")
            if pk.strip()
        ]
        if not pk_list:
            return HttpResponse("No survey PKs supplied.", status=400)

        surveys = list(
            models.SurveyReceiptsDetails.objects.filter(pk__in=pk_list).select_related(
                "wed_spares_id__eqpt"
            )
        )
        if not surveys:
            return HttpResponse("No matching surveys found.", status=404)

        first_survey = surveys[0]
        form_entry = (
            models.SurveyFormsDetails.objects.filter(survey_rec_id=first_survey)
            .order_by("id")
            .first()
        )

        offset = _base_cert_offset()
        today_str = timezone.localdate().strftime("%d%m%Y")
        items = []

        if form_entry:
            item_rows = models.SurveyFormsItems.objects.filter(
                survey_details_id=form_entry
            ).select_related("wed_spares_id__eqpt")

            for idx, sfi in enumerate(item_rows, start=1):
                spare = sfi.wed_spares_id
                eqpt = getattr(spare, "eqpt", None) if spare else None

                qty = ""
                if spare:
                    qty = (
                        models.PlannedWEDSpareList.objects.filter(
                            planned_spares_description__wlms_spare_id=spare
                        )
                        .values_list("quantity_required", flat=True)
                        .first()
                    )
                    if not qty:
                        survey_receipt = models.SurveyReceiptsDetails.objects.filter(
                            wed_spares_id=spare
                        ).first()
                        if survey_receipt and survey_receipt.obs_spare_id:
                            from obs.models import Survey as ObsSurvey

                            survey_qty = (
                                ObsSurvey.objects.filter(
                                    spare=survey_receipt.obs_spare_id
                                )
                                .order_by("-id")
                                .first()
                            )
                            if survey_qty:
                                qty = survey_qty.quantity_tosurvey
                    if not qty:
                        dart_wed = (
                            models.DartWedSpare.objects.filter(wed_spare=spare)
                            .select_related("dart_id")
                            .first()
                        )
                        if dart_wed and dart_wed.quantity:
                            qty = dart_wed.quantity
                    qty = qty or ""

                items.append(
                    {
                        "ship_name": "INS KOCHI",
                        "survey_type": form_entry.held_certificate_type or "",
                        "from_field": "-",
                        "equipment_name": (
                            getattr(eqpt, "eqpt_name", "") if eqpt else ""
                        ),
                        "part_no": getattr(spare, "item_code", "") if spare else "",
                        "item_desc": getattr(spare, "item_desc", "") if spare else "",
                        "denomination": (
                            getattr(spare, "denom_id", "") if spare else ""
                        ),
                        "qty": 1,
                        "category": getattr(spare, "category", "") if spare else "",
                        "item_serial_no": sfi.item_serial_no or "",
                        "cert_seq": _zero_padded(offset + idx, 4),
                    }
                )
        else:
            global_idx = 1
            for survey in surveys:
                spare = survey.wed_spares_id
                eqpt = getattr(spare, "eqpt", None) if spare else None

                qty = ""
                if spare:
                    qty = (
                        models.PlannedWEDSpareList.objects.filter(
                            planned_spares_description__wlms_spare_id=spare,
                            is_deleted=False,
                        )
                        .values_list("quantity_required", flat=True)
                        .first()
                        or ""
                    )

                base_item = {
                    "ship_name": "INS KOCHI",
                    "survey_type": "",
                    "from_field": "",
                    "equipment_name": getattr(eqpt, "eqpt_name", "") if eqpt else "",
                    "part_no": getattr(spare, "item_code", "") if spare else "",
                    "item_desc": getattr(spare, "item_desc", "") if spare else "",
                    "denomination": getattr(spare, "denom_id", "") if spare else "",
                    "category": getattr(spare, "category", "") if spare else "",
                    "item_serial_no": (
                        getattr(spare, "wlms_inventory", "") if spare else ""
                    ),
                }
                expanded = _expand_by_qty(base_item, qty, offset, global_idx)
                items.extend(expanded)
                global_idx += len(expanded)

        hod_personal_no = request.query_params.get("hod_personal_no", "").strip()
        if not hod_personal_no:
            hod_personal_no = getattr(request.user, "personnel_number", "") or ""
        hod_qr_b64 = _generate_qr_b64(hod_personal_no) if hod_personal_no else ""

        context = {
            "items": items,
            "current_year": timezone.localdate().year,
            "ref_seq": _next_ref_seq(),
            "current_date": today_str,
            "form_entry": form_entry,
            "hod_personal_no": hod_personal_no,
            "hod_qr_b64": hod_qr_b64,
        }
        html_string = render_to_string("wlms_edps_survey.html", context)

        pdf = HTML(string=html_string).write_pdf()

        filename = f"EDPS3_ReturnNote_{timezone.localdate().strftime('%Y%m%d')}.pdf"
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


@tagged_viewset("WLMS")
class SurveyFormsDetailsViewSet(WLMSModelViewSet):
    queryset = models.SurveyFormsDetails.objects.all()
    serializer_class = serializers.SurveyFormsDetailsSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "survey_rec_id__user_id__department_id"

    @action(detail=True, methods=["post"], url_path="generate-number")
    def generate_number(self, request, pk=None):
        with transaction.atomic():
            form = self.get_queryset().select_for_update().get(pk=pk)
            survey = form.survey_rec_id
            if survey is None or not survey.is_approval:
                raise ValidationError(
                    {
                        "detail": (
                            "HOD approval is required before generating "
                            "a survey number."
                        )
                    }
                )
            if not form.survey_no:
                form.survey_no = f"SWMM/SURVEY/{timezone.now().year}/{form.pk:03d}"
                form.save(update_fields=["survey_no"])
            if not survey.is_survey:
                survey.is_survey = True
                survey.save(update_fields=["is_survey"])
        return Response(self.get_serializer(form).data)


@tagged_viewset("WLMS")
class SurveyFormsItemsViewSet(WLMSModelViewSet):
    queryset = models.SurveyFormsItems.objects.all()
    serializer_class = serializers.SurveyFormsItemsSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "survey_details_id__survey_rec_id__user_id__department_id"
