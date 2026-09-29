"""OBS stock-transaction workflow viewsets: `RoutineSpareUsageViewSet`, `IssueViewSet`,
`IssueListViewSet`, `ReturnViewSet`, `SurveyViewSet`, `PostSurveyViewSet`, `DemandViewSet`,
`PostDemandViewSet`, `ReceiveViewSet`, `PostReceiveViewSet`, plus the planning/
requisition-support viewsets `PlannedRoutineSpareListViewSet`, `SparesMappingViewSet`,
`NotInCattedItemViewSet`.

Split out of the former flat `obs/views.py` (Part 1 of the obs file-structure split).
`planning.py` was folded into this module during the obs package-consolidation pass -
its viewsets are supporting/transactional viewsets in the same spirit as the
Issue/Return/Survey/Demand/Receive set already here.

Also carries optimization 2.2: `ReceiveViewSet.complete()` now calls the centralized
`services.apply_return_for_spare` reconciler instead of its own inline `IssueList` FIFO
walk, which never reconciled outstanding Survey/Demand cart rows the way the centralized
helper does.
"""

from accounts import rbac
from accounts.models import CustomUserProfile
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Max, Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from ems.models import AddRoutineDetails, RoutineDescription
from ilms.models import DartMOSpare, PlannedMOSpareList
from master.models import MShipCommand, Ship
from master.utils import get_this_ship
from op_maintenance.models import DartSpare, InitiateDart
from op_maintenance.utils import generate_dart_number
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from wlms.models import DartWedSpare, PlannedWEDSpareList, WLMSSpare

from .. import services
from ..models import (
    Demand,
    Issue,
    IssueList,
    NotInCattedItem,
    PlannedRoutineSpareList,
    PostDemand,
    PostReceive,
    PostSurvey,
    Receive,
    Return,
    RoutineSpareUsage,
    Spares,
    SparesMapping,
    Survey,
)
from ..serializers import (
    DEFECT_REMARKS,
    OTHER_UNIT_ROLE_LABEL,
    CompleteDemandSerializer,
    CompleteReceiveSerializer,
    CompleteSurveySerializer,
    DemandSerializer,
    IssueListSerializer,
    IssueSerializer,
    NotInCattedItemSerializer,
    PlannedRoutineSpareListSerializer,
    PostDemandSerializer,
    PostReceiveSerializer,
    PostSurveySerializer,
    RaiseDartSerializer,
    ReceiveSerializer,
    RequisitionDeleteSerializer,
    ReturnSerializer,
    RoutineSpareUsageSerializer,
    SparesMappingSerializer,
    SurveySerializer,
    current_other_unit_profiles,
    defect_issue_profiles,
    other_unit_designation,
    other_unit_label,
    other_unit_name,
)
from ..utils import django_validation_error_detail, tagged_viewset
from .base import CleanValidationModelViewSet, payload_pk

# Developed with Understanding: the Ty Loan picker needs a Command, a Unit or a search of at
# least this many characters before it lists anyone, because the other-unit table can hold
# the whole Navy (D12).
OTHER_UNIT_SEARCH_MIN_LENGTH = 2
OTHER_UNIT_FILTER_REQUIRED_MESSAGE = (
    "Pick a Command or a Unit Name, or type at least 2 characters of a name or personal "
    "number, to list other-unit personnel."
)


# Developed with Understanding: page size of the Ty Loan picker (D12) - 20 rows by default,
# never more than 50. A local PageNumberPagination as accounts HrcdfPersonnelPagination is,
# answering DRF's own {count, next, previous, results}.
class OtherUnitUsersPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 50


# Developed with Understanding: one Ty Loan picker row, built as a dict the way
# inventory_users builds its rows (the neighbouring pattern), not through a serializer.
def _other_unit_user_row(profile):
    rank = (profile.rank_name or "").strip()
    if not rank and profile.rank:
        rank = profile.rank.name or ""
    return {
        "id": profile.pk,
        "name": other_unit_name(profile),
        "personal_number": profile.personal_number or "",
        "rank": rank,
        "unit_name": profile.section or "",
        "unit_code": profile.unit_code or "",
        "command_code": profile.command_code or "",
        "command_name": profile.command_name or "",
        "designation": other_unit_designation(profile),
        "role": OTHER_UNIT_ROLE_LABEL,
        "is_own_unit": False,
        "selectable_for_issue": True,
    }


class RoutineSpareUsageViewSet(CleanValidationModelViewSet):
    queryset = RoutineSpareUsage.objects.select_related(
        "routine",
        "routine_description",
        "spare",
    ).all()
    serializer_class = RoutineSpareUsageSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "spare__equipment_class__spare_class__department_id"

    @action(detail=False, methods=["get"])
    def routines(self, request):
        equipment_id = request.query_params.get("equipment")
        if not equipment_id:
            raise DRFValidationError({"equipment": "Equipment id is required."})
        routines = AddRoutineDetails.objects.filter(
            equipment_name_id=equipment_id
        ).select_related("routine_name")
        return Response(
            [
                {
                    "id": routine.pk,
                    "name": routine.routine_name.name,
                    "routine_number": routine.routine_no,
                    "dart_number": routine.dart_number,
                }
                for routine in routines
            ]
        )

    @action(
        detail=False,
        methods=["get"],
        url_path="routine-descriptions",
    )
    def routine_descriptions(self, request):
        routine_id = request.query_params.get("routine")
        if not routine_id:
            raise DRFValidationError({"routine": "Routine id is required."})
        descriptions = RoutineDescription.objects.filter(
            add_routine_details_id=routine_id
        )
        return Response(
            [
                {
                    "id": description.pk,
                    "description": description.routine_description,
                    "routine_number": description.routine_no,
                    "dart_number": description.dart_number,
                }
                for description in descriptions
            ]
        )


