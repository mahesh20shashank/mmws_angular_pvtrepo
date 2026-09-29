from django.apps import AppConfig


class InOutTagConfig(AppConfig):
    """In/Out Tag ("lock-out / tag-out") register.

    Tracks equipment isolation events (Tag Out), their restoration (Tag In)
    and the per-department HOD sign-off on each restoration. See
    :mod:`inout_tag.models` for the full lifecycle. Routes are mounted at
    ``/api/v1/inout-tags/`` (``swmm/urls.py``).
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "inout_tag"
    verbose_name = "In/Out Tag"
