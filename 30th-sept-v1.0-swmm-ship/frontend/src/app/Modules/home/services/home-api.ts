import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { resolveCmmsApiUrl } from "../../../../environments/api-url";
import {
  PersonnelEventsResponse,
  RoleRequestApi,
  RoleRequestPayload,
  RoleRequestResponse,
  UserByIdResponse,
} from "../home/home.model";
import {
  AvailableUsersResponse,
  HierarchyTreeResponse,
} from "../divisional-organisation/divisional-organisation.model";
import {
  CreateRegulatorPayload,
  RankOption,
  RegulatorSailorsResponse,
  RegulatorsTreeResponse,
  UpdateRegulatorProfilePayload,
} from "../know-your-regulators/know-your-regulators.model";
import {
  CoMessageApi,
  LoginPageImageApi,
  MemberDetailApi,
  MemberDetailPayload,
  QuoteApi,
  ShipRoleApi,
} from "../department-master/department-master.model";

@Injectable({
  providedIn: "root",
})
export class HomeApi {
  private readonly http = inject(HttpClient);
  baseUrl = resolveCmmsApiUrl();

  // gallery

  createGalleryImage(payload: FormData) {
    return this.http.post(this.baseUrl + "api/v1/accounts/gallery/", payload);
  }

  deleteGalleryImage(id: number) {
    return this.http.delete(`${this.baseUrl}api/v1/accounts/gallery/${id}/`);
  }

  // login page images

  getLoginPageImages() {
    return this.http.get<LoginPageImageApi[]>(this.baseUrl + "api/v1/accounts/login-images/");
  }

  createLoginPageImage(payload: FormData) {
    return this.http.post<LoginPageImageApi>(this.baseUrl + "api/v1/accounts/login-images/", payload);
  }

  updateLoginPageImage(id: number, payload: FormData) {
    return this.http.patch<LoginPageImageApi>(`${this.baseUrl}api/v1/accounts/login-images/${id}/`, payload);
  }

  deleteLoginPageImage(id: number) {
    return this.http.delete(`${this.baseUrl}api/v1/accounts/login-images/${id}/`);
  }

  // member details

  getMemberDetails() {
    return this.http.get<MemberDetailApi[]>(this.baseUrl + "api/v1/master/member-details/");
  }

  getMemberDetailById(id: number) {
    return this.http.get<MemberDetailApi>(`${this.baseUrl}api/v1/master/member-details/${id}/`);
  }

  createMemberDetail(payload: FormData | MemberDetailPayload) {
    return this.http.post<MemberDetailApi>(this.baseUrl + "api/v1/master/member-details/", payload);
  }

  updateMemberDetail(id: number, payload: FormData | Partial<MemberDetailPayload>) {
    return this.http.patch<MemberDetailApi>(`${this.baseUrl}api/v1/master/member-details/${id}/`, payload);
  }

  deleteMemberDetail(id: number) {
    return this.http.delete(`${this.baseUrl}api/v1/master/member-details/${id}/`);
  }

  // quotes

  getQuotes() {
    return this.http.get<QuoteApi[]>(this.baseUrl + "api/v1/master/quotes/");
  }

  createQuote(payload: { quoteText: string }) {
    return this.http.post<QuoteApi>(this.baseUrl + "api/v1/master/quotes/", payload);
  }

  updateQuote(id: number, payload: { quoteText: string }) {
    return this.http.patch<QuoteApi>(`${this.baseUrl}api/v1/master/quotes/${id}/`, payload);
  }

  deleteQuote(id: number) {
    return this.http.delete(`${this.baseUrl}api/v1/master/quotes/${id}/`);
  }

  activateQuote(id: number) {
    return this.http.post(`${this.baseUrl}api/v1/master/quotes/${id}/activate/`, {});
  }

  // request role

  getRequestRoleHistory() {
    return this.http.get<RoleRequestResponse>(this.baseUrl + "api/v1/user/request-role/");
  }

  submitRequestRole(payload: RoleRequestPayload) {
    return this.http.post<RoleRequestApi>(this.baseUrl + "api/v1/user/request-role/", payload);
  }

  // ship roles

  createShipRole(payload: FormData) {
    return this.http.post<ShipRoleApi>(this.baseUrl + "api/v1/master/ship-roles/", payload);
  }

  updateShipRole(id: number, payload: FormData) {
    return this.http.patch<ShipRoleApi>(`${this.baseUrl}api/v1/master/ship-roles/${id}/`, payload);
  }

  deleteShipRole(id: number) {
    return this.http.delete(`${this.baseUrl}api/v1/master/ship-roles/${id}/`);
  }

