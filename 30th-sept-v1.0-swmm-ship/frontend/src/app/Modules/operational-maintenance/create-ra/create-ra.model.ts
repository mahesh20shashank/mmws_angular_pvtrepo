export interface CreateRADefectData {
  id: number;
  opra_no: string | null;
  dart_number: string | null;
  dart_date: string | null;
  rectification_date: string | null;
  status: 'Open' | 'Closed';
  equipment: string | null;
  defective_discriptions: string | null;
}

export interface CreateRAResponse {
  status: string;
  message: string;
  data: CreateRADefectData[];
}
