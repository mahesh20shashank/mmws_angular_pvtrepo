"""
Serializers for the hotwork app.

HotworkSerializer / HotworkHODApprovalSerializer are ModelSerializers used
for list / retrieve / approval-list output. Everything else is an
action-only plain Serializer for a payload that does not round-trip a full
model instance (create, dyhod/hod/ood-approve, start, pause, complete,
resubmit, esign-qr).

HotworkHODChecklistSerializer centralises the "Non Ops requires remarks"
checklist rule; HotworkHodApproveSerializer and HotworkOodApproveSerializer
subclass it and reuse validate_checklist_for_department / apply_to_approval
instead of duplicating the rule. EsignApproveMixin centralises the
"approve requires e_sign_key + esign_comment" rule for all three approve
serializers.
"""

from django.db import transaction
from master.models import SubDepartment
from rest_framework import serializers
from accounts.models import CustomUserProfile

from .models import AddHotwork, DayType, HotworkHODApproval, HotworkType

NonOps = "Non Ops"


def _profile_summary(profile):
    """Read-only "rank firstname lastname" style projection of a
    CustomUserProfile for embedding beside a bare FK id. Returns None when
    there is no profile so callers need no null-guard of their own."""
    if profile is None:
        return None
    return {
        "id": profile.id,
        "firstname": profile.firstname,
        "lastname": profile.lastname,
        "rank": profile.rank.name if profile.rank_id else None,
        "personal_number": profile.personal_number,
        "department_id": profile.department_id,
        "department": profile.department.name if profile.department_id else None,
    }


def _format_signature(profile):
    """ "rank firstname lastname (personal_number)" -- the initiator-signature
    string stored on a new requisition. Returns None for no profile or an
    otherwise empty result."""
    if profile is None:
        return None
    parts = [
        profile.rank.name if profile.rank_id else "",
        profile.firstname or "",
        profile.lastname or "",
        f"({profile.personal_number})" if profile.personal_number else "",
    ]
    return " ".join(p for p in parts if p).strip() or None


def _sub_department_summary(sub_department):
    """Read-only {id, name, department_id} projection of a SubDepartment, or
    None when there is none."""
    if sub_department is None:
        return None
    return {
        "id": sub_department.id,
        "name": sub_department.name,
        "department_id": sub_department.department_name_id,
    }


class HotworkHODApprovalSerializer(serializers.ModelSerializer):
    """Read-only representation of one department's HOD approval row,
    including its e-sign trace and safety-checklist fields."""

    department_detail = serializers.SerializerMethodField()
    approved_by_detail = serializers.SerializerMethodField()

    class Meta:
        model = HotworkHODApproval
        fields = (
            "id",
            "hotwork",
            "department",
            "department_detail",
            "approved",
            "approved_by",
            "approved_by_detail",
            "approved_at",
            "e_sign_key",
            "esign_comment",
            "e_sign_username",
            "e_sign_date",
            "earthing_gts",
            "fire_sensor_ops",
            "fire_sensor_non_ops_remarks",
            "flood_sensor_ops",
            "flood_sensor_non_ops_remarks",
            "supply_point",
            "iccp_off",
            "fire_extinguisher",
            "fire_hose",
            "firemain_pressure",
            "free_lagging",
            "sentry_knowledge",
        )
        read_only_fields = fields

    def get_department_detail(self, obj):
        """{id, name} of the row's department, or None."""
        if obj.department_id is None:
            return None
        return {"id": obj.department_id, "name": obj.department.name}

    def get_approved_by_detail(self, obj):
        """Profile summary of whoever approved this lane, or None."""
        return _profile_summary(obj.approved_by)


