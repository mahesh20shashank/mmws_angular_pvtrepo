import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ColDef, CellCallbackParams } from 'ag-grid-community';
import { forkJoin } from 'rxjs';
import { MasterCard } from '../../../../refit-maintenance/master-card/master-card';
import { DataGrid } from '../../../../../shared/components/data-grid/data-grid';
import { CollapsibleSidebar } from '../../../../../shared/components/collapsible-sidebar/collapsible-sidebar';
import { SidebarItem } from '../../../../../shared/components/collapsible-sidebar/collapsible-sidebar.models';
import { ActionRendererComponent, GridAction } from '../../../../../shared/components/data-grid/grid-action-icons';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';
import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ModalComponent } from '../../../../../shared/components/modal/modal.component';
import { ConfirmDeleteModal } from '../../../../../shared/components/confirm-delete-modal/confirm-delete-modal';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { TankMastersApiService } from '../../services/tank-masters-api.service';
import {
  CategoryDropdownRow,
  FluidApi,
  FluidTypeApi,
  MasterTab,
  PendingTankRow,
  PolNameRow,
  PolTypeRow,
  TankCategoryRow,
  TankDetailRow,
  TankLocationRow,
  TankSoundingMasterApi,
  TankTypeDetailApi,
} from '../../models/tank-masters.model';

// Mirrors Django's tank/tank_masters.html (reference-data CRUD) plus tank/create_tank_details.html
// ("Tank Master" — tank creation grid with 95%/100% sounding-chart capacity), both sidebar-nav'd
// tabs of the same Onboard POL Status "Tank Masters" screen.
@Component({
  selector: 'app-tank-masters',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MasterCard,
    DataGrid,
    CollapsibleSidebar,
    IconComponent,
    ButtonComponent,
    ModalComponent,
    ConfirmDeleteModal,
  ],
  templateUrl: './tank-masters.html',
  styleUrl: './tank-masters.css',
})
export class TankMasters implements OnInit {
  private readonly toastr = inject(NotificationService);
  private readonly api = inject(TankMastersApiService);

  activeTab: MasterTab = 'tank-details';

  readonly navItems: SidebarItem[] = [
    { id: 'tank-details', label: 'Tank Master', icon: 'boxes' },
    { id: 'pol-types', label: 'Fluid/POL Types', icon: 'droplet' },
    { id: 'pol-names', label: 'Fluid/POL Names', icon: 'tags' },
    { id: 'tank-category', label: 'Tank Category', icon: 'layers' },
    { id: 'tank-location', label: 'Tank Location', icon: 'map-pin' },
  ];

  onNavSelect(id: string): void {
    this.setTab(id as MasterTab);
  }

  private deleteAction(onClick: (row: never) => void): ColDef {
    return {
      headerName: 'Actions',
      flex: 1,
      minWidth: 100,
      sortable: false,
      cellRenderer: () => `<button type="button" class="text-[#dc3545] underline text-xs">Delete</button>`,
      onCellClicked: (event: CellCallbackParams) => onClick(event.data as never),
    };
  }

  readonly polTypeColumnDefs: ColDef[] = [
    { headerName: 'Ser No.', field: 'ser', flex: 1, minWidth: 90 },
    { headerName: 'Fluid/POL Type', field: 'polType', flex: 1, minWidth: 160 },
    this.deleteAction((row: PolTypeRow) => this.removePolType(row)),
  ];

  readonly polNameColumnDefs: ColDef[] = [
    { headerName: 'Ser No.', field: 'ser', flex: 1, minWidth: 90 },
    { headerName: 'Fluid/POL Name', field: 'polName', flex: 1, minWidth: 160 },
    { headerName: 'Fluid/POL Type', field: 'polType', flex: 1, minWidth: 160 },
    { headerName: 'Measuring Unit', field: 'unit', flex: 1, minWidth: 130 },
    this.deleteAction((row: PolNameRow) => this.removePolName(row)),
  ];

