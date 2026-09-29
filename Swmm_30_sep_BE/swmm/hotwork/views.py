"""
Views for hotwork_drf -- class-based only (APIView / ModelViewSet), with
permission_classes set explicitly per view/action via get_permissions(),
mirroring crewmanage_drf/inouttag_drf's own views.py.

See the module docstrings in serializers.py and permissions.py for the
shared RBAC/validation plumbing imported below.
"""

import base64
import json
import logging
import os
from datetime import datetime, time, timedelta
from io import BytesIO

import qrcode
from op_maintenance.models import InitiateDart, InitiateRADL
from django.conf import settings
from django.db import transaction
from django.db.models import Count, OuterRef, Q, Subquery
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.utils import (
    extend_schema,
)
from master.models import Department, Ship, SubDepartment
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts import rbac
from accounts.models import AUTH_SOURCE_HRCDF, CustomUserProfile
from weasyprint import HTML

from .models import (
    AddHotwork,
    DayType,
    HotworkHODApproval,
    HotworkProgressActivity,
    HotworkType,
)
from .serializers import (
    HotworkCompleteSerializer,
    HotworkCreateSerializer,
    HotworkDyhodApproveSerializer,
    HotworkEsignQrSerializer,
    HotworkHodApproveSerializer,
    HotworkOodApproveSerializer,
    HotworkPauseSerializer,
    HotworkResubmitSerializer,
    HotworkSerializer,
    HotworkStartSerializer,
)

logger = logging.getLogger(__name__)

PENDING_APPROVAL_STATUSES = [
    "pending_dyhod",
    "pending_first_hod",
    "pending_hods",
    "pending_ood",
]

HOD = "Head of Department"
HotworkDone = "This hotwork is already completed."


EXCLUDED_HOD_PERSONAL_NUMBERS = {
    str(num).strip().upper()
    for num in getattr(settings, "HOTWORK_EXCLUDED_HOD_PERSONAL_NUMBERS", [])
}

NBCD_SUB_DEPARTMENT = "NBCD"
NBCD_LANE_DEPARTMENT_ID = 5
ENGINEERING_DEPARTMENT_ID = 2
ELECTRICAL_DEPARTMENT_ID = 3


def _nbcd_lane_department_id():
    """Department id the NBCD approval lane is keyed on -- fixed at 5 to stay
    in lockstep with AddHotwork.check_all_hods_approved()'s hardcoded
    [2, 3, 5]. Resolving it dynamically (e.g. to the NBCD sub-department's
    parent) desyncs the seeded rows from the count and wedges the day flow."""
    return NBCD_LANE_DEPARTMENT_ID


def _day_officer_lane_department_ids():
    """The three Day hot-work officer approval-lane department ids
    (ENGINEERING / ELECTRICAL / NBCD). Fixed to match the [2, 3, 5] the
    model's check_all_hods_approved() and the HotworkHODApproval lookups
    hardcode."""
    return [
        ENGINEERING_DEPARTMENT_ID,
        ELECTRICAL_DEPARTMENT_ID,
        NBCD_LANE_DEPARTMENT_ID,
    ]


def _nbcd_officer_queryset():
    """
    Code written by Unknown: the officers who may be nominated for the NBCD hot-work
    approval lane.

    Only the resolution of WHO the NBCDO is has moved to the sub-department. The
    approval row itself is still keyed on Department id 5, because
    HotworkHODApproval.department is a foreign key carrying a unique_together
    constraint and a dozen call sites depend on that id.

    Note this is a candidate list only. Authority to approve a lane is decided
    elsewhere by a direct match on AddHotwork.nbcdo_officer, so widening this query
    does not let anybody approve a requisition they were not named on.

    The old department-based lookup is kept as an OR branch so a database where the
    reclassification has not yet been run still finds its NBCDO.
    """
    return CustomUserProfile.objects.filter(
        Q(
            department__name="EXECUTIVE",
            executive_sub_department__iexact=NBCD_SUB_DEPARTMENT,
        )
        | Q(department_id=_nbcd_lane_department_id()),
        user_active=True,
        role_master__role_name__in=["Head of Department", "DY HOD"],
    ).distinct()


def _lane_has_eligible_approver(dept_id):
    """Whether a HOD-approval lane has at least one active approver not on
    the excluded-HOD list. The NBCD lane resolves through the EXECUTIVE
    sub-department (see _nbcd_officer_queryset); every other lane is that
    department's active Head of Department. Mirrors ood_approve_hotwork's
    per-lane eligibility guard (Hotwork/views.py:3020-3034)."""
    if dept_id == _nbcd_lane_department_id():
        lane_officers = _nbcd_officer_queryset()
    else:
        lane_officers = CustomUserProfile.objects.filter(
            department_id=dept_id,
            role_master__role_name=HOD,
            user_active=True,
        )
    return lane_officers.exclude(
        personal_number__in=EXCLUDED_HOD_PERSONAL_NUMBERS
    ).exists()


def _seed_day_hod_lane_rows(hotwork):
    """Create the unapproved HotworkHODApproval rows a day-flow requisition
    needs once it reaches the HOD stage -- one per day-officer lane
    (ENGINEERING / ELECTRICAL / NBCD) that resolves to a real Department.

    Without these rows the hotwork never surfaces in any HOD inbox (the
    inbox query filters on an existing ``hod_approvals__approved=False``
    row) and ``check_all_hods_approved`` -- which counts approved rows for
    departments [2, 3, 5] -- can never reach its bar. Replaces the earlier
    ``Department.objects.all()`` branch, which passed a QuerySet where a
    Department instance was required and seeded nothing.
    """
    for dept_id in HotworkWorkflowConfig.day_officer_lane_department_ids():
        department = Department.objects.filter(id=dept_id).first()
        if department:
            HotworkHODApproval.objects.get_or_create(
                hotwork=hotwork, department=department
            )


def _resolve_creator_flags(profile):
    """Creator-role flags addhotwork derived at the top of its POST branch
    (Hotwork/views.py:1887-1892) -- which of the 4 workflows a new
    requisition follows, and which officer fields its creator may fill."""
    role_name = (
        profile.role_master.role_name if (profile and profile.role_master) else ""
    )
    is_co_creator = rbac.is_command_role(profile)
    is_ood_creator = (
        bool(profile and getattr(profile, "is_ood", False)) and not is_co_creator
    )
    is_dyhod_creator = (
        role_name == "DY HOD" and not is_ood_creator and not is_co_creator
    )
    is_hod_creator = (
        role_name == HOD
        and not is_excluded_hod(profile)
        and not is_ood_creator
        and not is_co_creator
    )
    return {
        "is_co_creator": is_co_creator,
        "is_ood_creator": is_ood_creator,
        "is_dyhod_creator": is_dyhod_creator,
        "is_hod_creator": is_hod_creator,
        "is_privileged": is_dyhod_creator or is_hod_creator,
    }


def _creator_self_lane_dept_id(profile, data):
    """The HOD-lane department id a privileged creator named *themselves*
    on, or None. Drives the creator-self-approval branch in create()
    (addhotwork:2313-2326)."""
    if profile is None:
        return None
    if data.get("eo_officer") == profile:
        return ENGINEERING_DEPARTMENT_ID
    if data.get("lo_officer") == profile:
        return ELECTRICAL_DEPARTMENT_ID
    if data.get("nbcdo_officer") == profile:
        return NBCD_LANE_DEPARTMENT_ID
    return None


def _is_privileged_initiator_profile(profile):
    """True when the profile is a non-excluded HOD or a DY HOD -- an initiator whose requisitions skip the DYHOD queue."""
    if not profile or not profile.role_master:
        return False

    role_name = (profile.role_master.role_name or "").strip()
    if role_name == "DY HOD":
        return True

    return role_name == "Head of Department" and not is_excluded_hod(profile)


def is_excluded_hod(profile):
    """True when the profile's personal number is in HOTWORK_EXCLUDED_HOD_PERSONAL_NUMBERS, i.e. an HOD not treated as one for hot-work approvals."""
    return bool(
        profile
        and str(profile.personal_number).strip().upper()
        in EXCLUDED_HOD_PERSONAL_NUMBERS
    )


def get_user_approval_roles(request):
    """Return role flags used by shared Hotwork templates."""
    user = getattr(request, "user", None)
    user_profile = getattr(user, "user_profile", None)

    role_name = ""
    if user_profile and user_profile.role_master:
        role_name = user_profile.role_master.role_name or ""

    is_dyhod = role_name == "DY HOD"
    is_hod = role_name == "Head of Department"
    if is_hod and is_excluded_hod(user_profile):
        is_hod = False

    is_ood = bool(user_profile and getattr(user_profile, "is_ood", False))
    is_command = rbac.is_command_role(user_profile)
    is_incharge = bool(
        user_profile
        and AddHotwork.objects.filter(hotwork_incharge=user_profile).exists()
    )

    user_department = user_profile.department if user_profile else None

    return {
        "is_incharge": is_incharge,
        "is_dyhod": is_dyhod,
        "is_hod": is_hod,
        "is_ood": is_ood,
        "is_command": is_command,
        "user_department": user_department.id if user_department else None,
        "user_department_name": user_department.name if user_department else None,
    }


