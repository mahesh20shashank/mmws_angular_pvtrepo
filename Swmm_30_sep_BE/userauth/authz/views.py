"""RBAC-config CRUD + effective-permission endpoints.

Every ``authz`` config endpoint requires ``IsSuperAdmin`` (or a specific
``HasMenuPrivilege('rbac_admin', ...)``) -- never bare ``IsAuthenticated``
(build prompt criterion 1, anti-pattern #1). Regression-guarded by
``tests`` (criterion 11 introspects the URLconf).
"""

from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.permissions import SAFE_METHODS, AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import rbac
from .models import (
    AccessLevel,
    Menu,
    NavItem,
    NavVisibility,
    Privilege,
    Process,
    RoleAccessLevelMapping,
    RoleMenuMapping,
    RoleProcessMapping,
    RoleRequest,
    UserAccessLevel,
    UserMenuMapping,
    UserProcessRoleMapping,
    UserRole,
)
from .permissions import HasMenuPrivilege, IsInternalService, IsSuperAdmin
from .serializers import (
    AccessLevelSerializer,
    MenuSerializer,
    NavItemSerializer,
    NavVisibilitySerializer,
    NotificationRecipientsSerializer,
    PrivilegeSerializer,
    ProcessSerializer,
    RoleAccessLevelMappingSerializer,
    RoleMenuMappingSerializer,
    RoleProcessMappingSerializer,
    RoleRequestActSerializer,
    RoleRequestCreateSerializer,
    RoleRequestSerializer,
    UserAccessLevelSerializer,
    UserMenuMappingSerializer,
    UserProcessRoleMappingSerializer,
    UserRoleSerializer,
)


class RbacConfigViewSet(viewsets.ModelViewSet):
    """Base for every RBAC-config table. Super-admin only, plus an equivalent
    menu-privilege path for a delegated RBAC administrator."""

    permission_classes = (IsAuthenticated, IsSuperAdmin | HasMenuPrivilege)
    menu_code = rbac.RBAC_ADMIN_MENU_CODE
    menu_action_map = {
        "GET": rbac.ACTION_VIEW,
        "HEAD": rbac.ACTION_VIEW,
        "OPTIONS": rbac.ACTION_VIEW,
        "POST": rbac.ACTION_ADD,
        "PUT": rbac.ACTION_EDIT,
        "PATCH": rbac.ACTION_EDIT,
        "DELETE": rbac.ACTION_DELETE,
    }

    def perform_create(self, serializer):
        kwargs = {}
        if "created_by" in {f.name for f in serializer.Meta.model._meta.get_fields()}:
            kwargs["created_by"] = self.request.user
        serializer.save(**kwargs)


class ProcessViewSet(RbacConfigViewSet):
    queryset = Process.objects.all().order_by("name")
    serializer_class = ProcessSerializer


class UserRoleViewSet(RbacConfigViewSet):
    queryset = UserRole.objects.all().order_by("authority_rank", "name")
    serializer_class = UserRoleSerializer

    def get_permissions(self):
        """Reads of the role list (list/retrieve) are open to everyone. Writes
        stay super-admin-only."""
        if self.request.method in SAFE_METHODS:
            return [AllowAny()]
        return super().get_permissions()


class RoleProcessMappingViewSet(RbacConfigViewSet):
    queryset = RoleProcessMapping.objects.select_related("user_role", "process")
    serializer_class = RoleProcessMappingSerializer


class UserProcessRoleMappingViewSet(RbacConfigViewSet):
    queryset = UserProcessRoleMapping.objects.select_related(
        "process_role__user_role", "process_role__process"
    )
    serializer_class = UserProcessRoleMappingSerializer

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)


class MenuViewSet(RbacConfigViewSet):
    queryset = Menu.objects.all().order_by("sequence", "id")
    serializer_class = MenuSerializer


class PrivilegeViewSet(RbacConfigViewSet):
    queryset = Privilege.objects.all().order_by("name")
    serializer_class = PrivilegeSerializer


