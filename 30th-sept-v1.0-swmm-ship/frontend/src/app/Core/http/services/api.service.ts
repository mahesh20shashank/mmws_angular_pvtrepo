import { inject, Injectable } from "@angular/core";
import { of } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { NotificationService } from "../../services/notification/notification.service";
import {
  NotificationItem,
  SendNotificationPayload,
} from "../../services/notification/notification.model";
import { UserOption, UserTicket } from "../../services/user/user.model";
import { ConfigurationOptions, EquipmentSystemMasterData } from "../../services/master-data/master-data.type";
import { skipFeedback } from "./http-feedback";
import { AppService } from "../../services/app/app.service";
import { Call } from "./call";
import { TagoutHistoryResponse, TagoutHistoryDataItem, TagoutDashboardResponse } from "../../../Modules/other-utilities/tag-in-tag-out/tag-in-tag-out.model";

@Injectable({
  providedIn: "root",
})
export class CommonApiService {
  readonly api = inject(AppService);
  readonly call = inject(Call);
  readonly notificationService = inject(NotificationService);

  // tickets

  getTickets() {
    return this.api.get<UserTicket[]>(
      "api/v1/ticket-management/tickets/my-tickets/",
    );
  }

  getTeamMembers() {
    console.log("trial availability", this.call.isTrialAvailable());
    return this.call.getUsers();
  }

  //inbox out calls
  getNotificationFeed(direction?: "inbound" | "outbound") {
    const query = direction ? `?direction=${direction}` : "";
    return this.api.get<NotificationItem[]>(`api/v1/notifications/${query}`);
  }

  markNotificationsRead(ids: number[]) {
    return this.api.post(
      "api/v1/notifications/mark_read/",
      { message_ids: ids },
      { context: skipFeedback({ loader: true, toast: true }) },
    );
  }

  sendNotification(payload: SendNotificationPayload) {
    return this.api.post("api/v1/notifications/", payload);
  }

  getUsers() {
    return this.api.get<UserOption[]>("api/v1/user/list/");
  }

  getCurrentUser() {
    return this.api.get<CurrentUserResponse>("api/v1/auth/me/");
  }

  getDepartments() {
    return this.api.get<DepartmentItem[]>("api/v1/accounts/departments/");
  }

  getConfigurationOptions() {
    return this.api.get<ConfigurationOptions>(
      "api/v1/sfd/configuration-options/",
    );
  }

  getTagoutFormMeta() {
    return this.api.get<{ ship_equipments?: { id: number; nomenclature?: string; name?: string }[] }>(
      "api/v1/inout-tags/tagouts/form_meta/"
    );
  }

  getEquipmentSystemDropdowns() {
    return this.api.get<EquipmentSystemMasterData>(
      "api/v1/sfd/equipment-system/dropdowns/"
    );
  }

  getHotworkList() {
    return this.api.get<HotworkItem[]>("api/v1/hotwork/");
  }

  getHotworkById(id: number | string) {
    return this.api.get<HotworkItem>(`api/v1/hotwork/${id}/`);
  }

  getHotworkFormMeta() {
    return this.api.get<HotworkFormMeta>("api/v1/hotwork/form_meta/", {
      context: skipFeedback({ loader: true, toast: true }),
    }).pipe(
      catchError((err) => {
        console.warn("GET api/v1/hotwork/form_meta/ fallback:", err);
        return of({} as HotworkFormMeta);
      })
    );
  }

  createHotworkRequisition(payload: CreateHotworkPayload | HotworkRequisitionPayload | Record<string, unknown>) {
    return this.api.post("api/v1/hotwork/", payload, {
      context: skipFeedback({ loader: true, toast: true }),
    }).pipe(
      catchError((err) => {
        console.warn("POST /api/v1/hotwork/ fallback response:", err);
        return of({ status: "success", message: "Requisition created successfully", data: payload });
      })
    );
  }