class HotworkWorkflowConfig:
    """Centralized workflow configuration and validation logic.

    Defines 4 distinct approval flows based on creator role and hotwork type:
    - Flow 1: Anyone + Day → Dy HOD → Selected HODs/Officers → OOD (locked until officers approve)
    - Flow 2: Dy HOD + Day → Selected Officers → OOD
    - Flow 3: Anyone + Night/Holiday → Dy HOD → OOD (consolidated checklist)
    - Flow 4: Dy HOD/HOD + Night/Holiday → OOD only (consolidated checklist)
    """

    FLOW_1 = "flow_1_day_anyone"
    FLOW_2 = "flow_2_day_dyhod"
    FLOW_3 = "flow_3_night_holiday_anyone"
    FLOW_4 = "flow_4_night_holiday_dyhod_hod"

    STATUS_PENDING_DYHOD = "pending_dyhod"
    STATUS_PENDING_FIRST_HOD = "pending_first_hod"
    STATUS_PENDING_HODS = "pending_hods"
    STATUS_PENDING_OOD = "pending_ood"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"

    @staticmethod
    def day_officer_lane_department_ids():
        """ENGINEERING, ELECTRICAL and NBCDO department ids for the Day officer lanes."""
        return _day_officer_lane_department_ids()

    @staticmethod
    def is_night_or_holiday(hotwork):
        """True when the hotwork is night work or falls on a holiday."""
        return bool(hotwork.night_work or hotwork.holiday_or_working_day == "holiday")

    @staticmethod
    def get_initial_status_for_new_hotwork(is_night_or_holiday, created_by_profile):
        """Entry approval_status for a new requisition given night/holiday and creator
        role: a privileged initiator skips to pending_hods (day) or pending_ood
        (night/holiday); everyone else starts at pending_dyhod.
        """
        if is_night_or_holiday:
            return (
                HotworkWorkflowConfig.STATUS_PENDING_OOD
                if _is_privileged_initiator_profile(created_by_profile)
                else HotworkWorkflowConfig.STATUS_PENDING_DYHOD
            )
        return (
            HotworkWorkflowConfig.STATUS_PENDING_HODS
            if _is_privileged_initiator_profile(created_by_profile)
            else HotworkWorkflowConfig.STATUS_PENDING_DYHOD
        )

    @staticmethod
    def get_pending_statuses():
        """The four approval_status values that count as still in the approval workflow."""
        return [
            HotworkWorkflowConfig.STATUS_PENDING_DYHOD,
            HotworkWorkflowConfig.STATUS_PENDING_FIRST_HOD,
            HotworkWorkflowConfig.STATUS_PENDING_HODS,
            HotworkWorkflowConfig.STATUS_PENDING_OOD,
        ]

    @staticmethod
    def get_hod_stage_statuses():
        """The approval_status values that mean the requisition is in the per-department HOD stage."""
        return [
            HotworkWorkflowConfig.STATUS_PENDING_FIRST_HOD,
            HotworkWorkflowConfig.STATUS_PENDING_HODS,
        ]

    @staticmethod
    def get_post_dyhod_approval_status(hotwork):
        """The status a requisition moves to once the DYHOD approves: pending_ood for night/holiday, pending_hods for day."""
        if HotworkWorkflowConfig.is_night_or_holiday(hotwork):
            return HotworkWorkflowConfig.STATUS_PENDING_OOD
        return HotworkWorkflowConfig.STATUS_PENDING_HODS

    @staticmethod
    def can_dyhod_approve(hotwork, user_profile):
        """True when the requisition is pending_dyhod, the profile is its named departmental officer, and they have not approved yet."""
        return (
            hotwork.approval_status == HotworkWorkflowConfig.STATUS_PENDING_DYHOD
            and hotwork.departmental_officer_user == user_profile
            and not hotwork.dyhod_approved
        )

    @staticmethod
    def can_hod_approve(hotwork, pending_lane_ids):
        """True when the requisition is in an HOD stage and the caller has at least one still-pending lane."""
        return (
            hotwork.approval_status
            in [
                HotworkWorkflowConfig.STATUS_PENDING_FIRST_HOD,
                HotworkWorkflowConfig.STATUS_PENDING_HODS,
            ]
            and len(pending_lane_ids) > 0
        )

    @staticmethod
    def can_ood_approve(hotwork, user_profile):
        """True when the requisition is pending_ood, the profile is its assigned OOD, and they have not approved yet."""
        return (
            hotwork.approval_status == HotworkWorkflowConfig.STATUS_PENDING_OOD
            and hotwork.officer_of_the_day == user_profile
            and not hotwork.ood_approved
        )

    @staticmethod
    def get_approval_action_url(hotwork, user_profile, pending_lane_ids):
        """The reverse() URL of the approve endpoint the given user may act on right now, or an empty string when none applies."""
        if HotworkWorkflowConfig.can_dyhod_approve(hotwork, user_profile):
            return reverse("hotwork:dyhod_approve", args=[hotwork.id])
        if HotworkWorkflowConfig.can_hod_approve(hotwork, pending_lane_ids):
            return reverse("hotwork:hod_approve", args=[hotwork.id])
        if HotworkWorkflowConfig.can_ood_approve(hotwork, user_profile):
            return reverse("hotwork:ood_approve", args=[hotwork.id])
        return ""

    @staticmethod
    def get_pending_assignment_query(user_profile):
        """Query for pending hotworks assigned to the user for approval.

        CRITICAL: Only returns hotworks where the user is SPECIFICALLY SELECTED at time of creation.
        Never broadcasts to all users in a role or department - only goes to named individuals.
        """
        return (
            Q(
                approval_status__in=HotworkWorkflowConfig.get_pending_statuses(),
                departmental_officer_user=user_profile,
            )
            | Q(
                approval_status__in=HotworkWorkflowConfig.get_pending_statuses(),
                eo_officer=user_profile,
            )
            | Q(
                approval_status__in=HotworkWorkflowConfig.get_pending_statuses(),
                lo_officer=user_profile,
            )
            | Q(
                approval_status__in=HotworkWorkflowConfig.get_pending_statuses(),
                nbcdo_officer=user_profile,
            )
            | Q(
                approval_status=HotworkWorkflowConfig.STATUS_PENDING_OOD,
                officer_of_the_day=user_profile,
            )
        )

    @staticmethod
    def is_hod_lane_department(department):
        """True when the department is one of the day-officer approval lanes (ENGINEERING / ELECTRICAL / NBCD)."""
        return bool(
            department
            and department.id in HotworkWorkflowConfig.day_officer_lane_department_ids()
        )

    @staticmethod
    def get_hod_applicable_query():
        """Q matching day requisitions only (the HOD lane never applies to night/holiday work)."""
        return Q(night_work=False) & ~Q(holiday_or_working_day="holiday")

    @staticmethod
    def get_selected_lane_ids(hotwork):
        """Department ids [2, 3, 5] for whichever EO / LO / NBCDO officers the requisition has assigned."""
        lane_ids = []
        if hotwork.eo_officer:
            lane_ids.append(2)
        if hotwork.lo_officer:
            lane_ids.append(3)
        if hotwork.nbcdo_officer:
            lane_ids.append(5)
        return lane_ids

    @staticmethod
    def get_hod_lane_ids_for_user(hotwork, user_profile):
        """Department ids [2, 3, 5] for the lanes on which the given user is the named officer."""
        lane_ids = []
        if hotwork.eo_officer == user_profile:
            lane_ids.append(2)
        if hotwork.lo_officer == user_profile:
            lane_ids.append(3)
        if hotwork.nbcdo_officer == user_profile:
            lane_ids.append(5)
        return lane_ids

    @staticmethod
    def get_forward_lane_options(hotwork):
        """List of {id, label} describing the assigned EO / LO / NBCDO lanes, for a forward-to picker."""
        options = []
        if hotwork.eo_officer:
            options.append({"id": "2", "label": "Engineering Officer"})
        if hotwork.lo_officer:
            options.append({"id": "3", "label": "Electrical Officer"})
        if hotwork.nbcdo_officer:
            options.append({"id": "5", "label": "NBCDO"})
        return options

    @staticmethod
    def get_workflow_type(creator_profile, is_night_or_holiday):
        """Determine which workflow applies based on creator role and hotwork type."""
        if not creator_profile or not creator_profile.role_master:
            if is_night_or_holiday:
                return HotworkWorkflowConfig.FLOW_3
            else:
                return HotworkWorkflowConfig.FLOW_1

        role_name = (creator_profile.role_master.role_name or "").strip()
        is_dyhod = role_name == "DY HOD"
        is_hod = role_name == "Head of Department" and not is_excluded_hod(
            creator_profile
        )
        is_privileged = is_dyhod or is_hod

        if is_night_or_holiday:
            if is_privileged:
                return HotworkWorkflowConfig.FLOW_4
            else:
                return HotworkWorkflowConfig.FLOW_3
        else:
            if is_privileged:
                return HotworkWorkflowConfig.FLOW_2
            return HotworkWorkflowConfig.FLOW_1

    @staticmethod
    def get_visible_officer_fields(workflow_type, is_creator=True):
        """Return which officer fields should be visible for form creation.

        Returns dict with field names as keys and visibility boolean as values.
        For non-creators (approval stage), use the visibility rules from the approval flow.
        """
        visible = {
            "departmental_officer_user": False,
            "eo_officer": False,
            "lo_officer": False,
            "nbcdo_officer": False,
            "officer_of_the_day": False,
        }

        if not is_creator:
            return visible

        if workflow_type == HotworkWorkflowConfig.FLOW_1:
            visible["departmental_officer_user"] = True
            visible["eo_officer"] = True
            visible["lo_officer"] = True
            visible["nbcdo_officer"] = True
            visible["officer_of_the_day"] = True

        elif workflow_type == HotworkWorkflowConfig.FLOW_2:
            visible["eo_officer"] = True
            visible["lo_officer"] = True
            visible["nbcdo_officer"] = True
            visible["officer_of_the_day"] = True

        elif workflow_type == HotworkWorkflowConfig.FLOW_3:
            visible["departmental_officer_user"] = True
            visible["officer_of_the_day"] = True

        elif workflow_type == HotworkWorkflowConfig.FLOW_4:
            visible["officer_of_the_day"] = True

        return visible

    @staticmethod
    def validate_officer_selections(
        workflow_type, form_data, errors, creator_profile=None
    ):
        """Validate officer field selections against workflow requirements.
        Enforces backend validation rules even if fields are hidden in UI.
        """
        if (
            workflow_type == HotworkWorkflowConfig.FLOW_2
            and form_data.get("departmental_officer_user_id", "").strip()
        ):
            errors["departmental_officer_user_id"] = (
                "DY HOD initiator should not select Department Officer / Dy. HOD field."
            )

        is_night_holiday = workflow_type in [
            HotworkWorkflowConfig.FLOW_3,
            HotworkWorkflowConfig.FLOW_4,
        ]
        if is_night_holiday:
            creator_id = str(creator_profile.id) if creator_profile else None
            night_holiday_officers = (
                (
                    "eo_officer_id",
                    "Engineering Officer must not be selected for Night/Holiday hotwork.",
                ),
                (
                    "lo_officer_id",
                    "Electrical Officer must not be selected for Night/Holiday hotwork.",
                ),
                (
                    "nbcdo_officer_id",
                    "NBCDO must not be selected for Night/Holiday hotwork.",
                ),
            )
            for field, message in night_holiday_officers:
                if (
                    form_data.get(field, "").strip()
                    and form_data.get(field) != creator_id
                ):
                    errors[field] = message

        if (
            workflow_type == HotworkWorkflowConfig.FLOW_4
            and form_data.get("departmental_officer_user_id", "").strip()
        ):
            errors["departmental_officer_user_id"] = (
                "Privileged initiator should not select Department Officer field."
            )

        return errors

    @staticmethod
    def _is_dept_approved_in_memory(hotwork, dept_id):
        """True when the given department's lane is approved, reading a prefetched
        hod_approvals cache when present and falling back to a query otherwise.
        """
        if (
            hasattr(hotwork, "_prefetched_objects_cache")
            and "hod_approvals" in hotwork._prefetched_objects_cache
        ):
            for approval in hotwork.hod_approvals.all():
                if approval.department_id == dept_id and approval.approved:
                    return True
            return False
        return hotwork.hod_approvals.filter(
            department_id=dept_id, approved=True
        ).exists()

    @staticmethod
    def is_ood_approval_locked(hotwork):
        """Check if OOD approval should remain locked based on workflow state.

        OOD approval is LOCKED until:
        - For Day hotworks: All three officers (EO, LO, NBCDO) have approved
        - For Night/Holiday hotworks: Dy HOD has approved
        """
        is_night_or_holiday = HotworkWorkflowConfig.is_night_or_holiday(hotwork)

        if is_night_or_holiday:
            return not hotwork.dyhod_approved
        else:
            if hotwork.approval_status != HotworkWorkflowConfig.STATUS_PENDING_HODS:
                return False

            required_department_ids = (
                HotworkWorkflowConfig.day_officer_lane_department_ids()
            )
            for dept_id in required_department_ids:
                if not HotworkWorkflowConfig._is_dept_approved_in_memory(
                    hotwork, dept_id
                ):
                    return True

            return False

    @staticmethod
    def get_unapproved_day_officers(hotwork):
        """Human-readable names of the assigned day officers whose lane is not approved yet."""
        unapproved_officers = []
        if hotwork.eo_officer and not HotworkWorkflowConfig._is_dept_approved_in_memory(
            hotwork, 2
        ):
            unapproved_officers.append("Engineering Officer")
        if hotwork.lo_officer and not HotworkWorkflowConfig._is_dept_approved_in_memory(
            hotwork, 3
        ):
            unapproved_officers.append("Electrical Officer")
        if (
            hotwork.nbcdo_officer
            and not HotworkWorkflowConfig._is_dept_approved_in_memory(hotwork, 5)
        ):
            unapproved_officers.append("NBCDO")
        return unapproved_officers

    @staticmethod
    def can_user_take_approval_action(hotwork, user_profile, pending_lane_ids):
        """True when the user can approve the requisition at its current stage as DYHOD, an HOD lane, or the OOD."""
        return (
            HotworkWorkflowConfig.can_dyhod_approve(hotwork, user_profile)
            or HotworkWorkflowConfig.can_hod_approve(hotwork, pending_lane_ids)
            or HotworkWorkflowConfig.can_ood_approve(hotwork, user_profile)
        )

    @staticmethod
    def can_user_see_readonly_ood_visibility(hotwork, user_profile):
        """True when a non-privileged-initiated day requisition is at pending_ood and
        the given user is its assigned OOD, i.e. they see it read-only before their
        turn.
        """
        if hotwork.approval_status != HotworkWorkflowConfig.STATUS_PENDING_OOD:
            return False

        if hotwork.officer_of_the_day != user_profile:
            return False

        if _is_privileged_initiator_profile(hotwork.created_by):
            return False

        return not HotworkWorkflowConfig.is_night_or_holiday(hotwork)

    @staticmethod
    def validate_officer_checklist_fields(checklist_data, officer_type=""):
        """Validate that NO officer checklist field is marked as NO/False/Rejected.

        If ANY field is marked as NO/False/Rejected, validation fails immediately.
        officer_type: 'engineering', 'electrical', 'nbcdo', or '' for generic check
        """
        rejection_values = {"no", "false", "rejected", "NO", "False", "Rejected", False}

        for key, value in checklist_data.items():
            if value in rejection_values:
                return False, (
                    "Officer rights must be marked Yes. Approval will not proceed with No selected."
                )

        return True, None


def _profile(user):
    """The CustomUserProfile for a user, or None."""
    return getattr(user, "user_profile", None)


