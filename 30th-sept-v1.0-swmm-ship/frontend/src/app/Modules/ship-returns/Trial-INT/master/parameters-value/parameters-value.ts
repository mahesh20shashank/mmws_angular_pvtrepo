import { ChangeDetectorRef, Component, ViewChild } from '@angular/core';
import { AgActionCellComponent, FormCardComponent, ReusableDeleteDialogComponent, ReusableInputTableComponent, ReusableTableColumn } from '../../ui/master-compat';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../api.service';
import { ToastService } from '../../services/toast.service';
import { forkJoin } from 'rxjs';
import { DA_LOAD, DA_RH_EXT, DA_SAFETY, makeSimpleMatrixTableObject, ME_LOAD, ME_RH_EXT, ME_SAFETY, tables_1} from './JSOM_MAP';
import { InputComponent } from '../../ui/input.component';
import { equipmentHtml } from '../../ApiEndPoints';
import { NotificationService } from '../../../../../Core/services/notification';
@Component({
  selector: 'app-parameters-value',
  imports: [
    CommonModule,
    FormsModule,
    PaginateTableComponent,
    FormCardComponent,
    InputComponent,
    AddFormComponent,
    ReusableDeleteDialogComponent,
    ReusableInputTableComponent,
  ],
  templateUrl: './parameters-value.html',
  styleUrl: './parameters-value.css',
})
export class ParametersValue {
  title = 'Add Parameter Value';
  matrixConverter = makeSimpleMatrixTableObject
  columnConfig: Record<number, any> = {
    358: DA_LOAD,
    360: DA_RH_EXT,
    362: DA_SAFETY,
    374: ME_LOAD,
    376: ME_RH_EXT,
    378: ME_SAFETY,
  };

  /** Human-readable labels for trial types that have a parameter table template. */
  private readonly trialTypeConfigLabels: Record<number, string> = {
    358: 'DA Load',
    360: 'DA RH Ext',
    362: 'DA Safety',
    374: 'ME Load',
    376: 'ME RH Ext',
    378: 'ME Safety',
  };

  get supportedTrialTypesText(): string {
    return Object.values(this.trialTypeConfigLabels).join(', ');
  }

  get hasTrialTypeSelected(): boolean {
    return this.selectedTrialTypeId !== null && this.selectedTrialTypeId !== '';
  }
  trialUnit = '';
  parameterTableColumns: ReusableTableColumn[] = [];
  tableData: any[] = [];
  parameterTables: { table_name: string; data: any[] }[] = [];
  parameterTableHeaders: string[] = [];
  satelliteUnitOptions: { label: string; value: any }[] = [];
  trialType: { label: string; value: any }[] = [
    {label: 'Select Trial Type', value: ''},
    {label: 'DA LOAD TRIAL', value: 358},
    {label: 'DA RUNNING HOUR EXTENSION', value: 360},
    {label: 'DA SAFETY DEVICE CHECKS', value: 362},    
    {label: 'ME LOAD TRIAL', value: 374},
    {label: 'ME RUNNING HOUR EXTENSION', value: 376},
    {label: 'ME SAFETY DEVICE CHECKS', value: 378},    
  ];
  selectedTrialTypeId: number | string | null = null;
  unmappedTrialTypeLabel = '';
  showCreateLayout = false;

  isEditMode = false;
  selectedRow: any = null;
  editFormData: any = {};
  isLoading = false;
  errorMessage = '';

  showDeleteDialog = false;
  deleteId: number | null = null;
  deleteName: string = '';
  deleteLoading = false;

  @ViewChild(PaginateTableComponent) paginateTable!: PaginateTableComponent;
  @ViewChild(AddFormComponent) addForm?: AddFormComponent;
  trialUnitOptions: { label: string; value: any }[] = [];
  commandOptions: { label: string; value: string }[] = [];
  alarmTypeOptions = [
    { label: 'Remote', value: 'remote' },
    { label: 'Local', value: 'local' },
  ];
  equipmentOptions: { label: string; value: any }[] = [];
  shipOptions: { label: string; value: any }[] = [];

  constructor(
    private apiService: ApiService,
    private toastService: ToastService,
    public cdr: ChangeDetectorRef,
    private notificationService: NotificationService
  ) {}  

  ngOnInit(): void {
    this.loadTrialUnitsAndShips();
  }

  private buildTableColumns(columnConfig: any): ReusableTableColumn[] {
    return (columnConfig?.columns ?? columnConfig ?? []).map((header: string) => {
      const field = header;
      const isSerial = ['Sr No', 'SER', 'Ser', 'Sr.'].includes(header);
      return {
        field,
        header,
        fieldType: isSerial ? 'ser' : 'text',
        align: isSerial ? 'center' : 'left',
      };
    });
  }

