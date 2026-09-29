import { NgClass } from "@angular/common";
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { ColDef } from "ag-grid-community";
import { BarChart, StackedBarSeries } from "../../../../shared/components/bar-chart/bar-chart";
import { DonutChart, DonutSegment } from "../../../../shared/components/donut-chart/donut-chart";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { ActionRendererComponent } from "../../../../shared/components/data-grid/grid-action-icons";
import { GridStatusChipRenderer } from "../../../../shared/components/data-grid/grid-status-chip-renderer";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { KpiCard } from "../../../../shared/components/kpi-card/kpi-card";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { ToolbarSearch } from "../../../../shared/components/toolbar-search/toolbar-search";
import { DropdownOption, SelectInput } from "../../../../shared/components/select-input/select-input";
import { ButtonComponent } from "../../../../shared/components/button/button.component";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { CrewApiService } from "../../services/crew-api.service";
import { CrewPersonnel, LeaveApplication, LeaveType } from "../../models/crew.model";
import { AccessControlService } from "../../../../Core/navigation/access-control.service";
import { User } from "../../../../Core/services/user/user";

/** Mirrors `crew_manage.models.LeaveApplication`'s own docstring: "Submitted by any personnel;
 * HOD/DY-HOD/CO can approve or reject." */
const LEAVE_APPROVER_ROLES = ["Head of Department", "DY HOD", "CO"];

type ForecastTab = "dashboard" | "forecast" | "history";
type ForecastMode = "proposed" | "approved";
type Half = "janjun" | "juldec";
type CategoryFilter = "all" | "officer" | "sailor";
type DayType = "leave" | "ty" | "prefix" | "suffix";

const CATEGORY_OPTIONS: DropdownOption[] = [
  { label: "Officer & Sailor", value: "all" },
  { label: "Officer", value: "officer" },
  { label: "Sailor", value: "sailor" },
];

const HISTORY_TYPE_OPTIONS: DropdownOption[] = [
  { label: "Leave & TY Duty", value: "" },
  { label: "On Leave", value: "On Leave" },
  { label: "Ty Duty", value: "Ty Duty" },
];