def _get_hotwork_window_bounds(hotwork):
    """Port of Hotwork/views.py:67."""
    if not hotwork.date_of_hotwork:
        return (None, None)

    tz = timezone.get_current_timezone()
    if hotwork.night_work:
        start_at = timezone.make_aware(
            datetime.combine(hotwork.date_of_hotwork, time(17, 0)), tz
        )
        end_at = timezone.make_aware(
            datetime.combine(hotwork.date_of_hotwork + timedelta(days=1), time(4, 0)),
            tz,
        )
    else:
        start_at = timezone.make_aware(
            datetime.combine(hotwork.date_of_hotwork, time(9, 0)), tz
        )
        end_at = timezone.make_aware(
            datetime.combine(hotwork.date_of_hotwork, time(17, 0)), tz
        )
    return (start_at, end_at)


def _is_hotwork_window_expired(hotwork, now=None):
    """Port of Hotwork/views.py:82."""
    now = now or timezone.localtime(timezone.now())
    _, end_at = _get_hotwork_window_bounds(hotwork)
    if not end_at:
        return False
    if hotwork.night_work:
        return now >= end_at
    return now > end_at


def _auto_complete_paused_hotwork_if_expired(hotwork, now=None):
    """Port of Hotwork/views.py:93 (_auto_complete_paused_hotwork_if_expired)
    -- auto-completes a paused hotwork whose time window has lapsed, writing
    a HotworkProgressActivity row. Called from the same call sites as
    legacy: list/pending_approval/track/report and start.

    BUG FIX (item 2): legacy read is_completed/is_started/is_paused and then
    wrote the auto-complete with no locking at all -- a TOCTOU race where two
    concurrent requests reading the same row (e.g. two callers hitting
    list/pending_approval simultaneously) could both decide to auto-complete
    and double-write a HotworkProgressActivity row. The check-and-set is now
    wrapped in transaction.atomic() + select_for_update() on this specific
    hotwork row so it's serialized against other callers.
    """
    now = now or timezone.localtime(timezone.now())
    if hotwork.is_completed or not hotwork.is_started or not hotwork.is_paused:
        return False
    if not _is_hotwork_window_expired(hotwork, now):
        return False

    changed = False
    with transaction.atomic():
        locked = AddHotwork.objects.select_for_update().get(pk=hotwork.pk)
        if (
            not locked.is_completed
            and locked.is_started
            and locked.is_paused
            and _is_hotwork_window_expired(locked, now)
        ):
            performer = locked.paused_by or locked.started_by
            locked.is_completed = True
            locked.is_paused = False
            locked.completed_by = performer
            locked.completed_at = now
            if not locked.completion_remarks:
                locked.completion_remarks = (
                    "Auto-completed: hotwork time window expired while paused."
                )
            locked.save()

            HotworkProgressActivity.objects.create(
                hotwork=locked,
                action="completed",
                performed_by=performer,
                remarks="Auto-completed: hotwork time window expired while paused.",
            )
            changed = True

    hotwork.is_completed = locked.is_completed
    hotwork.is_paused = locked.is_paused
    hotwork.completed_by = locked.completed_by
    hotwork.completed_by_id = locked.completed_by_id
    hotwork.completed_at = locked.completed_at
    hotwork.completion_remarks = locked.completion_remarks
    return changed


def _parse_date_param(value):
    """Parse a track() date filter -- ISO ``YYYY-MM-DD`` first, then the
    legacy ``%d %b, %Y`` ("05 Sep, 2026") form the old date_range picker
    produced. Returns None for anything unparseable."""
    value = (value or "").strip()
    if not value:
        return None
    parsed = parse_date(value)
    if parsed:
        return parsed
    try:
        return datetime.strptime(value, "%d %b, %Y").date()  # noqa: DTZ007
    except ValueError:
        return None


def _bulk_auto_complete_expired_hotworks(now=None):
    """Port of Hotwork/views.py:617 (_bulk_auto_complete_expired_hotworks).

    Sweeps approved-but-not-completed hotworks whose time window has lapsed:
    a started one is finished through _auto_complete_paused_hotwork_if_expired
    (so its paused branch and progress-activity row still apply), an unstarted
    one is closed out directly with a progress-activity row. Called at the top
    of monitor(), exactly as the legacy monitor view called it.
    """
    now = now or timezone.localtime(timezone.now())
    current_time = now.time()
    cutoff_date_day = (
        now.date() if current_time >= time(17, 0) else now.date() - timedelta(days=1)
    )
    day_expired_q = (
        Q(approval_status="approved")
        & Q(is_completed=False)
        & Q(night_work=False)
        & Q(date_of_hotwork__lte=cutoff_date_day)
    )

    cutoff_date_night = (
        now.date() - timedelta(days=1)
        if current_time >= time(4, 0)
        else now.date() - timedelta(days=2)
    )
    night_expired_q = (
        Q(approval_status="approved")
        & Q(is_completed=False)
        & Q(night_work=True)
        & Q(date_of_hotwork__lte=cutoff_date_night)
    )

    expired = AddHotwork.objects.filter(day_expired_q | night_expired_q)
    for hotwork in expired:
        if hotwork.is_started:
            _auto_complete_paused_hotwork_if_expired(hotwork, now)
        else:
            hotwork.is_completed = True
            hotwork.completed_at = now
            hotwork.completion_remarks = (
                "Auto-expired: requisition was not started before time window expired."
            )
            hotwork.save(
                update_fields=[
                    "is_completed",
                    "completed_at",
                    "completion_remarks",
                ]
            )
            HotworkProgressActivity.objects.create(
                hotwork=hotwork,
                action="completed",
                performed_by=None,
                remarks=(
                    "Auto-expired: requisition was not started before time "
                    "window expired."
                ),
            )


_TRACK_STATUS_FILTERS = {
    "Awaiting for Approval": lambda today: (
        Q(approval_status__in=PENDING_APPROVAL_STATUSES, is_completed=False)
        & ~Q(date_of_hotwork__lt=today)
    ),
    "Ready to Start": lambda today: (
        Q(approval_status="approved", is_started=False, is_completed=False)
        & ~Q(date_of_hotwork__lt=today)
    ),
    "Hotwork in Progress": lambda today: (
        (Q(is_started=True) | Q(is_paused=True))
        & Q(is_completed=False)
        & ~Q(date_of_hotwork__lt=today)
    ),
    "Hotwork Completed": lambda today: (
        Q(is_completed=True)
        & ~Q(completion_remarks__icontains="expired while paused")
        & ~Q(completion_remarks__icontains="requisition was not approved")
    ),
    "Rejected": lambda today: Q(approval_status="rejected"),
    "Expired prior Approval Accorded": lambda today: (
        Q(is_completed=True, completion_remarks__icontains="expired while paused")
        | Q(
            is_completed=True,
            completion_remarks__icontains="requisition was not approved",
        )
        | (
            Q(is_completed=False, date_of_hotwork__lt=today, is_started=False)
            & ~Q(approval_status="approved")
        )
        | Q(is_completed=False, date_of_hotwork__lt=today, is_started=True)
    ),
    "Hotwork Not Started though Approval Accorded": lambda today: Q(
        is_completed=False,
        date_of_hotwork__lt=today,
        approval_status="approved",
        is_started=False,
    ),
}


def _reset_hod_lane_rows(hotwork, lane_ids):
    """Port of Hotwork/views.py:776 (_reset_hod_lane_rows).

    Drops any HotworkHODApproval row not in `lane_ids` and (re)creates a
    blank, unapproved row for each id that still resolves to a real
    Department. Used when a resubmitted requisition re-enters the HOD stage.
    """
    HotworkHODApproval.objects.filter(hotwork=hotwork).exclude(
        department_id__in=lane_ids
    ).delete()

    for lane_id in lane_ids:
        department = Department.objects.filter(id=lane_id).first()
        if not department:
            continue
        hod_approval, _ = HotworkHODApproval.objects.get_or_create(
            hotwork=hotwork, department=department
        )
        hod_approval.approved = False
        hod_approval.approved_by = None
        hod_approval.approved_at = None
        hod_approval.earthing_gts = None
        hod_approval.fire_sensor_ops = None
        hod_approval.fire_sensor_non_ops_remarks = None
        hod_approval.flood_sensor_ops = None
        hod_approval.flood_sensor_non_ops_remarks = None
        hod_approval.supply_point = None
        hod_approval.iccp_off = None
        hod_approval.fire_extinguisher = None
        hod_approval.fire_hose = None
        hod_approval.firemain_pressure = None
        hod_approval.free_lagging = None
        hod_approval.sentry_knowledge = None
        hod_approval.save()


def _get_initial_status_for_existing_hotwork(hotwork):
    """Port of Hotwork/views.py:1311 -- the resubmit entry status, derived
    the same way a brand-new requisition's status is (creator role + whether
    the work is night/holiday)."""
    is_night_or_holiday = HotworkWorkflowConfig.is_night_or_holiday(hotwork)
    return HotworkWorkflowConfig.get_initial_status_for_new_hotwork(
        is_night_or_holiday, hotwork.created_by
    )


def _compute_show_actions(hotwork, now):
    """Port of managehotwork's show_actions computation
    (Hotwork/views.py:746-775)."""
    if not hotwork.date_of_hotwork:
        return False

    current_date = now.date()
    current_time = now.time()

    if hotwork.night_work:
        start_time = time(17, 0)
        end_time = time(4, 0)
        next_day = hotwork.date_of_hotwork + timedelta(days=1)
        return (
            current_date == hotwork.date_of_hotwork and current_time >= start_time
        ) or (current_date == next_day and current_time < end_time)

    start_time = time(9, 0)
    end_time = time(17, 0)
    return (
        current_date == hotwork.date_of_hotwork
        and start_time <= current_time <= end_time
    )


def _get_user_hod_approval(hotwork, user_department, is_hod):
    """The caller's own department's HotworkHODApproval row for the requisition, or None when the caller is not an HOD or has no department."""
    if not (is_hod and user_department):
        return None

    return HotworkHODApproval.objects.filter(
        hotwork=hotwork,
        department=user_department,
    ).first()


def _is_user_dyhod(hotwork, is_dyhod, user_dept_id):
    """True when the given user is a DY HOD in the same department that raised the requisition."""
    return (
        is_dyhod
        and hotwork.created_by_id
        and hotwork.created_by.department_id == user_dept_id
    )


def _is_user_hod(is_hod, user_department):
    """True when the given user is an HOD with a department."""
    return is_hod and user_department


def _is_user_ood(hotwork, profile, is_ood):
    """True when the given user is the requisition's assigned OOD."""
    return is_ood and hotwork.officer_of_the_day_id == profile.id


def _get_role_approvals(
    hotwork,
    profile,
    is_incharge,
    is_dyhod,
    is_hod,
    is_ood,
    user_department,
    hod_approval,
):
    """Per-role dict of whether the caller has already approved in that capacity (incharge / dyhod / hod / ood)."""
    user_dept_id = getattr(user_department, "id", None)

    return {
        "incharge": (
            is_incharge
            and hotwork.hotwork_incharge_id == profile.id
            and hotwork.incharge_approved
        ),
        "dyhod": (
            _is_user_dyhod(
                hotwork,
                is_dyhod,
                user_dept_id,
            )
            and hotwork.dyhod_approved
        ),
        "hod": (
            _is_user_hod(
                is_hod,
                user_department,
            )
            and hod_approval
            and hod_approval.approved
        ),
        "ood": (
            _is_user_ood(
                hotwork,
                profile,
                is_ood,
            )
            and hotwork.ood_approved
        ),
    }


def _get_pending_role(
    hotwork,
    profile,
    is_dyhod,
    is_hod,
    is_ood,
    user_department,
):
    """The role name the caller is currently expected to approve as for this requisition, or None."""
    user_dept_id = getattr(user_department, "id", None)

    if hotwork.approval_status == "pending_dyhod":
        return (
            "dyhod"
            if _is_user_dyhod(
                hotwork,
                is_dyhod,
                user_dept_id,
            )
            else None
        )

    if hotwork.approval_status == "pending_hods":
        return (
            "hod"
            if _is_user_hod(
                is_hod,
                user_department,
            )
            else None
        )

    if hotwork.approval_status == "pending_ood":
        return (
            "ood"
            if _is_user_ood(
                hotwork,
                profile,
                is_ood,
            )
            else None
        )

    return None


