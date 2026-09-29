import logging
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import transaction
from django.db.models import Exists, OuterRef
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.timezone import localtime
from dms.models import Certificate
from drf_spectacular.utils import extend_schema
from ems.models import (
    AddRoutineDetails,
    EquipmentName,
    PlannedRoutineDescription,
    RoutineDescription,
)
from master.models import (
    Department,
    HierarchyForChart,
    MasterCommand,
    Ship,
    SubDepartment,
)
from master.utils import get_this_ship
from obs.models import PostSurvey, Receive, Spares

# Import your existing function
from obs.views import build_histories
from op_maintenance.models import InitiateDart
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import rbac
from .choices import access_level_choices
from .live_permissions import IsLiveAuthzUser

# Update these imports according to your project structure
from .models import (
    CustomUser,
    CustomUserProfile,
    Designation,
    GalleryImage,
    HRCDFMock,
    LoginRegistrationImage,
    MasterKnowYourRegulator,
    MasterRegulatorDivision,
    Rank,
    Role,
)
from .permissions import CanEditConfiguration, IsAdminOrShipAdmin, IsShipAdminRole
from .serializers import (
    AssignSailorsToDivisionSerializer,
    CommandSerializer,
    CustomUserProfileSerializer,
    CustomUserSerializer,
    DatabaseResetRequestSerializer,
    DeactivateUserSerializer,
    DepartmentSerializer,
    DesignationSerializer,
    GalleryImageSerializer,
    HRCDFMockSerializer,
    LoginRegistrationImageSerializer,
    MarriageDetailsSerializer,
    MasterKnowYourRegulatorSerializer,
    MasterRegulatorDivisionSerializer,
    PersonnelEventResponseSerializer,
    PersonnelNumberSerializer,
    RankSerializer,
    RoleSerializer,
)

# Developed with Understanding: imports for the HRCDF roster sync views (CP-C) and for the
# pending-registration exclusion of synced rows (D3, OQ13).
from django.db.models import Q
from django.db.models.functions import Trim
from master.models import ActiveShipConfig, HrcdfCommand, HrcdfUnit, Unit
from rest_framework.exceptions import APIException
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.pagination import PageNumberPagination

from . import hrcdf_sync
from .hrcdf_client import HrcdfClient, HrcdfSyncError
from .models import AUTH_SOURCE_HRCDF, HrcdfSyncJob, OtherCustomUserProfile
from .serializers import (
    HrcdfCommandOptionSerializer,
    HrcdfHomeUnitRequestSerializer,
    HrcdfHomeUnitSerializer,
    HrcdfOtherPersonnelRowSerializer,
    HrcdfOwnPersonnelRowSerializer,
    HrcdfProgressSerializer,
    HrcdfRunRequestSerializer,
    HrcdfSyncJobSummarySerializer,
    HrcdfUnitSerializer,
)

# Developed with Understanding: imports for the unit-status view (CP-L, D29). The this-ship
# row and the "INS " display rule are the ones CP-I and CP-K already use.
from master.views import ins_display_name

from . import login_routing
from .serializers import UnitStatusSerializer

# Import your existing form if you want to preserve its validation exactly.
# from users.forms import UserProfileEditForm


User = get_user_model()

logger = logging.getLogger(__name__)
RegularManage = "regulator.manage"


# --------------------------------------------------------------------------
# Auth
#
# SWMM no longer authenticates anyone. Login / refresh / logout / register /
# me / change-password now live in authz_service (userauth/); the SPA talks to
# it directly. Every SWMM request is a verified RS256 bearer -- see
# users/authentication.py + users/authz_sync.py.
# --------------------------------------------------------------------------


# --------------------------------------------------------------------------
# Read-only master data
# --------------------------------------------------------------------------


@extend_schema(tags=["Users"])
class RankViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RankSerializer
    queryset = Rank.objects.order_by("name")


@extend_schema(tags=["Users"])
class DesignationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = DesignationSerializer
    queryset = Designation.objects.all()


@extend_schema(tags=["Users"])
class RoleViewSet(viewsets.ModelViewSet):
    serializer_class = RoleSerializer
    queryset = Role.objects.all()

    def get_permissions(self):
        if self.action in [
            "create",
            "update",
            "partial_update",
            "destroy",
        ] and self.request.method in ["POST", "PUT", "PATCH", "DELETE"]:
            from .permissions import IsAdminOrShipAdmin

            return [IsAdminOrShipAdmin()]
        return super().get_permissions()


@extend_schema(tags=["Users"])
class DepartmentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = DepartmentSerializer
    queryset = rbac.selectable_departments()


@extend_schema(tags=["Users"])
class CommandViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CommandSerializer
    queryset = MasterCommand.objects.all()


# --------------------------------------------------------------------------
# User management
# --------------------------------------------------------------------------


@extend_schema(tags=["Users"])
class UserViewSet(viewsets.ModelViewSet):
    """list is department-scoped unless the caller is privileged
    (admin/superuser access_level). Every mutating action additionally
    requires the caller to be privileged or share the target's department
    - see _authorize_manage - mirroring the legacy UserListView /
    EditUserProfileView department scoping (role_assign_required there)."""

    serializer_class = CustomUserSerializer
    http_method_names = ("get", "patch", "post", "head", "options")

    def get_permissions(self):
        from .permissions import IsAdminOrShipAdmin

        if self.action in ["approve", "disapprove", "deactivate"]:
            # Privilege-changing: also require a live authz_service check so a
            # revoked admin cannot act within the local-token staleness window.
            return [IsAdminOrShipAdmin(), IsLiveAuthzUser()]
        if self.action in ["partial_update", "create"]:
            return [IsAdminOrShipAdmin()]
        return super().get_permissions()

    def get_queryset(self):
        qs = CustomUser.objects.select_related(
            "user_profile__department",
            "user_profile__role_master",
            "user_profile__designation_master",
        ).filter(user_profile__isnull=False)
        if self.action == "list":
            qs = self.scope_queryset_to_department(qs, self.request)
        return qs

    def scope_queryset_to_department(self, qs, request):
        """Restricts the list to the caller's own department unless they're
        privileged (admin/administrator/superuser access_level) - mirrors
        the legacy UserListView department scoping, extended to cover
        SUPERUSER-level profiles the same as is_admin accounts."""
        user = request.user
        if rbac.can_see_all_departments(user) or user.department is None:
            return qs
        return qs.filter(user_profile__department_id=user.department_id)

    def _authorize_manage(self, request, profile):
        """Gate for every action that mutates another account: the caller
        must be privileged, or the target must be in the caller's own
        department. Without this, any authenticated user could
        approve/disapprove/deactivate/edit any other account."""
        if not rbac.is_in_scope_department(request.user, profile):
            raise PermissionDenied("You may not manage users outside your department.")

    def partial_update(self, request, *args, **kwargs):
        """Updates both CustomUser fields (username/is_active) and the nested
        profile in one call, mirroring EditUserProfileView."""
        user = self.get_object()
        profile = user.user_profile
        self._authorize_manage(request, profile)

        # Code note: activating/deactivating an account is gated by
        # rbac.can_set_account_status (the two admin roles only, never on
        # their own row) -- not merely by _authorize_manage's department
        # scope, which would otherwise let any in-scope HOD flip is_active /
        # user_active on a whim. Both the CustomUser flag (is_active, which
        # ModelBackend actually enforces) and the profile's mirror
        # (user_active) are covered by the same guard.
        can_set_status = rbac.can_set_account_status(request.user, user)

        profile_data = {
            k: v for k, v in request.data.items() if k not in ("username", "is_active")
        }
        if not can_set_status:
            profile_data.pop("user_active", None)
        if profile_data:
            original_role_id = profile.role_master_id
            profile_serializer = CustomUserProfileSerializer(
                profile, data=profile_data, partial=True
            )
            profile_serializer.is_valid(raise_exception=True)
            saved_profile = profile_serializer.save()
            if (
                "role_master" in profile_data
                and saved_profile.role_master_id != original_role_id
            ):
                rbac.stamp_role_assignment(
                    saved_profile, getattr(request.user, "user_profile", None)
                )
                saved_profile.save(
                    update_fields=["role_assigned_by", "role_assigned_on"]
                )

        if "username" in request.data:
            user.username = str(request.data["username"]).upper()
        if "is_active" in request.data:
            if not can_set_status:
                raise PermissionDenied(
                    "You may not change this account's active status."
                )
            user.is_active = request.data["is_active"]
        user.save()

        return Response(CustomUserSerializer(user).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        user = self.get_object()
        self._authorize_manage(request, user.user_profile)
        user.is_active = True
        user.save()
        if user.user_profile is not None:
            user.user_profile.user_active = True
            user.user_profile.is_role = True
            user.user_profile.save()
        return Response(CustomUserSerializer(user).data)

    @action(detail=True, methods=["post"])
    def disapprove(self, request, pk=None):
        user = self.get_object()
        self._authorize_manage(request, user.user_profile)
        user.is_active = False
        user.save()
        if user.user_profile is not None:
            user.user_profile.user_active = False
            user.user_profile.save()
        return Response(CustomUserSerializer(user).data)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        user = self.get_object()
        self._authorize_manage(request, user.user_profile)
        serializer = DeactivateUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user.user_profile)
        return Response(CustomUserSerializer(user).data)

    @action(
        detail=False,
        methods=["get"],
        url_path="pending-count",
    )
    def pending_count(self, request):
        # Developed with Understanding: an HRCDF-synced row with no credentials is crew,
        # not a pending registration, so it is left out of the count (D3, OQ13).
        return Response(
            {
                "count": CustomUserProfile.objects.filter(is_role=False)
                .exclude(auth_source=AUTH_SOURCE_HRCDF, has_credentials=False)
                .count()
            }
        )


