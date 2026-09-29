from accounts.models import CustomUserProfile
from django.db import models
from master.models import Department, SubDepartment
from master.models import Base


class HotworkType(models.TextChoices):
    """Kind of hot work being carried out."""

    CUTTING = "CUTTING", "Cutting"
    WELDING = "WELDING", "Welding"
    CUTTING_WELDING = "CUTTING_WELDING", "Cutting + Welding"
    GRINDING = "GRINDING", "Grinding"


class DayType(models.TextChoices):
    """Whether the work falls on a holiday or a normal working day."""

    HOLIDAY = "HOLIDAY", "Holiday"
    WORKING_DAY = "WORKING_DAY", "Working Day"


class ApprovalStatus(models.TextChoices):
    """Where a requisition sits in the incharge -> DYHOD -> HOD -> OOD
    approval workflow, plus the approved / rejected terminal states."""

    PENDING_INCHARGE = "pending_incharge", "Not Started"
    PENDING_DYHOD = "pending_dyhod", "Pending DyHOD Approval"
    PENDING_FIRST_HOD = "pending_first_hod", "Pending First HOD Approval"
    PENDING_HODS = "pending_hods", "Pending HOD Approval"
    PENDING_OOD = "pending_ood", "Pending OOD Approval"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class YesNoChoices(models.TextChoices):
    """Yes/No answer for a checklist item."""

    YES = "YES", "Yes"
    NO = "NO", "No"


class OpsNonOpsChoices(models.TextChoices):
    """Operational / Non Operational state of a sensor checklist item."""

    OPS = "OPS", "Operational"
    NON_OPS = "NON_OPS", "Non Operational"


class ProgressAction(models.TextChoices):
    """The lifecycle events recorded on HotworkProgressActivity."""

    STARTED = "started", "Started"
    PAUSED = "paused", "Paused"
    RESUMED = "resumed", "Resumed"
    COMPLETED = "completed", "Completed"


