import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CalenderComponent } from '../ui/calender.component';
import { InputComponent } from '../ui/input.component';
import { SelectOption, SelectComponent } from '../ui/select.component';
import { TextareaComponent } from '../ui/textarea';
import { TimePickerComponent } from '../ui/time-picker';
import { FileUploadComponent } from '../ui/file-upload/file-upload.component';
import {
  applyMatrixFormulas,
  hasMatrixFormulas,
  isFormulaCell,
  MatrixCellFormula,
} from './matrix-cell-formula.util';
import { DynamicChartComponent } from './dynamic-chart.component';

export type MatrixCellType =
  | 'label'
  | 'serial'
  | 'input'
  | 'textarea'
  | 'select'
  | 'checkbox-multiple'
  |  'file'
  | 'date'
  | 'time'
  | 'checkbox'
  | 'radio';

export interface MatrixHeaderCell {
  label: string;
  colspan?: number;
  rowspan?: number;
  align?: 'left' | 'center' | 'right';
  width?: string;
  className?: string;
}

export interface MatrixColumn {
  key: string;
  label: string;
  type?: MatrixCellType;
  inputType?: 'text' | 'number' | 'email' | 'password';
  align?: 'left' | 'center' | 'right';
  width?: string;
  required?: boolean;
  disabled?: boolean;
  options?: SelectOption[];
  searchable?: boolean;
}

export interface MatrixCell {
  _id?: string;
  key?: string;
  type?: MatrixCellType;
  value?: any;
  label?: string;
  lb?:string;
  placeholder?: string;
  rows?: number;
  align?: 'left' | 'center' | 'right';
  width?: string;
  colspan?: number;
  rowspan?: number;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  inputType?: 'text' | 'number' | 'email' | 'password';
  options?: SelectOption[];
  searchable?: boolean;
  className?: string;
  highlightBelow?: number;
  /** When set, value is derived from other cells in the same row (opt-in). */
  formula?: MatrixCellFormula;
}

export interface MatrixRow {
  _id?: string;
  cells: MatrixCell[];
  className?: string;
}

