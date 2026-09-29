export type PersonnelStatus = "Present" | "On Leave" | "Ty Duty";

export interface CrewPersonnel {
  id: number;
  pno: string;
  rank: string;
  firstName: string;
  lastName: string;
  department: string;
  designation?: string;
  status: PersonnelStatus;
  dateOfJoining?: string;
}

/** Row shape for the "Add Personnel — Ship's Company" modal — sourced from
 * `getAvailablePersonnel()` (`sailings/{id}/available_personnel/`), already department-scoped
 * to real data and already excluding anyone already on the sailing (unlike the generic
 * `CrewPersonnel` list `getPersonnel()` returns, which needs client-side filtering). */
export interface AvailablePersonnelRow {
  profileId: number;
  rank: string;
  name: string;
  pno: string;
  department: string;
  designation: string;
  status: PersonnelStatus;
}

export interface CrewDashboardCounts {
  total: number;
  present: number;
  onLeave: number;
  tyDuty: number;
}

export interface DeptStrength {
  department: string;
  total: number;
  present: number;
}

export interface WatchbillDashboardCounts {
  total: number;
  present: number;
  absent: number;
}

export interface WatchbillDashboardData {
  counts: WatchbillDashboardCounts;
  deptStrength: DeptStrength[];
  activeSailingsCount: number;
  completedSailingsCount: number;
}

export type LeaveType = "On Leave" | "Ty Duty";
export type ApplicationStatus = "Pending" | "Approved" | "Rejected";

/** Payload for `leave-applications/apply_on_behalf/` — an HOD/DY-HOD/CO applying leave or TY
 * duty for a selected member of their department. Auto-approved server-side. */
export interface ApplyOnBehalfPayload {
  personalNumber: string;
  leaveType: LeaveType;
  hasPrefix: boolean;
  prefixStartDate?: string;
  startDate: string;
  endDate: string;
  hasSuffix: boolean;
  suffixCompletionDate?: string;
  reportingDate?: string;
  station?: string;
  reason?: string;
  attachment?: File | null;
}

/** Payload for `POST personnel-status/update/` — direct status write for today (no
 * LeaveApplication record), used by the dashboard's "Present" status radio. */
export interface UpdatePersonnelStatusPayload {
  personalNumber: string;
  rank?: string;
  name?: string;
  department?: string;
  designation?: string;
  status: PersonnelStatus;
}

/** Response of `GET leave-applications/check_conflict/?personal_number=...` — whether marking
 * this person Present today would shorten an active Approved leave. */
export interface LeaveConflictCheck {
  hasConflict: boolean;
  applicationId?: number;
  leaveType?: LeaveType;
  startDate?: string;
  endDate?: string;
  newEndDate?: string;
  currentStatus?: string;
}

/** Row shape of `GET leave-forecast/logs/` — a real recorded `PersonnelStatusLog` entry (what a
 * person's status actually was on a past date), used by the forecast calendar to colour already-
 * elapsed days from ground truth rather than from the (possibly stale) application date range. */
export interface PersonnelStatusLogRow {
  personnelNumber: string;
  department: string;
  status: string;
  logDate: string;
}

export interface LeaveApplication {
  id: number;
  personalNumber: string;
  name: string;
  rank: string;
  department?: string;
  leaveType: LeaveType;
  hasPrefix: boolean;
  prefixStartDate?: string;
  startDate: string;
  endDate: string;
  hasSuffix: boolean;
  suffixCompletionDate?: string;
  reportingDate?: string;
  noOfDays: number;
  station?: string;
  reason?: string;
  applicationStatus: ApplicationStatus;
  rejectionReason?: string;
  appliedAt: string;
}

export type PersonType = "civilian" | "officer" | "fleet_officer" | "fleet_staff" | "fleet_commander" | "sailor";

export interface Civilian {
  id: number;
  name: string;
  role: string;
  personType: PersonType;
  desig?: string;
  rank?: string;
  serviceNo?: string;
  fleet?: string;
  ship?: string;
  refId?: string;
  contact?: string;
  remarks?: string;
}

export interface RankOption {
  id: number;
  name: string;
}

export type SailorClass = "Junior" | "Senior";

export interface RankClassification {
  id: number;
  rankName: string;
  classification: SailorClass;
}

export type SailingStatus = "active" | "completed";

export interface SailingSummary {
  id: number;
  name: string;
  area?: string;
  start: string;
  co?: string;
  status: SailingStatus;
  completedAt?: string;
  personnelCount: number;
  civilianCount: number;
}

export interface SailingAssignmentRow {
  /** The `SailingPersonnel` row's own id — required to PATCH/DELETE
   * `sailings/personnel/{id}/` (removal is keyed by this, not by `pno`). */
  id: number;
  pno: string;
  name: string;
  rank: string;
  dept: string;
  w3?: string;
  w2?: string;
  action?: string;
  defence?: string;
  cruising?: string;
  shelter?: string;
  emergency?: string;
  lifeRaft?: string;
  mess?: string;
  bloodGroup?: string;
  ssd?: string;
  messStn?: string;
  section?: string;
  remarks?: string;
}

export interface SailingDetail extends SailingSummary {
  departments: Record<string, SailingAssignmentRow[]>;
}

export type MasterType = "action" | "defence" | "cruising" | "shelter" | "emergency";

export interface MasterEntry {
  id: number;
  name: string;
}
