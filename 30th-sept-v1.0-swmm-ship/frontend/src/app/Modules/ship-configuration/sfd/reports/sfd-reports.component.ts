import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from "@angular/core";
import { ColDef } from "ag-grid-community";
import { firstValueFrom } from "rxjs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { CollapsibleSidebar } from "../../../../shared/components/collapsible-sidebar/collapsible-sidebar";
import { SidebarItem } from "../../../../shared/components/collapsible-sidebar/collapsible-sidebar.models";
import { MasterDataService } from "../../../../Core/services/master-data/master-data.service";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { formatDisplayDate } from "../../../../shared/utils/date-format";

import {
  APPROVAL_COLUMN_BY_FIELD,
  APPROVAL_FIELD_BY_COLUMN,
  APPROVAL_FILTER_OPTION_FIELD,
  APPROVAL_FILTER_PARAM,
  COL_DEPS,
  ColumnChip,
  DATE_FIELDS,
  DEFAULT_COLS,
  FilterField,
  INSTALLATION_COLUMN_BY_FIELD,
  INSTALLATION_FIELD_BY_COLUMN,
  INSTALLATION_FILTER_OPTION_FIELD,
  INSTALLATION_FILTER_PARAM,
  LOCATION_COLUMN_BY_FIELD,
  LOCATION_FIELD_BY_COLUMN,
  LOCATION_FILTER_OPTION_FIELD,
  LOCATION_FILTER_PARAM,
  LOCKED_COLS,
  REMOVED_COLUMN_BY_FIELD,
  REMOVED_FIELD_BY_COLUMN,
  REMOVED_FILTER_OPTION_FIELD,
  REMOVED_FILTER_PARAM,
  REPORTS,
  ReportDef,
  SFD_APPROVAL_REPORT_ID,
  SFD_INSTALLATION_REPORT_ID,
  SFD_LOCATION_REPORT_ID,
  SFD_REMOVED_REPORT_ID,
  SFD_REPORT_KEY_BY_ID,
  SFD_SHIP_EQUIPMENT_REPORT_ID,
  SFD_TRANSACTION_REPORT_ID,
  SHIP_EQUIPMENT_COLUMN_BY_FIELD,
  SHIP_EQUIPMENT_FIELD_BY_COLUMN,
  SHIP_EQUIPMENT_FILTER_OPTION_FIELD,
  SHIP_EQUIPMENT_FILTER_PARAM,
  STATIC_FILTER_OPTIONS,
  TRANSACTION_COLUMN_BY_FIELD,
  TRANSACTION_FIELD_BY_COLUMN,
  TRANSACTION_FILTER_OPTION_FIELD,
  TRANSACTION_FILTER_PARAM,
} from "./sfd-reports.data";
import {
  FilterOption,
  ReportFilterField,
  ReportsFilterOptions,
  SfdApprovalStatusParams,
  SfdApprovalStatusRow,
  SfdInstallationParams,
  SfdInstallationRow,
  SfdLocationParams,
  SfdLocationRow,
  SfdRemovedEquipmentParams,
  SfdRemovedEquipmentRow,
  SfdTransactionParams,
  SfdTransactionRow,
  ShipEquipmentConfigurationParams,
  ShipEquipmentConfigurationRow,
} from "../services/sfd-reports-api.module";
import { SfdConfigApiService } from "../services/sfd-config-api.service";
import { SfdReportsApiService } from "../services/sfd-reports-api.service";
import { SelectInput } from "../../../../shared/components/select-input/select-input";
import { FormsModule } from "@angular/forms";
import { getErrorMessage } from "../../../../Core/http/services/http-feedback";
import {
  ExportKind,
  ExportToolbar,
} from "../../../../shared/components/export-toolbar/export-toolbar";
import {
  PrintColumn,
  ReportExportService,
} from "../../../../Core/services/export/generic-export.service";

/** API fields returned as ISO datetimes — rendered as plain dates in the grid. */
const API_DATETIME_FIELDS = new Set(["removal_date", "install_date"]);

function formatApiDate(value: unknown): string {
  if (!value) return "";
  return formatDisplayDate(String(value));
}

@Component({
  selector: "app-sfd-reports",
  standalone: true,
  imports: [DataGrid, IconComponent, CollapsibleSidebar, SelectInput, FormsModule, ExportToolbar, ButtonComponent],
  templateUrl: "./sfd-reports.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./sfd-reports.component.css"],
})
export class SfdReportsComponent implements OnInit {
  private readonly reportsApi = inject(SfdReportsApiService);
  private readonly masterData = inject(MasterDataService);
  private readonly sfdConfigApi = inject(SfdConfigApiService);
  private readonly notification = inject(NotificationService);
  private readonly reportExport = inject(ReportExportService);
  readonly reports: ReportDef[] = REPORTS;

