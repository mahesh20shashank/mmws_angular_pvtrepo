import { ButtonComponent } from '../../button/button.component';
import { Component, ChangeDetectionStrategy } from '@angular/core';

import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams, RowData } from 'ag-grid-community';

interface GridActionButtonParams extends ICellRendererParams {
  label?: string;
  backgroundColor?: string;
  disabled?: boolean | ((row: RowData, params: GridActionButtonParams) => boolean);
  onEdit?: (row: RowData) => void;
  onDelete?: (row: RowData) => void;
  secondaryLabel?: string;
  secondaryBackgroundColor?: string;
  onSecondary?: (row: RowData) => void;
}

@Component({
  selector: 'app-grid-action-renderer',
  standalone: true,
  imports: [ButtonComponent],
  templateUrl: './grid-action-button.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './grid-action-button.css',
})
export class GridActionButton
  implements ICellRendererAngularComp {

  params!: GridActionButtonParams;
  label = 'Save';
  disabled = false;
  backgroundColor = '#1976d2'
  secondaryLabel = '';
  secondaryBackgroundColor = '#1976d2';
  agInit(params: GridActionButtonParams): void {
    this.params = params;
    this.label = params?.label ?? 'Save';
    this.disabled = this.resolveDisabled(params);
    this.backgroundColor = params?.backgroundColor ?? '#1976d2';
    this.secondaryLabel = params?.secondaryLabel ?? '';
    this.secondaryBackgroundColor = params?.secondaryBackgroundColor ?? '#1976d2';
  }

  refresh(): boolean {
    this.label = this.params?.label ?? 'Save';
    this.disabled = this.resolveDisabled(this.params);
    this.secondaryLabel = this.params?.secondaryLabel ?? '';
    this.secondaryBackgroundColor = this.params?.secondaryBackgroundColor ?? '#1976d2';
    return false;
  }

  onEdit() {
    if (this.disabled) {
      return;
    }

    this.params.onEdit?.(this.params.data);
  }

  onDelete() {
    this.params.onDelete?.(this.params.data);
  }

  onSecondary() {
    this.params.onSecondary?.(this.params.data);
  }

  private resolveDisabled(params: GridActionButtonParams): boolean {
    if (typeof params?.disabled === 'function') {
      return !!params.disabled(params.data, params);
    }

    return !!params?.disabled;
  }
}
