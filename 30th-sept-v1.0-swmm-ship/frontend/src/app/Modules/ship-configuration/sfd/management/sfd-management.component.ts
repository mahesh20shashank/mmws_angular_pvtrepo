import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  ChangeDetectorRef,
  Component,
  computed,
  signal,
  effect,
  inject,
  untracked,
  OnDestroy,
  ChangeDetectionStrategy,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NgTemplateOutlet } from "@angular/common";
import { firstValueFrom } from "rxjs";

import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import type { CellCallbackParams } from "ag-grid-community";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { ReportExportService } from "../../../../Core/services/export/generic-export.service";
import { formatDisplayDate } from "../../../../shared/utils/date-format";

import {
  DataGrid,
  ActionRendererComponent,
  GridAction,
  GridStatusChipRenderer,
  LinkIconCellRenderer,
  DatePickerComponent,
  DetailDrawer,
  DrawerStat,
  InputField,
  ModalComponent,
  SelectInput,
  DropdownOption,
  StatusChip,
  ChipTone,
  TextareaInput,
  IconComponent
} from "../../../../shared/components";



import { CompartmentForm } from "../config/compartment-form/compartment-form";
import { Compartment } from "../config/sfd-config.models";
import { NetworkStatusService } from "../../../../Core/http/services/network-status.service";
import { SfdReferenceDataApiService } from "../services/sfd-reference-data-api.service";
import { SfdActionsService } from "../services/management-services/sfd-actions.service";
import { SfdAddFormDraftService } from "./sfd-add-form-draft.service";
import {
  CascadingDropdownValues,
  RawEquipmentTransactionRow,
  RawRemovalDetails,
  RawUpdateSrNoDetails,
  SfdActionReferenceData,
  SfdListFilterOptions,
} from "../services/management-services/sfd-actions.models";

import {
  ACTION_FILTER_DEFS,
  ActionFieldSpec,
  APPROVAL_STATUS_LABEL_MAP,
  APPROVAL_STATUS_TONE_MAP,
  ApprovalSfdRow,
  ApprovalStatus,
  categoryFromBodyValue,
  categoryFromSlug,
  controlKey,
  DefectRecord,
  DeletedSfdRow,
  EQUIPMENT_HISTORY_SECTIONS,
  EQUIPMENT_HISTORY_STATS,
  fieldGroupTitle,
  FIELD_SPECS,
  LOCATION_OPTIONS,
  OptionSetMap,
  PREFILL_FIELD_MAP,
  RecentActivityRow,
  SFD_CATEGORIES,
  SfdActionRow,
  SfdCategory,
  SfdListFilterParamKey,
  optionsFor,
  supplierFieldName,
} from "./sfd-actions-fields.config";

type MgmtView = "list" | "add" | "deleted" | "approval" | "approvalDetail";
type SfdType = "Equipment" | "System";
type RecModalMode = "update" | "serial";
type FieldKind = "select" | "text" | "number" | "date" | "check" | "serial" | "auto" | "frameRange";
type RemoveStage = "loading" | "choose" | "defects" | "form" | "confirm";
type RemoveOption = "close" | "associate" | null;
type FilterValue = string | number | boolean | null | undefined;

interface DisplayField {
  key: string;
  rawName: string;
  label: string;
  required: boolean;
  badge: string;
  badgeColor: string;
  placeholder: string;
  kind: FieldKind;
  options: DropdownOption[];
  /** Deck No / Location / Frame Station are always populated by the Compartment Name cascade
   * (see onCompartmentPicked) — never hand-typed, in Add mode or Update mode alike. */
  readonly: boolean;
  /** Survey & Demand/Local Purchase only — see ActionFieldSpec.group's doc. */
  group?: "old" | "new";
  /** kind "select" only — lets SelectInput accept a hand-typed value that doesn't match any
   *  option, instead of only ever accepting a picked one. See CAT II's "Equipment Name". */
  allowCustomValue?: boolean;
}

interface DisplayFieldGroup {
  /** null renders as a flat, unheaded field grid — every category except Survey & Demand/Local
   *  Purchase, which don't have a genuine old-vs-new-equipment split to show a heading for. */
  title: string | null;
  fields: DisplayField[];
}

interface DisplayFieldValue {
  label: string;
  value: string;
  badge: "CMMS" | "User";
  badgeColor: string;
}

const TONE_COLOR: Record<ChipTone, string> = {
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#F82C36",
  info: "#4AA8FF",
  neutral: "#9db6cc",
};

function isSerialSpec(s: ActionFieldSpec): boolean {
  return s.type === "Text" && /Serial No$|Serial Number$/i.test(s.name);
}

/** Maps a fallback New-group field's name to the Old field it stands in for — both naming
 * conventions in play (see FIELD_SPECS' own docs): the generic "(if not auto-fetched)" batch,
 * and Compartment Name/Installation Remarks' earlier "(New Eqpt)" pair (kept under that name
 * since they shipped before the wider batch existed). `null` for every other New-group field
 * (Removal Date, New Eqpt Serial Number, "Shelf Life (New Eqpt)", ...) — those are genuinely
 * independent, always-required values, not a fallback for anything, so displayFields() must
 * never hide them. */
function fallbackOldFieldName(specName: string): string | null {
  const genericSuffix = " (if not auto-fetched)";
  if (specName.endsWith(genericSuffix)) return specName.slice(0, -genericSuffix.length);
  if (specName === "Compartment Name (New Eqpt)") return "Compartment Name";
  if (specName === "Installation Remarks (New Eqpt)") return "Installation Remarks";
  if (specName === "Deck No (New Eqpt)") return "Deck No";
  if (specName === "Location (New Eqpt)") return "Location";
  if (specName === "Frame Station (New Eqpt)") return "Frame Station";
  return null;
}

/** "OEM Part No" itself, and CAT I's own "(if not auto-fetched)" fallback for it (see
 * FIELD_SPECS' doc on that suffix) — both need optionsForSpec's picked-equipment-scoped list
 * (not the ship-wide one liveOptionSets has no entry for at all) and allowCustomWhenBlank's
 * free-typing permission, since a plain name check on just "OEM Part No" left the fallback field
 * with an unconditionally empty dropdown and no way to type a value in by hand either. */
function isOemPartNoSpec(name: string): boolean {
  return name === "OEM Part No" || name === "OEM Part No (if not auto-fetched)";
}

/** "Shelf Life (New Eqpt)" — a Dropdown picking off the same "shelfLife" catalog Old's own
 *  "Shelf Life" uses (see FIELD_SPECS' doc on it), but the picklist won't always have the exact
 *  value the operator needs to enter for a genuinely new/uncommon shelf life — same reasoning as
 *  isOemPartNoSpec's free-typing carve-out above, just for this one field instead. */
function isShelfLifeNewEqptSpec(name: string): boolean {
  return name === "Shelf Life (New Eqpt)";
}

/** Reverse of fallbackOldFieldName, restricted to the three Old-group fields whose "(New Eqpt)"
 *  counterpart deliberately does NOT mirror back onto them (Compartment Name/Deck No/Location —
 *  see onCompartmentPicked's doc; Frame Station is the fourth, but lives outside addForm entirely).
 *  Used by buildControlsForSpecs to drop Old's Validators.required entirely — Old is genuinely,
 *  harmlessly optional at the FormControl level whenever a "(New Eqpt)" sibling exists on this
 *  category's own form, since validateOldOrNewFieldForSubmit() (called from submitAdd(), same shape
 *  as validateFrameRangeForSubmit()'s existing Old/New check for Frame Station) is what actually
 *  enforces "one of the pair must be filled" at submit time instead. */
function newEqptCounterpartFieldName(oldSpecName: string): string | null {
  if (oldSpecName === "Compartment Name") return "Compartment Name (New Eqpt)";
  if (oldSpecName === "Deck No") return "Deck No (New Eqpt)";
  if (oldSpecName === "Location") return "Location (New Eqpt)";
  return null;
}
function isCascadeTriggerField(specName: string): boolean {
  return /^(Equipment|System) Name$|^Nomenclature$/.test(specName);
}

/** Backend `DateTimeField`s come back as full ISO datetimes — `<input type="date">` needs the
 * bare `yyyy-MM-dd` prefix, or the control silently shows blank. */
function toDateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

const CASCADE_DATE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO `YYYY-MM-DD` (get_equipment/'s `installation_date`) → "DD-MMM-YYYY", matching
 * app-date-picker's own display format — Survey & Demand/Local Purchase's Installation Date is
 * Auto Fetch (a plain read-only value, not an app-date-picker), so nothing else reformats it.
 * Parsed directly off the string rather than `new Date(...)`, which would read a bare date as UTC
 * midnight and can shift the displayed day by one depending on the local timezone. */
function formatCascadeDate(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, yyyy, mm, dd] = match;
  const mmm = CASCADE_DATE_MONTHS[Number(mm) - 1];
  return mmm ? `${dd}-${mmm}-${yyyy}` : value;
}

function isRhSpec(s: ActionFieldSpec): boolean {
  return s.type === "Decimal" && /Running Hours|R\|H|R\/H/i.test(s.name);
}

function isFrameRangeSpec(s: ActionFieldSpec): boolean {
  return /^Frame Station( \(New Eqpt\))?$/i.test(s.name);
}

/** "Frame Station (New Eqpt)" specifically (as opposed to plain "Frame Station") — the template's
 *  "frameRange" case needs this to pick newFrameFromControl/newFrameToControl instead of Old's
 *  frameFromControl/frameToControl, and the various frame validation helpers below come in this
 *  same Old/New pair. */
function isNewFrameRangeSpec(name: string): boolean {
  return name === "Frame Station (New Eqpt)";
}

/** CAT III's "OEM Name" dropdown option that stands in for "not in the list" — picking it is what
 * reveals the free-typed "New OEM Name" field below (see showNewOemName/optionsForSpec). Any real
 * manufacturer pick keeps "New OEM Name" hidden (and its control removed from addForm entirely). */
const NEW_OEM_NAME_OPTION = "Not Listed – Add New OEM";

function isNewOemNameSpec(s: ActionFieldSpec): boolean {
  return s.name === "New OEM Name";
}

/** Same "not in the list" sentinel idea as NEW_OEM_NAME_OPTION, for CAT III's "Supplier Name"
 * dropdown / "New OEM Supplier Name" field pair. */
const NEW_OEM_SUPPLIER_OPTION = "Not Listed – Add New Supplier";

function isNewOemSupplierNameSpec(s: ActionFieldSpec): boolean {
  return s.name === "New OEM Supplier Name";
}

/** Deck No, Location and Frame Station are never hand-typed — they're resolved from the picked
 * Compartment's own master record (`onCompartmentPicked`/`loadCompartmentCascade`), same across
 * every category (CAT I/II/III, Survey & Demand, Local Purchase all share this field set). */
function isAutoFetchedField(name: string): boolean {
  return /^Deck No$|^Location$|^Frame Station$/i.test(name);
}

function isBlankOrNA(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const s = String(value).trim();
  return s === "" || s.toUpperCase() === "N/A" || s.toUpperCase() === "NA";
}

/** app-date-picker's FormControl value is always yyyy-MM-dd (see DatePickerComponent.formatForForm)
 *  — comparing ISO date strings lexically is equivalent to comparing the dates themselves. */
function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Normalizes either of this form's two date value shapes to `yyyy-MM-dd` so they can be lexically
 *  compared: app-date-picker's own controls (CAT I/II/III's Installation Date/Authority Date) are
 *  already ISO, but Survey & Demand/Local Purchase's "Installation Date" is Auto Fetch — its value
 *  is formatCascadeDate()'s "DD-MMM-YYYY" display string instead. Returns the input unchanged if
 *  it matches neither shape, same as formatCascadeDate's own fallback. */
function toComparableIsoDate(value: string): string {
  const match = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
  if (!match) return value;
  const [, dd, mmm, yyyy] = match;
  const monthIndex = CASCADE_DATE_MONTHS.findIndex((m) => m.toLowerCase() === mmm.toLowerCase());
  return monthIndex >= 0 ? `${yyyy}-${String(monthIndex + 1).padStart(2, "0")}-${dd}` : value;
}

/** Installation Date / Authority Date must not be set in the future — used both as a form
 *  validator (blocks submit) and to cap app-date-picker's own [maxDate] (blocks picking one). */
function noFutureDateValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string | null;
    if (!value) return null;
    return toComparableIsoDate(value) > todayIsoDate() ? { futureDate: true } : null;
  };
}

/** Qty Fitted must be a real, positive quantity — 0 or negative isn't a valid fit count. */
function positiveNumberValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (value === null || value === undefined || value === "") return null;
    return Number(value) > 0 ? null : { notPositive: true };
  };
}

/** Any CMMS-sourced field other than the Equipment/System Name pick itself (which is what
 * *triggers* the cascade — everything else here is a cascade *result*: Model, OEM Name, Supplier,
 * OEM Part No, Shelf Life, Sub Department, and — for Survey & Demand/Local Purchase specifically,
 * where it's equipment-cascade-derived rather than its own separate pick — Compartment Name too.
 * By explicit product direction these render as locked, auto-filled displays once Equipment Name
 * is picked, rather than the still-clickable dropdowns v1 leaves them as. Add mode only: in
 * Update mode this is superseded by isFieldEditable()'s own "only Compartment Name/Sub Department
 * stay editable" rule (CAT I/II/III's own Compartment Name has source "Ship Master", not "CMMS" —
 * it's the trigger for its own separate cascade (onCompartmentPicked) and must stay interactive
 * in both modes).
 *
 * Nomenclature is deliberately excluded — unlike the rest, one equipment can have several
 * distinct nomenclatures across its fitted history, so it stays a normal pick (scoped to that
 * equipment's own nomenclatures, see pickedEquipmentUniversalId) rather than auto-filling; picking
 * one is what then resolves the specific record the rest of this cascade comes from (see
 * onNomenclaturePicked). */
function isCmmsCascadeLockedField(spec: ActionFieldSpec): boolean {
  return spec.source === "CMMS" && !/^(Equipment|System) Name$|^Nomenclature$/.test(spec.name);
}

/**
 * SFD Actions screen — the core SFD workflow. Switches between the active-record
 * list (with working filters), the category-driven dynamic Add/Update form, the
 * 3-stage equipment Remove wizard, a Record Edit modal (update/change-serial),
 * an Equipment History drawer, and the read-only Deleted/Approval lists.
 * Mock data only — all submissions are simulated via toast, matching the SFD
 * prototype's "no real persistence" behavior.
 */
