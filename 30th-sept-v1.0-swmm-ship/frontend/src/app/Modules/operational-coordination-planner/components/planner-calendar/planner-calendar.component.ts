import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  Activity,
  CAT_COLOR,
  addDays,
  startOfDay,
} from '../../constants/data';
import { PlannerStore } from '../../store/planner.store';

interface DayHead { d: Date; dow: string; dom: string; month: string; today: boolean; }

const STATUS_COLOR: Record<string, string> = {
  scheduled: '#3b82f6',      // Upcoming
  active: '#38bdf8',          // Already planned
  delayed: '#f87171',         // Overdue and not done
  completed: '#78716c',       // Done
  conflict: '#ef4444',        // Planning overdue
  cancelled: '#6b7280',       // Cancelled - muted grey, not a "to do" color
};

const DART_STATE_COLORS: Record<string, string> = {
  pending: '#facc15',
  overdue: '#e57373',
  closed: '#9e9e9e',
  raised: '#f472b6',
};

const PLAN_FLAG_STATE_COLORS: Record<string, string> = {
  planned: '#9e9e9e',
  due: '#f59e0b',
  overdue: '#e57373',
};

const RUNNING_HOURS_STATE_COLORS: Record<string, string> = {
  done: '#9e9e9e',
  overdue: '#e57373',
  upcoming: '#34d399',
};

const DOW_SHORT = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const WEEKDAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/**
 * Calendar view router. Switches between Year, Month, Week, and Day
 * layouts based on `store.view()`.
 */
@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './planner-calendar.component.scss',
  templateUrl: './planner-calendar.component.html',

})
export class CalendarComponent {
  protected readonly store = inject(PlannerStore);
  private readonly today = new Date();
  protected readonly DOW_SHORT = DOW_SHORT;
  protected readonly WEEKDAY_SHORT = WEEKDAY_SHORT;

