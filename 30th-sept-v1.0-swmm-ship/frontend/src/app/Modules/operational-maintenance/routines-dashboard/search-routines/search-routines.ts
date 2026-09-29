import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { FormBuilder, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { debounceTime, distinctUntilChanged } from "rxjs";

import { NotificationService } from '../../../../Core/services/notification/notification.service';

import { MasterCard } from "../../../refit-maintenance/master-card/master-card";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { SelectInput } from "../../../../shared/components/select-input/select-input";

import { Call } from "../../../../Core/http/services/call";
import { OperationalMaintenanceApi } from "../../services/operational-maintenance-api";
import {
  EmsSearchPlanResponse,
  EmsSearchResultItem,
  HeaderStats,
  RoutineItem,
  SelectOption,
} from "./search-routines.model";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { Router } from "@angular/router";
import { FussStatusRendererComponent } from "../../action-forms/fuss-status-renderer";
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ExportKind, ExportToolbar } from "../../../../shared/components/export-toolbar/export-toolbar";
import { PrintColumn, ReportExportService } from "../../../../Core/services/export/generic-export.service";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";

const HELP_HTML = `
  <p class="mb-0">This is the main Routines search screen. Filter by sub-department, equipment, or routine category and the table updates with live counts of routines that are due, due soon, or due later. Click a row to open its Maintop detail, or use the PDF icon in the Action column to download the Maintop sheet.</p>
`;

@Component({
  selector: "app-search-routine-action-renderer",
  standalone: true,
  imports: [IconComponent],
  template: `
    <button
      type="button"
      class="hover:opacity-80 transition-opacity flex items-center justify-center w-full h-full"
      title="View Maintop"
      (click)="onClick($event)"
    >
      <app-icon
        name="file-text"
        [size]="16"
        color="#dc2626">
      </app-icon>
    </button>
  `,
})
export class SearchRoutineActionRendererComponent implements ICellRendererAngularComp {
  private params: (ICellRendererParams & { onClick?: (data: RoutineItem) => void }) | null = null;

  agInit(params: ICellRendererParams & { onClick?: (data: RoutineItem) => void }): void {
    this.params = params;
  }

  refresh(params: ICellRendererParams & { onClick?: (data: RoutineItem) => void }): boolean {
    this.params = params;
    return true;
  }

  onClick(event: MouseEvent): void {
    event.stopPropagation();
    if (this.params?.onClick && this.params?.data) {
      this.params.onClick(this.params.data as RoutineItem);
    }
  }
}

const ROUTINE_CATEGORY_OPTIONS: SelectOption[] = [
  { value: "CALENDAR BASED", label: "Calendar Based" },
  { value: "RUNNING HOUR BASED", label: "Running Hour Based" },
  { value: "ALTERNATE PERIODIC", label: "Alternate Periodic" },
];

const STATUS_COLOR_DUE = "#FF9999";
const STATUS_COLOR_DUE_LT_3M = "#f7e687";
const STATUS_COLOR_DUE_3_6M = "orange";

@Component({
  selector: "app-search-routines",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MasterCard, DataGrid, SelectInput, IconComponent, ExportToolbar, HelpGuidance, ButtonComponent],
  templateUrl: "./search-routines.html",
  styleUrl: "./search-routines.css",
})
export class SearchRoutines implements OnInit {
  readonly helpHtml = HELP_HTML;

  private readonly fb = inject(FormBuilder);
  private readonly api = inject(OperationalMaintenanceApi);
  private readonly call = inject(Call);
  private readonly router = inject(Router);
  private readonly toastr = inject(NotificationService);
  private readonly exportService = inject(ReportExportService);
  readonly exportBusy = signal<ExportKind | null>(null);

