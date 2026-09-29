"""Data model for the In/Out Tag module - the ship's "lock-out / tag-out"
(LOTO) register.

End-to-end lifecycle
--------------------
1. **Raise a TagOut.** A maintainer records that a piece of equipment is being
   isolated / removed (legacy ``addtagout``). It is born
   ``approval_status = "in_progress"`` and only its creator and the owning
   department's HOD / Dy HOD can see it.
2. **Approve the TagOut.** The owning department's HOD or Dy HOD moves it to
   ``"approved"`` or ``"rejected"`` in a single step (legacy ``approvetagot``).
   Only an ``"approved"`` TagOut can be tagged back in.
3. **File a TagIn.** When the equipment is restored, the *same person who
   raised the TagOut* files exactly one TagIn against it (legacy ``add_tagin``;
   enforced by the ``OneToOneField`` and by ``TagInViewSet.perform_create``).
4. **Per-department sign-off.** Filing a TagIn creates one :class:`TagInApproval`
   row per department in ``TagOut.departments_affected``. Each of those
   departments' HODs approves or rejects independently (legacy
   ``approvetagin``). :meth:`TagIn.check_all_approvals` rolls the individual
   decisions up into ``TagIn.approval_status``: any rejection -> ``"rejected"``;
   every row approved -> ``"approved"``; otherwise still ``"pending"``.

Shared infrastructure
---------------------
All three tables extend :class:`master.models.Base`, so they carry the shared
audit columns (``created_by`` / ``modified_by`` / ``created_on`` /
``modified_on`` / ``created_ip`` ...) and the ``active`` smallint soft-delete
flag (``1`` active, ``2`` inactive, ``3`` deleted). ``objects`` on each model is
built from a queryset in :mod:`inout_tag.managers`, so ``.active()`` and the
tag-specific helpers (``.in_flight()``, ``.awaiting_tagin()`` ...) are both
available.

The ``db_table`` names (``inout_tagout`` / ``inout_tagin`` /
``inout_tagin_approval``) are pinned because they are shared with the legacy
schema - do not let ``makemigrations`` rename them.
"""

from accounts.models import CustomUserProfile
from django.db import models, transaction
from django.utils import timezone
from master.models import Base, Department
from sfd.models import ShipEquipment

from .managers import TagInApprovalQuerySet, TagInQuerySet, TagOutQuerySet

# String reference so this module does not import the users app at load time.


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------
class TypeChoices(models.TextChoices):
    """Physical tag colour / severity. ``danger`` = do-not-operate (red),
    ``warning`` = operate-with-caution (yellow). Drives the PDF slip colours in
    ``TagOutViewSet.print_slip``."""

    DANGER = "danger", "Danger"
    WARNING = "warning", "Warning"


class ConditionChoices(models.TextChoices):
    """Operational state the equipment is left in while tagged out."""

    OPS = "ops", "Ops"
    NON_OPS = "non_ops", "Non Ops"
    PARTIALLY_OPS = "partially_ops", "Partially Ops"


class TagOutReasonChoices(models.TextChoices):
    """Why the item is being tagged out. The chosen reason decides which
    block of "reason-only" fields on :class:`TagOut` is meaningful - see
    ``inout_tag.views._REASON_ONLY_FIELDS``. The others are left ``NULL``."""

    TY_LOAN_RTLAPP = "ty_loan_rtlapp", "Ty Loan/RTLAPP"
    SURVEY_AND_DEMAND = "survey_and_demand", "Survey & Demand"
    REPAIR_OR_OVERHAULING = "repair_or_overhauling", "Repair/Overhauling"
    CONSUMABLE_SURVERY = "consumable_survery", "Consumable Survey"
    ABER_REPLACEMENT = "aber_replacement", "ABER Replacement"