@extend_schema(tags=["Users"])
class MarriageDetailsView(APIView):
    def get(self, request, pk):
        profile = get_object_or_404(
            CustomUserProfile.objects.select_related("rank"), pk=pk
        )
        return Response(MarriageDetailsSerializer(profile).data)

    def patch(self, request, pk):
        profile = get_object_or_404(CustomUserProfile, pk=pk)
        profile.marriage_date = request.data.get("marriage_date")
        profile.is_married = True
        profile.save()
        return Response(MarriageDetailsSerializer(profile).data)


# --------------------------------------------------------------------------
# Regulator hierarchy ("Know Your Regulator")
# --------------------------------------------------------------------------


@extend_schema(tags=["Users"])
class MasterRegulatorDivisionViewSet(viewsets.ModelViewSet):
    serializer_class = MasterRegulatorDivisionSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), CanEditConfiguration()]
        return super().get_permissions()

    def get_queryset(self):
        qs = MasterRegulatorDivision.objects.select_related("department", "regulator")
        department_id = self.request.query_params.get("department")
        regulator_id = self.request.query_params.get("regulator")
        if department_id:
            qs = qs.filter(department_id=department_id)
        if regulator_id:
            qs = qs.filter(regulator_id=regulator_id)
        return qs


@extend_schema(tags=["Users"])
class MasterKnowYourRegulatorViewSet(viewsets.ModelViewSet):
    serializer_class = MasterKnowYourRegulatorSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), CanEditConfiguration()]
        return super().get_permissions()

    def get_queryset(self):
        qs = MasterKnowYourRegulator.objects.select_related(
            "department", "regulator", "division", "sailor"
        )
        department_id = self.request.query_params.get("department")
        if department_id:
            qs = qs.filter(department_id=department_id)
        return qs

    def perform_destroy(self, instance):
        if instance.sailor is not None:
            instance.sailor.division = None
            instance.sailor.save()
        instance.delete()


@extend_schema(tags=["Users"])
class RegulatorLookupView(APIView):
    """GET ?department=<id> -> CustomUserProfile rows with role 'Regulator'
    in that department (replaces get_regulators_by_department)."""

    def get(self, request):
        department_id = request.query_params.get("department")
        qs = CustomUserProfile.objects.filter(role_master__role_name="Regulator")
        if department_id:
            qs = qs.filter(department_id=department_id)
        return Response([{"id": r.id, "name": r.firstname} for r in qs])


@extend_schema(tags=["Users"])
class SailorLookupView(APIView):
    """GET ?department=<id> -> unassigned CustomUserProfile rows with role
    'Sailor' in that department (replaces get_sailors_by_department)."""

    def get(self, request):
        department_id = request.query_params.get("department")
        qs = CustomUserProfile.objects.filter(
            role_master__role_name="Sailor", division__isnull=True
        )
        if department_id:
            qs = qs.filter(department_id=department_id)
        return Response([{"id": s.id, "name": s.firstname} for s in qs])


@extend_schema(tags=["Users"])
class AssignSailorsToDivisionView(APIView):
    required_capability = RegularManage

    def post(self, request):
        serializer = AssignSailorsToDivisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        division = serializer.save()
        return Response(MasterRegulatorDivisionSerializer(division).data)


