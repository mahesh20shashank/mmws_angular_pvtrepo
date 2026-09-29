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
import { WedApiService } from "../services/wed-api.service";
import { WedItem } from "../models/wed.model";

const DETAIL_TABS = ["Item", "Photo"];

@Component({
  selector: "app-wed-item-search",
  standalone: true,
  imports: [ReactiveFormsModule, DataGrid, SelectInput, ModalComponent, HelpGuidance, ButtonComponent],
  templateUrl: "./item-search.html",
  styleUrl: "./item-search.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemSearch implements OnInit {
  private readonly api = inject(WedApiService);
  private readonly fb = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);

  readonly detailTabs = DETAIL_TABS;
  readonly activeDetailTab = signal(DETAIL_TABS[0]);
  readonly items = signal<WedItem[]>([]);
  readonly selectedRows = signal<WedItem[]>([]);
  readonly activeItem = signal<WedItem | null>(null);

  readonly equipmentNameOptions = signal<{ label: string; value: string }[]>([]);
  readonly partNoOptions = signal<{ label: string; value: string }[]>([]);

  readonly filtersForm = this.fb.nonNullable.group({
    equipmentName: "",
    partNo: "",
    itemDescription: "",
  });

  private readonly filters = toSignal(this.filtersForm.valueChanges, {
    initialValue: this.filtersForm.getRawValue(),
  });

  readonly filteredItems = computed(() => {
    const { equipmentName, partNo, itemDescription } = this.filters();
    const description = (itemDescription ?? "").trim().toLowerCase();

    return this.items().filter((item) => {
      const matchesEquipment = !equipmentName || item.equipmentName === equipmentName;
      const matchesPartNo = !partNo || item.patternNo === partNo;
      const matchesDescription = !description || item.itemDescription.toLowerCase().includes(description);
      return matchesEquipment && matchesPartNo && matchesDescription;
    });
  });

  readonly columnDefs: ColDef[] = [
    { field: "equipmentName", headerName: "WED Equipment Name", flex: 1.2 },
    { field: "patternNo", headerName: "WED Pattern No", flex: 1 },
    { field: "itemDescription", headerName: "Item Description", flex: 1.4 },
    { field: "denomination", headerName: "Denomination", width: 130 },
    { field: "itemCategory", headerName: "Item Category(C/P/QP)", width: 170 },
    { field: "inventoryType", headerName: "Inventory Type", width: 140 },
  ];

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const items = await firstValueFrom(this.api.getItems());
    this.items.set(items);
    this.equipmentNameOptions.set(
      [...new Set(items.map((i) => i.equipmentName))].map((label) => ({ label, value: label })),
    );
    this.partNoOptions.set(items.map((i) => ({ label: i.patternNo, value: i.patternNo })));
  }

  clearFilters(): void {
    this.filtersForm.reset({ equipmentName: "", partNo: "", itemDescription: "" });
  }

  onSelectionChanged(rows: RowData[]): void {
    this.selectedRows.set(rows as unknown as WedItem[]);
  }

  onRowClicked(row: RowData): void {
    this.activeItem.set(row as unknown as WedItem);
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
