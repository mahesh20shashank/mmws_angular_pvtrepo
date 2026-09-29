import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-form-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="glass-card max-h-[90vh] overflow-hidden text-[var(--text-primary)] shadow-[0_30px_80px_rgba(0,0,0,0.4)] flex flex-col">
      <header *ngIf="title || smallTitle" class="border-b border-[var(--border-primary)] px-5 py-3.5 flex flex-col justify-center shrink-0">
        <h2 *ngIf="title" class="text-[1.05rem] font-semibold leading-snug tracking-tight text-[var(--text-primary)]">{{ title }}</h2>
        <p *ngIf="smallTitle" class="text-xs text-[var(--text-muted)] mt-0.5">{{ smallTitle }}</p>
      </header>
      <div class="flex-1 overflow-y-auto p-5 custom-scrollbar min-h-0">
        <ng-content></ng-content>
      </div>
      <footer class="border-t border-[var(--border-primary)] px-5 py-3 bg-[var(--bg-card)] backdrop-blur-md flex items-center justify-end gap-3 shrink-0">
        <ng-content select="[formFooter]"></ng-content>
      </footer>
    </section>
  `,
})
export class FormCardComponent {
  // Old definition:
  // @Input() title = '';
  // @Input() smallTitle = '';
  @Input() title = '';
  @Input() smallTitle = '';
  @Input() previewMode = false;
  @Input() showPreviousReport = false;
  @Input() showTopBar = true;
  @Input() showFormFooter = true;
  @Input() previousReportLabel = 'Previous Report';
  @Input() showSecondaryAction = false;
  @Input() secondaryActionLabel = 'Trial Pass';
  @Input() showBackButton = false;
  @Input() backLabel = 'Back';
  @Input() pageScroll = true;
  @Input() showPaginator = false;
  @Input() currentPage = 1;
  @Input() totalPages = 1;

  @Output() previousReport = new EventEmitter<void>();
  @Output() action = new EventEmitter<void>();
  @Output() secondaryAction = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();
  @Output() paginator = new EventEmitter<number>();
  @Output() firstPage = new EventEmitter<void>();
  @Output() prevPage = new EventEmitter<void>();
  @Output() nextPage = new EventEmitter<void>();
  @Output() lastPage = new EventEmitter<void>();
}

@Component({
  selector: 'app-reusable-delete-dialog',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div *ngIf="open" class="fixed inset-0 z-[999999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <div class="glass-card w-full max-w-sm text-[var(--text-primary)] shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
        <div class="flex flex-col items-center gap-3 px-6 pb-2 pt-7 text-center">
          <div class="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-rose-400/30 bg-rose-500/15 text-rose-500">
            <app-icon name="triangle-alert" [size]="22" variant="inherit" class="text-rose-500" />
          </div>
          <h2 class="text-base font-semibold text-[var(--text-primary)]">Delete {{ entityType || 'Item' }}?</h2>
          <p class="text-sm leading-relaxed text-[var(--text-muted)]">
            {{ message || ('Are you sure you want to delete' + (name ? ' “' + name + '”' : ' this ' + (entityType || 'item').toLowerCase()) + '? This action cannot be undone.') }}
          </p>
        </div>

        <div class="flex items-center justify-end gap-3 border-t border-[var(--border-primary)] px-5 py-4">
          <button type="button" [disabled]="loading" (click)="cancel.emit()"
            class="rounded-lg border border-[var(--border-input)] bg-[var(--bg-input)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-nav-child-hover)] disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]">
            Cancel
          </button>
          <button type="button" [disabled]="loading" (click)="confirm.emit()"
            class="inline-flex items-center gap-2 rounded-lg border border-rose-400/40 bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]">
            <app-icon *ngIf="loading" name="loader-2" [size]="16" [spin]="true" variant="inherit" />
            <span>{{ loading ? 'Deleting...' : 'Delete' }}</span>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ReusableDeleteDialogComponent {
  @Input() open = false; @Input() message = ''; @Input() loading = false; @Input() name = ''; @Input() entityType = '';
  @Output() confirm = new EventEmitter<void>(); @Output() cancel = new EventEmitter<void>();
}

@Component({
  selector: 'app-reusable-input-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="overflow-x-auto rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)]">
      <table class="w-full min-w-[900px] border-collapse text-sm text-[var(--text-primary)]">
        <thead class="bg-[var(--ag-header-bg)]">
          <tr>
            <th *ngFor="let column of columns" class="border-r border-[var(--border-primary)] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-primary)] last:border-r-0">
              {{ column.header || column.headerName }}
            </th>
            <th *ngIf="enableRowActions" class="w-40 border-r border-[var(--border-primary)] px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--text-primary)]">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let row of data; let rowIndex = index" class="border-t border-[var(--border-primary)]">
            <td *ngFor="let column of columns" class="border-r border-[var(--border-primary)] px-4 py-2 last:border-r-0">
              <span *ngIf="column.fieldType !== 'text' && column.fieldType !== 'select'" class="text-[var(--text-primary)]">
                {{ row[column.field || column.key] }}
              </span>
              <input *ngIf="column.fieldType === 'text'" [(ngModel)]="row[column.field || column.key]"
                class="h-[42px] w-full rounded-[10px] border border-[var(--border-input)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[#61C2FF]" />
              <select *ngIf="column.fieldType === 'select'" [(ngModel)]="row[column.field || column.key]"
                class="h-[42px] w-full rounded-[10px] border border-[var(--border-input)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[#61C2FF]">
                <option value="">Select</option>
                <option *ngFor="let option of column.options || []" [ngValue]="option.value">{{ option.label }}</option>
              </select>
            </td>
            <td *ngIf="enableRowActions" class="px-4 py-2">
              <div class="flex items-center justify-center gap-1.5">
                <button type="button" (click)="addRow()" class="grid h-8 w-8 place-items-center rounded-full border border-emerald-500/40 bg-emerald-500/15 text-emerald-600 transition hover:bg-emerald-500/30" title="Add row">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
                    <path d="M10 4v12M4 10h12"></path>
                  </svg>
                </button>
                <button type="button" (click)="removeRow(rowIndex)" [disabled]="data.length === 1"
                  class="grid h-8 w-8 place-items-center rounded-full border border-rose-500/40 bg-rose-500/15 text-rose-600 transition hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-35" title="Remove row">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
                    <path d="M3.5 5.5h13M7.5 5.5V4.4A1.4 1.4 0 0 1 8.9 3h2.2a1.4 1.4 0 0 1 1.4 1.4v1.1M6.5 6.5l.7 9.1A1.5 1.5 0 0 0 8.7 17h2.6a1.5 1.5 0 0 0 1.5-1.4l.7-9.1"></path>
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class ReusableInputTableComponent {
  @Input() data: any[] = [];
  @Input() columns: any[] = [];
  @Input() enableRowActions = false;
  @Input() isReadonly = false;

  addRow(): void {
    const row = this.columns.reduce((result, column) => {
      result[column.field || column.key] = column.field === 'sr_no' ? this.data.length + 1 : '';
      return result;
    }, {} as Record<string, unknown>);
    this.data.push(row);
  }

  removeRow(index: number): void {
    if (this.data.length <= 1) return;
    this.data.splice(index, 1);
    this.data.forEach((row, rowIndex) => {
      if ('sr_no' in row) row.sr_no = rowIndex + 1;
    });
  }
}
export type ReusableTableColumn = Record<string, any>;

interface AgActionCellAction {
  key: string;
  label?: string;
  iconClass?: string;
  btnClass?: string;
  hidden?: (row: any) => boolean;
}

interface AgActionCellParams {
  data: any;
  actions?: AgActionCellAction[];
  onAction?: (key: string, row: any) => void;
  onMainAction?: (row: any) => void;
}

const ACTION_TONE: Record<string, string> = {
  edit: 'border-sky-500/40 bg-sky-500/15 text-sky-600 dark:text-sky-300 hover:bg-sky-500/30',
  view: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/30',
  status: 'border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300 hover:bg-amber-500/30',
  add: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/30',
  delete: 'border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-300 hover:bg-rose-500/30',
  report: 'border-purple-500/40 bg-purple-500/15 text-purple-600 dark:text-purple-300 hover:bg-purple-500/30',
};
const DEFAULT_TONE = 'border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white/80 hover:bg-slate-200 dark:hover:bg-white/15';

@Component({
  selector: 'app-grid-action-cell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex h-full items-center justify-center gap-2">
      <button *ngFor="let action of visibleActions" type="button" (click)="run(action)"
        [class]="'grid h-8 w-8 place-items-center rounded-full border transition ' + (action.btnClass || tone(action.key))"
        [title]="action.label || action.key">
        <ng-container [ngSwitch]="action.key.toLowerCase()">
          <svg *ngSwitchCase="'edit'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
            <path d="M13.8 3.3l2.9 2.9-9.4 9.4-3.9 1 1-3.9 9.4-9.4z"></path>
          </svg>
          <svg *ngSwitchCase="'delete'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
            <path d="M3.5 5.5h13M7.5 5.5V4.4A1.4 1.4 0 0 1 8.9 3h2.2a1.4 1.4 0 0 1 1.4 1.4v1.1M6.5 6.5l.7 9.1A1.5 1.5 0 0 0 8.7 17h2.6a1.5 1.5 0 0 0 1.5-1.4l.7-9.1"></path>
          </svg>
          <svg *ngSwitchCase="'add'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
            <path d="M10 4v12M4 10h12"></path>
          </svg>
          <svg *ngSwitchCase="'view'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
            <path d="M1.7 10s3.2-5 8.3-5 8.3 5 8.3 5-3.2 5-8.3 5-8.3-5-8.3-5z"></path>
            <circle cx="10" cy="10" r="2.2"></circle>
          </svg>
          <svg *ngSwitchCase="'status'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
            <circle cx="10" cy="10" r="7"></circle>
            <path d="M10 9v4M10 6.5h.01"></path>
          </svg>
          <svg *ngSwitchCase="'report'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
            <path d="M5 2h7l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"></path>
            <path d="M12 2v4h4M7 9h6M7 12h6M7 15h4"></path>
          </svg>
          <i *ngSwitchDefault [class]="(action.iconClass || 'fa-solid fa-circle') + ' text-xs'" aria-hidden="true"></i>
        </ng-container>
      </button>
    </div>
  `,
})
export class AgActionCellComponent implements ICellRendererAngularComp {
  params!: any;

