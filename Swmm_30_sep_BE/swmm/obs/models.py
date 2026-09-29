from accounts.models import CustomUserProfile
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.db import models, transaction
from django.utils import timezone
from master.models import Base

from .utils import spare_image_upload_path

# ---------------------------------------------------------------------------------------
# Querysets and managers.
#
# Folded in from the former `obs/managers.py` during the obs package-consolidation pass -
# `managers.py` had no other reader, so keeping it as a separate file bought nothing over
# defining these directly here, immediately above the models that use them. This departs
# from the codebase's usual per-app `managers.py` convention as a deliberate, scoped
# exception for `obs` alone.
# ---------------------------------------------------------------------------------------


class BaseQuerySet(models.QuerySet):
    def _status_filter(self, enabled=True):
        # if any(field.name == "is_active" for field in self.model._meta.fields):
        #     return {"is_active": enabled}
        if any(field.name == "active" for field in self.model._meta.fields):
            return {"active": enabled}
        return {}

    def active(self):
        filters = self._status_filter(True)
        return self.filter(**filters) if filters else self

    def inactive(self):
        filters = self._status_filter(False)
        return self.filter(**filters) if filters else self.none()


class BaseManager(models.Manager):
    def get_queryset(self):
        return BaseQuerySet(self.model, using=self._db)

    def active(self):
        return self.get_queryset().active()

    def inactive(self):
        return self.get_queryset().inactive()


# Developed by Unknown: The authority a deficiency is measured against. It must equal
# `services.AUTHORITY_D787J` - `D787JDeficiencyQuerySetTests.test_authority_constant_
# matches_services` fails if the two ever drift apart. Defined here, once, and imported by
# `obs.services.import_rules` rather than the other way round: `import_rules` already
# imports several names from this module (`Authority`, `Spares`, ...), so this is the
# direction that does not close an import cycle.
AUTHORITY_D787J = "D787J"


class SparesQuerySet(BaseQuerySet):
    # Developed by Unknown: The single definition of a D787J deficiency. Both the
    # deficiency grid endpoint and the homepage tile fed from its response resolve
    # through this one method, so the number on the tile cannot disagree with the
    # number of rows the user sees after opening the screen.
    def d787j_deficiencies(self):
        """Rows short against the ship's D787J authorised scale.

        A row qualifies when its authority is D787J AND its held quantity is
        STRICTLY BELOW its authorised quantity. A row held AT its authorised
        quantity is fully held and is not a deficiency. A row held ABOVE it is
        excluded silently - excess holding is a separate concern and is
        deliberately surfaced nowhere here.

        `quantity_available` is the held quantity; there is no `quantity_held`
        field. Both quantities are NOT NULL smallints, so the comparison is
        numeric (never lexicographic) and no null can reach it. Were one ever
        to, SQL `<` against NULL yields UNKNOWN and `WHERE` would drop the row -
        an unknown holding is not an established deficiency, so exclusion is the
        behaviour we want either way.

        `deficiency_quantity` is annotated per query, never stored; it is
        derived data and there is no column for it.
        """
        return (
            self.filter(
                authority__name__iexact=AUTHORITY_D787J,
                quantity_available__lt=models.F("quantity_authorised"),
            )
            .annotate(
                deficiency_quantity=(
                    models.F("quantity_authorised")
                    - models.F("quantity_available")
                )
            )
            .order_by("-deficiency_quantity", "pattern_number")
        )


class SparesManager(BaseManager):
    # Developed by Unknown: Extends BaseManager, so `.active()`/`.inactive()` behave
    # exactly as before; it only widens the queryset class so `.d787j_deficiencies()`
    # is reachable from `Spares.objects` and from any queryset derived from it.
    def get_queryset(self):
        return SparesQuerySet(self.model, using=self._db)

    # Forwarded onto the manager the same way BaseManager forwards `.active()`, so both
    # `Spares.objects.d787j_deficiencies()` and `<any queryset>.d787j_deficiencies()`
    # reach the one definition.
    def d787j_deficiencies(self):
        return self.get_queryset().d787j_deficiencies()


# Add Spare: a spare's authorised holding above this needs a written reason in
# Remarks — enforced in `SparesSerializer.validate()` (create/update) and in
# `SparesViewSet.increase_holding` (Existing Spare). Kept here, not duplicated, so
# every caller shares one threshold and one message.
HIGH_HOLDING_QUANTITY_THRESHOLD = 20
HIGH_HOLDING_REASON_MIN_LENGTH = 10
HIGH_HOLDING_REASON_MESSAGE = (
    "A written reason is required when the authorised holding exceeds "
    f"{HIGH_HOLDING_QUANTITY_THRESHOLD} (entered: {{quantity}}). Explain in Remarks "
    "why this quantity is held onboard."
)

# Issue Spare: issuing more than this many of a spare at once needs a written reason —
# enforced per-item in `SparesViewSet.multi_issue`. Kept here for the same reason as the
# HIGH_HOLDING_* constants above: one threshold and one message, shared by every caller.
HIGH_ISSUE_QUANTITY_THRESHOLD = 3
HIGH_ISSUE_REASON_MESSAGE = (
    "A reason is required when issuing more than "
    f"{HIGH_ISSUE_QUANTITY_THRESHOLD} of a spare at once."
)


class UppercaseCleanMixin:
    uppercase_fields = ()

    def clean(self):
        super().clean()
        for field_name in self.uppercase_fields:
            value = getattr(self, field_name, None)
            if isinstance(value, str):
                setattr(self, field_name, value.upper())

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


