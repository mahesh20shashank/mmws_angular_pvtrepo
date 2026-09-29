import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { ColDef, RowData } from "ag-grid-community";
import { DataGrid } from "../../../../../shared/components/data-grid/data-grid";
import { ActionRendererComponent } from "../../../../../shared/components/data-grid/grid-action-icons";
import { ModalComponent } from "../../../../../shared/components/modal/modal.component";
import { SelectInput } from "../../../../../shared/components/select-input/select-input";
import { ExportKind, ExportToolbar } from "../../../../../shared/components/export-toolbar/export-toolbar";
import { ToolbarSearch } from "../../../../../shared/components/toolbar-search/toolbar-search";
import { HelpGuidance } from "../../../../../shared/components/help-guidance/help-guidance";
import { PrintColumn, ReportExportService } from "../../../../../Core/services/export/generic-export.service";
import { ObsApiService } from "../../services/obs-api.service";
import { NotificationService } from "../../../../../Core/services/notification/notification.service";
import { getErrorMessage } from "../../../../../Core/http/services/http-feedback";
import { ActivatedRoute, Router } from "@angular/router";
import { DartSeedStore } from "../../../../operational-maintenance/action-forms/dart-seed-store";
import { ParentInventory } from "../../models/requisition.model";
import {
  buildDartSeedSpares,
  DART_FORM_ROUTE,
  DemandEntry,
  EVERY_ROW_HAS_DART_MESSAGE,
  NOTHING_SELECTED_MESSAGE,
  SAME_EQUIPMENT_CLASS_MESSAGE,
  SOME_ROWS_HAVE_DART_MESSAGE,
} from "../../models/transaction.model";

/** where a seeded DART form returns the operator to - this screen. */
const DEMAND_QUEUE_ROUTE = "/afterAuth/inventory/ship-inventory-obs/transactions/demand";

const PARENT_INVENTORY_OPTIONS: { label: string; value: ParentInventory }[] = [
  { label: "ILMS (MO)", value: "ILMS" },
  { label: "WLMS (WED)", value: "WLMS" },
];

type SpareCategoryFilter = "PERMANENT" | "RETURNABLE" | "CONSUMABLE";
const CATEGORY_FILTER_OPTIONS: { key: SpareCategoryFilter; label: string }[] = [
  { key: "PERMANENT", label: "Permanent" },
  { key: "RETURNABLE", label: "Returnable" },
  { key: "CONSUMABLE", label: "Consumable" },
];

const HELP_HTML = `
  <h6 class="fw-bold mb-1">What this page is for</h6>
  <p class="mb-2">Only <strong>Consumable (C)</strong> items that you have issued are listed here —
     temporarily — as a reminder that they need to be demanded at harbour through ILMS / WLMS. To do
     that, move them to the Demand cart in the MO Inventory / WED Inventory module first, which then
     sends the information to ILMS/WLMS over the API.</p>
  <h6 class="fw-bold mb-1">Permanent & Returnable items do not appear here</h6>
  <p class="mb-2">P/R items never enter this internal cart. After their survey number is received back
     from ILMS/WLMS (as per the type of spare), they show up in the Demand cart inside the MO Inventory
     / WED Inventory module instead.</p>
  <h6 class="fw-bold mb-1">Before you can forward an item</h6>
  <p class="mb-2">Every item needs a <strong>DART number</strong> — no DART, it cannot move. Tick the
     rows and use <strong>Raise DART – Multiple</strong> to raise DARTs for the selected items.</p>
  <h6 class="fw-bold mb-1">Sending to MO / WED</h6>
  <p class="mb-2">Tick the rows and use <strong>Send to Cart (MO/WED) – Multiple</strong>. In the pop-up
     pick the Parent Inventory — ILMS (MO) or WLMS (WED). The item then moves to that module's Demand
     cart, and the demand is raised over the API.</p>
  <h6 class="fw-bold mb-1">What the columns mean</h6>
  <ul class="mb-0">
    <li><strong>Parent Inventory</strong> — which MO/WED system the item is routed to.</li>
    <li><strong>INcatting status</strong> — whether the item is catalogued.</li>
    <!-- the IIF gate, stated on the screen in the operator's own words,
         so the reason a row cannot be actioned is readable before the click rather than only
         in a refusal after it. -->
    <li><strong>Not INcatted</strong> — the item is still awaiting INcatting, so it cannot be
        ticked, cannot have a DART raised against it and cannot be sent to the MO / WED cart.
        Correct its pattern number in <strong>Due for IIF - Not INcatted Items</strong> and the
        row is released here straight away, with no further step.</li>
    <li><strong>DART No</strong> — the item's DART; must be present to move on.</li>
    <li><strong>Authority</strong> — the scale the item is held on (e.g. D787J).</li>
  </ul>
`;

