import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { ColDef } from "ag-grid-community";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { SelectInput, DropdownOption } from "../../../../shared/components/select-input/select-input";
import { FileInput } from "../../../../shared/components/file-input/file-input";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { ReportExportService } from "../../../../Core/services/export/generic-export.service";
import { MoApiService } from "../services/mo-api.service";
import { MoImportKind, MoImportResult, MoItem, Vendor } from "../models/mo.model";

type MastersTab = "mapping" | "get-data" | "import";

interface MappedRow {
  vendorCode: string;
  vendorName: string;
  itemCode: string;
  itemDescription: string;
  insmaEquipment: string;
}

@Component({
  selector: "app-mo-masters",
  standalone: true,
  imports: [ReactiveFormsModule, DataGrid, SelectInput, FileInput, HelpGuidance, ButtonComponent],
  templateUrl: "./mo-masters.html",
  styleUrl: "./mo-masters.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoMasters implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);
  private readonly api = inject(MoApiService);
  private readonly exportService = inject(ReportExportService);

  readonly activeTab = signal<MastersTab>("mapping");
  readonly mapForm = this.fb.nonNullable.group({
    vendorCode: ["", Validators.required],
    itemCode: ["", Validators.required],
    equipmentId: ["", Validators.required],
  });
  readonly syncing = signal(false);
  readonly mapping = signal(false);
  private readonly vendors = signal<Vendor[]>([]);
  private readonly items = signal<MoItem[]>([]);
  readonly vendorOptions = computed<DropdownOption[]>(() =>
    this.vendors().map((v) => ({ value: v.vendorCode, label: `${v.vendorCode} — ${v.vendorName}` })),
  );
  readonly itemOptions = computed<DropdownOption[]>(() =>
    this.items().map((i) => ({ value: i.itemCode, label: i.itemDescription ? `${i.itemCode} — ${i.itemDescription}` : i.itemCode })),
  );
  readonly equipmentOptions = signal<DropdownOption[]>([]);

  // --- Import Data ---
  readonly importKindOptions: DropdownOption[] = [
    { label: "Item Master", value: "item" },
    { label: "Vendor Master", value: "vendor" },
  ];
  readonly importForm = this.fb.nonNullable.group({
    kind: this.fb.nonNullable.control<MoImportKind>("item"),
    file: this.fb.control<File | null>(null),
  });
  readonly importFile = signal<File | null>(null);
  readonly downloadingTemplate = signal(false);
  readonly validating = signal(false);
  readonly importing = signal(false);
  readonly importResult = signal<MoImportResult | null>(null);
  /** Import is only enabled once a dry-run against the currently-selected file has come back
   * clean — re-picking the file or switching kind clears this so a stale validation can't be
   * used to skip straight to a real import. */
  readonly validatedForImport = signal(false);

  readonly mappedRows = signal<MappedRow[]>([]);
  readonly columnDefs: ColDef[] = [
    { field: "vendorCode", headerName: "Vendor Code", flex: 1 },
    { field: "vendorName", headerName: "Vendor Name", flex: 1.2 },
    { field: "itemCode", headerName: "Item Code", flex: 1 },
    { field: "itemDescription", headerName: "Item Description", flex: 1.4 },
    { field: "insmaEquipment", headerName: "INSMA Equipment", flex: 1 },
  ];

  ngOnInit(): void {
    this.importForm.controls.kind.valueChanges.subscribe(() => this.onImportKindChanged());
    this.importForm.controls.file.valueChanges.subscribe((file) => this.onImportFileChanged(file));
    void this.loadMappingFormOptions().then(() => this.loadMappedRows());
  }

  selectTab(tab: MastersTab): void {
    this.activeTab.set(tab);
  }

  /** Each of the three option lists is loaded independently (`Promise.allSettled`, not
   * `Promise.all`) — with `Promise.all`, a failure in any ONE call (e.g. vendors or items)
   * rejected the whole batch, and since `ngOnInit()` only chains a `.then()` with no `.catch()`,
   * that rejection was silently swallowed as an unhandled promise rejection: none of the three
   * dropdowns populated, including "Insma equipment name" even when its own call would have
   * succeeded on its own. */
  private async loadMappingFormOptions(): Promise<void> {
    const [vendorsResult, itemsResult, equipmentResult] = await Promise.allSettled([
      firstValueFrom(this.api.getVendors()),
      firstValueFrom(this.api.getItems()),
      firstValueFrom(this.api.getShipEquipmentOptions()),
    ]);

    if (vendorsResult.status === "fulfilled") {
      this.vendors.set(vendorsResult.value);
    } else {
      console.error("Failed to load vendors for the MO Masters mapping form:", vendorsResult.reason);
    }

    if (itemsResult.status === "fulfilled") {
      this.items.set(itemsResult.value);
    } else {
      console.error("Failed to load items for the MO Masters mapping form:", itemsResult.reason);
    }

    if (equipmentResult.status === "fulfilled") {
      this.equipmentOptions.set(equipmentResult.value);
    } else {
      console.error("Failed to load INSMA equipment options for the MO Masters mapping form:", equipmentResult.reason);
      this.notifications.error("Could not load the INSMA equipment list. Please refresh and try again.");
    }
  }

  private async loadMappedRows(): Promise<void> {
    const mappings = await firstValueFrom(this.api.getMoMappings());
    const vendorByCode = new Map(this.vendors().map((v) => [v.vendorCode, v]));
    const itemByCode = new Map(this.items().map((i) => [i.itemCode, i]));
    const equipmentById = new Map(this.equipmentOptions().map((e) => [String(e.value), e.label]));
    this.mappedRows.set(
      mappings.map((row) => {
        const vendor = row.vendor_id ? vendorByCode.get(row.vendor_id) : undefined;
        const item = row.ilms_spare_id ? itemByCode.get(row.ilms_spare_id) : undefined;
        return {
          vendorCode: row.vendor_id ?? "",
          vendorName: vendor?.vendorName ?? "",
          itemCode: row.ilms_spare_id ?? "",
          itemDescription: item?.itemDescription ?? "",
          insmaEquipment: row.equipment != null ? (equipmentById.get(String(row.equipment)) ?? "") : "",
        };
      }),
    );
  }

  async submitMap(): Promise<void> {
    if (this.mapForm.invalid) {
      this.mapForm.markAllAsTouched();
      return;
    }
    const { vendorCode, itemCode, equipmentId } = this.mapForm.getRawValue();
    this.mapping.set(true);
    try {
      await firstValueFrom(this.api.createMoMapping(vendorCode, itemCode, equipmentId));
      this.notifications.success("Mapping saved.");
      this.mapForm.reset({ vendorCode: "", itemCode: "", equipmentId: "" });
      await this.loadMappedRows();
    } catch {
      this.notifications.error("Could not save the mapping. Please try again.");
    } finally {
      this.mapping.set(false);
    }
  }

  async getDataFromMo(): Promise<void> {
    this.syncing.set(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      this.notifications.success("Data fetched from MO.");
    } finally {
      this.syncing.set(false);
    }
  }

  // --- Import Data ---

  private onImportKindChanged(): void {
    this.importResult.set(null);
    this.validatedForImport.set(false);
  }

  private onImportFileChanged(file: File | null): void {
    this.importFile.set(file);
    this.importResult.set(null);
    this.validatedForImport.set(false);
  }

  /** Template helper — `Object` isn't in scope inside an Angular template. */
  errorFields(errors: Record<string, string[]>): string[] {
    return Object.keys(errors);
  }

  async downloadImportTemplate(): Promise<void> {
    const kind = this.importForm.controls.kind.value;
    this.downloadingTemplate.set(true);
    try {
      const blob = await firstValueFrom(this.api.downloadImportTemplate(kind));
      this.exportService.downloadBlob(blob, `${kind}_import_template.xlsx`);
    } catch {
      this.notifications.error("Could not download the import template.");
    } finally {
      this.downloadingTemplate.set(false);
    }
  }

  async validateImportFile(): Promise<void> {
    await this.runImport(true);
  }

  async submitImportFile(): Promise<void> {
    await this.runImport(false);
  }

  private async runImport(dryRun: boolean): Promise<void> {
    const file = this.importFile();
    if (!file) {
      this.notifications.error("Choose an .xlsx file first.");
      return;
    }
    const kind = this.importForm.controls.kind.value;
    const busy = dryRun ? this.validating : this.importing;
    busy.set(true);
    try {
      const result = await firstValueFrom(this.api.importExcel(kind, file, dryRun));
      this.importResult.set(result);
      if (result.status === "column_error") {
        this.notifications.error(result.headerErrors[0] || "The file has unsupported columns.");
      } else if (result.status === "row_limit_error") {
        this.notifications.error(result.headerErrors[0] || "The file has too many rows.");
      } else if (result.invalidRows > 0) {
        this.notifications.error(
          `${result.invalidRows} row(s) failed validation — nothing was ${dryRun ? "checked further" : "imported"}.`,
        );
        this.validatedForImport.set(false);
      } else if (dryRun) {
        this.validatedForImport.set(true);
        this.notifications.success(`${result.validRows} row(s) look valid. Ready to import.`);
      } else {
        this.validatedForImport.set(false);
        this.notifications.success(`${result.imported} row(s) imported.`);
      }
    } catch {
      this.notifications.error(dryRun ? "Validation failed. Please try again." : "Import failed. Please try again.");
    } finally {
      busy.set(false);
    }
  }
}
