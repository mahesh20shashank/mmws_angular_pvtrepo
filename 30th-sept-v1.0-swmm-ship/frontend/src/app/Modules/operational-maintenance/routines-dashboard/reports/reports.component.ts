import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SelectInput } from '../../../../shared/components/select-input/select-input';
import { DataGrid } from '../../../../shared/components/data-grid/data-grid';
import { ColDef, CellCallbackParams } from 'ag-grid-community';
import { OperationalMaintenanceApi } from '../../services/operational-maintenance-api';
import { Observable, Subject, debounceTime } from 'rxjs';
import { HelpGuidance } from '../../../../shared/components/help-guidance/help-guidance';
import { ReportExportService } from '../../../../Core/services/export/generic-export.service';

const HELP_HTML = `
  <p class="mb-0">Shows routines due this week split into two carts, Pending and Completed. Filter by sub-department to see only that department's routines.</p>
`;

export type ReportTab = 'weekly' | 'fortnightly' | 'monthly' | 'six-monthly' | 'yearly';

export interface PendingRow {
  /** Underlying RoutineDescription pk, prefixed by the backend as "rd_<id>". */
  routineId: string;
  subDept: string;
  subDeptClass: string;
  routineNo: string;
  description: string;
  dueDate: string;
  checked: boolean;
  metaCode?: string; // Specific for high-tier strategic tabs like yearly/six-monthly
}

export interface CompletedRow {
  routineNo: string;
  subDept: string;
  description: string;
  completionDate?: string;
}
export interface MaintenanceApiResponse {
  title: string;
  start_date: string;
  end_date: string;
  period: string;

  sub_depts: {
    id: number;
    name: string;
  }[];

  all_pending: MaintenanceApiPendingItem[];
  all_completed: MaintenanceApiCompletedItem[];

  total_pending: number;
  total_completed: number;
}

export interface MaintenanceApiPendingItem {
  id: string;
  sub_dept: string;
  routine_no: string;
  description: string;
  due_date: string;
  category?: string;
}

export interface MaintenanceApiCompletedItem {
  routine_no: string;
  sub_dept: string;
  description: string;
  due_date?: string;
}

export interface SubDeptDto {
  id: number;
  name: string;
}
@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectInput, DataGrid, HelpGuidance, ButtonComponent],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
})
export class ReportsComponent implements OnInit {
  readonly helpHtml = HELP_HTML;

  private call = inject(OperationalMaintenanceApi);
  private route = inject(ActivatedRoute);
  private reportExport = inject(ReportExportService);

  selectedCompletedRows = signal<PendingRow[]>([]);

  /* Tab labels — selection now lives in the header's Reports dropdown (matches source
     Django nav: Weekly / Fortnightly / Monthly / Six Monthly / Annual Maintenance Plan). */
  tabLabels: Record<ReportTab, string> = {
    weekly: 'Weekly Maintenance Plan',
    fortnightly: 'Fortnightly Maintenance Plan',
    monthly: 'Monthly Maintenance Plan',
    'six-monthly': 'Six Monthly Maintenance Plan',
    yearly: 'Annual Maintenance Plan',
  };

  activeTab: ReportTab = 'weekly';

  /* Filter Controls — populated from the real API response (res.sub_depts) once
   * getWeeklyMaintenancePlan()/getMaintenancePlan() resolve; starts with just
   * the "All" option rather than fabricated sub-department names. */
  selectedSubDept: number | '' = '';
  subDeptOptions: { label: string; value: number | '' }[] = [
    { label: 'All Sub-Departments', value: '' },
  ];

  /* Search & Pagination Parameters */
  searchText = '';

  /* Data Engine Signals */
  private _pendingRows = signal<PendingRow[]>([]);
  completedRows = signal<CompletedRow[]>([]);
  readonly isLoading = signal(false);

  private readonly filtersChanged = new Subject<void>();

  ngOnInit(): void {
    const segment = this.route.snapshot.url[this.route.snapshot.url.length - 1]?.path;
    this.activeTab = (segment as ReportTab) ?? 'weekly';
    this.loadMaintenancePlan(this.activeTab);

    // Backend does the filtering — debounce so typing/dropdown changes don't
    // fire a request per keystroke/click.
    this.filtersChanged.pipe(debounceTime(300)).subscribe(() => {
      this.loadMaintenancePlan(this.activeTab);
    });
  }

