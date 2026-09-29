import { DrawerStat, LegendItem, LineSeries } from "../../../../shared/components";

/** One value+label pair shown beside a drawer breakdown row (e.g. Units / Share). */
export interface BreakdownMetric {
  label: string;
  value: string;
}

export interface BreakdownEquipment {
  name: string;
  shelfLife?: string;
  status: string;
  statusColor?: string;
}

export interface BreakdownRow {
  name: string;
  /** Bar width relative to the largest row (0–100). */
  pct: number;
  /** Bar colour; falls back to the KPI accent when omitted. */
  color?: string;
  metrics: BreakdownMetric[];
  /** Equipment shown when the department is expanded — empty until the
   *  backend populates it (currently returns `[]` for every department). */
  equipments?: BreakdownEquipment[];
}

/** Row for list-mode drawers (pending approvals, sync queue, returns). */
export interface DrawerListRow {
  title: string;
  sub: string;
  meta: string;
  tag: string;
  tagColor: string;
  dotColor: string;
}

export interface OverviewKpi {
  key: string;
  title: string;
  count: number;
  /** Value shown on the card for the selected range (e.g. "1,248"). */
  displayValue: string;
  iconColor: string;
  iconBg: string;
  /** Raw SVG path for the card icon. */
  iconPath: string;
  trendUp: boolean;
  /** Trend direction of the base (All) range — fallback for flat trends like "0%". */
  baseUp: boolean;
  selectedPeriod: string;
  /** Per-range trend badge, keyed "all" | "6m" | "1y" | "2y". */
  trendData: Record<string, string>;
  /** Per-range display value — the card value follows the selected range. */
  valueData: Record<string, string>;
  /** Drawer header subtitle beside the value (e.g. "current fleet total"). */
  drawerSubtitle: string;
  sectionTitle: string;
  /** Right-aligned hint beside the drawer section title (e.g. "Units · Share"). */
  sectionHint: string;
  stats: DrawerStat[];
  /** Drawer body layout: proportional bars vs. dot list. */
  mode: "breakdown" | "list";
  breakdown?: BreakdownRow[];
  listRows?: DrawerListRow[];
}

/** One label/value row shown in the alert detail drawer (e.g. "Request No" / "SFD-2026-0142"). */
export interface AlertMeta {
  label: string;
  value: string;
}

export interface Alert {
  text: string;
  tag: string;
  color: string;
  description?: string;
  meta?: AlertMeta[];
  /** Related records list (e.g. the flagged equipment behind this alert). */
  related?: DrawerListRow[];
}

export interface DeptDatum {
  label: string;
  /** Compact label rendered under the bar. */
  short: string;
  value: number;
}

/** Top-level department distribution entry from the API — expanded into a
 *  `DeptDatum` (short defaults to label) for the bar chart. */
export interface DeptDistDatum {
  label: string;
  value: number;
  primary: boolean;
}

export interface CategorySegment {
  label: string;
  value: number;
  color: string;
}

export interface ActivityRow {
  d: number;
  date: string;
  equip: string;
  action: "Added" | "Updated" | "Removed";
  dept: string;
  ship: string;
  status: "Verified" | "In Progress";
}

/** Response shape for `GET api/v1/sfd/overview/activity/` — period-aware and
 *  paginated server-side, unlike `SfdOverviewResponse.activity` which is a
 *  fixed teaser of the latest 20 rows regardless of period. */
export interface ActivityResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ActivityRow[];
}

export type ActivityPeriod = "today" | "week" | "month" | "quarter" | "year";

export interface SfdOverviewMetadata {
  lastSync: string;
  generatedAt: string;
  version: string;
}

/** Response shape for `GET api/v1/sfd/overview/`. Icon styling on `allKpis`
 *  (iconColor/iconBg) is not treated as authoritative — the overview screen
 *  assigns those client-side since the API's job is the underlying data. */
export interface SfdOverviewResponse {
  allKpis: OverviewKpi[];
  alerts: Alert[];
  deptDist: DeptDistDatum[];
  deptSubs: Record<string, DeptDatum[]>;
  /** "ship" — privileged role (CO/SHIPADMIN/COMMAND): `deptDist` is every department, drill into
   *  one for its sub-departments, same as before. "department" — regular user: `deptDist` is
   *  already THEIR OWN department's sub-departments (a single "my department" bar would be a
   *  useless 1-bar chart), and picking one from the dropdown filters down to just that one. */
  deptChartScope: "ship" | "department";
  catSegments: CategorySegment[];
  catSummary: string;
  installLabels: string[];
  installSeries: LineSeries[];
  installLegend: LegendItem[];
  activity: ActivityRow[];
  metadata: SfdOverviewMetadata;
}
