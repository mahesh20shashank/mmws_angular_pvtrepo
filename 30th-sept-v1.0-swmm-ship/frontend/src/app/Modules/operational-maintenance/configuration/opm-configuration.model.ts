export interface ShipRemarkMasterApi {
  id: number;
  remark: string;
  raised_by: string;
  used_on: string;
}

export interface CertificateTypeMasterApi {
  id: number;
  certificate: string;
  meaning: string;
}

export interface RepairAgencyMasterApi {
  id: number;
  agency: string;
  description: string;
  location: string;
  agency_type: string;
}

export interface AssistanceMasterApi {
  id: number;
  assistance: string;
  description: string;
  department: number | null;
  department_name: string | null;
  department_code: string | null;
}

export interface ReasonMasterApi {
  id: number;
  repair_agency_name: string;
  sub_types: string[];
  drives: string[];
}

export interface SeverityMasterApi {
  id: number;
  severity_code: string;
  description: string;
  colour: string;
}

export interface ServicesMasterApi {
  id: number;
  service: string;
  service_type: string;
  requires_equipment: string;
}