@tagged_viewset("OBS")
class IssueViewSet(CleanValidationModelViewSet):
    # Developed with Understanding: issued_to_other_profile joined for issued_to_other_label (D6).
    queryset = Issue.objects.select_related(
        "spare", "username", "issued_to_other_profile"
    ).all()
    serializer_class = IssueSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "spare__equipment_class__spare_class__department_id"

    def get_queryset(self):
        queryset = super().get_queryset()
        spare_id = self.request.query_params.get("spare")
        remarks = self.request.query_params.get("remarks")
        if spare_id:
            queryset = queryset.filter(spare_id=spare_id)
        if remarks:
            queryset = queryset.filter(remarks__iexact=remarks)
        return queryset

    @action(detail=False, methods=["get"], url_path="issued-to-maintainers")
    def issued_to_maintainers(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=["get"], url_path="ty-loan")
    def ty_loan(self, request):
        issues = self.filter_queryset(self.get_queryset()).filter(
            remarks__iexact="TY LOAN"
        )
        spare_ids = issues.values_list("spare_id", flat=True)
        returns = Return.objects.filter(spare_id_id__in=spare_ids).order_by("id")
        return_map = {}
        for returned_spare in returns:
            key = (returned_spare.spare_id_id, returned_spare.quantity_returned)
            return_map.setdefault(key, []).append(returned_spare)

        data = []
        for issue in issues:
            key = (issue.spare_id, issue.quantity_issued)
            matched_return = None
            if return_map.get(key):
                matched_return = return_map[key].pop(0)
            data.append(
                {
                    "issue": IssueSerializer(issue).data,
                    "return": (
                        ReturnSerializer(matched_return).data
                        if matched_return
                        else None
                    ),
                    # Developed with Understanding: who the Ty Loan went to - the linked
                    # other-unit person first, else the free-text unit that historic rows
                    # carry (Q12). No backfill.
                    "issued_to": (
                        other_unit_label(issue.issued_to_other_profile)
                        if issue.issued_to_other_profile_id
                        else issue.issued_to_unit
                    ),
                }
            )
        return Response(data)


@tagged_viewset("OBS")
class IssueListViewSet(CleanValidationModelViewSet):
    queryset = IssueList.objects.select_related("issue_entry").all()
    serializer_class = IssueListSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = (
        "issue_entry__spare__equipment_class__spare_class__department_id"
    )