class HotworkSerializer(serializers.ModelSerializer):
    """Full read-only representation of an AddHotwork row, shared by list /
    retrieve / inbox / outbox / track / monitor / report and every approve
    action's response.

    show_actions / display_status / user_already_approved are per-caller,
    per-action values the view sets on each instance before serialising;
    these SerializerMethodFields just surface whatever was set (None when
    the current action does not compute them).
    """

    holiday_or_working_day_display = serializers.CharField(
        source="get_holiday_or_working_day_display", read_only=True
    )
    type_of_hotwork_display = serializers.CharField(
        source="get_type_of_hotwork_display", read_only=True
    )
    approval_status_display = serializers.CharField(
        source="get_approval_status_display", read_only=True
    )
    current_status = serializers.CharField(read_only=True)

    sub_department_detail = serializers.SerializerMethodField()
    hotwork_incharge_detail = serializers.SerializerMethodField()
    officer_of_the_day_detail = serializers.SerializerMethodField()
    created_by_detail = serializers.SerializerMethodField()
    incharge_approved_by_detail = serializers.SerializerMethodField()
    dyhod_approved_by_detail = serializers.SerializerMethodField()
    ood_approved_by_detail = serializers.SerializerMethodField()
    started_by_detail = serializers.SerializerMethodField()
    paused_by_detail = serializers.SerializerMethodField()
    completed_by_detail = serializers.SerializerMethodField()
    departmental_officer_user_detail = serializers.SerializerMethodField()
    eo_officer_detail = serializers.SerializerMethodField()
    lo_officer_detail = serializers.SerializerMethodField()
    nbcdo_officer_detail = serializers.SerializerMethodField()
    rejected_by_detail = serializers.SerializerMethodField()

    hod_approvals = HotworkHODApprovalSerializer(many=True, read_only=True)

    show_actions = serializers.SerializerMethodField()
    display_status = serializers.SerializerMethodField()
    user_already_approved = serializers.SerializerMethodField()

    class Meta:
        model = AddHotwork
        fields = (
            "id",
            "hotwork_code",
            "date_of_hotwork",
            "holiday_or_working_day",
            "holiday_or_working_day_display",
            "sub_department",
            "sub_department_detail",
            "sentries_required",
            "previous_hotwork_code",
            "location_of_hotwork",
            "type_of_hotwork",
            "type_of_hotwork_display",
            "departmental_officer",
            "departmental_officer_user",
            "departmental_officer_user_detail",
            "eo_officer",
            "eo_officer_detail",
            "lo_officer",
            "lo_officer_detail",
            "nbcdo_officer",
            "nbcdo_officer_detail",
            "initiator_signature",
            "all_adjacent_compartments",
            "sentry_names",
            "hotwork_incharge",
            "hotwork_incharge_detail",
            "dl_number",
            "supervision_welder_name",
            "manager_of_concern_center",
            "officer_of_the_day",
            "officer_of_the_day_detail",
            "remarks",
            "night_work",
            "created_at",
            "created_by",
            "created_by_detail",
            "approval_status",
            "approval_status_display",
            "current_status",
            "incharge_approved",
            "incharge_approved_by",
            "incharge_approved_by_detail",
            "incharge_approved_at",
            "dyhod_approved",
            "dyhod_approved_by",
            "dyhod_approved_by_detail",
            "dyhod_approved_at",
            "dyhod_e_sign_key",
            "dyhod_esign_comment",
            "dyhod_e_sign_username",
            "dyhod_e_sign_date",
            "all_hods_approved",
            "ood_approved",
            "ood_approved_by",
            "ood_approved_by_detail",
            "ood_approved_at",
            "ood_e_sign_key",
            "ood_esign_comment",
            "ood_e_sign_username",
            "ood_e_sign_date",
            "rejected_at",
            "rejected_by",
            "rejected_by_detail",
            "is_started",
            "started_by",
            "started_by_detail",
            "started_at",
            "is_paused",
            "paused_by",
            "paused_by_detail",
            "paused_at",
            "pause_reason",
            "is_completed",
            "completed_by",
            "completed_by_detail",
            "completed_at",
            "completion_remarks",
            "hod_approvals",
            "show_actions",
            "display_status",
            "user_already_approved",
        )
        read_only_fields = fields

    def get_sub_department_detail(self, obj):
        """Sub-department summary, or None."""
        return _sub_department_summary(obj.sub_department)

    def get_hotwork_incharge_detail(self, obj):
        """Profile summary of the hotwork incharge, or None."""
        return _profile_summary(obj.hotwork_incharge)

    def get_officer_of_the_day_detail(self, obj):
        """Profile summary of the assigned OOD, or None."""
        return _profile_summary(obj.officer_of_the_day)

    def get_created_by_detail(self, obj):
        """Profile summary of the creator, or None."""
        return _profile_summary(obj.created_by)

    def get_incharge_approved_by_detail(self, obj):
        """Profile summary of the incharge approver, or None."""
        return _profile_summary(obj.incharge_approved_by)

    def get_dyhod_approved_by_detail(self, obj):
        """Profile summary of the DYHOD approver, or None."""
        return _profile_summary(obj.dyhod_approved_by)

    def get_ood_approved_by_detail(self, obj):
        """Profile summary of the OOD approver, or None."""
        return _profile_summary(obj.ood_approved_by)

    def get_started_by_detail(self, obj):
        """Profile summary of whoever started the hotwork, or None."""
        return _profile_summary(obj.started_by)

    def get_paused_by_detail(self, obj):
        """Profile summary of whoever paused the hotwork, or None."""
        return _profile_summary(obj.paused_by)

    def get_completed_by_detail(self, obj):
        """Profile summary of whoever completed the hotwork, or None."""
        return _profile_summary(obj.completed_by)

    def get_departmental_officer_user_detail(self, obj):
        """Profile summary of the named DYHOD-lane officer, or None."""
        return _profile_summary(obj.departmental_officer_user)

    def get_eo_officer_detail(self, obj):
        """Profile summary of the named Engineering-lane officer, or None."""
        return _profile_summary(obj.eo_officer)

    def get_lo_officer_detail(self, obj):
        """Profile summary of the named Electrical-lane officer, or None."""
        return _profile_summary(obj.lo_officer)

    def get_nbcdo_officer_detail(self, obj):
        """Profile summary of the named NBCDO-lane officer, or None."""
        return _profile_summary(obj.nbcdo_officer)

    def get_rejected_by_detail(self, obj):
        """Profile summary of whoever rejected the requisition, or None."""
        return _profile_summary(obj.rejected_by)

    def get_show_actions(self, obj):
        """Whether the view flagged the start/pause/complete controls as
        currently live for this row (None when not computed)."""
        return getattr(obj, "show_actions", None)

    def get_display_status(self, obj):
        """Caller-specific status label the view attached, or None."""
        return getattr(obj, "display_status", None)

    def get_user_already_approved(self, obj):
        """Whether the caller has already approved this row, as flagged by
        the view (None when not computed)."""
        return getattr(obj, "user_already_approved", None)


