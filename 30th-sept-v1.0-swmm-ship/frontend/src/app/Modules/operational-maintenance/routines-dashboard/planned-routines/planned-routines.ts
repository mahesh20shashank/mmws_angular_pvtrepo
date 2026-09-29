import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ColDef, CellCallbackParams, RowData } from 'ag-grid-community';
import { debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs';

import { MasterCard } from '../../../refit-maintenance/master-card/master-card';
import { SelectInput } from '../../../../shared/components/select-input/select-input';
import { DataGrid } from '../../../../shared/components/data-grid/data-grid';

import { OperationalMaintenanceApi } from '../../services/operational-maintenance-api';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ExportKind, ExportToolbar } from '../../../../shared/components/export-toolbar/export-toolbar';
import { PrintColumn, ReportExportService } from '../../../../Core/services/export/generic-export.service';
import { HelpGuidance } from '../../../../shared/components/help-guidance/help-guidance';
import { FussStatusRendererComponent } from '../../action-forms/fuss-status-renderer';

const HELP_HTML = `
  <p class="mb-0">Search and list routines already planned for execution. Filter by section, equipment, routine category, due month or running hours, then click a result row to open its planned routine detail.</p>
`;

export interface PlannedRoutineItem {
  pk: number;
  routine_name: string;
  section: string;
  equipment_name: string;
  maintop_no: string;
  last_routine_date: string;
  date: string;
  last_routine_running_hrs: number | string;
  next_due_running_hrs: number | string;
  total_running_hrs: number | string;
  running_hrs_updated_tilldate: number | string;
  running_hrs_available: number | string;
  valid_upto?: string;
  total_routines?: number | string;
  total_sub_routines?: number | string;
  ss_routines?: number | string;
  total_ss_routines?: number | string;
  dyd_routines?: number | string;
  total_dyd_routines?: number | string;
  rhsi?: number | string;
  due_status?: string;
  status_color?: string;
  remarks?: string;
}

export interface FilterOptionItem {
  id: number | string;
  name: string;
}

export interface PlannedRoutinesFilterOptions {
  sub_departments?: FilterOptionItem[];
  equipments?: FilterOptionItem[];
  routine_types?: FilterOptionItem[];
}

interface SelectOption {
  label: string;
  value: number | string;
}

@Component({
  selector: 'app-planned-routines',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MasterCard, SelectInput, DataGrid, IconComponent, ExportToolbar, HelpGuidance, ButtonComponent],
  templateUrl: './planned-routines.html',
  styleUrl: './planned-routines.css',
})
export class PlannedRoutines implements OnInit {
  readonly helpHtml = HELP_HTML;
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(OperationalMaintenanceApi);
  private readonly router = inject(Router);
  private readonly exportService = inject(ReportExportService);
  readonly exportBusy = signal<ExportKind | null>(null);

  searchForm!: FormGroup;

  readonly filteredRoutines = signal<PlannedRoutineItem[]>([]);
  readonly subDepartmentOptions = signal<SelectOption[]>([]);
  readonly equipmentOptions = signal<SelectOption[]>([]);
  readonly routineTypeOptions = signal<SelectOption[]>([]);
  readonly totalRowCount = signal(0);
  private currentPage = 1;
  private currentPageSize = 10;

  readonly syncingCmms = signal(false);
  readonly isLoading = signal(false);

  columnDefs: ColDef[] = [];

  ngOnInit(): void {
    this.initializeForm();
    this.initializeColumns();
    this.getPlannedRoutines();
  }

