"""
Serializers for the Ship Crew API.

Two kinds:

* ModelSerializer - for endpoints that read/write a whole row
  (LeaveApplicationSerializer, CivilianOfficialSerializer, the station-master
  serializers).
* plain Serializer - for "do this action" payloads that aren't a full row:
  apply-on-behalf, truncate, the PATCH date change, the personnel-status
  upsert, sailing create/complete, and the bulk assignments save. These have a
  custom ``save()`` (or ``create()``) that does the work.

The small helper functions at the top (_get_profile, _log_status_range, ...)
live here rather than in views.py so both the serializers and the view actions
can use them. views.py imports from this module, so this module must never
import from views.py (that would be a circular import).
"""

from datetime import datetime, timedelta

from accounts import rbac
from accounts.models import CustomUserProfile
from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from .models import (
    ActionStationMaster,
    CivilianOfficial,
    CruisingStationMaster,
    DefenceStationMaster,
    EmergencyStationMaster,
    LeaveApplication,
    PersonnelAssignment,
    PersonnelStatusLog,
    Sailing,
    SailingPersonnel,
    SailorRankClassification,
    ShelterStationMaster,
)

TyDuty = "Ty Duty"
EndDateMessage = "End date before start date."
# --------------------------------------------------------------------------
# Shared helpers - used by the serializers below and by views.py.
# --------------------------------------------------------------------------


def _get_profile(user):
    """The CustomUserProfile for a request user, with the FKs we usually need
    (rank, department, designation, role) pre-fetched. None if the user has no
    profile.
    """
    return (
        CustomUserProfile.objects.filter(id=user.user_profile_id)
        .select_related("rank", "department", "designation_master", "role_master")
        .first()
    )


def _role_name(profile):
    """The profile's role name, lower-cased, or "" if it has no role."""
    if profile and profile.role_master:
        return str(profile.role_master.role_name).strip().lower()
    return ""


def _snapshot_fields(profile):
    """Copy a person's rank / name / department / designation into plain
    strings for storing on a LeaveApplication. Prefer the linked
    rank/department/designation records; fall back to the free-text
    `designation` field.
    """
    return {
        "rank": profile.rank.name if profile.rank else "",
        "name": f"{profile.firstname} {profile.lastname}".strip(),
        "department": profile.department.name if profile.department else "",
        "designation": (
            profile.designation_master.designation_name
            if profile.designation_master
            else (profile.designation or "")
        ),
    }


def _log_status_range(leave_app):
    """Write (or refresh) one PersonnelStatusLog row per day the leave covers,
    each carrying the leave_type as the status. This is what the dashboards and
    forecast read, so it must be kept in step with the application's dates.
    """
    current = leave_app.start_date
    while current <= leave_app.end_date:
        PersonnelStatusLog.objects.update_or_create(
            leave_application=leave_app,
            personnel_number=leave_app.personal_number,
            log_date=current,
            defaults={
                "rank": leave_app.rank,
                "name": leave_app.name,
                "department": leave_app.department,
                "designation": leave_app.designation,
                "status": leave_app.leave_type,
            },
        )
        current += timedelta(days=1)


def _delete_status_logs(leave_app):
    """Remove every PersonnelStatusLog row this leave created (used when it is
    rejected, deleted or re-dated).
    """
    PersonnelStatusLog.objects.filter(leave_application=leave_app).delete()


def _absent_pnos(start, end):
    """The set of personal numbers with an *approved* leave overlapping the
    given date range - i.e. who is away between `start` and `end`.
    """
    return set(
        LeaveApplication.objects.filter(
            application_status="Approved",
            start_date__lte=end,
            end_date__gte=start,
        ).values_list("personal_number", flat=True)
    )


# --------------------------------------------------------------------------
# Personnel status
# --------------------------------------------------------------------------


class PersonnelStatusRowSerializer(serializers.Serializer):
    """One row of GET /personnel-status/. The view passes in `.values()` dicts
    (not model instances), so `source="rank__name"` etc. pull straight from the
    dict keys.
    """

    id = serializers.IntegerField()
    rank = serializers.CharField(source="rank__name", allow_null=True)
    firstname = serializers.CharField()
    lastname = serializers.CharField()
    personal_number = serializers.CharField()
    department = serializers.CharField(source="department__name", allow_null=True)
    designation = serializers.CharField(
        source="designation_master__designation_name", allow_null=True
    )
    status = serializers.CharField(source="latest_status")


