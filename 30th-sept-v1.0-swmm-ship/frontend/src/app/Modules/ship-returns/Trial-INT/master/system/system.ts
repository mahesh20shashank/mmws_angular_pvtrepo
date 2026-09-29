import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { AgActionCellComponent, ReusableDeleteDialogComponent, ToastComponent } from '../../ui/master-compat';
import { CommonModule } from '@angular/common';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { FormsModule } from '@angular/forms';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
import { ApiService, DropdownOption } from '../../api.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-system',
  standalone: true,
  imports: [CommonModule, FormsModule, PaginateTableComponent, AddFormComponent, ReusableDeleteDialogComponent],
  templateUrl: './system.html',
})
export class System implements OnInit {
  rowData: any[] = [];
  tableLoading = false;
  sectionOptions: DropdownOption<number>[] = [];
  sectionMap: Map<number, string> = new Map(); // Map to store section id -> section name
  section: string | number = '';
  name = '';
  description = '';
  sequence: number | null = null;
  code = '';
  showCreateLayout = false;
  isEditMode = false;
  editingItem: any = null;
  private isSaving = false;
  title = 'ADD SYSTEM';
  editFormData: any = {};
  @ViewChild(PaginateTableComponent) paginateTable!: PaginateTableComponent;

  addButtons = [
    {
      label: 'Add System',
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

  columnSystemData = [
    { headerName: 'Ser', valueGetter: (p: any) => (p.node?.rowIndex ?? 0) + 1, width: 80, minWidth: 60, pinned: 'left' },
    { 
      field: 'section_name', 
      headerName: 'Section', 
      filter: 'agTextColumnFilter', 
      flex: 1, 
      minWidth: 140,
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
    {
      label: 'Section',
      type: 'select',
      key: 'section',
      colSpan: 1,
      required: true,
      placeholder: 'Select section',
      options: this.sectionOptions,
    },
    {
      label: 'Name',
      type: 'text',
      key: 'name',
      colSpan: 1,
      required: true,
      placeholder: 'Enter name',
    },
    {
      label: 'Sequence',
      type: 'number',
      key: 'sequence',
      colSpan: 1,
      required: false,
      placeholder: 'Enter sequence',
    },
    {
      label: 'Code',
      type: 'text',
      key: 'code',
      colSpan: 1,
      required: false,
      placeholder: 'Enter code',
    },
    {
      label: 'Description',
      type: 'textarea',
      key: 'description',
      colSpan: 2,
      required: false,
      placeholder: 'Enter description',
    }
  ];

  constructor(
    private apiService: ApiService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) {}

  ngOnInit() {
    this.loadSections();
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
    if (!this.sectionOptions.length) this.loadSections();
    this.isEditMode = false;
    this.editingItem = null;
    this.title = 'ADD SYSTEM';
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
    this.onSaveSystem(formData);
  }

  onFieldChange({
    key,
    value,
    form,
    formValue,
  }: {
    key?: string;
    value?: any;
    form?: Record<string, any>;
    formValue?: Record<string, any>;
  }) {
    if (this.isSaving) return;

    const snapshot = form ?? formValue;
    if (snapshot) {
      this.section = snapshot['section'] ?? this.section;
      this.name = snapshot['name'] ?? this.name;
      this.description = snapshot['description'] ?? this.description;
      this.sequence = snapshot['sequence'] ?? this.sequence;
      this.code = snapshot['code'] ?? this.code;
      this.editFormData = { ...this.editFormData, ...snapshot };
      return;
    }

    if (key === 'section') this.section = value;
    if (key === 'name') this.name = value;
    if (key === 'description') this.description = value;
    if (key === 'sequence') this.sequence = value;
    if (key === 'code') this.code = value;
    this.editFormData = this.buildFormData();
  }

  onSaveSystem(formData: any) {
    const payload: any = {
      section: formData?.section,
      name: formData?.name,
      description: formData?.description || '',
      sequence: formData?.sequence ?? null,
      code: formData?.code || '',
    };

    if (this.editingItem?.id) {
      payload.id = this.editingItem.id;
    }

    this.apiService.post('master/systems/', payload).subscribe({
      next: () => {
        this.closeAddPopup();
        this.refreshTable();
        this.toast.showSuccess(
          payload.id ? 'System updated successfully' : 'System created successfully',
        );
      },
      error: (e: any) => {
        this.isSaving = false;
        console.error('Error saving system', e);
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
    this.title = 'EDIT SYSTEM';
    
    this.section = row.section || '';
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
    
    this.apiService.post('master/systems/', { id: this.deleteId, active: 3 }).subscribe({
      next: () => {
        this.refreshTable();
        this.closeDeleteDialog();
        // Show success toast if needed
      },
      error: (err: any) => {
        console.error('Error deleting system:', err);
        this.deleteLoading = false;
        // Show error toast if needed
      }
    });
  }

  loadSections() {
    this.apiService.get('master/sections/').subscribe({
      next: (response: any) => {
        const sectionsData = response.data || response;
        
        // Clear existing maps
        this.sectionMap.clear();
        
        // Build section options and mapping
        this.sectionOptions = sectionsData.map((section: any) => {
          // Store mapping from id to name
          this.sectionMap.set(section.id, section.name);
          return {
            label: section.name,
            value: section.id
          };
        });
        
        this.updateFieldOptions('section', this.sectionOptions);
        
        // Refresh table data to update section names
        this.refreshTableData();
        this.cdr.detectChanges();
      },
      error: (err: any) => console.error('Error loading sections:', err)
    });
  }

  loadSystemData() {}

  refreshTableData() {
    // Trigger table refresh to update section names
    if (this.rowData && this.rowData.length) {
      this.rowData = [...this.rowData];
    }
  }

  private refreshTable(): void {
    this.paginateTable?.refreshTable();
  }

  private resetFormState() {
    this.section = '';
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
      section: this.section || '',
      name: this.name || '',
      description: this.description || '',
      sequence: this.sequence || null,
      code: this.code || ''
    };
  }
}