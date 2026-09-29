import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable, firstValueFrom } from "rxjs";
import {
  resolveCmmsApiUrl,
  resolveAuthApiUrl,
} from "../../../../environments/api-url";
import { skipFeedback } from "../../../Core/http/services/http-feedback";
import {
  CmmsDartPushResult,
  OpenDefectsResponse,
} from "../open-defects/open-defects.model";
import {
  DartDashboardResponse,
  MaintenancePeriodRow,
  SubDeptDefectRow,
} from "../op-maintenance-dashboard/op-maintenance-dashboard.model";
import {
  OpmDashboardActivityPeriod,
  OpmDashboardData,
  OpmDashboardPeriod,
  OpmDashboardResponse,
} from "../overview/opm-overview.model";
import { CreateRAResponse } from "../create-ra/create-ra.model";
import { CreateDLResponse } from "../create-dliii/create-dliii.model";
import { CompleteDartListItem } from "../complete-dart-list/complete-dart-list.model";
import {
  GeneratedDl1ReportInnerRow,
  GeneratedDl1ReportRow,
} from "../routines-dashboard/references/exported-files-dl1/exported-files-dl1.model";
import { SlipHistoryResponse } from "../routines-dashboard/history/slip-history/slip-history";
import { MaintenanceApiResponse } from "../routines-dashboard/reports/reports.component";
import { CloseDefectResponse } from "../defect-closure-details/defect-closure-details.model";
import { RoutineResponse } from "../routines-dashboard/calendar-based-routines/calendar-based-routines.model";
import { EquipmentDueForAberResponse } from "../routines-dashboard/equipment-due-for-aber/equipment-due-for-aber.model";
import {
  CloseRaiseFussResponse,
  CloseRoutinePayload,
  CloseRoutineResponse,
  CompleteFussPayload,
  FUSSRaisedRoutinesResponse,
  FUSSTriggerListResponse,
  FussRaisedDetailsResponse,
  RaiseFussPayload,
  RaiseFussResponse,
} from "../routines-dashboard/fuss-triger-list/fuss-trigger-list.model";
import {
  PlannedRoutineDetail,
  RoutinePlanResponse,
  SearchDetailResultItem,
} from "../routines-dashboard/search-routines/search-routines.model";
import type {
  PlannedRoutineItem,
  PlannedRoutinesFilterOptions,
} from "../routines-dashboard/planned-routines/planned-routines";
import {
  GenerateDl1ListResponse,
  RefitRoutineDetail,
  RefitSearchListResponse,
  SaveDlDraftRowsPayload,
} from "../routines-dashboard/dl1-generation/refit-routines.model";
import { DartHistoryResponse } from "../history/history.component";
import { GeneratedDlIiReport } from "../references/exported-files/exported-files.component";
import {
  RoutineHistoryApiResponse,
  RoutineHistoryFilters,
  RoutineHistoryTimelineResponse,
} from "../routines-dashboard/history/equipment-routine-history/equipment-routine-history";
import { ClosedRoutineApiResponse } from "../routines-dashboard/history/close-routine-history/close-routine-history";
import { SyncCmmsResponse } from "../routines-dashboard/references/import-data/import-data";
import { RaiseFussSaveResponse } from "../routines-dashboard/fuss-triger-list/fuss-triger-raise-fuss/fuss-triger-raise-fuss";
import {
  AssistanceMasterApi,
  CertificateTypeMasterApi,
  ReasonMasterApi,
  RepairAgencyMasterApi,
  ServicesMasterApi,
  SeverityMasterApi,
  ShipRemarkMasterApi,
} from "../configuration/opm-configuration.model";
import {
  EmsSectionsResponse,
  EmsStateChangeDetailResponse,
  EmsSubDepartmentsResponse,
  EmsThumbnailResponse,
  EquipmentHistoryResponse,
  SaveMonthlyRunningHoursPayload,
  SectionRhsiBarchartResponse,
  UpdateEquipmentStatePayload,
} from "../routines-dashboard/ems-dashboard/ems-dashboard.model";
import { EmsSearchPlanResponse } from "../routines-dashboard/search-routines/search-routines.model";
import { UniqueMaintopResponse } from "../routines-dashboard/main-top.model";

// GET api/v1/ems/planned-routines/ (PlannedRoutinesMasterView) — paginated via DRF's
// PageNumberPagination (CustomPagination on the backend). `filter_options` isn't sent by
// the backend today; kept optional so the frontend already reads it correctly whenever
// that gets added, without another response-shape mismatch.
export interface PlannedRoutinesResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PlannedRoutineItem[];
  filter_options?: PlannedRoutinesFilterOptions;
}

@Injectable({
  providedIn: "root",
})
export class OperationalMaintenanceApi {
  private readonly http = inject(HttpClient);
  baseUrl = resolveCmmsApiUrl();

  private get<T>(url: string) {
    return this.http.get<T>(`${this.baseUrl}${url}`);
  }

