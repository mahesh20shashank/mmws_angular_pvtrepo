from datetime import timedelta

import django_filters
from django.db.models import Q
from django.utils import timezone

from .models import (
    DefectSpareTransaction,
    DefectTransaction,
    EquipmentGuarantee,
    RequestAssistance,
)


def resolve_date_filter(date_filter_value, date_field="dart_date"):
    if not date_filter_value or str(date_filter_value).lower() in (
        "all",
        "none",
        "null",
        "",
    ):
        return Q()

    now = timezone.now()
    clean_val = str(date_filter_value).lower().replace(" ", "_")

    if clean_val == "last_30_days":
        return Q(**{f"{date_field}__gte": (now - timedelta(days=30)).date()})
    if clean_val == "last_90_days":
        return Q(**{f"{date_field}__gte": (now - timedelta(days=90)).date()})
    if clean_val == "this_year":
        return Q(**{f"{date_field}__year": now.year})
    if clean_val == "last_year":
        return Q(**{f"{date_field}__year": now.year - 1})

    return Q()


class DartsReportFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(method="filter_status")
    severity = django_filters.CharFilter(method="filter_severity")
    date_filter = django_filters.CharFilter(method="filter_date_filter")

    class Meta:
        model = DefectTransaction
        fields = ["status", "severity", "date_filter"]

    def filter_status(self, queryset, name, value):
        if not value or str(value).lower() in ("all", "none", "null", ""):
            return queryset
        val_upper = str(value).upper()
        if val_upper == "CLOSED":
            return queryset.filter(Q(is_closed=True) | Q(status__iexact="CLOSED"))
        elif val_upper in ("OPEN", "IN_PROGRESS"):
            return queryset.filter(Q(is_closed=False) | Q(status__iexact=val_upper))
        return queryset.filter(status__iexact=value)

    def filter_severity(self, queryset, name, value):
        if not value or str(value).lower() in ("all", "none", "null", ""):
            return queryset
        return queryset.filter(
            Q(severity_code__severity_code__icontains=value)
            | Q(severity_code__severity_name__icontains=value)
        )

    def filter_date_filter(self, queryset, name, value):
        if not value or str(value).lower() in ("all", "none", "null", ""):
            return queryset
        q_obj = resolve_date_filter(value, date_field="dart_date")
        return queryset.filter(q_obj)


class GuaranteeMonitoringReportFilter(django_filters.FilterSet):
    date_filter = django_filters.CharFilter(method="filter_date_filter")

    class Meta:
        model = EquipmentGuarantee
        fields = ["date_filter"]

    def filter_date_filter(self, queryset, name, value):
        if not value or str(value).lower() in ("all", "none", "null", ""):
            return queryset
        q_obj = resolve_date_filter(value, date_field="dart_date")
        return queryset.filter(q_obj)


class SparesConsumedReportFilter(django_filters.FilterSet):
    spares = django_filters.CharFilter(method="filter_spares_filter")
    equipment = django_filters.CharFilter(method="filter_equipment_filter")
    date_filter = django_filters.CharFilter(method="filter_date_filter")

    class Meta:
        model = DefectSpareTransaction
        fields = ["spares", "equipment", "date_filter"]

    def filter_spares_filter(self, queryset, name, value):
        if not value or str(value).lower() in ("all", "none", "null", ""):
            return queryset
        return queryset

    def filter_equipment_filter(self, queryset, name, value):
        if not value or str(value).lower() in ("all", "none", "null", ""):
            return queryset
        return queryset

    def filter_date_filter(self, queryset, name, value):
        if not value or str(value).lower() in ("all", "none", "null", ""):
            return queryset
        q_obj = resolve_date_filter(value, date_field="dart_date")
        return queryset.filter(q_obj)


class RaStatusReportFilter(django_filters.FilterSet):
    ra_no = django_filters.CharFilter(
        field_name="radl_sr_number", lookup_expr="icontains"
    )
    ra_type = django_filters.CharFilter(method="filter_ra_type")
    status = django_filters.CharFilter(method="filter_status")

    class Meta:
        model = RequestAssistance
        fields = ["ra_no", "ra_type", "status"]

    def filter_ra_type(self, queryset, name, value):
        if not value or str(value).lower() in ("all", "none", "null", ""):
            return queryset
        return queryset

    def filter_status(self, queryset, name, value):
        if not value or str(value).lower() in ("all", "none", "null", ""):
            return queryset
        return queryset


class ClosedDartsReportFilter(django_filters.FilterSet):
    equipment = django_filters.CharFilter(
        field_name="equipment_ems__name", lookup_expr="icontains"
    )
    date_filter = django_filters.CharFilter(method="filter_date_filter")

    class Meta:
        model = DefectTransaction
        fields = ["equipment", "date_filter"]

    def filter_date_filter(self, queryset, name, value):
        if not value or str(value).lower() in ("all", "none", "null", ""):
            return queryset
        q_obj = resolve_date_filter(value, date_field="dart_date")
        return queryset.filter(q_obj)


class ServiceRequiredReportFilter(django_filters.FilterSet):
    service = django_filters.CharFilter(method="filter_service")
    department = django_filters.CharFilter(method="filter_department")
    status = django_filters.CharFilter(method="filter_status")
    date_filter = django_filters.CharFilter(method="filter_date_filter")

    class Meta:
        model = DefectTransaction
        fields = ["service", "department", "status", "date_filter"]

    def filter_service(self, queryset, name, value):
        if not value or str(value).lower() in ("all", "none", "null", ""):
            return queryset
        return queryset.filter(
            Q(service_fkey__service__icontains=value)
            | Q(defective_discriptions__icontains=value)
        )

    def filter_department(self, queryset, name, value):
        if not value or str(value).lower() in ("all", "none", "null", ""):
            return queryset
        return queryset.filter(department_id__name__icontains=value)

    def filter_status(self, queryset, name, value):
        if not value or str(value).lower() in ("all", "none", "null", ""):
            return queryset
        val_upper = str(value).upper()
        if val_upper == "CLOSED":
            return queryset.filter(Q(is_closed=True) | Q(status__iexact="CLOSED"))
        return queryset.filter(Q(is_closed=False) & ~Q(status__iexact="CLOSED"))

    def filter_date_filter(self, queryset, name, value):
        if not value or str(value).lower() in ("all", "none", "null", ""):
            return queryset
        q_obj = resolve_date_filter(value, date_field="dart_date")
        return queryset.filter(q_obj)
