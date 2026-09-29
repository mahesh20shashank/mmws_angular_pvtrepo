import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';
import { ColDef, GridApi, GridReadyEvent, RowData } from 'ag-grid-community';
import { MasterCard } from '../../refit-maintenance/master-card/master-card';
import { NotificationService } from '../../../Core/services/notification/notification.service';
import { OperationalMaintenanceApi } from '../services/operational-maintenance-api';
import { SS_REMARK_OPTIONS, SsRemark, RA_YARD_OPTIONS, DL_EXPORT_FORMATS } from '../ra-signal/ra-signal.model';
import { OpenDefect } from '../open-defects/open-defects.model';
import { DropdownOption, SelectInput } from '../../../shared/components/select-input/select-input';
import { InputField } from '../../../shared/components/input-field/input-field';
import { DataGrid } from '../../../shared/components/data-grid/data-grid';
import { GridStatusChipRenderer } from '../../../shared/components/data-grid/grid-status-chip-renderer';
import { GridTextCell } from '../../../shared/components/data-grid/grid-text-cell';
import { GridSelectCell } from '../../../shared/components/data-grid/grid-select-cell';
import { ActionRendererComponent } from '../../../shared/components/data-grid/grid-action-icons';

interface OpraRow {
  ser: number;
  id: number;
  selected: boolean;
  opra_no: string;
  dart_no: string;
  defect_date: string;
  dart_closing_date: string;
  status: 'Open' | 'Closed';
  equipment: string;
  description: string;
  remarks: string;
  ss_remark: SsRemark | '';
}

