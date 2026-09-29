import { ChangeDetectorRef, Component, ViewChild } from '@angular/core';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
import { AgActionCellComponent } from '../../ui/master-compat';
import { ApiService, DropdownOption } from '../../api.service';

@Component({
  selector: 'app-linkage-form',
  standalone: true,
  imports:[
    CommonModule,
    FormsModule,
    PaginateTableComponent,
    AddFormComponent,
  ],
  templateUrl: './linkage-form.html',
  styleUrl: './linkage-form.css',
})
export class LinkageForm {
  title='Add Linkage';
  showCreateLayout = false;

   rowData: any[] = [];
isEditMode = false;
  selectedRow: any = null;
  editFormData: any = {};
  isLoading = false;
  errorMessage = '';
  @ViewChild(PaginateTableComponent) paginateTable!: PaginateTableComponent;
  // shipOptions: any[]=[];
  occasionOptions: any[]=[];
  bearingOptions: any[]=[];
  shipOptions: DropdownOption<number>[] = [];
  shipsDropdown: DropdownOption<number>[] = [];
  equipmentOptions: DropdownOption<number>[] = [];
  equipmentList: any[] = [];
  driverBearingDEOptions: any[] = [];

  constructor(private apiService: ApiService, private cdr: ChangeDetectorRef) {}  

