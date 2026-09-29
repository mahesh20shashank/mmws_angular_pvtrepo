from typing import Any, ClassVar

from master.models import Department, HrcdfCommand, HrcdfUnit, MasterCommand
from rest_framework import serializers

from .models import (
    CustomUser,
    CustomUserProfile,
    Designation,
    GalleryImage,
    HRCDFMock,
    HrcdfSyncJob,
    LoginRegistrationImage,
    MasterKnowYourRegulator,
    MasterRegulatorDivision,
    OtherCustomUserProfile,
    Rank,
    Role,
    ShipIdentity,
)

# --------------------------------------------------------------------------
# Read-only master data (dropdown sources for the FE forms)
# --------------------------------------------------------------------------


class RankSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rank
        fields = (
            "id",
            "name",
            "department",
        )


class DesignationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Designation
        fields = (
            "id",
            "designation_name",
        )


class RoleSerializer(serializers.ModelSerializer):
    assigned_users_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = (
            "id",
            "role_name",
            "assigned_users_count",
        )

    def get_assigned_users_count(self, obj):
        return obj.customuserprofile_set.count()


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = (
            "id",
            "name",
            "code",
            "dep_code",
        )


class CommandSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterCommand
        fields = (
            "id",
            "unit_name",
            "command_name",
        )


# --------------------------------------------------------------------------
# User / profile
# --------------------------------------------------------------------------


class CustomUserProfileSerializer(serializers.ModelSerializer):
    rank_detail = RankSerializer(source="rank", read_only=True)
    designation_master_detail = DesignationSerializer(
        source="designation_master", read_only=True
    )
    department_detail = DepartmentSerializer(source="department", read_only=True)
    role_master_detail = RoleSerializer(source="role_master", read_only=True)
    command_name_detail = CommandSerializer(source="command_name", read_only=True)
    access_level_display = serializers.CharField(
        source="get_access_level_display", read_only=True
    )
    ship_name = serializers.CharField(source="ship.name", read_only=True)

    class Meta:
        model = CustomUserProfile
        fields = (
            "id",
            "rank_detail",
            "firstname",
            "lastname",
            "designation_master_detail",
            "designation",
            "personal_number",
            "section",
            "ship_joining_date",
            "ship_leaving_date",
            "remarks",
            "access_level",
            "access_level_display",
            "department_detail",
            "executive_sub_department",
            "role_master_detail",
            "command_name_detail",
            "ship",
            "ship_name",
            "has_credentials",
            "is_role",
            # "user_created_on",
            "user_active",
            "is_ood",
            "is_regulator",
            "date_of_birth",
            "date_of_joining",
            "is_married",
            "marriage_date",
            "division",
            "profile_picture",
        )
        read_only_fields = (
            "id",
            "user_created_on",
        )


class CustomUserSerializer(serializers.ModelSerializer):
    profile = CustomUserProfileSerializer(source="user_profile", read_only=True)

    class Meta:
        model = CustomUser
        fields = ("id", "username", "is_active", "is_admin", "profile", "user_profile")
        read_only_fields = ("id",)
        extra_kwargs: ClassVar[dict[str, Any]] = {"user_profile": {"write_only": True}}


class DeactivateUserSerializer(serializers.Serializer):
    """Mirrors ManageUserView's form_id=2 branch / EditUserProfileView deactivation."""

    ship_leaving_date = serializers.DateTimeField(required=False, allow_null=True)

    def save(self, profile):
        user = CustomUser.objects.filter(user_profile=profile).first()
        if user is not None:
            user.is_active = False
            user.set_unusable_password()
            user.save()
        if self.validated_data.get("ship_leaving_date"):
            profile.ship_leaving_date = self.validated_data["ship_leaving_date"]
        profile.user_active = False
        profile.has_credentials = False
        profile.save()
        return profile


class MarriageDetailsSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = CustomUserProfile
        fields = ("id", "name", "personal_number", "marriage_date", "is_married")

    def get_name(self, obj):
        return f"{obj.firstname} {obj.lastname}".strip()