class RoleMenuMappingViewSet(RbacConfigViewSet):
    queryset = RoleMenuMapping.objects.select_related(
        "process", "role", "menu", "access_level"
    ).prefetch_related("privileges")
    serializer_class = RoleMenuMappingSerializer


class UserMenuMappingViewSet(RbacConfigViewSet):
    queryset = UserMenuMapping.objects.select_related("user", "menu").prefetch_related(
        "privileges"
    )
    serializer_class = UserMenuMappingSerializer


class AccessLevelViewSet(RbacConfigViewSet):
    queryset = AccessLevel.objects.all().order_by("sequence")
    serializer_class = AccessLevelSerializer


class UserAccessLevelViewSet(RbacConfigViewSet):
    queryset = UserAccessLevel.objects.select_related("user", "access_level")
    serializer_class = UserAccessLevelSerializer

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)


class RoleAccessLevelMappingViewSet(RbacConfigViewSet):
    queryset = RoleAccessLevelMapping.objects.select_related(
        "user_role", "access_level", "process"
    )
    serializer_class = RoleAccessLevelMappingSerializer


class NavItemViewSet(RbacConfigViewSet):
    queryset = NavItem.objects.all().order_by("order", "id")
    serializer_class = NavItemSerializer


class NavVisibilityViewSet(RbacConfigViewSet):
    """Editing the nav matrix is role-locked AND lockout-guarded: an edit that
    would remove a LOCKED role's access to the RBAC-admin nav key is refused
    (build prompt criterion 10). Origin: SWMM NavVisibilityView."""

    queryset = NavVisibility.objects.select_related("role", "nav_item")
    serializer_class = NavVisibilitySerializer

    def get_permissions(self):
        """Reads of the nav matrix (list/retrieve) are open to everyone -- the
        frontend needs the role x nav-item grid to decide what to render. Writes
        stay super-admin-only + lockout-guarded (build prompt criterion 10)."""
        if self.request.method in SAFE_METHODS:
            return [AllowAny()]
        return super().get_permissions()

    def list(self, request, *args, **kwargs):
        """Return the whole matrix as one grid the nav-admin screen renders
        directly: every role (sorted by display name) x every nav item, with a
        ``visibility`` map keyed by role id and a ``locked_for`` list marking the
        roles whose access to that nav key can never be revoked
        (NAV_VISIBILITY_LOCKED_ROLES on the RBAC-admin key)."""
        roles = sorted(UserRole.objects.all(), key=lambda r: r.name.lower())
        role_ids = [r.id for r in roles]
        locked_ids = [
            str(r.id) for r in roles if r.code in rbac.NAV_VISIBILITY_LOCKED_ROLES
        ]

        stored = {
            (nv.nav_item_id, nv.role_id): nv.is_visible
            for nv in NavVisibility.objects.all()
        }

        nav_items = []
        for item in NavItem.objects.all().order_by("order", "id"):
            is_rbac_admin = item.key == rbac.NAV_KEY_RBAC_ADMIN
            nav_items.append(
                {
                    "key": item.key,
                    "label": item.label,
                    "order": item.order,
                    "visibility": {
                        str(rid): (
                            True
                            if is_rbac_admin
                            and roles[idx].code in rbac.NAV_VISIBILITY_LOCKED_ROLES
                            else stored.get((item.id, rid), False)
                        )
                        for idx, rid in enumerate(role_ids)
                    },
                    "locked_for": locked_ids if is_rbac_admin else [],
                }
            )

        return Response(
            {
                "roles": [{"id": r.id, "role_name": r.name} for r in roles],
                "nav_items": nav_items,
            }
        )

    def _guard(self, serializer):
        role = serializer.validated_data.get("role") or getattr(
            serializer.instance, "role", None
        )
        nav_item = serializer.validated_data.get("nav_item") or getattr(
            serializer.instance, "nav_item", None
        )
        is_visible = serializer.validated_data.get("is_visible")
        if is_visible is None and serializer.instance is not None:
            is_visible = serializer.instance.is_visible
        if (
            role is not None
            and nav_item is not None
            and rbac.nav_matrix_would_lock_out(
                role.code, nav_item.key, bool(is_visible)
            )
        ):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(
                "Refusing to remove a super-admin's access to the RBAC-admin "
                "screen -- that is the only screen that can undo it."
            )

    def perform_create(self, serializer):
        self._guard(serializer)
        serializer.save()

    def perform_update(self, serializer):
        self._guard(serializer)
        serializer.save()

    def perform_destroy(self, instance):
        if rbac.nav_matrix_would_lock_out(
            instance.role.code, instance.nav_item.key, False
        ):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(
                "Refusing to remove a super-admin's access to the RBAC-admin screen."
            )
        instance.delete()


