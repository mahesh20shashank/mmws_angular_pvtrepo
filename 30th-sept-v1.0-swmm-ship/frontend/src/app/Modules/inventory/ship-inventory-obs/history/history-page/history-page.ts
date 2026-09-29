import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { ColDef } from "ag-grid-community";
import { DataGrid } from "../../../../../shared/components/data-grid/data-grid";
import { InputField } from "../../../../../shared/components/input-field/input-field";
import { SelectInput } from "../../../../../shared/components/select-input/select-input";
import { ExportKind, ExportToolbar } from "../../../../../shared/components/export-toolbar/export-toolbar";
import { ToolbarSearch } from "../../../../../shared/components/toolbar-search/toolbar-search";
import { HelpGuidance } from "../../../../../shared/components/help-guidance/help-guidance";
import { PrintColumn, ReportExportService } from "../../../../../Core/services/export/generic-export.service";
import { ObsApiService } from "../../services/obs-api.service";
import { DropdownOptionDto } from "../../models/spare.model";
import { HistoryEntry } from "../../models/history.model";

const HELP_HTML = `
  <h6 class="fw-bold mb-1">What this page is for</h6>
  <p class="mb-2">See the past record of spare transactions for your department — what was
     <strong>Issued</strong> and what was <strong>Returned</strong>. Switch between the two using the tabs.</p>
  <h6 class="fw-bold mb-1">The two tabs</h6>
  <ul class="mb-2">
    <li><strong>Issued History</strong> — spares issued, with when, to whom, and why.</li>
    <li><strong>Return History</strong> — spares taken back on charge.</li>
  </ul>
  <h6 class="fw-bold mb-1">Filters</h6>
  <ul class="mb-2">
    <li><strong>Spare Class / Class of Spares</strong> — narrow the list to a spare type or equipment class.</li>
    <li><strong>Date range</strong> (top right) — pick a period to show; the default is the last 30 days.</li>
    <li><strong>Clear</strong> — resets the filters.</li>
  </ul>
  <p class="mb-0">You see only your own department's history; administrators can also filter by department.</p>
`;

const ISSUED_COLUMNS: ColDef[] = [
  { field: "date", headerName: "Issue Date", width: 130 },
  { field: "patternNumber", headerName: "Pattern No", flex: 1 },
  { field: "description", headerName: "Spare Description", flex: 1.2 },
  { field: "quantity", headerName: "Issue Qty", width: 110 },
  { field: "user", headerName: "Issued To", flex: 1 },
  { field: "equipmentClass", headerName: "Equipment Class", flex: 1 },
  { field: "reason", headerName: "Reason of Issue", flex: 1 },
  { field: "equipmentNomenclature", headerName: "Eqpt Nomenclature", flex: 1 },
  { field: "authority", headerName: "Authority", width: 110 },
];

const RETURNED_ITEM_STATUS_LABELS: Record<string, string> = { same: "Same as Issued", new: "New Item" };

const RETURNED_COLUMNS: ColDef[] = [
  { field: "date", headerName: "Return Date", width: 130 },
  { field: "patternNumber", headerName: "Pattern No", flex: 1 },
  { field: "description", headerName: "Spare Description", flex: 1.2 },
  { field: "quantity", headerName: "Return Qty", width: 110 },
  { field: "equipmentClass", headerName: "Equipment Class", flex: 1 },
  {
    field: "returnedItemStatus",
    headerName: "Returned Item Status",
    flex: 1,
    valueGetter: (p) => RETURNED_ITEM_STATUS_LABELS[(p.data as HistoryEntry).returnedItemStatus ?? ""] ?? "—",
  },
  { field: "remarks", headerName: "Return Remarks", flex: 1.2 },
  { field: "authority", headerName: "Authority", width: 110 },
];

