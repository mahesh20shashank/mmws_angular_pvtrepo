import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ColDef } from "ag-grid-community";
import { firstValueFrom } from "rxjs";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { SelectInput, DropdownOption } from "../../../../shared/components/select-input/select-input";
import { FileInput } from "../../../../shared/components/file-input/file-input";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { ReportExportService } from "../../../../Core/services/export/generic-export.service";
import { WedApiService } from "../services/wed-api.service";
import { DropdownOptionDto, WedImportKind, WedImportResult } from "../models/wed.model";

type MastersTab = "mapping" | "get-data" | "import";

interface MappedRow {
  insmaEquipmentName: string;
  wedEquipmentName: string;
  wedItemCode: string;
  createdAt: string;
}

@Component({
  selector: "app-wed-masters",
  standalone: true,
  imports: [ReactiveFormsModule, DataGrid, SelectInput, FileInput, HelpGuidance, ButtonComponent],
  templateUrl: "./wed-masters.html",
  styleUrl: "./wed-masters.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WedMasters implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WedApiService);
  private readonly notifications = inject(NotificationService);
  private readonly exportService = inject(ReportExportService);

  readonly activeTab = signal<MastersTab>("mapping");
  readonly mapForm = this.fb.nonNullable.group({
    equipmentName: ["", Validators.required],
    equipmentClass: ["", Validators.required],
  });
  readonly submittingMap = signal(false);

  readonly syncingEquipment = signal(false);
  readonly syncingSpares = signal(false);

  readonly insmaEquipmentOptions = signal<DropdownOptionDto[]>([]);
  readonly wedEquipmentOptions = signal<DropdownOptionDto[]>([]);

  // --- Import Data ---
  readonly importKindOptions: DropdownOption[] = [
    { label: "Equipment Master", value: "equipment" },
    { label: "Spares Master", value: "spares" },
  ];
  readonly importForm = this.fb.nonNullable.group({
    kind: this.fb.nonNullable.control<WedImportKind>("equipment"),
    file: this.fb.control<File | null>(null),
  });
  readonly importFile = signal<File | null>(null);
  readonly downloadingTemplate = signal(false);
  readonly validating = signal(false);
  readonly importing = signal(false);
  readonly importResult = signal<WedImportResult | null>(null);
  /** Import is only enabled once a dry-run against the currently-selected file has come back
   * clean — re-picking the file or switching kind clears this so a stale validation can't be
   * used to skip straight to a real import. */
  readonly validatedForImport = signal(false);

  readonly mappedRows = signal<MappedRow[]>([]);
  readonly columnDefs: ColDef[] = [
    { field: "insmaEquipmentName", headerName: "INSMA Equipment Name", flex: 1.2 },
    { field: "wedEquipmentName", headerName: "WED Equipment Name", flex: 1.2 },
    { field: "wedItemCode", headerName: "WED Item Code", flex: 1 },
    { field: "createdAt", headerName: "Created At", width: 160 },
  ];

  ngOnInit(): void {
    void this.loadMapOptions();
    this.importForm.controls.kind.valueChanges.subscribe(() => this.onImportKindChanged());
    this.importForm.controls.file.valueChanges.subscribe((file) => this.onImportFileChanged(file));
  }

  private async loadMapOptions(): Promise<void> {
    const [insmaOptions, wedOptions] = await Promise.all([
      firstValueFrom(this.api.getInsmaEquipmentOptions()),
      firstValueFrom(this.api.getUnmappedWedEquipmentOptions()),
    ]);
    this.insmaEquipmentOptions.set(insmaOptions);
    this.wedEquipmentOptions.set(wedOptions);
    await this.loadMappedRows();
  }

  private async loadMappedRows(): Promise<void> {
    const insmaById = new Map(this.insmaEquipmentOptions().map((o) => [o.value, o.label]));
    const wedById = new Map(this.wedEquipmentOptions().map((o) => [o.value, o.label]));
    const mappings = await firstValueFrom(this.api.getSpareDataMappings());
    this.mappedRows.set(
      mappings.map((row) => ({
        insmaEquipmentName: (row.equipment != null && insmaById.get(String(row.equipment))) || "-",
        wedEquipmentName: (row.wed_equipment != null && wedById.get(String(row.wed_equipment))) || "-",
        wedItemCode: "-",
        createdAt: row.created_at ? new Date(row.created_at).toLocaleDateString() : "-",
      })),
    );
  }

  selectTab(tab: MastersTab): void {
    this.activeTab.set(tab);
  }

  async submitMap(): Promise<void> {
    if (this.mapForm.invalid) {
      this.mapForm.markAllAsTouched();
      this.notifications.error("Pick both the INSMA Equipment Name and the WED Equipment Name.");
      return;
    }
    const { equipmentName, equipmentClass } = this.mapForm.value;
    if (!equipmentName || !equipmentClass) return;
    this.submittingMap.set(true);
    try {
      await firstValueFrom(this.api.createSpareDataMap(equipmentName, equipmentClass));
      this.notifications.success("Mapping saved.");
      this.mapForm.reset({ equipmentName: "", equipmentClass: "" });
      // The WED equipment dropdown only lists unmapped equipment — refresh it too, not just the list.
      await this.loadMapOptions();
    } catch (error) {
      this.notifications.error(error instanceof Error ? error.message : "Saving the mapping failed.");
    } finally {
      this.submittingMap.set(false);
    }
  }

  async syncEquipment(): Promise<void> {
    this.syncingEquipment.set(true);
    try {
      const result = await firstValueFrom(this.api.syncEquipmentFromWed());
      this.notifications.success(
        result.created || result.updated
          ? `Equipment synced. Created: ${result.created}, Updated: ${result.updated}.`
          : result.message,
      );
    } finally {
      this.syncingEquipment.set(false);
    }
  }

  async syncSpares(): Promise<void> {
    this.syncingSpares.set(true);
    try {
      const result = await firstValueFrom(this.api.syncSparesFromWed());
      this.notifications.success(
        result.created || result.updated
          ? `Spares synced. Created: ${result.created}, Updated: ${result.updated}.`
          : result.message,
      );
    } finally {
      this.syncingSpares.set(false);
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

  private templateDownloadErrorMessage(status: number | undefined): string {
    if (status === 401 || status === 403) return "You are not authorised to download this template.";
    if (status === 404) return "The template endpoint could not be found on the server.";
    if (status && status >= 500) return "The server failed to generate the template. Please try again shortly.";
    return "Could not download the import template.";
  }

  async downloadImportTemplate(): Promise<void> {
    const kind = this.importForm.controls.kind.value;
    this.downloadingTemplate.set(true);
    try {
      const blob = await firstValueFrom(this.api.downloadImportTemplate(kind));
      this.exportService.downloadBlob(blob, `${kind}_import_template.xlsx`);
    } catch (error) {
      // Logged (not just toasted) because the generic toast alone gives no way to tell a real
      // server/auth failure apart from e.g. a transient network drop — `error.error` is a Blob
      // here (responseType: "blob"), so the JSON detail the backend may have sent isn't visible
      // without reading it back out.
      console.error("Failed to download the WED import template:", error);
      if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
        void error.error.text().then((text) => console.error("Server response body:", text));
      }
      const status = error instanceof HttpErrorResponse ? error.status : undefined;
      this.notifications.error(this.templateDownloadErrorMessage(status));
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
