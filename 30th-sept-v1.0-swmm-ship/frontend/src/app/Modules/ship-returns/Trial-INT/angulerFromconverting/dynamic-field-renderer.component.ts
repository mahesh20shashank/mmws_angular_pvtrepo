import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  OnInit,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputComponent } from '../ui/input.component';
import { CalenderComponent } from '../ui/calender.component';
import { SelectOption, SelectComponent } from '../ui/select.component';
import { TextareaComponent } from '../ui/textarea';
import { TimePickerComponent } from '../ui/time-picker';
import { FileUploadComponent } from '../ui/file-upload/file-upload.component';
import { MultiSelectDropdownComponent } from '../ui/multiselect';
import { EditorModule } from '@tinymce/tinymce-angular';
import { init } from '../ui/editor.config';
import {
  DynamicTableConfigService,
  DynamicVisibilityCondition,
} from './dynamic-table-config.service';
import { evaluateFormulaExpression, MatrixCellFormula } from './matrix-cell-formula.util';

export interface DynamicFieldApiSchema {
  url?: string;
  endpoint?: string;
  method?: 'GET' | 'POST';
  params?: Record<string, any>;
  dependsOn?: string | null;
  labelKey?: string;
  valueKey?: string;
  childrenKey?: string;
  responsePath?: string;
  mode?: 'list' | 'tree';
}

export interface DynamicFieldSchema {
  colSpan?: number;
  type:
    | 'input'
    | 'textarea'
    | 'select'
    | 'tree-select'
    | 'multiselect'
    | 'label'
    | 'date'
    | 'time'
    | 'checkbox'
    | 'checkbox-multiple'
    | 'radio'
    | 'file'
    | 'notes'
    | 'editor';
  name: string;
  key?: string;
  label?: string;
  height?: number;
  value?: any;
  hiddenKey?: string;
  hiddenValue?: any;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  placeholder?: string;
  rows?: number;
  inputType?: 'text' | 'number' | 'email' | 'password';
  options?: SelectOption[];
  searchable?: boolean;
  isDynamic?: boolean;
  lookupKey?: string;
  api?: DynamicFieldApiSchema | null;
  validations?: any[];
  formula?: MatrixCellFormula;
  meta?: any;
  // Notes-specific properties
  notesHeading?: string;
  multiple?: boolean;
  notesHeadingClass?: string;
  notesDescription?: string;
  notesListType?: 'ordered' | 'unordered';
  notesItems?: (string | { text: string; html?: string })[];
  notesClass?: string;
  // Conditional visibility
  showIf?: {
    field: string;
    value?: any;
    values?: any[];
    operator?: 'exists' | 'notExists' | 'equals' | 'notEquals' | 'in' | 'notIn';
  } | DynamicVisibilityCondition[];
  [key: string]: any;
}

