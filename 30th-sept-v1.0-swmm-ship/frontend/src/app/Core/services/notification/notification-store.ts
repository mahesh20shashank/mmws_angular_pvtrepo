import { Injectable, inject, signal } from '@angular/core';

import { NotificationItem } from './notification.model';
import { CommonApiService } from '../../http/services/api.service';

@Injectable({ providedIn: 'root' })
export class NotificationStore {
  private readonly api = inject(CommonApiService);

  readonly feed = signal<NotificationItem[]>([]);

  loadFeed(direction?: 'inbound' | 'outbound'): void {
    this.api.getNotificationFeed(direction).subscribe({
      next: (items) => this.feed.set(items ?? []),
      error: () => this.feed.set([]),
    });
  }

  markRead(ids: number[]): void {
    if (!ids.length) {
      return;
    }
    this.feed.update((items) =>
      items.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)),
    );
    this.api.markNotificationsRead(ids).subscribe();
  }
}
