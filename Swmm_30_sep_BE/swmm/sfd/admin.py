from django.apps import apps
from django.contrib import admin
from django.contrib.admin.sites import AlreadyRegistered

from .models import (
    Equipment,
    EquipmentCategory,
    EquipmentChangeRequest,
    EquipmentType,
    RemoveEquipment,
    SatelliteUnit,
    ShipEquipment,
    TrialUnit,
)


@admin.register(TrialUnit)
class TrialUnitAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)


@admin.register(SatelliteUnit)
class SatelliteUnitAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)


@admin.register(EquipmentCategory)
class EquipmentCategoryAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)


@admin.register(EquipmentType)
class EquipmentTypeAdmin(admin.ModelAdmin):
    list_display = ("id", "Equipment_Desc", "Equipment_Type_ID")
    search_fields = ("Equipment_Desc", "Equipment_Type_ID")


@admin.register(ShipEquipment)
class ShipEquipmentAdmin(admin.ModelAdmin):
    list_display = ("id", "nomenclature", "status", "ship", "department", "is_synced")
    list_filter = ("status", "is_synced", "ship", "department")
    search_fields = ("nomenclature", "equipment_serial_no", "t_equipment_ship_detail")


@admin.register(EquipmentChangeRequest)
class EquipmentChangeRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "equipment", "ship_equipment", "new_serial")
    search_fields = ("new_serial", "removal_remark")


@admin.register(RemoveEquipment)
class RemoveEquipmentAdmin(admin.ModelAdmin):
    list_display = ("id", "equipment", "ship_equipment", "removal_date")
    search_fields = ("removal_remark", "authority_of_removal")


@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
    list_display = ("id", "equipment_code", "ilms_eq_code", "equipment_class", "model")


for model in apps.get_app_config("sfd").get_models():
    try:
        admin.site.register(model)
    except AlreadyRegistered:
        pass
