"""Auth serializers.

Origins:
- ``TokenObtainSerializer`` ....... SWMM CustomTokenObtainPairSerializer
  (account-state checks + embedded RBAC claims) fused with ITTTM
  MyTokenObtainSerializer (RS256, role selection at login, session row,
  cross-service cache write).
- explicit field lists, never ``"__all__"`` on a write path (anti-pattern #2).
- public endpoints return a minimal projection, never the password hash or the
  full org record (anti-pattern #3).
"""

import json
import logging
import uuid
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from authz import rbac
from authz.cache import set_cached_user_profile
from authz.models import Process, UserProcessRoleMapping, UserRole
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import DatabaseError, transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken

from .encryption import AESify, InvalidEncryptedPassword, resolve_login_password
from .models import (
    APPROVAL_APPROVED,
    CustomUser,
    CustomUserProfile,
    LocalCopyDepartment,
    LocalCopyDesignation,
    LocalCopyMasterCommand,
    LocalCopyMasterUnit,
    LocalCopyRank,
    LocalCopySubDepartment,
    UserSession,
)

logger = logging.getLogger(__name__)

aes = AESify(block_len=16, salt_len=4)

User = get_user_model()


# Fields a client may never write on itself or another user (server-controlled).
# Origin: build prompt criterion 2 / anti-pattern #2.
SERVER_CONTROLLED_PROFILE_FIELDS = frozenset(
    {
        "approval_status",
        "user_active",
        "has_credentials",
        "unit_id",
        "unit_name",
        "ship_id",
        "ship_name",
        "satellite_unit_id",
        "satellite_unit_name",
        "department_id",
        "department_name",
        "source_unit_id",
        "source_unit_name",
        "ad_user",
        "role_assigned_by",
        "role_assigned_on",
        "hrcdf_desig",
        "rankCode",
        "rankName",
    }
)


def _client_ip(request):
    if request is None:
        return None
    fwd = request.META.get("HTTP_X_FORWARDED_FOR")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _fetch_hrcdf_details(username):
    """Best-effort personnel lookup, keyed by username. Origin: ITTTM HRCDF
    sync. A lookup failure (HRCDF unset/unreachable/bad payload) is never
    fatal -- it just means this login skips profile enrichment."""
    if not settings.HRCDF_URL:
        return None

    url = f"{settings.HRCDF_URL}?{urlencode({'personnels': username})}"

    try:
        with urlopen(url, timeout=settings.HRCDF_HTTP_TIMEOUT) as response:
            if response.status != 200:
                return None
            payload = json.loads(response.read().decode("utf-8"))

    except (URLError, TimeoutError, ValueError) as exc:
        logger.warning("HRCDF lookup failed for %s: %s", username, exc)
        return None

    records = payload.get("data") or []
    return records[0] if records else None


def _hrcdf_date(payload, key, current):
    """HRCDF sends dates as ISO-8601 datetimes (e.g. "1974-11-21T00:00:00.000+00:00"),
    but our DateField columns only accept YYYY-MM-DD -- parse as a datetime first,
    then fall back to a bare date string."""
    raw = payload.get(key)
    if not raw:
        return current
    parsed = parse_datetime(raw)
    if parsed is not None:
        return parsed.date()
    return parse_date(raw) or current


