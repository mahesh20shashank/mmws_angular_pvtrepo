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

// Shared components from src/app/shared/components
import { IconComponent } from "../../../shared/components/icon/icon.component";
import {
  LineChart,
  LineSeries,
} from "../../../shared/components/line-chart/line-chart";
import {
  DonutChart,
  DonutSegment,
} from "../../../shared/components/donut-chart/donut-chart";
import { ExportKind } from "../../../shared/components/export-toolbar/export-toolbar";
import { HelpGuidance } from "../../../shared/components/help-guidance/help-guidance";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import { CommonApiService } from "../../../Core/http/services/api.service";
import { PrintColumn, ReportExportService } from "../../../Core/services/export/generic-export.service";
import { DataGrid } from "../../../shared/components/data-grid/data-grid";
import { DashboardHistoryItem, TagoutDashboardResponse } from "./tag-in-tag-out.model";

const HELP_HTML = `<p class="mb-0">Overview of tag in/out activity - a history chart, today's split between tag in and tag out, weekly and daily summary counts, and how many tag outs and tag ins are still waiting for approval.</p>`;

export interface TagoutRecordItem {
  id?: number;
  approval_status?: string;
  status?: string;
  name_of_component?: string;
  name_of_subsystem?: string;
  tagout_equipment_name?: string | number;
  special_instructions?: string;
  tagout_description?: string;
  tagout_maintainer_name_rank?: string;
  date?: string;
  tagout_number?: string;
}

export interface TagRecord {
  id?: number;
  sNo: number;
  tagNo: string;
  equipmentName: string;
  isolationBoundary: string;
  taggedBy: string;
  dateTagged: string;
  status: "Tagged Out" | "Tagged In" | "Pending Approval";
  hodApprovalStatus?: string;
  remark?: string;
  rawItem?: Record<string, unknown>;
}

