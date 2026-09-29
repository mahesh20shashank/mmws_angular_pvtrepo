import { ButtonComponent } from '../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal, untracked } from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { ColDef, RowData } from "ag-grid-community";

import {
  ActionRendererComponent,
  DataGrid,
  DetailDrawer,
  DynamicField,
  GridStatusChipRenderer,
  InputField,
  ModalComponent,
  PillToggle,
  SelectCard,
  SelectCards,
  SelectInput,
} from "../../../shared/components";
import { IconComponent } from "../../../shared/components/icon/icon.component";
import { RichTextEditor } from "../../../shared/components/rich-text-editor/rich-text-editor";
import { NotificationService } from "../../../Core/services/notification/notification.service";
import { NetworkStatusService } from "../../../Core/http/services/network-status.service";

import { OpmActionsApiService, OpmEquipmentHistory } from "./services/opm-actions-api.service";
import { OpmAddFormDraftService } from "./opm-add-form-draft.service";
import {
  AS_AND_AS_TYPE_FIELD,
  CLOSURE_FIELDS,
  DDB_COMMON,
  GD_NEW_FIELDS,
  GD_REUSED,
  GUARANTEE_APPROVAL,
  GUARANTEE_FIELDS,
  GUAR_DEFAULT_BADGE,
  GUAR_DONE_LABEL,
  OPM_ACT_FILTER_DATE_RANGE_OPTIONS,
  OPM_ACT_FILTER_SEVERITY_OPTIONS,
  OPM_ACT_FILTER_STATUS_OPTIONS,
  OPM_DART_REASONS,
  OPM_SEVERITY_TONE_MAP,
  OPM_STATUS_TONE_MAP,
  OpmDartDetailField,
  OpmFieldSpec,
  RA_COMMON,
  RAISE_DART_FIELDS,
  RA_TYPES,
  raSpecsFor,
  SERVICES_FIELDS,
  TRIAL_AGENCY_OPTIONS,
  computeGuaranteePercent,
  controlKey,
  dartDetailFieldsFor,
  opmPrefillFor,
  toDynamicFieldSpec,
} from "./opm-actions-fields.config";
import {
  OpmActivityKind,
  OpmActivityRow,
  OpmApprovalRow,
  OpmDartRow,
  OpmGuidanceItem,
  OpmSavedSpare,
  OpmSpareRow,
} from "./opm-actions.models";

type ActivityFilterKind = OpmActivityKind | "All";

type ActionsView = "list" | "add" | "raiseRA" | "approval" | "approvalDetail" | "guarantee";

/**
 * Operational Maintenance — Actions tab. Defect / DART lifecycle workflow: worklist →
 * reason-driven Add form (Digital Defect Book) → Raise RA → Approval tracking →
 * Approval detail (SAT/UNSAT/certificate/DTNR) → standalone Add/Extend Guarantee, plus
 * Spare/Trial picker modals, an AI-Assisted Guidance drawer, and a Recent Activity
 * panel. Mirrors the dynamic-field / draft-persistence architecture of the sibling
 * `sfd/management` module. All data comes from `OpmActionsApiService`, which is mock
 * data today shaped exactly like the future real API.
 */