def build_user_claims(user, *, role_id, process_id, session_id):
    """The RBAC claim block embedded in both refresh and access tokens.

    Delegated roles are included for the SPA but are NOT authoritative for
    enforcement -- every request re-derives them (see authz.rbac /
    LiveJWTAuthentication). Origin: SWMM claim embedding + ITTTM claim set.
    """
    profile = getattr(user, "user_profile", None)
    role_code = ""
    process_code = ""
    if role_id and process_id:
        role_code = (
            UserRole.objects.filter(id=role_id).values_list("code", flat=True).first()
            or ""
        )
        process_code = (
            Process.objects.filter(id=process_id).values_list("code", flat=True).first()
            or ""
        )

    scope = rbac.scope_as_claim(rbac.get_effective_scope(user))
    delegated = [
        {
            "user_role_id": er.role_id,
            "role_code": er.role_code,
            "process_id": er.process_id,
            "delegation_id": er.delegation_id,
            "delegator_id": er.delegator_id,
        }
        for er in rbac.effective_roles(user)
        if er.is_delegated
    ]

    # SWMM-compatible claims, carried alongside the authz_service claim block so
    # the SWMM resource server (which reads is_admin / access_level / role /
    # department_id straight off the token) keeps working unchanged.
    swmm_role = role_code or getattr(getattr(profile, "role", None), "code", "") or ""

    # Developed with Understanding: personal_number claim (decision D1, CP-E), additive.
    # Upper-cased, stripped profile.personal_number when set, else the upper-cased,
    # stripped username, else None - never an empty string. swmm reads it in CP-F.
    personal_number = (
        str(getattr(profile, "personal_number", "") or "").strip().upper()
        or str(user.username or "").strip().upper()
        or None
    )

    return {
        "username": user.username,
        "user_role_id": role_id,
        "role_code": role_code,
        "process_id": process_id,
        "process_code": process_code,
        "unit_id": getattr(profile, "unit_id", None),
        "department_id": getattr(profile, "department_id", None),
        "ship_id": getattr(profile, "ship_id", None),
        "is_super_admin": rbac.is_super_admin(user),
        "session_id": session_id,
        "scope": scope,
        "delegated_roles": delegated,
        # --- SWMM claims ---
        "is_admin": bool(getattr(user, "is_admin", False)),
        "access_level": getattr(profile, "access_level", None),
        "role": swmm_role,
        # Developed with Understanding: identity link for swmm authz_sync (D1).
        "personal_number": personal_number,
    }


# --------------------------------------------------------------------------
# SWMM login-response projection. The SWMM Angular SPA consumes the old
# ``swmm/users`` login shape: a nested ``user`` object with a fully expanded
# ``profile`` block (``*_detail`` sub-objects) + a ``capabilities`` block.
# Ported from ``swmm/users/serializers.py`` (RankSerializer / DesignationSerializer
# / DepartmentSerializer / RoleSerializer / CommandSerializer /
# CustomUserProfileSerializer / CustomUserSerializer).
# --------------------------------------------------------------------------


class RankLoginSerializer(serializers.ModelSerializer):
    class Meta:
        model = LocalCopyRank
        fields = ("id", "name", "department")


class DesignationLoginSerializer(serializers.ModelSerializer):
    class Meta:
        model = LocalCopyDesignation
        fields = ("id", "designation_name")


class SubDepartmentLoginSerializer(serializers.ModelSerializer):
    class Meta:
        model = LocalCopySubDepartment
        fields = ("id", "name", "code")


class DepartmentLoginSerializer(serializers.ModelSerializer):
    subdepartments = SubDepartmentLoginSerializer(many=True, read_only=True)

    class Meta:
        model = LocalCopyDepartment
        fields = ("id", "name", "code", "dep_code", "subdepartments")


class RoleMasterLoginSerializer(serializers.ModelSerializer):
    """``role_master_detail`` -- served from ``authz.UserRole`` (no separate flat
    Role table). ``role_name`` mirrors ``UserRole.name`` for the SPA."""

    role_name = serializers.CharField(source="name", read_only=True)
    assigned_users_count = serializers.SerializerMethodField()

    class Meta:
        model = UserRole
        fields = ("id", "role_name", "assigned_users_count")

    def get_assigned_users_count(self, obj):
        return (
            UserProcessRoleMapping.objects.filter(
                process_role__user_role=obj, is_active=True
            )
            .values("user")
            .distinct()
            .count()
        )


class CommandLoginSerializer(serializers.ModelSerializer):
    class Meta:
        model = LocalCopyMasterCommand
        fields = ("id", "unit_name", "command_name")


class CustomUserProfileLoginSerializer(serializers.ModelSerializer):
    rank_detail = RankLoginSerializer(source="rank", read_only=True)
    designation_master_detail = DesignationLoginSerializer(
        source="designation_master", read_only=True
    )
    department_detail = DepartmentLoginSerializer(
        source="department_ref", read_only=True
    )
    role_master_detail = RoleMasterLoginSerializer(source="role", read_only=True)
    command_name_detail = CommandLoginSerializer(source="command_ref", read_only=True)
    access_level_display = serializers.CharField(
        source="get_access_level_display", read_only=True
    )
    ship = serializers.PrimaryKeyRelatedField(source="ship_ref", read_only=True)
    user_created_on = serializers.DateTimeField(source="created_on", read_only=True)

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
            "profile_picture",
            "nud_mail",
            "email",
            "phone_number",
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
            "has_credentials",
            "is_role",
            "user_created_on",
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
        read_only_fields = ("id",)


