import { ButtonComponent } from '../button/button.component';
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  signal
} from "@angular/core";

import { ColDef, GridApi, GridReadyEvent, RowNode, RowData, RowClassRules, CellCallbackParams } from "ag-grid-community";
import { AgGridAngular } from "ag-grid-angular";
import { IconComponent } from '../icon/icon.component';

/** Minimal shape of ag-grid's row-clicked event consumed by this wrapper. */
interface DataGridRowClickEvent {
  data: RowData;
}
const TRUNCATE_AT = 10;
function truncateDisplay(text: string): string {
  return text.length > TRUNCATE_AT ? `${text.slice(0, TRUNCATE_AT)}…` : text;
}

@Component({
  selector: "app-data-grid",
  standalone: true,
  imports: [
    AgGridAngular,
    IconComponent
  , ButtonComponent],
  templateUrl: "./data-grid.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./data-grid.css"],
})
export class DataGrid implements OnChanges {
  @Input() rowData: RowData[] = [];
  @Input() columnDefs: ColDef[] = [];
  @Input() totalRowCount?: number | null;
  /** Shows a skeleton-row loading overlay in place of the grid body while an API
   * request is in flight. Caller toggles this around its own fetch — the grid keeps
   * rendering the previous rowData underneath, so nothing pops in/out. */
  @Input() loading = false;
  /** Number of skeleton rows to render while `loading` is true. */
  @Input() skeletonRowCount = 8;
  get skeletonRows(): number[] {
    return Array.from({ length: this.skeletonRowCount });
  }
  // internal page when using server-side pagination (1-based)
  private internalPage = 1;
  @Input() pagination = true;
  @Input() pageSize = 10;
  /** Optional identity for whatever dataset `rowData`/`totalRowCount` currently represent (e.g.
   * a report id). This component is long-lived across dataset switches within the same page —
   * neither `internalPage` (server-side page tracker) nor ag-grid's own `paginationPageSize`
   * grid option ever reset on their own, so without this, switching to a different report keeps
   * showing whatever page/page-size the user last picked on the PREVIOUS one, even though fresh
   * page-1 data already loaded. Pass a value that changes exactly when the dataset does. */
  @Input() resetKey?: string | number | null;
  @Input() height = "100%";
  @Input() maxHeight = "";
  @Input() autoHeight = false;
  @Input() checkboxSelection = false;
  @Input() headerCheckboxSelection = false;
  @Input() suppressRowClickSelection = false;
  @Input() selectable = false;
  /** Opt-in: allow dragging column headers to reorder them (off by default). */
  @Input() enableColumnReorder = false;
  /** Extracts a stable id from a row so ag-grid can match old/new row nodes across a
   * `rowData` reassignment (e.g. re-filtering on search). Without this, every reassignment
   * is treated as an entirely new dataset — row nodes are rebuilt from scratch and any
   * checkbox selection is silently lost, even for rows still present in the new array. */
  @Input() getRowId?: (data: RowData) => string;

  @Output() selectionChanged = new EventEmitter<RowData[]>();
  @Output() rowClicked = new EventEmitter<RowData>();
  @Output() gridReady = new EventEmitter<GridReadyEvent>();
  @Output() pageRequested = new EventEmitter<{ page: number; pageSize: number }>();
  /** Emits the new column order (colId/field list) after a header drag completes. */
  @Output() columnMoved = new EventEmitter<string[]>();
  // Datagrid
  @Input() showCheckboxes = false;
  @Input() showHeaderCheckbox = true;
  /** Optional per-row gate for `showCheckboxes` — rows it returns `false` for render
   * their checkbox disabled/unselectable (e.g. a draft record that can't join a batch
   * action yet). Left `undefined`, every row is selectable. */
  @Input() isRowSelectable?: (row: RowData) => boolean;
  @Output() cellClicked = new EventEmitter<CellCallbackParams>();
  /** Optional per-row conditional CSS classes, passed straight through to ag-grid's own
   * `rowClassRules` — unlike `getRowClass` (evaluated once per row node), these are
   * re-evaluated on every grid refresh, so a class based on state outside `rowData`
   * (e.g. a hover/pinned flag) correctly toggles on AND off as that state changes.
   * Left `undefined` (the default for every existing caller), nothing changes. */
  @Input() rowClassRules?: RowClassRules;
  gridApi!: GridApi;
  // totalRows = 0;
  // totalPages = 0;
  // currentPage = 1;
  // startRow = 0;
  // endRow = 0;

