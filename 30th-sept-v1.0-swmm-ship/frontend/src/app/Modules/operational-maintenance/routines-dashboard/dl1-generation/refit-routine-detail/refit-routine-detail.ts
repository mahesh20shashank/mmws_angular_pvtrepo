import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ColDef, RowData } from 'ag-grid-community';
import { firstValueFrom } from 'rxjs';

import { MasterCard } from '../../../../refit-maintenance/master-card/master-card';
import { DataGrid } from '../../../../../shared/components/data-grid/data-grid';
import { OperationalMaintenanceApi } from '../../../services/operational-maintenance-api';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { RefitRoutineDescriptionItem, RefitRoutineDetail } from '../refit-routines.model';

@Component({
  selector: 'app-refit-routine-detail',
  standalone: true,
  imports: [CommonModule, MasterCard, DataGrid, ButtonComponent],
  templateUrl: './refit-routine-detail.html',
})
export class RefitRoutineDetailComponent implements OnInit {
  private readonly api = inject(OperationalMaintenanceApi);
  private readonly router = inject(Router);
  private readonly toastr = inject(NotificationService);

  readonly refitRoutineId = (history.state?.refitRoutineId as number | undefined) ?? null;

  readonly detail = signal<RefitRoutineDetail | null>(null);
  readonly selectedIds = signal<number[]>([]);
  readonly isLoading = signal(false);

  columnDefs: ColDef[] = [
    { headerName: 'Routine No', field: 'routine_no', flex: 1 },
    {
      headerName: 'DART No',
      field: 'dart_number',
      flex: 1,
      valueGetter: (params) => (params.data as RefitRoutineDescriptionItem | undefined)?.dart_number || 'NA',
    },
    { headerName: 'Routine Description', field: 'routine_description', flex: 4, wrapText: true, autoHeight: true },
    { headerName: 'By Whom', field: 'by_whom', flex: 1 },
    {
      headerName: 'Spare Used',
      field: 'spare_used',
      flex: 1,
      valueGetter: (params) => ((params.data as RefitRoutineDescriptionItem | undefined)?.spare_used ? 'Yes' : 'No'),
    },
  ];

  ngOnInit(): void {
    if (!this.refitRoutineId) {
      this.toastr.warning('No refit routine selected.');
      this.goBack();
      return;
    }

    void this.loadDetail();
  }

  async loadDetail(): Promise<void> {
    if (!this.refitRoutineId) return;

    this.isLoading.set(true);
    try {
      const response = await firstValueFrom(this.api.getRefitRoutineDetail(this.refitRoutineId));
      this.detail.set(response);
    } catch (error: unknown) {
      console.error('Unable to fetch refit routine detail.', error);
      this.toastr.error('Unable to fetch refit routine detail.');
    } finally {
      this.isLoading.set(false);
    }
  }

  onSelectionChanged(selectedRows: RowData[]): void {
    this.selectedIds.set((selectedRows as unknown as RefitRoutineDescriptionItem[]).map((row) => row.id));
  }

  async generateDl(): Promise<void> {
    if (!this.selectedIds().length) {
      this.toastr.warning('Select at least one routine to generate DL 1.');
      return;
    }

    try {
      const res = await firstValueFrom(this.api.generateDl1(this.selectedIds()));
      this.toastr.success(res?.message ?? 'DL 1 generated successfully.');
      await this.loadDetail();
    } catch (error: unknown) {
      const message =
        (error as { error?: { message?: string } })?.error?.message ?? 'Unable to generate DL 1.';
      console.error('Unable to generate DL 1.', error);
      this.toastr.error(message);
    }
  }

  goBack(): void {
    this.router.navigate(['/afterAuth/op-maintenance/routine/dl1-generation/search-refit']);
  }
}