# The SWMM SPA's sidebar registry (swmm/users/rbac.py::NAV_ITEMS /
# seed_rbac.NAV_ITEMS "SWMM nav registry" block). authz_service also seeds
# `role_requests` / `delegation` / `rbac_admin` for its own admin screens; the
# SWMM SPA has no route for those, so `capabilities.nav_keys` is filtered to
# this set to keep the login contract stable.
SWMM_NAV_KEYS = frozenset(
    {
        "home",
        "activity_planner",
        "ship_configuration",
        "op_maintenance",
        "inventory",
        "ship_returns",
        "trials",
        "refit_maintenance",
        "other_utilities",
        "kms",
        "help_desk",
        "ship_crew",
        "nav_visibility",
        "users",
    }
)


def build_login_capabilities(user):
    """The ``capabilities`` block on the SWMM login response -- the SPA's guard
    feed. Origin: ``swmm/users`` ``CurrentUserSerializer.get_capabilities``."""
    return {
        "nav_keys": sorted(rbac.visible_nav_keys(user) & SWMM_NAV_KEYS),
        "is_privileged": bool(rbac.is_super_admin(user) or rbac.is_admin(user)),
        "is_guest": bool(rbac.is_guest_or_unassigned(user)),
        "pending_role_requests": rbac.pending_requests_for(user).count(),
    }


class CustomUserLoginSerializer(serializers.ModelSerializer):
    profile = CustomUserProfileLoginSerializer(source="user_profile", read_only=True)
    is_staff = serializers.BooleanField(read_only=True)
    is_superuser = serializers.BooleanField(read_only=True)
    capabilities = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = (
            "id",
            "username",
            "is_active",
            "is_admin",
            "is_staff",
            "is_superuser",
            "profile",
            "user_profile",
            "capabilities",
        )
        read_only_fields = ("id",)

    def get_capabilities(self, obj):
        return build_login_capabilities(obj)