class UpdatePersonnelStatusSerializer(serializers.Serializer):
    """Payload for POST /personnel-status/update/ - set one person's status for
    today. The approver-role check is done by the view; this serializer's own
    validation only stops a non-ship-wide approver from touching someone in
    another department. save() upserts the PersonnelStatusLog row for today and
    returns "updated" or "inserted".
    """

    personal_number = serializers.CharField()
    rank = serializers.CharField(required=False, allow_blank=True, default="")
    name = serializers.CharField(required=False, allow_blank=True, default="")
    department = serializers.CharField(required=False, allow_blank=True, default="")
    designation = serializers.CharField(required=False, allow_blank=True, default="")
    status = serializers.CharField()

    def validate_personal_number(self, value):
        request = self.context.get("request")
        if request is not None and not rbac.can_see_all_departments(request.user):
            caller = _get_profile(request.user)
            caller_dept = caller.department if caller else None
            target = (
                CustomUserProfile.objects.filter(personal_number=value)
                .select_related("department")
                .first()
            )
            target_dept = target.department if target else None
            if (
                caller_dept is None
                or target_dept is None
                or caller_dept.id != target_dept.id
            ):
                raise serializers.ValidationError(
                    "You may not update another department's personnel status."
                )
        return value

    def save(self):
        personnel_number = self.validated_data["personal_number"]
        log_date = timezone.now().date()

        existing_log = PersonnelStatusLog.objects.filter(
            personnel_number=personnel_number, log_date=log_date
        ).first()

        if existing_log:
            existing_log.status = self.validated_data["status"]
            existing_log.updated_at = timezone.now()
            existing_log.save()
            return "updated"

        PersonnelStatusLog.objects.create(
            rank=self.validated_data.get("rank", ""),
            name=self.validated_data.get("name", ""),
            personnel_number=personnel_number,
            department=self.validated_data.get("department", ""),
            designation=self.validated_data.get("designation", ""),
            status=self.validated_data["status"],
            log_date=log_date,
        )
        return "inserted"


# --------------------------------------------------------------------------
# Leave applications
# --------------------------------------------------------------------------


class LeaveApplicationSerializer(serializers.ModelSerializer):
    """The full LeaveApplication - used for list / retrieve output and to
    create a self-service request (POST /leave-applications/).

    On create: the person fields (personal_number, rank, name, department,
    designation) are filled from the caller's own profile and ignored if sent
    by the client; the application always starts Pending. TY-duty-only time
    fields are blanked out for plain leave.
    """

    attachment_url = serializers.SerializerMethodField()
    applied_by_name = serializers.SerializerMethodField()
    approved_rejected_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LeaveApplication
        fields = (
            "id",
            "personal_number",
            "rank",
            "name",
            "department",
            "designation",
            "leave_type",
            "has_prefix",
            "prefix_start_date",
            "prefix_start_time",
            "start_date",
            "end_date",
            "suffix_completion_date",
            "suffix_completion_time",
            "reporting_date",
            "reporting_time",
            "no_of_days",
            "station",
            "reason",
            "remark",
            "attachment",
            "attachment_url",
            "application_status",
            "rejection_reason",
            "applied_by",
            "applied_by_name",
            "approved_rejected_by",
            "approved_rejected_by_name",
            "approved_rejected_at",
            "applied_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "personal_number",
            "rank",
            "name",
            "department",
            "designation",
            "no_of_days",
            "application_status",
            "rejection_reason",
            "applied_by",
            "approved_rejected_by",
            "approved_rejected_at",
            "applied_at",
            "updated_at",
        )

    def get_attachment_url(self, obj):
        request = self.context.get("request")
        if obj.attachment and request:
            return request.build_absolute_uri(settings.MEDIA_URL + obj.attachment.name)
        return ""

    def get_applied_by_name(self, obj):
        return str(obj.applied_by) if obj.applied_by_id else ""

    def get_approved_rejected_by_name(self, obj):
        return str(obj.approved_rejected_by) if obj.approved_rejected_by_id else ""

    def validate(self, attrs):
        leave_type = attrs.get("leave_type")
        start = attrs.get("start_date")
        end = attrs.get("end_date")
        if leave_type not in ("On Leave", TyDuty):
            raise serializers.ValidationError({"leave_type": "Invalid leave type."})
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": EndDateMessage})
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        profile = _get_profile(request.user)
        if not profile:
            raise serializers.ValidationError("Profile not found.")

        leave_type = validated_data["leave_type"]
        has_prefix = validated_data.get("has_prefix", False)

        validated_data.update(_snapshot_fields(profile))
        if not has_prefix:
            validated_data["prefix_start_date"] = None
        if not (has_prefix and leave_type == TyDuty):
            validated_data["prefix_start_time"] = None
        if leave_type != TyDuty:
            validated_data["suffix_completion_time"] = None
            validated_data["reporting_time"] = None
        validated_data["application_status"] = "Pending"
        validated_data["applied_by"] = profile

        return super().create(validated_data)