@tagged_viewset("OBS")
class ReturnViewSet(CleanValidationModelViewSet):
    queryset = Return.objects.select_related(
        "spare_id",
        "command_id",
        "ship",
        "returned_by",
    ).all()
    serializer_class = ReturnSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "spare_id__equipment_class__spare_class__department_id"

    # Developed by Unknown: a return is TWO movements and this method owns the order of them.
    #
    # `Return.save()` puts the quantity back on the shelf. Everything else - drawing down the
    # pending-return row and the Survey / Demand cart behind it, and releasing the IIF marker
    # once nothing is outstanding - is `services.apply_return_to_pending_row`.
    #
    # Requirement F-07: return 3 of 8 and the Survey or Demand row drops to 5; return all 8 and
    # the cart row is gone, because the item is no longer awaiting survey or demand. That rule
    # now applies to every issue, not only import shortfalls - an item back on charge must not
    # still be queued to be surveyed or demanded, whatever put it on issue.
    #
    # THE ORDER USED TO BE A BUG. `Return.save()` also drew down `IssueList`, and the reconciler
    # that runs after it sizes the cart deduction from `quantity_toreturn` - which by then had
    # been reduced or deleted, so the cart was never touched and F-07 did not hold even for the
    # shortfalls it was written for. The model no longer touches `IssueList`, so the two halves
    # can no longer read each other's leftovers.
    #
    # One transaction around both, so a failure to reconcile cannot leave a return recorded
    # against carts that were not adjusted. `Return.save()` takes its own `select_for_update` on
    # the spare and the service locks the rows it reduces, so both need one anyway.
    def perform_create(self, serializer):
        # `CleanValidationMixin.perform_create` is overridden here, so its translation of
        # Django's ValidationError into DRF's has to be repeated - without it `Return.save()`'s
        # "would exceed authorised stock" escapes as a Django error and the caller gets a 500
        # with no message instead of a 400 saying what is wrong.
        try:
            with transaction.atomic():
                issue_list = serializer.validated_data.get("issue_list_id")
                returned = serializer.save(
                    returned_by=self.request.user.user_profile,
                    username=self.request.user.get_username(),
                )
                quantity = returned.quantity_returned or 0
                if issue_list is not None:
                    services.apply_return_to_pending_row(issue_list, quantity)
                else:
                    services.apply_return_for_spare(returned.spare_id, quantity)
        except DjangoValidationError as error:
            raise DRFValidationError(django_validation_error_detail(error)) from error

    def get_queryset(self):
        queryset = super().get_queryset()
        spare_id = self.request.query_params.get("spare")
        command_id = self.request.query_params.get("command")
        ship_id = self.request.query_params.get("ship")
        if spare_id:
            queryset = queryset.filter(spare_id_id=spare_id)
        if command_id:
            queryset = queryset.filter(command_id_id=command_id)
        if ship_id:
            queryset = queryset.filter(ship_id=ship_id)
        return queryset

    @action(detail=False, methods=["get"], url_path="returned-spares")
    def returned_spares(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        return Response(self.get_serializer(queryset, many=True).data)

    # Developed by Unknown: the ONE user directory every Ship Inventory people-picker draws
    # from — "Issued To" on Issue Spare, "Issued To" on Requisition Issue, and "Returned by"
    # on Return. It is NOT `users/users/active/`: that endpoint is scoped to the CALLER'S OWN
    # DEPARTMENT (see `ActiveUserAPIView`), so a Ty Loan item issued to somebody outside the
    # storekeeper's department had nobody to hand it back to, and its rows could not be
    # labelled with the holder's unit either. Inventory was that endpoint's only consumer, so
    # the three screens were consolidated here instead of adding a flag to a shared users API.
    #
    # It serves two DIFFERENT needs at once, which is why it filters nothing out of the
    # queryset and answers with per-row flags instead:
    #
    #   1. The dropdowns, which must offer only real personnel — read `selectable`.
    #   2. The Return/History/Dashboard grids' id -> name lookup. `IssueSerializer.username`
    #      is a bare profile id, so those grids join against this list to print a name and a
    #      unit rather than a number. Records already issued to a seeded account still have
    #      to READ correctly, so every profile must stay in the payload.
    @action(detail=False, methods=["get"], url_path="inventory-users")
    def inventory_users(self, request):
        this_ship = get_this_ship()
        own_unit = ((this_ship.name if this_ship else "") or "").strip().upper()
        access_labels = dict(CustomUserProfile.access_level_choices)

        # Developed with Understanding: ?reason=DEFECT narrows the list to own-ship personnel
        # on the active roll and drops the has_credentials filter, because HRCDF-synced crew
        # have no credentials (D5, Q3, Q4). With no reason, or any other value, the queryset
        # is exactly today's, so Requisition Issue and the grids' lookup are unchanged (Q13).
        # The Ty Loan list is its own endpoint below (D12).
        reason = (request.query_params.get("reason") or "").strip().upper()
        if reason == DEFECT_REMARKS:
            base_profiles = defect_issue_profiles()
        else:
            base_profiles = CustomUserProfile.objects.filter(
                has_credentials=True, user_active=True
            )

        profiles = base_profiles.select_related(
            "rank",
            "role_master",
            "ship",
            "command_name",
            "department",
            # Developed with Understanding: read by the designation fallback on each row.
            "designation_master",
        ).order_by("firstname", "lastname", "id")

        # Developed by Unknown: department scoping for the two "Issued To" pickers, which
        # `ActiveUserAPIView` applied and this endpoint therefore must not silently drop.
        # Carried as a per-row flag rather than a queryset filter because the SAME response is
        # the grids' name lookup, which has to span departments (see the block above) and,
        # for a Ty Loan, other units too.
        #
        # `can_see_all_departments` is the application's canonical "sees everything" test
        # (CO / SHIPADMIN / COMMAND / legacy ADMIN) and replaces `ActiveUserAPIView`'s own
        # `department.name == "ADMIN"` check. The ADMIN DEPARTMENT holds only the seeded admin
        # account, which `selectable` excludes anyway, so nothing real turns on the swap.
        caller_department_id = getattr(rbac.department_of(request.user), "pk", None)
        caller_sees_all = rbac.can_see_all_departments(request.user)

        profile_rows = []
        for profile in profiles:
            personal_number = profile.personal_number or ""
            # Developed by Unknown: THE seeded-account test, and it is not invented here.
            # A real person's personal number is a service number and starts with a DIGIT;
            # every account written by `seed_all.py` and the test-data commands starts with a
            # letter (`PN0001`, `TESTDEPTA01`, `P002`, `REG001`, `U001`). `users/views.py`'s
            # `UserListAPIView` and eight querysets in `crew_manage/views.py` already express
            # exactly this as `personal_number__regex=r"^\d"` — the same rule, applied in
            # Python here only because the answer below depends on the whole set at once and
            # a second queryset would be a second source of truth for one decision.
            #
            # Sliced-and-compared rather than `.isdigit()`, which is true for non-ASCII digits
            # that `^\d` would not match in Postgres.
            is_ad_user = personal_number[:1] in "0123456789"
            profile_rows.append((profile, is_ad_user))

        # Developed by Unknown: the fallback, and why it is decided over the WHOLE directory
        # rather than row by row. No AD user exists yet in any deployment of this application
        # — LDAP authenticates but never provisions a profile — so the digit rule on its own
        # would empty all three pickers and make it impossible to issue or return anything.
        # Until the first real person arrives, the guests stand in: an AD user's landing state
        # is precisely "signed in, no role granted yet", which `rbac.is_guest_or_unassigned`
        # already treats as Guest. The day one digit-leading profile exists, this switches off
        # and the seeded accounts disappear on their own.
        any_ad_users = any(is_ad_user for _profile, is_ad_user in profile_rows)

        users = []
        for profile, is_ad_user in profile_rows:
            # Developed by Unknown: a profile with no ship of its own is one of OURS, not an
            # unknown. This is a per-ship installation and `CustomUserProfile.ship` is nullable
            # and unset on most real profiles, so treating "no ship recorded" as "foreign unit"
            # would flag the entire crew as a Ty Loan holder. Compared by primary key first and
            # only by name as a fallback, so two ships sharing a display name cannot collide.
            unit_name = (profile.ship.name if profile.ship and profile.ship.name else "") or ""
            is_own_unit = (
                profile.ship_id is None
                or (this_ship is not None and profile.ship_id == this_ship.pk)
                or (bool(own_unit) and unit_name.strip().upper() == own_unit)
            )
            if is_own_unit and not unit_name and this_ship:
                unit_name = this_ship.name or ""

            role_name = ""
            if profile.role_master and profile.role_master.role_name:
                role_name = profile.role_master.role_name
            role = role_name
            if not role and profile.access_level is not None:
                role = access_labels.get(str(profile.access_level), "") or ""

            selectable = is_ad_user if any_ad_users else role_name == rbac.ROLE_GUEST
            in_scope = caller_sees_all or (
                caller_department_id is not None
                and profile.department_id == caller_department_id
            )

            # Developed with Understanding: DESIGNATION for the D5 label - the designation
            # text, else the designation master name, as accounts get_user_designation reads it.
            designation = (profile.designation or "").strip()
            if not designation and profile.designation_master:
                designation = profile.designation_master.designation_name or ""

            users.append(
                {
                    "id": profile.pk,
                    "name": f"{profile.firstname} {profile.lastname}".strip(),
                    "rank": profile.rank.name if profile.rank else "",
                    "personal_number": profile.personal_number or "",
                    "role": role,
                    "department": profile.department.name if profile.department else "",
                    "unit_name": unit_name,
                    # Developed with Understanding: additive, read by the D5 option label.
                    "designation": designation,
                    # Developed by Unknown: what makes a row "internal" rather than a Ty Loan
                    # on the Return grid. Decided HERE and not on the front end, because the
                    # ship recorded in masters is `master.utils.get_this_ship()` and the front
                    # end has no equivalent resolver.
                    "is_own_unit": is_own_unit,
                    "is_ad_user": is_ad_user,
                    # Developed by Unknown: may a picker OFFER this person? Answered here and
                    # not on the front end because it depends on the whole directory (see
                    # `any_ad_users`), which no single row can see. `rbac.ROLE_GUEST` rather
                    # than the literal, so the guest role is named once in this application.
                    #
                    # This is the answer for "Returned by" on Return, which is deliberately
                    # NOT department-scoped: a Ty Loan is handed back by somebody from the
                    # other unit, and therefore from outside the storekeeper's department.
                    "selectable": selectable,
                    "in_scope": in_scope,
                    # Developed by Unknown: the answer for the two "Issued To" pickers, which
                    # ARE department-scoped -- `ActiveUserAPIView` scoped them and this
                    # endpoint must not silently widen that.
                    #
                    # The `not any_ad_users` escape is measured, not defensive. With scoping
                    # applied on top of the guest fallback, the only stand-in on this ship
                    # (one Guest user, in one department) was reachable from four of the
                    # seventeen non-privileged logins, and Issue Spare was unusable for the
                    # other thirteen. The fallback exists precisely so the screens keep
                    # working until real personnel arrive, so while it is active the guests
                    # are offered ship-wide. It stops applying by itself the moment one
                    # digit-leading profile exists, and normal scoping resumes with it.
                    "selectable_for_issue": selectable
                    and (in_scope or not any_ad_users),
                }
            )

        return Response({"own_unit_name": this_ship.name if this_ship else "", "users": users})

    # Developed with Understanding: GET returns/other-unit-users/ - the Ty Loan Issued To
    # picker over current other-unit personnel (D11, D12). Server-searched and paginated
    # because the table can hold the whole Navy, so a filter or a search is required first.
    @action(detail=False, methods=["get"], url_path="other-unit-users")
    def other_unit_users(self, request):
        command = (request.query_params.get("command") or "").strip()
        unit = (request.query_params.get("unit") or "").strip()
        search = (request.query_params.get("search") or "").strip()
        if not command and not unit and len(search) < OTHER_UNIT_SEARCH_MIN_LENGTH:
            raise DRFValidationError(OTHER_UNIT_FILTER_REQUIRED_MESSAGE)

        queryset = current_other_unit_profiles().select_related("rank")
        if command:
            queryset = queryset.filter(command_code=command)
        if unit:
            queryset = queryset.filter(unit_code=unit)
        if search:
            queryset = queryset.filter(
                Q(personal_number__icontains=search)
                | Q(full_name__icontains=search)
                | Q(firstname__icontains=search)
                | Q(lastname__icontains=search)
            )
        queryset = queryset.order_by("full_name", "personal_number")

        paginator = OtherUnitUsersPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            [_other_unit_user_row(profile) for profile in page]
        )

    # Developed with Understanding: GET returns/other-unit-users/filters/ - the Command and
    # Unit Name options for the Ty Loan picker (D11). Distinct codes over current
    # other-unit rows with a head count, units narrowed by ?command. Values only, no people.
    @action(detail=False, methods=["get"], url_path="other-unit-users/filters")
    def other_unit_user_filters(self, request):
        command = (request.query_params.get("command") or "").strip()
        current = current_other_unit_profiles()

        commands = (
            current.exclude(command_code="")
            .values("command_code")
            .annotate(name=Max("command_name"), count=Count("id"))
            .order_by("command_code")
        )
        units = current.exclude(unit_code="")
        if command:
            units = units.filter(command_code=command)
        units = (
            units.values("unit_code")
            .annotate(name=Max("section"), count=Count("id"))
            .order_by("name", "unit_code")
        )

        return Response(
            {
                "commands": [
                    {
                        "code": row["command_code"],
                        "name": row["name"] or "",
                        "count": row["count"],
                    }
                    for row in commands
                ],
                "units": [
                    {
                        "code": row["unit_code"],
                        "name": row["name"] or "",
                        "count": row["count"],
                    }
                    for row in units
                ],
            }
        )

    @action(detail=False, methods=["get"])
    def commands(self, request):
        commands = MShipCommand.objects.exclude(command_name__isnull=True).exclude(
            command_name__iexact="NA"
        )
        return Response(
            [
                {
                    "id": command.pk,
                    "command_code": command.command_code,
                    "command_name": command.command_name,
                }
                for command in commands
            ]
        )

    @action(detail=False, methods=["get"])
    def ships(self, request):
        queryset = Ship.objects.all()
        command_id = request.query_params.get("command")
        if command_id:
            queryset = queryset.filter(command_id=command_id)
        return Response(
            [
                {
                    "id": ship.pk,
                    "code": ship.code,
                    "name": ship.name,
                    "command": ship.command_id,
                }
                for ship in queryset
            ]
        )


