import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { CellCallbackParams, ColDef, RowData, ValueFormatterParams } from "ag-grid-community";
import { DataGrid } from "../../../../../shared/components/data-grid/data-grid";
import { TextActionRenderer } from "../../../../../shared/components/data-grid/grid-text-action-renderer";
import { DetailDrawer } from "../../../../../shared/components/detail-drawer/detail-drawer";
import { IconComponent } from "../../../../../shared/components/icon/icon.component";
import { ModalComponent } from "../../../../../shared/components/modal/modal.component";
import { RadioInput } from "../../../../../shared/components/radio-input/radio-input";
import { SelectInput } from "../../../../../shared/components/select-input/select-input";
import { ToolbarSearch } from "../../../../../shared/components/toolbar-search/toolbar-search";
import { HelpGuidance } from "../../../../../shared/components/help-guidance/help-guidance";
import {
  PrintColumn,
  ReportExportService,
} from "../../../../../Core/services/export/generic-export.service";
import { NotificationService } from "../../../../../Core/services/notification/notification.service";
import { ObsApiService, SUB_DEPARTMENT_UNASSIGNED } from "../../services/obs-api.service";
import { ObsResultListStore } from "../../services/obs-result-list-store";
import { ObsSelectionStore } from "../../services/obs-selection-store";
import {
  ABSENT_VALUE_LABEL,
  CRITICALITY_STRENGTH_LABEL,
  DropdownOptionDto,
  SPARE_CATEGORY_LABEL,
  Spare,
  SpareCategory,
} from "../../models/spare.model";

/** Colour for the Spare Detail drawer's category pill — mirrors the legacy sidebar's coloured
 * "PERMANENT"/"RETURNABLE"/etc. badge. */
// `Record<SpareCategory, ...>` requires an entry for every category, so
// the new QUASI_PERMANENT value has to be named here. It reuses the PERMANENT colour rather
// than introducing a fifth one, because quasi-permanent IS permanent for every purpose this
// application has — the pill's own text already says QP, so nothing is conveyed by colour
// alone and no new colour value enters the codebase.
const PERMANENT_BADGE_COLOR = "#28a745";

const CATEGORY_BADGE_COLOR: Record<SpareCategory, string> = {
  PERMANENT: PERMANENT_BADGE_COLOR,
  QUASI_PERMANENT: PERMANENT_BADGE_COLOR,
  RETURNABLE: "#1d96e9",
  CONSUMABLE: "#d97706",
  IM: "#6f42c1",
};

/** The tail of the placeholder photograph's URL.
 *
 * `obs_spares.image` defaults to the literal `"obs/default.png"` and is also nullable and
 * blankable, so three stored states mean "no photograph was ever uploaded" — the literal default,
 * NULL, and the empty string. DRF's ImageField turns NULL and "" alike into a JSON `null`, but it
 * turns the default into a REAL ABSOLUTE URL, which is truthy. So truthiness alone cannot tell a
 * photographed spare from an un-photographed one, and a filter that tested it would silently
 * under-report and leave the operator's list short.
 *
 * The `obs/` prefix is part of the test on purpose: a second, unrelated placeholder exists
 * elsewhere in the application under a different folder, and a bare `default.png` test would match
 * it too. */
const DEFAULT_SPARE_IMAGE_PATH = "obs/default.png";

/** True when this spare still needs photographing — the predicate behind the
 * "Photograph not uploaded" checkbox above the grid. Matches ALL THREE absent states above.
 *
 * Note which of two disagreeing back-end behaviours this follows. The list endpoint sends the
 * placeholder as a real URL; the spare-detail endpoint nulls it and captions it "No photograph on
 * record". This follows the detail endpoint, because that is what the operator means by the
 * question and what this application's own detail screen already tells them. The two endpoints
 * disagreeing is a defect this change reports and does not fix. */
const spareHasNoPhotograph = (spare: Spare): boolean =>
  !spare.imageUrl || spare.imageUrl.endsWith(DEFAULT_SPARE_IMAGE_PATH);

