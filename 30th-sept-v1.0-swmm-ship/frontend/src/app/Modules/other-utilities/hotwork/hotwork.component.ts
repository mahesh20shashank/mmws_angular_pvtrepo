import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";

// Shared Components from src/app/shared/components
import { IconComponent } from "../../../shared/components/icon/icon.component";
import {
  ExportToolbar,
  ExportKind,
} from "../../../shared/components/export-toolbar/export-toolbar";
import { KpiCard } from "../../../shared/components/kpi-card/kpi-card";
import { PanelCard } from "../../../shared/components/panel-card/panel-card";
import { DatePickerComponent } from "../../../shared/components/date-picker/picker";
import { DataGrid } from "../../../shared/components/data-grid/data-grid";
import {
  LineChart,
  LineSeries,
} from "../../../shared/components/line-chart/line-chart";
import {
  BarChart,
  BarDatum,
} from "../../../shared/components/bar-chart/bar-chart";
import {
  DonutChart,
  DonutSegment,
} from "../../../shared/components/donut-chart/donut-chart";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import {
  CommonApiService,
  HotworkTrackingItem,
  HotworkDashboardData,
} from "../../../Core/http/services/api.service";
import { PrintColumn, ReportExportService } from "../../../Core/services/export/generic-export.service";

import { DetailDrawer } from "../../../shared/components/detail-drawer/detail-drawer";
import { SelectInput, DropdownOption } from "../../../shared/components/select-input/select-input";

export interface HotworkRecord {
  sNo: number;
  hotworkCode: string;
  parentCode: string;
  dateOfHotwork: string;
  departmentSection: string;
  descriptionOfHotwork: string;
  locationAdjacent: string;
  hotworkType: string;
  currentStatus: "Active" | "Pending" | "Paused" | "Completed";
  safeToWeldCert: "Issued" | "Pending" | "N/A";
}