  /** Report catalog mapped to the shared collapsible-sidebar item shape. */
  readonly navItems = computed<SidebarItem[]>(() =>
    this.reports.map((r) => ({ id: r.id, label: r.name, icon: r.iconName })),
  );

  readonly openReportId = signal<string>(this.reports[0].id);
  readonly navCollapsed = signal(false);
  readonly filtersCollapsed = signal(true);
  readonly colPickerOpen = signal(false);
  readonly exportingKind = signal<ExportKind | null>(null);
  readonly reportFilters = signal<Record<string, string>>({});
  readonly reportCols = signal<Record<string, string[]>>({});
  readonly shipEquipRows = signal<ShipEquipmentConfigurationRow[]>([]);
  readonly shipEquipTotalCount = signal(0);
  readonly shipEquipFilterOptions = signal<ReportsFilterOptions>({});
  private shipEquipPageSize = 10;
  readonly txRows = signal<SfdTransactionRow[]>([]);
  readonly txTotalCount = signal(0);
  readonly txFilterOptions = signal<ReportsFilterOptions>({});
  private txPageSize = 10;

  readonly installRows = signal<SfdInstallationRow[]>([]);
  readonly installTotalCount = signal(0);
  readonly installFilterOptions = signal<ReportsFilterOptions>({});
  private installPageSize = 10;

  readonly locationRows = signal<SfdLocationRow[]>([]);
  readonly locationTotalCount = signal(0);
  readonly locationFilterOptions = signal<ReportsFilterOptions>({});
  private locationPageSize = 10;

  readonly removedRows = signal<SfdRemovedEquipmentRow[]>([]);
  readonly removedTotalCount = signal(0);
  readonly removedFilterOptions = signal<ReportsFilterOptions>({});
  private removedPageSize = 10;

  readonly approvalRows = signal<SfdApprovalStatusRow[]>([]);
  readonly approvalTotalCount = signal(0);
  readonly approvalFilterOptions = signal<ReportsFilterOptions>({});
  private approvalPageSize = 10;

  readonly deptFilterOptions = computed<FilterOption[]>(() =>
    this.masterData
      .departments()
      .map((d) => ({ value: String(d.value), label: d.label })),
  );
  readonly subDeptFilterOptions = signal<FilterOption[]>([]);

  readonly openReport = computed(
    () =>
      this.reports.find((r) => r.id === this.openReportId()) ?? this.reports[0],
  );
  readonly isShipEquipmentConfigReport = computed(
    () => this.openReport().id === SFD_SHIP_EQUIPMENT_REPORT_ID,
  );
  readonly isTransactionReport = computed(
    () => this.openReport().id === SFD_TRANSACTION_REPORT_ID,
  );
  readonly isInstallationReport = computed(
    () => this.openReport().id === SFD_INSTALLATION_REPORT_ID,
  );
  readonly isLocationReport = computed(
    () => this.openReport().id === SFD_LOCATION_REPORT_ID,
  );
  readonly isRemovedReport = computed(
    () => this.openReport().id === SFD_REMOVED_REPORT_ID,
  );
  readonly isApprovalReport = computed(
    () => this.openReport().id === SFD_APPROVAL_REPORT_ID,
  );

  private filterOptionFieldForOpenReport(): Record<string, ReportFilterField> {
    if (this.isShipEquipmentConfigReport()) return SHIP_EQUIPMENT_FILTER_OPTION_FIELD;
    if (this.isTransactionReport()) return TRANSACTION_FILTER_OPTION_FIELD;
    if (this.isInstallationReport()) return INSTALLATION_FILTER_OPTION_FIELD;
    if (this.isLocationReport()) return LOCATION_FILTER_OPTION_FIELD;
    if (this.isRemovedReport()) return REMOVED_FILTER_OPTION_FIELD;
    if (this.isApprovalReport()) return APPROVAL_FILTER_OPTION_FIELD;
    return {};
  }