/** An unresolved master id — a value that is nothing but digits.
 *
 * `adaptSpare` resolves Equipment Class and Authority against a master cache and, on a miss, falls
 * back to `String(row.equipment_class)` / `String(row.authority)` — the raw integer foreign key.
 * The cell then shows a number that means nothing to the operator and looks like data. The grid
 * cannot see the cache, so a digits-only value is the only signal available to it here. The
 * sounder fix is one shared fallback inside `adaptSpare`, which would correct every OBS screen at
 * once — that is recorded as an observation and is outside this change. */
const UNRESOLVED_MASTER_ID = /^\d+$/;

/** The display formatter for a column that can arrive empty.
 *
 * A `valueFormatter`, not a `valueGetter`, and the distinction matters: the marker is presentation
 * only, so sorting and the new per-column filters keep working on the real underlying value rather
 * than on a dash. */
const absentIfBlank = (params: ValueFormatterParams): string => {
  const text = (params["value"] ?? "") as string;
  return text === "" ? ABSENT_VALUE_LABEL : text;
};

/** The same, for the two columns whose master lookup can miss. Blank AND raw
 * id both become the marker, because a raw id in a cell is worse than a blank — both are wrong,
 * but only one of them looks like a real value. */
const absentIfUnresolved = (params: ValueFormatterParams): string => {
  const text = (params["value"] ?? "") as string;
  return text === "" || UNRESOLVED_MASTER_ID.test(text) ? ABSENT_VALUE_LABEL : text;
};

const HELP_HTML = `
  <h6 class="fw-bold mb-1">What this page is for</h6>
  <p class="mb-2">Find spares held in your ship's store. Use the filters to shrink the
     list, then click a row to see its full details on the right.</p>
  <h6 class="fw-bold mb-1">Important to remember</h6>
  <ul class="mb-2">
    <li>You see only your own department's spares — SWMM does not show one department's spares to another.</li>
    <li>Always <strong>issue</strong> a spare in SWMM whenever you take it out of its SPTA box or stowed location, so SWMM can track and plan its replenishment.</li>
    <li>Click any row to open a spare's <strong>detail view</strong>, where you can also add or change its photo.</li>
  </ul>
  <h6 class="fw-bold mb-1">How to filter</h6>
  <ul class="mb-2">
    <li><strong>Spare Type</strong> and <strong>Class of Spares</strong> — pick these to narrow the list to the kind of spare you want.</li>
    <!-- Requirement 3.1. Documented here because a filter that only some
         accounts ever see is a filter that needs explaining to the ones that do. -->
    <li><strong>Sub Department</strong> — shown to the <strong>Executive Head of Department</strong>
        only. Executive is the one department held sub-department wise, so this list starts with
        every sub-department's spares together and narrows to one when you pick it.
        <strong>Unassigned</strong> shows the spares that were loaded before sub-departments were
        recorded and have not been attributed to one yet — they are shown rather than hidden, so
        they can be corrected.</li>
    <li><strong>Clear</strong> — empties the filters and shows the full list again.</li>
    <!-- The two client-side filters added alongside the two new columns.
         Both act on the search results already on screen, so neither costs a fresh search. -->
    <li><strong>The box under each column heading</strong> — type in it to narrow the list by that
        one column. They combine, so you can hold a pattern number and a location at once.
        Emptying a box widens the list again.</li>
    <li><strong>Photograph not uploaded</strong> — tick this to see only the spares that have no
        photograph on record, so you can go and add one. Open a spare and use <strong>Edit</strong>
        to upload it. <strong>Clear</strong> unticks this too.</li>
  </ul>
  <h6 class="fw-bold mb-1">What the columns mean</h6>
  <ul class="mb-2">
    <li><strong>Pattern Number</strong> — the spare's unique ID.</li>
    <li><strong>Category</strong> — P = Permanent, R = Returnable, C = Consumable.</li>
    <li><strong>Qty Authorised</strong> vs <strong>Qty Available</strong> — how many you are allowed to hold vs how many are on board right now.</li>
    <li><strong>Critical</strong> — marks a spare the ship cannot do without.</li>
    <li><strong>Authority</strong> — the scale the holding is based on (e.g. D787J).</li>
    <li><strong>Location</strong> — where the spare is stowed on board.</li>
    <!-- The two columns added at the end of the grid. -->
    <li><strong>Remarks</strong> — whatever was recorded against the spare. Long remarks are cut
        short in the column — open the spare to read the whole of one.</li>
    <li><strong>Spare Class</strong> — the class the spare's equipment class belongs to.</li>
    <li>A cell showing <strong>&mdash;</strong> means nothing has been recorded for that spare yet.</li>
  </ul>
  <h6 class="fw-bold mb-1">Buttons</h6>
  <ul class="mb-0">
    <li><strong>Add Spare</strong> — register a brand-new spare in the store.</li>
    <li><strong>Issue Multiple Spares</strong> — tick the boxes on several rows, then use this to issue them all together.</li>
    <li>Click any row to open the <strong>Spare Detail</strong> panel (stock, onboard location, box/rack).</li>
  </ul>
`;

