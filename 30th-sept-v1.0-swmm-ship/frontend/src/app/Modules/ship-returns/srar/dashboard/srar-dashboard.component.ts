import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { ColDef, CellCallbackParams } from "ag-grid-community";
import { PanelCard } from "../../../../shared/components/panel-card/panel-card";
import { KpiCard } from "../../../../shared/components/kpi-card/kpi-card";
import { BarChart, StackedBarSeries } from "../../../../shared/components/bar-chart/bar-chart";
import { DonutChart, DonutSegment } from "../../../../shared/components/donut-chart/donut-chart";
import { LineChart, LineSeries } from "../../../../shared/components/line-chart/line-chart";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { DetailDrawer } from "../../../../shared/components/detail-drawer/detail-drawer";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { GridStatusChipRenderer } from "../../../../shared/components/data-grid/grid-status-chip-renderer";
import { SrarService, SrarRecord, SrarReportDetail, SrarAnalyticsMonthlyTrendItem, SrarAnalyticsMonthlyTrendResponse, SrarAnalyticsYearlyStatusItem, SrarAnalyticsYearlyStatusResponse, SrarLifecycleDistributionItem } from "../services/srar.service";
import { SrarExploitationKpis, SrarDgufBreakdownRow } from "../models/srar.model";

