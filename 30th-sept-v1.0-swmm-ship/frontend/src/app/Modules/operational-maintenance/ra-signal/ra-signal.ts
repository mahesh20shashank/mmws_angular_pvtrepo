import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ColDef, CellCallbackParams } from 'ag-grid-community';
import { MasterCard } from '../../refit-maintenance/master-card/master-card';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { DataGrid } from '../../../shared/components/data-grid/data-grid';
import { NotificationService } from '../../../Core/services/notification/notification.service';
import { OperationalMaintenanceApi } from '../services/operational-maintenance-api';
import { OpenDefect, OpenDefectsResponse } from '../open-defects/open-defects.model';
import {
  DraftRaRow,
  OpenDefectRow,
  SS_REMARK_OPTIONS,
  SignalHistoryRow,
  SsRemark,
} from './ra-signal.model';

type RaTab = 'open-defects' | 'draft' | 'history';

// No yard/dockyard master-data endpoint exists anywhere in this backend yet
// (checked call.ts) — kept as a static list, same as create-ra/create-dliii/
// ra-defect-list, until a real yard master endpoint is added.
const YARD_NAMES = ['ND (Mbi)', 'ND (V)', 'NSRY (Koc)', 'NSRY (Kar)', 'NSRY (Pbr)'];
const EXPORT_FORMATS = ['ACCDB', 'XLSX', 'CSV'];

let nextDlNo = 1;

@Component({
  selector: 'app-ra-signal',
  standalone: true,
  imports: [CommonModule, FormsModule, MasterCard, IconComponent, DataGrid, ButtonComponent],
  templateUrl: './ra-signal.html',
  styleUrl: './ra-signal.css',
})
export class RaSignal implements OnInit {
  private readonly toastr = inject(NotificationService);
  private readonly call = inject(OperationalMaintenanceApi);

  readonly ssRemarkOptions = SS_REMARK_OPTIONS;
  readonly yardNames = YARD_NAMES;
  readonly exportFormats = EXPORT_FORMATS;
  activeTab: RaTab = 'open-defects';

  yardName = '';
  exportFormat = EXPORT_FORMATS[0];
  loading = true;

  openDefects: OpenDefectRow[] = [];
  draftRows: DraftRaRow[] = [];
  // No backend endpoint currently returns past RA/DL signal history — this stays
  // a session-only log of what's been finalized in this browser tab.
  signalHistory: SignalHistoryRow[] = [];

  selectedIds = new Set<number>();

  readonly draftColumnDefs: ColDef[] = [
    {
      headerName: 'DL No.',
      field: 'dl_no',
      flex: 1,
      minWidth: 140,
      cellRenderer: (params: CellCallbackParams) =>
        params['value']
          ? `<span>${params['value']}</span>`
          : `<button type="button" class="text-[#1D96E9] underline text-xs">Assign DL No.</button>`,
      onCellClicked: (event: CellCallbackParams) => {
        if (!(event.data as DraftRaRow).dl_no) this.assignDlNo(event.data as DraftRaRow);
      },
    },
    { headerName: 'DART No.', field: 'dart_number', flex: 1, minWidth: 130 },
    { headerName: 'Date', field: 'defect_date', flex: 1, minWidth: 120 },
    { headerName: 'Equipment', field: 'equipment_name', flex: 1, minWidth: 160 },
    { headerName: 'Description', field: 'description', flex: 1, minWidth: 200 },
    { headerName: 'Remarks', field: 'remarks', flex: 1, minWidth: 140, valueFormatter: (p) => (p['value'] as string) || '—' },
    { headerName: 'SS Remark', field: 'ss_remark', flex: 1, minWidth: 130, valueFormatter: (p) => (p['value'] as string) || '—' },
    {
      headerName: 'Action',
      field: 'id',
      flex: 1,
      minWidth: 110,
      sortable: false,
      cellRenderer: () => `<button type="button" class="text-red-400 underline text-xs">Delete</button>`,
      onCellClicked: (event: CellCallbackParams) => this.removeDraftRow((event.data as DraftRaRow).id),
    },
  ];

