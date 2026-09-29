import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';

import { IconComponent } from '../planner-icon/planner-icon.component';

import {
  MS_PER_DAY,
  addDays,
  startOfDay,
} from '../../constants/data';

import { PlannerStore } from '../../store/planner.store';

interface DayCell {
  d: Date;
  inMonth: boolean;
  isSelectedStart: boolean;
  isSelectedEnd: boolean;
  isInRange: boolean;
  isToday: boolean;
}

/**
 * Clicking any day jumps the planner
 * to the week containing that date.
 *
 * Emits a bubbling `dp-pick` event
 * so the parent can close itself.
 */
@Component({
  selector: 'app-date-popover',

  standalone: true,

  imports: [IconComponent, ButtonComponent],

  changeDetection: ChangeDetectionStrategy.OnPush,

  styleUrl: './planner-date-popover.component.scss',

  host: {
    '(click)': '$event.stopPropagation()',
  },

  templateUrl: './planner-date-popover.component.html',

})
export class DatePopoverComponent {
  private readonly store =
    inject(PlannerStore);

  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly monthOffset =
    signal(0);

  protected readonly dowLabels =
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
      .map((l, i) => ({
        k: i,
        l,
      }));

  private readonly today =
    new Date();

  protected readonly baseDate =
    computed(() =>
      startOfDay(this.store.rangeStart())
    );

  protected readonly currentMonth =
    computed(() =>
      new Date(
        this.baseDate().getFullYear(),
        this.baseDate().getMonth() + this.monthOffset(),
        1
      )
    );

  protected readonly monthName =
    computed(() =>
      this.currentMonth().toLocaleString(
        'en-US',
        {
          month: 'long',
        }
      )
    );

  protected readonly yearLabel =
    computed(() =>
      String(this.currentMonth().getFullYear())
    );

  protected readonly cells =
    computed<DayCell[]>(() => {

      const cur = this.currentMonth();

      const first = new Date(cur);

      const dow =
        first.getDay();

      first.setDate(
        first.getDate() - dow
      );

      const selWeekStart =
        startOfDay(this.store.rangeStart());
      const selWeekEnd = addDays(selWeekStart, 6);

      return Array.from(
        { length: 42 },
        (_, i) => {

          const d = new Date(first);

          d.setDate(
            first.getDate() + i
          );

          const diff = Math.floor(
            (
              d.getTime()
              - selWeekStart.getTime()
            ) / MS_PER_DAY
          );

          return {
            d,

            inMonth:
              d.getMonth()
              === cur.getMonth(),

            isSelectedStart:
              diff === 0,

            isSelectedEnd:
              diff === 6,

            isInRange:
              d.getTime() > selWeekStart.getTime()
              && d.getTime() < selWeekEnd.getTime(),

            isToday:
              d.getFullYear()
                === this.today.getFullYear()
              &&
              d.getMonth()
                === this.today.getMonth()
              &&
              d.getDate()
                === this.today.getDate(),
          };
        }
      );
    });

  protected prevMonth() {
    this.monthOffset.update(v => v - 1);
  }

  protected nextMonth() {
    this.monthOffset.update(v => v + 1);
  }

  protected pick(d: Date) {
    this.store.setRangeStart(startOfDay(d));

    this.host.nativeElement.dispatchEvent(
      new CustomEvent('dp-pick', {
        bubbles: true,
      })
    );
  }
}
