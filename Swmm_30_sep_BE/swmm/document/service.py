import requests

from django.conf import settings
from django.http import HttpResponse
from rest_framework import status
from rest_framework.response import Response


class DocumentService:

    CONTENT_TYPES = {
        "pdf": "application/pdf",
        "csv": "text/csv",
        "excel": (
            "application/vnd.openxmlformats-officedocument"
            ".spreadsheetml.sheet"
        ),
    }

    EXTENSIONS = {
        "pdf": "pdf",
        "csv": "csv",
        "excel": "xlsx",
    }

    @staticmethod
    def list(view, request, filename, *args, **kwargs):
        report_type = request.query_params.get("report_type")

        queryset = view.filter_queryset(
            view.get_queryset()
        )

        serializer = view.get_serializer(
            queryset,
            many=True,
        )

        data = serializer.data

        if report_type in ["pdf", "csv", "excel"]:
            return DocumentService.send_to_document_service(
                report_type=report_type,
                data=data,
                filename=filename,
            )

        return Response(data)

    @staticmethod
    def send_to_document_service(report_type, data,filename):
        if not data:
            return Response(
                {"detail": "Data is not available."},
                status=status.HTTP_200_OK,
            )
        # document_service_url = settings.DOCUMENT_SERVICE_URLS.get(report_type)
        document_service_url = settings.DOCUMENT_SERVICE_URLS

        if not document_service_url:
            return Response(
                {"detail": f"Unsupported report type: {report_type}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            response = requests.post(
                document_service_url,
                json={
                    "report_type": report_type,
                    "data": data,

                },
                timeout=60,
            )
        except requests.RequestException as exc:
            return Response(
                {
                    "detail": "Document service is unavailable.",
                    "error": str(exc),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if not response.ok:
            return Response(
                {
                    "detail": "Document service failed.",
                    "error": response.text,
                },
                status=response.status_code,
            )

        file_response = HttpResponse(
            response.content,
            content_type=DocumentService.CONTENT_TYPES[report_type],
        )

        file_response["Content-Disposition"] = (
            f'attachment; filename="{filename}.'
            f'{DocumentService.EXTENSIONS[report_type]}"'
        )

        return file_response
