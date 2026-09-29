from collections import Counter
from datetime import datetime, timedelta

from django.db.models import Q, QuerySet
from django.utils import timezone
from ems.models import PlannedRoutineDescription, RoutineDescription
from op_maintenance.models import InitiateDart

from .constants import PlannerCategory, PlannerLane, get_lane_for_department


def parse_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def apply_activity_filters(queryset: QuerySet, params) -> QuerySet:
    start_date = params.get("start_date")
    end_date = params.get("end_date")
    department = params.get("department")
    category = params.get("category")
    status = params.get("status")
    ship_id = params.get("ship_id")
    chip = params.get("chip")

    if start_date:
        queryset = queryset.filter(date__gte=start_date)
    if end_date:
        queryset = queryset.filter(date__lte=end_date)
    if department:
        queryset = queryset.filter(department__name__in=parse_csv(department))
    if category:
        queryset = queryset.filter(category__in=parse_csv(category))
    if status:
        queryset = queryset.filter(status__in=parse_csv(status))
    if ship_id:
        queryset = queryset.filter(ship_id=ship_id)

    if chip:
        chip_value = chip.strip().lower()
        if chip_value == "today":
            queryset = queryset.filter(date=timezone.localdate())
        elif chip_value == "delayed":
            queryset = queryset.filter(delayed=True)
        elif chip_value == "conflict":
            queryset = queryset.filter(conflict=True)
        elif chip_value == "others":
            queryset = queryset.filter(category=PlannerCategory.OTHERS)
        elif chip_value == "trial":
            queryset = queryset.filter(category=PlannerCategory.TRIAL)
        elif chip_value == "active":
            queryset = queryset.filter(active=True)

    return queryset


def summarize_activities(queryset: QuerySet) -> dict:
    category_counts = Counter(queryset.values_list("category", flat=True))
    today = timezone.localdate()
    return {
        "category_cards": [
            {
                "key": category.value,
                "label": category.label,
                "count": category_counts.get(category.value, 0),
            }
            for category in PlannerCategory
        ],
        "conflict_count": queryset.filter(conflict=True).count(),
        "delayed_count": queryset.filter(delayed=True).count(),
        "active_count": queryset.filter(active=True).count(),
        "upcoming_count": queryset.filter(date__gte=today).count(),
    }


def format_when(dt) -> str:
    if not dt:
        return ""
    local_dt = timezone.localtime(dt)
    today = timezone.localdate()
    if local_dt.date() == today:
        return local_dt.strftime("%H:%M")
    if local_dt.date() == today - timedelta(days=1):
        return "Yesterday"
    delta_days = (today - local_dt.date()).days
    if delta_days > 0:
        return f"{delta_days}d ago"
    if local_dt.date() == today + timedelta(days=1):
        return "Tomorrow"
    if 0 < (local_dt.date() - today).days < 7:
        return f"In {(local_dt.date() - today).days}d"
    return local_dt.strftime("%d %b")


def format_activity_range(activity) -> str:
    start = activity.start_time.strftime("%H%M")
    if activity.end_time:
        end = activity.end_time.strftime("%H%M")
        return f"{start} hrs - {end} hrs"
    return f"{start} hrs"


# def build_notifications(queryset: QuerySet, user=None) -> list[dict]:
#     notifications: list[dict] = []

#     conflict = queryset.filter(conflict=True).order_by("date", "start_time").first()
#     if conflict:
#         notifications.append(
#             {
#                 "id": conflict.id,
#                 "kind": "alert",
#                 "icon": "alert",
#                 "title": "Conflict detected",
#                 "body": f"{conflict.title} overlaps with another activity on {conflict.date:%d %b}.",
#                 "when": format_when(
#                     timezone.make_aware(
#                         datetime.combine(conflict.date, conflict.start_time)
#                     )
#                 ),
#             }
#         )

#     delayed = queryset.filter(delayed=True).order_by("date", "start_time").first()
#     if delayed:
#         notifications.append(
#             {
#                 "id": delayed.id,
#                 "kind": "warn",
#                 "icon": "clock",
#                 "title": f"{delayed.title} delayed",
#                 "body": f"Scheduled window has passed for {delayed.title}.",
#                 "when": format_when(
#                     timezone.make_aware(
#                         datetime.combine(delayed.date, delayed.start_time)
#                     )
#                 ),
#             }
#         )

