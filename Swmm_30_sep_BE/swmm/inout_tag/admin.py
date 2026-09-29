"""Django-admin registration for the In/Out Tag models.

These are back-office screens for support staff - the real workflow is the API
(:mod:`inout_tag.views`). ``raw_id_fields`` is used on the person/equipment
FKs because those tables are large.
"""

from django.contrib import admin

from .models import TagIn, TagInApproval, TagOut


class TagInApprovalInline(admin.TabularInline):
    """The per-department sign-off rows, shown on the parent Tag In."""

    model = TagInApproval
    extra = 0

    raw_id_fields = ("department", "approved_by", "created_by", "updated_by")

    readonly_fields = ("created_at",)


@admin.register(TagOut)
class TagOutAdmin(admin.ModelAdmin):
    list_display = (
        "tagout_number",
        "date",
        "tagout_equipment_name",
        "approval_status",
        "type",
    )
    list_filter = ("approval_status", "type", "condition", "date")
    search_fields = ("tagout_number", "tagout_equipment_name__nomenclature")

    readonly_fields = ("tagout_number", "created_at", "updated_at")

    raw_id_fields = (
        "user_profile",
        "tagout_equipment_name",
        "approved_by",
        "created_by",
        "updated_by",
    )
    filter_horizontal = ("departments_affected",)
    date_hierarchy = "date"


@admin.register(TagIn)
class TagInAdmin(admin.ModelAdmin):
    list_display = ("tagout", "tagin_date", "status", "approval_status")
    list_filter = ("status", "approval_status", "tagin_date")
    search_fields = ("tagout__tagout_number",)

    readonly_fields = ("created_at", "updated_at")

    raw_id_fields = ("tagout", "created_by", "updated_by")

    inlines = (TagInApprovalInline,)


@admin.register(TagInApproval)
class TagInApprovalAdmin(admin.ModelAdmin):
    list_display = (
        "tagin",
        "department",
        "approval_status",
        "approved_by",
        "approved_on",
    )
    list_filter = ("approval_status", "department", "approved_on")
    search_fields = ("tagin__tagout__tagout_number", "department__name")

    readonly_fields = ("created_at", "updated_at")

    raw_id_fields = ("tagin", "department", "approved_by", "created_by", "updated_by")
