from drf_spectacular.utils import extend_schema, extend_schema_view


def tagged_read_only_viewset(tag):
    return extend_schema_view(
        list=extend_schema(tags=[tag]),
        retrieve=extend_schema(tags=[tag]),
    )
