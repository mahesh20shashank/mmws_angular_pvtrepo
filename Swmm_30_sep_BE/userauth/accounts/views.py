"""Auth endpoints.

- token / refresh / logout / change-password
- signup (public, minimal response) + approval queue + approve/reject (role-gated)
- me (identity + capabilities)

Every mutating view sets an explicit permission class (build prompt criterion
11). ``get_permissions`` gates per-action where a viewset is used, in the
spirit of SWMM ``UserViewSet.get_permissions`` + ``_authorize_manage``.
"""

# test comment
from authz import rbac
from authz.cache import invalidate_user_profile
from authz.models import UserProcessRoleMapping
from authz.permissions import HasRole
from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from .models import (
    CustomUser,
    CustomUserProfile,
    LocalCopyDesignation,
    LocalCopyRank,
    UserSession,
)
from .serializers import (
    ApprovalQueueSerializer,
    ChangePasswordSerializer,
    CustomUserLoginSerializer,
    EditUserProfileSerializer,
    LogoutSerializer,
    MyTokenObtainSerializer,
    ProfileSelfSerializer,
    RefreshTokenSerializer,
    SignupSerializer,
    TokenObtainSerializer,
    UserSessionSerializer,
)

User = get_user_model()


class TokenObtainView(APIView):
    """POST /api/auth/token/  -- public login."""

    authentication_classes = ()
    permission_classes = (AllowAny,)
    serializer_class = TokenObtainSerializer

    def post(self, request):
        serializer = TokenObtainSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class TokenObtainV2View(APIView):
    """POST /api/auth/token/v2/ -- test endpoint for MyTokenObtainSerializer
    (AD bind -> auto-provision/sync -> HRCDF enrichment). Not the production
    login path; exists to exercise that flow in isolation."""

    authentication_classes = ()
    permission_classes = (AllowAny,)
    serializer_class = MyTokenObtainSerializer

    def post(self, request):
        serializer = MyTokenObtainSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