class HotworkCreateSerializer(serializers.Serializer):
    """Validation-only payload for POST hotworks/. Encodes what a valid new
    requisition looks like; HotworkViewSet.create() resolves the workflow
    entry status and does the approval wiring.

    The named approval-lane officer fields are optional here -- which of
    them a given creator role may set is enforced by the view against the
    resolved workflow type. e_sign_key / esign_comment are only required
    (by the view) on the paths where the creator also approves in the same
    request (DYHOD self-approve, HOD lane self-approve, OOD creator).

    hotwork_incharge is deliberately not a field: new requisitions never
    set it.
    """

    date_of_hotwork = serializers.DateField()
    sub_department = serializers.PrimaryKeyRelatedField(
        queryset=SubDepartment.objects.all(), required=False, allow_null=True
    )
    sentries_required = serializers.BooleanField(required=False, default=True)
    previous_hotwork_code = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=None
    )
    location_of_hotwork = serializers.CharField()
    type_of_hotwork = serializers.ChoiceField(choices=HotworkType)
    departmental_officer = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=None
    )
    all_adjacent_compartments = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=None
    )
    sentry_names = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=None
    )
    dl_number = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=None
    )
    supervision_welder_name = serializers.CharField()
    manager_of_concern_center = serializers.CharField()
    officer_of_the_day = serializers.PrimaryKeyRelatedField(
        queryset=CustomUserProfile.objects.all()
    )
    remarks = serializers.CharField()
    night_work = serializers.BooleanField(required=False, default=False)
    holiday_or_working_day = serializers.ChoiceField(choices=DayType)

    departmental_officer_user = serializers.PrimaryKeyRelatedField(
        queryset=CustomUserProfile.objects.all(), required=False, allow_null=True
    )
    eo_officer = serializers.PrimaryKeyRelatedField(
        queryset=CustomUserProfile.objects.all(), required=False, allow_null=True
    )
    lo_officer = serializers.PrimaryKeyRelatedField(
        queryset=CustomUserProfile.objects.all(), required=False, allow_null=True
    )
    nbcdo_officer = serializers.PrimaryKeyRelatedField(
        queryset=CustomUserProfile.objects.all(), required=False, allow_null=True
    )
    e_sign_key = serializers.CharField(
        required=False, allow_blank=True, default="", trim_whitespace=False
    )
    esign_comment = serializers.CharField(required=False, allow_blank=True, default="")

    def create(self, validated_data):
        """Create the AddHotwork row. The next hotwork_code is taken under a
        select_for_update() lock so concurrent creates cannot collide.
        approval_status comes from the initial_status the view injects via
        serializer.save(); absent that, falls back to the plain
        non-privileged rule (pending_ood for night/holiday, else
        pending_dyhod)."""
        request = self.context["request"]
        profile = getattr(request.user, "user_profile", None)
        if profile is None:
            raise serializers.ValidationError(
                "User profile not found. Contact administrator."
            )
        night_work = validated_data.get("night_work", False)
        day_type = validated_data.get("holiday_or_working_day")

        initial_status = validated_data.pop("initial_status", None)
        if initial_status is None:
            initial_status = (
                "pending_ood"
                if (night_work or day_type == "holiday")
                else "pending_dyhod"
            )

        with transaction.atomic():
            last = (
                AddHotwork.objects.select_for_update().order_by("-created_at").first()
            )
            if last and last.hotwork_code and str(last.hotwork_code).isdigit():
                code = int(last.hotwork_code) + 1
            else:
                code = 1

            hotwork = AddHotwork.objects.create(
                date_of_hotwork=validated_data["date_of_hotwork"],
                hotwork_code=str(code),
                sub_department=validated_data.get("sub_department"),
                sentries_required=validated_data.get("sentries_required", True),
                previous_hotwork_code=validated_data.get("previous_hotwork_code")
                or None,
                location_of_hotwork=validated_data["location_of_hotwork"],
                type_of_hotwork=validated_data["type_of_hotwork"],
                departmental_officer=validated_data.get("departmental_officer") or None,
                departmental_officer_user=validated_data.get(
                    "departmental_officer_user"
                ),
                eo_officer=validated_data.get("eo_officer"),
                lo_officer=validated_data.get("lo_officer"),
                nbcdo_officer=validated_data.get("nbcdo_officer"),
                initiator_signature=_format_signature(profile),
                all_adjacent_compartments=validated_data.get(
                    "all_adjacent_compartments"
                )
                or None,
                sentry_names=validated_data.get("sentry_names") or None,
                dl_number=validated_data.get("dl_number") or None,
                supervision_welder_name=validated_data["supervision_welder_name"],
                manager_of_concern_center=validated_data["manager_of_concern_center"],
                officer_of_the_day=validated_data["officer_of_the_day"],
                remarks=validated_data["remarks"],
                night_work=night_work,
                holiday_or_working_day=day_type,
                created_by=profile,
                approval_status=initial_status,
            )

        return hotwork


