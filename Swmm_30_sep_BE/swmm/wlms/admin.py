from django.apps import apps
from django.contrib import admin
from django.contrib.admin.sites import AlreadyRegistered

from . import models

admin.site.register(models.WLMSEquipment)
admin.site.register(models.WLMSSpare)
admin.site.register(models.SpareDataMap)
admin.site.register(models.PlannedSparesDescription)
admin.site.register(models.PlannedWEDSpareList)
admin.site.register(models.DartWedSpare)
admin.site.register(models.SurveyReceiptsDetails)
admin.site.register(models.SurveyFormsDetails)
admin.site.register(models.SurveyFormsItems)
admin.site.register(models.PTSDemandDetails)
admin.site.register(models.DemandDetails)
admin.site.register(models.ReceiveDemandDetails)
admin.site.register(models.WEDIIF)

for model in apps.get_app_config("wlms").get_models():
    try:
        admin.site.register(model)
    except AlreadyRegistered:
        pass
