"""The issue-to-cart cascade, import shortfall routing, spare purge, and the IIF gate.

Split out of the former flat `obs/services.py` (Part 1 of the obs file-structure split).

WHY THE CASCADE MOVED HERE. `Issue` -> `IssueList` -> `Survey`-or-`Demand` was written out
INLINE FOUR TIMES in the pre-split `views.py` - in `_create_pattern_issues`, `multi_issue`,
`initiate_survey` and `initiate_demand` - and factored into no helper. The import needed a
fifth, and the import's copy would necessarily have differed from the other four, so the
drift would have been immediate and by design. `backend\\CLAUDE.md` names this exact class
of duplication as the cause of past bugs in this codebase, and doctrine Section 5.2 assigns
"multi-step business operations that do not belong to a single serializer or view" to this
file. The four call sites now call `create_issue_with_cart_entry` and the fifth is the
import. One branch, one guard, five callers.

THE OUTER GUARD, decided rather than copied. The two full cascades carried
`if remarks not in {"TY LOAN", "OTHER"}` around the cart entry - a temporary loan or an
other-purpose issue produces the Issue and the IssueList and no cart row. Requirement 4.1
mentions no such exclusion. It is KEPT here, applied uniformly to all five callers, and it
is a no-op for the import: the import's remark is `IMPORT_SHORTFALL_ISSUE_REMARK`, which is
neither of those two words, so the import always gets its cart row. Keeping it means one
code path rather than one path with an import-shaped hole in it, and the four existing
callers keep their behaviour exactly.
"""

from collections import namedtuple

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Exists, OuterRef

from accounts import rbac
from accounts.models import CustomUserProfile

from ..models import (
    Demand,
    Issue,
    IssueList,
    NotInCattedItem,
    PostDemand,
    PostReceive,
    PostSurvey,
    Receive,
    Return,
    Spares,
    Survey,
)
from .import_rules import is_swmm_generated_pattern_number

# Developed by Unknown: The separator the reference application already uses when it joins a
# system-written remark onto a row's own remarks - `db\\excel_to_db.py` line 163,
# `combined_remarks += f" | {pattern_remarks}"`. Reproduced here rather than invented, so a
# spare carrying two system remarks reads the same way it always has.
REMARK_SEPARATOR = " | "

# Developed by Unknown: What goes into the imported spare's own REMARKS column, per clause
# 4.1's last bullet. The reference application's equivalent string is
# `' Onoard held quantity is less than authorised quantity.'` - with a leading space and
# `Onboard` misspelled (`db\\helper_issue.py` line 53). The MEANING is carried across. The
# leading space and the misspelling are not, and the substituted quantities are added,
# because a remark a storekeeper reads six months later should say how short the item was.
#
# Written in upper case because that is how it will be STORED. `Spares.uppercase_fields`
# includes `remarks`, so `UppercaseCleanMixin.clean()` upper-cases the whole column on every
# save - the workbook's own remark included. Writing it lower case here would only mean the
# source and the database disagreed about the same string.
IMPORT_SHORTFALL_SPARE_REMARK = (
    "FOUND SHORT AT IMPORT - HELD {held} AGAINST {authorised} AUTHORISED, "
    "SHORTFALL {delta}."
)

# Developed by Unknown: The Issue row's own remark. `initiate_survey` and `initiate_demand`
# already set `remarks="INITIATED FROM REQUISITION"` on a system-created Issue, so a
# system-written remark on this model is an existing precedent and this follows its shape.
# It is upper-cased on save by `UppercaseCleanMixin` either way, so it is written that way.
IMPORT_SHORTFALL_ISSUE_REMARK = "SHORT AT IMPORT"

# Developed by Unknown: What the Return tab shows in place of the issued-to name. Held here
# beside the flag it belongs to so the wording exists once, and exported to the front end
# through the API contract rather than being typed a second time in TypeScript.
IMPORT_SHORTFALL_ISSUED_TO_LABEL = "NA (recorded while import)"