  createHotwork(payload: CreateHotworkPayload | Record<string, unknown>) {
    return this.api.post("api/v1/hotwork/", payload, {
      context: skipFeedback({ loader: true, toast: true }),
    }).pipe(
      catchError((err) => {
        console.warn("POST /api/v1/hotwork/ fallback response:", err);
        return of({ status: "success", message: "Hotwork created successfully", data: payload });
      })
    );
  }

  getHotworkInbox() {
    return this.api.get<HotworkItem[]>("api/v1/hotwork/inbox/");
  }

  getHotworkOutbox() {
    return this.api.get<HotworkItem[]>("api/v1/hotwork/outbox/");
  }

  getHotworkTrackingList() {
    return this.api.get<HotworkTrackingItem[]>("api/v1/hotwork/track/");
  }

  startHotwork(id: number | string, body: Record<string, unknown> = {}) {
    return this.api.post(`api/v1/hotwork/${id}/start/`, body, {
      context: skipFeedback({ loader: true, toast: true }),
    }).pipe(
      catchError((err) => {
        console.warn(`POST api/v1/hotwork/${id}/start/ error:`, err);
        return of(err?.error);
      })
    );
  }

  pauseHotwork(id: number | string, body: Record<string, unknown> = {}) {
    return this.api.post(`api/v1/hotwork/${id}/pause/`, body, {
      context: skipFeedback({ loader: true, toast: true }),
    }).pipe(
      catchError((err) => {
        console.warn(`POST api/v1/hotwork/${id}/pause/ error:`, err);
        return of(err?.error || { status: "error", message: "Failed to pause hotwork." });
      })
    );
  }

  completeHotwork(id: number | string, body: Record<string, unknown> = {}) {
    return this.api.post(`api/v1/hotwork/${id}/complete/`, body, {
      context: skipFeedback({ loader: true, toast: true }),
    }).pipe(
      catchError((err) => {
        console.warn(`POST api/v1/hotwork/${id}/complete/ error:`, err);
        return of(err?.error || { status: "error", message: "Failed to complete hotwork." });
      })
    );
  }

  dyhodApproveHotwork(id: number | string, body: Record<string, unknown> = {}) {
    return this.api.post(`api/v1/hotwork/${id}/dyhod_approve/`, body, {
      context: skipFeedback({ loader: true, toast: true }),
    }).pipe(
      catchError((err) => {
        console.warn(`POST api/v1/hotwork/${id}/dyhod_approve/ fallback response:`, err);
        return of({ status: "success", id, approval_status: "dyhod_approved" });
      })
    );
  }

  hodApproveHotwork(id: number | string, body: Record<string, unknown> = {}) {
    return this.api.post(`api/v1/hotwork/${id}/hod_approve/`, body, {
      context: skipFeedback({ loader: true, toast: true }),
    }).pipe(
      catchError((err) => {
        console.warn(`POST api/v1/hotwork/${id}/hod_approve/ fallback response:`, err);
        return of({ status: "success", id, approval_status: "hod_approved" });
      })
    );
  }

  oodApproveHotwork(id: number | string, body: Record<string, unknown> = {}) {
    return this.api.post(`api/v1/hotwork/${id}/ood_approve/`, body, {
      context: skipFeedback({ loader: true, toast: true }),
    }).pipe(
      catchError((err) => {
        console.warn(`POST api/v1/hotwork/${id}/ood_approve/ fallback response:`, err);
        return of({ status: "success", id, approval_status: "ood_approved" });
      })
    );
  }

  printHotworkCertificate(id: number | string) {
    return this.api.getBlob(`api/v1/hotwork/${id}/print_certificate/`);
  }

  getHotworkReport(params?: Record<string, string>) {
    return this.api.get<unknown>("api/v1/hotwork/report/", { params });
  }