@Component({
  selector: 'app-create-ra',
  standalone: true,
  imports: [CommonModule, FormsModule, MasterCard, SelectInput, DataGrid, ButtonComponent],
  templateUrl: './create-ra.html',
  styleUrl: './create-ra.css',
})
export class CreateRA implements OnInit, OnDestroy {
  private readonly toastr = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly call = inject(OperationalMaintenanceApi);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly yardOptions: DropdownOption[] = RA_YARD_OPTIONS.map((yard) => ({ label: yard, value: yard }));
  // ACCDB is RA-specific — its export endpoint (export_pending_defects_accdb/) is built
  // around ACCDB, unlike DL-II's export which only has CSV/XLSX in DL_EXPORT_FORMATS.
  readonly exportFormats: DropdownOption[] = [...DL_EXPORT_FORMATS, 'ACCDB'].map((format) => ({
    label: format,
    value: format,
  }));
  readonly hourOptions: DropdownOption[] = Array.from({ length: 24 }, (_, h) => ({ label: String(h), value: String(h) }));
  readonly minuteOptions: DropdownOption[] = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => ({
    label: String(m),
    value: String(m),
  }));
  readonly ssRemarkOptions = SS_REMARK_OPTIONS;

  yardName = '';
  dtgDate = '';
  dtgHours = '';
  dtgMinutes = '';
  exportFormat = '';
  submitted = false;
  exporting = false;
  saving = false;

  rows: OpraRow[] = [];
  private gridApi?: GridApi;

  rowId = (data: RowData): string => String((data as unknown as OpraRow).ser);

  // Explicit (small) minWidths here override DataGrid's shared 120px default — with 10
  // data columns + the checkbox column, 120px each would force a horizontal scrollbar
  // on any normal screen width no matter how sizeColumnsToFit() below tries to shrink
  // them (ag-grid never shrinks a column past its minWidth).
  readonly columnDefs: ColDef[] = [
    { headerName: 'Ser', field: 'ser', width: 60, minWidth: 80, sortable: false },
    { headerName: 'OPRA No.', field: 'opra_no', flex: 1, minWidth: 140 },
    { headerName: 'DART No.', field: 'dart_no', flex: 1, minWidth: 140 },
    { headerName: 'Defect Date', field: 'defect_date', flex: 1, minWidth: 140 },
    {
      headerName: 'DART Closing Date',
      field: 'dart_closing_date',
      flex: 1,
      minWidth: 120,
      valueGetter: (params) => (params.data as unknown as OpraRow).dart_closing_date || '—',
    },
    {
      headerName: 'Status',
      field: 'status',
      flex: 1,
      minWidth: 140,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: { Open: 'danger', Closed: 'success' } },
    },
    { headerName: 'Equipment', field: 'equipment', flex: 1, minWidth: 140 },
    { headerName: 'Description', field: 'description', flex: 1.5, minWidth: 160 },
    {
      headerName: 'Additional Remarks',
      field: 'remarks',
      flex: 1.3,
      minWidth: 140,
      sortable: false,
      cellRenderer: GridTextCell,
    },
    {
      headerName: 'SS Remarks',
      field: 'ss_remark',
      flex: 1,
      minWidth: 160,
      sortable: false,
      cellRenderer: GridSelectCell,
      cellRendererParams: {
        getOptions: () => this.ssRemarkOptions,
      },
    },
    {
      headerName: 'Action',
      width: 70,
      minWidth: 70,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      pinned: "right",
      cellRendererParams: {
        actions: (row: RowData) => [
          {
            icon: 'delete',
            label: 'Delete',
            color: '#F82C36',
            action: (r: RowData) => this.removeRow((r as unknown as OpraRow).ser),
          },
        ],
      },
    },
  ];

  // `sizeColumnsToFit` isn't part of ag-grid's typed GridApi surface in this version —
  // narrow through the same "cast to a minimal shape" pattern DataGrid itself uses for
  // getColumnState (see data-grid.ts) rather than widening GridApi's type app-wide.
  private static sizeToFit(api: GridApi | undefined): void {
    (api as unknown as { sizeColumnsToFit?(): void } | undefined)?.sizeColumnsToFit?.();
  }

  private readonly resizeColumns = (): void => CreateRA.sizeToFit(this.gridApi);

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    // Every row starts checked, matching the previous plain-table default.
    this.gridApi.selectAll();
    // Force every column to shrink/grow to exactly fill the grid's width (down to its
    // minWidth above) instead of overflowing into a horizontal scrollbar.
    CreateRA.sizeToFit(this.gridApi);
    window.addEventListener('resize', this.resizeColumns);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeColumns);
  }

  onSelectionChanged(selectedRows: unknown[]): void {
    const selectedSers = new Set((selectedRows as OpraRow[]).map((r) => r.ser));
    this.rows = this.rows.map((r) => ({ ...r, selected: selectedSers.has(r.ser) }));
  }

  get selectedCount(): number {
    return this.rows.filter((r) => r.selected).length;
  }

  get yardMissing(): boolean {
    return this.submitted && !this.yardName;
  }

  get exportFormatMissing(): boolean {
    return this.submitted && !this.exportFormat;
  }

  ngOnInit(): void {
    // Only the defects the user explicitly checked on Open Defects come here —
    // this page never re-fetches the full pending-defects list.
    const selectedDefects = (history.state?.selectedDefects as OpenDefect[]) ?? [];

    if (!selectedDefects.length) {
      this.toastr.warning('No defects were selected — select at least one on Open Defects first.');
    }

    this.rows = selectedDefects.map((d, i) => ({
      ser: i + 1,
      id: d.id,
      selected: true,
      opra_no: d.opra_no ?? '',
      dart_no: d.dart_number ?? '',
      defect_date: d.dart_date ?? '',
      dart_closing_date: d.rectification_date ?? '',
      status: d.status === 'Closed' ? 'Closed' : 'Open',
      equipment: d.eq_name ?? '',
      description: d.defective_discriptions ?? '',
      remarks: d.remarks ?? '',
      ss_remark: '' as const,
    }));

    // Consume the navigation state once it's been read into `rows` — otherwise
    // navigating away (Cancel, or any other route) and then back to this exact
    // history entry (e.g. the browser Back/Forward buttons) replays the SAME
    // `selectedDefects` the browser stored for it, resurrecting rows the user
    // already backed out of instead of leaving this page empty.
    history.replaceState(null, '');
  }

  removeRow(ser: number): void {
    this.rows = this.rows.filter((r) => r.ser !== ser);
  }

  /** Converts an `<input type="date">` value (YYYY-MM-DD) to the DD-MM-YYYY
   * format the export API expects. */
  private formatDtgDate(value: string): string {
    const [year, month, day] = value.split('-');
    return year && month && day ? `${day}-${month}-${year}` : value;
  }

  /** Bulk-saves every row's Additional Remarks / SS Remarks in one call —
   * matches Create DL-II's Save button behavior. */
  async save(): Promise<void> {
    if (!this.rows.length) {
      this.toastr.warning('No rows to save.');
      return;
    }

    this.saving = true;
    try {
      await firstValueFrom(
        this.call.saveDLRows(this.rows.map((r) => ({ dart_id: r.id, additional_remarks: r.remarks, remarks: r.ss_remark }))),
      );
      this.toastr.success('Saved successfully.');
    } catch (err) {
      const error = err as { error?: { message?: string } };
      this.toastr.error(error?.error?.message ?? 'Save failed.');
    } finally {
      this.saving = false;
    }
  }



  async exportToNavYojana(): Promise<void> {
    if (this.exporting) return;

    this.submitted = true;

    const selected = this.rows.filter((r) => r.selected);
    if (!selected.length) {
      this.toastr.warning('Select at least one defect to export.');
      return;
    }
    if (!this.yardName) {
      this.toastr.warning('Select a yard first.');
      return;
    }
    if (!this.exportFormat) {
      this.toastr.warning('Select an export format first.');
      return;
    }

    const remarksData: Record<number, string> = {};
    const ssRemarksData: Record<number, string> = {};
    selected.forEach((r) => {
      if (r.remarks) remarksData[r.id] = r.remarks;
      if (r.ss_remark) ssRemarksData[r.id] = r.ss_remark;
    });

    this.exporting = true;
    try {
      // ACCDB generation falls back through win32com then up to 3 PowerShell attempts
      // (30s subprocess timeout each — see generate_accdb_file in backend/dart/services.py),
      // so it can legitimately run well past CSV/XLSX's usual response time. A flat 30s
      // client timeout would abort the request out from under a slow-but-successful
      // backend response, leaving this button stuck mid-export — give ACCDB more room.
      const exportTimeoutMs = this.exportFormat === 'ACCDB' ? 120000 : 30000;

      const res = await firstValueFrom(
        this.call.exportRA({
          yard: this.yardName,
          dtg_date: this.formatDtgDate(this.dtgDate),
          dtg_hour: this.dtgHours,
          dtg_minute: this.dtgMinutes,
          export_format: this.exportFormat,
          dart_ids: selected.map((r) => r.id),
          remarks_data: remarksData,
          ss_remarks_data: ssRemarksData,
          dl_type: 'RA',
        }).pipe(timeout(exportTimeoutMs)),
      );

      this.toastr.success(res.message ?? 'RA exported successfully.');

      const downloadUrl = res.data?.download_url;
      if (downloadUrl) {
        try {
          window.open(new URL(downloadUrl, this.call.baseUrl).toString(), '_blank');
        } catch (err) {
          console.error('Invalid download URL returned by export API', err);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        this.toastr.error('Export timed out. Please try again.');
      } else {
        const error = err as { error?: { message?: string } };
        this.toastr.error(error?.error?.message ?? 'Failed to export RA.');
      }
    } finally {
      // Force the button back to its idle state even if this resolved outside Angular's
      // zone (e.g. the browser throttling/deferring work in this tab after `window.open`
      // above switched focus to the new tab) — a plain field assignment alone would then
      // sit unrendered until some unrelated event happened to re-enter the zone.
      this.zone.run(() => {
        this.exporting = false;
        this.cdr.markForCheck();
      });
    }
  }

  cancel(): void {
    this.router.navigate(['/afterAuth/op-maintenance/defect/actions']);
  }
}