# Developed by Unknown: The one equipment class every department is born with, and the spare
# class it hangs off. Clause 2.6.2 names MICELLANEOUS for SPARES_MICELLANEOUS, and clause 2.6.3
# names it again for SPARES_CONSUMABLE - the spelling is the rules document's own, with ONE L, at
# clauses 2.5.2.6, 2.6.2 and 2.6.3, and correcting it to MISCELLANEOUS would break every row the
# rule engine validates against the register.
#
# Declared HERE and imported by `obs.services` rather than the other way round, because
# `services` already imports from this module and the reverse would be a cycle.
DEFAULT_EQUIPMENT_CLASS = "MICELLANEOUS"
DEFAULT_EQUIPMENT_CLASS_SPARE_CLASS = "SPARES_MICELLANEOUS"


class SpareClass(UppercaseCleanMixin, Base):
    objects = BaseManager()
    name = models.CharField(max_length=100)
    department = models.ForeignKey(
        "master.Department",
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="onboard_spare_classes",
    )

    uppercase_fields = ("name",)

    class Meta:
        ordering = ["name"]
        unique_together = ("name", "department")

    def __str__(self):
        return self.name

    # Developed by Unknown: THE DEFAULT EQUIPMENT CLASS, CREATED BY THE MODEL, and a deliberate
    # exception to a written house rule.
    #
    # `backend\CLAUDE.md` and the header of `seed_equipment_class_defaults` both hold that
    # reference rows are created by an idempotent management command and never by anything that
    # runs on its own - a migration or a signal writes on every database the moment it is applied,
    # including one where the ship has curated its own list. This repository has no signals and no
    # `AppConfig.ready()` anywhere, and that is not an accident.
    #
    # This one row is the exception, because it is the one the rules document MANDATES rather than
    # suggests. Clauses 2.6.2 and 2.6.3 make MICELLANEOUS the whole of the permitted equipment
    # class for SPARES_PLL and SPARES_MICELLANEOUS and half of it for SPARES_CONSUMABLE, so a
    # department that has spare classes and no MICELLANEOUS cannot import a PLL row at all. It is
    # not a curation decision a ship could reasonably differ on; it is a precondition of the
    # department existing. Requiring an operator to remember a command for it is a way of getting
    # a broken ship, and every other equipment class is now created from the imported sheet.
    #
    # KEYED ON SPARES_MICELLANEOUS ALONE, for three reasons: it is the parent clause 2.6.2 names
    # and the one `services.equipment_class_parent_spare_class` returns, so the model and the
    # import agree about where the row hangs; it fires once per department rather than once per
    # spare class; and "whichever of the eight was saved first owns it" is not a rule anybody
    # could predict.
    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self._ensure_default_equipment_class()

    def _ensure_default_equipment_class(self):
        if self.name != DEFAULT_EQUIPMENT_CLASS_SPARE_CLASS:
            return
        # A department is REQUIRED. `EquipmentClass.department` is nullable and Postgres treats
        # NULLs in a unique index as distinct, so `obs_equipmentclass_unique_name_per_department`
        # does not constrain undepartmented rows at all - creating one here would mint a fresh
        # MICELLANEOUS on every save, without limit and without the constraint noticing.
        if self.department_id is None:
            return
        # Matched on the DEPARTMENT and not on this spare class, because that is what the
        # constraint is on: a department holds exactly one row of a given name, whichever spare
        # class it hangs off. A ship that already keeps MICELLANEOUS under some other spare class
        # keeps it exactly where it is.
        exists = EquipmentClass.objects.filter(
            name__iexact=DEFAULT_EQUIPMENT_CLASS,
            spare_class__department_id=self.department_id,
        ).exists()
        if exists:
            return
        # Through `.save()`, never `bulk_create`: `EquipmentClass.clean()` is what derives
        # `department_id` from the spare class, and only `full_clean()` calls it.
        EquipmentClass.objects.create(
            name=DEFAULT_EQUIPMENT_CLASS, spare_class=self
        )


