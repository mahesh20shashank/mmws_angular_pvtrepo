import { ButtonComponent } from '../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { ColDef } from "ag-grid-community";
import { firstValueFrom } from "rxjs";
import { DataGrid } from "../../../shared/components/data-grid/data-grid";
import { ToolbarSearch } from "../../../shared/components/toolbar-search/toolbar-search";
import { ExportKind, ExportToolbar } from "../../../shared/components/export-toolbar/export-toolbar";
import { IconComponent } from "../../../shared/components/icon/icon.component";
import { DropdownOption, SelectInput } from "../../../shared/components/select-input/select-input";
import { HelpGuidance } from "../../../shared/components/help-guidance/help-guidance";
import { PrintColumn, ReportExportService } from "../../../Core/services/export/generic-export.service";
import { CrewApiService } from "../services/crew-api.service";
import { CrewPersonnel } from "../models/crew.model";
import { PersonnelStatusTab, STATUS_TAB_LABELS, STATUS_TAB_TO_STATUS } from "./personnel-status.model";

const VALID_TABS: PersonnelStatusTab[] = ["all", "present", "leave", "ty"];

const TAB_ICON: Record<PersonnelStatusTab, string> = {
  all: "users",
  present: "circle-check-big",
  leave: "circle-x",
  ty: "clock",
};

const TAB_COLOR_CLASS: Record<PersonnelStatusTab, string> = {
  all: "ps-tile--blue",
  present: "ps-tile--green",
  leave: "ps-tile--red",
  ty: "ps-tile--orange",
};

const BASE_COLUMNS: ColDef[] = [
  { colId: "serNo", headerName: "Ser No.", valueGetter: (p) => Number(p.node?.["rowIndex"] ?? 0) + 1, width: 90, sortable: false },
  { field: "rank", headerName: "Rank", width: 130 },
  {
    colId: "name",
    headerName: "Name",
    valueGetter: (p) => `${(p.data as CrewPersonnel).firstName} ${(p.data as CrewPersonnel).lastName}`,
    flex: 1,
  },
  { field: "pno", headerName: "Personnel Number", width: 170 },
  { field: "department", headerName: "Department", width: 160 },
  { field: "designation", headerName: "Designation", flex: 1 },
];

const STATUS_COLUMN: ColDef = { field: "status", headerName: "Status", width: 130 };

const PRINT_COLUMNS: PrintColumn[] = [
  { header: "Ser No.", field: "serNo" },
  { header: "Rank", field: "rank" },
  { header: "Name", field: "name" },
  { header: "Personnel Number", field: "pno" },
  { header: "Department", field: "department" },
  { header: "Designation", field: "designation" },
  { header: "Status", field: "status" },
];

@Component({
  selector: "app-crew-personnel-status",
  standalone: true,
  imports: [FormsModule, DataGrid, ToolbarSearch, ExportToolbar, IconComponent, HelpGuidance, SelectInput, ButtonComponent],
  templateUrl: "./personnel-status.html",
  styleUrl: "./personnel-status.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonnelStatus implements OnInit {
  private readonly api = inject(CrewApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly exportService = inject(ReportExportService);

  readonly tabs = VALID_TABS;
  readonly tabLabels = STATUS_TAB_LABELS;
  readonly tabIcon = TAB_ICON;
  readonly tabColorClass = TAB_COLOR_CLASS;
  readonly personnel = signal<CrewPersonnel[]>([]);
  readonly deptFilter = signal("");
  readonly searchText = signal("");
  readonly exportBusy = signal<ExportKind | null>(null);

  private readonly queryParamMap = toSignal(this.route.queryParamMap);
  readonly activeTab = computed<PersonnelStatusTab>(() => {
    const raw = this.queryParamMap()?.get("tab");
    return VALID_TABS.includes(raw as PersonnelStatusTab) ? (raw as PersonnelStatusTab) : "all";
  });

  readonly counts = computed(() => {
    const list = this.personnel();
    return {
      all: list.length,
      present: list.filter((p) => p.status === "Present").length,
      leave: list.filter((p) => p.status === "On Leave").length,
      ty: list.filter((p) => p.status === "Ty Duty").length,
    };
  });

  readonly departments = computed(() => [...new Set(this.personnel().map((p) => p.department))].sort((a, b) => a.localeCompare(b)));
  readonly departmentOptions = computed<DropdownOption[]>(() => this.departments().map((d) => ({ label: d, value: d })));

  readonly columnDefs = computed<ColDef[]>(() => (this.activeTab() === "all" ? [...BASE_COLUMNS, STATUS_COLUMN] : BASE_COLUMNS));

  readonly rows = computed(() => {
    const tab = this.activeTab();
    const dept = this.deptFilter();
    const query = this.searchText().trim().toLowerCase();
    const requiredStatus = STATUS_TAB_TO_STATUS[tab];
    return this.personnel().filter((p) => {
      if (requiredStatus && p.status !== requiredStatus) return false;
      if (dept && p.department !== dept) return false;
      if (
        query &&
        ![p.rank, p.firstName, p.lastName, p.pno, p.department, p.designation ?? ""].some((v) =>
          v.toLowerCase().includes(query),
        )
      ) {
        return false;
      }
      return true;
    });
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.personnel.set(await firstValueFrom(this.api.getPersonnel()));
  }

  selectTab(tab: PersonnelStatusTab): void {
    this.deptFilter.set("");
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab } });
  }

  onDeptChange(value: unknown): void {
    this.deptFilter.set(typeof value === "string" ? value : "");
  }

  clearFilters(): void {
    this.deptFilter.set("");
    this.searchText.set("");
  }

  private get exportRows(): Record<string, unknown>[] {
    const isAll = this.activeTab() === "all";
    return this.rows().map((p, i) => ({
      serNo: i + 1,
      rank: p.rank,
      name: `${p.firstName} ${p.lastName}`,
      pno: p.pno,
      department: p.department,
      designation: p.designation ?? "",
      status: isAll ? p.status : "",
    }));
  }

  private get printColumns(): PrintColumn[] {
    return this.activeTab() === "all" ? PRINT_COLUMNS : PRINT_COLUMNS.filter((c) => c.field !== "status");
  }

  onExport(kind: ExportKind): void {
    const title = this.tabLabels[this.activeTab()];
    if (kind === "excel") {
      this.exportService.downloadCsv(this.printColumns, this.exportRows, `${this.activeTab()}_personnel.csv`);
      return;
    }
    if (kind === "pdf") {
      this.exportService.downloadPdf(title, this.printColumns, this.exportRows, `${this.activeTab()}_personnel.pdf`);
      return;
    }
    this.exportService.printRows(title, this.printColumns, this.exportRows);
  }
}