NO_APPLICATION_ADMIN_MESSAGE = (
    "This sheet records a shortfall on one or more rows, and a shortfall has to be recorded "
    "against the application admin account so it can be taken back on charge from the Return "
    "tab. No account with the ADMIN or SHIPADMIN role could be found, so nothing has been "
    "imported. Ask the application administrator to sign in once, or to have an admin account "
    "created, and import again."
)


def append_remark(existing, addition):
    """Join a system-written remark onto whatever the row already carries.

    Returns `addition` alone where there is nothing to join it to, so a row with no remarks
    does not start with a separator.
    """
    existing = (existing or "").strip()
    addition = (addition or "").strip()
    if not addition:
        return existing
    if not existing:
        return addition
    return f"{existing}{REMARK_SEPARATOR}{addition}"


def application_admin_profile():
    """The `CustomUserProfile` an import-recorded shortfall Issue is assigned to.

    Requirement 4.2 forbids the reference application's `DEFAULT_USER` placeholder, and
    `DEFAULT_USER` does not exist anywhere in this codebase - so there is nothing to remove
    and nothing is added. What this returns is a REAL, already-existing account: the
    application admin, resolved through the role names `accounts.rbac` already declares rather
    than through a second literal written here.

    Returns `None` when no such account exists. It never creates one. The caller turns a
    `None` into a refusal of the whole file, which is deliberate - the reference application
    swallowed exactly this condition (`db\\excel_to_db.py` line 242's bare `except`) and
    reported a successful import in which every shortfall had silently failed to route.
    """
    return (
        CustomUserProfile.objects.filter(
            role_master__role_name__in=(rbac.ROLE_ADMIN, rbac.ROLE_ADMIN_LEGACY),
            user_active=True,
        )
        .order_by("pk")
        .first()
    )


def create_issue_with_cart_entry(
    *,
    spare,
    username,
    quantity,
    remarks,
    dart_number="",
    equipment=None,
    high_quantity_reason="",
    cart="auto",
    is_import_shortfall=False,
    is_iif=False,
    issued_to_unit="",
    # Developed with Understanding: the other-unit Ty Loan recipient (D6). None on every other path.
    issued_to_other_profile=None,
):
    """Create one `Issue`, its `IssueList` pending-return row, and its cart row.

    The single implementation of the cascade that the pre-split `views.py` previously
    repeated four times.

    `cart` selects which tail runs:
      - `"auto"`    - the full cascade. `IssueList` plus a `Demand` for a CONSUMABLE spare or
                      a `Survey` for anything else, subject to the TY LOAN / OTHER guard.
                      Used by `_create_pattern_issues`, `multi_issue` and the import.
      - `"survey"`  - `Survey` only, no `IssueList`. Used by `initiate_survey`.
      - `"demand"`  - `Demand` only, no `IssueList`. Used by `initiate_demand`.

    The category branch is `spare.category == Spares.CONSUMABLE`, tested on the mapped full
    word held on the saved model. QUASI-PERMANENT therefore routes to Survey with PERMANENT
    and RETURNABLE, which is what requirement 4.2's fourth category means - it is equivalent
    to permanent wherever category drives behaviour.

    Returns `(issue, cart_row)`, where `cart_row` is the `Survey` or `Demand` created, or
    `None` where the guard suppressed it.
    """
    issue = Issue.objects.create(
        spare=spare,
        equipment=equipment,
        username=username,
        quantity_issued=quantity,
        remarks=remarks,
        dart_number=dart_number,
        high_quantity_reason=high_quantity_reason,
        is_import_shortfall=is_import_shortfall,
        issued_to_unit=issued_to_unit,
        issued_to_other_profile=issued_to_other_profile,
    )

    if cart == "survey":
        return issue, Survey.objects.create(
            spare=spare,
            issue_entry=issue,
            quantity_tosurvey=quantity,
            dart_number=issue.dart_number,
            is_iif=is_iif,
        )
    if cart == "demand":
        return issue, Demand.objects.create(
            spare=spare,
            issue_entry=issue,
            quantity_todemand=quantity,
            dart_number=issue.dart_number,
            is_iif=is_iif,
        )

    # Developed by Unknown: The pending-return row. This is what the Return tab actually
    # lists - `IssueList` joined to `Issue`, not `obs_return`, which is the record of a
    # return that has already happened. Requirement 4.1's "the shortfall must also appear in
    # the Return tab" is satisfied by this row and by nothing else.
    IssueList.objects.create(
        issue_entry=issue,
        quantity_toreturn=quantity,
        dart_number=dart_number,
    )

    cart_row = None
    if (remarks or "").strip().upper() not in {"TY LOAN", "OTHER"}:
        if spare.category == Spares.CONSUMABLE:
            cart_row = Demand.objects.create(
                issue_entry=issue,
                spare=spare,
                quantity_todemand=quantity,
                dart_number=dart_number,
                is_iif=is_iif,
            )
        else:
            cart_row = Survey.objects.create(
                issue_entry=issue,
                spare=spare,
                quantity_tosurvey=quantity,
                dart_number=dart_number,
                is_iif=is_iif,
            )
    return issue, cart_row