  private apiFilterOptionsForOpenReport(): ReportsFilterOptions {
    if (this.isShipEquipmentConfigReport()) return this.shipEquipFilterOptions();
    if (this.isTransactionReport()) return this.txFilterOptions();
    if (this.isInstallationReport()) return this.installFilterOptions();
    if (this.isLocationReport()) return this.locationFilterOptions();
    if (this.isRemovedReport()) return this.removedFilterOptions();
    if (this.isApprovalReport()) return this.approvalFilterOptions();
    return {};
  }

  readonly filterFields = computed<FilterField[]>(() => {
    const rf = this.reportFilters();
    const optionField = this.filterOptionFieldForOpenReport();
    const apiOptions = this.apiFilterOptionsForOpenReport();
    return this.openReport().filters.map((name) => {
      let options: FilterOption[];
      const apiField = optionField[name];
      const staticOptions = STATIC_FILTER_OPTIONS[name];
      if (apiField) {
        options = apiOptions[apiField] ?? [];
      } else if (staticOptions) {
        options = staticOptions;
      } else if (name === "Department") {
        options = this.deptFilterOptions();
      } else if (name === "Sub Department") {
        options = this.subDeptFilterOptions();
      } else {
        options = [];
      }
      return {
        name,
        value: rf[name] ?? "",
        placeholder: DATE_FIELDS.has(name)
          ? "Select Date Range"
          : `Select ${name}`,
        isDate: DATE_FIELDS.has(name),
        options,
      };
    });
  });

  readonly appliedFilterCount = computed(() => {
    const rf = this.reportFilters();
    return this.openReport().filters.filter((f) => rf[f] && rf[f] !== "All")
      .length;
  });

  readonly hasAppliedFilters = computed(() => this.appliedFilterCount() > 0);
  readonly displayColumns = computed<string[]>(() => this.currentCols());
  readonly requiredColSet = computed<Set<string>>(() => {
    const required = this.requiredCols(this.displayColumns());
    (LOCKED_COLS[this.openReportId()] ?? []).forEach((c) => required.add(c));
    return required;
  });
  readonly displayColCount = computed(() => this.displayColumns().length);
  readonly columnChips = computed<ColumnChip[]>(() => {
    const display = this.displayColumns();
    const required = this.requiredColSet();
    const selected: ColumnChip[] = display.map((name, i) => ({
      name,
      selected: true,
      pos: i + 1,
      locked: required.has(name),
    }));
    const addable: ColumnChip[] = this.openReport()
      .columns.filter((c) => !display.includes(c))
      .map((name) => ({ name, selected: false, pos: 0, locked: false }));
    return [...selected, ...addable];
  });

  private fieldByColumnForOpenReport(): Record<string, string> | null {
    if (this.isShipEquipmentConfigReport()) return SHIP_EQUIPMENT_FIELD_BY_COLUMN;
    if (this.isTransactionReport()) return TRANSACTION_FIELD_BY_COLUMN;
    if (this.isInstallationReport()) return INSTALLATION_FIELD_BY_COLUMN;
    if (this.isLocationReport()) return LOCATION_FIELD_BY_COLUMN;
    if (this.isRemovedReport()) return REMOVED_FIELD_BY_COLUMN;
    if (this.isApprovalReport()) return APPROVAL_FIELD_BY_COLUMN;
    return null;
  }

  private columnByFieldForOpenReport(): Record<string, string> | null {
    if (this.isShipEquipmentConfigReport()) return SHIP_EQUIPMENT_COLUMN_BY_FIELD;
    if (this.isTransactionReport()) return TRANSACTION_COLUMN_BY_FIELD;
    if (this.isInstallationReport()) return INSTALLATION_COLUMN_BY_FIELD;
    if (this.isLocationReport()) return LOCATION_COLUMN_BY_FIELD;
    if (this.isRemovedReport()) return REMOVED_COLUMN_BY_FIELD;
    if (this.isApprovalReport()) return APPROVAL_COLUMN_BY_FIELD;
    return null;
  }

  private filterParamForOpenReport(): Record<string, string> {
    if (this.isShipEquipmentConfigReport()) return SHIP_EQUIPMENT_FILTER_PARAM;
    if (this.isTransactionReport()) return TRANSACTION_FILTER_PARAM;
    if (this.isInstallationReport()) return INSTALLATION_FILTER_PARAM;
    if (this.isLocationReport()) return LOCATION_FILTER_PARAM;
    if (this.isRemovedReport()) return REMOVED_FILTER_PARAM;
    if (this.isApprovalReport()) return APPROVAL_FILTER_PARAM;
    return {};
  }

