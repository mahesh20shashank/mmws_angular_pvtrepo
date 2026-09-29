import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Subject, debounceTime } from 'rxjs';

import { SelectInput } from '../../../../../shared/components/select-input/select-input';
import { DataGrid } from '../../../../../shared/components/data-grid/data-grid';
import { OperationalMaintenanceApi } from '../../../services/operational-maintenance-api';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';
import { ExportKind, ExportToolbar } from '../../../../../shared/components/export-toolbar/export-toolbar';
import { PrintColumn, ReportExportService } from '../../../../../Core/services/export/generic-export.service';
import { HelpGuidance } from '../../../../../shared/components/help-guidance/help-guidance';

const HELP_HTML = `
  <p class="mb-0">Shows the maintenance history of every routine — status, last completion, next due date and running hours. Click a row to open its full timeline, or use "Sync With CMMS" to refresh completed-routine data from CMMS.</p>
`;

const STATUS_BADGE_CLASS: Record<string, string> = {
  ACTIVE: 'badge badge-active',
  INACTIVE: 'badge badge-inactive',
  OVERDUE: 'badge badge-pending',
};

export interface EquipmentRoutineRow {
  pk: number;
  subDept: string;
  equipmentNomenclature: string;
  routineName: string;
  status: string;
  previousRoutineCompletionDate: string;
  nextRoutineDueDate: string;
  totalRhUpdatedUpto: string;
  rhsi: string | number;
  routineCompletedAtRh: string | number;
  routineDueAtRh: string | number;
  maintopsNo: string;
  ssRoutines: string | number;
  dydRoutines: string | number;
  totalSubRoutines: number;
}

interface RoutineHistoryApiItem {
  pk: number;
  sub_dept: string;
  equipment_nomenclature: string;
  routine_name: string;
  status?: string;
  prev_completion_date?: string;
  next_due_date?: string;
  rhsi_updated_upto?: string;
  rhsi?: number | string;
  routine_completed_at_rh?: number | string;
  routine_due_at_rh?: number | string;
  maintops_no?: string;
  maintop_no?: string;
  ss_routines?: number | string;
  dyd_routines?: number | string;
  total_sub_subroutines?: number;
  total_sub_routines?: number;
}

export interface RoutineHistoryApiResponse {
  result?: RoutineHistoryApiItem[];
  departments?: string[];
  equipments?: string[];
  routine_types?: string[];
}

export interface RoutineHistoryFilters {
  subDept?: string;
  equipment?: string;
  routineName?: string;
  search?: string;
}

export interface RoutineHistoryTimelineItem {
  dart_no: string;
  routine_no: string;
  routine_description: string;
  next_due_date: string;
  prev_completion_date: string;
  rhsi: number | string;
  rhsi_updated_upto: string;
  routine_completed_at_rh: number | string;
  routine_due_at_rh: number | string;
  id: number;
  routine_pk: number;
}

export interface RoutineHistoryTimelineResponse {
  data?: RoutineHistoryTimelineItem[];
  routine_nos?: string[];
}

@Component({
  selector: 'app-equipment-routine-history',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectInput, DataGrid, IconComponent, ExportToolbar, HelpGuidance, ButtonComponent],
  templateUrl: './equipment-routine-history.html',
  styleUrl: './equipment-routine-history.scss',
})
export class EquipmentRoutineHistoryComponent implements OnInit {
  readonly helpHtml = HELP_HTML;

  private readonly call = inject(OperationalMaintenanceApi);
  private readonly exportService = inject(ReportExportService);
  readonly exportBusy = signal<ExportKind | null>(null);

  private readonly filtersChanged = new Subject<void>();

  /* ------------------------------------------------------------------ */
  /*  Lifecycle                                                            */
  /* ------------------------------------------------------------------ */
  ngOnInit(): void {
    this.loadRoutineHistory();

    // Backend does the filtering — debounce so typing/dropdown changes don't
    // fire a request per keystroke/click.
    this.filtersChanged
      .pipe(debounceTime(300))
      .subscribe(() => this.loadRoutineHistory());
  }
  /* ------------------------------------------------------------------ */
  /*  Filter state                                                         */
  /* ------------------------------------------------------------------ */
  selectedSubDept = 'All';
  selectedEquipment = 'All';
  selectedRoutineName = 'All';
  searchText = '';

  subDeptOptions: { label: string; value: string }[] = [
    { label: 'All', value: 'All' }
  ];

  equipmentOptions: { label: string; value: string }[] = [
    { label: 'All', value: 'All' }
  ];

