from django.urls import path
from . import views

app_name = "dl_monitoring"

urlpatterns = [
    # Dashboard
    path("dashboard/", views.DLDashboardAPIView.as_view(), name="dashboard"),
    path(
        "dashboard-counts/",
        views.DLDashboardCountsAPIView.as_view(),
        name="dl_dashboard_counts",
    ),
    path(
        "dashboard-breakdown/",
        views.DLDashboardBreakdownAPIView.as_view(),
        name="dl_dashboard_breakdown",
    ),
    # Master
    path("master/", views.DLMasterAPIView.as_view(), name="dl_master"),
    path("import-excel/", views.ImportExcelAPIView.as_view(), name="import_excel_file"),
    # Tracking
    path("dl_tracking/", views.DLTrackingAPIView.as_view(), name="dl_tracking"),
    path(
        "update_dl_tracking/",
        views.UpdateDLTrackingAPIView.as_view(),
        name="update_dl_tracking",
    ),
    path(
        "close_dl_tracking/",
        views.CloseDLTrackingAPIView.as_view(),
        name="close_dl_tracking",
    ),
    path("dl_history/", views.DLHistoryAPIView.as_view(), name="dl_history"),
    # Other Tracking
    path("dl2tracking/", views.DL2TrackingAPIView.as_view(), name="dl2tracking"),
    path("dl3tracking/", views.DL3TrackingAPIView.as_view(), name="dl3tracking"),
    # Sync
    path(
        "sync_navyojana/", views.SyncNavYojanaAPIView.as_view(), name="sync_navyojana"
    ),
]
