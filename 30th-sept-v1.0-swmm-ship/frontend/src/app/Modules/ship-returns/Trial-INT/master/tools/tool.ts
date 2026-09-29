import { ChangeDetectorRef, Component, inject, OnInit, ViewChild } from '@angular/core';
import { AgActionCellComponent, ReusableDeleteDialogComponent } from '../../ui/master-compat';
import { CommonModule } from '@angular/common';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { FormsModule } from '@angular/forms';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
import { ApiService, DropdownOption } from '../../api.service';
import { AppService } from '../../../../../Core/services/app/app.service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-tool',
  standalone: true,
  imports: [CommonModule, FormsModule, PaginateTableComponent, AddFormComponent, ReusableDeleteDialogComponent],
  templateUrl: './tool.html',
})
export class Tool implements OnInit {
  rowData: any[] = [];
  tableLoading = false;
  name = '';
  nomenclature = '';
  serialNumber = '';
  description = '';
  satelliteUnit = '';
  showCreateLayout = false;
  isEditMode = false;
  editingItem: any = null;
  title = 'ADD TOOL';
  editFormData: any = {};
  @ViewChild(PaginateTableComponent) paginateTable!: PaginateTableComponent;

  addButtons = [
    {
      label: 'Add Tool',
      key: 'add',
      show: true,
      cls: 'bg-blue-900 text-white',
    },
  ];

  // Satellite units dropdown options
  satelliteUnitOptions: DropdownOption[] = [];
  satelliteUnitMap = new Map<number, string>();

  // Delete dialog properties
  showDeleteDialog = false;
  deleteId: number | null = null;
  deleteName = '';
  deleteLoading = false;

