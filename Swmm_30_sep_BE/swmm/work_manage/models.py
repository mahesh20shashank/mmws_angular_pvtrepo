from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from master.models import Base

from .managers import DutyQuerySet, TimeSlotQuerySet, WorkAssignmentQuerySet


class TimeSlot(Base):
    objects = TimeSlotQuerySet.as_manager()

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="work_time_slots",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="created_work_time_slots",
    )
    department = models.ForeignKey(
        "master.Department",
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )
    date = models.DateField(default=timezone.localdate)
    from_time = models.TimeField()
    to_time = models.TimeField()
    # is_active = models.BooleanField(default=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date", "from_time"]
        unique_together = ("user", "date", "from_time", "to_time")

    def clean(self):
        super().clean()
        if self.from_time and self.to_time and self.from_time >= self.to_time:
            raise ValidationError({"to_time": "To time must be after from time."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"{self.user.CustomUsername}: {self.date} {self.from_time}-{self.to_time}"
        )


class Duty(Base):
    objects = DutyQuerySet.as_manager()

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="work_duties",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="created_work_duties",
    )
    department = models.ForeignKey(
        "master.Department",
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )
    duty_name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["duty_name"]
        unique_together = ("department", "duty_name", "created_by")

    def clean(self):
        super().clean()
        if self.duty_name:
            self.duty_name = self.duty_name.strip()

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.duty_name} ({self.user.CustomUsername})"


class WorkAssignment(Base):
    objects = WorkAssignmentQuerySet.as_manager()

    class Status(models.TextChoices):
        ASSIGNED = "ASSIGNED", "Assigned"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class Location(models.TextChoices):
        AT_SEA = "at_sea", "At Sea"
        AT_HARBOUR = "at_harbour", "At Harbour"

    assigner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="assigned_work_items",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="created_work_assignments",
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_work_items",
    )
    timeslot = models.ForeignKey(
        TimeSlot,
        on_delete=models.CASCADE,
        related_name="work_assignments",
    )
    duty = models.ForeignKey(
        Duty,
        on_delete=models.CASCADE,
        related_name="work_assignments",
    )
    department = models.ForeignKey(
        "master.Department",
        on_delete=models.PROTECT,
        blank=True,
        null=True,
    )
    assignment_date = models.DateField(default=timezone.localdate)
    notes = models.TextField(null=True, blank=True)
    role = models.CharField(max_length=50, null=True, blank=True)
    location = models.CharField(
        max_length=20,
        choices=Location.choices,
        default=Location.AT_SEA,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ASSIGNED,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("assignee", "timeslot", "assignment_date")

    def clean(self):
        super().clean()
        if not self.timeslot_id or not self.assignee_id or not self.assignment_date:
            return

        overlaps = WorkAssignment.objects.filter(
            assignee=self.assignee,
            assignment_date=self.assignment_date,
            timeslot__from_time__lt=self.timeslot.to_time,
            timeslot__to_time__gt=self.timeslot.from_time,
        ).exclude(id=self.id)
        if overlaps.exists():
            raise ValidationError(
                {"timeslot": "Assignee already has work in this time range."}
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.duty.duty_name} -> {self.assignee.username}"
