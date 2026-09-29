from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

app_name = "activity_planner"

router = DefaultRouter()
router.register(
    r"planner-activities", views.PlannerActivityViewSet, basename="planner-activity"
)
router.register(r"", views.EventViewSet, basename="event")

urlpatterns = [
    path("", include(router.urls)),
    # Custom endpoints available via ViewSet actions:
    # shift-routines: GET /api/v1/events/planner-activities/shift-routines/
    # set-revised-date: PUT /api/v1/events/planner-activities/set-revised-date/
    # overdue-darts: GET /api/v1/events/planner-activities/overdue-darts/
    # pending-planning: GET /api/v1/events/planner-activities/pending-planning/
    # dashboard: GET /api/v1/events/planner-activities/dashboard/
]