  agInit(params: any): void {
    this.params = params;
  }
  refresh(): boolean {
    return false;
  }

  get visibleActions(): AgActionCellAction[] {
    if (this.params?.actions) {
      return (this.params.actions || []).filter(
        (action: any) => !action.hidden?.(this.params.data),
      );
    }
    const actions: AgActionCellAction[] = [];
    const p = this.params || {};
    const data = p.data;

    if (p.editCallback && (p.showEdit === undefined || p.showEdit === true || (typeof p.showEdit === 'function' && p.showEdit(data)))) {
      actions.push({ key: 'edit', label: 'Edit' });
    }
    if (p.viewCallback && (p.showView === undefined || p.showView === true || (typeof p.showView === 'function' && p.showView(data)))) {
      actions.push({ key: 'view', label: 'View Details' });
    }
    if (p.deleteCallback && (p.showDelete === undefined || p.showDelete === true || (typeof p.showDelete === 'function' && p.showDelete(data)))) {
      actions.push({ key: 'delete', label: 'Delete' });
    }
    return actions;
  }

  tone(key: string): string {
    return ACTION_TONE[key] || DEFAULT_TONE;
  }

  run(action: AgActionCellAction): void {
    const p = this.params || {};
    const data = p.data;
    if (p.onAction) {
      p.onAction(action.key, data);
    } else if (action.key === 'edit' && p.editCallback) {
      p.editCallback(data);
    } else if (action.key === 'view' && p.viewCallback) {
      p.viewCallback(data);
    } else if (action.key === 'delete' && p.deleteCallback) {
      p.deleteCallback(data);
    }
  }
}