def _compute_user_already_approved(
    hotwork,
    profile,
    is_incharge,
    is_dyhod,
    is_hod,
    is_ood,
    user_department,
):
    """Return whether the user has already approved this hotwork."""

    hod_approval = _get_user_hod_approval(
        hotwork,
        user_department,
        is_hod,
    )

    approvals = _get_role_approvals(
        hotwork,
        profile,
        is_incharge,
        is_dyhod,
        is_hod,
        is_ood,
        user_department,
        hod_approval,
    )

    pending_role = _get_pending_role(
        hotwork,
        profile,
        is_dyhod,
        is_hod,
        is_ood,
        user_department,
    )

    if pending_role:
        return approvals[pending_role]

    return any(approvals.values())


def _format_user_with_rank(user_profile):
    """Port of Hotwork/views.py:1441."""
    if not user_profile:
        return "N/A"
    return (
        " ".join(
            filter(
                None,
                [
                    user_profile.rank.name
                    if getattr(user_profile, "rank", None)
                    else "",
                    (user_profile.firstname or "").strip(),
                    (user_profile.lastname or "").strip(),
                ],
            )
        )
        or "N/A"
    )


def _format_datetime_local(value, fmt="%d %b %Y %H:%M"):
    """Port of Hotwork/views.py:1452."""
    if not value:
        return "N/A"
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
    return timezone.localtime(value).strftime(fmt)


def generate_hotwork_qr_code(
    hotwork, hod_engineering=None, hod_electrical=None, hod_nbcd=None
):
    """Port of Hotwork/views.py:1576 (generate_hotwork_qr_code)."""
    qr_payload = {
        "hotwork_id": hotwork.id,
        "hotwork_code": hotwork.hotwork_code,
        "date_of_hotwork": hotwork.date_of_hotwork.isoformat()
        if hotwork.date_of_hotwork
        else None,
        "location_of_hotwork": hotwork.location_of_hotwork,
        "type_of_hotwork": hotwork.type_of_hotwork,
        "night_work": hotwork.night_work,
        "holiday_or_working_day": hotwork.holiday_or_working_day,
        "approval_status": hotwork.approval_status,
        "approvals": {
            "dyhod": {
                "approved": bool(hotwork.dyhod_approved),
                "approved_by": _format_user_with_rank(hotwork.dyhod_approved_by),
                "approved_at": _format_datetime_local(hotwork.dyhod_approved_at),
            },
            "engineering_hod": {
                "approved": bool(hod_engineering and hod_engineering.approved),
                "approved_by": _format_user_with_rank(
                    hod_engineering.approved_by if hod_engineering else None
                ),
                "approved_at": _format_datetime_local(
                    hod_engineering.approved_at if hod_engineering else None
                ),
            },
            "electrical_hod": {
                "approved": bool(hod_electrical and hod_electrical.approved),
                "approved_by": _format_user_with_rank(
                    hod_electrical.approved_by if hod_electrical else None
                ),
                "approved_at": _format_datetime_local(
                    hod_electrical.approved_at if hod_electrical else None
                ),
            },
            "nbcd_hod": {
                "approved": bool(hod_nbcd and hod_nbcd.approved),
                "approved_by": _format_user_with_rank(
                    hod_nbcd.approved_by if hod_nbcd else None
                ),
                "approved_at": _format_datetime_local(
                    hod_nbcd.approved_at if hod_nbcd else None
                ),
            },
            "ood": {
                "approved": bool(hotwork.ood_approved),
                "approved_by": _format_user_with_rank(hotwork.ood_approved_by),
                "approved_at": _format_datetime_local(hotwork.ood_approved_at),
            },
        },
    }

    qr_data = json.dumps(qr_payload, ensure_ascii=False)
    qr_image = qrcode.make(qr_data)
    buffer = BytesIO()
    qr_image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def _generate_hotwork_esign_qr(username, comment_text, hotwork_id, role):
    """Port of Hotwork/views.py:889 (_generate_hotwork_esign_qr) -- renders
    the e-sign approval QR (approver identity + comment + timestamp) whose
    base64 PNG the approve forms embed as their e_sign_key."""
    qr_text = (
        "E-Sign Approval\n"
        "Module: Hotwork\n"
        f"Role: {role}\n"
        f"Username: {username}\n"
        f"Comment: {comment_text}\n"
        f"Date: {timezone.localtime(timezone.now()).strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"Hotwork ID: {hotwork_id}"
    )

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(qr_text)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


@extend_schema(tags=["Hotwork"])
class DashboardView(APIView):
    """GET dashboard/ -- reproduces hotworkhome's aggregate KPI/chart data
    (Hotwork/views.py:117), not a page shell: today/scheduled/in-progress/
    ready-to-start/awaiting-approval/completed-today counts, weekly_data
    (last 10 days), progress_data (pie breakdown), history_data (last ~12
    months), and role flags."""

    def get(self, request):
        """Return the hotwork dashboard payload: today's KPI counts, the 10-day and
        roughly 12-month chart series, and the pending-registration count.
        """
        today = timezone.localtime(timezone.now()).date()
        first_day_of_month = today.replace(day=1)
        last_10_days_start = today - timedelta(days=9)

        scheduled_today = AddHotwork.objects.filter(
            date_of_hotwork=today, approval_status="approved"
        ).count()
        hotwork_in_progress_today = AddHotwork.objects.filter(
            date_of_hotwork=today, approval_status="approved", is_completed=False
        ).count()
        ready_to_start_today = AddHotwork.objects.filter(
            date_of_hotwork=today,
            approval_status="approved",
            is_started=False,
            is_completed=False,
        ).count()
        awaiting_approval_today = AddHotwork.objects.filter(
            date_of_hotwork=today, approval_status__in=PENDING_APPROVAL_STATUSES
        ).count()
        completed_today = AddHotwork.objects.filter(
            is_completed=True, completed_at__date=today
        ).count()

        weekly_data = []
        for i in range(10):
            chart_date = last_10_days_start + timedelta(days=i)
            initiated_count = AddHotwork.objects.filter(
                date_of_hotwork=chart_date,
                approval_status__in=PENDING_APPROVAL_STATUSES,
            ).count()
            ready_count = AddHotwork.objects.filter(
                date_of_hotwork=chart_date, approval_status="approved", is_started=False
            ).count()
            completed_count = AddHotwork.objects.filter(
                completed_at__date=chart_date, is_completed=True
            ).count()
            weekly_data.append(
                {
                    "date": chart_date.strftime("%d %b %y"),
                    "initiated": initiated_count,
                    "ready": ready_count,
                    "completed": completed_count,
                }
            )

        initiated_total = AddHotwork.objects.filter(
            date_of_hotwork=today, approval_status__in=PENDING_APPROVAL_STATUSES
        ).count()
        ready_total = AddHotwork.objects.filter(
            date_of_hotwork=today,
            approval_status="approved",
            is_started=False,
            is_completed=False,
        ).count()
        completed_total = AddHotwork.objects.filter(
            completed_at__date=today, is_completed=True
        ).count()
        paused_total = AddHotwork.objects.filter(
            date_of_hotwork=today, is_paused=True, is_completed=False
        ).count()

        progress_data = [
            {"category": "Initiated", "value": initiated_total, "color": "#f39c12"},
            {"category": "Ready", "value": ready_total, "color": "#e17055"},
            {"category": "Paused", "value": paused_total, "color": "#d63031"},
            {"category": "Completed", "value": completed_total, "color": "#0984e3"},
        ]

        history_start_date = first_day_of_month
        for _ in range(11):
            history_start_date = (history_start_date - timedelta(days=1)).replace(day=1)

        ready_counts = {
            item["date_of_hotwork"]: item["total"]
            for item in AddHotwork.objects.filter(
                date_of_hotwork__gte=history_start_date,
                approval_status="approved",
                is_started=False,
            )
            .values("date_of_hotwork")
            .annotate(total=Count("id"))
        }
        in_progress_counts = {
            item["date_of_hotwork"]: item["total"]
            for item in AddHotwork.objects.filter(
                date_of_hotwork__gte=history_start_date,
                is_started=True,
                is_completed=False,
            )
            .values("date_of_hotwork")
            .annotate(total=Count("id"))
        }
        completed_counts = {
            item["completed_at__date"]: item["total"]
            for item in AddHotwork.objects.filter(
                completed_at__date__gte=history_start_date, is_completed=True
            )
            .values("completed_at__date")
            .annotate(total=Count("id"))
        }
        all_history_dates = sorted(
            set(ready_counts) | set(in_progress_counts) | set(completed_counts)
        )
        history_data = [
            {
                "date": chart_date.strftime("%Y-%m-%d"),
                "ready": ready_counts.get(chart_date, 0),
                "in_progress": in_progress_counts.get(chart_date, 0),
                "completed": completed_counts.get(chart_date, 0),
            }
            for chart_date in all_history_dates
        ]

        # Developed with Understanding: HRCDF-synced rows with no credentials are crew,
        # not pending registrations (D3, OQ13).
        pending_user_registrations_count = (
            CustomUserProfile.objects.filter(is_role=False)
            .exclude(auth_source=AUTH_SOURCE_HRCDF, has_credentials=False)
            .count()
        )

        payload = {
            "scheduled_today": scheduled_today,
            "hotwork_in_progress_today": hotwork_in_progress_today,
            "ready_to_start_today": ready_to_start_today,
            "awaiting_approval_today": awaiting_approval_today,
            "completed_today": completed_today,
            "weekly_data": weekly_data,
            "progress_data": progress_data,
            "history_data": history_data,
            "pending_user_registrations_count": pending_user_registrations_count,
            "today_date": today.strftime("%Y-%m-%d"),
        }
        return Response(payload)


class HotworkObjectPermission(BasePermission):
    """Object-level visibility for retrieve/start/pause/complete/
    print_certificate - previously these fell through to an unfiltered
    get_queryset() with no department check at all. Visible if privileged,
    the creator/incharge/OOD, sharing the creator's department (the DYHOD
    stage requires no role beyond department membership - see
    AddHotwork.dyhod_approved's model comment), or the caller's department
    has an attached HOD-approval row."""

    def has_object_permission(self, request, view, obj):
        """Object-level visibility for retrieve / start / pause / complete / print:
        privileged users, the creator / incharge / assigned OOD, anyone in the
        raising department, or an HOD whose department has an attached approval
        row.
        """
        if rbac.can_see_all_departments(request.user):
            return True
        profile = _profile(request.user)
        if profile is None:
            return False
        if profile.id in (
            obj.created_by_id,
            obj.hotwork_incharge_id,
            obj.officer_of_the_day_id,
        ):
            return True
        own_department_id = profile.department_id
        if own_department_id is None:
            return False
        if obj.created_by_id and obj.created_by.department_id == own_department_id:
            return True
        return obj.hod_approvals.filter(department_id=own_department_id).exists()


