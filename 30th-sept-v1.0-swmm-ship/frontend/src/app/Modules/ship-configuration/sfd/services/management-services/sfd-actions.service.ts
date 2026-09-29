import { Injectable, inject, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";

import { getErrorMessage } from "../../../../../Core/http/services/http-feedback";
import { formatDisplayDate, formatDisplayDateTime } from "../../../../../shared/utils/date-format";
import {
  ApprovalSfdRow,
  CATEGORY_TO_BODY_VALUE,
  categoryFromBodyValue,
  controlKey,
  DefectRecord,
  LOCATION_OPTIONS,
  RECENT_ACTIVITY_TAG_META,
  RecentActivityRow,
  SfdActionRow,
  SfdCategory,
  supplierFieldName,
} from "../../management/sfd-actions-fields.config";
import { RawAddSfdEquipmentOptions, SfdActionsApiService } from "./sfd-actions-api.service";
import {
  ApprovalTrackingUpdatePayload,
  Cat1TransactionPayload,
  Cat2TransactionPayload,
  Cat3TransactionPayload,
  CascadingDropdownValues,
  CmmsSyncResult,
  CompartmentDetail,
  GetTransactionListParams,
  PaginatedResponse,
  RawEquipmentTransactionRow,
  RawRecentActivityRow,
  RawRemovalDetails,
  RawUpdateSrNoDetails,
  RemovalRequestPayload,
  SfdActionReferenceData,
  SfdActionSubmitResult,
  SfdListFilterOptions,
  SfdTransactionType,
  SurveyDemandTransactionPayload,
  TransactionCreateCommonFields,
  TransactionCreatePayload,
  UpdateSerialNoPayload,
} from "./sfd-actions.models";

type CheckVals = Record<string, "Yes" | "No">;
interface FrameRange { from: string; to: string }
type RecordEditMode = "update" | "serial";

interface CompartmentCascadeValues {
  deck_no: string;
  frame_station_from: string;
  frame_station_to: string;
  location_code: string;
}

/**
 * `recent-activity/`'s `ship_id` param is matched against `ShipMaster.universal_id_m_ship`, which
 * has no frontend-facing endpoint (unlike every other SFD endpoint, which resolves "the ship"
 * server-side via a fixed deployment setting — see `get_configured_ship()`/`SWMM_SHIP_CODE` on the
 * backend). This deployment is single-ship, and "33" is that ship's id.
 */
const DEFAULT_SHIP_ID = "33";

/** localStorage key for the Recent Activity "dismissed before" watermark — see
 *  SfdActionsService.dismissSeenRecentActivity's own doc for why this lives client-side
 *  rather than as a real "seen" flag on the backend. */
const RECENT_ACTIVITY_DISMISSED_BEFORE_KEY = "sfd-recent-activity-dismissed-before";

/**
 * `model_universal_id`/`supplier_universal_id`/`manufacturer_universal_id` are unconditionally
 * `required` on the backend's common transaction serializer (`sfd/source_contract.py`), but
 * `_get_master_equipment`/`_get_master_supplier` silently no-op on an id that doesn't match any
 * real catalog row — so an id that resolves to nothing is exactly as safe as omitting it, just
 * without tripping "This field is required." A picked/typed Model, OEM Name, or Supplier with no
 * CMMS catalog match (including one that was blank/N-A to begin with — see isFieldEditable's
 * doc) needs SOME id to send; a freshly generated UUID satisfies the requirement without
 * fabricating a link to a catalog entry that doesn't exist.
 */
function generatedUniversalId(): string {
  // `crypto.randomUUID()` throws "is not a function" outside a secure context (HTTPS or
  // localhost) — this deployment is reached over plain HTTP via a LAN IP, which browsers
  // don't treat as secure, so the fast path silently doesn't exist there. `crypto.getRandomValues()`
  // has no such restriction (it's available in every context), so it's the fallback; only if
  // `crypto` itself is entirely missing does this drop to Math.random(). No cryptographic
  // strength is needed here — this id never links to a real catalog row (see the doc above),
  // it only has to be unique enough not to collide with another row in the same submission.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * `CompartmentSerializer` (`sfd/source_contract.py`) is a plain `ModelSerializer` with no
 * `to_representation()` override — `location` comes back as `CompartmentMaster.location`'s RAW
 * `TextChoices` value ("port_aft", "port_forward", "starboard_forward", "starboard_aft"), not a
 * display label. Keyed here (normalized) so it lines up 1:1 with `EquipmentTransaction.Location`'s
 * "1"-"4" codes.
 */
const COMPARTMENT_LOCATION_TO_TRANSACTION_LOCATION: Record<string, string> = {
  port_aft: "1",
  port_forward: "2",
  starboard_forward: "3",
  starboard_aft: "4",
};

/** Case/punctuation-insensitive lookup key — `CompartmentMaster.location` is free enough (older
 * rows, manual CMMS imports) that a stored value like "PORT AFT" or "Port-Aft" shouldn't fail to
 * match "port_aft" and silently leave the Add SFD form's Location dropdown unmapped. */
function normalizeLocationKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s,_-]+/g, "_").trim();
}