@Component({
  selector: 'app-dynamic-field-renderer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.grid-column]': 'getGridColumnSpan(field)',
  },
  imports: [
    CommonModule,
    FormsModule,
    InputComponent,
    TextareaComponent,
    CalenderComponent,
    TimePickerComponent,
    SelectComponent,
    FileUploadComponent,
    MultiSelectDropdownComponent,
    EditorModule,
  ],
  template: `
  <div class="">
    <ng-container [ngSwitch]="field?.type">
      
      <!-- DATE FIELD -->
      <div *ngIf="isFieldVisible(field)" class="w-full">
        <ng-container *ngSwitchCase="'date'">
          <app-calendar
            [label]="field.label || ''"
            [required]="!!field.required"
            [disabled]="isFromEdit"
            [readonly]="!!(field.disabled || field.readonly)"
            [ngModel]="field.value"
            (ngModelChange)="onValueChange($event)"
          ></app-calendar>
        </ng-container>
      </div>

      <!-- INPUT FIELD -->
      <div *ngIf="isFieldVisible(field)" class="w-full">
        <ng-container *ngSwitchCase="'input'">
          <app-input
            [label]="field.label || ''"
            [type]="field.inputType || 'text'"
            [placeholder]="field.placeholder || ''"
            [required]="!!field.required"
            [disabled]="isFromEdit"
            [readonly]="!!(field.disabled || field.readonly)"
            [ngModel]="field.value"
            (ngModelChange)="onValueChange($event)"
          ></app-input>
        </ng-container>
      </div>

      <!-- TEXTAREA FIELD -->
      <div *ngIf="isFieldVisible(field)" class="w-full">
        <ng-container *ngSwitchCase="'textarea'">
          <app-textarea
            [label]="field.label || ''"
            [rows]="field.rows || 1"
            [placeholder]="field.placeholder || ''"
            [required]="!!field.required"
            [disabled]="isFromEdit"
            [readonly]="!!(field.disabled || field.readonly)"
            [ngModel]="field.value"
            (ngModelChange)="onValueChange($event)"
          ></app-textarea>
        </ng-container>
      </div>

      <!-- SELECT FIELD -->
      <div *ngIf="isFieldVisible(field)" class="w-full">
        <ng-container *ngSwitchCase="'select'">
          <app-select
            [label]="field.label || ''"
            [options]="field.options || []"
            [searchable]="!!field.isDynamic"
            [placeholder]="field.placeholder || '--Select--'"
            [required]="!!field.required"
            [disabled]="isFromEdit || !!(field.disabled || field.readonly)"
            [ngModel]="field.value"
            (ngModelChange)="onValueChange($event)"
          ></app-select>
        </ng-container>
      </div>

      <!-- MULTISELECT FIELD -->
      <div *ngIf="isFieldVisible(field)" class="w-full">
        <ng-container *ngSwitchCase="'multiselect'">
          <app-multiselect
            [label]="field.label || ''"
            [options]="field.options || []"
            [searchable]="field.isDynamic"
            [placeholder]="field.placeholder || '--Select--'"
            [required]="!!field.required"
            [disabled]="isFromEdit"
            [readonly]="!!(field.disabled || field.readonly)"
            [ngModel]="field.value"
            (ngModelChange)="onValueChange($event)"
          ></app-multiselect>
        </ng-container>
      </div>

      <!-- TREE-SELECT FIELD -->
      <div *ngIf="isFieldVisible(field)" class="w-full">
        <ng-container *ngSwitchCase="'tree-select'">
          <app-select
            [label]="field.label || ''"
            [options]="field.options || []"
            [searchable]="field.searchable ?? true"
            [placeholder]="field.placeholder || '--Select--'"
            [required]="!!field.required"
            [disabled]="isFromEdit"
            [ngModel]="field.value"
            (ngModelChange)="onValueChange($event)"
          ></app-select>
        </ng-container>
      </div>

      <!-- LABEL FIELD -->
      <div *ngIf="isFieldVisible(field)" class="w-full">
        <ng-container *ngSwitchCase="'label'">
          <p class="text-bold" *ngIf="!isHtmlContent(field.value)">{{ field.value }}</p>
          <p  [innerHTML]="field.value" *ngIf="isHtmlContent(field.value)"></p>
        </ng-container>
      </div>

      <!-- TIME FIELD -->
      <div *ngIf="isFieldVisible(field)" class="w-full">
        <ng-container *ngSwitchCase="'time'">
          <app-time-picker
            [label]="field.label || ''"
            [disabled]="isFromEdit"
            [ngModel]="field.value"
            (ngModelChange)="onValueChange($event)"
          ></app-time-picker>
        </ng-container>
      </div>

      <!-- FILE UPLOAD FIELD -->
      <div *ngIf="isFieldVisible(field)" class="w-full">
        <ng-container *ngSwitchCase="'file'">
          <app-file-upload
            [label]="field.label || ''"
            [disabled]="isFromEdit"
            [required]="!!field.required"
            [multiple]="field.multiple ?? true"
            [readOnly]="!!field.disabled"
            [ngModel]="field.value"
            (ngModelChange)="onValueChange($event)"
          ></app-file-upload>
        </ng-container>
      </div>

      <!-- CHECKBOX FIELD -->
      <div *ngIf="isFieldVisible(field)" class="w-full">
        <ng-container *ngSwitchCase="'checkbox'">
          <div class="flex flex-col gap-2">
            <label class="custom-label">
              <span *ngIf="isHtmlContent(field.label)" [innerHTML]="field.label"></span>
              <ng-container *ngIf="!isHtmlContent(field.label)">{{ field.label }}</ng-container>
              <span *ngIf="field.required && !isHtmlContent(field.label)" class="text-red-500">*</span>
            </label>
            <input
              type="checkbox"
              class="h-4 w-4"
              [checked]="!!field.value"
              [disabled]="isFromEdit"
              [readonly]="field.disabled || field.readonly"
              (change)="onValueChange(($any($event.target)).checked)"
            />
          </div>
        </ng-container>
      </div>

      <!-- CHECKBOX-MULTIPLE FIELD -->
      <div *ngIf="isFieldVisible(field)" class="w-full">
        <ng-container *ngSwitchCase="'checkbox-multiple'">
          <div class="flex flex-col gap-2 group">
            <label *ngIf="field.label" class="custom-label pt-glass-text-secondary">
              <span *ngIf="isHtmlContent(field.label)" [innerHTML]="field.label"></span>
              <ng-container *ngIf="!isHtmlContent(field.label)">{{ field.label }}</ng-container>
              <span *ngIf="field.required" class="text-red-500">*</span>
            </label>
            <div class="flex flex-wrap items-center gap-5">
              <label
                *ngFor="let option of field.options || []"
                class="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4"
                  [value]="option.value"
                  [checked]="isMultiCheckboxChecked(option.value)"
                  [disabled]="isFromEdit"
                  [readonly]="field.disabled || field.readonly"
                  (change)="onMultiCheckboxChange(option.value, ($any($event.target)).checked)"
                />
                <span class="custom-label">{{ option.label }}</span>
                <span
                  *ngIf="option.isTrigger"
                  class="ml-2 px-2 py-0.5 rounded bg-yellow-200 text-xs font-semibold text-yellow-900"
                >
                  Trigger
                </span>
              </label>
            </div>
          </div>
        </ng-container>
      </div>

      <!-- RADIO FIELD -->
      <div *ngIf="isFieldVisible(field)" class="w-full">
        <ng-container *ngSwitchCase="'radio'">
          <div class="flex flex-col gap-2 group">
            <label class="custom-label">
              <span *ngIf="isHtmlContent(field.label)" [innerHTML]="field.label"></span>
              <ng-container *ngIf="!isHtmlContent(field.label)">{{ field.label }}</ng-container>
              <span *ngIf="field.required && !isHtmlContent(field.label)" class="text-red-500">*</span>
            </label>
            <div class="flex flex-wrap items-center gap-5">
              <label
                *ngFor="let option of field.options || []"
                class="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="radio"
                  [name]="field.name"
                  class="w-4 h-4"
                  [value]="option.value"
                  [checked]="isOptionSelected(field.value, option)"
                  [disabled]="isFromEdit || isFormulaField(field)"
                  (change)="onValueChange(option.value)"
                />
                <span class="custom-label">{{ option.label }}</span>
              </label>
            </div>
          </div>
        </ng-container>
      </div>

      <!-- EDITOR FIELD -->
      <div *ngIf="isFieldVisible(field)" class="w-full">
        <ng-container *ngSwitchCase="'editor'">
          <label class="custom-label pt-glass-text-secondary" [innerHTML]="field.label"></label>
          <div class="pt-glass-table__control overflow-hidden rounded-md [&_.tox-tinymce]:min-h-[150px]">
            <editor
              [disabled]="isFromEdit"
              [init]="editorConfig"
              [(ngModel)]="field.value"
              (ngModelChange)="onValueChange($event)"
            ></editor>
          </div>
        </ng-container>
      </div>

      <!-- NOTES FIELD -->
      <div *ngIf="isFieldVisible(field)" class="w-full">
        <ng-container *ngSwitchCase="'notes'">
          <div class="pt-glass-form-panel mb-4 p-4" [class]="field.notesClass">
            <div *ngIf="field.notesHeading" 
                 class="mb-3 border-b border-[var(--shell-divider-soft)] pb-2 text-base font-semibold pt-glass-text-secondary header-poppins"
                 [class]="field.notesHeadingClass">
              <span [innerHTML]="field.notesHeading"></span>
            </div>
            <div *ngIf="field.notesDescription" 
                 class="mb-3 rounded-lg border border-[var(--shell-divider-soft)] bg-[var(--shell-table-section-bg)] p-2 text-sm pt-glass-text-secondary"
                 [innerHTML]="field.notesDescription">
            </div>
            <div *ngIf="field.notesItems && field.notesItems.length > 0">
              <div *ngIf="field.notesListType === 'ordered'" class="space-y-2">
                <div *ngFor="let item of field.notesItems; let i = index" 
                     class="flex items-start gap-2 text-sm pt-glass-text-secondary">
                  <span class="min-w-6 font-semibold pt-glass-text-primary">{{ i + 1 }}.</span>
                  <span class="flex-1" [innerHTML]="getItemText(item)"></span>
                </div>
              </div>
              <div *ngIf="field.notesListType !== 'ordered'" class="space-y-2">
                <div *ngFor="let item of field.notesItems" 
                     class="flex items-start gap-2 text-sm pt-glass-text-secondary">
                  <span class="min-w-5 pt-glass-text-primary">•</span>
                  <span class="flex-1" [innerHTML]="getItemText(item)"></span>
                </div>
              </div>
            </div>
           
          </div>
        </ng-container>
      </div>
      
    </ng-container>
  </div>
  `,
})
export class DynamicFieldRendererComponent implements OnInit, AfterViewInit, OnChanges {
  constructor(private visibilityService: DynamicTableConfigService) {}

