import { CommonModule } from '@angular/common';
import {
  Component,
  forwardRef,
  Input,
} from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';

export interface RadioGroupOption {
  label: string;
  value: any;
}

@Component({
  selector: 'app-radio-group',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RadioGroupComponent),
      multi: true,
    },
  ],
  templateUrl: './radio-group.component.html',
})
export class RadioGroupComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() options: RadioGroupOption[] = [];
  @Input() name = `radio-group-${Math.random().toString(36).slice(2)}`;
  @Input() disabled = false;

  value: any = null;

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: any): void {
    this.value = value;
  }

  registerOnChange(fn: (value: any) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  select(value: any): void {
    if (this.disabled) return;

    this.value = value;
    this.onChange(value);
    this.onTouched();
  }

  trackByValue(index: number, option: RadioGroupOption): any {
    return option.value;
  }
}
