export interface SfdTransactionRow {
  equipment_name: string;
  sfd_category: string;
  transaction_type: string;
  transaction_date: string;
  status: string;
  serial_no: string;
  department: string;
}

export interface SfdTransactionParams {
  page?: number;
  page_size?: number;
  sfd_category?: string;
  equipment_name?: string;
  transaction_type?: string;
  department?: string;
  date_range?: string;
}

export interface SfdTransactionResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: SfdTransactionRow[];
}

export interface SfdInstallationRow {
  equipment_name: string;
  serial_no: string;
  oem: string;
  supplier: string;
  installation_date: string;
  installation_authority: string;
  deck_no: string;
  frame_station: string;
  compartment: string;
}

export interface SfdInstallationParams {
  page?: number;
  page_size?: number;
  date_filter?: string;
  oem?: string;
  supplier?: string;
}

export interface SfdInstallationResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: SfdInstallationRow[];
}

export interface SfdLocationRow {
  equipment_name: string;
  equipment_code: string;
  deck_no: string;
  frame_station: string;
  location: string;
  compartment: string;
  qty_fitted: number;
}

export interface SfdLocationParams {
  page?: number;
  page_size?: number;
  location?: string;
  compartment?: string;
  qty_fitted?: number;
}

export interface SfdLocationResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: SfdLocationRow[];
}

export interface SfdRemovedEquipmentRow {
  equipment_code: string;
  equipment_name: string;
  serial_no: string;
  removal_date: string;
  removal_remark: string;
  removal_authority: string;
  installation_authority: string;
  status: string;
  is_sync: string;
}

export interface SfdRemovedEquipmentParams {
  page?: number;
  page_size?: number;
  /** Date range preset: last_30_days, last_90_days, this_year, last_year. */
  removal_date?: string;
  /** Partial match on authority of removal. */
  removed_authority?: string;
  /** 1=Approved, 2=Pending, 3=Rejected. */
  status?: number | string;
}

export interface SfdRemovedEquipmentResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: SfdRemovedEquipmentRow[];
}

export interface SfdApprovalStatusRow extends SfdRemovedEquipmentRow {
  rh_at_installation: number;
  install_date: string;
  installation_remark: string;
  approval_request_type: string;
}

export interface SfdApprovalStatusParams {
  page?: number;
  page_size?: number;
  /** 1=Remove, 2=Change Sr. No. */
  approval_request_type?: number | string;
  /** Date range preset: last_30_days, last_90_days, this_year, last_year. */
  install_date?: string;
  /** Date range preset: last_30_days, last_90_days, this_year, last_year. */
  removal_date?: string;
  /** Partial match on authority of removal. */
  removed_authority?: string;
  /** 1=Approved, 2=Pending, 3=Rejected. */
  status?: number | string;
}

export interface SfdApprovalStatusResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: SfdApprovalStatusRow[];
}

export interface ShipEquipmentConfigurationRow {
  equipment_name: string;
  transaction_type: string;
  is_system: boolean;
  transaction_category: string;
  equipment_sr_no: string;
  equipment_model: string;
  equipment_nomenclature: string;
  location: string;
  compartment: string;
  oem_part_no: string;
  deck_no: string;
  installation_date: string;
  manufacture: string;
  supplier: string;
  maintop_id: number;
  service_life: number;
  approval_status: string;
  frame_station: string;
  department: string;
  sub_department: string;
  qty_fitted: number;
}

export interface ShipEquipmentConfigurationParams {
  page?: number;
  page_size?: number;
  transaction_type?: string;
  transaction_category?: string;
  location?: string;
  compartment?: string;
  installation_date?: string;
  manufacture?: string;
  supplier?: string;
  service_life?: number;
  approval_status?: number | string;
  department?: number | string;
  sub_department?: string;
}

export interface ShipEquipmentConfigurationResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ShipEquipmentConfigurationRow[];
}

export interface FilterOption {
  value: string;
  label: string;
}

export type ReportFilterField =
  | "sfd_category"
  | "equipment_name"
  | "transaction_type"
  | "department"
  | "sub_department"
  | "system"
  | "supplier"
  | "oem"
  | "compartment"
  | "qty_fitted"
  | "location_code"
  | "location"
  | "remove_authority"
  | "remove_status"
  | "approval_request_type"
  | "service_life"
  | "approval_status";

export type ReportsFilterOptions = Partial<Record<ReportFilterField, FilterOption[]>>;

export type SfdReportKey =
  | "sfd-transactions"
  | "sfd-installations"
  | "sfd-locations"
  | "approval-status"
  | "removed-equipment"
  | "ship-equipment-configuration";

export type SfdReportExportFormat = "excel" | "pdf";

export type SfdReportExportJobStatus = "pending" | "running" | "success" | "failed";

export interface SfdReportExportJob {
  id: string;
  report_key: string;
  export_format: SfdReportExportFormat;
  status: SfdReportExportJobStatus;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  download_url: string | null;
}

export interface SfdReportExportResponse extends SfdReportExportJob {
  mode: "sync" | "async";
}