  protected readonly weekDays = computed<DayHead[]>(() => {
    const start = startOfDay(this.store.rangeStart());
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return {
        d,
        dow: WEEKDAY_SHORT[d.getDay()],
        dom: String(d.getDate()).padStart(2, '0'),
        month: d.toLocaleString('en-US', { month: 'short' }),
        today: d.getFullYear() === this.today.getFullYear()
          && d.getMonth() === this.today.getMonth()
          && d.getDate() === this.today.getDate(),
      };
    });
  });

  protected readonly dayHead = computed<{ dow: string; dom: string; month: string; isToday: boolean }>(() => {
    const d = startOfDay(this.store.rangeStart());
    return {
      dow: WEEKDAY_SHORT[d.getDay()],
      dom: String(d.getDate()).padStart(2, '0'),
      month: d.toLocaleString('en-US', { month: 'short' }),
      isToday: d.getFullYear() === this.today.getFullYear()
        && d.getMonth() === this.today.getMonth()
        && d.getDate() === this.today.getDate(),
    };
  });

  // --- Month view ---
  protected readonly monthCells = computed(() => {
    const start = startOfDay(this.store.rangeStart());
    const ref = new Date(start);
    const monthStart = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const firstDow = (monthStart.getDay() + 6) % 7;
    const firstCell = new Date(monthStart);
    firstCell.setDate(monthStart.getDate() - firstDow);
    const today = this.today;

    // Use year activities if year view is loaded, otherwise use current week/month
    const activities = this.store.yearActivities().length > 0
      ? this.store.yearFilteredActivities()
      : this.store.filteredActivities();

    const byDate = new Map<string, Activity[]>();
    for (const a of activities) {
      if (a.date) {
        const arr = byDate.get(a.date);
        if (arr) arr.push(a); else byDate.set(a.date, [a]);
      }
    }

    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(firstCell); d.setDate(firstCell.getDate() + i);
      const isoDate = this.toIsoDate(d);
      const acts = byDate.get(isoDate) ?? [];
      return {
        d,
        inMonth: d.getMonth() === ref.getMonth(),
        isToday: d.getFullYear() === today.getFullYear()
          && d.getMonth() === today.getMonth()
          && d.getDate() === today.getDate(),
        acts,
      };
    });
  });

  // --- Year view ---
  protected readonly yearMonths = computed(() => {
    const year = this.store.yearRef();
    const today = this.today;

    const byDate = new Map<string, Activity[]>();
    for (const a of this.store.yearFilteredActivities()) {
      const arr = byDate.get(a.date);
      if (arr) arr.push(a); else byDate.set(a.date, [a]);
    }

    return Array.from({ length: 12 }, (_, monthIndex) => {
      const monthStart = new Date(year, monthIndex, 1);
      const firstCell = new Date(monthStart);
      firstCell.setDate(monthStart.getDate() - monthStart.getDay()); // Sun-first week

      const cells = Array.from({ length: 42 }, (_, i) => {
        const d = new Date(firstCell); d.setDate(firstCell.getDate() + i);
        return {
          d,
          inMonth: d.getMonth() === monthIndex,
          isToday: d.getFullYear() === today.getFullYear()
            && d.getMonth() === today.getMonth()
            && d.getDate() === today.getDate(),
          acts: byDate.get(this.toIsoDate(d)) ?? [],
        };
      });

      return {
        label: monthStart.toLocaleString('en-US', { month: 'long' }),
        cells,
      };
    });
  });

  onYearDayPick(day: Date) {
    this.store.setRangeStart(day);
    this.store.view.set('Month');
  }

  protected readonly timeSlots = ['all-day', '12am', '1am', '2am', '3am', '4am', '5am', '6am', '7am', '8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9pm', '10pm', '11pm'];

  protected filteredActivitiesForDate(date: Date, timeSlot?: string): Activity[] {
    const isoDate = this.toIsoDate(date);
    const allActivities = this.store.filteredActivities();
    const matchingByDate = allActivities.filter(a => a.date === isoDate);
    if (!timeSlot || timeSlot === 'all-day') {
      return matchingByDate.filter(a => !a.t || a.t === '');
    }
    return matchingByDate.filter(a => {
      if (!a.t || a.t === '') return false;
      const timeParts = a.t.split(':');
      if (timeParts.length === 0) return false;
      const hour = parseInt(timeParts[0], 10);
      if (isNaN(hour)) return false;
      let slotHour = hour % 12;
      if (slotHour === 0) slotHour = 12;
      const ampm = hour < 12 ? 'am' : 'pm';
      const expectedSlot = `${slotHour}${ampm}`;
      return timeSlot.toLowerCase() === expectedSlot.toLowerCase();
    });
  }

  eventColor(activity: Activity): string {
    // Priority: state-specific colors (DART, plan flag, running hours)
    if (activity.dart_state && DART_STATE_COLORS[activity.dart_state]) {
      return DART_STATE_COLORS[activity.dart_state];
    }
    if (activity.plan_state && PLAN_FLAG_STATE_COLORS[activity.plan_state]) {
      return PLAN_FLAG_STATE_COLORS[activity.plan_state];
    }
    if (activity.rh_state && RUNNING_HOURS_STATE_COLORS[activity.rh_state]) {
      return RUNNING_HOURS_STATE_COLORS[activity.rh_state];
    }
    // Fallback to status color
    if (activity.status && STATUS_COLOR[activity.status.toLowerCase()]) {
      return STATUS_COLOR[activity.status.toLowerCase()];
    }
    // Fallback to category color
    return CAT_COLOR[activity.cat] || '#94a3b8';
  }

  onPick(e: Event, id: string) {
    e.stopPropagation();
    const activity = this.store.filteredActivities().find((item) => item.id === id);
    this.store.selectActivityWithDate(
      id,
      activity ? this.activityDateKey(activity) : null,
    );
  }

  openOverdueDarts(e: Event) {
    e.stopPropagation();
    this.store.openOverdueDartsModal();
  }

  showAllEventsForDay(e: Event, day: Date, acts: Activity[]) {
    e.stopPropagation();
    this.store.openDayEventsModal(day, acts);
  }

  onMonthDayPick(e: Event, day: Date) {
    e.stopPropagation();
    this.store.openNewEventForDate(this.toIsoDate(day));
  }

  private activityDateKey(activity: Activity): string {
    const date = addDays(startOfDay(this.store.rangeStart()), activity.day);
    return this.toIsoDate(date);
  }

  private toIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  protected dateKey(date: Date): string {
    return this.toIsoDate(date);
  }
}
