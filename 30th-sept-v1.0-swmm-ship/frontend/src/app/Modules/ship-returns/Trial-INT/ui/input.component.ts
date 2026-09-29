import { ChangeDetectorRef, Component, Input, forwardRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-input',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true,
    },
  ],
  template: `
  <div class="group flex w-full flex-col gap-1.5">
   <div class="relative flex h-[45px] w-full items-center rounded-[10px] px-4 transition" [ngClass]="fieldStateClasses">
    <label *ngIf="label" class="pointer-events-none absolute left-4 transition-all duration-200" [ngClass]="labelStateClasses">
      <span *ngIf="isHtmlContent(label)" [innerHTML]="label"></span>
      <span *ngIf="!isHtmlContent(label)">{{ label }}</span>
      <span *ngIf="required" class="text-red-500">*</span>
    </label>

    <!-- 🔥 INPUT -->
    <input
      *ngIf="!options?.length"
      [type]="type"
      [placeholder]="focused || !label ? placeholder : ''"
      [disabled]="disabled"
      [readOnly]="readonly"
      [value]="value"
      [attr.min]="numberMinAttr"
      [attr.max]="numberMaxAttr"
      [attr.step]="numberStepAttr"
      (input)="onInput($event)"
      (focus)="focused = true"
      (blur)="focused = false; markTouched()"
      [class.pt-3]="label"
      class="w-full bg-transparent border-none outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed"
    />
   </div>
  </div>
  `,
})
export class InputComponent implements ControlValueAccessor {

  private readonly cdr = inject(ChangeDetectorRef);

  @Input() placeholder = '';
  // `alphanumeric` is kept as a compatibility alias used by legacy forms.
  @Input() type: 'text' | 'number' | 'email' | 'password' | 'date' | 'alphanumeric' = 'text';
  @Input() label = '';
  @Input() disabled = false;
  @Input() readonly: boolean | '' = false;
  @Input() required: boolean | '' = false;
  /** For `type="number"`: HTML min / max / step + live clamp vs min/max */
  @Input() min: number | string | null = null;
  @Input() max: number | string | null = null;
  @Input() step: number | string | null = null;

  @Input() options: { label: string; value: any }[] = [];

  value: any = '';
  focused = false;

  /** Floating-label field surface: border/background per focus + readonly state. */
  get fieldStateClasses(): string {
    if (this.readonly || this.disabled) {
      return 'border border-[var(--border-input)] bg-[var(--bg-input-disabled,rgba(15,28,46,0.06))] opacity-90';
    }
    return this.focused
      ? 'border border-[var(--accent-light,#61c2ff)] bg-[var(--bg-input)]'
      : 'border border-[var(--border-input)] bg-[var(--bg-input)]';
  }

  get hasValue(): boolean {
    return this.value !== '' && this.value !== null && this.value !== undefined;
  }

  /** Floating-label position: raised when focused or already has a value. */
  get labelStateClasses(): string {
    return this.focused || this.hasValue
      ? 'top-[3px] text-[11px] text-[var(--text-muted)]'
      : 'top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]';
  }

  get numberMinAttr(): string | null {
    return this.type === 'number' && this.min !== null && this.min !== undefined && this.min !== ''
      ? String(this.min)
      : null;
  }

  get numberMaxAttr(): string | null {
    return this.type === 'number' && this.max !== null && this.max !== undefined && this.max !== ''
      ? String(this.max)
      : null;
  }

  get numberStepAttr(): string | null {
    return this.type === 'number' && this.step !== null && this.step !== undefined && this.step !== ''
      ? String(this.step)
      : null;
  }

  private parseBound(v: number | string | null | undefined): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private onChange = (value: any) => { };
  private onTouched = () => { };

  writeValue(value: any): void {
    this.value = value ?? '';
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
    const target = event.target as HTMLInputElement;
    let val = target.value;

    if (this.type === 'number') {
      if (this.step && val.includes('.')) {
        const stepStr = String(this.step);

        if (stepStr.includes('.')) {
          const allowedDecimals = stepStr.split('.')[1].length;

          const [integer, decimal] = val.split('.');

          if (decimal.length > allowedDecimals) {
            val = `${integer}.${decimal.substring(0, allowedDecimals)}`;
            target.value = val;
          }
        }
      }

      const minN = this.parseBound(this.min);
      const maxN = this.parseBound(this.max);
      if (val !== '' && val !== '-') {
        const n = Number(val);
        if (!Number.isNaN(n)) {
          let next = n;
          if (minN !== null && next < minN) next = minN;
          if (maxN !== null && next > maxN) next = maxN;
          if (next !== n) {
            val = String(next);
            target.value = val;
          }
        }
      }
    }

    this.value = val;
    this.onChange(this.value);
  }

  onSelect(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.value = target.value;
    this.onChange(this.value);
  }

  markTouched() {
    this.onTouched();
  }

  isHtmlContent(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return /<\/?[a-z][\s\S]*>/i.test(value);
  }
}