@extend_schema(tags=["Users"])
class ShipHierarchyView(APIView):
    """Reproduces get_ship_hierarchy: builds the ship -> department ->
    regulator -> division -> sailor tree for the caller's own department."""

    def get(self, request, ship_id):
        ship_obj = self._get_ship(ship_id)

        if not ship_obj:
            return Response(
                {"error": "Ship not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        nodes = [self._build_ship_node(ship_obj)]

        profile = request.user.CustomUser_profile
        departments = self._get_departments(profile)

        for department in departments:
            dept_node = self._build_department_node(department, nodes)
            self._add_department_nodes(department, dept_node, nodes)

        return Response(nodes)

    def _get_ship(self, ship_id):
        return Ship.objects.filter(id=ship_id).first()

    def _get_departments(self, profile):
        if not profile:
            return Department.objects.none()

        return Department.objects.filter(id=profile.department_id)

    def _build_ship_node(self, ship):
        return {
            "id": f"ship_{ship.id}",
            "name": ship.name,
            "designation": "SHIP",
            "rank": "SHIP",
            "personal_number": "",
            "photo_url": getattr(
                ship,
                "photo_url",
                "/static/users/img/ship.png",
            ),
            "parent_id": None,
            "collapsed": True,
            "hasChildren": True,
        }

    def _build_department_node(self, department, nodes):
        node = {
            "id": f"dept_{department.id}",
            "name": department.name,
            "designation": "Department",
            "rank": "DEPT",
            "personal_number": "",
            "photo_url": "/static/users/img/department1.png",
            "parent_id": nodes[0]["id"],
            "collapsed": True,
            "hasChildren": True,
        }

        nodes.append(node)
        return node

    def _add_department_nodes(self, department, dept_node, nodes):
        regulators = MasterRegulatorDivision.objects.filter(
            department=department
        ).select_related(
            "regulator",
            "regulator__designation_master",
            "regulator__rank",
        )

        for reg_div in regulators:
            regulator = reg_div.regulator

            reg_node = self._build_regulator_node(
                regulator,
                dept_node,
                nodes,
            )

            self._add_regulator_divisions(
                regulator,
                department,
                reg_node,
                nodes,
            )

    def _build_regulator_node(self, regulator, dept_node, nodes):
        designation = regulator.designation or (
            regulator.designation_master.designation_name
            if regulator.designation_master
            else ""
        )

        node = {
            "id": f"reg_{regulator.id}",
            "name": f"{regulator.firstname} {regulator.lastname}",
            "designation": designation,
            "rank": regulator.rank.name if regulator.rank_id else "",
            "personal_number": regulator.personal_number or "",
            "photo_url": getattr(
                regulator,
                "photo_url",
                "/static/users/img/Regulator1.png",
            ),
            "parent_id": dept_node["id"],
            "collapsed": True,
            "hasChildren": True,
        }

        nodes.append(node)
        return node

    def _add_regulator_divisions(
        self,
        regulator,
        department,
        reg_node,
        nodes,
    ):
        divisions = MasterRegulatorDivision.objects.filter(
            regulator=regulator,
            department=department,
        )

        for division in divisions:
            div_node = self._build_division_node(
                division,
                reg_node,
                nodes,
            )

            self._add_division_sailors(
                division,
                regulator,
                department,
                div_node,
                nodes,
            )

    def _build_division_node(self, division, reg_node, nodes):
        node = {
            "id": f"div_{division.id}",
            "name": division.division,
            "designation": "Division",
            "rank": "DIV",
            "personal_number": "",
            "photo_url": "/static/users/img/division1.png",
            "parent_id": reg_node["id"],
            "collapsed": True,
            "hasChildren": True,
        }

        nodes.append(node)
        return node

    def _add_division_sailors(
        self,
        division,
        regulator,
        department,
        div_node,
        nodes,
    ):
        sailors = MasterKnowYourRegulator.objects.filter(
            division=division,
            regulator=regulator,
            department=department,
        ).select_related(
            "sailor",
            "sailor__designation_master",
            "sailor__rank",
        )

        for relation in sailors:
            sailor = relation.sailor

            if not sailor:
                continue

            nodes.append(
                self._build_sailor_node(
                    sailor,
                    div_node,
                )
            )

    def _build_sailor_node(self, sailor, div_node):
        designation = sailor.designation or (
            sailor.designation_master.designation_name
            if sailor.designation_master
            else ""
        )

        return {
            "id": f"sailor_{sailor.id}",
            "name": f"{sailor.firstname} {sailor.lastname}",
            "designation": designation,
            "rank": sailor.rank.name if sailor.rank_id else "",
            "personal_number": sailor.personal_number or "",
            "photo_url": getattr(
                sailor,
                "photo_url",
                "/static/images/user.png",
            ),
            "parent_id": div_node["id"],
            "collapsed": False,
            "hasChildren": False,
        }


# --------------------------------------------------------------------------
# Login / registration page images
# --------------------------------------------------------------------------


@extend_schema(tags=["Users"])
class LoginRegistrationImageViewSet(viewsets.ModelViewSet):
    """list is public (shown on the pre-auth login page); writes require
    'login_image.manage'."""

    serializer_class = LoginRegistrationImageSerializer
    # queryset = LoginRegistrationImage.objects.filter(is_active=True).order_by(
    queryset = LoginRegistrationImage.objects.filter(active=True).order_by(
        "-uploaded_at"
    )

    def get_permissions(self):
        if self.action == "list":
            return [AllowAny()]
        return [IsAdminOrShipAdmin()]


@extend_schema(tags=["Users"])
class GalleryImageViewSet(viewsets.ModelViewSet):
    serializer_class = GalleryImageSerializer
    queryset = GalleryImage.objects.all()

    def get_permissions(self):
        if self.action == "list":
            return [AllowAny()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()

        ship_id = self.request.query_params.get("ship_id")

        if ship_id:
            queryset = queryset.filter(ship_id=ship_id)
        else:
            ship = get_this_ship()
            if not ship:
                return queryset.none()
            queryset = queryset.filter(ship=ship)

        return queryset.order_by("-created_at")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ship = get_this_ship()
        image = serializer.save(ship=ship)

        return Response(
            {
                "status": "success",
                "message": "Image uploaded",
                "data": GalleryImageSerializer(image).data,
            },
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        if instance.image:
            instance.image.delete(save=False)

        instance.delete()

        return Response(
            {
                "status": "success",
                "message": "Image deleted",
            }
        )


def ordinal(number):
    """Return a number with its ordinal suffix."""
    if 10 <= number % 100 <= 20:
        suffix = "th"
    else:
        suffix = {
            1: "st",
            2: "nd",
            3: "rd",
        }.get(number % 10, "th")

    return f"{number}{suffix}"


def get_next_annual_date(event_date, today):
    """
    Get the next occurrence of an annual event.

    February 29 is treated as March 1 in non-leap years.
    """
    month_day = (event_date.month, event_date.day)

    try:
        current_occurrence = date(today.year, *month_day)
    except ValueError:
        current_occurrence = date(today.year, 3, 1)

    if current_occurrence >= today:
        return current_occurrence

    try:
        return date(today.year + 1, *month_day)
    except ValueError:
        return date(today.year + 1, 3, 1)


def get_user_name(user):
    """Return the user's full name."""
    return f"{user.firstname or ''} {user.lastname or ''}".strip()


def get_user_designation(user):
    """Return the user's configured designation."""
    if user.designation:
        return user.designation

    if user.designation_master:
        return user.designation_master.designation_name

    return ""


def build_event_base(user, event_type, event_date):
    """Build fields shared by birthday and anniversary events."""
    return {
        "type": event_type,
        "name": get_user_name(user),
        "personal_number": user.personal_number,
        "designation": get_user_designation(user),
        "event_date": event_date,
        "age": None,
        "years": None,
    }


def build_birthday_event(user, today):
    """Create the upcoming birthday event for a user."""
    dob = user.date_of_birth

    if not dob:
        return None

    event_date = get_next_annual_date(dob, today)

    age = event_date.year - dob.year

    event = build_event_base(
        user=user,
        event_type="birthday",
        event_date=event_date,
    )

    event.update(
        {
            "age": age,
            "event_label": f"{ordinal(age)} Birthday",
        }
    )

    return event


def build_anniversary_event(user, today):
    """Create the upcoming marriage anniversary event for a user."""
    marriage_date = user.marriage_date

    if not marriage_date:
        return None

    event_date = get_next_annual_date(marriage_date, today)

    years = event_date.year - marriage_date.year

    event = build_event_base(
        user=user,
        event_type="anniversary",
        event_date=event_date,
    )

    event.update(
        {
            "years": years,
            "event_label": f"{ordinal(years)} Anniversary",
        }
    )

    return event


def is_within_range(event_date, start_date, end_date):
    """Check whether an event falls inside the requested date range."""
    return start_date <= event_date <= end_date


def get_user_events(user, today, end_date):
    """Return all qualifying events for a user."""
    events = []

    birthday = build_birthday_event(user, today)

    if birthday and is_within_range(
        birthday["event_date"],
        today,
        end_date,
    ):
        events.append(birthday)

    anniversary = build_anniversary_event(user, today)

    if anniversary and is_within_range(
        anniversary["event_date"],
        today,
        end_date,
    ):
        events.append(anniversary)

    return events


def group_events_by_date(events, today):
    """Group events into today, tomorrow and upcoming."""
    tomorrow = today + timedelta(days=1)

    grouped = {
        "today": [],
        "tomorrow": [],
        "upcoming": [],
    }

    for event in events:
        event_date = event["event_date"]

        if event_date == today:
            grouped["today"].append(event)
        elif event_date == tomorrow:
            grouped["tomorrow"].append(event)
        else:
            grouped["upcoming"].append(event)

    return grouped


def get_upcoming_events():
    """
    Build upcoming birthday and anniversary events.

    Returns events occurring today or during the next 7 days.
    """
    today = timezone.now().date()
    end_date = today + timedelta(days=7)

    users = CustomUserProfile.objects.select_related("rank", "designation_master").all()

    events = []

    for user in users:
        events.extend(
            get_user_events(
                user=user,
                today=today,
                end_date=end_date,
            )
        )

    events.sort(key=lambda event: event["event_date"])

    grouped = group_events_by_date(
        events=events,
        today=today,
    )

    return today, end_date, events, grouped


@extend_schema(tags=["Users"])
class PersonnelEventsAPIView(APIView):
    """
    Return birthdays and marriage anniversaries occurring
    today or within the next 7 days.
    """

    permission_classes = (AllowAny,)

    def get(self, request):
        today, end_date, events, grouped = get_upcoming_events()

        data = {
            "status": "success",
            "count": len(events),
            "from_date": today,
            "to_date": end_date,
            "today": grouped["today"],
            "tomorrow": grouped["tomorrow"],
            "upcoming": grouped["upcoming"],
            "results": events,
        }

        serializer = PersonnelEventResponseSerializer(data)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["Users"])
class TechnicalDashboardAPIView(APIView):
    """
    Technical Dashboard API.

    Returns dashboard cards and the last 12 months
    of DART open/closed statistics.
    """

    def get(self, request):
        user_profile = request.user.user_profile

        department_id = user_profile.department_id
        department = user_profile.department

        # ==========================================================
        # 1. Total Maintops
        # ==========================================================

        routines_qs = (
            AddRoutineDetails.objects.filter(
                equipment_name__section__department_id=department_id
            )
            .exclude(routine_name__name__icontains="refit")
            .exclude(routine_category="ALTERNATE PERIODIC")
        )

        remove_list = PlannedRoutineDescription.objects.values_list(
            "routine_description_id_id",
            flat=True,
        )

        routine_desc_qs = RoutineDescription.objects.filter(
            equipment_name=OuterRef("equipment_name"),
            routine_name=OuterRef("routine_name"),
        ).exclude(id__in=remove_list)

        routines_qs = routines_qs.annotate(
            has_routine_desc=Exists(routine_desc_qs)
        ).filter(has_routine_desc=True)

        total_maintops = routines_qs.count()

        # ==========================================================
        # 2. Total Outstanding DARTs
        # ==========================================================

        total_outstanding_darts = InitiateDart.objects.filter(
            is_closed=False,
            is_ra_initiate=False,
            is_ra_draft=False,
            is_dl_draft=False,
            department_id=department,
        ).count()

        # ==========================================================
        # 3. Total Planned Routines
        # ==========================================================

        planned_routine_desc_ids = (
            PlannedRoutineDescription.objects.filter(is_deleted=False)
            .values_list(
                "routine_description_id__id",
                flat=True,
            )
            .distinct()
        )

        routine_desc_ids = (
            RoutineDescription.objects.filter(id__in=planned_routine_desc_ids)
            .values_list(
                "add_routine_details__id",
                flat=True,
            )
            .distinct()
        )

        if user_profile.access_level == "0":
            # Admin can see all planned routines
            total_planned_routines = AddRoutineDetails.objects.filter(
                id__in=routine_desc_ids
            ).count()
        else:
            # Other users can see only their department's routines
            total_planned_routines = AddRoutineDetails.objects.filter(
                id__in=routine_desc_ids,
                equipment_name__section__department_id=department_id,
            ).count()

        # ==========================================================
        # 4. Due For Receipt
        # ==========================================================

        due_for_receipt = Receive.objects.filter(
            quantity_toreceive__gt=0,
            spare__equipment_class__spare_class__department=department_id,
        ).count()

        # ==========================================================
        # 5. PTS Survey Pending
        # ==========================================================

        pts_survey_pending = PostSurvey.objects.filter(
            survey_number__in=[
                "PTS",
                "OPDEM",
                "ONETIME APPROVAL",
            ],
            spare__equipment_class__spare_class__department=department_id,
            has_pts=True,
        ).count()

        # ==========================================================
        # 6. Total Issued Spares
        # ==========================================================

        spare_ids = Spares.objects.values_list(
            "id",
            flat=True,
        )

        histories = build_histories(spare_ids, request)

        total_issued_spares = len(histories.get("history_issue", []))

        # ==========================================================
        # 7. DART Chart - Last 12 Months
        # ==========================================================

        today = date.today()
        first_day_of_month = today.replace(day=1)

        months = []

        for i in range(12):
            # Approximate month calculation is replaced below
            # with proper month arithmetic.
            month = first_day_of_month

            for _ in range(i):
                month = (month.replace(day=1) - timedelta(days=1)).replace(day=1)

            months.append(month)

        months = sorted(set(months))

        data1chart = []

        for month in months:
            open_count = InitiateDart.objects.filter(
                dart_date__year=month.year,
                dart_date__month=month.month,
                is_closed=False,
                department_id=department_id,
            ).count()

            closed_count = InitiateDart.objects.filter(
                dart_date__year=month.year,
                dart_date__month=month.month,
                is_closed=True,
                department_id=department_id,
            ).count()

            data1chart.append(
                {
                    "month": month.strftime("%b"),
                    "open_dart": open_count,
                    "closed_dart": closed_count,
                }
            )

        # ==========================================================
        # 8. User Count
        # ==========================================================

        # Developed with Understanding: HRCDF-synced rows with no credentials are crew,
        # not pending registrations (D3, OQ13).
        count = (
            CustomUserProfile.objects.filter(is_role=False)
            .exclude(auth_source=AUTH_SOURCE_HRCDF, has_credentials=False)
            .count()
        )

        # ==========================================================
        # 9. Equipment Status (Ops vs Non-Ops per sub-department)
        # ==========================================================
        # Reference parity: reuses the same sub-department Ops/Non-Ops figures
        # dart.views.dart_dashboard already computes (identical filters), so the
        # two screens can never show different numbers for the same sub-department.
        sub_dept_equipment_data = []
        for sub_dept in SubDepartment.objects.filter(department_name=department):
            total_eq = EquipmentName.objects.filter(sub_department=sub_dept).count()
            non_ops_eq = (
                InitiateDart.objects.filter(
                    is_closed=False,
                    equipment_ship__sub_department_f_key=sub_dept,
                    severity_code__severity_name__icontains="Non-Ops",
                )
                .values("equipment_ship")
                .distinct()
                .count()
            )
            ops_eq = total_eq - non_ops_eq
            sub_dept_equipment_data.append(
                {
                    "sub_dept": sub_dept.name,
                    "operational": ops_eq,
                    "non_operational": non_ops_eq,
                    "total": total_eq,
                }
            )

        # ==========================================================
        # 10. Certificate Expiry Alerts (System Alerts panel)
        # ==========================================================
        # Reference parity: KMS certificate register for the logged-in user's
        # department, alerting six months (180 days) before expiry and staying
        # on screen after expiry. expiry_date is a real DateField here (the
        # reference had to string-parse it), so no format parsing is needed.

        certificate_alert_today = date.today()
        certificate_alert_horizon = certificate_alert_today + timedelta(days=180)
        certificate_alerts = []
        for cert in Certificate.objects.filter(
            user_department=str(department_id) if department_id else None
        ):
            if not cert.expiry_date:
                continue
            if cert.expiry_date > certificate_alert_horizon:
                continue
            days_to_expiry = (cert.expiry_date - certificate_alert_today).days
            certificate_alerts.append(
                {
                    "id": cert.id,
                    "name": cert.name or cert.certificate_id or "Certificate",
                    "certificate_type": cert.certificate_type,
                    "expiry_date": cert.expiry_date.isoformat(),
                    "is_expired": cert.expiry_date < certificate_alert_today,
                    "days": days_to_expiry,
                    "days_abs": abs(days_to_expiry),
                }
            )
        # Most overdue first, then nearest expiry - a negative days value is an
        # expired certificate, so a single ascending sort gives both orders at once.
        certificate_alerts.sort(key=lambda a: a["days"])

        # ==========================================================
        # 11. DART Alerts (open DARTs pending more than 30 days)
        # ==========================================================

        dart_alert_today = date.today()
        dart_alerts = []
        open_darts = (
            InitiateDart.objects.filter(
                is_closed=False,
                department_id=department,
            )
            .exclude(dart_date__isnull=True)
            .select_related("equipment_ship", "equipment_ems")
        )

        for dart in open_darts:
            days_open = (dart_alert_today - dart.dart_date).days
            if days_open <= 30:
                continue
            equipment_name = ""
            if dart.equipment_ship and dart.equipment_ship.nomenclature:
                equipment_name = dart.equipment_ship.nomenclature
            elif dart.equipment_ems:
                equipment_name = dart.equipment_ems.name
            dart_alerts.append(
                {
                    "id": dart.id,
                    "dart_number": dart.dart_number or f"D-{dart.id}",
                    "equipment": equipment_name or "Unknown equipment",
                    "days_open": days_open,
                }
            )
        dart_alerts.sort(key=lambda a: -a["days_open"])
        dart_alerts = dart_alerts[:10]

        # ==========================================================
        # 12. Routine Alerts (overdue routines still open)
        # ==========================================================

        routine_alerts = []
        overdue_routines = (
            RoutineDescription.objects.filter(
                equipment_name__section__department_id=department_id,
                is_close=False,
                is_greater_than_3_monthly=True,
                due_date__lt=dart_alert_today,
            )
            .select_related("equipment_name")
            .order_by("due_date")[:10]
        )

        for routine in overdue_routines:
            days_overdue = (dart_alert_today - routine.due_date).days
            routine_alerts.append(
                {
                    "id": routine.id,
                    "dart_number": routine.dart_number or f"R-{routine.id}",
                    "equipment": routine.equipment_name.name
                    if routine.equipment_name
                    else "Unknown equipment",
                    "days_overdue": days_overdue,
                }
            )

        # ==========================================================
        # 13. API Response
        # ==========================================================

        return Response(
            {
                "status": "success",
                "message": "Technical dashboard data fetched successfully.",
                "data": {
                    "cards": {
                        "total_maintops": total_maintops,
                        "total_outstanding_darts": total_outstanding_darts,
                        "total_planned_routines": total_planned_routines,
                        "due_for_receipt": due_for_receipt,
                        "pts_survey_pending": pts_survey_pending,
                        "total_issued_spares": total_issued_spares,
                        "user_count": count,
                    },
                    "dart_chart": data1chart,
                    "sub_dept_equipment_data": sub_dept_equipment_data,
                    "certificate_alerts": certificate_alerts,
                    "dart_alerts": dart_alerts,
                    "routine_alerts": routine_alerts,
                },
            }
        )


## Ship Admin API
@extend_schema(tags=["Ship Admin APIs"])
class AdminDashboardAPIView(APIView):
    """
    GET /api/admin/dashboard/

    Returns users belonging to the logged-in user's department.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        try:
            department = request.user.user_profile.department
            department_name = department.name
        except (
            AttributeError,
            CustomUserProfile.DoesNotExist,
        ):
            return Response(
                {
                    "status": "error",
                    "message": "User profile or department not found.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        users = (
            CustomUser.objects.filter(user_profile__department__name=department_name)
            .select_related(
                "user_profile",
                "user_profile__department",
                "user_profile__rank",
            )
            .order_by("-id")
        )

        data = []

        for user in users:
            profile = getattr(user, "user_profile", None)

            data.append(
                {
                    "id": user.id,
                    "username": user.username,
                    "is_active": user.is_active,
                    "personal_number": (profile.personal_number if profile else None),
                    "name": (
                        f"{profile.firstname} {profile.lastname}".strip()
                        if profile
                        else None
                    ),
                    "department": (
                        profile.department.name
                        if profile and profile.department
                        else None
                    ),
                }
            )

        return Response(
            {
                "status": "success",
                "title": "Admin Dashboard",
                "department": department_name,
                "users_count": len(data),
                "users": data,
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["Ship Admin APIs"])
class UserListAPIView(APIView):
    """
    GET /api/users/

    Returns users visible to the logged-in user according to RBAC.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        try:
            user_profile = request.user.user_profile
            user_dep_name = getattr(
                user_profile.department,
                "name",
                None,
            )
        except (
            AttributeError,
            CustomUserProfile.DoesNotExist,
        ):
            user_profile = None
            user_dep_name = None

        # Preserve existing RBAC visibility logic.
        scoped_profiles = rbac.visible_profiles_for(request.user)

        is_legacy_admin = (
            getattr(user_profile.role_master, "role_name", None)
            == rbac.ROLE_ADMIN_LEGACY
        )

        users_qs = CustomUser.objects.select_related(
            "user_profile__department",
            "user_profile__role_master",
            "user_profile__role_assigned_by",
        ).filter(
            user_profile__in=scoped_profiles,
            user_profile__isnull=False,
        )

        # Non-legacy-admin users should only see personnel
        # whose personal number starts with a digit.
        if not is_legacy_admin:
            users_qs = users_qs.filter(user_profile__personal_number__regex=r"^\d")

        users_qs = users_qs.order_by("-id")

        users = []

        for user in users_qs:
            profile = user.user_profile

            role = getattr(profile, "role_master", None)
            department = getattr(profile, "department", None)
            role_assigned_by = getattr(
                profile,
                "role_assigned_by",
                None,
            )

            users.append(
                {
                    "id": user.id,
                    "username": user.username,
                    "is_active": user.is_active,
                    "is_admin": getattr(user, "is_admin", False),
                    "personal_number": profile.personal_number,
                    "firstname": profile.firstname,
                    "lastname": profile.lastname,
                    "name": (f"{profile.firstname} {profile.lastname}".strip()),
                    "department": (department.name if department else None),
                    "department_id": (department.id if department else None),
                    "role": (role.role_name if role else None),
                    "role_id": (role.id if role else None),
                    "role_assigned_by": (
                        role_assigned_by.id if role_assigned_by else None
                    ),
                    "user_active": profile.user_active,
                    "is_role": profile.is_role,
                    "is_ood": profile.is_ood,
                    "is_regulator": profile.is_regulator,
                    "executive_sub_department": (profile.executive_sub_department),
                }
            )

        # Preserve the existing RBAC logic.
        pending_requests = [
            {
                "id": pr.id,
                "requester_id": pr.requester_id,
                "requester_name": (
                    f"{pr.requester.firstname} {pr.requester.lastname}".strip()
                    if pr.requester
                    else None
                ),
                "requested_role_id": pr.requested_role_id,
                "requested_role": (
                    pr.requested_role.role_name if pr.requested_role else None
                ),
                "department": (pr.department.name if pr.department else None),
                "status": pr.status,
                "source": pr.source,
                "remarks": pr.remarks,
                "created_on": pr.created_on,
                "acted_on": pr.acted_on,
            }
            for pr in rbac.pending_requests_for(request.user).select_related(
                "requester",
                "requested_role",
                "department",
            )
        ]

        assignable_roles = rbac.assignable_roles(request.user).filter(
            id__in=rbac.active_roles()
        )

        roles = [
            {
                "id": role.id,
                "role_name": role.role_name,
            }
            for role in assignable_roles
        ]

        return Response(
            {
                "status": "success",
                "title": "User Management",
                "department": user_dep_name,
                "users_count": len(users),
                "users": users,
                "pending_requests": pending_requests,
                "assignable_roles": roles,
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["Ship Admin APIs"])
class EditUserProfileAPIView(APIView):
    """
    GET  /api/users/<user_id>/edit/
    PUT  /api/users/<user_id>/edit/
    PATCH /api/users/<user_id>/edit/

    Converts EditUserProfileView to a JSON API.

    Expected PATCH/PUT example:

    {
        "username": "1234",
        "firstname": "John",
        "lastname": "Doe",
        "designation": "ENGINEER",
        "rank": "Captain",
        "designation": 2,
        "role_master": 2,
        "executive_sub_department": "HULL MAINT",
        "is_ood": true,
        "is_regulator": false
    }
    """

    permission_classes = (IsAuthenticated,)

    def get_object(self, user_id):
        return get_object_or_404(
            CustomUser.objects.select_related(
                "user_profile",
                "user_profile__department",
                "user_profile__role_master",
            ),
            id=user_id,
        )

    def _check_visibility(self, request, profile):
        return rbac.visible_profiles_for(request.user).filter(pk=profile.pk).exists()

    def get(self, request, user_id):
        user_to_edit = self.get_object(user_id)
        profile = user_to_edit.user_profile

        if not self._check_visibility(request, profile):
            return Response(
                {
                    "status": "error",
                    "message": "This user is not in your department.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        role = profile.role_master
        department = profile.department
        rank = getattr(profile, "rank", None)
        designation_master = getattr(profile, "designation_master", None)

        return Response(
            {
                "status": "success",
                "user": {
                    "id": user_to_edit.id,
                    "username": user_to_edit.username,
                    "is_active": user_to_edit.is_active,
                },
                "profile": {
                    "id": profile.id,
                    "personal_number": profile.personal_number,
                    "firstname": profile.firstname,
                    "lastname": profile.lastname,
                    "department": (department.name if department else None),
                    "department_id": (department.id if department else None),
                    "role_master": (role.id if role else None),
                    "role_name": (role.role_name if role else None),
                    "executive_sub_department": (profile.executive_sub_department),
                    "is_ood": profile.is_ood,
                    "is_regulator": profile.is_regulator,
                    "user_active": profile.user_active,
                    "is_role": profile.is_role,
                    "rank": (rank.pk if rank else None),
                    "designation": (
                        designation_master.pk if designation_master else None
                    ),
                    "date_of_marrige": profile.marriage_date,
                },
                # Drives the Account Status switch vs a read-only badge on the
                # frontend. Enforced server-side in _update below regardless of
                # what the client renders -- this flag is presentation only.
                "can_set_account_status": rbac.can_set_account_status(
                    request.user, user_to_edit
                ),
            },
            status=status.HTTP_200_OK,
        )

    @transaction.atomic
    def put(self, request, user_id):
        return self._update(request, user_id, partial=False)

    @transaction.atomic
    def patch(self, request, user_id):
        return self._update(request, user_id, partial=True)

    def _update(self, request, user_id, partial=False):
        user_to_edit = self.get_object(user_id)
        profile_to_edit = user_to_edit.user_profile

        if not self._check_visibility(
            request,
            profile_to_edit,
        ):
            return Response(
                {
                    "status": "error",
                    "message": "This user is not in your department.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        original_role_id = profile_to_edit.role_master_id

        # ---------------------------------------------------------
        # Basic user fields
        # ---------------------------------------------------------

        if "username" in request.data:
            username = request.data.get("username")

            if not username:
                return Response(
                    {
                        "status": "error",
                        "message": "Username cannot be empty.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user_to_edit.username = username

        # Code note: may this viewer work the Account Status switch. The two
        # admin roles only, and never on their own row -- see
        # rbac.can_set_account_status. Computed once and used below, so the
        # decision matches what GET reported to the frontend.
        can_set_status = rbac.can_set_account_status(request.user, user_to_edit)

        # ---------------------------------------------------------
        # Profile fields
        # ---------------------------------------------------------

        if "firstname" in request.data:
            firstname = request.data.get("firstname")

            if not firstname:
                return Response(
                    {
                        "status": "error",
                        "message": "First name cannot be empty.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            profile_to_edit.firstname = firstname

        if "lastname" in request.data:
            profile_to_edit.lastname = request.data.get("lastname") or ""

        if "executive_sub_department" in request.data:
            profile_to_edit.executive_sub_department = request.data.get(
                "executive_sub_department"
            )

        if "is_ood" in request.data:
            profile_to_edit.is_ood = self._parse_boolean(request.data.get("is_ood"))

        if "is_regulator" in request.data:
            profile_to_edit.is_regulator = self._parse_boolean(
                request.data.get("is_regulator")
            )

            if profile_to_edit.is_regulator:
                co_exist = HierarchyForChart.objects.filter(node_type="co")
                if not co_exist:
                    HierarchyForChart.objects.create(
                        node_type="co",
                        division_name="Commanding Officer",
                        user=CustomUserProfile.objects.filter(
                            designation__iexact="Commanding Officer"
                        ).first(),
                        is_commander_officer=True,
                    )

                HierarchyForChart.objects.create(
                    node_type=profile_to_edit.role_master.role_name,
                    division_name=profile_to_edit.department.name,
                    user=profile_to_edit,
                    is_regulator=profile_to_edit.is_regulator,
                    parent=HierarchyForChart.objects.get(node_type="co"),
                )

        if "profile" in request.data:
            rank = request.data.get("profile").get("rank")
            designation = request.data.get("profile").get("designation")

            if designation in ("", None):
                profile_to_edit.designation = None
            else:
                try:
                    profile_to_edit.designation_master = Designation.objects.get(
                        designation_name=designation
                    )
                    profile_to_edit.designation = designation
                except (Designation.DoesNotExist, ValueError, TypeError):
                    return Response(
                        {
                            "status": "error",
                            "message": "Invalid Designation.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            if rank in ("", None):
                profile_to_edit.rank = None
            else:
                try:
                    profile_to_edit.rank = Rank.objects.filter(name=rank)[0]
                except (Rank.DoesNotExist, ValueError, TypeError):
                    rank = Rank.objects.create(name=rank)
                    profile_to_edit.rank = rank
                    # return Response( #NOSONAR
                    #     {
                    #         "status": "error",
                    #         "message": "Invalid rank.",
                    #     },
                    #     status=status.HTTP_400_BAD_REQUEST,
                    # )

        # ---------------------------------------------------------
        # Role change
        # ---------------------------------------------------------

        if "role_master" in request.data:
            role_id = request.data.get("role_master")

            if role_id in ("", None):
                new_role = None
            else:
                try:
                    new_role = rbac.get_role(role_id)
                except Exception:
                    return Response(
                        {
                            "status": "error",
                            "message": "Invalid role_master.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            new_role_id = new_role.id if new_role else None

            if new_role_id != original_role_id:
                if not rbac.can_assign_role(
                    request.user,
                    profile_to_edit,
                    new_role,
                ):
                    role_label = new_role.role_name if new_role else "no role"

                    return Response(
                        {
                            "status": "error",
                            "message": (
                                f"You may not grant {role_label} to this user."
                            ),
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

                profile_to_edit.role_master = new_role

                rbac.stamp_role_assignment(
                    profile_to_edit,
                    rbac.get_profile(request.user),
                )

        # ---------------------------------------------------------
        # Account status
        # ---------------------------------------------------------
        # Only the two admin roles may work this switch, and never on their
        # own account (rbac.can_set_account_status). When they do hold the
        # right, an absent/unparseable value PRESERVES the account's current
        # status rather than reactivating it -- that is the regression this
        # replaces (every save used to hardcode is_active=True). For Command
        # and the HODs -- who cannot set this switch -- saving this form
        # still means "approve", which is how a self-registered user
        # (created is_active=False by RegisterView) is let in.
        if can_set_status:
            account_active = self._parse_boolean(request.data.get("account_active"))
            if account_active is None:
                account_active = user_to_edit.is_active
        else:
            account_active = True

        profile_to_edit.user_active = account_active
        profile_to_edit.is_role = True

        profile_to_edit.save()

        user_to_edit.is_active = account_active
        user_to_edit.save()

        return Response(
            {
                "status": "success",
                "message": (
                    f"Successfully updated profile for {user_to_edit.username}."
                ),
                "user_id": user_to_edit.id,
                "username": user_to_edit.username,
            },
            status=status.HTTP_200_OK,
        )

    @staticmethod
    def _parse_boolean(value):
        if isinstance(value, bool):
            return value

        if value is None or value == "":
            return None

        if isinstance(value, str):
            value_lower = value.lower()

            if value_lower == "true":
                return True

            if value_lower == "false":
                return False

        return None


@extend_schema(tags=["Ship Admin APIs"])
class ApproveUserAPIView(APIView):
    """
    POST /api/users/<user_id>/approve/
    """

    permission_classes = (IsAuthenticated, IsLiveAuthzUser)

    @transaction.atomic
    def post(self, request, user_id):
        user = get_object_or_404(
            CustomUser.objects.select_related("user_profile"),
            id=user_id,
        )

        user.is_active = True
        user.save(update_fields=["is_active"])

        if hasattr(user, "user_profile"):
            profile = user.user_profile
            profile.user_active = True
            profile.is_role = True
            profile.save(
                update_fields=[
                    "user_active",
                    "is_role",
                ]
            )

        return Response(
            {
                "status": "success",
                "message": "User approved successfully.",
                "user_id": user.id,
                "username": user.username,
                "is_active": True,
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["Ship Admin APIs"])
class DisapproveUserAPIView(APIView):
    """
    POST /api/users/<user_id>/disapprove/
    """

    permission_classes = (IsAuthenticated, IsLiveAuthzUser)

    @transaction.atomic
    def post(self, request, user_id):
        user = get_object_or_404(
            CustomUser.objects.select_related("user_profile"),
            id=user_id,
        )

        user.is_active = False
        user.save(update_fields=["is_active"])

        if hasattr(user, "user_profile"):
            profile = user.user_profile
            profile.user_active = False
            profile.save(update_fields=["user_active"])

        return Response(
            {
                "status": "success",
                "message": "User disapproved successfully.",
                "user_id": user.id,
                "username": user.username,
                "is_active": False,
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["Ship Admin APIs"])
class ActiveUserAPIView(APIView):
    """
    GET /api/users/active/

    ADMIN:
        Returns all profiles.

    Other departments:
        Returns active users from the logged-in user's department.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        try:
            profile = request.user.user_profile
        except CustomUserProfile.DoesNotExist:
            return Response(
                {
                    "status": "error",
                    "message": "User profile not found.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ---------------------------------------------------------
        # ADMIN gets every profile
        # ---------------------------------------------------------

        if profile.department and profile.department.name == "ADMIN":
            profiles_qs = CustomUserProfile.objects.select_related(
                "rank",
                "department",
            ).all()

        # ---------------------------------------------------------
        # Other departments only get their active users
        # ---------------------------------------------------------

        else:
            profiles_qs = CustomUserProfile.objects.select_related(
                "rank",
                "department",
            ).filter(
                user_active=True,
                department_id=profile.department_id,
            )

        active_users = []

        for profile in profiles_qs:
            try:
                access_level = access_level_choices[int(profile.access_level)][1]
            except (
                ValueError,
                TypeError,
                IndexError,
                KeyError,
            ):
                access_level = profile.access_level

            rank_name = profile.rank.name if profile.rank else None

            department_name = profile.department.name if profile.department else None

            joining_date = (
                localtime(profile.ship_joining_date)
                if profile.ship_joining_date
                else None
            )

            leaving_date = (
                localtime(profile.ship_leaving_date)
                if profile.ship_leaving_date
                else None
            )

            user_data = {
                "id": profile.id,
                "access_level": access_level,
                "username": profile.personal_number,
                "rank": rank_name,
                "name": (f"{profile.firstname} {profile.lastname}").strip(),
                "firstname": profile.firstname,
                "lastname": profile.lastname,
                "department": department_name,
                "department_id": (profile.department_id),
                "date": joining_date,
            }

            # Original view only included ship_leaving_date
            # for non-ADMIN users.
            if department_name != "ADMIN":
                user_data["ship_leaving_date"] = leaving_date

            active_users.append(user_data)

        # DjangoJSONEncoder converts datetime objects properly,
        # but DRF Response can already serialize datetime values.
        return Response(
            {
                "status": "success",
                "title": "OSMS | Active Users",
                "activate": request.query_params.get(
                    "activate_btn",
                    0,
                ),
                "users_count": len(active_users),
                "history_users": active_users,
            },
            status=status.HTTP_200_OK,
        )


class HRCDFMockLookupView(generics.GenericAPIView):
    serializer_class = PersonnelNumberSerializer
    permission_classes = (AllowAny,)

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        personnel_number = serializer.validated_data["personnel_number"]
        hrcdf_user = (
            HRCDFMock.objects.filter(personnel_number__iexact=personnel_number)
            .order_by("-id")
            .first()
        )

        if not hrcdf_user:
            return Response(
                {
                    "status": "error",
                    "message": "Personnel number not found in HRCDF mock data.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # Code note: personnel_number lives on CustomUserProfile.personal_number,
        # not on CustomUser -- there is no such field on CustomUser itself, and
        # CustomUser has no is_approved attribute either. is_active is the
        # approval flag ApproveUserAPIView/DisapproveUserAPIView actually flip.
        existing_user = CustomUser.objects.filter(
            user_profile__personal_number__iexact=personnel_number
        ).first()
        if existing_user is not None:
            return Response(
                {
                    "status": "error",
                    "message": (
                        "User is already approved."
                        if existing_user.is_active
                        else "User is already registered and pending admin approval."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            {
                "status": "success",
                "data": HRCDFMockSerializer(hrcdf_user).data,
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["Users"], request=DatabaseResetRequestSerializer)
class DatabaseResetAPIView(APIView):
    """
    POST /api/v1/user/database-reset/

    DESTRUCTIVE: truncates every table in the application database (every
    installed app, not just `users`) and immediately reloads the
    master/reference/transactional data snapshot via
    `seed_generic_db_snapshot.py` (data COPY from
    `seed_data/generic_db_snapshot_data.pkl.gz`, then that script's own
    `seed_all()` for users/departments/roles/nav visibility), leaving the
    application ready for fresh initialization. Restricted to the
    SHIPADMIN role (see `users.permissions.IsShipAdminRole`) and requires
    the exact confirmation phrase below in the request body, so a bare
    authenticated POST can never trigger it by accident.

    Note: `seed_generic_db_snapshot.py`'s snapshot load recreates the
    `postgres_fdw` extension and the `remote_728` foreign server/user
    mapping, which requires the app's database user to hold Postgres
    superuser privileges -- this will fail with a permissions error on a
    non-superuser DB role.

    Every row in every table is deleted, including the caller's own
    CustomUser row -- their current request still completes normally (the
    authenticated user was already resolved before this view ran), but
    their access/refresh tokens are invalidated immediately afterward,
    same as everyone else's. A fresh login is required post-reset.
    """

    permission_classes = [IsShipAdminRole, IsLiveAuthzUser]

    CONFIRMATION_PHRASE = "RESET"

    def post(self, request):
        confirm = request.data.get("confirm")
        if confirm != self.CONFIRMATION_PHRASE:
            return Response(
                {
                    "status": "error",
                    "message": (
                        "This action deletes ALL application data. Resend "
                        f'with {{"confirm": "{self.CONFIRMATION_PHRASE}"}} '
                        "in the request body to proceed."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.warning(
            "Database reset triggered by user %r (id=%s) via DatabaseResetAPIView",
            request.user.username,
            request.user.pk,
        )

        try:
            call_command("flush", "--noinput")
        except Exception as exc:
            logger.exception("Database reset: flush failed")
            return Response(
                {"status": "error", "message": f"Database flush failed: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            # Lazy import: seed_generic_db_snapshot.py is a standalone
            # repo-root script (not a Django app module) that runs
            # django.setup() at import time - importing it lazily here
            # avoids doing that during Django's own startup/app-loading
            # sequence.
            import seed_all as snapshot_seeder

            loaded = snapshot_seeder.seed_all()
            if not loaded:
                raise RuntimeError("Snapshot load did not complete.")
        except Exception as exc:
            logger.exception("Database reset: snapshot reload failed after flush")
            return Response(
                {
                    "status": "error",
                    "message": (
                        "Database was flushed successfully, but reloading "
                        f"the snapshot failed: {exc}. The application "
                        "database is currently empty."
                    ),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        logger.warning(
            "Database reset by user %r completed successfully.",
            request.user.username,
        )
        return Response(
            {
                "status": "success",
                "message": "Database reset and snapshot reloaded successfully.",
            },
            status=status.HTTP_200_OK,
        )


# --------------------------------------------------------------------------
# HRCDF roster sync (CP-C) - api/v1/accounts/hrcdf-sync/
#
# Owning service swmm, schema swmm. Every endpoint is gated by IsShipAdminRole plus
# IsLiveAuthzUser (D16). Errors go through swmm.exceptions.custom_exception_handler.
# The engine lives in accounts.hrcdf_sync, the HTTP client in accounts.hrcdf_client.
# --------------------------------------------------------------------------


# Developed with Understanding: carries an HrcdfSyncError's status and operator message
# into DRF, so custom_exception_handler shapes it as {"status": "error", "message": ...}
# and no view builds an error body by hand.
class HrcdfSyncAPIException(APIException):
    """An HrcdfSyncError raised as a DRF exception with its own status code."""

    def __init__(self, error):
        super().__init__(detail=error.message)
        self.status_code = error.http_status


# Developed with Understanding: the shared gate of every sync endpoint (D16, R1 F-1) -
# IsShipAdminRole admits ADMIN and SHIPADMIN, IsLiveAuthzUser rejects a revoked session.
class HrcdfSyncBaseView(APIView):
    permission_classes = [IsAuthenticated, IsShipAdminRole, IsLiveAuthzUser]

    # Developed with Understanding: reads (readiness, units, progress) rely on the verified
    # token and the admin role. The live userauth probe stays on the data-changing POSTs
    # only, as IsLiveAuthzUser's own docstring prescribes, so the Step 1 dropdowns load even
    # when userauth cannot be reached.
    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsAuthenticated(), IsShipAdminRole()]
        return super().get_permissions()

    def requesting_profile(self):
        return getattr(self.request.user, "user_profile", None)


# Developed with Understanding: the personnel list page size of the API contract, a local
# PageNumberPagination modelled on sfd FrontendPageNumberPagination (R1 E3) with the
# default page of 25 rows. The response is DRF's own {count, next, previous, results}.
class HrcdfPersonnelPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


# Developed with Understanding: GET readiness/ - everything the page needs before a
# button is pressed (IIMA sync_readiness re-expressed). Never a credential.
@extend_schema(tags=["HRCDF Sync"])
class HrcdfSyncReadinessView(HrcdfSyncBaseView):
    def get(self, request):
        client = HrcdfClient(hrcdf_sync.sync_config())
        client.close()
        holder = hrcdf_sync.lock_holder()
        identity = hrcdf_sync.ship_identity()
        home = None
        if identity is not None and identity.unit_id:
            home = HrcdfHomeUnitSerializer(identity).data
        last_runs = {}
        for mode in HrcdfSyncJob.Mode.values:
            job = hrcdf_sync.last_run(mode)
            last_runs[mode] = HrcdfSyncJobSummarySerializer(job).data if job else None
        return Response(
            {
                "configured": bool(client.host),
                "host": client.host,
                "users_path": client.users_path,
                "running": bool(holder),
                "active_job_id": str(holder) if holder else None,
                "home_unit": home,
                "counts": hrcdf_sync.readiness_counts(),
                "last_runs": last_runs,
            }
        )


# Developed with Understanding: GET units/ - the Command filter options (HrcdfCommand),
# the unit list for the home-unit picker (HrcdfUnit), the current home unit and the
# ship-name hint (OQ15). The response keys are unchanged.
@extend_schema(tags=["HRCDF Sync"])
class HrcdfSyncUnitsView(HrcdfSyncBaseView):
    def get(self, request):
        units = HrcdfUnit.objects.select_related("command")
        command = (request.query_params.get("command") or "").strip()
        if command:
            if not command.isdigit():
                raise DRFValidationError({"command": "Must be an HrcdfCommand id."})
            units = units.filter(command_id=int(command))
        search = (request.query_params.get("search") or "").strip()
        if search:
            units = units.filter(Q(name__icontains=search) | Q(code__icontains=search))
        identity = hrcdf_sync.ship_identity()
        home = None
        if identity is not None and identity.unit_id:
            home = HrcdfHomeUnitSerializer(identity).data
        return Response(
            {
                "commands": HrcdfCommandOptionSerializer(
                    HrcdfCommand.objects.order_by("code", "id"), many=True
                ).data,
                "units": HrcdfUnitSerializer(
                    units.order_by("name", "id"), many=True
                ).data,
                "home_unit": home,
                "hint": self._hint(),
            }
        )

    # Developed with Understanding: the HrcdfUnit whose name matches the CMMS ship name,
    # trimmed and case-insensitive (OQ15). The name is Master_unit cmms_ship_name, read
    # without creating the row, falling back to the ActiveShipConfig ship. A CMMS name
    # with an "INS " prefix is also tried without it. Only a hint, never a selection.
    def _hint(self):
        this_ship = Unit.objects.order_by("id").first()
        name = (getattr(this_ship, "cmms_ship_name", None) or "").strip()
        if not name:
            ship = ActiveShipConfig.get_selected_ship()
            name = (getattr(ship, "name", None) or "").strip()
        if not name:
            return None
        candidates = [name]
        if name.upper().startswith("INS ") and name[4:].strip():
            candidates.append(name[4:].strip())
        trimmed = HrcdfUnit.objects.annotate(trimmed_name=Trim("name"))
        for candidate in candidates:
            unit = trimmed.filter(trimmed_name__iexact=candidate).order_by("id").first()
            if unit is not None:
                return unit.id
        return None


# Developed with Understanding: POST units/refresh/ - Get Ship Names from HRCDF. It starts
# a job of mode units through start_sync, so the answer is the same as runs/ (202 queued
# with job_id, 200 inline with the summary, 400 unconfigured, 409 busy) and the page polls
# runs/<job_id>/progress/ for its console. Never creates a person.
@extend_schema(tags=["HRCDF Sync"], request=None)
class HrcdfSyncUnitsRefreshView(HrcdfSyncBaseView):
    def post(self, request):
        try:
            return hrcdf_sync.start_sync(
                self.requesting_profile(), hrcdf_sync.MODE_UNITS, request
            )
        except HrcdfSyncError as exc:
            raise HrcdfSyncAPIException(exc) from exc


# Developed with Understanding: POST home-unit/ - picks and locks the home unit (D15).
@extend_schema(tags=["HRCDF Sync"], request=HrcdfHomeUnitRequestSerializer)
class HrcdfSyncHomeUnitView(HrcdfSyncBaseView):
    def post(self, request):
        serializer = HrcdfHomeUnitRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            identity = hrcdf_sync.set_home_unit(serializer.validated_data["unit_id"])
        except HrcdfSyncError as exc:
            raise HrcdfSyncAPIException(exc) from exc
        logger.info(
            "HRCDF home unit set to %s by user id=%s",
            identity.unit.code,
            request.user.pk,
        )
        return Response({"home_unit": HrcdfHomeUnitSerializer(identity).data})


# Developed with Understanding: POST runs/ - starts an own-ship or other-units run. 202
# when queued on the worker, 200 with the final summary when it ran inline (OQ11).
@extend_schema(tags=["HRCDF Sync"], request=HrcdfRunRequestSerializer)
class HrcdfSyncRunsView(HrcdfSyncBaseView):
    def post(self, request):
        serializer = HrcdfRunRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            return hrcdf_sync.start_sync(
                self.requesting_profile(), serializer.validated_data["mode"], request
            )
        except HrcdfSyncError as exc:
            raise HrcdfSyncAPIException(exc) from exc


# Developed with Understanding: GET runs/<job_id>/progress/ - the once-a-second poll
# behind the progress bar and the console. Read only. limit is capped at 2000.
@extend_schema(tags=["HRCDF Sync"], responses=HrcdfProgressSerializer)
class HrcdfSyncProgressView(HrcdfSyncBaseView):
    def get(self, request, job_id):
        job = get_object_or_404(HrcdfSyncJob, pk=job_id)
        snapshot = hrcdf_sync.progress_snapshot(
            job,
            since=request.query_params.get("since") or 0,
            limit=request.query_params.get("limit") or hrcdf_sync.MAX_LINES_PER_POLL,
        )
        return Response(HrcdfProgressSerializer(snapshot).data)


# Developed with Understanding: the shared search and order of both personnel lists -
# personal_number, full_name, firstname, lastname icontains, then full_name and number.
class HrcdfPersonnelListBaseView(generics.ListAPIView):
    # Developed with Understanding: read-only lists, so token and admin role only - the live
    # userauth probe is kept for the data-changing sync endpoints.
    permission_classes = [IsAuthenticated, IsShipAdminRole]
    pagination_class = HrcdfPersonnelPagination

    def search_and_order(self, queryset):
        search = (self.request.query_params.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(personal_number__icontains=search)
                | Q(full_name__icontains=search)
                | Q(firstname__icontains=search)
                | Q(lastname__icontains=search)
            )
        return queryset.order_by("full_name", "personal_number", "id")


# Developed with Understanding: GET personnel/own/ - every own-ship CustomUserProfile row,
# open (default), closed or all by ship_leaving_date.
@extend_schema(tags=["HRCDF Sync"])
class HrcdfOwnPersonnelListView(HrcdfPersonnelListBaseView):
    serializer_class = HrcdfOwnPersonnelRowSerializer
    STATUS_FILTERS = ("open", "closed", "all")

    def get_queryset(self):
        queryset = CustomUserProfile.objects.all()
        state = (self.request.query_params.get("status") or "open").strip().lower()
        if state not in self.STATUS_FILTERS:
            raise DRFValidationError({"status": "Must be one of open, closed or all."})
        if state == "open":
            queryset = queryset.filter(ship_leaving_date__isnull=True)
        elif state == "closed":
            queryset = queryset.filter(ship_leaving_date__isnull=False)
        return self.search_and_order(queryset)


# Developed with Understanding: GET personnel/others/ - every OtherCustomUserProfile row,
# filtered by command_code and unit_code when given.
@extend_schema(tags=["HRCDF Sync"])
class HrcdfOtherPersonnelListView(HrcdfPersonnelListBaseView):
    serializer_class = HrcdfOtherPersonnelRowSerializer

    def get_queryset(self):
        queryset = OtherCustomUserProfile.objects.all()
        command = (self.request.query_params.get("command") or "").strip()
        if command:
            queryset = queryset.filter(command_code=command)
        unit = (self.request.query_params.get("unit") or "").strip()
        if unit:
            queryset = queryset.filter(unit_code=unit)
        return self.search_and_order(queryset)


# Developed with Understanding: the role label of an other-ship login (D5, D28). Display only -
# no role row is created or assigned.
GUEST_ROLE_DISPLAY = "GUEST"


# Developed with Understanding: GET me/unit-status/ (CP-L, D29) - whether the signed-in user is
# an other-ship guest, with the name, number and unit of the profile the login is linked to
# (OtherCustomUserProfile for a guest, CustomUserProfile otherwise) and this ship's display name.
# Guest-allowed through settings.GUEST_ALLOWED_URL_NAMES. Read only.
@extend_schema(tags=["Users"], responses=UnitStatusSerializer)
class UnitStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        is_other = bool(user.is_other_unit)
        profile = user.other_profile if is_other else user.user_profile
        if is_other:
            role_display = GUEST_ROLE_DISPLAY
        elif profile is not None and profile.role_master_id:
            role_display = profile.role_master.role_name or ""
        else:
            role_display = ""
        name = ""
        number = ""
        if profile is not None:
            parts = f"{profile.firstname or ''} {profile.lastname or ''}"
            name = (profile.full_name or "").strip() or parts.strip()
            number = (profile.personal_number or "").strip()
        home = login_routing.this_ship_unit()
        data = {
            "is_other_unit": is_other,
            "role_display": role_display,
            "full_name": name or user.username,
            "personal_number": number or user.username,
            "unit_name": (getattr(profile, "section", "") or "").strip(),
            "unit_code": (getattr(profile, "unit_code", "") or "").strip(),
            "home_ship_display_name": ins_display_name(
                getattr(home, "hrcdf_ship_name", "")
            ),
        }
        return Response(UnitStatusSerializer(data).data)
