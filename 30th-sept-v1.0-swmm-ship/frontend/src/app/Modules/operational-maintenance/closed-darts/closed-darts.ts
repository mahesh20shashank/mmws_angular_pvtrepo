import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ColDef } from 'ag-grid-community';
import { MasterCard } from '../../refit-maintenance/master-card/master-card';
import { DataGrid } from '../../../shared/components/data-grid/data-grid';
import { OperationalMaintenanceApi } from '../services/operational-maintenance-api';
import { CompleteDartListItem } from '../complete-dart-list/complete-dart-list.model';

interface ClosedDartRow {
  dart_number: string;
  sr_no: number;
  date: string;
  equipment_name: string;
  department: string;
}

@Component({
  selector: 'app-closed-darts',
  standalone: true,
  imports: [CommonModule, FormsModule, MasterCard, DataGrid],
  templateUrl: './closed-darts.html',
})
export class ClosedDarts implements OnInit {
  private readonly call = inject(OperationalMaintenanceApi);

  rows: ClosedDartRow[] = [];

  readonly columnDefs: ColDef[] = [
    { headerName: 'DART Number', field: 'dart_number', flex: 1, minWidth: 140 },
    { headerName: 'Sr No', field: 'sr_no', flex: 1, minWidth: 90 },
    { headerName: 'Date', field: 'date', flex: 1, minWidth: 120 },
    { headerName: 'Equipment Name', field: 'equipment_name', flex: 1, minWidth: 160 },
    { headerName: 'Department', field: 'department', flex: 1, minWidth: 140 },
  ];

  async ngOnInit(): Promise<void> {
    // Same closed-DART dataset as Complete DART List, just a different column
    // layout (this endpoint is mounted under both `complete_dart_list/` and
    // `closeddart/` in the backend).
    try {
      const items: CompleteDartListItem[] = await firstValueFrom(this.call.getCompleteDartList());
      this.rows = (items ?? []).map((item, i) => ({
        dart_number: item.dart_number ?? '',
        sr_no: i + 1,
        date: item.complete_defect_dart_set?.[0]?.rectified_date ?? item.dart_date ?? '',
        equipment_name: item.equipment_ship_name || item.equipment_ems_name || '',
        department: item.department_name ?? '',
      }));
    } catch (err) {
      console.error('Failed to load closed DARTs', err);
    }
  }
}
