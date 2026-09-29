import { Component, Input, OnInit, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-year-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './year-calendar.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => YearCalendarComponent),
      multi: true,
    },
  ],
})
export class YearCalendarComponent implements ControlValueAccessor, OnInit {
  @Input() label = '';
  @Input() placeholder = 'YYYY';
  @Input() disabled = false;
  @Input() min?: number;
  @Input() max?: number;

  value = '';
  error = '';

  private onChange = (_value: string): void => {};
  private onTouched = (): void => {};

  ngOnInit() {
    if (!this.max) {
      this.max = new Date().getFullYear();
    }
  }

  writeValue(value: string | null): void {
    this.value = value || '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(event: Event) {
    let rawValue = (event.target as HTMLInputElement).value;

    rawValue = rawValue.replace(/\D/g, '');
    rawValue = rawValue.slice(0, 4);

    this.value = rawValue;
    this.error = '';

    if (rawValue.length !== 4) {
      this.onChange('');
      return;
    }

    const year = Number(rawValue);

    if (this.min && year < this.min) {
      this.error = `Year must be greater than or equal to ${this.min}`;
      this.onChange('');
      return;
    }

    if (this.max && year > this.max) {
      this.error = `Year cannot be greater than ${this.max}`;
      this.onChange('');
      return;
    }

    this.onChange(rawValue);
  }

  allowOnlyNumbers(event: KeyboardEvent): void {
    const allowedKeys = [
      'Backspace',
      'Delete',
      'ArrowLeft',
      'ArrowRight',
      'Tab',
    ];

    if (allowedKeys.includes(event.key)) return;

    if (!/\d/.test(event.key)) {
      event.preventDefault();
    }

    if (this.value.length >= 4) {
      event.preventDefault();
    }
  }

  markTouched() {
    this.onTouched();
  }
}
