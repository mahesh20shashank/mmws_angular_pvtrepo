import { ButtonComponent } from '../button/button.component';
import { Component, OnInit, OnChanges, OnDestroy, SimpleChanges, Input, Output, EventEmitter, HostListener, ElementRef, forwardRef, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  FormsModule,
} from '@angular/forms';

import { IconComponent } from '../icon/icon.component';

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

/** Value emitted / written to the form: a `yyyy-MM-dd` string (single date),
 *  a start/end pair of such strings (range), or null when cleared. */
export type DatePickerValue =
  | string
  | { start: string | null; end: string | null }
  | null;

interface CalendarCell {
  date: Date;
  day: number;
  currentMonth: boolean;
  isToday: boolean;
  disabled: boolean;
}

@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [FormsModule, IconComponent, ButtonComponent],

  templateUrl: './picker.html',
  styleUrls: ['./picker.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DatePickerComponent),
      multi: true,
    },
  ],
})
export class DatePickerComponent implements ControlValueAccessor, OnInit, OnChanges, OnDestroy {
  private readonly elRef = inject(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);


  /** Pick a single date instead of a range */
  @Input() singleDate = false;
  /** Minimum selectable date */
  @Input() minDate: Date | null = null;
  /** Maximum selectable date */
  @Input() maxDate: Date | null = null;
  /** Placeholder shown when nothing is selected */
  @Input() placeholder = '';
  /** Emits on every confirmed selection */
  @Output() dateChange = new EventEmitter<DatePickerValue>();
  @Input() label = "";
  @Input() required = false;
  /** Red border + placeholder text — the fuller post-submit treatment. Matches app-input-field's
   * `invalid`/`placeholderInvalid` pair so a form can mix date-pickers with other field types and
   * get the same validation look everywhere. */
  @Input() invalid = false;
  /** Live "required & blank" hint (pre-submit) — softer red, shown before the user has attempted
   * to submit. */
  @Input() placeholderInvalid = false;
  /** Locked-but-not-disabled — matches app-input-field/app-select-input's own `readonly` @Input:
   * a template-passed flag independent of the CVA `disabled` state (see `disabled`'s own doc),
   * for a field that's locked because its value comes from elsewhere (CMMS auto-fetch, a
   * cascade) rather than because the whole form/record is locked. Guards the calendar open the
   * same way `disabled` already does — until this existed, every date field SFD Actions computed
   * as "locked" (Installation Date, Authority Date, ...) rendered with a CMMS-auto-fetched badge
   * but was fully clickable/editable in Add mode regardless, since nothing ever passed `disabled`
   * there (that's an Update-mode-only mechanism, via FormControl.disable()). */
  @Input() readonly = false;
  // ── State ────────────────────────────────────────────────
  value: DateRange = { start: null, end: null };
  isOpen = false;
  displayMonth: number;
  displayYear: number;
  hoverDate: Date | null = null;
  pickingEnd = false;
  private static readonly closeAll = new EventTarget();
  private readonly handleCloseAll = () => {
    this.isOpen = false;
    this.cdr.markForCheck();
  };
  // ── Static data ──────────────────────────────────────────
  readonly dayHeaders = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  readonly months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  years: number[] = [];
  calendarCells: CalendarCell[] = [];

  // ── CVA callbacks ────────────────────────────────────────
  private onChange: (value: unknown) => void = () => undefined;
  private onTouched: () => void = () => undefined;


  constructor() {
    const now = new Date();
    this.displayMonth = now.getMonth();
    this.displayYear = now.getFullYear();
  }

