import {
  Component,
  Input,
  forwardRef,
  OnChanges,
  SimpleChanges,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { EditorModule } from '@tinymce/tinymce-angular';
import { init } from './editor.config';

@Component({
  selector: 'app-html-editor-field',
  standalone: true,
  imports: [CommonModule, FormsModule, EditorModule],
  template: `
    <div class="w-full flex flex-col gap-1.5">
      <label *ngIf="label" class="mb-1.5 block text-sm font-medium text-white">
        {{ label }}
        <span *ngIf="required" class="text-red-500">*</span>
      </label>
      <div
        class="overflow-hidden rounded-md border border-white/20 bg-white/10 [&_.tox-tinymce]:min-h-[200px]"
      >
        <editor
          [(ngModel)]="innerValue"
          (ngModelChange)="onModelChange($event)"
          [init]="editorInit"
          [disabled]="disabled"
        ></editor>
      </div>
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => HtmlEditorFieldComponent),
      multi: true,
    },
  ],
})
export class HtmlEditorFieldComponent
  implements ControlValueAccessor, OnInit, OnChanges
{
  @Input() label = '';
  @Input() required = false;
  @Input() placeholder = '';
  @Input() height = 280;

  innerValue = '';
  disabled = false;
  editorInit: Record<string, unknown> = {};

  private onChange: (v: string) => void = () => {};
  private onTouchedFn: () => void = () => {};
  private markTouchedOnce = false;

  ngOnInit(): void {
    this.buildInit();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['height'] || changes['placeholder']) {
      this.buildInit();
    }
  }

  private buildInit(): void {
    this.editorInit = {
      ...init,
      height: this.height,
      menubar: false,
      min_width: 280,
      base_url: '/tinymce',
      suffix: '.min',
      placeholder: this.placeholder || 'Enter description...',
    };
  }

  writeValue(value: string | null): void {
    this.innerValue = value ?? '';
    this.markTouchedOnce = false;
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouchedFn = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onModelChange(v: string): void {
    this.onChange(v ?? '');
    if (!this.markTouchedOnce) {
      this.markTouchedOnce = true;
      this.onTouchedFn();
    }
  }
}
