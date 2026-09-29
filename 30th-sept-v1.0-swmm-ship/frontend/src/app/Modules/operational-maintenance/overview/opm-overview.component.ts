import { ButtonComponent } from '../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, computed, HostListener, inject, OnInit, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { ColDef } from "ag-grid-community";

import { OpmDartReason } from "../actions/opm-actions.models";

import {
  BarChart,
  BarDatum,
  ChartLegend,
  CustomizeKpi,
  DataGrid,
  DetailDrawer,
  GridStatusChipRenderer,
  KpiCard,
  LegendItem,
  LineChart,
  LineSeries,
  PanelCard,
  PillToggle,
} from "../../../shared/components";
import { IconComponent } from "../../../shared/components/icon/icon.component";
import { DonutChart, DonutSegment } from "../../../shared/components/donut-chart/donut-chart";
import { OperationalMaintenanceApi } from "../services/operational-maintenance-api";
import { KpiPanelService } from "../../../Core/services/kpi/kpi-panel.service";

import {
  OpmActivityRow,
  OpmAlert,
  OpmDashboardActivityPeriod,
  OpmDashboardData,
  OpmDeptDatum,
  OpmOverviewKpi,
  OpmQuickAction,
} from "./opm-overview.model";
import {
  alertColorForSeverity,
  OPM_KPI_PRESENTATION,
  OPM_OVERVIEW_PANEL_ICONS,
  OPM_QUICK_ACTION_ICONS,
  severityColor,
  toBarData,
} from "./opm-overview.data";

/** Maps the UI period-pill labels to the API's `activity_period` values. */
const ACTIVITY_PERIOD_MAP: Record<string, OpmDashboardActivityPeriod> = {
  Today: "today",
  Week: "week",
  Month: "month",
  Quarter: "quarter",
  Year: "year",
};

/**
 * Operational Maintenance — Overview tab. A dashboard composed entirely from
 * shared widgets (app-kpi-card, app-customize-kpi, app-panel-card,
 * app-bar-chart, app-line-chart, app-chart-legend, app-pill-toggle,
 * app-data-grid, app-detail-drawer), backed by `GET api/v1/dart/dashboard/`.
 */