  routineNameOptions: { label: string; value: string }[] = [
    { label: 'All', value: 'All' }
  ];
  /* ------------------------------------------------------------------ */
  /*  Column definitions                                                   */
  /* ------------------------------------------------------------------ */
  columnDefs: ColDef[] = [
    {
      headerName: 'Sub Dept',
      field: 'subDept',
      flex: 1.5,
      minWidth: 180
    },
    {
      headerName: 'Equipment Nomenclature',
      field: 'equipmentNomenclature',
      flex: 2,
      minWidth: 250
    },
    {
      headerName: 'Routine Name',
      field: 'routineName',
      flex: 2.5,
      minWidth: 320
    },
    {
      headerName: 'Status',
      field: 'status',
      flex: 1,
      minWidth: 120,
      cellRenderer: (params: ICellRendererParams) => {
        const status = params.value ?? '';
        const cls = STATUS_BADGE_CLASS[status] ?? 'badge badge-pending';
        return `<span class="${cls}">${status}</span>`;
      }
    },
    {
      headerName: 'Previous Routine Completion Date',
      field: 'previousRoutineCompletionDate',
      flex: 1.5,
      minWidth: 220
    },
    {
      headerName: 'Next Routine Due Date',
      field: 'nextRoutineDueDate',
      flex: 1.5,
      minWidth: 180
    },
    {
      headerName: 'Total R/H Updated Upto',
      field: 'totalRhUpdatedUpto',
      flex: 1.5,
      minWidth: 180
    },
    {
      headerName: 'RHSI',
      field: 'rhsi',
      flex: 1,
      minWidth: 110
    },
    {
      headerName: 'Routine Completed @ R/H',
      field: 'routineCompletedAtRh',
      flex: 1.5,
      minWidth: 180
    },
    {
      headerName: 'Routine Due @ R/H',
      field: 'routineDueAtRh',
      flex: 1.5,
      minWidth: 160
    },
    {
      headerName: 'Maintops No',
      field: 'maintopsNo',
      flex: 1,
      minWidth: 130
    },
    {
      headerName: 'SS Routines',
      field: 'ssRoutines',
      flex: 1,
      minWidth: 130
    },
    {
      headerName: 'DYD Routines',
      field: 'dydRoutines',
      flex: 1,
      minWidth: 130
    },
    {
      headerName: 'Total Sub-Routines',
      field: 'totalSubRoutines',
      flex: 1,
      minWidth: 180
    }
  ];

  /* ------------------------------------------------------------------ */
  /*  Row data                                                             */
  /* ------------------------------------------------------------------ */
  filteredRows = signal<EquipmentRoutineRow[]>([]);
  readonly isLoading = signal(false);

  loadRoutineHistory(): void {

    this.isLoading.set(true);
    this.call
      .getRoutineHistory({
        subDept: this.selectedSubDept,
        equipment: this.selectedEquipment,
        routineName: this.selectedRoutineName,
        search: this.searchText.trim(),
      })
      .subscribe({
        next: (res: RoutineHistoryApiResponse) => {

          const rows = (res.result || []).map((item: RoutineHistoryApiItem) => ({
            pk: item.pk,
            subDept: item.sub_dept ?? '',
            equipmentNomenclature: item.equipment_nomenclature ?? '',
            routineName: item.routine_name ?? '',
            status: (item.status || '').toUpperCase(),
            previousRoutineCompletionDate:
              item.prev_completion_date ?? 'NA',
            nextRoutineDueDate:
              item.next_due_date ?? 'NA',
            totalRhUpdatedUpto:
              item.rhsi_updated_upto ?? 'NA',
            rhsi:
              item.rhsi ?? 'NA',
            routineCompletedAtRh:
              item.routine_completed_at_rh ?? 'NA',
            routineDueAtRh:
              item.routine_due_at_rh ?? 'NA',
            maintopsNo:
              item.maintops_no ?? item.maintop_no ?? 'NA',
            ssRoutines:
              item.ss_routines ?? 'NA',
            dydRoutines:
              item.dyd_routines ?? 'NA',
            totalSubRoutines:
              item.total_sub_subroutines ?? item.total_sub_routines ?? 0
          }));

          this.filteredRows.set(rows);

          this.subDeptOptions = [
            { label: 'All', value: 'All' },
            ...(res.departments || []).filter((item: string) => item !== '').map((item: string) => ({
              label: item,
              value: item
            }))
          ];

          this.equipmentOptions = [
            { label: 'All', value: 'All' },
            ...(res.equipments || []).filter((item: string) => item !== '').map((item: string) => ({
              label: item,
              value: item
            }))
          ];

          this.routineNameOptions = [
            { label: 'All', value: 'All' },
            ...(res.routine_types || []).filter((item: string) => item !== '').map((item: string) => ({
              label: item,
              value: item
            }))
          ];
        },

        error: (err: HttpErrorResponse) => {
          console.error('Routine History API Error', err);
          this.filteredRows.set([]);
          this.isLoading.set(false);
        },

        complete: () => {
          this.isLoading.set(false);
        }
      });
  }

