"""Query helpers for the ``inout_tag`` models.

Every model in this app extends :class:`master.models.Base`, whose default
manager (:class:`master.managers.BaseManager`) understands the legacy ``active``
smallint soft-delete column (``1`` = active, ``2`` = inactive, ``3`` = deleted)
and exposes ``.active()`` / ``.inactive()``.

To keep ``.active()`` *and* add tag-specific helpers, each queryset below
subclasses :class:`master.managers.BaseQuerySet` and is attached to its model
with ``<QuerySet>.as_manager()`` in :mod:`inout_tag.models`. Both of these work
and can be chained freely::

    TagOut.objects.active().in_flight()
    TagOut.objects.for_department(dept).awaiting_tagin()

``with_related()`` is the single source of truth for the ``select_related`` /
``prefetch_related`` fan-out used by the API read paths - keeping it here stops
the join list from drifting between viewsets.
"""

from django.db.models import Q

from master.managers import BaseQuerySet

# Status literals are duplicated from the ``TextChoices`` in ``models.py`` on
# purpose: it lets this module load without importing ``models`` and so avoids
# the import cycle ``models -> managers -> models``. Keep them in sync with
# ``TagOutApprovalStatus`` / ``TagInApprovalStatus``.
_TAGOUT_IN_PROGRESS = "in_progress"
_APPROVED = "approved"
_REJECTED = "rejected"
_PENDING = "pending"


class TagOutQuerySet(BaseQuerySet):
    """Chainable helpers for :class:`inout_tag.models.TagOut`."""

    def with_related(self):
        """Every relation the ``TagOutSerializer`` touches, joined once."""
        return self.select_related(
            "user_profile__ship",
            "user_profile__department",
            "created_by",
            "approved_by",
            "tagout_equipment_name",
        ).prefetch_related("departments_affected")

    def in_flight(self):
        """The default tag-out list: drop TagOuts that have already been
        tagged back in *and* had that Tag In fully approved - their lifecycle
        is over. (Legacy ``tagoutlist`` did the same ``.exclude(...)``.)"""
        return self.exclude(tagin__active=1, tagin__approval_status=_APPROVED)

    def for_department(self, department):
        """TagOuts raised by anyone in ``department`` - the HOD / Dy HOD view."""
        return self.filter(user_profile__department=department)

    def for_creator(self, profile):
        """TagOuts raised by this one person - the plain-user view."""
        return self.filter(created_by=profile)

    def pending_approval(self):
        """TagOuts still awaiting their department HOD's decision."""
        return self.filter(approval_status=_TAGOUT_IN_PROGRESS)

    def approved(self):
        return self.filter(approval_status=_APPROVED)

    def rejected(self):
        return self.filter(approval_status=_REJECTED)

    def awaiting_tagin(self):
        """Approved TagOuts with no active TagIn yet - the dashboard's
        "yet to Tag In" tile."""
        return self.approved().exclude(tagin__active=1)

    def date_between(self, from_date=None, to_date=None):
        """Filter on ``date`` (the tag-out date); either bound may be ``None``."""
        queryset = self
        if from_date:
            queryset = queryset.filter(date__gte=from_date)
        if to_date:
            queryset = queryset.filter(date__lte=to_date)
        return queryset

    def search(self, term):
        """Free-text match over tag number / component / subsystem / equipment."""
        if not term:
            return self
        return self.filter(
            Q(tagout_number__icontains=term)
            | Q(name_of_component__icontains=term)
            | Q(name_of_subsystem__icontains=term)
            | Q(tagout_equipment_name__nomenclature__icontains=term)
        )


class TagInQuerySet(BaseQuerySet):
    """Chainable helpers for :class:`inout_tag.models.TagIn`."""

    def with_related(self):
        """Every relation the ``TagInSerializer`` (and its nested
        ``TagOutSerializer``) touches, joined once."""
        return self.select_related(
            "tagout__user_profile__ship",
            "tagout__user_profile__department",
            "tagout__tagout_equipment_name",
            "tagout__approved_by",
            "created_by",
        ).prefetch_related(
            "tagout__departments_affected",
            "tagin_approvals__department",
            "tagin_approvals__approved_by",
        )

    def visible_to_hod(self, profile):
        """What a department HOD may list: Tag Ins their department has to
        sign off on (their department is in the parent TagOut's
        ``departments_affected``) plus any they raised themselves."""
        return self.filter(
            Q(tagout__departments_affected=profile.department_id)
            | Q(created_by=profile)
        ).distinct()

    def for_creator(self, profile):
        return self.filter(created_by=profile)

    def date_between(self, from_date=None, to_date=None):
        """Filter on ``tagin_date``; either bound may be ``None``."""
        queryset = self
        if from_date:
            queryset = queryset.filter(tagin_date__gte=from_date)
        if to_date:
            queryset = queryset.filter(tagin_date__lte=to_date)
        return queryset


class TagInApprovalQuerySet(BaseQuerySet):
    """Chainable helpers for :class:`inout_tag.models.TagInApproval`."""

    def with_related(self):
        return self.select_related(
            "tagin__tagout__user_profile__department",
            "tagin__tagout__tagout_equipment_name",
            "tagin__created_by",
            "department",
            "approved_by",
        ).prefetch_related("tagin__tagout__departments_affected")

    def pending(self):
        return self.filter(approval_status=_PENDING)

    def for_department(self, department):
        return self.filter(department=department)


__all__ = ["TagOutQuerySet", "TagInQuerySet", "TagInApprovalQuerySet"]