@Component({
  selector: "app-sfd-management",
  standalone: true,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    FormsModule,
    DataGrid,
    StatusChip,
    InputField,
    SelectInput,
    DatePickerComponent,
    ModalComponent,
    DetailDrawer,
    TextareaInput,
    IconComponent, ButtonComponent, CompartmentForm],
  templateUrl: "./sfd-management.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./sfd-management.component.css"],
})
export class SfdManagementComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly sfdReferenceDataApi = inject(SfdReferenceDataApiService);
  private readonly sfdActions = inject(SfdActionsService);
  private readonly notification = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly addFormDraft = inject(SfdAddFormDraftService);
  private readonly reportExport = inject(ReportExportService);
  private readonly cdr = inject(ChangeDetectorRef);

  // Consumed once by the form-rebuild effect right after it recreates `addForm` for a restored
  // draft's category/type — see the constructor and effect A below.
  private pendingDraftFormValues: Record<string, unknown> | null = null;

  // Preserves the "R|H (Running Hours) as on date" value across a No-then-Yes-again toggle of
  // "Enter R|H for SRAR return" — see effect B below.
  private cachedRhValue = "";

  // Restores whichever of "list"/"approval"/"deleted" was last showing (see
  // SfdActionsService.lastMgmtView's own doc) instead of always starting at "list" — this
  // component is destroyed and recreated on every Ship Configuration tab switch, so without this
  // a still-open "View Approval Status" screen was silently lost the moment the operator glanced
  // at Reports/Overview/etc. and came back to Actions. The sync-back half is the constructor's
  // `effect(() => { ... lastMgmtView.set ... })` further down.
  readonly view = signal<MgmtView>(this.sfdActions.lastMgmtView());

  /** "View Full Form" from a Returned/Change Approval Tracking request — shows the exact same
   * category-driven add/edit form (sfdFormTemplate, shared via ngTemplateOutlet) as a modal on top
   * of whatever view() is currently showing, instead of navigating away from it. See
   * openFullFormFromApproval/closeFullFormModal, and back()/submitAdd()'s branches on this flag. */
  readonly fullFormModalOpen = signal(false);

  readonly categories = SFD_CATEGORIES;

  /** The Active list header's "— <ship>" suffix — was a hardcoded "HMS Daring D32" placeholder,
   *  unrelated to whichever ship Step 0 actually has locked in. Loaded once from the same
   *  ship-directory endpoint Step 0 itself writes to. */
  readonly activeShipLabel = signal<string>("");

  // --- Live reference data (backs every dropdown in the Add/Update form) --------------------
  readonly referenceData = signal<SfdActionReferenceData | null>(null);

  readonly liveOptionSets = computed<OptionSetMap>(() => {
    const ref = this.referenceData();
    if (!ref) return {};
    // Every dropdown's value is its display LABEL, not a universal_id/PK — SfdActionsService
    // resolves the label back to the real join key (universal_id_*, or compartment_id) inside
    // buildActionPayload, keeping that backend-specific lookup logic out of this component.
    return {
      equipment: ref.equipment.map((e) => ({ label: e.label, value: e.label })),
      model: ref.models.map((m) => ({ label: m.label, value: m.label })),
      nomenclature: ref.nomenclatures.map((n) => ({ label: n.label, value: n.label })),
      oem: ref.manufacturers.map((m) => ({ label: m.label, value: m.label })),
      supplier: ref.suppliers.map((s) => ({ label: s.label, value: s.label })),
      // No "oemPart" key here — OEM Part No's options are always scoped to the picked equipment
      // (see optionsForSpec, which intercepts every "OEM Part No" field before this map is ever
      // consulted for it) rather than a single ship-wide list.
      compartment: ref.compartments.map((c) => ({ label: c.name, value: c.name })),
      shelfLife: ref.shelfLives.map((s) => ({ label: `${s}`, value: s })),
      section: ref.equipmentSections.map((s) => ({ label: s.label, value: s.label })),
      type: ref.equipmentTypes.map((t) => ({ label: t.label, value: t.label })),
    };
  });

  // --- Active list --------------------------------------------------------
  // Backed by the real, paginated `GET sfd-list/`. `category`/`type` are now real fields on each
  // row, so Update correctly routes to the category the record was actually created under. `code`
  // (the "INSMA Code" column) is the Equipment master's own `equipment_code` — NOT
  // `equipment_ship_id`, which is only this row's own local database PK and was never a real
  // identifier of any kind. `maintop` still has no name to resolve, so it falls back to the raw
  // `maintop_id`.
  readonly sfdRows = signal<SfdActionRow[]>([]);
  readonly listCount = computed(() => this.sfdRows().length);
  readonly activeTotalCount = signal(0);
  readonly activePageSize = signal(10);
  readonly activePage = signal(1);

  private mapRawRowToDisplayRow(row: RawEquipmentTransactionRow, ref: SfdActionReferenceData | null): SfdActionRow {
    const equipmentMatch = ref?.equipment.find((e) => e.universalId === row.universal_id_m_equipment);
    const sectionMatch = ref?.equipmentSections.find((s) => s.universalId === row.universal_id_m_sub_department);
    const typeMatch = ref?.equipmentTypes.find((t) => t.universalId === row.universal_id_ch_master_equipment_type);
    // Model has no direct field on `GET sfd-list/` (unlike oem_part_no below) — it only resolves
    // via reference data, keyed by the SAME universal_id_m_equipment as the picked Equipment/System
    // (see SfdActionReferenceData.models / the identical onEquipmentPicked() cascade in the Add form).
    const modelMatch = ref?.models.find((m) => m.universalId === row.universal_id_m_equipment);
    // Manufacturer (OEM Name) / Supplier are each transaction's OWN pick, not the equipment's — so
    // they resolve against the row's own universal_id_m_manufacturer/universal_id_m_supplier, not
    // universal_id_m_equipment.
    const manufacturerMatch = ref?.manufacturers.find((m) => m.universalId === row.universal_id_m_manufacturer);
    const supplierMatch = ref?.suppliers.find((s) => s.universalId === row.universal_id_m_supplier);
    // For an EQUIPMENT-type row, "System Name" means "which system is this equipment part of" — a
    // separate parent link (`universal_id_m_equipment_parent`), not the row's own type. Only a
    // SYSTEM-type row's "system" is the record itself (its own display name).
    const systemParentMatch = ref?.systems.find((s) => s.universalId === row.universal_id_m_equipment_parent);
    const displayName =
      equipmentMatch?.label || row.new_equipment_name || row.new_system_name || row.nomenclature || "—";

    return {
      id: row.equipment_ship_id,
      // The Equipment master's own code — not equipment_ship_id, which is just this row's local
      // database PK (an auto-increment integer with no relation to any real INSMA identifier).
      code: row.equipment_code || "—",
      name: displayName,
      nomen: row.nomenclature ?? "",
      // Prefer the backend-resolved name (sub_department_f_key, kept in sync by CMMS import,
      // RHSI Master manual picks, and Auto-Assign alike) — sectionMatch only ever covers rows
      // that carry a CMMS universal_id_m_sub_department, which a manually/auto-assigned row
      // (e.g. an equipment given a locally-created Sub Department like "GENERAL") never has.
      dept: row.sub_department_name || sectionMatch?.label || "—",
      qty: row.no_of_fits ?? 0,
      maintop: row.maintop_id != null ? String(row.maintop_id) : "—",
      serial: row.equipment_sr_no ?? "",
      // See SfdActionRow.newSerial/removalDate/removalAuthority/newInstallDate/newShelfLife's own
      // doc — each its own genuinely distinct backend column, not shared with the Old side.
      newSerial: row.new_equipment_sr_no ?? "",
      removalDate: row.removal_date ?? "",
      removalAuthority: row.authority_of_removal ?? "",
      newInstallDate: row.new_installation_date ?? "",
      newShelfLife: row.new_service_life != null ? String(row.new_service_life) : "",
      cat: categoryFromBodyValue(row.category),
      system: row.type === "system" ? displayName : systemParentMatch?.label || row.new_system_name || "",
      // "new_*" fallbacks cover CAT III (New Induction), where these are free-text fields instead
      // of CMMS picks — same fallback pattern already used above for `displayName`.
      model: modelMatch?.label ?? "",
      oem: manufacturerMatch?.label || row.new_manufacturer_name || "",
      supplier: supplierMatch?.label || row.new_supplier_name || "",
      part: row.oem_part_no || row.new_oem_part_no || "",
      deck: row.deck_no ?? "",
      frame: row.frame_station ?? "",
      location: row.location_code ?? "",
      compartment: row.location_on_board ?? "",
      installDate: row.installation_date ?? "",
      authority: row.authority_of_installation ?? "",
      authorityDate: row.authority_date ?? "",
      shelfLife: row.service_life != null ? String(row.service_life) : "",
      rh: row.rh_at_installation != null ? String(row.rh_at_installation) : "",
      section: row.sub_department_name || sectionMatch?.label || "",
      type: typeMatch?.label ?? "",
      isSystemRecord: row.type === "system",
      // ems/maintop-pdf/<id>/ keys off the Equipment master's own local PK — `system` for a
      // System-type record, `equipment` otherwise (see equipmentMasterId's own doc).
      equipmentMasterId: row.type === "system" ? row.system : row.equipment,
    };
  }

  /** Equipment Name/Nomenclature/Sub Dept/Maintop as `sfd-list/` query params — only the ones
   * currently applied, since the backend treats an omitted param as "don't filter on this". */
  private activeListFilterParams(): Partial<Record<SfdListFilterParamKey, string>> {
    const filters = this.actFilters();
    const params: Partial<Record<SfdListFilterParamKey, string>> = {};
    for (const f of ACTION_FILTER_DEFS) {
      const v = filters[f.name];
      if (v) params[f.paramKey] = v;
    }
    return params;
  }

  async loadActiveList(page = 1, pageSize = this.activePageSize()): Promise<void> {
    try {
      const search = this.searchTerm().trim();
      const response = await this.sfdActions.loadTransactionList({
        page,
        page_size: pageSize,
        ...(search ? { search } : {}),
        ...this.activeListFilterParams(),
      });
      const ref = this.referenceData();
      this.sfdRows.set(response.results.map((row) => this.mapRawRowToDisplayRow(row, ref)));
      this.activeTotalCount.set(response.count);
      this.activePage.set(page);
      this.activePageSize.set(pageSize);
    } catch (err) {
      console.error("[SfdActions] sfd-list/ failed — no SFD rows will be shown", err);
      this.sfdRows.set([]);
      this.activeTotalCount.set(0);
    }
  }

  onActiveListPageRequested(event: { page: number; pageSize: number }): void {
    this.loadActiveList(event.page, event.pageSize);
  }

  readonly actFiltersOpen = signal(false);
  readonly actFilters = signal<Record<string, string>>({});
  readonly actFilterOptions = signal<SfdListFilterOptions | null>(null);
  readonly searchTerm = signal("");
  private searchDebounceHandle: ReturnType<typeof setTimeout> | null = null;

  /** The search box used to filter only whatever page happened to already be loaded client-side
   *  (SEARCH_ROW_KEYS over sfdRows()) — a match sitting on any other page than the one currently
   *  open could never be found. Now sent to `sfd-list/`'s own `?search=` (DRF SearchFilter,
   *  widened server-side to cover every column this list shows — see SFDTransactionViewSet) so
   *  it searches the FULL active dataset, same as the Equipment Name/Nomenclature/Sub Dept/Maintop
   *  filters already do. `sfdRows()` already reflects the search once the debounced request
   *  lands, so this is now a straight passthrough, not a second client-side filter pass. */
  readonly filteredSfdRows = computed(() => this.sfdRows());

  /** Option lists come from `sfd-list/filter-options/` (the full active dataset), not whatever
   * page happens to be loaded in the grid — otherwise a value that exists but isn't on the
   * current page could never be selected as a filter. */
  readonly actFilterFields = computed(() => {
    const filters = this.actFilters();
    const opts = this.actFilterOptions();
    return ACTION_FILTER_DEFS.map((f) => ({
      name: f.name,
      value: filters[f.name] ?? "",
      placeholder: `Select ${f.name}`,
      options: (opts?.[f.paramKey] ?? []).map((o): DropdownOption => ({ label: o.label, value: o.value })),
    }));
  });

  readonly actAppliedCount = computed(
    () => ACTION_FILTER_DEFS.filter((f) => !!this.actFilters()[f.name]).length,
  );
  readonly actHasFilters = computed(() => this.actAppliedCount() > 0);

  toggleActFilters(): void {
    this.actFiltersOpen.update((v) => !v);
  }

  setActFilter(name: string, value: FilterValue): void {
    // Equipment Name changing invalidates whatever Nomenclature was picked (it's scoped to the
    // PREVIOUS equipment's own fitted history — see loadSfdListFilterOptions) — cleared the same
    // way the Add form's own onEquipmentPicked clears Nomenclature on an equipment change.
    if (name === "Equipment Name") {
      this.actFilters.update((f) => ({ ...f, [name]: value ? String(value) : "", Nomenclature: "" }));
      void this.sfdActions.loadSfdListFilterOptions(value ? String(value) : undefined).then((opts) => {
        this.actFilterOptions.set(opts);
      });
    } else if (name === "Nomenclature") {
      // Cascades the other way round: picking a Nomenclature re-scopes Equipment Name/Sub
      // Dept/Maintop to just what's actually fitted with it, instead of those three staying
      // fixed to the full ship-wide list regardless of this pick.
      const nextFilters: Record<string, string> = { ...this.actFilters(), [name]: value ? String(value) : "" };
      this.actFilters.set(nextFilters);
      void this.sfdActions
        .loadSfdListFilterOptions(nextFilters["Equipment Name"] || undefined, value ? String(value) : undefined)
        .then((opts) => {
          this.actFilterOptions.set(opts);
        });
    } else {
      this.actFilters.update((f) => ({ ...f, [name]: value ? String(value) : "" }));
    }
    this.loadActiveList(1, this.activePageSize());
  }

  /** Debounced so every keystroke doesn't fire its own `sfd-list/` request — 350ms matches the
   *  existing filter/search boxes elsewhere in this module. Always resets to page 1: a search
   *  narrowing the result set out from under whatever page was open would otherwise show an
   *  empty page 21 of a now-3-page result. */
  setSearchTerm(value: string): void {
    this.searchTerm.set(value);
    if (this.searchDebounceHandle) clearTimeout(this.searchDebounceHandle);
    this.searchDebounceHandle = setTimeout(() => {
      this.loadActiveList(1, this.activePageSize());
    }, 350);
  }

  clearActFilters(): void {
    if (this.searchDebounceHandle) clearTimeout(this.searchDebounceHandle);
    this.actFilters.set({});
    this.searchTerm.set("");
    this.loadActiveList(1, this.activePageSize());
  }

  readonly sfdCols = [
    { headerName: "INSMA Code", field: "code", flex: 1, minWidth: 130, cellStyle: { color: "var(--icon-accent)", fontWeight: 600 } },
    { headerName: "Equipment Name", field: "name", flex: 2, minWidth: 200 },
    { headerName: "Nomenclature", field: "nomen", flex: 1.2 },
    { headerName: "Sub Dept", field: "dept", flex: 1.5 },
    { headerName: "Qty", field: "qty", width: 90 },
    {
      headerName: "Maintop",
      field: "maintop",
      flex: 1,
      // A small file icon in front of the number once a Maintop file is actually linked
      // (equipmentMasterId set) — purely visual, doesn't change how the click itself is handled:
      // that's still onSfdCellClicked below, keyed off this same `field: "maintop"`.
      cellRenderer: LinkIconCellRenderer,
      cellRendererParams: {
        isLinked: (row: SfdActionRow | undefined) => !!row?.equipmentMasterId,
      },
      cellStyle: (params: { data?: SfdActionRow }) =>
        params.data?.equipmentMasterId
          ? { color: "var(--icon-accent)", textDecoration: "underline", cursor: "pointer" }
          : null,
      tooltipValueGetter: (params: { data?: SfdActionRow }) =>
        params.data?.equipmentMasterId ? "Click to download the Maintop file" : undefined,
    },
    {
      headerName: "Actions",
      width: 130,
      pinned: "right" as const,
      cellRenderer: ActionRendererComponent,
      cellStyle: { display: "flex", justifyContent: "center", alignItems: "center" },
      cellRendererParams: {
        actions: (r: SfdActionRow): GridAction[] => [
          {
            icon: "edit",
            label: "Update SFD — Edit this record's Ship Fit Definition",
            color: "#2563eb",
            action: () => this.openUpdate(r),
          },
          {
            icon: "delete",
            label: "Remove — Raise a removal request for this equipment",
            color: "#dc2626",
            action: () => this.confirmDeletePrompt(r),
          },
          // Hidden for now — keep for when Change Serial is re-enabled in the Actions grid.
          // {
          //   icon: "refresh",
          //   label: "Change Serial — Update the equipment's serial number",
          //   color: "#16a34a",
          //   action: () => this.openRecordEdit(r, "serial"),
          // },
        ],
      },
    },
  ];

  // --- Add / Update view --------------------------------------------------
  readonly sfdType = signal<SfdType | null>(null);
  readonly category = signal<SfdCategory | null>(null);
  readonly editRow = signal<SfdActionRow | null>(null);
  readonly checkVals = signal<Record<string, "Yes" | "No">>({});

  /** Set by applyEquipmentMappingLock() once a picked equipment resolves to an already-mapped
   * system — drives sysField's kind/readonly below, rendering "System Name" as a plain locked
   * value (like Deck No/Frame Station) instead of a disabled-but-still-clickable-looking dropdown.
   * null whenever the equipment is unmapped (or none is picked), leaving System Name a normal,
   * optional select. */
  private readonly equipmentMappedSystemLabel = signal<string | null>(null);

  /** Equipment mode only: opened once onEquipmentPicked() auto-fills "System Name" with the picked
   *  equipment's own matching system catalog entry (see the systemMatch pre-fill there) AND that
   *  equipment turns out NOT to already be mapped to a real system — i.e. the field is auto-picked
   *  but still open for a normal pick, not locked. A plain instruction popup tells the user a
   *  default was chosen for them and they're free to change it from the dropdown. */
  readonly systemDefaultInfoModalOpen = signal(false);

  closeSystemDefaultInfoModal(): void {
    this.systemDefaultInfoModalOpen.set(false);
  }

  // `previewCategory`/`previewType` can resolve to the SAME value across an open/close cycle
  // (e.g. closing out of a real CAT I edit falls back to the CAT I *preview*) — plain signals only
  // notify dependents on an actual value change, so the form-rebuild effect wouldn't rerun on its
  // own and every typed value would still be sitting in `addForm`. This counter is bumped on every
  // openAdd()/openUpdate()/back() so effect A below always has something new to react to,
  // regardless of whether the category/type resolve to the same string.
  private readonly formGeneration = signal(0);

  /** Bumped after onEquipmentPicked()/onNomenclaturePicked() finish applying cascade values —
   * displayFields() reads this to force a recompute of isCmmsCascadeLockedField's per-field "did
   * the cascade actually find a value" check, since FormControl values themselves aren't signals
   * Angular would otherwise pick up. */
  private readonly cascadeTick = signal(0);

  /** Set on Equipment/System Name pick — scopes the Nomenclature dropdown to only that
   * equipment's own nomenclatures (see optionsForSpec), since one equipment can have several. */
  private readonly pickedEquipmentUniversalId = signal<string | null>(null);

  /** CAT I/II/III only: set once a Nomenclature pick resolves to a record with a known
   * compartment (see onNomenclaturePicked) — locks "Compartment Name" to that auto-filled value
   * the same way the other CMMS cascade fields lock, instead of leaving it open for
   * onCompartmentPicked's normal manual pick. */
  private readonly compartmentAutoMapped = signal(false);

  /** CAT III only: tracks "OEM Name"'s current value so displayFields()/the control-add effect
   * below can show "New OEM Name" only once the NEW_OEM_NAME_OPTION sentinel is picked — kept in
   * sync by subscribeCascadeHandlers (ongoing user picks) and re-seeded from the freshly
   * rebuilt/prefilled addForm inside the form-rebuild effect (covers Add/Update/draft-restore). */
  private readonly oemNameSelection = signal<string>("");
  private readonly showNewOemName = computed(() => this.oemNameSelection() === NEW_OEM_NAME_OPTION);

  // Preserves a typed "New OEM Name" value across a sentinel-then-real-OEM-then-sentinel-again
  // round trip — same cache-and-restore idea as cachedRhValue below.
  private cachedNewOemNameValue = "";

  /** CAT III only: same idea as oemNameSelection/showNewOemName above, for "Supplier Name" /
   * "New OEM Supplier Name". */
  private readonly supplierNameSelection = signal<string>("");
  private readonly showNewOemSupplierName = computed(
    () => this.supplierNameSelection() === NEW_OEM_SUPPLIER_OPTION,
  );
  private cachedNewOemSupplierNameValue = "";

  /** In Update mode, Compartment Name / Sub Department always stay editable; every other field
   * locks to its existing value — UNLESS the record genuinely has nothing there (null, blank, or a
   * literal "N/A"), in which case it stays open too: a locked-and-blank required field would
   * otherwise be a permanent dead end with no way to ever submit. Always true in Add mode (editRow
   * is null there).
   *
   * Both fields stay in this carve-out for EVERY category, CAT I/Survey & Demand/Local Purchase
   * included — a genuine Update is a single flat form now (displayFieldGroups drops "New Equipment
   * Info" entirely there, explicit product direction), so those three categories' own "Compartment
   * Name (New Eqpt)"/"Sub Department (if not auto-fetched)" fallbacks never even render in Update
   * mode; locking the Old copies the way Add mode does (oldGroupAlwaysLocked/kindForSpec's
   * Sub-Department "auto" case) would leave them permanently stuck with no fallback anywhere on the
   * form to correct them from — explicit product direction, overriding Sub Department's own
   * earlier "always locked regardless of mode, correct it on RHSI Master instead" rule.
   * Ported from Aug_15. */
  isFieldEditable(rawName: string): boolean {
    if (!this.editRow()) return true;
    if (rawName === "Compartment Name" || rawName === "Sub Department") return true;
    // Installation Remarks (CAT I/Survey & Demand/Local Purchase's Old-group copy) is deliberately
    // excluded from the blank-or-not fallback below — explicit product direction: it stays a
    // locked display in Update mode even when genuinely blank, unlike every other field that rule
    // covers. Disabled controls skip Angular's Validators, so a locked-blank one here doesn't block
    // submission despite `required: true` on its FIELD_SPECS entry.
    if (rawName === "Installation Remarks") return false;
    const fieldKey = controlKey(rawName);
    const control = this.addForm.get(fieldKey);
    // A literal "N/A"/"NA" is CMMS's own way of saying "nothing on record" — same as a genuinely
    // blank value, per this method's own doc above. The plain `!value || value === ""` check this
    // used to be missed that case entirely (isBlankOrNA, already used the identical way elsewhere
    // in this file — e.g. toDisplayField's hasCascadeValue — is the one that actually does this),
    // so a field CMMS came back with "N/A" for (e.g. Model) stayed wrongly locked in Update mode
    // with no way to ever fill it in by hand.
    return isBlankOrNA(control?.value);
  }

  /** Update mode only: fields isFieldEditable() leaves open get an accent-highlighted border so
   * they're unmistakable next to every other, now-locked field. Add mode never highlights — every
   * field is already editable there, so nothing needs to stand out. */
  isFieldHighlightedEditable(rawName: string): boolean {
    return !!this.editRow() && this.isFieldEditable(rawName);
  }

  /** Editing an existing record: its category came straight from the API (row.cat) and is fixed —
   * every OTHER category locks immediately, no interaction needed. Add mode is more lenient: a
   * category only locks the others once the user has actually started filling the form in
   * (`addForm.dirty` only flips from real user interaction — Update mode's own prefill via
   * patchValue() doesn't set it, which is exactly why Update needs the separate editRow() check). */
  isCategoryLocked(id: SfdCategory): boolean {
    if (this.category() === null || this.category() === id) return false;
    return !!this.editRow();
  }

  // Flips true the first time Submit is clicked on the current Add/Update form. Before that, a
  // blank mandatory field only shows a red PLACEHOLDER (see fieldPlaceholderInvalid()) — the full
  // error treatment (red border + inline message) only appears once a submit has actually failed.
  readonly submitAttempted = signal(false);

  /** Live red-placeholder-only check for a dynamic `addForm` field — true the moment it's blank
   * and required, regardless of whether the user has touched it or clicked Submit. */
  fieldPlaceholderInvalid(key: string): boolean {
    const control = this.addForm.get(key);
    return !!control && control.invalid;
  }

  /** Full red-border + inline-message check — only once Submit has been clicked and failed. */
  fieldInvalid(key: string): boolean {
    return this.submitAttempted() && this.fieldPlaceholderInvalid(key);
  }

  /** Picks the right inline message for whichever validator actually failed on this field, instead
   *  of always saying "required" — see noFutureDateValidator/positiveNumberValidator. */
  fieldErrorMessage(f: DisplayField): string {
    const errors = this.addForm.get(f.key)?.errors;
    if (errors?.["futureDate"]) return `${f.label} cannot be a future date.`;
    if (errors?.["notPositive"]) return `${f.label} must be greater than 0.`;
    return `${f.label} is required.`;
  }

  // `new Date()` is a fresh object reference on every single call — used to be created inline
  // inside dateFieldMax() below, called straight from the template (`[maxDate]="dateFieldMax(...)"`),
  // so it was creating a NEW reference on literally every change-detection pass this field's
  // date-picker went through. app-date-picker's own ngOnChanges (picker.ts) rebuilds its calendar
  // whenever its `maxDate` @Input reference changes — Angular's SimpleChanges tracking is reference-
  // based, so a same-instant-but-different-object `new Date()` looked like a real change on EVERY
  // pass, not just when "today" genuinely rolls over. One stable instance, computed once (this
  // component only lives for one Add/Update session — a real day rollover mid-session isn't a
  // scenario worth handling), removes that constant churn entirely.
  private readonly todayForDateCap = new Date();

  /** Caps app-date-picker's own calendar so Installation Date/Authority Date/Old Equipment Removal
   *  Date can't even be picked in the future — belt-and-suspenders alongside noFutureDateValidator
   *  on the control itself. */
  dateFieldMax(rawName: string): Date | null {
    return rawName === "Installation Date" ||
      rawName === "Authority Date" ||
      rawName === "Old Equipment Removal Date"
      ? this.todayForDateCap
      : null;
  }

  /** Caps app-date-picker's own calendar so "Date of Installation (New Eqpt)" can't even be picked
   *  on or before whatever's currently in "Old Equipment Removal Date" — belt-and-suspenders
   *  alongside the backend's own strict `new_installation_date > removal_date` check
   *  (CAT1Serializer/CAT2Serializer/SurveySerializer/OthersSerializer's validate()), surfacing the
   *  same rule as a blocked calendar day instead of a post-submit 400. `null` (no cap) until
   *  Removal Date itself has a real value — nothing to compare against yet. */
  // Memoizes dateFieldMin()'s result against the raw "Old Equipment Removal Date" string it was
  // computed from — same reference-churn reasoning as todayForDateCap above: called straight from
  // the template on every change-detection pass, a fresh `new Date(...)` on every call looked like
  // a real change to app-date-picker's ngOnChanges each time, not just when Removal Date itself
  // actually changed. Reset (both fields to null/"") wherever Removal Date's own control gets
  // cleared isn't needed — the cache key IS Removal Date's live value, so a blank value just falls
  // through to the `if (!removalDateValue) return null` branch below on its own.
  private dateFieldMinCacheKey: string | null = null;
  private dateFieldMinCacheValue: Date | null = null;

  dateFieldMin(rawName: string): Date | null {
    if (rawName !== "Date of Installation (New Eqpt)") return null;
    const removalDateValue = this.addForm.get(controlKey("Old Equipment Removal Date"))?.value;
    if (!removalDateValue) return null;
    const key = String(removalDateValue);
    if (key === this.dateFieldMinCacheKey) return this.dateFieldMinCacheValue;
    // `new Date("yyyy-MM-dd")` parses a bare ISO date as UTC MIDNIGHT, not local midnight — picker.ts's
    // own calendar cells are built with `new Date(year, month, day)` (local midnight instead). In any
    // timezone ahead of UTC (IST included), that mismatch silently shifted the effective minimum by
    // up to a day (comparing a local-midnight cell against a same-day-but-later UTC-midnight instant
    // made the cell look "earlier", disabling one day too many). Parsing the y/m/d components
    // directly and building a local Date instead — same fix formatCascadeDate/todayIsoDate already
    // use for this exact reason — keeps both sides on the same local-midnight footing.
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(key);
    const minDate = (() => {
      if (!match) return null;
      const [, yyyy, mm, dd] = match;
      const removalDate = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      if (Number.isNaN(removalDate.getTime())) return null;
      const d = new Date(removalDate);
      d.setDate(d.getDate() + 1);
      return d;
    })();
    this.dateFieldMinCacheKey = key;
    this.dateFieldMinCacheValue = minDate;
    return minDate;
  }

  /** frameFromControl/frameToControl live outside addForm, so they need their own required-check
   * (mirrors the blank-check in submitAdd()) instead of Angular's built-in control validity. */
  private frameNumericValue(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }

  /** True when this ONE field (From or To), taken alone, is a problem: required-but-blank, or a
   * zero/negative number. The "To must be > From" relational rule is separate — see frameRangeOrder*.
   * Locked (Update mode, disabled) never flags — an existing value the user can't touch isn't an error. */
  frameFieldBlank(value: string): boolean {
    if (this.frameFromControl.disabled) return false;
    // Update/View mode (editRow() set): nothing is required — matches
    // buildControlsForSpecs'/validateFrameRangeForSubmit's own drop for the same mode. Only the
    // "blank required" branch is skipped, not the positive-number check just below — a value the
    // operator DID type in (in the rarer case this field opens up for correction) still has to be
    // a real positive number if entered at all.
    if (this.editRow() && !value.trim()) return false;
    // Same "old"-group carve-out as buildControlsForSpecs'/toDisplayField's own
    // (oldGroupNonTrigger/isCascadeTriggerField) — plain "Frame Station" (CAT I/Survey &
    // Demand/Local Purchase) is Old Equipment Info's own read-only, auto-fetched field, so a
    // genuinely blank CMMS record is meant to submit blank, not block on "required" here. CAT
    // II/III's copy has no `group` (no old/new split) and keeps the plain required check.
    if (!value.trim()) {
      const spec = this.frameRangeFieldSpec();
      return spec?.group !== "old" && !!spec?.required;
    }
    const n = this.frameNumericValue(value);
    return n !== null && n <= 0;
  }

  frameFieldInvalid(value: string): boolean {
    return this.submitAttempted() && this.frameFieldBlank(value);
  }

  /** True only once both From/To are valid positive numbers but To is LESS than From (equal is
   * fine — a single-frame station) — doesn't fire while either side is still blank/zero/negative,
   * since frameFieldBlank() already flags those individually. */
  frameRangeOrderBlank(): boolean {
    if (this.frameFromControl.disabled) return false;
    const from = this.frameNumericValue(this.frameFromControl.value);
    const to = this.frameNumericValue(this.frameToControl.value);
    if (from === null || to === null || from <= 0 || to <= 0) return false;
    return to < from;
  }

  frameRangeOrderInvalid(): boolean {
    return this.submitAttempted() && this.frameRangeOrderBlank();
  }

  /** Same four as frameFieldBlank()/frameFieldInvalid()/frameRangeOrderBlank()/
   *  frameRangeOrderInvalid() above, for "Frame Station (New Eqpt)"'s own newFrameFromControl/
   *  newFrameToControl pair (see isNewFrameRangeSpec's doc) — kept as separate methods rather than
   *  parameterizing the originals, since displayFields() only ever renders this field at all once
   *  Old Equipment Info's own Frame Station came back genuinely blank (see the fallback-field
   *  filter's doc), at which point it actually is required — unlike the Old pair above, whose
   *  required-ness is read off frameRangeFieldSpec()'s own (always-true, for CAT I) `required`. */
  newFrameFieldBlank(value: string): boolean {
    if (this.newFrameFromControl.disabled) return false;
    // Same Update/View-mode carve-out as frameFieldBlank() above — see its own doc.
    if (this.editRow() && !value.trim()) return false;
    if (!value.trim()) return true;
    const n = this.frameNumericValue(value);
    return n !== null && n <= 0;
  }

  newFrameFieldInvalid(value: string): boolean {
    return this.submitAttempted() && this.newFrameFieldBlank(value);
  }

  newFrameRangeOrderBlank(): boolean {
    if (this.newFrameFromControl.disabled) return false;
    const from = this.frameNumericValue(this.newFrameFromControl.value);
    const to = this.frameNumericValue(this.newFrameToControl.value);
    if (from === null || to === null || from <= 0 || to <= 0) return false;
    return to < from;
  }

  newFrameRangeOrderInvalid(): boolean {
    return this.submitAttempted() && this.newFrameRangeOrderBlank();
  }

  /** serialControl also lives outside addForm — same reasoning as frameFieldBlank()/Invalid(),
   *  Update/View-mode carve-out included. */
  serialRequiredBlank(): boolean {
    if (this.serialControl.disabled) return false;
    if (this.editRow()) return false;
    return !!this.serialFieldSpec()?.required && !this.serialValue().trim();
  }

  serialRequiredInvalid(): boolean {
    return this.submitAttempted() && this.serialRequiredBlank();
  }

  serialDuplicateVisible(): boolean {
    return this.submitAttempted() && this.serialDuplicate();
  }

  /** Debounced live duplicate-serial check, fired on every keystroke — see serialDuplicate's
   *  doc. `serialCheckToken` discards a stale response that lands after a newer keystroke
   *  already started its own check (e.g. a slow request for "ABC" resolving after the user has
   *  since typed "ABCD"). Skips the check entirely while unchanged from what this Add/Update
   *  session started with, so re-submitting an edit never flags a record's own serial. */
  private checkSerialDuplicateDebounced(value: string): void {
    const token = ++this.serialCheckToken;
    if (!value.trim() || value === this.originalSerialValue()) {
      this.serialDuplicate.set(false);
      return;
    }
    setTimeout(() => {
      if (token !== this.serialCheckToken) return;
      void this.sfdActions.serialAlreadyExists(value).then((exists) => {
        if (token === this.serialCheckToken) this.serialDuplicate.set(exists);
      });
    }, 400);
  }

  // "Updating existing SFD record" banner — shown for a few seconds only, not for the whole
  // edit session (editRow itself must stay populated the whole time for form prefill).
  readonly showEditingBanner = signal(false);
  private editingBannerTimer: ReturnType<typeof setTimeout> | undefined;

  private flashEditingBanner(): void {
    clearTimeout(this.editingBannerTimer);
    this.showEditingBanner.set(true);
    this.editingBannerTimer = setTimeout(() => this.showEditingBanner.set(false), 6000);
  }

  private clearEditingBanner(): void {
    clearTimeout(this.editingBannerTimer);
    this.showEditingBanner.set(false);
  }

  readonly serialControl = new FormControl("", { nonNullable: true });
  readonly serialValue = signal("");
  readonly netOnline = this.networkStatus.online;

  /** Duplicate-serial guard (see serialAlreadyExists doc) — `true` once the live check confirms
   *  the currently-typed serial is already on an Active equipment record. Reset whenever the
   *  form is opened/prefilled fresh. */
  readonly serialDuplicate = signal(false);
  /** The serial this control was prefilled with when the current Add/Update session started
   *  ("" in Add mode) — the duplicate check is skipped while the typed value still matches this,
   *  so re-submitting an Update unchanged never flags a record's own existing serial against
   *  itself. */
  private readonly originalSerialValue = signal("");
  private serialCheckToken = 0;

  readonly frameFromControl = new FormControl("", { nonNullable: true });
  readonly frameToControl = new FormControl("", { nonNullable: true });
  // CAT I only — "Frame Station (New Eqpt)" (see isNewFrameRangeSpec's doc) gets its own separate
  // From/To pair, deliberately never reusing frameFromControl/frameToControl above: the whole point
  // is that a compartment picked here does NOT touch Old Equipment Info's own Frame Station, so the
  // two can't share one FormControl (a shared control would show the same value in both boxes).
  readonly newFrameFromControl = new FormControl("", { nonNullable: true });
  readonly newFrameToControl = new FormControl("", { nonNullable: true });

  readonly historyDrawerOpen = signal(false);
  readonly historyDrawerStats: DrawerStat[] = EQUIPMENT_HISTORY_STATS.map((s) => ({
    value: s.value,
    label: s.label,
    color: s.tone ? TONE_COLOR[s.tone] : undefined,
  }));
  readonly historySections = EQUIPMENT_HISTORY_SECTIONS;

  addForm: FormGroup = this.fb.group({});

  // Before the user picks Equipment/System, "Add SFD" shows a disabled preview of the CAT I /
  // Equipment form (see `mgmt__section--disabled` in the template) so the page doesn't look empty.
  // The CAT I fallback only applies while `sfdType` itself is still null (the untouched landing
  // state) — once a real Transaction Type is picked, this behaves exactly as before: no fields
  // until a category is actually clicked. The real `sfdType`/`category` signals always stay
  // `null` until clicked, so neither radio renders as selected and submission stays correctly gated.
  readonly previewType = computed<SfdType>(() => this.sfdType() ?? "Equipment");
  readonly previewCategory = computed<SfdCategory | null>(
    () => this.category() ?? (this.sfdType() ? null : "CAT I"),
  );

  readonly activeCategoryCard = computed(() => {
    const cat = this.previewCategory();
    return cat ? this.categories.find((c) => c.id === cat) ?? null : null;
  });

  private readonly categorySpecs = computed<ActionFieldSpec[]>(() => {
    const cat = this.previewCategory();
    return cat ? FIELD_SPECS[cat] : [];
  });

  private readonly rhCheckboxSpec = computed<ActionFieldSpec | null>(
    () => this.categorySpecs().find((s) => s.type === "Checkbox") ?? null,
  );

  private readonly rhFieldSpec = computed<ActionFieldSpec | null>(
    () => this.categorySpecs().find(isRhSpec) ?? null,
  );

  readonly serialFieldSpec = computed<ActionFieldSpec | null>(
    () => this.categorySpecs().find(isSerialSpec) ?? null,
  );

  /** frameFromControl/frameToControl live outside addForm (see the constructor's control-building
   * loop), so Validators.required on the spec can't reach them — this drives its own blank-check.
   * `.find()`, not `.filter()` — isFrameRangeSpec now also matches "Frame Station (New Eqpt)" (see
   * its own doc), but that spec always sits later in CAT_1_FIELDS than plain "Frame Station", so
   * this still resolves to the Old one specifically. */
  private readonly frameRangeFieldSpec = computed<ActionFieldSpec | null>(
    () => this.categorySpecs().find(isFrameRangeSpec) ?? null,
  );

  /** Same idea, for "Frame Station (New Eqpt)" specifically — used only by
   *  validateNewFrameRangeForSubmit()'s error messages/existence check. */
  private readonly newFrameRangeFieldSpec = computed<ActionFieldSpec | null>(
    () => this.categorySpecs().find((s) => isNewFrameRangeSpec(s.name)) ?? null,
  );

  private readonly rhVisible = computed(() => {
    const spec = this.rhCheckboxSpec();
    return !spec || this.checkVals()[spec.name] === "Yes";
  });

  readonly showAvail = computed(
    () => !!this.serialFieldSpec() && this.serialValue().trim().length >= 3 && this.netOnline(),
  );
  readonly showUnavail = computed(
    () => !!this.serialFieldSpec() && this.serialValue().trim().length >= 3 && !this.netOnline(),
  );
  readonly showHistoryOffline = this.showUnavail;

  readonly effectiveHistoryOpen = computed(() => this.historyDrawerOpen() && this.showAvail());
  readonly historyValue = computed(() => this.serialValue().trim() || "—");

  readonly displayFields = computed<DisplayField[]>(() => {
    const type = this.previewType();
    const specs = this.categorySpecs();
    if (!specs.length) return [];

    const rhVisible = this.rhVisible();
    const newOemNameVisible = this.showNewOemName();
    const newOemSupplierNameVisible = this.showNewOemSupplierName();
    this.cascadeTick();

    const fields: DisplayField[] = specs
      .filter((s) => !(isRhSpec(s) && !rhVisible))
      .filter((s) => !(isNewOemNameSpec(s) && !newOemNameVisible))
      .filter((s) => !(isNewOemSupplierNameSpec(s) && !newOemSupplierNameVisible))
      // A fallback field (see fallbackOldFieldName's doc) has nothing to do once its Old
      // counterpart already carries a real value — CMMS actually had it, or the operator already
      // filled it in via this same fallback earlier — so it drops out of New Equipment Info
      // entirely instead of sitting there redundant next to an Old field that's already correct.
      // Re-evaluated whenever cascadeTick bumps (every cascade fill already tracks it below), NOT
      // on the fallback control's own every keystroke — mirrorIntoOldControl deliberately never
      // bumps cascadeTick itself, or the field the operator is *currently typing into* would
      // vanish out from under their cursor the moment a real value landed in the mirror target.
      .filter((s) => {
        const oldFieldName = fallbackOldFieldName(s.name);
        if (!oldFieldName) return true;
        // Before Equipment/System Name itself is picked, the whole Old-equipment cascade hasn't
        // run at all yet — every Old field reads blank not because CMMS genuinely has nothing, but
        // because nothing's been looked up yet. Showing the fallback fields at that point (every
        // one of them, all at once, all asterisked "required") looked like the form was already
        // broken before the operator had even started. Nothing here is fallback-worthy until
        // there's an actual equipment pick to have come back blank against — this one check gates
        // ALL of them.
        if (isBlankOrNA(this.addForm.get(controlKey("Equipment Name"))?.value)) return false;
        // Qty Fitted's own fallback used to be a deliberate exception here — always shown
        // alongside Old's own "Qty Fitted", not just while Old was blank. Reverted (explicit
        // product direction): once Old genuinely has a value (CMMS-fetched or already-typed via
        // this fallback), re-showing this box next to it just read as asking for the same number
        // twice — same reasoning every other fallback field already follows below.
        // "Frame Station" has no addForm control at all (frameFromControl/frameToControl live
        // outside addForm — see their own doc) — the generic addForm lookup below always reads
        // undefined for it, which isBlankOrNA reads as blank, so "Frame Station (New Eqpt)" would
        // show unconditionally regardless of whether Old's Frame Station actually has a value.
        if (oldFieldName === "Frame Station") {
          return isBlankOrNA(this.frameFromControl.value) && isBlankOrNA(this.frameToControl.value);
        }
        return isBlankOrNA(this.addForm.get(controlKey(oldFieldName))?.value);
      })
      .map((s) => this.toDisplayField(s, type));

    if (type === "Equipment") {
      // Sourced from the SAME `system_name` list (`ref.systems`) as the Equipment Name cascade in
      // onEquipmentPicked() sets this field's value from — options must come from that same list,
      // not a fixed picklist, or the picked value can't match any option and the dropdown renders
      // as unselected even though the underlying FormControl is actually set correctly.
      //
      // Already-mapped equipment renders this as a plain locked value (kind "auto", same as Deck
      // No/Frame Station) rather than a disabled-but-still-dropdown-looking select — nothing to
      // pick, so nothing that should look pickable. Unmapped equipment gets the real, optional
      // select instead (see equipmentMappedSystemLabel's doc).
      const mappedLabel = this.equipmentMappedSystemLabel();
      const sysField: DisplayField = {
        key: "sysName",
        rawName: "System Name",
        label: "System Name",
        // Optional by product direction — Equipment mode can submit with or without a System pick.
        required: false,
        badge: mappedLabel ? "CMMS (auto-fetched)" : "CMMS",
        badgeColor: "#F59E0B",
        placeholder: "Select System Name",
        kind: mappedLabel ? "auto" : "select",
        options: this.referenceData()?.systems.map((s) => ({ label: s.label, value: s.label })) ?? [],
        readonly: !!mappedLabel,
        // Tied to the Equipment Name pick, which is always "old" for every category that has an
        // Old/New split (CAT I, Survey & Demand/Local Purchase — see displayFieldGroups) —
        // irrelevant for CAT II/III, which always render one flat, unheaded group regardless of
        // this value (CAT II by explicit product direction, CAT III since it has no genuine
        // old-vs-new split at all).
        group: "old",
        // Update mode, once isFieldEditable("System Name") has unlocked this for being blank/N/A —
        // same reasoning as toDisplayField's allowCustomWhenBlank.
        allowCustomValue: !!this.editRow() && isBlankOrNA(this.addForm.get("sysName")?.value),
      };
      // CAT I only: Nomenclature sits right after Equipment Name on its own field list (see
      // CAT_1_FIELDS' doc on why) — "System Name" belongs after THAT pair on this category
      // specifically, not wedged between Equipment Name and Nomenclature the way the generic
      // Equipment/System Name-adjacent rule below would otherwise put it.
      const insertAfterPattern =
        this.previewCategory() === "CAT I" ? /^Nomenclature$/ : /^(Equipment|System) Name$/;
      const idx = fields.findIndex((f) => insertAfterPattern.test(f.rawName));
      if (idx >= 0) fields.splice(idx + 1, 0, sysField);
      else fields.unshift(sysField);
    }

    return fields;
  });

  /** CAT I and Survey & Demand/Local Purchase: splits displayFields() into "Old Equipment Info"
   *  (existing/CMMS equipment being replaced) and "New Equipment Info" (removal + the replacement
   *  going in) sections — see ActionFieldSpec.group's doc. Derived from FIELD_SPECS itself (does
   *  this category's spec list actually have a "new"-group field?) rather than a hardcoded category
   *  name list, so a future category picks this up automatically the moment its own FIELD_SPECS
   *  entry gets the split. CAT II deliberately kept its original flat field set (explicit product
   *  direction) and CAT III has no genuine old-vs-new-equipment split at all (describing equipment
   *  new to the catalog outright has no "equipment being replaced" to describe) — both stay a
   *  single flat, unheaded group. When editing an existing SFD record from the Actions grid (a
   *  genuine Update, editRow set), there's only ever one equipment being corrected — no
   *  old-being-removed + new-going-in pair to distinguish — so it collapses to that same single
   *  flat, unheaded group too, dropping both "New Equipment Info" and the now-redundant "Old
   *  Equipment Info" heading, category notwithstanding (explicit product direction, reverting the
   *  brief "Update shows the Add-shaped form too" experiment: back to a single form regardless of
   *  category, like before). "View Full Form" (fullFormModalOpen) also sets editRow() (reusing the
   *  same prefill/lockdown path), but it's reviewing the ORIGINAL Add submission, not a settled
   *  record — that submission genuinely had an Old-being-removed + New-going-in pair, and
   *  collapsing away "New Equipment Info" there would hide exactly the half a reviewer most needs
   *  to see (what was actually added/changed), so it keeps the full split. Ported from Aug_15. */
  readonly displayFieldGroups = computed<DisplayFieldGroup[]>(() => {
    const fields = this.displayFields();
    const cat = this.previewCategory();
    const isEdit = !!this.editRow() && !this.fullFormModalOpen();
    const hasOldNewSplit = !!cat && FIELD_SPECS[cat].some((s) => s.group === "new");
    if (isEdit || !hasOldNewSplit) {
      return [{ title: null, fields: fields.filter((f) => f.group !== "new") }];
    }
    const type = this.previewType();
    const groups: DisplayFieldGroup[] = [];
    for (const key of ["old", "new"] as const) {
      const groupFields = fields.filter((f) => f.group === key);
      if (groupFields.length) groups.push({ title: fieldGroupTitle(key, type), fields: groupFields });
    }
    // Any field neither cascade tagged "old" (shouldn't happen — every SURVEY_DEMAND_FIELDS entry
    // has a group) falls back into its own untitled group rather than silently vanishing.
    const untitled = fields.filter((f) => f.group !== "old" && f.group !== "new");
    if (untitled.length) groups.push({ title: null, fields: untitled });
    return groups;
  });

  constructor() {
    // Restore an in-progress Add/Update draft left behind by a previous instance of this
    // component — e.g. the user switched to another Ship Configuration tab (or used browser
    // back/forward) while mid-form, which destroys and recreates this component from scratch.
    // sfdType/category/checkVals must be set here, before the effects below are registered, so
    // their first run already sees the restored values; the raw control values are stashed and
    // applied once that first run has rebuilt `addForm` to match.
    const draft = this.addFormDraft.peek();
    if (draft) {
      this.editRow.set(draft.editRow);
      this.checkVals.set(draft.checkVals);
      this.serialControl.setValue(draft.serialValue);
      this.frameFromControl.setValue(draft.frameFrom);
      this.frameToControl.setValue(draft.frameTo);
      this.pendingDraftFormValues = draft.formValues;
      this.sfdType.set(draft.sfdType);
      this.category.set(draft.category);
      this.view.set("add");
      if (draft.editRow) this.flashEditingBanner();
    }

    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe(params => {
      if (params['view'] === 'add') {
        // Deep-linked from the SFD Overview "Add / Update SFD" quick action — when a
        // Transaction Type (+ category) is supplied, open the Add form with them already
        // selected instead of the blank CAT I / Equipment preview.
        const type = params['type'];
        if (type === 'Equipment' || type === 'System') {
          this.addFormDraft.clear();
          this.editRow.set(null);
          this.submitAttempted.set(false);
          this.sfdType.set(type);
          this.category.set(categoryFromSlug(params['category']));
          this.checkVals.set({});
          this.serialControl.setValue('');
          this.frameFromControl.setValue('');
          this.frameToControl.setValue('');
          this.formGeneration.update((n) => n + 1);
        }
        this.view.set('add');
      } else if (params['view'] === 'approval') {
        this.viewApproval();
      }
    });

    // Sync-back half of `readonly view = signal(...)`'s own restore-on-init (see its doc) — keeps
    // SfdActionsService.lastMgmtView following view() for the 3 safe-to-restore screens, so the
    // NEXT time this component gets torn down and recreated (any other Ship Configuration tab
    // click), it starts back where this instance left off instead of always resetting to "list".
    // "add"/"approvalDetail" deliberately don't update it — see lastMgmtView's own doc for why.
    effect(() => {
      const v = this.view();
      if (v === "list" || v === "approval" || v === "deleted") {
        this.sfdActions.lastMgmtView.set(v);
      }
    });

    // Opposite direction of the effect just above, for a different purpose: clicking the
    // "Actions" header tab while ALREADY on it (mid Add-form, deep in Approval Tracking, etc.)
    // must jump back to the Actions main screen — explicit product direction. That click's target
    // URL never actually changes (this screen's own sub-views are pure client state, never
    // reflected in the URL — see viewApproval()'s own doc), so the router's default
    // onSameUrlNavigation: "ignore" swallows the navigation entirely: no paramMap re-emission, no
    // recreation, nothing this component would otherwise ever notice. SfdShellComponent listens
    // for that ignored navigation instead (Router's own NavigationSkipped event) and bumps
    // resetToListTick (see its own doc on SfdActionsService for why a tick, not a plain
    // lastMgmtView.set("list") — the short version: that alone can silently no-op) — this effect
    // is what actually carries that reset onto the still-mounted instance. Guarded to skip its
    // own first run: without that, this would immediately stomp the constructor's earlier
    // `view.set("add")` (in-progress draft restore) back to "list" the moment this effect is
    // first registered, before anything external ever asked for a reset.
    let skipFirstResetTick = true;
    effect(() => {
      this.sfdActions.resetToListTick();
      if (skipFirstResetTick) {
        skipFirstResetTick = false;
        return;
      }
      this.view.set("list");
    });

    effect(() => {
      const cat = this.previewCategory();
      const type = this.previewType();
      this.formGeneration(); // tracked on purpose — see the field comment above its declaration
      // Everything below is a plain function call (buildControlsForSpecs/applyPrefillIfEditing/
      // applyPendingDraftFormValues/applyEditLockdown/subscribeCascadeHandlers), not a signal read
      // of its own — but several of them internally read OTHER signals (editRow, compartmentAutoMapped,
      // cascadeTick, pickedEquipmentUniversalId, ...) without going through untracked() themselves.
      // Called bare inside an effect body, any such read silently becomes a dependency of THIS whole
      // effect too — so the moment any of those unrelated signals changes for any reason (e.g.
      // onCompartmentPicked's own cascadeTick bump, or just opening/closing a dropdown elsewhere on
      // the form), this effect re-fires and does `this.addForm = this.fb.group(...)` all over again,
      // silently discarding whatever the user had just picked (re-seeded only from the ORIGINAL
      // prefill/draft, not the in-progress edit) — this is what was wiping the Compartment Name pick.
      // Wrapping the whole block in untracked() restores the intent already established for
      // isEdit/rhVisible below: only previewCategory()/previewType()/formGeneration() should ever
      // cause this effect to actually rebuild the form.
      untracked(() => {
        const rhVisible = this.rhVisible();
        const isEdit = !!this.editRow();
        // "New Equipment Info" (group "new") only makes sense when Add is describing an
        // old-being-removed + new-going-in pair — dropped for a GENUINE Update (editing an
        // already-settled, active record from the Actions grid: there's only one equipment now, no
        // more old-vs-new to distinguish — see displayFieldGroups' own doc). "View Full Form"
        // (Approval Tracking's eye icon, fullFormModalOpen) also sets editRow() for its
        // prefill/lockdown reuse, but it's reviewing the ORIGINAL submission, not a settled record
        // — dropping "new" there too would hide exactly the New Equipment Info half of what was
        // actually submitted (both from the display AND — since specs would never even reach
        // buildControlsForSpecs — from the underlying FormControls, so there'd be nothing to
        // prefill it from even if displayed). Ported from Aug_15.
        const dropNewGroup = isEdit && !this.fullFormModalOpen();
        const specs = cat
          ? FIELD_SPECS[cat].filter((s) => (rhVisible || !isRhSpec(s)) && !(dropNewGroup && s.group === "new"))
          : [];

        this.addForm = this.fb.group(this.buildControlsForSpecs(specs, type, cat, isEdit));
        this.cachedRhValue = ""; // a genuinely new category/type shape — don't leak the old one's R|H value
        this.cachedNewOemNameValue = ""; // same — don't leak the old form's "New OEM Name" text either
        this.cachedNewOemSupplierNameValue = ""; // same — for "New OEM Supplier Name"
        this.applyPrefillIfEditing();
        this.applyPendingDraftFormValues();
        // Seeds showNewOemName()/showNewOemSupplierName() off the freshly built/prefilled/draft-restored
        // "OEM Name"/"Supplier Name" values — subscribeCascadeHandlers below only picks up value
        // changes from here on, not this initial state.
        this.oemNameSelection.set(String(this.addForm.get(controlKey("OEM Name"))?.value ?? ""));
        this.supplierNameSelection.set(String(this.addForm.get(controlKey("Supplier Name"))?.value ?? ""));

        // Editing an existing record: only Compartment Name / Sub Department stay editable — every
        // other field is locked to its prefilled value. Add mode is untouched (editRow is null there).
        this.applyEditLockdown(specs);

        // Cascading dropdowns via GET get_equipment/ (see SfdActionsService.loadEquipmentCascade /
        // loadCompartmentCascade) — picking an Equipment/System or a Compartment fetches the CMMS
        // values tied to it. Subscribed per rebuilt form since `addForm` is replaced on every
        // category/type change; the old controls are discarded along with their subscriptions.
        this.subscribeCascadeHandlers(specs);
      });
    });

    // Toggling "Enter R|H for SRAR return" (Yes/No) only adds/removes the R|H control in place on
    // the CURRENT form instance — it never rebuilds `addForm` — so every other field the user has
    // already filled in stays exactly as-is. The R|H control's OWN value is cached across a
    // No-then-Yes-again round trip too (`cachedRhValue`), instead of coming back blank.
    effect(() => {
      const spec = this.rhFieldSpec();
      // This field is group "new" — Survey & Demand/Local Purchase's "New Equipment Info", which
      // displayFieldGroups/buildControlsForSpecs drop entirely for a genuine Update (see their own
      // docs) but NOT for "View Full Form" (fullFormModalOpen) — same dropNewGroup reasoning as the
      // addForm-rebuild effect above: a Pending/Returned CAT I or Survey & Demand/Local Purchase
      // submission genuinely has an R|H value to review there, same as everything else in New
      // Equipment Info. openEditForm still unconditionally seeds checkVals to "Yes" for whatever
      // Checkbox spec the category has (so a record with a real prior R|H value opens showing it in
      // Add mode) — harmless there, but without this same guard here for a genuine Update, it'd
      // make rhVisible() true there too and add this control WITH Validators.required even though
      // the field itself is never rendered — a required control the user has no way to see or fill
      // in, permanently blocking submit. Ported from Aug_15.
      const visible = this.rhVisible() && !(this.editRow() && !this.fullFormModalOpen() && spec?.group === "new");
      if (!spec) return;
      const key = controlKey(spec.name);
      if (visible) {
        if (!this.addForm.contains(key)) {
          // Reaching here means the "Enter/Add R|H for SRAR return" toggle is Yes, so this value
          // is always mandatory while shown — `spec.required` is unconditionally false in
          // FIELD_SPECS since visibility itself already gates the "No" case (see toDisplayField).
          this.addForm.addControl(key, new FormControl(this.cachedRhValue, [Validators.required]));
        }
      } else {
        const existing = this.addForm.get(key);
        if (existing) {
          this.cachedRhValue = String(existing.value ?? "");
          this.addForm.removeControl(key);
        }
      }
    });

    // CAT III only: "New OEM Name" only makes sense once "OEM Name" is set to the "not in the
    // list" sentinel (NEW_OEM_NAME_OPTION) — same add/remove-control-in-place pattern as the R|H
    // toggle above, so the field neither renders nor blocks submission with a stale required
    // validator while hidden, and a typed value survives a sentinel → real OEM → sentinel round trip.
    effect(() => {
      const spec = this.categorySpecs().find(isNewOemNameSpec) ?? null;
      if (!spec) return;
      const key = controlKey(spec.name);
      const visible = this.showNewOemName();
      if (visible) {
        if (!this.addForm.contains(key)) {
          this.addForm.addControl(
            key,
            new FormControl(
              { value: this.cachedNewOemNameValue, disabled: !this.isFieldEditable(spec.name) },
              [Validators.required],
            ),
          );
        }
      } else {
        const existing = this.addForm.get(key);
        if (existing) {
          this.cachedNewOemNameValue = String(existing.value ?? "");
          this.addForm.removeControl(key);
        }
      }
    });

    // Same idea as the "New OEM Name" effect above, for "New OEM Supplier Name" once "Supplier
    // Name" is set to NEW_OEM_SUPPLIER_OPTION.
    effect(() => {
      const spec = this.categorySpecs().find(isNewOemSupplierNameSpec) ?? null;
      if (!spec) return;
      const key = controlKey(spec.name);
      const visible = this.showNewOemSupplierName();
      if (visible) {
        if (!this.addForm.contains(key)) {
          this.addForm.addControl(
            key,
            new FormControl(
              { value: this.cachedNewOemSupplierNameValue, disabled: !this.isFieldEditable(spec.name) },
              [Validators.required],
            ),
          );
        }
      } else {
        const existing = this.addForm.get(key);
        if (existing) {
          this.cachedNewOemSupplierNameValue = String(existing.value ?? "");
          this.addForm.removeControl(key);
        }
      }
    });

    this.serialControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      this.serialValue.set(v);
      this.checkSerialDuplicateDebounced(v);
    });

    this.initializeActiveList();
  }

  /** The Active list request and reference-data request race — if the list comes back first, every
   * row's model/OEM Name/Supplier/Sub Dept/Equipment Type (all reference-data lookups) render blank
   * since `mapRawRowToDisplayRow` had nothing to join against yet. Re-map once reference data
   * actually lands so those columns correct themselves instead of staying blank until some unrelated
   * page change happens to trigger a fresh loadActiveList(). Extracted out of the constructor body
   * so the async calls aren't written directly inline there. */
  private initializeActiveList(): void {
    Promise.all([
      this.sfdActions.loadReferenceData(),
      this.sfdActions.loadSfdListFilterOptions(),
    ]).then(([ref, opts]) => {
      this.referenceData.set(ref);
      this.actFilterOptions.set(opts);
      this.loadActiveList();
    }).catch((err) => {
      console.error("[SfdActions] initialization failed", err);
      this.loadActiveList();
    });
    void this.loadActiveShipLabel();
  }

  /** Resolves the real Step-0-locked ship for the "Active Systems & Equipment — <ship>" header,
   *  replacing what used to be a permanently hardcoded "HMS Daring D32". Silently leaves the
   *  header without a ship suffix if nothing is locked in yet or the call fails — this header is
   *  cosmetic, not worth surfacing an error toast over. */
  private async loadActiveShipLabel(): Promise<void> {
    try {
      const res = await firstValueFrom(this.sfdReferenceDataApi.getShipDirectoryOptions());
      const ship = res.selected_ship;
      this.activeShipLabel.set(ship ? `${ship.name}${ship.code ? " " + ship.code : ""}` : "");
    } catch {
      this.activeShipLabel.set("");
    }
  }

  /** Builds the per-field controls for the currently-previewed category/type shape (extracted from
   * the form-rebuild effect purely to keep that effect's own cognitive complexity down). */
  private buildControlsForSpecs(
    specs: ActionFieldSpec[],
    type: SfdType,
    cat: SfdCategory | null,
    // Passed in (already read via `untracked()` at the one call site, addForm-rebuild's own
    // effect) rather than read as `this.editRow()` in here — this function only ever runs
    // SYNCHRONOUSLY inside that effect, so an untracked-free read here would silently make
    // editRow a tracked dependency of the WHOLE effect again, undoing its own deliberate
    // `untracked(() => !!this.editRow())` a few lines above the call site. That effect replaces
    // `addForm` outright on every re-run — editRow becoming tracked would mean any unrelated
    // signal write that happens to touch editRow (even to an equal value elsewhere) could trigger
    // a full form rebuild mid-edit, silently discarding whatever the operator had just typed/
    // picked (e.g. a live Compartment Name pick that only exists on this addForm and isn't part
    // of editRow()'s own prefill data).
    isEdit: boolean,
  ): Record<string, FormControl> {
    const controls: Record<string, FormControl> = {};
    for (const s of specs) {
      if (
        s.type === "Checkbox" ||
        isSerialSpec(s) ||
        isFrameRangeSpec(s) ||
        isNewOemNameSpec(s) ||
        isNewOemSupplierNameSpec(s)
      )
        continue;
      // "Auto Fetch" fields still get a real control — they're populated by onEquipmentPicked()'s
      // cascade and need to participate in getRawValue() for the submit payload, same as any other
      // field. The template renders them read-only since the source badge is CMMS, not user entry.
      // Compartment Name/Deck No/Location (CAT I, Old group only — see newEqptCounterpartFieldName's
      // doc) drop Validators.required entirely whenever this category's own spec list actually has
      // the matching "(New Eqpt)" field — Old is meant to be genuinely, harmlessly blank whenever
      // the operator used that fallback instead, and a FormControl-level "either one" validator
      // needs its OWN control's updateValueAndValidity() explicitly re-run on every place the
      // SIBLING control's value can change (easy to miss one, and in practice still missed one:
      // Compartment Name's own manual pick nudges reliably, but Deck No/Location's cascade-driven
      // fills didn't consistently, so Old still showed "required" after a full New Eqpt fill-in).
      // validateOldOrNewFieldForSubmit() below checks the actual pair explicitly at submit time
      // instead — same "no FormControl validator, explicit pre-submit check" shape
      // validateFrameRangeForSubmit() already uses for Frame Station, which never had this problem
      // in the first place because it was never depending on cross-control validator timing.
      // Every other category's copy of these three names has no such sibling and keeps the plain
      // validator.
      const newEqptCounterpart = newEqptCounterpartFieldName(s.name);
      const hasNewEqptCounterpart = !!newEqptCounterpart && specs.some((sp) => sp.name === newEqptCounterpart);
      // Update/View mode (editRow() set) drops Validators.required entirely, on every field —
      // explicit product direction. The record already exists; historical/CMMS data can genuinely
      // be missing for any field (same reasoning the Old-group "always locked, blank or not"
      // fields already lean on — see oldGroupAlwaysLocked's own doc), so a routine edit shouldn't
      // be blocked by a field the operator isn't even touching. The backend already agrees for the
      // fields it owns directly: SourceShipEquipmentSerializer's serial_no/deck_no/frame_station/
      // shell_life/qty_fitted/location/compartment_name/rh_at_installation are ALL `required=False`
      // (sfd/source_contract.py) — this just brings the frontend's own validator in line with that
      // instead of blocking ahead of it. Add mode (editRow() null) is completely untouched.
      // "Old"-group fields other than the cascade trigger (Equipment/System Name, Nomenclature)
      // drop Validators.required entirely too — they're read-only, auto-fetched from CMMS/Ship
      // Master (see oldGroupAlwaysLocked's doc), so a value CMMS genuinely has none of on record
      // is meant to be submitted blank, never a dead end the operator can't fill in or clear.
      // Matches isCascadeTriggerField's own carve-out for toDisplayField's asterisk, so a field
      // never shows required without also actually being enforced, or vice versa.
      const oldGroupNonTrigger = s.group === "old" && !isCascadeTriggerField(s.name);
      const validators =
        isEdit || hasNewEqptCounterpart || oldGroupNonTrigger ? [] : s.required ? [Validators.required] : [];
      // Installation Date/Authority Date can't be in the future (a piece of equipment can't be
      // authorized or installed on a date that hasn't happened yet); Qty Fitted has to be a real,
      // positive count. Both apply across every category — these fields mean the same thing
      // everywhere they appear in FIELD_SPECS.
      if (
        s.name === "Installation Date" ||
        s.name === "Authority Date" ||
        s.name === "Old Equipment Removal Date"
      ) {
        validators.push(noFutureDateValidator());
      }
      if (s.name === "Qty Fitted") {
        validators.push(positiveNumberValidator());
      }
      controls[controlKey(s.name)] = new FormControl("", validators);
    }
    if (type === "Equipment" && cat) {
      // Optional by product direction — Equipment mode can submit with or without a System pick.
      controls["sysName"] = new FormControl("");
    }
    return controls;
  }

  /** Applies a draft restored on this instance's construction (see the constructor's draft-restore
   * block) to the freshly-rebuilt `addForm`, once. */
  private applyPendingDraftFormValues(): void {
    if (!this.pendingDraftFormValues) return;
    this.addForm.patchValue(this.pendingDraftFormValues);
    this.pendingDraftFormValues = null;
  }

  /** Editing an existing record: only Compartment Name / Sub Department (plus a blank Model/System
   * Name/Nomenclature/OEM Part No — see isFieldEditable) stay editable; every other field is
   * locked to its prefilled value. Add mode is untouched (editRow is null there).
   *
   * "View Full Form" from Approval Tracking (openFullFormFromApproval) reuses this exact same
   * prefill path but sets fullFormReadOnly first — that flow is explicitly "look, don't touch": no
   * field should ever be interactive there, not even the two isFieldEditable() normally leaves open
   * for a genuine correction (Compartment Name always, and Sub Department/Model/etc. whenever
   * they're blank). Checking fullFormReadOnly() here, ahead of the isFieldEditable() call per
   * field, is enough to disable all of them uniformly without touching isFieldEditable() itself —
   * that carve-out still needs to work exactly as before for the real openUpdate() edit flow, which
   * never sets fullFormReadOnly true. */
  private applyEditLockdown(specs: ActionFieldSpec[]): void {
    if (!this.editRow()) return;
    const readOnly = this.fullFormReadOnly();
    for (const s of specs) {
      if (s.type === "Checkbox" || isSerialSpec(s) || isFrameRangeSpec(s)) continue;
      if (readOnly || !this.isFieldEditable(s.name)) {
        this.addForm.get(controlKey(s.name))?.disable();
      }
    }
    if (readOnly || !this.isFieldEditable("System Name")) {
      this.addForm.get("sysName")?.disable();
    }
  }

  /** Cascading dropdowns via GET get_equipment/ (see SfdActionsService.loadEquipmentCascade /
   * loadCompartmentCascade) — picking an Equipment/System or a Compartment fetches the CMMS values
   * tied to it. Subscribed per rebuilt form since `addForm` is replaced on every category/type
   * change; the old controls are discarded along with their subscriptions. */
  private subscribeCascadeHandlers(specs: ActionFieldSpec[]): void {
    this.addForm
      .get(controlKey("Equipment Name"))
      ?.valueChanges.subscribe((label: string) => this.onEquipmentPicked(label));
    this.addForm
      .get(controlKey("Nomenclature"))
      ?.valueChanges.subscribe((label: string) => this.onNomenclaturePicked(label));
    this.addForm
      .get(controlKey("Compartment Name"))
      ?.valueChanges.subscribe((label: string) => this.onCompartmentPicked(label, false));
    // CAT I/Survey & Demand/Local Purchase — "Compartment Name (New Eqpt)" (see FIELD_SPECS's doc
    // on it) is a second, fully independent entry point into the same cascade: it fills its own
    // Deck No (New Eqpt)/Location (New Eqpt)/newFrameFromControl-newFrameToControl instead of Old
    // Equipment Info's Deck No/Location/Frame Station — see onCompartmentPicked's own doc for why
    // Old must stay untouched. Ported from Aug_15.
    this.addForm
      .get(controlKey("Compartment Name (New Eqpt)"))
      ?.valueChanges.subscribe((label: string) => this.onCompartmentPicked(label, true));
    // CAT I only — "Installation Remarks (New Eqpt)" is the same kind of single-slot fallback as
    // "Compartment Name (New Eqpt)" above, just without a cascade of its own to trigger (plain
    // text, nothing else depends on it) — mirrorIntoOldControl alone is enough here.
    this.addForm
      .get(controlKey("Installation Remarks (New Eqpt)"))
      ?.valueChanges.subscribe((value: string) => this.mirrorIntoOldControl("Installation Remarks", value));
    // "Shelf Life (New Eqpt)" already exists as a mandatory field on every category with the
    // Old/New split (not a "(if not auto-fetched)" fallback — see FIELD_SPECS' doc on why Shelf
    // Life alone doesn't get one of those, unlike its neighbours below) — mirrored into "Shelf
    // Life" itself the same way, so the operator never has to fill in shelf life twice.
    this.addForm
      .get(controlKey("Shelf Life (New Eqpt)"))
      ?.valueChanges.subscribe((value: string) => this.mirrorIntoOldControl("Shelf Life", value));
    // Every "(if not auto-fetched)" fallback field (Model/OEM Name/Supplier(-or-"Equipment
    // Supplier Name")/OEM Part No/Equipment Serial No/Installation Date/Installation
    // Remarks[Survey & Demand/Local Purchase]/Qty Fitted — see FIELD_SPECS' doc on the suffix)
    // just mirrors into its plain-named Old-group counterpart, no cascade of its own — driven off
    // `specs` (this rebuild's actual field list) instead of a hardcoded name list, so it covers
    // whichever of CAT I/Survey & Demand/Local Purchase this form currently is without a separate
    // block per category.
    const fallbackSuffix = " (if not auto-fetched)";
    for (const spec of specs) {
      if (!spec.name.endsWith(fallbackSuffix)) continue;
      const oldFieldName = spec.name.slice(0, -fallbackSuffix.length);
      this.addForm.get(controlKey(spec.name))?.valueChanges.subscribe((value: string) => {
        this.mirrorIntoOldControl(oldFieldName, value);
      });
    }
    this.addForm
      .get(controlKey("OEM Name"))
      ?.valueChanges.subscribe((label: string) => this.oemNameSelection.set(label ?? ""));
    this.addForm
      .get(controlKey("Supplier Name"))
      ?.valueChanges.subscribe((label: string) => this.supplierNameSelection.set(label ?? ""));
  }

  /** CAT I only: mirrors a "(New Eqpt)"-suffixed fallback field's value back onto its plain-named
   *  Old-group counterpart. Needed because there's only ONE slot on the wire for these (see
   *  Cat1TransactionPayload's doc) — the Old control's own Validators.required (built from
   *  FIELD_SPECS' `required: true` on it) only ever sees what's actually IN that control, so
   *  leaving it blank while the value sits in the New one instead left the field permanently
   *  invalid — "Please fill in: X" — even though the operator had filled it in, just in the other
   *  box. `{emitEvent: false}` avoids re-entering this same handler through the Old control's own
   *  subscription (harmless even if it did — same value, no-op on the second pass — just wasted
   *  work), and the `!==` check skips the write entirely once they already agree. */
  private mirrorIntoOldControl(oldFieldName: string, value: string): void {
    const oldControl = this.addForm.get(controlKey(oldFieldName));
    if (oldControl && oldControl.value !== value) {
      oldControl.setValue(value, { emitEvent: false });
    }
  }

  ngOnDestroy(): void {
    if (this.searchDebounceHandle) clearTimeout(this.searchDebounceHandle);
    this.addFormDraft.clear();
  }

  /**
   * Equipment/System pick — Model and OEM Part No are keyed by the SAME `universal_id_m_equipment`
   * as the pick, so they resolve instantly from the already-loaded dropdown data. Everything else
   * that used to come from this pick (OEM Name, Supplier, Shelf Life, System Name's mapping lock,
   * and — for Survey & Demand/Local Purchase — Equipment Serial No/Deck No/Frame Station/Location/
   * Compartment Name/Installation Date/Installation Remarks/Qty Fitted/Sub Department) now waits
   * for {@link onNomenclaturePicked} instead: an equipment can have several distinct nomenclatures
   * across its fitted history, so a specific record can't be resolved from the equipment alone.
   * This pick's only other job is scoping the Nomenclature dropdown to this equipment's own
   * nomenclatures (see pickedEquipmentUniversalId/optionsForSpec).
   */
  private async onEquipmentPicked(label: string): Promise<void> {
    // Skip the whole equipment-match cascade when:
    //  - Update/View mode (editRow() set): the cascade is an Add-mode concept — every field is
    //    prefilled from the record itself (applyPrefillIfEditing) and locked, and
    //    pickedEquipmentUniversalId is never populated here (Equipment Name is locked, so this
    //    handler can't have run). Letting it run anyway means onNomenclaturePicked below always
    //    hits its "no equipment picked → clear everything" branch, wiping the Compartment Name /
    //    Deck No / Location / Frame Station / Sub Department the operator just filled via the
    //    Compartment cascade the moment they touch the (editable-because-blank) Nomenclature field.
    //  - CAT III: its "Equipment Name" is free-typed (new equipment, nothing in CMMS to match
    //    against yet) — Model/Nomenclature/OEM Part No are all separately free-typed/user-picked
    //    there too, so none of this applies; every keystroke would otherwise clear them.
    if (this.editRow() || this.category() === "CAT III") return;

    const ref = this.referenceData();
    const isSystem = this.sfdType() === "System";
    const matchList = isSystem ? ref?.systems : ref?.equipment;
    const match = label ? matchList?.find((e) => e.label === label) : undefined;

    this.pickedEquipmentUniversalId.set(match?.universalId ?? null);
    // Whatever Nomenclature used to be picked no longer applies to the newly (un)picked equipment
    // — clearing it also clears everything onNomenclaturePicked had cascaded from it (OEM Name/
    // Supplier/Shelf Life/Survey & Demand-Local Purchase's extra fields), but NOT System Name —
    // that's this pick's own job below, and stays put across nomenclature changes once set.
    this.addForm.get(controlKey("Nomenclature"))?.setValue("");

    // Actual clears, not setFormValue("Model", "") — setFormValue is a no-op on an empty string
    // by design (see its own doc), so that call never cleared anything; harmless while Model/OEM
    // Part No fell back to editable-when-blank either way, but now that they lock (CAT I/Survey &
    // Demand/Local Purchase's Old group — see oldGroupAlwaysLocked), a stale value surviving an
    // equipment change would be a genuinely wrong, locked, unfixable-except-via-the-fallback-field
    // display. Their own "(if not auto-fetched)" fallback controls are cleared alongside so a
    // value typed in for the PREVIOUS equipment doesn't linger and get silently resubmitted
    // against this one.
    const clearModelAndOemPart = () => {
      this.addForm.get(controlKey("Model"))?.setValue("");
      this.addForm.get(controlKey("OEM Part No"))?.setValue("");
      this.addForm.get(controlKey("Model (if not auto-fetched)"))?.setValue("");
      this.addForm.get(controlKey("OEM Part No (if not auto-fetched)"))?.setValue("");
    };

    if (!match) {
      clearModelAndOemPart();
      const sysControl = this.addForm.get("sysName");
      sysControl?.enable();
      sysControl?.setValue("");
      this.equipmentMappedSystemLabel.set(null);
      this.systemDefaultInfoModalOpen.set(false);
      this.cdr.detectChanges();
      this.cascadeTick.update((n) => n + 1);
      this.cdr.detectChanges();
      return;
    }

    clearModelAndOemPart();
    const modelMatch = ref?.models.find((m) => m.universalId === match.universalId);
    this.setFormValue("Model", modelMatch?.label);

    const oemPartMatch = ref?.oemPartNumbers.find((p) => p.universalId === match.universalId);
    this.setFormValue("OEM Part No", oemPartMatch?.label);
    // Forces Model/OEM Part No's own writeValue through synchronously — same reasoning as
    // onCompartmentPicked's identical pair of detectChanges() calls (see its doc): the
    // `await loadEquipmentCascade(...)` below resumes in a fresh microtask, and OnPush + zone.js's
    // own scheduling isn't guaranteed to have painted these two values before this function goes
    // on to await — without this, OEM Part No in particular (its own SelectInput matches the
    // control's raw value against LOCATION_OPTIONS-style option `value`s, same as Compartment
    // Name/Location) could end up locked-and-blank-looking even though the value landed correctly.
    this.cdr.detectChanges();

    // Auto-pick Nomenclature the moment it's unambiguous — explicit product direction: an
    // equipment with only one nomenclature on record shouldn't make the operator open a
    // single-item dropdown just to confirm it; setting it here (rather than leaving it for a
    // manual pick) fires the exact same onNomenclaturePicked cascade a real pick would, via the
    // control's own subscription (see subscribeCascadeHandlers). Scoped to this equipment's own
    // nomenclatures/deduplicated the same way optionsForSpec's own Nomenclature branch is, so the
    // two never disagree about what "only one option" means.
    const nomenclatureOptions = match
      ? Array.from(
          new Set(
            (ref?.nomenclatures ?? [])
              .filter((n) => n.universalId === match.universalId)
              .map((n) => n.label),
          ),
        )
      : [];
    if (nomenclatureOptions.length === 1) {
      this.addForm.get(controlKey("Nomenclature"))?.setValue(nomenclatureOptions[0]);
    }

    // Whether this equipment is already mapped to a system depends only on the equipment itself,
    // not which nomenclature ends up picked — resolved here (equipment-only, no nomenclature) so
    // it's set once and doesn't get re-evaluated (and potentially overwritten) on every
    // nomenclature change afterward.
    try {
      if (!isSystem && ref) {
        // This same catalog entry can itself double as a system (a separate CMMS classification
        // from the mapping check below) — pre-fills System Name with it before the mapping check
        // potentially overrides it with an actually-mapped system instead.
        const systemMatch = ref.systems.find((s) => s.universalId === match.universalId);
        if (systemMatch) this.addForm.get("sysName")?.setValue(systemMatch.label);

        const cascade = await this.sfdActions.loadEquipmentCascade(match.universalId);
        if (cascade) this.applyEquipmentMappingLock(cascade, ref);

        // The pre-fill above only sticks if applyEquipmentMappingLock() didn't just overwrite it
        // with a real, already-mapped System (see equipmentMappedSystemLabel) — in that case
        // System Name is auto-picked but still open for the user to change, so a one-time popup
        // tells them a default was chosen and they're free to pick a different one instead.
        if (systemMatch && !this.equipmentMappedSystemLabel()) {
          this.systemDefaultInfoModalOpen.set(true);
        }
      }
    } finally {
      this.cdr.detectChanges();
      this.cascadeTick.update((n) => n + 1);
      this.cdr.detectChanges();
    }
  }

  /**
   * Nomenclature pick — now that both the equipment and which of its nomenclatures are known, the
   * specific matching record can actually be resolved (`GET get_equipment/`, filtered by both).
   * OEM Name/Supplier/Shelf Life auto-fill from it if found; Survey & Demand/Local Purchase
   * additionally auto-fetch Equipment Serial No/Deck No/Frame Station/Location/Compartment Name/
   * Installation Date/Installation Remarks/Qty Fitted/Sub Department from that same response.
   * CAT I/II/III don't get those from here — Deck No/Frame Station/Location normally come from the
   * separate Compartment-pick cascade (`onCompartmentPicked`) — except Compartment Name itself,
   * which auto-fills and locks here too if this record already has one on record (an equipment
   * that's been fitted with this nomenclature before very likely goes in the same compartment
   * again), leaving the normal manual Compartment pick for whenever it doesn't.
   */
  /** Guards applyNomenclaturePickedCascade against out-of-order responses — see its own doc. */
  private nomenclatureCascadeToken = 0;

  private async onNomenclaturePicked(label: string): Promise<void> {
    // Skip when:
    //  - Update/View mode (editRow() set): see onEquipmentPicked's own guard for the full
    //    reasoning — pickedEquipmentUniversalId is always null in edit mode, so this handler would
    //    always fall into the clearNomenclatureCascadeFields() branch below and blow away the
    //    Compartment Name / Deck No / Location / Frame Station / Sub Department the operator just
    //    picked, the instant they open the (editable-because-blank) Nomenclature field.
    //  - CAT III: its "Nomenclature" is free-typed (new equipment, no CMMS history to pick from) —
    //    every keystroke would otherwise fire this and wipe whatever OEM Name/Supplier/Shelf Life
    //    the user picked manually, none of which cascade from Nomenclature in this category.
    if (this.editRow() || this.category() === "CAT III") return;

    const isSurveyOrLocalPurchase = this.category() === "Survey & Demand" || this.category() === "Local Purchase";
    const equipmentUid = this.pickedEquipmentUniversalId();

    if (!label || !equipmentUid) {
      this.nomenclatureCascadeToken++; // invalidate any request already in flight too
      this.clearNomenclatureCascadeFields(isSurveyOrLocalPurchase);
      return;
    }
    const requestToken = ++this.nomenclatureCascadeToken;
    // Every path below has already applied whatever cascade values it could — bump this once
    // regardless of which one that ends up being, so displayFields() re-checks each CMMS field's
    // now-current value (see isCmmsCascadeLockedField's use in toDisplayField()). Skipped if a
    // newer pick has since superseded this one — see applyNomenclaturePickedCascade's own guard.
    try {
      await this.applyNomenclaturePickedCascade(equipmentUid, label, isSurveyOrLocalPurchase, requestToken);
    } finally {
      if (requestToken === this.nomenclatureCascadeToken) {
        // detectChanges() pair around the tick bump — same reasoning as onCompartmentPicked's
        // identical pair (see its doc): forces OEM Name/Supplier/Shelf Life's (and, for Survey &
        // Demand/Local Purchase, Deck No/Location/Compartment Name/etc's) own writeValue through
        // synchronously instead of leaving it to zone.js's own scheduling after this `await`.
        this.cdr.detectChanges();
        this.cascadeTick.update((n) => n + 1);
        this.cdr.detectChanges();
      }
    }
  }

  private async applyNomenclaturePickedCascade(
    equipmentUid: string,
    nomenclature: string,
    isSurveyOrLocalPurchase: boolean,
    requestToken: number,
  ): Promise<void> {
    const ref = this.referenceData();
    if (!ref) return;

    // System Name's mapping lock is resolved once, at Equipment pick (see onEquipmentPicked) —
    // deliberately NOT re-touched here, so a manually-picked System Name for an unmapped equipment
    // stays exactly as the user left it regardless of which Nomenclature they pick afterward.
    const cascade = await this.sfdActions.loadEquipmentCascade(equipmentUid, nomenclature);
    if (!cascade) return;
    // Nothing guarded this await before — picking Equipment/Nomenclature A then quickly picking
    // B while A's slower `get_equipment/` request was still in flight let A's response land
    // AFTER B's and silently overwrite OEM Name/Supplier/Shelf Life/etc. with A's values, even
    // though B was the equipment actually left selected. This is exactly what "same OEM Name
    // shows for every equipment" looks like when the winning stale response happens to be a
    // particular equipment's fast-resolving row every time. Discarded here instead of applied.
    if (requestToken !== this.nomenclatureCascadeToken) return;

    if (cascade.oem_name_id) {
      const manufacturerMatch = ref.manufacturers.find((m) => m.universalId === cascade.oem_name_id);
      this.setFormValue("OEM Name", manufacturerMatch?.label);
    }
    if (cascade.supplier_id) {
      const supplierMatch = ref.suppliers.find((s) => s.universalId === cascade.supplier_id);
      this.setFormValue(supplierFieldName(this.category()), supplierMatch?.label);
    }
    if (cascade.shelf_life_id != null) {
      this.setFormValue("Shelf Life", cascade.shelf_life_id);
    }

    if (isSurveyOrLocalPurchase) {
      this.applySurveyOrLocalPurchaseCascade(cascade, ref);
    } else {
      this.applyCat123CompartmentCascade(cascade, ref);
      // CAT I only ("Old Equipment Info" split — CAT II deliberately kept its original flat
      // field set, CAT III has none either): the same cascade response Survey & Demand/Local
      // Purchase already reads Equipment Serial No/Installation Date/Installation Remarks/Qty
      // Fitted/Sub Department from also carries them here.
      if (this.category() === "CAT I") {
        this.applyCat1OldEquipmentCascade(cascade, ref);
      }
    }
  }

  /** Equipment mode only: an already-installed equipment that's already mapped to a parent system
   *  (Configuration > System-Equipment Mapping) must keep that same system here — "System Name"
   *  locks to it instead of allowing a different one to be picked. An equipment with no mapping
   *  yet leaves "System Name" open for a normal pick; the backend maps this new record to
   *  whichever system is picked as part of creating it (see _create_sfd_transaction), so no extra
   *  step is needed here beyond letting the user choose. */
  private applyEquipmentMappingLock(cascade: CascadingDropdownValues, ref: SfdActionReferenceData): void {
    const sysControl = this.addForm.get("sysName");
    if (cascade.is_mapped && cascade.mapped_system_id) {
      const mappedSystem = ref.systems.find((s) => s.universalId === cascade.mapped_system_id);
      if (mappedSystem) {
        sysControl?.setValue(mappedSystem.label);
        sysControl?.disable();
        this.equipmentMappedSystemLabel.set(mappedSystem.label);
        return;
      }
    }
    sysControl?.enable();
    this.equipmentMappedSystemLabel.set(null);
  }

  /** CAT I/II/III only, called from {@link applyNomenclaturePickedCascade}: if this equipment +
   *  nomenclature has a compartment on record already, auto-fill and lock Compartment Name (and
   *  the Deck No/Frame Station/Location that come with it) the same way the rest of the CMMS
   *  cascade locks — see compartmentAutoMapped. Otherwise leaves Compartment Name exactly as
   *  onCompartmentPicked's normal manual pick already handles it. */
  private applyCat123CompartmentCascade(cascade: CascadingDropdownValues, ref: SfdActionReferenceData): void {
    // cascade.compartrment is free text off the matched ShipEquipment record (location_on_board)
    // — it won't always exactly match a real CompartmentMaster name. Locking the field on a value
    // that can't actually be selected leaves it looking blank AND uninteractive, with no way to
    // fill it in (the same dead-end class of bug as OEM Part No elsewhere in this cascade) — only
    // lock when it resolves to a real, pickable compartment.
    const compartmentMatch = ref.compartments.find((c) => c.name === cascade.compartrment);
    this.compartmentAutoMapped.set(!!compartmentMatch);
    if (!compartmentMatch) return;

    this.setFormValue("Compartment Name", compartmentMatch.name);
    this.setFormValue("Deck No", cascade.deck_no);
    if (cascade.location) {
      // The raw code ("1"-"4"), not the label — CAT I/II/III's own "Location" always renders as a
      // live SelectInput (kind "select", unconditionally — see kindForSpec: its FIELD_SPECS type is
      // "Dropdown", not "Auto Fetch"), and SelectInput resolves what to *display* by matching the
      // control's raw value against each option's own `value` (LOCATION_OPTIONS' codes), not its
      // label — storing the label here left the dropdown rendering as if nothing were picked even
      // though a real value had landed in the control, the same class of bug already fixed for Deck
      // No above. (Survey & Demand/Local Purchase's own "Location" cascade — onCompartmentPicked
      // below — is different: that one renders as a plain read-only box once locked, which echoes
      // the control's raw value with no separate label lookup, so it still needs the label.)
      const locationMatch = LOCATION_OPTIONS.find((o) => o.value === cascade.location);
      this.setFormValue("Location", locationMatch?.value ?? cascade.location);
    }
    if (cascade.frame_station) {
      const [frameFrom, frameTo] = cascade.frame_station.split(/[–-]/);
      this.frameFromControl.setValue((frameFrom || "").trim());
      this.frameToControl.setValue((frameTo || "").trim());
    }
  }

  /** CAT I only, called from {@link applyNomenclaturePickedCascade} right after
   *  applyCat123CompartmentCascade: its own "Old Equipment Info" section additionally
   *  auto-fetches Equipment Serial No / Installation Date / Installation Remarks / Qty Fitted /
   *  Sub Department from the exact same get_equipment/ cascade response Survey & Demand/Local
   *  Purchase already reads these from (applySurveyOrLocalPurchaseCascade) — same underlying
   *  data, applied to CAT I's own Old group instead. CAT II deliberately kept its original flat
   *  field set (explicit product direction) and CAT III has no old/new split either, so neither
   *  is included. Deck No/Frame Station/Location/Compartment Name are NOT repeated here — those
   *  already come from applyCat123CompartmentCascade just above, which every category shares. */
  private applyCat1OldEquipmentCascade(cascade: CascadingDropdownValues, ref: SfdActionReferenceData): void {
    this.setFormValue("Equipment Serial No", cascade.equipment_sr_no);
    this.setFormValue("Installation Date", formatCascadeDate(cascade.installation_date));
    this.setFormValue("Installation Remarks", cascade.installation_remarks);
    this.setFormValue("Qty Fitted", cascade.qty_fitted);
    if (cascade.sub_department) {
      const sectionMatch = ref.equipmentSections.find((s) => s.universalId === cascade.sub_department);
      this.setFormValue("Sub Department", sectionMatch?.label ?? cascade.sub_department);
    }
  }

  /** "X"-clear branch of {@link onNomenclaturePicked} — resets every field that cascades from a
   *  Nomenclature pick specifically. Leaves Equipment Name/Model/OEM Part No AND System Name
   *  untouched — the former don't depend on Nomenclature at all, and the latter is deliberately
   *  only ever set/reset by onEquipmentPicked (see its doc). */
  private clearNomenclatureCascadeFields(isSurveyOrLocalPurchase: boolean): void {
    const clear = (fieldName: string) => this.addForm.get(controlKey(fieldName))?.setValue("");
    // "(if not auto-fetched)" fallback fields (see FIELD_SPECS' doc on the suffix) are cleared
    // right alongside their plain-named Old counterpart throughout this function — a value typed
    // in for the PREVIOUS Nomenclature pick must not linger and get silently resubmitted for this
    // one, same reasoning as onEquipmentPicked's identical clearModelAndOemPart. A no-op `.get()`
    // for categories/fields that don't have one (CAT II/III have no such controls at all).
    clear("OEM Name");
    clear("OEM Name (if not auto-fetched)");
    clear(supplierFieldName(this.category()));
    clear(`${supplierFieldName(this.category())} (if not auto-fetched)`);
    // "Shelf Life" itself is cleared here; "Shelf Life (New Eqpt)" is not — like its sibling
    // New-group fields (Removal Date, Removal Authority, ...), it's an independent, always-shown
    // mandatory entry the operator fills once per submission, not cascade-populated, so a changed
    // Nomenclature pick has no stale cascade value on it to clear.
    clear("Shelf Life");
    this.compartmentAutoMapped.set(false);
    this.cascadeTick.update((n) => n + 1);
    // CAT I shares the same Old-group fields Survey & Demand/Local Purchase clear below — see
    // applyCat1OldEquipmentCascade's doc for why they're now populated from here too, not just
    // those two categories. CAT II deliberately kept its original flat field set (explicit
    // product direction) and isn't included.
    const isCat1 = this.category() === "CAT I";
    if (!isSurveyOrLocalPurchase && !isCat1) return;
    clear("Equipment Serial No");
    clear("Equipment Serial No (if not auto-fetched)");
    clear("Installation Date");
    clear("Installation Date (if not auto-fetched)");
    clear("Installation Remarks");
    clear("Installation Remarks (New Eqpt)"); // CAT I's own fallback name for this field
    clear("Installation Remarks (if not auto-fetched)"); // Survey & Demand/Local Purchase's
    clear("Qty Fitted");
    clear("Qty Fitted (if not auto-fetched)");
    clear("Sub Department");
    clear("Sub Department (if not auto-fetched)");
    // Deck No/Location/Compartment Name/Frame Station: Survey & Demand/Local Purchase always
    // resolve these from the Nomenclature-pick cascade, so a changed pick must reset the old
    // ones. CAT I's own copies are Compartment-pick-driven, not Nomenclature-driven (see
    // applyCat123CompartmentCascade) — normally untouched here — EXCEPT now that "Compartment
    // Name" locks for CAT I too (see FIELD_SPECS's doc), a changed Nomenclature pick leaving a
    // stale compartment/deck/location behind (and locked, with no way to clear it by hand) would
    // be exactly the dead-end this whole fix exists to avoid. (Already gated to
    // isSurveyOrLocalPurchase || isCat1 by the early return above.)
    clear("Deck No");
    clear("Deck No (New Eqpt)");
    // Frame Station lives outside addForm (frameFromControl/frameToControl), same as CAT I/II/III
    // — clear() above is a no-op for it, unlike every other field in this list.
    this.frameFromControl.setValue("");
    this.frameToControl.setValue("");
    this.newFrameFromControl.setValue("");
    this.newFrameToControl.setValue("");
    clear("Location");
    clear("Location (New Eqpt)");
    clear("Compartment Name");
    clear("Compartment Name (New Eqpt)");
  }

  /** Sets a cascaded form field only when the resolved value is present — leaves the existing
   *  input untouched otherwise (used throughout the Equipment/System-pick cascade). */
  private setFormValue(fieldName: string, value: unknown): void {
    if (value == null || value === "") return;
    this.addForm.get(controlKey(fieldName))?.setValue(value);
  }

  /** Survey & Demand / Local Purchase-only tail of {@link onEquipmentPicked} — Deck No / Frame
   *  Station / Location / Compartment Name / Installation Date / Installation Remarks / Qty
   *  Fitted / Sub Department, all sourced from the same `get_equipment/` cascade response. */
  private applySurveyOrLocalPurchaseCascade(cascade: CascadingDropdownValues, ref: SfdActionReferenceData): void {
    this.setFormValue("Equipment Serial No", cascade.equipment_sr_no);
    this.setFormValue("Deck No", cascade.deck_no);
    // Frame Station lives outside addForm (frameFromControl/frameToControl), same as CAT I/II/III's
    // Compartment-pick cascade (onCompartmentPicked) — get_equipment/ returns it as one combined
    // string ("74-82"), so split it the same way openUpdate() splits an existing row's `frame`.
    if (cascade.frame_station) {
      const [frameFrom, frameTo] = cascade.frame_station.split(/[–-]/);
      this.frameFromControl.setValue((frameFrom || "").trim());
      this.frameToControl.setValue((frameTo || "").trim());
    }
    // Auto Fetch renders as a plain read-only value (not a select), so unlike CAT I/II/III's
    // Location dropdown, this needs the human label resolved up front — the raw "1"-"4" code has
    // nowhere else to become "Port, Aft" for display.
    if (cascade.location) {
      const locationMatch = LOCATION_OPTIONS.find((o) => o.value === cascade.location);
      this.setFormValue("Location", locationMatch?.label ?? cascade.location);
    }
    // cascade.compartrment is free text off the matched ShipEquipment record (location_on_board) —
    // it won't always exactly match a real CompartmentMaster name (e.g. "VARIOUS LOCATIONS").
    // Setting it anyway would lock the field (see toDisplayField's isCmmsCascadeLockedField branch)
    // on a value the select can't actually display or pick — the same dead-end class of bug as
    // applyCat123CompartmentCascade already guards against; only set it when it's real & pickable,
    // otherwise leave Compartment Name for a normal manual pick.
    const compartmentMatch = ref.compartments.find((c) => c.name === cascade.compartrment);
    if (compartmentMatch) this.setFormValue("Compartment Name", compartmentMatch.name);
    this.setFormValue("Installation Date", formatCascadeDate(cascade.installation_date));
    this.setFormValue("Installation Remarks", cascade.installation_remarks);
    this.setFormValue("Qty Fitted", cascade.qty_fitted);
    if (cascade.sub_department) {
      const sectionMatch = ref.equipmentSections.find((s) => s.universalId === cascade.sub_department);
      this.setFormValue("Sub Department", sectionMatch?.label ?? cascade.sub_department);
    }
  }

  /** Compartment-mode cascade — deck/frame/location resolved from the picked compartment's own
   *  master record. `isNewEqpt` is true only for CAT I's "Compartment Name (New Eqpt)" entry point
   *  (see subscribeCascadeHandlers) — that pick fills the "(New Eqpt)" fallback controls (Deck No/
   *  Location/newFrameFromControl-newFrameToControl) instead of Old Equipment Info's own Deck No/
   *  Location/frameFromControl-frameToControl. Explicit product direction: Old Equipment Info must
   *  stay genuinely blank/locked when the operator picks a compartment here — it no longer mirrors
   *  onto "Compartment Name" (or Deck No/Location/Frame Station) at all; buildCreatePayload
   *  (sfd-actions.service.ts) reads whichever of the Old/New pair actually has a value at submit
   *  time instead. Every other category's plain "Compartment Name" still routes through here with
   *  `isNewEqpt: false` — that's the field itself firing this cascade, not a separate fallback, so
   *  the Old-side writes below are exactly the pre-existing behavior for them. */
  private async onCompartmentPicked(label: string, isNewEqpt: boolean): Promise<void> {
    if (!label) return;
    const match = this.referenceData()?.compartments.find((c) => c.name === label);
    if (!match) return;

    const cascade = await this.sfdActions.loadCompartmentCascade(match.id);
    if (!cascade) {
      // Previously a silent no-op — Deck No/Frame Station/Location would just sit unmapped with no
      // indication why, looking identical to "nothing happened yet". Surface it so the user knows to
      // fill those three in manually instead of assuming the pick didn't register.
      this.notification.error(
        "Couldn't fetch Deck No / Frame Station / Location for this compartment. Please fill them in manually.",
      );
      return;
    }
    const deckFieldName = isNewEqpt ? "Deck No (New Eqpt)" : "Deck No";
    const locationFieldName = isNewEqpt ? "Location (New Eqpt)" : "Location";
    const fromControl = isNewEqpt ? this.newFrameFromControl : this.frameFromControl;
    const toControl = isNewEqpt ? this.newFrameToControl : this.frameToControl;
    const deckControl = this.addForm.get(controlKey(deckFieldName));
    if (cascade.deck_no) {
      deckControl?.setValue(cascade.deck_no);
    }
    if (cascade.location_code) {
      // onCompartmentPicked fires for every category — CAT I/II/III's "Location" always renders as
      // a live SelectInput (kind "select" — its FIELD_SPECS type is "Dropdown", not "Auto Fetch"),
      // which resolves what to *display* by matching the control's raw value against each option's
      // own `value` (the LOCATION_OPTIONS code), not its label — so it needs the raw code stored,
      // same reasoning as applyCat123CompartmentCascade's identical fix for this same field. Survey
      // & Demand/Local Purchase's own "Location" is different: once locked it's always the plain
      // read-only "auto" box, which just echoes the control's raw value verbatim with no separate
      // label lookup, so THAT one still needs the human label or it'd show a bare "1"/"2"/"3"/"4".
      // "Location (New Eqpt)" always renders as a live SelectInput too (same as CAT I/II/III's own
      // plain "Location"), so it takes the raw-code branch as well.
      const isSurveyOrLocalPurchase =
        !isNewEqpt && (this.category() === "Survey & Demand" || this.category() === "Local Purchase");
      const locationMatch = LOCATION_OPTIONS.find((o) => o.value === cascade.location_code);
      const locationValue = isSurveyOrLocalPurchase
        ? locationMatch?.label ?? cascade.location_code
        : locationMatch?.value ?? cascade.location_code;
      this.addForm.get(controlKey(locationFieldName))?.setValue(locationValue);
    }
    if (cascade.frame_station_from) fromControl.setValue(cascade.frame_station_from);
    if (cascade.frame_station_to) toControl.setValue(cascade.frame_station_to);
    // Without this, displayFields() (which decides each field's locked/auto-fetched render
    // state) never re-evaluates after a manual Compartment pick — the values above land in the
    // form controls correctly, but Deck No/Frame Station/Location keep rendering in whatever
    // state they were in before the pick (e.g. still an empty editable box) instead of flipping
    // to their auto-fetched display. onEquipmentPicked/onNomenclaturePicked already do this for
    // the same reason; this cascade was missing it.
    //
    // Deck No/Location flip kind from an editable "text"/"select" widget to the locked "auto" box
    // as a direct result of this tick — that swap destroys the old widget and mounts a brand-new
    // one via @switch. This whole cascade resumes from an `await` (a microtask), and OnPush +
    // zone.js's own scheduling of the resulting change-detection pass isn't guaranteed to run
    // synchronously with this call, which left the freshly-mounted "auto" widget's own
    // FormControlName→writeValue hookup unpainted until *something else* happened to trigger a
    // later check — explicit detectChanges() (twice: once for this value landing on whichever
    // widget is CURRENTLY mounted, once more right after the kind flip for the newly-mounted one)
    // forces both passes through synchronously instead of leaving either to zone.js's own timing.
    this.cdr.detectChanges();
    this.cascadeTick.update((n) => n + 1);
    this.cdr.detectChanges();
  }

  // --- "+ Add Compartment" (Compartment Name dropdown, Add/Update SFD form) -------------------
  // Reuses the exact same CompartmentForm the Configuration > Compartments screen already has
  // (sfd/config/compartment-form) instead of a second, duplicate compartment-creation UI — opened
  // inline over this form (not a navigation away) so the operator never loses their in-progress
  // submission. See openAddCompartment/onCompartmentAdded below.
  readonly compartmentAddModalOpen = signal(false);
  /** Which addForm control ("Compartment Name" or the "Compartment Name (New Eqpt)" fallback) to
   *  auto-select the new compartment into once saved — whichever dropdown's "+ Add Compartment"
   *  link was actually clicked. Plain field, not a signal: only ever read once, synchronously,
   *  inside onCompartmentAdded, right after the modal that could change it closes. */
  private compartmentAddTargetKey: string | null = null;
  /** Whichever category's live, pickable compartment field this is — "Compartment Name" (every
   *  category except CAT I/Survey & Demand/Local Purchase's own locked Old copy) or those three
   *  categories' own "Compartment Name (New Eqpt)" — is where "+ Add Compartment" belongs.
   *  Template-side readonly.check still gates it too — a genuinely locked/CMMS-auto-fetched field
   *  (those categories' Old "Compartment Name") has nothing to add a fallback for, since the
   *  operator can't interact with it anyway. Ported from Aug_15. */
  isCompartmentPickerField(rawName: string): boolean {
    return rawName === "Compartment Name" || rawName === "Compartment Name (New Eqpt)";
  }

  openAddCompartment(controlKey: string): void {
    this.compartmentAddTargetKey = controlKey;
    this.compartmentAddModalOpen.set(true);
  }

  closeAddCompartment(): void {
    this.compartmentAddModalOpen.set(false);
  }

  /** CompartmentForm's own `(saved)` — fires with the newly-created Compartment. Refreshes
   *  reference data first (so `ref.compartments` actually has the new one before anything looks
   *  it up), then sets it as the target dropdown's value — that alone re-triggers
   *  onCompartmentPicked via the existing valueChanges subscription (subscribeCascadeHandlers),
   *  which fetches and fills Deck No/Frame Station/Location the exact same way picking any other
   *  compartment already does. No separate cascade call needed here. */
  async onCompartmentAdded(compartment: Compartment): Promise<void> {
    this.compartmentAddModalOpen.set(false);
    const targetKey = this.compartmentAddTargetKey;
    this.compartmentAddTargetKey = null;
    // The compartment itself is already saved server-side by this point (CompartmentForm only
    // ever emits `saved` after its own POST/PUT succeeds) — a failure past here is just "couldn't
    // refresh this form's own dropdown options", not a lost record, so it's reported separately
    // and doesn't block telling the operator the compartment itself was created.
    this.notification.success(`Compartment "${compartment.name}" added.`);
    try {
      this.referenceData.set(await this.sfdActions.loadReferenceData());
      if (targetKey) {
        this.addForm.get(targetKey)?.setValue(compartment.name);
      }
    } catch {
      this.notification.error(
        "Compartment was added, but this form's options couldn't be refreshed — please pick it manually.",
      );
    }
  }

  private toDisplayField(
    spec: ActionFieldSpec,
    type: SfdType | null,
  ): DisplayField {
    // "Eqpt" is the Survey & Demand form's own abbreviation for "Equipment" (e.g. "New Eqpt Serial
    // Number", "Date of Installation (New Eqpt)") — swapped to "System" the same as the full word.
    const label =
      type === "System" ? spec.name.replaceAll("Equipment", "System").replaceAll("Eqpt", "System") : spec.name;
    // Deck No / Location / Frame Station are always Compartment-cascade-derived regardless of
    // category (name-based, since CAT I/II/III mark them "Ship Master" typed Dropdown/Text, not
    // "Auto Fetch") — every other auto-fetched field (Survey & Demand's OEM Name etc.) is typed
    // "Auto Fetch" directly in FIELD_SPECS, so that alone is enough to catch them.
    const autoFetchEligible = isAutoFetchedField(spec.name) || spec.type === "Auto Fetch";
    // In Add mode, every other CMMS-cascade field (Model, Nomenclature, OEM Name, Supplier, OEM
    // Part No, Shelf Life, Sub Department, and Survey & Demand/Local Purchase's Compartment Name)
    // locks the same way once Equipment Name is picked — see isCmmsCascadeLockedField's doc for
    // why Update mode is excluded (isFieldEditable()'s own carve-out takes over there instead).
    // Only once the cascade actually found a value, though — CMMS not having e.g. an OEM Part No
    // recorded for this equipment shouldn't lock the field empty with no way to fill it in by hand.
    // Frame Station lives outside addForm (frameFromControl/frameToControl, or newFrameFromControl/
    // newFrameToControl for the "(New Eqpt)" one — see isNewFrameRangeSpec's doc), so its own value
    // has to be read from there instead of the (nonexistent) addForm control for it.
    const hasCascadeValue = isFrameRangeSpec(spec)
      ? isNewFrameRangeSpec(spec.name)
        ? !!(this.newFrameFromControl.value.trim() || this.newFrameToControl.value.trim())
        : !!(this.frameFromControl.value.trim() || this.frameToControl.value.trim())
      : !isBlankOrNA(this.addForm.get(controlKey(spec.name))?.value);
    // Survey & Demand/Local Purchase's Auto-Fetch fields resolve from one specific historical
    // ShipEquipment record (applySurveyOrLocalPurchaseCascade) — real CMMS data, which can genuinely
    // lack a value for some fields (no serial no. on record, no deck logged, etc.). Locking such a
    // field regardless would be the same dead-end class of bug already guarded against elsewhere in
    // this cascade (see OEM Part No/compartmentAutoMapped's docs): looking blank AND uninteractive,
    // with no way to fill it in by hand, on a field FIELD_SPECS also marks required — permanently
    // blocking submission. Locks only once there's an actual (non-blank, non-"N/A") value, in
    // both Add and Update mode alike — isFieldEditable()'s own carve-out uses this same
    // isBlankOrNA reasoning, so the two stay in agreement on which fields are genuinely open.
    const autoFetched = autoFetchEligible && hasCascadeValue;
    // CAT I/II/III's own Compartment Name (source "Ship Master", so isCmmsCascadeLockedField
    // doesn't already cover it) locks the same value-gated way once applyCat123CompartmentCascade
    // finds a compartment already on record for this equipment + nomenclature — see
    // compartmentAutoMapped's doc.
    const compartmentAutoLocked =
      spec.name === "Compartment Name" && !this.editRow() && this.compartmentAutoMapped();
    // Every "old"-group field EXCEPT the cascade's own trigger (Equipment/System Name, Nomenclature
    // — see isCmmsCascadeLockedField's identical exclusion) is meant to be a read-only description
    // of the equipment being replaced, blank or not — explicit product direction: a value CMMS
    // genuinely has none of is entered under "New Equipment/System Info" instead, never by falling
    // back to an editable pick/type on the "old" side (that fallback is still exactly right for
    // every other CMMS-sourced field outside the old/new split, e.g. CAT III's plain OEM Name).
    // Mirrors Sub Department's own pre-existing "always locked" rule (see kindForSpec) one level
    // up, at the readonly/allowCustomValue level instead of the widget-kind level, since most "old"
    // fields are `type: "Dropdown"` (kindForSpec always renders those as "select" regardless of
    // lock state) rather than "Auto Fetch". Compartment Name keeps its own separate, pre-existing
    // carve-out (isFieldEditable's "stays editable in Update mode" rule) everywhere EXCEPT CAT I,
    // where it's explicit product direction that it locks the same as the rest of Old Equipment
    // Info — "Compartment Name (New Eqpt)" is where the operator picks one instead when blank (see
    // onCompartmentPicked/subscribeCascadeHandlers).
    //
    // Equipment/System Name and Nomenclature MUST stay excluded — they're what the operator picks
    // to run the cascade in the first place, not a result of it; locking them here (an earlier cut
    // of this fix did, by mistake) left the "old" section's very first field permanently
    // unclickable, blocking every Add from ever starting.
    const isCascadeTrigger = isCascadeTriggerField(spec.name);
    // Add mode only, matching every other clause in cmmsLocked below (autoFetched/
    // compartmentAutoLocked/isCmmsCascadeLockedField all key off `hasCascadeValue`, which is
    // itself only meaningful pre-submit) — Update mode has its own separate, already-working gate
    // (isFieldEditable() + applyEditLockdown()'s FormControl.disable()), which actually enforces
    // the lock there (a *disabled* control blocks interaction regardless of this `readonly` prop —
    // SelectInput's own disabledState()/readonly() guards are OR'd together). Leaving this
    // ungated made every "old" field the SAME dead end in Update mode that isFieldEditable()
    // exists specifically to avoid: e.g. Model/OEM Name genuinely blank on an existing record are
    // meant to open back up for correction there, not stay a locked-blank dead end because this
    // rule outranked isFieldEditable()'s own carve-out. Sub Department is unaffected either way —
    // it's independently forced non-interactive in Update mode via applyEditLockdown() (own
    // isFieldEditable() carve-out) and via kindForSpec's own always-"auto" case elsewhere.
    // Applies uniformly to every "old"-group field for all three categories that have one
    // (CAT I/Survey & Demand/Local Purchase) — Compartment Name used to carve itself out except
    // for CAT I specifically; that carve-out is gone now that all three categories follow the
    // same CAT I "Old Equipment Info" lock pattern. Ported from Aug_15.
    const oldGroupAlwaysLocked = spec.group === "old" && !this.editRow() && !isCascadeTrigger;
    const cmmsLocked =
      autoFetched ||
      compartmentAutoLocked ||
      (isCmmsCascadeLockedField(spec) && !this.editRow() && hasCascadeValue) ||
      oldGroupAlwaysLocked;
    // FIELD_SPECS marks the R|H value field `required: false` unconditionally — it's only ever
    // rendered at all once "Enter/Add R|H for SRAR return" is Yes (see rhVisible/displayFields),
    // at which point it must actually be mandatory; when that toggle is No the field (and this
    // required-ness) doesn't apply since the field is filtered out of displayFields entirely.
    // Same reasoning for a fallback field (see fallbackOldFieldName's doc) — FIELD_SPECS marks
    // these `required: false` too since they're not ALWAYS needed, but displayFields() already
    // only ever renders one at all once its Old counterpart came back genuinely blank, at which
    // point filling it in actually is the only way left to satisfy the Old field's own (real)
    // Validators.required — so it shows the same mandatory asterisk as everything else once it's
    // visible, not silently-required-but-unmarked.
    // Update/View mode (editRow() set): no field shows as required — matches
    // buildControlsForSpecs' own Validators.required drop for the same mode (see its doc); showing
    // a red asterisk on a field that's no longer actually enforced would just be misleading.
    //
    // "Old"-group fields (CAT I/Survey & Demand/Local Purchase's "Old Equipment/System Info")
    // never show the asterisk either, regardless of `spec.required` — explicit product direction:
    // every one of them is a read-only, auto-fetched description of the equipment being REPLACED
    // (locked via oldGroupAlwaysLocked below, blank or not), so a mandatory-looking marker on a
    // field the operator can't even type into just reads as a dead end. EXCEPT the cascade trigger
    // fields (`isCascadeTrigger`, computed above) — Equipment/System Name and Nomenclature are the
    // ones the operator actually picks/types to run the cascade in the first place, not a result of
    // it, so they keep their asterisk same as any other genuinely-required, editable field. This
    // ONLY changes the visible marker — `buildControlsForSpecs` still reads `spec.required` directly
    // (not this `required`), so the backend-mandated Validators.required on these fields (see the
    // doc above SURVEY_DEMAND_FIELDS on why several of them must stay real submit-time validators)
    // is completely unaffected.
    const required = this.editRow()
      ? false
      : spec.group === "old" && !isCascadeTrigger
        ? false
        : isRhSpec(spec) || fallbackOldFieldName(spec.name) !== null
          ? true
          : spec.required;
    // CAT II only, once a typed Equipment Name doesn't match a real catalog entry (see
    // pickedEquipmentUniversalId/allowCustomEquipmentName below): Nomenclature is normally scoped
    // to the picked Equipment's own CMMS history (pickedEquipmentUniversalId), which is empty for
    // equipment that isn't in CMMS at all — its Dropdown would have nothing to offer and no way to
    // submit, the same dead-end class of bug as the Auto-Fetch fields above. CAT III hits this
    // identical problem with its own free-typed equipment and solves it by typing Nomenclature
    // outright (see CAT_3_FIELDS); mirrored here.
    const freeTypedNomenclature =
      spec.name === "Nomenclature" &&
      this.previewCategory() === "CAT II" &&
      type !== "System" &&
      !this.pickedEquipmentUniversalId();
    // CAT II's "Equipment Name" doubles as a free-text field, right in the same dropdown (see
    // SelectInput.allowCustomValue) — the equipment can exist in navy inventory without being in
    // this ship's own synced CMMS list yet, so picking from the list is the default but typing a
    // name CMMS doesn't have is just as valid. System mode has no equivalent escape hatch (there's
    // no "System" analogue of this — see optionsForSpec/buildCreatePayload's CAT II handling).
    const allowCustomEquipmentName =
      spec.name === "Equipment Name" && this.previewCategory() === "CAT II" && type !== "System";
    // CAT III ("New Induction") is describing equipment new to CMMS's catalog outright, so its
    // "Model"/"OEM Name" picks have the same reasoning as CAT II's Equipment Name above — the real
    // value may not be in the reference list yet, so typing one by hand has to be just as valid as
    // picking one. A typed OEM Name with no catalog match feeds new_oem_name directly (see
    // buildCreatePayload) — same escape hatch as the sentinel-triggered "New OEM Name" field, just
    // without the extra pick-then-type step.
    const allowCustomModel =
      (spec.name === "Model" || spec.name === "OEM Name") && this.previewCategory() === "CAT III";
    // Any normally CMMS-driven field (Add mode's cascade or Update mode's isFieldEditable — see
    // both their docs) that currently has nothing there: the reference options list may well have
    // nothing for it either (e.g. CAT II's "OEM Part No" when CMMS has no part number on record
    // for this equipment), so typing one by hand has to be just as valid as picking one, same
    // reasoning as allowCustomEquipmentName above — in both Add and Update mode alike, not just
    // Update. Compartment Name/Sub Department are excluded — those are always-editable regardless
    // of value (isFieldEditable's own carve-out), a real pick-from-list, not a blank-value escape
    // hatch, so they don't get the free-text option this represents. CAT I's own "OEM Part No" is
    // excluded too now (`group: "old"`, oldGroupAlwaysLocked) — a blank one there is meant to
    // block, not fall back to a free-typed guess; the correct value goes under New Equipment Info.
    //
    // Survey & Demand/Local Purchase's own "OEM Part No" spec is `source: "User"` (not "CMMS") and
    // `type: "Dropdown"` (not "Auto Fetch") — so on its own it matches neither autoFetchEligible
    // nor isCmmsCascadeLockedField, even though onEquipmentPicked() auto-fills it from the exact
    // same CMMS-sourced `ref.oemPartNumbers` lookup CAT I/II use. Without this explicit name
    // check, a blank auto-fetch here left the user stuck on an empty select with no matching
    // option and no way to type one in by hand. Named explicitly rather than folded into
    // isCmmsCascadeLockedField itself, since that check is a source-based rule everywhere else and
    // this one field is the sole exception to it.
    const options = this.optionsForSpec(spec, type);
    // Whether the control's CURRENT raw value corresponds to any real pickable option — not just
    // whether it's blank. `allowCustomWhenBlank` below used to key off blank-ness alone
    // (`!hasCascadeValue`): the moment a user actually typed a hand-entered value into one of
    // these fields (CMMS had nothing, so they typed their own), that value made the control
    // non-blank, which *revoked* allowCustomValue on the very next displayFields() recompute
    // (e.g. triggered by an unrelated pick elsewhere on the form, bumping cascadeTick) — the typed
    // text still doesn't match any real option (it was never in the catalog), so SelectInput had
    // nothing to display it as, and the field went blank-looking even though the FormControl
    // still genuinely held what was typed. Keying off "does the value match a real option"
    // instead is the actual invariant that matters here, and self-heals once the field ever DOES
    // land on a genuine catalog value (that case has a matching option, so this is false again).
    const hasMatchingOption = options.some((o) => String(o.value) === String(this.addForm.get(controlKey(spec.name))?.value));
    // `!oldGroupAlwaysLocked` below only needs to rule out a genuinely BLANK locked field falling
    // back to a free-typed guess (the "block, don't guess" reasoning it was written for) — it isn't
    // actually protecting against the field becoming editable, since `readonly` (cmmsLocked, always
    // true whenever oldGroupAlwaysLocked is) already independently blocks selectOption()/
    // toggleDropdown()/clearSelection() in select-input.ts regardless of this flag. A field that
    // DOES have a real value here — e.g. "OEM Part No"/"Shelf Life" once mirrorIntoOldControl
    // copied over a hand-typed "(if not auto-fetched)"/"(New Eqpt)" fallback value that doesn't
    // match any real catalog option — needs allowCustomValue too, purely so SelectInput's own
    // customValueLabel() has permission to show that value verbatim instead of rendering blank
    // (looking exactly like the cascade found nothing, when it's sitting right there in the
    // FormControl and about to be submitted). `hasCascadeValue` already IS `!isBlankOrNA(...)` on
    // this exact control for every non-frameRange spec (see its own doc above).
    // "Nomenclature" hits the exact same dead end as isOemPartNoSpec above, for the same root
    // cause: its options are scoped to pickedEquipmentUniversalId (optionsForSpec), which only
    // ever gets set by onEquipmentPicked() reacting to Equipment Name's OWN valueChanges — but in
    // Update mode Equipment Name is prefilled+immediately locked, and subscribeCascadeHandlers
    // (which wires that subscription up) doesn't run until AFTER applyPrefillIfEditing() has
    // already patched it, so that one value-landing never has a listener to fire it. Nomenclature's
    // options list stays permanently empty in Update mode, and the record's real (correctly
    // locked, non-blank) value has nothing to match — same "looks blank even though the FormControl
    // genuinely holds it" symptom, same fix.
    // OEM Part No specifically must never let the operator type their own value in Update mode
    // (explicit product direction) — pick-from-list only there, even when blank/no match. Add mode
    // is unaffected: a genuinely new-to-catalog part number still needs the free-text escape hatch
    // this whole allowCustomWhenBlank rule exists for. Ported from Aug_15.
    const isOemPartNo = isOemPartNoSpec(spec.name);
    const allowCustomWhenBlank =
      (autoFetchEligible || isCmmsCascadeLockedField(spec) || isOemPartNo || isShelfLifeNewEqptSpec(spec.name) || spec.name === "Nomenclature") &&
      !hasMatchingOption &&
      spec.name !== "Compartment Name" &&
      spec.name !== "Sub Department" &&
      !(isOemPartNo && this.editRow()) &&
      (!oldGroupAlwaysLocked || hasCascadeValue);

    return {
      key: controlKey(spec.name),
      rawName: spec.name,
      label,
      required,
      badge: cmmsLocked ? `${spec.source} (auto-fetched)` : spec.source,
      badgeColor: this.badgeColorForSpec(spec),
      placeholder: freeTypedNomenclature ? `Enter ${label}` : this.placeholderForSpec(spec, label),
      kind: freeTypedNomenclature ? "text" : this.kindForSpec(spec, cmmsLocked),
      options,
      readonly: cmmsLocked,
      group: spec.group,
      allowCustomValue: allowCustomEquipmentName || allowCustomModel || allowCustomWhenBlank,
    };
  }

  private badgeColorForSpec(spec: ActionFieldSpec): string {
    if (spec.source === "User") return "#22C55E";
    if (spec.source === "Ship Master") return "#4AA8FF";
    return "#F59E0B";
  }

  private placeholderForSpec(spec: ActionFieldSpec, label: string): string {
    if (spec.type === "Dropdown") return `Select ${label.replace(/ Name$/, "")}`;
    if (spec.type === "Checkbox") return "No";
    // Same "Select X" wording as every interactive dropdown/text field, not the old
    // "Auto-fetched from CMMS" text — the field-source badge already says CMMS (auto-fetched);
    // the placeholder doesn't need to repeat it in different words.
    if (spec.type === "Auto Fetch") return `Select ${label.replace(/ Name$/, "")}`;
    // app-date-picker displays selected dates as DD-MMM-YYYY (e.g. "02-Jun-2026") — matches that
    // format in the placeholder too, rather than the native <input type="date"> dd/mm/yyyy hint
    // this used to pair with.
    if (spec.type === "Date") return "DD-MMM-YYYY";
    return `Enter ${label}`;
  }

  /** `locked` is toDisplayField()'s already-computed cmmsLocked — an "Auto Fetch" field only
   *  renders as the plain, hardcoded-readonly "auto" box while locked (see @case ("auto") in the
   *  template, which forces [readonly]="true" regardless of f.readonly). Once the cascade found
   *  nothing to lock it to, it falls back to a real, normal-readonly editable widget instead of
   *  staying a dead end — see toDisplayField's autoFetched doc. */
  private kindForSpec(spec: ActionFieldSpec, locked: boolean): FieldKind {
    if (spec.type === "Dropdown") return "select";
    if (spec.type === "Checkbox") return "check";
    if (isSerialSpec(spec)) return "serial";
    // Checked before the "Auto Fetch" type: Frame Station is typed "Auto Fetch" in
    // Survey & Demand/Local Purchase's FIELD_SPECS (it's still CMMS-sourced/read-only), but it must
    // render as the same two-input From/To pair CAT I/II/III use — a single read-only box can't hold
    // a range, and buildControlsForSpecs() never gives it an addForm control either way.
    if (isFrameRangeSpec(spec)) return "frameRange";
    // Sub Department always renders as the locked "auto" box in Add mode, whether or not the
    // cascade found a value — explicit product direction: no fallback editable dropdown when it's
    // blank there, unlike every other Auto-Fetch field. In Update mode it's now one of the two
    // fields isFieldEditable() always leaves open (see that method's own doc) — falling through to
    // the plain Auto-Fetch handling below instead, which renders a real, live dropdown once
    // `locked` (cmmsLocked, false now that isFieldEditable reports it editable) says so, matching
    // Compartment Name's own precedent immediately below. Ported from Aug_15.
    if (spec.name === "Sub Department" && !this.editRow()) return "auto";
    // Every other "old"-group Auto-Fetch field (Equipment Supplier Name, Deck No, Location,
    // Installation Date, Qty Fitted, ...) used to get this exact same unconditional "auto" lock —
    // Add mode still does (no fallback editable widget when blank there, by the same explicit
    // product direction as Sub Department above). Update mode now instead falls through to the
    // plain Auto-Fetch handling right below, which already does exactly what "no field should stay
    // a locked-and-blank dead end in Update mode" needs: `locked` here is toDisplayField's cmmsLocked,
    // which itself is already false for one of these fields once isFieldEditable() reports a
    // genuinely blank/N-A value in Update mode (see cmmsLocked's own doc) — so this was blocking a
    // widget these fields would otherwise already be entitled to render as, purely because it ran
    // before ever checking `locked`/editRow() at all.
    if (spec.type === "Auto Fetch" && spec.group === "old" && (locked || !this.editRow())) return "auto";
    if (spec.type === "Auto Fetch") return locked ? "auto" : this.editableKindForAutoFetch(spec);
    if (spec.type === "Date") return "date";
    if (spec.type === "Number" || spec.type === "Decimal") return "number";
    return "text";
  }

  /** Fallback widget for an "Auto Fetch" field once it's unlocked (see kindForSpec) — picks the
   *  kind that field would use if it were hand-typed/picked outright. */
  private editableKindForAutoFetch(spec: ActionFieldSpec): FieldKind {
    if (spec.optionsKey) return "select";
    if (spec.name === "Installation Date") return "date";
    if (spec.name === "Qty Fitted") return "number";
    return "text";
  }

  private optionsForSpec(spec: ActionFieldSpec, type: SfdType | null): DropdownOption[] {
    const isMainEquipmentField = spec.optionsKey === "equipment" && /^(Equipment|System) Name$/.test(spec.name);
    if (isMainEquipmentField && type === "System") {
      return this.referenceData()?.systems.map((s) => ({ label: s.label, value: s.label })) ?? [];
    }
    if (spec.name === "Nomenclature" && spec.optionsKey === "nomenclature") {
      // Scoped to the picked Equipment/System's own nomenclatures — one equipment can have
      // several across its fitted history, so this is never the full global list (see
      // pickedEquipmentUniversalId's doc). Empty (not the unfiltered list) until something's
      // picked, so there's nothing plausible-but-wrong to select before Equipment Name is set.
      const equipmentUid = this.pickedEquipmentUniversalId();
      if (!equipmentUid) return [];
      const ref = this.referenceData();
      const seen = new Set<string>();
      return (ref?.nomenclatures ?? [])
        .filter((n) => n.universalId === equipmentUid)
        .filter((n) => (seen.has(n.label) ? false : (seen.add(n.label), true)))
        .map((n) => ({ label: n.label, value: n.label }));
    }
    if (isOemPartNoSpec(spec.name) && spec.optionsKey === "oemPart") {
      // Scoped to the picked Equipment/System's own OEM Part Numbers — was the full ship-wide
      // deduplicated list (liveOptionSets.oemPart), so every equipment's dropdown showed every
      // other equipment's part numbers too. Empty (not the unfiltered list) until something's
      // picked, same reasoning as Nomenclature above. isOemPartNoSpec (not a bare name check)
      // covers CAT I's "OEM Part No (if not auto-fetched)" fallback too — without it, that field
      // fell through to the generic optionsFor(spec.optionsKey, ...) below, which is unconditionally
      // empty for this optionsKey (see liveOptionSets' own doc on why there's no "oemPart" entry
      // in it at all) — a dropdown with nothing to pick and, since allowCustomWhenBlank didn't
      // recognise the name either, no way to type one in by hand: whatever the operator typed
      // never actually landed in the form control, so the field just silently never saved.
      const equipmentUid = this.pickedEquipmentUniversalId();
      if (!equipmentUid) return [];
      const ref = this.referenceData();
      const seen = new Set<string>();
      return (ref?.oemPartNumbers ?? [])
        .filter((p) => p.universalId === equipmentUid)
        .filter((p) => (seen.has(p.label) ? false : (seen.add(p.label), true)))
        .map((p) => ({ label: p.label, value: p.label }));
    }
    if (spec.name === "OEM Name" && this.previewCategory() === "CAT III") {
      // The sentinel that reveals "New OEM Name" below (see showNewOemName) — only CAT III has
      // that field, so only its own "OEM Name" dropdown offers a way to pick "not in this list".
      // Listed first (explicit product direction) so it's immediately visible rather than
      // buried at the bottom of a long CMMS catalog.
      return [{ label: NEW_OEM_NAME_OPTION, value: NEW_OEM_NAME_OPTION }, ...optionsFor(spec.optionsKey, this.liveOptionSets())];
    }
    if (spec.name === "Supplier Name" && this.previewCategory() === "CAT III") {
      // Same sentinel idea, for "New OEM Supplier Name" below (see showNewOemSupplierName).
      return [
        { label: NEW_OEM_SUPPLIER_OPTION, value: NEW_OEM_SUPPLIER_OPTION },
        ...optionsFor(spec.optionsKey, this.liveOptionSets()),
      ];
    }
    return optionsFor(spec.optionsKey, this.liveOptionSets());
  }

  private applyPrefillIfEditing(): void {
    const row = this.editRow();
    if (!row) return;

    const patch: Record<string, unknown> = {};
    // "auto" (CMMS auto-fetched) fields are locked in Update mode same as everything else, but
    // unlike the rest they were never patched with the record's own value here — they're only
    // ever filled by the Equipment-pick cascade, which can't fire in Update mode since Equipment
    // Name is itself locked. Left alone they render permanently blank instead of showing what the
    // record actually has, even though PREFILL_FIELD_MAP already covers all of them below.
    for (const f of this.displayFields()) {
      if (f.kind === "check" || f.kind === "serial" || f.kind === "frameRange") continue;
      const match = PREFILL_FIELD_MAP.find((m) => m.pattern.test(f.label));
      if (match && this.addForm.contains(f.key)) {
        const val = row[match.key];
        if (val !== undefined) patch[f.key] = val;
      }
    }
    if (this.addForm.contains("sysName")) patch["sysName"] = row.system;
    this.addForm.patchValue(patch);
  }

  setSfdType(t: SfdType): void {
    // Editing an existing record: its Equipment/System type is fixed, so the other radio is locked.
    if (this.editRow() && this.sfdType() !== t) return;
    this.sfdType.set(t);
    this.category.set("CAT I");
    this.checkVals.set({});
    this.serialControl.setValue("");
    this.frameFromControl.setValue("");
    this.frameToControl.setValue("");
    this.newFrameFromControl.setValue("");
    this.newFrameToControl.setValue("");
    this.pickedEquipmentUniversalId.set(null);
    this.compartmentAutoMapped.set(false);
    this.equipmentMappedSystemLabel.set(null);
    this.systemDefaultInfoModalOpen.set(false);
  }

  selectCategory(id: string): void {
    if (this.isCategoryLocked(id as SfdCategory)) return;
    this.category.set(id as SfdCategory);
    this.checkVals.set({});
    this.serialControl.setValue("");
    this.frameFromControl.setValue("");
    this.frameToControl.setValue("");
    this.newFrameFromControl.setValue("");
    this.newFrameToControl.setValue("");
    this.pickedEquipmentUniversalId.set(null);
    this.compartmentAutoMapped.set(false);
    this.equipmentMappedSystemLabel.set(null);
    this.systemDefaultInfoModalOpen.set(false);
  }

  setCheckVal(name: string, val: "Yes" | "No"): void {
    if (this.editRow()) return; // locked in Update mode — only Compartment Name/Sub Department are editable
    this.checkVals.update((v) => ({ ...v, [name]: val }));
  }

  openHistory(): void {
    this.historyDrawerOpen.set(true);
  }

  closeHistory(): void {
    this.historyDrawerOpen.set(false);
  }

  openAdd(): void {
    this.addFormDraft.clear();
    this.clearEditingBanner();
    this.submitAttempted.set(false);
    this.editRow.set(null);
    this.sfdType.set(null);
    this.category.set(null);
    this.checkVals.set({});
    this.originalSerialValue.set("");
    this.serialDuplicate.set(false);
    this.serialControl.setValue("");
    this.serialControl.enable();
    this.frameFromControl.setValue("");
    this.frameToControl.setValue("");
    this.newFrameFromControl.setValue("");
    this.newFrameToControl.setValue("");
    this.frameFromControl.enable();
    this.frameToControl.enable();
    this.newFrameFromControl.enable();
    this.newFrameToControl.enable();
    this.pickedEquipmentUniversalId.set(null);
    this.compartmentAutoMapped.set(false);
    this.equipmentMappedSystemLabel.set(null);
    this.systemDefaultInfoModalOpen.set(false);
    this.formGeneration.update((n) => n + 1);
    this.view.set("add");
  }

  /** Shared by openUpdate() (full-page) and openFullFormFromApproval() (modal) — both need the
   * exact same addForm/category/type/serial/frame prefill+lock behavior for an existing record,
   * differing only in whether they navigate view() or open fullFormModalOpen(). */
  private prefillFormForRow(row: SfdActionRow): void {
    this.addFormDraft.clear();
    this.submitAttempted.set(false);
    this.editRow.set(row);
    // `row.system` is the equipment's PARENT system name (for display) and can be truthy for
    // ordinary Equipment records too — `isSystemRecord` is the one reliable signal for which
    // radio this record actually is.
    this.sfdType.set(row.isSystemRecord ? "System" : "Equipment");
    this.category.set(row.cat);
    const checkSpec = FIELD_SPECS[row.cat].find((s) => s.type === "Checkbox");
    this.checkVals.set(checkSpec ? { [checkSpec.name]: "Yes" } : {});
    // serialControl (the one isSerialSpec-matched control on this category's own field list — see
    // its own doc) is "Equipment Serial No" itself for CAT II/III (no Old/New split, `row.serial`
    // is the only value there ever was), but for CAT I/Survey & Demand/Local Purchase it's actually
    // "New Eqpt Serial Number" — the Old group's own "Equipment Serial No" is `type: "Auto Fetch"`
    // there, dodging isSerialSpec on purpose (see FIELD_SPECS' doc), and lives on a plain addForm
    // control instead (prefilled separately, via applyPrefillIfEditing's PREFILL_FIELD_MAP). Using
    // `row.serial` (the OLD value) here for those three categories was showing "New Eqpt Serial
    // Number" as if it held whatever CMMS had for the OLD equipment — `row.newSerial` (the record's
    // own distinct `new_equipment_sr_no`, submitted separately at create time — see
    // buildCreatePayload's oldNewFields) is the actual value that belongs here.
    const serialSource =
      this.serialFieldSpec()?.group === "new" ? row.newSerial ?? "" : row.serial ?? "";
    this.originalSerialValue.set(serialSource);
    this.serialDuplicate.set(false);
    this.serialControl.setValue(serialSource);
    const [frameFrom, frameTo] = (row.frame || "").split(/[–-]/);
    this.frameFromControl.setValue((frameFrom || "").trim());
    this.frameToControl.setValue((frameTo || "").trim());
    // Update mode: lock everything except Compartment Name/Sub Department/a genuinely blank-or-N/A
    // field (see isFieldEditable's own doc — same "nothing on record, so it can't stay a locked
    // dead end" reasoning applies here too) — Equipment Serial No and Frame Station live outside
    // `addForm` (see the constructor), so they're locked/unlocked here directly instead of through
    // applyEditLockdown's generic per-spec loop, which explicitly skips both (isSerialSpec/
    // isFrameRangeSpec). "View Full Form" (fullFormReadOnly) stays look-only regardless — every
    // field locked uniformly there, blank or not, same override applyEditLockdown gives every
    // other field.
    const readOnly = this.fullFormReadOnly();
    if (readOnly || !isBlankOrNA(serialSource)) {
      this.serialControl.disable();
    } else {
      this.serialControl.enable();
    }
    if (readOnly || !isBlankOrNA(frameFrom)) {
      this.frameFromControl.disable();
    } else {
      this.frameFromControl.enable();
    }
    if (readOnly || !isBlankOrNA(frameTo)) {
      this.frameToControl.disable();
    } else {
      this.frameToControl.enable();
    }
    this.formGeneration.update((n) => n + 1);
  }

  openUpdate(row: SfdActionRow): void {
    this.prefillFormForRow(row);
    this.view.set("add");
    this.flashEditingBanner();
  }

  /** Set whenever {@link openFullFormFromApproval} opens the full-form modal — explicit product
   *  direction: "View Full Form" is look-only regardless of the request's own status, no editing
   *  or resubmitting through this backdoor at all (a Returned request's actual correction still
   *  happens through its normal channel, not here). See the Update/Cancel button pair in
   *  sfdFormTemplate, which swaps to a plain Close when this is true, and applyEditLockdown(),
   *  which uses it to disable every field uniformly — including the two isFieldEditable() would
   *  otherwise leave open (Compartment Name, any currently-blank field) for a genuine edit. */
  readonly fullFormReadOnly = signal(false);

  /**
   * "View Full Form" on an Approval Tracking request — fetches the request's own linked
   * ShipEquipment row directly by its real PK (`equipment_ship_id`, now returned by
   * `approval-tracking/` for both Remove and Change requests) and reuses openUpdate()'s exact
   * prefill, surfaced as a modal instead of navigating away from the Approval Detail screen.
   * Deliberately NOT the Active list's own `GET sfd-list/` (list) endpoint — that excludes
   * anything still Pending/Rejected by default, which is exactly the state a just-submitted,
   * not-yet-approved request's own row is normally in; `retrieve` (this one) is exempt from that
   * filtering (see SFDTransactionViewSet.get_queryset) specifically so this still works then, not
   * only once the request clears approval and shows up in the Active list for real. Available for
   * every status — "view every filled detail for this request" is the whole point regardless of
   * status — and always opens fully locked (see fullFormReadOnly's own doc).
   */
  async openFullFormFromApproval(row: ApprovalSfdRow): Promise<void> {
    const ref = this.referenceData();
    if (!ref) return;
    try {
      // Fetches by the request's own real ShipEquipment PK when the backend supplied one (every
      // request does — see RawApprovalTrackingRow.equipment_ship_id's doc) — reliable regardless
      // of the row's current status/active state, unlike the Active list's own filtered `list`
      // endpoint. Falls back to the old name-based Active-list search only for a request from
      // before this field existed (none should remain, but doesn't 500 if one somehow does).
      const rawMatch = row.equipmentShipId
        ? await this.sfdActions.loadTransactionById(row.equipmentShipId)
        : null;
      const match = rawMatch
        ? this.mapRawRowToDisplayRow(rawMatch, ref)
        : (await this.sfdActions.loadTransactionList({ equipment_name: row.eqp })).results
            .map((r) => this.mapRawRowToDisplayRow(r, ref))
            .find((r) => r.cat === row.cat);
      if (!match) {
        this.notification.error(
          "Couldn't locate the full record for this request — it may have been deleted.",
        );
        return;
      }
      // Read-only for every status EXCEPT Returned/Rejected — a Returned request's whole reason
      // for existing is to let the operator correct and resubmit it (Update here goes through the
      // exact same PUT sfd-list/{id}/ path as a normal edit, which re-stages a
      // ChangeEquipmentRequest at Pending and pushes it back to CMMS). Locking this down
      // unconditionally breaks that — the ONLY way to correct a Returned request.
      // Pending/Approved still have no legitimate reason to be touched from this "view" backdoor,
      // so they stay locked.
      this.fullFormReadOnly.set(!(row.status === "Returned" || row.status === "Rejected"));
      this.prefillFormForRow(match);
      this.fullFormModalOpen.set(true);
      // Approved + now-viewed: explicit product direction — once the operator has actually opened
      // an Approved request from this grid, it has nothing left to action and should disappear
      // from Approval Tracking entirely, for every user (persisted server-side — see
      // markApprovalRequestViewed's/ApprovalTrackingAPIView.post's own docs), not just this
      // session. Removed from the local list right away too so it doesn't wait on the next
      // loadApprovalTracking() refresh to actually disappear. Pending/Returned/Rejected rows are
      // untouched — marking those viewed has no visible effect (see the backend's own exclude()).
      if (row.status === "approved" || row.status === "Approved") {
        this.approvalRows.update((rows) => rows.filter((r) => r.id !== row.id));
        void this.sfdActions.markApprovalRequestViewed(row);
      }
    } catch {
      this.notification.error("Failed to load the full record for this request. Please try again.");
    }
  }

  closeFullFormModal(): void {
    this.fullFormReadOnly.set(false);
    this.addFormDraft.clear();
    this.clearEditingBanner();
    this.submitAttempted.set(false);
    this.editRow.set(null);
    this.sfdType.set(null);
    this.category.set(null);
    this.checkVals.set({});
    this.serialControl.setValue("");
    this.frameFromControl.setValue("");
    this.frameToControl.setValue("");
    this.newFrameFromControl.setValue("");
    this.newFrameToControl.setValue("");
    this.formGeneration.update((n) => n + 1);
    this.fullFormModalOpen.set(false);
    // Only ever set for this modal's own "Returned by INSMA" remarks banner (sfdFormTemplate) —
    // cleared here so a later plain Add/Update (which reuses this same template) can never
    // resurface a stale approval row's remarks (the fullFormModalOpen() gate on that banner
    // already prevents it too, but nothing else still needs this signal alive past this close).
    this.approvalDetailRow.set(null);
  }

  async submitAdd(): Promise<void> {
    this.submitAttempted.set(true);
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      // Names the actual blocking field(s) instead of a generic message — "all required fields"
      // was leaving people staring at a form that looked fully filled in with no way to tell which
      // control the validator actually disagreed with.
      const invalidLabels = this.displayFields()
        .filter((f) => this.addForm.get(f.key)?.invalid)
        .map((f) => f.label);
      this.notification.error(
        invalidLabels.length
          ? `Please fill in: ${invalidLabels.join(", ")}.`
          : "Please fill in all required fields before submitting.",
      );
      return;
    }
    // Same Update/View-mode relaxation as buildControlsForSpecs' own Validators.required drop —
    // the "serial" widget lives outside addForm entirely (see serialControl's own doc), so it
    // needs its own !editRow() guard here rather than picking that up automatically.
    if (!this.editRow() && this.serialFieldSpec()?.required && !this.serialValue().trim()) {
      this.notification.error(`${this.serialFieldSpec()!.name} is required.`);
      return;
    }
    // Final authoritative re-check, not just the debounced live one — a fast submit right after
    // typing could otherwise beat checkSerialDuplicateDebounced's 400ms wait to the punch.
    // Skipped when unchanged from what this session started with, same reasoning as the live
    // check (see originalSerialValue's doc).
    const serialNow = this.serialValue().trim();
    const serialSpec = this.serialFieldSpec();
    if (serialSpec && serialNow && serialNow !== this.originalSerialValue()) {
      const duplicate = await this.sfdActions.serialAlreadyExists(serialNow);
      this.serialDuplicate.set(duplicate);
      if (duplicate) {
        this.notification.error(`${serialSpec.name} already exists on another equipment record.`);
        return;
      }
    }
    if (!this.validateOldOrNewFieldForSubmit()) return;
    if (!this.validateFrameRangeForSubmit()) return;
    const category = this.category();
    const type = this.sfdType();
    const ref = this.referenceData();
    if (!category || !type || !ref) return;

    const editing = this.editRow();
    const result = await this.sfdActions.submitAction({
      category,
      sfdType: type === "System" ? "system" : "equipment",
      formValue: this.addForm.getRawValue(),
      serial: this.serialValue(),
      // "Frame Station (New Eqpt)" (CAT I only — see isNewFrameRangeSpec's doc) is a fully separate
      // pair, never mirrored into frameFromControl/frameToControl — falls back to it here, at
      // submit time, exactly like buildCommonFields' own Deck No/Location/Compartment Name OR
      // fallbacks (sfd-actions.service.ts), instead of Old's own (intentionally blank) values.
      frame: {
        from: this.frameFromControl.value || this.newFrameFromControl.value,
        to: this.frameToControl.value || this.newFrameToControl.value,
      },
      checkVals: this.checkVals(),
      ref,
      isEditing: !!editing,
      // `PUT sfd-list/{id}/` needs this row's own real database PK (`equipment_ship_id`) — `editing.id`
      // (see SfdActionRow.id's own doc). `editing.code` is a completely different value (the
      // Equipment master's own INSMA code, e.g. "58095" here) that just happens to look like a
      // plausible id — sending it as the URL's {id} 404s with "No ShipEquipment matches the given
      // query." since no row's real PK matches it. Every Update submission was hitting this.
      recordId: editing?.id,
    });
    if (!result.ok) {
      this.notification.error(result.error ?? "Unable to submit. Please try again.");
      return;
    }

    const label = type === "System" ? "System" : "Equipment";
    // Capture before back() — it flips fullFormModalOpen() back to false as part of closing.
    const wasFullFormModal = this.fullFormModalOpen();
    this.back();
    this.loadActiveList(this.activePage(), this.activePageSize());
    if (wasFullFormModal) {
      // Resubmitting the full form from Approval Tracking's "View Full Form" — same follow-up as
      // submitApprovalDetailEdit()'s own resubmit: return to the tracking grid and refresh it so
      // the request's new status/updated_date show immediately.
      this.closeApprovalDetail();
      this.approvalRows.set(await this.sfdActions.loadApprovalTracking());
    }
    this.notification.success(`${editing ? "Update" : "Addition"} for this ${label} submitted for INSMA approval`);
  }

  /** Old Equipment Info's own "Compartment Name"/"Deck No"/"Location" (CAT I only — see
   *  newEqptCounterpartFieldName's doc) carry no Validators.required at the FormControl level at
   *  all anymore (buildControlsForSpecs) — Old is meant to end up genuinely blank once the operator
   *  used the "(New Eqpt)" fallback instead, and a per-control cross-field validator needs its own
   *  control's updateValueAndValidity() explicitly re-run from every place the SIBLING's value can
   *  change; an earlier cut of this fix did that and still missed a spot, leaving Compartment Name
   *  stuck "required" even once its own fallback was filled in. Explicit submit-time check instead
   *  — same shape as validateFrameRangeForSubmit() below already uses for Frame Station's own
   *  Old/New pair — raises the matching notification and returns false the moment NEITHER side of
   *  a pair has a value, so submitAdd() can just `if (!this.validateOldOrNewFieldForSubmit()) return;`.
   *  A no-op on every category other than CAT I: `newControl` is null there (no such field exists
   *  on their FIELD_SPECS at all), so the loop just continues past every pair — those categories'
   *  Old fields keep their plain Validators.required, already enforced by submitAdd()'s earlier
   *  `addForm.invalid` check. */
  private validateOldOrNewFieldForSubmit(): boolean {
    // Update/View mode: nothing is required — this whole function exists to enforce
    // requiredness Add mode's own FormControl validators can't (see its own doc above), so it
    // needs the identical editRow() carve-out buildControlsForSpecs' own Validators.required
    // drop uses, or it'd keep blocking Update submissions that fix was meant to unblock.
    if (this.editRow()) return true;
    const pairs: readonly (readonly [string, string])[] = [
      ["Compartment Name", "Compartment Name (New Eqpt)"],
      ["Deck No", "Deck No (New Eqpt)"],
      ["Location", "Location (New Eqpt)"],
    ];
    for (const [oldName, newName] of pairs) {
      const newControl = this.addForm.get(controlKey(newName));
      if (!newControl) continue;
      const oldControl = this.addForm.get(controlKey(oldName));
      if (!isBlankOrNA(oldControl?.value)) continue;
      if (!isBlankOrNA(newControl.value)) continue;
      this.notification.error(`${oldName} is required.`);
      return false;
    }
    return true;
  }

  /** Frame Station From/To validation for submitAdd() — raises the matching notification and
   * returns false when invalid, so the caller can just `if (!this.validateFrameRangeForSubmit()) return;`. */
  private validateFrameRangeForSubmit(): boolean {
    // Same Update/View-mode relaxation as validateOldOrNewFieldForSubmit's own — see its doc.
    // frameFromControl/frameToControl live outside addForm entirely (own separate controls), so
    // this needs its own guard the same way the "serial" widget's check above does.
    if (this.editRow()) return true;
    if (!this.frameRangeFieldSpec()) return true;
    // Old Equipment Info's own Frame Station being blank isn't a validation failure by itself once
    // "Frame Station (New Eqpt)" exists on this category (CAT I) — that's the field the operator
    // fills in instead once CMMS had nothing on record, and buildCreatePayload falls back to it at
    // submit time (see its own doc) — so requiredness shifts onto validateNewFrameRangeForSubmit()
    // below rather than blocking here on an Old box that's SUPPOSED to stay empty. Both sides
    // blank, not just one — a half-filled Old value (odd CMMS data, but possible) still needs
    // fixing on the Old side itself, not papered over by the New fallback.
    const oldBothBlank = !this.frameFromControl.value.trim() && !this.frameToControl.value.trim();
    if (oldBothBlank && this.newFrameRangeFieldSpec()) return this.validateNewFrameRangeForSubmit();
    if (this.frameFieldBlank(this.frameFromControl.value) || this.frameFieldBlank(this.frameToControl.value)) {
      const isBlank = !this.frameFromControl.value.trim() || !this.frameToControl.value.trim();
      this.notification.error(
        isBlank
          ? `${this.frameRangeFieldSpec()!.name} is required.`
          : `${this.frameRangeFieldSpec()!.name} must be greater than 0.`,
      );
      return false;
    }
    if (this.frameRangeOrderBlank()) {
      this.notification.error(`${this.frameRangeFieldSpec()!.name}: "To" cannot be less than "From".`);
      return false;
    }
    return true;
  }

  /** Same shape as validateFrameRangeForSubmit() above, for "Frame Station (New Eqpt)"'s own pair
   *  — only ever called (see validateFrameRangeForSubmit) once Old Equipment Info's own Frame
   *  Station came back genuinely blank, at which point this one actually is the field that must be
   *  filled in. */
  private validateNewFrameRangeForSubmit(): boolean {
    if (this.newFrameFieldBlank(this.newFrameFromControl.value) || this.newFrameFieldBlank(this.newFrameToControl.value)) {
      const isBlank = !this.newFrameFromControl.value.trim() || !this.newFrameToControl.value.trim();
      this.notification.error(
        isBlank
          ? `${this.newFrameRangeFieldSpec()!.name} is required.`
          : `${this.newFrameRangeFieldSpec()!.name} must be greater than 0.`,
      );
      return false;
    }
    if (this.newFrameRangeOrderBlank()) {
      this.notification.error(`${this.newFrameRangeFieldSpec()!.name}: "To" cannot be less than "From".`);
      return false;
    }
    return true;
  }

  back(): void {
    // sfdFormTemplate's Cancel/"Back to List" buttons call this same method whether they're
    // rendered full-page or inside the "View Full Form" modal — in the modal, closing just closes
    // it and leaves the underlying Approval Detail screen's view() alone.
    if (this.fullFormModalOpen()) {
      this.closeFullFormModal();
      return;
    }
    this.addFormDraft.clear();
    this.clearEditingBanner();
    this.submitAttempted.set(false);
    this.view.set("list");
    this.editRow.set(null);
    this.sfdType.set(null);
    this.category.set(null);
    this.checkVals.set({});
    this.serialControl.setValue("");
    this.frameFromControl.setValue("");
    this.frameToControl.setValue("");
    this.newFrameFromControl.setValue("");
    this.newFrameToControl.setValue("");
    this.formGeneration.update((n) => n + 1);
    this.historyDrawerOpen.set(false);
  }

  viewDeleted(): void {
    this.view.set("deleted");
  }

  async viewApproval(): Promise<void> {
    this.view.set("approval");
    try {
      this.approvalRows.set(await this.sfdActions.loadApprovalTracking());
    } catch (err) {
      console.warn("[SfdActions] approval-tracking/ not reachable", err);
    }
  }

  // --- "Sync with CMMS" (Approval Tracking screen header) — pulls down whatever approvals/
  // rejections have come through on CMMS's side since the last sync and applies them locally,
  // then refreshes the grid so the result (Approved/Pending/Returned) shows immediately. ---
  readonly syncingWithCmms = signal(false);

  async syncWithCmms(): Promise<void> {
    if (this.syncingWithCmms()) return;
    this.syncingWithCmms.set(true);
    try {
      const result = await this.sfdActions.syncWithCmms();
      if (!result.ok) {
        this.notification.error(result.error ?? "Failed to sync with CMMS. Please try again.", "CMMS Sync Failed");
        return;
      }
      this.approvalRows.set(await this.sfdActions.loadApprovalTracking());
      this.notification.success(result.message, "Synced with CMMS");
    } finally {
      this.syncingWithCmms.set(false);
    }
  }

  // --- Remove (3-stage wizard: choose how to handle active maintenance/defects, then the
  // Removal Details form) — submits via the real POST sfd-list/{id}/remove/. Whether the "choose"
  // step is needed is decided by a real dependency check (open-dependencies/), not a mock list. ---
  readonly removeRow = signal<SfdActionRow | null>(null);
  readonly removeStage = signal<RemoveStage>("loading");
  readonly removeOption = signal<RemoveOption>(null);
  readonly removeDefectRows = signal<DefectRecord[]>([]);

  readonly removeDefectCols = [
    { headerName: "Record ID", field: "id", flex: 1, minWidth: 110 },
    {
      headerName: "Type",
      field: "type",
      flex: 1,
      minWidth: 110,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: { Defect: "danger", Routine: "info" } },
    },
    { headerName: "Description", field: "desc", flex: 2, minWidth: 180 },
    { headerName: "Raised", field: "raised", flex: 1, minWidth: 120 },
    { headerName: "Priority", field: "priority", flex: 1, minWidth: 110 },
    {
      headerName: "Status",
      field: "status",
      flex: 1,
      minWidth: 120,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: { Open: "danger", Due: "warning" } },
    },
    {
      headerName: "Action",
      width: 150,
      pinned: "right" as const,
      cellStyle: { display: "flex", justifyContent: "center", alignItems: "center" },
      cellRenderer: (params: CellCallbackParams) => {
        const defect = params["data"] as DefectRecord;
        const label = defect.type === "Defect" ? "Open in DART" : "Open in Routines";
        return `<button type="button" class="mgmt__link-btn" style="cursor:pointer;">${label}</button>`;
      },
      onCellClicked: (event: CellCallbackParams) => this.onDefectAction(event["data"] as DefectRecord),
    },
  ];
  readonly removeDetails = signal<RawRemovalDetails | null>(null);
  readonly deleteConfirmModalOpen = signal(false);
  readonly deleteConfirmRow = signal<SfdActionRow | null>(null);

  readonly removeForm = this.fb.group({
    removalDate: ["", Validators.required],
    authority: ["", Validators.required],
    remarks: ["", Validators.required],
  });

  async confirmDeletePrompt(row: SfdActionRow): Promise<void> {
    this.deleteConfirmRow.set(row);
    this.deleteConfirmModalOpen.set(true);
  }

  async onDeleteConfirmOk(): Promise<void> {
    const row = this.deleteConfirmRow();
    if (!row) return;

    this.deleteConfirmModalOpen.set(false);
    this.removeRow.set(row);
    this.removeStage.set("loading"); // stay neutral until open-dependencies resolves — never flash "choose" first
    this.removeOption.set(null);
    this.removeForm.reset({ removalDate: "", authority: "", remarks: "" });
    this.removeDefectRows.set([]);
    this.removeDetails.set(null);
    let dependencies: DefectRecord[] = [];
    let details: RawRemovalDetails | null = null;
    try {
      [dependencies, details] = await Promise.all([
        this.sfdActions.loadOpenDependencies(row.id),
        this.sfdActions.loadRemovalDetails(row.id),
      ]);
    } catch (err) {
      // Both calls already resolve to a safe fallback on their own errors — this only guards against
      // something unexpected slipping through, so Remove still lands on the Removal Details form
      // instead of being stranded on the default "choose" stage with no data.
      console.warn("[SfdActions] Remove pre-checks failed — defaulting to the Removal Details form", err);
    }
    if (this.removeRow() !== row) return; // closed/replaced while the check was in flight
    this.removeDefectRows.set(dependencies);
    this.removeDetails.set(details);
    this.removeStage.set(dependencies.length ? "choose" : "form");
  }

  closeRemove(): void {
    this.removeRow.set(null);
    this.removeStage.set("loading");
    this.removeOption.set(null);
    this.removeDetails.set(null);
  }

  setRemoveOption(option: "close" | "associate"): void {
    this.removeOption.set(option);
  }

  removeContinue(): void {
    const option = this.removeOption();
    if (!option) return;
    this.removeStage.set(option === "close" ? "defects" : "form");
  }

  removeBackChoose(): void {
    this.removeStage.set("choose");
  }

  /** True when any of the Removal Details form's four read-only fields (Equipment Nomenclature,
   * Equipment Serial No., Sub Department, Location on Board) has no value to show — same
   * fallback chain as the template and `submitRemove()`'s payload, so the Submit button disables
   * exactly when that payload would otherwise go out with a blank identifying field. */
  removalDetailsMissing(): boolean {
    const row = this.removeRow();
    if (!row) return true;
    const details = this.removeDetails();
    return (
      !(details?.equipment_nomenclature || row.nomen) ||
      !(details?.equipment_sr_no || row.serial) ||
      !(details?.sub_dept || row.dept) ||
      !(details?.compartment_name || row.compartment)
    );
  }

  onDefectAction(defect: DefectRecord): void {
    this.notification.success(
      `Opening ${defect.id} in ${defect.type === "Defect" ? "DART" : "Routines"}...`,
    );
  }

  /** "Submit for INSMA Approval" on the Removal Details form doesn't remove anything itself —
   *  it just validates and hands off to the "Are you sure?" confirm stage; submitRemove() (called
   *  from there) is what actually sends the request. */
  requestRemoveConfirm(): void {
    if (!this.removeRow() || this.removeForm.invalid) {
      this.removeForm.markAllAsTouched();
      this.notification.error("Removal Date, Authority for Removal and Remarks are required.");
      return;
    }
    this.removeStage.set("confirm");
  }

  cancelRemoveConfirm(): void {
    this.removeStage.set("form");
  }

  async submitRemove(): Promise<void> {
    const row = this.removeRow();
    if (!row || this.removeForm.invalid) {
      this.removeForm.markAllAsTouched();
      this.notification.error("Removal Date, Authority for Removal and Remarks are required.");
      return;
    }

    const details = this.removeDetails();
    const formValue = this.removeForm.getRawValue();
    const result = await this.sfdActions.submitRemoval(row, {
      removalDate: formValue.removalDate ?? "",
      authority: formValue.authority ?? "",
      remarks: formValue.remarks ?? "",
      equipmentNomenclature: details?.equipment_nomenclature || row.nomen,
      equipmentSrNo: details?.equipment_sr_no || row.serial,
      subDept: details?.sub_dept || row.dept,
      compartmentName: details?.compartment_name || row.compartment,
    });
    if (!result.ok) {
      this.notification.error(result.error ?? "Unable to submit this removal. Please try again.");
      return;
    }

    this.closeRemove();
    this.loadActiveList(this.activePage(), this.activePageSize());
    this.notification.success(`Removal of ${row.name} submitted for INSMA approval`);
  }

  // --- Record Edit modal -----------------------------------------------------
  readonly recModalOpen = signal(false);
  readonly recModalMode = signal<RecModalMode>("update");
  readonly recModalRow = signal<SfdActionRow | null>(null);
  readonly recModalDetails = signal<RawUpdateSrNoDetails | null>(null);

  readonly recForm = this.fb.group({
    serial: [""],
    qty: [""],
    removalAuthority: [""],
    removalDate: [""],
    installationDate: [""],
  });

  readonly recModalTitle = computed(() =>
    this.recModalMode() === "serial" ? "Change Serial Number" : "Update SFD Record",
  );
  readonly recModalSub = computed(() =>
    this.recModalMode() === "serial"
      ? "Update the equipment serial number for this record"
      : "Edit this record and submit the change for INSMA approval",
  );

  async openRecordEdit(row: SfdActionRow, mode: RecModalMode): Promise<void> {
    this.recModalRow.set(row);
    this.recModalMode.set(mode);
    this.recModalDetails.set(null);
    this.recForm.reset({
      serial: row.serial || "",
      qty: String(row.qty),
      removalAuthority: "",
      removalDate: "",
      installationDate: "",
    });
    this.recModalOpen.set(true);

    if (mode !== "serial") return;
    const details = await this.sfdActions.loadUpdateSrNoDetails(row.id);
    if (this.recModalRow() !== row) return; // closed/replaced while the fetch was in flight
    this.recModalDetails.set(details);
    if (details) {
      this.recForm.patchValue({
        serial: details.current_sr_no || row.serial || "",
        removalAuthority: details.removal_authority || "",
        removalDate: toDateInputValue(details.removal_date),
        installationDate: toDateInputValue(details.installation_date),
      });
    }
  }

  closeRecordEdit(): void {
    this.recModalOpen.set(false);
    this.recModalRow.set(null);
    this.recModalDetails.set(null);
  }

  async saveRecordEdit(): Promise<void> {
    const row = this.recModalRow();
    const mode = this.recModalMode();
    if (!row) return;

    const formValue = this.recForm.getRawValue();

    if (mode === "serial") {
      if (!formValue.serial?.trim()) {
        this.notification.error("New Equipment Serial No is required.");
        return;
      }
      if (!formValue.removalAuthority?.trim() || !formValue.removalDate || !formValue.installationDate) {
        this.notification.error("Removal Authority, Removal Date and Installation Date are required.");
        return;
      }
    }

    const details = this.recModalDetails();
    const result = await this.sfdActions.submitRecordEdit(row, mode, {
      serial: formValue.serial ?? "",
      qty: formValue.qty ?? "",
      equipmentNomenclature: details?.equipment_nomenclature || row.nomen,
      currentSrNo: details?.current_sr_no || row.serial,
      subDept: details?.sub_dept || row.dept,
      maintopNo: details?.maintop_no || row.maintop,
      removalAuthority: formValue.removalAuthority ?? "",
      removalDate: formValue.removalDate ?? "",
      installationDate: formValue.installationDate ?? "",
    });
    if (!result.ok) {
      this.notification.error(result.error ?? "Unable to save changes. Please try again.");
      return;
    }

    this.closeRecordEdit();
    this.loadActiveList(this.activePage(), this.activePageSize());
    const msg =
      mode === "serial"
        ? `Serial number change for ${row.name} submitted for INSMA approval`
        : `Update for ${row.name} submitted for INSMA approval`;
    this.notification.success(msg);
  }

  // --- Record View modal (Active list row click) — read-only "Ship Fit Details" ------------
  readonly recordViewOpen = signal(false);
  readonly recordViewRow = signal<SfdActionRow | null>(null);

  readonly recordViewFields = computed<DisplayFieldValue[]>(() => {
    const row = this.recordViewRow();
    if (!row) return [];
    const field = (
      label: string,
      value: string | number | null | undefined,
      badge: "CMMS" | "User",
    ): DisplayFieldValue => ({
      label,
      value: value === undefined || value === null || value === "" ? "—" : String(value),
      badge,
      badgeColor: badge === "User" ? "#22C55E" : "#F59E0B",
    });
    return [
      field("Equipment Name", row.name, "CMMS"),
      // How this equipment was actually inducted (CAT I/II/III, Survey & Demand, Local Purchase)
      // — was missing from this read-only view entirely (explicit product direction to add it):
      // there was no way to tell a Local Purchase equipment apart from a normal CAT I one here.
      // "User" badge — this is whichever category the operator picked on the Add form, not a
      // CMMS-auto-fetched value.
      field("Category", row.cat, "User"),
      field("System Name", row.system, "CMMS"),
      field("Model", row.model, "CMMS"),
      field("Nomenclature", row.nomen, "CMMS"),
      field("OEM Name", row.oem, "CMMS"),
      field("Supplier", row.supplier, "CMMS"),
      field("OEM Part No", row.part, "CMMS"),
      field("Equipment Serial No", row.serial, "User"),
      field("Maintop No.", row.maintop, "CMMS"),
      field("Compartment Name", row.compartment, "CMMS"),
      field("Location", row.location, "CMMS"),
      field("Frame Station", row.frame, "User"),
      field("Deck No", row.deck, "User"),
      field("Installation Date", formatDisplayDate(row.installDate), "User"),
      field("Authority for Installation", row.authority, "User"),
      field("Authority Date", formatDisplayDate(row.authorityDate), "User"),
      field("Qty Fitted", row.qty, "User"),
      field("Shelf Life", row.shelfLife, "CMMS"),
      field("Sub Department", row.dept, "CMMS"),
    ];
  });

  openRecordView(row: SfdActionRow): void {
    this.recordViewRow.set(row);
    this.recordViewOpen.set(true);
  }

  onActiveRowClicked(row: unknown): void {
    // Set by onSfdCellClicked() just before this fires (ag-grid dispatches cellClicked, then
    // rowClicked, synchronously off the same click) when the click landed on the Maintop
    // hyperlink — that already opened the download, so the row-view drawer shouldn't ALSO pop
    // open underneath it.
    if (this.suppressNextActiveRowClick) {
      this.suppressNextActiveRowClick = false;
      return;
    }
    this.openRecordView(row as SfdActionRow);
  }

  private suppressNextActiveRowClick = false;

  /** Maintop No. column (Active list grid) — clicking it asks for confirmation
   *  (maintopDownloadConfirmOpen) before actually downloading; the real fetch+save only happens
   *  from onMaintopDownloadConfirmOk() once the operator picks "Yes". */
  onSfdCellClicked(event: CellCallbackParams): void {
    if (event.colDef?.field !== "maintop") return;
    this.suppressNextActiveRowClick = true;
    const row = event.data as SfdActionRow;
    if (!row.equipmentMasterId) {
      this.notification.error("No Maintop file is linked to this equipment.");
      return;
    }
    this.maintopDownloadConfirmRow.set(row);
    this.maintopDownloadConfirmOpen.set(true);
  }

  readonly maintopDownloadConfirmOpen = signal(false);
  readonly maintopDownloadConfirmRow = signal<SfdActionRow | null>(null);

  cancelMaintopDownload(): void {
    this.maintopDownloadConfirmOpen.set(false);
    this.maintopDownloadConfirmRow.set(null);
  }

  async onMaintopDownloadConfirmOk(): Promise<void> {
    const row = this.maintopDownloadConfirmRow();
    this.maintopDownloadConfirmOpen.set(false);
    this.maintopDownloadConfirmRow.set(null);
    if (!row) return;
    await this.openMaintopFile(row);
  }

  async openMaintopFile(row: SfdActionRow): Promise<void> {
    if (!row.equipmentMasterId) {
      this.notification.error("No Maintop file is linked to this equipment.");
      return;
    }
    try {
      const blob = await this.sfdActions.downloadMaintopPdf(row.equipmentMasterId);
      this.reportExport.downloadBlob(blob, `Maintop_${row.maintop || row.equipmentMasterId}.pdf`);
    } catch {
      this.notification.error("Failed to download the Maintop file. Please try again.");
    }
  }

  closeRecordView(): void {
    this.recordViewOpen.set(false);
    this.recordViewRow.set(null);
  }

  // --- Deleted / Approval views -------------------------------------------
  readonly deletedRows = signal<DeletedSfdRow[]>([]);

  // --- Recent Activity popup (SFD Management header) -----------------------------------------
  readonly recentActivityOpen = signal(false);
  readonly recentActivityLoading = signal(false);
  readonly recentActivityRows = signal<RecentActivityRow[]>([]);

  async openRecentActivity(): Promise<void> {
    this.recentActivityOpen.set(true);
    this.recentActivityLoading.set(true);
    try {
      this.recentActivityRows.set(await this.sfdActions.loadRecentActivity());
    } finally {
      this.recentActivityLoading.set(false);
    }
  }

  /** Closing dismisses everything the popup was just showing — see
   *  SfdActionsService.dismissSeenRecentActivity's own doc for how "seen" is remembered
   *  (a localStorage watermark, since there's no real per-row "seen" flag on the backend) —
   *  instead of requiring a separate "Clear" button click. A later open only shows activity
   *  newer than whatever was on screen just now. */
  closeRecentActivity(): void {
    this.recentActivityOpen.set(false);
    this.recentActivityRows.set([]);
    this.sfdActions.dismissSeenRecentActivity();
  }

  readonly deletedCols = [
    { headerName: "INSMA Code", field: "code", flex: 1, minWidth: 130, cellStyle: { color: "var(--icon-accent)", fontWeight: 600 } },
    { headerName: "Equipment Name", field: "name", flex: 1.5 },
    { headerName: "Nomenclature", field: "nomen", flex: 1 },
    { headerName: "Removal Date", field: "date", flex: 1 },
    { headerName: "Removal Authority", field: "auth", flex: 1.2 },
    { headerName: "Reason", field: "reason", flex: 1.5 },
    { headerName: "Removed By", field: "by", flex: 1 },
  ];

  readonly approvalRows = signal<ApprovalSfdRow[]>([]);

  // Every column below gets an explicit minWidth sized to its own header text — the shared
  // grid's defaultColDef.minWidth (120px) is too narrow for headers like "Last Updated Date" or
  // "Equipment Name" once 10+ flex columns compete for space, so they were ellipsis-truncating
  // ("Equipment...", "SFD Categ...") instead of the grid just scrolling horizontally.
  readonly approvalCols = [
    { headerName: "Request ID", field: "id", flex: 1, minWidth: 130, cellStyle: { color: "var(--icon-accent)", fontWeight: 600 } },
    { headerName: "Equipment Name", field: "eqp", flex: 1.8, minWidth: 170 },
    { headerName: "SFD Category", field: "cat", flex: 1, minWidth: 150 },
    { headerName: "Submitted By", field: "by", flex: 1, minWidth: 150 },
    { headerName: "Submitted Date", field: "date", flex: 1, minWidth: 150 },
    {
      headerName: "Current Status",
      field: "status",
      flex: 1.8,
      minWidth: 210,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: APPROVAL_STATUS_TONE_MAP, labelMap: APPROVAL_STATUS_LABEL_MAP },
    },
    { headerName: "INSMA Officer", field: "officer", flex: 1, minWidth: 150 },
    { headerName: "Approval Date", field: "approveDate", flex: 1, minWidth: 150 },
    { headerName: "INSMA Remarks", field: "remarks", flex: 1.5, minWidth: 160 },
    { headerName: "Last Updated Date", field: "lastUpdatedDate", flex: 1, minWidth: 170 },
    {
      headerName: "Actions",
      width: 110,
      pinned: "right" as const,
      cellStyle: { display: "flex", justifyContent: "center", alignItems: "center" },
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: [
          { icon: "view", label: "View", color: "var(--icon-accent)", action: (r: ApprovalSfdRow) => this.viewFullFormFromApprovalRow(r) },
        ],
      },
    },
  ];

  // --- Approval Detail view — opened inline (not a popup) from the Actions "View" icon or a row
  // click on the Approval grid, mirroring the SFD prototype's in-page detail screen. Read-only
  // while the request is in progress or already approved; only a "Returned" request can be
  // corrected and resubmitted (there is still no live resubmit endpoint, so the save is mocked).
  readonly approvalDetailRow = signal<ApprovalSfdRow | null>(null);

  // Only populated/used when the request is "Returned" — Equipment Name/SFD Category/Submitted By/
  // Submitted Date become editable so the submitter can correct them before resubmitting. INSMA
  // Remarks stays read-only (it's INSMA's own note); `correctionNote` is a separate submitter-side
  // note with nowhere to persist yet (no dedicated field on `ApprovalSfdRow`/the backend today).
  readonly approvalEditForm = this.fb.group({
    eqp: [""],
    cat: [""],
    by: [""],
    date: [""],
    correctionNote: [""],
  });

  // Backend's ApprovalTrackingAPIView.STATUS_MAPPING now sends "Rejected" (not "Returned") for
  // approved_reject === 3, matching this app's status-label convention elsewhere — both are
  // accepted here since APPROVAL_STATUS_LABEL_MAP already displays "Rejected" as "Returned" too.
  readonly approvalIsEditable = computed(() => {
    const status = this.approvalDetailRow()?.status;
    return status === "Returned" || status === "Rejected";
  });

  openApprovalDetail(row: ApprovalSfdRow): void {
    this.approvalDetailRow.set(row);
    this.approvalEditForm.reset({ eqp: row.eqp, cat: row.cat, by: row.by, date: row.date, correctionNote: "" });
    this.view.set("approvalDetail");
  }

  /** Both the Actions column's eye icon and a row click on the Approval Tracking grid used to land
   *  here first — a summary card (Request ID/Equipment Name/SFD Category/Submitted By/Submitted
   *  Date/INSMA Officer/Approval Date/INSMA Remarks) with its own separate "View Full Form" button
   *  to actually see the submitted equipment data. Every one of those summary fields is already a
   *  column on the grid itself, though — the extra screen never showed anything the row didn't
   *  already, just made "see the full form" a two-click trip instead of one. Explicit product
   *  direction: go straight to openFullFormFromApproval() instead — approvalDetailRow still gets
   *  set here (closeApprovalDetail()/the "Returned" resubmit flow in approvalEditForm still read
   *  it), just without ever routing through the "approvalDetail" view itself. */
  viewFullFormFromApprovalRow(row: ApprovalSfdRow): void {
    this.approvalDetailRow.set(row);
    this.approvalEditForm.reset({ eqp: row.eqp, cat: row.cat, by: row.by, date: row.date, correctionNote: "" });
    void this.openFullFormFromApproval(row);
  }

  onApprovalRowClicked(row: unknown): void {
    this.viewFullFormFromApprovalRow(row as ApprovalSfdRow);
  }

  closeApprovalDetail(): void {
    this.approvalDetailRow.set(null);
    this.view.set("approval");
  }

  async submitApprovalDetailEdit(): Promise<void> {
    const row = this.approvalDetailRow();
    if (!row) return;
    const formValue = this.approvalEditForm.getRawValue();
    const result = await this.sfdActions.submitApprovalCorrection(row, {
      eqp: formValue.eqp || row.eqp,
      cat: formValue.cat || row.cat,
      by: formValue.by || row.by,
      date: formValue.date || row.date,
      correctionNote: formValue.correctionNote || "",
    });
    if (!result.ok) {
      this.notification.error(result.error ?? "Unable to resubmit this request. Please try again.");
      return;
    }
    this.closeApprovalDetail();
    // Reload from the server rather than patch the local row — the backend also stamps
    // updated_date/amendment_note and flips status to "Pending" itself.
    this.approvalRows.set(await this.sfdActions.loadApprovalTracking());
    this.notification.success(`Request ${row.id} resubmitted for INSMA approval`);
  }

  approvalStatusTone(status: ApprovalStatus): ChipTone {
    return APPROVAL_STATUS_TONE_MAP[status];
  }

  approvalStatusLabel(status: ApprovalStatus): string {
    return APPROVAL_STATUS_LABEL_MAP[status];
  }

  // --- Approval Tracking search/filter toolbar — same "search box + Filters + Reset Filters"
  // pattern as the Active list's toolbar (toggleActFilters/clearActFilters), reused here rather
  // than reinvented since approvalRows() is already fully loaded client-side (no server paging to
  // coordinate), so filtering is a plain computed instead of a re-fetch. ---
  readonly approvalSearchTerm = signal("");
  readonly approvalFiltersOpen = signal(false);
  readonly approvalCategoryFilter = signal("");
  readonly approvalStatusFilter = signal("");

  readonly approvalCategoryOptions = computed<DropdownOption[]>(() => {
    const values = new Set(this.approvalRows().map((r) => r.cat));
    return Array.from(values).map((v) => ({ label: v, value: v }));
  });

  readonly approvalStatusOptions = computed<DropdownOption[]>(() => {
    const values = new Set(this.approvalRows().map((r) => r.status));
    return Array.from(values).map((v) => ({ label: v, value: v }));
  });

  readonly filteredApprovalRows = computed(() => {
    const term = this.approvalSearchTerm().trim().toLowerCase();
    const cat = this.approvalCategoryFilter();
    const status = this.approvalStatusFilter();
    return this.approvalRows().filter((row) => {
      if (cat && row.cat !== cat) return false;
      if (status && row.status !== status) return false;
      if (!term) return true;
      return [row.id, row.eqp, row.by].some((v) => v.toLowerCase().includes(term));
    });
  });

  readonly approvalAppliedCount = computed(
    () => [this.approvalCategoryFilter(), this.approvalStatusFilter()].filter(Boolean).length,
  );
  readonly approvalHasFilters = computed(() => this.approvalAppliedCount() > 0);

  setApprovalSearchTerm(value: string): void {
    this.approvalSearchTerm.set(value);
  }

  toggleApprovalFilters(): void {
    this.approvalFiltersOpen.update((v) => !v);
  }

  setApprovalCategoryFilter(value: FilterValue): void {
    this.approvalCategoryFilter.set(value ? String(value) : "");
  }

  setApprovalStatusFilter(value: FilterValue): void {
    this.approvalStatusFilter.set(value ? String(value) : "");
  }

  clearApprovalFilters(): void {
    this.approvalSearchTerm.set("");
    this.approvalCategoryFilter.set("");
    this.approvalStatusFilter.set("");
  }
}
