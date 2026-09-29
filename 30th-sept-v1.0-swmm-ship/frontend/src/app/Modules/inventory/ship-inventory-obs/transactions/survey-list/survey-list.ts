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
import { ParentInventory, RequisitionCartType } from "../../models/requisition.model";
import {
  buildDartSeedSpares,
  DART_FORM_ROUTE,
  EVERY_ROW_HAS_DART_MESSAGE,
  NOTHING_SELECTED_MESSAGE,
  SAME_EQUIPMENT_CLASS_MESSAGE,
  SOME_ROWS_HAVE_DART_MESSAGE,
  SurveyEntry,
} from "../../models/transaction.model";

/** where a seeded DART form returns the operator to - this screen. */
const SURVEY_QUEUE_ROUTE = "/afterAuth/inventory/ship-inventory-obs/transactions/survey";

const PARENT_INVENTORY_OPTIONS: { label: string; value: ParentInventory }[] = [
  { label: "ILMS (MO)", value: "ILMS" },
  { label: "WLMS (WED)", value: "WLMS" },
];

const CART_TYPE_OPTIONS: { label: string; value: RequisitionCartType }[] = [
  { label: "Survey Cart", value: "Survey" },
  { label: "PTS Cart", value: "PTS" },
];

type SpareCategoryFilter = "PERMANENT" | "RETURNABLE" | "CONSUMABLE";
const CATEGORY_FILTER_OPTIONS: { key: SpareCategoryFilter; label: string }[] = [
  { key: "PERMANENT", label: "Permanent" },
  { key: "RETURNABLE", label: "Returnable" },
  { key: "CONSUMABLE", label: "Consumable" },
];

const HELP_HTML = `
  <h6 class="fw-bold mb-1">What this page is for</h6>
  <p class="mb-2">All <strong>Permanent (P)</strong> and <strong>Returnable (R)</strong> items — as
     categorised by the Materiel Organisations (MOs) / WEDs — that you have issued appear here. This
     reminds you to replenish them after the mandated survey carried out by the storekeeper at the
     Survey Yard in a Naval Dockyard. (Consumable items skip survey and go straight to demand.)</p>
  <h6 class="fw-bold mb-1">DART is needed before an item can move</h6>
  <ul class="mb-2">
    <li>A spare used for a routine arrives here already carrying its DART No.</li>
    <li>A spare used for a defect arrives with no DART No — you must raise the DART first using the button on that row.</li>
    <li>Only once the DART No is present can the row be shifted to the MO / WED Inventory cart, which starts the survey action over the API with ILMS or WLMS (depending on the type of spare issued).</li>
    <li>With SWMM, only DART-validated demands can be registered in ILMS or WLMS.</li>
  </ul>
  <h6 class="fw-bold mb-1">Raising DART / sending to MO / WED</h6>
  <ul class="mb-2">
    <li>Tick the rows and use <strong>Raise DART – Multiple</strong> to raise DARTs for the selected items.</li>
    <li>Then tick the rows and use <strong>Send to Cart (MO/WED) – Multiple</strong>. In the pop-up choose Parent Inventory (ILMS (MO) or WLMS (WED)) and Cart Type (Survey Cart or PTS Cart).</li>
  </ul>
  <h6 class="fw-bold mb-1">Survey Cart vs PTS Cart — which to choose</h6>
  <p class="mb-2">When you send an item for replenishment you first pick the Parent Inventory — MO (ILMS)
     or WED (WLMS) — then choose the cart type, based on the criticality of the spare:</p>
  <ul class="mb-2">
    <li><strong>Survey Cart</strong> — the old item is returned and surveyed first, and only then is the replacement supplied onboard.</li>
    <li><strong>PTS Cart (Prior To Survey)</strong> — the replacement comes onboard first, and the old item is surveyed afterwards. Use this for critical items the ship cannot be without.</li>
  </ul>
  <h6 class="fw-bold mb-1">What the columns mean</h6>
  <ul class="mb-0">
    <li><strong>Parent Inventory</strong> — which MO/WED system the item is routed to.</li>
    <li><strong>INcatting Status</strong> — whether the item is catalogued.</li>
    <!-- the IIF gate, stated on the screen in the operator's own words,
         so the reason a row cannot be actioned is readable before the click rather than only
         in a refusal after it. -->
    <li><strong>Not INcatted</strong> — the item is still awaiting INcatting, so it cannot be
        ticked, cannot have a DART raised against it and cannot be sent to the MO / WED cart.
        Correct its pattern number in <strong>Due for IIF - Not INcatted Items</strong> and the
        row is released here straight away, with no further step.</li>
    <li><strong>DART No</strong> — the item's DART; must be present to move on.</li>
    <li><strong>Category</strong> — P = Permanent, R = Returnable, C = Consumable.</li>
    <li><strong>Authority</strong> — the scale the item is held on (e.g. D787J).</li>
  </ul>
`;

