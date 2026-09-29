# """DRF serializers for the In/Out Tag API.

# The legacy app returned hand-built ``dict``s from ``get_tagout_details`` /
# ``get_tagin_details`` (flat, with a ``success`` flag and pre-formatted date
# strings). These serializers reproduce every field those dicts carried, but in
# the conventional DRF shape:

# * the raw model field (ISO dates, FK ids) - for editing / sorting on the client
# * a ``<field>_display`` twin - ``get_<field>_display()`` for choices, or the
#   legacy ``strftime`` string for dates
# * a ``<field>_detail`` twin for foreign keys - a small nested projection
#   (see :func:`_profile_summary`) instead of the legacy "rank firstname
#   lastname" string concatenation

# Write-time validation that the legacy *views* did (required fields, "tag-out
# must be approved", "one Tag In per Tag Out", "items pending XOR all returned")
# lives on the serializers so it applies to every entry point, including the
# Excel import in :mod:`inout_tag.excel`.
# """

# from rest_framework import serializers

# from master.models import Department
# from sfd.models import ShipEquipment

# from .models import (
#     ConditionChoices,
#     TagIn,
#     TagInApproval,
#     TagOut,
#     TagOutReasonChoices,
#     TypeChoices,
# )

# # Legacy strftime format used across get_tagout_details / get_tagin_details,
# # e.g. "04 Jun 2026".
# DATEFORMAT = "%d %b %Y"
# DATETIMEFORMAT = "%d %b %Y, %I:%M %p"


# def _profile_summary(profile):
#     """Small read-only projection of a ``CustomUserProfile``.

#     Used everywhere a legacy view hand-assembled a "rank firstname lastname"
#     string or reached through ``profile.department.name`` / ``profile.ship.name``.
#     Returns ``None`` when there is no profile so callers never need their own
#     null guard.
#     """
#     if profile is None:
#         return None
#     return {
#         "id": profile.id,
#         "firstname": profile.firstname,
#         "lastname": profile.lastname,
#         "rank": profile.rank.name if profile.rank_id else None,
#         "personal_number": profile.personal_number,
#         "department_id": profile.department_id,
#         "department": profile.department.name if profile.department_id else None,
#         "ship_id": profile.ship_id,
#         "ship": profile.ship.name if profile.ship_id else None,
#         "role": profile.role_master.role_name if profile.role_master_id else None,
#     }


# def _full_name(profile):
#     """ "Rank Firstname Lastname" for a ``CustomUserProfile`` (``CustomUserProfile``
#     has no ``get_full_name``), or ``""`` when unresolved - mirrors the legacy
#     ``get_tagin_details`` ``approved_by`` string."""
#     if profile is None:
#         return ""
#     rank = profile.rank.name if profile.rank_id else ""
#     return f"{rank} {profile.firstname or ''} {profile.lastname or ''}".strip()


# # ---------------------------------------------------------------------------
# # TagOut
# # ---------------------------------------------------------------------------
# class TagOutSerializer(serializers.ModelSerializer):
#     """Read + create serializer for :class:`inout_tag.models.TagOut`.

#     Create (POST ``tagouts/``) mirrors the legacy ``addtagout`` view:

#     * The fields the legacy view listed in ``required_fields`` are re-declared
#       here with ``required=True`` even though the model allows blank/null, so an
#       incomplete payload is rejected the same way.
#     * ``user_profile`` / ``created_by`` / ``tagout_number`` / the approval
#       columns are read-only - the viewset sets them.
#     * ``departments_affected`` is optional here; the viewset force-includes the
#       caller's own department and drops the reason-only fields that do not
#       match ``tagout_reason``.
#     """

