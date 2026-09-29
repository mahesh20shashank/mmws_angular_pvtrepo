# Document Service

Shared document/file storage microservice used by both the SWMM backend and
the ITTTM backend. Design background: `C:\Users\yuvraj.rana\.claude\plans\analyse-my-swmm-backend-crispy-lighthouse.md`.

## What it does

- Stores uploaded files on local disk (path under `STORAGE_ROOT`, mounted as
  a named Docker volume in `docker-compose.yml` so uploads persist across
  restarts).
- Stores business metadata about each file (title, category, expiry date,
  which system/entity it belongs to, visibility scope) separately from the
  raw file (`FileObject` vs `Document` in `documents/models.py`).
- Is called only by trusted backends (SWMM's monolith, ITTTM's services),
  never directly by end users or browsers. Each calling backend authenticates
  its own users itself, then signs its requests to this service with a
  per-client HMAC secret - see `documents/authentication.py`.

## Database

Uses the existing `swmm_30` Postgres database, in its own `document` schema
(`DB_SCHEMA` env var). No other app reads/writes this schema directly; they
only reach it through this service's HTTP API.

## Local setup

```
cp sample.env .env   # fill in DB_USER / DB_PASSWORD etc.
poetry install
poetry run python manage.py migrate
poetry run python manage.py create_service_client swmm-backend swmm
poetry run python manage.py create_service_client ittm-document-management ittm
poetry run python manage.py runserver 8010
```

The `create_service_client` command prints an `X-Service-Key` and secret
once - store them in the calling backend's own env/config, they can't be
retrieved again afterwards.

## API

All endpoints are under `/api/v1/documents/` and require the three
service-auth headers below on every request:

- `X-Service-Key`: the client key from `create_service_client`
- `X-Timestamp`: current unix epoch seconds
- `X-Signature`: `hex(HMAC-SHA256(secret, "<METHOD>.<path>.<client_key>.<timestamp>"))`

| Method | Path                              | Purpose                         |
|--------|-----------------------------------|----------------------------------|
| POST   | `/upload/`                        | Upload a file + metadata         |
| GET    | `/`                                | List/filter documents            |
| GET    | `/<uuid>/`                        | Get one document's metadata      |
| DELETE | `/<uuid>/`                        | Soft-delete a document           |
| GET    | `/<uuid>/download/`               | Stream the underlying file       |

OpenAPI schema at `/api/schema/`, Swagger UI at `/api/docs/` when
`ENABLE_SWAGGER=True`.
