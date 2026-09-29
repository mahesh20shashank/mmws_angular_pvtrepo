"""Acceptance criteria 1-10 from UNIFIED_AUTHZ_SERVICE_PROMPT.md.

Criterion 11 (URLconf permission introspection) lives in
tests/test_url_permissions.py.
"""

from datetime import timedelta

from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, APITestCase

from accounts.models import CustomUserProfile
from authz import rbac
from authz.models import NavItem, NavVisibility, RoleRequest, UserProcessRoleMapping
from authz.scope import (
    OrgScopedObjectPermission,
    resolve_selected_scope,
    scope_queryset,
)
from delegation.models import RightsTransfer

from .factories import (
    auth_client,
    default_process,
    encrypt_password,
    grant_access_level,
    grant_menu_privilege,
    grant_role,
    make_user,
    role,
)


class Base(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_rbac", verbosity=0)
        cls.process = default_process()


# --------------------------------------------------------------------------
# 1. A non-super-admin calling any authz config CRUD endpoint gets 403.
# --------------------------------------------------------------------------
class Criterion01ConfigCrudLocked(Base):
    def test_plain_user_cannot_read_or_write_rbac_config(self):
        user = make_user("plain1")
        grant_role(user, rbac.ROLE_USER)
        client, _ = auth_client(user)

        for method, url, body in [
            ("get", "/api/authz/roles/", None),
            ("post", "/api/authz/roles/", {"name": "X", "code": "X"}),
            ("get", "/api/authz/menus/", None),
            ("post", "/api/authz/access-levels/", {"name": "Z", "access_level_code": "Z"}),
            ("get", "/api/authz/user-process-roles/", None),
        ]:
            resp = getattr(client, method)(url, body, format="json")
            self.assertEqual(resp.status_code, 403, f"{method} {url} -> {resp.status_code}")

    def test_super_admin_can(self):
        admin = make_user("root1", is_admin=True)
        grant_role(admin, rbac.ROLE_SUPER_ADMIN)
        client, _ = auth_client(admin)
        self.assertEqual(client.get("/api/authz/roles/").status_code, 200)


# --------------------------------------------------------------------------
# 2. PATCH of one's own profile with server-controlled fields is ignored.
# --------------------------------------------------------------------------
class Criterion02SelfEscalationIgnored(Base):
    def test_sensitive_fields_never_persist(self):
        user = make_user("selfedit1")
        grant_role(user, rbac.ROLE_USER)
        client, _ = auth_client(user)

        resp = client.patch(
            "/api/auth/me/",
            {
                "firstname": "NewName",
                "user_active": False,
                "has_credentials": False,
                "approval_status": "REJECTED",
                "unit_id": 999,
                "ship_id": 999,
                "department_id": 999,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        profile = CustomUserProfile.objects.get(pk=user.user_profile_id)
        self.assertEqual(profile.firstname, "NewName")   # innocuous field applied
        self.assertTrue(profile.user_active)             # server-controlled unchanged
        self.assertTrue(profile.has_credentials)
        self.assertEqual(profile.approval_status, "APPROVED")
        self.assertIsNone(profile.unit_id)
        self.assertIsNone(profile.ship_id)

    def test_is_admin_cannot_be_set_via_profile_patch(self):
        user = make_user("selfedit2")
        grant_role(user, rbac.ROLE_USER)
        client, _ = auth_client(user)
        client.patch("/api/auth/me/", {"is_admin": True}, format="json")
        user.refresh_from_db()
        self.assertFalse(user.is_admin)


# --------------------------------------------------------------------------
# 3. A public endpoint never returns a password hash or the full org record.
# --------------------------------------------------------------------------
class Criterion03PublicProjectionMinimal(Base):
    def test_signup_response_is_minimal(self):
        resp = self.client.post(
            "/api/auth/signup/",
            {"username": "pubby1", "password": "longpassword123", "firstname": "Pub"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertNotIn("password", body)
        for leaky in ("unit_id", "ship_id", "department_id", "id", "has_credentials"):
            self.assertNotIn(leaky, body)
        self.assertEqual(set(body), {"status", "username", "approval_status", "message"})


# --------------------------------------------------------------------------
# 4. Login with a password that fails RSA decryption is rejected (no fallback).
# --------------------------------------------------------------------------
@override_settings(LOGIN_DECRYPTION_REQUIRED=True)
class Criterion04MandatoryDecrypt(Base):
    def setUp(self):
        self.user = make_user("cryptouser", password="realpw-123456")
        grant_role(self.user, rbac.ROLE_USER)

    def test_undecryptable_password_is_rejected(self):
        resp = self.client.post(
            "/api/auth/token/",
            {"username": "cryptouser", "password": "not-base64-and-not-ciphertext"},
            format="json",
        )
        self.assertIn(resp.status_code, (400, 401))
        self.assertNotIn("access", resp.json())

    def test_plaintext_password_is_rejected_when_decrypt_required(self):
        resp = self.client.post(
            "/api/auth/token/",
            {"username": "cryptouser", "password": "realpw-123456"},
            format="json",
        )
        self.assertIn(resp.status_code, (400, 401))

    def test_properly_encrypted_password_succeeds(self):
        resp = self.client.post(
            "/api/auth/token/",
            {
                "username": "cryptouser",
                "password": encrypt_password("realpw-123456"),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn("access", resp.json())


# --------------------------------------------------------------------------
# 5. Forged org-scope id -> PermissionDenied; own id honored; privileged -> all.
# --------------------------------------------------------------------------
class Criterion05ScopeParamResolution(Base):
    def setUp(self):
        self.rf = APIRequestFactory()

    def _request(self, user, **params):
        request = self.rf.get("/x", params)
        request.user = user
        return request

    def test_out_of_scope_id_denied(self):
        user = make_user("shipuser1")
        grant_role(user, rbac.ROLE_USER)
        grant_access_level(user, "SHIP", ship_id=10)
        from rest_framework.exceptions import PermissionDenied

        with self.assertRaises(PermissionDenied):
            resolve_selected_scope(self._request(user, ship_id=99), level="ship")

    def test_own_id_honored(self):
        user = make_user("shipuser2")
        grant_role(user, rbac.ROLE_USER)
        grant_access_level(user, "SHIP", ship_id=10)
        selected, is_all = resolve_selected_scope(
            self._request(user, ship_id=10), level="ship"
        )
        self.assertEqual((selected, is_all), (10, False))

    def test_privileged_gets_all(self):
        admin = make_user("root5", is_admin=True)
        grant_role(admin, rbac.ROLE_SUPER_ADMIN)
        # No scope param -> privileged caller is told "all, do not filter".
        selected, is_all = resolve_selected_scope(
            self._request(admin), level="ship"
        )
        self.assertTrue(is_all)
        self.assertIsNone(selected)
        # An explicit id is still honored for a privileged caller (SWMM parity).
        selected2, is_all2 = resolve_selected_scope(
            self._request(admin, ship_id=10), level="ship"
        )
        self.assertEqual((selected2, is_all2), (10, False))


# --------------------------------------------------------------------------
# 6. OrgScopedFilterBackend restricts lists; OrgScopedObjectPermission blocks
#    out-of-scope object access.
# --------------------------------------------------------------------------
class Criterion06OrgScopedFilterAndObject(Base):
    def setUp(self):
        self.in_scope = CustomUserProfile.objects.create(
            firstname="A", ship_id=10, approval_status="APPROVED"
        )
        self.out_scope = CustomUserProfile.objects.create(
            firstname="B", ship_id=20, approval_status="APPROVED"
        )
        self.user = make_user("scoped6")
        grant_role(self.user, rbac.ROLE_USER)
        grant_access_level(self.user, "SHIP", ship_id=10)

    def test_queryset_is_restricted(self):
        qs = scope_queryset(
            CustomUserProfile.objects.all(),
            self.user,
            fields={"ship_ids": "ship_id"},
        )
        ids = set(qs.values_list("id", flat=True))
        self.assertIn(self.in_scope.id, ids)
        self.assertNotIn(self.out_scope.id, ids)

    def test_object_permission_blocks_out_of_scope(self):
        perm = OrgScopedObjectPermission()
        rf = APIRequestFactory()
        request = rf.get("/x")
        request.user = self.user

        class _View:
            org_lookup = {"ship_id": "ship_id"}

        self.assertTrue(perm.has_object_permission(request, _View(), self.in_scope))
        self.assertFalse(perm.has_object_permission(request, _View(), self.out_scope))


# --------------------------------------------------------------------------
# 7. Escalation + scope guard enforced in role-requests/{id}/act/.
# --------------------------------------------------------------------------
class Criterion07GrantGuardsAtExecution(Base):
    def setUp(self):
        self.actor = make_user("unitadmin7")
        grant_role(self.actor, rbac.ROLE_UNIT_ADMIN)
        grant_access_level(self.actor, "SHIP", ship_id=10)
        self.client_actor, _ = auth_client(
            self.actor,
            role_id=role(rbac.ROLE_UNIT_ADMIN).id,
            process_id=self.process.id,
        )
        self.target = make_user("target7")

    def _make_request(self, role_code, ship_id):
        return RoleRequest.objects.create(
            requester=self.target,
            process=self.process,
            requested_role=role(role_code) if role_code else None,
            scope_ship_id=ship_id,
            status=RoleRequest.STATUS_PENDING,
        )

    def test_cannot_grant_role_at_or_above_own_authority(self):
        rr = self._make_request(rbac.ROLE_COMMAND_ADMIN, ship_id=10)
        resp = self.client_actor.post(
            f"/api/authz/role-requests/{rr.pk}/act/", {"decision": "approve"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)
        rr.refresh_from_db()
        self.assertEqual(rr.status, RoleRequest.STATUS_PENDING)

    def test_cannot_grant_outside_own_unit(self):
        rr = self._make_request(rbac.ROLE_USER, ship_id=20)
        resp = self.client_actor.post(
            f"/api/authz/role-requests/{rr.pk}/act/", {"decision": "approve"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_valid_grant_succeeds_and_creates_mapping(self):
        rr = self._make_request(rbac.ROLE_USER, ship_id=10)
        resp = self.client_actor.post(
            f"/api/authz/role-requests/{rr.pk}/act/", {"decision": "approve"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertTrue(
            UserProcessRoleMapping.objects.filter(
                user=self.target,
                is_active=True,
                process_role__user_role__code=rbac.ROLE_USER,
            ).exists()
        )


# --------------------------------------------------------------------------
# 8. Deactivation / dead mapping takes effect within the access-token lifetime.
# --------------------------------------------------------------------------
class Criterion08LiveRevalidation(Base):
    def test_deactivating_user_blocks_next_request(self):
        user = make_user("live8a")
        grant_role(user, rbac.ROLE_USER)
        client, _ = auth_client(user)
        self.assertEqual(client.get("/api/auth/me/").status_code, 200)

        profile = user.user_profile
        profile.user_active = False
        profile.save(update_fields=["user_active"])
        self.assertEqual(client.get("/api/auth/me/").status_code, 401)

    def test_deactivating_selected_mapping_blocks_next_request(self):
        user = make_user("live8b")
        uprm = grant_role(user, rbac.ROLE_USER)
        client, _ = auth_client(
            user, role_id=uprm.process_role.user_role_id, process_id=self.process.id
        )
        self.assertEqual(client.get("/api/auth/me/").status_code, 200)

        uprm.is_active = False
        uprm.save(update_fields=["is_active"])
        self.assertEqual(client.get("/api/auth/me/").status_code, 401)


# --------------------------------------------------------------------------
# 9. Revoking a RightsTransfer drops delegated menu perms on next getPermission.
# --------------------------------------------------------------------------
class Criterion09DelegatedPermsFollowLiveStatus(Base):
    def setUp(self):
        grant_menu_privilege(rbac.ROLE_APPROVER, "widget_screen", ["view", "edit"])
        self.menu_id = self._menu_id("widget_screen")

        self.delegator = make_user("deleg9from")
        grant_role(self.delegator, rbac.ROLE_APPROVER)

        self.delegatee = make_user("deleg9to")
        # delegatee has NO own roles

        self.transfer = RightsTransfer.objects.create(
            delegator=self.delegator,
            delegatee=self.delegatee,
            start_date_time=timezone.now() - timedelta(hours=1),
            end_date_time=timezone.now() + timedelta(hours=1),
            status=RightsTransfer.STATUS_ACTIVE,
        )

    @staticmethod
    def _menu_id(code):
        from authz.models import Menu

        return Menu.objects.get(code=code).id

    def test_active_then_revoked(self):
        perms = rbac.effective_menu_permissions(self.delegatee)
        self.assertIn("view", perms.get(self.menu_id, []))

        self.transfer.status = RightsTransfer.STATUS_REDUCED
        self.transfer.save(update_fields=["status"])

        perms_after = rbac.effective_menu_permissions(self.delegatee)
        self.assertNotIn(self.menu_id, perms_after)


# --------------------------------------------------------------------------
# 10. SUPER_ADMIN cannot edit the nav matrix to remove their own RBAC-admin
#     access.
# --------------------------------------------------------------------------
class Criterion10NavLockout(Base):
    def setUp(self):
        self.admin = make_user("root10", is_admin=True)
        grant_role(self.admin, rbac.ROLE_SUPER_ADMIN)
        self.client_admin, _ = auth_client(self.admin)
        self.row = NavVisibility.objects.get(
            role=role(rbac.ROLE_SUPER_ADMIN),
            nav_item=NavItem.objects.get(key=rbac.NAV_KEY_RBAC_ADMIN),
        )

    def test_cannot_untick_rbac_admin_for_super_admin(self):
        resp = self.client_admin.patch(
            f"/api/authz/nav-visibility/{self.row.pk}/",
            {"is_visible": False},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)
        self.row.refresh_from_db()
        self.assertTrue(self.row.is_visible)

    def test_cannot_delete_the_row(self):
        resp = self.client_admin.delete(
            f"/api/authz/nav-visibility/{self.row.pk}/"
        )
        self.assertEqual(resp.status_code, 403)

    def test_visible_nav_keys_always_includes_rbac_admin(self):
        self.row.is_visible = False  # even if the DB somehow says so
        self.row.save(update_fields=["is_visible"])
        self.assertIn(rbac.NAV_KEY_RBAC_ADMIN, rbac.visible_nav_keys(self.admin))
