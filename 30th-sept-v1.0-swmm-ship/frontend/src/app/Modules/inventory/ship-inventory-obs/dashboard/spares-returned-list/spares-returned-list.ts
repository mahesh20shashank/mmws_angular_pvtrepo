import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { ColDef } from "ag-grid-community";
import { DataGrid } from "../../../../../shared/components/data-grid/data-grid";
import { ToolbarSearch } from "../../../../../shared/components/toolbar-search/toolbar-search";
import { ExportKind, ExportToolbar } from "../../../../../shared/components/export-toolbar/export-toolbar";
import { HelpGuidance } from "../../../../../shared/components/help-guidance/help-guidance";
import { PrintColumn, ReportExportService } from "../../../../../Core/services/export/generic-export.service";
import { ObsApiService } from "../../services/obs-api.service";
import { HistoryEntry } from "../../models/history.model";

const HELP_HTML = `
  <p class="mb-0">Every spare that has been returned to the store — the "Spares Returned" count from the dashboard.</p>
`;

const COLUMNS: ColDef[] = [
  { field: "date", headerName: "Return Date", width: 140, filter: "agTextColumnFilter", floatingFilter: true },
  { field: "patternNumber", headerName: "Pattern Number", flex: 1, filter: "agTextColumnFilter", floatingFilter: true },
  { field: "description", headerName: "Spare Description", flex: 1.4, filter: "agTextColumnFilter", floatingFilter: true },
  { field: "quantity", headerName: "Quantity", width: 110, filter: "agTextColumnFilter", floatingFilter: true },
  { field: "equipmentClass", headerName: "Equipment Class", flex: 1, filter: "agTextColumnFilter", floatingFilter: true },
  { field: "user", headerName: "Returned By", flex: 1, filter: "agTextColumnFilter", floatingFilter: true },
  { field: "remarks", headerName: "Return Remarks", flex: 1.2, filter: "agTextColumnFilter", floatingFilter: true },
  { field: "authority", headerName: "Authority", width: 120, filter: "agTextColumnFilter", floatingFilter: true },
];

const PRINT_COLUMNS: PrintColumn[] = [
  { header: "Return Date", field: "date" },
  { header: "Pattern Number", field: "patternNumber" },
  { header: "Spare Description", field: "description" },
  { header: "Quantity", field: "quantity" },
  { header: "Equipment Class", field: "equipmentClass" },
  { header: "Returned By", field: "user" },
  { header: "Return Remarks", field: "remarks" },
  { header: "Authority", field: "authority" },
];

/** Dashboard "View more" drill-down for the "Spares Returned" KPI tile — same
 * column set as the History page's "Returned" tab. */
@Component({
  selector: "app-obs-spares-returned-list",
  standalone: true,
  imports: [DataGrid, ToolbarSearch, ExportToolbar, HelpGuidance],
  templateUrl: "./spares-returned-list.html",
  styleUrl: "./spares-returned-list.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SparesReturnedList implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly exportService = inject(ReportExportService);

  readonly helpHtml = HELP_HTML;
  readonly entries = signal<HistoryEntry[]>([]);
  readonly searchText = signal("");
  readonly exportBusy = signal<ExportKind | null>(null);

  readonly filteredEntries = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    if (!query) return this.entries();
    return this.entries().filter((e) =>
      [e.patternNumber, e.description, e.user, e.equipmentClass ?? ""].some((v) => v.toLowerCase().includes(query)),
    );
  });

  readonly columnDefs: ColDef[] = COLUMNS;

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.entries.set(await firstValueFrom(this.api.getSparesReturnedList()));
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredEntries() as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(PRINT_COLUMNS, rows, "spares-returned.csv");
      return;
    }
    this.exportService.printRows("Spares Returned", PRINT_COLUMNS, rows);
  }

}
