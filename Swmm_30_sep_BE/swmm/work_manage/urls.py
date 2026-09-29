from rest_framework.routers import DefaultRouter

from .views import DutyViewSet, TimeSlotViewSet, WorkAssignmentViewSet

router = DefaultRouter()
router.register("duties", DutyViewSet, basename="work-duty")
router.register("time-slots", TimeSlotViewSet, basename="work-time-slot")
router.register("assignments", WorkAssignmentViewSet, basename="work-assignment")

urlpatterns = router.urls