@Component({
  selector: "app-opm-overview",
  standalone: true,
  imports: [KpiCard, CustomizeKpi, DetailDrawer, PanelCard, ChartLegend, PillToggle, BarChart, LineChart, DataGrid, IconComponent, DonutChart, FormsModule, ButtonComponent],
  templateUrl: "./opm-overview.component.html",
  styleUrls: ["./opm-overview.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpmOverviewComponent implements OnInit {
  readonly kpiPanel = inject(KpiPanelService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly opMaintenance = inject(OperationalMaintenanceApi);

  readonly icons = OPM_OVERVIEW_PANEL_ICONS;

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  ngOnInit(): void {
    this.loadDashboard();
  }

  private async loadDashboard(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const data = await this.opMaintenance.getOpmOverviewDashboard({
        activityPeriod: ACTIVITY_PERIOD_MAP[this.actPeriod()],
      });
      this.applyDashboard(data);
    } catch (error) {
      console.error("Error loading OPM overview dashboard", error);
      this.loadError.set("Unable to load dashboard data.");
    } finally {
      this.loading.set(false);
    }
  }

  private applyDashboard(data: OpmDashboardData): void {
    const kpis = Object.entries(data.cards).map(([key, card]) => {
      const presentation = OPM_KPI_PRESENTATION[key] ?? {
        title: key,
        iconName: "circle",
        iconColor: "#4AA8FF",
        iconBg: "rgba(0,136,255,0.16)",
      };
      const displayValue = card.available && card.value !== null ? String(card.value) : "—";
      const kpi: OpmOverviewKpi = {
        key,
        title: presentation.title,
        count: card.value ?? 0,
        displayValue,
        iconColor: presentation.iconColor,
        iconBg: presentation.iconBg,
        iconName: presentation.iconName,
        trendUp: false,
        baseUp: false,
        selectedPeriod: "all",
        trendData: {},
        valueData: { all: displayValue },
        drawerSubtitle: card.note ?? "current count",
        sectionTitle: presentation.title,
        sectionHint: "Value",
        stats: [{ value: displayValue, label: card.available ? "Current" : "Unavailable" }],
        mode: "list",
        listRows: card.available
          ? []
          : [
              {
                title: "Not yet available",
                sub: card.note ?? "This metric is not wired to a data source yet.",
                meta: "",
                tag: "Pending",
                tagColor: "#F59E0B",
                dotColor: "#F59E0B",
              },
            ],
      };
      return kpi;
    });
    this.allKpis.set(kpis);
    this.visibleKpis.set(kpis.slice(0, 4));

    this.alerts.set(
      data.alerts.map((a): OpmAlert => {
        const color = alertColorForSeverity(a.severity);
        return {
          text: a.title,
          color,
          tag: a.type,
          severity: a.severity ?? "Unknown",
          desc: a.title,
          details: [
            { label: "DART No.", value: a.dart_number ?? "—" },
            { label: "Equipment", value: a.equipment ?? "—" },
            { label: "Department", value: a.department ?? "—" },
            { label: "Status", value: a.status },
            { label: "Date", value: a.date ?? "—" },
          ],
          itemsLabel: "",
          items: [],
          nav: a.type === "Guarantee" ? "guarantee" : "actions",
          actionIcon: "arrow-up-right",
        };
      }),
    );

    this.quickActions = data.quick_actions
      .filter((a) => a.action !== "ADD_DEFECT")
      .map(
        (a): OpmQuickAction => ({
          label: a.label,
          icon: OPM_QUICK_ACTION_ICONS[a.action] ?? "zap",
          tab: "actions",
          queryParams: a.action === "VIEW_RA_STATUS" ? { view: "approval" } : a.action === "ADD_GUARANTEE" ? { view: "guarantee" } : undefined,
        }),
      );

    const deptData: OpmDeptDatum[] = data.open_darts_by_department.map((d) => ({
      label: d.department,
      short: d.department.length > 10 ? `${d.department.slice(0, 9)}…` : d.department,
      value: d.count,
    }));
    this.dept.set(deptData);

    this.trendLabels = data.dart_lifecycle_trend.map((t) => t.month);
    this.trendSeries = [
      { label: "Raised", color: "#F82C36", values: data.dart_lifecycle_trend.map((t) => t.raised), area: false },
      { label: "Closed", color: "#22C55E", values: data.dart_lifecycle_trend.map((t) => t.closed), area: false },
      { label: "Reopened", color: "#F59E0B", values: data.dart_lifecycle_trend.map((t) => t.reopened), area: false },
    ];

    this.severity = data.open_darts_by_severity.map((s) => ({
      label: s.severity,
      value: s.count,
      color: severityColor(s.severity),
    }));
    this.severityTotal = this.severity.reduce((sum, s) => sum + s.value, 0);

    const maxLoad = Math.max(1, ...data.dart_load_by_department.map((d) => d.count));
    this.deptLoad = data.dart_load_by_department.map((d) => ({
      label: d.department,
      value: d.count,
      pct: Math.round((d.count / maxLoad) * 100),
      top: d.count === maxLoad,
    }));
    this.deptLoadBars = this.deptLoad.map((d) => ({ label: d.label, value: d.value, primary: d.top }));

    this.activity.set(
      data.recent_activity.map(
        (r): OpmActivityRow => ({
          d: 0,
          date: r.date ?? "—",
          equip: r.equipment ?? "—",
          action: r.action,
          dept: r.department ?? "—",
          ship: r.reason ?? "—",
          status: r.status,
        }),
      ),
    );
    this.activityPage.set(1);
  }

  // --- KPIs -----------------------------------------------------------------
  readonly allKpis = signal<OpmOverviewKpi[]>([]);
  readonly visibleKpis = signal<OpmOverviewKpi[]>([]);

  updateSelectedKpis(selected: OpmOverviewKpi[]): void {
    this.visibleKpis.set(selected.length ? selected : this.allKpis().slice(0, 4));
  }

  onPeriodChange(_key: string, _period: string): void {
    // Backend cards are computed for the dashboard's own period filter; per-KPI
    // period pills aren't backed by a historical breakdown from the API yet.
  }

  // --- Alerts + quick actions ----------------------------------------------
  readonly alerts = signal<OpmAlert[]>([]);

  readonly alertIconName = OPM_OVERVIEW_PANEL_ICONS.alerts;
  readonly activeAlert = signal<OpmAlert | null>(null);
  readonly alertDrawerOpen = signal(false);

  openAlert(alert: OpmAlert): void {
    this.activeAlert.set(alert);
    this.alertDrawerOpen.set(true);
  }

  closeAlert(): void {
    this.alertDrawerOpen.set(false);
  }

  navFromAlert(alert: OpmAlert): void {
    this.closeAlert();
    const child = this.route.snapshot.paramMap.get("child") ?? "defect";
    const target: Record<OpmAlert["nav"], { tab: string; queryParams?: Record<string, string> }> = {
      actions: { tab: "actions" },
      approval: { tab: "actions", queryParams: { view: "approval" } },
      guarantee: { tab: "actions", queryParams: { view: "guarantee" } },
      reports: { tab: "reports" },
    };
    const { tab, queryParams } = target[alert.nav];
    this.router.navigate(["/afterAuth/op-maintenance", child, tab], { queryParams });
  }

  quickActions: OpmQuickAction[] = [];

  onQuickAction(action: OpmQuickAction): void {
    const child = this.route.snapshot.paramMap.get("child") ?? "defect";
    this.router.navigate(["/afterAuth/op-maintenance", child, action.tab], { queryParams: action.queryParams });
  }

  // --- "Add Defect / DART" dropdown (Reason → Add form) --------------------
  readonly qaReasons: OpmDartReason[] = [
    { value: "Guarantee Defect", desc: "Defect covered under equipment guarantee period", color: "#4AA8FF" },
    { value: "ABER", desc: "CAT I / II / III — with or without As&As", color: "#F59E0B" },
    { value: "Defect", desc: "Standard defect lifecycle — rectified onboard or raise DART", color: "#F82C36" },
  ];
  readonly qaOpen = signal(false);

  toggleQaMenu(): void {
    this.qaOpen.update((v) => !v);
  }

  closeQaMenu(): void {
    this.qaOpen.set(false);
  }

  selectReason(reason: string): void {
    this.closeQaMenu();
    const child = this.route.snapshot.paramMap.get("child") ?? "defect";
    this.router.navigate(["/afterAuth/op-maintenance", child, "defect"], {
      queryParams: { reason },
    });
  }

  @HostListener("document:click")
  onDocumentClick(): void {
    if (this.qaOpen()) this.closeQaMenu();
  }

  // --- Open DARTs by department (bar chart) ---------------------------------
  private readonly dept = signal<OpmDeptDatum[]>([]);

  readonly distData = computed<BarDatum[]>(() => toBarData(this.dept()));

  // --- DART lifecycle trend (line chart) -----------------------------------
  trendLabels: string[] = [];
  trendSeries: LineSeries[] = [];
  readonly trendLegend: LegendItem[] = [
    { label: "Raised", color: "#F82C36" },
    { label: "Closed", color: "#22C55E" },
    { label: "Reopened", color: "#F59E0B" },
  ];

  // --- Open DARTs by Operational Severity (donut) --------------------------
  severity: DonutSegment[] = [];
  severityTotal = 0;

  // --- DART Load by Department (horizontal bars) ---------------------------
  deptLoad: { label: string; value: number; pct: number; top: boolean }[] = [];
  deptLoadBars: BarDatum[] = [];

  // --- Recent activity (data grid + period pills) --------------------------
  readonly activityColDefs: ColDef[] = [
    { headerName: "Date", field: "date", flex: 0.8, minWidth: 100 },
    { headerName: "Equipment / Service", field: "equip", flex: 2, minWidth: 200 },
    {
      headerName: "Action",
      field: "action",
      flex: 0.9,
      minWidth: 120,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: { Raised: "info", Closed: "success" } },
    },
    { headerName: "Department", field: "dept", flex: 1.4, minWidth: 160 },
    { headerName: "Reason", field: "ship", flex: 1.4, minWidth: 150 },
    {
      headerName: "Status",
      field: "status",
      flex: 0.9,
      minWidth: 120,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: { Verified: "success", "In Progress": "warning" } },
    },
  ];

  readonly periodOpts = ["Today", "Week", "Month", "Quarter", "Year"];
  readonly actPeriod = signal("Month");

  private readonly activity = signal<OpmActivityRow[]>([]);

  readonly activityRows = computed<OpmActivityRow[]>(() => this.activity());

  readonly activityPage = signal(1);
  readonly activityPageSize = signal(10);

  readonly activityPageRows = computed<OpmActivityRow[]>(() => {
    const size = this.activityPageSize();
    const start = (this.activityPage() - 1) * size;
    return this.activityRows().slice(start, start + size);
  });

  setActPeriod(p: string): void {
    this.actPeriod.set(p);
    this.activityPage.set(1);
    void this.loadDashboard();
  }

  onActivityPageRequested(event: { page: number; pageSize: number }): void {
    this.activityPage.set(event.page);
    this.activityPageSize.set(event.pageSize);
  }

  // --- KPI detail drawer ----------------------------------------------------
  readonly drawerOpen = signal(false);
  readonly activeKpi = signal<OpmOverviewKpi | null>(null);

  openDetail(kpi: OpmOverviewKpi): void {
    this.activeKpi.set(kpi);
    this.drawerOpen.set(true);
  }

  closeDetail(): void {
    this.drawerOpen.set(false);
  }
}
