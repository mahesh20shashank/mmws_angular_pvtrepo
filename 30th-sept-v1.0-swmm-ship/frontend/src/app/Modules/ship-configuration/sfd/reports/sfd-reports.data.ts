import { FilterOption, ReportFilterField, SfdReportKey } from "../services/sfd-reports-api.module";

export interface ReportDef {
  id: string;
  name: string;
  iconName: string;
  filters: string[];
  columns: string[];
}

export interface FilterField {
  name: string;
  value: string;
  placeholder: string;
  isDate: boolean;
  options: FilterOption[];
}

export interface ColumnChip {
  name: string;
  selected: boolean;
  pos: number;
  /** Cannot be removed — either a fixed required column for the report (LOCKED_COLS)
   *  or an auto-included dependency of another selected column (COL_DEPS). */
  locked: boolean;
}

export const SFD_SHIP_EQUIPMENT_REPORT_ID = "r1";
export const SFD_TRANSACTION_REPORT_ID = "r2";
export const SFD_REMOVED_REPORT_ID = "r3";
export const SFD_INSTALLATION_REPORT_ID = "r4";
export const SFD_LOCATION_REPORT_ID = "r5";
export const SFD_APPROVAL_REPORT_ID = "r6";

export const SFD_REPORT_KEY_BY_ID: Partial<Record<string, SfdReportKey>> = {
  r1: "ship-equipment-configuration",
  r2: "sfd-transactions",
  r3: "removed-equipment",
  r4: "sfd-installations",
  r5: "sfd-locations",
  r6: "approval-status",
};

export const DATE_FIELDS = new Set([
  "Installation Date",
  "Removal Date",
  "Transaction Date",
  "Date Range",
  "Date",
]);
export const COL_DEPS: Record<string, string[]> = {
  "Frame Station": ["Deck No", "Deck Number"],
  Compartment: ["Deck No", "Deck Number"],
  "Compartment Name": ["Deck No"],
  "Installation Authority": ["Installation Date"],
  "Removal Authority": ["Removal Date"],
  "Serial No": ["Equipment Name"],
  "Serial Number": ["Equipment Name"],
  "Equipment Serial No": ["Equipment Name"],
};

/**
 * Columns that can never be removed from a report's column picker (independent of
 * COL_DEPS's dynamic auto-include-on-select locking). Reports absent here (r4, r5)
 * have no fixed base columns — every column stays freely addable/removable.
 */
export const LOCKED_COLS: Record<string, string[]> = {
  r1: [
    "Department", "Equipment Name", "Equipment Nomenclature", "Deck Number",
    "Frame Station", "Compartment", "Location",
  ],
  r2: ["Equipment Name", "Department", "SFD Category", "Transaction Type", "Transaction Date", "Status"],
  r3: ["Serial No", "Equipment Name", "Equipment Code", "Removal Authority", "Removal Date", "Status"],
  r6: ["Serial No", "Equipment Code", "Equipment Name", "Request Type", "Status"],
};

/** Default displayed columns per report. For r2/r3/r6 this is exactly their
 *  LOCKED_COLS set;keep their existing curated (fully removable) defaults. */
export const DEFAULT_COLS: Record<string, string[]> = {
  r1: [
    "Department", "Sub Department", "Equipment Name", "Equipment Type", "OEM",
    "Serial Number", "Qty Fitted", "Equipment Nomenclature", "Deck Number",
    "Frame Station", "Compartment", "Location",
  ],
  r2: [...LOCKED_COLS["r2"]],
  r3: [...LOCKED_COLS["r3"]],
  r4: [
    "Equipment Name", "Serial Number", "OEM", "Installation Date", "Deck No", "Compartment",
  ],
  r5: ["Equipment Name", "Equipment Code", "Deck No", "Compartment Name", "Qty Fitted"],
  r6: [...LOCKED_COLS["r6"]],
};

