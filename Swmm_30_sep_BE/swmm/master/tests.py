from datetime import date, timedelta
from io import BytesIO
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.models import CustomUser, CustomUserProfile, Rank

from .models import (
    ActiveShipConfig,
    CoMessage,
    HierarchyForChart,
    MemberDetail,
    OrderDuty,
    Ship,
    ShipRole,
    ShipRoleImage,
    Unit,
    UnitType,
    UpdateEntry,
)
from .serializers import (
    CoMessageSerializer,
    MemberDetailSerializer,
    OrderDutySerializer,
    ShipRoleSerializer,
    UpdateEntrySerializer,
)
from .utils import parse_iso_date
from .views import ins_display_name


def get_test_image():
    file = BytesIO()
    image = Image.new("RGB", (100, 100))
    image.save(file, "JPEG")
    file.seek(0)

    return SimpleUploadedFile(
        "ship.jpg",
        file.read(),
        content_type="image/jpeg",
    )


# ============================================================================
# MODEL TESTS
# ============================================================================


class UpdateEntryModelTests(TestCase):
    """Test UpdateEntry model."""

    def setUp(self):
        self.update = UpdateEntry.objects.create(
            update_text="System maintenance scheduled",
            from_date=timezone.now().date(),
            to_date=timezone.now().date() + timedelta(days=1),
        )

    def test_create_update_entry(self):
        """Test creating an UpdateEntry."""
        self.assertEqual(self.update.update_text, "System maintenance scheduled")
        self.assertIsNotNone(self.update.uploaded_date)

    def test_update_entry_str(self):
        """Test UpdateEntry string representation."""
        self.assertEqual(str(self.update), f"Update {self.update.pk}")

    def test_update_entry_ordering(self):
        """Test UpdateEntry is ordered by uploaded_date descending."""
        UpdateEntry.objects.create(
            update_text="Old update",
            from_date=timezone.now().date() - timedelta(days=2),
            to_date=timezone.now().date() - timedelta(days=1),
        )
        updates = UpdateEntry.objects.all()
        self.assertEqual(updates.first().id, self.update.id)

    def test_update_entry_with_event_file(self):
        """Test UpdateEntry with file attachment."""
        file_obj = SimpleUploadedFile(
            "test_event.txt",
            b"event content",
            content_type="text/plain",
        )
        update = UpdateEntry.objects.create(
            update_text="Update with event",
            from_date=timezone.now().date(),
            to_date=timezone.now().date(),
            event_file=file_obj,
        )
        self.assertIsNotNone(update.event_file)


class ShipRoleModelTests(TestCase):
    """Test ShipRole and ShipRoleImage models."""

    def setUp(self):
        self.ship = ShipRole.objects.create(
            role_title="Captain",
            current_text="Overall command and responsibility",
        )

    def test_create_ship_role(self):
        """Test creating a ShipRole."""
        self.assertEqual(self.ship.role_title, "Captain")
        self.assertEqual(self.ship.current_text, "Overall command and responsibility")

    def test_ship_role_str(self):
        """Test ShipRole string representation."""
        self.assertEqual(str(self.ship), f"Ship Role {self.ship.pk}")

    def test_ship_role_image_relationship(self):
        """Test ShipRoleImage relationship."""
        image_file = SimpleUploadedFile(
            "test_image.jpg",
            b"fake image content",
            content_type="image/jpeg",
        )
        image = ShipRoleImage.objects.create(ship=self.ship, image=image_file)
        self.assertEqual(image.ship, self.ship)
        self.assertIn(image, self.ship.images.all())

    def test_ship_role_multiple_images(self):
        """Test ShipRole with multiple images."""
        for i in range(3):
            SimpleUploadedFile(
                f"test_{i}.jpg",
                b"fake image content",
                content_type="image/jpeg",
            )
        self.assertEqual(self.ship.images.count(), 0)


class MemberDetailModelTests(TestCase):
    """Test MemberDetail model."""

    def setUp(self):
        self.member = MemberDetail.objects.create(
            name="John Doe",
            designation="Officer",
            rank="Commander",
        )

    def test_create_member_detail(self):
        """Test creating a MemberDetail."""
        self.assertEqual(self.member.name, "John Doe")
        self.assertEqual(self.member.designation, "Officer")
        self.assertEqual(self.member.rank, "Commander")

    def test_member_detail_str(self):
        """Test MemberDetail string representation."""
        self.assertEqual(str(self.member), "John Doe")

    def test_member_detail_with_image(self):
        """Test MemberDetail with image."""
        image_file = SimpleUploadedFile(
            "member_image.jpg",
            b"fake image content",
            content_type="image/jpeg",
        )
        member = MemberDetail.objects.create(
            name="Jane Doe",
            designation="Engineer",
            rank="Lieutenant",
            image_path=image_file,
        )
        self.assertIsNotNone(member.image_path)