# Developed by Unknown: What one routed shortfall did, returned to the commit loop so the
# response can say what was routed where without the loop having to work it out again.
ShortfallRouting = namedtuple("ShortfallRouting", ["cart", "is_iif"])


def route_import_shortfall(spare, *, admin_profile, ship_customer_code):
    """Route one imported spare's shortfall, or return `None` where there is no shortfall.

    Called once per COMMITTED row, inside the per-row savepoint `import_excel_commit_valid`
    already opens. It opens no transaction of its own - the docstring on that action explains
    why Postgres needs the savepoint, and a second transaction here would only nest inside it.

    Three things happen for one short row, and requirement 4.1 asks for all three:
      1. the quantity goes to the Survey cart or the Demand cart, by the spare's category
      2. the same quantity is listed in the Return tab, through `IssueList`
      3. the spare's own REMARKS records that it was found short at import

    A spare whose pattern number SWMM generated is additionally marked as an IIF item - the
    cart row carries `is_iif`, and a `NotInCattedItem` row is created so it appears in the
    Due for IIF cart. The quantity lives on the Survey or Demand row, because
    `NotInCattedItem` carries only a nullable spare and an incatted flag and no quantity
    field, and this change adds none.
    """
    delta = (spare.quantity_authorised or 0) - (spare.quantity_available or 0)
    if delta <= 0:
        return None

    # Developed by Unknown: The caller resolves the admin account before the loop and refuses
    # the whole file when it is missing, so this can only be reached if a row turns out short
    # that the pre-count did not see. It fails the ROW rather than writing an Issue with no
    # user - `Issue.username` is non-nullable and the alternative is an IntegrityError and a
    # 500. The caller's `except (DRFValidationError, DjangoValidationError)` counts it as
    # skipped and the row's savepoint rolls the spare back with it.
    if admin_profile is None:
        raise DjangoValidationError({"__all__": [NO_APPLICATION_ADMIN_MESSAGE]})

    is_iif = is_swmm_generated_pattern_number(
        spare.pattern_number, ship_customer_code
    )

    _issue, cart_row = create_issue_with_cart_entry(
        spare=spare,
        username=admin_profile,
        quantity=delta,
        remarks=IMPORT_SHORTFALL_ISSUE_REMARK,
        is_import_shortfall=True,
        is_iif=is_iif,
    )

    if is_iif:
        # Developed by Unknown: The Due for IIF cart has had a model, a department-scoped
        # viewset, a read endpoint, a mark-resolved endpoint and a screen since before this
        # change, and NOTHING in production code ever created a row in it. This is the first
        # path that feeds it.
        NotInCattedItem.objects.create(spare_id=spare, incatted_status=False)

    spare.remarks = append_remark(
        spare.remarks,
        IMPORT_SHORTFALL_SPARE_REMARK.format(
            held=spare.quantity_available,
            authorised=spare.quantity_authorised,
            delta=delta,
        ),
    )
    spare.save(update_fields=["remarks"])

    cart = "demand" if spare.category == Spares.CONSUMABLE else "survey"
    return ShortfallRouting(cart if cart_row is not None else None, is_iif)