class TokenObtainSerializer(TokenObtainPairSerializer):
    username_field = "username"

    username = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True)
    user_role_id = serializers.IntegerField(required=False, allow_null=True)
    process_id = serializers.IntegerField(required=False, allow_null=True)

    default_error_messages = {
        "no_active_account": "Incorrect username or password.",
    }

    def _resolve_selected_role(self, user, role_id, process_id):
        """Validate the (role, process) the client chose at login against the
        user's active ``UserProcessRoleMapping`` rows (ITTTM
        ``_select_role_process_for_token``). Both or neither must be given."""
        if role_id in (None, "") and process_id in (None, ""):
            first = (
                UserProcessRoleMapping.objects.filter(user=user, is_active=True)
                .select_related("process_role")
                .order_by("process_role__process__name", "id")
                .first()
            )
            if not first:
                return None, None
            return (
                first.process_role.user_role_id,
                first.process_role.process_id,
            )
        if role_id in (None, "") or process_id in (None, ""):
            raise serializers.ValidationError(
                {
                    "message": "Both user_role_id and process_id are required "
                    "when choosing a role."
                }
            )
        mapping = UserProcessRoleMapping.objects.filter(
            user=user,
            is_active=True,
            process_role__user_role_id=role_id,
            process_role__process_id=process_id,
        ).exists()
        if not mapping:
            raise serializers.ValidationError(
                {"message": "You do not have the requested role for this process."}
            )
        return int(role_id), int(process_id)

    def validate(self, attrs):
        request = self.context.get("request")
        username = (attrs.get("username") or "").strip().upper()
        raw_password = attrs.get("password") or ""

        # --- password decrypt: MANDATORY (anti-pattern #4). A decrypt failure
        #     is a rejected login, never a plaintext fallback. ---
        try:
            password = resolve_login_password(raw_password)
        except InvalidEncryptedPassword:
            raise serializers.ValidationError(
                {"message": "Incorrect username or password."}
            )

        user = (
            CustomUser.objects.filter(username=username)
            .select_related("user_profile")
            .first()
        )
        if user is None:
            raise serializers.ValidationError(
                {"message": "Incorrect username or password."}
            )

        # --- credential check: LDAP or local per ad_user ---
        profile = user.user_profile
        if profile is not None and profile.ad_user:
            from .ldap import authenticate_ldap

            if not authenticate_ldap(username, password):
                raise serializers.ValidationError(
                    {"message": "Incorrect username or password."}
                )
        else:
            if not user.check_password(password):
                raise serializers.ValidationError(
                    {"message": "Incorrect username or password."}
                )

        # --- account-state checks (SWMM CustomTokenObtainPairSerializer) ---
        if not user.is_active:
            raise serializers.ValidationError({"message": "Account is disabled."})
        if profile is None:
            raise serializers.ValidationError(
                {"message": "Account has no profile. Contact an administrator."}
            )
        if not profile.user_active:
            raise serializers.ValidationError({"message": "Account is inactive."})
        if profile.approval_status != "APPROVED":
            raise serializers.ValidationError(
                {"message": "Account is pending approval."}
            )
        if not profile.has_credentials:
            raise serializers.ValidationError(
                {"message": "Account has no login credentials enabled."}
            )

        self.user = user

        role_id, process_id = self._resolve_selected_role(
            user, attrs.get("user_role_id"), attrs.get("process_id")
        )

        # --- single active session (settings.ENFORCE_SINGLE_SESSION): a new
        # login ends every other session for this user and blacklists their
        # refresh tokens, so old access tokens die on their next request
        # (LiveJWTAuthentication's session check) and old refresh tokens can
        # no longer mint new ones. ---
        if settings.ENFORCE_SINGLE_SESSION:
            UserSession.objects.filter(user=user, is_active=True).update(
                is_active=False, logout_time=timezone.now()
            )
            stale_tokens = OutstandingToken.objects.filter(user=user).exclude(
                blacklistedtoken__isnull=False
            )
            BlacklistedToken.objects.bulk_create(
                (BlacklistedToken(token=t) for t in stale_tokens),
                ignore_conflicts=True,
            )

        session_id = uuid.uuid4().hex
        UserSession.objects.create(
            user=user,
            username=user.username,
            session_id=session_id,
            login_time=timezone.now(),
            ip_address=_client_ip(request),
            user_agent=(request.META.get("HTTP_USER_AGENT", "") if request else ""),
        )

        refresh = RefreshToken.for_user(user)
        claims = build_user_claims(
            user, role_id=role_id, process_id=process_id, session_id=session_id
        )
        for key, value in claims.items():
            refresh[key] = value
        access = refresh.access_token
        for key, value in claims.items():
            access[key] = value

        # --- cross-service user-profile cache write (ITTTM) ---
        set_cached_user_profile(
            user.id,
            {
                "user_id": user.id,
                "username": user.username,
                "is_super_admin": claims["is_super_admin"],
                "role_code": claims["role_code"],
                "process_id": process_id,
                "user_role_id": role_id,
                "unit_id": claims["unit_id"],
                "department_id": claims["department_id"],
                "ship_id": claims["ship_id"],
                "scope": claims["scope"],
            },
        )

        return {
            "access": str(access),
            "refresh": str(refresh),
            # SWMM login shape: nested identity + expanded profile + capabilities.
            "user": CustomUserLoginSerializer(user, context=self.context).data,
            # Legacy flat keys kept for any other fleet consumer (additive).
            "process_id": process_id,
            "session_id": session_id,
        }


class RefreshTokenSerializer(serializers.Serializer):
    """Body for ``token/access/`` -- a still-valid refresh token, not rotated."""

    refresh = serializers.CharField()


class LogoutSerializer(serializers.Serializer):
    """Body for ``logout/``. ``refresh`` is optional -- blacklisting it is
    best-effort; the session is ended either way."""

    refresh = serializers.CharField(required=False, allow_blank=True)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_old_password(self, value):
        user = self.context["request"].user
        try:
            plain = resolve_login_password(value)
        except InvalidEncryptedPassword:
            raise serializers.ValidationError("Current password is incorrect.")
        if not user.check_password(plain):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        try:
            return resolve_login_password(value)
        except InvalidEncryptedPassword:
            raise serializers.ValidationError("New password could not be read.")

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        # End every other session for this user (SWMM logout-elsewhere intent).
        UserSession.objects.filter(user=user, is_active=True).update(
            is_active=False, logout_time=timezone.now()
        )
        return user