def _resolve_live_refresh(raw):
    """Shared live re-validation for ``token/refresh/`` and ``token/access/``.

    Returns ``(context, error)`` with exactly one non-None. ``context`` is
    ``{"token", "user", "role_id", "process_id", "session_id"}`` -- the parsed
    refresh token plus the *re-derived* role selection (a since-revoked mapping
    is cleared, not rejected). ``error`` is a ready ``Response`` (400/401).

    Old-token claims are never trusted (anti-pattern #6 / criterion 8):
    is_active, profile.user_active, approval_status == APPROVED, a live
    ``UserSession`` and the selected mapping are all re-checked here.
    """
    if not raw:
        return None, Response(
            {"status": "error", "message": "refresh token is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        token = RefreshToken(raw)
    except TokenError:
        return None, Response(
            {"status": "error", "message": "Token is invalid or expired."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    user_id = token.get("user_id")
    session_id = token.get("session_id")
    role_id = token.get("user_role_id")
    process_id = token.get("process_id")

    user = CustomUser.objects.filter(id=user_id).select_related("user_profile").first()
    if user is None or not user.is_active:
        return None, Response(
            {"status": "error", "message": "Account is unavailable."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    profile = user.user_profile
    if (
        profile is None
        or not profile.user_active
        or (profile.approval_status != "APPROVED")
    ):
        return None, Response(
            {"status": "error", "message": "Account is unavailable."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    if (
        session_id
        and not UserSession.objects.filter(
            session_id=session_id, user=user, is_active=True
        ).exists()
    ):
        return None, Response(
            {"status": "error", "message": "Session has ended."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    if (
        role_id
        and process_id
        and not UserProcessRoleMapping.objects.filter(
            user=user,
            is_active=True,
            process_role__user_role_id=role_id,
            process_role__process_id=process_id,
        ).exists()
    ):
        # Selected role gone -- drop the selection rather than 401 so the
        # SPA can prompt for a new one.
        role_id = process_id = None

    return (
        {
            "token": token,
            "user": user,
            "role_id": role_id,
            "process_id": process_id,
            "session_id": session_id,
        },
        None,
    )


class LiveTokenRefreshView(TokenRefreshView):
    """POST /api/v1/auth/token/refresh/

    SimpleJWT rotates + blacklists. On top of that we reload the user and
    re-check: is_active, profile.user_active, approval_status == APPROVED, the
    session is still live, and the selected mapping is still active. Dead
    delegated roles fall away automatically because claims are rebuilt from
    ``authz.rbac`` (anti-pattern #6 / criterion 8).
    """

    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request, *args, **kwargs):
        ctx, error = _resolve_live_refresh(request.data.get("refresh"))
        if error is not None:
            return error
        old = ctx["token"]
        user = ctx["user"]
        role_id, process_id = ctx["role_id"], ctx["process_id"]
        session_id = ctx["session_id"]

        # rotate + blacklist the presented token
        try:
            old.blacklist()
        except AttributeError:
            pass

        from .serializers import build_user_claims

        new_refresh = RefreshToken.for_user(user)
        claims = build_user_claims(
            user, role_id=role_id, process_id=process_id, session_id=session_id
        )
        for key, value in claims.items():
            new_refresh[key] = value
        access = new_refresh.access_token
        for key, value in claims.items():
            access[key] = value

        return Response(
            {"access": str(access), "refresh": str(new_refresh)},
            status=status.HTTP_200_OK,
        )


class AccessTokenView(APIView):
    """POST /api/v1/auth/token/access/

    Mint a fresh *access* token from a still-valid refresh token **without**
    rotating it -- the same refresh token stays usable until it expires. Runs
    the identical live re-validation as ``token/refresh/`` (is_active, profile
    state, live session, active selected mapping); a selected role that has
    since been revoked is dropped from the new claims rather than 401'd.

    Use ``token/refresh/`` when you also want a rotated refresh token; use this
    on a short cadence to keep just the access token warm.
    """

    authentication_classes = ()
    permission_classes = (AllowAny,)

    @extend_schema(request=RefreshTokenSerializer)
    def post(self, request, *args, **kwargs):
        ctx, error = _resolve_live_refresh(request.data.get("refresh"))
        if error is not None:
            return error

        from .serializers import build_user_claims

        access = AccessToken.for_user(ctx["user"])
        claims = build_user_claims(
            ctx["user"],
            role_id=ctx["role_id"],
            process_id=ctx["process_id"],
            session_id=ctx["session_id"],
        )
        for key, value in claims.items():
            access[key] = value

        return Response({"access": str(access)}, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """POST /api/auth/logout/ -- blacklist refresh + mark session inactive."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(request=LogoutSerializer)
    def post(self, request):
        raw = request.data.get("refresh")
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except (TokenError, AttributeError):
                pass
        auth = request.auth if isinstance(getattr(request, "auth", None), dict) else {}
        session_id = auth.get("session_id")
        qs = UserSession.objects.filter(user=request.user, is_active=True)
        if session_id:
            qs = qs.filter(session_id=session_id)
        qs.update(is_active=False, logout_time=timezone.now())
        invalidate_user_profile(request.user.id)
        return Response({"status": "ok"}, status=status.HTTP_200_OK)


class ChangePasswordView(APIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = ChangePasswordSerializer

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"status": "ok"}, status=status.HTTP_200_OK)


class SignupView(APIView):
    """POST /api/auth/signup/ -- public, minimal response."""

    authentication_classes = ()
    permission_classes = (AllowAny,)
    serializer_class = SignupSerializer

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            serializer.to_representation(user), status=status.HTTP_201_CREATED
        )


@extend_schema_view(patch=extend_schema(request=ProfileSelfSerializer))
class MeView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user.__class__.objects.select_related(
            "user_profile__rank",
            "user_profile__designation_master",
            "user_profile__department_ref",
            "user_profile__role",
            "user_profile__command_ref",
            "user_profile__ship_ref",
        ).get(pk=request.user.pk)
        return Response(
            CustomUserLoginSerializer(user, context={"request": request}).data
        )

    def patch(self, request):
        """Self-edit: only innocuous personal fields. Any attempt to set a
        server-controlled field is simply not in the serializer's field list,
        so it is ignored -- never persisted (criterion 2)."""
        profile = request.user.user_profile
        if profile is None:
            return Response(
                {"status": "error", "message": "No profile."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = ProfileSelfSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        invalidate_user_profile(request.user.id)
        return Response(serializer.data)


class MySessionsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        qs = UserSession.objects.filter(user=request.user)
        return Response(UserSessionSerializer(qs, many=True).data)


class ApprovalQueueView(APIView):
    """GET pending signups. Role-gated: SUPER_ADMIN / COMMAND_ADMIN / UNIT_ADMIN
    (an approver only sees requests inside their own scope)."""

    permission_classes = (IsAuthenticated, HasRole)
    required_role_codes = (
        rbac.ROLE_SUPER_ADMIN,
        rbac.ROLE_COMMAND_ADMIN,
        rbac.ROLE_UNIT_ADMIN,
    )

    def get(self, request):
        qs = CustomUserProfile.objects.filter(approval_status="PENDING").order_by(
            "created_on"
        )
        if not rbac.is_super_admin(request.user):
            scope = rbac.get_effective_scope(request.user)
            if not (scope["is_super_admin"] or scope["all_commands"]):
                unit_ids = scope["ship_ids"] | scope["satellite_unit_ids"]
                qs = qs.filter(unit_id__in=list(unit_ids)) if unit_ids else qs.none()
        return Response(ApprovalQueueSerializer(qs, many=True).data)


class ApprovalActionView(APIView):
    """POST /api/auth/approval/<profile_id>/approve|reject  -- role-gated."""

    permission_classes = (IsAuthenticated, HasRole)
    required_role_codes = (
        rbac.ROLE_SUPER_ADMIN,
        rbac.ROLE_COMMAND_ADMIN,
        rbac.ROLE_UNIT_ADMIN,
    )

    @transaction.atomic
    def post(self, request, profile_id, action):
        if action not in ("approve", "reject"):
            return Response(
                {"status": "error", "message": "Unknown action."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        profile = (
            CustomUserProfile.objects.select_for_update()
            .filter(id=profile_id, approval_status="PENDING")
            .first()
        )
        if profile is None:
            return Response(
                {"status": "error", "message": "No pending profile with that id."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if action == "approve":
            profile.approval_status = "APPROVED"
            profile.has_credentials = True
        else:
            profile.approval_status = "REJECTED"
            profile.has_credentials = False
        profile.save(update_fields=["approval_status", "has_credentials", "updated_on"])
        for u in CustomUser.objects.filter(user_profile=profile):
            invalidate_user_profile(u.id)
        return Response({"status": "ok", "approval_status": profile.approval_status})


class UserListAPIView(APIView):
    """
    GET /api/users/

    Returns users visible to the logged-in user according to RBAC.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        try:
            user_profile = request.user.user_profile
            user_dep_name = getattr(
                user_profile.department_ref,
                "name",
                None,
            )
        except (
            AttributeError,
            CustomUserProfile.DoesNotExist,
        ):
            user_profile = None
            user_dep_name = None

        # Preserve existing RBAC visibility logic.
        scoped_profiles = rbac.visible_profiles_for(request.user)

        is_legacy_admin = (
            getattr(user_profile.role, "name", None) == rbac.ROLE_SUPER_ADMIN
        )

        users_qs = CustomUser.objects.select_related(
            "user_profile__department_ref",
            "user_profile__role",
            "user_profile__role_assigned_by",
        ).filter(
            user_profile__in=scoped_profiles,
            user_profile__isnull=False,
        )

        # Non-legacy-admin users should only see personnel
        # whose personal number starts with a digit.
        # if not is_legacy_admin:
        #     users_qs = users_qs.filter(user_profile__personal_number__regex=r"^\d")

        users_qs = users_qs.order_by("-id")

        users = []

        for user in users_qs:
            profile = user.user_profile

            role = getattr(profile, "role", None)
            department = getattr(profile, "department_ref", None)
            role_assigned_by = getattr(
                profile,
                "role_assigned_by",
                None,
            )

            users.append(
                {
                    "id": user.id,
                    "username": user.username,
                    "is_active": user.is_active,
                    "is_admin": getattr(user, "is_admin", False),
                    "personal_number": profile.personal_number,
                    "firstname": profile.firstname,
                    "lastname": profile.lastname,
                    "name": (f"{profile.firstname} {profile.lastname}".strip()),
                    "department": (department.name if department else None),
                    "department_id": (department.id if department else None),
                    "role": (role.name if role else None),
                    "role_id": (role.id if role else None),
                    "role_assigned_by": (
                        role_assigned_by.id if role_assigned_by else None
                    ),
                    "user_active": profile.user_active,
                    "is_role": profile.is_role,
                    "is_ood": profile.is_ood,
                    "is_regulator": profile.is_regulator,
                    "executive_sub_department": (profile.executive_sub_department),
                }
            )

        # Preserve the existing RBAC logic.
        pending_requests = [
            {
                "id": pr.id,
                "requester_id": pr.requester_id,
                "requester_name": (
                    f"{pr.requester.firstname} {pr.requester.lastname}".strip()
                    if pr.requester
                    else None
                ),
                "requested_role_id": pr.requested_role_id,
                "requested_role": (
                    pr.requested_role.role_name if pr.requested_role else None
                ),
                "department": (pr.department.name if pr.department else None),
                "status": pr.status,
                "source": pr.source,
                "remarks": pr.remarks,
                "created_on": pr.created_on,
                "acted_on": pr.acted_on,
            }
            for pr in rbac.pending_requests_for(request.user).select_related(
                "requester",
                "requested_role",
                "department",
            )
        ]

        assignable_roles = rbac.assignable_roles(request.user).filter(
            id__in=rbac.active_roles()
        )

        roles = [
            {
                "id": role.id,
                "role_name": role.name,
            }
            for role in assignable_roles
        ]

        return Response(
            {
                "status": "success",
                "title": "User Management",
                "department": user_dep_name,
                "users_count": len(users),
                "users": users,
                "pending_requests": pending_requests,
                "assignable_roles": roles,
            },
            status=status.HTTP_200_OK,
        )


class EditUserProfileAPIView(APIView):
    """
    GET  /api/users/<user_id>/edit/
    PUT  /api/users/<user_id>/edit/
    PATCH /api/users/<user_id>/edit/

    Converts EditUserProfileView to a JSON API.

    Expected PATCH/PUT example:

    {
        "username": "1234",
        "firstname": "John",
        "lastname": "Doe",
        "designation": "ENGINEER",
        "rank": "Captain",
        "designation": 2,
        "role_master": 2,
        "executive_sub_department": "HULL MAINT",
        "is_ood": true,
        "is_regulator": false
    }
    """

    permission_classes = (IsAuthenticated,)
    serializer_class = EditUserProfileSerializer

    def get_object(self, user_id):
        return get_object_or_404(
            CustomUser.objects.select_related(
                "user_profile",
                "user_profile__department_ref",
                "user_profile__role",
            ),
            id=user_id,
        )

    def _check_visibility(self, request, profile):
        return rbac.visible_profiles_for(request.user).filter(pk=profile.pk).exists()

    def get(self, request, user_id):
        user_to_edit = self.get_object(user_id)
        profile = user_to_edit.user_profile

        if not self._check_visibility(request, profile):
            return Response(
                {
                    "status": "error",
                    "message": "This user is not in your department.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        role = profile.role
        department = profile.department_ref
        rank = getattr(profile, "rank", None)
        designation_master = getattr(profile, "designation_master", None)

        return Response(
            {
                "status": "success",
                "user": {
                    "id": user_to_edit.id,
                    "username": user_to_edit.username,
                    "is_active": user_to_edit.is_active,
                },
                "profile": {
                    "id": profile.id,
                    "personal_number": profile.personal_number,
                    "firstname": profile.firstname,
                    "lastname": profile.lastname,
                    "department": (department.name if department else None),
                    "department_id": (department.id if department else None),
                    "role_master": (role.id if role else None),
                    "role_name": (role.name if role else None),
                    "executive_sub_department": (profile.executive_sub_department),
                    "is_ood": profile.is_ood,
                    "is_regulator": profile.is_regulator,
                    "user_active": profile.user_active,
                    "is_role": profile.is_role,
                    "rank": (rank.pk if rank else None),
                    "designation": (
                        designation_master.pk if designation_master else None
                    ),
                    "date_of_marrige": profile.marriage_date,
                },
                # Drives the Account Status switch vs a read-only badge on the
                # frontend. Enforced server-side in _update below regardless of
                # what the client renders -- this flag is presentation only.
                "can_set_account_status": rbac.can_set_account_status(
                    request.user, user_to_edit
                ),
            },
            status=status.HTTP_200_OK,
        )

    @transaction.atomic
    def put(self, request, user_id):
        return self._update(request, user_id, partial=False)

    @transaction.atomic
    def patch(self, request, user_id):
        return self._update(request, user_id, partial=True)

    def _update(self, request, user_id, partial=False):
        user_to_edit = self.get_object(user_id)
        profile_to_edit = user_to_edit.user_profile

        if not self._check_visibility(
            request,
            profile_to_edit,
        ):
            return Response(
                {
                    "status": "error",
                    "message": "This user is not in your department.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        original_role_id = profile_to_edit.role_master_id

        # ---------------------------------------------------------
        # Basic user fields
        # ---------------------------------------------------------

        if "username" in request.data:
            username = request.data.get("username")

            if not username:
                return Response(
                    {
                        "status": "error",
                        "message": "Username cannot be empty.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user_to_edit.username = username

        # Code note: may this viewer work the Account Status switch. The two
        # admin roles only, and never on their own row -- see
        # rbac.can_set_account_status. Computed once and used below, so the
        # decision matches what GET reported to the frontend.
        can_set_status = rbac.can_set_account_status(request.user, user_to_edit)

        # ---------------------------------------------------------
        # Profile fields
        # ---------------------------------------------------------

        if "firstname" in request.data:
            firstname = request.data.get("firstname")

            if not firstname:
                return Response(
                    {
                        "status": "error",
                        "message": "First name cannot be empty.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            profile_to_edit.firstname = firstname

        if "lastname" in request.data:
            profile_to_edit.lastname = request.data.get("lastname") or ""

        if "executive_sub_department" in request.data:
            profile_to_edit.executive_sub_department = request.data.get(
                "executive_sub_department"
            )

        if "is_ood" in request.data:
            profile_to_edit.is_ood = self._parse_boolean(request.data.get("is_ood"))

        if "is_regulator" in request.data:
            profile_to_edit.is_regulator = self._parse_boolean(
                request.data.get("is_regulator")
            )

        if "profile" in request.data:
            rank = request.data.get("profile").get("rank")
            designation = request.data.get("profile").get("designation")

            if designation in ("", None):
                profile_to_edit.designation = None
            else:
                try:
                    profile_to_edit.designation_master = (
                        LocalCopyDesignation.objects.get(designation_name=designation)
                    )
                    profile_to_edit.designation = designation
                except (LocalCopyDesignation.DoesNotExist, ValueError, TypeError):
                    return Response(
                        {
                            "status": "error",
                            "message": "Invalid Designation.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            if rank in ("", None):
                profile_to_edit.rank = None
            else:
                try:
                    profile_to_edit.rank = LocalCopyRank.objects.filter(name=rank)[0]
                except (LocalCopyRank.DoesNotExist, ValueError, TypeError):
                    rank = LocalCopyRank.objects.create(name=rank)
                    profile_to_edit.rank = rank
                    # return Response( #NOSONAR
                    #     {
                    #         "status": "error",
                    #         "message": "Invalid rank.",
                    #     },
                    #     status=status.HTTP_400_BAD_REQUEST,
                    # )

        # ---------------------------------------------------------
        # Role change
        # ---------------------------------------------------------

        if "role_master" in request.data:
            role_id = request.data.get("role_master")

            if role_id in ("", None):
                new_role = None
            else:
                try:
                    new_role = rbac.get_role(role_id)
                except Exception:
                    return Response(
                        {
                            "status": "error",
                            "message": "Invalid role_master.",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            new_role_id = new_role.id if new_role else None

            if new_role_id != original_role_id:
                if not rbac.can_assign_role(
                    request.user,
                    profile_to_edit,
                    new_role,
                ):
                    role_label = new_role.role_name if new_role else "no role"

                    return Response(
                        {
                            "status": "error",
                            "message": (
                                f"You may not grant {role_label} to this user."
                            ),
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

                profile_to_edit.role_master = new_role

                rbac.stamp_role_assignment(
                    profile_to_edit,
                    rbac.get_profile(request.user),
                )

        # ---------------------------------------------------------
        # Account status
        # ---------------------------------------------------------
        # Only the two admin roles may work this switch, and never on their
        # own account (rbac.can_set_account_status). When they do hold the
        # right, an absent/unparseable value PRESERVES the account's current
        # status rather than reactivating it -- that is the regression this
        # replaces (every save used to hardcode is_active=True). For Command
        # and the HODs -- who cannot set this switch -- saving this form
        # still means "approve", which is how a self-registered user
        # (created is_active=False by RegisterView) is let in.
        if can_set_status:
            account_active = self._parse_boolean(request.data.get("account_active"))
            if account_active is None:
                account_active = user_to_edit.is_active
        else:
            account_active = True

        profile_to_edit.user_active = account_active
        profile_to_edit.is_role = True

        profile_to_edit.save()

        user_to_edit.is_active = account_active
        user_to_edit.save()

        return Response(
            {
                "status": "success",
                "message": (
                    f"Successfully updated profile for {user_to_edit.username}."
                ),
                "user_id": user_to_edit.id,
                "username": user_to_edit.username,
            },
            status=status.HTTP_200_OK,
        )

    @staticmethod
    def _parse_boolean(value):
        if isinstance(value, bool):
            return value

        if value is None or value == "":
            return None

        if isinstance(value, str):
            value_lower = value.lower()

            if value_lower == "true":
                return True

            if value_lower == "false":
                return False

        return None