  readonly tankCategoryColumnDefs: ColDef[] = [
    { headerName: 'Ser No.', field: 'ser', flex: 1, minWidth: 90 },
    { headerName: 'Category Name', field: 'categoryName', flex: 1, minWidth: 160 },
    { headerName: 'Manual Name', field: 'manualName', flex: 1, minWidth: 160 },
    { headerName: 'Fluid/POL', field: 'pol', flex: 1, minWidth: 140, valueFormatter: (p) => (p['value'] as string) || '—' },
    this.deleteAction((row: TankCategoryRow) => this.removeTankCategory(row)),
  ];

  readonly tankLocationColumnDefs: ColDef[] = [
    { headerName: 'Ser No.', field: 'ser', flex: 1, minWidth: 90 },
    { headerName: 'Location Name', field: 'locationName', flex: 1, minWidth: 200 },
    this.deleteAction((row: TankLocationRow) => this.removeTankLocation(row)),
  ];

  private tankDetailActions(row: TankDetailRow): GridAction[] {
    return [
      { icon: 'upload', label: 'Upload Sounding Chart', action: () => this.openSoundingModal(row) },
      { icon: 'delete', label: 'Delete', action: () => this.requestDeleteTankDetail(row) },
    ];
  }

  readonly tankDetailColumnDefs: ColDef[] = [
    { headerName: 'Ser No.', field: 'ser', flex: 1, minWidth: 90 },
    { headerName: 'Tank Category', field: 'categoryName', flex: 1, minWidth: 150 },
    { headerName: 'Tank Nomenclature', field: 'nomenclature', flex: 1, minWidth: 190 },
    {
      headerName: 'Storage/Service',
      field: 'subtype',
      flex: 1,
      minWidth: 130,
      valueFormatter: (p) => (p['value'] === 'service' ? 'Service' : 'Storage'),
    },
    {
      headerName: '95% Capacity',
      field: 'cap95',
      flex: 1,
      minWidth: 120,
      valueFormatter: (p) => (p['value'] != null ? String(p['value']) : 'N/A'),
    },
    {
      headerName: '100% Capacity',
      field: 'cap100',
      flex: 1,
      minWidth: 120,
      valueFormatter: (p) => (p['value'] != null ? String(p['value']) : 'N/A'),
    },
    { headerName: 'Tank Location', field: 'locationName', flex: 1, minWidth: 140 },
    {
      headerName: 'Action',
      field: 'id',
      flex: 1,
      minWidth: 110,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: { actions: (row: unknown) => this.tankDetailActions(row as TankDetailRow) },
    },
  ];

  /** Raw API lists, kept alongside the display rows above so the Fluid/POL Name and
   *  Tank Category tabs can resolve their FK dropdowns and join a name for display. */
  fluidTypes: FluidTypeApi[] = [];
  fluids: FluidApi[] = [];

  polTypes: PolTypeRow[] = [];
  polNames: PolNameRow[] = [];
  tankCategories: TankCategoryRow[] = [];
  tankLocations: TankLocationRow[] = [];

  newPolType = '';
  newPolName = '';
  newPolNameType: number | null = null;
  newPolNameUnit = 'Litres';
  newCategoryName = '';
  newCategoryManualName = '';
  newCategoryPol: number | null = null;
  newLocationName = '';

  // Tank Master (tank creation + sounding chart)
  categoryDropdown: CategoryDropdownRow[] = [];
  selectedTankCategoryId: number | null = null;
  storageTankCount = 1;
  serviceTankCount = 0;
  readonly fixedTankCount = 1; // legacy field, kept for visual parity only — not functional in Django either

  private tankTypeDetails: TankTypeDetailApi[] = [];
  private soundingMasters: TankSoundingMasterApi[] = [];
  private pendingTankRows: PendingTankRow[] = [];
  private nextTempId = -1;
  tankDetailRows: TankDetailRow[] = [];

  tankDetailSearch = { categoryName: '', nomenclature: '', subtype: '', locationName: '' };

  showSoundingModal = false;
  soundingModalRow: TankDetailRow | null = null;
  sounding95: { id: number | null; mmLevel: number | null; volume: number | null } = { id: null, mmLevel: null, volume: null };
  sounding100: { id: number | null; mmLevel: number | null; volume: number | null } = { id: null, mmLevel: null, volume: null };

  showDeleteConfirm = false;
  private rowPendingDelete: TankDetailRow | null = null;

