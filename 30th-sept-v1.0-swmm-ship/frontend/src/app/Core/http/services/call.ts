import { HttpClient, HttpContext } from "@angular/common/http";
import { inject, Injectable, signal } from "@angular/core";
import { resolveCmmsApiUrl, resolveAuthApiUrl, resolveItttmApiUrl } from "../../../../environments/api-url";
import { InboxMessage } from "../../../Modules/inbox-dashboard/inbox-model/inbox-model";
import { Observable, Subject, of, catchError } from "rxjs";
import { skipFeedback } from "./http-feedback";
import { MaintenanceDashboardResponse } from "../../../Modules/operational-maintenance/op-maintenance-dashboard/maintenance-dashboard.model";
import {
  DartDashboardResponse,
  MaintenancePeriodRow,
  SubDeptDefectRow,
} from "../../../Modules/operational-maintenance/op-maintenance-dashboard/op-maintenance-dashboard.model";
import {
  OpmDashboardActivityPeriod,
  OpmDashboardPeriod,
  OpmDashboardResponse,
} from "../../../Modules/operational-maintenance/overview/opm-overview.model";
import { CmmsDartPushResult } from "../../../Modules/operational-maintenance/open-defects/open-defects.model";
import { SFDDashboardResponse } from "../../../Modules/ship-configuration/ship-configuration.model";
import { GalleryImage } from "../../../Modules/home/gallery/gallery.model";
import { CoMessageApi, DepartmentMaster, ShipRoleApi, UpcomingEventApi } from "../../../Modules/home/department-master/department-master.model";
import { SectionRhsiBarchartResponse } from "../../../Modules/operational-maintenance/routines-dashboard/ems-dashboard/ems-dashboard.model";
import {
  SaveDailyOrderPayload,
  UserByIdResponse,
} from "../../../Modules/home/home/home.model";

@Injectable({
  providedIn: "root",
})
export class Call {
  private readonly http = inject(HttpClient);
  public composeTrigger$ = new Subject<void>();
  public refreshData$ = new Subject<void>();
  public logincallFailed = signal<boolean>(false);
  public isTrialAvailable = signal<boolean>(this.checkInitialTrialAvailability());

  baseUrl = resolveCmmsApiUrl();

  apiUrl = resolveItttmApiUrl();

  private checkInitialTrialAvailability(): boolean {
    if (typeof window === 'undefined') return false;
    const userStr = localStorage.getItem("user");
    if (!userStr) return false;
    try {
      const userObj = JSON.parse(userStr);
      return !!(userObj && (userObj.access || userObj.token));
    } catch {
      return false;
    }
  }

  logincall(cred: { loginname: string; password: string }) {
    this.logincallFailed.set(false);

    return this.http
      .post(this.apiUrl + "api/auth/token", cred, {
        context: skipFeedback({ loader: true, toast: true }),
      })
      .pipe(
        catchError((err) => {
          console.warn("[Call] logincall API failed silently:", err);
          localStorage.removeItem("user");
          this.logincallFailed.set(true);
          this.isTrialAvailable.set(false);
          return of(null);
        }),
      )
      .subscribe((res: unknown) => {
        if (res) {
          localStorage.setItem("user", JSON.stringify(res));
          this.logincallFailed.set(false);
          this.isTrialAvailable.set(true);
        } else {
          localStorage.removeItem("user");
          this.logincallFailed.set(true);
          this.isTrialAvailable.set(false);
        }
      });
  }

  refreshAccessToken() {
    const user = localStorage.getItem('user');
    let refresh = '';
    if (user) {
      refresh = JSON.parse(user).refresh;
    }
    return this.http.post(this.apiUrl + "api/auth/token/refresh", { refresh });
  }

  logoutcall() {
    localStorage.clear();
    this.isTrialAvailable.set(false);
    return this.http.post(this.apiUrl + "api/auth/logout", {});
  }