  readonly totalRows = signal(0);
  readonly totalPages = signal(0);
  readonly currentPage = signal(1);
  readonly startRow = signal(0);
  readonly endRow = signal(0);

  /** Captured from the first `pageSize` input the caller ever bound — what `resetKey` changes
   * restore `pageSize` back to, instead of a hardcoded 10 that would ignore a caller passing e.g.
   * `[pageSize]="25"`. */
  private defaultPageSize: number | null = null;
  @Input() resizable = true;
  /** Max width for columns (defaults to 350). Can be overridden per column in columnDefs or by passing a custom value. */
  @Input() maxColWidth = 350;
  /** Min width for columns (defaults to 80). */
  @Input() minColWidth = 120;
  @Input() autoSizeStrategy: any = { type: "fitCellContents" };

  /** An explicit height for ag-grid's floating filter row. Not an `@Input()` on purpose - no
   * caller has asked to tune it, and this component already carries five declared-and-never-read
   * inputs. `headerHeight` is pinned to 50 and nothing had ever set this, so on the screens that
   * do enable a per-column filter the row took the vendor default. 40 matches the data row
   * height, keeps the header text and the filter input on separate, legible lines, and leaves the
   * input (28px, styled in data-grid.css) well clear of WCAG 2.5.8's 24px minimum target.
   * Deliberately NOT conditional on whether any column declares a floating filter: ag-grid does
   * not render the row at all unless one does, so the value is inert on every other grid in the
   * application. */
  readonly floatingFiltersHeight = 40;

  get defaultColDef(): ColDef {
    return {
      sortable: true,
      filter: false,
      resizable: this.resizable,
      unSortIcon: true,
      suppressHeaderMenuButton: true,
      minWidth: this.minColWidth,
      maxWidth: this.maxColWidth,
      flex: 1,
      cellStyle: {
        display: "flex",
        cursor: "pointer",
        alignItems: "center",
        justifyContent: "flex-start",
        overflow: "hidden",
      },
      valueFormatter: (params: CellCallbackParams) => {
        const value = params["value"];
        if (value === null || value === undefined) return "";
        return truncateDisplay(String(value));
      },
      tooltipValueGetter: (params: CellCallbackParams) => {
        const value = params["value"];
        return value === null || value === undefined ? "" : String(value);
      },
    };
  }


  ngOnChanges(changes: SimpleChanges): void {
    if (changes['pageSize'] && this.defaultPageSize === null) {
      this.defaultPageSize = this.pageSize;
    }

    if (changes['resetKey'] && !changes['resetKey'].firstChange) {
      this.internalPage = 1;
      this.pageSize = this.defaultPageSize ?? this.pageSize;
      this.currentPage.set(1);
      if (this.gridApi) {
        this.gridApi.setGridOption("paginationPageSize", this.pageSize);
        this.gridApi.paginationGoToFirstPage();
      }
    }

    if (
      changes['columnDefs'] ||
      changes['showCheckboxes'] ||
      changes['showHeaderCheckbox'] ||
      changes['isRowSelectable']
    ) {
      this.finalColumnDefs = this.buildFinalColumnDefs();
    }

    if ((changes['rowData'] || changes['totalRowCount']) && this.gridApi) {
      // Deferred (matches `onPageSizeChange` below): at this point in `ngOnChanges`, Angular
      // has updated this component's own `rowData` input, but hasn't yet pushed it down into
      // `ag-grid-angular`'s own `[rowData]` binding — that happens later in the same
      // change-detection pass. Reading `gridApi.paginationGetTotalPages()` synchronously here
      // would return the PREVIOUS dataset's page count, so e.g. clearing a filter that had
      // collapsed the grid to one page left `totalPages` stuck at 1 and the Next button
      // permanently disabled even once the fuller dataset (and its real page count) landed.
      setTimeout(() => this.updatePaginationInfo());
    }
  }