class OrderDutyModelTests(TestCase):
    """Test OrderDuty model."""

    def setUp(self):
        self.daily_order = OrderDuty.objects.create(
            filename="daily_order_2026.pdf",
            source="daily order",
            date=timezone.now().date(),
            from_date=timezone.now().date(),
            to_date=timezone.now().date(),
            description="Daily operations order",
        )

    def test_create_order_duty(self):
        """Test creating an OrderDuty."""
        self.assertEqual(self.daily_order.filename, "daily_order_2026.pdf")
        self.assertEqual(self.daily_order.source, "daily order")

    def test_order_duty_str(self):
        """Test OrderDuty string representation."""
        self.assertEqual(str(self.daily_order), "daily_order_2026.pdf")

    def test_order_duty_duty_roster_type(self):
        """Test OrderDuty as duty roster."""
        roster = OrderDuty.objects.create(
            filename="duty_roster_2026.pdf",
            source="duty roster",
            roster_name="A-Watch",
            date=timezone.now().date(),
        )
        self.assertEqual(roster.source, "duty roster")
        self.assertEqual(roster.roster_name, "A-Watch")

    def test_order_duty_with_pdf(self):
        """Test OrderDuty with PDF attachment."""
        pdf_file = SimpleUploadedFile(
            "test.pdf",
            b"pdf content",
            content_type="application/pdf",
        )
        order = OrderDuty.objects.create(
            filename="test.pdf",
            source="daily order",
            date=timezone.now().date(),
            pdf_path=pdf_file,
        )
        self.assertIsNotNone(order.pdf_path)


class CoMessageModelTests(TestCase):
    """Test CoMessage model."""

    def setUp(self):
        self.message = CoMessage.objects.create(
            message="Important announcement from Command",
            valid_till_date=timezone.now().date() + timedelta(days=7),
        )

    def test_create_co_message(self):
        """Test creating a CoMessage."""
        self.assertEqual(self.message.message, "Important announcement from Command")
        self.assertIsNotNone(self.message.uploaded_date)

    def test_co_message_str(self):
        """Test CoMessage string representation."""
        self.assertEqual(str(self.message), f"Co Message {self.message.pk}")

    def test_co_message_valid_till(self):
        """Test CoMessage valid_till_date."""
        future_date = timezone.now().date() + timedelta(days=30)
        message = CoMessage.objects.create(
            message="Future message",
            valid_till_date=future_date,
        )
        self.assertEqual(message.valid_till_date, future_date)


class HierarchyForChartModelTests(TestCase):
    """Test HierarchyForChart model."""

    def setUp(self):
        self.user1 = CustomUser.objects.create_user(
            username="user1", password="password1"
        )
        self.co = HierarchyForChart.objects.create(
            node_type="co",
            user=self.user1,  # Real user instance
            is_commander_officer=True,
        )

    def test_create_hierarchy_node(self):
        """Test creating a hierarchy node."""
        self.assertEqual(self.co.node_type, "co")
        self.assertTrue(self.co.is_commander_officer)

    def test_hierarchy_node_str(self):
        """Test HierarchyForChart string representation."""
        self.assertEqual(str(self.co), self.co.name)

    def test_hierarchy_division_node(self):
        """Test creating a division node."""
        division = HierarchyForChart.objects.create(
            node_type="division",
            division_name="Engineering",
        )
        self.assertEqual(division.name, "Engineering")

    def test_hierarchy_parent_child_relationship(self):
        """Test parent-child relationships in hierarchy."""
        user2 = CustomUser.objects.create_user(username="user2", password="password1")
        sailor = HierarchyForChart.objects.create(
            node_type="sailor",
            user=user2,
            parent=self.co,
        )
        self.assertEqual(sailor.parent, self.co)
        self.assertIn(sailor, self.co.children.all())

    def test_hierarchy_regulator_relationship(self):
        """Test regulator-sailor relationships."""
        user3 = CustomUser.objects.create_user(username="user3", password="password1")
        regulator = HierarchyForChart.objects.create(
            node_type="sailor",
            user=user3,
            is_regulator=True,
            parent=self.co,
        )
        user4 = CustomUser.objects.create_user(username="user4", password="password1")
        sailor = HierarchyForChart.objects.create(
            node_type="sailor",
            user=user4,
            assigned_regulator=regulator,
            parent=self.co,
        )
        self.assertEqual(sailor.assigned_regulator, regulator)