#     # --- required on create (legacy addtagout.required_fields) ---
#     date = serializers.DateField(required=True)
#     tagout_equipment_name = serializers.PrimaryKeyRelatedField(
#         queryset=ShipEquipment.objects.all(), required=True
#     )
#     expected_date_of_tagin = serializers.DateField(required=True)
#     name_of_subsystem = serializers.CharField(required=True)
#     type = serializers.ChoiceField(choices=TypeChoices.choices, required=True)
#     tagout_maintainer_name_rank = serializers.CharField(required=True)
#     name_of_component = serializers.CharField(required=True)
#     condition = serializers.ChoiceField(choices=ConditionChoices.choices, required=True)
#     serial_number_of_component = serializers.CharField(required=True)
#     weight_of_component = serializers.DecimalField(
#         max_digits=10, decimal_places=2, required=True
#     )
#     tagout_reason = serializers.ChoiceField(
#         choices=TagOutReasonChoices.choices, required=True
#     )
#     tagout_description = serializers.CharField(required=True)

#     departments_affected = serializers.PrimaryKeyRelatedField(
#         queryset=Department.objects.filter(active=1), many=True, required=False
#     )

#     # --- FK detail projections ---
#     user_profile_detail = serializers.SerializerMethodField()
#     created_by_detail = serializers.SerializerMethodField()
#     approved_by_detail = serializers.SerializerMethodField()
#     tagout_equipment_name_detail = serializers.SerializerMethodField()
#     departments_affected_detail = serializers.SerializerMethodField()

#     # --- choice labels ---
#     type_display = serializers.CharField(source="get_type_display", read_only=True)
#     condition_display = serializers.CharField(
#         source="get_condition_display", read_only=True
#     )
#     approval_status_display = serializers.CharField(
#         source="get_approval_status_display", read_only=True
#     )
#     tagout_reason_display = serializers.CharField(
#         source="get_tagout_reason_display", read_only=True
#     )

#     # --- legacy pre-formatted date strings ---
#     date_display = serializers.SerializerMethodField()
#     expected_date_of_tagin_display = serializers.SerializerMethodField()
#     estimated_bom_arrival_date_display = serializers.SerializerMethodField()
#     approved_on_display = serializers.SerializerMethodField()

#     has_tagin = serializers.SerializerMethodField()

#     class Meta:
#         model = TagOut
#         fields = (
#             "id",
#             "tagout_number",
#             "date",
#             "date_display",
#             "user_profile",
#             "user_profile_detail",
#             "tagout_equipment_name",
#             "tagout_equipment_name_detail",
#             "name_of_subsystem",
#             "name_of_component",
#             "serial_number_of_component",
#             "pattern_number_of_component",
#             "weight_of_component",
#             "type",
#             "type_display",
#             "condition",
#             "condition_display",
#             "special_instructions",
#             "departments_affected",
#             "departments_affected_detail",
#             "expected_date_of_tagin",
#             "expected_date_of_tagin_display",
#             "tagout_reason",
#             "tagout_reason_display",
#             "tagout_description",
#             "tagout_maintainer_name_rank",
#             "ty_loan_ship",
#             "ty_authority",
#             "ty_item_taken_by",
#             "ty_additional_items",
#             "survery_demand_authority",
#             "repair_ra_number",
#             "repair_landed_details",
#             "repair_item_taken_by",
#             "repair_additional_items",
#             "aber_authority",
#             "replacement_item",
#             "estimated_bom_arrival_date",
#             "estimated_bom_arrival_date_display",
#             "approval_status",
#             "approval_status_display",
#             "approved_by",
#             "approved_by_detail",
#             "approved_on",
#             "approved_on_display",
#             "created_on",
#             "created_by",
#             "created_by_detail",
#             "modified_on",
#             "active",
#             "has_tagin",
#         )
#         read_only_fields = (
#             "id",
#             "tagout_number",
#             "user_profile",
#             "approval_status",
#             "approved_by",
#             "approved_on",
#             "created_on",
#             "created_by",
#             "modified_on",
#             "active",
#         )

#     def get_user_profile_detail(self, obj):
#         return _profile_summary(obj.user_profile)

#     def get_created_by_detail(self, obj):
#         return _profile_summary(obj.created_by)

#     def get_approved_by_detail(self, obj):
#         return _profile_summary(obj.approved_by)

#     def get_tagout_equipment_name_detail(self, obj):
#         equipment = obj.tagout_equipment_name
#         if equipment is None:
#             return None
#         return {"id": equipment.id, "nomenclature": equipment.nomenclature}

