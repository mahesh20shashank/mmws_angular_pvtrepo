import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CommonModule } from "@angular/common";
import { Component, inject, OnInit, signal } from "@angular/core";
import { Router } from "@angular/router";
import { Subject, debounceTime, distinctUntilChanged, firstValueFrom } from "rxjs";

import { MasterCard } from "../../../refit-maintenance/master-card/master-card";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { OperationalMaintenanceApi } from "../../services/operational-maintenance-api";
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { SelectInput } from "../../../../shared/components/select-input/select-input";

import { FUSSRaisedRoutine } from "./fuss-trigger-list.model";
import { FussStatusRendererComponent } from "../../action-forms/fuss-status-renderer";
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ExportKind, ExportToolbar } from "../../../../shared/components/export-toolbar/export-toolbar";
import { PrintColumn, ReportExportService } from "../../../../Core/services/export/generic-export.service";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";

const HELP_HTML = `
  <p class="mb-0">Search routines by sub-department, equipment or routine type to find those due for a FUSS. Click a row to raise a FUSS for it, or use "Sync With CMMS" to pull the latest routine status from CMMS.</p>
`;

@Component({
  selector: "app-fuss-triger-list",
  standalone: true,
  imports: [CommonModule, MasterCard, DataGrid, SelectInput, ReactiveFormsModule, IconComponent, ExportToolbar, HelpGuidance, ButtonComponent],
  templateUrl: "./fuss-triger-list.html",
  styleUrl: "./fuss-triger-list.css",
})
export class FUSSTrigerList implements OnInit {
  readonly helpHtml = HELP_HTML;

  private readonly router = inject(Router);

  private readonly api = inject(OperationalMaintenanceApi);
  private readonly fb = inject(FormBuilder);
  private readonly toastr = inject(NotificationService);
  private readonly exportService = inject(ReportExportService);
  readonly exportBusy = signal<ExportKind | null>(null);

  fussTriggerForm = this.fb.group({
    equipmentSection: [""],
    equipmentName: [""],
    routineName: [""],
  });

  equipmentSectionOptions: { label: string; value: string }[] = [];
  equipmentNameOptions: { label: string; value: string }[] = [];
  routineNameOptions: { label: string; value: string }[] = [];

  searchText = "";

  // List from GET api/v1/ems/fuss_raised_routines/ for the current search term (server-side,
  // debounced). Dropdown filters and pagination are still applied here on the client.
  private allRoutines: FUSSRaisedRoutine[] = [];

  filteredMaintopRoutines = signal<FUSSRaisedRoutine[]>([])
  readonly totalRowCount = signal(0);
  private currentPage = 1;
  private currentPageSize = 10;

  private readonly filtersChanged = new Subject<void>();
  private readonly searchChanged = new Subject<string>();

  defectColumnDefs = [
    {
      headerName: "Sub-Department",
      field: "department",
      flex: 1.5,
    },
    {
      headerName: "Equipment Nomenclature",
      field: "equipment",
      flex: 2,
    },
    {
      headerName: "Routine Name",
      field: "routine_name",
      flex: 2.5,
    },
    {
      headerName: "Status",
      field: "status",
      flex: 1,
      cellRenderer: FussStatusRendererComponent,
    },
    {
      headerName: "Maintop No",
      field: "maintop_no",
      flex: 1.5,
    },
    {
      headerName: "Routine by DYD",
      field: "routines_by_dyd",
      flex: 1,
    },
    {
      headerName: "Routines by SS",
      field: "routines_by_ss",
      flex: 1,
    },
    {
      headerName: "Total Routines",
      field: "total_routines",
      flex: 1.5,
    },
    {
      headerName: "Routines Due",
      field: "routines_due",
      flex: 1,
    },
  ];

  ngOnInit(): void {
    this.getFUSSTriggerList();

    // Dropdown filters/pagination happen client-side against `allRoutines` — debounce
    // so rapid dropdown changes don't re-run the filter more than necessary.
    this.filtersChanged.pipe(debounceTime(300)).subscribe(() => {
      this.resetToFirstPage();
    });

    this.fussTriggerForm.valueChanges.subscribe(() => {
      this.filtersChanged.next();
    });

    // Search text is sent to the backend — debounce so we don't fire an API call on
    // every keystroke.
    this.searchChanged.pipe(debounceTime(300), distinctUntilChanged()).subscribe((search) => {
      this.getFUSSTriggerList(search);
    });
  }

