import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ConfirmPopupType = 'success' | 'warning' | 'danger' | 'info';

export interface ConfirmPopupOptions {
  title?: string;
  message: string;
  type?: ConfirmPopupType;
  confirmText?: string;
  cancelText?: string;
  confirmClass?: string;
  cancelClass?: string;
  showCancel?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmPopupService {
  private readonly popupSubject = new BehaviorSubject<ConfirmPopupOptions | null>(null);
  readonly popup$ = this.popupSubject.asObservable();

  open(options: ConfirmPopupOptions): void {
    this.popupSubject.next({ type: 'warning', confirmText: 'Confirm', cancelText: 'Cancel', showCancel: true, ...options });
  }

  success(message: string, options: Partial<ConfirmPopupOptions> = {}): void {
    this.open({ title: 'Success', message, type: 'success', confirmText: 'Done', showCancel: false, ...options });
  }

  error(message: string, options: Partial<ConfirmPopupOptions> = {}): void {
    this.open({ title: 'Error', message, type: 'danger', confirmText: 'Close', showCancel: false, ...options });
  }

  info(message: string, options: Partial<ConfirmPopupOptions> = {}): void {
    this.open({ title: 'Information', message, type: 'info', confirmText: 'Ok', showCancel: false, ...options });
  }

  close(): void {
    this.popupSubject.next(null);
  }
}
