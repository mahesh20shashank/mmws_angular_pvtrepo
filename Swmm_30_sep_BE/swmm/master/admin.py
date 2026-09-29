from django.apps import apps
from django.contrib import admin
from django.contrib.admin.sites import AlreadyRegistered

from .models import (
    AppInfo,
    ChMasterShipRemarksBy,
    ChMasterSymptoms,
    CoMessage,
    Department,
    Frequency,
    HierarchyForChart,
    MaintenanceOccasionMaster,
    MDeferment,
    MDelay,
    MDiagnostic,
    MemberDetail,
    MEstablishment,
    MInability,
    MMaterialOrganizations,
    MRanklist,
    MReason,
    MRefit,
    MRefitCategory,
    MRepair,
    MRepairAgency,
    MRequiredAssistance,
    MSeverity,
    MShipCategory,
    MShipClass,
    MShipCommand,
    MShipOpsAuthority,
    MShipPropulsion,
    MShipUnitCategory,
    OpsMaintenancePeriod,
    OrderDuty,
    Quote,
    RefitMaintenancePeriod,
    Ship,
    ShipCategoryLookup,
    ShipClassLookup,
    ShipCommandLookup,
    ShipOpsAuthorityLookup,
    ShipPropulsionLookup,
    ShipRole,
    ShipRoleImage,
    SubDepartment,
    UpdateEntry,
)

@admin.register(AppInfo)
class AppInfoAdmin(admin.ModelAdmin):
    # `active` is the flag AppInfoAPIView actually reads — surfaced first so it's obvious at a
    # glance which row is the one currently shown in the frontend footer. Only one row is
    # meant to be active at a time (see AppInfo's own doc) — this admin doesn't enforce that
    # for you, so flip the old row to inactive yourself when adding a new "current" one.
    list_display = ("version", "copyright_text", "active", "created_by", "created_at")
    list_filter = ("active",)
    readonly_fields = ("created_at", "updated_at", "created_by", "updated_by")

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)


MODELS = [
    Department,
    SubDepartment,
    Ship,
    OrderDuty,
    CoMessage,
    MShipCategory,
    MInability,
    MDelay,
    MDiagnostic,
    MRepairAgency,
    MRepair,
    MSeverity,
    MRanklist,
    MShipClass,
    MShipCommand,
    MShipOpsAuthority,
    MShipPropulsion,
    MShipUnitCategory,
    Frequency,
    ChMasterSymptoms,
    ChMasterShipRemarksBy,
    MRequiredAssistance,
    ShipCategoryLookup,
    ShipClassLookup,
    ShipCommandLookup,
    ShipOpsAuthorityLookup,
    ShipPropulsionLookup,
    UpdateEntry,
    Quote,
    ShipRole,
    ShipRoleImage,
    MemberDetail,
    HierarchyForChart,
    MRefitCategory,
    MRefit,
    OpsMaintenancePeriod,
    MMaterialOrganizations,
    MDeferment,
    RefitMaintenancePeriod,
    MEstablishment,
    MReason,
    MaintenanceOccasionMaster,
]

for model in MODELS:
    admin.site.register(model)

for model in apps.get_app_config("master").get_models():
    try:
        admin.site.register(model)
    except AlreadyRegistered:
        pass