  columnToolData = [
    { headerName: 'Ser', valueGetter: (p: any) => (p.node?.rowIndex ?? 0) + 1, width: 80, minWidth: 60, pinned: 'left' },
    { field: 'name', headerName: 'Name', filter: 'agTextColumnFilter', flex: 1, minWidth: 140 },
    { field: 'nomenclature', headerName: 'Nomenclature', filter: 'agTextColumnFilter', flex: 1, minWidth: 160 },
    { field: 'serial_number', headerName: 'Serial Number', filter: 'agTextColumnFilter', flex: 1, minWidth: 140 },
    { field: 'description', headerName: 'Description', filter: 'agTextColumnFilter', flex: 1, minWidth: 170 },
    {
      field: 'satellite_unit',
      headerName: 'Satellite Unit',
      filter: 'agTextColumnFilter',
      flex: 1,
      minWidth: 140,
      valueGetter: (params: any) => {
        const satelliteUnitId = Number(params.data?.satellite_unit);
        return this.satelliteUnitMap.get(satelliteUnitId) || params.data?.satellite_unit || '-';
      },
    },
    {
      headerName: 'Action', field: 'actions', width: 140, maxWidth: 160, sortable: false, filter: false, pinned: 'right' as const,
      cellRenderer: AgActionCellComponent,
      cellRendererParams: {
        actionDisplayMode: 'float',
        onAction: (k: string, r: any) => this.onGridAction(k, r),
        actions: [
          { key: 'view', label: 'View', iconClass: 'fa fa-eye', btnClass: 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' },
          { key: 'edit', label: 'Edit', iconClass: 'fa fa-edit', btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200' },
          { key: 'delete', label: 'Delete', iconClass: 'fa fa-trash', btnClass: 'bg-red-100 text-red-600 hover:bg-red-200' }
        ]
      }
    }
  ];

  formConfigForNewDetails: any[] = [
    { label: 'Name', type: 'text', key: 'name', colSpan: 1, required: true },
    { label: 'Nomenclature', type: 'text', key: 'nomenclature', colSpan: 1, required: true },
    { label: 'Serial Number', type: 'text', key: 'serialNumber', colSpan: 1, required: false },
    { label: 'Satellite Unit', type: 'select', key: 'satelliteUnit', colSpan: 1.5, required: true, options: [] },
    { label: 'Description', type: 'textarea', key: 'description', colSpan: 1.5, required: false }
  ];
    private readonly apiService = inject(ApiService);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly appService = inject(AppService);

  ngOnInit() {
    this.loadSatelliteUnits();
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

  loadSatelliteUnits() {
    this.appService.showLoader();
    this.apiService.get('master/satellite-units/')
      .pipe(
        finalize(() => {
          this.appService.hideLoader();
        })
      )
      .subscribe({
        next: (response: any) => {
          const unitsData = response.data || response;
          this.satelliteUnitMap.clear();
          this.satelliteUnitOptions = unitsData.map((unit: any) => ({
            label: unit.name || unit.trial_unit_name,
            value: unit.id
          }));
          unitsData.forEach((unit: any) => {
            if (unit?.id) {
              this.satelliteUnitMap.set(Number(unit.id), unit.name || unit.trial_unit_name || String(unit.id));
            }
          });

          // Update the form config with the loaded options
          const satelliteUnitField = this.formConfigForNewDetails.find(field => field.key === 'satelliteUnit');
          if (satelliteUnitField) {
            satelliteUnitField.options = this.satelliteUnitOptions;
          }
        },
        error: err => console.error('Error loading satellite units:', err)
      });
  }

  openAddPopup() {
    this.isEditMode = false;
    this.editingItem = null;
    this.title = 'ADD TOOL';
    this.resetFormState();
    this.showCreateLayout = true;
  }

  closeAddPopup() {
    this.showCreateLayout = false;
    this.isEditMode = false;
    this.editingItem = null;
  }

  handleSubmit(formData: any) {
    this.name = formData.name || '';
    this.nomenclature = formData.nomenclature || '';
    this.serialNumber = formData.serialNumber || '';
    this.description = formData.description || '';
    this.satelliteUnit = formData.satelliteUnit || '';
    this.editFormData = this.buildFormData();
    this.onSaveTool();
  }

  onFieldChange(event: { key?: string; value?: any; form?: any; formValue?: any }) {
    const snapshot = event?.formValue ?? event?.form;

    // `app-add-form` emits full form snapshots on every change.
    // Keep the parent's cached form model in sync so the child is not patched
    // back with stale empty values while the user is typing.
    if (snapshot && typeof snapshot === 'object') {
      this.name = snapshot.name ?? '';
      this.nomenclature = snapshot.nomenclature ?? '';
      this.serialNumber = snapshot.serialNumber ?? '';
      this.description = snapshot.description ?? '';
      this.satelliteUnit = snapshot.satelliteUnit ?? '';
      this.editFormData = this.buildFormData();
      return;
    }

    const { key, value } = event;

    if (key === 'name') this.name = value ?? '';
    if (key === 'nomenclature') this.nomenclature = value ?? '';
    if (key === 'serialNumber') this.serialNumber = value ?? '';
    if (key === 'description') this.description = value ?? '';
    if (key === 'satelliteUnit') this.satelliteUnit = value ?? '';
    this.editFormData = this.buildFormData();
  }

  onSaveTool() {
    const satelliteUnitId = Number(this.satelliteUnit);
    if (!satelliteUnitId || Number.isNaN(satelliteUnitId)) {
      console.error('Satellite unit is required');
      return;
    }

    const payload: any = {
      name: this.name,
      nomenclature: this.nomenclature,
      serial_number: this.serialNumber,
      description: this.description,
      satellite_unit: satelliteUnitId
    };

    if (this.editingItem?.id) {
      payload.id = this.editingItem.id;
    }

    this.apiService.post('master/tools/', payload).subscribe({
      next: (response) => {
        this.closeAddPopup();
        this.refreshTable();
        // Show success toast if needed
      },
      error: e => console.error('Error saving tool', e)
    });
  }

  private onGridAction(k: string, r: any) {
    if (k === 'edit' || k === 'view') {
      this.openEditPopup(r);
      if (k === 'view') this.title = 'VIEW TOOL';
    } else if (k === 'delete') {
      this.openDeleteDialog(r);
    }
  }

  openEditPopup(row: any) {
    this.isEditMode = true;
    this.editingItem = row;
    this.title = 'EDIT TOOL';

    this.name = row.name || '';
    this.nomenclature = row.nomenclature || '';
    this.serialNumber = row.serial_number || '';
    this.description = row.description || '';
    this.satelliteUnit = row.satellite_unit || '';

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

    this.apiService.post('master/tools/', { id: this.deleteId, active: 3 }).subscribe({
      next: () => {
        this.refreshTable();
        this.closeDeleteDialog();
        // Show success toast if needed
      },
      error: err => {
        console.error('Error deleting tool:', err);
        this.deleteLoading = false;
        // Show error toast if needed
      }
    });
  }

  loadToolData() {}

  private resetFormState() {
    this.name = '';
    this.nomenclature = '';
    this.serialNumber = '';
    this.description = '';
    this.satelliteUnit = '';
    this.editFormData = this.buildFormData();
  }

  private buildFormData() {
    return {
      name: this.name || '',
      nomenclature: this.nomenclature || '',
      serialNumber: this.serialNumber || '',
      description: this.description || '',
      satelliteUnit: this.satelliteUnit || ''
    };
  }

  private refreshTable(): void {
    if (this.paginateTable) {
      this.paginateTable.loadData();
    }
  }
}