  getCurrentUser() {
    const authUrl = resolveAuthApiUrl() || this.baseUrl;
    return this.http.get<{ profile?: { department?: number } }>(
      `${authUrl}api/v1/auth/me/`,
    );
  }

  getUsers() {
    const authUrl = resolveAuthApiUrl() || this.baseUrl;
    return this.http.get<UserByIdResponse[]>(`${authUrl}api/v1/auth/users/`);
  }

  approveUser(userId: number, payload: Record<string, unknown> = {}) {
    const authUrl = resolveAuthApiUrl() || this.baseUrl;
    return this.http.post(`${authUrl}api/v1/auth/users/${userId}/approve/`, payload);
  }

  disapproveUser(userId: number, payload: Record<string, unknown> = {}) {
    const authUrl = resolveAuthApiUrl() || this.baseUrl;
    return this.http.post(`${authUrl}api/v1/auth/users/${userId}/disapprove/`, payload);
  }

  // creaet sfe equipments for refrence of ship config
  createSfdEquipment(payload: Record<string, unknown>) {
    return this.http.post(`${this.baseUrl}api/v1/sfd/add-equipment/`, payload);
  }

  // tickets

  getTickets() {
    return this.http.get(
      this.baseUrl + "api/v1/ticket-management/tickets/my-tickets/",
    );
  }

  getLoggedInuserDetails() {
    return this.http.get(this.baseUrl + "api/v1/user/retrive/");
  }

  getGalleryData() {
    return this.http.get<GalleryImage[]>(this.baseUrl + "api/v1/accounts/gallery/");
  }

  getDepartments() {
    return this.http.get<DepartmentMaster[]>(
      this.baseUrl + "api/v1/accounts/departments/",
    );
  }

  getMasterDepartments() {
    return this.http.get<DepartmentMaster[]>(
      this.baseUrl + "api/v1/master/departments/",
    );
  }

  getAppInfo() {
    return this.http.get<AppInfo>(this.baseUrl + "api/v1/master/app-info/");
  }

  createDepartment(payload: Partial<DepartmentMaster>) {
    return this.http.post(this.baseUrl + "api/v1/accounts/departments/", payload);
  }

  updateDepartment(id: number, payload: Partial<DepartmentMaster>) {
    return this.http.patch(
      `${this.baseUrl}api/v1/accounts/departments/${id}/`,
      payload,
    );
  }

  deleteDepartment(id: number) {
    return this.http.delete(`${this.baseUrl}api/v1/accounts/departments/${id}/`);
  }

  getShipRoles() {
    return this.http.get<ShipRoleApi[]>(this.baseUrl + "api/v1/master/ship-roles/");
  }

  getCoMessages() {
    return this.http.get<CoMessageApi[]>(this.baseUrl + "api/v1/master/co-messages/");
  }

  getHierarchy() {
    return this.http.get(this.baseUrl + "api/v1/master/hierarchy/");
  }

  getEvents() {
    return this.http.get<UpcomingEventApi[]>(this.baseUrl + "api/v1/events/");
  }

  createEvent(payload: FormData | Record<string, unknown>) {
    return this.http.post<UpcomingEventApi>(this.baseUrl + "api/v1/events/", payload);
  }

  updateEvent(id: number, payload: FormData) {
    return this.http.patch<UpcomingEventApi>(`${this.baseUrl}api/v1/events/${id}/`, payload);
  }

  getBirthdays() {
    return this.http.get(this.baseUrl + "api/v1/accounts/ships/birthdays/");
  }

  getKnowYourShip() {
    return this.http.get(this.baseUrl + "api/v1/master/ships/know-your-ship/");
  }

  getDailyOrders() {
    return this.http.get(
      this.baseUrl + "api/v1/master/order-duties/daily-orders/",
    );
  }

  getDutyRosters() {
    return this.http.get(
      this.baseUrl + "api/v1/master/order-duties/duty-rosters/",
    );
  }

