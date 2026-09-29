export interface Routine {
  pk: number;

  // Common Fields
  routine_name?: string;
  section?: string;
  equipment_name?: string;
  maintop_no?: string;

  // Calendar Based Routine Fields
  sub_department?: string;
  equipment_nomenclature?: string;
  routine_status?: string;
  total_ss_routines?: number;
  total_dyd_routines?: number;
  last_routine_completion_date?: string;
  next_due_date?: string;
  total_sub_routines?: number;

  // RH Based Routine Fields
  last_routine_running_hrs?: number;
  next_due_running_hrs?: number;
  total_running_hrs?: number;
  running_hrs_updated_tilldate?: string;
  running_hrs_available?: number;
  total_routines?: number;
  ss_routines?: number;
  dyd_routines?: number;
  last_routine_date?: string;
  remarks?: string;
}

export interface RoutineResponse {
  title: string;
  count: number;
  result: Routine[];
}