  searchForm: FormGroup = this.fb.group({
    sub_department: [""],
    equipment: [""],
    routine_type: [""],
    routine_name: [""],
    search: [""],
  });
  readonly routines = signal<RoutineItem[]>([]);
  readonly totalRowCount = signal(0);
  readonly isLoading = signal(false);
  private currentPage = 1;
  private currentPageSize = 10;
  readonly subDepartmentOptions = signal<SelectOption[]>([]);
  readonly equipmentOptions = signal<SelectOption[]>([]);
  readonly routineTypeOptions = signal<SelectOption[]>(ROUTINE_CATEGORY_OPTIONS);
  readonly routineNameOptions = signal<SelectOption[]>([]);
  readonly headerStats = signal<HeaderStats>({
    due: 0,
    dueLessThan3M: 0,
    due3To6M: 0,
    other: 0,
  });
  readonly columnDefs: ColDef[] = [
    {
      headerName: "Sub Department",
      field: "section_name",
      flex: 1,
    },
    {
      headerName: "Equipment Name",
      field: "equipment_name",
      flex: 2,
    },
    // {
    //   headerName: "Routine Type",
    //   field: "routine_type",
    //   flex: 1.2,
    // },
    {
      headerName: "Routine Name",
      field: "routine_name",
      flex: 2,
    },
    {
      headerName: "Status",
      field: "due_status",
      flex: 1.2,
      minWidth: 120,
      cellRenderer: FussStatusRendererComponent,
    },
    {
      headerName: "Previous Routine Completion Date",
      field: "last_routine_date",
      flex: 1.3,
    },
    {
      headerName: "Next Routine due Date*",
      field: "next_due_date",
      flex: 1.3,
      cellStyle: { color: "#c084fc", fontWeight: "600" },
    },
    {
      headerName: "Total R/H updated upto",
      field: "running_hours_updated_till",
      flex: 1.3,
    },
    {
      headerName: "Total R/H SI",
      field: "total_running_hours",
      flex: 1.2,
    },
    {
      headerName: "Routine completed @ R/H",
      field: "last_routine_running_hours",
      flex: 1.3,
    },
    {
      headerName: "Routine due @ R/H",
      field: "next_due_running_hours",
      flex: 1.2,
    },
    {
      headerName: "Operating hours due for routine",
      field: "running_hours_available",
      flex: 1.4,
    },
    {
      headerName: "Maintops No",
      field: "maintop_no",
      flex: 1,
    },
    {
      headerName: "Total Routines Qty (as per MAINTOPS)",
      field: "total_sub_routines",
      flex: 1.2,
    },
    {
      headerName: "Dockyard Routines Qty",
      field: "dyd_routine_count",
      flex: 1.2,
    },
    {
      headerName: "Remarks",
      field: "remarks",
      flex: 1.5,
    },
    {
      headerName: "Action",
      field: "id",
      flex: 1,
      pinned: "right",
      minWidth: 62,
      maxWidth: 100,
      cellRenderer: SearchRoutineActionRendererComponent,
      cellRendererParams: {
        onClick: (data: RoutineItem) => this.downloadMaintopPdf(data),
      },
    },
  ];

