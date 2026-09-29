from django.contrib import admin

from .models import Duty, TimeSlot, WorkAssignment


admin.site.register(Duty)
admin.site.register(TimeSlot)
admin.site.register(WorkAssignment)