def _release_iif_marker(spare):
    """Drop a spare out of the Due for IIF cart once nothing is outstanding against it.

    `NotInCattedItem` carries no quantity and no link to an issue or a cart row - it is a
    (spare, incatted_status, is_deleted) triple - so it cannot take a partial deduction. The
    real IIF quantity lives on the sibling `is_iif` Survey or Demand row, which
    `apply_return_to_pending_row` has already reduced by the time this runs. All that is left
    to decide here is whether the marker still means anything, and it does not once no
    `is_iif` cart row and no pending-return row survives for the spare.

    Only `is_deleted` is set. NOT `incatted_status`, which `mark_incatted` sets when an
    operator really has IIF'd the item - writing it here would record that a catalogue action
    had happened when what actually happened is that the item came back on charge.
    `NotInCattedItemViewSet.pending` filters on both, so `is_deleted` alone is enough to clear
    the row from the cart.

    Returns the number of markers released.
    """
    if spare is None:
        return 0

    still_awaiting = (
        Survey.objects.filter(spare=spare, is_iif=True).exists()
        or Demand.objects.filter(spare=spare, is_iif=True).exists()
        or IssueList.objects.filter(issue_entry__spare=spare).exists()
    )
    if still_awaiting:
        return 0

    return NotInCattedItem.objects.filter(spare_id=spare, is_deleted=False).update(
        is_deleted=True
    )


def apply_return_to_pending_row(issue_list, quantity_returned):
    """Take `quantity_returned` off ONE pending-return row and its Internal Transactions cart.

    The accounting half of a return; `Return.save()` owns the stock half. Called by
    `ReturnViewSet.perform_create` with the row the storekeeper actually acted on, which is
    the whole point - a return settles one issue to one holder, and matching by spare alone
    (which is what `Return.save()` used to do) closed whichever row happened to be oldest.

    Requirement F-07's rule, now applied to EVERY issue rather than only import shortfalls:
    return 3 of 8 and the Survey or Demand row drops to 5; return all 8 and the row is
    removed, because the item is no longer awaiting survey or demand - it is back on charge.
    The previous version of this function was deliberately narrowed to
    `is_import_shortfall` rows on the grounds that nobody had asked for the general case. That
    is no longer true: an item taken back on charge must not still be queued for survey or
    demand, whatever put it on issue.

    A Ty Loan has no cart row at all (`create_issue_with_cart_entry`'s TY LOAN / OTHER guard),
    so for those this reduces the pending-return row and finds nothing to reconcile, which is
    correct.

    Returns the quantity actually taken, which is capped at what the row still owes.
    """
    if issue_list is None or quantity_returned <= 0:
        return 0

    taken = min(quantity_returned, issue_list.quantity_toreturn)
    if taken <= 0:
        return 0

    issue = issue_list.issue_entry

    # Developed by Unknown: the cap is across BOTH carts, not per cart. One issue normally has
    # a Survey or a Demand and never both - `create_issue_with_cart_entry` routes by category -
    # but `SurveyViewSet.complete` mints a Demand against the same issue as the Survey it draws
    # down, so both can exist for one issue. Subtracting `taken` from each independently (which
    # is what this loop did before) would then take the quantity off twice and empty a cart the
    # ship still owes. Survey first, because that is the earlier stage of the same lifecycle.
    outstanding = taken
    for cart_model, quantity_field in (
        (Survey, "quantity_tosurvey"),
        (Demand, "quantity_todemand"),
    ):
        if outstanding <= 0:
            break
        for cart_row in cart_model.objects.select_for_update().filter(issue_entry=issue):
            if outstanding <= 0:
                break
            pending = getattr(cart_row, quantity_field) - outstanding
            if pending > 0:
                outstanding = 0
                setattr(cart_row, quantity_field, pending)
                cart_row.save(update_fields=[quantity_field])
            else:
                # The whole cart quantity is back on charge, so the row is no longer shown -
                # which for these two carts means it no longer exists. `pending` being negative
                # means the row held less than was returned; the remainder carries to the next
                # cart rather than being taken twice.
                outstanding = -pending
                cart_row.delete()

    if taken >= issue_list.quantity_toreturn:
        issue_list.delete()
    else:
        issue_list.quantity_toreturn -= taken
        issue_list.save(update_fields=["quantity_toreturn"])

    _release_iif_marker(issue.spare)
    return taken


