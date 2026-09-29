import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import {
  ReusableDeleteDialogComponent,
  PaginateTableComponent,
  TransactionTableTabs,
  ToastComponent,
  AgActionCellComponent,
} from '../../../ui/master-compat';
import { ImportExportDialogComponent } from '../import-export-dialog/import-export-dialog.component';
import { SHIP_TRANSACTION_VIEW_CONFIG } from './ship-transaction-table-data';
import { ApiService } from '../../../api.service';
import { ToastService } from '../../../services/toast.service';
import { ActivatedRoute, Router } from '@angular/router';
import { TabStateService } from '../../../services/tab-state.service';
import { Apiendpoints } from '../../../ApiEndPoints';

@Component({
  selector: 'app-ship-transaction-table-view',
  templateUrl: './ship-module-transaction-table-view.component.html',
  imports: [
    ReusableDeleteDialogComponent,
    PaginateTableComponent,
    TransactionTableTabs,
    ToastComponent,
    ImportExportDialogComponent,
  ],
  standalone: true,
})
export class ShipModuleTransactionTableView implements OnInit {
  // ------------------- CONFIG -------------------
  config = SHIP_TRANSACTION_VIEW_CONFIG;
  importConfig: any = null;

  // ------------------- TABLE STATE -------------------
  page = 1;
  totalPages = 0;
  totalCount = 0;

  isLoading = false;
  isDeleteLoading = false;

  rowData: any[] = [];
  columnDefs: any[] = [];
  addButtons = [
    { label: '+ Add New Record', key: 'add', show: true, cls: 'bg-[#1069AB] text-white font-semibold' },
  ];

  // ------------------- DELETE -------------------
  isDeleteDialogOpen = false;
  deleteRow: any = null;

  // ------------------- TABS -------------------
  currentTab = 'draft';

  tabList = [
    { label: 'Draft', value: 'draft' },
    { label: 'Work-in-Progress', value: 'save' },
    { label: 'Approved', value: 'approved' },
  ];
  loading = false;
  showImportDialog = false;

  // ------------------- CONSTRUCTOR -------------------
  constructor(
    private apiService: ApiService,
    private toastService: ToastService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private tabStateService: TabStateService,
  ) {}

  // ------------------- INIT -------------------
  ngOnInit(): void {
    this.setConfigFromRoute();
    this.fetchData();
  }

  // ------------------- CONFIG SETTER -------------------
  setConfigFromRoute() {
    const key = this.route.snapshot.data['key'];

    this.config = SHIP_TRANSACTION_VIEW_CONFIG[key];

    if (!this.config) {
      console.error('❌ No config found for route:', key);
      return;
    }

    this.importConfig =
      this.config?.importExport?.import ||
      this.config?.import ||
      null;

    // ✅ Set columns from config
    this.columnDefs = [
      ...(this.config.columns || []),

      {
        headerName: 'Status',
        field: 'active',
        cellRenderer: (params: any) => {
          const isActive = params.value === 1;
          return `<span class="status-badge ${
            isActive ? 'status-active' : 'status-inactive'
          }">${isActive ? 'Active' : 'Inactive'}</span>`;
        },
      },
      {
        headerName: 'Actions',
        cellRenderer: AgActionCellComponent,
        sortable: false,
        filter: false,
        cellRendererParams: {
          showEdit: (row: any) =>
            this.tabStateService.getActiveTab() !== 'approved' &&
            row?.workflow?.rights?.can_edit === true,

          editCallback: (row: any) => this.handleEdit(row),
          showDelete: (row: any) => this.canDeleteRow(row),
          deleteCallback: (row: any) => this.openDeleteDialog(row),
          viewCallback: (row: any) => this.handleView(row),
        },
      },
    ];
  }

  // ------------------- TAB CHANGE -------------------
  onTabChange(tab: string) {
    this.currentTab = tab;
    console.log('inside the tab changes in ship transaction');
    this.tabStateService.setActiveTab(tab);
    this.setConfigFromRoute();
    this.page = 1;
    this.fetchData();
  }

