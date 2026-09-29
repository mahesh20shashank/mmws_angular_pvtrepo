import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { EMPTY, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { NotificationService } from '../../../Core/services/notification/notification.service';
import { skipFeedback } from '../../../Core';

export type Primitive = string | number | boolean | null | undefined;

export type RequestParams = Record<string, Primitive | Primitive[] | any>;

export interface ApiListResponse<T> {
  data?: T[];
  results?: T[];
  message?: string;
}

export interface DropdownOption<T = string | number> {
  label: string;
  value: T;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly apiUrl = environment.API_URL;
  private readonly hullApiUrl = (environment as any).HULL_API_URL || 'https://hull-insights-api.ilizien-projects-cdf.in:8443/';
  private readonly genericServerErrorMessage =
    'Something went wrong on server. Please try again.';
  private readonly http = inject(HttpClient);
  private readonly notificationService = inject(NotificationService);

  constructor() { }

  private buildUrl(endpoint: string): string {
    if (!endpoint) return this.apiUrl;
    if (/^https?:\/\//i.test(endpoint)) return endpoint;

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    const isHullEndpoint =
      cleanEndpoint.startsWith('shipmodule/') ||
      cleanEndpoint.startsWith('yardmodule/') ||
      cleanEndpoint.includes('master/boat-details') ||
      cleanEndpoint.includes('master/dockyards') ||
      cleanEndpoint.includes('master/boat-specifications') ||
      cleanEndpoint.includes('master/boat-builders') ||
      cleanEndpoint.includes('master/engine-oems') ||
      cleanEndpoint.includes('master/survey-cycle') ||
      cleanEndpoint.includes('master/reference-electrodes') ||
      cleanEndpoint.includes('master/anodes') ||
      cleanEndpoint.includes('master/strakes') ||
      cleanEndpoint.includes('master/decks');

    const targetBase = isHullEndpoint ? this.hullApiUrl : this.apiUrl;

    const base = targetBase.endsWith('/') ? targetBase.slice(0, -1) : targetBase;
    let path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    if (isHullEndpoint) {
      const queryIdx = path.indexOf('?');
      if (queryIdx !== -1) {
        const routePath = path.substring(0, queryIdx);
        const queryString = path.substring(queryIdx);
        if (!routePath.endsWith('/')) {
          path = `${routePath}/${queryString}`;
        }
      } else if (!path.endsWith('/')) {
        path = `${path}/`;
      }
    }

    return `${base}${path}`;
  }

  private buildHttpParams(params?: RequestParams): HttpParams | undefined {
    if (!params) return undefined;

    let httpParams = new HttpParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') return;

      if (Array.isArray(value)) {
        const filteredArray = value.filter(
          (item) => item !== null && item !== undefined && item !== ''
        );

        if (filteredArray.length > 0) {
          httpParams = httpParams.set(key, JSON.stringify(filteredArray));
        }

        return;
      }

      httpParams = httpParams.set(key, String(value));
    });

    return httpParams;
  }

  private extractErrorMessage(error: any): string {
    const htmlResponsePattern = /<("[^"]*"|'[^']*'|[^'">])*>/;

    if (error?.error instanceof ErrorEvent) {
      return error.error.message || 'Client-side error occurred.';
    }

    if (typeof error?.error === 'string') {
      const trimmedError = error.error.trim();
      if (
        trimmedError.startsWith('<!DOCTYPE') ||
        trimmedError.startsWith('<html') ||
        htmlResponsePattern.test(trimmedError)
      ) {
        return this.genericServerErrorMessage;
      }

      return error.error;
    }

    if (error?.error?.message) {
      return error.error.message;
    }

    if (Array.isArray(error?.error?.errors) && error.error.errors.length) {
      return error.error.errors.join(', ');
    }

    switch (error?.status) {
      case 0:
        return 'Unable to connect to server. Please check your network.';
      case 400:
        return 'Bad request.';
      case 401:
        return 'Session expired. Please login again.';
      case 403:
        return 'You are not authorized to perform this action.';
      case 404:
        return 'Requested resource not found.';
      case 500:
        return 'Server error occurred. Please try again later.';
      default:
        if (typeof error?.message === 'string') {
          const trimmedMessage = error.message.trim();
          if (
            trimmedMessage.startsWith('<!DOCTYPE') ||
            trimmedMessage.startsWith('<html') ||
            htmlResponsePattern.test(trimmedMessage)
          ) {
            return this.genericServerErrorMessage;
          }

          return trimmedMessage;
        }
        return 'An unknown error occurred.';
    }
  }

  private handleError(error: any): Observable<never> {
    console.log('error', error, error.status, error.error.message);

    const message = this.extractErrorMessage(error);
    this.notificationService.error(message);
    return EMPTY;
  }

  get<T>(endpoint: string, params?: RequestParams): Observable<T> {
    return this.http
      .get<T>(this.buildUrl(endpoint), {
        params: this.buildHttpParams(params),
      })
      .pipe(catchError((error) => this.handleError(error)));
  }

  getText(endpoint: string, params?: RequestParams): Observable<string> {
    return this.http
      .get(this.buildUrl(endpoint), {
        params: this.buildHttpParams(params),
        responseType: 'text',
      })
      .pipe(catchError((error) => this.handleError(error)));
  }

  post<T>(endpoint: string, body?: unknown, params?: RequestParams): Observable<T> {
    return this.http
      .post<T>(this.buildUrl(endpoint), body ?? {}, {
        params: this.buildHttpParams(params),
        context: skipFeedback({ toast: true }),
      })
      .pipe(catchError((error) => this.handleError(error)));
  }

  uploadFile<T>(endpoint: string, formData: FormData): Observable<T> {
    return this.http.post<T>(this.buildUrl(endpoint), formData, {
      context: skipFeedback({ toast: true }),
    }).pipe(
      catchError((error) => this.handleError(error))
    );
  }

  put<T>(endpoint: string, body?: unknown, params?: RequestParams): Observable<T> {
    return this.http
      .put<T>(this.buildUrl(endpoint), body ?? {}, {
        params: this.buildHttpParams(params),
        context: skipFeedback({ toast: true }),
      })
      .pipe(catchError((error) => this.handleError(error)));
  }

  patch<T>(endpoint: string, body?: unknown, params?: RequestParams): Observable<T> {
    return this.http
      .patch<T>(this.buildUrl(endpoint), body ?? {}, {
        params: this.buildHttpParams(params),
        context: skipFeedback({ toast: true }),
      })
      .pipe(catchError((error) => this.handleError(error)));
  }

  delete<T>(endpoint: string, body?: unknown, params?: RequestParams): Observable<T> {
    return this.http
      .delete<T>(this.buildUrl(endpoint), {
        body,
        params: this.buildHttpParams(params),
        context: skipFeedback({ toast: true }),
      })
      .pipe(catchError((error) => this.handleError(error)));
  }

  getDropdownData<T extends Record<string, any>, V = any>(
    endpoint: string,
    config: { labelKey: keyof T; valueKey: keyof T; htmlTag?: string },
    params?: RequestParams
  ): Observable<DropdownOption<V>[]> {
    // console.log('params', params);
    return this.http
      .get<ApiListResponse<T> | T[]>(this.buildUrl(endpoint), {
        params: this.buildHttpParams(params),
      })
      .pipe(
        map((response) => {
          const items: T[] = Array.isArray(response)
            ? response
            : response?.data ?? response?.results ?? [];

          return items.map((item) => {
            let mappedHtml = config.htmlTag ?? '';

            if (mappedHtml) {
              mappedHtml = mappedHtml.replace(/\{\{\s*(.*?)\s*\}\}/g, (_, expr: string) => {
                const expression = expr.trim();

                if (expression.includes('||')) {
                  const [left, right] = expression.split('||').map((v) => v.trim());
                  const leftValue = this.resolveDropdownTemplateValue(item, left);
                  if (leftValue !== null && leftValue !== undefined && leftValue !== '') {
                    return String(leftValue);
                  }
                  return right.replace(/^['"`](.*)['"`]$/, '$1');
                }

                const value = this.resolveDropdownTemplateValue(item, expression);
                return value !== null && value !== undefined ? String(value) : '';
              });

              mappedHtml = mappedHtml.replace(
                /<(\w+)([^>]*?)\s\*ngIf="([^"]+)"([^>]*)>(.*?)<\/\1>/gs,
                (_, tag: string, before: string, condition: string, after: string, content: string) => {
                  const conditionValue = this.resolveDropdownTemplateValue(item, condition.trim());
                  return conditionValue
                    ? `<${tag}${before}${after}>${content}</${tag}>`
                    : '';
                }
              );
            }

            return {
              label: String(item?.[config.labelKey] ?? ''),
              value: item?.[config.valueKey] as V,
              htmlTag: mappedHtml,
            };
          });
        }),
        catchError((error) => this.handleError(error))
      );
  }
  private resolveDropdownTemplateValue(item: Record<string, any>, expression: string): any {
    const cleanExpression = expression.replace(/^item\./, '').trim();

    return cleanExpression.split('.').reduce((acc: any, key: string) => acc?.[key], item);
  }

  formatDate(date: string | Date, format: 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' = 'DD-MM-YYYY'): string {
    if (!date) return '';

    const dateObj = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(dateObj.getTime())) return String(date);

    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();

    switch (format) {
      case 'DD-MM-YYYY':
        return `${day}-${month}-${year}`;
      case 'MM-DD-YYYY':
        return `${month}-${day}-${year}`;
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      case 'DD/MM/YYYY':
        return `${day}/${month}/${year}`;
      case 'MM/DD/YYYY':
        return `${month}/${day}/${year}`;
      default:
        return `${day}-${month}-${year}`;
    }
  }
}
