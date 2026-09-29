import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgActionCellComponent, ReusableDeleteDialogComponent } from '../../ui/master-compat';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
import { ApiService, DropdownOption } from '../../api.service';
import { ToastService } from '../../services/toast.service';

const FORM_TYPE_OPTIONS: DropdownOption<number>[] = [
  { label: 'Requisition Form', value: 1 },
  { label: 'Trial Form', value: 2 },
  { label: 'Trial and Requisition Form', value: 3 },
  { label: 'Surprise Form', value: 4 },
];

@Component({
  selector: 'app-trial-types',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PaginateTableComponent,
    AddFormComponent,
    ReusableDeleteDialogComponent,
  ],
  templateUrl: './trial-types.html',
})
export class TrialTypes implements OnInit {
  @ViewChild(PaginateTableComponent) table!: PaginateTableComponent;
  @ViewChild(AddFormComponent) addForm?: AddFormComponent;

  rowData: any[] = [];
  tableLoading = false;
  trialUnitOptions: DropdownOption<number>[] = [];
  satelliteUnitOptions: DropdownOption<number>[] = [];
  subGroupOptions: DropdownOption<number>[] = [];
  typeOptions = [
    { label: 'Trial', value: 'trial' },
    { label: 'Returns', value: 'returns' },
  ];
  formTypeOptions = FORM_TYPE_OPTIONS;

  showCreateLayout = false;
  isEditMode = false;
  editingItem: any = null;
  editFormData: Record<string, unknown> = {};
  saving = false;

  showDeleteDialog = false;
  deleteId: number | null = null;
  deleteName = '';
  deleteLoading = false;

  addButtons = [
    { label: 'Add Trial Type', key: 'add', show: true, cls: 'bg-blue-900 text-white' },
  ];