class EquipmentClass(UppercaseCleanMixin, Base):
    objects = BaseManager()
    name = models.CharField(max_length=100)
    spare_class = models.ForeignKey(
        SpareClass,
        on_delete=models.PROTECT,
        related_name="equipment_classes",
    )
    # Developed by Unknown: The stored counter behind the six-digit tail of a generated
    # pattern number. The number is SEQUENTIAL, not random, and a SEPARATE counter runs per
    # equipment class, continuing from wherever that class last reached - so the counter has
    # to be persisted somewhere, and the equipment class row is the only place it belongs.
    #
    # It holds the LAST value handed out, so the first number this class ever issues is
    # 100001. A max-plus-one query over `obs_spares` was rejected deliberately: two
    # concurrent imports would read the same maximum and mint the same pattern number, and
    # the uniqueness check would not catch it because neither row is saved yet.
    # `obs.utils.next_pattern_sequence` takes a row lock and does the increment in the
    # database, which is what makes it safe.
    pattern_sequence = models.PositiveIntegerField(default=100000)
    # Developed by Unknown: The department this equipment class belongs to, DERIVED from
    # `spare_class.department` and never set by hand. It exists for one reason: the uniqueness
    # rule is that an EQUIPMENT CLASS NAME IS UNIQUE PER DEPARTMENT, and Django cannot express a
    # constraint across a foreign-key traversal - `UniqueConstraint` names columns on this table
    # only. So the department is carried here as a column and kept in step by `clean()` below.
    #
    # It is nullable purely so the migration that adds it can be applied to a populated table
    # before the backfill runs. Every row written through the ORM after that carries it, because
    # `UppercaseCleanMixin.save()` calls `full_clean()` on every save and `clean()` sets it.
    # `bulk_create()` and `queryset.update()` bypass model validation and would leave it NULL -
    # neither is used for this model anywhere in the application, and if one is added it must set
    # this field itself.
    department = models.ForeignKey(
        "master.Department",
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="onboard_equipment_classes",
    )

    uppercase_fields = ("name",)

    class Meta:
        ordering = ["name"]
        # Developed by Unknown: `unique_together = ("name", "spare_class")` is GONE and this
        # replaces it. The old rule let the same equipment class name exist once under every
        # spare class of the same department - so `MAIN ENGINE` could be created eight times over
        # in one department, once per spare class, and `_resolve_equipment_class` would pick
        # whichever one the row's own spare class pointed at. Requirement: an equipment class name
        # is entered exactly as the D787J document gives it and, once entered, is not repeated.
        #
        # This constraint is STRICTLY STRONGER than the one it replaces: two spare classes in the
        # same department can no longer both hold a class of the same name, and two departments
        # still can, which is what "unique per department" means. Nothing that satisfied the old
        # rule and the new rule together needs changing.
        #
        # Rows whose `department` is still NULL are unconstrained - Postgres treats NULLs in a
        # unique index as distinct - which is exactly what makes the add-column-then-backfill
        # order in the migration plan safe. EXISTING DUPLICATES MUST BE FOUND AND RESOLVED BEFORE
        # THE BACKFILL RUNS, not before the constraint is added.
        constraints = [
            models.UniqueConstraint(
                fields=["name", "department"],
                name="obs_equipmentclass_unique_name_per_department",
            )
        ]

    # Developed by Unknown: Keeps the derived `department` column in step with the spare class it
    # is derived from, on every save, so no call site has to remember it and no two call sites can
    # disagree about it. Runs before `validate_constraints()` inside `full_clean()`, so the
    # uniqueness check above always sees the correct department rather than a stale one.
    def clean(self):
        super().clean()
        # Guarded on the id rather than the attribute: `spare_class` is a non-nullable FK, so
        # reading it on an instance that has not been given one raises
        # `RelatedObjectDoesNotExist` instead of returning None, and that would mask the plain
        # "this field is required" error `clean_fields()` has already recorded.
        if self.spare_class_id is None:
            self.department_id = None
            return
        self.department_id = self.spare_class.department_id

    def __str__(self):
        return self.name


class Denomination(UppercaseCleanMixin, Base):
    objects = BaseManager()
    name = models.CharField(max_length=100, default="")
    department = models.ForeignKey(
        "master.Department",
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="onboard_denominations",
    )

    uppercase_fields = ("name",)

    class Meta:
        ordering = ["name"]
        unique_together = ("name", "department")

    def __str__(self):
        return self.name