#     active = queryset.filter(active=True).order_by("date", "start_time").first()
#     if active:
#         notifications.append(
#             {
#                 "id": active.id,
#                 "kind": "info",
#                 "icon": "bell",
#                 "title": f"{active.title} in progress",
#                 "body": f"{active.title} is currently active in {active.get_lane_display()}.",
#                 "when": format_when(
#                     timezone.make_aware(
#                         datetime.combine(active.date, active.start_time)
#                     )
#                 ),
#             }
#         )

#     unread_count = 0
#     if user and getattr(user, "is_authenticated", False):
#         unread_count = UserMessage.objects.filter(
#             recipient=user, status="unread"
#         ).count()
#         if unread_count:
#             latest_message = (
#                 UserMessage.objects.filter(recipient=user)
#                 .order_by("-created_at")
#                 .first()
#             )
#             if latest_message:
#                 notifications.append(
#                     {
#                         "id": latest_message.id,
#                         "kind": "info",
#                         "icon": "mail",
#                         "title": "Inbox updated",
#                         "body": f"You have {unread_count} unread messages.",
#                         "when": format_when(latest_message.created_at),
#                     }
#                 )

#     if not notifications:
#         notifications.append(
#             {
#                 "id": 0,
#                 "kind": "info",
#                 "icon": "refresh",
#                 "title": "Sync complete",
#                 "body": "Planner data is up to date.",
#                 "when": "Now",
#             }
#         )

#     return notifications[:5]


# def build_inbox_messages(user) -> list[dict]:
#     if not user or not getattr(user, "is_authenticated", False):
#         return []

#     messages = (
#         UserMessage.objects.filter(recipient=user)
#         .select_related("sender", "recipient")
#         .order_by("-created_at")[:6]
#     )
#     payload = []
#     for message in messages:
#         sender_name = message.sender.get_full_name() or message.sender.username
#         payload.append(
#             {
#                 "id": message.id,
#                 "unread": message.status == "unread",
#                 "sender": sender_name,
#                 "subject": message.msg_short_title or message.msg_title,
#                 "preview": (message.msg_body or "")[:72],
#                 "when": format_when(message.created_at),
#             }
#         )
#     return payload


def build_conflict_cards(queryset: QuerySet) -> list[dict]:
    cards = []
    for activity in queryset.filter(conflict=True).order_by("date", "start_time")[:3]:
        cards.append(
            {
                "id": activity.id,
                "a": activity.title,
                "when": f"{activity.date:%d %b}, {format_activity_range(activity)}",
            }
        )
    return cards


def build_overdue_cards(queryset: QuerySet) -> list[dict]:
    cards = []
    today = timezone.localdate()
    for activity in queryset.filter(delayed=True).order_by("date", "start_time")[:3]:
        days = (today - activity.date).days
        if days <= 0:
            by = "Overdue today"
        elif days == 1:
            by = "Overdue by 1 Day"
        else:
            by = f"Overdue by {days} Days"
        cards.append({"id": activity.id, "a": activity.title, "by": by})
    return cards


def build_upcoming_cards(queryset: QuerySet) -> list[dict]:
    cards = []
    for activity in queryset.filter(date__gte=timezone.localdate()).order_by(
        "date", "start_time"
    )[:3]:
        cards.append(
            {
                "id": activity.id,
                "d": activity.date.strftime("%d %b"),
                "a": activity.title,
            }
        )
    return cards


def _activity_window(activity) -> tuple[datetime | None, datetime | None]:
    start = timezone.make_aware(datetime.combine(activity.date, activity.start_time))
    end_time = activity.end_time or activity.start_time
    end = timezone.make_aware(datetime.combine(activity.date, end_time))
    end = max(end, start)
    return start, end


