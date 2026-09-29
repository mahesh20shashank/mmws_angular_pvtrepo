import { inject, Injectable, signal } from "@angular/core";
import { UserProfile } from "../../../Core/services/user/user.model";
import { resolveCmmsApiUrl, resolveAuthApiUrl } from "../../../../environments/api-url";
import { HttpClient } from "@angular/common/http";
import { catchError, forkJoin, of } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class LandingPageService {
  readonly baseUrl = resolveCmmsApiUrl();
  private readonly http = inject(HttpClient);

  readonly user = signal<Record<string, unknown> | null>(null);
  readonly accessToken = signal<string>('');
  readonly refreshToken = signal<string>(this.getStoredRefreshToken());

  private getStoredRefreshToken(): string {
    return localStorage.getItem('refresh_token') || '';
  }

  getLoggedInuserDetails() {
    const authUrl = resolveAuthApiUrl() || this.baseUrl;
    return this.http.get<UserProfile>(authUrl + "api/v1/auth/me/");
  }

  getGalleryData() {
    return this.http.get(this.baseUrl + "api/v1/accounts/gallery/");
  }

  getCoMessages() {
    return this.http.get(this.baseUrl + "api/v1/master/co-messages/");
  }

  getHierarchy() {
    return this.http.get(this.baseUrl + "api/v1/master/hierarchy/");
  }

  getEvents() {
    return this.http.get(this.baseUrl + "api/v1/events/");
  }

  getBirthdays() {
    return this.http.get(this.baseUrl + "api/v1/accounts/personnel-events/");
  }

  getKnowYourShip() {
    return this.http.get(this.baseUrl + "api/v1/master/ships/know-your-ship/");
  }

  getDailyOrders() {
    return this.http.get(
      this.baseUrl + "api/v1/master/order-duties/daily-orders/",
    );
  }

  getShipRoles() {
    return this.http.get(this.baseUrl + "api/v1/master/ship-roles/");
  }

  getLandingPageData() {
    return forkJoin({
      gallery: this.getGalleryData().pipe(catchError(() => of([]))),
      coMessages: this.getCoMessages().pipe(catchError(() => of([]))),
      hierarchy: this.getHierarchy().pipe(catchError(() => of([]))),
      events: this.getEvents().pipe(catchError(() => of([]))),
      birthdays: this.getBirthdays().pipe(catchError(() => of([]))),
      knowYourShip: this.getKnowYourShip().pipe(catchError(() => of({}))),
      dailyOrders: this.getDailyOrders().pipe(catchError(() => of([]))),
      shipRoles: this.getShipRoles().pipe(catchError(() => of([]))),
    });
  }
}