  // Bumped whenever filters/search reset the result set to page 1 — bound to the grid's
  // `resetKey` so its own internal page tracker snaps back in step instead of the footer
  // showing a stale page number (e.g. "page 3") for a freshly filtered page-1 result.
  readonly filterVersion = signal(0);

  private resetToFirstPage(): void {
    this.filterVersion.update((v) => v + 1);
    this.applyFilters(1, this.currentPageSize);
  }

  clearFilters(): void {
    this.fussTriggerForm.reset();
    if (this.searchText) {
      this.searchText = "";
      this.getFUSSTriggerList("");
    } else {
      this.resetToFirstPage();
    }
  }

  readonly syncingCmms = signal(false);
  readonly isLoading = signal(false);

  async syncWithCmms(): Promise<void> {
    if (this.syncingCmms()) return;

    this.syncingCmms.set(true);
    try {
      await firstValueFrom(this.api.initiateFussCmmsSync());
      // this.toastr.success("FUSS records synced with CMMS.");
      this.getFUSSTriggerList(this.searchText);
    } catch (error) {
      console.error(error);
      this.toastr.error("Failed to sync with CMMS. Please try again.", "CMMS Sync Failed");
    } finally {
      this.syncingCmms.set(false);
    }
  }

  onSearch(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value;
    this.searchChanged.next(this.searchText);
  }

  getFUSSTriggerList(search?: string): void {
    this.isLoading.set(true);
    this.api.getFUSSRaisedRoutines({ search }).subscribe({
      next: (response) => {
        this.allRoutines = response?.fuss_list ?? [];

        this.equipmentSectionOptions = (response?.departments ?? [])
          .filter((item) => item !== '')
          .map((item) => ({
            label: item,
            value: item,
          }));

        this.equipmentNameOptions = (response?.equipments ?? [])
          .filter((item) => item !== '')
          .map((item) => ({
            label: item,
            value: item,
          }));

        this.routineNameOptions = (response?.routine_types ?? [])
          .filter((item) => item !== '')
          .map((item) => ({
            label: item,
            value: item,
          }));

        this.resetToFirstPage();
      },
      error: (error) => {
        console.error(error);
        this.toastr.error("Failed to load Raised FUSS list", "Error");
        this.allRoutines = [];
        this.filteredMaintopRoutines.set([]);
        this.totalRowCount.set(0);
      },
      complete: () => {
        this.isLoading.set(false);
      },
    });
  }

  private filterRoutines(): FUSSRaisedRoutine[] {
    const { equipmentSection, equipmentName, routineName } =
      this.fussTriggerForm.getRawValue();

    return this.allRoutines.filter((row) => {
      if (equipmentSection && row.department !== equipmentSection) return false;
      if (equipmentName && row.equipment !== equipmentName) return false;
      if (routineName && row.routine_name !== routineName) return false;

      return true;
    });
  }

  private applyFilters(page: number, pageSize: number): void {
    const filtered = this.filterRoutines();

    this.currentPage = page;
    this.currentPageSize = pageSize;
    this.totalRowCount.set(filtered.length);

    const start = (page - 1) * pageSize;
    this.filteredMaintopRoutines.set(filtered.slice(start, start + pageSize));
  }

  onPageRequested(event: { page: number; pageSize: number }): void {
    this.applyFilters(event.page, event.pageSize);
  }

  navigateTo(url: string): void {
    this.router.navigateByUrl(url);
  }

  onRowClicked(row: FUSSRaisedRoutine): void {
    if (!row?.routine_name) return;

    this.router.navigate(
      ["/afterAuth/op-maintenance/routine/fuss-raised-details"],
      { state: { routineName: row.routine_name } },
    );
  }

  private get printColumns(): PrintColumn[] {
    return this.defectColumnDefs
      .filter((c) => !!c.field)
      .map((c) => ({ header: String(c.headerName ?? c.field), field: c.field }));
  }

  onExport(kind: ExportKind): void {
    // Export the full filtered result set, not just the page currently on screen.
    const rows = this.filterRoutines() as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(this.printColumns, rows, "fuss-trigger-list.csv");
      return;
    }
    this.exportService.printRows("FUSS Trigger List", this.printColumns, rows);
  }
}