  private resolveTrialTypeConfig(trialTypeId: any): any | null {
    const id = this.normalizeSingleId(trialTypeId);
    if (id === null || id === undefined || id === '') {
      return null;
    }
    return this.columnConfig[id] ?? this.columnConfig[Number(id)] ?? null;
  }

  private getTrialTypeLabel(trialTypeId: any): string {
    const match = this.trialType.find((opt) => String(opt.value) === String(trialTypeId));
    return match?.label ?? this.trialTypeConfigLabels[Number(trialTypeId)] ?? String(trialTypeId);
  }

  private applyTrialTypeSelection(
    trialTypeId: any,
    trialTypeLabel?: string,
    existingTables?: { table_name: string; data: any[] }[],
  ): void {
    this.selectedTrialTypeId = trialTypeId ?? null;
    this.unmappedTrialTypeLabel = '';

    if (trialTypeId === null || trialTypeId === undefined || trialTypeId === '') {
      this.parameterTableColumns = [];
      this.parameterTables = [];
      return;
    }

    const config = this.resolveTrialTypeConfig(trialTypeId);
    const label = trialTypeLabel || this.getTrialTypeLabel(trialTypeId);

    if (!config) {
      this.parameterTableColumns = [];
      this.parameterTables = [];
      this.unmappedTrialTypeLabel = label;
      this.notificationService.warning(
        `No parameter table template exists for "${label}". Supported types: ${this.supportedTrialTypesText}.`,
      );
      this.cdr.detectChanges();
      return;
    }

    this.parameterTableColumns = this.buildTableColumns(config.colConfig ?? config.columns);
    this.parameterTables = existingTables?.length
      ? existingTables
      : [{ table_name: 'Parameter Table 1', data: [this.createEmptyTableRow()] }];
    this.cdr.detectChanges();
  }

  private resetParameterTableState(): void {
    this.selectedTrialTypeId = null;
    this.unmappedTrialTypeLabel = '';
    this.parameterTableColumns = [];
    this.parameterTables = [];
  }

  private createEmptyTableRow(): Record<string, string> {
    const row: Record<string, string> = {};
    for (const col of this.parameterTableColumns) {
      const c = col as any;
      if (c.fieldType !== 'ser' && c.field) {
        row[c.field] = '';
      }
    }
    return row;
  }

  rowData: any[] = [];

