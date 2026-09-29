"""Managers and querysets for the hotwork app."""

from django.db import models
from django.db.models import Q


class AddHotworkQuerySet(models.QuerySet):
    def with_related(self):
        return self.select_related(
            "created_by",
            "hotwork_incharge",
            "officer_of_the_day",
            "sub_department",
        ).prefetch_related("hod_approvals", "progress_activities")

    def ordered_recent(self):
        return self.order_by("-created_at")

    def for_profile(self, profile):
        return self.filter(
            Q(created_by=profile) | Q(hotwork_incharge=profile)
        ).distinct()

    def pending_review(self):
        return self.exclude(approval_status="approved").exclude(
            approval_status="rejected"
        )

    def tracking_filter(self, *, status_filter=None, date_filter=None):
        queryset = self
        if status_filter:
            queryset = queryset.filter(approval_status=status_filter)
        if date_filter:
            queryset = queryset.filter(date_of_hotwork=date_filter)
        return queryset

    def by_ids(self, ids):
        return self.filter(id__in=ids)


class HotworkHODApprovalQuerySet(models.QuerySet):
    def with_related(self):
        return self.select_related("hotwork", "department", "approved_by")


class HotworkProgressActivityQuerySet(models.QuerySet):
    def with_related(self):
        return self.select_related("hotwork", "performed_by")


__all__ = [
    "AddHotworkQuerySet",
    "HotworkHODApprovalQuerySet",
    "HotworkProgressActivityQuerySet",
]
