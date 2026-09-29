  import { Injectable, signal, inject } from '@angular/core';
  import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
  import { Observable } from 'rxjs';
  import { resolveCmmsApiUrl, resolveAuthApiUrl } from '../../../../environments/api-url';

  /** Query-string params accepted by Angular's `HttpClient` `params` option. */
  type HttpQueryParams =
    | HttpParams
    | Record<string, string | number | boolean | readonly (string | number | boolean)[]>;

  /** Options accepted by every {@link AppService} HTTP helper. */
  interface HttpRequestOptions {
    params?: HttpQueryParams;
    headers?: HttpHeaders | Record<string, string | string[]>;
    context?: HttpContext;
  }

  @Injectable({
    providedIn: 'root',
  })
  export class AppService {
    private readonly http = inject(HttpClient);

    baseUrl = resolveCmmsApiUrl();
    authBaseUrl = resolveAuthApiUrl() || resolveCmmsApiUrl();

    private resolveUrl(url: string): string {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      const cleanUrl = url.replace(/^\//, '');
      const isAuthOrAuthz = cleanUrl.startsWith('api/v1/auth/') || cleanUrl.startsWith('api/v1/authz/') || cleanUrl === 'api/v1/auth' || cleanUrl === 'api/v1/authz';
      const root = isAuthOrAuthz ? this.authBaseUrl : this.baseUrl;
      return `${root.replace(/\/$/, '')}/${cleanUrl}`;
    }

    /** GET `baseUrl + url`. */
    get<T>(url: string, options?: HttpRequestOptions): Observable<T>;
    get<T>(url: string, options: HttpRequestOptions & { observe: 'response' }): Observable<import('@angular/common/http').HttpResponse<T>>;
    get<T>(url: string, options: (HttpRequestOptions & { observe?: 'response' }) = {}) {
      const { observe, ...rest } = options;
      const targetUrl = this.resolveUrl(url);
      return observe === 'response'
        ? this.http.get<T>(targetUrl, { ...rest, observe: 'response' as const })
        : this.http.get<T>(targetUrl, rest);
    }
    getBlob(url: string, options: HttpRequestOptions = {}): Observable<Blob> {
      return this.http.get(this.resolveUrl(url), { ...options, responseType: 'blob' });
    }

    postBlob(url: string, payload: unknown, options: HttpRequestOptions = {}): Observable<Blob> {
      return this.http.post(this.resolveUrl(url), payload, { ...options, responseType: 'blob' });
    }

    /** POST `baseUrl + url`. */
    post<T = unknown>(url: string, payload: unknown, options?: HttpRequestOptions): Observable<T>;
    post<T = unknown>(url: string, payload: unknown, options: HttpRequestOptions & { observe: 'response' }): Observable<import('@angular/common/http').HttpResponse<T>>;
    post<T = unknown>(url: string, payload: unknown, options: (HttpRequestOptions & { observe?: 'response' }) = {}) {
      const { observe, ...rest } = options;
      const targetUrl = this.resolveUrl(url);
      return observe === 'response'
        ? this.http.post<T>(targetUrl, payload, { ...rest, observe: 'response' as const })
        : this.http.post<T>(targetUrl, payload, rest);
    }

    /** PUT `baseUrl + url`. */
    put<T = unknown>(url: string, payload: unknown, options?: HttpRequestOptions): Observable<T>;
    put<T = unknown>(url: string, payload: unknown, options: HttpRequestOptions & { observe: 'response' }): Observable<import('@angular/common/http').HttpResponse<T>>;
    put<T = unknown>(url: string, payload: unknown, options: (HttpRequestOptions & { observe?: 'response' }) = {}) {
      const { observe, ...rest } = options;
      const targetUrl = this.resolveUrl(url);
      return observe === 'response'
        ? this.http.put<T>(targetUrl, payload, { ...rest, observe: 'response' as const })
        : this.http.put<T>(targetUrl, payload, rest);
    }

    /** PATCH `baseUrl + url`. */
    patch<T = unknown>(url: string, payload: unknown, options?: HttpRequestOptions): Observable<T>;
    patch<T = unknown>(url: string, payload: unknown, options: HttpRequestOptions & { observe: 'response' }): Observable<import('@angular/common/http').HttpResponse<T>>;
    patch<T = unknown>(url: string, payload: unknown, options: (HttpRequestOptions & { observe?: 'response' }) = {}) {
      const { observe, ...rest } = options;
      const targetUrl = this.resolveUrl(url);
      return observe === 'response'
        ? this.http.patch<T>(targetUrl, payload, { ...rest, observe: 'response' as const })
        : this.http.patch<T>(targetUrl, payload, rest);
    }

    /** DELETE `baseUrl + url`. */
    delete<T = unknown>(url: string, options?: HttpRequestOptions): Observable<T>;
    delete<T = unknown>(url: string, options: HttpRequestOptions & { observe: 'response' }): Observable<import('@angular/common/http').HttpResponse<T>>;
    delete<T = unknown>(url: string, options: (HttpRequestOptions & { observe?: 'response' }) = {}) {
      const { observe, ...rest } = options;
      const targetUrl = this.resolveUrl(url);
      return observe === 'response'
        ? this.http.delete<T>(targetUrl, { ...rest, observe: 'response' as const })
        : this.http.delete<T>(targetUrl, rest);
    }

    loading = signal(false);
    private requestCount = 0;
    private startTime = 0;
    private readonly minDuration = 3000;
    /** True once something in the CURRENT loader session actually asked for the 3s floor -
     * see `showLoader`'s `requireMinDuration`. A save/delete confirmation needs the floor so it
     * never flashes too briefly to register; `loaderInterceptor`'s new GET-triggered loads for
     * Inventory's own slow reads do not - a fast one should stay fast, not be held open for
     * three seconds it did not need. If a floor-requiring call and a no-floor call happen to
     * overlap, the floor still applies to the whole session: hiding early would cut the
     * mutation's own confirmation short for the sake of the read that finished first. */
    private requiresMinDuration = false;

    showAlert = signal(false);
    alertTitle = signal('');
    alertMessage = signal('');

    showLoader(requireMinDuration = true) {
      if (this.requestCount === 0) {
        this.startTime = Date.now();
        this.loading.set(true);
        this.requiresMinDuration = false;
      }
      if (requireMinDuration) {
        this.requiresMinDuration = true;
      }

      this.requestCount++;
    }

    hideLoader(): Promise<void> {
      this.requestCount--;

      if (this.requestCount > 0) {
        return Promise.resolve();
      }

      this.requestCount = 0;

      if (!this.requiresMinDuration) {
        this.loading.set(false);
        return Promise.resolve();
      }

      const elapsed = Date.now() - this.startTime;
      const remaining = Math.max(0, this.minDuration - elapsed);

      return new Promise((resolve) => {
        setTimeout(() => {
          this.loading.set(false);
          resolve();
        }, remaining);
      });
    }

    private alertCallback: (() => void) | null = null;

    openAlert(title: string, message: string, callback?: () => void) {
      this.alertTitle.set(title);
      this.alertMessage.set(message);
      this.showAlert.set(true);
      this.alertCallback = callback || null;
    }

    closeAlert() {
      this.showAlert.set(false);
      if (this.alertCallback) {
        this.alertCallback();
        this.alertCallback = null;
      }
    }

  }