def _raise_dart_for_rows(rows, quantity_field):
    """Assign a fresh DART number to whichever of `rows` (Survey or Demand instances,
    with the pending quantity read off `quantity_field`) don't already carry one.

    Also registers a matching `op_maintenance.DartSpare` line against a newly created
    `op_maintenance.InitiateDart` record — the same linkage `_resolve_initiate_dart_number`
    (serializers.py) and the "defect requisition" listing (`SparesViewSet.defect_requisition`)
    already expect a properly-raised DART to have, and the same numbering ledger
    `generate_dart_number` scans, so a number handed out here can never collide with one
    raised later through the full `dart` app defect-initiation flow.

    Rows that share the same `issue_entry` (i.e. drawn against the same original spare
    issue/defect) share one DART number, matching how one DART covers everything issued
    for one defect.
    """
    darts_by_group = {}
    updated = []
    with transaction.atomic():
        for row in rows:
            if row.dart_number:
                continue
            group_key = row.issue_entry_id or f"row-{row.pk}"
            dart = darts_by_group.get(group_key)
            if dart is None:
                department = row.spare.equipment_class.spare_class.department
                dept_name = department.name if department else "X"
                dart = InitiateDart.objects.create(
                    department_id=department,
                    dart_number=generate_dart_number(dept_name, "Defect"),
                    dart_date=timezone.now().date(),
                )
                darts_by_group[group_key] = dart
            DartSpare.objects.create(
                dart=dart,
                spare_id=row.spare_id,
                pattern=row.spare.pattern_number,
                # Developed by Unknown: the origin sentinel, not the plain `"OBS"` this line
                # used to write. `"OBS"` is byte-identical to what the maintainer's own defect
                # form writes for a ship-inventory spare, so it can never tell the two apart -
                # and `SparesViewSet.defect_requisition` published every row it produced into
                # `Maintainer Spare Request - Defect DART` as a result. See
                # `services.OBS_INTERNAL_INVENTORY_TYPE` for the full reasoning and for why
                # this needs no migration. The seeded DART form writes the same value on the
                # path that has replaced this function - the two must not disagree.
                inventory_type=services.OBS_INTERNAL_INVENTORY_TYPE,
                description=row.spare.description,
                quantity=getattr(row, quantity_field),
            )
            row.dart_number = dart.dart_number
            row.save(update_fields=["dart_number"])
            updated.append(row)
    return updated


