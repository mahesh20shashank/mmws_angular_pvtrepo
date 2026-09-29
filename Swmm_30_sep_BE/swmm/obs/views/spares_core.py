"""`SparesViewSet` - CRUD/search/scoping, dashboards, pattern verification, multi-issue
family, history, and the department/sub-department/master-data dropdown endpoints.

Split out of the former flat `obs/views.py` (Part 1 of the obs file-structure split).
`SparesViewSet` now reads `class SparesViewSet(SparesImportMixin, CleanValidationModelViewSet)`
- the Excel-import half lives in `spares_import.py`.

Also carries optimization 2.1: `ship_dashboard`'s five-group/three-bucket spare
availability breakdown is now one `.aggregate()` call with fifteen conditional `Count(...)`
expressions, rather than loading every spare in scope into memory to bucket by hand in
Python. `stock_bucket()` stays as a plain function - the rest of this view still needs the
actual spare objects (for `critical_shortages`, `low_stock_spares`, `stock_health`,
`decision_support`, `departments`, `supportability`, and `search_result`), so only the
group/bucket breakdown itself moved to the database.
"""

from dateutil.relativedelta import relativedelta
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, F, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.timezone import localtime
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema
from accounts import rbac
from accounts.models import CustomUserProfile
from accounts.permissions import IsShipAdminRole
from ems.models import EquipmentName, SectionName
from ilms.models import DartMOSpare, PlannedMOSpareList
from master.models import Department, SubDepartment
from op_maintenance.models import DartSpare, InitiateDart
from op_maintenance.utils import generate_dart_number
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from wlms.models import DartWedSpare, PlannedWEDSpareList, SpareDataMap, WLMSSpare

from .. import services
from ..models import (
    HIGH_HOLDING_QUANTITY_THRESHOLD,
    HIGH_HOLDING_REASON_MESSAGE,
    HIGH_HOLDING_REASON_MIN_LENGTH,
    HIGH_ISSUE_QUANTITY_THRESHOLD,
    HIGH_ISSUE_REASON_MESSAGE,
    Authority,
    Demand,
    Denomination,
    EquipmentClass,
    Issue,
    IssueList,
    NotInCattedItem,
    PostDemand,
    PostReceive,
    PostSurvey,
    Receive,
    Return,
    SpareClass,
    Spares,
    SparesMapping,
    Survey,
)
from ..serializers import (
    DemandSerializer,
    EquipmentClassSerializer,
    InitiateStockActionSerializer,
    IssueSerializer,
    MultiIssueSerializer,
    PatternMultiIssueSerializer,
    PostDemandSerializer,
    PostReceiveSerializer,
    PostSurveySerializer,
    RaiseDartSerializer,
    ReceiveSerializer,
    ReturnSerializer,
    SparesDeficiencySerializer,
    SparesSerializer,
    SurveySerializer,
    UpdateSparePatternSerializer,
    VerifyPatternSerializer,
    _is_sub_department_confined,
    _own_sub_department_row,
)
from ..utils import (
    canonical_department_name,
    criticality_escalation_message,
    default_spare_image_url,
    generate_pattern_number,
    tagged_viewset,
)
from .base import (
    CanPurgeSpares,
    CanUseMastersPage,
    _SubDepartmentScopedFilterBackend,
    _SubDepartmentScopedObjectPermission,
    _requested_scope_value,
    _resolve_selected_sub_department,
    _scope_queryset_to_sub_department,
    payload_pk,
    request_user_department_id,
    user_display_name,
)
from .base import CleanValidationModelViewSet
from .spares_import import SparesImportMixin