class LeaveDatesUpdateSerializer(serializers.Serializer):
    """Payload for PATCH /leave-applications/{id}/ - change the end date only.

    Body: {"new_end_date": "YYYY-MM-DD"} ("end_date" is accepted as an alias).
    The start date cannot be moved through this endpoint. A date before the
    start date is clamped up to the start date (not an error). save() rebuilds
    the status logs for the new range.
    """

    new_end_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)

    def validate(self, attrs):
        new_end = attrs.get("new_end_date") or attrs.get("end_date")
        if new_end is None:
            raise serializers.ValidationError(
                {"new_end_date": "This field is required."}
            )
        attrs["new_end_date"] = new_end
        return attrs

    def save(self, leave_application):
        new_end = self.validated_data["new_end_date"]
        new_end = max(new_end, leave_application.start_date)
        _delete_status_logs(leave_application)
        leave_application.end_date = new_end
        leave_application.save()  # model.save() recomputes no_of_days
        _log_status_range(leave_application)
        return leave_application


class TruncateLeaveSerializer(serializers.Serializer):
    """Payload for POST /leave-applications/{id}/truncate/ - end an active leave
    early. Body: {"new_end_date": "YYYY-MM-DD"}. If that is before the start
    date the whole application is marked Rejected.
    """

    new_end_date = serializers.DateField()

    def save(self, leave_application):
        new_end = self.validated_data["new_end_date"]

        if new_end < leave_application.start_date:
            leave_application.application_status = "Rejected"
            leave_application.end_date = leave_application.start_date
        else:
            leave_application.end_date = new_end
        leave_application.save()  # recomputes no_of_days

        # Delete status-log rows after the requested new_end_date. Note this
        # uses the requested date, which differs from the saved end_date when
        # new_end was before the start date.
        PersonnelStatusLog.objects.filter(
            personnel_number=leave_application.personal_number,
            log_date__gt=new_end,
        ).delete()
        return leave_application


