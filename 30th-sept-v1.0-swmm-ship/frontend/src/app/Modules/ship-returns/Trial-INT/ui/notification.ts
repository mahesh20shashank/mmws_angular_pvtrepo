import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs/operators';
import { ApiService, RequestParams } from '../api.service';
import { Router } from '@angular/router';
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto mb-10 max-w-8xl ">
      <div class="glass-card relative overflow-hidden rounded-2xl border border-white/10 text-white">
        <!-- Tabs -->
        <div
          class="sticky top-0 z-10 border-b border-white/10 p-3 sm:p-4"
        >
          <div class="flex w-fit flex-wrap gap-2 rounded-xl border border-white/15 bg-white/[0.06] p-1">
            <button
              *ngFor="let tab of tabs"
              type="button"
              (click)="setActiveTab(tab.id)"
              class="flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-bold transition"
              [ngClass]="activeTab === tab.id ? 'bg-[#1069AB] text-white shadow' : 'text-white/60 hover:text-white'"
            >
              <app-icon [name]="tab.icon" [size]="14"></app-icon>
              {{ tab.label }}
            </button>
          </div>
        </div>

        <!-- Header (always visible — not covered by loader) -->
        <div
          class="flex flex-col gap-3 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div
            class="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:gap-4"
          >
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div
                class="relative flex min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 sm:max-w-xs"
              >
                <app-icon
                  name="search"
                  [size]="14"
                  variant="muted"
                ></app-icon>
                <input
                  [(ngModel)]="searchTerm"
                  (ngModelChange)="onSearchChange()"
                  type="search"
                  placeholder="Search notifications..."
                  class="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/40"
                />
              </div>

              <input
                type="date"
                [(ngModel)]="fromDate"
                (ngModelChange)="onDateFilterChange()"
                aria-label="From date"
                style="color-scheme: dark;"
                class="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-xs text-white outline-none"
              />
              <input
                type="date"
                [(ngModel)]="toDate"
                (ngModelChange)="onDateFilterChange()"
                aria-label="To date"
                style="color-scheme: dark;"
                class="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-xs text-white outline-none"
              />
              <button
                *ngIf="fromDate || toDate"
                type="button"
                (click)="clearDateFilter()"
                class="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-[10px] font-semibold text-white transition hover:border-[#61C2FF]"
              >
                Clear dates
              </button>
            </div>
          </div>

          <button
            type="button"
            (click)="markAllRead()"
            class="shrink-0 self-start rounded-lg border border-[#4f8fd5] bg-[#1069AB] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-[#195d95] active:scale-[0.98] sm:self-center"
          >
            Mark All Read
          </button>
        </div>

        <!-- Content -->
        <div class="relative">
          <!-- List -->
          <div
            class="min-h-[300px] max-h-[calc(100vh-300px)] space-y-2 overflow-y-auto p-3 pr-2 custom-scrollbar sm:p-4"
            [class.pointer-events-none]="loading || searchPending"
            [class.opacity-40]="loading || searchPending"
          >
              <div
                *ngIf="!loading && !searchPending && !allNotifications.length"
                class="py-12 text-center text-xs text-white/60"
              >
                No notifications found.
              </div>

              <div
                *ngFor="let n of allNotifications"
                class="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] transition hover:border-[#61C2FF]/30"
              >
                <div
                  (click)="toggleExpand(n)"
                  class="group flex cursor-pointer items-start justify-between gap-4 px-4 py-3 transition hover:bg-white/[0.04]"
                >
                  <div class="flex min-w-0 flex-1 items-start gap-3">
                    <div
                      class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.05] text-[#61C2FF]"
                    >
                      <app-icon
                        name="bell"
                        [size]="16"
                      ></app-icon>
                      <div
                        *ngIf="isUnread(n)"
                        class="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#0a1929] bg-red-600"
                      ></div>
                    </div>

                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <h2
                          class="truncate text-[13px] font-bold tracking-tight text-white"
                        >
                          {{ n.title }}
                        </h2>

                        <span
                          class="rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                          [ngClass]="getStatusBadgeClasses(n.status?.name)"
                        >
                          {{ n.status?.name || 'Active' }}
                        </span>
                      </div>

                      <div class="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          class="rounded-full border border-white/15 bg-white/[0.05] px-2 py-1 text-[10px] uppercase tracking-wide text-white/80"
                        >
                          {{ n.source_service }}
                        </span>
                        <span
                          class="text-[11px] uppercase tracking-wide text-white/60"
                        >
                          {{ n.event_type_display }}
                        </span>
                      </div>

                      <p
                        class="mt-3 line-clamp-2 text-[13px] leading-6 text-white/80"
                      >
                        {{ n.message }}
                      </p>

                      <div
                        class="mt-3 flex flex-wrap items-center gap-2 text-[10px]"
                      >
                        <span class="font-semibold text-[#61C2FF]">
                          {{ n.metadata?.assign_user }}
                        </span>
                        <span class="text-white/40" aria-hidden="true"
                          >·</span
                        >
                        <span class="text-white/60">{{
                          n.metadata?.trial_number
                        }}</span>
                      </div>
                    </div>
                  </div>

                  <div class="flex shrink-0 flex-col items-end gap-3">
                    <div class="text-right">
                      <p
                        class="text-[11px] font-medium text-white/80"
                      >
                        {{ n.created_on | date: 'dd MMM' }}
                      </p>
                      <p class="text-[11px] text-white/40">
                        {{ n.created_on | date: 'hh:mm a' }}
                      </p>
                    </div>

                    <div class="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        [disabled]="!isUnread(n)"
                        (click)="markNotificationRead(n, $event)"
                        class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition"
                        [ngClass]="isUnread(n) ? 'border border-white/15 bg-white/[0.05] text-white' : 'text-white/40'"
                        [class.cursor-not-allowed]="!isUnread(n)"
                        [class.opacity-50]="!isUnread(n)"
                      >
                        <app-icon
                          name="mail-open"
                          [size]="12"
                        ></app-icon>
                        {{ isUnread(n) ? 'Mark as read' : 'Read' }}
                      </button>

                      <button
                        type="button"
                        (click)="goToDetail(n); $event.stopPropagation()"
                        class="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold text-white transition hover:border-[#61C2FF]"
                      >
                        <app-icon
                          name="external-link"
                          [size]="12"
                        ></app-icon>
                        Go To
                      </button>

                      <div
                        class="flex h-7 w-7 items-center justify-center rounded-lg border transition-all duration-200"
                        [class.rotate-180]="expandedId === n.id"
                        [ngClass]="expandedId === n.id ? 'border-[#61C2FF] bg-[#1069AB]/20' : 'border-white/15 bg-white/[0.05]'"
                      >
                        <app-icon
                          name="chevron-down"
                          [size]="12"
                        ></app-icon>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Expanded -->
                <div
                  *ngIf="expandedId === n.id"
                  class="border-t border-white/10 px-4 py-4"
                >
                  <div class="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <div class="mb-3 flex items-center gap-2">
                      <div
                        class="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/[0.05]"
                      >
                        <app-icon
                          name="mail"
                          [size]="14"
                          variant="accent"
                        ></app-icon>
                      </div>
                      <div>
                        <h3
                          class="text-[11px] font-bold text-white"
                        >
                          Notification Message
                        </h3>
                        <p
                          class="text-[9px] text-white/60"
                        >
                          Detailed notification content
                        </p>
                      </div>
                    </div>
                    <p
                      class="whitespace-pre-line text-[11px] leading-6 text-white/80"
                    >
                      {{ n.body || n.message }}
                    </p>
                  </div>

                  <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div class="rounded-xl border border-white/15 bg-white/[0.05] p-3">
                      <p
                        class="text-[8px] font-bold uppercase tracking-wide text-white/40"
                      >
                        Assigned By
                      </p>
                      <p class="mt-2 text-[11px] font-semibold">
                        {{ n.metadata?.assign_user || '-' }}
                      </p>
                    </div>
                    <div class="rounded-xl border border-white/15 bg-white/[0.05] p-3">
                      <p
                        class="text-[8px] font-bold uppercase tracking-wide text-white/40"
                      >
                        Trial Number
                      </p>
                      <p class="mt-2 text-[11px] font-semibold">
                        {{ n.metadata?.trial_number || '-' }}
                      </p>
                    </div>
                    <div class="rounded-xl border border-white/15 bg-white/[0.05] p-3">
                      <p
                        class="text-[8px] font-bold uppercase tracking-wide text-white/40"
                      >
                        Source Service
                      </p>
                      <p class="mt-2 text-[11px] font-semibold">
                        {{ n.source_service }}
                      </p>
                    </div>
                    <div class="rounded-xl border border-white/15 bg-white/[0.05] p-3">
                      <p
                        class="text-[8px] font-bold uppercase tracking-wide text-white/40"
                      >
                        Event Type
                      </p>
                      <p class="mt-2 text-[11px] font-semibold">
                        {{ n.event_type_display }}
                      </p>
                    </div>
                  </div>

                  <div
                    class="mt-4 flex flex-wrap items-center justify-end gap-2"
                  >
                    <button
                      type="button"
                      [disabled]="!isUnread(n)"
                      (click)="markNotificationRead(n, $event)"
                      class="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-semibold transition"
                      [ngClass]="isUnread(n) ? 'border-[#4f8fd5] bg-[#1069AB] text-white hover:bg-[#195d95]' : 'border-white/15 bg-white/[0.05] text-white/40'"
                      [class.cursor-not-allowed]="!isUnread(n)"
                      [class.opacity-50]="!isUnread(n)"
                    >
                      <app-icon
                        name="mail-open"
                        [size]="12"
                      ></app-icon>
                      {{ isUnread(n) ? 'Mark as read' : 'Already read' }}
                    </button>

                    <button
                      *ngIf="!n.is_completed"
                      type="button"
                      (click)="
                        completeNotification(n); $event.stopPropagation()
                      "
                      class="inline-flex items-center gap-2 rounded-lg border border-green-500/40 bg-white/[0.05] px-3 py-2 text-[10px] font-semibold text-green-400 transition hover:bg-green-500/10"
                    >
                      <app-icon
                        name="check"
                        [size]="12"
                      ></app-icon>
                      Complete
                    </button>

                    <button
                      type="button"
                      (click)="archiveNotification(n); $event.stopPropagation()"
                      class="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-white/[0.05] px-3 py-2 text-[10px] font-semibold text-amber-300 transition hover:bg-amber-500/10"
                    >
                      <app-icon
                        name="archive"
                        [size]="12"
                      ></app-icon>
                      Archive
                    </button>

                    <button
                      type="button"
                      (click)="goToDetail(n); $event.stopPropagation()"
                      class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-[10px] font-semibold text-white transition hover:border-[#61C2FF]"
                    >
                      <app-icon
                        name="external-link"
                        [size]="12"
                      ></app-icon>
                      Go To
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        <!-- Pagination -->
        <div
          class="flex items-center justify-between border-t border-white/10 px-4 py-3"
          [class.pointer-events-none]="loading || searchPending"
          [class.opacity-40]="loading || searchPending"
        >
          <span class="text-[10px] text-white/60"
            >Total: {{ totalCount }} items</span
          >
          <div class="flex gap-1 rounded-xl border border-white/15 bg-white/[0.06] p-1">
            <button
              type="button"
              [disabled]="currentPage === 1"
              (click)="onPageChange(currentPage - 1)"
              class="min-w-9 rounded-lg border border-white/15 bg-white/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-35"
            >
              Prev
            </button>
            <button
              type="button"
              class="min-w-9 rounded-lg border border-[#61C2FF] bg-[#1069AB] px-2.5 py-1.5 text-[10px] font-semibold text-white"
            >
              {{ currentPage }}
            </button>
            <button
              type="button"
              [disabled]="currentPage >= totalPage"
              (click)="onPageChange(currentPage + 1)"
              class="min-w-9 rounded-lg border border-white/15 bg-white/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-35"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class NotificationComponent implements OnInit, OnChanges, OnDestroy {
  @Input() initialTab?: string;
  @Input() activeTab = 'INBOX';


  tabs = [
    { id: 'INBOX', label: 'Inbox', icon: 'inbox' },
    { id: 'OUTBOX', label: 'Outbox', icon: 'send' },
    // { id: 'HISTORY', label: 'History', icon: 'history' },
    { id: 'ARCHIVE', label: 'Archive', icon: 'archive' },
  ];

  searchTerm = '';
  fromDate = '';
  toDate = '';
  expandedId: number | null = null;
  loading = false;
  searchPending = false;

  private readonly searchSubject = new Subject<string>();
  private readonly subscription = new Subscription();
  private static readonly SEARCH_DEBOUNCE_MS = 400;

  currentPage = 1;
  totalCount = 0;
  totalPage = 1;

  trackBarKeys = ['si', 'sr', 'sa', 'ti', 'tr', 'ta'];
  trackBarLabels: Record<string, string> = {
    si: 'Ship Initiator',
    sr: 'Ship Recommender',
    sa: 'Ship Approver',
    ti: 'Trial Initiator',
    tr: 'Trial Recommender',
    ta: 'Trial Approver',
  };

  // notifications.ts

  // allNotifications = [
  //   {
  //     id: 1,
  //     user_name: 'Admin Admin',
  //     role: 'DSP - ADMIN',
  //     initials: 'aa',
  //     status: 'Success',
  //     title: 'You have been assigned as Editor for test29-04-2026',
  //     message:
  //       "Hello dsp_user5, You have been assigned as an editor for the proposal 'test29-04-2026' in step 'APSO Approval'. Please review and take necessary action.",
  //     created_at: 'Apr 29, 3:27 PM',
  //     unread: true
  //   },

  //   {
  //     id: 2,
  //     user_name: 'Admin Admin',
  //     role: 'DSP - ADMIN',
  //     initials: 'aa',
  //     status: 'Success',
  //     title: 'You have been assigned as Editor for New_proposal_make',
  //     message:
  //       "Hello dsp_user5, You have been assigned as an editor for the proposal 'New_proposal_make' in step 'APSO Approval'. Please review and take necessary action.",
  //     created_at: 'Apr 29, 1:06 PM',
  //     unread: true
  //   },

  //   {
  //     id: 3,
  //     user_name: 'Admin Admin',
  //     role: 'DSP - ADMIN',
  //     initials: 'aa',
  //     status: 'failed',
  //     title: 'You have been assigned as Editor for AAAARERRER',
  //     message:
  //       "Hello dsp_user5, You have been assigned as an editor for the proposal 'AAAARERRER' in step 'APSO Approval'. Please review and take necessary action.",
  //     created_at: 'Apr 29, 11:00 AM',
  //     unread: false
  //   },

  //   {
  //     id: 4,
  //     user_name: 'Admin Admin',
  //     role: 'DSP - ADMIN',
  //     initials: 'aa',
  //     status: 'Success',
  //     title: 'You have been assigned as Editor for Revenue_new',
  //     message:
  //       "Hello dsp_user5, You have been assigned as an editor for the proposal 'Revenue_new' in step 'APSO Approval'. Please review and take necessary action.",
  //     created_at: 'Apr 21, 4:49 PM',
  //     unread: false
  //   },

  //   {
  //     id: 5,
  //     user_name: 'Admin Admin',
  //     role: 'DSP - ADMIN',
  //     initials: 'aa',
  //     status: 'pending',
  //     title: 'You have been assigned as Editor for New_revenue_ai_pro',
  //     message:
  //       "Hello dsp_user5, You have been assigned as an editor for the proposal 'New_revenue_ai_pro' in step 'APSO Approval'. Please review and take necessary action.",
  //     created_at: 'Mar 25, 9:38 AM',
  //     unread: false
  //   },

  //   {
  //     id: 6,
  //     user_name: 'Admin Admin',
  //     role: 'DSP - ADMIN',
  //     initials: 'aa',
  //     status: 'pending',
  //     title: 'You have been assigned as Editor for New project',
  //     message:
  //       "Hello dsp_user5, You have been assigned as an editor for the proposal 'New project' in step 'Formulation of Challenge'. Please review and take necessary action.",
  //     created_at: 'Mar 12, 10:46 AM',
  //     unread: false
  //   },

  //   {
  //     id: 7,
  //     user_name: 'Admin Admin',
  //     role: 'DSP - ADMIN',
  //     initials: 'aa',
  //     status: 'info',
  //     title: 'You have been assigned as Editor for New_vendor',
  //     message:
  //       "Hello dsp_user5, You have been assigned as an editor for the proposal 'New_vendor' in step 'Formulation of Challenge'. Please review and take necessary action.",
  //     created_at: 'Mar 3, 2:18 PM',
  //     unread: false
  //   }
  // ];
  private readonly apiService = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  getStatusBadgeClasses(statusName?: string | null): string {
    const status = (statusName || '').toLowerCase();

      if (status === 'success') {
        return '!text-green-400 !bg-green-500/15 border-green-500/40';
      }
      if (status === 'failed') {
        return '!text-red-400 !bg-red-500/15 border-red-500/40';
      }
      if (status === 'pending') {
        return '!text-amber-300 !bg-amber-500/20 border-amber-500/40';
      }
      return '!text-amber-300 !bg-amber-500/20 border-amber-500/30';
    }


  ngOnInit(): void {
    this.initSearchStream();
    this.setActiveTab(this.resolveInitialTab());
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.searchSubject.complete();
  }

  private initSearchStream(): void {
    const sub = this.searchSubject
      .pipe(
        debounceTime(NotificationComponent.SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
      )
      .subscribe(() => {
        this.currentPage = 1;
        this.load(1, true);
      });

    this.subscription.add(sub);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialTab'] && !changes['initialTab'].firstChange) {
      const tab = this.resolveInitialTab();
      if (tab !== this.activeTab) {
        this.setActiveTab(tab);
      }
    }
  }

  private resolveInitialTab(): string {
    if (this.initialTab && this.tabs.some((t) => t.id === this.initialTab)) {
      return this.initialTab;
    }
    return this.activeTab;
  }

  allNotifications: any[] = [];

  setActiveTab(tab: string) {
    this.activeTab = tab;
    this.currentPage = 1;
    this.load(1);
  }

  onSearchChange() {
    this.searchSubject.next(this.searchTerm);
  }

  onDateFilterChange() {
    this.currentPage = 1;
    this.load(1, true);
  }

  clearDateFilter() {
    this.fromDate = '';
    this.toDate = '';
    this.onDateFilterChange();
  }

  onPageChange(page: number) {
    if (page < 1 || page > this.totalPage) return;
    this.load(page, true);
  }

  private load(page: number = this.currentPage, subtle = false) {
    this.currentPage = page;
    const search = this.searchTerm?.trim();

    const params: RequestParams = {
      page,
      ...(search ? { search } : {}),
      ...(this.fromDate ? { from_date: this.fromDate } : {}),
      ...(this.toDate ? { to_date: this.toDate } : {}),
      ...(this.activeTab === 'INBOX' ? { is_completed: false } : {}),
      ...(this.activeTab === 'OUTBOX' ? { is_completed: true } : {}),
      ...(this.activeTab === 'ARCHIVE' ? { is_archive: 'True' } : {}),
    };

    if (subtle) {
      this.searchPending = true;
    } else {
      this.loading = true;
    }
    this.cdr.markForCheck();

    this.apiService
      .get(`/api/notification/notifications/`, params)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.searchPending = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((res: any) => {
        const items = Array.isArray(res)
          ? res
          : (res?.results ?? res?.data ?? []);

        this.allNotifications = items.map((n: any) =>
          this.normalizeNotification(n),
        );
        this.totalCount =
          res?.count ?? res?.page_data?.total_count ?? items.length;
        this.totalPage =
          res?.page_data?.last ??
          Math.max(1, Math.ceil(this.totalCount / this.getPageSize(res)));
        this.expandedId = null;
        this.cdr.markForCheck();
      });
  }

  private getPageSize(res: any): number {
    return res?.page_size ?? res?.page_data?.page_size ?? 10;
  }

  private normalizeNotification(n: any): any {
    const readValue = n.is_read ?? n.read ?? n.isRead;
    return {
      ...n,
      created_on: n.created_on ?? n.created_at,
      event_type_display: n.event_type_display ?? n.event_type,
      title: n.title ?? n.metadata?.title ?? n.event_type ?? 'Notification',
      message: n.message ?? n.body ?? '',
      source_service: n.source_service ?? n.metadata?.source_service ?? '',
      is_read: this.coerceIsRead(readValue),
    };
  }

  isUnread(n: any): boolean {
    const readValue = n?.is_read ?? n?.read ?? n?.isRead;
    return !this.coerceIsRead(readValue);
  }

  private coerceIsRead(value: unknown): boolean {
    if (value === false || value === 0 || value === '0' || value === 'false') {
      return false;
    }
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  hasTrackData(trackBar: any, key: string): boolean {
    if (!trackBar) return false;
    const value = trackBar[key];
    return (
      !!value && typeof value === 'object' && Object.keys(value).length > 0
    );
  }

  toggleExpand(notification: any) {
    if (this.expandedId === notification.id) {
      this.expandedId = null;

      return;
    }

    this.expandedId = notification.id;
  }
  goToDetail(notification: any) {
    const target = this.resolveNotificationRoute(notification);
    if (!target) {
      this.notificationService.error('No link available for this notification');
      return;
    }

    this.router.navigateByUrl(target);
  }

  private resolveNotificationRoute(notification: any): string | null {
    const raw =
      notification?.metadata?.trial_link ||
      notification?.metadata?.url ||
      notification?.metadata?.route ||
      notification?.action_url;

    if (!raw || typeof raw !== 'string') {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const url = new URL(trimmed);
        return `${url.pathname}${url.search}`;
      } catch {
        return null;
      }
    }

    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }
  markNotificationRead(notification: any, event?: Event) {
    event?.stopPropagation();

    if (!notification?.id || !this.isUnread(notification)) return;

    const payload = { is_read: true };
    this.apiService
      .patch(
        `/api/notification/notifications/${notification.id}/read/`,
        payload,
      )
      .subscribe({
        next: () => {
          notification.is_read = true;
          this.notificationService.success('Notification marked as read');
          this.cdr.markForCheck();
        },
        error: () => {
          this.notificationService.error('Failed to mark notification as read');
        },
      });
  }
  completeNotification(notification: any) {
    this.apiService
      .patch(`/api/notification/notifications/${notification.id}/complete/`, {})
      .subscribe({
        next: () => {
          this.notificationService.success('Notification completed');
          this.load(this.currentPage);
        },
      });
  }
  markAllRead() {
    const userId = localStorage.getItem('user_id');
    if (!userId) {
      this.notificationService.error('User ID not found. Please log in again.');
      return;
    }

    const payload = { is_read: true, user_id: Number(userId) || userId };
    this.apiService
      .patch(`/api/notification/notifications/mark-all-read/`, payload)
      .subscribe({
        next: () => {
          this.allNotifications = this.allNotifications.map((n: any) => ({
            ...n,
            is_read: true,
          }));

          this.notificationService.success('All notifications marked as read');
          this.cdr.markForCheck();
        },
        error: () => {
          this.notificationService.error(
            'Failed to mark all notifications as read',
          );
        },
      });
  }

  archiveNotification(notification: any) {
    this.apiService
      .patch(`/api/notification/notifications/${notification.id}/archive/`, {})
      .subscribe({
        next: () => {
          notification.is_archived = true;

          // OPTIONAL:
          // remove instantly from current list
          this.allNotifications = this.allNotifications.filter(
            (n: any) => n.id !== notification.id,
          );

          this.notificationService.success('Notification archived successfully');

          this.cdr.markForCheck();
        },

        error: () => {
          this.notificationService.error('Failed to archive notification');
        },
      });
  }
}
