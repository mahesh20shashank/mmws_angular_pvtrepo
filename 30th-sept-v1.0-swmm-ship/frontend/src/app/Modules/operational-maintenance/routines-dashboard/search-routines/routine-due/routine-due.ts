import { CommonModule } from "@angular/common";
import { Component, inject, OnInit, signal } from "@angular/core";
import { ColDef } from "ag-grid-community";
import { Subject, debounceTime, distinctUntilChanged } from "rxjs";
import { MasterCard } from "../../../../refit-maintenance/master-card/master-card";
import { DataGrid } from "../../../../../shared/components/data-grid/data-grid";
import { FussStatusRendererComponent } from "../../../action-forms/fuss-status-renderer";
import { RaiseAberRenderer } from "../../../action-forms/raise-aber-renderer/raise-aber-renderer";
import { OperationalMaintenanceApi } from "../../../services/operational-maintenance-api";
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { RoutineDetailItem, SearchDetailResultItem } from "../search-routines.model";
import { FormBuilder, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { IconComponent } from '../../../../../shared/components/icon/icon.component';
import { ExportKind, ExportToolbar } from "../../../../../shared/components/export-toolbar/export-toolbar";
import { PrintColumn, ReportExportService } from "../../../../../Core/services/export/generic-export.service";

interface SelectedRoutineState {
  id: number;
  maintop_no?: string;
  routine_name?: string;
  equipment_name?: string;
}

@Component({
  selector: "app-routine-due",
  standalone: true,
  imports: [CommonModule, MasterCard, ReactiveFormsModule, DataGrid, IconComponent, ExportToolbar],
  templateUrl: "./routine-due.html",
  styleUrl: "./routine-due.css",
})
export class RoutineDue implements OnInit {
  private readonly api = inject(OperationalMaintenanceApi);
  private readonly toastr = inject(NotificationService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly exportService = inject(ReportExportService);
  readonly exportBusy = signal<ExportKind | null>(null);
  readonly isLoading = signal(false);
  readonly maintopRoutines = signal<RoutineDetailItem[]>([]);
  readonly filteredRoutines = signal<RoutineDetailItem[]>([]);
  private readonly selectedRoutine = history.state.routine as SelectedRoutineState | undefined;
  readonly routineForm: FormGroup = this.fb.group({
    maintop_no: [{ value: "", disabled: true }],
    routine_name: [{ value: "", disabled: true }],
    equipment_name: [{ value: "", disabled: true }],
  });

  searchText = "";
  private readonly searchChanged = new Subject<string>();

  ngOnInit(): void {
    if (!this.selectedRoutine?.id) {
      this.toastr.warning("No routine selected.");
      return;
    }

    this.routineForm.patchValue({
      maintop_no: this.selectedRoutine.maintop_no ?? "",
      routine_name: this.selectedRoutine.routine_name ?? "",
      equipment_name: this.selectedRoutine.equipment_name ?? "",
    });

    this.getRoutineDetails(this.selectedRoutine.id);

    this.searchChanged.pipe(debounceTime(300), distinctUntilChanged()).subscribe((search) => {
      if (this.selectedRoutine?.id) this.getRoutineDetails(this.selectedRoutine.id, search);
    });
  }

  onSearch(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value;
    this.searchChanged.next(this.searchText);
  }

  private getRoutineDetails(id: number, search?: string): void {
    this.isLoading.set(true);
    this.api.getRoutineById(id, search).subscribe({
      next: (response) => {
        const items = (response?.result ?? []).map((item) => this.toRoutineDetailItem(item));
        this.maintopRoutines.set(items);
        this.filteredRoutines.set(items);
      },
      error: (error: unknown) => {
        console.error("Unable to fetch routine detail.", error);
        this.toastr.error("Unable to fetch routine detail.");
        this.maintopRoutines.set([]);
        this.filteredRoutines.set([]);
        this.isLoading.set(false);
      },
      complete: () => {
        this.isLoading.set(false);
      },
    });
  }

  private toRoutineDetailItem(item: SearchDetailResultItem): RoutineDetailItem {
    return {
      id: item.pk,
      routine_name: item.routine_name,
      equipment_name: item.equipment_name,
      maintop_no: item.maintop_no,
      dart_number: item.dart_number,
      routine_description: item.routine_description,
      routine_no: item.routine_no,
      previous_routine_completed_date: item.previous_routine_completed_date,
      due_date: item.due_date,
      due_at_rh: String(item.due_at_rh ?? ""),
      previous_completed_at_rh: String(item.previous_completed_at_rh ?? ""),
      action_by: item.action_by,
      due_status: item.due_status,
      due_bucket: item.due_status,
      status_color: item.status_color,
    };
  }

  columnDefs: ColDef[] = [
    {
      headerName: "DART Number",
      field: "dart_number",
      flex: 1,
    },
    {
      headerName: "Status",
      field: "due_status",
      flex: 1.2,
      minWidth: 120,
      cellRenderer: FussStatusRendererComponent,
    },
    {
      headerName: "Routine No",
      field: "routine_no",
      flex: 1.5,
    },
    {
      headerName: "Previous Routine Completion Date",
      field: "previous_routine_completed_date",
      flex: 1.5,
    },
    {
      headerName: "Routine due @ R/H",
      field: "due_date",
      flex: 1.5,
    },
    {
      headerName: "Sub Routine Description",
      field: "routine_description",
      flex: 1.5,
    },
    {
      headerName: "Action By",
      field: "action_by",
      flex: 1.2,
    },
    {
      headerName: "Actions",
      flex: 1,
      sortable: false,
      filter: false,
      pinned: "right",
      cellRenderer: RaiseAberRenderer,
      cellRendererParams: {
        buttonLabel: "Plan Routine",
        onClick: (data: RoutineDetailItem) => this.planRoutine(data),
      },
      width: 180,
    },
  ];

  planRoutine(data: RoutineDetailItem): void {
    this.router.navigate(
      ["/afterAuth/op-maintenance/routine/r-d-plan-routine"],
      {
        state: {
          routine: data,
        },
      },
    );
  }

  private get printColumns(): PrintColumn[] {
    return this.columnDefs
      .filter((c): c is typeof c & { field: string } => !!c.field)
      .map((c) => ({ header: String(c.headerName ?? c.field), field: c.field }));
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredRoutines() as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(this.printColumns, rows, "routines-due.csv");
      return;
    }
    this.exportService.printRows("Routines Due", this.printColumns, rows);
  }
}
