"""Managers and querysets for the activity_planner app."""

from django.db import models


class EventQuerySet(models.QuerySet):
    def ordered_desc(self):
        return self.order_by("-start_date", "-end_date", "-start_time")

    def ordered_upcoming(self):
        return self.order_by("start_date", "end_date", "start_time")

    def for_ship(self, ship_id):
        return self.filter(ship_id=ship_id)


class PlannerActivityQuerySet(models.QuerySet):
    def with_dashboard_relations(self):
        return self.select_related("department", "ship", "created_by")

    def ordered_schedule(self):
        # PlannerActivity is a single-day record; only Event has
        # start_date/end_date fields.
        return self.order_by("date", "start_time", "id")


__all__ = ["EventQuerySet", "PlannerActivityQuerySet"]
