import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { CellCallbackParams, ColDef, RowData } from "ag-grid-community";
import { DataGrid } from "../../../../../shared/components/data-grid/data-grid";
import { TextActionRenderer } from "../../../../../shared/components/data-grid/grid-text-action-renderer";
import { StatusFlagRenderer } from "../../../../../shared/components/data-grid/grid-status-flag-renderer";
import { ModalComponent } from "../../../../../shared/components/modal/modal.component";
import { InputField } from "../../../../../shared/components/input-field/input-field";
import { SelectInput } from "../../../../../shared/components/select-input/select-input";
import { TextareaInput } from "../../../../../shared/components/textarea-input/textarea-input";
import { ExportKind, ExportToolbar } from "../../../../../shared/components/export-toolbar/export-toolbar";
import { ToolbarSearch } from "../../../../../shared/components/toolbar-search/toolbar-search";
import { HelpGuidance } from "../../../../../shared/components/help-guidance/help-guidance";
import { PrintColumn, ReportExportService } from "../../../../../Core/services/export/generic-export.service";
import { ObsApiService } from "../../services/obs-api.service";
import { NotificationService } from "../../../../../Core/services/notification/notification.service";
import { getErrorMessage } from "../../../../../Core/http/services/http-feedback";
import { DropdownOptionDto } from "../../models/spare.model";
import {
  IssueListEntry,
  IssueType,
  ObsUserOption,
  ReturnedItemStatus,
  obsUserOptionLabel,
} from "../../models/issue.model";

type SpareCategoryFilter = "PERMANENT" | "RETURNABLE" | "CONSUMABLE";
const CATEGORY_FILTER_OPTIONS: { key: SpareCategoryFilter; label: string }[] = [
  { key: "PERMANENT", label: "Permanent" },
  { key: "RETURNABLE", label: "Returnable" },
  { key: "CONSUMABLE", label: "Consumable" },
];

const HELP_HTML = `
  <h6 class="fw-bold mb-1">What this page is for</h6>
  <p class="mb-2">Lists every spare you have issued that is still waiting to be taken back
     on charge. Use the <strong>Return</strong> action on a row to return that spare.</p>
  <h6 class="fw-bold mb-1">What the columns mean</h6>
  <ul class="mb-2">
    <li><strong>Status</strong> — a <span style="color:#22c55e">green</span> flag for an
        <strong>Internal Issue</strong> (the spare is still on this ship) or an
        <span style="color:#f59e0b">orange</span> flag for a <strong>Ty Loan</strong> (it has
        gone to another unit). Use the <strong>Issue Type</strong> filter to see one or the other.</li>
    <li><strong>Issued To</strong> — the user or ship the spare went to.</li>
    <li><strong>Unit Name</strong> — the unit holding the spare on a Ty Loan. Reads
        <strong>NA</strong> for an internal issue, because the holder is on this ship.</li>
    <li><strong>Reason of Issue</strong> — why it was issued (e.g. Defect, Ty Loan).</li>
    <li><strong>Defect in Eqpt Nomenclature</strong> — the equipment the defect was against.</li>
    <li><strong>Authority</strong> — the scale the spare is held on (e.g. D787J).</li>
  </ul>
  <h6 class="fw-bold mb-1">Ty Loan items</h6>
  <p class="mb-2">A spare issued on <strong>Ty Loan</strong> is tracked here and nowhere else — it
     never raises a Survey or Demand cart row under <strong>Internal Transactions</strong>, because
     the item is on loan and is expected back, not written off or re-demanded.</p>
  <h6 class="fw-bold mb-1">When a row is disabled</h6>
  <p class="mb-2">A row you can act on is still in the <strong>Internal Transactions</strong> cart. If
     you have forwarded a spare to <strong>MO Inventory / WED Inventory</strong> for replenishment
     through MOs, its row here is <strong>disabled</strong> until MO/WED delivers the item onboard and
     the stock is replenished.</p>
  <h6 class="fw-bold mb-1">Return action</h6>
  <p class="mb-0">Opens the return form/dialog where you set <strong>Qty Returned</strong>,
     <strong>Returned By</strong>, <strong>Returned Item Status</strong> (Same as Issued / New Item)
     and <strong>Return Remarks</strong>, then Submit.</p>
`;