  get selectedCategoryInfo(): CategoryDropdownRow | null {
    return this.categoryDropdown.find((c) => c.id === this.selectedTankCategoryId) ?? null;
  }

  get filteredTankDetailRows(): TankDetailRow[] {
    const s = this.tankDetailSearch;
    return this.tankDetailRows.filter(
      (r) =>
        r.categoryName.toLowerCase().includes(s.categoryName.toLowerCase()) &&
        r.nomenclature.toLowerCase().includes(s.nomenclature.toLowerCase()) &&
        r.subtype.toLowerCase().includes(s.subtype.toLowerCase()) &&
        r.locationName.toLowerCase().includes(s.locationName.toLowerCase()),
    );
  }

  ngOnInit(): void {
    this.loadAll();
  }

  private loadAll(): void {
    forkJoin({
      fluidTypes: this.api.getFluidTypes(),
      fluids: this.api.getFluids(),
      categories: this.api.getTankCategories(),
      locations: this.api.getTankLocations(),
      categoryDropdown: this.api.getCategoryDropdown(),
      tankTypeDetails: this.api.getTankTypeDetails(),
      soundingMasters: this.api.getSoundingMasters(),
    }).subscribe(
      ({ fluidTypes, fluids, categories, locations, categoryDropdown, tankTypeDetails, soundingMasters }) => {
        this.fluidTypes = fluidTypes.data;
        this.fluids = fluids.data;
        this.rebuildPolTypes();
        this.rebuildPolNames();
        this.tankCategories = categories.data.map((c, i) => ({
          id: c.id,
          ser: i + 1,
          categoryName: c.tank_category,
          manualName: c.manual_name,
          pol: this.fluidName(c.fluid),
        }));
        this.tankLocations = locations.data.map((l, i) => ({ id: l.id, ser: i + 1, locationName: l.location_name }));
        this.categoryDropdown = categoryDropdown.tank_types;
        this.tankTypeDetails = tankTypeDetails.data;
        this.soundingMasters = soundingMasters.data;
        this.rebuildTankDetailRows();
      },
    );
  }

  private rebuildTankDetailRows(): void {
    const savedRows: Omit<TankDetailRow, 'ser'>[] = this.tankTypeDetails.map((d) => ({
      id: d.id,
      categoryName: this.tankCategories.find((c) => c.id === d.tank)?.categoryName ?? d.tank_name,
      nomenclature: d.tank_type,
      subtype: d.tank_subtype,
      locationName: this.tankLocations.find((l) => l.id === d.location)?.locationName ?? '—',
      cap95: this.soundingMasters.find((s) => s.tank_category_detail === d.id && s.percentage_flag === 95)?.volume ?? null,
      cap100: this.soundingMasters.find((s) => s.tank_category_detail === d.id && s.percentage_flag === 100)?.volume ?? null,
      isPending: false,
    }));

    const pendingRows: Omit<TankDetailRow, 'ser'>[] = this.pendingTankRows.map((p) => ({
      id: p.tempId,
      categoryName: p.categoryName,
      nomenclature: p.nomenclature,
      subtype: p.subtype,
      locationName: '—',
      cap95: null,
      cap100: null,
      isPending: true,
    }));

    this.tankDetailRows = [...savedRows, ...pendingRows].map((r, i) => ({ ...r, ser: i + 1 }));
  }

  addTanks(): void {
    const category = this.selectedCategoryInfo;
    if (!category) {
      this.toastr.warning('Select a Tank Category first.');
      return;
    }
    if (this.storageTankCount <= 0 && this.serviceTankCount <= 0) {
      this.toastr.warning('Enter at least one Storage or Service tank count.');
      return;
    }
    let n =
      this.pendingTankRows.filter((p) => p.tankCategoryId === category.id).length +
      this.tankTypeDetails.filter((d) => d.tank === category.id).length;

    for (let i = 0; i < this.storageTankCount; i++) {
      n++;
      this.pendingTankRows.push({
        tempId: this.nextTempId--,
        tankCategoryId: category.id,
        categoryName: category.tank_category,
        nomenclature: `${category.manual_name} Tank #${n}`,
        subtype: 'storage',
      });
    }
    for (let i = 0; i < this.serviceTankCount; i++) {
      n++;
      this.pendingTankRows.push({
        tempId: this.nextTempId--,
        tankCategoryId: category.id,
        categoryName: category.tank_category,
        nomenclature: `${category.manual_name} Service Tank #${n}`,
        subtype: 'service',
      });
    }
    this.rebuildTankDetailRows();
  }

