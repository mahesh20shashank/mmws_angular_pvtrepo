import json
import os
import random

from accounts import rbac
from accounts.models import CustomUser, CustomUserProfile, Rank
from accounts.permissions import (
    CanEditConfiguration,
    CanManageCoMessages,
    HierarchyEditPermission,
)
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiTypes,
    extend_schema,
    extend_schema_view,
    inline_serializer,
)
from rest_framework import serializers as drf_serializers
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from sfd.utils import get_this_ship
from swmm.async_jobs import accepted_task_response, dispatch_task, sync_task_response

from master.tasks import export_routine_excel_task

from .models import (
    AppInfo,
    CoMessage,
    Department,
    HierarchyForChart,
    MemberDetail,
    OpsMaintenancePeriod,
    OrderDuty,
    Quote,
    RefitMaintenancePeriod,
    Ship,
    ShipRole,
    ShipRoleImage,
    SubDepartment,
    Unit,
    UpdateEntry,
)
from .serializers import (
    CoMessageSerializer,
    CreateRegulatorSerializer,
    DeleteRegulatorSerializer,
    DepartmentSerializer,
    GenericSuccessResponseSerializer,
    HierarchyForChartSerializer,
    MaintenanceNomenclatureDeleteSerializer,
    MaintenanceNomenclatureResponseSerializer,
    MaintenanceNomenclatureSerializer,
    MemberDetailSerializer,
    OrderDutySerializer,
    QuoteSerializer,
    RefitCompletionCreateSerializer,
    RefitCompletionResponseSerializer,
    RefitDelinquencyCreateSerializer,
    RefitDryDockingCreateSerializer,
    RefitOCRCreateSerializer,
    RefitSyncPayloadResponseSerializer,
    ShipKnowYourShipSerializer,
    ShipRoleSerializer,
    UpdateEntrySerializer,
    UpdateRegulatorProfileSerializer,
    ToggleSailorRegulatorSerializer,
)
from .utils import parse_iso_date, save_file_to_temp

OFFICER_RANK_NAME_VARIANTS = {
    "SUB LIEUTENANT": ["SLt", "SUB LIEUTENANT", "Sub Lieutenant"],
    "LIEUTENANT": ["Lt", "LIEUTENANT", "Lieutenant"],
    "LIEUTENANT COMMANDER": ["Lt Cdr", "LIEUTENANT COMMANDER", "Lieutenant Commander"],
    "COMMANDER": ["Cdr", "COMMANDER", "Commander"],
    "CAPTAIN": ["Capt", "CAPTAIN", "Captain"],
    "COMMODORE": ["Cdre", "COMMODORE", "Commodore"],
}
OFFICER_RANK_NAMES = [
    variant for variants in OFFICER_RANK_NAME_VARIANTS.values() for variant in variants
]

ALLOWED_PARENT_NODE_TYPES = {
    "hod": {"co"},
    "divisional_officer": {"hod", "divisional_officer"},
    "division": {"divisional_officer"},
    "sailor": {"division"},
}

MAX_OFFICER_CHAIN_DEPTH = 5


@extend_schema(tags=["Master"])
class UpdateEntryViewSet(viewsets.ModelViewSet):
    queryset = UpdateEntry.objects.order_by("-uploaded_date")
    serializer_class = UpdateEntrySerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), CanEditConfiguration()]
        return super().get_permissions()


