"""Managers and querysets for the ticket_manage app."""

from django.db import models
from django.db.models import Q


class TicketQuerySet(models.QuerySet):
    def with_related(self):
        return self.select_related("created_by", "assigned_to", "department")

    def with_status(self, status_filter):
        if not status_filter:
            return self
        return self.filter(status=status_filter)

    def with_priority(self, priority):
        if not priority:
            return self
        return self.filter(priority=priority)

    def search(self, query):
        if not query:
            return self
        return self.filter(
            Q(title__icontains=query) | Q(ticket_number__icontains=query)
        )

    def for_creator(self, user):
        return self.filter(created_by=user)


class TicketCommentQuerySet(models.QuerySet):
    def with_related(self):
        return self.select_related("ticket", "user")


class TicketFileQuerySet(models.QuerySet):
    def with_ticket(self):
        return self.select_related("ticket")


__all__ = ["TicketQuerySet", "TicketCommentQuerySet", "TicketFileQuerySet"]
