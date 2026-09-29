import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ColDef, RowData } from "ag-grid-community";
import { firstValueFrom } from "rxjs";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { SelectInput } from "../../../../shared/components/select-input/select-input";
import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { MoApiService } from "../services/mo-api.service";
import { MoItem } from "../models/mo.model";

const DETAIL_TABS = ["Item", "EASK", "Specs", "Characteristic", "Substitute", "Reference", "Obsolescent", "Photo"];

@Component({
  selector: "app-mo-item-search",
  standalone: true,
  imports: [ReactiveFormsModule, DataGrid, SelectInput, ModalComponent, HelpGuidance, ButtonComponent],
  templateUrl: "./item-search.html",
  styleUrl: "./item-search.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemSearch implements OnInit {
  private readonly api = inject(MoApiService);
  private readonly fb = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);

  readonly detailTabs = DETAIL_TABS;
  readonly activeDetailTab = signal(DETAIL_TABS[0]);
  readonly items = signal<MoItem[]>([]);
  readonly selectedRows = signal<MoItem[]>([]);
  readonly activeItem = signal<MoItem | null>(null);

  readonly equipmentDescOptions = signal<{ label: string; value: string }[]>([]);

  readonly filtersForm = this.fb.nonNullable.group({
    equipmentDescription: "",
    itemDescription: "",
    itemCategory: "",
  });

  private readonly filters = toSignal(this.filtersForm.valueChanges, {
    initialValue: this.filtersForm.getRawValue(),
  });

  readonly filteredItems = computed(() => {
    const { equipmentDescription, itemDescription, itemCategory } = this.filters();
    const description = (itemDescription ?? "").trim().toLowerCase();
    const category = (itemCategory ?? "").trim().toLowerCase();

    return this.items().filter((item) => {
      const matchesEquipment = !equipmentDescription || item.ilmsEquipmentDescription === equipmentDescription;
      const matchesDescription = !description || item.itemDescription.toLowerCase().includes(description);
      const matchesCategory = !category || item.crpCategory.toLowerCase().includes(category);
      return matchesEquipment && matchesDescription && matchesCategory;
    });
  });

  readonly columnDefs: ColDef[] = [
    { field: "itemCode", headerName: "MO Item Code", flex: 1 },
    { field: "itemDescription", headerName: "Item Description", flex: 1.4 },
    { field: "crpCategory", headerName: "CRP Category", width: 130 },
    { field: "denomination", headerName: "Denomination", width: 130 },
    { field: "shipInventoryStatus", headerName: "Ship Inventory-Status", width: 170 },
    { field: "vendorName", headerName: "Vendor Name", flex: 1 },
    { field: "ilmsEquipmentDescription", headerName: "ILMS Equipment Description", flex: 1.2 },
  ];

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const items = await firstValueFrom(this.api.getItems());
    this.items.set(items);
    this.equipmentDescOptions.set(
      [...new Set(items.map((i) => i.ilmsEquipmentDescription))].map((label) => ({ label, value: label })),
    );
  }

  clearFilters(): void {
    this.filtersForm.reset({ equipmentDescription: "", itemDescription: "", itemCategory: "" });
  }

  onSelectionChanged(rows: RowData[]): void {
    this.selectedRows.set(rows as unknown as MoItem[]);
  }

  onRowClicked(row: RowData): void {
    this.activeItem.set(row as unknown as MoItem);
    this.activeDetailTab.set(DETAIL_TABS[0]);
  }

  closeModal(): void {
    this.activeItem.set(null);
  }

  selectDetailTab(tab: string): void {
    this.activeDetailTab.set(tab);
  }

  raiseDart(): void {
    if (!this.selectedRows().length) return;
    this.notifications.info(`Raise DART for ${this.selectedRows().length} item(s) — hand off to DART module.`);
  }

  planRoutine(): void {
    if (!this.selectedRows().length) return;
    this.notifications.info(`Plan Routine for ${this.selectedRows().length} item(s) — hand off to Routines module.`);
  }
}