@Component({
  selector: "app-tag-in-tag-out",
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, LineChart, DonutChart, HelpGuidance, DataGrid],
  templateUrl: "./tag-in-tag-out.component.html",
  styleUrl: "./tag-in-tag-out.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagInTagOutComponent implements OnInit {
  readonly helpHtml = HELP_HTML;
  protected readonly Math = Math;
  private readonly router = inject(Router);
  private readonly commonApiService = inject(CommonApiService);
  private readonly exportService = inject(ReportExportService);

  readonly currentDateString = computed<string>(() => {
    const d = new Date();
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  });

  // Counter Signals
  readonly tagOutCount = signal<number>(0);
  readonly tagInCount = signal<number>(0);
  readonly weeklyTagOutCount = signal<number>(0);
  readonly weeklyTagInCount = signal<number>(0);
  readonly todayTagOutCount = signal<number>(0);
  readonly todayTagInCount = signal<number>(0);
  readonly waitingForApprovalCount = signal<number>(0);
  readonly yetToTagInCount = signal<number>(0);

  // Active view determined by current URL path
  readonly activeSubView = computed<
    "dashboard" | "tag-out" | "tag-in" | "approval" | "history"
  >(() => {
    const path = this.router.url.split("?")[0].split("#")[0];
    const lastSegment = path.split("/").filter(Boolean).reverse().pop();
    if (
      lastSegment === "tag-out" ||
      lastSegment === "tag-out-approval" ||
      lastSegment === "create-tagout" ||
      lastSegment === "addtagout"
    )
      return "tag-out";
    if (
      lastSegment === "tag-in" ||
      lastSegment === "tag-in-approval" ||
      lastSegment === "create-tagin" ||
      lastSegment === "addtagin"
    )
      return "tag-in";
    if (lastSegment === "approval") return "approval";
    if (lastSegment === "history") return "history";
    return "dashboard";
  });

  // Dates for Tag In-Out History chart
  readonly historyDates = signal<string[]>([
    "2026-08-01",
    "2026-08-02",
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
  ]);

  // Dual series for Tag Out and Tag In matching screenshot (values = 0)
  readonly historySeries = signal<LineSeries[]>([
    {
      label: "Tag Out",
      color: "#f59e0b",
      values: [0, 0, 0, 0, 0, 0, 0],
    },
    {
      label: "Tag In",
      color: "#06b6d4",
      values: [0, 0, 0, 0, 0, 0, 0],
    },
  ]);

  // Daily Pie Chart segments matching screenshot
  readonly dailyPieSegments = signal<DonutSegment[]>([
    { label: "Tag Out", value: 0, color: "#f59e0b" },
    { label: "Tag In", value: 0, color: "#06b6d4" },
  ]);

  // Master Tag Records
  readonly tagRecords = signal<TagRecord[]>([]);

  ngOnInit(): void {
    this.commonApiService.getTagoutDashboardList().subscribe({
      next: (res: TagoutDashboardResponse) => {
        if (res && typeof res === "object") {
          // Top-level counts from backend dashboard API response schema
          const weeklyTagOut =
            res.weekly_tagout_count ??
            res.weekly_tag_outs ??
            res.weekly_tag_out ??
            0;
          const weeklyTagIn =
            res.weekly_tagin_count ??
            res.weekly_tag_ins ??
            res.weekly_tag_in ??
            0;
          const todayTagOut =
            res.today_tagout_count ??
            res.today_tag_outs ??
            res.today_tag_out ??
            0;
          const todayTagIn =
            res.today_tagin_count ??
            res.today_tag_ins ??
            res.today_tag_in ??
            0;
          const pendingApproval =
            res.tagout_pending_approval_count ??
            res.pending_approval_count ??
            res.waiting_for_approval ??
            0;
          const yetToTagIn =
            res.tagout_yet_to_tagin_count ??
            res.yet_to_tag_in_count ??
            weeklyTagOut;

          this.weeklyTagOutCount.set(weeklyTagOut);
          this.weeklyTagInCount.set(weeklyTagIn);
          this.tagOutCount.set(weeklyTagOut);
          this.tagInCount.set(weeklyTagIn);
          this.todayTagOutCount.set(todayTagOut);
          this.todayTagInCount.set(todayTagIn);
          this.waitingForApprovalCount.set(pendingApproval);
          this.yetToTagInCount.set(yetToTagIn);

          // Update Donut Chart graph data dynamically from API
          this.dailyPieSegments.set([
            { label: "Tag Out", value: weeklyTagOut, color: "#f59e0b" },
            { label: "Tag In", value: weeklyTagIn, color: "#06b6d4" },
          ]);

          // Process history_data array for Line Chart
          let historyArr: DashboardHistoryItem[] = [];
          if (Array.isArray(res.history_data)) {
            historyArr = res.history_data;
          } else if (Array.isArray(res.data)) {
            historyArr = res.data;
          } else if (Array.isArray(res)) {
            historyArr = res as DashboardHistoryItem[];
          }

          if (historyArr.length > 0) {
            const datesList: string[] = historyArr
              .map((h: DashboardHistoryItem) => String(h.date || "").slice(0, 10))
              .filter(Boolean);
            const tagOutValues: number[] = historyArr.map((h: DashboardHistoryItem) =>
              Number(h.tag_out ?? h.tag_outs ?? h.tagout ?? 0)
            );
            const tagInValues: number[] = historyArr.map((h: DashboardHistoryItem) =>
              Number(h.tag_in ?? h.tag_ins ?? h.tagin ?? 0)
            );

            this.historyDates.set(datesList);
            this.historySeries.set([
              { label: "Tag Out", color: "#f59e0b", values: tagOutValues },
              { label: "Tag In", color: "#06b6d4", values: tagInValues },
            ]);
          }

          // Fetch tagout list to populate the Master Tag Records grid table
          this.fetchTagRecordsTable();
        } else {
          this.fetchTagRecordsTable();
        }
      },
      error: (err) => {
        console.warn("API GET /api/v1/inout-tags/dashboard/ error", err);
        this.fetchTagRecordsTable();
      },
    });
  }

  private fetchTagRecordsTable(): void {
    this.commonApiService.getTagoutList().subscribe({
      next: (tagoutRes: unknown) => {
        let recs: TagoutRecordItem[] = [];
        if (Array.isArray(tagoutRes)) recs = tagoutRes as TagoutRecordItem[];
        else if (tagoutRes && typeof tagoutRes === "object") {
          const obj = tagoutRes as Record<string, unknown>;
          recs = (obj["data"] || obj["results"] || obj["tagouts"] || []) as TagoutRecordItem[];
        }
        if (recs.length > 0) {
          const mappedRecs: TagRecord[] = recs.map(
            (item: TagoutRecordItem, index: number) => {
              const statusStr = (
                item.approval_status ||
                item.status ||
                ""
              ).toLowerCase();
              let statusVal: "Tagged Out" | "Tagged In" | "Pending Approval" =
                "Tagged Out";
              if (statusStr === "in_progress" || statusStr === "pending")
                statusVal = "Pending Approval";
              else if (
                statusStr === "tagged_in" ||
                statusStr === "completed"
              )
                statusVal = "Tagged In";

              let equipName =
                item.name_of_component || item.name_of_subsystem;
              if (!equipName) {
                if (typeof item.tagout_equipment_name === "string")
                  equipName = item.tagout_equipment_name;
                else if (item.tagout_equipment_name)
                  equipName = `Equipment #${item.tagout_equipment_name}`;
                else equipName = "-";
              }

              return {
                id: item.id,
                sNo: index + 1,
                tagNo: item.tagout_number || `TAG-2026-00${item.id}`,
                equipmentName: equipName,
                isolationBoundary:
                  item.special_instructions || item.tagout_description || "-",
                taggedBy: item.tagout_maintainer_name_rank || "-",
                dateTagged: item.date || "-",
                status: statusVal,
                rawItem: item as Record<string, unknown>,
              };
            }
          );
          this.tagRecords.set(mappedRecs);
        } else {
          this.tagRecords.set([]);
        }
      },
      error: () => {
        this.tagRecords.set([]);
      },
    });
  }

  // DataGrid Column Definitions for Tag Records Table
  readonly tagColumnDefs: ColDef[] = [
    { headerName: "Sr No", field: "sNo", width: 90, minWidth: 80 },
    { headerName: "Tag No", field: "tagNo", flex: 1.2, minWidth: 120 },
    {
      headerName: "Equipment Name",
      field: "equipmentName",
      flex: 2,
      minWidth: 180,
    },
    {
      headerName: "Isolation Boundary",
      field: "isolationBoundary",
      flex: 2.2,
      minWidth: 200,
    },
    { headerName: "Tagged By", field: "taggedBy", flex: 1.3, minWidth: 140 },
    {
      headerName: "Date Tagged",
      field: "dateTagged",
      flex: 1.2,
      minWidth: 120,
    },
    {
      headerName: "Status",
      field: "status",
      flex: 1.2,
      minWidth: 130,
      cellRenderer: (params: ICellRendererParams) => {
        const status =
          typeof params.value === "string" ? params.value : "Tagged Out";
        let style =
          "background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);";
        if (status === "Tagged In") {
          style =
            "background: rgba(6,182,212,0.15); color: #06b6d4; border: 1px solid rgba(6,182,212,0.3);";
        } else if (status === "Pending Approval") {
          style =
            "background: rgba(168,85,247,0.15); color: #a855f7; border: 1px solid rgba(168,85,247,0.3);";
        }
        return `<span style="padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; ${style}">${status}</span>`;
      },
    },
  ];

  // Column defs + row data for the small summary tables
  readonly typeCountColumnDefs: ColDef[] = [
    { headerName: "Type", field: "type", flex: 1, minWidth: 80 },
    { headerName: "Count", field: "count", flex: 1, minWidth: 50, cellStyle: { justifyContent: "flex-end" } },
  ];

  readonly descriptionCountColumnDefs: ColDef[] = [
    { headerName: "Description", field: "description", flex: 2, minWidth: 100 },
    { headerName: "Count", field: "count", flex: 1, minWidth: 50, cellStyle: { justifyContent: "flex-end" } },
  ];

  readonly weeklySummaryRows = computed(() => [
    { type: "Tag Out", count: this.weeklyTagOutCount() },
    { type: "Tag In", count: this.weeklyTagInCount() },
  ]);

  readonly todaySummaryRows = computed(() => [
    { type: "Tag Out", count: this.todayTagOutCount() },
    { type: "Tag In", count: this.todayTagInCount() },
  ]);

  readonly tagOutApprovalRows = computed(() => [
    { description: "Waiting For Approval", count: this.waitingForApprovalCount() },
    { description: "Yet to Tag In", count: this.yetToTagInCount() },
  ]);

  readonly tagInApprovalRows: { description: string; count: number }[] = [];

  // Global search input
  readonly globalSearch = signal<string>("");

  readonly filteredRecords = computed(() => {
    const list = this.tagRecords();
    const search = this.globalSearch().toLowerCase().trim();
    if (!search) return list;

    return list.filter((r) => {
      return (
        r.sNo.toString().includes(search) ||
        r.tagNo.toLowerCase().includes(search) ||
        r.equipmentName.toLowerCase().includes(search) ||
        r.isolationBoundary.toLowerCase().includes(search) ||
        r.taggedBy.toLowerCase().includes(search) ||
        r.dateTagged.toLowerCase().includes(search) ||
        r.status.toLowerCase().includes(search)
      );
    });
  });

  onExport(kind: ExportKind): void {
    const title = "Tag In / Tag Out Records";
    const columns: PrintColumn[] = [
      { header: "Sr No", field: "sNo" },
      { header: "Tag No", field: "tagNo" },
      { header: "Equipment Name", field: "equipmentName" },
      { header: "Isolation Boundary", field: "isolationBoundary" },
      { header: "Department", field: "department" },
      { header: "Maintainer Name", field: "maintainerName" },
      { header: "Date", field: "date" },
      { header: "Status", field: "status" },
    ];
    this.exportService.export(
      kind,
      title,
      columns,
      this.filteredRecords() as unknown as Record<string, unknown>[],
      `TagInTagOut_${new Date().toISOString().slice(0, 10)}`
    );
  }

  downloadCSV(): void {
    const headers = [
      "Sr No",
      "Tag No",
      "Equipment Name",
      "Isolation Boundary",
      "Tagged By",
      "Date Tagged",
      "Status",
    ];
    const rows = this.filteredRecords().map((r) => [
      r.sNo,
      `"${r.tagNo}"`,
      `"${r.equipmentName}"`,
      `"${r.isolationBoundary}"`,
      `"${r.taggedBy}"`,
      `"${r.dateTagged}"`,
      `"${r.status}"`,
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
      `TagInOut_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  copyData(): void {
    const headers = [
      "Sr No",
      "Tag No",
      "Equipment Name",
      "Isolation Boundary",
      "Tagged By",
      "Date Tagged",
      "Status",
    ];
    const rows = this.filteredRecords().map((r) =>
      [
        r.sNo,
        r.tagNo,
        r.equipmentName,
        r.isolationBoundary,
        r.taggedBy,
        r.dateTagged,
        r.status,
      ].join("\t"),
    );
    const text = [headers.join("\t"), ...rows].join("\n");
    navigator.clipboard.writeText(text);
  }
}
