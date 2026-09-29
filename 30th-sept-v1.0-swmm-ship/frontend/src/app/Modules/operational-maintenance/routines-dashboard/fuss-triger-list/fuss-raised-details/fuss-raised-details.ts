import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ColDef, RowData } from 'ag-grid-community';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { MasterCard } from '../../../../refit-maintenance/master-card/master-card';
import { DataGrid } from '../../../../../shared/components/data-grid/data-grid';
import { GridActionButton } from '../../../../../shared/components/data-grid/grid-action-button/grid-action-button';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';
import { ExportKind, ExportToolbar } from '../../../../../shared/components/export-toolbar/export-toolbar';
import { PrintColumn, ReportExportService } from '../../../../../Core/services/export/generic-export.service';

import { OperationalMaintenanceApi } from '../../../services/operational-maintenance-api';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { FussRaisedDetailRow } from '../fuss-trigger-list.model';

@Component({
  selector: 'app-fuss-raised-details',
  standalone: true,
  imports: [CommonModule, MasterCard, DataGrid, IconComponent, ExportToolbar, ButtonComponent],
  templateUrl: './fuss-raised-details.html',
  styleUrl: './fuss-raised-details.css',
})
export class FussRaisedDetails implements OnInit {
  private readonly api = inject(OperationalMaintenanceApi);
  private readonly router = inject(Router);
  private readonly toastr = inject(NotificationService);
  private readonly exportService = inject(ReportExportService);
  readonly exportBusy = signal<ExportKind | null>(null);

  readonly routineName = (history.state?.routineName as string | undefined) ?? '';

  // GET api/v1/ems/fuss_raised_details/ applies `search` server-side; pagination over the
  // (already search-filtered) result set still happens here on the client.
  private allRows: FussRaisedDetailRow[] = [];
  readonly filteredRows = signal<FussRaisedDetailRow[]>([]);
  readonly totalRowCount = signal(0);
  private currentPage = 1;
  private currentPageSize = 10;
  readonly filterVersion = signal(0);
  readonly isLoading = signal(false);

  searchText = '';
  private readonly searchChanged = new Subject<string>();

  columnDefs: ColDef[] = [
    { headerName: 'Maintops No', field: 'maintop_no', flex: 1 },
    { headerName: 'Dart No', field: 'dart_number', flex: 1 },
    { headerName: 'Equipment Name', field: 'equipment', flex: 1.5 },
    { headerName: 'Routine Name', field: 'routine_name', flex: 1.5 },
    { headerName: 'Routine No', field: 'routine_no', flex: 1 },
    { headerName: 'Routine Description', field: 'routine_description', flex: 3, wrapText: true, autoHeight: true },
    {
      headerName: 'Action',
      field: 'action',
      flex: 2,
      minWidth: 220,
      sortable: false,
      pinned: 'right',
      cellRenderer: GridActionButton,
      cellRendererParams: {
        label: 'Close Routine',
        onEdit: (row: RowData) => this.onCloseFuss(row as unknown as FussRaisedDetailRow),
        secondaryLabel: 'PDF',
        secondaryBackgroundColor: '#C0392B',
        onSecondary: (row: RowData) => this.openFussPdf(row as unknown as FussRaisedDetailRow),
      },
    },
  ];

  ngOnInit(): void {
    if (!this.routineName) {
      this.toastr.warning('No routine selected.');
      this.goBack();
      return;
    }

    this.loadDetails();

    this.searchChanged.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => {
      this.loadDetails();
    });
  }

  loadDetails(): void {
    this.isLoading.set(true);
    this.api.getFussRaisedDetails(this.routineName, this.searchText.trim() || undefined).subscribe({
      next: (res) => {
        this.allRows = res?.fuss_list ?? [];
        this.resetToFirstPage();
      },
      error: (err: unknown) => {
        console.error('Unable to fetch FUSS raised details.', err);
        this.toastr.error('Unable to fetch FUSS raised details.');
        this.allRows = [];
        this.filteredRows.set([]);
        this.totalRowCount.set(0);
      },
      complete: () => {
        this.isLoading.set(false);
      },
    });
  }

  private resetToFirstPage(): void {
    this.filterVersion.update((v) => v + 1);
    this.applyFilters(1, this.currentPageSize);
  }

  private applyFilters(page: number, pageSize: number): void {
    this.currentPage = page;
    this.currentPageSize = pageSize;
    this.totalRowCount.set(this.allRows.length);

    const start = (page - 1) * pageSize;
    this.filteredRows.set(this.allRows.slice(start, start + pageSize));
  }

  onPageRequested(event: { page: number; pageSize: number }): void {
    this.applyFilters(event.page, event.pageSize);
  }

  onSearch(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value;
    this.searchChanged.next(this.searchText);
  }

  clearFilters(): void {
    this.searchText = '';
    this.loadDetails();
  }

  onCloseFuss(row: FussRaisedDetailRow): void {
    if (!row?.routine_id) {
      this.toastr.warning('This entry has no linked routine to close.');
      return;
    }

    this.router.navigate(
      ['/afterAuth/op-maintenance/routine/close-fuss'],
      { state: { routineId: row.routine_id } },
    );
  }

  openFussPdf(row: FussRaisedDetailRow): void {
    window.open(`${this.api.baseUrl}api/v1/ems/fuss-pdf/${row.id}/`, '_blank');
  }

  private get printColumns(): PrintColumn[] {
    return this.columnDefs
      .filter((c) => !!c.field && c.field !== 'action')
      .map((c) => ({ header: String(c.headerName ?? c.field), field: c.field as string }));
  }

  onExport(kind: ExportKind): void {
    const rows = this.allRows as unknown as Record<string, unknown>[];
    if (kind === 'excel') {
      this.exportService.downloadCsv(this.printColumns, rows, 'fuss-raised-details.csv');
      return;
    }
    this.exportService.printRows('FUSS Raised Details', this.printColumns, rows);
  }

  goBack(): void {
    this.router.navigateByUrl('/afterAuth/op-maintenance/routine/FUSS-triger-list');
  }
}
