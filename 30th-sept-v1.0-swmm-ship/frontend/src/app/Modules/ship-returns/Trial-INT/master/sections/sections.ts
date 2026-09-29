import { Component, ViewChild, inject } from '@angular/core';
import { AgActionCellComponent, ReusableDeleteDialogComponent } from '../../ui/master-compat';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
import { ApiService } from '../../api.service';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { AppService } from '../../../../../Core/services/app/app.service';

@Component({
  selector: 'app-sections',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PaginateTableComponent,
    AddFormComponent,
    ReusableDeleteDialogComponent  // Add this import
  ],
  templateUrl: './sections.html',
})
export class Sections {
  title = 'Add Section';
  trialUnit = '';
  trialType: (string | number)[] = [];
  showCreateLayout = false;

  isEditMode = false;
  selectedRow: any = null;
  editFormData: any = {};
  isLoading = false;
  errorMessage = '';

  // Delete dialog properties
  showDeleteDialog = false;
  deleteId: number | null = null;
  deleteName = '';
  deleteLoading = false;

  @ViewChild(PaginateTableComponent) paginateTable!: PaginateTableComponent;

  shipOptions = [
    { label: 'INS KOLKATA', value: 'ins-kolkata' },
    { label: 'INS KOCHI', value: 'ins-kochi' },
    { label: 'INS CHENNAI', value: 'ins-chennai' },
    { label: 'INS MUMBAI', value: 'ins-mumbai' },
  ];

  rowData: any[] = [];