  /** Cached rather than recomputed on every template read: `[columnDefs]` on
   * `ag-grid-angular` must keep the same array reference across change-detection
   * cycles that don't actually change the columns, or ag-grid treats every read as a
   * brand-new column set and rebuilds them — which drops the in-progress row
   * selection (e.g. a checkbox just ticked in one row gets cleared the moment
   * another row's click runs change detection). Only recomputed in `ngOnChanges`. */
  finalColumnDefs: ColDef[] = this.buildFinalColumnDefs();

  private buildFinalColumnDefs(): ColDef[] {
    const columns = this.applyHeaderTruncation(this.columnDefs);
    if (!this.showCheckboxes) {
      return columns;
    }

    return [
      {
        headerCheckboxSelection: this.showHeaderCheckbox,
        // Always `true` here — gating which rows can actually be checked is the grid-level
        // `isRowSelectable`'s job (`rowSelectableFn` below, wired via `[isRowSelectable]` on
        // `<ag-grid-angular>`), which ag-grid already uses to auto-disable a non-selectable row's
        // checkbox. A redundant per-cell `checkboxSelection` callback duplicating that same check
        // left every row's checkbox failing to render at all once a caller passed
        // `isRowSelectable` (e.g. Search Spare) — this static `true` is the same value every
        // caller that never sets `isRowSelectable` already relied on, so nothing changes for them.
        checkboxSelection: true,
        width: 48,
        minWidth: 48,
        maxWidth: 48,
        pinned: "left",
        sortable: false,
        filter: false,
        resizable: false,
        cellClass: "grid-select-cell",
        headerClass: "grid-select-cell",
      },
      ...columns,
    ];
  }
  private applyHeaderTruncation(defs: ColDef[]): ColDef[] {
    return defs.map((def) => {
      const headerName = def.headerName;
      if (!headerName) return def;
      return {
        ...def,
        headerName: truncateDisplay(headerName),
        headerTooltip: def["headerTooltip"] ?? headerName,
      };
    });
  }

  /** Grid-level `isRowSelectable` — keeps select-all and click-to-select in sync with
   * the same per-row gate the checkbox column itself uses. */
  rowSelectableFn = (node: RowNode): boolean => (this.isRowSelectable ? this.isRowSelectable(node.data as RowData) : true);

  /** Adapted to ag-grid's `GetRowIdParams` shape — `undefined` when the caller didn't pass
   * `getRowId`, which ag-grid treats as "no stable id, diff by array position" (its default). */
  get agGetRowId(): ((params: { data: RowData }) => string) | undefined {
    const getRowId = this.getRowId;
    return getRowId ? (params: { data: RowData }) => getRowId(params.data) : undefined;
  }

  onGridReady(params: GridReadyEvent): void {
    this.gridApi = params.api;
    this.gridReady.emit(params);
    this.updatePaginationInfo();
  }

  /** Ag-grid can finish computing its real page count (`paginationGetTotalPages()`)
   *  after `gridReady`/the first `rowData` change — reading it too early left the
   *  Next/Last buttons looking permanently disabled until some unrelated later
   *  interaction forced a recompute. This fires once per dataset actually
   *  rendering, so the footer re-syncs without hooking the high-frequency
   *  `paginationChanged` event (which also fires on selection/interaction and
   *  isn't needed here). */
  onFirstDataRendered(): void {
    this.updatePaginationInfo();
  }

