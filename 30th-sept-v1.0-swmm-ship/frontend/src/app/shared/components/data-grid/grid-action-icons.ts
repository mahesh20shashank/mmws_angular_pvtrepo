import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams, RowData } from 'ag-grid-community';

import { IconComponent } from '../icon/icon.component';

export interface GridAction {
  icon: string;
  label: string;
  color?: string;
  action: (row: RowData) => void;
  disabled?: boolean;
  /** Renders `label` as visible text next to the icon, instead of only as the button's
   * hover tooltip. Off by default so every existing icon-only caller keeps its current
   * compact look — opt in per action where the text needs to actually show (e.g. Active
   * Sailings' "Complete" action). */
  showLabel?: boolean;
}

interface ActionRendererParams extends ICellRendererParams {
  actions?: GridAction[] | ((row: RowData) => GridAction[]);
  edit?: (row: RowData) => void;
  delete?: (row: RowData) => void;
  changeSerial?: (row: RowData) => void;
}

@Component({
  selector: 'app-action-renderer',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
    .action-btn {
      width: 28px;
      height: 28px;

      display: flex;
      align-items: center;
      justify-content: center;

      padding: 0;
      border: none;
      outline: none;

      cursor: pointer;
      border-radius: 7px;

      background: var(--sfd-chip-bg, rgba(255, 255, 255, 0.06));
      transition: background-color 0.15s ease;
    }

    .action-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .action-btn:focus-visible {
      outline: 2px solid rgba(127, 179, 224, 0.5);
      outline-offset: 2px;
    }

    .action-btn:disabled {
      cursor: default;
      pointer-events: none;
    }

    .action-btn--labeled {
      width: auto;
      padding: 0 10px;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
  `
  ],

  template: `
    <div class="flex items-center justify-center gap-2  h-full">
      @for (action of actions; track action.label) {
        <button
          type="button"
          [title]="action.label"
          (click)="onClick(action, $event)"
          class="action-btn"
          [class.action-btn--labeled]="action.showLabel"
          [style.color]="action.color ?? '#2563eb'"
          [disabled]="action.disabled"
        >
          @switch (action.icon) {

            @case ('edit') {
              <app-icon name="square-pen" [size]="14" variant="inherit" color="#7fb3e0" />
            }

            @case ('delete') {
              <app-icon name="trash" [size]="14" variant="inherit" color="#F82C36" />
            }

            @case ('check') {
              <app-icon name="check" [size]="14" variant="inherit" color="#16a34a" />
            }

            @case ('refresh') {
              <app-icon name="repeat" [size]="14" variant="inherit" color="#F59E0B" />
            }

            @case ('unlink') {
              <app-icon name="unlink" [size]="14" variant="inherit" />
            }

            @case ('view') {
              <app-icon name="eye" [size]="14" variant="inherit" />
            }

            @case ('info') {
              <app-icon name="info" [size]="14" variant="inherit" />
            }

            @case ('copy') {
              <app-icon name="copy" [size]="14" variant="inherit" />
            }

            @case ('download') {
              <app-icon name="download" [size]="14" variant="inherit" />
            }

            @case ('upload') {
              <app-icon name="upload" [size]="14" variant="inherit" color="#7fb3e0" />
            }

            @case ('add') {
              <app-icon name="plus" [size]="16" variant="inherit" />
            }

            @case ('share') {
              <app-icon name="share-2" [size]="14" variant="inherit" />
            }

             @case ('ban') {
              <app-icon name="ban" [size]="14" variant="inherit" color="#9CA3AF" />
            }

          }
          @if (action.showLabel) {
            <span>{{ action.label }}</span>
          }
        </button>
      }
    </div>
  `,



})
export class ActionRendererComponent implements ICellRendererAngularComp {

  params!: ActionRendererParams;
  actions: GridAction[] = [];

  // agInit(params: any): void {
  //   this.params = params;
  //   this.actions = params.actions ?? [];
  // }

  // refresh(params: any): boolean {
  //   this.params = params;
  //   this.actions = params.actions ?? [];
  //   return true;
  // }


  agInit(params: ActionRendererParams): void {
    this.params = params;

    if (typeof params.actions === 'function') {
      this.actions = params.actions(params.data);
    } else if (params.actions) {
      this.actions = params.actions;
    } else {
      this.actions = [
        {
          icon: 'edit',
          label: 'Edit',
          color: '#2563eb',
          action: (row: RowData) => params.edit?.(row),
        },
        {
          icon: 'delete',
          label: 'Delete',
          color: '#dc2626',
          action: (row: RowData) => params.delete?.(row),
        },
        // {
        //   icon: 'refresh',
        //   label: 'Change Serial',
        //   color: '#16a34a',
        //   action: (row: RowData) => params.changeSerial?.(row),
        // },
      ];
    }
  }


  refresh(params: ActionRendererParams): boolean {
    this.params = params;

    if (typeof params.actions === 'function') {
      this.actions = params.actions(params.data);
    } else if (params.actions) {
      this.actions = params.actions;
    } else {
      this.actions = [
        {
          icon: 'edit',
          label: 'Edit',
          color: '#2563eb',
          action: (row: RowData) => params.edit?.(row),
        },
        {
          icon: 'delete',
          label: 'Delete',
          color: '#dc2626',
          action: (row: RowData) => params.delete?.(row),
        },
        {
          icon: 'refresh',
          label: 'Change Serial',
          color: '#16a34a',
          action: (row: RowData) => params.changeSerial?.(row),
        },
      ];
    }

    return true;
  }

  onClick(action: GridAction, event: Event): void {
    // Prevent the click from bubbling to ag-grid's row-level click handler —
    // otherwise every icon click would also fire the grid's rowClicked event.
    event.stopPropagation();
    action.action(this.params.data);
  }
}
