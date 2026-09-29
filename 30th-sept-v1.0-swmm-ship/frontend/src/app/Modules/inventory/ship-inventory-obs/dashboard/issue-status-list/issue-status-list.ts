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
import { IssueListEntry } from "../../models/issue.model";

export type IssueStatusKind = "to-maintainers" | "ty-loan";

interface IssueStatusRouteData {
  kind: IssueStatusKind;
  title: string;
  helpHtml?: string;
}

const COLUMNS: ColDef[] = [
  { field: "issueDate", headerName: "Issue Date", width: 130, filter: "agTextColumnFilter" },
  { field: "patternNumber", headerName: "Pattern No", flex: 1, filter: "agTextColumnFilter" },
  { field: "description", headerName: "Spare Description", flex: 1.3, filter: "agTextColumnFilter" },
  { field: "issuedQty", headerName: "Issue Qty", width: 100, filter: "agTextColumnFilter" },
  { field: "username", headerName: "Issued To", flex: 1, filter: "agTextColumnFilter" },
  { field: "reason", headerName: "Reason of Issue", flex: 1, filter: "agTextColumnFilter" },
  { field: "category", headerName: "Category", width: 120, filter: "agTextColumnFilter" },
  { field: "denomination", headerName: "Denomination", width: 130, filter: "agTextColumnFilter" },
  { field: "equipmentClass", headerName: "Equipment Class", flex: 1, filter: "agTextColumnFilter" },
  { field: "spareClass", headerName: "Spare Class", flex: 1, filter: "agTextColumnFilter" },
  { field: "authority", headerName: "Authority", width: 120, filter: "agTextColumnFilter" },
];

const PRINT_COLUMNS: PrintColumn[] = [
  { header: "Issue Date", field: "issueDate" },
  { header: "Pattern No", field: "patternNumber" },
  { header: "Spare Description", field: "description" },
  { header: "Issue Qty", field: "issuedQty" },
  { header: "Issued To", field: "username" },
  { header: "Reason of Issue", field: "reason" },
  { header: "Category", field: "category" },
  { header: "Denomination", field: "denomination" },
  { header: "Equipment Class", field: "equipmentClass" },
  { header: "Spare Class", field: "spareClass" },
  { header: "Authority", field: "authority" },
];

/**
 * Generic list reused for the 2 Issue-based dashboard "View more" drill-downs
 * (Spares Issued to Maintainers, Spares Issued on Ty Loan) — same column set
 * as the Return List page, parametrized via route data. "Return" routes to the
 * Return Spares page, which owns the actual return workflow/modal.
 */
@Component({
  selector: "app-obs-issue-status-list",
  standalone: true,
  imports: [DataGrid, ToolbarSearch, ExportToolbar, HelpGuidance],
  templateUrl: "./issue-status-list.html",
  styleUrl: "./issue-status-list.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IssueStatusList implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly exportService = inject(ReportExportService);

  title = "";
  helpHtml = "";
  readonly entries = signal<IssueListEntry[]>([]);
  readonly searchText = signal("");
  readonly exportBusy = signal<ExportKind | null>(null);

  readonly filteredEntries = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    if (!query) return this.entries();
    return this.entries().filter((e) =>
      [e.patternNumber, e.description, e.username, e.equipmentClass, e.spareClass, e.authority].some((v) =>
        v.toLowerCase().includes(query),
      ),
    );
  });

  readonly columnDefs: ColDef[] = [
    ...COLUMNS,
    {
      headerName: "Actions",
      width: 110,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: RowData) => [
          { icon: "edit", label: "Return", color: "#1d96e9", action: () => this.goToReturn(row as unknown as IssueListEntry) },
        ],
      },
    },
  ];

  ngOnInit(): void {
    const data = this.route.snapshot.data as IssueStatusRouteData;
    this.title = data.title;
    this.helpHtml = data.helpHtml ?? "";
    void this.load(data.kind);
  }

  private async load(kind: IssueStatusKind): Promise<void> {
    const source = kind === "to-maintainers" ? this.api.getSparesIssuedToMaintainers() : this.api.getSparesIssuedOnTyLoan();
    this.entries.set(await firstValueFrom(source));
  }

  goToReturn(_entry: IssueListEntry): void {
    void this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/return"]);
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredEntries() as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(PRINT_COLUMNS, rows, `${this.title.toLowerCase().replace(/\s+/g, "-")}.csv`);
      return;
    }
    this.exportService.printRows(this.title, PRINT_COLUMNS, rows);
  }
}