#     def get_departments_affected_detail(self, obj):
#         return [{"id": d.id, "name": d.name} for d in obj.departments_affected.all()]

#     def get_date_display(self, obj):
#         return obj.date.strftime(DATEFORMAT) if obj.date else None

#     def get_expected_date_of_tagin_display(self, obj):
#         return (
#             obj.expected_date_of_tagin.strftime(DATEFORMAT)
#             if obj.expected_date_of_tagin
#             else None
#         )

#     def get_estimated_bom_arrival_date_display(self, obj):
#         return (
#             obj.estimated_bom_arrival_date.strftime(DATEFORMAT)
#             if obj.estimated_bom_arrival_date
#             else None
#         )

#     def get_approved_on_display(self, obj):
#         return obj.approved_on.strftime(DATETIMEFORMAT) if obj.approved_on else None

#     def get_has_tagin(self, obj):
#         return hasattr(obj, "tagin")


# class TagOutApprovalActionSerializer(serializers.Serializer):
#     """Request body for ``POST tagouts/{id}/approve/`` - ``{"action":
#     "approve" | "reject"}``. The legacy ``approvetagot`` view read the same
#     ``action`` POST field."""

#     action = serializers.ChoiceField(choices=["approve", "reject"])


# # ---------------------------------------------------------------------------
# # TagIn / TagInApproval
# # ---------------------------------------------------------------------------
# class TagInApprovalSerializer(serializers.ModelSerializer):
#     """Read-only projection of one department's :class:`TagInApproval` row -
#     nested under ``TagInSerializer.approval_list``."""

#     department_detail = serializers.SerializerMethodField()
#     approved_by_detail = serializers.SerializerMethodField()
#     approval_status_display = serializers.CharField(
#         source="get_approval_status_display", read_only=True
#     )

#     class Meta:
#         model = TagInApproval
#         fields = (
#             "id",
#             "tagin",
#             "department",
#             "department_detail",
#             "approval_status",
#             "approval_status_display",
#             "approved_by",
#             "approved_by_detail",
#             "approved_on",
#             "remarks",
#             "created_on",
#             "active",
#         )
#         read_only_fields = fields

#     def get_department_detail(self, obj):
#         if obj.department_id is None:
#             return None
#         return {"id": obj.department_id, "name": obj.department.name}

#     def get_approved_by_detail(self, obj):
#         return _profile_summary(obj.approved_by)


# class TagInSerializer(serializers.ModelSerializer):
#     """Read + create serializer for :class:`inout_tag.models.TagIn`.

#     Create (POST ``tagins/``) mirrors the legacy ``add_tagin`` view:

#     * ``tagin_date`` / ``tagin_description`` / ``tagin_maintainer`` are required
#       (the legacy form's ``if not all([...])`` guard).
#     * ``tagout`` must be an active, approved Tag Out that does not already have
#       a Tag In (:meth:`validate_tagout`).
#     * Either ``all_items_returned`` is true, or ``items_pending`` has text
#       (:meth:`validate`).
#     * ``status`` / ``approval_status`` / ``tagin_remarks`` /
#       ``tagin_maintainer_name_rank`` are read-only: the legacy view derived
#       them (``status="completed"``, ``tagin_remarks = tagin_description``,
#       ``tagin_maintainer_name_rank = tagin_maintainer``) rather than accepting
#       them, and ``TagInViewSet.perform_create`` reproduces that.

#     ``tagout_detail`` nests the full :class:`TagOutSerializer` - every
#     reason-specific field the legacy ``get_tagin_details`` dict flattened onto
#     the tag-in payload lives there instead. ``approval_list`` replaces the
#     ``tagin.approval_list = ...`` attribute the legacy ``tag_in`` view bolted
#     onto each row in a Python loop.
#     """

#     tagin_date = serializers.DateField(required=True)
#     tagin_description = serializers.CharField(required=True)
#     tagin_maintainer = serializers.CharField(required=True)

