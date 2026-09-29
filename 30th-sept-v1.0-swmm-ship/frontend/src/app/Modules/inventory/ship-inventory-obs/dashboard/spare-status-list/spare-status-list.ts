import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { ColDef, RowData } from "ag-grid-community";
import { DataGrid } from "../../../../../shared/components/data-grid/data-grid";
import { ActionRendererComponent } from "../../../../../shared/components/data-grid/grid-action-icons";
import { ToolbarSearch } from "../../../../../shared/components/toolbar-search/toolbar-search";
import { ExportKind, ExportToolbar } from "../../../../../shared/components/export-toolbar/export-toolbar";
import { HelpGuidance } from "../../../../../shared/components/help-guidance/help-guidance";
import { PrintColumn, ReportExportService } from "../../../../../Core/services/export/generic-export.service";
import { ObsApiService } from "../../services/obs-api.service";
import { SPARE_CATEGORY_LABEL, Spare } from "../../models/spare.model";

export type SpareStatusKind = "less-than-50" | "d787j-deficiency";

interface SpareStatusRouteData {
  kind: SpareStatusKind;
  title: string;
  helpHtml?: string;
}

const COLUMNS: ColDef[] = [
  { field: "patternNumber", headerName: "Pattern Number", flex: 1, filter: "agTextColumnFilter", floatingFilter: true },
  { field: "description", headerName: "Spare Description", flex: 1.4, filter: "agTextColumnFilter", floatingFilter: true },
  {
    field: "category",
    headerName: "Category",
    width: 110,
    filter: "agTextColumnFilter",
    floatingFilter: true,
    valueGetter: (p) => SPARE_CATEGORY_LABEL[(p.data as Spare).category],
  },
  { field: "quantityAuthorised", headerName: "Qty Authorised", width: 130, filter: "agTextColumnFilter", floatingFilter: true },
  { field: "quantityAvailable", headerName: "Qty Held", width: 110, filter: "agTextColumnFilter", floatingFilter: true },
  {
    field: "critical",
    headerName: "Critical",
    width: 100,
    filter: "agTextColumnFilter",
    floatingFilter: true,
    valueGetter: (p) => ((p.data as Spare).critical ? "YES" : "NO"),
  },
  { field: "authority", headerName: "Authority", width: 120, filter: "agTextColumnFilter", floatingFilter: true },
  { field: "equipmentClass", headerName: "Equipment Class", flex: 1, filter: "agTextColumnFilter", floatingFilter: true },
  { field: "spareClass", headerName: "Spare Class", flex: 1, filter: "agTextColumnFilter", floatingFilter: true },
];

/**
 * The shortfall, `Qty Authorised - Qty Held`, computed server-side.
 *
 * Headed `Qty Deficient` to sit with `Qty Authorised` and `Qty Held`, which is the wording
 * this grid and every sibling spare grid (Item Search, Critical Spare List, Requisition
 * List) already use — `Deficiency Qty` would have been the only column here to put the
 * noun first.
 *
 * D787J Deficiency only. This component is shared with the "Spares < 50%" route, where a
 * shortfall against the D787J scale means nothing, so it is inserted per `kind` rather
 * than added to `COLUMNS`.
 *
 * Sorted descending by default so the largest shortfalls are at the top. The server already
 * returns the rows in that order; `sort: "desc"` is what makes the header indicator agree
 * with what is on screen, and the column stays sortable by click either way.
 */
const DEFICIENCY_COLUMN: ColDef = {
  field: "deficiencyQuantity",
  headerName: "Qty Deficient",
  width: 130,
  sort: "desc",
  sortIndex: 0,
  filter: "agNumberColumnFilter",
  floatingFilter: true,
};

const DEFICIENCY_PRINT_COLUMN: PrintColumn = { header: "Qty Deficient", field: "deficiencyQuantity" };

/** The column the shortfall sits immediately after, in both the grid and the export lists. */
const QTY_HELD_FIELD = "quantityAvailable";

/** One helper for the grid and the export lists, so the column cannot
 * end up in a different position in the CSV/print output than it holds on screen. The
 * insertion point is found by field name rather than by a fixed index, so reordering the
 * columns above cannot silently move the shortfall away from `Qty Held`. Appends if
 * `Qty Held` is ever removed, which keeps the column visible instead of losing it. */
function withDeficiencyColumn<T extends { field?: string }>(columns: readonly T[], column: T): T[] {
  const heldIndex = columns.findIndex((c) => c.field === QTY_HELD_FIELD);
  const at = heldIndex === -1 ? columns.length : heldIndex + 1;
  return [...columns.slice(0, at), column, ...columns.slice(at)];
}