export const REPORTS: ReportDef[] = [
  {
    id: "r1",
    name: "Ship Equipment Configuration Report",
    iconName: "list",
    filters: [
      "Department", "Sub Department", "System", "Equipment", "Equipment Category",
      "OEM", "Supplier", "Approval Status", "Installation Date", "Removal Date",
    ],
    columns: [
      "Department", "Sub Department", "Equipment Name", "Equipment Type", "OEM",
      "Serial Number", "Qty Fitted", "Equipment Nomenclature", "Deck Number",
      "Frame Station", "Compartment", "Location",
      "Model", "Maintop ID", "Transaction Type", "Is System", "OEM Part No",
      "Installation Date", "Supplier Name", "Shelf Life", "Approval Status",
    ],
  },
  {
    id: "r2",
    name: "Transaction Report",
    iconName: "repeat",
    filters: ["SFD Category", "Equipment Name", "Transaction Type", "Date Range", "Department"],
    columns: [
      "Equipment Name", "Department", "SFD Category", "Transaction Type",
      "Serial No", "Transaction Date", "Status",
    ],
  },
  {
    id: "r3",
    name: "Removed Equipment Report",
    iconName: "archive",
    filters: ["Removal Date", "Removal Authority", "Status"],
    columns: [
      "Equipment Code", "Equipment Name", "Serial No", "Removal Date",
      "Removal Remark", "Removal Authority", "Installation Authority",
      "Status", "Is Sync",
    ],
  },
  {
    id: "r4",
    name: "Equipment Installation Report",
    iconName: "wrench",
    filters: ["Installation Date", "OEM", "Supplier"],
    columns: [
      "Equipment Name", "Serial Number", "OEM", "Supplier", "Installation Date",
      "Installation Authority", "Deck No", "Frame Station", "Compartment",
    ],
  },
  {
    id: "r5",
    name: "Equipment Location Report",
    iconName: "map-pin",
    filters: ["Compartment", "Location", "Qty Fitted"],
    columns: [
      "Equipment Name", "Equipment Code", "Deck No", "Frame Station", "Location",
      "Compartment Name", "Qty Fitted",
    ],
  },
  {
    id: "r6",
    name: "Approval Status Report",
    iconName: "circle-check-big",
    filters: ["Request Type", "Status", "Installation Date", "Removal Date", "Removal Authority"],
    columns: [
      "Equipment Code", "Equipment Name", "Serial No", "Request Type", "Status",
      "Installation Date", "RH at Installation", "Installation Remark",
      "Installation Authority", "Removal Date", "Removal Remark",
      "Removal Authority", "Is Sync",
    ],
  },
];

export const TRANSACTION_FIELD_BY_COLUMN: Record<string, string> = {
  "Equipment Name": "equipment_name",
  Department: "department",
  "SFD Category": "sfd_category",
  "Transaction Type": "transaction_type",
  "Serial No": "serial_no",
  "Transaction Date": "transaction_date",
  Status: "status",
};

export const TRANSACTION_COLUMN_BY_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(TRANSACTION_FIELD_BY_COLUMN).map(([column, field]) => [field, column]),
);

export const TRANSACTION_FILTER_PARAM: Record<string, string> = {
  "SFD Category": "sfd_category",
  "Equipment Name": "equipment_name",
  "Transaction Type": "transaction_type",
  Department: "department",
  "Date Range": "date_filter",
};

export const TRANSACTION_FILTER_OPTION_FIELD: Record<string, ReportFilterField> = {
  "SFD Category": "sfd_category",
  "Equipment Name": "equipment_name",
  "Transaction Type": "transaction_type",
  Department: "department",
};

export const INSTALLATION_FIELD_BY_COLUMN: Record<string, string> = {
  "Equipment Name": "equipment_name",
  "Serial Number": "serial_no",
  OEM: "oem",
  Supplier: "supplier",
  "Installation Date": "installation_date",
  "Installation Authority": "installation_authority",
  "Deck No": "deck_no",
  "Frame Station": "frame_station",
  Compartment: "compartment",
};

export const INSTALLATION_COLUMN_BY_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(INSTALLATION_FIELD_BY_COLUMN).map(([column, field]) => [field, column]),
);

export const INSTALLATION_FILTER_PARAM: Record<string, string> = {
  "Installation Date": "date_filter",
  OEM: "oem",
  Supplier: "supplier",
};

export const INSTALLATION_FILTER_OPTION_FIELD: Record<string, ReportFilterField> = {
  OEM: "oem",
  Supplier: "supplier",
};

export const LOCATION_FIELD_BY_COLUMN: Record<string, string> = {
  "Equipment Name": "equipment_name",
  "Equipment Code": "equipment_code",
  "Deck No": "deck_no",
  "Frame Station": "frame_station",
  Location: "location",
  "Compartment Name": "compartment",
  "Qty Fitted": "qty_fitted",
};

export const LOCATION_COLUMN_BY_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(LOCATION_FIELD_BY_COLUMN).map(([column, field]) => [field, column]),
);

export const LOCATION_FILTER_PARAM: Record<string, string> = {
  Compartment: "compartment",
  Location: "location",
  "Qty Fitted": "qty_fitted",
};

export const LOCATION_FILTER_OPTION_FIELD: Record<string, ReportFilterField> = {
  Compartment: "compartment",
  Location: "location",
  "Qty Fitted": "qty_fitted",
};

