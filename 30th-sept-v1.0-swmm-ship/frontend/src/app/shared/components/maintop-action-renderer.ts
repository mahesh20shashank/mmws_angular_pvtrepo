import { Component, ChangeDetectionStrategy } from '@angular/core';

import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams, RowData } from 'ag-grid-community';
import { IconComponent } from './icon/icon.component';

interface MaintopActionParams extends ICellRendererParams {
  onView?: (row: RowData) => void;
}

@Component({
  selector: 'app-maintop-action-renderer',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      class="hover:opacity-80 transition-opacity"
      (click)="viewRoutine()"
    >
      <app-icon
        name="file-text"
        [size]="16"
        color="#dc2626">
      </app-icon>
    </button>
  `,
})
export class MaintopActionRenderer implements ICellRendererAngularComp {
  params!: MaintopActionParams;

  agInit(params: MaintopActionParams): void {
    this.params = params;
  }

  refresh(): boolean {
    return false;
  }

  viewRoutine(): void {
    this.params?.onView?.(this.params.data);
  }
}
