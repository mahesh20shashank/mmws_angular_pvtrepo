# SWMM backend

**SWMM** ("Single Window Material Management") — a Django 5.2 + DRF API for ship
maintenance / logistics operations (equipment, defect/DART reporting, routines,
stores, hotwork permits, refits, crew management, …), serving an Angular SPA.

> **Auth model (read this first).** SWMM **does not authenticate anyone**. It is a
> pure *resource server* for **`authz_service`** (the sibling **`userauth/`**
> project). Every request must carry an RS256 bearer minted by `authz_service`;
> SWMM verifies it locally with a shared public key and issues no tokens of its
> own. There are **no** `login` / `refresh` / `logout` / `register` / `me`
> endpoints in SWMM. To run or test SWMM you must also run `authz_service`.
>
> See [`Documentations/AUTHZ_SERVICE_INTEGRATION_PLAN.md`](Documentations/AUTHZ_SERVICE_INTEGRATION_PLAN.md)
> for the full design.

---

## 1. Prerequisites

| Need | Notes |
|---|---|
| Python 3.12+ and [Poetry](https://python-poetry.org/) | `pyproject.toml` uses a private Nexus index that may be unreachable off the corporate network |
| PostgreSQL | one database is shared by both services — SWMM uses the `public` schema, `authz_service` uses its own `UserAuth` schema |
| Redis | Django cache **and** Celery broker/result backend. Must be reachable at the host/port in your `.env` |
| The sibling `userauth/` project | `authz_service` — the identity provider |

Repo layout (both services live under one parent):

```
SWMM_Sep_30/
├── keys/          # shared RS256 + login key pairs (generated once, git-ignored)
├── swmm/          # this project        -> runs on :8000
└── userauth/      # authz_service        -> runs on :8001
```

---

## 2. First-time setup

### 2a. Shared JWT keys (once for both services)

```bash
cd userauth
poetry install --no-root
poetry run python gen_keys.py          # writes ../keys/{jwt,login}_{private,public}.pem
```

Both services read `../keys/` (i.e. the repo root `keys/`). **Never** copy the
private key into SWMM — SWMM only needs `keys/jwt_public.pem`.

### 2b. authz_service (`userauth/`)

```bash
cd userauth
cp .env.example .env                    # KEYS_DIR=../keys and INTERNAL_SERVICE_KEY
                                        # are already correct; set DB_* if using Postgres
poetry run python manage.py migrate
poetry run python manage.py seed_rbac   # processes, roles, menus, nav, users, a SUPER_ADMIN
poetry run python manage.py runserver 0.0.0.0:8001
```

Seeded super-admin: **`SVC_ADMIN` / `change-me-now-01`**.

### 2c. SWMM (`swmm/`)

```bash
cd swmm
poetry install --no-root
cp sample.env .env
```

Edit `.env` — the integration block must be present (see `sample.env`):

```ini
AUTHZ_BASE_URL=http://localhost:8001
AUTHZ_LIVE_CHECK_TTL=45
INTERNAL_SERVICE_KEY=dev-internal-key     # MUST match userauth/.env
# AUTHZ_JWT_PUBLIC_KEY_PATH unset -> uses <repo-root>/keys/jwt_public.pem
```

Also set `SECRET_KEY`, `DB_*`, `ALLOWED_HOSTS`, `CELERY_*` / `REDIS_CACHE_URL`.
`LDAP_SERVER` / `LDAP_BASE_DN` are now optional (leave blank).

```bash
poetry run python manage.py migrate      # includes 0004_customuserprofile_authz_user_id
poetry run python seed_all.py            # departments + sub-departments + fixed Role rows ONLY
                                         # (users / credentials / nav matrix live in authz_service)
poetry run python manage.py runserver 0.0.0.0:8000
```

### 2d. Wire the real org IDs into the authz seed (important)

`authz_service`'s token `scope` and `department_id` claim must carry **real SWMM
`master` primary keys**, or department scoping in `users/rbac.py` sees nothing.
After SWMM's `seed_all.py` has run:

```bash
# in swmm/
poetry run python manage.py dump_org_ids > ../userauth/seed_data/org_ids.json

# in userauth/
poetry run python manage.py seed_rbac --org-ids seed_data/org_ids.json   # idempotent re-run
```

Re-run this whenever SWMM's `master.Department` / `MasterCommand` / `Ship` rows change.

---

## 3. Everyday commands

```bash
poetry run python manage.py runserver
poetry run python manage.py migrate
poetry run python manage.py makemigrations <app>
poetry run python manage.py check                     # fast import/config smoke test
poetry run python manage.py test                      # full suite (Django runner, not pytest)
poetry run python manage.py test users.tests_authz_integration   # the authz bridge tests
poetry run python seed_all.py                         # idempotent, no drop
poetry run flake8                                     # lint (see .flake8)
```

### Celery

Redis is both the Celery broker/result backend and the Django cache. Start a worker:

```bash
# Windows (solo pool):
poetry run celery -A swmm worker -l info --pool=solo --without-mingle --without-gossip
# Linux / macOS:
poetry run celery -A swmm worker -l info --without-mingle --without-gossip
```

Verify it from a second terminal — some endpoints check worker health before
dispatching and fall back to **synchronous** execution if no worker replies:

```bash
poetry run celery -A swmm inspect ping        # -> celery@<host>: OK / pong
```

Do **not** disable Celery remote control — the health check depends on it.
Tuning: `CELERY_HEALTHCHECK_TIMEOUT` (default `1.0`),
`CELERY_HEALTHCHECK_CACHE_TTL` (default `5.0`).

---

## 4. Smoke test (both services up)

```bash
# 1. get a token from authz_service
TOKEN=$(curl -s -X POST http://localhost:8001/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"username":"SVC_ADMIN","password":"change-me-now-01"}' | python -c "import sys,json;print(json.load(sys.stdin)['access'])")

# 2. call SWMM with it -> 200, a shadow CustomUser is auto-created on first hit
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/v1/user/all_users/ \
  -H "Authorization: Bearer $TOKEN"                       # 200

# 3. negative cases -> 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/v1/user/all_users/           # 401 (no token)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/v1/user/all_users/ \
  -H "Authorization: Bearer ${TOKEN}xx"                                                          # 401 (bad sig)
```

Other seeded logins (password `12345` unless noted): `1234` (super admin),
`ENG1234` (HOD, ENGINEERING), `ADMIN` / `admin` (SHIPADMIN), `GUEST1234` (guest).

---

## 5. How the bridge works

| Piece | File | Role |
|---|---|---|
| Token verification | `users/authentication.py::FleetJWTAuthentication` | RS256 verify + `alg` guard (rejects `none` / `HS256`) |
| Shadow-sync | `users/authz_sync.py::sync_principal` | Per request, upserts a local `CustomUser` / `CustomUserProfile` from the token claims, keyed on `CustomUserProfile.authz_user_id == token user_id`. Lets `users/rbac.py` keep working unchanged |
| Role mapping | `users/authz_roles.py` | authz `role_code` → SWMM `Role.role_name` (override via `AUTHZ_ROLE_MAP`) |
| Revocation freshness | `users/live_permissions.py::IsLiveAuthzUser` | On destructive endpoints — calls authz `GET /api/auth/me/`, cached `AUTHZ_LIVE_CHECK_TTL` s, denies on 401/403 |
| Service-to-service | `users/live_permissions.py::IsInternalService` | `X-Service-Key` header for machine calls (no bearer) |
| authz client | `users/authz_client.py` | `me()` liveness probe, `notification_recipients()` back-channel |

The Angular SPA logs in / refreshes / logs out **directly against `authz_service`**
(`:8001`) and sends the same access token to SWMM (`:8000`).

---

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Every SWMM request → **401** | Key mismatch. Both services must use the same `keys/jwt_public.pem`. Check `userauth/.env` has `KEYS_DIR=../keys` and there is **no** `userauth/keys/` dir. |
| Destructive endpoints → **403** `"Your session is no longer valid"` | SWMM can't reach `authz_service` for the `IsLiveAuthzUser` probe. Check `AUTHZ_BASE_URL` in `swmm/.env` points at the running authz host (dev: `http://localhost:8001`, not the docker default). Restart the SWMM server after editing `.env`. |
| HOD user sees `department: null` / no rows | The authz token carries no real `department_id`. Run the step 2d `dump_org_ids` → `seed_rbac --org-ids` sequence. |
| `redis.exceptions.ConnectionError` / `ConnectionInterrupted` traceback in logs | Redis unreachable at the `.env` host/port. It's **non-fatal** (cache degrades to no-op, `IGNORE_EXCEPTIONS` is on) but slow. If using a Docker Redis, make sure the port is **published** (`docker run -p 6379:6379 redis`), not just exposed. |
| `X-Service-Key` calls rejected | `INTERNAL_SERVICE_KEY` differs between `swmm/.env` and `userauth/.env`, or is empty. |

---

## 7. Status of the migration

Phase 1 (SWMM consumes `authz_service`, keeps `CustomUser` as a shadow) is
implemented and verified end-to-end. Still open: `IsInternalService` on the CMMS
`integration_urlpatterns`, docker-compose `authz-service` service, and pruning
the stale auth tests in `users/tests.py`. Phase 2 (delete the `users` app) is a
future roadmap — see the integration plan doc.
