import { ButtonComponent } from '../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ColDef } from "ag-grid-community";
import { firstValueFrom } from "rxjs";

import { DataGrid, DropdownOption, GridStatusChipRenderer } from "../../../shared/components";
import { IconComponent } from "../../../shared/components/icon/icon.component";
import { ExportKind, ExportToolbar } from "../../../shared/components/export-toolbar/export-toolbar";
import { CollapsibleSidebar } from "../../../shared/components/collapsible-sidebar/collapsible-sidebar";
import { SidebarItem } from "../../../shared/components/collapsible-sidebar/collapsible-sidebar.models";
import { SelectInput } from "../../../shared/components/select-input/select-input";
import { ReportExportService } from "../../../Core/services/export/generic-export.service";
import { NotificationService } from "../../../Core/services/notification/notification.service";

import { OPM_REPORT_TONE_MAP, OPM_REPORTS, OpmReport, OpmReportColumn } from "./opm-reports.data";
import { DartReportsApiService } from "./services/dart-reports-api.service";

/** One entry in the Columns picker — selected chips are blue and numbered. */
interface OpmColumnChip {
  field: string;
  label: string;
  selected: boolean;
  /** 1-based display position; only meaningful for selected chips. */
  pos: number;
  /** Locked chips show the amber lock instead of a remove button. */
  locked: boolean;
}

/**
 * Operational Maintenance — Reports tab. A report catalog (collapsible nav) +
 * the selected report rendered in a shared data-grid, with inline filters, a
 * column-chip picker and an export toolbar. Reports backed by the DART reports
 * API (`services/dart-reports-api.service.ts`) load live rows; the two reports
 * with no backend endpoint yet keep sample rows. Export (PDF/Excel/Print) is
 * always generated client-side from those rows via `ReportExportService`.
 */
