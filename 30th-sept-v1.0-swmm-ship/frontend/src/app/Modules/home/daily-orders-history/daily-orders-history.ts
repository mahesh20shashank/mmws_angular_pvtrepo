import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ColDef, CellCallbackParams, RowNode } from 'ag-grid-community';
import { PrintColumn, ReportExportService } from '../../../Core/services/export/generic-export.service';

import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PanelCard } from '../../../shared/components/panel-card/panel-card';
import { DataGrid } from '../../../shared/components/data-grid/data-grid';
import { ExportToolbar, ExportKind } from '../../../shared/components/export-toolbar/export-toolbar';
import { Call } from '../../../Core/http/services/call';
import { DailyOrder } from '../home/home.model';

@Component({
  selector: 'app-daily-orders-history',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, PanelCard, DataGrid, ExportToolbar, ButtonComponent],
  templateUrl: './daily-orders-history.html',
  styleUrl: './daily-orders-history.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyOrdersHistory implements OnInit {
  private readonly call = inject(Call);
  private readonly exportService = inject(ReportExportService);

  @ViewChild(DataGrid) dataGrid!: DataGrid;

  readonly dailyOrders = signal<DailyOrder[]>([]);
  readonly fromDate = signal<string>('');
  readonly toDate = signal<string>('');
  readonly globalSearch = signal('');

  readonly pageSize = signal(10);
  readonly pageSizeOptions = [10, 25, 50, 100];

  readonly columnDefs: ColDef[] = [
    {
      headerName: 'Ser. No.',
      field: 'serNo',
      width: 90,
      sortable: true,
      filter: false,
    },
    {
      headerName: 'D/O Date',
      field: 'date',
      flex: 1,
      minWidth: 130,
      valueFormatter: (params) => this.formatDate(params['value'] as string),
      filter: 'agTextColumnFilter',
      floatingFilter: true,
    },
    {
      headerName: 'Officer of the Day',
      field: 'officer_details',
      flex: 1,
      minWidth: 180,
      valueFormatter: (params) => (params['value'] as string) || '—',
      filter: 'agTextColumnFilter',
      floatingFilter: true,
    },
    {
      headerName: 'Routine of the Day',
      field: 'routine_details',
      flex: 1,
      minWidth: 160,
      valueFormatter: (params) => (params['value'] as string) || '—',
      filter: 'agTextColumnFilter',
      floatingFilter: true,
    },
    {
      headerName: 'Description',
      field: 'description',
      flex: 1,
      minWidth: 200,
      valueFormatter: (params) => (params['value'] as string) || '—',
      filter: 'agTextColumnFilter',
      floatingFilter: true,
    },
    {
      headerName: 'View',
      field: 'pdf_path',
      width: 90,
      sortable: false,
      cellRenderer: (params: CellCallbackParams) => {
        const hasPdf = !!(params.data as DailyOrder | undefined)?.pdf_path;
        return `
          <button type="button" class="doh-view${hasPdf ? '' : ' doh-view--disabled'}" title="${hasPdf ? 'Open PDF' : 'No PDF available'}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
              <path d="M14 2v6h6"></path>
            </svg>
          </button>
        `;
      },
      onCellClicked: (params: CellCallbackParams) => {
        const pdfPath = (params.data as DailyOrder | undefined)?.pdf_path;
        if (pdfPath) {
          window.open(pdfPath, '_blank', 'noopener,noreferrer');
        }
      },
    },
  ];

  readonly filteredRecords = computed(() => {
    const list = this.dailyOrders();
    const fromVal = this.fromDate();
    const toVal = this.toDate();
    const search = this.globalSearch().toLowerCase().trim();

    const start = fromVal ? new Date(fromVal + 'T00:00:00') : null;
    const end = toVal ? new Date(toVal + 'T23:59:59') : null;

    return list.filter((order) => {
      if (start || end) {
        const orderDate = order.date ? new Date(order.date + 'T00:00:00') : null;
        if (!orderDate || isNaN(orderDate.getTime())) return false;
        if (start && !isNaN(start.getTime()) && orderDate < start) return false;
        if (end && !isNaN(end.getTime()) && orderDate > end) return false;
      }

      if (search) {
        const haystack = [order.date, order.officer_details, order.routine_details, order.description]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      return true;
    });
  });

  ngOnInit(): void {
    this.loadDailyOrders();
  }

  onFromDateChange(val: string): void {
    this.fromDate.set(val);
    if (this.toDate() && val && this.toDate() < val) {
      this.toDate.set('');
    }
  }

  clearFilters(): void {
    this.fromDate.set('');
    this.toDate.set('');
    this.globalSearch.set('');
  }

  onPageSizeChange(size: string): void {
    this.pageSize.set(Number(size));
  }

  formatDate(value: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private get printColumns(): PrintColumn[] {
    return [
      { header: 'Ser. No.', field: 'serNo' },
      { header: 'D/O Date', field: 'date', format: (val) => this.formatDate(val as string) },
      { header: 'Officer of the Day', field: 'officer_details', format: (val) => (val as string) || '—' },
      { header: 'Routine of the Day', field: 'routine_details', format: (val) => (val as string) || '—' },
      { header: 'Description', field: 'description', format: (val) => (val as string) || '—' },
    ];
  }

  private get exportRows(): Record<string, unknown>[] {
    const api = this.dataGrid?.gridApi;
    if (api) {
      const rows: Record<string, unknown>[] = [];
      const currentPage = api.paginationGetCurrentPage();
      const pageSize = api.paginationGetPageSize();
      const startRow = currentPage * pageSize;
      const endRow = startRow + pageSize;

      if (typeof api['forEachNodeAfterFilterAndSort'] === 'function') {
        api['forEachNodeAfterFilterAndSort']((node: RowNode) => {
          const rowIndex = node['rowIndex'];
          if (typeof rowIndex === 'number' && rowIndex >= startRow && rowIndex < endRow) {
            const data = node.data as DailyOrder | undefined;
            if (data) {
              rows.push({
                serNo: rowIndex + 1,
                date: data.date,
                officer_details: data.officer_details,
                routine_details: data.routine_details,
                description: data.description,
              });
            }
          }
        });
        return rows;
      }
    }

    return this.filteredRecords().map((order, index) => ({
      serNo: index + 1,
      date: order.date,
      officer_details: order.officer_details,
      routine_details: order.routine_details,
      description: order.description,
    }));
  }

  onExport(kind: ExportKind): void {
    if (kind === 'excel') {
      this.exportService.downloadCsv(this.printColumns, this.exportRows, `DailyOrdersHistory_${new Date().toISOString().slice(0, 10)}.csv`);
      return;
    }
    this.exportService.printRows('SWMM', this.printColumns, this.exportRows);
  }

  copyData(): void {
    void this.exportService.copyRows(this.printColumns, this.exportRows);
  }

  private async loadDailyOrders(): Promise<void> {
    try {
      const response = await firstValueFrom(this.call.getDailyOrders());
      this.dailyOrders.set(this.normalizeDailyOrders(response));
    } catch {
      this.dailyOrders.set([]);
    }
  }

  private normalizeDailyOrders(response: unknown): DailyOrder[] {
    const source = Array.isArray(response)
      ? response
      : (response as { results?: unknown[]; daily_orders?: unknown[] })?.results ??
      (response as { results?: unknown[]; daily_orders?: unknown[] })?.daily_orders ??
      [];

    if (!Array.isArray(source)) {
      return [];
    }

    return source
      .map((item, index) => {
        const raw = item as Partial<DailyOrder>;
        return {
          id: Number(raw.id ?? 0),
          serNo: index + 1,
          date: typeof raw.date === 'string' ? raw.date : '',
          description: typeof raw.description === 'string' ? raw.description.trim() : '',
          officer_details:
            typeof raw.officer_details === 'string' ? raw.officer_details.trim() : '',
          routine_details:
            typeof raw.routine_details === 'string' ? raw.routine_details.trim() : '',
          pdf_path: typeof raw.pdf_path === 'string' ? raw.pdf_path : '',
        };
      })
      .filter((item) => item.date.length > 0 || item.description.length > 0);
  }
}