  private buildExportFilterParams(): Record<string, string> {
    const rf = this.reportFilters();
    const paramMap = this.filterParamForOpenReport();
    const params: Record<string, string> = {};
    Object.entries(paramMap).forEach(([filterName, paramKey]) => {
      const value = rf[filterName];
      if (value && value !== "All") {
        params[paramKey] = value;
      }
    });
    return params;
  }

  readonly columnDefs = computed<ColDef[]>(() => {
    const fieldByColumn = this.fieldByColumnForOpenReport();
    return this.displayColumns().map((c) => {
      const field = fieldByColumn ? (fieldByColumn[c] ?? c) : c;
      const def: ColDef = { headerName: c, field };
      if (API_DATETIME_FIELDS.has(field)) {
        def.valueFormatter = (params) => formatApiDate(params["value"]);
      }
      return def;
    });
  });

  readonly rowData = computed<Record<string, string>[]>(() => {
    if (this.isShipEquipmentConfigReport()) {
      return this.shipEquipRows() as unknown as Record<string, string>[];
    }
    if (this.isTransactionReport()) {
      return this.txRows() as unknown as Record<string, string>[];
    }
    if (this.isInstallationReport()) {
      return this.installRows() as unknown as Record<string, string>[];
    }
    if (this.isLocationReport()) {
      return this.locationRows() as unknown as Record<string, string>[];
    }
    if (this.isRemovedReport()) {
      return this.removedRows() as unknown as Record<string, string>[];
    }
    if (this.isApprovalReport()) {
      return this.approvalRows() as unknown as Record<string, string>[];
    }
    return [];
  });

  readonly gridTotalCount = computed<number | null>(() => {
    if (this.isShipEquipmentConfigReport()) return this.shipEquipTotalCount();
    if (this.isTransactionReport()) return this.txTotalCount();
    if (this.isInstallationReport()) return this.installTotalCount();
    if (this.isLocationReport()) return this.locationTotalCount();
    if (this.isRemovedReport()) return this.removedTotalCount();
    if (this.isApprovalReport()) return this.approvalTotalCount();
    return null;
  });

  ngOnInit(): void {
    this.loadActiveReportData();
  }

  select(id: string): void {
    this.openReportId.set(id);
    this.reportFilters.set({});
    this.shipEquipFilterOptions.set({});
    this.txFilterOptions.set({});
    this.installFilterOptions.set({});
    this.locationFilterOptions.set({});
    this.removedFilterOptions.set({});
    this.approvalFilterOptions.set({});
    this.subDeptFilterOptions.set([]);
    this.colPickerOpen.set(false);
    this.navCollapsed.set(true);
    this.loadActiveReportData();
  }

  private loadActiveReportData(): void {
    if (this.isShipEquipmentConfigReport()) {
      this.loadShipEquipmentFilterOptions();
      this.loadShipEquipmentConfig(1, this.shipEquipPageSize);
    } else if (this.isTransactionReport()) {
      this.loadFilterOptions();
      this.loadTransactions(1, this.txPageSize);
    } else if (this.isInstallationReport()) {
      this.loadInstallationFilterOptions();
      this.loadInstallations(1, this.installPageSize);
    } else if (this.isLocationReport()) {
      this.loadLocationFilterOptions();
      this.loadLocations(1, this.locationPageSize);
    } else if (this.isRemovedReport()) {
      this.loadRemovedFilterOptions();
      this.loadRemovedEquipment(1, this.removedPageSize);
    } else if (this.isApprovalReport()) {
      this.loadApprovalFilterOptions();
      this.loadApprovalStatus(1, this.approvalPageSize);
    }
  }

  private reloadActiveReportPage1(): void {
    if (this.isShipEquipmentConfigReport()) {
      this.loadShipEquipmentConfig(1, this.shipEquipPageSize);
    } else if (this.isTransactionReport()) {
      this.loadTransactions(1, this.txPageSize);
    } else if (this.isInstallationReport()) {
      this.loadInstallations(1, this.installPageSize);
    } else if (this.isLocationReport()) {
      this.loadLocations(1, this.locationPageSize);
    } else if (this.isRemovedReport()) {
      this.loadRemovedEquipment(1, this.removedPageSize);
    } else if (this.isApprovalReport()) {
      this.loadApprovalStatus(1, this.approvalPageSize);
    }
  }

  toggleFilters(): void {
    this.filtersCollapsed.update((v) => !v);
  }

  toggleColPicker(): void {
    this.colPickerOpen.update((v) => !v);
  }

