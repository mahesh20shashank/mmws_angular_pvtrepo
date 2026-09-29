import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { ColDef } from 'ag-grid-community';
import { MasterCard } from '../../refit-maintenance/master-card/master-card';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { DataGrid } from '../../../shared/components/data-grid/data-grid';
import { NotificationService } from '../../../Core/services/notification/notification.service';
import { OperationalMaintenanceApi } from '../services/operational-maintenance-api';
import { ExportKind, ExportToolbar } from '../../../shared/components/export-toolbar/export-toolbar';
import { PrintColumn, ReportExportService } from '../../../Core/services/export/generic-export.service';

interface MaintenancePeriodViewRow {
  period: string;
  occasion: string;
  start_date: string;
  stop_date: string;
  current: boolean;
}

@Component({
  selector: 'app-maintenance-periods',
  standalone: true,
  imports: [CommonModule, FormsModule, MasterCard, IconComponent, ExportToolbar, ButtonComponent, DataGrid],
  templateUrl: './maintenance-periods.html',
  styleUrl: './maintenance-periods.css',
})
export class MaintenancePeriods implements OnInit {
  private readonly toastr = inject(NotificationService);
  private readonly opMaintenance = inject(OperationalMaintenanceApi);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly exportService = inject(ReportExportService);
  readonly exportBusy = signal<ExportKind | null>(null);

  private readonly printColumns: PrintColumn[] = [
    { header: 'Maintenance Period', field: 'period' },
    { header: 'Occasion', field: 'occasion' },
    { header: 'Start Date', field: 'start_date' },
    { header: 'Stop Date', field: 'stop_date' },
  ];

  rows: MaintenancePeriodViewRow[] = [];
  filteredRows: MaintenancePeriodViewRow[] = [];
  loading = true;

  // Captured once from the first (unfiltered) load so the dropdown doesn't shrink as the
  // user applies filters/search — the backend only returns the narrowed rows, not a
  // separate distinct-occasions list.
  occasions: string[] = [];

  periodFilter = 'All';
  occasionFilter = 'All';
  fromDate = '';
  toDate = '';
  pageSize = 10;
  search = '';

  columnSearch = { period: '', occasion: '', start_date: '', stop_date: '' };

  readonly columnDefs: ColDef[] = [
    { headerName: 'Maintenance Period', field: 'period', flex: 1, minWidth: 160 },
    { headerName: 'Occasion', field: 'occasion', flex: 1, minWidth: 140 },
    { headerName: 'Start Date', field: 'start_date', flex: 1, minWidth: 130 },
    {
      headerName: 'Stop Date',
      field: 'stop_date',
      flex: 1,
      minWidth: 130,
      valueFormatter: (params) => (params['value'] as string) || '—',
    },
  ];

  private readonly filtersChanged = new Subject<void>();

  ngOnInit(): void {
    this.filtersChanged.pipe(debounceTime(300)).subscribe(() => this.loadMaintenancePeriods());
    this.loadMaintenancePeriods();
  }

  async loadMaintenancePeriods(): Promise<void> {
    this.loading = true;
    try {
      const data = await this.opMaintenance.getMaintenancePeriodsList({
        period: this.periodFilter,
        occasion: this.occasionFilter,
        fromDate: this.fromDate || undefined,
        toDate: this.toDate || undefined,
        search: this.search.trim() || undefined,
        periodSearch: this.columnSearch.period.trim() || undefined,
        occasionSearch: this.columnSearch.occasion.trim() || undefined,
        startDateSearch: this.columnSearch.start_date.trim() || undefined,
        stopDateSearch: this.columnSearch.stop_date.trim() || undefined,
      });
      this.filteredRows = data.map((row) => ({
        period: row.maintenance_period,
        occasion: row.occasion,
        start_date: row.start_date,
        stop_date: row.end_date,
        current: row.is_current,
      }));
      if (!this.occasions.length) {
        this.occasions = [...new Set(this.filteredRows.map((r) => r.occasion))];
      }
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  onFilterChange(): void {
    this.filtersChanged.next();
  }

  clearFilters(): void {
    this.periodFilter = 'All';
    this.occasionFilter = 'All';
    this.fromDate = '';
    this.toDate = '';
    this.search = '';
    this.columnSearch = { period: '', occasion: '', start_date: '', stop_date: '' };
    this.loadMaintenancePeriods();
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredRows as unknown as Record<string, unknown>[];
    if (kind === 'excel') {
      this.exportService.downloadCsv(this.printColumns, rows, 'maintenance-periods.csv');
      return;
    }
    this.exportService.printRows('Ship Maintenance Periods', this.printColumns, rows);
  }

  copyRows(): void {
    void this.exportService.copyRows(this.printColumns, this.filteredRows as unknown as Record<string, unknown>[]);
    this.toastr.success('Copied to clipboard.');
  }
}