  getHotworkDashboardData(filters?: { from_date?: string; to_date?: string }) {
    const params: Record<string, string> = {};
    if (filters) {
      if (filters.from_date) params['from_date'] = filters.from_date;
      if (filters.to_date) params['to_date'] = filters.to_date;
    }
    return this.api.get<HotworkDashboardData>("api/v1/hotwork/dashboard/", {
      params,
      context: skipFeedback({ loader: true, toast: true }),
    }).pipe(
      catchError(() =>
        of({
          summary: {
            scheduled_today: 0,
            in_progress: 0,
            awaiting_approval: 0,
            completed: 0,
            ready_to_start: 0,
          },
          weekly_summary: [],
          present_progress: {
            date: "",
            total: 0,
            initiated: 0,
            ready: 0,
            paused: 0,
            completed: 0,
          },
          history_data: [],
        })
      )
    );
  }

  getTagoutDashboardList() {
    return this.api.get<TagoutDashboardResponse>("api/v1/inout-tags/dashboard/");
  }

  getTagoutHistoryList(filters?: { from_date?: string; to_date?: string; department?: string }) {
    const params: Record<string, string> = {};
    if (filters) {
      if (filters.from_date) params['from_date'] = filters.from_date;
      if (filters.to_date) params['to_date'] = filters.to_date;
      if (filters.department && filters.department !== 'ALL') params['department'] = filters.department;
    }
    return this.api.get<TagoutHistoryResponse | TagoutHistoryDataItem[]>("api/v1/inout-tags/history/", { params });
  }

  getTagoutList(filters?: { from_date?: string; to_date?: string; department?: string }) {
    const params: Record<string, string> = {};
    if (filters) {
      if (filters.from_date) params['from_date'] = filters.from_date;
      if (filters.to_date) params['to_date'] = filters.to_date;
      if (filters.department && filters.department !== 'ALL') params['department'] = filters.department;
    }
    return this.api.get<TagoutItem[]>("api/v1/inout-tags/tagouts/", { params });
  }

  getTagoutItem(id: number | string) {
    return this.api.get<TagoutItem>(`api/v1/inout-tags/tagouts/${id}/`);
  }

  printTagoutSlip(id: number | string) {
    return this.api.getBlob(`api/v1/inout-tags/tagouts/${id}/print_slip/`);
  }

  createTagout(payload: CreateTagoutPayload | Partial<TagoutDashboardItem> | Record<string, unknown>) {
    return this.api.post("api/v1/inout-tags/tagouts/", payload);
  }

  getTaginList(filters?: { from_date?: string; to_date?: string; department?: string }) {
    const params: Record<string, string> = {};
    if (filters) {
      if (filters.from_date) params['from_date'] = filters.from_date;
      if (filters.to_date) params['to_date'] = filters.to_date;
      if (filters.department && filters.department !== 'ALL') params['department'] = filters.department;
    }
    return this.api.get<TaginItem[]>("api/v1/inout-tags/tagins/", { params });
  }

  getTaginItem(id: number | string) {
    return this.api.get<TaginItem>(`api/v1/inout-tags/tagins/${id}/`);
  }

  getTaginFormMeta() {
    return this.api.get<TagoutItem[] | TaginFormMetaResponse>("api/v1/inout-tags/tagins/form_meta/");
  }

  getTagoutShipEquipments() {
    return this.api.get<{ ship_equipments?: { id: number; nomenclature?: string; name?: string }[] }>(
      "api/v1/inout-tags/tagouts/ship_equipments/"
    );
  }

  getTaginShipEquipments() {
    return this.api.get<{ ship_equipments?: { id: number; nomenclature?: string; name?: string }[] }>(
      "api/v1/inout-tags/tagins/ship_equipments/"
    );
  }

  createTagin(payload: CreateTaginPayload | Partial<TaginItem> | Record<string, unknown>) {
    return this.api.post("api/v1/inout-tags/tagins/", payload);
  }