def _schedule_flags(activity, now: datetime) -> tuple[bool, bool]:
    if activity.status in {"completed", "cancelled"}:
        return False, False

    start_dt, end_dt = _activity_window(activity)
    if start_dt <= now <= end_dt:
        return True, False
    if now > end_dt:
        return False, True
    return False, False


def _intervals_overlap(left, right) -> bool:
    left_start, left_end = _activity_window(left)
    right_start, right_end = _activity_window(right)
    return left_start <= right_end and right_start <= left_end


def refresh_planner_state_for_scope(date_value, department_id) -> int:
    from .constants import PlannerStatus
    from .models import PlannerActivity

    queryset = list(
        PlannerActivity.objects.filter(
            date=date_value, department_id=department_id
        ).order_by(
            "start_time",
            "id",
        )
    )
    if not queryset:
        return 0

    now = timezone.localtime()
    changed = []
    for activity in queryset:
        # Skip if already completed or cancelled
        if activity.status in {"completed", "cancelled"}:
            continue

        active, delayed = _schedule_flags(activity, now)
        conflict = any(
            other.id != activity.id
            and other.status not in {"completed", "cancelled"}
            and activity.status not in {"completed", "cancelled"}
            and _intervals_overlap(activity, other)
            for other in queryset
        )

        # Calculate status based on flags
        if delayed:
            new_status = PlannerStatus.DELAYED
        elif active:
            new_status = PlannerStatus.ACTIVE
        elif conflict:
            new_status = PlannerStatus.CONFLICT
        else:
            new_status = PlannerStatus.SCHEDULED

        has_changes = (
            activity.active != active
            or activity.delayed != delayed
            or activity.conflict != conflict
            or activity.status != new_status
        )
        if has_changes:
            activity.active = active
            activity.delayed = delayed
            activity.conflict = conflict
            activity.status = new_status
            activity.updated_at = timezone.now()
            changed.append(activity)

    if changed:
        PlannerActivity.objects.bulk_update(
            changed,
            ["active", "delayed", "conflict", "status", "updated_at"],
        )
    return len(changed)


def refresh_planner_state_for_queryset(queryset: QuerySet) -> int:
    seen_scopes = set()
    updated = 0
    for scope in queryset.values_list("date", "department").distinct():
        if scope in seen_scopes:
            continue
        seen_scopes.add(scope)
        updated += refresh_planner_state_for_scope(*scope)
    return updated


def _time_label(start_time, end_time) -> str:
    if not start_time:
        return ""
    start = start_time.strftime("%H%M")
    if end_time:
        return f"{start} hrs - {end_time.strftime('%H%M')} hrs"
    return f"{start} hrs"


def _manual_activities(start_date, end_date) -> list[dict]:
    from .models import PlannerActivity

    queryset = PlannerActivity.objects.with_dashboard_relations().filter(
        date__gte=start_date, date__lte=end_date
    )
    refresh_planner_state_for_queryset(queryset)

    return [
        {
            "id": f"activity_{a.id}",
            "title": a.title,
            "subtitle": a.subtitle,
            "description": a.description,
            "start_date": a.date,
            "start_time": a.start_time,
            "end_time": a.end_time,
            "time_label": _time_label(a.start_time, a.end_time),
            "department": a.department.name if a.department else None,
            "category": a.category,
            "category_label": a.get_category_display(),
            "status": a.status,
            "status_label": a.get_status_display(),
            "priority": a.priority,
            "priority_label": a.get_priority_display() if a.priority else None,
            "progress": a.progress,
            "active": a.active,
            "delayed": a.delayed,
            "conflict": a.conflict,
            "selected": a.selected,
            "isolation": a.isolation,
            "equipment": a.equipment,
            "reference": a.reference,
            "location": a.location,
            "ship": a.ship.name if a.ship else None,
            "created_by": f"{a.created_by.user_profile.firstname} {a.created_by.user_profile.lastname}".strip()
            if a.created_by and a.created_by.user_profile
            else None,
            "created_at": a.created_at,
            "updated_at": a.updated_at,
        }
        for a in queryset
    ]


