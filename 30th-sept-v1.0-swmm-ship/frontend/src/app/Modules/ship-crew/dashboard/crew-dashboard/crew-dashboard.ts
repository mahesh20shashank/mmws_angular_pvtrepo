import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { ColDef } from "ag-grid-community";
import { firstValueFrom } from "rxjs";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { GridStatusRadioRenderer } from "../../../../shared/components/data-grid/grid-status-radio-renderer";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { KpiCard } from "../../../../shared/components/kpi-card/kpi-card";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { PrintColumn, ReportExportService } from "../../../../Core/services/export/generic-export.service";
import { DropdownOption, SelectInput } from "../../../../shared/components/select-input/select-input";
import { AccessControlService } from "../../../../Core/navigation/access-control.service";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { CrewApiService } from "../../services/crew-api.service";
import { CrewDashboardCounts, CrewPersonnel, LeaveConflictCheck, LeaveType, PersonnelStatus } from "../../models/crew.model";
import { PersonnelStatusTab } from "../../personnel-status/personnel-status.model";
import { StatusLeaveModal } from "./status-leave-modal/status-leave-modal";

/** Matches the legacy tooltip exactly ("Only HOD, DY HOD can update status") and the backend's
 * `crew.status.manage` capability comment. UX hint only — the backend enforces the real check. */
const STATUS_MANAGE_ROLES = ["Head of Department", "DY HOD"];
const STATUS_OPTIONS: PersonnelStatus[] = ["Present", "On Leave", "Ty Duty"];

const PRINT_COLUMNS: PrintColumn[] = [
  { header: "Ser No.", field: "serNo" },
  { header: "Rank", field: "rank" },
  { header: "Name", field: "name" },
  { header: "Personnel Number", field: "pno" },
  { header: "Department", field: "department" },
  { header: "Designation", field: "designation" },
  { header: "Status", field: "status" },
];

interface CrewDashboardTile {
  title: string;
  count: number;
  icon: string;
  iconColor: string;
  iconBg: string;
  statusTab: PersonnelStatusTab;
}

const CREW_BASE = "/afterAuth/Ship_Crew_and_HR";

const OFFICER_RANKS = ["cdr", "lt cdr", "capt", "captain", "commodore", "cdre", "lt", "lieutenant", "sub lt"];

const HELP_HTML = `
  <ul class="mb-0 ps-3">
    <li class="mb-2">The chart runs <strong>Commanding Officer &rarr; Head of Department &rarr; Divisional Officer &rarr; Division &rarr; Sailor</strong>. Switch to <strong>Edit Mode</strong> to add or change anything.</li>
    <li class="mb-2">A Divisional Officer may hold further <strong>Divisional Officers</strong>, up to five officer levels below the HOD card.</li>
    <li class="mb-2">An officer's children are <strong>all one kind</strong>. Once a Division exists under an officer, that level offers only <strong>+ Add Division</strong>, so further divisions can still be added there. <strong>A Division is terminal</strong> &mdash; it holds sailors only, never another officer.</li>
    <li class="mb-2">A Divisional Officer placed <strong>directly under a HOD</strong> may be tagged as the <strong>Departmental Officer</strong> (the Dy HOD billet).</li>
    <li class="mb-2"><strong>Advisory, not enforced</strong>: a division is best kept to roughly <strong>11 to 15 sailors</strong>. Larger or smaller divisions are accepted and nothing will block you &mdash; treat this as a planning guide only.</li>
    <li class="mb-0">Click a Division card to open its sailor list. Inside that list, click a sailor's <strong>name</strong> to see their photo, and in Edit Mode to upload or replace it. A sailor photo is <strong>optional</strong>; the default photo is shown when none has been uploaded.</li>
  </ul>
`;

