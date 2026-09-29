export interface RegulatorSummary {
  id: number;
  name: string;
  rank: string | null;
  designation: string;
  assignedCount: number;
  sub_department_id?: number | null;
  sub_department_name?: string | null;
}

export interface SubDepartmentRegulators {
  id: number;
  name?: string;
  subdep_name?: string;
  code?: string | null;
  description?: string | null;
  regulators: RegulatorSummary[];
  expanded?: boolean;
}

export interface DepartmentRegulators {
  id: number;
  dep_name?: string;
  name?: string;
  code?: string;
  dep_code?: string | null;
  regulators: RegulatorSummary[];
  subdepartments?: SubDepartmentRegulators[];
  expanded?: boolean;
}

export interface RegulatorsTreeResponse {
  status: string;
  departments: DepartmentRegulators[];
}

export interface RegulatorSailor {
  id: number;
  name: string;
  rank: string;
  designation: string;
  personalNumber: string;
}

export interface RegulatorSailorsResponse {
  status: string;
  regulator: { id: number; name: string };
  assigned: RegulatorSailor[];
  unassigned: RegulatorSailor[];
}

export interface RankOption {
  id: number;
  name: string;
}

export interface CreateRegulatorPayload {
  firstname: string;
  lastname: string;
  designation: string;
  personal_number: string;
  department_id: number;
  executive_sub_department: string;
  rank_id: number;
}

export interface UpdateRegulatorProfilePayload {
  node_db_id: number;
  rank_id: number;
  personal_number: string;
  firstname: string;
  lastname: string;
  designation: string;
  department_id: number;
  executive_sub_department: string;
}
