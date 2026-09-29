import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Auth } from '../services/auth.service';
import { NavigationService } from '../../navigation/navigation.service';
import { AccessControlService } from '../../navigation/access-control.service';

export const authGuard: CanActivateFn = async (route?: ActivatedRouteSnapshot, state?: RouterStateSnapshot) => {
  const router = inject(Router);
  const authService = inject(Auth);

  const isAuthenticated = authService.hasAccessToken() || (await authService.initializeSession());
  if (!isAuthenticated) {
    const returnUrl = state?.url;
    return router.createUrlTree(['/landing'], returnUrl ? { queryParams: { returnUrl } } : undefined);
  }

  const navService = inject(NavigationService);
  const accessControl = inject(AccessControlService);

  if (!accessControl.navVisibilityData()) {
    await accessControl.loadNavVisibility();
  }

  const activeModule = state ? navService.getCurrentModule(state.url) : undefined;
  if (activeModule && !accessControl.canAccess(activeModule)) {
    console.warn(`Access denied to module: ${activeModule.id}`);
    if (activeModule.id !== 'home' && accessControl.canAccess({ id: 'home' })) {
      return router.createUrlTree(['/afterAuth/home']);
    }
    return router.createUrlTree(['/landing']);
  }

  return true;
};

export const guestGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const authService = inject(Auth);

  if (authService.hasAccessToken() || (await authService.initializeSession())) {
    return router.createUrlTree(['/afterAuth/home']);
  }

  return true;
};

/** Route-level role gate, layered on top of `authGuard` (which already confirmed the session
 * and module access) — restricts one route to a named set of roles, case-insensitively. Hiding
 * the menu entry for a role-gated page is not enough on its own since the URL is still typeable;
 * this is what actually blocks it. The real gate stays server-side (each endpoint's own
 * permission class) — this only avoids rendering a page that would fail request by request.
 *
 * Roles are compared upper-cased, matching `AccessControlService.currentRoleName()`, and a
 * super-user passes — the same bypass every other gate in `access-control.service.ts` carries. */
export const roleGuard = (...allowedRoles: string[]): CanActivateFn => {
  const allowed = new Set(allowedRoles.map((role) => role.toUpperCase()));

  return () => {
    const router = inject(Router);
    const accessControl = inject(AccessControlService);

    if (accessControl.isSuperUser() || allowed.has(accessControl.currentRoleName())) {
      return true;
    }

    return router.createUrlTree(['/afterAuth/home']);
  };
};