const NORMALIZED_COMPARTMENT_LOCATION_TO_TRANSACTION_LOCATION: Record<string, string> = Object.fromEntries(
  Object.entries(COMPARTMENT_LOCATION_TO_TRANSACTION_LOCATION).map(([label, code]) => [
    normalizeLocationKey(label),
    code,
  ]),
);

/** `CompartmentMaster.upper_deck`/`lower_deck` codes ("deck01", "deck1", ...) → their Django choice label ("Deck 01", "Deck 1", ...). */
function deckLabel(code: string | null): string {
  return code ? code.replace(/^deck/i, "Deck ") : "";
}

function toId(value: unknown): number | null {
  const n = Number(value);
  return value !== "" && value != null && !Number.isNaN(n) ? n : null;
}

const CASCADE_DATE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Survey & Demand / Local Purchase's "Location" field is Auto-Fetch (read-only text, not a
 * select) — `onEquipmentPicked`'s cascade (sfd-management.component.ts) deliberately stores the
 * human-readable label ("Port, Aft") in the control so it displays sensibly, since a raw "1"-"4"
 * code has nowhere else to become readable. That means the control's raw value is NOT always the
 * `EquipmentTransaction.Location` code the backend's `ChoiceField` requires — CAT I/II/III's own
 * Location dropdown DOES already store the code directly, so this must round-trip both cases.
 */
function toLocationCode(value: string): string | undefined {
  if (!value) return undefined;
  if (LOCATION_OPTIONS.some((o) => o.value === value)) return value;
  const match = LOCATION_OPTIONS.find((o) => o.label === value);
  return match ? String(match.value) : value;
}

/**
 * Mirror of `formatCascadeDate` (sfd-management.component.ts) — Survey & Demand / Local
 * Purchase's Auto-Fetch "Installation Date" stores that function's "DD-MMM-YYYY" DISPLAY string
 * in the control, not the ISO date the backend's `DateField` requires. CAT I/II/III's own
 * Installation Date (`<app-date-picker>`) already emits ISO `yyyy-MM-dd` directly, so this must
 * round-trip both cases.
 */
function toIsoDate(value: string): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
  if (match) {
    const [, dd, mmm, yyyy] = match;
    const monthIndex = CASCADE_DATE_MONTHS.findIndex((m) => m.toLowerCase() === mmm.toLowerCase());
    if (monthIndex >= 0) {
      return `${yyyy}-${String(monthIndex + 1).padStart(2, "0")}-${dd}`;
    }
  }
  return value;
}


/** A wired endpoint failed — surface the real error, never a simulated success. */
function toErrorResult(err: unknown): SfdActionSubmitResult {
  return { ok: false, error: getErrorMessage(err) };
}

/**
 * Business-logic layer for the SFD Actions tab: loads the real dropdown data from
 * `add-sfd-equipement/dropdowns`, turns the common dynamic form's raw values into either the
 * per-category create payload (`transaction/cat*`) or the Update payload (`sfd-list/{id}/`, whose
 * field names differ entirely from the create endpoints), and submits it via
 * `SfdActionsApiService`. Kept separate from that API service so payload-shaping logic doesn't
 * leak into HTTP plumbing.
 */
@Injectable({ providedIn: "root" })
export class SfdActionsService {
  private readonly api = inject(SfdActionsApiService);

  /** Which top-level Actions screen (Active list / Approval Tracking / Deleted) was showing —
   *  survives SfdManagementComponent being torn down entirely, which happens on EVERY Ship
   *  Configuration tab switch (sfd-shell.component.html's `@switch (activeTab())` destroys
   *  whichever screen isn't the current case, not just hides it). This service is `providedIn:
   *  "root"`, so it outlives that: a fresh SfdManagementComponent instance reads this back on
   *  init (see its own `view` signal) instead of always restarting at the default Active list —
   *  e.g. leaving "View Approval Status" open, switching to Reports, then back to Actions now
   *  lands back on Approval Tracking instead of resetting.
   *  Deliberately only 3 of MgmtView's 5 values: "add"/"approvalDetail" both depend on other,
   *  NOT-persisted component state (the in-progress addForm, or which specific request row was
   *  open) that a fresh instance has no way to reconstruct — restoring into either of those would
   *  land on a blank/broken screen instead of just resetting to the list, a worse outcome than
   *  the one this fixes. Only updated for the 3 safe values (see the component's own sync effect). */
  readonly lastMgmtView = signal<"list" | "approval" | "deleted">("list");

  /** Bumped (never read for its own value, only as a change signal) whenever
   *  SfdShellComponent sees the "Actions" header tab clicked while ALREADY on it — see its own
   *  doc for why that needs separate handling from `lastMgmtView` above: a plain
   *  `lastMgmtView.set("list")` would silently no-op whenever it already held "list" (e.g. the
   *  operator was mid Add-form, entered from the list), since signals don't notify on an
   *  unchanged value — which is exactly the common case this reset needs to keep working for. A
   *  counter that always increments sidesteps that: SfdManagementComponent's reverse-sync effect
   *  tracks this specifically to force `view` back to "list" unconditionally. */
  readonly resetToListTick = signal(0);

  /** Called by SfdShellComponent on that ignored same-URL "Actions" tab click — see
   *  resetToListTick's own doc. */
  requestActionsReset(): void {
    this.lastMgmtView.set("list");
    this.resetToListTick.update((n) => n + 1);
  }

