import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { ColDef, RowData } from "ag-grid-community";
import { DataGrid } from "../../../../../shared/components/data-grid/data-grid";
import { TextActionRenderer } from "../../../../../shared/components/data-grid/grid-text-action-renderer";
import { ToolbarSearch } from "../../../../../shared/components/toolbar-search/toolbar-search";
import { ExportKind, ExportToolbar } from "../../../../../shared/components/export-toolbar/export-toolbar";
import { IconComponent } from "../../../../../shared/components/icon/icon.component";
import { ModalComponent } from "../../../../../shared/components/modal/modal.component";
import { HelpGuidance } from "../../../../../shared/components/help-guidance/help-guidance";
import { SelectInput } from "../../../../../shared/components/select-input/select-input";
import { PrintColumn, ReportExportService } from "../../../../../Core/services/export/generic-export.service";
import { AccessControlService } from "../../../../../Core/navigation/access-control.service";
import { ObsApiService } from "../../services/obs-api.service";
import { IssueListEntry } from "../../models/issue.model";
import { CRITICALITY_STRENGTH_LABEL, CriticalityStrength, SPARE_CATEGORY_LABEL, Spare } from "../../models/spare.model";

const HELP_HTML = `
  <h6 class="fw-bold mb-1">What this page is for</h6>
  <p class="mb-2">This is the ship's list of critical spares, arranged department wise. It is prepared by SWMM on its own &mdash; entries are not added or removed by hand.</p>
  <h6 class="fw-bold mb-1">How a spare reaches this list</h6>
  <p class="mb-2">SWMM watches how often each spare is issued (excluding Ty Loan transfers). Once a spare has been issued 3 or more times in the current year it is marked critical, and its strength grade then rises from low, to moderate, to high as further issues are recorded.</p>
  <ul class="mb-0">
    <li><strong>LOW</strong> &mdash; issued 3 or more times this year.</li>
    <li><strong>MODERATE</strong> &mdash; issued 6 or more times this year.</li>
    <li><strong>HIGH</strong> &mdash; issued 10 or more times this year.</li>
  </ul>
`;

const PRINT_COLUMNS: PrintColumn[] = [
  { header: "Department", field: "departmentName" },
  { header: "Pattern No", field: "patternNumber" },
  { header: "Spare Description", field: "description" },
  { header: "Qty Authorised", field: "quantityAuthorised" },
  { header: "Qty Held", field: "quantityAvailable" },
  { header: "Category", field: "category", format: (v) => SPARE_CATEGORY_LABEL[v as Spare["category"]] ?? "" },
  { header: "Criticality Strength", field: "criticalityStrength", format: (v) => CRITICALITY_STRENGTH_LABEL[v as CriticalityStrength] ?? "" },
  { header: "Issues Till Date", field: "issuesThisYear" },
  { header: "Authority", field: "authority" },
];

interface CriticalRow extends Spare {
  issuesThisYear: number;
}

