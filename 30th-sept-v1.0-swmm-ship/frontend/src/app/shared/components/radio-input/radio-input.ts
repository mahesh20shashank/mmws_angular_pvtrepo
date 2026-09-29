import {
  Component,
  Input,
  forwardRef
} from '@angular/core';

import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR
} from '@angular/forms';

type ChangeFn<T> = (value: T | null) => void;
type TouchFn = () => void;

@Component({
  selector: 'app-radio-input',
  standalone: true,
  templateUrl: './radio-input.html',
  styleUrl: './radio-input.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RadioInput),
      multi: true
    }
  ]
})
export class RadioInput<T = unknown> implements ControlValueAccessor {

  @Input() label = '';

  @Input() options: { label: string; value: T }[] = [];

  value: T | null = null;

  // ✅ real safe defaults (NOT empty functions)
  onChange: ChangeFn<T> = (_value: T | null): void => {
    // intentional no-op fallback
  };

  onTouched: TouchFn = (): void => {
    // intentional no-op fallback
  };

  writeValue(value: T | null): void {
    this.value = value;
  }

  registerOnChange(fn: ChangeFn<T>): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: TouchFn): void {
    this.onTouched = fn;
  }

  select(value: T): void {
    this.value = value;
    this.onChange(value);
    this.onTouched();
  }
}
