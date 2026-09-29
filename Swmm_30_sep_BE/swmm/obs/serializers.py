from accounts import rbac
from accounts.models import CustomUserProfile, OtherCustomUserProfile
from master.models import Ship, SubDepartment
from op_maintenance.models import InitiateDart
from rest_framework import serializers

from .models import (
    HIGH_HOLDING_QUANTITY_THRESHOLD,
    HIGH_HOLDING_REASON_MESSAGE,
    HIGH_HOLDING_REASON_MIN_LENGTH,
    Authority,
    Demand,
    Denomination,
    EquipmentClass,
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
    SpareClass,
    Spares,
    SparesMapping,
    Survey,
)


class UppercaseFieldsSerializerMixin:
    def to_internal_value(self, data):
        data = data.copy()
        uppercase_fields = getattr(self.Meta.model, "uppercase_fields", ())
        for field_name in uppercase_fields:
            value = data.get(field_name)
            if isinstance(value, str):
                data[field_name] = value.upper()
        return super().to_internal_value(data)


# Developed with Understanding: the two Issue.remarks values the Issuing To rules turn on.
# They are the stored strings of R2-1 and are compared stripped and upper-cased, the way
# `create_issue_with_cart_entry` already tests TY LOAN (D10). No reason list is added.
TY_LOAN_REMARKS = "TY LOAN"
DEFECT_REMARKS = "DEFECT"
# Developed with Understanding: the role text shown for every other-unit person. Display
# only - no Role row is created or assigned (D5, Q9).
OTHER_UNIT_ROLE_LABEL = "GUEST"


# Developed with Understanding: the own-ship personnel a DEFECT issue may go to (D5, Q3,
# Q4). One queryset for both the Defect picker list and the multi-issue check, so the two
# cannot disagree. No has_credentials filter, because HRCDF-synced crew have none.
def defect_issue_profiles():
    """Own-ship profiles still on the ship's active roll."""
    return CustomUserProfile.objects.filter(
        user_active=True,
        ship_leaving_date__isnull=True,
    )


# Developed with Understanding: the other-unit personnel a TY LOAN may go to (D19). Shared
# by the Ty Loan picker, its filter options and the multi-issue check.
def current_other_unit_profiles():
    """Other-unit profiles that still belong to another unit."""
    return OtherCustomUserProfile.objects.filter(is_current_other_unit=True)


# Developed with Understanding: NAME of an other-unit person - full_name, else first and last name.
def other_unit_name(profile):
    full_name = (profile.full_name or "").strip()
    if full_name:
        return full_name
    return f"{profile.firstname or ''} {profile.lastname or ''}".strip()


# Developed with Understanding: DESIGNATION of an other-unit person - the HRCDF
# designationIdm, else the local designation text.
def other_unit_designation(profile):
    hrcdf_designation = (profile.hrcdf_designation or "").strip()
    return hrcdf_designation or (profile.designation or "").strip()


# Developed with Understanding: the D5 option label for an other-unit person, in the fixed
# order NAME | PERSONAL NO | SHIP NAME | DESIGNATION | ROLE. SHIP NAME is the section
# column, which holds the HRCDF unitName. Blank parts are dropped, as the front end's
# obsUserOptionLabel already does.
def other_unit_label(profile):
    parts = (
        other_unit_name(profile),
        profile.personal_number or "",
        profile.section or "",
        other_unit_designation(profile),
        OTHER_UNIT_ROLE_LABEL,
    )
    return " | ".join(part.strip() for part in parts if part and part.strip())


def _validate_owned_department(serializer, department):
    """Shared by SpareClassSerializer/DenominationSerializer's
    `validate_department` — a non-privileged user may only create/assign
    a record in their own department; a privileged user may set any
    department (or leave it unset, where nullable)."""
    request = serializer.context.get("request")
    user = getattr(request, "user", None) if request else None
    if department is None or rbac.can_see_all_departments(user):
        return department
    own_department = rbac.department_of(user)
    if own_department is None or department.pk != own_department.pk:
        raise serializers.ValidationError(
            "You may not assign this to another department."
        )
    return department


