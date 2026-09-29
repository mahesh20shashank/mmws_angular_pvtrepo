import { ChangeDetectorRef, Component, OnInit, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgActionCellComponent, FormCardComponent, ReusableInputTableComponent, ReusableTableColumn } from '../../ui/master-compat';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { MultiSelectDropdownComponent } from '../../ui/multiselect';
import { SelectComponent } from '../../ui/select.component';
import { InputComponent } from '../../ui/input.component';
import { equipmentHtml } from '../../ApiEndPoints';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { ApiService } from '../../api.service';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { AppService } from '../../../../../Core/services/app/app.service';
@Component({
  selector: 'app-equipment-oil-mapping',
  standalone: true,
  imports: [CommonModule, FormsModule, PaginateTableComponent, FormCardComponent, MultiSelectDropdownComponent, SelectComponent, InputComponent, ReusableInputTableComponent],
  templateUrl: './equipment-oil-mapping.html',
  styleUrl: './equipment-oil-mapping.css',
  encapsulation: ViewEncapsulation.None,
  providers: [ApiService],
})
export class EquipmentOilMapping implements OnInit {
  showCreateLayout = false;
  classDropdownOpen = false;
  shipDropdownOpen = false;
  equipmentDropdownOpen = false;
  htmlTag = `
    <div class="py-0.5">
      <div class="text-sm font-semibold leading-tight text-white">{{item.name}}</div>
      <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-snug">
        <span class="inline-flex items-center gap-1">
          <span class="font-medium uppercase tracking-wide text-white/45">Nomenclature</span>
          <span class="text-white/70">{{item.nomenclature || '-'}}</span>
        </span>
        <span class="text-white/20" aria-hidden="true">·</span>
        <span class="inline-flex items-center gap-1">
          <span class="font-medium uppercase tracking-wide text-white/45">Model</span>
          <span class="text-white/70">{{item.model || '-'}}</span>
        </span>
        <span class="text-white/20" aria-hidden="true">·</span>
        <span class="inline-flex items-center gap-1">
          <span class="font-medium uppercase tracking-wide text-white/45">Serial</span>
          <span class="text-white/70">{{item.serial_no || '-'}}</span>
        </span>
      </div>
    </div>
  `;

  addButtons = [
    {
      label: 'Create Oil Data',
      key: 'add',
      show: true,
      cls: 'bg-blue-900 text-white'
    }
  ];

  shipClassOptions: { label: string; value: number }[] = [];  // master/ship-classes

  shipOptions: { label: string; value: number }[] = [];  //  master/ships

  equipmentOptions: { label: string; value: number; htmlTag?: string }[] = [];  // master/equipments

  selectedShipClasses: number[] = [];
  selectedShips: number[] = [];
  selectedEquipments: number[] = [];

  selectedOilShortName = '';
  selectedOilFullName = '';
  selectedOilType = 'lub-oil';

  get selectedOilTypeLabel(): string {
    return this.selectedOilType === 'lub-oil' ? 'LUB OIL' : 'HYDRAULIC OIL';
  }

  isEditMode = false;
  editingOilId: number | null = null;

  selectedOilName = 'jsghd-abc';
  oilNameOptions = [
    { label: 'jsghd (abc)', value: 'jsghd-abc' },
    { label: 'jsghd (abc)', value: 'jsghd-abc2' },
  ];

  availableOilDataOptions: { label: string; value: number; typeOfOil: number }[] = [];  // master/oil-data
  selectedOilDataId: number | null = null;

