import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { PanelCard } from "../../../../shared/components/panel-card/panel-card";
import { CellCallbackParams, ColDef, ICellRendererParams } from "ag-grid-community";
import { SrarService, SrarRunningHoursEquipmentItem } from "../services/srar.service";
import { SelectInput, DropdownOption } from "../../../../shared/components/select-input/select-input";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";

export interface SrarMasterItem {
  id: string;
  srarTab: string;
  nomenclature: string;
  equipmentClass?: string;
  serialNo?: string;
  locationOnBoard?: string;
}

export interface EquipmentValidityItem {
  id: string;
  equipmentName: string;
  source: string;
  lastCalibrationDate: string;
  validityMonths: number;
  nextCalibrationDue: string;
}

export interface RunningUpdateItem {
  id: string;
  updateTitle: string;
  validTill: string;
  createdDate: string;
}

export interface ShipDetailItem {
  id: string;
  shipName: string;
  shipType: string;
  commissionDate: string;
}

export interface SrarEquipmentCategory {
  code: string; // universal_id_ch_master_equipment_type — the SFD/Form-1 filter key
  equipmentTypeId: string;
  desc: string;
}

interface SrarMasterEquipmentOnlyRow {
  id?: number | string;
  name?: string;
  equipment_type_id?: number | string;
  equipment_desc?: string;
  universal_id_ch_master_equipment_type?: string;
}

export function getRandom4DigitNumber(): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return 1000 + (array[0] % 9000);
}