def _event_activities(start_date, end_date) -> list[dict]:
    from .models import Event

    # Events can span multiple days. Include an event when its date range
    # overlaps the requested planner range; ``end_date`` is optional and a
    # missing value represents a single-day event on ``start_date``.
    queryset = (
        Event.objects.filter(start_date__lte=end_date)
        .filter(
            Q(end_date__gte=start_date)
            | Q(end_date__isnull=True, start_date__gte=start_date)
        )
        .select_related("user", "ship")
    )

    return [
        {
            "id": f"event_{e.id}",
            "title": e.title,
            "subtitle": None,
            "description": e.description,
            "start_date": e.start_date,
            "start_time": e.start_time,
            "end_time": e.end_time,
            "time_label": _time_label(e.start_time, e.end_time),
            "lane": PlannerLane.ADMIN,
            "lane_label": None,
            "department": None,
            "category": (
                e.category
                if e.category in PlannerCategory.values
                else PlannerCategory.OTHERS
            ),
            "category_label": e.get_category_display(),
            "status": "scheduled",
            "status_label": "Scheduled",
            "priority": None,
            "priority_label": None,
            "progress": 0,
            "active": False,
            "delayed": False,
            "conflict": False,
            "selected": False,
            "isolation": False,
            "equipment": None,
            "reference": None,
            "location": None,
            "ship": e.ship.name if e.ship else None,
            "created_by": f"{e.user.firstname} {e.user.lastname}".strip()
            if e.user
            else None,
            "created_at": e.created_at,
            "updated_at": None,
        }
        for e in queryset
    ]


def _routine_activities(start_date, end_date) -> list[dict]:
    planned_routine_ids = PlannedRoutineDescription.objects.filter(
        is_deleted=False
    ).values_list("routine_description_id_id", flat=True)

    queryset = (
        RoutineDescription.objects.filter(
            due_date__gte=start_date,
            due_date__lte=end_date,
            is_close=False,
        )
        .exclude(id__in=planned_routine_ids)
        .select_related("equipment_name", "department_f_key")
    )

    return [
        {
            "id": f"routine_{r.id}",
            "title": r.equipment_name.name if r.equipment_name else r.maintop_no,
            "subtitle": None,
            "description": r.routine_description,
            "start_date": r.due_date,
            "start_time": None,
            "end_time": None,
            "time_label": None,
            "lane": get_lane_for_department(
                r.department_f_key.name if r.department_f_key else None
            ),
            "lane_label": None,
            "department": r.department_f_key.name if r.department_f_key else None,
            "category": PlannerCategory.ROUTINE,
            "category_label": PlannerCategory.ROUTINE.label,
            "status": "completed" if r.is_close else "scheduled",
            "status_label": "Completed" if r.is_close else "Scheduled",
            "priority": None,
            "priority_label": None,
            "progress": 0,
            "active": False,
            "delayed": False,
            "conflict": False,
            "selected": False,
            "isolation": False,
            "equipment": r.equipment_name.name if r.equipment_name else None,
            "reference": r.maintop_no,
            "location": None,
            "ship": None,
            "created_by": None,
            "created_at": None,
            "updated_at": None,
        }
        for r in queryset
    ]


def _planned_routine_activities(start_date, end_date) -> list[dict]:
    queryset = PlannedRoutineDescription.objects.filter(
        is_deleted=False,
        routine_description_id__due_date__gte=start_date,
        routine_description_id__due_date__lte=end_date,
        routine_description_id__is_close=False,
    ).select_related(
        "routine_description_id",
        "routine_description_id__equipment_name",
        "routine_description_id__department_f_key",
    )

    activities = []
    for p in queryset:
        rd = p.routine_description_id
        if not rd:
            continue
        department = rd.department_f_key.name if rd.department_f_key else None
        activities.append(
            {
                "id": f"planned_{p.id}",
                "title": rd.equipment_name.name if rd.equipment_name else rd.maintop_no,
                "subtitle": None,
                "description": rd.routine_description,
                "start_date": rd.due_date,
                "start_time": None,
                "end_time": None,
                "time_label": None,
                "lane": get_lane_for_department(department),
                "lane_label": None,
                "department": department,
                "category": PlannerCategory.PLANNED_ROUTINE,
                "category_label": PlannerCategory.PLANNED_ROUTINE.label,
                "status": "scheduled",
                "status_label": "Scheduled",
                "priority": None,
                "priority_label": None,
                "progress": 0,
                "active": False,
                "delayed": False,
                "conflict": False,
                "selected": False,
                "isolation": False,
                "equipment": rd.equipment_name.name if rd.equipment_name else None,
                "reference": rd.maintop_no,
                "location": None,
                "ship": None,
                "created_by": None,
                "created_at": None,
                "updated_at": None,
            }
        )
    return activities