  oilParameters = [
    { key: 'viscosity_index', value: 'VISCOSITY INDEX' },
    { key: 'viscosity_40', value: 'VISCOSITY @ 40 °C' },
    { key: 'viscosity_100', value: 'VISCOSITY @ 100 °C' },
    { key: 'appearance', value: 'APPEARANCE (Report)' },
    { key: 'water_content', value: 'WATER CONTENT' },
    { key: 'tan', value: 'TOTAL ACID NUMBER (TAN)' },
    { key: 'hexane_insolubles', value: 'HEXANE INSOLUBLES' },
    { key: 'toluene_insolubles', value: 'TOULENE INSOLUBLES' },
    { key: 'flash_point', value: 'FLASH POINT' },
    { key: 'salt_content', value: 'SALT CONTENT' },
    { key: 'contamination', value: 'CONTAMINATION' },
    { key: 'aluminium', value: 'ALUMINIUM, Al' },
    { key: 'barium', value: 'BARIUM, Ba' },
    { key: 'boron', value: 'BORON, B' },
    { key: 'calcium', value: 'CALCIUM, Ca' },
    { key: 'chromium', value: 'CHROMIUM, Cr' },
    { key: 'copper', value: 'COPPER, Cu' },
    { key: 'iron', value: 'IRON, Fe' },
    { key: 'lead', value: 'LEAD, Pb' },
    { key: 'magnesium', value: 'MAGNESIUM, Mg' },
    { key: 'nickel', value: 'NICKEL, Ni' },
    { key: 'phosphorous', value: 'PHOSPHOSOUS, P' },
    { key: 'silicon', value: 'SILICON, Si' },
    { key: 'silver', value: 'SILVER, Ag' },
    { key: 'sodium', value: 'SODIUM, Na' },
    { key: 'tin', value: 'TIN, Sn' },
    { key: 'vanadium', value: 'VANADIUM, V' },
    { key: 'zinc', value: 'ZINC, Zn' },
    { key: 'pq_index', value: 'PQ INDEX' },
    { key: 'viscosity_0', value: 'VISCOSITY @ 0 °C' },
    { key: 'viscosity_20', value: 'VISCOSITY @ 20 °C' },
    { key: 'viscosity_50', value: 'VISCOSITY @ 50 °C' },
    { key: 'tbn', value: 'TOTAL BASE NUMBER (TBN)' }
  ];

  testMethods = [
    { key: 'astm_d_2270', value: 'ASTM D 2270' },
    { key: 'astm_d_445', value: 'ASTM D 445' },
    { key: 'visual', value: 'Visual' },
    { key: 'astm_d_95', value: 'ASTM D95' },
    { key: 'astm_d_893', value: 'ASTM D 893' },
    { key: 'astm_d_974', value: 'ASTM D 974' },
    { key: 'astm_d_92', value: 'ASTM D 92' },
    { key: 'astm_d_3230', value: 'ASTM D 3230' },
    { key: 'iso_4406', value: 'ISO 4406' },
    { key: 'astm_d_6595', value: 'ASTM D 6595' },
    { key: 'crackle_test', value: 'By Crackle' },
    { key: 'astm_d_455', value: 'ASTM D455' },
    { key: 'astm_d_5185', value: 'ASTM D5185' },
    { key: 'is_1448_p25', value: 'IS 1448 P25' },
    { key: 'astm_d_644', value: 'ASTM D644' }
  ];

  units = [
    { key: 'calc', value: 'Calc.' },
    { key: 'cst', value: 'cST' },
    { key: 'percent_vol', value: '% of vol.' },
    { key: 'mg_koh_g', value: 'mg KOH/g' },
    { key: 'percent_wt', value: '% wt' },
    { key: 'percent_c', value: '% C' },
    { key: 'ppm', value: 'PPM' },
    { key: 'nas', value: 'NAS' },
    { key: 'celsius', value: '°C' },
    { key: 'none', value: '-' }
  ];

  get submitButtonText(): string {
    return this.modalType === 'oil-data' ? 'Submit Oil Data' : 'Submit Mapping';
  }

  basicOilPropertiesColumns: ReusableTableColumn[] = [
    { field: 'sr_no', header: 'Ser', align: 'center' },
    { field: 'test', header: 'Type of Test', fieldType: 'select', options: this.oilParameters.map(p => ({ label: p.value, value: p.key })) },
    { field: 'method', header: 'Testing Method', fieldType: 'select', options: this.testMethods.map(m => ({ label: m.value, value: m.key })) },
    { field: 'unit', header: 'Measurement Unit', fieldType: 'select', options: this.units.map(u => ({ label: u.value, value: u.key })) },
    { field: 'range', header: 'Acceptable Range', fieldType: 'text' }
  ];

