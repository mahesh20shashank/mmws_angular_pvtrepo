from django.contrib import admin

from .models import Event, PlannerActivity

# Register your models here.

admin.site.register(Event)
admin.site.register(PlannerActivity)