@Component({
  selector: 'app-dynamic-matrix-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    InputComponent,
    TextareaComponent,
    CalenderComponent,
    TimePickerComponent,
    SelectComponent,
    FileUploadComponent,
    DynamicChartComponent,
  ],
  template: `
    <div
      class="w-full"
      [ngClass]="{
        'overflow-x-auto': !isReport,
        'report-matrix': isReport
      }"
    >
      <!-- Chart Section (TOP position) -->
<div *ngIf="chart?.enabled && chart?.position !== 'bottom'" class="mb-6 print:mb-4 print:break-inside-avoid">
  <app-dynamic-chart
    [tableData]="getChartData()"
    [chartConfig]="{
      title: chart?.title,
      type: chart?.type || 'bar',
      xAxisKey: chart?.xAxisKey,
      yAxisKey: chart?.yAxisKey,
      labelKey: chart?.labelKey,
      datasets: chart?.datasets
    }"
  ></app-dynamic-chart>
</div>

      <table
         class="w-full border-collapse border border-white/20 text-white [&_th]:border [&_th]:border-white/20 [&_th]:bg-white/10 [&_th]:px-3 [&_th]:py-2 [&_th]:align-middle [&_th]:text-sm [&_th]:font-semibold [&_td]:border [&_td]:border-white/15 [&_td]:px-3 [&_td]:py-2"
        [class.report-table]="isReport"
      >
        <thead>
          <tr *ngFor="let headerRow of topHeaders; trackBy: trackByHeaderRow">
            <th
              *ngFor="let cell of headerRow; trackBy: trackByHeaderCell"
              [attr.colspan]="cell.colspan || 1"
              [attr.rowspan]="cell.rowspan || 1"
              [style.width]="cell.width || null"
              [ngClass]="cell.className || ''"
              [style.text-align]="cell.align || 'center'"
            >
              {{ cell.label }}
            </th>

            <th
              *ngIf="showRowActions && headerRow === topHeaders[topHeaders.length - actionHeaderRowspan]"
              [attr.rowspan]="actionHeaderRowspan"

              class="text-center text-sm font-semibold"
            >
              Action
            </th>
          </tr>

          <tr *ngIf="columns?.length && !topHeaders?.length">
            <th
              *ngFor="let col of columns; trackBy: trackByColumn"
              [style.width]="col.width || null"
              [style.text-align]="col.align || 'center'"
            >
              {{ col.label }}
            </th>

            <th *ngIf="showRowActions" class="text-center text-sm font-semibold">
              Action
            </th>
          </tr>
        </thead>

        <tbody>
          <tr *ngIf="!rows?.length">
            <td
              [attr.colspan]="(topHeaders?.[0]?.length || columns?.length || 1) + (showRowActions ? 1 : 0)"
              class="px-3 py-6 text-center text-sm text-white/60"
            >
              No records found.
            </td>
          </tr>

          <tr
            *ngFor="let row of rows; let rowIndex = index; trackBy: trackByRow"
            class="transition hover:bg-white/[0.03]"
            [ngClass]="row.className || ''"
          >
            <td
              *ngFor="let cell of row.cells; let cellIndex = index; trackBy: trackByCell"
              [attr.colspan]="cell.colspan || 1"
              [attr.rowspan]="cell.rowspan || 1"
              [style.width]="getCellWidth(cell, cellIndex)"
              [ngClass]="getCellClasses(cell)"
              [style.min-width]="getWidth(cell, cellIndex)"
              [style.max-width]="resolveType(cell, cellIndex) === 'serial' ? '50px' : null"
              [style.text-align]="cell.align || 'left'"
            >
              <ng-container [ngSwitch]="resolveType(cell, cellIndex)">
                <div *ngSwitchCase="'label'" class="whitespace-pre-wrap text-white/90">
                  <span *ngIf="isHtmlContent(cell.label ?? cell.value ?? '')" [innerHTML]="cell.label ?? cell.value ?? ''"></span>
                  <span *ngIf="!isHtmlContent(cell.label ?? cell.value ?? '')">
                    {{ cell.label ?? cell.value ?? '' }}
                  </span>
                </div>

                <div *ngSwitchCase="'serial'" class="text-center font-semibold text-white">
                  <span *ngIf="isHtmlContent(cell.label ?? cell.value ?? '')" [innerHTML]="cell.label ?? cell.value ?? ''"></span>
                  <span *ngIf="!isHtmlContent(cell.label ?? cell.value ?? '')">
                    {{ cell.label ?? cell.value ?? '' }}
                  </span>
                </div>

                <app-input
                  *ngSwitchCase="'input'"
                  [type]="cell.inputType || 'text'"
                  [label]="cell.lb ?? ''"
                  [placeholder]="cell.placeholder || ''"
                  [required]="!!cell.required"
                  [disabled]="cell.disabled || isFormulaCell(cell) || disabled"
                  [ngModel]="cell.value"
                  (ngModelChange)="updateCell(row._id!, cell._id!, $event)"
                ></app-input>

                <app-textarea
                  *ngSwitchCase="'textarea'"
                  [rows]="cell.rows || 1"
                  [label]="cell.lb ?? ''"
                  [placeholder]="cell.placeholder || ''"
                  [required]="!!cell.required"
                  [disabled]="cell.disabled || disabled"
                  [ngModel]="cell.value"
                  (ngModelChange)="updateCell(row._id!, cell._id!, $event)"
                ></app-textarea>

                <app-select
                  *ngSwitchCase="'select'"
                  [options]="cell.options || []"
                  [label]="cell.lb ?? ''"
                  [searchable]="false"
                  [required]="!!cell.required"
                  [disabled]="cell.disabled || disabled"
                  [placeholder]="cell.placeholder || '--Select--'"
                  [ngModel]="cell.value"
                  (ngModelChange)="updateCell(row._id!, cell._id!, $event)"
                ></app-select>

                <app-calendar
                  *ngSwitchCase="'date'"
                  [label]="cell.lb ?? ''"
                  [disabled]="cell.disabled || disabled"
                  [ngModel]="cell.value"
                  (ngModelChange)="updateCell(row._id!, cell._id!, $event)"
                ></app-calendar>

                <app-file-upload
                  *ngSwitchCase="'file'"
                  [disabled]="cell.disabled || disabled"
                  [ngModel]="cell.value"
                  (ngModelChange)="updateCell(row._id!, cell._id!, $event)"
                ></app-file-upload>

                <app-time-picker
                  *ngSwitchCase="'time'"
                  [label]="cell.lb ?? ''"
                  [disabled]="cell.disabled || disabled"
                  [ngModel]="cell.value"
                  (ngModelChange)="updateCell(row._id!, cell._id!, $event)"
                ></app-time-picker>

                <div *ngSwitchCase="'checkbox'" class="flex justify-center">
                  <label class="flex items-center gap-2 text-sm text-white/90">
                    {{ cell.label ?? '' }}
                  <input
                    type="checkbox"
                    class="h-4 w-4 shrink-0 cursor-pointer accent-[#61C2FF]"
                    [disabled]="cell.disabled || disabled"
                    [checked]="!!cell.value"
                    (change)="updateCell(row._id!, cell._id!, $any($event.target).checked)"
                  />
                  </label>
                </div>

                <div *ngSwitchCase="'radio'" class="flex flex-wrap items-center gap-4">
                  <label
                    *ngFor="let option of cell.options || []"
                    class="flex items-center gap-2 text-sm text-white/90"
                  >
                    <input
                      type="radio"
                      class="h-4 w-4 shrink-0 cursor-pointer accent-[#61C2FF]"
                      [name]="cell._id"
                      [value]="option.value"
                      [checked]="isRadioOptionSelected(cell, option)"
                      [disabled]="cell.disabled || isFormulaCell(cell) || disabled"
                      (change)="updateCell(row._id!, cell._id!, option.value)"
                    />
                    <span>{{ option.label }}</span>
                  </label>
                </div>
                <div *ngSwitchCase="'checkbox-multiple'" class="w-full">
                  <div class="flex flex-wrap items-center gap-2 group">
                    <label class="mb-1.5 block text-sm font-medium text-white">
                      {{ cell.label }}
                      <span *ngIf="cell.required" class="text-red-500">*</span>
                    </label>
                    <div class="flex flex-wrap items-center gap-5">
                      <label
                        *ngFor="let option of cell.options || []"
                        class="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          class="h-4 w-4 shrink-0 cursor-pointer accent-[#61C2FF]"
                          [value]="option.value"
                          [checked]="isCheckboxOptionSelected(cell, option)"
                          [disabled]="cell.disabled || disabled"
                          (change)="updateMultipleCheckboxCell(row._id!, cell._id!, option, $any($event.target).checked)"
                        />
                        <span>{{ option.label }}</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div *ngSwitchDefault class="text-sm text-white/90">
                  {{ cell.label ?? cell.value ?? '' }}
                </div>
              </ng-container>
            </td>

            <td *ngIf="showRowActions" class="px-2 py-2 text-center align-middle">
              <div class="flex items-center justify-center gap-2">
                <button
                  type="button"
                  class="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/25"
                  (click)="addRow(rowIndex)"
                  [disabled]="disabled"
                >
                  Add
                </button>

                <button
                  type="button"
                  class="rounded-md border border-red-400/40 bg-red-500/15 px-2 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/25"
                  (click)="removeRow(rowIndex)"
                  [disabled]="disabled || rows.length <= minRows"
                >
                  Remove
                </button>
              </div>
            </td>
          </tr>
        </tbody>

      </table>
        <!-- Chart Section (BOTTOM position) -->
  <div *ngIf="chart?.enabled && chart?.position === 'bottom'" class="mt-6 print:mt-4 print:break-inside-avoid">
    <app-dynamic-chart
      [tableData]="getChartData()"
      [chartConfig]="{
        title: chart?.title,
        type: chart?.type || 'bar',
        xAxisKey: chart?.xAxisKey,
        yAxisKey: chart?.yAxisKey,
        labelKey: chart?.labelKey,
        datasets: chart?.datasets
      }"
    ></app-dynamic-chart>
  </div>
  <!-- Multiple Graphs Section -->
<div *ngIf="multipleGraphs?.length" class="mt-8 space-y-6 print:mt-4 print:break-inside-avoid">
  <div class="border-t border-white/15 pt-4 print:border-slate-300 print:pt-2">
    <h4 class="mb-3 head3 print:mb-2 print:border print:border-slate-800 print:bg-slate-100 print:px-2 print:py-1 print:text-xs print:font-bold print:uppercase print:text-black">Individual Row Analysis</h4>
  </div>
  <div *ngFor="let graph of multipleGraphs" class="mb-6">
    <app-dynamic-chart
      [tableData]="getFilteredData(graph.rowIndices)"
      [chartConfig]="{
        title: graph.title,
        type: graph.type || 'bar',
        labelKey: graph.labelKey,
        datasets: graph.datasets
      }"
    ></app-dynamic-chart>
    <p *ngIf="graph.description" class="mt-2 text-center text-sm text-white/60">
      {{ graph.description }}
    </p>
  </div>
</div>
    </div>
  `,
})
export class DynamicMatrixTableComponent implements OnChanges {
  /** Exposed for template: formula-driven cells are read-only. */
  readonly isFormulaCell = isFormulaCell;