def apply_return_for_spare(spare, quantity_returned):
    """Oldest-first fallback for a return that did not name a pending row.

    `ReturnSerializer.issue_list_id` is optional so that any caller of the plain `return/`
    endpoint keeps working; the Return screen always sends it. Without it there is nothing to
    identify the holder, so this reproduces the historical behaviour - draw down this spare's
    pending rows oldest first - and routes each one through the same reconciler above so the
    carts are still settled.

    Returns the total quantity taken.
    """
    if spare is None or quantity_returned <= 0:
        return 0

    remaining = quantity_returned
    reconciled = 0
    issue_lists = (
        IssueList.objects.select_for_update()
        .filter(issue_entry__spare=spare)
        .select_related("issue_entry")
        .order_by("id")
    )
    for issue_list in issue_lists:
        if remaining <= 0:
            break
        taken = apply_return_to_pending_row(issue_list, remaining)
        remaining -= taken
        reconciled += taken

    return reconciled


# =====================================================================================
# Developed by Unknown: CLEARING SAVED SPARES
# =====================================================================================
#
# Requirement - after a test import, or after a workbook imported wrongly, the operator must
# be able to empty the Ship Inventory and import again. A Head of Department clears his own
# department. The application administrator clears the whole table.
#
# THIS IS A TRUE WIPE, and it has to be, because the alternative does not work. Seven models
# hold a PROTECT foreign key to `Spares` - Issue, Survey, PostSurvey, Demand, PostDemand,
# Receive and PostReceive - so a spare that has ever been issued, surveyed, demanded or
# received simply refuses to delete. Skipping those would leave the table non-empty and its
# pattern numbers still taken, so the re-import the operator is trying to perform would then
# collide with the very rows they were trying to remove.
#
# `Spares` carries no `is_deleted`, so there is no soft-delete escape either.
#
# The order below is not arbitrary. It is the reverse of the dependency graph, and every step
# is forced by a real constraint:
#   IssueList  PROTECTs Issue          -> before Issue
#   Receive    PROTECTs PostDemand     -> before PostDemand
#   Demand     PROTECTs PostSurvey     -> before PostSurvey
#   all seven  PROTECT  Spares         -> before Spares
# `RoutineSpareUsage` CASCADEs and needs no step of its own.
DELETION_REPORT_FIELDS = (
    "spares",
    "issues",
    "issue_lists",
    "surveys",
    "post_surveys",
    "demands",
    "post_demands",
    "receives",
    "post_receives",
    "not_in_catted",
    "returns",
)


def _detach_set_default_references(spare_ids, issue_ids):
    """Developed by Unknown: null the foreign keys that would otherwise crash the delete.

    Five columns across the `ilms` app point at `obs.Spares` or `obs.Issue` with
    `on_delete=SET_DEFAULT, default=""`. That default is a LATENT BUG that predates this
    change - `""` is not a valid primary key, so when Django's collector applies it the delete
    fails. Every one of the five is `null=True`, so nulling them here means the collector finds
    nothing left to apply the default to.

    This is deliberately narrow. It nulls a reference to a spare that is going away, which is
    what SET_NULL would have done had the field been declared that way. It deletes no `ilms`
    row and touches no other column.
    """
    from ilms.models import IIF, DartMOSpare, DemandDetails, PTSDetails, SurveyDetails

    for model in (SurveyDetails, PTSDetails, DemandDetails):
        model.objects.filter(obs_spare_id__in=spare_ids).update(obs_spare_id=None)
    IIF.objects.filter(spare_id__in=spare_ids).update(spare_id=None)
    DartMOSpare.objects.filter(issue_obj__in=issue_ids).update(issue_obj=None)


