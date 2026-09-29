export type SyncKey =
  | "cmms"
  | "maintop"
  | "routine"
  | "missingRoutine"
  | "defect";

export type LogTone = "success" | "update" | "skipped" | "error" | "info";

export interface LogLine {
  text: string;
  tone: LogTone;
}

export interface SyncCardConfig {
  key: SyncKey;
  step: number;
  title: string;
  color: string;
  endpoint: string | null;
}

/** One-line record tally for a step that has finished, shown above the progress bar. */
export interface StepSummary {
  key: SyncKey;
  step: number;
  title: string;
  color: string;
  /** Null when the step's log never reported a fetch count. */
  fetched: number | null;
  saved: number | null;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  durationMs: number;
  failed: boolean;
  /** Rendered one-liner, e.g. "295 fetched · 120 new · 175 updated in 12.4s". */
  text: string;
}

/** STEP 0 — Nomenclature Synchronization ship directory. */
export interface ShipDirectoryCommand {
  command_id: number;
  universal_id_m_command: string | null;
  command_name: string | null;
  command_code: string | null;
}

export interface ShipDirectoryShip {
  id: number;
  universal_id_m_ship: string;
  name: string;
  code: string | null;
  universal_id_m_command: string | null;
}

export interface ShipDirectorySelection {
  id: number;
  universal_id_m_ship: string;
  name: string;
  code?: string | null;
  universal_id_m_command: string | null;
}

export interface ShipDirectoryOptionsResponse {
  commands: ShipDirectoryCommand[];
  ships: ShipDirectoryShip[];
  selected_ship: ShipDirectorySelection | null;
}

export interface ShipDirectoryPullResult {
  status: boolean;
  message: string;
  commands: { total: number; inserted: number; updated: number };
  ships: { total: number; inserted: number; updated: number };
}

export interface SelectActiveShipResult {
  status: boolean;
  message: string;
  selected_ship: ShipDirectorySelection | null;
}

/** Gate for Step 2 — CMMS only supplies a sub department for some of the equipment Step 1
 *  pulls in, so Step 2 stays locked until every Active equipment has one. */
export interface SubDepartmentReadiness {
  status: boolean;
  ready: boolean;
  unassigned_total: number;
  by_department: { department: string; unassigned: number }[];
}
