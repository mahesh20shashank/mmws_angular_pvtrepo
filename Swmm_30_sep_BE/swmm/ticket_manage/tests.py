from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from master.models import Department
from rest_framework import status
from rest_framework.test import APIClient

from .models import Ticket, TicketComment, TicketFile


class TicketManagementAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username="ticket-user",
            password="Pass@12345",
            personnel_number="PN1001",
        )
        self.other_user = get_user_model().objects.create_user(
            username="other-ticket-user",
            password="Pass@12345",
            personnel_number="PN1002",
        )
        self.department = Department.objects.create(
            name="Engineering",
            code="ENG",
        )
        self.client.force_authenticate(self.user)

    def test_ticket_is_created_with_current_user_and_ticket_number(self):
        response = self.client.post(
            reverse("ticket-list"),
            {
                "title": "Radar issue",
                "description": "Radar console is not responding.",
                "priority": Ticket.Priority.HIGH,
                "assigned_to": self.other_user.id,
                "department": self.department.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        ticket = Ticket.objects.get(id=response.data["id"])
        self.assertEqual(ticket.created_by, self.user)
        self.assertEqual(ticket.department, self.department)
        self.assertTrue(ticket.ticket_number.startswith("T"))
        self.assertEqual(ticket.status, Ticket.Status.OPEN)

    def test_my_tickets_returns_only_logged_in_user_tickets(self):
        own_ticket = Ticket.objects.create(
            title="Own ticket",
            description="Created by logged in user.",
            created_by=self.user,
        )
        Ticket.objects.create(
            title="Other ticket",
            description="Created by another user.",
            created_by=self.other_user,
        )

        response = self.client.get(reverse("ticket-my-tickets"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], own_ticket.id)

    def test_dashboard_returns_status_and_priority_counts(self):
        Ticket.objects.create(
            title="Open high",
            description="Open high priority.",
            created_by=self.user,
            priority=Ticket.Priority.HIGH,
        )
        Ticket.objects.create(
            title="Closed low",
            description="Closed low priority.",
            created_by=self.user,
            status=Ticket.Status.CLOSED,
            priority=Ticket.Priority.LOW,
        )

        response = self.client.get(reverse("ticket-dashboard"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_tickets"], 2)
        self.assertEqual(response.data["open_tickets"], 1)
        self.assertEqual(response.data["closed_tickets"], 1)
        self.assertEqual(response.data["high_priority"], 1)

    def test_comment_updates_last_commented_on(self):
        ticket = Ticket.objects.create(
            title="Ticket needing comment",
            description="Comment should update timestamp.",
            created_by=self.user,
        )

        response = self.client.post(
            reverse("ticket-add-comment", kwargs={"pk": ticket.id}),
            {"comment": "Work has been started."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        ticket.refresh_from_db()
        self.assertIsNotNone(ticket.last_commented_on)
        self.assertEqual(TicketComment.objects.filter(ticket=ticket).count(), 1)

    def test_ticket_file_upload_accepts_allowed_extensions(self):
        ticket = Ticket.objects.create(
            title="Ticket with attachment",
            description="Attachment should be accepted.",
            created_by=self.user,
        )
        uploaded_file = SimpleUploadedFile(
            "evidence.pdf",
            b"%PDF-1.4",
            content_type="application/pdf",
        )

        response = self.client.post(
            reverse("ticket-upload-file", kwargs={"pk": ticket.id}),
            {"file": uploaded_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TicketFile.objects.filter(ticket=ticket).count(), 1)

    def test_close_ticket_sets_status_and_closed_on(self):
        ticket = Ticket.objects.create(
            title="Close this ticket",
            description="Ticket should be closed.",
            created_by=self.user,
        )

        response = self.client.post(reverse("ticket-close", kwargs={"pk": ticket.id}))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.CLOSED)
        self.assertIsNotNone(ticket.closed_on)

    def test_legacy_ticket_management_dashboard_api(self):
        Ticket.objects.create(
            title="Legacy dashboard open ticket",
            description="Open ticket for legacy dashboard.",
            created_by=self.user,
            status=Ticket.Status.OPEN,
        )

        response = self.client.get(reverse("ticketmanagement:ticket_management"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("tickets", response.data)
        self.assertEqual(response.data["total_tickets"], 1)

    def test_legacy_form_ticket_get_and_post_api(self):
        get_response = self.client.get(reverse("ticketmanagement:form_ticket"))
        self.assertEqual(get_response.status_code, status.HTTP_200_OK)
        self.assertTrue(get_response.data["is_new"])

        post_response = self.client.post(
            reverse("ticketmanagement:form_ticket"),
            {
                "title": "Form ticket API test",
                "description": "Created via legacy form_ticket POST API.",
                "priority": "high",
            },
            format="json",
        )
        self.assertEqual(post_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(post_response.data["ticket"]["title"], "Form ticket API test")

    def test_legacy_form_ticket_detail_get_and_post_api(self):
        ticket = Ticket.objects.create(
            title="Existing ticket for detail",
            description="Detail testing.",
            created_by=self.user,
        )

        get_response = self.client.get(
            reverse("ticketmanagement:form_ticket_detail", kwargs={"pk": ticket.id})
        )
        self.assertEqual(get_response.status_code, status.HTTP_200_OK)
        self.assertFalse(get_response.data["is_new"])

        post_response = self.client.post(
            reverse("ticketmanagement:form_ticket_detail", kwargs={"pk": ticket.id}),
            {"comment": "Adding comment via form_ticket detail API."},
            format="json",
        )
        self.assertEqual(post_response.status_code, status.HTTP_201_CREATED)
        ticket.refresh_from_db()
        self.assertEqual(TicketComment.objects.filter(ticket=ticket).count(), 1)

    def test_legacy_my_tickets_api(self):
        Ticket.objects.create(
            title="My ticket 1",
            description="User ticket.",
            created_by=self.user,
        )

        response = self.client.get(reverse("ticketmanagement:my_tickets"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("tickets", response.data)
        self.assertEqual(response.data["total_tickets"], 1)

    def test_legacy_close_ticket_api(self):
        self.user.is_staff = True
        self.user.save()

        ticket = Ticket.objects.create(
            title="Legacy close ticket test",
            description="Closing via legacy API route.",
            created_by=self.user,
        )

        response = self.client.post(
            reverse("ticketmanagement:close_ticket", kwargs={"pk": ticket.id})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.CLOSED)

    def test_anonymous_user_cannot_access_tickets(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(reverse("ticket-list"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
