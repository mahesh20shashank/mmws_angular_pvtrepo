from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

app_name = "hotwork"

router = DefaultRouter()
router.register("", views.HotworkViewSet, basename="hotwork")

urlpatterns = [
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
    path("", include(router.urls)),
]
urlpatterns += router.urls