const OFFICER_RANKS = ["cdr", "lt cdr", "capt", "captain", "commodore", "cdre", "lt", "lieutenant", "sub lt"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const JAN_JUN = [0, 1, 2, 3, 4, 5];
const JUL_DEC = [6, 7, 8, 9, 10, 11];
const PENDING_TITLE = "Leave not approved/rejected yet — click to Approve/Reject";

const pad2 = (n: number): string => String(n).padStart(2, "0");
const isoOf = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseIso = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const daysInMonth = (y: number, m: number): number => new Date(y, m + 1, 0).getDate();
const fmtDisplay = (s?: string | null): string => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${+d} ${MONTH_SHORT[+m - 1]} ${y}`;
};

/** One person's resolved state for a single calendar day — the highest-priority layer among
 * status logs / prefix / suffix / core leave-or-ty ranges that covers that date (mirrors the
 * legacy dashboard's `buildStatusMap` priority scheme exactly). */
interface DayInfo {
  type: DayType;
  status: string;
  appId: number | null;
  appStatus: "Pending" | "Approved" | "Rejected";
  parentType: "leave" | "ty";
  priority: number;
}
type StatusMap = Record<string, Record<string, DayInfo>>;

interface CalDay { iso: string; num: number; dow: number; isToday: boolean; isWeekend: boolean; }
interface CalMonth { label: string; days: CalDay[]; }
interface CalCell {
  iso: string;
  letter: string;
  crossed: boolean;
  infoClass: string;
  title: string;
  clickable: boolean;
  isWeekend: boolean;
  isToday: boolean;
}
interface CalPersonRow {
  pno: string;
  displayName: string;
  rankDesig: string;
  canApply: boolean;
  showEdit: boolean;
  cellsByMonth: CalCell[][];
}
interface CalDeptGroup { department: string; count: number; rows: CalPersonRow[]; }
interface CalendarData { months: CalMonth[]; groups: CalDeptGroup[]; totalCols: number; }

interface CellModalCtx {
  pno: string;
  name: string;
  rank: string;
  department: string;
  dateIso: string;
  info: DayInfo;
  app: LeaveApplication | null;
}

const HELP_HTML = `
  <ul class="mb-0 ps-3">
    <li class="mb-2"><strong>Dashboard</strong> - month-wise leave and TY duty trends and a department-wise breakdown.</li>
    <li class="mb-2"><strong>Forecast</strong> - a calendar of proposed and approved leave / TY duty by person and month. HOD and CO can approve pending entries here.</li>
    <li class="mb-0"><strong>History</strong> - past leave and TY duty records, filterable by year and searchable, with a CSV export.</li>
  </ul>
`;

@Component({
  selector: "app-leave-forecast",
  standalone: true,
  imports: [
    FormsModule,
    NgClass,
    BarChart,
    DonutChart,
    DataGrid,
    ModalComponent,
    IconComponent,
    KpiCard,
    HelpGuidance,
    ToolbarSearch,
    SelectInput,
    ButtonComponent,
  ],
  templateUrl: "./leave-forecast.html",
  styleUrl: "./leave-forecast.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaveForecast implements OnInit {
  private readonly api = inject(CrewApiService);
  private readonly accessControl = inject(AccessControlService);
  private readonly userService = inject(User);
  private readonly notifications = inject(NotificationService);

  readonly helpHtml = HELP_HTML;
  readonly today = new Date();
  readonly THIS_YEAR = this.today.getFullYear();
  readonly todayIso = isoOf(this.today);



  readonly canApproveLeave = computed(() => this.accessControl.hasAnyRole(LEAVE_APPROVER_ROLES));
  readonly myPno = computed(() => this.userService.userDetails()?.profile?.personal_number ?? "");

  readonly activeTab = signal<ForecastTab>("dashboard");
  readonly personnel = signal<CrewPersonnel[]>([]);
  /** Ship/department-wide (backend-scoped) applications for the current year — every status —
   * the single source for the Dashboard KPIs, the charts and the Forecast calendar. Replaces an
   * earlier "my applications ∪ pending applications" union that silently excluded a colleague's
   * already-approved leave, undercounting every dashboard number for anyone but the viewer. */
  readonly forecastApps = signal<LeaveApplication[]>([]);
  readonly forecastLogs = signal<{ personnelNumber: string; department: string; status: string; logDate: string }[]>([]);
  /** Past-years-only (current year excluded, matching the legacy History tab exactly) — its own
   * fetch window, independent of `forecastApps`. */
  readonly historyEntries = signal<LeaveApplication[]>([]);

  readonly deptFilter = signal("");
  readonly categoryFilter = signal<CategoryFilter>("all");
  readonly categoryOptions = CATEGORY_OPTIONS;

  readonly departments = computed(() => [...new Set(this.personnel().map((p) => p.department))].sort((a, b) => a.localeCompare(b)));
  readonly departmentOptions = computed<DropdownOption[]>(() => this.departments().map((d) => ({ label: d, value: d })));

  private isOfficer(rank: string): boolean {
    return OFFICER_RANKS.some((r) => rank.toLowerCase().includes(r));
  }

  readonly filteredPersonnel = computed(() => {
    const dept = this.deptFilter();
    const cat = this.categoryFilter();
    return this.personnel().filter((p) => {
      if (dept && p.department !== dept) return false;
      if (cat === "officer" && !this.isOfficer(p.rank)) return false;
      if (cat === "sailor" && this.isOfficer(p.rank)) return false;
      return true;
    });
  });

  readonly scopedForecast = computed(() => {
    const dept = this.deptFilter();
    const cat = this.categoryFilter();
    return this.forecastApps().filter((a) => {
      if (dept && (a.department ?? "") !== dept) return false;
      if (cat === "officer" && !this.isOfficer(a.rank)) return false;
      if (cat === "sailor" && this.isOfficer(a.rank)) return false;
      return true;
    });
  });

  /** `forecastLogs()` scoped to the Department filter only — matches legacy's `filterL`, which
   * (unlike `filterP`/`filterA`) never applies the Officer/Sailor category filter to status logs. */
  readonly scopedLogs = computed(() => {
    const dept = this.deptFilter();
    return dept ? this.forecastLogs().filter((l) => l.department === dept) : this.forecastLogs();
  });

  readonly totalPersonnel = computed(() => this.filteredPersonnel().length);
  /** Unique personnel with an approved leave starting in that half — not an application count
   * (one person can hold more than one approved application), matching legacy's own `Set`-based
   * dedup exactly. */
  readonly janJunCount = computed(() => {
    const pnos = new Set<string>();
    for (const a of this.scopedForecast()) {
      if (a.applicationStatus === "Approved" && +a.startDate.slice(5, 7) <= 6) pnos.add(a.personalNumber);
    }
    return pnos.size;
  });
  readonly julDecCount = computed(() => {
    const pnos = new Set<string>();
    for (const a of this.scopedForecast()) {
      if (a.applicationStatus === "Approved" && +a.startDate.slice(5, 7) > 6) pnos.add(a.personalNumber);
    }
    return pnos.size;
  });
  readonly pendingCount = computed(() => this.scopedForecast().filter((a) => a.applicationStatus === "Pending").length);
  readonly percentOnLeave = computed(() => {
    const total = this.totalPersonnel();
    if (!total) return 0;
    const onLeaveToday = this.scopedLogs().filter((l) => l.logDate === this.todayIso && l.status === "On Leave").length;
    return Math.round((onLeaveToday / total) * 100);
  });

  // ── Monthly Trend & Distribution ────────────────────────────
  readonly monthLabels = MONTH_SHORT.map((m) => `${m}'${String(this.THIS_YEAR).slice(2)}`);

  /** Person-days of Leave/TY Duty per month — past months come from real status logs (ground
   * truth), future months are day-expanded from approved applications' date ranges. Mirrors
   * legacy's `renderCharts()` exactly, rather than the cheaper (and materially different)
   * "count applications whose start date falls in month X" approximation. */
  private readonly monthlyByType = computed(() => {
    const onLeave = new Array(12).fill(0);
    const tyDuty = new Array(12).fill(0);
    for (const log of this.scopedLogs()) {
      const month = +log.logDate.slice(5, 7) - 1;
      if (month < 0 || month > 11) continue;
      if (log.status === "On Leave") onLeave[month]++;
      else if (log.status === "Ty Duty") tyDuty[month]++;
    }
    for (const a of this.scopedForecast()) {
      if (a.applicationStatus !== "Approved") continue;
      const cursor = parseIso(a.startDate);
      const end = parseIso(a.endDate);
      while (cursor <= end) {
        if (isoOf(cursor) > this.todayIso) {
          const month = cursor.getMonth();
          if (a.leaveType === "On Leave") onLeave[month]++;
          else tyDuty[month]++;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return { onLeave, tyDuty };
  });

  readonly monthlyTrendSeries = computed<StackedBarSeries[]>(() => {
    const { onLeave, tyDuty } = this.monthlyByType();
    return [
      { name: "On Leave", color: "#dc3545", data: onLeave },
      { name: "Ty Duty", color: "#ffc107", data: tyDuty },
    ];
  });

  /** Derived from the same monthly buckets `monthlyTrendSeries` uses (legacy's donut is
   * literally `lvV.reduce(...)`/`tyV.reduce(...)` over the just-built monthly arrays, not a
   * separate recount), so the two charts can never disagree with each other. */
  readonly typeBreakdownSegments = computed<DonutSegment[]>(() => {
    const { onLeave, tyDuty } = this.monthlyByType();
    const sum = (arr: number[]): number => arr.reduce((s, v) => s + v, 0);
    return [
      { label: "On Leave", value: sum(onLeave), color: "#dc3545" },
      { label: "Ty Duty", value: sum(tyDuty), color: "#ffc107" },
    ];
  });

  /** Same log-plus-future-approved-days methodology as `monthlyByType`, bucketed by department
   * instead of month. Combines On Leave + TY Duty into one count per department — the shared
   * `app-bar-chart` component's `stackedSeries` mode (needed for a true two-series breakdown)
   * only renders vertical bars, so a horizontal per-department chart can't show both series the
   * way legacy's two-dataset chart does without changing that shared component. */
  readonly deptWiseAbsence = computed(() => {
    const byDept = new Map<string, number>();
    const bump = (dept: string): void => {
      byDept.set(dept, (byDept.get(dept) ?? 0) + 1);
    };
    for (const log of this.scopedLogs()) {
      bump(log.department || "Unassigned");
    }
    for (const a of this.scopedForecast()) {
      if (a.applicationStatus !== "Approved") continue;
      const dept = a.department || "Unassigned";
      const cursor = parseIso(a.startDate);
      const end = parseIso(a.endDate);
      while (cursor <= end) {
        if (isoOf(cursor) > this.todayIso) bump(dept);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return [...byDept.entries()].map(([label, value]) => ({ label, value }));
  });

  // ── Status map (mirrors legacy's buildStatusMap priority layering) ──────
  readonly statusMap = computed<StatusMap>(() => {
    const map: StatusMap = {};
    const set = (pno: string, iso: string, entry: Omit<DayInfo, "priority">, priority: number): void => {
      if (!map[pno]) map[pno] = {};
      const cur = map[pno][iso];
      if (!cur || priority > cur.priority) map[pno][iso] = { ...entry, priority };
    };
    const applyRange = (pno: string, startIso: string, endIso: string, entry: Omit<DayInfo, "priority">, priority: number): void => {
      if (!startIso || !endIso) return;
      const cursor = parseIso(startIso);
      const end = parseIso(endIso);
      while (cursor <= end) {
        set(pno, isoOf(cursor), entry, priority);
        cursor.setDate(cursor.getDate() + 1);
      }
    };

    // 1. Past status logs — highest priority (ground truth for elapsed days). Only "On Leave" /
    // "Ty Duty" logs are meaningful here; a "Present" log (e.g. from marking someone present
    // again) has no calendar glyph of its own and must not fall through to a "ty" default.
    for (const log of this.forecastLogs()) {
      if (log.status !== "On Leave" && log.status !== "Ty Duty") continue;
      const type: DayType = log.status === "On Leave" ? "leave" : "ty";
      set(log.personnelNumber, log.logDate, { type, status: log.status, appId: null, appStatus: "Approved", parentType: type }, 50);
    }

    // 2–5. Applications: prefix / core / suffix ranges, pending vs approved priority tiers.
    for (const a of this.forecastApps()) {
      const isApproved = a.applicationStatus === "Approved";
      const parentType: "leave" | "ty" = a.leaveType === "On Leave" ? "leave" : "ty";

      if (a.hasPrefix && a.prefixStartDate && a.startDate) {
        const pfxEnd = isoOf(new Date(+parseIso(a.startDate) - 86400000));
        applyRange(
          a.personalNumber, a.prefixStartDate, pfxEnd,
          { type: "prefix", status: "Prefix", appId: a.id, appStatus: a.applicationStatus, parentType },
          isApproved ? 30 : 20,
        );
      }

      applyRange(
        a.personalNumber, a.startDate, a.endDate,
        { type: parentType, status: a.leaveType, appId: a.id, appStatus: a.applicationStatus, parentType },
        isApproved ? 40 : 35,
      );

      if (a.suffixCompletionDate && a.endDate) {
        const sfxStart = isoOf(new Date(+parseIso(a.endDate) + 86400000));
        applyRange(
          a.personalNumber, sfxStart, a.suffixCompletionDate,
          { type: "suffix", status: "Suffix", appId: a.id, appStatus: a.applicationStatus, parentType },
          isApproved ? 30 : 20,
        );
      }
    }
    return map;
  });

  // ── Forecast calendar state ─────────────────────────────────
  readonly forecastMode = signal<ForecastMode>("approved");
  readonly activeHalf = signal<Record<ForecastMode, Half>>({ proposed: "janjun", approved: "janjun" });
  readonly monthIdx = signal<Record<ForecastMode, Record<Half, number | null>>>({
    proposed: { janjun: null, juldec: null },
    approved: { janjun: null, juldec: null },
  });

  readonly currentHalf = computed(() => this.activeHalf()[this.forecastMode()]);
  readonly currentMonthIdx = computed(() => this.monthIdx()[this.forecastMode()][this.currentHalf()]);
  readonly monthTabs = computed(() => {
    const months = this.currentHalf() === "janjun" ? JAN_JUN : JUL_DEC;
    return months.map((m, i) => ({ index: i, label: `${MONTH_SHORT[m]} ${this.THIS_YEAR}` }));
  });

  readonly activeCalendar = computed<CalendarData>(() => {
    const mode = this.forecastMode();
    const half = this.activeHalf()[mode];
    const months = half === "janjun" ? JAN_JUN : JUL_DEC;
    const sel = this.monthIdx()[mode][half];
    const visibleMonths = sel === null ? months : [months[sel]];
    return this.buildCalendar(visibleMonths, mode === "proposed");
  });

  private renderCell(info: DayInfo, isPending: boolean, isFuture: boolean): { infoClass: string; letter: string; crossed: boolean; title: string } {
    const familyClass = info.parentType === "ty" ? "type-ty" : "type-leave";
    if (info.type === "leave" || info.type === "ty") {
      const base = info.type === "leave" ? "lv" : "ty";
      const infoClass = isPending ? `${base}-pend` : isFuture ? `${base}-fore` : `${base}-past`;
      const letter = info.type === "leave" ? "L" : "T";
      const title = isPending ? PENDING_TITLE : isFuture ? "[Forecast]" : "";
      return { infoClass, letter, crossed: !isFuture && !isPending, title };
    }
    const base = info.type === "prefix" ? "pfx" : "sfx";
    const infoClass = `${isPending ? `${base}-pend` : `${base}-appr`} ${familyClass}`;
    return { infoClass, letter: info.type === "prefix" ? "P" : "S", crossed: false, title: isPending ? PENDING_TITLE : "" };
  }

  private buildCalendar(months: number[], isProposed: boolean): CalendarData {
    const year = this.THIS_YEAR;
    const calMonths: CalMonth[] = months.map((m) => ({
      label: `${MONTH_FULL[m]} ${year}`,
      days: Array.from({ length: daysInMonth(year, m) }, (_, i) => {
        const d = new Date(year, m, i + 1);
        const iso = isoOf(d);
        const dow = d.getDay();
        return { iso, num: i + 1, dow, isToday: iso === this.todayIso, isWeekend: dow === 0 || dow === 6 };
      }),
    }));

    const map = this.statusMap();
    const myPno = this.myPno();
    const canManage = this.canApproveLeave();
    const year4 = String(year);

    const byDept = new Map<string, CrewPersonnel[]>();
    for (const p of this.filteredPersonnel()) {
      const dept = p.department || "Unassigned";
      const list = byDept.get(dept);
      if (list) list.push(p);
      else byDept.set(dept, [p]);
    }

    const groups: CalDeptGroup[] = [...byDept.keys()].sort().map((dept) => {
      const members = byDept.get(dept) ?? [];
      const rows: CalPersonRow[] = members.map((p) => {
        const canApply = p.pno === myPno || canManage;
        const hasApprovedThisYear = this.forecastApps().some(
          (a) => a.personalNumber === p.pno && a.applicationStatus === "Approved" && a.startDate.slice(0, 4) === year4,
        );
        const cellsByMonth: CalCell[][] = calMonths.map((cm) =>
          cm.days.map((d) => {
            const info = map[p.pno]?.[d.iso];
            let infoClass = "";
            let letter = "";
            let title = "";
            let crossed = false;
            let clickable = false;
            if (info) {
              const showCell = isProposed || info.appStatus === "Approved";
              if (showCell) {
                const isPending = info.appStatus === "Pending";
                const isFuture = d.iso > this.todayIso;
                const rendered = this.renderCell(info, isPending, isFuture);
                infoClass = rendered.infoClass;
                letter = rendered.letter;
                crossed = rendered.crossed;
                title = rendered.title;
                clickable = true;
              }
            }
            return { iso: d.iso, letter, crossed, infoClass, title, clickable, isWeekend: d.isWeekend, isToday: d.isToday };
          }),
        );
        return {
          pno: p.pno,
          displayName: `${p.firstName} ${p.lastName}`.trim(),
          rankDesig: [p.rank, p.designation].filter(Boolean).join(" · "),
          canApply,
          // Editing an application (even truncating it) requires the approver capability
          // server-side (`crew.leave.approve`) — a self-editing regular employee would just get
          // a 403, so the Edit button is gated to managers only, not to `canApply`.
          showEdit: canManage && hasApprovedThisYear,
          cellsByMonth,
        };
      });
      return { department: dept, count: rows.length, rows };
    });

    return { months: calMonths, groups, totalCols: calMonths.reduce((s, m) => s + m.days.length, 0) };
  }

  isProposed(): boolean {
    return this.forecastMode() === "proposed";
  }

  selectForecastMode(mode: ForecastMode): void {
    if (mode === "proposed" && !this.canApproveLeave()) return;
    this.forecastMode.set(mode);
  }

  selectHalf(half: Half): void {
    this.activeHalf.update((cur) => ({ ...cur, [this.forecastMode()]: half }));
  }

  selectMonth(idx: number): void {
    const mode = this.forecastMode();
    const half = this.activeHalf()[mode];
    this.monthIdx.update((cur) => ({
      ...cur,
      [mode]: { ...cur[mode], [half]: cur[mode][half] === idx ? null : idx },
    }));
  }

  dowLetter(dow: number): string {
    return DOW_LETTERS[dow];
  }

  /** Row-level "Edit" button — finds this year's approved application for that person (the same
   * one `showEdit` checked exists) and opens the truncate-only edit modal for it. */
  openEditFromRow(pno: string): void {
    const year4 = String(this.THIS_YEAR);
    const app = this.forecastApps().find(
      (a) => a.personalNumber === pno && a.applicationStatus === "Approved" && a.startDate.slice(0, 4) === year4,
    );
    if (app) this.openEditModal(app);
  }

  // ── Cell detail modal ────────────────────────────────────────
  readonly cellModal = signal<CellModalCtx | null>(null);

  onCellClick(pno: string, dateIso: string): void {
    const info = this.statusMap()[pno]?.[dateIso];
    if (!info) return;
    const person = this.personnel().find((p) => p.pno === pno);
    const app = info.appId ? this.forecastApps().find((a) => a.id === info.appId) ?? null : null;
    this.cellModal.set({
      pno,
      name: person ? `${person.firstName} ${person.lastName}`.trim() : pno,
      rank: person?.rank ?? "",
      department: person?.department ?? "",
      dateIso,
      info,
      app,
    });
  }

  closeCellModal(): void {
    this.cellModal.set(null);
  }

  readonly cellModalStats = computed(() => {
    const ctx = this.cellModal();
    if (!ctx) return null;
    const map = this.statusMap();
    const totalShip = this.personnel().length;
    const deptTotal = this.personnel().filter((p) => p.department === ctx.department).length;
    let shipAbsent = 0;
    let deptAbsent = 0;
    for (const p of this.personnel()) {
      const info = map[p.pno]?.[ctx.dateIso];
      if (info && info.appStatus === "Approved" && (info.type === "leave" || info.type === "ty")) {
        shipAbsent++;
        if (p.department === ctx.department) deptAbsent++;
      }
    }
    return {
      pctShip: totalShip ? Math.round((shipAbsent / totalShip) * 100) : 0,
      pctDept: deptTotal ? Math.round((deptAbsent / deptTotal) * 100) : 0,
      shipAbsent,
      totalShip,
      deptAbsent,
      deptTotal,
    };
  });

  get canEditFromCell(): boolean {
    const ctx = this.cellModal();
    return !!ctx && this.isProposed() && this.canApproveLeave() && !!ctx.info.appId && (ctx.info.type === "leave" || ctx.info.type === "ty");
  }

  get canActionFromCell(): boolean {
    const ctx = this.cellModal();
    return !!ctx && this.canApproveLeave() && ctx.info.appStatus === "Pending" && !!ctx.info.appId;
  }

  async approveFromCell(): Promise<void> {
    const ctx = this.cellModal();
    if (!ctx?.info.appId) return;
    await firstValueFrom(this.api.actionLeave(ctx.info.appId, "Approved"));
    this.notifications.success("Application approved.");
    this.cellModal.set(null);
    await this.load();
  }

  // ── Reject-reason modal (replaces a native `prompt()`) ───────
  readonly rejectCtx = signal<{ appId: number } | null>(null);
  rejectReason = "";

  rejectFromCell(): void {
    const ctx = this.cellModal();
    if (!ctx?.info.appId) return;
    this.rejectReason = "";
    this.rejectCtx.set({ appId: ctx.info.appId });
    this.cellModal.set(null);
  }

  closeRejectModal(): void {
    this.rejectCtx.set(null);
  }

  async confirmRejectFromCell(): Promise<void> {
    const ctx = this.rejectCtx();
    if (!ctx) return;
    this.rejectCtx.set(null);
    await firstValueFrom(this.api.actionLeave(ctx.appId, "Rejected", this.rejectReason.trim()));
    this.notifications.success("Application rejected.");
    await this.load();
  }

  editFromCell(): void {
    const ctx = this.cellModal();
    if (!ctx?.app) return;
    this.cellModal.set(null);
    this.openEditModal(ctx.app);
  }

  fmtDate(s?: string | null): string {
    return fmtDisplay(s);
  }

  // ── Apply modal (new application, self or on someone's behalf) ─────────
  readonly showApplyModal = signal(false);
  readonly submitAttempted = signal(false);
  applyTargetPno = "";
  applyPersonnelName = "";
  applyLeaveType: LeaveType = "On Leave";
  applyHasPrefix = false;
  applyPrefixStartDate = "";
  applyStartDate = "";
  applyEndDate = "";
  applyHasSuffix = false;
  applySuffixCompletionDate = "";
  applyReportingDate = "";
  applyStation = "";
  applyReason = "";

  get applyNoOfDays(): number {
    if (!this.applyStartDate || !this.applyEndDate) return 0;
    return Math.max(1, Math.round((+new Date(this.applyEndDate) - +new Date(this.applyStartDate)) / 86400000) + 1);
  }

  get applyStartDateInvalid(): boolean {
    return this.submitAttempted() && !this.applyStartDate;
  }

  get applyEndDateInvalid(): boolean {
    if (!this.submitAttempted()) return false;
    if (!this.applyEndDate) return true;
    return !!this.applyStartDate && this.applyEndDate < this.applyStartDate;
  }

  openApplyModal(pno: string, name: string): void {
    this.applyTargetPno = pno;
    this.applyPersonnelName = name;
    this.applyLeaveType = "On Leave";
    this.applyHasPrefix = false;
    this.applyPrefixStartDate = "";
    this.applyStartDate = "";
    this.applyEndDate = "";
    this.applyHasSuffix = false;
    this.applySuffixCompletionDate = "";
    this.applyReportingDate = "";
    this.applyStation = "";
    this.applyReason = "";
    this.submitAttempted.set(false);
    this.showApplyModal.set(true);
  }

  closeApplyModal(): void {
    this.showApplyModal.set(false);
  }

  async submitApply(): Promise<void> {
    this.submitAttempted.set(true);
    if (this.applyStartDateInvalid) {
      this.notifications.error("Commencement Date is required.");
      return;
    }
    if (this.applyEndDateInvalid) {
      this.notifications.error(this.applyEndDate ? "Completion Date cannot be before the Commencement Date." : "Completion Date is required.");
      return;
    }
    if (this.applyHasPrefix && !this.applyPrefixStartDate) {
      this.notifications.error("Prefix Start Date is required when Prefix Applicable is checked.");
      return;
    }
    if (this.applyHasSuffix && !this.applySuffixCompletionDate) {
      this.notifications.error("Suffix Till Date is required when Suffix Applicable is checked.");
      return;
    }
    await firstValueFrom(
      this.api.applyLeaveOnBehalf({
        personalNumber: this.applyTargetPno,
        leaveType: this.applyLeaveType,
        hasPrefix: this.applyHasPrefix,
        prefixStartDate: this.applyHasPrefix ? this.applyPrefixStartDate : undefined,
        startDate: this.applyStartDate,
        endDate: this.applyEndDate,
        hasSuffix: this.applyHasSuffix,
        suffixCompletionDate: this.applyHasSuffix ? this.applySuffixCompletionDate : undefined,
        reportingDate: this.applyHasSuffix ? this.applyReportingDate : undefined,
        station: this.applyStation,
        reason: this.applyReason,
      }),
    );
    this.notifications.success(`${this.applyPersonnelName ? this.applyPersonnelName + "'s" : "The"} application was submitted and approved.`);
    this.showApplyModal.set(false);
    await this.load();
  }

  // ── Edit modal — the real backend capability here is truncating an approved application's
  // end date (`LeaveApplicationViewSet.partial_update`), not a full re-edit — so this modal is
  // honest about that rather than presenting fields it can't actually persist. ─────────────────
  readonly showEditModal = signal(false);
  editId: number | null = null;
  editName = "";
  editStartDate = "";
  editOriginalEndDate = "";
  editNewEndDate = "";

  openEditModal(app: LeaveApplication): void {
    this.editId = app.id;
    this.editName = app.name;
    this.editStartDate = app.startDate;
    this.editOriginalEndDate = app.endDate;
    this.editNewEndDate = app.endDate;
    this.showEditModal.set(true);
  }

  closeEditModal(): void {
    this.showEditModal.set(false);
  }

  async submitEdit(): Promise<void> {
    if (this.editId === null) return;
    if (!this.editNewEndDate || this.editNewEndDate < this.editStartDate || this.editNewEndDate > this.editOriginalEndDate) {
      this.notifications.error("New completion date must fall between the commencement date and the current completion date.");
      return;
    }
    await firstValueFrom(this.api.updateLeaveDates(this.editId, this.editStartDate, this.editNewEndDate));
    this.notifications.success("Completion date updated.");
    this.showEditModal.set(false);
    await this.load();
  }

  // ── Approve All (Proposed forecast only) ────────────────────
  get pendingForecastCount(): number {
    return this.forecastApps().filter((a) => a.applicationStatus === "Pending").length;
  }

  // ── Generic confirm modal (replaces native `confirm()` popups) ──
  readonly pendingConfirm = signal<{ message: string; run: () => void | Promise<void> } | null>(null);

  private askConfirm(message: string, run: () => void | Promise<void>): void {
    this.pendingConfirm.set({ message, run });
  }

  async confirmPending(): Promise<void> {
    const pending = this.pendingConfirm();
    if (!pending) return;
    this.pendingConfirm.set(null);
    await pending.run();
  }

  cancelPending(): void {
    this.pendingConfirm.set(null);
  }

  approveAll(): void {
    const pending = this.forecastApps().filter((a) => a.applicationStatus === "Pending");
    if (!pending.length) {
      this.notifications.error("No pending applications found.");
      return;
    }
    this.askConfirm(`Approve all ${pending.length} pending application(s)? Please recheck before proceeding.`, async () => {
      let approved = 0;
      let failed = 0;
      for (const app of pending) {
        try {
          await firstValueFrom(this.api.actionLeave(app.id, "Approved"));
          approved++;
        } catch {
          failed++;
        }
      }
      this.notifications.success(`Approved ${approved} application(s).${failed ? ` ${failed} could not be processed.` : ""}`);
      await this.load();
      if (this.canApproveLeave()) this.selectForecastMode("approved");
    });
  }

  // ── Print (Approved forecast only) ───────────────────────────
  readonly monthShortLabels = MONTH_SHORT;
  readonly showPrintModal = signal(false);
  printDept = "";
  readonly printMonths = signal<Set<number>>(new Set());

  openPrintModal(): void {
    this.printMonths.set(new Set());
    this.printDept = this.deptFilter();
    this.showPrintModal.set(true);
  }

  closePrintModal(): void {
    this.showPrintModal.set(false);
  }

  togglePrintMonth(i: number): void {
    this.printMonths.update((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  selectPrintRange(from: number, to: number): void {
    this.printMonths.update((s) => {
      const next = new Set(s);
      for (let i = from; i <= to; i++) next.add(i);
      return next;
    });
  }

  clearPrintMonths(): void {
    this.printMonths.set(new Set());
  }

  get printSortedMonths(): number[] {
    return [...this.printMonths()].sort((a, b) => a - b);
  }

  get printReady(): boolean {
    return !!this.printDept && this.printMonths().size > 0;
  }

  doPrint(): void {
    if (!this.printReady) return;
    const dept = this.printDept;
    const months = this.printSortedMonths;
    const deptPersonnel = this.personnel().filter((p) => p.department === dept);
    if (!deptPersonnel.length) {
      this.notifications.error("No personnel found for the selected department.");
      return;
    }
    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) {
      this.notifications.error("Pop-up blocked — allow pop-ups for this site to print.");
      return;
    }
    const pages = months.map((m) => this.buildPrintPage(dept, deptPersonnel, m)).join("\n");
    win.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Approved Leave Forecast — ${dept}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,sans-serif;font-size:11px;color:#1a2436;background:#fff;}
  @page{size:A4 landscape;margin:10mm;}
  .page{width:100%;page-break-after:always;padding:8px;}
  .page:last-child{page-break-after:avoid;}
  .page-header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid #0f2545;}
  .page-header h1{font-size:14px;font-weight:bold;color:#0f2545;}
  .page-header .sub{font-size:10px;color:#64748b;}
  .page-header .meta{text-align:right;font-size:9px;color:#64748b;}
  table{width:100%;border-collapse:collapse;font-size:9px;}
  thead tr th{background:#0f2545;color:#fff;padding:3px 4px;text-align:center;font-weight:bold;border:1px solid rgba(255,255,255,.2);}
  thead tr th.name-col{text-align:left;width:200px;min-width:200px;max-width:200px;background:#0a1c3a;}
  thead tr.dow-row th{background:#1a3a6a;font-size:8px;}
  thead tr.date-row th{background:#e8f0fb;color:#3a4a6a;font-size:8px;}
  thead tr.date-row th.name-col{background:#e8f0fb;color:#3a4a6a;text-align:left;padding-left:6px;}
  .dept-sep td{background:#1e3a5f;color:rgba(255,255,255,.9);font-weight:bold;font-size:8px;padding:4px 8px;letter-spacing:.3px;}
  tbody tr:nth-child(even) td{background:#f8fafd;}
  tbody td{padding:2px 3px;border:1px solid #e5e7eb;text-align:center;height:22px;}
  tbody td.name-col{text-align:left;padding:2px 6px;font-weight:600;color:#1a2436;background:#f8fafd;border-right:2px solid #dde6f5;white-space:nowrap;}
  .rank-sub{font-size:7px;color:#64748b;font-weight:normal;}
  .lv-past,.lv-fore{background:#dcfce7!important;color:#166534;font-weight:bold;}
  .ty-past,.ty-fore{background:#ffedd5!important;color:#c2410c;font-weight:bold;}
  .pfx-appr.type-leave,.sfx-appr.type-leave{background:#dcfce7!important;color:#166534;font-weight:bold;}
  .pfx-appr.type-ty,.sfx-appr.type-ty{background:#ffedd5!important;color:#c2410c;font-weight:bold;}
  .wknd{background:#f5f6fa!important;color:#cbd5e1;}
  .page-footer{margin-top:6px;padding-top:4px;border-top:1px solid #dde3ef;display:flex;justify-content:space-between;font-size:8px;color:#94a3b8;}
  .legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:5px;padding-top:4px;border-top:1px solid #eee;}
  .leg-item{display:flex;align-items:center;gap:4px;font-size:8px;color:#64748b;}
  .leg-sw{width:14px;height:14px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:bold;}
</style>
</head>
<body>
${pages}
<script>window.onload=function(){window.print();}<\/script>
</body>
</html>`);
    win.document.close();
    this.closePrintModal();
  }

  private buildPrintPage(dept: string, deptPersonnel: CrewPersonnel[], monthIdx: number): string {
    const year = this.THIS_YEAR;
    const mName = MONTH_FULL[monthIdx];
    const nDays = daysInMonth(year, monthIdx);
    const days = Array.from({ length: nDays }, (_, i) => {
      const d = new Date(year, monthIdx, i + 1);
      return { num: i + 1, dow: d.getDay(), iso: isoOf(d) };
    });

    const r0 = `<tr class="month-hdr-row"><th class="name-col">Personnel</th><th colspan="${nDays}">${mName} ${year}</th></tr>`;
    const r1 = `<tr class="dow-row"><th class="name-col"></th>${days
      .map((d) => `<th${d.dow === 0 || d.dow === 6 ? ' class="wknd"' : ""}>${DOW_LETTERS[d.dow]}</th>`)
      .join("")}</tr>`;
    const r2 = `<tr class="date-row"><th class="name-col">&nbsp;</th>${days
      .map((d) => `<th${d.dow === 0 || d.dow === 6 ? ' class="wknd"' : ""}>${d.num}</th>`)
      .join("")}</tr>`;

    let bodyRows = `<tr class="dept-sep"><td colspan="${nDays + 1}">${dept} — ${deptPersonnel.length} personnel</td></tr>`;
    const map = this.statusMap();
    for (const p of deptPersonnel) {
      const fullName = `${p.firstName} ${p.lastName}`.trim();
      const cells = days
        .map((d) => {
          const info = map[p.pno]?.[d.iso];
          if (!info || info.appStatus !== "Approved") {
            return `<td class="${d.dow === 0 || d.dow === 6 ? "wknd" : ""}"></td>`;
          }
          const isFuture = d.iso > this.todayIso;
          const familyClass = info.parentType === "ty" ? "type-ty" : "type-leave";
          let cls = "";
          let letter = "";
          if (info.type === "leave") {
            cls = isFuture ? "lv-fore" : "lv-past";
            letter = "L";
          } else if (info.type === "ty") {
            cls = isFuture ? "ty-fore" : "ty-past";
            letter = "T";
          } else if (info.type === "prefix") {
            cls = `pfx-appr ${familyClass}`;
            letter = "P";
          } else {
            cls = `sfx-appr ${familyClass}`;
            letter = "S";
          }
          if (d.dow === 0 || d.dow === 6) cls += " wknd";
          return `<td class="${cls.trim()}">${letter}</td>`;
        })
        .join("");
      bodyRows += `<tr><td class="name-col"><div>${fullName}</div><div class="rank-sub">${p.rank || ""}</div></td>${cells}</tr>`;
    }

    const printedOn = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    return `<div class="page">
  <div class="page-header">
    <div><h1>Approved Leave Forecast — ${dept}</h1><div class="sub">${mName} ${year} · ${deptPersonnel.length} personnel</div></div>
    <div class="meta">Printed: ${printedOn}<br>Year: ${year}</div>
  </div>
  <table><thead>${r0}${r1}${r2}</thead><tbody>${bodyRows}</tbody></table>
  <div class="legend">
    <div class="leg-item"><div class="leg-sw" style="background:#dcfce7;color:#166534;">L</div>On Leave</div>
    <div class="leg-item"><div class="leg-sw" style="background:#ffedd5;color:#c2410c;">T</div>TY Duty</div>
    <div class="leg-item"><div class="leg-sw" style="background:#dcfce7;color:#166534;">P</div>Prefix (Leave)</div>
    <div class="leg-item"><div class="leg-sw" style="background:#ffedd5;color:#c2410c;">P</div>Prefix (TY)</div>
    <div class="leg-item"><div class="leg-sw" style="background:#dcfce7;color:#166534;">S</div>Suffix (Leave)</div>
    <div class="leg-item"><div class="leg-sw" style="background:#ffedd5;color:#c2410c;">S</div>Suffix (TY)</div>
  </div>
  <div class="page-footer">
    <span>Leave Forecast — ${dept} — ${mName} ${year}</span>
    <span>This document reflects approved leaves only as of ${printedOn}</span>
  </div>
</div>`;
  }

  // ── History tab ───────────────────────────────────────────────
  readonly historyYearOptions: DropdownOption[] = [1, 2, 3, 4].map((n) => ({
    label: String(this.THIS_YEAR - n),
    value: String(this.THIS_YEAR - n),
  }));
  readonly historyTypeOptions = HISTORY_TYPE_OPTIONS;
  readonly historyYearFilter = signal<string>(String(this.THIS_YEAR - 1));
  readonly historyTypeFilter = signal<"" | LeaveType>("");
  readonly historySearch = signal("");

  readonly filteredHistory = computed(() => {
    const year = this.historyYearFilter();
    const type = this.historyTypeFilter();
    const dept = this.deptFilter();
    const cat = this.categoryFilter();
    const q = this.historySearch().trim().toLowerCase();
    return this.historyEntries().filter((a) => {
      if (year && a.startDate.slice(0, 4) !== year) return false;
      if (type && a.leaveType !== type) return false;
      if (dept && (a.department ?? "") !== dept) return false;
      if (cat === "officer" && !this.isOfficer(a.rank)) return false;
      if (cat === "sailor" && this.isOfficer(a.rank)) return false;
      if (q && !`${a.name} ${a.personalNumber}`.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  readonly historyStats = computed(() => {
    const rows = this.filteredHistory();
    return {
      total: rows.length,
      onLeave: rows.filter((a) => a.leaveType === "On Leave").length,
      tyDuty: rows.filter((a) => a.leaveType === "Ty Duty").length,
      approved: rows.filter((a) => a.applicationStatus === "Approved").length,
      totalDays: rows.reduce((s, a) => s + (a.noOfDays || 0), 0),
    };
  });

  readonly historyColumns: ColDef[] = [
    {
      headerName: "Detail",
      width: 80,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: unknown) => [
          { icon: "view", label: "View yearly history", action: () => this.openPersonHistory(row as LeaveApplication) },
        ],
      },
    },
    { field: "name", headerName: "Name", flex: 1 },
    { field: "rank", headerName: "Rank", width: 110 },
    { field: "department", headerName: "Department", width: 150, valueGetter: (p) => (p.data as LeaveApplication).department || "—" },
    { field: "leaveType", headerName: "Type", width: 110 },
    {
      headerName: "Prefix",
      width: 140,
      valueGetter: (p) => {
        const a = p.data as LeaveApplication;
        return a.hasPrefix && a.prefixStartDate ? `P: ${fmtDisplay(a.prefixStartDate)}` : "—";
      },
    },
    { field: "startDate", headerName: "Start", width: 120 },
    { field: "endDate", headerName: "End", width: 120 },
    {
      headerName: "Suffix",
      width: 140,
      valueGetter: (p) => {
        const a = p.data as LeaveApplication;
        return a.suffixCompletionDate ? `S: ${fmtDisplay(a.suffixCompletionDate)}` : "—";
      },
    },
    { field: "noOfDays", headerName: "Days", width: 90 },
    { field: "applicationStatus", headerName: "Status", width: 120, cellRenderer: GridStatusChipRenderer },
    { field: "station", headerName: "Station", width: 140, valueGetter: (p) => (p.data as LeaveApplication).station || "—" },
    { field: "reason", headerName: "Reason", width: 160, valueGetter: (p) => (p.data as LeaveApplication).reason || "—" },
  ];

  onHistoryYearChange(value: unknown): void {
    this.historyYearFilter.set(typeof value === "string" ? value : "");
  }

  onHistoryTypeChange(value: unknown): void {
    this.historyTypeFilter.set(value === "On Leave" || value === "Ty Duty" ? value : "");
  }

  // ── Person yearly history modal ──────────────────────────────
  readonly personHistory = signal<{ pno: string; name: string; year: string } | null>(null);

  openPersonHistory(row: LeaveApplication): void {
    this.personHistory.set({ pno: row.personalNumber, name: row.name, year: row.startDate.slice(0, 4) });
  }

  closePersonHistory(): void {
    this.personHistory.set(null);
  }

  readonly personHistoryRecords = computed(() => {
    const ctx = this.personHistory();
    if (!ctx) return [];
    return this.historyEntries()
      .filter((a) => a.personalNumber === ctx.pno && a.startDate.slice(0, 4) === ctx.year)
      .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  });

  readonly personHistorySummary = computed(() => {
    const records = this.personHistoryRecords();
    const leaveRecs = records.filter((a) => a.leaveType === "On Leave");
    const tyRecs = records.filter((a) => a.leaveType === "Ty Duty");
    const approved = records.filter((a) => a.applicationStatus === "Approved");
    const leaveDays = leaveRecs.filter((a) => a.applicationStatus === "Approved").reduce((s, a) => s + (a.noOfDays || 0), 0);
    const tyDays = tyRecs.filter((a) => a.applicationStatus === "Approved").reduce((s, a) => s + (a.noOfDays || 0), 0);
    return {
      count: records.length,
      leaveCount: leaveRecs.length,
      tyCount: tyRecs.length,
      totalDays: approved.reduce((s, a) => s + (a.noOfDays || 0), 0),
      leaveDays,
      tyDays,
    };
  });

  exportHistoryCsv(): void {
    const headers = ["Name", "PNo", "Rank", "Department", "Type", "Prefix", "Start", "End", "Suffix", "Days", "Status", "Station", "Reason"];
    const rows = this.filteredHistory().map((a) => [
      a.name,
      a.personalNumber,
      a.rank,
      a.department ?? "",
      a.leaveType,
      a.hasPrefix && a.prefixStartDate ? a.prefixStartDate : "",
      a.startDate,
      a.endDate,
      a.suffixCompletionDate ?? "",
      a.noOfDays,
      a.applicationStatus,
      a.station ?? "",
      a.reason ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "leave_history.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ── Lifecycle / shared filters ───────────────────────────────
  ngOnInit(): void {
    void this.load();
  }

  selectTab(tab: ForecastTab): void {
    this.activeTab.set(tab);
  }

  onDeptChange(value: unknown): void {
    this.deptFilter.set(typeof value === "string" ? value : "");
  }

  onCategoryChange(value: unknown): void {
    this.categoryFilter.set((typeof value === "string" ? value : "all") as CategoryFilter);
  }

  resetFilters(): void {
    this.deptFilter.set("");
    this.categoryFilter.set("all");
  }

  private async load(): Promise<void> {
    const year = this.THIS_YEAR;
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const histStart = `${year - 4}-01-01`;
    const histEnd = `${year - 1}-12-31`;

    const [personnel, forecastApps, forecastLogs, historyEntries] = await Promise.all([
      firstValueFrom(this.api.getPersonnel()),
      firstValueFrom(this.api.getForecastApplications(yearStart, yearEnd)),
      firstValueFrom(this.api.getForecastLogs(yearStart, yearEnd)),
      firstValueFrom(this.api.getForecastApplications(histStart, histEnd)),
    ]);
    this.personnel.set(personnel);
    this.forecastApps.set(forecastApps);
    this.forecastLogs.set(forecastLogs);
    this.historyEntries.set(historyEntries);
  }
}
