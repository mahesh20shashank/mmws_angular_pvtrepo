import { DrawerStat } from "../../../shared/components";

/** One value+label pair shown beside a drawer breakdown row. */
export interface OpmBreakdownMetric {
  label: string;
  value: string;
}

/** Proportional-bar row in a KPI detail drawer (breakdown mode). */
export interface OpmBreakdownRow {
  name: string;
  /** Bar width relative to the largest row (0–100). */
  pct: number;
  color?: string;
  metrics: OpmBreakdownMetric[];
}

/** Dot-list row in a KPI detail drawer (list mode). */
export interface OpmDrawerListRow {
  title: string;
  sub: string;
  meta: string;
  tag: string;
  tagColor: string;
  dotColor: string;
}

/** A single overview KPI card + its drawer breakdown. Satisfies the shared
 *  `KpiOption` contract (title/count/trendData/icon*) so it can feed both
 *  `app-kpi-card` and `app-customize-kpi`. */
export interface OpmOverviewKpi {
  key: string;
  title: string;
  count: number;
  /** Value shown on the card for the selected range (e.g. "9"). */
  displayValue: string;
  iconColor: string;
  iconBg: string;
  /** Lucide icon name for the card icon. */
  iconName: string;
  trendUp: boolean;
  /** Fallback trend direction for flat ranges. */
  baseUp: boolean;
  selectedPeriod: string;
  /** Per-range trend badge, keyed "all" | "6m" | "1y" | "2y". */
  trendData: Record<string, string>;
  /** Per-range display value — the card value follows the selected range. */
  valueData: Record<string, string>;
  /** Drawer header subtitle beside the value. */
  drawerSubtitle: string;
  sectionTitle: string;
  sectionHint: string;
  stats: DrawerStat[];
  /** Drawer body layout: proportional bars vs. dot list. */
  mode: "breakdown" | "list";
  breakdown?: OpmBreakdownRow[];
  listRows?: OpmDrawerListRow[];
}

/** One label/value fact row shown in an alert's detail drawer. */
export interface OpmAlertDetailRow {
  label: string;
  value: string;
}

/** Which module area an alert's drawer rows / action deep-link to. */
export type OpmAlertNav = "actions" | "approval" | "guarantee" | "reports";

/** Operational alert row in the Alerts panel + the detail drawer opened on click. */
export interface OpmAlert {
  text: string;
  tag: string;
  color: string;
  /** Header badge in the drawer (e.g. "Critical" | "Caution"). */
  severity: string;
  /** Drawer body description paragraph. */
  desc: string;
  /** Key facts shown as label/value rows. */
  details: OpmAlertDetailRow[];
  /** Heading above the linked-items list. */
  itemsLabel: string;
  /** Linked records — clicking any row deep-links to `nav`. */
  items: string[];
  /** Deep-link target for the item rows and the footer action button. */
  nav: OpmAlertNav;
  /** Footer action button label + icon (Lucide name). */
  actionLabel?: string;
  actionIcon: string;
}

/** A department row in the "DART Load by Department" horizontal-bar card. */
export interface OpmDeptLoad {
  label: string;
  value: number;
}

/** A quick-action button in the Quick Actions panel. */
export interface OpmQuickAction {
  label: string;
  icon: string;
  tab: string;
  /** Optional deep-link query params applied when navigating to the tab (e.g. `{ view: "approval" }`). */
  queryParams?: Record<string, string>;
}

/** Department distribution datum backing the Open-DARTs bar chart. */
export interface OpmDeptDatum {
  label: string;
  /** Compact label rendered under the bar. */
  short: string;
  value: number;
}

/** Recent DART / RA activity row (d = days ago, drives period filtering). */
export interface OpmActivityRow {
  d: number;
  date: string;
  equip: string;
  action: "Raised" | "Closed";
  dept: string;
  ship: string;
  status: "Verified" | "In Progress";
}

// ---------------------------------------------------------------------------
// `GET api/v1/dart/dashboard/` response shapes (backend/dart/serializers.py)
// ---------------------------------------------------------------------------

export interface OpmDashboardCard {
  value: number | null;
  available: boolean;
  note?: string;
}

export interface OpmDashboardCards {
  total_active_defects: OpmDashboardCard;
  opdef_opdef_sta: OpmDashboardCard;
  ra_with_fmu_yard: OpmDashboardCard;
  guarantee_exposure_alerts: OpmDashboardCard;
  certificates_issued: OpmDashboardCard;
}

export interface OpmDashboardAlert {
  id: number;
  dart_number: string | null;
  title: string;
  equipment: string | null;
  severity: string | null;
  department: string | null;
  type: string;
  status: string;
  date: string | null;
}

export interface OpmDashboardQuickAction {
  key: string;
  label: string;
  action: string;
}

export interface OpmDashboardDeptCount {
  department: string;
  count: number;
}

export interface OpmDashboardSeverityCount {
  severity: string;
  count: number;
}

export interface OpmDashboardTrendPoint {
  month: string;
  raised: number;
  closed: number;
  reopened: number;
}

export interface OpmDashboardActivityRow {
  id: number;
  date: string | null;
  equipment: string | null;
  action: "Raised" | "Closed";
  department: string | null;
  reason: string | null;
  status: "Verified" | "In Progress";
}

export interface OpmDashboardData {
  cards: OpmDashboardCards;
  alerts: OpmDashboardAlert[];
  quick_actions: OpmDashboardQuickAction[];
  open_darts_by_department: OpmDashboardDeptCount[];
  open_darts_by_severity: OpmDashboardSeverityCount[];
  dart_lifecycle_trend: OpmDashboardTrendPoint[];
  dart_load_by_department: OpmDashboardDeptCount[];
  recent_activity: OpmDashboardActivityRow[];
}

export interface OpmDashboardResponse {
  status: boolean;
  message: string;
  data: OpmDashboardData;
}

export type OpmDashboardPeriod = "ALL" | "6M" | "1Y" | "2Y";
export type OpmDashboardActivityPeriod = "today" | "week" | "month" | "quarter" | "year";
