import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, forkJoin } from "rxjs";
import { map } from "rxjs/operators";

import { resolveCmmsApiUrl } from "../../../../environments/api-url";
import {
  ApplicationStatus,
  ApplyOnBehalfPayload,
  AvailablePersonnelRow,
  Civilian,
  CrewDashboardCounts,
  CrewPersonnel,
  LeaveApplication,
  LeaveConflictCheck,
  LeaveType,
  MasterEntry,
  MasterType,
  PersonType,
  PersonnelStatus,
  PersonnelStatusLogRow,
  RankClassification,
  RankOption,
  SailingAssignmentRow,
  SailingDetail,
  SailingStatus,
  SailingSummary,
  SailorClass,
  UpdatePersonnelStatusPayload,
  WatchbillDashboardData,
} from "../models/crew.model";
import {
  BackendAvailablePersonnelResponse,
  BackendAvailablePersonnelRow,
  BackendCivilian,
  BackendLeaveApplication,
  BackendLeaveApplyShortcutResponse,
  BackendLeaveConflictCheck,
  BackendLeaveForecastApplicationsResponse,
  BackendLeaveForecastApplicationRow,
  BackendLeaveForecastLogsResponse,
  BackendPersonnelStatusCountsResponse,
  BackendPersonnelStatusListResponse,
  BackendPersonnelStatusRow,
  BackendRank,
  BackendRankClassification,
  BackendSailing,
  BackendSailingAssignmentsResponse,
  BackendSailingCreateResponse,
  BackendSailingDetail,
  BackendSailingListResponse,
  BackendStationMaster,
  BackendTruncateLeaveResponse,
  BackendUpdatePersonnelStatusResponse,
  BackendWatchbillDashboard,
} from "../models/crew-backend.model";

const MASTER_URL_SEGMENT: Record<MasterType, string> = {
  action: "action-stations",
  defence: "defence-stations",
  cruising: "cruising-stations",
  shelter: "shelter-stations",
  emergency: "emergency-stations",
};

/**
 * Ship Crew API — talks to `backend/crew_manage` (`api/v1/crew-management/...`).
 *
 * Like the other 4 modules integrated this session, backend serializers here are largely
 * snake_case `ModelSerializer` output, but several of the screens this service backs
 * (dashboard, personnel status, the sailing detail view) are hand-built dict responses rather
 * than plain model serialization — each method's adapter matches whatever shape its specific
 * backend action actually returns. A couple of methods have no working backend endpoint yet
 * (`BACKEND GAP` comments); those return the closest honest approximation of real data rather
 * than silently faking success.
 */