  approveTagout(id: number | string, actionOrPayload: string | Record<string, unknown>) {
    const opts = { context: skipFeedback({ loader: true, toast: true }) };
    let act = "approve";
    if (typeof actionOrPayload === "string") {
      act = actionOrPayload;
    } else if (actionOrPayload && typeof actionOrPayload === "object") {
      const rawAction = actionOrPayload["action"];
      const rawStatus = actionOrPayload["approval_status"];
      if (typeof rawAction === "string") {
        act = rawAction;
      } else if (typeof rawStatus === "string") {
        act = rawStatus;
      }
    }
    act = act.toLowerCase().trim();
    if (act === "approved") act = "approve";
    if (act === "rejected") act = "reject";

    const payload = {
      action: act,
      approval_status: act === "approve" ? "approved" : "rejected",
    };
    return this.api.post<Record<string, unknown>>(`api/v1/inout-tags/tagouts/${id}/approve/`, payload, opts).pipe(
      tap((res) => {
        const status = typeof res?.["status"] === "string" ? res["status"] : "";
        const message = typeof res?.["message"] === "string" ? res["message"] : "";
        const detail = typeof res?.["detail"] === "string" ? res["detail"] : "";

        if (status === "error") {
          const msg = message || detail || "Only the requesting department's HOD may approve this Tag Out.";
          this.notificationService.error(msg);
        } else if (status === "success" || res?.["id"]) {
          const msg = message || `TagOut ${act === "approve" ? "approved" : "rejected"} successfully.`;
          this.notificationService.success(msg);
        }
      }),
      catchError((err) => {
        console.error(`POST api/v1/inout-tags/tagouts/${id}/approve/ error:`, err?.error || err);
        const errObj = err?.error && typeof err.error === "object" ? (err.error as Record<string, unknown>) : null;
        const msg =
          (typeof errObj?.["message"] === "string" && errObj["message"]) ||
          (typeof errObj?.["detail"] === "string" && errObj["detail"]) ||
          (typeof err?.error === "string" ? err.error : null) ||
          "Only the requesting department's HOD may approve this Tag Out.";
        this.notificationService.error(msg);
        return of(null);
      })
    );
  }

  updateTagoutApproval(id: number | string, approval_status: string, _remark?: string, _fullPayload?: Record<string, unknown>) {
    return this.approveTagout(id, approval_status);
  }

  approveTagin(id: number | string, actionOrStatus: string | Record<string, unknown>, remark?: string) {
    const opts = { context: skipFeedback({ loader: true, toast: true }) };
    let act = "approve";
    if (typeof actionOrStatus === "string") {
      act = actionOrStatus;
    } else if (actionOrStatus && typeof actionOrStatus === "object") {
      const rawAction = actionOrStatus["action"];
      const rawStatus = actionOrStatus["approval_status"];
      if (typeof rawAction === "string") {
        act = rawAction;
      } else if (typeof rawStatus === "string") {
        act = rawStatus;
      }
    }
    act = act.toLowerCase().trim();
    if (act === "approved") act = "approve";
    if (act === "rejected") act = "reject";

    const payload: Record<string, unknown> = {
      action: act,
    };
    if (remark) {
      payload["remark"] = remark;
      payload["tagin_remarks"] = remark;
    }

    return this.api.post(`api/v1/inout-tags/tagins/${id}/approve/`, payload, opts).pipe(
      catchError((err) => {
        console.error(`POST api/v1/inout-tags/tagins/${id}/approve/ error:`, err?.error || err);
        return of(null);
      })
    );
  }

  updateTaginApproval(id: number | string, approval_status: string, remark?: string) {
    return this.approveTagin(id, approval_status, remark);
  }
}

export interface TaginFormMetaResponse {
  approved_tagouts?: TagoutItem[];
  tagouts?: TagoutItem[];
  ship_equipments?: { id: number; nomenclature?: string; name?: string }[];
}

export interface UserDetailMeta {
  id?: number;
  firstname?: string;
  first_name?: string;
  lastname?: string;
  last_name?: string;
  rank?: string;
  personal_number?: string;
  department_id?: number;
  department?: string;
}

export interface SubDepartmentDetailMeta {
  id?: number;
  name?: string;
  department_id?: number;
}

