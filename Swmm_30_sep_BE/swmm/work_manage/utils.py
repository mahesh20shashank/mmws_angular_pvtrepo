from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema, extend_schema_view


def tagged_viewset(tag):
    return extend_schema_view(
        list=extend_schema(tags=[tag]),
        create=extend_schema(tags=[tag]),
        retrieve=extend_schema(tags=[tag]),
        update=extend_schema(tags=[tag]),
        partial_update=extend_schema(tags=[tag]),
        destroy=extend_schema(tags=[tag]),
    )


def users_for_department(department):
    queryset = get_user_model().objects.filter(is_active=True)
    if department:
        queryset = queryset.filter(department=department)
    return queryset
