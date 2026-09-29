import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { AgActionCellComponent, ReusableDeleteDialogComponent, ToastComponent } from '../../ui/master-compat';
import { CommonModule } from '@angular/common';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { FormsModule } from '@angular/forms';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
import { ApiService, DropdownOption } from '../../api.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-subsystem',
  standalone: true,
  imports: [CommonModule, FormsModule, PaginateTableComponent, AddFormComponent, ReusableDeleteDialogComponent],
  templateUrl: './subsystem.html',
})
export class Subsystem implements OnInit {
  rowData: any[] = [];
  tableLoading = false;
  systemOptions: DropdownOption<number>[] = [];
  systemMap: Map<number, string> = new Map(); // Map to store system id -> system name
  system: string | number = '';
  name = '';
  description = '';
  sequence: number | null = null;
  code = '';
  showCreateLayout = false;
  isEditMode = false;
  editingItem: any = null;
  private isSaving = false;
  title = 'ADD SUBSYSTEM';
  editFormData: any = {};
  @ViewChild(PaginateTableComponent) paginateTable!: PaginateTableComponent;

  addButtons = [
    {
      label: 'Add Subsystem',
      key: 'add',
      show: true,
      cls: 'bg-blue-900 text-white',
    },
  ];

  // Delete dialog properties
  showDeleteDialog = false;
  deleteId: number | null = null;
  deleteName: string = '';
  deleteLoading = false;

