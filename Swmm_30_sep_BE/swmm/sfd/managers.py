"""Managers and querysets for the sfd app."""

from django.db import models
from django.db.models import Q


class EquipmentManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().defer("manufacturer_name", "authority")


class ShipEquipmentQuerySet(models.QuerySet):
    def for_ship(self, ship_id):
        return self.filter(ship_id=ship_id)

    def with_dashboard_relations(self):
        return self.select_related(
            "ship",
            "department",
            "sub_department_f_key",
            "equipment",
            "equipment_type_f_key",
        )

    def with_location(self):
        return self.exclude(location_on_board__isnull=True).exclude(
            location_on_board=""
        )

    def search_dashboard(self, search):
        if not search:
            return self
        return self.filter(
            Q(equipment__equipment_code__icontains=search)
            | Q(compartment__icontains=search)
            | Q(location_on_board__icontains=search)
            | Q(deck__icontains=search)
        )