  initializeForm(): void {
    this.searchForm = this.fb.group({
      subDept: [''],
      equipment: [''],
      routineType: [''],
      search: [''],
    });

    // Every field here — including free-text search — is sent straight to the
    // backend; there is no client-side filtering of the loaded rows.
    this.searchForm.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)))
      .subscribe(() => {
        this.getPlannedRoutines();
      });
  }

  initializeColumns(): void {
    this.columnDefs = [
      {
        headerName: 'Sub Dept',
        field: 'section',
        flex: 1,
      },
      {
        headerName: 'Equipment Nomenclature',
        field: 'equipment_name',
        flex: 2,
      },
      {
        headerName: 'Routine Name',
        field: 'routine_name',
        flex: 2,
      },
      {
        headerName: 'Status',
        field: 'due_status',
        flex: 1.8,
        minWidth: 300,
        cellRenderer: FussStatusRendererComponent,
        valueGetter: (params: CellCallbackParams) =>
          (params.data as PlannedRoutineItem)?.due_status || 'NA',
      },
      {
        headerName: 'Previous Routine Completion Date',
        field: 'last_routine_date',
        flex: 1.2,
        valueGetter: (params: CellCallbackParams) =>
          (params.data as PlannedRoutineItem)?.last_routine_date || 'NA',
      },
      {
        headerName: 'Next Routine Due Date',
        field: 'date',
        flex: 1.2,
        valueGetter: (params: CellCallbackParams) =>
          (params.data as PlannedRoutineItem)?.date || 'NA',
      },
      {
        headerName: 'Total R/H updated upto',
        field: 'running_hrs_updated_tilldate',
        flex: 1.3,
        valueGetter: (params: CellCallbackParams) =>
          (params.data as PlannedRoutineItem)?.running_hrs_updated_tilldate || 'NA',
      },
      {
        headerName: 'RHSI',
        field: 'total_running_hrs',
        flex: 1.2,
        valueGetter: (params: CellCallbackParams) => {
          const item = params.data as PlannedRoutineItem | undefined;
          return item?.rhsi ?? item?.total_running_hrs ?? 'NA';
        },
      },
      {
        headerName: 'Routine Completed @ R/H',
        field: 'last_routine_running_hrs',
        flex: 1.3,
        valueGetter: (params: CellCallbackParams) =>
          (params.data as PlannedRoutineItem)?.last_routine_running_hrs ?? 'NA',
      },
      {
        headerName: 'Routine due @ R/H',
        field: 'next_due_running_hrs',
        flex: 1.2,
        valueGetter: (params: CellCallbackParams) =>
          (params.data as PlannedRoutineItem)?.next_due_running_hrs ?? 'NA',
      },
      {
        headerName: 'Maintops No',
        field: 'maintop_no',
        flex: 1,
      },
      {
        headerName: 'SS Routines',
        field: 'ss_routines',
        flex: 1,
        valueGetter: (params: CellCallbackParams) => {
          const item = params.data as PlannedRoutineItem | undefined;
          return item?.ss_routines ?? item?.total_ss_routines ?? 'NA';
        },
      },
      {
        headerName: 'DYD routines',
        field: 'dyd_routines',
        flex: 1,
        valueGetter: (params: CellCallbackParams) => {
          const item = params.data as PlannedRoutineItem | undefined;
          return item?.dyd_routines ?? item?.total_dyd_routines ?? 'NA';
        },
      },
    ];
  }

  private parseDate(dateStr?: string): Date | null {
    if (!dateStr || dateStr === '-' || dateStr === 'NA') return null;
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  private calculateDueStatus(item: PlannedRoutineItem): { due_status: string; status_color: string } {
    const rawRunningHrs = item.running_hrs_available;
    const runningHrs = rawRunningHrs !== undefined && rawRunningHrs !== null && rawRunningHrs !== '' && rawRunningHrs !== 'NA' && rawRunningHrs !== '-'
      ? Number(rawRunningHrs)
      : null;

    const nextDueDate = this.parseDate(item.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let diffMonths: number | null = null;
    if (nextDueDate) {
      const diffTime = nextDueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      diffMonths = diffDays / 30;
    }

    if ((runningHrs !== null && runningHrs <= 0) || (diffMonths !== null && diffMonths <= 0)) {
      return {
        due_status: 'Routines Due',
        status_color: '#FF9999',
      };
    }

    if ((runningHrs !== null && runningHrs > 0 && runningHrs <= 500) || (diffMonths !== null && diffMonths > 0 && diffMonths <= 3)) {
      return {
        due_status: 'due in < 500 Hrs',
        status_color: '#f7e687',
      };
    }

    if ((runningHrs !== null && runningHrs > 500 && runningHrs < 1000) || (diffMonths !== null && diffMonths > 3 && diffMonths <= 6)) {
      return {
        due_status: 'due in 500 & 1000 running hours OR 3 to 6 months',
        status_color: 'orange',
      };
    }

    return {
      due_status: 'Routines Not Due',
      status_color: '#22c55e',
    };
  }



  async getPlannedRoutines(page = 1, pageSize = this.currentPageSize): Promise<void> {
    const { subDept, equipment, routineType, search } = this.searchForm.value;

    this.currentPage = page;
    this.currentPageSize = pageSize;

    this.isLoading.set(true);
    try {
      const raw = await firstValueFrom(
        this.api.getPlanedRoutines({
          sectionId: subDept || undefined,
          equipmentNameId: equipment || undefined,
          routineCategory: routineType || undefined,
          search: (search || '').trim() || undefined,
          page,
          pageSize,
        })
      );

      const rows = (raw?.results ?? []).map((row: PlannedRoutineItem) => {
        const computed = this.calculateDueStatus(row);
        return {
          ...row,
          due_status: row.due_status && row.due_status !== '-' ? row.due_status : computed.due_status,
          status_color: row.status_color || computed.status_color,
        };
      });
      const filterOptions = raw?.filter_options;

      this.filteredRoutines.set(rows);
      this.totalRowCount.set(raw?.count ?? 0);

      this.subDepartmentOptions.set([
        { label: 'All', value: '' },
        ...(filterOptions?.sub_departments
          ?.filter((item: FilterOptionItem) => item.name !== '')
          .map((item: FilterOptionItem) => ({
            label: item.name,
            value: item.id,
          })) ?? []),
      ]);

      this.equipmentOptions.set([
        { label: 'All', value: '' },
        ...(filterOptions?.equipments
          ?.filter((item: FilterOptionItem) => item.name !== '')
          .map((item: FilterOptionItem) => ({
            label: item.name,
            value: item.id,
          })) ?? []),
      ]);

      this.routineTypeOptions.set([
        { label: 'All', value: '' },
        ...(filterOptions?.routine_types
          ?.filter((item: FilterOptionItem) => item.name !== '')
          .map((item: FilterOptionItem) => ({
            label: item.name,
            value: item.id,
          })) ?? []),
      ]);
    } catch (err: unknown) {
      console.error('Unable to fetch planned routines.', err);
      this.filteredRoutines.set([]);
      this.totalRowCount.set(0);
    } finally {
      this.isLoading.set(false);
    }
  }

  onPageRequested(event: { page: number; pageSize: number }): void {
    void this.getPlannedRoutines(event.page, event.pageSize);
  }

  // The backend's success/error message is surfaced automatically by the global
  // feedbackInterceptor (it toasts whatever `message` the response body carries) — this
  // just fires the call and tracks the button's busy state.
  async syncWithCmms(): Promise<void> {
    if (this.syncingCmms()) return;

    this.syncingCmms.set(true);
    try {
      await firstValueFrom(this.api.syncCompletedRoutines());
    } catch (err: unknown) {
      console.error('Completed routine CMMS sync failed.', err);
    } finally {
      this.syncingCmms.set(false);
    }
  }

  clearFilters(): void {
    this.searchForm.reset({
      subDept: '',
      equipment: '',
      routineType: '',
      search: '',
    });
  }

  onRowClicked(row: RowData): void {
    const pk = (row as unknown as PlannedRoutineItem)?.pk;
    if (!pk) return;

    this.router.navigate(
      ['/afterAuth/op-maintenance/routine/planned-routine-detail'],
      { state: { addRoutineId: pk } },
    );
  }

  private get printColumns(): PrintColumn[] {
    return this.columnDefs
      .filter((c): c is typeof c & { field: string } => !!c.field)
      .map((c) => ({ header: String(c.headerName ?? c.field), field: c.field }));
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredRoutines() as unknown as Record<string, unknown>[];
    if (kind === 'excel') {
      this.exportService.downloadCsv(this.printColumns, rows, 'planned-routines.csv');
      return;
    }
    this.exportService.printRows('Planned Routines', this.printColumns, rows);
  }
}
