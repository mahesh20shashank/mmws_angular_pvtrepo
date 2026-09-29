export interface MaintenancePeriodApiItem {
  id: number;
  type: string;
  name: string;
  maintenance_period: string;
  actual_start_date: string;
  actual_end_date: string;
}

export interface RefitAndOperationalOccasionResponse {
  refit_periods?: MaintenancePeriodApiItem[];
  maint_periods?: MaintenancePeriodApiItem[];
  ops_periods?: MaintenancePeriodApiItem[];
}

export interface MaintenanceRow {
  id?: number;
  type: string;
  name: string;
  maintenancePeriod: string;
  actualStartDate: string;
  actualEndDate: string;
  nomenclatureName?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
}
