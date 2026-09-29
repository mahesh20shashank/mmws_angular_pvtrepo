# SWMM Frontend — Local Notes (not committed)

Personal/local working notes and developer preferences. This file is git-ignored —
keep machine-specific and in-progress context here, not in `CLAUDE.md`.

## Local dev

- Dev server: `npm start` → http://localhost:4200
- Backend API base is resolved at runtime from `window.location`
  (`src/environments/api-url.ts`):
  - `127.0.0.1` → `http://127.0.0.1:8000/`
  - `localhost`  → `http://localhost:8000/`
  - otherwise    → same protocol+host as the frontend
- Run the Django backend (repo `../backend`) on port 8000 so the SPA can reach
  `api/v1/...`. See root `docker-compose.yml` for the full stack.
- Auth needs cookies: requests are sent with `withCredentials`, and refresh
  depends on an httpOnly cookie. Use `127.0.0.1`/`localhost` consistently so the
  cookie domain matches.

## Repo layout reminder

- This project is the `frontend/` of the monorepo `swmm-ship` (also has
  `backend/`, `nginx/`, `scripts/`). CI is GitLab (`.gitlab-ci.yml`), SonarQube
  configured (`sonar-frontend.properties`). Deploy via `Dockerfile` + `nginx.conf`.
- Main branch: `main`. Current working branch may differ.

## Known rough edges (verify before relying on)

- **Naming is inconsistent** across features (bare vs `*.component.ts`). Confirm a
  folder's style before adding files.
- Some route paths have typos/inconsistencies (e.g. `open-darts`,
  `calendar-based-routing`, mixed casing like `equipment-due-for-ABER`). Match the
  existing string exactly when linking; don't "fix" without checking callers.
- `Call` service (`services/network/call.ts`) is large and mixes typed and `any`
  endpoints — grep it before adding a duplicate endpoint.
- A few shared component folders are empty scaffolds (`app-button`,
  `app-stat-card`, `component/toast`) — check they're implemented before importing.
- Duplicate/overlapping feature folders exist (e.g. `ship-returns/srar` vs
  `ship-returns/ship-returns/srar`, `maintenance-prioritisation` vs
  `maintenanc-prioritization`). Confirm which is wired into routes.

## My preferences (edit freely)

- Prefer `inject()` over constructor DI; `private readonly` for injected deps.
- Type new API responses with `*.model.ts` interfaces — avoid new `any`.
- Reuse shared components/global Tailwind classes before writing new UI/CSS.

## Scratch / TODO

- (add your own local task notes here)