def purge_spares(queryset):
    """Developed by Unknown: delete every spare in `queryset` and every transaction record
    that hangs off it, inside one transaction. Returns a count per model.

    `queryset` is the scope and is the ONLY thing that decides what goes - the caller passes
    the whole table for an administrator, or one department's spares for a Head of Department.
    Scoping is not repeated here, so there is one place that decides it.

    Nothing is recoverable afterwards. The caller is responsible for having asked.
    """
    from django.db import transaction

    spare_ids = list(queryset.values_list("pk", flat=True))
    report = dict.fromkeys(DELETION_REPORT_FIELDS, 0)
    if not spare_ids:
        return report

    with transaction.atomic():
        issue_ids = list(
            Issue.objects.filter(spare_id__in=spare_ids).values_list("pk", flat=True)
        )
        _detach_set_default_references(spare_ids, issue_ids)

        # Developed by Unknown: IssueList hangs off Issue, not off Spares, so it is scoped by
        # the issues being removed rather than by the spares.
        report["issue_lists"] = IssueList.objects.filter(
            issue_entry_id__in=issue_ids
        ).delete()[0]

        for key, model in (
            ("receives", Receive),
            ("post_receives", PostReceive),
            ("post_demands", PostDemand),
            ("demands", Demand),
            ("post_surveys", PostSurvey),
            ("surveys", Survey),
        ):
            report[key] = model.objects.filter(spare_id__in=spare_ids).delete()[0]

        report["issues"] = Issue.objects.filter(pk__in=issue_ids).delete()[0]

        # Developed by Unknown: both SET_NULL, so they would survive the delete as orphans
        # pointing at nothing. They describe a spare that no longer exists, so they go too.
        report["not_in_catted"] = NotInCattedItem.objects.filter(
            spare_id__in=spare_ids
        ).delete()[0]
        report["returns"] = Return.objects.filter(spare_id__in=spare_ids).delete()[0]

        report["spares"] = Spares.objects.filter(pk__in=spare_ids).delete()[0]

    return report


# Developed by Unknown: THE IIF GATE.
#
# The single definition of "this spare is awaiting INcatting". Five call sites across three
# apps read it - the two queue viewsets, both queue serializers and the two shore-side
# `bulk-create-from-obs` cart endpoints - so the grid, the DART refusal and the cart refusal
# cannot disagree with each other about the same spare.
#
# The test is THE EXISTENCE OF AN OPEN `NotInCattedItem` ROW for the spare, and it is
# deliberately none of the three things it could plausibly have been:
#
#   - NOT `Survey.is_iif` / `Demand.is_iif`. Those are set True on the import-shortfall path
#     only - every other caller of `create_issue_with_cart_entry` omits the argument and it
#     defaults False - so a spare that IS an IIF item, issued through the ordinary issue
#     screen, produces a queue row carrying `is_iif=False` and showing `INcatting Status: OK`
#     while an open IIF row for the same spare sits there unresolved. A gate on `is_iif`
#     would be blind to exactly the case the gate exists for.
#   - NOT `is_iif_sync`, which is declared, serialized, typed and read by nothing. It carries
#     no part of any rule. It is neither built on here nor removed.
#   - NOT a pattern-number prefix test against the ship's customer code. A prefix says how a
#     pattern number was MINTED. The open IIF row says whether it has been RESOLVED, and
#     `update_pattern` closes the second without touching the first - so a prefix gate would
#     hold a corrected spare for ever. A customer code is also ship data and must never be
#     reproduced as a literal in application code.
#
# Nothing here writes. The gate reads the same two flags `NotInCattedItemViewSet.pending`
# already reads, so release is automatic: the moment `update_pattern` flags the open rows
# resolved, every one of the five call sites sees the spare as clear on its next read, with
# no second release mechanism to keep in step.
OPEN_IIF_RECORD_FILTER = {"incatted_status": False, "is_deleted": False}

# Developed by Unknown: the operator's own words, taken from the application rather than
# invented. `Not INcatted` is the second half of the sidebar item the refusal sends them to,
# and it is the answer the `INcatting Status` column asks for.
AWAITING_INCATTING_TERM = "Not INcatted"
AWAITING_INCATTING_DESTINATION = "Due for IIF - Not INcatted Items"