# --------------------------------------------------------------------------
# Effective-permission endpoints
# --------------------------------------------------------------------------
class PermissionTreeView(APIView):
    """GET /api/authz/permissions/  (= ITTTM ``getPermission``).

    The effective menu/privilege tree for the current user: own ∪ ACTIVE
    delegated. Server-side truth -- ``rbac.effective_menu_permissions`` -- not
    the token claim.
    """

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        auth = request.auth if isinstance(getattr(request, "auth", None), dict) else {}
        process_id = request.query_params.get("process_id") or auth.get("process_id")
        unit_id = auth.get("unit_id")
        perms = rbac.effective_menu_permissions(
            request.user,
            process_id=int(process_id) if process_id else None,
            unit_id=unit_id,
        )
        menus = {m.id: m for m in Menu.objects.all().order_by("sequence", "id")}

        def node(menu):
            return {
                "id": menu.id,
                "code": menu.code,
                "name": menu.name,
                "url": menu.url,
                "icon": menu.icon,
                "sequence": menu.sequence,
                "actions": perms.get(menu.id, []),
                "sub_menus": [
                    node(child)
                    for child in menus.values()
                    if child.parent_id == menu.id
                ],
            }

        tree = [
            node(m)
            for m in menus.values()
            if m.parent_id is None
            and (m.id in perms or _has_visible_child(m, menus, perms))
        ]
        return Response(tree)


def _has_visible_child(menu, menus, perms):
    stack = [c for c in menus.values() if c.parent_id == menu.id]
    while stack:
        cur = stack.pop()
        if cur.id in perms:
            return True
        stack.extend(c for c in menus.values() if c.parent_id == cur.id)
    return False


