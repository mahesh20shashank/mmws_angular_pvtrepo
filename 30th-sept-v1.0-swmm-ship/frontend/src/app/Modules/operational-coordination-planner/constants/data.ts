// Planner domain types and shared UI helpers.

export type Category = 'defect' | 'routine' | 'planned_routine' | 'trial' | 'audit' | 'others' | 'meeting' | 'lecture' | 'plan_flag' | 'planner_activity';
export type EventType = 'event' | 'routine' | 'planned_routine' | 'trial' | 'audit' | 'db_defect' | 'planner_activity' | 'plan_flag' | 'dart_raised' | 'dart_closed' | 'routine_dart' | 'running_hours_due' | 'running_hours_plan' | 'original_due';
export type LaneId = 'eng' | 'elec' | 'wpn' | 'ops' | 'fmu' | 'tri' | 'adm';
export type ViewMode = 'Year' | 'Month' | 'Week' | 'Day';
export type ThemeMode = 'dark' | 'light';

/** Single source of truth for each category's swatch color - was
 *  previously copy-pasted (with identical values) across
 *  planner-calendar's CAT_COLOR, planner-filter-panel's `swatches`, and
 *  planner-day-events-modal's inline `colors` map, which only stayed in
 *  sync by coincidence. */
export const CAT_COLOR: Record<Category, string> = {
  defect: '#e65b5b',
  routine: '#fb923c',
  planned_routine: '#7c3aed',
  trial: '#2dd4bf',
  audit: '#5b811d',
  others: '#94a3b8',
  meeting: '#06b6d4',
  lecture: '#8b5cf6',
  plan_flag: '#f59e0b',
  planner_activity: '#64748b',
};

/** Single source of truth for each category's display label - was
 *  previously copy-pasted across planner-detail-panel and
 *  planner-activity-details-modal, where the two copies had already
 *  drifted out of sync (missing different keys from each other). */
export const CAT_LABEL: Record<string, string> = {
  defect: 'Defect',
  routine: 'Routine',
  planned_routine: 'Planned Routine',
  trial: 'Trials / Inspection',
  audit: 'Audit',
  meeting: 'Meeting',
  lecture: 'Lecture',
  plan_flag: 'Planning Flag',
  planner_activity: 'Departmental Activity',
  others: 'Others',
};

export interface Activity {
  id: string;
  day: number;
  /** Absolute ISO date ("YYYY-MM-DD") the activity falls on - used by views
   *  (like Year) that aren't scoped to the currently loaded week. */
  date: string;
  cat: Category;
  type?: EventType;
  title: string;
  sub: string;
  description?: string;
  t: string;
  start_time?: string;
  end_time?: string;
  prog: number;
  status?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  conflict?: boolean;
  delayed?: boolean;
  selected?: boolean;
  isolation?: boolean;
  equipment?: string;
  ref?: string;
  loc?: string;
  routine_id?: number;
  defect_id?: number;
  detail_pk?: number;
  dart_number?: string;
  dart_state?: 'pending' | 'overdue' | 'closed' | 'raised';
  plan_state?: 'planned' | 'due' | 'overdue';
  rh_state?: 'upcoming' | 'overdue' | 'done';
  created_by?: string;
  frequency?: string;
  spares_required?: boolean;
  trial_type?: string;
  trial_mode?: string;
  routine_name?: string;
  section?: string;
  last_completion?: string;
  maintop_no?: string;
}

export interface Lane {
  id: LaneId;
  label: string;
  sub: string;
  icon: string;
  cls: string;
}

export interface Notification {
  id: number;
  kind: 'alert' | 'warn' | 'info';
  icon: string;
  title: string;
  body: string;
  when: string;
}

export interface InboxMessage {
  id: number;
  unread: boolean;
  from: string;
  subject: string;
  preview: string;
  when: string;
}

export interface SidebarItem {
  id: string;
  label: string;
  icon: string;
  count?: number;
}

export interface SidebarSection {
  group: string;
  items: SidebarItem[];
}

export interface EquipmentSection {
  label: string;
  operational: number;
  nonOperational: number;
  color: string;
}

export interface EquipmentItem {
  name: string;
  status: 'Operational' | 'Non-Operational';
}

export const EQUIPMENT_SECTIONS: EquipmentSection[] = [
  { label: 'AER', operational: 4, nonOperational: 2, color: '#f97316' },
  { label: 'FER', operational: 3, nonOperational: 3, color: '#22c55e' },
  { label: 'OMS', operational: 2, nonOperational: 1, color: '#a855f7' },
  { label: 'AMR', operational: 6, nonOperational: 2, color: '#4AA8FF' },
];

/** Mock per-equipment breakdown behind each `EQUIPMENT_SECTIONS` count, until a real endpoint exists. */
export function equipmentItemsFor(section: EquipmentSection): EquipmentItem[] {
  const items: EquipmentItem[] = [];
  for (let i = 1; i <= section.operational; i++) {
    items.push({ name: `${section.label}-${i}`, status: 'Operational' });
  }
  for (let i = 1; i <= section.nonOperational; i++) {
    items.push({ name: `${section.label}-${section.operational + i}`, status: 'Non-Operational' });
  }
  return items;
}