  /** Loads the Add/Update form's dropdown data from the one consolidated, unpaginated endpoint. */
  async loadReferenceData(): Promise<SfdActionReferenceData> {
    const addSfd: RawAddSfdEquipmentOptions | null = await firstValueFrom(
      this.api.getAddSfdEquipmentDropdowns(),
    ).catch((err) => {
      // Previously swallowed silently — every dropdown (not just one) goes empty if this fails,
      // so a visible log is worth the noise for diagnosing exactly this kind of issue.
      console.error("[SfdActions] add-sfd-equipement/dropdowns/ failed — all Add/Update dropdowns will be empty", err);
      return null;
    });

    // `system_name` comes back double-nested (`[[...]]`) — a real bug in the backend's
    // AddSFDEquipementSerializer.to_representation, which hardcodes `[system_names]`. Flattened here.
    const systemRows = (addSfd?.system_name ?? []).flat();

    return {
      equipment: (addSfd?.equipment_name ?? []).map((e) => ({
        universalId: e.universal_id_m_equipment,
        label: e.equipment_name,
      })),
      systems: systemRows.map((s) => ({
        universalId: s.universal_id_m_equipment,
        label: s.system_name,
      })),
      models: (addSfd?.model ?? []).map((m) => ({ universalId: m.universal_id_m_equipment, label: m.model })),
      nomenclatures: (addSfd?.Nomenclature ?? []).map((n) => ({
        universalId: n.universal_id_m_equipment,
        label: n.Nomenclature,
      })),
      suppliers: (addSfd?.Supplier ?? []).map((s) => ({
        universalId: s.universal_id_M_supplier,
        label: s.supplier_name,
      })),
      manufacturers: (addSfd?.["OEM Name"] ?? []).map((m) => ({
        universalId: m.universal_id_M_supplier,
        label: m.manufacturer_name,
      })),
      equipmentSections: (addSfd?.["Equipment Section"] ?? []).map((s) => ({
        universalId: s.universal_id_m_sub_department,
        label: s.sub_department_name,
      })),
      equipmentTypes: (addSfd?.["Equipment Type"] ?? []).map((t) => ({
        universalId: t.universal_id_ch_master_equipment_type,
        label: t.name,
      })),
      compartments: (addSfd?.["Compartment Name"] ?? []).map((c) => ({
        id: c.compartment_id,
        name: c.compartment_name,
      })),
      oemPartNumbers: (addSfd?.["OEM Part No"] ?? [])
        .filter((p) => !!p.oem_part_no)
        .map((p) => ({ universalId: p.universal_id_m_equipment, label: p.oem_part_no })),
      shelfLives: Array.from(
        new Set((addSfd?.["Shelf Life"] ?? []).map((s) => s.shelf_lifes_name).filter((v) => v != null)),
      ),
    };
  }

  /** Equipment-mode cascade: pick an Equipment/System, get back the CMMS ids for its dependent fields. */
  async loadEquipmentCascade(
    universalIdMEquipment: string,
    nomenclature?: string,
  ): Promise<CascadingDropdownValues | null> {
    return firstValueFrom(
      this.api.getEquipmentCascade({ universal_id_m_equipment: universalIdMEquipment, nomenclature }),
    ).catch(() => null);
  }

  /**
   * Compartment pick cascade — `GET compartments/{id}/` is the real source (`get_equipment/` has no
   * compartment mode at all). Derives Deck No from `main_deck`/`upper_deck`/`lower_deck` (no direct
   * "deck_no" field exists on CompartmentMaster) and Location from its own port/starboard choice set.
   */
  async loadCompartmentCascade(compartmentId: number): Promise<CompartmentCascadeValues | null> {
    const compartment: CompartmentDetail | null = await firstValueFrom(
      this.api.getCompartment(compartmentId),
    ).catch((err) => {
      // Previously swallowed silently — Deck No/Frame Station/Location would just stay unmapped
      // with nothing in the console to explain why (e.g. a compartment picked from the dropdown
      // that 404s here — a stale/soft-deleted compartment still listed there).
      console.error(`[SfdActions] compartments/${compartmentId}/ failed — Deck No/Frame Station/Location won't map`, err);
      return null;
    });
    if (!compartment) return null;

    const deckNo = compartment.main_deck
      ? "Main Deck"
      : deckLabel(compartment.upper_deck) || deckLabel(compartment.lower_deck);

    return {
      deck_no: deckNo,
      frame_station_from: compartment.frame_station_from != null ? String(compartment.frame_station_from) : "",
      frame_station_to: compartment.frame_station_to != null ? String(compartment.frame_station_to) : "",
      location_code: compartment.location
        ? NORMALIZED_COMPARTMENT_LOCATION_TO_TRANSACTION_LOCATION[normalizeLocationKey(compartment.location)] ?? ""
        : "",
    };
  }

  /** Duplicate-serial guard — resolves `true` when the given serial is already on an Active
   *  equipment record. Fails open (returns `false`) on a network error rather than blocking
   *  submission over a check that couldn't run. */
  async serialAlreadyExists(serialNo: string, excludeId?: number): Promise<boolean> {
    if (!serialNo.trim()) return false;
    return firstValueFrom(this.api.checkSerialExists(serialNo.trim(), excludeId))
      .then((res) => res.exists)
      .catch(() => false);
  }

