import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams, RowData } from 'ag-grid-community';
import { IconComponent } from '../icon/icon.component';

interface SpareDeleteParams extends ICellRendererParams {
  onDelete?: (row: RowData) => void;
}

@Component({
  selector: 'app-spare-delete-renderer',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      (click)="deleteRow()"
      class="w-20 h-8 rounded-lg
             bg-[#6B2730]
             border border-[#9B4D57]
             flex items-center justify-center
             hover:bg-[#7D313B]"
    >
      <app-icon
        name="trash-2"
        [size]="16"
        color="white"
      />
    </button>
  `,
})
export class SpareDeleteRenderer
  implements ICellRendererAngularComp
{
  params!: SpareDeleteParams;

  agInit(params: SpareDeleteParams): void {
    this.params = params;
  }

  refresh(): boolean {
    return false;
  }

  deleteRow() {
    this.params.onDelete?.(this.params.data);
  }
}