@Component({
  selector: "app-obs-critical-spare-list",
  standalone: true,
  imports: [FormsModule, DataGrid, ToolbarSearch, ExportToolbar, IconComponent, ModalComponent, HelpGuidance, SelectInput, ButtonComponent],
  templateUrl: "./critical-spare-list.html",
  styleUrl: "./critical-spare-list.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CriticalSpareList implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly exportService = inject(ReportExportService);
  private readonly accessControl = inject(AccessControlService);

  readonly helpHtml = HELP_HTML;
  readonly isPrivileged = this.accessControl.isPrivileged;

  private readonly spares = signal<Spare[]>([]);
  /** Consumption issues only (excludes Ty Loan) — mirrors the backend's own
   * `Spares.consumption_issue_count()`, which is what actually drives `criticalityStrength`. */
  private readonly consumptionIssues = signal<IssueListEntry[]>([]);

  readonly searchText = signal("");
  readonly departmentFilter = signal("");
  readonly spareClassFilter = signal("");
  readonly equipmentClassFilter = signal("");
  readonly exportBusy = signal<ExportKind | null>(null);

  readonly detailSpare = signal<CriticalRow | null>(null);

  /** Issue rows for `issuesThisYear`/the detail modal, keyed by spare id — this calendar year
   * only, matching the "Issues This Year" framing and the backend's own `year=None` default. */
  private readonly issuesBySpareId = computed(() => {
    const year = new Date().getFullYear();
    const map = new Map<string, IssueListEntry[]>();
    for (const issue of this.consumptionIssues()) {
      if (new Date(issue.issueDate).getFullYear() !== year) continue;
      const list = map.get(issue.spareId);
      if (list) list.push(issue);
      else map.set(issue.spareId, [issue]);
    }
    return map;
  });

  private readonly rows = computed<CriticalRow[]>(() =>
    this.spares()
      .map((spare) => ({ ...spare, issuesThisYear: this.issuesBySpareId().get(spare.id)?.length ?? 0 }))
      .sort(
        (a, b) =>
          (a.departmentName ?? "").localeCompare(b.departmentName ?? "") ||
          a.patternNumber.localeCompare(b.patternNumber),
      ),
  );

  readonly departmentOptions = computed(() =>
    [...new Set(this.rows().map((r) => r.departmentName).filter((v): v is string => !!v))]
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ label: v, value: v })),
  );
  readonly spareClassOptions = computed(() =>
    [...new Set(this.byDepartment().map((r) => r.spareClass))]
      .filter(Boolean)
      .sort()
      .map((v) => ({ label: v, value: v })),
  );
  readonly equipmentClassOptions = computed(() =>
    [...new Set(this.bySpareClass().map((r) => r.equipmentClass))]
      .filter(Boolean)
      .sort()
      .map((v) => ({ label: v, value: v })),
  );

  private readonly byDepartment = computed(() => {
    const department = this.departmentFilter();
    return department ? this.rows().filter((r) => r.departmentName === department) : this.rows();
  });
  private readonly bySpareClass = computed(() => {
    const spareClass = this.spareClassFilter();
    return spareClass ? this.byDepartment().filter((r) => r.spareClass === spareClass) : this.byDepartment();
  });

  /** Department column only earns its place when the list isn't already scoped to one
   * department — matches the reference page's `show_department` toggle. Non-privileged users
   * only ever see their own department's spares, so it's always redundant for them. */
  readonly showDepartmentColumn = computed(() => this.isPrivileged() && !this.departmentFilter());

  readonly filteredRows = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const equipmentClass = this.equipmentClassFilter();
    return this.bySpareClass().filter((r) => {
      if (equipmentClass && r.equipmentClass !== equipmentClass) return false;
      if (query && ![r.patternNumber, r.description, r.equipmentClass, r.spareClass].some((v) => v.toLowerCase().includes(query))) {
        return false;
      }
      return true;
    });
  });

  readonly columnDefs = computed<ColDef[]>(() => [
    ...(this.showDepartmentColumn() ? [{ field: "departmentName", headerName: "Department", width: 140 } as ColDef] : []),
    { field: "patternNumber", headerName: "Pattern No", flex: 1, filter: "agTextColumnFilter", floatingFilter: true },
    { field: "description", headerName: "Spare Description", flex: 1.4, filter: "agTextColumnFilter", floatingFilter: true },
    { field: "quantityAuthorised", headerName: "Qty Authorised", width: 130 },
    { field: "quantityAvailable", headerName: "Qty Held", width: 110 },
    {
      field: "category",
      headerName: "Category",
      width: 100,
      valueGetter: (p) => SPARE_CATEGORY_LABEL[(p.data as CriticalRow).category],
    },
    {
      colId: "criticalityStrength",
      headerName: "Criticality Strength",
      width: 160,
      cellRenderer: (p: { data: CriticalRow }) =>
        `<span class="crit-flag crit-flag--${p.data.criticalityStrength.toLowerCase()}">${CRITICALITY_STRENGTH_LABEL[p.data.criticalityStrength]}</span>`,
    },
    { field: "issuesThisYear", headerName: "Issues This Year", width: 140 },
    { field: "authority", headerName: "Authority", width: 140 },
    {
      headerName: "Actions",
      width: 130,
      sortable: false,
      filter: false,
      cellRenderer: TextActionRenderer,
      cellRendererParams: {
        actions: (row: RowData) => [
          { label: "Issue History", action: () => this.openDetail(row as unknown as CriticalRow) },
        ],
      },
    },
  ]);

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const [spares, consumptionIssues] = await Promise.all([
      firstValueFrom(this.api.getCriticalSpareList()),
      firstValueFrom(this.api.getSparesIssuedToMaintainers()),
    ]);
    this.spares.set(spares);
    this.consumptionIssues.set(consumptionIssues);
  }

  onDepartmentChange(value: unknown): void {
    this.departmentFilter.set(typeof value === "string" ? value : "");
    this.spareClassFilter.set("");
    this.equipmentClassFilter.set("");
  }

  onSpareClassChange(value: unknown): void {
    this.spareClassFilter.set(typeof value === "string" ? value : "");
    this.equipmentClassFilter.set("");
  }

  onEquipmentClassChange(value: unknown): void {
    this.equipmentClassFilter.set(typeof value === "string" ? value : "");
  }

  clearFilters(): void {
    this.departmentFilter.set("");
    this.spareClassFilter.set("");
    this.equipmentClassFilter.set("");
    this.searchText.set("");
  }

  openDetail(row: CriticalRow): void {
    this.detailSpare.set(row);
  }

  closeDetail(): void {
    this.detailSpare.set(null);
  }

  detailRows(spare: CriticalRow): IssueListEntry[] {
    return (this.issuesBySpareId().get(spare.id) ?? [])
      .slice()
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  }

  private get exportRows(): (CriticalRow & Record<string, unknown>)[] {
    return this.filteredRows() as (CriticalRow & Record<string, unknown>)[];
  }

  onExport(kind: ExportKind): void {
    if (kind === "excel") {
      this.exportService.downloadCsv(PRINT_COLUMNS, this.exportRows, "critical-spare-list.csv");
      return;
    }
    this.exportService.printRows("Critical Spare List", PRINT_COLUMNS, this.exportRows);
  }

}