class ApplyOnBehalfSerializer(serializers.Serializer):
    """Payload for POST /leave-applications/apply_on_behalf/ - an approver files
    a leave request for someone else.

    The approver-role check is on the view. This serializer additionally stops
    a non-ship-wide approver from filing for another department. The resulting
    application is created already Approved, with the status logs written
    straight away.
    """

    personal_number = serializers.CharField()
    leave_type = serializers.ChoiceField(choices=["On Leave", TyDuty])
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    has_prefix = serializers.BooleanField(required=False, default=False)
    prefix_start_date = serializers.DateField(required=False, allow_null=True)
    prefix_start_time = serializers.TimeField(required=False, allow_null=True)
    suffix_completion_date = serializers.DateField(required=False, allow_null=True)
    suffix_completion_time = serializers.TimeField(required=False, allow_null=True)
    reporting_date = serializers.DateField(required=False, allow_null=True)
    reporting_time = serializers.TimeField(required=False, allow_null=True)
    station = serializers.CharField(required=False, allow_blank=True, default="")
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    remark = serializers.CharField(required=False, allow_blank=True, default="")
    attachment = serializers.FileField(required=False, allow_null=True)
    # Only used as a fallback when the target person's profile has no
    # rank / department / designation of its own.
    rank = serializers.CharField(required=False, allow_blank=True, default="")
    department = serializers.CharField(required=False, allow_blank=True, default="")
    designation = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["end_date"] < attrs["start_date"]:
            raise serializers.ValidationError({"end_date": EndDateMessage})
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        applier_profile = _get_profile(request.user)

        target = (
            CustomUserProfile.objects.select_related(
                "rank", "department", "designation_master"
            )
            .filter(personal_number=validated_data["personal_number"])
            .first()
        )
        if not target:
            raise serializers.ValidationError(
                {
                    "personal_number": (
                        f"Personnel {validated_data['personal_number']} not found"
                    )
                }
            )

        if not rbac.can_see_all_departments(request.user):
            applier_dept = applier_profile.department if applier_profile else None
            if applier_dept is None or target.department_id != applier_dept.id:
                raise serializers.ValidationError(
                    {
                        "personal_number": (
                            "You may not apply leave on behalf of another "
                            "department's personnel."
                        )
                    }
                )

        leave_type = validated_data["leave_type"]
        has_prefix = validated_data.get("has_prefix", False)

        rank = target.rank.name if target.rank else validated_data.get("rank", "")
        department = (
            target.department.name
            if target.department
            else validated_data.get("department", "")
        )
        designation = (
            target.designation_master.designation_name
            if target.designation_master
            else (target.designation or validated_data.get("designation", ""))
        )

        leave_app = LeaveApplication.objects.create(
            personal_number=target.personal_number,
            rank=rank,
            name=f"{target.firstname} {target.lastname}".strip(),
            department=department,
            designation=designation,
            leave_type=leave_type,
            has_prefix=has_prefix,
            prefix_start_date=(
                validated_data.get("prefix_start_date") if has_prefix else None
            ),
            prefix_start_time=(
                validated_data.get("prefix_start_time")
                if has_prefix and leave_type == TyDuty
                else None
            ),
            start_date=validated_data["start_date"],
            end_date=validated_data["end_date"],
            suffix_completion_date=validated_data.get("suffix_completion_date"),
            suffix_completion_time=(
                validated_data.get("suffix_completion_time")
                if leave_type == TyDuty
                else None
            ),
            reporting_date=validated_data.get("reporting_date"),
            reporting_time=(
                validated_data.get("reporting_time") if leave_type == TyDuty else None
            ),
            station=validated_data.get("station", ""),
            reason=validated_data.get("reason", ""),
            remark=validated_data.get("remark", ""),
            attachment=validated_data.get("attachment"),
            # An approver filing for someone else auto-approves: the
            # application is Approved on the spot and the status logs are
            # written below (see _log_status_range).
            application_status="Approved",
            applied_by=applier_profile,
            approved_rejected_by=applier_profile,
            approved_rejected_at=timezone.now(),
        )
        _log_status_range(leave_app)
        return leave_app


# --------------------------------------------------------------------------
# Watch & Station Bill - civilians
# --------------------------------------------------------------------------


class CivilianOfficialSerializer(serializers.ModelSerializer):
    """A civilian / embarked officer in the global pool. is_active and
    created_by are set by the server, not the client.
    """

    class Meta:
        model = CivilianOfficial
        fields = (
            "id",
            "name_snapshot",
            "role",
            "ref_id",
            "contact",
            "remarks",
            # "is_active",
            "active",
            "person_type",
            "rank_snapshot",
            "pno_snapshot",
            "dept_snapshot",
            "desig_snapshot",
            "service_no",
            "fleet",
            "ship",
            "cid",
            "created_by",
            "created_at",
            "updated_at",
        )
        # read_only_fields = ("id", "is_active", "created_by", "created_at", "updated_at")
        read_only_fields = ("id", "active", "created_by", "created_at", "updated_at")

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        # pno_snapshot always mirrors service_no on add; any pno_snapshot sent
        # by the client is ignored.
        validated_data["pno_snapshot"] = validated_data.get("service_no", "")
        return super().create(validated_data)


# --------------------------------------------------------------------------
# Watch & Station Bill - sailings
# --------------------------------------------------------------------------


class SailingListSerializer(serializers.ModelSerializer):
    """One row of GET /sailings/. Dates are stringified; `personnel_count` is
    the number of people currently on the sailing.
    """

    start = serializers.SerializerMethodField()
    end = serializers.SerializerMethodField()
    co = serializers.CharField(source="co_name", read_only=True)
    xo = serializers.CharField(source="xo_name", read_only=True)
    completed_at = serializers.SerializerMethodField()
    created_at = serializers.SerializerMethodField()
    personnel_count = serializers.SerializerMethodField()

    class Meta:
        model = Sailing
        fields = (
            "id",
            "name",
            "area",
            "start",
            "end",
            "co",
            "xo",
            "remarks",
            "status",
            "completed_at",
            "created_at",
            "personnel_count",
        )

    def get_start(self, obj):
        return str(obj.start_date) if obj.start_date else ""

    def get_end(self, obj):
        return str(obj.end_date) if obj.end_date else ""

    def get_completed_at(self, obj):
        return str(obj.completed_at) if obj.completed_at else ""

    def get_created_at(self, obj):
        return str(obj.created_at.date()) if obj.created_at else ""

    def get_personnel_count(self, obj):
        return obj.personnel.count()


