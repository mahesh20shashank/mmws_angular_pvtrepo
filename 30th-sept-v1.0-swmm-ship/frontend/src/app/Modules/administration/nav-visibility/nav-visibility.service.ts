import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { resolveCmmsApiUrl, resolveAuthApiUrl } from '../../../../environments/api-url';

export interface NavRole {
  id: number;
  role_name: string;
  code?: string;
}

export interface ApiNavItem {
  key: string;
  label: string;
  order: number;
  category?: string;
  visibility: Record<string, boolean>;
  locked_for?: (string | number)[];
}

export interface NavItem {
  id?: string;
  key: string;
  label: string;
  category: string;
  order: number;
  locked_for?: (string | number)[];
}

export interface NavVisibilityResponse {
  roles: NavRole[];
  nav_items: ApiNavItem[];
}

export interface SaveCellPayload {
  role: number;
  nav_item: string;
  is_visible: boolean;
}

export interface SaveNavVisibilityPayload {
  cells: SaveCellPayload[];
}

export interface SaveNavVisibilityResponse {
  status?: string;
  message?: string;
  cells?: string | SaveCellPayload[];
  [key: string]: unknown;
}

@Injectable({
  providedIn: 'root'
})
export class NavVisibilityService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(resolveAuthApiUrl() || resolveCmmsApiUrl()).replace(/\/$/, '')}/api/v1/authz/nav-visibility/`;

  /**
   * Fetches roles and navigation item visibility matrix.
   */
  getNavVisibility(): Observable<NavVisibilityResponse> {
    return this.http.get<NavVisibilityResponse>(this.baseUrl);
  }

  /**
   * Updates navigation item visibility settings for roles.
   */
  saveNavVisibility(payload: SaveNavVisibilityPayload): Observable<SaveNavVisibilityResponse> {
    return this.http.post<SaveNavVisibilityResponse>(this.baseUrl, payload);
  }
}
