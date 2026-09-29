import { CommonModule } from "@angular/common";
import { Component, inject, OnInit, signal } from "@angular/core";
import { Subject, debounceTime, distinctUntilChanged } from "rxjs";
import { MasterCard } from "../../../refit-maintenance/master-card/master-card";
import { OperationalMaintenanceApi } from "../../services/operational-maintenance-api";
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ExportKind, ExportToolbar } from "../../../../shared/components/export-toolbar/export-toolbar";
import { PrintColumn, ReportExportService } from "../../../../Core/services/export/generic-export.service";
import {
  Routine,
  RoutineResponse,
} from "../calendar-based-routines/calendar-based-routines.model";
import { ButtonComponent } from "../../../../shared/components";
import { Router } from "@angular/router";

@Component({
  selector: "app-r-h-routines",
  standalone: true,
  imports: [CommonModule, MasterCard, DataGrid, IconComponent, ExportToolbar, ButtonComponent],
  templateUrl: "./r-h-routines.html",
  styleUrl: "./r-h-routines.css",
})
export class RHRoutines implements OnInit {
   private route = inject(Router)

  filteredMaintopRoutines = signal<Routine[]>([]);
  searchText = "";
  private api = inject(OperationalMaintenanceApi);
  private toastr = inject(NotificationService);
  private exportService = inject(ReportExportService);
  readonly exportBusy = signal<ExportKind | null>(null);
  readonly isLoading = signal(false);
  private readonly searchChanged = new Subject<string>();

  defectColumnDefs = [
    {
      headerName: "PK",
      field: "pk",
      flex: 1,
    },
    {
      headerName: "Routine Name",
      field: "routine_name",
      flex: 2,
    },
    {
      headerName: "Section",
      field: "section",
      flex: 1.5,
    },
    {
      headerName: "Equipment Name",
      field: "equipment_name",
      flex: 1.5,
    },
    {
      headerName: "Maintop No",
      field: "maintop_no",
      flex: 1,
    },
    {
      headerName: "Last Routine RH",
      field: "last_routine_running_hrs",
      flex: 1,
    },
    {
      headerName: "Next Due RH",
      field: "next_due_running_hrs",
      flex: 1,
    },
    {
      headerName: "Total Running Hrs",
      field: "total_running_hrs",
      flex: 1,
    },
    {
      headerName: "Running Hrs Available",
      field: "running_hrs_available",
      flex: 1,
    },
    {
      headerName: "Updated Till Date",
      field: "running_hrs_updated_tilldate",
      flex: 1.5,
    },
  ];

  ngOnInit(): void {
    this.loadRHBasedRoutines();

    this.searchChanged.pipe(debounceTime(300), distinctUntilChanged()).subscribe((search) => {
      this.loadRHBasedRoutines(search);
    });
  }

  loadRHBasedRoutines(search?: string): void {
    this.isLoading.set(true);
    this.api.getRHBasedRoutinesData(search).subscribe({
      next: (res: RoutineResponse) => {
        this.filteredMaintopRoutines.set(res.result ?? [])
      },
      error: (err) => {
        console.error(err);
        this.toastr.error("Failed to load R/H Based Routines");
        this.isLoading.set(false);
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

  private get printColumns(): PrintColumn[] {
    return this.defectColumnDefs
      .filter((c) => !!c.field)
      .map((c) => ({ header: String(c.headerName ?? c.field), field: c.field }));
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredMaintopRoutines() as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(this.printColumns, rows, "rh-based-routines.csv");
      return;
    }
    this.exportService.printRows("R/H Based Routines", this.printColumns, rows);
  }
  goBackToList() {
    this.route.navigateByUrl('afterAuth/op-maintenance/routine/dashboard')
  }
}