  /** Active list grid — real server-side pagination. */
  async loadTransactionList(
    params: GetTransactionListParams,
  ): Promise<PaginatedResponse<RawEquipmentTransactionRow>> {
    return firstValueFrom(this.api.getTransactionList(params));
  }

  /** Direct fetch by real PK — see SfdActionsApiService.getTransactionById's doc. `null` on any
   *  failure (not found, network) so callers can fall back rather than throw. */
  async loadTransactionById(equipmentShipId: number): Promise<RawEquipmentTransactionRow | null> {
    return firstValueFrom(this.api.getTransactionById(equipmentShipId)).catch(() => null);
  }

  /** Active list filter dropdowns (Equipment Name/Nomenclature/Sub Dept/Maintop) — cascades both
   *  ways: `equipmentName` re-scopes Nomenclature when the Equipment Name filter changes, and
   *  `nomenclature` re-scopes Equipment Name/Sub Dept/Maintop when the Nomenclature filter
   *  changes, so either pick narrows the others down to what's actually fitted together. */
  async loadSfdListFilterOptions(
    equipmentName?: string,
    nomenclature?: string,
  ): Promise<SfdListFilterOptions | null> {
    return firstValueFrom(this.api.getSfdListFilterOptions(equipmentName, nomenclature)).catch((err) => {
      console.error("[SfdActions] sfd-list/filter-options/ failed — Active list filters will be empty", err);
      return null;
    });
  }

  /** Maintop No. hyperlink (Active list grid) — fetches the equipment's Maintop PDF as a blob for
   *  the caller to save via ReportExportService.downloadBlob(). Throws on failure so the caller's
   *  own try/catch can raise a notification — unlike loadSfdListFilterOptions above, there's no
   *  sensible empty fallback for "the file failed to load". */
  async downloadMaintopPdf(equipmentMasterId: number): Promise<Blob> {
    return firstValueFrom(this.api.getMaintopPdf(equipmentMasterId));
  }

  /** Raw (pre-format) dates of whatever loadRecentActivity() last returned — dismissSeenRecent
   *  Activity() reads this to know how far to move the "dismissed before" watermark forward. */
  private lastRecentActivityMaxDate: string | null = null;

  /**
   * Recent Activity popup (SFD Management header). `recent-activity/` requires a `ship_id` param
   * with no fallback (unlike every other SFD endpoint, which resolves "the ship" server-side) —
   * see `DEFAULT_SHIP_ID`'s doc for why this is a fixed constant rather than fetched per request.
   *
   * Rows at or before the "dismissed before" watermark (see dismissSeenRecentActivity) are left
   * out — the operator already opened the popup and closed it once with them showing, so they
   * shouldn't reappear on a later open just because RecentActivityAPIView re-derives the same
   * still-pending request every time it's called.
   */
  async loadRecentActivity(limit = 15): Promise<RecentActivityRow[]> {
    const rows = await firstValueFrom(
      this.api.getRecentActivity({ ship_id: DEFAULT_SHIP_ID, limit }),
    ).catch((err) => {
      console.error("[SfdActions] recent-activity/ failed", err);
      return null;
    });
    if (!rows) return [];

    const dismissedBefore = this.getRecentActivityDismissedBefore();
    const visible = dismissedBefore
      ? rows.filter((row) => !row.date || row.date > dismissedBefore)
      : rows;

    this.lastRecentActivityMaxDate = visible.reduce<string | null>(
      (max, row) => (row.date && (!max || row.date > max) ? row.date : max),
      dismissedBefore,
    );

    return visible.map((row) => this.toRecentActivityRow(row));
  }

  /** Called when the Recent Activity popup is closed — every row shown in the session's last
   *  load won't be shown again on a later open, same "seen it, dismissed it" idea a
   *  notification tray's read/unread state has. Persisted in localStorage rather than the
   *  backend: RecentActivityAPIView is read-derived straight off ChangeEquipmentRequest/
   *  RemoveEquipment/ShipEquipment with no standalone activity-log table to flag a row
   *  "seen" on — this is per-browser, not synced across devices, but needs no backend change
   *  to get the behaviour the popup's Close button is meant to have. */
  dismissSeenRecentActivity(): void {
    if (!this.lastRecentActivityMaxDate) return;
    try {
      localStorage.setItem(RECENT_ACTIVITY_DISMISSED_BEFORE_KEY, this.lastRecentActivityMaxDate);
    } catch {
      // Best-effort — localStorage can throw in private browsing / with storage disabled;
      // worst case the popup just shows the same rows again next time it's opened.
    }
  }

  private getRecentActivityDismissedBefore(): string | null {
    try {
      return localStorage.getItem(RECENT_ACTIVITY_DISMISSED_BEFORE_KEY);
    } catch {
      return null;
    }
  }

  private toRecentActivityRow(row: RawRecentActivityRow): RecentActivityRow {
    const meta = RECENT_ACTIVITY_TAG_META[row.tag] ?? { icon: "submitted", tone: "info" };
    return {
      icon: meta.icon,
      name: row.equipment || "—",
      tag: row.tag,
      tone: meta.tone,
      code: row.code || "—",
      detail: row.others || "",
      date: formatDisplayDateTime(row.date),
      by: row.createdby || "—",
    };
  }

