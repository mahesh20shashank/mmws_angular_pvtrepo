import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
  inject,
  OnInit,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';

import { Router } from '@angular/router';
import { NotificationStore } from '../../../services/notification/notification-store';
import {
  NotificationCategory,
  NotificationItem,
} from '../../../services/notification/notification.model';
import { CommonApiService } from '../../../http/services/api.service';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

interface MailMessage {
  id?: number;
  initials: string;
  sender: string;
  subject: string;
  time: string;
  color: string;
  actionUrl?: string;
  isRead?: boolean;
}

type NotificationTab = 'today' | 'week' | 'earlier';

const CATEGORY_COLORS: Record<NotificationCategory, string> = {
  approval_granted: '#22C55E',
  approval_rejected: '#EF4444',
  approval_request: '#F59E0B',
  sync_status: '#3B82F6',
  info: '#6B7280',
};

@Component({
  selector: 'app-mail-noti-center',
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  templateUrl: './mail-noti-center.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./mail-noti-center.css'],
})
export class MailNotiCenter implements OnInit {
  readonly commonApiService = inject(CommonApiService);
  readonly router = inject(Router);
  readonly store = inject(NotificationStore);

  @Input() type: 'mail' | 'notification' | 'profile' = 'mail';
  @Output() closed = new EventEmitter<void>();

  readonly activeTab = signal<'inbox' | 'sent'>('inbox');
  readonly activeNotificationTab = signal<NotificationTab>('today');

  private readonly inboxMessages = signal<MailMessage[]>([]);
  private readonly sentMessages = signal<MailMessage[]>([]);

  ngOnInit(): void {
    if (this.type === 'mail') {
      this.loadMail();
    }
  }

  // ---------------- MAIL ----------------

  private loadMail(): void {
    this.commonApiService.getNotificationFeed('inbound').subscribe({
      next: (res) => this.inboxMessages.set((res ?? []).map((n) => this.toView(n))),
      error: () => this.inboxMessages.set([]),
    });
    this.commonApiService.getNotificationFeed('outbound').subscribe({
      next: (res) => this.sentMessages.set((res ?? []).map((n) => this.toView(n))),
      error: () => this.sentMessages.set([]),
    });
  }

  private readonly buckets = computed(() => {
    const today: MailMessage[] = [];
    const week: MailMessage[] = [];
    const earlier: MailMessage[] = [];
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const weekAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;

    for (const n of this.store.feed().filter((item) => !item.is_read)) {
      const view = this.toView(n);
      const ts = new Date(n.created_at).getTime();
      if (ts >= startOfToday) {
        today.push(view);
      } else if (ts >= weekAgo) {
        week.push(view);
      } else {
        earlier.push(view);
      }
    }
    return { today, week, earlier };
  });

  readonly messages = computed<MailMessage[]>(() => {
    if (this.type === 'mail') {
      return this.activeTab() === 'inbox'
        ? this.inboxMessages()
        : this.sentMessages();
    }
    if (this.type === 'notification') {
      return this.buckets()[this.activeNotificationTab()];
    }
    return [];
  });

  readonly hasUnread = computed(() =>
    this.store.feed().some((n) => !n.is_read),
  );

  onItemClick(mail: MailMessage): void {
    if (mail.id != null) {
      this.store.markRead([mail.id]);
    }
    if (mail.actionUrl) {
      this.router.navigateByUrl(mail.actionUrl);
    }
    this.closed.emit();
  }

  markAllRead(): void {
    const ids = this.store
      .feed()
      .filter((n) => !n.is_read)
      .map((n) => n.id);
    this.store.markRead(ids);
  }

  seeAll(): void {
    if (this.type !== 'mail') {
      return;
    }
    this.router.navigate([
      this.activeTab() === 'inbox'
        ? '/afterAuth/inbox/overview'
        : '/afterAuth/outbox/overview',
    ]);
  }

  private toView(n: NotificationItem): MailMessage {
    const box = n.direction === 'outbound' ? 'outbox' : 'inbox';
    return {
      id: n.id,
      initials: (n.source_label || n.title || 'N').charAt(0).toUpperCase(),
      sender: n.source_label,
      subject: n.title,
      time: this.formatTime(n.created_at),
      color: CATEGORY_COLORS[n.category] ?? CATEGORY_COLORS.info,
      actionUrl: `/afterAuth/${box}/overview?focus=${n.id}`,
      isRead: n.is_read,
    };
  }

  private formatTime(date: string): string {
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });
  }
}
