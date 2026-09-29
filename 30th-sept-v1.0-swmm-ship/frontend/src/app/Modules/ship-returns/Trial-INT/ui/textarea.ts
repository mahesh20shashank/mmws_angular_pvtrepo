import {
  Component,
  ChangeDetectorRef,
  Input,
  forwardRef,
  ElementRef,
  ViewChild,
  AfterViewInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-textarea',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-full">
      <div class="w-full group flex flex-col gap-1.5">
        <div class="relative w-full rounded-[10px] pt-5" [ngClass]="fieldStateClasses">
          <label *ngIf="label" class="pointer-events-none absolute left-4 top-1.5 text-[11px] text-[var(--text-muted)]">
            {{ label }}
            <span *ngIf="required" class="text-red-500">*</span>
          </label>

          <textarea
            #textareaRef
            [rows]="rows"
            [placeholder]="focused ? placeholder : ''"
            [disabled]="disabled"
            [readonly]="readonly"
            [value]="value"
            (input)="onInput($event)"
            (focus)="focused = true"
            (blur)="focused = false; markTouched()"
             class="min-h-[16px] w-full resize-y overflow-hidden border-none bg-transparent pl-4 pr-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed"
          ></textarea>
        </div>
      </div>
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TextareaComponent),
      multi: true,
    },
  ],
})
export class TextareaComponent implements ControlValueAccessor, AfterViewInit {
  private readonly cdr = inject(ChangeDetectorRef);
  @ViewChild('textareaRef') textareaRef!: ElementRef<HTMLTextAreaElement>;

  @Input() placeholder = '';
  @Input() label = '';
  @Input() rows = 3;
  @Input() disabled = false;
  @Input() required = false;
  @Input() readonly = false;

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

  private onChange = (value: any) => {};
  private onTouched = () => {};

  ngAfterViewInit(): void {
    setTimeout(() => this.adjustHeight());
  }

  writeValue(value: any): void {
    this.value = value ?? '';
    this.cdr.markForCheck();

    setTimeout(() => {
      this.adjustHeight();
    });
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

  onInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;

    this.value = target.value;
    this.onChange(this.value);

    this.adjustHeight();
  }

  markTouched(): void {
    this.onTouched();
  }

  private adjustHeight(): void {
    const textarea = this.textareaRef?.nativeElement;

    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }
}