@Component({
  selector: "app-opm-actions",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    DataGrid,
    DetailDrawer,
    PillToggle,
    SelectCards,
    DynamicField,
    RichTextEditor,
    IconComponent,
    ModalComponent,
    InputField,
    SelectInput, ButtonComponent],
  templateUrl: "./opm-actions.component.html",
  styleUrls: ["./opm-actions.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpmActionsComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(OpmActionsApiService);
  private readonly notification = inject(NotificationService);
  private readonly addFormDraft = inject(OpmAddFormDraftService);
  private readonly networkStatus = inject(NetworkStatusService);

  readonly netOnline = this.networkStatus.online;

  // --- View state -------------------------------------------------------------------
  readonly view = signal<ActionsView>("list");
  private readonly formGeneration = signal(0);
  private guidanceAutoOpened = false;
  private pendingBaseValues: Record<string, unknown> | null = null;

  // --- List (worklist) ----------------------------------------------------------------
  readonly dartRows = signal<OpmDartRow[]>([]);
  readonly statusFilter = signal("");
  readonly severityFilter = signal("");
  readonly reasonFilter = signal("");
  readonly dateRangeFilter = signal("");
  readonly filtersOpen = signal(false);
  readonly search = signal("");
  readonly selectedDarts = signal<string[]>([]);
  readonly selectedDartDetail = signal<OpmDartRow | null>(null);

  readonly statusFilterOptions = OPM_ACT_FILTER_STATUS_OPTIONS;
  readonly severityFilterOptions = OPM_ACT_FILTER_SEVERITY_OPTIONS;
  readonly reasonFilterOptions = OPM_DART_REASONS.map((r) => r.value);
  readonly dateRangeFilterOptions = OPM_ACT_FILTER_DATE_RANGE_OPTIONS;

  readonly appliedFilterCount = computed(
    () => [this.statusFilter(), this.severityFilter(), this.reasonFilter(), this.dateRangeFilter()].filter(Boolean).length,
  );
  readonly hasFilters = computed(() => this.appliedFilterCount() > 0);

  private dateRangeCutoff(range: string): Date | null {
    const now = new Date();
    if (range === "Last 30 days") return new Date(now.getTime() - 30 * 86400000);
    if (range === "Last 90 days") return new Date(now.getTime() - 90 * 86400000);
    if (range === "This year") return new Date(now.getFullYear(), 0, 1);
    return null;
  }

  private static readonly MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  private parseDdMmmYyyy(value: string): Date | null {
    const parts = value.split(" ");
    if (parts.length !== 3) return null;
    const month = OpmActionsComponent.MONTHS.indexOf(parts[1]);
    if (month < 0) return null;
    return new Date(Number(parts[2]), month, Number(parts[0]));
  }

  readonly filteredDarts = computed<OpmDartRow[]>(() => {
    const status = this.statusFilter();
    const sev = this.severityFilter();
    const reason = this.reasonFilter();
    const cutoff = this.dateRangeCutoff(this.dateRangeFilter());
    return this.dartRows().filter((r) => {
      if (status && r.status !== status) return false;
      if (sev && r.sev !== sev) return false;
      if (reason && r.reason !== reason) return false;
      if (cutoff) {
        const d = this.parseDdMmmYyyy(r.date);
        if (d && d < cutoff) return false;
      }
      return true;
    });
  });

  /** Search re-sorts matches to the top rather than hard-filtering — matches the
   * reference prototype (a non-matching row stays visible, just lower down). */
  readonly orderedDarts = computed<OpmDartRow[]>(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.filteredDarts();
    if (!q) return rows;
    const isMatch = (r: OpmDartRow) => r.dart.toLowerCase().includes(q) || r.item.toLowerCase().includes(q);
    return [...rows].sort((a, b) => (isMatch(b) ? 1 : 0) - (isMatch(a) ? 1 : 0));
  });

  toggleFilters(): void {
    this.filtersOpen.update((v) => !v);
  }

  resetFilters(): void {
    this.statusFilter.set("");
    this.severityFilter.set("");
    this.reasonFilter.set("");
    this.dateRangeFilter.set("");
    this.search.set("");
  }

  readonly dartColumnDefs: ColDef[] = [
    {
      headerName: "DART No.",
      field: "dart",
      flex: 1.2,
      minWidth: 150,
      cellStyle: (p: { data?: OpmDartRow }) => ({
        color: p.data?.status === "Draft" || p.data?.dart === "—" ? "var(--text-muted)" : "var(--icon-accent)",
        fontWeight: 600,
      }),
    },
    { headerName: "Equipment / Service", field: "item", flex: 1.5, minWidth: 180 },
    { headerName: "Reason", field: "reason", flex: 0.9, minWidth: 110 },
    { headerName: "Defect Rectified", field: "rect", flex: 0.8, minWidth: 120 },
    {
      headerName: "Status",
      field: "status",
      flex: 1.4,
      minWidth: 190,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: OPM_STATUS_TONE_MAP },
    },
    { headerName: "Date", field: "date", flex: 1, minWidth: 120 },
    {
      headerName: "Severity",
      field: "sev",
      flex: 1,
      minWidth: 130,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: OPM_SEVERITY_TONE_MAP },
    },
    {
      headerName: "Action",
      field: "__actions",
      flex: 0.6,
      minWidth: 90,
      sortable: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (r: OpmDartRow) =>
          r.status === "Draft"
            ? []
            : [{ icon: "edit", label: "Update — edit this defect / DART record", color: "#7fb3e0", action: (row: RowData) => this.updateRecord(row as OpmDartRow) }],
      },
    },
  ];

  isDartSelectable = (row: RowData): boolean => (row as OpmDartRow).eligible;

  onDartRowClicked(row: RowData): void {
    const r = row as OpmDartRow;
    if (r.status === "Draft") this.resumeDraft(r);
    else this.openView(r);
  }

  onDartSelectionChanged(rows: RowData[]): void {
    this.selectedDarts.set((rows as OpmDartRow[]).map((r) => r.dart));
  }

  readonly selectedDartChips = computed(() => this.dartRows().filter((r) => this.selectedDarts().includes(r.dart)));

  openView(row: OpmDartRow): void {
    this.selectedDartDetail.set(row);
  }
  closeView(): void {
    this.selectedDartDetail.set(null);
  }
  readonly dartDetailFields = computed<OpmDartDetailField[]>(() => {
    const d = this.selectedDartDetail();
    return d ? dartDetailFieldsFor(d) : [];
  });

  updateRecord(row: OpmDartRow): void {
    if (row.status === "Closed") {
      this.openView(row);
      return;
    }
    this.enterAddScreen(["Services", "As&As", "ABER"].includes(row.reason) ? row.reason : "Defect", row.item, row.rect);
    this.notification.info(`Editing ${row.dart} — ${row.item}`);
  }

  resumeDraft(row: OpmDartRow): void {
    this.enterAddScreen(row.reason || "Defect", row.item, row.rect);
    this.notification.info(`Resuming draft — ${row.item} · previously entered fields pre-filled`);
  }

  private enterAddScreen(reason: string, editItem: string, rect: string): void {
    this.isEditing.set(true);
    this.editItem.set(editItem);
    this.rectified.set(rect === "Yes" || rect === "No" ? rect : "");
    this.guaranteeDefect.set("");
    this.submitAttempted.set(false);
    this.guidanceAutoOpened = false;
    this.reason.set(reason);
    this.formGeneration.update((n) => n + 1);
    this.view.set("add");
  }

  // --- Recent Activity ----------------------------------------------------------------
  readonly activityOpen = signal(false);
  readonly activityFilter = signal<ActivityFilterKind>("All");
  readonly activityRows = signal<OpmActivityRow[]>([]);
  readonly activityFilterChips: ActivityFilterKind[] = ["All", "Defect", "Service", "RA"];

  readonly filteredActivity = computed(() => {
    const f = this.activityFilter();
    return f === "All" ? this.activityRows() : this.activityRows().filter((a) => a.kind === f);
  });

  async openActivity(): Promise<void> {
    this.activityOpen.set(true);
    if (!this.activityRows().length) this.activityRows.set(await this.api.loadRecentActivity());
  }
  closeActivity(): void {
    this.activityOpen.set(false);
  }
  setActivityFilter(k: ActivityFilterKind): void {
    this.activityFilter.set(k);
  }

  resumeActivity(a: OpmActivityRow): void {
    this.activityOpen.set(false);
    if (a.kind === "RA") {
      this.raType.set("OP RA");
      this.raForm.reset();
      this.submitAttempted.set(false);
      this.view.set("raiseRA");
      this.notification.info(`Resuming RA draft — ${a.title} · ${a.note ?? ""}`);
      return;
    }
    this.enterAddScreen(a.reason || "Defect", a.title, a.rect);
    this.notification.info(`Resuming draft — ${a.title} · ${a.note ?? ""}`);
  }

  openActivityRecord(a: OpmActivityRow): void {
    this.activityOpen.set(false);
    if (a.kind === "RA") {
      const match = this.approvalRows().find((r) => r.id === a.code);
      if (match) this.openApprovalDetail(match);
      else this.view.set("approval");
      return;
    }
    const synthetic: OpmDartRow = {
      dart: a.code,
      item: a.title,
      reason: a.reason || "Defect",
      rect: a.rect === "Yes" ? "Yes" : "No",
      status: a.status === "Closed" ? "Closed" : "Open",
      date: a.when,
      sev: "Normal Defect",
      eligible: true,
    };
    const match = this.dartRows().find((r) => r.dart === a.code) ?? synthetic;
    if (match.status === "Closed") this.openView(match);
    else this.updateRecord(match);
  }

  // --- Add Defect / DART ---------------------------------------------------------------
  readonly reason = signal<string>("As&As");
  readonly isEditing = signal(false);
  readonly editItem = signal("");
  readonly rectified = signal<"Yes" | "No" | "">("");
  readonly guaranteeDefect = signal<"Yes" | "No" | "">("");
  readonly submitAttempted = signal(false);

  readonly reasonCards: SelectCard[] = OPM_DART_REASONS.map((r) => ({ id: r.value, title: r.value, desc: r.desc, color: r.color }));

  baseForm: FormGroup = this.fb.group({});
  readonly closureForm = this.buildFormFromSpecs(CLOSURE_FIELDS);
  readonly raiseDartForm = this.buildFormFromSpecs(RAISE_DART_FIELDS);
  readonly gdForm = this.buildFormFromSpecs(GD_NEW_FIELDS);

  readonly baseFieldSpecs = computed(() => this.baseSpecsFor(this.reason()).map(toDynamicFieldSpec));
  readonly closureFieldSpecs = CLOSURE_FIELDS.map(toDynamicFieldSpec);
  readonly raiseDartFieldSpecs = RAISE_DART_FIELDS.map(toDynamicFieldSpec);
  readonly gdFieldSpecs = GD_NEW_FIELDS.map(toDynamicFieldSpec);

  readonly equipmentName = signal("");
  readonly spareRequired = signal("");
  readonly trialsRequired = signal("");

  readonly showRectified = computed(() => this.reason() === "Defect");
  readonly showClosure = computed(() => this.reason() === "Defect" && this.rectified() === "Yes");
  readonly showRaiseDart = computed(() => this.reason() === "Defect" && this.rectified() === "No");
  readonly showGD = computed(() => this.showRaiseDart() && this.guaranteeDefect() === "Yes");
  readonly showSpareDetails = computed(() => this.spareRequired() === "Yes");
  readonly showTrialDetails = computed(() => this.trialsRequired() === "Yes");

  readonly gdReused = GD_REUSED.map(([name, value, source]) => ({ name, value, source }));
  readonly guaranteePercent = computed(() => computeGuaranteePercent(this.editItem() || this.equipmentName(), this.isEditing()));

  private buildFormFromSpecs(specs: OpmFieldSpec[]): FormGroup {
    const controls: Record<string, FormControl> = {};
    for (const s of specs) {
      const skipValidation = s.kind === "editor" || s.kind === "auto" || s.kind === "display";
      controls[controlKey(s.name)] = new FormControl("", s.mandatory && !skipValidation ? [Validators.required] : []);
    }
    return this.fb.group(controls);
  }

  private baseSpecsFor(reason: string): OpmFieldSpec[] {
    if (reason === "Services") return SERVICES_FIELDS;
    if (reason === "As&As") return [AS_AND_AS_TYPE_FIELD, ...DDB_COMMON];
    return DDB_COMMON;
  }

  private applyPrefill(specs: OpmFieldSpec[], form: FormGroup): void {
    const patch: Record<string, string> = {};
    for (const s of specs) {
      const val = opmPrefillFor(s.name, this.editItem());
      if (val) patch[controlKey(s.name)] = val;
    }
    form.patchValue(patch);
  }

  private subscribeBaseFormWatchers(): void {
    const spareControl = this.baseForm.get(controlKey("Spares Used / Spare Required"));
    const trialControl = this.baseForm.get(controlKey("Trials Required"));
    const equipControl = this.baseForm.get(controlKey("Equipment Name"));
    this.spareRequired.set(spareControl?.value ?? "");
    this.trialsRequired.set(trialControl?.value ?? "");
    this.equipmentName.set(equipControl?.value ?? "");
    spareControl?.valueChanges.subscribe((v) => this.spareRequired.set(v ?? ""));
    trialControl?.valueChanges.subscribe((v) => this.trialsRequired.set(v ?? ""));
    equipControl?.valueChanges.subscribe((v) => this.equipmentName.set(v ?? ""));
  }

  pickReason(r: string): void {
    this.rectified.set("");
    this.guaranteeDefect.set("");
    this.submitAttempted.set(false);
    this.reason.set(r);
  }

  setRectified(v: "Yes" | "No"): void {
    this.rectified.set(v);
  }
  setGuaranteeDefect(v: "Yes" | "No"): void {
    this.guaranteeDefect.set(v);
  }

  openAdd(reason?: string): void {
    this.addFormDraft.clear();
    this.savedSpares.set([]);
    this.savedTrial.set(null);
    this.enterAddScreen(reason ?? "As&As", "", "");
    this.isEditing.set(false);
    this.editItem.set("");
  }

  backList(): void {
    this.addFormDraft.clear();
    this.submitAttempted.set(false);
    this.guidanceOpen.set(false);
    this.guidanceAutoOpened = false;
    this.isEditing.set(false);
    this.editItem.set("");
    this.rectified.set("");
    this.guaranteeDefect.set("");
    this.view.set("list");
  }

  async submitDdb(): Promise<void> {
    this.submitAttempted.set(true);
    const forms = [this.baseForm, ...(this.showClosure() ? [this.closureForm] : []), ...(this.showRaiseDart() ? [this.raiseDartForm] : [])];
    if (forms.some((f) => f.invalid)) {
      forms.forEach((f) => f.markAllAsTouched());
      this.notification.error("Some mandatory fields are still required.");
      return;
    }
    const result = await this.api.submitDdb({
      reason: this.reason(),
      isEditing: this.isEditing(),
      editItem: this.editItem(),
      baseValues: this.baseForm.getRawValue(),
      rectified: this.rectified(),
      closureValues: this.closureForm.getRawValue(),
      raiseDartValues: this.raiseDartForm.getRawValue(),
      guaranteeDefect: this.guaranteeDefect(),
      gdValues: this.gdForm.getRawValue(),
      spares: this.savedSpares(),
      trial: this.savedTrial(),
    });
    if (!result.ok) {
      this.notification.error(result.error ?? "Unable to submit. Please try again.");
      return;
    }
    const equip = this.baseForm.get(controlKey("Equipment Name"))?.value || this.editItem() || "New defect";
    const seq = 146 + this.dartRows().length;
    const newRow: OpmDartRow = {
      dart: `DART-2026-${String(seq).padStart(4, "0")}`,
      item: equip,
      reason: this.reason(),
      rect: this.rectified() || "No",
      status: this.showClosure() ? "Closed" : "Open",
      date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, " "),
      sev: (this.baseForm.get(controlKey("Operational Severity"))?.value as OpmDartRow["sev"]) || "Normal Defect",
      eligible: !this.showClosure(),
    };
    this.dartRows.update((rows) => [newRow, ...rows]);
    this.notification.success("Digital Defect Book saved — hidden DART generated");
    this.backList();
  }

  // --- Spare Details ---------------------------------------------------------------
  readonly spareModalOpen = signal(false);
  readonly spareRows = signal<OpmSpareRow[]>([]);
  readonly spareSelection = signal<string[]>([]);
  readonly spareIssuedFilter = signal("");
  readonly savedSpares = signal<OpmSavedSpare[]>([]);

  readonly spareIssuedOptions = computed(() => Array.from(new Set(this.spareRows().map((r) => r.issuedTo))));
  readonly filteredSpareRows = computed(() => {
    const f = this.spareIssuedFilter();
    return f ? this.spareRows().filter((r) => r.issuedTo === f) : this.spareRows();
  });

  async openSpareModal(): Promise<void> {
    this.spareModalOpen.set(true);
    this.spareSelection.set(this.savedSpares().map((s) => s.pattern));
    if (!this.spareRows().length) this.spareRows.set(await this.api.loadUnmappedSpares());
  }
  closeSpareModal(): void {
    this.spareModalOpen.set(false);
  }
  toggleSpare(pattern: string): void {
    this.spareSelection.update((sel) => (sel.includes(pattern) ? sel.filter((p) => p !== pattern) : [...sel, pattern]));
  }

  async saveSpares(): Promise<void> {
    const selection = this.spareSelection();
    if (!selection.length) {
      this.notification.info("Select one or more spares to map");
      return;
    }
    const chosen = this.spareRows().filter((r) => selection.includes(r.pattern));
    await this.api.submitSpares(selection);
    this.savedSpares.set(chosen.map((r) => ({ pattern: r.pattern, desc: r.desc, qtyIssued: r.qtyIssued, issuedTo: r.issuedTo, authority: r.authority })));
    this.spareModalOpen.set(false);
    this.notification.success(`${chosen.length} spare${chosen.length > 1 ? "s" : ""} mapped to this transaction`);
  }
  removeSavedSpare(pattern: string): void {
    this.savedSpares.update((list) => list.filter((s) => s.pattern !== pattern));
  }

  // --- Trial Details -----------------------------------------------------------------
  readonly trialModalOpen = signal(false);
  readonly trialAgency = signal("");
  readonly savedTrial = signal<{ agency: string } | null>(null);
  readonly trialAgencyOptions = TRIAL_AGENCY_OPTIONS.map((v) => ({ label: v, value: v }));

  openTrialModal(): void {
    this.trialModalOpen.set(true);
    this.trialAgency.set(this.savedTrial()?.agency ?? "");
  }
  closeTrialModal(): void {
    this.trialModalOpen.set(false);
  }
  async submitTrials(): Promise<void> {
    if (!this.trialAgency()) {
      this.notification.info("Select a Trial Agency before submitting");
      return;
    }
    await this.api.submitTrial(this.trialAgency());
    this.savedTrial.set({ agency: this.trialAgency() });
    this.trialModalOpen.set(false);
    this.notification.success("Request sent to the Trials Module inbox");
  }
  removeTrial(): void {
    this.savedTrial.set(null);
  }

  // --- AI-Assisted Guidance ------------------------------------------------------------
  readonly guidanceOpen = signal(false);
  readonly guidanceItems = signal<OpmGuidanceItem[]>([]);
  readonly guidancePersonal = computed(() => this.guidanceItems().filter((g) => g.group === "personal"));
  readonly guidanceFleet = computed(() => this.guidanceItems().filter((g) => g.group === "fleet"));
  readonly guidanceSupport = computed(() => this.guidanceItems().filter((g) => g.group === "support"));

  async openGuidance(): Promise<void> {
    this.guidanceOpen.set(true);
    if (this.netOnline() && !this.guidanceItems().length) this.guidanceItems.set(await this.api.loadGuidance(this.equipmentName()));
  }
  toggleGuidance(): void {
    if (this.guidanceOpen()) this.closeGuidance();
    else this.openGuidance();
  }
  closeGuidance(): void {
    this.guidanceOpen.set(false);
  }

  readonly historyOpen = signal(false);
  readonly historyData = signal<OpmEquipmentHistory | null>(null);

  async openEqHistory(): Promise<void> {
    this.historyOpen.set(true);
    const serial = this.baseForm.get(controlKey("Equipment Serial Number"))?.value || "SNME0142-A";
    this.historyData.set(await this.api.loadEquipmentHistory(serial));
  }
  closeEqHistory(): void {
    this.historyOpen.set(false);
  }

  // --- Raise RA ------------------------------------------------------------------------
  readonly raType = signal("OP RA");
  readonly raTypeCards: SelectCard[] = RA_TYPES.map((t) => ({ id: t.key, title: t.key, desc: t.desc }));
  readonly raForm = this.buildFormFromSpecs(RA_COMMON);
  readonly raFieldSpecs = computed(() => raSpecsFor(this.raType()).map(toDynamicFieldSpec));

  openRaiseRA(): void {
    if (!this.selectedDarts().length) {
      this.notification.info("Select one or more eligible DARTs to raise an RA");
      return;
    }
    this.raType.set("OP RA");
    this.raForm.reset();
    this.submitAttempted.set(false);
    this.view.set("raiseRA");
  }

  pickRaType(t: string): void {
    this.raType.set(t);
  }

  async submitRA(): Promise<void> {
    this.submitAttempted.set(true);
    if (this.raForm.invalid) {
      this.raForm.markAllAsTouched();
      this.notification.error("Some mandatory fields are still required.");
      return;
    }
    await this.api.submitRaiseRa({ raType: this.raType(), darts: this.selectedDarts(), fieldValues: this.raForm.getRawValue() });
    this.notification.success("RA raised and routed automatically to FMU for assessment");
    this.selectedDarts.set([]);
    this.submitAttempted.set(false);
    this.view.set("list");
  }

  // --- Approval / RA Status -------------------------------------------------------------
  readonly approvalRows = signal<OpmApprovalRow[]>([]);
  readonly approvalColumnDefs: ColDef[] = [
    { headerName: "DART / RA No.", field: "id", flex: 1.2, minWidth: 150, cellStyle: { color: "var(--icon-accent)", fontWeight: 600 } },
    { headerName: "Equipment / Service", field: "item", flex: 1.5, minWidth: 180 },
    { headerName: "Reason / RA Type", field: "type", flex: 0.9, minWidth: 120 },
    { headerName: "Submitted By", field: "submittedBy", flex: 1.2, minWidth: 170 },
    { headerName: "Submitted Date", field: "date", flex: 0.9, minWidth: 120 },
    {
      headerName: "Current Status",
      field: "status",
      flex: 1.6,
      minWidth: 220,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: OPM_STATUS_TONE_MAP },
    },
    { headerName: "Reviewing Authority", field: "authority", flex: 0.9, minWidth: 130 },
    {
      headerName: "Actions",
      width: 90,
      sortable: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: [{ icon: "view", label: "View", color: "var(--icon-accent)", action: (row: RowData) => this.openApprovalDetail(row as OpmApprovalRow) }],
      },
    },
  ];

  async viewApproval(): Promise<void> {
    this.view.set("approval");
    this.approvalRows.set(await this.api.loadApprovalRows());
  }

  onApprovalRowClicked(row: RowData): void {
    this.openApprovalDetail(row as OpmApprovalRow);
  }

  // --- Approval Detail -------------------------------------------------------------------
  readonly approvalDetailRow = signal<OpmApprovalRow | null>(null);
  readonly verify = signal<"SAT" | "UNSAT" | "">("");
  readonly closedBy = signal<"Dockyard" | "FMU" | "Ship Staff" | "">("");
  readonly personnelNo = signal("");
  readonly personnelName = computed(() => (this.personnelNo().trim().length >= 3 ? "Cdr A. Sharma" : ""));

  readonly closureRemarksControl = new FormControl("", { nonNullable: true });
  readonly verifyRemarksControl = new FormControl("", { nonNullable: true });
  private readonly closureRemarksValue = toSignal(this.closureRemarksControl.valueChanges, { initialValue: "" });
  private readonly verifyRemarksValue = toSignal(this.verifyRemarksControl.valueChanges, { initialValue: "" });

  readonly satCanSubmit = computed(
    () => !!this.closedBy() && (this.closedBy() !== "Ship Staff" || !!this.personnelName()) && !!this.closureRemarksValue().trim(),
  );
  readonly unsatCanSubmit = computed(() => !!this.verifyRemarksValue().trim());

  readonly approvalIsVerify = computed(() => /verification required/i.test(this.approvalDetailRow()?.status ?? ""));
  readonly approvalIsCertificate = computed(() => /certificate issued/i.test(this.approvalDetailRow()?.status ?? ""));
  readonly approvalIsDtnr = computed(() => /dtnr/i.test(this.approvalDetailRow()?.status ?? ""));
  readonly approvalEditable = computed(() => /unsat|return/i.test(this.approvalDetailRow()?.status ?? ""));

  readonly approvalEditForm = this.fb.group({ eqp: [""], type: [""], submittedBy: [""], date: [""] });
  readonly correctionNoteControl = new FormControl("", { nonNullable: true });

  openApprovalDetail(row: OpmApprovalRow): void {
    this.approvalDetailRow.set(row);
    this.verify.set("");
    this.closedBy.set("");
    this.personnelNo.set("");
    this.closureRemarksControl.setValue("");
    this.verifyRemarksControl.setValue("");
    this.approvalEditForm.reset({ eqp: row.item, type: row.type, submittedBy: row.submittedBy, date: row.date });
    this.correctionNoteControl.setValue("");
    this.view.set("approvalDetail");
  }

  approvalDetailBack(): void {
    this.approvalDetailRow.set(null);
    this.view.set("approval");
  }

  setVerify(v: "SAT" | "UNSAT"): void {
    this.verify.set(v);
    this.closedBy.set("");
    this.personnelNo.set("");
    this.closureRemarksControl.setValue("");
    this.verifyRemarksControl.setValue("");
  }

  setClosedBy(v: "Dockyard" | "FMU" | "Ship Staff"): void {
    this.closedBy.set(v);
    this.personnelNo.set("");
  }

  setPersonnelNo(value: string): void {
    this.personnelNo.set(value);
  }

  async submitVerifySat(): Promise<void> {
    if (!this.satCanSubmit()) {
      this.notification.error("Closed By (and Personnel Number for Ship Staff) and Closure Remarks are required.");
      return;
    }
    const row = this.approvalDetailRow();
    if (!row) return;
    await this.api.submitVerifySat({
      requestId: row.id,
      closedBy: this.closedBy(),
      personnelNo: this.personnelNo(),
      closureRemarks: this.closureRemarksControl.value,
    });
    this.approvalRows.update((rows) => rows.map((r) => (r.id === row.id ? { ...r, status: "Closed" } : r)));
    this.notification.success(`SAT confirmed — ${row.id} closed`);
    this.approvalDetailBack();
  }

  async submitVerifyUnsat(): Promise<void> {
    if (!this.unsatCanSubmit()) {
      this.notification.error("UNSAT remarks are required.");
      return;
    }
    const row = this.approvalDetailRow();
    if (!row) return;
    await this.api.submitVerifyUnsat({ requestId: row.id, remarks: this.verifyRemarksControl.value });
    this.approvalRows.update((rows) => rows.map((r) => (r.id === row.id ? { ...r, status: "UNSAT – Fast-tracked to Yard" } : r)));
    this.notification.error(`UNSAT recorded — ${row.id} fast-tracked directly to the Yard for rework`);
    this.approvalDetailBack();
  }

  downloadCert(): void {
    const row = this.approvalDetailRow();
    this.notification.info(`Downloading ${row?.certType ?? "certificate"} certificate for ${row?.id ?? "RA"}`);
  }

  async approvalResubmit(): Promise<void> {
    const row = this.approvalDetailRow();
    if (!row) return;
    const v = this.approvalEditForm.getRawValue();
    await this.api.resubmitApproval({ requestId: row.id, fieldValues: v as Record<string, string>, correctionNote: this.correctionNoteControl.value });
    this.approvalRows.update((rows) =>
      rows.map((r) =>
        r.id === row.id
          ? { ...r, item: v.eqp || r.item, type: v.type || r.type, submittedBy: v.submittedBy || r.submittedBy, date: v.date || r.date, status: "In Progress" }
          : r,
      ),
    );
    this.notification.success(`Request ${row.id} amended and re-routed to ${row.authority} for assessment`);
    this.approvalDetailBack();
  }

  // --- Add / Extend Guarantee (standalone) -----------------------------------------------
  readonly guarForm = this.buildFormFromSpecs(GUARANTEE_FIELDS);
  readonly guarFieldSpecs = GUARANTEE_FIELDS.map(toDynamicFieldSpec);
  readonly guarSteps = GUARANTEE_APPROVAL;
  readonly guarActiveStep = signal(1);
  readonly guarStage = computed<"draft" | "recommended" | "approved">(() => {
    const step = this.guarActiveStep();
    if (step >= 2) return "approved";
    if (step >= 1) return "recommended";
    return "draft";
  });
  readonly guarDoneLabels = GUAR_DONE_LABEL;
  readonly guarDefaultBadges = GUAR_DEFAULT_BADGE;

  setGuarStep(i: number): void {
    this.guarActiveStep.set(i);
  }

  openHistory(): void {
    this.router.navigate(["/afterAuth/op-maintenance/history"]);
  }

  openGuarantee(): void {
    this.guarForm.reset();
    this.guarActiveStep.set(1);
    this.submitAttempted.set(false);
    this.view.set("guarantee");
  }

  printGD(): void {
    this.notification.success("Guarantee Defect print output generated (D-12345)");
  }

  async submitGuarantee(): Promise<void> {
    this.submitAttempted.set(true);
    if (this.guarForm.invalid) {
      this.guarForm.markAllAsTouched();
      this.notification.error("Some mandatory fields are still required.");
      return;
    }
    await this.api.submitGuarantee({ fieldValues: this.guarForm.getRawValue() });
    this.notification.success("Guarantee coverage request submitted — routed to HOD for review, then CO for approval");
    this.submitAttempted.set(false);
    this.view.set("list");
  }

  constructor() {
    // Restore an in-progress Add/Update draft's field values (survives this component being
    // torn down when the user switches tabs mid-form) WITHOUT jumping the view to "add" —
    // the Actions tab must always land on the Defect/DART Management list on click, never
    // silently resume into a half-filled form the user may not even remember starting.
    const draft = this.addFormDraft.peek();
    if (draft) {
      this.isEditing.set(draft.isEditing);
      this.editItem.set(draft.editItem);
      this.rectified.set(draft.rectified);
      this.guaranteeDefect.set(draft.guaranteeDefect);
      this.savedSpares.set(draft.savedSpares);
      this.savedTrial.set(draft.savedTrial);
      this.pendingBaseValues = draft.baseValues;
      this.closureForm.patchValue(draft.closureValues);
      this.raiseDartForm.patchValue(draft.raiseDartValues);
      this.gdForm.patchValue(draft.gdValues);
      this.reason.set(draft.reason);
      this.formGeneration.update((n) => n + 1);
    }

    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((params) => {
      if (params["view"] === "add") {
        this.openAdd(params["reason"] || undefined);
      } else if (params["view"] === "approval") {
        this.viewApproval();
      } else if (params["view"] === "guarantee") {
        this.openGuarantee();
      }
    });

    effect(() => {
      const reason = this.reason();
      this.formGeneration();
      const specs = untracked(() => this.baseSpecsFor(reason));
      this.baseForm = this.buildFormFromSpecs(specs);
      untracked(() => {
        if (this.isEditing()) this.applyPrefill(specs, this.baseForm);
        const pending = this.pendingBaseValues;
        this.pendingBaseValues = null;
        if (pending) this.baseForm.patchValue(pending);
        this.subscribeBaseFormWatchers();
      });
    });

    // AI-Assisted Guidance auto-trigger: opens once Equipment Name + Reason are both
    // set in the Add form (fixes the reference prototype's dead "auto-triggered" copy).
    // Only for a genuinely new entry — editing an existing record (grid edit icon,
    // resuming a draft, resuming from Recent Activity) already has both fields populated
    // and should just open the form, not re-surface guidance for a defect already logged.
    effect(() => {
      const name = this.equipmentName();
      const reason = this.reason();
      if (
        this.view() === "add" &&
        !this.isEditing() &&
        reason &&
        name.trim().length >= 3 &&
        !this.guidanceAutoOpened
      ) {
        this.guidanceAutoOpened = true;
        untracked(() => this.openGuidance());
      }
    });

    this.dartRows.set([]);
    this.api.loadDartList().then((rows) => this.dartRows.set(rows));
    this.api.loadApprovalRows().then((rows) => this.approvalRows.set(rows));
  }

  ngOnDestroy(): void {
    if (this.view() !== "add") return;
    this.addFormDraft.save({
      reason: this.reason(),
      isEditing: this.isEditing(),
      editItem: this.editItem(),
      rectified: this.rectified(),
      guaranteeDefect: this.guaranteeDefect(),
      baseValues: this.baseForm.getRawValue(),
      closureValues: this.closureForm.getRawValue(),
      raiseDartValues: this.raiseDartForm.getRawValue(),
      gdValues: this.gdForm.getRawValue(),
      savedSpares: this.savedSpares(),
      savedTrial: this.savedTrial(),
    });
  }
}
