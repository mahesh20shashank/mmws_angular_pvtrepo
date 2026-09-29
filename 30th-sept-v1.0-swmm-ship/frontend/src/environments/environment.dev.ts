// Used when building with `ng build --configuration dev` (see angular.json
// "fileReplacements" under that configuration, which swaps this in for environment.ts).
//
// `apiUrl` / `apiUrl1` / `API_URL` below are LEGACY and no longer read anywhere in the
// app — every API call now resolves its base URL at runtime via `resolveCmmsApiUrl()` /
// `resolveAuthApiUrl()` / `resolveItttmApiUrl()` in `./api-url.ts`, which derive the host
// from the browser's own `window.location` instead of a value baked in at build time.
// That's what fixed a real incident where a hardcoded `apiUrl` here/`environment.uat.ts`/
// `environment.prod.ts` got committed and broke login when deployed. Do not reintroduce
// `environment.apiUrl`/`apiUrl1`/`API_URL` reads in new code — use `api-url.ts` instead.
import { resolveAuthApiUrl, resolveCmmsApiUrl, resolveItttmApiUrl } from './api-url';

export const environment = {
  production: false,
  name: 'dev',
  // `resolveCmmsApiUrl()` etc. are used in code instead of these fixed strings; these are here
  // purely as a fallback for tooling that may still expect them.
  apiUrl: resolveCmmsApiUrl(),
  apiUrl1: resolveAuthApiUrl(),
  API_URL: resolveItttmApiUrl(),
};