# Developed by Unknown: THE ORIGIN MARKER FOR A DART RAISED FROM DUE FOR SURVEY OR DUE FOR
# DEMAND, and the reason the storekeeper's `Maintainer Spare Request - Defect DART` list stops
# showing spares that were already issued and already consumed.
#
# `SparesViewSet.defect_requisition` returns EVERY `dart.DartSpare` row with `is_delete=False`
# and applies no filter on origin, so a DART raised from either queue screen has always landed
# in the maintainer's request list - a request for spares the ship already holds no more of.
# Filtering that list on `inventory_type != "OBS"` cannot work, because the maintainer's own
# defect form and the Multi DART screen both write the literal `"OBS"` for a ship-inventory
# spare too. A finer value is needed, and this is it.
#
# It is written INSTEAD of `"OBS"` at the two sites that raise a DART for a queue selection -
# `_raise_dart_for_rows` in `views/spares_core.py`, and `dart.views.InitiateDartAPIView.post`
# when the seeded DART form posts a row carrying it. Both must agree or the leak simply moves
# from one path to the other.
#
# NO MIGRATION. `dart.DartSpare.inventory_type` is `CharField(max_length=255, null=True,
# blank=True)` with no `choices=` and no database constraint, and no reader anywhere in the
# back end compares a STORED `inventory_type` against `"OBS"` - every such comparison is
# against request payload data. The value must simply stay outside the four
# `RequisitionDeleteSerializer` accepts, `{"OBS", "PIL", "WED", "MO"}`, so the existing delete
# control keeps resolving the right model.
#
# NO BACKFILL. Rows written before this change carry `"OBS"` and cannot be told apart from a
# maintainer's without a heuristic. They stay visible in the maintainer's list and age out
# through that screen's own delete control, which keeps working unchanged.
OBS_INTERNAL_INVENTORY_TYPE = "OBS_INTERNAL"


def open_iif_exists(spare_field="spare"):
    """`Exists()` subquery - True when `spare_field`'s spare has an unresolved IIF record.

    Returned as a subquery so a list endpoint annotates it once inside its own SELECT.
    Evaluating the same question per row with `.exists()` would be an N+1 across a queue of
    any size, which is why this is a subquery factory rather than a plain predicate.

    `spare_field` is the path from the annotated model to `obs.Spares` - "spare" on both
    `Survey` and `Demand`.
    """
    return Exists(
        NotInCattedItem.objects.filter(
            spare_id=OuterRef(spare_field),
            **OPEN_IIF_RECORD_FILTER,
        )
    )


def spare_is_awaiting_incatting(spare_id):
    """Single-row form of `open_iif_exists`, for a caller holding one spare and no queryset.

    Used only as the serializer's fallback when it is handed an instance that was never
    annotated. It answers honestly with one query rather than returning a convenient `False`.
    """
    if spare_id is None:
        return False
    return NotInCattedItem.objects.filter(
        spare_id=spare_id,
        **OPEN_IIF_RECORD_FILTER,
    ).exists()


def patterns_awaiting_incatting(pattern_numbers):
    """The subset of `pattern_numbers` whose onboard spare has an unresolved IIF record.

    One query whatever the size of the batch. Pattern numbers are compared upper-cased
    because `Spares` stores them upper-cased through `UppercaseCleanMixin`, and the result is
    sorted and de-duplicated so a refusal message names each offending spare once, in a
    stable order the operator can scan.
    """
    cleaned = {
        str(value).strip().upper()
        for value in pattern_numbers
        if str(value or "").strip()
    }
    if not cleaned:
        return []
    return sorted(
        Spares.objects.filter(
            pattern_number__in=cleaned,
            not_in_catted_items__incatted_status=False,
            not_in_catted_items__is_deleted=False,
        )
        .values_list("pattern_number", flat=True)
        .distinct()
    )


def awaiting_incatting_message(patterns, next_step):
    """The one refusal sentence, so all four gated endpoints speak with one voice.

    It names the state, names every offending pattern number, names the screen that releases
    them and the action that does it, names the step the operator was trying to take, and
    then says plainly that nothing was written - because the gate refuses the whole request
    rather than the offending rows alone.
    """
    listed = ", ".join(patterns)
    return (
        f"{AWAITING_INCATTING_TERM} - {listed}. "
        f"Resolve the pattern number in {AWAITING_INCATTING_DESTINATION} first, then {next_step}. "
        "Nothing in this request has been actioned."
    )
