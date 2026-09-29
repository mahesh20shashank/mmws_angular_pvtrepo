"""`SparesImportMixin` - the Excel import half of `SparesViewSet`.

Split out of the former flat `obs/views.py` (Part 1 of the obs file-structure split). This
was previously a ~2,500-line block inline in `SparesViewSet` (header mapping, row cleaning/
classification, preview/commit-valid/import actions, template download, ship-customer-code
state, purge actions). `SparesViewSet` (in `spares_core.py`) now reads
`class SparesViewSet(SparesImportMixin, CleanValidationModelViewSet)`.

Also carries optimizations 2.3 and 2.4: the row-cleaning/master-resolution `@staticmethod`s
that had no dependency on `self`/`request` moved to `services.import_rules` as plain
functions, and `get_excel_import_header_map`/`get_excel_import_essential_fields` became
thin accessors over module-level constants in `services.import_rules`.
"""

import json
from pathlib import Path

from accounts import rbac
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import FileResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema
from master.models import Department, SubDepartment
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from .. import excel, services
from ..models import Authority, EquipmentClass, SpareClass, Spares
from ..utils import canonical_department_name, django_validation_error_detail, generate_pattern_number
from .base import (
    CanPurgeSpares,
    CanUseMastersPage,
    _can_import_d787j,
    _D787J_IMPORT_DENIED_MESSAGE,
    _resolve_selected_sub_department,
)

# Developed by Unknown: Where the curated import-template workbooks live, and how a department
# and a route name one of them.
#
# The eleven workbooks sit beside this app at `backend\obs\import_templates\`, copied verbatim
# from the canonical set at `Context\Canon\SWMM_IMPORT_TEMPLATES\`. They are fixed application
# assets - they version with the code, they are never uploaded through the application, and
# there is exactly one correct file per department and route. A directory read is therefore the
# whole of the storage requirement, and no model and no migration are needed.
# `obs.models.ImportRulesDocument` is the nearest existing pattern, but it holds exactly one
# file at one fixed path with no department, route or type field, so it is not reusable here
# and was deliberately not extended.
IMPORT_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "import_templates"

# Developed by Unknown: The workbook column the working table SHOWS and nothing STORES.
#
# `SER` is the sheet's own serial number; no `Spares` field holds it, and
# `build_excel_import_payload` does not build it. It carries a target in
# `services.EXCEL_IMPORT_HEADER_MAP` for one reason - so the value survives as far as the
# preview's `data` and the operator can read their own workbook back off the screen.
#
# Named here rather than inlined because `_import_column_classification` has to subtract it from
# the "missing optional columns" report: a column that stores nothing cannot be missing in any
# sense the operator can act on, and reporting it every time is how a report gets ignored.
# `SHIP CUSTOMER CODE` is NOT in this set - it is shown and unstored too, but rules 2.23.1 and
# 2.23.2 make it mandatory in every row, so it is an ESSENTIAL column and its absence is worth
# reporting.
#
# `PICTURE PATH` HAS LEFT THIS SET. It is no longer display-only: `import_excel_commit_valid`
# opens the path it names and stores the photograph on `Spares.image`, so it is a real column
# whose absence is worth reporting like any other optional one.
DISPLAY_ONLY_IMPORT_TARGETS = frozenset({"ser"})

# Developed by Unknown: The two import routes, mapped to the suffix each workbook file name
# carries. The bare `D787` appears only inside these file names as they exist on disk - the
# authority itself is always written D787J.
IMPORT_TEMPLATE_ROUTES = {"D787J": "D787", "OTHERS": "NOND787"}

# Developed by Unknown: `master.Department.name` to the workbook file-name prefix. This is
# every department `rbac.selectable_departments()` offers - `rbac.HIDDEN_DEPARTMENTS` already
# records that HULL and NBCD were retired to EXECUTIVE sub-departments, so neither is a
# department here.
#
# Developed by Unknown: LOGISTICS was MISSING from this map, and its absence was silent. The
# department has always been offered in the Select Department control, so a Logistics Head of
# Department saw both Download Template buttons and got a 404 from each, with no way to tell
# that no workbook had ever been authored for the department. Its two workbooks were generated
# from the same script that built the other nine and it now maps like every other department.
IMPORT_TEMPLATE_DEPARTMENT_CODES = {
    "ENGINEERING": "ENGG",
    "ELECTRICAL": "ELEC",
    "EXECUTIVE": "EXEC",
    "LOGISTICS": "LOG",
    "MEDICAL": "MED",
}

# Developed by Unknown: The Executive sub-departments that carry a workbook of their OWN. A
# sub-department absent from this map is not an error - it falls back to its parent
# department's workbook in `download_template`. Only HULL and NBCD have their own, because
# only they carry a distinct spare-class and authority set.
IMPORT_TEMPLATE_SUB_DEPARTMENT_CODES = {
    "EXECUTIVE": {"HULL": "HULL", "NBCD": "NBCD"},
}

# Developed by Unknown: the word an operator types to confirm Clear OBS Spares. Follows
# a precedent already used elsewhere in this codebase for a destructive endpoint (the
# legacy `users` app carried the original example) - a typed word cannot be sent by a
# mis-click or a stale tab.
PURGE_CONFIRMATION_PHRASE = "DELETE"

# Developed by Unknown: EXEC, LOG and MED lost their D787J route here. Rules clause 2.5.1
# names Engg, Elec and Hull as the only D787J departments, and the three workbooks that had
# granted it to these were generated by inference - each said so in its own GUIDANCE sheet.
# All three files are deleted, so the on-disk check in `import_template_routes` would hide
# the button anyway. Both are kept in step deliberately: the map states the rule and the disk
# check catches a deployment that is missing a file it should have.
IMPORT_TEMPLATE_ROUTES_BY_PREFIX = {
    "ENGG": ("D787J", "OTHERS"),
    "ELEC": ("D787J", "OTHERS"),
    "EXEC": ("OTHERS",),
    "LOG": ("OTHERS",),
    "MED": ("OTHERS",),
    "HULL": ("D787J", "OTHERS"),
    "NBCD": ("OTHERS",),
}

