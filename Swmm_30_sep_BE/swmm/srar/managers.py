"""Managers and querysets for the srar app."""

import calendar

from django.db import models
from django.db.models import Q


class NamedActiveQuerySet(models.QuerySet):
    def active_items(self):
        return self.filter(active=1)

    def ordered_by_name(self):
        return self.order_by("name")


class SrarMonthlyHeaderQuerySet(models.QuerySet):
    MONTH_MAP = {
        "january": 1,
        "february": 2,
        "march": 3,
        "april": 4,
        "may": 5,
        "june": 6,
        "july": 7,
        "august": 8,
        "september": 9,
        "october": 10,
        "november": 11,
        "december": 12,
        "jan": 1,
        "feb": 2,
        "mar": 3,
        "apr": 4,
        "jun": 6,
        "jul": 7,
        "aug": 8,
        "sep": 9,
        "oct": 10,
        "nov": 11,
        "dec": 12,
    }

    def ordered_dashboard(self):
        return self.order_by("-srar_year", "-srar_month")

    def for_ship(self, ship):
        return self.filter(ship=ship)

    def for_period(self, month=None, year=None):
        queryset = self
        if month is not None:
            queryset = queryset.filter(srar_month=month)
        if year is not None:
            queryset = queryset.filter(srar_year=year)
        return queryset

    def previous_to(self, ship, month, year):
        return (
            self.for_ship(ship)
            .filter(Q(srar_year__lt=year) | Q(srar_year=year, srar_month__lt=month))
            .ordered_dashboard()
        )

    def filter_dashboard(self, month_param="", year_param="", search_param=""):
        queryset = self
        month_param = str(month_param or "").strip()
        year_param = str(year_param or "").strip()
        search_param = str(search_param or "").strip()

        if month_param:
            if month_param.isdigit():
                queryset = queryset.filter(srar_month=int(month_param))
            else:
                mapped_month = self.MONTH_MAP.get(month_param.lower())
                if mapped_month:
                    queryset = queryset.filter(srar_month=mapped_month)

        if year_param and year_param.isdigit():
            queryset = queryset.filter(srar_year=int(year_param))

        if search_param:
            matched_month = self.MONTH_MAP.get(search_param.lower())
            q_filters = Q()
            if search_param.isdigit():
                q_filters |= Q(srar_year=int(search_param)) | Q(
                    srar_month=int(search_param)
                )
            else:
                q_filters |= Q(srar_year__icontains=search_param)
            if matched_month:
                q_filters |= Q(srar_month=matched_month)
            queryset = queryset.filter(q_filters)

        return queryset

    def as_dashboard_rows(self):
        rows = []
        for header in self:
            if header.cmms_sync_status:
                status_str = "CMMS Synced"
            elif getattr(header, "co_approved", False):
                status_str = "CO Approved & CMMS Sync Pending"
            elif header.send_to_co:
                status_str = "Sent to CO Approval"
            else:
                status_str = "Draft"

            month_name = (
                calendar.month_name[header.srar_month]
                if 1 <= header.srar_month <= 12
                else str(header.srar_month)
            )
            rows.append(
                {
                    "id": header.id,
                    "year": header.srar_year,
                    "month": header.srar_month,
                    "month_name": month_name,
                    "status": status_str,
                    "cmms_sync_status": header.cmms_sync_status,
                    "send_to_co": header.send_to_co,
                    "co_approved": getattr(header, "co_approved", False),
                    "is_saved": header.is_saved,
                    "can_edit": True,
                    "can_preview": True,
                    "can_export": True,
                }
            )
        return rows


class SrarMonthlyShipActivityQuerySet(models.QuerySet):
    def for_header(self, header):
        return self.filter(srar_monthly_header=header)

    def with_relations(self):
        return self.select_related(
            "ship_activity_detail",
            "ship_activity_type",
            "ship_location",
            "ship_state",
        )


class SrarEquipmentTypeListQuerySet(models.QuerySet):
    def for_srar_type(self, srar_type):
        return self.filter(srar_type=srar_type)

    def equipment_ids(self):
        return self.values_list("equipment_id_id", flat=True)

    def with_equipment(self):
        return self.select_related("equipment_id", "equipment_id__equipment")