# --------------------------------------------------------------------------
# Regulator hierarchy ("Know Your Regulator")
# --------------------------------------------------------------------------


class MasterRegulatorDivisionSerializer(serializers.ModelSerializer):
    regulator_name = serializers.SerializerMethodField()
    department_name = serializers.CharField(source="department.name", read_only=True)

    class Meta:
        model = MasterRegulatorDivision
        fields = (
            "id",
            "department",
            "department_name",
            "regulator",
            "regulator_name",
            "division",
        )

    def get_regulator_name(self, obj):
        return f"{obj.regulator.firstname} {obj.regulator.lastname}".strip()


class MasterKnowYourRegulatorSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)
    regulator_name = serializers.SerializerMethodField()
    sailor_name = serializers.SerializerMethodField()
    division_name = serializers.CharField(
        source="division.division", read_only=True, default=None
    )

    class Meta:
        model = MasterKnowYourRegulator
        fields = (
            "id",
            "department",
            "department_name",
            "regulator",
            "regulator_name",
            "sailor",
            "sailor_name",
            "division",
            "division_name",
        )

    def get_regulator_name(self, obj):
        return f"{obj.regulator.firstname} {obj.regulator.lastname}".strip()

    def get_sailor_name(self, obj):
        if not obj.sailor:
            return None
        return f"{obj.sailor.firstname} {obj.sailor.lastname} ({obj.sailor.personal_number})"


class AssignSailorsToDivisionSerializer(serializers.Serializer):
    division = serializers.PrimaryKeyRelatedField(
        queryset=MasterRegulatorDivision.objects.all()
    )
    sailors = serializers.PrimaryKeyRelatedField(
        queryset=CustomUserProfile.objects.all(), many=True
    )

    def save(self):
        division = self.validated_data["division"]
        sailors = self.validated_data["sailors"]
        CustomUserProfile.objects.filter(division=division).update(division=None)
        CustomUserProfile.objects.filter(id__in=[s.id for s in sailors]).update(
            division=division
        )
        for sailor in sailors:
            MasterKnowYourRegulator.objects.create(
                department=division.department,
                regulator=division.regulator,
                division=division,
                sailor=sailor,
            )
        return division


# --------------------------------------------------------------------------
# Login / registration page images
# --------------------------------------------------------------------------


class LoginRegistrationImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoginRegistrationImage
        fields = (
            "id",
            "image",
            "name",
            "source",
            "uploaded_at",
            "uploaded_by",
            # "is_active",
            "active",
        )
        read_only_fields = (
            "id",
            "uploaded_at",
        )


class GalleryImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = GalleryImage
        fields = "__all__"
        read_only_fields = ("id", "created_at")


class PersonnelEventSerializer(serializers.Serializer):
    type = serializers.CharField()
    name = serializers.CharField()
    personal_number = serializers.CharField(
        allow_null=True,
        required=False,
    )
    designation = serializers.CharField(
        allow_blank=True,
        allow_null=True,
    )
    event_date = serializers.DateField()
    age = serializers.IntegerField(allow_null=True)
    years = serializers.IntegerField(allow_null=True)
    event_label = serializers.CharField()


class PersonnelEventResponseSerializer(serializers.Serializer):
    status = serializers.CharField()
    count = serializers.IntegerField()
    from_date = serializers.DateField()
    to_date = serializers.DateField()
    today = PersonnelEventSerializer(many=True)
    tomorrow = PersonnelEventSerializer(many=True)
    upcoming = PersonnelEventSerializer(many=True)
    results = PersonnelEventSerializer(many=True)


class PersonnelNumberSerializer(serializers.Serializer):
    personnel_number = serializers.CharField()

    def validate(self, attrs):
        personnel_number = (attrs.get("personnel_number") or "").strip()

        if not personnel_number:
            raise serializers.ValidationError(
                {"personnel_number": "This field is required."}
            )

        attrs["personnel_number"] = personnel_number
        return attrs


