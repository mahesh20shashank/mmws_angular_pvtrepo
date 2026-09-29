import {
  ChangeDetectorRef,
  Component,
  Input,
  forwardRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule],
template: `
<div class="w-full group flex flex-col">
  <div class="relative flex h-[45px] w-full items-center rounded-[10px] px-4 transition" [ngClass]="fieldStateClasses">
    <label *ngIf="label" class="pointer-events-none absolute left-4 top-[3px] text-[11px] text-[var(--text-muted)]">
      {{ label }}
      <span *ngIf="required" class="text-red-500">*</span>
    </label>

    <input
      type="date"
      [class.pt-3]="label"
      class="w-full border-none bg-transparent text-sm text-[var(--text-primary)] outline-none disabled:cursor-not-allowed [color-scheme:var(--native-color-scheme,dark)]"
      [value]="value"
      [disabled]="disabled"
      [attr.min]="min"
      [attr.max]="max"
      [readonly]="readonly"
      (focus)="focused = true"
      (blur)="focused = false; markTouched()"
      (input)="onInput($event)"
    />
  </div>
</div>
`,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CalenderComponent),
      multi: true,
    },
  ],
})
export class CalenderComponent implements ControlValueAccessor {
  private readonly cdr = inject(ChangeDetectorRef);
  @Input() label = '';
  @Input() placeholder = '';
  @Input() disabled = false;
  @Input() min?: string;
  @Input() max?: string;
  @Input() required = false;
  @Input() readonly = false;
  value = '';
  focused = false;

  /** Field surface: border/background per focus + readonly state. */
  get fieldStateClasses(): string {
    if (this.readonly || this.disabled) {
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
      this.cdr.markForCheck();
      return;
    }

    // Accept Date object or string
    if (value instanceof Date) {
      this.value = value.toISOString().split('T')[0];
    } else {
      this.value = value;
    }
    this.cdr.markForCheck();
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  onInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.value = value;
    this.onChange(value);
  }

  markTouched() {
    this.onTouched();
  }
}
