import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, from, switchMap, tap, throwError } from 'rxjs';
import { Auth } from '../../auth/services/auth.service';
import { AppService } from '../../services/app/app.service';
import { NotificationService } from '../../services/notification/notification.service';
import {
  getErrorMessage,
  getSuccessMessage,
  isAuthUrl,
  isInventoryApiUrl,
  MUTATION_METHODS,
  SKIP_LOADER,
  SKIP_TOAST,
} from '../services/http-feedback';
import { LandingPageService } from '../../../Modules/landing/services/landing-page.service';
import { resolveItttmApiUrl } from '../../../../environments/api-url';

const shouldSkipRefresh = (url: string): boolean => {
  return (
    url.includes('/landing') ||
    url.includes('/api/v1/auth/token/') ||
    url.includes('/api/v1/auth/token/access/') ||
    url.includes('/api/v1/auth/logout/') ||
    url.includes('/api/v1/user/token/') ||
    url.includes('/api/v1/user/token/access/') ||
    url.includes('/api/v1/user/logout/') ||
    url.includes('/api/auth/token')
  );
};

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const landingService = inject(LandingPageService);
  const user = localStorage.getItem('user');
  const token = landingService.accessToken();
  const token2 = user ? JSON.parse(user)?.access : null;

  const isPhase2Api = req.url.includes(resolveItttmApiUrl());
  const bearerToken = isPhase2Api ? token2 : token;

  req = req.clone({
    withCredentials: true,
    setHeaders: bearerToken
      ? {
        Authorization: `Bearer ${bearerToken}`,
      }
      : {},
  });

  return next(req);
};
export const loaderInterceptor: HttpInterceptorFn = (req, next) => {
  const isMutation = MUTATION_METHODS.has(req.method.toUpperCase());
  // GETs show the loader too, but ONLY for the Inventory module's own APIs (OBS/MO/WED) - every
  // other GET in the app keeps its previous behaviour (no full-screen block) unchanged. Inventory
  // was asking specifically for its own slow loads to stop looking like nothing is happening;
  // widening this to every GET app-wide is a bigger, separately-reviewed change and is not this
  // one. `SKIP_LOADER` still wins either way, exactly as it already does for a mutation - see
  // `postImportPreview`'s `loader: background`, which this reuses unchanged.
  const isVisibleInventoryLoad = isMutation || isInventoryApiUrl(req.url);
  if (!isVisibleInventoryLoad || req.context.get(SKIP_LOADER)) {
    return next(req);
  }
  const appService = inject(AppService);
  // The 3s floor is a mutation-only guarantee (a save/delete confirmation must never flash too
  // briefly to register) - an Inventory GET has no such requirement, so it is exempt and the
  // loader clears the instant the response actually lands. See `AppService.showLoader`.
  appService.showLoader(isMutation);
  return next(req).pipe(
    finalize(() => {
      appService.hideLoader();
    }),
  );
};

// Developed with Understanding: the sentence the swmm guest guard (CP-L, D28) sends as `message` with
// its 403. Matching the exact sentence as well as the status keeps every other 403 - an ordinary
// permission refusal for a normal user - on its existing path.
const GUEST_DENIAL_MESSAGE =
  'You are logged in from another unit. SWMM on this ship is available to you as a guest only.';
// Developed with Understanding: Guest Home (D30). Kept as a literal here, not imported from the guest
// guard, so the interceptor file gains no dependency on the router guards.
const GUEST_HOME_URL = '/afterAuth/guest';

// Developed with Understanding: true only for the swmm guest guard's 403.
const isGuestDenial = (error: unknown): boolean =>
  error instanceof HttpErrorResponse && error.status === 403 && getErrorMessage(error) === GUEST_DENIAL_MESSAGE;

// Developed with Understanding: routes a guest to Guest Home once, however many calls were refused
// together. Nothing happens while a navigation is already running (the guest guard decides that one)
// or when Guest Home is already open, so parallel 403s cannot start a navigation loop.
const redirectGuestHome = (router: Router): void => {
  if (router.currentNavigation() || router.url.split(/[?#]/)[0] === GUEST_HOME_URL) {
    return;
  }
  router.navigateByUrl(GUEST_HOME_URL);
};

export const feedbackInterceptor: HttpInterceptorFn = (req, next) => {
  const isMutation = MUTATION_METHODS.has(req.method.toUpperCase());
  // Developed with Understanding: injected before the early return, because the guest redirect
  // applies to every method, a GET included.
  const router = inject(Router);
  if (!isMutation || req.context.get(SKIP_TOAST) || isAuthUrl(req.url)) {
    // Developed with Understanding: these requests still raise no toast. Only the guest 403 is acted
    // on, and every error is re-thrown unchanged to the caller as before.
    return next(req).pipe(
      catchError((error: unknown) => {
        if (isGuestDenial(error)) {
          redirectGuestHome(router);
        }
        return throwError(() => error);
      }),
    );
  }
  const notify = inject(NotificationService);
  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse) {
        notify.success(getSuccessMessage(event.body) ?? 'Operation completed successfully.');
      }
    }),
    catchError((error: HttpErrorResponse) => {
      // Developed with Understanding: a guest 403 routes to Guest Home with no error toast, so a page
      // full of refused calls cannot raise a toast storm.
      if (isGuestDenial(error)) {
        redirectGuestHome(router);
        return throwError(() => error);
      }
      notify.error(getErrorMessage(error));
      return throwError(() => error);
    }),
  );
};

export const refreshTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);
  const landingService = inject(LandingPageService);

  if (shouldSkipRefresh(req.url)) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401) {
        return throwError(() => error);
      }

      return from(injector.get(Auth).refreshAccessToken()).pipe(
        switchMap((success) => {
          if (!success) {
            return throwError(() => error);
          }

          const newRequest = req.clone({
            withCredentials: true,
            setHeaders: {
              Authorization: `Bearer ${landingService.accessToken()}`,
            },
          });

          return next(newRequest);
        }),
      );
    }),
  );
};