# Developed by Unknown: `_raise_dart_for_rows` above is RETIRED and is called from nowhere in
# production code. It is kept on disk, unreferenced, because deleting code that merely looks
# unused is forbidden - and because its sentinel write must stay correct if it is ever restored.
#
# WHY IT IS RETIRED. It grouped a selection by `issue_entry_id`, so one click could mint
# SEVERAL DART numbers for one selection, and it silently skipped - and silently left out of
# its own response - any row that already carried a number. Neither is what a DART is: one DART
# covers everything consumed on ONE defect. Raise DART on Due for Survey and Due for Demand now
# opens the single-DART form pre-loaded with the selected spares, and `op_maintenance.InitiateDart` is
# written once, by `op_maintenance.views.InitiateDartAPIView.post`, when the operator saves that form.
#
# WHAT NOW WRITES THE QUEUE ROW'S `dart_number`. Two mechanisms that both already existed and
# neither of which is new here:
#   1. `InitiateDartAPIView.post` step 9 updates every pending `obs.Issue` whose spare's pattern
#      was posted, and through it every `obs.Survey` and `obs.Demand` hanging off those issues.
#   2. `_resolve_initiate_dart_number` (serializers.py) resolves the DART by pattern number at
#      READ time, so the DART No column is right even for a queue row with no `issue_entry` -
#      a requisition-raised row - which step 9 cannot reach.
#
# WHY THESE TWO ACTIONS REFUSE RATHER THAN SIMPLY LOSING THEIR CALLER. Leaving a second live
# endpoint that can mint a DART for the same rows is the one outcome that must not be shipped:
# a stale browser tab, a bookmarked call or a script would create a competing DART number for
# rows the form is about to cover. The route, the schema and the serializer are all left in
# place so the refusal is explicit and reversible rather than a 404.
RAISE_DART_RETIRED_MESSAGE = (
    "Raise DART now opens the DART form, so that every spare selected is covered by one DART "
    "number. This endpoint no longer raises a DART. Use Raise DART on Due for Survey or Due "
    "for Demand, complete the form and save. Nothing in this request has been actioned."
)


# Developed by Unknown: THE SERVER SIDE OF THE IIF GATE, written once for both queue viewsets.
#
# Called BEFORE `_raise_dart_for_rows`, never inside it, so a refused request writes nothing at
# all - no `InitiateDart`, no `DartSpare` and no `dart_number` update, for any row in the batch.
#
# The whole request is refused rather than the offending rows alone. That is a deliberate
# policy, not a shortcut: a partial success on a stores action is harder for an operator to
# reason about than a clean refusal, and `_raise_dart_for_rows` ALREADY skips in silence any row
# that arrives carrying a `dart_number` (`if row.dart_number: continue` above), so a
# partial-success gate would compound two invisible skips inside one response and leave the
# operator with no way to tell which rows moved.
#
# `rows` are read off a queryset annotated by `services.open_iif_exists`, so the flag costs no
# query here. `getattr` guards the case of a caller passing un-annotated instances - it asks the
# database rather than assuming the row is clear, because assuming clear is the one wrong answer.
def _reject_rows_awaiting_incatting(rows, next_step):
    """Refuse the whole batch when any row's spare has an unresolved Due-for-IIF record.

    `Survey.spare` and `Demand.spare` are both non-nullable `PROTECT` foreign keys, so every
    row reliably has a pattern number to name in the refusal.
    """
    flags = [getattr(row, "awaiting_incatting", None) for row in rows]
    if any(flag is None for flag in flags):
        blocked = services.patterns_awaiting_incatting(
            row.spare.pattern_number for row in rows
        )
    else:
        blocked = {row.spare.pattern_number for row, flag in zip(rows, flags) if flag}
    if not blocked:
        return
    raise DRFValidationError(
        services.awaiting_incatting_message(sorted(blocked), next_step)
    )