# Developed by Unknown (merge note): source's `SparesSerializer.validate_sub_department`
# calls `rbac.is_sub_department_confined(user)` / `rbac.own_sub_department_row(user)`,
# neither of which exists under those names in target's `accounts.rbac`. Target's rbac
# exposes the same underlying capability under different names -
# `is_executive_dy_hod(user)` (a DY HOD confined to one EXECUTIVE sub-department) and
# `executive_sub_department_of(user)` (that sub-department's free-text name) - so these two
# small helpers bridge to a real `master.SubDepartment` row rather than stubbing anything
# out; no accounts/ change was needed or made.
def _is_sub_department_confined(user):
    return rbac.is_executive_dy_hod(user)


def _own_sub_department_row(user):
    name = rbac.executive_sub_department_of(user)
    if not name:
        return None
    department = rbac.department_of(user)
    queryset = SubDepartment.objects.filter(name__iexact=name)
    if department is not None:
        queryset = queryset.filter(department_name_id=department.pk)
    return queryset.first()


class SpareClassSerializer(
    UppercaseFieldsSerializerMixin,
    serializers.ModelSerializer,
):
    class Meta:
        model = SpareClass
        fields = ("id", "name", "department")

    def validate_department(self, department):
        return _validate_owned_department(self, department)


class EquipmentClassSerializer(
    UppercaseFieldsSerializerMixin,
    serializers.ModelSerializer,
):
    class Meta:
        model = EquipmentClass
        fields = ("id", "name", "spare_class")

    def validate_spare_class(self, spare_class):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if request is None or rbac.can_see_all_departments(user):
            return spare_class
        own_department = rbac.department_of(user)
        department = getattr(spare_class, "department", None)
        if own_department is None or department is None or department.pk != own_department.pk:
            raise serializers.ValidationError(
                "You may not attach this to another department's spare class."
            )
        return spare_class

    # Developed by Unknown: The unique-per-department rule, said in words at the field.
    #
    # `EquipmentClass.Meta.constraints` already carries
    # `obs_equipmentclass_unique_name_per_department`, so the database refuses a duplicate
    # whatever any caller does. That refusal is an `IntegrityError` naming a constraint, which
    # is the wrong thing to put in front of a rating who has just typed a name into a form -
    # WCAG 3.3.3 asks for the FIX, not only the failure. This check runs first and produces a
    # 400 at the `name` field naming the spare class the name is already held under, so the
    # operator can go and reuse that one instead of inventing a second spelling. The constraint
    # stays exactly where it is and is not relied on for the message.
    #
    # Guarded on a known department: a spare class with no department is unconstrained in the
    # database, because Postgres treats NULLs in a unique index as distinct, and this check
    # must not be stricter than the constraint it explains.
    def validate(self, attrs):
        attrs = super().validate(attrs)
        spare_class = attrs.get("spare_class") or getattr(self.instance, "spare_class", None)
        name = (attrs.get("name") or getattr(self.instance, "name", "") or "").strip().upper()
        if spare_class is None or not name or spare_class.department_id is None:
            return attrs
        # Matched through `spare_class__department_id` and NOT through the derived `department`
        # column: that column is nullable until the CP-08 backfill has run, and a row it has
        # not reached yet would otherwise slip past this check and hit the database instead.
        clashes = EquipmentClass.objects.filter(
            name__iexact=name, spare_class__department_id=spare_class.department_id
        ).select_related("spare_class")
        if self.instance is not None:
            clashes = clashes.exclude(pk=self.instance.pk)
        existing = clashes.first()
        if existing is not None:
            raise serializers.ValidationError(
                {
                    "name": [
                        f"{name} is already an equipment class in this department, under the "
                        f"spare class {existing.spare_class.name}. An equipment class name is "
                        "used once per department - use that one rather than creating a second "
                        "spelling of the same equipment."
                    ]
                }
            )
        return attrs


class DenominationSerializer(
    UppercaseFieldsSerializerMixin,
    serializers.ModelSerializer,
):
    class Meta:
        model = Denomination
        fields = ("id", "name", "department")

    def validate_department(self, department):
        return _validate_owned_department(self, department)