  columnOilData = [
    { field: 'equipment_name', headerName: 'Equipment', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
    { field: 'equipment_trial_unit_name', headerName: 'Trial Units', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
    { field: 'trialtypes_name', headerName: 'Trial Type', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
    { field: 'satellite_unit_name', headerName: 'Satellite Unit', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
    { field: 'equipment_ship_name', headerName: 'Ship', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
    {
      headerName: 'Action',
      field: 'actions',
      minWidth: 120,
      width: 120,
      maxWidth: 130,
      sortable: false,
      filter: false,
      pinned: 'right' as 'right',
      cellRenderer: AgActionCellComponent,
      cellRendererParams: {
        actionDisplayMode: 'float',
        onAction: (k: string, r: any) => this.onGridAction(k, r),
        actions: [
          {
            key: 'view',
            label: 'View',
            iconClass: 'fa fa-eye',
            btnClass: 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200',
          },
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

  addButtons = [
    { label: 'Create Parameter Value', key: 'add', show: true, cls: 'bg-blue-900 text-white' },
  ];

  formConfigForNewDetails: any[] = [
    {
      label: 'Select Section',
      key: 'ship_id',
      type: 'select-multiple',
      required: true,
      options: this.shipOptions,
      labelKey: 'label',
      valueKey: 'value', 
      placeholder: 'Select Ship'
    },

    {
      label: 'Select Equipment',
      key: 'equipment',
      type: 'select-multiple',
      required: true,
      options: this.equipmentOptions,
      labelKey: 'label',
      valueKey: 'value', 
      placeholder: 'Select Equipment'
    },
    {
      label: 'Select Satellite Unit',
      key: 'satellite_units',
      type: 'radio',
      required: true,
      options: this.satelliteUnitOptions,
      labelKey: 'label',
      valueKey: 'value', 
      placeholder: 'Select Satellite Unit'
    },
    {
      label: 'Select Trial Type',
      key: 'trialtypes',
      type: 'select',
      required: true,
      options: this.trialType,
      labelKey: 'label',
      valueKey: 'value',
      placeholder: 'Select a supported trial type (DA Load, ME Load, etc.)'
    }
  ];

  openAddPopup(): void {
    this.isEditMode = false;
    this.selectedRow = null;
    this.equipmentOptions = [];
    this.updateFieldOptions('equipment', []);
    this.updateFieldOptions('trialtypes', this.trialType);
    this.editFormData = { active: true };
    this.title = 'Add Parameter Value';
    this.resetParameterTableState();

    this.showCreateLayout = true;
  }

  closeAddPopup(): void {
    this.showCreateLayout = false;
    this.isEditMode = false;
    this.selectedRow = null;
    this.editFormData = {};
    this.errorMessage = '';
    this.resetParameterTableState();
  }

  onBackdropClick(): void {
    this.closeAddPopup();
  }

  onSaveAddEquipment(): void {
    this.closeAddPopup();
  }

  addParameterTable(): void {
    if (!this.parameterTableColumns.length) return;
    this.parameterTables.push({ table_name: ' ' + (this.parameterTables.length + 1), data: [this.createEmptyTableRow()] });
  }

  private onGridAction(key: string, row: any): void {
    if (key === 'edit' || key === 'view') {
      this.openEditPopup(row);
      if (key === 'view') this.title = 'View Parameter Value';
    } else if (key === 'delete') {
      this.openDeleteDialog(row);
    }
  }

  headerTitle: string = '';
  
  openEditPopup(row: any): void {
    console.log('Opening edit popup for row:', row);
    this.isEditMode = true;
    this.selectedRow = row;
    this.title = 'Edit Parameter Value';
    this.errorMessage = '';

    this.editFormData = {
      ship_id: [parseInt(row.equipment_ship_id)],
      equipment: [parseInt(row.equipment)],
      satellite_units: row.satellite_unit,
      trialtypes: row.trialtypes,
    };
    this.loadEditDependentOptions(() => {
      this.applyTrialTypeSelection(row.trialtypes, row.trialtypes_name, row.parameter_tables ?? []);
      this.showCreateLayout = true;
      this.cdr.detectChanges();
    });
    
  }

  triggerOilModal(key: string, rowData?: any, headerTitle?: string): void {
    this.headerTitle = headerTitle || '';
    if (key === 'add') {
      this.openAddPopup();
    } else if (key === 'edit' || key === 'view') {
      this.openEditPopup(rowData);
      if (key === 'view') this.title = 'View Parameter Value';
    }
  }

  submitFromCard(): void {
    const formData = this.addForm?.submitForm();
    const trialTypeId = formData?.trialtypes;

    if (!this.resolveTrialTypeConfig(trialTypeId)) {
      const label = this.getTrialTypeLabel(trialTypeId);
      this.toastService.showError(
        label
          ? `Cannot save: "${label}" has no parameter table template.`
          : 'Please select a supported trial type before saving.',
      );
      return;
    }

    if (!this.parameterTableColumns.length) {
      this.applyTrialTypeSelection(trialTypeId, this.getTrialTypeLabel(trialTypeId));
    }

    if (!this.parameterTableColumns.length) {
      this.toastService.showError('Parameter table columns are not configured for the selected trial type.');
      return;
    }

    const PrimaryparameterTables = this.parameterTables;
    const sendableData = this.parameterTables.map((table) =>
      this.matrixConverter(
        this.ableIdGenerator(table.table_name),
        table.table_name,
        this.columnConfig[formData?.trialtypes]?.columns,
        table.data
      )
    );
    sendableData.unshift(this.columnConfig[formData?.trialtypes]?.fristTable);
    const schema: any = {
      "formId": "dieseleEnginePreTrialInformationProforma",
      
      "sourceFile": "diesel-engine-pre-trial-information-proforma.html",
      "sections": [
        {
          "id": "sectionone",
          "title": "DIESEL ENGINE PRE-TRIAL INFORMATION PROFORMA",
          "sectionType": "hybrid",
          "sectionGroup": {
           
            "tables_1": [...tables_1],
            "tables_2": [...sendableData]
          }
        }
      ]
    }
    console.log( 'schema',schema);
    const payload: any = {
      equipments: formData?.equipment,
      satellite_unit: formData?.satellite_units,
      trialtypes: formData?.trialtypes,
      parameter_tables: PrimaryparameterTables,
      schema: schema
    }
    if (this.isEditMode) {
      payload['id'] = (this.selectedRow?.id as any) ?? null;
    }
    // console.log( 'payload',schema);
    this.apiService.post('/master/parameter-values/', payload,).subscribe((res:any) => {
      this.toastService.showSuccess('Parameter Value saved successfully');
      this.isEditMode = false;
      this.closeAddPopup();
      this.refreshTable();
      this.cdr.detectChanges();
    });
  }
  
private ableIdGenerator(table_name: string): string {
  return 'table_' + table_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
  openDeleteDialog(row: any): void {
    this.deleteId = row?.id;
    this.deleteName = row?.name || 'this parameter value';
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
    
    this.apiService.post(`master/parameter-values/${this.deleteId}/`, { id: this.deleteId, active: 3 }).subscribe({
      next: () => {
        this.deleteLoading = false;
        this.closeDeleteDialog();
        this.refreshTable();
        this.toastService.showSuccess('Parameter Value deleted successfully');
      },
      error: (err: any) => {
        console.error('Error deleting parameter value:', err);
        this.deleteLoading = false;
        const errorMsg = err?.error?.detail || 'Failed to delete. Please try again.';
        this.toastService.showError(errorMsg);
      },
    });
  }

  private refreshTable(): void {
    if (this.paginateTable) {
      this.paginateTable.refreshTable();
    }
  }

  private loadTrialUnitsAndShips(): void {
    forkJoin({
      satelliteUnits: this.apiService.getDropdownData('master/satellite-units/', { labelKey: 'name', valueKey: 'id' }, { trial_unit: 8 }),
      ships: this.apiService.getDropdownData('master/ships/', { labelKey: 'name', valueKey: 'id' })
    }).subscribe({
      next: (res: any) => {
        const satelliteUnits = res.satelliteUnits;
        const ships = res.ships;
        this.updateFieldOptions('satellite_units', satelliteUnits);
        this.updateFieldOptions('ship_id', ships);
      }      
    });
  }

  private loadEquipmentOptions(shipIds?: any, onDone?: () => void): void {
    const ids = this.normalizeIdArray(shipIds);
    if (!ids.length) {
      this.equipmentOptions = [];
      this.updateFieldOptions('equipment', []);
      onDone?.();
      return;
    }

    this.apiService.getDropdownData('master/equipments/?trial_unit=8', equipmentHtml, { ship: ids }).subscribe({
      next: (res: any) => {
        this.equipmentOptions = res;
        this.updateFieldOptions('equipment', res);
        onDone?.();
      }
    });

  }

  onFormSelectChange(eventOrKey: { key?: string; value?: any; form?: any; formData?: any; selectedOption?: any } | string, value?: any): void {
    const key = typeof eventOrKey === 'string' ? eventOrKey : eventOrKey?.key;
    const selectedValue = typeof eventOrKey === 'string' ? value : eventOrKey?.value;
    if (!key) return;

    if (key === 'ship_id') {
      this.editFormData = {
        ...(typeof eventOrKey === 'string' ? this.editFormData : eventOrKey.formData ?? eventOrKey.form ?? this.editFormData),
        ship_id: selectedValue,
        equipment: [],
      };
      this.resetParameterTableState();
      this.loadEquipmentOptions(selectedValue, () => {
        setTimeout(() => this.addForm?.patchFormPartial({ equipment: [] }));
      });
      return;
    }

    if (key === 'satellite_units') {
      this.editFormData = {
        ...(typeof eventOrKey === 'string' ? this.editFormData : eventOrKey.formData ?? eventOrKey.form ?? this.editFormData),
        satellite_units: selectedValue,
        trialtypes: '',
      };
      this.resetParameterTableState();
      this.updateFieldOptions('trialtypes', this.trialType);
      setTimeout(() => this.addForm?.patchFormPartial({ trialtypes: '' }));
      return;
    }

    if (key === 'trialtypes') {
      const selectedOption =
        typeof eventOrKey === 'string' ? null : eventOrKey?.selectedOption;
      const label = selectedOption?.label ?? this.getTrialTypeLabel(selectedValue);
      this.applyTrialTypeSelection(selectedValue, label);
    }
  }

  private loadEditDependentOptions(onDone: () => void): void {
    let pending = 0;
    const done = () => {
      pending -= 1;
      if (pending === 0) onDone();
    };

    const shipIds = this.normalizeIdArray(this.editFormData.ship_id);
    if (shipIds.length) {
      pending += 1;
      this.loadEquipmentOptions(shipIds, done);
    } else {  
      this.updateFieldOptions('equipment', []);
    }

    this.updateFieldOptions('trialtypes', this.trialType);

    if (pending === 0) onDone();
  }

  private updateFieldOptions(fieldKey: string, options: { label: string; value: any }[]): void {
    this.formConfigForNewDetails = this.formConfigForNewDetails.map((field) =>
      field.key === fieldKey ? { ...field, options: [...options] } : field,
    );
  }

  private normalizeIdArray(value: any): any[] {
    if (value === null || value === undefined || value === '') return [];
    if (Array.isArray(value)) {
      return value
        .map((item) => this.normalizeSingleId(item))
        .filter((item) => item !== null && item !== undefined && item !== '');
    }
    if (typeof value === 'string' && value.includes(',')) {
      return value
        .split(',')
        .map((item) => this.normalizeSingleId(item.trim()))
        .filter((item) => item !== null && item !== undefined && item !== '');
    }
    const id = this.normalizeSingleId(value);
    return id === null || id === undefined || id === '' ? [] : [id];
  }

  private normalizeSingleId(value: any): any {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'object') return value.id ?? value.value ?? null;
    return value;
  }
 
}
