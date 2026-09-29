import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConfirmPopupOptions, ConfirmPopupService, ConfirmPopupType } from './confirm-popup.service';

@Component({
  selector: 'app-confirm-popup',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="confirmPopup.popup$ | async as popup">
      <div class="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md" (click)="cancel(popup)">
        <div class="glass-card w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 font-inter text-white shadow-[0_30px_80px_rgba(0,0,0,0.4)]" (click)="$event.stopPropagation()">
          <div class="flex items-center gap-3 border-b border-white/10 px-5 py-4">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl border bg-white/[0.05]" [ngClass]="iconWrapClass(popup.type)">
              <i class="text-sm" [ngClass]="iconClass(popup.type)"></i>
            </div>
            <div class="min-w-0">
              <p class="text-[10px] font-bold uppercase tracking-widest text-white/60">{{ popup.type || 'warning' }}</p>
              <h2 class="truncate text-sm font-black text-white">{{ popup.title || 'Are you sure?' }}</h2>
            </div>
          </div>

          <div class="px-5 py-4">
            <p class="text-sm leading-6 text-white/80">{{ popup.message }}</p>
          </div>

          <div class="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
            <button *ngIf="popup.showCancel !== false" type="button" (click)="cancel(popup)"
              class="rounded-xl border px-5 py-2 text-xs font-bold uppercase tracking-wide transition active:scale-95"
              [ngClass]="popup.cancelClass || 'border-white/20 bg-white/10 text-white hover:bg-white/15'">
              {{ popup.cancelText || 'Cancel' }}
            </button>
            <button type="button" (click)="confirm(popup)"
              class="rounded-xl border px-5 py-2 text-xs font-bold uppercase tracking-wide shadow-lg transition active:scale-95"
              [ngClass]="popup.confirmClass || confirmClass(popup.type)">
              {{ popup.confirmText || 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    </ng-container>
  `,
})
export class ConfirmPopupComponent {
  readonly confirmPopup = inject(ConfirmPopupService);

  confirm(popup: ConfirmPopupOptions): void {
    this.confirmPopup.close();
    popup.onConfirm?.();
  }

  cancel(popup: ConfirmPopupOptions): void {
    this.confirmPopup.close();
    popup.onCancel?.();
  }

  iconClass(type: ConfirmPopupType = 'warning'): string {
    return ({ success: 'fa-solid fa-check text-emerald-400', warning: 'fa-solid fa-triangle-exclamation text-amber-300', danger: 'fa-solid fa-xmark text-red-400', info: 'fa-solid fa-info text-[#61C2FF]' })[type];
  }

  iconWrapClass(type: ConfirmPopupType = 'warning'): string {
    return ({ success: 'border-emerald-500/30', warning: 'border-amber-400/30', danger: 'border-red-400/30', info: 'border-[#61C2FF]/30' })[type];
  }

  confirmClass(type: ConfirmPopupType = 'warning'): string {
    return ({ success: 'bg-emerald-600 text-white hover:bg-emerald-500', warning: 'bg-amber-500 text-slate-950 hover:bg-amber-400', danger: 'bg-red-600 text-white hover:bg-red-500', info: 'border-[#4f8fd5] bg-[#1069AB] text-white hover:bg-[#195d95]' })[type];
  }
}