class TagOutApprovalStatus(models.TextChoices):
    """Approval lifecycle of a :class:`TagOut`.

    A TagOut is created ``IN_PROGRESS`` and the owning department's HOD / Dy HOD
    moves it straight to ``APPROVED`` or ``REJECTED`` - there is no intermediate
    "pending CO" step (that was an abandoned redesign; the workflow here matches
    the legacy ``approvetagot`` view)."""

    IN_PROGRESS = "in_progress", "In Progress"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class TagInApprovalStatus(models.TextChoices):
    """Approval lifecycle shared by :class:`TagInApproval` (one row per
    affected department) and the rolled-up ``TagIn.approval_status``.

    Every per-department row starts ``PENDING``.
    :meth:`TagIn.check_all_approvals` collapses the rows onto the parent
    TagIn: any ``REJECTED`` -> ``REJECTED``; all ``APPROVED`` -> ``APPROVED``;
    otherwise ``PENDING``."""

    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class StatusChoices(models.TextChoices):
    """Work status of the physical tag-in, independent of the approval
    workflow. Set to ``COMPLETED`` when the TagIn is filed (legacy
    ``add_tagin`` always did this); the approval columns track sign-off."""

    COMPLETED = "completed", "Completed"
    IN_PROGRESS = "in_progress", "In Progress"
    PENDING = "pending", "Pending"


# ---------------------------------------------------------------------------
# Tag number generation
# ---------------------------------------------------------------------------
def generate_tagout_number():
    """Return the next tag-out number, ``TAG-<year>-<seq>`` (e.g.
    ``TAG-2026-004``).

    ``<seq>`` is the numeric suffix of the highest existing number for the
    current year, plus one. The lookup runs inside an atomic block with
    ``select_for_update()`` so two concurrent ``create`` calls cannot mint the
    same number (the legacy version computed this inline in ``TagOut.save`` with
    no locking, which could race). ``TagOut.tagout_number`` also has a unique
    constraint as a backstop.
    """
    year = timezone.now().year
    with transaction.atomic():
        last_tagout = (
            TagOut.objects.select_for_update()
            .filter(tagout_number__startswith=f"TAG-{year}-")
            .order_by("-tagout_number")
            .first()
        )
        next_serial = (
            int(last_tagout.tagout_number.split("-")[-1]) + 1 if last_tagout else 1
        )
        return f"TAG-{year}-{next_serial:03d}"