  columnSubsystemData = [
    { headerName: 'Ser', valueGetter: (p: any) => (p.node?.rowIndex ?? 0) + 1, width: 80, minWidth: 60, pinned: 'left' },
    { 
      field: 'system_name', 
      headerName: 'System', 
      filter: 'agTextColumnFilter', 
      flex: 1, 
      minWidth: 140,
      // valueGetter: (params: any) => {
      //   // Map system ID to system name
      //   const systemId = params.data?.system;
      //   return this.systemMap.get(systemId) || systemId || '-';
      // }
    },
    { field: 'name', headerName: 'Name', filter: 'agTextColumnFilter', flex: 1, minWidth: 140 },
    { field: 'description', headerName: 'Description', filter: 'agTextColumnFilter', flex: 1, minWidth: 170 },
    { field: 'sequence', headerName: 'Sequence', filter: 'agTextColumnFilter', flex: 1, minWidth: 100 },
    // { field: 'code', headerName: 'Code', filter: 'agTextColumnFilter', flex: 1, minWidth: 120 },
    {
      headerName: 'Action', field: 'actions', width: 120, maxWidth: 120, sortable: false, filter: false, pinned: 'right' as 'right',
      cellRenderer: AgActionCellComponent,
      cellRendererParams: {
        actionDisplayMode: 'float',
        onAction: (k: string, r: any) => this.onGridAction(k, r),
        actions: [
          { key: 'edit', label: 'Edit', iconClass: 'fa fa-edit', btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200' },
          { key: 'delete', label: 'Delete', iconClass: 'fa fa-trash', btnClass: 'bg-red-100 text-red-600 hover:bg-red-200' }
        ]
      }
    }
  ];

  formConfigForNewDetails: any[] = [
    { label: 'System', type: 'select', key: 'system', colSpan: 1, required: true, options: this.systemOptions },
    { label: 'Name', type: 'text', key: 'name', colSpan: 1, required: true },
    { label: 'Sequence', type: 'number', key: 'sequence', colSpan: 1, required: false },
    { label: 'Code', type: 'text', key: 'code', colSpan: 1, required: false },
    { label: 'Description', type: 'textarea', key: 'description', colSpan: 2, required: false }
  ];

  constructor(
    private apiService: ApiService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) {}

  ngOnInit() {
    this.loadSystems();
  }

  handleAddButtonClick(event: { key: string; rowData?: any }): void {
    if (event.key === 'add') {
      this.openAddPopup();
    }
  }

  onFormOpenChange(open: boolean): void {
    this.showCreateLayout = open;
    if (!open) {
      this.isEditMode = false;
      this.editingItem = null;
    }
  }

  openAddPopup() {
    if (!this.systemOptions.length) this.loadSystems();
    this.isEditMode = false;
    this.editingItem = null;
    this.title = 'ADD SUBSYSTEM';
    this.resetFormState();
    this.showCreateLayout = true;
  }

  closeAddPopup() {
    this.isSaving = false;
    this.showCreateLayout = false;
    this.isEditMode = false;
    this.editingItem = null;
    this.resetFormState();
    this.cdr.detectChanges();
  }

  handleSubmit(formData: any) {
    this.isSaving = true;
    this.onSaveSubsystem(formData);
  }

  onFieldChange(event: { key?: string; value?: any; form?: any; formValue?: any }): void {
    if (this.isSaving) return;

    const snapshot = event.form ?? event.formValue;
    if (snapshot) {
      if (snapshot.system !== undefined) this.system = snapshot.system;
      if (snapshot.name !== undefined) this.name = snapshot.name;
      if (snapshot.description !== undefined) this.description = snapshot.description;
      if (snapshot.sequence !== undefined) this.sequence = snapshot.sequence;
      if (snapshot.code !== undefined) this.code = snapshot.code;
      this.editFormData = { ...snapshot };
      return;
    }

    const { key, value } = event;
    if (key === 'system') this.system = value;
    if (key === 'name') this.name = value;
    if (key === 'description') this.description = value;
    if (key === 'sequence') this.sequence = value;
    if (key === 'code') this.code = value;
    this.editFormData = this.buildFormData();
  }

  onSaveSubsystem(formData: any) {
    const payload: any = {
      system: formData?.system,
      name: formData?.name,
      description: formData?.description || '',
      sequence: formData?.sequence ?? null,
      code: formData?.code || '',
    };

    if (this.editingItem?.id) {
      payload.id = this.editingItem.id;
    }

    this.apiService.post('master/subsystems/', payload).subscribe({
      next: () => {
        this.closeAddPopup();
        this.refreshTable();
        this.toast.showSuccess(
          payload.id ? 'Subsystem updated successfully' : 'Subsystem created successfully',
        );
      },
      error: (e: any) => {
        this.isSaving = false;
        console.error('Error saving subsystem', e);
      },
      complete: () => {
        this.isSaving = false;
      },
    });
  }

  private onGridAction(k: string, r: any) {
    if (k === 'edit') this.openEditPopup(r);
    else if (k === 'delete') this.openDeleteDialog(r);
  }

  openEditPopup(row: any) {
    this.isEditMode = true;
    this.editingItem = row;
    this.title = 'EDIT SUBSYSTEM';
    
    this.system = row.system || '';
    this.name = row.name || '';
    this.description = row.description || '';
    this.sequence = row.sequence || null;
    this.code = row.code || '';
    
    this.editFormData = this.buildFormData();
    this.showCreateLayout = true;
  }

  openDeleteDialog(row: any) {
    this.deleteId = row.id;
    this.deleteName = row.name;
    this.showDeleteDialog = true;
  }

  closeDeleteDialog() {
    this.showDeleteDialog = false;
    this.deleteId = null;
    this.deleteName = '';
    this.deleteLoading = false;
  }

  confirmDelete() {
    this.deleteLoading = true;
    
    this.apiService.post('master/subsystems/', { id: this.deleteId, active: 3 }).subscribe({
      next: () => {
        this.refreshTable();
        this.closeDeleteDialog();
        // Show success toast if needed
      },
      error: (err: any) => {
        console.error('Error deleting subsystem:', err);
        this.deleteLoading = false;
        // Show error toast if needed
      }
    });
  }

  loadSystems() {
    this.apiService.get('master/systems/').subscribe({
      next: (response: any) => {
        const systemsData = response.data || response;
        
        // Clear existing maps
        this.systemMap.clear();
        
        // Build system options and mapping
        this.systemOptions = systemsData.map((system: any) => {
          // Store mapping from id to name
          this.systemMap.set(system.id, system.name);
          return {
            label: system.name,
            value: system.id
          };
        });
        
        this.updateFieldOptions('system', this.systemOptions);
        
        // Refresh table data to update system names
        this.refreshTableData();
        this.cdr.detectChanges();
      },
      error: (err: any) => console.error('Error loading systems:', err)
    });
  }

  loadSubsystemData() {}

  refreshTableData() {
    // Trigger table refresh to update system names
    if (this.rowData && this.rowData.length) {
      this.rowData = [...this.rowData];
    }
  }

  private refreshTable(): void {
    this.paginateTable?.refreshTable();
  }

  private resetFormState() {
    this.system = '';
    this.name = '';
    this.description = '';
    this.sequence = null;
    this.code = '';
    this.editFormData = this.buildFormData();
  }

  private updateFieldOptions(fieldKey: string, options: DropdownOption<number>[]) {
    this.formConfigForNewDetails = this.formConfigForNewDetails.map(f => 
      f.key === fieldKey ? { ...f, options: [...options] } : f
    );
  }

  private buildFormData() {
    return {
      system: this.system || '',
      name: this.name || '',
      description: this.description || '',
      sequence: this.sequence || null,
      code: this.code || ''
    };
  }
}