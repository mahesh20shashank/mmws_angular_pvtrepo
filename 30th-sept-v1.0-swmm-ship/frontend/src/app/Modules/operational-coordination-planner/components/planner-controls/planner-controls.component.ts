import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  Input,
  signal,
} from '@angular/core';

import { IconComponent } from '../planner-icon/planner-icon.component';
import { ViewMode, formatRangeFromDate } from '../../constants/data';
import { PlannerStore } from '../../store/planner.store';
import { DatePopoverComponent } from '../planner-date-popover/planner-date-popover.component';

/**
 * Controls row above the calendar - view tabs, week navigation, date
 * popover, and "+ New Activity". Department/category filtering now lives in
 * the persistent left `app-filter-panel` sidebar instead of dropdowns here.
 *
 * The date popover closes on outside-click via a host-bound document listener.
 */
@Component({
  selector: 'app-controls',
  standalone: true,
  imports: [IconComponent, DatePopoverComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.compact]': 'compact',
  },
  styleUrl: './planner-controls.component.scss',
  templateUrl: './planner-controls.component.html',
})
export class ControlsComponent {
  @Input() compact = false;

  protected readonly store = inject(PlannerStore);

  protected readonly dateOpen = signal(false);

  protected readonly rangeLabel = computed(() => {
    const view = this.store.view();
    const rangeStart = this.store.rangeStart();

    if (view === 'Year') {
      return String(this.store.yearRef());
    }

    if (view === 'Month') {
      // Show: "1 August - 31 August 2026"
      const monthStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      const monthEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 0);
      const pad = (n: number) => String(n).padStart(2, '0');
      const month = monthStart.toLocaleString('en-US', { month: 'short' });
      return `${pad(monthStart.getDate())} ${month} - ${pad(monthEnd.getDate())} ${month} ${monthEnd.getFullYear()}`;
    }

    if (view === 'Day') {
      // Show: "31 August 2026"
      return rangeStart.toLocaleString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // Week view: "31 Aug - 06 Sep 2026"
    return formatRangeFromDate(rangeStart);
  });

  protected readonly views: ViewMode[] = [
    'Year',
    'Month',
    'Week',
    'Day',
  ];

  protected selectView(v: ViewMode) {
    this.store.view.set(v);
    if (v === 'Year') {
      // Sync yearRef to current rangeStart year, then load year data
      const currentYear = this.store.rangeStart().getFullYear();
      this.store.yearRef.set(currentYear);
      void this.store.loadYear(currentYear);
    } else {
      // Reload data when switching to Week/Month/Day view
      void this.store.reloadCurrentRange();
    }
  }

  protected toggleDateOpen() {
    if (this.store.view() === 'Year') {
      return;
    }
    this.dateOpen.update(v => !v);
  }

  protected stepPrev() {
    const view = this.store.view();
    if (view === 'Year') {
      this.store.stepYear(-1);
    } else if (view === 'Month') {
      this.store.stepMonth(-1);
    } else if (view === 'Day') {
      this.store.stepDay(-1);
    } else {
      this.store.stepWeek(-1);
    }
  }

  protected stepNext() {
    const view = this.store.view();
    if (view === 'Year') {
      this.store.stepYear(1);
    } else if (view === 'Month') {
      this.store.stepMonth(1);
    } else if (view === 'Day') {
      this.store.stepDay(1);
    } else {
      this.store.stepWeek(1);
    }
  }

  protected goToday() {
    if (this.store.view() === 'Year') {
      const currentYear = new Date().getFullYear();
      this.store.yearRef.set(currentYear);
      void this.store.loadYear(currentYear);
    } else {
      this.store.goToday();
    }
  }

  @HostListener('document:mousedown', ['$event'])
  protected onDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement;

    const inDatePopover =
      !!target.closest('app-date-popover');

    const isDateAnchor =
      !!target.closest('.range');

    if (!inDatePopover && !isDateAnchor) {
      this.dateOpen.set(false);
    }
  }
}