class Authority(UppercaseCleanMixin, Base):
    objects = BaseManager()
    name = models.CharField(max_length=100, unique=True)

    uppercase_fields = ("name",)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Spares(UppercaseCleanMixin, Base):
    # Developed by Unknown: SparesManager extends BaseManager - `.active()`/`.inactive()`
    # are unchanged - and adds `.d787j_deficiencies()`, the one place a D787J deficiency
    # is defined.
    objects = SparesManager()
    PERMANENT = "PERMANENT"
    RETURNABLE = "RETURNABLE"
    CONSUMABLE = "CONSUMABLE"
    # Developed by Unknown: QP - quasi-permanent. A fourth category, and the only one that
    # never arrives from a workbook. The WED item master's own user-facing column is headed
    # `Item Category(C/P/QP)` (shore-inventory-wed\item-search\item-search.ts), so `QP` is a
    # value that side genuinely holds, and the import's source-of-truth correction can now
    # bring it in. It is EQUIVALENT TO PERMANENT and is treated as permanent wherever the
    # category drives behaviour - see `SparesViewSet.update_pattern`'s redirect map, which
    # is the one place a permanent spare is branched on explicitly. Everywhere else the code
    # tests for CONSUMABLE or RETURNABLE and lets everything else fall to the permanent
    # side, so quasi-permanent lands correctly without a change.
    #
    # Developed by Unknown: THIS NOTE USED TO SAY the workbook's CATEGORY column was unchanged,
    # that clause 2.9.1 still permitted P, C and R only, and that `_clean_import_category`
    # rejected anything else. None of the three is true any more, and the middle one had already
    # stopped being true in effect: `apply_source_of_truth` injected `QUASI_PERMANENT` into an
    # import row whenever a WED source disagreed with the sheet, and the row was then blanked by
    # that very function and failed by rule R-021 on a value the operator never typed.
    #
    # QP is now one of `services.CATEGORY_CODES`, so it is offered by the CATEGORY dropdown and
    # accepted by the rule engine, on the licence of clause 2.9.2 - the category "can be updated
    # using UI" once ILMS knows better. `services.CATEGORY_CODES` carries the full reasoning.
    QUASI_PERMANENT = "QUASI_PERMANENT"

    CATEGORY_CHOICES = [
        (PERMANENT, "PERMANENT"),
        (RETURNABLE, "RETURNABLE"),
        (CONSUMABLE, "CONSUMABLE"),
        (QUASI_PERMANENT, "QUASI-PERMANENT"),
    ]

    # Automatic criticality marking (by yearly issue frequency) — a spare crosses a
    # tier and never drops back down, even across a calendar-year boundary, since this
    # is a safety classification rather than a rolling statistic. See
    # `apply_criticality_from_issue_history` below and its hook in `Issue.save()`.
    NOT_CRITICAL = ""
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICALITY_CHOICES = [
        (NOT_CRITICAL, "NOT CRITICAL"),
        (LOW, "LOW"),
        (MODERATE, "MODERATE"),
        (HIGH, "HIGH"),
    ]
    CRITICALITY_ORDER = {NOT_CRITICAL: 0, LOW: 1, MODERATE: 2, HIGH: 3}
    # (tier, minimum consumption issues in the calendar year), checked highest first.
    # Developed by Unknown: HIGH raised from 10 to 12, so the three tier boundaries are the ones
    # the ship already works to - LOW 3, MODERATE 6, HIGH 12. LOW and MODERATE were already
    # right, so this is the only number that moves. Both readers take the figures from this one
    # constant - `apply_criticality_from_issue_history` below, and the `recompute_criticality`
    # management command, which repeats the loop for its dry run - so nothing else needs editing.
    # The counting basis, the calendar-year window, the exclusions and the never-lowered rule are
    # all unchanged.
    CRITICALITY_THRESHOLDS = ((HIGH, 12), (MODERATE, 6), (LOW, 3))

    equipment_class = models.ForeignKey(
        EquipmentClass,
        on_delete=models.PROTECT,
        related_name="spares",
    )
    # Developed by Unknown: The Executive sub-department this spare belongs to.
    #
    # A spare's DEPARTMENT is already reachable - `equipment_class -> spare_class -> department` -
    # and `SparesViewSet.department_scope_field` has scoped every read on it for some time. Its
    # SUB-DEPARTMENT was reachable by no path at all, which is why the Executive Head of
    # Department could not see the eight sub-departments' inventories separately: the data did not
    # record which one a spare belonged to.
    #
    # Shaped on `master.RHSIEquipment` (`master\models.py` lines 2211 to 2222), the existing
    # precedent in this codebase for carrying a department and a sub-department on one row - a
    # real `SubDepartment` foreign key, `PROTECT`, nullable, sitting beside the department. The
    # difference here is that the department is not repeated on the row, because the equipment
    # class already carries it and duplicating it would give the row two answers.
    #
    # NULLABLE, and that is the answer for existing data rather than a convenience. Every spare
    # that exists before this change backfills to NULL, and NULL is surfaced to the Executive Head
    # of Department under an "Unassigned" filter option rather than hidden - a row nobody can see
    # is a row nobody can correct. Every non-Executive department's spares stay NULL permanently
    # and are unaffected: their scoping is the department one, which is untouched.
    #
    # `on_delete=PROTECT`, matching `RHSIEquipment` and matching every other master foreign key on
    # this model. Retiring a sub-department that still has spares attached must be refused, not
    # silently cascade them away.
    sub_department = models.ForeignKey(
        "master.SubDepartment",
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="onboard_spares",
    )
    pattern_number = models.SlugField(max_length=500, default="", blank=True)
    description = models.CharField(max_length=1000, default="")
    category = models.CharField(
        max_length=30,
        choices=CATEGORY_CHOICES,
        default=PERMANENT,
    )
    critical = models.BooleanField(default=False, blank=True)
    criticality_strength = models.CharField(
        max_length=10,
        choices=CRITICALITY_CHOICES,
        default=NOT_CRITICAL,
        blank=True,
    )
    compartment = models.CharField(
        max_length=200,
        default="UNKNOWN",
        null=True,
        blank=True,
    )
    location = models.CharField(
        max_length=200,
        default="UNKNOWN",
        null=True,
        blank=True,
    )
    rack_position = models.CharField(
        max_length=200,
        default="UNKNOWN",
        null=True,
        blank=True,
    )
    rack_number = models.CharField(
        max_length=200,
        default="UNKNOWN",
        null=True,
        blank=True,
    )
    denomination = models.ForeignKey(
        Denomination,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="spares",
    )
    quantity_authorised = models.PositiveSmallIntegerField(default=0, blank=True)
    quantity_available = models.PositiveSmallIntegerField(default=0, blank=True)
    authority = models.ForeignKey(
        Authority,
        on_delete=models.PROTECT,
        related_name="spares",
    )
    # Developed by Unknown: Was a SlugField, which carries Django's slug validator and so
    # refuses any value containing a space. The D787J PAGE NUMBER column of the curated
    # import template workbooks carries `PLL 08`, `PLL 12` and `PLL 21` on every SPARES_PLL
    # row, and clause 2.18 of the rules document places no format constraint on the column
    # at all. The validator was therefore rejecting values the rules expressly permit, and
    # it would have failed twelve otherwise-correct rows across the four non-D787J
    # workbooks. Widened to a plain CharField, which is what the neighbouring `line` column
    # already is. This removes an accidental constraint, not a deliberate gate -
    # `pattern_number` remains a SlugField and its slug rule is untouched.
    page = models.CharField(max_length=200, default="", null=True, blank=True)
    line = models.CharField(max_length=200, default="", null=True, blank=True)
    remarks = models.TextField(
        max_length=2000,
        default="",
        null=True,
        blank=True,
    )
    mo_demand_number = models.CharField(
        max_length=200,
        default="",
        null=True,
        blank=True,
    )
    image = models.ImageField(
        upload_to=spare_image_upload_path,
        default="obs/default.png",
        max_length=500,
        null=True,
        blank=True,
    )
    is_obs = models.BooleanField(default=False, null=True)

    uppercase_fields = (
        "pattern_number",
        "description",
        "category",
        "compartment",
        "location",
        "rack_position",
        "rack_number",
        "page",
        "line",
        "remarks",
        "mo_demand_number",
    )

    class Meta:
        ordering = ["pattern_number"]

    def clean(self):
        super().clean()
        if self.quantity_available > self.quantity_authorised:
            raise ValidationError(
                {
                    "quantity_available": (
                        "Available quantity cannot exceed authorised quantity."
                    )
                }
            )
        # Developed by Unknown: A spare's sub-department must belong to the spare's own
        # department. The two facts arrive by different routes - the department is implied by the
        # equipment class, the sub-department is chosen on the import form - so nothing else
        # stops an Executive sub-department being attached to an Engineering spare. Enforced on
        # the model rather than in a serializer because both the import path and the Add Spare
        # path reach `full_clean()`, and only one of them goes through `SparesSerializer`.
        if self.sub_department_id is None or self.equipment_class_id is None:
            return
        spare_class = getattr(self.equipment_class, "spare_class", None)
        department_id = getattr(spare_class, "department_id", None)
        if (
            department_id is not None
            and self.sub_department.department_name_id != department_id
        ):
            raise ValidationError(
                {
                    "sub_department": (
                        "This sub-department does not belong to the spare's department."
                    )
                }
            )

    # Developed by Unknown: `is_import_shortfall=False` joins the filter, and it is the whole
    # of requirement 4.2's second half.
    #
    # An import-time shortfall is a quantity the ship NEVER HELD. It is not consumption, and
    # counting it here would raise `criticality_strength` through `apply_criticality_from_
    # issue_history` below - which, by `CRITICALITY_ORDER`, a spare crosses once and never
    # comes back down from. Initialising a ship's inventory would therefore permanently mark
    # spares critical on the strength of stock that was short on day one, on a safety
    # classification. The exclusion is stated on the count rather than on the caller because
    # this method is the single place the tier is computed from.
    def consumption_issue_count(self, *, year=None):
        """Real, ship-borne consumption issues of this spare in one calendar year —
        excludes returns (`is_return`) and Ty Loan transfers, neither of which reduce
        this ship's own stock the way an ordinary issue does, and excludes the rows the
        Excel import writes to record a shortfall, which are not consumption at all."""
        return (
            self.issues.filter(
                date_of_issue__year=year or timezone.localdate().year,
                is_return=False,
                is_deleted=False,
                is_import_shortfall=False,
            )
            .exclude(remarks__iexact="TY LOAN")
            .count()
        )

    def apply_criticality_from_issue_history(self, *, year=None):
        """Recomputes this spare's criticality tier from its issue history and raises
        `criticality_strength`/`critical` if the computed tier is higher than what is
        already stored. Never lowers either field — once a spare is marked critical it
        stays critical, even after the yearly issue count resets. Uses a queryset
        `.update()` rather than `self.save()` so it can be called safely from inside
        `Issue.save()`'s own transaction without re-entering `full_clean()`."""
        count = self.consumption_issue_count(year=year)
        computed = self.NOT_CRITICAL
        for tier, minimum in self.CRITICALITY_THRESHOLDS:
            if count >= minimum:
                computed = tier
                break

        if self.CRITICALITY_ORDER[computed] > self.CRITICALITY_ORDER.get(
            self.criticality_strength, 0
        ):
            Spares.objects.filter(pk=self.pk).update(
                criticality_strength=computed, critical=True
            )
            self.criticality_strength = computed
            self.critical = True
        return self.criticality_strength

    def __str__(self):
        return f"{self.pattern_number} - {self.description}"