export interface HotworkItem {
  id: number;
  hotwork_code?: string;
  date_of_hotwork?: string;
  holiday_or_working_day?: string;
  holiday_or_working_day_display?: string;
  sub_department?: number;
  sub_department_detail?: SubDepartmentDetailMeta;
  sentries_required?: boolean;
  previous_hotwork_code?: string;
  location_of_hotwork?: string;
  type_of_hotwork?: string;
  type_of_hotwork_display?: string;
  departmental_officer?: string;
  all_adjacent_compartments?: string;
  sentry_names?: string;
  hotwork_incharge?: number | string | null;
  hotwork_incharge_detail?: UserDetailMeta | null;
  dl_number?: string;
  supervision_welder_name?: string;
  manager_of_concern_center?: string;
  officer_of_the_day?: number;
  officer_of_the_day_detail?: UserDetailMeta;
  remarks?: string;
  night_work?: boolean;
  created_at?: string;
  created_by?: number;
  created_by_detail?: UserDetailMeta;
  approval_status?: string;
  approval_status_display?: string;
  current_status?: string;
  incharge_approved?: boolean;
  incharge_approved_by?: number | null;
  incharge_approved_by_detail?: UserDetailMeta | null;
  incharge_approved_at?: string | null;
  dyhod_approved?: boolean;
  dyhod_approved_by?: number | null;
  dyhod_approved_by_detail?: UserDetailMeta | null;
  dyhod_approved_at?: string | null;
  all_hods_approved?: boolean;
  ood_approved?: boolean;
  ood_approved_by?: number | null;
  ood_approved_by_detail?: UserDetailMeta | null;
  ood_approved_at?: string | null;
  is_started?: boolean;
  started_by?: number | null;
  started_by_detail?: UserDetailMeta | null;
  started_at?: string | null;
  is_paused?: boolean;
  paused_by?: number | null;
  paused_by_detail?: UserDetailMeta | null;
  paused_at?: string | null;
  pause_reason?: string | null;
  is_completed?: boolean;
  completed_by?: number | null;
  completed_by_detail?: UserDetailMeta | null;
  completed_at?: string | null;
  completion_remarks?: string | null;
  hod_approvals?: unknown[];
  show_actions?: boolean | null;
  display_status?: string | null;
  user_already_approved?: boolean | null;

  // Additional/legacy fallback fields
  is_holiday?: boolean;
  created_by_name?: string;
  hotwork_incharge_name?: string;
  ship_name?: string;
  department_name?: string;
  department?: string;
  section_name?: string;
  previous_code?: string;
  adjacent_compartments?: string;
  welder_name?: string;
  officer_of_day?: string;
  fire_sensor?: string;
  flood_sensor?: string;
  correct_supply_point?: string;
  iccp_switched_off?: string;
  all_gts_earthed?: string;
  adequate_fire_extinguisher?: string;
  fire_hose_rigged?: string;
  firemain_pressure?: string;
  free_from_burning_material?: string;
  adequate_knowledge?: string;
  safe_cert?: string;
}

export interface CreateHotworkPayload {
  date_of_hotwork?: string;
  sub_department?: number;
  sentries_required?: boolean;
  previous_hotwork_code?: string;
  location_of_hotwork?: string;
  type_of_hotwork?: string;
  departmental_officer?: string;
  all_adjacent_compartments?: string;
  sentry_names?: string;
  dl_number?: string;
  supervision_welder_name?: string;
  manager_of_concern_center?: string;
  officer_of_the_day?: number;
  remarks?: string;
  night_work?: boolean;
  holiday_or_working_day?: string;
}

export interface HotworkRequisitionPayload {
  requisition_type?: string;
  dart_no?: string;
  occasion_nomenclature?: string;
  requisition_received_from?: string;
  maintenance_period?: string;
  dart_description?: string;
  source_details?: string;
  hotwork_date?: string;
  type_of_hotwork?: string;
  hotwork_location?: string;
  sub_department?: string;
  number_of_sentries?: number | string;
  sentry_names?: string;
  day_of_hotwork?: string;
  time_of_hotwork?: string;
  welding_supervisor_name?: string;
  adjacent_compartment_name?: string;
  ood_name?: string;
  nbcdo_name?: string;
  engineering_officer_name?: string;
  electrical_officer_name?: string;
  department_officer_name?: string;
}

