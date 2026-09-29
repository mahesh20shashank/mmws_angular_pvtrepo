# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SWMM ("Single Window Material Management") backend — a Django REST Framework API serving an Angular frontend (sibling repo) for ship maintenance/logistics operations (equipment tracking, defect/DART reporting, routines, stores, hotwork permits, refits, crew management, etc.). Built on Django 5.2 + DRF, with Celery/Redis for background jobs and a Postgres database that mirrors/integrates with a legacy CMMS system (hence table names like `Master_department`, `Master_sub_department`).

**This project was converted from a single Django monolith into a set of microservices.** This `swmm/` directory is now the backend service on its own, alongside two sibling services extracted from what used to live here:
- **`userauth/`** — the old in-repo `users` app (auth, RBAC, user/profile management). It no longer exists in this codebase at all; SWMM is now a pure resource server against it (see Auth below).
- **`document/`** — document/report generation (PDF/CSV/Excel export), extracted from what the `dms` app and ad hoc PDF-generation code used to do locally. SWMM calls it over HTTP rather than rendering in-process for report exports that have been migrated to it (see Document generation below). The `dms` app still exists locally for document *management* (storage/metadata) — the split is between "manage a document record" (still local, `dms`) and "render a report to PDF/CSV/Excel" (now the external service for endpoints that have adopted it).

All three services are orchestrated together via the repo-root `docker-compose.yml` (`swmm-backend-dev`, `swmm-userauth-dev`, `swmm-document-dev`, plus `swmm-redis` and `swmm-celery-worker`), sharing a Docker network. When working in `swmm/`, keep in mind that `users`- and `dms`-shaped concerns may need to route to a sibling service instead of being implemented locally — check `userauth/`/`document/` (siblings of this `swmm/` directory) before assuming a feature belongs here.

## Commands

Dependency management is via Poetry; the private Nexus index in `pyproject.toml` may not be reachable outside the corporate network.

```powershell
poetry install --no-root                    # install dependencies
poetry run python manage.py runserver       # start the dev server
poetry run python manage.py migrate         # apply migrations
poetry run python manage.py makemigrations <app>   # create a migration for one app
poetry run python manage.py check           # system check (imports, config) — fast smoke test
poetry run python manage.py test            # run the full test suite (Django's runner, not pytest)
poetry run python manage.py test op_maintenance       # run one app's tests
poetry run python manage.py test op_maintenance.tests.SomeTestCase.test_thing  # run a single test
poetry run python seed_all.py               # seed departments + sub-departments + fixed Role rows (users/nav now live in authz_service) — idempotent, no drop
poetry run flake8                           # lint (max-line-length=150, migrations excluded — see .flake8)
poetry run ruff check .                     # ruff is also a dependency; no repo-level ruff config committed
```

Celery worker (background tasks; some endpoints fall back to synchronous execution if no worker responds to a health check):

```powershell
poetry run celery -A swmm worker -l info --pool=solo --without-mingle --without-gossip   # Windows
poetry run celery -A swmm inspect ping      # verify the worker is alive
```

Redis is both the Celery broker/result backend and the Django cache backend (see `CELERY_BROKER_URL`/`CELERY_RESULT_BACKEND`/`REDIS_CACHE_URL` in `.env`, RabbitMQ has been dropped in favor of Redis-as-broker). `DEBUG`, `SECRET_KEY`, `DB_*`, `ALLOWED_HOSTS`, `LDAP_SERVER`/`LDAP_BASE_DN` are required env vars — see `sample.env` for the full list, `.env` is gitignored.

When verifying a fix in a shell script rather than the full test suite, run it non-interactively (`manage.py shell -c "exec(open(path).read())"`), not piped into the interactive REPL — multi-line control flow (`try`/`for`) breaks when line-pasted into the interactive console.

## Architecture

