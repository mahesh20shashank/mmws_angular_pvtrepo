"""HTTP layer for the In/Out Tag API.

This app is a straight port of the legacy server-rendered ``InOutTag`` Django
app to DRF. Every endpoint below maps 1:1 onto a legacy view:

===========================================  ================================
Legacy view (server-rendered)                This module
===========================================  ================================
``inouthome``           GET ``/``            :class:`DashboardView`
``history``             ``/history/``        :class:`HistoryAPIView`
``tagoutlist``          ``/tagoutlist/``     ``TagOutViewSet.list`` (default)
``history`` (full list)                      ``TagOutViewSet.list?include_closed=true``
``get_tagout_details``                       ``TagOutViewSet.retrieve``
``addtagout`` (GET)                          ``TagOutViewSet.form_meta``
``addtagout`` (POST)                         ``TagOutViewSet.create``
``approvetagot``                             ``TagOutViewSet.approval_list`` + ``approve``
``print_tagout_slip``                        ``TagOutViewSet.print_slip``
``tag_in``              ``/tag_in``          ``TagInViewSet.list``
``add_tagin`` (GET)                          ``TagInViewSet.form_meta``
``add_tagin`` (POST)                         ``TagInViewSet.create``
``get_tagin_details``                        ``TagInViewSet.retrieve``
``approvetagin``                             ``TagInViewSet.approval_list`` + ``approve``
``officer_approval`` / ``eng_officer_approval``  (dropped - they only
                                             ``render()``-ed an empty template)
===========================================  ================================

Role / department rules (identical to the legacy views)
------------------------------------------------------
* **List a Tag Out** - privileged roles (CO / Ship Admin / Command) see the
  whole ship; an HOD or Dy HOD sees their department's tag-outs; everyone else
  sees only what they raised.
* **List a Tag In** - privileged roles see all; only an exact *Head of
  Department* (not Dy HOD) sees their department's set; everyone else sees only
  what they raised.
* **Approve a Tag Out** - the owning department's HOD or Dy HOD (legacy
  ``approvetagot`` allowed both).
* **File a Tag In** - only the person who raised the parent Tag Out.
* **Approve a Tag In** - the HOD of each affected department signs off their
  own :class:`~inout_tag.models.TagInApproval` row; when every row is in,
  :meth:`~inout_tag.models.TagIn.check_all_approvals` rolls it up.

All role checks go through :mod:`users.rbac` so this app stays consistent with
the rest of SWMM. ``_is_hod`` / ``_is_hod_or_dyhod`` below are thin, readable
wrappers over it.
"""

from datetime import timedelta

from django.db import transaction
from django.db.models import Count, F, Q
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from weasyprint import HTML

from master.models import Department
from master.utils import get_this_ship
from sfd.models import ShipEquipment
from accounts import rbac
from accounts.models import AUTH_SOURCE_HRCDF, CustomUserProfile

from .excel import ExcelImportExportMixin
from .models import (
    TagIn,
    TagInApproval,
    TagOut,
    TagOutReasonChoices,
)
from .serializers import (
    HistorySerializer,
    TagInApprovalActionSerializer,
    TagInSerializer,
    TagOutApprovalActionSerializer,
    TagOutSerializer,
)

# Shown to a caller whose account has no CustomUserProfile - nothing in this
# app can run without one (it needs the person's department).
User404 = "User profile not found. Contact administrator."

# The legacy PDF slip template. It lives at
# ``inout_tag/templates/inout_tag/tagout_slip_pdf.html``; with ``APP_DIRS`` the
# loader name is prefixed by the app folder. (Passing the bare filename - as the
# first port did - raises TemplateDoesNotExist.)
TAGOUT_SLIP_TEMPLATE = "inout_tag/tagout_slip_pdf.html"


