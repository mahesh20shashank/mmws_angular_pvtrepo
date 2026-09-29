import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TeamMember, UnitStatusResponse, UserCapabilities, UserProfile, UserTicket } from './user.model';
import { LandingPageService } from '../../../Modules/landing/services/landing-page.service';
import { CommonApiService } from '../../http/services/api.service';
import { UserManagementApiResponse } from '../../../Modules/administration/user-list/user-list.component';
import { skipFeedback } from '../../http/services/http-feedback';

const ERROR_MSG = 'Something went wrong';
// Developed with Understanding: the swmm unit-status endpoint (CP-L, D29). It is in swmm's
// GUEST_ALLOWED_URL_NAMES, so an other-ship login can read it. AppService sends it to swmm because
// the path does not start with api/v1/auth/.
const UNIT_STATUS_URL = 'api/v1/accounts/me/unit-status/';

@Injectable({
  providedIn: 'root',
})
export class User {
  private readonly commonApiService = inject(CommonApiService);
  private readonly landingService = inject(LandingPageService);

  readonly userDetails = signal<UserProfile | null>(null);
  readonly userTickets = signal<UserTicket[] | null>(null);
  readonly teamMembers = signal<TeamMember[] | null>(null);
  /** The ship confirmed via Ship Configuration's Step 0 (Modules/.../sfd-references), once set
   *  for this install — takes priority over profile.ship_name wherever a ship name is shown
   *  (see Sidebar.getShipName). Populated by SfdReferencesComponent, both on confirming a new
   *  selection and on rehydrating an existing one. `null` until that screen has been visited
   *  this session or no ship has been confirmed yet — callers should fall back accordingly. */
  readonly activeShipName = signal<string | null>(null);

  setActiveShipName(name: string | null): void {
    this.activeShipName.set(name);
  }

  private teamMembersLoaded = false;
  private userDetailsLoaded = false;
  private userTicketsLoaded = false;

  // Developed with Understanding: this login's unit status, read once per login from
  // GET api/v1/accounts/me/unit-status/ (D30). null until it has been read, and null again when the
  // read failed.
  readonly unitStatus = signal<UnitStatusResponse | null>(null);
  // Developed with Understanding: true only when the read succeeded and said other unit. A failed
  // read therefore counts as own ship, so a network blip never locks crew out - the swmm guest
  // guard (CP-L) still refuses a real guest on every endpoint outside its allow-list.
  readonly isOtherUnit = computed(() => this.unitStatus()?.is_other_unit === true);
  // Developed with Understanding: true when the last read failed. Guest Home shows its error state
  // and a Try again button from it.
  readonly unitStatusFailed = signal(false);
  // Developed with Understanding: the login the held status belongs to, and the read in progress,
  // so concurrent guard runs share one GET and a new login reads again.
  private unitStatusSession: string | null = null;
  private unitStatusInFlight: Promise<UnitStatusResponse | null> | null = null;

  // Developed with Understanding: returns this login's unit status, reading it at most once per
  // login. A login is keyed by the refresh token, which a new login replaces and an app start
  // restores from localStorage, with the username as the fallback. force reads again (Try again).
  async loadUnitStatus(force = false): Promise<UnitStatusResponse | null> {
    const session = this.landingService.refreshToken() || (this.userDetails()?.username ?? '');
    if (!force && this.unitStatusSession === session) {
      return this.unitStatus();
    }
    if (this.unitStatusInFlight) {
      return this.unitStatusInFlight;
    }

    this.unitStatusInFlight = this.fetchUnitStatus(session);
    try {
      return await this.unitStatusInFlight;
    } finally {
      this.unitStatusInFlight = null;
    }
  }

  // Developed with Understanding: one GET of unit-status. Silent - no loader and no toast. A failure
  // is logged once and recorded against this login, so it is not retried on every navigation.
  private async fetchUnitStatus(session: string): Promise<UnitStatusResponse | null> {
    try {
      const status = await firstValueFrom(
        this.commonApiService.api.get<UnitStatusResponse>(UNIT_STATUS_URL, {
          context: skipFeedback({ loader: true, toast: true }),
        }),
      );
      this.unitStatus.set(status);
      this.unitStatusFailed.set(false);
      return status;
    } catch (error) {
      console.warn('Unit status could not be read - this login is treated as own ship', error);
      this.unitStatus.set(null);
      this.unitStatusFailed.set(true);
      return null;
    } finally {
      this.unitStatusSession = session;
    }
  }

  async getLoggedInUserDetails(): Promise<UserProfile> {
    if (this.userDetailsLoaded && this.userDetails()) {
      return this.userDetails()!;
    }

    try {
      const user = await firstValueFrom(this.landingService.getLoggedInuserDetails());
      this.userDetails.set(user);
      this.landingService.user.set(user);
      this.userDetailsLoaded = true;
      return user;
    } catch (error) {
      console.error(error, ERROR_MSG);
      throw error;
    }
  }