  openImportDialog() {
    this.importConfig =
      this.config?.importExport?.import ||
      this.config?.import ||
      {
        enabled: true,
        title: `Import ${this.config?.title || 'Record'}`,
        formName: this.config?.formName || 'general_import',
        workflow: [
          { type: 'ship', key: 'ship', label: 'Select Ship' },
          { type: 'upload' },
        ],
      };
    this.showImportDialog = true;
    this.cdr.detectChanges();
  }

  // -------------------------------------------------------- UPLOAD EXCEL --------------------------------------
  uploadExcel(formData: FormData): void {
    this.loading = true;

    const uploadApi = this.importConfig?.uploadApi || Apiendpoints.FORM_IMPORTS;

    this.apiService.post(uploadApi, formData).subscribe({
      next: (res: any) => {
        this.toastService.showSuccess(
          res?.message ?? 'Records imported successfully.',
        );

        this.showImportDialog = false;
        this.fetchData();
      },

      error: (err: any) => {
        this.loading = false;
        this.toastService.showError(err?.error?.message ?? 'Import failed.');
      },

      complete: () => {
        this.loading = false;
      },
    });
  }

  // ------------------- FETCH DATA -------------------
  fetchData() {
    if (!this.config) return;

    this.isLoading = true;

    this.rowData = [];
    this.totalCount = 0;
    this.totalPages = 0;

    this.apiService
      .get(
        `${this.config.apiEndpoint}?draft_status=${this.currentTab}&page=${this.page}`,
      )
      .subscribe({
        next: (res: any) => {
          this.rowData = res?.results || [];
          this.totalCount = res?.count || 0;
          this.totalPages = Math.ceil(this.totalCount / 10);
          this.cdr.detectChanges();
        },
        error: () => {
          this.isLoading = false;
          this.toastService.showError('Failed to fetch data');
        },
        complete: () => {
          this.isLoading = false;
        },
      });
  }

  // ------------------- PAGINATION -------------------
  onPageChange(event: { page: number }) {
    if (this.page === event.page) return;

    this.page = event.page;
    this.fetchData();
  }

  handleAddNewRecord() {
    const currentUrl = this.router.url.split('?')[0].replace(/\/$/, '');
    this.router.navigate([`${currentUrl}-add`]);
  }

  private getLoggedInUserId(): number | null {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const id = user?.user_id ?? user?.id ?? user?.pk;
      return id != null && id !== '' ? Number(id) : null;
    } catch {
      return null;
    }
  }

  canDeleteRow(row: any): boolean {
    const loggedInId = this.getLoggedInUserId();
    if (loggedInId == null) {
      return false;
    }
    const is_superuser =
      JSON.parse(localStorage.getItem('user') || '{}')?.is_admin ?? false;
    return String(row?.created_by_id) === String(loggedInId) || is_superuser;
  }

  handleEdit(row: any) {
    const currentUrl = this.router.url.split('?')[0].replace(/\/$/, '');
    this.router.navigate([`${currentUrl}/${row.id}/edit`]);
  }

  handleView(row: any) {
    const currentUrl = this.router.url.split('?')[0].replace(/\/$/, '');
    this.router.navigate([`${currentUrl}/${row.id}/view-details`]);
  }

  // ------------------- DELETE -------------------
  openDeleteDialog(row: any) {
    this.deleteRow = row;
    this.isDeleteDialogOpen = true;
  }

  confirmDelete() {
    if (!this.deleteRow) return;

    this.isDeleteLoading = true;

    const payload = {
      id: this.deleteRow.id,
      delete: true,
    };

    this.apiService.post(this.config.apiEndpoint, payload).subscribe({
      next: (res: any) => {
        this.toastService.showSuccess(res?.message || 'Successfully deleted');
        this.closeDeleteDialog();
        this.fetchData();
      },
      error: () => {
        this.isDeleteLoading = false;
        this.toastService.showError('Delete failed');
      },
      complete: () => {
        this.isDeleteLoading = false;
      },
    });
  }

  closeDeleteDialog() {
    this.isDeleteDialogOpen = false;
    this.deleteRow = null;
  }
}