@Component({
  selector: "app-obs-survey-list",
  standalone: true,
  imports: [ReactiveFormsModule, DataGrid, ModalComponent, SelectInput, ExportToolbar, ToolbarSearch, HelpGuidance, ButtonComponent],
  templateUrl: "./survey-list.html",
  styleUrl: "./survey-list.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyList implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);
  private readonly exportService = inject(ReportExportService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly seedStore = inject(DartSeedStore);

  readonly helpHtml = HELP_HTML;
  readonly parentInventoryOptions = PARENT_INVENTORY_OPTIONS;
  readonly cartTypeOptions = CART_TYPE_OPTIONS;
  readonly categoryFilterOptions = CATEGORY_FILTER_OPTIONS;
  readonly entries = signal<SurveyEntry[]>([]);
  readonly selectedRows = signal<SurveyEntry[]>([]);
  /** Set only when the cart modal was opened from a single row's Action-column "Send to Cart"
   * button — takes precedence over `selectedRows()` for what actually gets sent (see
   * `cartRows()`), so a single-row send isn't affected by an unrelated multi-select. */
  readonly singleCartTarget = signal<SurveyEntry | null>(null);
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
      valueGetter: (p) => ((p.data as SurveyEntry).critical ? "YES" : "NO"),
    },
    { field: "authority", headerName: "Authority", width: 110 },
    {
      headerName: "Actions",
      width: 170,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        // ONE action per row, chosen by the row's DART state, which is the
        // reference's own rule (R7 Section 6.1 — a single if/else on the DART number decides
        // which of the two buttons is emitted, and only ever one is present). A row with no DART
        // cannot be sent to a cart, and a row that already has one has nothing left to raise, so
        // showing both at once would offer the operator an action that can only be refused.
        //
        // The DART-number condition that used to disable "Send to Cart" is gone because it can
        // no longer arise: this branch only reaches "Send to Cart" when `hasDart` is true. The
        // IIF gate stays and is now the only reason either button is disabled, so the reason is
        // always the same one, and it is stated in words on the same row in the INcatting Status
        // cell and again in the help panel — not only in a toast after the click.
        actions: (row: RowData) => {
          const entry = row as unknown as SurveyEntry;
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
    cartType: ["Survey" as RequisitionCartType, Validators.required],
  });

  /** the row half of the IIF gate. Passed to the shared grid's existing
   * `isRowSelectable` input, which ag-grid uses to disable the row's own checkbox AND to keep
   * select-all and click-to-select in step with it — so a gated row can never enter a bulk
   * selection, and the two bulk buttons need no gate of their own.
   *
   * Declared as an arrow property, not a method, because the grid stores the reference and
   * calls it outside this component's `this`.
   *
   * This is a convenience, not the enforcement. The server refuses the DART and the cart send
   * on its own reading of the open IIF record, so a stale tab or a bypassed front end is
   * refused exactly as this screen is. */
  readonly isRowSelectable = (row: RowData): boolean => !(row as unknown as SurveyEntry).awaitingIncatting;

  ngOnInit(): void {
    // the return leg of the DART hand-off. A seeded DART form comes back
    // here carrying the CONFIRMED DART number it raised, and that number goes into this
    // screen's own existing search box, so the rows just covered are the rows on screen and the
    // operator can read the new DART No against each of them without hunting.
    //
    // It uses a control that is already there, and it is visible rather than hidden state - the
    // number is in the search box for the operator to see, and Clear puts the whole queue back.
    // Absent, which is every ordinary visit, nothing here runs at all.
    const raisedDartNumber = this.route.snapshot.queryParamMap.get("dart");
    if (raisedDartNumber) {
      this.searchText.set(raisedDartNumber);
    }
    void this.load();
  }

  private async load(): Promise<void> {
    this.entries.set(await firstValueFrom(this.api.getSurveyList()));
  }

  toggleCategory(key: SpareCategoryFilter): void {
    this.categoryFilters.update((current) => ({ ...current, [key]: !current[key] }));
  }

  /** put every filter on this screen back to the state it loads in - the
   * free-text box empty, Critical and INcatting Status (No) unticked, and all three category
   * toggles on. Built the same way, named the same way and placed the same way as the Clear
   * control the Item Search and History screens already carry, so an operator meets one control
   * rather than three variants of one.
   *
   * The declared defaults are restated as literals rather than read from a shared constant
   * because the three signals declare them as literals too - a second source for the same three
   * values is how a Clear that quietly stops clearing gets written. */
  clearFilters(): void {
    this.searchText.set("");
    this.criticalOnly.set(false);
    this.notIncattedOnly.set(false);
    this.categoryFilters.set({ PERMANENT: true, RETURNABLE: true, CONSUMABLE: true });
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredEntries() as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(this.printColumns, rows, "survey-list.csv");
      return;
    }
    this.exportService.printRows("Results - To Be Surveyed", this.printColumns, rows);
  }

  onSelectionChanged(rows: RowData[]): void {
    this.selectedRows.set(rows as unknown as SurveyEntry[]);
  }

  /** the bulk Raise DART is enabled as soon as anything is ticked, and
   * the DART-state rule that used to sit here has moved into `raiseDart()` as a spoken refusal.
   *
   * The rule itself is unchanged - every selected row must still be pending a DART, which is
   * the reference's own bulk rule (R7 Section 6.3, `hasPending && !hasWithDart`). What changed
   * is where it is enforced, and why. As a disabled state it produced a greyed button with no
   * text against it: an operator who had ticked one row that already carried a DART could not
   * tell whether the button was disabled for that reason, for an IIF reason, or at all. Pressed
   * now, it either hands off or says in one sentence which rule bit and what to do instead.
   *
   * The reference's third term, `!hasIifBlock`, is still not restated: a row awaiting INcatting
   * cannot be ticked at all on this screen (`isRowSelectable` below), so it can never reach a
   * selection. Writing the term would be a condition that can never be false. */
  get canRaiseDart(): boolean {
    return this.selectedRows().length > 0;
  }

  /** the bulk Raise DART. It no longer calls `survey_list/raise-dart/` -
   * that action grouped a selection by originating issue, so one click could mint SEVERAL DART
   * numbers for one selection, and it is retired. Spares selected together were consumed on one
   * defect, so they get ONE DART, and one DART is raised by the DART form.
   *
   * Every way this can be refused is now spoken rather than silent. The old `if
   * (!this.canRaiseDart) return;` was a button that did nothing when pressed, which is the one
   * outcome an operator cannot diagnose - three distinct refusals replace it, each naming the
   * state and what to do instead. Nothing is written by any of them, and nothing is written by
   * the hand-off either: the DART is raised only when the operator saves the form. */
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
    // the reference's one hard bulk constraint, adopted (R7 Section 6.4).
    // A DART is raised against ONE equipment, so a selection spanning more than one Equipment
    // Class cannot become one coherent DART. Checked before the hand-off, so the operator is
    // never taken to a form they would have to abandon.
    //
    // A selection spanning several ORIGINAL ISSUES is not refused and is not split - that is
    // the point of the change. Those spares were consumed on one defect and they get one DART.
    if (new Set(rows.map((r) => r.equipmentClass)).size > 1) {
      this.notifications.error(SAME_EQUIPMENT_CLASS_MESSAGE);
      return;
    }
    this.handOffToDartForm(rows);
  }

  /** the Actions-column "Raise DART" — hands off this one row, so the
   * Equipment Class rule above cannot apply to it. One row is one class by definition, and one
   * row selected opens the same form, pre-loaded, as three do.
   *
   * The IIF re-check is the same second line of defence `sendRowToCart` already carries: the
   * button is disabled, so this is unreachable in normal use, and the server refuses the save
   * on its own reading in any case. It exists so a stale grid cannot turn a disabled control
   * into a hand-off. */
  raiseDartForRow(entry: SurveyEntry): void {
    if (entry.awaitingIncatting) {
      this.notifications.error(
        "Not INcatted - resolve this spare's pattern number in Due for IIF - Not INcatted Items before raising a DART for it.",
      );
      return;
    }
    this.handOffToDartForm([entry]);
  }

  /** the one hand-off both Raise DART controls make, so the row action and
   * the bulk action cannot drift apart in what they seed or where they return to.
   *
   * The seed and the origin travel together in the store, which `ActionForms` reads and clears
   * in one call - so nothing has to be cleaned up here, on any exit path. */
  private handOffToDartForm(rows: readonly SurveyEntry[]): void {
    this.seedStore.set({
      spares: buildDartSeedSpares(rows),
      originRoute: SURVEY_QUEUE_ROUTE,
    });
    void this.router.navigateByUrl(DART_FORM_ROUTE);
  }

  get canSendToCart(): boolean {
    const rows = this.selectedRows();
    return rows.length > 0 && rows.every((r) => r.hasDart);
  }

  private cartRows(): SurveyEntry[] {
    const single = this.singleCartTarget();
    return single ? [single] : this.selectedRows();
  }

  openCartModal(): void {
    if (!this.canSendToCart) return;
    this.singleCartTarget.set(null);
    this.cartModalOpen.set(true);
  }

  /** Action-column "Send to Cart" — sends just this one row, independent of any multi-select. */
  sendRowToCart(entry: SurveyEntry): void {
    // the same second line of defence the DART-number check below already
    // provides, for the IIF gate. The button is disabled, so this is unreachable in normal use
    // — it exists for the same reason the line below it does.
    if (entry.awaitingIncatting) {
      this.notifications.error(
        "Not INcatted - resolve this spare's pattern number in Due for IIF - Not INcatted Items before sending it to the MO/WED cart.",
      );
      return;
    }
    // `hasDart`, not `dartNumber` — the resolved DART No can be the
    // sentinel "pending", which is a non-empty string and would otherwise pass this guard.
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
        this.api.sendSurveyToCart({
          ids: rows.map((r) => r.id),
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