@Component({
  selector: "app-obs-history-page",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DataGrid,
    InputField,
    SelectInput,
    ExportToolbar,
    ToolbarSearch,
    HelpGuidance, ButtonComponent],
  templateUrl: "./history-page.html",
  styleUrl: "./history-page.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPage implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly exportService = inject(ReportExportService);
  private equipmentClassToSpareClass = new Map<string, string>();

  readonly helpHtml = HELP_HTML;
  readonly activeTab = signal<"issued" | "returned">("issued");
  readonly entries = signal<HistoryEntry[]>([]);
  readonly spareClasses = signal<DropdownOptionDto[]>([]);
  readonly equipmentClasses = signal<DropdownOptionDto[]>([]);
  readonly exportBusy = signal<ExportKind | null>(null);
  readonly searchText = signal("");
  /** Resolved spare-class NAME (not the dropdown's id value) — set by `search()`/`clearFilters()`,
   * cross-referenced against `equipmentClassToSpareClass` since history rows only carry an
   * equipment class name, not a spare class. */
  private readonly spareClassFilter = signal("");

  readonly filtersForm = this.fb.nonNullable.group({
    spareClass: "",
    equipmentClass: "",
    dateFrom: [""],
    dateTo: [""],
  });

  get columnDefs(): ColDef[] {
    return this.activeTab() === "issued" ? ISSUED_COLUMNS : RETURNED_COLUMNS;
  }

  private get printColumns(): PrintColumn[] {
    return this.columnDefs
      .filter((c): c is ColDef & { field: string } => !!c.field)
      .map((c) => ({
        header: String(c.headerName ?? c.field),
        field: c.field,
        format:
          c.field === "returnedItemStatus"
            ? (value) => RETURNED_ITEM_STATUS_LABELS[String(value ?? "")] ?? "—"
            : undefined,
      }));
  }

  readonly filteredEntries = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const spareClass = this.spareClassFilter();
    return this.entries().filter((entry) => {
      if (spareClass && this.equipmentClassToSpareClass.get(entry.equipmentClass ?? "") !== spareClass) return false;
      if (
        query &&
        ![entry.patternNumber, entry.description, entry.user, entry.equipmentClass, entry.authority].some((value) =>
          (value ?? "").toLowerCase().includes(query),
        )
      ) {
        return false;
      }
      return true;
    });
  });

  ngOnInit(): void {
    void this.loadDropdowns();
    void this.load();
  }

  private async loadDropdowns(): Promise<void> {
    const [spareClasses, equipmentClasses, equipmentClassToSpareClass] = await Promise.all([
      firstValueFrom(this.api.getSpareClasses()),
      firstValueFrom(this.api.getEquipmentClasses()),
      firstValueFrom(this.api.getEquipmentClassToSpareClass()),
    ]);
    this.spareClasses.set(spareClasses);
    this.equipmentClasses.set(equipmentClasses);
    this.equipmentClassToSpareClass = equipmentClassToSpareClass;
  }

  selectTab(tab: "issued" | "returned"): void {
    this.activeTab.set(tab);
    void this.load();
  }

  async search(): Promise<void> {
    const raw = this.filtersForm.getRawValue();
    this.spareClassFilter.set(this.spareClasses().find((o) => o.value === raw.spareClass)?.label ?? "");
    void this.load();
  }

  clearFilters(): void {
    this.filtersForm.reset({ spareClass: "", equipmentClass: "", dateFrom: "", dateTo: "" });
    this.spareClassFilter.set("");
    void this.load();
  }

  private async load(): Promise<void> {
    const raw = this.filtersForm.getRawValue();
    const equipmentClassName = this.equipmentClasses().find((o) => o.value === raw.equipmentClass)?.label;
    const filters = {
      dateFrom: raw.dateFrom || undefined,
      dateTo: raw.dateTo || undefined,
      equipmentClass: equipmentClassName,
    };
    const entries =
      this.activeTab() === "issued"
        ? await firstValueFrom(this.api.getIssuedHistory(filters))
        : await firstValueFrom(this.api.getReturnedHistory(filters));
    this.entries.set(entries);
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredEntries() as unknown as Record<string, unknown>[];
    const title = this.activeTab() === "issued" ? "Issued History" : "Return History";
    if (kind === "excel") {
      this.exportService.downloadCsv(this.printColumns, rows, `${this.activeTab()}-history.csv`);
      return;
    }
    this.exportService.printRows(title, this.printColumns, rows);
  }

}
