# SWMM Frontend — Project Guide

Angular 20 single-page application for the Ship-Wide Maintenance Management (SWMM)
system. Standalone-component architecture, signal-based state, Tailwind styling,
lazy-loaded feature modules. This file is the default ruleset for all work in
`frontend/`.

## Commands

```bash
npm start              # ng serve — dev server on http://localhost:4200
npm run build          # production build (default configuration)
npm run build:dev      # dev environment build
npm run build:uat      # uat environment build
npm run build:prod     # production build
npm run watch          # rebuild on change (development config)
npm test               # Karma + Jasmine unit tests
npm run lint           # angular-eslint
```

Node/Angular CLI 20.x. Package manager: npm (use `package-lock.json`).

## Tech Stack

- **Angular 20.1** — standalone components only, **no NgModules**.
- **TypeScript 5.8**, `strict: true` + `strictTemplates`, `noImplicitOverride`,
  `noPropertyAccessFromIndexSignature`, `noImplicitReturns`.
- **State:** Angular signals (`signal`, `computed`). No NgRx.
- **Styling:** Tailwind CSS 3.4 + `@tailwindcss/typography`; global component
  classes in `src/styles.css`.
- **Data grid:** ag-grid-community 35 (`AllCommunityModule` registered globally).
- **Charts:** ECharts 6 via `ngx-echarts` (gauge chart registered in `app.config.ts`),
  ng2-charts/Chart.js.
- **Toasts:** `ngx-sonner` — one global `<ngx-sonner-toaster>` (top-right, `richColors`)
  in `app.html`, restyled to solid status colours in `src/styles.css`. Raise toasts via
  `NotificationService` (`services/notification/`), never `toast` from ngx-sonner directly.
  On mutating HTTP calls (POST/PUT/PATCH/DELETE) success/error toasts + the full-screen
  loader are raised automatically by `feedbackInterceptor` / `loaderInterceptor`; opt a
  request out with `skipFeedback({ loader, toast })` (`services/network/http-feedback.ts`).
- **Icons:** `@lucide/angular` v1.x — **no NgModule**. Used **by name** via a global
  registry (see Icon System below): components import only `LucideDynamicIcon` and
  write `<svg lucideIcon="filter">`.
- **HTTP:** `HttpClient` with functional interceptors.

## Architecture

### Bootstrap
- `src/main.ts` → `bootstrapApplication(App, appConfig)`.
- `src/app/app.config.ts` — all providers: router, HTTP client + interceptors,
  animations, toastr, charts, echarts, zone change detection (`eventCoalescing`),
  ag-grid + echarts module registration.
- `src/app/app.ts` (`App`) — root shell; on init restores the session via
  `Auth.initializeSession()` then loads the logged-in user.

### Layouts (two shells)
- `layout/outer-layout/` (`OuterLayout`) — public routes (landing, auth).
- `layout/main-layout/` (`MainLayout`) — authenticated app under `/afterAuth`;
  hosts `Header`, `Sidebar`, `Breadcrum`, `Footer`, and the routed outlet.

### Routing (`src/app/app.routes.ts`)
- Every feature page is **lazy-loaded** with `loadComponent: () => import(...)`.
- Authenticated app lives under the `afterAuth` parent (guarded by `authGuard`).
  Public landing under `""` (guarded by `guestGuard`).
- Each feature is a route group with a default `redirectTo: "dashboard"`.
- Unmatched routes under `afterAuth` fall back to the `UnderConstruction` shared
  component. Route `data` carries mode flags (e.g. `mode: "transaction"`).

### Authentication & HTTP
- Token is held in memory as a **signal** on `Data` (`accessToken`), never in
  localStorage. Refresh relies on an httpOnly cookie (`withCredentials: true`).
- `services/interceptor/interceptor.ts`:
  - `authInterceptor` — clones every request with `withCredentials` and a
    `Bearer` header when a token exists.
  - `refreshTokenInterceptor` — on 401 (except auth/landing URLs) calls
    `Auth.refreshAccessToken()` and retries once.