class RoutineSpareUsage(Base):
    objects = BaseManager()
    routine = models.ForeignKey(
        "ems.AddRoutineDetails",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="onboard_spare_usages",
    )
    routine_description = models.ForeignKey(
        "ems.RoutineDescription",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="onboard_spare_usages",
    )
    spare = models.ForeignKey(
        Spares,
        on_delete=models.CASCADE,
        related_name="routine_usages",
    )
    quantity_used = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=1,
    )
    date_used = models.DateField(auto_now_add=True)

    class Meta:
        ordering = ["-date_used", "-id"]

    def __str__(self):
        return f"{self.spare.pattern_number} used in routine"


class Issue(UppercaseCleanMixin, Base):
    objects = BaseManager()
    spare = models.ForeignKey(
        Spares,
        on_delete=models.PROTECT,
        related_name="issues",
    )
    equipment = models.ForeignKey(
        "ems.EquipmentName",
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="onboard_spare_issues",
    )
    date_of_issue = models.DateField(
        default=timezone.now,
        verbose_name="Date of Issue",
    )
    username = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.PROTECT,
        related_name="onboard_spare_issues",
    )
    quantity_issued = models.PositiveSmallIntegerField(default=0)
    issue_time = models.DateTimeField(auto_now_add=True, null=True)
    remarks = models.CharField(max_length=200, default="", blank=True)
    dart_number = models.CharField(max_length=200, default="", blank=True)
    # Required when quantity_issued exceeds HIGH_ISSUE_QUANTITY_THRESHOLD — enforced in
    # SparesViewSet.multi_issue, not here, since it's a per-request bulk-create action rather
    # than a plain serializer save.
    high_quantity_reason = models.CharField(max_length=500, default="", blank=True)
    is_return = models.BooleanField(default=False, blank=True)
    is_wed_mo = models.BooleanField(default=False, blank=True)
    is_deleted = models.BooleanField(default=False, blank=True)
    # Developed by Unknown: THE ONE FLAG. It marks an Issue row the Excel import wrote to
    # record a shortfall - a quantity the ship was authorised to hold and did not hold when
    # its inventory was initialised - and it carries three separate consequences, which is
    # exactly why it is one flag and not three:
    #
    #   1. `consumption_issue_count` above skips the row, so an import shortfall never feeds
    #      `criticality_strength`.
    #   2. `clean()` and `save()` below skip the availability guard and the stock movement,
    #      because there is no stock to move - see the block comment on `save()`.
    #   3. The Return tab masks the issued-to name on the front end and shows
    #      "NA (recorded while import)" instead, because nobody was issued anything.
    #
    # The row still carries a real `username`. `Issue.username` is a non-nullable FK with no
    # default, the Return tab reads `IssueList` joined to `Issue`, and requirement 4.1 asks
    # for the shortfall to appear there - so an Issue row is structurally required. It is
    # assigned to the application admin account, which is a REAL account that already exists.
    # No placeholder profile is sought, seeded or created on any path, which is requirement
    # 4.2's actual instruction.
    is_import_shortfall = models.BooleanField(default=False, blank=True)
    # Developed by Unknown: the unit a TY LOAN went out to, and the only record of it.
    #
    # `username` cannot carry this. Issue Spare's Ty Loan branch has no internal user to pick -
    # `MultiIssueSerializer.username` is optional there and the row falls back to the CALLER'S
    # own profile - so the receiving unit was collected on that form ("Command" / "Issued to
    # Ship" / "Enter Ship Name (if not listed)") and then dropped on the floor, because nothing
    # on this model could hold it. The Return tab's Unit Name column reads it.
    #
    # A CharField and not a FK to `master.Ship`: the three fields it is fed from are free-text
    # inputs on that form, including one that exists precisely for a ship the masters do not
    # list, so a foreign key could not represent the values the form is already able to produce.
    # Blank on an internal issue, where the holder is on this ship and there is no other unit
    # to name.
    issued_to_unit = models.CharField(max_length=200, default="", blank=True)
    # Developed with Understanding: the other-unit person a TY LOAN went out to (D6, Q11).
    # Nullable because DEFECT and every historic row have no such person. PROTECT because
    # personnel rows are never deleted (D4). Same swmm schema, so a normal local FK.
    issued_to_other_profile = models.ForeignKey(
        "accounts.OtherCustomUserProfile",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="obs_ty_loan_issues",
    )

    uppercase_fields = (
        "remarks",
        "dart_number",
        "high_quantity_reason",
        "issued_to_unit",
    )

    class Meta:
        ordering = ["-date_of_issue", "-id"]

    def clean(self):
        super().clean()
        # Developed by Unknown: The availability guard cannot apply to an import shortfall.
        # A row with authorised 10 and held 2 records a shortfall of 8 against an available
        # quantity of 2, so the guard would reject the normal case rather than an edge case -
        # `ELEC_SWMM_IMPORT_TEMPLATE_D787.xlsx` row 7 holds authorised 1 and held 0. The
        # guard is skipped for the flagged row only and is untouched for every other Issue.
        if self.is_import_shortfall:
            return
        if self.spare_id and self.quantity_issued > self.spare.quantity_available:
            raise ValidationError(
                {
                    "quantity_issued": (
                        "Issue quantity cannot exceed available quantity."
                    )
                }
            )

    # Developed by Unknown: An import shortfall is NOT a stock movement, so it takes none of
    # the three things an ordinary issue does on creation.
    #
    #   - no availability guard, for the reason given on `clean()` above.
    #   - no decrement of `quantity_available`. The held quantity has just been imported from
    #     the workbook and is what the ship actually holds. Subtracting the shortfall from it
    #     would take away a second time stock that was never there, and would leave the ship
    #     showing less than the storekeeper counted.
    #   - no criticality recomputation, per requirement 4.2 and `consumption_issue_count`.
    #
    # The `select_for_update` lock goes with them: with nothing being decremented there is no
    # read-modify-write to serialise, and taking a row lock on every imported spare would put
    # one lock per shortfall row inside the import's per-row savepoint for no purpose.
    def save(self, *args, **kwargs):
        if self.pk is not None:
            return super().save(*args, **kwargs)

        if self.is_import_shortfall:
            return super().save(*args, **kwargs)

        with transaction.atomic():
            spare = Spares.objects.select_for_update().get(pk=self.spare_id)
            if self.quantity_issued > spare.quantity_available:
                raise ValidationError(
                    {
                        "quantity_issued": (
                            "Issue quantity cannot exceed available quantity."
                        )
                    }
                )

            self.spare = spare
            response = super().save(*args, **kwargs)
            spare.quantity_available -= self.quantity_issued
            spare.save(update_fields=["quantity_available"])
            if not self.is_return and not self.is_deleted:
                spare.apply_criticality_from_issue_history()
            return response

    def __str__(self):
        return f"{self.spare.pattern_number} issued {self.quantity_issued}"


