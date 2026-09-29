from accounts import rbac
from django.db.models import Count
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import Ticket, TicketComment, TicketFile
from .serializers import (
    TicketCloseSerializer,
    TicketCommentSerializer,
    TicketFileSerializer,
    TicketSerializer,
)
from .utils import tagged_read_only_viewset, tagged_viewset

TAG_TICKET_MANAGEMENT = "Ticket Management"
ROLE_SHIPADMIN = "SHIPADMIN"

ALLOWED_TICKET_FILE_EXTENSIONS = {
    "jpg",
    "jpeg",
    "png",
    "pdf",
    "webp",
    "mp4",
    "mov",
    "avi",
    "mkv",
    "wmv",
    "webm",
    "doc",
    "docx",
    "zip",
}


def get_user_unit_and_department(user):
    """Retrieve unit name and department name for a given user profile."""
    unit_name = getattr(user, "unit", "") or ""
    if not unit_name and hasattr(user, "user_profile"):
        unit_id = getattr(user.user_profile, "command_name_id", None)
        if unit_id:
            from master.models import MasterCommand

            unit_obj = MasterCommand.objects.filter(id=unit_id).first()
            unit_name = unit_obj.unit_name if unit_obj else ""

    department_name = ""
    dept_obj = getattr(user, "department", None)
    if dept_obj:
        department_name = getattr(dept_obj, "name", "") or ""
    elif hasattr(user, "user_profile"):
        dept_id = getattr(user.user_profile, "department_id", None)
        if dept_id:
            from master.models import Department

            d_obj = Department.objects.filter(id=dept_id).first()
            department_name = d_obj.name if d_obj else ""

    return unit_name, department_name


def is_user_allowed_to_close(user):
    """Check if the user has privileges (is_staff, superuser, or SHIPADMIN role) to close a ticket."""
    if user.is_staff or user.is_superuser:
        return True
    if hasattr(user, "user_profile"):
        role_master = getattr(user.user_profile, "role_master", None)
        if role_master and getattr(role_master, "role_name", "") == ROLE_SHIPADMIN:
            return True
    return getattr(user, "role", "") == ROLE_SHIPADMIN


def calculate_ticket_statistics(queryset):
    """Calculate and return ticket status and priority statistics dictionary for a queryset."""
    status_counts = dict(queryset.values_list("status").annotate(Count("id")))
    priority_counts = dict(queryset.values_list("priority").annotate(Count("id")))

    return {
        "total_tickets": queryset.count(),
        "open_tickets": status_counts.get(Ticket.Status.OPEN, 0),
        "in_progress_tickets": status_counts.get(Ticket.Status.IN_PROGRESS, 0),
        "closed_tickets": status_counts.get(Ticket.Status.CLOSED, 0),
        "low_priority": priority_counts.get(Ticket.Priority.LOW, 0),
        "medium_priority": priority_counts.get(Ticket.Priority.MEDIUM, 0),
        "high_priority": priority_counts.get(Ticket.Priority.HIGH, 0),
    }


def validate_file_extensions(files):
    """Validate uploaded file extensions against allowed extensions list."""
    errors = []
    for uploaded_file in files:
        file_name = uploaded_file.name
        ext = file_name.split(".")[-1].lower() if "." in file_name else ""
        if ext not in ALLOWED_TICKET_FILE_EXTENSIONS:
            errors.append(
                f"{file_name} is not a valid file type. Only JPG, PNG, and PDF are allowed."
            )
    return errors


