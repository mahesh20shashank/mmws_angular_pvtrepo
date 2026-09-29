from django.urls import path

from documents.views import (
    # DocumentDetailView,
    DocumentDownloadView,
    # DocumentExportAPIView,
    # DocumentListView,
    DocumentUploadView,
    DocumentView,
)

urlpatterns = [
    path("upload/", DocumentUploadView.as_view(), name="document-upload"),
    path("<uuid:document_id>/download/",DocumentDownloadView.as_view(),name="document-download"),
    path("generate_report/", DocumentView.as_view(), name="document"),

]