  setFilter(field: string, value: string | null): void {
    const val = value ?? "";
    this.reportFilters.update((rf) => ({ ...rf, [field]: val }));
    this.reloadActiveReportPage1();
    if (
      field === "Department" &&
      this.openReport().filters.includes("Sub Department")
    ) {
      this.reportFilters.update((rf) => ({ ...rf, "Sub Department": "" }));
      this.loadSubDepartmentsForReport(val);
    }
  }

  resetFilters(): void {
    this.reportFilters.set({});
    this.subDeptFilterOptions.set([]);
    this.reloadActiveReportPage1();
  }

  private currentCols(): string[] {
    const id = this.openReportId();
    return (
      this.reportCols()[id] ?? DEFAULT_COLS[id] ?? this.openReport().columns
    );
  }

  private colDepClosure(col: string, acc = new Set<string>()): Set<string> {
    (COL_DEPS[col] ?? []).forEach((d) => {
      if (!acc.has(d)) {
        acc.add(d);
        this.colDepClosure(d, acc);
      }
    });
    return acc;
  }

  private requiredCols(cols: string[]): Set<string> {
    const pool = new Set(this.openReport().columns);
    const req = new Set<string>();
    cols.forEach((c) =>
      this.colDepClosure(c).forEach((d) => {
        if (pool.has(d)) req.add(d);
      }),
    );
    return req;
  }

  private setCols(cols: string[]): void {
    const out = [...cols];
    this.requiredCols(cols).forEach((d) => {
      if (!out.includes(d)) out.push(d);
    });
    this.reportCols.update((rc) => ({ ...rc, [this.openReportId()]: out }));
  }

  addCol(col: string): void {
    const cur = this.currentCols();
    if (!cur.includes(col)) this.setCols([...cur, col]);
  }

  removeCol(col: string): void {
    if ((LOCKED_COLS[this.openReportId()] ?? []).includes(col)) {
      this.notification.info(
        `${col} is a required column for this report`,
        "Column required",
      );
      return;
    }
    const cur = this.currentCols();
    const blockers = cur.filter(
      (c) => c !== col && this.colDepClosure(c).has(col),
    );
    if (blockers.length) {
      this.notification.info(
        `${col} is required by ${blockers.join(", ")}`,
        "Column required",
      );
      return;
    }
    this.setCols(cur.filter((c) => c !== col));
  }

  resetCols(): void {
    const id = this.openReportId();
    this.reportCols.update((rc) => {
      const next = { ...rc };
      delete next[id];
      return next;
    });
  }

  onColumnsReordered(fieldOrder: string[]): void {
    const columnByField = this.columnByFieldForOpenReport();
    const pool = this.openReport().columns;
    const cols = fieldOrder
      .map((f) => (columnByField ? (columnByField[f] ?? f) : f))
      .filter((c) => pool.includes(c));
    if (cols.length) {
      this.reportCols.update((rc) => ({ ...rc, [this.openReportId()]: cols }));
    }
  }

  readonly previewColumns = computed<PrintColumn[]>(() => {
    const rows = this.rowData();
    const hasData = (field: string) =>
      rows.length === 0 ||
      rows.some((row) => {
        const raw = row[field];
        return raw !== null && raw !== undefined && String(raw).trim() !== "";
      });
    return this.columnDefs()
      .map((c) => {
        const field = c.field ?? "";
        return {
          header: String(c.headerName ?? field),
          field,
          format: API_DATETIME_FIELDS.has(field) ? formatApiDate : undefined,
        };
      })
      .filter((c) => hasData(c.field));
  });

  async export(kind: ExportKind): Promise<void> {
    const report = this.openReport();

    if (kind === "print") {
      const win = this.reportExport.openLoadingWindow(
        report.name,
        this.previewColumns().length,
      );
      if (!win) return;
      this.reportExport.renderPreviewWindow(
        win,
        report.name,
        this.previewColumns(),
        this.rowData(),
        { print: true },
      );
      return;
    }

    if (this.exportingKind()) return;

    this.exportingKind.set(kind);
    try {
      const columns = this.previewColumns();
      const rows = this.rowData();
      const reportKey = SFD_REPORT_KEY_BY_ID[report.id] || report.id;

      if (kind === "excel") {
        this.exportToExcel(reportKey, columns, rows);
      } else if (kind === "pdf") {
        this.exportToPdf(report.name, columns, rows);
      }

      this.notification.success(`${report.name} exported successfully as ${kind === "excel" ? "Excel" : "PDF"}`);
    } catch (error) {
      console.error(
        "Failed to export SFD report",
        getErrorMessage(error),
      );
      this.notification.error(`Failed to export ${kind === "excel" ? "Excel" : "PDF"} file`);
    } finally {
      this.exportingKind.set(null);
    }
  }