class HotworkHODChecklistSerializer(serializers.Serializer):
    """Shared safety-checklist payload for hod_approve / ood_approve.

    Every field is optional: a single hod_approve call only fills its own
    department's subset, while ood_approve's night/holiday branch fills all
    three subsets from one payload. Field names match the HotworkHODApproval
    model directly (fire_sensor_ops, earthing_gts, ...).
    """

    earthing_gts = serializers.ChoiceField(
        choices=["Yes", "No"], required=False, allow_blank=True, default=""
    )
    fire_sensor_ops = serializers.ChoiceField(
        choices=["Ops", NonOps], required=False, allow_blank=True, default=""
    )
    fire_sensor_non_ops_remarks = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    flood_sensor_ops = serializers.ChoiceField(
        choices=["Ops", NonOps], required=False, allow_blank=True, default=""
    )
    flood_sensor_non_ops_remarks = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    supply_point = serializers.ChoiceField(
        choices=["Yes", "No"], required=False, allow_blank=True, default=""
    )
    iccp_off = serializers.ChoiceField(
        choices=["Yes", "No"], required=False, allow_blank=True, default=""
    )
    fire_extinguisher = serializers.ChoiceField(
        choices=["Yes", "No"], required=False, allow_blank=True, default=""
    )
    fire_hose = serializers.ChoiceField(
        choices=["Yes", "No"], required=False, allow_blank=True, default=""
    )
    firemain_pressure = serializers.ChoiceField(
        choices=["Yes", "No"], required=False, allow_blank=True, default=""
    )
    free_lagging = serializers.ChoiceField(
        choices=["Yes", "No"], required=False, allow_blank=True, default=""
    )
    sentry_knowledge = serializers.ChoiceField(
        choices=["Yes", "No"], required=False, allow_blank=True, default=""
    )

    def validate_checklist_for_department(self, attrs, dept_id):
        """Enforce the "Non Ops requires remarks" rule for the Electrical
        lane (dept_id 3): a Non Ops fire- or flood-sensor reading must carry
        the matching remarks field. A no-op for any other department."""
        if dept_id == 3:
            if (
                attrs.get("fire_sensor_ops") == NonOps
                and not (attrs.get("fire_sensor_non_ops_remarks") or "").strip()
            ):
                raise serializers.ValidationError(
                    {
                        "fire_sensor_non_ops_remarks": (
                            "Remarks are required when Fire Sensor is Non Ops."
                        )
                    }
                )
            if (
                attrs.get("flood_sensor_ops") == NonOps
                and not (attrs.get("flood_sensor_non_ops_remarks") or "").strip()
            ):
                raise serializers.ValidationError(
                    {
                        "flood_sensor_non_ops_remarks": (
                            "Remarks are required when Flood Sensor is Non Ops."
                        )
                    }
                )
        return attrs

    def apply_to_approval(self, hod_approval, dept_id):
        """Write only the checklist fields that belong to dept_id (2, 3 or
        5) onto the HotworkHODApproval row. The Electrical Non Ops remarks
        are cleared unless their sensor reads Non Ops."""
        data = self.validated_data
        if dept_id == 2:
            hod_approval.earthing_gts = data.get("earthing_gts", "")
        elif dept_id == 3:
            hod_approval.fire_sensor_ops = data.get("fire_sensor_ops", "")
            hod_approval.flood_sensor_ops = data.get("flood_sensor_ops", "")
            hod_approval.supply_point = data.get("supply_point", "")
            hod_approval.iccp_off = data.get("iccp_off", "")
            hod_approval.fire_sensor_non_ops_remarks = (
                data.get("fire_sensor_non_ops_remarks", "")
                if hod_approval.fire_sensor_ops == NonOps
                else ""
            )
            hod_approval.flood_sensor_non_ops_remarks = (
                data.get("flood_sensor_non_ops_remarks", "")
                if hod_approval.flood_sensor_ops == NonOps
                else ""
            )
        elif dept_id == 5:
            hod_approval.fire_extinguisher = data.get("fire_extinguisher", "")
            hod_approval.fire_hose = data.get("fire_hose", "")
            hod_approval.firemain_pressure = data.get("firemain_pressure", "")
            hod_approval.free_lagging = data.get("free_lagging", "")
            hod_approval.sentry_knowledge = data.get("sentry_knowledge", "")