@Component({
  selector: "app-obs-demand-list",
  standalone: true,
  imports: [ReactiveFormsModule, DataGrid, ModalComponent, SelectInput, ExportToolbar, ToolbarSearch, HelpGuidance, ButtonComponent],
  templateUrl: "./demand-list.html",
  styleUrl: "./demand-list.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemandList implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);
  private readonly exportService = inject(ReportExportService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly seedStore = inject(DartSeedStore);

  readonly helpHtml = HELP_HTML;
  readonly parentInventoryOptions = PARENT_INVENTORY_OPTIONS;
  readonly categoryFilterOptions = CATEGORY_FILTER_OPTIONS;
  readonly entries = signal<DemandEntry[]>([]);
  readonly selectedRows = signal<DemandEntry[]>([]);
  /** set only when the cart modal was opened from a single row's
   * Actions-column "Send to Cart" button — takes precedence over `selectedRows()` for what
   * actually gets sent (see `cartRows()`), so a single-row send is not affected by an unrelated
   * multi-select. The same signal, for the same reason, as Due for Survey's. */
  readonly singleCartTarget = signal<DemandEntry | null>(null);
  readonly cartModalOpen = signal(false);
  readonly saving = signal(false);
  readonly exportBusy = signal<ExportKind | null>(null);
  readonly searchText = signal("");
  readonly criticalOnly = signal(false);
  readonly notIncattedOnly = signal(false);
  readonly categoryFilters = signal<Record<SpareCategoryFilter, boolean>>({
    PERMANENT: true,
    RETURNABLE: true,
    CONSUMABLE: true,
  });

  readonly columnDefs: ColDef[] = [
    { field: "parentInventory", headerName: "Parent Inventory", width: 140 },
    { field: "incattingStatus", headerName: "INcatting Status", width: 140 },
    { field: "patternNumber", headerName: "Pattern Number", flex: 1 },
    { field: "dartNumber", headerName: "DART No", width: 130 },
    { field: "description", headerName: "Spare Description", flex: 1.2 },
    { field: "quantity", headerName: "Qty", width: 90 },
    { field: "category", headerName: "Category", width: 100 },
    { field: "equipmentClass", headerName: "Equipment Class", flex: 1 },
    {
      field: "critical",
      headerName: "Critical",
      width: 100,
      valueGetter: (p) => ((p.data as DemandEntry).critical ? "YES" : "NO"),
    },
    { field: "authority", headerName: "Authority", width: 110 },
    // this column used to be the static text "Click row for details". That
    // sentence stopped being true the moment the row-detail route was removed, so it could not
    // stay. It carries the same per-row action Due for Survey carries, through the same
    // `ActionRendererComponent`, in the same column at the same width — one action per row,
    // chosen by the row's DART state, per the reference's rule (R7 Section 6.1).
    //
    // The "Send to Cart" half is a consequence of that rule rather than an added feature: the
    // rule is an if/else, so a screen that offers "Raise DART" on a pending row must offer
    // something on a row that already has one, and the reference offers exactly this.
    //
    // The IIF gate is the only reason either button is disabled. Its reason is on the row in
    // words, in the INcatting Status cell, and again in the help panel.
    {
      headerName: "Actions",
      width: 150,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: RowData) => {
          const entry = row as unknown as DemandEntry;
          return entry.hasDart
            ? [
              {
                icon: "share",
                label: "Send to Cart",
                color: "#1d96e9",
                showLabel: true,
                disabled: entry.awaitingIncatting,
                action: () => this.sendRowToCart(entry),
              },
            ]
            : [
              {
                icon: "add",
                label: "Raise DART",
                color: "#1d96e9",
                showLabel: true,
                disabled: entry.awaitingIncatting,
                action: () => this.raiseDartForRow(entry),
              },
            ];
        },
      },
    },
  ];

  readonly printColumns: PrintColumn[] = this.columnDefs
    .filter((c): c is ColDef & { field: string } => !!c.field)
    .map((c) => ({
      header: String(c.headerName ?? c.field),
      field: c.field,
      format: c.field === "critical" ? (v: unknown) => (v ? "YES" : "NO") : undefined,
    }));

  readonly filteredEntries = computed(() => {
    const critical = this.criticalOnly();
    const notIncatted = this.notIncattedOnly();
    const categories = this.categoryFilters();
    const query = this.searchText().trim().toLowerCase();
    return this.entries().filter((entry) => {
      if (critical && !entry.critical) return false;
      // a row awaiting INcatting now satisfies this filter too. Without
      // it the screen would contradict itself — the INcatting Status cell would read
      // "Not INcatted" on a row that a filter labelled "INcatting Status (No)" had just hidden.
      if (notIncatted && entry.incattingStatus !== "IIF" && !entry.awaitingIncatting) return false;
      const categoryKey = entry.category?.toUpperCase() as SpareCategoryFilter | undefined;
      if (categoryKey && categoryKey in categories && !categories[categoryKey]) return false;
      if (
        query &&
        ![entry.patternNumber, entry.description, entry.dartNumber, entry.authority, entry.equipmentClass].some((value) =>
          (value ?? "").toLowerCase().includes(query),
        )
      ) {
        return false;
      }
      return true;
    });
  });

  readonly cartForm = this.fb.nonNullable.group({
    parentInventory: ["ILMS" as ParentInventory, Validators.required],
  });

  /** the row half of the IIF gate, identical to Due for Survey's. Passed
   * to the shared grid's existing `isRowSelectable` input, which ag-grid uses to disable the
   * row's own checkbox AND to keep select-all and click-to-select in step with it — so a gated
   * row can never enter a bulk selection, and neither bulk button needs a gate of its own.
   * This screen has no per-row action to disable, so this is the whole of its row gate.
   *
   * Declared as an arrow property, not a method, because the grid stores the reference and
   * calls it outside this component's `this`.
   *
   * A convenience, not the enforcement — the server refuses the DART and the cart send on its
   * own reading of the open IIF record. */
  readonly isRowSelectable = (row: RowData): boolean => !(row as unknown as DemandEntry).awaitingIncatting;

  ngOnInit(): void {
    // the return leg of the DART hand-off, identical to Due for Survey's
    // — the confirmed DART number the seeded form raised arrives as `?dart=` and goes into this
    // screen's own existing search box, so the rows just covered are the rows on screen. Absent
    // on every ordinary visit, in which case nothing here runs.
    const raisedDartNumber = this.route.snapshot.queryParamMap.get("dart");
    if (raisedDartNumber) {
      this.searchText.set(raisedDartNumber);
    }
    void this.load();
  }

  private async load(): Promise<void> {
    this.entries.set(await firstValueFrom(this.api.getDemandList()));
  }

  toggleCategory(key: SpareCategoryFilter): void {
    this.categoryFilters.update((current) => ({ ...current, [key]: !current[key] }));
  }

  /** Clear, identical to Due for Survey's — the free-text box empty, both
   * checkboxes unticked, all three category toggles on. Built and labelled the same way as the
   * Item Search and History screens' existing Clear controls. */
  clearFilters(): void {
    this.searchText.set("");
    this.criticalOnly.set(false);
    this.notIncattedOnly.set(false);
    this.categoryFilters.set({ PERMANENT: true, RETURNABLE: true, CONSUMABLE: true });
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredEntries() as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(this.printColumns, rows, "demand-list.csv");
      return;
    }
    this.exportService.printRows("Results - To Be Demanded", this.printColumns, rows);
  }

  onSelectionChanged(rows: RowData[]): void {
    this.selectedRows.set(rows as unknown as DemandEntry[]);
  }

  /** enabled as soon as anything is ticked, identical to Due for Survey's
   * — the DART-state rule has moved out of the disabled state and into `raiseDart()` as a
   * spoken refusal, so a greyed button with no text against it is never the whole answer. The
   * rule itself (R7 Section 6.3) is unchanged, and the reference's `!hasIifBlock` term is still
   * not restated because a row awaiting INcatting cannot be ticked on this screen at all. */
  get canRaiseDart(): boolean {
    return this.selectedRows().length > 0;
  }

  /** the bulk Raise DART, identical to Due for Survey's. It no longer
   * calls `demand_list/raise-dart/` - that action is retired, because it grouped a selection by
   * originating issue and could mint several DART numbers for one selection. Spares selected
   * together were consumed on one defect, so they get ONE DART, raised by the DART form. */
  raiseDart(): void {
    const rows = this.selectedRows();
    if (rows.length === 0) {
      this.notifications.error(NOTHING_SELECTED_MESSAGE);
      return;
    }
    const rowsWithDart = rows.filter((r) => r.hasDart);
    if (rowsWithDart.length === rows.length) {
      this.notifications.error(EVERY_ROW_HAS_DART_MESSAGE);
      return;
    }
    if (rowsWithDart.length > 0) {
      this.notifications.error(SOME_ROWS_HAVE_DART_MESSAGE);
      return;
    }
    // the reference's one hard bulk constraint, adopted, in the one wording
    // both queue screens use (R7 Section 6.4). Checked before the hand-off, so the operator is
    // never taken to a form they would have to abandon. A selection spanning several original
    // issues is deliberately NOT refused - it is still one DART.
    if (new Set(rows.map((r) => r.equipmentClass)).size > 1) {
      this.notifications.error(SAME_EQUIPMENT_CLASS_MESSAGE);
      return;
    }
    this.handOffToDartForm(rows);
  }

  /** the Actions-column "Raise DART" — one row, therefore one Equipment
   * Class by definition, so the bulk rule above cannot apply to it. It opens the same form,
   * pre-loaded, that three rows do. The IIF re-check is the same second line of defence
   * `sendRowToCart` carries. */
  raiseDartForRow(entry: DemandEntry): void {
    if (entry.awaitingIncatting) {
      this.notifications.error(
        "Not INcatted - resolve this spare's pattern number in Due for IIF - Not INcatted Items before raising a DART for it.",
      );
      return;
    }
    this.handOffToDartForm([entry]);
  }

  /** the one hand-off both Raise DART controls make, identical to Due for
   * Survey's but returning to this queue. The seed and the origin travel together in the store,
   * which `ActionForms` reads and clears in one call, so there is nothing to clean up here on
   * any exit path. */
  private handOffToDartForm(rows: readonly DemandEntry[]): void {
    this.seedStore.set({
      spares: buildDartSeedSpares(rows),
      originRoute: DEMAND_QUEUE_ROUTE,
    });
    void this.router.navigateByUrl(DART_FORM_ROUTE);
  }

  get canSendToCart(): boolean {
    const rows = this.selectedRows();
    return rows.length > 0 && rows.every((r) => r.hasDart);
  }

  /** what a confirmed send actually sends — the single row the Actions
   * button targeted when there is one, otherwise the ticked selection. The same rule, for the
   * same reason, as Due for Survey's. */
  private cartRows(): DemandEntry[] {
    const single = this.singleCartTarget();
    return single ? [single] : this.selectedRows();
  }

  openCartModal(): void {
    if (!this.canSendToCart) return;
    // cleared, so a bulk send after a single-row send cannot inherit the
    // earlier row as its target.
    this.singleCartTarget.set(null);
    this.cartModalOpen.set(true);
  }

  /** the Actions-column "Send to Cart" — sends just this one row,
   * independent of any multi-select. Both guards are a second line of defence behind the
   * disabled button and the server's own refusal. */
  sendRowToCart(entry: DemandEntry): void {
    if (entry.awaitingIncatting) {
      this.notifications.error(
        "Not INcatted - resolve this spare's pattern number in Due for IIF - Not INcatted Items before sending it to the MO/WED cart.",
      );
      return;
    }
    if (!entry.hasDart) {
      this.notifications.error("Raise a DART for this item before sending it to the MO/WED cart.");
      return;
    }
    this.singleCartTarget.set(entry);
    this.cartModalOpen.set(true);
  }

  closeCartModal(): void {
    this.cartModalOpen.set(false);
    this.singleCartTarget.set(null);
  }

  async confirmSendToCart(): Promise<void> {
    const rows = this.cartRows();
    if (!rows.length) return;
    this.saving.set(true);
    try {
      const raw = this.cartForm.getRawValue();
      const { totalCount, unmatchedCount } = await firstValueFrom(
        this.api.sendDemandToCart({
          ids: rows.map((r) => r.id),
          cartType: "Survey",
          entries: rows.map((r) => ({
            id: r.id,
            patternNumber: r.patternNumber,
            description: r.description,
            quantity: r.quantity,
          })),
          ...raw,
        }),
      );
      if (unmatchedCount > 0) {
        this.notifications.warning(
          `${unmatchedCount} of ${totalCount} row(s) sent without a catalog match — MO/WED staff will need to link ${unmatchedCount === 1 ? "it" : "them"} manually.`,
        );
      } else {
        this.notifications.success(`${totalCount} row(s) sent to the MO/WED cart.`);
      }
      this.closeCartModal();
      void this.load();
    } catch (error) {
      this.notifications.error(getErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
