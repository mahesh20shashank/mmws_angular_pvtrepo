

import {
  Component,
  Input,
  signal,
  computed,
  forwardRef,
  input,
  ChangeDetectionStrategy
} from '@angular/core';

import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR
} from '@angular/forms';

@Component({
  selector: 'app-textarea-input',
  standalone: true,
  imports: [],
  templateUrl: './textarea-input.html',
  styleUrls: ['./textarea-input.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TextareaInput),
      multi: true
    }
  ]
})
export class TextareaInput implements ControlValueAccessor {

  @Input() label = '';
  @Input() placeholder = '';
  @Input() rows = 1;
  @Input() readonly = false;
  /** Shows the red mandatory marker beside the label, matching app-input-field
   *  and app-select-input. Display only — the enforcing rule lives with the form. */
  required = input(false);

  value = signal('');

  focused = signal(false);

  hasValue = computed(() => !!this.value());

   backgroundColor = input('rgba(255, 255, 255, .08)');

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null | undefined): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    console.log(isDisabled)
  }
  onInput(event: Event): void {

    const value =
      (event.target as HTMLTextAreaElement).value;

    this.value.set(value);

    this.onChange(value);
  }

  onFocus(): void {
    this.focused.set(true);
  }

  onBlur(): void {
    this.focused.set(false);
    this.onTouched();
  }
}
