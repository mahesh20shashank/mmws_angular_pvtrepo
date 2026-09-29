import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { Component, inject, signal, computed, OnInit, HostListener, ChangeDetectionStrategy } from "@angular/core";
import { Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { ColDef } from "ag-grid-community";
import { firstValueFrom } from "rxjs";

import {
  KpiCard,
  DetailDrawer,
  DrawerStat,
  PanelCard,
  ChartLegend,
  LegendItem,
  PillToggle,
  BarChart,
  BarDatum,
  LineChart,
  LineSeries,
  DataGrid,
  GridStatusChipRenderer,
  DropdownOption,
} from "../../../../shared/components";

import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { SelectInput } from "../../../../shared/components/select-input/select-input";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { ThemeService } from "../../../../Core/services/theme/theme.service";
import { SfdOverviewApiService } from "../services/sfd-overview-api.service";
import { ActivityPeriod, ActivityRow, Alert, DeptDatum, OverviewKpi, SfdOverviewResponse } from "./sfd-overview.model";
import { CATEGORY_TO_SLUG, SFD_CATEGORIES } from "../management/sfd-actions-fields.config";

interface QuickAction {
  label: string;
  icon: string;
  route?: string;
  queryParams?: Record<string, string>;
}

/** Transaction type shown as the first flyout level of the "Add / Update SFD" quick action. */
interface SfdQaType {
  /** Matches the Add form's Transaction Type radios (see SfdManagementComponent). */
  title: "Equipment" | "System";
  icon: string;
}

/** SFD category shown as the second flyout level — `slug` matches CATEGORY_TO_SLUG so the
 *  Add form can resolve it back via categoryFromSlug(). */
interface SfdQaCategory {
  label: string;
  slug: string;
  color: string;
}

function trendDirection(trend: string, fallback: boolean): boolean {
  const t = trend.trim();
  if (t.startsWith("-")) return false;
  if (t.startsWith("+")) return true;
  return fallback;
}

/** Accent palette KPI icon colours are drawn from. The overview API only
 *  supplies KPI data, not presentation, so each card's icon colour/background
 *  is assigned client-side and kept stable for the life of the loaded data.
 *  Light variant is a darkened equivalent of each dark-theme colour (same
 *  approach as the --icon-accent/--icon-success/etc. tokens in styles.css)
 *  so icon glyphs keep readable contrast on a white card. */
const ICON_ACCENT_PALETTE_DARK = [
  "#4AA8FF",
  "#22C55E",
  "#F59E0B",
  "#A855F7",
  "#7FB3E0",
  "#F82C36",
  "#0088FF",
  "#14B8A6",
  "#EC4899",
];

const ICON_ACCENT_PALETTE_LIGHT = [
  "#1069AB",
  "#16A34A",
  "#D97706",
  "#7E22CE",
  "#2C5A85",
  "#DC2626",
  "#0B5C99",
  "#0F766E",
  "#BE185D",
];

function randomAccentColor(isLight: boolean): string {
  const palette = isLight ? ICON_ACCENT_PALETTE_LIGHT : ICON_ACCENT_PALETTE_DARK;
  const index = crypto.getRandomValues(new Uint32Array(1))[0] % palette.length;
  return palette[index];
}

const ALERT_TAG_COLORS_DARK: Record<string, string> = {
  Sync: "#F82C36",
  Master: "#F82C36",
  Update: "#4AA8FF",
  "Shelf Life": "#F59E0B",
  "In Progress": "#F59E0B",
};

const ALERT_TAG_COLORS_LIGHT: Record<string, string> = {
  Sync: "#DC2626",
  Master: "#DC2626",
  Update: "#1069AB",
  "Shelf Life": "#D97706",
  "In Progress": "#D97706",
};

function alertColorForTag(tag: string, isLight: boolean): string {
  const colors = isLight ? ALERT_TAG_COLORS_LIGHT : ALERT_TAG_COLORS_DARK;
  return colors[tag] ?? (isLight ? "#D97706" : "#F59E0B");
}

/** Matches the backend's IN_PROGRESS tag constant (sfd/utils.py) — the only
 *  alert tag with a real page to deep-link into today. */
const IN_PROGRESS_TAG = "In Progress";

const ALERT_TAG_ICONS: Record<string, string> = {
  Sync: "refresh-cw",
  Master: "triangle-alert",
  Update: "clock",
  "Shelf Life": "clock",
  "In Progress": "clock",
};

function alertIconForTag(tag: string): string {
  return ALERT_TAG_ICONS[tag] ?? "triangle-alert";
}

const ALERT_TAG_DESCRIPTIONS: Record<string, string> = {
  Sync: "This record is pending synchronization with the shore system. Resolve the sync queue to clear this alert.",
  Master: "Mandatory master data is missing for this equipment record. Update the record to clear this alert.",
  Update: "This equipment record requires an update before it can be considered current.",
  "Shelf Life": "One or more fitted items are approaching shelf-life expiry and should be scheduled for replacement.",
  "In Progress": "This item is still awaiting sign-off or verification.",
};

function alertDescriptionForTag(tag: string): string {
  return ALERT_TAG_DESCRIPTIONS[tag] ?? "Open this alert to review the affected record.";
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function withRandomIcon(kpi: OverviewKpi, isLight: boolean): OverviewKpi {
  const color = randomAccentColor(isLight);
  return { ...kpi, iconColor: color, iconBg: hexToRgba(color, 0.16) };
}

/** Colours for the drawer's stat tiles — the API only supplies value/label,
 *  so each tile is coloured client-side by position (1st/2nd/3rd/4th tile). */
const STAT_COLORS = ["#4AA8FF", "#22C55E", "#F59E0B", "#A855F7"];

function withStatColors(stats: DrawerStat[]): DrawerStat[] {
  return stats.map((s, i) => ({ ...s, color: s.color || STAT_COLORS[i % STAT_COLORS.length] }));
}

/**
 * SFD Overview screen. Composed from reusable shared widgets — app-kpi-card,
 * app-panel-card, app-bar-chart, app-line-chart, app-chart-legend,
 * app-pill-toggle, app-data-grid and app-detail-drawer.
 * This component only owns the page layout; data comes from
 * `GET api/v1/sfd/overview/` via `SfdOverviewApiService`. KPI icon colour is
 * assigned client-side (see `withRandomIcon`) since the API only owns the data.
 * The API always returns exactly 4 KPIs, so the Customize KPI panel isn't
 * functional here — the template still hosts a disabled <app-customize-kpi>
 * so the shared button stays visible (greyed out) instead of disappearing
 * (unlike pages that let the user pick 4 out of a larger set).
 */
@Component({
  selector: "app-sfd-overview",
  standalone: true,
  imports: [
    KpiCard,
    DetailDrawer,
    PanelCard,
    ChartLegend,
    PillToggle,
    BarChart,
    LineChart,
    DataGrid,
    IconComponent,
    SelectInput,
    FormsModule,
    HelpGuidance, ButtonComponent],
  templateUrl: "./sfd-overview.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./sfd-overview.component.css"],
})
export class SfdOverviewComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly overviewApi = inject(SfdOverviewApiService);
  private readonly themeService = inject(ThemeService);

  protected readonly helpGuidanceHtml = 'An overview of the Ship Fit Definition (SFD) data - total SFD equipment, items pending approval, and equipment due for ABER - with a chart of equipment count by sub-department. Use the ABER count\'s "View more" link to open the full ABER list.';

  // --- Overview data (GET api/v1/sfd/overview/) -----------------------------
  private readonly overview = signal<SfdOverviewResponse | null>(null);

  ngOnInit(): void {
    this.loadOverview();
    void this.loadActivity();
  }

  private async loadOverview(): Promise<void> {
    try {
      const data = await firstValueFrom(this.overviewApi.getOverview());
      this.overview.set(data);
    } catch (error) {
      console.error("Failed to load SFD overview", error);
    }
  }

  // --- KPIs -----------------------------------------------------------------
  // API always returns exactly 4 KPIs — icon colour/background are assigned
  // client-side (see withRandomIcon) and all 4 are shown, no selection needed.
  private readonly periodByKey = signal<Record<string, string>>({});

  // Icon colour is assigned once per loaded KPI list (not on every period
  // change) so tabs don't cause icons to flicker to a different colour.
  private readonly iconizedKpis = computed<OverviewKpi[]>(() => {
    const isLight = this.themeService.theme() === "light";
    return (this.overview()?.allKpis ?? []).map((kpi) => withRandomIcon(kpi, isLight));
  });

  readonly visibleKpis = computed<OverviewKpi[]>(() => {
    const periods = this.periodByKey();
    return this.iconizedKpis().map((k) => {
      const period = periods[k.key];
      if (!period) return k;
      return {
        ...k,
        selectedPeriod: period,
        displayValue: k.valueData[period] ?? k.displayValue,
        trendUp: trendDirection(k.trendData[period] ?? "", k.baseUp),
      };
    });
  });

  onPeriodChange(key: string, period: string): void {
    this.periodByKey.update((periods) => ({ ...periods, [key]: period }));
  }

  // --- Alerts + quick actions ----------------------------------------------
  readonly alerts = computed<Alert[]>(() => {
    const isLight = this.themeService.theme() === "light";
    return (this.overview()?.alerts ?? []).map((a) => ({ ...a, color: a.color || alertColorForTag(a.tag, isLight) }));
  });

  // --- Alert detail drawer ---------------------------------------------------
  readonly alertDrawerOpen = signal(false);
  readonly activeAlert = signal<Alert | null>(null);

  readonly activeAlertIcon = computed(() => alertIconForTag(this.activeAlert()?.tag ?? ""));
  readonly activeAlertIconBg = computed(() => hexToRgba(this.activeAlert()?.color ?? "#F59E0B", 0.16));
  readonly activeAlertDescription = computed(
    () => this.activeAlert()?.description || alertDescriptionForTag(this.activeAlert()?.tag ?? ""),
  );

  openAlert(alert: Alert): void {
    this.activeAlert.set(alert);
    this.alertDrawerOpen.set(true);
  }

  closeAlert(): void {
    this.alertDrawerOpen.set(false);
  }

  /** Only the Pending INSMA alert links anywhere real today — every other
   *  tag (Sync/Master/Update/Shelf Life) has no equipment-list or
   *  sync-status page to deep-link into yet. */
  isAlertActionable(alert: Alert): boolean {
    return alert.tag === IN_PROGRESS_TAG;
  }

  runAlertAction(alert: Alert): void {
    if (!this.isAlertActionable(alert)) return;
    this.closeAlert();
    this.router.navigate(["/afterAuth/ship/actions"], { queryParams: { view: "approval" } });
  }

  // "Add / Update SFD" is a two-level dropdown (Transaction Type → Category); the rest are
  // plain deep-link buttons.
  readonly quickActions: QuickAction[] = [
    { label: "View Approval Status", icon: "circle-check-big", route: "/afterAuth/ship/actions", queryParams: { view: 'approval' } },
  ];

  onQuickAction(action: QuickAction): void {
    if (action.route) {
      this.router.navigate([action.route], { queryParams: action.queryParams });
    }
  }

  // --- "Add / Update SFD" dropdown (Transaction Type → Category) ------------
  readonly qaTypes: SfdQaType[] = [
    { title: "Equipment", icon: "wrench" },
    { title: "System", icon: "layers" },
  ];

  // Sourced directly from SFD_CATEGORIES/CATEGORY_TO_SLUG (sfd-actions-fields.config.ts)
  // instead of a hand-duplicated list, so this never drifts from the Add form's category set.
  readonly qaCategories: SfdQaCategory[] = SFD_CATEGORIES.map((c) => ({
    label: c.id,
    slug: CATEGORY_TO_SLUG[c.id],
    color: c.color,
  }));

  readonly qaOpen = signal(false);
  readonly qaOpenType = signal<string | null>(null);

  toggleQaMenu(): void {
    this.qaOpen.update((v) => !v);
    this.qaOpenType.set(null);
  }

  closeQaMenu(): void {
    this.qaOpen.set(false);
    this.qaOpenType.set(null);
  }

  openQaType(type: string): void {
    this.qaOpenType.set(type);
  }

  /** Deep-link into the Add form (actions tab) with the picked Transaction Type + category. */
  selectSfdCategory(type: string, slug: string): void {
    this.closeQaMenu();
    this.router.navigate(["/afterAuth/ship/actions"], {
      queryParams: { view: "add", type, category: slug },
    });
  }

  @HostListener("document:click")
  onDocumentClick(): void {
    if (this.qaOpen()) this.closeQaMenu();
  }

  // --- Equipment distribution by department (bar chart + drill-down) --------
  readonly dept = computed<DeptDatum[]>(() =>
    (this.overview()?.deptDist ?? []).map((d) => ({ label: d.label, short: d.label, value: d.value })),
  );

  /** Sub-department breakdown backing the drill-down dropdown. */
  readonly deptSubs = computed<Record<string, DeptDatum[]>>(() => this.overview()?.deptSubs ?? {});

  /** "ship" (privileged role — CO/SHIPADMIN/COMMAND): `dept()` is every department, drill into
   *  one for its sub-departments. "department" (everyone else): `dept()` is already the viewer's
   *  own department's sub-departments — see SfdOverviewResponse.deptChartScope's own doc. Defaults
   *  to "ship" (the pre-existing behaviour) until the first response arrives. */
  readonly distScope = computed(() => this.overview()?.deptChartScope ?? "ship");

  /** Dropdown's "go back to the top-level view" option — its label adapts to distScope, but the
   *  underlying value stays this fixed sentinel string regardless, so onDistDeptChange() below can
   *  always recognise it (it can never collide with a real department/sub-department name — no
   *  Master_department/SubDepartment row is ever named literally this). */
  private readonly resetOptionLabel = computed(() =>
    this.distScope() === "department" ? "All Sub-Departments" : "All Departments",
  );

  readonly distDeptOpts = computed<DropdownOption[]>(() => [
    { label: this.resetOptionLabel(), value: this.resetOptionLabel() },
    ...this.dept().map((d) => ({ label: d.label, value: d.label })),
  ]);

  /** Department (or, in "department" scope, sub-department) drilled into — null = top level. */
  readonly distDrill = signal<string | null>(null);

  readonly distDeptValue = computed(() => this.distDrill() ?? this.resetOptionLabel());

  readonly distData = computed<BarDatum[]>(() => {
    const drill = this.distDrill();
    const subs = this.deptSubs();
    const source = drill ? subs[drill] ?? this.dept() : this.dept();
    const max = Math.max(0, ...source.map((d) => d.value));
    return source.map((d) => ({ label: d.short, value: d.value, primary: d.value === max }));
  });

  readonly distTitle = computed(() => {
    const drill = this.distDrill();
    if (this.distScope() === "department") {
      return drill ? `${drill} — Equipment Count` : "Equipment Distribution by Sub-Department";
    }
    return drill ? `${drill} — Sub-Departments` : "Equipment Distribution by Department";
  });

  readonly distSubtitle = computed(() => {
    const drill = this.distDrill();
    if (this.distScope() === "department") {
      return drill
        ? `Showing ${drill} only · select ${this.resetOptionLabel()} to see all your sub-departments`
        : "Equipment count across your department's sub-departments · pick one to filter";
    }
    return drill
      ? `Equipment count by sub-department · select ${this.resetOptionLabel()} to return`
      : "Equipment count fitted across each ship department · pick a department to drill down";
  });

  readonly distXAxis = computed(() =>
    this.distScope() === "department" || this.distDrill() ? "Sub-Departments" : "Departments",
  );

  onDistDeptChange(value: string): void {
    this.distDrill.set(this.deptSubs()[value] ? value : null);
  }

  // --- Installation trend (3-series line chart) -----------------------------
  readonly installLabels = computed<string[]>(() => this.overview()?.installLabels ?? []);
  readonly installSeries = computed<LineSeries[]>(() => this.overview()?.installSeries ?? []);
  readonly installLegend = computed<LegendItem[]>(() => this.overview()?.installLegend ?? []);

  // === Operational Insights =================================================

  // --- Recently added, updated or removed (data grid + period pills) --------
  // Rendered through the shared app-data-grid; Action/Status use the reusable
  // GridStatusChipRenderer so the pills match every other SFD table.
  readonly activityColDefs: ColDef[] = [
    { headerName: "Date", field: "date", flex: 0.8, minWidth: 100 },
    { headerName: "Equipment", field: "equip", flex: 2, minWidth: 200 },
    {
      headerName: "Action",
      field: "action",
      flex: 0.9,
      minWidth: 120,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: { Added: "success", Updated: "info", Removed: "danger" } },
    },
    { headerName: "Department", field: "dept", flex: 1.4, minWidth: 160 },
    { headerName: "Ship", field: "ship", flex: 1.2, minWidth: 140 },
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
  private readonly periodApiValue: Record<string, ActivityPeriod> = {
    Today: "today",
    Week: "week",
    Month: "month",
    Quarter: "quarter",
    Year: "year",
  };

  // app-data-grid is driven "server-side" here: rowData = current page only,
  // totalRowCount = full count for the selected period, pageRequested = ask
  // for another page/size. Both the period pills and pagination call the
  // backend (GET api/v1/sfd/overview/activity/) so Quarter/Year genuinely
  // pull that period's full data instead of re-filtering a fixed 20-row list.
  readonly activityPage = signal(1);
  readonly activityPageSize = signal(10);
  readonly activityPageRows = signal<ActivityRow[]>([]);
  readonly activityTotalCount = signal(0);

  private async loadActivity(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.overviewApi.getActivity({
          period: this.periodApiValue[this.actPeriod()] ?? "month",
          page: this.activityPage(),
          page_size: this.activityPageSize(),
        }),
      );
      this.activityPageRows.set(response.results);
      this.activityTotalCount.set(response.count);
    } catch (error) {
      console.error("Failed to load SFD activity", error);
    }
  }

  setActPeriod(p: string): void {
    this.actPeriod.set(p);
    this.activityPage.set(1);
    void this.loadActivity();
  }

  onActivityPageRequested(event: { page: number; pageSize: number }): void {
    this.activityPage.set(event.page);
    this.activityPageSize.set(event.pageSize);
    void this.loadActivity();
  }

  // --- KPI detail drawer ----------------------------------------------------
  readonly drawerOpen = signal(false);
  readonly activeKpi = signal<OverviewKpi | null>(null);

  // Stat tiles coloured client-side (see withStatColors) since the API only
  // supplies value/label.
  readonly activeKpiStats = computed<DrawerStat[]>(() => withStatColors(this.activeKpi()?.stats ?? []));

  openDetail(kpi: OverviewKpi): void {
    this.activeKpi.set(kpi);
    this.drawerOpen.set(true);
    this.expandedDepts.set(new Set());
  }

  closeDetail(): void {
    this.drawerOpen.set(false);
  }

  // --- Breakdown accordion (per-department equipment list) ------------------
  private readonly expandedDepts = signal<Set<string>>(new Set());

  isDeptExpanded(name: string): boolean {
    return this.expandedDepts().has(name);
  }

  toggleDept(name: string): void {
    this.expandedDepts.update((expanded) => {
      const next = new Set(expanded);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }
}