#     tagout_detail = TagOutSerializer(source="tagout", read_only=True)
#     created_by_detail = serializers.SerializerMethodField()
#     status_display = serializers.CharField(source="get_status_display", read_only=True)
#     approval_status_display = serializers.CharField(
#         source="get_approval_status_display", read_only=True
#     )
#     tagin_date_display = serializers.SerializerMethodField()
#     approval_list = serializers.SerializerMethodField()

#     class Meta:
#         model = TagIn
#         fields = (
#             "id",
#             "tagout",
#             "tagout_detail",
#             "tagin_date",
#             "tagin_date_display",
#             "tagin_description",
#             "tagin_maintainer",
#             "tagin_maintainer_name_rank",
#             "all_items_returned",
#             "items_pending",
#             "status",
#             "status_display",
#             "approval_status",
#             "approval_status_display",
#             "tagin_remarks",
#             "created_on",
#             "created_by",
#             "created_by_detail",
#             "active",
#             "approval_list",
#         )
#         read_only_fields = (
#             "id",
#             "tagin_maintainer_name_rank",
#             "status",
#             "approval_status",
#             "tagin_remarks",
#             "created_on",
#             "created_by",
#             "active",
#         )

#     def get_created_by_detail(self, obj):
#         return _profile_summary(obj.created_by)

#     def get_tagin_date_display(self, obj):
#         return obj.tagin_date.strftime(DATEFORMAT) if obj.tagin_date else None

#     def get_approval_list(self, obj):
#         return TagInApprovalSerializer(
#             obj.tagin_approvals.filter(active=1), many=True
#         ).data

#     def validate_tagout(self, value):
#         """Legacy ``add_tagin``'s ``TagOut.objects.get(id=..., active=1,
#         approval_status='approved')`` fetch plus its "already has a Tag In"
#         guard. (The "only the creator may file" rule is enforced in the
#         viewset, where ``request.user`` is available - as the legacy view did.)
#         """
#         if value.active != 1 or value.approval_status != "approved":
#             raise serializers.ValidationError("TagOut not found or not approved.")
#         if hasattr(value, "tagin"):
#             raise serializers.ValidationError(
#                 f"Tag In already exists for {value.tagout_number}."
#             )
#         return value

#     def validate(self, attrs):
#         """Legacy "all items returned XOR items pending" rule."""
#         all_items_returned = attrs.get(
#             "all_items_returned",
#             getattr(self.instance, "all_items_returned", True),
#         )
#         items_pending = attrs.get(
#             "items_pending", getattr(self.instance, "items_pending", "") or ""
#         )
#         if not all_items_returned and not items_pending.strip():
#             raise serializers.ValidationError(
#                 {
#                     "items_pending": (
#                         'Please either check "All items returned back" or '
#                         'provide details in the "Items Pending" field.'
#                     )
#                 }
#             )
#         return attrs


# class TagInApprovalActionSerializer(serializers.Serializer):
#     """Request body for ``POST tagins/{id}/approve/`` - ``{"action":
#     "approve" | "reject", "remarks": "..."}``. ``remarks`` is optional and is
#     stored on the approving department's :class:`TagInApproval` row."""

#     action = serializers.ChoiceField(choices=["approve", "reject"])
#     remarks = serializers.CharField(required=False, allow_blank=True, default="")


# class HistorySerializer(serializers.ModelSerializer):
#     """Flat row for the History screen (legacy ``history`` view / template).

#     Deliberately a narrow projection - the History table only shows tag
#     number, date, ship, owning department, who raised it, the affected
#     departments and the equipment. Use :class:`TagOutSerializer` when the full
#     record is needed.
#     """

#     ship_name = serializers.CharField(
#         source="user_profile.ship.name", read_only=True, default=None
#     )
#     department_name = serializers.CharField(
#         source="user_profile.department.name", read_only=True, default=None
#     )
#     created_by_name = serializers.SerializerMethodField()
#     departments_affected = serializers.SerializerMethodField()
#     ship_equipment = serializers.SerializerMethodField()

