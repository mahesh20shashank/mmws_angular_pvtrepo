from django.apps import apps
from django.contrib import admin
from django.contrib.admin.sites import AlreadyRegistered

from .models import (
    Fluid,
    FluidType,
    MeasurementFuelsondingFinal,
    TankCategory,
    TankFluidUnit,
)

# Register your models here.

admin.site.register(TankCategory)
admin.site.register(TankFluidUnit)
admin.site.register(FluidType)
admin.site.register(Fluid)
admin.site.register(MeasurementFuelsondingFinal)

for model in apps.get_app_config("tank").get_models():
    try:
        admin.site.register(model)
    except AlreadyRegistered:
        pass