@tagged_viewset("OBS")
class SurveyViewSet(CleanValidationModelViewSet):
    # Developed by Unknown: the IIF gate flag, annotated once here rather than asked per row.
    # `list`, `retrieve` and `raise_dart` all resolve through `get_queryset()`, so one
    # correlated `Exists()` subquery inside the existing SELECT serves the grid, the serializer
    # and the refusal, with no extra round trip and no N+1 whatever the size of the queue.
    queryset = (
        Survey.objects.select_related("issue_entry", "spare")
        .annotate(awaiting_incatting=services.open_iif_exists("spare"))
        .all()
    )
    serializer_class = SurveySerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "spare__equipment_class__spare_class__department_id"

    @extend_schema(
        request=RaiseDartSerializer,
        responses={200: SurveySerializer(many=True)},
        tags=["OBS"],
    )
    @action(detail=False, methods=["post"], url_path="raise-dart")
    def raise_dart(self, request):
        # Developed by Unknown: RETIRED. One selection now produces ONE DART, raised by the
        # single-DART form the queue screen hands off to, so this action must not be able to
        # mint a competing number for the same rows. It refuses before reading the payload and
        # writes nothing at all. See `RAISE_DART_RETIRED_MESSAGE` above for the full reasoning
        # and for what now writes the queue row's `dart_number`.
        raise DRFValidationError(RAISE_DART_RETIRED_MESSAGE)

    @extend_schema(
        request=CompleteSurveySerializer,
        responses={201: PostSurveySerializer},
        tags=["OBS"],
    )
    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        serializer = CompleteSurveySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quantity = serializer.validated_data["quantity_surveyed"]

        with transaction.atomic():
            survey = Survey.objects.select_for_update().get(pk=self.get_object().pk)
            if quantity > survey.quantity_tosurvey:
                raise DRFValidationError(
                    {
                        "quantity_surveyed": (
                            "Surveyed quantity cannot exceed pending quantity."
                        )
                    }
                )
            survey_type = serializer.validated_data["survey_type"]
            survey_number = serializer.validated_data.get("survey_number", "")
            if survey_type != PostSurvey.NORMAL:
                survey_number = survey_type.replace("_", "-")

            post_survey = PostSurvey.objects.create(
                spare=survey.spare,
                issue_entry=survey.issue_entry,
                quantity_surveyed=quantity,
                survey_type=survey_type,
                survey_number=survey_number,
                survey_report_date=serializer.validated_data.get(
                    "survey_report_date",
                    timezone.now(),
                ),
                remarks=serializer.validated_data.get("remarks", ""),
                has_pts=(
                    serializer.validated_data["has_pts"]
                    or survey_type == PostSurvey.PTS
                ),
                created_by=request.user.get_username(),
                # Developed by Unknown: THE USER, not the profile. `created_by_user` is a
                # ForeignKey to `settings.AUTH_USER_MODEL` - `accounts.CustomUser` - while
                # `request.user.user_profile` is the `CustomUserProfile` behind it. The
                # two are different models, so this assignment raised
                # `ValueError: ... must be a "CustomUser" instance` and the endpoint answered
                # 500 on EVERY call. The same mistake was made on `PostDemand` and
                # `PostReceive` below and is corrected in all three.
                #
                # `user_profile` is right everywhere else in this file: the `username`
                # fields on Issue, Survey, Demand and Return really are profile FKs. It is only
                # these three `created_by_user` columns that want the credentials row.
                created_by_user=request.user,
                dart_number=survey.dart_number,
            )
            demand = Demand.objects.create(
                spare=survey.spare,
                issue_entry=survey.issue_entry,
                quantity_todemand=quantity,
                survey_entry=post_survey,
                dart_number=survey.dart_number,
                is_iif=survey.is_iif,
            )
            remaining_quantity = survey.quantity_tosurvey - quantity
            if remaining_quantity:
                survey.quantity_tosurvey = remaining_quantity
                survey.save(update_fields=["quantity_tosurvey"])
            else:
                survey.delete()

        return Response(
            {
                "post_survey": PostSurveySerializer(post_survey).data,
                "demand": DemandSerializer(demand).data,
            },
            status=status.HTTP_201_CREATED,
        )


@tagged_viewset("OBS")
class PostSurveyViewSet(CleanValidationModelViewSet):
    queryset = PostSurvey.objects.select_related(
        "issue_entry",
        "spare",
        "created_by_user",
    ).all()
    serializer_class = PostSurveySerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "spare__equipment_class__spare_class__department_id"

    @action(detail=False, methods=["get"], url_path="pts-list")
    def pts_list(self, request):
        # NOTE: product decision, see PR description — previously this action
        # restricted even privileged users to their own department (no
        # can_see_all_departments bypass); it now follows the same
        # department-scoping contract as the rest of this app, so a
        # privileged user will newly see every department's PTS entries here.
        queryset = self.filter_queryset(self.get_queryset()).filter(
            survey_number__in=["PTS", "OPDEM", "ONETIME APPROVAL"],
            has_pts=True,
        )
        return Response(self.get_serializer(queryset, many=True).data)


@tagged_viewset("OBS")
class DemandViewSet(CleanValidationModelViewSet):
    # Developed by Unknown: the same one-subquery IIF gate annotation `SurveyViewSet` carries,
    # for the same reason - the Due for Demand grid, `DemandSerializer` and the DART refusal all
    # read this one flag, so they cannot disagree about the same spare.
    queryset = Demand.objects.select_related(
        "issue_entry",
        "spare",
        "survey_entry",
    ).annotate(awaiting_incatting=services.open_iif_exists("spare"))
    serializer_class = DemandSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "spare__equipment_class__spare_class__department_id"

    @extend_schema(
        request=RaiseDartSerializer,
        responses={200: DemandSerializer(many=True)},
        tags=["OBS"],
    )
    @action(detail=False, methods=["post"], url_path="raise-dart")
    def raise_dart(self, request):
        # Developed by Unknown: RETIRED, for the same reason and in the same words as
        # `SurveyViewSet.raise_dart` - the two queue screens must refuse identically, and
        # neither may mint a DART number that competes with the one the form raises.
        raise DRFValidationError(RAISE_DART_RETIRED_MESSAGE)

    @extend_schema(
        request=CompleteDemandSerializer,
        responses={201: PostDemandSerializer},
        tags=["OBS"],
    )
    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        serializer = CompleteDemandSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quantity = serializer.validated_data["quantity_demanded"]

        with transaction.atomic():
            demand = Demand.objects.select_for_update().get(pk=self.get_object().pk)
            if quantity > demand.quantity_todemand:
                raise DRFValidationError(
                    {
                        "quantity_demanded": (
                            "Demanded quantity cannot exceed pending quantity."
                        )
                    }
                )
            if (
                PostDemand.objects.filter(
                    demand_number=serializer.validated_data["demand_number"]
                )
                .exclude(spare=demand.spare)
                .exists()
            ):
                raise DRFValidationError(
                    {"demand_number": ("This demand number belongs to another spare.")}
                )
            post_demand = PostDemand.objects.create(
                spare=demand.spare,
                issue_entry=demand.issue_entry,
                quantity_demanded=quantity,
                demand_number=serializer.validated_data["demand_number"],
                demand_date=serializer.validated_data.get(
                    "demand_date",
                    timezone.now(),
                ),
                remarks=serializer.validated_data.get("remarks", ""),
                created_by=request.user.get_username(),
                # The CustomUser, not the profile - see `SurveyViewSet.complete`.
                created_by_user=request.user,
                dart_number=demand.dart_number,
            )
            receive = Receive.objects.create(
                spare=demand.spare,
                issue_entry=demand.issue_entry,
                quantity_toreceive=quantity,
                demand_entry=post_demand,
                dart_number=demand.dart_number,
            )
            remaining_quantity = demand.quantity_todemand - quantity
            if remaining_quantity:
                demand.quantity_todemand = remaining_quantity
                demand.save(update_fields=["quantity_todemand"])
            else:
                demand.delete()

        return Response(
            {
                "post_demand": PostDemandSerializer(post_demand).data,
                "receive": ReceiveSerializer(receive).data,
            },
            status=status.HTTP_201_CREATED,
        )

    def complete_from_payload(self, request):
        self.kwargs[self.lookup_url_kwarg or self.lookup_field] = payload_pk(
            request,
            "demand_id",
            "demand",
            "pk",
            "id",
        )
        return self.complete(request, pk=self.kwargs["pk"])


