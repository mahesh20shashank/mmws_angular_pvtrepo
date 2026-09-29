import { HttpClient } from "@angular/common/http";
import { skipFeedback } from "../../../../Core/http/services/http-feedback";
import { Injectable, inject } from "@angular/core";
import { resolveCmmsApiUrl } from "../../../../../environments/api-url";
import { LandingPageService } from "../../../../Modules/landing/services/landing-page.service";
import { catchError, Observable, of } from "rxjs";
import {
  SrarLookupRecord,
  SrarRoutineHourOption,
  SrarRecord,
  SrarReportDetail,
  SrarAnalyticsKpis,
  SrarAnalyticsMonthlyTrendItem,
  SrarAnalyticsMonthlyTrendResponse,
  SrarAnalyticsYearlyStatusItem,
  SrarAnalyticsYearlyStatusResponse,
  SrarAnalyticsDashboardSummary,
  SrarApiResponse,
  SrarMasterItem,
  EquipmentValidityItem,
  SrarCarryForward,
  ExportSrarResponse,
  SrarExploitationKpis,
  SrarFuelTrendResponse,
  SrarDgufResponse,
  SrarRunningHoursEquipmentItem
} from "../models/srar.model";

// Re-export models for centralized access
export * from "../models/srar.model";

interface SrarCmmsSyncResponse {
  status?: boolean | string;
  message?: string;
  [key: string]: unknown;
}

interface SrarMasterEquipmentOnly extends SrarLookupRecord {
  equipment_type_id?: number | string;
  equipment_desc?: string;
  srar_txt?: string;
  srar_type?: string;
  equipment_category_code?: string;
  [key: string]: unknown;
}

@Injectable({
  providedIn: "root",
})
export class SrarService {
  private readonly http = inject(HttpClient);
  private readonly landing = inject(LandingPageService);

  private readonly baseUrl = resolveCmmsApiUrl() + "api/v1/srar/";

  // Fetch dashboard summary list of reports
  getDashboard(): Observable<SrarRecord[]> {
    return this.http.get<SrarRecord[]>(`${this.baseUrl}dashboard/`).pipe(
      catchError(() => of([]))
    );
  }

  // Get full nested details of a report for editing / modal view
  getReportDetails(headerId: number): Observable<SrarReportDetail> {
    return this.http.get<SrarReportDetail>(`${this.baseUrl}report/edit/${headerId}/`);
  }

  // Get carry-forward values (fuel/AVCAT balance, R/H since installation) from the
  // previous month's SRAR for a ship, matched per-equipment by eqpt_code/eqpt_name
  getCarryForward(shipId: number | null | undefined, month: number, year: number): Observable<SrarCarryForward> {
    const shipParam = shipId ? `ship=${shipId}&` : "";
    const params = `${shipParam}month=${month}&year=${year}`;
    return this.http.get<SrarCarryForward>(`${this.baseUrl}report/carry-forward/?${params}`).pipe(
      catchError(() => of(this.getEmptyCarryForward()))
    );
  }

  private getEmptyCarryForward(): SrarCarryForward {
    return {
      fuel_balance_last_month: 0,
      avcat_balance_last_month: 0,
      since_commissioning_hours_last_month_hr: 0,
      since_commissioning_hours_last_month_min: 0,
      since_commissioning_distance_last_month: 0,
      equipment_hours: [],
      injector_fip: [],
      safety_device_checks: [],
      gas_turbine: [],
      reduction_gear: [],
      diesel_reduction_gear: [],
      gtg: [],
      gtg_reduction_gear: [],
      fpt_main_engine: null,
      rh_extensions: []
    };
  }

  // Save the entire report and all tabs using the composite save view
  /**
   * Saves the whole SRAR return.
   *
   * Opts out of feedbackInterceptor's automatic toast: the callers already raise their own
   * message (openAlert on final submit, a toast on draft save), and leaving the interceptor
   * on meant every save produced two notifications for the same event.
   */
  /** Ship-life exploitation KPIs: hours underway, distance run, days at sea/harbour. */
  getExploitationKpis(): Observable<SrarExploitationKpis | null> {
    return this.http
      .get<SrarExploitationKpis>(`${this.baseUrl}analytics/exploitation/`)
      .pipe(catchError(() => of(null)));
  }