  /**
   * Builds the CAT I/II/III/Survey & Demand common field set — shared by `POST transaction/cat*`
   * (via buildCreatePayload) AND `PUT sfd-list/{id}/` (via buildUpdatePayload), since Update always
   * resolves to the same base serializer regardless of category (see the type doc on
   * TransactionCreateCommonFields). Field names confirmed against `sfd/serializers.py`.
   */
  private buildCommonFields(
    category: SfdCategory,
    sfdType: SfdTransactionType,
    formValue: Record<string, unknown>,
    serial: string,
    frame: FrameRange,
    checkVals: CheckVals,
    ref: SfdActionReferenceData,
  ): TransactionCreateCommonFields {
    const get = (name: string): string => (formValue[controlKey(name)] as string) ?? "";
    const rhKeys = Object.keys(checkVals);
    const rhKey = rhKeys[0];
    const rhApplicable = rhKey ? checkVals[rhKey] === "Yes" : false;
    const rhValue = get("R|H (Running Hours) as on date") || get("R/H of new eqpt at installation");
    const isSystem = sfdType === "system";

    const equipmentLabel = get("Equipment Name");
    const matchList = isSystem ? ref.systems : ref.equipment;
    const equipmentMatch = matchList.find((e) => e.label === equipmentLabel);
    const manufacturerName = get("OEM Name");
    const supplierName = get(supplierFieldName(category));
    const manufacturerMatch = ref.manufacturers.find((m) => m.label === manufacturerName);
    const supplierMatch = ref.suppliers.find((s) => s.label === supplierName);
    // The extra "System Name" field the component adds for Equipment-mode transactions (bound to
    // control key "sysName") is now a real CMMS system pick (options sourced from ref.systems, same
    // as Equipment Name) — so it resolves to a real universal_id. CAT1/CAT2/CAT3/Survey require
    // system_universal_id even in Equipment mode, so it needs this value rather than being left
    // blank whenever isSystem is false.
    const sysNameValue = (formValue["sysName"] as string) ?? "";
    const sysNameMatch = ref.systems.find((s) => s.label === sysNameValue);
    const modelMatch = ref.models.find((m) => m.label === get("Model"));

    return {
      type: sfdType,
      category: CATEGORY_TO_BODY_VALUE[category],
      equipment_universal_id: isSystem ? undefined : equipmentMatch?.universalId,
      system_universal_id: isSystem ? equipmentMatch?.universalId : sysNameMatch?.universalId,
      model_universal_id: modelMatch?.universalId ?? generatedUniversalId(),
      nomenclature: get("Nomenclature"),
      manufacturer_universal_id: manufacturerMatch?.universalId ?? generatedUniversalId(),
      supplier_universal_id: supplierMatch?.universalId ?? generatedUniversalId(),
      oem_part_no: get("OEM Part No") || undefined,
      // "Equipment Serial No" is `type: "Auto Fetch"` on CAT I/Survey & Demand/Local Purchase
      // specifically so it does NOT match isSerialSpec (see FIELD_SPECS's doc on that field) — it
      // stays a normal addForm control there, so `get()` reads it directly. CAT II/III have no
      // such field (their own "Equipment Serial No" IS the isSerialSpec match, describing the one
      // equipment outright), where `get()` returns "" and this falls back to `serial` (the
      // isSerialSpec-matched control's value) exactly as it always has.
      serial_no: get("Equipment Serial No") || serial,
      // CAT I only: Deck No/Location/Compartment Name each have a "(New Eqpt)" fallback control
      // (see FIELD_SPECS' doc) that's a genuinely separate addForm control, never mirrored into
      // its Old counterpart — Old stays blank/locked when CMMS had nothing, and the operator's
      // pick lives only in the New box instead. `get()` on the "(New Eqpt)" name is just "" on
      // every other category (no such control exists there), so this OR is a no-op for them.
      deck_no: get("Deck No") || get("Deck No (New Eqpt)"),
      location: toLocationCode(get("Location") || get("Location (New Eqpt)")),
      compartment_name: get("Compartment Name") || get("Compartment Name (New Eqpt)"),
      frame_station_from: frame.from,
      frame_station_to: frame.to,
      installation_date: toIsoDate(get("Installation Date")),
      // CAT I renamed its own "Authority for Installation" to "Authority of Installation (New
      // Eqpt)" (see FIELD_SPECS) — same "OR is a no-op on every other category" reasoning as
      // deck_no/location/compartment_name above.
      authority_of_installation:
        get("Authority for Installation") ||
        get("Authority of Installation (New Eqpt)") ||
        get("Installation Authority"),
      authority_date: get("Authority Date") || undefined,
      qty_fitted: toId(get("Qty Fitted")),
      shell_life: toId(get("Shelf Life")),
      rh_at_installation: rhApplicable ? toId(rhValue) : null,
      equipment_section: get("Sub Department"),
      // No "Equipment Type" field on any category's form (removed by product direction) — matches
      // the backend, which excludes `equipment_type` from Meta.fields on every category serializer.
    };
  }

