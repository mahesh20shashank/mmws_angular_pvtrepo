import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { Subject, debounceTime, distinctUntilChanged } from "rxjs";
import { MasterCard } from "../../../refit-maintenance/master-card/master-card";
import { OperationalMaintenanceApi } from "../../services/operational-maintenance-api";
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { Routine, RoutineResponse } from "./calendar-based-routines.model";
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ExportKind, ExportToolbar } from "../../../../shared/components/export-toolbar/export-toolbar";
import { Router } from "@angular/router";
import { ButtonComponent } from "../../../../shared/components";
import { PrintColumn, ReportExportService } from "../../../../Core/services/export/generic-export.service";

@Component({
  selector: "app-calendar-based-routines",
  standalone: true,
  imports: [CommonModule, MasterCard, DataGrid, IconComponent, ExportToolbar, ButtonComponent],
  templateUrl: "./calendar-based-routines.html",
  styleUrls: ["./calendar-based-routines.css"],
})
export class CalendarBasedRoutines implements OnInit {
   private route = inject(Router)

  private api = inject(OperationalMaintenanceApi);
  private toastr = inject(NotificationService);
  private exportService = inject(ReportExportService);
  readonly exportBusy = signal<ExportKind | null>(null);
  readonly isLoading = signal(false);

  filteredMaintopRoutines = signal<Routine[]>([]);
  searchText = '';

  private readonly searchChanged = new Subject<string>();

  ngOnInit(): void {
    this.loadCalendarBasedRoutines();

    this.searchChanged.pipe(debounceTime(300), distinctUntilChanged()).subscribe((search) => {
      this.loadCalendarBasedRoutines(search);
    });
  }

  loadCalendarBasedRoutines(search?: string): void {
    this.isLoading.set(true);
    this.api.getCalenderRoutinesData(search).subscribe({
      next: (res: RoutineResponse) => {
        this.filteredMaintopRoutines.set(res.result ?? [])
      },
      error: (err) => {
        console.error(err);
        this.toastr.error("Failed to load Calendar Based Routines");
        this.isLoading.set(false);
      },
      complete: () => {
        this.isLoading.set(false);
      },
    });
  }

  defectColumnDefs = [
    {
      headerName: "Sub-Department",
      field: "sub_department",
      flex: 1.5,
    },
    {
      headerName: "Equipment Nomenclature",
      field: "equipment_nomenclature",
      flex: 2,
    },
    {
      headerName: "Routine Name",
      field: "routine_name",
      flex: 2,
    },
    {
      headerName: "Routine Status",
      field: "routine_status",
      flex: 1.5,
    },
    {
      headerName: "Total SS Routines",
      field: "total_ss_routines",
      flex: 1,
    },
    {
      headerName: "Total DYD Routines",
      field: "total_dyd_routines",
      flex: 1,
    },
    {
      headerName: "Last Routine Completion Date",
      field: "last_routine_completion_date",
      flex: 2,
    },
    {
      headerName: "Next Due Date",
      field: "next_due_date",
      flex: 2,
    },
    {
      headerName: "MAINTOP No",
      field: "maintop_no",
      flex: 1.5,
    },
    {
      headerName: "Total Sub-routines",
      field: "total_sub_routines",
      flex: 1.5,
    },
  ];
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
    if (this.exportBusy()) return;
    const rows = this.filteredMaintopRoutines() as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(this.printColumns, rows, "calendar-based-routines.csv");
      return;
    }
    if (kind === "pdf") {
      this.exportBusy.set("pdf");
      setTimeout(() => {
        try {
          this.exportService.downloadPdf("Calendar Based Routines", this.printColumns, rows, "calendar-based-routines");
        } finally {
          this.exportBusy.set(null);
        }
      });
      return;
    }
    this.exportService.printRows("Calendar Based Routines", this.printColumns, rows);
  }
  goBackToList() {
    this.route.navigateByUrl('afterAuth/op-maintenance/routine/dashboard')
  }
}