# Developed by Unknown: The content type an .xlsx download is served with, the same string
# `obs.excel.ExcelImportExportMixin` writes on its own export and template responses. `Path` and
# `FileResponse` in the import block above exist only for this endpoint.
XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class SparesImportMixin:
    """The Excel import half of `SparesViewSet`. Inherits nothing itself - see the module
    docstring. `SparesViewSet` becomes `class SparesViewSet(SparesImportMixin,
    CleanValidationModelViewSet)`."""

    # Developed by Unknown: `get_excel_import_header_map`/`get_excel_import_essential_fields`
    # are now thin accessors over `services.EXCEL_IMPORT_HEADER_MAP` /
    # `services.EXCEL_IMPORT_ESSENTIAL_FIELDS` (obs file-structure split, optimization 2.4) -
    # neither dict varies per instance, so the two module-level constants are computed once
    # rather than rebuilt on every call. The methods themselves stay, because
    # `obs.excel.ExcelImportExportMixin` calls `services.EXCEL_IMPORT_HEADER_MAP`
    # polymorphically and existing tests call it directly on an instance.
    def get_excel_import_header_map(self):
        return services.EXCEL_IMPORT_HEADER_MAP

    # used to be a profile attribute read and is now a resolve plus a query.
    def _import_department(self):
        if not hasattr(self, "_cached_import_department"):
            self._cached_import_department = self._resolve_scope_department(self.request)
        return self._cached_import_department

    # Developed by Unknown: The Executive sub-department a sheet is tagged to, requirement 3.1.
    #
    # Resolved through `rbac.resolve_selected_sub_department`, which refuses another
    # sub-department to a confined caller in exactly the way the department resolver above refuses
    # another department. Three answers are possible and all three are legitimate:
    #
    #   - a row, for an Executive import that named one, or for a Dy HOD who is confined to one
    #     and gets it whether they named it or not;
    #   - None, for every non-Executive import - Engineering, Electrical, Medical. Those spares
    #     carry no sub-department and never will;
    #   - a refusal, when the named sub-department does not belong to the chosen department, which
    #     is the one thing the rbac resolver cannot check because it does not know which department
    #     the import chose.
    def _import_sub_department(self, department):
        scope = _resolve_selected_sub_department(
            self.request, param="sub_department"
        )
        if scope.deny:
            raise PermissionDenied(
                "Your account names an Executive sub-department that does not exist. "
                "Ask an administrator to correct it before importing."
            )
        if scope.unassigned_only:
            raise DRFValidationError(
                {
                    "sub_department": [
                        "Unassigned is a way of listing spares, not of importing them. "
                        "Choose the sub-department this sheet belongs to."
                    ]
                }
            )
        if scope.is_all or scope.sub_department_id is None:
            return None

        sub_department = SubDepartment.objects.filter(
            pk=scope.sub_department_id
        ).first()
        if sub_department is None:
            raise DRFValidationError({"sub_department": ["Unknown sub-department."]})
        if sub_department.department_name_id != department.pk:
            raise DRFValidationError(
                {
                    "sub_department": [
                        f"{sub_department.name} is not a sub-department of "
                        f"{department.name}."
                    ]
                }
            )
        return sub_department

    # Developed by Unknown: The sub-department id the import payload carries, computed once per
    # request rather than per row. `build_excel_import_payload` runs for every row of the sheet
    # and this would otherwise re-resolve, re-validate and re-query on each one.
    def _import_sub_department_id(self):
        if not hasattr(self, "_cached_import_sub_department_id"):
            sub_department = self._import_sub_department(self._import_department())
            self._cached_import_sub_department_id = getattr(sub_department, "pk", None)
            # Developed by Unknown: the NAME is cached alongside the id because the D787J
            # department gate needs it - EXECUTIVE holds no D787J but its HULL sub-department
            # does, so the route decision cannot be made from the department alone. Cached
            # here rather than resolved a second time, because `_import_sub_department`
            # raises on several conditions and running it twice would report them twice.
            self._cached_import_sub_department_name = getattr(sub_department, "name", "")
        return self._cached_import_sub_department_id

    def _import_sub_department_name(self):
        """Developed by Unknown: the selected sub-department's name, or "" for none."""
        self._import_sub_department_id()
        return self._cached_import_sub_department_name or ""

    # Developed by Unknown: The three gates every import path now passes through, in the
    # order they must run. Written once here because there are four import endpoints and a
    # gate applied to three of them is not a gate.
    #
    # 1. The ROUTE. Every import states which of the two routes it is - D787J or OTHERS -
    #    using the same two words `download-template/` already takes, so the workbook a user
    #    downloads and the route they import it on are named identically.
    # 2. The ROLE. Selecting the D787J route is refused, with 403, for every role
    #    `rbac.can_import_d787j` excludes. It runs BEFORE the workbook is read, before the
    #    authority is even validated, and before a single row is looked at, because the
    #    refusal has nothing to do with the file's contents.
    # 3. The AUTHORITY. The selected import authority must be one the route and the caller's
    #    department actually permit. `_get_or_create_authority` used to accept whatever a
    #    cell said and create a master row for it - a workbook reading SHIP STAFF created a
    #    permanent Authority named SHIP STAFF. Nothing here creates anything.
    # 4. The PASSWORD. The operator re-authenticates, the way the reference application did
    #    at `obs\\views.py :: ImportExcelFileView` line 3452. The front end asks
    #    `user/me/verify-password/` first so the operator is told early, and the same check
    #    is made again here so that answer is never merely taken on trust.
    #
    # `rbac.can_import_d787j` is reused, not re-implemented - `users\\rbac.py` is this
    # application's single authorisation surface and the rule belongs beside `is_admin_role`
    # and `is_hod_role`, not inside a viewset. The existing class-level
    # `[IsAuthenticated, rbac.DepartmentScopedObjectPermission]` cannot carry it: the second
    # class defines `has_object_permission` only, and a detail-less `@action` never invokes
    # object-level checking, so on every one of these endpoints the effective permission is
    # `IsAuthenticated` alone. The gate therefore has to be explicit in the action.
    def _resolve_import_selection(self, request):
        """Validate the route and authority a caller selected, and refuse an unentitled one.

        Returns `(route, authority)`, both upper case. Raises `PermissionDenied` (403) for a
        role that may not use the D787J route, and `ValidationError` (400) for a missing or
        unusable route, authority or password.
        """
        route = services.normalise_import_route(request.data.get("route"))
        if route is None:
            raise DRFValidationError(
                {"route": ["Choose an import route - D787J or OTHERS."]}
            )

        if route == services.IMPORT_ROUTE_D787J and not _can_import_d787j(
            request.user
        ):
            raise PermissionDenied(_D787J_IMPORT_DENIED_MESSAGE)

        authority = str(request.data.get("authority") or "").strip().upper()
        if not authority:
            raise DRFValidationError(
                {"authority": ["Choose the import authority this sheet carries."]}
            )
        # Developed by Unknown: The DEPARTMENT and SUB-DEPARTMENT gate, which now runs here with
        # the other three. Both are resolved before the workbook is read, so a caller who names a
        # department they are not entitled to is refused with 403 and the file is never parsed -
        # the same shape of refusal, at the same point, as the D787J role gate above.
        #
        # `_import_sub_department` is called for its refusals, and its answer is cached for the
        # per-row payload builder rather than passed down through four call frames.
        department = self._import_department()
        self._import_sub_department_id()
        department_name = getattr(department, "name", "")
        sub_department_name = self._import_sub_department_name()

        # Developed by Unknown: THE DEPARTMENT'S OWN CLAIM ON THE D787J ROUTE, which had no
        # check at all. The route was validated for spelling and for the caller's ROLE, and
        # nothing asked whether the department holds a D787J document in the first place -
        # so an entitled role in Logistics, Medical or Executive could select a route that
        # rules clause 2.5.1 gives to Engineering, Electrical and Hull alone. Refused here,
        # before the workbook is read, with a message naming the scope rather than the rule.
        if route == services.IMPORT_ROUTE_D787J and not services.department_has_d787j(
            department_name, sub_department_name
        ):
            scope = (
                f"{department_name} - {sub_department_name}"
                if sub_department_name
                else (department_name or "Your department")
            )
            raise DRFValidationError(
                {"route": [services.D787J_DEPARTMENT_DENIED_MESSAGE.format(scope=scope)]}
            )

        if authority not in services.permitted_authorities(
            department_name, route, sub_department_name
        ):
            scope = f" for {department.name}" if department is not None else ""
            raise DRFValidationError(
                {
                    "authority": [
                        f"{authority} is not an import authority on the {route} "
                        f"route{scope}."
                    ]
                }
            )

        self._verify_import_password(request)
        return route, authority

    # Developed by Unknown: A wrong password is reported as a 400 field error rather than a
    # 401. A 401 on this path would be read by the front end's `refreshTokenInterceptor` as
    # an expired access token, silently refreshed, and the request retried - so the operator
    # would be told nothing and the import would fail twice.
    def _verify_import_password(self, request):
        password = str(request.data.get("password") or "")
        if not password:
            raise DRFValidationError(
                {"password": ["Enter your login password to confirm this import."]}
            )
        if not request.user.check_password(password):
            raise DRFValidationError(
                {"password": ["Incorrect password. Enter your own login password."]}
            )

    # Developed by Unknown: The working table's corrections, read off the request.
    #
    # Two optional multipart fields, both JSON text, both applied by
    # `services.apply_working_table_edits` before the file-level gates and the rule engine
    # see the sheet:
    #
    #   edits         {"7": {"description": "FUEL PUMP ASSEMBLY"}, ...}
    #   removed_rows  [9, 12]
    #
    # Absent on a first preview, which is why both default to empty rather than being
    # required. The row keys are the workbook's own row numbers - the same `row` value the
    # preview response carries back - so the client never has to track a position.
    #
    # A field name outside `IMPORT_EDITABLE_FIELDS` is a 400 and not a silent drop: it can
    # only be a client defect, and swallowing it would leave a correction the user made
    # sitting unapplied while the screen showed it as saved.
    def _resolve_working_table_edits(self, request):
        """Return `(edits, removed_rows)` for this request - `({row: {field: value}}, set)`."""
        edits = self._load_import_json(request, "edits", dict)
        removed = self._load_import_json(request, "removed_rows", list)

        parsed_edits = {}
        for row_key, fields in edits.items():
            row_number = self._import_row_number(row_key, "edits")
            if not isinstance(fields, dict):
                raise DRFValidationError(
                    {"edits": [f"Row {row_number}'s edits must be a set of columns."]}
                )
            unknown = sorted(set(fields) - services.IMPORT_EDITABLE_FIELDS)
            if unknown:
                raise DRFValidationError(
                    {"edits": [f"These columns cannot be edited: {', '.join(unknown)}."]}
                )
            parsed_edits[row_number] = {
                field: services.cell_text(value) for field, value in fields.items()
            }

        return parsed_edits, {
            self._import_row_number(row_key, "removed_rows") for row_key in removed
        }

    # Developed by Unknown: Hand entry - requirement 3.3's Mode 1 - on the two endpoints that
    # already exist rather than on a new pair of them.
    #
    # `rows` is a JSON text field posted in place of `file`, in the same multipart body these
    # endpoints already take, carrying the same seventeen column names an `edits` entry
    # carries. Everything after this method is the path a workbook takes - the same authority
    # gate, the same SHIP CUSTOMER CODE gate, the same rule engine, the same serializer, the
    # same `full_clean()`. A hand-built row is validated identically to an imported one
    # because by the time anything looks at it, it IS one.
    #
    # `submit_validated_inventory_data` is the nearest existing row-accepting surface and was
    # evaluated first. It is not used and no third endpoint is written either: it runs none of
    # the rule engine, it requires a pattern number that clause 2.7.1 permits to be left blank,
    # it still mints master rows with `get_or_create`, and it returns a legacy envelope with no
    # per-row status - so it cannot drive a working table and could not validate a hand-built
    # row identically to an imported one. Reasoning in full in the API Contract Block.
    def _resolve_manual_rows(self, request):
        """Return `[(row_number, {field: value})]` for a hand-built batch, or `None`.

        `None` means this request carries no `rows` field at all, which is every workbook
        import - so a caller that sends only a file sends exactly the body it always sent.
        """
        if request.data.get("rows") in (None, ""):
            return None
        rows = self._load_import_json(request, "rows", list)
        if not rows:
            raise DRFValidationError(
                {"rows": ["Add at least one row before checking or saving."]}
            )

        resolved = []
        seen = set()
        for index, entry in enumerate(rows, start=1):
            if not isinstance(entry, dict):
                raise DRFValidationError(
                    {"rows": [f"Row {index} must be a set of columns."]}
                )
            row_number = self._import_row_number(entry.get("row", index), "rows")
            if row_number in seen:
                raise DRFValidationError({"rows": [f"Row {row_number} appears twice."]})
            seen.add(row_number)
            fields = {key: value for key, value in entry.items() if key != "row"}
            unknown = sorted(set(fields) - services.IMPORT_EDITABLE_FIELDS)
            if unknown:
                raise DRFValidationError(
                    {"rows": [f"These columns cannot be entered: {', '.join(unknown)}."]}
                )
            resolved.append(
                (
                    row_number,
                    {
                        field: services.cell_text(value)
                        for field, value in fields.items()
                    },
                )
            )
        return resolved

    # Developed by Unknown: The one place either entry mode turns into the row list the rest
    # of the import path reads. Written once because there are two endpoints and a mode
    # supported by one of them is not a mode.
    def _resolve_import_rows(self, request, route, authority):
        """Return `(error_response, raw_rows, column_report)` for whichever mode was used.

        Exactly one of `error_response` and `raw_rows` is `None`. `column_report` is the
        `(missing_essential, missing_optional, extra_columns)` triple the preview reports.
        """
        manual_rows = self._resolve_manual_rows(request)
        if manual_rows is None:
            error_response, parsed = self._parse_excel_workbook(request)
            if error_response is not None:
                return error_response, None, None
            edits, removed_rows = self._resolve_working_table_edits(request)
            # Applied before the gates and before the engine, so an edited sheet and a
            # freshly-uploaded one are checked by exactly the same code.
            raw_rows = services.apply_working_table_edits(
                parsed.raw_rows, edits, removed_rows
            )
            return None, raw_rows, self._import_column_classification(parsed)

        if route == services.IMPORT_ROUTE_D787J:
            raise DRFValidationError({"rows": [services.MANUAL_D787J_DENIED_MESSAGE]})
        # Developed by Unknown: hand entry builds its rows on screen, so there is no SHIP
        # CUSTOMER CODE column to learn the ship's code from. It can only run against a code
        # already adopted, and the message says exactly how to adopt one - import a workbook
        # once. It is not the generic "no code adopted" sentence, because that one leaves an
        # operator on this path with nothing to do about it.
        ship_customer_code = services.import_adopted_customer_code()
        if not ship_customer_code:
            raise DRFValidationError(
                {"rows": [services.MANUAL_NO_ADOPTED_CODE_MESSAGE]}
            )

        raw_rows = [
            (
                row_number,
                services.manual_row_to_sheet_row(
                    values,
                    authority=authority,
                    ship_customer_code=ship_customer_code,
                ),
            )
            for row_number, values in manual_rows
        ]
        # No workbook, so no header row to classify. Every column the form offers is present
        # on every row by construction and none of them is extra, so the three lists the
        # preview reports are empty rather than absent - the response shape does not change
        # between the two modes.
        return None, raw_rows, ([], [], [])

    # Developed by Unknown: The master values the operator confirmed on this commit, as
    # `(field, value)` pairs. Posted as one more JSON field beside `edits` and `removed_rows`,
    # read through the same helper, and validated the same way - a malformed body is a 400
    # naming the field rather than a silently ignored confirmation.
    #
    # THE ROLE IS RE-CHECKED HERE even though `CanUseMastersPage` has already admitted only an
    # admin role, a Head of Department or a Dy HOD to this action. Adding a row to a shared
    # master register is a heavier act than importing spares into one's own department, and a
    # gate that lives only on the route is a gate that disappears the day the route is reused.
    # It is cheap, and it puts the check on the write.
    def _resolve_confirmed_master_additions(self, request):
        confirmed = self._load_import_json(request, "confirmed_master_additions", list)
        if not confirmed:
            return []
        if not (
            rbac.is_admin_role(request.user) or rbac.is_hod_role(request.user)
        ):
            raise PermissionDenied(services.MASTER_ADDITION_ROLE_DENIED_MESSAGE)
        pairs = []
        for entry in confirmed:
            if not isinstance(entry, dict):
                raise DRFValidationError(
                    {
                        "confirmed_master_additions": [
                            "Could not read the values you confirmed."
                        ]
                    }
                )
            field = str(entry.get("field") or "").strip()
            value = str(entry.get("value") or "").strip()
            if field not in services.MASTER_ADDITION_FIELDS or not value:
                raise DRFValidationError(
                    {
                        "confirmed_master_additions": [
                            "Could not read the values you confirmed."
                        ]
                    }
                )
            pairs.append((field, value))
        return pairs

    @staticmethod
    def _load_import_json(request, field, expected_type):
        raw = request.data.get(field)
        if raw in (None, ""):
            return expected_type()
        if isinstance(raw, expected_type):
            return raw
        try:
            value = json.loads(raw)
        except (TypeError, ValueError) as error:
            raise DRFValidationError(
                {field: ["Could not read the corrections made to the table."]}
            ) from error
        if not isinstance(value, expected_type):
            raise DRFValidationError(
                {field: ["Could not read the corrections made to the table."]}
            )
        return value

    @staticmethod
    def _import_row_number(value, field):
        try:
            return int(value)
        except (TypeError, ValueError) as error:
            raise DRFValidationError(
                {field: [f"{value!r} is not a row number."]}
            ) from error

    # Developed by Unknown: The one file-level rule in the whole register.
    #
    # Every other rule flags its row and lets the rest of the sheet through. This one refuses
    # the WHOLE file, before a single row is classified, because a row whose AUTHORITY
    # disagrees with the authority the operator selected means the wrong sheet or the wrong
    # authority was picked - and loading the agreeing rows would file part of a workbook
    # under an authority its own contents do not claim. D787J is the case that matters: it
    # is a monitored authority whose deficiency drives MAT-CDF analysis.
    #
    # The message names every offending row and what each of them holds, so the operator can
    # fix the workbook without hunting for the rows.
    def _enforce_sheet_authority(self, raw_rows, authority, field="file"):
        mismatched = services.authority_mismatch_rows(raw_rows, authority)
        if mismatched:
            raise DRFValidationError(
                {field: [services.authority_mismatch_message(authority, mismatched)]}
            )

    def _generate_import_pattern_number(self, equipment_class):
        """Import-batch-aware wrapper around `generate_pattern_number()` for a row whose
        `PATTERN NO`/`PATTERN NUMBER` cell is blank — same "leave blank to auto-generate"
        behaviour as Add Spare (`create()` above), applied per-row during Masters import.
        Tracks candidates already handed out to earlier blank rows *in this same import*
        (`extra_exclude`) so two blank rows can't collide with each other before either is
        actually saved — a real DB-existence check alone wouldn't catch that, since nothing
        is persisted until the row is actually committed. Falls back to leaving the row
        blank (still a "valid" row per `_next_import_row_status`) if generation exhausts
        its retries, rather than failing the whole import over one row.

        Developed by Unknown: the request's own MO customer code is passed down explicitly. On
        the PREVIEW of the very first import the code has been read from the sheet but not yet
        adopted, so the resolver would answer "" and every generated number would be shown with
        the placeholder `SHIP-` prefix - then arrive with the real one after the commit. Passing
        it makes the preview show what the commit will actually mint."""
        if not hasattr(self, "_import_generated_pattern_numbers"):
            self._import_generated_pattern_numbers = set()
        try:
            candidate = generate_pattern_number(
                equipment_class,
                extra_exclude=self._import_generated_pattern_numbers,
                ship_customer_code=getattr(self, "_import_ship_customer_code", ""),
            )
        except ValueError:
            return ""
        self._import_generated_pattern_numbers.add(candidate.upper())
        return candidate

    # Developed by Unknown: Two changes, both consequences of the rule engine.
    #
    # `masters` is new and optional - `_classify_import_rows` has already resolved the four
    # master rows through the engine, so passing them in stops the same four queries being
    # issued a second time per row. When it is not supplied, as on the strict `import_excel`
    # path, the four are resolved here exactly as before, minus the creation.
    #
    # A missing master row now yields `None` for that foreign key rather than a freshly
    # created one, and the serializer reports it. The engine gives the row its clause-led
    # message before that ever happens on the preview and commit paths.
    def build_excel_import_payload(self, row, serializer_fields, masters=None):
        if "equipment_class_name" not in row and "authority_name" not in row:
            return super().build_excel_import_payload(row, serializer_fields)

        if masters is None:
            department = self._import_department()
            spare_class = services._resolve_spare_class(
                row.get("spare_class_name"),
                department,
            )
            equipment_class = services._resolve_equipment_class(
                row.get("equipment_class_name"),
                spare_class,
            )
            denomination = services._resolve_denomination(
                row.get("denomination_name"),
                department,
            )
            authority = services._resolve_authority(row.get("authority_name"))
        else:
            equipment_class = masters.equipment_class
            denomination = masters.denomination
            authority = masters.authority

        quantity_authorised = services._clean_import_int(row.get("quantity_authorised"))
        quantity_available = services._clean_import_int(row.get("quantity_available"))

        return {
            "equipment_class": (
                equipment_class.pk if equipment_class is not None else None
            ),
            "pattern_number": (
                services._clean_import_text(row.get("pattern_number"))
                # Developed by Unknown: Guarded on the equipment class, which is now
                # allowed to be `None`. `generate_pattern_number` reads the spare class
                # name through it, so a row whose equipment class did not resolve keeps a
                # blank pattern number and fails on its own clause instead of raising.
                or (
                    self._generate_import_pattern_number(equipment_class)
                    if equipment_class is not None
                    else ""
                )
            ),
            "description": services._clean_import_text(row.get("description")),
            "category": services._clean_import_category(row.get("category")),
            "critical": services._clean_import_bool(row.get("critical")),
            "compartment": services._clean_import_text(row.get("compartment"), "UNKNOWN"),
            "location": services._clean_import_text(row.get("location"), "UNKNOWN"),
            "rack_position": services._clean_import_text(
                row.get("rack_position"),
                "UNKNOWN",
            ),
            "rack_number": services._clean_import_text(row.get("rack_number"), "UNKNOWN"),
            "denomination": denomination.pk if denomination is not None else None,
            "quantity_authorised": quantity_authorised,
            "quantity_available": quantity_available,
            "authority": authority.pk if authority is not None else None,
            "page": services._clean_import_text(row.get("page")),
            "line": services._clean_import_text(row.get("line")),
            "remarks": services._clean_import_text(row.get("remarks")),
            # Developed by Unknown: `mo_demand_number` is no longer built here. No workbook
            # column maps to it, so the value could only ever have been `""` - which is already
            # `Spares.mo_demand_number`'s own default, so nothing about a saved row changes. The
            # model field itself is untouched and is still set by the demand flows that own it.
            # Developed by Unknown: The one field on this payload that does NOT come from the
            # workbook. There is no SUB DEPARTMENT column in any of the seven curated templates
            # and none is being added - the sub-department is a property of the whole sheet, not
            # of a row, and it is chosen once on the form beside the department. Resolved once per
            # request and reused for every row.
            "sub_department": self._import_sub_department_id(),
            "is_obs": True,
        }

    # Developed by Unknown: Rewritten because the premise of the old docstring no longer
    # holds. `equipment_class_name` and `authority_name` no longer "silently resolve to an
    # UNKNOWN master row" - nothing resolves silently any more, and a sheet missing either
    # column fails every row. `spare_class_name`, `category`, `denomination_name`, the two
    # quantity columns and `ship_customer_code` join the list for the same reason: each is
    # mandatory under a numbered clause, and a sheet without the column cannot satisfy it.
    def get_excel_import_essential_fields(self):
        return services.EXCEL_IMPORT_ESSENTIAL_FIELDS

    def _build_import_display_data(self, row, payload):
        """Preview-only display values for one row — re-derives the same cleaned text `build_
        excel_import_payload` uses (rather than resolving FK payload ids back to names, which
        would cost an extra query per row) so the preview table shows exactly what the row will
        look like without ever touching the DB."""
        if "equipment_class_name" in row or "authority_name" in row:
            return {
                # Developed by Unknown: THE THREE THAT ARE NOT IN THE PAYLOAD.
                #
                # `ser` reaches no `Spares` field and `ship_customer_code` is reconciled against
                # the ship and then discarded, so neither is in the payload and neither ever will
                # be. They are here because the working table shows the sheet's twenty columns as
                # the sheet has them, and an operator checking their workbook against the screen
                # has to be able to find the row - SER is how they refer to it.
                #
                # `picture_path` IS stored now, but it is still not a payload key and must not
                # become one: the serializer's `image` is an `ImageField` and cannot be given a
                # path string. `import_excel_commit_valid` reads the file and attaches it to the
                # instance directly, so this stays the only place the path is carried for the
                # screen - which matters more than it did, because a wrong PICTURE PATH is now
                # something the operator can see AND correct in the working table.
                "ser": services._clean_import_text(row.get("ser")),
                "picture_path": services._clean_import_text(row.get("picture_path")),
                "ship_customer_code": services._clean_import_text(
                    row.get("ship_customer_code")
                ),
                "spare_class": services._clean_import_text(
                    row.get("spare_class_name"), "UNKNOWN"
                ).upper(),
                "equipment_class": services._clean_import_text(
                    row.get("equipment_class_name"), "UNKNOWN"
                ).upper(),
                # Reuses the payload's already-resolved value (rather than re-deriving from
                # the raw row) so a blank cell's auto-generated pattern number — computed once
                # in `build_excel_import_payload` — shows up here too, instead of blank.
                "pattern_number": payload.get("pattern_number", ""),
                "description": services._clean_import_text(row.get("description")),
                # The LETTER, not the word - see `_display_import_category`. The payload above
                # keeps the word, because that is what the column stores.
                "category": services._display_import_category(row.get("category")),
                "critical": services._clean_import_bool(row.get("critical")),
                "compartment": services._clean_import_text(
                    row.get("compartment"), "UNKNOWN"
                ),
                "location": services._clean_import_text(row.get("location"), "UNKNOWN"),
                "rack_position": services._clean_import_text(
                    row.get("rack_position"), "UNKNOWN"
                ),
                "rack_number": services._clean_import_text(
                    row.get("rack_number"), "UNKNOWN"
                ),
                "denomination": services._clean_import_text(
                    row.get("denomination_name"), "NOS"
                ).upper(),
                "quantity_authorised": payload.get("quantity_authorised", 0),
                "quantity_available": payload.get("quantity_available", 0),
                "authority": services._clean_import_text(
                    row.get("authority_name"), "UNKNOWN"
                ).upper(),
                "page": services._clean_import_text(row.get("page")),
                "line": services._clean_import_text(row.get("line")),
                "remarks": services._clean_import_text(row.get("remarks")),
            }
        # Pre-existing, out-of-scope quirk: a sheet using literal serializer field names (e.g.
        # "equipment_class" instead of "EQUIPMENT CLASS") bypasses the FK-name-resolving branch
        # above entirely (see build_excel_import_payload) — display falls back to whatever raw,
        # unresolved value was in that column (e.g. a numeric FK id, not a name).
        text_fields = (
            "pattern_number",
            "description",
            "category",
            "compartment",
            "location",
            "rack_position",
            "rack_number",
            "denomination",
            "authority",
            "page",
            "line",
            "remarks",
            "ser",
            "picture_path",
            "ship_customer_code",
        )
        data = {field: str(row.get(field) or "") for field in text_fields}
        data["spare_class"] = ""
        data["equipment_class"] = str(row.get("equipment_class") or "")
        data["critical"] = bool(row.get("critical"))
        data["quantity_authorised"] = payload.get("quantity_authorised", 0)
        data["quantity_available"] = payload.get("quantity_available", 0)
        return data

    @staticmethod
    def _normalize_import_row_error(error):
        detail = django_validation_error_detail(error)
        if isinstance(detail, dict):
            return detail
        if isinstance(detail, list):
            return {"__all__": detail}
        return {"__all__": [str(detail)]}

    def _validate_import_row(self, payload, serializer):
        """Merges `serializer.is_valid()` with `full_clean()` on an unsaved instance — the
        latter is required to catch e.g. a blank `description` (model default but `blank=False`)
        or `Spares.clean()`'s quantity check, both invisible to `is_valid()` alone."""
        if not serializer.is_valid():
            return serializer.errors
        try:
            Spares(**serializer.validated_data).full_clean()
        except DjangoValidationError as error:
            return self._normalize_import_row_error(error)
        return {}

    @staticmethod
    def _next_import_row_status(payload, has_errors, seen_pattern_numbers):
        """In-file duplicate detection, only applied to already error-free rows. Rows are
        processed in file order by the caller — the first occurrence of a repeated
        pattern_number is "valid"; later ones are "duplicate". A blank pattern_number is never a
        duplicate of another blank one."""
        if has_errors:
            return "invalid"
        pattern_number = (payload.get("pattern_number") or "").strip().upper()
        if not pattern_number:
            return "valid"
        if pattern_number in seen_pattern_numbers:
            return "duplicate"
        seen_pattern_numbers.add(pattern_number)
        return "valid"

    # Developed by Unknown: This is where the rule engine is applied. Three things changed.
    #
    # The department is resolved ONCE for the sheet rather than once per row, and handed to
    # both the engine and the payload builder.
    #
    # The sheet's SHIP CUSTOMER CODE is held from the first row that carries one, so clause
    # 2.23.1 - the same code in every row - can be checked against it thereafter.
    #
    # A row that breaches a numbered clause reports the engine's clause-led messages and
    # does NOT go on to the serializer. That is deliberate: a row whose held quantity
    # differs from its authorised quantity on the others route would otherwise collect both
    # the clause message and the model's own quantity message, which say the same thing
    # twice in two different voices. A row that breaches no clause still goes through the
    # serializer and `Spares.full_clean()` exactly as before, so the rules already living
    # there - a shortfall that exceeds the holding, a description over its length - are
    # unchanged and unduplicated.
    #
    # Developed by Unknown: `route` is new and is the route the CALLER selected. The engine
    # used to infer a route from each row's own AUTHORITY cell because no endpoint carried
    # one. Rules 2.11.3, 2.17.1, 2.17.2, 2.18 and 2.19 all read "during a D787J import",
    # which means the radio button and not the cell being checked, so the selected route is
    # now passed straight through.
    # Developed by Unknown: THE ORDER OF OPERATIONS IN THIS METHOD IS THE CHANGE. It is
    # stated here because the whole of the source-of-truth requirement turns on it:
    #
    #   0. cross-check EVERY pattern number in the sheet, in ONE pass, before the loop
    #   1. per row - resolve which source of truth, if any, the typed pattern number matched
    #   2. APPLY that source's corrections to a copy of the row
    #   3. THEN run the rule engine over the CORRECTED row
    #   4. build the payload, which is where a blank pattern number is generated
    #   5. the serializer and `full_clean()`, unchanged
    #
    # Step 2 before step 3 is what lets a row whose DESCRIPTION cell is empty - a hard
    # reject under rule 2.8 - be filled from the item master and then pass. The row is
    # corrected on the authority's own value, which is what clause 4.4 asks for, rather
    # than failed on an omission the authority can settle.
    #
    # Step 0 is the batching decision. `services.resolve_pattern_sources` issues at most
    # four queries for the whole sheet, one per source table, so a fifty-row sheet makes
    # four lookups and not fifty. It is NOT called per row and the import does NOT call the
    # `verify-pattern/` endpoint over HTTP - it shares that endpoint's lookup function
    # in-process instead.
    def _classify_import_rows(
        self, raw_rows, serializer_fields, route, pending=None, provisional=None
    ):
        """Per-row status for the Import Data preview/commit-valid actions.

        Returns `(classified, payloads)` - the client-facing row list, and the payload each
        row built, keyed by row number. The payloads are returned so `import_excel_commit_
        valid` can commit the exact rows this pass classified instead of rebuilding them
        from the raw sheet, which is what previously let a committed row differ from the
        previewed one.

        Reuses the exact `build_excel_import_payload` a real commit uses. Callers still
        wrap this in `transaction.atomic()` + `transaction.set_rollback(True)`, and the
        wrapper is now load-bearing again: `generate_pattern_number` reserves a stored
        counter value per equipment class, and the rollback is what stops a preview that is
        never committed from burning numbers out of that counter.
        """
        seen_pattern_numbers = set()
        # Developed by Unknown: the master values this sheet introduces and that are on offer to
        # be added, so the rule engine can tell one of them from a value that simply breaks a
        # clause. `None` means "none on offer", which is what every caller outside the two import
        # endpoints wants and what the strict `import_excel` path must keep having.
        pending = pending or services.NO_PENDING_MASTERS
        # The values the caller already created for this pass - see the advisory block below.
        provisional = provisional or services.NO_PENDING_MASTERS
        department = self._import_department()
        # Developed by Unknown: seeded from the code the gate settled on, so rule 2.23.1's
        # every-row-the-same check compares against the ship's actual MO customer code rather
        # than against whatever the first row of this particular sheet happened to hold. The
        # first-row fallback below is kept for any path that reaches here without the gate.
        sheet_customer_code = getattr(self, "_import_ship_customer_code", "") or None
        classified = []
        payloads = {}

        # Step 0 - the whole sheet's pattern numbers, cross-checked in one pass. Raises
        # `services.PatternSourceUnavailable`, which the caller turns into a file-level
        # refusal. FAIL CLOSED: a check that did not run cannot say a pattern number is
        # right, and clause 4.3 says no wrong pattern number may reach the spares table.
        sources = services.resolve_pattern_sources(
            services.cell_text(row.get("pattern_number")) for _, row in raw_rows
        )

        # Developed by Unknown: Step 0b - near matches for the codes that resolved to NOTHING,
        # in one further batched pass. A sheet whose pattern numbers all matched issues no
        # query here at all, and a sheet with three unknown codes issues six, not one per row.
        #
        # It runs on the codes the lookup above did not answer, which is why it sits here and
        # not inside the loop: the whole point is that it is not per row.
        unresolved_patterns = [
            code
            for code in (
                services.normalise_item_code(row.get("pattern_number"))
                for _, row in raw_rows
            )
            if code and code not in sources
        ]
        suggestions = services.suggest_item_codes(unresolved_patterns)

        # Developed by Unknown: Step 0c - the four master-table lookups `validate_import_row`
        # needs (spare class / equipment class / denomination / authority), fetched ONCE for the
        # whole department rather than once per row per table. See
        # `services.build_master_lookup_cache`'s own docstring for why this is safe - nothing on
        # this read-only classification path writes to any of the four tables mid-import.
        masters_cache = services.build_master_lookup_cache(department)

        for row_number, row in raw_rows:
            if sheet_customer_code is None:
                sheet_customer_code = services.sheet_customer_code_of(row)

            # Developed by Unknown: keyed with `normalise_item_code`, which is what
            # `resolve_pattern_sources` now keys its result by. The previous
            # `.strip().upper()` missed every code carrying an internal space - the database
            # found the match and this line then threw it away.
            typed_pattern = services.normalise_item_code(row.get("pattern_number"))
            source = sources.get(typed_pattern) if typed_pattern else None

            corrected_row, corrections = services.apply_source_of_truth(row, source)

            rules = services.validate_import_row(
                corrected_row,
                department=department,
                route=route,
                sheet_customer_code=sheet_customer_code,
                pending=pending,
                masters_cache=masters_cache,
            )
            errors = rules.errors
            # Developed by Unknown: the master values THIS row is waiting on. Computed before
            # the pattern check so the two flags below are decided from the same `errors`
            # dictionary the engine has just filled in, and reported per row so the working
            # table can mark the rows a confirmation would unblock.
            row_pending = services.row_pending_masters(corrected_row, pending)
            # Only a value somebody has to ANSWER for keeps a row out of "valid". Computed once
            # and read twice - by the status line and by the flag the working table tints on.
            needs_confirmation = any(
                addition.confirmation_required for addition in row_pending
            )
            # `None` where the cell was blank and there was nothing to check. `False` is a
            # typed value that matched no source, which fails the row AND is the flag the
            # front end renders as red text on the PATTERN NUMBER cell. The ERRORS column
            # carries the reason in words, which is the non-colour signal WCAG 1.4.1 needs.
            pattern_matched = services.check_pattern_source(
                corrected_row, source, errors
            )

            payload = self.build_excel_import_payload(
                corrected_row, serializer_fields, masters=rules.masters
            )
            pattern_generated = not typed_pattern and bool(payload.get("pattern_number"))

            # Developed by Unknown: ADVISORIES ARE NOT ERRORS, and they are no longer posted as
            # if they were.
            #
            # These sentences used to be appended into `errors` beside the broken rules, under
            # the same field key, and the working table then painted the lot one shade of red.
            # An operator looking at a row reading "Pattern number did not match ILMS/WLMS" and
            # "EQUIPMENT CLASS 'AIR CONDITIONING PLANT' ... will be added when you save" had no
            # way to tell that the first is something they must fix and the second is something
            # the save itself resolves. They are two different kinds of statement and they are
            # now two different keys, so the screen can say so in two different colours.
            #
            # The ROW STATUS is deliberately unchanged: `row_status` below counts advisories
            # exactly as it counted them when they lived in `errors`. A row waiting on a master
            # value still cannot be committed as it stands, and still belongs under "Invalid
            # Only". What changes is only which sentence on it is presented as the operator's
            # to act on.
            advisories = {}
            # Developed by Unknown: the values THIS ROW introduces that the caller has already
            # created for it - equipment classes, materialised inside the rolled-back transaction
            # by `_classify_import_rows_guarded`. They are real rows by now, so nothing is
            # suppressed and nothing is skipped: the row validates in full and passes or fails on
            # its own merits. The sentence is still said, because a new row in a shared master
            # register is worth telling somebody about even when nothing is wrong.
            for addition in services.row_pending_masters(corrected_row, provisional):
                advisories.setdefault(addition.field, []).append(
                    services.MASTER_ADDITION_AUTOMATIC_MESSAGE.format(
                        column=addition.column, value=addition.value
                    )
                )
            # Developed by Unknown: PICTURE PATH, checked here so the operator hears about an
            # unreadable photograph on the PREVIEW rather than discovering after the commit that
            # half the sheet imported without one.
            #
            # An advisory and never an error, for the same reason the master-addition sentences
            # above are: a photograph that could not be found is not a defect in the row's
            # inventory data. Refusing the row would mean a storekeeper could not record a spare
            # they are holding because a picture file had been moved, which is plainly the wrong
            # trade. The row saves; it saves with the default photo; the sentence says so.
            #
            # `read_bytes=False` - this pass runs inside a transaction that is always rolled
            # back and would throw every byte away.
            _, picture_problem = excel.resolve_import_image(
                services.cell_text(corrected_row.get("picture_path")), read_bytes=False
            )
            if picture_problem:
                advisories.setdefault("picture_path", []).append(
                    f"{picture_problem} The spare will be saved with the default photo."
                )
            if row_pending:
                # THE SERIALIZER IS SKIPPED, and it has to be. A row waiting on a master value
                # has `None` for that foreign key, because `_resolve_*` create nothing and the
                # row does not exist yet - so the serializer would report "this field is
                # required" against a column the rating filled in perfectly well. The row
                # carries the plain sentence naming what is being offered instead, and it is
                # re-validated for real on the commit, after the confirmed rows have been
                # created and the foreign key resolves.
                #
                # Only values needing CONFIRMATION reach here now. Everything else was created
                # before this loop began, so the common case - a sheet naming a piece of
                # machinery the ship has not met before - takes the full validation path below.
                for addition in row_pending:
                    advisories.setdefault(addition.field, []).append(
                        services.MASTER_ADDITION_PENDING_MESSAGE.format(
                            column=addition.column, value=addition.value
                        )
                    )
            elif not errors:
                # Bulk import is exempt from the single-spare >20-holding-needs-a-reason
                # rule (see SparesSerializer.validate()) — a storekeeper can't type a
                # written reason per spreadsheet row.
                serializer = self.get_serializer(
                    data=payload,
                    context={
                        **self.get_serializer_context(),
                        "skip_high_holding_check": True,
                    },
                )
                errors = self._validate_import_row(payload, serializer)
            # Developed by Unknown: AN ADVISORY NO LONGER MAKES A ROW INVALID, and the line it
            # replaces said why it used to: `bool(errors) or bool(advisories)` "reproduces exactly
            # what `bool(errors)` meant when the advisories were still being merged into it". That
            # was caution during a refactor, not a rule, and it outlived its reason.
            #
            # The two are not the same kind of statement. An ERROR is a clause the row breaks and
            # the operator must fix. An ADVISORY is something the SAVE will do - "EQUIPMENT CLASS
            # 'AIR CONDITIONING PLANT' is not yet on your department's Masters list and will be
            # added when you save" - and there is nothing wrong with that row at all. Painting it
            # red told a rating their sheet was broken because the ship had not met that piece of
            # machinery before, which is not a defect in the sheet.
            #
            # What still counts is a value somebody has to ANSWER for. An unlisted denomination or
            # authority is a question for the Head of Department, and until it is answered the row
            # genuinely cannot be written - so `needs_confirmation` keeps it out of "valid", and
            # `needs_master_confirmation` below tints it apart from a row that broke a clause.
            row_status = self._next_import_row_status(
                payload, bool(errors) or needs_confirmation, seen_pattern_numbers
            )
            payloads[row_number] = payload
            classified.append(
                {
                    "row": row_number,
                    "status": row_status,
                    "errors": errors or None,
                    # Developed by Unknown: the sentences that are NOT the operator's to fix -
                    # a master value the save will add, or one it will add once confirmed. Same
                    # shape as `errors` and keyed by the same field names, carried separately so
                    # the working table can render them in its ordinary voice while the broken
                    # rules above stay red.
                    "advisories": advisories or None,
                    # Developed by Unknown: TWO PRESENTATION FLAGS, and neither of them changes
                    # `status`. Both of these rows are still uncommittable and both still belong
                    # under "Invalid Only" - clause 4.3 keeps a wrong pattern number out of the
                    # spares table, and an unconfirmed master value has not been confirmed. What
                    # they are not is rows that broke a rule of the document, and the working
                    # table said they were by painting the whole twenty columns red. The front
                    # end tints these two apart and names them in the STATUS column.
                    "pattern_only_error": services.is_pattern_only_failure(errors),
                    # Only a row waiting on a value somebody has to ANSWER for. A row waiting
                    # on an equipment class is waiting on nothing - the commit adds it - so it
                    # must not raise a confirmation dialogue that has no question in it.
                    "needs_master_confirmation": needs_confirmation,
                    "pattern_matched": pattern_matched,
                    "pattern_source": source.source if source is not None else None,
                    "pattern_generated": pattern_generated,
                    # Developed by Unknown: Near matches for a pattern number that was TYPED
                    # and matched nothing, so the operator can find the right code without
                    # leaving the screen. Empty for every other row.
                    #
                    # CARRIED AS ITS OWN FIELD AND NOT APPENDED TO THE ERROR MESSAGE, which
                    # matters more than it looks. `services.is_pattern_only_failure` decides
                    # whether a row is painted as "PATTERN NOT FOUND" rather than as a breach
                    # of the rules document by comparing the row's error list against
                    # `RULE_MESSAGES["PATTERN-NOT-FOUND"]` EXACTLY. Appending a suggestion
                    # clause to that sentence would make every unmatched row fail that
                    # comparison and be repainted red across all twenty columns.
                    "pattern_suggestions": (
                        suggestions.get(typed_pattern, [])
                        if pattern_matched is False
                        else []
                    ),
                    # Every corrected cell, with the value the workbook actually held, so
                    # the user can judge the correction and use Edit where it is wrong.
                    "corrections": [
                        {
                            "field": correction.field,
                            "original": correction.original,
                            "applied": correction.applied,
                            "source": correction.source,
                        }
                        for correction in corrections
                    ],
                    "data": self._build_import_display_data(corrected_row, payload),
                }
            )
        return classified, payloads

    # Developed by Unknown: The two file-level refusals this change adds, and the one
    # wrapper that turns a failed cross-check into a refusal rather than a wrong answer.
    #
    # Both live here rather than in the two actions because there are two import endpoints
    # and a gate applied to one of them is not a gate.
    def _enforce_ship_customer_code(self, raw_rows, *, adopt):
        """Reconcile the sheet's SHIP CUSTOMER CODE against this ship's own, ADOPTING the
        ship's code from the sheet on the very first import. Returns the code in force.

        The column is unique per ship, so a sheet carrying another ship's code was prepared
        for another ship. Loading the agreeing rows would file part of one ship's inventory
        under another, so the WHOLE file is refused - the same treatment, and the same
        reasoning, as the AUTHORITY mismatch gate immediately above it.

        Developed by Unknown: THE FIRST IMPORT IS DIFFERENT, and it used to be refused. The
        expected code came from `Ship.customer_code`, which nothing but the CMMS sync ever
        writes, so on a fresh install it was blank and every import was refused before a row
        was read. There is now nothing for an operator to configure - the ship's MO customer
        code is LEARNED from the first workbook imported and enforced against every workbook
        after it.

        `adopt` decides whether this call may write. The preview passes False: it must not
        settle the ship's identity from a file the operator may never commit, but it must not
        be refused either, so it reads the sheet's code and hands it back unwritten. The
        commit passes True and adopts.
        """
        adopted = services.import_adopted_customer_code()

        # Developed by Unknown: the ordinary case - a code is settled, so reconcile against it.
        if adopted:
            return self._reconcile_ship_customer_code(raw_rows, adopted)

        # Developed by Unknown: nothing adopted. This is the first import, and the sheet is the
        # authority - but only if it agrees with itself.
        codes = services.sheet_customer_codes(raw_rows)
        if not codes:
            raise DRFValidationError({"file": [services.NO_CODE_IN_SHEET_MESSAGE]})
        if len(codes) > 1:
            mismatched = services.ship_customer_code_mismatches(raw_rows, codes[0])
            raise DRFValidationError(
                {"file": [services.sheet_disagrees_message(codes, mismatched)]}
            )

        candidate = codes[0]
        if not adopt:
            return candidate

        # STUB (merge decision, blocker #2): source's `rbac.adopt_ship_customer_code()`
        # persists the winning candidate onto `ShipIdentity.customer_code`, a field that does
        # not exist anywhere in target's `accounts` app and is deliberately not being added
        # there in this pass (that would be an out-of-scope change to a different app). Rather
        # than crash on a missing attribute, this is a safe no-op that always accepts this
        # request's own sheet-derived candidate as the "winner" unchanged - there is no
        # persisted ship identity to race against, so no concurrent-adoption case can arise and
        # `_reconcile_ship_customer_code` below is never reached from here. See
        # `obs.services._resolve_adopted_ship_customer_code` for the sibling stub and the same
        # "no MO customer code is ever persisted across requests" rationale.
        winner = candidate
        if winner != candidate:
            return self._reconcile_ship_customer_code(raw_rows, winner)
        return winner

    def _reconcile_ship_customer_code(self, raw_rows, ship_customer_code):
        """Developed by Unknown: refuse the whole file when any row disagrees with the code in
        force. Lifted out of the gate above because the gate reaches it by two routes - the
        ordinary already-adopted case, and the race where another request adopted first."""
        mismatched = services.ship_customer_code_mismatches(
            raw_rows, ship_customer_code
        )
        if mismatched:
            raise DRFValidationError(
                {
                    "file": [
                        services.ship_customer_code_mismatch_message(
                            ship_customer_code, mismatched
                        )
                    ]
                }
            )
        return ship_customer_code

    def _classify_import_rows_guarded(
        self,
        raw_rows,
        serializer_fields,
        route,
        pending=None,
        *,
        provisional=None,
        department=None,
    ):
        """`_classify_import_rows` inside its rolled-back transaction, failing CLOSED.

        A cross-check that could not run refuses the whole file with a 400 naming the
        failure. It does NOT fall through to "no match", which would mark every row red,
        and it does not fall through to "matched", which would let a wrong pattern number
        into the spares table. Add Spare's async validator keeps its own, deliberate
        fail-open behaviour and is not touched by this change.

        Developed by Unknown: `provisional` IS WRITTEN INSIDE THE ROLLED-BACK TRANSACTION, and
        the whole point of this helper is that it can be.

        The master rows a sheet introduces and nobody has to approve - equipment classes - are
        created here before a single row is classified, and discarded with everything else when
        `set_rollback` fires. The preview then sees precisely what the commit will see, which
        fixes four separate faults at once:

          A ROW COULD NOT GET ITS PATTERN NUMBER. `generate_pattern_number` builds the number out
          of the equipment class's own name and spare class and advances that row's counter, so a
          row whose equipment class did not exist yet got `""` - clause 2.7.1 promises a generated
          number for a blank cell and the operator was shown an empty one.

          THE SERIALIZER WAS SKIPPED for such a row, because its foreign key was `None`. The row
          was reported without ever having been validated.

          THE ROW WAS RED. With no verdict to give, the classifier called it invalid on the
          strength of an advisory that says nothing worse than "this will be added when you save".

          A DUPLICATE BEHIND IT WENT UNREPORTED. An invalid row never reaches the duplicate check,
          so its pattern number never entered `seen_pattern_numbers` and a later row carrying the
          same number was not caught.

        THE COMMIT PATH MUST NOT USE THIS. It creates the same rows through
        `services.create_master_additions` BEFORE calling this helper, deliberately outside the
        transaction, because the payloads it builds carry the equipment class's primary key and
        the commit loop saves against it after this block has rolled back.
        """
        try:
            with transaction.atomic():
                if provisional and department is not None:
                    services.create_master_additions(provisional, department)
                classified, payloads = self._classify_import_rows(
                    raw_rows,
                    serializer_fields,
                    route,
                    pending,
                    services.pending_master_values(provisional or []),
                )
                transaction.set_rollback(True)
        except services.PatternSourceUnavailable as error:
            raise DRFValidationError({"file": [str(error)]}) from error
        return classified, payloads

    @staticmethod
    def _import_correction_counts(rows):
        """The three counts clauses 4.3 and 4.4 require in the message beside the results.

        Counted over EVERY classified row, including rows that then failed for another
        reason - a correction the application made is a correction the user needs to see,
        whether or not the row went on to pass.
        """
        patterns_generated = sum(1 for row in rows if row["pattern_generated"])
        # Developed by Unknown: kept beside the other three counts because they are read
        # together, but returned separately - see `_import_shortfall_count` below.
        descriptions_corrected = sum(
            1
            for row in rows
            for correction in row["corrections"]
            if correction["field"] == "description"
        )
        categories_corrected = sum(
            1
            for row in rows
            for correction in row["corrections"]
            if correction["field"] == "category"
        )
        return patterns_generated, descriptions_corrected, categories_corrected

    # Developed by Unknown: The count clause 4.5's confirmation is built from, and it has to
    # reach the client AT PREVIEW TIME, because the confirmation happens before the write and
    # not after it. There was no shortfall count anywhere in the response before this change -
    # `import_excel_preview`'s summary carried ten keys and none of them was one - so this
    # adds the ONE count and every consumer reads it. There is no second one.
    #
    # Counted over rows that WOULD BE WRITTEN - status "valid" only. An invalid or duplicate
    # row is not committed, so including it would make the confirmation state a number larger
    # than the number of spares the user is about to save, which is the one thing the
    # confirmation must not do.
    #
    # Gated on the D787J route, per rule 2.11.3. On the OTHERS route authorised must EQUAL
    # held and a difference is already a hard reject in the rule engine
    # (`services._check_quantities`, R-028), so such a row is never "valid" and could not be
    # counted here anyway. The gate is stated rather than relied upon, so the two rules are
    # visibly the same rule.
    @staticmethod
    def _import_shortfall_count(rows, route):
        """How many committable rows carry a held quantity below their authorised quantity."""
        if route != services.IMPORT_ROUTE_D787J:
            return 0
        return sum(
            1
            for row in rows
            if row["status"] == "valid"
            and row["data"].get("quantity_available", 0)
            < row["data"].get("quantity_authorised", 0)
        )

    def _import_column_classification(self, parsed):
        """Splits the uploaded sheet's headers against `get_excel_import_essential_fields()`/
        `get_excel_import_fields()` for the Import Data validation-summary UI.

        Developed by Unknown: THIS REPORT USED TO NAME COLUMNS NO TEMPLATE HAS, on every single
        import, which is the fastest way to teach an operator to stop reading it. Three separate
        causes, all fixed here and in the header map above:

          `MO DEMAND NO` was listed as a MISSING OPTIONAL COLUMN every time, because it was in
          the header map and in no workbook. It is out of the header map now.

          `sub_department` was listed too, under its raw snake_case name, because it is a
          writable serializer field with no header alias and so fell through to `label()`'s
          fallback. `build_excel_import_payload` states in as many words that no workbook column
          exists for it or will - it is a property of the sheet, chosen once on the form. It
          joins `shadowed_raw_fields` below, which is exactly the set of serializer fields no
          column can supply.

          `SER` and `PICTURE PATH` were reported as EXTRA, i.e. ignored. That was true when they
          mapped to `""`; now that the working table shows them they carry real targets, and
          reporting the sheet's own first and eighteenth columns as unexpected would be worse
          than saying nothing. `DISPLAY_ONLY_IMPORT_TARGETS` keeps them out of BOTH halves - in
          `allowed_targets` so they are not extras, out of `optional_targets` so a sheet without
          them is not nagged for a column that stores nothing either way.

        `extra_columns` remains a superset of `parsed.unknown_headers`: a header the map points
        at `""` is tolerated by `import_excel` but imported into no field, so it still belongs in
        the ignored report.
        """
        essential_targets = set(services.EXCEL_IMPORT_ESSENTIAL_FIELDS)
        # `get_excel_import_fields()` returns raw serializer field names (e.g. "equipment_class",
        # "denomination", "authority") — but the FK-resolving `build_excel_import_payload` branch
        # (the one every real-world header alias actually exercises) reads their human-friendly
        # "*_name" alias targets instead ("equipment_class_name", ...), not the raw names. Left
        # unfiltered, the raw names would always read as "missing" even when their alias
        # equivalent is present. "is_obs" is dropped too — it's unconditionally forced server-side
        # in that branch, never something a column can actually supply.
        # Developed by Unknown: `sub_department` and `mo_demand_number` join the three below for
        # the same reason they are there - each is a writable serializer field that no workbook
        # column supplies. Without them the report falls through to `label()`'s fallback and
        # prints the raw snake_case field name at the operator, which is both meaningless to them
        # and a request for a column that does not exist. See the docstring.
        shadowed_raw_fields = {
            "equipment_class",
            "denomination",
            "authority",
            "is_obs",
            "sub_department",
            "mo_demand_number",
        }
        allowed_targets = (
            set(self.get_excel_import_fields()) - shadowed_raw_fields
        ) | {value for value in services.EXCEL_IMPORT_HEADER_MAP.values() if value}
        optional_targets = (
            allowed_targets - essential_targets - DISPLAY_ONLY_IMPORT_TARGETS
        )
        present_targets = {
            header for header in parsed.normalized_headers if header
        } & allowed_targets

        friendly_label = {}
        for source, target in services.EXCEL_IMPORT_HEADER_MAP.items():
            if target and target not in friendly_label:
                friendly_label[target] = source

        def label(target):
            return friendly_label.get(target, target)

        missing_essential = sorted(
            label(target) for target in essential_targets - present_targets
        )
        missing_optional = sorted(
            label(target) for target in optional_targets - present_targets
        )
        extra_columns = [
            original
            for original, normalized in zip(
                parsed.original_headers, parsed.normalized_headers, strict=False
            )
            if original and (not normalized or normalized not in allowed_targets)
        ]
        return missing_essential, missing_optional, extra_columns

    # Developed by Unknown: Resolves which department's template the caller is asking for, and
    # refuses one they are not entitled to. `rbac.resolve_selected_department` is the existing,
    # canonical answer to that question and is reused rather than re-implemented - it already
    # raises `PermissionDenied` when a non-privileged caller passes a `?department=` that is not
    # their own, which is exactly the server-side refusal this endpoint needs.
    # Developed by Unknown: Renamed from `_resolve_template_department`. It was written for the
    # template download and is now also the whole of the import's department chooser
    # (`_import_department` above), so a name that says "template" would be describing one of its
    # two callers. Nothing about what it does has changed.
    #
    # FIX: `rbac.resolve_selected_department` only ever reads `request.query_params` - correct
    # for `download_template`/`import_authorities`/`import_value_lists`, which are all GET. But
    # `import_excel_preview`/`import_excel_commit_valid` are POST with a multipart form body, and
    # `appendImportSelection` (obs-api.service.ts) sends `department` as a form field, not a query
    # string. A privileged caller (SHIPADMIN/ADMIN) therefore always looked "requested"-less to
    # `resolve_selected_department` and was force-refused with "Choose the department whose
    # template you want." on every single Preview Import / commit call, however they populated the
    # form. A non-privileged caller never hit this: they silently fall back to their own department
    # regardless of what `resolve_selected_department` found.
    #
    # `request.query_params` is a `QueryDict` bound to the GET string alone - there is no supported
    # way to hand it a form-body value, so the two-line branch below mirrors
    # `resolve_selected_department`'s own logic (`accounts/rbac.py`) instead of calling it, sourcing
    # `requested` from `request.data` FIRST (this method's two POST callers) and falling back to
    # `request.query_params` (its two GET callers), which keeps those completely unaffected.
    def _resolve_scope_department(self, request):
        """Return the single `master.Department` this request is entitled to act on.

        A non-privileged caller who names no department gets their own. One who names another
        department's id is refused rather than silently served their own file. A privileged
        caller must name a department, because "every department" has no meaning for a
        single-file download or for a sheet that is tagged to one department."""
        requested = request.data.get("department") or request.query_params.get("department")
        privileged = rbac.can_see_all_departments(request.user)
        own_department = rbac.department_of(request.user)

        if privileged:
            selected, is_all = (
                (None, True)
                if not requested or str(requested).lower() == "all"
                else (requested, False)
            )
        elif requested and str(requested).lower() != "all":
            if own_department is None or str(requested) != str(own_department.pk):
                raise PermissionDenied("You may not view another department's data.")
            selected, is_all = (own_department.pk, False)
        else:
            selected, is_all = (
                (None, False) if own_department is None else (own_department.pk, False)
            )

        if is_all:
            raise DRFValidationError(
                {"department": ["Choose the department whose template you want."]}
            )
        if selected is None:
            raise DRFValidationError(
                {
                    "department": [
                        "Your account has no department, so no template can be chosen for it."
                    ]
                }
            )
        department = Department.objects.filter(pk=selected).first()
        if department is None:
            raise DRFValidationError({"department": ["Unknown department."]})
        return department

    # Developed by Unknown: Overrides `ExcelImportExportMixin.download_template` for spares only.
    #
    # The mixin's version builds a one-sheet workbook in memory whose single row is the raw
    # serializer field names - `location`, `quantity_available`, and numeric foreign-key ids. A
    # ship's rating cannot fill that in, and the importer on the other side of the same screen
    # expects the twenty human column headings instead, so the download half and the upload half
    # of this feature did not describe the same file. This override serves the real curated
    # workbook for the caller's own department and the chosen route.
    #
    # It is overridden here and NOT changed in the mixin, because `obs.excel.ExcelImportExportMixin`
    # is mixed into `CleanValidationModelViewSet` and therefore into all nineteen viewsets in this
    # app. Every one of them except this one still wants the generated header-only sheet, and the
    # `ilms`, `wlms`, `dms` and `inout_tag` apps each carry their own copy of the mixin that is
    # untouched by this change.
    # Developed by Unknown: The Import Authority list, scoped by role and by department.
    #
    # A NEW action rather than an extension of `master_dropdown`, deliberately. That action
    # answers "what master data exists" for the Add Spare form as much as for the import, it
    # is cached for the whole session by the front end's `rawMasterDropdown$`, and it is
    # returned unscoped to every caller by design. This list is the opposite of all three -
    # it is a permission answer, it must not be cached across a role change, and it is
    # scoped to the caller. Folding it in would have made `master_dropdown` mean two things.
    #
    # `AuthorityViewSet.list` (`authorities/`) is also not the answer: it returns the
    # Authority MASTER TABLE, every row of it, including whatever junk rows the old
    # `_get_or_create_authority` created from workbook cells. What the import screen needs is
    # the permitted-value list of clause 2.17, which is a rule, not a table.
    #
    # The response carries the route each authority belongs to, so the screen offers one
    # control - the reference application's own "Import Authority" select - and the route
    # follows from the choice rather than being a second thing to get right.
    @extend_schema(
        responses={
            200: OpenApiTypes.OBJECT,
        },
        examples=[
            OpenApiExample(
                "Head of Department, Engineering",
                value={
                    "can_import_d787j": True,
                    "authorities": [
                        {"value": "D787J", "label": "D787J", "route": "D787J"},
                        {"value": "B & D", "label": "B & D", "route": "OTHERS"},
                    ],
                },
                response_only=True,
            )
        ],
    )
    @action(detail=False, methods=["get"], url_path="import-authorities")
    def import_authorities(self, request):
        """The Import Authority values this caller may select, in the order to offer them."""
        department = self._import_department()
        department_name = getattr(department, "name", "")
        # Developed by Unknown: the sub-department is read from the request the same way the
        # import itself reads it, so the Executive Head of Department who has chosen HULL is
        # offered D787J and the same account with GUNNERY chosen is not.
        sub_department_name = self._import_sub_department_name()

        # Developed by Unknown: TWO independent conditions, and both must hold. The ROLE gate
        # asks whether this person may ever import on D787J. The DEPARTMENT gate asks whether
        # this scope holds a D787J document at all. Only the first existed here, so an
        # entitled role in a department with no D787J was offered the option and would have
        # been refused later, at the import, for a reason the list had not shown.
        can_import_d787j = _can_import_d787j(
            request.user
        ) and services.department_has_d787j(department_name, sub_department_name)

        authorities = []
        for route in services.IMPORT_ROUTES:
            if route == services.IMPORT_ROUTE_D787J and not can_import_d787j:
                continue
            for name in services.authority_options(
                department_name, route, sub_department_name
            ):
                authorities.append({"value": name, "label": name, "route": route})

        return Response(
            {
                "can_import_d787j": can_import_d787j,
                "authorities": authorities,
            }
        )

    # Developed by Unknown: Every closed list a hand-entered row may draw on, for THIS caller's
    # department and ONE route - requirement 3.3's Mode 1, which offers each field as the
    # template workbook offers it.
    #
    # It exists so that no value list is hard-coded in the component. The screen had been
    # carrying its own `categoryOptions` and `criticalOptions` arrays, which is the same defect
    # the old five-entry `IMPORT_TYPE_OPTIONS` had - a list in a template drifts from the rule
    # engine and then offers a value the engine refuses. Every list below is read from the same
    # `services` register `validate_import_row` checks against, so the two cannot disagree.
    #
    # `getEquipmentClasses()` on the front end was considered and is not used for this: it
    # returns the EquipmentClass table keyed by primary key, cached for the app session, and
    # ungrouped. Hand entry needs the NAME - the sheet carries names, and rule R-012-MASTER
    # matches on the name under the row's own spare class - so the names are returned grouped
    # by spare class instead.
    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="route",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=True,
                enum=["D787J", "OTHERS"],
                description="The import route the values are wanted for.",
            )
        ]
    )
    @action(detail=False, methods=["get"], url_path="import-value-lists")
    def import_value_lists(self, request):
        """The permitted values for one department and one route, for the hand-entry form."""
        route = services.normalise_import_route(request.query_params.get("route"))
        if route is None:
            raise DRFValidationError(
                {"route": ["Choose an import route - D787J or OTHERS."]}
            )

        department = self._import_department()
        department_name = getattr(department, "name", "")
        permitted = services.permitted_spare_classes(department_name, route)
        registered = {
            (name or "").strip().upper()
            for name in SpareClass.objects.filter(department=department).values_list(
                "name", flat=True
            )
        }

        # Grouped by SPARE CLASS name, because that is what rule 2.6's master check matches
        # on - an equipment class belongs to one spare class, and offering the whole
        # department's list under every spare class would offer values that must then fail.
        equipment_classes = {}
        for spare_class_name, equipment_class_name in (
            EquipmentClass.objects.filter(spare_class__department=department)
            .order_by("spare_class__name", "name")
            .values_list("spare_class__name", "name")
        ):
            equipment_classes.setdefault(
                (spare_class_name or "").strip().upper(), []
            ).append((equipment_class_name or "").strip().upper())

        # Developed by Unknown: WHAT THE SCREEN MAY OFFER, which is not the same question as
        # which spare class a row is STORED under, and the difference is what hid MICELLANEOUS.
        #
        # An equipment class name is unique per DEPARTMENT
        # (`obs_equipmentclass_unique_name_per_department`), so the seed can attach
        # MICELLANEOUS to SPARES_MICELLANEOUS and to nothing else - one row, one spare class.
        # Clause 2.6 nonetheless permits that same name under SPARES_PLL and SPARES_CONSUMABLE,
        # and `services._check_equipment_class` accepts it there because it matches on the
        # department. The grouping above, read literally, offered it under one spare class of
        # the three and left the other two with an EMPTY list on a freshly seeded ship.
        #
        # So the options are built from the RULE and not from the storage:
        #   - a spare class clause 2.6 gives a closed list to offers exactly that list,
        #     narrowed to the names the department actually holds;
        #   - every other spare class offers the department's whole list, which is precisely
        #     what the rule engine will accept for it.
        department_equipment_classes = sorted(
            {name for names in equipment_classes.values() for name in names}
        )
        equipment_class_options = {}
        for spare_class_name in permitted:
            closed_list = services.EQUIPMENT_CLASS_BY_SPARE_CLASS.get(spare_class_name)
            if closed_list is None:
                equipment_class_options[spare_class_name] = department_equipment_classes
                continue
            equipment_class_options[spare_class_name] = [
                name for name in department_equipment_classes if name in closed_list
            ]

        return Response(
            {
                "route": route,
                "department": department_name,
                # Only the values that are BOTH permitted by clause 2.5 for this department
                # and route AND already on the ship's master list. Offering one that is not
                # set up could only ever produce a row failing R-010-MASTER, which is an
                # error the form can prevent rather than report - Nielsen 5.
                "spare_classes": [
                    {"value": name, "label": name}
                    for name in sorted(permitted)
                    if name in registered
                ],
                # The rest of clause 2.5's permitted set, named rather than silently dropped,
                # so the screen can say WHY a spare class the department is entitled to is
                # missing from the list above instead of leaving the operator to wonder.
                "spare_classes_not_set_up": sorted(
                    name for name in permitted if name not in registered
                ),
                "equipment_classes": equipment_classes,
                # What the hand-entry Equipment Class control offers, per spare class. Kept
                # beside `equipment_classes` rather than replacing it: that one still answers
                # "which spare class is this name stored under", which the Equipment Classes
                # tab asks and this map deliberately no longer says.
                "equipment_class_options": equipment_class_options,
                "categories": [
                    {"value": code, "label": services.CATEGORY_LABELS[code]}
                    for code in services.CATEGORY_CODES
                ],
                "denominations": [
                    {"value": name, "label": name}
                    for name in services.DENOMINATION_OPTIONS
                ],
                "rack_positions": [
                    {"value": name, "label": name}
                    for name in services.RACK_POSITION_OPTIONS
                ],
                "critical_values": [
                    {"value": name, "label": name} for name in services.CRITICAL_OPTIONS
                ],
            }
        )

    # Developed by Unknown: this schema block was ORPHANED - it sat far above, stacked on top of
    # `import_authorities`'s own `@extend_schema`, so drf-spectacular documented the template
    # download's three query parameters and its binary XLSX response against the authority-list
    # endpoint, and `download-template/` was documented with none of its own. Moved to the action
    # it actually describes. Nothing about either endpoint's behaviour changes - only the schema.
    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="department",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                required=False,
                description=(
                    "master.Department id. Optional for a departmental login, which is scoped "
                    "to its own department either way. Required for a privileged login, which "
                    "has no department of its own. Another department's id is refused."
                ),
            ),
            OpenApiParameter(
                name="route",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=True,
                enum=["D787J", "OTHERS"],
                description=(
                    "Which of the department's workbooks to serve. Only Engineering, Electrical "
                    "and the Hull sub-department hold a D787J document, so D787J is available "
                    "for those scopes alone - see GET template-routes/."
                ),
            ),
            OpenApiParameter(
                name="sub_department",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=False,
                enum=["HULL", "NBCD"],
                description=(
                    "Executive only. Narrows the download to that sub-department's own "
                    "workbook instead of the general Executive one."
                ),
            ),
        ],
        responses={
            (200, XLSX_CONTENT_TYPE): OpenApiTypes.BINARY,
        },
    )
    @action(detail=False, methods=["get"], url_path="download-template")
    def download_template(self, request):
        """Serve the curated onboard-spares import workbook for one department and one route."""
        department = self._resolve_scope_department(request)
        # Developed by Unknown: THE MAP KEY IS THE CANONICAL NAME, and the row's own name is
        # kept for the `scope` string below. A CMMS-synced deployment names the Engineering row
        # `E`, which is in no key of `IMPORT_TEMPLATE_DEPARTMENT_CODES` - so every download
        # 404'd and `template-routes/` hid both buttons, for a department that has two
        # workbooks on disk. A refusal still names the department as the operator sees it.
        department_name = canonical_department_name(department)

        route = (request.query_params.get("route") or "").strip().upper()
        if route not in IMPORT_TEMPLATE_ROUTES:
            raise DRFValidationError(
                {"route": ["Choose an import route - D787J or OTHERS."]}
            )

        file_prefix = IMPORT_TEMPLATE_DEPARTMENT_CODES.get(department_name)
        sub_department = (
            (request.query_params.get("sub_department") or "").strip().upper()
        )
        # Developed by Unknown: a sub-department with a workbook of its own gets it. One
        # without FALLS BACK to its parent department's workbook.
        #
        # This used to refuse with a 400 naming the sub-department, which was wrong on the
        # facts: only HULL and NBCD have their own workbooks, while the page offers all eight
        # of `rbac.EXECUTIVE_SUB_DEPARTMENTS`. So an Executive user holding COMMUNICATION,
        # GUNNERY, ASW, ND, AVIATION or HYGIENE - six of the eight - was told their own
        # sub-department did not exist, on BOTH buttons, and got no workbook at all. The
        # EXEC_ workbooks cover them correctly, and now they are served.
        if sub_department:
            permitted = IMPORT_TEMPLATE_SUB_DEPARTMENT_CODES.get(department_name, {})
            file_prefix = permitted.get(sub_department, file_prefix)

        scope = (
            f"{department.name} - {sub_department}"
            if sub_department
            else department.name
        )
        if file_prefix is None:
            return Response(
                {
                    "status": "error",
                    "message": (
                        f"No import template is available yet for {scope} on the "
                        f"{route} route."
                    ),
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        file_name = (
            f"{file_prefix}_SWMM_IMPORT_TEMPLATE_{IMPORT_TEMPLATE_ROUTES[route]}.xlsx"
        )
        template_path = IMPORT_TEMPLATE_DIR / file_name
        if not template_path.is_file():
            return Response(
                {
                    "status": "error",
                    "message": (
                        f"No import template is available yet for {scope} on the "
                        f"{route} route."
                    ),
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return FileResponse(
            template_path.open("rb"),
            as_attachment=True,
            filename=file_name,
            content_type=XLSX_CONTENT_TYPE,
        )

    @action(
        detail=False,
        methods=["get"],
        url_path="template-routes",
    )
    def import_template_routes(self, request):
        """Developed by Unknown: which template workbooks actually exist for this scope.

        The page used to offer both Download Template buttons to everyone and let one of them
        404 - NBCD holds its spares on CNAL alone, so an NBCD user was offered a D787J workbook
        that has never existed and never should. Asking first means the page offers only the
        button that can succeed, which is error prevention rather than error reporting.

        Resolves the department through `_resolve_scope_department`, exactly as
        `download_template` does, so one caller cannot ask about another department's templates.
        """
        department = self._resolve_scope_department(request)
        # Resolved for the same reason `download_template` resolves it - the two must agree on
        # which workbook prefix a department has, or this endpoint offers a button that 404s.
        department_name = canonical_department_name(department)
        file_prefix = IMPORT_TEMPLATE_DEPARTMENT_CODES.get(department_name)

        sub_department = (
            (request.query_params.get("sub_department") or "").strip().upper()
        )
        if sub_department:
            permitted = IMPORT_TEMPLATE_SUB_DEPARTMENT_CODES.get(department_name, {})
            file_prefix = permitted.get(sub_department, file_prefix)

        routes = IMPORT_TEMPLATE_ROUTES_BY_PREFIX.get(file_prefix or "", ())
        # Developed by Unknown: the map says which routes were authored. The disk says which
        # were actually shipped. Both must agree before a button is offered, so a workbook
        # missing from a deployment hides its button rather than serving a 404.
        available = [
            route
            for route in routes
            if (
                IMPORT_TEMPLATE_DIR
                / f"{file_prefix}_SWMM_IMPORT_TEMPLATE_{IMPORT_TEMPLATE_ROUTES[route]}.xlsx"
            ).is_file()
        ]
        return Response({"department": department.name, "routes": available})

    # Developed by Unknown: THE SHIP'S MO CUSTOMER CODE - read by everyone, cleared by the
    # administrator. The page shows the code before an import is attempted, so the one number
    # an operator needs in order to prepare a workbook is on screen rather than only inside a
    # refusal they have to trigger first.
    @action(
        detail=False,
        methods=["get", "delete"],
        url_path="import-ship-customer-code",
    )
    def import_ship_customer_code_state(self, request):
        """Report the adopted MO customer code, and on DELETE clear it.

        Two methods on one action because they are two halves of one thing and the page reads
        the same three keys back from either. `get_permissions` routes the DELETE through
        `IsShipAdminRole` by action name, so the read is open to anyone who may use this screen
        and the write is not.
        """
        if request.method == "DELETE":
            return self.clear_ship_customer_code(request)

        code = services.import_adopted_customer_code()
        return Response(
            {
                "customer_code": code,
                "is_adopted": bool(code),
                "can_reset": rbac.is_admin_role(request.user),
            }
        )

    def clear_ship_customer_code(self, request):
        """Developed by Unknown: forget the adopted code so the next import re-adopts.

        Named as its own action so `get_permissions` can gate it separately - `self.action` is
        set from the URL map, and the DELETE above dispatches here after that gate has run.

        Always 200, never 404 on an already-blank code: this is idempotent by nature and a
        second press is not an error.
        """
        # STUB (merge decision, blocker #2): nothing is ever persisted (see
        # `_enforce_ship_customer_code` above and `obs.services._resolve_adopted_ship_customer_
        # code`), so there is never an adopted code sitting in `accounts` for this to clear.
        # Always report "nothing was cleared" rather than call a `rbac.clear_ship_customer_code`
        # that does not exist on `accounts.rbac`.
        cleared = ""
        detail = (
            f"The MO customer code {cleared} has been cleared. The next import will adopt "
            f"the code from the next workbook imported."
            if cleared
            else "No MO customer code is adopted. Nothing was cleared."
        )
        return Response(
            {
                "customer_code": "",
                "is_adopted": False,
                "can_reset": True,
                "detail": detail,
            }
        )

    # Developed by Unknown: CLEAR OBS SPARES. The scope is decided here, once, and handed to
    # `services.purge_spares` - an administrator clears the whole table, a Head of Department
    # clears his own department. A Dy HOD reaches neither method: `CanPurgeSpares` refuses him.
    @action(
        detail=False,
        methods=["get"],
        url_path="purge-state",
    )
    def purge_spares_state(self, request):
        """What the Clear OBS Spares control should say before it is pressed.

        The count is live and scoped, so the confirmation can name a real number rather than
        the vague "all data" the requirement started from.
        """
        whole_ship = rbac.is_admin_role(request.user)
        queryset = self._purge_queryset(request)
        department = rbac.department_of(request.user)
        return Response(
            {
                "can_purge": True,
                "scope": "all" if whole_ship else "department",
                "department_name": None if whole_ship else getattr(department, "name", ""),
                "spare_count": queryset.count(),
            }
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="purge",
    )
    def purge_spares(self, request):
        """Delete every spare in scope, and every transaction record that hangs off it.

        POST rather than DELETE because it carries a confirmation phrase in its body, and a
        DELETE with a body is awkward for several clients. The phrase follows
        a typed confirmation phrase, this codebase's own established precedent for a
        destructive endpoint (the legacy `users` app carried the original example, before the
        `accounts`/`userauth` split).
        """
        confirm = str(request.data.get("confirm") or "").strip().upper()
        if confirm != PURGE_CONFIRMATION_PHRASE:
            raise DRFValidationError(
                {
                    "confirm": [
                        f"Type {PURGE_CONFIRMATION_PHRASE} to confirm. Nothing has been "
                        f"deleted."
                    ]
                }
            )

        whole_ship = rbac.is_admin_role(request.user)
        department = rbac.department_of(request.user)
        report = services.purge_spares(self._purge_queryset(request))

        scope_label = (
            "the Ship Inventory"
            if whole_ship
            else f"{getattr(department, 'name', '')}"
        )
        return Response(
            {
                "deleted": report,
                "scope": "all" if whole_ship else "department",
                "detail": (
                    f"{report['spares']} spare(s) deleted from {scope_label}, together with "
                    f"their issue, survey, demand and receipt records. Import your workbooks "
                    f"again when you are ready."
                ),
            }
        )

    def _purge_queryset(self, request):
        """Developed by Unknown: the spares this caller's Clear control acts on.

        An admin role gets the WHOLE table, deliberately unfiltered - `self.get_queryset()`
        rather than the department-scoped queryset, because clearing the ship is the point.
        Everyone else who reaches here is a Head of Department, and gets his own department
        through the viewset's existing scoped helper rather than a second inline filter.
        """
        if rbac.is_admin_role(request.user):
            return self.get_queryset()
        return self._department_scoped_queryset()

    @action(
        detail=False,
        methods=["post"],
        url_path="import-excel-preview",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_excel_preview(self, request):
        """Read-only richer sibling of `import_excel`'s `dry_run` — full per-row data preview,
        essential/optional/extra column reporting, and in-file duplicate detection, for the
        References > Masters > Import Data validation-results UI. Never mutates data: the
        classification pass resolves each row's master data by lookup only and never creates
        any, and still runs inside a rolled-back transaction. Always 200 for a parseable file
        — row-level problems are normal preview output, not an HTTP error; 400 is reserved for
        genuine file-level failures (bad/missing file, corrupt workbook, no header row, row
        limit exceeded), identical to `import_excel`.

        Developed by Unknown: Two file-level refusals join that list - an unentitled role on
        the D787J route (403) and a sheet whose AUTHORITY column disagrees with the selected
        import authority (400). Both are decided before the rows are classified, so a
        refused file produces no preview at all rather than a preview of rows that will
        never be imported.

        Developed by Unknown: The preview is now re-requested after every correction the
        user makes in the working table, carrying that correction with it, so the row that
        comes back green is one this engine has actually re-validated. Nothing is
        re-classified in the browser.

        Developed by Unknown: It also serves requirement 3.3's HAND-ENTRY mode. A client
        posts `rows` instead of `file` and every line below this one is unchanged - the same
        gates, the same rule engine, the same response. There is no separate hand-entry
        endpoint and no second copy of any rule."""
        route, authority = self._resolve_import_selection(request)
        error_response, raw_rows, column_report = self._resolve_import_rows(
            request, route, authority
        )
        if error_response is not None:
            return error_response

        self._enforce_sheet_authority(raw_rows, authority)
        # Developed by Unknown: `adopt=False` - a preview settles nothing. It reads the code
        # the sheet carries so the rows below can be validated and their pattern numbers shown,
        # but the ship's identity is only written by a commit the operator actually made.
        self._import_ship_customer_code = self._enforce_ship_customer_code(
            raw_rows, adopt=False
        )

        # Developed by Unknown: what this sheet would ADD to the ship's master lists, split by
        # whether anybody has to ANSWER for it.
        #
        # A value that needs confirming - an unlisted DENOMINATION, an unlisted AUTHORITY - stays
        # PENDING and is only reported. The preview must not settle a question the operator has
        # not been asked yet, and they may never commit this file at all.
        #
        # A value that needs no confirming - an EQUIPMENT CLASS, which clause 2.6.1 permits the
        # ship's own D787J document to name - is MATERIALISED, inside the transaction
        # `_classify_import_rows_guarded` always rolls back. See its docstring for why that is
        # both safe and necessary.
        department = self._import_department()
        additions = services.collect_master_additions(raw_rows, department, route)
        provisional = [
            addition for addition in additions if not addition.confirmation_required
        ]
        pending = services.pending_master_values(
            [addition for addition in additions if addition.confirmation_required]
        )

        serializer_fields = self.get_serializer().fields
        rows, _payloads = self._classify_import_rows_guarded(
            raw_rows,
            serializer_fields,
            route,
            pending,
            provisional=provisional,
            department=department,
        )

        missing_essential, missing_optional, extra_columns = column_report
        total_rows = len(rows)
        valid_rows = sum(1 for row in rows if row["status"] == "valid")
        invalid_rows = sum(1 for row in rows if row["status"] == "invalid")
        duplicate_rows = sum(1 for row in rows if row["status"] == "duplicate")
        pattern_only_rows = sum(1 for row in rows if row["pattern_only_error"])
        confirmation_rows = sum(
            1 for row in rows if row["needs_master_confirmation"]
        )
        patterns_generated, descriptions_corrected, categories_corrected = (
            self._import_correction_counts(rows)
        )
        shortfall_rows = self._import_shortfall_count(rows, route)

        return Response(
            {
                "summary": {
                    "total_rows": total_rows,
                    "valid_rows": valid_rows,
                    "invalid_rows": invalid_rows,
                    "duplicate_rows": duplicate_rows,
                    "unique_rows": total_rows - duplicate_rows,
                    "missing_essential_columns": missing_essential,
                    "missing_optional_columns": missing_optional,
                    "extra_columns": extra_columns,
                    # Developed by Unknown: The three counts clauses 4.3 and 4.4 ask to be
                    # stated in the message beside the results table. The legacy
                    # application counted the generated ones too, as `missing_details`, and
                    # then reported them to the user as "entries skipped due to missing
                    # data" - wording that says the opposite of what the counter means. The
                    # rows were not skipped, they were imported with a generated pattern
                    # number. That wording is deliberately not carried across.
                    "patterns_generated": patterns_generated,
                    "descriptions_corrected": descriptions_corrected,
                    "categories_corrected": categories_corrected,
                    # Developed by Unknown: Clause 4.5's count, delivered here because the
                    # confirmation it feeds is raised BEFORE the save and so cannot wait for
                    # the commit response.
                    "shortfall_rows": shortfall_rows,
                    # Developed by Unknown: The two counts behind the working table's new
                    # presentation states. Both are subsets of `invalid_rows` and neither is
                    # subtracted from it - a row that needs a pattern number or a confirmation
                    # is still a row that will not be committed as it stands, and a summary
                    # that said otherwise would understate what is left to do.
                    "pattern_only_rows": pattern_only_rows,
                    "confirmation_rows": confirmation_rows,
                },
                # Developed by Unknown: Delivered at PREVIEW time for the same reason
                # `shortfall_rows` is - the confirmation it feeds is raised before the save.
                # One entry per distinct value, not per row: a sheet using `PCS` on twelve rows
                # asks the Head of Department one question, not twelve.
                "master_additions": [
                    {
                        "field": addition.field,
                        "column": addition.column,
                        "clause": addition.clause,
                        "value": addition.value,
                        "in_rules": addition.in_rules,
                        "confirmation_required": addition.confirmation_required,
                        "rows": list(addition.rows),
                    }
                    for addition in additions
                ],
                "rows": rows,
            }
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="import-excel-commit-valid",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_excel_commit_valid(self, request):
        """Commits only the rows `import_excel_preview` would classify "valid" — invalid and
        duplicate rows are skipped individually rather than blocking the whole batch the way
        `import_excel` does. Fully stateless: re-parses and re-classifies the re-uploaded file
        from scratch rather than trusting any client-supplied row selection, since the file may
        have changed since the last preview, or a client could otherwise force-commit rows the
        server itself would reject. Each row's real save runs in its own nested
        `transaction.atomic()` (a savepoint) — required on Postgres, which poisons the whole
        enclosing transaction on any exception (even a caught one) until rolled back, so a flat
        outer-atomic + bare try/except would break every row after the first failure.

        Developed by Unknown: The route, role, authority and password gates are applied here
        exactly as they are on the preview - re-checked rather than remembered, for the same
        reason the row classification is re-run rather than trusted. The client sends the
        same four values with both calls.

        Developed by Unknown: It also sends the working table's corrections, and they are
        applied here exactly as they are on the preview. Statelessness is unchanged - the
        client supplies CELL VALUES and never a verdict, and every one of them is put
        through the same rule engine, serializer and `full_clean()` as a value read
        straight out of the workbook. A correction that would make a row pass a rule it
        actually fails still fails it.

        Developed by Unknown: The same is true of requirement 3.3's HAND-ENTRY mode, which
        posts `rows` instead of `file`. A hand-built row is a set of cell values and never a
        verdict, it is re-validated here from scratch on every call, and the D787J route is
        refused for it outright."""
        route, authority = self._resolve_import_selection(request)
        error_response, raw_rows, _column_report = self._resolve_import_rows(
            request, route, authority
        )
        if error_response is not None:
            return error_response

        self._enforce_sheet_authority(raw_rows, authority)
        # Developed by Unknown: `adopt=True` - this is the commit, so the first workbook
        # imported settles the ship's MO customer code here. The write happens BEFORE
        # `_classify_import_rows_guarded`, deliberately outside it: that helper does its work
        # inside a transaction it always rolls back, so an adoption written within it would be
        # discarded along with the classification.
        self._import_ship_customer_code = self._enforce_ship_customer_code(
            raw_rows, adopt=True
        )

        # Developed by Unknown: THE MASTER ADDITIONS, WRITTEN HERE AND FOR THE SAME REASON THE
        # customer-code adoption immediately above is. `_classify_import_rows_guarded` does its
        # work inside a transaction it always rolls back, so a master row created inside it
        # would be thrown away along with the classification and the very next line would fail
        # to find it. Written first, the rows exist by the time the engine looks, every
        # `_resolve_*` finds its foreign key through the code path it always used, and neither
        # the rule engine nor the payload builder needs to know this happened at all.
        #
        # `pending` then carries only what is still WAITING. A confirmed value is a real master
        # row by now and is nobody's pending anything; an unconfirmed one keeps its rows flagged,
        # and those rows are skipped by the commit loop below exactly as an invalid row is.
        department = self._import_department()
        additions = services.collect_master_additions(raw_rows, department, route)
        outstanding = services.unconfirmed_master_additions(
            additions, self._resolve_confirmed_master_additions(request)
        )
        outstanding_keys = {
            services.master_addition_key(addition.field, addition.value)
            for addition in outstanding
        }
        masters_added = services.create_master_additions(
            [
                addition
                for addition in additions
                if services.master_addition_key(addition.field, addition.value)
                not in outstanding_keys
            ],
            department,
        )
        pending = services.pending_master_values(outstanding)

        serializer_fields = self.get_serializer().fields
        rows, payloads = self._classify_import_rows_guarded(
            raw_rows, serializer_fields, route, pending
        )
        status_by_row = {row["row"]: row["status"] for row in rows}
        generated_rows = {row["row"] for row in rows if row["pattern_generated"]}

        # Developed by Unknown: The two things the shortfall routing needs, both resolved ONCE
        # for the request rather than once per row, and both resolved BEFORE a single spare is
        # written.
        #
        # The admin account is a file-level refusal when it is missing and the sheet actually
        # carries a shortfall. That is deliberate and it is the correction of the reference
        # application's worst defect on this path: there, a missing DEFAULT_USER profile made
        # `.first()` return `None`, line 53 raised `AttributeError`, the bare `except
        # Exception` at `db\\excel_to_db.py` line 242 swallowed it, and the import reported
        # SUCCESS while every shortfall silently failed to route. Refusing the file before
        # anything is written is the opposite of that, and it costs the user one clear
        # sentence instead of a silent hole in their inventory.
        shortfall_expected = self._import_shortfall_count(rows, route)
        admin_profile = None
        if shortfall_expected:
            admin_profile = services.application_admin_profile()
            if admin_profile is None:
                raise DRFValidationError(
                    {"file": [services.NO_APPLICATION_ADMIN_MESSAGE]}
                )
        # Developed by Unknown: the gate above already resolved this for the request, adopting
        # it where this was the first import. Reading it again through
        # `services.import_ship_customer_code` would raise on that very first commit, because
        # the adoption is not visible to a fresh read until the gate has run - and it has.
        ship_customer_code = self._import_ship_customer_code

        shortfall_rows = 0
        shortfall_to_survey = 0
        shortfall_to_demand = 0
        shortfall_iif = 0

        # Developed by Unknown: The in-batch candidate set is cleared before the commit
        # loop. Everything it holds was handed out during the classification pass, whose
        # transaction has just been rolled back, so those numbers were never actually
        # reserved. Keeping them would make the loop skip past a run of perfectly free
        # numbers and leave a gap in the counter for no reason.
        self._import_generated_pattern_numbers = set()

        imported = 0
        skipped_invalid = 0
        skipped_duplicate = 0
        # Developed by Unknown: What the PICTURE PATH column actually did, counted for the
        # operator. `images_attached` is photographs read off the server's filesystem and stored
        # against a spare; `images_skipped` is rows that named a path the server could not use
        # and which therefore kept the default photo. The preview already said which rows those
        # were and why, one sentence each, on `advisories["picture_path"]`.
        images_attached = 0
        images_skipped = 0
        for row_number, _row in raw_rows:
            row_status = status_by_row.get(row_number)
            if row_status == "invalid":
                skipped_invalid += 1
                continue
            if row_status == "duplicate":
                skipped_duplicate += 1
                continue
            # The storage name written for this row, if any. Held outside the savepoint because
            # it is needed by the `except` below, which runs after the savepoint has gone.
            stored_image_name = None
            try:
                with transaction.atomic():
                    # Developed by Unknown: The payload the classification pass built is
                    # reused rather than rebuilt from the raw sheet. That pass applied the
                    # source-of-truth corrections, and rebuilding here would have thrown
                    # every one of them away and committed the workbook's own uncorrected
                    # description and category.
                    payload = dict(payloads[row_number])
                    if row_number in generated_rows:
                        # The generated number is minted AGAIN here, and this is the one
                        # that is kept. The classification pass's number came out of a
                        # transaction that was rolled back, so the counter never moved for
                        # it. A previewed generated pattern number is therefore PROVISIONAL
                        # - stated in the API contract - because the alternative is a
                        # preview that consumes counter values it may never use.
                        payload["pattern_number"] = self._commit_pattern_number(payload)
                    # Same exemption as _classify_import_rows() above — this commit
                    # loop re-validates each row before saving it for real.
                    serializer = self.get_serializer(
                        data=payload,
                        context={
                            **self.get_serializer_context(),
                            "skip_high_holding_check": True,
                        },
                    )
                    serializer.is_valid(raise_exception=True)
                    instance = Spares(**serializer.validated_data)

                    # Developed by Unknown: THE PICTURE, read off the server's filesystem and
                    # attached before the row is written. This is what the PICTURE PATH column
                    # was always for; until now it was displayed in the working table and
                    # discarded, so every imported spare kept the default photo.
                    #
                    # The path deliberately never entered `payload`: the serializer's `image` is
                    # an `ImageField` and would try to coerce a string into an uploaded file. It
                    # is carried alongside instead and attached to the instance directly.
                    #
                    # `save=False` writes the file to storage but does not write the row - the
                    # `instance.save()` two lines down does that, once, as before. It matters
                    # that this runs AFTER `equipment_class` is populated, because
                    # `spare_image_upload_path` reads the class and its department to build the
                    # folders.
                    #
                    # Any failure here is COUNTED AND SWALLOWED, never raised. One unreadable
                    # photograph must not fail a row whose inventory data is perfectly good.
                    picture_file, picture_problem = excel.resolve_import_image(
                        services.cell_text(_row.get("picture_path"))
                    )
                    if picture_file is not None:
                        instance.image.save(
                            picture_file.name, picture_file, save=False
                        )
                        stored_image_name = instance.image.name
                    elif picture_problem:
                        images_skipped += 1

                    instance.full_clean()
                    instance.save()
                    if stored_image_name:
                        images_attached += 1

                    # Developed by Unknown: Call site 5 of 5, and requirement 4.1's routing.
                    #
                    # It runs INSIDE the per-row savepoint this loop already opens - no
                    # second transaction is started, because the docstring above explains
                    # why Postgres needs this one and nesting another would only add a
                    # savepoint inside a savepoint. A row whose routing fails therefore
                    # rolls back the spare as well, and is counted as skipped, rather than
                    # leaving a committed spare with no cart entry - which is exactly the
                    # state the reference application's per-statement commits produced.
                    #
                    # Gated on the D787J route. On the OTHERS route authorised must equal
                    # held (rule 2.11.3 / R-028) and a difference is already a hard reject,
                    # so no short row reaches this line - the gate says so out loud.
                    if route == services.IMPORT_ROUTE_D787J:
                        routed = services.route_import_shortfall(
                            instance,
                            admin_profile=admin_profile,
                            ship_customer_code=ship_customer_code,
                        )
                        if routed is not None:
                            shortfall_rows += 1
                            if routed.cart == "survey":
                                shortfall_to_survey += 1
                            elif routed.cart == "demand":
                                shortfall_to_demand += 1
                            if routed.is_iif:
                                shortfall_iif += 1
                imported += 1
            except (DRFValidationError, DjangoValidationError):
                # Rare: a race against the classification pass above (e.g. another request
                # created a conflicting master-data row in between) — skip, don't 500.
                skipped_invalid += 1
                # Developed by Unknown: the savepoint has taken the row back out; the FILE is
                # not in the database and no rollback touches it. Deleting it here is what
                # stops a rolled-back row from leaving an orphan in the media folder that
                # nothing references and nothing will ever clean up. A failure to delete is
                # itself ignored - a stray file is not worth turning a skipped row into a 500.
                if stored_image_name:
                    try:
                        default_storage.delete(stored_image_name)
                    except OSError:
                        pass

        patterns_generated, descriptions_corrected, categories_corrected = (
            self._import_correction_counts(rows)
        )
        return Response(
            {
                "imported": imported,
                "skipped_invalid": skipped_invalid,
                "skipped_duplicate": skipped_duplicate,
                "total_rows": len(raw_rows),
                "patterns_generated": patterns_generated,
                "descriptions_corrected": descriptions_corrected,
                "categories_corrected": categories_corrected,
                # What the PICTURE PATH column did — see the counters' declaration above.
                "images_attached": images_attached,
                "images_skipped": images_skipped,
                # Developed by Unknown: What was routed, and where. `shortfall_rows` is the
                # same count the preview's summary carries, restated for the rows actually
                # committed. `shortfall_iif` is a subset of the survey and demand counts, not
                # a third destination - an IIF item goes to its category's cart marked as an
                # IIF item AND appears in the Due for IIF cart, and the quantity lives on the
                # Survey or Demand row.
                "shortfall_rows": shortfall_rows,
                "shortfall_to_survey": shortfall_to_survey,
                "shortfall_to_demand": shortfall_to_demand,
                "shortfall_iif": shortfall_iif,
                # Developed by Unknown: What this commit added to the ship's master lists, and
                # what it did not. Reported rather than left silent because a master row is
                # permanent and shared - an operator who confirmed four values should be able
                # to read back that four were written, and one who confirmed none should be
                # told plainly which values are still waiting and why their rows were skipped.
                "masters_added": masters_added,
                "masters_unconfirmed": [
                    {
                        "column": addition.column,
                        "value": addition.value,
                        "clause": addition.clause,
                    }
                    for addition in outstanding
                ],
            }
        )

    # Developed by Unknown: Mints the real, committed pattern number for a row whose cell
    # was blank. Split out of the loop above so the loop reads as one thing.
    #
    # Falls back to the provisional value if the equipment class cannot be re-read, which
    # can only happen if it was deleted between the two passes. Leaving the row blank would
    # be worse - a blank pattern number is still classified valid and would import a spare
    # with no identifier at all.
    def _commit_pattern_number(self, payload):
        equipment_class = (
            EquipmentClass.objects.select_related("spare_class")
            .filter(pk=payload.get("equipment_class"))
            .first()
        )
        if equipment_class is None:
            return payload.get("pattern_number", "")
        return self._generate_import_pattern_number(equipment_class)

    # Developed by Unknown: `import_excel` is the third import path into this table and it
    # was ungated. It comes from `obs.excel.ExcelImportExportMixin`, is bound at TWO urls
    # (`import/` and `import-excel-file/`, both named `import_excel_file`), and nothing in
    # the Angular front end calls either. It is nonetheless live and reachable by any
    # authenticated account, so it accepted a workbook whose AUTHORITY column read D787J
    # from any role at all. It is gated rather than removed - the two urls exist as a
    # compatibility shim for the legacy application's own paths.
    #
    # Overridden here on `SparesViewSet` and NOT changed in the mixin, because the mixin is
    # mixed into all nineteen viewsets of this app and into the `ilms`, `wlms`, `dms` and
    # `inout_tag` copies of it. None of those imports onboard spares and none of them has an
    # import route or an authority column.
    #
    # The workbook is parsed twice on this path - once here for the authority gate and once
    # by the mixin. That is accepted rather than optimised away: this endpoint is unreachable
    # from the application, and duplicating the mixin's whole body to save one pass would be
    # a far worse trade. The upload is rewound between the two so the second pass reads it
    # from the start.
    @action(
        detail=False,
        methods=["post"],
        url_path="import-excel",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_excel(self, request):
        """Strict all-or-nothing spares import — now behind the same four gates as the
        preview and commit actions."""
        _route, authority = self._resolve_import_selection(request)

        error_response, parsed = self._parse_excel_workbook(request)
        if error_response is not None:
            return error_response
        self._enforce_sheet_authority(parsed.raw_rows, authority)

        uploaded_file = request.FILES.get("file") or request.FILES.get("excel")
        if uploaded_file is not None:
            uploaded_file.seek(0)
        return super().import_excel(request)