  private exportToExcel(filename: string, columns: PrintColumn[], rows: unknown[]): void {
    // Create a 2D array with headers and data
    const headers = columns.map(col => col.header);
    const data = rows.map(row =>
      columns.map(col => {
        const value = (row as Record<string, unknown>)[col.field];
        const formatted = col.format ? col.format(value, row as Record<string, unknown>) : (value === null || value === undefined ? "" : String(value));
        return formatted;
      })
    );

    // Create CSV content (Excel can open CSV files)
    const csvContent = [
      headers.join(","),
      ...data.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    // Create and download the file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    this.reportExport.downloadBlob(blob, `${filename}.csv`);
  }

  private exportToPdf(reportName: string, columns: PrintColumn[], rows: unknown[]): void {
    const safeRows = (rows || []) as Record<string, unknown>[];

    const orientation = columns.length > 5 ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 38, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text('SWMM', 24, 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text(reportName, 24, 62);
    const now = new Date();
    const dateStr =
      now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' +
      now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${dateStr}   |   Total Records: ${safeRows.length}`, 24, 76);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(1);
    doc.line(24, 84, pageWidth - 24, 84);
    if (safeRows.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(128, 128, 128);
      doc.text('No data available to export', 24, 110);
      doc.save(`${reportName.replace(/\s+/g, '-')}.pdf`);
      return;
    }
    const tableHeaders = [columns.map(c => c.header)];
    const tableData = safeRows.map((row, index) =>
      columns.map(col => {
        const value = row[col.field];
        let formatted: string;
        if (col.format) {
          formatted = col.format(value, row, index);
        } else if (value === null || value === undefined) {
          formatted = '';
        } else {
          formatted = String(value);
        }
        return formatted;
      })
    );

    // Calculate dynamic font sizes
    const bodyFontSize = columns.length > 10 ? 6.5 : columns.length > 6 ? 7.5 : 8.5;
    const headFontSize = columns.length > 10 ? 7 : columns.length > 6 ? 8 : 9;

    // Generate table with autoTable
    autoTable(doc, {
      head: tableHeaders,
      body: tableData,
      startY: 92,
      margin: { left: 24, right: 24, top: 46, bottom: 36 },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: bodyFontSize,
        cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: headFontSize,
        halign: 'left',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didDrawPage: (data: unknown) => {
        const hookData = data as Record<string, unknown>;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('SWMM System Generated Report', 24, pageHeight - 14);
        const pageCount = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
        const pageStr = `Page ${hookData['pageNumber']} of ${pageCount}`;
        doc.text(pageStr, pageWidth - 24 - doc.getTextWidth(pageStr), pageHeight - 14);
      },
    });

    doc.save(`${reportName.replace(/\s+/g, '-')}.pdf`);
  }

  onPageRequested(event: { page: number; pageSize: number }): void {
    if (this.isShipEquipmentConfigReport()) {
      this.loadShipEquipmentConfig(event.page, event.pageSize);
    } else if (this.isTransactionReport()) {
      this.loadTransactions(event.page, event.pageSize);
    } else if (this.isInstallationReport()) {
      this.loadInstallations(event.page, event.pageSize);
    } else if (this.isLocationReport()) {
      this.loadLocations(event.page, event.pageSize);
    } else if (this.isRemovedReport()) {
      this.loadRemovedEquipment(event.page, event.pageSize);
    } else if (this.isApprovalReport()) {
      this.loadApprovalStatus(event.page, event.pageSize);
    }
  }

  private async loadSubDepartmentsForReport(
    departmentValue: string,
  ): Promise<void> {
    if (!departmentValue) {
      this.subDeptFilterOptions.set([]);
      return;
    }
    try {
      const response = await firstValueFrom(
        this.sfdConfigApi.getSubDepartments({
          department: Number(departmentValue),
          page: 1,
          page_size: 100,
        }),
      );
      this.subDeptFilterOptions.set(
        response.results.map((s) => ({ value: s.name, label: s.name })),
      );
    } catch (error) {
      console.error("Failed to load sub-departments for report filter", error);
      this.subDeptFilterOptions.set([]);
    }
  }

  private async loadShipEquipmentFilterOptions(): Promise<void> {
    const fields = Object.values(SHIP_EQUIPMENT_FILTER_OPTION_FIELD);
    try {
      const options = await firstValueFrom(
        this.reportsApi.getReportsFilterOptions(fields),
      );
      this.shipEquipFilterOptions.set(options ?? {});
    } catch (error) {
      console.error(
        "Failed to load ship equipment configuration filter options",
        error,
      );
      this.shipEquipFilterOptions.set({});
    }
  }

  private async loadRemovedFilterOptions(): Promise<void> {
    const fields = Object.values(REMOVED_FILTER_OPTION_FIELD);
    try {
      const options = await firstValueFrom(
        this.reportsApi.getReportsFilterOptions(fields),
      );
      this.removedFilterOptions.set(options ?? {});
    } catch (error) {
      console.error("Failed to load removed equipment filter options", error);
      this.removedFilterOptions.set({});
    }
  }

  private async loadApprovalFilterOptions(): Promise<void> {
    const fields = Object.values(APPROVAL_FILTER_OPTION_FIELD);
    try {
      const options = await firstValueFrom(
        this.reportsApi.getReportsFilterOptions(fields),
      );
      this.approvalFilterOptions.set(options ?? {});
    } catch (error) {
      console.error("Failed to load approval status filter options", error);
      this.approvalFilterOptions.set({});
    }
  }

  private async loadFilterOptions(): Promise<void> {
    const fields = Object.values(TRANSACTION_FILTER_OPTION_FIELD);
    try {
      const options = await firstValueFrom(
        this.reportsApi.getReportsFilterOptions(fields),
      );
      this.txFilterOptions.set(options ?? {});
    } catch (error) {
      console.error("Failed to load SFD report filter options", error);
      this.txFilterOptions.set({});
    }
  }

  private async loadInstallationFilterOptions(): Promise<void> {
    const fields = Object.values(INSTALLATION_FILTER_OPTION_FIELD);
    try {
      const options = await firstValueFrom(
        this.reportsApi.getReportsFilterOptions(fields),
      );
      this.installFilterOptions.set(options ?? {});
    } catch (error) {
      console.error("Failed to load SFD installation filter options", error);
      this.installFilterOptions.set({});
    }
  }

  private async loadLocationFilterOptions(): Promise<void> {
    const fields = Object.values(LOCATION_FILTER_OPTION_FIELD);
    try {
      const options = await firstValueFrom(
        this.reportsApi.getReportsFilterOptions(fields),
      );
      this.locationFilterOptions.set(options ?? {});
    } catch (error) {
      console.error("Failed to load SFD location filter options", error);
      this.locationFilterOptions.set({});
    }
  }

  private buildShipEquipParams(
    page: number,
    pageSize: number,
  ): ShipEquipmentConfigurationParams {
    const rf = this.reportFilters();
    const params: ShipEquipmentConfigurationParams = { page, page_size: pageSize };
    Object.entries(SHIP_EQUIPMENT_FILTER_PARAM).forEach(
      ([filterName, paramKey]) => {
        const value = rf[filterName];
        if (value && value !== "All") {
          (params as Record<string, string | number>)[paramKey] = value;
        }
      },
    );
    return params;
  }

  private async loadShipEquipmentConfig(
    page: number,
    pageSize: number,
  ): Promise<void> {
    this.shipEquipPageSize = pageSize;
    try {
      const response = await firstValueFrom(
        this.reportsApi.getShipEquipmentConfiguration(
          this.buildShipEquipParams(page, pageSize),
        ),
      );
      this.shipEquipRows.set(response.results ?? []);
      this.shipEquipTotalCount.set(response.count ?? 0);
    } catch (error) {
      console.error("Failed to load ship equipment configuration report", error);
      this.shipEquipRows.set([]);
      this.shipEquipTotalCount.set(0);
    }
  }

  private buildTransactionParams(
    page: number,
    pageSize: number,
  ): SfdTransactionParams {
    const rf = this.reportFilters();
    const params: SfdTransactionParams = { page, page_size: pageSize };
    Object.entries(TRANSACTION_FILTER_PARAM).forEach(
      ([filterName, paramKey]) => {
        const value = rf[filterName];
        if (value && value !== "All") {
          (params as Record<string, string | number>)[paramKey] = value;
        }
      },
    );
    return params;
  }

  private async loadTransactions(
    page: number,
    pageSize: number,
  ): Promise<void> {
    this.txPageSize = pageSize;
    try {
      const response = await firstValueFrom(
        this.reportsApi.getSfdTransactions(
          this.buildTransactionParams(page, pageSize),
        ),
      );
      this.txRows.set(response.results ?? []);
      this.txTotalCount.set(response.count ?? 0);
    } catch (error) {
      console.error("Failed to load SFD transactions", error);
      this.txRows.set([]);
      this.txTotalCount.set(0);
    }
  }

  private buildInstallationParams(
    page: number,
    pageSize: number,
  ): SfdInstallationParams {
    const rf = this.reportFilters();
    const params: SfdInstallationParams = { page, page_size: pageSize };
    Object.entries(INSTALLATION_FILTER_PARAM).forEach(
      ([filterName, paramKey]) => {
        const value = rf[filterName];
        if (value && value !== "All") {
          (params as Record<string, string | number>)[paramKey] = value;
        }
      },
    );
    return params;
  }

  private async loadInstallations(
    page: number,
    pageSize: number,
  ): Promise<void> {
    this.installPageSize = pageSize;
    try {
      const response = await firstValueFrom(
        this.reportsApi.getSfdInstallations(
          this.buildInstallationParams(page, pageSize),
        ),
      );
      this.installRows.set(response.results ?? []);
      this.installTotalCount.set(response.count ?? 0);
    } catch (error) {
      console.error("Failed to load SFD installations", error);
      this.installRows.set([]);
      this.installTotalCount.set(0);
    }
  }

  private buildLocationParams(
    page: number,
    pageSize: number,
  ): SfdLocationParams {
    const rf = this.reportFilters();
    const params: SfdLocationParams = { page, page_size: pageSize };
    Object.entries(LOCATION_FILTER_PARAM).forEach(([filterName, paramKey]) => {
      const value = rf[filterName];
      if (value && value !== "All") {
        (params as Record<string, string | number>)[paramKey] = value;
      }
    });
    return params;
  }

  private async loadLocations(page: number, pageSize: number): Promise<void> {
    this.locationPageSize = pageSize;
    try {
      const response = await firstValueFrom(
        this.reportsApi.getSfdLocations(
          this.buildLocationParams(page, pageSize),
        ),
      );
      this.locationRows.set(response.results ?? []);
      this.locationTotalCount.set(response.count ?? 0);
    } catch (error) {
      console.error("Failed to load SFD locations", error);
      this.locationRows.set([]);
      this.locationTotalCount.set(0);
    }
  }

  private buildRemovedParams(
    page: number,
    pageSize: number,
  ): SfdRemovedEquipmentParams {
    const rf = this.reportFilters();
    const params: SfdRemovedEquipmentParams = { page, page_size: pageSize };
    Object.entries(REMOVED_FILTER_PARAM).forEach(([filterName, paramKey]) => {
      const value = rf[filterName];
      if (value && value !== "All") {
        (params as Record<string, string | number>)[paramKey] = value;
      }
    });
    return params;
  }

  private async loadRemovedEquipment(
    page: number,
    pageSize: number,
  ): Promise<void> {
    this.removedPageSize = pageSize;
    try {
      const response = await firstValueFrom(
        this.reportsApi.getRemovedEquipment(
          this.buildRemovedParams(page, pageSize),
        ),
      );
      this.removedRows.set(response.results ?? []);
      this.removedTotalCount.set(response.count ?? 0);
    } catch (error) {
      console.error("Failed to load removed SFD equipment", error);
      this.removedRows.set([]);
      this.removedTotalCount.set(0);
    }
  }

  private buildApprovalParams(
    page: number,
    pageSize: number,
  ): SfdApprovalStatusParams {
    const rf = this.reportFilters();
    const params: SfdApprovalStatusParams = { page, page_size: pageSize };
    Object.entries(APPROVAL_FILTER_PARAM).forEach(([filterName, paramKey]) => {
      const value = rf[filterName];
      if (value && value !== "All") {
        (params as Record<string, string | number>)[paramKey] = value;
      }
    });
    return params;
  }

  private async loadApprovalStatus(
    page: number,
    pageSize: number,
  ): Promise<void> {
    this.approvalPageSize = pageSize;
    try {
      const response = await firstValueFrom(
        this.reportsApi.getApprovalStatus(
          this.buildApprovalParams(page, pageSize),
        ),
      );
      this.approvalRows.set(response.results ?? []);
      this.approvalTotalCount.set(response.count ?? 0);
    } catch (error) {
      console.error("Failed to load SFD approval status report", error);
      this.approvalRows.set([]);
      this.approvalTotalCount.set(0);
    }
  }
}