/** The Return grid's own filter dimension, alongside Critical and Category. A storekeeper
 * chasing Ty Loans wants only the items that have left the ship; one reconciling internal
 * holdings wants only the ones that have not. Both on by default — the unfiltered list is
 * still everything awaiting return. */
const ISSUE_TYPE_FILTER_OPTIONS: { key: IssueType; label: string }[] = [
  { key: "INTERNAL", label: "Internal Issue" },
  { key: "TY_LOAN", label: "Ty Loan" },
];

/** Green = still on this ship, orange = gone to another unit. Both read from the theme tokens
 * (`styles.css`) so the flag, its label and the row's accent bar are one colour, defined once
 * and correct in both themes. */
const ISSUE_TYPE_FLAGS: Record<IssueType, { color: string; label: string; cellClass: string }> = {
  INTERNAL: {
    color: "var(--obs-issue-flag-internal)",
    label: "Internal Issue",
    cellClass: "obs-issue-flag-cell obs-issue-flag-cell--internal",
  },
  TY_LOAN: {
    color: "var(--obs-issue-flag-ty-loan)",
    label: "Ty Loan",
    cellClass: "obs-issue-flag-cell obs-issue-flag-cell--ty-loan",
  },
};

const ITEM_STATUS_OPTIONS: { label: string; value: ReturnedItemStatus }[] = [
  { label: "Same as Issued", value: "same" },
  { label: "New Item", value: "new" },
];

