# authz_service

A Django 5.2 + DRF authentication & authorization service that fuses:

- the **enforcement discipline / single-source-of-truth RBAC module** of the
  SWMM backend (**Project A**), with
- the **richer authorization model** of the ITTTM `user_service` (**Project B**)
  — process-scoped roles, privilege-level menu permissions, multi-tier org
  hierarchy scoping, time-boxed role delegation, RS256 fleet tokens,
  cross-service user cache, centralized audit.

Everything is **enforced server-side**. There are no advisory-only permission
checks.

> **It is the identity provider for the SWMM backend.** The sibling `swmm/`
> project no longer authenticates anyone — it verifies RS256 bearers minted
> here against the shared `../keys/jwt_public.pem` and issues none of its own.
> The Angular SPA logs in / refreshes / logs out **directly against this
> service** and sends the same access token to SWMM. See
> [§ Running with the SWMM backend](#running-with-the-swmm-backend) and
> `swmm/Documentations/AUTHZ_SERVICE_INTEGRATION_PLAN.md`.

---

## Quick start

```bash
poetry install                     # or: pip install -e . in a venv
cp .env.example .env                # DEBUG=True, locmem cache, decrypt optional

# RS256 (JWT) + RSA-OAEP (login) key pairs -- fail-fast if missing.
# Writes to the shared repo root (parent of swmm/ and userauth/) so both
# services load the same pair. Matches KEYS_DIR=../keys in .env.example.
# Cross-platform (PowerShell / cmd / bash) -- no heredoc. Add --force to overwrite.
poetry run python gen_keys.py

python manage.py migrate
python manage.py seed_rbac         # processes, roles(+codes), access levels,
                                   # menus, privileges, nav matrix, a SUPER_ADMIN
python manage.py runserver


# background worker (delegation lifecycle every 60s):
celery -A authz_service worker -l info
celery -A authz_service beat -l info
# ...or without Celery:
python manage.py run_delegation_lifecycle
```

Seeded login: `SVC_ADMIN` / `change-me-now-01` (**change it**).

### Tests

```bash
python manage.py test tests        # 23 tests: acceptance criteria 1-11
```

---

## Running with the SWMM backend

`authz_service` (`:8001`) and the SWMM backend (`swmm/`, `:8000`) run side by
side against **one** Postgres database (this service owns the `UserAuth` schema;
SWMM owns `public`) and **one** RS256 key pair in the repo-root `keys/`.

**Bring-up order** (first time):

```bash
# 1. shared keys -- once, from userauth/
poetry run python gen_keys.py                      # -> ../keys/*.pem

# 2. SWMM first: it owns the master org data (departments / commands / ships)
cd ../swmm
poetry run python manage.py migrate
poetry run python seed_all.py                      # departments, sub-departments, Role rows
poetry run python manage.py dump_org_ids > ../userauth/seed_data/org_ids.json
poetry run python manage.py runserver 0.0.0.0:8000

# 3. this service
cd ../userauth
poetry run python manage.py migrate
poetry run python manage.py seed_rbac --org-ids seed_data/org_ids.json
poetry run python manage.py runserver 0.0.0.0:8001
```

`--org-ids` makes `seed_rbac` write **real SWMM `master` PKs** into each user's
`UserAccessLevel` and profile `department_id`, so the token `scope` /
`department_id` claim SWMM receives resolves against its own tables. Without it,
SWMM's department scoping (`users/rbac.py`) sees nothing. Re-run step 2's
`dump_org_ids` + this command whenever SWMM's org rows change.

**Shared config that must agree on both sides:**

| Setting | `userauth/.env` | `swmm/.env` |
|---|---|---|
| Key pair | `KEYS_DIR=../keys` (no local `userauth/keys/`) | default `<repo-root>/keys/jwt_public.pem` |
| Service secret | `INTERNAL_SERVICE_KEY=dev-internal-key` | same value |
| This service's URL | — | `AUTHZ_BASE_URL=http://localhost:8001` |

SWMM never sees `jwt_private.pem`. A key mismatch → SWMM 401s every request; a
wrong `AUTHZ_BASE_URL` → SWMM's `IsLiveAuthzUser` 403s destructive endpoints.

**Smoke test:** see `swmm/README.md` § 4.

---

## Architecture

| App          | Responsibility |
|--------------|----------------|
| `accounts`   | Split identity (`CustomUser` + `CustomUserProfile`), login / refresh / logout, change-password, self-registration + approval, `UserSession`. |
| `authz`      | The single-source-of-truth module (`authz/rbac.py`), permission classes, `check_access` decorator, org-scope toolkit (`authz/scope.py`), RBAC-config models + admin CRUD APIs. |
| `delegation` | `RightsTransfer` + lifecycle (Celery beat / management command). |
| `audit`      | Centralized audit middleware + best-effort client + DRF exception handler. |

`AUTH_USER_MODEL = accounts.CustomUser` (thin credentials model). Every
ITTTM-derived RBAC table FKs to `settings.AUTH_USER_MODEL`, so it resolves to
`CustomUser` with no shape change. JWT-only for the API
(`authz.authentication.LiveJWTAuthentication` is the sole default auth class);
`DEFAULT_PERMISSION_CLASSES = (IsAuthenticated,)` is only a floor — explicit
classes sit on top.

Everything that scopes data goes through `authz/scope.py` + `authz/rbac.py`.
**No ad-hoc unit/role checks in views** — this is a review gate; it was the #1
historical bug class in both source projects.

---

## Origin map (Project A = SWMM, Project B = ITTTM)

### Identity / credentials — `accounts/`

| New file | Origin |
|----------|--------|
| `accounts/models.py::CustomUser` / `CustomUserProfile` | **A** `users/models.py` split identity model. ITTTM's fat `accounts.User` is **not** copied; only its org-scope *fields* (`unit_id/name`, `ship_id/name`, `satellite_unit_id`, `department_id/name`, `approval_status`, `ad_user`, `source_unit_*`, `hrcdf_desig`, `rankCode/rankName`) are ported onto the profile next to `department`. `@property` shims on `CustomUser` (**A** already does this for `department*`; extended here). |
| `accounts/models.py::UserSession` | **B** `accounts/models.py::UserSession` |
| `accounts/encryption.py` | **B** `user_service/encryption.py` — RSA-OAEP decrypt, made **mandatory** (anti-pattern #4): no plaintext fallback. |
| `accounts/serializers.py::TokenObtainSerializer` | **A** `CustomTokenObtainPairSerializer` (account-state checks + embedded RBAC claims) fused with **B** `MyTokenObtainSerializer` (RS256, role selection at login via `user_role_id` + `process_id`, `role_code` claim, `session_id` claim + `UserSession` row, cross-service Redis cache write). |
| `accounts/serializers.py::SignupSerializer` / `CurrentUserSerializer` | **A** `users/serializers.py` — explicit field lists, `get_capabilities()` SPA feed. Public endpoints return a minimal projection (anti-pattern #3). |
| `accounts/ldap.py` | **B** LDAP branch of `MyTokenObtainSerializer`, reduced to a single pluggable hook with **no** synchronous HRCDF / master-service calls on the login path (anti-pattern #11). |
| `accounts/views.py` | **A** `UserViewSet.get_permissions()` + `_authorize_manage()` gating pattern; refresh re-validates the DB (anti-pattern #6). |

### Enforcement layer — `authz/`

| New file | Origin |
|----------|--------|
| `authz/rbac.py` | **A** `users/rbac.py` — the one documented module. `assignable_roles` / `can_grant` (escalation guard), `pending_requests_for` / `can_act_on_request` (approval routing by a scope **snapshot** taken at request time), `stamp_role_assignment`, `visible_nav_keys` + `NAV_VISIBILITY_LOCKED_ROLES`. Fused with **B** `access/views.py::getPermission` logic as the server-side callable `effective_menu_permissions` (own ∪ ACTIVE delegated), and `effective_roles` combining `UserProcessRoleMapping` with live `RightsTransfer` status. |
| `authz/scope.py` | **B** `access/services.py` — `get_effective_scope`, `user_can_access_resource`, `filter_queryset_by_org_scope` (here `scope_queryset`). `resolve_selected_scope` / `OrgScopedFilterBackend` / `OrgScopedObjectPermission` are the generalization of **A** `resolve_selected_department` / `DepartmentScopedFilterBackend` / `DepartmentScopedObjectPermission` — a forged scope query-param is rejected with `PermissionDenied` (anti-IDOR). |
| `authz/master_client.py` | Replaces **B**'s `sys.path`-injected cross-schema master import (anti-pattern #10) with a pluggable, cache-friendly client seam. Default = no hierarchy expansion; only explicit `UserAccessLevel` ids count. |
| `authz/permissions.py` | **A** `users/permissions.py` (concrete named `BasePermission` per view) + **B** `access/permissions.py` `HasHierarchicalAccess` / `HasResourceOrgAccess` — **implemented for real** (they are 100% commented out in Project B). Adds `IsSuperAdmin`, `HasRole`, `HasMenuPrivilege`, `IsInternalService`. |
| `authz/decorators.py::check_access` | **B** `access/decorators.py::check_access` — **implemented for real**. Resolves `UserMenuMapping` → `RoleMenuMapping` privileges for `action ∈ {view, add, edit, delete, export}`, 403 on miss, attaches `request.scope_data`. |
| `authz/authentication.py::LiveJWTAuthentication` | Fixes **B** anti-pattern #6 — every request reloads the user and re-checks `is_active` / `user_active` / `approval_status == APPROVED` / live `UserSession` / selected `UserProcessRoleMapping.is_active`. |
| `authz/cache.py` | **B** `itttm_common.user_cache` — TTL'd Redis user-profile cache, invalidated on any role/scope/user change. |
| `authz/models.py` | **B** `access/models.py` — `Process`, `UserRole` (+`code`), `RoleProcessMapping`, `UserProcessRoleMapping`, `Menu`, `Privilege`, `RoleMenuMapping` (with the partial unique constraints), `UserMenuMapping`, `AccessLevel` (SUPER_ADMIN→…→SHIP), `UserAccessLevel`, `RoleAccessLevelMapping`. Plus **A** `NavItem` / `NavVisibility` / `RoleRequest` (role-request generalized to `(process, role, access_level, org unit)`). |
| `authz/views.py` | **A** `NavVisibilityView` (role-locked + lockout-guarded), `act_on_role_request` (re-checks `can_act_on_request` **and** `can_grant` at execution time). **B** `getPermission` → `PermissionTreeView`, `MeAccessScopeAPIView` → `MeScopeView`. Every config CRUD endpoint requires `IsSuperAdmin` (or `HasMenuPrivilege('rbac_admin', …)`). |
| `authz/management/commands/seed_rbac.py` | Deliverable #3 — idempotent seed. |

### Delegation — `delegation/`

| New file | Origin |
|----------|--------|
| `delegation/models.py` | **B** `transfer_rights/models.py` — `RightsTransfer` (PENDING→ACTIVE→REDUCED/COMPLETED), `RightsTransferLog`. |
| `delegation/lifecycle.py` + `tasks.py` + `management/commands/run_delegation_lifecycle.py` | **B** `transfer_rights/tasks.py` — Celery-beat lifecycle every 60s, also runnable as a management command. |
| `delegation/views.py` | **B** `transfer_rights/views.py` — with correct HTTP status codes + SWMM error shape (anti-pattern #7) and explicit serializer field lists (#2). |

### Cross-cutting — `audit/`

| New file | Origin |
|----------|--------|
| `audit/middleware.py` | **B** `middleware.py::AuditLogMiddleware` — fixed: `clear_current_request()` in `finally`, never swallows the request, redacts `password` / tokens / `authorization` / encrypted blobs, key from env. No bare `except`. |
| `audit/context.py` | **B** `context.py` |
| `audit/client.py` | **B**'s synchronous `httpx.post` → stdlib POST in a daemon thread, best-effort, `X-Service-Key` from env (no default). |
| `audit/exception_handler.py` | **A** error contract `{"status":"error","message":…,<field errors>}` with correct HTTP status codes (anti-pattern #7). |
| `authz_service/settings.py` | **A** `swmm/settings.py` (JWT-only, `token_blacklist`) + **B** `user_service/settings.py` (RS256 shared key pair, Redis, Celery). Env-driven, `ImproperlyConfigured` fail-fast on missing secrets, `DEBUG` default `False` (#9, #13). |

---

## Token strategy

- **RS256**, key pair from `KEYS_DIR` (env / mounted secret); `ImproperlyConfigured` if missing.
- Access token **20 min** (`ACCESS_TOKEN_LIFETIME_MIN`); refresh **12 h**
  (`REFRESH_TOKEN_LIFETIME_HOURS`), `ROTATE_REFRESH_TOKENS=True`,
  `BLACKLIST_AFTER_ROTATION=True`, `token_blacklist` installed.
- Claims: `user_id`, `username`, `role_code`, `user_role_id`, `process_id`,
  `unit_id`, `department_id`, `ship_id`, `is_super_admin`, `session_id`,
  `scope`, `delegated_roles`. **Delegated roles in the claim are for the SPA
  only** — enforcement re-verifies them against live `RightsTransfer` status on
  every request.
- **Login**: mandatory RSA-OAEP decrypt → credential check (LDAP or local per
  `ad_user`) → `is_active` + `user_active` + `approval_status == APPROVED` +
  `has_credentials` → role-selection validation → `UserSession` row → cache write.
- **Logout**: blacklist refresh + mark `UserSession` inactive + invalidate cache.
- **Refresh**: reload user, re-check active/approval/session, re-check selected
  mapping `is_active`, rebuild scope, re-issue.

---

## API surface

```
POST /api/auth/token/                       public login (role selection: user_role_id + process_id)
POST /api/auth/token/refresh/               rotate + re-validate
POST /api/auth/logout/
POST /api/auth/change-password/
POST /api/auth/signup/                      public, minimal response
GET  /api/auth/approval/                    role-gated queue
POST /api/auth/approval/<profile_id>/approve|reject/
GET  /api/auth/me/                          identity + capabilities (SPA guard feed)
PATCH /api/auth/me/                         self-edit (server-controlled fields ignored)
GET  /api/auth/me/sessions/

GET  /api/authz/permissions/                = getPermission (own ∪ delegated menu tree)
GET  /api/authz/me/scope/                   = MeAccessScopeAPIView
CRUD /api/authz/{processes,roles,role-process-mappings,user-process-roles,
      menus,privileges,role-menu-mappings,user-menu-mappings,access-levels,
      user-access-levels,role-access-level-mappings,nav-items,nav-visibility}/   -- all IsSuperAdmin / HasMenuPrivilege
POST /api/authz/role-requests/              create (requester + scope snapshot server-set)
GET  /api/authz/role-requests/              scoped list
POST /api/authz/role-requests/<id>/act/     re-checks can_act_on_request + can_grant
POST /api/authz/notification-recipients/    internal, X-Service-Key guarded

GET/POST /api/delegation/transfers/         incoming + outgoing
POST     /api/delegation/transfers/<id>/    {"action": "REVOKE"|"EXTEND", ...}
GET      /api/delegation/transfers/<id>/logs/
```

---

## Acceptance criteria → tests

All in `tests/`:

| # | Criterion | Test |
|---|-----------|------|
| 1 | Non-super-admin on any `authz` config CRUD → 403 | `Criterion01ConfigCrudLocked` |
| 2 | Self-`PATCH` of `is_admin` / `user_active` / `has_credentials` / `approval_status` / org ids ignored | `Criterion02SelfEscalationIgnored` |
| 3 | Public endpoint never returns a password hash or full org record | `Criterion03PublicProjectionMinimal` |
| 4 | Login with a password that fails RSA decryption is rejected (no plaintext fallback) | `Criterion04MandatoryDecrypt` |
| 5 | Out-of-scope org id → `PermissionDenied`; own id honored; privileged → "all" | `Criterion05ScopeParamResolution` |
| 6 | `OrgScopedFilterBackend` restricts lists; `OrgScopedObjectPermission` blocks out-of-scope objects | `Criterion06OrgScopedFilterAndObject` |
| 7 | Cannot grant a role at/above own authority nor outside own unit — enforced in `role-requests/{id}/act/` | `Criterion07GrantGuardsAtExecution` |
| 8 | Deactivating a user / dead `UserProcessRoleMapping` takes effect on the next request | `Criterion08LiveRevalidation` |
| 9 | Revoking a `RightsTransfer` drops delegated menu perms on the next `getPermission` | `Criterion09DelegatedPermsFollowLiveStatus` |
| 10 | SUPER_ADMIN cannot edit the nav matrix to remove their own RBAC-admin access | `Criterion10NavLockout` |
| 11 | Every endpoint has an explicit permission class or `check_access` (URLconf introspection) | `tests/test_url_permissions.py` |

---

## Anti-patterns from Project B that are absent here

1. Permission classes / decorators defined but commented out or never attached — every non-public endpoint has an explicit class or `check_access`; `tests/test_url_permissions.py` fails the build otherwise.
2. `ModelSerializer` with `fields = "__all__"` on a write path — every serializer is an explicit allowlist; sensitive columns are server-controlled.
3. `AllowAny` endpoint returning the password hash / full org record — public responses are minimal explicit projections.
4. Password-decrypt `try/except` that accepts the raw string on failure — decrypt is mandatory; a failure is a rejected login.
5. 7-day access tokens with no rotation/revocation — 20 min access, rotating + blacklisted refresh.
6. Refresh that trusts old-token claims — refresh and every request reload and re-check the DB.
7. HTTP 200 + `{"status": 2, ...}` — correct status codes + `{"status":"error","message":…}`.
8. Bare `except:` — every catch is specific or logged.
9. Hardcoded insecure `SECRET_KEY` / audit key — `ImproperlyConfigured` fail-fast outside `DEBUG`.
10. Cross-service ORM coupling via `sys.path` / raw cross-schema SQL — `authz/master_client.py` seam, cache-friendly.
11. Synchronous HRCDF / master-service HTTP on the login path — auto-provisioning is out of the token serializer; LDAP is a bounded hook.