  async getUserTickets(): Promise<void> {
    if (this.userTicketsLoaded && this.userTickets()) {
      return;
    }

    try {
      const res = await firstValueFrom(this.commonApiService.getTickets());
      const tickets = Array.isArray(res) ? res : ((res as any)?.tickets || []);
      this.userTickets.set(tickets);
      this.userTicketsLoaded = true;
    } catch (error) {
      console.error(error, ERROR_MSG);
    }
  }

  async getTeamMembers(): Promise<void> {
    if (this.teamMembersLoaded && this.teamMembers()) {
      return;
    }

    try {
      const res = await firstValueFrom(this.commonApiService.getTeamMembers());
      const users: UserProfile[] = res as UserProfile[]
      const teamMembers = users
        .filter((user: UserProfile) => user.is_active)
        .map((user: UserProfile) => ({
          id: user.id,
          name: this.extractUserName(user),
          rank: this.extractUserRank(user),
        }));
      this.teamMembers.set(teamMembers);
      this.teamMembersLoaded = true;
    } catch (error) {
      console.error(error, ERROR_MSG);
    }
  }

  /** Re-authenticates the CURRENT user's own password without disturbing the active session —
   * used where a screen needs to confirm "you are who you say you are" mid-flow (e.g. the OBS
   * import's Import Authority password gate) rather than actually logging in. Reuses the same
   * token endpoint `Auth.logincall()` uses, but the returned tokens are simply discarded: a
   * successful response means the password matched this account, which is all the caller needs.
   * A 400/401 is read as "wrong password" (`false`); anything else (network, 5xx) is rethrown so
   * the caller can tell a wrong password apart from a failure to even ask the question. */
  async verifyLoginPassword(password: string): Promise<boolean> {
    const username =
      this.userDetails()?.username ||
      (this.landingService.user()?.['username'] as string | undefined);
    if (!username) return false;

    try {
      await firstValueFrom(
        this.commonApiService.api.post(
          'api/v1/auth/token/',
          { username, password },
          { context: skipFeedback({ loader: true, toast: true }) },
        ),
      );
      return true;
    } catch (error) {
      if (error instanceof HttpErrorResponse && (error.status === 400 || error.status === 401)) {
        return false;
      }
      throw error;
    }
  }

  private extractUserName(user: UserProfile): string {
    if (user?.profile?.firstname && user?.profile?.lastname) {
      return `${user.profile.firstname} ${user.profile.lastname}`.trim();
    }
    return user?.username || 'Unknown';
  }

  private extractUserRank(user: UserProfile): string | undefined {
    return user?.profile?.rank_detail?.name;
  }

  readonly pendingRoleRequestsCount = signal<number>(0);

  async loadPendingRoleRequestsCount(): Promise<number> {
    try {
      if (!this.userDetails() && !this.landingService.user()) {
        await this.getLoggedInUserDetails();
      }
    } catch {
      // Continue even if getLoggedInUserDetails errors
    }

    const user = (this.userDetails() || this.landingService.user()) as Record<string, any> | null;
    const profile = user?.['profile'] as Record<string, UserProfile> | undefined;
    const roleMasterDetail = profile?.['role_master_detail'] as Record<string, any> | undefined;
    const roleName = String(user?.['role'] || roleMasterDetail?.['role_name'] || '').toUpperCase();
    const capabilities = user?.['capabilities'] as Record<string, UserCapabilities> | undefined;

    const isAdmin = Boolean(
      user?.['is_admin'] ||
      user?.['is_staff'] ||
      user?.['is_superuser'] ||
      capabilities?.['is_privileged'] ||
      roleName === 'SHIPADMIN' ||
      roleName === 'ADMIN' ||
      roleName === 'SUPER ADMINISTRATOR' ||
      roleName === 'ADMINISTRATOR' ||
      roleName === 'CO' ||
      roleName === 'COMMAND' ||
      roleName === 'HEAD OF DEPARTMENT' ||
      roleName === 'DY HOD'
    );

    // If capabilities has pending_role_requests, seed it immediately
    if (typeof capabilities?.['pending_role_requests'] === 'number') {
      this.pendingRoleRequestsCount.set(capabilities['pending_role_requests']);
    }

    if (!isAdmin) {
      this.pendingRoleRequestsCount.set(0);
      return 0;
    }

    try {
      const res = await firstValueFrom(
        this.commonApiService.api.get<UserManagementApiResponse>('api/v1/auth/users/')
      );
      const count = (res && !Array.isArray(res))
        ? (res.pending_requests?.length || 0)
        : 0;
      this.pendingRoleRequestsCount.set(count);
      return count;
    } catch (error) {
      console.warn('Failed to load pending role requests count', error);
      return this.pendingRoleRequestsCount();
    }
  }
}