@tagged_viewset("OBS")
class PostDemandViewSet(CleanValidationModelViewSet):
    queryset = PostDemand.objects.select_related(
        "issue_entry",
        "spare",
        "created_by_user",
    ).all()
    serializer_class = PostDemandSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "spare__equipment_class__spare_class__department_id"


@tagged_viewset("OBS")
class ReceiveViewSet(CleanValidationModelViewSet):
    queryset = Receive.objects.select_related(
        "demand_entry",
        "issue_entry",
        "spare",
    )
    serializer_class = ReceiveSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "spare__equipment_class__spare_class__department_id"

    @extend_schema(
        request=CompleteReceiveSerializer,
        responses={201: PostReceiveSerializer},
        tags=["OBS"],
    )
    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        serializer = CompleteReceiveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quantity = serializer.validated_data["quantity_received"]
        if PostReceive.objects.filter(
            receipt_number=serializer.validated_data["receipt_number"]
        ).exists():
            raise DRFValidationError(
                {"receipt_number": "This receipt number already exists."}
            )

        with transaction.atomic():
            receive = Receive.objects.select_for_update().get(pk=self.get_object().pk)
            if quantity > receive.quantity_toreceive:
                raise DRFValidationError(
                    {
                        "quantity_received": (
                            "Received quantity cannot exceed pending quantity."
                        )
                    }
                )
            post_receive = PostReceive.objects.create(
                spare=receive.spare,
                issue_entry=receive.issue_entry,
                quantity_received=quantity,
                receipt_number=serializer.validated_data["receipt_number"],
                receive_date=serializer.validated_data.get(
                    "receive_date",
                    timezone.now(),
                ),
                nac_status=serializer.validated_data["nac_status"],
                remarks=serializer.validated_data.get("remarks", ""),
                dart_number=receive.dart_number,
                created_by=request.user.get_username(),
                # The CustomUser, not the profile - see `SurveyViewSet.complete`.
                created_by_user=request.user,
            )
            remaining_quantity = receive.quantity_toreceive - quantity
            if remaining_quantity:
                receive.quantity_toreceive = remaining_quantity
                receive.save(update_fields=["quantity_toreceive"])
            else:
                receive.delete()

            # Developed by Unknown: replaces an inline `IssueList` FIFO walk that only ever
            # touched `IssueList.quantity_toreturn` and never reconciled the Survey/Demand
            # cart rows behind the same issue - unlike `services.apply_return_for_spare`,
            # which the Return path already uses and which draws down both together (see
            # `services.apply_return_to_pending_row`). A receive settles an issue exactly as
            # much as a return does, so it now goes through the same centralized reconciler
            # rather than a second, less correct copy of it. This is a genuine behaviour fix,
            # not a pure refactor - see `test_receive_reconciles_survey_and_demand_carts_for_
            # the_same_issue` for the case the inline loop got wrong.
            services.apply_return_for_spare(post_receive.spare, quantity)

        return Response(
            {"post_receive": PostReceiveSerializer(post_receive).data},
            status=status.HTTP_201_CREATED,
        )


@tagged_viewset("OBS")
class PostReceiveViewSet(CleanValidationModelViewSet):
    queryset = PostReceive.objects.select_related(
        "issue_entry",
        "spare",
        "created_by_user",
    ).all()
    serializer_class = PostReceiveSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "spare__equipment_class__spare_class__department_id"


# ---------------------------------------------------------------------------------------
# OBS planning/requisition-support viewsets: `PlannedRoutineSpareListViewSet`,
# `SparesMappingViewSet`, `NotInCattedItemViewSet`.
#
# Folded in from the former `views/planning.py` during the obs package-consolidation
# pass.
# ---------------------------------------------------------------------------------------


