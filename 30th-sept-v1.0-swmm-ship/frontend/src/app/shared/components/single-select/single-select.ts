import { ButtonComponent } from '../button/button.component';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Input,
  computed,
  forwardRef,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { IconComponent } from "../icon/icon.component";

/** Maps arbitrary option object keys to label/value — lets callers bind raw API
 *  records (e.g. `{ equipment_code, equipment_name }`) straight to `options`
 *  instead of pre-mapping every response into `{ label, value }`. Omit `config`
 *  entirely when `options` is already `{ label, value }` shaped. */
export interface SelectOptionConfig {
  label: string;
  value: string;
}

@Component({
  selector: "app-single-select",
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  templateUrl: "./single-select.html",
  styleUrl: "./single-select.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SingleSelect),
      multi: true,
    },
  ],
})
export class SingleSelect implements ControlValueAccessor {
  @Input() label = "";
  @Input() placeholder = "Select...";

  required = input(false);
  readonly = input(false);
  error = input(false);

  options = input<Record<string, unknown>[]>([]);
  /** Key mapping applied to every entry in `options` — e.g.
   *  `{ label: 'equipment_name', value: 'equipment_code' }`. */
  config = input<SelectOptionConfig | null>(null);

  /** Emits the full selected option object (not just its resolved value) —
   *  e.g. when the caller needs other fields off the same record. */
  readonly onSelect = output<Record<string, unknown>>();

  readonly elementRef = inject(ElementRef);

  isOpen = signal(false);
  searchText = signal("");
  value = signal<unknown>(null);
  disabledState = signal(false);

  /** Lets a parent template disable this control directly, e.g. `[disabled]="!parentField"` —
   *  independent of the ControlValueAccessor disabled state. */
  @Input()
  set disabled(value: boolean | undefined | null) {
    this.disabledState.set(!!value);
  }

  /** Reads an option's value using `config().value` when set, else the `value` key. */
  optionValue(option: Record<string, unknown>): unknown {
    return option[this.config()?.value ?? 'value'];
  }

  /** Reads an option's label using `config().label` when set, else the `label` key. */
  optionLabel(option: Record<string, unknown>): string {
    const label = option[this.config()?.label ?? 'label'];
    return label == null ? '' : String(label);
  }

  readonly selectedLabel = computed(() => {
    const selected = this.options().find(
      (option) => String(this.optionValue(option)) === String(this.value())
    );
    return selected ? this.optionLabel(selected) : '';
  });

  readonly filteredOptions = computed(() => {
    const search = this.searchText().toLowerCase();
    if (!search) return this.options();
    return this.options().filter((option) =>
      this.optionLabel(option).toLowerCase().includes(search)
    );
  });

  private onChange: (value: unknown) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: unknown): void {
    this.value.set(value ?? null);
    this.searchText.set('');
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledState.set(isDisabled);
  }

  toggleDropdown(): void {
    if (this.disabledState() || this.readonly()) {
      return;
    }
    this.isOpen.update((open) => !open);
  }

  updateSearch(event: Event): void {
    this.searchText.set((event.target as HTMLInputElement).value);
  }

  selectOption(option: Record<string, unknown>): void {
    if (this.disabledState() || this.readonly()) {
      return;
    }
    const value = this.optionValue(option);
    this.value.set(value);
    this.onChange(value);
    this.onTouched();
    this.onSelect.emit(option);
    this.searchText.set('');
    this.isOpen.set(false);
  }

  clearSelection(event: MouseEvent): void {
    event.stopPropagation();
    if (this.disabledState() || this.readonly()) {
      return;
    }
    this.value.set(null);
    this.onChange(null);
    this.onTouched();
  }

  preventClose(event: Event): void {
    event.stopPropagation();
  }

  @HostListener("document:click", ["$event"])
  closeOnOutsideClick(event: MouseEvent): void {
    if (this.isOpen() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.isOpen.set(false);
      this.onTouched();
    }
  }
}