  advanceOilPropertiesColumns: ReusableTableColumn[] = [
    { field: 'sr_no', header: 'Ser', align: 'center' },
    { field: 'test', header: 'Type of Test', fieldType: 'select', options: this.oilParameters.map(p => ({ label: p.value, value: p.key })) },
    { field: 'method', header: 'Testing Method', fieldType: 'select', options: this.testMethods.map(m => ({ label: m.value, value: m.key })) },
    { field: 'unit', header: 'Measurement Unit', fieldType: 'select', options: this.units.map(u => ({ label: u.value, value: u.key })) },
    { field: 'range', header: 'Acceptable Range', fieldType: 'text' }
  ];

  basicOilProperties: { sr_no: number; test: string; method: string; unit: string; range: string; id?: string }[] = [
    { sr_no: 1, test: '', method: '', unit: '', range: '' }
  ];

  advanceOilProperties: { sr_no: number; test: string; method: string; unit: string; range: string; id?: string }[] = [
    { sr_no: 1, test: '', method: '', unit: '', range: '' }
  ];

  originalBasicProperties: { sr_no: number; test: string; method: string; unit: string; range: string; id?: string }[] = [];
  originalAdvanceProperties: { sr_no: number; test: string; method: string; unit: string; range: string; id?: string }[] = [];