  // co-messages

  createCoMessage(payload: { message: string; valid_till_date: string }) {
    return this.http.post<CoMessageApi>(this.baseUrl + "api/v1/master/co-messages/", payload);
  }

  updateCoMessage(id: number, payload: { message: string; valid_till_date: string }) {
    return this.http.patch<CoMessageApi>(`${this.baseUrl}api/v1/master/co-messages/${id}/`, payload);
  }

  deleteCoMessage(id: number) {
    return this.http.delete(`${this.baseUrl}api/v1/master/co-messages/${id}/`);
  }

  // events

  deleteEvent(id: number) {
    return this.http.delete(`${this.baseUrl}api/v1/events/${id}/`);
  }

  // hierarchy / divisional organisation

  getHierarchyTree() {
    return this.http.get<HierarchyTreeResponse>(
      this.baseUrl + "api/v1/master/hierarchy/nested/",
    );
  }

  getAvailableHierarchyUsers(excludeNodeId?: number) {
    const query = excludeNodeId ? `?exclude_node_id=${excludeNodeId}` : "";
    return this.http.get<AvailableUsersResponse>(
      `${this.baseUrl}api/v1/master/hierarchy/available_users/${query}`,
    );
  }

  createHierarchyNode(payload: FormData) {
    return this.http.post(this.baseUrl + "api/v1/master/hierarchy/", payload);
  }

  saveShipHierarchy(payload: FormData | Record<string, unknown>) {
    return this.http.post(
      this.baseUrl + "api/v1/master/hierarchy/save-ship-hierarchy/",
      payload,
    );
  }

  updateHierarchyNode(id: number, payload: FormData) {
    return this.http.patch(
      `${this.baseUrl}api/v1/master/hierarchy/${id}/`,
      payload,
    );
  }

  deleteHierarchyNode(id: number) {
    return this.http.delete(`${this.baseUrl}api/v1/master/hierarchy/${id}/`);
  }

  toggleSailorRegulator(id: number, isRegulator: boolean) {
    return this.http.post(
      `${this.baseUrl}api/v1/master/hierarchy/toggle_sailor_regulator/`,
      { id, is_reg: isRegulator },
    );
  }

  // regulators

  getRegulatorsTree() {
    return this.http.get<RegulatorsTreeResponse>(
      this.baseUrl + "api/v1/master/hierarchy/regulators_tree/",
    );
  }

  getRegulatorSailors(regulatorId: number) {
    return this.http.get<RegulatorSailorsResponse>(
      `${this.baseUrl}api/v1/master/hierarchy/regulator_sailors/?regulator_id=${regulatorId}`,
    );
  }

  assignRegulatorBulk(regulatorId: number, sailorIds: number[]) {
    return this.http.post(
      `${this.baseUrl}api/v1/master/hierarchy/assign_regulator_bulk/`,
      { regulator_id: regulatorId, sailor_ids: sailorIds },
    );
  }

  addSailorsBulk(payload: { division_id: number; user_ids: number[] }) {
    return this.http.post(
      `${this.baseUrl}api/v1/master/hierarchy/add_sailors_bulk/`,
      payload,
    );
  }

  createRegulator(payload: CreateRegulatorPayload) {
    return this.http.post(
      `${this.baseUrl}api/v1/master/create-regulator/`,
      payload,
    );
  }

  updateRegulatorPhoto(payload: FormData) {
    return this.http.post(
      `${this.baseUrl}api/v1/master/update-regulator-photo/`,
      payload,
    );
  }

  updateRegulatorProfile(payload: UpdateRegulatorProfilePayload) {
    return this.http.post(
      `${this.baseUrl}api/v1/master/update-regulator-profile/`,
      payload,
    );
  }

  getRanks() {
    return this.http.get<RankOption[]>(`${this.baseUrl}api/v1/accounts/ranks/`);
  }

  // users / anniversary

  getUserById(id: number) {
    return this.http.get<UserByIdResponse>(`${this.baseUrl}api/v1/accounts/users/${id}/`);
  }

  getAllUsers() {
    return this.http.get<UserByIdResponse[]>(`${this.baseUrl}api/v1/accounts/all_users/`);
  }

  updateMarriageDate(id: number, marriageDate: string) {
    return this.http.patch(
      `${this.baseUrl}api/v1/accounts/profiles/${id}/marriage/`,
      { marriage_date: marriageDate },
    );
  }

  // personnel events

  getPersonnelEvents() {
    return this.http.get<PersonnelEventsResponse>(
      `${this.baseUrl}api/v1/accounts/personnel-events/`,
    );
  }
}
