export interface GeneratedDl1ReportRow {
  id: number;
  ra_dl_name: string;
  dockyard_name: string;
  refit_type_name: string;
  total_dl_rows: number;
}

export interface GeneratedDl1ReportInnerRow {
  id: number;
  dl_no: string | null;
  ra_dl_name: string;
  dl_type: string;
  status: string;
  eq_name: string;
  description: string;
  routine_name: string;
}