@Component({
  selector: "app-obs-return-list",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DataGrid,
    ModalComponent,
    InputField,
    SelectInput,
    TextareaInput,
    ExportToolbar,
    ToolbarSearch,
    HelpGuidance,
    ButtonComponent,
  ],
  templateUrl: "./return-list.html",
  styleUrl: "./return-list.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnList implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);
  private readonly exportService = inject(ReportExportService);

  readonly helpHtml = HELP_HTML;
  readonly itemStatusOptions = ITEM_STATUS_OPTIONS;
  readonly categoryFilterOptions = CATEGORY_FILTER_OPTIONS;
  readonly issueTypeFilterOptions = ISSUE_TYPE_FILTER_OPTIONS;
  readonly entries = signal<IssueListEntry[]>([]);
  readonly returnedByUsers = signal<ObsUserOption[]>([]);
  /** `name | rank | personal no | role | unit name` per option — the picker has to identify a
   * person unambiguously across units, and a bare name does not (two people share one).
   *
   * Gated on `selectable` so the seeded accounts are never offered, but deliberately NOT on
   * `inScope`: a Ty Loan is handed back by somebody from another unit, and therefore from
   * outside the storekeeper's own department. */
  readonly returnedByOptions = computed<DropdownOptionDto[]>(() =>
    this.returnedByUsers()
      .filter((user) => user.selectable)
      .map((user) => ({ value: user.id, label: obsUserOptionLabel(user) })),
  );
  readonly activeEntry = signal<IssueListEntry | null>(null);
  readonly saving = signal(false);
  readonly exportBusy = signal<ExportKind | null>(null);
  readonly searchText = signal("");
  readonly criticalOnly = signal(false);
  readonly categoryFilters = signal<Record<SpareCategoryFilter, boolean>>({
    PERMANENT: true,
    RETURNABLE: true,
    CONSUMABLE: true,
  });
  readonly issueTypeFilters = signal<Record<IssueType, boolean>>({
    INTERNAL: true,
    TY_LOAN: true,
  });

  readonly columnDefs: ColDef[] = [
    {
      headerName: "Status",
      colId: "issueType",
      width: 150,
      minWidth: 150,
      pinned: "left",
      sortable: true,
      filter: false,
      valueGetter: (params) => this.flagFor(params.data).label,
      cellClass: (params: CellCallbackParams) => this.flagFor(params.data).cellClass,
      cellRenderer: StatusFlagRenderer,
      cellRendererParams: {
        flag: (row: RowData) => this.flagFor(row),
      },
    },
    { field: "patternNumber", headerName: "Pattern Number", flex: 1 },
    { field: "description", headerName: "Spare Description", flex: 1.4 },
    { field: "issueDate", headerName: "Issue Date", width: 130 },
    { field: "issuedQty", headerName: "Issued Qty", width: 110 },
    // What is still owed after any part-returns, beside what was originally issued. Both are
    // shown because a storekeeper reconciling a row needs the difference: return 2 of 5 and
    // this reads 3 while Issued Qty still reads 5.
    { field: "outstandingQty", headerName: "Pending Return", width: 140 },
    { field: "username", headerName: "Issued To", flex: 1 },
    // "NA" on an internal issue — see `adaptIssueToListEntry`. The column stays visible for
    // those rows rather than being hidden, so the two kinds of row line up column for column.
    { field: "unitName", headerName: "Unit Name", flex: 1 },
    { field: "authority", headerName: "Authority", width: 110 },
    { field: "reason", headerName: "Reason of Issue", flex: 1 },
    { field: "equipmentNomenclature", headerName: "Defect in Eqpt Nomenclature", flex: 1.2 },
    { field: "equipmentClass", headerName: "Equipment Class", flex: 1 },
    { field: "spareClass", headerName: "Spare Class", flex: 1 },
    {
      headerName: "Actions",
      // Pinned right, the mirror of the Status column pinned left: this grid is wider than the
      // viewport (eleven columns), so an unpinned action column sat off the right-hand edge and
      // the operator had to scroll sideways on every row to find the one control the screen
      // exists for. Pinned, it stays parked against the right edge while the data columns scroll
      // underneath it.
      pinned: "right",
      lockPinned: true,
      width: 140,
      minWidth: 140,
      maxWidth: 140,
      resizable: false,
      sortable: false,
      filter: false,
      cellRenderer: TextActionRenderer,
      cellRendererParams: {
        actions: (row: RowData) => {
          const entry = row as unknown as IssueListEntry;
          return [
            {
              label: "Return",
              color: "#1d96e9",
              variant: "button" as const,
              disabled: entry.isWedMo,
              title: entry.isWedMo
                ? "Pending MO/WED replenishment — cannot be returned yet."
                : "Return this spare",
              action: () => this.onRowClicked(row),
            },
          ];
        },
      },
    },
  ];

  // `issueType` is prepended by hand: the Status column is a renderer with no `field`, so the
  // generic mapping below cannot see it, and a printed Return list that doesn't say which rows
  // are Ty Loans loses the distinction the screen exists to make.
  readonly printColumns: PrintColumn[] = [
    { header: "Status", field: "issueType" },
    ...this.columnDefs
      .filter((c): c is ColDef & { field: string } => !!c.field)
      .map((c) => ({ header: String(c.headerName ?? c.field), field: c.field })),
  ];

  readonly filteredEntries = computed(() => {
    const critical = this.criticalOnly();
    const categories = this.categoryFilters();
    const issueTypes = this.issueTypeFilters();
    const query = this.searchText().trim().toLowerCase();
    return this.entries().filter((entry) => {
      if (critical && !entry.critical) return false;
      if (!issueTypes[entry.issueType]) return false;
      const categoryKey = entry.category?.toUpperCase() as SpareCategoryFilter | undefined;
      if (categoryKey && categoryKey in categories && !categories[categoryKey]) return false;
      if (
        query &&
        ![
          entry.patternNumber,
          entry.description,
          entry.username,
          entry.unitName,
          entry.authority,
          entry.equipmentClass,
          entry.spareClass,
        ].some((value) => (value ?? "").toLowerCase().includes(query))
      ) {
        return false;
      }
      return true;
    });
  });

  readonly form = this.fb.nonNullable.group({
    quantityReturned: [1, [Validators.required, Validators.min(1)]],
    returnedBy: ["", Validators.required],
    itemStatus: ["same" as ReturnedItemStatus, Validators.required],
    remarks: ["", Validators.required],
  });

  ngOnInit(): void {
    void this.load();
    void this.loadReturnedByOptions();
  }

  private async load(): Promise<void> {
    const entries = await firstValueFrom(this.api.getReturnList());
    this.entries.set(entries);
  }

  private async loadReturnedByOptions(): Promise<void> {
    const users = await firstValueFrom(this.api.getInventoryUsers());
    this.returnedByUsers.set(users);
  }

  toggleCategory(key: SpareCategoryFilter): void {
    this.categoryFilters.update((current) => ({ ...current, [key]: !current[key] }));
  }

  /** ag-grid calls the column's callbacks for rows that have no data yet (during a refresh, and
   * for its own loading/no-rows overlays), so this never indexes the flag table with an
   * undefined row — it falls back to the internal-issue flag, which is what an ordinary issue
   * is. */
  private flagFor(row: unknown): (typeof ISSUE_TYPE_FLAGS)[IssueType] {
    const entry = row as IssueListEntry | undefined;
    return ISSUE_TYPE_FLAGS[entry?.issueType ?? "INTERNAL"] ?? ISSUE_TYPE_FLAGS.INTERNAL;
  }

  toggleIssueType(key: IssueType): void {
    this.issueTypeFilters.update((current) => ({ ...current, [key]: !current[key] }));
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredEntries().map((entry) => ({
      ...entry,
      issueType: ISSUE_TYPE_FLAGS[entry.issueType].label,
    })) as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(this.printColumns, rows, "return-spares.csv");
      return;
    }
    this.exportService.printRows("Return Spares", this.printColumns, rows);
  }

  onRowClicked(row: RowData): void {
    const entry = row as unknown as IssueListEntry;
    if (entry.isWedMo) {
      this.notifications.info("This item is pending MO/WED replenishment and cannot be returned yet.");
      return;
    }
    this.activeEntry.set(entry);
    // Defaults to what is still OWED, not what was originally issued — on a part-returned row
    // those differ, and offering the issued figure invites returning stock twice. The max
    // mirrors the server's own rule (`ReturnSerializer.validate`) so the operator is told
    // before submitting rather than by a 400.
    this.form.controls.quantityReturned.setValidators([
      Validators.required,
      Validators.min(1),
      Validators.max(entry.outstandingQty),
    ]);
    this.form.controls.quantityReturned.updateValueAndValidity({ emitEvent: false });
    this.form.reset({
      quantityReturned: entry.outstandingQty,
      returnedBy: "",
      itemStatus: "same",
      remarks: "",
    });
  }

  closeModal(): void {
    this.activeEntry.set(null);
  }

  async submitReturn(): Promise<void> {
    const entry = this.activeEntry();
    if (!entry || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const quantity = Number(raw.quantityReturned);
      await firstValueFrom(
        this.api.returnSpare(entry.issuePk, { ...raw, quantityReturned: quantity }),
      );
      const remaining = entry.outstandingQty - quantity;
      this.notifications.success(
        remaining > 0
          ? `${quantity} of ${entry.patternNumber} taken back on charge as onboard Ship ` +
              `Inventory. ${remaining} still outstanding.`
          : `${quantity} of ${entry.patternNumber} taken back on charge as onboard Ship Inventory.`,
      );
      this.closeModal();
      // Re-fetch rather than dropping the row: a part-returned row is still outstanding and
      // has to come back with its reduced balance. Only a row settled in full disappears, and
      // the server is what decides that — it deletes the pending-return entry.
      await this.load();
    } catch (error) {
      this.notifications.error(getErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
