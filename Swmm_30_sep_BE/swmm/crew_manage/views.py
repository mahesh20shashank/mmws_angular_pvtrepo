"""
Ship Crew API views.

This module backs the Angular "Ship Crew" screens (dashboard, personnel
status, leave / TY-duty applications, leave forecast, and the Watch & Station
Bill). Everything is class-based (APIView or ModelViewSet).

How the pieces fit together:

* models.py       - the database tables (LeaveApplication, Sailing, ...).
* serializers.py  - request validation + response shaping, plus a few small
                    shared helper functions used by both this file and the
                    serializers (imported at the bottom of the import block).
* permissions.py  - IsCrewApprover: the role check that guards the endpoints
                    only an approver (HOD, Dy HOD, CO, Command, admin) may call.

Two roughly equal groups of endpoints:
  - "who is on the ship today" reads (personnel status, forecast, watchbill),
    open to any signed-in user but scoped to their own department unless they
    hold a ship-wide role (see rbac.can_see_all_departments).
  - leave-application actions, where submitting your own request is open to
    everyone but approving / rejecting / editing someone's request needs an
    approver role.
"""

from datetime import datetime, timedelta

from django.db.models import CharField, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import (
    extend_schema,
)
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from master.models import Department
from accounts import rbac
from accounts.models import CustomUserProfile

from .models import (
    ActionStationMaster,
    CivilianOfficial,
    CruisingStationMaster,
    DefenceStationMaster,
    EmergencyStationMaster,
    LeaveApplication,
    PersonnelAssignment,
    PersonnelStatusLog,
    Sailing,
    SailingPersonnel,
    SailorRankClassification,
    ShelterStationMaster,
)
from .permissions import IsCrewApprover
from .serializers import (
    ActionStationMasterSerializer,
    ApplyOnBehalfSerializer,
    AssignmentsSaveSerializer,
    CivilianOfficialSerializer,
    CruisingStationMasterSerializer,
    DefenceStationMasterSerializer,
    EmergencyStationMasterSerializer,
    LeaveApplicationSerializer,
    LeaveDatesUpdateSerializer,
    PersonnelStatusRowSerializer,
    SailingCompleteSerializer,
    SailingCreateSerializer,
    SailingListSerializer,
    SailorRankClassificationSerializer,
    ShelterStationMasterSerializer,
    TruncateLeaveSerializer,
    UpdatePersonnelStatusSerializer,
    _absent_pnos,
    _delete_status_logs,
    _get_profile,
    _log_status_range,
)

OnLeave = "On Leave"
TyDuty = "Ty Duty"

# ==========================================================================
# Personnel status / dashboard data
# ==========================================================================


@extend_schema(tags=["Ship Crew"])
class PersonnelStatusView(APIView):
    """GET /personnel-status/?status=present|leave|ty|all

    One row per active crew member with their status for *today*. The status
    comes from the most recent PersonnelStatusLog row for today, or "Present"
    if there is none. `status` filters the list; omit it (or pass "all") for
    everyone. Non-privileged callers only see their own department.
    """

    def get(self, request):
        status_param = request.query_params.get("status")
        today = timezone.now().date()

        latest_status_subquery = (
            PersonnelStatusLog.objects.filter(
                personnel_number=OuterRef("personal_number"), log_date=today
            )
            .order_by("-created_at")
            .values("status")[:1]
        )

        queryset = (
            CustomUserProfile.objects.annotate(
                latest_status=Coalesce(
                    Subquery(latest_status_subquery),
                    Value("Present"),
                    output_field=CharField(),
                )
            )
            .select_related("rank", "designation_master", "department")
            .filter(
                user_active=True,
                personal_number__regex=r"^\d",
            )
        )

        if not rbac.can_see_all_departments(request.user):
            profile = _get_profile(request.user)
            department = profile.department if profile else None
            queryset = (
                queryset.filter(department=department)
                if department
                else queryset.none()
            )

        if status_param:
            status_param = status_param.lower()
            if status_param == "present":
                queryset = queryset.filter(latest_status="Present")
            elif status_param == "leave":
                queryset = queryset.filter(latest_status=OnLeave)
            elif status_param == "ty":
                queryset = queryset.filter(latest_status=TyDuty)
            # "all" (or any unrecognised value) -> return everyone.

        personnel = queryset.values(
            "id",
            "rank__name",
            "firstname",
            "lastname",
            "personal_number",
            "department__name",
            "designation_master__designation_name",
            "latest_status",
        ).order_by("rank__name", "firstname")

        serializer = PersonnelStatusRowSerializer(personnel, many=True)
        return Response({"data": serializer.data})


@extend_schema(tags=["Ship Crew"])
class PersonnelStatusCountsView(APIView):
    """GET /personnel-status/counts/

    The four numbers behind the dashboard tiles for today: total crew, and how
    many are Present / On Leave / Ty Duty. Same today's-status and
    department-scoping rules as PersonnelStatusView.
    """

    def get(self, request):
        today = timezone.localdate()

        latest_status_subquery = (
            PersonnelStatusLog.objects.filter(
                personnel_number=OuterRef("personal_number"), log_date=today
            )
            .order_by("-created_at")
            .values("status")[:1]
        )

        queryset = CustomUserProfile.objects.annotate(
            latest_status=Coalesce(
                Subquery(latest_status_subquery),
                Value("Present"),
                output_field=CharField(),
            )
        ).filter(
            user_active=True,
            personal_number__regex=r"^\d",
        )

        if not rbac.can_see_all_departments(request.user):
            profile = _get_profile(request.user)
            department = profile.department if profile else None
            queryset = (
                queryset.filter(department=department)
                if department
                else queryset.none()
            )

        total = queryset.count()
        present = queryset.filter(latest_status="Present").count()
        on_leave = queryset.filter(latest_status=OnLeave).count()
        ty_duty = queryset.filter(latest_status=TyDuty).count()

        return Response(
            {
                "date": today.strftime("%d-%b-%Y"),
                "total": total,
                "present": present,
                "on_leave": on_leave,
                "ty_duty": ty_duty,
            }
        )


