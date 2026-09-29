import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { AgActionCellComponent, ReusableDeleteDialogComponent } from '../../ui/master-compat';
import { CommonModule } from '@angular/common';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { FormsModule } from '@angular/forms';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
import { ApiService, DropdownOption } from '../../api.service';
import { equipmentHtml } from '../../ApiEndPoints';

@Component({
  selector: 'app-equipmwnt-map-image',
  standalone: true,
  imports: [CommonModule, FormsModule, PaginateTableComponent, AddFormComponent, ReusableDeleteDialogComponent],
  templateUrl: './equipmwnt-map-image.html',
})
export class EquipmwntMapImage implements OnInit {
  rowData: any[] = [];
  tableLoading = false;
  shipOptions: DropdownOption<number>[] = [];
  shipsDropdown: DropdownOption<number>[] = [];
  equipmentOptions: DropdownOption<number>[] = [];
  trialUnit = '';
  trialType: (string | number)[] = [];
  selectedShips: (string | number)[] = [];
  imageFile: File | null = null;
  imageFileName = '';
  currentImageUrl: string | null = null;
  showCreateLayout = false;
  isEditMode = false;
  editingItem: any = null;
  title = 'ADD EQUIPMENT IMAGE';
  editFormData: any = {};
  @ViewChild(PaginateTableComponent) table!: PaginateTableComponent;

  showDeleteDialog = false;
  deleteId: number | null = null;
  deleteName = '';
  deleteLoading = false;

  addButtons = [
    {
      label: 'Add Equipment Image',
      key: 'add',
      show: true,
      cls: 'bg-blue-900 text-white',
    },
  ];