class AuthoritySerializer(
    UppercaseFieldsSerializerMixin,
    serializers.ModelSerializer,
):
    class Meta:
        model = Authority
        fields = ("id", "name")


class SparesSerializer(UppercaseFieldsSerializerMixin, serializers.ModelSerializer):
    # Declared explicitly: the model field is `blank=False`, so DRF's default
    # `allow_blank=False` already applies, but leaving it implicit meant an omitted
    # description passed straight through `is_valid()` and only failed later, inside
    # `Spares.full_clean()` via `CleanValidationMixin` — a messier error shape than a
    # normal field error.
    description = serializers.CharField(
        max_length=1000, required=True, allow_blank=False
    )

    class Meta:
        model = Spares
        fields = (
            "id",
            "equipment_class",
            # Developed by Unknown: The Executive sub-department the spare belongs to. Nullable
            # and optional, so every existing client that posts this serializer's body without it
            # is unaffected - Add Spare, Edit Spare and `increase-holding` all continue to work
            # unchanged and simply leave it NULL. The import is the one path that sets it, from
            # the chooser on the form rather than from a workbook column.
            "sub_department",
            "pattern_number",
            "description",
            "category",
            "critical",
            "criticality_strength",
            "compartment",
            "location",
            "rack_position",
            "rack_number",
            "denomination",
            "quantity_authorised",
            "quantity_available",
            "authority",
            "page",
            "line",
            "remarks",
            "mo_demand_number",
            "image",
            "is_obs",
        )
        # `pattern_number` needs no explicit `required=False` here — the model field
        # is `SlugField(default="", blank=True)`, which DRF already maps to
        # `required=False, allow_blank=True` on its own (see
        # `rest_framework.utils.field_mapping.get_field_kwargs`).
        read_only_fields = ("criticality_strength",)

    def validate_equipment_class(self, equipment_class):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if rbac.can_see_all_departments(user):
            return equipment_class
        own_department = rbac.department_of(user)
        department = getattr(equipment_class.spare_class, "department", None)
        if (
            own_department is None
            or department is None
            or department.pk != own_department.pk
        ):
            raise serializers.ValidationError(
                "You may not attach a spare to another department's equipment class."
            )
        return equipment_class

    # Developed by Unknown: The sub-department counterpart of `validate_equipment_class` above,
    # and it refuses the same way. A caller confined to one Executive sub-department may not
    # attach a spare to another one - the confinement is what makes the Hull Maintenance Officer's
    # inventory theirs rather than merely filtered to them. The department half of the check lives
    # on the model (`Spares.clean`), because it must hold on the paths that never touch this
    # serializer too.
    def validate_sub_department(self, sub_department):
        if sub_department is None:
            return sub_department
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if not _is_sub_department_confined(user):
            return sub_department
        own = _own_sub_department_row(user)
        if own is None or own.pk != sub_department.pk:
            raise serializers.ValidationError(
                "You may not attach a spare to another sub-department."
            )
        return sub_department

    def validate(self, attrs):
        # Only the single-spare Add/Edit paths enforce this — bulk Excel import
        # (`excel.py`'s `import_excel`, and `import_excel_preview`/
        # `import_excel_commit_valid` in views.py) all reuse this same serializer to
        # validate rows, and the reference app never applies this rule there; a
        # storekeeper can't type a written reason per row of a spreadsheet. Those
        # call sites pass `skip_high_holding_check=True` in the serializer context.
        if self.context.get("skip_high_holding_check"):
            return attrs

        quantity_authorised = attrs.get(
            "quantity_authorised",
            getattr(self.instance, "quantity_authorised", 0) or 0,
        )
        remarks = (
            attrs.get("remarks", getattr(self.instance, "remarks", "") or "") or ""
        ).strip()
        if (
            quantity_authorised > HIGH_HOLDING_QUANTITY_THRESHOLD
            and len(remarks) < HIGH_HOLDING_REASON_MIN_LENGTH
        ):
            raise serializers.ValidationError(
                {
                    "remarks": [
                        HIGH_HOLDING_REASON_MESSAGE.format(quantity=quantity_authorised)
                    ]
                }
            )
        return attrs


