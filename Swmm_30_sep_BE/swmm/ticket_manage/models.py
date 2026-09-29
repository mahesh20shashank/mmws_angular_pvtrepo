from pathlib import Path

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from master.models import Base

from .managers import TicketCommentQuerySet, TicketFileQuerySet, TicketQuerySet


class TicketSequence(Base):
    date = models.DateField(unique=True)
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "ticketmanagement_ticketsequence"
        ordering = ["-date"]

    def __str__(self):
        return f"{self.date}: {self.last_number}"


class Ticket(Base):
    objects = TicketQuerySet.as_manager()

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In Progress"
        CLOSED = "closed", "Closed"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"

    ticket_number = models.CharField(max_length=32, unique=True, blank=True)
    title = models.CharField(max_length=255)
    description = models.TextField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_tickets",
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="assigned_tickets",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
    )
    priority = models.CharField(
        max_length=10,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )
    created_on = models.DateTimeField(auto_now_add=True)
    closed_on = models.DateTimeField(null=True, blank=True)
    last_commented_on = models.DateTimeField(null=True, blank=True)
    satellite_unit = models.CharField(max_length=255, null=True, blank=True)
    department_name = models.CharField(max_length=255, null=True, blank=True)
    department = models.ForeignKey(
        "master.Department",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="tickets",
    )
    unit_name = models.CharField(max_length=255, null=True, blank=True)
    mobile_no = models.CharField(max_length=20, null=True, blank=True)
    ncn_no = models.CharField(max_length=20, null=True, blank=True)

    class Meta:
        db_table = "ticketmanagement_ticketmanagement"
        ordering = ["-created_on"]

    def save(self, *args, **kwargs):
        if not self.ticket_number:
            self.ticket_number = self._generate_ticket_number()
        super().save(*args, **kwargs)

    @classmethod
    def _generate_ticket_number(cls):
        today = timezone.localdate()
        with transaction.atomic():
            sequence, _ = TicketSequence.objects.select_for_update().get_or_create(
                date=today
            )
            sequence.last_number += 1
            sequence.save(update_fields=["last_number"])
            return f"T{today:%d%m%Y}{sequence.last_number:03d}"

    def close(self):
        self.status = self.Status.CLOSED
        self.closed_on = timezone.now()
        self.save(update_fields=["status", "closed_on"])

    def __str__(self):
        return f"{self.ticket_number} - {self.title}"


class TicketFile(Base):
    objects = TicketFileQuerySet.as_manager()

    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name="files",
    )
    file = models.FileField(upload_to="ticket_files/")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ticketmanagement_fileupload"
        ordering = ["-uploaded_at"]

    def clean(self):
        super().clean()
        extension = Path(self.file.name).suffix.lower().lstrip(".")
        allowed_extensions = {
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
        if extension not in allowed_extensions:
            from django.core.exceptions import ValidationError

            raise ValidationError(
                {"file": "Unsupported file type for ticket attachment."}
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"File for {self.ticket.ticket_number}"


class TicketComment(Base):
    objects = TicketCommentQuerySet.as_manager()

    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ticketmanagement_comment"
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment by {self.user} on {self.ticket.ticket_number}"
