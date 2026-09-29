from django.urls import path

from . import views

app_name = "delegation"

urlpatterns = [
    path("transfers/", views.RightsTransferView.as_view(), name="transfers"),
    path(
        "transfers/<int:pk>/",
        views.RightsTransferView.as_view(),
        name="transfer-action",
    ),
    path(
        "transfers/<int:pk>/logs/",
        views.RightsTransferLogView.as_view(),
        name="transfer-logs",
    ),
]