const PRINT_COLUMNS: PrintColumn[] = [
  { header: "Pattern Number", field: "patternNumber" },
  { header: "Equipment Class", field: "equipmentClass" },
  { header: "Description", field: "description" },
  { header: "Category", field: "category", format: (v) => SPARE_CATEGORY_LABEL[v as Spare["category"]] ?? "" },
  { header: "Denomination", field: "denomination" },
  { header: "Qty Authorised", field: "quantityAuthorised" },
  { header: "Qty Held", field: "quantityAvailable" },
  { header: "Critical", field: "critical", format: (v) => (v ? "YES" : "NO") },
  { header: "Authority", field: "authority" },
  { header: "Location", field: "location" },
  // The two new grid columns, added here as well and in the same order they
  // sit in on screen. This list is maintained by hand against `columnDefs` below, because the two
  // have no shared source — a change that edits only `columnDefs` silently leaves the printed
  // report a column short. Deriving one from the other is recorded as an observation and is
  // outside this change.
  { header: "Remarks", field: "remarks" },
  { header: "Spare Class", field: "spareClass" },
];

@Component({
  selector: "app-obs-item-search",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DataGrid,
    DetailDrawer,
    IconComponent,
    ModalComponent,
    RadioInput,
    SelectInput,
    ToolbarSearch,
    HelpGuidance, ButtonComponent],
  templateUrl: "./item-search.html",
  styleUrl: "./item-search.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemSearch implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly router = inject(Router);
  private readonly selectionStore = inject(ObsSelectionStore);
  private readonly resultList = inject(ObsResultListStore);
  private readonly fb = inject(FormBuilder);
  private readonly exportService = inject(ReportExportService);
  private readonly notifications = inject(NotificationService);

  readonly helpHtml = HELP_HTML;
  readonly CRITICALITY_STRENGTH_LABEL = CRITICALITY_STRENGTH_LABEL;
  readonly spareClasses = signal<DropdownOptionDto[]>([]);
  readonly equipmentClasses = signal<DropdownOptionDto[]>([]);
  /** The sub-department filter — requirement 3.1.
   *
   * Empty for every department but EXECUTIVE, and the control does not render at all when it is,
   * so nothing changes on this screen for an Engineering, Electrical or Medical login. It is also
   * empty, and hidden, for a Dy HOD confined to one sub-department: they see their own inventory
   * and there is nothing for them to narrow to. The Executive Head of Department is the one
   * account this control exists for. */
  readonly subDepartments = signal<DropdownOptionDto[]>([]);
  readonly showSubDepartmentFilter = computed(() => this.subDepartments().length > 1);
  /** Requirement OQ-08 / decision S-09: every spare that predates the sub-department field carries
   * none, and those rows are SURFACED under this option rather than hidden. A row nobody can see
   * is a row nobody can correct. Prepended to the real sub-departments, and its value is the
   * literal the back end's `rbac.SUB_DEPARTMENT_UNASSIGNED` reads. */
  readonly subDepartmentOptions = computed<DropdownOptionDto[]>(() => [
    ...this.subDepartments(),
    { value: SUB_DEPARTMENT_UNASSIGNED, label: "Unassigned — no sub-department recorded" },
  ]);
  readonly spares = signal<Spare[]>([]);
  /** True while `search()` is in flight. `<app-data-grid>` shows its own skeleton rows for
   * this - without it the grid sat on ag-grid's own "No Rows To Show" for however long the
   * search took, which reads as an empty, broken result rather than one still loading, and is
   * indistinguishable from a search that genuinely matched nothing. */
  readonly searching = signal(false);
  readonly selectedRows = signal<Spare[]>([]);
  readonly drawerSpare = signal<Spare | null>(null);

  /** The "Photograph not uploaded" filter — so an operator can find the
   * spares that still need a photograph and go and add one on the edit screen.
   *
   * Client side and deliberately so. The search endpoint is unpaginated, so every matching row is
   * already here, and the three states that mean "no photograph" are all readable off the adapted
   * `imageUrl` — see `spareHasNoPhotograph`. A server parameter would have been a round trip to
   * fetch a subset of what the browser is already holding. */
  readonly photoMissingOnly = signal(false);

  /** What the grid actually renders. The filter narrows the rows already
   * fetched — it never triggers a fresh search, so unticking it is instant and costs nothing.
   *
   * `spares()` stays the unfiltered result set on purpose: the print and Excel paths, and the
   * result list handed to the Spare Detail screen's Previous / Next buttons, all read it, and none
   * of those is in this change's scope. */
  readonly visibleSpares = computed(() =>
    this.photoMissingOnly() ? this.spares().filter(spareHasNoPhotograph) : this.spares(),
  );

  readonly filtersForm = this.fb.nonNullable.group({
    spareClass: "",
    equipmentClass: "",
    subDepartment: "",
    q: "",
  });

  readonly addSpareChoiceOpen = signal(false);
  readonly addSpareChoiceForm = this.fb.nonNullable.group({
    choice: this.fb.control<"existing" | "new" | null>(null),
  });
  readonly addSpareChoiceOptions: { label: string; value: "existing" | "new" }[] = [
    { label: "Existing Spare — increase the quantity held", value: "existing" },
    { label: "New Spare — not yet in the inventory", value: "new" },
  ];
  readonly addSpareChoiceValue = toSignal(this.addSpareChoiceForm.controls.choice.valueChanges, {
    initialValue: null,
  });

  /** Three changes land on this array together, and one property was
   * deliberately NOT touched.
   *
   * 1. A FILTER INPUT IN EVERY DATA COLUMN'S HEADER. `filter` + `floatingFilter`, declared per
   *    column exactly as three sibling screens in this same folder already do it — the shared grid
   *    needs no change at all, because its `defaultColDef.filter: false` is only a default a
   *    caller can override. Client side, over the full result set, which is correct here because
   *    the search endpoint is unpaginated and every matching row is already in the browser. The
   *    eight per-field parameters that endpoint accepts server-side stay unused, deliberately:
   *    sending one would cost a round trip per keystroke and return a subset of data the client
   *    already holds. The Actions column and the injected checkbox column get no filter — there is
   *    nothing in either to filter on.
   *
   * 2. WRAPPING, ON EXACTLY TWO COLUMNS. Spare Description and Equipment Class are the two that
   *    carry sentences; every other column here is a code, a number or a short token. `autoHeight`
   *    plus the `grid-cell-wrap` class is the shared grid's own opt-in wrap, clamped to two lines.
   *    Both properties are needed — either alone does nothing. Remarks is deliberately NOT
   *    wrapped: it is a 2000-character field, and wrapping it would set the height of most rows in
   *    the grid to serve one column that is a presence indicator here rather than a readable
   *    field.
   *
   * 3. NO CELL RENDERS BLANK. Every column that can arrive empty gets a `valueFormatter` writing
   *    the one marker declared in `spare.model.ts`. Two exceptions, both on purpose: Criticality
   *    keeps its own label map, because its blank is a real domain state and not an absent value;
   *    and CATEGORY IS LEFT ALONE, because the adapter already substitutes PERMANENT for a blank
   *    category, so a marker there would hide a data defect instead of revealing one. The two
   *    quantities cannot be blank — zero is a real holding and must read as 0.
   *
   * NOT touched: the widths. Four columns below are declared under the shared grid's 120 minimum
   * and already render wider than they say. That is worth correcting and it is not this change. */
  readonly columnDefs: ColDef[] = [
    {
      field: "patternNumber",
      headerName: "Pattern Number",
      flex: 1,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      valueFormatter: absentIfBlank,
    },
    {
      field: "equipmentClass",
      headerName: "Equipment Class",
      flex: 1.4,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      autoHeight: true,
      cellClass: "grid-cell-wrap",
      valueFormatter: absentIfUnresolved,
    },
    {
      field: "description",
      headerName: "Spare Description",
      flex: 1.4,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      autoHeight: true,
      cellClass: "grid-cell-wrap",
      valueFormatter: absentIfBlank,
    },
    {
      field: "category",
      headerName: "Category",
      width: 110,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      valueGetter: (p) => SPARE_CATEGORY_LABEL[(p.data as Spare).category],
    },
    {
      field: "denomination",
      headerName: "Denomination",
      width: 130,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      valueFormatter: absentIfBlank,
    },
    {
      field: "quantityAuthorised",
      headerName: "Qty Authorised",
      width: 130,
      filter: "agTextColumnFilter",
      floatingFilter: true,
    },
    {
      field: "quantityAvailable",
      headerName: "Qty Held",
      width: 110,
      filter: "agTextColumnFilter",
      floatingFilter: true,
    },
    {
      field: "critical",
      headerName: "Critical",
      width: 100,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      valueGetter: (p) => ((p.data as Spare).critical ? "YES" : "NO"),
    },
    {
      field: "criticalityStrength",
      headerName: "Criticality",
      width: 110,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      valueGetter: (p) => CRITICALITY_STRENGTH_LABEL[(p.data as Spare).criticalityStrength],
    },
    {
      field: "authority",
      headerName: "Authority",
      width: 120,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      valueFormatter: absentIfUnresolved,
    },
    {
      field: "location",
      headerName: "Location",
      width: 110,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      valueFormatter: absentIfBlank,
    },
    // THE TWO NEW COLUMNS, in this order, at the end before Actions.
    // Both values are already on every row the grid is bound to — `remarks` comes straight off the
    // list payload and `spareClass` is resolved in the adapter from the master cache — so neither
    // costs a serializer field, an endpoint change or a single extra query. Both are declared at
    // or above the shared grid's 120 minimum, so neither silently renders wider than it says. The
    // extra width takes the grid past the panel and it scrolls sideways, which is accepted: the
    // checkbox column is pinned left by the shared grid, so what is selected stays visible.
    {
      field: "remarks",
      headerName: "Remarks",
      width: 200,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      valueFormatter: absentIfBlank,
    },
    {
      field: "spareClass",
      headerName: "Spare Class",
      width: 140,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      valueFormatter: absentIfBlank,
    },
    {
      headerName: "Actions",
      width: 90,
      sortable: false,
      cellRenderer: TextActionRenderer,
      cellRendererParams: {
        actions: (row: RowData) => [
          { label: "Issue", action: () => this.issueSpare(row as unknown as Spare) },
        ],
      },
    },
  ];

  ngOnInit(): void {
    void this.loadDropdowns();
    void this.search();
  }

  /** `Promise.allSettled`, not `Promise.all` — the sub-department call is
   * the third of three and a failure in it must not blank out the two dropdowns that already
   * worked on this screen. An Executive filter that fails to load is a filter that is missing,
   * not a page that is broken. */
  private async loadDropdowns(): Promise<void> {
    const [spareClasses, equipmentClasses, subDepartments] = await Promise.allSettled([
      firstValueFrom(this.api.getSpareClasses()),
      firstValueFrom(this.api.getEquipmentClasses()),
      firstValueFrom(this.api.getSubDepartments()),
    ]);
    if (spareClasses.status === "fulfilled") this.spareClasses.set(spareClasses.value);
    if (equipmentClasses.status === "fulfilled") this.equipmentClasses.set(equipmentClasses.value);
    if (subDepartments.status === "fulfilled") {
      // A CONFINED caller — a Dy HOD of one Executive sub-department — gets
      // exactly one row back and `locked: true`. The filter is not offered to them: their reads
      // are already scoped to that sub-department server-side, so a control whose only option is
      // the one they are already restricted to would be a control that does nothing.
      this.subDepartments.set(subDepartments.value.locked ? [] : subDepartments.value.subDepartments);
    }
  }

  private currentFilters() {
    const raw = this.filtersForm.getRawValue();
    return {
      spareClass: raw.spareClass || undefined,
      equipmentClass: raw.equipmentClass || undefined,
      // Omitted when blank, which the back end reads as "every
      // sub-department together" — the Executive Head of Department's default view.
      subDepartment: raw.subDepartment || undefined,
      q: raw.q || undefined,
    };
  }

  async search(): Promise<void> {
    this.searching.set(true);
    try {
      const results = await firstValueFrom(this.api.searchSpares(this.currentFilters()));
      this.spares.set(results);
    } catch {
      // `searchSpares` is a GET, so nothing in the interceptor chain raises a toast on
      // failure - left silent here, this failure reads as "the filters matched nothing"
      // rather than "the search failed", which sends the operator to second-guess a filter
      // that was never wrong.
      this.notifications.error("Could not load spares. Check your connection and try again.");
    } finally {
      this.searching.set(false);
    }
  }

  onGlobalSearchChange(value: string): void {
    this.filtersForm.controls.q.setValue(value);
    void this.search();
  }

  clearFilters(): void {
    this.filtersForm.reset({ spareClass: "", equipmentClass: "", subDepartment: "", q: "" });
    // Clear empties every filter on the screen, and the photograph checkbox
    // is one of them. Leaving it ticked after a Clear would leave the operator looking at a
    // narrowed list with no visible reason for it.
    this.photoMissingOnly.set(false);
    this.selectedRows.set([]);
    void this.search();
  }

  /** Toggle the photograph filter, and drop the row selection with it.
   *
   * The selection is cleared explicitly rather than left to the grid. Changing `rowData` makes
   * ag-grid rebuild its row nodes — this screen passes no `getRowId`, so the selection cannot
   * survive it — and the "Issue Multiple Spares (n)" count above the grid is driven by this
   * signal. Setting it here makes the count deterministic instead of dependent on whether the grid
   * happens to re-emit its selection event, so the button can never offer to issue a row that is
   * no longer on screen. */
  togglePhotoMissingOnly(): void {
    this.photoMissingOnly.set(!this.photoMissingOnly());
    this.selectedRows.set([]);
  }

  printGrid(): void {
    const rows = this.spares();
    const win = this.exportService.openLoadingWindow("Search Spare", PRINT_COLUMNS.length, rows.length);
    if (!win) return;
    this.exportService.renderPreviewWindow(win, "Search Spare", PRINT_COLUMNS, rows as unknown as Record<string, unknown>[], {
      print: true,
    });
  }

  async exportExcel(): Promise<void> {
    try {
      const blob = await firstValueFrom(this.api.exportSparesExcel(this.currentFilters()));
      this.exportService.downloadBlob(blob, "spares_export.xlsx");
    } catch {
      this.notifications.error("Failed to export spares to Excel.");
    }
  }

  onSelectionChanged(rows: RowData[]): void {
    this.selectedRows.set(rows as unknown as Spare[]);
  }

  /** Gates the checkbox column to spares with stock on hand — nothing else uses this selection
   * besides "Issue Multiple Spares", and a spare with `quantityAvailable === 0` can never satisfy
   * that screen's "at least 1, at most Qty Held" validation, which otherwise silently deadlocks
   * the form (every quantity, including 0, fails one of the two rules). */
  isSpareIssuable = (row: RowData): boolean => (row as unknown as Spare).quantityAvailable > 0;

  /** Matches the legacy "Search Spare" page's own split behaviour: clicking the Pattern Number
   * cell specifically opens the full "Spare Specific Details" page (`search/:id`, `SpareDetail`),
   * while clicking anywhere else in the row opens the quick-view drawer. */
  onCellClicked(event: CellCallbackParams): void {
    // The selection checkbox column has no `field` of its own — ticking it to build an "Issue
    // Multiple Spares" batch shouldn't also pop the detail drawer open.
    if (event.colDef?.["cellClass"] === "grid-select-cell") return;
    const spare = event.data as unknown as Spare;
    if (!spare) return;
    // Recorded before the branch rather than inside it. The pager on the
    // detail page was reachable from ten of the twelve columns only — the Pattern Number cell
    // opened the quick-view drawer and returned before the result set was ever handed over, and
    // the drawer's own Edit button then walked the operator into a spare-scoped screen with an
    // empty store behind it. Both branches leave this row, so both branches owe the store the
    // order the grid is showing.
    this.rememberResultOrder();
    if (event.colDef?.field === "patternNumber") {
      this.drawerSpare.set(spare);
      return;
    }
    this.router.navigate([`/afterAuth/inventory/ship-inventory-obs/search/${spare.id}`]);
  }

  /** Hand the detail page the whole filtered result set, in the order the
   * grid is showing it, so its Previous / Next buttons walk these spares and not the ship's
   * entire inventory. `spares()` is component-local and is destroyed the moment the router leaves
   * this screen, which is why the ids have to be put somewhere that outlives it. Called from every
   * path that leaves the grid for a single spare, so the pager no longer depends on which cell the
   * operator happened to click.
   *
   * Reads `visibleSpares()`, not `spares()`. With "Photograph not uploaded" ticked, the ids taken
   * from the unfiltered set made Next walk straight into a spare the grid was not showing — the
   * operator working through the spares that still need a photograph was silently handed one that
   * already had one. Print and Excel still read `spares()` and are deliberately left alone.
   *
   * NOTE for a reader of `visibleSpares()` above: the last paragraph of that field's own comment
   * still says the result list reads `spares()`. That was true when it was written and this line
   * is what changed it. The comment is left exactly as it stands under the preservation rule and
   * the staleness is recorded as an observation instead. */
  private rememberResultOrder(): void {
    this.resultList.setResults(this.visibleSpares().map((row) => row.id));
  }

  closeDrawer(): void {
    this.drawerSpare.set(null);
  }

  categoryBadgeColor(category: SpareCategory): string {
    return CATEGORY_BADGE_COLOR[category] ?? "#6b7280";
  }

  /** "add or change its photo" (per the drawer's own help text) reuses the existing Edit Spare
   * form — `app-obs-spare-form` already accepts an image upload — rather than duplicating that
   * upload flow here in a read-only drawer. */
  editSpare(spare: Spare): void {
    this.drawerSpare.set(null);
    // Edit is the second way out of this grid into a single spare. The store
    // is root-provided and outlives the edit screen, so recording the order here is what keeps the
    // pager working when the operator arrives at the detail page later in the same session.
    this.rememberResultOrder();
    this.router.navigate([`/afterAuth/inventory/ship-inventory-obs/search/${spare.id}/edit`]);
  }

  addSpare(): void {
    this.addSpareChoiceForm.reset({ choice: null });
    this.addSpareChoiceOpen.set(true);
  }

  closeAddSpareChoice(): void {
    this.addSpareChoiceOpen.set(false);
  }

  proceedAddSpare(): void {
    const choice = this.addSpareChoiceForm.controls.choice.value;
    if (!choice) return;
    this.addSpareChoiceOpen.set(false);
    const path = choice === "existing" ? "search/add-existing" : "search/add";
    this.router.navigate([`/afterAuth/inventory/ship-inventory-obs/${path}`]);
  }

  /** Single-row Issue reuses the same issue-multiple table as `issueMultiple()`, pre-selected
   * with just this one spare — matches the reference app, where both flows render the same
   * Pattern No/Qty Auth/Qty Held/Quantity Issued/Reason-for-High-Quantity table. */
  issueSpare(spare: Spare): void {
    if (spare.quantityAvailable <= 0) {
      this.notifications.error(`${spare.patternNumber} has no quantity held — there is nothing to issue.`);
      return;
    }
    this.selectionStore.setSelection([spare]);
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/search/issue-multiple"]);
  }

  issueMultiple(): void {
    if (!this.selectedRows().length) return;
    this.selectionStore.setSelection(this.selectedRows());
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/search/issue-multiple"]);
  }
}