  getRoutines() {
    return this.http.get<{ routines: string[] }>(
      this.baseUrl + "api/v1/master/order-duties/routines/",
    );
  }

  saveDailyOrder(payload: SaveDailyOrderPayload | FormData, context?: HttpContext) {
    return this.http.post(
      this.baseUrl + "api/v1/master/order-duties/save-daily-order/",
      payload,
      { context }
    );
  }

  saveDailyOrders(payload: FormData, context?: HttpContext) {
    return this.http.post(
      this.baseUrl + "api/v1/master/order-duties/save-daily-orders/",
      payload,
      { context }
    );
  }

  getInboxMessages() {
    return this.get<InboxMessage[]>("api/v1/user/messages/inbox/");
  }
  getInboxUnreadCount(mailbox: "inbox" | "outbox") {
    return this.http.get<{ count: number }>(
      `${this.baseUrl}api/v1/user/messages/unread_count/`,
      {
        params: {
          mailbox,
        },
      },
    );
  }

  markMessagesRead(messageIds: number[]) {
    return this.post("api/v1/user/messages/mark_read/", {
      message_ids: messageIds,
    });
  }

  getOutboxMessages() {
    return this.get<InboxMessage[]>("api/v1/user/messages/outbox/");
  }

  sendMessage(payload: Record<string, unknown>) {
    return this.post("api/v1/user/messages/", payload);
  }

  getMaintenanceDashboard(): Observable<MaintenanceDashboardResponse> {
    return this.get<MaintenanceDashboardResponse>(
      "api/v1/dart/maintainance_overview_details/",
    );
  }

