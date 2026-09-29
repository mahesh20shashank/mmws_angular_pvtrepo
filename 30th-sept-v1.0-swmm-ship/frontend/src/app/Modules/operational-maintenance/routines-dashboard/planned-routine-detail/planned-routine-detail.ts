import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ColDef, RowData } from 'ag-grid-community';
import { firstValueFrom } from 'rxjs';

import { MasterCard } from '../../../refit-maintenance/master-card/master-card';
import { DataGrid } from '../../../../shared/components/data-grid/data-grid';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { PlannedRoutineActions } from './planned-routine-actions/planned-routine-actions';

import { OperationalMaintenanceApi } from '../../services/operational-maintenance-api';
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import { PlannedRoutineDetail } from '../search-routines/search-routines.model';

@Component({
  selector: 'app-planned-routine-detail',
  standalone: true,
  imports: [CommonModule, MasterCard, DataGrid, IconComponent, ButtonComponent],
  templateUrl: './planned-routine-detail.html',
  styleUrl: './planned-routine-detail.css',
})
export class PlannedRoutineDetailComponent implements OnInit {
  private readonly api = inject(OperationalMaintenanceApi);
  private readonly router = inject(Router);
  private readonly toastr = inject(NotificationService);

  readonly addRoutineId = (history.state?.addRoutineId as number | undefined) ?? null;

  readonly rows = signal<PlannedRoutineDetail[]>([]);
  readonly selectedIds = signal<number[]>([]);
  readonly isLoading = signal(false);

  readonly maintopNo = signal('NA');
  readonly routineName = signal('NA');
  readonly equipmentName = signal('NA');

  columnDefs: ColDef[] = [
    {
      headerName: 'DART No',
      field: 'dart_number',
      flex: 1,
      valueGetter: (params) => (params.data as PlannedRoutineDetail | undefined)?.dart_number || 'NA',
    },
    {
      headerName: 'Routine No',
      field: 'routine_no',
      flex: 1,
    },
    {
      headerName: 'Routine Description',
      field: 'routine_description',
      flex: 4,
      wrapText: true,
      autoHeight: true,
    },
    {
      headerName: 'Action',
      field: 'action',
      flex: 1.6,
      minWidth: 190,
      sortable: false,
      filter: false,
      pinned: 'right',
      cellRenderer: PlannedRoutineActions,
      cellRendererParams: {
        onCloseRoutine: (row: RowData) => this.navigateToCloseRoutine((row as unknown as PlannedRoutineDetail).pk),
        onDelete: (row: RowData) => this.deleteRoutine((row as unknown as PlannedRoutineDetail).pk),
      },
    },
  ];

  ngOnInit(): void {
    if (!this.addRoutineId) {
      this.toastr.warning('No planned routine selected.');
      this.goBack();
      return;
    }

    this.loadDetail();
  }

  loadDetail(): void {
    if (!this.addRoutineId) return;

    this.isLoading.set(true);
    this.api.getSearchDetailPlan(this.addRoutineId).subscribe({
      next: (res) => {
        const rows = res?.result ?? [];
        this.rows.set(rows);

        const first = rows[0];
        this.maintopNo.set(first?.maintop_no || 'NA');
        this.routineName.set(first?.routine_name || 'NA');
        this.equipmentName.set(first?.equipment_name || 'NA');
      },
      error: (err: unknown) => {
        console.error('Unable to fetch planned routine detail.', err);
        this.toastr.error('Unable to fetch planned routine detail.');
        this.isLoading.set(false);
      },
      complete: () => {
        this.isLoading.set(false);
      },
    });
  }

  onSelectionChanged(selectedRows: RowData[]): void {
    this.selectedIds.set(
      (selectedRows as unknown as PlannedRoutineDetail[]).map((row) => row.pk),
    );
  }

  navigateToCloseRoutine(id: number): void {
    this.router.navigate(
      ['/afterAuth/op-maintenance/routine/close-routine'],
      { state: { routineId: id } },
    );
  }

  raiseFuss(): void {
    if (!this.selectedIds().length) {
      this.toastr.warning('Select at least one routine to raise FUSS.');
      return;
    }

    this.router.navigate(
      ['/afterAuth/op-maintenance/routine/fuss-triger-raise-fuss'],
      { state: { selectedIds: this.selectedIds() } },
    );
  }

  async deleteRoutine(pk: number): Promise<void> {
    if (!confirm('Delete this planned routine?')) return;

    try {
      const res = await firstValueFrom(this.api.deletePlannedRoutine(pk));
      this.toastr.success(res?.message ?? 'Planned routine deleted successfully.');
      this.loadDetail();
    } catch (err: unknown) {
      console.error('Unable to delete planned routine.', err);
      this.toastr.error('Unable to delete planned routine.');
    }
  }

  goBack(): void {
    this.router.navigate(['/afterAuth/op-maintenance/routine/planned-routines']);
  }
}