class SailingCreateSerializer(serializers.Serializer):
    """Payload for POST /sailings/ - start a new sailing.

    `start` + `start_time` are combined into the departure datetime. If
    `copy_from_sailing_id` is given, every SailingPersonnel and
    PersonnelAssignment row from that sailing is copied onto the new one
    ("Fill Same Strength As"). The created Sailing carries `copied_personnel`
    and `copied_assignments` counts for the response.
    """

    name = serializers.CharField()
    area = serializers.CharField(required=False, allow_blank=True, default="")
    start = serializers.CharField()  # "YYYY-MM-DD"
    start_time = serializers.CharField()  # "HH:MM"
    co = serializers.CharField(required=False, allow_blank=True, default="")
    remarks = serializers.CharField(required=False, allow_blank=True, default="")
    copy_from_sailing_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        try:
            start_dt = datetime.strptime(
                f"{attrs['start']} {attrs['start_time']}", "%Y-%m-%d %H:%M"
            )
        except ValueError:
            raise serializers.ValidationError("Invalid departure date/time.")
        attrs["start_datetime"] = (
            timezone.make_aware(start_dt) if settings.USE_TZ else start_dt
        )
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        sailing = Sailing.objects.create(
            name=validated_data["name"].strip(),
            area=validated_data.get("area", "").strip(),
            start_date=validated_data["start_datetime"],
            end_date=None,
            co_name=validated_data.get("co", "").strip(),
            xo_name="",
            remarks=validated_data.get("remarks", "").strip(),
            created_by=request.user,
            status="active",
        )

        copied_personnel = 0
        copied_assignments = 0
        copy_from_id = validated_data.get("copy_from_sailing_id")
        if copy_from_id:
            src = Sailing.objects.filter(pk=copy_from_id).first()
            if src:
                for sp in src.personnel.all():
                    SailingPersonnel.objects.create(
                        sailing=sailing,
                        profile=sp.profile,
                        rank_snapshot=sp.rank_snapshot,
                        name_snapshot=sp.name_snapshot,
                        pno_snapshot=sp.pno_snapshot,
                        dept_snapshot=sp.dept_snapshot,
                        desig_snapshot=sp.desig_snapshot,
                        person_type=sp.person_type,
                        role=sp.role,
                        service_no=sp.service_no,
                        fleet=sp.fleet,
                        ship=sp.ship,
                        cid=sp.cid,
                        contact=sp.contact,
                        remarks=sp.remarks,
                        watch_station=sp.watch_station,
                        action_station=sp.action_station,
                        status_override=sp.status_override,
                        # created_by points at CustomUser, so request.user is
                        # already the right object.
                        created_by=request.user,
                    )
                    copied_personnel += 1

                for a in src.assignments.all():
                    PersonnelAssignment.objects.create(
                        sailing=sailing,
                        pno=a.pno,
                        name_snapshot=a.name_snapshot,
                        rank_snapshot=a.rank_snapshot,
                        dept_snapshot=a.dept_snapshot,
                        w3=a.w3,
                        w2=a.w2,
                        action=a.action,
                        defence=a.defence,
                        cruising=a.cruising,
                        shelter=a.shelter,
                        emergency=a.emergency,
                        lr=a.lr,
                        mess=a.mess,
                        ssd=a.ssd,
                        mess_stn=a.mess_stn,
                        section=a.section,
                        remarks=a.remarks,
                        blood_group=a.blood_group,
                    )
                    copied_assignments += 1

        sailing.copied_personnel = copied_personnel
        sailing.copied_assignments = copied_assignments
        return sailing


