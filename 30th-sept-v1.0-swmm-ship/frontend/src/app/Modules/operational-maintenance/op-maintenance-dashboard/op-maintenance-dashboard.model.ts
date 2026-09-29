export interface ShipStatus {
  status: string;
  refit_name: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface SubDeptStatusRow {
  name: string;
  status: 'Ops' | 'Non-Ops';
  count: number;
}

export interface SubDeptEquipmentRow {
  sub_dept: string;
  operational: number;
  non_operational: number;
  total: number;
}

export type MonthlySeriesRow = { month: string; total: number } & Record<string, number | string>;

export interface MaintenancePeriodRow {
  maintenance_period: string;
  occasion: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface DartDashboardResponse {
  ship_status: ShipStatus | null;
  open_darts_ops_count: number;
  open_darts_refit_count: number;
  due_for_closing_count: number;
  sub_dept_status_data: SubDeptStatusRow[];
  sub_dept_equipment_data: SubDeptEquipmentRow[];
  open_chart_data: MonthlySeriesRow[];
  closed_chart_data: MonthlySeriesRow[];
  sub_depts: string[];
  maintenance_periods: MaintenancePeriodRow[];
}

export interface SubDeptDefectRow {
  dart_number: string;
  nomenclature: string;
  category: string;
  defective_since: string;
}
