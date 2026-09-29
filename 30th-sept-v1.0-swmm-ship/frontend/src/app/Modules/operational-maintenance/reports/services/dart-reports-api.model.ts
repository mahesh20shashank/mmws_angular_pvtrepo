/** `GET /api/v1/dart/reports/darts/` row shape. */
export interface DartsReportRow {
  dart_no: string;
  equipment: string;
  reason: string;
  severity: string;
  status: string;
  raised_on: string;
  days_open: number;
  occurrence_date: string;
  closure_date: string | null;
  age: number;
}

/** `GET /api/v1/dart/reports/closed-darts/` row shape. */
export interface ClosedDartsReportRow {
  dart_no: string;
  equipment: string;
  reason: string;
  rectified: string;
  closed_on: string | null;
}

/** `GET /api/v1/dart/reports/service-required/` row shape. */
export interface ServiceRequiredReportRow {
  ref: string;
  service: string;
  department: string;
  raised_on: string;
  status: string;
}

/** `GET /api/v1/dart/reports/guarantee-monitoring/` row shape. */
export interface GuaranteeMonitoringReportRow {
  equipment: string;
  supplier: string;
  exposure_pct: string;
  guarantee_expiry: string;
  risk: string;
}

/** `GET /api/v1/dart/reports/spares-consumed/` row shape. */
export interface SparesConsumedReportRow {
  spare_name: string;
  part_no: string;
  quantity_used: number;
  defect_no: string;
}

/** `GET /api/v1/dart/reports/ra-status/` row shape. */
export interface RaStatusReportRow {
  ra_no: string;
  type: string;
  equipment: string;
  routing: string;
  submitted: string;
  authority: string;
  created_at: string;
  status: string;
}

/** `GET /api/v1/dart/reports/filter-options/` response. */
export interface DartReportFilterOptions {
  status_options: string[];
  date_filter_options: string[];
  severity_options: string[];
}

export type DartDateFilter = "last_30_days" | "last_90_days" | "this_year" | "last_year";

/** `report_key` accepted by `POST /api/v1/dart/reports/{report_key}/export/` — differs from the
 * list-endpoint path slugs (e.g. `darts-report` here vs. `reports/darts/` for the list). */
export type DartReportExportKey =
  | "darts-report"
  | "closed-darts-report"
  | "service-required-report"
  | "guarantee-monitoring-report"
  | "spares-consumed-report"
  | "ra-status";

export interface DartsReportParams {
  status?: string;
  severity?: string;
  date_filter?: DartDateFilter | string;
}

export interface ClosedDartsReportParams {
  equipment?: string;
  date_filter?: DartDateFilter | string;
}

export interface ServiceRequiredReportParams {
  service?: string;
  department?: string;
  status?: string;
  date_filter?: DartDateFilter | string;
}

export interface GuaranteeMonitoringReportParams {
  date_filter?: DartDateFilter | string;
}

export interface SparesConsumedReportParams {
  spares?: string;
  equipment?: string;
  date_filter?: DartDateFilter | string;
}

export interface RaStatusReportParams {
  ra_no?: string;
  ra_type?: string;
  status?: string;
}
