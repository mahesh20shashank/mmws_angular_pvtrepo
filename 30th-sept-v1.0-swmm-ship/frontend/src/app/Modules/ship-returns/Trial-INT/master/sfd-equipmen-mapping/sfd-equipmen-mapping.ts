import { Component, OnInit, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { AgActionCellComponent } from '../../ui/master-compat';
import { TimelineComponent, TimelineItem } from '../../ui/timeline';
import { ApiService } from '../../api.service';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
import { SelectWithSearchComponent } from '../../ui/select-with-search/select-with-search-box.component';


interface FormField {
  label: string;
  key: string;
  inputType: string;
  disabled?: boolean;
  required?: boolean;
  options?: { label: string; value: any }[];
}
@Component({
  selector: 'app-sfd-equipmen-mapping',
  standalone: true,
  templateUrl: './sfd-equipmen-mapping.html',
  imports: [
    CommonModule,
    FormsModule,
    PaginateTableComponent,
    AddFormComponent,
    SelectWithSearchComponent,
  ],
})
export class SFDEquipmenMapping implements OnInit {
  rowData: any[] = [];
  rowData1: any[] = [];
  cmmsTableUrl = 'master/sfd-data/';
  itttmTableUrl = 'master/equipments/';
  @ViewChild('cmmsTable') cmmsTable!: PaginateTableComponent;
  @ViewChild('itttmTable') itttmTable!: PaginateTableComponent;
  formConfigForNewDetails: any[] = [];
editFormData: any = {};

  equipmentName = '';
  isEquipmentModalOpen = false;
  cmmsFilters = { ship: '', cmmsCode: '', serialNumber: '', nameNom: '' };
  itttmFilters = { ship: '', itttmCode: '', serialNumber: '', nameNom: '' };
  shipOptions: { label: string; value: string }[] = [];
  private committedCmmsText = { name: '', code: '' };
  private committedItttmText = { name: '', code: '' };

  columnCMMS = [
    { field: 'EquipmentModel', headerName: 'Name', minWidth: 200 },
    { field: 'Nomenclature', headerName: 'Nomenclature', filter: 'agTextColumnFilter', flex: 1, minWidth: 200 },
    { field: 'EquipmentCode', headerName: 'CMMS Code', filter: 'agTextColumnFilter', minWidth: 200 },
    { field: 'ShipName', headerName: 'Ship', filter: 'agTextColumnFilter', minWidth: 200 },
    {
      headerName: 'Actions', field: 'actions', minWidth: 150, sortable: false, filter: false,
      cellRenderer: AgActionCellComponent,
      cellRendererParams: {
        actionDisplayMode: 'float',
        onMainAction: (row: any) => console.log('Main action', row),
        onAction: (k: string, r: any) => this.triggerEquipmentModal(k, r, 'CMMMS/SFD Equipment Details'),
        actions: [
          { key: 'add', label: 'Add', iconClass: 'fa fa-plus', btnClass: 'bg-green-100 text-green-600 hover:bg-green-200' },
          { key: 'view', label: 'View', iconClass: 'fa fa-eye', btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200' },
        ]
      }
    }
  ];
columnIttm = [
  {
    field: 'name',
    headerName: 'Name',
    minWidth: 200
  },
  {
    headerName: 'Nomenclature',
    minWidth: 200,
    filter: 'agTextColumnFilter',
    flex: 1,
    valueGetter: (p: any) => p.data?.sfd?.Nomenclature || ''
  },
  {
    headerName: 'CMMS Code',
    minWidth: 200,
    filter: 'agTextColumnFilter',
    valueGetter: (p: any) => p.data?.sfd?.EquipmentCode || ''
  },
  {
    field: 'ship_name',
    headerName: 'Ship',
    minWidth: 200,
    filter: 'agTextColumnFilter'
  },
  {
    headerName: 'Actions',
    field: 'actions',
    minWidth: 150,
    sortable: false,
    filter: false,
    cellRenderer: AgActionCellComponent,
    cellRendererParams: {
      actionDisplayMode: 'float',
      onMainAction: (row: any) => console.log('Main action', row),
      onAction: (k: string, r: any) =>
        this.triggerEquipmentModal(k, r, 'ITTTM Equipment Details'),
      actions: [
        {
          key: 'delete',
          label: 'Delete',
          iconClass: 'fa fa-trash',
          btnClass: 'bg-red-100 text-red-600 hover:bg-red-200'
        },
        {
          key: 'view',
          label: 'View',
          iconClass: 'fa fa-eye',
          btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200'
        }
      ]
    }
  }
];

private static readonly MIN_SEARCH_CHARS = 3;

private commitTextFilter(current: unknown, committed: string): string {
  const term = String(current ?? '').trim();
  if (term.length >= SFDEquipmenMapping.MIN_SEARCH_CHARS) return term;
  if (term.length === 0) return '';
  return committed;
}

private selectedShipOption(shipValue: unknown): { label: string; value: string } | undefined {
  if (shipValue == null || shipValue === '') return undefined;
  return this.shipOptions.find((s) => String(s.value) === String(shipValue));
}

private buildCmmsUrl(): string {
  const params = new URLSearchParams();
  const selectedShip = this.selectedShipOption(this.cmmsFilters.ship);
  if (selectedShip?.label) params.set('ShipName', selectedShip.label);
  if (this.committedCmmsText.code) params.set('EquipmentCode', this.committedCmmsText.code);
  if (this.committedCmmsText.name) params.set('EquipmentName', this.committedCmmsText.name);
  const query = params.toString();
  return query ? `master/sfd-data/?${query}` : 'master/sfd-data/';
}

private buildItttmUrl(): string {
  const params = new URLSearchParams();
  const selectedShip = this.selectedShipOption(this.itttmFilters.ship);
  if (selectedShip?.value !== undefined && selectedShip.value !== '') {
    params.set('ship', String(selectedShip.value));
  }
  if (this.committedItttmText.code) params.set('code', this.committedItttmText.code);
  if (this.committedItttmText.name) params.set('name', this.committedItttmText.name);
  const query = params.toString();
  return query ? `master/equipments/?${query}` : 'master/equipments/';
}

onCmmsShipChange(ship: string | number | null): void {
  this.cmmsFilters.ship = ship == null ? '' : String(ship);
  this.applyCmmsFilters(true);
}

onItttmShipChange(ship: string | number | null): void {
  this.itttmFilters.ship = ship == null ? '' : String(ship);
  this.applyItttmFilters(true);
}

onCmmsFiltersChange(): void {
  this.committedCmmsText = {
    name: this.commitTextFilter(this.cmmsFilters.nameNom, this.committedCmmsText.name),
    code: this.commitTextFilter(this.cmmsFilters.cmmsCode, this.committedCmmsText.code),
  };
  this.applyCmmsFilters();
}

onItttmFiltersChange(): void {
  this.committedItttmText = {
    name: this.commitTextFilter(this.itttmFilters.nameNom, this.committedItttmText.name),
    code: this.commitTextFilter(this.itttmFilters.itttmCode, this.committedItttmText.code),
  };
  this.applyItttmFilters();
}

private applyCmmsFilters(force = false): void {
  const next = this.buildCmmsUrl();
  if (!force && next === this.cmmsTableUrl) return;
  this.cmmsTableUrl = next;
  this.cdr.detectChanges();
  this.cmmsTable?.refreshTable();
}

private applyItttmFilters(force = false): void {
  const next = this.buildItttmUrl();
  if (!force && next === this.itttmTableUrl) return;
  this.itttmTableUrl = next;
  this.cdr.detectChanges();
  this.itttmTable?.refreshTable();
}
  closeModal() { this.isEquipmentModalOpen = false; }
  // getCMMSData() { this.cmmsFilters = { ...this.cmmsFilters }; }
  // getITTTMData() { this.itttmFilters = { ...this.itttmFilters }; }

  trialUnitOptions = [
    { label: 'CBIU', value: 1 },
    { label: 'GTTT', value: 2 },
    { label: 'DTTT', value: 3 }
  ];

cmmsEquipmentDetails: FormField[] = [
  ...keyArr.map((label, i) => ({
    label: label,
    key: keyArr2[i],
    inputType: 'text',
    disabled: true
  })),
  { label: "Created Date", key: "CreatedDate", inputType: "datetime", disabled: true },
  { label: "Updated Date", key: "UpdatedDate", inputType: "datetime", disabled: true }
];
cmmsEquipmentDetailsAdd: FormField[] = [
  { key: 'EquipmentName', label: 'Equipment Name', inputType: 'text', disabled: true },
  { key: 'Nomenclature', label: 'Equipment Nomenclature', inputType: 'text', disabled: true },
  { key: 'ShipName', label: 'Ship', inputType: 'text', disabled: true },
  { key: 'SectionName', label: 'Section', inputType: 'text', disabled: true },
  { key: 'EquipmentCode', label: 'CMMS Code', inputType: 'text', disabled: true },
  { key: 'EquipmentSrNo', label: 'Serial Number', inputType: 'text', disabled: true },
  { key: 'EquipmentModel', label: 'Model', inputType: 'text', disabled: true },
  { key: 'LocationOnBoard', label: 'Location', inputType: 'text', disabled: true },
  { key: 'ManufacturerName', label: 'Manufacturer', inputType: 'text', disabled: true },
  { key: 'SupplierName', label: 'Supplier', inputType: 'text', disabled: true },
  { key: 'Status', label: 'Status', inputType: 'text', disabled: true },
  { key: 'CommandName', label: 'Command', inputType: 'text', disabled: true },

  // 🔥 ONLY THIS IS SELECT
  {
    key: 'TrialUnit',
    label: 'Trial Unit',
    inputType: 'select-multiple',
    required: true,
    // options: [
    //   { label: 'Unit 1', value: '1' },
    //   { label: 'Unit 2', value: '2' }
    // ]
  }
];
itttmEquipmentDetails: FormField[] = [
  ...keyArr.map((label, i) => ({
    label: label,
    key: itttmKeyArr[i],
    inputType: 'text',
    disabled: true,
    required: [4, 5, 8, 9, 12].includes(i)
  })),
  {
    label: "Trial Unit",
    key: "trial_unit",
    inputType: "text",
    disabled: true,
    required: true
  }
];

  selectedRow: any;
  headerTitle = 'CMMMS/SFD Equipment Details';
  selectedEquipmentModel: any;
  submitText = '';
  triggerEquipmentModal(key: string, rowData: any, headerTitle: string): void {

  this.headerTitle = headerTitle;

  if (headerTitle === 'CMMMS/SFD Equipment Details') {

    if (key === 'view') {

      this.selectedRow = rowData;

     this.formConfigForNewDetails = this.cmmsEquipmentDetailsAdd
      .filter((f) => f.key !== 'TrialUnit')
      .map(f => ({
  key: f.key,
  label: f.label,
  type: f.inputType,
  required: f.required || false,
  options: f.options || [],
  disabled: true
}));

      this.editFormData = { ...rowData };
      this.isEquipmentModalOpen = true;
    }

    if (key === 'add') {

      this.selectedRow = rowData;

      this.formConfigForNewDetails = this.cmmsEquipmentDetailsAdd.map(f => ({
        key: f.key,
        label: f.label,
        type: f.inputType,
        required: f.required || false,
        options: f.options || [],
        disabled: f.disabled || false
      }));

      this.editFormData = { ...rowData };

      this.isEquipmentModalOpen = true;
    }
  }

  if (headerTitle === 'ITTTM Equipment Details') {
    if (key === 'view') {
      const flatData = {
        ...rowData,
        ...rowData.sfd,
        nomenclature: rowData?.sfd?.Nomenclature,
        ship: rowData?.ship_name,
        code: rowData?.code,
        serial_no: rowData?.serial_no,
        model: rowData?.model,
        status: rowData?.sfd?.Status,
        command: rowData?.sfd?.CommandName,
        section: rowData?.section_name
      };

      this.formConfigForNewDetails = this.itttmEquipmentDetails.map(f => ({
        key: f.key,
        label: f.label,
        type: f.inputType,
        required: f.required || false,
        disabled: true
      }));

      this.editFormData = flatData;
      this.isEquipmentModalOpen = true;
    }

    if (key === 'delete' && rowData) {
      if (confirm('Are you sure you want to delete this equipment mapping?')) {
        this.apiService.post('master/equipments/', { id: rowData.id, active: 3 }).subscribe({
          next: () => {
            this.itttmTable?.refreshTable();
          },
          error: (err) => console.error('Error deleting equipment:', err)
        });
      }
    }
  }
}
  items: TimelineItem[] = [
    { title: 'Ship Initiator', time: '10:00', description: '...', status: 'completed' }, 
    { title: 'Ship Recommender', time: '11:30', description: '...', status: 'completed' }, 
    { title: 'Ship Approver', time: '12:00', description: '...', status: 'completed' }, 
    { title: 'Ship Report Generated', time: '12:30', description: '...', status: 'completed' }, 
    { title: 'Trial Initiator', time: '13:00', description: '...', status: 'in_progress' }, 
    { title: 'Trial Recommender', time: '14:30', description: '...', status: 'pending' }, 
    { title: 'Trial Approver', time: '15:00', description: '...', status: 'pending' }, 
    { title: 'Trial Report Generated', time: '15:30', description: '...', status: 'pending' }];
handleSubmit(formData: any) {

  const payload = {
    sfd_id: this.selectedRow.id,
    trial_unit: Array.isArray(formData.TrialUnit)?formData.TrialUnit:[formData.TrialUnit]
  };

  console.log('Payload:', payload);

  this.apiService.post('master/equipments/add-from-sfd/', payload)
    .subscribe(() => {

      this.isEquipmentModalOpen = false;

      this.itttmTable?.refreshTable();
    });
}

  constructor(private apiService: ApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadShips();
    this.loadTrialUnits();
    this.onCmmsFiltersChange();
    this.onItttmFiltersChange();
  }

  private loadShips(): void {
      this.apiService.get('master/ships/').subscribe({
    next: (res: any) => {
      const data = res?.data || res || [];

      this.shipOptions = data.map((ship: any) => ({
        label: ship?.ship_name || ship?.name || 'Unknown',
        value: String(ship?.id ?? ship?.ship_id ?? ''),
      }));
      this.onCmmsFiltersChange();
      this.onItttmFiltersChange();
      this.cdr.detectChanges();
    },
    error: (err) => {
      console.error('Ship API Error:', err);
      this.shipOptions = [];
      this.cdr.detectChanges();
    }
  });

    // this.apiService.get('transaction/get-user-ships').subscribe({
    //   next: (res: any) => {
    //     const userShips = this.mapShipOptions(res?.data ?? res ?? []);
    //     this.applyShipOptions(userShips);
    //     this.cdr.detectChanges();
    //   },
    //   error: (err) => {
    //     console.error('User ships API Error:', err);
    //     this.cdr.detectChanges();
    //   }
    // });
  }

  private applyShipOptions(newItems: { label: string; value: string }[]): void {
    if (!newItems.length) return;
    const merged = [...this.shipOptions, ...newItems];
    const uniq = new Map<string, { label: string; value: string }>();
    for (const item of merged) {
      uniq.set(item.value, item);
    }
    this.shipOptions = Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label));
    this.cdr.detectChanges();
  }

  private mapShipOptions(source: any[]): { label: string; value: string }[] {
    if (!Array.isArray(source)) return [];
    return source
      .map((row: any) => {
        const label =
          row?.ship_name ?? row?.ShipName ?? row?.name ?? row?.label ?? row?.title ?? '';
        const value =
          row?.ship_id ?? row?.id ?? row?.value ?? row?.ship_code ?? row?.code ?? label;
        return { label: String(label).trim(), value: String(value).trim() };
      })
      .filter((x) => !!x.label && !!x.value);
  }

  private loadTrialUnits(): void {
    this.apiService.get('master/trial-units/').subscribe({
      next: (res: any) => {
        const options = this.mapUnitOptions(res?.data ?? res ?? []);
        if (!options.length) return;
        this.trialUnitOptions = options;
        const trialUnitField = this.cmmsEquipmentDetailsAdd.find((f: any) => f.key === 'TrialUnit');
        if (trialUnitField) {
          (trialUnitField as any).options = this.trialUnitOptions;
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Trial units API Error:', err);
        this.cdr.detectChanges();
      }
    });
  }

  private mapUnitOptions(source: any[]): { label: string; value: any }[] {
    if (!Array.isArray(source)) return [];
    return source
      .map((row: any) => ({
        label: String(row?.name ?? row?.unit_name ?? row?.TrialUnit ?? row?.label ?? '').trim(),
        value: row?.id ?? row?.value ?? row?.unit_id ?? row?.TrialUnit ?? '',
      }))
      .filter((x) => !!x.label && x.value !== '');
  }

  onFieldChange(event: any): void {
    console.log('Field change event:', event);
  }
}
const keyArr = ["Equipment Name","Equipment Nomenclature","Ship","Section","CMMS Code","Serial Number","Model","Location On Board","Manufacturer Name","Supplier Name","Status","Command"];
const keyArr2 = ["EquipmentName","Nomenclature","ShipName","SectionName","EquipmentCode","EquipmentSrNo","EquipmentModel","LocationOnBoard","ManufacturerName","SupplierName","Status","CommandName"];
// const itttmKeyArr = ["name","nomenclature","ship.name","section","code","serial_no","model","LocationOnBoard","ManufacturerName","SupplierName","status","command","trial_unit"];
const itttmKeyArr = [
  "name",
  "nomenclature",
  "ship",
  "section",
  "code",
  "serial_no",
  "model",
  "LocationOnBoard",
  "ManufacturerName",
  "SupplierName",
  "status",
  "command",
  "trial_unit"
];