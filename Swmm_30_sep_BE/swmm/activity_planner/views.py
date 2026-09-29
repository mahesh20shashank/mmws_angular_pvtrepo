"""
Activity Planner REST API Views
Complete backend logic ported from Django reference project to DRF ViewSet actions.
Maintains all calendar calculations, history-based due dates, and status tracking.
"""

from datetime import date, timedelta

from accounts.models import CustomUser
from dateutil.relativedelta import relativedelta
from django.db.models import Count, Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend

# Import models for calendar feed
# Import models for calendar feed
from ems.models import PlannedRoutineDescription, RoutineDescription
from op_maintenance.models import CompleteDefectDart, CompletedRoutine, InitiateDart
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .constants import ALLOWED_EVENT_MANAGER_ROLES, PlannerStatus
from .filters import EventFilterSet, PlannerActivityFilterSet
from .models import Event, PlannerActivity
from .serializers import EventSerializer, PlannerActivitySerializer

# Try to import Trials, but it may not exist in all projects
try:
    from master.models import Trials

    HAS_TRIALS = True
except ImportError:
    Trials = None
    HAS_TRIALS = False


def _calendar_event_sort_key(event):
    """Sort key for the merged calendar feed list -- entries mix plain date
    strings ("YYYY-MM-DD") and datetime strings ("YYYY-MM-DDTHH:MM:SS") in
    their "start" value, and some entries may have it missing entirely."""
    start = event.get("start") or ""
    return (start[:10], start)


# ===== CONFIGURATION CONSTANTS =====
PLAN_LEAD_TIME = relativedelta(months=6)
ALLOWED_SHIFT_DUE_DATE_ROLES = ["Head of Department", "HODWRITER"]
ALLOWED_PLANNER_ACTIVITY_ROLES = ["Head of Department", "HODWRITER"]
ALLOWED_EVENT_CREATOR_ROLES = ALLOWED_EVENT_MANAGER_ROLES


# ===== PERMISSION HELPER FUNCTIONS =====


def _can_add_planner_activity(request):
    """Check if user can add a custom planner activity (HOD/HODWRITER only)."""
    user_profile = getattr(request.user, "user_profile", None)
    if not user_profile or not user_profile.role_master:
        return False
    return user_profile.role_master.role_name in ALLOWED_PLANNER_ACTIVITY_ROLES


def _can_shift_due_date(request):
    """Check if user can shift calendar due dates (HOD/HODWRITER only)."""
    user_profile = getattr(request.user, "user_profile", None)
    if not user_profile or not user_profile.role_master:
        return False
    return user_profile.role_master.role_name in ALLOWED_SHIFT_DUE_DATE_ROLES


def _can_manage_event(request):
    """Check if user can create/edit/reschedule/cancel events (HOD/DY HOD/HODWRITER).

    A single role gate reused for every mutating Event action - there's no
    creator/owner check, so this intentionally matches whoever is allowed to
    create an event in the first place, not just the person who created it."""
    user_profile = getattr(request.user, "user_profile", None)
    if not user_profile or not user_profile.role_master:
        return False
    return user_profile.role_master.role_name in ALLOWED_EVENT_CREATOR_ROLES


# ===== CALENDAR LOGIC HELPER FUNCTIONS =====


def _history_due_from_dates(dates):
    """
    Calculate next due date from completion history.
    Gap between last two completions = observed interval.
    Next due = last completion + interval.
    Fewer than 2 completions or non-positive gap returns None.
    """
    if len(dates) < 2:
        return None
    interval_days = (dates[-1] - dates[-2]).days
    if interval_days <= 0:
        return None
    return {
        "due": dates[-1] + timedelta(days=interval_days),
        "interval_days": interval_days,
        "last_completion": dates[-1],
        "completion_count": len(dates),
    }


def _history_due_for_routine(routine):
    """Get history-derived due date for a single routine."""
    dates = list(
        CompletedRoutine.objects.filter(
            routine__add_routine_details_id=routine.add_routine_details_id,
            date_of_completion__isnull=False,
        )
        .order_by("date_of_completion")
        .values_list("date_of_completion", flat=True)
    )
    return _history_due_from_dates(dates)


def _user_profile_display_name(user_profile):
    """
    Resolve a display name for a CustomUserProfile the same way
    EventSerializer.get_created_by does - via the linked CustomUser's
    get_full_name(), falling back to the profile's own first name.
    user_profile.firstname/lastname are often blank, so preferring them
    (as the old feed code did) silently drops the creator's name.
    """
    if not user_profile:
        return "Unknown"
    user = CustomUser.objects.filter(user_profile=user_profile).first()
    if user:
        return user.get_full_name()
    return user_profile.firstname or "Unknown"


def _routine_ref_code(routine):
    """
    Generate reference code for routine.
    Prefers DART number, then routine number, then row ID.
    """
    code = (routine.dart_number or "").strip() or (routine.routine_no or "").strip()
    return code or f"R-{routine.id}"


def _routine_state(routine, reference_date=None):
    """
    Determine routine state: 'done', 'overdue', or 'upcoming'.
    Closed cycles = 'done' (grey).
    Past due date = 'overdue' (red).
    Future due date = 'upcoming' (blue).
    """
    today = timezone.now().date()
    if routine.is_close:
        return "done"
    judged_on = reference_date or routine.due_date
    if judged_on and judged_on < today:
        return "overdue"
    return "upcoming"


# ===== VIEW SETS =====