const PRINT_COLUMNS: PrintColumn[] = [
  { header: "Pattern Number", field: "patternNumber" },
  { header: "Spare Description", field: "description" },
  { header: "Category", field: "category", format: (v) => SPARE_CATEGORY_LABEL[v as Spare["category"]] ?? "" },
  { header: "Qty Authorised", field: "quantityAuthorised" },
  { header: "Qty Held", field: "quantityAvailable" },
  { header: "Critical", field: "critical", format: (v) => (v ? "YES" : "NO") },
  { header: "Authority", field: "authority" },
  { header: "Equipment Class", field: "equipmentClass" },
  { header: "Spare Class", field: "spareClass" },
];

/**
 * Generic list reused for 2 of the Spare-based dashboard "View more" drill-downs (Spares < 50%
 * in Inventory, D787J Deficiency) — same column set as Item Search, parametrized entirely via
 * route data. Critical Spare List has its own dedicated component (`critical-spare-list/`) —
 * its reference design needs criticality-strength flags, an Issue History detail, and an
 * admin-only Department filter that don't fit this generic list's shape.
 */
@Component({
  selector: "app-obs-spare-status-list",
  standalone: true,
  imports: [DataGrid, ToolbarSearch, ExportToolbar, HelpGuidance],
  templateUrl: "./spare-status-list.html",
  styleUrl: "./spare-status-list.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpareStatusList implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly exportService = inject(ReportExportService);

  title = "";
  helpHtml = "";
  kind: SpareStatusKind = "less-than-50";
  readonly spares = signal<Spare[]>([]);
  readonly searchText = signal("");
  readonly exportBusy = signal<ExportKind | null>(null);

  readonly filteredSpares = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    if (!query) return this.spares();
    return this.spares().filter((s) =>
      [s.patternNumber, s.description, s.equipmentClass, s.spareClass].some((v) => v.toLowerCase().includes(query)),
    );
  });

  private readonly actionsColumn: ColDef = {
    headerName: "Actions",
    width: 100,
    sortable: false,
    filter: false,
    cellRenderer: ActionRendererComponent,
    cellRendererParams: {
      actions: (row: RowData) => [
        { icon: "edit", label: "Issue", color: "#1d96e9", action: () => this.issueSpare(row as unknown as Spare) },
      ],
    },
  };

  /** Signals rather than fields initialised inline, because both lists
   * now depend on `kind`, which is only known once `ngOnInit` has read the route data. */
  readonly columnDefs = signal<ColDef[]>([]);
  readonly printColumns = signal<PrintColumn[]>([...PRINT_COLUMNS]);

  /** True only on the D787J Deficiency route. The "< 50%" route shares this component and
   * must render exactly as it did before this change. */
  readonly isDeficiencyScreen = signal(false);

  /** Without this the empty-state panel renders for the moment
   * between `ngOnInit` and the first response, telling the user there are no deficiencies
   * before anything has been fetched. */
  readonly loading = signal(false);

  ngOnInit(): void {
    const data = this.route.snapshot.data as SpareStatusRouteData;
    this.title = data.title;
    this.helpHtml = data.helpHtml ?? "";
    this.kind = data.kind;

    const isDeficiency = data.kind === "d787j-deficiency";
    this.isDeficiencyScreen.set(isDeficiency);
    this.columnDefs.set(
      isDeficiency
        ? [...withDeficiencyColumn(COLUMNS, DEFICIENCY_COLUMN), this.actionsColumn]
        : [...COLUMNS, this.actionsColumn],
    );
    this.printColumns.set(
      isDeficiency ? withDeficiencyColumn(PRINT_COLUMNS, DEFICIENCY_PRINT_COLUMN) : [...PRINT_COLUMNS],
    );

    void this.load(data.kind);
  }

  private async load(kind: SpareStatusKind): Promise<void> {
    const source = kind === "less-than-50" ? this.api.getSparesLessThan50Percent() : this.api.getD787jDeficiency();
    this.loading.set(true);
    try {
      this.spares.set(await firstValueFrom(source));
    } finally {
      // Cleared on failure too, so a failed fetch shows the empty state rather than an
      // indefinite skeleton.
      this.loading.set(false);
    }
  }

  issueSpare(spare: Spare): void {
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/search", spare.id, "issue"]);
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredSpares() as unknown as Record<string, unknown>[];
    const columns = this.printColumns();
    if (kind === "excel") {
      this.exportService.downloadCsv(columns, rows, `${this.title.toLowerCase().replace(/\s+/g, "-")}.csv`);
      return;
    }
    this.exportService.printRows(this.title, columns, rows);
  }

}