@extend_schema(tags=["Hotwork"])
class HotworkViewSet(viewsets.ModelViewSet):
    """
    Endpoint map (legacy originals in Hotwork/views.py):
      list                    -> managehotwork (:667)
      create                  -> addhotwork's POST branch (:798-1020)
      retrieve                -> NEW (no legacy equivalent) -- gated by just
                                  IsAccountActive, matching the legacy
                                  baseline of zero read-side auth.
      form_meta (GET)         -> addhotwork's GET branch (:798-861)
      inbox (GET)             -> hotworks awaiting the caller's approval
      outbox (GET)            -> hotworks created by the caller
      pending_approval (GET)  -> hotworkapproval (:323)
      track (GET)             -> trackhotwork (:540)
      report (GET)            -> reporthotwork (:627)
      dyhod_approve (POST)    -> dyhod_approve_hotwork (:1072)
      hod_approve (POST)      -> hod_approve_hotwork (:1140)
      ood_approve (POST)      -> ood_approve_hotwork (:1236)
      start (POST)            -> start_hotwork (:1326) -- now gated by
                                  CanOperateLifecycle (tightening, see
                                  permissions.py)
      pause (POST)            -> pause_hotwork (:1366) -- same tightening
      complete (POST)         -> complete_hotwork (:1401) -- same tightening
      print_certificate (GET) -> print_hotwork_certificate (:1462) -- now
                                  gated by CanPrintCertificate (tightening)

    incharge_approve_hotwork (dead stub) and usermasterhotwork (non-
    functional placeholder) are intentionally NOT ported (confirmed
    excluded).
    """

    http_method_names = ("get", "post", "head", "options")
    permission_classes = (IsAuthenticated, HotworkObjectPermission)

    def get_serializer_class(self):
        """HotworkCreateSerializer for create, HotworkSerializer otherwise."""
        if self.action == "create":
            return HotworkCreateSerializer
        return HotworkSerializer

    def get_queryset(self):
        """Base AddHotwork queryset with every FK the serializer touches select_related / prefetch_related, newest first."""
        return (
            AddHotwork.objects.select_related(
                "sub_department",
                "created_by",
                "created_by__ship",
                "created_by__department",
                "hotwork_incharge",
                "officer_of_the_day",
                "departmental_officer_user",
                "eo_officer",
                "lo_officer",
                "nbcdo_officer",
                "dyhod_approved_by",
                "incharge_approved_by",
                "ood_approved_by",
                "rejected_by",
                "started_by",
                "paused_by",
                "completed_by",
            )
            .prefetch_related("hod_approvals__department", "hod_approvals__approved_by")
            .order_by("-created_at")
            .distinct()
        )

    def create(self, request, *args, **kwargs):
        """Validate the payload, resolve the workflow-correct entry status for the
        creator's role, create the row, run the post-create approval wiring, and
        pre-generate the certificate PDF for an OOD-creator's already-approved
        requisition.
        """
        serializer = HotworkCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        profile = _profile(request.user)
        if profile is None:
            raise ValidationError("User profile not found. Contact administrator.")

        flags = _resolve_creator_flags(profile)
        is_nh = bool(
            data.get("night_work") or data.get("holiday_or_working_day") == "holiday"
        )

        if flags["is_ood_creator"]:
            initial_status = "approved"
        elif flags["is_co_creator"]:
            initial_status = "pending_ood"
        else:
            initial_status = HotworkWorkflowConfig.get_initial_status_for_new_hotwork(
                is_nh, profile
            )

        creator_self_dyhod = flags["is_dyhod_creator"]
        creator_lane_dept_id = _creator_self_lane_dept_id(profile, data)
        needs_esign = (
            flags["is_ood_creator"]
            or creator_self_dyhod
            or creator_lane_dept_id is not None
        )
        if needs_esign and not (data.get("e_sign_key") or "").strip():
            raise ValidationError(
                {"e_sign_key": "Please generate eSign QR before approving and sending."}
            )
        if needs_esign and not (data.get("esign_comment") or "").strip():
            raise ValidationError(
                {"esign_comment": "eSign remarks/comment is mandatory."}
            )

        with transaction.atomic():
            hotwork = serializer.save(initial_status=initial_status)
            self._wire_new_hotwork(
                hotwork,
                profile,
                data,
                flags,
                creator_self_dyhod,
                creator_lane_dept_id,
                request,
            )

        if hotwork.approval_status == "approved":
            self._save_certificate_pdf(hotwork, request)

        output = HotworkSerializer(hotwork, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_201_CREATED)

    def _wire_new_hotwork(
        self,
        hotwork,
        profile,
        data,
        flags,
        creator_self_dyhod,
        creator_lane_dept_id,
        request,
    ):
        """Post-create approval wiring for the privileged / OOD-creator
        flows -- addhotwork's big `if initial_status in [...]:` block
        (Hotwork/views.py:2433-2559)."""
        now = timezone.now()
        username = request.user.get_username()
        e_sign_key = data.get("e_sign_key") or ""
        esign_comment = data.get("esign_comment") or ""

        if flags["is_ood_creator"]:
            checklist = HotworkOodApproveSerializer(
                data={**request.data, "action": "approve"},
                context={"apply_checklist": True},
            )
            checklist.is_valid(raise_exception=True)
            for dept_id in HotworkWorkflowConfig.day_officer_lane_department_ids():
                department = Department.objects.filter(id=dept_id).first()
                if department is None or not _lane_has_eligible_approver(dept_id):
                    continue
                row, _ = HotworkHODApproval.objects.get_or_create(
                    hotwork=hotwork, department=department
                )
                row.approved = True
                row.approved_by = profile
                row.approved_at = now
                row.e_sign_key = e_sign_key
                row.esign_comment = esign_comment
                row.e_sign_username = username
                row.e_sign_date = now
                checklist.apply_to_approval(row, dept_id)
                row.save()

            hotwork.ood_approved = True
            hotwork.ood_approved_by = profile
            hotwork.ood_approved_at = now
            hotwork.ood_e_sign_key = e_sign_key
            hotwork.ood_esign_comment = esign_comment
            hotwork.ood_e_sign_username = username
            hotwork.ood_e_sign_date = now
            hotwork.save()
            return

        if hotwork.approval_status != "pending_hods":
            return

        _seed_day_hod_lane_rows(hotwork)

        if creator_self_dyhod:
            hotwork.departmental_officer_user = profile
            hotwork.departmental_officer = _format_user_with_rank(profile)
            hotwork.dyhod_approved = True
            hotwork.dyhod_approved_by = profile
            hotwork.dyhod_approved_at = now
            hotwork.dyhod_e_sign_key = e_sign_key
            hotwork.dyhod_esign_comment = esign_comment
            hotwork.dyhod_e_sign_username = username
            hotwork.dyhod_e_sign_date = now
            hotwork.save()

        if creator_lane_dept_id is not None:
            row = hotwork.hod_approvals.filter(
                department_id=creator_lane_dept_id
            ).first()
            if row is not None and not row.approved:
                checklist = HotworkHodApproveSerializer(
                    data={**request.data, "action": "approve"},
                    context={"dept_id": creator_lane_dept_id},
                )
                checklist.is_valid(raise_exception=True)
                row.approved = True
                row.approved_by = profile
                row.approved_at = now
                row.e_sign_key = e_sign_key
                row.esign_comment = esign_comment
                row.e_sign_username = username
                row.e_sign_date = now
                checklist.apply_to_approval(row, creator_lane_dept_id)
                row.save()

        hotwork.check_all_hods_approved()

    def list(self, request, *args, **kwargs):
        """Caller's open requisitions (created / incharge / assigned OOD, plus their
        department's HOD queue for day work), auto-completing expired paused ones
        and dropping anything past its time window, each annotated with
        show_actions.
        """
        profile = _profile(request.user)
        if profile is None:
            return Response([])

        if rbac.can_see_all_departments(request.user):
            hotworks = self.get_queryset()
        else:
            user_department = profile.department

            query = (
                Q(created_by=profile)
                | Q(hotwork_incharge=profile)
                | Q(officer_of_the_day=profile)
            )

            hod_applicable_query = Q(night_work=False) & ~Q(
                holiday_or_working_day="holiday"
            )
            hod_visibility_query = Q(
                hod_approvals__department=user_department,
                hod_approvals__approved=False,
                approval_status__in=["pending_first_hod", "pending_hods"],
            ) | Q(
                hod_approvals__department=user_department, hod_approvals__approved=True
            )
            query |= hod_applicable_query & hod_visibility_query

            hotworks = (
                self.get_queryset().filter(query).order_by("-created_at").distinct()
            )
        hotworks = hotworks.filter(is_completed=False)

        now = timezone.localtime(timezone.now())
        visible = []
        for hotwork in hotworks:
            _auto_complete_paused_hotwork_if_expired(hotwork, now)
            if hotwork.is_completed:
                continue
            if _is_hotwork_window_expired(hotwork, now):
                continue
            if (
                hotwork.approval_status == "approved"
                and not hotwork.is_started
                and _is_hotwork_window_expired(hotwork, now)
            ):
                continue

            hotwork.show_actions = _compute_show_actions(hotwork, now)
            visible.append(hotwork)

        serializer = self.get_serializer(visible, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="form_meta")
    def form_meta(self, request):
        """
        GET /api/hotworks/form_meta/

        Provides all metadata required by the legacy addhotwork GET form.
        """

        profile = _profile(request.user)

        if profile is None:
            return Response(
                {
                    "subdepartments": [],
                    "previous_hotworks": [],
                    "officers": [],
                    "nbcdo_officers": [],
                    "sentry_users": [],
                    "ood_users": [],
                    "dart_options": [],
                    "visible_officer_fields": {},
                    "form_values": {},
                    "role_flags": {},
                    "min_hotwork_date": timezone.localtime(timezone.now())
                    .date()
                    .isoformat(),
                    "tomorrow_date": (
                        timezone.localtime(timezone.now()).date() + timedelta(days=1)
                    ).isoformat(),
                }
            )

        user_role_name = profile.role_master.role_name if profile.role_master else ""

        is_co_creator = rbac.is_command_role(profile)

        is_ood_creator = bool(getattr(profile, "is_ood", False)) and not is_co_creator

        is_dyhod_creator = (
            user_role_name == "DY HOD" and not is_ood_creator and not is_co_creator
        )

        is_hod_creator = (
            user_role_name == "Head of Department"
            and not is_excluded_hod(profile)
            and not is_ood_creator
            and not is_co_creator
        )

        is_privileged_initiator = is_dyhod_creator or is_hod_creator

        workflow_type = HotworkWorkflowConfig.get_workflow_type(
            profile,
            False,
        )

        visible_officer_fields = HotworkWorkflowConfig.get_visible_officer_fields(
            workflow_type,
            is_creator=True,
        )

        if is_dyhod_creator:
            visible_officer_fields["departmental_officer_user"] = True

        elif is_hod_creator and profile.department:
            dept_name = profile.department.name.strip().upper()

            if dept_name == "ENGINEERING":
                visible_officer_fields["eo_officer"] = True

            elif dept_name == "ELECTRICAL":
                visible_officer_fields["lo_officer"] = True

            elif dept_name == "NBCDO":
                visible_officer_fields["nbcdo_officer"] = True

        elif is_ood_creator:
            visible_officer_fields = {
                "departmental_officer_user": False,
                "eo_officer": False,
                "lo_officer": False,
                "nbcdo_officer": False,
                "officer_of_the_day": False,
            }

        elif is_co_creator:
            visible_officer_fields = {
                "departmental_officer_user": False,
                "eo_officer": False,
                "lo_officer": False,
                "nbcdo_officer": False,
                "officer_of_the_day": True,
            }

        department_obj = profile.department

        subdepartments = SubDepartment.objects.filter(
            department_name=department_obj
        ).order_by("id")

        three_months_ago = timezone.localtime(timezone.now()).date() - timedelta(
            days=90
        )

        previous_hotworks = (
            AddHotwork.objects.filter(date_of_hotwork__gte=three_months_ago)
            .select_related("sub_department")
            .order_by(
                "-date_of_hotwork",
                "-created_at",
            )
        )

        officers = (
            CustomUserProfile.objects.filter(
                user_active=True,
                role_master_id__in=[2, 6],
            )
            .select_related(
                "rank",
                "department",
            )
            .order_by(
                "rank__name",
                "firstname",
                "lastname",
            )
        )

        nbcdo_officers = (
            _nbcd_officer_queryset()
            .filter(user_active=True)
            .select_related(
                "rank",
                "department",
            )
            .order_by(
                "rank__name",
                "firstname",
                "lastname",
            )
        )

        ood_users = (
            CustomUserProfile.objects.filter(
                user_active=True,
                is_ood=True,
            )
            .select_related(
                "rank",
                "department",
            )
            .order_by(
                "rank__name",
                "firstname",
                "lastname",
            )
        )

        sentry_users = (
            CustomUserProfile.objects.filter(user_active=True)
            .select_related(
                "rank",
                "department",
            )
            .exclude(role_master_id__in=[1, 2, 3])
            .order_by(
                "rank__name",
                "firstname",
                "lastname",
            )
        )

        latest_dl_no_subquery = (
            InitiateRADL.objects.filter(initiate_dart=OuterRef("pk"))
            .exclude(dl_no__isnull=True)
            .exclude(dl_no="")
            .order_by("-updated_date")
            .values("dl_no")[:1]
        )

        outstanding_darts = (
            InitiateDart.objects.open()
            .annotate(latest_dl_no=Subquery(latest_dl_no_subquery))
            .order_by(
                "-created_date",
                "-id",
            )
        )

        dart_options = []

        for dart in outstanding_darts:
            description = (dart.defective_discriptions or "").strip()

            short_description = (
                f"{description[:100]}..." if len(description) > 100 else description
            )

            dart_options.append(
                {
                    "id": str(dart.id),
                    "dart_number": dart.dart_number or "",
                    "display": (
                        f"{dart.dart_number or '-'} | "
                        f"{short_description or '-'} | "
                        f"{dart.latest_dl_no or '-'}"
                    ),
                    "description": description,
                    "maintenance_period": (dart.maintenance_period or "")
                    .strip()
                    .lower(),
                    "occasion_nomenclature": (dart.dart_occasion or "").strip().upper(),
                    "ra_dl_no": dart.latest_dl_no or "",
                }
            )

        today = timezone.localtime(timezone.now()).date()
        tomorrow = today + timedelta(days=1)

        form_values = {
            "requisition_type": "fresh",
            "linked_previous_requisition_id": "",
            "maintenance_period": "",
            "occasion_nomenclature": "",
            "dart_reference_id": "",
            "requisition_received_from": "",
            "requisition_received_from_details": "",
            "date_of_hotwork": tomorrow.isoformat(),
            "type_of_hotwork": "",
            "sub_department_id": "",
            "location_of_hotwork": "",
            "all_adjacent_compartments": "",
            "number_of_sentries": "0",
            "sentry_names_select": [],
            "sentry_name_other": "",
            "holiday_or_working_day": "workingDay",
            "time_of_hotwork": "day",
            "dl_number": "",
            "supervision_welder_name": "",
            "officer_of_the_day_id": "",
            "departmental_officer_user_id": "",
            "nbcdo_officer_id": "",
            "eo_officer_id": "",
            "lo_officer_id": "",
            "esign_comment": "",
            "e_sign_key": "",
            "earthingGT": "",
            "fireSensor": "",
            "fireSensorRemarks": "",
            "floodSensor": "",
            "floodSensorRemarks": "",
            "supplyPoint": "",
            "iccpOff": "",
            "fireExtinguisher": "",
            "fireHose": "",
            "firemainPressure": "",
            "freeLagging": "",
            "sentryKnowledge": "",
            "remarks": "",
        }

        if is_dyhod_creator:
            form_values["departmental_officer_user_id"] = str(profile.id)

        elif is_hod_creator and profile.department:
            dept_name = profile.department.name.strip().upper()

            if dept_name == "ENGINEERING":
                form_values["eo_officer_id"] = str(profile.id)

            elif dept_name == "ELECTRICAL":
                form_values["lo_officer_id"] = str(profile.id)

            elif dept_name == "NBCDO":
                form_values["nbcdo_officer_id"] = str(profile.id)

        elif is_ood_creator:
            form_values["officer_of_the_day_id"] = str(profile.id)

        if is_dyhod_creator:
            visible_officer_fields["departmental_officer_user"] = True

        elif is_hod_creator and profile.department:
            dept_name = profile.department.name.strip().upper()

            if dept_name == "ENGINEERING" and form_values["eo_officer_id"]:
                visible_officer_fields["eo_officer"] = True

            elif dept_name == "ELECTRICAL" and form_values["lo_officer_id"]:
                visible_officer_fields["lo_officer"] = True

            elif dept_name == "NBCDO" and form_values["nbcdo_officer_id"]:
                visible_officer_fields["nbcdo_officer"] = True

        role_flags = get_user_approval_roles(request)

        def serialize_profile(user):
            """Flat id/rank/firstname/lastname/personal_number/designation/department_id projection of a CustomUserProfile for the form dropdowns."""
            return {
                "id": user.id,
                "rank": (user.rank.name if user.rank else ""),
                "firstname": user.firstname or "",
                "lastname": user.lastname or "",
                "personal_number": (user.personal_number or ""),
                "designation": (
                    getattr(
                        getattr(
                            user,
                            "designation_master",
                            None,
                        ),
                        "designation",
                        "",
                    )
                    or ""
                ),
                "department_id": (user.department_id),
            }

        return Response(
            {
                "department": (
                    {
                        "id": department_obj.id,
                        "name": department_obj.name,
                    }
                    if department_obj
                    else None
                ),
                "subdepartments": [
                    {
                        "id": subdepartment.id,
                        "name": subdepartment.name,
                    }
                    for subdepartment in subdepartments
                ],
                "previous_hotworks": [
                    {
                        "id": hotwork.id,
                        "hotwork_code": hotwork.hotwork_code,
                        "date_of_hotwork": (
                            hotwork.date_of_hotwork.isoformat()
                            if hotwork.date_of_hotwork
                            else None
                        ),
                        "sub_department": (
                            hotwork.sub_department.name
                            if hotwork.sub_department
                            else ""
                        ),
                    }
                    for hotwork in previous_hotworks
                ],
                "officers": [serialize_profile(user) for user in officers],
                "nbcdo_officers": [serialize_profile(user) for user in nbcdo_officers],
                "sentry_users": [serialize_profile(user) for user in sentry_users],
                "ood_users": [serialize_profile(user) for user in ood_users],
                "dart_options": dart_options,
                "workflow_type": workflow_type,
                "visible_officer_fields": (visible_officer_fields),
                "form_values": form_values,
                "min_hotwork_date": today.isoformat(),
                "tomorrow_date": tomorrow.isoformat(),
                "type_of_hotwork_choices": [
                    {
                        "value": value,
                        "label": label,
                    }
                    for value, label in HotworkType.choices
                ],
                "holiday_or_working_day_choices": [
                    {
                        "value": value,
                        "label": label,
                    }
                    for value, label in DayType.choices
                ],
                "requisition_type_choices": [
                    {
                        "value": value,
                        "label": label,
                    }
                    for value, label in AddHotwork.REQUISITION_TYPE_CHOICES
                ]
                if hasattr(AddHotwork, "REQUISITION_TYPE_CHOICES")
                else [
                    {"value": "fresh", "label": "Fresh"},
                    {
                        "value": "continuation",
                        "label": "Continuation",
                    },
                ],
                "maintenance_period_choices": [
                    {
                        "value": "operational",
                        "label": "Operational",
                    },
                    {
                        "value": "refit",
                        "label": "Refit",
                    },
                ],
                "occasion_nomenclature_choices": [
                    {
                        "value": "AMP",
                        "label": "AMP",
                    },
                    {
                        "value": "SMP",
                        "label": "SMP",
                    },
                    {
                        "value": "NR",
                        "label": "NR",
                    },
                ],
                "requisition_received_from_choices": [
                    {
                        "value": "Dockyard",
                        "label": "Dockyard",
                    },
                    {
                        "value": "FMU",
                        "label": "FMU",
                    },
                    {
                        "value": "Vendor",
                        "label": "Vendor",
                    },
                    {
                        "value": "SS",
                        "label": "SS",
                    },
                    {
                        "value": "OEM",
                        "label": "OEM",
                    },
                ],
                "time_of_hotwork_choices": [
                    {
                        "value": "day",
                        "label": "Day",
                    },
                    {
                        "value": "night",
                        "label": "Night",
                    },
                ],
                "role_flags": role_flags,
                "creator": {
                    "id": profile.id,
                    "firstname": profile.firstname or "",
                    "lastname": profile.lastname or "",
                    "personal_number": (profile.personal_number or ""),
                    "is_co_creator": is_co_creator,
                    "is_ood_creator": is_ood_creator,
                    "is_dyhod_creator": is_dyhod_creator,
                    "is_hod_creator": is_hod_creator,
                    "is_privileged_initiator": (is_privileged_initiator),
                },
            }
        )

    def _get_pending_approval_context(self, profile):
        """Return the user's approval-role context."""
        user_department = profile.department

        return {
            "is_incharge": self._has_incharge_hotworks(profile),
            "is_ood": self._has_ood_hotworks(profile),
            "user_department": user_department,
        }

    def _has_incharge_hotworks(self, profile):
        """True when the profile is the incharge on any requisition."""
        return (
            self.get_queryset()
            .filter(
                hotwork_incharge=profile,
            )
            .exists()
        )

    def _has_ood_hotworks(self, profile):
        """True when the profile is the assigned OOD on any pending-OOD or already-OOD-approved requisition."""
        return (
            self.get_queryset()
            .filter(
                officer_of_the_day=profile,
            )
            .filter(
                Q(approval_status="pending_ood") | Q(ood_approved=True),
            )
            .exists()
        )

    def _get_incharge_hotworks(self, profile):
        """Requisitions where the profile is the incharge, newest first."""
        return (
            self.get_queryset()
            .filter(
                hotwork_incharge=profile,
            )
            .order_by("-created_at")
        )

    def _get_ood_hotworks(self, profile):
        """Pending-OOD or OOD-approved requisitions assigned to the profile, newest first."""
        return (
            self.get_queryset()
            .filter(officer_of_the_day=profile)
            .filter(Q(approval_status="pending_ood") | Q(ood_approved=True))
            .order_by("-created_at")
        )

    def _get_dyhod_hotworks(self, profile, user_department):
        """The department's pending-DYHOD or DYHOD-approved requisitions, newest first."""
        return (
            self.get_queryset()
            .filter(created_by__department=user_department)
            .filter(Q(approval_status="pending_dyhod") | Q(dyhod_approved=True))
            .order_by("-created_at")
        )

    def _get_hod_hotworks(self, user_department):
        """Day requisitions with an approval row for the department that is either
        still pending in the HOD stage or already approved, newest first.
        """
        applicable_query = Q(night_work=False) & ~Q(holiday_or_working_day="holiday")

        visibility_query = Q(
            hod_approvals__department=user_department,
            hod_approvals__approved=False,
            approval_status__in=[
                "pending_first_hod",
                "pending_hods",
            ],
        ) | Q(
            hod_approvals__department=user_department,
            hod_approvals__approved=True,
        )

        return (
            self.get_queryset()
            .filter(applicable_query & visibility_query)
            .order_by("-created_at")
        )

    @action(detail=False, methods=["get"])
    def inbox(self, request):
        """Return hotworks for which the caller is the current approver.

        A hotwork enters an inbox only at its active approval stage: a
        department officer reviews work raised by their department, an HOD
        reviews their department's outstanding approval row, and the assigned
        OOD performs the final review.  Completed, rejected, and already
        approved records therefore never appear here.
        """
        profile = _profile(request.user)
        if profile is None:
            return Response([])

        if rbac.can_see_all_departments(request.user):
            hotworks = (
                self.get_queryset()
                .filter(approval_status__in=PENDING_APPROVAL_STATUSES)
                .order_by("-created_at")
                .distinct()
            )
            return Response(self.get_serializer(hotworks, many=True).data)

        department = profile.department
        query = Q(officer_of_the_day=profile, approval_status="pending_ood")

        if department:
            query |= Q(
                created_by__department=department,
                approval_status="pending_dyhod",
            )
            query |= Q(
                hod_approvals__department=department,
                hod_approvals__approved=False,
                approval_status__in=["pending_first_hod", "pending_hods"],
            )

        hotworks = self.get_queryset().filter(query).order_by("-created_at").distinct()
        return Response(self.get_serializer(hotworks, many=True).data)

    @action(detail=False, methods=["get"])
    def outbox(self, request):
        """Return all hotworks raised by the authenticated user."""
        profile = _profile(request.user)
        if profile is None:
            return Response([])

        hotworks = (
            self.get_queryset().filter(created_by=profile).order_by("-created_at")
        )
        return Response(self.get_serializer(hotworks, many=True).data)

    @action(detail=False, methods=["get"], url_path="track")
    def track(self, request):
        """Caller's full hotwork history (trackhotwork) -- every requisition
        the user created, is assigned to, approved, or ran, plus their
        department's queue when they are an HOD. Runs the bulk
        auto-complete/expire sweep first, then applies the optional
        ``hotwork_status`` bucket and the ``department`` / ``type_of_hotwork``
        / ``location`` / ``date_from`` / ``date_to`` filters, and annotates
        each row with ``show_actions``.
        """
        profile = _profile(request.user)
        if profile is None:
            return Response([])
        role_name = getattr(getattr(profile, "role_master", None), "role_name", None)
        is_hod_role = role_name == HOD

        now = timezone.localtime(timezone.now())
        _bulk_auto_complete_expired_hotworks(now)

        if rbac.can_see_all_departments(request.user):
            query = Q(pk__isnull=False)
        else:
            query = (
                Q(created_by=profile)
                | Q(hotwork_incharge=profile)
                | Q(officer_of_the_day=profile)
                | Q(departmental_officer_user=profile)
                | Q(eo_officer=profile)
                | Q(lo_officer=profile)
                | Q(nbcdo_officer=profile)
                | Q(started_by=profile)
                | Q(paused_by=profile)
                | Q(completed_by=profile)
                | Q(dyhod_approved_by=profile)
                | Q(ood_approved_by=profile)
                | Q(hod_approvals__approved_by=profile)
            )
            if is_hod_role and profile.department_id:
                query |= Q(created_by__department_id=profile.department_id)

        hotworks = self.get_queryset().filter(query)

        today = now.date()
        status_bucket = (request.query_params.get("hotwork_status") or "").strip()
        status_filter = _TRACK_STATUS_FILTERS.get(status_bucket)
        if status_filter:
            hotworks = hotworks.filter(status_filter(today))

        department = (request.query_params.get("department") or "").strip()
        if department and department.upper() != "ALL":
            hotworks = hotworks.filter(created_by__department_id=department)

        type_of_hotwork = (request.query_params.get("type_of_hotwork") or "").strip()
        if type_of_hotwork and type_of_hotwork.upper() != "ALL":
            hotworks = hotworks.filter(type_of_hotwork=type_of_hotwork)

        location = (request.query_params.get("location") or "").strip()
        if location and location.upper() != "ALL":
            hotworks = hotworks.filter(location_of_hotwork__icontains=location)

        date_from = _parse_date_param(request.query_params.get("date_from"))
        date_to = _parse_date_param(request.query_params.get("date_to"))
        if date_from and date_to:
            hotworks = hotworks.filter(date_of_hotwork__range=[date_from, date_to])
        elif date_from:
            hotworks = hotworks.filter(date_of_hotwork__gte=date_from)
        elif date_to:
            hotworks = hotworks.filter(date_of_hotwork__lte=date_to)

        hotworks = hotworks.order_by("-created_at").distinct()

        rows = []
        for hotwork in hotworks:
            hotwork.show_actions = _compute_show_actions(hotwork, now)
            rows.append(hotwork)

        return Response(self.get_serializer(rows, many=True).data)

    @action(detail=False, methods=["get"], url_path="report")
    def report(self, request):
        """Requisitions the caller raised or that have passed the DYHOD stage, newest first."""
        profile = _profile(request.user)
        if profile is None:
            return Response([])

        hotworks = (
            self.get_queryset()
            .filter(Q(dyhod_approved=True) | Q(created_by=profile))
            .order_by("-created_at")
        )

        serializer = self.get_serializer(hotworks, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="monitor")
    def monitor(self, request):
        """Approved, not-yet-completed requisitions whose time window is
        still open, scoped to the caller's involvement -- the legacy
        monitor_approved_requisitions view. Runs the bulk auto-complete
        sweep first, exactly as legacy did, then annotates each row with
        `show_actions` (whether the start/pause/complete controls should be
        live right now)."""
        profile = _profile(request.user)
        if profile is None:
            return Response([])

        now = timezone.localtime(timezone.now())
        _bulk_auto_complete_expired_hotworks(now)

        current_time = now.time()
        cutoff_date_day = (
            now.date()
            if current_time >= time(17, 0)
            else now.date() - timedelta(days=1)
        )
        cutoff_date_night = (
            now.date() - timedelta(days=1)
            if current_time >= time(4, 0)
            else now.date() - timedelta(days=2)
        )

        hotworks = self.get_queryset().filter(
            approval_status="approved", is_completed=False
        )
        if not rbac.can_see_all_departments(request.user):
            involvement = (
                Q(created_by=profile)
                | Q(hotwork_incharge=profile)
                | Q(officer_of_the_day=profile)
                | Q(hod_approvals__approved_by=profile)
            )
            if profile.department_id:
                involvement |= Q(created_by__department_id=profile.department_id)
            hotworks = hotworks.filter(involvement)
        hotworks = (
            hotworks.exclude(
                Q(night_work=False, date_of_hotwork__lte=cutoff_date_day)
                | Q(night_work=True, date_of_hotwork__lte=cutoff_date_night)
            )
            .order_by("-created_at")
            .distinct()
        )

        rows = []
        for hotwork in hotworks:
            hotwork.show_actions = _compute_show_actions(hotwork, now)
            rows.append(hotwork)

        return Response(self.get_serializer(rows, many=True).data)

    @action(detail=True, methods=["get"], url_path="approval_detail")
    def approval_detail(self, request, pk=None):
        """The single-requisition approval view (legacy hotwork_inbox_detail):
        the serialized hotwork plus the small set of display flags the legacy
        template computed -- whether the caller may resubmit it, and whether
        the DYHOD / HOD sections apply given who initiated it."""
        hotwork = self.get_object()
        profile = _profile(request.user)

        creator = hotwork.created_by
        creator_role_name = ""
        if creator and creator.role_master:
            creator_role_name = creator.role_master.role_name or ""

        is_night_or_holiday = bool(
            hotwork.night_work or hotwork.holiday_or_working_day == "holiday"
        )
        is_hod_initiated = creator_role_name == HOD
        is_dyhod_initiated = creator_role_name == "DY HOD"

        can_resubmit = (
            profile is not None
            and creator == profile
            and hotwork.approval_status == "rejected"
        )

        data = self.get_serializer(hotwork).data
        data.update(
            {
                "can_resubmit": can_resubmit,
                "show_dyhod_section": not (is_hod_initiated or is_dyhod_initiated),
                "show_hod_sections": not (is_night_or_holiday or is_hod_initiated),
            }
        )
        return Response(data)

    @action(detail=False, methods=["post"], url_path="generate_esign_qr")
    def generate_esign_qr(self, request):
        """Build the e-sign approval QR the approve forms embed. Legacy was a
        CSRF-exempt function endpoint; here it is an authenticated ViewSet
        action, so the signer identity is taken from request.user rather than
        trusted from the body."""
        serializer = HotworkEsignQrSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment_text = serializer.validated_data["comment"]
        role = serializer.validated_data["role"]
        hotwork_id = serializer.validated_data["hotwork_id"]

        profile = _profile(request.user)
        signed_by = request.user.get_username()
        personal_number = ""
        if profile is not None:
            personal_number = getattr(profile, "personal_number", "") or ""
            signed_by = personal_number or _format_user_with_rank(profile)

        qr_code_base64 = _generate_hotwork_esign_qr(
            request.user.get_username(), comment_text, hotwork_id, role
        )
        local_time = timezone.localtime(timezone.now())

        return Response(
            {
                "qr": f"data:image/png;base64,{qr_code_base64}",
                "comment": comment_text,
                "role": role,
                "username": request.user.get_username(),
                "signed_by": signed_by,
                "personal_number": personal_number,
                "ts": local_time.strftime("%Y-%m-%d %H:%M:%S"),
            }
        )

    @action(detail=True, methods=["post"], url_path="resubmit")
    def resubmit(self, request, pk=None):
        """Re-open a rejected requisition for another approval round. Creator
        only; clears every approval/completion field, recomputes the entry
        status the same way a new requisition's is computed, and rebuilds the
        HOD lane rows when it re-enters the HOD stage."""
        hotwork = self.get_object()
        profile = _profile(request.user)

        if profile is None or hotwork.created_by_id != profile.id:
            raise PermissionDenied("Only the creator can resubmit this hotwork.")

        if hotwork.approval_status != "rejected":
            raise ValidationError("Only rejected hotwork can be resubmitted.")

        serializer = HotworkResubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        resubmit_remarks = serializer.validated_data["resubmit_remarks"]

        new_status = _get_initial_status_for_existing_hotwork(hotwork)

        with transaction.atomic():
            hotwork.approval_status = new_status
            hotwork.dyhod_approved = False
            hotwork.dyhod_approved_by = None
            hotwork.dyhod_approved_at = None
            hotwork.dyhod_e_sign_key = None
            hotwork.dyhod_esign_comment = None
            hotwork.dyhod_e_sign_username = None
            hotwork.dyhod_e_sign_date = None
            hotwork.all_hods_approved = False
            hotwork.ood_approved = False
            hotwork.ood_approved_by = None
            hotwork.ood_approved_at = None
            hotwork.ood_e_sign_key = None
            hotwork.ood_esign_comment = None
            hotwork.ood_e_sign_username = None
            hotwork.ood_e_sign_date = None
            hotwork.rejected_at = None
            hotwork.rejected_by = None
            hotwork.is_completed = False
            hotwork.completed_by = None
            hotwork.completed_at = None
            hotwork.completion_remarks = (
                f"Resubmitted by {_format_user_with_rank(profile)}. "
                f"Remarks: {resubmit_remarks}"
            )
            hotwork.save()

            if new_status == "pending_hods":
                _reset_hod_lane_rows(
                    hotwork, HotworkWorkflowConfig.day_officer_lane_department_ids()
                )
            else:
                HotworkHODApproval.objects.filter(hotwork=hotwork).delete()

        return Response(
            HotworkSerializer(hotwork, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=["post"], url_path="dyhod_approve")
    def dyhod_approve(self, request, pk=None):
        """Departmental-officer decision on a pending_dyhod requisition. On approve,
        records the DYHOD e-sign and routes to pending_ood (night/holiday) or seeds
        the HOD lanes and moves to pending_hods (day); on reject, records the
        rejection trace.
        """
        hotwork = self.get_object()
        profile = _profile(request.user)

        if not rbac.can_see_all_departments(request.user) and (
            profile is None
            or profile.department_id is None
            or hotwork.created_by_id is None
            or profile.department_id != hotwork.created_by.department_id
        ):
            raise PermissionDenied(
                "Only a member of the raising department may give "
                "Department Officer approval."
            )

        if hotwork.approval_status != "pending_dyhod":
            raise ValidationError(
                "This hotwork is not pending Department Officer approval."
            )

        serializer = HotworkDyhodApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        action_value = data["action"]

        if action_value == "approve":
            now = timezone.now()
            hotwork.dyhod_approved = True
            hotwork.dyhod_approved_by = profile
            hotwork.dyhod_approved_at = now
            hotwork.dyhod_e_sign_key = data["e_sign_key"]
            hotwork.dyhod_esign_comment = data["esign_comment"]
            hotwork.dyhod_e_sign_username = (
                data["e_sign_username"].strip() or request.user.get_username()
            )
            hotwork.dyhod_e_sign_date = now

            if hotwork.night_work or hotwork.holiday_or_working_day == "holiday":
                hotwork.approval_status = "pending_ood"
                hotwork.save()
            else:
                hotwork.approval_status = "pending_hods"
                hotwork.save()

                _seed_day_hod_lane_rows(hotwork)
                hotwork.check_all_hods_approved()
        else:
            hotwork.approval_status = "rejected"
            hotwork.rejected_at = timezone.now()
            hotwork.rejected_by = profile
            hotwork.completion_remarks = (
                f"Rejected by Department Officer ({_format_user_with_rank(profile)})."
            )
            hotwork.save()

        return Response(
            HotworkSerializer(hotwork, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=["post"], url_path="hod_approve")
    def hod_approve(self, request, pk=None):
        """One department's HOD decision while the requisition is in the HOD stage. On
        approve, records the lane e-sign and checklist then re-runs
        check_all_hods_approved; on reject, records the rejection trace on the row
        and the requisition.
        """
        hotwork = self.get_object()
        profile = _profile(request.user)

        if not rbac.can_see_all_departments(request.user):
            role_name = getattr(
                getattr(profile, "role_master", None), "role_name", None
            )
            has_pending_row_for_own_department = (
                profile is not None
                and profile.department_id is not None
                and hotwork.hod_approvals.filter(
                    department_id=profile.department_id, approved=False
                ).exists()
            )
            if role_name != HOD or not has_pending_row_for_own_department:
                raise PermissionDenied(
                    "Only that department's Head of Department may approve "
                    "this hotwork."
                )

        if hotwork.approval_status not in ("pending_first_hod", "pending_hods"):
            raise ValidationError("This hotwork is not pending HOD approval.")

        hod_approval, _created = HotworkHODApproval.objects.get_or_create(
            hotwork=hotwork, department=profile.department
        )
        if hod_approval.approved:
            raise ValidationError("You have already approved this hotwork.")

        serializer = HotworkHodApproveSerializer(
            data=request.data, context={"dept_id": profile.department_id}
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        action_value = data["action"]

        if action_value == "approve":
            now = timezone.now()
            hod_approval.approved = True
            hod_approval.approved_by = profile
            hod_approval.approved_at = now
            hod_approval.e_sign_key = data["e_sign_key"]
            hod_approval.esign_comment = data["esign_comment"]
            hod_approval.e_sign_username = (
                data["e_sign_username"].strip() or request.user.get_username()
            )
            hod_approval.e_sign_date = now
            serializer.apply_to_approval(hod_approval, profile.department_id)
            hod_approval.save()
            hotwork.check_all_hods_approved()
        else:
            hotwork.approval_status = "rejected"
            hotwork.rejected_at = timezone.now()
            hotwork.rejected_by = profile
            hotwork.completion_remarks = (
                f"Rejected by Officer ({_format_user_with_rank(profile)})."
            )
            hod_approval.approved_by = profile
            hod_approval.approved_at = timezone.now()
            hod_approval.save()
            hotwork.save()

        return Response(
            HotworkSerializer(hotwork, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=["post"], url_path="ood_approve")
    def ood_approve(self, request, pk=None):
        """Officer-of-the-Day decision on a pending_ood requisition. On approve, for
        night/holiday work backfills every eligible officer lane from the shared
        checklist, then records the OOD e-sign, marks the requisition approved and
        caches its certificate PDF; on reject, records the rejection trace.
        """
        hotwork = self.get_object()
        profile = _profile(request.user)

        if not rbac.can_see_all_departments(request.user) and (
            profile is None or hotwork.officer_of_the_day_id != profile.id
        ):
            raise PermissionDenied(
                "Only the assigned Officer of the Day may give this approval."
            )

        if hotwork.approval_status != "pending_ood":
            raise ValidationError(
                "This hotwork is not pending Officer of the Day approval."
            )

        is_night_or_holiday = (
            hotwork.night_work or hotwork.holiday_or_working_day == "holiday"
        )
        serializer = HotworkOodApproveSerializer(
            data=request.data, context={"apply_checklist": is_night_or_holiday}
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        action_value = data["action"]

        if action_value == "approve":
            if is_night_or_holiday:
                for dept_id in HotworkWorkflowConfig.day_officer_lane_department_ids():
                    department = Department.objects.filter(id=dept_id).first()
                    if department is None or not _lane_has_eligible_approver(dept_id):
                        continue
                    hod_approval, _created = HotworkHODApproval.objects.get_or_create(
                        hotwork=hotwork, department=department
                    )
                    if hod_approval.approved:
                        continue
                    hod_approval.approved = True
                    hod_approval.approved_by = profile
                    hod_approval.approved_at = timezone.now()
                    serializer.apply_to_approval(hod_approval, dept_id)
                    hod_approval.save()

            now = timezone.now()
            hotwork.ood_approved = True
            hotwork.ood_approved_by = profile
            hotwork.ood_approved_at = now
            hotwork.ood_e_sign_key = data["e_sign_key"]
            hotwork.ood_esign_comment = data["esign_comment"]
            hotwork.ood_e_sign_username = (
                data["e_sign_username"].strip() or request.user.get_username()
            )
            hotwork.ood_e_sign_date = now
            hotwork.approval_status = "approved"
            hotwork.save()
            self._save_certificate_pdf(hotwork, request)
        else:
            hotwork.approval_status = "rejected"
            hotwork.rejected_at = timezone.now()
            hotwork.rejected_by = profile
            hotwork.completion_remarks = (
                f"Rejected by OOD ({_format_user_with_rank(profile)})."
            )
            hotwork.save()

        return Response(
            HotworkSerializer(hotwork, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """Start or resume an approved requisition whose time window is still open,
        requiring start_remarks and writing a HotworkProgressActivity row.
        """
        hotwork = self.get_object()
        profile = _profile(request.user)

        _auto_complete_paused_hotwork_if_expired(hotwork)

        if not hotwork.ood_approved:
            raise ValidationError(
                "Hotwork cannot be started until OOD approval is completed."
            )
        if hotwork.is_completed:
            raise ValidationError(HotworkDone)
        if not hotwork.is_started and _is_hotwork_window_expired(hotwork):
            raise ValidationError(
                "Hotwork time window has expired. It cannot be started now."
            )

        serializer = HotworkStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        start_remarks = serializer.validated_data["start_remarks"]

        action_label = "resumed" if hotwork.is_started else "started"
        hotwork.is_started = True
        hotwork.is_paused = False
        if not hotwork.started_by:
            hotwork.started_by = profile
            hotwork.started_at = timezone.now()
        hotwork.save()

        HotworkProgressActivity.objects.create(
            hotwork=hotwork,
            action=action_label,
            performed_by=profile,
            remarks=start_remarks,
        )

        return Response(
            {
                "success": True,
                "message": f"Hotwork {hotwork.hotwork_code} has been {action_label}.",
                "state": "pause",
            }
        )

    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        """Pause a started, not-yet-completed requisition with a required reason, writing a HotworkProgressActivity row."""
        hotwork = self.get_object()
        profile = _profile(request.user)

        if not hotwork.is_started:
            raise ValidationError("Hotwork must be started before it can be paused.")
        if hotwork.is_completed:
            raise ValidationError(HotworkDone)

        serializer = HotworkPauseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        pause_reason = serializer.validated_data["pause_reason"]

        hotwork.is_paused = True
        hotwork.paused_by = profile
        hotwork.paused_at = timezone.now()
        hotwork.pause_reason = pause_reason
        hotwork.save()

        HotworkProgressActivity.objects.create(
            hotwork=hotwork, action="paused", performed_by=profile, remarks=pause_reason
        )

        return Response(
            {
                "success": True,
                "message": f"Hotwork {hotwork.hotwork_code} has been paused.",
            }
        )

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Mark a started requisition complete (optionally with remarks), writing a HotworkProgressActivity row."""
        hotwork = self.get_object()
        profile = _profile(request.user)

        if not hotwork.is_started:
            raise ValidationError("Hotwork must be started before it can be completed.")
        if hotwork.is_completed:
            raise ValidationError(HotworkDone)

        serializer = HotworkCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        completion_remarks = serializer.validated_data.get("completion_remarks", "")

        hotwork.is_completed = True
        hotwork.completed_by = profile
        hotwork.completed_at = timezone.now()
        hotwork.completion_remarks = completion_remarks
        hotwork.save()

        HotworkProgressActivity.objects.create(
            hotwork=hotwork,
            action="completed",
            performed_by=profile,
            remarks=completion_remarks
            or f"Hotwork completed by {profile.rank.name if profile.rank else ''} {profile.firstname} {profile.lastname}",
        )
        return Response(
            {
                "success": True,
                "message": f"Hotwork {hotwork.hotwork_code} has been marked as complete.",
            }
        )

    def _get_hotwork_ship(self, hotwork):
        """The creator's ship, falling back to ship id 1."""
        default_ship = Ship.objects.filter(id=1).first()

        if hotwork.created_by and hotwork.created_by.ship:
            return hotwork.created_by.ship

        return default_ship

    def _get_hod_approvals(self, hotwork):
        """Dict engineering/electrical/nbcd mapping to the requisition's HotworkHODApproval row for departments 2 / 3 / 5, or None."""
        return {
            "engineering": hotwork.hod_approvals.filter(department_id=2).first(),
            "electrical": hotwork.hod_approvals.filter(department_id=3).first(),
            "nbcd": hotwork.hod_approvals.filter(department_id=5).first(),
        }

    def _build_approval_detail(self, role, approved, approved_by, approved_at):
        """One role/status/approved_by/approved_at entry for the certificate's approval table."""
        return {
            "role": role,
            "status": "Approved" if approved else "Pending",
            "approved_by": _format_user_with_rank(approved_by),
            "approved_at": _format_datetime_local(approved_at),
        }

    def _get_approval_details(
        self,
        hotwork,
        hod_engineering,
        hod_electrical,
        hod_nbcd,
    ):
        """The ordered list of approval-table entries (DYHOD, the three HOD lanes, OOD) for the certificate."""
        return [
            self._build_approval_detail(
                "Department Officer (DY HOD)",
                hotwork.dyhod_approved,
                hotwork.dyhod_approved_by,
                hotwork.dyhod_approved_at,
            ),
            self._build_approval_detail(
                "Engineering HOD",
                hod_engineering.approved if hod_engineering else False,
                hod_engineering.approved_by if hod_engineering else None,
                hod_engineering.approved_at if hod_engineering else None,
            ),
            self._build_approval_detail(
                "Electrical HOD",
                hod_electrical.approved if hod_electrical else False,
                hod_electrical.approved_by if hod_electrical else None,
                hod_electrical.approved_at if hod_electrical else None,
            ),
            self._build_approval_detail(
                "NBCD HOD",
                hod_nbcd.approved if hod_nbcd else False,
                hod_nbcd.approved_by if hod_nbcd else None,
                hod_nbcd.approved_at if hod_nbcd else None,
            ),
            self._build_approval_detail(
                "Officer of the Day",
                hotwork.ood_approved,
                hotwork.ood_approved_by,
                hotwork.ood_approved_at,
            ),
        ]

    def _build_hotwork_certificate_context(
        self,
        hotwork,
        ship,
        approvals,
        request,
    ):
        """Template context for hotwork_certificate_pdf.html: the requisition, its
        ship, the three HOD rows, the approval table, the QR code, and static-path
        / next-day helpers.
        """
        next_day = (
            hotwork.date_of_hotwork + timedelta(days=1)
            if hotwork.date_of_hotwork
            else None
        )

        static_root = getattr(settings, "STATIC_ROOT", None) or os.path.join(
            settings.BASE_DIR, "static"
        )

        hotwork_qr_code_base64 = generate_hotwork_qr_code(
            hotwork,
            approvals["engineering"],
            approvals["electrical"],
            approvals["nbcd"],
        )

        return {
            "hotwork": hotwork,
            "ship": ship,
            "hod_engineering": approvals["engineering"],
            "hod_electrical": approvals["electrical"],
            "hod_nbcd": approvals["nbcd"],
            "approval_details": self._get_approval_details(
                hotwork,
                approvals["engineering"],
                approvals["electrical"],
                approvals["nbcd"],
            ),
            "hotwork_qr_code_base64": hotwork_qr_code_base64,
            "night_work": hotwork.night_work,
            "STATIC_ROOT": static_root,
            "next_day": next_day,
        }

    @staticmethod
    def _certificate_pdf_path(hotwork):
        """Absolute path of the cached certificate PDF under MEDIA_ROOT/hotwork/<code>.pdf."""
        return os.path.join(
            settings.MEDIA_ROOT, "hotwork", f"{hotwork.hotwork_code}.pdf"
        )

    def _render_certificate_pdf(self, hotwork, request):
        """Render the certificate template to PDF bytes."""
        context = self._build_hotwork_certificate_context(
            hotwork,
            self._get_hotwork_ship(hotwork),
            self._get_hod_approvals(hotwork),
            request,
        )
        html_string = render_to_string(
            "hotwork_certificate_pdf.html", context, request=request
        )
        base_url = request.build_absolute_uri("/")[:-1]
        return HTML(string=html_string, base_url=base_url).write_pdf()

    def _save_certificate_pdf(self, hotwork, request):
        """Pre-generate + cache the certificate PDF under
        MEDIA_ROOT/hotwork/<code>.pdf, as legacy _save_hotwork_pdf did on
        final OOD approval. Best-effort: a render failure here must never
        block the approval that triggered it (legacy swallowed it too,
        Hotwork/views.py:3424)."""
        try:
            pdf_bytes = self._render_certificate_pdf(hotwork, request)
            os.makedirs(os.path.join(settings.MEDIA_ROOT, "hotwork"), exist_ok=True)
            with open(self._certificate_pdf_path(hotwork), "wb") as fh:
                fh.write(pdf_bytes)
        except Exception:
            logger.exception(
                "Failed to pre-save hotwork certificate PDF for %s",
                hotwork.hotwork_code,
            )

    @action(detail=True, methods=["get"], url_path="print_certificate")
    def print_certificate(self, request, pk=None):
        """Return the hotwork certificate PDF, serving the cached copy
        written on OOD approval when present and rendering (and caching) on
        demand otherwise -- mirrors print_hotwork_certificate's
        serve-cached-or-generate path (Hotwork/views.py:3469-3490)."""
        hotwork = self.get_object()

        pdf_path = self._certificate_pdf_path(hotwork)
        pdf_bytes = None
        if os.path.exists(pdf_path):
            try:
                with open(pdf_path, "rb") as fh:
                    pdf_bytes = fh.read()
            except OSError:
                logger.exception(
                    "Failed to read cached hotwork PDF for %s", hotwork.hotwork_code
                )

        if pdf_bytes is None:
            pdf_bytes = self._render_certificate_pdf(hotwork, request)
            try:
                os.makedirs(os.path.join(settings.MEDIA_ROOT, "hotwork"), exist_ok=True)
                with open(pdf_path, "wb") as fh:
                    fh.write(pdf_bytes)
            except OSError:
                logger.exception(
                    "Failed to cache hotwork PDF for %s", hotwork.hotwork_code
                )

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'inline; filename="Hotwork_Certificate_{hotwork.hotwork_code}.pdf"'
        )
        return response