# Developed by Unknown: `SparesSerializer` plus the shortfall annotated by
# `SparesQuerySet.d787j_deficiencies()`. Kept as a subclass used by the D787J Deficiency
# endpoint alone, so no other consumer of `SparesSerializer` sees a changed payload.
class SparesDeficiencySerializer(SparesSerializer):
    deficiency_quantity = serializers.IntegerField(read_only=True)

    class Meta(SparesSerializer.Meta):
        fields = SparesSerializer.Meta.fields + ("deficiency_quantity",)
        read_only_fields = SparesSerializer.Meta.read_only_fields + (
            "deficiency_quantity",
        )


class RoutineSpareUsageSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoutineSpareUsage
        fields = (
            "id",
            "routine",
            "routine_description",
            "spare",
            "quantity_used",
            "date_used",
        )


class IssueSerializer(UppercaseFieldsSerializerMixin, serializers.ModelSerializer):
    # Developed by Unknown: `is_import_shortfall` is read-only and exists so the Return tab
    # can MASK the issued-to name. An import shortfall is recorded against the application
    # admin account because `Issue.username` is non-nullable and the Return tab reads
    # `IssueList` joined to `Issue` - but nobody was issued anything, so showing that account
    # as the holder would be a false statement on an inventory screen. The front end reads
    # this flag and prints "NA (recorded while import)" instead.
    #
    # It is added to the EXISTING serializer rather than to a new one because every consumer
    # of an Issue needs the same masking - `sparesissued_tomaintainers/`, the Ty Loan pair
    # endpoint and `spares/{id}/history/` all serialise Issue rows through this class. Adding
    # a field is additive, so no existing consumer breaks.
    # Developed with Understanding: the Ty Loan recipient label in the D5 order, blank when
    # no other-unit person is linked (Q12). Read-only, like the link itself.
    issued_to_other_label = serializers.SerializerMethodField()

    class Meta:
        model = Issue
        fields = (
            "id",
            "spare",
            "equipment",
            "date_of_issue",
            "username",
            "quantity_issued",
            "issue_time",
            "remarks",
            "dart_number",
            "issued_to_unit",
            "is_import_shortfall",
            # Developed with Understanding: the other-unit Ty Loan recipient pk (D6).
            "issued_to_other_profile",
            "issued_to_other_label",
        )
        # Developed with Understanding: issued_to_other_profile is read-only here so a plain
        # POST to issues/ cannot link a person past the multi-issue rules (Q10).
        read_only_fields = ("is_import_shortfall", "issued_to_other_profile")

    # Developed with Understanding: reads the select_related person, so no extra query per row.
    def get_issued_to_other_label(self, obj):
        profile = obj.issued_to_other_profile
        return other_unit_label(profile) if profile is not None else ""


class IssueListSerializer(
    UppercaseFieldsSerializerMixin,
    serializers.ModelSerializer,
):
    class Meta:
        model = IssueList
        fields = ("id", "issue_entry", "quantity_toreturn", "dart_number")


