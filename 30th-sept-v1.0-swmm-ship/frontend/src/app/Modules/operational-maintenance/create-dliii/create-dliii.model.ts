export interface CreateDLDraftItem {
  /** The InitiateRADL draft row's own id — required for save_dl_rows/delete_dl_row. */
  id: number;
  dl_type: string;
  status: string;
  remarks: string | null;
  additional_remarks: string | null;
  dl_no: string | null;
  /** The originating defect's id — NOT the row id above. */
  dart_id: number;
  dart_number: string | null;
  dart_date: string | null;
  defect_closing_date: string | null;
  equipment: string | null;
  nomenclature: string | null;
  defective_discriptions: string | null;
}

export interface CreateDLRefitItem {
  id: number;
  name: string;
  actual_start_date: string | null;
  actual_end_date: string | null;
}

export interface ShipRemarkOption {
  id: number;
  description: string;
}

export interface CreateDLResponse {
  status: string;
  message: string;
  data: {
    draft_data: CreateDLDraftItem[];
    refit_list: CreateDLRefitItem[];
    ship_remarks_list: ShipRemarkOption[];
  };
}
