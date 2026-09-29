import { HttpClient, HttpErrorResponse, HttpParams } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, combineLatest, forkJoin, of, throwError, timer } from "rxjs";
import { catchError, map, shareReplay, switchMap } from "rxjs/operators";

import { resolveCmmsApiUrl } from "../../../../../environments/api-url";
import { skipFeedback } from "../../../../Core/http/services/http-feedback";
import {
  ApprovalEntry,
  DropdownOptionDto,
  IifHistoryEntry,
  NormalDemandHistoryEntry,
  RioHistoryEntry,
  SignalDemandEntry,
  SignalDemandPayload,
  WedCartEntry,
  WedDashboardCounts,
  WedImportKind,
  WedImportResult,
  WedImportRowError,
  WedItem,
} from "../models/wed.model";
import {
  BackendCombinedOutboxEntry,
  BackendCombinedOutboxResponse,
  BackendDemandDetailContext,
  BackendDemandEntry,
  BackendDemandPendingListResponse,
  BackendIifDetails,
  BackendInsmaEquipment,
  BackendPendingDemand,
  BackendPendingPts,
  BackendPendingSurvey,
  BackendPtsEntry,
  BackendPtsDetailContext,
  BackendPtsPendingListResponse,
  BackendRaisedSurveyPendingResponse,
  BackendRaisedSurveyPendingRow,
  BackendReceiveQueueDemand,
  BackendShip,
  BackendSignalDemand,
  BackendSpareDataMap,
  BackendSurveyPendingListResponse,
  BackendWedExternalSyncResponse,
  BackendWedIif,
  BackendWedImportEnvelope,
  BackendWedImportTaskStatus,
  BackendWlmsDashboard,
  BackendWlmsEquipment,
  BackendWlmsSpare,
  BackendWlmsSyncResponse,
  ObsEquipmentClassLookup,
  ObsSpareLookup,
} from "../models/wlms-backend.model";

export type WedCartKind = "survey" | "pts" | "demand" | "receive" | "pts-rio-pending" | "iif";

interface WedLookups {
  equipment: Map<number, BackendWlmsEquipment>;
  spares: Map<number, BackendWlmsSpare>;
  obsSpares: Map<number, ObsSpareLookup>;
  obsEquipmentClasses: Map<number, ObsEquipmentClassLookup>;
}

interface ResolvedItemFields {
  itemCode: string;
  itemDescription: string;
  denomination: string;
  category: string;
}

type PendingRow = BackendPendingSurvey | BackendPendingPts | BackendPendingDemand;

/** Maps a combined-outbox row's `spare_cart_name` ("Survey"/"PTS"/"Demand"/"IIF" — set either by
 * the workflow model's own field or, for IIF, forced by `wlms_combined_outbox` itself) to the
 * router prefix `wlms/urls.py` registers its viewset under. */
const WORKFLOW_URL_SEGMENT: Record<string, string> = {
  Survey: "survey-receipts",
  PTS: "pts-demands",
  Demand: "demands",
  IIF: "wediif",
};

/**
 * Shore Inventory - WED API — talks to `backend/wlms` (`api/v1/wlms/...`), with a couple of
 * cross-app lookups against `backend/obs` (`api/v1/onboard-spares/...`) since Survey/PTS/Demand/
 * IIF entries can originate from either a WED-side `WLMSSpare` or an onboard `obs.Spares` row.
 *
 * Like `ObsApiService`, backend serializers here are id-only / snake_case; every method joins
 * the raw response against cached lookups (`lookups$`) before returning the camelCase UI DTOs
 * from `../models/wed.model.ts`. A few methods have no working backend endpoint yet (`BACKEND
 * GAP` comments) and fail loudly via `throwError` (or return `[]` for read endpoints).
 *
 * Every path below was re-verified directly against the current `swmm/wlms/views/*.py` /
 * `swmm/wlms/urls.py` — the router-registered `survey-receipts/`, `pts-demands/`, `demands/`,
 * `wediif/`, `equipment/`, `spares/`, `spare-data-maps/`, `signal-demands/` prefixes with
 * `ApprovalWorkflowMixin`'s shared action vocabulary (`bulk-send-for-approval/`, `{id}/approve/`,
 * `{id}/mark-synced/`, `inbox/`, `outbox/`). Earlier versions of this file called a
 * since-removed flat URL scheme (`wlmssurveylist/`, `survey_send_hod_approval/`, `wlmsmaster/`,
 * `itemsearchwlms/`, ...) that no longer exists on this backend.
 */