class IssueList(UppercaseCleanMixin, Base):
    objects = BaseManager()
    issue_entry = models.ForeignKey(
        Issue,
        on_delete=models.PROTECT,
        related_name="issue_list_entries",
    )
    quantity_toreturn = models.PositiveSmallIntegerField(default=0)
    dart_number = models.CharField(max_length=200, default="", blank=True)

    uppercase_fields = ("dart_number",)

    def __str__(self):
        return f"{self.issue_entry} return qty {self.quantity_toreturn}"


class Return(UppercaseCleanMixin, Base):
    objects = BaseManager()
    spare_id = models.ForeignKey(
        Spares,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="returns",
    )
    command_id = models.ForeignKey(
        "master.MShipCommand",
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="onboard_spare_returns",
    )
    ship = models.ForeignKey(
        "master.Ship",
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="onboard_spare_returns",
        db_column="ship_id",
    )
    username = models.CharField(max_length=200, default="", blank=True)
    returned_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="onboard_spare_returns",
    )
    remarks = models.TextField(
        max_length=2000,
        default="",
        null=True,
        blank=True,
    )
    quantity_returned = models.PositiveSmallIntegerField(default=0)
    return_time = models.DateTimeField(auto_now_add=True, null=True)

    uppercase_fields = ("username", "remarks")

    class Meta:
        ordering = ["-return_time", "-id"]

    def save(self, *args, **kwargs):
        if self.pk is not None or not self.spare_id_id:
            return super().save(*args, **kwargs)

        with transaction.atomic():
            spare = Spares.objects.select_for_update().get(pk=self.spare_id_id)
            updated_quantity = spare.quantity_available + self.quantity_returned
            if updated_quantity > spare.quantity_authorised:
                raise ValidationError(
                    {
                        "quantity_returned": (
                            "Returned quantity would exceed authorised stock."
                        )
                    }
                )

            self.spare_id = spare
            response = super().save(*args, **kwargs)
            spare.quantity_available = updated_quantity
            spare.save(update_fields=["quantity_available"])
            # Developed by Unknown: STOCK ONLY. This method used to also draw the pending-return
            # rows down from here, oldest-first across every `IssueList` for the spare. That
            # moved to `services.apply_return_to_pending_row`, for two reasons:
            #
            #   1. It settled the WRONG ROW. Matching on the spare alone, a return could only
            #      ever consume the oldest pending row, so with two issues of one spare
            #      outstanding, returning the second closed the first - a different holder, a
            #      different DART, a different unit on a Ty Loan.
            #   2. It RACED the cart reconciliation. `ReturnViewSet.perform_create` calls the
            #      reconciler after `serializer.save()`, and that reconciler sizes the Survey /
            #      Demand deduction from `quantity_toreturn` - which this loop had already
            #      reduced or deleted, so the cart was left untouched.
            #
            # A return is one movement against one pending row, and only the caller knows which
            # row that is, so the whole drawdown belongs where the row is named.
            return response

    def __str__(self):
        spare = self.spare_id.pattern_number if self.spare_id else "No spare"
        return f"{spare} returned {self.quantity_returned}"


