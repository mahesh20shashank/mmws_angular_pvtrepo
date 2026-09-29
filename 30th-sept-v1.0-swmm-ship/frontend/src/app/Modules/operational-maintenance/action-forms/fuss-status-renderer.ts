import { Component } from '@angular/core';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-fuss-status-renderer',
  standalone: true,
  imports: [CommonModule],
  styleUrl: './fuss-status-renderer.css',
  template: `
    <span class="badge" [style.--badge-color]="badgeColor">
      {{ status }}
    </span>
  `,
})
export class FussStatusRendererComponent
  implements ICellRendererAngularComp {
  status = '';
  badgeColor = '#10b981';

  agInit(params: ICellRendererParams): void {
    this.status = String(params.value ?? '');
    console.log(" this.status", this.status)
    const rowData = params.data as Record<string, unknown> | undefined;
    if (typeof rowData?.['status_color'] === 'string' && rowData['status_color']) {
      this.badgeColor = rowData['status_color'];
      console.log("this.badgeColor", this.badgeColor)
      return;
    }

    const upper = this.status.toUpperCase();
    if (upper.includes('OVERDUE')) {
      this.badgeColor = '#ef4444';
    } else if (upper === 'DUE') {
      this.badgeColor = '#f59e0b';
    } else {
      this.badgeColor = '#10b981';
    }
  }

  refresh(params: ICellRendererParams): boolean {
    this.agInit(params);
    return true;
  }
}