class EsignApproveMixin(serializers.Serializer):
    """Shared e-sign payload for the approve actions. On action == "approve"
    both e_sign_key and esign_comment are mandatory; on "reject" they are
    ignored. e_sign_username falls back to the request user in the view when
    left blank."""

    e_sign_key = serializers.CharField(
        required=False, allow_blank=True, default="", trim_whitespace=False
    )
    esign_comment = serializers.CharField(required=False, allow_blank=True, default="")
    e_sign_username = serializers.CharField(
        required=False, allow_blank=True, default=""
    )

    def _validate_esign(self, attrs):
        """Require e_sign_key and esign_comment when approving; no-op
        otherwise."""
        if attrs.get("action") != "approve":
            return
        if not (attrs.get("e_sign_key") or "").strip():
            raise serializers.ValidationError(
                {"e_sign_key": "Please eSign before approval."}
            )
        if not (attrs.get("esign_comment") or "").strip():
            raise serializers.ValidationError(
                {"esign_comment": "eSign remarks/comment is mandatory."}
            )


class HotworkDyhodApproveSerializer(EsignApproveMixin):
    """Body for hotworks/{id}/dyhod_approve/ -- an action plus the e-sign
    payload."""

    action = serializers.ChoiceField(choices=["approve", "reject"])

    def validate(self, attrs):
        """Enforce the e-sign rule on approve."""
        self._validate_esign(attrs)
        return attrs