@Component({
  selector: "app-crew-dashboard",
  standalone: true,
  imports: [FormsModule, DataGrid, IconComponent, KpiCard, HelpGuidance, SelectInput, StatusLeaveModal, ModalComponent, ButtonComponent],
  templateUrl: "./crew-dashboard.html",
  styleUrl: "./crew-dashboard.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrewDashboard implements OnInit {
  private readonly api = inject(CrewApiService);
  private readonly router = inject(Router);
  private readonly exportService = inject(ReportExportService);
  private readonly accessControl = inject(AccessControlService);
  private readonly notifications = inject(NotificationService);

  readonly helpHtml = HELP_HTML;

  readonly canManageStatus = computed(() => this.accessControl.hasAnyRole(STATUS_MANAGE_ROLES));
  readonly statusModalTarget = signal<{ personnel: CrewPersonnel; leaveType: LeaveType } | null>(null);

  readonly today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  readonly personnel = signal<CrewPersonnel[]>([]);
  readonly tiles = signal<CrewDashboardTile[]>([]);
  readonly category = signal<"all" | "officer" | "sailor">("all");
  readonly deptFilter = signal("");

  readonly departments = computed(() =>
    [...new Set(this.personnel().map((p) => p.department))].sort((a, b) => a.localeCompare(b)),
  );
  readonly departmentOptions = computed<DropdownOption[]>(() => this.departments().map((d) => ({ label: d, value: d })));

  readonly filteredRows = computed(() => {
    const cat = this.category();
    const dept = this.deptFilter();
    return this.personnel().filter((p) => {
      const isOfficer = OFFICER_RANKS.some((r) => p.rank.toLowerCase().includes(r));
      if (cat === "officer" && !isOfficer) return false;
      if (cat === "sailor" && isOfficer) return false;
      if (dept && p.department !== dept) return false;
      return true;
    });
  });

  readonly columnDefs: ColDef[] = [
    { colId: "serNo", headerName: "Ser No.", valueGetter: (p) => Number(p.node?.["rowIndex"] ?? 0) + 1, width: 90 },
    { field: "rank", headerName: "Rank", width: 120 },
    {
      colId: "name",
      headerName: "Name",
      valueGetter: (p) => `${(p.data as CrewPersonnel).firstName} ${(p.data as CrewPersonnel).lastName}`,
      flex: 1,
    },
    { field: "pno", headerName: "Personnel Number", width: 160 },
    { field: "department", headerName: "Department", width: 150 },
    { field: "designation", headerName: "Designation", flex: 1 },
    {
      field: "status",
      headerName: "Status",
      width: 260,
      sortable: false,
      cellRenderer: GridStatusRadioRenderer,
      cellRendererParams: {
        options: STATUS_OPTIONS,
        canEdit: () => this.canManageStatus(),
        disabledHint: "Only HOD, DY HOD can update status",
        onChange: (row: unknown, status: string) => this.onStatusRadioChange(row as CrewPersonnel, status as PersonnelStatus),
      },
    },
  ];

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const [counts, personnel] = await Promise.all([
      firstValueFrom(this.api.getDashboardCounts()),
      firstValueFrom(this.api.getPersonnel()),
    ]);
    this.personnel.set(personnel);
    this.tiles.set(this.buildTiles(counts));
  }

  /** Fired by the Status column's radio group. "Present" is handled directly (with a
   * conflict-check + optional truncate, mirroring legacy); "On Leave"/"Ty Duty" open the apply
   * modal, since those create a real LeaveApplication record. */
  onStatusRadioChange(row: CrewPersonnel, newStatus: PersonnelStatus): void {
    if (!this.canManageStatus() || newStatus === row.status) return;
    if (newStatus === "Present") {
      void this.markPresent(row);
      return;
    }
    this.statusModalTarget.set({ personnel: row, leaveType: newStatus });
  }

  /** Backs the "mark Present would shorten an active leave" confirm modal, replacing a native
   * `confirm()` popup. */
  readonly presentConflict = signal<{ row: CrewPersonnel; conflict: LeaveConflictCheck } | null>(null);

  private async markPresent(row: CrewPersonnel): Promise<void> {
    const conflict = await firstValueFrom(this.api.checkLeaveConflict(row.pno));
    if (conflict.hasConflict) {
      this.presentConflict.set({ row, conflict });
      return;
    }
    await this.applyMarkPresent(row, conflict);
  }

  async confirmPresentConflict(): Promise<void> {
    const ctx = this.presentConflict();
    if (!ctx) return;
    this.presentConflict.set(null);
    await this.applyMarkPresent(ctx.row, ctx.conflict);
  }

  cancelPresentConflict(): void {
    this.presentConflict.set(null);
  }

  private async applyMarkPresent(row: CrewPersonnel, conflict: LeaveConflictCheck): Promise<void> {
    if (conflict.hasConflict && conflict.applicationId && conflict.newEndDate) {
      await firstValueFrom(this.api.truncateLeave(conflict.applicationId, conflict.newEndDate));
    }

    await firstValueFrom(
      this.api.updatePersonnelStatus({
        personalNumber: row.pno,
        rank: row.rank,
        name: `${row.firstName} ${row.lastName}`.trim(),
        department: row.department,
        designation: row.designation ?? "",
        status: "Present",
      }),
    );
    this.notifications.success(`${row.firstName} ${row.lastName} marked Present.`);
    await this.load();
  }

  async onStatusModalSubmitted(): Promise<void> {
    this.statusModalTarget.set(null);
    await this.load();
  }

  onStatusModalClosed(): void {
    this.statusModalTarget.set(null);
  }

  private buildTiles(counts: CrewDashboardCounts): CrewDashboardTile[] {
    return [
      { title: "Total Strength", count: counts.total, icon: "users", iconColor: "#0095ff", iconBg: "rgba(0,149,255,0.12)", statusTab: "all" },
      {
        title: "Present",
        count: counts.present,
        icon: "circle-check-big",
        iconColor: "#28a745",
        iconBg: "rgba(40,167,69,0.12)",
        statusTab: "present",
      },
      {
        title: "On Leave",
        count: counts.onLeave,
        icon: "circle-x",
        iconColor: "#dc3545",
        iconBg: "rgba(220,53,69,0.12)",
        statusTab: "leave",
      },
      {
        title: "On Ty Duty",
        count: counts.tyDuty,
        icon: "clock",
        iconColor: "#d97706",
        iconBg: "rgba(217,119,6,0.12)",
        statusTab: "ty",
      },
    ];
  }

  /** Mirrors Django's KPI "View more" links to `crew/personnel_status/?tab=...`. */
  viewMore(statusTab: PersonnelStatusTab): void {
    void this.router.navigate([`${CREW_BASE}/personnel-status`], { queryParams: { tab: statusTab } });
  }

  setCategory(cat: "all" | "officer" | "sailor"): void {
    this.category.set(cat);
  }

  onDeptChange(value: unknown): void {
    this.deptFilter.set(typeof value === "string" ? value : "");
  }

  clearFilters(): void {
    this.category.set("all");
    this.deptFilter.set("");
  }

  private get exportRows(): Record<string, unknown>[] {
    return this.filteredRows().map((p, i) => ({
      serNo: i + 1,
      rank: p.rank,
      name: `${p.firstName} ${p.lastName}`,
      pno: p.pno,
      department: p.department,
      designation: p.designation ?? "",
      status: p.status,
    }));
  }

  downloadCsv(): void {
    this.exportService.downloadCsv(
      PRINT_COLUMNS,
      this.exportRows,
      `ship_crew_personnel_${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  downloadPdf(): void {
    this.exportService.downloadPdf(
      `Personnel Borne as on ${this.today}`,
      PRINT_COLUMNS,
      this.exportRows,
      `ship_crew_personnel_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
  }
}