  columnOilData = [
    { headerName: 'Ser', valueGetter: (params: any) => (params.node?.rowIndex ?? params.rowIndex ?? 0) + 1, width: 80, minWidth: 70 },
    { field: 'oil_name', headerName: 'Oil Name', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
    { field: 'full_name', headerName: 'Full Name', filter: 'agTextColumnFilter', flex: 1, minWidth: 200 },
    { field: 'typeOfOil', headerName: 'Oil Type', filter: 'agTextColumnFilter', minWidth: 120, valueGetter: (params: any) => this.getOilTypeDisplay(params.data?.typeOfOil) },
    { headerName: 'Action', field: 'actions', minWidth: 160, sortable: false, filter: false, cellRenderer: AgActionCellComponent, cellRendererParams: { actionDisplayMode: 'float', onMainAction: (row: any) => console.log('Main action', row), onAction: (k: string, r: any) => this.triggerOilModal(k, r, 'Oil Details'), actions: [{ key: 'view', label: 'View', iconClass: 'fa fa-eye', btnClass: 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' }, { key: 'edit', label: 'Edit', iconClass: 'fa fa-edit', btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200' }, { key: 'delete', label: 'Delete', iconClass: 'fa fa-trash', btnClass: 'bg-red-100 text-red-600 hover:bg-red-200' }] } }
  ];
  columnOilvsEquipmentMapping = [
    { headerName: 'Ser', valueGetter: (params: any) => (params.node?.rowIndex ?? 0) + 1, width: 100, minWidth: 70, pinned: 'left' },
    { field: 'oil_data.oil_name', headerName: 'Oil Name', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
    {
      headerName: 'Equipment Name', filter: 'agTextColumnFilter', flex: 1, minWidth: 150,
      cellRenderer: (params: any) => {
        const name = params.data?.equipment_name ?? '';
        const nomenclature = params.data?.equipment_nomenclature ?? '';

        return `
            <div class="py-1 leading-tight">
              <div class="font-semibold ">${name || '-'}</div>
              ${nomenclature
            ? `<div class="text-xs">${nomenclature}</div>`
            : ''
          }
            </div>
          `;
      }
    },
    {
      field: 'oil_type_mapping', headerName: 'Oil Type Mapping',
      filter: 'agTextColumnFilter', flex: 1, minWidth: 150, valueGetter: (params: any) => this.getOilTypeDisplay(params.data?.oil_type_mapping)
    },
    { field: 'oil_data.satellite_unit_name', headerName: 'Satellite Unit', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
    { field: 'ship_name', headerName: 'Ship Name', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },

    {
      headerName: 'Action',
      field: 'actions',
      minWidth: 120,
      width: 120,
      pinned: 'right',
      maxWidth: 140,
      sortable: false,
      filter: false,
      cellRenderer: AgActionCellComponent,
      cellRendererParams: {
        actionDisplayMode: 'float',
        onMainAction: (row: any) => console.log('Main action', row),
        onAction: (k: string, r: any) => this.triggerOilModal(k, r, 'Oil Details'),
        actions: [
          { key: 'view', label: 'View', iconClass: 'fa fa-eye', btnClass: 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' },
          { key: 'edit', label: 'Edit', iconClass: 'fa fa-edit', btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200' },
          { key: 'delete', label: 'Delete', iconClass: 'fa fa-trash', btnClass: 'bg-red-100 text-red-600 hover:bg-red-200' }
        ]
      }
    }
  ];
  rowData: any[] = [];
  @ViewChild(PaginateTableComponent) table!: PaginateTableComponent;

  tabs = [
    {
      id: 'oil-data',
      label: 'Oil Data',
      icon: 'fa-solid fa-oil-can',
      url: 'master/oil-data-properties/?',
      columnDefs: this.columnOilData,
      buttonLabel: 'Create Oil Data'
    },
    {
      id: 'oil-mapping',
      label: 'Oil vs Equipment Mapping Data',
      icon: 'fa-solid fa-gear',
      url: 'master/equipment-oil-mappings/',
      columnDefs: this.columnOilvsEquipmentMapping,
      buttonLabel: 'Create Oil Mapping'
    }
  ];
  activeTab = this.tabs[0];

  private readonly apiService = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notificationService = inject(NotificationService);
  private readonly appService = inject(AppService);

  ngOnInit(): void {
    this.loadDropdownData();
  }

  setActiveTab(tab: any) {
    this.activeTab = tab;
    this.addButtons = this.addButtons.map((button, index) =>
      index === 0 ? { ...button, label: tab.buttonLabel } : button,
    );
    this.rowData = [];
    this.showCreateLayout = false;
    setTimeout(() => {
      this.table?.refreshTable();
    });
  }
  private loadDropdownData(): void {
    this.appService.showLoader();
    forkJoin({
      shipClasses: this.apiService.getDropdownData(
        'master/ship-classes/',
        { labelKey: 'name', valueKey: 'id' }
      ).pipe(catchError(() => of([]))),

      ships: this.apiService.getDropdownData(
        'master/ships/',
        { labelKey: 'name', valueKey: 'id' }
      ).pipe(catchError(() => of([]))),

      equipments: this.apiService.getDropdownData(
        'master/equipments/',
        equipmentHtml
      ).pipe(catchError(() => of([]))),

      oilData: this.apiService.get('master/oil-data-properties/').pipe(catchError(() => of({ data: [] })))
    })
      .pipe(
        finalize(() => {
          this.appService.hideLoader();
        })
      )
      .subscribe((res: any) => {
        this.shipClassOptions = res.shipClasses || [];
        this.shipOptions = res.ships || [];
        this.equipmentOptions = res.equipments || [];
        this.availableOilDataOptions = (res.oilData?.data || []).map((oil: any) => ({
          label: oil.full_name,
          value: oil.id,
          typeOfOil: oil.typeOfOil
        }));
        console.log("availableOilDataOptions", this.availableOilDataOptions);


        console.log('Dropdown Data:', res);
      });
  }
  headerTitle = '';
  modalType: 'oil-data' | 'oil-mapping' = 'oil-data';
  triggerOilModal(key: string, rowData?: any, headerTitle?: string): void {
    this.modalType = this.activeTab.id === 'oil-data' ? 'oil-data' : 'oil-mapping';

    if (key === 'add') {
      this.isEditMode = false;
      this.editingOilId = null;
      this.headerTitle = this.activeTab.id === 'oil-data' ? 'Create Oil Data' : 'Create Oil Mapping';
      this.showCreateLayout = true;

      this.initOilDataRows();
      return;
    }

    if ((key === 'edit' || key === 'view') && rowData) {
      this.isEditMode = key === 'edit';
      this.editingOilId = rowData.id ?? null;
      this.headerTitle = key === 'view' ? 'View Details' : (headerTitle || 'Edit Oil Data');

      // Initialize form with empty values first
      this.initOilDataRows();
      this.showCreateLayout = true; // Show popup immediately

      if (this.modalType === 'oil-data') {
        // Use row data directly instead of API call
        this.selectedOilShortName = rowData.oil_name || '';
        this.selectedOilFullName = rowData.full_name || '';
        this.selectedOilType = this.mapApiOilTypeToFormType(rowData.typeOfOil);

        // Populate basic properties from row data
        if (Array.isArray(rowData.oil_properties_basic)) {
          this.basicOilProperties = rowData.oil_properties_basic.map((prop: any, index: number) => ({
            sr_no: index + 1,
            test: this.findOilParameterKey(prop.test),
            method: this.findTestMethodKey(prop.method),
            unit: this.findUnitKey(prop.unit),
            range: prop.acceptable_range || '',
            id: prop.id || '' // Store the ID for editing
          }));
          this.originalBasicProperties = [...this.basicOilProperties]; // Track original for deletions
        } else {
          this.basicOilProperties = [{ sr_no: 1, test: '', method: '', unit: '', range: '' }];
        }

        // Populate advance properties from row data
        if (Array.isArray(rowData.oil_properties_advance)) {
          this.advanceOilProperties = rowData.oil_properties_advance.map((prop: any, index: number) => ({
            sr_no: index + 1,
            test: this.findOilParameterKey(prop.test),
            method: this.findTestMethodKey(prop.method),
            unit: this.findUnitKey(prop.unit),
            range: prop.acceptable_range || '',
            id: prop.id || '' // Store the ID for editing
          }));
          this.originalAdvanceProperties = [...this.advanceOilProperties]; // Track original for deletions
        } else {
          this.advanceOilProperties = [{ sr_no: 1, test: '', method: '', unit: '', range: '' }];
        }
      } else {
        // For oil mapping edit, populate mapping fields
        this.selectedShipClasses = rowData.ship_class_ids || [];
        this.selectedShips = rowData.ship_ids || [];
        this.selectedEquipments = rowData.equipment_ids || [];
        this.selectedOilDataId = rowData.oil_data_id || null;

        // If oil data is selected, trigger the change to populate properties
        if (this.selectedOilDataId) {
          this.onOilDataChange();
        }
      }
      return;
    }

    if (key === 'delete' && rowData) {
      this.deleteOilData(rowData);
      return;
    }

    this.headerTitle = headerTitle || (this.modalType === 'oil-data' ? 'Create Oil Data' : 'Create Oil Mapping');
    this.showCreateLayout = true;
  }

  closeAllDropdowns(): void {
    this.classDropdownOpen = false;
    this.shipDropdownOpen = false;
    this.equipmentDropdownOpen = false;
    this.showCreateLayout = false;
  }

  addBasicPropertyRow(): void {
    const nextSrNo = this.basicOilProperties.length + 1;
    this.basicOilProperties.push({ sr_no: nextSrNo, test: '', method: '', unit: '', range: '' });
  }

  removeBasicPropertyRow(index: number): void {
    if (this.basicOilProperties.length > 1) {
      this.basicOilProperties.splice(index, 1);
      // Update sr_no after removal
      this.basicOilProperties.forEach((row, i) => row.sr_no = i + 1);
    }
  }

  addAdvancePropertyRow(): void {
    const nextSrNo = this.advanceOilProperties.length + 1;
    this.advanceOilProperties.push({ sr_no: nextSrNo, test: '', method: '', unit: '', range: '' });
  }

  removeAdvancePropertyRow(index: number): void {
    if (this.advanceOilProperties.length > 1) {
      this.advanceOilProperties.splice(index, 1);
      // Update sr_no after removal
      this.advanceOilProperties.forEach((row, i) => row.sr_no = i + 1);
    }
  }

  getMappingPopupTitle(): string {
    return this.modalType === 'oil-data' ? 'CREATE OIL DATA' : 'CREATE EQUIPMENT OIL MAPPING';
  }

  formConfigForNewDetails: any[] = [
    {
      label: 'Code',
      key: 'code',
      type: 'text',
      colSpan: 3,
      required: true,
      placeholder: 'Enter Code',
    },
    {
      label: 'Name',
      key: 'name',
      type: 'text',
      required: true,
      placeholder: 'Enter Name',
    },
    {
      label: 'Description',
      key: 'description',
      type: 'textarea',
      required: false,
      placeholder: 'Enter Description',
      rows: 3,
    },
    {
      label: 'Is Active',
      key: 'active',
      type: 'checkbox',
    },
    {
      label: 'Type',
      key: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Type A', value: 'A' },
        { label: 'Type B', value: 'B' },
      ],
      placeholder: 'Select Type'
    },
    {
      label: 'Related Items',
      key: 'relatedItems',
      type: 'select-multiple',
      required: false,
      options: [
        { label: 'Item 1', value: 1 },
        { label: 'Item 2', value: 2 },
        { label: 'Item 3', value: 3 },
      ],
      placeholder: 'Select Related Items'
    },
    {
      label: 'Number Field',
      key: 'numberField',
      type: 'number',
      required: false,
      placeholder: 'Enter a number',
      min: 0,
      max: 1000
    },
    {
      label: 'Date',
      key: 'date',
      type: 'date',
      required: false,
      placeholder: 'Select date'
    },
    {
      label: 'Upload Image',
      key: 'image',
      type: 'file',
      accept: 'image/*',
      required: false,
      placeholder: 'Choose image file'
    }
  ];

  handleSubmit(event: Event): void {
    if (this.modalType === 'oil-data') {
      this.submitOilData();
    } else {
      this.submitOilMapping();
    }
  }

  private submitOilData(): void {
    const typeOfOilMap = {
      'lub-oil': '1',
      'hydraulic-oil': '2'
    };

    const oilData: any = {
      oil_perdiocity: null,
      satellite_unit_id: 3,
      full_name: this.selectedOilFullName,
      oil_name: this.selectedOilShortName,
      typeOfOil: typeOfOilMap[this.selectedOilType as keyof typeof typeOfOilMap] || '1',
      oil_properties_basic: this.basicOilProperties
        .filter(prop => prop.test.trim() || prop.method.trim() || prop.unit.trim() || prop.range.trim())
        .map(prop => ({
          id: prop.id || '',
          test: this.getOilParameterDisplay(prop.test),
          method: this.getTestMethodDisplay(prop.method),
          unit: this.getUnitDisplay(prop.unit),
          acceptable_range: prop.range
        })),
      oil_properties_advance: this.advanceOilProperties
        .filter(prop => prop.test.trim() || prop.method.trim() || prop.unit.trim() || prop.range.trim())
        .map(prop => ({
          id: prop.id || '',
          test: this.getOilParameterDisplay(prop.test),
          method: this.getTestMethodDisplay(prop.method),
          unit: this.getUnitDisplay(prop.unit),
          acceptable_range: prop.range
        })),
      hydraulic_oil_properties_basic: [],
      hydraulic_oil_properties_advance: [],
      properties_to_delete: []
    };

    // Track properties to delete if editing
    if (this.isEditMode) {
      const deletedBasicIds = this.originalBasicProperties
        .filter(orig => !this.basicOilProperties.some(curr => curr.id === orig.id))
        .map(prop => prop.id)
        .filter(id => id);

      const deletedAdvanceIds = this.originalAdvanceProperties
        .filter(orig => !this.advanceOilProperties.some(curr => curr.id === orig.id))
        .map(prop => prop.id)
        .filter(id => id);

      oilData.properties_to_delete = [...deletedBasicIds, ...deletedAdvanceIds];
    }

    // Include ID if editing
    if (this.isEditMode && this.editingOilId) {
      oilData.id = this.editingOilId;
    }

    console.log('Submitting Oil Data:', oilData);

    this.apiService.post('master/oil-data-properties/', oilData).subscribe({
      next: (response: any) => {
        console.log('Oil data submitted successfully:', response);
        this.notificationService.success(
          response?.message || 'Oil data saved successfully'
        );
        this.closeAllDropdowns();
        this.showCreateLayout = false;
        this.resetForm();
        this.table?.refreshTable();
        this.cdr.markForCheck();
      },
      error: (error: any) => {
        console.error('Error submitting oil data:', error);
        this.notificationService.error(
          error?.error?.message || 'Error submitting oil mapping:'
        )
      }
    });
  }

  private submitOilMapping(): void {
    const mappingData = {
      // ship_class_ids: this.selectedShipClasses,
      // ship_ids: this.selectedShips,
      equipment_ids: this.selectedEquipments,
      oil_data_id: this.selectedOilDataId
    };
    this.apiService.post('master/equipment-oil-mappings/', mappingData).subscribe(
      (response: any) => {
        console.log("=============================> test", response);
        this.notificationService.success(
          response?.message || 'Oil Data saved successfully'
        );
        this.closeAllDropdowns();
        this.showCreateLayout = false;
        this.resetForm();
        this.table?.refreshTable();
        this.cdr.markForCheck();
      },
      (error: any) => {
        this.notificationService.error(
          error?.error?.message || 'Error submitting oil mapping:'
        );
      }
    );
  }

  private resetForm(): void {
    this.selectedOilShortName = '';
    this.selectedOilFullName = '';
    this.selectedOilType = 'lub-oil';
    this.selectedOilDataId = null;
    this.isEditMode = false;
    this.editingOilId = null;
    this.basicOilProperties = [{ sr_no: 1, test: '', method: '', unit: '', range: '' }];
    this.advanceOilProperties = [{ sr_no: 1, test: '', method: '', unit: '', range: '' }];
    this.originalBasicProperties = [];
    this.originalAdvanceProperties = [];
  }

  onShipClassChange() {
    this.apiService.getDropdownData(
      'master/ships/',
      { labelKey: 'name', valueKey: 'id' },
      { shipClass_id: this.selectedShipClasses }
    ).subscribe((res: any) => {
      this.shipOptions = res;
    });
  }

  onShipChange() {
    this.apiService.getDropdownData(
      'master/equipments/',
      equipmentHtml,
      { ship_id: this.selectedShips }
    ).subscribe((res: any) => {
      this.equipmentOptions = res;
    });
  }

  onOilDataChange(): void {
    const selectedOil = this.availableOilDataOptions.find(oil => oil.value === this.selectedOilDataId);
    if (selectedOil) {
      this.selectedOilType = selectedOil.typeOfOil === 1 ? 'lub-oil' : 'hydraulic-oil';

      // Fetch full oil data to populate properties
      this.apiService.get(`master/oil-data-properties/?id=${this.selectedOilDataId}`).subscribe(
        (response: any) => {
          const oilData = response.data?.[0] || response;
          if (oilData) {
            // Populate basic properties
            if (Array.isArray(oilData.oil_properties_basic)) {
              this.basicOilProperties = oilData.oil_properties_basic.map((prop: any, index: number) => ({
                sr_no: index + 1,
                test: prop.test || '',
                method: prop.method || '',
                unit: prop.unit || '',
                range: prop.acceptable_range || '',
                id: prop.id || ''
              }));
            } else {
              this.basicOilProperties = [{ sr_no: 1, test: '', method: '', unit: '', range: '' }];
            }

            // Populate advance properties
            if (Array.isArray(oilData.oil_properties_advance)) {
              this.advanceOilProperties = oilData.oil_properties_advance.map((prop: any, index: number) => ({
                sr_no: index + 1,
                test: prop.test || '',
                method: prop.method || '',
                unit: prop.unit || '',
                range: prop.acceptable_range || '',
                id: prop.id || ''
              }));
            } else {
              this.advanceOilProperties = [{ sr_no: 1, test: '', method: '', unit: '', range: '' }];
            }
          }
        },
        (error: any) => {
          console.error('Error fetching oil data properties:', error);
        }
      );
    }
  }

  private getOilParameterDisplay(key: string): string {
    const param = this.oilParameters.find(p => p.key === key);
    return param ? param.value : key;
  }

  private getTestMethodDisplay(key: string): string {
    const method = this.testMethods.find(m => m.key === key);
    return method ? method.value : key;
  }

  private getUnitDisplay(key: string): string {
    const unit = this.units.find(u => u.key === key);
    return unit ? unit.value : key;
  }

  private mapApiOilTypeToFormType(type: number | string): string {
    if (type === 1 || type === '1') return 'lub-oil';
    if (type === 2 || type === '2') return 'hydraulic-oil';
    return 'lub-oil';
  }

  private findOilParameterKey(displayValue: string): string {
    const param = this.oilParameters.find((p) => p.value === displayValue || p.key === displayValue);
    return param ? param.key : '';
  }

  private findTestMethodKey(displayValue: string): string {
    const method = this.testMethods.find((m) => m.value === displayValue || m.key === displayValue);
    return method ? method.key : '';
  }

  private findUnitKey(displayValue: string): string {
    const unit = this.units.find((u) => u.value === displayValue || u.key === displayValue);
    return unit ? unit.key : '';
  }

  private getOilTypeDisplay(type: number): string {
    return type === 1 ? 'LUB OIL' : type === 2 ? 'HYDRAULIC OIL' : 'Unknown';
  }

  private initOilDataRows(): void {
    // Initialize with empty rows for add mode
    this.basicOilProperties = [{ sr_no: 1, test: '', method: '', unit: '', range: '' }];
    this.advanceOilProperties = [{ sr_no: 1, test: '', method: '', unit: '', range: '' }];
    this.selectedOilShortName = '';
    this.selectedOilFullName = '';
    this.selectedOilType = 'lub-oil';

    // Reset oil mapping fields
    this.selectedOilDataId = null;
    this.selectedShipClasses = [];
    this.selectedShips = [];
    this.selectedEquipments = [];
  }


  oilFormRows: any[] = [];

  // initOilDataRows() {
  //   this.oilFormRows = [
  //     this.createEmptyRow()
  //   ];
  // }

  createEmptyRow() {
    return {
      test: '',
      method: '',
      unit: '',
      range: ''
    };
  }

  addRow() {
    this.oilFormRows.push(this.createEmptyRow());
  }

  removeRow(index: number) {
    this.oilFormRows.splice(index, 1);
  }

  deleteOilData(rowData: any): void {
    const isOilDataTab = this.activeTab.id === 'oil-data';
    const message = isOilDataTab
      ? 'Are you sure you want to delete this oil data?'
      : 'Are you sure you want to delete this equipment oil mapping?';
    const endpoint = isOilDataTab ? 'master/oil-data-properties/' : 'master/equipment-oil-mappings/';

    if (confirm(message)) {
      const deleteData = {
        id: rowData.id,
        active: 3
      };

      this.apiService.post(endpoint, deleteData).subscribe({
        next: (res: any) => {
          console.log('Deleted successfully (soft delete)', res);
          this.notificationService.success(res?.message || 'Deleted successfully');
          this.table?.refreshTable();
        },
        error: (err) => {
          console.error('Error deleting:', err);
          this.notificationService.error(err?.error?.message || 'Error deleting item');
        }
      });
    }
  }

  get selectedEquipmentOptions() {
    if (!this.selectedEquipments || this.selectedEquipments.length === 0) {
      return [];
    }

    return this.equipmentOptions.filter((option: any) =>
      this.selectedEquipments.includes(option.value)
    );
  }
}