class Survey(UppercaseCleanMixin, Base):
    objects = BaseManager()
    issue_entry = models.ForeignKey(
        Issue,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="surveys",
    )
    spare = models.ForeignKey(
        Spares,
        on_delete=models.PROTECT,
        related_name="surveys",
    )
    quantity_tosurvey = models.PositiveSmallIntegerField(default=0)
    dart_number = models.TextField(null=True, blank=True)
    is_iif = models.BooleanField(default=False, blank=True)
    is_iif_sync = models.BooleanField(default=False, blank=True)

    uppercase_fields = ("dart_number",)

    def __str__(self):
        return f"{self.spare.pattern_number} survey {self.quantity_tosurvey}"


class PostSurvey(UppercaseCleanMixin, Base):
    objects = BaseManager()
    NORMAL = "NORMAL"
    OPDEM = "OPDEM"
    PTS = "PTS"
    STOREDEM = "STOREDEM"
    ONE_TIME_APPROVAL = "ONE_TIME_APPROVAL"

    SURVEY_TYPE_CHOICES = [
        (NORMAL, "Normal Survey"),
        (OPDEM, "Operational Demand"),
        (PTS, "Provisioning Technical Specification"),
        (STOREDEM, "Store Demand"),
        (ONE_TIME_APPROVAL, "One-Time Approval"),
    ]

    spare = models.ForeignKey(
        Spares,
        on_delete=models.PROTECT,
        related_name="post_surveys",
    )
    issue_entry = models.ForeignKey(
        Issue,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="post_surveys",
    )
    quantity_surveyed = models.PositiveSmallIntegerField(default=0)
    survey_type = models.CharField(
        max_length=30,
        choices=SURVEY_TYPE_CHOICES,
        default=NORMAL,
    )
    survey_number = models.SlugField(max_length=50, default="NA", blank=True)
    survey_report_date = models.DateTimeField(null=True, blank=True)
    remarks = models.CharField(max_length=200, default="", blank=True)
    has_pts = models.BooleanField(default=False, blank=True)
    created_by = models.CharField(max_length=200, default="", blank=True)
    created_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="created_onboard_post_surveys",
    )
    dart_number = models.TextField(null=True, blank=True)

    uppercase_fields = ("survey_number", "remarks", "created_by", "dart_number")

    def __str__(self):
        return self.survey_number


class Demand(UppercaseCleanMixin, Base):
    objects = BaseManager()
    issue_entry = models.ForeignKey(
        Issue,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="demands",
    )
    spare = models.ForeignKey(
        Spares,
        on_delete=models.PROTECT,
        related_name="demands",
    )
    quantity_todemand = models.PositiveSmallIntegerField(default=0)
    survey_entry = models.ForeignKey(
        PostSurvey,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="demands",
    )
    dart_number = models.TextField(null=True, blank=True)
    is_iif = models.BooleanField(default=False, blank=True)
    is_iif_sync = models.BooleanField(default=False, blank=True)

    uppercase_fields = ("dart_number",)

    def __str__(self):
        return f"{self.spare.pattern_number} demand {self.quantity_todemand}"