class HRCDFMockSerializer(serializers.ModelSerializer):
    class Meta:
        model = HRCDFMock
        fields = (
            "personnel_number",
            "first_name",
            "last_name",
            "rank",
            "unit",
            "designation",
            "nud_mail",
        )
        read_only_fields = fields


class DatabaseResetRequestSerializer(serializers.Serializer):
    confirm = serializers.CharField(
        help_text='Must be exactly "RESET" to proceed. Any other value (or a '
        "missing field) is rejected without touching the database."
    )


# --------------------------------------------------------------------------
# HRCDF roster sync (CP-C) - api/v1/accounts/hrcdf-sync/
# --------------------------------------------------------------------------


# Developed with Understanding: a command option for the sync page's Command filter, one
# master.HrcdfCommand row. The keys id, code and name are the API contract's.
class HrcdfCommandOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = HrcdfCommand
        fields = ("id", "code", "name")


# Developed with Understanding: one master.HrcdfUnit row of the units/ list, with the
# command code flattened as the API contract shapes it. unit_type is already text.
class HrcdfUnitSerializer(serializers.ModelSerializer):
    command_code = serializers.CharField(
        source="command.code", read_only=True, default=None
    )

    class Meta:
        model = HrcdfUnit
        fields = (
            "id",
            "code",
            "name",
            "hrcdf_unit_id",
            "command_id",
            "command_code",
            "unit_type",
            "record_origin",
        )


# Developed with Understanding: the home unit block, read from ShipIdentity and its link to
# the Master_unit this-ship row (D15). code, name and hrcdf_unit_id come from that row. id
# and command_code are those of the matching HrcdfUnit (same code), because the page
# matches them against the units/ ids and the HrcdfCommand codes of its two dropdowns and
# posts that id to home-unit/. Without a matching HrcdfUnit, id is None and command_code
# falls back to the row's MasterCommand code. locked is ShipIdentity.is_locked.
class HrcdfHomeUnitSerializer(serializers.ModelSerializer):
    id = serializers.SerializerMethodField()
    code = serializers.CharField(source="unit.code", read_only=True, default=None)
    name = serializers.CharField(source="unit.name", read_only=True, default=None)
    hrcdf_unit_id = serializers.IntegerField(
        source="unit.hrcdf_unit_id", read_only=True, default=None
    )
    command_code = serializers.SerializerMethodField()
    locked = serializers.BooleanField(source="is_locked", read_only=True)

    class Meta:
        model = ShipIdentity
        fields = ("id", "code", "name", "hrcdf_unit_id", "command_code", "locked")

    # Developed with Understanding: the HrcdfUnit of the this-ship row, looked up once per
    # serialisation by code, then by hrcdf_unit_id.
    def _hrcdf_unit(self, identity):
        if not hasattr(self, "_hrcdf_unit_cache"):
            self._hrcdf_unit_cache = {}
        unit = identity.unit
        if unit is None:
            return None
        if unit.pk not in self._hrcdf_unit_cache:
            match = None
            units = HrcdfUnit.objects.select_related("command")
            if unit.code:
                match = units.filter(code=unit.code).first()
            if match is None and unit.hrcdf_unit_id is not None:
                match = units.filter(hrcdf_unit_id=unit.hrcdf_unit_id).first()
            self._hrcdf_unit_cache[unit.pk] = match
        return self._hrcdf_unit_cache[unit.pk]

    def get_id(self, identity) -> int | None:
        match = self._hrcdf_unit(identity)
        return match.pk if match is not None else None

    def get_command_code(self, identity) -> str | None:
        match = self._hrcdf_unit(identity)
        if match is not None and match.command_id:
            return match.command.code
        unit = identity.unit
        command = getattr(unit, "command", None) if unit is not None else None
        return command.unit_name if command is not None else None


# Developed with Understanding: the JobSummary shape of the API contract, used by
# readiness last_runs and by the inline runs/ response. job_id is the UUID primary key.
class HrcdfSyncJobSummarySerializer(serializers.ModelSerializer):
    job_id = serializers.UUIDField(source="id", read_only=True)

    class Meta:
        model = HrcdfSyncJob
        fields = (
            "job_id",
            "mode",
            "status",
            "started_at",
            "finished_at",
            "total",
            "processed",
            "stats",
            "message",
            "ran_inline",
        )


