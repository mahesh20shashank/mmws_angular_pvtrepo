export interface EmsThumbnailResponse {
  data: {
    count: number;
    rh_due_count: number;
    cal_due_count: number;
    fuss_due_count: number;
    aber_due_count: number;
  };
}

export interface EmsSectionsResponse {
  section_name: Record<string, number>;
}

export interface EmsSubDepartmentsResponse {
  sub_department_name: Record<string, string>;
}

export interface SectionRhsiBarchartResponse {
  equipment_ids: number[];
  section: string;
  labels: string[];
  values: number[];
  formatted_values: string[];
  tooltips: string[];
  colors: string[];
}

export type EmsEquipmentLocation = 'AT HARBOUR' | 'AT SEA' | 'AT ANCHORAGE';

export interface UpdateEquipmentStatePayload {
  equipment_id: number;
  state: 'ACTIVE' | 'INACTIVE';
  started_at_location?: EmsEquipmentLocation;
  start_timedate?: string | null;
  stop_timedate?: string | null;
}

export interface MonthlyRunningHoursRow {
  start: string;
  stop: string;
  location: EmsEquipmentLocation | '';
}

export interface SaveMonthlyRunningHoursPayload {
  equipment_id: number;
  rows: MonthlyRunningHoursRow[];
}

export interface EquipmentHistoryItem {
  month: string;
  start: string;
  stop: string;
  duration: string;
  location: string;
}

export interface EquipmentHistoryResponse {
  history: EquipmentHistoryItem[];
}

export interface EmsEquipmentDetail {
  id: number;
  name: string;
  nomenclature: string;
  equipment_code: string;
  state: 'ACTIVE' | 'INACTIVE' | string;
  rhsi: number | null;
  rhsi_formatted: string;
  rhsi_updated_until: string | null;
  start_timedate: string | null;
  stop_timedate: string | null;
  started_at_location: string | null;
  sub_department_id: number;
  section_id: number;
}

export interface EmsStateChangeDetailResponse {
  equipment_detail: EmsEquipmentDetail;
  section_detail: string;
  start_time_display: string | null;
  rhsi_updated_until_display: string;
  next_equipment: number | string | null;
  previous_equipment: number | string | null;
  history: EquipmentHistoryItem[];
  form_options?: {
    state_choices?: { value: string; label: string }[];
    location_choices?: { value: string; label: string }[];
    current_state?: string;
    current_location?: string;
  };
}