@tagged_viewset("OBS")
class PlannedRoutineSpareListViewSet(CleanValidationModelViewSet):
    queryset = PlannedRoutineSpareList.objects.select_related(
        "planned_routine_description",
        "planned_routine_description__routine_description_id",
        "planned_routine_description__routine_description_id__routine_name",
    ).all()
    serializer_class = PlannedRoutineSpareListSerializer

    @action(detail=False, methods=["get"])
    def requisition(self, request):
        planned_description_id = request.query_params.get("planned_routine_description")
        planned_spares = self.get_queryset().filter(is_deleted=False)
        if planned_description_id:
            planned_spares = planned_spares.filter(
                planned_routine_description_id=planned_description_id,
            )
        patterns = list(planned_spares.values_list("pattern_number", flat=True))
        spares_qs = Spares.objects.filter(pattern_number__in=patterns)
        if not rbac.can_see_all_departments(request.user):
            own_department = rbac.department_of(request.user)
            spares_qs = (
                spares_qs.filter(
                    equipment_class__spare_class__department_id=own_department.pk
                )
                if own_department
                else spares_qs.none()
            )
        onboard_by_pattern = {
            spare.pattern_number: spare for spare in spares_qs
        }
        # Same field name/semantics as the existing WED-inventory-type lookup in
        # `ems.views` (routine planning payload) — `WLMSSpare.wlms_inventory` keyed by
        # `item_code`, matched here by the OBS pattern number so the requisition grid can show
        # whether/how this item is also classified in WED's own catalog.
        wed_by_pattern = {
            spare.item_code: spare
            for spare in WLMSSpare.objects.filter(item_code__in=patterns)
        }
        data = []
        for planned_spare in planned_spares:
            onboard_spare = onboard_by_pattern.get(planned_spare.pattern_number)
            wed_spare = wed_by_pattern.get(planned_spare.pattern_number)
            routine_description = planned_spare.planned_routine_description.routine_description_id
            data.append(
                {
                    "planned_spare_id": planned_spare.pk,
                    "pattern_number": planned_spare.pattern_number,
                    "quantity_required": planned_spare.quantity_required,
                    "onboard_spare": (onboard_spare.pk if onboard_spare else None),
                    "description": (onboard_spare.description if onboard_spare else ""),
                    "quantity_available": (
                        onboard_spare.quantity_available if onboard_spare else 0
                    ),
                    "available_onboard": bool(
                        onboard_spare
                        and onboard_spare.quantity_available
                        >= planned_spare.quantity_required
                    ),
                    "routine_name": (
                        str(routine_description.routine_name) if routine_description else ""
                    ),
                    "routine_no": (
                        routine_description.routine_no if routine_description else ""
                    ),
                    "routine_description": (
                        routine_description.routine_description if routine_description else ""
                    ),
                    "dart_number": (
                        routine_description.dart_number if routine_description else ""
                    ),
                    "wed_inventory_type": (
                        wed_spare.wlms_inventory if wed_spare else ""
                    ),
                }
            )
        return Response(data)

    def _planned_obs_entries(self, pk):
        # `pk` is a PlannedRoutineSpareList id for the real (only) caller of this helper
        # (OBS requisition-list "Delete" — sends `entry.id` = `planned_spare_id`). Check that
        # directly first: PlannedRoutineSpareList and Spares are separate auto-increment
        # sequences that commonly collide on small ids (e.g. both have a row with pk=1), and
        # checking Spares first — as this used to — silently resolves to the wrong table
        # whenever they collide, matching zero rows by an unrelated pattern_number and reporting
        # "not found" even though the intended row exists by pk. The Spares/pattern_number path
        # stays as a fallback for a `pk` that isn't a real PlannedRoutineSpareList row.
        direct = PlannedRoutineSpareList.objects.filter(pk=pk)
        if direct.exists():
            return direct
        spare = Spares.objects.filter(pk=pk).first()
        if spare:
            return PlannedRoutineSpareList.objects.filter(
                pattern_number__iexact=spare.pattern_number
            )
        return direct

    def _apply_requisition_change(self, request, *, soft_delete, defect):
        serializer = RequisitionDeleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        pk = serializer.validated_data["pk"]
        inventory_type = serializer.validated_data["inventory_type"]

        if defect:
            model_map = {
                "OBS": DartSpare,
                "PIL": DartSpare,
                "WED": DartWedSpare,
                "MO": DartMOSpare,
            }
            queryset = model_map[inventory_type].objects.filter(pk=pk)
            if soft_delete:
                affected = queryset.update(is_delete=True)
            else:
                affected, _ = queryset.delete()
        elif inventory_type in {"OBS", "PIL"}:
            queryset = self._planned_obs_entries(pk)
            if soft_delete:
                affected = queryset.update(is_deleted=True)
            else:
                affected, _ = queryset.delete()
        else:
            model_map = {
                "WED": PlannedWEDSpareList,
                "MO": PlannedMOSpareList,
            }
            queryset = model_map[inventory_type].objects.filter(pk=pk)
            if soft_delete:
                affected = queryset.update(is_deleted=True)
            else:
                affected, _ = queryset.delete()

        if not affected:
            return Response(
                {
                    "success": False,
                    "error": "Requisition spare not found",
                    "affected": 0,
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"success": True, "affected": affected})

    @action(detail=False, methods=["post"], url_path="delete-requisition-spare")
    def delete_requisition_spare(self, request):
        return self._apply_requisition_change(
            request,
            soft_delete=False,
            defect=False,
        )

    @action(detail=False, methods=["post"], url_path="delete-defect-requisition-spare")
    def delete_defect_requisition_spare(self, request):
        return self._apply_requisition_change(
            request,
            soft_delete=False,
            defect=True,
        )

    @action(detail=False, methods=["post"], url_path="soft-delete-after-cart")
    def soft_delete_after_cart(self, request):
        return self._apply_requisition_change(
            request,
            soft_delete=True,
            defect=False,
        )

    @action(detail=False, methods=["post"], url_path="soft-delete-after-cart-defect")
    def soft_delete_after_cart_defect(self, request):
        return self._apply_requisition_change(
            request,
            soft_delete=True,
            defect=True,
        )


@tagged_viewset("OBS")
class SparesMappingViewSet(CleanValidationModelViewSet):
    queryset = SparesMapping.objects.select_related(
        "equipment_class",
        "equipment",
        "section_name",
    ).all()
    serializer_class = SparesMappingSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    # NOTE: product decision, see PR description — SparesMapping has a second,
    # independently-nullable path to a department via section_name__department_id;
    # scoping on equipment_class only for now, matching every other Spares-adjacent
    # model in this app.
    department_scope_field = "equipment_class__spare_class__department_id"


@tagged_viewset("OBS")
class NotInCattedItemViewSet(CleanValidationModelViewSet):
    queryset = NotInCattedItem.objects.select_related("spare_id").all()
    serializer_class = NotInCattedItemSerializer
    filter_backends = [rbac.DepartmentScopedFilterBackend]
    permission_classes = [IsAuthenticated, rbac.DepartmentScopedObjectPermission]
    department_scope_field = "spare_id__equipment_class__spare_class__department_id"

    @action(detail=False, methods=["get"])
    def pending(self, request):
        queryset = self.filter_queryset(self.get_queryset()).filter(
            incatted_status=False,
            is_deleted=False,
        )
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=True, methods=["post"], url_path="mark-incatted")
    def mark_incatted(self, request, pk=None):
        item = self.get_object()
        item.incatted_status = True
        item.is_deleted = True
        item.save(update_fields=["incatted_status", "is_deleted"])
        return Response(self.get_serializer(item).data)
