import {
  Component,
  Input,
  ContentChildren,
  QueryList,
  TemplateRef,
  AfterContentInit,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// ─────────────────────────────────────────────────────────────
// COMPOSITE FIELD CONFIG
// ─────────────────────────────────────────────────────────────

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

  required?: boolean;

  options?: {
    label: string;
    value: any;
  }[];

  showWhen?: {
    field: string;
    value: any;
  };

  decimalPlaces?: number;
  step?: number | string;
}

// ─────────────────────────────────────────────────────────────
// TABLE COLUMN
// ─────────────────────────────────────────────────────────────

export interface ReusableTableColumnWithHeaders {
  field: string;
  header: string;

  width?: string;

  align?: 'left' | 'center' | 'right';
  required?: boolean;
  fieldType?:
    | 'text'
    | 'number'
    | 'date'
    | 'select'
    | 'time'
    | 'textarea'
    | 'drop-down'
    | 'checkbox'
    | 'composite'| 'serial' | 'ser' | string;

  options?: {
    label: string;
    value: any;
  }[];

  template?: string;

  hidden?: boolean;

  sticky?: 'left' | 'right';

  colspan?: number;
  rowspan?: number;

  step?: number | string;

  disabled?: boolean | ((row: any) => boolean);

  sortable?: boolean;

  decimalPlaces?: number;

  compositeFields?: CompositeFieldConfig[];
}

// ─────────────────────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────────────────────

export interface ReusableHeaderCell {
  header: string;

  colspan?: number;
  rowspan?: number;
  field?: string;

  width?: string;

  align?: 'left' | 'center' | 'right';

  hidden?: boolean;
  required?: boolean;

  sticky?: 'left' | 'right';
}

// ─────────────────────────────────────────────────────────────
// EXTRA ACTIONS
// ─────────────────────────────────────────────────────────────

export interface ExtraActionButton {
  icon: any;

  type: string;

  class?: string;

  tooltipTitle?: string;

  show?: (row: any, index: number) => boolean;
}