  /** Monthly fuel consumption split by harbour / anchorage / at sea. */
  getFuelTrend(year?: number | null): Observable<SrarFuelTrendResponse | null> {
    const url = year
      ? `${this.baseUrl}analytics/fuel-trend/?year=${year}`
      : `${this.baseUrl}analytics/fuel-trend/`;
    return this.http.get<SrarFuelTrendResponse>(url).pipe(catchError(() => of(null)));
  }

  /** Per-diesel-alternator running hours, split sea/anchorage vs port. */
  getDgufChart(year?: number | null): Observable<SrarDgufResponse | null> {
    const url = year
      ? `${this.baseUrl}analytics/dguf/?year=${year}`
      : `${this.baseUrl}analytics/dguf/`;
    return this.http.get<SrarDgufResponse>(url).pipe(catchError(() => of(null)));
  }

  saveCompositeSrar(payload: Record<string, unknown>): Observable<SrarApiResponse> {
    return this.http.post<SrarApiResponse>(`${this.baseUrl}report/save/`, payload, {
      context: skipFeedback({ toast: true }),
    });
  }

  // Save a specific step tab number
  saveTab(tabNumber: number, payload: Record<string, unknown>): Observable<SrarApiResponse> {
    return this.http.post<SrarApiResponse>(`${this.baseUrl}tab/${tabNumber}/save/`, payload);
  }

  // Finalize/approve the report
  finalizeReport(srarId: number, payload: Record<string, unknown>): Observable<SrarApiResponse> {
    return this.http.post<SrarApiResponse>(`${this.baseUrl}report/finalize/${srarId}/`, payload);
  }

  /**
   * Pushes one approved monthly return from SWMM up into CMMS — and only that.
   *
   * `mode=push` is what pins the direction. Without it the endpoint picks a direction
   * from the header's cmms_sync_status, and a return the CO has just approved is by
   * definition not yet synced, so it took the first-time PULL branch instead: CMMS
   * overwriting SWMM, then marking the header synced with nothing pushed.
   *
   * Distinct from `streamSyncSrarWithCmms` below, which is the opposite direction (the
   * long CMMS → SWMM import behind the 5-step progress popup).
   *
   * Replaces the former `syncSrarToCmms(id)`, which was never called from anywhere:
   * `srar_sync/<pk>/` takes a *signed* pk and its view ends in a Django `redirect()`
   * with sweetify messages, so it cannot serve an Angular caller at all.
   */
  pushSrarToCmms(month: string | number, year: number): Observable<SrarApiResponse> {
    const pushUrl = `${resolveCmmsApiUrl()}api/v1/swmmapi/srar_api/srar_sync_by_month_year/`;
    return this.http.get<SrarApiResponse>(
      `${pushUrl}?month=${encodeURIComponent(String(month))}&year=${year}&mode=push`
    );
  }

  // Export SRAR report ACCDB file using /api/v1/srar/report/export/{headerId}/
  exportSrarReport(headerId: number | string): Observable<ExportSrarResponse> {
    return this.http.get<ExportSrarResponse>(`${this.baseUrl}report/export/${headerId}/`);
  }

  private getFullUrl(url: string): string {
    if (url.startsWith("http")) {
      return url;
    }
    const apiBase = resolveCmmsApiUrl().replace(/\/$/, "");
    const prefix = url.startsWith("/") ? "" : "/";
    return `${apiBase}${prefix}${url}`;
  }

  // Fetch exported file blob directly for browser downloading
  downloadFileBlob(downloadUrl: string): Observable<Blob> {
    return this.http.get(this.getFullUrl(downloadUrl), { responseType: "blob" });
  }

  getExportTaskStatus(taskStatusUrl: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(this.getFullUrl(taskStatusUrl));
  }