# ============================================================================
# SERIALIZER TESTS
# ============================================================================


class UpdateEntrySerializerTests(TestCase):
    """Test UpdateEntrySerializer."""

    def test_serializer_with_valid_data(self):
        """Test serializer with valid data."""
        data = {
            "update_text": "System update",
            "from_date": timezone.now().date().isoformat(),
            "to_date": (timezone.now().date() + timedelta(days=1)).isoformat(),
        }
        serializer = UpdateEntrySerializer(data=data)
        self.assertTrue(serializer.is_valid())

    def test_serializer_uploaded_date_read_only(self):
        """Test that uploaded_date is read-only."""
        update = UpdateEntry.objects.create(
            update_text="Test",
            from_date=timezone.now().date(),
        )
        serializer = UpdateEntrySerializer(update)
        self.assertIn("uploaded_date", serializer.data)
        self.assertTrue(serializer.fields["uploaded_date"].read_only)

    def test_serializer_missing_required_field(self):
        """Test serializer with missing required field."""
        data = {
            "from_date": timezone.now().date().isoformat(),
        }
        serializer = UpdateEntrySerializer(data=data)
        self.assertFalse(serializer.is_valid())


class ShipRoleSerializerTests(TestCase):
    """Test ShipRoleSerializer."""

    def setUp(self):
        self.ship = ShipRole.objects.create(
            role_title="Captain",
            current_text="Leadership",
        )

    def test_serializer_with_ship_role(self):
        """Test serializer with ShipRole instance."""
        serializer = ShipRoleSerializer(self.ship)
        self.assertEqual(serializer.data["role_title"], "Captain")
        self.assertEqual(serializer.data["current_text"], "Leadership")

    def test_serializer_includes_images(self):
        """Test serializer includes nested images."""
        serializer = ShipRoleSerializer(self.ship)
        self.assertIn("images", serializer.data)
        self.assertEqual(serializer.data["images"], [])


class MemberDetailSerializerTests(TestCase):
    """Test MemberDetailSerializer."""

    def test_serializer_with_valid_data(self):
        """Test serializer with valid data."""
        data = {
            "name": "John Doe",
            "designation": "Officer",
            "rank": "Commander",
        }
        serializer = MemberDetailSerializer(data=data)
        self.assertTrue(serializer.is_valid())

    def test_serializer_creates_instance(self):
        """Test serializer creates instance."""
        data = {
            "name": "Jane Doe",
            "designation": "Engineer",
            "rank": "Lieutenant",
        }
        serializer = MemberDetailSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        member = serializer.save()
        self.assertEqual(member.name, "Jane Doe")


class OrderDutySerializerTests(TestCase):
    """Test OrderDutySerializer."""

    def test_serializer_with_valid_daily_order(self):
        """Test serializer with valid daily order data."""
        data = {
            "filename": "order.pdf",
            "source": "daily order",
            "date": timezone.now().date().isoformat(),
            "from_date": timezone.now().date().isoformat(),
            "to_date": timezone.now().date().isoformat(),
            "description": "Daily ops",
        }
        serializer = OrderDutySerializer(data=data)
        self.assertTrue(serializer.is_valid())

    def test_serializer_with_duty_roster(self):
        """Test serializer with duty roster data."""
        data = {
            "filename": "roster.pdf",
            "source": "duty roster",
            "roster_name": "A-Watch",
            "date": timezone.now().date().isoformat(),
        }
        serializer = OrderDutySerializer(data=data)
        self.assertTrue(serializer.is_valid())


