
import { Component, Input, computed, forwardRef, input, signal, ChangeDetectionStrategy } from "@angular/core";

import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";

@Component({
  selector: "app-input-field",
  standalone: true,
  imports: [],
  templateUrl: "./input-field.html",
  styleUrls: ["./input-field.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputField),
      multi: true,
    },
  ],
})
export class InputField implements ControlValueAccessor {
  @Input() label = "";
  @Input() type:
    | 'text'
    | 'number'
    | 'date'
    | 'time'
    | 'datetime-local'
    | 'radio'
    | 'file'
    | 'password' = 'text';
  @Input() readonly = false;
  @Input() placeholder = "";
  @Input() autoTimeFormat = false;
  /** Opt-in only — `type="date"` otherwise follows the browser's own locale (mm/dd/yyyy for en-US).
   * Set e.g. "en-GB" to force the native date input's placeholder/display to dd/mm/yyyy order
   * (Chrome/Edge honor the input's `lang` attribute for this; Firefox still follows the OS locale). */
  @Input() dateLocale: string | null = null;
  /** `type="date"` only — native `min` attribute (e.g. today's ISO date for a "must be future" rule). */
  @Input() min = "";
  @Input() max = "";
  @Input() invalid = false;
  /** Red placeholder text only (no border) — for live "this is required" hints shown before the
   * user has attempted to submit. `invalid` is the fuller post-submit treatment (border + placeholder). */
  @Input() placeholderInvalid = false;

  value = signal("");
  required = input(false);

  // Always the real input type — date fields used to fall back to type="text"
  // until focused/filled, which hid the native date placeholder (e.g. dd-mm-yyyy)
  // until the user clicked in. Rendering type="date" from the start shows it
  // immediately, matching every other input type.
  currentInputType = computed(() => this.type);

  isDateType = computed(() => this.type === "date" || this.type === "datetime-local");
  focused = signal(false);

  private onChange: (value: string) => void = (data) => data;
  private onTouched: () => void = () => {
    return
  };

  writeValue(value: string | null): void {
    this.value.set(this.formatValue(value ?? ""));
  }

  disabled = signal(false);



  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = this.formatValue(input.value);

    this.value.set(value);
    input.value = value;

    this.onChange(value);
  }

  onFocus(): void {

    this.focused.set(true);

    if (this.type === 'date' || this.type === 'datetime-local') {

      setTimeout(() => {
        const input =
          document.activeElement as HTMLInputElement;

        input?.showPicker?.();
      });

    }
  }

  onBlur(): void {
    this.focused.set(false);
    this.onTouched();
  }

  private formatValue(value: string): string {
    if (!this.autoTimeFormat || this.type !== 'text') {
      return value;
    }

    const digitsOnly = value.replace(/\D/g, '').slice(0, 4);

    if (digitsOnly.length <= 2) {
      return digitsOnly.length === 2 ? `${digitsOnly}:` : digitsOnly;
    }

    return `${digitsOnly.slice(0, 2)}:${digitsOnly.slice(2)}`;
  }
}
