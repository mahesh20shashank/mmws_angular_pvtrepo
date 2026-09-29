import { inject, Injectable } from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { Router } from "@angular/router";
import { User } from "../../services/user/user";
import { MasterDataService } from "../../services/master-data/master-data.service";
import { NotificationStore } from "../../services/notification/notification-store";
import { LandingPageService } from "../../../Modules/landing/services/landing-page.service";
import { AppService } from "../../services/app/app.service";
import { skipFeedback } from "../../http/services/http-feedback";
import { Call } from "../../http/services/call";
import { UserProfile } from "../../services/user/user.model";
import { resolveCmmsApiUrl, resolveAuthApiUrl } from "../../../../environments/api-url";

interface LoginResponse {
  access: string;
  refresh: string;
  user: {
    id: number;
    username: string;
    is_active: boolean;
    is_admin: boolean;
    profile: Record<string, unknown>;
    capabilities: string[];
  };
}

export type LoginResult =
  | { success: true }
  | { success: false; message: string };

@Injectable({
  providedIn: "root",
})
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly landingService = inject(LandingPageService);
  private readonly router = inject(Router);
  private readonly userService = inject(User);
  private readonly notifications = inject(NotificationStore);
  readonly api = inject(AppService);
  readonly call = inject(Call)

  private refreshInFlight: Promise<boolean> | null = null;
  readonly masterData = inject(MasterDataService);

  private readonly authBaseUrl = `${(resolveAuthApiUrl() || resolveCmmsApiUrl()).replace(/\/$/, '')}/api/v1/auth/`;

  constructor() {
    // Cross-tab sync: `localStorage` writes in one tab don't touch another tab's in-memory
    // `accessToken`/`refreshToken` signals on their own. Without this, a background tab keeps
    // retrying with whatever token it started with, and once that's stale, its own refresh
    // attempt fails and calls `logout()` — which clears `localStorage` for every tab, not just
    // the stale one. This keeps every open tab's signals in step with whichever tab last wrote.
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (event) => this.onStorageChange(event));
    }
  }

  private onStorageChange(event: StorageEvent): void {
    if (!["access_token", "refresh_token", "user_data"].includes(event.key ?? "")) return;

    // Another tab logged out (or its session was cleared) — mirror that here too, instead of
    // this tab silently carrying on with now-invalid tokens until its next request 401s.
    if (event.key === "access_token" && !event.newValue) {
      this.clearClientSession();
      this.router.navigate(["landing"]);
      return;
    }

    const storedAccess = localStorage.getItem("access_token");
    const storedRefresh = localStorage.getItem("refresh_token");
    const storedUser = localStorage.getItem("user_data");
    if (storedAccess) this.landingService.accessToken.set(storedAccess);
    if (storedRefresh) this.landingService.refreshToken.set(storedRefresh);
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        this.landingService.user.set(parsedUser);
        this.userService.userDetails.set(parsedUser);
      } catch {
        // Malformed value written mid-update by the other tab — next storage event will settle it.
      }
    }
  }

  logincall(cred: { username: string; password: string }) {
    return this.http.post<LoginResponse>(`${this.authBaseUrl}token/`, cred, {
      context: skipFeedback({ loader: true, toast: true }),
    });
  }

  secondaryLoginForITTTM(cred: { username: string; password: string }) {
    this.call.logincall({ loginname: cred.username, password: cred.password })
  }

  refreshAccessTokenApi() {
    this.call.refreshAccessToken()
    const refreshToken = this.landingService.refreshToken();
    return this.http.post<{ access: string; refresh?: string }>(
      `${this.authBaseUrl}token/access/`,
      { refresh: refreshToken },
      {
        context: skipFeedback({ loader: true, toast: true }),
      },
    );
  }


  logoutcall() {

    const refreshToken = this.landingService.refreshToken();
    return this.http.post(
      `${this.authBaseUrl}logout/`,
      { refresh: refreshToken },
      {
        context: skipFeedback({ loader: true, toast: true }),
      },
    );
  }

  async loginUser(cred: {
    username: string;
    password: string;
  }): Promise<LoginResult> {

    try {
      const res = await firstValueFrom(this.logincall(cred));
      if (typeof window !== "undefined") {
        localStorage.setItem("access_token", res.access);
      }
      this.landingService.accessToken.set(res.access);
      this.landingService.refreshToken.set(res.refresh);
      this.landingService.user.set(res.user);
      this.userService.userDetails.set(res.user as UserProfile);

      localStorage.setItem('access_token', res.access);
      localStorage.setItem('refresh_token', res.refresh);
      localStorage.setItem('user_data', JSON.stringify(res.user));
      try {
        await this.masterData.load();
      } catch (error) {
        console.warn("Failed to load master data, but user is logged in", error);
      }
      return { success: true };
    } catch (error) {
      console.error("❌ Login failed", error);
      return {
        success: false,
        message: this.extractErrorMessage(error),
      };
    }
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as
        | { message?: string; detail?: string }
        | string
        | null;

      if (typeof body === "string" && body.trim()) {
        return body;
      }
      if (body && typeof body === "object") {
        if (body.message) return body.message;
        if (body.detail) return body.detail;
      }
      switch (error.status) {
        case 0:
          return 'Unable to reach the server. Please check your connection and try again.';

        case 400:
        case 401:
          return 'Invalid username or password.';

        default:
          return error.message || 'Login failed. Please try again.';
      }

    }
    return "Something went wrong. Please try again.";
  }

  async getuserDetails() {
    const user = await firstValueFrom(
      this.landingService.getLoggedInuserDetails(),
    );
    this.landingService.user.set(user);
    this.userService.userDetails.set(user);
  }

  hasAccessToken(): boolean {
    return !!this.landingService.accessToken();
  }

  isAuthenticated(): boolean {
    return this.hasAccessToken();
  }

  async initializeSession(): Promise<boolean> {
    // Check if user data is in localStorage
    const storedUser = localStorage.getItem('user_data');
    const storedAccessToken = localStorage.getItem('access_token');

    if (storedAccessToken && storedUser) {
      // Restore from localStorage
      const parsedUser = JSON.parse(storedUser);
      this.landingService.accessToken.set(storedAccessToken);
      this.landingService.user.set(parsedUser);
      this.userService.userDetails.set(parsedUser);
      try {
        await this.masterData.load();
      } catch (error) {
        console.warn("Failed to load master data, but session is restored", error);
      }
      return true;
    }

    // If no stored session, try to refresh
    const refreshed = await this.refreshAccessToken();
    if (refreshed) {
      try {
        await this.masterData.load();
      } catch (error) {
        console.warn("Failed to load master data, but session is restored", error);
      }
    }
    return refreshed;
  }

  async refreshAccessToken(): Promise<boolean> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.performRefresh();

    try {
      return await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
    }
  }

  private async performRefresh(): Promise<boolean> {
    try {
      const res = await firstValueFrom(this.refreshAccessTokenApi());
      this.landingService.accessToken.set(res.access);
      if (typeof window !== "undefined") {
        // Persisted so a page reload or a second tab picks up the refreshed token instead of
        // restoring the pre-refresh one from `initializeSession()` and immediately 401ing.
        localStorage.setItem("access_token", res.access);
        // Defensive: only written if the backend actually rotates the refresh token (it may
        // not). If it does and this isn't captured, the OLD refresh token silently becomes the
        // one this tab keeps retrying with even after the backend has invalidated it.
        if (res.refresh) {
          localStorage.setItem("refresh_token", res.refresh);
          this.landingService.refreshToken.set(res.refresh);
        }
      }
      return true;
    } catch (error) {
      if (this.landingService.user()) {
        console.error("Token refresh failed, logging out...", error);
        this.logout();
      } else {
        this.clearClientSession();
      }
      return false;
    }
  }

  async logout() {
    try {
      await firstValueFrom(this.logoutcall());
    } catch (error) {
      console.error("Logout API failed, clearing session locally anyway", error);
    }
    const returnUrl = this.router.url;
    this.clearClientSession();
    if (returnUrl && returnUrl !== "/landing" && !returnUrl.startsWith("/landing?")) {
      this.router.navigate(["landing"], { queryParams: { returnUrl } });
    } else {
      this.router.navigate(["landing"]);
    }
  }

  private clearClientSession(): void {
    if (typeof window !== "undefined") {
      // localStorage.removeItem("access_token");
      // localStorage.removeItem("refresh_token");
      // localStorage.removeItem("user_data");
      // "Last Sync" (footer) reflects the CMMS sync's own completion time, not
      // anything tied to this login session — preserved across the blanket
      // clear so it doesn't vanish every time someone logs out and back in.
      const lastSync = localStorage.getItem("swmm_last_sync_completed_at");
      localStorage.clear();
      if (lastSync) {
        localStorage.setItem("swmm_last_sync_completed_at", lastSync);
      }
    }
    this.landingService.accessToken.set("");
    this.landingService.refreshToken.set("");
    this.landingService.user.set(null);

    this.userService.userDetails.set(null);
    this.userService.userTickets.set(null);
  }
}
