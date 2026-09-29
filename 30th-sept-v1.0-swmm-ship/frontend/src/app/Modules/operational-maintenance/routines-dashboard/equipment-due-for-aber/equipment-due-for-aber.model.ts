export interface EquipmentDueForAberResponse {
  result: EquipmentDueForAber[];
  nomenclatures: string[];
  compartments: string[];
}

export interface EquipmentDueForAber {
  pk: number;
  insma_code: string;
  nomenclature: string;
  compartment: string;
  installation_date: string;
  years_since: number;
  status: string;
}