  private post<T = unknown>(url: string, payload: unknown, context?: unknown) {
    return this.http.post<T>(
      `${this.baseUrl}${url}`,
      payload,
      context ? ({ context } as Record<string, unknown>) : {},
    );
  }

  // darts

  getOpenDartsAndABER(
    params?: Record<string, string>,
  ): Observable<OpenDefectsResponse> {
    const query =
      params && Object.keys(params).length
        ? `?${new URLSearchParams(params).toString()}`
        : "";
    return this.get<OpenDefectsResponse>(`api/v1/dart/pending_defect/${query}`);
  }
  postCmmsDart(payload: unknown[]) {
    return this.post(
      "api/v1/cmms/dart",
      payload,
      skipFeedback({ loader: true, toast: true }),
    );
  }
  /** Pushes DART closures (RectifiedDate, codes, IsClosed, Active) up to CMMS. */
  pushClosedDartsToCmms(ids: number[]) {
    return this.post<CmmsDartPushResult>("api/v1/dart/push-closed-to-cmms/", {
      ids,
    });
  }
  /**
   * Pulls the latest open defects from CMMS, then pushes every SWMM-raised DART still
   * pending — ship-wide, regardless of any grid selection or department/section filter.
   */
  syncAllDartsWithCmms() {
    return this.post<CmmsDartPushResult>(
      "api/v1/dart/sync-all-with-cmms/",
      {},
      skipFeedback({ loader: true, toast: true }),
    );
  }
  getDartDetails(dart_id: number) {
    return this.http.get(`${this.baseUrl}api/v1/dart/get_dart_details/`, {
      params: {
        dart_id: dart_id.toString(),
      },
    });
  }
  createRA(defectIds: number[]) {
    return this.post<CreateRAResponse>(
      "api/v1/dart/create_ra/",
      { defect_ids: defectIds },
      skipFeedback({ loader: true, toast: true }),
    );
  }
  exportRA(payload: {
    yard: string;
    dtg_date: string;
    dtg_hour: string;
    dtg_minute: string;
    export_format: string;
    dart_ids: number[];
    remarks_data: Record<number, string>;
    ss_remarks_data: Record<number, string>;
    dl_type: "RA";
  }) {
    return this.post<{
      status: string;
      message: string;
      data: {
        ra_group_id: string;
        total_records: number;
        yard: string;
        dtg: string;
        export_format: string;
        dl_type: string;
        download_url: string;
      };
    }>(
      "api/v1/dart/export_pending_defects_accdb/",
      payload,
      skipFeedback({ loader: true, toast: true }),
    );
  }
  createDL(defectIds: number[]) {
    return this.post<CreateDLResponse>(
      "api/v1/dart/createdlfun/",
      { dl_defect_ids: defectIds },
      skipFeedback({ loader: true, toast: true }),
    );
  }
  /** `dart_id` here is actually the InitiateRADL draft row's own id, per the
   * backend serializer's help_text — matches the wire contract's naming. */
  saveDLRows(
    rows: { dart_id: number; remarks?: string; additional_remarks?: string }[],
  ) {
    return this.post<{ status: string; message: string }>(
      "api/v1/dart/save_dl_rows/",
      { rows },
      skipFeedback({ loader: true, toast: true }),
    );
  }
  deleteDLRow(dlId: number) {
    return this.post<{ status: string; message: string }>(
      "api/v1/dart/delete_dl_row/",
      { dl_id: dlId },
      skipFeedback({ loader: true, toast: true }),
    );
  }
  exportDLII(
    exportPath: string,
    payload: {
      yard: string;
      export_format: string;
      refit_Type?: number;
      row_data: {
        dart_id: number;
        dl_id: number;
        dl_number: string;
        additional_remark: string;
        ss_remark: string;
      }[];
    },
  ) {
    return this.post<{
      status: string;
      message: string;
      data: {
        ra_dl_name: string;
        total_records: number;
        yard: string;
        download_url: string;
      };
    }>(
      `api/v1/dart/${exportPath}/`,
      payload,
      skipFeedback({ loader: true, toast: true }),
    );
  }
  getCompleteDartList() {
    return this.get<CompleteDartListItem[]>("api/v1/dart/complete_dart_list/");
  }
  getCloseDefectById(defectId: number): Observable<CloseDefectResponse> {
    return this.get<CloseDefectResponse>(
      `api/v1/dart/complete_defect/${defectId}/`,
    );
  }
  updateCloseDefect(defectId: number, payload: FormData) {
    return this.post(
      `api/v1/dart/complete_defect/${defectId}/`,
      payload,
      skipFeedback({ loader: true, toast: true }),
    );
  }
  // DART History Landing Page — also DART History Filtered Search: `history/data/`
  // (backend/dart/views.py DartHistoryDefaultDataAPIView) reads its filters straight off
  // query params (sub_department, maintenance_period, dart_occasion, dart_type, equipment,
  // search, defect_date_from/to), so filtering is just re-calling this GET with the current
  // form values — there is no separate POST "filtered_data/" route on the active `dart` app
  // (that only exists on the legacy `dart_backup` app), which is why a previous
  // getFilteredDartHistory() calling it 404'd and history.component.ts fell back to
  // client-side-only filtering.
  getDartHistory(params?: Record<string, unknown>) {
    const query = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        query.set(key, String(value));
      }
    }
    const qs = query.toString();
    return this.get<DartHistoryResponse>(
      `api/v1/dart/history/data/${qs ? "?" + qs : ""}`,
    );
  }
  getRefitAndOperationalOccation(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.get(`api/v1/dart/refit_and_operational_occation/${query}`);
  }
  /** Creates a new refit/operational period. Backend's POST handler always
   * requires `refit_type` — it has no `action`-based branching for edits. */
  refitAndOperationalOccation(payload: {
    action: string;
    period_id?: number;
    start_date: string;
    completion_date: string;
    refit_type?: string;
  }) {
    return this.http.post(
      `${this.baseUrl}api/v1/dart/refit_and_operational_occation/`,
      payload,
      { context: skipFeedback({ loader: true, toast: true }) },
    );
  }
  /** Edits an existing refit/operational period's dates — a separate PUT
   * handler on the same endpoint, taking only `period_id`/`start_date`/
   * `completion_date` (no `refit_type`, unlike the POST/create handler). */
  editRefitOccasionDates(payload: {
    period_id: number;
    start_date: string;
    completion_date: string;
  }) {
    return this.http.put(
      `${this.baseUrl}api/v1/dart/refit_and_operational_occation/`,
      payload,
      { context: skipFeedback({ loader: true, toast: true }) },
    );
  }
  getGeneratedDlIiReports() {
    return this.get<GeneratedDlIiReport[]>(
      "api/v1/dart/generated-dl-ii-reports/",
    );
  }

  // dart defect submission / guarantee defect

  createGuaranteeDefect(payload: Record<string, unknown> | FormData) {
    return this.http.post(
      `${this.baseUrl}api/v1/dart/initiate_dart/`,
      payload,
      {
        observe: "response",
        context: skipFeedback({ loader: true, toast: true }),
      },
    );
  }
  getDartMasterData(departmentId: number) {
    return this.get(`api/v1/dart/add_dart/?department_id=${departmentId}`);
  }
  // get nomanclature name onchange of equipment name in defect
  getEquipmentObjects(code: string) {
    return this.http.get(
      `${this.baseUrl}api/v1/dart/get-equipment-objects/?code=${code}`,
    );
  }
  // get noman clature behalf on equipmnet code
  getNomenclatureDetails(nomenclatureId: number) {
    return this.http.get(
      `${this.baseUrl}api/v1/dart/get_nomenclature_details/?nomenclature=${nomenclatureId}`,
    );
  }
  initiateDart(payload: Record<string, unknown> | FormData) {
    return this.http.post(
      `${this.baseUrl}api/v1/dart/initiate_dart/`,
      payload,
      {
        context: skipFeedback({ loader: true, toast: true }),
      },
    );
  }
  saveAberDefect(payload: Record<string, unknown>) {
    return this.initiateDart(payload);
  }

  // routines / ems dashboard

  getEmsThumbnail() {
    return this.get<EmsThumbnailResponse>("api/v1/ems/thumbnail/");
  }
  getEmsSections() {
    return this.get<EmsSectionsResponse>("api/v1/ems/section_name/");
  }
  getEmsSubDepartments() {
    return this.get<EmsSubDepartmentsResponse>(
      "api/v1/ems/sub_department_name/",
    );
  }
  getEmsEquipmentNames(sectionId?: number | string) {
    return this.get<{ equipment_name: Record<string, number> }>(
      sectionId
        ? `api/v1/ems/equipment_name/${sectionId}/`
        : "api/v1/ems/equipment_name/",
    );
  }
  getSubDepartmentRhsiBarchart(bucketKey: string) {
    return this.get<SectionRhsiBarchartResponse>(
      `api/v1/ems/sub_department_barchart/${bucketKey}/`,
    );
  }
  getUniqueMaintopRoutinesData(
    equipmentName?: string,
    search?: string,
    subDepartment?: string,
    routineCategory?: string,
    routineName?: string,
  ): Observable<UniqueMaintopResponse> {
    const params = new URLSearchParams();
    if (equipmentName && equipmentName !== "All")
      params.set("equipment_name", equipmentName);
    if (search) params.set("search", search);
    if (subDepartment && subDepartment !== "All")
      params.set("sub_department", subDepartment);
    if (routineCategory && routineCategory !== "All")
      params.set("routine_category", routineCategory);
    if (routineName && routineName !== "All")
      params.set("routine_name", routineName);
    const query = params.toString();
    const qs441 = query ? "?" + query : "";
    return this.get<UniqueMaintopResponse>(
      `api/v1/ems/unique_maintop/${qs441}`,
    );
  }
  getSearchPlanData(filters?: {
    subDepartment?: number | string;
    equipment?: number | string;
    routineType?: string;
    routineName?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Observable<EmsSearchPlanResponse> {
    const params = new URLSearchParams();
    if (filters?.subDepartment)
      params.set("section", String(filters.subDepartment));
    if (filters?.equipment)
      params.set("equipment_name", String(filters.equipment));
    if (filters?.routineType)
      params.set("routine_category", filters.routineType);
    if (filters?.routineName) params.set("routine_name", filters.routineName);
    // NOTE: backend api/v1/ems/search/ does not yet read this param — needs server-side support.
    if (filters?.search) params.set("search", filters.search);
    if (filters?.page) params.set("page", String(filters.page));
    if (filters?.pageSize) params.set("page_size", String(filters.pageSize));
    const query = params.toString();
    const queryString = query ? `?${query}` : "";
    return this.get<EmsSearchPlanResponse>(`api/v1/ems/search/${queryString}`);
  }
  updateEmsTotalRunningHours(payload: {
    equipment: number;
    rhsi: number;
    rhsi_updated_until: string;
  }) {
    return this.post<{ message: string }>(
      "api/v1/ems/create_total_running_hrs/",
      payload,
      skipFeedback({ loader: true, toast: true }),
    );
  }
  updateEmsEquipmentState(payload: UpdateEquipmentStatePayload) {
    return this.post<{ success: boolean; message: string }>(
      "api/v1/ems/update_equipment_state/",
      payload,
      skipFeedback({ loader: true, toast: true }),
    );
  }
  saveEmsMonthlyRunningHours(payload: SaveMonthlyRunningHoursPayload) {
    return this.post<{ success: boolean; message: string }>(
      "api/v1/ems/monthly_save/",
      payload,
      skipFeedback({ loader: true, toast: true }),
    );
  }
  getEmsEquipmentHistory(equipmentId: number) {
    return this.get<EquipmentHistoryResponse>(
      `api/v1/ems/get_equipment_history/${equipmentId}/`,
    );
  }
  getEmsStateChangeDetail(equipmentId: number) {
    return this.get<EmsStateChangeDetailResponse>(
      `api/v1/ems/search_detail_forstatechange/${equipmentId}/`,
    );
  }
  getRHBasedRoutinesData(search?: string): Observable<RoutineResponse> {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.get<RoutineResponse>(
      `api/v1/ems/result_specific_runninghr/${query}`,
    );
  }
  getCalenderRoutinesData(search?: string): Observable<RoutineResponse> {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.get<RoutineResponse>(
      `api/v1/ems/result_specific_calender/${query}`,
    );
  }
  getRoutineById(id: number, search?: string) {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.get<{ result: SearchDetailResultItem[] }>(
      `api/v1/ems/search_detail/${id}/${qs}`,
    );
  }
  getRoutinePlanById(id: number) {
    return this.get<RoutinePlanResponse>(`api/v1/ems/plan_routine/${id}/`);
  }
  planRoutineSave(
    id: number,
    payload: {
      planned_commencement_date?: string;
      spares_required?: "YES" | "NO";
      spares?: { pattern: string; qty: number; inventory_type?: string }[];
    },
  ) {
    return this.post<{
      status: string;
      message: string;
      routine_id: number;
      planned_routine_id: number | null;
    }>(`api/v1/ems/plan_routine_save/${id}/`, payload);
  }
  getPlanedRoutines(filters?: {
    sectionId?: number | string;
    equipmentNameId?: number | string;
    routineCategory?: string;
    routineName?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Observable<PlannedRoutinesResponse> {
    const params = new URLSearchParams();
    if (filters?.sectionId) params.set("section", String(filters.sectionId));
    if (filters?.equipmentNameId)
      params.set("equipment_name", String(filters.equipmentNameId));
    if (filters?.routineCategory)
      params.set("routine_category", filters.routineCategory);
    if (filters?.routineName) params.set("routine_name", filters.routineName);
    if (filters?.search) params.set("search", filters.search);
    if (filters?.page) params.set("page", String(filters.page));
    if (filters?.pageSize) params.set("page_size", String(filters.pageSize));
    const query = params.toString();
    const qs549 = query ? "?" + query : "";
    return this.get<PlannedRoutinesResponse>(
      `api/v1/ems/planned-routines/${qs549}`,
    );
  }
  getSearchDetailPlan(pk: number) {
    return this.get<{ result: PlannedRoutineDetail[] }>(
      `api/v1/ems/search_detail_plan/${pk}/`,
    );
  }
  deletePlannedRoutine(pk: number) {
    return this.get<{ success: boolean; message: string }>(
      `api/v1/ems/delete_planned_routine/${pk}/`,
    );
  }
  getCloseRoutineById(defectId: number): Observable<CloseRoutineResponse> {
    return this.get<CloseRoutineResponse>(
      `api/v1/ems/initiate_close_routine/${defectId}/`,
    );
  }
  updateCloseFUSSRoutine(defectId: number, payload: CloseRoutinePayload) {
    return this.post(
      `api/v1/ems/initiate_close_routine/${defectId}/`,
      payload,
      skipFeedback({ loader: true, toast: true }),
    );
  }
  // CMMS Routine Sync
  syncCmmsRoutine(): Observable<SyncCmmsResponse> {
    return this.http.get<SyncCmmsResponse>(
      `${this.baseUrl}api/v1/sfd/routine-sync/`,
    );
  }
  syncCompletedRoutines() {
    return this.http.post(
      `${this.baseUrl}api/v1/swmmapi/completed-routine-sync/`,
      {},
    );
  }
  initiateFussCmmsSync() {
    return this.http.post(
      `${this.baseUrl}api/v1/swmmapi/initiate-fuss-sync/`,
      {},
    );
  }

  // one-time routines

  getOnetimeRoutineList(
    params?: Record<
      string,
      string | number | boolean | readonly (string | number | boolean)[]
    >,
  ) {
    return this.http.get(`${this.baseUrl}api/v1/ems/routine_init_data/`, {
      params,
    });
  }
  getRoutineInitDetails(id: number | string) {
    return this.http.get(
      `${this.baseUrl}api/v1/ems/get_routine_init_details/${id}/`,
    );
  }
  saveRoutineInit(payload: {
    routine_id: number;
    completion_date?: string | null;
    undertaken_rh?: string | null;
  }) {
    return this.http.post(
      `${this.baseUrl}api/v1/ems/save_routine_init/`,
      payload,
      {
        context: skipFeedback({ loader: true }),
      },
    );
  }

  // FUSS

  getFUSSTriggerListRoutinesData(filters?: {
    subDept?: string;
    equipment?: string;
    routineName?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Observable<FUSSTriggerListResponse> {
    const params = new URLSearchParams();
    if (filters?.subDept && filters.subDept !== "All")
      params.set("sub_dept", filters.subDept);
    if (filters?.equipment && filters.equipment !== "All")
      params.set("equipment", filters.equipment);
    if (filters?.routineName && filters.routineName !== "All")
      params.set("routine_name", filters.routineName);
    if (filters?.search) params.set("search", filters.search);
    if (filters?.page) params.set("page", String(filters.page));
    if (filters?.pageSize) params.set("page_size", String(filters.pageSize));
    const query = params.toString();
    const qs465 = query ? "?" + query : "";
    return this.get<FUSSTriggerListResponse>(
      `api/v1/ems/fuss_trigger_list/${qs465}`,
    );
  }
  getFussRaisedDetails(
    routine: string,
    search?: string,
  ): Observable<FussRaisedDetailsResponse> {
    const params = new URLSearchParams();
    if (routine) params.set("routine", routine);
    if (search) params.set("search", search);
    const query = params.toString();
    const qs = query ? `?${query}` : "";
    return this.get<FussRaisedDetailsResponse>(
      `api/v1/ems/fuss_raised_details/${qs}`,
    );
  }
  getCloseRaiseFuss(routineId: number): Observable<CloseRaiseFussResponse> {
    return this.get<CloseRaiseFussResponse>(
      `api/v1/ems/close_raise_fuss/${routineId}/`,
    );
  }
  completeFuss(routineId: number, payload: CompleteFussPayload) {
    return this.post(
      `api/v1/ems/complete_fuss/${routineId}/`,
      payload,
      skipFeedback({ loader: true, toast: true }),
    );
  }
  getFUSSRaisedRoutines(filters?: {
    year?: string;
    month?: string;
    search?: string;
  }): Observable<FUSSRaisedRoutinesResponse> {
    const params = new URLSearchParams();
    if (filters?.year) params.set("year", filters.year);
    if (filters?.month) params.set("month", filters.month);
    if (filters?.search) params.set("search", filters.search);
    const query = params.toString();
    const qs926 = query ? "?" + query : "";
    return this.get<FUSSRaisedRoutinesResponse>(
      `api/v1/ems/fuss_raised_routines/${qs926}`,
    );
  }
  getRaiseFussDetails(selectedIds: number[]): Observable<RaiseFussResponse> {
    return this.get<RaiseFussResponse>(
      `api/v1/ems/mulraisefuss/?selected_ids=${selectedIds.join(",")}`,
    );
  }
  raiseFuss(payload: RaiseFussPayload): Observable<RaiseFussSaveResponse> {
    return this.post<RaiseFussSaveResponse>(
      "api/v1/ems/mulraisefuss/",
      payload,
      skipFeedback({ loader: true, toast: true }),
    );
  }

  // ABER

  getABERTriggerRoutinesData(filters?: {
    nomenclature?: string;
    compartment?: string;
    search?: string;
  }): Observable<EquipmentDueForAberResponse> {
    const params = new URLSearchParams();
    if (filters?.nomenclature && filters.nomenclature !== "All")
      params.set("nomenclature", filters.nomenclature);
    if (filters?.compartment && filters.compartment !== "All")
      params.set("compartment", filters.compartment);
    if (filters?.search) params.set("search", filters.search);
    const query = params.toString();
    const qs479 = query ? "?" + query : "";
    return this.get<EquipmentDueForAberResponse>(
      `api/v1/ems/aber_trigger_list/${qs479}`,
    );
  }

  // DL1 generation / refit routines

  searchRefitRoutines(filters?: {
    section?: number | string;
    equipmentId?: number | string;
    equipment?: string;
    routineName?: string;
    converted?: boolean;
  }): Observable<RefitSearchListResponse> {
    const params = new URLSearchParams();
    if (filters?.section) params.set("section", String(filters.section));
    if (filters?.equipmentId)
      params.set("equipment_id", String(filters.equipmentId));
    if (filters?.equipment) params.set("equipment", filters.equipment);
    if (filters?.routineName) params.set("routine_name", filters.routineName);
    if (filters?.converted !== undefined)
      params.set("converted", String(filters.converted));
    const query = params.toString();
    const queryString = query ? `?${query}` : "";
    return this.get<RefitSearchListResponse>(
      `api/v1/refit/refit_search/${queryString}`,
    );
  }
  getRefitRoutineDetail(id: number): Observable<RefitRoutineDetail> {
    return this.get<RefitRoutineDetail>(`api/v1/refit/refit_search/${id}/`);
  }
  generateDl1(pkList: number[]) {
    return this.post<{ status: string; message: string }>(
      "api/v1/ems/generatedl1/",
      { pk_list: pkList },
      skipFeedback({ loader: true, toast: true }),
    );
  }
  getDlDraftRows(filters?: {
    search?: string;
    page?: number;
    pageSize?: number;
  }): Observable<GenerateDl1ListResponse> {
    const params = new URLSearchParams();
    if (filters?.search) params.set("search", filters.search);
    if (filters?.page) params.set("page", String(filters.page));
    if (filters?.pageSize) params.set("page_size", String(filters.pageSize));
    const query = params.toString();
    const queryString = query ? `?${query}` : "";
    return this.get<GenerateDl1ListResponse>(
      `api/v1/ems/generatedl1/${queryString}`,
    );
  }
  deleteDlDraftRow(id: number) {
    return this.post<{ status: string; message?: string }>(
      "api/v1/ems/delete_dl_draft_row/",
      { id },
      skipFeedback({ loader: true }),
    );
  }
  saveDlDraftRows(payload: SaveDlDraftRowsPayload) {
    return this.post<{ status: string; message?: string }>(
      "api/v1/ems/save_dl_draft_rows/",
      payload,
      skipFeedback({ loader: true }),
    );
  }
  exportDl1Accdb(yardKey: "ndmbi" | "ndv" | "nsrykoc" | "nsrykar" | "nsrypdr") {
    return this.post<{ status: string; message: string }>(
      `api/v1/ems/export_dl1_accdb_${yardKey}/`,
      {},
      skipFeedback({ loader: true, toast: true }),
    );
  }
  getGeneratedDl1Reports() {
    return this.get<{ report_rows: GeneratedDl1ReportRow[] }>(
      "api/v1/ems/generatedl1_list/",
    );
  }
  getGeneratedDl1ReportInnerRows(id: number) {
    return this.get<{ data: GeneratedDl1ReportInnerRow[] }>(
      `api/v1/ems/report_inner_rows/${id}/`,
    );
  }

  // configuration masters

  getShipRemarksMaster() {
    return this.http.get<ShipRemarkMasterApi[]>(
      this.baseUrl + "api/v1/dart/configuration/ship-remarks-master/",
    );
  }
  getCertificateTypeMaster() {
    return this.http.get<CertificateTypeMasterApi[]>(
      this.baseUrl + "api/v1/dart/configuration/certificate-type-master/",
    );
  }
  getRepairAgencyMaster() {
    return this.http.get<RepairAgencyMasterApi[]>(
      this.baseUrl + "api/v1/dart/configuration/repair-agency-master/",
    );
  }
  getAssistanceMaster() {
    return this.http.get<AssistanceMasterApi[]>(
      this.baseUrl + "api/v1/dart/configuration/assistance-master/",
    );
  }
  getReasonMaster() {
    return this.http.get<ReasonMasterApi[]>(
      this.baseUrl + "api/v1/dart/configuration/reason-master/",
    );
  }
  getSeverityMaster() {
    return this.http.get<SeverityMasterApi[]>(
      this.baseUrl + "api/v1/dart/configuration/severity-master/",
    );
  }
  getServicesMaster() {
    return this.http.get<ServicesMasterApi[]>(
      this.baseUrl + "api/v1/dart/configuration/services-master/",
    );
  }

  // reports

  private buildMaintenancePlanQuery(subDept?: number, search?: string): string {
    const params = new URLSearchParams();
    if (subDept) params.set("sub_dept", String(subDept));
    if (search) params.set("search", search);
    const query = params.toString();
    return query ? `?${query}` : "";
  }
  getWeeklyMaintenancePlan(
    subDept?: number,
    search?: string,
  ): Observable<MaintenanceApiResponse> {
    return this.get<MaintenanceApiResponse>(
      `api/v1/ems/weekly_maintenance_plan/${this.buildMaintenancePlanQuery(subDept, search)}`,
    );
  }
  getMaintenancePlan(
    period: string,
    subDept?: number,
    search?: string,
  ): Observable<MaintenanceApiResponse> {
    return this.get<MaintenanceApiResponse>(
      `api/v1/ems/maintenance_plan/${period}/${this.buildMaintenancePlanQuery(subDept, search)}`,
    );
  }

  // history

  getSlipHistory(startDate?: string, endDate?: string, search?: string) {
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (search) params.set("search", search);
    const query = params.toString();
    return this.http.get<SlipHistoryResponse>(
      `${this.baseUrl}api/v1/ems/slip-history/${query ? "?" + query : ""}`,
    );
  }
  getClosedRoutineHistory(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.get<ClosedRoutineApiResponse>(
      `api/v1/ems/closed_routines_list/${query}`,
    );
  }
  getRoutineHistory(filters?: RoutineHistoryFilters) {
    const params = new URLSearchParams();
    if (filters?.subDept && filters.subDept !== "All")
      params.set("sub_dept", filters.subDept);
    if (filters?.equipment && filters.equipment !== "All")
      params.set("equipment", filters.equipment);
    if (filters?.routineName && filters.routineName !== "All")
      params.set("routine_name", filters.routineName);
    if (filters?.search) params.set("search", filters.search);

    const query = params.toString();
    const qs740 = query ? "?" + query : "";
    return this.get<RoutineHistoryApiResponse>(
      `api/v1/ems/routine_history/${qs740}`,
    );
  }
  getRoutineHistoryTimelineData(pk: number, routineNo?: string) {
    const params = new URLSearchParams();
    if (routineNo && routineNo !== "All") params.set("routine_no", routineNo);

    const query = params.toString();
    const qs749 = query ? "?" + query : "";
    return this.get<RoutineHistoryTimelineResponse>(
      `api/v1/ems/routine_history_timeline_data/${pk}/${qs749}`,
    );
  }
  getEquipmentRunningHistory(filters?: {
    equipment?: string;
    month?: string;
    search?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.equipment && filters.equipment !== "All")
      params.set("equipment", filters.equipment);
    if (filters?.month && filters.month !== "All")
      params.set("month", filters.month);
    if (filters?.search) params.set("search", filters.search);
    const query = params.toString();
    const qs758 = query ? "?" + query : "";
    return this.get(`api/v1/ems/equipment_running_history/${qs758}`);
  }

  // department / dashboard — async wrappers (not Observables like the rest of this
  // file) since these were migrated from the old services/operation-maintenance.ts
  // (OperationMaintenance), whose async/await call sites depend on a Promise here.

  /** api/v1/user/me/ is a generic account endpoint used well beyond op-maintenance
   *  (SRAR, Request Role, Tag-out) — it stays on the shared `Call` service; this just
   *  hits it directly to read the current user's department, same as the old wrapper did. */
  async getCurrentDepartmentId(): Promise<number | null> {
    try {
      const authUrl = resolveAuthApiUrl() || resolveCmmsApiUrl();
      const res = await firstValueFrom(
        this.http.get<{ profile?: { department?: number } }>(
          `${authUrl}api/v1/auth/me/`,
        ),
      );
      return res?.profile?.department ?? null;
    } catch (error) {
      console.error("Error fetching current user's department", error);
      return null;
    }
  }

  async getDartSpares(type: string) {
    try {
      return await firstValueFrom(
        this.http.get(
          `${this.baseUrl}api/v1/dart/get_dart_spares_data/?type=${type}`,
        ),
      );
    } catch (error) {
      console.error("Error fetching spares", error);
      throw error;
    }
  }

  async getDartDashboard(departmentId: number): Promise<DartDashboardResponse> {
    try {
      return await firstValueFrom(
        this.get<DartDashboardResponse>(
          `api/v1/dart/dartdashboard/?department_id=${departmentId}`,
        ),
      );
    } catch (error) {
      console.error("Error fetching DART dashboard", error);
      throw error;
    }
  }

  async getSubDeptDefects(subDept: string): Promise<SubDeptDefectRow[]> {
    try {
      const res = await firstValueFrom(
        this.get<{ success: boolean; data: SubDeptDefectRow[] }>(
          `api/v1/dart/get_sub_dept_defects/?sub_dept=${encodeURIComponent(subDept)}`,
        ),
      );
      return res?.data ?? [];
    } catch (error) {
      console.error("Error fetching sub-department defects", error);
      return [];
    }
  }

  async getMaintenancePeriodsList(filters?: {
    period?: string;
    occasion?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    periodSearch?: string;
    occasionSearch?: string;
    startDateSearch?: string;
    stopDateSearch?: string;
  }): Promise<MaintenancePeriodRow[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.period && filters.period !== "All")
        params.set("period", filters.period);
      if (filters?.occasion && filters.occasion !== "All")
        params.set("occasion", filters.occasion);
      if (filters?.fromDate) params.set("from_date", filters.fromDate);
      if (filters?.toDate) params.set("to_date", filters.toDate);
      if (filters?.search) params.set("search", filters.search);
      if (filters?.periodSearch)
        params.set("period_search", filters.periodSearch);
      if (filters?.occasionSearch)
        params.set("occasion_search", filters.occasionSearch);
      if (filters?.startDateSearch)
        params.set("start_date_search", filters.startDateSearch);
      if (filters?.stopDateSearch)
        params.set("stop_date_search", filters.stopDateSearch);
      const query = params.toString();
      const qs = query ? `?${query}` : "";
      return await firstValueFrom(
        this.get<MaintenancePeriodRow[]>(
          `api/v1/dart/maintenance_periods/${qs}`,
        ),
      );
    } catch (error) {
      console.error("Error fetching maintenance periods", error);
      return [];
    }
  }

  async getOpmOverviewDashboard(params: {
    period?: OpmDashboardPeriod;
    department?: string;
    activityPeriod?: OpmDashboardActivityPeriod;
  }): Promise<OpmDashboardData> {
    const query = new URLSearchParams();
    if (params.period) query.set("period", params.period);
    if (params.department) query.set("department", params.department);
    if (params.activityPeriod)
      query.set("activity_period", params.activityPeriod);
    const qs = query.toString();
    const url = qs ? `api/v1/dart/dashboard/?${qs}` : "api/v1/dart/dashboard/";
    const res = await firstValueFrom(this.get<OpmDashboardResponse>(url));
    return res.data;
  }
  // new defect api's call
  getStaticDropdownDataDefect(): Observable<any> {
    return this.http.get(`${this.baseUrl}api/v1/defect/get-dropdowns/`);
  }
  getEquipmentdropdown(): Observable<any> {
    return this.http.get(
      `${this.baseUrl}api/v1/defect/ship-equipment-dropdown/`,
    );
  }
  getNomenclatureByCode(code: number): Observable<any> {
    return this.http.get(
      `${this.baseUrl}api/v1/defect/get-equipment-nomenclature/?code=${code}`,
    );
  }
  getNomenclatureDetailByID(id: number): Observable<any> {
    return this.http.get(
      `${this.baseUrl}api/v1/defect/get-nomenclature-details/?nomenclature=${id}`,
    );
  }
  getSeverity(): Observable<any> {
    return this.http.get(`${this.baseUrl}api/v1/defect/get-severity/`);
  }
  getTrialAgency(): Observable<any> {
    return this.http.get(`${this.baseUrl}api/v1/defect/get-trial-agencies/`);
  }
  getEquipmentStatus(): Observable<any> {
    return this.http.get(`${this.baseUrl}api/v1/defect/get-equipment-status/`);
  }
  getOem(): Observable<any> {
    return this.http.get(`${this.baseUrl}api/v1/defect/get-oem/`);
  }
  getSupplier(): Observable<any> {
    return this.http.get(`${this.baseUrl}api/v1/defect/get-supplier/`);
  }
  addDefect(payload: any) {
    return this.http.post(`${this.baseUrl}api/v1/defect/add-defect/`, payload);
  }

  // new apis
  getShipRemarks() {
    return this.http.get(`${this.baseUrl}api/v1/defect/get-ship-remarks-by/`);
  }
  getShipEquipment() {
    return this.http.get(
      `${this.baseUrl}api/v1/defect/ship-equipment-dropdown/`,
    );
  }
  getShipSymptoms() {
    return this.http.get(`${this.baseUrl}api/v1/defect/get-symptoms/`);
  }
  getShipEquipmentStatus() {
    return this.http.get(`${this.baseUrl}api/v1/defect/get-equipment-status/`);
  }
  getRowDataDefect(page: number, size: number) {
    return this.http.get(
      `${this.baseUrl}api/v1/defect/list-defects/?page=${page}&page_size=${size}`,
    );
  }
  getDefectDetail(id: number) {
    return this.http.get(
      `${this.baseUrl}api/v1/defect/defects/detail_by_id/${id}/`,
    );
  }
}
