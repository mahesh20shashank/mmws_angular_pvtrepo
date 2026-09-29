"""Excel import/export machinery for `obs` viewsets, plus reading the Ship Inventory
import's `PICTURE PATH` column off disk.

`image_import.py` was folded into this module during the obs package-consolidation pass -
both are import-pipeline file-handling machinery, and `resolve_import_image` below is only
ever used from the pipeline this module's `ExcelImportExportMixin` supports.
"""

import json
import os
from collections import namedtuple
from io import BytesIO

from django.conf import settings
from django.core.files.base import ContentFile
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
EXCLUDED_EXCEL_FIELDS = (
    serializers.FileField,
    serializers.ImageField,
    serializers.HiddenField,
)

# Everything `_parse_excel_workbook` extracts from an uploaded sheet, shared by `import_excel`
# and (for `obs.SparesViewSet`) the richer `import_excel_preview`/`import_excel_commit_valid`
# actions — `unknown_headers` is the exact same "neither blank-mapped nor recognized" set
# `import_excel` has always hard-rejected on; the preview/commit actions choose to tolerate it
# instead, which is why it's surfaced here rather than acted on inside this helper.
ParsedExcelImport = namedtuple(
    "ParsedExcelImport",
    [
        "original_headers",
        "normalized_headers",
        "allowed_fields",
        "unknown_headers",
        "raw_rows",
    ],
)


def _excel_value(value):
    if value is None:
        return ""
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, default=str)
    return value


def _import_value(field, value):
    if value is None or value == "":
        return None
    if isinstance(field, serializers.ManyRelatedField) and isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return value


def _header_key(value):
    return "".join(char for char in str(value).upper() if char.isalnum())


# Developed by Unknown: The curated import template workbooks carry a GUIDANCE sheet first and
# the data on a second sheet named OBS, so the workbook's active sheet is guidance text rather
# than data. The name lives here so there is exactly one place it is written.
IMPORT_SHEET_NAME = "OBS"


def _select_import_worksheet(workbook):
    """Return the worksheet an import should read - the sheet named `OBS` where the workbook has
    one, otherwise the active sheet, unchanged from previous behaviour. The name is matched
    trimmed and case-insensitively because a sheet name is user-editable. No sheet index is
    assumed, so a workbook that reorders its sheets still reads correctly. Returns `None` only
    for a workbook carrying no sheet at all, which the caller reports through its existing
    missing-header-row response."""
    target = IMPORT_SHEET_NAME.casefold()
    for sheet_name in workbook.sheetnames:
        if str(sheet_name).strip().casefold() == target:
            return workbook[sheet_name]
    return workbook.active