@extend_schema(tags=["Master"])
class ShipRoleViewSet(viewsets.ModelViewSet):
    queryset = ShipRole.objects.order_by("-uploaded_date")
    serializer_class = ShipRoleSerializer
    permission_classes = [IsAuthenticated, CanEditConfiguration]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return super().get_permissions()

    def _replace_images(self, ship, images):
        for image in ship.images.all():
            if image.image and os.path.isfile(image.image.path):
                os.remove(image.image.path)
        ship.images.all().delete()

        for image in images:
            ShipRoleImage.objects.create(ship=ship, image=image)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ship = serializer.save()

        for image in request.FILES.getlist("images"):
            ShipRoleImage.objects.create(ship=ship, image=image)

        return Response(self.get_serializer(ship).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        ship = self.get_object()
        serializer = self.get_serializer(ship, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        ship = serializer.save()

        images = request.FILES.getlist("images")
        if images:
            self._replace_images(ship, images)

        return Response(self.get_serializer(ship).data)


@extend_schema(tags=["Master"])
class MemberDetailViewSet(viewsets.ModelViewSet):
    queryset = MemberDetail.objects.order_by("-uploaded_date")
    serializer_class = MemberDetailSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), CanEditConfiguration()]
        return super().get_permissions()

    def _save_image(self, instance, image):
        if image:
            instance.image_path = image
            instance.save(update_fields=["image_path"])

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = serializer.save()
        self._save_image(member, request.FILES.get("image"))
        return Response(
            self.get_serializer(member).data, status=status.HTTP_201_CREATED
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        member = self.get_object()
        serializer = self.get_serializer(member, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        member = serializer.save()
        self._save_image(member, request.FILES.get("image"))
        return Response(self.get_serializer(member).data)


@extend_schema(tags=["Master"])
class OrderDutyViewSet(viewsets.ModelViewSet):
    queryset = OrderDuty.objects.order_by("-uploaded_at")
    serializer_class = OrderDutySerializer

    def get_permissions(self):
        if self.action in ("list", "daily_orders"):
            return [AllowAny()]
        return super().get_permissions()

    @action(
        detail=False,
        methods=["get"],
        permission_classes=[AllowAny],
        url_path="daily-orders",
    )
    def daily_orders(self, request):
        queryset = self.get_queryset().filter(source__iexact="daily order")
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="duty-rosters")
    def duty_rosters(self, request):
        queryset = CustomUserProfile.objects.filter(is_ood=True).values(
            "firstname",
            "lastname",
            "designation_master__designation_name",
            "designation",
        )
        return Response(queryset)

    @action(
        detail=False,
        methods=["get"],
        url_path="routines",
        permission_classes=[AllowAny],
    )
    def get_routines(self, request):
        try:
            routines = [
                "Sunday Routines",
                "Normal Routines",
                "Make & Mend Routines",
                "Modified Routines",
            ]
            return Response({"routines": list(routines)})
        except Exception:
            return Response({"routines": []})

    @action(detail=False, methods=["post"], url_path="save-daily-order")
    def save_daily_order(self, request):
        data = request.data.copy()
        data["source"] = "daily order"
        data["from_date"] = parse_iso_date(data.get("date1") or data.get("date"))
        data["to_date"] = parse_iso_date(data.get("date2") or data.get("date"))
        data["date"] = parse_iso_date(data.get("date1") or data.get("date"))
        data["allocation_type"] = "SINGLE"

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        return Response(self.get_serializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="save-daily-orders")
    def save_daily_orders(self, request):
        import uuid

        try:
            allocations_json = request.data.get("allocations", "[]")
            allocations = json.loads(allocations_json)
        except (json.JSONDecodeError, ValueError):
            return Response(
                {"error": "allocations must be a valid JSON string"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(allocations, list) or not allocations:
            return Response(
                {"error": "allocations must be a non-empty array"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            batch_id = str(uuid.uuid4())
            with transaction.atomic():
                created_orders = []
                for allocation in allocations:
                    data = request.data.copy()
                    data["source"] = "daily order"
                    data["from_date"] = parse_iso_date(allocation.get("date"))
                    data["to_date"] = parse_iso_date(allocation.get("date"))
                    data["date"] = parse_iso_date(allocation.get("date"))
                    data["officer_details"] = allocation.get("officer_details")
                    data["routine_details"] = allocation.get("routine_details")
                    data["batch_id"] = batch_id
                    data["allocation_type"] = "MULTIPLE"

                    serializer = self.get_serializer(data=data)
                    serializer.is_valid(raise_exception=True)
                    order = serializer.save()
                    created_orders.append(order)

                return Response(
                    self.get_serializer(created_orders, many=True).data,
                    status=status.HTTP_201_CREATED,
                )
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


@extend_schema(tags=["Master"])
class MaintenanceNomenclatureAPIView(APIView):
    permission_classes = [IsAuthenticated, CanEditConfiguration]

    def _serialize_ops(self, item):
        return {
            "id": item.id,
            "type": "OPERATIONAL",
            "name": item.name,
            "maintenance_period": item.maintenance_period,
            "occasion": item.occasion,
            "start_date": item.start_date,
            "end_date": item.end_date,
        }

    def _serialize_refit(self, item):
        return {
            "id": item.id,
            "type": "REFIT",
            "name": item.name,
            "maintenance_period": item.maintenance_period,
            "occasion": item.occasion,
            "start_date": item.actual_start_date or item.plan_start_date,
            "end_date": item.actual_end_date or item.plan_end_date,
        }

    @extend_schema(responses={200: MaintenanceNomenclatureResponseSerializer})
    def get(self, request):
        data = [
            self._serialize_ops(item)
            for item in OpsMaintenancePeriod.objects.order_by("id")
        ]
        data.extend(
            self._serialize_refit(item)
            for item in RefitMaintenancePeriod.objects.order_by("id")
        )
        return Response({"status": "success", "maint_nomenclature": data})

    @extend_schema(
        request=MaintenanceNomenclatureSerializer,
        responses={201: MaintenanceNomenclatureSerializer},
    )
    def post(self, request):
        serializer = MaintenanceNomenclatureSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data["type"] == "OPERATIONAL":
            obj = OpsMaintenancePeriod.objects.create(
                name=data.get("name"),
                maintenance_period=data.get("maintenance_period"),
                occasion=data.get("occasion"),
                start_date=data.get("start_date"),
                end_date=data.get("end_date"),
            )
            return Response(self._serialize_ops(obj), status=status.HTTP_201_CREATED)

        obj = RefitMaintenancePeriod.objects.create(
            name=data.get("name"),
            maintenance_period=data.get("maintenance_period"),
            occasion=data.get("occasion"),
            actual_start_date=data.get("start_date"),
            actual_end_date=data.get("end_date"),
            plan_start_date=data.get("start_date"),
            plan_end_date=data.get("end_date"),
        )
        return Response(self._serialize_refit(obj), status=status.HTTP_201_CREATED)


@extend_schema(tags=["Master"])
class MaintenanceNomenclatureDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated, CanEditConfiguration]

    @extend_schema(
        request=MaintenanceNomenclatureDeleteSerializer,
        responses={200: GenericSuccessResponseSerializer},
    )
    def post(self, request):
        serializer = MaintenanceNomenclatureDeleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        model = (
            OpsMaintenancePeriod
            if data["type"] == "OPERATIONAL"
            else RefitMaintenancePeriod
        )
        model.objects.filter(id=data["id"]).delete()
        return Response(
            {"success": True, "message": "Maintenance nomenclature deleted"}
        )

    @action(detail=False, methods=["post"], url_path="save-duty-roster")
    def save_duty_roster(self, request):
        data = request.data.copy()
        data["source"] = "duty roster"
        data["date"] = parse_iso_date(data.get("date"))
        data["from_date"] = data["date"]
        data["to_date"] = data["date"]

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        return Response(self.get_serializer(order).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Master"])
class QuoteViewSet(viewsets.ModelViewSet):
    queryset = Quote.objects.order_by("-uploaded_date")
    serializer_class = QuoteSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), CanEditConfiguration()]
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        quote_text = request.data.get("quoteText") or request.data.get("quote_text")
        if not quote_text:
            return Response(
                {"status": "error", "message": "Missing fields"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quote = Quote.objects.create(quote_text=quote_text)
        return Response(
            {
                "status": "success",
                "id": quote.id,
                "quoteText": quote.quote_text,
                "addedDate": quote.uploaded_date.strftime("%Y-%m-%d"),
                # "is_active": quote.is_active,
                "active": quote.active,
            },
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        quote = self.get_object()
        quote_text = request.data.get("quoteText") or request.data.get("quote_text")
        if not quote_text:
            return Response(
                {"status": "error", "message": "Missing fields"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quote.quote_text = quote_text
        quote.save(update_fields=["quote_text"])
        return Response(
            {
                "status": "success",
                "id": quote.id,
                "quoteText": quote.quote_text,
                "addedDate": quote.uploaded_date.strftime("%Y-%m-%d"),
                # "is_active": quote.is_active,
                "active": quote.active,
            }
        )

    @action(detail=False, methods=["get"], url_path="daily")
    def daily(self, request):
        today = timezone.now().date()

        # active_quote = Quote.objects.filter(is_active=True).first()
        active_quote = Quote.objects.filter(active=True).first()
        if active_quote:
            return Response({"status": "success", "quote": active_quote.quote_text})

        today_quote = Quote.objects.filter(last_displayed_date=today).first()
        if today_quote:
            return Response({"status": "success", "quote": today_quote.quote_text})

        unseen_quotes = list(Quote.objects.filter(is_displayed=False))
        if not unseen_quotes:
            return Response(
                {"status": "done", "message": "All quotes have been displayed"}
            )

        quote = random.SystemRandom().choice(unseen_quotes)
        quote.is_displayed = True
        quote.last_displayed_date = today
        quote.save(update_fields=["is_displayed", "last_displayed_date"])
        return Response({"status": "success", "quote": quote.quote_text})

    @action(detail=True, methods=["post"], url_path="activate")
    def activate(self, request, pk=None):
        # Quote.objects.update(is_active=False)
        # quote = self.get_object()
        # quote.is_active = True
        # quote.save(update_fields=["is_active"])
        Quote.objects.update(active=False)
        quote = self.get_object()
        quote.active = True
        quote.save(update_fields=["active"])
        return Response({"status": "success"})

    @action(detail=False, methods=["post"], url_path="deactivate-all")
    def deactivate_all(self, request):
        # Quote.objects.update(is_active=False, is_displayed=False)
        Quote.objects.update(active=False, is_displayed=False)
        return Response({"status": "success"})


@extend_schema_view(
    list=extend_schema(tags=["Master"]),
    retrieve=extend_schema(tags=["Master"]),
    create=extend_schema(tags=["Master"]),
    update=extend_schema(tags=["Master"]),
    partial_update=extend_schema(tags=["Master"]),
    destroy=extend_schema(tags=["Master"]),
    marquee=extend_schema(tags=["Master"]),
)
class CoMessageViewSet(viewsets.ModelViewSet):
    queryset = CoMessage.objects.order_by("-uploaded_date")
    serializer_class = CoMessageSerializer
    permission_classes = [IsAuthenticated, CanManageCoMessages]

    def get_permissions(self):
        if self.action == "list":
            return [AllowAny()]
        return super().get_permissions()

    @action(
        detail=False, methods=["get"], permission_classes=[AllowAny], url_path="marquee"
    )
    def marquee(self, request):
        today = timezone.now().date()
        messages = CoMessage.objects.filter(valid_till_date__gte=today).order_by(
            "-uploaded_date"
        )
        data = [
            {
                "id": item.id,
                "message": item.message,
                "message_date": (
                    item.uploaded_date.strftime("%b %d, %Y")
                    if item.uploaded_date
                    else None
                ),
                "is_new": item.uploaded_date.date() == today,
            }
            for item in messages
        ]
        return Response(data)


@extend_schema_view(
    list=extend_schema(tags=["Master"]),
    retrieve=extend_schema(tags=["Master"]),
    create=extend_schema(tags=["Master"]),
    update=extend_schema(tags=["Master"]),
    partial_update=extend_schema(tags=["Master"]),
    destroy=extend_schema(tags=["Master"]),
    names=extend_schema(tags=["Master"]),
    available_users=extend_schema(tags=["Master"]),
    regulators_tree=extend_schema(tags=["Master"]),
    regulator_sailors=extend_schema(tags=["Master"]),
    tree=extend_schema(tags=["Master"]),
    nested=extend_schema(tags=["Master"]),
    toggle_sailor_regulator=extend_schema(tags=["Master"]),
    assign_regulator_bulk=extend_schema(tags=["Master"]),
)
class HierarchyForChartViewSet(viewsets.ModelViewSet):
    queryset = HierarchyForChart.objects.order_by("-date")
    serializer_class = HierarchyForChartSerializer
    permission_classes = [IsAuthenticated, HierarchyEditPermission]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return super().get_permissions()

    @action(
        detail=False, methods=["get"], permission_classes=[AllowAny], url_path="names"
    )
    def names(self, request):
        names = [
            {"id": node.id, "name": node.name}
            for node in HierarchyForChart.objects.order_by("date")
        ]
        return Response({"status": "success", "names": names})

    @action(
        detail=False,
        methods=["get"],
        permission_classes=[AllowAny],
        url_path="available_users",
    )
    def available_users(self, request):
        """List personnel not assigned to another hierarchy node.

        ``exclude_node_id`` keeps a node's current user selectable while that
        node is being edited.
        """
        exclude_node_id = request.query_params.get("exclude_node_id")
        assigned_nodes = HierarchyForChart.objects.exclude(user__isnull=True)
        if exclude_node_id:
            assigned_nodes = assigned_nodes.exclude(pk=exclude_node_id)

        assigned_user_ids = assigned_nodes.values_list("user_id", flat=True)
        users = (
            CustomUserProfile.objects.filter(user_active=True, is_role=False)
            .exclude(pk__in=assigned_user_ids)
            .select_related("rank", "designation_master")
            .order_by("firstname", "lastname", "personal_number")
        )

        return Response(
            {
                "status": "success",
                "users": [
                    {
                        "id": user.id,
                        "name": " ".join(
                            part for part in (user.firstname, user.lastname) if part
                        ).strip()
                        or user.personal_number,
                        "rank": user.rank.name if user.rank_id else "",
                        "designation": user.designation
                        or (
                            user.designation_master.designation_name
                            if user.designation_master_id
                            else ""
                        ),
                        "personal_number": user.personal_number,
                        "photo": "",
                    }
                    for user in users
                ],
            }
        )

    @action(
        detail=False,
        methods=["get"],
        permission_classes=[IsAuthenticated],
        url_path="regulators_tree",
    )
    def regulators_tree(self, request):
        departments_data = []

        departments = Department.objects.all()

        for dept in departments:
            subdepartments_data = []

            # Department ke subdepartments
            subdepartments = SubDepartment.objects.filter(department_name=dept)

            for subdept in subdepartments:
                regulators = []

                # Is subdepartment ke regulators
                regulator_nodes = (
                    HierarchyForChart.objects.filter(
                        is_regulator=True, user__department=dept,user__executive_sub_department=subdept
                    )
                    .select_related("user", "user__rank")
                    .prefetch_related("assigned_sailors")
                )

                for node in regulator_nodes:
                    assigned_count = node.assigned_sailors.count()

                    regulator_data = {
                        "id": node.id,
                        "name": node.name,
                        "rank": (
                            node.user.rank.name
                            if node.user and node.user.rank
                            else None
                        ),
                        "designation": (node.user.designation if node.user else None),
                        "assignedCount": assigned_count,
                        "photo": (
                        request.build_absolute_uri(node.photo.url)
                        if node.photo
                        else ""
                    ),
                    }

                    regulators.append(regulator_data)

                if regulators:
                    subdepartments_data.append(
                        {
                            "id": subdept.id,
                            "subdep_name": subdept.name,
                            "regulators": regulators,
                        }
                    )

            departments_data.append(
                {
                    "id": dept.id,
                    "dep_name": dept.name,
                    "subdepartments": subdepartments_data,
                    
                }
            )

        return Response(
            {
                "status": "success",
                "departments": departments_data,
            }
        )

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="regulator_id",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                required=True,
            ),
        ]
    )
    @action(
        detail=False,
        methods=["get"],
        permission_classes=[AllowAny],
        url_path="regulator_sailors",
    )
    def regulator_sailors(self, request):
        regulator_id = request.query_params.get("regulator_id")
        if not regulator_id:
            return Response(
                {"status": "error", "message": "regulator_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            regulator = HierarchyForChart.objects.select_related(
                "user", "user__rank"
            ).get(id=int(regulator_id))
        except (HierarchyForChart.DoesNotExist, ValueError):
            return Response(
                {"status": "error", "message": "Regulator not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Get assigned sailors
        assigned_sailors = regulator.assigned_sailors.all().select_related(
            "user", "user__rank"
        )
        assigned_data = [
            {
                "id": sailor.id,
                "name": sailor.name,
                "rank": sailor.user.rank.name
                if sailor.user and sailor.user.rank
                else None,
                "designation": sailor.user.designation if sailor.user else None,
                "personalNumber": sailor.user.personal_number if sailor.user else None,
            }
            for sailor in assigned_sailors
        ]

        # Get unassigned sailors (sailors not assigned to any regulator)
        unassigned_sailors = HierarchyForChart.objects.filter(
            node_type="sailor", assigned_regulator__isnull=True
        ).select_related("user", "user__rank")

        unassigned_data = [
            {
                "id": sailor.id,
                "name": sailor.name,
                "rank": sailor.user.rank.name
                if sailor.user and sailor.user.rank
                else None,
                "designation": sailor.user.designation if sailor.user else None,
                "personalNumber": sailor.user.personal_number if sailor.user else None,
            }
            for sailor in unassigned_sailors
        ]

        return Response(
            {
                "status": "success",
                "regulator": {
                    "id": regulator.id,
                    "name": regulator.name,
                },
                "assigned": assigned_data,
                "unassigned": unassigned_data,
            }
        )

    @action(
        detail=False, methods=["get"], permission_classes=[AllowAny], url_path="tree"
    )
    def tree(self, request):
        entries = HierarchyForChart.objects.order_by("date")
        data = [
            {
                "id": entry.id,
                "name": entry.name,
                "designation": entry.designation,
                "rank": entry.rank,
                "personal_number": entry.personal_number,
                "photo_url": entry.photo.url if entry.photo else "",
                "parent_id": entry.parent_id,
            }
            for entry in entries
        ]
        return Response({"status": "success", "ship_hierarchy": data})

    @action(
        detail=False,
        methods=["get"],
        permission_classes=[IsAuthenticated],
        url_path="nested",
    )
    def nested(self, request):
        context = {}
        co_users = CustomUserProfile.objects.filter(rank__name__in=OFFICER_RANK_NAMES)
        hod_users = CustomUserProfile.objects.filter(rank__name__in=OFFICER_RANK_NAMES)
        divisional_officer_users = CustomUserProfile.objects.filter(
            rank__name__in=OFFICER_RANK_NAMES
        )
        division_users = CustomUserProfile.objects.filter(rank__name__in=["Cdr"])
        sailor_users = (
            CustomUserProfile.objects.filter(user_active=True)
            .exclude(rank__name__in=OFFICER_RANK_NAMES)
            .order_by("firstname", "lastname")
        )

        def serialize_users(users):
            return [
                {
                    "id": user.id,
                    "name": f"{user.firstname} {user.lastname}".strip(),
                    "rank": user.rank.name if user.rank else "",
                    "designation": user.designation or "",
                    "personal_number": user.personal_number or "",
                }
                for user in users
            ]

        context["co_users_json"] = json.dumps(serialize_users(co_users))
        context["hod_users_json"] = json.dumps(serialize_users(hod_users))
        context["divisional_officer_users_json"] = json.dumps(
            serialize_users(divisional_officer_users)
        )
        context["division_users_json"] = json.dumps(serialize_users(division_users))
        context["sailor_users_json"] = json.dumps(serialize_users(sailor_users))
        hierarchy_scope = rbac.hierarchy_edit_scope(request.user)
        context["edit_access"] = hierarchy_scope.mode != rbac.HIERARCHY_SCOPE_NONE
        context["can_add_co"] = hierarchy_scope.mode == rbac.HIERARCHY_SCOPE_ALL

        context["hierarchy_scope_json"] = json.dumps(
            {
                "mode": hierarchy_scope.mode,
                "editable": sorted(hierarchy_scope.editable)
                if hierarchy_scope.editable is not None
                else None,
                "addable": sorted(hierarchy_scope.addable)
                if hierarchy_scope.addable is not None
                else None,
            }
        )

        nodes = list(HierarchyForChart.objects.order_by("id"))
        node_map = {
            node.id: {
                "dbId": node.id,
                "type": node.node_type,
                "name": node.name,
                "rank": node.rank or "",
                "designation": node.designation or "",
                "personalNumber": node.personal_number or "",
                "photoUrl": node.photo.url if node.photo else None,
                "divisionName": node.division_name or "",
                "isRegulator": node.is_regulator,
                "isDepartmentOfficer": node.is_departmental_officer,
                "additionalDuty": node.user.additional_duty if node.user else None,
                "children": [],
            }
            for node in nodes
        }

        root = None
        for node in nodes:
            if node.parent_id and node.parent_id in node_map:
                node_map[node.parent_id]["children"].append(node_map[node.id])
            elif node.is_commander_officer:
                root = node_map[node.id]

        return Response({"status": "success", "hierarchy": root, "context": context})

    @extend_schema(
        tags=["Hierarchy"],
        request=ToggleSailorRegulatorSerializer,
    )
    @action(detail=False, methods=["post"], url_path="toggle_sailor_regulator")
    def toggle_sailor_regulator(self, request):
        sailor_id = request.data.get("id")
        is_reg = request.data.get("is_reg")

        scope = rbac.hierarchy_edit_scope(request.user)
        if not rbac.can_edit_hierarchy_node(request.user, sailor_id, scope):
            return Response(
                {"status": "error", "message": "Not permitted."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            node = HierarchyForChart.objects.get(id=sailor_id, node_type="sailor")
        except HierarchyForChart.DoesNotExist:
            return Response(
                {"status": "error", "message": "Sailor not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        node.is_regulator = bool(is_reg)
        node.save(update_fields=["is_regulator"])
        return Response({"status": "success", "is_regulator": node.is_regulator})

    @action(detail=False, methods=["post"], url_path="assign_regulator_bulk")
    def assign_regulator_bulk(self, request):
        regulator_id = request.data.get("regulator_id")
        sailor_ids = request.data.get("sailor_ids") or []

        if not regulator_id:
            return Response(
                {"success": False, "error": "Regulator ID required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        scope = rbac.hierarchy_edit_scope(request.user)
        out_of_scope = [
            sid
            for sid in [regulator_id, *sailor_ids]
            if not rbac.can_edit_hierarchy_node(request.user, sid, scope)
        ]
        if out_of_scope:
            return Response(
                {"success": False, "error": "Not permitted."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            regulator = HierarchyForChart.objects.select_related(
                "user__department"
            ).get(
                id=regulator_id,
                is_regulator=True,
            )
        except HierarchyForChart.DoesNotExist:
            return Response(
                {"success": False, "error": "Regulator not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        department = getattr(regulator.user, "department", None)
        HierarchyForChart.objects.filter(assigned_regulator=regulator).update(
            assigned_regulator=None
        )

        if sailor_ids:
            queryset = HierarchyForChart.objects.filter(id__in=sailor_ids)
            if department is not None:
                queryset = queryset.filter(user__department=department)
            queryset.update(assigned_regulator=regulator)

        return Response({"success": True, "assigned_count": len(sailor_ids)})

    @action(
        detail=False,
        methods=["post"],
        url_path="add_sailors_bulk",
        permission_classes=[IsAuthenticated],
    )
    def add_sailors_bulk(self, request):
        """Bulk add multiple sailors to a division in a single API call."""
        division_id = request.data.get("division_id")
        user_ids = request.data.get("user_ids") or []
        photo = request.FILES.get("photo")

        if not division_id:
            return Response(
                {"status": "error", "message": "Division ID required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not user_ids:
            return Response(
                {"status": "error", "message": "User IDs required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            division = HierarchyForChart.objects.get(
                id=division_id, node_type="division"
            )
        except HierarchyForChart.DoesNotExist:
            return Response(
                {"status": "error", "message": "Division not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        created_count = 0
        try:
            with transaction.atomic():
                for user_id in user_ids:
                    try:
                        user = CustomUserProfile.objects.get(id=user_id)
                        HierarchyForChart.objects.create(
                            user=user,
                            node_type="sailor",
                            parent=division,
                            is_commander_officer=False,
                            photo=photo,
                        )
                        created_count += 1
                    except CustomUserProfile.DoesNotExist:
                        continue
        except Exception as e:
            return Response(
                {"status": "error", "message": f"Failed to add sailors: {e!s}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "status": "success",
                "created_count": created_count,
                "requested_count": len(user_ids),
            }
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="save-ship-hierarchy",
        permission_classes=[IsAuthenticated],
    )
    @transaction.atomic
    def save_ship_hierarchy(self, request):
        """
        POST /api/v1/ship-hierarchy/save-ship-hierarchy/

        Creates or updates a ship hierarchy node.
        """

        data = request.data

        node_type = data.get("node_type", "co")
        division_name = (data.get("division_name") or "").strip()
        is_regulator = data.get("is_regulator") == "1"
        user_id = data.get("user_id")
        parent_id = data.get("parent")
        is_commander_officer = data.get("is_commander_officer") == "1"
        photo = request.FILES.get("photo")
        remove_photo = data.get("remove_photo") == "1"
        node_db_id = data.get("node_db_id")

        designation = (data.get("designation") or "").strip()
        additional_duty = (data.get("additional_duty") or "").strip()
        is_departmental_officer = data.get("is_departmental_officer") == "1"

        # ---------------------------------------------------------
        # Branch-scoped authorization
        # ---------------------------------------------------------
        scope = rbac.hierarchy_edit_scope(request.user)

        if scope.mode == rbac.HIERARCHY_SCOPE_BRANCH:
            # CO/HOD changes remain whole-ship decisions.
            if node_type in ("co", "hod") or is_commander_officer:
                return Response(
                    {
                        "status": "error",
                        "message": (
                            "You may only change nodes within your own department."
                        ),
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            # Validate target parent.
            if not rbac.can_add_hierarchy_child(
                request.user,
                parent_id,
                scope=scope,
            ):
                return Response(
                    {
                        "status": "error",
                        "message": (
                            "You may only add nodes under your own department."
                        ),
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            # Validate existing node.
            if node_db_id and not rbac.can_edit_hierarchy_node(
                request.user,
                node_db_id,
                scope=scope,
            ):
                return Response(
                    {
                        "status": "error",
                        "message": (
                            "You may only edit nodes within your own department."
                        ),
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            # Prevent modifying another department's profile.
            if (designation or additional_duty) and user_id:
                actor_department = rbac.department_of(request.user)
                actor_department_id = getattr(
                    actor_department,
                    "id",
                    None,
                )

                profile_exists = CustomUserProfile.objects.filter(
                    id=user_id,
                    department_id=actor_department_id,
                ).exists()

                if not profile_exists:
                    designation = ""
                    additional_duty = ""

        # ---------------------------------------------------------
        # Resolve user
        # ---------------------------------------------------------
        user_obj = None

        if node_type != "division":
            if not user_id:
                return Response(
                    {
                        "status": "error",
                        "message": "User is required",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                user_obj = CustomUserProfile.objects.get(id=user_id)
            except CustomUserProfile.DoesNotExist:
                return Response(
                    {
                        "status": "error",
                        "message": "User not found",
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            # -----------------------------------------------------
            # Update profile fields
            # -----------------------------------------------------
            profile_updates = []

            if node_type in (
                "co",
                "hod",
                "divisional_officer",
            ):
                if designation and user_obj.designation != designation:
                    user_obj.designation = designation
                    profile_updates.append("designation")

                if (
                    additional_duty
                    and (user_obj.additional_duty or "") != additional_duty
                ):
                    user_obj.additional_duty = additional_duty
                    profile_updates.append("additional_duty")

            if profile_updates:
                user_obj.save(update_fields=profile_updates)

        # ---------------------------------------------------------
        # Node type validation
        # ---------------------------------------------------------
        if node_type == "division":
            if not division_name:
                return Response(
                    {
                        "status": "error",
                        "message": "Division name is required",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        elif node_type == "sailor":
            if not user_obj:
                return Response(
                    {
                        "status": "error",
                        "message": ("User is required for sailor"),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        elif node_type in (
            "co",
            "hod",
            "divisional_officer",
        ):
            if not user_obj:
                return Response(
                    {
                        "status": "error",
                        "message": "User is required",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # ---------------------------------------------------------
        # Commander officer validation
        # ---------------------------------------------------------
        commander_exists = (
            HierarchyForChart.objects.filter(is_commander_officer=True)
            .exclude(id=node_db_id)
            .exists()
        )

        if not commander_exists and not is_commander_officer and node_type == "co":
            return Response(
                {
                    "status": "confirm",
                    "message": (
                        "No commander officer exists yet. "
                        "Do you want to add this as the "
                        "commander officer?"
                    ),
                },
                status=status.HTTP_200_OK,
            )

        if commander_exists and is_commander_officer:
            return Response(
                {
                    "status": "error",
                    "message": (
                        "Commander officer already exists. "
                        "You must select a parent instead."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ---------------------------------------------------------
        # Parent validation
        # ---------------------------------------------------------
        if node_type != "co" and not is_commander_officer and not parent_id:
            return Response(
                {
                    "status": "error",
                    "message": ("Non-commander officers must have a parent."),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        parent_obj = None

        if parent_id:
            try:
                parent_obj = HierarchyForChart.objects.get(id=parent_id)
            except HierarchyForChart.DoesNotExist:
                return Response(
                    {
                        "status": "error",
                        "message": "Parent does not exist",
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

        # ---------------------------------------------------------
        # Parent/node type validation
        # ---------------------------------------------------------
        if parent_obj is not None and node_type in ALLOWED_PARENT_NODE_TYPES:
            allowed_parents = ALLOWED_PARENT_NODE_TYPES[node_type]

            if parent_obj.node_type not in allowed_parents:
                return Response(
                    {
                        "status": "error",
                        "message": (
                            "A '%s' node cannot be placed under "
                            "a '%s' node."
                            % (
                                node_type,
                                parent_obj.node_type,
                            )
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # ---------------------------------------------------------
        # Divisional officer chain depth
        # ---------------------------------------------------------
        if node_type == "divisional_officer":
            existing_parent_id = None

            if node_db_id:
                existing_parent_id = (
                    HierarchyForChart.objects.filter(id=node_db_id)
                    .values_list("parent_id", flat=True)
                    .first()
                )

            new_parent_id = parent_obj.id if parent_obj else None

            # Only validate when creating or moving.
            if not node_db_id or existing_parent_id != new_parent_id:
                officer_levels = 0
                walker = parent_obj
                steps = 0

                while (
                    walker is not None
                    and walker.node_type == "divisional_officer"
                    and steps < 60
                ):
                    officer_levels += 1
                    walker = walker.parent
                    steps += 1

                if officer_levels >= MAX_OFFICER_CHAIN_DEPTH:
                    return Response(
                        {
                            "status": "error",
                            "message": (
                                "A Divisional Officer chain "
                                "may not go more than %d levels "
                                "below the Head of Department."
                                % MAX_OFFICER_CHAIN_DEPTH
                            ),
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        # ---------------------------------------------------------
        # Departmental officer validation
        # ---------------------------------------------------------
        if is_departmental_officer:
            if (
                node_type != "divisional_officer"
                or parent_obj is None
                or parent_obj.node_type != "hod"
            ):
                return Response(
                    {
                        "status": "error",
                        "message": (
                            "Only a Divisional Officer placed "
                            "directly under a Head of Department "
                            "may be tagged as the Departmental "
                            "Officer."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            hod_department = parent_obj.user.department if parent_obj.user_id else None

            hod_department_name = (
                (getattr(hod_department, "name", "") or "").strip().upper()
            )

            # EXECUTIVE can have multiple Dy HODs,
            # one for each sub-department.
            if hod_department_name != rbac.EXECUTIVE_DEPARTMENT:
                already_tagged = (
                    HierarchyForChart.objects.filter(
                        parent=parent_obj,
                        node_type="divisional_officer",
                        is_departmental_officer=True,
                    )
                    .exclude(id=node_db_id)
                    .exists()
                )

                if already_tagged:
                    return Response(
                        {
                            "status": "error",
                            "message": (
                                "This department already has "
                                "a Departmental Officer. "
                                "Untag the existing one first."
                            ),
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        # ---------------------------------------------------------
        # Update or create hierarchy node
        # ---------------------------------------------------------
        if node_db_id:
            try:
                ship_obj = HierarchyForChart.objects.get(id=node_db_id)
            except HierarchyForChart.DoesNotExist:
                return Response(
                    {
                        "status": "error",
                        "message": "Node not found",
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

            ship_obj.user = user_obj
            ship_obj.node_type = node_type
            ship_obj.division_name = division_name
            ship_obj.is_regulator = is_regulator
            ship_obj.parent = parent_obj
            ship_obj.is_commander_officer = is_commander_officer
            ship_obj.is_departmental_officer = is_departmental_officer

            if photo:
                ship_obj.photo = photo
            elif remove_photo:
                ship_obj.photo = None

            ship_obj.save()

        else:
            ship_obj = HierarchyForChart.objects.create(
                user=user_obj,
                parent=parent_obj,
                node_type=node_type,
                division_name=division_name,
                is_regulator=is_regulator,
                is_commander_officer=is_commander_officer,
                is_departmental_officer=(is_departmental_officer),
                photo=photo,
                date=timezone.now(),
            )

        # ---------------------------------------------------------
        # Response
        # ---------------------------------------------------------
        return Response(
            {
                "status": "success",
                "id": ship_obj.id,
                "name": ship_obj.name,
                "rank": ship_obj.rank,
                "designation": ship_obj.designation,
                "personal_number": ship_obj.personal_number,
                "additional_duty": (
                    ship_obj.user.additional_duty if ship_obj.user else ""
                ),
                "photo_url": (ship_obj.photo.url if ship_obj.photo else ""),
                "parent": (ship_obj.parent.name if ship_obj.parent else ""),
                "is_commander_officer": (ship_obj.is_commander_officer),
                "is_departmental_officer": (ship_obj.is_departmental_officer),
                "is_regulator": ship_obj.is_regulator,
                "date": (
                    ship_obj.date.strftime("%Y-%m-%d %H:%M:%S") if ship_obj.date else ""
                ),
                "node_type": ship_obj.node_type,
                "division_name": ship_obj.division_name,
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["Master"])
class RegulatorListAPIView(APIView):
    """Regulator hierarchy data for the Know Your Regulator page: sailors,
    regulators (each with a resolved department), the fixed department /
    EXECUTIVE-sub-department structure, the rank list, and edit access."""

    permission_classes = (IsAuthenticated,)

    _MAX_ANCESTRY_HOPS = 20

    def get(self, request):
        data = list(
            HierarchyForChart.objects.select_related(
                "user",
                "user__department",
                "user__rank",
                "assigned_regulator",
                "assigned_regulator__user",
            ).values(
                "id",
                "user_id",
                "is_regulator",
                "division_name",
                "node_type",
                "parent_id",
                "user__firstname",
                "user__lastname",
                "user__rank__name",
                "user__designation",
                "user__personal_number",
                "user__department__id",
                "user__executive_sub_department",
                "parent__division_name",
                "assigned_regulator_id",
                "assigned_regulator__user__firstname",
                "assigned_regulator__user__lastname",
                "photo",
                "user__rank__id",
                "user__department__name",
            )
        )

        sailors = [
            d
            for d in data
            if not d["is_regulator"]
            and d["node_type"] == "sailor"
            and d["user_id"] is not None
        ]
        regulators = [d for d in data if d["is_regulator"]]

        regulator_list = [
            {
                "id": r["id"],
                "name": (
                    f"{r['user__firstname'] or ''} {r['user__lastname'] or ''}"
                ).strip(),
                "firstname": r.get("user__firstname") or "",
                "lastname": r.get("user__lastname") or "",
                "department_id": r["user__department__id"],
                "user_id": r["user_id"],
                "division_name": r.get("parent__division_name") or "",
                "executive_sub_department": r.get("user__executive_sub_department")
                or "",
                "rank": r.get("user__rank__name") or "",
                "rank_id": r.get("user__rank__id") or "",
                "personal_number": r.get("user__personal_number") or "",
                "designation": r.get("user__designation") or "",
                "department_name": r.get("user__department__name") or "",
                "photo_url": self._regulator_photo_url(r.get("photo")),
            }
            for r in regulators
        ]

        # A regulator whose own profile carries no department would otherwise match
        # no department card at all. Fall back to the nearest ancestor node on the
        # chart that does have one -- links a sailor tagged under a HOD-created
        # division back to that HOD's department. parent_id is a nullable
        # self-FK with no cycle constraint, hence the hop cap alongside the
        # seen-set guard.
        node_parent = {d["id"]: d["parent_id"] for d in data}
        node_department = {
            d["id"]: (
                d["user__department__id"],
                (d["user__department__name"] or "").strip(),
            )
            for d in data
        }

        raw_regulators = {r["id"]: r for r in regulators}
        for entry in regulator_list:
            raw = raw_regulators.get(entry["id"], {})
            resolved_id, resolved_name, source = self._resolve_department(
                node_parent,
                node_department,
                entry["id"],
                raw.get("user__department__id"),
                (raw.get("user__department__name") or "").strip(),
            )
            entry["resolved_department_id"] = resolved_id
            entry["resolved_department_name"] = resolved_name
            # "profile", "ancestry" or "none" -- so a data gap is visible to the
            # caller rather than guessed at or silently dropped.
            entry["department_source"] = source
            entry["executive_sub_department_key"] = (
                (entry.get("executive_sub_department") or "").strip().upper()
            )

        regulator_list.sort(
            key=lambda e: (
                self._sort_key(e.get("resolved_department_name")),
                self._sort_key(e.get("executive_sub_department_key")),
                self._sort_key(e.get("designation")),
                self._sort_key(e.get("name")),
            )
        )

        # The department / sub-department tree is fixed and server-supplied so it
        # renders in full even with zero regulator rows. selectable_departments()
        # already excludes the retired HULL/NBCD top-level rows.
        executive_name = rbac.EXECUTIVE_DEPARTMENT.strip().upper()
        executive_subs = [
            {"name": sub, "key": sub.strip().upper()}
            for sub in rbac.EXECUTIVE_SUB_DEPARTMENTS
        ]
        structure = []
        for dept in rbac.selectable_departments():
            dept_name = (dept.name or "").strip()
            # MET carries no regulator slot by default; added manually via Edit
            # Mode if the ship ever needs one.
            if dept_name.upper() == "MET":
                continue
            structure.append(
                {
                    "id": dept.id,
                    "name": dept_name,
                    "sub_departments": (
                        executive_subs if dept_name.upper() == executive_name else []
                    ),
                }
            )

        for s in sailors:
            s["regulator_id"] = s.get("assigned_regulator_id")
            if s.get("assigned_regulator__user__firstname"):
                s["regulator_name"] = (
                    f"{s['assigned_regulator__user__firstname']} "
                    f"{s['assigned_regulator__user__lastname'] or ''}"
                ).strip()
            else:
                s["regulator_name"] = None

        # Narrower than can_edit_configuration (which also admits the EXECUTIVE
        # HOD) -- deliberately just SHIPADMIN plus the application admin here.
        edit_access = rbac.is_ship_admin_role(request.user) or rbac.is_app_admin_role(
            request.user
        )
        rank_list = [
            {"id": rk.id, "name": rk.name} for rk in Rank.objects.all().order_by("name")
        ]

        return Response(
            {
                "sailors": sailors,
                "regulators": regulator_list,
                "ranks": rank_list,
                "structure": structure,
                "edit_access": edit_access,
            }
        )

    @staticmethod
    def _regulator_photo_url(stored_name):
        if not stored_name:
            return ""
        return f"{settings.MEDIA_URL}{stored_name}"

    def _resolve_department(
        self, node_parent, node_department, node_id, own_id, own_name
    ):
        if own_id:
            return own_id, own_name, "profile"
        seen = set()
        current = node_parent.get(node_id)
        hops = 0
        while (
            current is not None
            and hops < self._MAX_ANCESTRY_HOPS
            and current not in seen
        ):
            seen.add(current)
            dept_id, dept_name = node_department.get(current, (None, ""))
            if dept_id:
                return dept_id, dept_name, "ancestry"
            current = node_parent.get(current)
            hops += 1
        return None, "", "none"

    @staticmethod
    def _sort_key(value):
        text = (value or "").strip().upper()
        return (1, "") if not text else (0, text)


@extend_schema(tags=["Master"])
class ImportExcelFileView(APIView):
    def post(self, request):
        excel_file = request.FILES.get("excel_file")
        if not excel_file:
            return Response(
                {"detail": "Excel file is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        save_path = save_file_to_temp(excel_file)
        return Response(
            {"detail": f"File saved to {save_path}"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(
    tags=["Master"],
    description="App-identity strings (version, copyright text) shown in the shared footer "
    "(Footer component, frontend) — both the pre-login landing page and every authenticated "
    "page read this. AllowAny since the pre-login page needs it before any auth token exists. "
    "Reads the one AppInfo row with active=True (also editable via Django admin); falls back "
    "to settings.APP_VERSION/APP_COPYRIGHT_TEXT if no such row exists yet (fresh DB).",
)
class AppInfoAPIView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        info = AppInfo.objects.filter(active=True).order_by("-created_at").first()
        return Response(
            {
                "version": info.version if info else settings.APP_VERSION,
                "copyright_text": info.copyright_text if info else settings.APP_COPYRIGHT_TEXT,
            }
        )


@extend_schema(
    tags=["Master"],
    responses=ShipKnowYourShipSerializer,
)
class KnowYourShipAPIView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request, ship_external_id=None):
        if ship_external_id is not None:
            ship = Ship.objects.filter(ship_external_id=ship_external_id).first()
        else:
            ship = get_this_ship()

        if not ship:
            return Response(
                {"message": "Ship not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ShipKnowYourShipSerializer(
            ship,
            context={"request": request},
        )

        return Response(serializer.data)


# Developed with Understanding: "INS " plus the name, unless the name already starts with
# INS followed by a space or the end (case-insensitive), so nothing reads "INS INS".
# Whitespace is stripped and an empty name stays "".
def ins_display_name(name):
    name = " ".join((name or "").split())
    if not name:
        return ""
    head = name[:3].upper()
    if head == "INS" and (len(name) == 3 or name[3] == " "):
        return name
    return f"INS {name}"


# Developed with Understanding: GET this-ship/ - the ship name shown everywhere (landing
# hero, login popup, ship modal, sidebar badge). AllowAny, the same exposure as
# know-your-ship. It answers from Master_unit hrcdf_ship_name only (Step 1 of the Sync
# HRCDF page, D23) - no CMMS fallback. display_name is "INS " plus that name, or "" with
# is_set False while Step 1 has not run. Read only - the Master_unit row is never created here.
@extend_schema(
    tags=["Master"],
    responses=inline_serializer(
        name="ThisShipResponse",
        fields={
            "hrcdf_ship_name": drf_serializers.CharField(),
            "display_name": drf_serializers.CharField(),
            "is_set": drf_serializers.BooleanField(),
        },
    ),
)
class ThisShipAPIView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        this_ship = Unit.objects.order_by("id").first()
        hrcdf_ship_name = (getattr(this_ship, "hrcdf_ship_name", "") or "").strip()
        return Response(
            {
                "hrcdf_ship_name": hrcdf_ship_name,
                "display_name": ins_display_name(hrcdf_ship_name),
                "is_set": bool(hrcdf_ship_name),
            }
        )


@extend_schema(tags=["Master"])
class ExportRoutineExcelAPIView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        department_id = getattr(
            getattr(request.user, "department", None),
            "id",
            None,
        )

        dispatch = dispatch_task(
            export_routine_excel_task,
            department_id,
        )

        if dispatch["queued"]:
            return accepted_task_response(
                request,
                dispatch["task"],
                "Routine Excel export queued for background processing.",
            )

        return sync_task_response(
            dispatch["result"],
            (
                "Background task service unavailable. "
                "Routine Excel export completed synchronously."
            ),
        )


# ─────────────────────────────────────────────────────────────
# CMMS Refit Integration Views
# ─────────────────────────────────────────────────────────────


@extend_schema(tags=["Master"])
class RefitPayloadView(APIView):
    """Return an empty refit sync payload."""

    def get(self, request):
        serializer = RefitSyncPayloadResponseSerializer(data={})
        serializer.is_valid()
        return Response(serializer.data)


@extend_schema(tags=["Master"])
class RefitCompletionsView(APIView):
    """Return an empty refit completions list or validate refit completion."""

    def get(self, request):
        return Response([])

    def post(self, request):
        """Validate a refit maintenance period payload and return a derived ID."""
        serializer = RefitCompletionCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        resp_data = {
            "id": 0,
            "Universal_ID_T_RefComp": f"U-RC-{timezone.now().date().isoformat()}-{serializer.validated_data.get('ship_code')}",
        }
        resp_serializer = RefitCompletionResponseSerializer(data=resp_data)
        resp_serializer.is_valid()
        return Response(resp_serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Master"])
class RefitDelinquencyView(APIView):
    """Validate a delinquency detail payload and acknowledge receipt."""

    def post(self, request, uid):
        serializer = RefitDelinquencyCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        resp_serializer = GenericSuccessResponseSerializer(
            data={
                "success": True,
                "message": "Delinquency payload validated successfully.",
                "data": {
                    "refit_uid": uid,
                    "delinquency_code": serializer.validated_data.get(
                        "delinquency_code"
                    ),
                },
            }
        )
        resp_serializer.is_valid()
        return Response(resp_serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Master"])
class RefitDryDockView(APIView):
    """Validate a drydocking payload and acknowledge receipt."""

    def post(self, request, uid):
        serializer = RefitDryDockingCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        resp_serializer = GenericSuccessResponseSerializer(
            data={
                "success": True,
                "message": "Drydocking payload validated successfully.",
                "data": {
                    "refit_uid": uid,
                    "dock_entry_date": serializer.validated_data.get("dock_entry_date"),
                },
            }
        )
        resp_serializer.is_valid()
        return Response(resp_serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Master"])
class RefitOcrView(APIView):
    """Validate an OCR payload and acknowledge receipt."""

    def post(self, request, uid):
        serializer = RefitOCRCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        resp_serializer = GenericSuccessResponseSerializer(
            data={
                "success": True,
                "message": "OCR payload validated successfully.",
                "data": {
                    "refit_uid": uid,
                    "report_ref_no": serializer.validated_data.get("report_ref_no"),
                },
            }
        )
        resp_serializer.is_valid()
        return Response(resp_serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["Master"])
class DepartmentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = DepartmentSerializer
    queryset = rbac.selectable_departments()


class CreateRegulatorAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Master"],
        request=CreateRegulatorSerializer,
    )
    def post(self, request, *args, **kwargs):

        data = request.data

        firstname = (data.get("firstname") or "").strip()

        if not firstname:
            return Response(
                {
                    "status": "error",
                    "message": "A first name is required.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        department = None
        department_id = data.get("department_id")

        if department_id not in (None, "", "null"):
            try:
                department = Department.objects.get(id=department_id)

            except (Department.DoesNotExist, ValueError, TypeError):
                return Response(
                    {
                        "status": "error",
                        "message": "That department does not exist.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        sub_department = ""

        posted_sub = (data.get("executive_sub_department") or "").strip()

        if posted_sub:
            sub_department = next(
                (
                    name
                    for name in rbac.EXECUTIVE_SUB_DEPARTMENTS
                    if name.strip().upper() == posted_sub.upper()
                ),
                None,
            )

            if sub_department is None:
                allowed = ", ".join(name for name in rbac.EXECUTIVE_SUB_DEPARTMENTS)

                return Response(
                    {
                        "status": "error",
                        "message": (
                            f"'{posted_sub}' is not an EXECUTIVE "
                            f"sub-department. Allowed: {allowed}."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        rank = None
        rank_id = data.get("rank_id")

        if rank_id:
            try:
                rank = Rank.objects.get(id=rank_id)

            except (Rank.DoesNotExist, ValueError, TypeError):
                return Response(
                    {
                        "status": "error",
                        "message": "Unknown rank",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        personal_number = (data.get("personal_number") or "").strip()

        if len(personal_number) > 15:
            return Response(
                {
                    "status": "error",
                    "message": ("Personal number cannot be longer than 15 characters."),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = CustomUserProfile(
            firstname=firstname,
            lastname=(data.get("lastname") or "").strip(),
            designation=(data.get("designation") or "").strip(),
            personal_number=personal_number,
            rank=rank,
            department=department,
            executive_sub_department=sub_department,
            has_credentials=False,
        )

        try:
            profile.save()

        except Exception as exc:
            return Response(
                {
                    "status": "error",
                    "message": f"Could not create this person. {exc}",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        node = HierarchyForChart.objects.create(
            user=profile,
            node_type="sailor",
            is_regulator=True,
            parent=None,
            is_commander_officer=False,
        )

        return Response(
            {
                "status": "success",
                "id": node.id,
                "name": (f"{profile.firstname} {profile.lastname}").strip(),
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema(
    tags=["Master"],
    request={
        "multipart/form-data": {
            "type": "object",
            "properties": {
                "node_db_id": {
                    "type": "integer",
                },
                "photo": {
                    "type": "string",
                    "format": "binary",
                },
                "remove_photo": {
                    "type": "string",
                    "example": "0",
                },
            },
            "required": ["node_db_id"],
        }
    },
)
class UpdateRegulatorPhotoAPIView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):

        node_db_id = request.data.get("node_db_id")
        photo = request.FILES.get("photo")
        remove_photo = request.data.get("remove_photo") == "1"

        if not node_db_id:
            return Response(
                {"status": "error", "message": "node_db_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            node = HierarchyForChart.objects.get(id=node_db_id)
        except HierarchyForChart.DoesNotExist:
            return Response(
                {"status": "error", "message": "Regulator not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if photo:
            node.photo = photo

        elif remove_photo:
            node.photo = None

        else:
            return Response(
                {"status": "error", "message": "No photo supplied"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        node.save()

        return Response(
            {
                "status": "success",
                "id": node.id,
                "photo_url": node.photo.url if node.photo else "",
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(
    tags=["Master"],
    request=DeleteRegulatorSerializer,
)
class DeleteRegulatorAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):

        # # Ship admin check
        # if not _regulator_admin_only(request.user):
        #     return Response(
        #         {
        #             "status": "error",
        #             "message": "Only the ship admin may delete a regulator from this page.",
        #         },
        #         status=status.HTTP_403_FORBIDDEN,
        #     )

        # Validate request body
        serializer = DeleteRegulatorSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {
                    "status": "error",
                    "message": "Invalid request",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        node_db_id = serializer.validated_data["node_db_id"]

        # Get regulator node
        try:
            node = HierarchyForChart.objects.get(id=node_db_id)

        except HierarchyForChart.DoesNotExist:
            return Response(
                {
                    "status": "error",
                    "message": "Regulator not found",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # Don't delete if people exist below this node
        if HierarchyForChart.objects.filter(parent=node).exists():
            return Response(
                {
                    "status": "error",
                    "message": (
                        "This card has people below it on the chart. "
                        "Move them first, or use Unmark."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = node.user
        profile_deleted = False

        if profile is not None:
            has_login = CustomUser.objects.filter(user_profile=profile).exists()

            other_nodes = (
                HierarchyForChart.objects.filter(user=profile)
                .exclude(id=node.id)
                .exists()
            )

            if not has_login and not other_nodes:
                profile_deleted = True

        # Delete hierarchy node
        node.delete()

        # Delete profile if it is no longer used
        if profile_deleted:
            try:
                profile.delete()

            except Exception:
                profile_deleted = False

        return Response(
            {
                "status": "success",
                "profile_deleted": profile_deleted,
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(
    tags=["Master"],
    request={
        "multipart/form-data": {
            "type": "object",
            "properties": {
                "node_db_id": {
                    "type": "integer",
                },
                "photo": {
                    "type": "string",
                    "format": "binary",
                },
                "remove_photo": {
                    "type": "string",
                    "example": "0",
                },
            },
            "required": ["node_db_id"],
        }
    },
)
class UpdateRegulatorPhotoAPIView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):

        node_db_id = request.data.get("node_db_id")
        photo = request.FILES.get("photo")
        remove_photo = request.data.get("remove_photo") == "1"

        if not node_db_id:
            return Response(
                {"status": "error", "message": "node_db_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            node = HierarchyForChart.objects.get(id=node_db_id)
        except HierarchyForChart.DoesNotExist:
            return Response(
                {"status": "error", "message": "Regulator not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if photo:
            node.photo = photo

        elif remove_photo:
            node.photo = None

        else:
            return Response(
                {"status": "error", "message": "No photo supplied"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        node.save()

        return Response(
            {
                "status": "success",
                "id": node.id,
                "photo_url": node.photo.url if node.photo else "",
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(
    tags=["Master"],
    request=DeleteRegulatorSerializer,
)
class DeleteRegulatorAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):

        # # Ship admin check
        # if not _regulator_admin_only(request.user):
        #     return Response(
        #         {
        #             "status": "error",
        #             "message": "Only the ship admin may delete a regulator from this page.",
        #         },
        #         status=status.HTTP_403_FORBIDDEN,
        #     )

        # Validate request body
        serializer = DeleteRegulatorSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {
                    "status": "error",
                    "message": "Invalid request",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        node_db_id = serializer.validated_data["node_db_id"]

        # Get regulator node
        try:
            node = HierarchyForChart.objects.get(id=node_db_id)

        except HierarchyForChart.DoesNotExist:
            return Response(
                {
                    "status": "error",
                    "message": "Regulator not found",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # Don't delete if people exist below this node
        if HierarchyForChart.objects.filter(parent=node).exists():
            return Response(
                {
                    "status": "error",
                    "message": (
                        "This card has people below it on the chart. "
                        "Move them first, or use Unmark."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = node.user
        profile_deleted = False

        if profile is not None:
            has_login = CustomUser.objects.filter(user_profile=profile).exists()

            other_nodes = (
                HierarchyForChart.objects.filter(user=profile)
                .exclude(id=node.id)
                .exists()
            )

            if not has_login and not other_nodes:
                profile_deleted = True

        # Delete hierarchy node
        node.delete()

        # Delete profile if it is no longer used
        if profile_deleted:
            try:
                profile.delete()

            except Exception:
                profile_deleted = False

        return Response(
            {
                "status": "success",
                "profile_deleted": profile_deleted,
            },
            status=status.HTTP_200_OK,
        )


@extend_schema(
    tags=["Master"],
    request=UpdateRegulatorProfileSerializer,
)
class UpdateRegulatorProfileAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):

        serializer = UpdateRegulatorProfileSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(
                {
                    "status": "error",
                    "message": "Invalid request data",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = serializer.validated_data

        # -----------------------------
        # Get regulator node
        # -----------------------------
        try:
            node = HierarchyForChart.objects.get(id=data["node_db_id"])
        except HierarchyForChart.DoesNotExist:
            return Response(
                {
                    "status": "error",
                    "message": "Regulator not found",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # -----------------------------
        # Check attached user
        # -----------------------------
        if not node.user_id:
            return Response(
                {
                    "status": "error",
                    "message": "This node has no person attached.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = node.user

        # -----------------------------
        # Personal number
        # -----------------------------
        personal_number = data.get("personal_number", "").strip()

        if (
            personal_number
            and personal_number.upper() != (profile.personal_number or "").upper()
        ):
            clash = (
                CustomUserProfile.objects.filter(
                    personal_number__iexact=personal_number,
                    ship_joining_date=profile.ship_joining_date,
                )
                .exclude(id=profile.id)
                .exists()
            )

            if clash:
                return Response(
                    {
                        "status": "error",
                        "message": (
                            f"Personal number {personal_number} is already in use."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if personal_number:
            profile.personal_number = personal_number

        # -----------------------------
        # Rank
        # -----------------------------
        if "rank_id" in data:
            rank_id = data.get("rank_id")

            if rank_id is not None:
                try:
                    profile.rank = Rank.objects.get(id=rank_id)
                except Rank.DoesNotExist:
                    return Response(
                        {
                            "status": "error",
                            "message": "Unknown rank",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                profile.rank = None

        # -----------------------------
        # First name
        # -----------------------------
        if "firstname" in data:
            profile.firstname = (data.get("firstname") or "").strip()

        # -----------------------------
        # Last name
        # -----------------------------
        if "lastname" in data:
            profile.lastname = (data.get("lastname") or "").strip()

        # -----------------------------
        # Designation
        # -----------------------------
        if "designation" in data:
            profile.designation = (data.get("designation") or "").strip()

        # -----------------------------
        # Department
        # -----------------------------
        if "department_id" in data:
            department_id = data.get("department_id")

            if department_id is None:
                profile.department = None

            else:
                try:
                    profile.department = Department.objects.get(id=department_id)
                except Department.DoesNotExist:
                    return Response(
                        {
                            "status": "error",
                            "message": "That department does not exist.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        # -----------------------------
        # Executive sub-department
        # -----------------------------
        if "executive_sub_department" in data:
            posted_sub = (data.get("executive_sub_department") or "").strip()

            if not posted_sub:
                profile.executive_sub_department = ""

            else:
                match = next(
                    (
                        name
                        for name in rbac.EXECUTIVE_SUB_DEPARTMENTS
                        if name.strip().upper() == posted_sub.upper()
                    ),
                    None,
                )

                if match is None:
                    allowed = ", ".join(name for name in rbac.EXECUTIVE_SUB_DEPARTMENTS)

                    return Response(
                        {
                            "status": "error",
                            "message": (
                                f"'{posted_sub}' is not an "
                                f"EXECUTIVE sub-department. "
                                f"Allowed: {allowed}."
                            ),
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                profile.executive_sub_department = match

        # -----------------------------
        # Save
        # -----------------------------
        profile.save()

        # -----------------------------
        # Response
        # -----------------------------
        return Response(
            {
                "status": "success",
                "id": node.id,
                "rank": (profile.rank.name if profile.rank else ""),
                "rank_id": (profile.rank.id if profile.rank else ""),
                "personal_number": (profile.personal_number or ""),
                "firstname": (profile.firstname or ""),
                "lastname": (profile.lastname or ""),
                "designation": (profile.designation or ""),
                "department_id": (profile.department_id or ""),
                "department_name": (
                    profile.department.name if profile.department else ""
                ),
                "executive_sub_department": (profile.executive_sub_department or ""),
            },
            status=status.HTTP_200_OK,
        )