# Developed with Understanding: body of POST home-unit/.
class HrcdfHomeUnitRequestSerializer(serializers.Serializer):
    unit_id = serializers.IntegerField(min_value=1)


# Developed with Understanding: body of POST runs/. Units are refreshed through
# units/refresh/, so only the two roster modes are accepted here.
class HrcdfRunRequestSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(
        choices=(HrcdfSyncJob.Mode.OWN.value, HrcdfSyncJob.Mode.OTHERS.value)
    )


# Developed with Understanding: one console line of the progress payload.
class HrcdfProgressLineSerializer(serializers.Serializer):
    seq = serializers.IntegerField()
    ts = serializers.CharField()
    level = serializers.CharField()
    text = serializers.CharField(allow_blank=True)


# Developed with Understanding: the progress payload of the API contract, over the dict
# accounts.hrcdf_sync.progress_snapshot returns.
class HrcdfProgressSerializer(serializers.Serializer):
    job_id = serializers.CharField()
    mode = serializers.CharField()
    status = serializers.CharField()
    started_at = serializers.DateTimeField(allow_null=True)
    finished_at = serializers.DateTimeField(allow_null=True)
    host = serializers.CharField(allow_blank=True)
    total = serializers.IntegerField(allow_null=True)
    processed = serializers.IntegerField()
    pages = serializers.IntegerField()
    percent = serializers.FloatField(allow_null=True)
    stats = serializers.DictField()
    message = serializers.CharField(allow_blank=True)
    dropped = serializers.IntegerField()
    first_seq = serializers.IntegerField()
    last_seq = serializers.IntegerField()
    gap = serializers.BooleanField()
    truncated = serializers.BooleanField()
    lines = HrcdfProgressLineSerializer(many=True)


# Developed with Understanding: the personnel row columns both lists share, written once
# (the shared-base pattern doctrine 5.2 names). unit_name is the section column.
HRCDF_PERSONNEL_ROW_FIELDS = (
    "id",
    "personal_number",
    "full_name",
    "rank_name",
    "hrcdf_designation",
    "designation",
    "unit_name",
    "unit_code",
    "command_code",
    "branch_name",
    "user_type_name",
    "hrcdf_is_active",
    "user_active",
    "ship_leaving_date",
    "hrcdf_synced_at",
)


# Developed with Understanding: one own-ship personnel row (personnel/own/).
class HrcdfOwnPersonnelRowSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="section", read_only=True)

    class Meta:
        model = CustomUserProfile
        fields = (*HRCDF_PERSONNEL_ROW_FIELDS, "auth_source")


# Developed with Understanding: one other-unit personnel row (personnel/others/).
# OtherCustomUserProfile has no user_active or ship_leaving_date column, so both are
# always null here to keep the one row shape of the API contract.
class HrcdfOtherPersonnelRowSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="section", read_only=True, default=None)
    user_active = serializers.SerializerMethodField()
    ship_leaving_date = serializers.SerializerMethodField()

    class Meta:
        model = OtherCustomUserProfile
        fields = (*HRCDF_PERSONNEL_ROW_FIELDS, "record_origin")

    def get_user_active(self, obj):
        return None

    def get_ship_leaving_date(self, obj):
        return None


# Developed with Understanding: GET me/unit-status/ (CP-L, D29). Read only - the view hands
# it one dict built from the signed-in user, never a model instance.
class UnitStatusSerializer(serializers.Serializer):
    is_other_unit = serializers.BooleanField(read_only=True)
    role_display = serializers.CharField(read_only=True)
    full_name = serializers.CharField(read_only=True)
    personal_number = serializers.CharField(read_only=True)
    unit_name = serializers.CharField(read_only=True)
    unit_code = serializers.CharField(read_only=True)
    home_ship_display_name = serializers.CharField(read_only=True)