  /** The footer is recomputed on `gridReady`, on first render and on a `rowData` change, and
   * until now on nothing else — so a caller-enabled floating filter changed what was on screen
   * without the count under it ever being asked again. Typing into a filter is the one
   * interaction that changes the row count without changing `rowData`, so it needs its own hook.
   * Deferred for the same reason the `rowData` branch in `ngOnChanges` is: ag-grid settles its
   * own page count after the event, and reading it synchronously here returns the pre-filter
   * figure. */
  onFilterChanged(): void {
    setTimeout(() => this.updatePaginationInfo());
  }

  onCellClicked(event: CellCallbackParams): void {
    this.cellClicked.emit(event);
  }
  onSelectionChanged(): void {
    const rows = this.gridApi.getSelectedRows();
    this.selectionChanged.emit(rows);
  }

  onRowClicked(event: DataGridRowClickEvent): void {
    this.rowClicked.emit(event.data);
  }

  onColumnMoved(event: { finished: boolean }): void {
    // Emit only when the drag settles, and only the caller's own columns.
    if (!event.finished || !this.gridApi) return;
    const api = this.gridApi as unknown as { getColumnState(): { colId?: string }[] };
    const order = api
      .getColumnState()
      .map((s) => s.colId)
      .filter((id): id is string => !!id);
    this.columnMoved.emit(order);
  }

  updatePaginationInfo(): void {
    if (!this.gridApi) {
      return;
    }

    const pageSize = this.gridApi.paginationGetPageSize();

    if (this.totalRowCount != null) {
      this.totalRows.set(this.totalRowCount);

      this.totalPages.set(
        Math.max(1, Math.ceil(this.totalRowCount / pageSize))
      );

      this.currentPage.set(
        Math.min(Math.max(1, this.internalPage), this.totalPages())
      );

      this.startRow.set(
        this.totalRowCount === 0
          ? 0
          : (this.currentPage() - 1) * pageSize + 1
      );

      this.endRow.set(
        Math.min(this.currentPage() * pageSize, this.totalRowCount)
      );
      return;
    }

    // Client-side pagination — no `totalRowCount` was given, so ag-grid is paginating `rowData`
    // itself internally (its own panel is just hidden via `suppressPaginationPanel`). Read that
    // state back so our own footer ("X-Y of Z" + prev/next) reflects it instead of sitting at
    // the 0/0 default forever.
    // This used to read `rowData.length`, on the stated grounds that the wrapper "never enables
    // grid-level filtering". `defaultColDef.filter = false` is only the DEFAULT — a caller can
    // and does turn a filter on per column, and several already do (Department Master, Daily
    // Orders History, and three OBS dashboard lists all set `filter: "agTextColumnFilter",
    // floatingFilter: true`). On those screens the footer read "1-10 of 240" while ten of a
    // filtered twelve were on screen. `paginationGetRowCount()` is ag-grid's own post-filter
    // count, so it is right whether a filter is in play or not.
    const totalRows = this.gridApi.paginationGetRowCount();
    const totalPages = Math.max(1, this.gridApi.paginationGetTotalPages());
    const current = this.gridApi.paginationGetCurrentPage() + 1; // ag-grid is 0-based

    this.totalRows.set(totalRows);
    this.totalPages.set(totalPages);
    this.currentPage.set(current);
    this.startRow.set(totalRows === 0 ? 0 : (current - 1) * pageSize + 1);
    this.endRow.set(Math.min(current * pageSize, totalRows));
  }

  nextPage(): void {
    if (!this.gridApi) return;
    if (this.totalRowCount != null) {
      const target = this.internalPage + 1;
      const pageSize = this.gridApi ? this.gridApi.paginationGetPageSize() : this.pageSize;
      const totalPages = Math.max(1, Math.ceil((this.totalRowCount || 0) / pageSize));
      if (target > totalPages) return;
      this.internalPage = target;
      this.pageRequested.emit({ page: this.internalPage, pageSize: pageSize });
      this.updatePaginationInfo();
      return;
    }

    const current = this.gridApi.paginationGetCurrentPage();
    const targetPage = current + 2; // convert zero-based to 1-based
    this.pageRequested.emit({ page: targetPage, pageSize: this.pageSize });
    this.gridApi.paginationGoToNextPage();
    this.updatePaginationInfo();
  }

