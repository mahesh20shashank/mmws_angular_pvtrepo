import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, finalize, takeUntil } from 'rxjs';
import { DlApiService } from '../services/dl-api.service';
import { DlHistory, DlRecord, DlType } from '../models';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PanelCard } from '../../../shared/components/panel-card/panel-card';
import { DataGrid, GridDlActionCell } from '../../../shared/components';
import { SelectInput, DropdownOption } from '../../../shared/components/select-input/select-input';
import { ExportToolbar, ExportKind } from '../../../shared/components/export-toolbar/export-toolbar';
import { ModalComponent } from '../../../shared/components/modal/modal.component';
import { HelpGuidance } from '../../../shared/components/help-guidance/help-guidance';
import { CellCallbackParams, ColDef, RowData } from 'ag-grid-community';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { NotificationService } from '../../../Core/services/notification';
import { ReportExportService } from '../../../Core/services/export/generic-export.service';
import { HttpErrorResponse } from '@angular/common/http';

export function createDlMonitoringColumns(): ColDef[] {
  return [
    {
      headerName: 'Ser',
      field: 'ser',
      width: 70,
      valueGetter: (params: CellCallbackParams) => {
        const rowIndex = params.node?.['rowIndex'] as number | null | undefined;
        const data = params.data as DlRecord | undefined;
        return rowIndex != null ? rowIndex + 1 : data?.ser;
      },
    },
    { headerName: 'Sub Dept', field: 'sub_department', minWidth: 130 },
    { headerName: 'DL Type', field: 'dl_type', width: 90 },
    { headerName: 'DART No.', field: 'dart_no', minWidth: 120 },
    { headerName: 'Equipment Name', field: 'equip_name', minWidth: 160 },
    { headerName: 'Defect No.', field: 'defect_no', minWidth: 120 },
    { headerName: 'Defect Description', field: 'defect_description', minWidth: 220 },
    { headerName: 'Ship Remarks', field: 'ship_remarks', minWidth: 180 },
    { headerName: 'Yard Remarks', field: 'yard_remarks', minWidth: 180 },
    { headerName: 'Final PRM', field: 'final_prm', minWidth: 120 },
    { headerName: 'C No.', field: 'c_no', minWidth: 100 },
    { headerName: 'WI Gen. Status', field: 'wi_generation_status', minWidth: 140 },
    { headerName: 'QC Clearance', field: 'qc_clearance', minWidth: 130 },
    { headerName: 'WI Closing Status', field: 'wi_closing_status', minWidth: 140 },
    { headerName: 'WI Gen By Yard', field: 'wi_generated_by_yard', minWidth: 150 },
    { headerName: 'DL Importance', field: 'dl_importance', minWidth: 130 },
    { headerName: 'Weekly Status', field: 'weekly_status', minWidth: 140 },
    { headerName: 'Last Updated', field: 'current_status_updated_on', minWidth: 150 },
  ];
}