  /**
   * Builds the payload for `POST transaction/cat*`. Local Purchase now shares the Survey & Demand
   * field set (see FIELD_SPECS — explicit product direction), so it shares this same payload shape
   * too; `createCategoryTransaction` still routes each to its own category-specific endpoint.
   */
  buildCreatePayload(
    category: SfdCategory,
    sfdType: SfdTransactionType,
    formValue: Record<string, unknown>,
    serial: string,
    frame: FrameRange,
    checkVals: CheckVals,
    ref: SfdActionReferenceData,
  ): TransactionCreatePayload {
    const get = (name: string): string => (formValue[controlKey(name)] as string) ?? "";
    const isSystem = sfdType === "system";
    const equipmentLabel = get("Equipment Name");
    const sysNameValue = (formValue["sysName"] as string) ?? "";
    const common = this.buildCommonFields(category, sfdType, formValue, serial, frame, checkVals, ref);

    // CAT I's own "New Equipment Info" fields — see Cat1TransactionPayload's doc for why these
    // reuse Survey & Demand's exact "new_*" backend fields rather than a fresh set of columns.
    // Not used by CAT II (explicit product direction keeps it on the original flat field set).
    const oldNewFields = {
      // "Old Equipment Removal Date" on the wire — renamed from the plain "Removal Date" FIELD_SPECS
      // used to have (see its own doc there for why); the backend field name (removal_date) is unaffected.
      removal_date: get("Old Equipment Removal Date") || undefined,
      authority_of_removal: get("Removal Authority"),
      new_installation_date: get("Date of Installation (New Eqpt)") || undefined,
      // "New Eqpt Serial Number" is the only isSerialSpec-matched control on this form (the Old
      // group's own "Equipment Serial No" is `type: "Auto Fetch"`, dodging that match on purpose —
      // see FIELD_SPECS's doc on it) — it's the newly-installed equipment's serial, so it belongs
      // in new_serial_no. common.serial_no now carries the OLD equipment's serial instead (see
      // buildCommonFields).
      new_serial_no: serial,
      // CAT I's "Installation Remarks (New Eqpt)" (single-slot fallback, same reasoning as
      // "Compartment Name (New Eqpt)") mirrors straight into "Installation Remarks" itself the
      // moment it's typed (see mirrorIntoOldControl, sfd-management.component.ts) — so this plain
      // read is already correct regardless of which of the two boxes the operator used.
      installation_remark: get("Installation Remarks"),
      new_service_life: toId(get("Shelf Life (New Eqpt)")),
    };

    switch (category) {
      case "CAT I": {
        const payload: Cat1TransactionPayload = { ...common, ...oldNewFields };
        return payload;
      }
      case "CAT II": {
        // Explicit product direction: CAT II does NOT get CAT I's Old/New split — ...oldNewFields
        // deliberately left out here, unlike CAT I's own case above.
        //
        // "Equipment Name" doubles as a free-text field right in the same dropdown (see
        // SelectInput.allowCustomValue) — common.equipment_universal_id only resolves when the
        // typed/picked label actually matched a real CMMS catalog entry (buildCommonFields'
        // equipmentMatch), so its absence in Equipment mode means the user typed a name CMMS
        // doesn't have, which belongs in new_equipment_name instead (same escape hatch CAT III
        // already has for its own equipment name, just without a separate field for it here).
        const payload: Cat2TransactionPayload = {
          ...common,
          new_equipment_name: !isSystem && !common.equipment_universal_id ? equipmentLabel : undefined,
        };
        return payload;
      }
      case "CAT III": {
        const payload: Cat3TransactionPayload = {
          ...common,
          new_equipment_name: isSystem ? undefined : equipmentLabel,
          new_system_name: isSystem ? equipmentLabel : sysNameValue || undefined,
          new_nomenclature: common.nomenclature,
          // "OEM Name" itself now also accepts a hand-typed value (see SelectInput.allowCustomValue,
          // toDisplayField's allowCustomModel) — when that typed text doesn't match a real catalog
          // entry (common.manufacturer_universal_id stays unresolved), it belongs in new_oem_name
          // just like the sentinel-triggered "New OEM Name" field does.
          new_oem_name: get("New OEM Name") || (!common.manufacturer_universal_id ? get("OEM Name") : undefined),
          new_supplier_name: get("New OEM Supplier Name"),
          new_oem_part_no: get("New OEM Part No"),
          new_serial_no: serial,
        };
        return payload;
      }
      case "Survey & Demand":
      case "Local Purchase": {
        const payload: SurveyDemandTransactionPayload = { ...common, ...oldNewFields };
        return payload;
      }
      default:
        return common;
    }
  }

  /**
   * Builds the payload for `PUT sfd-list/{id}/`. `SFDTransactionViewSet.get_serializer_class()`
   * (backend) resolves `update` (PUT) to the SAME category-specific serializer create uses
   * (CAT1Serializer/SurveySerializer/OthersSerializer/...), not a generic base serializer (see the
   * type doc on TransactionCreateCommonFields) — so CAT I/Survey & Demand/Local Purchase's "New
   * Equipment Info" fields (oldNewFields, same as buildCreatePayload's own) WOULD be accepted here
   * too — but genuine Update no longer shows or collects that group at all
   * (displayFieldGroups/buildControlsForSpecs both drop it for a genuine Update — reverted back to
   * a single flat form regardless of category, explicit product direction), so there's nothing
   * real to read out of `formValue` for those fields any more. Sending them anyway would mean
   * blasting removal_date/authority_of_removal/etc. to blank on every single Update submission,
   * silently wiping whatever real values the record already had — worse than just not sending
   * them. `common` alone is exactly what this form can genuinely collect during a genuine Update
   * now. Ported from Aug_15.
   */
  buildUpdatePayload(
    category: SfdCategory,
    sfdType: SfdTransactionType,
    formValue: Record<string, unknown>,
    serial: string,
    frame: FrameRange,
    checkVals: CheckVals,
    ref: SfdActionReferenceData,
  ): TransactionCreateCommonFields {
    return this.buildCommonFields(category, sfdType, formValue, serial, frame, checkVals, ref);
  }