class SignupSerializer(serializers.Serializer):
    """Public self-registration. Explicit allowlist of client-writable fields;
    everything sensitive is server-set (anti-pattern #2 / criterion 2). The
    response is minimal (anti-pattern #3)."""

    username = serializers.CharField(max_length=100)
    password = serializers.CharField(write_only=True, min_length=8)
    firstname = serializers.CharField(max_length=100)
    lastname = serializers.CharField(max_length=100, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    personal_number = serializers.CharField(
        max_length=20, required=False, allow_blank=True
    )
    reason_for_signup = serializers.CharField(required=False, allow_blank=True)

    def validate_username(self, value):
        value = value.strip().upper()
        if CustomUser.objects.filter(username=value).exists():
            raise serializers.ValidationError("That username is taken.")
        return value

    def validate_password(self, value):
        try:
            return resolve_login_password(value)
        except InvalidEncryptedPassword:
            raise serializers.ValidationError("Password could not be read.")

    @transaction.atomic
    def create(self, validated_data):
        profile = CustomUserProfile.objects.create(
            firstname=validated_data["firstname"],
            lastname=validated_data.get("lastname", ""),
            email=validated_data.get("email", ""),
            personal_number=validated_data.get("personal_number", ""),
            reason_for_signup=validated_data.get("reason_for_signup", ""),
            approval_status="PENDING",
            user_active=True,
            has_credentials=False,  # enabled by the approver
        )
        user = CustomUser(username=validated_data["username"], user_profile=profile)
        user.set_password(validated_data["password"])
        user.is_active = True
        user.save()
        return user

    def to_representation(self, instance):
        return {
            "status": "ok",
            "username": instance.username,
            "approval_status": "PENDING",
            "message": "Registration received. An administrator must approve "
            "your account before you can log in.",
        }


class ProfileSelfSerializer(serializers.ModelSerializer):
    """A user editing their OWN profile: only innocuous personal fields are
    writable; every sensitive column is read-only (criterion 2)."""

    class Meta:
        model = CustomUserProfile
        fields = (
            "id",
            "firstname",
            "lastname",
            "email",
            "personal_number",
            "profile_picture",
            "nud_mail",
            "phone_number",
            # read-only mirror of server state, for display:
            "approval_status",
            "user_active",
            "has_credentials",
            "unit_id",
            "unit_name",
            "ship_id",
            "department_id",
            "hrcdf_desig",
        )
        read_only_fields = tuple(SERVER_CONTROLLED_PROFILE_FIELDS & set(fields)) + (
            "id",
        )


class CurrentUserSerializer(serializers.Serializer):
    """``GET /api/auth/me/`` -- identity + ``capabilities`` (the SPA guard feed,
    SWMM ``CurrentUserSerializer.get_capabilities``)."""

    def to_representation(self, user):
        request = self.context.get("request")
        auth = request.auth if isinstance(getattr(request, "auth", None), dict) else {}
        process_id = auth.get("process_id")
        unit_id = auth.get("unit_id")
        profile = getattr(user, "user_profile", None)

        pic = getattr(profile, "profile_picture", None)
        if pic:  # empty ImageFieldFile is falsy; guards "no file associated" ValueError
            profile_image = request.build_absolute_uri(pic.url) if request else pic.url
        else:
            profile_image = None

        from authz.models import Menu

        menu_index = {
            m.id: {"code": m.code, "name": m.name, "parent_id": m.parent_id}
            for m in Menu.objects.all()
        }

        def _as_menu_list(perms):
            return [
                {
                    "menu_code": menu_index[mid]["code"],
                    "menu_name": menu_index[mid]["name"],
                    "actions": actions,
                }
                for mid, actions in perms.items()
                if mid in menu_index
            ]

        # effective_menu = the merged view the SPA guards on (user overrides win,
        # else roles). role_menu / user_menu are the two unmerged inputs, exposed
        # so the RBAC-admin screen can show where each privilege comes from.
        effective_menu = _as_menu_list(
            rbac.effective_menu_permissions(
                user, process_id=process_id, unit_id=unit_id
            )
        )
        role_menu = _as_menu_list(
            rbac.role_menu_permissions(user, process_id=process_id, unit_id=unit_id)
        )
        user_menu = _as_menu_list(rbac.user_menu_permissions(user))

        return {
            "user_id": user.id,
            "username": user.username,
            "full_name": user.get_full_name(),
            "designation": getattr(profile, "designation", ""),
            "email": getattr(profile, "email", ""),
            "profile_image": profile_image,
            "nud_email": getattr(profile, "nud_email", ""),
            "phone_number": getattr(profile, "phone_number", ""),
            "personal_number": getattr(profile, "personal_number", ""),
            "approval_status": getattr(profile, "approval_status", None),
            "capabilities": {
                "role_codes": sorted(rbac.role_codes_of(user, process_id=process_id)),
                "is_super_admin": rbac.is_super_admin(user),
                "effective_scope": rbac.scope_as_claim(rbac.get_effective_scope(user)),
                "effective_menu": effective_menu,
                "role_menu": role_menu,
                "user_menu": user_menu,
                "visible_nav_keys": sorted(rbac.visible_nav_keys(user)),
                "pending_role_requests": rbac.pending_requests_for(user).count(),
                "delegated_roles": [
                    {
                        "role_code": er.role_code,
                        "process_id": er.process_id,
                        "delegation_id": er.delegation_id,
                    }
                    for er in rbac.effective_roles(user)
                    if er.is_delegated
                ],
            },
        }


class UserSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSession
        fields = (
            "id",
            "session_id",
            "login_time",
            "logout_time",
            "ip_address",
            "user_agent",
            "is_active",
        )
        read_only_fields = fields


class ApprovalQueueSerializer(serializers.ModelSerializer):
    """Approver's view of a pending signup -- explicit, minimal projection."""

    username = serializers.SerializerMethodField()

    class Meta:
        model = CustomUserProfile
        fields = (
            "id",
            "username",
            "firstname",
            "lastname",
            "email",
            "personal_number",
            "reason_for_signup",
            "approval_status",
            "created_on",
        )
        read_only_fields = fields

    def get_username(self, obj):
        u = (
            CustomUser.objects.filter(user_profile=obj)
            .values_list("username", flat=True)
            .first()
        )
        return u


class EditUserProfileRankDesignationSerializer(serializers.Serializer):
    """Nested ``profile`` object accepted by ``EditUserProfileAPIView``."""

    rank = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    designation = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )


class EditUserProfileSerializer(serializers.Serializer):
    """Documents the PUT/PATCH body for ``EditUserProfileAPIView`` -- the view
    reads each field ad hoc off ``request.data`` rather than through a
    serializer, so this exists for the API schema/Swagger only and is not
    used to validate."""

    username = serializers.CharField(required=False)
    firstname = serializers.CharField(required=False)
    lastname = serializers.CharField(required=False, allow_blank=True)
    executive_sub_department = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    is_ood = serializers.BooleanField(required=False)
    is_regulator = serializers.BooleanField(required=False)
    profile = EditUserProfileRankDesignationSerializer(required=False)
    role_master = serializers.IntegerField(required=False, allow_null=True)
    account_active = serializers.BooleanField(required=False)


# ---------------------------------------------------------------------------
# JWT Serializer
# ---------------------------------------------------------------------------


class MyTokenObtainSerializer(TokenObtainPairSerializer):
    permission_classes = (AllowAny,)

    username = serializers.CharField(
        max_length=255,
        required=True,
    )

    password = serializers.CharField(
        max_length=255,
        required=True,
        write_only=True,
    )

    default_error_messages = {"Error": "Incorrect username or password"}

    # -----------------------------------------------------------------------
    # Request validation
    # -----------------------------------------------------------------------

    def to_internal_value(self, data):

        username = data.get("username")
        password = data.get("password")

        if not password or not username:
            raise serializers.ValidationError(
                {
                    "status": "error",
                    "message": "Incorrect username or password",
                }
            )

        return data

    # -----------------------------------------------------------------------
    # AD provisioning / HRCDF enrichment helpers
    # -----------------------------------------------------------------------

    @staticmethod
    def _provision_from_ad(username, password, local_user):
        """A user who just passed an AD bind is authoritative for identity.
        Sync their local password hash so it works even if LDAP_AUTH is later
        turned off, and auto-create a minimal record on first sight."""

        if local_user is not None:
            local_user.set_password(password)
            local_user.save(update_fields=["password"])

            profile = local_user.user_profile

            if profile is not None and not profile.ad_user:
                profile.ad_user = True
                profile.save(update_fields=["ad_user"])

            return local_user

        default_role = UserRole.objects.filter(code=rbac.ROLE_USER).first()

        default_email = f"{username.lower()}@nausena.mil"

        profile = CustomUserProfile.objects.create(
            email=default_email,
            nud_mail=default_email,
            ad_user=True,
            approval_status=APPROVAL_APPROVED,
            user_active=True,
            has_credentials=True,
            role=default_role,
        )

        user = CustomUser(username=username, user_profile=profile)
        user.set_password(password)
        user.is_active = True
        user.save()

        return user

    @staticmethod
    def _refresh_from_hrcdf(user):
        """Keep rank/designation/unit fresh on every login (build-prompt
        request). Best-effort: no HRCDF data means the existing profile
        values are left untouched."""

        profile = getattr(user, "user_profile", None)

        if profile is None:
            return

        hrcdf_user = _fetch_hrcdf_details(user.username)

        if not hrcdf_user:
            return

        profile.firstname = hrcdf_user.get("firstName", profile.firstname)
        profile.lastname = hrcdf_user.get("lastName", profile.lastname)
        profile.hrcdf_desig = hrcdf_user.get("designationIdm", profile.hrcdf_desig)
        profile.rankCode = hrcdf_user.get("rankCode", profile.rankCode)
        profile.rankName = hrcdf_user.get("rankName", profile.rankName)
        profile.personal_number = hrcdf_user.get(
            "personnelNumber", profile.personal_number
        )
        profile.nud_mail = hrcdf_user.get("nudEmailId", profile.nud_mail)
        profile.email = hrcdf_user.get("personnelEmailId", profile.email)
        profile.phone_number = hrcdf_user.get(
            "personalMobileNumber", profile.phone_number
        )
        profile.designation = hrcdf_user.get("designation", profile.designation)
        profile.unit_id = hrcdf_user.get("unitCode", profile.unit_id)
        profile.unit_name = hrcdf_user.get("unitName", profile.unit_name)
        profile.command_id = hrcdf_user.get("commandId", profile.command_id)

        profile.command_name = hrcdf_user.get("commandName", profile.command_name)

        profile.department_id = hrcdf_user.get("branchCode", profile.department_id)

        profile.department_name = hrcdf_user.get("branchName", profile.department_name)
        profile.source_unit_id = hrcdf_user.get("gxUnitCode", profile.source_unit_id)
        profile.source_unit_name = hrcdf_user.get(
            "gxUnitName", profile.source_unit_name
        )
        profile.ship_leaving_date = hrcdf_user.get(
            "dateOfRetirement", profile.ship_leaving_date
        )
        profile.date_of_birth = _hrcdf_date(
            hrcdf_user, "dateOfBirth", profile.date_of_birth
        )
        profile.date_of_joining = _hrcdf_date(
            hrcdf_user, "dateOfJoining", profile.date_of_joining
        )
        profile.marriage_date = _hrcdf_date(
            hrcdf_user, "dateOfMarriage", profile.marriage_date
        )
        profile.is_married = bool(profile.marriage_date)

        profile.user_type = hrcdf_user.get("userTypeName", profile.user_type)

        # FK lookups are best-effort: if no matching master row exists, the
        # existing reference is left untouched instead of failing the login.
        profile.rank = (
            LocalCopyRank.objects.filter(name=profile.rankName).first() or profile.rank
        )
        profile.designation_master = (
            LocalCopyDesignation.objects.filter(
                designation_name=profile.designation
            ).first()
            or profile.designation_master
        )
        profile.department_ref = (
            LocalCopyDepartment.objects.filter(name=profile.department_name).first()
            or profile.department_ref
        )
        profile.command_ref = (
            LocalCopyMasterCommand.objects.filter(
                command_name=profile.command_name
            ).first()
            or profile.command_ref
        )
        profile.unit_ref = (
            LocalCopyMasterUnit.objects.filter(name=profile.unit_name).first()
            or profile.unit_ref
        )

        profile.save(
            update_fields=[
                "firstname",
                "lastname",
                "hrcdf_desig",
                "rankCode",
                "rankName",
                "personal_number",
                "nud_mail",
                "phone_number",
                "designation",
                "unit_id",
                "unit_name",
                "command_id",
                "command_name",
                "department_id",
                "department_name",
                "source_unit_id",
                "source_unit_name",
                "ship_leaving_date",
                "date_of_birth",
                "date_of_joining",
                "marriage_date",
                "is_married",
                "user_type",
                "rank",
                "designation_master",
                "department_ref",
                "command_ref",
                "unit_ref",
            ]
        )

    # -----------------------------------------------------------------------
    # Login
    # -----------------------------------------------------------------------

    def validate(self, attrs):

        # -------------------------------------------------------------------
        # Password decryption
        # -------------------------------------------------------------------

        try:
            attrs["password"] = aes.decrypt(attrs["password"])

        except Exception:
            # Keep original password if it is not encrypted.
            attrs["password"] = attrs["password"]

        # -------------------------------------------------------------------
        # Find local user
        # -------------------------------------------------------------------

        local_user = (
            User.objects.select_related("user_profile")
            .filter(username__iexact=attrs["username"])
            .first()
        )

        profile = local_user.user_profile if local_user else None

        # -------------------------------------------------------------------
        # Determine whether LDAP should be used
        # -------------------------------------------------------------------

        is_ad_user = profile.ad_user if profile else True

        # -------------------------------------------------------------------
        # Normalize username using stored database spelling
        # -------------------------------------------------------------------

        if local_user:
            attrs["username"] = local_user.username

        # ===================================================================
        # LDAP / ACTIVE DIRECTORY
        # ===================================================================

        ad_authenticated = False

        if settings.LDAP_AUTH and is_ad_user:
            from .ldap import authenticate_ldap

            ad_authenticated = authenticate_ldap(attrs["username"], attrs["password"])

        # ===================================================================
        # SAVE / UPDATE LOCAL USER FROM AD
        # ===================================================================

        if ad_authenticated:
            local_user = self._provision_from_ad(
                attrs["username"], attrs["password"], local_user
            )

        # ===================================================================
        # LOCAL DJANGO AUTHENTICATION
        # ===================================================================
        # Falls back to the local password hash whenever AD did not
        # authenticate this login (LDAP off, not an AD account, or a failed
        # bind) -- an existing local account still works on its own hash.

        data = super().validate(attrs)

        # ===================================================================
        # ACCOUNT-STATE CHECKS
        # ===================================================================

        user_profile = getattr(self.user, "user_profile", None)

        if not self.user.is_active:
            raise AuthenticationFailed("Account is disabled.")

        if user_profile is None:
            raise AuthenticationFailed(
                "Account has no profile. Contact an administrator."
            )

        if not user_profile.user_active:
            raise AuthenticationFailed("Account is inactive.")

        if user_profile.approval_status != APPROVAL_APPROVED:
            raise AuthenticationFailed("Account is pending approval.")

        if not user_profile.has_credentials:
            raise AuthenticationFailed("Account has no login credentials enabled.")

        # ===================================================================
        # HRCDF ENRICHMENT
        # ===================================================================
        # Every login, per build-prompt request -- keeps rank/designation/
        # unit fresh. Best-effort: never blocks or fails the login.

        self._refresh_from_hrcdf(self.user)

        # ===================================================================
        # LOGIN INFORMATION
        # ===================================================================

        request = self.context["request"]

        log_ip = _client_ip(request)

        log_datetime = timezone.now()

        # ===================================================================
        # USER SESSION
        # ===================================================================

        session_id = uuid.uuid4().hex

        try:
            # End any previous active session for this user.
            UserSession.objects.filter(user=self.user, is_active=True).update(
                is_active=False, logout_time=log_datetime
            )

            UserSession.objects.create(
                user=self.user,
                username=self.user.username,
                session_id=session_id,
                login_time=log_datetime,
                ip_address=log_ip,
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )

        except DatabaseError as exc:
            logger.error(
                "Database error while creating user session for user %s: %s",
                self.user.id,
                exc,
            )

            raise ValueError(
                "Unable to create user session "
                "due to a database error. "
                "Please try again."
            )

        # Developed with Understanding: re-mint the pair through build_user_claims
        # AFTER _refresh_from_hrcdf and the session row (D1, R1 OB21), with the same
        # claim loop LiveTokenRefreshView and AccessTokenView use, so the first
        # access token carries the refreshed claim set including personal_number.
        # V2 selects no role, so role_id and process_id stay None, as a refresh of
        # this token re-derives them. Only the values of "refresh" and "access"
        # change - the response keys are untouched.
        refresh = RefreshToken.for_user(self.user)
        claims = build_user_claims(
            self.user, role_id=None, process_id=None, session_id=session_id
        )
        for key, value in claims.items():
            refresh[key] = value
        access = refresh.access_token
        for key, value in claims.items():
            access[key] = value
        data["refresh"] = str(refresh)
        data["access"] = str(access)

        # ===================================================================
        # RESPONSE
        # ===================================================================

        user_profile = getattr(self.user, "user_profile", None)

        data["session_id"] = session_id

        data["user_id"] = self.user.id

        data["login_name"] = self.user.username

        data["user_email"] = getattr(user_profile, "email", "")

        data["first_name"] = getattr(user_profile, "firstname", "")

        data["last_name"] = getattr(user_profile, "lastname", "")

        data["rank_code"] = getattr(user_profile, "rankCode", "")

        data["rank_name"] = getattr(user_profile, "rankName", "")

        data["designation"] = getattr(user_profile, "hrcdf_desig", "")

        data["unit_name"] = getattr(user_profile, "unit_name", "")

        data["unit_id"] = getattr(user_profile, "unit_id", None)

        # ===================================================================
        # RETURN
        # ===================================================================

        return data
