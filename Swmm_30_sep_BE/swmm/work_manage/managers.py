"""Managers and querysets for the work_manage app."""

from django.db import models


class DutyQuerySet(models.QuerySet):
    def with_related(self):
        return self.select_related("user", "created_by", "department")

    def for_department(self, department):
        if not department:
            return self
        return self.filter(department=department)


class TimeSlotQuerySet(models.QuerySet):
    def with_related(self):
        return self.select_related("user", "created_by", "department")

    def for_department(self, department):
        if not department:
            return self
        return self.filter(department=department)


class WorkAssignmentQuerySet(models.QuerySet):
    def with_related(self):
        return self.select_related(
            "assigner",
            "created_by",
            "assignee",
            "timeslot",
            "duty",
            "department",
        )

    def for_department(self, department):
        if not department:
            return self
        return self.filter(department=department)

    def filter_view(self, *, assignment_date=None, location=None):
        queryset = self
        if assignment_date:
            queryset = queryset.filter(assignment_date=assignment_date)
        if location:
            queryset = queryset.filter(location=location)
        return queryset

    def assigned_user_ids_for_date(self, selected_date, department):
        return (
            self.for_department(department)
            .filter(assignment_date=selected_date)
            .values_list("assignee_id", flat=True)
        )


__all__ = ["DutyQuerySet", "TimeSlotQuerySet", "WorkAssignmentQuerySet"]