  ngOnInit(): void {
    this.loadSubDepartmentOptions();
    this.getSearchPlanData();

    this.searchForm.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      )
      .subscribe(({ sub_department }) => {
        this.loadEquipmentOptions(sub_department);
        this.getSearchPlanData();
      });
  }

  private loadSubDepartmentOptions(): void {
    this.api.getEmsSections().subscribe({
      next: (response) => {
        this.subDepartmentOptions.set(
          Object.entries(response.section_name ?? {})
            .filter(([label]) => label !== "")
            .map(([label, value]) => ({
              label,
              value,
            })),
        );
      },
      error: (error: unknown) => console.error("EMS Sections API Error:", error),
    });
  }

  private loadEquipmentOptions(sectionId?: number | string | null): void {
    this.api.getEmsEquipmentNames(sectionId || undefined).subscribe({
      next: (response) => {
        this.equipmentOptions.set(
          Object.entries(response.equipment_name ?? {})
            .filter(([label]) => label !== "")
            .map(([label, value]) => ({
              label,
              value,
            })),
        );
      },
      error: (error: unknown) => console.error("EMS Equipment Name API Error:", error),
    });
  }

  // All filters (including free-text search) are sent to the backend on every change.
  // NOTE: backend api/v1/ems/search/ does not yet read the `search` param — needs server-side support.
  private getSearchPlanData(page = 1, pageSize = this.currentPageSize): void {
    const { sub_department, equipment, routine_type, routine_name, search } =
      this.searchForm.getRawValue();

    this.currentPage = page;
    this.currentPageSize = pageSize;

    this.isLoading.set(true);
    this.api
      .getSearchPlanData({
        subDepartment: sub_department || undefined,
        equipment: equipment || undefined,
        routineType: routine_type || undefined,
        routineName: routine_name || undefined,
        search: search || undefined,
        page,
        pageSize,
      })
      .subscribe({
        next: (response: EmsSearchPlanResponse) => {
          const data = (response?.results ?? []).map((item) => this.toRoutineItem(item));
          this.routines.set(data);
          this.totalRowCount.set(response?.count ?? 0);
          this.setHeaderStats(data);
          this.setRoutineNameOptions(data);
        },
        error: (error: unknown) => {
          console.error("Search Routine API Error:", error);
          this.routines.set([]);
          this.totalRowCount.set(0);
        },
        complete: () => {
          this.isLoading.set(false);
        },
      });
  }

  onPageRequested(event: { page: number; pageSize: number }): void {
    this.getSearchPlanData(event.page, event.pageSize);
  }

  private toRoutineItem(item: EmsSearchResultItem): RoutineItem {
    return {
      id: item.pk,
      section_id: 0,
      section_name: item.section,
      equipment_id: 0,
      equipment_name: item.equipment_name,
      routine_type: "",
      routine_name: item.routine_name,
      maintop_no: item.maintop_no,
      total_sub_routines: item.total_sub_routines ?? "-",
      dyd_routine_count: item.dyd_routine_count ?? item.dyd_routines ?? "-",
      last_routine_date: item.last_routine_date,
      next_due_date: item.date,
      last_routine_running_hours: String(item.last_routine_running_hrs ?? ""),
      next_due_running_hours: String(item.next_due_running_hrs ?? ""),
      total_running_hours: String(item.total_running_hrs ?? ""),
      running_hours_updated_till: item.running_hrs_updated_tilldate,
      running_hours_available: String(item.running_hrs_available ?? ""),
      due_status: item.due_status === "-" ? "NA" : item.due_status,
      due_bucket: item.due_status,
      status_color: item.status_color,
      remarks: item.remarks ?? "-",
    };
  }

  private setHeaderStats(routines: RoutineItem[]): void {
    let due = 0;
    let dueLessThan3M = 0;
    let due3To6M = 0;
    let other = 0;

    for (const routine of routines) {
      if (routine.status_color === STATUS_COLOR_DUE) due++;
      else if (routine.status_color === STATUS_COLOR_DUE_LT_3M) dueLessThan3M++;
      else if (routine.status_color === STATUS_COLOR_DUE_3_6M) due3To6M++;
      else other++;
    }

    this.headerStats.set({ due, dueLessThan3M, due3To6M, other });
  }

  private setRoutineNameOptions(routines: RoutineItem[]): void {
    const names = new Set(routines.map((routine) => routine.routine_name).filter(Boolean));
    this.routineNameOptions.set([...names].map((name) => ({ label: name, value: name })));
  }

  clearFilters(): void {
    this.searchForm.reset();

    this.searchForm.patchValue({
      sub_department: null,
      equipment: null,
      routine_type: null,
      routine_name: null,
      search: "",
    });

    this.equipmentOptions.set([]);
    this.getSearchPlanData();
  }

  onRowClicked(routine: unknown): void {
    this.router.navigate(["/afterAuth/op-maintenance/routine/due-routines"], {
      state: {
        routine,
      },
    });
  }

  /** Actions column icon — downloads the Maintop PDF instead of navigating (the
   * renderer already stops the click from bubbling up into the grid's `rowClicked`,
   * which is what drives the row-click navigation to Due Routines). */
  downloadMaintopPdf(data: RoutineItem): void {
    this.call.getMaintopPdf(data.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      },
      error: (error: unknown) => {
        console.error(error);
        this.toastr.error("Failed to load Maintop PDF");
      },
    });
  }

  private get printColumns(): PrintColumn[] {
    return this.columnDefs
      .filter((c): c is typeof c & { field: string } => !!c.field && c.field !== "id")
      .map((c) => ({ header: String(c.headerName ?? c.field), field: c.field }));
  }

  onExport(kind: ExportKind): void {
    const rows = this.routines() as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(this.printColumns, rows, "search-routines.csv");
      return;
    }
    this.exportService.printRows("Search Routines", this.printColumns, rows);
  }
}