@Injectable({ providedIn: "root" })
export class WedApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${resolveCmmsApiUrl()}api/v1/wlms/`;
  private readonly obsBaseUrl = `${resolveCmmsApiUrl()}api/v1/onboard-spares/`;

  private readonly wlmsEquipmentById$ = this.http.get<BackendWlmsEquipment[]>(`${this.baseUrl}equipment/`).pipe(
    map((rows) => new Map(rows.map((row) => [row.id, row]))),
    shareReplay(1),
  );

  private readonly wlmsSparesById$ = this.http.get<BackendWlmsSpare[]>(`${this.baseUrl}spares/`).pipe(
    map((rows) => new Map(rows.map((row) => [row.id, row]))),
    shareReplay(1),
  );

  private readonly obsSparesById$ = this.http.get<ObsSpareLookup[]>(`${this.obsBaseUrl}spares/`).pipe(
    map((rows) => new Map(rows.map((row) => [row.id, row]))),
    shareReplay(1),
  );

  private readonly obsEquipmentClassById$ = this.http
    .get<ObsEquipmentClassLookup[]>(`${this.obsBaseUrl}equipment_class/`)
    .pipe(
      map((rows) => new Map(rows.map((row) => [row.id, row]))),
      shareReplay(1),
    );

  /** `master.Ship` — shared master data, not a `wlms` endpoint, so it's kept out of `WedLookups`/
   * `lookups$` (used only by Signal Demand) rather than widening that combined stream and every
   * one of its existing callers for a lookup they don't need. */
  private readonly shipsById$ = this.http.get<BackendShip[]>(`${resolveCmmsApiUrl()}api/v1/master/ships/`).pipe(
    map((rows) => new Map(rows.map((row) => [row.id, row]))),
    shareReplay(1),
  );

  private readonly lookups$: Observable<WedLookups> = combineLatest([
    this.wlmsEquipmentById$,
    this.wlmsSparesById$,
    this.obsSparesById$,
    this.obsEquipmentClassById$,
  ]).pipe(
    map(([equipment, spares, obsSpares, obsEquipmentClasses]) => ({
      equipment,
      spares,
      obsSpares,
      obsEquipmentClasses,
    })),
    shareReplay(1),
  );

  // ---------------------------------------------------------------------------------------
  // Item search
  // ---------------------------------------------------------------------------------------

  getItems(): Observable<WedItem[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        this.http
          .get<BackendWlmsSpare[]>(`${this.baseUrl}spares/`)
          .pipe(map((rows) => rows.map((row) => this.adaptWedItem(row, lookups)))),
      ),
    );
  }

  // ---------------------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------------------

  /** `surveyInProgress`/`demandInProgress`/`ptsDemandInProgress` come from `spares/dashboard/`'s
   * own aggregation, which really does match what `survey-receipts/`/`demands/`/`pts-demands/`'s
   * `pending-list/` (the grids these tiles link to) return — same department + equipment-class
   * scoping on both sides. `outstandingDemands` and `iifInProgress` do NOT match `dashboard()`'s
   * own `outstanding_demand_count`/`pending_iif` counts (different filter criteria — see
   * `WLMSSpareViewSet.dashboard`), so both are sourced directly from the same endpoint their
   * "View more" grid uses instead of a separately (and differently) filtered count:
   * - Receive/"Outstanding Demands": `demands/receive-queue/` — the same list `getReceiveCart()`
   *   reads.
   * - IIF: `wediif/` (the plain list) lists every cart entry regardless of sync/delete status —
   *   filtered client-side to `!is_delete`, matching `getIifCart()`'s own filtering below (WLMS's
   *   `WEDIIFViewSet`, unlike ILMS's `IIFViewSet`, doesn't filter `is_delete` on its `list`
   *   action itself). */
  getDashboardCounts(): Observable<WedDashboardCounts> {
    return forkJoin({
      dashboard: this.http.get<BackendWlmsDashboard>(`${this.baseUrl}spares/dashboard/`),
      outstandingDemands: this.http.get<BackendReceiveQueueDemand[]>(`${this.baseUrl}demands/receive-queue/`),
      iifInProgress: this.http.get<BackendWedIif[]>(`${this.baseUrl}wediif/`),
      ptsRioSurveyPending: this.http.get<BackendRaisedSurveyPendingResponse>(`${this.baseUrl}pts-demands/raised-survey-pending/`),
    }).pipe(
      map(({ dashboard, outstandingDemands, iifInProgress, ptsRioSurveyPending }) => ({
        surveyInProgress: dashboard.pending_surveys,
        demandInProgress: dashboard.pending_demands,
        ptsDemandInProgress: dashboard.pending_pts,
        outstandingDemands: outstandingDemands.length,
        iifInProgress: iifInProgress.filter((row) => !row.is_delete).length,
        ptsRioSurveyPending: ptsRioSurveyPending.data.length,
      })),
    );
  }

  // ---------------------------------------------------------------------------------------
  // Spares Transaction Carts (Survey / PTS / Demand / Receive / IIF / PTS-RIO-Pending)
  // ---------------------------------------------------------------------------------------

  getCart(kind: WedCartKind): Observable<WedCartEntry[]> {
    switch (kind) {
      case "survey":
        return this.getSurveyCart();
      case "pts":
        return this.getPtsCart();
      case "pts-rio-pending":
        return this.getRaisedSurveyPendingCart();
      case "demand":
        return this.getDemandCart();
      case "receive":
        return this.getReceiveCart();
      case "iif":
        return this.getIifCart();
    }
  }

  private getSurveyCart(): Observable<WedCartEntry[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        this.http.get<BackendSurveyPendingListResponse>(`${this.baseUrl}survey-receipts/pending-list/`).pipe(
          map((response) => response.pending_surveys.map((row) => this.adaptPendingEntry(row, lookups))),
        ),
      ),
    );
  }

  private getPtsCart(): Observable<WedCartEntry[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        this.http.get<BackendPtsPendingListResponse>(`${this.baseUrl}pts-demands/pending-list/`).pipe(
          map((response) => response.pending_pts.map((row) => this.adaptPendingEntry(row, lookups))),
        ),
      ),
    );
  }

  /** `pts-demands/raised-survey-pending/` (`PTSDemandDetailsViewSet.raised_survey_pending`) is a
   * genuinely distinct, filtered view — approved PTS entries with no matching synced-and-approved
   * bridged Survey — not an alias of the plain PTS pending-list. Its own annotation set
   * (`demand_qty_resolved`/`receipt_status`/`received_qty`) differs from the standard pending-list
   * one, so it gets its own adapter rather than reusing `adaptPendingEntry`. */
  private getRaisedSurveyPendingCart(): Observable<WedCartEntry[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        this.http.get<BackendRaisedSurveyPendingResponse>(`${this.baseUrl}pts-demands/raised-survey-pending/`).pipe(
          map((response) => response.data.map((row) => this.adaptRaisedSurveyPendingEntry(row, lookups))),
        ),
      ),
    );
  }

  private getDemandCart(): Observable<WedCartEntry[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        this.http.get<BackendDemandPendingListResponse>(`${this.baseUrl}demands/pending-list/`).pipe(
          map((response) => response.pending_demands.map((row) => this.adaptPendingEntry(row, lookups))),
        ),
      ),
    );
  }

  private getIifCart(): Observable<WedCartEntry[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        this.http
          .get<BackendWedIif[]>(`${this.baseUrl}wediif/`)
          // `wediif/`'s plain list carries every row ever created (unlike ILMS's `iif/`, it isn't
          // filtered to `is_delete=False` server-side) — excluded client-side so already
          // synced-and-removed entries don't reappear in the cart.
          .pipe(map((rows) => rows.filter((row) => !row.is_delete).map((row) => this.adaptIifCartEntry(row, lookups)))),
      ),
    );
  }

  /** `demands/receive-queue/` (`DemandDetailsViewSet.receive_queue`) — WLMS `DemandDetails` rows
   * that carry a `demand_no` and have no `received` receipt against them yet. Unlike the old
   * `wlmsreceivelist/` this replaces, it is NOT a merged Demand+PTS view (no equivalent action
   * exists on `PTSDemandDetailsViewSet`), and it carries none of the dart/equipment-nomenclature
   * annotations a `pending-list/` response has — both are real, current backend limitations,
   * not something this method works around. */
  private getReceiveCart(): Observable<WedCartEntry[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        this.http
          .get<BackendReceiveQueueDemand[]>(`${this.baseUrl}demands/receive-queue/`)
          .pipe(map((rows) => rows.map((row) => this.adaptReceiveQueueEntry(row, lookups)))),
      ),
    );
  }

  /** Uses `skipFeedback({ toast: true })` — `cart-list.ts`'s `sendForHodApproval()` (the only
   * caller) already shows its own "Sent for HOD approval." toast on success. */
  sendCartForHodApproval(kind: WedCartKind, ids: string[]): Observable<void> {
    const body = { ids: ids.map(Number) };
    const options = { context: skipFeedback({ toast: true }) };
    switch (kind) {
      case "survey":
        return this.http
          .post(`${this.baseUrl}survey-receipts/bulk-send-for-approval/`, body, options)
          .pipe(map(() => void 0));
      case "pts":
      case "pts-rio-pending":
        return this.http
          .post(`${this.baseUrl}pts-demands/bulk-send-for-approval/`, body, options)
          .pipe(map(() => void 0));
      case "demand":
        return this.http
          .post(`${this.baseUrl}demands/bulk-send-for-approval/`, body, options)
          .pipe(map(() => void 0));
      case "iif":
        // `WEDIIFViewSet` is in the shared `ApprovalWorkflowMixin` group (unlike ILMS's `IIFViewSet`,
        // which defines its own bespoke bulk-send-for-approval) — the standard bulk action applies.
        return this.http
          .post(`${this.baseUrl}wediif/bulk-send-for-approval/`, body, options)
          .pipe(map(() => void 0));
      case "receive":
        return throwError(() => new Error("The Receive cart has no HOD approval step."));
    }
  }

  /** No per-kind selection exists for this action — `send-common-api/` marks every
   * approved-but-unsynced Survey/PTS/Demand/IIF entry (department-scoped) as synced locally in
   * one call, regardless of which cart tab the button was clicked from. Uses
   * `skipFeedback({ toast: true })` — `cart-list.ts`'s `sync()` (the only caller) already shows
   * its own "Sync complete — N record(s) synced." toast on success. */
  syncCartWithWlms(_kind: WedCartKind): Observable<BackendWlmsSyncResponse> {
    return this.http.post<BackendWlmsSyncResponse>(
      `${this.baseUrl}send-common-api/`,
      {},
      { context: skipFeedback({ toast: true }) },
    );
  }

  /** Uses `skipFeedback({ toast: true })` — `cart-list.ts`'s `raise()` (the only caller) already
   * shows its own "IIF raised." toast on success. Same `wediif/bulk-send-for-approval/` action
   * `sendCartForHodApproval`'s "iif" case uses — "Raise IIF" is this cart's own label for sending
   * its entries for HOD approval, not a different operation. */
  raiseIif(kind: WedCartKind, ids: string[]): Observable<void> {
    if (kind !== "iif" || !ids.length) {
      return throwError(() => new Error(`Raising an IIF from the "${kind}" cart is not supported.`));
    }
    return this.http
      .post(`${this.baseUrl}wediif/bulk-send-for-approval/`, { ids: ids.map(Number) }, { context: skipFeedback({ toast: true }) })
      .pipe(map(() => void 0));
  }

  /** Reference: `wlms_surveylist.html`'s "EDPS" button. Backend: `SurveyReceiptsDetailsViewSet.edps_pdf`
   * — WeasyPrint-rendered "EDPS-3 Return Note" PDF for the given survey rows. */
  downloadEdpsPdf(surveyIds: string[]): Observable<Blob> {
    const params = new HttpParams().set("survey_pks", surveyIds.join(","));
    return this.http.get(`${this.baseUrl}survey-receipts/edps-pdf/`, { params, responseType: "blob" });
  }

  // ---------------------------------------------------------------------------------------
  // HOD Approval (combined outbox — approved-awaiting-sync items across all 4 workflows)
  // ---------------------------------------------------------------------------------------

  getApprovalList(): Observable<ApprovalEntry[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        this.http
          .get<BackendCombinedOutboxResponse>(`${this.baseUrl}wlmsoutbox/`)
          .pipe(map((response) => response.pts_entries.map((row) => this.adaptApprovalEntry(row, lookups)))),
      ),
    );
  }

  /** Uses `skipFeedback({ toast: true })` — `approval.ts`'s `sendToWlms()` (the only caller)
   * already shows its own "Sent to WLMS." toast on success. */
  sendApprovalsToWlms(ids: string[]): Observable<void> {
    // `ApprovalEntry.id` is composite (`"<Kind>:<pk>"`, set in adaptApprovalEntry) because the
    // combined outbox merges 4 independently-numbered backend tables — the kind prefix is
    // required to call the correct table's mark-synced endpoint.
    const requests: Observable<unknown>[] = [];
    for (const compositeId of ids) {
      const [kind, pk] = compositeId.split(":");
      const segment = kind ? WORKFLOW_URL_SEGMENT[kind] : undefined;
      if (!segment || !pk) continue;
      requests.push(
        this.http.post(
          `${this.baseUrl}${segment}/${pk}/mark-synced/`,
          {},
          { context: skipFeedback({ toast: true }) },
        ),
      );
    }
    if (!requests.length) return of(void 0);
    return forkJoin(requests).pipe(map(() => void 0));
  }

  // ---------------------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------------------

  /** BACKEND GAP: `{demands|pts-demands}/pending-list/`/`pts-demands/raised-survey-pending/` are
   * the only real data sources — there's no dedicated "history" endpoint, so synced (`is_sync`)
   * rows from the plain, unfiltered list are used as the closest real history. Neither model
   * carries a survey/demand date field, so `surveyDate`/`demandDate`/`gatePassNo` can't be
   * populated from real data. */
  getNormalDemandHistory(): Observable<NormalDemandHistoryEntry[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        this.http.get<BackendDemandEntry[]>(`${this.baseUrl}demands/`).pipe(
          map((rows) => rows.filter((row) => row.is_sync).map((row) => this.adaptDemandHistory(row, lookups))),
        ),
      ),
    );
  }

  getPtsDemandHistory(): Observable<NormalDemandHistoryEntry[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        this.http.get<BackendPtsEntry[]>(`${this.baseUrl}pts-demands/`).pipe(
          map((rows) => rows.filter((row) => row.is_sync).map((row) => this.adaptDemandHistory(row, lookups))),
        ),
      ),
    );
  }

  /** No RIO-specific model, field, or endpoint exists anywhere in the wlms app — the closest real
   * data is the synced subset of `pts-demands/raised-survey-pending/`, the same PTS-derived "RIO"
   * set the Spares Transaction Cart's `pts-rio-pending` tab already draws its pending rows from.
   * This is an approximation (indistinguishable from plain PTS history by `is_sync` alone), not a
   * dedicated RIO history feed. */
  getRioDemandHistory(): Observable<RioHistoryEntry[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        this.http.get<BackendRaisedSurveyPendingResponse>(`${this.baseUrl}pts-demands/raised-survey-pending/`).pipe(
          map((response) =>
            response.data.filter((row) => row.is_sync).map((row) => this.adaptRioHistory(row, lookups)),
          ),
        ),
      ),
    );
  }

  /** `wediif/` has no dedicated `/history/` action (unlike ILMS's `iif/history/`) — the plain
   * list filtered client-side to `is_sync` is the closest real substitute; every synced WEDIIF
   * row also has `is_delete=True` (`mark_synced_sets_delete`), so this correctly excludes
   * everything still active in the cart. */
  getIifHistory(): Observable<IifHistoryEntry[]> {
    return this.obsSparesById$.pipe(
      switchMap((obsSparesById) =>
        this.http.get<BackendWedIif[]>(`${this.baseUrl}wediif/`).pipe(
          map((rows) =>
            rows.filter((row) => row.is_sync).map((row) => this.adaptIifHistoryEntry(row, obsSparesById)),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------------------
  // References > Masters — external WED sync
  //
  // Real, routed endpoints — but the external WED source they'd pull from isn't configured in
  // this deployment, so both always respond with `status: "warning"` and 0 created/updated
  // rather than 404ing or throwing.
  // ---------------------------------------------------------------------------------------

  /** Surfaced to the user as-is rather than swallowed. Uses `skipFeedback({ toast: true })` —
   * `wed-masters.ts`'s `syncEquipment()` (the only caller) already shows its own detailed
   * "Equipment synced..." toast on success. */
  syncEquipmentFromWed(): Observable<BackendWedExternalSyncResponse> {
    return this.http.post<BackendWedExternalSyncResponse>(
      `${this.baseUrl}sync-equipment-from-wed/`,
      {},
      { context: skipFeedback({ toast: true }) },
    );
  }

  /** Uses `skipFeedback({ toast: true })` — `wed-masters.ts`'s `syncSpares()` (the only caller)
   * already shows its own detailed "Spares synced..." toast on success. */
  syncSparesFromWed(): Observable<BackendWedExternalSyncResponse> {
    return this.http.post<BackendWedExternalSyncResponse>(
      `${this.baseUrl}sync-spares-from-wed/`,
      {},
      { context: skipFeedback({ toast: true }) },
    );
  }

  // ---------------------------------------------------------------------------------------
  // Excel import (Masters > Import Data) — mirrors `MoApiService.importExcel()` exactly, since
  // both sit on the same shared `ExcelImportExportMixin` (backend/{ilms,wlms}/excel.py).
  // `WedImportKind` ("equipment"/"spares") already matches `WLMSEquipmentViewSet`/
  // `WLMSSpareViewSet`'s own router prefixes, unlike MO's singular "item"/"vendor" — no
  // kind-to-segment mapping needed here.
  // ---------------------------------------------------------------------------------------

  /** `POST {equipment|spares}/import-excel/` (`ExcelImportExportMixin.import_excel`, shared by
   * `WLMSEquipmentViewSet`/`WLMSSpareViewSet`). All-or-nothing per file — a single invalid row
   * rejects the whole batch. Dispatches to Celery when a worker is available (`status:
   * "accepted"` + poll `task_status_url`); resolves inline otherwise, which is the common path in
   * dev. `dryRun` validates without saving. */
  importExcel(kind: WedImportKind, file: File, dryRun: boolean): Observable<WedImportResult> {
    const formData = new FormData();
    formData.append("file", file);
    if (dryRun) formData.append("dry_run", "1");
    return this.http
      .post<BackendWedImportEnvelope>(`${this.baseUrl}${kind}/import-excel/`, formData, {
        context: skipFeedback({ loader: true, toast: true }),
      })
      .pipe(
        switchMap((response) => this.resolveImportEnvelope(response)),
        catchError((error: unknown) => this.resolveImportError(error)),
      );
  }

  /** `GET {equipment|spares}/download-template/` — header-only `.xlsx` of the importable columns. */
  downloadImportTemplate(kind: WedImportKind): Observable<Blob> {
    return this.http.get(`${this.baseUrl}${kind}/download-template/`, { responseType: "blob" });
  }

  private resolveImportEnvelope(response: BackendWedImportEnvelope): Observable<WedImportResult> {
    if (response.status === "accepted" && response.task_status_url) {
      return this.pollImportTask(response.task_status_url, 0);
    }
    return of(this.adaptImportEnvelope(response));
  }

  private pollImportTask(taskStatusUrl: string, attempt: number): Observable<WedImportResult> {
    if (attempt >= 20) {
      return throwError(
        () => new Error("Import is taking longer than expected. Check back shortly and try again."),
      );
    }
    return timer(1500).pipe(
      switchMap(() => this.http.get<BackendWedImportTaskStatus>(this.absoluteUrl(taskStatusUrl))),
      switchMap((statusRes) => {
        const status = (statusRes.status || "").toUpperCase();
        if (status === "FAILURE") {
          return throwError(() => new Error("Import failed."));
        }
        if (statusRes.result) {
          return of(this.adaptImportEnvelope(statusRes.result));
        }
        return this.pollImportTask(taskStatusUrl, attempt + 1);
      }),
    );
  }

  private adaptImportEnvelope(response: BackendWedImportEnvelope): WedImportResult {
    const errors = (response.errors ?? []).map(
      (row): WedImportRowError => ({ row: row.row, errors: row.errors }),
    );
    return {
      status: response.dry_run ? "dry_run" : "imported",
      imported: response.imported ?? 0,
      validRows: response.dry_run ? (response.valid_rows ?? 0) : (response.imported ?? 0),
      invalidRows: response.invalid_rows ?? 0,
      errors,
      headerErrors: [],
      allowedColumns: [],
    };
  }

  /** `import_excel` rejects a whole file with three different 400 shapes (unsupported columns,
   * too many rows, or row-validation failures) — resolved into a `WedImportResult` here (not
   * re-thrown) so the caller can render all three the same way it renders success. A genuinely
   * unexpected error shape (network/500) still propagates. */
  private resolveImportError(error: unknown): Observable<WedImportResult> {
    if (!(error instanceof HttpErrorResponse) || typeof error.error !== "object" || error.error === null) {
      return throwError(() => error);
    }
    const body = error.error as BackendWedImportEnvelope;
    if (Array.isArray(body.headers)) {
      return of({
        status: "column_error",
        imported: 0,
        validRows: 0,
        invalidRows: 0,
        errors: [],
        headerErrors: body.headers,
        allowedColumns: body.allowed_columns ?? [],
      });
    }
    if (Array.isArray(body.file)) {
      return of({
        status: "row_limit_error",
        imported: 0,
        validRows: 0,
        invalidRows: 0,
        errors: [],
        headerErrors: body.file,
        allowedColumns: [],
      });
    }
    if (Array.isArray(body.errors)) {
      return of(this.adaptImportEnvelope(body));
    }
    return throwError(() => error);
  }

  private absoluteUrl(url: string): string {
    if (url.startsWith("http")) return url;
    const apiBase = resolveCmmsApiUrl().replace(/\/$/, "");
    return `${apiBase}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  /** "INSMA Equipment Name" dropdown — sourced from `sfd.ShipEquipment` (cross-app), via
   * `WLMSEquipmentViewSet.insma_equipment`. */
  getInsmaEquipmentOptions(): Observable<DropdownOptionDto[]> {
    return this.http
      .get<BackendInsmaEquipment[]>(`${this.baseUrl}equipment/insma-equipment/`)
      .pipe(map((rows) => rows.map((row) => ({ value: String(row.id), label: row.name }))));
  }

  /** "WED Equipment Name" dropdown — only `WLMSEquipment` rows not already in `SpareDataMap`
   * (`WLMSEquipmentViewSet.unmapped`). */
  getUnmappedWedEquipmentOptions(): Observable<DropdownOptionDto[]> {
    return this.http
      .get<BackendWlmsEquipment[]>(`${this.baseUrl}equipment/unmapped/`)
      .pipe(map((rows) => rows.map((row) => ({ value: String(row.id), label: row.eqpt_name ?? "" }))));
  }

  getSpareDataMappings(): Observable<BackendSpareDataMap[]> {
    return this.http.get<BackendSpareDataMap[]>(`${this.baseUrl}spare-data-maps/`);
  }

  /** Uses `skipFeedback({ toast: true })` — `wed-masters.ts`'s `submitMap()` (the only caller)
   * already shows its own "Mapping saved." toast on success. */
  createSpareDataMap(insmaEquipmentId: string, wedEquipmentId: string): Observable<void> {
    return this.http
      .post(
        `${this.baseUrl}spare-data-maps/`,
        {
          equipment: Number(insmaEquipmentId),
          wed_equipment: Number(wedEquipmentId),
        },
        { context: skipFeedback({ toast: true }) },
      )
      .pipe(map(() => void 0));
  }

  // ---------------------------------------------------------------------------------------
  // Survey/PTS/Demand/IIF "Enter Details" forms
  // ---------------------------------------------------------------------------------------

  /** No per-row prefetch action exists for Survey (unlike PTS/Demand) — the form is built
   * straight from the cart row already in hand (DART No, qty), matching the reference form. */
  saveSurveyDetails(
    surveyId: string,
    payload: {
      certificateType: string;
      heldCertNumber: string;
      heldCertDate: string;
      ssRemarks: string;
      otherRemarks: string;
      serialNumbers: string[];
      certificateFile: File | null;
    },
  ): Observable<void> {
    const form = new FormData();
    form.append("survey_pks", surveyId);
    form.append("certificate_type", payload.certificateType);
    form.append("held_cert_number", payload.heldCertNumber);
    form.append("held_cert_date", payload.heldCertDate);
    form.append("ss_remarks", payload.ssRemarks);
    if (payload.otherRemarks) form.append("other_remarks", payload.otherRemarks);
    payload.serialNumbers.forEach((serial) => form.append("serial_numbers", serial));
    if (payload.certificateFile) form.append("certificate_upload", payload.certificateFile);
    // Uses `skipFeedback({ toast: true })` — `survey-details.ts`'s `submit()` (the only caller)
    // already shows its own "Survey details saved." toast on success.
    return this.http
      .post(`${this.baseUrl}survey-receipts/save/`, form, { context: skipFeedback({ toast: true }) })
      .pipe(map(() => void 0));
  }

  /** `pts-demands/{id}/prefill/` (`PTSDemandDetailsViewSet.prefill`) — named "prefill", not a
   * plain retrieve, but returns the exact `{pts, quantity, generated_pts_demand_no, items}` shape
   * this form already expects. */
  getPtsDetails(id: string): Observable<BackendPtsDetailContext> {
    return this.http.get<BackendPtsDetailContext>(`${this.baseUrl}pts-demands/${id}/prefill/`);
  }

  /** Uses `skipFeedback({ toast: true })` — `pts-details.ts`'s `submit()` (the only caller)
   * already shows its own "PTS details saved for ..." toast on success. */
  savePtsDetails(
    id: string,
    payload: { demandQty: string; authorityRemarks: string; serialNumbers: string[] },
  ): Observable<void> {
    return this.http
      .post(
        `${this.baseUrl}pts-demands/${id}/save/`,
        {
          demand_qty: payload.demandQty,
          authority_remarks: payload.authorityRemarks,
          serial_numbers: payload.serialNumbers,
        },
        { context: skipFeedback({ toast: true }) },
      )
      .pipe(map(() => void 0));
  }

  /** `demands/{id}/prefill/` (`DemandDetailsViewSet.prefill`) — same "prefill, not retrieve"
   * shape as PTS above: `{demand, generated_demand_no, demand_pdf_name}`. */
  getDemandDetails(id: string): Observable<BackendDemandDetailContext> {
    return this.http.get<BackendDemandDetailContext>(`${this.baseUrl}demands/${id}/prefill/`);
  }

  /** Uses `skipFeedback({ toast: true })` — `demand-details.ts`'s `submit()` (the only caller)
   * already shows its own "Demand details saved for ..." toast on success. */
  saveDemandDetails(
    id: string,
    payload: { authorityRemarks: string; certificateFile: File | null },
  ): Observable<void> {
    const form = new FormData();
    form.append("authority_remarks", payload.authorityRemarks);
    if (payload.certificateFile) form.append("certificate_upload", payload.certificateFile);
    return this.http
      .post(`${this.baseUrl}demands/${id}/save/`, form, { context: skipFeedback({ toast: true }) })
      .pipe(map(() => void 0));
  }

  getIifDetails(id: string): Observable<BackendIifDetails> {
    return this.http.get<BackendIifDetails>(`${this.baseUrl}wediif-details/${id}/`);
  }

  saveIifDetails(
    id: string,
    payload: {
      comlyInOtherEqpt: string;
      annualReq: string;
      phoneNo: string;
      specification: string;
      address: string;
      qtyFittedInEqpt: string;
      proposedMsl: string;
      drawingNo: string;
      poevCostingRs: string;
      bqAmountRs: string;
      ssRemarks: string;
      iifPhoto: File | null;
      drawingDoc: File | null;
      bqDoc: File | null;
    },
  ): Observable<void> {
    const form = new FormData();
    form.append("comly_in_other_eqpt", payload.comlyInOtherEqpt);
    form.append("annual_req", payload.annualReq);
    form.append("phone_no", payload.phoneNo);
    form.append("Specification", payload.specification);
    form.append("address", payload.address);
    form.append("Qty_fitted_in_eqpt", payload.qtyFittedInEqpt);
    form.append("proposed_MSL", payload.proposedMsl);
    form.append("drawing_no", payload.drawingNo);
    form.append("poev_costing_rs", payload.poevCostingRs);
    form.append("bq_amount_rs", payload.bqAmountRs);
    form.append("ss_remarks", payload.ssRemarks);
    if (payload.iifPhoto) form.append("iif_photo", payload.iifPhoto);
    if (payload.drawingDoc) form.append("drawing_doc", payload.drawingDoc);
    if (payload.bqDoc) form.append("bq_doc", payload.bqDoc);
    // Uses `skipFeedback({ toast: true })` — `iif-details.ts`'s `submit()` (the only caller)
    // already shows its own "IIF details saved." toast on success.
    return this.http
      .patch(`${this.baseUrl}wediif-details/${id}/`, form, { context: skipFeedback({ toast: true }) })
      .pipe(map(() => void 0));
  }

  /** "Enter Receipt Details" — creates a new receipt event against the outstanding demand this
   * Receive-cart row already links to (`row.id`/`row.receiveSourceId` here is the WLMS
   * `DemandDetails` id from `demands/receive-queue/`). `demand_status: "Received"` is required —
   * `perform_create` only runs the actual receiving logic (bumping the spare's available/latest
   * qty, computing `received_qty`/remaining) when this is exactly "received" (case-insensitive);
   * anything else just creates a bare, inert row. */
  /** Uses `skipFeedback({ toast: true })` — `cart-list.ts`'s receipt-entry handler (the only
   * caller) already shows its own "Receipt recorded." toast on success. */
  createReceipt(payload: {
    demandDetailsId: number | null;
    ptsDetailsId: number | null;
    receivedQty: number;
    receivedDate: string;
  }): Observable<void> {
    return this.http
      .post(
        `${this.baseUrl}receive-demands/`,
        {
          demand_details: payload.demandDetailsId,
          pts_details: payload.ptsDetailsId,
          demand_quantity: payload.receivedQty,
          demand_status: "Received",
          received_date: payload.receivedDate,
        },
        { context: skipFeedback({ toast: true }) },
      )
      .pipe(map(() => void 0));
  }

  // ---------------------------------------------------------------------------------------
  // Adapters
  // ---------------------------------------------------------------------------------------

  private adaptWedItem(row: BackendWlmsSpare, lookups: WedLookups): WedItem {
    const equipment = row.eqpt != null ? lookups.equipment.get(row.eqpt) : undefined;
    return {
      equipmentName: equipment?.eqpt_name ?? "",
      patternNo: row.item_code ?? "",
      itemDescription: row.item_desc ?? "",
      denomination: row.denom_id ?? "",
      itemCategory: row.category ?? "",
      inventoryType: row.typeofspare ?? "",
    };
  }

  /** Survey/PTS/Demand cart entries reference either a WED-side `WLMSSpare` (`wed_spares_id`)
   * or an onboard `obs.Spares` row (`obs_spare_id`) — exactly one is set. */
  private resolveItemFields(
    wedSpareId: number | null,
    obsSpareId: number | null,
    lookups: WedLookups,
  ): ResolvedItemFields {
    if (wedSpareId != null) {
      const spare = lookups.spares.get(wedSpareId);
      return {
        itemCode: spare?.item_code ?? "",
        itemDescription: spare?.item_desc ?? "",
        denomination: spare?.denom_id ?? "",
        category: spare?.category ?? "",
      };
    }
    if (obsSpareId != null) {
      const spare = lookups.obsSpares.get(obsSpareId);
      return {
        itemCode: spare?.pattern_number ?? "",
        itemDescription: spare?.description ?? "",
        denomination: "",
        category: spare?.category ?? "",
      };
    }
    return { itemCode: "", itemDescription: "", denomination: "", category: "" };
  }

  /** `PendingRow` is a union of row shapes that carry the demand number under different
   *  keys — pick whichever is present, preferring the PTS-specific field when both exist. */
  private resolveDemandNo(row: PendingRow): string | null {
    if ("PTS_demand_no" in row) return row.PTS_demand_no ?? row.demand_no;
    if ("demand_no" in row) return row.demand_no;
    return "";
  }

  private adaptPendingEntry(row: PendingRow, lookups: WedLookups): WedCartEntry {
    const fields = this.resolveItemFields(row.wed_spares_id, row.obs_spare_id, lookups);
    const scrapQty = typeof row.scrap_qty === "number" ? row.scrap_qty : Number(row.scrap_qty);
    const demandNo = this.resolveDemandNo(row);
    const surveyNo = "survey_no" in row ? row.survey_no : "";
    return {
      id: String(row.id),
      syncStatus: row.is_sync ? "Synced" : "Not Synced",
      itemCode: fields.itemCode,
      itemDescription: fields.itemDescription,
      denomination: fields.denomination,
      qty: Number.isFinite(scrapQty) ? scrapQty : undefined,
      category: fields.category,
      hodApprovalStatus: row.is_approval ? "Approved" : "Pending",
      isSave: !!row.is_save,
      dartNo: row.dart_number || "",
      demandNo: demandNo || "",
      surveyNo: surveyNo || "",
      equipmentNomenclature: row.equipment_nomenclature || "",
      equipmentClass: row.equipment_class && row.equipment_class !== "-" ? row.equipment_class : "",
    };
  }

  /** `pts-demands/raised-survey-pending/`'s own annotation set — `demand_qty_resolved` instead
   * of `scrap_qty`, plus `receipt_status`/`received_qty`, no `dart_description`. */
  private adaptRaisedSurveyPendingEntry(row: BackendRaisedSurveyPendingRow, lookups: WedLookups): WedCartEntry {
    const fields = this.resolveItemFields(row.wed_spares_id, row.obs_spare_id, lookups);
    const qty = typeof row.demand_qty_resolved === "number" ? row.demand_qty_resolved : Number(row.demand_qty_resolved);
    return {
      id: String(row.id),
      syncStatus: row.is_sync ? "Synced" : "Not Synced",
      itemCode: fields.itemCode,
      itemDescription: fields.itemDescription,
      denomination: fields.denomination,
      qty: Number.isFinite(qty) ? qty : undefined,
      category: fields.category,
      hodApprovalStatus: row.is_approval ? "Approved" : "Pending",
      isSave: !!row.is_save,
      dartNo: row.dart_number || "",
      demandNo: row.PTS_demand_no || row.demand_no || "",
      surveyNo: row.survey_no || "",
      equipmentNomenclature: row.equipment_nomenclature || "",
      equipmentClass: row.equipment_class && row.equipment_class !== "-" ? row.equipment_class : "",
      issueStatus: row.receipt_status,
    };
  }

  private adaptIifCartEntry(row: BackendWedIif, lookups: WedLookups): WedCartEntry {
    const obsSpare = row.spare_id != null ? lookups.obsSpares.get(row.spare_id) : undefined;
    const equipmentClass = obsSpare ? lookups.obsEquipmentClasses.get(obsSpare.equipment_class)?.name ?? "" : "";
    return {
      id: String(row.id),
      syncStatus: row.is_sync ? "Synced" : "Not Synced",
      itemCode: obsSpare?.pattern_number ?? "",
      itemDescription: obsSpare?.description ?? "",
      category: obsSpare?.category ?? "",
      hodApprovalStatus: row.is_approval ? "Approved" : "Pending",
      equipmentClass,
      swmmPatternNo: obsSpare?.pattern_number ?? "",
      // `incattingStatus` has no backend field on WEDIIF — left unset.
    };
  }

  /** `demands/receive-queue/` rows are the WLMS `DemandDetails` rows themselves, not a merged
   * receipt-table row — the receive cart's own id/source id are therefore the same demand id
   * (see `WedCartEntry.receiveSourceId`'s doc comment). No dart/equipment annotations are
   * available on this plain list, so those stay blank rather than fabricated. */
  private adaptReceiveQueueEntry(row: BackendReceiveQueueDemand, lookups: WedLookups): WedCartEntry {
    const fields = this.resolveItemFields(row.wed_spares_id, row.obs_spare_id, lookups);
    const qty = typeof row.demand_qty === "number" ? row.demand_qty : Number(row.demand_qty);
    return {
      id: String(row.id),
      // Every row here is, by construction, awaiting receipt (the endpoint excludes anything
      // already fully received) — there is no other sync-style flag on a WLMS DemandDetails row.
      syncStatus: "Not Synced",
      itemCode: fields.itemCode,
      itemDescription: fields.itemDescription,
      denomination: fields.denomination,
      category: fields.category,
      qty: Number.isFinite(qty) ? qty : undefined,
      issueStatus: "Outstanding",
      receiptStatus: "Outstanding",
      surveyNo: row.survey_no ?? "",
      vettingRemarks: row.remarks ?? "",
      demandNo: row.demand_no || "",
      dartNo: "",
      receiveSourceKind: "demand",
      receiveSourceId: row.id,
    };
  }

  private adaptApprovalEntry(row: BackendCombinedOutboxEntry, lookups: WedLookups): ApprovalEntry {
    const kind = row.spare_cart_name;
    const obsSpareId = row.obs_spare_id ?? row.spare_id ?? null;
    const fields = this.resolveItemFields(row.wed_spares_id ?? null, obsSpareId, lookups);
    const obsSpare = obsSpareId != null ? lookups.obsSpares.get(obsSpareId) : undefined;

    let equipmentClass = "";
    if (kind === "IIF") {
      // For IIF rows the backend already resolves `equipment_nomenclature` to the OBS spare's
      // equipment_class name (see `wlms_combined_outbox` in backend/wlms/views/sync.py).
      equipmentClass = row.equipment_nomenclature && row.equipment_nomenclature !== "—" ? row.equipment_nomenclature : "";
    } else if (row.wed_spares_id != null) {
      equipmentClass = this.resolveEquipmentName(row.wed_spares_id, lookups);
    } else if (obsSpare) {
      equipmentClass = lookups.obsEquipmentClasses.get(obsSpare.equipment_class)?.name ?? "";
    }

    const qty = typeof row.quantity_required === "number" ? row.quantity_required : Number(row.quantity_required);
    return {
      id: `${kind}:${row.id}`,
      spareCartName: kind,
      patternNo: fields.itemCode,
      spareDescription: fields.itemDescription,
      dartNo: row.dart_number && row.dart_number !== "—" ? row.dart_number : "",
      equipmentClass,
      category: fields.category,
      critical: obsSpare?.critical ?? false,
      qty: Number.isFinite(qty) ? qty : 0,
    };
  }

  private adaptDemandHistory(row: BackendDemandEntry | BackendPtsEntry, lookups: WedLookups): NormalDemandHistoryEntry {
    const fields = this.resolveItemFields(row.wed_spares_id, row.obs_spare_id, lookups);
    const demandNo = "PTS_demand_no" in row ? row.PTS_demand_no ?? row.demand_no : row.demand_no;
    return {
      id: String(row.id),
      itemCode: fields.itemCode,
      itemDescription: fields.itemDescription,
      category: fields.category,
      surveyNo: "survey_no" in row ? row.survey_no ?? "" : "",
      surveyDate: "",
      demandNo: demandNo || "",
      demandedQty: 0,
      demandDate: "",
      wedIssuedQty: 0,
      gatePassNo: "",
      dartNo: "",
      equipmentClass: "",
      equipmentNomenclature: "",
    };
  }

  /** See `getRioDemandHistory()` — PTS's "raised survey pending" rows are the closest real
   * substitute for a dedicated RIO history feed, which doesn't exist anywhere in the wlms app.
   * `rioType`/`dtg`/`year` have no backing field on `PTSDemandDetails` at all and stay blank. */
  private adaptRioHistory(row: BackendRaisedSurveyPendingRow, lookups: WedLookups): RioHistoryEntry {
    const fields = this.resolveItemFields(row.wed_spares_id, row.obs_spare_id, lookups);
    const qty = typeof row.demand_qty_resolved === "number" ? row.demand_qty_resolved : Number(row.demand_qty_resolved);
    return {
      id: String(row.id),
      rioType: "PTS",
      itemCode: fields.itemCode,
      itemDescription: fields.itemDescription,
      rioDemandNo: row.PTS_demand_no || "",
      demandDate: "",
      dtg: "",
      year: "",
      dartNo: row.dart_number && row.dart_number !== "—" ? row.dart_number : "",
      qtyDemanded: Number.isFinite(qty) ? qty : 0,
      wedIssueQty: 0,
      onboardReceiptDate: "",
      gatePassNo: "",
      equipmentClass: row.equipment_class && row.equipment_class !== "-" ? row.equipment_class : "",
    };
  }

  private adaptIifHistoryEntry(row: BackendWedIif, obsSparesById: Map<number, ObsSpareLookup>): IifHistoryEntry {
    const obsSpare = row.spare_id != null ? obsSparesById.get(row.spare_id) : undefined;
    return {
      id: String(row.id),
      // Not populated: fetching WEDIIFDetails.iif_no would call an endpoint that auto-creates
      // a details row as a side effect of a GET (see WEDIIFDetailsViewSet.retrieve in
      // backend/wlms/views/iif.py) — a passive history view must not trigger that write.
      iifRequisitionNo: "",
      iifRequisitionDate: "",
      wlmsSyncDate: row.sync_date ?? "",
      swmmItemCode: obsSpare?.pattern_number ?? "",
      wedItemCode: "",
      incattingCompletionDate: "",
    };
  }

  private resolveEquipmentName(wedSpareId: number | null, lookups: WedLookups): string {
    if (wedSpareId == null) return "";
    const spare = lookups.spares.get(wedSpareId);
    if (spare?.eqpt == null) return "";
    return lookups.equipment.get(spare.eqpt)?.eqpt_name ?? "";
  }

  // ---------------------------------------------------------------------------------------
  // Signal Demand (OPDEM / STOREDEM / CANDEM) — `signal-demands/` (list, create) +
  // `signal-demands/<pk>/{forward|approve|reject|cancel}/`. No retrieve/update/delete route is
  // wired server-side (`backend/wlms/urls.py`), so this list is the only way to see a row and
  // the four status actions are the only way to act on one — there's no "edit" path.
  // ---------------------------------------------------------------------------------------

  getShipOptions(): Observable<DropdownOptionDto[]> {
    return this.shipsById$.pipe(
      map((byId) => [...byId.values()].map((ship) => ({ value: String(ship.id), label: ship.name }))),
    );
  }

  getWedSpareOptions(): Observable<DropdownOptionDto[]> {
    return this.wlmsSparesById$.pipe(
      map((byId) =>
        [...byId.values()].map((spare) => ({
          value: String(spare.id),
          label: spare.item_desc || spare.item_code || `#${spare.id}`,
        })),
      ),
    );
  }

  getObsSpareOptions(): Observable<DropdownOptionDto[]> {
    return this.obsSparesById$.pipe(
      map((byId) =>
        [...byId.values()].map((spare) => ({
          value: String(spare.id),
          label: `${spare.pattern_number} — ${spare.description}`,
        })),
      ),
    );
  }

  getWedEquipmentOptions(): Observable<DropdownOptionDto[]> {
    return this.wlmsEquipmentById$.pipe(
      map((byId) =>
        [...byId.values()].map((eqpt) => ({ value: String(eqpt.id), label: eqpt.eqpt_name || `#${eqpt.id}` })),
      ),
    );
  }

  getSignalDemands(filters?: {
    demandType?: SignalDemandEntry["demandType"];
    status?: SignalDemandEntry["status"];
    q?: string;
  }): Observable<SignalDemandEntry[]> {
    const params: Record<string, string> = {};
    if (filters?.demandType) params["demand_type"] = filters.demandType;
    if (filters?.status) params["status"] = filters.status;
    if (filters?.q) params["q"] = filters.q;
    return combineLatest([
      this.http.get<BackendSignalDemand[]>(`${this.baseUrl}signal-demands/`, { params }),
      this.shipsById$,
      this.wlmsSparesById$,
      this.obsSparesById$,
    ]).pipe(
      map(([rows, shipsById, wedSparesById, obsSparesById]) =>
        rows.map((row) => this.adaptSignalDemand(row, shipsById, wedSparesById, obsSparesById)),
      ),
    );
  }

  createSignalDemand(payload: SignalDemandPayload): Observable<SignalDemandEntry> {
    const body: Record<string, unknown> = {
      demand_type: payload.demandType,
      demand_number: payload.demandNumber,
      dtg: payload.dtg,
      requesting_ship: this.toOptionalId(payload.requestingShipId),
      receiver_ship: this.toOptionalId(payload.receiverShipId),
      wed_spare: this.toOptionalId(payload.wedSpareId),
      obs_spare: this.toOptionalId(payload.obsSpareId),
      equipment: this.toOptionalId(payload.equipmentId),
      pts_number: payload.ptsNumber ?? "",
      demand_quantity: payload.demandQuantity,
      remarks: payload.remarks ?? "",
    };
    return combineLatest([
      this.http.post<BackendSignalDemand>(`${this.baseUrl}signal-demands/`, body),
      this.shipsById$,
      this.wlmsSparesById$,
      this.obsSparesById$,
    ]).pipe(
      map(([row, shipsById, wedSparesById, obsSparesById]) =>
        this.adaptSignalDemand(row, shipsById, wedSparesById, obsSparesById),
      ),
    );
  }

  forwardSignalDemand(id: string): Observable<void> {
    return this.signalDemandTransition(id, "forward");
  }

  approveSignalDemand(id: string): Observable<void> {
    return this.signalDemandTransition(id, "approve");
  }

  rejectSignalDemand(id: string): Observable<void> {
    return this.signalDemandTransition(id, "reject");
  }

  cancelSignalDemand(id: string): Observable<void> {
    return this.signalDemandTransition(id, "cancel");
  }

  private signalDemandTransition(id: string, action: "forward" | "approve" | "reject" | "cancel"): Observable<void> {
    return this.http.post(`${this.baseUrl}signal-demands/${id}/${action}/`, {}).pipe(map(() => void 0));
  }

  private toOptionalId(value: string | undefined): number | null {
    if (!value) return null;
    const id = Number(value);
    return Number.isFinite(id) ? id : null;
  }

  private adaptSignalDemand(
    row: BackendSignalDemand,
    shipsById: Map<number, BackendShip>,
    wedSparesById: Map<number, BackendWlmsSpare>,
    obsSparesById: Map<number, ObsSpareLookup>,
  ): SignalDemandEntry {
    const itemLabel =
      (row.wed_spare != null ? wedSparesById.get(row.wed_spare)?.item_desc : null) ||
      (row.obs_spare != null ? obsSparesById.get(row.obs_spare)?.description : null) ||
      "";
    return {
      id: String(row.id),
      demandType: row.demand_type,
      demandNumber: row.demand_number,
      dtg: row.dtg,
      requestingShipId: row.requesting_ship != null ? String(row.requesting_ship) : "",
      requestingShipName: row.requesting_ship != null ? shipsById.get(row.requesting_ship)?.name ?? "" : "",
      receiverShipId: row.receiver_ship != null ? String(row.receiver_ship) : "",
      receiverShipName: row.receiver_ship != null ? shipsById.get(row.receiver_ship)?.name ?? "" : "",
      itemLabel,
      ptsNumber: row.pts_number,
      demandQuantity: row.demand_quantity,
      remarks: row.remarks,
      status: row.status,
      createdAt: row.created_at,
    };
  }
}