@Component({
  selector: "app-srar-masters",
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ModalComponent, DataGrid, PanelCard, SelectInput, HelpGuidance, ButtonComponent],
  templateUrl: "./srar-masters.component.html",
  styleUrls: ["./srar-masters.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SrarMastersComponent implements OnInit {
  readonly helpHtml = `
    <h6 class="fw-bold mb-2">What each tab is for</h6>
    <ul class="mb-0">
      <li><strong>Add SRAR Equipment List</strong> - use "Add SRAR Equipment" to assign equipment to an SRAR tab/section, or "Lubricant & Test Kits" to add a text entry under Test Kits or Lubricant.</li>
      <li><strong>Equipment Validity</strong> - set the last calibration date and validity (months) for H2S Sensor, Torsionmeter, and Test Kit equipment, then click Update to recalculate the next calibration due date.</li>
      <li><strong>Running Updates and Ship Details</strong> - reserved for related master data.</li>
    </ul>
  `;

  private readonly srarService = inject(SrarService);

  // Active Tab
  activeTab = signal<'equipmentList' | 'validity' | 'updates' | 'shipDetails'>('equipmentList');

  // Modals visibility
  isAddEquipmentModalOpen = signal<boolean>(false);
  isAddTypeModalOpen = signal<boolean>(false);
  isDeleteConfirmModalOpen = signal<boolean>(false);
  equipmentToDelete = signal<SrarMasterItem | null>(null);

  // The 28 Ch_Master_Equipment_Type categories (from srar_masterequipment), and the
  // real SFD equipment available under whichever one is currently selected.
  categories: SrarEquipmentCategory[] = [];
  availableEquipments = signal<SrarRunningHoursEquipmentItem[]>([]);
  loadingAvailableEquipments = signal<boolean>(false);

  // Types sections for Modal 2
  typeSections: string[] = ["Test Kits", "Lubricant"];

  // Tab 1: Master Equipment List Data
  masterEquipments = signal<SrarMasterItem[]>([]);

  // Tab 2: Equipment Validity Data
  validityList = signal<EquipmentValidityItem[]>([]);

  // Tab 3: Running Updates Data
  runningUpdates = signal<RunningUpdateItem[]>([]);
  updatesSearch = signal<string>("");

  // Tab 4: Ship Details Data
  shipDetails = signal<ShipDetailItem[]>([]);
  shipSearch = signal<string>("");

  ngOnInit(): void {
    this.loadMasterEquipmentsOnly();
    this.loadMasterEquipments();
    this.loadEquipmentValidities();
    this.loadRunningUpdates();
    this.loadShipDetails();
  }

  loadMasterEquipmentsOnly(): void {
    this.srarService.getMasterEquipmentsOnly().subscribe({
      next: (data: SrarMasterEquipmentOnlyRow[]) => {
        if (!data || !Array.isArray(data)) return;
        this.categories = data
          .map((item: SrarMasterEquipmentOnlyRow): SrarEquipmentCategory => ({
            code: String(item.universal_id_ch_master_equipment_type || ""),
            equipmentTypeId: String(item.equipment_type_id || ""),
            desc: String(item.equipment_desc || item.name || "").trim()
          }))
          .filter(category => category.code && category.desc);
      },
      error: (err: unknown) => console.error("Failed to load srar_masterequipment list:", err)
    });
  }

  // Real SFD equipment fitted under the chosen category — the second picker, once a
  // category is selected in the Add SRAR Equipment modal.
  loadAvailableEquipments(categoryCode: string): void {
    this.availableEquipments.set([]);
    this.selectedEquipmentIds.set([]);
    if (!categoryCode) return;
    this.loadingAvailableEquipments.set(true);
    this.srarService.getSfdEquipmentByType(categoryCode).subscribe({
      next: (rows) => {
        this.availableEquipments.set(rows);
        this.loadingAvailableEquipments.set(false);
      },
      error: (err: unknown) => {
        console.error("Failed to load SFD equipment for category:", err);
        this.loadingAvailableEquipments.set(false);
      }
    });
  }

  loadMasterEquipments(): void {
    this.srarService.getEquipments().subscribe({
      next: (data) => this.handleMasterEquipmentsResponse(data),
      error: (err) => console.error("Failed to load master equipments:", err)
    });
  }

  private handleMasterEquipmentsResponse(data: unknown): void {
    if (!data || !Array.isArray(data)) return;

    const items: SrarMasterItem[] = data.map((item, idx) => this.mapToMasterItem(item, idx));
    this.masterEquipments.update(existing => this.mergeMasterEquipments(existing, items));


  }

  private mapToMasterItem(item: unknown, idx: number): SrarMasterItem {
    const raw = item as Record<string, unknown>;
    return {
      id: String(raw['id'] || idx + 1),
      srarTab: String(raw['srar_type'] || raw['srar_section'] || "Equipment Exploitation"),
      nomenclature: String(raw['name'] || raw['nomenclature'] || ""),
      equipmentClass: String(raw['equipment_class'] || ""),
      serialNo: String(raw['serial_no'] || ""),
      locationOnBoard: String(raw['location_on_board'] || "")
    };
  }

  private mergeMasterEquipments(existing: SrarMasterItem[], newItems: SrarMasterItem[]): SrarMasterItem[] {
    const merged = [...newItems];
    const existingKeys = new Set(newItems.map(m => `${m.srarTab}::${m.nomenclature}`));

    for (const e of existing) {
      const key = `${e.srarTab}::${e.nomenclature}`;
      if (!existingKeys.has(key)) {
        merged.push(e);
        existingKeys.add(key);
      }
    }
    return merged;
  }

  loadEquipmentValidities(): void {
    this.srarService.getEquipmentValidities().subscribe({
      next: (data) => {
        if (data && Array.isArray(data) && data.length > 0) {
          const list: EquipmentValidityItem[] = data.map((item, idx: number) => {
            const row = item as Record<string, unknown>;

            let validityMonths: number = null as unknown as number;
            const rawValidityMonths = row["validityMonths"] ?? row["validity_months"];
            if (rawValidityMonths !== undefined && rawValidityMonths !== null) {
              validityMonths = Number(rawValidityMonths);
            }

            const record: EquipmentValidityItem = {
              id: String(row["id"] || idx + 1),
              equipmentName: String(row["equipmentName"] || row["equipment_name"] || row["name"] || row["equipment"] || ""),
              source: String(row["source"] || "General"),
              lastCalibrationDate: String(row["lastCalibrationDate"] || row["last_calibration_date"] || ""),
              validityMonths,
              nextCalibrationDue: String(row["nextCalibrationDue"] || row["next_calibration_due"] || "")
            };
            this.calculateNextDue(record);
            return record;
          });
          this.validityList.set(list);
        }
      },
      error: (err) => console.error("Failed to load equipment validities:", err)
    });
  }

  calculateNextDue(item: EquipmentValidityItem): void {
    if (!item.lastCalibrationDate || item.validityMonths === null || item.validityMonths === undefined || isNaN(Number(item.validityMonths))) {
      item.nextCalibrationDue = "-";
      return;
    }
    const date = new Date(item.lastCalibrationDate);
    if (!isNaN(date.getTime())) {
      date.setMonth(date.getMonth() + Number(item.validityMonths));
      item.nextCalibrationDue = date.toISOString().split('T')[0];
    } else {
      item.nextCalibrationDue = "-";
    }
  }

  updateValidity(item: EquipmentValidityItem): void {
    this.calculateNextDue(item);
    const payload = {
      id: item.id,
      equipment_name: item.equipmentName,
      equipmentName: item.equipmentName,
      source: item.source,
      last_calibration_date: item.lastCalibrationDate,
      lastCalibrationDate: item.lastCalibrationDate,
      validity_months: item.validityMonths,
      validityMonths: item.validityMonths,
      next_calibration_due: item.nextCalibrationDue,
      nextCalibrationDue: item.nextCalibrationDue
    };
    this.srarService.updateEquipmentValidity(String(item.id), payload).subscribe({
      next: () => {
        this.validityList.update(list => list.map(i => String(i.id) === String(item.id) ? { ...item } : i));
      },
      error: (err) => {
        console.error("Failed to update validity API:", err);
        this.validityList.update(list => list.map(i => String(i.id) === String(item.id) ? { ...item } : i));
      }
    });
  }

  loadRunningUpdates(): void {
    if (this.runningUpdates().length === 0) {
      this.runningUpdates.set([
        { id: "1", updateTitle: "GT-1 Main Engine Parameters Update", validTill: "2026-12-31", createdDate: "2026-01-15" },
        { id: "2", updateTitle: "Auxiliary Boiler Safety Valve Calibration", validTill: "2026-11-30", createdDate: "2026-02-10" },
        { id: "3", updateTitle: "ICCP Anode Voltage Threshold Modification", validTill: "2027-03-31", createdDate: "2026-03-01" },
        { id: "4", updateTitle: "STP Bioreactor Maintenance Cycle Update", validTill: "2026-09-30", createdDate: "2026-04-05" }
      ]);
    }
  }

  loadShipDetails(): void {
    if (this.shipDetails().length === 0) {
      this.shipDetails.set([
        { id: "1", shipName: "INS VIKRAMADITYA", shipType: "Aircraft Carrier", commissionDate: "2013-11-16" },
        { id: "2", shipName: "INS VIKRANT", shipType: "Aircraft Carrier", commissionDate: "2022-09-02" },
        { id: "3", shipName: "INS VISAKHAPATNAM", shipType: "Destroyer", commissionDate: "2021-11-21" },
        { id: "4", shipName: "INS MORMUGAO", shipType: "Destroyer", commissionDate: "2022-12-18" },
        { id: "5", shipName: "INS IMPHAL", shipType: "Destroyer", commissionDate: "2023-12-26" }
      ]);
    }
  }

  // AG Grid Column Definitions
  masterColumnDefs: ColDef[] = [
    {
      headerName: "SRAR Tab / Type",
      field: "srarTab",
      flex: 1.5,
      minWidth: 160,
      cellRenderer: (params: ICellRendererParams) => {
        return `<span class="type-pill">${params.value || ''}</span>`;
      },
    },
    {
      headerName: "Equipment Nomenclature",
      field: "nomenclature",
      flex: 2.2,
      minWidth: 200,
    },
    {
      headerName: "Serial No",
      field: "serialNo",
      flex: 1.2,
      minWidth: 120,
      valueGetter: (params) => (params.data as SrarMasterItem | undefined)?.serialNo || '-',
    },
    {
      headerName: "Location On Board",
      field: "locationOnBoard",
      flex: 1.8,
      minWidth: 160,
      valueGetter: (params) => (params.data as SrarMasterItem | undefined)?.locationOnBoard || '-',
    },
    {
      headerName: "Actions",
      flex: 1,
      minWidth: 100,
      sortable: false,
      filter: false,
      cellRenderer: () => {
        return `
          <button class="action-btn text-red-400 hover:text-red-300" title="Remove Item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        `;
      },
    },
  ];

  validityColumnDefs: ColDef[] = [
    { headerName: "Equipment", field: "equipmentName", flex: 2, minWidth: 180 },
    {
      headerName: "Source",
      field: "source",
      flex: 1.2,
      minWidth: 120,
      cellRenderer: (params: ICellRendererParams) => {
        const source = params.value || "General";
        let badgeClass = "bg-slate-500/20 text-slate-300 border-slate-500/30";
        if (source === "Torsionmeter") badgeClass = "bg-amber-500/20 text-amber-300 border-amber-500/30";
        else if (source === "H2S Sensor") badgeClass = "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
        else if (source === "Test Kit") badgeClass = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
        return `<span class="px-2.5 py-1 rounded-full text-xs font-semibold border ${badgeClass}">${source}</span>`;
      },
    },
    {
      headerName: "Last Calibration Date",
      field: "lastCalibrationDate",
      flex: 1.5,
      minWidth: 160,
      cellRenderer: (params: ICellRendererParams) => {
        const val = params.value || "";
        const input = document.createElement("input");
        input.type = "date";
        input.value = val;
        input.className = "validity-date-input bg-white/5 border border-white/15 focus:border-cyan-400/50 rounded-lg px-3 py-1.5 text-xs text-white outline-none w-full cursor-pointer";

        input.addEventListener("click", (e: MouseEvent) => {
          e.stopPropagation();
          try {
            const el = e.target as HTMLInputElement & { showPicker?: () => void };
            if (typeof el.showPicker === "function") {
              el.showPicker();
            }
          } catch {
            // Ignore if already open
          }
        });

        input.addEventListener("mousedown", (e: MouseEvent) => {
          e.stopPropagation();
        });

        input.addEventListener("change", (e: Event) => {
          const newVal = (e.target as HTMLInputElement).value;
          if (params.data) {
            const rowData = params.data as EquipmentValidityItem;
            rowData.lastCalibrationDate = newVal;
            this.calculateNextDue(rowData);
            if (params.node && params.api) {
              const node = params.node as unknown as { setData?: (d: unknown) => void };
              if (typeof node.setData === "function") {
                node.setData({ ...rowData });
              }
              params.api.refreshCells({ rowNodes: [params.node as never], force: true });
            }
          }
        });
        return input;
      },
    },
    {
      headerName: "Validity (Months)",
      field: "validityMonths",
      flex: 1.2,
      minWidth: 120,
      cellRenderer: (params: ICellRendererParams) => {
        const val = params.value !== null && params.value !== undefined ? params.value : "";
        const input = document.createElement("input");
        input.type = "number";
        input.value = val !== "" ? String(val) : "";
        input.placeholder = "Months";
        input.className = "validity-months-input bg-white/5 border border-white/15 focus:border-cyan-400/50 rounded-lg px-3 py-1.5 text-xs text-white outline-none w-24 text-center cursor-text";

        input.addEventListener("click", (e: MouseEvent) => {
          e.stopPropagation();
        });

        input.addEventListener("mousedown", (e: MouseEvent) => {
          e.stopPropagation();
        });

        input.addEventListener("input", (e: Event) => {
          const newVal = (e.target as HTMLInputElement).value;
          if (params.data) {
            const rowData = params.data as EquipmentValidityItem;
            rowData.validityMonths = newVal !== "" ? Number(newVal) : (null as unknown as number);
            this.calculateNextDue(rowData);
            if (params.node && params.api) {
              const node = params.node as unknown as { setData?: (d: unknown) => void };
              if (typeof node.setData === "function") {
                node.setData({ ...rowData });
              }
              params.api.refreshCells({ rowNodes: [params.node as never], force: true });
            }
          }
        });
        return input;
      },
    },
    {
      headerName: "Next Calibration Due",
      field: "nextCalibrationDue",
      flex: 1.5,
      minWidth: 140,
      cellRenderer: (params: ICellRendererParams) => {
        return `<span class="font-mono text-xs font-semibold text-emerald-400">${params.value || '-'}</span>`;
      },
    },
    {
      headerName: "Action",
      flex: 1,
      minWidth: 110,
      sortable: false,
      filter: false,
      cellRenderer: (params: ICellRendererParams) => {
        const btn = document.createElement("button");
        btn.textContent = "Update";
        btn.className = "px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs shadow transition-all duration-150 flex items-center justify-center gap-1.5 mx-auto cursor-pointer";
        btn.addEventListener("click", (e: MouseEvent) => {
          e.stopPropagation();
          if (params.data) {
            this.updateValidity(params.data as EquipmentValidityItem);
          }
        });
        btn.addEventListener("mousedown", (e: MouseEvent) => {
          e.stopPropagation();
        });
        return btn;
      },
    },
  ];

  runningUpdatesColumnDefs: ColDef[] = [
    {
      headerName: "Update Title",
      field: "updateTitle",
      flex: 2.5,
      minWidth: 220,
    },
    {
      headerName: "Valid Till",
      field: "validTill",
      flex: 1.2,
      minWidth: 130,
    },
    {
      headerName: "Created Date",
      field: "createdDate",
      flex: 1.2,
      minWidth: 130,
    },
    {
      headerName: "Actions",
      flex: 1,
      minWidth: 100,
      sortable: false,
      filter: false,
      cellRenderer: () => {
        return `
          <button class="action-btn text-cyan-400 hover:text-cyan-300" title="Actions">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
        `;
      },
    },
  ];

  shipDetailsColumnDefs: ColDef[] = [
    {
      headerName: "Ship Name",
      field: "shipName",
      flex: 2,
      minWidth: 180,
    },
    {
      headerName: "Ship Type",
      field: "shipType",
      flex: 1.5,
      minWidth: 140,
      cellRenderer: (params: ICellRendererParams) => {
        return `<span class="type-pill">${params.value || ''}</span>`;
      },
    },
    {
      headerName: "Commission Date",
      field: "commissionDate",
      flex: 1.5,
      minWidth: 140,
    },
    {
      headerName: "Actions",
      flex: 1,
      minWidth: 100,
      sortable: false,
      filter: false,
      cellRenderer: () => {
        return `
          <button class="action-btn text-cyan-400 hover:text-cyan-300" title="Actions">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
        `;
      },
    },
  ];

  // Modal 1 Form Fields
  selectedCategoryCode = signal<string>("");
  categoryOptions = computed<DropdownOption[]>(() => this.categories.map(c => ({ label: c.desc, value: c.code })));
  selectedCategory = computed<SrarEquipmentCategory | undefined>(() =>
    this.categories.find(c => c.code === this.selectedCategoryCode())
  );
  selectedEquipmentIds = signal<number[]>([]);

  onCategoryChange(code: string): void {
    this.selectedCategoryCode.set(code);
    this.loadAvailableEquipments(code);
  }

  // Modal 2 Form Fields
  selectedTypeSection = signal<string>("");
  typeText = signal<string>("");

  // Tab Switching
  setTab(tab: 'equipmentList' | 'validity' | 'updates' | 'shipDetails'): void {
    this.activeTab.set(tab);
  }

  // Remove Item from Master List (Tab 1)
  removeMasterItem(id: string): void {
    this.srarService.deleteMasterEquipment(id).subscribe({
      next: () => {
        this.masterEquipments.update(items => items.filter(item => item.id !== id));
      },
      error: () => {
        this.masterEquipments.update(items => items.filter(item => item.id !== id));
      }
    });
  }

  // Modal 1 Actions
  openAddEquipmentModal(): void {
    this.selectedCategoryCode.set("");
    this.availableEquipments.set([]);
    this.selectedEquipmentIds.set([]);
    this.isAddEquipmentModalOpen.set(true);
  }

  closeAddEquipmentModal(): void {
    this.isAddEquipmentModalOpen.set(false);
  }

  openDeleteConfirmModal(item: SrarMasterItem): void {
    this.equipmentToDelete.set(item);
    this.isDeleteConfirmModalOpen.set(true);
  }

  closeDeleteConfirmModal(): void {
    this.isDeleteConfirmModalOpen.set(false);
    this.equipmentToDelete.set(null);
  }

  confirmDeleteMasterItem(): void {
    const item = this.equipmentToDelete();
    if (item?.id) {
      this.removeMasterItem(String(item.id));
    }
    this.closeDeleteConfirmModal();
  }

  onMasterCellClicked(event: CellCallbackParams): void {
    const data = event.data as SrarMasterItem | undefined;
    if ((event as CellCallbackParams & { column?: { getColId?: () => string } }).column?.getColId?.() === "Actions" || event?.colDef?.headerName === "Actions") {
      if (data) {
        this.openDeleteConfirmModal(data);
      }
    }
  }

  onValidityCellClicked(event: CellCallbackParams): void {
    const data = event.data as EquipmentValidityItem | undefined;
    if (!data) return;

    const colId = (event as CellCallbackParams & { column?: { getColId?: () => string } }).column?.getColId?.() || event.colDef?.headerName;
    if (colId === "Action" || colId === "action") {
      const domEvent = (event as Record<string, unknown>)['event'] as Event | undefined;
      const rowEl = (domEvent?.target as HTMLElement | null)?.closest('.ag-row');
      if (rowEl) {
        const dateInput = rowEl.querySelector('.validity-date-input') as HTMLInputElement | null;
        const monthsInput = rowEl.querySelector('.validity-months-input') as HTMLInputElement | null;
        if (dateInput?.value) data.lastCalibrationDate = dateInput.value;
        if (monthsInput?.value !== undefined && monthsInput?.value !== null && monthsInput?.value !== '') {
          data.validityMonths = Number(monthsInput.value);
        }
      }
      this.updateValidity(data);
    }
  }

  isEquipmentSelected(eqId: number): boolean {
    return this.selectedEquipmentIds().includes(eqId);
  }

  toggleEquipmentSelection(eqId: number): void {
    if (this.isEquipmentSelected(eqId)) {
      this.selectedEquipmentIds.update(ids => ids.filter(id => id !== eqId));
    } else {
      this.selectedEquipmentIds.update(ids => [...ids, eqId]);
    }
  }

  // Links each selected real ShipEquipment instance under the chosen category —
  // creating the SrarEquipmentTypeList row that both this master list and whichever
  // transaction-form tab reads that category (e.g. Form 1) then pick up.
  saveAddEquipment(): void {
    const category = this.selectedCategory();
    const selectedIds = this.selectedEquipmentIds();
    if (!category || selectedIds.length === 0) return;

    const chosen = this.availableEquipments().filter(eq => selectedIds.includes(eq.id));

    const newItems: SrarMasterItem[] = chosen.map(eq => {
      const randArray = new Uint32Array(1);
      crypto.getRandomValues(randArray);
      return {
        id: "master_" + Date.now() + "_" + randArray[0].toString(36).substring(0, 3),
        srarTab: category.desc,
        nomenclature: eq.equipment_name,
        serialNo: eq.serial_no || "",
        locationOnBoard: eq.location_on_board || ""
      };
    });

    // 1. Immediately update UI list signal so equipment appears in grid instantly
    this.masterEquipments.update(items => [...items, ...newItems]);

    // 2. Send API requests to persist the link in the database
    chosen.forEach(eq => {
      const payload = {
        equipment_id: eq.id,
        srar_type: category.desc,
        srar_txt: eq.equipment_name,
        equipment_desc: category.desc,
        equipment_type_id: category.equipmentTypeId,
        universal_id_ch_master_equipment_type: category.code
      };
      this.srarService.addEquipmentTypeList(payload).subscribe({
        next: () => this.loadMasterEquipments(),
        error: (err) => console.error("Failed to add equipment to master DB:", err)
      });
    });

    this.closeAddEquipmentModal();
  }

  // Modal 2 Actions
  openAddTypeModal(): void {
    this.selectedTypeSection.set("");
    this.typeText.set("");
    this.isAddTypeModalOpen.set(true);
  }

  closeAddTypeModal(): void {
    this.isAddTypeModalOpen.set(false);
  }

  saveAddType(): void {
    const sec = this.selectedTypeSection();
    const txt = this.typeText().trim();
    if (!sec || !txt) return;

    const newItem: SrarMasterItem = {
      id: "master_" + Date.now(),
      srarTab: sec,
      nomenclature: txt
    };

    // 1. Immediately update UI list signal so type item appears in grid instantly
    this.masterEquipments.update(items => [...items, newItem]);

    // 2. Send API request to persist in database
    const payload = {
      srar_type: sec,
      nomenclature: txt
    };
    this.srarService.addEquipmentTypeList(payload).subscribe({
      next: () => this.loadMasterEquipments(),
      error: (err) => console.error("Failed to add equipment type to DB:", err)
    });

    this.closeAddTypeModal();
  }
}
