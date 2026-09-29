import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, combineLatest, forkJoin, of, throwError, timer } from "rxjs";
import { catchError, map, shareReplay, switchMap } from "rxjs/operators";

import { resolveCmmsApiUrl } from "../../../../../environments/api-url";
import { skipFeedback } from "../../../../Core/http/services/http-feedback";
import { DropdownOption } from "../../../../shared/components/select-input/select-input";
import {
  ApprovalEntry,
  IifHistoryEntry,
  MoCartEntry,
  MoImportKind,
  MoImportResult,
  MoImportRowError,
  MoDashboardCounts,
  MoItem,
  NormalDemandHistoryEntry,
  RioHistoryEntry,
  Vendor,
} from "../models/mo.model";
import {
  BackendIif,
  BackendIifDetail,
  BackendIlmsSyncResponse,
  BackendItem,
  BackendItemSearchResponse,
  BackendMergedReceiveListResponse,
  BackendMoImportEnvelope,
  BackendMoImportTaskStatus,
  BackendMoMapping,
  BackendPendingDemand,
  BackendPendingPts,
  BackendPendingSurvey,
  BackendReceiveRow,
  BackendSfdTransactionEquipmentListResponse,
  BackendVendorSearchResponse,
  IifDetailUpdatePayload,
  ObsEquipmentClassLookup,
  ObsSpareLookup,
} from "../models/ilms-backend.model";

export type MoCartKind = "survey" | "pts" | "demand" | "receive" | "pts-rio-pending" | "iif";

