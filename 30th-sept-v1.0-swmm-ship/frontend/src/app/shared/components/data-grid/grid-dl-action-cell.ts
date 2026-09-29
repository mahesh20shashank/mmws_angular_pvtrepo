import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams, RowData } from 'ag-grid-community';

import { FormsModule } from '@angular/forms';

interface DlActionOption {
  label: string;
  value: string;
}

interface DlActionCellParams extends ICellRendererParams {
  getOptions: () => DlActionOption[];
  onEdit?: (row: RowData) => void;
  onValueChange?: (row: RowData, field: string, newValue: string) => void;
  disabled?: boolean | ((row: RowData) => boolean);
}

@Component({
  selector: 'app-grid-dl-action-cell',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="dl-action-cell">
      <select
        class="dl-status-select"
        [(ngModel)]="selectedValue"
        (ngModelChange)="onStatusChange($event)"
        [disabled]="isDisabled"
      >
      @for (option of options; track option.value) {
  <option [value]="option.value">
    {{ option.label }}
  </option>
}
      </select>

      @if (!isDisabled) {
        <button
          type="button"
          class="dl-edit-btn"
          (click)="onEdit()"
        >
          Edit
        </button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .dl-action-cell {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      justify-content: flex-start;
    }

    .dl-status-select {
      min-width: 150px;
      height: 34px;
      padding: 0 12px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      background: rgba(255, 255, 255, 0.14);
      color: #fff;
      outline: none;
    }

    .dl-status-select:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .dl-status-select option {
      background: #555;
      color: #fff;
    }

    .dl-edit-btn {
      min-width: 90px;
      height: 34px;
      padding: 0 16px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.24);
      background: rgba(255, 255, 255, 0.18);
      color: #fff;
      font-size: 14px;
      cursor: pointer;
    }

    .dl-edit-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `],
})
export class GridDlActionCell implements ICellRendererAngularComp {
  params!: DlActionCellParams;
  options: DlActionOption[] = [];
  selectedValue = '';
  isDisabled = true;

  agInit(params: DlActionCellParams): void {
    this.params = params;
    this.options = this.params.getOptions?.() ?? [];
    this.selectedValue = String(this.params.value ?? (this.params.data as Record<string, unknown>)?.['status'] ?? '');
    this.isDisabled = this.resolveDisabled(this.params);
  }

  refresh(params: DlActionCellParams): boolean {
    this.params = params;
    this.options = this.params.getOptions?.() ?? [];
    this.selectedValue = String(this.params.value ?? (this.params.data as Record<string, unknown>)?.['status'] ?? '');
    this.isDisabled = this.resolveDisabled(this.params);
    return true;
  }

  onStatusChange(newValue: string): void {
    this.selectedValue = newValue;
    if (this.params.data) {
      (this.params.data as Record<string, unknown>)['status'] = newValue;
    }
    this.params.node?.setDataValue('status', newValue);
    this.params.api?.refreshCells({ rowNodes: [this.params.node], force: true });
    this.params.onValueChange?.(this.params.data, 'status', newValue);
    this.isDisabled = this.resolveDisabled({ ...this.params, data: { ...(this.params.data as Record<string, unknown>), status: newValue } });
  }

  onEdit(): void {
    if (this.isDisabled) {
      return;
    }

    this.params.onEdit?.(this.params.data);
  }

  private resolveDisabled(params: DlActionCellParams): boolean {
    if (typeof params.disabled === 'function') {
      return !!params.disabled(params.data);
    }
    return !!params.disabled;
  }
}