**One Django app per functional module**, all under a single `swmm/` project (`swmm/settings.py`, `swmm/urls.py`). Apps: `accounts` (local identity/RBAC shadow layer for `userauth/` — see Auth below; there is no `users` app any more), `master` (shared reference data: departments, ships, ranks, sub-departments, hierarchy chart), `sfd` (Ship Configuration / equipment CAT1-CAT3 transactions), `op_maintenance` (defect/DL reporting — formerly `dart`), `ems` (routines/maintenance planning, PDF exports), `activity_planner` (calendar/planner), `ilms`/`wlms`/`obs` (inventory/stores-adjacent apps, each department-scoped), `srar`, `refit`, `hotwork`, `tank`, `crew_manage`, `ticket_manage`, `work_manage`, `inout_tag`, `dms` (document management — record/metadata only, see Document generation below), `dl_monitor`, `swmmapi` (CMMS sync/integration surface). Each app's URLs are mounted under `/api/v1/<prefix>/` in `swmm/urls.py`; a handful of apps (`ems`, `sfd`, `srar`, `master`) additionally export an `integration_urlpatterns` list mounted directly under `/api/v1/` for CMMS-facing endpoints, separate from their normal app-prefixed routes.

**Auth**: SWMM is a **resource server for `authz_service`** (the sibling `userauth/` microservice) — it mints no tokens. Every request is a verified RS256 bearer issued by `authz_service` and checked locally against the shared `keys/jwt_public.pem` (`accounts/authentication.py::FleetJWTAuthentication`). There are **no** `token/refresh/logout/register/me/change-password` endpoints in SWMM any more; the SPA authenticates against `authz_service`/`userauth` directly. On each request a per-request **shadow-sync** (`accounts/authz_sync.py::sync_principal`) projects the token's `user_id`/`role_code`/`scope` onto a real local `CustomUser`/`CustomUserProfile` (join key `CustomUserProfile.authz_user_id == token user_id`) so `accounts/rbac.py` keeps working unchanged. `AUTH_USER_MODEL = "accounts.CustomUser"`. `CustomUser` is a thin credentials model with a FK to `CustomUserProfile` (the actual person/role/department record) — profile fields live on `CustomUserProfile`, not `CustomUser`; to get from a `CustomUserProfile` back to its `CustomUser`, there's no forward accessor, use `CustomUser.objects.filter(user_profile=profile)` (reverse FK, default `customuser_set` related name). `role_code → Role.role_name` mapping: `accounts/authz_roles.py`. Revocation-sensitive endpoints add `accounts/live_permissions.py::IsLiveAuthzUser`; machine-to-machine uses `IsInternalService` (`X-Service-Key`). Plan: `swmm/Documentations/AUTHZ_SERVICE_INTEGRATION_PLAN.md`.

**RBAC (`accounts/rbac.py`)**: the single source of truth for who can see/do what, used across nearly every app. Key building blocks: `PRIVILEGED_ROLES_LEVELS` (roles that bypass department scoping — SHIPADMIN/COMMAND/CO/ADMIN), `can_see_all_departments(user)`, `department_of(user)`, `resolve_selected_department(request)`, `scope_queryset_to_department(queryset, request)`, `DepartmentScopedFilterBackend`/`DepartmentScopedObjectPermission` (drop-in DRF filter/permission classes), `role_name_of(user)`, `is_hod_role`/`is_admin_role`/etc., `selectable_departments()` (departments minus `HIDDEN_DEPARTMENTS = {ADMIN, NBCD, HULL}`), and the ship's hierarchy-chart helpers (`hierarchy_edit_scope`, `can_edit_hierarchy_node`). New department-scoped views/viewsets should reuse these rather than rolling ad hoc department checks — several past bugs in this codebase were exactly that (a view that duplicated department filtering instead of calling `rbac.scope_queryset_to_department`, and drifted out of sync).