- `guards/auth/auth-guard.ts` — `authGuard` (requires session, else redirect to
  `/landing`) and `guestGuard` (redirects authenticated users to
  `/afterAuth/home`). Both functional (`CanActivateFn`).
- `services/auth/auth.ts` (`Auth`) — login/logout/refresh; dedupes concurrent
  refreshes via an in-flight promise.

### API layer
- **Central service:** `services/network/call.ts` (`Call`) wraps `HttpClient`
  with private generic `get/post/put/delete` helpers and `baseUrl =
  environment.apiUrl`. Most endpoints live here; add new shared endpoints here.
- **Feature API services:** larger features may own a dedicated service (e.g.
  `Pages/operational-coordination-planner/services/planner-api.service.ts`).
- Endpoints follow `api/v1/<domain>/...`. Responses are typed with co-located
  `*.model.ts` interfaces; some legacy calls still use `any`.

### State
- Signals are the state primitive. Shared state services (`Data`, `User`) and
  feature stores (`Pages/operational-coordination-planner/store/planner.store.ts`,
  a `providedIn: 'root'` signal store with `computed` selectors) hold app state.
- Async flows convert Observables with `firstValueFrom`. Prefer `async/await` in
  services, RxJS operators only where composition is needed.

### Navigation system (`Core/config/navigation/`)
- **Config-driven** sidebar + header. `navigation.config.ts` declares each
  `NavigationModule` (id, title, section, baseRoute, sidebar tree, header tabs).
  `navigation.service.ts` resolves the current module/header/breadcrumb label
  from the URL. Icons come from `Core/constants/sidebar-icons.ts`.
- To add a module to the chrome, extend `NAVIGATION_CONFIG` — do not hardcode nav
  items in components.

## Folder Structure (`src/app`)

```
Core/          Config-driven navigation, constants (icons), interfaces
Pages/         Feature modules (one folder per domain)
shared/        Reusable UI — app-* wrappers + components/ library
component/     App chrome: header, sidebar, footer, loader, alert, breadcrum
layout/        MainLayout (authed) + OuterLayout (public) shells
services/      Cross-cutting services: network/Call, auth, data, user, interceptor
guards/        Functional route guards
```

- **Feature folder layout** (`Pages/<feature>/`): page component + co-located
  `*.model.ts`; complex features add `components/`, `services/`, `store/`,
  `models/`, `constants/` subfolders (see `operational-coordination-planner`).
- **Environments** (`src/environments/`): `environment.ts` (dev default),
  `.dev/.uat/.prod` via Angular `fileReplacements`. `api-url.ts` resolves the API
  base from `window.location` at runtime.

## Shared / Reusable Components

Reach for these before building new UI (under `shared/`):

- `shared/components/data-grid/` (`app-data-grid`) — ag-grid wrapper with
  pagination, selection, and custom cell renderers (`grid-*-cell.ts`,
  `grid-action-button/`). Preferred way to render tabular data.
- `shared/components/modal/` (`app-modal`) — base modal with size variants
  (`sm|md|lg|xl`) and `closeModal` output.
- `shared/components/kpi-card/`, `shared/app-stat-card/`, `shared/components/info-card/`,
  `shared/components/donut-chart/`, `shared/components/speedometer-card/`,
  `shared/components/stacked-bar-chart/` — dashboard widgets.
- Form inputs: `shared/components/input-field`, `select-input`, `radio-input`,
  `textarea-input`, `file-input`, `date-picker`, `date-wheel-picker`,
  `custom-calendar`.
- `shared/app-button`, `app-dropdown`, `app-search`, `app-tabs`, `app-breadcrumb`,
  `app-export-actions`, `shared/components/export-menu`.
- `shared/components/under-construction/` — placeholder page for unbuilt routes.
- App chrome (`component/`): `header`, `sidebar`, `footer`, `loader`, `alert`,
  `breadcrum`, `mail-noti-center`.

## Conventions

### Components
- **Always** `standalone: true` with an explicit `imports` array. Import
  `CommonModule` for `*ngIf`/`*ngFor`, `FormsModule` for `ngModel`.
- Selectors are `app-` prefixed, **kebab-case** for components, **camelCase** for
  attribute directives (enforced by angular-eslint).
