export interface DepartmentAffected {
  id: number;
  name: string;
}

export interface DepartmentOption {
  id: number;
  name: string;
}

export interface TagoutHistoryDataItem {
  id: number;
  date?: string;
  ship_name?: string;
  department_name?: string;
  departments_affected?: (DepartmentAffected | number)[];
  active?: number;
  tagout_number?: string;
  tag_no?: string;
  ship_equipment?: string;
  equipment?: string;
  name_of_component?: string;
  name_of_subsystem?: string;
  approval_status?: string;
  status?: string;
}

export interface TagoutHistoryFilters {
  from_date: string;
  to_date: string;
  department: string;
}

export interface TagoutHistoryResponse {
  status: string;
  data: TagoutHistoryDataItem[];
  departments: DepartmentOption[];
  filters: TagoutHistoryFilters;
  is_dyhod: boolean;
}

export interface DashboardHistoryItem {
  date?: string;
  tag_out?: number;
  tag_outs?: number;
  tagout?: number;
  tag_in?: number;
  tag_ins?: number;
  tagin?: number;
}

export interface TagoutDashboardResponse {
  weekly_tagout_count?: number;
  weekly_tag_outs?: number;
  weekly_tag_out?: number;
  weekly_tagin_count?: number;
  weekly_tag_ins?: number;
  weekly_tag_in?: number;
  today_tagout_count?: number;
  today_tag_outs?: number;
  today_tag_out?: number;
  today_tagin_count?: number;
  today_tag_ins?: number;
  today_tag_in?: number;
  tagout_pending_approval_count?: number;
  pending_approval_count?: number;
  waiting_for_approval?: number;
  tagout_yet_to_tagin_count?: number;
  yet_to_tag_in_count?: number;
  history_data?: DashboardHistoryItem[];
  data?: DashboardHistoryItem[];
}