class ReturnSerializer(UppercaseFieldsSerializerMixin, serializers.ModelSerializer):
    ship_id = serializers.PrimaryKeyRelatedField(
        source="ship",
        queryset=Ship.objects.all(),
        allow_null=True,
        required=False,
    )
    # Developed by Unknown: WHICH pending-return row this return settles.
    #
    # `Return` has no column for it and gains none - the row is consumed by
    # `ReturnViewSet.perform_create` and never stored, so this is write-only and needs no
    # migration. It exists because a return is one movement against one issue: without it the
    # only thing identifying the movement is the spare, and a spare can be out on issue to
    # several people at once, so the drawdown could only ever guess (it took the oldest row,
    # which is how one maintainer's return came to close another's).
    #
    # Optional, not required: the plain `return/` endpoint is a generic ModelViewSet route and
    # anything already posting to it keeps working, falling back to the historical oldest-first
    # behaviour in `services.apply_return_for_spare`. The Return screen always sends it.
    issue_list_id = serializers.PrimaryKeyRelatedField(
        queryset=IssueList.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Return
        fields = (
            "id",
            "spare_id",
            "command_id",
            "ship_id",
            "username",
            "returned_by",
            "remarks",
            "quantity_returned",
            "return_time",
            "issue_list_id",
        )
        read_only_fields = ("returned_by",)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        issue_list = attrs.get("issue_list_id")
        if issue_list is None:
            return attrs

        quantity = attrs.get("quantity_returned") or 0
        # Developed by Unknown: the ONLY ceiling this path had was `Return.save()`'s
        # "would exceed authorised stock", which is a different question - it caps the shelf,
        # not the debt. Without this you could return five against a row that owed two and the
        # surplus would silently become stock the ship was never issued.
        if quantity > issue_list.quantity_toreturn:
            raise serializers.ValidationError(
                {
                    "quantity_returned": (
                        f"Only {issue_list.quantity_toreturn} left to return against this "
                        f"issue."
                    )
                }
            )

        spare = attrs.get("spare_id")
        if spare is not None and issue_list.issue_entry.spare_id != spare.pk:
            raise serializers.ValidationError(
                {
                    "issue_list_id": (
                        "This pending-return entry belongs to a different spare."
                    )
                }
            )
        return attrs

    def create(self, validated_data):
        # `issue_list_id` names the row this return settles; it is not a column on `Return`, so
        # it has to come back out before the model is built. `perform_create` reads it off
        # `validated_data` and hands it to the reconciler.
        validated_data.pop("issue_list_id", None)
        return super().create(validated_data)


class RaiseDartSerializer(serializers.Serializer):
    """Bulk-action payload for `SurveyViewSet.raise_dart` / `DemandViewSet.raise_dart` —
    the ids of the Survey/Demand rows to raise a DART against."""

    ids = serializers.ListField(
        child=serializers.IntegerField(), allow_empty=False
    )


def _resolve_initiate_dart_number(dart_number, pattern_number):
    """Mirror the legacy SurveyListView/DemandListView behaviour: if the row's own
    dart_number hasn't been set yet, look up the DART actually raised against this
    spare's pattern number instead of showing a blank/stale value."""
    stripped = (dart_number or "").strip()
    if stripped and stripped.lower() != "pending":
        return dart_number
    dart = (
        InitiateDart.objects.filter(spares__pattern=pattern_number)
        .order_by("-id")
        .first()
    )
    return dart.dart_number if dart else "pending"


# Developed by Unknown: the IIF gate flag as the grid reads it, and the one place both queue
# serializers get it from, so Due for Survey and Due for Demand can never label the same spare
# differently.
#
# It reads the `awaiting_incatting` annotation `SurveyViewSet` and `DemandViewSet` put on their
# querysets, which is a single correlated `Exists()` subquery - so the whole gate costs the list
# endpoints nothing beyond the SELECT they already run.
#
# The fallback matters and is deliberate. When a caller hands this serializer an instance that
# was never annotated - today only each `raise_dart` response does, and those rows are ungated
# by construction because the gate refused otherwise - it asks the database for that one row
# rather than returning a convenient `False`. A silent `False` on a safety gate is the one wrong
# answer, and one query on a short response is a price worth paying to never give it.
#
# NOT to be confused with `is_iif`, which sits beside it on the same payload, is written on the
# import-shortfall path only, gates nothing, and is untouched by this change.
def _resolve_awaiting_incatting(obj):
    """True when this queue row's spare has an unresolved Due-for-IIF record."""
    annotated = getattr(obj, "awaiting_incatting", None)
    if annotated is not None:
        return bool(annotated)
    return NotInCattedItem.objects.filter(
        spare_id=obj.spare_id,
        incatted_status=False,
        is_deleted=False,
    ).exists()


class SurveySerializer(UppercaseFieldsSerializerMixin, serializers.ModelSerializer):
    initiate_dart_number = serializers.SerializerMethodField()
    # Developed by Unknown: a method field, so it is read-only by construction and can never be
    # set through this serializer's create or update path.
    awaiting_incatting = serializers.SerializerMethodField()

    class Meta:
        model = Survey
        fields = (
            "id",
            "issue_entry",
            "spare",
            "quantity_tosurvey",
            "dart_number",
            "initiate_dart_number",
            "is_iif",
            "is_iif_sync",
            "awaiting_incatting",
        )

    def get_initiate_dart_number(self, obj):
        return _resolve_initiate_dart_number(obj.dart_number, obj.spare.pattern_number)

    # Developed by Unknown: the gate state for this row, per the shared helper above.
    def get_awaiting_incatting(self, obj):
        return _resolve_awaiting_incatting(obj)


class PostSurveySerializer(
    UppercaseFieldsSerializerMixin,
    serializers.ModelSerializer,
):
    class Meta:
        model = PostSurvey
        fields = (
            "id",
            "spare",
            "issue_entry",
            "quantity_surveyed",
            "survey_type",
            "survey_number",
            "survey_report_date",
            "remarks",
            "has_pts",
            "created_by",
            "created_by_user",
            "dart_number",
        )
        read_only_fields = ("created_by_user",)


class DemandSerializer(UppercaseFieldsSerializerMixin, serializers.ModelSerializer):
    initiate_dart_number = serializers.SerializerMethodField()
    # Developed by Unknown: the Due for Demand half of the same read-only gate flag.
    awaiting_incatting = serializers.SerializerMethodField()

    class Meta:
        model = Demand
        fields = (
            "id",
            "issue_entry",
            "spare",
            "quantity_todemand",
            "survey_entry",
            "dart_number",
            "initiate_dart_number",
            "is_iif",
            "is_iif_sync",
            "awaiting_incatting",
        )

    def get_initiate_dart_number(self, obj):
        return _resolve_initiate_dart_number(obj.dart_number, obj.spare.pattern_number)

    # Developed by Unknown: the gate state for this row, per the shared helper above.
    def get_awaiting_incatting(self, obj):
        return _resolve_awaiting_incatting(obj)


class PostDemandSerializer(
    UppercaseFieldsSerializerMixin,
    serializers.ModelSerializer,
):
    class Meta:
        model = PostDemand
        fields = (
            "id",
            "spare",
            "issue_entry",
            "quantity_demanded",
            "demand_number",
            "demand_date",
            "remarks",
            "created_by",
            "created_by_user",
            "dart_number",
        )
        read_only_fields = ("created_by_user",)


class ReceiveSerializer(UppercaseFieldsSerializerMixin, serializers.ModelSerializer):
    class Meta:
        model = Receive
        fields = (
            "id",
            "spare",
            "issue_entry",
            "quantity_toreceive",
            "demand_entry",
            "dart_number",
        )


class PostReceiveSerializer(
    UppercaseFieldsSerializerMixin,
    serializers.ModelSerializer,
):
    class Meta:
        model = PostReceive
        fields = (
            "id",
            "spare",
            "issue_entry",
            "quantity_received",
            "receipt_number",
            "receive_date",
            "nac_status",
            "remarks",
            "dart_number",
            "created_by",
            "created_by_user",
        )
        read_only_fields = ("created_by_user",)


class PlannedRoutineSpareListSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlannedRoutineSpareList
        fields = (
            "id",
            "pattern_number",
            "planned_routine_description",
            "quantity_required",
            "is_deleted",
        )


class SparesMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SparesMapping
        fields = ("id", "equipment_class", "equipment", "section_name")


class NotInCattedItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotInCattedItem
        fields = ("id", "spare_id", "incatted_status", "is_deleted")


class MultiIssueItemSerializer(serializers.Serializer):
    spare = serializers.PrimaryKeyRelatedField(queryset=Spares.objects.all())
    quantity = serializers.IntegerField(min_value=1)
    # Required only when quantity exceeds HIGH_ISSUE_QUANTITY_THRESHOLD — enforced in
    # SparesViewSet.multi_issue (needs the sibling `quantity` value to decide), not here.
    high_quantity_reason = serializers.CharField(
        max_length=500,
        allow_blank=True,
        required=False,
    )


class MultiIssueSerializer(serializers.Serializer):
    equipment = serializers.PrimaryKeyRelatedField(
        queryset=Issue._meta.get_field("equipment").remote_field.model.objects.all(),
        allow_null=True,
        required=False,
    )
    # Who the spare is physically issued to — optional so the Ty Loan branch (which has no
    # internal user to pick, per the reference app) keeps falling back to the caller's own
    # profile, same as before this field existed.
    username = serializers.PrimaryKeyRelatedField(
        queryset=CustomUserProfile.objects.all(),
        allow_null=True,
        required=False,
    )
    remarks = serializers.CharField(max_length=200)
    # The unit a Ty Loan is going out to, as typed on Issue Spare's Ty Loan branch. Optional
    # because the Defect branch has no unit to name — the holder is on this ship.
    issued_to_unit = serializers.CharField(
        max_length=200,
        allow_blank=True,
        required=False,
    )
    dart_number = serializers.CharField(
        max_length=200,
        allow_blank=True,
        required=False,
    )
    # Developed with Understanding: the other-unit person a Ty Loan goes to (D6). Optional
    # at the field, required for TY LOAN by validate() below. The queryset is every row so
    # a no-longer-current person gets the clear message below, not "object does not exist".
    issued_to_other_profile = serializers.PrimaryKeyRelatedField(
        queryset=OtherCustomUserProfile.objects.all(),
        allow_null=True,
        required=False,
    )
    items = MultiIssueItemSerializer(many=True, allow_empty=False)

    def validate_items(self, items):
        spare_ids = [item["spare"].pk for item in items]
        if len(spare_ids) != len(set(spare_ids)):
            raise serializers.ValidationError(
                "The same spare cannot be included more than once."
            )
        return items

    # Developed with Understanding: the Issuing To rule per reason of issue (Q10, D5). TY
    # LOAN takes only a current other-unit person and never an own-ship username. DEFECT
    # takes only an own-ship person on the active roll. Any other reason keeps today's
    # behaviour and may not carry an other-unit person. Errors are raised at the field.
    def validate(self, attrs):
        attrs = super().validate(attrs)
        remarks = (attrs.get("remarks") or "").strip().upper()
        username = attrs.get("username")
        other_profile = attrs.get("issued_to_other_profile")

        if remarks == TY_LOAN_REMARKS:
            if username is not None:
                raise serializers.ValidationError(
                    {
                        "username": (
                            "A Ty Loan goes to another unit. Pick the person from the "
                            "other-unit Issued To list, not from own-ship personnel."
                        )
                    }
                )
            if other_profile is None:
                raise serializers.ValidationError(
                    {
                        "issued_to_other_profile": (
                            "Pick the other-unit person the Ty Loan is issued to."
                        )
                    }
                )
            if not current_other_unit_profiles().filter(pk=other_profile.pk).exists():
                raise serializers.ValidationError(
                    {
                        "issued_to_other_profile": (
                            "This person is no longer listed in another unit. Pick "
                            "someone from the current Issued To list."
                        )
                    }
                )
            return attrs

        if other_profile is not None:
            raise serializers.ValidationError(
                {
                    "issued_to_other_profile": (
                        "Only a Ty Loan can be issued to other-unit personnel."
                    )
                }
            )
        if remarks == DEFECT_REMARKS:
            if username is None:
                raise serializers.ValidationError(
                    {"username": "Pick the own-ship person the spare is issued to."}
                )
            if not defect_issue_profiles().filter(pk=username.pk).exists():
                raise serializers.ValidationError(
                    {
                        "username": (
                            "This person is no longer on the ship's active roll. Pick "
                            "someone from the current Issued To list."
                        )
                    }
                )
        return attrs


class InitiateStockActionSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)
    equipment = serializers.PrimaryKeyRelatedField(
        queryset=Issue._meta.get_field("equipment").remote_field.model.objects.all(),
        allow_null=True,
        required=False,
    )
    dart_number = serializers.CharField(
        max_length=200,
        allow_blank=True,
        required=False,
    )