#     class Meta:
#         model = TagOut
#         fields = (
#             "id",
#             "date",
#             "ship_name",
#             "department_name",
#             "created_by_name",
#             "departments_affected",
#             "active",
#             "tagout_number",
#             "ship_equipment",
#         )

#     def get_created_by_name(self, obj):
#         return _full_name(obj.created_by)

#     def get_ship_equipment(self, obj):
#         equipment = obj.tagout_equipment_name
#         return equipment.nomenclature if equipment else None

#     def get_departments_affected(self, obj):
#         return [{"id": d.id, "name": d.name} for d in obj.departments_affected.all()]

"""DRF serializers for the In/Out Tag API.

The legacy app returned hand-built ``dict``s from ``get_tagout_details`` /
``get_tagin_details`` (flat, with a ``success`` flag and pre-formatted date
strings). These serializers reproduce every field those dicts carried, but in
the conventional DRF shape:

* the raw model field (ISO dates, FK ids) - for editing / sorting on the client
* a ``<field>_display`` twin - ``get_<field>_display()`` for choices, or the
  legacy ``strftime`` string for dates
* a ``<field>_detail`` twin for foreign keys - a small nested projection
  (see :func:`_profile_summary`) instead of the legacy "rank firstname
  lastname" string concatenation

Write-time validation that the legacy *views* did (required fields, "tag-out
must be approved", "one Tag In per Tag Out", "items pending XOR all returned")
lives on the serializers so it applies to every entry point, including the
Excel import in :mod:`inout_tag.excel`.
"""

from rest_framework import serializers

from master.models import Department
from sfd.models import ShipEquipment

from .models import (
    ConditionChoices,
    TagIn,
    TagInApproval,
    TagOut,
    TagOutReasonChoices,
    TypeChoices,
)

# Legacy strftime format used across get_tagout_details / get_tagin_details,
# e.g. "04 Jun 2026".
DATEFORMAT = "%d %b %Y"
DATETIMEFORMAT = "%d %b %Y, %I:%M %p"


def _profile_summary(profile):
    """Small read-only projection of a ``CustomUserProfile``.

    Used everywhere a legacy view hand-assembled a "rank firstname lastname"
    string or reached through ``profile.department.name`` / ``profile.ship.name``.
    Returns ``None`` when there is no profile so callers never need their own
    null guard.
    """
    if profile is None:
        return None
    return {
        "id": profile.id,
        "firstname": profile.firstname,
        "lastname": profile.lastname,
        "rank": profile.rank.name if profile.rank_id else None,
        "personal_number": profile.personal_number,
        "department_id": profile.department_id,
        "department": profile.department.name if profile.department_id else None,
        "ship_id": profile.ship_id,
        "ship": profile.ship.name if profile.ship_id else None,
        "role": profile.role_master.role_name if profile.role_master_id else None,
    }


def _full_name(profile):
    """ "Rank Firstname Lastname" for a ``CustomUserProfile`` (``CustomUserProfile``
    has no ``get_full_name``), or ``""`` when unresolved - mirrors the legacy
    ``get_tagin_details`` ``approved_by`` string."""
    if profile is None:
        return ""
    rank = profile.rank.name if profile.rank_id else ""
    return f"{rank} {profile.firstname or ''} {profile.lastname or ''}".strip()