  columnOilData = [
    { headerName: 'Ser', valueGetter: (p: any) => (p.node?.rowIndex ?? 0) + 1, width: 80, minWidth: 60, pinned: 'left' },
    { field: 'ship_name', headerName: 'Ship', filter: 'agTextColumnFilter', flex: 1, minWidth: 140,  },
    { field: 'equipment_name', headerName: 'Equipment', filter: 'agTextColumnFilter', flex: 1, minWidth: 170,  },
    {
      headerName: 'Image', field: 'image', flex: 1, minWidth: 120, maxWidth: 150, filter: false,
      cellRenderer: (params: any) => {
        const src = params.data?.image;
        if (!src) { const el = document.createElement('span'); el.className = 'text-slate-400 text-xs'; el.textContent = '—'; return el; }
        const btn = document.createElement('button');
        btn.type = 'button'; btn.textContent = 'View';
        btn.className = 'px-2 py-1 text-xs font-semibold text-blue-600 border border-blue-500 rounded hover:bg-blue-50';
        btn.onclick = e => { e.stopPropagation(); window.open(src, '_blank'); };
        return btn;
      }
    },
    {
      headerName: 'Action', field: 'actions', width: 140, maxWidth: 160, sortable: false, filter: false, pinned: 'right' as 'right',
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
    { label: 'Class of Ship', type: 'select', key: 'trialUnit', colSpan: 1.5, required: false, options: this.shipOptions, onChange: (v: any) => { this.trialUnit = v; this.onShipClassChange(v); } },
    { label: 'Ship', type: 'select-multiple', key: 'selectedShips', colSpan: 1.5, required: false, options: this.shipsDropdown, onChange: (v: any) => { this.selectedShips = v; this.onShipChange(v); } },
    { label: 'Select Equipment Type', type: 'select-multiple', key: 'trialType', colSpan: 1.5, required: false, options: this.equipmentOptions, onChange: (v: any) => { this.trialType = v; } },
    { label: 'Image', type: 'file', key: 'image_id', colSpan: 1.5, required: false }
  ];

  constructor(private apiService: ApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadShipClasses();
  }

  handleAddButtonClick(event: { key: string; rowData?: any }): void {
    if (event.key === 'add') {
      this.openAddPopup();
    }
  }

  openAddPopup() {
    if (!this.shipOptions.length) this.loadShipClasses();
    this.isEditMode = false; this.editingItem = null; this.title = 'ADD EQUIPMENT IMAGE'; this.resetFormState(); this.showCreateLayout = true;
  }
  closeAddPopup() { this.showCreateLayout = false; this.isEditMode = false; this.editingItem = null; }

  handleSubmit(formData: any) {
    this.trialUnit = formData.trialUnit || this.trialUnit || '';
    this.selectedShips = formData.selectedShips || this.selectedShips || [];
    this.trialType = formData.trialType || this.trialType || [];
    const file = formData.image_id || formData.imageFile || this.imageFile;
    if (file instanceof File) {
      this.imageFile = file;
    }
    this.onSaveAddEquipment();
  }

  onFieldChange({ key, value }: { key: string; value: any }) {
    if (key === 'trialUnit') { this.trialUnit = value; this.selectedShips = []; this.trialType = []; this.editFormData = this.buildFormData(); this.onShipClassChange(value); return; }
    if (key === 'selectedShips') { this.selectedShips = value || []; this.trialType = []; this.editFormData = this.buildFormData(); this.onShipChange(this.selectedShips); return; }
    if (key === 'trialType') this.trialType = value || [];
    if (key === 'image_id' || key === 'imageFile') this.imageFile = value || null;

    this.editFormData = this.buildFormData();
  }

  onSaveAddEquipment() {
    const formData = new FormData();
    if (this.trialUnit) formData.append('ship_class', String(this.trialUnit));
    if (this.selectedShips?.length) formData.append('ships', JSON.stringify(this.selectedShips));
    if (this.trialType?.length) formData.append('equipments', JSON.stringify(this.trialType));
    if (this.editingItem?.id) formData.append('id', String(this.editingItem.id));
    if (this.imageFile) formData.append('image_id', this.imageFile);

    this.apiService.post('master/equipment-image-mappings/', formData).subscribe({
      next: () => { this.closeAddPopup(); this.table.refreshTable(); },
      error: e => console.error('Error saving equipment image mapping', e)
    });
  }

  private onGridAction(k: string, r: any) {
    if (k === 'edit' || k === 'view') {
      this.openEditPopup(r);
      if (k === 'view') this.title = 'VIEW EQUIPMENT IMAGE';
    } else if (k === 'delete') {
      this.deleteEquipmentImage(r);
    }
  }

  openEditPopup(row: any) {
    this.isEditMode = true; this.editingItem = row; this.title = 'EDIT EQUIPMENT IMAGE';
    this.trialUnit = row.ship_class_id || '';
    this.selectedShips = row.ship_id ? [row.ship_id] : [];
    this.trialType = row.equipment_id ? [row.equipment_id] : [];
    this.imageFile = null;
    this.currentImageUrl = row.equipment_image || null;
    this.imageFileName = row.equipment_image ? row.equipment_image.split('/').pop() : '';
    this.editFormData = this.buildFormData(); this.showCreateLayout = true;
    if (this.trialUnit) this.onShipClassChange(this.trialUnit);
    if (this.selectedShips.length) this.onShipChange(this.selectedShips);
  }

  deleteEquipmentImage(row: any) {
    this.deleteId = row.id;
    this.deleteName = row.equipment_name || row.ship_name || 'Equipment Image';
    this.showDeleteDialog = true;
  }

  closeDeleteDialog() {
    this.showDeleteDialog = false;
    this.deleteId = null;
    this.deleteName = '';
    this.deleteLoading = false;
  }

  confirmDelete() {
    if (!this.deleteId) return;
    this.deleteLoading = true;
    this.apiService.post('master/equipment-image-mappings/', { id: this.deleteId, active: 3 }).subscribe({
      next: () => {
        this.deleteLoading = false;
        this.closeDeleteDialog();
        this.table.refreshTable();
      },
      error: err => {
        console.error('Error deleting equipment image:', err);
        this.deleteLoading = false;
      }
    });
  }
  // getEquipmentData() {
  //   this.apiService.get<any>('master/equipment-image-mappings/').subscribe({
  //     next: (res) => {
  //       const apiData = res?.data || [];
  //       this.rowData = apiData.map((item: any) => ({
  //         id: item.id, equipment_id: item.equipment, equipment_image: item.image || '', ship_name: item.ship_name,
  //         equipment: { name: item.equipment_name || 'N/A', nomenclature: item.equipment_nomenclature || item.equipment_name || 'N/A', ship: { name: item.ship_name || 'N/A' } }
  //       }));
  //       this.cdr.detectChanges();
  //     }, error: (err) => console.error(err),
  //   });
  // }
   onShipClassChange(classId: string | number) {
    this.selectedShips = []; this.trialType = []; this.editFormData = this.buildFormData();
    this.apiService.getDropdownData<any, number>('master/ships/', { labelKey: 'name', valueKey: 'id' }, { id: classId }).subscribe(opts => {
      this.shipsDropdown = opts; this.updateFieldOptions('selectedShips', this.shipsDropdown); this.cdr.detectChanges();
    });
  }
  onShipChange(shipIds: (string | number)[]) {
    this.trialType = []; this.editFormData = this.buildFormData();
    if (!shipIds?.length) { this.equipmentOptions = []; this.updateFieldOptions('trialType', []); return; }
    this.apiService.getDropdownData<any, number>('master/equipments/', equipmentHtml, { id: shipIds.join(',') })
      .subscribe(opts => { this.equipmentOptions = opts; this.updateFieldOptions('trialType', this.equipmentOptions); this.cdr.detectChanges(); });
  }
  loadShipClasses() {
    this.apiService.getDropdownData<any, number>('master/ship-classes/', { labelKey: 'name', valueKey: 'id' }).subscribe({
      next: opts => { this.shipOptions = opts; this.updateFieldOptions('trialUnit', this.shipOptions); this.cdr.detectChanges(); },

    });
  }
  private resetFormState() {
    this.trialUnit = ''; this.selectedShips = []; this.trialType = []; this.imageFile = null; this.imageFileName = ''; this.currentImageUrl = null; this.editFormData = this.buildFormData();
  }
  private updateFieldOptions(fieldKey: string, options: DropdownOption<number>[]) {
    this.formConfigForNewDetails = this.formConfigForNewDetails.map(f => f.key === fieldKey ? { ...f, options: [...options] } : f);
  }
  private buildFormData() {
    return { trialUnit: this.trialUnit || '', selectedShips: this.selectedShips || [], trialType: this.trialType || [], imageFile: this.imageFile || null };
  }
}