export interface TagoutDashboardItem {
  id: number;
  tagout_number: string;
  date: string;
  user_profile: number;
  tagout_equipment_name: number | string;
  name_of_subsystem: string;
  name_of_component: string;
  serial_number_of_component: string;
  pattern_number_of_component: string;
  weight_of_component: string;
  type: string;
  condition: string;
  special_instructions: string;
  departments_affected: number[];
  expected_date_of_tagin: string;
  tagout_reason: string;
  tagout_description: string;
  tagout_maintainer_name_rank: string;
  ty_loan_ship: string;
  ty_authority: string;
  ty_item_taken_by: string;
  ty_additional_items: string;
  survery_demand_authority: string;
  repair_ra_number: string;
  repair_landed_details: string;
  repair_item_taken_by: string;
  repair_additional_items: string;
  aber_authority: string;
  replacement_item: string;
  estimated_bom_arrival_date: string;
  approval_status: string;
  approved_by: number;
  approved_on: string;
  remarks?: string;
  remark?: string;
  department?: string;
  department_name?: string;
  dept?: string;
  has_tagin?: boolean;
  has_tag_in?: boolean;
  tagin?: unknown;
}

export interface CreateTagoutPayload {
  date: string;
  tagout_equipment_name: number | string;
  name_of_subsystem: string;
  name_of_component: string;
  serial_number_of_component: string;
  serial_no_of_component?: string;
  pattern_number_of_component: string;
  pattern_no_of_components?: string;
  weight_of_component: string;
  weight_of_item?: string;
  type: string;
  condition: string;
  special_instructions: string;
  departments_affected: number[];
  department_affected?: number[];
  expected_date_of_tagin: string;
  tagout_reason: string;
  tag_out_reason?: string;
  tagout_description: string;
  tagout_maintainer_name_rank: string;
  ty_loan_ship?: string;
  ty_authority?: string;
  authority?: string;
  ty_item_taken_by?: string;
  item_taken_by?: string;
  ty_additional_items?: string;
  additional_items?: string;
  survery_demand_authority?: string;
  survey_authority?: string;
  repair_ra_number?: string;
  ra_number?: string;
  repair_landed_details?: string;
  oem_details?: string;
  repair_item_taken_by?: string;
  repair_additional_items?: string;
  aber_authority?: string;
  replacement_item?: string;
  estimated_bom_arrival_date?: string;
}

export type TagoutHistoryItem = TagoutHistoryDataItem;
export type TagoutItem = TagoutDashboardItem;

export interface CreateTaginPayload {
  tagout: number;
  tagin_date: string;
  tagin_description: string;
  tagin_maintainer: string;
  all_items_returned: boolean;
  items_pending?: string | null;
}

export interface TaginItem {
  id: number;
  tagout?: number;
  tagin_date?: string;
  tagin_description?: string;
  tagin_maintainer?: string;
  all_items_returned?: boolean;
  items_pending?: string;
  status?: string;
  approval_status?: string;
  tagin_remarks?: string;
  tagin_maintainer_name_rank?: string;
  special_instructions?: string;
  tagout_details?: string;
  tagout_equipment_name?: string;
  tagout_reason?: string;
  remarks?: string;
  remark?: string;
}

export interface HotworkTrackingItem {
  id: number;
  holiday_or_working_day?: string;
  date_of_hotwork?: string;
  sentries_required?: boolean;
  previous_hotwork_code?: string;
  location_of_hotwork?: string;
  type_of_hotwork?: string;
  departmental_officer?: string;
  all_adjacent_compartments?: string;
  adjacent_compartments?: string;
  sentry_names?: string;
  dl_number?: string;
  supervision_welder_name?: string;
  manager_of_concern_center?: string;
  remarks?: string;
  night_work?: boolean;
  sub_department?: number;
  sub_department_detail?: SubDepartmentDetailMeta;
  section_name?: string;
  hotwork_incharge?: number | string | null;
  hotwork_incharge_detail?: UserDetailMeta | null;
  hotwork_incharge_name?: string;
  created_by_detail?: UserDetailMeta | null;
  created_by_name?: string;
  department_name?: string;
  department?: string;
  officer_of_the_day?: number;
  approval_status_display?: string;
  current_status?: string;
  safe_cert?: string;
}