class PostDemand(UppercaseCleanMixin, Base):
    objects = BaseManager()
    spare = models.ForeignKey(
        Spares,
        on_delete=models.PROTECT,
        related_name="post_demands",
    )
    issue_entry = models.ForeignKey(
        Issue,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="post_demands",
    )
    quantity_demanded = models.PositiveSmallIntegerField(default=0)
    demand_number = models.SlugField(max_length=50, default="", blank=True)
    demand_date = models.DateTimeField(null=True, blank=True)
    remarks = models.CharField(max_length=200, default="", blank=True)
    created_by = models.CharField(max_length=200, default="", blank=True)
    created_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="created_onboard_post_demands",
    )
    dart_number = models.TextField(null=True, blank=True)

    uppercase_fields = ("demand_number", "remarks", "created_by", "dart_number")

    def __str__(self):
        return self.demand_number


class Receive(UppercaseCleanMixin, Base):
    objects = BaseManager()
    spare = models.ForeignKey(
        Spares,
        on_delete=models.PROTECT,
        related_name="receives",
    )
    issue_entry = models.ForeignKey(
        Issue,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="receives",
    )
    quantity_toreceive = models.PositiveSmallIntegerField(default=0)
    demand_entry = models.ForeignKey(
        PostDemand,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="receives",
    )
    dart_number = models.TextField(null=True, blank=True)

    uppercase_fields = ("dart_number",)

    def __str__(self):
        return f"{self.spare.pattern_number} receive {self.quantity_toreceive}"


class PostReceive(UppercaseCleanMixin, Base):
    objects = BaseManager()
    NAC_STATUS_CHOICES = [
        (False, "NO"),
        (True, "YES"),
    ]

    spare = models.ForeignKey(
        Spares,
        on_delete=models.PROTECT,
        related_name="post_receives",
    )
    issue_entry = models.ForeignKey(
        Issue,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="post_receives",
    )
    quantity_received = models.PositiveSmallIntegerField(default=0)
    receipt_number = models.SlugField(max_length=50, default="", blank=True)
    receive_date = models.DateTimeField(null=True, blank=True)
    nac_status = models.BooleanField(
        choices=NAC_STATUS_CHOICES,
        default=False,
        blank=True,
    )
    remarks = models.CharField(max_length=200, default="", blank=True)
    dart_number = models.TextField(null=True, blank=True)
    created_by = models.CharField(max_length=200, default="", blank=True)
    created_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="created_onboard_post_receives",
    )

    uppercase_fields = (
        "receipt_number",
        "remarks",
        "dart_number",
        "created_by",
    )

    def save(self, *args, **kwargs):
        if self.pk is not None:
            return super().save(*args, **kwargs)

        with transaction.atomic():
            spare = Spares.objects.select_for_update().get(pk=self.spare_id)
            updated_quantity = spare.quantity_available + self.quantity_received
            if updated_quantity > spare.quantity_authorised:
                raise ValidationError(
                    {
                        "quantity_received": (
                            "Received quantity would exceed authorised stock."
                        )
                    }
                )

            self.spare = spare
            response = super().save(*args, **kwargs)
            spare.quantity_available = updated_quantity
            spare.save(update_fields=["quantity_available"])
            return response

    def __str__(self):
        return self.receipt_number


class PlannedRoutineSpareList(Base):
    objects = BaseManager()
    pattern_number = models.CharField(max_length=200, default="", blank=True)
    planned_routine_description = models.ForeignKey(
        "ems.PlannedRoutineDescription",
        on_delete=models.CASCADE,
        related_name="onboard_spare_lists",
    )
    quantity_required = models.PositiveIntegerField(default=0)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        db_table = "obs_planned_routine_spare_list"
        ordering = ["pattern_number"]

    def __str__(self):
        return self.pattern_number


class SparesMapping(Base):
    objects = BaseManager()
    equipment_class = models.ForeignKey(
        EquipmentClass,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="spares_mappings",
    )
    equipment = models.ForeignKey(
        "sfd.ShipEquipment",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="obs_mappings",
    )
    section_name = models.ForeignKey(
        "master.Section",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="obs_mappings",
    )

    def __str__(self):
        equipment_class = self.equipment_class or "No equipment class"
        equipment = self.equipment or "No equipment"
        return f"{equipment_class} -> {equipment}"


class NotInCattedItem(Base):
    objects = BaseManager()
    spare_id = models.ForeignKey(
        Spares,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="not_in_catted_items",
    )
    incatted_status = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)

    def __str__(self):
        spare = self.spare_id.pattern_number if self.spare_id else "No spare"
        return f"{spare} not in catted"


class OverwriteStorage(FileSystemStorage):
    def get_available_name(self, name, max_length=None):
        if self.exists(name):
            self.delete(name)
        return name


def import_rules_pdf_upload_to(instance, filename):
    return "obs/osms_documentation.pdf"


class ImportRulesDocument(Base):
    """Backs the fixed-path 'Spares Import Rules' PDF the OBS frontend links
    to directly (backend/media/obs/osms_documentation.pdf) — uploaded/replaced
    via Django admin rather than a per-record upload flow.
    """

    file = models.FileField(
        upload_to=import_rules_pdf_upload_to,
        storage=OverwriteStorage(),
    )
    uploaded_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        ImportRulesDocument.objects.exclude(pk=self.pk).delete()
        super().save(*args, **kwargs)

    def __str__(self):
        return "Spares Import Rules PDF"
