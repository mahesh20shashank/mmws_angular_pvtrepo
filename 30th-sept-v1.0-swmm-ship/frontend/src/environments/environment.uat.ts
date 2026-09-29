// Used when building with `ng build --configuration uat` (see angular.json
// "fileReplacements" under that configuration, which swaps this in for environment.ts).
// This is the config the UAT pipeline (`npm run build:uat`) actually builds with.
//
// `apiUrl` / `apiUrl1` / `API_URL` below are LEGACY and no longer read anywhere in the
// app — every API call now resolves its base URL at runtime via `resolveCmmsApiUrl()` /
// `resolveAuthApiUrl()` / `resolveItttmApiUrl()` in `./api-url.ts`, which derive the host
// from the browser's own `window.location` instead of a value baked in at build time.
// The `127.0.0.1` hardcoded below is the actual value that once caused a real incident:
// it got committed here, built into the UAT image, and broke login when deployed, since
// the deployed server obviously isn't `127.0.0.1` to the browser. `api-url.ts` is what
// fixed that class of bug for good — do not reintroduce
// `environment.apiUrl`/`apiUrl1`/`API_URL` reads in new code, use `api-url.ts` instead.

export const environment = {
  production: false,
  name: 'uat',
  apiUrl: 'http://172.16.40.161:8000/',
  apiUrl1: 'http://172.16.40.161:8001/',
  API_URL: 'http://172.16.40.161:8080/',
};