  saveTankDetails(): void {
    if (!this.pendingTankRows.length) {
      this.toastr.warning('Nothing to save — add tanks first.');
      return;
    }
    const creates = this.pendingTankRows.map((p) =>
      this.api.createTankTypeDetail({ tank: p.tankCategoryId, tank_type: p.nomenclature, tank_subtype: p.subtype }),
    );
    forkJoin(creates).subscribe(() => {
      this.pendingTankRows = [];
      this.toastr.success('Tank details saved.');
      this.api.getTankTypeDetails().subscribe((res) => {
        this.tankTypeDetails = res.data;
        this.rebuildTankDetailRows();
      });
    });
  }

  requestDeleteTankDetail(row: TankDetailRow): void {
    this.rowPendingDelete = row;
    this.showDeleteConfirm = true;
  }

  confirmDeleteTankDetail(): void {
    const row = this.rowPendingDelete;
    this.showDeleteConfirm = false;
    this.rowPendingDelete = null;
    if (!row) return;

    if (row.isPending) {
      this.pendingTankRows = this.pendingTankRows.filter((p) => p.tempId !== row.id);
      this.rebuildTankDetailRows();
      return;
    }
    this.api.deleteTankTypeDetail(row.id).subscribe(() => {
      this.tankTypeDetails = this.tankTypeDetails.filter((d) => d.id !== row.id);
      this.soundingMasters = this.soundingMasters.filter((s) => s.tank_category_detail !== row.id);
      this.rebuildTankDetailRows();
    });
  }

  openSoundingModal(row: TankDetailRow): void {
    if (row.isPending) {
      this.toastr.warning('Save this tank before adding its sounding chart.');
      return;
    }
    this.soundingModalRow = row;
    const existing95 = this.soundingMasters.find((s) => s.tank_category_detail === row.id && s.percentage_flag === 95);
    const existing100 = this.soundingMasters.find((s) => s.tank_category_detail === row.id && s.percentage_flag === 100);
    this.sounding95 = { id: existing95?.id ?? null, mmLevel: existing95?.mm_level ?? null, volume: existing95?.volume ?? null };
    this.sounding100 = { id: existing100?.id ?? null, mmLevel: existing100?.mm_level ?? null, volume: existing100?.volume ?? null };
    this.showSoundingModal = true;
  }

  closeSoundingModal(): void {
    this.showSoundingModal = false;
    this.soundingModalRow = null;
  }

  saveSoundingChart(): void {
    const row = this.soundingModalRow;
    if (!row) return;
    if (
      this.sounding95.mmLevel == null ||
      this.sounding95.volume == null ||
      this.sounding100.mmLevel == null ||
      this.sounding100.volume == null
    ) {
      this.toastr.warning('Enter both mm Level and Volume for 95% and 100% capacity.');
      return;
    }
    if (this.sounding100.mmLevel <= this.sounding95.mmLevel) {
      this.toastr.warning('100% Capacity mm Level must be greater than 95% Capacity mm Level.');
      return;
    }

    const save95 = this.sounding95.id
      ? this.api.updateSoundingMaster(this.sounding95.id, { mm_level: this.sounding95.mmLevel, volume: this.sounding95.volume })
      : this.api.createSoundingMaster({
          tank_category_detail: row.id,
          mm_level: this.sounding95.mmLevel,
          volume: this.sounding95.volume,
          percentage_flag: 95,
        });
    const save100 = this.sounding100.id
      ? this.api.updateSoundingMaster(this.sounding100.id, { mm_level: this.sounding100.mmLevel, volume: this.sounding100.volume })
      : this.api.createSoundingMaster({
          tank_category_detail: row.id,
          mm_level: this.sounding100.mmLevel,
          volume: this.sounding100.volume,
          percentage_flag: 100,
        });

    forkJoin([save95, save100]).subscribe(() => {
      this.toastr.success('Sounding chart saved.');
      this.closeSoundingModal();
      this.api.getSoundingMasters().subscribe((res) => {
        this.soundingMasters = res.data;
        this.rebuildTankDetailRows();
      });
    });
  }

