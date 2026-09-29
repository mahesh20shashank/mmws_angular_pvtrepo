import { DartReportExportKey } from "./services/dart-reports-api.model";

/** A column in a report grid. */
export interface OpmReportColumn {
  field: string;
  label: string;
  chip?: boolean;
  /** Holds an ISO date/datetime string — drives the report's Date Range filter. */
  date?: boolean;
}

/** A single report definition. Rows are loaded live from the DART reports API for reports that
 * carry `apiReportKey`; reports without one (no backend endpoint yet) keep their seed rows. */
export interface OpmReport {
  id: string;
  name: string;
  purpose: string;
  /** Lucide icon name for the report-nav entry. */
  icon: string;
  columns: OpmReportColumn[];
  rows: Record<string, string | number>[];
  /** Identifies which `DartReportsApiService` list method backs this report. */
  apiReportKey?: "darts" | "closed-darts" | "service-required" | "guarantee-monitoring" | "spares-consumed" | "ra-status";
  /** `report_key` for `POST /reports/{report_key}/export/` — a different slug than the list endpoint. */
  exportKey?: DartReportExportKey;
}

/** Shared status-chip tone map covering every chip value used across reports. */
export const OPM_REPORT_TONE_MAP: Record<string, string> = {
  Critical: "danger",
  Major: "warning",
  Minor: "neutral",
  Open: "info",
  "In Progress": "warning",
  Closed: "success",
  Returned: "danger",
  Pending: "info",
  Approved: "success",
  "With FMU": "warning",
  "With Yard": "warning",
  Red: "danger",
  Amber: "warning",
  Green: "success",
  Success: "success",
  Failed: "danger",
};

export const OPM_REPORTS: OpmReport[] = [
  {
    id: "r1",
    name: "Open DART Register",
    purpose: "Track active defects and raised assistance across the ship.",
    icon: "file-text",
    apiReportKey: "darts",
    exportKey: "darts-report",
    columns: [
      { field: "dart_no", label: "DART No." },
      { field: "equipment", label: "Equipment" },
      { field: "reason", label: "Reason" },
      { field: "severity", label: "Severity", chip: true },
      { field: "status", label: "Status", chip: true },
      { field: "raised_on", label: "Raised On", date: true },
      { field: "days_open", label: "Days Open" },
    ],
    rows: [],
  },
  {
    id: "r2",
    name: "Closed Defect History",
    purpose: "Review completed defects, including onboard rectifications.",
    icon: "circle-check-big",
    apiReportKey: "closed-darts",
    exportKey: "closed-darts-report",
    columns: [
      { field: "dart_no", label: "DART No." },
      { field: "equipment", label: "Equipment" },
      { field: "reason", label: "Reason" },
      { field: "rectified", label: "Rectified" },
      { field: "closed_on", label: "Closed On", date: true },
    ],
    rows: [],
  },
  {
    id: "r3",
    name: "Service Required Register",
    purpose: "Track service requests raised under Reason = Services.",
    icon: "wrench",
    apiReportKey: "service-required",
    exportKey: "service-required-report",
    columns: [
      { field: "ref", label: "Ref" },
      { field: "service", label: "Service" },
      { field: "department", label: "Department" },
      { field: "raised_on", label: "Raised On", date: true },
      { field: "status", label: "Status", chip: true },
    ],
    rows: [],
  },
  {
    id: "r4",
    name: "Guarantee Monitoring",
    purpose: "Track guarantee exposure per equipment guarantee window.",
    icon: "shield-alert",
    apiReportKey: "guarantee-monitoring",
    exportKey: "guarantee-monitoring-report",
    columns: [
      { field: "equipment", label: "Equipment" },
      { field: "supplier", label: "Supplier" },
      { field: "exposure_pct", label: "Exposure %" },
      { field: "guarantee_expiry", label: "Guarantee Expiry", date: true },
      { field: "risk", label: "Risk", chip: true },
    ],
    rows: [],
  },
  {
    id: "r5",
    name: "Spares Consumption",
    purpose: "Track spare usage by defect and equipment.",
    icon: "package",
    apiReportKey: "spares-consumed",
    exportKey: "spares-consumed-report",
    columns: [
      { field: "spare_name", label: "Spare" },
      { field: "part_no", label: "Part No." },
      { field: "quantity_used", label: "Qty Used" },
      { field: "defect_no", label: "DART No." },
    ],
    rows: [],
  },
  {
    id: "r6",
    name: "RA Status Register",
    purpose: "Track RA progress by type and routing status.",
    icon: "send",
    apiReportKey: "ra-status",
    exportKey: "ra-status",
    columns: [
      { field: "ra_no", label: "RA No." },
      { field: "type", label: "Type" },
      { field: "equipment", label: "Equipment" },
      { field: "routing", label: "Routing", chip: true },
      { field: "submitted", label: "Submitted", date: true },
      { field: "authority", label: "Authority" },
    ],
    rows: [],
  },

];