  readonly historyColumnDefs: ColDef[] = [
    { headerName: 'Date', field: 'date', flex: 1, minWidth: 120 },
    { headerName: 'RA Generation Date', field: 'ra_generation_date', flex: 1, minWidth: 150 },
    { headerName: 'No of Serials', field: 'no_of_serials', flex: 1, minWidth: 130 },
    { headerName: 'Type of RA/DL', field: 'type', flex: 1, minWidth: 130 },
    {
      headerName: 'Action',
      field: 'type',
      flex: 1,
      minWidth: 110,
      sortable: false,
      cellRenderer: () =>
        `<div class="flex gap-2"><span class="text-[#1D96E9] underline text-xs cursor-pointer">Download</span><span class="text-[#1D96E9] underline text-xs cursor-pointer">Print</span></div>`,
    },
  ];

  async ngOnInit(): Promise<void> {
    try {
      const res: OpenDefectsResponse = await firstValueFrom(this.call.getOpenDartsAndABER());
      this.openDefects = (res.open_defects ?? []).map((d: OpenDefect) => ({
        id: d.id,
        dart_number: d.dart_number ?? '',
        defect_date: d.dart_date ?? '',
        equipment_name: d.eq_name ?? '',
        equipment_nomenclature: d.nomenclature ?? '',
        description: d.defective_discriptions ?? '',
        status: d.status === 'Closed' ? ('Closed' as const) : ('Open' as const),
        remarks: d.remarks ?? '',
        ss_remark: '' as const,
      }));
    } catch (err) {
      console.error('Failed to load open defects', err);
    } finally {
      this.loading = false;
    }
  }

  setTab(tab: RaTab): void {
    this.activeTab = tab;
  }

  toggleSelect(id: number): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  isSelected(id: number): boolean {
    return this.selectedIds.has(id);
  }

  setSsRemark(row: OpenDefectRow, value: SsRemark): void {
    row.ss_remark = value;
  }

  async mergeAndInitiate(): Promise<void> {
    if (!this.selectedIds.size) {
      this.toastr.warning('Select at least one defect to merge & initiate.');
      return;
    }

    if (!confirm('Are you sure you want to merge and initiate selected defects?')) {
      return;
    }

    const ids = Array.from(this.selectedIds);
    try {
      const res = await firstValueFrom(this.call.createRA(ids));
      const merged = this.openDefects.filter((d) => this.selectedIds.has(d.id));
      this.draftRows = [
        ...this.draftRows,
        ...merged.map((d) => ({ ...d, dl_no: '', batch: 'Draft' as const })),
      ];
      this.openDefects = this.openDefects.filter((d) => !this.selectedIds.has(d.id));
      this.selectedIds.clear();
      this.toastr.success(res.message ?? 'Defects merged and initiated successfully!');
      this.activeTab = 'draft';
    } catch (err) {
      const error = err as { error?: { message?: string } };
      this.toastr.error(error?.error?.message ?? 'Failed to initiate RA.');
    }
  }

  assignDlNo(row: DraftRaRow): void {
    if (row.dl_no) return;
    row.dl_no = `DL-${String(nextDlNo++).padStart(4, '0')}`;
  }

  removeDraftRow(id: number): void {
    this.draftRows = this.draftRows.filter((r) => r.id !== id);
  }

  finalizeRa(): void {
    if (!this.draftRows.length) {
      this.toastr.warning('No draft rows to finalize.');
      return;
    }

    this.signalHistory = [
      {
        date: new Date().toISOString().slice(0, 10),
        ra_generation_date: new Date().toISOString().slice(0, 10),
        no_of_serials: this.draftRows.length,
        type: 'RA',
      },
      ...this.signalHistory,
    ];
    this.draftRows = [];
    this.toastr.success('RA signal finalized and added to signal history.');
    this.activeTab = 'history';
  }

  exportToNavYojana(): void {
    this.toastr.info('Export to NavYojana/SDRS is not wired up yet — this is a placeholder action.');
  }
}
