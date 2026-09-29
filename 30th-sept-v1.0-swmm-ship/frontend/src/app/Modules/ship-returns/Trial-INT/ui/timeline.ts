import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

/** Optional status drives node + connector segment colors */
export type TimelineStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface TimelineItem {
  title: string;
  description?: string;
  time?: string;
  icon?: string;
  status?: TimelineStatus;
}

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="w-full"
      [ngClass]="{
        'space-y-1': orientation === 'vertical',
        'overflow-x-auto py-2': orientation === 'horizontal'
      }"
    >
      <div
        class="relative"
        [ngClass]="{
          'space-y-1': orientation === 'vertical',
          'inline-flex min-w-full items-start gap-0 px-1': orientation === 'horizontal'
        }"
      >
        <div
          *ngFor="let item of items; let i = index"
          class="group relative"
          [ngClass]="{
            'pl-11': orientation === 'vertical',
            'flex w-[140px] min-w-[140px] flex-col items-center': orientation === 'horizontal'
          }"
        >
          <!-- Connector segment (color follows this step's status) -->
          <div
            *ngIf="i !== items.length - 1"
            class="absolute z-0"
            [ngClass]="connectorSegmentClasses(item, orientation)"
          ></div>

          <!-- Node -->
          <div
            class="absolute z-[1] flex items-center justify-center rounded-full border-2 border-white shadow-md transition-transform duration-200 group-hover:scale-110"
            [ngClass]="nodeClasses(item)"
          >
            <span class="h-2 w-2 rounded-full bg-white/90"></span>
          </div>

          <!-- Compact label only -->
          <div
            class="relative z-[1] min-h-[2rem] cursor-default"
            [ngClass]="{
              'pt-0.5': orientation === 'vertical',
              'mt-7 flex w-full justify-center px-0.5': orientation === 'horizontal'
            }"
          >
            <p
              class="truncate text-[11px] font-medium leading-tight text-white/70 group-hover:text-white"
              [title]="item.title"
            >
              {{ item.title }}
            </p>

            <!-- Hover overlay: full info -->
            <div
              class="pointer-events-none invisible absolute z-50 min-w-[200px] max-w-[280px] rounded-lg border border-white/20 bg-[#0d2438] p-3 text-left opacity-0 shadow-xl transition-all duration-150 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100"
              [ngClass]="{
                'left-0 top-full mt-1': orientation === 'vertical',
                'left-1/2 top-full mt-2 -translate-x-1/2': orientation === 'horizontal'
              }"
            >
              <p
                *ngIf="item.time"
                class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/50"
              >
                {{ item.time }}
              </p>
              <p class="text-sm font-semibold text-white">{{ item.title }}</p>
              <p *ngIf="item.description" class="mt-1.5 text-xs leading-relaxed text-white/70">
                {{ item.description }}
              </p>
              <span
                *ngIf="item.status"
                class="mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                [ngClass]="statusBadgeClasses(item)"
              >
                {{ statusLabel(item.status) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class TimelineComponent {
  @Input() items: TimelineItem[] = [];
  @Input() orientation: 'vertical' | 'horizontal' = 'vertical';

  statusLabel(s: TimelineStatus): string {
    const map: Record<TimelineStatus, string> = {
      pending: 'Pending',
      in_progress: 'In progress',
      completed: 'Completed',
      failed: 'Failed',
      skipped: 'Skipped',
    };
    return map[s] ?? s;
  }

  statusBadgeClasses(item: TimelineItem): string {
    const s = item.status ?? 'pending';
    const map: Record<TimelineStatus, string> = {
      pending: 'border border-white/20 bg-white/10 text-white/60',
      in_progress: 'border border-amber-400/40 bg-amber-500/15 text-amber-300',
      completed: 'border border-emerald-400/35 bg-emerald-500/10 text-emerald-300',
      failed: 'border border-rose-400/40 bg-rose-500/15 text-rose-400',
      skipped: 'border border-white/20 bg-white/10 text-white/50',
    };
    return map[s] ?? map.pending;
  }

  nodeClasses(item: TimelineItem): string {
    const s = item.status ?? 'pending';
    const baseVert = 'left-0 top-1 h-7 w-7';
    const baseHorz = 'left-1/2 top-0 h-7 w-7 -translate-x-1/2';
    const pos = this.orientation === 'vertical' ? baseVert : baseHorz;
    const ring: Record<TimelineStatus, string> = {
      pending: 'ring-slate-200',
      in_progress: 'ring-amber-200',
      completed: 'ring-emerald-200',
      failed: 'ring-red-200',
      skipped: 'ring-slate-300',
    };
    const bg: Record<TimelineStatus, string> = {
      pending: 'bg-gradient-to-br from-slate-400 to-slate-500',
      in_progress: 'bg-gradient-to-br from-amber-500 to-orange-500',
      completed: 'bg-gradient-to-br from-emerald-500 to-teal-600',
      failed: 'bg-gradient-to-br from-red-500 to-rose-600',
      skipped: 'bg-gradient-to-br from-slate-400 to-slate-500',
    };
    return `${pos} ${ring[s] ?? ring.pending} ring-2 ${bg[s] ?? bg.pending}`;
  }

  connectorSegmentClasses(item: TimelineItem, orientation: 'vertical' | 'horizontal'): string {
    const s = item.status ?? 'pending';
    const vertical: Record<TimelineStatus, string> = {
      pending:
        'left-[13px] top-8 h-[calc(100%+4px)] w-[2px] bg-gradient-to-b from-slate-300 to-slate-200',
      in_progress:
        'left-[13px] top-8 h-[calc(100%+4px)] w-[2px] bg-gradient-to-b from-amber-400 to-amber-300',
      completed:
        'left-[13px] top-8 h-[calc(100%+4px)] w-[2px] bg-gradient-to-b from-emerald-500 to-emerald-400',
      failed:
        'left-[13px] top-8 h-[calc(100%+4px)] w-[2px] bg-gradient-to-b from-red-500 to-red-400',
      skipped:
        'left-[12px] top-8 h-[calc(100%+4px)] w-0 border-l-2 border-dashed border-slate-300 bg-transparent',
    };
    const horizontal: Record<TimelineStatus, string> = {
      pending:
        'left-[calc(50%+14px)] right-[-56px] top-[13px] h-[2px] bg-gradient-to-r from-slate-300 to-slate-200',
      in_progress:
        'left-[calc(50%+14px)] right-[-56px] top-[13px] h-[2px] bg-gradient-to-r from-amber-400 to-amber-300',
      completed:
        'left-[calc(50%+14px)] right-[-56px] top-[13px] h-[2px] bg-gradient-to-r from-emerald-500 to-emerald-400',
      failed:
        'left-[calc(50%+14px)] right-[-56px] top-[13px] h-[2px] bg-gradient-to-r from-red-500 to-red-400',
      skipped:
        'left-[calc(50%+14px)] right-[-56px] top-[12px] h-0 border-t-2 border-dashed border-slate-300 bg-transparent',
    };
    if (orientation === 'vertical') {
      return vertical[s] ?? vertical.pending;
    }
    return horizontal[s] ?? horizontal.pending;
  }
}