  onSelectionChanged(rows: unknown[]): void {
    this.selectedCompletedRows.set(rows as PendingRow[]);
  }
  loadMaintenancePlan(tab: ReportTab): void {

    let request$: Observable<MaintenanceApiResponse>;
    const subDept = this.selectedSubDept || undefined;
    const search = this.searchText.trim() || undefined;

    switch (tab) {
      case 'weekly':
        request$ = this.call.getWeeklyMaintenancePlan(subDept, search);
        break;

      case 'fortnightly':
        request$ = this.call.getMaintenancePlan('fortnightly', subDept, search);
        break;

      case 'monthly':
        request$ = this.call.getMaintenancePlan('monthly', subDept, search);
        break;

      case 'six-monthly':
        request$ = this.call.getMaintenancePlan('six_monthly', subDept, search);
        break;

      case 'yearly':
        request$ = this.call.getMaintenancePlan('annual', subDept, search);
        break;

      default:
        request$ = this.call.getWeeklyMaintenancePlan(subDept, search);
    }

   this.isLoading.set(true);
   request$.subscribe({
  next: (res: MaintenanceApiResponse) => {

    this._pendingRows.set(
      (res.all_pending || []).map((item: MaintenanceApiPendingItem) => ({
        routineId: item.id,
        subDept: item.sub_dept,
        subDeptClass: this.getDeptClass(item.sub_dept),
        routineNo: item.routine_no,
        description: item.description,
        dueDate: item.due_date,
        checked: false,
        metaCode: item.category
      }))
    );

    this.completedRows.set(
      (res.all_completed || []).map((item: MaintenanceApiCompletedItem) => ({
        routineNo: item.routine_no,
        subDept: item.sub_dept,
        description: item.description,
        completionDate: item.due_date
      }))
    );

    // Populate department dropdown dynamically
    this.subDeptOptions = [
      {
        label: 'All Sub-Departments',
        value: ''
      },
      ...(res.sub_depts || []).map((dept: SubDeptDto) => ({
        label: dept.name,
        value: dept.id
      }))
    ];

    this.isLoading.set(false);
  },

  error: err => {
    console.error('Maintenance API Error:', err);
    this.isLoading.set(false);
  }
});
  }
  getDeptClass(subDept: string): string {

    const value = subDept?.toLowerCase() || '';

    if (value.includes('gas turbine'))
      return 'badge-fwd';

    if (value.includes('nirbhay'))
      return 'badge-aft';

    if (value.includes('nishant'))
      return 'badge-ndc';

    if (value.includes('vikram'))
      return 'badge-br';

    return 'badge-fwd';
  }

  onDeptChange(): void {
    this.filtersChanged.next();
  }

  onSearchChange(): void {
    this.filtersChanged.next();
  }

  get pendingCount(): number {
    return this._pendingRows().length;
  }

  get pendingColumnDefs(): ColDef[] {
    const columns: ColDef[] = [
      // {
      //   headerName: '',
      //   width: 54,
      //   minWidth: 54,
      //   maxWidth: 54,
      //   sortable: false,
      //   cellRenderer: (params: any) => `
      //     <div class="checkbox ${params.value ? 'checked' : ''}">
      //       ${params.value ? '<i class="ti ti-check"></i>' : ''}
      //     </div>
      //   `,
      //   onCellClicked: (params: any) => this.toggleCheck(params.data)
      // },
      {
        headerName: 'S.No',
        valueGetter: 'node.rowIndex + 1',
        width: 90,
        minWidth: 90
      },
      {
        field: 'subDept',
        headerName: 'Sub Dept',
        minWidth: 140,
        cellRenderer: (params: CellCallbackParams) => {
          const row = params.data as PendingRow;
          return `
          <span class="dept-badge ${row.subDeptClass}">
            ${row.subDept}
          </span>
        `;
        }
      },
      {
        field: 'routineNo',
        headerName: 'Routine No',
        minWidth: 150
      }
    ];

    // if (this.activeTab === 'six-monthly' || this.activeTab === 'yearly') {
    //   columns.push({
    //     field: 'metaCode',
    //     headerName: 'Regulatory Standard',
    //     minWidth: 190,
    //     valueGetter: (params: CellCallbackParams) => (params.data as PendingRow).metaCode || '—',
    //     cellClass: 'td-meta'
    //   });
    // }

    columns.push(
      {
        field: 'description',
        headerName: 'Description Target',
        flex: 2,
        minWidth: 320,
        cellClass: 'td-desc'
      },
      {
        field: 'dueDate',
        headerName: 'Due Date',
        minWidth: 140
      }
    );

    return columns;
  }

  /* Backend already applies sub-dept + search filters — this just exposes
     the loaded rows to the template. */
  filteredPendingRows(): PendingRow[] {
    return this._pendingRows();
  }
  toggleCheck(row: PendingRow): void {
    row.checked = !row.checked;
    this._pendingRows.update(rows => [...rows]);
  }

  /** Mirrors the legacy page's `<a href="?download=pdf...">` link — same view,
   * `download=pdf` query param, opened in a new tab so the browser renders it. */
  downloadPdf(): void {
    const periodMap: Record<ReportTab, string> = {
      weekly: 'weekly',
      fortnightly: 'fortnightly',
      monthly: 'monthly',
      'six-monthly': 'six_monthly',
      yearly: 'annual',
    };
    const base = this.activeTab === 'weekly'
      ? 'api/v1/ems/weekly_maintenance_plan/'
      : `api/v1/ems/maintenance_plan/${periodMap[this.activeTab]}/`;

    const params = new URLSearchParams({ download: 'pdf' });
    if (this.selectedSubDept) params.set('sub_dept', String(this.selectedSubDept));

    window.open(`${this.call.baseUrl}${base}?${params.toString()}`, '_blank');
  }

  print(): void {
    const columns = [
      { header: 'Sub Dept', field: 'subDept' },
      { header: 'Routine No', field: 'routineNo' },
      { header: 'Description Target', field: 'description' },
      { header: 'Due Date', field: 'dueDate' },
    ];
    const rows = this.filteredPendingRows() as unknown as Record<string, unknown>[];
    this.reportExport.printRows(this.tabLabels[this.activeTab], columns, rows);
  }
}
