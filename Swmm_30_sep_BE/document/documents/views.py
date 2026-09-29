from django.http import HttpResponse
from pathlib import PurePosixPath
from django.http import FileResponse
from documents.models import Document, FileObject
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView
from rest_framework.response import Response
from documents.serializers import (DocumentSerializer,DocumentUploadSerializer)
from drf_spectacular.utils import extend_schema
from documents.storage import document_storage
from django.db import transaction
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from .services.pdf_generator import generate_pdf
from .services.csv_generator import generate_csv
from .services.excel_generator import generate_excel


class DocumentUploadView(APIView):
    parser_classes = (MultiPartParser,FormParser)
    @extend_schema(request=DocumentUploadSerializer,responses={201: DocumentSerializer },)
    def post(self, request):
        serializer = DocumentUploadSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        upload = data["file"]
        checksum = document_storage.checksum(upload)

        relative_path = document_storage.build_relative_path(
            source_system=data["source_system"],
            ship_code=data["ship_code"],
            original_name=upload.name,
        )

        stored_path = document_storage.save(
            relative_path=relative_path,
            file_obj=upload,
        )

        generated_filename = PurePosixPath(
            relative_path
        ).name

        with transaction.atomic():
            file_object = FileObject.objects.create(
                original_name=generated_filename,
                stored_path=stored_path,
                size=upload.size,
                mime_type=upload.content_type or "",
                checksum=checksum,
                source_system=data["source_system"],
                uploaded_by_user_id=data["uploaded_by_user_id"],
            )

            document = Document.objects.create(
                file=file_object,
                title=data["title"],
                description=data["description"],
                category=data["category"],
                tags=data["tags"],
                expiry_date=data["expiry_date"],
                source_system=data["source_system"],
                reference_type=data["reference_type"],
                reference_id=data["reference_id"],
                is_global=data["is_global"],
                department_id=data["department_id"],
                ship_or_unit_id=data["ship_or_unit_id"],
                shared_with_user_ids=data["shared_with_user_ids"],
                created_by_user_id=data["uploaded_by_user_id"],
            )

        return Response(
            DocumentSerializer(document).data,
            status=status.HTTP_201_CREATED,
        )

class DocumentDownloadView(APIView):

    def get(self, request, document_id):
        try:
            document = (
                Document.objects
                .select_related("file")
                .get(file__id=document_id)
            )
        except Document.DoesNotExist:
            raise NotFound(
                "Document not found."
            )

        file_object = document.file

        if not document_storage.exists(
            file_object.stored_path
        ):
            raise NotFound(
                "File not found in storage."
            )

        file_obj = document_storage.open(
            file_object.stored_path
        )

        filename = (
            file_object.original_name
            or PurePosixPath(
                file_object.stored_path
            ).name
        )

        return FileResponse(
            file_obj,
            as_attachment=True,
            filename=filename,
            content_type=(
                file_object.mime_type
                or "application/octet-stream"
            ),
        )
class DocumentView(APIView):

    def post(self, request, *args, **kwargs):

        report_type = request.data.get("report_type")
        data = request.data.get("data", [])

        if report_type not in ["pdf", "csv","excel"]:
            return Response(
                {
                    "detail": "Only pdf, csv, and excel reports are supported."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not data:
            return Response(
                {"detail": "No data received."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if report_type == "pdf":
            pdf_file = generate_pdf(data)

            response = HttpResponse(
                pdf_file,
                content_type="application/pdf",
            )

            response["Content-Disposition"] = (
                'attachment; filename="ship-equipment-report.pdf"'
            )

            return response

        if report_type == "csv":
            csv_file = generate_csv(data)
            print(csv_file)

            response = HttpResponse(
                csv_file,
                content_type="text/csv",
            )

            response["Content-Disposition"] = (
                'attachment; filename="ship-equipment-report.csv"'
            )
            return response

        if report_type == "excel":
            excel_file = generate_excel(data)

            response = HttpResponse(
                excel_file,
                content_type=(
                    "application/vnd.openxmlformats-officedocument."
                    "spreadsheetml.sheet"
                ),
            )

            response["Content-Disposition"] = (
                'attachment; filename="ship-equipment-report.xlsx"'
            )

            return response
