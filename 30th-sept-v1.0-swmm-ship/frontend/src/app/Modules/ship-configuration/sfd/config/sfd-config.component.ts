import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { Component, signal, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, inject, OnInit, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { CellCallbackParams, ColDef, RowData } from "ag-grid-community";
import {
  SelectCard,
  DataGrid,
  ActionRendererComponent,
  StatusChip,
  SelectInput,
  DropdownOption,
} from "../../../../shared/components";
import { CompartmentForm } from "./compartment-form/compartment-form";
import { SubdepartmentForm } from "./subdepartment-form/subdepartment-form";
import { ConfirmationAlert } from "./confirmation-alert/confirmation-alert";
import { MappingForm } from "./mapping-form/mapping-form";

import {
  Compartment,
  SubDepartment,
  SubDepartmentSummary,
  Mapping,
  ConfigSection,
  ModalType,
  ModalState,
  DeletePayload,
  LocationMapping,
  SfdEquipment,
  EquipmentCompartmentDropdownOption,
  CompartmentDropdownOption,
  CreateEquipmentSystemMappingPayload,
  MappedGridRow,
} from "./sfd-config.models";
import { MasterDataService } from "../../../../Core/services/master-data/master-data.service";
import { SfdConfigApiService } from "../services/sfd-config-api.service";
import { firstValueFrom } from "rxjs";
import { HttpErrorResponse } from "@angular/common/http";
import { CollapsibleSidebar } from "../../../../shared/components/collapsible-sidebar/collapsible-sidebar";
import { Manufacturer, Supplier, EquipmentMaster, DepartmentMaster, SystemMaster, ShipMaster } from "../../ship-configuration.model";
import { LocationMappingForm } from "./location-mapping/location-mapping";
import { SfdPreview } from "./sfd-preview/sfd-preview";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { SfdReferencesComponent } from "../sfd-references/sfd-references.component";
import { RhsiMasterModalComponent } from "../sfd-references/rhsi-master-modal.component";
import { formatDisplayDate } from "../../../../shared/utils/date-format";
/** Cell renderers below build HTML strings, so API-provided names must be escaped. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

interface SectionConfig extends SelectCard {
  icon: string;
  subHeading: string;
  modalType?: ModalType;
  buttonText?: string;
}

interface PaginatedRows<T> {
  count: number;
  results: T[];
}

@Component({
  selector: "app-sfd-config",
  standalone: true,
  imports: [FormsModule, DataGrid, SfdReferencesComponent, CollapsibleSidebar, SelectInput, LocationMappingForm, StatusChip, CompartmentForm, IconComponent, SubdepartmentForm, ConfirmationAlert, MappingForm, SfdPreview, RhsiMasterModalComponent, ButtonComponent],
  templateUrl: "./sfd-config.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./sfd-config.component.css"],
})
export class SfdConfigComponent implements OnDestroy,  OnInit {

  showFilter = signal<boolean>(false);
  isModalOpen = signal(false);
  activeModal = signal<ModalType>(null);
  selectedReferenceSection = signal('ship');
  dynamicGridHeight = signal('580px');
  masterMode = signal<'ship' | 'reference' | 'importData'>('ship');
  showSfdPreviewModal = signal<boolean>(false)
  equipmentMappingType = signal<'mapped' | 'unmapped'>('mapped');
  private readonly handleResize = () => this.updateDynamicGridHeight();
  readonly master = inject(MasterDataService);
  readonly sfdConfigApi = inject(SfdConfigApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly section = signal<ConfigSection>("compartment");
  readonly compRows = signal<Compartment[]>([]);
  readonly compTotalCount = signal<number>(0);
  readonly manufacturerRows = signal<Manufacturer[]>([]);
  readonly supplierRows = signal<Supplier[]>([]);
  readonly equipmenRows = signal<EquipmentMaster[]>([]);
  readonly standardDeptRows = signal<DepartmentMaster[]>([]);
  readonly systemMasterRows = signal<SystemMaster[]>([]);
  readonly shipMaster = signal<ShipMaster | null>(null);
  readonly formatDisplayDate = formatDisplayDate;
  readonly referenceTotalCount = signal<number>(0);
  readonly mapRows = signal<Mapping[]>([]);
  readonly mapTotalCount = signal(0);
  readonly mapCurrentPage = signal(1);
  readonly mapExpandedSystem = signal<string | null>(null);
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);
  readonly subRows = signal<SubDepartment[]>([]);
  readonly subTotalCount = signal<number>(0);
  readonly subDeptSummary = signal<SubDepartmentSummary | null>(null);
  readonly equipmentMapCount = signal<number>(0);
  readonly sidebarCollapsed = signal(false);
  readonly referenceSidebarCollapsed = signal(false);
  readonly equipmentOptions = this.master.equipmentOptions;
  readonly systemOptions = this.master.systemOptions;
  readonly locationRows = signal<LocationMapping[]>([]);
  readonly locationTotalCount = signal(0);

  private rowsFromResponse<T>(response: T[] | PaginatedRows<T>): T[] {
    return Array.isArray(response) ? response : response.results;
  }

  private countFromResponse<T>(response: T[] | PaginatedRows<T>): number {
    return Array.isArray(response) ? response.length : response.count;
  }

  private selectFilterValue(value: string | number | boolean | null | undefined): string | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    return String(value);
  }

  readonly equipmentApiOptions = signal<DropdownOption[]>([]);
  readonly systemApiOptions = signal<DropdownOption[]>([]);

  readonly sfdRows = signal<SfdEquipment[]>([]);
  readonly sfdTotalCount = signal(0);
  readonly pendingEquipmentSelection = signal<string | null>(null);
  readonly showSingleSystemWarning = signal(false);
  private compartmentRequestId = 0;

  compartmentOptions = signal<DropdownOption[]>([]);
  equipmentOptionsForFilter = signal<DropdownOption[]>([]);





  upperDecks = this.master.upperDecks;
  locations = this.master.locations;
  lowerDecks = this.master.lowerDecks;
  departments = this.master.departments;


  systemSearch = '';
  equipmentSearch = '';
  private dropdownSearchTimer: ReturnType<typeof window.setTimeout> | null = null;
  selectedSystems = signal<string[]>([]);
  selectedEquipments = signal<string[]>([]);

  readonly pendingMappingAction = signal<'toSystem' | 'toEquipment' | 'addMapping'  | null>(null);


  readonly pendingMappingActionIcon = computed(() => {
    switch (this.pendingMappingAction()) {
      case 'toSystem':
        return 'arrow-left';
      case 'toEquipment':
        return 'arrow-right';
      default:
        return 'link';
    }
  });

  get pendingMappingActionTitle(): string {
    switch (this.pendingMappingAction()) {
      case 'toSystem':
        return 'Move to System';
      case 'toEquipment':
        return 'Move to Equipment';
      case 'addMapping':
        return 'Add Mapping';
      default:
        return '';
    }
  }

  get pendingMappingActionDescription(): string {
    switch (this.pendingMappingAction()) {
      case 'toSystem': {
        const count = this.selectedEquipments().length;
        return `Reclassify ${count} checked item${count === 1 ? '' : 's'} as system? They will move from the Equipment panel into the System panel.`;
      }
      case 'toEquipment': {
        const count = this.selectedSystems().length;
        return `Reclassify ${count} checked item${count === 1 ? '' : 's'} as equipment? They will move from the System panel into the Equipment panel.`;
      }
      case 'addMapping': {
        const count = this.selectedEquipments().length;
        return `Map ${count} equipment ${count === 1 ? '' : 's'} under Navigation? The selected equipment will be linked to this system and moved into the Mapped list.

?`;
      }
      default:
        return '';
    }
  }


  readonly modalState = signal<ModalState>({
    type: null,
    data: null,
  });

  readonly filters = signal({
    search: '',
    mainDeck: false,
    upperDeck: '',
    lowerDeck: '',
    frameStation: '',
    location: '',
  });

  readonly locationMappingFilters = signal({
    equipment: '',
    compartment: '',
    mainDeck: false,
    upperDeck: '',
    lowerDeck: '',
    frameStation: '',
    location: '',
    mappingStatus: '' as '' | 'mapped' | 'unmapped',
  });


  readonly subFilters = signal({
    search: '',
    department: '',
    equipmentCount: '',
  });

  readonly mappingFilters = signal({
    equipment: '',
    system: '',
    mappingDateFrom: '',
    mappingDateTo: '',
  });


  readonly mapGroups = computed(() => {
    const rows = this.mapRows()
    const order: string[] = [];
    const bySystem = new Map<string, Mapping[]>();

    for (const row of rows) {
      // Key on the system id so two systems sharing a name stay separate groups.
      const key = row.systemId || row.system || 'Unmapped';
      if (!bySystem.has(key)) {
        bySystem.set(key, []);
        order.push(key);
      }
      bySystem.get(key)!.push(row);
    }

    return order.map(key => {
      const equips = bySystem.get(key)!;
      return {
        key,
        system: equips[0].system || 'Unmapped',
        equips,
        multi: equips.length > 1,
        expanded: this.mapExpandedSystem() === key,
      };
    });
  });

  /** Groups flattened for the data-grid: one header row per system, its remaining
   *  equipment rows only while that group is expanded. */
  readonly mapGridRows = computed<MappedGridRow[]>(() =>
    this.mapGroups().flatMap(group => {
      const [first, ...rest] = group.equips;

      const header: MappedGridRow = {
        ...first,
        groupKey: group.key,
        isChild: false,
        multi: group.multi,
        equipCount: group.equips.length,
        expanded: group.expanded,
      };

      if (!group.expanded) {
        return [header];
      }

      return [
        header,
        ...rest.map((row): MappedGridRow => ({
          ...row,
          groupKey: group.key,
          isChild: true,
          multi: false,
          equipCount: group.equips.length,
          expanded: true,
        })),
      ];
    })
  );

  /** Row click on a multi-equipment system header expands / collapses that group. */
  onMappingRowClicked(row: RowData): void {
    const mapped = row as MappedGridRow;

    if (!mapped?.multi || mapped.isChild) {
      return;
    }

    this.toggleMapGroup(mapped.groupKey);
  }

  private unmapRow(row: MappedGridRow): void {
    this.removeMapping(row);
  }



  readonly mapCols: ColDef[] = [
    {
      headerName: 'System',
      field: 'system',
      minWidth: 240,
      // No explicit maxWidth here previously, so it inherited the shared grid's default
      // maxColWidth (350px) — too tight for a compound label like "DIESEL ALTERNATOR
      // GOVERNING SYS (43ZPM-52H6) - NO-1 DA" plus its chevron icon, which is exactly the
      // kind of value this column renders. flex + maxWidth only actually behave (proportional
      // fill, capped growth) with this grid instance's [autoSizeStrategy]="{type:'fitGridWidth'}"
      // override (see the template) — the shared component's own default, fitCellContents, just
      // measures rendered content and ignores flex outright, which is why this and Addition
      // Date's flex kept either leaving a gap or fighting each other for space before that fix.
      maxWidth: 460,
      flex: 1,
      sortable: false,
      cellRenderer: (params: { data?: MappedGridRow }) => {
        const row = params.data;
        if (!row) return '';

        if (row.isChild) {
          return `<span style="padding-left:34px;font-weight:500;font-size:12px;color:color-mix(in srgb, var(--icon-accent) 50%, transparent)">${escapeHtml(row.system)}</span>`;
        }

        let chevron = '';
        if (row.multi) {
          const rotation = row.expanded ? 90 : 0;
          chevron = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7fb3e0" stroke-width="2.4"
                stroke-linecap="round" stroke-linejoin="round"
                style="flex:none;transition:transform .15s ease;transform:rotate(${rotation}deg)">
               <path d="m9 18 6-6-6-6"/>
             </svg>`;
        }

        return `<span style="display:inline-flex;align-items:center;gap:9px;font-weight:600;color:var(--icon-accent)">
                  ${chevron}${escapeHtml(row.system)}
                </span>`;
      },
    },
    {
      headerName: 'Equipment',
      field: 'equip',
      minWidth: 240,
      maxWidth: 460,
      flex: 1,
      sortable: false,
      cellRenderer: (params: { data?: MappedGridRow }) => {
        const row = params.data;
        if (!row) return '';

        const chip = !row.isChild && row.multi
          ? `<span style="display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;font-size:11px;
                line-height:18px;color:var(--icon-accent);background:rgba(168,85,247,.14);border:1px solid rgba(0,136,255,.40)">
               ${row.equipCount} Eqpts
             </span>`
          : '';

        return `<span style="display:inline-flex;align-items:center;gap:8px">${escapeHtml(row.equip)}${chip}</span>`;
      },
    },
    {
      headerName: 'Addition Date',
      field: 'mapping_date',
      minWidth: 150,
      maxWidth: 200,
      // Smaller flex share than System/Equipment's own (1 each) — this is a short fixed-
      // format date, not a name that needs the room. It still takes part in the fill (so no
      // bare gap shows up before pinned Actions if System/Equipment are already at their
      // maxWidth), it just doesn't compete for space the two name columns need more.
      flex: 0.5,
      sortable: false,
    },
    {
      headerName: 'Actions',
      width: 120,
      pinned: 'right',
      sortable: false,
      cellRenderer: ActionRendererComponent,
      cellStyle: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      },
      cellRendererParams: {
        actions: (row: RowData) => {
          const mapped = row as MappedGridRow;

          return [
            {
              icon: 'edit',
              label: 'Edit',
              color: '#7fb3e0',
              action: () => this.editMapping(mapped),
            },
            {
              icon: 'unlink',
              label: 'Unmap',
              color: '#F5B94B',
              action: () => this.removeMapping(mapped),
            },
          ];
        },
      },
    },
  ];

  setMappingType(type: 'mapped' | 'unmapped'): void {
    if (this.equipmentMappingType() === type) {
      return;
    }

    this.equipmentMappingType.set(type);

    if (type === 'mapped') {
      this.mapExpandedSystem.set(null);
      this.loadMappings(1, this.pageSize());
    }
  }

  toggleMapGroup(system: string): void {
    this.mapExpandedSystem.update(current => current === system ? null : system);
  }

  readonly sfdFilters = signal({
    search: '',
    system: '',
    subDepartment: '',
    location: '',
    maintopNo: '',
    status: '',
  });

  readonly sidebarItems = computed(() =>
    this.sections().map(section => ({
      id: section.id,
      label: section.title,
      subHeading: section.subHeading,
      icon: section.icon ?? '',
      badge: section.count
    }))
  );

  readonly referenceSidebarItems = computed(() =>
    this.referenceSections().map(item => ({
      id: item.id,
      label: item.title,
      subHeading: item.subHeading,
      badge: item.id === 'ship' ? undefined : item.count,
      icon: item.icon ?? "",
    }))
  );

  readonly mappingStatusOptions = [
    {
      label: 'Mapped',
      value: 'mapped',
    },
    {
      label: 'Unmapped',
      value: 'unmapped',
    },
  ];
  ngOnInit(): void {
    void this.master.load();
    this.loadSectionData(this.section());
    this.selectReference(this.selectedReferenceSection());
  }

  setMasterMode(mode: 'ship' | 'reference' | 'importData') {
    this.masterMode.set(mode);
  }

 // load data behalf on selected card
  private loadSectionData(section: ConfigSection): void {
    switch (section) {
      case 'compartment':
        this.loadCompartments(1, this.pageSize());
        break;

      case 'subdept':
        this.loadSubDepartments(1, this.pageSize());
        break;

      case 'mapping':
        this.loadMappings(1, this.pageSize());
        this.loadEquipmentSystemDropdown();
        break;

      case 'sfd':
        this.loadSfd(1, this.pageSize());
        break;

      case 'locationMapping':
        this.loadLocationMappings(1, this.pageSize());
        this.loadDropdowns()
        break;

      case "referenceData":
        // this.loadManufacturers();
        break;
    }
  }

  async loadLocationMappings(
    page = 1,
    pageSize = 10,
  ): Promise<void> {

    const filters = this.locationMappingFilters();

    try {
      const response = await firstValueFrom(
        this.sfdConfigApi.getEquipmentCompartmentMappings({
          page,
          page_size: pageSize,
          equipment: filters.equipment || undefined,
          compartment: filters.compartment || undefined,
          main_deck: filters.mainDeck || undefined,
          upper_deck: filters.upperDeck || undefined,
          lower_deck: filters.lowerDeck || undefined,
          frame_station: filters.frameStation || undefined,
          location: filters.location || undefined,
          mapping_status:
            filters.mappingStatus || undefined,
        })
      );

      this.locationRows.set(
        response.results.map((item): LocationMapping => ({
          id: item.id,
          equipment: item.equipment_name,
          equipmentId: item.equipment,
          compartment_name: item.compartment_name,
          compt_id: item.compartment,
          deck_no: item.deck_no,
          main_deck: false,
          upper_deck: null,
          lower_deck: null,
          frame_station_from: '',
          frame_station_to: '',
          frame_station: item.frame_station,
          location: item.location,
          mapping_status: item.mapping_status,
        }))
      );
      this.locationTotalCount.set(response.count);

    } catch (err) {
      console.error(err);
    }
  }
  loadLocationMappingsPage(event: { page: number; pageSize: number }) {
    this.loadLocationMappings(event.page, event.pageSize);
  }

  /** Single source for both lists: values are `universal_id_t_equipment_ship_detail`,
   *  the identifier the mapping/convert endpoints actually key on. */
  async loadEquipmentSystemDropdown(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.sfdConfigApi.getEquipmentSystemDropdown()
      );

      this.equipmentApiOptions.set(
        response.equipment.map(item => ({
          label: item.label,
          value: item.universal_id_t_equipment_ship_detail,
        }))
      );

      this.systemApiOptions.set(
        response.system.map(item => ({
          label: item.label,
          value: item.universal_id_t_equipment_ship_detail,
        }))
      );
    } catch (error) {
      console.error(error);
    }
  }

  onSystemSearchChange(value: string): void {
    this.systemSearch = value;
  }

  onEquipmentSearchChange(value: string): void {
    this.equipmentSearch = value;
  }

  readonly reloadCurrentSection = async () => {
    switch (this.section()) {
      case 'compartment':
        await this.loadCompartments(1, this.pageSize());
        break;

      case 'subdept':
        await this.loadSubDepartments(1, this.pageSize());
        break;

      case 'mapping':
        this.loadMappings(1, this.pageSize());
        break;

      case 'locationMapping':
        this.loadLocationMappings(1, this.pageSize());
        break
    }
  };
  loadSfdPage(event: { page: number; pageSize: number }) {
    this.loadSfd(event.page, event.pageSize);
  }


  async loadSfd(page = 1, pageSize = 10): Promise<void> {

    const filters = this.sfdFilters();

    try {

      const response = await firstValueFrom(
        this.sfdConfigApi.getShipFitDefinitions({
          page,
          page_size: pageSize,
          search: filters.search || undefined,
          system: filters.system || undefined,
          sub_department: filters.subDepartment || undefined,
          location: filters.location || undefined,
          maintop_no: filters.maintopNo || undefined,
          status: filters.status || undefined,
        })
      );

      this.sfdRows.set(response.results);
      this.sfdTotalCount.set(response.count);

    } catch (error) {
      console.error(error);
    }
  }

  // load compartment data
  async loadCompartments(page = 1, pageSize = 10): Promise<void> {
    try {
      const filters = this.filters();
      const requestId = ++this.compartmentRequestId;
      const response = await firstValueFrom(
        this.sfdConfigApi.getCompartments({
          page,
          page_size: pageSize,
          search: this.selectFilterValue(filters.search),
          main_deck: filters.mainDeck || undefined,
          upper_deck: this.selectFilterValue(filters.upperDeck),
          lower_deck: this.selectFilterValue(filters.lowerDeck),
          frame_station: this.selectFilterValue(filters.frameStation),
          location: this.selectFilterValue(filters.location),
         })
      );

      if (requestId !== this.compartmentRequestId) {
        return;
      }

      this.compRows.set(response.results);
      this.compTotalCount.set(response.count);
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse) {
        console.error(error);
      }
    }
  }

  // load subdepartment data
  async loadSubDepartments(
    page = 1,
    pageSize = 10,
  ): Promise<void> {
    try {
      const filters = this.subFilters();
      const response = await firstValueFrom(
        this.sfdConfigApi.getSubDepartments({
          page,
          page_size: pageSize,
          search: filters.search || undefined,
          department: filters.department
            ? Number(filters.department)
            : undefined,
          equipment_count: filters.equipmentCount
            ? Number(filters.equipmentCount)
            : undefined,
        })
      );

      this.subRows.set(response.results);
      this.subTotalCount.set(response.count);

    } catch (error) {
      console.error(error);
    }
    void this.loadSubDepartmentSummary();
  }

  private async loadSubDepartmentSummary(): Promise<void> {
    try {
      this.subDeptSummary.set(await firstValueFrom(this.sfdConfigApi.getSubDepartmentSummary()));
    } catch (error) {
      console.error(error);
    }
  }
  // for pagination compartment
  loadCompartmentsPage(event: { page: number; pageSize: number }) {
    this.loadCompartments(event.page, event.pageSize);
  }
  // for pagiation compartment
  loadSubDepartmentsPage(event: {
    page: number;
    pageSize: number;
  }) {
    this.loadSubDepartments(event.page, event.pageSize);
  }
  // for pagination reference data
  loadReferencePage(event: { page: number; pageSize: number }): void {
    switch (this.selectedReferenceSection()) {
      case 'manufacturer':
        this.loadManufacturers(event.page, event.pageSize);
        break;
      case 'supplier':
        this.loadSuppliers(event.page, event.pageSize);
        break;
      case 'equipment':
        this.loadEquipmentMaster(event.page, event.pageSize);
        break;
      case 'standardDept':
        this.loadDepartmentMaster(event.page, event.pageSize);
        break;
      case 'system':
        this.loadSystemMaster(event.page, event.pageSize);
        break;
    }
  }

  async loadManufacturers(page = 1, pageSize = 10): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.sfdConfigApi.getManufacturers({ page, page_size: pageSize })
      );
      this.manufacturerRows.set(response.results);
      this.referenceTotalCount.set(response.count);
      this.updateReferenceCount('manufacturer', response.count);

    } catch (error) {
      console.error(error);
    }
  }

  async loadSuppliers(page = 1, pageSize = 10): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.sfdConfigApi.getSuppliers({ page, page_size: pageSize })
      );

      this.supplierRows.set(response.results);
      this.referenceTotalCount.set(response.count);
      this.updateReferenceCount('supplier', response.count);
    } catch (error) {
      console.error(error);
    }
  }
  async loadEquipmentMaster(page = 1, pageSize = 10): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.sfdConfigApi.getEquipmentMaster({ page, page_size: pageSize })
      );

      this.equipmenRows.set(response.results);
      this.referenceTotalCount.set(response.count);
      this.updateReferenceCount('equipment', response.count);

    } catch (error) {
      console.error(error);
    }
  }
  async loadDepartmentMaster(page = 1, pageSize = 10): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.sfdConfigApi.getDepartmentMaster({ page, page_size: pageSize })
      );

      this.standardDeptRows.set(response.results);
      this.referenceTotalCount.set(response.count);
      this.updateReferenceCount('standardDept', response.count);

    } catch (error) {
      console.error(error);
    }
  }
  async loadSystemMaster(page = 1, pageSize = 10): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.sfdConfigApi.getSystemMaster({ page, page_size: pageSize })
      );
      this.systemMasterRows.set(response.results);
      this.referenceTotalCount.set(response.count);
      this.updateReferenceCount('system', response.count);

    } catch (error) {
      console.error(error);
    }
  }
  async loadShipMaster(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.sfdConfigApi.getShipMaster()
      );
      this.shipMaster.set(response);

    } catch (error) {
      console.error(error);
    }
  }

  async loadMappings(page = 1, pageSize = 10): Promise<void> {

    const filters = this.mappingFilters();

    try {
      const response = await firstValueFrom(
        this.sfdConfigApi.getEquipmentSystemMappings({
          page,
          page_size: pageSize,
          equipment: filters.equipment || undefined,
          system: filters.system || undefined,
          addition_date_from: filters.mappingDateFrom || undefined,
          addition_date_to: filters.mappingDateTo || undefined,
        })
      );

      const rows: Mapping[] = response.results.map((item): Mapping => ({
        equipmentId: item.equipment.universal_id_t_equipment_ship_detail,
        systemId: item.system?.universal_id_t_equipment_ship_detail ?? '',
        equip: item.equipment.label || '-',
        system: item.system?.label || 'Unmapped',
        mapping_date: (item.addition_date ?? '').trim(),
        status: item.mapping_status || 'mapped',
      }));

      this.mapCurrentPage.set(page);
      this.mapRows.set(rows);

      this.mapTotalCount.set(response.count);
      this.equipmentMapCount.set(response.count)
      this.updateReferenceCount('mapping', response.count);

    } catch (error) {
      console.error(error);
    }
  }

    private async loadDropdowns(): Promise<void> {
      const response = await firstValueFrom(
        this.sfdConfigApi.getEquipmentLocationDropdowns()
      );


      this.equipmentOptionsForFilter.set(
        response.equipment.map((item: EquipmentCompartmentDropdownOption) => ({
          label: item.label,
          value: item.id,
        }))
      );

      this.compartmentOptions.set(
        response.compartment.map((item: CompartmentDropdownOption) => ({
          label: item.label,
          value: item.id,
        }))
      );
    }

  loadMappingsPage(event: { page: number; pageSize: number }): void {
    this.loadMappings(event.page, event.pageSize);
  }
  readonly sections = computed<SectionConfig[]>(() => [
    {
      id: "compartment",
      title: "Compartments",
      subHeading: 'Compartments and spaces defined for the ship',
      count: this.compTotalCount(),
      icon: 'layout-grid',
      modalType: "compartment",
      buttonText: "Add Compartment",
    },
    {
      id: "subdept",
      title: "Sub-Departments",
      subHeading: "Sub-departments maintained under each ship department.",
      icon: 'users',
      count: this.subTotalCount(),
      modalType: "subDepartment",
      buttonText: "Add Sub Department",
    },
    {
      id: "mapping",
      title: "System-Equipment Mapping",
      subHeading: "Mapping of equipment to their parent onboard systems.",
      icon: 'link',
      count: this.equipmentMapCount(),
      modalType: "mapping",
      buttonText: "Add Mapping",
    },
    {
      id: "locationMapping",
      subHeading:"Mapping of equipment to onboard compartments and locations.",
      title: "Equipment Location Mapping",
      icon: 'map-pin',
      desc: "",
      count: this.locationTotalCount(),
      modalType: "locationMapping",
      buttonText: "Add Mapping",
    },
    {
      id: "sfd",
      title: "Ship Fit Defination",
      subHeading:"Master list of all equipment fitted onboard the ship.",
      icon: 'square-check-big',
      count: this.sfdTotalCount(),
      modalType: 'sfd',
      desc: "",

    },
    {
      id: "rhsiMaster",
      title: "RHSI Master",
      subHeading: "Sub Department / Vendor Code / RHSI assignment.",
      icon: 'clipboard-check',
      desc: "",
      count: 0,
    },

  ]);

  constructor() {
    this.updateDynamicGridHeight();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleResize);
    }
  }
  // for ui height of ref
  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResize);
    }

    if (this.dropdownSearchTimer) {
      clearTimeout(this.dropdownSearchTimer);
      this.dropdownSearchTimer = null;
    }
  }

  private updateDynamicGridHeight(): void {
    if (typeof window === 'undefined') return;
    const viewportHeight = window.innerHeight || 800;
    const height = Math.max(320, viewportHeight - 275);
    this.dynamicGridHeight.set(`${height}px`);
  }

  openModal(type: ModalType, data?: Compartment | SubDepartment | Mapping | LocationMapping | SfdEquipment ): void {
    this.modalState.set({
      type,
      data: data ?? null,
    });
  }

  openDeleteModal(payload: DeletePayload): void {
    this.modalState.set({
      type: 'delete',
      data: payload,
    });
  }

  closeModal(): void {
    this.modalState.set({ type: null, data: null });
  }

  get deletePayload(): DeletePayload | null {
    return this.modalState().type === 'delete'
      ? (this.modalState().data as DeletePayload)
      : null;
  }

  selectSection(id: string): void {
    const section = id as ConfigSection;

    if (this.section() === section) {
      return;
    }

    this.section.set(section);
    this.loadSectionData(section);
  }

  get currentSection(): SectionConfig | undefined {
    return this.sections().find(s => s.id === this.section());
  }

  get sectionTitle(): string {
    return this.sections().find(s => s.id === this.section())?.title ?? '';
  }

  get getSubHeading(): string{
    return this.sections().find(s => s.id === this.section())?.subHeading ?? '';
  }

  get sectionCount(): number | string {
    return this.sections().find(s => s.id === this.section())?.count ?? 0;
  }

  get addButtonText(): string {
    return this.currentSection?.buttonText ?? "Add";
  }

  get currentModalType(): ModalType {
    return this.currentSection?.modalType ?? null;
  }

  toogleFilter(): void {
    this.showFilter.update(value => !value);
  }

  readonly compCols: ColDef[] = [
    {
      headerName: 'Compartment Name',
      field: 'name',
      minWidth: 220,
      cellClass: "compartment-name"

    },
    {
      headerName: 'Deck No',
      valueGetter: (params: CellCallbackParams) => {
        const data = params.data as Compartment;

        return data.main_deck
          ? 'Main Deck'
          : (data.upper_deck_label ?? data.lower_deck_label ?? data.upper_deck ?? data.lower_deck);
      },
    },
    {
      headerName: 'Frame Station',
      field: "frame_station"
    },
    {
      headerName: 'Location',
      field: 'location',
      flex: 1,
      cellRenderer: (params: CellCallbackParams) => {
        const data = params.data as Compartment;
        const location = String(data?.location_label ?? data?.location ?? '');

        const dotClass = location.startsWith('Port')
          ? 'location-dot port'
          : 'location-dot starboard';

        return `
      <div class="location-cell">
        <span class="${dotClass}"></span>
        <span class="location-text">${escapeHtml(location)}</span>
      </div>
    `;
      },
    },


    {
      headerName: 'Actions',
      width: 120,
      pinned: 'right',
      cellRenderer: ActionRendererComponent,
      cellStyle: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      },
      cellRendererParams: {
        actions: [
          {
            icon: 'edit',
            label: 'Edit',
            color: '#2563eb',
            action: (row: Compartment) => this.editCompartment(row),
          },
          {
            icon: 'delete',
            label: 'Delete',
            color: '#dc2626',
            action: (row: Compartment) => this.removeCompartment(row),
          },
        ],
      },
    },
  ];


  readonly locationMapping: ColDef[] = [

    {
      headerName: 'Equipment',
      field: 'equipment',
      minWidth: 220,
    },


    {
      headerName: 'Compartment',
      field: 'compartment_name',
      flex: 1
    },

    {
      headerName: 'Deck No',
      field: "deck_no",
      flex: 1

    },
    {
      headerName: 'Frame Station',
      field: "frame_station",
      flex: 1
    },
    {
      headerName: 'Location',
      field: "location",
      flex: 1
    },
    {
      headerName: 'Mapping Status',
      field: 'mapping_status',
      flex: 1
    },

    {
      headerName: 'Actions',
      width: 120,
      pinned: 'right',
      cellRenderer: ActionRendererComponent,
      cellStyle: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      },
      cellRendererParams: {
        actions: [
          {
            icon: 'edit',
            label: 'Edit',
            color: '#2563eb',
            action: (row: LocationMapping) =>
              this.editLocationMapping(row),
          },
          {
            icon: 'delete',
            label: 'Delete',
            color: '#dc2626',
            action: (row: LocationMapping) =>
              this.removeLocationMapping(row),
          },
        ],
      },
    },
  ];

  readonly subCols: ColDef[] = [

    {
      headerName: 'Sub Department',
      field: 'name',
      flex: 1,
      minWidth: 220,
    },


    {
      headerName: 'Department',
      field: 'department_name',
      flex: 1,
    },

    {
      headerName: 'Equipment Count',
      field: 'equipment_count',
      flex: 1,
    },

    {
      headerName: 'Source',
      field: 'source',
      flex: 1,
      cellRenderer: (params: CellCallbackParams) => {
        const data = params.data as SubDepartment;
        const isCmms = data?.source === 'CMMS';
        const cls = isCmms ? 'source-badge source-badge--cmms' : 'source-badge source-badge--swmm';
        return `<span class="${cls}">${escapeHtml(data?.source ?? '')}</span>`;
      },
    },

    {
      headerName: 'Actions',
      width: 120,
      pinned: 'right',
      cellRenderer: ActionRendererComponent,
      cellStyle: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      },
      cellRendererParams: {
        actions: [
          {
            icon: 'edit',
            label: 'Edit',
            color: '#2563eb',
            action: (row: SubDepartment) =>
              this.editSubDepartment(row),
          },
          {
            icon: 'delete',
            label: 'Delete',
            color: '#dc2626',
            action: (row: SubDepartment) =>
              this.removeSubDepartment(row),
          },
        ],
      },
    },
  ];
  readonly sfdCols:  ColDef[] = [
    {
      headerName: 'Equipment Code',
      field: 'equipment_code',
      minWidth: 220,
    },
    {
      headerName: 'Equipment Name',
      field: 'equipment_name',
      minWidth: 220,
    },
    {
      headerName: 'Serial No',
      field: 'equipment_sr_no',
      minWidth: 220,
    },
    {
      headerName: 'OEM',
      field: 'manufacturer_name',
      minWidth: 220,
    },
    {
      headerName: 'Supplier',
      field: 'supplier_name',
      minWidth: 220,
    },
    {
      headerName: 'Installation Date',
      field: 'installation_date',
      minWidth: 220,
    },
    {
      headerName: 'Comparment',
      field: 'location_on_board',
      minWidth: 220,
    },
    {
      headerName: 'Maintop No.',
      field: 'maintop_id',
      minWidth: 220,
    },
    {
      headerName: 'Location',
      field: 'location_code',
      minWidth: 220,
    },
    {
      headerName: 'Qty Fitted',
      field: 'no_of_fits',
      minWidth: 220,
    },

    {
      headerName: 'Status	',
      field: 'status',
      minWidth: 220,
    },


  ]
  handleSfdViewModel(row: SfdEquipment):void {
    this.openModal('sfd', row)
  }



  readonly referenceDataMap: Record<string, { columns: ColDef[]; rows: Record<string, unknown>[] }> = {
    ship: {
      columns: [
        { headerName: 'Ship Code', field: 'code', flex: 1 },
        { headerName: 'Ship Name', field: 'name', flex: 2 },
        { headerName: 'Status', field: 'status', flex: 1 },
        { headerName: 'Remarks', field: 'remarks', flex: 2 },
      ],
      rows: [

      ],
    },
    equipment: {
      columns: [
        { headerName: 'Equipment Code', field: 'equipment_code' , flex: 1},
        { headerName: 'Equipment Name', field: 'equipment_name', flex: 1 },
        { headerName: 'Equipment Model', field: 'equipment_model', flex: 1 },
        { headerName:  'Maintop Number', field: 'maintop_number', flex: 1},
        { headerName: 'Manufacturer Name', field: 'manufacturer_name', flex: 1},
        { headerName: 'Authority', field: 'authority', flex: 1},
        { headerName: 'ILMS Equipment Code', field: 'ilms_equipment_code', flex: 1},

      ],
      rows: [],
    },
    system: {
      columns: [
        { headerName: 'System Code', field: 'system_code', flex: 1 },
        { headerName: 'System Name', field: 'system_name' , flex: 1},
        { headerName: 'System Model', field: 'system_model', flex: 1},
        { headerName: 'Maintop Number', field: 'maintop_number', flex: 1 },
        { headerName: 'Manufacturer Name', field: 'manufacturer_name',  flex: 1 },
        { headerName: 'Authority', field: 'authority',  flex: 1},
        { headerName: 'ILMS System Code', field: 'ilms_system_code',  flex: 1}
      ],
      rows: [],
    },
    equipmentType: {
      columns: [
        { headerName: 'Type Code', field: 'code', flex: 1 },
        { headerName: 'Type Name', field: 'name' , flex: 1},
        { headerName: 'Group', field: 'group', flex: 1 },
      ],
      rows: [],
    },
    equipmentCategory: {
      columns: [
        { headerName: 'Category Code', field: 'code', flex: 1 },
        { headerName: 'Category Name', field: 'name', flex: 2 },
        { headerName: 'Description', field: 'description', flex: 2 },
      ],
      rows: [],
    },
    manufacturer: {
      columns: [
        { headerName: 'Manufacturer', field: 'name', flex: 1},
        { headerName: 'Country Code', field: 'country_code', flex: 1},
        { headerName: 'Address', field: 'address', flex: 1},
        { headerName: 'Contact Number', field: 'contact_number', flex: 1},
        { headerName: 'Email ID', field: 'email_id', flex: 1},
      ],
      rows: [
      ],
    },
    supplier: {
      columns: [
        { headerName: 'Supplier', field: 'supplier_name', flex: 1},
        { headerName: 'Supplier Code', field: 'supplier_code', flex: 1 },
        { headerName: 'Address', field: 'address', flex: 1 },
        { headerName: 'Contact Number', field: 'contact_number' , flex: 1},
        { headerName: 'Email ID', field: 'email_id', flex: 1},
        { headerName: 'Country Code', field: 'country_code', flex: 1},
      ],
      rows: [],
    },
    standardDept: {
      columns: [
        { headerName: 'Dept Code', field: 'dept_code', flex: 1 },
        { headerName: 'Dept Name', field: 'dept_name', flex: 1 },
        { headerName: 'No. OF Sub Dept', field: 'no_of_sub_department', flex: 1 },
        { headerName: 'HOD', field: 'hod', flex: 1 },
        { headerName: 'HOD Number', field: 'personal_no', flex: 1 }
      ],
      rows: [],
    },
  };

  readonly referenceSections = signal([
    {
      id: 'ship',
      title: 'Ship Master',
      icon: 'layout-grid',
      subHeading:'',
      count: 0,
      description: 'Master list of ships.',
    },
    {
      id: 'equipment',
      title: 'Equipment Master',
      icon: 'box',
      subHeading: '',
      count: 0,
      description: 'Master list of onboard equipment.',
    },
    {
      id: 'system',
      title: 'System Master',
      icon: 'settings',
      subHeading: '',
      count: 0,
      description: 'Master list of onboard systems.',
    },
    {
      id: 'manufacturer',
      title: 'Manufacturer',
      subHeading: '',
      icon: 'factory',
      count: 0,
      description: 'Manufacturer master.',
    },
    {
      id: 'supplier',
      title: 'Supplier',
      subHeading: '',
      icon: 'truck',
      count: 0,
      description: 'Approved equipment suppliers.',
    },
    {
      id: 'standardDept',
      title: 'Standard Departments',
      subHeading: '',
      icon: 'users',
      count: 0,
      description: 'Standard department structure used across ships.',
    },
  ]);
  get referenceColumnDefs() {
    return this.referenceDataMap[this.selectedReferenceSection()]?.columns ?? this.referenceDataMap['system'].columns;
  }

  get referenceRowData() {

    if (this.selectedReferenceSection() === "manufacturer") {
      return this.manufacturerRows().map(item => ({
        code: item.manufacturer_code,
        name: item.manufacturer_name,
        manufacturer_id: item.manufacturer_id,
        address: item.address,
        country_code: item.country_code,
        contact_number: item.contact_number,
        email_id: item.email_id,
        universal_id_M_manufacturer: item.universal_id_M_manufacturer,
        universal_id_M_country: item.universal_id_M_country,
      }));
    }


    if (this.selectedReferenceSection() === "supplier") {
      return this.supplierRows().map(item => ({
        supplier_code: item.supplier_code,
        supplier_name: item.supplier_name,
        address: item.address,
        country_code: item.country_code,
        contact_number: item.contact_number,
        email_id: item.email_id,
      }));
    }

    if (this.selectedReferenceSection() === "equipment") {
      return this.equipmenRows().map(item => ({
        equipment_name: item.equipment_name,
        equipment_code: item.equipment_code,
        equipment_model: item.equipment_model,
        maintop_number: item.maintop_number,
        manufacturer_name: item.manufacturer_name,
        authority: item.authority,
        ilms_equipment_code: item.ilms_equipment_code,
        equipment_type: item.equipment_type
      }))
    }
    if (this.selectedReferenceSection() === "standardDept") {
      return this.standardDeptRows().map(item => ({
        dept_code: item.dept_code,
        dept_name: item.dept_name,
        no_of_sub_department: item.no_of_sub_department,
        hod: item.hod,
        personal_no: item.personal_no

      }))
    }
    if (this.selectedReferenceSection() === "system") {
      return this.systemMasterRows().map(item => ({
        system_code: item.system_code,
        system_name: item.system_name,
        system_model: item.system_model,
        maintop_number: item.maintop_number,
        manufacturer_name: item.manufacturer_name,
        authority: item.authority,
        ilms_system_code: item.ilms_system_code,


      }))
    }



    return (
      this.referenceDataMap[this.selectedReferenceSection()]?.rows ??
      this.referenceDataMap["system"].rows
    );
  }


  selectReference(id: string) {
    this.selectedReferenceSection.set(id);


    if (id === "ship") {
      this.loadShipMaster()
    }

    if (id === "manufacturer") {
      this.loadManufacturers();
    }
    if (id === "supplier") {
      this.loadSuppliers();
    }
    if (id === "equipment") {
      this.loadEquipmentMaster()
    }
    if (id === "standardDept") {
      this.loadDepartmentMaster()
    }
    if (id === "system") {
      this.loadSystemMaster()
    }
  }

  get currentReference() {
    return (
      this.referenceSections().find(
        x => x.id === this.selectedReferenceSection()
      ) ?? this.referenceSections()[0]
    );
  }

  openMapEquipmentModal(row: Mapping): void {
  this.modalState.set({
    type: 'mapEquipment',
    data: row,
  });
}

  editCompartment(row: Compartment): void {
    this.openModal('compartment', row);
  }

  editSubDepartment(row: SubDepartment): void {
    this.openModal('subDepartment', row);
  }
  editLocationMapping(row: LocationMapping): void {
    this.openModal("locationMapping", row)
  }

  editMapping(row: Mapping): void {
    this.openModal('mapping', row);
  }

  get compartmentData(): Compartment | null {
    return this.modalState().type === 'compartment'
      ? this.modalState().data as Compartment
      : null;
  }

  get subDepartmentData(): SubDepartment | null {
    return this.modalState().type === 'subDepartment'
      ? this.modalState().data as SubDepartment
      : null;
  }
  get mappingData(): Mapping | null {
    return this.modalState().type === 'mapping'
      ? this.modalState().data as Mapping
      : null;
  }
  get mappingEquipmentData(): Mapping | null {
    return this.modalState().type === 'mapEquipment'
      ? this.modalState().data as Mapping
      : null;
  }

  get locationMappingData(): LocationMapping | null {
    return this.modalState().type === 'locationMapping'
      ? (this.modalState().data as LocationMapping)
      : null;
  }

  get sfdPreviewData(): SfdEquipment | null {
    return this.modalState().type === "sfd" ?
      (this.modalState().data as SfdEquipment) : null
  }

  // --- Delete handlers (one per entity) --------------------------------------
  removeCompartment(row: Compartment): void {
    this.openDeleteModal({ type: 'compartment', data: row });
  }

  removeSubDepartment(row: SubDepartment): void {
    this.openDeleteModal({ type: 'subDepartment', data: row });
  }

  removeLocationMapping(row: LocationMapping): void{
    this.openDeleteModal({type: "loactionMapping", data: row})
  }

  removeMapping(row: Mapping): void {
    this.openDeleteModal({ type: 'mapping', data: row });
  }

  // for compartment
  updateFilter<K extends keyof ReturnType<typeof this.filters>>(
    key: K,
    value: ReturnType<typeof this.filters>[K],
  ): void {
    this.filters.update(filters => {
      const next = {
        ...filters,
        [key]: value,
      };

      if (key === 'mainDeck' && value) {
        next.upperDeck = '';
        next.lowerDeck = '';
      }

      if (key === 'upperDeck' && value) {
        next.mainDeck = false;
        next.lowerDeck = '';
      }

      if (key === 'lowerDeck' && value) {
        next.mainDeck = false;
        next.upperDeck = '';
      }

      return next;
    });

    this.loadCompartments(1, this.pageSize());
  }
  // for sub department
  updateSubFilter<
    K extends keyof ReturnType<typeof this.subFilters>
  >(
    key: K,
    value: ReturnType<typeof this.subFilters>[K],
  ): void {

    this.subFilters.update(filters => ({
      ...filters,
      [key]: value,
    }));

    this.loadSubDepartments(1, this.pageSize());
  }

  updateSfdFilter<
    K extends keyof ReturnType<typeof this.sfdFilters>
  >(
    key: K,
    value: ReturnType<typeof this.sfdFilters>[K],
  ): void {

    this.sfdFilters.update(filters => ({
      ...filters,
      [key]: value,
    }));

    this.loadSfd(1, this.pageSize());
  }

  updateMappingFilter<
    K extends keyof ReturnType<typeof this.mappingFilters>
  >(
    key: K,
    value: ReturnType<typeof this.mappingFilters>[K],
  ): void {

    this.mappingFilters.update(filters => ({
      ...filters,
      [key]: value,
    }));

    this.loadMappings(1, this.pageSize());
  }


  resetFilters(): void {
    if (this.section() === "subdept") {
      this.subFilters.set({
        search: '',
        department: '',
        equipmentCount: '',
      });

      this.loadSubDepartments(1, this.pageSize());
    }

    if (this.section() === "compartment") {
      this.filters.set({
        search: '',
        mainDeck: false,
        upperDeck: '',
        lowerDeck: '',
        frameStation: '',
        location: '',
      });

      this.loadCompartments(1, this.pageSize());
    }

    if (this.section() === 'mapping') {

      this.mappingFilters.set({
        equipment: '',
        system: '',
        mappingDateFrom: '',
        mappingDateTo: '',
      });

      this.loadMappings(1, this.pageSize());
    }

    if (this.section() === 'sfd') {

      this.sfdFilters.set({
        search: '',
        system: '',
        subDepartment: '',
        location: '',
        maintopNo: '',
        status: '',
      });

      this.loadSfd(1, this.pageSize());
    }

    if (this.section() === "locationMapping") {
      this.locationMappingFilters.set({
        equipment: '',
        compartment: '',
        mainDeck: false,
        upperDeck: '',
        lowerDeck: '',
        frameStation: '',
        location: '',
        mappingStatus: ""
      });

      this.loadLocationMappings();
    }

  }

  // update reference count for enterprize

  private updateReferenceCount(id: string, count: number): void {
    this.referenceSections.update(items =>
      items.map(item =>
        item.id === id
          ? { ...item, count }
          : item
      )
    );
  }

  updateLocationMappingFilter(
    key: keyof ReturnType<typeof this.locationMappingFilters>,
    value: string | boolean
  ): void {
    this.locationMappingFilters.update(filters => ({
      ...filters,
      [key]: value,
    }));

    this.loadLocationMappings();
  }

  get filteredSystems(): DropdownOption[] {
    const term = this.systemSearch.trim().toLowerCase();
    const selectedEquipmentIds = new Set(this.selectedEquipments());
    const options = this.systemApiOptions().filter(
      opt => !selectedEquipmentIds.has(String(opt.value))
    );
    if (!term) {
      return options;
    }
    return options.filter(opt => opt.label.toLowerCase().includes(term));
  }

  get filteredEquipments(): DropdownOption[] {
    const term = this.equipmentSearch.trim().toLowerCase();
    const selectedSystemIds = new Set(this.selectedSystems());
    const options = this.equipmentApiOptions().filter(
      opt => !selectedSystemIds.has(String(opt.value))
    );
    if (!term) {
      return options;
    }
    return options.filter(opt => opt.label.toLowerCase().includes(term));
  }

  toggleSystem(id: string): void {
    const current = this.selectedSystems();

    if (current.includes(id)) {
      this.selectedSystems.set(current.filter(x => x !== id));
      return;
    }

    if (this.selectedEquipments().length > 0) {
      this.selectedSystems.set([id]);
    } else {
      this.selectedSystems.set([...current, id]);
    }
  }

  handleResetSystemOrEquipment(type: string): void {
    if (type === "system") {
      this.selectedSystems.set([]);
      this.systemSearch = '';
    } else {
      this.selectedEquipments.set([]);
      this.equipmentSearch = '';
    }
  }

  toggleEquipment(id: string): void {
    const systems = this.selectedSystems();

    if (systems.length > 1) {
      this.pendingEquipmentSelection.set(id);
      this.showSingleSystemWarning.set(true);
      return;
    }

    this.applyEquipmentSelection(id);
  }

  private applyEquipmentSelection(id: string): void {
    const current = this.selectedEquipments();

    if (current.includes(id)) {
      this.selectedEquipments.set(current.filter(x => x !== id));
      return;
    }

    this.selectedEquipments.set([...current, id]);
  }

  // toggleEquipment(id: string): void {
  //   const current = this.selectedEquipments();
  //   if (current.includes(id)) {
  //     this.selectedEquipments.set(current.filter(x => x !== id));
  //     return;
  //   }
  //   const systems = this.selectedSystems();
  //   if (systems.length > 1) {
  //     this.selectedSystems.set([systems[0]]);
  //   }
  //   // Always keep only one equipment selected
  //   this.selectedEquipments.set([...current, id]);
  // }

  confirmSingleSystemSelection(): void {
    const systems = this.selectedSystems();
    this.selectedSystems.set([systems[0]]);
    const equipmentId = this.pendingEquipmentSelection();
    if (equipmentId) {
      this.applyEquipmentSelection(equipmentId);
    }
    this.pendingEquipmentSelection.set(null);
    this.showSingleSystemWarning.set(false);
  }

  cancelSingleSystemSelection(): void {
    this.selectedSystems.set([]);
    this.pendingEquipmentSelection.set(null);
    this.showSingleSystemWarning.set(false);

  }

  async moveToEquipment(): Promise<void> {
    try {
      this.selectedSystems.set([]);
      await this.loadEquipmentSystemDropdown();
      await this.loadMappings(this.mapCurrentPage(), this.pageSize());

    } catch (error) {
      console.error(error);
    }
  }


  async moveToSystem(): Promise<void> {

    try {
      this.selectedEquipments.set([]);
      await this.loadEquipmentSystemDropdown();
      await this.loadMappings(this.mapCurrentPage(), this.pageSize());

    } catch (error) {
      console.error(error);
    }
  }

  readonly canMoveToEquipment = computed(() =>
    this.selectedSystems().length > 0
  );

  readonly canMoveToSystem = computed(() =>
    this.selectedEquipments().length > 0
  );

  readonly hasBothSelections = computed(() =>
    this.selectedSystems().length > 0 &&
    this.selectedEquipments().length > 0
  );

  requestMoveToSystem(): void {
    if (!this.canMoveToSystem() || this.hasBothSelections()) {
      return;
    }

    this.pendingMappingAction.set('toSystem');
  }

  requestMoveToEquipment(): void {
    if (!this.canMoveToEquipment() || this.hasBothSelections()) {
      return;
    }

    this.pendingMappingAction.set('toEquipment');
  }

  requestAddMapping(): void {
    if (!this.hasBothSelections()) {
      return;
    }

    this.pendingMappingAction.set('addMapping');
  }



  readonly mappingActionSaving = signal(false);

  cancelPendingMappingAction(): void {
    this.pendingMappingAction.set(null);
  }

  async confirmPendingMappingAction(): Promise<void> {
    const action = this.pendingMappingAction();

    this.mappingActionSaving.set(true);
    let succeeded = true;
    try {
      switch (action) {
        case 'toSystem':
          await this.moveToSystem();
          break;
        case 'toEquipment':
          await this.moveToEquipment();
          break;
        case 'addMapping':
          succeeded = await this.addEqMapping();
          break;
      }
    } finally {
      this.mappingActionSaving.set(false);
    }

    if (succeeded) {
      this.pendingMappingAction.set(null);
    }
    this.cdr.markForCheck();
  }


  async addEqMapping(): Promise<boolean> {
    const systemUid = this.selectedSystems()[0];
    const equipmentUids = this.selectedEquipments();

    try {
      const payload: CreateEquipmentSystemMappingPayload = {
        equipment: equipmentUids,
        system: systemUid,
      };

      await firstValueFrom(
        this.sfdConfigApi.addEquipmentSystemMapping(payload)
      );

      this.selectedSystems.set([]);
      this.selectedEquipments.set([]);

      await this.loadMappings(1, this.pageSize());
      await this.loadEquipmentSystemDropdown();

      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }


}