@Injectable({ providedIn: "root" })
export class CrewApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${resolveCmmsApiUrl()}api/v1/crew-management/`;

  // ---------------------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------------------

  /** `personnel-status/counts/` is a distinct endpoint (not a `?counts=true` query param on
   * the plain list, which just ignores unknown params and returns the full row list). */
  getDashboardCounts(): Observable<CrewDashboardCounts> {
    return this.http.get<BackendPersonnelStatusCountsResponse>(`${this.baseUrl}personnel-status/counts/`).pipe(
      map((response) => ({
        total: response.total,
        present: response.present,
        onLeave: response.on_leave,
        tyDuty: response.ty_duty,
      })),
    );
  }

  getPersonnel(): Observable<CrewPersonnel[]> {
    return this.http
      .get<BackendPersonnelStatusListResponse>(`${this.baseUrl}personnel-status/`)
      .pipe(map((response) => response.data.map((row) => this.adaptPersonnel(row))));
  }

  /** Direct status write for today (no LeaveApplication record) — `personnel-status/update/`,
   * used by the dashboard grid's "Present" status radio. */
  updatePersonnelStatus(payload: UpdatePersonnelStatusPayload): Observable<void> {
    return this.http
      .post<BackendUpdatePersonnelStatusResponse>(`${this.baseUrl}personnel-status/update/`, {
        personal_number: payload.personalNumber,
        rank: payload.rank ?? "",
        name: payload.name ?? "",
        department: payload.department ?? "",
        designation: payload.designation ?? "",
        status: payload.status,
      })
      .pipe(map(() => void 0));
  }

  /** Whether marking `personalNumber` Present today would shorten an active Approved leave —
   * `leave-applications/check_conflict/`. */
  checkLeaveConflict(personalNumber: string): Observable<LeaveConflictCheck> {
    return this.http
      .get<BackendLeaveConflictCheck>(`${this.baseUrl}leave-applications/check_conflict/`, {
        params: { personal_number: personalNumber },
      })
      .pipe(
        map((row) => ({
          hasConflict: row.has_conflict,
          applicationId: row.application_id,
          leaveType: row.leave_type as LeaveType | undefined,
          startDate: row.start_date,
          endDate: row.end_date,
          newEndDate: row.new_end_date,
          currentStatus: row.current_status,
        })),
      );
  }

  /** Shortens an active leave's end date — `leave-applications/{id}/truncate/`. */
  truncateLeave(applicationId: number, newEndDate: string): Observable<void> {
    return this.http
      .post<BackendTruncateLeaveResponse>(`${this.baseUrl}leave-applications/${applicationId}/truncate/`, {
        new_end_date: newEndDate,
      })
      .pipe(map(() => void 0));
  }

  /** "Add Personnel — Ship's Company" modal — real per-sailing available-personnel endpoint
   * (already excludes anyone already on the sailing, unlike `getPersonnel()`'s generic list).
   * Civilian rows are dropped here — the modal is ship's-company only; civilians/embarked
   * officers go through `getCivilians()` and their own Add flows. */
  getAvailablePersonnel(sailingId: number): Observable<AvailablePersonnelRow[]> {
    return this.http
      .get<BackendAvailablePersonnelResponse>(`${this.baseUrl}sailings/${sailingId}/available_personnel/`)
      .pipe(
        map((response) =>
          response.available
            .filter((row): row is BackendAvailablePersonnelRow & { profile_id: number } =>
              row.source === "personnel" && row.profile_id != null,
            )
            .map((row) => ({
              profileId: row.profile_id,
              rank: row.rank,
              name: row.name,
              pno: row.pno,
              department: row.dept,
              designation: row.desig,
              status: (row.status as PersonnelStatus) || "Present",
            })),
        ),
      );
  }

  /** Single-call replacement for the Watch & Station Bill dashboard tab — combines what used
   * to be 4 separate requests (counts, dept strength, active sailings, completed sailings)
   * into the one hand-built `watchbill/dashboard/` response. */
  getWatchbillDashboard(): Observable<WatchbillDashboardData> {
    return this.http
      .get<BackendWatchbillDashboard>(`${this.baseUrl}watchbill/dashboard/`)
      .pipe(
        map((response) => ({
          counts: {
            total: response.total,
            present: response.present,
            absent: response.absent,
          },
          deptStrength: response.dept_strength.map((row) => ({
            department: row.dept,
            total: row.total,
            present: row.present,
          })),
          activeSailingsCount: response.active_sailings_count,
          completedSailingsCount: response.completed_sailings_count,
        })),
      );
  }

  // ---------------------------------------------------------------------------------------
  // Leave / TY Duty applications
  // ---------------------------------------------------------------------------------------

  /** `LeaveApplicationViewSet.get_queryset()` always scopes the plain `list` action to the
   * caller's own applications server-side (no query param needed) and returns a bare array —
   * this project has no DRF pagination class configured, so there's no `{results: [...]}`
   * envelope to unwrap. */
  getMyApplications(): Observable<LeaveApplication[]> {
    return this.http
      .get<BackendLeaveApplication[]>(`${this.baseUrl}leave-applications/`)
      .pipe(map((rows) => rows.map((row) => this.adaptLeaveApplication(row))));
  }

  /** `status` mirrors the `pending/` action's own query param (defaults server-side to
   * "Pending"; also accepts "Approved" | "Rejected" | "all"). */
  getPendingApplications(status?: ApplicationStatus | "all"): Observable<LeaveApplication[]> {
    return this.http
      .get<BackendLeaveApplication[]>(`${this.baseUrl}leave-applications/pending/`, {
        params: status ? { status } : {},
      })
      .pipe(map((rows) => rows.map((row) => this.adaptLeaveApplication(row))));
  }

  /** HOD/DY-HOD/CO applying leave or TY duty on behalf of a selected department member —
   * `leave-applications/apply_on_behalf/`. Auto-approved server-side. Multipart because the
   * backend accepts an optional file attachment. */
  applyLeaveOnBehalf(payload: ApplyOnBehalfPayload): Observable<{ applicationId: number; noOfDays: number }> {
    const form = new FormData();
    form.append("personal_number", payload.personalNumber);
    form.append("leave_type", payload.leaveType);
    form.append("start_date", payload.startDate);
    form.append("end_date", payload.endDate);
    form.append("has_prefix", String(payload.hasPrefix));
    if (payload.hasPrefix && payload.prefixStartDate) form.append("prefix_start_date", payload.prefixStartDate);
    if (payload.hasSuffix && payload.suffixCompletionDate) {
      form.append("suffix_completion_date", payload.suffixCompletionDate);
    }
    if (payload.reportingDate) form.append("reporting_date", payload.reportingDate);
    form.append("station", payload.station ?? "");
    form.append("reason", payload.reason ?? "");
    if (payload.attachment) form.append("attachment", payload.attachment);

    return this.http
      .post<BackendLeaveApplyShortcutResponse>(`${this.baseUrl}leave-applications/apply_on_behalf/`, form)
      .pipe(map((response) => ({ applicationId: response.application_id, noOfDays: response.no_of_days })));
  }

  applyLeave(payload: Omit<LeaveApplication, "id" | "applicationStatus" | "appliedAt">): Observable<LeaveApplication> {
    const body = {
      personal_number: payload.personalNumber,
      rank: payload.rank,
      name: payload.name,
      department: payload.department ?? "",
      leave_type: payload.leaveType,
      has_prefix: payload.hasPrefix,
      prefix_start_date: payload.prefixStartDate,
      start_date: payload.startDate,
      end_date: payload.endDate,
      suffix_completion_date: payload.suffixCompletionDate,
      reporting_date: payload.reportingDate,
      station: payload.station ?? "",
      reason: payload.reason ?? "",
    };
    return this.http
      .post<BackendLeaveApplication | BackendLeaveApplyShortcutResponse>(`${this.baseUrl}leave-applications/`, body)
      .pipe(
        map((response) => {
          if ("personal_number" in response) return this.adaptLeaveApplication(response);
          // The privileged/direct-approve shortcut path (LeaveApplicationViewSet.create) returns
          // {status, message, no_of_days, application_id} instead of the full serializer object.
          return {
            ...payload,
            id: response.application_id,
            noOfDays: response.no_of_days,
            applicationStatus: "Approved" as ApplicationStatus,
            appliedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
          };
        }),
      );
  }

  updateLeaveDates(id: number, _startDate: string, endDate: string): Observable<void> {
    // `LeaveApplicationViewSet.update()` only special-cases truncating end_date (shrinking it) —
    // it does not support changing start_date. `_startDate` is accepted to match the existing
    // call sites but has no backend effect.
    return this.http
      .patch(`${this.baseUrl}leave-applications/${id}/`, { new_end_date: endDate })
      .pipe(map(() => void 0));
  }

  deleteLeaveApplication(id: number): Observable<void> {
    return this.http.delete(`${this.baseUrl}leave-applications/${id}/`).pipe(map(() => void 0));
  }

  actionLeave(id: number, action: "Approved" | "Rejected", rejectionReason?: string): Observable<void> {
    return this.http
      .post(`${this.baseUrl}leave-applications/${id}/action/`, { action, rejection_reason: rejectionReason ?? "" })
      .pipe(map(() => void 0));
  }

  /** `leave-applications/` (used elsewhere in this service) is always scoped server-side to the
   * caller's own applications — unusable for a ship/department-wide Dashboard, Forecast calendar
   * or History view. `leave-forecast/applications/` is the real unscoped source (every status:
   * Pending/Approved/Rejected) for a given date window — callers decide what, if anything, to
   * filter by status themselves. */
  getForecastApplications(startIso: string, endIso: string): Observable<LeaveApplication[]> {
    return this.http
      .get<BackendLeaveForecastApplicationsResponse>(`${this.baseUrl}leave-forecast/applications/`, {
        params: { start: startIso, end: endIso },
      })
      .pipe(map((response) => response.data.map((row) => this.adaptForecastApplication(row))));
  }

  /** `leave-forecast/logs/` — actual `PersonnelStatusLog` rows (what a person's status really
   * was on a given past date), distinct from `LeaveApplication` rows (what was applied for). The
   * forecast calendar layers these on top of applications so a day that already happened reflects
   * reality even if e.g. the underlying application was later truncated. */
  getForecastLogs(startIso: string, endIso: string): Observable<PersonnelStatusLogRow[]> {
    return this.http
      .get<BackendLeaveForecastLogsResponse>(`${this.baseUrl}leave-forecast/logs/`, {
        params: { start: startIso, end: endIso },
      })
      .pipe(
        map((response) =>
          response.data.map((row) => ({
            personnelNumber: row.personnel_number,
            department: row.department,
            status: row.status,
            logDate: row.log_date,
          })),
        ),
      );
  }

  // ---------------------------------------------------------------------------------------
  // Civilian / Officer pool
  // ---------------------------------------------------------------------------------------

  getCivilians(): Observable<Civilian[]> {
    return this.http
      .get<BackendCivilian[]>(`${this.baseUrl}civilians/`)
      .pipe(map((rows) => rows.map((row) => this.adaptCivilian(row))));
  }

  addCivilian(payload: Omit<Civilian, "id">): Observable<Civilian> {
    const body = {
      name_snapshot: payload.name,
      // CivilianOfficial.role is a fixed-choice field (Barber/CIV Bearer/.../Other) that only
      // has real meaning for personType "civilian" — every other type sends "Other" here and
      // carries its actual appointment/trade text in desig_snapshot instead.
      role: payload.personType === "civilian" ? payload.role : "Other",
      person_type: payload.personType,
      desig_snapshot: payload.desig ?? "",
      rank_snapshot: payload.rank ?? "",
      service_no: payload.serviceNo ?? "",
      fleet: payload.fleet ?? "",
      ship: payload.ship ?? "",
      ref_id: payload.refId ?? "",
      contact: payload.contact ?? "",
      remarks: payload.remarks ?? "",
    };
    return this.http
      .post<BackendCivilian>(`${this.baseUrl}civilians/`, body)
      .pipe(map((row) => this.adaptCivilian(row)));
  }

  removeCivilian(id: number): Observable<void> {
    // CivilianOfficialViewSet.destroy() is a soft-delete (is_active=False) server-side.
    return this.http.delete(`${this.baseUrl}civilians/${id}/`).pipe(map(() => void 0));
  }

  // ---------------------------------------------------------------------------------------
  // Ranks (shared master, owned by the `users` app) + Junior/Senior Sailor Classification
  // ---------------------------------------------------------------------------------------

  getRanks(): Observable<RankOption[]> {
    return this.http
      .get<BackendRank[]>(`${resolveCmmsApiUrl()}api/v1/accounts/ranks/`)
      .pipe(map((rows) => rows.map((row) => ({ id: row.id, name: row.name }))));
  }

  getRankClassifications(): Observable<RankClassification[]> {
    return this.http
      .get<BackendRankClassification[]>(`${this.baseUrl}rank-classifications/`)
      .pipe(map((rows) => rows.map((row) => this.adaptRankClassification(row))));
  }

  addRankClassification(rankName: string, classification: SailorClass): Observable<RankClassification> {
    return this.http
      .post<BackendRankClassification>(`${this.baseUrl}rank-classifications/`, {
        rank_name: rankName,
        classification,
      })
      .pipe(map((row) => this.adaptRankClassification(row)));
  }

  deleteRankClassification(id: number): Observable<void> {
    return this.http.delete(`${this.baseUrl}rank-classifications/${id}/`).pipe(map(() => void 0));
  }

  // ---------------------------------------------------------------------------------------
  // Watch & Station Bill — Sailings
  // ---------------------------------------------------------------------------------------

  getSailings(): Observable<SailingSummary[]> {
    return this.getSailingsByStatus("active");
  }

  getHistorySailings(): Observable<SailingSummary[]> {
    return this.getSailingsByStatus("completed");
  }

  /** `sailings/` wraps its list as `{sailings: [...]}` (not a bare array) — and
   * `SailingListSerializer` already includes `personnel_count` per row, so no separate
   * aggregate call is needed. */
  private getSailingsByStatus(status: SailingStatus): Observable<SailingSummary[]> {
    return this.http
      .get<BackendSailingListResponse>(`${this.baseUrl}sailings/`, { params: { status } })
      .pipe(map((response) => response.sailings.map((row) => this.adaptSailingSummary(row))));
  }

  /** Assignments are a `SailingViewSet` sub-action (`sailings/{id}/assignments/`, GET to read /
   * POST to save) — not the standalone `personnel-assignments/` collection this previously
   * (incorrectly) targeted, which doesn't exist as a route at all. */
  getSailingDetail(id: number): Observable<SailingDetail | null> {
    return forkJoin({
      sailing: this.http.get<BackendSailingDetail>(`${this.baseUrl}sailings/${id}/`),
      assignments: this.http.get<BackendSailingAssignmentsResponse>(`${this.baseUrl}sailings/${id}/assignments/`),
    }).pipe(map(({ sailing, assignments }) => this.adaptSailingDetail(sailing, assignments)));
  }

  createSailing(payload: {
    name: string;
    area?: string;
    start: string;
    startTime: string;
    co?: string;
    copyFromSailingId?: number | null;
  }): Observable<SailingSummary & { copiedPersonnel: number; copiedAssignments: number }> {
    return this.http
      .post<BackendSailingCreateResponse>(`${this.baseUrl}sailings/`, {
        name: payload.name,
        area: payload.area ?? "",
        start: payload.start,
        start_time: payload.startTime,
        co: payload.co ?? "",
        copy_from_sailing_id: payload.copyFromSailingId ?? null,
      })
      .pipe(
        map((response) => ({
          id: response.id,
          name: payload.name,
          area: payload.area,
          start: payload.start,
          co: payload.co,
          status: "active" as SailingStatus,
          personnelCount: response.personnel_count,
          civilianCount: 0,
          copiedPersonnel: response.copied_personnel,
          copiedAssignments: response.copied_assignments,
        })),
      );
  }

  /** `SailingViewSet` only allows GET/POST/DELETE (no PATCH) — completing a sailing is its own
   * action endpoint, `sailings/{id}/complete/`, not a partial update of the sailing itself. */
  completeSailing(id: number, completedAt: string): Observable<void> {
    return this.http
      .post(`${this.baseUrl}sailings/${id}/complete/`, { completed_date: completedAt })
      .pipe(map(() => void 0));
  }

  deleteSailing(id: number): Observable<void> {
    // SailingViewSet.destroy() 403s unless the sailing is still "active".
    return this.http.delete(`${this.baseUrl}sailings/${id}/`).pipe(map(() => void 0));
  }

  addPersonnelToSailing(sailingId: number, personnelIds: number[]): Observable<void> {
    return this.http
      .post(`${this.baseUrl}sailings/${sailingId}/add_personnel/`, { personnel_ids: personnelIds })
      .pipe(map(() => void 0));
  }

  /** Removal is `DELETE sailings/personnel/{id}/`, keyed by the `SailingPersonnel` row's own id
   * (not the sailing id + a pno identifier — there is no such action on `SailingViewSet`). */
  removePersonnelFromSailing(sailingPersonnelId: number): Observable<void> {
    return this.http.delete(`${this.baseUrl}sailings/personnel/${sailingPersonnelId}/`).pipe(map(() => void 0));
  }

  saveAssignments(sailingId: number, rows: SailingAssignmentRow[]): Observable<{ updated: number }> {
    const body = {
      rows: rows.map((row) => ({
        pno: row.pno,
        name: row.name,
        rank: row.rank,
        dept: row.dept,
        w3: row.w3 ?? "",
        w2: row.w2 ?? "",
        action: row.action ?? "",
        defence: row.defence ?? "",
        cruising: row.cruising ?? "",
        shelter: row.shelter ?? "",
        emergency: row.emergency ?? "",
        lr: row.lifeRaft ?? "",
        mess: row.mess ?? "",
        blood_group: row.bloodGroup ?? "",
        ssd: row.ssd ?? "",
        mess_stn: row.messStn ?? "",
        section: row.section ?? "",
        remarks: row.remarks ?? "",
      })),
    };
    return this.http
      .post<{ status: string; updated: number }>(`${this.baseUrl}sailings/${sailingId}/assignments/`, body)
      .pipe(map((response) => ({ updated: response.updated })));
  }

  getSailingAssignmentRows(sailingId: number): Observable<SailingAssignmentRow[]> {
    return this.getSailingDetail(sailingId).pipe(
      map((detail) => (detail ? Object.values(detail.departments).flat() : [])),
    );
  }

  // ---------------------------------------------------------------------------------------
  // Watch & Station Bill — Masters (Action/Defence/Cruising/Shelter/Emergency)
  // ---------------------------------------------------------------------------------------

  getMasterList(type: MasterType): Observable<MasterEntry[]> {
    return this.http.get<BackendStationMaster[]>(`${this.baseUrl}${MASTER_URL_SEGMENT[type]}/`);
  }

  addMasterEntry(type: MasterType, name: string): Observable<MasterEntry> {
    return this.http.post<BackendStationMaster>(`${this.baseUrl}${MASTER_URL_SEGMENT[type]}/`, { name });
  }

  deleteMasterEntry(type: MasterType, id: number): Observable<void> {
    return this.http.delete(`${this.baseUrl}${MASTER_URL_SEGMENT[type]}/${id}/`).pipe(map(() => void 0));
  }

  // ---------------------------------------------------------------------------------------
  // Adapters
  // ---------------------------------------------------------------------------------------

  private adaptPersonnel(row: BackendPersonnelStatusRow): CrewPersonnel {
    return {
      id: row.id,
      pno: row.personal_number,
      rank: row.rank ?? "",
      firstName: row.firstname,
      lastName: row.lastname,
      department: row.department ?? "",
      designation: row.designation || undefined,
      status: (row.status as PersonnelStatus) || "Present",
    };
  }

  private adaptLeaveApplication(row: BackendLeaveApplication): LeaveApplication {
    return {
      id: row.id,
      personalNumber: row.personal_number,
      name: row.name,
      rank: row.rank,
      department: row.department || undefined,
      leaveType: row.leave_type as LeaveType,
      hasPrefix: row.has_prefix,
      prefixStartDate: row.prefix_start_date ?? undefined,
      startDate: row.start_date,
      endDate: row.end_date,
      // LeaveApplication has no has_suffix flag of its own — inferred from whether a suffix
      // completion date was recorded.
      hasSuffix: !!row.suffix_completion_date,
      suffixCompletionDate: row.suffix_completion_date ?? undefined,
      reportingDate: row.reporting_date ?? undefined,
      noOfDays: row.no_of_days,
      station: row.station || undefined,
      reason: row.reason || undefined,
      applicationStatus: row.application_status as ApplicationStatus,
      rejectionReason: row.rejection_reason || undefined,
      appliedAt: row.applied_at,
    };
  }

  /** `remark` on this row is a distinct model field from `rejection_reason` (the endpoint
   * doesn't return the latter) — left unmapped rather than misattributed. */
  private adaptForecastApplication(row: BackendLeaveForecastApplicationRow): LeaveApplication {
    return {
      id: row.id,
      personalNumber: row.personal_number,
      name: row.name,
      rank: row.rank,
      department: row.department || undefined,
      leaveType: row.leave_type as LeaveType,
      hasPrefix: row.has_prefix,
      prefixStartDate: row.prefix_start_date || undefined,
      startDate: row.start_date,
      endDate: row.end_date,
      hasSuffix: !!row.suffix_completion_date,
      suffixCompletionDate: row.suffix_completion_date || undefined,
      reportingDate: undefined,
      noOfDays: row.no_of_days,
      station: row.station || undefined,
      reason: row.reason || undefined,
      applicationStatus: row.application_status as ApplicationStatus,
      rejectionReason: undefined,
      appliedAt: row.applied_at,
    };
  }

  private adaptCivilian(row: BackendCivilian): Civilian {
    return {
      id: row.id,
      name: row.name_snapshot,
      role: row.role,
      personType: (row.person_type as PersonType) || "civilian",
      desig: row.desig_snapshot || undefined,
      rank: row.rank_snapshot || undefined,
      serviceNo: row.service_no || undefined,
      fleet: row.fleet || undefined,
      ship: row.ship || undefined,
      refId: row.ref_id || undefined,
      contact: row.contact || undefined,
      remarks: row.remarks || undefined,
    };
  }

  private adaptRankClassification(row: BackendRankClassification): RankClassification {
    return {
      id: row.id,
      rankName: row.rank_name,
      classification: row.classification === "Senior" ? "Senior" : "Junior",
    };
  }

  private adaptSailingSummary(row: BackendSailing): SailingSummary {
    return {
      id: row.id,
      name: row.name,
      area: row.area || undefined,
      start: row.start ? row.start.slice(0, 10) : "",
      co: row.co || undefined,
      status: row.status,
      completedAt: row.completed_at ?? undefined,
      personnelCount: row.personnel_count,
      // The list row (SailingListSerializer) carries no civilian count — only the sailing
      // detail endpoint resolves individual civilian records.
      civilianCount: 0,
    };
  }

  private adaptSailingDetail(
    sailing: BackendSailingDetail,
    assignments: BackendSailingAssignmentsResponse,
  ): SailingDetail {
    const departments: Record<string, SailingAssignmentRow[]> = {};
    for (const row of assignments.personnel) {
      const dept = row.dept || "Unassigned";
      const list = departments[dept] ?? (departments[dept] = []);
      list.push({
        id: row.id,
        pno: row.pno,
        name: row.name,
        rank: row.rank,
        dept: row.dept,
        w3: row.w3 || undefined,
        w2: row.w2 || undefined,
        action: row.action || undefined,
        defence: row.defence || undefined,
        cruising: row.cruising || undefined,
        shelter: row.shelter || undefined,
        emergency: row.emergency || undefined,
        lifeRaft: row.lr || undefined,
        mess: row.mess || undefined,
        bloodGroup: row.blood_group || undefined,
        ssd: row.ssd || undefined,
        messStn: row.mess_stn || undefined,
        section: row.section || undefined,
        remarks: row.remarks || undefined,
      });
    }
    return {
      id: sailing.id,
      name: sailing.name,
      area: sailing.area || undefined,
      start: sailing.start,
      co: sailing.co || undefined,
      status: sailing.status,
      // sailings/{id}/ (retrieve) doesn't return completed_at — only the plain list does.
      completedAt: undefined,
      personnelCount: sailing.personnel_count,
      civilianCount: sailing.civilians.length,
      departments,
    };
  }
}
