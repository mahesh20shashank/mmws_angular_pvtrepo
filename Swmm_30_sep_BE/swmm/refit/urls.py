from rest_framework.routers import DefaultRouter

from .views import (
    RefitDashboardViewSet,
    RefitRoutineViewSet,
)

router = DefaultRouter()
router.register("refit_search", RefitRoutineViewSet, basename="refit-routine")
router.register("dashboard", RefitDashboardViewSet, basename="refit-dashboard")

urlpatterns = router.urls
