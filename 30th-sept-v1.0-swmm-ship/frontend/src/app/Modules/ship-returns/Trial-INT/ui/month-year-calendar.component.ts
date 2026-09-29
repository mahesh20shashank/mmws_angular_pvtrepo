import {
  Component,
  Input,
  forwardRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';

@Component({
  selector: 'app-month-year-calendar, app-year-picker',
  standalone: true,
  imports: [CommonModule],
  template: `

<div class="w-full group flex flex-col gap-1.5">
  <div class="relative flex h-[45px] w-full items-center rounded-[10px] px-4 transition" [ngClass]="fieldStateClasses">
    <label *ngIf="label" class="pointer-events-none absolute left-4 top-[3px] text-[11px] text-[var(--text-muted)]">
      {{ label }}
      <span *ngIf="required" class="text-red-500">*</span>
    </label>

    <input
      type="month"
      [class.pt-3]="label"
      class="w-full border-none bg-transparent text-sm text-[var(--text-primary)] outline-none disabled:cursor-not-allowed disabled:opacity-60 [color-scheme:var(--native-color-scheme,dark)]"
      [value]="value"
      [disabled]="disabled"
      [attr.min]="min"
      [attr.max]="max"
      (focus)="focused = true"
      (blur)="focused = false; markTouched()"
      (input)="onInput($event)" />
  </div>
</div>

  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MonthYearCalendarComponent),
      multi: true,
    },
  ],
})
export class MonthYearCalendarComponent implements ControlValueAccessor {

  @Input() label = '';
  @Input() placeholder = '';
  @Input() disabled = false;
  @Input() min?: string | number; // format: YYYY-MM or YYYY
  @Input() max?: string | number; // format: YYYY-MM or YYYY
  @Input() required = false;
  value = '';        // internal value (YYYY-MM)
  displayValue = ''; // formatted value (MM/YYYY)
  focused = false;

  get fieldStateClasses(): string {
    if (this.disabled) {
      return 'border border-[var(--border-input)] bg-[var(--bg-input-disabled,rgba(15,28,46,0.06))] opacity-90';
    }
    return this.focused
      ? 'border border-[var(--accent-light,#61c2ff)] bg-[var(--bg-input)]'
      : 'border border-[var(--border-input)] bg-[var(--bg-input)]';
  }

  private onChange = (value: string) => {};
  private onTouched = () => {};

  writeValue(value: any): void {
    if (!value) {
      this.value = '';
      this.displayValue = '';
      return;
    }

    const str = String(value).trim();
    if (str.includes('/')) {
      const [month, year] = str.split('/');
      this.value = `${year}-${month.padStart(2, '0')}`;
      this.displayValue = str;
    } else if (str.includes('-')) {
      this.value = str;
      const [year, month] = str.split('-');
      this.displayValue = `${month}/${year}`;
    } else if (!isNaN(Date.parse(str))) {
      const d = new Date(str);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      this.value = `${y}-${m}`;
      this.displayValue = `${m}/${y}`;
    } else {
      this.value = str;
      this.displayValue = str;
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(event: Event) {
    const rawValue = (event.target as HTMLInputElement).value; // YYYY-MM
    this.value = rawValue;

    if (!rawValue) {
      this.displayValue = '';
      this.onChange('');
      return;
    }

    const [year, month] = rawValue.split('-');
    this.displayValue = `${month}/${year}`;

    // Emit in MM/YYYY format
    this.onChange(this.displayValue);
  }

  markTouched() {
    this.onTouched();
  }
}