# ---------------------------------------------------------------------------
# Role helpers - one wrapper each over users.rbac so intent reads clearly
# ---------------------------------------------------------------------------
def _is_hod(user):
    """Exact *Head of Department* (not Dy HOD). Legacy ``tag_in`` /
    ``approvetagin`` used this strict check."""
    return rbac.role_name_of(user) == rbac.ROLE_HOD


def _is_hod_or_dyhod(user):
    """*Head of Department* or *Dy HOD*, treated alike. Legacy called this flag
    ``is_dyhod`` and used it for tag-out list scoping and ``approvetagot``."""
    return rbac.is_hod_role(user)


def _profile_of(request):
    return getattr(request.user, "user_profile", None)


def _ship_equipment_options():
    """``[{"id", "nomenclature"}]`` for every ShipEquipment, ordered by name -
    the option list the legacy ``addtagout`` template rendered into a
    ``<select>``."""
    return [
        {"id": equipment.id, "nomenclature": equipment.nomenclature}
        for equipment in ShipEquipment.objects.order_by("nomenclature")
    ]


# TagOut fields that only matter for one ``tagout_reason``. The legacy
# ``addtagout`` view assigned exactly the block matching the submitted reason
# and never touched the others (they stayed NULL). ``perform_create`` reproduces
# that so a client cannot smuggle e.g. ``repair_ra_number`` onto a
# ``ty_loan_rtlapp`` tag-out.
_REASON_ONLY_FIELDS = {
    "ty_loan_rtlapp": [
        "ty_loan_ship",
        "ty_authority",
        "ty_item_taken_by",
        "ty_additional_items",
    ],
    "survey_and_demand": ["survery_demand_authority"],
    "repair_or_overhauling": [
        "repair_ra_number",
        "repair_landed_details",
        "repair_item_taken_by",
        "repair_additional_items",
    ],
    "aber_replacement": [
        "aber_authority",
        "replacement_item",
        "estimated_bom_arrival_date",
    ],
}
_ALL_REASON_FIELDS = {
    field for fields in _REASON_ONLY_FIELDS.values() for field in fields
}


# ---------------------------------------------------------------------------
# Object-level permissions
# ---------------------------------------------------------------------------
class TagOutDepartmentObjectPermission(BasePermission):
    """Row-level guard for the non-list Tag Out actions (retrieve / approve /
    print_slip).

    Note this is deliberately *stricter than the legacy app*: legacy
    ``get_tagout_details`` fetched any active row by id with no scoping at all.
    Here a caller may reach a Tag Out only if they are a privileged role, the
    person who raised it, in its owning department, or in one of its affected
    departments. ``approve`` / ``print_slip`` then apply their own extra checks
    on top.
    """

    def has_object_permission(self, request, view, obj):
        profile = _profile_of(request)
        if profile is None:
            return False
        if rbac.can_see_all_departments(request.user):
            return True
        if obj.created_by_id == profile.id:
            return True
        own_department_id = profile.department_id
        if own_department_id is None:
            return False
        if obj.user_profile_id and obj.user_profile.department_id == own_department_id:
            return True
        return obj.departments_affected.filter(pk=own_department_id).exists()


class TagInDepartmentObjectPermission(BasePermission):
    """Row-level guard for Tag In retrieve - same rule as
    :class:`TagOutDepartmentObjectPermission`, evaluated against the parent
    Tag Out's departments."""

    def has_object_permission(self, request, view, obj):
        profile = _profile_of(request)
        if profile is None:
            return False
        if rbac.can_see_all_departments(request.user):
            return True
        if obj.created_by_id == profile.id:
            return True
        own_department_id = profile.department_id
        if own_department_id is None:
            return False
        tagout = obj.tagout
        if tagout is None:
            return False
        if (
            tagout.user_profile_id
            and tagout.user_profile.department_id == own_department_id
        ):
            return True
        return tagout.departments_affected.filter(pk=own_department_id).exists()