@tagged_viewset("OBS")
class SparesViewSet(SparesImportMixin, CleanValidationModelViewSet):
    queryset = Spares.objects.select_related(
        "authority",
        "denomination",
        "equipment_class",
        "equipment_class__spare_class",
    )
    serializer_class = SparesSerializer
    # Developed by Unknown: The second dimension of visibility, added beside the department one
    # rather than written into this viewset. `_SubDepartmentScopedFilterBackend` and
    # `_SubDepartmentScopedObjectPermission` are the sub-department counterparts of the two
    # classes already listed here, and they are the ONLY place the rule is expressed -
    # `backend\CLAUDE.md` records that this codebase's department-scoping bugs all came from views
    # that re-derived the rule inline and then drifted.
    #
    # What the pair actually does, in the two cases that matter:
    #   - the Executive Head of Department sees all eight sub-departments together, and narrows to
    #     one (or to Unassigned) with `?sub_department=`.
    #   - a Dy HOD of one Executive sub-department sees only their own, always. A `?sub_department=`
    #     naming another is refused with 403 rather than silently ignored.
    # Everyone else is untouched: a spare in a non-Executive department has no sub-department, and
    # a caller who holds none is never confined.
    filter_backends = [
        rbac.DepartmentScopedFilterBackend,
        _SubDepartmentScopedFilterBackend,
    ]
    permission_classes = [
        IsAuthenticated,
        rbac.DepartmentScopedObjectPermission,
        _SubDepartmentScopedObjectPermission,
    ]
    department_scope_field = "equipment_class__spare_class__department_id"
    department_scope_param = "department"
    # Developed by Unknown: A plain column on `obs_spares`, not a traversal - unlike the
    # department, which is only reachable through the equipment class. The parameter is
    # `?sub_department=`, deliberately alongside the existing non-default `?department=`.
    sub_department_scope_field = "sub_department_id"
    sub_department_scope_param = "sub_department"

    # Developed by Unknown: THE MASTERS-SCREEN ACTIONS, gated by role.
    #
    # This viewset serves two very different screens. Search and Add Spare are everyday work
    # for every role that holds spares - a storekeeper uses them daily. References > Masters
    # initialises the ship's inventory: it imports in bulk, downloads the departmental template
    # workbooks and clears saved data. That is departmental-command work.
    #
    # So the gate is PER ACTION and never class-wide. A `permission_classes` on the class would
    # take Search and Add Spare away from the roles that need them most.
    MASTERS_ACTIONS = frozenset(
        {
            "import_excel_preview",
            "import_excel_commit_valid",
            "download_template",
            "import_template_routes",
            "master_dropdown",
            "import_authorities",
            "import_value_lists",
            "import_ship_customer_code_state",
        }
    )

    # Developed by Unknown: narrower still - clearing saved spares is destructive and excludes
    # a Dy HOD, and resetting the adopted MO customer code is administrator-only.
    PURGE_ACTIONS = frozenset({"purge_spares", "purge_spares_state"})
    ADMIN_ONLY_ACTIONS = frozenset({"clear_ship_customer_code"})

    def get_permissions(self):
        """Developed by Unknown: role-gate the Masters screen's own actions and leave every
        other action on this viewset exactly as it was.

        There was no `get_permissions` here before, so nothing that is not named above changes
        behaviour - `super()` returns the class-level list unchanged.

        Developed by Unknown: THE METHOD MATTERS ON ONE ACTION. `import-ship-customer-code/`
        serves both GET and DELETE, and DRF sets `self.action` from the URL map - so it is
        `import_ship_customer_code_state` for BOTH, and the DELETE was reaching the wider
        `CanUseMastersPage` gate rather than the administrator-only one. Reading the code is open
        to anyone who may use this screen; forgetting it for the whole ship is not.
        """
        if (
            self.action == "import_ship_customer_code_state"
            and self.request.method == "DELETE"
        ):
            return [IsAuthenticated(), IsShipAdminRole()]
        if self.action in self.ADMIN_ONLY_ACTIONS:
            return [IsAuthenticated(), IsShipAdminRole()]
        if self.action in self.PURGE_ACTIONS:
            return [IsAuthenticated(), CanPurgeSpares()]
        if self.action in self.MASTERS_ACTIONS:
            return [IsAuthenticated(), CanUseMastersPage()]
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        """Add Spare — overridden (default `ModelViewSet.create` is otherwise stock)
        to add: auto pattern-number generation when left blank, a hard block on a
        duplicate pattern number (ship-wide — pattern numbers are global identifiers,
        matched exactly this way elsewhere e.g. `_create_pattern_issues`), and a soft,
        confirm-to-proceed warning on a duplicate description within the caller's own
        department. The >20-holding-needs-a-reason rule lives in
        `SparesSerializer.validate()` instead, since it must also apply to `update`."""
        data = request.data.copy()

        equipment_class = (
            EquipmentClass.objects.select_related("spare_class__department")
            .filter(pk=data.get("equipment_class"))
            .first()
        )
        if equipment_class is None:
            raise DRFValidationError({"equipment_class": ["This field is required."]})

        pattern_number = (data.get("pattern_number") or "").strip().upper()
        generated = False
        if not pattern_number:
            try:
                pattern_number = generate_pattern_number(equipment_class)
            except ValueError as error:
                raise DRFValidationError({"pattern_number": [str(error)]}) from error
            data["pattern_number"] = pattern_number
            generated = True

        if not generated:
            existing = (
                Spares.objects.select_related(
                    "equipment_class", "equipment_class__spare_class"
                )
                .filter(pattern_number__iexact=pattern_number)
                .first()
            )
            if existing is not None:
                in_user_department = (
                    self._department_scoped_queryset().filter(pk=existing.pk).exists()
                )
                return Response(
                    {
                        "code": "duplicate_pattern_number",
                        "field": "pattern_number",
                        "detail": (
                            f"Pattern number {existing.pattern_number} is already "
                            "registered to an existing spare."
                        ),
                        "existing_spare": {
                            "id": existing.pk,
                            "pattern_number": existing.pattern_number,
                            "description": existing.description,
                            "equipment_class": existing.equipment_class_id,
                            "equipment_class_name": existing.equipment_class.name,
                            "spare_class_name": (
                                existing.equipment_class.spare_class.name
                            ),
                            "quantity_authorised": existing.quantity_authorised,
                            "quantity_available": existing.quantity_available,
                            "in_user_department": in_user_department,
                        },
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        description = (data.get("description") or "").strip().upper()
        confirmed = str(
            data.get("confirm_duplicate_description", "")
        ).strip().lower() in {"1", "true", "yes", "on"}
        if description and not confirmed:
            matches_queryset = self._department_scoped_queryset().filter(
                description__iexact=description
            )
            total_matches = matches_queryset.count()
            if total_matches:
                return Response(
                    {
                        "code": "duplicate_description",
                        "field": "description",
                        "detail": (
                            f"{total_matches} spare(s) with this description "
                            "already exist in your department. Add this one "
                            "anyway?"
                        ),
                        "requires_confirmation": True,
                        "confirm_field": "confirm_duplicate_description",
                        "existing_spares": [
                            {
                                "id": spare.pk,
                                "pattern_number": spare.pattern_number,
                                "description": spare.description,
                                "quantity_authorised": spare.quantity_authorised,
                                "quantity_available": spare.quantity_available,
                            }
                            for spare in matches_queryset[:5]
                        ],
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(
            {**serializer.data, "pattern_number_generated": generated},
            status=status.HTTP_201_CREATED,
            headers=headers,
        )

    @action(detail=True, methods=["post"], url_path="increase-holding")
    def increase_holding(self, request, pk=None):
        """Existing Spare — increase the quantity held of a spare already on the
        inventory. Deliberately separate from `add_from_ilms` (routed at `addSpare/`),
        which does something else entirely (issues stock OUT and overwrites both
        quantity fields) — reusing it here would corrupt inventory. Touches exactly
        three fields: `quantity_authorised`, `quantity_available` (both, so the
        `available <= authorised` invariant holds and the received stock is actually
        issuable), and `remarks` (appended, never overwritten). No `Issue`/`Demand`/
        `Survey` row is created — this is a receipt, not a consumption."""
        try:
            quantity_to_add = int(request.data.get("quantity_to_add"))
        except (TypeError, ValueError):
            raise DRFValidationError(
                {"quantity_to_add": ["A whole number greater than 0 is required."]}
            )
        if quantity_to_add <= 0:
            raise DRFValidationError({"quantity_to_add": ["Must be greater than 0."]})

        remarks = (request.data.get("remarks") or "").strip()

        with transaction.atomic():
            # `of=("self",)` locks only the Spares row itself, not the joined tables
            # `_department_scoped_queryset()`'s `select_related()` pulls in (some are
            # nullable FKs, e.g. `denomination` — Postgres refuses `FOR UPDATE` on the
            # nullable side of an outer join without this).
            spare = get_object_or_404(
                self._department_scoped_queryset().select_for_update(of=("self",)),
                pk=pk,
            )

            previous_authorised = spare.quantity_authorised
            previous_available = spare.quantity_available
            new_authorised = previous_authorised + quantity_to_add

            if new_authorised > 32767:
                raise DRFValidationError(
                    {
                        "quantity_to_add": [
                            "That increase takes the authorised quantity beyond "
                            "what this field can store."
                        ]
                    }
                )
            if (
                new_authorised > HIGH_HOLDING_QUANTITY_THRESHOLD
                and len(remarks) < HIGH_HOLDING_REASON_MIN_LENGTH
            ):
                raise DRFValidationError(
                    {
                        "remarks": [
                            HIGH_HOLDING_REASON_MESSAGE.format(quantity=new_authorised)
                        ]
                    }
                )

            spare.quantity_authorised = new_authorised
            spare.quantity_available = previous_available + quantity_to_add
            update_fields = ["quantity_authorised", "quantity_available"]
            if remarks:
                existing_remarks = (spare.remarks or "").rstrip()
                spare.remarks = f"{existing_remarks} | {remarks}".strip(" |")
                update_fields.append("remarks")
            spare.save(update_fields=update_fields)

        return Response(
            {
                "spare": SparesSerializer(spare).data,
                "quantity_added": quantity_to_add,
                "previous_quantity_authorised": previous_authorised,
                "previous_quantity_available": previous_available,
            }
        )

    # Developed by Unknown: THE WORKBOOK'S TWENTY COLUMNS, AND THE ORDER THIS DICTIONARY IS
    # WRITTEN IN.
    #
    # The keys are in the order the `OBS` sheet carries them - SER first, SHIP CUSTOMER CODE
    # last - because that order is now load-bearing twice over. `_import_column_classification`
    # builds `friendly_label` by taking the FIRST alias it meets for each target, so whichever
    # spelling is written first here is the one the operator is shown when a column is missing.
    # It used to say `PATTERN NO` and `BOX NO`, neither of which appears in any template, because
    # those two aliases happened to be listed first. The template's own spelling leads now and the
    # legacy alias follows it, so a sheet that still uses the short form is accepted and nobody is
    # ever shown a name their workbook does not have.
    #
    # `SER` and `PICTURE PATH` USED TO MAP TO `""` - read off the sheet and discarded before the
    # row dictionary was built. Nothing stored either of them, but the working table shows all
    # twenty of the sheet's columns, and a column whose value is dropped here cannot be shown.
    # They carried a target of their own for that reason alone, exactly as SHIP CUSTOMER CODE
    # already did for the rule engine's sake.
    #
    # `PICTURE PATH` IS NOW STORED. `import_excel_commit_valid` opens the path it names, reads
    # the photograph and puts it on `Spares.image`, which is what the column was in the workbook
    # for in the first place - until then every imported spare showed the default photo and the
    # only way to give one a picture was to edit it by hand afterwards. `SER` is still shown and
    # still stored nowhere; see `DISPLAY_ONLY_IMPORT_TARGETS` below, which now names it alone.
    #
    # `MO DEMAND NO` IS GONE. It is a leftover from the reference application, whose two static
    # templates carried it "in place of the two D787J columns"
    # (`ship-inventory-obs.nav.ts` lines 6 to 16). Not one of the ten curated workbooks has such a
    # column, so on every real import the value was blank and the header was reported as a
    # MISSING OPTIONAL COLUMN - the application asking, every single time, for a column it had
    # itself stopped shipping. `Spares.mo_demand_number` is untouched: the field, its migration
    # and its serializer entry all stay. It is the IMPORT that no longer knows about it.
    def _scoped_department_id(self):
        """Non-privileged users are always scoped to their own department
        for reads; a non-privileged user passing a `?department=` that is
        not their own is rejected with `PermissionDenied` rather than
        silently substituted, matching `rbac.resolve_selected_department`.
        Privileged users (administrators/superusers) may pass any
        department, or none to see everything.

        Returns `(department_id, is_all)`: `is_all=True` means skip
        department filtering entirely (caller may see everything);
        `department_id=None` with `is_all=False` means the caller has no
        department at all and must see nothing, not everything."""
        return rbac.resolve_selected_department(self.request, param="department")

    def _department_scoped_queryset(self):
        """Department scope only, with none of `_filtered_queryset`'s other
        query-param filters (?critical=, ?category= etc.) — used by the Add Spare
        duplicate checks and by `increase_holding`, neither of which should be
        perturbed by whatever query string happens to be on the request."""
        queryset = self.get_queryset()
        department_id, is_all = self._scoped_department_id()
        if is_all:
            return queryset
        if department_id is None:
            return queryset.none()
        return queryset.filter(
            equipment_class__spare_class__department_id=department_id
        )

    def _filtered_queryset(self, include_query=True):
        queryset = self.get_queryset()
        department_id, is_all = self._scoped_department_id()
        if not is_all and department_id is None:
            return queryset.none()
        # Developed by Unknown: The sub-department dimension, applied through the shared rbac
        # helper rather than added to the `filters` dictionary below.
        #
        # It has to be here at all because this method does NOT go through `filter_backends` - it
        # re-derives the department scope itself for the `search_result/` endpoint the Ship
        # Inventory listing screen actually calls. Leaving it out would have meant a confined Dy
        # HOD seeing every Executive sub-department's spares on the one screen the requirement is
        # about, while being correctly confined everywhere else - which is worse than not scoping
        # at all, because it looks scoped.
        #
        # It cannot join the `filters` dictionary because that dictionary maps a field to a value
        # and skips blanks, and "Unassigned" is a request for `sub_department IS NULL` - a filter
        # whose value is the absence of one. The helper carries that distinction and the
        # entitlement refusal with it.
        queryset = _scope_queryset_to_sub_department(
            queryset,
            self.request,
            field=self.sub_department_scope_field,
            param=self.sub_department_scope_param,
        )
        filters = {
            "equipment_class__spare_class__department_id": (
                None if is_all else department_id
            ),
            "equipment_class__spare_class_id": (
                self.request.query_params.get("spare_class")
            ),
            "equipment_class_id": self.request.query_params.get("equipment_class"),
            "category": self.request.query_params.get("category"),
            "authority_id": self.request.query_params.get("authority"),
        }
        for field_name, value in filters.items():
            if value not in (None, ""):
                queryset = queryset.filter(**{field_name: value})

        text_filters = {
            "pattern_number__icontains": self.request.query_params.get(
                "pattern_number"
            ),
            "description__icontains": self.request.query_params.get("description"),
            "equipment_class__name__icontains": (
                self.request.query_params.get("equipment")
            ),
            "remarks__icontains": self.request.query_params.get("remarks"),
        }
        for field_name, value in text_filters.items():
            if value:
                queryset = queryset.filter(**{field_name: value})

        query = self.request.query_params.get("q")
        if include_query and query:
            queryset = queryset.filter(
                Q(pattern_number__icontains=query)
                | Q(description__icontains=query)
                | Q(equipment_class__name__icontains=query)
            )

        critical = self.request.query_params.get("critical")
        if critical is not None:
            queryset = queryset.filter(
                critical=critical.lower() in {"1", "true", "yes"}
            )
        return queryset.distinct()

    def _spare_in_caller_department(self, spare):
        """Guards multi-issue write paths, which resolve spares by pk/pattern
        number directly rather than through `get_object()` — so
        `DepartmentScopedObjectPermission` never fires for them. Without this,
        a non-privileged user could issue (mutate stock on) another
        department's spare just by referencing its id/pattern number."""
        if rbac.can_see_all_departments(self.request.user):
            return True
        own_department = rbac.department_of(self.request.user)
        if own_department is None:
            return False
        return (
            spare.equipment_class.spare_class.department_id == own_department.pk
        )

    def _reject_cross_department_spares(self, spare_ids):
        if rbac.can_see_all_departments(self.request.user):
            return
        own_department = rbac.department_of(self.request.user)
        if own_department is None or Spares.objects.filter(
            pk__in=spare_ids
        ).exclude(
            equipment_class__spare_class__department_id=own_department.pk
        ).exists():
            raise DRFValidationError(
                {"detail": "You may not issue spares from another department."}
            )

    @action(detail=False, methods=["get"])
    def search(self, request):
        queryset = self._filtered_queryset()
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=["get"], url_path="low-stock")
    def low_stock(self, request):
        queryset = self._filtered_queryset().filter(
            quantity_authorised__gt=0,
            quantity_available__lte=F("quantity_authorised") / 2,
        )
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=["get"])
    def critical(self, request):
        queryset = self._filtered_queryset().filter(critical=True)
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=["get"], url_path="d787j-deficiency")
    def d787j_deficiency(self, request):
        # Developed by Unknown: This filtered on the authority alone and never compared
        # the quantities, so it returned the ship's whole D787J holding and reported it
        # as deficiency - a spare with 3 authorised and 3 held came back as short. The
        # rule now lives in `SparesQuerySet.d787j_deficiencies()`, which is also what the
        # homepage tile's count resolves through (the tile is the length of THIS
        # response), so the tile can never disagree with the rows on the screen.
        queryset = self._filtered_queryset().d787j_deficiencies()
        serializer = SparesDeficiencySerializer(
            queryset, many=True, context=self.get_serializer_context()
        )
        return Response(serializer.data)

    # Developed by Unknown: The lookup body moved out to
    # `services.resolve_pattern_source`, and this action now calls it. Nothing about the
    # RESPONSE changes - the same eleven keys, the same values, the same status code - so
    # the Add Spare form's async validator and the IIF cart's correction modal are
    # unaffected and are not edited by this change set.
    #
    # Two things about the ANSWER do change, and both are deliberate:
    #   - two further tables are consulted, `ILMS_mo_item_sot` and `WLMS_wed_item_sot`, so
    #     a code seeded into either is now found where it previously was not. Both ship
    #     empty, so until they are seeded the answer is identical to today's.
    #   - a WED category of `QP` now maps to `QUASI_PERMANENT` instead of passing through
    #     as the raw string `QP`. `Spares.QUASI_PERMANENT` explains why.
    #
    # The lookup was extracted rather than duplicated because the import needs the same
    # four tables in the same order, and two copies of a precedence rule is exactly how the
    # two screens end up disagreeing about whether a pattern number is valid.
    @action(detail=False, methods=["post"], url_path="verify-pattern")
    def verify_pattern(self, request):
        serializer = VerifyPatternSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        pattern_number = serializer.validated_data["pattern_number"].strip().upper()
        expected_category = (
            serializer.validated_data.get("category", "").strip().upper()
        )
        expected_category = (
            services.source_category(expected_category) or expected_category
        )

        try:
            source = services.resolve_pattern_source(pattern_number)
        except services.PatternSourceUnavailable as error:
            # Developed by Unknown: This endpoint stays FAIL-OPEN in the sense that it
            # reports the failure honestly rather than silently claiming a miss - a 503
            # tells the Add Spare form's `catchError` to let the save through, which is the
            # behaviour `spare-form.ts` line 88 deliberately relies on. The IMPORT does not
            # call this endpoint and fails closed on its own path instead.
            return Response(
                {"status": "error", "message": str(error)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if source is None:
            return Response(
                {
                    "valid": False,
                    "pattern_number": pattern_number,
                    "error": "Pattern number not found",
                }
            )

        # The raw source value is kept as the fallback so the response is byte-for-byte
        # what it was for every category this application does not name.
        mapped_category = source.category or (
            (source.raw_category or Spares.PERMANENT).strip().upper()
        )
        is_match = not expected_category or mapped_category == expected_category
        # Developed by Unknown: coerced to "" rather than passed through as `None`. The two
        # source-of-truth tables no longer carry `item_desc`, so a SOT hit now has no
        # description at all - and the seeded rows this replaced held an empty string, so ""
        # keeps the response byte-for-byte what the Add Spare form and the IIF cart already
        # received. A `null` here would have reached the form as the literal text "null".
        description = source.description or ""
        return Response(
            {
                "valid": is_match,
                "source": source.source,
                "pattern_number": source.item_code,
                "item_code": source.item_code,
                "description": description,
                "item_desc": description,
                "category": mapped_category,
                "crp_category": mapped_category,
                "expected_category": expected_category,
                "category_mismatch": not is_match,
                "denomination": source.denomination,
            }
        )

    @action(detail=False, methods=["post"], url_path="update-pattern")
    def update_pattern(self, request):
        serializer = UpdateSparePatternSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        spare = serializer.validated_data["spare_pk"]
        category = serializer.validated_data.get("category", spare.category)
        # Developed by Unknown: The inline three-entry map is replaced by
        # `services.source_category`, the single map this application now uses to turn a
        # category letter into a stored category. It knows the same three letters and also
        # `QP`. A value it does not know is passed through unchanged, exactly as the
        # `category_map.get(category, category)` it replaces did.
        category = services.source_category(category) or category
        # Developed by Unknown: these two writes now commit together or not at all. They always
        # belonged together, but it became a correctness requirement rather than a tidiness one
        # the moment the IIF gate started reading the open `NotInCattedItem` record: correcting
        # the pattern number IS the release, so a failure between the two statements would leave
        # a corrected spare permanently gated on Due for Survey and Due for Demand with no
        # screen able to free it - the Due for IIF row would already be gone from the operator's
        # only release control. Nothing else in this action changes.
        with transaction.atomic():
            spare.pattern_number = (
                serializer.validated_data["pattern_number"].strip().upper()
            )
            spare.save(update_fields=["pattern_number"])
            NotInCattedItem.objects.filter(
                spare_id=spare,
                is_deleted=False,
            ).update(incatted_status=True, is_deleted=True)
        # Developed by Unknown: This is the ONE place in the application where a PERMANENT
        # spare is branched on by name, so it is the one place a quasi-permanent spare had
        # to be named too. Without this entry a QP spare would fall to the map's
        # `/obs/iif_list/` default, which is the RETURNABLE destination - the opposite of
        # "treated as permanent". Everywhere else the code tests for CONSUMABLE or
        # RETURNABLE and lets everything else fall through to the permanent side, which
        # already handles QP correctly and needed no change.
        redirect_map = {
            Spares.PERMANENT: "/obs/survey_list/",
            Spares.QUASI_PERMANENT: "/obs/survey_list/",
            Spares.RETURNABLE: "/obs/iif_list/",
            Spares.CONSUMABLE: "/obs/demand_list/",
        }
        return Response(
            {
                "success": True,
                "spare": spare.pk,
                "pattern_number": spare.pattern_number,
                "redirect_url": redirect_map.get(category, "/obs/iif_list/"),
            }
        )

    @action(detail=False, methods=["get"], url_path="defect-requisition")
    def defect_requisition(self, request):
        dart_id = request.query_params.get("dart")
        # Developed by Unknown: the maintainer's request list stops showing spares that the ship
        # already issued and already consumed. A DART raised from Due for Survey or Due for
        # Demand marks its `DartSpare` rows with the `OBS_INTERNAL` origin sentinel, and this is
        # the ONE reader of eight that must stop seeing them - the two cart annotations, the
        # DART-number resolver behind the queue grid's DART No column, the multi-issue
        # reconciliation, the DART detail popup and the header lookup all still see them, and
        # each of those exists precisely to find them.
        #
        # An `.exclude()` rather than an `.filter(inventory_type__in=[...])`, so a row written
        # by any other path, with any other value, or with the column left NULL - which is what
        # `obs/tests.py` writes - keeps appearing exactly as it does today.
        dart_spares = (
            DartSpare.objects.filter(is_delete=False)
            .exclude(inventory_type=services.OBS_INTERNAL_INVENTORY_TYPE)
            .select_related(
                "dart",
                "equipment_id",
            )
        )
        if dart_id:
            dart_spares = dart_spares.filter(dart_id=dart_id)
        patterns = [entry.pattern.upper() for entry in dart_spares]
        onboard_by_pattern = {
            spare.pattern_number.upper(): spare
            for spare in self._filtered_queryset().filter(pattern_number__in=patterns)
        }
        # Same field name/semantics as `PlannedRoutineSpareListViewSet.requisition()` above.
        wed_by_pattern = {
            spare.item_code.upper(): spare
            for spare in WLMSSpare.objects.filter(item_code__in=patterns)
            if spare.item_code
        }
        data = []
        for entry in dart_spares:
            onboard_spare = onboard_by_pattern.get(entry.pattern.upper())
            wed_spare = wed_by_pattern.get(entry.pattern.upper())
            data.append(
                {
                    "dart_spare_id": entry.pk,
                    "dart": entry.dart_id,
                    "dart_number": entry.dart.dart_number,
                    "pattern_number": entry.pattern,
                    "description": entry.description,
                    "quantity_required": entry.quantity,
                    "onboard_spare": (onboard_spare.pk if onboard_spare else None),
                    "quantity_available": (
                        onboard_spare.quantity_available if onboard_spare else 0
                    ),
                    "available_onboard": bool(
                        onboard_spare
                        and onboard_spare.quantity_available >= entry.quantity
                    ),
                    "wed_inventory_type": (
                        wed_spare.wlms_inventory if wed_spare else ""
                    ),
                }
            )
        return Response(data)

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        queryset = self._filtered_queryset()
        totals = queryset.aggregate(
            authorised_quantity=Sum("quantity_authorised"),
            available_quantity=Sum("quantity_available"),
        )
        spare_ids = queryset.values_list("pk", flat=True)
        issued_quantity = (
            Issue.objects.filter(spare_id__in=spare_ids).aggregate(
                total=Sum("quantity_issued")
            )["total"]
            or 0
        )
        return Response(
            {
                "total_spares": queryset.count(),
                "critical_spares": queryset.filter(critical=True).count(),
                "stock_out_spares": queryset.filter(quantity_available=0).count(),
                "low_stock_spares": queryset.filter(
                    quantity_authorised__gt=0,
                    quantity_available__lte=F("quantity_authorised") / 2,
                ).count(),
                "authorised_quantity": totals["authorised_quantity"] or 0,
                "available_quantity": totals["available_quantity"] or 0,
                "issued_quantity": issued_quantity,
                "pending_surveys": Survey.objects.filter(
                    spare_id__in=spare_ids
                ).count(),
                "pending_demands": Demand.objects.filter(
                    spare_id__in=spare_ids
                ).count(),
                "pending_receipts": Receive.objects.filter(
                    spare_id__in=spare_ids
                ).count(),
                "not_in_catted_items": NotInCattedItem.objects.filter(
                    spare_id__in=spare_ids,
                    incatted_status=False,
                    is_deleted=False,
                ).count(),
            }
        )

    @action(detail=False, methods=["get"], url_path="ship-dashboard")
    def ship_dashboard(self, request):
        queryset = self._filtered_queryset(include_query=False)
        spares = list(queryset)
        spare_ids = [spare.pk for spare in spares]

        def stock_bucket(spare):
            if spare.quantity_available <= 0:
                return "unavailable"
            if (
                spare.quantity_authorised > 0
                and spare.quantity_available * 2 <= spare.quantity_authorised
            ):
                return "at_risk"
            return "available"

        def availability_group(key, label, group_spares):
            buckets = {
                "available": 0,
                "at_risk": 0,
                "unavailable": 0,
            }
            for spare in group_spares:
                buckets[stock_bucket(spare)] += 1

            total = len(group_spares)
            percentage = round((buckets["available"] / total) * 100) if total else 0
            if percentage >= 90:
                availability_status = "EXCELLENT"
            elif percentage >= 75:
                availability_status = "GOOD"
            else:
                availability_status = "AT RISK"

            return {
                "key": key,
                "label": label,
                **buckets,
                "percentage": percentage,
                "status": availability_status,
                "segments": [
                    {
                        "label": "Available",
                        "value": buckets["available"],
                        "color": "#1FD162",
                    },
                    {
                        "label": "At Risk",
                        "value": buckets["at_risk"],
                        "color": "#FF9B35",
                    },
                    {
                        "label": "Unavailable",
                        "value": buckets["unavailable"],
                        "color": "#FF4747",
                    },
                ],
            }

        all_group = availability_group("obs", "OBS", spares)
        availability_groups = [
            all_group,
            availability_group(
                "critical",
                "Critical Spares",
                [spare for spare in spares if spare.critical],
            ),
            availability_group(
                "consumables",
                "Consumables",
                [spare for spare in spares if spare.category == Spares.CONSUMABLE],
            ),
            availability_group(
                "repairables",
                "Repairables",
                [spare for spare in spares if spare.category == Spares.RETURNABLE],
            ),
            availability_group(
                "tools",
                "Tools & Test Equip.",
                [
                    spare
                    for spare in spares
                    if "TOOL" in spare.description.upper()
                    or "TEST" in spare.description.upper()
                ],
            ),
        ]

        critical_shortages = sum(
            1
            for spare in spares
            if spare.critical and stock_bucket(spare) != "available"
        )
        stock_out_items = all_group["unavailable"]
        below_minimum = all_group["at_risk"]
        pending_demands = Demand.objects.filter(spare_id__in=spare_ids).count()
        pending_replenishments = Receive.objects.filter(spare_id__in=spare_ids).count()

        equipment_class_ids = {spare.equipment_class_id for spare in spares}
        mapped_equipment = (
            SparesMapping.objects.filter(equipment_class_id__in=equipment_class_ids)
            .select_related(
                "equipment",
                "equipment__department",
                "equipment__equipment",
                "equipment__equipment_type_f_key",
            )
            .distinct()
        )
        equipment_by_class = {}
        for mapping in mapped_equipment:
            equipment_by_class.setdefault(mapping.equipment_class_id, []).append(
                mapping.equipment
            )

        supportability = {}
        impacted_equipment_ids = set()
        for spare in spares:
            mapped_items = equipment_by_class.get(spare.equipment_class_id, [])
            for equipment in mapped_items:
                if equipment is None:
                    continue
                equipment_name = (
                    getattr(equipment, "nomenclature", None)
                    or getattr(equipment.equipment_type_f_key, "Equipment_Desc", None)
                    or str(equipment.equipment or "Unclassified System")
                )
                system = supportability.setdefault(
                    equipment_name,
                    {"total": 0, "available": 0},
                )
                system["total"] += 1
                if stock_bucket(spare) == "available":
                    system["available"] += 1
                else:
                    impacted_equipment_ids.add(equipment.pk)

        supportability_items = []
        for title, values in supportability.items():
            percentage = round((values["available"] / values["total"]) * 100)
            supportability_items.append(
                {
                    "title": title,
                    "availability": percentage,
                    "status": "Good" if percentage >= 75 else "At Risk",
                }
            )
        supportability_items.sort(key=lambda item: item["availability"])

        low_stock_spares = sorted(
            [spare for spare in spares if stock_bucket(spare) != "available"],
            key=lambda spare: (
                stock_bucket(spare) != "unavailable",
                not spare.critical,
                spare.quantity_available,
            ),
        )
        stock_health = []
        for spare in low_stock_spares[:5]:
            is_stock_out = stock_bucket(spare) == "unavailable"
            stock_health.append(
                {
                    "id": spare.pk,
                    "name": spare.description or spare.pattern_number,
                    "value": (
                        "Stock-Out"
                        if is_stock_out
                        else f"{spare.quantity_available} Available"
                    ),
                    "status": "critical" if is_stock_out else "warning",
                }
            )

        decision_support = []
        for spare in low_stock_spares[:5]:
            decision_support.append(
                {
                    "name": (f"Replenish {spare.description or spare.pattern_number}"),
                    "priority": (
                        "HIGH"
                        if spare.critical or stock_bucket(spare) == "unavailable"
                        else "MEDIUM"
                    ),
                }
            )

        departments = {}
        for spare in spares:
            department = spare.equipment_class.spare_class.department
            department_name = department.name if department else "Unassigned"
            department_values = departments.setdefault(
                department_name,
                {"total": 0, "available": 0},
            )
            department_values["total"] += 1
            if stock_bucket(spare) == "available":
                department_values["available"] += 1

        department_items = []
        for name, values in departments.items():
            percentage = round((values["available"] / values["total"]) * 100)
            department_items.append(
                {
                    "name": name,
                    "percent": percentage,
                    "status": (
                        "Excellent"
                        if percentage >= 95
                        else ("Good" if percentage >= 75 else "At Risk")
                    ),
                }
            )
        department_items.sort(key=lambda item: item["name"])

        issue_totals = {
            Spares.RETURNABLE: 0,
            Spares.CONSUMABLE: 0,
            "critical": 0,
        }
        issues = Issue.objects.filter(spare_id__in=spare_ids).select_related("spare")
        for issue in issues:
            if issue.spare.category in issue_totals:
                issue_totals[issue.spare.category] += issue.quantity_issued
            if issue.spare.critical:
                issue_totals["critical"] += issue.quantity_issued

        trend = [
            {
                "label": "Repairables",
                "value": issue_totals[Spares.RETURNABLE],
                "color": "#22C55E",
            },
            {
                "label": "Critical Spares",
                "value": issue_totals["critical"],
                "color": "#FF5B5B",
            },
            {
                "label": "Consumables",
                "value": issue_totals[Spares.CONSUMABLE],
                "color": "#0A84FF",
            },
        ]

        current_month = timezone.now().date().replace(day=1)
        month_keys = [
            current_month - relativedelta(months=offset) for offset in range(5, 0, -1)
        ]
        monthly_issue_totals = {
            month: {
                "repairables": 0,
                "critical_spares": 0,
                "consumables": 0,
            }
            for month in month_keys
        }
        for issue in issues:
            issue_month = issue.date_of_issue.replace(day=1)
            if issue_month not in monthly_issue_totals:
                continue
            if issue.spare.critical:
                monthly_issue_totals[issue_month]["critical_spares"] += (
                    issue.quantity_issued
                )
            elif issue.spare.category == Spares.RETURNABLE:
                monthly_issue_totals[issue_month]["repairables"] += (
                    issue.quantity_issued
                )
            elif issue.spare.category == Spares.CONSUMABLE:
                monthly_issue_totals[issue_month]["consumables"] += (
                    issue.quantity_issued
                )

        trend_months = [
            {
                "label": month.strftime("%b %Y"),
                "repairables": values["repairables"],
                "critical_spares": values["critical_spares"],
                "consumables": values["consumables"],
            }
            for month, values in monthly_issue_totals.items()
        ]

        search_result = None
        query = request.query_params.get("q", "").strip()
        selected_spare = next(
            (spare for spare in low_stock_spares if spare.critical),
            queryset.first(),
        )
        if query:
            selected_spare = queryset.filter(
                Q(pattern_number__icontains=query)
                | Q(description__icontains=query)
                | Q(equipment_class__name__icontains=query)
            ).first()
        if selected_spare:
            on_order = (
                Receive.objects.filter(spare=selected_spare).aggregate(
                    total=Sum("quantity_toreceive")
                )["total"]
                or 0
            )
            committed = (
                IssueList.objects.filter(issue_entry__spare=selected_spare).aggregate(
                    total=Sum("quantity_toreturn")
                )["total"]
                or 0
            )
            image_url = None
            if selected_spare.image:
                image_name = selected_spare.image.name or ""
                frontend_public_prefixes = (
                    "../frontend/public/",
                    "frontend/public/",
                    "/frontend/public/",
                )
                frontend_path = next(
                    (
                        image_name.removeprefix(prefix).lstrip("/")
                        for prefix in frontend_public_prefixes
                        if image_name.startswith(prefix)
                    ),
                    None,
                )
                if frontend_path:
                    image_url = "/" + frontend_path.replace("assets/", "assests/", 1)
                else:
                    try:
                        image_url = request.build_absolute_uri(selected_spare.image.url)
                    except ValueError:
                        image_url = None
            search_result = {
                "id": selected_spare.pk,
                "pattern_number": selected_spare.pattern_number,
                "description": selected_spare.description,
                "critical": selected_spare.critical,
                "stock_status": stock_bucket(selected_spare).upper(),
                "denomination": (
                    selected_spare.denomination.name
                    if selected_spare.denomination
                    else ""
                ),
                "category": selected_spare.category,
                "image": image_url,
                "on_hand": selected_spare.quantity_available,
                "committed": committed,
                "available": max(
                    selected_spare.quantity_available - committed,
                    0,
                ),
                "on_order": on_order,
                "minimum_stock": selected_spare.quantity_authorised // 2,
                "location": selected_spare.location,
            }

        availability_percentage = all_group["percentage"]
        return Response(
            {
                "kpis": [
                    {
                        "key": "critical_shortages",
                        "title": "Critical Shortages",
                        "count": critical_shortages,
                        "icon_color": "#EF4444",
                    },
                    {
                        "key": "stock_out",
                        "title": "Stock-Out Items",
                        "count": stock_out_items,
                        "icon_color": "#F59E0B",
                    },
                    {
                        "key": "below_minimum",
                        "title": "Below Min Stock",
                        "count": below_minimum,
                        "icon_color": "#EAB308",
                    },
                    {
                        "key": "pending_demands",
                        "title": "Pending Demands",
                        "count": pending_demands,
                        "icon_color": "#3B82F6",
                    },
                    {
                        "key": "pending_replenishment",
                        "title": "Pending Replenishment",
                        "count": pending_replenishments,
                        "icon_color": "#8B5CF6",
                    },
                ],
                "availability": {
                    "total_items": len(spares),
                    "available_items": all_group["available"],
                    "at_risk_items": all_group["at_risk"],
                    "unavailable_items": all_group["unavailable"],
                    "overall_percentage": availability_percentage,
                    "status": all_group["status"],
                    "groups": availability_groups,
                },
                "supportability": supportability_items[:5],
                "maintenance_impact": {
                    "metrics": [
                        {
                            "topValue": len(impacted_equipment_ids),
                            "topLabel": "Equipment Affected",
                        },
                        {
                            "topValue": Issue.objects.filter(
                                spare_id__in=[spare.pk for spare in low_stock_spares]
                            ).count(),
                            "topLabel": "Maintenance",
                        },
                        {
                            "topValue": sum(
                                1
                                for item in supportability_items
                                if "WEAPON" in item["title"].upper()
                                and item["status"] == "At Risk"
                            ),
                            "topLabel": "Weapon System Affected",
                        },
                        {
                            "topValue": sum(
                                1
                                for item in supportability_items
                                if item["status"] == "At Risk"
                            ),
                            "topLabel": "Critical Systems At Risk",
                        },
                    ],
                    "systems": [
                        {
                            "title": item["title"],
                            "status": (
                                "HIGH" if item["availability"] < 50 else "MEDIUM"
                            ),
                        }
                        for item in supportability_items[:3]
                    ],
                },
                "stock_health": stock_health,
                "decision_support": decision_support,
                "logistics": {
                    "demand_queued": pending_demands,
                    "under_procurement": PostDemand.objects.filter(
                        spare_id__in=spare_ids
                    ).count(),
                    "under_repair": PostSurvey.objects.filter(
                        spare_id__in=spare_ids,
                        spare__category=Spares.RETURNABLE,
                    ).count(),
                    "expected_to_arrive": pending_replenishments,
                    "delayed_overdue": 0,
                    "available_onboard": all_group["available"],
                    "expected_availability": [
                        {
                            "label": "Demand",
                            "value": pending_demands,
                            "color": "#2ECC71",
                        },
                        {
                            "label": "Procurement",
                            "value": PostDemand.objects.filter(
                                spare_id__in=spare_ids
                            ).count(),
                            "color": "#F5A623",
                        },
                        {
                            "label": "Expected",
                            "value": pending_replenishments,
                            "color": "#0A84FF",
                        },
                        {
                            "label": "Overdue",
                            "value": 0,
                            "color": "#FF5B5B",
                        },
                    ],
                },
                "trend": trend,
                "trend_months": trend_months,
                "departments": department_items,
                "search_result": search_result,
            }
        )

    @action(detail=True, methods=["get"], url_path="detail-summary")
    def detail_summary(self, request, pk=None):
        spare = self.get_object()
        image_url = None
        if (
            spare.image
            and spare.image.name
            and not spare.image.name.endswith("default.png")
        ):
            image_url = request.build_absolute_uri(spare.image.url)
        # Developed by Unknown: the placeholder, ABSOLUTE and pointing at the file that actually
        # exists. This used to be the literal `"/media/default.png"`, which was wrong twice over:
        # the file lives at `obs/default.png`, and a RELATIVE url is resolved by the browser
        # against the SPA's own origin - `localhost:4200` in development, where there is no media
        # folder at all - so the detail page rendered a broken image frame for every spare
        # without a photograph. `obs.utils.default_spare_image_url` builds it from MEDIA_URL and
        # the request, and `ensure_default_spare_image` is what puts the file on disk.
        default_image_url = default_spare_image_url(request)
        return Response(
            {
                "success": True,
                "data": {
                    "id": spare.pk,
                    "pattern_number": spare.pattern_number or "-",
                    "description": spare.description or "-",
                    "category": spare.category or "-",
                    "equipment_class": (
                        spare.equipment_class.name if spare.equipment_class else "-"
                    ),
                    "spare_class": (
                        spare.equipment_class.spare_class.name
                        if spare.equipment_class and spare.equipment_class.spare_class
                        else "-"
                    ),
                    "department": (
                        spare.equipment_class.spare_class.department.name
                        if (
                            spare.equipment_class
                            and spare.equipment_class.spare_class
                            and spare.equipment_class.spare_class.department
                        )
                        else "-"
                    ),
                    "authority": spare.authority.name if spare.authority else "-",
                    "compartment": spare.compartment or "-",
                    "location": spare.location or "-",
                    "rack_position": spare.rack_position or "-",
                    "rack_number": spare.rack_number or "-",
                    "denomination": (
                        spare.denomination.name if spare.denomination else "-"
                    ),
                    "quantity_authorised": spare.quantity_authorised or 0,
                    "quantity_available": spare.quantity_available or 0,
                    "images": [image_url or default_image_url],
                    "is_critical": spare.critical,
                },
            }
        )

    @action(detail=False, methods=["post"], url_path="check-wed-mapping")
    def check_wed_mapping(self, request):
        raw_pks = request.data.get("pks", [])
        if isinstance(raw_pks, str):
            raw_pks = [pk.strip() for pk in raw_pks.split(",") if pk.strip()]
        if not raw_pks:
            raise DRFValidationError({"pks": "At least one WED spare id is required."})

        unmapped_items = []
        planned_wed_spares = PlannedWEDSpareList.objects.select_related(
            "planned_spares_description__wlms_spare_id__eqpt",
        ).filter(pk__in=raw_pks)
        for wed_spare_entry in planned_wed_spares:
            plan_desc = wed_spare_entry.planned_spares_description
            wlms_spare = plan_desc.wlms_spare_id if plan_desc else None
            if not wlms_spare or not wlms_spare.eqpt:
                unmapped_items.append(
                    {
                        "pattern_number": (
                            wlms_spare.item_code if wlms_spare else wed_spare_entry.pk
                        ),
                        "description": wlms_spare.item_desc if wlms_spare else "",
                    }
                )
                continue
            if not SpareDataMap.objects.filter(wed_equipment=wlms_spare.eqpt).exists():
                unmapped_items.append(
                    {
                        "pattern_number": wlms_spare.item_code,
                        "description": wlms_spare.item_desc,
                        "eqpt_name": wlms_spare.eqpt.eqpt_name,
                    }
                )

        seen = set()
        unique_unmapped = []
        for item in unmapped_items:
            key = item["pattern_number"]
            if key not in seen:
                seen.add(key)
                unique_unmapped.append(item)
        return Response(
            {
                "all_mapped": len(unique_unmapped) == 0,
                "unmapped": unique_unmapped,
            }
        )

    def _normalize_pattern_issue_payload(self, request):
        data = request.data.copy()
        raw_items = data.get("items", data.get("table_data", []))
        if isinstance(raw_items, str):
            try:
                raw_items = json.loads(raw_items)
            except json.JSONDecodeError as error:
                raise DRFValidationError(
                    {"items": "Invalid table data format."}
                ) from error
        items = []
        for item in raw_items:
            pattern_number = item.get("pattern_number") or item.get("pattern")
            quantity = (
                item.get("quantity_issued")
                or item.get("quantity")
                or item.get("qty")
                or 0
            )
            items.append(
                {
                    "pattern_number": pattern_number,
                    "quantity_issued": quantity,
                }
            )
        data["items"] = items
        if "equipment" not in data and data.get("equipment_name"):
            data["equipment"] = data["equipment_name"]
        return data

    def _create_pattern_issues(self, request, update_dart_spares=False):
        serializer = PatternMultiIssueSerializer(
            data=self._normalize_pattern_issue_payload(request)
        )
        serializer.is_valid(raise_exception=True)
        remarks = serializer.validated_data["remarks"].upper().strip()
        dart_number = serializer.validated_data.get("dart_number", "").upper()
        equipment = serializer.validated_data.get("equipment")
        issued_to = (
            serializer.validated_data.get("username") or request.user.user_profile
        )
        items = serializer.validated_data["items"]
        success_spares = []
        error_spares = []
        issues = []

        with transaction.atomic():
            for item in items:
                pattern_number = item["pattern_number"].strip().upper()
                quantity_issued = item["quantity_issued"]
                spare = (
                    Spares.objects.select_for_update()
                    .filter(pattern_number__iexact=pattern_number)
                    .first()
                )
                if spare is None:
                    error_spares.append(
                        {
                            "pattern_number": pattern_number,
                            "error": "Spare not found",
                        }
                    )
                    continue
                if not self._spare_in_caller_department(spare):
                    error_spares.append(
                        {
                            "pattern_number": pattern_number,
                            "error": "Spare belongs to another department",
                        }
                    )
                    continue
                if quantity_issued > spare.quantity_available:
                    error_spares.append(
                        {
                            "pattern_number": pattern_number,
                            "error": "Issued quantity exceeds available",
                        }
                    )
                    continue

                # Developed by Unknown: Call site 1 of 5 of the lifted cascade. The Issue,
                # the IssueList and the Demand-or-Survey row were written out inline here
                # and are now `services.create_issue_with_cart_entry`. The behaviour is
                # unchanged, including the TY LOAN / OTHER guard, which now lives in the
                # helper and is applied identically by every caller.
                try:
                    issue, _cart_row = services.create_issue_with_cart_entry(
                        spare=spare,
                        equipment=equipment,
                        username=issued_to,
                        quantity=quantity_issued,
                        remarks=remarks,
                        dart_number=dart_number,
                    )
                except DjangoValidationError as error:
                    error_spares.append(
                        {
                            "pattern_number": pattern_number,
                            "error": django_validation_error_detail(error),
                        }
                    )
                    continue

                if update_dart_spares and dart_number:
                    dart_spare = (
                        DartSpare.objects.select_for_update()
                        .filter(
                            dart__dart_number__iexact=dart_number,
                            pattern__iexact=pattern_number,
                            is_delete=False,
                        )
                        .first()
                    )
                    if dart_spare:
                        if quantity_issued >= dart_spare.quantity:
                            dart_spare.delete()
                        else:
                            dart_spare.quantity -= quantity_issued
                            dart_spare.save(update_fields=["quantity"])

                success_spares.append(pattern_number)
                issues.append(issue)

        return Response(
            {
                "status": "success",
                "issued": success_spares,
                "errors": error_spares,
                "dart_number": dart_number,
                "issues": IssueSerializer(issues, many=True).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="routine-multi-issue")
    def routine_multi_issue(self, request):
        return self._create_pattern_issues(request)

    @action(detail=False, methods=["post"], url_path="defect-multi-issue")
    def defect_multi_issue(self, request):
        return self._create_pattern_issues(request, update_dart_spares=True)

    @extend_schema(
        request=MultiIssueSerializer,
        responses={201: IssueSerializer(many=True)},
        tags=["OBS"],
    )
    @action(detail=False, methods=["post"], url_path="multi-issue")
    def multi_issue(self, request):
        serializer = MultiIssueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        items = serializer.validated_data["items"]
        spare_ids = [item["spare"].pk for item in items]
        self._reject_cross_department_spares(spare_ids)

        with transaction.atomic():
            locked_spares = {
                spare.pk: spare
                for spare in Spares.objects.select_for_update().filter(pk__in=spare_ids)
            }
            errors = []
            for item in items:
                spare = locked_spares[item["spare"].pk]
                if item["quantity"] > spare.quantity_available:
                    errors.append(
                        {
                            "spare": spare.pk,
                            "pattern_number": spare.pattern_number,
                            "error": (
                                "Issue quantity cannot exceed available quantity."
                            ),
                        }
                    )
                elif (
                    item["quantity"] > HIGH_ISSUE_QUANTITY_THRESHOLD
                    and not item.get("high_quantity_reason", "").strip()
                ):
                    errors.append(
                        {
                            "spare": spare.pk,
                            "pattern_number": spare.pattern_number,
                            "error": HIGH_ISSUE_REASON_MESSAGE,
                        }
                    )
            if errors:
                raise DRFValidationError({"items": errors})

            issues = []
            # Developed by Unknown: the grade each spare carried BEFORE this request, read off
            # the rows already locked above so it costs no extra query.
            #
            # `Issue.save()` re-reads the spare under its own lock, escalates on THAT instance
            # and then assigns it back to `issue.spare`, so the grade after the write is on
            # `issue.spare` and the grade before it is here. Comparing the two is the only way
            # to know a tier actually moved - `apply_criticality_from_issue_history` returns the
            # new strength but its caller discards it, so nothing downstream is told.
            criticality_before = {
                pk: (spare.criticality_strength or Spares.NOT_CRITICAL)
                for pk, spare in locked_spares.items()
            }
            # Developed by Unknown: keyed by spare, so a spare issued twice in one request is
            # announced once, at the grade it finished on.
            escalations = {}
            remarks = serializer.validated_data["remarks"].upper()
            dart_number = serializer.validated_data.get(
                "dart_number",
                "",
            ).upper()
            equipment = serializer.validated_data.get("equipment")
            issued_to = (
                serializer.validated_data.get("username")
                or request.user.user_profile
            )
            issued_to_unit = serializer.validated_data.get("issued_to_unit", "")
            # Developed with Understanding: a TY LOAN names its other-unit recipient (D6).
            # The serializer has already refused a posted username on that path, so
            # `issued_to` above is the caller's profile (Q1). The unit is the person's own
            # section and overrides anything posted (D11).
            issued_to_other_profile = serializer.validated_data.get(
                "issued_to_other_profile"
            )
            if issued_to_other_profile is not None:
                issued_to_unit = issued_to_other_profile.section or ""
            for item in items:
                spare = locked_spares[item["spare"].pk]
                # Developed by Unknown: Call site 2 of 5. This block was a character-for-
                # character repeat of the one in `_create_pattern_issues` above, differing
                # only in where the quantity came from. Both now call the one helper.
                issue, _cart_row = services.create_issue_with_cart_entry(
                    spare=spare,
                    equipment=equipment,
                    username=issued_to,
                    quantity=item["quantity"],
                    remarks=remarks,
                    dart_number=dart_number,
                    high_quantity_reason=item.get("high_quantity_reason", ""),
                    issued_to_unit=issued_to_unit,
                    issued_to_other_profile=issued_to_other_profile,
                )
                issues.append(issue)
                # Developed by Unknown: `issue.spare` is the instance `Issue.save()` escalated
                # on, so this reads the post-issue grade without another query.
                issued_spare = issue.spare
                grade_now = issued_spare.criticality_strength or Spares.NOT_CRITICAL
                if grade_now != criticality_before[spare.pk]:
                    escalations[spare.pk] = (issued_spare.pattern_number, grade_now)

        # Developed by Unknown: `message` is the key `feedbackInterceptor` reads first, so a tier
        # change reaches the operator on the existing toast surface with no component-side code
        # at all and no second message path. The key is added ONLY when a grade actually rose -
        # with no escalation the body is exactly what it was before this change, so an ordinary
        # issue keeps the feedback it has today.
        response_body = {"issues": IssueSerializer(issues, many=True).data}
        message = criticality_escalation_message(escalations.values())
        if message:
            response_body["message"] = message

        return Response(response_body, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        spare = self.get_object()
        return Response(
            {
                "issues": IssueSerializer(
                    # Developed with Understanding: issued_to_other_profile joined for the label (D6).
                    spare.issues.select_related(
                        "equipment", "username", "issued_to_other_profile"
                    ),
                    many=True,
                ).data,
                "returns": ReturnSerializer(
                    spare.returns.select_related("command_id", "ship"),
                    many=True,
                ).data,
                "surveys": SurveySerializer(
                    spare.surveys.select_related("issue_entry"),
                    many=True,
                ).data,
                "post_surveys": PostSurveySerializer(
                    spare.post_surveys.select_related("issue_entry"),
                    many=True,
                ).data,
                "demands": DemandSerializer(
                    spare.demands.select_related(
                        "issue_entry",
                        "survey_entry",
                    ),
                    many=True,
                ).data,
                "post_demands": PostDemandSerializer(
                    spare.post_demands.select_related("issue_entry"),
                    many=True,
                ).data,
                "receives": ReceiveSerializer(
                    spare.receives.select_related(
                        "issue_entry",
                        "demand_entry",
                    ),
                    many=True,
                ).data,
                "post_receives": PostReceiveSerializer(
                    spare.post_receives.select_related("issue_entry"),
                    many=True,
                ).data,
            }
        )

    @extend_schema(
        request=InitiateStockActionSerializer,
        responses={201: SurveySerializer},
        tags=["OBS"],
    )
    @action(detail=True, methods=["post"], url_path="initiate-survey")
    def initiate_survey(self, request, pk=None):
        spare = self.get_object()
        serializer = InitiateStockActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quantity = serializer.validated_data["quantity"]

        with transaction.atomic():
            # Developed by Unknown: Call site 3 of 5. This one is the `cart="survey"` tail -
            # an Issue and a Survey and no IssueList, exactly as it was written inline here.
            issue, survey = services.create_issue_with_cart_entry(
                spare=spare,
                equipment=serializer.validated_data.get("equipment"),
                username=request.user.user_profile,
                quantity=quantity,
                remarks="INITIATED FROM REQUISITION",
                dart_number=serializer.validated_data.get(
                    "dart_number",
                    "",
                ),
                cart="survey",
            )

        return Response(
            {
                "issue": IssueSerializer(issue).data,
                "survey": SurveySerializer(survey).data,
            },
            status=status.HTTP_201_CREATED,
        )

    def initiate_survey_from_payload(self, request):
        self.kwargs[self.lookup_url_kwarg or self.lookup_field] = payload_pk(
            request,
            "spare_id",
            "spare",
            "pk",
            "id",
        )
        return self.initiate_survey(request, pk=self.kwargs["pk"])

    @extend_schema(
        request=InitiateStockActionSerializer,
        responses={201: DemandSerializer},
        tags=["OBS"],
    )
    @action(detail=True, methods=["post"], url_path="initiate-demand")
    def initiate_demand(self, request, pk=None):
        spare = self.get_object()
        serializer = InitiateStockActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quantity = serializer.validated_data["quantity"]

        with transaction.atomic():
            # Developed by Unknown: Call site 4 of 5, the `cart="demand"` tail. Same shape as
            # `initiate_survey` above and, before this change, the same code twice.
            issue, demand = services.create_issue_with_cart_entry(
                spare=spare,
                equipment=serializer.validated_data.get("equipment"),
                username=request.user.user_profile,
                quantity=quantity,
                remarks="INITIATED FROM REQUISITION",
                dart_number=serializer.validated_data.get(
                    "dart_number",
                    "",
                ),
                cart="demand",
            )

        return Response(
            {
                "issue": IssueSerializer(issue).data,
                "demand": DemandSerializer(demand).data,
            },
            status=status.HTTP_201_CREATED,
        )

    def initiate_demand_from_payload(self, request):
        self.kwargs[self.lookup_url_kwarg or self.lookup_field] = payload_pk(
            request,
            "spare_id",
            "spare",
            "pk",
            "id",
        )
        return self.initiate_demand(request, pk=self.kwargs["pk"])

    # Developed by Unknown: THE SCOPED DEPARTMENT LIST, requirement 3.2 and defect F-07.
    #
    # Separate from `master_dropdown` below, deliberately, and this is the decision the change
    # turns on. `master_dropdown`'s `departments` key is NOT merely a dropdown feed: the front end
    # builds `departmentNameById` out of it (`obs-api.service.ts`'s `masterMaps$`) and uses that
    # map to render a department NAME wherever a spare shows one. Scoping that list would leave a
    # privileged account, who may legitimately read every department's spares, unable to name any
    # department but the one they are posted to - a screen full of blanks. `master_dropdown`'s own
    # comment says the list is unscoped because the Add Spare form needs it that way, and that
    # reasoning is sound for Add Spare and wrong for the import form. So the import form gets its
    # own answer here and the Add Spare form is not broken to fix it.
    #
    # `rbac.visible_departments_for` is the canonical answer to "which departments may this caller
    # see" and is reused verbatim. `rbac.selectable_departments` is what it returns for a
    # privileged caller - active rows minus `HIDDEN_DEPARTMENTS`, which is what keeps HULL and
    # NBCD out of the list: both were retired to EXECUTIVE sub-departments and neither is a
    # department. No filtering is written here.
    #
    # `locked` is the front end's instruction, not its decision. The control renders READONLY when
    # it is true, and the value still submits and is still re-checked server side on every call -
    # `_import_department` refuses a forged department with 403 whatever this flag said.
    @action(detail=False, methods=["get"], url_path="selectable-departments")
    def selectable_departments(self, request):
        """The departments this caller may import on behalf of, and whether the control locks."""
        departments = list(rbac.visible_departments_for(request.user))
        own = rbac.department_of(request.user)
        return Response(
            {
                "departments": [
                    _department_option(department) for department in departments
                ],
                # Locked when the caller has exactly one department to choose from and is not
                # entitled to any other. A privileged caller is never locked, even in the
                # (unlikely) event the list came back with one row.
                "locked": (
                    not rbac.can_see_all_departments(request.user)
                    and len(departments) == 1
                ),
                "selected_department": getattr(own, "id", None),
            }
        )

    # Developed by Unknown: THE DEPENDENT SUB-DEPARTMENT LIST, requirement 3.1.
    #
    # Feeds two controls, which is why it is not named after either of them: the dependent field
    # on the import form, and the filter on the Ship Inventory listing screen. Both ask the same
    # question - which sub-departments may this caller see, under this department - so both get
    # the same answer from the same place.
    #
    # `?department=` is resolved through `_resolve_scope_department`, so asking about a department
    # the caller is not entitled to is refused here exactly as it is on the import itself. A
    # non-Executive department returns an empty list, which is the correct answer and not an
    # error: EXECUTIVE is the only department organised sub-department wise.
    #
    # The `{id, name, department_id}` projection is `rbac.sub_department_summary`, matching the
    # shape `hotwork\serializers.py` line 62 already returns for the same model, so the two halves
    # of the application describe a sub-department identically.
    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="department",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                required=False,
                description=(
                    "The department whose sub-departments are wanted. Defaults to the "
                    "caller's own. A department the caller is not entitled to is refused "
                    "with 403."
                ),
            )
        ]
    )
    @action(detail=False, methods=["get"], url_path="sub-departments")
    def sub_departments(self, request):
        """The Executive sub-departments this caller may see, for one department."""
        # Developed by Unknown: Not `_resolve_scope_department`, and the difference is deliberate.
        # That helper REFUSES a privileged caller who names no department, because a template
        # download and an import must each be tagged to exactly one. This endpoint also feeds the
        # Ship Inventory listing screen, where a privileged caller legitimately has no department
        # chosen and "there are no sub-departments to offer" is the correct answer rather than a
        # 400. A department that IS named is still resolved and refused in exactly the same way.
        selected, is_all = rbac.resolve_selected_department(request, param="department")
        department = (
            None if is_all or selected is None
            else Department.objects.filter(pk=selected).first()
        )
        rows = (
            _visible_sub_departments_for(request.user, department)
            if department is not None
            else []
        )
        return Response(
            {
                "department": getattr(department, "id", None),
                "is_executive": _is_executive_department(department),
                "sub_departments": [_sub_department_summary(row) for row in rows],
                # True for a Dy HOD of one sub-department, who gets exactly their own and may
                # neither choose nor filter to another. False for the Executive Head of
                # Department, who sees all eight and narrows with the filter.
                "locked": _is_sub_department_confined(request.user),
            }
        )

    @action(detail=False, methods=["get"], url_path="master-dropdown")
    def master_dropdown(self, request):
        # Developed by Unknown: DELIBERATELY UNCHANGED by the department-scoping change. See
        # `selectable_departments` above for why this list stays unscoped and where the import
        # form's scoped list comes from instead. Do not scope this one - `departmentNameById` on
        # the front end is built from it.
        #
        # `departments` is not department-scoped by nature — it's the very list a user without a
        # department yet needs in order to pick one (e.g. the Add Spare form's Department dropdown).
        # Only `equipment_classes`/`sections` actually depend on the caller's own department, so those
        # alone degrade to empty (not a hard 400) when it's unset, instead of blocking the whole response.
        profile = getattr(request.user, "user_profile", None)
        department_id = getattr(profile, "department_id", None) or getattr(
            request.user, "department_id", None
        )
        equipment_classes = (
            EquipmentClass.objects.filter(spare_class__department_id=department_id)
            .order_by("name")
            .distinct("name")
            if department_id
            else EquipmentClass.objects.none()
        )
        departments = Department.objects.exclude(name__in=["ADMIN"]).order_by("name")
        sections = (
            SectionName.objects.filter(department_id=department_id).order_by("name")
            if department_id
            else SectionName.objects.none()
        )
        equipment_list = EquipmentName.objects.all().order_by("name")

        return Response(
            {
                "equipment_classes": EquipmentClassSerializer(
                    equipment_classes, many=True
                ).data,
                # `name` is unchanged and is still what `masterMaps$` builds
                # `departmentNameById` from; the added `label` is only what a dropdown shows.
                "departments": [
                    _department_option(department) for department in departments
                ],
                "sections": [
                    {"id": section.id, "name": section.name} for section in sections
                ],
                "equipment_list": [
                    {"id": equipment.id, "name": equipment.name}
                    for equipment in equipment_list
                ],
            }
        )

    @action(detail=False, methods=["get"], url_path="defect-spares-for-dart")
    def defect_spares_for_dart(self, request, pk=None):
        dart_id = pk or request.query_params.get("dart")
        if not dart_id:
            raise DRFValidationError({"dart": "DART id is required."})

        ids_param = request.query_params.get("ids", "")
        ids = [value for value in ids_param.split(",") if value]
        queryset = (
            self.get_queryset().filter(pk__in=ids)
            if ids
            else self.get_queryset().none()
        )

        dart_spare = (
            DartSpare.objects.filter(dart_id=dart_id).select_related("dart").first()
        )

        return Response(
            {
                "dart": dart_id,
                "dart_number": dart_spare.dart.dart_number if dart_spare else None,
                "spares": self.get_serializer(queryset, many=True).data,
            }
        )

    @staticmethod
    def _survey_history_row(entry):
        return {
            "pattern_number": entry.spare.pattern_number,
            "equipment_class": entry.spare.equipment_class.name,
            "description": entry.spare.description,
            "quantity": entry.quantity_surveyed,
            "survey_number": entry.survey_number,
            "date": (
                timezone.localtime(entry.survey_report_date).strftime("%Y-%m-%dT%H:%M")
                if entry.survey_report_date
                else None
            ),
            "remarks": entry.remarks,
            "created_by": entry.created_by,
        }

    def _spare_history(self, spare_ids, department_id):
        history_issue = [
            {
                "pattern_number": entry.spare.pattern_number,
                "equipment_class": entry.spare.equipment_class.name,
                "description": entry.spare.description,
                "username": user_display_name(entry.username),
                "quantity": str(entry.quantity_issued),
                "date": (
                    timezone.localtime(entry.issue_time).strftime("%Y-%m-%dT%H:%M")
                    if entry.issue_time
                    else None
                ),
                "remarks": entry.remarks,
                "nomenclature": entry.equipment.nomenclature if entry.equipment else "",
                "authority": entry.spare.authority.name,
            }
            for entry in Issue.objects.select_related(
                "spare",
                "spare__equipment_class",
                "spare__authority",
                "equipment",
                "username",
                "username__user_profile",
            ).filter(
                spare_id__in=spare_ids,
                spare__equipment_class__spare_class__department_id=department_id,
            )
        ]

        history_return = [
            {
                "pattern_number": entry.spare_id.pattern_number,
                "equipment_class": entry.spare_id.equipment_class.name,
                "description": entry.spare_id.description,
                "username": entry.username,
                "remarks": entry.remarks,
            }
            for entry in Return.objects.filter(
                spare_id__in=spare_ids,
                spare_id__equipment_class__spare_class__department_id=department_id,
            ).select_related("spare_id", "spare_id__equipment_class")
        ]

        history_survey_bypassed = [
            self._survey_history_row(entry)
            for entry in PostSurvey.objects.filter(
                spare_id__in=spare_ids,
                spare__equipment_class__spare_class__department_id=department_id,
                survey_number__iexact="ONE-TIME APPROVAL",
            ).select_related("spare", "spare__equipment_class")
        ]

        history_survey = [
            self._survey_history_row(entry)
            for entry in PostSurvey.objects.filter(
                spare_id__in=spare_ids,
                spare__equipment_class__spare_class__department_id=department_id,
            )
            .exclude(survey_number__iexact="NA")
            .exclude(survey_number__iexact="-NA-")
            .exclude(survey_number__iexact="PTS")
            .select_related("spare", "spare__equipment_class")
        ]

        history_demand = [
            {
                "pattern_number": entry.spare.pattern_number,
                "equipment_class": entry.spare.equipment_class.name,
                "description": entry.spare.description,
                "quantity": entry.quantity_demanded,
                "demand_number": entry.demand_number,
                "date": (
                    timezone.localtime(entry.demand_date).strftime("%Y-%m-%dT%H:%M")
                    if entry.demand_date
                    else None
                ),
                "remarks": entry.remarks,
                "created_by": entry.created_by,
            }
            for entry in PostDemand.objects.filter(
                spare_id__in=spare_ids,
                spare__equipment_class__spare_class__department_id=department_id,
            ).select_related("spare", "spare__equipment_class")
        ]

        history_receive = [
            {
                "pattern_number": entry.spare.pattern_number,
                "equipment_class": entry.spare.equipment_class.name,
                "description": entry.spare.description,
                "quantity": entry.quantity_received,
                "receipt_number": entry.receipt_number,
                "date": (
                    timezone.localtime(entry.receive_date).strftime("%Y-%m-%dT%H:%M")
                    if entry.receive_date
                    else None
                ),
                "nac_status": entry.nac_status,
                "remarks": entry.remarks,
                "created_by": entry.created_by,
            }
            for entry in PostReceive.objects.filter(
                spare_id__in=spare_ids,
                spare__equipment_class__spare_class__department_id=department_id,
            ).select_related("spare", "spare__equipment_class")
        ]

        return {
            "history_issue": history_issue,
            "history_return": history_return,
            "history_survey_bypassed": history_survey_bypassed,
            "history_survey": history_survey,
            "history_demand": history_demand,
            "history_receive": history_receive,
        }

    @action(detail=False, methods=["get"], url_path="search-history")
    def search_history(self, request):
        department_id = request_user_department_id(request)
        ids_param = request.query_params.get("spare_ids", "")
        spare_ids = [value for value in ids_param.split(",") if value]

        if not spare_ids:
            spare_ids = list(
                self.get_queryset()
                .filter(equipment_class__spare_class__department_id=department_id)
                .values_list("id", flat=True)
            )

        return Response(self._spare_history(spare_ids, department_id))

    @action(detail=False, methods=["post"], url_path="add-from-ilms")
    def add_from_ilms(self, request):
        pattern_number = (request.data.get("pattern_number") or "").strip().upper()
        if not pattern_number:
            raise DRFValidationError({"pattern_number": "This field is required."})

        try:
            quantity_required = int(request.data.get("quantity_required") or 0)
        except (TypeError, ValueError):
            raise DRFValidationError(
                {"quantity_required": "A valid quantity is required."}
            )
        if quantity_required <= 0:
            raise DRFValidationError(
                {"quantity_required": "Quantity must be greater than zero."}
            )

        spare = Spares.objects.filter(pattern_number=pattern_number).first()
        if not spare:
            raise DRFValidationError({"pattern_number": "Spare not found."})

        equipment = None
        equipment_id = request.data.get("equipment_name")
        if equipment_id:
            equipment = EquipmentName.objects.filter(pk=equipment_id).first()

        remarks = request.data.get("remarks", "")

        with transaction.atomic():
            issue = Issue.objects.create(
                spare=spare,
                username=request.user.user_profile,
                equipment=equipment,
                remarks=remarks,
                quantity_issued=quantity_required,
                dart_number="",
            )

            spare.quantity_authorised = quantity_required
            spare.quantity_available = 0
            spare.save(update_fields=["quantity_available", "quantity_authorised"])

            issue_list, created = IssueList.objects.get_or_create(
                issue_entry=issue,
                defaults={"quantity_toreturn": quantity_required},
            )
            if not created:
                issue_list.quantity_toreturn = (
                    F("quantity_toreturn") + quantity_required
                )
                issue_list.save(update_fields=["quantity_toreturn"])
                issue_list.refresh_from_db()

        return Response(
            {
                "issue": IssueSerializer(issue).data,
                "issue_list_id": issue_list.pk,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="submit-validated-inventory-data",
    )
    def submit_validated_inventory_data(self, request):
        """Legacy JSON save path — kept for compatibility, now behind the same gates.

        Developed by Unknown: This is the fourth import path and nothing in the Angular
        front end calls it. It read only `rows` and the caller's own department, so any
        authenticated account of any role could post rows carrying `authority: "D787J"` and
        have them saved. It now takes the same route, authority and password the two real
        import endpoints take, refuses the D787J route for an unentitled role, and refuses
        the whole payload when a row's authority disagrees with the selected one.
        """
        _route, authority = self._resolve_import_selection(request)

        department_id = request_user_department_id(request)
        rows = request.data.get("rows")
        if rows is None:
            rows = request.data.get("ShipInventory", {}).get("data", [])
        if not isinstance(rows, list):
            raise DRFValidationError({"rows": "A list of rows is required."})

        # Developed by Unknown: The same file-level authority gate the workbook paths apply,
        # over this action's own row shape. Row numbers are 1-based positions in the posted
        # list, because there is no workbook and therefore no Excel row number.
        posted_rows = [
            (
                index,
                {
                    "authority_name": (
                        row.get("data", row) if isinstance(row, dict) else {}
                    ).get("authority")
                },
            )
            for index, row in enumerate(rows, start=1)
        ]
        self._enforce_sheet_authority(posted_rows, authority, field="rows")

        saved = 0
        skipped_duplicates = 0
        failed = 0
        errors = []

        with transaction.atomic():
            for index, row in enumerate(rows):
                row_data = row.get("data", row) if isinstance(row, dict) else {}
                pattern_number = (row_data.get("pattern_number") or "").strip().upper()
                if not pattern_number:
                    failed += 1
                    errors.append(
                        {"row_index": index, "error": "pattern_number is required."}
                    )
                    continue

                if Spares.objects.filter(pattern_number=pattern_number).exists():
                    skipped_duplicates += 1
                    continue

                try:
                    spare_class, _ = SpareClass.objects.get_or_create(
                        name=(row_data.get("spare_class") or "UNCATEGORISED")
                        .strip()
                        .upper(),
                        department_id=department_id,
                    )
                    equipment_class, _ = EquipmentClass.objects.get_or_create(
                        name=(row_data.get("equipment_class") or "UNCATEGORISED")
                        .strip()
                        .upper(),
                        spare_class=spare_class,
                    )
                    # Developed by Unknown: Was `Authority.objects.get_or_create(...)` with
                    # a default of `UNKNOWN`, so this action minted a permanent Authority
                    # master row for whatever string a caller posted - the same defect
                    # `_get_or_create_authority` carried on the workbook path. No import
                    # creates an Authority row, on any path. A name that is not already on
                    # the ship's master list fails its row and the batch continues.
                    authority_name = (row_data.get("authority") or "").strip().upper()
                    authority = Authority.objects.filter(
                        name__iexact=authority_name
                    ).first()
                    if authority is None:
                        # A plain ValueError, because the enclosing handler below records
                        # `str(error)` into the per-row report and a DRF/Django
                        # ValidationError stringifies as a bracketed list.
                        raise ValueError(services.RULE_MESSAGES["R-039-MASTER"])
                    denomination = None
                    if row_data.get("denomination"):
                        denomination, _ = Denomination.objects.get_or_create(
                            name=row_data["denomination"].strip().upper(),
                            department_id=department_id,
                        )

                    Spares.objects.create(
                        pattern_number=pattern_number,
                        description=row_data.get("description", ""),
                        equipment_class=equipment_class,
                        authority=authority,
                        denomination=denomination,
                        category=row_data.get("category", Spares.PERMANENT),
                        quantity_authorised=row_data.get("quantity_authorised", 0),
                        quantity_available=row_data.get("quantity_available", 0),
                        compartment=row_data.get("compartment", "UNKNOWN"),
                        location=row_data.get("location", "UNKNOWN"),
                        remarks=row_data.get("remarks", ""),
                    )
                    saved += 1
                except Exception as error:
                    # Row-level failures must not abort the rest of the batch.
                    failed += 1
                    errors.append({"row_index": index, "error": str(error)})

        return Response(
            {
                "success": saved > 0,
                "message": f"{saved} rows saved successfully.",
                "details": {
                    "total_rows": len(rows),
                    "saved": saved,
                    "skipped_duplicates": skipped_duplicates,
                    "failed": failed,
                    "errors": errors,
                },
            }
        )


# Developed by Unknown: `rbac.is_executive_department` / `rbac.sub_department_summary` /
# `rbac.visible_sub_departments_for`: none exist on `accounts.rbac`. `is_executive_department`
# and `sub_department_summary` are simple, self-contained projections reproduced verbatim from
# source. `visible_sub_departments_for` is reproduced with one deliberate simplification: it
# orders the department's sub-departments by name rather than by source's fixed "reference
# application's own eight" order (`EXECUTIVE_SUB_DEPARTMENT_ORDER`, a table that exists only in
# `users/rbac.py` and has no `accounts` equivalent) - the set of rows returned, and the
# confinement rule, are otherwise identical to source.
#
# Moved here from `views/base.py` during the obs file-structure split - these four names are
# used only by `SparesViewSet.selectable_departments`/`sub_departments`/`master_dropdown`
# above and nowhere else, so they belong beside their one caller rather than in the shared
# infrastructure module.
EXECUTIVE_DEPARTMENT = "EXECUTIVE"


def _is_executive_department(department):
    if department is None:
        return False
    return (getattr(department, "name", "") or "").strip().upper() == EXECUTIVE_DEPARTMENT


def _sub_department_summary(sub_department):
    if sub_department is None:
        return None
    return {
        "id": sub_department.pk,
        "name": sub_department.name,
        "department_id": sub_department.department_name_id,
    }


def _visible_sub_departments_for(user, department=None):
    """The sub-departments this caller may choose from, for one department."""
    department = department if department is not None else rbac.department_of(user)
    if _is_sub_department_confined(user):
        own = _own_sub_department_row(user)
        if own is None or own.department_name_id != getattr(department, "pk", None):
            return []
        return [own]
    if not _is_executive_department(department):
        return []
    return list(
        SubDepartment.objects.filter(
            department_name=department, is_deleted=False, active=True
        ).order_by("name")
    )


# Developed by Unknown: ONE DEPARTMENT, AS A DROPDOWN ROW - and why it carries three fields.
#
# `name` is the row's own `Master_department.name`, unchanged, because it is what every other
# endpoint keys and reports on and what a refusal names. `canonical_name` is what the rules
# actually match against (`master.utils.canonical_department_name`). `label` is what the screen
# SHOWS, and it names both whenever they differ - `E | ENGINEERING`.
#
# It names both because a deployment whose CMMS spells Engineering `E` gave the operator a
# Select Department control reading a bare letter, with no way to tell whether the application
# had understood it as Engineering. It had not, which is exactly what withdrew the D787J
# authority and both template downloads from that department. Showing the resolution makes the
# application's own reading of the row visible on the screen where the choice is made. A
# correctly named deployment sees no change at all - the two are equal and the label is the name.
def _department_option(department):
    """One department as `{id, name, canonical_name, label}` for a dropdown."""
    name = (department.name or "").strip()
    canonical = canonical_department_name(department)
    return {
        "id": department.id,
        "name": department.name,
        "canonical_name": canonical,
        "label": f"{name} | {canonical}" if canonical and canonical != name.upper() else name,
    }


# Developed by Unknown: kept on disk, unreferenced, for the same reason `views/workflow.py`'s
# `_raise_dart_for_rows` is - deleting code that merely looks unused is forbidden. This is not
# called from anywhere in production code (confirmed by search across this codebase); it was
# already dead in the flat `obs/views.py` before this split, and the split moves it verbatim
# rather than removing it.
def build_histories(spare_ids, request):
    """Build all history dictionaries for the given spare_ids."""
    access_level_choices = CustomUserProfile.access_level_choices

    history_issue = [
        {
            "pattern_number": e.spare.pattern_number,
            "equipment_class": e.spare.equipment_class.name,
            "description": e.spare.description,
            "username": f"{e.username.firstname} {e.username.lastname}",
            "quantity": str(e.quantity_issued),
            "date": localtime(e.issue_time).strftime("%Y-%m-%dT%H:%M"),
            "remarks": e.remarks,
            "nomenclature": e.equipment.nomenclature if e.equipment else "",
            "authority": e.spare.authority.name,
        }
        for e in Issue.objects.select_related(
            "spare",
            "spare__equipment_class",
            "spare__authority",
            "equipment",
            "username",
        ).filter(
            spare_id__in=spare_ids,
            spare_id__equipment_class__spare_class__department_id=request.user.user_profile.department.id,
        )
    ]

    history_return = [
        {
            "pattern_number": e.spare_id.pattern_number,
            "equipment_class": e.spare_id.equipment_class.name,
            "description": e.spare_id.description,
            "username": e.username,
            "remarks": e.remarks,
        }
        for e in Return.objects.filter(
            spare_id__in=spare_ids,
            spare_id__equipment_class__spare_class__department_id=request.user.user_profile.department.id,
        )
    ]

    history_survey_bypassed = [
        {
            "pattern_number": e.spare.pattern_number,
            "equipment_class": e.spare.equipment_class.name,
            "description": e.spare.description,
            "quantity": e.quantity_surveyed,
            "survey_number": e.survey_number,
            "date": localtime(e.survey_report_date).strftime("%Y-%m-%dT%H:%M"),
            "remarks": e.remarks,
            "created_by": e.created_by,
        }
        for e in PostSurvey.objects.filter(
            Q(
                survey_number__iexact="ONE-TIME APPROVAL",
                spare__equipment_class__spare_class__department_id=request.user.user_profile.department.id,
            )
            & Q(
                spare_id__in=spare_ids,
                spare__equipment_class__spare_class__department_id=request.user.user_profile.department.id,
            )
        )
    ]

    history_survey = [
        {
            "pattern_number": e.spare.pattern_number,
            "equipment_class": e.spare.equipment_class.name,
            "description": e.spare.description,
            "quantity": e.quantity_surveyed,
            "survey_number": e.survey_number,
            "date": localtime(e.survey_report_date).strftime("%Y-%m-%dT%H:%M"),
            "remarks": e.remarks,
            "created_by": e.created_by,
        }
        for e in PostSurvey.objects.filter(
            ~Q(
                survey_number__iexact="NA",
                spare__equipment_class__spare_class__department_id=request.user.user_profile.department.id,
            )
            & ~Q(
                survey_number__iexact="-NA-",
                spare__equipment_class__spare_class__department_id=request.user.user_profile.department.id,
            )
            & ~Q(
                survey_number__iexact="PTS",
                spare__equipment_class__spare_class__department_id=request.user.user_profile.department.id,
            )
            & Q(
                spare_id__in=spare_ids,
                spare__equipment_class__spare_class__department_id=request.user.user_profile.department.id,
            )
        )
    ]

    history_demand = [
        {
            "pattern_number": e.spare.pattern_number,
            "equipment_class": e.spare.equipment_class.name,
            "description": e.spare.description,
            "quantity": e.quantity_demanded,
            "demand_number": e.demand_number,
            "date": localtime(e.demand_date).strftime("%Y-%m-%dT%H:%M"),
            "remarks": e.remarks,
            "created_by": e.created_by,
        }
        for e in PostDemand.objects.filter(
            spare_id__in=spare_ids,
            spare__equipment_class__spare_class__department_id=request.user.user_profile.department.id,
        )
    ]

    history_receive = [
        {
            "pattern_number": e.spare.pattern_number,
            "equipment_class": e.spare.equipment_class.name,
            "description": e.spare.description,
            "quantity": e.quantity_received,
            "receipt_number": e.receipt_number,
            "date": localtime(e.receive_date).strftime("%Y-%m-%dT%H:%M"),
            "nac_status": e.nac_status,
            "remarks": e.remarks,
            "created_by": e.created_by,
        }
        for e in PostReceive.objects.filter(
            spare_id__in=spare_ids,
            spare__equipment_class__spare_class__department_id=request.user.user_profile.department.id,
        )
    ]

    # Code written by Unknown: rank, department, access_level, ship_joining_date and
    # ship_leaving_date are all nullable on CustomUserProfile (see users/models.py), and an
    # inactive profile without one of them raised AttributeError('NoneType' object has no
    # attribute 'name') here and crashed Home_new/Technical Dashboard entirely. Each field is
    # now read defensively so a deactivated profile missing optional data just shows blank
    # instead of taking down the whole dashboard.
    history_users = [
        {
            "access_level": access_level_choices[int(e.access_level)][1]
            if e.access_level is not None
            else "",
            "username": e.personal_number,
            "rank": e.rank.name if e.rank else "",
            "name": e.firstname + " " + e.lastname,
            "department": e.department.name if e.department else "",
            "date": localtime(e.ship_joining_date).strftime("%Y-%m-%dT%H:%M")
            if e.ship_joining_date
            else "",
            "ship_leaving_date": localtime(e.ship_leaving_date).strftime(
                "%Y-%m-%dT%H:%M"
            )
            if e.ship_leaving_date
            else "",
        }
        for e in CustomUserProfile.objects.filter(
            user_active=False, department_id=request.user.user_profile.department_id
        )
    ]

    return {
        "history_issue": history_issue,
        "history_return": history_return,
        "history_survey_bypassed": history_survey_bypassed,
        "history_survey": history_survey,
        "history_demand": history_demand,
        "history_receive": history_receive,
        "history_users": history_users,
    }
