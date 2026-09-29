"""WLMS Issue-in-Fault (IIF) viewsets: `WEDIIFViewSet`, `WEDIIFDetailsViewSet`.

Split out of the former flat `wlms/views.py` (the wlms file-structure split, mirroring
the earlier `obs/views/` package split). Carries the `raise_iif` action (item 4 of the
wlms port-real-gaps plan) alongside the pre-existing `add_items` action.
"""

from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts import rbac

from .. import models, serializers
from ..utils import generate_sequence_number, tagged_viewset
from .base import ApprovalWorkflowMixin, WLMSModelViewSet


@tagged_viewset("WLMS")
class WEDIIFViewSet(ApprovalWorkflowMixin, WLMSModelViewSet):
    workflow_name = "IIF"
    completion_field = None
    status_field = "wlms_iif_status"
    workflow_send_status = "Sent for HOD Approval"
    mark_synced_sets_delete = True
    queryset = models.WEDIIF.objects.select_related("spare_id").all()
    serializer_class = serializers.WEDIIFSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "user_id__department_id"

    @extend_schema(request=serializers.AddToIIFCartSerializer)
    @action(detail=False, methods=["post"], url_path="add-items")
    def add_items(self, request):
        serializer = serializers.AddToIIFCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        spare_ids = serializer.validated_data["spare_ids"]
        requested_cart_type = serializer.validated_data.get("cart_type")

        from obs.models import Spares

        spares = list(Spares.objects.filter(pk__in=spare_ids))
        if len(spares) != len(set(spare_ids)):
            raise ValidationError(
                {"spare_ids": "One or more onboard spares were not found."}
            )

        created = []
        existing = []
        with transaction.atomic():
            for spare in spares:
                # Decide the actual iif_cart value from the spare's own category — never
                # trust the frontend flag alone. Mirrors source's `add_to_iif_cart`.
                # `QUASI_PERMANENT` is treated as permanent everywhere category drives
                # behaviour (see `obs.models.Spares`'s own note on that constant).
                if spare.category in (Spares.PERMANENT, Spares.QUASI_PERMANENT):
                    cart_value = (
                        requested_cart_type
                        if requested_cart_type in ("survey", "pts")
                        else "survey"
                    )
                else:
                    cart_value = "demand"

                entry, was_created = models.WEDIIF.objects.get_or_create(
                    spare_id=spare,
                    is_delete=False,
                    defaults={
                        "user_id": request.user.user_profile,
                        "is_sync": False,
                        "is_hod": False,
                        "is_approval": False,
                        "sync_response": False,
                        "iif_cart": cart_value,
                    },
                )
                if not was_created and entry.iif_cart != cart_value:
                    entry.iif_cart = cart_value
                    entry.save(update_fields=["iif_cart"])
                (created if was_created else existing).append(entry)
            self._flip_iif_issues_to_wed_mo(spares)

        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(
            {
                "created": self.get_serializer(created, many=True).data,
                "existing": self.get_serializer(existing, many=True).data,
            },
            status=response_status,
        )

    @extend_schema(request=serializers.RaiseIIFSerializer)
    @action(detail=False, methods=["post"], url_path="raise-iif")
    def raise_iif(self, request):
        """Create a WEDIIF + WEDIIFDetails pair for either an existing `obs.Spares` id or a
        free-form "other" spare not yet catalogued in `obs`. Mirrors source's
        `wlms_raise_iif` (WLMS/views.py:3125-3223), but generates `iif_no` with the target's
        real year-scoped, race-safe `generate_sequence_number` rather than source's weaker
        per-request `generate_iif_number`.
        """
        serializer = serializers.RaiseIIFSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        spare_id = data["spare_id"].strip()
        is_other = spare_id == "other"

        CATEGORY_MAP = {"PERMANENT": "P", "CONSUMABLE": "C", "QP": "QP"}

        details_extra = {}
        obs_spare = None
        if is_other:
            pattern_number = data.get("pattern_number", "").strip()
            description = data.get("description", "").strip()
            category_raw = data.get("category", "").strip()
            # Translate PERMANENT/CONSUMABLE -> P/C; QP (and anything already a raw
            # WEDIIFDetails category code) passes through unchanged.
            category = CATEGORY_MAP.get(category_raw, category_raw)

            if not pattern_number or not description or not category:
                raise ValidationError(
                    {
                        "detail": (
                            "Please fill OEM Part No, Item Desc and Category for a"
                            " new spare."
                        )
                    }
                )
            if category not in dict(models.WEDIIFDetails.CATEGORY_CHOICES):
                raise ValidationError({"category": "Invalid category."})

            denomination_obj = None
            denom_name = data.get("denomination", "").strip()
            if denom_name:
                from obs.models import Denomination

                try:
                    denomination_obj = Denomination.objects.get(
                        name__iexact=denom_name
                    )
                except Denomination.DoesNotExist:
                    raise ValidationError(
                        {
                            "denomination": (
                                f'Unknown denomination "{denom_name}". Please pick'
                                " an existing one."
                            )
                        }
                    )
                except Denomination.MultipleObjectsReturned:
                    denomination_obj = Denomination.objects.filter(
                        name__iexact=denom_name
                    ).first()

            details_extra = {
                "pattern_number": pattern_number,
                "description": description,
                "category": category,
                "denomination": denomination_obj,
            }
        else:
            from obs.models import Spares

            try:
                obs_spare = Spares.objects.get(pk=spare_id)
            except (Spares.DoesNotExist, ValueError):
                raise ValidationError({"spare_id": "Selected spare not found."})

        with transaction.atomic():
            wed_iif = models.WEDIIF.objects.create(
                user_id=request.user.user_profile,
                spare_id=obs_spare,
                wlms_iif_status="Pending",
            )
            iif_no = generate_sequence_number(
                models.WEDIIFDetails, "iif_no", "SWMM/IIF"
            )
            details = models.WEDIIFDetails.objects.create(
                wed_iif=wed_iif,
                iif_no=iif_no,
                comly_in_other_eqpt=data.get("comly_in_other_eqpt", ""),
                annual_req=data.get("annual_req", ""),
                phone_no=data.get("phone_no") or None,
                Specification=data.get("Specification", ""),
                address=data.get("address", ""),
                Qty_fitted_in_eqpt=data.get("Qty_fitted_in_eqpt", ""),
                proposed_MSL=data.get("proposed_MSL", ""),
                drawing_no=data.get("drawing_no", ""),
                poev_costing_rs=data.get("poev_costing_rs", ""),
                bq_amount_rs=data.get("bq_amount_rs", ""),
                ss_remarks=data.get("ss_remarks", ""),
                **details_extra,
            )

        return Response(
            {
                "wed_iif": self.get_serializer(wed_iif).data,
                "details": serializers.WEDIIFDetailsSerializer(details).data,
            },
            status=status.HTTP_201_CREATED,
        )

    def _flip_iif_issues_to_wed_mo(self, spares):
        from obs.models import Demand as ObsDemand
        from obs.models import Issue as ObsIssue
        from obs.models import Survey as ObsSurvey

        issue_ids = set(
            ObsDemand.objects.filter(
                spare__in=spares,
                is_iif=True,
                issue_entry__isnull=False,
            ).values_list("issue_entry_id", flat=True)
        ) | set(
            ObsSurvey.objects.filter(
                spare__in=spares,
                is_iif=True,
                issue_entry__isnull=False,
            ).values_list("issue_entry_id", flat=True)
        )
        if issue_ids:
            ObsIssue.objects.filter(pk__in=issue_ids).update(is_wed_mo=True)


@tagged_viewset("WLMS")
class WEDIIFDetailsViewSet(WLMSModelViewSet):
    queryset = models.WEDIIFDetails.objects.select_related("wed_iif").all()
    serializer_class = serializers.WEDIIFDetailsSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "wed_iif__user_id__department_id"

    def _get_or_create_for_wed_iif(self, wed_iif_pk):
        wed_iif = models.WEDIIF.objects.filter(
            pk=wed_iif_pk,
            is_delete=False,
        ).first()
        if wed_iif is None:
            raise ValidationError({"detail": "WED IIF record not found."})
        details, _created = models.WEDIIFDetails.objects.get_or_create(
            wed_iif=wed_iif,
            defaults={
                "iif_no": (f"SWMM/IIF/{timezone.now().year}/{wed_iif.pk:03d}"),
            },
        )
        return details

    def retrieve(self, request, *args, **kwargs):
        details = self._get_or_create_for_wed_iif(kwargs["pk"])
        return Response(self.get_serializer(details).data)

    def update(self, request, *args, **kwargs):
        details = self._get_or_create_for_wed_iif(kwargs["pk"])
        serializer = self.get_serializer(details, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)