@extend_schema(tags=["Ship Crew"])
class UpdatePersonnelStatusView(APIView):
    """POST /personnel-status/update/

    Set a crew member's status for today directly (Present / On Leave / Ty
    Duty), without going through a leave application. Used by the dashboard
    grid's inline status control.

    Approver-only (IsCrewApprover). On top of that, the serializer stops a
    non-ship-wide approver from touching another department's crew.
    """

    permission_classes = [IsCrewApprover]

    def post(self, request):
        serializer = UpdatePersonnelStatusSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        action_taken = serializer.save()
        return Response({"success": True, "action": action_taken})


# ==========================================================================
# Leave applications
# ==========================================================================


@extend_schema(tags=["Ship Crew"])
class LeaveApplicationViewSet(viewsets.ModelViewSet):
    """Leave and TY-duty applications.

    A LeaveApplication covers both "On Leave" and "Ty Duty" - the `leave_type`
    field is the only difference. Lifecycle: Pending -> Approved / Rejected.
    Approving one writes a PersonnelStatusLog row for every day it covers (that
    is what the dashboards and forecast read); rejecting or shortening it
    removes those rows again.

    Routes on this ViewSet:

      GET    /leave-applications/               list  - the caller's OWN
                                                        applications only
      POST   /leave-applications/               create - submit your own request
                                                         (always Pending)
      GET    /leave-applications/{id}/          retrieve - owner or an approver
      PATCH  /leave-applications/{id}/          shorten an application's end date
                                                (send {"new_end_date": "..."})
      DELETE /leave-applications/{id}/          delete an application + its logs
      GET    /leave-applications/pending/       queue of applications to action
                                                (?status=Pending|Approved|
                                                Rejected|all)
      POST   /leave-applications/{id}/action/   approve or reject a Pending one
                                                (send {"action": "Approved" |
                                                "Rejected", "rejection_reason"})
      POST   /leave-applications/{id}/truncate/ cut an active leave short
      POST   /leave-applications/apply_on_behalf/  approver files (and
                                                    auto-approves) a request for
                                                    someone in their department
      GET    /leave-applications/check_conflict/   does this person already have
                                                   an approved leave covering
                                                   today?

    Permissions: list / create / retrieve / check_conflict need only a signed-in
    user; every action that approves, edits or deletes someone's application
    needs an approver role (see get_permissions / _APPROVER_ACTIONS).
    HOD / Dy HOD are additionally limited to their own department by
    get_object() and the pending() queryset; CO / Command / admin see all
    departments.
    """

    serializer_class = LeaveApplicationSerializer
    http_method_names = ("get", "post", "patch", "delete", "head", "options")

    # Actions in this set require an approver role (IsCrewApprover); everything
    # else on the ViewSet only requires a signed-in user (IsAuthenticated).
    _APPROVER_ACTIONS = frozenset(
        {
            "pending",
            "take_action",
            "apply_on_behalf",
            "truncate",
            "partial_update",
            "destroy",
        }
    )

    def get_permissions(self):
        if self.action in self._APPROVER_ACTIONS:
            return [IsCrewApprover()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = LeaveApplication.objects.select_related(
            "applied_by", "approved_rejected_by"
        )
        if self.action == "list":
            profile = _get_profile(self.request.user)
            return qs.filter(applied_by=profile) if profile else qs.none()
        return qs

    def get_object(self):
        """Look up the single application a detail route (retrieve, PATCH,
        DELETE, truncate, action) is working on, and block access if it belongs
        to another department - unless the caller has a ship-wide role. Without
        this an approver could action any department's applications by guessing
        the id.
        """
        obj = super().get_object()
        if not rbac.can_see_all_departments(self.request.user):
            profile = _get_profile(self.request.user)
            caller_dept = (
                profile.department.name if profile and profile.department else ""
            )
            if obj.department != caller_dept:
                raise PermissionDenied(
                    "You may not access another department's leave application."
                )
        return obj

    def partial_update(self, request, *args, **kwargs):
        """PATCH /leave-applications/{id}/ - shorten the application's end date.

        This is the only field PATCH changes. Body: {"new_end_date": "YYYY-MM-DD"}
        ("end_date" is accepted as an alias). The status logs are rebuilt for
        the new range. See LeaveDatesUpdateSerializer.
        """
        instance = self.get_object()
        serializer = LeaveDatesUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(instance)
        return Response(self.get_serializer(instance).data)

    def perform_destroy(self, instance):
        # Deleting an application also clears the PersonnelStatusLog rows it
        # created, so nobody is left showing as On Leave for a leave that no
        # longer exists.
        _delete_status_logs(instance)
        instance.delete()

    @action(detail=False, methods=["get"], url_path="check_conflict")
    def check_conflict(self, request):
        """GET /leave-applications/check_conflict/?personal_number=...

        Before marking someone Present today, the dashboard asks this: is there
        already an approved leave covering today? If so the response carries the
        details plus `new_end_date` (yesterday) so the UI can offer to shorten
        that leave instead. Non-privileged callers may only check their own
        department.
        """
        personal_number = request.query_params.get("personal_number", "").strip()
        if not personal_number:
            return Response({"has_conflict": False})

        if not rbac.can_see_all_departments(request.user):
            profile = _get_profile(request.user)
            caller_dept = (
                profile.department.name if profile and profile.department else ""
            )
            target_profile = (
                CustomUserProfile.objects.filter(
                    personal_number=personal_number,
                    personal_number__regex=r"^\d",
                )
                .select_related("department")
                .first()
            )
            target_dept = (
                target_profile.department.name
                if target_profile and target_profile.department
                else ""
            )
            if not caller_dept or target_dept != caller_dept:
                raise PermissionDenied(
                    "You may not check another department's leave conflicts."
                )

        today = timezone.now().date()
        yesterday = today - timedelta(days=1)

        conflict = (
            LeaveApplication.objects.filter(
                personal_number=personal_number,
                application_status="Approved",
                start_date__lte=today,
                end_date__gte=today,
            )
            .order_by("-applied_at")
            .first()
        )
        if not conflict:
            return Response({"has_conflict": False})

        current_log = (
            PersonnelStatusLog.objects.filter(
                personnel_number=personal_number, log_date=today
            )
            .order_by("-created_at")
            .first()
        )
        current_status = current_log.status if current_log else conflict.leave_type

        def fmt(d):
            # Display format, e.g. "05 Jun 2026". Use "%d" (zero-padded) rather
            # than "%-d" - the latter is not portable and breaks on Windows.
            return d.strftime("%d %b %Y") if d else ""

        return Response(
            {
                "has_conflict": True,
                "application_id": conflict.id,
                "leave_type": conflict.leave_type,
                "start_date": fmt(conflict.start_date),
                "end_date": fmt(conflict.end_date),
                "new_end_date": yesterday.strftime("%Y-%m-%d"),
                "current_status": current_status,
            }
        )

    @action(detail=True, methods=["post"])
    def truncate(self, request, pk=None):
        """POST /leave-applications/{id}/truncate/ - end an active leave early.

        Body: {"new_end_date": "YYYY-MM-DD"}. If that date is before the start
        date the application is marked Rejected. Status-log rows after the new
        end date are removed. See TruncateLeaveSerializer.
        """
        instance = self.get_object()
        serializer = TruncateLeaveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(instance)
        return Response({"success": True, "new_end_date": str(instance.end_date)})

    @action(detail=False, methods=["post"], url_path="apply_on_behalf")
    def apply_on_behalf(self, request):
        """POST /leave-applications/apply_on_behalf/

        An approver files a leave request for someone else. Unlike a
        self-service request this is created already Approved and its status
        logs are written immediately. See ApplyOnBehalfSerializer.
        """
        serializer = ApplyOnBehalfSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        leave_app = serializer.save()
        return Response(
            {
                "status": "success",
                "message": f"Leave applied for {leave_app.no_of_days} day(s)",
                "no_of_days": leave_app.no_of_days,
                "application_id": leave_app.id,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], url_path="pending")
    def pending(self, request):
        """GET /leave-applications/pending/?status=Pending

        The approver's queue. `status` defaults to "Pending"; pass "Approved",
        "Rejected" or "all" to widen it. CO / Command / admin see every
        department; an HOD / Dy HOD sees only their own.
        """
        profile = _get_profile(request.user)
        status_filter = request.query_params.get("status", "Pending")

        qs = LeaveApplication.objects.order_by("-applied_at")
        if not rbac.can_see_all_departments(request.user):
            dept = profile.department.name if profile and profile.department else ""
            qs = qs.filter(department=dept)
        if status_filter and status_filter.lower() != "all":
            qs = qs.filter(application_status=status_filter)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="action")
    def take_action(self, request, pk=None):
        """POST /leave-applications/{id}/action/ - approve or reject.

        Body: {"action": "Approved" | "Rejected", "rejection_reason": "..."}.
        Only works while the application is still Pending. Approving writes the
        status logs for the leave's date range; rejecting clears any that exist.
        """
        leave = self.get_object()
        if leave.application_status != "Pending":
            return Response(
                {
                    "status": "error",
                    "message": f"Application already {leave.application_status}",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        action_value = str(request.data.get("action", "")).strip()
        rejection_reason = str(request.data.get("rejection_reason", "")).strip()
        if action_value not in ("Approved", "Rejected"):
            return Response(
                {"status": "error", "message": "action must be Approved or Rejected"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = _get_profile(request.user)
        leave.application_status = action_value
        leave.approved_rejected_by = profile
        leave.approved_rejected_at = timezone.now()
        if action_value == "Rejected":
            leave.rejection_reason = rejection_reason
        leave.save()

        if action_value == "Approved":
            _log_status_range(leave)
        else:
            _delete_status_logs(leave)

        return Response(
            {
                "status": "success",
                "action": action_value,
                "message": f"Application {action_value.lower()} successfully.",
            }
        )


# ==========================================================================
# Leave forecast
# ==========================================================================


def _parse_iso_date(value):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


@extend_schema(tags=["Ship Crew"])
class LeaveForecastLogsView(APIView):
    """GET /leave-forecast/logs/?start=YYYY-MM-DD&end=YYYY-MM-DD

    Actual PersonnelStatusLog rows (what a person's status *was*) for each day
    in the range - the "past / already happened" layer of the forecast
    calendar. Returns {"data": []} if the dates are missing or unparseable.
    Non-privileged callers see only their own department.
    """

    def get(self, request):
        start = _parse_iso_date(request.query_params.get("start", ""))
        end = _parse_iso_date(request.query_params.get("end", ""))
        if not start or not end:
            return Response({"data": []})

        logs = PersonnelStatusLog.objects.filter(log_date__gte=start, log_date__lte=end)
        if not rbac.can_see_all_departments(request.user):
            profile = _get_profile(request.user)
            dept = profile.department.name if profile and profile.department else ""
            logs = logs.filter(department=dept)

        logs = logs.values(
            "id",
            "personnel_number",
            "rank",
            "name",
            "department",
            "designation",
            "status",
            "log_date",
        ).order_by("log_date", "name")

        data = [{**row, "log_date": str(row["log_date"])} for row in logs]
        return Response({"data": data})


@extend_schema(tags=["Ship Crew"])
class LeaveForecastApplicationsView(APIView):
    """GET /leave-forecast/applications/?start=YYYY-MM-DD&end=YYYY-MM-DD

    LeaveApplication rows (any status) that overlap the range - the "planned /
    upcoming" layer of the forecast calendar, and the only unscoped source of
    other people's applications (the plain list endpoint is always limited to
    the caller's own). Non-privileged callers see only their own department.
    """

    def get(self, request):
        start = _parse_iso_date(request.query_params.get("start", ""))
        end = _parse_iso_date(request.query_params.get("end", ""))
        if not start or not end:
            return Response({"data": []})

        apps = LeaveApplication.objects.filter(start_date__lte=end, end_date__gte=start)
        if not rbac.can_see_all_departments(request.user):
            profile = _get_profile(request.user)
            dept = profile.department.name if profile and profile.department else ""
            apps = apps.filter(department=dept)

        apps = apps.values(
            "id",
            "personal_number",
            "rank",
            "name",
            "department",
            "designation",
            "leave_type",
            "start_date",
            "end_date",
            "no_of_days",
            "application_status",
            "remark",
            "reason",
            "applied_at",
            "has_prefix",
            "prefix_start_date",
            "suffix_completion_date",
            "station",
        ).order_by("-applied_at")

        data = []
        for a in apps:
            data.append(
                {
                    "id": a["id"],
                    "personal_number": a["personal_number"],
                    "rank": a["rank"],
                    "name": a["name"],
                    "department": a["department"],
                    "designation": a["designation"],
                    "leave_type": a["leave_type"],
                    "start_date": str(a["start_date"]),
                    "end_date": str(a["end_date"]),
                    "no_of_days": a["no_of_days"],
                    "station": a["station"],
                    "application_status": a["application_status"],
                    "remark": a["remark"],
                    "reason": a["reason"] or "",
                    "applied_at": (
                        a["applied_at"].strftime("%d %b %Y") if a["applied_at"] else ""
                    ),
                    "has_prefix": a["has_prefix"],
                    "prefix_start_date": (
                        str(a["prefix_start_date"]) if a["prefix_start_date"] else ""
                    ),
                    "suffix_completion_date": (
                        str(a["suffix_completion_date"])
                        if a["suffix_completion_date"]
                        else ""
                    ),
                }
            )
        return Response({"data": data})


# ==========================================================================
# Watch Station Bill
# ==========================================================================


@extend_schema(tags=["Ship Crew"])
class WatchbillDashboardView(APIView):
    """GET /watchbill/dashboard/

    One response for the whole Watch & Station Bill dashboard tab: ship-wide
    present/absent counts, a per-department breakdown, the active/completed
    sailing counts, and the list of active sailings. "On the ship" here means
    user_active and no ship_leaving_date.
    """

    def get(self, request):
        today = timezone.now().date()
        total = CustomUserProfile.objects.filter(
            user_active=True,
            ship_leaving_date__isnull=True,
            personal_number__regex=r"^\d",
        ).count()
        absent_pnos = _absent_pnos(today, today)
        absent = len(absent_pnos)
        present = total - absent

        dept_data = []
        for dept in Department.objects.all().order_by("name"):
            total_count = CustomUserProfile.objects.filter(
                user_active=True,
                ship_leaving_date__isnull=True,
                department=dept,
                personal_number__regex=r"^\d",
            ).count()
            if not total_count:
                continue

            absent_count = (
                PersonnelStatusLog.objects.filter(department=dept.name, log_date=today)
                .values("personnel_number")
                .distinct()
                .count()
            )
            present_count = max(total_count - absent_count, 0)

            dept_data.append(
                {
                    "dept": dept.name,
                    "total": total_count,
                    "present": present_count,
                    "absent": absent_count,
                }
            )

        active_sailings = list(
            Sailing.objects.filter(status="active")
            .order_by("-created_at")
            .values(
                "id", "name", "area", "start_date", "end_date", "co_name", "created_at"
            )
        )

        return Response(
            {
                "total": total,
                "present": present,
                "absent": absent,
                "active_sailings_count": Sailing.objects.filter(
                    status="active"
                ).count(),
                "completed_sailings_count": Sailing.objects.filter(
                    status="completed"
                ).count(),
                "dept_strength": dept_data,
                "active_sailings": active_sailings,
            }
        )


@extend_schema(tags=["Ship Crew"])
class WatchbillPersonnelListView(APIView):
    """GET /watchbill/personnel/

    The full ship's company for the Watch & Station Bill "Personnel" tab, each
    row tagged with today's status (Present, the leave_type of an approved
    leave covering today, or "Absent"). Non-privileged callers see only their
    own department.
    """

    def _get_personnel_status(self, personal_number, today, absent_pnos):
        if personal_number not in absent_pnos:
            return "Present"

        leave = LeaveApplication.objects.filter(
            personal_number=personal_number,
            application_status="Approved",
            start_date__lte=today,
            end_date__gte=today,
        ).first()

        return leave.leave_type if leave else "Absent"

    def _get_designation(self, profile):
        if profile.designation:
            return profile.designation

        if profile.designation_master:
            return profile.designation_master.designation_name

        return ""

    def _serialize_personnel(self, profile, today, absent_pnos):
        return {
            "id": profile.id,
            "rank": profile.rank.name if profile.rank else "",
            "fname": profile.firstname,
            "lname": profile.lastname,
            "pno": profile.personal_number,
            "dept": profile.department.name if profile.department else "",
            "desig": self._get_designation(profile),
            "doj": (
                str(profile.ship_joining_date.date())
                if profile.ship_joining_date
                else ""
            ),
            "status": self._get_personnel_status(
                profile.personal_number,
                today,
                absent_pnos,
            ),
        }

    def get(self, request):
        today = timezone.now().date()
        absent_pnos = _absent_pnos(today, today)

        qs = (
            CustomUserProfile.objects.filter(
                user_active=True,
                ship_leaving_date__isnull=True,
                personal_number__regex=r"^\d",
            )
            .select_related("rank", "department", "designation_master")
            .order_by("department__name", "rank__name")
        )

        if not rbac.can_see_all_departments(request.user):
            profile = _get_profile(request.user)
            department = profile.department if profile else None
            qs = qs.filter(department=department) if department else qs.none()

        data = [
            self._serialize_personnel(profile, today, absent_pnos) for profile in qs
        ]

        return Response({"personnel": data})


@extend_schema(tags=["Ship Crew"])
class CivilianOfficialViewSet(viewsets.ModelViewSet):
    """The global pool of civilians / embarked officers (barbers, dhobis,
    canteen staff, embarked personnel, ...) that can be added to any sailing.

      GET    /civilians/               list the pool
      POST   /civilians/               add a person to the pool
      DELETE /civilians/{id}/          soft-delete (is_active = False)
      POST   /civilians/{id}/deactivate/   same soft-delete, explicit route

    Adding someone here does NOT put them on a sailing - that happens via
    SailingViewSet.add_personnel. Any signed-in user may use these endpoints
    (no approver role required).
    """

    serializer_class = CivilianOfficialSerializer
    http_method_names = (
        "get",
        "post",
        "head",
        "options",
        "delete",
    )

    def get_queryset(self):
        # Only rows that have a person_type set. Note: this list is NOT filtered
        # by is_active, so soft-deleted civilians still appear here (matches the
        # original behaviour the Angular client expects).
        return CivilianOfficial.objects.filter(
            ~Q(person_type=""), person_type__isnull=False
        ).order_by("role", "name_snapshot")

    def _soft_delete(self, pk):
        civilian = get_object_or_404(CivilianOfficial, pk=pk)
        # civilian.is_active = False
        # civilian.save(update_fields=["is_active", "updated_at"])
        civilian.active = False
        civilian.save(update_fields=["active", "updated_at"])
        return Response({"status": "ok"})

    def destroy(self, request, *args, **kwargs):
        # DELETE is a soft-delete, never a real delete: sailings snapshot the
        # civilian's details when they are added, but other code may still hold
        # the id, so the row must stay in the table.
        return self._soft_delete(kwargs["pk"])

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        return self._soft_delete(pk)


@extend_schema(tags=["Ship Crew"])
class SailingViewSet(viewsets.ModelViewSet):
    """A sailing and everyone assigned to it.

      GET    /sailings/?status=active|completed   list (wrapped as {"sailings": [...]})
      POST   /sailings/                            start a new sailing; may copy
                                                   the crew + assignments of an
                                                   existing one
                                                   (copy_from_sailing_id)
      GET    /sailings/{id}/                       full detail, crew grouped by
                                                   department
      DELETE /sailings/{id}/                       only allowed while still active
      POST   /sailings/{id}/complete/              close the sailing (locks it)
      GET    /sailings/{id}/available_personnel/   crew + civilians not yet on
                                                   this sailing
      POST   /sailings/{id}/add_personnel/         add some of them
      GET/POST /sailings/{id}/assignments/         read / bulk-save the watch &
                                                   station bill grid

    A completed sailing is read-only: add_personnel and the per-row edits in
    SailingPersonnelDetailView refuse to touch it.
    """

    http_method_names = ("get", "post", "delete", "head", "options")

    def get_queryset(self):
        return Sailing.objects.all()

    def list(self, request, *args, **kwargs):
        status_param = request.query_params.get("status", "active")
        qs = Sailing.objects.filter(status=status_param).order_by("-created_at")
        serializer = SailingListSerializer(qs, many=True)
        return Response({"sailings": serializer.data})

    def create(self, request, *args, **kwargs):
        serializer = SailingCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        sailing = serializer.save()
        return Response(
            {
                "status": "ok",
                "id": sailing.id,
                "copied_personnel": getattr(sailing, "copied_personnel", 0),
                "copied_assignments": getattr(sailing, "copied_assignments", 0),
            },
            status=status.HTTP_201_CREATED,
        )

    def _get_department(self, person):
        return person.dept_snapshot or (
            person.person_type.replace("_", " ").title()
            if person.person_type
            else "Civilian"
        )

    def _get_personnel_data(self, personnel, assign_lookup):
        departments = {}
        civilian_count = 0

        for person in personnel:
            civilian_count += int(
                (person.person_type or "").strip().lower() == "civilian"
            )

            department = self._get_department(person)
            assignment = assign_lookup.get(person.pno_snapshot)

            departments.setdefault(department, []).append(
                self._build_personnel_record(person, assignment)
            )

        return departments, civilian_count

    def _build_personnel_record(self, person, assignment):
        return {
            "rank": person.rank_snapshot,
            "name": person.name_snapshot,
            "pno": person.pno_snapshot,
            "desig": person.desig_snapshot,
            "w3": assignment.w3 if assignment else person.watch_station,
            "w2": assignment.w2 if assignment else "",
            "action": assignment.action if assignment else person.action_station,
            "blood_group": assignment.blood_group if assignment else "",
            "status": person.status_override,
            "mess": assignment.mess if assignment else "",
        }

    def _get_civilian_data(self, civilians):
        return [
            {
                "id": civilian.id,
                "name": civilian.name_snapshot,
                "rank": civilian.rank_snapshot,
                "pno": civilian.pno_snapshot,
                "desig": civilian.desig_snapshot,
                "role": civilian.role,
                "person_type": civilian.person_type,
                "service_no": civilian.service_no,
                "fleet": civilian.fleet,
                "ship": civilian.ship,
                "cid": civilian.cid,
                "contact": civilian.contact,
                "remarks": civilian.remarks,
                "status": civilian.status_override,
            }
            for civilian in civilians
        ]

    def _format_sailing_date(self, value):
        return value.strftime("%d/%m/%Y") if value else ""

    def retrieve(self, request, *args, **kwargs):
        sailing = self.get_object()

        personnel = SailingPersonnel.objects.filter(sailing=sailing)

        civilians = SailingPersonnel.objects.filter(
            ~Q(person_type=""),
            person_type__isnull=False,
            sailing=sailing,
        )

        assign_lookup = {
            assignment.pno: assignment
            for assignment in PersonnelAssignment.objects.filter(sailing=sailing)
        }

        departments, civilian_count = self._get_personnel_data(
            personnel,
            assign_lookup,
        )

        civilian_data = self._get_civilian_data(civilians)

        return Response(
            {
                "id": sailing.id,
                "name": sailing.name,
                "area": sailing.area,
                "start": self._format_sailing_date(sailing.start_date),
                "end": self._format_sailing_date(sailing.end_date),
                "co": sailing.co_name,
                "xo": sailing.xo_name,
                "status": sailing.status,
                "personnel_count": personnel.count() - civilian_count,
                "civilians": civilian_data,
                "civilian_count": civilian_count,
                "departments": departments,
            }
        )

    def destroy(self, request, *args, **kwargs):
        sailing = get_object_or_404(Sailing, pk=kwargs["pk"], status="active")
        sailing.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        sailing = get_object_or_404(Sailing, pk=pk, status="active")
        serializer = SailingCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(sailing)
        return Response({"status": "ok"})

    def _get_leave_status(self, personal_number, today, absent_pnos):
        if personal_number not in absent_pnos:
            return "Present"

        leave = LeaveApplication.objects.filter(
            personal_number=personal_number,
            application_status="Approved",
            start_date__lte=today,
            end_date__gte=today,
        ).first()

        return leave.leave_type if leave else OnLeave

    def _get_personnel_row(self, person, status):
        return {
            "source": "personnel",
            "profile_id": person.id,
            "rank": person.rank.name if person.rank else "",
            "name": f"{person.firstname} {person.lastname}".strip(),
            "pno": person.personal_number,
            "dept": person.department.name if person.department else "",
            "desig": (
                person.designation
                or (
                    person.designation_master.designation_name
                    if person.designation_master
                    else ""
                )
            ),
            "status": status,
        }

    def _get_civilian_row(self, civilian):
        pno = civilian.service_no or civilian.ref_id or f"CIV-{civilian.id}"
        dept_label = (civilian.person_type or "civilian").replace(
            "_", " "
        ).title() or "Civilian"

        return {
            "source": "civilian",
            "civilian_id": civilian.id,
            "rank": civilian.rank_snapshot or "",
            "name": civilian.name_snapshot,
            "pno": pno,
            "dept": dept_label,
            "desig": civilian.role,
            "status": "Present",
        }

    def _get_available_personnel(
        self,
        personnel_qs,
        already_pnos,
        today,
        absent_pnos,
    ):
        rows = []

        for person in personnel_qs:
            pno = person.personal_number

            if pno in already_pnos:
                continue

            status = self._get_leave_status(
                pno,
                today,
                absent_pnos,
            )

            rows.append(
                self._get_personnel_row(
                    person,
                    status,
                )
            )

        return rows

    def _get_available_civilians(self, civilian_qs, already_pnos):
        rows = []

        for civilian in civilian_qs:
            pno = civilian.service_no or civilian.ref_id or f"CIV-{civilian.id}"

            if pno in already_pnos:
                continue

            rows.append(self._get_civilian_row(civilian))

        return rows

    @action(detail=True, methods=["get"], url_path="available_personnel")
    def available_personnel(self, request, pk=None):
        """Everyone who could still be added to this sailing: ship's company
        (department-scoped for non-privileged callers) plus every active
        civilian, minus anyone already on the sailing. Each row carries a
        `source` of "personnel" or "civilian" for add_personnel to use.
        """
        sailing = self.get_object()

        already_pnos = set(
            sailing.personnel.values_list(
                "pno_snapshot",
                flat=True,
            )
        )

        today = timezone.now().date()
        absent_pnos = _absent_pnos(today, today)

        personnel_qs = CustomUserProfile.objects.filter(
            user_active=True,
            ship_leaving_date__isnull=True,
            personal_number__regex=r"^\d",
        ).select_related(
            "rank",
            "department",
            "designation_master",
        )

        if not rbac.can_see_all_departments(request.user):
            profile = _get_profile(request.user)
            department = profile.department if profile else None
            personnel_qs = (
                personnel_qs.filter(department=department)
                if department
                else personnel_qs.none()
            )

        # Civilians are always shown ship-wide: CivilianOfficial has no
        # department to scope them by.
        civilian_qs = CivilianOfficial.objects.filter(
            # is_active=True,
            active=True,
        )

        rows = self._get_available_personnel(
            personnel_qs,
            already_pnos,
            today,
            absent_pnos,
        )

        rows.extend(
            self._get_available_civilians(
                civilian_qs,
                already_pnos,
            )
        )

        return Response({"available": rows})

    def _build_add_personnel_items(self, body):
        items = []

        if body.get("personnel_id"):
            items.append(
                {
                    "source": "personnel",
                    "profile_id": body["personnel_id"],
                }
            )

        if body.get("civilian_id"):
            items.append(
                {
                    "source": "civilian",
                    "civilian_id": body["civilian_id"],
                }
            )

        items.extend(
            {
                "source": "personnel",
                "profile_id": profile_id,
            }
            for profile_id in body.get("personnel_ids", []) or []
        )

        items.extend(
            {
                "source": "civilian",
                "civilian_id": civilian_id,
            }
            for civilian_id in body.get("civilian_ids", []) or []
        )

        return items

    def _get_personnel_status(self, personal_number, today, absent_pnos):
        if personal_number not in absent_pnos:
            return "Present"

        leave = LeaveApplication.objects.filter(
            personal_number=personal_number,
            application_status="Approved",
            start_date__lte=today,
            end_date__gte=today,
        ).first()

        status_value = leave.leave_type if leave else OnLeave

        return (
            status_value if status_value in ("Present", OnLeave, TyDuty) else "Present"
        )

    def _add_sailing_personnel(
        self,
        sailing,
        profile,
        request_user,
        today,
        absent_pnos,
    ):
        status_value = self._get_personnel_status(
            profile.personal_number,
            today,
            absent_pnos,
        )

        SailingPersonnel.objects.create(
            sailing=sailing,
            profile=profile,
            rank_snapshot=profile.rank.name if profile.rank else "",
            name_snapshot=(f"{profile.firstname} {profile.lastname}").strip(),
            pno_snapshot=profile.personal_number,
            dept_snapshot=(profile.department.name if profile.department else ""),
            desig_snapshot=profile.designation or "",
            status_override=status_value,
            created_by=request_user,
        )

    def _add_sailing_civilian(
        self,
        sailing,
        civilian,
        request_user,
    ):
        pno = civilian.service_no or civilian.cid or f"CIV-{civilian.id}"

        SailingPersonnel.objects.create(
            sailing=sailing,
            name_snapshot=civilian.name_snapshot,
            rank_snapshot=civilian.rank_snapshot or "",
            pno_snapshot=pno,
            dept_snapshot=(
                (civilian.person_type or "civilian").replace("_", " ").title()
                or "Civilian"
            ),
            desig_snapshot=civilian.role,
            person_type=civilian.person_type,
            role=civilian.role,
            service_no=civilian.service_no,
            fleet=civilian.fleet,
            ship=civilian.ship,
            cid=civilian.cid,
            contact=civilian.contact,
            remarks=civilian.remarks,
            status_override="Present",
            created_by=request_user,
        )

        return pno

    def _add_personnel_item(
        self,
        sailing,
        item,
        existing_pnos,
        request_user,
        today,
        absent_pnos,
        can_see_all_departments,
        caller_department,
    ):
        source = item.get("source")

        if source == "personnel":
            profile = (
                CustomUserProfile.objects.filter(
                    id=item.get("profile_id"),
                    personal_number__regex=r"^\d",
                )
                .select_related("rank", "department")
                .first()
            )

            if not profile:
                return False

            if not can_see_all_departments and profile.department_id != (
                caller_department.id if caller_department else None
            ):
                return False

            pno = profile.personal_number

            if pno in existing_pnos:
                return False

            self._add_sailing_personnel(
                sailing,
                profile,
                request_user,
                today,
                absent_pnos,
            )

            existing_pnos.add(pno)
            return True

        if source == "civilian":
            civilian = CivilianOfficial.objects.filter(
                id=item.get("civilian_id"),
            ).first()

            if not civilian:
                return False

            pno = civilian.service_no or civilian.cid or f"CIV-{civilian.id}"

            if pno in existing_pnos:
                return False

            self._add_sailing_civilian(
                sailing,
                civilian,
                request_user,
            )

            existing_pnos.add(pno)
            return True

        return False

    @action(
        detail=True,
        methods=["post"],
        url_path="add_personnel",
    )
    def add_personnel(self, request, pk=None):
        """POST /sailings/{id}/add_personnel/ - add crew and/or civilians.

        Accepts any of: personnel_id, civilian_id, personnel_ids[],
        civilian_ids[]. Skips anyone already on the sailing, anyone a
        non-privileged caller isn't allowed to add (other department), and
        does nothing if the sailing is completed. Returns {"added", "skipped"}.
        """
        sailing = self.get_object()

        if sailing.status == "completed":
            return Response(
                {
                    "status": "error",
                    "message": "Sailing is completed and locked.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        items = self._build_add_personnel_items(request.data)

        today = timezone.now().date()
        absent_pnos = _absent_pnos(today, today)

        existing_pnos = set(
            sailing.personnel.values_list(
                "pno_snapshot",
                flat=True,
            )
        )

        can_see_all_departments = rbac.can_see_all_departments(request.user)
        caller_profile = None if can_see_all_departments else _get_profile(request.user)
        caller_department = caller_profile.department if caller_profile else None

        added = 0
        skipped = 0

        for item in items:
            success = self._add_personnel_item(
                sailing=sailing,
                item=item,
                existing_pnos=existing_pnos,
                # SailingPersonnel.created_by points at CustomUser, so pass
                # request.user directly (not request.user.user_profile).
                request_user=request.user,
                today=today,
                absent_pnos=absent_pnos,
                can_see_all_departments=can_see_all_departments,
                caller_department=caller_department,
            )

            if success:
                added += 1
            else:
                skipped += 1

        return Response(
            {
                "status": "ok",
                "added": added,
                "skipped": skipped,
            }
        )

    def _get_assignment_data(self, personnel, saved):
        assignment = saved.get(personnel.pno_snapshot)

        return {
            "id": personnel.id,
            "pno": personnel.pno_snapshot,
            "name": personnel.name_snapshot,
            "rank": personnel.rank_snapshot,
            "dept": self._get_personnel_department(personnel),
            "desig": personnel.desig_snapshot,
            "w3": assignment.w3 if assignment else "",
            "w2": assignment.w2 if assignment else "",
            "action": assignment.action if assignment else "",
            "defence": assignment.defence if assignment else "",
            "cruising": assignment.cruising if assignment else "",
            "shelter": assignment.shelter if assignment else "",
            "emergency": assignment.emergency if assignment else "",
            "lr": assignment.lr if assignment else "",
            "mess": assignment.mess if assignment else "",
            "blood_group": assignment.blood_group if assignment else "",
            "ssd": assignment.ssd if assignment else "",
            "mess_stn": assignment.mess_stn if assignment else "",
            "section": assignment.section if assignment else "",
            "remarks": assignment.remarks if assignment else "",
        }

    def _get_personnel_department(self, personnel):
        if personnel.dept_snapshot:
            return personnel.dept_snapshot

        if personnel.person_type:
            return personnel.person_type.replace("_", " ").title()

        return "Civilian"

    def _get_assignments(self, sailing):
        personnel = sailing.personnel.all().order_by(
            "dept_snapshot",
            "rank_snapshot",
        )

        saved = {
            assignment.pno: assignment
            for assignment in PersonnelAssignment.objects.filter(
                sailing=sailing,
            )
        }

        return [self._get_assignment_data(person, saved) for person in personnel]

    def _get_assignments_response(self, sailing):
        return {
            "sailing_id": sailing.id,
            "sailing_name": sailing.name,
            "sailing_status": sailing.status,
            "personnel": self._get_assignments(sailing),
        }

    def _save_assignments(self, sailing, request):
        serializer = AssignmentsSaveSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        return serializer.save(sailing)

    @action(detail=True, methods=["get", "post"])
    def assignments(self, request, pk=None):
        """GET/POST /sailings/{id}/assignments/ - the watch & station bill grid.

        GET returns one row per person on the sailing (their saved watch/action/
        defence/... station values, blank if not set yet). POST takes
        {"rows": [...]} and upserts a PersonnelAssignment per row.
        """
        sailing = self.get_object()

        if request.method == "GET":
            return Response(self._get_assignments_response(sailing))

        updated = self._save_assignments(
            sailing,
            request,
        )

        return Response(
            {
                "status": "ok",
                "updated": updated,
            }
        )


@extend_schema(tags=["Ship Crew"])
class SailingPersonnelDetailView(APIView):
    """One person's row on a sailing, keyed by the SailingPersonnel id.

    PATCH  /sailings/personnel/{sp_id}/   edit watch / action station and
                                          status_override (refused if the
                                          sailing is completed)
    DELETE /sailings/personnel/{sp_id}/   remove them from the sailing; also
                                          deletes their PersonnelAssignment
                                          row for that sailing
    """

    def patch(self, request, sp_id):
        sp = get_object_or_404(SailingPersonnel, pk=sp_id)
        if sp.sailing.status == "completed":
            return Response(
                {"error": "Sailing is completed and locked."},
                status=status.HTTP_403_FORBIDDEN,
            )
        sp.watch_station = request.data.get("watch", sp.watch_station)
        sp.action_station = request.data.get("action", sp.action_station)
        sp.status_override = request.data.get("status", sp.status_override)
        sp.save()
        return Response({"status": "ok"})

    def delete(self, request, sp_id):
        sp = get_object_or_404(SailingPersonnel, pk=sp_id)
        PersonnelAssignment.objects.filter(
            sailing=sp.sailing, pno=sp.pno_snapshot
        ).delete()
        sp.delete()
        return Response({"status": "ok"})


# --------------------------------------------------------------------------
# Watch & Station Bill - reference/master lists
#
# Plain CRUD ViewSets (list / create / retrieve / update / delete) for the
# drop-down options used when filling in the watch & station bill: the five
# station types below plus the Junior/Senior sailor classification. Any
# signed-in user may read and edit these. There is deliberately no combined
# "ranks with already-classified flag" endpoint - the Angular app builds that
# by cross-referencing GET /api/v1/user/ranks/ with rank-classifications/.
# --------------------------------------------------------------------------


@extend_schema(tags=["Ship Crew"])
class ActionStationMasterViewSet(viewsets.ModelViewSet):
    serializer_class = ActionStationMasterSerializer
    queryset = ActionStationMaster.objects.all().order_by("name")


@extend_schema(tags=["Ship Crew"])
class DefenceStationMasterViewSet(viewsets.ModelViewSet):
    serializer_class = DefenceStationMasterSerializer
    queryset = DefenceStationMaster.objects.all().order_by("name")


@extend_schema(tags=["Ship Crew"])
class CruisingStationMasterViewSet(viewsets.ModelViewSet):
    serializer_class = CruisingStationMasterSerializer
    queryset = CruisingStationMaster.objects.all().order_by("name")


@extend_schema(tags=["Ship Crew"])
class ShelterStationMasterViewSet(viewsets.ModelViewSet):
    serializer_class = ShelterStationMasterSerializer
    queryset = ShelterStationMaster.objects.all().order_by("name")


@extend_schema(tags=["Ship Crew"])
class EmergencyStationMasterViewSet(viewsets.ModelViewSet):
    serializer_class = EmergencyStationMasterSerializer
    queryset = EmergencyStationMaster.objects.all().order_by("name")


@extend_schema(tags=["Ship Crew"])
class SailorRankClassificationViewSet(viewsets.ModelViewSet):
    serializer_class = SailorRankClassificationSerializer
    queryset = SailorRankClassification.objects.all().order_by("rank_name")