# ---------------------------------------------------------------------------
# Dashboard  (legacy ``inouthome``)
# ---------------------------------------------------------------------------
@extend_schema(tags=["InOut Tag"])
class DashboardView(APIView):
    """``GET /dashboard/`` - the KPI/history payload behind the In/Out Tag
    landing page (data only, no page shell).

    Returns, all scoped to what the caller may see (same rules as the list
    endpoints):

    * ``weekly_*`` / ``today_*`` tag-out & tag-in counts
    * ``tagout_pending_approval_count`` - tag-outs still ``in_progress``
    * ``tagout_yet_to_tagin_count`` - approved tag-outs with no active Tag In
    * ``tagin_pending_by_department`` - open :class:`TagInApproval` rows for the
      caller's own department, grouped by department name
    * ``history_data`` - a 7-day tag-out/tag-in series for the bar chart
    * ``pending_user_registrations_count`` - profiles awaiting a role (legacy
      key was ``count``)
    """

    def get(self, request):
        tagouts = TagOut.objects.active()
        tagins = TagIn.objects.active()

        profile = _profile_of(request)
        if profile is None:
            tagouts = TagOut.objects.none()
            tagins = TagIn.objects.none()
        elif rbac.can_see_all_departments(request.user):
            pass  # ship-wide
        else:
            # Tag Outs: HOD / Dy HOD -> whole department; anyone else -> own.
            if _is_hod_or_dyhod(request.user) and profile.department_id:
                tagouts = tagouts.filter(
                    user_profile__department_id=profile.department_id
                )
            else:
                tagouts = tagouts.filter(created_by=profile)

            # Tag Ins: exact HOD -> department-affected or own; anyone else -> own.
            if _is_hod(request.user) and profile.department_id:
                tagins = tagins.filter(
                    Q(tagout__departments_affected=profile.department_id)
                    | Q(created_by=profile)
                ).distinct()
            else:
                tagins = tagins.filter(created_by=profile)

        today = timezone.localdate()
        start_of_week = today - timedelta(days=6)  # inclusive 7-day window

        weekly_tagout_count = tagouts.filter(
            date__gte=start_of_week, date__lte=today
        ).count()
        weekly_tagin_count = tagins.filter(
            tagin_date__gte=start_of_week, tagin_date__lte=today
        ).count()
        today_tagout_count = tagouts.filter(date=today).count()
        today_tagin_count = tagins.filter(tagin_date=today).count()

        tagout_pending_approval_count = tagouts.filter(
            approval_status="in_progress"
        ).count()
        tagout_yet_to_tagin_count = (
            tagouts.filter(approval_status="approved").exclude(tagin__active=1).count()
        )

        # "Waiting for Tag In approval" - only ever the caller's own department
        # (legacy behaviour; a privileged user with no department sees none).
        if profile is not None and profile.department_id:
            tagin_pending_qs = TagInApproval.objects.filter(
                active=1, approval_status="pending", department_id=profile.department_id
            )
        else:
            tagin_pending_qs = TagInApproval.objects.none()

        tagin_pending_by_department = list(
            tagin_pending_qs.values("department__name")
            .annotate(department_name=F("department__name"), count=Count("id"))
            .values("department_name", "count")
            .order_by("department_name")
        )

        history_data = []
        for offset in range(6, -1, -1):  # oldest first
            day = today - timedelta(days=offset)
            history_data.append(
                {
                    "date": day.strftime("%Y-%m-%d"),
                    "tag_out": tagouts.filter(date=day).count(),
                    "tag_in": tagins.filter(tagin_date=day).count(),
                }
            )

        # Developed with Understanding: HRCDF-synced rows with no credentials are crew,
        # not pending registrations (D3, OQ13).
        pending_user_registrations_count = (
            CustomUserProfile.objects.filter(is_role=False)
            .exclude(auth_source=AUTH_SOURCE_HRCDF, has_credentials=False)
            .count()
        )

        return Response(
            {
                "weekly_tagout_count": weekly_tagout_count,
                "weekly_tagin_count": weekly_tagin_count,
                "today_tagout_count": today_tagout_count,
                "today_tagin_count": today_tagin_count,
                "tagout_pending_approval_count": tagout_pending_approval_count,
                "tagout_yet_to_tagin_count": tagout_yet_to_tagin_count,
                "tagin_pending_by_department": tagin_pending_by_department,
                "history_data": history_data,
                "today_date": today.strftime("%Y-%m-%d"),
                "pending_user_registrations_count": pending_user_registrations_count,
            }
        )