def _defect_activities(start_date, end_date) -> list[dict]:
    from datetime import datetime

    if isinstance(start_date, str):
        start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
    if isinstance(end_date, str):
        end_date = datetime.strptime(end_date, "%Y-%m-%d").date()

    queryset = InitiateDart.objects.filter(
        is_closed=False,
    ).select_related("equipment_ship", "equipment_ems", "department_id")

    activities = []
    for d in queryset:
        activity_date = d.rectification_date
        if not activity_date:
            continue
        if not (start_date <= activity_date <= end_date):
            continue

        activities.append(
            {
                "id": f"defect_{d.id}",
                "title": (
                    (d.equipment_ship.nomenclature if d.equipment_ship else None)
                    or (d.equipment_ems.name if d.equipment_ems else None)
                    or d.dart_number
                ),
                "subtitle": None,
                "description": d.defective_discriptions,
                "start_date": activity_date,
                "start_time": None,
                "end_time": None,
                "time_label": None,
                "lane": get_lane_for_department(
                    d.department_id.name if d.department_id else None
                ),
                "lane_label": None,
                "department": d.department_id.name if d.department_id else None,
                "category": PlannerCategory.DEFECT,
                "category_label": PlannerCategory.DEFECT.label,
                "status": "scheduled",
                "status_label": "Scheduled",
                "priority": None,
                "priority_label": None,
                "progress": 0,
                "active": False,
                "delayed": False,
                "conflict": False,
                "selected": False,
                "isolation": False,
                "equipment": d.equipment_ship.nomenclature
                if d.equipment_ship
                else None,
                "reference": d.dart_number,
                "location": None,
                "ship": None,
                "created_by": None,
                "created_at": None,
                "updated_at": None,
            }
        )

    return activities


def _trial_activities(start_date, end_date) -> list[dict]:
    """Fetch trial activities for the requested date range.
    Safely handles missing Trials model.
    """
    try:
        from master.models import Trials
    except ImportError:
        return []

    if isinstance(start_date, str):
        from datetime import datetime

        start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
    if isinstance(end_date, str):
        from datetime import datetime

        end_date = datetime.strptime(end_date, "%Y-%m-%d").date()

    queryset = (
        Trials.objects.filter(
            trial_date__gte=start_date,
            trial_date__lte=end_date,
            status__in=[1, 2],  # Active or Inactive, exclude Deleted (3)
        )
        .exclude(trial_date__isnull=True)
        .select_related("equipment", "trial_type", "trial_unit", "ship")
    )

    activities = []
    for trial in queryset:
        department = (
            trial.trial_unit.name
            if trial.trial_unit
            else (trial.ship.ship_name if trial.ship else None)
        )
        activities.append(
            {
                "id": f"trial_{trial.id}",
                "title": trial.trial_number or f"Trial {trial.id}",
                "subtitle": trial.trial_type.name if trial.trial_type else None,
                "description": None,
                "start_date": trial.trial_date,
                "start_time": None,
                "end_time": None,
                "time_label": None,
                "lane": get_lane_for_department("Trials & Inspection"),
                "lane_label": "Trials & Inspection",
                "department": department,
                "category": PlannerCategory.TRIAL,
                "category_label": PlannerCategory.TRIAL.label,
                "status": "scheduled",
                "status_label": "Scheduled",
                "priority": None,
                "priority_label": None,
                "progress": 0,
                "active": False,
                "delayed": False,
                "conflict": False,
                "selected": False,
                "isolation": False,
                "equipment": trial.equipment.name if trial.equipment else None,
                "reference": trial.trial_number,
                "location": None,
                "ship": trial.ship.ship_name if trial.ship else None,
                "created_by": (
                    f"{trial.created_by.firstname} {trial.created_by.lastname}".strip()
                    if trial.created_by and trial.created_by.firstname
                    else None
                ),
                "created_at": trial.created_on,
                "updated_at": trial.modified_on,
            }
        )

    return activities


