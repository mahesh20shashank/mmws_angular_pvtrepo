import {
  Component,
  ElementRef,
  Renderer2,
  OnDestroy,
  NgZone,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { CommonModule } from '@angular/common';

export interface GridAction {
  key: string;
  label: string;
  iconClass?: string;
  btnClass?: string;
  enabled?: boolean;
  disabled?: boolean | ((row: any) => boolean);
  visible?: boolean | ((row: any) => boolean);
}

type ActionDisplayMode = 'float' | 'wrap';

@Component({
  selector: 'app-ag-action-cell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="isFloatMode(); else wrapActions" class="inline-flex items-center gap-2">
      <button
        *ngFor="let action of visibleActions()"
        type="button"
        class="inline-flex h-7 w-7 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-50"
        [ngClass]="action.btnClass || 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100'"
        [disabled]="isDisabled(action, params?.data)"
        [title]="action.label"
        [attr.aria-label]="action.label"
        (click)="actionClick($event, action)"
      >
        <ng-container [ngSwitch]="(action.key || '').toLowerCase()">
          <svg *ngSwitchCase="'view'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
            <path d="M1.7 10s3.2-5 8.3-5 8.3 5 8.3 5-3.2 5-8.3 5-8.3-5-8.3-5z"></path>
            <circle cx="10" cy="10" r="2.2"></circle>
          </svg>
          <svg *ngSwitchCase="'edit'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
            <path d="M13.8 3.3l2.9 2.9-9.4 9.4-3.9 1 1-3.9 9.4-9.4z"></path>
          </svg>
          <svg *ngSwitchCase="'delete'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
            <path d="M3.5 5.5h13"></path>
            <path d="M7.5 5.5V4.4A1.4 1.4 0 018.9 3h2.2a1.4 1.4 0 011.4 1.4v1.1"></path>
            <path d="M6.5 6.5l.7 9.1A1.5 1.5 0 008.7 17h2.6a1.5 1.5 0 001.5-1.4l.7-9.1"></path>
          </svg>
          <svg *ngSwitchCase="'open_form'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
            <path d="M11.5 3.5H15.5V7.5"></path>
            <path d="M8.5 11.5L15.5 4.5"></path>
            <path d="M14 11.5V15.5A1.5 1.5 0 0112.5 17H4.5A1.5 1.5 0 013 15.5V7.5A1.5 1.5 0 014.5 6H8.5"></path>
          </svg>
          <svg *ngSwitchCase="'add'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
            <path d="M10 4v12M4 10h12"></path>
          </svg>
          <svg *ngSwitchCase="'status'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4">
            <circle cx="10" cy="10" r="7"></circle>
            <path d="M10 9v4M10 6.5h.01"></path>
          </svg>
          <i *ngSwitchDefault [class]="action.iconClass"></i>
        </ng-container>
      </button>
    </div>

    <ng-template #wrapActions>
      <div class="relative inline-flex rounded-lg shadow-sm">
        <div class="inline-flex items-center overflow-hidden rounded-lg">
          <button
            type="button"
            class="inline-flex h-8 items-center bg-blue-700 px-3 text-xs font-semibold text-white transition hover:bg-blue-800 active:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
            (click)="mainClick($event)"
          >
            Actions</button>

          <button
            type="button"
            class="flex h-8 w-9 items-center justify-center border-l border-white/30 bg-blue-700 text-white transition hover:bg-blue-800 active:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
            (click)="toggle($event)"
            aria-haspopup="menu"
            [attr.aria-expanded]="menuEl ? 'true' : 'false'"
            title="More actions"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
              <path
                fill-rule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                clip-rule="evenodd"
              />
            </svg>
            <span class="sr-only">Toggle menu</span>
          </button>
        </div>
      </div>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgActionCellComponent implements ICellRendererAngularComp, OnDestroy {
  params!: any;
  menuEl: HTMLElement | null = null;
  private readonly renderer = inject(Renderer2);
  private readonly el = inject(ElementRef);
  private readonly zone = inject(NgZone);

  agInit(params: any): void {
    this.params = params;
  }

  refresh(): boolean {
    return false;
  }

  mainClick(event: MouseEvent) {
    event.stopPropagation();
    this.params?.onMainAction?.(this.params?.data, this.params, event);
  }

  toggle(event: MouseEvent) {
    event.stopPropagation();
    this.menuEl ? this.close() : this.open(event);
  }

  private getActions(): GridAction[] {
    return (this.params?.actions ?? []) as GridAction[];
  }

  private getDisplayMode(): ActionDisplayMode {
    return (this.params?.actionDisplayMode ?? 'wrap') as ActionDisplayMode;
  }

  isVisible(action: GridAction, row: any): boolean {
    if (action.enabled === false) return false;

    if (typeof action.visible === 'function') return !!action.visible(row);
    if (typeof action.visible === 'boolean') return action.visible;

    return true;
  }

  isDisabled(action: GridAction, row: any): boolean {
    if (typeof action.disabled === 'function') return !!action.disabled(row);
    if (typeof action.disabled === 'boolean') return action.disabled;
    return false;
  }

  isFloatMode(): boolean {
    return this.getDisplayMode() === 'float';
  }

  visibleActions(): GridAction[] {
    const rowData = this.params?.data;
    return this.getActions().filter((action) => this.isVisible(action, rowData));
  }

  actionClick(event: MouseEvent, action: GridAction) {
    event.stopPropagation();
    const rowData = this.params?.data;
    if (this.isDisabled(action, rowData)) return;

    this.zone.run(() => {
      this.params?.onAction?.(action.key, rowData, this.params);
      this.params?.actionCallbacks?.[action.key]?.(rowData, this.params);
    });
  }

  open(event: MouseEvent) {
    const anchor = event.target as HTMLElement;
    const btn = anchor.closest('button') as HTMLElement;
    const rect = (btn ?? anchor).getBoundingClientRect();
    const rowData = this.params?.data;
    const mode = this.getDisplayMode();

    this.menuEl = this.renderer.createElement('div') as HTMLElement;
    this.renderer.setAttribute(this.menuEl, 'role', 'menu');
    this.renderer.setAttribute(this.menuEl, 'tabindex', '-1');

    if (mode === 'float') {
      this.menuEl.className =
        'fixed z-[10000] flex max-w-[420px] flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xl';
    } else {
      this.menuEl.className =
        'fixed z-[10000] min-w-[160px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl';
    }

    const menuEl = this.menuEl;
    if (!menuEl) return;

    for (const action of this.getActions()) {
      if (!this.isVisible(action, rowData)) continue;

      const item = this.renderer.createElement('button');
      this.renderer.setAttribute(item, 'type', 'button');
      this.renderer.setAttribute(item, 'role', 'menuitem');

      const disabled = this.isDisabled(action, rowData);
      if (disabled) this.renderer.setProperty(item, 'disabled', true);

      if (mode === 'float') {
        item.className =
          'inline-flex h-8 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50';
      } else {
        item.className =
          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50';
      }

      if (action.iconClass) {
        const icon = this.renderer.createElement('i');
        icon.className = `${action.iconClass} text-slate-500`;
        this.renderer.appendChild(item, icon);
      }

      const label = this.renderer.createElement('span');
      this.renderer.setProperty(label, 'textContent', action.label);
      this.renderer.appendChild(item, label);

      if (action.btnClass) {
        item.className += ` ${action.btnClass}`;
      }

      this.renderer.listen(item, 'click', (e: Event) => {
        e.stopPropagation();
        if (disabled) return;

        this.zone.run(() => {
          this.params?.onAction?.(action.key, rowData, this.params);
          this.params?.actionCallbacks?.[action.key]?.(rowData, this.params);
        });

        this.close();
      });

      this.renderer.appendChild(menuEl, item);
    }

    this.renderer.appendChild(document.body, menuEl);

    const panelWidth = mode === 'float' ? 360 : 180;
    const top = rect.bottom + 6;
    const left = Math.max(8, rect.left - panelWidth + rect.width);

    menuEl.style.top = `${top}px`;
    menuEl.style.left = `${left}px`;

    document.addEventListener('click', this.handleOutsideClick);
  }

  handleOutsideClick = (ev: MouseEvent) => {
    const target = ev.target as Node;
    if (this.menuEl?.contains(target) || this.el.nativeElement.contains(target)) return;
    this.close();
  };

  close() {
    if (this.menuEl) {
      document.removeEventListener('click', this.handleOutsideClick);
      this.renderer.removeChild(document.body, this.menuEl);
      this.menuEl = null;
    }
  }

  ngOnDestroy() {
    this.close();
  }
}