class AddHotwork(Base):
    """A single hot-work requisition and the state of its approval workflow
    (incharge -> DYHOD -> per-department HOD lanes -> OOD) plus its
    start/pause/complete lifecycle and per-stage e-sign trace."""

    id = models.BigAutoField(primary_key=True)
    holiday_or_working_day = models.CharField(
        max_length=20,
        choices=DayType.choices,
        default=DayType.WORKING_DAY,
        blank=True,
        null=True,
    )

    hotwork_code = models.CharField(max_length=50, blank=True, null=True)
    date_of_hotwork = models.DateField(db_index=True)

    sub_department = models.ForeignKey(
        SubDepartment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    sentries_required = models.BooleanField(default=True)
    previous_hotwork_code = models.CharField(max_length=50, blank=True, null=True)
    location_of_hotwork = models.CharField(max_length=200)
    type_of_hotwork = models.CharField(
        max_length=50,
        choices=HotworkType.choices,
    )

    departmental_officer = models.CharField(max_length=120, blank=True, null=True)
    all_adjacent_compartments = models.CharField(max_length=255, blank=True, null=True)
    sentry_names = models.TextField(blank=True, null=True)

    departmental_officer_user = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dyhod_lane_hotworks",
    )
    eo_officer = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="eo_lane_hotworks",
    )
    lo_officer = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lo_lane_hotworks",
    )
    nbcdo_officer = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="nbcdo_lane_hotworks",
    )
    initiator_signature = models.CharField(max_length=255, blank=True, null=True)

    hotwork_incharge = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hotwork_incharge",
    )
    dl_number = models.CharField(max_length=120, blank=True, null=True)
    supervision_welder_name = models.CharField(max_length=120, blank=True, null=True)

    manager_of_concern_center = models.CharField(max_length=120, blank=True, null=True)
    officer_of_the_day = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="officer_of_the_day",
    )
    remarks = models.TextField(blank=True, null=True)
    night_work = models.BooleanField(default=False)

    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
    )
    created_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_hotworks",
    )

    approval_status = models.CharField(
        max_length=50,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.PENDING_INCHARGE,
        db_index=True,
    )

    incharge_approved = models.BooleanField(default=False)
    incharge_approved_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incharge_approved_hotworks",
    )
    incharge_approved_at = models.DateTimeField(null=True, blank=True)

    dyhod_approved = models.BooleanField(default=False)
    dyhod_approved_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dyhod_approved_hotworks",
    )
    dyhod_approved_at = models.DateTimeField(null=True, blank=True)
    dyhod_e_sign_key = models.TextField(blank=True, null=True)
    dyhod_esign_comment = models.TextField(blank=True, null=True)
    dyhod_e_sign_username = models.CharField(max_length=150, blank=True, null=True)
    dyhod_e_sign_date = models.DateTimeField(null=True, blank=True)

    all_hods_approved = models.BooleanField(default=False)

    ood_approved = models.BooleanField(default=False)
    ood_approved_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ood_approved_hotworks",
    )
    ood_approved_at = models.DateTimeField(null=True, blank=True)
    ood_e_sign_key = models.TextField(blank=True, null=True)
    ood_esign_comment = models.TextField(blank=True, null=True)
    ood_e_sign_username = models.CharField(max_length=150, blank=True, null=True)
    ood_e_sign_date = models.DateTimeField(null=True, blank=True)

    rejected_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rejected_hotworks",
    )

    is_started = models.BooleanField(default=False)
    started_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="started_hotworks",
    )
    started_at = models.DateTimeField(null=True, blank=True)

    is_paused = models.BooleanField(default=False)
    paused_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="paused_hotworks",
    )
    paused_at = models.DateTimeField(null=True, blank=True)
    pause_reason = models.TextField(blank=True, null=True)

    is_completed = models.BooleanField(default=False)
    completed_by = models.ForeignKey(
        CustomUserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="completed_hotworks",
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    completion_remarks = models.TextField(blank=True, null=True)

    def check_all_hods_approved(self):
        """Recount the ENGINEERING / ELECTRICAL / NBCD approval rows
        (department ids 2, 3, 5) and advance the workflow accordingly: an
        HOD-initiated requisition moves from pending_first_hod to
        pending_hods on the first approval, and any requisition moves to
        pending_ood once all three lanes are approved. Returns True only for
        that final all-lanes-approved transition, False otherwise."""
        required_department_ids = [2, 3, 5]

        approved_count = self.hod_approvals.filter(
            department_id__in=required_department_ids, approved=True
        ).count()

        if self.approval_status == "pending_first_hod" and approved_count == 1:
            self.approval_status = "pending_hods"
            self.save()
            return False

        if approved_count == len(required_department_ids):
            self.all_hods_approved = True
            self.approval_status = "pending_ood"
            self.save()
            return True
        return False

    @property
    def current_status(self):
        """Human-readable status: "Completed" once finished, otherwise the
        display label of the current approval_status."""
        if self.is_completed:
            return "Completed"
        return self.get_approval_status_display()

    def get_approval_by_department(self, dept_id):
        """The HotworkHODApproval row for the given department id, or None
        when that lane has no row yet."""
        return self.hod_approvals.filter(department_id=dept_id).first()

    def get_eng_approval(self):
        """The Engineering (department id 2) HOD approval row, or None."""
        return self.get_approval_by_department(2)

    def get_elec_approval(self):
        """The Electrical (department id 3) HOD approval row, or None."""
        return self.get_approval_by_department(3)

    def get_nbcdo_approval(self):
        """The NBCDO (department id 5) HOD approval row, or None."""
        return self.get_approval_by_department(5)

    class Meta:
        db_table = "Hotwork_addhotwork"
        ordering = ("-created_at",)


class HotworkHODApproval(Base):
    """One department's approval row for a hot-work requisition: the
    approve/reject state, its e-sign trace, and that lane's safety
    checklist (Engineering / Electrical / NBCDO fields, only the subset for
    the row's own department is ever populated)."""

    id = models.BigAutoField(primary_key=True)
    hotwork = models.ForeignKey(
        AddHotwork, on_delete=models.CASCADE, related_name="hod_approvals"
    )
    department = models.ForeignKey(Department, on_delete=models.CASCADE)
    approved = models.BooleanField(default=False)
    approved_by = models.ForeignKey(
        CustomUserProfile, on_delete=models.SET_NULL, null=True, blank=True
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    e_sign_key = models.TextField(blank=True, null=True)
    esign_comment = models.TextField(blank=True, null=True)
    e_sign_username = models.CharField(max_length=150, blank=True, null=True)
    e_sign_date = models.DateTimeField(null=True, blank=True)

    earthing_gts = models.CharField(max_length=10, blank=True, null=True)

    fire_sensor_ops = models.CharField(
        max_length=10,
        choices=OpsNonOpsChoices.choices,
        blank=True,
        null=True,
    )

    fire_sensor_non_ops_remarks = models.TextField(
        blank=True,
        null=True,
    )

    flood_sensor_ops = models.CharField(
        max_length=10,
        choices=OpsNonOpsChoices.choices,
        blank=True,
        null=True,
    )

    flood_sensor_non_ops_remarks = models.TextField(
        blank=True,
        null=True,
    )

    supply_point = models.CharField(
        max_length=3,
        choices=YesNoChoices.choices,
        blank=True,
        null=True,
    )

    iccp_off = models.CharField(
        max_length=3,
        choices=YesNoChoices.choices,
        blank=True,
        null=True,
    )

    fire_extinguisher = models.CharField(
        max_length=3,
        choices=YesNoChoices.choices,
        blank=True,
        null=True,
    )

    fire_hose = models.CharField(
        max_length=3,
        choices=YesNoChoices.choices,
        blank=True,
        null=True,
    )

    firemain_pressure = models.CharField(
        max_length=3,
        choices=YesNoChoices.choices,
        blank=True,
        null=True,
    )

    free_lagging = models.CharField(
        max_length=3,
        choices=YesNoChoices.choices,
        blank=True,
        null=True,
    )

    sentry_knowledge = models.CharField(
        max_length=3,
        choices=YesNoChoices.choices,
        blank=True,
        null=True,
    )

    class Meta:
        db_table = "Hotwork_hotworkhodapproval"
        unique_together = ("hotwork", "department")

    def __str__(self):
        return f"HOD Approval for {self.hotwork.hotwork_code} - {self.department.name}"


class HotworkProgressActivity(Base):
    """One entry in a requisition's start/pause/resume/complete history."""

    id = models.BigAutoField(primary_key=True)

    hotwork = models.ForeignKey(
        AddHotwork, on_delete=models.CASCADE, related_name="progress_activities"
    )
    action = models.CharField(max_length=20, choices=ProgressAction)
    performed_by = models.ForeignKey(
        CustomUserProfile, on_delete=models.SET_NULL, null=True
    )
    performed_at = models.DateTimeField(auto_now_add=True)
    remarks = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "Hotwork_hotworkprogressactivity"
        ordering = ("-performed_at",)

    def __str__(self):
        return f"{self.hotwork.hotwork_code} - {self.action} by {self.performed_by}"
