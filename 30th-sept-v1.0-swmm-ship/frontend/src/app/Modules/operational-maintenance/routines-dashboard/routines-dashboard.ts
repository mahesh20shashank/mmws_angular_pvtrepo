import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CommonModule } from "@angular/common";
import { Component, inject, OnInit, signal } from "@angular/core";
import { MasterCard } from "../../refit-maintenance/master-card/master-card";
import { FormBuilder, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { SelectInput } from "../../../shared/components/select-input/select-input";
import { Call } from "../../../Core/http/services/call";
import { OperationalMaintenanceApi } from "../services/operational-maintenance-api";
import { DataGrid } from "../../../shared/components/data-grid/data-grid";
import { UniqueMaintopResponse, UniqueMaintopRoutine } from "./main-top.model";
import { MaintopActionRenderer } from "../../../shared/components/maintop-action-renderer";
import { NotificationService } from '../../../Core/services/notification/notification.service';
import { Subject, catchError, debounceTime, of, switchMap, tap } from "rxjs";
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ExportKind, ExportToolbar } from "../../../shared/components/export-toolbar/export-toolbar";
import { Router } from '@angular/router';
import { PrintColumn, ReportExportService } from "../../../Core/services/export/generic-export.service";

@Component({
  selector: "app-routines-dashboard",
  standalone: true,
  imports: [CommonModule, MasterCard, ReactiveFormsModule, SelectInput, DataGrid, IconComponent, ExportToolbar, ButtonComponent],
  templateUrl: "./routines-dashboard.html",
  styleUrl: "./routines-dashboard.css",
})
export class RoutinesDashboard implements OnInit {
  private route = inject(Router)

  unique_main_top!: FormGroup;
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(OperationalMaintenanceApi);
  private readonly call = inject(Call);
  private readonly toastr = inject(NotificationService);
  private readonly exportService = inject(ReportExportService);
  filteredMaintopRoutines = signal<UniqueMaintopRoutine[]>([])
  readonly exportBusy = signal<ExportKind | null>(null);
  readonly isLoading = signal(false);
  // Bumped on every fetch so `app-data-grid` resets back to page 1 whenever the
  // filters/search narrow the result set — otherwise staying on, say, page 3 of the
  // unfiltered list would show an empty page once filtering shrinks it below that.
  readonly gridResetKey = signal(0);
  searchText = "";
  subDepartmentOptions: { label: string; value: string | number }[] = [];
  equipmentNameOptions: { label: string; value: string | number }[] = [];
  routineCategoryOptions: { label: string; value: string | number }[] = [];
  routineNameOptions: { label: string; value: string | number }[] = [];

  private readonly filtersChanged = new Subject<void>();

  ngOnInit(): void {
    this.initializeForm();
    this.getUniqueMaintopRoutines();

    // Backend does the filtering — debounce so typing/dropdown changes don't fire a
    // request per keystroke/click. `switchMap` (not `subscribe` per call) cancels any
    // still-in-flight request the moment a newer filter change comes in — without it, an
    // earlier request that happens to resolve AFTER a later one could win the race and
    // overwrite the latest (correctly filtered/empty) result with stale data.
    this.filtersChanged
      .pipe(
        debounceTime(300),
        switchMap(() => this.fetchUniqueMaintopRoutines()),
      )
      .subscribe();
  }

  initializeForm(): void {
    this.unique_main_top = this.fb.group({
      subDepartment: [""],
      equipmentName: [""],
      routineCategory: [""],
      routineName: [""],
    });
    this.unique_main_top.valueChanges.subscribe(() => {
      this.filtersChanged.next();
    });
  }

  onSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchText = target.value;
    this.filtersChanged.next();
  }

  getUniqueMaintopRoutines(): void {
    this.fetchUniqueMaintopRoutines().subscribe();
  }

  /** Shared by the initial load and the filter/search pipeline (see `ngOnInit`) — the
   * pipeline needs this as an Observable (not a void call) so `switchMap` can cancel a
   * still-in-flight request when a newer filter change supersedes it. */
  private fetchUniqueMaintopRoutines() {
    const { subDepartment, equipmentName, routineCategory, routineName } =
      this.unique_main_top.getRawValue();

    // Clear the previous result set immediately instead of leaving stale rows on screen
    // while the new (filtered) request is in flight — otherwise a fast follow-up filter
    // change can look like it did nothing until the response actually lands.
    this.filteredMaintopRoutines.set([]);
    this.isLoading.set(true);

    return this.api
      .getUniqueMaintopRoutinesData(
        equipmentName || undefined,
        this.searchText.trim() || undefined,
        subDepartment || undefined,
        routineCategory || undefined,
        routineName || undefined,
      )
      .pipe(
        tap({
          next: (response: UniqueMaintopResponse) => {
            this.filteredMaintopRoutines.set(response.result ?? [])
            this.gridResetKey.update((key) => key + 1);

            this.subDepartmentOptions =
              response.filter_options?.sub_departments
                ?.filter((item) => item.name !== "")
                .map((item) => ({
                  label: item.name,
                  value: item.id,
                })) ?? [];

            this.equipmentNameOptions =
              response.filter_options?.equipment_names
                ?.filter((item) => item !== "")
                .map((item) => ({
                  label: item,
                  value: item,
                })) ?? [];

            this.routineCategoryOptions =
              response.filter_options?.routine_categories
                ?.filter((item) => item !== "")
                .map((item) => ({
                  label: item,
                  value: item,
                })) ?? [];

            this.routineNameOptions =
              response.filter_options?.routine_names
                ?.filter((item) => !!item.routine_brief_description)
                .map((item) => ({
                  label: item.routine_brief_description as string,
                  value: item.routine_id,
                })) ?? [];
          },

          error: (error) => {
            console.error(error);

            this.toastr.error(
              error?.error?.message || "Failed to load Unique Maintop Routines",
            );
            this.isLoading.set(false);
          },
          complete: () => {
            this.isLoading.set(false);
          },
        }),
        catchError(() => of(null)),
      );
  }

  clearFilters(): void {
    this.unique_main_top.reset();
    this.searchText = "";
    this.getUniqueMaintopRoutines();
  }
  defectColumnDefs = [
    { headerName: "INSMA Equipment Name", field: "equipment_name" },
    { headerName: "INSMA Equipment Code", field: "equipment_code" },
    { headerName: "No. of Equipment Nomenclature", field: "eq_count" },
    { headerName: "MAINTOP No.", field: "maintop_no" },
    { headerName: "Total Routines", field: "routine_count" },
    { headerName: "Total Sub Routines", field: "sub_routine_count" },
    { headerName: "No. of DYD Routines", field: "dyd_routine_count" },

    {
      headerName: "Actions",
      field: "pk",
      pinned: "right",
      cellRenderer: MaintopActionRenderer,
      cellRendererParams: {
        onView: (data: UniqueMaintopRoutine) => {
          this.openMaintopDetails(data);
        },
      },
      width: 100,
    },
  ];
  openMaintopDetails(data: UniqueMaintopRoutine): void {
    this.call.getMaintopPdf(data.pk).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      },
      error: (error) => {
        console.error(error);
        this.toastr.error(error?.error?.message || "Failed to load Maintop PDF");
      },
    });
  }

  private get printColumns(): PrintColumn[] {
    return this.defectColumnDefs
      .filter((c): c is typeof c & { field: string } => !!c.field && c.field !== "pk")
      .map((c) => ({ header: String(c.headerName ?? c.field), field: c.field }));
  }

  onExport(kind: ExportKind): void {
    if (this.exportBusy()) return;
    const rows = this.filteredMaintopRoutines() as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(this.printColumns, rows, "unique-maintop-routines.csv");
      return;
    }
    if (kind === "pdf") {
      this.exportBusy.set("pdf");
      setTimeout(() => {
        try {
          this.exportService.downloadPdf("Unique Maintop Routines", this.printColumns, rows, "unique-maintop-routines");
        } finally {
          this.exportBusy.set(null);
        }
      });
      return;
    }
    this.exportService.printRows("Unique Maintop Routines", this.printColumns, rows);
  }
  goBackToList(){
    this.route.navigateByUrl('afterAuth/op-maintenance/routine/dashboard')
  }
}