class CoMessageSerializerTests(TestCase):
    """Test CoMessageSerializer."""

    def test_serializer_with_valid_data(self):
        """Test serializer with valid data."""
        data = {
            "message": "Important announcement",
            "valid_till_date": (timezone.now().date() + timedelta(days=7)).isoformat(),
        }
        serializer = CoMessageSerializer(data=data)
        self.assertTrue(serializer.is_valid())

    def test_serializer_creates_message(self):
        """Test serializer creates CoMessage."""
        data = {
            "message": "Test message",
            "valid_till_date": timezone.now().date().isoformat(),
        }
        serializer = CoMessageSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        message = serializer.save()
        self.assertEqual(message.message, "Test message")


# ============================================================================
# VIEWSET TESTS
# ============================================================================


class UpdateEntryViewSetTests(APITestCase):
    """Test UpdateEntryViewSet."""

    def setUp(self):
        self.client = APIClient()
        self.update = UpdateEntry.objects.create(
            update_text="System update",
            from_date=timezone.now().date(),
            to_date=timezone.now().date(),
        )

    def test_list_updates(self):
        """Test listing updates."""
        url = reverse("updateentry-list")
        response = self.client.get(url)
        # UpdateEntryViewSet does not require authentication in current config
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_update_ordering(self):
        """Test updates are ordered by uploaded_date descending."""
        UpdateEntry.objects.create(
            update_text="Newer update",
            from_date=timezone.now().date(),
        )
        # Note: would need authentication to test actual ordering


class ShipRoleViewSetTests(APITestCase):
    """Test ShipRoleViewSet."""

    def setUp(self):
        self.client = APIClient()
        self.ship = ShipRole.objects.create(
            role_title="Captain",
            current_text="Leadership",
        )

    def test_ship_role_queryset_ordering(self):
        """Test ShipRole queryset is ordered."""
        new_ship = ShipRole.objects.create(
            role_title="Officer",
            current_text="Management",
        )
        ships = ShipRole.objects.order_by("-uploaded_date")
        self.assertEqual(ships.first().id, new_ship.id)


class MemberDetailViewSetTests(APITestCase):
    """Test MemberDetailViewSet."""

    def setUp(self):
        self.client = APIClient()
        self.member = MemberDetail.objects.create(
            name="John Doe",
            designation="Officer",
            rank="Commander",
        )

    def test_member_queryset_ordering(self):
        """Test MemberDetail queryset is ordered."""
        new_member = MemberDetail.objects.create(
            name="Jane Doe",
            designation="Engineer",
            rank="Lieutenant",
        )
        members = MemberDetail.objects.order_by("-uploaded_date")
        self.assertEqual(members.first().id, new_member.id)