  columnOilData = [
    { field: 'name', headerName: 'Name', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
    { field: 'code', headerName: 'Code', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
    {
      field: 'description',
      headerName: 'Description',
      filter: 'agTextColumnFilter',
      minWidth: 150,

    },
    {
      headerName: 'Action',
      field: 'actions',
      minWidth: 80,
      width: 80,
      maxWidth: 90,
      sortable: false,
      filter: false,
      pinned: 'right' as const,
      cellRenderer: AgActionCellComponent,
      cellRendererParams: {
        actionDisplayMode: 'float',
        onAction: (k: string, r: any) => this.onGridAction(k, r),
        actions: [
          {
            key: 'edit',
            label: 'Edit',
            iconClass: 'fa fa-edit',
            btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200',
          },
          {
            key: 'delete',
            label: 'Delete',
            iconClass: 'fa fa-trash',
            btnClass: 'bg-red-100 text-red-600 hover:bg-red-200',
          },
        ],
      },
    },
  ];

  tabs = [
    {
      id: 'section',
      label: 'Section',
      icon: 'fa-solid fa-oil-can',
      url: 'transaction/get-oil-data?searchInput=&page=1',
      columnDefs: this.columnOilData
    },
  ];

  addButtons = [
    { label: 'Sync', key: 'sync', show: true, cls: 'bg-blue-900 text-white' },
    { label: 'Create', key: 'add', show: true, cls: 'bg-blue-900 text-white' },
  ];

  formConfigForNewDetails: any[] = [
  {
    label: 'Name',
    key: 'name',
    type: 'text',
    colSpan: 1,
    required: true,
    placeholder: 'Enter Name',
  },
    {
    label: 'Code',
    key: 'code',
    type: 'text',
    colSpan: 1,
    required: true,
    placeholder: 'Enter Code',
  },
  {
    label: 'Sequence',
    key: 'sequence',
    type: 'number',
    colSpan: 1,
    required: false,
    placeholder: 'Enter Sequence',
    min: 0
  },
  {
    label: 'Descriptions',
    key: 'descriptions',
    type: 'textarea',
    colSpan: 2,
    required: false,
    placeholder: 'Enter Descriptions',
    rows: 2,
  },
  {
    label: 'Active',

    key: 'active',
    type: 'checkbox',
    defaultValue: true
  }
];

  activeTab = this.tabs[0];

  private readonly apiService = inject(ApiService);
  private readonly notificationService = inject(NotificationService);
  private readonly appService = inject(AppService);

  setActiveTab(tab: any) {
    this.activeTab = tab;
    this.rowData = [];
  }

  openAddPopup(): void {
    this.isEditMode = false;
    this.selectedRow = null;
    this.editFormData = { active: true };
    this.title = 'Add Section';
    this.errorMessage = '';
    this.showCreateLayout = true;
  }

  openEditPopup(row: any): void {
    this.isEditMode = true;
    this.selectedRow = row;
    this.title = 'Edit Section';
    this.errorMessage = '';

    // Build formData object for AddFormComponent
    this.editFormData = {
      name: row.name ?? '',
      descriptions: row.description ?? row.descriptions ?? '',
      code: row.code ?? '',
      sequence: row.sequence ?? 0,
      active: row.active === 1 || row.active === true,
    };

    this.showCreateLayout = true;
  }

  closeAddPopup(): void {
    this.showCreateLayout = false;
    this.isEditMode = false;
    this.selectedRow = null;
    this.editFormData = {};
    this.errorMessage = '';
  }

  onBackdropClick(): void {
    this.closeAddPopup();
  }

  onSaveAddEquipment(): void {
    this.closeAddPopup();
  }

  private onGridAction(key: string, row: any): void {
    if (key === 'edit') {
      this.openEditPopup(row);
    } else if (key === 'delete') {
      this.openDeleteDialog(row);
    }
  }

  onSync() {
    console.log('Syncing data...');
    // Implement your sync logic here
    this.notificationService.success('Sync initiated');
  }

  headerTitle = '';

  triggerOilModal(key: string, rowData?: any, headerTitle?: string): void {
    this.headerTitle = headerTitle || '';
    if (key === 'add') {
      this.openAddPopup();
    } else if (key === 'edit') {
      this.openEditPopup(rowData);
    } else if (key === 'sync') {
      this.onSync();
    }
  }

  handleSubmit(formData: any): void {
    if (this.isEditMode) {
      this.handleEdit(formData);
    } else {
      this.handleCreate(formData);
    }
  }

  private buildPayload(formData: any): object {
    return {
      name: formData.name,
      code: formData.code,
      description: formData.descriptions,
      sequence: formData.sequence ?? 1,
      active: formData.active ? 1 : 0,
    };
  }

  private handleCreate(formData: any): void {
    this.isLoading = true;
    this.errorMessage = '';

    const payload = this.buildPayload(formData);

    this.apiService.post('master/sections/', payload).subscribe({
      next: () => {
        this.isLoading = false;
        this.closeAddPopup();
        this.refreshTable();
        this.notificationService.success('Section created successfully');
      },
      error: (err: any) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.detail || 'Failed to create. Please try again.';
        this.notificationService.error(this.errorMessage);
      },
    });
  }

  private handleEdit(formData: any): void {
    this.isLoading = true;
    this.errorMessage = '';

    const id = this.selectedRow?.id;
    const payload = { ...this.buildPayload(formData), id };

    this.apiService.post(`master/sections/${id}/`, payload).subscribe({
      next: () => {
        this.isLoading = false;
        this.closeAddPopup();
        this.refreshTable();
        this.notificationService.success('Section updated successfully');
      },
      error: (err: any) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.detail || 'Failed to update. Please try again.';
        this.notificationService.error(this.errorMessage);
      },
    });
  }

  // Delete Dialog Methods
  openDeleteDialog(row: any): void {
    this.deleteId = row?.id;
    this.deleteName = row?.name || 'this section';
    this.showDeleteDialog = true;
  }

  closeDeleteDialog(): void {
    this.showDeleteDialog = false;
    this.deleteId = null;
    this.deleteName = '';
    this.deleteLoading = false;
  }

  confirmDelete(): void {
    if (!this.deleteId) return;

    this.deleteLoading = true;

    // Using soft delete with active=3
    this.apiService.post(`master/sections/${this.deleteId}/`, { id: this.deleteId, active: 3 }).subscribe({
      next: () => {
        this.deleteLoading = false;
        this.closeDeleteDialog();
        this.refreshTable();
        this.notificationService.success('Section deleted successfully');
      },
      error: (err: any) => {
        console.error('Error deleting section:', err);
        this.deleteLoading = false;
        const errorMsg = err?.error?.detail || 'Failed to delete. Please try again.';
        this.notificationService.error(errorMsg);
      },
    });
  }

  private refreshTable(): void {
    if (this.paginateTable) {
      this.paginateTable.loadData();
    }
  }
}
