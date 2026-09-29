import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ColDef, RowData } from "ag-grid-community";
import { firstValueFrom } from "rxjs";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { ActionRendererComponent } from "../../../../shared/components/data-grid/grid-action-icons";
import { SelectInput } from "../../../../shared/components/select-input/select-input";
import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { ExportKind, ExportToolbar } from "../../../../shared/components/export-toolbar/export-toolbar";
import { ToolbarSearch } from "../../../../shared/components/toolbar-search/toolbar-search";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { PrintColumn, ReportExportService } from "../../../../Core/services/export/generic-export.service";
import { MoApiService } from "../services/mo-api.service";
import { Vendor } from "../models/mo.model";

const HELP_HTML = `<p class="mb-0">Search MO vendors by name or code. Click the row action to view full
  vendor details, including address and bank information.</p>`;

const PRINT_COLUMNS: PrintColumn[] = [
  { header: "Ser", field: "ser" },
  { header: "Vendor Code", field: "vendorCode" },
  { header: "Vendor Name", field: "vendorName" },
  { header: "Vendor Class", field: "vendorClass" },
  { header: "City", field: "city" },
  { header: "State", field: "state" },
];

@Component({
  selector: "app-mo-vendor-search",
  standalone: true,
  imports: [ReactiveFormsModule, DataGrid, SelectInput, ModalComponent, ExportToolbar, ToolbarSearch, HelpGuidance, ButtonComponent],
  templateUrl: "./vendor-search.html",
  styleUrl: "./vendor-search.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorSearch implements OnInit {
  private readonly api = inject(MoApiService);
  private readonly fb = inject(FormBuilder);
  private readonly exportService = inject(ReportExportService);

  readonly helpHtml = HELP_HTML;
  readonly vendors = signal<Vendor[]>([]);
  readonly vendorOptions = signal<{ label: string; value: string }[]>([]);
  readonly vendorCodeOptions = signal<{ label: string; value: string }[]>([]);
  readonly activeVendor = signal<Vendor | null>(null);
  readonly searchText = signal("");
  readonly exportBusy = signal<ExportKind | null>(null);

  readonly filtersForm = this.fb.nonNullable.group({ vendorName: "", vendorCode: "" });

  private readonly filters = toSignal(this.filtersForm.valueChanges, {
    initialValue: this.filtersForm.getRawValue(),
  });

  readonly filteredVendors = computed(() => {
    const { vendorName, vendorCode } = this.filters();
    const query = this.searchText().trim().toLowerCase();
    return this.vendors().filter((vendor) => {
      if (vendorName && vendor.id !== vendorName) return false;
      if (vendorCode && vendor.id !== vendorCode) return false;
      if (query && ![vendor.vendorCode, vendor.vendorName, vendor.vendorClass].some((v) => v.toLowerCase().includes(query))) {
        return false;
      }
      return true;
    });
  });

  readonly columnDefs: ColDef[] = [
    { field: "ser", headerName: "Ser", width: 80 },
    { field: "vendorCode", headerName: "Vendor Code", flex: 1 },
    { field: "vendorName", headerName: "Vendor Name", flex: 1.5 },
    { field: "vendorClass", headerName: "Vendor Class", flex: 1 },
    {
      headerName: "Actions",
      width: 100,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: RowData) => [
          { icon: "view", label: "View", color: "#1d96e9", action: () => this.activeVendor.set(row as unknown as Vendor) },
        ],
      },
    },
  ];

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const vendors = await firstValueFrom(this.api.getVendors());
    this.vendors.set(vendors);
    this.vendorOptions.set(vendors.map((v) => ({ label: v.vendorName, value: v.id })));
    this.vendorCodeOptions.set(vendors.map((v) => ({ label: v.vendorCode, value: v.id })));
  }

  clearFilters(): void {
    this.filtersForm.reset({ vendorName: "", vendorCode: "" });
    this.searchText.set("");
  }

  onRowClicked(row: RowData): void {
    this.activeVendor.set(row as unknown as Vendor);
  }

  closeModal(): void {
    this.activeVendor.set(null);
  }

  formatAddress(vendor: Vendor): string {
    return [vendor.addressLine1, vendor.addressLine2, vendor.addressLine3].filter((line) => line).join(", ") || "—";
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredVendors() as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(PRINT_COLUMNS, rows, "mo-vendor-search.csv");
      return;
    }
    this.exportService.printRows("MO Vendor Search", PRINT_COLUMNS, rows);
  }
}
