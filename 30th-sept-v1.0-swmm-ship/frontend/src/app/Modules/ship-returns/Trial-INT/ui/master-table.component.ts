import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

@Component({
  selector: 'app-paginate-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="relative overflow-hidden rounded-xl border border-white/15 bg-white/[0.04] text-white shadow-xl">
      <div *ngIf="showHeaderSection" class="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 bg-white/[0.05] p-2.5 lg:flex-nowrap">
        <div *ngIf="!showSearch && (title || description)" class="min-w-[150px] shrink-0 lg:w-[210px]">
          <h2 class="text-base font-bold uppercase tracking-wide">{{ title }}</h2>
          <p *ngIf="description" class="mt-0.5 text-xs text-white/55">{{ description }}</p>
        </div>

        <label *ngIf="showSearch" class="relative min-w-0 basis-full sm:min-w-[280px] sm:max-w-[620px] sm:flex-1 lg:basis-auto">
          <i class="fas fa-search pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-white/45" aria-hidden="true"></i>
          <input
            [(ngModel)]="search"
            (ngModelChange)="currentPage = 1"
            class="h-11 w-full rounded-xl border border-white/20 bg-white/[0.08] pl-11 pr-4 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#61C2FF]"
            placeholder="Enter at least 3 characters"
          />
        </label>

        <div class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2.5">
          <button type="button" (click)="showColumnFilters = !showColumnFilters" class="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-white/15">
            <i class="fas fa-sliders-h" aria-hidden="true"></i>
            <span>Show Filters</span>
          </button>
          <button
            *ngFor="let button of visibleAddButtons"
            type="button"
            (click)="addButtonClick.emit({ key: button.key })"
            class="inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-xl border border-[#4f8fd5] bg-[#1069AB] px-5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-[#195d95] active:translate-y-px"
          >
            {{ button.label }}
          </button>
        </div>
      </div>

      <div class="relative">
      <div class="max-h-[62vh] overflow-auto pr-10">
        <table class="w-full min-w-[900px] border-collapse text-xs">
          <thead class="sticky top-0 z-10 bg-[#1c3548]">
            <tr>
              <th *ngIf="!hasSerialColumn" class="w-16 border border-white/15 px-3 py-3 text-left font-semibold text-white/80">Ser</th>
              <th *ngFor="let column of visibleColumns" [style.min-width.px]="column.minWidth || 130"
                [class.sticky]="column.pinned === 'right'" [class.right-10]="column.pinned === 'right'"
                [class.z-20]="column.pinned === 'right'"
                class="min-w-[130px] border border-white/15 bg-[#1c3548] px-4 py-3 text-left font-semibold text-white/80">
                <div class="flex items-center justify-between gap-2"><span>{{ column.headerName || column.field }}</span><span class="text-white/45">☰ ⋮</span></div>
              </th>
            </tr>
            <tr *ngIf="showColumnFilters">
              <th *ngIf="!hasSerialColumn" class="border border-white/10 p-1"></th>
              <th *ngFor="let column of visibleColumns" class="border border-white/10 p-1">
                <input [(ngModel)]="columnFilters[column.field]" (ngModelChange)="currentPage = 1" class="w-full rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-white outline-none focus:border-[#61C2FF]" placeholder="Filter" />
              </th>
            </tr>
          </thead>

          <tbody>
            <tr *ngFor="let row of pagedRows; let rowIndex = index" class="bg-white/[0.025] transition hover:bg-sky-400/10">
              <td *ngIf="!hasSerialColumn" class="border border-white/10 px-4 py-3 text-white/75">{{ (currentPage - 1) * pageSize + rowIndex + 1 }}</td>
              <td *ngFor="let column of visibleColumns" [class.sticky]="column.pinned === 'right'"
                [class.right-10]="column.pinned === 'right'" [class.bg-[#20384a]]="column.pinned === 'right'"
                class="h-[58px] border border-white/10 px-4 py-3 align-middle text-white/85">
                <div *ngIf="column.field === 'actions'; else valueCell" class="flex items-center gap-2">
                  <button type="button" (click)="runAction(column, 'edit', row)" class="grid h-8 w-8 place-items-center rounded-full border border-sky-400/30 bg-sky-500/10 text-sky-300 transition hover:bg-sky-500/20" title="Edit">
                    <i class="fa-solid fa-pen text-xs" aria-hidden="true"></i>
                  </button>
                  <button type="button" (click)="runAction(column, 'delete', row)" class="grid h-8 w-8 place-items-center rounded-full border border-rose-400/30 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20" title="Delete">
                    <i class="fa-solid fa-trash text-xs" aria-hidden="true"></i>
                  </button>
                </div>
                <ng-template #valueCell>{{ displayValue(row, column) }}</ng-template>
              </td>
            </tr>
            <tr *ngIf="tableLoading"><td [attr.colspan]="visibleColumns.length + (hasSerialColumn ? 0 : 1)" class="p-8 text-center text-white/60">Loading...</td></tr>
            <tr *ngIf="!tableLoading && !filteredRows.length"><td [attr.colspan]="visibleColumns.length + (hasSerialColumn ? 0 : 1)" class="p-8 text-center text-white/60">No records found</td></tr>
          </tbody>
        </table>
      </div>

      <button type="button" (click)="showColumnChooser = !showColumnChooser"
        class="absolute inset-y-0 right-0 z-30 flex w-10 flex-col items-center border-l border-white/15 bg-white/[0.06] pt-4 text-white/80 hover:bg-white/10"
        title="Choose columns">
        <i class="fas fa-table-columns text-sm" aria-hidden="true"></i>
        <span class="mt-2 [writing-mode:vertical-rl] text-xs tracking-wide">Columns</span>
      </button>

      <aside *ngIf="showColumnChooser"
        class="absolute right-10 top-0 z-40 max-h-full w-64 overflow-y-auto rounded-bl-xl border border-white/15 bg-[#172d3d] p-3 shadow-2xl">
        <div class="mb-3 flex items-center justify-between">
          <strong class="text-xs uppercase tracking-wider text-white/70">Columns</strong>
          <button type="button" (click)="showColumnChooser = false" class="text-lg text-white/60 hover:text-white">×</button>
        </div>
        <label *ngFor="let column of configurableColumns" class="flex cursor-pointer items-center gap-2 border-t border-white/10 py-2 text-xs text-white/85">
          <input type="checkbox" [checked]="!hiddenColumns.has(column)" (change)="toggleColumn(column)" class="accent-[#61C2FF]" />
          <span>{{ column.headerName || column.field }}</span>
        </label>
      </aside>
      </div>

      <footer *ngIf="showPagination" class="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 px-4 py-3 text-xs text-white/65">
        <span>Showing {{ rangeStart }} to {{ rangeEnd }} of {{ filteredRows.length }} records</span>
        <div class="flex items-center gap-1.5">
          <button type="button" (click)="goToPage(currentPage - 1)" [disabled]="currentPage === 1" class="min-w-9 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35">Prev</button>
          <button *ngFor="let page of visiblePages" type="button" (click)="goToPage(page)" class="h-8 min-w-8 rounded-lg border px-2 font-semibold transition" [ngClass]="page === currentPage ? 'border-[#61C2FF] bg-[rgba(97,194,255,0.15)] text-white' : 'border-white/20 bg-white/10 text-white hover:bg-white/15'">{{ page }}</button>
          <button type="button" (click)="goToPage(currentPage + 1)" [disabled]="currentPage === totalPages" class="min-w-9 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35">Next</button>
        </div>
      </footer>
    </section>
  `,
})
export class PaginateTableComponent implements OnInit {
  @Input() showHeaderSection = true;
  @Input() title = '';
  @Input() description = '';
  @Input() showSearch = false;
  @Input() rowData: any[] = [];
  @Input() url: any;
  @Input() columnDefs: any[] = [];
  @Input() showPagination = true;
  @Input() tableLoading = false;
  @Input() addButtons: { label: string; key: string }[] = [];
  @Output() addButtonClick = new EventEmitter<any>();

  search = '';
  showColumnFilters = false;
  showColumnChooser = false;
  hiddenColumns = new Set<any>();
  columnFilters: Record<string, string> = {};
  currentPage = 1;
  readonly pageSize = 10;
  private readonly api = inject(ApiService);

  ngOnInit(): void { this.loadData(); }

  get configurableColumns(): any[] { return (this.columnDefs || []).filter(column => !column.hide); }
  get visibleColumns(): any[] { return this.configurableColumns.filter(column => !this.hiddenColumns.has(column)); }
  get hasSerialColumn(): boolean {
    return this.visibleColumns.some(column => /^(ser|sr\.?|#)$/i.test(String(column.headerName || '').trim()));
  }
  get visibleAddButtons(): { label: string; key: string }[] { return this.addButtons.filter(button => (button as any).show !== false); }

  get filteredRows(): any[] {
    const search = this.search.trim().toLowerCase();
    return (this.rowData || []).filter(row => {
      if (search && !JSON.stringify(row).toLowerCase().includes(search)) return false;
      return this.visibleColumns.every(column => {
        const filter = (this.columnFilters[column.field] || '').trim().toLowerCase();
        return !filter || String(row?.[column.field] ?? '').toLowerCase().includes(filter);
      });
    });
  }

  get totalPages(): number { return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize)); }
  get pagedRows(): any[] { const start = (this.currentPage - 1) * this.pageSize; return this.filteredRows.slice(start, start + this.pageSize); }
  get rangeStart(): number { return this.filteredRows.length ? (this.currentPage - 1) * this.pageSize + 1 : 0; }
  get rangeEnd(): number { return Math.min(this.currentPage * this.pageSize, this.filteredRows.length); }
  get visiblePages(): number[] { const start = Math.max(1, Math.min(this.currentPage - 2, this.totalPages - 4)); return Array.from({ length: Math.min(5, this.totalPages) }, (_, index) => start + index); }

  displayValue(row: any, column: any): unknown {
    const value = typeof column.valueGetter === 'function'
      ? column.valueGetter({ data: row, node: { rowIndex: this.rowData.indexOf(row) }, rowIndex: this.rowData.indexOf(row) })
      : this.readNestedValue(row, column.field);
    return typeof column.valueFormatter === 'function' ? column.valueFormatter({ value, data: row }) : value ?? '';
  }

  private readNestedValue(row: any, field: string): unknown {
    if (!field) return '';
    return String(field).split('.').reduce((value: any, key: string) => value?.[key], row);
  }

  runAction(column: any, key: string, row: any): void { column?.cellRendererParams?.onAction?.(key, row); }
  toggleColumn(column: any): void {
    this.hiddenColumns.has(column) ? this.hiddenColumns.delete(column) : this.hiddenColumns.add(column);
  }
  goToPage(page: number): void { this.currentPage = Math.min(Math.max(1, page), this.totalPages); }
  refreshTable(): void { this.rowData = []; this.currentPage = 1; this.loadData(); }

  loadData(): void {
    if (!this.url || this.rowData?.length) return;
    this.tableLoading = true;
    this.api.get<any>(String(this.url)).subscribe({
      next: response => {
        this.rowData = Array.isArray(response) ? response : response?.results ?? response?.data ?? [];
        this.tableLoading = false;
      },
      error: () => { this.tableLoading = false; },
    });
  }
}