@Component({
  selector: "app-srar-dashboard",
  standalone: true,
  imports: [CommonModule, RouterModule, PanelCard, KpiCard, BarChart, DonutChart, LineChart, IconComponent, DetailDrawer, HelpGuidance, DataGrid],
  templateUrl: "./srar-dashboard.component.html",
  styleUrls: ["./srar-dashboard.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SrarDashboardComponent implements OnInit {
  private readonly srarService = inject(SrarService);

  readonly helpHtml = `<p class="fw-bold mb-3">An overview of Ship Running & Activity Report (SRAR) activity - recent SRAR entries, application status, edits, and history, with monthly and yearly SRAR charts below.</p>`;


  monthlyCategories = signal<string[]>(["Mar 2026", "Apr 2026", "May 2026", "Jun 2026", "Jul 2026", "Aug 2026"]);
  monthlyStackedSeries = signal<StackedBarSeries[]>([
    { name: "Draft", color: "#F59E0B", data: [0, 0, 0, 0, 0, 1] },
    { name: "Submitted", color: "#38BDF8", data: [0, 0, 0, 0, 0, 0] }
  ]);

  yearlyStatusSegments = signal<DonutSegment[]>([
    { label: "Draft", value: 1, color: "#3B82F6" },
    { label: "Pending CO Review", value: 0, color: "#F59E0B" },
    { label: "CO Approved", value: 0, color: "#10B981" },
    { label: "CMMS Synced", value: 0, color: "#38BDF8" },
  ]);
  yearlyTotalRecords = signal<number>(1);
  yearlyApprovedPercentage = signal<string>("0%");

  // --- Exploitation KPIs (hours underway / distance / days at sea & harbour) ---
  exploitationCards = signal<{ title: string; value: string; subtext: string; icon: string; color: string; bg: string }[]>([]);

  // --- Fuel consumption line chart ---
  fuelLabels = signal<string[]>([]);
  fuelSeries = signal<LineSeries[]>([]);
  fuelHasData = signal<boolean>(false);
  // Parallel to fuelLabels — the SrarMonthlyHeader id behind each point, for drill-down.
  private fuelHeaderIds: number[] = [];

  // --- DGUF stacked bar ---
  dgufCategories = signal<string[]>([]);
  dgufSeries = signal<StackedBarSeries[]>([]);
  dgufHasData = signal<boolean>(false);
  // Parallel to dgufCategories — each DA's contributing returns, for drill-down.
  private dgufBreakdowns: SrarDgufBreakdownRow[][] = [];
  dgufBreakdownRows = signal<SrarDgufBreakdownRow[]>([]);

  // --- Shared year filter for the Fuel Consumption Trend & DGUF charts ---
  availableYears = signal<number[]>([]);
  selectedYear = signal<number | null>(null);

  recentReports = signal<SrarRecord[]>([]);

  // Modal State Management
  isModalOpen = signal<boolean>(false);
  modalTitle = signal<string>("");
  modalType = signal<"reportDetail" | "kpiList" | "dgufBreakdown">("reportDetail");
  selectedReport = signal<SrarReportDetail | null>(null);
  filteredReports = signal<SrarRecord[]>([]);
  isLoadingDetail = signal<boolean>(false);

  ngOnInit(): void {
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.loadExploitationKpis();
    this.loadFuelTrend();
    this.loadDgufChart();

    // Fetch KPI analytics from SrarService
    this.srarService.getAnalyticsKpis().subscribe({
      next: (kpis) => {
        if (kpis) {
          // The KPI tiles this used to feed were removed; the call stays because the same
          // payload drives the yearly-status donut below.
          if (kpis.application_status) {
            const appStatus = kpis.application_status;
            const draft = Number(appStatus.draft ?? 0);
            const pendingCo = Number(appStatus.pending_co_review ?? 0);
            const coApproved = Number(appStatus.co_approved ?? 0);
            const synced = Number(appStatus.synced ?? 0);
            const total = Number(appStatus.total ?? (draft + pendingCo + coApproved + synced));

            this.yearlyStatusSegments.set([
              { label: "Draft", value: draft, color: "#3B82F6" },
              { label: "Pending CO Review", value: pendingCo, color: "#F59E0B" },
              { label: "CO Approved", value: coApproved, color: "#10B981" },
              { label: "CMMS Synced", value: synced, color: "#38BDF8" },
            ]);

            this.yearlyTotalRecords.set(total);
            const approved = coApproved + synced;
            const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
            this.yearlyApprovedPercentage.set(`${pct}%`);
          }
        }
      }
    });

    // Fetch Monthly Trend analytics
    this.srarService.getAnalyticsMonthlyTrend().subscribe({
      next: (res) => {
        let trendList: SrarAnalyticsMonthlyTrendItem[] = [];
        if (res && typeof res === "object" && "trend" in res && Array.isArray((res as SrarAnalyticsMonthlyTrendResponse).trend)) {
          trendList = (res as SrarAnalyticsMonthlyTrendResponse).trend;
        } else if (Array.isArray(res)) {
          trendList = res as SrarAnalyticsMonthlyTrendItem[];
        }

        if (trendList && trendList.length > 0) {
          const categories = trendList.map((item) => item.month || item.label || "");
          const draftData = trendList.map((item) => Number(item.draft ?? (item.value || 0)));
          const submittedData = trendList.map((item) => Number(item.submitted || 0));

          this.monthlyCategories.set(categories);
          this.monthlyStackedSeries.set([
            { name: "Draft", color: "#F59E0B", data: draftData },
            { name: "Submitted", color: "#38BDF8", data: submittedData }
          ]);
        }
      }
    });

    // Fetch Yearly Status distribution analytics
    this.srarService.getAnalyticsYearlyStatus().subscribe({
      next: (res) => {
        let distribution: SrarLifecycleDistributionItem[] = [];
        let totalRecords = 0;

        if (res && typeof res === "object" && "lifecycle_distribution" in res && Array.isArray((res as SrarAnalyticsYearlyStatusResponse).lifecycle_distribution)) {
          const resp = res as SrarAnalyticsYearlyStatusResponse;
          distribution = resp.lifecycle_distribution;
          totalRecords = resp.total_year_records ?? 0;
        } else if (Array.isArray(res)) {
          distribution = (res as SrarAnalyticsYearlyStatusItem[]).map((item) => ({
            status: item.status || item.label || "",
            count: Number(item.count ?? item.value ?? 0),
            percentage: Number(item.percentage ?? 0)
          }));
          totalRecords = distribution.reduce((sum, item) => sum + item.count, 0);
        }

        if (distribution && distribution.length > 0) {
          const statusColors: Record<string, string> = {
            "Draft": "#3B82F6",
            "Pending CO Review": "#F59E0B",
            "CO Approved": "#10B981",
            "CMMS Synced": "#38BDF8"
          };

          const segments: DonutSegment[] = distribution.map((item) => ({
            label: item.status,
            value: Number(item.count || 0),
            color: statusColors[item.status] || "#38BDF8"
          }));

          const approvedCount = distribution
            .filter((item) => item.status === "CO Approved" || item.status === "CMMS Synced")
            .reduce((sum, item) => sum + Number(item.count || 0), 0);

          const calcTotal = totalRecords || distribution.reduce((sum, item) => sum + Number(item.count || 0), 0);
          const pct = calcTotal > 0 ? Math.round((approvedCount / calcTotal) * 100) : 0;

          this.yearlyStatusSegments.set(segments);
          this.yearlyTotalRecords.set(calcTotal);
          this.yearlyApprovedPercentage.set(`${pct}%`);
        }
      }
    });

    // Fetch Recent SRAR Reports list
    this.srarService.getDashboard().subscribe({
      next: (data: SrarRecord[]) => {
        if (data && Array.isArray(data)) {
          this.recentReports.set(data);
        }
      }
    });
  }

  /**
   * Ship-life exploitation KPIs.
   *
   * Values can legitimately be null — the since-commissioning columns are only filled on
   * some returns, and days at sea/harbour need SRAR form 8 to have been completed — so each
   * card falls back to an em dash rather than a misleading zero.
   */
  private loadExploitationKpis(): void {
    this.srarService.getExploitationKpis().subscribe((kpis: SrarExploitationKpis | null) => {
      if (!kpis) {
        this.exploitationCards.set([]);
        return;
      }

      const num = (value: number | null, unit: string): string =>
        value === null ? "—" : `${value.toLocaleString("en-IN")}${unit}`;

      const asOf = (label: string | null): string =>
        label ? `As at ${label}` : "Not yet reported";

      const fromForm8 = (days: number | null, hours: number | null, returns: number): string => {
        if (days === null) return "Awaiting SRAR form 8 entry";
        return `${hours?.toLocaleString("en-IN") ?? 0} hrs across ${returns} return${returns === 1 ? "" : "s"}`;
      };

      this.exploitationCards.set([
        {
          title: "TOTAL HOURS UNDERWAY SINCE COMMISSION",
          value: kpis.hours_underway_since_commissioning_hhmm
            ?? (kpis.hours_underway_since_commissioning !== null
              ? `${kpis.hours_underway_since_commissioning.toLocaleString("en-IN")} hrs`
              : "—"),
          subtext: asOf(kpis.hours_underway_as_of),
          icon: "clock", color: "#38BDF8", bg: "rgba(56, 189, 248, 0.15)",
        },
        {
          title: "TOTAL DISTANCE RUN SINCE COMMISSION",
          value: num(kpis.distance_run_since_commissioning, " nm"),
          subtext: asOf(kpis.distance_run_as_of),
          icon: "route", color: "#C084FC", bg: "rgba(192, 132, 252, 0.15)",
        },
        {
          title: "TOTAL DAYS AT SEA",
          value: num(kpis.days_at_sea, " days"),
          subtext: fromForm8(kpis.days_at_sea, kpis.days_at_sea_hours, kpis.days_at_sea_returns),
          icon: "waves", color: "#34D399", bg: "rgba(52, 211, 153, 0.15)",
        },
        {
          title: "TOTAL DAYS AT HARBOUR",
          value: num(kpis.days_at_harbour, " days"),
          subtext: fromForm8(kpis.days_at_harbour, kpis.days_at_harbour_hours, kpis.days_at_harbour_returns),
          icon: "anchor", color: "#FBBF24", bg: "rgba(251, 191, 36, 0.15)",
        },
      ]);
    });
  }

  /** Fuel Oil Consumption & Balance (Tons) vs AVCAT Status (Litres), per return.
   *  Scoped to `selectedYear()` when set, via the shared year filter. */
  private loadFuelTrend(): void {
    this.srarService.getFuelTrend(this.selectedYear()).subscribe((res) => {
      if (res?.available_years?.length) {
        this.availableYears.set(res.available_years);
      }

      if (!res?.series?.length) {
        this.fuelHasData.set(false);
        this.fuelLabels.set([]);
        this.fuelSeries.set([]);
        this.fuelHeaderIds = [];
        return;
      }

      this.fuelHeaderIds = res.series.map((row) => row.header_id);
      this.fuelLabels.set(res.series.map((row) => row.month));
      this.fuelSeries.set([
        {
          label: `Fuel Oil Consumption & Balance (${res.fuel_oil_units})`,
          color: "#38BDF8",
          values: res.series.map((r) => r.fuel_oil_consumed),
          area: true,
        },
        {
          label: `AVCAT Status (${res.avcat_units})`,
          color: "#C084FC",
          values: res.series.map((r) => r.avcat_consumed),
        },
      ]);
      this.fuelHasData.set(true);
    });
  }

  /** Running hours per diesel alternator, stacked sea/anchorage vs port.
   *  Scoped to `selectedYear()` when set, via the shared year filter. */
  private loadDgufChart(): void {
    this.srarService.getDgufChart(this.selectedYear()).subscribe((res) => {
      if (res?.available_years?.length) {
        this.availableYears.set(res.available_years);
      }

      if (!res?.series?.length) {
        this.dgufHasData.set(false);
        this.dgufCategories.set([]);
        this.dgufSeries.set([]);
        this.dgufBreakdowns = [];
        return;
      }

      this.dgufBreakdowns = res.series.map((row) => row.breakdown ?? []);
      this.dgufCategories.set(res.series.map((row) => row.da));
      this.dgufSeries.set([
        { name: "R/H at Sea & Anchorage", color: "#38BDF8", data: res.series.map((r) => r.at_sea_anchorage) },
        { name: "R/H at Port", color: "#FBBF24", data: res.series.map((r) => r.at_port) },
      ]);
      this.dgufHasData.set(true);
    });
  }

  /** Shared year filter for the Fuel Consumption Trend & DGUF panels. */
  onYearFilterChange(value: string): void {
    this.selectedYear.set(value ? Number(value) : null);
    this.loadFuelTrend();
    this.loadDgufChart();
  }

  /** Drill down from a Fuel Consumption Trend point into that return's full report.
   *  Kept separate from the DGUF drill-down below: a fuel point is exactly one
   *  return, so it opens that return's full report. */
  onFuelPointClick(index: number): void {
    const headerId = this.fuelHeaderIds[index];
    if (headerId != null) {
      this.viewReportDetails(headerId);
    }
  }

  /** Drill down from a DGUF bar into the individual returns behind that
   *  alternator's total — a DGUF bar spans many returns (unlike a fuel point),
   *  so this opens a breakdown list rather than one report. */
  onDgufBarClick(index: number): void {
    const breakdown = this.dgufBreakdowns[index];
    if (!breakdown) return;
    this.modalTitle.set(`DGUF Breakdown — ${this.dgufCategories()[index]}`);
    this.modalType.set("dgufBreakdown");
    this.dgufBreakdownRows.set(breakdown);
    this.isModalOpen.set(true);
  }

  openKpiModal(cardTitle: string): void {
    this.modalTitle.set(cardTitle);
    this.modalType.set("kpiList");

    const all = this.recentReports();
    if (cardTitle.includes("EDIT")) {
      this.filteredReports.set(all.filter((r) => r.approvalStatus === "Draft" || r.approvalStatus === "In Review" || r.status === "Draft"));
    } else if (cardTitle.includes("STATUS")) {
      this.filteredReports.set(all.filter((r) => r.approvalStatus === "Approved" || r.approvalStatus === "In Review" || r.status === "Approved"));
    } else if (cardTitle.includes("SYNC") || cardTitle.includes("RECORDS")) {
      this.filteredReports.set(all.filter((r) => r.cmmsSyncStatus || r.cmms_sync_status || r.approvalStatus === "CMMS Synced" || r.status === "Synced"));
    } else {
      this.filteredReports.set(all);
    }

    this.isModalOpen.set(true);
  }

  viewReportDetails(headerId?: string | number): void {
    const numericId = Number(headerId) || 101;
    this.modalTitle.set(`SRAR Report Details - ID #${numericId}`);
    this.modalType.set("reportDetail");
    this.isModalOpen.set(true);
    this.isLoadingDetail.set(true);
    this.selectedReport.set(null);

    this.srarService.getReportDetails(numericId).subscribe({
      next: (details) => {
        if (details && (details.srarNo || details.shipName)) {
          this.selectedReport.set(details as SrarReportDetail);
        } else {
          this.selectedReport.set(this.getMockDetail(numericId));
        }
        this.isLoadingDetail.set(false);
      },
      error: () => {
        this.selectedReport.set(this.getMockDetail(numericId));
        this.isLoadingDetail.set(false);
      }
    });
  }

  private getMockDetail(id: number): SrarReportDetail {
    const matched = this.recentReports().find(r => Number(r.id) === id);
    return {
      id: id,
      srarNo: matched?.srarNo || `SRAR/2026/08/${String(id).padStart(3, "0")}`,
      shipName: matched?.shipName || "INS Vikramaditya",
      month: String(matched?.month) || "August",
      year: Number(matched?.year) || 2026,
      submissionDate: matched?.submissionDate || "2026-08-15",
      approvalStatus: matched?.approvalStatus || "Approved",
      engineerOfficer: matched?.engineerOfficer || "Cdr V. Sharma",
      runningParameters: {
        duringMonthHours: "120",
        duringMonthMinutes: "30",
        duringMonthDistance: "1450.5",
        maxSpeedDuringMonth: "28.5",
        maxShaftRpm: "245"
      },
      fuelConsumption: {
        bfLastMonth: "120.5",
        received: "500.0",
        consHarbor: "45.0",
        consSea: "350.0",
        totalCons: "410.0",
        balLeftOnboard: "210.5"
      }
    };
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.selectedReport.set(null);
    this.dgufBreakdownRows.set([]);
  }

  getSrarNumber(item: SrarRecord): string {
    if (!item) return '';
    if (item.srarNo) return item.srarNo;
    const year = item.year || item['year'] || 2026;
    const month = String(item.month || item['month'] || 8).padStart(2, '0');
    const idStr = String(item.id || item['id'] || '').padStart(3, '0');
    return `SRAR/${year}/${month}/${idStr}`;
  }

  getMonthNameString(m?: string | number): string {
    if (!m) return "August";
    if (typeof m === "string" && isNaN(Number(m))) return m;
    const num = Number(m);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return months[num - 1] || String(m);
  }

  readonly kpiListColumnDefs: ColDef[] = [
    {
      headerName: "Month/Year",
      flex: 1,
      minWidth: 140,
      valueGetter: (params) => {
        const item = params.data as SrarRecord | undefined;
        return `${this.getMonthNameString(item?.month || item?.month_name)} ${item?.year || 2026}`;
      },
    },
    {
      headerName: "Status",
      flex: 1,
      minWidth: 140,
      valueGetter: (params) => {
        const item = params.data as SrarRecord | undefined;
        return item?.status || item?.approvalStatus || "Draft";
      },
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: {
        toneMap: {
          Approved: "success",
          "CMMS Synced": "success",
          "In Review": "warning",
          Draft: "neutral",
        },
      },
    },
    {
      headerName: "Action",
      width: 140,
      sortable: false,
      cellRenderer: () => `<button type="button" class="manage-btn">View Details</button>`,
    },
  ];

  onKpiListCellClicked(event: CellCallbackParams): void {
    if (event.colDef?.headerName !== "Action") return;
    const item = event.data as SrarRecord | undefined;
    if (item) this.viewReportDetails(item.id);
  }

  readonly dgufBreakdownColumnDefs: ColDef[] = [
    { headerName: "Return", field: "month", flex: 1, minWidth: 140 },
    { headerName: "R/H at Sea & Anchorage", field: "at_sea_anchorage", flex: 1, minWidth: 160 },
    { headerName: "R/H at Port", field: "at_port", flex: 1, minWidth: 130 },
    { headerName: "Total", field: "total", flex: 1, minWidth: 110 },
    {
      headerName: "Action",
      width: 140,
      sortable: false,
      cellRenderer: () => `<button type="button" class="manage-btn">View Details</button>`,
    },
  ];

  onDgufBreakdownCellClicked(event: CellCallbackParams): void {
    if (event.colDef?.headerName !== "Action") return;
    const row = event.data as SrarDgufBreakdownRow | undefined;
    if (row) this.viewReportDetails(row.header_id);
  }

  getStatusClass(status?: string): string {
    const val = status || "Draft";
    if (val.includes("Approved") || val === "Approved" || val === "CMMS Synced") {
      return "badge-success";
    }
    if (val.includes("Review") || val === "In Review") {
      return "badge-warning";
    }
    if (val === "Draft") {
      return "badge-secondary";
    }
    return "badge-info";
  }
}