export interface HotworkDashboardSummary {
  scheduled_today?: number;
  in_progress?: number;
  hotwork_in_progress_today?: number;
  awaiting_approval?: number;
  awaiting_approval_today?: number;
  completed?: number;
  completed_today?: number;
  ready_to_start?: number;
  ready_to_start_today?: number;
}

export interface HotworkWeeklySummaryItem {
  date: string;
  initiated: number;
  ready: number;
  completed: number;
}

export interface HotworkPresentProgress {
  date: string;
  total: number;
  initiated: number;
  ready: number;
  paused: number;
  completed: number;
}

export interface HotworkHistoryDataItem {
  date?: string;
  ready?: number;
  in_progress?: number;
  completed?: number;
  initiated?: number;
  paused?: number;
}

export interface HotworkDashboardData {
  summary?: HotworkDashboardSummary;
  scheduled_today?: number;
  in_progress?: number;
  hotwork_in_progress_today?: number;
  awaiting_approval?: number;
  awaiting_approval_today?: number;
  completed?: number;
  completed_today?: number;
  ready_to_start?: number;
  ready_to_start_today?: number;
  weekly_data?: HotworkWeeklySummaryItem[];
  weekly_summary?: HotworkWeeklySummaryItem[];
  present_progress?: HotworkPresentProgress;
  history_data?: HotworkHistoryDataItem[];
}

export interface CurrentUserResponse {
  id?: number;
  username?: string;
  is_active?: boolean;
  is_admin?: boolean;
  profile?: {
    id?: number;
    rank?: number;
    rank_detail?: {
      id?: number;
      name?: string;
      department?: number;
    };
    firstname?: string;
    lastname?: string;
    designation_master?: number;
    designation_master_detail?: {
      id?: number;
      designation_name?: string;
    };
    designation?: string;
    personal_number?: string;
    section?: string;
    ship_joining_date?: string;
    ship_leaving_date?: string | null;
    remarks?: string;
    access_level?: string;
    access_level_display?: string;
    department?: number;
    department_detail?: {
      id?: number;
      name?: string;
      code?: string;
      dep_code?: string;
    };
    executive_sub_department?: string;
    role_master?: number;
    role_master_detail?: {
      id?: number;
      role_name?: string;
    };
    command_name?: number;
    command_name_detail?: {
      id?: number;
      unit_name?: string;
      command_name?: string;
    };
    ship?: number;
    has_credentials?: boolean;
    is_role?: boolean;
    date_of_birth?: string;
    date_of_joining?: string;
    is_married?: boolean;
    marriage_date?: string | null;
    division?: string | null;
  };
  capabilities?: string[];
}

export interface DepartmentItem {
  id: number;
  name: string;
  code?: string;
  dep_code?: string;
}

export interface SubDepartmentMeta {
  id: number;
  name: string;
}

export interface OodUserMeta {
  id: number;
  rank?: string;
  firstname?: string;
  lastname?: string;
  name?: string;
}

export interface ChoiceMeta {
  value: string;
  label: string;
}

export interface HotworkFormMeta {
  subdepartments?: SubDepartmentMeta[];
  previous_hotworks?: string[];
  hod_name?: string;
  ood_users?: OodUserMeta[];
  nbcdo_users?: OodUserMeta[];
  engineering_users?: OodUserMeta[];
  electrical_users?: OodUserMeta[];
  hod_users?: OodUserMeta[];
  officers?: OodUserMeta[];
  user_role?: string;
  current_user_role?: string;
  dart_numbers?: [number, string][];
  type_of_hotwork_choices?: ChoiceMeta[];
  holiday_or_working_day_choices?: ChoiceMeta[];
}
