import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams, RowData } from 'ag-grid-community';

import { IconComponent } from '../../../../../shared/components/icon/icon.component';

interface PlannedRoutineActionsParams extends ICellRendererParams {
  onCloseRoutine?: (row: RowData) => void;
  onDelete?: (row: RowData) => void;
}

@Component({
  selector: 'app-planned-routine-actions',
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  templateUrl: './planned-routine-actions.html',
  styleUrl: './planned-routine-actions.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannedRoutineActions implements ICellRendererAngularComp {
  params!: PlannedRoutineActionsParams;

  agInit(params: PlannedRoutineActionsParams): void {
    this.params = params;
  }

  refresh(): boolean {
    return false;
  }

  onCloseRoutine(event: Event): void {
    event.stopPropagation();
    this.params.onCloseRoutine?.(this.params.data);
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    this.params.onDelete?.(this.params.data);
  }
}