@Component({
  selector: "app-opm-reports",
  standalone: true,
  imports: [CollapsibleSidebar, DataGrid, ExportToolbar, IconComponent, SelectInput, FormsModule, ButtonComponent],
  templateUrl: "./opm-reports.component.html",
  styleUrls: ["./opm-reports.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpmReportsComponent {
  private readonly dartReportsApi = inject(DartReportsApiService);
  private readonly reportExport = inject(ReportExportService);
  private readonly notify = inject(NotificationService);

  private readonly reports: OpmReport[] = OPM_REPORTS;

  readonly navItems: SidebarItem[] = this.reports.map((r) => ({ id: r.id, label: r.name, icon: r.icon }));
  readonly navCollapsed = signal(false);

  readonly openReportId = signal<string>(this.reports[0].id);
  private readonly reportMeta = computed<OpmReport>(
    () => this.reports.find((r) => r.id === this.openReportId()) ?? this.reports[0],
  );

  // --- Live rows (fetched per report from the DART reports API) -------------
  private readonly liveRows = signal<Record<string, Record<string, string | number>[]>>({});
  readonly loadingReport = signal(false);

  /** The report's own seed rows for reports with no backend endpoint yet, else the fetched rows. */
  readonly report = computed<OpmReport>(() => {
    const meta = this.reportMeta();
    if (!meta.apiReportKey) return meta;
    return { ...meta, rows: this.liveRows()[meta.id] ?? meta.rows };
  });

  constructor() {
    effect(() => {
      void this.loadActiveReportRows();
    });
  }

  private async loadActiveReportRows(): Promise<void> {
    const meta = this.reportMeta();
    if (!meta.apiReportKey) return;

    this.loadingReport.set(true);
    try {
      const rows = await this.fetchReportRows(meta.apiReportKey);
      this.liveRows.update((m) => ({ ...m, [meta.id]: rows as unknown as Record<string, string | number>[] }));
    } catch {
      this.notify.error(`Could not load "${meta.name}". Please try again.`);
    } finally {
      this.loadingReport.set(false);
    }
  }

  private fetchReportRows(apiReportKey: NonNullable<OpmReport["apiReportKey"]>): Promise<unknown[]> {
    switch (apiReportKey) {
      case "darts":
        return firstValueFrom(this.dartReportsApi.getDartsReport());
      case "closed-darts":
        return firstValueFrom(this.dartReportsApi.getClosedDartsReport());
      case "service-required":
        return firstValueFrom(this.dartReportsApi.getServiceRequiredReport());
      case "guarantee-monitoring":
        return firstValueFrom(this.dartReportsApi.getGuaranteeMonitoringReport());
      case "spares-consumed":
        return firstValueFrom(this.dartReportsApi.getSparesConsumedReport());
      case "ra-status":
        return firstValueFrom(this.dartReportsApi.getRaStatusReport());
    }
  }

  selectReport(id: string): void {
    this.openReportId.set(id);
    this.filterValues.set({});
    this.dateRange.set(null);
    this.colOrder.set({});
    this.columnsOpen.set(false);
  }

  // --- Column filters (Severity / Status / Risk / ... — one per chip column) --
  readonly filtersOpen = signal(true);
  readonly filterValues = signal<Record<string, string>>({});

  /** Chip columns double as filterable fields — their value set comes from the report's own rows. */
  readonly filterFields = computed<{ field: string; label: string; value: string | null; options: DropdownOption[] }[]>(
    () => {
      const rows = this.report().rows;
      const values = this.filterValues();
      return this.report()
        .columns.filter((c) => c.chip)
        .map((c) => ({
          field: c.field,
          label: c.label,
          value: values[c.field] || null,
          options: Array.from(new Set(rows.map((r) => String(r[c.field]))))
            .sort((a, b) => a.localeCompare(b))
            .map((v) => ({ label: v, value: v })),
        }));
    },
  );

  // --- Date Range filter (on the report's own date column) -------------------
  /** The column the Date Range filter applies to, or null for reports without one. */
  readonly dateColumn = computed<OpmReportColumn | null>(() => this.report().columns.find((c) => c.date) ?? null);

  /** Same control shape as the other filters — a plain dropdown of presets. */
  readonly dateRangeOptions: DropdownOption[] = [
    { label: "Last 30 days", value: "30d" },
    { label: "Last 90 days", value: "90d" },
    { label: "This year", value: "ytd" },
    { label: "Last year", value: "prev-year" },
  ];

  readonly dateRange = signal<string | null>(null);

  setDateRange(value: string | number | null): void {
    this.dateRange.set(value ? String(value) : null);
  }

  /** The selected preset resolved to an inclusive `[from, to]` timestamp window. */
  private readonly dateWindow = computed<{ from: number; to: number } | null>(() => {
    const preset = this.dateRange();
    if (!preset) return null;

    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

    switch (preset) {
      case "30d":
      case "90d": {
        const days = preset === "30d" ? 30 : 90;
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
        return { from: start.getTime(), to: endOfToday };
      }
      case "ytd":
        return { from: new Date(now.getFullYear(), 0, 1).getTime(), to: endOfToday };
      case "prev-year":
        return {
          from: new Date(now.getFullYear() - 1, 0, 1).getTime(),
          to: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999).getTime(),
        };
      default:
        return null;
    }
  });

  /** `dd MMM yyyy` (the shape the report rows use) → a comparable timestamp. */
  private rowTime(value: unknown): number {
    return Date.parse(String(value));
  }

  readonly appliedFilterCount = computed(
    () => Object.values(this.filterValues()).filter((v) => !!v).length + (this.dateRange() ? 1 : 0),
  );

  toggleFilters(): void {
    this.filtersOpen.update((v) => !v);
  }

  setFilter(field: string, value: string | number | null): void {
    this.filterValues.update((v) => ({ ...v, [field]: value ? String(value) : "" }));
  }

  resetFilters(): void {
    this.filterValues.set({});
    this.dateRange.set(null);
  }

  // --- Column selection + order (Columns picker) -----------------------------
  readonly columnsOpen = signal(false);

  /** Per-report override of the displayed column order; absent = the report's own order. */
  private readonly colOrder = signal<Record<string, string[]>>({});

  /** Identity (first) and chip columns are auto-included — the chip filters depend on them. */
  private isRequired(c: OpmReportColumn): boolean {
    return !!c.chip || c === this.report().columns[0];
  }

  readonly visibleColumns = computed<OpmReportColumn[]>(() => {
    const all = this.report().columns;
    const order = this.colOrder()[this.openReportId()];
    if (!order) return all;
    return order.map((f) => all.find((c) => c.field === f)).filter((c): c is OpmReportColumn => !!c);
  });

  readonly columnChips = computed<OpmColumnChip[]>(() => {
    const shown = this.visibleColumns();
    const selected: OpmColumnChip[] = shown.map((c, i) => ({
      field: c.field,
      label: c.label,
      selected: true,
      pos: i + 1,
      locked: this.isRequired(c),
    }));
    const addable: OpmColumnChip[] = this.report()
      .columns.filter((c) => !shown.includes(c))
      .map((c) => ({ field: c.field, label: c.label, selected: false, pos: 0, locked: false }));
    return [...selected, ...addable];
  });

  toggleColumnsPicker(): void {
    this.columnsOpen.update((v) => !v);
  }

  private setOrder(fields: string[]): void {
    this.colOrder.update((o) => ({ ...o, [this.openReportId()]: fields }));
  }

  addColumn(field: string): void {
    const shown = this.visibleColumns().map((c) => c.field);
    if (!shown.includes(field)) this.setOrder([...shown, field]);
  }

  removeColumn(field: string): void {
    const col = this.report().columns.find((c) => c.field === field);
    if (!col || this.isRequired(col)) return;
    this.setOrder(
      this.visibleColumns()
        .map((c) => c.field)
        .filter((f) => f !== field),
    );
  }

  resetColumns(): void {
    this.colOrder.update((o) => {
      const next = { ...o };
      delete next[this.openReportId()];
      return next;
    });
  }

  /** Header drag finished — persist the new order so the chip numbers follow the grid. */
  onColumnsReordered(fieldOrder: string[]): void {
    const pool = new Set(this.report().columns.map((c) => c.field));
    const fields = fieldOrder.filter((f) => pool.has(f));
    if (fields.length) this.setOrder(fields);
  }

  // --- Rows + grid ----------------------------------------------------------
  readonly filteredRows = computed<Record<string, string | number>[]>(() => {
    const filters = this.filterValues();
    const window = this.dateWindow();
    const dateField = this.dateColumn()?.field;

    return this.report().rows.filter((r) => {
      const matchesFilters = Object.entries(filters).every(([field, value]) => !value || String(r[field]) === value);
      if (!matchesFilters) return false;
      if (!dateField || !window) return true;

      const t = this.rowTime(r[dateField]);
      if (Number.isNaN(t)) return false;
      return t >= window.from && t <= window.to;
    });
  });

  readonly columnDefs = computed<ColDef[]>(() =>
    this.visibleColumns().map((c) => {
      const def: ColDef = { headerName: c.label, field: c.field, colId: c.field, flex: 1, minWidth: 130 };
      if (c.chip) {
        def.cellRenderer = GridStatusChipRenderer;
        def.cellRendererParams = { toneMap: OPM_REPORT_TONE_MAP };
      }
      return def;
    }),
  );

  // --- Export -----------------------------------------------------------------
  readonly busy = signal<ExportKind | null>(null);

  /** Every kind (pdf/excel/print) is generated client-side from the currently
   * loaded (filtered) rows via `ReportExportService.export()` — the backend's
   * export endpoint always returns CSV regardless of the requested format
   * (`dart/views.py` `OPMReportExportAPIView`), so routing "PDF"/"Excel" through
   * it produced a CSV file mislabeled with the wrong extension every time. */
  onExport(kind: ExportKind): void {
    if (this.busy()) return;
    this.busy.set(kind);
    try {
      const columns = this.visibleColumns().map((c) => ({ header: c.label, field: c.field }));
      const ok = this.reportExport.export(kind, this.report().name, columns, this.filteredRows());
      if (!ok) {
        this.notify.error("Unable to open the print preview — check if a popup was blocked.");
      }
    } catch {
      this.notify.error("Export failed. Please try again.");
    } finally {
      this.busy.set(null);
    }
  }
}