  @Input() isFromEdit = false;
  @Input() field!: DynamicFieldSchema;
  @Input() allFields: DynamicFieldSchema[] = [];
  @Input() formData: Record<string, any> = {};
  @Output() fieldChange = new EventEmitter<DynamicFieldSchema>();
  editorConfig: Record<string, any> = {};
  ngOnInit() {
    // console.log(`[DynamicFieldRenderer] Field '${this.field?.name}' has type: '${this.field?.type}'`);
    this.editorConfig = { ...init, height: this.field?.['height'] ?? 150, skin: 'oxide', menubar: false };
    this.applyFormulaValue();
    if (this.field?.type === 'notes') {
      // console.log('[DynamicFieldRenderer][NOTES] ✅ USING NOTES TEMPLATE');
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['field'] || changes['formData'] || changes['allFields']) {
      this.applyFormulaValue();
    }
  }

  ngAfterViewInit() {
    if (this.field?.type === 'notes') {
      setTimeout(() => {
        const notesElement = document.querySelector(`[data-notes-field="${this.field.name}"]`);
        if (notesElement) {
          console.log('[DynamicFieldRenderer][NOTES] ✅ DOM element found');
        }
      });
    }
  }

  // Check if field should be visible
  isFieldVisible(field: DynamicFieldSchema): boolean {
    if (!field?.showIf) return true;
    return this.visibilityService.isVisible(field, this.getVisibilityFormData());
  }

