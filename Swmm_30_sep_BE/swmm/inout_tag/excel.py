"""Generic Excel import/export for DRF ``ModelViewSet``s.

Mix :class:`ExcelImportExportMixin` into a viewset (see
:class:`inout_tag.views.TagOutViewSet` / ``TagInViewSet``) to get three extra
list-route actions, driven entirely off the viewset's own serializer:

===========================  ==============================================
``GET  export-excel``        Every row the caller may list, one sheet, one
                             column per serializer field.
``GET  download-template``   An empty sheet whose header row is the
                             *writable* serializer fields - the shape
                             ``import-excel`` expects.
``POST import-excel``        Upload a filled-in template. Multipart, field
                             ``file`` (``.xlsx``); optional ``dry_run`` to
                             validate without writing.
===========================  ==============================================

Import contract
---------------
* The header row must contain only known writable fields (unknown columns ->
  400 with the allowed list).
* Every data row is fed through ``get_serializer(data=row)``. If *any* row is
  invalid the whole request fails 400 with a per-row error list and nothing is
  written (all-or-nothing, one ``transaction.atomic`` block).
* Valid rows are created via ``self.perform_create(serializer)`` - so the
  viewset's own rules still apply (e.g. tag-out reason-field stripping,
  department fan-out for tag-ins).
* ``dry_run`` (``"1"``/``"true"``/``"yes"``) validates and reports counts
  without touching the database.
* Comma-separated cells are split into lists for many-to-many fields
  (``departments_affected``).
* Hard cap of :data:`MAX_EXCEL_ROWS` data rows per upload.
"""

import json
from io import BytesIO

from django.db import transaction
from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from openpyxl import Workbook, load_workbook
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

MAX_EXCEL_ROWS = 5000

# Field types that make no sense in a flat spreadsheet cell - skipped in both
# directions.
EXCLUDED_EXCEL_FIELDS = (
    serializers.FileField,
    serializers.ImageField,
    serializers.HiddenField,
)

_XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_TRUTHY = {"1", "true", "yes"}


def _excel_value(value):
    """Coerce a serialized value into something ``openpyxl`` can write:
    ``None`` -> ``""``; dict/list/tuple -> compact JSON; everything else as-is.
    """
    if value is None:
        return ""
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, default=str)
    return value


def _import_value(field, value):
    """Coerce a raw cell value into serializer input: blank -> ``None``;
    a comma-joined string into a list for many-to-many fields; otherwise
    unchanged."""
    if value is None or value == "":
        return None
    if isinstance(field, serializers.ManyRelatedField) and isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return value


