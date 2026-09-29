import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CommonModule } from "@angular/common";
import { Component, inject, OnInit, signal } from "@angular/core";
import { Router } from "@angular/router";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { Subject, debounceTime, distinctUntilChanged } from "rxjs";

import { MasterCard } from "../../../refit-maintenance/master-card/master-card";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { OperationalMaintenanceApi } from "../../services/operational-maintenance-api";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { SelectInput } from "../../../../shared/components/select-input/select-input";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { ExportKind, ExportToolbar } from "../../../../shared/components/export-toolbar/export-toolbar";
import { PrintColumn, ReportExportService } from "../../../../Core/services/export/generic-export.service";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";

import { FUSSTriggerListResponse, FUSSTriggerRoutine } from "../fuss-triger-list/fuss-trigger-list.model";
import { FussStatusRendererComponent } from '../../action-forms/fuss-status-renderer';

const HELP_HTML = `
  <p class="mb-0">This list shows routines that are overdue and need a FUSS raised. Search or filter by sub-department, equipment or routine type to find the ones you need.</p>
`;

@Component({
  selector: "app-fuss-trigger-list",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MasterCard, DataGrid, SelectInput, IconComponent, ExportToolbar, HelpGuidance, ButtonComponent],
  templateUrl: "./fuss-trigger-list.html",
  styleUrl: "./fuss-trigger-list.css",
})
export class FUSSTriggerList implements OnInit {
  readonly helpHtml = HELP_HTML;

  private router = inject(Router);
  private api = inject(OperationalMaintenanceApi);
  private fb = inject(FormBuilder);
  private toastr = inject(NotificationService);
  private exportService = inject(ReportExportService);

  readonly isLoading = signal(false);
  readonly exportBusy = signal<ExportKind | null>(null);

  filterForm = this.fb.group({
    subDept: [""],
    equipment: [""],
    routineName: [""],
  });

  subDeptOptions: { label: string; value: string }[] = [];
  equipmentOptions: { label: string; value: string }[] = [];
  routineNameOptions: { label: string; value: string }[] = [];

  searchText = "";

  rows = signal<FUSSTriggerRoutine[]>([]);
  readonly totalRowCount = signal(0);
  readonly filterVersion = signal(0);

  private currentPage = 1;
  private currentPageSize = 10;

  private readonly filtersChanged = new Subject<void>();
  private readonly searchChanged = new Subject<string>();

  columnDefs = [
    { headerName: "Sub Dept", field: "sub_dept", flex: 1.5 },
    { headerName: "Equipment Nomenclature", field: "equipment_nomenclature", flex: 2 },
    { headerName: "Routine Name", field: "routine_name", flex: 2 },
    { headerName: "Status", field: "status", flex: 1, cellRenderer: FussStatusRendererComponent, },
    { headerName: "Prev Completion Date", field: "prev_completion_date", flex: 1.5 },
    { headerName: "Next Due Date", field: "next_due_date", flex: 1.5 },
    { headerName: "RHSI", field: "rhsi", flex: 1 },
    { headerName: "Routine Due At RH", field: "routine_due_at_rh", flex: 1.3 },
    { headerName: "Maintops No", field: "maintops_no", flex: 1.3 },
    { headerName: "Total Sub Routines", field: "total_sub_subroutines", flex: 1.3 },
    { headerName: "SS Routines", field: "ss_routines", flex: 1 },
    { headerName: "DYD Routines", field: "dyd_routines", flex: 1 },
  ];

  ngOnInit(): void {
    this.loadFussTriggerList();

    this.filtersChanged.pipe(debounceTime(300)).subscribe(() => {
      this.loadFussTriggerList(1, this.currentPageSize);
    });

    this.filterForm.valueChanges.subscribe(() => {
      this.filtersChanged.next();
    });

    this.searchChanged.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => {
      this.loadFussTriggerList(1, this.currentPageSize);
    });
  }

  loadFussTriggerList(page = this.currentPage, pageSize = this.currentPageSize): void {
    const { subDept, equipment, routineName } = this.filterForm.getRawValue();

    this.isLoading.set(true);
    this.api
      .getFUSSTriggerListRoutinesData({
        subDept: subDept || undefined,
        equipment: equipment || undefined,
        routineName: routineName || undefined,
        search: this.searchText.trim() || undefined,
        page,
        pageSize,
      })
      .subscribe({
        next: (res: FUSSTriggerListResponse) => {
          this.currentPage = page;
          this.currentPageSize = pageSize;
          this.filterVersion.update((v) => v + 1);

          this.rows.set(res.results ?? []);
          this.totalRowCount.set(res.count ?? 0);

          this.subDeptOptions = (res.equipment_sections ?? [])
            .filter((item) => item !== "")
            .map((item) => ({ label: item, value: item }));

          this.equipmentOptions = (res.equipments_names ?? [])
            .filter((item) => item !== "")
            .map((item) => ({ label: item, value: item }));

          this.routineNameOptions = (res.routine_names ?? [])
            .filter((item) => item !== "")
            .map((item) => ({ label: item, value: item }));
        },
        error: (err) => {
          console.error(err);
          this.toastr.error("Failed to load FUSS Trigger List");
          this.rows.set([]);
          this.totalRowCount.set(0);
        },
        complete: () => {
          this.isLoading.set(false);
        },
      });
  }

  onSearch(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value;
    this.searchChanged.next(this.searchText);
  }

  clearFilters(): void {
    this.filterForm.reset({ subDept: "", equipment: "", routineName: "" });
    this.searchText = "";
    this.loadFussTriggerList(1, this.currentPageSize);
  }

  onPageRequested(event: { page: number; pageSize: number }): void {
    this.loadFussTriggerList(event.page, event.pageSize);
  }

  navigateToRaiseFuss(row: FUSSTriggerRoutine): void {
    this.router.navigate(
      ["/afterAuth/op-maintenance/routine/fuss-triger-raise-fuss"],
      { state: { selectedIds: row.sr_ids } },
    );
  }

  private get printColumns(): PrintColumn[] {
    return this.columnDefs
      .filter((c) => !!c.field)
      .map((c) => ({ header: String(c.headerName ?? c.field), field: c.field }));
  }

  onExport(kind: ExportKind): void {
    const rows = this.rows() as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(this.printColumns, rows, "fuss-trigger-list.csv");
      return;
    }
    this.exportService.printRows("FUSS Trigger List", this.printColumns, rows);
  }
   goBackToList(){
    this.router.navigateByUrl('afterAuth/op-maintenance/routine/dashboard')
  }
}