class SailingCompleteSerializer(serializers.Serializer):
    """Payload for POST /sailings/{id}/complete/ - close a sailing. Optional
    `completed_date` / `completed_time` default to now; save() sets end_date
    and flips status to "completed" (which makes the sailing read-only).
    """

    completed_date = serializers.CharField(required=False, allow_blank=True)
    completed_time = serializers.CharField(
        required=False, allow_blank=True, default="00:00"
    )

    def validate(self, attrs):
        comp_date_raw = attrs.get("completed_date") or str(timezone.localdate())
        comp_time_raw = attrs.get("completed_time") or "00:00"
        try:
            comp_dt = datetime.strptime(
                f"{comp_date_raw} {comp_time_raw}", "%Y-%m-%d %H:%M"
            )
        except ValueError:
            raise serializers.ValidationError("Invalid date/time")
        attrs["completed_datetime"] = comp_dt
        return attrs

    def save(self, sailing):
        comp_dt = self.validated_data["completed_datetime"]
        if settings.USE_TZ:
            comp_dt = timezone.make_aware(comp_dt)
        sailing.end_date = comp_dt
        sailing.status = "completed"
        sailing.save()
        return sailing


class AssignmentsSaveSerializer(serializers.Serializer):
    """Payload for POST /sailings/{id}/assignments/ - bulk save the watch &
    station bill grid. Body: {"rows": [{"pno": ..., "w3": ..., ...}, ...]}.
    Each row upserts one PersonnelAssignment; name/rank/dept come from the
    person's SailingPersonnel row when available, else from the row itself.
    Returns the number of rows written.
    """

    rows = serializers.ListField(child=serializers.DictField(), required=False)

    def save(self, sailing):
        rows = self.validated_data.get("rows") or []
        sp_lookup = {sp.pno_snapshot: sp for sp in sailing.personnel.all()}

        updated = 0
        for row in rows:
            pno = str(row.get("pno", "")).strip()
            if not pno:
                continue
            sp = sp_lookup.get(pno)
            PersonnelAssignment.objects.update_or_create(
                sailing=sailing,
                pno=pno,
                defaults={
                    "name_snapshot": sp.name_snapshot if sp else row.get("name", ""),
                    "rank_snapshot": sp.rank_snapshot if sp else row.get("rank", ""),
                    "dept_snapshot": (
                        sp.dept_snapshot if sp else row.get("dept", "Unknown")
                    ),
                    "w3": row.get("w3", ""),
                    "w2": row.get("w2", ""),
                    "action": row.get("action", ""),
                    "defence": row.get("defence", ""),
                    "cruising": row.get("cruising", ""),
                    "shelter": row.get("shelter", ""),
                    "emergency": row.get("emergency", ""),
                    "lr": row.get("lr", ""),
                    "mess": row.get("mess", ""),
                    "ssd": row.get("ssd", ""),
                    "mess_stn": row.get("mess_stn", ""),
                    "section": row.get("section", ""),
                    "remarks": row.get("remarks", ""),
                    "blood_group": row.get("blood_group", ""),
                },
            )
            updated += 1
        return updated


# --------------------------------------------------------------------------
# Watch & Station Bill - reference/master lists
#
# The five station types (Action / Defence / Cruising / Shelter / Emergency)
# are name-only lookup tables and share _UniqueNameMasterSerializer. The
# Junior/Senior sailor classification has its own serializer because it has an
# extra field.
# --------------------------------------------------------------------------


class _UniqueNameMasterSerializer(serializers.ModelSerializer):
    """Base for the name-only station-master tables: trims `name` and rejects a
    duplicate (case-insensitive) with "This entry already exists."
    """

    def validate_name(self, value):
        value = value.strip()
        model = self.Meta.model
        qs = model.objects.filter(name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This entry already exists.")
        return value


class ActionStationMasterSerializer(_UniqueNameMasterSerializer):
    class Meta:
        model = ActionStationMaster
        fields = ("id", "name", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class DefenceStationMasterSerializer(_UniqueNameMasterSerializer):
    class Meta:
        model = DefenceStationMaster
        fields = ("id", "name", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class CruisingStationMasterSerializer(_UniqueNameMasterSerializer):
    class Meta:
        model = CruisingStationMaster
        fields = ("id", "name", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class ShelterStationMasterSerializer(_UniqueNameMasterSerializer):
    class Meta:
        model = ShelterStationMaster
        fields = ("id", "name", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class EmergencyStationMasterSerializer(_UniqueNameMasterSerializer):
    class Meta:
        model = EmergencyStationMaster
        fields = ("id", "name", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class SailorRankClassificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = SailorRankClassification
        fields = ("id", "rank_name", "classification", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_rank_name(self, value):
        value = value.strip()
        qs = SailorRankClassification.objects.filter(rank_name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This rank is already classified.")
        return value
