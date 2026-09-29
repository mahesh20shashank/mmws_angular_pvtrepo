import {
  Component,
  ChangeDetectorRef,
  Input,
  forwardRef,
  HostListener,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-select-with-search-box',
  standalone: true,
  imports: [CommonModule,FormsModule],
  templateUrl: './select-with-search-box.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectWithSearchComponent),
      multi: true,
    },
  ],
})
export class SelectWithSearchComponent implements ControlValueAccessor, OnChanges {
  private readonly cdr = inject(ChangeDetectorRef);
  @Input() options: { label: string; value: any }[] = [];
  @Input() placeholder = '--Select--';
  @Input() disabled = false;

  isOpen = false;
  value: any = '';

  searchTerm = '';
  filteredOptions: { label: string; value: any }[] = [];

  private onChange = (value: any) => {};
  private onTouched = () => {};

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options']) {
      this.filteredOptions = [...this.options];
      this.cdr.markForCheck();
    }
  }

  toggle() {
    if (this.disabled) return;
    this.isOpen = !this.isOpen;

    if (this.isOpen) {
      this.filteredOptions = [...this.options];
      this.searchTerm = '';
    }
  }

  select(option: any) {
    if (this.disabled) return;

    this.value = option.value;
    this.onChange(this.value);
    this.onTouched();
    this.isOpen = false;
  }

  filterOptions() {
    const term = this.searchTerm.toLowerCase();

    this.filteredOptions = this.options.filter((o) =>
      o.label.toLowerCase().includes(term),
    );
  }

  writeValue(value: any): void {
    this.value = value;
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
    this.isOpen = false;
    this.cdr.markForCheck();
  }

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.select-container')) {
      this.isOpen = false;
    }
  }

  get selectedLabel() {
    return (
      this.options.find((o) => o.value === this.value)?.label ||
      this.placeholder
    );
  }
}
