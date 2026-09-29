// Types for /api/v1/tank/dashboard/, detail/, calibrations/, sounding/bulk-save/,
// graph-slots/reassign/ and categories/unassigned/ — backend: tank/views.py.

/** One tank row inside a dashboard graph slot (tank/views.py:_build_graph_slot_data). */
export interface TankDashboardTank {
  /** TankTypeDetail id — used as tank_id for calibrations/ and sounding/bulk-save/. */
  sno: number;
  n: string;
  c95: number;
  c100: number;
  T: number;
  mm: number;
  d: string | null;
  ti: string | null;
}

export interface TankDashboardSummary {
  category_id: number | null;
  category_name: string;
  count: number;
  total_held: number;
  total_95: number;
  filled_pct: number;
  topup_pct: number;
  unit: string;
}

export interface TankDashboardGraphSlot {
  slot: number;
  category_id: number | null;
  category_name: string;
  tanks: TankDashboardTank[];
  summary: TankDashboardSummary;
}

export interface TankCategoryOption {
  id: number;
  tank_category: string;
}

export interface TankDashboardResponse {
  status: string;
  graphs: TankDashboardGraphSlot[];
  unassigned_categories: TankCategoryOption[];
  soundings_update_date: string | null;
}

export interface TankDetailQuery {
  category_id?: number;
  location?: string;
  subtype?: string;
}

export interface TankDetailRow {
  nomenclature: string;
  location: string;
  subtype: string;
  cap_100: number;
  cap_95: number;
  mm: number;
  updated_at: string;
  tonnes: number;
  pct: number;
  status: 'High' | 'Low' | 'Normal';
}

export interface TankDetailResponse {
  status: string;
  tanks: TankDetailRow[];
}

/** Tanks for one category — capacity, 95%-limit sounding (mm), latest reading. */
export interface TankByTypeRow {
  id: number;
  tank_name: string;
  capacity: number;
  limiting_sounding: number;
  latest_mm: number;
  latest_tonnes: number;
}

export interface TanksByTypeResponse {
  status: string;
  results: TankByTypeRow[];
}

export interface CalibrationCurvePoint {
  mm: number;
  volume: number;
  flag: number;
}

export interface CalibrationCurveResponse {
  status: string;
  data: CalibrationCurvePoint[];
}

/** Note: the backend field is genuinely spelled `calculated_tone` (typo for tonnes). */
export interface CalibrationLookupResponse {
  status: string;
  calculated_tone: number;
}

export interface BulkSoundingItem {
  tank_id: number;
  sounding_mm: number;
  during_ras_ton?: number | null;
  reading_time: string;
}

export interface BulkSoundingSaveResponse {
  status: string;
  created_ids: number[];
}

export interface GraphSlotReassignPayload {
  graph_slot: 1 | 2 | 3 | 4;
  new_category_id: number;
}

export interface GraphSlotReassignResponse {
  status: string;
  slot: number;
  category_id: number;
  category_name: string;
  tanks: TankDashboardTank[];
  summary: TankDashboardSummary;
}

export interface UnassignedCategoriesResponse {
  status: string;
  categories: TankCategoryOption[];
}

// ─────────────────────────────────────────────────────────────
// UI-facing types for pol-status-dashboard.ts (mapped from the API shapes above).
// ─────────────────────────────────────────────────────────────

export interface TankItem {
  /** TankTypeDetail id — the tank_id expected by calibrations/ and sounding/bulk-save/. */
  id: number;
  name: string;
  capacity100: number;
  capacity95: number;
  sounding: number;
  held: number;
  fillPercent: number;
  status: 'GOOD' | 'LOW';
  lastUpdated: string;
}

/** One of the 4 dashboard chart panels (and its matching summary card) — mirrors
 *  Django's configurable graph "slots" (tank/tank_main_page.html GRP / switchCategory
 *  / partials/tank_main_content.html's summary card loop), where each slot
 *  independently picks which Tank Category it charts and summarizes. */
export interface ChartSlot {
  slot: number;
  categoryId: number | null;
  tankType: string;
  tanks: TankItem[];
  /** Y-axis scale ceiling — the tallest 100% capacity bar in this slot (never 0, to avoid div-by-zero). */
  maxCapacity: number;
  count: number;
  total95: number;
  totalHeld: number;
  filledPct: number;
  topupPct: number;
}

/** Fixed per-slot-position icon + accent, independent of whichever category
 *  currently occupies the slot — matches Django's fuel-pump/orange, airplane/green,
 *  droplet/pink, water/purple summary-card styling (tank_main_content.html). */
export interface SlotMeta {
  icon: string;
  accent: string;
  iconBg: string;
}

export interface TooltipState {
  x: number;
  y: number;
  tank: TankItem;
}

export interface TankEditState {
  categoryId: number | null;
  tank: TankItem;
  soundingMm: number | null;
  computedTons: number | null;
  date: string;
  time: string;
}

export interface SoundingRow {
  tankId: number;
  tank_name: string;
  limit_mm: number;
  start_ras: number;
  sounding_mm: number | null;
  during_ras: number | null;
}
