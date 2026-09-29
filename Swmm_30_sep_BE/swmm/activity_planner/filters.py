import django_filters
from django.db.models import Q

from .models import Event, PlannerActivity


class EventFilterSet(django_filters.FilterSet):
    start_date = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    end_date = django_filters.DateFilter(field_name="date", lookup_expr="lte")
    category = django_filters.CharFilter(method="filter_category")

    def filter_category(self, queryset, name, value):
        """Support comma-separated categories."""
        if not value:
            return queryset
        categories = [cat.strip() for cat in value.split(",")]
        q_objects = Q()
        for cat in categories:
            q_objects |= Q(category__iexact=cat)
        return queryset.filter(q_objects)

    class Meta:
        model = Event
        fields = ["start_date", "end_date"]


class PlannerActivityFilterSet(django_filters.FilterSet):
    start_date = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    end_date = django_filters.DateFilter(field_name="date", lookup_expr="lte")
    category = django_filters.CharFilter(method="filter_category")
    department = django_filters.CharFilter(
        field_name="department__name", lookup_expr="iexact"
    )

    def filter_category(self, queryset, name, value):
        """Support comma-separated categories."""
        if not value:
            return queryset
        categories = [cat.strip() for cat in value.split(",")]
        q_objects = Q()
        for cat in categories:
            q_objects |= Q(category__iexact=cat)
        return queryset.filter(q_objects)

    class Meta:
        model = PlannerActivity
        fields = ["department", "start_date", "end_date"]