class HotworkHodApproveSerializer(EsignApproveMixin, HotworkHODChecklistSerializer):
    """Body for hotworks/{id}/hod_approve/. The view injects the caller's
    own department id as context["dept_id"] so the "Non Ops requires
    remarks" rule only fires for the Electrical lane."""

    action = serializers.ChoiceField(choices=["approve", "reject"])

    def validate(self, attrs):
        """Enforce the e-sign rule, then the department checklist rule on
        approve."""
        self._validate_esign(attrs)
        if attrs["action"] == "approve":
            dept_id = self.context.get("dept_id")
            attrs = self.validate_checklist_for_department(attrs, dept_id)
        return attrs


class HotworkOodApproveSerializer(EsignApproveMixin, HotworkHODChecklistSerializer):
    """Body for hotworks/{id}/ood_approve/. For a night/holiday hotwork the
    OOD fills all three departments' checklists in one payload; the view
    passes context["apply_checklist"] so the Electrical Non Ops rule is
    only enforced when that backfill branch will run."""

    action = serializers.ChoiceField(choices=["approve", "reject"])

    def validate(self, attrs):
        """Enforce the e-sign rule, then the Electrical checklist rule when
        approving a night/holiday hotwork."""
        self._validate_esign(attrs)
        if attrs["action"] == "approve" and self.context.get("apply_checklist"):
            attrs = self.validate_checklist_for_department(attrs, 3)
        return attrs


class HotworkStartSerializer(serializers.Serializer):
    """Body for hotworks/{id}/start/. start_remarks is mandatory and is
    recorded on the HotworkProgressActivity row; the same endpoint resumes a
    paused hotwork, so the remarks double as the resume note."""

    start_remarks = serializers.CharField()

    def validate_start_remarks(self, value):
        """Require non-blank remarks."""
        value = value.strip()
        if not value:
            raise serializers.ValidationError(
                "Please provide remarks before starting hotwork."
            )
        return value


class HotworkPauseSerializer(serializers.Serializer):
    """Body for hotworks/{id}/pause/. pause_reason is required."""

    pause_reason = serializers.CharField()


class HotworkCompleteSerializer(serializers.Serializer):
    """Body for hotworks/{id}/complete/. completion_remarks is optional and
    may be blank."""

    completion_remarks = serializers.CharField(
        required=False, allow_blank=True, default=""
    )


class HotworkResubmitSerializer(serializers.Serializer):
    """Body for hotworks/{id}/resubmit/. resubmit_remarks is mandatory."""

    resubmit_remarks = serializers.CharField()

    def validate_resubmit_remarks(self, value):
        """Require non-blank remarks."""
        value = value.strip()
        if not value:
            raise serializers.ValidationError(
                "Please enter your remarks before resubmission."
            )
        return value


class HotworkEsignQrSerializer(serializers.Serializer):
    """Body for hotworks/generate_esign_qr/. hotwork_id is required;
    comment and role are optional."""

    hotwork_id = serializers.CharField()
    comment = serializers.CharField(required=False, allow_blank=True, default="")
    role = serializers.CharField(required=False, allow_blank=True, default="unknown")

    def validate_comment(self, value):
        """Trim to a bare string."""
        return (value or "").strip()

    def validate_role(self, value):
        """Trim, defaulting an empty role back to "unknown"."""
        return (value or "unknown").strip() or "unknown"