**Shared model/manager base (`master/models.py`, `master/managers.py`)**: `master.models.Base` is the abstract base most reference-data models extend; many tables use legacy CMMS-style `db_table` names (`Master_department`, `Master_sub_department`, etc.) since this schema is synced with an external CMMS system. `master.managers.BaseManager`/`BaseQuerySet` provide a generic `.active()`/`.inactive()` that auto-detects whether a model uses `is_active` (boolean) or a legacy `active` field (`1`/`2` convention) — don't assume a model's active-flag field name without checking.

**Ship context**: most equipment/config data is scoped to a single "active ship" (`master.models.ActiveShipConfig`, set via a Step-0 selection screen in the frontend). `master.utils.get_this_ship()` is the canonical resolver (`ActiveShipConfig` selection → `DEFAULT_SHIP_ID`/`SHIP_ID` env fallback → `SWMM_SHIP_CODE` fallback) and should be imported from `master.utils` everywhere — a duplicate, subtly-different `get_this_ship()` in `sfd/utils.py` previously caused create/list ship-resolution mismatches; don't reintroduce a second implementation.

**Approval workflows**: several apps model a pending→approved lifecycle rather than writing directly to the "active" view of data (e.g. `sfd.ShipEquipment.status`: `"active"` vs `"2"` (pending CMMS approval) vs `"3"` (rejected) — new submissions default to pending and are deliberately excluded from default list views until approved, but remain reachable by PK via `retrieve`). When a "created but doesn't show up in the list" report comes in, check for this pattern before assuming it's a query bug.

**PDF generation**: WeasyPrint (`HTML(string=...).write_pdf()`), not pdfkit/wkhtmltopdf — pdfkit was fully removed (CVE-2025-26240) and its dependency should never be reintroduced. CSS must target WeasyPrint's `@page` margin-box syntax (`content: counter(page)`/`counter(pages)`), not wkhtmltopdf's JS-based header/footer substitution. This applies to PDF generation that still happens in-process (e.g. `obs`/`wlms` survey certificates, DART's `.accdb` export chain) — see Document generation below for the newer, out-of-process path some report exports now use instead.

**Document generation (`document/service.py::DocumentService`)**: a newer path for report exports (`pdf`/`csv`/`excel`) that delegates rendering to the sibling **`document`** microservice over HTTP instead of building the file in-process. A viewset's `list()` calls `DocumentService.list(view, request, filename)`, which checks `?report_type=`, serializes the queryset, and — for `pdf`/`csv`/`excel` — POSTs the serialized data to `settings.DOCUMENT_SERVICE_URLS` (`document`'s `/api/v1/documents/generate_report/`) and streams back the response as a file download; any other/no `report_type` just returns the plain serialized `Response`. Adoption is partial — check whether a given app's report/export endpoint already calls `DocumentService` before adding a new WeasyPrint-based export, so the same report type doesn't end up implemented twice in two different places.

**DART `.accdb` export** (`op_maintenance/services.py`): tries three fallback tiers (win32com/ADOX COM, PowerShell/COM script, JPype+Jackcess). Only the Jackcess/JVM tier is viable on the production Linux container; the JRE must be present in the Docker image for it to work — the other two tiers are Windows/Office-only and will always fail in production.

**Background jobs**: Celery tasks in each app's `tasks.py` are autodiscovered; protected endpoints check worker health first and fall back to synchronous execution if no worker responds (tunable via `CELERY_HEALTHCHECK_TIMEOUT`/`CELERY_HEALTHCHECK_CACHE_TTL`).

**API docs**: drf-spectacular generates the schema; Swagger UI is gated behind `ENABLE_SWAGGER` (off by default) and served via `drf_spectacular_sidecar`, not a CDN.

**Errors**: `swmm.exceptions.custom_exception_handler` wraps DRF's default handler and reshapes `ValidationError` responses into `{"status": "error", "message": "...", <field errors>}` — match this shape when hand-building error responses so the frontend's generic error handling picks them up.
