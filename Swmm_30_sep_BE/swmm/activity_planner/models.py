from accounts.models import CustomUserProfile
from django.db import models
from master.models import Base

from .constants import PlannerCategory, PlannerPriority, PlannerStatus


class Event(Base):
    CATEGORY_CHOICES = [
        ("defect", "Defect"),
        ("routine", "Routine"),
        ("trial", "Trial"),
        ("audit", "Audit"),
        ("meeting", "Meeting"),
        ("lecture", "Lecture"),
    ]
    user_profile = models.ForeignKey(
        CustomUserProfile, on_delete=models.PROTECT, null=True, blank=True
    )
    title = models.CharField(max_length=200)
    date = models.DateField(null=True, blank=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    # Allow any category (fixed or custom) - no validation constraint
    category = models.CharField(max_length=100)
    status = models.CharField(
        max_length=20, choices=PlannerStatus.choices, default=PlannerStatus.SCHEDULED
    )
    description = models.TextField(null=True, blank=True)
    document = models.FileField(upload_to="event_docs/", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class PlannerActivity(Base):
    title = models.CharField(max_length=200)
    subtitle = models.CharField(max_length=200, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    date = models.DateField(null=True, blank=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)

    category = models.CharField(
        max_length=20, choices=PlannerCategory.choices, default=PlannerCategory.OTHERS
    )
    status = models.CharField(
        max_length=20, choices=PlannerStatus.choices, default=PlannerStatus.SCHEDULED
    )
    priority = models.CharField(
        max_length=20, choices=PlannerPriority.choices, null=True, blank=True
    )

    progress = models.IntegerField(default=0, help_text="0-100")
    active = models.BooleanField(default=False)
    delayed = models.BooleanField(default=False)
    conflict = models.BooleanField(default=False)
    isolation = models.BooleanField(default=False)

    equipment = models.CharField(max_length=200, null=True, blank=True)
    reference = models.CharField(max_length=200, null=True, blank=True)
    location = models.CharField(max_length=200, null=True, blank=True)

    ship = models.ForeignKey(
        "master.Ship", on_delete=models.PROTECT, null=True, blank=True
    )
    department = models.ForeignKey(
        "master.Department", on_delete=models.PROTECT, null=True, blank=True
    )
    created_by = models.ForeignKey(
        "accounts.CustomUserProfile", on_delete=models.PROTECT, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title
