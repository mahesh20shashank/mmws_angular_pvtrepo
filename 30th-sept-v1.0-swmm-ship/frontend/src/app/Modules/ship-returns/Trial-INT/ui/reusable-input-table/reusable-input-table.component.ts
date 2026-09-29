import {
  AfterContentInit,
  Component,
  ContentChildren,
  Input,
  OnChanges,
  QueryList,
  SimpleChanges,
  TemplateRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputComponent } from '../input.component';
import { TextareaComponent } from '../textarea';
import { SelectComponent } from '../select.component';
export interface CompositeFieldConfig {
  field: string;

  fieldType:
    | 'text'
    | 'number'
    | 'date'
    | 'time'
    | 'textarea'
    | 'drop-down'
    | 'select';

  width?: string;

  placeholder?: string;

  options?: {
    label: string;
    value: any;
  }[];

  showWhen?: {
    field: string;
    value: any;
  };

  decimalPlaces?: number;
  required?: boolean;
}

export interface ReusableTableColumn {
  field: string;
  header: string;

  width?: string;

  sortable?: boolean;

  align?: 'left' | 'center' | 'right';

  fieldType?:
    | 'text'
    | 'number'
    | 'date'
    | 'select'
    | 'time'
    | 'ser'
    | 'textarea'
    | 'drop-down'
    | 'checkbox'
    | 'composite';

  options?: {
    label: string;
    value: any;
  }[];

  hidden?: boolean;

  template?: string;

  sticky?: 'left' | 'right';

  group?: string;

  decimalPlaces?: number;

  compositeFields?: CompositeFieldConfig[];

  required?: boolean;

  showWhen?: {
    field: string;
    value: any;
  };

  placeholder?: string;

  min?: number;
  max?: number;
  step?: number;
}

export interface TopHeader {
  label: string;
  colspan?: number;
  rowspan?: number;
  align?: 'left' | 'center' | 'right';
}