# ---------------------------------------------------------------------------
# TagOut
# ---------------------------------------------------------------------------
@extend_schema(tags=["InOut Tag"])
class TagOutViewSet(ExcelImportExportMixin, viewsets.ModelViewSet):
    """Tag Out CRUD-subset + workflow actions.

    * ``list`` - legacy ``tagoutlist``: in-flight tag-outs only (those already
      tagged back in *and* approved are dropped), scoped by role/department,
      with ``from_date`` / ``to_date`` / ``department`` query filters. Pass
      ``?include_closed=true`` for the full set (legacy ``history``).
    * ``retrieve`` - legacy ``get_tagout_details`` (row guard added, see
      :class:`TagOutDepartmentObjectPermission`).
    * ``create`` - legacy ``addtagout`` POST branch.
    * ``form_meta`` / ``ship_equipments`` - legacy ``addtagout`` GET branch
      (the dropdown option lists).
    * ``approval_list`` + ``approve`` - legacy ``approvetagot``.
    * ``print_slip`` - legacy ``print_tagout_slip`` (PDF).
    * ``export-excel`` / ``download-template`` / ``import-excel`` - from
      :class:`~inout_tag.excel.ExcelImportExportMixin`; import rows go through
      :meth:`perform_create` so the same validation and department rules apply.
    """

    serializer_class = TagOutSerializer
    http_method_names = ("get", "post", "head", "options")
    permission_classes = [IsAuthenticated, TagOutDepartmentObjectPermission]

    # Actions that return a *list* of tag-outs and so want the same
    # role/department scoping as ``list``.
    _LIST_ACTIONS = {"list", "export_excel"}

    def get_queryset(self):
        base = TagOut.objects.active().with_related()

        if self.action not in self._LIST_ACTIONS:
            # retrieve / approve / print_slip: row visibility is enforced by
            # TagOutDepartmentObjectPermission, not here. import_excel /
            # download_template only use ``.model`` off this queryset.
            return base

        request = self.request
        profile = _profile_of(request)
        if profile is None:
            return base.none()

        include_closed = request.query_params.get("include_closed", "").lower() in (
            "1",
            "true",
            "yes",
        )
        qs = base if include_closed else base.in_flight()

        # Role / department scoping (legacy ``tagoutlist``).
        if rbac.can_see_all_departments(request.user):
            pass
        elif _is_hod_or_dyhod(request.user) and profile.department_id:
            qs = qs.for_department(profile.department_id)
        else:
            qs = qs.for_creator(profile)

        qs = qs.date_between(
            request.query_params.get("from_date"),
            request.query_params.get("to_date"),
        )
        department = request.query_params.get("department")
        if department:
            qs = qs.filter(departments_affected__id=department)

        return qs.distinct()

    def perform_create(self, serializer):
        """Legacy ``addtagout`` POST branch.

        * The caller must have a profile with a department.
        * Only the reason-only fields matching ``tagout_reason`` are kept
          (see ``_REASON_ONLY_FIELDS``); the rest are dropped.
        * The caller's own department is force-added to
          ``departments_affected`` even if they did not tick it.
        * ``user_profile`` / ``created_by`` are the caller; ``tagout_number`` is
          minted once, inside the same transaction as the M2M write.
        """
        profile = _profile_of(self.request)
        if profile is None:
            raise ValidationError(User404)
        department = getattr(profile, "department", None)
        if department is None:
            raise ValidationError(
                "Your account has no department assigned. Contact administrator."
            )

        reason = serializer.validated_data.get("tagout_reason")
        keep = set(_REASON_ONLY_FIELDS.get(reason, []))
        for field in _ALL_REASON_FIELDS - keep:
            serializer.validated_data.pop(field, None)

        departments_affected = serializer.validated_data.pop("departments_affected", [])
        dept_ids = {d.id for d in departments_affected}
        dept_ids.add(department.id)

        with transaction.atomic():
            tagout = serializer.save(
                user_profile=profile,
                created_by=profile,
            )
            tagout.departments_affected.set(Department.objects.filter(id__in=dept_ids))

    @action(detail=False, methods=["get"], url_path="form_meta")
    def form_meta(self, request):
        """Dropdown option lists for the "Add Tag Out" form (legacy
        ``addtagout`` GET context): the active ship, selectable departments
        (ADMIN / NBCD / EXECUTIVE / COMMUNICATION excluded, as in legacy), the
        equipment list, and the tag-out reason choices."""
        ship = get_this_ship()
        departments = (
            Department.objects.filter(active=1)
            .exclude(name__in=["ADMIN", "NBCD", "EXECUTIVE", "COMMUNICATION"])
            .order_by("name")
        )
        return Response(
            {
                "ships": [{"id": ship.id, "name": ship.name}] if ship else [],
                "departments": [{"id": d.id, "name": d.name} for d in departments],
                "ship_equipments": _ship_equipment_options(),
                "tagout_reason_choices": [
                    {"value": value, "label": label}
                    for value, label in TagOutReasonChoices.choices
                ],
            }
        )

    @action(detail=False, methods=["get"], url_path="ship_equipments")
    def ship_equipments(self, request):
        """Just the equipment option list (for lazy-loading the ``<select>``)."""
        return Response({"ship_equipments": _ship_equipment_options()})

    @action(detail=False, methods=["get"], url_path="approval_list")
    def approval_list(self, request):
        """Legacy ``approvetagot`` pending list: Tag Outs still ``in_progress``.

        An HOD / Dy HOD sees their own department's; a privileged role sees the
        whole ship. Anyone else gets 403.
        """
        profile = _profile_of(request)
        if profile is None:
            raise ValidationError(User404)

        privileged = rbac.can_see_all_departments(request.user)
        if not privileged and not _is_hod_or_dyhod(request.user):
            raise PermissionDenied(
                "Only a Head of Department, Dy HOD or a command role may view "
                "the Tag Out approval list."
            )

        qs = TagOut.objects.active().with_related().pending_approval()
        if not privileged:
            qs = qs.for_department(profile.department_id)
        qs = qs.order_by("-created_on").distinct()

        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(
                self.get_serializer(page, many=True).data
            )
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Legacy ``approvetagot`` POST branch: the owning department's HOD or
        Dy HOD approves / rejects. Body: ``{"action": "approve" | "reject"}``.
        Stamps ``approved_by`` / ``approved_on``.
        """
        tagout = self.get_object()
        body = TagOutApprovalActionSerializer(data=request.data)
        body.is_valid(raise_exception=True)

        profile = _profile_of(request)
        if profile is None:
            raise ValidationError(User404)

        owning_department_id = (
            tagout.user_profile.department_id if tagout.user_profile_id else None
        )
        same_department = (
            owning_department_id is not None
            and profile.department_id == owning_department_id
        )
        if not (
            rbac.can_see_all_departments(request.user)
            or (_is_hod_or_dyhod(request.user) and same_department)
        ):
            raise PermissionDenied(
                "Only the owning department's HOD or Dy HOD may approve this Tag Out."
            )

        tagout.approval_status = (
            "approved" if body.validated_data["action"] == "approve" else "rejected"
        )
        tagout.approved_by = profile
        tagout.approved_on = timezone.now()
        tagout.save()

        return Response(TagOutSerializer(tagout).data)

    @action(detail=True, methods=["get"], url_path="print_slip")
    def print_slip(self, request, pk=None):
        """Legacy ``print_tagout_slip``: render the two-sided DANGER/WARNING
        tag as a PDF (WeasyPrint).

        Only an *approved* tag-out prints, and - matching the legacy view,
        which was stricter than plain retrieve - only its creator, an HOD /
        Dy HOD of the owning department, or a privileged role may print it.
        """
        tagout = self.get_object()
        profile = _profile_of(request)

        owning_department_id = (
            tagout.user_profile.department_id if tagout.user_profile_id else None
        )
        may_print = profile is not None and (
            tagout.created_by_id == profile.id
            or rbac.can_see_all_departments(request.user)
            or (
                _is_hod_or_dyhod(request.user)
                and owning_department_id is not None
                and profile.department_id == owning_department_id
            )
        )
        if not may_print:
            raise PermissionDenied("You may not print this Tag Out.")

        if tagout.approval_status != "approved":
            raise ValidationError("Only approved tagouts can be printed.")

        if tagout.type == "danger":
            bg_color, border_color, text_color, tag_type = (
                "#ff0000",
                "#8b0000",
                "#000000",
                "DANGER",
            )
        else:
            bg_color, border_color, text_color, tag_type = (
                "#FFDE21",
                "#BA8E23",
                "#000000",
                "WARNING",
            )

        html_string = render_to_string(
            TAGOUT_SLIP_TEMPLATE,
            {
                "tagout": tagout,
                "tag_type": tag_type,
                "bg_color": bg_color,
                "border_color": border_color,
                "text_color": text_color,
            },
        )
        pdf = HTML(string=html_string).write_pdf()

        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'inline; filename="tagout_slip_{tagout.tagout_number}.pdf"'
        )
        return response


# ---------------------------------------------------------------------------
# TagIn
# ---------------------------------------------------------------------------
@extend_schema(tags=["InOut Tag"])
class TagInViewSet(ExcelImportExportMixin, viewsets.ModelViewSet):
    """Tag In CRUD-subset + workflow actions.

    * ``list`` - legacy ``tag_in``: scoped so an exact *Head of Department*
      (not Dy HOD) sees Tag Ins their department must sign off on plus their
      own; privileged roles see all; everyone else sees only their own. Same
      ``from_date`` / ``to_date`` / ``department`` filters.
    * ``retrieve`` - legacy ``get_tagin_details``.
    * ``create`` - legacy ``add_tagin`` POST branch. Filing a Tag In fans out
      one :class:`~inout_tag.models.TagInApproval` per affected department.
    * ``form_meta`` - legacy ``add_tagin`` GET branch: the caller's own
      approved tag-outs that have no Tag In yet.
    * ``approval_list`` + ``approve`` - legacy ``approvetagin``: one
      per-department sign-off at a time.
    * ``export-excel`` / ``download-template`` / ``import-excel`` - see
      :class:`~inout_tag.excel.ExcelImportExportMixin`.
    """

    serializer_class = TagInSerializer
    http_method_names = ("get", "post", "head", "options")
    permission_classes = [IsAuthenticated, TagInDepartmentObjectPermission]

    _LIST_ACTIONS = {"list", "export_excel"}

    def get_queryset(self):
        base = TagIn.objects.active().with_related().order_by("-created_on")

        if self.action not in self._LIST_ACTIONS:
            return base

        request = self.request
        profile = _profile_of(request)
        if profile is None:
            return base.none()

        if rbac.can_see_all_departments(request.user):
            qs = base
        elif _is_hod(request.user) and profile.department_id:
            qs = base.visible_to_hod(profile)
        else:
            qs = base.for_creator(profile)

        qs = qs.date_between(
            request.query_params.get("from_date"),
            request.query_params.get("to_date"),
        )
        department = request.query_params.get("department")
        if department:
            qs = qs.filter(tagout__user_profile__department__id=department)

        return qs

    def perform_create(self, serializer):
        """Legacy ``add_tagin`` POST branch.

        * Only the person who raised the parent Tag Out may file its Tag In
          (a privileged role may act on their behalf).
        * ``tagin_maintainer_name_rank`` / ``tagin_remarks`` are derived from
          ``tagin_maintainer`` / ``tagin_description`` (never client input).
        * ``items_pending`` is force-cleared when ``all_items_returned`` is
          true, regardless of what was sent.
        * ``status`` is set to ``"completed"``; ``approval_status`` starts
          ``"pending"``.
        * One :class:`~inout_tag.models.TagInApproval` row is created per
          department in ``tagout.departments_affected``.
        """
        profile = _profile_of(self.request)
        if profile is None:
            raise ValidationError(User404)

        tagout = serializer.validated_data["tagout"]
        if tagout.created_by_id != profile.id and not rbac.can_see_all_departments(
            self.request.user
        ):
            raise PermissionDenied(
                "You can only file a Tag In for a Tag Out you raised."
            )

        all_items_returned = serializer.validated_data.get("all_items_returned", True)

        with transaction.atomic():
            tagin = serializer.save(
                created_by=profile,
                status="completed",
                approval_status="pending",
                tagin_maintainer_name_rank=serializer.validated_data.get(
                    "tagin_maintainer"
                ),
                tagin_remarks=serializer.validated_data.get("tagin_description"),
                items_pending=(
                    None
                    if all_items_returned
                    else serializer.validated_data.get("items_pending")
                ),
            )

            TagInApproval.objects.bulk_create(
                [
                    TagInApproval(
                        tagin=tagin,
                        department=department,
                        approval_status="pending",
                        created_by=profile,
                    )
                    for department in tagout.departments_affected.all()
                ]
            )

    @action(detail=False, methods=["get"], url_path="form_meta")
    def form_meta(self, request):
        """Legacy ``add_tagin`` GET branch: the caller's own approved Tag Outs
        that do not have a Tag In yet - i.e. the ones they may file against."""
        profile = _profile_of(request)
        if profile is None:
            return Response([])

        approved_tagouts = (
            TagOut.objects.active()
            .with_related()
            .approved()
            .for_creator(profile)
            .exclude(
                id__in=TagIn.objects.filter(active=1).values_list(
                    "tagout_id", flat=True
                )
            )
            .order_by("-created_on")
        )
        return Response(TagOutSerializer(approved_tagouts, many=True).data)

    @action(detail=False, methods=["get"], url_path="ship_equipments")
    def ship_equipments(self, request):
        return Response({"ship_equipments": _ship_equipment_options()})

    @action(detail=False, methods=["get"], url_path="approval_list")
    def approval_list(self, request):
        """Legacy ``approvetagin`` pending list: Tag Ins that have an active,
        still-``pending`` :class:`~inout_tag.models.TagInApproval` row for the
        caller's department.

        Restricted to an exact *Head of Department* (legacy) or a privileged
        role (who sees every pending row, ship-wide).
        """
        profile = _profile_of(request)
        if profile is None:
            raise ValidationError(User404)

        privileged = rbac.can_see_all_departments(request.user)
        if not privileged and not _is_hod(request.user):
            raise PermissionDenied(
                "Only a Head of Department or a command role may view the "
                "Tag In approval list."
            )

        approvals = (
            TagInApproval.objects.filter(active=1, approval_status="pending")
            .select_related("tagin")
            .order_by("-created_on")
        )
        if not privileged:
            approvals = approvals.filter(department_id=profile.department_id)

        tagin_ids = list(dict.fromkeys(approvals.values_list("tagin_id", flat=True)))
        qs = (
            TagIn.objects.active()
            .with_related()
            .filter(id__in=tagin_ids)
            .order_by("-created_on")
        )

        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(
                self.get_serializer(page, many=True).data
            )
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Legacy ``approvetagin`` POST branch: one department's HOD approves /
        rejects their own :class:`~inout_tag.models.TagInApproval` row.

        Body: ``{"action": "approve" | "reject", "remarks": "..."}``.

        * ``approve`` stamps the row and calls
          :meth:`~inout_tag.models.TagIn.check_all_approvals` to roll the
          decision up onto the parent Tag In.
        * ``reject`` stamps the row and immediately marks the whole Tag In
          ``"rejected"``.
        """
        tagin = self.get_object()
        body = TagInApprovalActionSerializer(data=request.data)
        body.is_valid(raise_exception=True)

        profile = _profile_of(request)
        if profile is None:
            raise ValidationError(User404)

        if not (rbac.can_see_all_departments(request.user) or _is_hod(request.user)):
            raise PermissionDenied("Only a Head of Department may approve a Tag In.")
        if profile.department_id is None:
            raise PermissionDenied("Your account has no department assigned.")

        approval = (
            TagInApproval.objects.filter(
                tagin=tagin, department_id=profile.department_id, active=1
            )
            .order_by("-created_on")
            .first()
        )
        if approval is None:
            raise NotFound(
                "There is no Tag In approval for your department on this request."
            )
        if approval.approval_status != "pending":
            raise ValidationError(
                f"You have already {approval.approval_status} this Tag In."
            )

        action_value = body.validated_data["action"]
        remarks = body.validated_data.get("remarks", "")

        approval.approval_status = (
            "approved" if action_value == "approve" else "rejected"
        )
        approval.approved_by = profile
        approval.approved_on = timezone.now()
        if remarks:
            approval.remarks = remarks
        approval.save()

        if action_value == "approve":
            tagin.check_all_approvals()
        else:
            tagin.approval_status = "rejected"
            tagin.save()

        return Response(TagInSerializer(tagin).data)