  /**
   * Submits an Add/Update SFD action. Create POSTs to the category-specific `transaction/cat*`
   * endpoint; Update PUTs to `sfd-list/{id}/` (no per-category update route was given) — both now
   * share the same field set (buildCommonFields), Update just omits the per-category "new_*" ones.
   */
  async submitAction(input: {
    category: SfdCategory;
    sfdType: SfdTransactionType;
    formValue: Record<string, unknown>;
    serial: string;
    frame: FrameRange;
    checkVals: CheckVals;
    ref: SfdActionReferenceData;
    isEditing: boolean;
    recordId?: string | number;
  }): Promise<SfdActionSubmitResult> {
    const { category, sfdType, formValue, serial, frame, checkVals, ref, isEditing, recordId } = input;
    try {
      if (isEditing && recordId) {
        const payload = this.buildUpdatePayload(category, sfdType, formValue, serial, frame, checkVals, ref);
        await firstValueFrom(this.api.updateTransaction(recordId, payload));
      } else {
        const payload = this.buildCreatePayload(category, sfdType, formValue, serial, frame, checkVals, ref);
        await firstValueFrom(this.api.createCategoryTransaction(category, payload));
      }
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  }

  /** Change Serial Number form prefill — `GET sfd-list/{id}/update_sr_no_details/`. Returns `null`
   * on failure so the form can fall back to the grid row's own fields instead of blocking. */
  async loadUpdateSrNoDetails(equipmentShipId: string | number): Promise<RawUpdateSrNoDetails | null> {
    return firstValueFrom(this.api.getUpdateSrNoDetails(equipmentShipId)).catch(() => null);
  }

  /**
   * "serial" mode is the Change Serial flow — `POST sfd-list/{id}/update_sr_no/`, which writes a
   * `RemoveEquipmentRequest` with `request_type: 2`. "update" mode is the qty/serial Record Edit
   * modal — a direct PATCH on the real `EquipmentTransaction` row.
   */
  async submitRecordEdit(
    row: SfdActionRow,
    mode: RecordEditMode,
    formValue: {
      serial: string;
      qty: string;
      equipmentNomenclature?: string;
      currentSrNo?: string;
      subDept?: string;
      maintopNo?: string;
      removalAuthority?: string;
      removalDate?: string;
      installationDate?: string;
    },
  ): Promise<SfdActionSubmitResult> {
    try {
      if (mode === "serial") {
        // `row.*` is the grid's cached SfdActionRow — it can lag or be blank for fields the backend
        // now sources from `update_sr_no_details/` (see `RawUpdateSrNoDetails`), so the caller-supplied
        // values (already reconciled against that fetch) take priority; `row` is only a last-resort.
        const payload: UpdateSerialNoPayload = {
          equipment_nomenclature: formValue.equipmentNomenclature || row.nomen,
          current_sr_no: formValue.currentSrNo || row.serial,
          sub_dept: formValue.subDept || row.dept,
          maintop_no: formValue.maintopNo || row.maintop,
          new_sr_no: formValue.serial,
          removal_authority: formValue.removalAuthority ?? "",
          removal_date: formValue.removalDate ?? "",
          installation_date: formValue.installationDate ?? "",
        };
        await firstValueFrom(this.api.updateSerialNumber(row.id, payload));
      } else {
        await firstValueFrom(
          this.api.patchTransaction(row.id, {
            no_of_fits: formValue.qty ? Number(formValue.qty) : null,
            equipment_sr_no: formValue.serial || undefined,
          }),
        );
      }
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  }

  /** Dependency check before Remove — flattens `open_defects`/`maintenance_routines` into one list for
   * the "choose how to proceed" screen. Defends against either list coming back missing/null (not just
   * `[]`) so a malformed response can't throw and strand the Remove flow on its default stage. */
  async loadOpenDependencies(equipmentShipId: string | number): Promise<DefectRecord[]> {
    const deps = await firstValueFrom(this.api.getOpenDependencies(equipmentShipId)).catch(() => null);
    if (!deps) return [];
    const defects: DefectRecord[] = (deps.open_defects ?? []).map((d) => ({
      id: d.defect_no,
      type: "Defect",
      desc: d.title,
      raised: "—",
      priority: d.severity ?? "—",
      status: d.status,
    }));
    const routines: DefectRecord[] = (deps.maintenance_routines ?? []).map((r) => ({
      id: r.routine_no,
      type: "Routine",
      desc: r.title,
      raised: formatDisplayDate(r.due_date),
      priority: "—",
      status: r.status,
    }));
    return [...defects, ...routines];
  }

  /** Removal Details form prefill — `GET sfd-list/{id}/remove-details/`. Returns `null` on failure so the
   * form can fall back to the grid row's own fields instead of blocking the Remove flow. */
  async loadRemovalDetails(equipmentShipId: string | number): Promise<RawRemovalDetails | null> {
    return firstValueFrom(this.api.getRemovalDetails(equipmentShipId)).catch(() => null);
  }

  /** Removal Details form submit — `POST sfd-list/{id}/remove/`, writes a `RemoveEquipmentRequest` (`request_type: 1`). */
  async submitRemoval(
    row: SfdActionRow,
    form: {
      removalDate: string;
      authority: string;
      remarks: string;
      equipmentNomenclature?: string;
      equipmentSrNo?: string;
      subDept?: string;
      compartmentName?: string;
    },
  ): Promise<SfdActionSubmitResult> {
    try {
      // `row.*` is the grid's cached SfdActionRow — it can be blank for fields the backend now
      // sources from `remove-details/` (see `RawRemovalDetails`), so the caller-supplied values
      // (already reconciled against that fetch, and what's actually shown in the form) take
      // priority; `row` is only a last-resort fallback.
      const payload: RemovalRequestPayload = {
        equipment_nomenclature: form.equipmentNomenclature || row.nomen,
        equipment_sr_no: form.equipmentSrNo || row.serial,
        sub_dept: form.subDept || row.dept,
        compartment_name: form.compartmentName || row.compartment,
        removal_date: form.removalDate,
        removal_authority: form.authority,
        removal_remark: form.remarks,
      };
      await firstValueFrom(this.api.submitRemoval(row.id, payload));
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  }

  /** "View Approval Status" grid — GET approval-tracking/, a flat array combining Remove + Change Sr. No. requests. */
  async loadApprovalTracking(): Promise<ApprovalSfdRow[]> {
    const rows = await firstValueFrom(this.api.getApprovalTracking());
    return rows.map((r) => ({
      id: r.request_id,
      eqp: r.equipment || "—",
      cat: categoryFromBodyValue(r.transaction_category),
      by: r.submitted_by || "—",
      date: formatDisplayDateTime(r.submitted),
      status: r.status,
      officer: r.insma_officer || "—",
      remarks: r.insma_remarks || "—",
      approveDate: formatDisplayDateTime(r.approve_date),
      lastUpdatedDate: formatDisplayDateTime(r.updated_date),
      requestType: r.category.toLowerCase() as "remove" | "change",
      transactionCategoryRaw: r.transaction_category,
      equipmentSrNo: r.equipment_sr_no || "",
      subDept: r.sub_dept || "",
      compartmentName: r.compartment_name || "",
      removalDate: r.removal_date || "",
      removalAuthority: r.removal_authority || "",
      removalRemark: r.removal_remark || "",
      equipmentShipId: r.equipment_ship_id,
    }));
  }

  /**
   * Resubmits a "Returned" approval request — `PUT approval-tracking/?request_id=...`. `row` is
   * the pre-edit `ApprovalSfdRow` (for `requestType`/`transactionCategoryRaw`/current
   * `insma_remarks`, which must be echoed back unchanged or the backend blanks them out — see
   * `ApprovalTrackingUpdatePayload`'s doc), `formValue` is what the correction form actually edited.
   */
  async submitApprovalCorrection(
    row: ApprovalSfdRow,
    formValue: { eqp: string; cat: string; by: string; date: string; correctionNote: string },
  ): Promise<SfdActionSubmitResult> {
    const payload: ApprovalTrackingUpdatePayload = {
      category: row.requestType,
      equipment: formValue.eqp,
      transaction_category: CATEGORY_TO_BODY_VALUE[formValue.cat as SfdCategory] ?? row.transactionCategoryRaw,
      submitted_by: formValue.by,
      submitted: formValue.date,
      insma_remarks: row.remarks === "—" ? "" : row.remarks,
      amendment_note: formValue.correctionNote || "",
    };
    try {
      await firstValueFrom(this.api.updateApprovalTracking(row.id, payload));
      return { ok: true };
    } catch (err) {
      return toErrorResult(err);
    }
  }

  /** Marks an Approval Tracking row as viewed (see the API method's own doc) — best-effort, fire-
   *  and-forget from the caller's point of view: a failure here just means the row keeps showing
   *  next time the grid is fetched (the same as if it had never been opened), not a broken submit,
   *  so it deliberately swallows its own error instead of surfacing one. */
  async markApprovalRequestViewed(row: ApprovalSfdRow): Promise<void> {
    await firstValueFrom(this.api.markApprovalRequestViewed(row.id, row.requestType)).catch(() => undefined);
  }

  /** "Sync with CMMS" button (Approval Tracking screen) — `POST pull-requests-from-cmms/`. Pulls
   * down anything CMMS has approved/rejected since the last sync (change/removal requests +
   * pending equipment statuses) and applies it locally; the caller re-fetches
   * `loadApprovalTracking()` afterward so the grid reflects whatever this just applied. */
  async syncWithCmms(): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
    try {
      const result: CmmsSyncResult = await firstValueFrom(this.api.syncWithCmms());
      return { ok: true, message: result.message };
    } catch (err) {
      return { ok: false, error: getErrorMessage(err) };
    }
  }
}