const DATE_RANGE_OPTIONS: FilterOption[] = [
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "this_year", label: "This year" },
  { value: "last_year", label: "Last year" },
];

/**
 * Static {value,label} dropdown options for filters with no equivalent
 * filter-options API field — just the shared date-range presets, since their
 * codes ("last_30_days", ...) must match the backend's date parser exactly.
 */
export const STATIC_FILTER_OPTIONS: Record<string, FilterOption[]> = {
  "Removal Date": DATE_RANGE_OPTIONS,
  "Installation Date": DATE_RANGE_OPTIONS,
  "Date Range": DATE_RANGE_OPTIONS,
};

export const REMOVED_FIELD_BY_COLUMN: Record<string, string> = {
  "Equipment Code": "equipment_code",
  "Equipment Name": "equipment_name",
  "Serial No": "serial_no",
  "Removal Date": "removal_date",
  "Removal Remark": "removal_remark",
  "Removal Authority": "removal_authority",
  "Installation Authority": "installation_authority",
  Status: "status",
  "Is Sync": "is_sync",
};

export const REMOVED_COLUMN_BY_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(REMOVED_FIELD_BY_COLUMN).map(([column, field]) => [field, column]),
);

export const REMOVED_FILTER_PARAM: Record<string, string> = {
  "Removal Date": "removal_date",
  "Removal Authority": "removed_authority",
  Status: "status",
};

/**
 * Removed Equipment Report filter name → filter-options API field. Note the
 * options registry key is "remove_authority" (no "d") while the list-query
 * param above is "removed_authority" (with a "d") — two different backend names.
 */
export const REMOVED_FILTER_OPTION_FIELD: Record<string, ReportFilterField> = {
  "Removal Authority": "remove_authority",
  Status: "remove_status",
};

export const APPROVAL_FIELD_BY_COLUMN: Record<string, string> = {
  ...REMOVED_FIELD_BY_COLUMN,
  "Request Type": "approval_request_type",
  "Installation Date": "install_date",
  "RH at Installation": "rh_at_installation",
  "Installation Remark": "installation_remark",
};

export const APPROVAL_COLUMN_BY_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(APPROVAL_FIELD_BY_COLUMN).map(([column, field]) => [field, column]),
);

export const APPROVAL_FILTER_PARAM: Record<string, string> = {
  "Request Type": "approval_request_type",
  "Installation Date": "install_date",
  "Removal Date": "removal_date",
  "Removal Authority": "removed_authority",
  Status: "status",
};

/** Approval Status Report filter name → filter-options API field (see note on REMOVED_FILTER_OPTION_FIELD). */
export const APPROVAL_FILTER_OPTION_FIELD: Record<string, ReportFilterField> = {
  "Removal Authority": "remove_authority",
  Status: "remove_status",
  "Request Type": "approval_request_type",
};

export const SHIP_EQUIPMENT_FIELD_BY_COLUMN: Record<string, string> = {
  Department: "department",
  "Sub Department": "sub_department",
  "Equipment Name": "equipment_name",
  "Equipment Type": "transaction_category",
  OEM: "manufacture",
  "Serial Number": "equipment_sr_no",
  "Qty Fitted": "qty_fitted",
  "Equipment Nomenclature": "equipment_nomenclature",
  "Deck Number": "deck_no",
  "Frame Station": "frame_station",
  Compartment: "compartment",
  Location: "location",
  Model: "equipment_model",
  "Maintop ID": "maintop_id",
  "Transaction Type": "transaction_type",
  "Is System": "is_system",
  "OEM Part No": "oem_part_no",
  "Installation Date": "installation_date",
  "Supplier Name": "supplier",
  "Shelf Life": "service_life",
  "Approval Status": "approval_status",
};

export const SHIP_EQUIPMENT_COLUMN_BY_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(SHIP_EQUIPMENT_FIELD_BY_COLUMN).map(([column, field]) => [field, column]),
);

export const SHIP_EQUIPMENT_FILTER_PARAM: Record<string, string> = {
  Department: "department",
  "Sub Department": "sub_department",
  System: "system",
  Equipment: "equipment_name",
  "Equipment Category": "transaction_category",
  OEM: "manufacture",
  Supplier: "supplier",
  "Approval Status": "approval_status",
  "Installation Date": "installation_date",
  "Removal Date": "removal_date",
};

export const SHIP_EQUIPMENT_FILTER_OPTION_FIELD: Record<string, ReportFilterField> = {
  Department: "department",
  "Sub Department": "sub_department",
  System: "system",
  Equipment: "equipment_name",
  "Equipment Category": "sfd_category",
  OEM: "oem",
  Supplier: "supplier",
  "Approval Status": "approval_status",
};
