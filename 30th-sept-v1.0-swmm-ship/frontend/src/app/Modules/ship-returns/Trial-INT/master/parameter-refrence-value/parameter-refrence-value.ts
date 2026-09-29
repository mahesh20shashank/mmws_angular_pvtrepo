import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { AgActionCellComponent, FormCardComponent, ReusableDeleteDialogComponent } from '../../ui/master-compat';
import { ApiService } from '../../api.service';
import { overallVibrationConfig } from './table.config';
import { DynamicMatrixTableComponent } from '../../angulerFromconverting/resuable-table-matrix';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
import { environment } from '../../../../../../environments/environment';
import { ToastService } from '../../services/toast.service';
import { forkJoin } from 'rxjs';
import { equipmentHtml } from '../../ApiEndPoints';

@Component({
  selector: 'app-parameter-refrence-value',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PaginateTableComponent,
    DynamicMatrixTableComponent,
    FormCardComponent,
    AddFormComponent,
    ReusableDeleteDialogComponent,
  ],
  templateUrl: './parameter-refrence-value.html',

})
export class ParameterRefrenceValue {
  @ViewChild('addForm') addFormComponent!: AddFormComponent;
  @ViewChild('pagination') pagination!: PaginateTableComponent;

  @Input() showFormActionButtons: boolean = true;
  @Input() disableSave: boolean = false;
  @Input() formConfig: any[] = [];

  overallVibrationConfig = this.cloneVibrationConfig();
  matrixData: any = {};
  currentjson: any;
  overallData: any;

  editFormData: any = {};
  isEditMode = false;
  title = 'View Details';
  limits: any = {};

  showCreateLayout = false;
  showDeleteDialog = false;
  deleteId: number | null = null;
  deleteName = '';
  deleteLoading = false;
  trialType: any[] = [];

