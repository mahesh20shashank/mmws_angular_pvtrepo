import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { Auth } from '../auth/services/auth.service';
import { User } from '../services/user/user';

// Developed with Understanding: Guest Home, the one afterAuth route an other-unit login may open (D30).
export const GUEST_HOME_ROUTE = '/afterAuth/guest';

// Developed with Understanding: sends an other-unit login (a guest, D28 and D30) to Guest Home from
// every other afterAuth route. It is registered as canActivateChild on the afterAuth parent, so it
// runs on every navigation inside afterAuth and only after authGuard (that route's canActivate) has
// settled the session. An own-ship login, a login with no session and a failed unit-status read all
// pass unchanged - the swmm guest guard (CP-L) still refuses a real guest on the server.
// Every inject() runs before the first await, while the injection context is still open.
export const guestUnitGuard: CanActivateFn = async (_route?: ActivatedRouteSnapshot, state?: RouterStateSnapshot) => {
  const router = inject(Router);
  const authService = inject(Auth);
  const userStore = inject(User);

  if (!authService.hasAccessToken()) {
    return true;
  }

  const status = await userStore.loadUnitStatus();
  if (!status?.is_other_unit) {
    return true;
  }

  // Developed with Understanding: compared without any query string or fragment.
  const path = (state?.url ?? '').split(/[?#]/)[0];
  if (path === GUEST_HOME_ROUTE) {
    return true;
  }

  return router.createUrlTree([GUEST_HOME_ROUTE]);
};