@Component({
  selector: 'app-reusable-input-table',
  standalone: true,

  imports: [
    CommonModule,
    FormsModule,
    InputComponent,
    TextareaComponent,
    SelectComponent,
  ],

  templateUrl: './reusable-input-table.component.html',
})
export class ReusableInputTableComponent
  implements AfterContentInit, OnChanges
{
  // ============================================================
  // INPUTS
  // ============================================================

  @Input() data: any[] = [];

  @Input() columns: ReusableTableColumn[] = [];

  @Input() topHeader: TopHeader[] = [];

  @Input() enableChildHeaders = false;

  @Input() enableRowActions = false;

  @Input() maxRows = 99;

  @Input() isReadonly = false;

  get childColumns(): ReusableTableColumn[] {
    return this.columns.filter((column) => column.group);
  }

  // ============================================================
  // CUSTOM TEMPLATES
  // ============================================================

  @ContentChildren(TemplateRef)
  templatesList!: QueryList<TemplateRef<any>>;

  templates: Record<string, TemplateRef<any>> = {};

  // ============================================================
  // LIFECYCLE
  // ============================================================

  ngAfterContentInit(): void {
    this.templatesList?.forEach((tpl: any) => {
      const name = tpl?._declarationTContainer?.localNames?.[0];

      if (name) {
        this.templates[name] = tpl;
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.columns?.length) {
      return;
    }

    // If no rows exist, create one row
    if (!this.data.length) {
      this.data.push(this.createEmptyRow());
    } else {
      // Backfill missing properties
      if (changes['columns'] || changes['data']) {
        this.data.forEach((row) => {
          this.backfillRow(row);
        });
      }
    }

    if (this.enableRowActions && (changes['data'] || changes['columns'])) {
      this.syncSerialNumbers();
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  isStickyRight(header: string): boolean {
    return this.columns.find((c) => c.header === header)?.sticky === 'right';
  }

  // ============================================================
  // CREATE EMPTY ROW
  // ============================================================

  private createEmptyRow(): any {
    const row: any = {};

    this.backfillRow(row);

    return row;
  }

  // ============================================================
  // BACKFILL ROW
  // ============================================================

  private backfillRow(row: any): void {
    for (const col of this.columns) {
      if (!col.field) {
        continue;
      }

      // --------------------------------------------------------
      // Composite
      // --------------------------------------------------------

      if (col.fieldType === 'composite' && col.compositeFields?.length) {
        for (const sub of col.compositeFields) {
          if (!sub.field) {
            continue;
          }

          if (!(sub.field in row)) {
            if (sub.fieldType === 'select' || sub.fieldType === 'drop-down') {
              row[sub.field] = null;
            } else {
              row[sub.field] = '';
            }
          }
        }

        continue;
      }

      // --------------------------------------------------------
      // Normal fields
      // --------------------------------------------------------

      if (!(col.field in row)) {
        if (col.fieldType === 'checkbox') {
          row[col.field] = [];
        } else if (
          col.fieldType === 'select' ||
          col.fieldType === 'drop-down'
        ) {
          row[col.field] = null;
        } else {
          row[col.field] = '';
        }
      }
    }
  }

  // ============================================================
  // FIELD VISIBILITY
  // ============================================================

  shouldShowField(col: ReusableTableColumn, row: any): boolean {
    if (col.hidden === true) {
      return false;
    }

    if (!col.showWhen) {
      return true;
    }

    return row?.[col.showWhen.field] === col.showWhen.value;
  }

  // ============================================================
  // COMPOSITE FIELD VISIBILITY
  // ============================================================

  shouldShowCompositeField(field: CompositeFieldConfig, row: any): boolean {
    if (!field.showWhen) {
      return true;
    }

    return row?.[field.showWhen.field] === field.showWhen.value;
  }

  // ============================================================
  // WIDTH
  // ============================================================

  isFixedWidthColumn(col: ReusableTableColumn): boolean {
    return (
      col.field === 'sr_no' ||
      col.fieldType === 'select' ||
      col.fieldType === 'drop-down'
    );
  }

  // ============================================================
  // SERIAL NUMBER
  // ============================================================

  private syncSerialNumbers(): void {
    const serialColumn = this.columns.some((c) => c.field === 'sr_no');

    if (!serialColumn) {
      return;
    }

    this.data.forEach((row, index) => {
      row['sr_no'] = index + 1;
    });
  }

  // ============================================================
  // ADD ROW
  // ============================================================

  addRow(): void {
    if (!this.enableRowActions || this.data.length >= this.maxRows) {
      return;
    }

    this.data.push(this.createEmptyRow());

    this.syncSerialNumbers();

    // Create new array reference
    this.data = [...this.data];
  }

  // ============================================================
  // DELETE ROW
  // ============================================================

  requestDeleteRow(rowIndex: number): void {
    if (this.data.length <= 1) {
      return;
    }

    if (!window.confirm('Are you sure you want to delete this row?')) {
      return;
    }

    this.data.splice(rowIndex, 1);

    this.syncSerialNumbers();

    this.data = [...this.data];
  }

  isRowValid(row: any): boolean {
    return this.columns.every((col) => {
      // Non-required column
      if (!col.required) {
        return true;
      }

      if (col.fieldType === 'composite' && col.compositeFields?.length) {
        return col.compositeFields.every((sub) => {
          // Not required
          if (!sub.required) {
            return true;
          }

          // If condition isn't met, don't validate it
          if (!this.shouldShowCompositeField(sub, row)) {
            return true;
          }

          const value = row?.[sub.field];

          return this.hasValue(value);
        });
      }

      if (!this.shouldShowField(col, row)) {
        return true;
      }

      return this.hasValue(row?.[col.field]);
    });
  }

  private hasValue(value: any): boolean {
    if (value === null || value === undefined || value === '') {
      return false;
    }

    if (Array.isArray(value) && value.length === 0) {
      return false;
    }

    return true;
  }

  // ============================================================
  // TABLE VALUE CHANGE
  // ============================================================

  onTableValueChange(index: number, field: string, value: any): void {
    if (!this.data[index]) {
      return;
    }

    this.data[index][field] = value;

    // Create a new array reference
    this.data = [...this.data];
  }

  // ============================================================
  // CHECKBOX
  // ============================================================

  onCheckboxChange(event: Event, row: any, field: string, value: any): void {
    if (!Array.isArray(row[field])) {
      row[field] = [];
    }

    const checked = (event.target as HTMLInputElement).checked;

    if (checked) {
      if (!row[field].includes(value)) {
        row[field].push(value);
      }
    } else {
      row[field] = row[field].filter((v: any) => v !== value);
    }

    this.data = [...this.data];
  }

  // ============================================================
  // DECIMAL INPUT
  // ============================================================

  handleDecimalInput(
    event: Event,
    col: ReusableTableColumn | CompositeFieldConfig,
    row: any,
    fieldOverride?: string,
  ): void {
    const input = event.target as HTMLInputElement;

    let value = input.value;

    if (col.decimalPlaces !== undefined) {
      const decimalPlaces = col.decimalPlaces;

      const regex = new RegExp(`^\\d*(\\.\\d{0,${decimalPlaces}})?$`);

      if (!regex.test(value)) {
        value = value.slice(0, -1);

        input.value = value;
      }
    }

    const targetField = fieldOverride ?? col.field;

    row[targetField] = value;

    this.data = [...this.data];
  }
}
