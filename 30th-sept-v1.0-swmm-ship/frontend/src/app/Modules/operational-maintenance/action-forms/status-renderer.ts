import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';
import { IconComponent } from '../../../shared/components/icon/icon.component';



const STATUS_COLORS: Record<string, string> = {
  red: '#ef4444',
  yellow: '#eab308',
  green: '#22c55e',
};

@Component({
  selector: 'app-status-renderer',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <app-icon name="flag" [size]="18" [color]="color" />
  `,
})
export class StatusRenderer implements ICellRendererAngularComp {
  color = '#6b7280';

  agInit(params: ICellRendererParams): void {
    const status = String(params.value ?? '').toLowerCase();
    this.color = STATUS_COLORS[status] ?? '#6b7280';
  }

  refresh(): boolean {
    return false;
  }
}