  prevPage(): void {
    if (!this.gridApi) return;
    if (this.totalRowCount != null) {
      const target = Math.max(1, this.internalPage - 1);
      if (target === this.internalPage) return;
      this.internalPage = target;
      const pageSize = this.gridApi ? this.gridApi.paginationGetPageSize() : this.pageSize;
      this.pageRequested.emit({ page: this.internalPage, pageSize: pageSize });
      this.updatePaginationInfo();
      return;
    }

    const current = this.gridApi.paginationGetCurrentPage();
    const targetPage = Math.max(1, current); // previous page in 1-based
    this.pageRequested.emit({ page: targetPage, pageSize: this.pageSize });
    this.gridApi.paginationGoToPreviousPage();
    this.updatePaginationInfo();
  }

  firstPage(): void {
    if (!this.gridApi) return;
    if (this.totalRowCount != null) {
      this.internalPage = 1;
      const pageSize = this.gridApi ? this.gridApi.paginationGetPageSize() : this.pageSize;
      this.pageRequested.emit({ page: 1, pageSize });
      this.updatePaginationInfo();
      return;
    }

    this.pageRequested.emit({ page: 1, pageSize: this.pageSize });
    this.gridApi.paginationGoToFirstPage();
    this.updatePaginationInfo();
  }

  lastPage(): void {
    if (!this.gridApi) return;
    if (this.totalRowCount != null) {
      const pageSize = this.gridApi ? this.gridApi.paginationGetPageSize() : this.pageSize;
      const last = Math.max(1, Math.ceil((this.totalRowCount || 0) / pageSize));
      this.internalPage = last;
      this.pageRequested.emit({ page: last, pageSize });
      this.updatePaginationInfo();
      return;
    }

    const last = this.gridApi.paginationGetTotalPages();
    this.pageRequested.emit({ page: last, pageSize: this.pageSize });
    this.gridApi.paginationGoToLastPage();
    this.updatePaginationInfo();
  }

  onPageSizeChange(event: Event): void {
    if (!this.gridApi) return;
    const value = Number((event.target as HTMLSelectElement).value);
    this.pageSize = value;
    this.gridApi.setGridOption("paginationPageSize", value);
    this.gridApi.paginationGoToFirstPage();
    if (this.totalRowCount != null) {
      // switch to first page for server-side
      this.internalPage = 1;
      this.pageRequested.emit({ page: 1, pageSize: this.pageSize });
      setTimeout(() => this.updatePaginationInfo());
      return;
    }

    this.pageRequested.emit({ page: 1, pageSize: this.pageSize });
    setTimeout(() => {
      this.updatePaginationInfo();
    });
  }

  icons = {
    sortAscending: `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="16"
         height="16"
         viewBox="0 0 24 24"
         fill="none"
         stroke="currentColor"
         stroke-width="2"
         stroke-linecap="round"
         stroke-linejoin="round">
      <path d="m5 12 7-7 7 7"/>
      <path d="M12 19V5"/>
    </svg>
  `,

    sortDescending: `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="16"
         height="16"
         viewBox="0 0 24 24"
         fill="none"
         stroke="currentColor"
         stroke-width="2"
         stroke-linecap="round"
         stroke-linejoin="round">
      <path d="m19 12-7 7-7-7"/>
      <path d="M12 5v14"/>
    </svg>
  `,

    sortUnSort: `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="16"
         height="16"
         viewBox="0 0 24 24"
         fill="none"
         stroke="currentColor"
         stroke-width="2"
         stroke-linecap="round"
         stroke-linejoin="round">
      <path d="m7 15 5 5 5-5"/>
      <path d="m7 9 5-5 5 5"/>
    </svg>
  `
  };



}
