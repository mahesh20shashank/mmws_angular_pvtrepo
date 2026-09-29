import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { AgGridAngular } from 'ag-grid-angular';

import { ColDef, GridApi } from 'ag-grid-community';
import { ApiService } from '../../api.service';
import { FormsModule } from '@angular/forms';

type GridOptions = Record<string, unknown>;

@Component({
  selector: 'app-paginate-table',
  standalone: true,
  imports: [
    CommonModule,
    AgGridAngular,
    FormsModule,
  ],

  templateUrl: './paginate-table.component.html',
  styleUrls: ['./paginate-table.component.css'],
})
export class PaginateTableComponent implements OnInit, OnChanges, OnDestroy {
  private gridApi!: GridApi;

  searchText = '';
  searchPending = false;

  private readonly searchSubject = new Subject<string>();
  private readonly subscription = new Subscription();
  private static readonly SEARCH_DEBOUNCE_MS = 600;
  private static readonly MIN_SEARCH_LENGTH = 3;
  private lastFetchedUrl = '';

  @Input() showMultiSelect = false;
  /* Header */
  @Input() showHeaderSection = true;
  @Input() title?: string;
  @Input() description?: string;
  @Input() url?: any;

  /* Search */
  @Input() showSearch = false;
  @Input() showFilterButton = true;
  @Input() searchValue = '';
  @Input() searchPlaceholder = 'Enter at least 3 characters';
  floatingFiltersEnabled = false;

  /* CSV */
  @Input() showImport = false;
  @Input() showExport = false;
  @Output() handleImport = new EventEmitter<void>();
  @Output() handleExport = new EventEmitter<void>();
  @Output() exportPdf = new EventEmitter<void>();
  @Output() exportExcel = new EventEmitter<void>();
  @Output() exportPrint = new EventEmitter<void>();
  importLabel = 'Import';
  exportLabel = 'Export';

  // SELECT DROP-DOWN
  @Input() showSelectDropdown = false;
  @Input() selectOptions: { label: string; value: any }[] = [];
  @Input() selectedValue: any;
  @Output() selectChange = new EventEmitter<any>();

  onSelectChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    console.log('Selected value: in paginate', value);
    console.log('selectOptions', this.selectOptions);
    this.selectChange.emit(value);
  }

  @Input() tableLoading = false;

  /* Buttons */
  @Input() showAddButton = false;
  @Input() addButtonText = 'Add';
  @Input() showPagination = true;
  @Input() addButtons: { label: string; key: string; show?: boolean; cls?: string }[] = [];
  @Output() addButtonClick = new EventEmitter<any>();

  /* Grid */
  @Input() rowData: any[] = [];
  @Input() columnDefs: ColDef[] = [];
  @Input() defaultSortField = '';
  @Input() defaultSortDirection: 'asc' | 'desc' = 'asc';

  // In your PaginateTableComponent, update the defaultColDef:

  defaultColDef: ColDef = {
  flex: 1,
  sortable: true,
  filter: true,
  resizable: true,
  minWidth: 120,
  suppressHeaderMenuButton: false,
  floatingFilter: false,
  wrapHeaderText: true,
  cellStyle: {
    display: 'flex',
    alignItems: 'center',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    lineHeight: '1.4',
    padding: '8px 12px',
  },
  autoHeight: true,
  wrapText: true,
};

  popupParent: HTMLElement | null = null;
  @Input() currentPage = 1;
  @Input() currentPageSize = 10;
  @Input() totalCount = 0;
  @Input() totalPages = 1;
  @Output() pageChange = new EventEmitter<{ page: number }>();
  nextPageUrl: string | null = null;
  previousPageUrl: string | null = null;
  private autosizeNormalizeTimer: ReturnType<typeof setTimeout> | null = null;

  private nonce = (window as any).__CSP_NONCE__ as string | undefined;

  gridOptions!: GridOptions;
    private readonly apiService = inject(ApiService);
    private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.initSearchStream();

    // Only fetch from URL if no rowData was passed in from parent
    if (this.rowData?.length === 0 && this.url) {
      this.loadData();
    } else {
      this.updateLocalPaginationState();
    }

    this.gridOptions = {
      headerHeight: 48,
      floatingFiltersHeight: 42,
      rowHeight: 48,
      rowData: this.rowData ?? [],
      suppressHorizontalScroll: false,
      animateRows: true,
      ...(this.nonce ? { styleNonce: this.nonce } : {}),
      rowMultiSelectWithClick: this.showMultiSelect,
    };
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.searchSubject.complete();
  }

  private initSearchStream(): void {
    const sub = this.searchSubject
      .pipe(
        debounceTime(PaginateTableComponent.SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
      )
      .subscribe(() => {
        this.searchPending = false;
        this.executeSearch();
      });

    this.subscription.add(sub);
  }

  private normalizeSearchTerm(value: string = this.searchText): string {
    return (value || '').trim();
  }

  private isSearchTermAllowed(term: string): boolean {
    return term.length === 0 || term.length >= PaginateTableComponent.MIN_SEARCH_LENGTH;
  }

  private getEffectiveSearchTerm(): string {
    const term = this.normalizeSearchTerm();
    return term.length >= PaginateTableComponent.MIN_SEARCH_LENGTH ? term : '';
  }

  private executeSearch(): void {
    this.currentPage = 1;
    this.loadData();
  }

  onSearchTextChange(): void {
    if (!this.showSearch || !String(this.url || '').trim()) {
      return;
    }

    const term = this.normalizeSearchTerm();

    if (!this.isSearchTermAllowed(term)) {
      this.searchPending = false;
      this.cdr.markForCheck();
      return;
    }

    this.searchPending = true;
    this.cdr.markForCheck();
    this.searchSubject.next(term);
  }

  toggleFilters(): void {
    this.floatingFiltersEnabled = !this.floatingFiltersEnabled;
    this.defaultColDef = {
      ...this.defaultColDef,
      floatingFilter: this.floatingFiltersEnabled,
    };

    if (this.gridApi) {
      this.gridApi.setGridOption('defaultColDef', this.defaultColDef);
      (this.gridApi as any)['refreshHeader']?.();
    }
    this.cdr.markForCheck();
  }

  onExportAction(type: 'pdf' | 'excel' | 'print'): void {
    if (type === 'pdf') {
      this.exportPdf.emit();
      this.handleExport.emit();
      return;
    }
    if (type === 'excel') {
      this.exportExcel.emit();
      this.handleExport.emit();
      return;
    }
    this.exportPrint.emit();
    this.handleExport.emit();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['url'] && !changes['url'].firstChange) {
      const newUrl = String(changes['url'].currentValue || '').trim();
      if (newUrl) {
        this.currentPage = 1;
        this.lastFetchedUrl = '';
        this.loadData(true);
      }
    }

    if (changes['rowData']) {
      const incoming = this.applyDefaultSort(this.rowData || []);
      // gridOptions may not exist yet on first change (fires before ngOnInit)
      if (this.gridOptions) {
        this.gridOptions['rowData'] = incoming;
      }

      if (this.gridApi) {
        this.gridApi.setGridOption('rowData', incoming);
      }

      if (!this.url) {
        this.updateLocalPaginationState();
      }
    }
  }

  onGridReady(params: { api: GridApi }): void {
    this.gridApi = params.api;

    this.gridApi.setGridOption('rowData', this.rowData || []);
  }

  onSearch(): void {
    if (!this.showSearch || !String(this.url || '').trim()) {
      return;
    }

    const term = this.normalizeSearchTerm();
    if (!this.isSearchTermAllowed(term)) {
      return;
    }

    this.searchPending = false;
    this.currentPage = 1;
    this.loadData();
  }

  loadData(forceReload = false, requestedUrl?: string): void {
    // Guard: do not fetch if url is absent or empty string
    const trimmedUrl = String(this.url || '').trim();
    if (!trimmedUrl) return;

    const finalUrl = requestedUrl || this.buildPageUrl(this.currentPage);
    if (finalUrl === '') return;

    if (!forceReload && finalUrl === this.lastFetchedUrl) {
      this.searchPending = false;
      return;
    }

    this.lastFetchedUrl = finalUrl;
    this.tableLoading = true;
    this.apiService.get(finalUrl).subscribe({
      next: (res: any) => {
        const rows = Array.isArray(res?.results)
          ? res.results
          : Array.isArray(res?.data)
            ? res.data
            : Array.isArray(res)
              ? res
              : [];

         this.rowData = this.applyDefaultSort(rows);

        const responseCount = Number(res?.count);
        this.totalCount =
          Number.isFinite(responseCount) && responseCount >= 0
            ? responseCount
            : rows.length;
        this.nextPageUrl =
          typeof res?.next === 'string' ? res.next : null;
        this.previousPageUrl =
          typeof res?.previous === 'string' ? res.previous : null;
        this.totalPages = Math.max(
          1,
          Math.ceil(this.totalCount / this.currentPageSize),
        );

        if (this.gridApi) {
          this.gridApi.setGridOption('rowData', this.rowData);
          this.gridApi.refreshCells({ force: true });
        }
        this.tableLoading = false;
        this.searchPending = false;
         this.cdr.markForCheck();
      },
      error: () => {
        this.tableLoading = false;
        this.searchPending = false;
        this.rowData = [];
        this.totalCount = 0;
        this.totalPages = 1;
        this.nextPageUrl = null;
        this.previousPageUrl = null;
        this.cdr.markForCheck();
      },
    });
  }

  private applyDefaultSort(rows: any[]): any[] {
    const field = String(this.defaultSortField || '').trim();
    if (!field) {
      return [...rows];
    }

    const direction = this.defaultSortDirection === 'desc' ? -1 : 1;

    return [...rows].sort((left, right) => {
      const aRaw = this.resolveSortValue(left, field);
      const bRaw = this.resolveSortValue(right, field);

      const aNum = Number(aRaw);
      const bNum = Number(bRaw);
      const aIsNum = aRaw !== null && aRaw !== undefined && aRaw !== '' && Number.isFinite(aNum);
      const bIsNum = bRaw !== null && bRaw !== undefined && bRaw !== '' && Number.isFinite(bNum);

      if (aIsNum && bIsNum) {
        return (aNum - bNum) * direction;
      }

      const aText = String(aRaw ?? '').trim().toLowerCase();
      const bText = String(bRaw ?? '').trim().toLowerCase();

      if (!aText && !bText) return 0;
      if (!aText) return 1 * direction;
      if (!bText) return -1 * direction;

      return aText.localeCompare(bText) * direction;
    });
  }

  private resolveSortValue(row: any, field: string): any {
    if (!row || !field) return undefined;

    const aliases: Record<string, string[]> = {
      sequence: ['sequence', 'sequence_no', 'sort_order', 'sortOrder', 'order', 'order_no'],
    };

    for (const key of [field, ...(aliases[field] ?? [])]) {
      const value = row?.[key];
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }

    return undefined;
  }

  get canGoPrevious(): boolean {
    return this.currentPage > 1 || !!this.previousPageUrl;
  }

  get canGoNext(): boolean {
    return this.currentPage < this.totalPages || !!this.nextPageUrl;
  }

  get pageStartRecord(): number {
    if (this.totalCount === 0) return 0;
    return (this.currentPage - 1) * this.currentPageSize + 1;
  }

  get pageEndRecord(): number {
    if (this.totalCount === 0) return 0;
    return Math.min(
      this.currentPage * this.currentPageSize,
      this.totalCount,
    );
  }

  getPageNumbers(): number[] {
    const maxVisiblePages = 5;
    const pages: number[] = [];

    if (this.totalPages <= maxVisiblePages) {
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
      return pages;
    }

    let start = Math.max(1, this.currentPage - 2);
    const end = Math.min(this.totalPages, start + maxVisiblePages - 1);
    if (end - start + 1 < maxVisiblePages) {
      start = Math.max(1, end - maxVisiblePages + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage)
      return;
    this.currentPage = page;
    this.pageChange.emit({ page: this.currentPage });
    this.loadData();
  }

  goToPreviousPage(): void {
    if (!this.canGoPrevious) return;
    this.currentPage = Math.max(1, this.currentPage - 1);
    this.pageChange.emit({ page: this.currentPage });
    this.loadData(false, this.previousPageUrl || undefined);
  }

  goToNextPage(): void {
    if (!this.canGoNext) return;
    this.currentPage = Math.min(this.totalPages, this.currentPage + 1);
    this.pageChange.emit({ page: this.currentPage });
    this.loadData(false, this.nextPageUrl || undefined);
  }

  paginationGoToPreviousPage(): void {
    this.goToPreviousPage();
  }

  paginationGoToNextPage(): void {
    this.goToNextPage();
  }

  private buildPageUrl(page: number): string {
    const baseUrl = String(this.url || '').trim();
    const [path, query = ''] = baseUrl.split('?');
    const params = new URLSearchParams(query);
    params.set('page', String(page));

    const searchTerm = this.getEffectiveSearchTerm();
    if (searchTerm) {
      params.set('search', searchTerm);
    } else {
      params.delete('search');
    }

    const serialized = params.toString();
    return serialized ? `${path}?${serialized}` : path;
  }

  private updateLocalPaginationState(): void {
    this.totalCount = this.rowData?.length ?? 0;
    this.totalPages = Math.max(1, Math.ceil(this.totalCount / this.currentPageSize));
  }

  public refreshTable(): void {
    if (this.url) {
      this.currentPage = 1;
      this.lastFetchedUrl = '';
      this.loadData(true);
    } else if (this.gridApi) {
      this.gridApi.refreshCells({ force: true });
    }
  }

  public refreshCells(force = true): void {
    this.gridApi?.refreshCells({ force });
  }
}