  ngOnInit() {
    this.loadShipClasses();
    this.loadOccasion();
    this.loadDriverBearingDE();
    // this.getEquipmentData();
  }
   
  
  
      
     columnOilData = [
          // { headerName: 'Ser', valueGetter: (params: { data: { rowIndex: number; }; }) => params.data.rowIndex + 1, width: 80, minWidth: 70 },
          { field: 'ship_class', headerName: 'Ship Class', filter: 'agTextColumnFilter', flex: 1, minWidth: 150, valueGetter: (p: any) => this.getShipClassDisplay(p.data) },
          { field: 'ship_name', headerName: 'Ship Name', filter: 'agTextColumnFilter', flex: 1, minWidth: 150, valueGetter: (p: any) => p.data?.ship_name ?? p.data?.ship?.name ?? '' },
          { field: 'equipment', headerName: 'Equipment', filter: 'agTextColumnFilter', flex: 1, minWidth: 150, valueGetter: (p: any) => p.data?.equipment_name ?? p.data?.equipment?.name ?? '' },
          
          
          // { field: 'active', headerName: 'Status', filter: 'agTextColumnFilter', minWidth: 150 },
          // { headerName: 'Action', field: 'actions', minWidth: 150, sortable: false, filter: false, cellRenderer: AgActionCellComponent, cellRendererParams: { actionDisplayMode: 'float', onMainAction: (row: any) => console.log('Main action', row), onAction: (k: string, r: any) => this.triggerOilModal(k, r, 'Oil Details'), actions: [ { key: 'edit', label: 'Edit', iconClass: 'fa fa-edit', btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200' }, { key: 'delete', label: 'Delete', iconClass: 'fa fa-trash', btnClass: 'bg-red-100 text-red-600 hover:bg-red-200' } ] } }
          {
          headerName: 'Action',
          field: 'actions',
          minWidth: 80,
          width: 80,
          maxWidth: 90,
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
              // {
              //   key: 'edit',
              //   label: 'Edit',
              //   iconClass: 'fa fa-edit',
              //   btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200',
              // },
              // {
              //   key: 'delete',
              //   label: 'Delete',
              //   iconClass: 'fa fa-trash',
              //   btnClass: 'bg-red-100 text-red-600 hover:bg-red-200',
              // },
            ],
          },
        },
        ];


   formConfigForNewDetails: any[] = [
  {
    label: 'Ship Class',
    key: 'ship_class',
    type: 'select',
    required: true,
    options: this.shipOptions,
    labelKey: 'label',
    valueKey: 'value',
    placeholder: 'Select Ship Class',
    onChange: (value: any) => this.onShipClassChange(value)
  },
  {
    label: 'Date',
    key: 'date',
    type: 'date',
    required: true,
    placeholder: 'Select Date'
  },
  {
    label: 'Ship',
    key: 'ship',
    type: 'select',
    required: true,
    options: this.shipsDropdown,
    labelKey: 'label',
    valueKey: 'value',
    placeholder: 'Select Ship'
  },
  {
    label: 'Occasion',
    key: 'occasion',
    type: 'select',
    required: false,
    options: this.occasionOptions,
    labelKey: 'label',
    valueKey: 'value',
    placeholder: 'Select Occasion'
  },
  {
    label: 'Equipment',
    key: 'equipment',
    type: 'select',
    required: true,
    options: this.equipmentOptions,
    labelKey: 'label',
    valueKey: 'value',
    placeholder: 'Select Equipment'
  },
  {
    label: 'CMMS Code',
    key: 'cmmsCode',
    type: 'text',
    required: false,
    placeholder: 'Enter CMMS Code'
  },
  {
    label: 'Name',
    key: 'name',
    type: 'text',
    required: true,
    placeholder: 'Enter Name'
  },
  {
    label: 'Make',
    key: 'make',
    type: 'text',
    required: false,
    placeholder: 'Enter Make'
  },
  {
    label: 'Models',
    key: 'models',
    type: 'text',
    required: false,
    placeholder: 'Enter Model'
  },
  {
    label: 'RPM',
    key: 'rpm',
    type: 'number',
    required: false,
    placeholder: 'Enter RPM'
  },
  {
    label: 'Coupling',
    key: 'coupling',
    type: 'text',
    required: false,
    placeholder: 'Enter Coupling Details'
  },

  // Bearings Section
  {
    label: 'Driven Bearing DE',
    key: 'drivenBearingDE',
    type: 'select',
    required: false,
    options: this.driverBearingDEOptions,
    labelKey: 'label',
    valueKey: 'value',
    placeholder: 'Select Driven Bearing DE'
  },
  {
    label: 'Driven Bearing DE Value',
    key: 'drivenBearingDEValue',
    type: 'text',
    required: false,
    placeholder: 'Enter Value'
  },
  {
    label: 'Driven Bearing NDE',
    key: 'drivenBearingNDE',
    type: 'select',
    required: false,
    options: this.driverBearingDEOptions,
    labelKey: 'label',
    valueKey: 'value',
    placeholder: 'Select Driven Bearing NDE'
  },
  {
    label: 'Driven Bearing NDE Value',
    key: 'drivenBearingNDEValue',
    type: 'text',
    required: false,
    placeholder: 'Enter Value'
  },
  {
    label: 'Driver Bearing DE',
    key: 'driverBearingDE',
    type: 'select',
    required: false,
    options: this.driverBearingDEOptions,
    labelKey: 'label',
    valueKey: 'value',
    placeholder: 'Select Driver Bearing DE'
  },
  {
    label: 'Driver Bearing DE Value',
    key: 'driverBearingDEValue',
    type: 'text',
    required: false,
    placeholder: 'Enter Value'
  },
  {
    label: 'Driver Bearing NDE',
    key: 'driverBearingNDE',
    type: 'select',
    required: false,
    options: this.driverBearingDEOptions,
    labelKey: 'label',
    valueKey: 'value',
    placeholder: 'Select Driver Bearing NDE'
  },
  {
    label: 'Driver Bearing NDE Value',
    key: 'driverBearingNDEValue',
    type: 'text',
    required: false,
    placeholder: 'Enter Value'
  },

  // Gear Teeth Section
  {
    label: '1st Stage',
    key: 'firstStage',
    type: 'text',
    required: false,
    placeholder: 'Enter 1st Stage Gear Teeth',
    min: 0
  },
  {
    label: '2nd Stage',
    key: 'secondStage',
    type: 'text',
    required: false,
    placeholder: 'Enter 2nd Stage Gear Teeth',
    min: 0
  },
  {
    label: '3rd Stage',
    key: 'thirdStage',
    type: 'text',
    required: false,
    placeholder: 'Enter 3rd Stage Gear Teeth',
    min: 0
  }
];
      
      
      tabs = [
        { id: 'linkage', label: 'Linkage', icon: 'fa-solid fa-oil-can' , url: 'master/linkage/?page=1&search=', columnDefs: this.columnOilData },
      ];
    addButtons = [
        // { label: 'Create Linkage', key: 'add', show: true, cls: 'bg-blue-900 text-white' },
      ];
      activeTab = this.tabs[0]  ;
    
      setActiveTab(tab: any) {
        this.activeTab = tab;
        this.rowData = [];
        
      }
      openAddPopup(): void {
    this.isEditMode = false;
    this.selectedRow = null;
    this.editFormData = { active: true };
    this.title = 'Add Linkage';
    this.errorMessage = '';
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

      triggerOilModal(key: string, rowData?: any, headerTitle?: string): void {
    this.headerTitle = headerTitle || '';
    if (key === 'add') {
      this.openAddPopup();
    } else if (key === 'edit' || key === 'view') {
      this.openEditPopup(rowData);
      if (key === 'view') this.title = 'View Linkage Details';
    }
  }
      headerTitle: string = '';
  openEditPopup(row: any): void {
    this.isEditMode = true;
    this.selectedRow = row;
    this.title = 'Edit Linkage';
    this.errorMessage = '';

    // Build formData object that AddFormComponent reads via this.formData[field.key]
    // Map API field 'description' → form key 'descriptions'
    // Map API field 'active' (1/0) → boolean for checkbox
    const shipClassId = this.getShipClassId(row);
    const shipId = row.ship?.id ?? row.ship ?? '';
    const equipment = row.equipment && typeof row.equipment === 'object' ? row.equipment : null;
    const equipmentId = equipment?.id ?? row.equipment ?? '';
    const linkageData = row.linkage_data ?? row;

    this.editFormData = {
      trialId: linkageData.trial_id ?? '',
      ship_class: shipClassId,
      date: linkageData.date ?? '',
      ship: shipId,
      occasion: linkageData.occasion?.id ?? linkageData.occasion ?? '',

      equipment: equipmentId,
      cmmsCode: linkageData.cmms_code ?? equipment?.code ?? equipment?.sfd?.EquipmentCode ?? '',

      name: linkageData.name ?? equipment?.name ?? equipment?.sfd?.EquipmentName ?? '',
      make: linkageData.make ?? equipment?.ManufacturerName ?? equipment?.sfd?.ManufacturerName ?? '',
      models: linkageData.model ?? equipment?.model ?? equipment?.sfd?.EquipmentModel ?? '',
      rpm: linkageData.rpm ?? '',

      coupling: linkageData.coupling ?? '',

      // Bearings
      drivenBearingDE: linkageData.driven_bearing_de?.id ?? linkageData.driven_bearing_de ?? '',
      drivenBearingDEValue: linkageData.driven_bearing_de_value ?? '',

      drivenBearingNDE: linkageData.driven_bearing_nde?.id ?? linkageData.driven_bearing_nde ?? '',
      drivenBearingNDEValue: linkageData.driven_bearing_nde_value ?? '',

      driverBearingDE: linkageData.driver_bearing_de?.id ?? linkageData.driver_bearing_de ?? '',
      driverBearingDEValue: linkageData.driver_bearing_de_value ?? '',

      driverBearingNDE: linkageData.driver_bearing_nde?.id ?? linkageData.driver_bearing_nde ?? '',
      driverBearingNDEValue: linkageData.driver_bearing_nde_value ?? '',

      // Gear Teeth
      firstStage: linkageData.first_stage ?? '',
      secondStage: linkageData.second_stage ?? '',
      thirdStage: linkageData.third_stage ?? ''
    };

    if (shipClassId) {
      this.onShipClassChange(shipClassId);
    }
    if (shipId) {
      this.loadEquipments(shipId, equipmentId);
    }

    this.showCreateLayout = true;
  }
  handleDelete(row: any): void {
    const confirmed = confirm(`Are you sure you want to delete "${row.name}"?`);
    if (!confirmed) return;

    const id = row?.id;
    if (!id) return;

    this.apiService.post(`master/linkage/${id}/`,{id, active: 3}).subscribe({
      next: () => {
        this.refreshTable();
      },
      error: (err: any) => {
        alert(err?.error?.detail || 'Failed to delete. Please try again.');
      },
    });
  }

  private onGridAction(key: string, row: any): void {
    if (key === 'edit' || key === 'view') {
      this.openEditPopup(row);
      if (key === 'view') this.title = 'View Linkage Details';
    } else if (key === 'delete') {
      this.handleDelete(row);
    }
  }
     private refreshTable(): void {
    if (this.paginateTable) {
      this.paginateTable.loadData();
    }
  }
//   private buildPayload(formData: any): object {
//   return {
//     trial_id: formData.trialId,
//     ship_class: formData.ship_class,
//     date: formData.date,
//     ship: formData.ship,
//     occasion: formData.occasion,

//     equipment: formData.equipment,
//     cmms_code: formData.cmmsCode,

//     name: formData.name,
//     make: formData.make,
//     model: formData.models,
//     rpm: formData.rpm,

//     coupling: formData.coupling,

//     // Bearings
//     driven_bearing_de: formData.drivenBearingDE,
//     driven_bearing_de_value: formData.drivenBearingDEValue,

//     driven_bearing_nde: formData.drivenBearingNDE,
//     driven_bearing_nde_value: formData.drivenBearingNDEValue,

//     driver_bearing_de: formData.driverBearingDE,
//     driver_bearing_de_value: formData.driverBearingDEValue,

//     driver_bearing_nde: formData.driverBearingNDE,
//     driver_bearing_nde_value: formData.driverBearingNDEValue,

//     // Gear Teeth
//     first_stage: formData.firstStage ?? 0,
//     second_stage: formData.secondStage ?? 0,
//     third_stage: formData.thirdStage ?? 0
//   };
// }

private buildPayload(formData: any): object {
  return {
    ship_class: formData.ship_class,
    ship: formData.ship,
    equipment: formData.equipment,

    linkage_data: {
      trial_id: formData.trialId,
      date: formData.date,
      occasion: formData.occasion,

      cmms_code: formData.cmmsCode,
      name: formData.name,
      make: formData.make,
      model: formData.models,
      rpm: formData.rpm,

      coupling: formData.coupling,

      // Bearings
      driven_bearing_de: formData.drivenBearingDE,
      driven_bearing_de_value: formData.drivenBearingDEValue,

      driven_bearing_nde: formData.drivenBearingNDE,
      driven_bearing_nde_value: formData.drivenBearingNDEValue,

      driver_bearing_de: formData.driverBearingDE,
      driver_bearing_de_value: formData.driverBearingDEValue,

      driver_bearing_nde: formData.driverBearingNDE,
      driver_bearing_nde_value: formData.driverBearingNDEValue,

      // Gear
      first_stage: formData.firstStage ?? 0,
      second_stage: formData.secondStage ?? 0,
      third_stage: formData.thirdStage ?? 0
    }
  };
}
  private handleEdit(formData: any): void {
    this.isLoading = true;
    this.errorMessage = '';

    const id = this.selectedRow?.id;
    const payload = { ...this.buildPayload(formData), id };

    this.apiService.post(`master/linkage/${id}`, payload).subscribe({
      next: () => {
        this.isLoading = false;
        this.closeAddPopup();
        this.refreshTable();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.detail || 'Failed to update. Please try again.';
      },
    });
  }

   private handleCreate(formData: any): void {
    this.isLoading = true;
    this.errorMessage = '';

    const payload = this.buildPayload(formData);
    console.log('Payload to be sent for creation:', payload); // Debug log

    this.apiService.post('master/linkage/', payload).subscribe({
      next: () => {
        this.isLoading = false;
        this.closeAddPopup();
        this.refreshTable();
      },
      error: (err: any) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.detail || 'Failed to create. Please try again.';
      },
    });
  }

  handleSubmit(formData: any): void {
    if (this.isEditMode) {
      this.handleEdit(formData);
    } else {
      this.handleCreate(formData);
    }
  }

  onFieldChange({ key, value, form }: { key?: string; value?: any; form?: any }): void {
    if (form) {
      this.editFormData = { ...this.editFormData, ...form };
    }

    if (key === 'ship_class') {
      this.editFormData = { ...this.editFormData, ship_class: value, ship: '' };
      this.clearEquipmentOptions();
      this.onShipClassChange(value);
    } else if (key === 'ship') {
      this.editFormData = { ...this.editFormData, ship: value, equipment: '' };
      this.loadEquipments(value);
    } else if (key === 'equipment') {
      this.setEquipmentDetails(value, form);
    }
  }

  onShipClassChange(classId: string | number): void {
    this.shipsDropdown = [];
    this.updateFieldOptions('ship', []);

    if (!classId) {
      this.cdr.detectChanges();
      return;
    }

    this.apiService.getDropdownData<any, number>('master/ships/', { labelKey: 'name', valueKey: 'id' }, { shipClass: classId }).subscribe({
      next: (opts: any) => {
        this.shipsDropdown = opts;
        this.updateFieldOptions('ship', this.shipsDropdown);
        this.cdr.detectChanges();
      },
    });
  }

  private updateFieldOptions(fieldKey: string, options: DropdownOption<number>[]) {
      this.formConfigForNewDetails = this.formConfigForNewDetails.map(f => f.key === fieldKey ? { ...f, options: [...options] } : f);
    }

  private getShipClassId(row: any): string | number {
    return row?.ship_class?.id ?? row?.ship_class ?? row?.ship?.shipClass ?? '';
  }

  private getShipClassDisplay(row: any): string {
    const shipClass = row?.ship_class;

    if (shipClass && typeof shipClass === 'object') {
      return shipClass.name ?? shipClass.label ?? '';
    }

    const shipClassId = this.getShipClassId(row);
    const shipClassOption = this.shipOptions.find(option => String(option.value) === String(shipClassId));

    return shipClassOption?.label ?? (shipClassId ? String(shipClassId) : '');
  }

  loadEquipments(shipId: string | number, selectedEquipment?: string | number): void {
    if (shipId === null || shipId === undefined || shipId === '') {
      this.clearEquipmentOptions();
      return;
    }

    this.apiService.get<any>('master/equipments/', { ship: shipId }).subscribe({
      next: (res: any) => {
        this.equipmentList = Array.isArray(res) ? res : res?.data ?? res?.results ?? [];
        this.equipmentOptions = this.equipmentList.map(item => {
          const name = item?.name || item?.sfd?.EquipmentName || item?.nomenclature || '';
          const details = [item?.ship_name, item?.trial_unit_name, item?.code].filter(Boolean).join(' - ');

          return {
            // label: details ? `${name} (${details})` : name,
            label: name,
            value: item?.id,
          };
        });
        this.updateFieldOptions('equipment', this.equipmentOptions);
        if (selectedEquipment !== undefined && selectedEquipment !== null && selectedEquipment !== '') {
          this.editFormData = { ...this.editFormData, equipment: selectedEquipment };
        }
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error loading equipment for ship:', shipId, err);
        this.clearEquipmentOptions();
      },
    });
  }

  private clearEquipmentOptions(): void {
    this.equipmentList = [];
    this.equipmentOptions = [];
    this.editFormData = { ...this.editFormData, equipment: '' };
    this.updateFieldOptions('equipment', []);
    this.cdr.detectChanges();
  }

  private setEquipmentDetails(equipmentId: string | number, form?: any): void {
    const selectedEquipment = this.equipmentList.find(item => String(item?.id) === String(equipmentId));
    if (!selectedEquipment) return;

    this.editFormData = {
      ...this.editFormData,
      ...(form ?? {}),
      equipment: equipmentId,
      cmmsCode: selectedEquipment.code ?? selectedEquipment.sfd?.EquipmentCode ?? '',
      name: selectedEquipment.name ?? selectedEquipment.sfd?.EquipmentName ?? '',
      make: selectedEquipment.ManufacturerName ?? selectedEquipment.sfd?.ManufacturerName ?? '',
      models: selectedEquipment.model ?? selectedEquipment.sfd?.EquipmentModel ?? '',
      rpm: selectedEquipment.rpm ?? '',
      coupling: selectedEquipment.coupling ?? '',
    };
    this.cdr.detectChanges();
  }

  loadShipClasses() {
    this.apiService.getDropdownData<any, number>('master/ship-classes/', { labelKey: 'name', valueKey: 'id' }).subscribe({
      next: (opts: any) => { this.shipOptions = opts; this.updateFieldOptions('ship_class', this.shipOptions); this.cdr.detectChanges(); },
      
    });
  }

  loadOccasion(): void {
  this.apiService.get('/master/lookups/?type__code=OCC').subscribe({
    next: (response: any) => {
      console.log('OCCASION API RESPONSE', response);

      this.occasionOptions = (response?.data || response || []).map((item: any) => ({
        label: item.name,
        value: item.id
      }));

      
      this.updateFieldOptions('occasion', this.occasionOptions);

      this.cdr.detectChanges(); 
    },

    error: (error: any) => {
      console.error('OCCASION API ERROR', error);
    }
  });
}

loadDriverBearingDE(): void {
  this.apiService.get('/master/lookups/?type__code=BEARING').subscribe({

    next: (response: any) => {
      console.log('DRIVER BEARING DE API RESPONSE', response);

      this.driverBearingDEOptions = (response?.data || response || []).map((item: any) => ({
        label: item.name,
        value: item.id
      }));

      // 🔥 IMPORTANT: update form config
      this.updateFieldOptions('driverBearingDE', this.driverBearingDEOptions);

      // if same options used in other fields, update them also 👇
      this.updateFieldOptions('driverBearingNDE', this.driverBearingDEOptions);
      this.updateFieldOptions('drivenBearingDE', this.driverBearingDEOptions);
      this.updateFieldOptions('drivenBearingNDE', this.driverBearingDEOptions);

      this.cdr.detectChanges(); // better than notifyViewUpdated()
    },

    error: (error: any) => {
      console.error('DRIVER BEARING DE API ERROR', error);
    }

  });
}

}