  // Fetch exported JSON file data
  fetchFileJson<T = Record<string, unknown>>(downloadUrl: string): Observable<T> {
    return this.http.get<T>(this.getFullUrl(downloadUrl));
  }

  // Streams SRAR "Sync With CMMS" progress — the pull covers this ship's whole SRAR
  // history in one long-running request, so the backend (SRARPullFromCMMSAPIView)
  // returns a StreamingHttpResponse of tagged log lines ([STEP n/5], [OK], [NEW],
  // [EXISTING], [SKIPPED], [FATAL], [Completed]) instead of one JSON body at the end,
  // matching the fetch+reader pattern SfdReferencesApiService.streamSync already
  // uses for the SFD sync wizard. `onChunk` is invoked with each raw chunk as it
  // arrives; the caller splits it into lines and classifies the tags.
  async streamSyncSrarWithCmms(
    month: string, year: number, onChunk: (chunk: string) => void
  ): Promise<void> {
    const token = this.landing.accessToken();
    const swmmApiUrl = `${resolveCmmsApiUrl()}api/v1/swmmapi/srar_api/srar_pull_from_cmms/`;
    const response = await fetch(
      `${swmmApiUrl}?month=${encodeURIComponent(month)}&year=${year}`,
      {
        method: "GET",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => "");
      let parsedErr = "";
      try {
        const json = JSON.parse(errText) as { error?: string; message?: string };
        parsedErr = json.error || json.message || errText;
      } catch {
        parsedErr = errText;
      }
      throw new Error(parsedErr ? parsedErr.trim() : `Request failed with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  }

  // Sync only Ch_Master_Equipment_Type from CMMS into SRAR/SFD/SWMM master equipment tables
  syncChMasterEquipmentType(): Observable<SrarCmmsSyncResponse> {
    const swmmApiUrl = `${resolveCmmsApiUrl()}api/v1/swmmapi/sfd/ch-master-equipment-type/sync/`;
    return this.http.get<SrarCmmsSyncResponse>(swmmApiUrl);
  }

  // CMMS-backed "Conducted By" options (Ch_Master_Full_Power_Conducted_By)
  getConductedByOptions(): Observable<{ id: string; label: string; value: string }[]> {
    return this.http.get<{ id: string; label: string; value: string }[]>(`${this.baseUrl}master/full-power-conducted-by/`).pipe(
      catchError(() => of([]))
    );
  }

  // CMMS-backed Lubricant picker (M_Lubricant) — name + unit
  getCmmsLubricants(): Observable<{ id: string; label: string; value: string; name: string; unit: string; type: string }[]> {
    return this.http.get<{ id: string; label: string; value: string; name: string; unit: string; type: string }[]>(`${this.baseUrl}master/cmms-lubricants/`).pipe(
      catchError(() => of([]))
    );
  }

  // CMMS-backed "Designed EEF" value for the ship's class (M_ShipClassEEF)
  /** DGUF comment master from CMMS `DgufComment` — the Shore Supply Remarks picker. */
  getDgufComments(): Observable<{ id: number; label: string; value: string }[]> {
    return this.http.get<{ id: number; label: string; value: string }[]>(`${this.baseUrl}master/dguf-comments/`).pipe(
      catchError(() => of([]))
    );
  }

  getEefDesignedValue(): Observable<{ designed_eef: number | null }> {
    return this.http.get<{ designed_eef: number | null }>(`${this.baseUrl}master/eef-designed-value/`).pipe(
      catchError(() => of({ designed_eef: null }))
    );
  }

  // Real ShipEquipment instances for Form 1: equipment an admin has linked via the
  // "Add SRAR Equipment" screen (master/equipments/) under one of Form 1's allowed
  // Ch_Master_Equipment_Type categories (FORM1_EQUIPMENT_TYPE_UIDS on the backend).
  getRunningHoursEquipment(): Observable<SrarRunningHoursEquipmentItem[]> {
    return this.http
      .get<SrarRunningHoursEquipmentItem[]>(`${this.baseUrl}master/running-hours-equipment/`)
      .pipe(catchError(() => of([])));
  }

  // Real ShipEquipment instances for one Ch_Master_Equipment_Type category — the
  // second picker in the "Add SRAR Equipment" modal, once a category is chosen.
  getSfdEquipmentByType(universalIdChMasterEquipmentType: string): Observable<SrarRunningHoursEquipmentItem[]> {
    const params = new URLSearchParams({
      universal_id_ch_master_equipment_type: universalIdChMasterEquipmentType,
    });
    return this.http
      .get<SrarRunningHoursEquipmentItem[]>(`${this.baseUrl}master/sfd-equipment-by-type/?${params.toString()}`)
      .pipe(catchError(() => of([])));
  }

  // Master Equipment metadata lookup
  getEquipments(srarType?: string, universalIds?: readonly string[]): Observable<SrarLookupRecord[]> {
    const params = new URLSearchParams();
    if (srarType) {
      params.set("srar_type", srarType);
    }
    if (universalIds?.length) {
      params.set("universal_ids", universalIds.join(","));
    }
    const query = params.toString();
    const url = query
      ? `${this.baseUrl}master/equipments/?${query}`
      : `${this.baseUrl}master/equipments/`;
    return this.http.get<SrarLookupRecord[]>(url);
  }

  // Ship States master metadata lookup
  getShipStates(): Observable<SrarLookupRecord[]> {
    return this.http.get<SrarLookupRecord[]>(`${this.baseUrl}master/ship-states/`);
  }

  /** "On Routine" choices for Step 13 — the hour-based Frequency master rows, already
   *  what RHExtension.on_routine is a foreign key to. */
  /** "On Routine" choices for ONE equipment — only the routines attached to it.
   *  `fallback: true` means the equipment has none, and the whole master came back. */
  getEquipmentRoutines(
    equipmentId: number
  ): Observable<{ options: SrarRoutineHourOption[]; fallback: boolean }> {
    return this.http
      .get<{ options: SrarRoutineHourOption[]; fallback: boolean }>(
        `${this.baseUrl}master/equipment-routines/?equipment=${equipmentId}`
      )
      .pipe(catchError(() => of({ options: [], fallback: true })));
  }

  getRoutineHours(): Observable<SrarRoutineHourOption[]> {
    return this.http.get<SrarRoutineHourOption[]>(`${this.baseUrl}master/routine-hours/`);
  }

  // Ship Locations master metadata lookup
  getShipLocations(): Observable<SrarLookupRecord[]> {
    return this.http.get<SrarLookupRecord[]>(`${this.baseUrl}master/ship-locations/`);
  }

  // Activity Types master metadata lookup
  getActivityTypes(): Observable<SrarLookupRecord[]> {
    return this.http.get<SrarLookupRecord[]>(`${this.baseUrl}master/activity-types/`).pipe(
      catchError(() => of([]))
    );
  }


  // Ship Activity Details master metadata lookup
  getActivityDetails(): Observable<SrarLookupRecord[]> {
    return this.http.get<SrarLookupRecord[]>(`${this.baseUrl}master/activity-details/`);
  }

  // Lubricant Units master metadata lookup
  getLubricantUnits(): Observable<SrarLookupRecord[]> {
    return this.http.get<SrarLookupRecord[]>(`${this.baseUrl}master/lubricant-units/`);
  }

  // EEF Reasons master metadata lookup
  getEefReasons(): Observable<SrarLookupRecord[]> {
    return this.http.get<SrarLookupRecord[]>(`${this.baseUrl}master/eef-reasons/`);
  }

  // All Dropdowns master consolidated lookup
  getAllDropdownOptions(): Observable<Record<string, SrarLookupRecord[]>> {
    return this.http.get<Record<string, SrarLookupRecord[]>>(`${this.baseUrl}master/dropdown-options/`);
  }

  // Analytics APIs (Dynamic Database Aggregations)
  getAnalyticsKpis(): Observable<SrarAnalyticsKpis> {
    return this.http.get<SrarAnalyticsKpis>(`${this.baseUrl}analytics/kpis/`);
  }

  getAnalyticsMonthlyTrend(): Observable<SrarAnalyticsMonthlyTrendResponse | SrarAnalyticsMonthlyTrendItem[]> {
    return this.http.get<SrarAnalyticsMonthlyTrendResponse | SrarAnalyticsMonthlyTrendItem[]>(`${this.baseUrl}analytics/monthly-trend/`);
  }

  getAnalyticsYearlyStatus(): Observable<SrarAnalyticsYearlyStatusResponse | SrarAnalyticsYearlyStatusItem[]> {
    return this.http.get<SrarAnalyticsYearlyStatusResponse | SrarAnalyticsYearlyStatusItem[]>(`${this.baseUrl}analytics/yearly-status/`);
  }

  getAnalyticsDashboardSummary(): Observable<SrarAnalyticsDashboardSummary> {
    return this.http.get<SrarAnalyticsDashboardSummary>(`${this.baseUrl}analytics/dashboard-summary/`);
  }

  // Fetch historical / archived SRAR reports list
  getHistoryLogs(): Observable<SrarRecord[]> {
    return this.http.get<SrarRecord[]>(`${this.baseUrl}history/`);
  }

  // Delete an archived SRAR history entry (header) and all its related tab records (DB cascade)
  deleteHistoryRecord(id: string | number): Observable<SrarApiResponse> {
    return this.http.delete<SrarApiResponse>(`${this.baseUrl}crud/headers/${id}/`);
  }

  // Fetch Master Equipment items list
  getMasterEquipments(): Observable<SrarMasterItem[]> {
    return this.http.get<SrarMasterItem[]>(`${this.baseUrl}master/equipments-list/`);
  }

  // Fetch raw srar_masterequipment rows (CMMS master equipment types only)
  getMasterEquipmentsOnly(): Observable<SrarMasterEquipmentOnly[]> {
    return this.http.get<SrarMasterEquipmentOnly[]>(`${this.baseUrl}master/srar_master_equipments_only/`).pipe(
      catchError(() => of([]))
    );
  }

  // Fetch Equipment Validity items list
  getEquipmentValidityList(): Observable<EquipmentValidityItem[]> {
    return this.http.get<EquipmentValidityItem[]>(`${this.baseUrl}master/validity-list/`);
  }

  // Add new Master Equipment item
  addMasterEquipment(payload: Record<string, unknown>): Observable<SrarApiResponse<SrarMasterItem>> {
    return this.http.post<SrarApiResponse<SrarMasterItem>>(`${this.baseUrl}master/equipments/add/`, payload);
  }

  // Delete Master Equipment item
  deleteMasterEquipment(id: string): Observable<SrarApiResponse> {
    return this.http.delete<SrarApiResponse>(`${this.baseUrl}master/equipments/delete/${id}/`);
  }

  // Linked Equipments CRUD
  getLinkedEquipments(): Observable<Record<string, unknown>[]> {
    return this.http.get<Record<string, unknown>[]>(`${this.baseUrl}crud/linked-equipments/`);
  }

  addLinkedEquipment(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(`${this.baseUrl}crud/linked-equipments/`, payload);
  }

  // Equipment Type Lists CRUD
  getEquipmentTypeLists(): Observable<Record<string, unknown>[]> {
    return this.http.get<Record<string, unknown>[]>(`${this.baseUrl}crud/equipment-type-lists/`);
  }

  addEquipmentTypeList(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(`${this.baseUrl}crud/equipment-type-lists/`, payload);
  }

  // Equipment Validities CRUD
  getEquipmentValidities(): Observable<Record<string, unknown>[]> {
    return this.http.get<Record<string, unknown>[]>(`${this.baseUrl}crud/equipment-validities/`);
  }

  addEquipmentValidity(payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(`${this.baseUrl}crud/equipment-validities/`, payload);
  }

  updateEquipmentValidity(id: number | string, payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.http.put<Record<string, unknown>>(`${this.baseUrl}crud/equipment-validities/${id}/`, payload);
  }
}