# ---------------------------------------------------------------------------
# History  (legacy ``history``)
# ---------------------------------------------------------------------------
@extend_schema(tags=["InOut Tag"])
class HistoryAPIView(APIView):
    """``GET /history/`` - the History screen's table (legacy ``history``
    view).

    An HOD / Dy HOD sees their department's tag-outs; a privileged role sees
    all; everyone else sees only their own. Supports ``from_date`` /
    ``to_date`` / ``department`` query filters. Response envelope:
    ``{status, data, departments, filters, is_dyhod}``.
    """

    def get(self, request):
        profile = _profile_of(request)
        if profile is None:
            return Response(
                {"status": "success", "data": [], "departments": []},
                status=status.HTTP_200_OK,
            )

        tagouts = TagOut.objects.active().with_related()

        is_dyhod = _is_hod_or_dyhod(request.user)
        if rbac.can_see_all_departments(request.user):
            pass
        elif is_dyhod and profile.department_id:
            tagouts = tagouts.for_department(profile.department_id)
        else:
            tagouts = tagouts.for_creator(profile)

        from_date = request.query_params.get("from_date")
        to_date = request.query_params.get("to_date")
        department = request.query_params.get("department")

        tagouts = tagouts.date_between(from_date, to_date)
        if department:
            tagouts = tagouts.filter(departments_affected__id=department)

        tagouts = tagouts.distinct().order_by("-date", "-id")
        departments = Department.objects.filter(active=1).order_by("name")

        return Response(
            {
                "status": "success",
                "data": HistorySerializer(tagouts, many=True).data,
                "departments": [
                    {"id": dept.id, "name": dept.name} for dept in departments
                ],
                "filters": {
                    "from_date": from_date or "",
                    "to_date": to_date or "",
                    "department": department or "",
                },
                "is_dyhod": is_dyhod,
            },
            status=status.HTTP_200_OK,
        )