# ---------------------------------------------------------------------------
# TagOut
# ---------------------------------------------------------------------------
class TagOutSerializer(serializers.ModelSerializer):
    """Read + create serializer for :class:`inout_tag.models.TagOut`.

    Create (POST ``tagouts/``) mirrors the legacy ``addtagout`` view:

    * The fields the legacy view listed in ``required_fields`` are re-declared
      here with ``required=True`` even though the model allows blank/null, so an
      incomplete payload is rejected the same way.
    * ``user_profile`` / ``created_by`` / ``tagout_number`` / the approval
      columns are read-only - the viewset sets them.
    * ``departments_affected`` is optional here; the viewset force-includes the
      caller's own department and drops the reason-only fields that do not
      match ``tagout_reason``.
    """

    # --- required on create (legacy addtagout.required_fields) ---
    date = serializers.DateField(required=True)
    tagout_equipment_name = serializers.PrimaryKeyRelatedField(
        queryset=ShipEquipment.objects.all(), required=True
    )
    expected_date_of_tagin = serializers.DateField(required=True)
    name_of_subsystem = serializers.CharField(required=True)
    type = serializers.ChoiceField(choices=TypeChoices.choices, required=True)
    tagout_maintainer_name_rank = serializers.CharField(required=True)
    name_of_component = serializers.CharField(required=True)
    condition = serializers.ChoiceField(choices=ConditionChoices.choices, required=True)
    serial_number_of_component = serializers.CharField(required=True)
    weight_of_component = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=True
    )
    tagout_reason = serializers.ChoiceField(
        choices=TagOutReasonChoices.choices, required=True
    )
    tagout_description = serializers.CharField(required=True)

    departments_affected = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.filter(active=1), many=True, required=False
    )

    # --- FK detail projections ---
    user_profile_detail = serializers.SerializerMethodField()
    created_by_detail = serializers.SerializerMethodField()
    approved_by_detail = serializers.SerializerMethodField()
    tagout_equipment_name_detail = serializers.SerializerMethodField()
    departments_affected_detail = serializers.SerializerMethodField()

    # --- choice labels ---
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    condition_display = serializers.CharField(
        source="get_condition_display", read_only=True
    )
    approval_status_display = serializers.CharField(
        source="get_approval_status_display", read_only=True
    )
    tagout_reason_display = serializers.CharField(
        source="get_tagout_reason_display", read_only=True
    )

    # --- legacy pre-formatted date strings ---
    date_display = serializers.SerializerMethodField()
    expected_date_of_tagin_display = serializers.SerializerMethodField()
    estimated_bom_arrival_date_display = serializers.SerializerMethodField()
    approved_on_display = serializers.SerializerMethodField()

    has_tagin = serializers.SerializerMethodField()

    class Meta:
        model = TagOut
        fields = (
            "id",
            "tagout_number",
            "date",
            "date_display",
            "user_profile",
            "user_profile_detail",
            "tagout_equipment_name",
            "tagout_equipment_name_detail",
            "name_of_subsystem",
            "name_of_component",
            "serial_number_of_component",
            "pattern_number_of_component",
            "weight_of_component",
            "type",
            "type_display",
            "condition",
            "condition_display",
            "special_instructions",
            "departments_affected",
            "departments_affected_detail",
            "expected_date_of_tagin",
            "expected_date_of_tagin_display",
            "tagout_reason",
            "tagout_reason_display",
            "tagout_description",
            "tagout_maintainer_name_rank",
            "ty_loan_ship",
            "ty_authority",
            "ty_item_taken_by",
            "ty_additional_items",
            "survery_demand_authority",
            "repair_ra_number",
            "repair_landed_details",
            "repair_item_taken_by",
            "repair_additional_items",
            "aber_authority",
            "replacement_item",
            "estimated_bom_arrival_date",
            "estimated_bom_arrival_date_display",
            "approval_status",
            "approval_status_display",
            "approved_by",
            "approved_by_detail",
            "approved_on",
            "approved_on_display",

            # OLD: "created_on",
            "created_at",

            "created_by",
            "created_by_detail",

            # OLD: "modified_on",
            "updated_at",

            "active",
            "has_tagin",
        )
        read_only_fields = (
            "id",
            "tagout_number",
            "user_profile",
            "approval_status",
            "approved_by",
            "approved_on",

            # OLD: "created_on",
            "created_at",

            "created_by",

            # OLD: "modified_on",
            "updated_at",

            "active",
        )

    def get_user_profile_detail(self, obj):
        return _profile_summary(obj.user_profile)

    def get_created_by_detail(self, obj):
        return _profile_summary(obj.created_by)

    def get_approved_by_detail(self, obj):
        return _profile_summary(obj.approved_by)

    def get_tagout_equipment_name_detail(self, obj):
        equipment = obj.tagout_equipment_name
        if equipment is None:
            return None
        return {"id": equipment.id, "nomenclature": equipment.nomenclature}

    def get_departments_affected_detail(self, obj):
        return [{"id": d.id, "name": d.name} for d in obj.departments_affected.all()]

    def get_date_display(self, obj):
        return obj.date.strftime(DATEFORMAT) if obj.date else None

    def get_expected_date_of_tagin_display(self, obj):
        return (
            obj.expected_date_of_tagin.strftime(DATEFORMAT)
            if obj.expected_date_of_tagin
            else None
        )

    def get_estimated_bom_arrival_date_display(self, obj):
        return (
            obj.estimated_bom_arrival_date.strftime(DATEFORMAT)
            if obj.estimated_bom_arrival_date
            else None
        )

    def get_approved_on_display(self, obj):
        return obj.approved_on.strftime(DATETIMEFORMAT) if obj.approved_on else None

    def get_has_tagin(self, obj):
        return hasattr(obj, "tagin")