# ---------------------------------------------------------------------------
# TagOut
# ---------------------------------------------------------------------------
class TagOut(Base):
    """One equipment isolation / removal event.

    ``user_profile`` is the person who raised it (their department is the
    "owning" department that approves the tag-out and that is always forced
    into ``departments_affected``). ``departments_affected`` is every
    department whose spaces or systems are impacted - each one later has to
    sign off the Tag In.

    The ``ty_*`` / ``survery_demand_authority`` / ``repair_*`` / ``aber_*`` /
    ``estimated_bom_arrival_date`` fields are "reason-only": exactly one block
    is populated, chosen by ``tagout_reason`` (see
    ``inout_tag.views._REASON_ONLY_FIELDS``).
    """

    id = models.BigAutoField(primary_key=True)

    # Assigned in save() the first time the row is written; never edited after.
    tagout_number = models.CharField(
        max_length=50, unique=True, editable=False, null=True, blank=True
    )
    date = models.DateField(null=True, blank=True)

    # Who raised the tag-out. Nullable only so admin / bulk-load rows can exist
    # without a profile; the API always sets it (TagInViewSet needs
    # ``user_profile.department`` to know who approves).
    user_profile = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.CASCADE,
        related_name="tagouts",
        null=True,
        blank=True,
    )
    tagout_equipment_name = models.ForeignKey(
        ShipEquipment,
        on_delete=models.CASCADE,
        related_name="tagout_equipment",
        null=True,
        blank=True,
    )
    name_of_subsystem = models.CharField(max_length=255, null=True, blank=True)
    name_of_component = models.CharField(max_length=255, null=True, blank=True)
    serial_number_of_component = models.CharField(max_length=255, null=True, blank=True)
    pattern_number_of_component = models.CharField(
        max_length=255, null=True, blank=True
    )
    weight_of_component = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )

    type = models.CharField(
        max_length=20, choices=TypeChoices.choices, default=TypeChoices.DANGER
    )
    condition = models.CharField(
        max_length=20, choices=ConditionChoices.choices, null=True, blank=True
    )
    special_instructions = models.TextField(blank=True, null=True)

    # Every department impacted by the isolation. The owning department (from
    # ``user_profile``) is always included even if not explicitly selected.
    departments_affected = models.ManyToManyField(
        Department, related_name="affected_tagouts"
    )
    expected_date_of_tagin = models.DateField(null=True, blank=True)
    tagout_reason = models.CharField(
        max_length=30, choices=TagOutReasonChoices.choices, null=True, blank=True
    )
    tagout_description = models.TextField(blank=True, null=True)
    tagout_maintainer_name_rank = models.CharField(
        max_length=255, null=True, blank=True
    )

    # --- reason-only: Ty Loan / RTLAPP ---
    ty_loan_ship = models.CharField(max_length=255, blank=True, null=True)
    ty_authority = models.CharField(max_length=255, blank=True, null=True)
    ty_item_taken_by = models.CharField(max_length=255, blank=True, null=True)
    ty_additional_items = models.TextField(blank=True, null=True)

    # --- reason-only: Survey & Demand ---
    survery_demand_authority = models.CharField(max_length=255, blank=True, null=True)

    # --- reason-only: Repair / Overhauling ---
    repair_ra_number = models.CharField(max_length=255, blank=True, null=True)
    repair_landed_details = models.TextField(blank=True, null=True)
    repair_item_taken_by = models.CharField(max_length=255, blank=True, null=True)
    repair_additional_items = models.TextField(blank=True, null=True)

    # --- reason-only: ABER Replacement ---
    aber_authority = models.CharField(max_length=255, blank=True, null=True)
    replacement_item = models.CharField(max_length=255, blank=True, null=True)
    estimated_bom_arrival_date = models.DateField(blank=True, null=True)

    # Set by the owning department's HOD / Dy HOD via ``tagouts/{id}/approve/``.
    approval_status = models.CharField(
        max_length=20,
        choices=TagOutApprovalStatus.choices,
        default=TagOutApprovalStatus.IN_PROGRESS,
        null=True,
        blank=True,
    )
    approved_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_tagouts",
    )
    approved_on = models.DateTimeField(null=True, blank=True)

    objects = TagOutQuerySet.as_manager()

    class Meta:
        db_table = "inout_tagout"
        # ordering = ("-created_on",)
        # ordering = ("created_on",)
        ordering = ("created_at",)

    def save(self, *args, **kwargs):
        """Assign ``tagout_number`` on first write, then save normally."""
        if not self.tagout_number:
            self.tagout_number = generate_tagout_number()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.tagout_number} - {self.tagout_equipment_name}"


