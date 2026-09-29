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