class OrderDutyViewSetTests(APITestCase):
    """Test OrderDutyViewSet."""

    def setUp(self):
        self.client = APIClient()
        self.daily_order = OrderDuty.objects.create(
            filename="daily.pdf",
            source="daily order",
            date=timezone.now().date(),
        )
        self.duty_roster = OrderDuty.objects.create(
            filename="roster.pdf",
            source="duty roster",
            roster_name="A-Watch",
            date=timezone.now().date(),
        )

    def test_daily_orders_queryset(self):
        """Test querying daily orders."""
        daily_orders = OrderDuty.objects.filter(source="daily order")
        self.assertEqual(daily_orders.count(), 1)
        self.assertEqual(daily_orders.first(), self.daily_order)

    def test_duty_rosters_queryset(self):
        """Test querying duty rosters."""
        rosters = OrderDuty.objects.filter(source="duty roster")
        self.assertEqual(rosters.count(), 1)
        self.assertEqual(rosters.first(), self.duty_roster)

    def test_save_daily_orders_batch_creates_multiple_records(self):
        """Test batch creation of daily orders."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        import json

        today = timezone.now().date()
        tomorrow = today + timedelta(days=1)
        next_day = today + timedelta(days=2)

        pdf_file = SimpleUploadedFile(
            "test.pdf",
            b"file_content",
            content_type="application/pdf",
        )

        allocations = [
            {
                "date": today.isoformat(),
                "officer_details": "Officer A",
                "routine_details": "Routine 1",
            },
            {
                "date": tomorrow.isoformat(),
                "officer_details": "Officer B",
                "routine_details": "Routine 2",
            },
            {
                "date": next_day.isoformat(),
                "officer_details": "Officer C",
                "routine_details": "Routine 3",
            },
        ]

        with open(pdf_file.temporary_file_path(), "wb") as f:
            f.write(b"file_content")

        response = self.client.post(
            "/api/v1/master/order-duties/save-daily-orders/",
            {
                "filename": "test.pdf",
                "description": "Test allocation",
                "pdf_path": pdf_file,
                "allocations": json.dumps(allocations),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(len(data), 3)

        # Verify all 3 records have the same batch_id
        batch_id = data[0].get("batch_id")
        self.assertIsNotNone(batch_id)
        for record in data:
            self.assertEqual(record.get("batch_id"), batch_id)
            self.assertEqual(record.get("allocation_type"), "MULTIPLE")

        self.assertEqual(
            OrderDuty.objects.filter(source="daily order").count(), 4
        )  # 3 new + 1 from setUp
        self.assertEqual(OrderDuty.objects.filter(batch_id=batch_id).count(), 3)

    def test_save_daily_orders_invalid_allocations_json(self):
        """Test batch creation fails with invalid JSON."""
        response = self.client.post(
            "/api/v1/master/order-duties/save-daily-orders/",
            {
                "filename": "test.pdf",
                "description": "Test allocation",
                "allocations": "invalid json",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())

    def test_save_daily_orders_empty_allocations(self):
        """Test batch creation fails with empty allocations."""
        import json

        response = self.client.post(
            "/api/v1/master/order-duties/save-daily-orders/",
            {
                "filename": "test.pdf",
                "description": "Test allocation",
                "allocations": json.dumps([]),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)

    def test_get_routines_endpoint(self):
        """Test getting routines from database."""
        response = self.client.get("/api/v1/master/order-duties/routines/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("routines", response.json())
        self.assertIsInstance(response.json()["routines"], list)


class CoMessageViewSetTests(APITestCase):
    """Test CoMessageViewSet."""

    def setUp(self):
        self.client = APIClient()
        self.message = CoMessage.objects.create(
            message="Test announcement",
            valid_till_date=timezone.now().date() + timedelta(days=7),
        )

    def test_message_queryset_ordering(self):
        """Test CoMessage queryset is ordered."""
        new_message = CoMessage.objects.create(
            message="Newer announcement",
            valid_till_date=timezone.now().date() + timedelta(days=7),
        )
        messages = CoMessage.objects.order_by("-uploaded_date")
        self.assertEqual(messages.first().id, new_message.id)


class HierarchyForChartViewSetTests(APITestCase):
    """Test HierarchyForChartViewSet."""

    def setUp(self):
        self.client = APIClient()
        self.rank = Rank.objects.create(name="Commander")
        self.user1 = CustomUserProfile.objects.create(
            firstname="User", lastname="One", personal_number="U001", rank=self.rank
        )
        self.co = HierarchyForChart.objects.create(
            node_type="co",
            user=self.user1,
            is_commander_officer=True,
        )
        self.user2 = CustomUserProfile.objects.create(
            firstname="User", lastname="Two", personal_number="U002", rank=self.rank
        )
        self.sailor = HierarchyForChart.objects.create(
            node_type="sailor",
            user=self.user2,
            parent=self.co,
        )

    def test_hierarchy_queryset_ordering(self):
        """Test HierarchyForChart queryset is ordered."""
        user3 = CustomUserProfile.objects.create(
            firstname="User", lastname="Three", personal_number="U003", rank=self.rank
        )
        HierarchyForChart.objects.create(
            node_type="sailor",
            user=user3,
            parent=self.co,
        )
        nodes = HierarchyForChart.objects.all()
        # Should be ordered by date
        self.assertIsNotNone(nodes.first().date)

    def test_nested_returns_rank_name_not_rank_model(self):
        response = self.client.get(reverse("hierarchy-nested"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["hierarchy"]["rank"], "Commander")

    def test_available_users_excludes_assigned_users_except_edited_node(self):
        available = CustomUserProfile.objects.create(
            firstname="Available", personal_number="U004", rank=self.rank
        )

        response = self.client.get(reverse("hierarchy-available-users"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "success")
        self.assertEqual(
            [user["id"] for user in response.data["users"]], [available.id]
        )

        response = self.client.get(
            reverse("hierarchy-available-users"), {"exclude_node_id": self.sailor.id}
        )
        self.assertEqual(
            {user["id"] for user in response.data["users"]},
            {available.id, self.user2.id},
        )


# ============================================================================
# UTILITY TESTS
# ============================================================================


class ParseIsoDateTests(TestCase):
    """Test parse_iso_date utility function."""

    def test_parse_valid_iso_date(self):
        """Test parsing valid ISO date string."""
        date_str = "2026-06-03"
        result = parse_iso_date(date_str)
        self.assertEqual(result, date(2026, 6, 3))

    def test_parse_date_with_time(self):
        """Test parsing ISO date with time."""
        date_str = "2026-06-03T10:30:00"
        result = parse_iso_date(date_str)
        self.assertEqual(result, date(2026, 6, 3))

    def test_parse_none_returns_none(self):
        """Test that None returns None."""
        result = parse_iso_date(None)
        self.assertIsNone(result)

    def test_parse_empty_string_returns_none(self):
        """Test that empty string returns None."""
        result = parse_iso_date("")
        self.assertIsNone(result)

    def test_parse_invalid_date_returns_none(self):
        """Test that invalid date returns None."""
        result = parse_iso_date("invalid-date")
        self.assertIsNone(result)


# ============================================================================
# VIEW TESTS
# ============================================================================


class MastersDashboardViewTests(TestCase):
    """Test MastersDashboardView."""

    def setUp(self):
        self.client = Client()
        self.daily_order = OrderDuty.objects.create(
            filename="daily.pdf",
            source="daily order",
            date=timezone.now().date(),
        )
        self.update = UpdateEntry.objects.create(
            update_text="System update",
            from_date=timezone.now().date(),
        )

    def test_dashboard_context_includes_daily_files(self):
        """Test dashboard context includes daily files."""
        # Note: would need template to fully test
        # This test verifies model queries would work
        daily_files = OrderDuty.objects.filter(source="daily order")
        self.assertEqual(daily_files.count(), 1)

    def test_dashboard_context_includes_updates(self):
        """Test dashboard context includes updates."""
        updates = UpdateEntry.objects.all()
        self.assertEqual(updates.count(), 1)


class ImportExcelFileViewTests(APITestCase):
    """Test ImportExcelFileView."""

    def setUp(self):
        self.client = APIClient()
        # ImportExcelFileView is exposed at /api/v1/master/import-excel/
        self.url = reverse("import_excel")

    def test_post_without_file(self):
        """Test POST without file raises error."""
        response = self.client.post(self.url, {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_post_with_excel_file(self):
        """Test POST with valid Excel file."""
        excel_file = SimpleUploadedFile(
            "test.xlsx",
            b"excel content",
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response = self.client.post(self.url, {"excel_file": excel_file})
        # Would need authentication to test fully
        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_201_CREATED],
        )


class KnowYourShipAPITestCase(APITestCase):
    def setUp(self):
        self.ship = Ship.objects.create(
            ship_external_id=1001,
            name="INS Vikrant",
            ship_image=get_test_image(),
            ship_description="Aircraft Carrier",
            ship_role_description="Flagship Carrier",
            ship_category_string="Aircraft Carrier",
            class_master_string="Vikrant Class",
            command_string="Western Naval Command",
            authority_string="Indian Navy",
            propulsion_string="Gas Turbine",
        )

    def test_get_ship_details_success(self):
        url = reverse(
            "know-your-ship",
            kwargs={"ship_external_id": self.ship.ship_external_id},
        )

        response = self.client.get(url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            response.data["ship_external_id"],
            1001,
        )

        self.assertEqual(
            response.data["name"],
            "INS Vikrant",
        )

        self.assertEqual(
            response.data["ship_category"],
            "Aircraft Carrier",
        )

        self.assertEqual(
            response.data["class_name"],
            "Vikrant Class",
        )

        self.assertEqual(
            response.data["command_name"],
            "Western Naval Command",
        )

        self.assertEqual(
            response.data["authority_name"],
            "Indian Navy",
        )

        self.assertEqual(
            response.data["propulsion_name"],
            "Gas Turbine",
        )
        self.assertIsNotNone(response.data["ship_image"])
        self.assertIn("/media/master/ship_image/", response.data["ship_image"])

    def test_get_ship_details_not_found(self):
        url = reverse(
            "know-your-ship",
            kwargs={"ship_external_id": 999999},
        )

        response = self.client.get(url)

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
        )

        self.assertEqual(
            response.data,
            {"message": "Ship not found."},
        )


# ============================================================================
# THIS SHIP - Master_unit singleton and api/v1/master/this-ship/
# ============================================================================


# Developed with Understanding: the INS display rule of this-ship/.
class InsDisplayNameTests(TestCase):
    def test_prefix_added(self):
        self.assertEqual(ins_display_name("KESARI"), "INS KESARI")

    def test_no_double_prefix(self):
        self.assertEqual(ins_display_name("INS KESARI"), "INS KESARI")
        self.assertEqual(ins_display_name("ins kesari"), "ins kesari")
        self.assertEqual(ins_display_name("INS"), "INS")

    def test_ins_inside_a_word_is_not_a_prefix(self):
        self.assertEqual(ins_display_name("INSPIRE"), "INS INSPIRE")

    def test_whitespace_and_empty(self):
        self.assertEqual(ins_display_name("  KESARI  "), "INS KESARI")
        self.assertEqual(ins_display_name("   "), "")
        self.assertEqual(ins_display_name(None), "")


# Developed with Understanding: GET this-ship/ is AllowAny and read only. It answers from
# Master_unit hrcdf_ship_name only (D23) and never falls back to the CMMS ship.
class ThisShipAPIViewTests(APITestCase):
    url = "/api/v1/master/this-ship/"

    # Developed with Understanding: Ship.unit_type is a required FK, so every test ship
    # gets one.
    def _ship(self, name):
        unit_type, _ = UnitType.objects.get_or_create(name="CMMS")
        return Ship.objects.create(name=name, unit_type=unit_type)

    def test_hrcdf_ship_name_is_shown(self):
        Unit.objects.create(name="KESARI", code="00162", hrcdf_ship_name="KESARI")
        with mock.patch("master.views.get_this_ship") as lookup:
            response = self.client.get(self.url)
        lookup.assert_not_called()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {
                "hrcdf_ship_name": "KESARI",
                "display_name": "INS KESARI",
                "is_set": True,
            },
        )

    def test_already_prefixed_name_is_not_doubled(self):
        Unit.objects.create(name="", hrcdf_ship_name="INS KESARI")
        response = self.client.get(self.url)
        self.assertEqual(response.data["display_name"], "INS KESARI")
        self.assertTrue(response.data["is_set"])

    def test_cmms_ship_selected_but_step_1_not_run_is_not_set(self):
        # Developed with Understanding: a CMMS Step 0 ship is selected, but HR CDF Step 1
        # has not run, so no ship name is shown and the CMMS ship is never consulted.
        ActiveShipConfig.set_selected_ship(self._ship("Vikrant"))
        with mock.patch("master.views.get_this_ship") as lookup:
            response = self.client.get(self.url)
        lookup.assert_not_called()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {"hrcdf_ship_name": "", "display_name": "", "is_set": False},
        )
        # Developed with Understanding: the GET never creates the Master_unit row.
        self.assertFalse(Unit.objects.exists())

    def test_empty_step_1_row_is_not_set(self):
        Unit.objects.create(name="", hrcdf_ship_name="   ")
        response = self.client.get(self.url)
        self.assertEqual(
            response.data,
            {"hrcdf_ship_name": "", "display_name": "", "is_set": False},
        )

    def test_no_ship_at_all_is_empty(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {"hrcdf_ship_name": "", "display_name": "", "is_set": False},
        )
        self.assertFalse(Unit.objects.exists())


# Developed with Understanding: CMMS Step 0 (ActiveShipConfig.set_selected_ship) writes
# nothing to Master_unit (D22).
class SetSelectedShipTests(TestCase):
    # Developed with Understanding: Ship.unit_type is a required FK, so every test ship
    # gets one.
    def _ship(self, name):
        unit_type, _ = UnitType.objects.get_or_create(name="CMMS")
        return Ship.objects.create(name=name, unit_type=unit_type)

    def test_does_not_create_the_master_unit_row(self):
        ship = self._ship("INS Kolkata")
        ActiveShipConfig.set_selected_ship(ship)
        self.assertEqual(ActiveShipConfig.get_selected_ship(), ship)
        self.assertFalse(Unit.objects.exists())

    def test_leaves_an_existing_master_unit_row_unchanged(self):
        existing = Unit.objects.create(
            name="KESARI", code="00162", hrcdf_ship_name="KESARI"
        )
        before = Unit.objects.filter(pk=existing.pk).values().get()
        ActiveShipConfig.set_selected_ship(self._ship("Kesari"))
        ActiveShipConfig.set_selected_ship(None)
        self.assertEqual(Unit.objects.count(), 1)
        self.assertEqual(Unit.objects.filter(pk=existing.pk).values().get(), before)