  private rebuildPolTypes(): void {
    this.polTypes = this.fluidTypes.map((t, i) => ({ id: t.id, ser: i + 1, polType: t.fluid_type }));
  }

  private rebuildPolNames(): void {
    this.polNames = this.fluids.map((f, i) => ({
      id: f.id,
      ser: i + 1,
      polName: f.fluid,
      polType: this.fluidTypeName(f.fluid_type),
      unit: f.measuring_unit,
    }));
  }

  private fluidTypeName(id: number): string {
    return this.fluidTypes.find((t) => t.id === id)?.fluid_type ?? '—';
  }

  private fluidName(id: number | null): string {
    if (id == null) return '';
    return this.fluids.find((f) => f.id === id)?.fluid ?? '—';
  }

  setTab(tab: MasterTab): void {
    this.activeTab = tab;
  }

  addPolType(): void {
    if (!this.newPolType.trim()) {
      this.toastr.warning('Enter a Fluid/POL Type name.');
      return;
    }
    this.api.createFluidType({ fluid_type: this.newPolType.trim() }).subscribe(() => {
      this.newPolType = '';
      this.api.getFluidTypes().subscribe((res) => {
        this.fluidTypes = res.data;
        this.rebuildPolTypes();
      });
    });
  }

  removePolType(row: PolTypeRow): void {
    this.api.deleteFluidType(row.id).subscribe(() => {
      this.fluidTypes = this.fluidTypes.filter((t) => t.id !== row.id);
      this.rebuildPolTypes();
    });
  }

  addPolName(): void {
    if (!this.newPolName.trim() || this.newPolNameType == null) {
      this.toastr.warning('Enter a Fluid/POL Name and select its Type.');
      return;
    }
    this.api
      .createFluid({ fluid: this.newPolName.trim(), fluid_type: this.newPolNameType, measuring_unit: this.newPolNameUnit })
      .subscribe(() => {
        this.newPolName = '';
        this.newPolNameType = null;
        this.api.getFluids().subscribe((res) => {
          this.fluids = res.data;
          this.rebuildPolNames();
        });
      });
  }

  removePolName(row: PolNameRow): void {
    this.api.deleteFluid(row.id).subscribe(() => {
      this.fluids = this.fluids.filter((f) => f.id !== row.id);
      this.rebuildPolNames();
    });
  }

  addTankCategory(): void {
    if (!this.newCategoryName.trim() || !this.newCategoryManualName.trim()) {
      this.toastr.warning('Enter both Category Name and Manual Name.');
      return;
    }
    this.api
      .createTankCategory({
        tank_category: this.newCategoryName.trim(),
        manual_name: this.newCategoryManualName.trim(),
        fluid: this.newCategoryPol,
      })
      .subscribe((created) => {
        this.newCategoryName = '';
        this.newCategoryManualName = '';
        this.newCategoryPol = null;
        this.tankCategories = [
          ...this.tankCategories,
          {
            id: created.id,
            ser: this.tankCategories.length + 1,
            categoryName: created.tank_category,
            manualName: created.manual_name,
            pol: this.fluidName(created.fluid),
          },
        ];
      });
  }

  removeTankCategory(row: TankCategoryRow): void {
    this.api.deleteTankCategory(row.id).subscribe(() => {
      this.tankCategories = this.tankCategories.filter((r) => r.id !== row.id);
    });
  }

  addTankLocation(): void {
    if (!this.newLocationName.trim()) {
      this.toastr.warning('Enter a Location Name.');
      return;
    }
    this.api.createTankLocation({ location_name: this.newLocationName.trim() }).subscribe((created) => {
      this.newLocationName = '';
      this.tankLocations = [
        ...this.tankLocations,
        { id: created.id, ser: this.tankLocations.length + 1, locationName: created.location_name },
      ];
    });
  }

  removeTankLocation(row: TankLocationRow): void {
    this.api.deleteTankLocation(row.id).subscribe(() => {
      this.tankLocations = this.tankLocations.filter((r) => r.id !== row.id);
    });
  }
}