def _running_hours_activities(start_date, end_date) -> list[dict]:
    """Fetch running hours based routine activities for the requested date range.
    These have tentative due dates based on equipment running hours.
    """
    if isinstance(start_date, str):
        from datetime import datetime

        start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
    if isinstance(end_date, str):
        from datetime import datetime

        end_date = datetime.strptime(end_date, "%Y-%m-%d").date()

    RUNNING_HOURS_PER_DAY = 8
    RUNNING_HOURS_PLAN_LEAD = 1000

    running_hours_routines = (
        RoutineDescription.objects.filter(
            add_routine_details__routine_category="RUNNING HOUR BASED",
            due_at_rh__isnull=False,
            is_close=False,
        )
        .exclude(due_at_rh="")
        .select_related("equipment_name", "routine_name", "add_routine_details")
    )

    today = timezone.localdate()
    now = timezone.localtime()
    activities = []

    for routine in running_hours_routines:
        equipment = routine.equipment_name
        if not equipment:
            continue

        current_rh = equipment.rhsi or 0
        if equipment.state == "ACTIVE" and equipment.start_timedate:
            started = equipment.start_timedate
            if timezone.is_naive(started):
                started = timezone.make_aware(started)
            current_rh = current_rh + (now - started).total_seconds() / 3600

        try:
            due_rh = float(routine.due_at_rh)
        except (TypeError, ValueError):
            continue

        hours_per_day = RUNNING_HOURS_PER_DAY
        if not hours_per_day:
            continue

        remaining_hours = due_rh - float(current_rh)
        tentative_due = today + timedelta(days=remaining_hours / hours_per_day)
        _ = tentative_due - timedelta(days=RUNNING_HOURS_PLAN_LEAD / hours_per_day)

        if start_date <= tentative_due <= end_date:
            activities.append(
                {
                    "id": f"rh_due_{routine.id}",
                    "title": f"{routine.equipment_name.name} (RH-Based)",
                    "subtitle": None,
                    "description": routine.routine_description,
                    "start_date": tentative_due,
                    "start_time": None,
                    "end_time": None,
                    "time_label": None,
                    "lane": get_lane_for_department(
                        routine.department_f_key.name
                        if routine.department_f_key
                        else None
                    ),
                    "lane_label": None,
                    "department": routine.department_f_key.name
                    if routine.department_f_key
                    else None,
                    "category": PlannerCategory.ROUTINE,
                    "category_label": f"{PlannerCategory.ROUTINE.label} (Running Hours)",
                    "status": "completed" if routine.is_close else "scheduled",
                    "status_label": "Completed" if routine.is_close else "Scheduled",
                    "priority": None,
                    "priority_label": None,
                    "progress": 0,
                    "active": False,
                    "delayed": tentative_due < today,
                    "conflict": False,
                    "selected": False,
                    "isolation": False,
                    "equipment": routine.equipment_name.name
                    if routine.equipment_name
                    else None,
                    "reference": routine.maintop_no,
                    "location": None,
                    "ship": None,
                    "created_by": None,
                    "created_at": None,
                    "updated_at": None,
                }
            )

    return activities