  /* ------------------------------------------------------------------ */
  /*  Timeline detail panel                                                */
  /* ------------------------------------------------------------------ */
  timelinePanelOpen = signal(false);
  timelineLoading = signal(false);
  timelineTitle = signal('');
  timelineRows = signal<RoutineHistoryTimelineItem[]>([]);
  timelineRoutineNoOptions = signal<{ label: string; value: string }[]>([
    { label: 'All', value: 'All' }
  ]);
  timelineSelectedRoutineNo = 'All';
  private timelineEquipmentPk: number | null = null;

  readonly timelineColumnDefs: ColDef[] = [
    { headerName: 'DART No', field: 'dart_no', flex: 1, minWidth: 120 },
    { headerName: 'Routine No', field: 'routine_no', flex: 1, minWidth: 120 },
    { headerName: 'Routine Description', field: 'routine_description', flex: 1.5, minWidth: 200 },
    { headerName: 'Next Due Date', field: 'next_due_date', flex: 1, minWidth: 140 },
    { headerName: 'Prev Completion Date', field: 'prev_completion_date', flex: 1, minWidth: 160 },
    { headerName: 'RHSI', field: 'rhsi', flex: 1, minWidth: 100 },
    { headerName: 'RHSI Updated Upto', field: 'rhsi_updated_upto', flex: 1, minWidth: 160 },
    { headerName: 'Completed @RH', field: 'routine_completed_at_rh', flex: 1, minWidth: 140 },
    { headerName: 'Due @RH', field: 'routine_due_at_rh', flex: 1, minWidth: 120 },
  ];

  onRowClicked(row: unknown): void {
    const typedRow = row as EquipmentRoutineRow | undefined;
    if (!typedRow?.pk) return;
    this.openTimeline(typedRow);
  }

  openTimeline(row: EquipmentRoutineRow): void {
    this.timelineTitle.set(row.equipmentNomenclature);
    this.timelineSelectedRoutineNo = 'All';
    this.timelineEquipmentPk = row.pk;
    this.timelinePanelOpen.set(true);
    this.loadTimelineData();
  }

  // `routine_no` is sent to the backend on every load so filtering happens
  // server-side once it's supported there; until then the endpoint just
  // ignores the param and returns the full set.
  loadTimelineData(): void {
    if (this.timelineEquipmentPk == null) return;

    this.timelineLoading.set(true);
    this.timelineRows.set([]);

    this.call.getRoutineHistoryTimelineData(this.timelineEquipmentPk, this.timelineSelectedRoutineNo).subscribe({
      next: (res: RoutineHistoryTimelineResponse) => {
        this.timelineRows.set(res.data || []);

        this.timelineRoutineNoOptions.set([
          { label: 'All', value: 'All' },
          ...(res.routine_nos || []).filter((item: string) => item !== '').map((item: string) => ({
            label: item,
            value: item
          }))
        ]);

        this.timelineLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Routine History Timeline API Error', err);
        this.timelineRows.set([]);
        this.timelineLoading.set(false);
      }
    });
  }

  onTimelineRoutineNoChange(): void {
    this.loadTimelineData();
  }

  closeTimeline(): void {
    this.timelinePanelOpen.set(false);
  }

  /* ------------------------------------------------------------------ */
  /*  Event handlers                                                       */
  /* ------------------------------------------------------------------ */
  onFilterChange(): void {
    this.filtersChanged.next();
  }

  onSearchChange(): void {
    this.filtersChanged.next();
  }

  clearFilters(): void {
    this.selectedSubDept = 'All';
    this.selectedEquipment = 'All';
    this.selectedRoutineName = 'All';
    this.searchText = '';

    this.loadRoutineHistory();
  }

  private get printColumns(): PrintColumn[] {
    return this.columnDefs
      .filter((c): c is typeof c & { field: string } => !!c.field)
      .map((c) => ({ header: String(c.headerName ?? c.field), field: c.field }));
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredRows() as unknown as Record<string, unknown>[];
    if (kind === 'excel') {
      this.exportService.downloadCsv(this.printColumns, rows, 'equipment-routine-history.csv');
      return;
    }
    this.exportService.printRows('Equipment Routine History', this.printColumns, rows);
  }
}