export const BASE_WEEK_START = new Date(2025, 4, 5); // Mon May 5, 2025
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export const LANES: Lane[] = [
  { id: 'eng', label: 'Engineering', sub: 'Mech / Hull', icon: 'wrench', cls: 'eng' },
  { id: 'elec', label: 'Electrical', sub: 'Power & Dist.', icon: 'bolt', cls: 'elec' },
  { id: 'wpn', label: 'Weapon', sub: 'Combat Systems', icon: 'target', cls: 'wpn' },
  { id: 'ops', label: 'Operations', sub: 'Sailing / NBCD', icon: 'compass', cls: 'ops' },
  { id: 'fmu', label: 'FMU / Support', sub: 'External', icon: 'users', cls: 'fmu' },
  { id: 'tri', label: 'Trials & Insp.', sub: 'ITTTM', icon: 'flask', cls: 'tri' },
  { id: 'adm', label: 'Admin / Other', sub: 'Routine', icon: 'doc', cls: 'adm' },
];

export const LANE_TIMES = [
  '0600 hrs - 1000 hrs',
  '1000 hrs - 1200 hrs',
  '1200 hrs - 1400 hrs',
  '1400 hrs - 1600 hrs',
  '1600 hrs - 1800 hrs',
  '1800 hrs - 2000 hrs',
  '2000 hrs - 2400 hrs',
];

export const SIDEBAR: SidebarSection[] = [
  {
    group: 'Communication layer',
    items: [
      { id: 'inbox', label: 'Inbox', icon: 'mail', count: 10 },
      { id: 'outbox', label: 'Outbox', icon: 'plane2', count: 3 },
    ],
  },
  {
    group: 'Command & situational awareness layer',
    items: [
      { id: 'home', label: 'Home', icon: 'home' },
      { id: 'planner', label: 'Operations Coordination Planner', icon: 'chart' },
    ],
  },
  {
    group: 'Operations layer',
    items: [
      { id: 'divorg', label: 'Divisional Organisation', icon: 'users' },
      { id: 'crew', label: 'Ship Crew & HR', icon: 'users' },
      { id: 'config', label: 'Ship Configuration / SFFD', icon: 'ship' },
      { id: 'opmaint', label: 'Operations Maintenance', icon: 'wrench' },
      { id: 'inv', label: 'Ship Inventory', icon: 'box' },
      { id: 'rrmaint', label: 'R&R Maintenance', icon: 'wrench' },
    ],
  },
  {
    group: 'Decision support & analytics layer',
    items: [
      { id: 'dss', label: 'DSS Dashboards', icon: 'chart' },
      { id: 'reports', label: 'Reports', icon: 'doc' },
      { id: 'kpis', label: 'KPIs', icon: 'piechart' },
      { id: 'km', label: 'Knowledge Management', icon: 'book' },
    ],
  },
  {
    group: 'Application administration & security layer',
    items: [
      { id: 'userconf', label: 'User Configuration', icon: 'users' },
      { id: 'roleconf', label: 'Role Configuration', icon: 'shield' },
    ],
  },
  {
    group: 'Others',
    items: [
      { id: 'siteconf', label: 'Site Configuration', icon: 'cog' },
      { id: 'access', label: 'Access Control', icon: 'lock' },
      { id: 'audit', label: 'Audit & Logs', icon: 'doc' },
      { id: 'tickets', label: 'Ticket Management', icon: 'ticket' },
      { id: 'help', label: 'Help', icon: 'help' },
    ],
  },
];

export function getWeekStart(weekOffset: number): Date {
  const d = new Date(BASE_WEEK_START);
  d.setDate(d.getDate() + weekOffset * 7);
  return d;
}

export function formatRange(weekOffset: number): string {
  const start = getWeekStart(weekOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const pad = (n: number) => String(n).padStart(2, '0');
  const month = (d: Date) => d.toLocaleString('en-US', { month: 'short' });

  if (start.getMonth() === end.getMonth()) {
    return `${pad(start.getDate())} - ${pad(end.getDate())} ${month(end)} ${end.getFullYear()}`;
  }

  return `${pad(start.getDate())} ${month(start)} - ${pad(end.getDate())} ${month(end)} ${end.getFullYear()}`;
}

export function formatRangeFromDate(start: Date): string {
  const rangeStart = startOfDay(start);
  const end = addDays(rangeStart, 6);
  const pad = (n: number) => String(n).padStart(2, '0');
  const month = (d: Date) => d.toLocaleString('en-US', { month: 'short' });

  if (rangeStart.getMonth() === end.getMonth()) {
    return `${pad(rangeStart.getDate())} - ${pad(end.getDate())} ${month(end)} ${end.getFullYear()}`;
  }

  return `${pad(rangeStart.getDate())} ${month(rangeStart)} - ${pad(end.getDate())} ${month(end)} ${end.getFullYear()}`;
}

export function dateToWeekOffset(date: Date): number {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dow);
  return Math.round((target.getTime() - BASE_WEEK_START.getTime()) / (7 * MS_PER_DAY));
}
