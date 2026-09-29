import { Injectable } from '@angular/core';
import { toast } from 'ngx-sonner';

type ToastKind = 'success' | 'error' | 'warning' | 'info';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  success(message: string, title = 'Success'): void {
    this.show('success', title, message);
  }

  error(message: string, title = 'Error'): void {
    this.show('error', title, message);
  }

  warning(message: string, title = 'Warning'): void {
    this.show('warning', title, message);
  }

  info(message: string, title = 'Information'): void {
    this.show('info', title, message);
  }

  private show(kind: ToastKind, title: string, message: string): void {
    const description = message?.trim() && message.trim() !== title ? message.trim() : undefined;
    toast[kind](title, description ? { description } : {});
  }
}