  /** Technical Dashboard (the legacy Home_new page's cards, DART trend chart,
   * Equipment Status, and Certificate expiry alerts) - users.views.TechnicalDashboardAPIView. */
  getTechnicalDashboard(): Observable<TechnicalDashboardResponse> {
    return this.get<TechnicalDashboardResponse>("api/v1/accounts/technical-dashboard/");
  }
  /** Pushes the given DARTs up to CMMS, skipping any the backend already has synced. */
  pushSelectedDartsToCmms(ids: number[]) {
    return this.post<CmmsDartPushResult>("api/v1/dart/push-selected-to-cmms/", { ids });
  }
  planRoutineMultiSave(payload: { selected_ids: string; planned_commencement_date?: string }) {
    return this.post<{
      status: string;
      message: string;
      planned_count: number;
      planned_ids: number[];
    }>('api/v1/ems/plan_routine_multi_save/', payload);
  }
  getSFDData(): Observable<SFDDashboardResponse> {
    return this.get<SFDDashboardResponse>("api/v1/sfd/dashboard/");
  }
  /** Maintop No. PDF (Unique Maintop Routines grid) — renders the equipment's MaintopHeader/
   * MaintopDetail into a PDF, keyed by the row's own equipment master pk. */
  getMaintopPdf(equipmentMasterId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}api/v1/ems/maintop-pdf/${equipmentMasterId}/`, {
      responseType: 'blob',
    });
  }
  getSectionRhsiBarchart(sectionId: number) {
    return this.get<SectionRhsiBarchartResponse>(`api/v1/ems/barchart/${sectionId}/`);
  }
  getMaintainanceOverviewKpiData() {
    return this.get("api/v1/dart/maintainance_overview/kpis/");
  }
  getSFDKpiData() {
    return this.get("api/v1/sfd/dashboard/kpis/");
  }
  private get<T>(url: string) {
    return this.http.get<T>(`${this.baseUrl}${url}`);
  }

  private post<T = unknown>(url: string, payload: unknown, context?: HttpContext) {
    return this.http.post<T>(`${this.baseUrl}${url}`, payload, context ? { context } : {});
  }

  private put<T = unknown>(url: string, payload: unknown, context?: HttpContext) {
    return this.http.put<T>(`${this.baseUrl}${url}`, payload, context ? { context } : {});
  }

  private delete<T = unknown>(url: string) {
    return this.http.delete<T>(`${this.baseUrl}${url}`);
  }

  // DART Spares

  getDartSpares(type: string) {
    return this.http.get(
      `${this.baseUrl}api/v1/dart/get_dart_spares_data/?type=${type}`,
    );
  }

  updateRhsiEquipment(id: number, payload: Record<string, unknown>) {
    return this.http.put(
      `${this.baseUrl}api/v1/sfd/rhsi-equipment/${id}/`,
      payload,
    );
  }

  // DART Dashboard (Op Maintenance)
  getDartDashboard(departmentId: number) {
    return this.get<DartDashboardResponse>(
      `api/v1/dart/dartdashboard/?department_id=${departmentId}`,
    );
  }
  // OPM Overview Dashboard
  getOpmOverviewDashboard(params: {
    period?: OpmDashboardPeriod;
    department?: string;
    activityPeriod?: OpmDashboardActivityPeriod;
  }) {
    const query = new URLSearchParams();
    if (params.period) query.set("period", params.period);
    if (params.department) query.set("department", params.department);
    if (params.activityPeriod) query.set("activity_period", params.activityPeriod);
    const qs = query.toString();
    const url = qs ? `api/v1/dart/dashboard/?${qs}` : "api/v1/dart/dashboard/";
    return this.get<OpmDashboardResponse>(url);
  }
  getSubDeptDefects(subDept: string) {
    return this.get<{ success: boolean; data: SubDeptDefectRow[] }>(
      `api/v1/dart/get_sub_dept_defects/?sub_dept=${encodeURIComponent(subDept)}`,
    );
  }
  getMaintenancePeriodsList(filters?: {
    period?: string;
    occasion?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    periodSearch?: string;
    occasionSearch?: string;
    startDateSearch?: string;
    stopDateSearch?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.period && filters.period !== 'All') params.set('period', filters.period);
    if (filters?.occasion && filters.occasion !== 'All') params.set('occasion', filters.occasion);
    if (filters?.fromDate) params.set('from_date', filters.fromDate);
    if (filters?.toDate) params.set('to_date', filters.toDate);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.periodSearch) params.set('period_search', filters.periodSearch);
    if (filters?.occasionSearch) params.set('occasion_search', filters.occasionSearch);
    if (filters?.startDateSearch) params.set('start_date_search', filters.startDateSearch);
    if (filters?.stopDateSearch) params.set('stop_date_search', filters.stopDateSearch);
    const query = params.toString();
    const qs = query ? `?${query}` : '';
    return this.get<MaintenancePeriodRow[]>(`api/v1/dart/maintenance_periods/${qs}`);
  }
  // ship confing calls
  getRhsiEquipment() {
    return this.http.get(`${this.baseUrl}api/v1/sfd/rhsi-equipment/`);
  }

  getEquipmentMasterData() {
    return this.http.get(
      `${this.baseUrl}api/v1/sfd/rhsi-equipment/add-equipment-dropdown-values/`,
    );
  }

  //add ref sfd equipment  api/v1/sfd/rhsi-equipment/

  addEquipmentSfdRef(payload: Record<string, unknown>) {
    return this.http.post(
      `${this.baseUrl}api/v1/sfd/rhsi-equipment/`,
      payload,
      {
        observe: "response",
      },
    );
  }

  // add equipment in tranasaction

  addEquipmentTransaction(payload: Record<string, unknown>) {
    return this.http.post(
      `${this.baseUrl}api/v1/sfd/transaction-equipment/`,
      payload,
      {
        observe: "response",
      },
    );
  }
  getDlHistory() {
    return this.http.get(`${this.baseUrl}api/v1/dl-monitoring/dl_history/`);
  }

  getHomeDashboard(period: string) {
    return this.http.get(`${this.baseUrl}api/v1/user/home-dashboard/`, {
      params: { period },
    });
  }

  getHomeDashboardKpis() {
    return this.http.get(`${this.baseUrl}api/v1/user/home-dashboard/kpis/`);
  }
  getDlDashboardCounts() {
    return this.http.get(
      `${this.baseUrl}api/v1/dl-monitoring/dashboard-counts/`,
    );
  }

  getDlDashboard() {
    return this.http.get(`${this.baseUrl}api/v1/dl-monitoring/dashboard/`);
  }

  getRefitDashboard() {
    return this.http.get(`${this.baseUrl}api/v1/refit/dashboard/`);
  }

  getDlMaster() {
    return this.http.get(`${this.baseUrl}api/v1/dl-monitoring/master/`);
  }

  getDlTracking() {
    return this.http.get(`${this.baseUrl}api/v1/dl-monitoring/dl_tracking/`);
  }

  getDl2Tracking() {
    return this.http.get(`${this.baseUrl}api/v1/dl-monitoring/dl2tracking/`);
  }

  getDl3Tracking() {
    return this.http.get(`${this.baseUrl}api/v1/dl-monitoring/dl3tracking/`);
  }

  updateDlTracking(payload: Record<string, unknown>) {
    return this.http.post(
      `${this.baseUrl}api/v1/dl-monitoring/update_dl_tracking/`,
      payload,
    );
  }

  closeDlTracking(payload: Record<string, unknown>) {
    return this.http.post(
      `${this.baseUrl}api/v1/dl-monitoring/close_dl_tracking/`,
      payload,
    );
  }

  syncNavyojana(payload: { dl_type: string }) {
    return this.http.post(
      `${this.baseUrl}api/v1/dl-monitoring/sync_navyojana/`,
      payload,
    );
  }

  importDlExcel(payload: FormData) {
    return this.http.post(
      `${this.baseUrl}api/v1/dl-monitoring/import-excel/`,
      payload,
    );
  }

  // transaction

  getAddEquipmentDropdownValues() {
    return this.get("api/v1/sfd/transaction-equipment/add-equipment-dropdown-values/");
  }

  getEquipmentList(params?: Record<string, string | number | boolean | readonly (string | number | boolean)[]>) {
    return this.http.get(
      `${this.baseUrl}api/v1/sfd/transaction-equipment/list/`,
      { params },
    );
  }

  removeEquipment(payload: Record<string, unknown>) {
    return this.http.post(
      `${this.baseUrl}api/v1/sfd/transaction-equipment/remove/`,
      payload,
    );
  }

  updateDl1Tracking(payload: Record<string, unknown>) {
    return this.http.post(
      `${this.baseUrl}api/v1/dl-monitoring/dl_tracking/update/`,
      payload,
    );
  }
  updateEquipmentTransaction(id: number, payload: FormData) {
    return this.http.put(
      `${this.baseUrl}api/v1/sfd/transaction-equipment/${id}/`,
      payload,
      {
        observe: "response",
      },
    );
  }


  // Generate Routine Schedules
  generateMissingRoutines() {
    return this.http.post(
      `${this.baseUrl}api/v1/ems/routines/generate/`,
      {},
      { context: skipFeedback({ loader: true, toast: true }) },
    );
  }

  addNewNomanClature(payload: Record<string, unknown>) {
    return this.http.post(
      `${this.baseUrl}api/v1/ems/routines/generate/`,
      payload,
      { context: skipFeedback({ loader: true, toast: true }) },
    );
  }

  updateDl2Tracking(payload: Record<string, unknown>) {
    return this.http.post(
      `${this.baseUrl}api/v1/dl-monitoring/dl2tracking/update/`,
      payload,
    );
  }

  updateDl3Tracking(payload: Record<string, unknown>) {
    return this.http.post(
      `${this.baseUrl}api/v1/dl-monitoring/dl3tracking/update/`,
      payload,
    );
  }

  editTransactionEquipment(payload: FormData) {
    return this.http.post(
      `${this.baseUrl}api/v1/sfd/transaction-equipment/edit/`,
      payload,
    );
  }
  changeEquipmentSerialNumber(payload: Record<string, unknown>) {
    return this.http.post(
      `${this.baseUrl}api/v1/sfd/transaction-equipment/save-equipment-change/`,
      payload,
      {
        observe: "response",
      },
    );
  }

  // SWMM to CMMS Integration APIs
  initiateDartCmmsSync(pk: number) {
    return this.http.post(`${this.baseUrl}api/v1/swmmapi/initiate-dart-sync/${pk}/`, {});
  }

  completeDartCmmsSync(pk: number) {
    return this.http.post(`${this.baseUrl}api/v1/swmmapi/complete-dart-sync/${pk}/`, {});
  }

  receiveCompletedRoutines(payload: Record<string, unknown>) {
    return this.http.post(`${this.baseUrl}api/v1/swmmapi/receive_completed_routine/`, payload);
  }

  syncSrarReportToCmms(pk: string) {
    return this.http.get(`${this.baseUrl}api/v1/swmmapi/srar_api/srar_sync/${pk}/`);
  }

  syncSrarByMonthYear(month: string, year: number) {
    return this.http.get(`${this.baseUrl}api/v1/swmmapi/srar_api/srar_pull_from_cmms/?month=${month}&year=${year}`);
  }

  // ITTTM Sync API
  syncItttm() {
    return this.http.post<unknown>(
      `${this.apiUrl}api/sync/run/`,
      {},
      { context: skipFeedback({ loader: true, toast: true }) }
    );
  }

  // Own progress panel (Home dashboard "Sync All" button) reports per-module
  // status itself, so the generic toast/loader interceptor is skipped here —
  // a 207 Multi-Status (partial failure) would otherwise surface as a bare
  // error toast with no indication of which module actually failed.
  syncAllTransactions() {
    return this.post<SyncAllTransactionsResponse>(
      "api/v1/swmmapi/sync-all-transactions/",
      {},
      skipFeedback({ loader: true, toast: true }),
    );
  }
}

// GET api/v1/user/technical-dashboard/ (TechnicalDashboardAPIView) — the legacy
// Home_new dashboard's cards, 12-month DART trend, per-sub-department Equipment
// Status, and KMS certificate expiry alerts.
export interface TechnicalDashboardCards {
  total_maintops: number;
  total_outstanding_darts: number;
  total_planned_routines: number;
  due_for_receipt: number;
  pts_survey_pending: number;
  total_issued_spares: number;
  user_count: number;
}

export interface TechnicalDashboardDartMonth {
  month: string;
  open_dart: number;
  closed_dart: number;
}

export interface TechnicalDashboardSubDeptEquipment {
  sub_dept: string;
  operational: number;
  non_operational: number;
  total: number;
}

export interface TechnicalDashboardCertificateAlert {
  id: number;
  name: string;
  certificate_type: string;
  expiry_date: string;
  is_expired: boolean;
  days: number;
  days_abs: number;
}

export interface TechnicalDashboardDartAlert {
  id: number;
  dart_number: string;
  equipment: string;
  days_open: number;
}

export interface TechnicalDashboardRoutineAlert {
  id: number;
  dart_number: string;
  equipment: string;
  days_overdue: number;
}

export interface TechnicalDashboardResponse {
  status: string;
  message: string;
  data: {
    cards: TechnicalDashboardCards;
    dart_chart: TechnicalDashboardDartMonth[];
    sub_dept_equipment_data: TechnicalDashboardSubDeptEquipment[];
    certificate_alerts: TechnicalDashboardCertificateAlert[];
    dart_alerts: TechnicalDashboardDartAlert[];
    routine_alerts: TechnicalDashboardRoutineAlert[];
  };
}

export interface SyncAllTransactionsModuleResult {
  module: string;
  status: boolean;
  message: string;
}

export interface SyncAllTransactionsResponse {
  status: boolean;
  modules: SyncAllTransactionsModuleResult[];
  completed_at?: string;
}

export interface AppInfo {
  version: string;
  copyright_text: string;
}
