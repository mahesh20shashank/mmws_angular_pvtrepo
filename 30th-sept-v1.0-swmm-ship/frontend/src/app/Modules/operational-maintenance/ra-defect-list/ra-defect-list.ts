import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ColDef } from 'ag-grid-community';
import { MasterCard } from '../../refit-maintenance/master-card/master-card';
import { DataGrid } from '../../../shared/components/data-grid/data-grid';
import { GridStatusChipRenderer } from '../../../shared/components/data-grid/grid-status-chip-renderer';
import { NotificationService } from '../../../Core/services/notification/notification.service';
import { OperationalMaintenanceApi } from '../services/operational-maintenance-api';
import { OpenDefect, OpenDefectsResponse } from '../../operational-maintenance/open-defects/open-defects.model';
import { OpenDefectRow } from '../../operational-maintenance/ra-signal/ra-signal.model';

// No yard/dockyard master-data endpoint exists anywhere in this backend yet
// (checked call.ts) — kept as a static list, same as create-ra/create-dliii/ra-signal.
const YARD_NAMES = ['ND (Mbi)', 'ND (V)', 'NSRY (Koc)', 'NSRY (Kar)', 'NSRY (Pbr)'];
const EXPORT_FORMATS = ['ACCDB', 'XLSX', 'CSV'];

// Mirrors Django's dart/ra_defect_list.html — the RA-initiated defect working queue.
@Component({
  selector: 'app-ra-defect-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MasterCard, DataGrid, ButtonComponent],
  templateUrl: './ra-defect-list.html',
  styleUrl: './ra-defect-list.css',
})
export class RaDefectList implements OnInit {
  private readonly toastr = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly call = inject(OperationalMaintenanceApi);

  readonly yardNames = YARD_NAMES;
  readonly exportFormats = EXPORT_FORMATS;

  yardName = '';
  exportFormat = EXPORT_FORMATS[0];
  loading = true;

  rows: OpenDefectRow[] = [];
  selectedIds = new Set<number>();

  readonly columnDefs: ColDef[] = [
    { headerName: 'Sr No', valueGetter: (params) => (params.node ? params.node.rowIndex! + 1 : ''), flex: 1, minWidth: 80 },
    { headerName: 'Dart Number', field: 'dart_number', flex: 1, minWidth: 130 },
    { headerName: 'Defect Date', field: 'defect_date', flex: 1, minWidth: 120 },
    { headerName: 'Equipment Name', field: 'equipment_name', flex: 1, minWidth: 160 },
    { headerName: 'Equipment Nomenclature', field: 'equipment_nomenclature', flex: 1, minWidth: 180 },
    { headerName: 'Defect Description', field: 'description', flex: 1, minWidth: 200 },
    {
      headerName: 'Dart Status',
      field: 'status',
      flex: 1,
      minWidth: 130,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: {
        toneMap: { Open: 'danger', Closed: 'success' },
      },
    },
  ];

  getRowId = (row: OpenDefectRow): string => String(row.id);

  onSelectionChanged(rows: OpenDefectRow[]): void {
    this.selectedIds = new Set(rows.map((r) => r.id));
  }

  async ngOnInit(): Promise<void> {
    try {
      const res: OpenDefectsResponse = await firstValueFrom(this.call.getOpenDartsAndABER());
      this.rows = (res.open_defects ?? []).map((d: OpenDefect) => ({
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

  createRaDl(): void {
    if (!this.selectedIds.size) {
      this.toastr.warning('Select at least one defect to create RA / DL.');
      return;
    }
    const selected = this.rows
      .filter((r) => this.selectedIds.has(r.id))
      .map((r) => ({ id: r.id }));
    this.router.navigateByUrl('/afterAuth/op-maintenance/create-ra', {
      state: { selectedDefects: selected },
    });
  }

  sendToNavYojana(): void {
    this.toastr.info('Export to NavYojana/SDRS is not wired up yet — this is a placeholder action.');
  }
}