class TagOutApprovalActionSerializer(serializers.Serializer):
    """Request body for ``POST tagouts/{id}/approve/`` - ``{"action":
    "approve" | "reject"}``. The legacy ``approvetagot`` view read the same
    ``action`` POST field."""

    action = serializers.ChoiceField(choices=["approve", "reject"])


# ---------------------------------------------------------------------------
# TagIn / TagInApproval
# ---------------------------------------------------------------------------
class TagInApprovalSerializer(serializers.ModelSerializer):
    """Read-only projection of one department's :class:`TagInApproval` row -
    nested under ``TagInSerializer.approval_list``."""

    department_detail = serializers.SerializerMethodField()
    approved_by_detail = serializers.SerializerMethodField()
    approval_status_display = serializers.CharField(
        source="get_approval_status_display", read_only=True
    )

    class Meta:
        model = TagInApproval
        fields = (
            "id",
            "tagin",
            "department",
            "department_detail",
            "approval_status",
            "approval_status_display",
            "approved_by",
            "approved_by_detail",
            "approved_on",
            "remarks",

            # OLD: "created_on",
            "created_at",

            "active",
        )
        read_only_fields = fields

    def get_department_detail(self, obj):
        if obj.department_id is None:
            return None
        return {"id": obj.department_id, "name": obj.department.name}

    def get_approved_by_detail(self, obj):
        return _profile_summary(obj.approved_by)


