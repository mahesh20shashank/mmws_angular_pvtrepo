import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { resolveCmmsApiUrl, resolveAuthApiUrl } from "../../../../environments/api-url";

@Injectable({
  providedIn: "root",
})
export class AdministrationApi {
  private readonly http = inject(HttpClient);
  baseUrl = resolveCmmsApiUrl();
  authBaseUrl = resolveAuthApiUrl() || resolveCmmsApiUrl();

  // masters

  getRanks<T>() {
    return this.http.get<T>(`${this.baseUrl}api/v1/accounts/ranks/`);
  }

  getDesignations<T>() {
    return this.http.get<T>(`${this.baseUrl}api/v1/accounts/designations/`);
  }

  getDepartments<T>() {
    return this.http.get<T>(`${this.baseUrl}api/v1/accounts/departments/`);
  }

  // roles

  getRoles<T>() {
    return this.http.get<T>(`${this.baseUrl}api/v1/accounts/roles/`);
  }

  createRole(payload: Record<string, unknown>) {
    return this.http.post(`${this.baseUrl}api/v1/accounts/roles/`, payload);
  }

  updateRole(roleId: number, payload: Record<string, unknown>) {
    return this.http.patch(`${this.baseUrl}api/v1/accounts/roles/${roleId}/`, payload);
  }

  deleteRole(roleId: number) {
    return this.http.delete(`${this.baseUrl}api/v1/accounts/roles/${roleId}/`);
  }

  getRoleMatrix<T>(roleId: number) {
    return this.http.get<T>(`${this.baseUrl}api/v1/accounts/roles/${roleId}/matrix/`);
  }

  saveRoleMatrix(roleId: number, permissions: unknown) {
    return this.http.post(`${this.baseUrl}api/v1/accounts/roles/${roleId}/matrix/`, permissions);
  }

  // users

  getAdminDashboard<T>() {
    return this.http.get<T>(`${this.baseUrl}api/v1/user/admin/dashboard/`);
  }

  getUsers<T>() {
    return this.http.get<T>(`${this.authBaseUrl}api/v1/auth/users/`);
  }

  updateUser(userId: number, payload: Record<string, unknown>) {
    return this.http.patch(`${this.authBaseUrl}api/v1/auth/users/${userId}/`, payload);
  }

  approveUserRegistration(userId: number, payload: Record<string, unknown>) {
    return this.http.post(`${this.authBaseUrl}api/v1/auth/users/${userId}/approve/`, payload);
  }

  disapproveUserRegistration(userId: number, payload: Record<string, unknown>) {
    return this.http.post(`${this.authBaseUrl}api/v1/auth/users/${userId}/disapprove/`, payload);
  }

  // role requests

  actOnRoleRequest(requestId: number, payload: Record<string, unknown>) {
    return this.http.post(`${this.authBaseUrl}api/v1/auth/role-request/${requestId}/act/`, payload);
  }

  // database reset (destructive)

  resetDatabase() {
    return this.http.post(`${this.baseUrl}api/v1/user/database-reset/`, { confirm: "RESET" });
  }
}