interface MoLookups {
  items: Map<string, BackendItem>;
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
type WorkflowKind = "Survey" | "PTS" | "Demand";

/** Maps a workflow kind to the router prefix `ilms/urls.py` registers it under
 * (`surveys/`, `pts/`, `demands/`) — used to build `{prefix}/{pk}/...` action URLs. `pts`'s prefix
 * happens to equal its own kind name; `survey`/`demand` don't, hence this table instead of using
 * the kind string directly. */
const WORKFLOW_URL_SEGMENT: Record<WorkflowKind, string> = {
  Survey: "surveys",
  PTS: "pts",
  Demand: "demands",
};

/** `MoImportKind` ("item"/"vendor", the UI's own singular vocabulary) to the plural router
 * prefix `ItemViewSet`/`VendorViewSet` are actually registered under (`items/`/`vendors/`) —
 * `ExcelImportExportMixin`'s `import-excel/`/`download-template/` actions live under those
 * prefixes, not a bare `item/`/`vendor/` segment. */
const IMPORT_URL_SEGMENT: Record<MoImportKind, string> = {
  item: "items",
  vendor: "vendors",
};

/** `VendorViewSet.search_table` defaults every blank field to the literal string `"-"` rather than
 * `null`/omitting the key — normalizes that back to `""` to match the empty-string convention used
 * everywhere else in this file's adapters. */
function blank(value: string | null | undefined): string {
  return !value || value === "-" ? "" : value;
}

/**
 * Shore Inventory - MO API — talks to `backend/ilms` (`api/v1/ilms/...`), with a couple of
 * cross-app lookups against `backend/obs` (`api/v1/onboard-spares/...`) since Survey/PTS/Demand/
 * IIF entries can originate from either an ILMS-side `Item` or an onboard `obs.Spares` row.
 *
 * Like `ObsApiService`/`WedApiService`, backend serializers here are id-only / snake_case; every
 * method joins the raw response against cached lookups (`lookups$`) before returning the
 * camelCase UI DTOs from `../models/mo.model.ts`. A few methods have no working backend endpoint
 * yet (`BACKEND GAP` comments) and fail loudly via `throwError` (or return `[]`/best-effort
 * partial data for read endpoints) instead of silently faking success.
 *
 * Every path below was re-verified directly against the current `swmm/ilms/views/*.py` /
 * `swmm/ilms/urls.py` — the router-registered `surveys/`, `pts/`, `demands/`, `iif/`, `items/`,
 * `vendors/`, `mo-mappings/` prefixes with `ApprovalWorkflowMixin`'s shared action vocabulary
 * (`pending-list/`, `bulk-send-for-approval/`, `{id}/approve/`, `{id}/complete/`,
 * `{id}/mark-synced/`). Earlier versions of this file called a since-removed flat URL scheme
 * (`mo_survey_list/`, `survey_send_hod_approval/`, `iifcart/`, `mo-mapping-table/`, ...) —
 * `ilms/utils.py`'s own docstring confirms that scheme's source (`ILMS/views.py:1994-2410`) no
 * longer exists.
 */
@Injectable({ providedIn: "root" })
export class MoApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${resolveCmmsApiUrl()}api/v1/ilms/`;
  private readonly obsBaseUrl = `${resolveCmmsApiUrl()}api/v1/onboard-spares/`;
  private readonly sfdBaseUrl = `${resolveCmmsApiUrl()}api/v1/sfd/`;

  /** Full (uncapped) Item master, keyed by item_code — used to join item details onto the
   * id-only Survey/PTS/Demand rows. `items/search-list/` (`ItemViewSet.search_list`) returns the
   * bare, uncapped `ItemSerializer` list — unlike `items/search-enriched/` (used by `getItems()`
   * below), which is capped at 100 rows and wraps its response in `{items, routine_list}`, making
   * it unsuitable as a general-purpose lookup. */
  private readonly itemsByCode$ = this.http.get<BackendItem[]>(`${this.baseUrl}items/search-list/`).pipe(
    map((rows) => new Map(rows.map((row) => [row.item_code, row]))),
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

  private readonly lookups$: Observable<MoLookups> = combineLatest([
    this.itemsByCode$,
    this.obsSparesById$,
    this.obsEquipmentClassById$,
  ]).pipe(
    map(([items, obsSpares, obsEquipmentClasses]) => ({ items, obsSpares, obsEquipmentClasses })),
    shareReplay(1),
  );

  // ---------------------------------------------------------------------------------------
  // Vendor / item search
  // ---------------------------------------------------------------------------------------

  /** `vendors/search-table/` (`VendorViewSet.search_table`) wraps its rows in `{status, data}`
   * and uses its own field names (see `BackendVendorSearchRow`'s doc comment) rather than
   * `VendorSerializer`'s. `pan` is never returned by this endpoint (only `gst_no`) — `vendors/
   * search-list/` (the bare `VendorSerializer` list) does carry `pan`, but not the rest of this
   * grid's columns (`add_line1/2/3`, `pincode`, `country_cd`, ...), so `pan` stays blank and
   * results stay capped at whatever `search_table` itself returns (100 rows) — both are backend
   * limitations, not something this method can work around. */
  getVendors(): Observable<Vendor[]> {
    return this.http.get<BackendVendorSearchResponse>(`${this.baseUrl}vendors/search-table/`).pipe(
      map((response) =>
        response.data.map((row) => ({
          id: row.vendor_code,
          ser: row.ser,
          vendorCode: row.vendor_code,
          vendorName: blank(row.vendor_name),
          vendorClass: blank(row.vendor_class),
          addressee: blank(row.addressee),
          addressLine1: blank(row.add_line1),
          addressLine2: blank(row.add_line2),
          addressLine3: blank(row.add_line3),
          city: blank(row.city),
          state: blank(row.state),
          pincode: blank(row.pincode),
          countryCode: blank(row.country_cd),
          remarks: blank(row.remarks),
          gstNo: blank(row.gst_no),
          pan: "",
          approvedBy: blank(row.approved_by),
          dateApproved: blank(row.date_approved),
          dateBannedUpto: blank(row.date_banupto),
        })),
      ),
    );
  }

  /** `items/search-enriched/` (`ItemViewSet.search_enriched`) — the only ILMS item endpoint that
   * joins on `MoMappingTable`/`ItemLine` for `nomenclature`/`equipment_code`/`stations`, which is
   * what this screen's grid actually shows. Capped at 100 rows server-side. */
  getItems(): Observable<MoItem[]> {
    return this.http.get<BackendItemSearchResponse>(`${this.baseUrl}items/search-enriched/`).pipe(
      map((response) =>
        response.items.map((row) => ({
          itemCode: row.item_code,
          itemDescription: row.item_desc ?? "",
          crpCategory: row.crp_category ?? "",
          denomination: row.item_deno ?? "",
          // ILMS has no distinct "held onboard" flag — incat_yn ("in catalogue") is the closest
          // available signal.
          shipInventoryStatus: row.incat_yn ? "In Catalogue" : "Not In Catalogue",
          // search-enriched doesn't join a vendor onto each item (vendor linkage lives in
          // MoMappingTable, keyed differently) — left blank.
          vendorName: "",
          ilmsEquipmentDescription: row.nomenclature ?? "",
          equipmentCode: row.equipment_code ?? undefined,
        })),
      ),
    );
  }

  // ---------------------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------------------

  /** Every tile is sourced straight from the same list endpoint its "View more" navigates to
   * (`getCart()` below), not from `items/dashboard/?type=mo`'s own aggregated counts — those
   * don't line up with what the cart grids actually show:
   * - Survey/PTS/Demand: `dashboard()`'s counts filter `ilms_spare_id__in=<Survey/PTS/Demand-
   *   scoped ids>` (`ilms/views/base.py` `_scoped_item_ids()`). Those three models carry the item
   *   on *either* `ilms_spare_id` or `obs_spare_id` — rows from an onboard (OBS) spare only ever
   *   populate `obs_spare_id`, so `ilms_spare_id__in=...` can never match them and the count would
   *   silently read 0 for an all-OBS backlog.
   * - IIF: `dashboard.pending_iif` filters `is_sync=False` (a stricter "not yet synced" count),
   *   while the IIF cart grid (`iif/`, used here) lists every not-yet-deleted cart entry
   *   regardless of sync status — binding to the same list the grid uses keeps the tile
   *   consistent with the page it links to.
   * - Receive/"Outstanding Demands": bound to `demands/merged-receive-list/`, the same endpoint
   *   the "Outstanding Demands" grid this tile links to (`getReceiveCart()`) reads, rather than a
   *   differently-filtered dashboard count with no guarantee of matching. */
  getDashboardCounts(): Observable<MoDashboardCounts> {
    return forkJoin({
      surveyInProgress: this.http.get<unknown[]>(`${this.baseUrl}surveys/pending-list/`),
      demandInProgress: this.http.get<unknown[]>(`${this.baseUrl}demands/pending-list/`),
      ptsDemandInProgress: this.http.get<unknown[]>(`${this.baseUrl}pts/pending-list/`),
      outstandingDemands: this.http.get<BackendMergedReceiveListResponse>(`${this.baseUrl}demands/merged-receive-list/`),
      iifInProgress: this.http.get<unknown[]>(`${this.baseUrl}iif/`),
      ptsRioSurveyPending: this.http.get<unknown[]>(`${this.baseUrl}pts/raised-survey-pending/`),
    }).pipe(
      map(({ surveyInProgress, demandInProgress, ptsDemandInProgress, outstandingDemands, iifInProgress, ptsRioSurveyPending }) => ({
        surveyInProgress: surveyInProgress.length,
        demandInProgress: demandInProgress.length,
        ptsDemandInProgress: ptsDemandInProgress.length,
        outstandingDemands: outstandingDemands.entries.length,
        iifInProgress: iifInProgress.length,
        ptsRioSurveyPending: ptsRioSurveyPending.length,
      })),
    );
  }

  // ---------------------------------------------------------------------------------------
  // Spares Transaction Carts
  // ---------------------------------------------------------------------------------------

  getCart(kind: MoCartKind): Observable<MoCartEntry[]> {
    switch (kind) {
      case "survey":
        return this.getWorkflowCart("surveys/pending-list/");
      case "pts":
        return this.getWorkflowCart("pts/pending-list/");
      case "pts-rio-pending":
        // `pts/raised-survey-pending/` (`PTSDetailsViewSet.raised_survey_pending`) is a genuinely
        // distinct, filtered view — HOD-approved PTS entries with no matching completed Survey —
        // not an alias of the plain PTS pending-list.
        return this.getWorkflowCart("pts/raised-survey-pending/");
      case "demand":
        return this.getWorkflowCart("demands/pending-list/");
      case "receive":
        return this.getReceiveCart();
      case "iif":
        return this.getIifCart();
    }
  }

  private getWorkflowCart(path: string): Observable<MoCartEntry[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        this.http
          .get<PendingRow[]>(`${this.baseUrl}${path}`)
          .pipe(map((rows) => rows.map((row) => this.adaptPendingEntry(row, lookups)))),
      ),
    );
  }

  private getReceiveCart(): Observable<MoCartEntry[]> {
    return this.http.get<BackendMergedReceiveListResponse>(`${this.baseUrl}demands/merged-receive-list/`).pipe(
      map((response) => response.entries.map((row, index) => this.adaptReceiveRow(row, index))),
    );
  }

  private getIifCart(): Observable<MoCartEntry[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        this.http
          .get<BackendIif[]>(`${this.baseUrl}iif/`)
          .pipe(map((rows) => rows.map((row) => this.adaptIifCartEntry(row, lookups)))),
      ),
    );
  }

  // ---------------------------------------------------------------------------------------
  // IIF Details — "Edit" on the Raise IIF cart. `IIFViewSet` is a plain `ModelViewSet`, so the
  // full row (every field `IIFSerializer` carries) is reachable directly via retrieve/update —
  // unlike WLMS's `WEDIIFDetailsViewSet`, there's no separate get-or-create details resource.
  // ---------------------------------------------------------------------------------------

  getIifDetail(id: string): Observable<BackendIifDetail> {
    return this.http.get<BackendIifDetail>(`${this.baseUrl}iif/${id}/`);
  }

  /** Uses `skipFeedback({ toast: true })` — `iif-details.ts`'s `submit()` (the only caller)
   * already shows its own "IIF details saved." toast on success. */
  updateIifDetail(id: string, payload: IifDetailUpdatePayload): Observable<void> {
    return this.http
      .patch(`${this.baseUrl}iif/${id}/`, payload, { context: skipFeedback({ toast: true }) })
      .pipe(map(() => void 0));
  }

  /** Uses `skipFeedback({ toast: true })` — `cart-list.ts`'s `sendForHodApproval()` (the only
   * caller) already shows its own "Sent for HOD approval." toast on success. */
  sendCartForHodApproval(kind: MoCartKind, ids: string[]): Observable<void> {
    const body = { ids: ids.map(Number) };
    const options = { context: skipFeedback({ toast: true }) };
    switch (kind) {
      case "survey":
        return this.http
          .post(`${this.baseUrl}surveys/bulk-send-for-approval/`, body, options)
          .pipe(map(() => void 0));
      case "pts":
      case "pts-rio-pending":
        return this.http
          .post(`${this.baseUrl}pts/bulk-send-for-approval/`, body, options)
          .pipe(map(() => void 0));
      case "demand":
        return this.http
          .post(`${this.baseUrl}demands/bulk-send-for-approval/`, body, options)
          .pipe(map(() => void 0));
      case "receive":
        return throwError(() => new Error("The Receive cart has no HOD approval step."));
      case "iif":
        // `IIFViewSet.bulk_send_for_approval` (`ilms/views/iif.py`) — IIF's own HOD-numbering
        // action, ported from source's `iif_send_hod_approval`. Same `{ids}` body shape as the
        // Survey/PTS/Demand bulk-send-for-approval actions above.
        return this.http
          .post(`${this.baseUrl}iif/bulk-send-for-approval/`, body, options)
          .pipe(map(() => void 0));
    }
  }

  /** pts-data-send-ilms/ and demand-data-send-ilms/ mark every approved-but-unsynced row as
   * synced (department-scoped) when called with no ids — this bulk-syncs the whole HOD-approved
   * backlog for that workflow rather than a specific selection, matching what "Sync with ILMS"
   * on the cart screen actually offers today (no row-level selection UI for this action).
   *
   * Survey/IIF have no equivalent bulk endpoint, but each row does have its own
   * `{segment}/<pk>/mark-synced/` action (`ApprovalWorkflowMixin.mark_synced` for survey, requires
   * `is_hod_approval` already true; `IIFViewSet.mark_synced` for iif, unconditional) — `entries`
   * (the cart's currently-loaded rows) is filtered to the eligible subset and POSTed one at a time,
   * mirroring the "sync the whole backlog" behavior of the bulk endpoints above. */
  /** Uses `skipFeedback({ toast: true })` — `cart-list.ts`'s `sync()` (the only caller) already
   * shows its own "Sync complete — N record(s) synced." toast on success. */
  syncCartWithIlms(kind: MoCartKind, entries: MoCartEntry[]): Observable<BackendIlmsSyncResponse> {
    const options = { context: skipFeedback({ toast: true }) };
    switch (kind) {
      case "pts":
      case "pts-rio-pending":
        return this.http.post<BackendIlmsSyncResponse>(`${this.baseUrl}pts-data-send-ilms/`, {}, options);
      case "demand":
        return this.http.post<BackendIlmsSyncResponse>(`${this.baseUrl}demand-data-send-ilms/`, {}, options);
      case "survey":
        return this.markSyncedInBulk(
          "surveys",
          entries.filter((e) => e.hodApprovalStatus === "Approved" && e.syncStatus === "Not Synced"),
          options,
        );
      case "iif":
        return this.markSyncedInBulk(
          "iif",
          entries.filter((e) => e.syncStatus === "Not Synced"),
          options,
        );
      case "receive":
        // BACKEND GAP: the merged receive queue isn't a Survey/PTS/Demand/IIF row and has no
        // `mark-synced` action of its own.
        return throwError(
          () => new Error(`Syncing the "${kind}" cart with ILMS is not implemented on the backend yet.`),
        );
    }
  }

  private markSyncedInBulk(
    segment: "surveys" | "iif",
    eligible: MoCartEntry[],
    options: { context: ReturnType<typeof skipFeedback> },
  ): Observable<BackendIlmsSyncResponse> {
    if (!eligible.length) {
      return of({ status: "success", message: "Nothing to sync.", updated: 0, count: 0 });
    }
    return forkJoin(
      eligible.map((entry) => this.http.post(`${this.baseUrl}${segment}/${entry.id}/mark-synced/`, {}, options)),
    ).pipe(
      map(() => ({
        status: "success" as const,
        message: `${eligible.length} record(s) synced.`,
        updated: eligible.length,
        count: eligible.length,
      })),
    );
  }

  /** Single-row HOD approval (`ApprovalWorkflowMixin.approve`, requires `is_hod` already true) —
   * used by "References > As is Transaction > Demand Action"/"Survey", which act on one row at a
   * time (unlike `sendCartForHodApproval`'s bulk-send). */
  approveCartEntry(kind: "survey" | "pts" | "demand", id: string): Observable<void> {
    const segment = kind === "survey" ? "surveys" : kind === "demand" ? "demands" : "pts";
    return this.http
      .post(`${this.baseUrl}${segment}/${id}/approve/`, {}, { context: skipFeedback({ toast: true }) })
      .pipe(map(() => void 0));
  }

  /** Marks one entry complete (`ApprovalWorkflowMixin.complete`, requires HOD approval already
   * granted) — used by "References > As is Transaction > Survey"'s "Close" action. Both this and
   * `approveCartEntry()` above use `skipFeedback({ toast: true })` since their (single) callers —
   * `survey-reference.ts`/`demand-action.ts`'s `approve()`/`complete()` — already show their own
   * specific success toast. */
  completeCartEntry(kind: "survey" | "pts" | "demand", id: string): Observable<void> {
    const segment = kind === "survey" ? "surveys" : kind === "demand" ? "demands" : "pts";
    return this.http
      .post(`${this.baseUrl}${segment}/${id}/complete/`, {}, { context: skipFeedback({ toast: true }) })
      .pipe(map(() => void 0));
  }

  // ---------------------------------------------------------------------------------------
  // HOD Approval (approved-awaiting-sync items, composed from the 3 workflow pending-lists)
  //
  // The backend's own combined inbox/outbox (`ilms-inbox/`/`ilms-outbox/`) merges Survey/PTS/
  // Demand under one response key with no per-row type discriminator, so ids from the 3
  // independently-numbered tables could collide — composing the "outbox" from each workflow's own
  // pending-list instead keeps a reliable `Kind:pk` composite id (see `sendApprovalsToIlms`).
  // ---------------------------------------------------------------------------------------

  getApprovalList(): Observable<ApprovalEntry[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        forkJoin({
          survey: this.http.get<BackendPendingSurvey[]>(`${this.baseUrl}surveys/pending-list/`),
          pts: this.http.get<BackendPendingPts[]>(`${this.baseUrl}pts/pending-list/`),
          demand: this.http.get<BackendPendingDemand[]>(`${this.baseUrl}demands/pending-list/`),
        }).pipe(
          map(({ survey, pts, demand }) => {
            const outbox: ApprovalEntry[] = [];
            const collect = (kind: WorkflowKind, rows: PendingRow[]) => {
              for (const row of rows) {
                if (row.is_hod && row.is_hod_approval && !row.is_sync) {
                  outbox.push(this.adaptApprovalEntry(kind, row, lookups));
                }
              }
            };
            collect("Survey", survey);
            collect("PTS", pts);
            collect("Demand", demand);
            return outbox;
          }),
        ),
      ),
    );
  }

  /** Uses `skipFeedback({ toast: true })` — `approval.ts`'s `sendToIlms()` (the only caller)
   * already shows its own "Sent to ILMS." toast on success. */
  sendApprovalsToIlms(ids: string[]): Observable<void> {
    const requests: Observable<unknown>[] = [];
    for (const compositeId of ids) {
      const [kind, pk] = compositeId.split(":");
      const segment = kind ? WORKFLOW_URL_SEGMENT[kind as WorkflowKind] : undefined;
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

  getNormalDemandHistory(): Observable<NormalDemandHistoryEntry[]> {
    return this.getDemandHistory("demands/pending-list/");
  }

  getPtsDemandHistory(): Observable<NormalDemandHistoryEntry[]> {
    return this.getDemandHistory("pts/pending-list/");
  }

  /** No RIO-specific model, field, or endpoint exists anywhere in the ilms app — the closest real
   * data is the synced subset of `pts/raised-survey-pending/`, the same PTS-derived "RIO" set the
   * Spares Transaction Cart's `pts-rio-pending` tab already draws its pending rows from. This is
   * an approximation (it's indistinguishable from plain PTS history by `is_sync` alone), not a
   * dedicated RIO history feed — flagged here rather than silently presented as one. */
  getRioDemandHistory(): Observable<RioHistoryEntry[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        this.http.get<BackendPendingPts[]>(`${this.baseUrl}pts/raised-survey-pending/`).pipe(
          map((rows) => rows.filter((row) => row.is_sync).map((row) => this.adaptRioHistory(row, lookups))),
        ),
      ),
    );
  }

  getIifHistory(): Observable<IifHistoryEntry[]> {
    return this.lookups$.pipe(
      switchMap((lookups) =>
        // `iif/history/` (`IIFViewSet.history`) already filters to `is_sync=True` server-side.
        this.http
          .get<BackendIif[]>(`${this.baseUrl}iif/history/`)
          .pipe(map((rows) => rows.map((row) => this.adaptIifHistoryEntry(row, lookups)))),
      ),
    );
  }

  private getDemandHistory(path: string): Observable<NormalDemandHistoryEntry[]> {
    // BACKEND GAP: `{demands|pts}/pending-list/` are the only real data sources — there's no
    // dedicated "history" endpoint, so synced (is_sync=true) rows from the pending-list are used
    // as the closest real history. SurveyDetails/PTSDetails/DemandDetails carry no quantity or
    // date fields at all, so surveyNo/surveyDate/demandedQty/demandDate/moIssuedQty can't be
    // populated from real data.
    return this.lookups$.pipe(
      switchMap((lookups) =>
        this.http.get<PendingRow[]>(`${this.baseUrl}${path}`).pipe(
          map((rows) =>
            rows.filter((row) => row.is_sync).map((row) => this.adaptDemandHistory(row, lookups)),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------------------
  // Masters > Ship Inventory to MO Inventory Mapping
  // ---------------------------------------------------------------------------------------

  /** `sfd.ShipEquipment` options for the "INSMA Equipment Name" picker — same endpoint and shape
   * `ObsApiService.getShipEquipmentOptions()` already uses for the OBS module's equivalent picker;
   * `MoMappingTable.equipment` FKs the same `sfd.ShipEquipment` model. */
  getShipEquipmentOptions(): Observable<DropdownOption[]> {
    return this.http
      .get<BackendSfdTransactionEquipmentListResponse>(`${this.sfdBaseUrl}transaction-equipment/list/`)
      .pipe(map((response) => response.equipments.map((row) => ({ value: String(row.id), label: row.nomenclature }))));
  }

  /** Raw `MoMappingTable` rows — id-only (`ilms_spare_id`/`vendor_id`/`equipment`), joined against
   * vendor/item/equipment option labels by the caller (`mo-masters.ts` already loads all three for
   * the form's own dropdowns). */
  getMoMappings(): Observable<BackendMoMapping[]> {
    return this.http.get<BackendMoMapping[]>(`${this.baseUrl}mo-mappings/`);
  }

  /** `vendorId`/`itemCode` are `Vendor`/`Item`'s own primary keys (`vendor_code`/`item_code` are
   * both `primary_key=True` CharFields, not surrogate ids) — the exact values `getVendors()`/
   * `getItems()` already expose. `equipmentId` is the `sfd.ShipEquipment` numeric id from
   * `getShipEquipmentOptions()`. */
  createMoMapping(vendorId: string, itemCode: string, equipmentId: string): Observable<void> {
    return this.http
      .post(`${this.baseUrl}mo-mappings/`, {
        vendor_id: vendorId,
        ilms_spare_id: itemCode,
        equipment: Number(equipmentId),
      })
      .pipe(map(() => void 0));
  }

  // ---------------------------------------------------------------------------------------
  // Excel import (Masters > Import Data)
  // ---------------------------------------------------------------------------------------

  /** `POST {items|vendors}/import-excel/` (`ExcelImportExportMixin.import_excel`, shared by
   * `ItemViewSet`/`VendorViewSet`). All-or-nothing per file — a single invalid row rejects the
   * whole batch, there's no per-row partial commit like OBS's preview/commit pair. Dispatches to
   * Celery when a worker is available (`status: "accepted"` + poll `task_status_url`); resolves
   * inline otherwise, which is the common path in dev. `dryRun` validates without saving. */
  importExcel(kind: MoImportKind, file: File, dryRun: boolean): Observable<MoImportResult> {
    const formData = new FormData();
    formData.append("file", file);
    if (dryRun) formData.append("dry_run", "1");
    return this.http
      .post<BackendMoImportEnvelope>(`${this.baseUrl}${IMPORT_URL_SEGMENT[kind]}/import-excel/`, formData, {
        context: skipFeedback({ loader: true, toast: true }),
      })
      .pipe(
        switchMap((response) => this.resolveImportEnvelope(response)),
        catchError((error: unknown) => this.resolveImportError(error)),
      );
  }

  /** `GET {items|vendors}/download-template/` — header-only `.xlsx` of the importable columns. */
  downloadImportTemplate(kind: MoImportKind): Observable<Blob> {
    return this.http.get(`${this.baseUrl}${IMPORT_URL_SEGMENT[kind]}/download-template/`, { responseType: "blob" });
  }

  private resolveImportEnvelope(response: BackendMoImportEnvelope): Observable<MoImportResult> {
    if (response.status === "accepted" && response.task_status_url) {
      return this.pollImportTask(response.task_status_url, 0);
    }
    return of(this.adaptImportEnvelope(response));
  }

  private pollImportTask(taskStatusUrl: string, attempt: number): Observable<MoImportResult> {
    if (attempt >= 20) {
      return throwError(
        () => new Error("Import is taking longer than expected. Check back shortly and try again."),
      );
    }
    return timer(1500).pipe(
      switchMap(() => this.http.get<BackendMoImportTaskStatus>(this.absoluteUrl(taskStatusUrl))),
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

  private adaptImportEnvelope(response: BackendMoImportEnvelope): MoImportResult {
    const errors = (response.errors ?? []).map(
      (row): MoImportRowError => ({ row: row.row, errors: row.errors }),
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
   * too many rows, or row-validation failures) — resolved into a `MoImportResult` here (not
   * re-thrown) so the caller can render all three the same way it renders success, instead of
   * needing a separate error-handling branch. A genuinely unexpected error shape (network/500)
   * still propagates. */
  private resolveImportError(error: unknown): Observable<MoImportResult> {
    if (!(error instanceof HttpErrorResponse) || typeof error.error !== "object" || error.error === null) {
      return throwError(() => error);
    }
    const body = error.error as BackendMoImportEnvelope;
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

  // ---------------------------------------------------------------------------------------
  // Adapters
  // ---------------------------------------------------------------------------------------

  /** Survey/PTS/Demand entries reference either an ILMS-side `Item` (`ilms_spare_id`, a
   * item_code string) or an onboard `obs.Spares` row (`obs_spare_id`) — at most one is set. */
  private resolveItemFields(
    ilmsSpareId: string | null,
    obsSpareId: number | null,
    lookups: MoLookups,
  ): ResolvedItemFields {
    if (ilmsSpareId) {
      const item = lookups.items.get(ilmsSpareId);
      return {
        itemCode: item?.item_code ?? ilmsSpareId,
        itemDescription: item?.item_desc ?? "",
        denomination: item?.item_deno ?? "",
        category: item?.crp_category ?? "",
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

  /** `PendingRow` is a union of demand/pts/survey rows that only one of `demand_number`
   *  or `pts_number` exists on at a time — pick whichever is present. */
  private resolveTrackingNumber(row: PendingRow): string {
    if ("demand_number" in row) return row.demand_number;
    if ("pts_number" in row) return row.pts_number;
    return "";
  }

  private adaptPendingEntry(row: PendingRow, lookups: MoLookups): MoCartEntry {
    const fields = this.resolveItemFields(row.ilms_spare_id, row.obs_spare_id, lookups);
    const qty = typeof row.quantity_required === "number" ? row.quantity_required : Number(row.quantity_required);
    const number = this.resolveTrackingNumber(row);
    const equipmentClass =
      row.equipment_class && row.equipment_class !== "-" && row.equipment_class !== "—" ? row.equipment_class : "";
    return {
      id: String(row.id),
      syncStatus: row.is_sync ? "Synced" : "Not Synced",
      itemCode: fields.itemCode,
      itemDescription: fields.itemDescription,
      denomination: fields.denomination,
      qty: Number.isFinite(qty) ? qty : 0,
      category: fields.category,
      hodApprovalStatus: row.is_hod_approval ? "Approved" : "Pending",
      isHod: row.is_hod,
      dartNo: row.dart_number && row.dart_number !== "—" ? row.dart_number : "",
      ilmsDemandNo: number || "",
      demandNo: number || "",
      equipmentClass,
      equipmentNomenclature:
        row.equipment_nomenclature && row.equipment_nomenclature !== "—" ? row.equipment_nomenclature : "",
    };
  }

  private adaptIifCartEntry(row: BackendIif, lookups: MoLookups): MoCartEntry {
    const obsSpare = row.spare_id != null ? lookups.obsSpares.get(row.spare_id) : undefined;
    const equipmentClass = obsSpare ? lookups.obsEquipmentClasses.get(obsSpare.equipment_class)?.name ?? "" : "";
    return {
      id: String(row.id),
      syncStatus: row.is_sync ? "Synced" : "Not Synced",
      itemCode: obsSpare?.pattern_number ?? "",
      itemDescription: obsSpare?.description ?? "",
      denomination: "",
      // The IIF model carries no quantity field.
      qty: 0,
      category: obsSpare?.category ?? "",
      equipmentClass,
    };
  }

  private adaptReceiveRow(row: BackendReceiveRow, index: number): MoCartEntry {
    const qty = typeof row.demand_qty === "number" ? row.demand_qty : Number(row.demand_qty);
    return {
      // merged_receive_list rows are computed, not model instances — no backend id to reuse.
      id: `${row.source}-${index}-${row.demand_number || row.mo_item_code}`,
      // ReceiveDemandDetails-equivalent rows here carry no sync flag of their own.
      syncStatus: "Not Synced",
      itemCode: row.mo_item_code,
      itemDescription: row.item_description,
      denomination: row.denomination,
      qty: Number.isFinite(qty) ? qty : 0,
      category: row.crp_category,
      dartNo: row.dart_number && row.dart_number !== "—" ? row.dart_number : "",
      surveyNo: row.survey_number && row.survey_number !== "—" ? row.survey_number : "",
      demandNo: row.demand_number,
      moIssueStatus: row.in_progress_status,
      demandType: row.source,
      // BACKEND GAP: see `MoCartEntry.moIssueQty` — always "—" server-side today.
      moIssueQty:
        row.qty_issued_by_mo != null && String(row.qty_issued_by_mo) !== "—" ? String(row.qty_issued_by_mo) : "",
    };
  }

  private adaptApprovalEntry(kind: WorkflowKind, row: PendingRow, lookups: MoLookups): ApprovalEntry {
    const fields = this.resolveItemFields(row.ilms_spare_id, row.obs_spare_id, lookups);
    const obsSpare = row.obs_spare_id != null ? lookups.obsSpares.get(row.obs_spare_id) : undefined;
    const qty = typeof row.quantity_required === "number" ? row.quantity_required : Number(row.quantity_required);
    return {
      id: `${kind}:${row.id}`,
      spareCartName: kind,
      patternNo: fields.itemCode,
      spareDescription: fields.itemDescription,
      dartNo: row.dart_number && row.dart_number !== "—" ? row.dart_number : "",
      equipmentClass:
        row.equipment_class && row.equipment_class !== "-" && row.equipment_class !== "—" ? row.equipment_class : "",
      category: fields.category,
      critical: obsSpare?.critical ?? false,
      qty: Number.isFinite(qty) ? qty : 0,
    };
  }

  private adaptDemandHistory(row: PendingRow, lookups: MoLookups): NormalDemandHistoryEntry {
    const fields = this.resolveItemFields(row.ilms_spare_id, row.obs_spare_id, lookups);
    const number = this.resolveTrackingNumber(row);
    return {
      id: String(row.id),
      // Overwritten with real row-position by the component after the list loads.
      ser: 0,
      moItemCode: fields.itemCode,
      itemDescription: fields.itemDescription,
      category: fields.category,
      surveyNo: "",
      surveyDate: "",
      demandNo: number || "",
      demandedQty: 0,
      demandDate: "",
      moIssuedQty: 0,
      dartNo: row.dart_number && row.dart_number !== "—" ? row.dart_number : "",
      equipmentClass:
        row.equipment_class && row.equipment_class !== "-" && row.equipment_class !== "—" ? row.equipment_class : "",
      equipmentNomenclature:
        row.equipment_nomenclature && row.equipment_nomenclature !== "—" ? row.equipment_nomenclature : "",
      // BACKEND GAP: see `NormalDemandHistoryEntry` — no source field exists anywhere for these.
      onboardReceiptDate: "",
      onboardReceiptQty: "",
      gatePassNo: "",
      gatePassDate: "",
    };
  }

  /** See `getRioDemandHistory()` — PTS's "raised survey pending" rows are the closest real
   * substitute for a dedicated RIO history feed, which doesn't exist anywhere in the ilms app.
   * `rioType`/`dtg`/`year` have no backing field on `PTSDetails` at all and stay blank. */
  private adaptRioHistory(row: BackendPendingPts, lookups: MoLookups): RioHistoryEntry {
    const fields = this.resolveItemFields(row.ilms_spare_id, row.obs_spare_id, lookups);
    const qty = typeof row.quantity_required === "number" ? row.quantity_required : Number(row.quantity_required);
    return {
      id: String(row.id),
      ser: 0,
      rioType: "PTS",
      moItemCode: fields.itemCode,
      itemDescription: fields.itemDescription,
      rioDemandNo: row.pts_number || "",
      demandDate: "",
      dtg: "",
      year: "",
      dartNo: row.dart_number && row.dart_number !== "—" ? row.dart_number : "",
      qtyDemanded: Number.isFinite(qty) ? qty : 0,
      moIssueQty: 0,
      onboardReceiptDate: "",
      gatePassNo: "",
      equipmentClass:
        row.equipment_class && row.equipment_class !== "-" && row.equipment_class !== "—" ? row.equipment_class : "",
      equipmentNomenclature:
        row.equipment_nomenclature && row.equipment_nomenclature !== "—" ? row.equipment_nomenclature : "",
    };
  }

  private adaptIifHistoryEntry(row: BackendIif, lookups: MoLookups): IifHistoryEntry {
    const obsSpare = row.spare_id != null ? lookups.obsSpares.get(row.spare_id) : undefined;
    const equipmentClass = obsSpare ? lookups.obsEquipmentClasses.get(obsSpare.equipment_class)?.name ?? "" : "";
    return {
      id: String(row.id),
      ser: 0,
      // The IIF model carries no requisition number, sync date, completion date, or nomenclature
      // fields at all — `iif/history/` is just the plain IIF list filtered to `is_sync=True`, not
      // a real history view. `equipmentClass` (below) IS real — resolved the same way the IIF
      // cart already does, via the OBS spare's `equipment_class` id.
      iifRequisitionNo: "",
      iifRequisitionDate: "",
      ilmsSyncDate: "",
      swmmItemCode: obsSpare?.pattern_number ?? "",
      moItemCode: "",
      incattingCompletionDate: "",
      equipmentClass,
      equipmentNomenclature: "",
    };
  }
}
