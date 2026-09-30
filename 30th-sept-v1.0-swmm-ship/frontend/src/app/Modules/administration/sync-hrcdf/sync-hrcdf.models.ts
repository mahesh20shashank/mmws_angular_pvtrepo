// Developed with Understanding: typed shapes of the swmm HRCDF sync API (CP-C API Contract,
// Active\hrcdf-user-sync\Output\hrcdf-user-sync_CP-C-API-CONTRACT_v1_2026-09-24.md). Property
// names mirror the JSON exactly, in lower_snake_case, per doctrine 5.4. Nothing here is any.

// Developed with Understanding: HrcdfSyncJob.Mode values. units is the Get Ship Names job.
export type HrcdfSyncMode = "own" | "others" | "units";

// Developed with Understanding: the two roster modes POST runs/ accepts.
export type HrcdfRunMode = "own" | "others";

// Developed with Understanding: HrcdfSyncJob.Status values (CP-A OQ-A1).
export type HrcdfJobStatus = "queued" | "running" | "finished" | "failed";

// Developed with Understanding: the level of one process-log line.
export type HrcdfLogLevel = "info" | "record" | "warn" | "error" | "done";

// Developed with Understanding: the status filter of personnel/own/.
export type HrcdfOwnStatusFilter = "open" | "closed" | "all";

// Developed with Understanding: the per-run counters. Keys are the swmm STAT_KEYS
// (fetched, own_created, own_updated, own_unchanged, others_created, others_updated,
// others_unchanged, leavers, units_created, skipped, skipped_other_mode, failed). Read with
// bracket notation because noPropertyAccessFromIndexSignature is on.
export type HrcdfStats = Record<string, number>;

// Developed with Understanding: the home unit block of readiness/, units/ and home-unit/.
export interface HrcdfHomeUnit {
  id: number;
  code: string;
  name: string;
  hrcdf_unit_id: number | null;
  command_code: string | null;
  locked: boolean;
}

// Developed with Understanding: JobSummary of the contract, used by readiness last_runs and by
// the inline runs/ answer.
export interface HrcdfJobSummary {
  job_id: string;
  mode: HrcdfSyncMode;
  status: HrcdfJobStatus;
  started_at: string | null;
  finished_at: string | null;
  total: number | null;
  processed: number;
  stats: HrcdfStats;
  message: string;
  ran_inline: boolean;
}

// Developed with Understanding: readiness/ counts block.
export interface HrcdfReadinessCounts {
  own_ship: number;
  own_ship_open: number;
  other_units: number;
  units: number;
}

// Developed with Understanding: readiness/ last_runs block, one newest job per mode.
export interface HrcdfLastRuns {
  own: HrcdfJobSummary | null;
  others: HrcdfJobSummary | null;
  units: HrcdfJobSummary | null;
}

// Developed with Understanding: GET readiness/.
export interface HrcdfReadiness {
  configured: boolean;
  // Developed with Understanding: whether this server can reach the HRCDF host right now - null
  // when not configured. reachable_detail says why not, naming the host only.
  reachable: boolean | null;
  reachable_detail: string;
  // Developed with Understanding: true for the application admin only - shows Clear set ship name.
  can_clear_home_unit: boolean;
  host: string;
  users_path: string;
  running: boolean;
  active_job_id: string | null;
  home_unit: HrcdfHomeUnit | null;
  counts: HrcdfReadinessCounts;
  last_runs: HrcdfLastRuns;
}

// Developed with Understanding: one Command filter option of units/. code is
// MasterCommand.unit_name and name is command_name, either can be null in the table.
export interface HrcdfCommandOption {
  id: number;
  code: string | null;
  name: string | null;
}

// Developed with Understanding: one master.Unit row of units/.
export interface HrcdfUnit {
  id: number;
  code: string;
  name: string;
  hrcdf_unit_id: number | null;
  command_id: number | null;
  command_code: string | null;
  unit_type: string | null;
  record_origin: string | null;
}

// Developed with Understanding: GET units/.
export interface HrcdfUnitsResponse {
  commands: HrcdfCommandOption[];
  units: HrcdfUnit[];
  home_unit: HrcdfHomeUnit | null;
  hint: number | null;
}

// Developed with Understanding: POST home-unit/ request body.
export interface HrcdfHomeUnitRequest {
  unit_id: number;
}

// Developed with Understanding: POST home-unit/ success.
export interface HrcdfHomeUnitResponse {
  home_unit: HrcdfHomeUnit;
}

// Developed with Understanding: POST runs/ request body.
export interface HrcdfRunRequest {
  mode: HrcdfRunMode;
}

// Developed with Understanding: POST runs/ 202 - queued on the Celery worker
// (accepted_task_response plus job_id).
export interface HrcdfRunAccepted {
  status: "accepted";
  message: string;
  task_id: string;
  task_status_url: string;
  job_id: string;
}

// Developed with Understanding: POST runs/ 200 - ran inline because no worker answered
// (sync_task_response, OQ11). status is the job's final status.
export interface HrcdfRunInline {
  status: HrcdfJobStatus;
  message: string;
  job_id: string;
  summary: HrcdfJobSummary;
  background_fallback: true;
}

// Developed with Understanding: either answer of POST runs/, and of POST units/refresh/, which
// now starts a units job and answers exactly like runs/ (202 queued or 200 inline).
export type HrcdfRunResponse = HrcdfRunAccepted | HrcdfRunInline;

// Developed with Understanding: one process-log line of progress/.
export interface HrcdfProgressLine {
  seq: number;
  ts: string;
  level: HrcdfLogLevel;
  text: string;
}

// Developed with Understanding: GET runs/<job_id>/progress/. percent is null while the total
// is unknown. gap and truncated carry the IIMA since and limit semantics (R1 G1 step 13).
export interface HrcdfProgress {
  job_id: string;
  mode: HrcdfSyncMode;
  status: HrcdfJobStatus;
  started_at: string | null;
  finished_at: string | null;
  host: string;
  total: number | null;
  processed: number;
  pages: number;
  percent: number | null;
  stats: HrcdfStats;
  message: string;
  dropped: number;
  first_seq: number;
  last_seq: number;
  gap: boolean;
  truncated: boolean;
  lines: HrcdfProgressLine[];
}

// Developed with Understanding: one row of personnel/own/ or personnel/others/. unit_name is
// the section column. The own list carries auth_source, the others list record_origin, and on
// the others list user_active and ship_leaving_date are always null.
export interface HrcdfPersonnelRow {
  id: number;
  personal_number: string;
  full_name: string | null;
  rank_name: string | null;
  hrcdf_designation: string | null;
  designation: string | null;
  unit_name: string | null;
  unit_code: string | null;
  command_code: string | null;
  branch_name: string | null;
  user_type_name: string | null;
  hrcdf_is_active: boolean | null;
  user_active: boolean | null;
  ship_leaving_date: string | null;
  hrcdf_synced_at: string | null;
  auth_source?: string;
  record_origin?: string | null;
}

// Developed with Understanding: DRF PageNumberPagination envelope of both personnel lists.
export interface HrcdfPersonnelPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: HrcdfPersonnelRow[];
}

// Developed with Understanding: query of personnel/own/. Empty search is left off the URL.
export interface HrcdfOwnPersonnelQuery {
  page: number;
  page_size: number;
  search: string;
  status: HrcdfOwnStatusFilter;
}

// Developed with Understanding: query of personnel/others/. command and unit are codes and
// are left off the URL when empty.
export interface HrcdfOtherPersonnelQuery {
  page: number;
  page_size: number;
  search: string;
  command: string;
  unit: string;
}