@Component({
  selector: 'app-ag-select-cell',
  standalone: true,
  imports: [CommonModule],
  template: `<span>{{ params?.value }}</span>`,
})
export class AgSelectCellComponent implements ICellRendererAngularComp {
  params: any;
  agInit(params: any): void { this.params = params; }
  refresh(params: any): boolean { this.params = params; return true; }
}

@Component({
  selector: 'app-add-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  template: `<div><ng-content></ng-content></div>`,
})
export class AddFormComponent {
  @Input() form: any;
  @Input() config: any;
  @Input() formData: any;
}

@Component({
  selector: 'app-transaction-table-tabs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="mb-4 flex border-b border-gray-200 gap-1">
      <button *ngFor="let tab of tabs" type="button" (click)="selectTab(tab.value)"
        [class]="'px-4 py-2.5 text-sm font-semibold transition-all border-b-2 rounded-t-lg ' + (activeTab === tab.value ? 'border-sky-500 text-sky-600 bg-sky-50/70 font-bold' : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/60')">
        {{ tab.label }}
      </button>
    </div>
  `,
})
export class TransactionTableTabs {
  @Input() activeTab = 'draft';
  @Input() tabs: { label: string; value: string }[] = [];
  @Output() activeTabChange = new EventEmitter<string>();
  @Output() tabChange = new EventEmitter<string>();

  selectTab(val: string): void {
    this.activeTabChange.emit(val);
    this.tabChange.emit(val);
  }
}

@Component({
  selector: 'app-reusable-delete-dialog-dynamic-content',
  standalone: true,
  imports: [CommonModule, ReusableDeleteDialogComponent],
  template: `<app-reusable-delete-dialog [open]="open" [message]="message" (confirm)="confirm.emit()" (cancel)="cancel.emit()"></app-reusable-delete-dialog>`,
})
export class ReusableDeleteDialogDynamicContentComponent {
  @Input() open = false; @Input() message = '';
  @Output() confirm = new EventEmitter<void>(); @Output() cancel = new EventEmitter<void>();
}

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: ``,
})
export class ToastComponent {}

@Component({
  selector: 'app-shell-expension-ga-dialog-view',
  standalone: true,
  imports: [CommonModule],
  template: ``,
})
export class ShellExpensionGaDrawingDialogViewer {
  @Input() open = false;
  @Input() data: any;
  @Output() close = new EventEmitter<void>();
}

@Component({
  selector: 'app-reusable-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button [type]="type" [disabled]="loading || disabled" (click)="clicked.emit($event)"
      [class]="'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ' + customClass">
      <i *ngIf="loading" class="fa-solid fa-circle-notch animate-spin text-sm" aria-hidden="true"></i>
      <span>{{ label }}</span>
    </button>
  `,
})
export class ReusableButtonComponent {
  @Input() label = '';
  @Input() variant = 'primary';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() loading = false;
  @Input() disabled = false;
  @Input() icon: any;
  @Input() customClass = 'border border-white/20 bg-white/10 text-white hover:bg-white/15';
  @Output() clicked = new EventEmitter<Event>();
}