- Templates and styles are **separate files** (`templateUrl`/`styleUrl`), not
  inline.

### Dependency injection
- Prefer the **`inject()`** function over constructor injection (dominant pattern
  in this codebase). Mark injected fields `private readonly` where possible.

### File & symbol naming
- The codebase is **mixed**; match the folder you are editing:
  - Angular-20 default (most files): bare names — `dashboard.ts` → class
    `Dashboard`, `header.ts` → `Header`. Files: `.ts / .html / .css`.
  - Newer/feature code: descriptive suffixes — `*.component.ts`,
    `*.service.ts`, `*.store.ts`, and class `FooComponent`.
- Models: `*.model.ts`, co-located with the feature that owns them.
- **When adding files to an existing folder, follow that folder's existing
  naming — do not mix styles within one feature.**

### TypeScript
- Strict mode is on — respect it. Avoid `any` for new code; type API responses
  with `*.model.ts` interfaces (existing `any` usage is legacy, don't expand it).

### Styling
- Tailwind utility-first. Reuse global component classes from `src/styles.css`
  (`@layer components`: `.form-field-label`, `.form-field-input`,
  `.form-field-select`, `.nav-item`) instead of re-declaring them.
- Theme tokens in `tailwind.config.js`: `accent-blue #1D96E9`, `accent-light`,
  `accent-glow`; fonts Inter/Poppins.
- Component style files are mostly `.css`; some newer components use `.scss`.
  Match the neighbouring components.

### Icon System (Lucide)
Icons are `@lucide/angular` v1.x used **by name**, theme-aware and token-driven.

- **Preferred — the `<app-icon>` wrapper** (`shared/components/icon/icon.component.ts`):
  import `IconComponent`, then `<app-icon name="filter" variant="accent" [size]="16" />`.
  Inputs: `name` (required), `size`, `strokeWidth`, `variant`
  (`default|inherit|muted|accent|success|warning|danger`), `spin`. Use
  `variant="inherit"` inside containers that already set a themed/active `color`
  (e.g. the sidebar nav spans).
- **Low-level:** import `LucideDynamicIcon` and use `<svg lucideIcon="filter">`.
  Follows the theme via `--icon-color` (= `--text-primary`). Data-driven:
  `[lucideIcon]="expr"` where `expr` is a kebab name string.
- **Register new names:** add the `LucideXxx` directive to `provideLucideIcons(...)`
  in `app.config.ts` — the single place icon names resolve. (Name typos fail
  silently at runtime, not at compile — so register before using.)
- **Color:** don't hardcode `color="#…"`. Use variant classes on the `<svg>`:
  `icon--muted | icon--accent | icon--success | icon--warning | icon--danger`,
  or `icon--inherit` to follow surrounding text. Toggle dynamically with
  `[class.icon--accent]="isActive"`.
- **Size:** `[size]="16"` per-icon, or classes `icon--xs/sm/md/lg/xl`. Default size
  (20) / stroke (2) come from `provideLucideConfig()`.
- **Customize globally:** edit the `--icon-*` tokens in the `[data-theme]` blocks
  in `src/styles.css` (ICON SYSTEM section) — changes every icon app-wide, per theme.
- **Nav icons:** `Core/constants/sidebar-icons.ts` exports Lucide **names** (not SVG),
  consumed by `navigation.config.ts` (`icon` field) and rendered via `<app-icon>` in
  the sidebar. Change a nav icon by swapping the name there (register it if new).

### Testing
- Karma + Jasmine. Spec files are `*.spec.ts` co-located with the unit. Many are
  CLI-generated stubs — extend rather than delete.

## Do / Don't

- **Do** add shared API endpoints to `Call`; add page routes as lazy
  `loadComponent` entries; register nav entries in `navigation.config.ts`.
- **Do** use signals for state and `firstValueFrom` to await HTTP in services.
- **Don't** introduce NgModules, store tokens in localStorage, hardcode the API
  base URL (use `environment.apiUrl`), or bypass the interceptors.
- **Don't** duplicate an existing shared component — check `shared/` first.