class CompleteSurveySerializer(serializers.Serializer):
    quantity_surveyed = serializers.IntegerField(min_value=1)
    survey_type = serializers.ChoiceField(
        choices=PostSurvey.SURVEY_TYPE_CHOICES,
        default=PostSurvey.NORMAL,
    )
    survey_number = serializers.CharField(
        max_length=50,
        allow_blank=True,
        required=False,
    )
    survey_report_date = serializers.DateTimeField(required=False)
    remarks = serializers.CharField(
        max_length=200,
        allow_blank=True,
        required=False,
    )
    has_pts = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if attrs["survey_type"] == PostSurvey.NORMAL and not attrs.get("survey_number"):
            raise serializers.ValidationError(
                {"survey_number": "Survey number is required for a normal survey."}
            )
        return attrs


class CompleteDemandSerializer(serializers.Serializer):
    quantity_demanded = serializers.IntegerField(min_value=1)
    demand_number = serializers.CharField(max_length=50)
    demand_date = serializers.DateTimeField(required=False)
    remarks = serializers.CharField(
        max_length=200,
        allow_blank=True,
        required=False,
    )


class CompleteReceiveSerializer(serializers.Serializer):
    quantity_received = serializers.IntegerField(min_value=1)
    receipt_number = serializers.CharField(max_length=50)
    receive_date = serializers.DateTimeField(required=False)
    nac_status = serializers.BooleanField(required=False, default=False)
    remarks = serializers.CharField(
        max_length=200,
        allow_blank=True,
        required=False,
    )


