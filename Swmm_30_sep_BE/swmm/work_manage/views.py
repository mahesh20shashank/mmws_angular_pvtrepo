from datetime import datetime

from django.contrib.auth import get_user_model
from django.db.models import Count
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from accounts import rbac

from .models import Duty, TimeSlot, WorkAssignment
from .serializers import (
    DutySerializer,
    TimeSlotSerializer,
    WorkAssignmentSerializer,
)
from .utils import tagged_viewset, users_for_department


def _scope_department(user):
    """Resolve the department a `for_department()` queryset call should use.

    Returns (department, unrestricted). `for_department(None)` means
    "no filter", so a non-privileged user with no department attached must
    be handled by the caller returning `.none()` rather than passing None
    through - otherwise they'd see every department's data.
    """
    if rbac.can_see_all_departments(user):
        return None, True
    return rbac.department_of(user), False


@tagged_viewset("Work Management")
class DutyViewSet(viewsets.ModelViewSet):
    queryset = Duty.objects.with_related()
    serializer_class = DutySerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        department, unrestricted = _scope_department(self.request.user)
        if unrestricted:
            return queryset
        if department is None:
            return queryset.none()
        return queryset.for_department(department)

    def perform_create(self, serializer):
        serializer.save(
            user=self.request.user,
            created_by=self.request.user,
            department=getattr(self.request.user, "department", None),
        )


@tagged_viewset("Work Management")
class TimeSlotViewSet(viewsets.ModelViewSet):
    queryset = TimeSlot.objects.select_related("user", "created_by", "department").all()
    serializer_class = TimeSlotSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        department, unrestricted = _scope_department(self.request.user)
        if unrestricted:
            return queryset
        if department is None:
            return queryset.none()
        return queryset.for_department(department)

    def perform_create(self, serializer):
        serializer.save(
            user=self.request.user,
            created_by=self.request.user,
            department=getattr(self.request.user, "department", None),
        )


@tagged_viewset("Work Management")
class WorkAssignmentViewSet(viewsets.ModelViewSet):
    queryset = WorkAssignment.objects.select_related(
        "assigner",
        "created_by",
        "assignee",
        "timeslot",
        "duty",
        "department",
    ).all()
    serializer_class = WorkAssignmentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        department, unrestricted = _scope_department(self.request.user)
        assignment_date = self.request.query_params.get("date")
        location = self.request.query_params.get("location")
        if not unrestricted:
            if department is None:
                return queryset.none()
            queryset = queryset.for_department(department)
        return queryset.filter_view(
            assignment_date=assignment_date,
            location=location,
        )

    def perform_create(self, serializer):
        serializer.save(
            assigner=self.request.user,
            created_by=self.request.user,
            department=getattr(self.request.user, "department", None),
        )

    @extend_schema(tags=["Work Management"])
    @action(detail=False, methods=["get"], url_path="available-users")
    def available_users(self, request):
        date_value = request.query_params.get("date")
        if not date_value:
            return Response(
                {"date": "Date parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            selected_date = datetime.strptime(date_value, "%Y-%m-%d").date()
        except ValueError:
            return Response(
                {"date": "Invalid date format. Use YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        department, unrestricted = _scope_department(request.user)
        if not unrestricted and department is None:
            users = get_user_model().objects.none()
        else:
            assigned_user_ids = WorkAssignment.objects.assigned_user_ids_for_date(
                selected_date,
                department,
            )
            users = users_for_department(department).exclude(id__in=assigned_user_ids)
        return Response(
            {
                "users": [
                    {
                        "id": user.id,
                        "username": user.CustomUsername,
                        "full_name": user.get_full_name(),
                    }
                    for user in users
                ],
                "count": users.count(),
            }
        )

    @extend_schema(tags=["Work Management"])
    @action(detail=False, methods=["get"], url_path="dashboard")
    def dashboard(self, request):
        queryset = self.get_queryset()
        return Response(
            {
                "total_assignments": queryset.count(),
                "total_slots": queryset.values("timeslot").distinct().count(),
                "status_counts": dict(
                    queryset.values_list("status").annotate(total=Count("id"))
                ),
            }
        )

    @extend_schema(tags=["Work Management"])
    @action(detail=True, methods=["post"], url_path="start")
    def start(self, request, pk=None):
        assignment = self.get_object()
        assignment.status = WorkAssignment.Status.IN_PROGRESS
        assignment.save(update_fields=["status"])
        return Response(self.get_serializer(assignment).data)

    @extend_schema(tags=["Work Management"])
    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        assignment = self.get_object()
        assignment.status = WorkAssignment.Status.COMPLETED
        assignment.save(update_fields=["status"])
        return Response(self.get_serializer(assignment).data)

    @extend_schema(tags=["Work Management"])
    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        assignment = self.get_object()
        assignment.status = WorkAssignment.Status.CANCELLED
        assignment.save(update_fields=["status"])
        return Response(self.get_serializer(assignment).data)