class EventViewSet(viewsets.ModelViewSet):
    """REST API for Event model - user-created events."""

    queryset = Event.objects.all()
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = EventFilterSet

    def get_queryset(self):
        """Only show events from authenticated user's department if applicable.

        Cancelled events are soft-deleted (status=cancelled, row kept for
        audit) rather than removed from the DB, so exclude them here too -
        otherwise a "deleted" event would keep showing up in lists/detail
        lookups even though the calendar feed hides it."""
        user = self.request.user
        queryset = (
            Event.objects.select_related("user_profile")
            .exclude(status=PlannerStatus.CANCELLED)
            .order_by("date", "start_time")
        )
        if hasattr(user, "user_profile") and user.user_profile.department:
            return queryset.filter(
                user_profile__department=user.user_profile.department
            )
        return queryset

    def create(self, request, *args, **kwargs):
        """Create event with permission check (HOD/DY HOD/HODWRITER only)."""
        if not _can_manage_event(request):
            return Response(
                {"detail": "Only HOD, DY HOD, and HOD Writer can create events."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        """Edit/reschedule event with permission check (HOD/DY HOD/HODWRITER only)."""
        if not _can_manage_event(request):
            return Response(
                {"detail": "Only HOD, DY HOD, and HOD Writer can edit events."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        """Edit/reschedule event with permission check (HOD/DY HOD/HODWRITER only)."""
        if not _can_manage_event(request):
            return Response(
                {"detail": "Only HOD, DY HOD, and HOD Writer can edit events."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Cancel event with permission check (HOD/DY HOD/HODWRITER only).

        Soft-cancel rather than hard-delete: marks status=cancelled instead
        of removing the row, so there's an audit trail of what was
        cancelled, when, and by whom - PlannerStatus.CANCELLED otherwise
        existed on the model but was never actually reachable."""
        if not _can_manage_event(request):
            return Response(
                {"detail": "Only HOD, DY HOD, and HOD Writer can cancel events."},
                status=status.HTTP_403_FORBIDDEN,
            )
        instance = self.get_object()
        instance.status = PlannerStatus.CANCELLED
        instance.save(update_fields=["status"])
        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def perform_create(self, serializer):
        """Assign current user to created event."""
        if hasattr(self.request.user, "user_profile"):
            serializer.save(user_profile=self.request.user.user_profile)
        else:
            serializer.save()

    @action(detail=False, methods=["get"], url_path="feed")
    def feed(self, request):
        """
        JSON feed for FullCalendar with full calendar logic.
        Returns all event types with calculated states and colors.
        Query params: start, end, categories (comma-separated)
        """
        start_str = request.GET.get("start")
        end_str = request.GET.get("end")
        categories_param = request.GET.get("categories")

        if not start_str or not end_str:
            return Response(
                {"error": "Missing start/end date parameters"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            start_date = date.fromisoformat(start_str[:10])
            end_date = date.fromisoformat(end_str[:10])
        except ValueError:
            return Response(
                {"error": "Invalid date format (use YYYY-MM-DD)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        selected_categories = None
        if categories_param:
            selected_categories = [c for c in categories_param.split(",") if c]

        # Build events list with all calendar event types
        events_list = self._build_calendar_events(
            request, start_date, end_date, selected_categories
        )

        return Response(events_list)

    def _build_calendar_events(
        self, request, start_date, end_date, selected_categories
    ):
        """Build complete calendar events list with all event types."""
        events_list = []
        today = timezone.now().date()
        user_profile = getattr(request.user, "user_profile", None)

        if not user_profile or not user_profile.department:
            return events_list

        # ===== User-Created Events =====
        evt_qs = Event.objects.filter(date__gte=start_date, date__lte=end_date).exclude(
            status=PlannerStatus.CANCELLED
        )
        if selected_categories:
            known_main = ["defect", "routine", "trial", "audit"]
            normal_cats = [c for c in selected_categories if c != "others"]
            if normal_cats:
                evt_qs = evt_qs.filter(category__in=normal_cats)
            elif "others" in selected_categories:
                evt_qs = evt_qs.exclude(category__in=known_main)

        for event in evt_qs.order_by("date", "start_time"):
            events_list.append(
                {
                    "id": event.id,
                    "title": event.title,
                    "start": f"{event.date}T{event.start_time}"
                    if event.start_time
                    else str(event.date),
                    "end": f"{event.date}T{event.end_time}" if event.end_time else None,
                    "start_time": event.start_time.strftime("%H:%M")
                    if event.start_time
                    else None,
                    "end_time": event.end_time.strftime("%H:%M")
                    if event.end_time
                    else None,
                    "category": event.category,
                    "status": event.status,
                    "status_label": event.get_status_display(),
                    "created_by": _user_profile_display_name(event.user_profile),
                    "type": "event",
                }
            )

        # ===== Get Planned Routine IDs =====
        _planned_rd_ids = (
            PlannedRoutineDescription.objects.filter(is_deleted=False)
            .values_list("routine_description_id__id", flat=True)
            .distinct()
        )
        _planned_rd_id_set = set(_planned_rd_ids)

        # ===== Completion History Data (for all routines) =====
        dept_name = user_profile.department.name if user_profile.department else None
        _completion_rows = (
            CompletedRoutine.objects.filter(
                routine__equipment_name__section__department__name__iexact=dept_name,
                date_of_completion__isnull=False,
            )
            .values_list("routine__add_routine_details_id", "date_of_completion")
            .order_by("routine__add_routine_details_id", "date_of_completion")
        )

        _completions_by_routine = {}
        for _ard_id, _completed_on in _completion_rows:
            _completions_by_routine.setdefault(_ard_id, []).append(_completed_on)

        _history_due = {}
        for _ard_id, _dates in _completions_by_routine.items():
            _info = _history_due_from_dates(_dates)
            if _info:
                _history_due[_ard_id] = _info

        _history_ards_in_range = [
            _ard_id
            for _ard_id, _info in _history_due.items()
            if start_date <= _info["due"] <= end_date
        ]

        # ===== Sub-routine counts for popups =====
        _sub_routine_totals = dict(
            RoutineDescription.objects.filter(
                equipment_name__section__department__name__iexact=dept_name
            )
            .values("add_routine_details_id")
            .annotate(n=Count("id"))
            .values_list("add_routine_details_id", "n")
        )

        def _marker_for(routine):
            """Resolve where routine's active marker goes (revised > history > nominal)."""
            if routine.calendar_revised_date:
                return routine.calendar_revised_date, None
            info = _history_due.get(routine.add_routine_details_id)
            if info and not routine.is_close:
                return info["due"], info
            return routine.due_date, None

        # ===== Regular Routines (not planned) =====
        if not selected_categories or "routine" in selected_categories:
            try:
                routines = (
                    RoutineDescription.objects.annotate(
                        effective_due=Coalesce("calendar_revised_date", "due_date")
                    )
                    .filter(
                        Q(effective_due__gte=start_date, effective_due__lte=end_date)
                        | Q(
                            add_routine_details_id__in=_history_ards_in_range,
                            is_close=False,
                        ),
                        equipment_name__section__department__name__iexact=dept_name,
                    )
                    .exclude(id__in=_planned_rd_ids)
                    .select_related(
                        "equipment_name", "routine_name", "equipment_name__section"
                    )
                )
            except Exception:
                routines = []

            for routine in routines:
                marker_date, history_info = _marker_for(routine)
                if (
                    not marker_date
                    or marker_date < start_date
                    or marker_date > end_date
                ):
                    continue

                marker_title = (
                    f"{routine.equipment_name.name[:24]} · calc"
                    if history_info
                    else routine.equipment_name.name[:30]
                )

                events_list.append(
                    {
                        "id": f"routine_{routine.id}",
                        "title": marker_title,
                        "start": str(marker_date),
                        "category": "routine",
                        "type": "routine",
                        "routine_id": routine.id,
                        "routine_state": _routine_state(
                            routine, marker_date if history_info else None
                        ),
                        "ref_code": _routine_ref_code(routine),
                        "due_date": str(routine.due_date) if routine.due_date else None,
                        "calendar_revised_date": str(routine.calendar_revised_date)
                        if routine.calendar_revised_date
                        else "",
                        "from_history": bool(history_info),
                        "history_interval_days": history_info["interval_days"]
                        if history_info
                        else None,
                        "history_last_completion": str(history_info["last_completion"])
                        if history_info
                        else "",
                        "history_completion_count": history_info["completion_count"]
                        if history_info
                        else None,
                        "detail_pk": routine.add_routine_details_id,
                        "routine_label": routine.routine_name.name
                        if routine.routine_name
                        else "N/A",
                        "sub_routine_total": _sub_routine_totals.get(
                            routine.add_routine_details_id, 0
                        ),
                    }
                )

        # ===== Planned Routines =====
        if not selected_categories or "planned_routine" in selected_categories:
            try:
                planned_routines = (
                    RoutineDescription.objects.annotate(
                        effective_due=Coalesce("calendar_revised_date", "due_date")
                    )
                    .filter(
                        Q(
                            Q(
                                effective_due__gte=start_date,
                                effective_due__lte=end_date,
                            )
                            | Q(
                                add_routine_details_id__in=_history_ards_in_range,
                                is_close=False,
                            )
                            | Q(effective_due__isnull=True)
                        ),
                        id__in=_planned_rd_ids,
                        equipment_name__section__department__name__iexact=dept_name,
                    )
                    .select_related(
                        "equipment_name", "routine_name", "equipment_name__section"
                    )
                )

            except Exception:
                planned_routines = []

            for routine in planned_routines:
                planned_rd = PlannedRoutineDescription.objects.filter(
                    routine_description_id=routine.id
                ).first()
                planned_date = (
                    planned_rd.planned_commencement_date if planned_rd else None
                )

                marker_date = (
                    planned_date
                    or routine.calendar_revised_date
                    or routine.due_date
                    or today
                )
                if marker_date < start_date or marker_date > end_date:
                    continue

                marker_title = (
                    f"{routine.equipment_name.name[:22]} · calc"
                    if planned_date is None and routine.due_date
                    else routine.equipment_name.name[:28]
                )

                events_list.append(
                    {
                        "id": f"planned_{routine.id}",
                        "title": marker_title,
                        "start": str(marker_date),
                        "category": "planned_routine",
                        "type": "planned_routine",
                        "routine_id": routine.id,
                        "routine_state": _routine_state(routine, marker_date),
                        "ref_code": _routine_ref_code(routine),
                        "due_date": str(routine.due_date) if routine.due_date else None,
                        "calendar_revised_date": str(routine.calendar_revised_date)
                        if routine.calendar_revised_date
                        else "",
                        "from_history": False,
                        "history_interval_days": None,
                        "history_last_completion": "",
                        "history_completion_count": None,
                        "detail_pk": routine.add_routine_details_id,
                        "routine_label": routine.routine_name.name
                        if routine.routine_name
                        else "N/A",
                        "sub_routine_total": _sub_routine_totals.get(
                            routine.add_routine_details_id, 0
                        ),
                    }
                )

        # ===== Original Due Markers (when revised date exists) =====
        original_due_routines = RoutineDescription.objects.filter(
            equipment_name__section__department__name__iexact=dept_name,
            calendar_revised_date__isnull=False,
            due_date__gte=start_date,
            due_date__lte=end_date,
        ).select_related("equipment_name")

        for routine in original_due_routines:
            marker_category = (
                "planned_routine" if routine.id in _planned_rd_id_set else "routine"
            )
            if (
                selected_categories
                and marker_category not in selected_categories
                and "others" not in selected_categories
            ):
                continue

            events_list.append(
                {
                    "id": f"origdue_{routine.id}",
                    "title": "original due",
                    "start": str(routine.due_date),
                    "category": marker_category,
                    "type": "original_due",
                    "routine_id": routine.id,
                    "ref_code": _routine_ref_code(routine),
                    "is_original_due": True,
                    "routine_state": _routine_state(routine),
                    "due_date": str(routine.due_date) if routine.due_date else None,
                    "calendar_revised_date": str(routine.calendar_revised_date)
                    if routine.calendar_revised_date
                    else "",
                    "equipment": routine.equipment_name.name[:40],
                }
            )

        # ===== Plan Flags (6 months ahead of due dates) =====
        if not selected_categories or "plan_flag" in selected_categories:
            plan_window = Q(
                due_date__gte=start_date + PLAN_LEAD_TIME,
                due_date__lte=end_date + PLAN_LEAD_TIME,
            )
            if start_date <= today <= end_date:
                plan_window |= Q(due_date__lt=today + PLAN_LEAD_TIME)

            plan_flag_routines = (
                RoutineDescription.objects.filter(
                    equipment_name__section__department__name__iexact=dept_name,
                    is_close=False,
                    due_date__isnull=False,
                )
                .filter(plan_window)
                .select_related("equipment_name", "routine_name")
            )

            for routine in plan_flag_routines:
                natural_plan_date = routine.due_date - PLAN_LEAD_TIME
                display_date = max(natural_plan_date, today)

                if display_date < start_date or display_date > end_date:
                    continue

                if routine.id in _planned_rd_id_set:
                    plan_state = "planned"
                elif natural_plan_date < today:
                    plan_state = "overdue"
                else:
                    plan_state = "due"

                events_list.append(
                    {
                        "id": f"planflag_{routine.id}",
                        "title": "Plan routine",
                        "start": str(display_date),
                        "category": "plan_flag",
                        "type": "plan_flag",
                        "routine_id": routine.id,
                        "plan_state": plan_state,
                        "equipment": routine.equipment_name.name[:40],
                        "due_date": str(routine.due_date) if routine.due_date else None,
                        "ref_code": _routine_ref_code(routine),
                        "routine_name": routine.routine_name.name
                        if routine.routine_name
                        else "N/A",
                        "plan_date": str(natural_plan_date),
                        "plan_date_clamped": display_date != natural_plan_date,
                        "calendar_revised_date": str(routine.calendar_revised_date)
                        if routine.calendar_revised_date
                        else "",
                        "detail_pk": routine.add_routine_details_id,
                    }
                )

        # ===== Trials =====
        if HAS_TRIALS and (not selected_categories or "trial" in selected_categories):
            trials = (
                Trials.objects.filter(
                    sub_department__department_name=user_profile.department,
                    trial_date__gte=start_date,
                    trial_date__lte=end_date,
                )
                .exclude(trial_date__isnull=True)
                .exclude(status=3)
                .select_related("equipment", "trial_type", "sub_department")
            )

            for trial in trials:
                eq_name = ""
                if trial.equipment and trial.equipment.nomenclature:
                    eq_name = str(trial.equipment.nomenclature)[:30]
                t_title = eq_name or trial.trial_number or "Trial"

                events_list.append(
                    {
                        "id": f"trial_{trial.id}",
                        "title": t_title,
                        "start": str(trial.trial_date),
                        "category": "trial",
                        "type": "trial",
                        "trial_id": trial.id,
                    }
                )

        # ===== Open Defects (DARTs) =====
        if not selected_categories or "defect" in selected_categories:
            defects = InitiateDart.objects.filter(
                department_id=user_profile.department,
                is_closed=False,
                rectification_date__gte=start_date,
                rectification_date__lte=end_date,
            ).select_related("equipment_ems", "equipment_ship")

            for defect in defects:
                eq_name = ""
                if defect.equipment_ship and defect.equipment_ship.nomenclature:
                    eq_name = defect.equipment_ship.nomenclature[:28]
                elif defect.equipment_ems:
                    eq_name = defect.equipment_ems.name[:28]
                title = eq_name or defect.dart_number or "Defect"

                events_list.append(
                    {
                        "id": f"defect_{defect.id}",
                        "title": title,
                        "start": str(defect.rectification_date),
                        "category": "defect",
                        "type": "db_defect",
                        "defect_id": defect.id,
                        "dart_state": "overdue"
                        if defect.rectification_date < today
                        else "pending",
                        "ref_code": defect.dart_number or f"D-{defect.id}",
                        "dart_number": defect.dart_number or "",
                        "dart_date": str(defect.dart_date) if defect.dart_date else "",
                        "close_by": str(defect.rectification_date),
                    }
                )

        # ===== Closed Defects =====
        if not selected_categories or "defect" in selected_categories:
            closed_darts = InitiateDart.objects.filter(
                department_id=user_profile.department,
                is_closed=True,
            ).select_related("equipment_ems", "equipment_ship")

            _closed_on = dict(
                CompleteDefectDart.objects.filter(
                    dart_details__in=closed_darts, rectified_date__isnull=False
                ).values_list("dart_details_id", "rectified_date")
            )

            for defect in closed_darts:
                closure_date = _closed_on.get(defect.id) or defect.rectification_date
                if (
                    not closure_date
                    or closure_date < start_date
                    or closure_date > end_date
                ):
                    continue

                eq_name = ""
                if defect.equipment_ship and defect.equipment_ship.nomenclature:
                    eq_name = defect.equipment_ship.nomenclature[:28]
                elif defect.equipment_ems:
                    eq_name = defect.equipment_ems.name[:28]
                title = eq_name or defect.dart_number or "Defect"

                events_list.append(
                    {
                        "id": f"dartclosed_{defect.id}",
                        "title": f"{title} (closed)",
                        "start": str(closure_date),
                        "category": "defect",
                        "type": "dart_closed",
                        "defect_id": defect.id,
                        "dart_state": "closed",
                        "ref_code": defect.dart_number or f"D-{defect.id}",
                        "dart_number": defect.dart_number or "",
                        "dart_date": str(defect.dart_date) if defect.dart_date else "",
                        "close_by": str(defect.rectification_date)
                        if defect.rectification_date
                        else "",
                        "closed_on": str(closure_date),
                    }
                )

        # ===== Raised Defects =====
        if not selected_categories or "defect" in selected_categories:
            raised_darts = InitiateDart.objects.filter(
                department_id=user_profile.department,
                dart_date__gte=start_date,
                dart_date__lte=end_date,
            ).select_related("equipment_ems", "equipment_ship")

            for defect in raised_darts:
                events_list.append(
                    {
                        "id": f"dartraised_{defect.id}",
                        "title": f"{defect.dart_number or 'DART'} raised",
                        "start": str(defect.dart_date),
                        "category": "defect",
                        "type": "dart_raised",
                        "defect_id": defect.id,
                        "dart_state": "raised",
                        "ref_code": defect.dart_number or f"D-{defect.id}",
                        "dart_number": defect.dart_number or "",
                        "dart_date": str(defect.dart_date),
                        "close_by": str(defect.rectification_date)
                        if defect.rectification_date
                        else "",
                    }
                )

        # ===== Routine DARTs =====
        if not selected_categories or "routine" in selected_categories:
            routine_darts = (
                RoutineDescription.objects.annotate(
                    effective_due=Coalesce("calendar_revised_date", "due_date")
                )
                .filter(
                    equipment_name__section__department__name__iexact=dept_name,
                    is_close=False,
                    dart_number__startswith="M-",
                    effective_due__gte=start_date,
                    effective_due__lte=end_date,
                )
                .select_related("equipment_name")
            )

            for routine in routine_darts:
                close_by = routine.effective_due
                events_list.append(
                    {
                        "id": f"rtdart_{routine.id}",
                        "title": routine.dart_number,
                        "start": str(close_by),
                        "category": "routine",
                        "type": "routine_dart",
                        "routine_id": routine.id,
                        "dart_state": "overdue" if close_by < today else "pending",
                        "ref_code": _routine_ref_code(routine),
                        "dart_number": routine.dart_number or "",
                        "equipment": routine.equipment_name.name[:40],
                        "close_by": str(close_by),
                        "dart_date": str(routine.previous_completed_date)
                        if routine.previous_completed_date
                        else "",
                    }
                )

        # ===== Raised Routine DARTs =====
        raised_routine_darts = RoutineDescription.objects.filter(
            equipment_name__section__department__name__iexact=dept_name,
            is_close=False,
            dart_number__startswith="M-",
            previous_completed_date__gte=start_date,
            previous_completed_date__lte=end_date,
        ).select_related("equipment_name")

        for routine in raised_routine_darts:
            events_list.append(
                {
                    "id": f"rtdartraised_{routine.id}",
                    "title": f"{routine.dart_number} raised",
                    "start": str(routine.previous_completed_date),
                    "category": "routine",
                    "type": "dart_raised",
                    "routine_id": routine.id,
                    "dart_state": "raised",
                    "ref_code": _routine_ref_code(routine),
                    "dart_number": routine.dart_number or "",
                    "equipment": routine.equipment_name.name[:40],
                    "dart_date": str(routine.previous_completed_date),
                    "close_by": str(routine.due_date) if routine.due_date else "",
                }
            )

        # ===== Custom Planner Activities =====
        if not selected_categories or "planner_activity" in selected_categories:
            planner_activities = (
                PlannerActivity.objects.filter(
                    department=user_profile.department,
                    date__gte=start_date,
                    date__lte=end_date,
                )
                .select_related("created_by")
                .order_by("date", "start_time")
            )

            for activity in planner_activities:
                events_list.append(
                    {
                        "id": f"activity_{activity.id}",
                        "title": activity.title[:30],
                        "start": str(activity.date),
                        "category": "planner_activity",
                        "type": "planner_activity",
                        "activity_id": activity.id,
                        "activity_title": activity.title,
                        "activity_date": str(activity.date),
                        "created_by": _user_profile_display_name(activity.created_by),
                    }
                )

        events_list.sort(key=_calendar_event_sort_key)
        return events_list

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """
        Get calendar summary: total counts by category.
        Returns event counts for display in sidebar/header.
        """
        user_profile = getattr(request.user, "user_profile", None)
        if not user_profile or not user_profile.department:
            return Response(
                {
                    "total_events": 0,
                    "can_create_event": False,
                    "can_shift_due_date": False,
                    "can_add_planner_activity": False,
                    "pending_planning_count": 0,
                    "pending_planning_overdue_count": 0,
                }
            )

        today = timezone.now().date()

        # Count user-created events
        events_count = Event.objects.filter(
            user_profile__department=user_profile.department
        ).count()

        # Count planned routines
        _planned_rd_ids = (
            PlannedRoutineDescription.objects.filter(is_deleted=False)
            .values_list("routine_description_id__id", flat=True)
            .distinct()
        )

        planned_routines_count = RoutineDescription.objects.filter(
            id__in=_planned_rd_ids,
            equipment_name__section__department=user_profile.department,
            due_date__isnull=False,
            is_close=False,
        ).count()

        # Count regular routines
        routines_count = (
            RoutineDescription.objects.filter(
                equipment_name__section__department=user_profile.department,
                due_date__isnull=False,
                is_close=False,
            )
            .exclude(id__in=_planned_rd_ids)
            .count()
        )

        # Count open defects (DARTs)
        defects_count = (
            InitiateDart.objects.filter(
                department_id=user_profile.department, is_closed=False
            )
            .exclude(dart_date__isnull=True)
            .count()
        )

        # Count trials
        trials_count = 0
        if HAS_TRIALS:
            trials_count = (
                Trials.objects.filter(
                    sub_department__department_name=user_profile.department
                )
                .exclude(trial_date__isnull=True)
                .exclude(status=3)
                .count()
            )

        total_events = (
            events_count
            + routines_count
            + planned_routines_count
            + defects_count
            + trials_count
        )

        # Count routines needing planning (6-month horizon)
        _unplanned_routines = RoutineDescription.objects.filter(
            equipment_name__section__department=user_profile.department,
            is_greater_than_3_monthly=True,
            is_close=False,
            due_date__isnull=False,
        ).exclude(id__in=_planned_rd_ids)

        pending_planning_count = _unplanned_routines.count()
        pending_planning_overdue_count = _unplanned_routines.filter(
            due_date__lt=today + PLAN_LEAD_TIME
        ).count()

        return Response(
            {
                "total_events": total_events,
                "events": events_count,
                "routines": routines_count,
                "planned_routines": planned_routines_count,
                "defects": defects_count,
                "trials": trials_count,
                "can_create_event": _can_manage_event(request),
                "can_edit_event": _can_manage_event(request),
                "can_cancel_event": _can_manage_event(request),
                "can_shift_due_date": _can_shift_due_date(request),
                "can_add_planner_activity": _can_add_planner_activity(request),
                "pending_planning_count": pending_planning_count,
                "pending_planning_overdue_count": pending_planning_overdue_count,
            }
        )

    @action(detail=False, methods=["get"], url_path="overdue-darts")
    def overdue_darts(self, request):
        """Get open DARTs whose closing date has already passed."""
        user_profile = getattr(request.user, "user_profile", None)
        if not user_profile:
            return Response({"count": 0, "results": []})

        today = timezone.now().date()

        overdue_qs = (
            InitiateDart.objects.filter(
                department_id=user_profile.department,
                is_closed=False,
                rectification_date__isnull=False,
                rectification_date__lt=today,
            )
            .select_related("equipment_ship", "equipment_ems")
            .order_by("rectification_date", "id")
        )

        data = []
        for idx, dart in enumerate(overdue_qs, start=1):
            equipment_name = ""
            if dart.equipment_ship and dart.equipment_ship.nomenclature:
                equipment_name = dart.equipment_ship.nomenclature
            elif dart.equipment_ems and dart.equipment_ems.name:
                equipment_name = dart.equipment_ems.name

            days_overdue = (
                (today - dart.rectification_date).days if dart.rectification_date else 0
            )

            data.append(
                {
                    "ser": idx,
                    "id": dart.id,
                    "dart_number": dart.dart_number or "-",
                    "defect_date": dart.dart_date.strftime("%d %b %Y")
                    if dart.dart_date
                    else "-",
                    "closing_date": dart.rectification_date.strftime("%d %b %Y")
                    if dart.rectification_date
                    else "-",
                    "status": "Open",
                    "equipment": equipment_name or "-",
                    "description": dart.defective_discriptions or "-",
                    "days_overdue": days_overdue,
                }
            )

        return Response({"count": len(data), "results": data})


class PlannerActivityViewSet(viewsets.ModelViewSet):
    """REST API for PlannerActivity model - HOD/HOD Writer calendar activities."""

    queryset = PlannerActivity.objects.all()
    serializer_class = PlannerActivitySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = PlannerActivityFilterSet

    def get_queryset(self):
        """Filter activities by user's department."""
        user = self.request.user
        if hasattr(user, "user_profile") and user.user_profile.department:
            return (
                PlannerActivity.objects.filter(department=user.user_profile.department)
                .select_related("department", "ship", "created_by")
                .order_by("date", "start_time")
            )
        return PlannerActivity.objects.all().order_by("date", "start_time")

    def create(self, request, *args, **kwargs):
        """Create activity with permission check (HOD/HODWRITER only)."""
        if not _can_add_planner_activity(request):
            return Response(
                {"detail": "Only HOD and HOD Writer can add activities."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        """Assign current user as creator and department."""
        user_profile = getattr(self.request.user, "user_profile", None)
        if user_profile:
            serializer.save(
                created_by=user_profile,
                department=user_profile.department,
                ship=getattr(user_profile, "ship", None),
            )
        else:
            serializer.save()

    @action(detail=False, methods=["get"], url_path="pending-planning")
    def pending_planning(self, request):
        """Get routines that need planning (quarterly-and-above, not yet planned)."""
        user_profile = getattr(request.user, "user_profile", None)
        if not user_profile:
            return Response({"total": 0, "overdue": 0})

        today = timezone.now().date()

        _planned_rd_ids = (
            PlannedRoutineDescription.objects.filter(is_deleted=False)
            .values_list("routine_description_id__id", flat=True)
            .distinct()
        )

        _unplanned_routines = RoutineDescription.objects.filter(
            equipment_name__section__department=user_profile.department,
            is_greater_than_3_monthly=True,
            is_close=False,
            due_date__isnull=False,
        ).exclude(id__in=_planned_rd_ids)

        total = _unplanned_routines.count()
        overdue = _unplanned_routines.filter(
            due_date__lt=today + PLAN_LEAD_TIME
        ).count()

        return Response(
            {
                "total": total,
                "overdue": overdue,
                "planning_lead_days": PLAN_LEAD_TIME.days,
            }
        )

    @action(detail=False, methods=["get"], url_path="shift-routines")
    def shift_routines(self, request):
        """Get routines eligible for shifting due dates (next 6 months, not closed)."""
        if not _can_shift_due_date(request):
            return Response(
                {"detail": "Only HOD and HOD Writer can view shiftable routines."},
                status=status.HTTP_403_FORBIDDEN,
            )

        user_profile = getattr(request.user, "user_profile", None)
        if not user_profile:
            return Response(
                {"detail": "User profile not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        today = timezone.now().date()
        horizon_end = today + PLAN_LEAD_TIME

        routines = (
            RoutineDescription.objects.filter(
                equipment_name__section__department=user_profile.department,
                is_greater_than_3_monthly=True,
                is_close=False,
                due_date__gte=today,
                due_date__lte=horizon_end,
            )
            .select_related("equipment_name", "routine_name")
            .order_by("due_date", "equipment_name__name")
        )

        data = []
        for routine in routines:
            data.append(
                {
                    "id": routine.id,
                    "equipment_name": routine.equipment_name.name
                    if routine.equipment_name
                    else "N/A",
                    "routine_name": routine.routine_name.name
                    if routine.routine_name
                    else "N/A",
                    "due_date": routine.due_date.isoformat()
                    if routine.due_date
                    else None,
                    "calendar_revised_date": routine.calendar_revised_date.isoformat()
                    if routine.calendar_revised_date
                    else None,
                    "ref_code": _routine_ref_code(routine),
                }
            )

        return Response(
            {
                "can_shift": True,
                "horizon_end": horizon_end.isoformat(),
                "routines": data,
            }
        )

    @action(detail=False, methods=["put"], url_path="set-revised-date")
    def set_revised_date(self, request):
        """
        Set or clear calendar revised date for one or more routines.
        Permission: HOD/HODWRITER only.

        Accepts a single {routine_id, calendar_revised_date} object (kept for
        backward compatibility) or a list of them, so the "Shift Due Date"
        table can save every edited row in one request instead of one PUT
        per row.
        """
        if not _can_shift_due_date(request):
            return Response(
                {"detail": "Only HOD and HOD Writer can reschedule due dates."},
                status=status.HTTP_403_FORBIDDEN,
            )

        user_profile = getattr(request.user, "user_profile", None)
        if not user_profile:
            return Response(
                {"detail": "User profile not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = request.data
        if isinstance(payload, dict):
            payload = [payload]
        if not isinstance(payload, list) or not payload:
            return Response(
                {
                    "detail": (
                        "Expected a {routine_id, calendar_revised_date} object "
                        "or a non-empty array of them."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = []
        for item in payload:
            routine_id = (item or {}).get("routine_id")
            revised_date_str = ((item or {}).get("calendar_revised_date") or "").strip()

            # Ensure routine belongs to user's department
            routine = RoutineDescription.objects.filter(
                id=routine_id,
                equipment_name__section__department=user_profile.department,
            ).first()

            if not routine:
                results.append(
                    {
                        "routine_id": routine_id,
                        "status": "error",
                        "detail": "Routine not found.",
                    }
                )
                continue

            try:
                if revised_date_str:
                    routine.calendar_revised_date = date.fromisoformat(revised_date_str)
                else:
                    routine.calendar_revised_date = None
                routine.save(update_fields=["calendar_revised_date"])
            except ValueError:
                results.append(
                    {
                        "routine_id": routine_id,
                        "status": "error",
                        "detail": "Invalid date format.",
                    }
                )
                continue

            results.append(
                {
                    "routine_id": routine.id,
                    "status": "success",
                    "calendar_revised_date": str(routine.calendar_revised_date)
                    if routine.calendar_revised_date
                    else "",
                    "due_date": str(routine.due_date) if routine.due_date else "",
                }
            )

        has_failure = any(r["status"] == "error" for r in results)
        return Response(
            {"results": results},
            status=status.HTTP_207_MULTI_STATUS if has_failure else status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="choices")
    def choices(self, request):
        """
        Get available choices for Event and Activity dropdowns + permissions.
        Returns format: {"categories": [...], "statuses": [...], "priorities": [...], "lanes": [...], "can_create_event": bool, "can_add_planner_activity": bool}
        """
        from .constants import PlannerLane, PlannerPriority, PlannerStatus

        return Response(
            {
                "categories": [
                    {"value": choice[0], "label": choice[1]}
                    for choice in Event.CATEGORY_CHOICES
                ],
                "filter_categories": [
                    {"value": choice[0], "label": choice[1]}
                    for choice in Event.CATEGORY_CHOICES
                ]
                + [
                    {"value": "planned_routine", "label": "Planned Routine"},
                    {"value": "plan_flag", "label": "Plan Routine"},
                    {"value": "planner_activity", "label": "My Activities"},
                    {"value": "others", "label": "Others"},
                ],
                "statuses": [
                    {"value": choice[0], "label": choice[1]}
                    for choice in PlannerStatus.choices
                ],
                "priorities": [
                    {"value": choice[0], "label": choice[1]}
                    for choice in PlannerPriority.choices
                ],
                "lanes": [
                    {"value": choice[0], "label": choice[1]}
                    for choice in PlannerLane.choices
                ],
                "can_create_event": _can_manage_event(request),
                "can_edit_event": _can_manage_event(request),
                "can_cancel_event": _can_manage_event(request),
                "can_add_planner_activity": _can_add_planner_activity(request),
                "can_shift_due_date": _can_shift_due_date(request),
            }
        )

    @action(detail=False, methods=["get"], url_path="dashboard")
    def dashboard(self, request):
        """
        Get dashboard summary data with activity counts and status breakdowns.
        Query params: start_date, end_date, category (optional)
        Returns: summary counts, notifications, inbox items, conflicts, overdue, and upcoming activities.
        """
        user_profile = getattr(request.user, "user_profile", None)
        if not user_profile or not user_profile.department:
            return Response(
                {
                    "summary": {
                        "total": 0,
                        "scheduled": 0,
                        "active": 0,
                        "delayed": 0,
                        "conflict": 0,
                        "completed": 0,
                        "cancelled": 0,
                    },
                    "notifications": [],
                    "inbox": [],
                    "conflicts": [],
                    "overdue": [],
                    "upcoming": [],
                }
            )

        today = timezone.now().date()

        # Get query parameters
        start_date_str = request.GET.get("start_date")
        end_date_str = request.GET.get("end_date")
        category = request.GET.get("category")

        # Parse dates if provided
        start_date = None
        end_date = None
        try:
            if start_date_str:
                start_date = date.fromisoformat(start_date_str)
            if end_date_str:
                end_date = date.fromisoformat(end_date_str)
        except ValueError:
            pass

        # Build base queryset for user's department
        queryset = PlannerActivity.objects.filter(
            department=user_profile.department
        ).select_related("department", "ship", "created_by")

        # Apply category filter if provided
        if category:
            queryset = queryset.filter(category=category)

        # Apply date range filter if provided
        if start_date and end_date:
            queryset = queryset.filter(date__gte=start_date, date__lte=end_date)
        elif start_date:
            queryset = queryset.filter(date__gte=start_date)
        elif end_date:
            queryset = queryset.filter(date__lte=end_date)

        # Get summary counts by status
        summary_counts = (
            queryset.values("status").annotate(count=Count("id")).order_by("status")
        )

        summary = {
            "total": queryset.count(),
            "scheduled": 0,
            "active": 0,
            "delayed": 0,
            "conflict": 0,
            "completed": 0,
            "cancelled": 0,
        }

        for item in summary_counts:
            status_key = item["status"]
            if status_key in summary:
                summary[status_key] = item["count"]

        # Get notifications (delayed or conflict items)
        notifications_qs = queryset.filter(
            Q(status="delayed") | Q(conflict=True)
        ).order_by("-updated_at")[:10]

        notifications = [
            {
                "id": item.id,
                "title": item.title,
                "type": "conflict" if item.conflict else "delayed",
                "status": item.status,
                "date": item.date.isoformat() if item.date else None,
                "priority": item.priority or "medium",
            }
            for item in notifications_qs
        ]

        # Get inbox items (recently created or updated)
        inbox_qs = queryset.filter(status="scheduled").order_by("-created_at")[:10]

        inbox = [
            {
                "id": item.id,
                "title": item.title,
                "category": item.category,
                "date": item.date.isoformat() if item.date else None,
                "created_by": _user_profile_display_name(item.created_by),
            }
            for item in inbox_qs
        ]

        # Get conflicts
        conflicts_qs = queryset.filter(conflict=True).order_by("date")

        conflicts = [
            {
                "id": item.id,
                "title": item.title,
                "date": item.date.isoformat() if item.date else None,
                "status": item.status,
            }
            for item in conflicts_qs
        ]

        # Get overdue items (past due date with pending status)
        overdue_qs = queryset.filter(
            Q(status="scheduled") | Q(status="active") | Q(status="delayed"),
            date__lt=today,
        ).order_by("date")

        overdue = [
            {
                "id": item.id,
                "title": item.title,
                "date": item.date.isoformat() if item.date else None,
                "days_overdue": (today - item.date).days if item.date else 0,
                "status": item.status,
                "priority": item.priority or "medium",
            }
            for item in overdue_qs
        ]

        # Get upcoming items (within next 30 days, not yet completed)
        upcoming_date = today + timedelta(days=30)
        upcoming_qs = queryset.filter(
            Q(status="scheduled") | Q(status="active"),
            date__gte=today,
            date__lte=upcoming_date,
        ).order_by("date")[:15]

        upcoming = [
            {
                "id": item.id,
                "title": item.title,
                "date": item.date.isoformat() if item.date else None,
                "days_until": (item.date - today).days if item.date else 0,
                "priority": item.priority or "medium",
            }
            for item in upcoming_qs
        ]

        return Response(
            {
                "summary": summary,
                "notifications": notifications,
                "inbox": inbox,
                "conflicts": conflicts,
                "overdue": overdue,
                "upcoming": upcoming,
            }
        )