@Component({
  selector: "app-hotwork",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IconComponent,
    ExportToolbar,
    KpiCard,
    PanelCard,
    DatePickerComponent,
    DataGrid,
    LineChart,
    BarChart,
    DonutChart,
    DetailDrawer,
    SelectInput,
  ],
  templateUrl: "./hotwork.component.html",
  styleUrl: "./hotwork.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HotworkComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly commonApiService = inject(CommonApiService);
  private readonly exportService = inject(ReportExportService);

  readonly selectedRecord = signal<HotworkRecord | null>(null);

  onRowClicked(row: unknown): void {
    if (row && typeof row === "object") {
      this.selectedRecord.set(row as HotworkRecord);
    }
  }

  closeDrawer(): void {
    this.selectedRecord.set(null);
  }

  // Active sub-view from URL
  readonly activeSubView = computed<"manage-hotwork" | "dashboard" | "history">(
    () => {
      const url = this.router.url;
      if (url.includes("dashboard")) return "dashboard";
      if (url.includes("history")) return "history";
      return "manage-hotwork";
    },
  );

  // Master Hotwork Records (Populated dynamically from API)
  readonly hotworkRecords = signal<HotworkRecord[]>([]);

  ngOnInit(): void {
    this.commonApiService.getHotworkTrackingList().subscribe({
      next: (res) => {
        if (res && Array.isArray(res)) {
          const mapped: HotworkRecord[] = res.map(
            (item: HotworkTrackingItem, index: number) => {
              let locAdj = item.location_of_hotwork || "-";
              if (item.all_adjacent_compartments) {
                locAdj += ` (${item.all_adjacent_compartments})`;
              }

              return {
                sNo: index + 1,
                hotworkCode:
                  item.previous_hotwork_code ||
                  item.dl_number ||
                  `HW-2026-00${item.id}`,
                parentCode: item.dl_number || item.previous_hotwork_code || "-",
                dateOfHotwork: item.date_of_hotwork || "-",
                departmentSection: item.departmental_officer || "ENGINEERING",
                descriptionOfHotwork:
                  item.remarks || item.type_of_hotwork || "-",
                locationAdjacent: locAdj,
                hotworkType: item.type_of_hotwork || "Welding",
                currentStatus: item.night_work ? "Active" : "Completed",
                safeToWeldCert: item.sentries_required ? "Issued" : "Pending",
              };
            },
          );
          this.hotworkRecords.set(mapped);
        } else {
          this.hotworkRecords.set([]);
        }
      },
      error: (err) => {
        console.warn("API GET /api/v1/hotwork/tracking/ error:", err);
        this.hotworkRecords.set([]);
      },
    });

    this.commonApiService.getHotworkDashboardData().subscribe({
      next: (res: HotworkDashboardData) => {
        if (res?.summary) {
          this.scheduledToday.set(res.summary.scheduled_today || 0);
          this.inProgress.set(res.summary.in_progress || 0);
          this.awaitingApproval.set(res.summary.awaiting_approval || 0);
          this.completed.set(res.summary.completed || 0);
          this.readyToStart.set(res.summary.ready_to_start || 0);
        }

        if (
          res?.weekly_summary &&
          Array.isArray(res.weekly_summary) &&
          res.weekly_summary.length > 0
        ) {
          const labels = res.weekly_summary.map((item) => {
            if (!item.date || item.date === "-") return "";
            const d = new Date(item.date);
            if (isNaN(d.getTime())) return item.date;
            return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
          });
          const initiatedVals = res.weekly_summary.map(
            (item) => item.initiated || 0,
          );
          const readyVals = res.weekly_summary.map((item) => item.ready || 0);
          const completedVals = res.weekly_summary.map(
            (item) => item.completed || 0,
          );

          this.weeklyLabels.set(labels);
          this.weeklySeries.set([
            { label: "Initiated", color: "#f59e0b", values: initiatedVals },
            { label: "Ready", color: "#ef4444", values: readyVals },
            { label: "Completed", color: "#3b82f6", values: completedVals },
          ]);
        }

        if (res?.present_progress) {
          const p = res.present_progress;
          this.progressSegments.set([
            { label: "Initiated", value: p.initiated || 0, color: "#f59e0b" },
            { label: "Ready", value: p.ready || 0, color: "#f97316" },
            { label: "Paused", value: p.paused || 0, color: "#ef4444" },
            { label: "Completed", value: p.completed || 0, color: "#3b82f6" },
          ]);

          this.historyBarData.set([
            {
              label: "Ready",
              value: p.ready || 0,
              color: "#38bdf8",
              primary: true,
            },
            {
              label: "In progress",
              value: res.summary?.in_progress || 0,
              color: "#3b82f6",
              primary: true,
            },
            {
              label: "Completed",
              value: p.completed || 0,
              color: "#a855f7",
              primary: true,
            },
          ]);
        }
      },
      error: (err) => {
        console.warn("API GET /api/v1/hotwork/dashboard-data/ error:", err);
      },
    });
  }

  // KPI Counter Signals
  readonly scheduledToday = signal<number>(0);
  readonly inProgress = signal<number>(0);
  readonly awaitingApproval = signal<number>(0);
  readonly completed = signal<number>(0);
  readonly readyToStart = signal<number>(0);

  // Weekly Summary Chart Configuration
  readonly weeklyLabels = signal<string[]>([
    "29 Jul 26",
    "30 Jul 26",
    "31 Jul 26",
    "01 Aug 26",
    "02 Aug 26",
    "03 Aug 26",
    "04 Aug 26",
    "05 Aug 26",
    "06 Aug 26",
    "07 Aug 26",
  ]);

  readonly weeklySeries = signal<LineSeries[]>([
    {
      label: "Initiated",
      color: "#f59e0b",
      values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      label: "Ready",
      color: "#ef4444",
      values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      label: "Completed",
      color: "#3b82f6",
      values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  ]);

  // Present Hotwork Progress Segments
  readonly progressSegments = signal<DonutSegment[]>([
    { label: "Initiated", value: 0, color: "#f59e0b" },
    { label: "Ready", value: 0, color: "#f97316" },
    { label: "Paused", value: 0, color: "#ef4444" },
    { label: "Completed", value: 0, color: "#3b82f6" },
  ]);

  // History Bar Chart Data
  readonly historyDateRange = signal<string | null>("");
  readonly historyBarData = signal<BarDatum[]>([
    { label: "Ready", value: 0, color: "#38bdf8", primary: true },
    { label: "In progress", value: 0, color: "#3b82f6", primary: true },
    { label: "Completed", value: 0, color: "#a855f7", primary: true },
  ]);

  // DataGrid Column Definitions for Manage Hotwork Table
  readonly manageColumnDefs: ColDef[] = [
    { headerName: "Sr No", field: "sNo", width: 90, minWidth: 80 },
    {
      headerName: "Hotwork Code",
      field: "hotworkCode",
      flex: 1.2,
      minWidth: 130,
    },
    { headerName: "Parent Code", field: "parentCode", flex: 1, minWidth: 110 },
    {
      headerName: "Date of Hotwork",
      field: "dateOfHotwork",
      flex: 1.2,
      minWidth: 130,
    },
    {
      headerName: "Department/Section",
      field: "departmentSection",
      flex: 1.3,
      minWidth: 140,
    },
    {
      headerName: "Description of Hotwork",
      field: "descriptionOfHotwork",
      flex: 2,
      minWidth: 180,
    },
    {
      headerName: "Location/Adjacent Compartments",
      field: "locationAdjacent",
      flex: 2,
      minWidth: 180,
    },
    {
      headerName: "Hotwork Type",
      field: "hotworkType",
      flex: 1.1,
      minWidth: 110,
    },
    {
      headerName: "Current Status",
      field: "currentStatus",
      flex: 1.1,
      minWidth: 110,
      cellRenderer: (params: ICellRendererParams) => {
        const status =
          typeof params.value === "string" ? params.value : "Pending";
        let statusStyle =
          "background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);";
        if (status === "Active") {
          statusStyle =
            "background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3);";
        } else if (status === "Completed") {
          statusStyle =
            "background: rgba(59,130,246,0.15); color: #3b82f6; border: 1px solid rgba(59,130,246,0.3);";
        }
        return `<span style="padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; ${statusStyle}">${status}</span>`;
      },
    },
    {
      headerName: "Safe To Weld Cert",
      field: "safeToWeldCert",
      flex: 1.2,
      minWidth: 130,
      cellRenderer: (params: ICellRendererParams) => {
        const cert = typeof params.value === "string" ? params.value : "N/A";
        return `<span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: rgba(6,78,59,0.6); color: #34d399; border: 1px solid rgba(6,95,70,0.6);">${cert}</span>`;
      },
    },
  ];

  // AG-Grid DataGrid Column Definitions for History Table
  readonly historyColumnDefs: ColDef[] = [
    { headerName: "Sr No", field: "sNo", width: 90, minWidth: 80 },
    {
      headerName: "Hotwork Code",
      field: "hotworkCode",
      flex: 1.2,
      minWidth: 130,
    },
    { headerName: "Parent Code", field: "parentCode", flex: 1, minWidth: 110 },
    {
      headerName: "Date of Hotwork",
      field: "dateOfHotwork",
      flex: 1.2,
      minWidth: 130,
    },
    {
      headerName: "Department/Section",
      field: "departmentSection",
      flex: 1.3,
      minWidth: 140,
    },
    {
      headerName: "Description of Hotwork",
      field: "descriptionOfHotwork",
      flex: 2,
      minWidth: 180,
    },
    {
      headerName: "Location/Adjacent Compartments",
      field: "locationAdjacent",
      flex: 2,
      minWidth: 180,
    },
    {
      headerName: "Hotwork Type",
      field: "hotworkType",
      flex: 1.1,
      minWidth: 110,
    },
    {
      headerName: "Current Status",
      field: "currentStatus",
      flex: 1.1,
      minWidth: 110,
      cellRenderer: (params: ICellRendererParams) => {
        const status =
          typeof params.value === "string" ? params.value : "Pending";
        let statusStyle =
          "background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);";
        if (status === "Active") {
          statusStyle =
            "background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3);";
        } else if (status === "Completed") {
          statusStyle =
            "background: rgba(59,130,246,0.15); color: #3b82f6; border: 1px solid rgba(59,130,246,0.3);";
        }
        return `<span style="padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; ${statusStyle}">${status}</span>`;
      },
    },
    {
      headerName: "Safe To Weld Cert",
      field: "safeToWeldCert",
      flex: 1.2,
      minWidth: 130,
      cellRenderer: (params: ICellRendererParams) => {
        const cert = typeof params.value === "string" ? params.value : "N/A";
        return `<span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: rgba(6,78,59,0.6); color: #34d399; border: 1px solid rgba(6,95,70,0.6);">${cert}</span>`;
      },
    },
  ];

  // Filters
  readonly globalSearch = signal<string>("");
  readonly pageSize = signal<number>(10);

  readonly historyHotworkCode = signal<string>("ALL");
  readonly historyGlobalSearch = signal<string>("");
  readonly historyPageSize = signal<number>(10);

  readonly formattedHotworkCodeOptions = computed<DropdownOption[]>(() => {
    const records = this.hotworkRecords();
    const options: DropdownOption[] = [{ label: "ALL", value: "ALL" }];
    const seen = new Set<string>();
    records.forEach((rec) => {
      if (rec.hotworkCode && !seen.has(rec.hotworkCode)) {
        seen.add(rec.hotworkCode);
        options.push({ label: rec.hotworkCode, value: rec.hotworkCode });
      }
    });
    return options;
  });

  readonly filteredRecords = computed(() => {
    const list = this.hotworkRecords();
    const search = this.globalSearch().toLowerCase().trim();
    if (!search) return list;

    return list.filter((r) => {
      return (
        r.sNo.toString().includes(search) ||
        r.hotworkCode.toLowerCase().includes(search) ||
        r.parentCode.toLowerCase().includes(search) ||
        r.dateOfHotwork.toLowerCase().includes(search) ||
        r.departmentSection.toLowerCase().includes(search) ||
        r.descriptionOfHotwork.toLowerCase().includes(search) ||
        r.locationAdjacent.toLowerCase().includes(search) ||
        r.hotworkType.toLowerCase().includes(search) ||
        r.currentStatus.toLowerCase().includes(search)
      );
    });
  });

  readonly filteredHistoryRecords = computed(() => {
    const list = this.hotworkRecords();
    const selCode = this.historyHotworkCode();
    const search = this.historyGlobalSearch().toLowerCase().trim();

    return list.filter((r) => {
      if (selCode !== "ALL" && r.hotworkCode !== selCode) return false;

      if (search) {
        const match =
          r.sNo.toString().includes(search) ||
          r.hotworkCode.toLowerCase().includes(search) ||
          r.parentCode.toLowerCase().includes(search) ||
          r.dateOfHotwork.toLowerCase().includes(search) ||
          r.departmentSection.toLowerCase().includes(search) ||
          r.descriptionOfHotwork.toLowerCase().includes(search) ||
          r.locationAdjacent.toLowerCase().includes(search) ||
          r.hotworkType.toLowerCase().includes(search) ||
          r.currentStatus.toLowerCase().includes(search);
        if (!match) return false;
      }
      return true;
    });
  });

  navigateToManageHotwork(): void {
    this.router.navigate(["/afterAuth/other-utilities/hotwork/manage-hotwork"]);
  }

  onExport(kind: ExportKind): void {
    const title = "Hotwork Records";
    const columns: PrintColumn[] = [
      { header: "Sr No", field: "sNo" },
      { header: "Hotwork Code", field: "hotworkCode" },
      { header: "Parent Code", field: "parentCode" },
      { header: "Date of Hotwork", field: "dateOfHotwork" },
      { header: "Department / Section", field: "departmentSection" },
      { header: "Description of Hotwork", field: "descriptionOfHotwork" },
      { header: "Location / Adjacent Compartments", field: "locationAdjacent" },
      { header: "Hotwork Type", field: "hotworkType" },
      { header: "Current Status", field: "currentStatus" },
    ];
    this.exportService.export(
      kind,
      title,
      columns,
      this.filteredRecords() as unknown as Record<string, unknown>[],
      `HotworkRecords_${new Date().toISOString().slice(0, 10)}`
    );
  }

  downloadCSV(): void {
    const headers = [
      "Sr No",
      "Hotwork Code",
      "Parent Code",
      "Date of Hotwork",
      "Department/Section",
      "Description of Hotwork",
      "Location/Adjacent Compartments",
      "Hotwork Type",
      "Current Status",
    ];
    const rows = this.filteredRecords().map((r) => [
      r.sNo,
      `"${r.hotworkCode}"`,
      `"${r.parentCode}"`,
      `"${r.dateOfHotwork}"`,
      `"${r.departmentSection}"`,
      `"${r.descriptionOfHotwork}"`,
      `"${r.locationAdjacent}"`,
      `"${r.hotworkType}"`,
      `"${r.currentStatus}"`,
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((e) => e.join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `ManageHotwork_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  copyData(): void {
    const headers = [
      "Sr No",
      "Hotwork Code",
      "Parent Code",
      "Date of Hotwork",
      "Department/Section",
      "Description of Hotwork",
      "Location/Adjacent Compartments",
      "Hotwork Type",
      "Current Status",
    ];
    const rows = this.filteredRecords().map((r) =>
      [
        r.sNo,
        r.hotworkCode,
        r.parentCode,
        r.dateOfHotwork,
        r.departmentSection,
        r.descriptionOfHotwork,
        r.locationAdjacent,
        r.hotworkType,
        r.currentStatus,
      ].join("\t"),
    );
    const text = [headers.join("\t"), ...rows].join("\n");
    navigator.clipboard.writeText(text);
  }
}