  columnDefs = [
    { headerName: 'Ser', valueGetter: (p: any) => (p.node?.rowIndex ?? 0) + 1, width: 70, minWidth: 60, pinned: 'left' },
    { field: 'trial_unit_name', headerName: 'Trial Unit', filter: 'agTextColumnFilter', flex: 1, minWidth: 140 },
    { field: 'name', headerName: 'Name', filter: 'agTextColumnFilter', flex: 1, minWidth: 180 },
    { field: 'type', headerName: 'Type', filter: 'agTextColumnFilter', minWidth: 100 },
    { field: 'url', headerName: 'URL', filter: 'agTextColumnFilter', flex: 1, minWidth: 160 },
    { field: 'report_url', headerName: 'Report URL', filter: 'agTextColumnFilter', flex: 1, minWidth: 140 },
    { field: 'sequence', headerName: 'Sequence', filter: 'agNumberColumnFilter', minWidth: 100 },
    {
      field: 'form_type',
      headerName: 'Form Type',
      filter: 'agTextColumnFilter',
      minWidth: 180,
      valueFormatter: (p: any) => this.formTypeLabel(p.value),
    },
    {
      headerName: 'Action',
      field: 'actions',
      width: 100,
      maxWidth: 100,
      sortable: false,
      filter: false,
      pinned: 'right' as 'right',
      cellRenderer: AgActionCellComponent,
      cellRendererParams: {
        actionDisplayMode: 'float',
        onAction: (k: string, r: any) => this.onGridAction(k, r),
        actions: [
          { key: 'edit', label: 'Edit', iconClass: 'fa fa-edit', btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200' },
          { key: 'delete', label: 'Delete', iconClass: 'fa fa-trash', btnClass: 'bg-red-100 text-red-600 hover:bg-red-200' },
        ],
      },
    },
  ];

  formConfigForNewDetails: any[] = [
    { label: 'Name', type: 'text', key: 'name', colSpan: 1.0, required: true, placeholder: 'Enter name' },
    { label: 'Type', type: 'select', key: 'type', colSpan: 1.0, required: true, options: this.typeOptions },
    { label: 'Form Type', type: 'select', key: 'form_type', colSpan: 1.0, required: true, options: this.formTypeOptions },
    { label: 'Sequence', type: 'number', key: 'sequence', colSpan: 1.0, min: 0 },
    { label: 'URL', type: 'text', key: 'url', colSpan: 1.0, placeholder: '/dynamic-form/...' },
    { label: 'Report URL', type: 'text', key: 'report_url', colSpan: 1.0, placeholder: 'Report URL' },
    {
      label: 'Trial Unit',
      type: 'select',
      key: 'trial_unit',
      colSpan: 1.0,
      required: true,
      placeholder: 'Select trial unit',
      options: this.trialUnitOptions,
    },
    {
      label: 'Satellite Unit',
      type: 'select-multiple',
      key: 'satellite_units',
      colSpan: 1.0,
      required: false,
      placeholder: 'Select trial unit first, then satellite units',
      options: this.satelliteUnitOptions,
    },
    {
      label: 'Sub Group',
      type: 'select-multiple',
      key: 'sub_groups',
      colSpan: 1.0,
      required: false,
      placeholder: 'Select sub groups',
      options: this.subGroupOptions,
    },
    { label: 'Description', type: 'textarea', key: 'description', colSpan: 3, rows: 2, placeholder: 'Description' },
  ];

  constructor(
    private readonly apiService: ApiService,
    private readonly cdr: ChangeDetectorRef,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadTrialUnits();
    this.loadSubGroups();
  }

  onFormSelectChange(event: { key: string; value: unknown }): void {
    if (event.key !== 'trial_unit') return;

    const trialUnitId = this.coerceTrialUnitId(event.value);
    this.editFormData = {
      ...this.editFormData,
      trial_unit: trialUnitId,
      satellite_units: [],
    };
    this.addForm?.patchFormPartial({ satellite_units: [] });

    if (trialUnitId != null) {
      this.loadSatelliteUnits(trialUnitId);
    } else {
      this.satelliteUnitOptions = [];
      this.updateFieldOptions('satellite_units', []);
      this.cdr.detectChanges();
    }
  }

  handleAddButtonClick(event: { key: string }): void {
    if (event.key === 'add') this.openAddPopup();
  }

  openAddPopup(): void {
    if (!this.trialUnitOptions.length) this.loadTrialUnits();
    this.isEditMode = false;
    this.editingItem = null;
    this.satelliteUnitOptions = [];
    this.updateFieldOptions('satellite_units', []);
    this.editFormData = this.buildFormData();
    this.showCreateLayout = true;
  }

  closeAddPopup(): void {
    this.showCreateLayout = false;
    this.isEditMode = false;
    this.editingItem = null;
  }

  onFormOpenChange(open: boolean): void {
    this.showCreateLayout = open;
    if (!open) {
      this.isEditMode = false;
      this.editingItem = null;
    }
  }

  handleSubmit(formData: any): void {
    if (this.saving) return;

    const payload = this.buildPayload(formData);
    const endpoint = this.isEditMode && this.editingItem?.id
      ? `master/trial-types/${this.editingItem.id}/`
      : 'master/trial-types/';

    if (this.isEditMode && this.editingItem?.id) {
      payload['id'] = this.editingItem.id;
    }

    this.saving = true;
    this.apiService.post(endpoint, payload).subscribe({
      next: (res: any) => {
        const trialTypeId = this.resolveTrialTypeId(res);
        if (!trialTypeId) {
          this.saving = false;
          this.toast.showError('Trial type saved but mapping could not be updated (missing id).');
          this.closeAddPopup();
          this.refreshTable();
          return;
        }
        this.saveTrialTypeMapping(trialTypeId, formData);
      },
      error: (err: any) => {
        this.saving = false;
        console.error('Error saving trial type', err);
      },
    });
  }

  private saveTrialTypeMapping(trialTypeId: number, formData: any): void {
    const mappingPayload = {
      trial_type_id: trialTypeId,
      satellite_units: this.normalizeIdArray(formData.satellite_units),
      sub_groups: this.normalizeIdArray(formData.sub_groups),
    };

    this.apiService.post('master/trial-type-mapping/', mappingPayload).subscribe({
      next: () => {
        this.saving = false;
        this.toast.showSuccess(
          this.isEditMode ? 'Trial type updated successfully' : 'Trial type created successfully',
        );
        this.closeAddPopup();
        this.refreshTable();
      },
      error: (err: any) => {
        this.saving = false;
        console.error('Error saving trial type mapping', err);
      },
    });
  }

  private buildPayload(formData: any): Record<string, unknown> {
    return {
      trial_unit: formData.trial_unit,
      name: formData.name?.trim(),
      type: formData.type,
      url: formData.url?.trim() ?? '',
      description: formData.description?.trim() ?? '',
      report_url: formData.report_url?.trim() ?? '',
      sequence: formData.sequence ?? 1,
      form_type: Number(formData.form_type) || 1,
    };
  }

  private onGridAction(key: string, row: any): void {
    if (key === 'edit') this.openEditPopup(row);
    else if (key === 'delete') this.openDeleteDialog(row);
  }

  openEditPopup(row: any): void {
    this.isEditMode = true;
    this.editingItem = row;
    const trialUnitId = this.coerceTrialUnitId(row.trial_unit ?? row.trial_unit_id);
    const openForm = () => {
      this.editFormData = {
        trial_unit: trialUnitId,
        name: row.name ?? '',
        type: row.type ?? 'trial',
        url: row.url ?? '',
        description: row.description ?? '',
        report_url: row.report_url ?? '',
        sequence: row.sequence ?? 1,
        form_type: row.form_type ?? 1,
        satellite_units: this.extractIds(row.satellite_units),
        sub_groups: this.extractIds(row.sub_groups),
      };
      this.showCreateLayout = true;
      this.cdr.detectChanges();
    };

    if (trialUnitId != null) {
      this.loadSatelliteUnits(trialUnitId, openForm);
    } else {
      this.satelliteUnitOptions = [];
      this.updateFieldOptions('satellite_units', []);
      openForm();
    }
  }

  openDeleteDialog(row: any): void {
    this.deleteId = row?.id;
    this.deleteName = row?.name ?? 'this trial type';
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
    this.apiService
      .post(`master/trial-types/${this.deleteId}/`, { id: this.deleteId, active: 3 })
      .subscribe({
        next: () => {
          this.closeDeleteDialog();
          this.refreshTable();
        },
        error: (err: any) => {
          this.deleteLoading = false;
          console.error('Error deleting trial type', err);
        },
      });
  }

  formTypeLabel(value: unknown): string {
    const id = Number(value);
    return FORM_TYPE_OPTIONS.find((o) => o.value === id)?.label ?? String(value ?? '');
  }

  private loadTrialUnits(): void {
    this.apiService
      .getDropdownData<any, number>('master/trial-units/', { labelKey: 'name', valueKey: 'id' })
      .subscribe({
        next: (opts: any) => {
          this.trialUnitOptions = opts;
          this.updateFieldOptions('trial_unit', opts);
          this.cdr.detectChanges();
        },
        error: (err: any) => console.error('Error loading trial units', err),
      });
  }

  private coerceTrialUnitId(value: unknown): number | null {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  private loadSatelliteUnits(trialUnitId: number | string, onDone?: () => void): void {
    this.apiService
      .getDropdownData<any, number>(
        'master/satellite-units/',
        { labelKey: 'name', valueKey: 'id' },
        { trial_unit: trialUnitId },
      )
      .subscribe({
        next: (opts: any) => {
          this.satelliteUnitOptions = opts;
          this.updateFieldOptions('satellite_units', opts);
          this.cdr.detectChanges();
          onDone?.();
        },
        error: (err: any) => {
          console.error('Error loading satellite units', err);
          this.satelliteUnitOptions = [];
          this.updateFieldOptions('satellite_units', []);
          onDone?.();
        },
      });
  }

  private loadSubGroups(): void {
    this.apiService
      .getDropdownData<any, number>('master/sub-groups/', { labelKey: 'name', valueKey: 'id' })
      .subscribe({
        next: (opts: any) => {
          this.subGroupOptions = opts;
          this.updateFieldOptions('sub_groups', opts);
          this.cdr.detectChanges();
        },
        error: (err: any) => console.error('Error loading sub groups', err),
      });
  }

  private updateFieldOptions(fieldKey: string, options: DropdownOption<number>[]): void {
    this.formConfigForNewDetails = this.formConfigForNewDetails.map((f) =>
      f.key === fieldKey ? { ...f, options: [...options] } : f,
    );
  }

  private buildFormData(): Record<string, unknown> {
    return {
      trial_unit: null,
      name: '',
      type: 'trial',
      url: '',
      description: '',
      report_url: '',
      sequence: 1,
      form_type: 1,
      satellite_units: [],
      sub_groups: [],
    };
  }

  private resolveTrialTypeId(res: any): number | null {
    if (this.isEditMode && this.editingItem?.id) {
      return Number(this.editingItem.id);
    }
    const id = res?.data?.id ?? res?.id ?? res?.data?.trial_type_id ?? res?.trial_type_id;
    return id != null && !Number.isNaN(Number(id)) ? Number(id) : null;
  }

  private normalizeIdArray(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (item == null || item === '') return null;
        if (typeof item === 'object' && item !== null && 'id' in item) {
          return Number((item as { id: unknown }).id);
        }
        return Number(item);
      })
      .filter((id): id is number => id != null && !Number.isNaN(id));
  }

  private extractIds(value: unknown): number[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return this.normalizeIdArray(value);
    }
    return [];
  }

  private refreshTable(): void {
    this.table?.refreshTable();
  }
}