class ExcelImportExportMixin:
    """Adds ``export-excel`` / ``download-template`` / ``import-excel`` to a
    ``ModelViewSet``. Requires the host viewset to provide ``get_serializer``,
    ``get_queryset``, ``filter_queryset`` and ``perform_create`` (all standard
    on ``ModelViewSet``)."""

    excel_max_rows = MAX_EXCEL_ROWS

    def get_excel_export_fields(self):
        """All serializer fields (read + write) minus the excluded types."""
        serializer = self.get_serializer()
        return [
            name
            for name, field in serializer.fields.items()
            if not isinstance(field, EXCLUDED_EXCEL_FIELDS)
        ]

    def get_excel_import_fields(self):
        """Writable serializer fields minus the excluded types - the template
        header and the set ``import-excel`` accepts."""
        serializer = self.get_serializer()
        return [
            name
            for name, field in serializer.fields.items()
            if not field.read_only and not isinstance(field, EXCLUDED_EXCEL_FIELDS)
        ]

    @extend_schema(responses={(200, _XLSX_CONTENT_TYPE): OpenApiTypes.BINARY})
    @action(detail=False, methods=["get"], url_path="export-excel")
    def export_excel(self, request):
        """Stream every row the caller may list as an ``.xlsx`` workbook.

        Uses ``filter_queryset(get_queryset())`` - and the host viewset scopes
        ``get_queryset`` for the ``export_excel`` action exactly as for
        ``list`` - so an export never leaks rows outside the caller's
        department scope.
        """
        fields = self.get_excel_export_fields()
        queryset = self.filter_queryset(self.get_queryset())
        rows = self.get_serializer(queryset, many=True)

        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = self.get_queryset().model._meta.model_name[:31]
        worksheet.append(fields)
        for record in rows.data:
            worksheet.append([_excel_value(record.get(field)) for field in fields])

        output = BytesIO()
        workbook.save(output)
        model_name = self.get_queryset().model._meta.model_name
        response = HttpResponse(output.getvalue(), content_type=_XLSX_CONTENT_TYPE)
        response["Content-Disposition"] = (
            f'attachment; filename="{model_name}_export.xlsx"'
        )
        return response

    @extend_schema(responses={(200, _XLSX_CONTENT_TYPE): OpenApiTypes.BINARY})
    @action(detail=False, methods=["get"], url_path="download-template")
    def download_template(self, request):
        """An empty workbook whose only row is the writable-field header."""
        fields = self.get_excel_import_fields()
        workbook = Workbook()
        worksheet = workbook.active
        model_name = self.get_queryset().model._meta.model_name
        worksheet.title = model_name[:31]
        worksheet.append(fields)

        output = BytesIO()
        workbook.save(output)
        response = HttpResponse(output.getvalue(), content_type=_XLSX_CONTENT_TYPE)
        response["Content-Disposition"] = (
            f'attachment; filename="{model_name}_template.xlsx"'
        )
        return response

    @extend_schema(
        request=inline_serializer(
            name="InOutTagExcelImportRequest",
            fields={
                "file": serializers.FileField(),
                "dry_run": serializers.BooleanField(required=False),
            },
        )
    )
    @action(
        detail=False,
        methods=["post"],
        url_path="import-excel",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_excel(self, request):
        """Validate and (unless ``dry_run``) create rows from an uploaded
        ``.xlsx``. All-or-nothing: one bad row fails the whole upload."""
        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            return Response(
                {"file": ["An Excel file is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not uploaded_file.name.lower().endswith(".xlsx"):
            return Response(
                {"file": ["Only .xlsx files are supported."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            workbook = load_workbook(uploaded_file, read_only=True, data_only=True)
        except Exception:
            return Response(
                {"file": ["The uploaded Excel file is invalid or corrupted."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        worksheet = workbook.active
        rows = worksheet.iter_rows(values_only=True)
        headers = next(rows, None)
        if not headers:
            return Response(
                {"file": ["The Excel file does not contain a header row."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        headers = [
            str(header).strip() if header is not None else "" for header in headers
        ]
        allowed_fields = self.get_excel_import_fields()
        unknown_fields = [
            header for header in headers if header and header not in allowed_fields
        ]
        if unknown_fields:
            return Response(
                {
                    "headers": ["Unsupported columns: " + ", ".join(unknown_fields)],
                    "allowed_columns": allowed_fields,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Collect non-empty data rows up front so we can enforce the row cap
        # before doing any per-row serializer work.
        raw_rows = []
        for row_number, values in enumerate(rows, start=2):
            if row_number > self.excel_max_rows + 1:
                return Response(
                    {
                        "file": [
                            f"Excel import is limited to {self.excel_max_rows} "
                            "data rows."
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not any(value not in (None, "") for value in values):
                continue
            raw_rows.append((row_number, dict(zip(headers, values, strict=False))))
        workbook.close()

        dry_run = str(request.data.get("dry_run", "")).lower() in _TRUTHY

        errors = []
        valid_rows = []
        serializer_fields = self.get_serializer().fields
        for row_number, row in raw_rows:
            payload = {
                name: _import_value(serializer_fields[name], value)
                for name, value in row.items()
                if name and value not in (None, "")
            }
            serializer = self.get_serializer(data=payload)
            if serializer.is_valid():
                valid_rows.append((row_number, serializer))
            else:
                errors.append({"row": row_number, "errors": serializer.errors})

        if errors:
            return Response(
                {
                    "imported": 0,
                    "valid_rows": len(valid_rows),
                    "invalid_rows": len(errors),
                    "errors": errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if dry_run:
            return Response(
                {
                    "dry_run": True,
                    "valid_rows": len(valid_rows),
                    "invalid_rows": 0,
                    "errors": [],
                }
            )

        try:
            with transaction.atomic():
                for _, serializer in valid_rows:
                    self.perform_create(serializer)
        except Exception:
            return Response(
                {"imported": 0, "detail": "Excel import was rolled back."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {"imported": len(valid_rows), "invalid_rows": 0, "errors": []},
            status=status.HTTP_201_CREATED,
        )
