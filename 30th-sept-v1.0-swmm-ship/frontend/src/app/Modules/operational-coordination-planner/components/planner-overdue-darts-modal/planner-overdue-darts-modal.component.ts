import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ColDef } from 'ag-grid-community';

import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { DataGrid } from '../../../../shared/components/data-grid/data-grid';

import { PlannerStore } from '../../store/planner.store';

/**
 * Lists open DARTs whose closing (rectification) date has already passed -
 * mirrors the legacy activity_planner app's "Overdue pending DARTs" legend
 * item + modal.
 */
@Component({
  selector: 'app-overdue-darts-modal',
  standalone: true,
  imports: [ModalComponent, IconComponent, ButtonComponent, DataGrid],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planner-overdue-darts-modal.component.html',
  styleUrl: './planner-overdue-darts-modal.component.scss',
})
export class OverdueDartsModalComponent {
  protected readonly store = inject(PlannerStore);

  readonly overdueDartsColumnDefs: ColDef[] = [
    { headerName: 'Ser', field: 'ser', flex: 1, minWidth: 70 },
    { headerName: 'DART No', field: 'dart_number', flex: 1, minWidth: 120 },
    { headerName: 'Defect Date', field: 'defect_date', flex: 1, minWidth: 120 },
    { headerName: 'Closing Date', field: 'closing_date', flex: 1, minWidth: 120 },
    { headerName: 'Status', field: 'status', flex: 1, minWidth: 120 },
    { headerName: 'Equipment Nomenclature', field: 'equipment', flex: 1, minWidth: 180 },
    { headerName: 'Defect Description', field: 'description', flex: 1, minWidth: 200 },
    { headerName: 'Days Overdue', field: 'days_overdue', flex: 1, minWidth: 120 },
  ];

  protected close(): void {
    this.store.closeOverdueDartsModal();
  }
}