@Component({
  selector: 'app-form-input-table-with-headers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './form-input-table-with-headers.component.html',
})
export class FormInputTableWithHeaders
  implements AfterContentInit, OnChanges
{
  // ───────────────────────────────────────────────────────────
  // INPUTS
  // ───────────────────────────────────────────────────────────

  @Input() data: any[] = [];

  @Input() columns: ReusableTableColumnWithHeaders[] = [];

  @Input() headerRows?: ReusableHeaderCell[][];

  @Input() enableRowActions = false;

  @Input() maxRows = 99;

  @Input() enableStickyActionColumn = true;

  @Input() extraActionButtons: ExtraActionButton[] = [];

  // ───────────────────────────────────────────────────────────
  // OUTPUTS
  // ───────────────────────────────────────────────────────────

  @Output() actionClick = new EventEmitter<{
    type: string;
    row: any;
    index: number;
  }>();

  @Output() valueChanged = new EventEmitter<{
    index: number;
    field: string;
    value: any;
  }>();

  // ───────────────────────────────────────────────────────────
  // VARIABLES
  // ───────────────────────────────────────────────────────────

  visibleColumns: ReusableTableColumnWithHeaders[] = [];

  templates: Record<string, TemplateRef<any>> = {};

  @ContentChildren(TemplateRef)
  templatesList!: QueryList<TemplateRef<any>>;

  // ───────────────────────────────────────────────────────────
  // LIFECYCLE
  // ───────────────────────────────────────────────────────────

  ngOnChanges(changes: SimpleChanges): void {
    this.visibleColumns = this.columns.filter((col) => !col.hidden);

    if (this.columns.length === 0) return;

    // ALWAYS KEEP 1 ROW
    if (!this.data || this.data.length === 0) {
      this.data = [this.createEmptyRow()];
    } else {
      // BACKFILL MISSING FIELDS
      if (changes['columns'] || changes['data']) {
        this.data.forEach((row) => this.backfillRow(row));
      }
    }

    // SYNC SERIAL NUMBERS
    if (changes['columns'] || changes['data']) {
      this.syncSerialNumbers();
    }
  }

  ngAfterContentInit(): void {
    this.templatesList.forEach((tpl: any) => {
      const name = tpl._declarationTContainer?.localNames?.[0];

      if (name) {
        this.templates[name] = tpl;
      }
    });
  }

  // ───────────────────────────────────────────────────────────
  // ROW HELPERS
  // ───────────────────────────────────────────────────────────

  private createEmptyRow(): any {
    const row: any = {};

    this.backfillRow(row);

    return row;
  }

  private backfillRow(row: any): void {
    for (const col of this.columns) {
      if (!col.field || col.hidden) continue;

      // COMPOSITE
      if (
        col.fieldType === 'composite' &&
        col.compositeFields?.length
      ) {
        for (const sub of col.compositeFields) {
          if (!sub.field) continue;

          if (!(sub.field in row)) {
            row[sub.field] =
              sub.fieldType === 'select' ||
              sub.fieldType === 'drop-down'
                ? null
                : '';
          }
        }

        continue;
      }

      // NORMAL
      if (!(col.field in row)) {
        if (col.field === 's_no') {
          row[col.field] = '';
        } else if (col.fieldType === 'checkbox') {
          row[col.field] = [];
        } else if (
          col.fieldType === 'select' ||
          col.fieldType === 'drop-down'
        ) {
          row[col.field] = null;
        } else if (col.fieldType === 'number') {
          row[col.field] = null;
        } else {
          row[col.field] = '';
        }
      }
    }
  }

  // ───────────────────────────────────────────────────────────
  // SERIAL NUMBER
  // ───────────────────────────────────────────────────────────

  private syncSerialNumbers(): void {
    const hasSerialColumn = this.columns.some(
      (c) => c.field === 's_no' && !c.hidden
    );

    if (!hasSerialColumn) return;

    this.data.forEach((row, index) => {
      row['s_no'] = index + 1;
    });
  }

//   isHeaderRequired(field?: string): boolean {
//     if (!field) return false;

//     return this.columns.some(
//       (c) => c.field === field && c.required
//     );
// }

isHeaderRequired(field?: string, headerCell?: ReusableHeaderCell): boolean {
  // Check directly on the header cell first
  if (headerCell?.required) return true;

  // Fallback: match by field in columns
  if (!field) return false;
  return this.columns.some((c) => c.field === field && c.required);
}
// ------------------------------------- IS ALL THE REQUIRED FEILDS ARE FILLED OR NOT ------------------------------------
  isRowValid(row: any): boolean {
    for (const col of this.visibleColumns) {

      // SKIP SERIAL
      if (col.fieldType === 'serial') continue;

      // COMPOSITE FIELD
      if (
        col.fieldType === 'composite' &&
        col.compositeFields?.length
      ) {

        for (const sub of col.compositeFields) {

          // ONLY CHECK REQUIRED SUBFIELDS
          if (!sub.required) continue;

          // HIDDEN FIELD SKIP
          if (!this.shouldShowSubField(sub, row)) {
            continue;
          }

          const value = row[sub.field];

          if (
            value === null ||
            value === undefined ||
            value === ''
          ) {
            return false;
          }
        }

        continue;
      }

      // NORMAL FIELD
      if (!col.required) continue;

      const value = row[col.field];

      // CHECKBOX
      if (col.fieldType === 'checkbox') {
        if (!Array.isArray(value) || value.length === 0) {
          return false;
        }

        continue;
      }

      // NORMAL EMPTY CHECK
      if (
        value === null ||
        value === undefined ||
        value === ''
      ) {
        return false;
      }
    }
    return true;
  }

  // ───────────────────────────────────────────────────────────
  // ROW ACTIONS
  // ───────────────────────────────────────────────────────────

  addRow(): void {
    if (this.data.length >= this.maxRows) return;

    this.data.push(this.createEmptyRow());

    this.syncSerialNumbers();

    this.data = [...this.data];
  }

  deleteRow(index: number): void {
    // NEVER DELETE LAST ROW
    if (this.data.length <= 1) return;

    this.data.splice(index, 1);

    this.syncSerialNumbers();

    this.data = [...this.data];

    this.actionClick.emit({
      type: 'delete',
      row: null,
      index,
    });
  }

  onAction(type: string, row: any, index: number): void {
    this.actionClick.emit({
      type,
      row,
      index,
    });
  }

  // ───────────────────────────────────────────────────────────
  // HELPERS
  // ───────────────────────────────────────────────────────────

  emitValueChange(
    index: number,
    field: string,
    value: any
  ): void {
    this.valueChanged.emit({
      index,
      field,
      value,
    });
  }

  shouldShowSubField(
    sub: CompositeFieldConfig,
    row: any
  ): boolean {
    if (!sub.showWhen) return true;

    return row[sub.showWhen.field] === sub.showWhen.value;
  }

 handleDecimalInput(
  event: Event,
  col:
    | ReusableTableColumnWithHeaders
    | CompositeFieldConfig,
  row: any,
  fieldOverride?: string
): void {

  const input = event.target as HTMLInputElement;

  let value = input.value;

  // ALLOW EMPTY
  if (value === '') {
    return;
  }

  let allowedDecimals = 0;

  // PRIORITY 1 → decimalPlaces
  if ((col as CompositeFieldConfig).decimalPlaces !== undefined) {

    allowedDecimals =
      (col as CompositeFieldConfig).decimalPlaces!;

  }

  // PRIORITY 2 → decimalPlaces from column
  else if (
    (col as ReusableTableColumnWithHeaders)
      .decimalPlaces !== undefined
  ) {

    allowedDecimals =
      (col as ReusableTableColumnWithHeaders)
        .decimalPlaces!;

  }

  // PRIORITY 3 → derive from step
  else if (
    (col as ReusableTableColumnWithHeaders)
      .step
      ?.toString()
      .includes('.')
  ) {

    allowedDecimals =
      (
        col as ReusableTableColumnWithHeaders
      )
        .step!
        .toString()
        .split('.')[1].length;

  }

  // DEFAULT
  else {
    allowedDecimals = 2;
  }

  // ALLOW TYPING "12."
  if (value.endsWith('.')) {

    const targetField =
      fieldOverride ??
      (col as ReusableTableColumnWithHeaders).field;

    row[targetField] = value;

    return;
  }

  const regex = new RegExp(
    `^\\d*(\\.\\d{0,${allowedDecimals}})?$`
  );

  if (!regex.test(value)) {

    value = value.slice(0, -1);

    input.value = value;
  }

  const targetField =
    fieldOverride ??
    (col as ReusableTableColumnWithHeaders).field;

  row[targetField] = value;
}

  onCheckboxChange(
    event: Event,
    row: any,
    field: string,
    value: any
  ): void {
    if (!row[field]) {
      row[field] = [];
    }

    const checked = (
      event.target as HTMLInputElement
    ).checked;

    if (checked) {
      if (!row[field].includes(value)) {
        row[field].push(value);
      }
    } else {
      row[field] = row[field].filter(
        (v: any) => v !== value
      );
    }
  }

  checkButtonVisibility(
    btn: ExtraActionButton,
    row: any,
    index: number
  ): boolean {
    return !btn.show || btn.show(row, index);
  }

  isFieldDisabled(
    col: ReusableTableColumnWithHeaders,
    row: any
  ): boolean {
    if (typeof col.disabled === 'function') {
      return col.disabled(row);
    }

    return !!col.disabled;
  }

  get filteredHeaderRows() {
    return this.headerRows || [];
  }

  isStickyRight(header: string): boolean {
    const column = this.visibleColumns.find(
      (c) => c.header === header
    );

    return column?.sticky === 'right';
  }

  isFixedWidthColumn(
    col: ReusableTableColumnWithHeaders
  ): boolean {
    return (
      col.field === 's_no' ||
      col.fieldType === 'drop-down' ||
      col.fieldType === 'select'
    );
  }
}
export { FormInputTableWithHeaders as FormInputTableWithHeadersComponent };