export { PaginateTableComponent } from './paginate-table/paginate-table.component';

@Component({
  selector: 'app-import-export-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div *ngIf="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div class="glass-card relative w-full max-w-lg rounded-2xl border border-white/20 bg-[#0f172a]/95 p-6 text-white shadow-2xl">
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
          <h3 class="text-base font-semibold tracking-wide text-white">
            {{ config?.title || 'Import Records' }}
          </h3>
          <button type="button" class="text-white/60 hover:text-white transition text-xl font-bold px-2 py-0.5 rounded-lg hover:bg-white/10" (click)="onClose()">
            &times;
          </button>
        </div>

        <!-- Body -->
        <div class="space-y-4">
          <!-- File Download Template if available -->
          <div *ngIf="getTemplateFile()" class="p-3 rounded-xl border border-white/15 bg-white/5 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i class="fas fa-file-excel text-[#61C2FF] text-lg"></i>
              <span class="text-xs font-medium text-white/90">Sample Template File</span>
            </div>
            <a [href]="getTemplateFile()" download class="text-xs font-semibold text-[#61C2FF] hover:underline flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#61C2FF]/10 hover:bg-[#61C2FF]/20 transition">
              <i class="fas fa-download"></i> Download Template
            </a>
          </div>

          <!-- File Upload Input -->
          <div>
            <label class="block text-xs font-medium text-white/80 mb-2">Select Excel/CSV File to Upload</label>
            <div class="border-2 border-dashed border-white/20 hover:border-[#61C2FF]/50 rounded-xl p-4 text-center bg-white/5 transition">
              <input type="file" (change)="onFileChange($event)" accept=".xlsx, .xls, .csv" class="w-full text-xs text-white/80 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#1069AB] file:text-white hover:file:bg-[#195d95] cursor-pointer" />
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="mt-6 flex items-center justify-end gap-3 border-t border-white/10 pt-4">
          <button type="button" class="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-medium text-white hover:bg-white/15 transition" (click)="onClose()">
            Cancel
          </button>
          <button type="button" [disabled]="loading || !selectedFile" class="rounded-xl bg-[#1069AB] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#195d95] disabled:opacity-50 transition flex items-center gap-2" (click)="onUpload()">
            <span *ngIf="loading" class="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></span>
            <span>{{ loading ? 'Uploading...' : 'Import Data' }}</span>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ImportExportDialogComponent {
  @Input() open = false;
  @Input() loading = false;
  @Input() config: any;
  @Output() import = new EventEmitter<FormData>();
  @Output() close = new EventEmitter<void>();

  selectedFile: File | null = null;

  getTemplateFile(): string | null {
    if (!this.config?.workflow) return null;
    for (const item of this.config.workflow) {
      if (item.type === 'download' && item.file) return item.file;
      if (item.files) {
        const firstKey = Object.keys(item.files)[0];
        if (firstKey && item.files[firstKey]?.file) return item.files[firstKey].file;
      }
    }
    return null;
  }

  onFileChange(event: any) {
    const file = event.target.files?.[0];
    if (file) {
      this.selectedFile = file;
    }
  }

  onClose() {
    this.selectedFile = null;
    this.close.emit();
  }

  onUpload() {
    if (!this.selectedFile) return;
    const formData = new FormData();
    formData.append('file', this.selectedFile);
    if (this.config?.formName) {
      formData.append('form_name', this.config.formName);
    }
    this.import.emit(formData);
  }
}

export function formatDate(val: any): string {
  if (!val) return '-';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(val);
  }
}

export function formatPeriod(val: any): string {
  if (!val) return '-';
  if (typeof val === 'string') return val.toUpperCase();
  return String(val);
}

