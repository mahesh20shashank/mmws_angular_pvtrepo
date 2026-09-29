// Single source of truth for every backend base URL the app calls. Every one of these
// is computed at RUNTIME from the browser's own `window.location`, instead of being a
// fixed string baked into the build by `environment.ts`/`environment.{dev,uat,prod}.ts`.
// That's a deliberate fix, not a style choice: those environment files used to be read
// directly (`environment.apiUrl`/`apiUrl1`/`API_URL`), and a hardcoded `127.0.0.1` value
// once got committed there, built into the UAT image, and broke login in a real
// deployment — the live server is never actually `127.0.0.1`/`localhost` to the browser.
// Because these functions derive the host from `window.location` instead, the exact same
// build works correctly wherever it's actually served from (local dev, UAT, prod), with
// no per-environment value to get wrong.
//
// `resolveCmmsApiUrl()`/`resolveAuthApiUrl()` only add an explicit port for local dev
// (`localhost`/`127.0.0.1`), where the backend runs directly on that port with nothing in
// front of it. On any real server (UAT/prod) they deliberately return the bare host, no
// port — DevOps owns port routing there via a reverse proxy, so the browser should never
// hit a port directly. Don't add a port back into either of those two for "real servers"
// without checking with DevOps first — that's a deliberate, requested behavior, not an
// oversight.
//
// The one exception is `resolveItttmApiUrl()` below — that's a genuinely separate,
// fixed external server (not co-located with the frontend, not behind DevOps's reverse
// proxy either), so it can't be derived from `window.location` and always keeps its port.
//
// Import from here, not from `environment.ts` — `environment.apiUrl`/`apiUrl1`/`API_URL`
// are legacy fields, unused everywhere in the app; don't reintroduce reads of them.

const isLocalDev = (hostname: string): boolean => hostname === 'localhost' || hostname === '127.0.0.1';

// CMMS API - same host as the frontend itself. Locally, the backend runs directly on
// this fixed port (no reverse proxy in front, so the port must be explicit). On any real
// server (UAT/prod), DevOps owns port routing behind a reverse proxy — the browser only
// ever hits the bare host, no port — so no port is added there.
export const resolveCmmsApiUrl = (): string => {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8000/';
  }

  const { protocol, hostname } = window.location;
  return isLocalDev(hostname) ? `${protocol}//${hostname}:8000/` : `${protocol}//${hostname}/`;
};

// Auth/RBAC API - same host as the frontend itself, distinct port locally (see
// resolveCmmsApiUrl() above for why local keeps the port and real servers don't).
export const resolveAuthApiUrl = (): string => {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8001/';
  }

  const { protocol, hostname } = window.location;
  return isLocalDev(hostname) ? `${protocol}//${hostname}:8001/` : `${protocol}//${hostname}/`;
};

// Phase 2 API (Port 8080) - a separate, fixed external service, NOT co-located with the
// frontend — same address regardless of whether the app is on local/uat/prod, so unlike
// the two functions above this is intentionally a hardcoded constant, not derived from
// window.location.
export const resolveItttmApiUrl = (): string => {
  // .87 is an older/alternate address for this same service, kept here as a quick
  // toggle if .161 ever needs to be swapped back — not currently in use.
  //return 'http://172.16.40.87:8080/';
  // eslint-disable-next-line sonarjs/no-clear-text-protocols -- this external service is http-only, not https
  return "http://172.16.40.161:8080/";
};