  private getVisibilityFormData(): Record<string, any> {
    const localFields = (this.allFields || []).reduce((payload: Record<string, any>, field) => {
      if (field?.name) {
        payload[field.name] = field.value;
      }
      return payload;
    }, {});

    return {
      ...(this.formData || {}),
      ...localFields,
      ...(this.field?.name ? { [this.field.name]: this.field.value } : {}),
    };
  }

  onValueChange(value: any) {
    if (this.isFromEdit) return;
    if (this.isFormulaField(this.field)) return;

    this.field = {
      ...this.field,
      value,
    };
    this.fieldChange.emit(this.field);
  }

  isOptionSelected(value: any, option: SelectOption): boolean {
    const normalizedValue = this.normalizeOptionValue(value);
    return (
      normalizedValue === this.normalizeOptionValue(option.value) ||
      normalizedValue === this.normalizeOptionValue(option.label)
    );
  }

  private normalizeOptionValue(value: any): string {
    return String(value ?? '').trim().toLowerCase();
  }

  isFormulaField(field: DynamicFieldSchema | null | undefined): boolean {
    return typeof field?.formula?.expression === 'string' && field.formula.expression.trim().length > 0;
  }

  private applyFormulaValue(): void {
    if (!this.isFormulaField(this.field)) return;

    const localFields = (this.allFields || []).reduce((payload: Record<string, any>, field) => {
      if (field?.name) payload[field.name] = field.value;
      return payload;
    }, {});
    const value = evaluateFormulaExpression(this.field.formula, this.formData || {}, localFields);

    if (this.normalizeOptionValue(value) === this.normalizeOptionValue(this.field.value)) return;

    this.field = {
      ...this.field,
      value,
    };
  }

  getItemText(item: string | { text: string; html?: string }): string {
    if (typeof item === 'string') {
      return item;
    }
    return item.html || item.text || '';
  }

  isMultiCheckboxChecked(optionValue: any): boolean {
    const values = this.field?.value;
    return Array.isArray(values) && values.includes(optionValue);
  }

  onMultiCheckboxChange(optionValue: any, isChecked: boolean) {
    const currentValues = Array.isArray(this.field.value) ? [...this.field.value] : [];
    const nextValues = isChecked
      ? currentValues.includes(optionValue)
        ? currentValues
        : [...currentValues, optionValue]
      : currentValues.filter((value) => value !== optionValue);
    this.onValueChange(nextValues);
  }

  getGridColumnSpan(field: DynamicFieldSchema): string {
    const rawSpan = field?.colSpan ?? field?.['colspan'] ?? 6;
    const span = Math.max(1, Math.min(12, Number(rawSpan) || 6));
    return `span ${span} / span ${span}`;
  }
  isHtmlContent(value: unknown): boolean {
    if (typeof value !== 'string') return false;
  
    return /<\/?[a-z][\s\S]*>/i.test(value);
  }
}