def list_unified_activities(params) -> list[dict]:
    """Merge manual + real EMS/DART data for the requested date range,
    then apply the same department/lane/category/status/chip filters used
    for the manual-only PlannerActivity queryset.
    """
    start_date = params.get("start_date")
    end_date = params.get("end_date")
    if not start_date or not end_date:
        return []

    activities = (
        _manual_activities(start_date, end_date)
        + _event_activities(start_date, end_date)
        + _routine_activities(start_date, end_date)
        + _planned_routine_activities(start_date, end_date)
        + _defect_activities(start_date, end_date)
        + _trial_activities(start_date, end_date)
        + _running_hours_activities(start_date, end_date)
    )

    department = parse_csv(params.get("department"))
    lane = parse_csv(params.get("lane"))
    category = parse_csv(params.get("category"))
    status = parse_csv(params.get("status"))
    chip = (params.get("chip") or "").strip().lower()
    today = timezone.localdate()

    def matches(activity: dict) -> bool:
        if department and activity["department"] not in department:
            return False
        if category and activity["category"] not in category:
            return False
        if status and activity["status"] not in status:
            return False
        if chip == "today" and activity["start_date"] != today:
            return False
        if chip == "delayed" and not activity["delayed"]:
            return False
        if chip == "conflict" and not activity["conflict"]:
            return False
        if chip == "others" and activity["category"] != PlannerCategory.OTHERS:
            return False
        if chip == "trial" and activity["category"] != PlannerCategory.TRIAL:
            return False
        if chip == "active" and not activity["active"]:
            return False
        return True

    return [a for a in activities if matches(a)]


def summarize_unified_activities(activities: list[dict]) -> dict:
    category_counts = Counter(a["category"] for a in activities)
    today = timezone.localdate()
    return {
        "category_cards": [
            {
                "key": category.value,
                "label": category.label,
                "count": category_counts.get(category.value, 0),
            }
            for category in PlannerCategory
        ],
        "conflict_count": sum(1 for a in activities if a["conflict"]),
        "delayed_count": sum(1 for a in activities if a["delayed"]),
        "active_count": sum(1 for a in activities if a["active"]),
        "upcoming_count": sum(
            1 for a in activities if a["start_date"] and a["start_date"] >= today
        ),
    }


def get_unified_activity_by_id(activity_id: str) -> dict | None:
    """Direct lookup by prefixed id (activity_/event_/routine_/planned_/defect_/trial_/rh_due_),
    mirroring the legacy app's per-type detail endpoints - avoids scanning the
    whole date range just to find one record.
    """
    activity_id = str(activity_id)
    if "_" not in activity_id:
        return None
    prefix, _, raw_id = activity_id.partition("_")

    lookups = {
        "activity": lambda: _manual_activities_by_pk(raw_id),
        "event": lambda: _event_activities_by_pk(raw_id),
        "routine": lambda: _routine_activities_by_pk(raw_id),
        "planned": lambda: _planned_routine_activities_by_pk(raw_id),
        "defect": lambda: _defect_activities_by_pk(raw_id),
        "trial": lambda: _trial_activities_by_pk(raw_id),
        "rh": lambda: _running_hours_activities_by_pk(activity_id),
    }
    lookup = lookups.get(prefix)
    return lookup() if lookup else None


def _manual_activities_by_pk(raw_id):
    from .models import PlannerActivity

    a = PlannerActivity.objects.with_dashboard_relations().filter(pk=raw_id).first()
    if not a:
        return None
    matches = _manual_activities(a.date, a.date)
    return next((m for m in matches if m["id"] == f"activity_{raw_id}"), None)


def _event_activities_by_pk(raw_id):
    from .models import Event

    e = Event.objects.filter(pk=raw_id).first()
    if not e:
        return None
    matches = _event_activities(e.start_date, e.start_date)
    return next((m for m in matches if m["id"] == f"event_{raw_id}"), None)


def _routine_activities_by_pk(raw_id):
    r = RoutineDescription.objects.filter(pk=raw_id).first()
    if not r or not r.due_date:
        return None
    matches = _routine_activities(r.due_date, r.due_date)
    return next((m for m in matches if m["id"] == f"routine_{raw_id}"), None)


def _planned_routine_activities_by_pk(raw_id):
    p = (
        PlannedRoutineDescription.objects.select_related("routine_description_id")
        .filter(pk=raw_id)
        .first()
    )
    if not p or not p.routine_description_id or not p.routine_description_id.due_date:
        return None
    due_date = p.routine_description_id.due_date
    matches = _planned_routine_activities(due_date, due_date)
    return next((m for m in matches if m["id"] == f"planned_{raw_id}"), None)


