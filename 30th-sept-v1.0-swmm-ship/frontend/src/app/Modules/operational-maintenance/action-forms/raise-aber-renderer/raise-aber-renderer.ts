import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  ICellRendererAngularComp,
} from 'ag-grid-angular';
import {
  ICellRendererParams,
} from 'ag-grid-community';


interface ActionButtonRendererParams extends ICellRendererParams {
  buttonLabel?: string;
  onClick?: (data: unknown) => void;
}

@Component({
  selector: 'app-action-button-renderer',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './raise-aber-renderer.html',
  styleUrl: './raise-aber-renderer.css',
})
export class RaiseAberRenderer implements ICellRendererAngularComp {
  private params!: ActionButtonRendererParams;

  buttonLabel = 'Raise ABER';

  agInit(params: ICellRendererParams): void {
    this.setParams(params as ActionButtonRendererParams);
  }

  refresh(params: ICellRendererParams): boolean {
    this.setParams(params as ActionButtonRendererParams);
    return true;
  }

  onClick(): void {
    this.params.onClick?.(this.params.data);
  }

  private setParams(params: ActionButtonRendererParams): void {
    this.params = params;
    this.buttonLabel = params.buttonLabel ?? 'Raise ABER';
  }
}