  parameterRefData = [
    {
      field: 'ship_class.name',
      headerName: 'Class of Ship',
      flex: 1,
      minWidth: 220,
    },
    {
      field: 'ship.name',
      headerName: 'Ship',
      filter: 'agTextColumnFilter',
      flex: 1,
      minWidth: 220,
    },
    {
      field: 'equipment.name',
      headerName: 'Equipment Code',
      filter: 'agTextColumnFilter',
      flex: 1,
      minWidth: 220,
    },
    {
      field: 'trial_type.name',
      headerName: 'Table/Section Type',
      filter: 'agTextColumnFilter',
      flex: 1,
      minWidth: 220,
    },
    {
      headerName: 'Action',
      field: 'actions',
      minWidth: 80,
      width: 80,
      maxWidth: 80,
      sortable: false,
      filter: false,
      pinned: 'right' as 'right',
      cellRenderer: AgActionCellComponent,
      cellRendererParams: {
        actionDisplayMode: 'float',
        onAction: (k: string, r: any) => this.onGridAction(k, r),
        actions: [
          { key: 'view', label: 'View', iconClass: 'fa fa-eye', btnClass: 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' },
          // { key: 'edit', label: 'Edit', iconClass: 'fa fa-pencil' },
          // { key: 'delete', label: 'Delete', iconClass: 'fa fa-trash' },
        ],
      },
    },
  ];

  addButtons = [
    // { label: 'Create', key: 'add', show: true, cls: 'bg-blue-900 text-white' },
  ];

  tableLoading: boolean = false;
  shipClassList: any;
  shiplist: any;
  equipmentList: any;
  sectionList: any;
  items: any;
  currentEditRow: any = null;
  selectedShipClassId: any = '';
  selectedShipIds: any[] = [];
  selectedEquipmentIds: any[] = [];
  selectedSectionId: any = '';
  showMatrixForAdd = false;

  constructor(
    private apiService: ApiService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) { }

  ngOnInit() {
    this.loadShipClasses();
    this.loadSections();
    this.loadTrialTypes();
  }

  // ===================== DROPDOWN LOADING =====================
  loadShipClasses() {
    const kayOptions = { labelKey: 'name', valueKey: 'id' };
    this.apiService.getDropdownData('/master/ship-classes/', kayOptions).subscribe({
      next: (res: any) => {
        this.shipClassList = res;
        if (!this.isEditMode) {
          this.shiplist = [];
          this.equipmentList = [];
          // this.sectionList = [];
        }
        this.buildFormConfig();
      },
      error: (err) => console.error('Ship class dropdown API Error:', err),
    });
  }

  loadShipsByClass(shipClassId: any) {
    const kayOptions = { labelKey: 'name', valueKey: 'id' };
    this.apiService.getDropdownData('master/ships/', kayOptions, { shipClass: shipClassId }).subscribe({
      next: (res: any) => {
        this.shiplist = res;
        this.buildFormConfig();
      },
      error: (err) => console.error('Ship dropdown API Error:', err),
    });
  }

  loadEquipmentsByShip(shipId: any) {
    const kayOptions = { labelKey: 'name', valueKey: 'id' };
    const params: any = {
      ship: shipId,
    };

    if (this.selectedSectionId) {
      params.section = this.selectedSectionId;
    }
    this.apiService.getDropdownData('master/equipments/', equipmentHtml, params).subscribe({
      next: (res: any) => {
        this.equipmentList = this.isEditMode
          ? this.ensureSelectedOptions(
            res,
            this.selectedEquipmentIds,
            this.getEquipmentLabel(this.currentEditRow),
          )
          : res;
        this.buildFormConfig();
        this.patchFormAfterConfigChange({
          ...(this.addFormComponent?.getFormSnapshot?.() ?? {}),
          equipment_ids: this.selectedEquipmentIds,
        });
      },
      error: (err) => console.error('Equipment dropdown API Error:', err),
    });
  }

  loadSectionsByEquipment(equipmentId: any) {
    const kayOptions = { labelKey: 'name', valueKey: 'id' };
    this.apiService.getDropdownData('master/sections/', kayOptions, { equipment: equipmentId }).subscribe({
      next: (res: any) => {
        this.sectionList = res;
        this.showMatrixForAdd = true;
        this.buildFormConfig();
      },
      error: (err) => console.error('Section dropdown API Error:', err),
    });
  }

  loadSections() {
    const kayOptions = { labelKey: 'name', valueKey: 'id' };
    this.apiService.getDropdownData('master/sections/', kayOptions).subscribe({
      next: (res: any) => {
        this.sectionList = this.ensureSelectedOption(
          this.normalizeDropdownOptions(res),
          this.getSectionId(this.currentEditRow),
          this.getSectionLabel(this.currentEditRow),
        );
        console.log('Sections loaded:', this.sectionList);
        this.showMatrixForAdd = true;
        this.buildFormConfig();
        setTimeout(() => {
          this.addFormComponent?.patchFormPartial(this.editFormData);
        }, 0);
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Section dropdown API Error:', err),
    });
  }



  private loadEditCascadeDropdowns() {
    if (!this.selectedShipClassId || !this.selectedShipIds.length) {
      return;
    }
    const kayOptions = { labelKey: 'name', valueKey: 'id' };
    const equipmentParams: any = { ship: this.selectedShipIds };
    if (this.selectedSectionId) {
      equipmentParams.section = this.selectedSectionId;
    }

    forkJoin({
      ships: this.apiService.getDropdownData('master/ships/', kayOptions, { shipClass: this.selectedShipClassId }),
      equipments: this.apiService.getDropdownData('master/equipments/', equipmentHtml, equipmentParams),
    }).subscribe({
      next: (res: any) => {
        this.shiplist = this.ensureSelectedOptions(res.ships, this.selectedShipIds, this.currentEditRow?.ship?.name);
        this.equipmentList = this.ensureSelectedOptions(
          res.equipments,
          this.selectedEquipmentIds,
          this.getEquipmentLabel(this.currentEditRow),
        );
        this.buildFormConfig();
        setTimeout(() => {
          this.addFormComponent?.patchFormPartial(this.editFormData);
          this.cdr.detectChanges();
        }, 0);
      },
      error: (err) => console.error('Edit dropdown API Error:', err),
    });
  }

  // ===================== FORM CONFIGURATION =====================
  buildFormConfig() {
    const sectionOptions = this.isEditMode
      ? this.ensureSelectedOption(
        this.sectionList,
        this.editFormData?.section_id,
        this.getSectionLabel(this.currentEditRow),
      )
      : this.sectionList;
    const config: any[] = [

      {
        label: 'Select Class of Ship',
        type: 'select',
        key: 'ship_class',
        placeholder: 'Select Class of Ship',
        required: true,
        options: this.shipClassList,
      },
    ];
    config.push({
      label: 'Select Trial Type',
      type: 'select',
      key: 'trial_type_id',
      placeholder: 'Select Trial Type',
      required: true,
      options: this.trialType || [],
    });

    if (this.isEditMode || this.selectedShipClassId) {
      config.push({
        label: 'Select Ship',
        type: 'select-multiple',
        key: 'ship_ids',
        placeholder: 'Select Ship',
        required: true,
        options: this.shiplist,
      });
    }

    config.push({
      label: 'Select Section',
      type: 'select',
      key: 'section_id',
      placeholder: 'Select Section',
      required: true,
      options: sectionOptions,
    });

    if (this.isEditMode || this.selectedShipIds.length) {
      config.push({
        label: 'Select Equipment',
        type: 'select-multiple',
        key: 'equipment_ids',
        placeholder: 'Select Equipment',
        required: true,
        options: this.equipmentList,
      });
    }

    this.formConfig = config;
  }

  // ===================== MATRIX TABLE DATA HANDLING =====================
  onTableDataChange(id: any, data: any) {
    // Same shape as toFlatData() spread: { 0: row0, 1: row1, ... }
    this.matrixData = data;
  }

  setMatrixData(tableId: string, apiData: any) {
    if (!this.currentjson || !apiData) return;

    const table = this.currentjson.find((t: any) => t.id === tableId);
    if (!table) return;

    this.matrixData = Array.isArray(apiData) ? { ...apiData } : { ...apiData };

    table.rows = table.rows.map((row: any, rowIndex: number) => {
      const rowSource = this.matrixData[rowIndex] ?? {};
      return {
        ...row,
        cells: row.cells.map((cell: any) => {
          if (cell.type !== 'input' || !cell.key) return cell;
          const val = rowSource[cell.key];
          return {
            ...cell,
            value: val !== undefined && val !== null ? String(val) : '',
          };
        }),
      };
    });

    this.cdr.detectChanges();
  }

  // ===================== GRID ACTIONS =====================
  onGridAction(actionKey: string, rowData: any) {
    if (actionKey === 'view' || actionKey === 'edit') {
      this.isEditMode = actionKey === 'edit';
      this.title = actionKey === 'view' ? 'View Details' : 'Overall Vibration Values (mm/sec)';
      this.items = rowData;
      this.currentEditRow = rowData;
      const trialTypeId = this.getSelectedId(rowData.trial_type_id ?? rowData.trial_type);
      const sectionId = this.getSectionId(rowData);

      this.editFormData = {
        ship_class: this.getSelectedId(rowData.ship_class),
        ship_ids: this.toIdArray(rowData.ship_ids ?? rowData.ships ?? rowData.ship),
        equipment_ids: this.toIdArray(rowData.equipment_ids ?? rowData.equipments ?? rowData.equipment),
        section_id: sectionId,
        trial_type_id: trialTypeId,
      };
      this.selectedShipClassId = this.getSelectedId(rowData.ship_class);
      this.selectedShipIds = this.toIdArray(rowData.ship_ids ?? rowData.ships ?? rowData.ship);
      this.selectedEquipmentIds = this.toIdArray(rowData.equipment_ids ?? rowData.equipments ?? rowData.equipment);
      this.selectedSectionId = sectionId;
      this.showMatrixForAdd = true;

      this.overallVibrationConfig = this.cloneVibrationConfig();
      this.currentjson = this.overallVibrationConfig.tables;

      // Get the first table ID (adjust if you have multiple tables)
      const tableId = this.overallVibrationConfig.tables[0]?.id;
      if (tableId) {
        const apiLimits = this.getVibrationLimits(rowData);
        this.setMatrixData(tableId, apiLimits);
      }

      this.showCreateLayout = true;
      this.loadEditCascadeDropdowns();
    } else if (actionKey === 'delete') {
      this.openDeleteDialog(rowData);
    }
  }

  trackByTable = (_: number, table: any) => table?.id ?? _;

  // ===================== CREATE / EDIT SUBMIT =====================
  buttonClick(event: any) {
    this.showCreateLayout = true;
    this.overallVibrationConfig = this.cloneVibrationConfig();
    this.currentjson = this.overallVibrationConfig.tables;
    this.isEditMode = false;
    this.items = null;
    this.editFormData = {};
    this.matrixData = {};
    this.selectedShipClassId = '';
    this.selectedShipIds = [];
    this.selectedEquipmentIds = [];
    this.selectedSectionId = '';
    this.showMatrixForAdd = false;
    this.shiplist = [];
    this.equipmentList = [];
    this.buildFormConfig();
    setTimeout(() => {
      this.addFormComponent?.patchFormPartial(this.editFormData);
      this.cdr.detectChanges();
    }, 0);
  }

  handleSubmit() {
    const formValues = this.addFormComponent.submitForm();
    const payload: any = {
      ship_class_id: formValues.ship_class,
      ship_ids: this.toIdArray(formValues.ship_ids),
      equipment_ids: this.toIdArray(formValues.equipment_ids),
      section_id: formValues.section_id,
      trial_type_id: formValues.trial_type_id,
      vibration_limits: this.matrixData,
    };

    if (this.items?.id) {
      payload.id = this.items.id;
    }

    this.apiService.post('/master/overall-vibration-linkage/', payload).subscribe({
      next: () => {
        this.toast.showSuccess('Saved successfully');
        this.showCreateLayout = false;
        this.pagination.refreshTable();
      },
      error: () => {
        this.toast.showError('Failed to save');
      },
    });
  }

  // ===================== CASCADE SELECT HANDLER =====================
  handleSelectChange(event: any) {
    const key = event?.key;
    const selectedId = this.getSelectedId(event?.value);
    const formSnapshot = event?.form ?? event?.formValue ?? this.addFormComponent?.getFormSnapshot?.() ?? {};

    if (key === 'ship_class') {
      this.selectedShipClassId = selectedId;
      this.selectedShipIds = [];
      this.selectedEquipmentIds = [];
      this.shiplist = [];
      this.equipmentList = [];
      this.showMatrixForAdd = false;
      this.buildFormConfig();
      this.patchFormAfterConfigChange({
        ...formSnapshot,
        ship_class: selectedId,
        ship_ids: [],
        equipment_ids: [],
      });
      if (selectedId) this.loadShipsByClass(selectedId);
      return;
    }

    if (key === 'ship_ids') {
      this.selectedShipIds = this.toIdArray(event?.value);
      this.selectedEquipmentIds = [];
      this.equipmentList = [];
      this.showMatrixForAdd = false;
      this.buildFormConfig();
      this.patchFormAfterConfigChange({
        ...formSnapshot,
        ship_ids: this.selectedShipIds,
        equipment_ids: [],
      });
      if (this.selectedShipIds.length) this.loadEquipmentsByShip(this.selectedShipIds);
      return;
    }

    if (key === 'section_id') {
      this.selectedSectionId = selectedId;
      this.selectedEquipmentIds = [];
      this.equipmentList = [];
      this.showMatrixForAdd = false;
      this.buildFormConfig();
      this.patchFormAfterConfigChange({
        ...formSnapshot,
        section_id: selectedId,
        equipment_ids: [],
      });
      if (this.selectedShipIds.length) this.loadEquipmentsByShip(this.selectedShipIds);
      return;
    }

    if (key === 'equipment_ids') {
      this.selectedEquipmentIds = this.toIdArray(event?.value);
      this.showMatrixForAdd = false;
      this.buildFormConfig();
      this.patchFormAfterConfigChange({
        ...formSnapshot,
        equipment_ids: this.selectedEquipmentIds,
      });
    }
  }

  // ===================== DELETE DIALOG =====================
  openDeleteDialog(row: any): void {
    this.deleteId = row?.id ?? null;
    this.deleteName = row?.equipment?.name || row?.ship?.name || 'this parameter reference value';
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
      .post(`/master/overall-vibration-linkage/`, { id: this.deleteId, active: 3 })
      .subscribe({
        next: () => {
          this.deleteLoading = false;
          this.closeDeleteDialog();
          this.pagination.refreshTable();
          this.toast.showSuccess('Deleted successfully');
        },
        error: (err: any) => {
          console.error('Delete failed:', err);
          this.deleteLoading = false;
          this.toast.showError(err?.error?.detail || 'Failed to delete');
        },
      });
  }

  // ===================== UTILITIES =====================
  private getSelectedId(value: any): any {
    if (value && typeof value === 'object') {
      return value.id ?? value.value ?? '';
    }
    return value ?? '';
  }

  private getSectionId(rowData: any): any {
    return this.getSelectedId(
      rowData?.section_id ??
      rowData?.section ??
      rowData?.section_detail ??
      rowData?.equipment?.section_id ??
      rowData?.equipment?.section,
    );
  }

  private getSectionLabel(rowData: any): string {
    const source =
      rowData?.section ??
      rowData?.section_detail ??
      rowData?.equipment?.section ??
      rowData?.equipment?.section_detail;
    if (source && typeof source === 'object') {
      return source.name ?? source.label ?? source.title ?? String(this.getSelectedId(source));
    }
    return source ? String(source) : '';
  }

  private getEquipmentLabel(rowData: any): string {
    const source = rowData?.equipment ?? rowData?.equipments;
    if (Array.isArray(source)) {
      return source
        .map((item: any) => item?.name ?? item?.label ?? item?.title)
        .filter(Boolean)
        .join(', ');
    }
    if (source && typeof source === 'object') {
      return source.name ?? source.label ?? source.title ?? String(this.getSelectedId(source));
    }
    return source ? String(source) : '';
  }

  private toIdArray(value: any): any[] {
    if (Array.isArray(value)) {
      return value.map((item) => this.getSelectedId(item)).filter((item) => item !== '');
    }
    const id = this.getSelectedId(value);
    return id === '' ? [] : [id];
  }

  private ensureSelectedOption(
    options: any[] = [],
    selectedId: any,
    selectedLabel?: string,
  ): any[] {
    const list = Array.isArray(options) ? [...options] : [];
    if (!selectedId) return list;
    const exists = list.some((opt: any) => String(opt?.value) === String(selectedId));
    if (!exists) {
      list.unshift({ value: selectedId, label: selectedLabel || String(selectedId) });
    }
    return list;
  }

  private ensureSelectedOptions(
    options: any[] = [],
    selectedIds: any[] = [],
    selectedLabel?: string,
  ): any[] {
    let list = Array.isArray(options) ? [...options] : [];
    selectedIds.forEach((selectedId) => {
      if (!selectedId) return;
      const exists = list.some((opt: any) => String(opt?.value) === String(selectedId));
      if (!exists) {
        list = [{ value: selectedId, label: selectedLabel || String(selectedId) }, ...list];
      }
    });
    return list;
  }

  private getVibrationLimits(rowData: any): any {
    return (
      rowData?.vibration_limits ??
      rowData?.vibrationLimits ??
      rowData?.limits ??
      {}
    );
  }

  private normalizeDropdownOptions(options: any[] = []): any[] {
    return (Array.isArray(options) ? options : [])
      .map((item: any) => ({
        label: item?.label ?? item?.name ?? item?.title ?? '',
        value: item?.value ?? item?.id ?? '',
      }))
      .filter((item: any) => item.label !== '' && item.value !== '');
  }

  private patchFormAfterConfigChange(values: Record<string, any>): void {
    setTimeout(() => {
      this.addFormComponent?.patchFormPartial(values);
      this.cdr.detectChanges();
    }, 0);
  }

  private cloneVibrationConfig(): any {
    const config = JSON.parse(JSON.stringify(overallVibrationConfig));
    config.tables?.forEach((table: any) => {
      table.rows?.forEach((row: any) => {
        row.cells?.forEach((cell: any) => {
          if (cell.type === 'input') {
            cell.value = '';
          }
        });
      });
    });
    return config;
  }

  private loadTrialTypes(): void {
    this.apiService.get('master/trial-types/').subscribe({
      next: (res: any) => {
        const data = res?.data || res || [];
        const options = data.map((tt: any) => ({
          label: tt?.name || tt?.trial_type_name || 'Unknown',
          value: tt?.id || tt?.trial_type_id || ''
        }));
        this.trialType = options;
        this.buildFormConfig();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Trial Types API Error:', err);
        this.trialType = [];
        this.buildFormConfig();
        this.cdr.detectChanges();
      }
    });
  }
}