class ExcelImportExportMixin:
    excel_max_rows = MAX_EXCEL_ROWS

    def get_excel_export_fields(self):
        serializer = self.get_serializer()
        return [
            field_name
            for field_name, field in serializer.fields.items()
            if not isinstance(field, EXCLUDED_EXCEL_FIELDS)
        ]

    def get_excel_import_fields(self):
        serializer = self.get_serializer()
        return [
            field_name
            for field_name, field in serializer.fields.items()
            if not field.read_only and not isinstance(field, EXCLUDED_EXCEL_FIELDS)
        ]

    def get_excel_import_header_map(self):
        return {}

    def normalize_excel_import_headers(self, headers):
        aliases = {
            _header_key(source): target
            for source, target in self.get_excel_import_header_map().items()
        }
        return [
            aliases.get(_header_key(header), header) if header else ""
            for header in headers
        ]

    def build_excel_import_payload(self, row, serializer_fields):
        return {
            field_name: _import_value(serializer_fields[field_name], value)
            for field_name, value in row.items()
            if field_name
            and field_name in serializer_fields
            and value not in (None, "")
        }

    def _parse_excel_workbook(self, request):
        """Load + header-normalize + row-extract an uploaded `.xlsx`. Returns
        `(error_response, parsed)` — exactly one of the two is `None`. Extracted verbatim from
        `import_excel` (below) so `import_excel_preview`/`import_excel_commit_valid` (obs
        `SparesViewSet`) can reuse the same parsing without duplicating it; `import_excel` itself
        is refactored to call this and is unchanged in behavior."""
        uploaded_file = request.FILES.get("file") or request.FILES.get("excel")
        if uploaded_file is None:
            return (
                Response(
                    {"file": ["An Excel file is required."]},
                    status=status.HTTP_400_BAD_REQUEST,
                ),
                None,
            )
        if not uploaded_file.name.lower().endswith(".xlsx"):
            return (
                Response(
                    {"file": ["Only .xlsx files are supported."]},
                    status=status.HTTP_400_BAD_REQUEST,
                ),
                None,
            )

        try:
            workbook = load_workbook(uploaded_file, read_only=True, data_only=True)
        except Exception:
            return (
                Response(
                    {"file": ["The uploaded Excel file is invalid or corrupted."]},
                    status=status.HTTP_400_BAD_REQUEST,
                ),
                None,
            )

        worksheet = _select_import_worksheet(workbook)
        # Developed by Unknown: A workbook carrying no sheet at all yields `None` above. It is
        # reported through the existing missing-header-row response below rather than raising.
        rows = (
            worksheet.iter_rows(values_only=True)
            if worksheet is not None
            else iter(())
        )
        headers = next(rows, None)
        if not headers:
            return (
                Response(
                    {"file": ["The Excel file does not contain a header row."]},
                    status=status.HTTP_400_BAD_REQUEST,
                ),
                None,
            )

        original_headers = [
            str(header).strip() if header is not None else "" for header in headers
        ]
        normalized_headers = self.normalize_excel_import_headers(original_headers)
        allowed_fields = self.get_excel_import_fields()
        mapped_fields = [
            field_name
            for field_name in self.get_excel_import_header_map().values()
            if field_name
        ]
        allowed_fields = [*allowed_fields, *mapped_fields]
        unknown_headers = [
            original_header
            for original_header, header in zip(
                original_headers, normalized_headers, strict=False
            )
            if header and header not in allowed_fields
        ]

        raw_rows = []
        data_rows_seen = 0
        empty_tail_rows = 0
        for row_number, values in enumerate(rows, start=2):
            if not any(value not in (None, "") for value in values):
                empty_tail_rows += 1
                if empty_tail_rows >= 50:
                    break
                continue

            empty_tail_rows = 0
            data_rows_seen += 1
            if data_rows_seen > self.excel_max_rows:
                return (
                    Response(
                        {
                            "file": [
                                (
                                    "Excel import is limited to "
                                    f"{self.excel_max_rows} data rows."
                                )
                            ]
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    ),
                    None,
                )
            raw_rows.append(
                (row_number, dict(zip(normalized_headers, values, strict=False)))
            )
        workbook.close()

        return (
            None,
            ParsedExcelImport(
                original_headers=original_headers,
                normalized_headers=normalized_headers,
                allowed_fields=allowed_fields,
                unknown_headers=unknown_headers,
                raw_rows=raw_rows,
            ),
        )

    @extend_schema(
        responses={
            (
                200,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ): OpenApiTypes.BINARY
        }
    )
    @action(detail=False, methods=["get"], url_path="export-excel")
    def export_excel(self, request):
        fields = self.get_excel_export_fields()
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)

        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = self.get_queryset().model._meta.model_name[:31]
        worksheet.append(fields)
        for record in serializer.data:
            worksheet.append([_excel_value(record.get(field)) for field in fields])

        output = BytesIO()
        workbook.save(output)
        model_name = self.get_queryset().model._meta.model_name
        response = HttpResponse(
            output.getvalue(),
            content_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
        )
        response["Content-Disposition"] = (
            f'attachment; filename="{model_name}_export.xlsx"'
        )
        return response

    @extend_schema(
        responses={
            (
                200,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ): OpenApiTypes.BINARY
        }
    )
    @action(detail=False, methods=["get"], url_path="download-template")
    def download_template(self, request):
        fields = self.get_excel_import_fields()
        workbook = Workbook()
        worksheet = workbook.active
        model_name = self.get_queryset().model._meta.model_name
        worksheet.title = model_name[:31]
        worksheet.append(fields)

        output = BytesIO()
        workbook.save(output)
        response = HttpResponse(
            output.getvalue(),
            content_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
        )
        response["Content-Disposition"] = (
            f'attachment; filename="{model_name}_template.xlsx"'
        )
        return response

    @extend_schema(
        request=inline_serializer(
            name="OnboardSparesExcelImportRequest",
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
        error_response, parsed = self._parse_excel_workbook(request)
        if error_response is not None:
            return error_response

        if parsed.unknown_headers:
            return Response(
                {
                    "headers": [
                        "Unsupported columns: " + ", ".join(parsed.unknown_headers)
                    ],
                    "allowed_columns": parsed.allowed_fields,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        dry_run = str(request.data.get("dry_run", "")).lower() in {
            "1",
            "true",
            "yes",
        }
        try:
            with transaction.atomic():
                errors = []
                valid_rows = []
                serializer_fields = self.get_serializer().fields
                for row_number, row in parsed.raw_rows:
                    payload = self.build_excel_import_payload(row, serializer_fields)
                    # Bulk import is exempt from the single-spare >20-holding-needs-a-
                    # reason rule (see SparesSerializer.validate()) — a storekeeper
                    # can't type a written reason per spreadsheet row.
                    serializer = self.get_serializer(
                        data=payload,
                        context={
                            **self.get_serializer_context(),
                            "skip_high_holding_check": True,
                        },
                    )
                    if serializer.is_valid():
                        valid_rows.append((row_number, serializer))
                    else:
                        errors.append({"row": row_number, "errors": serializer.errors})

                if errors:
                    transaction.set_rollback(True)
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
                    transaction.set_rollback(True)
                    return Response(
                        {
                            "dry_run": True,
                            "valid_rows": len(valid_rows),
                            "invalid_rows": 0,
                            "errors": [],
                        }
                    )

                for _, serializer in valid_rows:
                    self.perform_create(serializer)
        except Exception:
            return Response(
                {
                    "imported": 0,
                    "detail": "Excel import was rolled back.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {"imported": len(valid_rows), "invalid_rows": 0, "errors": []},
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------------------
# Reading the Ship Inventory import's `PICTURE PATH` column off disk.
#
# Folded in from the former `obs/image_import.py` during the obs package-consolidation
# pass.
#
# The workbook's PICTURE PATH cell holds a path on the storekeeper's own machine - the
# shipped templates carry values like `D:\\SPTA PICS\\1.JPG`. The column used to be parsed,
# displayed in the import preview and then thrown away, so every imported spare kept the
# model's default photo. It is now read: the server opens that path directly and the bytes
# become `Spares.image`.
#
# That means A CLIENT-SUPPLIED STRING REACHES THE FILESYSTEM, and this section is the only
# place it does. Everything the import knows about deciding whether a path may be opened
# lives here, so there is one set of rules and one place to tighten them:
#
#   - the extension must be one of `IMAGE_EXTENSIONS` (the same three `spare_image_upload_
#     path` accepts - anything else would land on `obs/default.png` and silently overwrite
#     it),
#   - the file must survive `PIL.Image.verify()`, so an `.exe` renamed to `.jpg` is refused,
#   - it must be no larger than `settings.OBS_IMAGE_IMPORT_MAX_BYTES`, and
#   - if `settings.OBS_IMAGE_IMPORT_ROOTS` is configured, its real path must sit inside one
#     of them. That setting is empty by default, because a ship's picture folder can be
#     anywhere and the feature has to work with no configuration at all.
#
# NOTHING HERE EVER RAISES. Every refusal comes back as a plain sentence for the operator,
# and the caller turns that into an advisory - never an error. A missing photograph must
# not stop a stores import: the row saves with the default image and the sentence says why.
# ---------------------------------------------------------------------------------------

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}


def _is_inside(path, root):
    try:
        return os.path.commonpath([path, root]) == root
    except ValueError:
        # Raised on Windows when the two paths are on different drives, which is a plain
        # "not inside" rather than a failure.
        return False


def resolve_import_image(path_text, read_bytes=True):
    """Read one PICTURE PATH cell.

    Returns a `(file, reason)` pair, exactly one half of which is ever set:

      - `(None, None)`  - the cell was blank. Not a problem and not reported.
      - `(None, reason)` - there was a path but it cannot be used; `reason` is one sentence
        addressed to the operator, naming the path so they can go and look at it.
      - `(file, None)`  - a `ContentFile` holding the bytes, named with the ORIGINAL basename
        so `spare_image_upload_path` sees the real extension.

    The bytes are read eagerly rather than handing back an open handle: the caller attaches
    this inside a per-row savepoint and an open file descriptor outliving that is a leak on
    every rolled-back row.

    `read_bytes=False` runs every check and returns `(None, None)` on success instead of the
    file. That is what the PREVIEW uses: it needs to know whether each path is readable so it
    can advise on the ones that are not, and it discards the bytes in every case, so loading a
    fifty-row sheet's worth of photographs into memory to throw them away would be waste.
    """
    text = (path_text or "").strip().strip('"')
    if not text:
        return None, None

    if "\x00" in text:
        return None, "PICTURE PATH is not a valid file path."

    try:
        path = os.path.abspath(os.path.expandvars(os.path.expanduser(text)))
    except (OSError, ValueError):
        return None, f"PICTURE PATH could not be read as a file path: {text}"

    extension = os.path.splitext(path)[1].lower()
    if extension not in IMAGE_EXTENSIONS:
        return None, (
            f"PICTURE PATH must point to a .png, .jpg or .jpeg file - {text} is not one."
        )

    roots = getattr(settings, "OBS_IMAGE_IMPORT_ROOTS", []) or []
    if roots:
        try:
            real_path = os.path.realpath(path)
        except OSError:
            return None, f"The picture at {text} could not be read."
        # `realpath` first, so a symlink pointing out of an allowed folder is caught.
        if not any(_is_inside(real_path, os.path.realpath(root)) for root in roots):
            return None, (
                f"The picture at {text} is outside the folders this server is allowed to "
                "read pictures from."
            )

    if not os.path.isfile(path):
        return None, f"No picture file was found on the server at {text}."

    try:
        size = os.path.getsize(path)
    except OSError:
        return None, f"The picture at {text} could not be read."

    max_bytes = getattr(settings, "OBS_IMAGE_IMPORT_MAX_BYTES", 10 * 1024 * 1024)
    if size > max_bytes:
        return None, (
            f"The picture at {text} is {size // 1024} KB, larger than the "
            f"{max_bytes // 1024} KB limit."
        )
    if size == 0:
        return None, f"The picture at {text} is empty."

    # Pillow is already a hard requirement of `models.ImageField`, so this adds no dependency.
    # `verify()` reads the header and refuses anything that is not really an image; it leaves
    # the file object unusable afterwards, which is why the bytes are read separately below.
    try:
        from PIL import Image

        with Image.open(path) as probe:
            probe.verify()
    except Exception:
        return None, f"The file at {text} is not a readable image."

    if not read_bytes:
        return None, None

    try:
        with open(path, "rb") as handle:
            payload = handle.read()
    except OSError:
        return None, f"The picture at {text} could not be read."

    return ContentFile(payload, name=os.path.basename(path)), None
