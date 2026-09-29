export type PlannerApiCategory = 'defect' | 'routine' | 'planned_routine' | 'trial' | 'audit' | 'meeting' | 'lecture' | 'others' | 'plan_flag' | 'planner_activity';
export type PlannerApiLane = 'eng' | 'elec' | 'wpn' | 'ops' | 'fmu' | 'tri' | 'adm';
export type PlannerApiStatus = 'scheduled' | 'active' | 'delayed' | 'conflict' | 'completed' | 'cancelled';
export type PlannerApiPriority = 'low' | 'medium' | 'high' | 'critical';

export interface PlannerActivityQuery {
  start_date?: string;
  end_date?: string;
  start?: string;
  end?: string;
  department?: string;
  lane?: PlannerApiLane;
  category?: string;
  categories?: string;
  status?: PlannerApiStatus;
  ship_id?: string | number;
  chip?: string;
}

export interface PlannerActivityDto {
  id: string | number;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  date?: string;
  start?: string;
  end?: string;
  start_time?: string | null;
  end_time?: string | null;
  time_label?: string | null;

  lane?: PlannerApiLane;
  lane_label?: string | null;
  department?: string | null;

  category: PlannerApiCategory;
  category_label?: string | null;

  status?: PlannerApiStatus;
  status_label?: string | null;

  priority?: PlannerApiPriority | null;
  priority_label?: string | null;

  progress: number;
  active?: boolean;
  delayed?: boolean;
  conflict?: boolean;
  selected?: boolean;
  isolation?: boolean;

  equipment?: string | null;
  reference?: string | null;
  location?: string | null;

  ship?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  routine_id?: number;
  defect_id?: number;
  detail_pk?: number;
  ref_code?: string;
  type?: string;

  dart_number?: string;
  dart_state?: 'pending' | 'overdue' | 'closed' | 'raised';
  plan_state?: 'planned' | 'due' | 'overdue';
  rh_state?: 'upcoming' | 'overdue' | 'done';
  frequency?: string;
  spares_required?: boolean;
  trial_type?: string;
  trial_mode?: string;
  routine_name?: string;
  section?: string;
  last_completion?: string;
  maintop_no?: string;
}

export interface PlannerActivityPayload {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  date: string;
  start_time: string;
  end_time?: string | null;
  department_id?: number | null;
  ship_id?: number | null;
  lane?: PlannerApiLane;
  category: PlannerApiCategory;
  status?: PlannerApiStatus;
  priority?: PlannerApiPriority | null;
  progress?: number;
  active?: boolean;
  delayed?: boolean;
  conflict?: boolean;
  selected?: boolean;
  isolation?: boolean;
  equipment?: string | null;
  reference?: string | null;
  location?: string | null;
}

export interface PlannerSummaryCardDto {
  key: string;
  label: string;
  count: number;
}

export interface PlannerSummaryDto {
  category_cards: PlannerSummaryCardDto[];
  conflict_count: number;
  delayed_count: number;
  active_count: number;
  upcoming_count: number;
}

export interface PlannerNotificationDto {
  id: number;
  kind: 'alert' | 'warn' | 'info';
  icon: string;
  title: string;
  body: string;
  when: string;
}

export interface PlannerInboxMessageDto {
  id: number;
  unread: boolean;
  sender: string;
  subject: string;
  preview: string;
  when: string;
}

export interface PlannerConflictDto {
  id: number;
  a: string;
  when: string;
}

export interface PlannerOverdueDto {
  id: number;
  a: string;
  by: string;
}

export interface PlannerUpcomingDto {
  id: number;
  d: string;
  a: string;
}

export interface PlannerDashboardDto {
  summary: PlannerSummaryDto;
  notifications?: PlannerNotificationDto[];
  inbox?: PlannerInboxMessageDto[];
  conflicts: PlannerConflictDto[];
  overdue: PlannerOverdueDto[];
  upcoming: PlannerUpcomingDto[];
  unread_count?: number;
}

export interface PlannerChoiceItemDto {
  value: string;
  label: string;
}

export interface PlannerChoicesDto {
  lanes: PlannerChoiceItemDto[];
  categories: PlannerChoiceItemDto[];
  filter_categories?: PlannerChoiceItemDto[];
  statuses: PlannerChoiceItemDto[];
  priorities: PlannerChoiceItemDto[];
  can_create_event?: boolean;
  can_add_planner_activity?: boolean;
  can_shift_due_date?: boolean;
}

export interface PlannerOverdueDartRowDto {
  ser: number;
  id: number;
  dart_number: string;
  defect_date: string;
  closing_date: string;
  status: string;
  equipment: string;
  description: string;
  days_overdue: number;
}

export interface PlannerOverdueDartsResponseDto {
  count: number;
  results: PlannerOverdueDartRowDto[];
}

export interface PlannerDartTrendSeriesDto {
  label: string;
  color: string;
  values: number[];
}

export interface PlannerDartTrendDto {
  labels: string[];
  series: PlannerDartTrendSeriesDto[];
}
