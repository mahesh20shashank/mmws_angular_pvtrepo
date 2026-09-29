import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { AgActionCellComponent, ReusableDeleteDialogComponent, ToastComponent } from '../../ui/master-compat';
import { CommonModule } from '@angular/common';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { FormsModule } from '@angular/forms';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
import { ApiService, DropdownOption } from '../../api.service';

@Component({
  selector: 'app-sub-sub-system',
  standalone: true,
  imports: [CommonModule, FormsModule, PaginateTableComponent, AddFormComponent, ReusableDeleteDialogComponent],
  templateUrl: './sub-sub-system.html',
})
export class SubSubSystem implements OnInit {
  rowData: any[] = [];
  tableLoading = false;
  subsystemOptions: DropdownOption<number>[] = [];
  subsystemMap: Map<number, string> = new Map();
  sub_system: string | number = '';
  name = '';
  description = '';
  showCreateLayout = false;
  isEditMode = false;
  editingItem: any = null;
  title = 'ADD SUB SUB SYSTEM';
  editFormData: any = {};
  @ViewChild(PaginateTableComponent) paginateTable!: PaginateTableComponent;

  addButtons = [
    {
      label: 'Add Sub Sub System',
      key: 'add',
      show: true,
      cls: 'bg-blue-900 text-white',
    },
  ];

  showDeleteDialog = false;
  deleteId: number | null = null;
  deleteName: string = '';
  deleteLoading = false;

  columnSubSubSystemData = [
    { headerName: 'Ser', valueGetter: (p: any) => (p.node?.rowIndex ?? 0) + 1, width: 80, minWidth: 60, pinned: 'left' },
    {
      field: 'sub_system_name',
      headerName: 'Subsystem',
      filter: 'agTextColumnFilter',
      flex: 1,
      minWidth: 140,

    },
    { field: 'name', headerName: 'Name', filter: 'agTextColumnFilter', flex: 1, minWidth: 140 },
    { field: 'description', headerName: 'Description', filter: 'agTextColumnFilter', flex: 1, minWidth: 170 },
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
    { label: 'Subsystem', type: 'select', key: 'sub_system', colSpan: 1, required: true, options: this.subsystemOptions },
    { label: 'Name', type: 'text', key: 'name', colSpan: 1, required: true },
    { label: 'Description', type: 'textarea', key: 'description', colSpan: 2, required: false }
  ];

  constructor(private apiService: ApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadSubsystems();
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
    if (!this.subsystemOptions.length) this.loadSubsystems();
    this.isEditMode = false;
    this.editingItem = null;
    this.title = 'ADD SUB SUB SYSTEM';
    this.resetFormState();
    this.showCreateLayout = true;
  }

  closeAddPopup() {
    this.showCreateLayout = false;
    this.isEditMode = false;
    this.editingItem = null;
  }

  handleSubmit(formData: any) {
    this.sub_system = formData.sub_system || '';
    this.name = formData.name || '';
    this.description = formData.description || '';
    this.editFormData = this.buildFormData();
    this.onSaveSubSubSystem();
  }

  onFieldChange(event: { key?: string; value?: any; form?: any; formValue?: any }): void {
    const snapshot = event.form ?? event.formValue;
    if (snapshot) {
      if (snapshot.sub_system !== undefined) this.sub_system = snapshot.sub_system;
      if (snapshot.name !== undefined) this.name = snapshot.name;
      if (snapshot.description !== undefined) this.description = snapshot.description;
      this.editFormData = { ...snapshot };
      return;
    }

    const { key, value } = event;
    if (key === 'sub_system') this.sub_system = value;
    if (key === 'name') this.name = value;
    if (key === 'description') this.description = value;
    this.editFormData = this.buildFormData();
  }

  onSaveSubSubSystem() {
    const payload: any = {
      sub_system: this.sub_system,
      name: this.name,
      description: this.description,
    };

    if (this.editingItem?.id) {
      payload.id = this.editingItem.id;
    }

    this.apiService.post('master/sub-sub-system/', payload).subscribe({
      next: () => {
        this.closeAddPopup();
        this.refreshTable();
      },
      error: (e: any) => console.error('Error saving sub sub system', e)
    });
  }

  private onGridAction(k: string, r: any) {
    if (k === 'edit') this.openEditPopup(r);
    else if (k === 'delete') this.openDeleteDialog(r);
  }

  openEditPopup(row: any) {
    this.isEditMode = true;
    this.editingItem = row;
    this.title = 'EDIT SUB SUB SYSTEM';

    this.sub_system = this.resolveSubsystemId(row);
    this.name = row.name || '';
    this.description = row.description || '';

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

    this.apiService.post('master/sub-sub-system/', { id: this.deleteId, active: 3 }).subscribe({
      next: () => {
        this.refreshTable();
        this.closeDeleteDialog();
      },
      error: (err: any) => {
        console.error('Error deleting sub sub system:', err);
        this.deleteLoading = false;
      }
    });
  }

  loadSubsystems() {
    this.apiService
      .getDropdownData<any, number>(
        'master/subsystems/',
        { labelKey: 'name', valueKey: 'id' },
      )
      .subscribe({
        next: (opts: any) => {
          this.subsystemMap.clear();
          this.subsystemOptions = opts;
          opts.forEach((opt: any) => {
            this.subsystemMap.set(Number(opt.value), opt.label);
          });
          this.updateFieldOptions('sub_system', this.subsystemOptions);
          this.refreshTableData();
          this.cdr.detectChanges();
        },
        error: (err: any) => console.error('Error loading subsystems:', err)
      });
  }

  refreshTableData() {
    if (this.rowData && this.rowData.length) {
      this.rowData = [...this.rowData];
    }
  }

  private refreshTable(): void {
    this.paginateTable?.refreshTable();
  }

  private resetFormState() {
    this.sub_system = '';
    this.name = '';
    this.description = '';
    this.editFormData = this.buildFormData();
  }

  private updateFieldOptions(fieldKey: string, options: DropdownOption<number>[]) {
    this.formConfigForNewDetails = this.formConfigForNewDetails.map(f =>
      f.key === fieldKey ? { ...f, options: [...options] } : f
    );
  }

  private resolveSubsystemId(row: any): string | number {
    const subSystem = row?.sub_system ?? row?.subsystem;
    if (subSystem && typeof subSystem === 'object') {
      return subSystem.id ?? '';
    }
    return subSystem || '';
  }

  private buildFormData() {
    return {
      sub_system: this.sub_system || '',
      name: this.name || '',
      description: this.description || '',
    };
  }
}