class MeScopeView(APIView):
    """GET /api/authz/me/scope/  (= ITTTM ``MeAccessScopeAPIView``)."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        return Response(rbac.scope_as_claim(rbac.get_effective_scope(request.user)))


# --------------------------------------------------------------------------
# Role requests
# --------------------------------------------------------------------------
class RoleRequestView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        """Scoped list: what the caller may act on, plus their own requests."""
        actionable = rbac.pending_requests_for(request.user)
        mine = RoleRequest.objects.filter(requester=request.user)
        combined = (actionable | mine).distinct().order_by("-created_on")
        return Response(RoleRequestSerializer(combined, many=True).data)

    @extend_schema(request=RoleRequestCreateSerializer)
    def post(self, request):
        serializer = RoleRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Scope snapshot taken NOW from the requester's own posting -- approval
        # routing keys off this, not their future posting (criterion 7).
        profile = request.user.user_profile
        role_request = RoleRequest.objects.create(
            requester=request.user,
            process=data["process"],
            requested_role=data.get("requested_role"),
            requested_access_level=data.get("requested_access_level"),
            scope_command_id=None,
            scope_satellite_unit_id=getattr(profile, "satellite_unit_id", None),
            scope_trial_unit_id=None,
            scope_ship_id=getattr(profile, "ship_id", None),
            scope_unit_id=getattr(profile, "unit_id", None),
            remarks=data.get("remarks", ""),
            source=RoleRequest.SOURCE_REQUEST,
        )
        return Response(
            RoleRequestSerializer(role_request).data, status=status.HTTP_201_CREATED
        )


class RoleRequestActView(APIView):
    """POST /api/authz/role-requests/<id>/act/  body: {"decision": "approve"|"reject"}

    Re-checks BOTH ``can_act_on_request`` AND ``can_grant`` at execution time
    (build prompt criterion 7 -- never only hidden in the UI). Origin: SWMM
    ``act_on_role_request``.
    """

    permission_classes = (IsAuthenticated,)

    @extend_schema(request=RoleRequestActSerializer)
    @transaction.atomic
    def post(self, request, pk):
        role_request = (
            RoleRequest.objects.select_for_update()
            .filter(pk=pk, status=RoleRequest.STATUS_PENDING)
            .first()
        )
        if role_request is None:
            return Response(
                {"status": "error", "message": "No pending request with that id."},
                status=status.HTTP_404_NOT_FOUND,
            )
        decision = request.data.get("decision")
        if decision not in ("approve", "reject"):
            return Response(
                {"status": "error", "message": "decision must be approve or reject."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not rbac.can_act_on_request(request.user, role_request):
            return Response(
                {"status": "error", "message": "You may not act on this request."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if decision == "reject":
            role_request.stamp_action(request.user, RoleRequest.STATUS_REJECTED)
            role_request.save(update_fields=["status", "acted_by", "acted_on"])
            return Response({"status": "ok", "result": "rejected"})

        # approve -> re-check the escalation + scope guard NOW
        target = role_request.requester
        role = role_request.requested_role
        if role is None:
            return Response(
                {
                    "status": "error",
                    "message": "Request has no concrete role to grant.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        org_ids = {
            "command_id": role_request.scope_command_id,
            "satellite_unit_id": role_request.scope_satellite_unit_id,
            "trial_unit_id": role_request.scope_trial_unit_id,
            "ship_id": role_request.scope_ship_id,
        }
        if not rbac.can_grant(
            request.user,
            target,
            role,
            role_request.process,
            access_level=role_request.requested_access_level,
            org_ids=org_ids,
        ):
            return Response(
                {
                    "status": "error",
                    "message": "You may not grant this role at this scope "
                    "(privilege-escalation / scope guard).",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        role_process, _ = RoleProcessMapping.objects.get_or_create(
            user_role=role, process=role_request.process
        )
        UserProcessRoleMapping.objects.update_or_create(
            user=target,
            process_role=role_process,
            defaults={"is_active": True, "assigned_by": request.user},
        )
        if target.user_profile_id:
            rbac.stamp_role_assignment(target.user_profile, request.user.user_profile)
            target.user_profile.save(
                update_fields=["role_assigned_by", "role_assigned_on", "updated_on"]
            )
        role_request.stamp_action(request.user, RoleRequest.STATUS_APPROVED)
        role_request.save(update_fields=["status", "acted_by", "acted_on"])

        from authz.cache import invalidate_user_profile

        invalidate_user_profile(target.id)
        return Response({"status": "ok", "result": "approved"})


# --------------------------------------------------------------------------
# Internal service-to-service endpoint (X-Service-Key)
# --------------------------------------------------------------------------
class NotificationRecipientsView(APIView):
    """POST /api/authz/notification-recipients/ -- peer services ask "who holds
    role X in process Y at unit Z" for notification fan-out. Guarded by
    ``X-Service-Key`` (from env, no default)."""

    authentication_classes = ()
    permission_classes = (IsInternalService,)

    @extend_schema(request=NotificationRecipientsSerializer)
    def post(self, request):
        role_code = request.data.get("role_code")
        process_id = request.data.get("process_id")
        if not role_code:
            return Response(
                {"status": "error", "message": "role_code is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qs = UserProcessRoleMapping.objects.filter(
            is_active=True, process_role__user_role__code=role_code
        )
        if process_id:
            qs = qs.filter(process_role__process_id=process_id)
        recipients = list(qs.select_related("user").values("user_id", "user__username"))
        return Response({"recipients": recipients})