@Component({
  selector: 'app-dl-tracking',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IconComponent,
    PanelCard,
    DataGrid,
    SelectInput,
    ExportToolbar,
    ModalComponent,
    HelpGuidance, ButtonComponent],
  templateUrl: './tracking.component.html',
  styleUrl: './tracking.component.css'
})
export class TrackingComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(DlApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toaster = inject(NotificationService);
  private readonly exportService = inject(ReportExportService);
  private readonly destroy$ = new Subject<void>();

  // Signals state
  readonly typeSignal = signal<DlType>('ALL');

  readonly helpHtml = computed(() => {
    const t = this.typeSignal();
    if (t === 'DL2') {
      return `<p class="fw-bold mb-3">Track Defect List II items - switch between the Pending DLs and Completed DLs tabs, use "Get / Sync from Navyojana" to pull the latest DL II data, and edit a row's status directly in the table.</p>`;
    }
    if (t === 'DL3') {
      return `<p class="fw-bold mb-3">Track Defect List III items - switch between the Pending DLs and Completed DLs tabs, use "Get / Sync from Navyojana" to pull the latest DL III data, and edit a row's status directly in the table.</p>`;
    }
    return `<p class="fw-bold mb-3">Track Defect List I items - switch between the Pending DLs and Completed DLs tabs, and edit a row's DL status and other fields directly in the table.</p>`;
  });
  readonly viewSignal = signal<'pending' | 'completed'>('pending');
  readonly recordsSignal = signal<DlRecord[]>([]);
  readonly completedRecordsSignal = signal<DlHistory[]>([]);
  readonly loadingSignal = signal<boolean>(false);
  readonly messageSignal = signal<string>('');
  readonly editingSignal = signal<DlRecord | null>(null);
  readonly closingSignal = signal<DlRecord | null>(null);

  readonly filterSignal = signal({
    query: '',
    sub_department: '',
    equip_name: '',
    final_prm: '',
    dl_importance: '',
    status: '',
  });

  // Getters & Setters for HTML binding & backwards compatibility
  get type(): DlType { return this.typeSignal(); }
  get view(): 'pending' | 'completed' { return this.viewSignal(); }
  get loading(): boolean { return this.loadingSignal(); }
  get message(): string { return this.messageSignal(); }
  set message(val: string) { this.messageSignal.set(val); }
  get editing(): DlRecord | null { return this.editingSignal(); }
  set editing(val: DlRecord | null) { this.editingSignal.set(val); }
  get closing(): DlRecord | null { return this.closingSignal(); }
  set closing(val: DlRecord | null) { this.closingSignal.set(val); }

  readonly statuses = ['Not yet started', 'In progress', 'Completed'];
  readonly yesNo = ['', 'Yes', 'No'];

  readonly refitOptions: DropdownOption[] = [
    { label: 'All Refit DLs', value: 'ALL' },
    { label: 'DL I', value: 'DL1' },
    { label: 'DL II', value: 'DL2' },
    { label: 'DL III', value: 'DL3' },
  ];

  formatDlType(type: string): string {
    if (type === 'ALL') return 'All Refit DLs';
    if (type === 'DL1') return 'DL I';
    if (type === 'DL2') return 'DL II';
    if (type === 'DL3') return 'DL III';
    return type.replace(/DL1/g, 'DL I').replace(/DL2/g, 'DL II').replace(/DL3/g, 'DL III');
  }

  readonly importanceOptions: DropdownOption[] = [
    { label: 'All importance', value: '' },
    { label: 'Normal DL', value: 'Normal DL' },
    { label: 'Important', value: 'Important' }
  ];
  readonly statusOptions: DropdownOption[] = [
    { label: 'All status', value: '' },
    ...this.statuses.map(x => ({ label: x, value: x }))
  ];
  readonly editImportanceOptions: DropdownOption[] = [
    { label: 'Normal DL', value: 'Normal DL' },
    { label: 'Important', value: 'Important' }
  ];
  readonly editYardOptions: DropdownOption[] = [
    { label: 'Select', value: '' },
    { label: 'Yes', value: 'Yes' },
    { label: 'No', value: 'No' }
  ];

  readonly pendingColumns: ColDef[] = [
    ...createDlMonitoringColumns(),
    this.createActionColumn(),
  ];
  readonly completedColumns: ColDef[] = [
    ...createDlMonitoringColumns(),
    { headerName: 'DL Status', field: 'status', minWidth: 150 },
    this.createActionColumn(),
  ];

  private createActionColumn(): ColDef {
    return {
      colId: 'action',
      headerName: 'Action',
      field: 'status',
      minWidth: 340,
      sortable: false,
      filter: false,
      // Without this, clicking the status dropdown or Edit button still leaves ag-grid's
      // default cell-focus rectangle drawn around the whole cell — reads like an input box
      // got selected.
      suppressCellFocus: true,
      cellRenderer: GridDlActionCell,
      cellRendererParams: {
        getOptions: () => this.statuses.map(value => ({ label: value, value })),
        onValueChange: (row: RowData, _field: string, value: string) => {
          if (row) this.changeStatus(row as DlRecord, value);
        },
        onEdit: (row: RowData) => {
          if (row) this.openEdit(row as DlRecord);
        },
        onClose: (row: RowData) => {
          if (row) this.openClose(row as DlRecord);
        },
        // A completed DL is edited via "Close DART" (Completed tab) instead — matches the
        // legacy DL Tracking page, which never renders an Edit control for completed rows at all.
        disabled: (row: RowData) => (row as DlRecord | undefined)?.status === 'Completed',
      }
    };
  }

  filterForm = this.fb.nonNullable.group({ query: '', sub_department: '', equip_name: '', final_prm: '', dl_importance: '', status: '' });
  editForm = this.fb.nonNullable.group({ id: 0, weekly_status: ['', Validators.required], dl_importance: ['Normal DL', Validators.required], wi_generated_by_yard: ['', Validators.required] });
  closeForm = this.fb.nonNullable.group({ id: 0, er_date: ['', Validators.required], start_work: ['', Validators.required], complete_work: ['', Validators.required] });

  // Computed Options from Signals
  readonly subDeptOptions = computed<DropdownOption[]>(() => {
    const all = [...(this.recordsSignal() || []), ...(this.completedRecordsSignal() || [])];
    const depts = [...new Set(all.map(r => r?.sub_department).filter(Boolean))].sort((a, b) => (a as string).localeCompare(b as string));
    return [{ label: 'All departments', value: '' }, ...depts.map(x => ({ label: x as string, value: x as string }))];
  });

  readonly equipOptions = computed<DropdownOption[]>(() => {
    const all = [...(this.recordsSignal() || []), ...(this.completedRecordsSignal() || [])];
    const equips = [...new Set(all.map(r => r?.equip_name).filter(Boolean))].sort((a, b) => (a as string).localeCompare(b as string));
    return [{ label: 'All equipment', value: '' }, ...equips.map(x => ({ label: x as string, value: x as string }))];
  });

  readonly prmOptions = computed<DropdownOption[]>(() => {
    const all = [...(this.recordsSignal() || []), ...(this.completedRecordsSignal() || [])];
    const prms = [...new Set(all.map(r => r?.final_prm).filter(Boolean))].sort((a, b) => (a as string).localeCompare(b as string));
    return [{ label: 'All PRM', value: '' }, ...prms.map(x => ({ label: x as string, value: x as string }))];
  });

  // Computed Filtered Lists
  readonly filteredRecords = computed<DlRecord[]>(() => {
    const records = this.recordsSignal() || [];
    const f = this.filterSignal();
    const currentType = this.typeSignal();
    const q = (f.query || '').toLowerCase().trim();

    return records
      .filter(r =>
        !!r &&
        (currentType === 'ALL' || !r.dl_type || r.dl_type === currentType) &&
        r.status !== 'Completed' &&
        (!q || Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))) &&
        (!f.sub_department || r.sub_department === f.sub_department) &&
        (!f.equip_name || r.equip_name === f.equip_name) &&
        (!f.final_prm || r.final_prm === f.final_prm) &&
        (!f.dl_importance || r.dl_importance === f.dl_importance) &&
        (!f.status || r.status === f.status)
      )
      .map((r, index) => ({ ...r, ser: index + 1 }));
  });

  readonly completedFilteredRecords = computed<DlRecord[]>(() => {
    const records = this.recordsSignal() || [];
    const f = this.filterSignal();
    const currentType = this.typeSignal();
    const q = (f.query || '').toLowerCase().trim();

    return records
      .filter(r =>
        !!r &&
        (currentType === 'ALL' || !r.dl_type || r.dl_type === currentType) &&
        r.status === 'Completed' &&
        (!q || Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))) &&
        (!f.sub_department || r.sub_department === f.sub_department) &&
        (!f.equip_name || r.equip_name === f.equip_name) &&
        (!f.final_prm || r.final_prm === f.final_prm) &&
        (!f.dl_importance || r.dl_importance === f.dl_importance)
      )
      .map((r, index) => ({ ...r, ser: index + 1 }));
  });

  readonly inProgress = computed(() => (this.recordsSignal() || []).filter(r => r?.status === 'In progress').length);
  readonly pending = computed(() => (this.recordsSignal() || []).filter(r => r?.status !== 'Completed').length);
  readonly notStarted = computed(() => (this.recordsSignal() || []).filter(r => !r?.status || r?.status === 'Not yet started').length);
  readonly important = computed(() => (this.recordsSignal() || []).filter(r => r?.dl_importance === 'Important').length);

  ngOnInit(): void {
    this.filterForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.filterSignal.set(this.filterForm.getRawValue());
    });

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(p => {
      const value = p.get('type') as DlType;
      const targetType: DlType = (value === 'DL1' || value === 'DL2' || value === 'DL3' || value === 'ALL') ? value : 'ALL';
      this.typeSignal.set(targetType);
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loadingSignal.set(true);
    this.recordsSignal.set([]);
    this.completedRecordsSignal.set([]);

    this.api.records(this.typeSignal()).pipe(finalize(() => this.loadingSignal.set(false))).subscribe({
      next: rows => {
        const fallback = rows as unknown as { data?: DlRecord[] };
        const data = Array.isArray(rows) ? rows : fallback?.data ?? [];
        this.recordsSignal.set(data);
        if (this.viewSignal() === 'completed') {
          this.fetchHistory();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.recordsSignal.set([]);
        const errorMsg = err?.error?.message || err?.message || "Unable to connect to CMMS API.";
        this.toaster.error(errorMsg);
      }
    });
  }

  fetchHistory(): void {
    this.loadingSignal.set(true);
    this.api.history().pipe(finalize(() => this.loadingSignal.set(false))).subscribe({
      next: rows => {
        const fallback = rows as unknown as { data?: DlHistory[] };
        const data = Array.isArray(rows) ? rows : fallback?.data ?? [];
        this.completedRecordsSignal.set(data);
      },
      error: (err: HttpErrorResponse) => {
        this.completedRecordsSignal.set([]);
        const errorMsg = err?.error?.message || err?.message || "Unable to fetch DL history.";
        this.toaster.error(errorMsg);
      },
    });
  }

  setView(view: 'pending' | 'completed'): void {
    this.viewSignal.set(view);
    this.filterForm.controls.status.reset('');
    if (view === 'completed' && !this.completedRecordsSignal().length) {
      this.fetchHistory();
    }
  }

  onTypeChange(newType: string): void {
    if (newType && newType !== this.typeSignal()) {
      const target = newType as DlType;
      this.typeSignal.set(target);
      this.router.navigate(['/afterAuth/refit_dashboard/tracking', target]);
      this.load();
    }
  }

  handleExport(kind: ExportKind): void {
    if (kind === 'print') {
      this.printTable();
    } else if (kind === 'excel') {
      this.exportCsv();
    } else if (kind === 'pdf') {
      this.pdf();
    }
  }

  pdf(): void {
    this.loadingSignal.set(true);
    setTimeout(() => {
      try {
        const rawCols = (this.viewSignal() === 'pending' ? this.pendingColumns : this.completedColumns)
          .filter(col => col.field && col.headerName !== 'Action');
        const headers = rawCols.map(col => col.headerName || col.field || '');
        const rows = this.viewSignal() === 'pending' ? this.filteredRecords() : this.completedFilteredRecords();

        const body = rows.map((row, idx) =>
          rawCols.map(col => {
            if (col.field === 'ser') {
              return String(row.ser ?? idx + 1);
            }
            const val = (row as unknown as Record<string, unknown>)[col.field!];
            return val != null ? String(val) : '';
          })
        );

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        const dlType = this.typeSignal();
        const viewType = this.viewSignal() === 'pending' ? 'Pending' : 'Completed';
        const title = `${dlType === 'ALL' ? 'All Refit' : dlType} Monitoring Track - ${viewType} DLs`;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(30, 41, 59);
        doc.text(title, 10, 12);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(`Generated on: ${new Date().toLocaleString('en-GB')} | Total Records: ${rows.length}`, 10, 18);

        autoTable(doc, {
          startY: 22,
          head: [headers],
          body: body.length > 0 ? body : [new Array(headers.length).fill('No records found')],
          styles: {
            fontSize: 7,
            cellPadding: 2.5,
            overflow: 'linebreak',
            valign: 'middle',
          },
          headStyles: {
            fillColor: [30, 58, 138],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7.5,
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
          margin: { top: 22, right: 10, bottom: 15, left: 10 },
          didDrawPage: (data) => {
            const pageCount = doc.getNumberOfPages();
            const currentPage = data.pageNumber;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            const pageSize = doc.internal.pageSize;
            const pageWidth = pageSize.width || pageSize.getWidth();
            const pageHeight = pageSize.height || pageSize.getHeight();
            doc.text(`Page ${currentPage} of ${pageCount}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
          }
        });

        const filename = `${this.typeSignal().toLowerCase()}-${this.viewSignal()}-monitoring.pdf`;
        doc.save(filename);
        this.messageSignal.set('PDF downloaded successfully.');
      } catch (err) {
        console.error('Error generating PDF:', err);
        this.messageSignal.set('Failed to generate PDF.');
      } finally {
        this.loadingSignal.set(false);
      }
    }, 50);
  }

  get duration(): number | null {
    const f = this.closeForm.value; if (!f.start_work || !f.complete_work) return null;
    return Math.ceil((new Date(f.complete_work).getTime() - new Date(f.start_work).getTime()) / 86400000);
  }

  clearFilters(): void {
    this.filterForm.reset();
  }

  /** Was a bare `window.print()` on the live app tab — with no `@media print` rule anywhere in
   * the app, Print Preview showed the sidebar/header chrome plus the virtualized (partially
   * rendered) ag-grid instead of a clean report. `ReportExportService.export('print', ...)`
   * opens a separate, self-contained preview window with just the table — the same pattern
   * every other OBS/MO/WED list page already uses for its own Print button. */
  printTable(): void {
    const columns = this.viewSignal() === 'pending' ? this.pendingColumns : this.completedColumns;
    const rows = this.viewSignal() === 'pending' ? this.filteredRecords() : this.completedFilteredRecords();
    const dlType = this.typeSignal();
    const viewType = this.viewSignal() === 'pending' ? 'Pending' : 'Completed';
    const title = `${dlType === 'ALL' ? 'All Refit' : dlType} Monitoring Track - ${viewType} DLs`;
    const opened = this.exportService.export('print', title, columns, rows as unknown as Record<string, unknown>[]);
    if (!opened) {
      this.toaster.error('Unable to open the print preview — please allow pop-ups for this site and try again.');
    }
  }

  exportCsv(): void {
    const columns: (keyof DlRecord)[] = ['defect_no', 'sub_department', 'equip_name', 'defect_description', 'ship_remarks', 'status'];
    const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [columns.join(','), ...this.filteredRecords().map(row => columns.map(key => escape(row[key])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${this.typeSignal().toLowerCase()}-monitoring.csv`; link.click();
    URL.revokeObjectURL(url);
  }

  copyTable(): void {
    const columns = (this.viewSignal() === 'pending' ? this.pendingColumns : this.completedColumns)
      .filter(column => column.field && column.headerName !== 'Action');
    const rows = this.viewSignal() === 'pending' ? this.filteredRecords() : this.completedFilteredRecords();
    const text = [
      columns.map(column => column.headerName).join('\t'),
      ...rows.map(row =>
        columns.map(column =>
          String((row as unknown as Record<string, string | number | boolean | null | undefined>)?.[column.field!] ?? '')
        ).join('\t')
      ),
    ].join('\n');
    navigator.clipboard.writeText(text).then(
      () => this.messageSignal.set('Table copied.'),
      () => this.messageSignal.set('Copy failed.'),
    );
  }

  openEdit(row: DlRecord): void {
    if (!row) return;
    this.editingSignal.set(row);
    this.editForm.patchValue({
      id: row.id ?? 0,
      weekly_status: row.weekly_status ?? '',
      dl_importance: row.dl_importance || 'Normal DL',
      wi_generated_by_yard: row.wi_generated_by_yard ?? ''
    });
  }

  saveEdit(): void {
    if (this.editForm.invalid) { this.editForm.markAllAsTouched(); return; }
    const rawVal = this.editForm.getRawValue();
    this.api.update(rawVal).subscribe({
      next: r => {
        const patch: Partial<DlRecord> = { ...rawVal };
        if (r.current_status_updated_on) patch.current_status_updated_on = r.current_status_updated_on;
        this.patchRecord(rawVal.id, patch);
        this.editingSignal.set(null);
        this.messageSignal.set(r.message ?? 'Updated successfully.');
      },
      error: (e: HttpErrorResponse) => {
        const errorMsg = e?.error?.message || e?.message || 'Update failed.';
        this.messageSignal.set(errorMsg);
        // this.toaster.error(errorMsg);
      }
    });
  }

  /** Applies a patch to the record with `id` inside `recordsSignal` and re-sets it, so
   * `filteredRecords`/`completedFilteredRecords` (both derived from `recordsSignal`) recompute
   * together — the row visually moves between the Pending and Completed grids the moment the
   * data changes, matching the legacy DL Tracking page's `initTable2()` + `initTable3()` pair. */
  private patchRecord(id: number, patch: Partial<DlRecord>): void {
    const records = this.recordsSignal();
    const index = records.findIndex(r => r.id === id);
    if (index < 0) return;
    const next = [...records];
    next[index] = { ...next[index], ...patch };
    this.recordsSignal.set(next);
  }

  changeStatus(row: DlRecord, status: string): void {
    if (!row?.id) return;
    const old = row.status;
    // `row` is the ag-grid cell's `params.data` — a fresh object `filteredRecords()` mapped off
    // `recordsSignal`, not a reference into it (see `patchRecord`'s doc comment above), so the
    // grid-visible change and the moving-between-tabs change must both go through `recordsSignal`.
    this.patchRecord(row.id, { status });

    this.api.update({ id: row.id, status }).subscribe({
      next: r => {
        this.patchRecord(row.id, { current_status_updated_on: r.current_status_updated_on ?? row.current_status_updated_on });
      },
      error: (err: HttpErrorResponse) => {
        this.patchRecord(row.id, { status: old });
        const errorMsg = err?.error?.message || err?.message || 'Failed to update status.';
        this.messageSignal.set(errorMsg);
        //this.toaster.error(errorMsg);
      }
    });
  }

  openClose(row: DlRecord): void {
    if (!row) return;
    this.closingSignal.set(row);
    this.closeForm.reset({ id: row.id ?? 0, er_date: '', start_work: '', complete_work: '' });
  }

  closeRecord(): void {
    if (this.closeForm.invalid || (this.duration ?? 0) < 0) { this.closeForm.markAllAsTouched(); return; }
    const rawVal = this.closeForm.getRawValue();
    this.api.close(rawVal).subscribe({
      next: r => {
        this.recordsSignal.set(this.recordsSignal().filter(v => v.id !== rawVal.id));
        this.closingSignal.set(null);
        this.messageSignal.set(r.message ?? 'DL closed.');
      },
      error: (e: HttpErrorResponse) => {
        const errorMsg = e?.error?.message || e?.message || 'Failed to close DL record.';
        this.messageSignal.set(errorMsg);
        //this.toaster.error(errorMsg);
      }
    });
  }

  sync(): void {
    this.loadingSignal.set(true);
    const typeToSync = this.typeSignal() === 'ALL' ? 'DL1' : this.typeSignal();
    this.api.sync(typeToSync).pipe(finalize(() => this.loadingSignal.set(false))).subscribe({
      next: r => {
        const currentRecords = [...this.recordsSignal()];
        for (const changed of (Array.isArray(r.data) ? r.data : [])) {
          const row = currentRecords.find(v => v.id === changed.id);
          if (row) Object.assign(row, changed);
        }
        this.recordsSignal.set(currentRecords);
        this.messageSignal.set(r.message ?? 'Synced successfully.');
      },
      error: (err: HttpErrorResponse) => {
        const errorMsg = err?.error?.message || err?.message || 'Navyojana sync failed.';
        this.messageSignal.set(errorMsg);
        // this.toaster.error(errorMsg);
      }
    });
  }
}