class TagInSerializer(serializers.ModelSerializer):
    """Read + create serializer for :class:`inout_tag.models.TagIn`.

    Create (POST ``tagins/``) mirrors the legacy ``add_tagin`` view:

    * ``tagin_date`` / ``tagin_description`` / ``tagin_maintainer`` are required
      (the legacy form's ``if not all([...])`` guard).
    * ``tagout`` must be an active, approved Tag Out that does not already have
      a Tag In (:meth:`validate_tagout`).
    * Either ``all_items_returned`` is true, or ``items_pending`` has text
      (:meth:`validate`).
    * ``status`` / ``approval_status`` / ``tagin_remarks`` /
      ``tagin_maintainer_name_rank`` are read-only: the legacy view derived
      them (``status="completed"``, ``tagin_remarks = tagin_description``,
      ``tagin_maintainer_name_rank = tagin_maintainer``) rather than accepting
      them, and ``TagInViewSet.perform_create`` reproduces that.

    ``tagout_detail`` nests the full :class:`TagOutSerializer` - every
    reason-specific field the legacy ``get_tagin_details`` dict flattened onto
    the tag-in payload lives there instead. ``approval_list`` replaces the
    ``tagin.approval_list = ...`` attribute the legacy ``tag_in`` view bolted
    onto each row in a Python loop.
    """

    tagin_date = serializers.DateField(required=True)
    tagin_description = serializers.CharField(required=True)
    tagin_maintainer = serializers.CharField(required=True)

    tagout_detail = TagOutSerializer(source="tagout", read_only=True)
    created_by_detail = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    approval_status_display = serializers.CharField(
        source="get_approval_status_display", read_only=True
    )
    tagin_date_display = serializers.SerializerMethodField()
    approval_list = serializers.SerializerMethodField()

    class Meta:
        model = TagIn
        fields = (
            "id",
            "tagout",
            "tagout_detail",
            "tagin_date",
            "tagin_date_display",
            "tagin_description",
            "tagin_maintainer",
            "tagin_maintainer_name_rank",
            "all_items_returned",
            "items_pending",
            "status",
            "status_display",
            "approval_status",
            "approval_status_display",
            "tagin_remarks",

            # OLD: "created_on",
            "created_at",

            "created_by",
            "created_by_detail",
            "active",
            "approval_list",
        )
        read_only_fields = (
            "id",
            "tagin_maintainer_name_rank",
            "status",
            "approval_status",
            "tagin_remarks",

            # OLD: "created_on",
            "created_at",

            "created_by",
            "active",
        )

    def get_created_by_detail(self, obj):
        return _profile_summary(obj.created_by)

    def get_tagin_date_display(self, obj):
        return obj.tagin_date.strftime(DATEFORMAT) if obj.tagin_date else None

    def get_approval_list(self, obj):
        return TagInApprovalSerializer(
            obj.tagin_approvals.filter(active=1), many=True
        ).data

    def validate_tagout(self, value):
        """Legacy ``add_tagin``'s ``TagOut.objects.get(id=...,
        active=1, approval_status='approved')`` fetch plus its "already has
        a Tag In" guard. (The "only the creator may file" rule is enforced in
        the viewset, where ``request.user`` is available - as the legacy view
        did.)
        """
        if value.active != 1 or value.approval_status != "approved":
            raise serializers.ValidationError("TagOut not found or not approved.")
        if hasattr(value, "tagin"):
            raise serializers.ValidationError(
                f"Tag In already exists for {value.tagout_number}."
            )
        return value

    def validate(self, attrs):
        """Legacy "all items returned XOR items pending" rule."""
        all_items_returned = attrs.get(
            "all_items_returned",
            getattr(self.instance, "all_items_returned", True),
        )
        items_pending = attrs.get(
            "items_pending", getattr(self.instance, "items_pending", "") or ""
        )
        if not all_items_returned and not items_pending.strip():
            raise serializers.ValidationError(
                {
                    "items_pending": (
                        'Please either check "All items returned back" or '
                        'provide details in the "Items Pending" field.'
                    )
                }
            )
        return attrs


class TagInApprovalActionSerializer(serializers.Serializer):
    """Request body for ``POST tagins/{id}/approve/`` - ``{"action":
    "approve" | "reject", "remarks": "..."}``. ``remarks`` is optional and is
    stored on the approving department's :class:`TagInApproval` row."""

    action = serializers.ChoiceField(choices=["approve", "reject"])
    remarks = serializers.CharField(required=False, allow_blank=True, default="")


class HistorySerializer(serializers.ModelSerializer):
    """Flat row for the History screen (legacy ``history`` view / template).

    Deliberately a narrow projection - the History table only shows tag
    number, date, ship, owning department, who raised it, the affected
    departments and the equipment. Use :class:`TagOutSerializer` when the full
    record is needed.
    """

    ship_name = serializers.CharField(
        source="user_profile.ship.name", read_only=True, default=None
    )
    department_name = serializers.CharField(
        source="user_profile.department.name", read_only=True, default=None
    )
    created_by_name = serializers.SerializerMethodField()
    departments_affected = serializers.SerializerMethodField()
    ship_equipment = serializers.SerializerMethodField()

    class Meta:
        model = TagOut
        fields = (
            "id",
            "date",
            "ship_name",
            "department_name",
            "created_by_name",
            "departments_affected",
            "active",
            "tagout_number",
            "ship_equipment",
        )

    def get_created_by_name(self, obj):
        return _full_name(obj.created_by)

    def get_ship_equipment(self, obj):
        equipment = obj.tagout_equipment_name
        return equipment.nomenclature if equipment else None

    def get_departments_affected(self, obj):
        return [{"id": d.id, "name": d.name} for d in obj.departments_affected.all()]