  ngOnInit(): void {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 50; y <= currentYear + 20; y++) {
      this.years.push(y);
    }
    this.buildCalendar();
    DatePickerComponent.closeAll.addEventListener('close', this.handleCloseAll);
  }

  ngOnDestroy(): void {
    DatePickerComponent.closeAll.removeEventListener('close', this.handleCloseAll);
  }

  /** `calendarCells` (and each cell's own `disabled` flag) is only ever rebuilt from
   *  buildCalendar() — called at init, on month/year nav, and whenever writeValue() runs (this
   *  control's OWN value changing) — never in reaction to minDate/maxDate changing on their own.
   *  A parent binding `[minDate]` to a value that depends on ANOTHER field (e.g. sfd-management's
   *  dateFieldMin(), keyed off a sibling "Old Equipment Removal Date" control) updates this
   *  `@Input()` the moment that sibling gets a value — but without this hook, the already-rendered
   *  calendar grid just sat there with every day still enabled, since nothing had told it to
   *  recompute. The dashed/"blocked" locked look and the readonly guards on selectDate()/
   *  toggleCalendar() have never had this gap — only the min/max-date restriction did. */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['minDate'] || changes['maxDate']) {
      this.buildCalendar();
    }
  }

  writeValue(val: DateRange | Date | string | null): void {
    if (!val) {
      this.value = { start: null, end: null };
    } else if (typeof val === 'string') {
      const date = new Date(val);
      this.value = { start: date, end: date };
    } else if (val instanceof Date) {
      this.value = { start: val, end: val };
    } else {
      this.value = {
        start: val.start ? new Date(val.start) : null,
        end: val.end ? new Date(val.end) : null,
      };
    }

    if (this.value.start) {
      this.displayMonth = this.value.start.getMonth();
      this.displayYear = this.value.start.getFullYear();
    }

    this.buildCalendar();
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: unknown) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  disabled = false;

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  // ── Calendar building ────────────────────────────────────
  buildCalendar(): void {
    const cells: CalendarCell[] = [];
    const today = this.today();
    const firstWeekday = new Date(this.displayYear, this.displayMonth, 1).getDay();
    const daysInMonth = new Date(this.displayYear, this.displayMonth + 1, 0).getDate();
    const prevMonthDays = new Date(this.displayYear, this.displayMonth, 0).getDate();

    // Leading days from previous month
    for (let i = firstWeekday - 1; i >= 0; i--) {
      cells.push(this.makeCell(
        new Date(this.displayYear, this.displayMonth - 1, prevMonthDays - i),
        false,
        today,
      ));
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(this.makeCell(
        new Date(this.displayYear, this.displayMonth, d),
        true,
        today,
      ));
    }

    // Trailing days from next month (fill up to 6 rows max = 42 cells)
    let next = 1;
    while (cells.length < 42 && cells.length % 7 !== 0) {
      cells.push(this.makeCell(
        new Date(this.displayYear, this.displayMonth + 1, next++),
        false,
        today,
      ));
    }

    this.calendarCells = cells;
  }

  private makeCell(date: Date, currentMonth: boolean, today: Date): CalendarCell {
    const d = this.stripTime(date);
    return {
      date: d,
      day: d.getDate(),
      currentMonth,
      isToday: d.getTime() === today.getTime(),
      disabled: (!!this.minDate && d < this.minDate) || (!!this.maxDate && d > this.maxDate),
    };
  }

  // ── Selection ────────────────────────────────────────────
  selectDate(date: Date): void {
    if (this.disabled || this.readonly) return;
    if (this.singleDate) {
      this.value = { start: date, end: date };
      this.closeAndEmit();
      return;
    }

    if (!this.pickingEnd || !this.value.start) {
      // First click — set start, wait for end
      this.value = { start: date, end: null };
      this.pickingEnd = true;
    } else {
      // Second click — normalise order and close
      const [start, end] = date < this.value.start!
        ? [date, this.value.start!]
        : [this.value.start!, date];
      this.value = { start, end };
      this.pickingEnd = false;
      this.closeAndEmit();
    }

    this.cdr.markForCheck();
  }

  // ── Hover preview ────────────────────────────────────────
  onDayHover(date: Date): void {
    if (this.pickingEnd) this.hoverDate = date;
  }

  onDayLeave(): void {
    this.hoverDate = null;
  }

  // ── Day state helpers ────────────────────────────────────
  isRangeStart(date: Date): boolean { return this.sameDay(date, this.value.start); }
  isRangeEnd(date: Date): boolean { return this.sameDay(date, this.value.end); }
  isSelected(date: Date): boolean { return this.isRangeStart(date) || this.isRangeEnd(date); }

  isInRange(date: Date): boolean {
    const end = this.value.end ?? (this.pickingEnd ? this.hoverDate : null);
    if (!this.value.start || !end) return false;
    const [a, b] = end < this.value.start
      ? [end, this.value.start]
      : [this.value.start, end];
    return date > a && date < b;
  }

  // ── Navigation ───────────────────────────────────────────
  prevMonth(): void {
    if (this.displayMonth === 0) { this.displayMonth = 11; this.displayYear--; }
    else this.displayMonth--;
    this.buildCalendar();
    this.cdr.markForCheck();
  }

  nextMonth(): void {
    if (this.displayMonth === 11) { this.displayMonth = 0; this.displayYear++; }
    else this.displayMonth++;
    this.buildCalendar();
    this.cdr.markForCheck();
  }

  onMonthChange(m: number): void { this.displayMonth = +m; this.buildCalendar(); this.cdr.markForCheck(); }
  onYearChange(y: number): void { this.displayYear = +y; this.buildCalendar(); this.cdr.markForCheck(); }

  // ── Display label ────────────────────────────────────────
  get displayLabel(): string {
    if (!this.value.start) return this.placeholder;
    if (this.singleDate || !this.value.end || this.sameDay(this.value.start, this.value.end)) {
      return this.formatDate(this.value.start);
    }
    return `${this.formatDate(this.value.start)} – ${this.formatDate(this.value.end)}`;
  }

  /** Display label only — DD-MMM-YYYY (e.g. "02-Jun-2026"), reusing `months` rather than a
   * separate abbreviation list. The FormControl/emitted value always stays ISO (`formatForForm`)
   * regardless of this. */
  formatDate(d: Date | null): string {
    if (!d) return '';

    const dd = String(d.getDate()).padStart(2, '0');
    const mmm = this.months[d.getMonth()].slice(0, 3);
    const yyyy = d.getFullYear();

    return `${dd}-${mmm}-${yyyy}`;
  }

  private formatForForm(date: Date | null): string | null {
    if (!date) return null;

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
  }

  // ── Toggle ───────────────────────────────────────────────
  toggleCalendar() {
    // `disabled` was tracked (via setDisabledState, the CVA hook Angular calls for a disabled
    // FormControl) but never actually enforced — the calendar still opened and selections still
    // wrote through. That was harmless while this component's only consumer was an always-editable
    // filter, but SFD Actions' Update mode disables most dynamic-form fields via FormControl, so a
    // "locked" date field needs to actually be locked, not just dimmed by disabled CSS elsewhere.
    if (this.disabled || this.readonly) return;

    if (!this.isOpen) {
      DatePickerComponent.closeAll.dispatchEvent(new Event('close'));
    }

    this.isOpen = !this.isOpen;
    this.cdr.markForCheck();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: Event): void {
    if (!this.elRef.nativeElement.contains(e.target) && this.isOpen) {
      this.isOpen = false;
      this.cdr.markForCheck();
    }
  }

  // ── Private helpers ──────────────────────────────────────
  private closeAndEmit(): void {
    this.isOpen = false;

    let out: DatePickerValue;

    if (this.singleDate) {
      out = this.formatForForm(this.value.start);
    } else {
      out = {
        start: this.formatForForm(this.value.start),
        end: this.formatForForm(this.value.end),
      };
    }

    this.onChange(out);          // FormControl gets yyyy-MM-dd
    this.dateChange.emit(out);   // Event also emits yyyy-MM-dd

    this.cdr.markForCheck();
  }

  private sameDay(a: Date | null, b: Date | null): boolean {
    if (!a || !b) return false;
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  private today(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private stripTime(d: Date): Date {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
}