class VerifyPatternSerializer(serializers.Serializer):
    pattern_number = serializers.CharField(max_length=500)
    category = serializers.CharField(max_length=30, required=False, allow_blank=True)


class UpdateSparePatternSerializer(serializers.Serializer):
    spare_pk = serializers.PrimaryKeyRelatedField(queryset=Spares.objects.all())
    pattern_number = serializers.CharField(max_length=500)
    # Developed by Unknown: `QUASI_PERMANENT` and its `QP` letter join the list, so a spare
    # whose category came from a WED source of truth can have its pattern number corrected
    # through this action without the request being refused on a choice error. The three
    # existing values and their letters are untouched.
    category = serializers.ChoiceField(
        choices=(
            (Spares.PERMANENT, Spares.PERMANENT),
            (Spares.RETURNABLE, Spares.RETURNABLE),
            (Spares.CONSUMABLE, Spares.CONSUMABLE),
            (Spares.QUASI_PERMANENT, Spares.QUASI_PERMANENT),
            ("P", "P"),
            ("R", "R"),
            ("C", "C"),
            ("QP", "QP"),
        ),
        required=False,
    )


class PatternIssueItemSerializer(serializers.Serializer):
    pattern_number = serializers.CharField(max_length=500)
    quantity_issued = serializers.IntegerField(min_value=1)


class PatternMultiIssueSerializer(serializers.Serializer):
    equipment = serializers.PrimaryKeyRelatedField(
        queryset=Issue._meta.get_field("equipment").remote_field.model.objects.all(),
        allow_null=True,
        required=False,
    )
    # Who the spare is physically issued to — optional so a caller that omits it keeps falling
    # back to the caller's own profile, matching MultiIssueSerializer's identical field.
    username = serializers.PrimaryKeyRelatedField(
        queryset=CustomUserProfile.objects.all(),
        allow_null=True,
        required=False,
    )
    remarks = serializers.CharField(max_length=200)
    dart_number = serializers.CharField(
        max_length=200,
        allow_blank=True,
        required=False,
    )
    items = PatternIssueItemSerializer(many=True, allow_empty=False)


class RequisitionDeleteSerializer(serializers.Serializer):
    pk = serializers.IntegerField(min_value=1)
    inventory_type = serializers.ChoiceField(choices=("OBS", "PIL", "WED", "MO"))