@tagged_viewset(TAG_TICKET_MANAGEMENT)
class TicketViewSet(viewsets.ModelViewSet):
    """ViewSet for managing tickets, comments, attachments, and stats."""

    queryset = Ticket.objects.with_related()
    serializer_class = TicketSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        queryset = super().get_queryset()
        if not rbac.can_see_all_departments(self.request.user):
            own_department = rbac.department_of(self.request.user)
            if own_department is None:
                queryset = queryset.none()
            else:
                queryset = queryset.filter(department_id=own_department.id)
        status_filter = self.request.query_params.get("status")
        priority = self.request.query_params.get("priority")
        query = self.request.query_params.get("q")
        return queryset.with_status(status_filter).with_priority(priority).search(query)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        files = instance.files.all()
        comments = instance.comments.all().order_by("created_at")
        return Response(
            {
                "is_new": False,
                "ticket": serializer.data,
                "files": TicketFileSerializer(files, many=True).data,
                "comments": TicketCommentSerializer(comments, many=True).data,
                "unit_name": instance.unit_name or "",
                "department_name": instance.department_name or "",
            }
        )

    def perform_create(self, serializer):
        user = self.request.user
        extra_kwargs = {"created_by": user}

        unit_name, department_name = get_user_unit_and_department(user)
        if not serializer.validated_data.get("unit_name") and unit_name:
            extra_kwargs["unit_name"] = unit_name
        if not serializer.validated_data.get("department_name") and department_name:
            extra_kwargs["department_name"] = department_name
        if not serializer.validated_data.get("department") and getattr(
            user, "department", None
        ):
            extra_kwargs["department"] = user.department

        ticket = serializer.save(**extra_kwargs)

        files = self.request.FILES.getlist("file") or self.request.FILES.getlist(
            "files"
        )
        for f in files:
            TicketFile.objects.create(ticket=ticket, file=f)

        initial_comment = (self.request.data.get("comment") or "").strip()
        if initial_comment:
            TicketComment.objects.create(
                ticket=ticket, user=user, comment=initial_comment
            )
            ticket.last_commented_on = timezone.now()
            ticket.save(update_fields=["last_commented_on"])

    @extend_schema(tags=[TAG_TICKET_MANAGEMENT])
    @action(detail=False, methods=["get"], url_path="form-info")
    def form_info(self, request):
        unit_name, department_name = get_user_unit_and_department(request.user)
        return Response(
            {
                "is_new": True,
                "unit_name": unit_name,
                "department_name": department_name,
            }
        )

    @extend_schema(tags=[TAG_TICKET_MANAGEMENT])
    @action(detail=False, methods=["get"], url_path="dashboard")
    def dashboard(self, request):
        queryset = self.get_queryset()
        stats = calculate_ticket_statistics(queryset)
        serializer = self.get_serializer(queryset, many=True)
        stats["tickets"] = serializer.data
        return Response(stats)

    @extend_schema(tags=[TAG_TICKET_MANAGEMENT])
    @action(detail=False, methods=["get"], url_path="my-tickets")
    def my_tickets(self, request):
        queryset = self.get_queryset().for_creator(request.user)
        stats = calculate_ticket_statistics(queryset)
        serializer = self.get_serializer(queryset, many=True)
        stats["tickets"] = serializer.data
        return Response(stats)

    @extend_schema(
        tags=[TAG_TICKET_MANAGEMENT],
        responses=TicketCloseSerializer,
    )
    @action(detail=True, methods=["post"], url_path="close")
    def close(self, request, pk=None):
        if not is_user_allowed_to_close(request.user):
            return Response(
                {"detail": "You do not have permission to close this ticket."},
                status=status.HTTP_403_FORBIDDEN,
            )
        ticket = self.get_object()
        ticket.status = Ticket.Status.CLOSED
        ticket.closed_on = timezone.now()
        ticket.save(update_fields=["status", "closed_on"])
        return Response(
            {
                "message": "Ticket closed successfully.",
                "ticket": self.get_serializer(ticket).data,
            }
        )

    @extend_schema(
        tags=[TAG_TICKET_MANAGEMENT],
        request=TicketCommentSerializer,
        responses=TicketCommentSerializer,
    )
    @action(detail=True, methods=["post"], url_path="add-comment")
    def add_comment(self, request, pk=None):
        ticket = self.get_object()
        files = request.FILES.getlist("file") or request.FILES.getlist("files")
        comment_text = (request.data.get("comment") or "").strip()

        if files and not comment_text:
            return Response(
                {"comment": ["Comment is required when uploading a file."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_errors = validate_file_extensions(files)
        if file_errors:
            return Response(
                {"file_errors": file_errors}, status=status.HTTP_400_BAD_REQUEST
            )

        if comment_text:
            TicketComment.objects.create(
                ticket=ticket,
                user=request.user,
                comment=comment_text,
            )
            ticket.last_commented_on = timezone.now()
            ticket.save(update_fields=["last_commented_on"])

        for f in files:
            TicketFile.objects.create(ticket=ticket, file=f)

        ticket.refresh_from_db()
        return Response(
            {
                "message": "Comment and/or file added successfully!",
                "ticket": self.get_serializer(ticket).data,
            },
            status=status.HTTP_201_CREATED
            if comment_text or files
            else status.HTTP_200_OK,
        )

    @extend_schema(
        tags=[TAG_TICKET_MANAGEMENT],
        request=TicketFileSerializer,
        responses=TicketFileSerializer,
    )
    @action(
        detail=True,
        methods=["post"],
        url_path="upload-file",
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_file(self, request, pk=None):
        ticket = self.get_object()
        files = request.FILES.getlist("file") or request.FILES.getlist("files")
        if not files and "file" in request.data:
            files = [request.data["file"]]

        if not files:
            return Response(
                {"file": ["No file was submitted."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_errors = validate_file_extensions(files)
        if file_errors:
            return Response(
                {"file_errors": file_errors}, status=status.HTTP_400_BAD_REQUEST
            )

        uploaded_records = []
        for f in files:
            file_serializer = TicketFileSerializer(data={"file": f})
            file_serializer.is_valid(raise_exception=True)
            file_obj = file_serializer.save(ticket=ticket)
            uploaded_records.append(file_obj)

        if len(uploaded_records) == 1:
            return Response(
                TicketFileSerializer(uploaded_records[0]).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(
            TicketFileSerializer(uploaded_records, many=True).data,
            status=status.HTTP_201_CREATED,
        )


@tagged_read_only_viewset(TAG_TICKET_MANAGEMENT)
class TicketCommentViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing ticket comments."""

    queryset = TicketComment.objects.with_related()
    serializer_class = TicketCommentSerializer


@tagged_read_only_viewset(TAG_TICKET_MANAGEMENT)
class TicketFileViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing ticket attached files."""

    queryset = TicketFile.objects.with_ticket()
    serializer_class = TicketFileSerializer