  @Input() isReport = false;
  @Input() tableId?: string;
  @Input() formData: Record<string, any> = {};
  @Input() topHeaders: MatrixHeaderCell[][] = [];
  @Input() columns: MatrixColumn[] = [];
  @Input() rows: MatrixRow[] = [];
  @Input() showRowActions = false;
  @Input() actionHeaderRowspan = 1;
  @Input() minRows = 1;
  @Input() disabled = false;
  @Input() chart?: {
  enabled: boolean;
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'radar';
  title?: string;
  xAxisKey?: string;
  yAxisKey?: string;
  position?: 'top' | 'bottom';
  labelKey?: string;
  datasets?: { key: string; label: string; color?: string }[];
};
@Input() multipleGraphs?: {
  title: string;
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'radar';
  rowIndices: number[];
  labelKey?: string;
  description?: string;
  datasets?: { key: string; label: string; color?: string }[];
}[];

  @Output() rowsChange = new EventEmitter<MatrixRow[]>();
  @Output() dataChange = new EventEmitter<any[]>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rows']) {
      this.ensureStableIds();
    }

    if (changes['rows'] || changes['formData'] || changes['tableId']) {
      this.rows = this.applyFormulasIfNeeded();
    }
  }

  private ensureStableIds(): void {
    this.rows = (this.rows || []).map((row, rowIndex) => ({
      ...row,
      _id: row._id || this.makeId('row', rowIndex),
      cells: (row.cells || []).map((cell, cellIndex) => ({
        ...cell,
        _id: cell._id || this.makeId('cell', rowIndex, cellIndex, cell.key || cell.type || 'x'),
      })),
    }));
  }

  private makeId(...parts: any[]): string {
    return parts.join('_');
  }

  trackByHeaderRow = (index: number) => index;

  trackByHeaderCell = (index: number, cell: MatrixHeaderCell) =>
    `${index}_${cell.label}_${cell.colspan ?? 1}_${cell.rowspan ?? 1}`;

  trackByColumn = (index: number, column: MatrixColumn) =>
    column.key || `${index}_${column.label}`;

  trackByRow = (_: number, row: MatrixRow) => row._id || _;

  trackByCell = (_: number, cell: MatrixCell) => cell._id || cell.key || _;

  resolveType(cell: MatrixCell, cellIndex: number): MatrixCellType {
    if (cell.type) return cell.type;
    return this.columns[cellIndex]?.type || 'label';
  }

  isRadioOptionSelected(cell: MatrixCell, option: SelectOption): boolean {
    const cellValue = this.normalizeOptionValue(cell.value);
    return (
      cellValue === this.normalizeOptionValue(option.value) ||
      cellValue === this.normalizeOptionValue(option.label)
    );
  }

  isCheckboxOptionSelected(cell: MatrixCell, option: SelectOption): boolean {
    const values = Array.isArray(cell.value)
      ? cell.value
      : cell.value === undefined || cell.value === null || cell.value === ''
        ? []
        : [cell.value];

    const optionValue = this.normalizeOptionValue(option.value);
    const optionLabel = this.normalizeOptionValue(option.label);

    return values.some((value) => {
      const normalizedValue = this.normalizeOptionValue(value);
      return normalizedValue === optionValue || normalizedValue === optionLabel;
    });
  }

  updateMultipleCheckboxCell(
    rowId: string,
    cellId: string,
    option: SelectOption,
    checked: boolean
  ): void {
    if (this.disabled) return;

    const targetRow = this.rows.find((row) => row._id === rowId);
    const targetCell = targetRow?.cells.find((cell) => cell._id === cellId);
    if (isFormulaCell(targetCell)) return;

    const currentValues = Array.isArray(targetCell?.value)
      ? targetCell.value
      : targetCell?.value === undefined || targetCell.value === null || targetCell.value === ''
        ? []
        : [targetCell.value];

    const normalizedOptionValue = this.normalizeOptionValue(option.value);
    const normalizedOptionLabel = this.normalizeOptionValue(option.label);
    const nextValues = checked
      ? currentValues.some((value) => {
          const normalizedValue = this.normalizeOptionValue(value);
          return normalizedValue === normalizedOptionValue || normalizedValue === normalizedOptionLabel;
        })
        ? currentValues
        : [...currentValues, option.value]
      : currentValues.filter(
          (value) => {
            const normalizedValue = this.normalizeOptionValue(value);
            return normalizedValue !== normalizedOptionValue && normalizedValue !== normalizedOptionLabel;
          }
        );

    this.updateCell(rowId, cellId, nextValues);
  }

  updateCell(rowId: string, cellId: string, value: any): void {
    if (this.disabled) return;

    const targetRow = this.rows.find((row) => row._id === rowId);
    const targetCell = targetRow?.cells.find((cell) => cell._id === cellId);
    if (isFormulaCell(targetCell)) return;

    let updatedRows = this.rows.map((row) => {
      if (row._id !== rowId) return row;

      return {
        ...row,
        cells: row.cells.map((cell) =>
          cell._id === cellId ? { ...cell, value } : cell
        ),
      };
    });

    updatedRows = this.applyFormulasIfNeeded(updatedRows);
    this.rows = updatedRows;
    this.rowsChange.emit(this.rows);
    this.dataChange.emit(this.toFlatData());
  }

  addRow(afterIndex: number): void {
    if (this.disabled) return;

    const baseRow = this.rows[afterIndex];
    if (!baseRow) return;

    const newRow: MatrixRow = {
      _id: this.makeId('row', Date.now(), Math.random().toString(36).slice(2, 7)),
      cells: baseRow.cells.map((cell, cellIndex) => ({
        ...cell,
        _id: this.makeId('cell', Date.now(), cellIndex, Math.random().toString(36).slice(2, 7)),
        value: cell.type === 'serial' ? '' : this.getEmptyValue(cell),
      })),
    };

    this.rows = [
      ...this.rows.slice(0, afterIndex + 1),
      newRow,
      ...this.rows.slice(afterIndex + 1),
    ];

    this.recalculateSerials();
    this.rows = this.applyFormulasIfNeeded();
    this.rowsChange.emit(this.rows);
    this.dataChange.emit(this.toFlatData());
  }

  removeRow(rowIndex: number): void {
    if (this.disabled) return;

    if (this.rows.length <= this.minRows) return;

    this.rows = this.rows.filter((_, index) => index !== rowIndex);
    this.recalculateSerials();
    this.rows = this.applyFormulasIfNeeded();
    this.rowsChange.emit(this.rows);
    this.dataChange.emit(this.toFlatData());
  }

  private recalculateSerials(): void {
    this.rows = this.rows.map((row, index) => ({
      ...row,
      cells: row.cells.map((cell) =>
        cell.type === 'serial' ? { ...cell, value: String(index + 1) } : cell
      ),
    }));
  }

  private getEmptyValue(cell: MatrixCell): any {
    if (cell.type === 'checkbox') return false;
    if (cell.type === 'checkbox-multiple') return [];
    return '';
  }

  private normalizeOptionValue(value: any): string {
    return String(value ?? '').trim().toLowerCase();
  }

  toFlatData(): any[] {
    return this.rows.map((row) => {
      const obj: any = {};
      row.cells.forEach((cell, index) => {
        const key = cell.key || this.columns[index]?.key;
        if (key) obj[key] = cell.value;
      });
      return obj;
    });
  }
  getChartData(): any[] {
  return this.toFlatData();
}
getFilteredData(rowIndices: number[]): any[] {
  const allData = this.toFlatData();
  return allData.filter((_, index) => rowIndices.includes(index + 1));
}

  /** Recomputes formula cells only when the table defines at least one formula. */
  private applyFormulasIfNeeded(rows: MatrixRow[] = this.rows): MatrixRow[] {
    if (!hasMatrixFormulas(rows)) return rows;
    return applyMatrixFormulas(rows, {
      tableId: this.tableId,
      formData: this.formData,
    });
  }
  isHtmlContent(value: unknown): boolean {
    if (typeof value !== 'string') return false;

    return /<\/?[a-z][\s\S]*>/i.test(value);
  }

  getCellWidth(cell: MatrixCell, cellIndex: number): string | null {
    if (cell.width) return cell.width;
    return this.resolveType(cell, cellIndex) === 'serial' ? '20px' : null;
  }

  getWidth(cell: MatrixCell, cellIndex: number): string {
    if (cell.width) return cell.width;
    if (this.isReport) return 'auto';
    if (this.resolveType(cell, cellIndex) === 'serial') return '20px';

    return '170px';
  }

  getCellClasses(cell: MatrixCell): string[] {
    const classes = [cell.className || '', 'align-middle'];
    const threshold = Number(cell.highlightBelow);
    const value = Number(cell.value);

    if (Number.isFinite(threshold) && Number.isFinite(value) && value < threshold) {
      classes.push('bg-red-500/15 text-red-300');
    }

    return classes;
  }

}