# ---------------------------------------------------------------------------
# TagIn
# ---------------------------------------------------------------------------
class TagIn(Base):
    """The record that a tagged-out item has been restored. Exactly one per
    :class:`TagOut` (``OneToOneField``).

    Filed only by the person who raised the parent TagOut. Filing it fans out
    one :class:`TagInApproval` per department in
    ``tagout.departments_affected``; ``approval_status`` here is the rolled-up
    result of those, maintained by :meth:`check_all_approvals`.

    ``tagin_maintainer_name_rank`` and ``tagin_remarks`` are not independent
    input - the legacy ``add_tagin`` view copied them from ``tagin_maintainer``
    and ``tagin_description`` respectively, and ``TagInViewSet.perform_create``
    does the same. They exist as columns only because the legacy schema has
    them.
    """

    id = models.BigAutoField(primary_key=True)

    tagout = models.OneToOneField(
        TagOut, on_delete=models.CASCADE, related_name="tagin"
    )
    tagin_date = models.DateField(default=timezone.now)

    # ``blank=True`` on the model for admin / bulk-load tolerance; the API
    # layer makes them mandatory (see ``TagInSerializer``), matching the legacy
    # form which did the validating while the model stayed permissive.
    tagin_description = models.TextField(default="", blank=True)
    tagin_maintainer = models.CharField(max_length=255, default="", blank=True)

    all_items_returned = models.BooleanField(default=True)
    # Populated only when ``all_items_returned`` is False; force-cleared to
    # NULL otherwise (in ``perform_create``).
    items_pending = models.TextField(blank=True, null=True)

    # Physical work status - set to "completed" when filed; distinct from the
    # approval columns below.
    status = models.CharField(
        max_length=20, choices=StatusChoices.choices, default=StatusChoices.COMPLETED
    )

    # Rolled-up result of the per-department TagInApproval rows.
    approval_status = models.CharField(
        max_length=20,
        choices=TagInApprovalStatus.choices,
        default=TagInApprovalStatus.PENDING,
        null=True,
        blank=True,
    )
    tagin_remarks = models.TextField(blank=True, null=True)
    tagin_maintainer_name_rank = models.CharField(max_length=255, null=True, blank=True)

    objects = TagInQuerySet.as_manager()

    class Meta:
        db_table = "inout_tagin"
        # ordering = ("-created_on",)
        ordering = ("created_at",)


    def __str__(self):
        return f"TagIn for {self.tagout.tagout_number}"

    def check_all_approvals(self):
        """Collapse the per-department :class:`TagInApproval` rows into this
        TagIn's overall ``approval_status``:

        * any active row rejected        -> ``"rejected"``
        * every active row approved      -> ``"approved"``
        * otherwise (some still pending) -> ``"pending"``

        No-op when no approval rows exist yet. Called by the per-department
        approve endpoint after each HOD decision.
        """
        approvals = self.tagin_approvals.filter(active=1)
        if not approvals.exists():
            return

        if approvals.filter(approval_status=TagInApprovalStatus.REJECTED).exists():
            self.approval_status = TagInApprovalStatus.REJECTED
        elif (
            approvals.filter(approval_status=TagInApprovalStatus.APPROVED).count()
            == approvals.count()
        ):
            self.approval_status = TagInApprovalStatus.APPROVED
        else:
            self.approval_status = TagInApprovalStatus.PENDING

        self.save()


# ---------------------------------------------------------------------------
# TagInApproval
# ---------------------------------------------------------------------------
class TagInApproval(Base):
    """One department's decision on a :class:`TagIn`.

    Created (one per department in ``tagin.tagout.departments_affected``) when
    the TagIn is filed. The department's HOD sets ``approval_status`` via
    ``tagins/{id}/approve/``; :meth:`TagIn.check_all_approvals` then rolls every
    sibling row up onto the parent TagIn.

    ``unique_together (tagin, department)`` guarantees a department votes at
    most once per TagIn. ``department`` is nullable at the DB level only for
    historical rows - application code always sets it.
    """

    id = models.BigAutoField(primary_key=True)

    tagin = models.ForeignKey(
        TagIn, on_delete=models.CASCADE, related_name="tagin_approvals"
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name="tagin_approvals",
        null=True,
        blank=True,
    )
    approval_status = models.CharField(
        max_length=20,
        choices=TagInApprovalStatus.choices,
        default=TagInApprovalStatus.PENDING,
    )
    approved_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_tagins",
    )
    approved_on = models.DateTimeField(null=True, blank=True)
    remarks = models.TextField(blank=True, null=True)

    objects = TagInApprovalQuerySet.as_manager()

    class Meta:
        db_table = "inout_tagin_approval"
        # ordering = ("-created_on",)
        # ordering = ("created_at",)
        ordering = ("created_at",)

        unique_together = ("tagin", "department")

    def __str__(self):
        return f"Approval for {self.tagin.tagout.tagout_number} - {self.department}"
