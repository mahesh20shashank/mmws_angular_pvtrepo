import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { TransactionTableTabs, ToastComponent, AgActionCellComponent } from '../../../ui/master-compat';
import { PaginateTableComponent } from '../../../ui/paginate-table/paginate-table.component';
import { ApiService } from '../../../api.service';
import { ToastService } from '../../../services/toast.service';
import { ActivatedRoute, Router } from '@angular/router';
import { SHIP_REPORT_TRANSACTION_VIEW_CONFIG } from './ship-module-reports-transaction-table-data';

@Component({
  selector: 'app-ship-module-reports-transaction-table-view',
  templateUrl: './ship-module-reports-transaction-table-view.component.html',
  imports: [
    PaginateTableComponent,
    TransactionTableTabs,
    ToastComponent,
  ],
  providers: [ApiService],
  standalone: true,
})
export class ShipModuleReportsTransactionTableView implements OnInit {
  // ------------------- CONFIG -------------------
  config = SHIP_REPORT_TRANSACTION_VIEW_CONFIG;

  // ------------------- TABLE STATE -------------------
  page = 1;
  totalPages = 0;
  totalCount = 0;

  isLoading = false;
  isDeleteLoading = false;

  rowData: any[] = [];
  columnDefs: any[] = [];

  addButtons: any[] = [];

  get currentTableUrl(): string {
    if (!this.config?.apiEndpoint) return '';
    return `${this.config.apiEndpoint}?draft_status=${this.currentTab}`;
  }


  // ------------------- TABS -------------------
  currentTab = 'draft';

  tabList = [
    { label: 'Draft', value: 'draft' },
    { label: 'Work-in-Progress', value: 'save' },
    { label: 'Approved', value: 'approved' },
  ];
  // ------------------- CONSTRUCTOR -------------------
  constructor(
    private apiService: ApiService,
    private toastService: ToastService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    // private tabStateService: TabStateService
  ) {}

  // ------------------- INIT -------------------
  ngOnInit(): void {
    this.setConfigFromRoute();

    // this.tabStateService.setActiveTab(this.currentTab);

    this.fetchData();
  }

  // ------------------- CONFIG SETTER -------------------
  setConfigFromRoute() {
    const key = this.route.snapshot.data['key'];

    this.config = SHIP_REPORT_TRANSACTION_VIEW_CONFIG[key];

    if (!this.config) {
      console.error('❌ No config found for route:', key);
      return;
    }

    // ✅ Set columns from config
    this.columnDefs = [
      {
        headerName: '#',
        valueGetter: (params: any) => (params.node?.rowIndex ?? 0) + 1,
        minWidth: 50,
        maxWidth: 70,
        filter: false,
      },
      ...(this.config.columns || []),

      {
        headerName: 'Status',
        field: 'active',
        minWidth: 100,
        cellRenderer: (params: any) => {
          const isActive = params.value === 1 || params.value === true || params.data?.status === 'active';
          return `<span class="status-badge ${
            isActive ? 'status-active' : 'status-inactive'
          }">${isActive ? 'Active' : 'Draft'}</span>`;
        },
      },
      {
        headerName: 'Actions',
        width: 140,
        minWidth: 140,
        field: 'id',
        pinned: 'right',
        cellRenderer: (params: any) => {
          return `
            <div style="display:flex;align-items:center;justify-content:center;height:100%;">
              <button class="view-report-btn inline-flex items-center px-3 py-1.5 bg-[#1069AB] hover:bg-[#195d95] text-white text-xs font-semibold rounded-lg shadow-sm transition" data-id="${params?.data?.id}">
                View Report
              </button>
            </div>
          `;
        },
        onCellClicked: (params: any) => {
          if ((params.event.target as HTMLElement).classList.contains('view-report-btn')) {
            this.handleView(params.data);
          }
        }
      }
    ];
  }

  // ------------------- FETCH DATA -------------------
  fetchData() {
    if (!this.config?.apiEndpoint) {
      console.warn('⚠️ No apiEndpoint configured for current route!');
      return;
    }

    const endpoint = `${this.config.apiEndpoint}?draft_status=${this.currentTab}&page=${this.page}`;
    console.log('🌐 Fetching transaction data from:', endpoint);

    this.isLoading = true;
    this.rowData = [];

    this.apiService.get(endpoint).subscribe({
      next: (res: any) => {
        console.log('📦 API Data received:', res);
        this.rowData = res?.results || res?.data || (Array.isArray(res) ? res : []);
        this.totalCount = typeof res?.count === 'number' ? res.count : this.rowData.length;
        this.totalPages = Math.max(1, Math.ceil(this.totalCount / 10));
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('❌ API Error:', err);
        this.isLoading = false;
        this.rowData = [];
        this.cdr.detectChanges();
      },
      complete: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  // ------------------- PAGINATION -------------------
  onPageChange(event: { page: number }) {
    if (this.page === event.page) return;

    this.page = event.page;
    this.fetchData();
  }

  onTabChange(tab: string) {
    this.currentTab = tab || 'draft';
    // this.tabStateService.setActiveTab(this.currentTab);
    this.page = 1;
    this.fetchData();
  }


  handleAdd() {
    const currentUrl = this.router.url.split('?')[0].replace(/\/$/, '');
    this.router.navigate([`${currentUrl}-add`]);
  }

  handleView(row: any) {
    if (!row?.id || !this.config) return;
    const currentUrl = this.router.url.replace(/\/$/, '');
    this.router.navigate([`${currentUrl}/${row.id}/view-details`]);
  }

  handleDownload(row: any) {
    // Implementation for download functionality
  }
}
