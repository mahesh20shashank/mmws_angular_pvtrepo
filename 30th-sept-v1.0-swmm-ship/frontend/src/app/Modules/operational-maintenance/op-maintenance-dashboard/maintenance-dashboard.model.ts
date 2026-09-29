export interface MaintenanceDashboardResponse {
  command_actions_pending: CommandActionsPending;
  maintenance_prioritisation: MaintenancePrioritisations;
  equipment_health_monitoring: EquipmentHealthMonitoring;
  movement_and_configuration_history: MovementAndConfigurationHistory;
  maintenance_constraints_and_dependencies: MaintenanceConstraintsAndDependenciess;
  contextual_search_and_drill_down: ContextualSearchAndDrillDowns;
  reliability_and_degradation_trend: ReliabilityAndDegradationTrend;
  trials_validation_and_post_maintenance: TrialsValidationAndPostMaintenance;
}

// COMMAND ACTIONS

export interface CommandActionsPending {
  heading: string;
  view_all_flag: boolean;
  items: CommandActionItem[];
}

export interface CommandActionItem {
  title: string;
  count: number;
  severity: string;
}

// MAINTENANCE PRIORITISATION

export interface MaintenancePrioritisations {
  heading: string;
  view_all_flag: boolean;
  maintenance_prioritisation_items: MaintenancePrioritisationItem[];
}

export interface MaintenancePrioritisationItem {
  icon: string;
  title: string;
  sub_title: string;
  priority: string;
  percentage: number;
}

// EQUIPMENT HEALTH

export interface EquipmentHealthMonitoring {
  heading: string;
  view_all_flag: boolean;
  search_enabled: boolean;
  equipment_summary: EquipmentSummary[];
  selected_equipment: SelectedEquipment;
}

export interface EquipmentSummary {
  equipment_id: string;
  equipment_name: string;
  score: number;
  status: string;
  alarm_count: number;
  message: string;
}

export interface SelectedEquipment {
  equipment_name: string;
  system: string;
  location: string;
  image: string;
  condition_parameters: ConditionParameter[];
}

export interface ConditionParameter {
  parameter: string;
  current_value: number;
  unit: string;
  trend_data: number[];
}

// MOVEMENT HISTORY

export interface MovementAndConfigurationHistory {
  heading: string;
  view_all_flag: boolean;
  movement_and_configuration_histories: MovementHistoryItem[];
}

export interface MovementHistoryItem {
  date: string;
  event_type: string;
  title: string;
  description: string;
}

// MAINTENANCE CONSTRAINTS

export interface MaintenanceConstraintsAndDependenciess {
  heading: string;
  view_all_flag: boolean;
  summary: MaintenanceConstraintSummary;
  constraints: Constraint[];
}

export interface MaintenanceConstraintSummary {
  spares_constraints: number;
  fmu_oem_dependencies: number;
  trials_pending: number;
  manpower_gaps: number;
}

export interface Constraint {
  constraint_type: string;
  description: string;
  reference_id: string;
}

// CONTEXTUAL SEARCH

export interface ContextualSearchAndDrillDowns {
  heading: string;
  view_all: boolean;
  filters: string[];
  search_enabled?:boolean;
  selected_filter: string;
  search_text: string;
  results: SearchResult[];
  selected_item: SelectedItem;
  metrics?: ContextualMetric[];
}

export interface ContextualMetric {
  title: string;
  value: number;
  unit: string;
  trend_data: number[];
}


export interface SearchResult {
  equipment: string;
  location: string;
  status: string;
}

export interface SelectedItem {
  equipment_name: string;
  equipment_status: string;
  location: string;
  system: string;
  status: string;
  equipment_id: number | null;
  compartment: string;
  last_updated: string | null;
}
// RELIABILITY

export interface ReliabilityAndDegradationTrend {
  heading: string;
  view_all_flag: boolean;
  search_enabled: boolean;
  metrics: ReliabilityMetric[];
}

export interface ReliabilityMetric {
  metric_name: string;
  value: number;
  unit: string;
  trend_data: number[];
}

// TRIALS & VALIDATION

export interface TrialsValidationAndPostMaintenance {
  heading: string;
  view_all_flag: boolean;
  summary: TrialSummary;
  activities: TrialActivity[];
}

export interface TrialSummary {
  restored: number;
  validation_pending: number;
  failed: number;
}

export interface TrialActivity {
  equipment_name: string;
  activity: string;
  date: string;
  status: string;
}
