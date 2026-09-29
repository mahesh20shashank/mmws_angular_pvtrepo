from django.contrib import admin

from .models import (
    CategoryName,
    Certificate,
    EquipmentCategory,
    EquipmentDocument,
)

admin.site.register(Certificate)
admin.site.register(CategoryName)
admin.site.register(EquipmentCategory)
admin.site.register(EquipmentDocument)