def _defect_activities_by_pk(raw_id):
    d = InitiateDart.objects.filter(pk=raw_id).first()
    if not d or not d.rectification_date:
        return None
    matches = _defect_activities(d.rectification_date, d.rectification_date)
    return next((m for m in matches if m["id"] == f"defect_{raw_id}"), None)


def _trial_activities_by_pk(raw_id):
    try:
        from master.models import Trials
    except ImportError:
        return None

    trial = Trials.objects.filter(pk=raw_id).first()
    if not trial or not trial.trial_date:
        return None
    matches = _trial_activities(trial.trial_date, trial.trial_date)
    return next((m for m in matches if m["id"] == f"trial_{raw_id}"), None)


def _running_hours_activities_by_pk(full_id):
    """Handle running hours activities by their full prefixed ID."""
    prefix, _, raw_id = full_id.partition("_")
    if prefix != "rh":
        return None

    routine = RoutineDescription.objects.filter(pk=raw_id).first()
    if not routine or not routine.due_at_rh:
        return None

    today = timezone.localdate()
    matches = _running_hours_activities(today, today + timedelta(days=30))
    return next((m for m in matches if m["id"] == full_id), None)


def build_overdue_darts(department_id=None) -> list[dict]:
    """Open DARTs whose rectification date has already passed - mirrors the
    legacy get_overdue_pending_darts view."""
    today = timezone.localdate()
    queryset = InitiateDart.objects.filter(
        is_closed=False,
        rectification_date__isnull=False,
        rectification_date__lt=today,
    ).select_related("equipment_ship", "equipment_ems")

    if department_id:
        queryset = queryset.filter(department_id=department_id)

    queryset = queryset.order_by("rectification_date", "closing_date", "id")

    rows = []
    for idx, dart in enumerate(queryset, start=1):
        equipment_name = ""
        if dart.equipment_ship and dart.equipment_ship.nomenclature:
            equipment_name = dart.equipment_ship.nomenclature
        elif dart.equipment_ems and dart.equipment_ems.name:
            equipment_name = dart.equipment_ems.name

        # Use rectification_date
        due_date = dart.rectification_date
        days_overdue = (today - due_date).days if due_date else 0

        rows.append(
            {
                "ser": idx,
                "id": dart.id,
                "dart_number": dart.dart_number or "-",
                "defect_date": (
                    dart.dart_date.strftime("%d %b %Y") if dart.dart_date else "-"
                ),
                "closing_date": (due_date.strftime("%d %b %Y") if due_date else "-"),
                "status": "Open",
                "equipment": equipment_name or "-",
                "description": dart.defective_discriptions or "-",
                "days_overdue": days_overdue,
            }
        )

    return rows


def build_dart_trend(department_id=None) -> dict:
    """Open vs closed DART counts for the last 12 calendar months, oldest
    first - mirrors the legacy Home_new dashboard's Defect DART Trending
    chart data.
    """
    today = timezone.localdate()
    first_day_of_month = today.replace(day=1)
    months = []
    for i in range(12):
        month = first_day_of_month - timedelta(days=30 * i)
        months.append(month.replace(day=1))
    months = sorted(set(months))

    labels = []
    open_counts = []
    closed_counts = []
    for month in months:
        labels.append(month.strftime("%b"))
        open_queryset = InitiateDart.objects.filter(
            dart_date__year=month.year,
            dart_date__month=month.month,
            is_closed=False,
        )
        closed_queryset = InitiateDart.objects.filter(
            dart_date__year=month.year,
            dart_date__month=month.month,
            is_closed=True,
        )
        if department_id:
            open_queryset = open_queryset.filter(department_id=department_id)
            closed_queryset = closed_queryset.filter(department_id=department_id)
        open_counts.append(open_queryset.count())
        closed_counts.append(closed_queryset.count())

    return {
        "labels": labels,
        "series": [
            {"label": "Defect Open DART", "color": "#28a745", "values": open_counts},
            {
                "label": "Defect Closed DART",
                "color": "#DC3545",
                "values": closed_counts,
            },
        ],
    }
