import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { ColDef } from "ag-grid-community";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { ActionRendererComponent, GridAction } from "../../../../shared/components/data-grid/grid-action-icons";
import { GridStatusChipRenderer } from "../../../../shared/components/data-grid/grid-status-chip-renderer";
import { ToolbarSearch } from "../../../../shared/components/toolbar-search/toolbar-search";
import { ExportKind, ExportToolbar } from "../../../../shared/components/export-toolbar/export-toolbar";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { FileInput } from "../../../../shared/components/file-input/file-input";
import { InputField } from "../../../../shared/components/input-field/input-field";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { PrintColumn, ReportExportService } from "../../../../Core/services/export/generic-export.service";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { DropdownOption, SelectInput } from "../../../../shared/components/select-input/select-input";
import { CrewApiService } from "../../services/crew-api.service";
import { CrewPersonnel, LeaveApplication, LeaveType } from "../../models/crew.model";

type LtdTab = "my-applications" | "pending";
type StatusFilter = "" | "Pending" | "Approved" | "Rejected";

const LEAVE_TYPE_FILTER_OPTIONS: DropdownOption[] = [
  { label: "All", value: "" },
  { label: "On Leave", value: "On Leave" },
  { label: "Ty Duty", value: "Ty Duty" },
];

const STATUS_FILTER_OPTIONS: DropdownOption[] = [
  { label: "All", value: "" },
  { label: "Pending", value: "Pending" },
  { label: "Approved", value: "Approved" },
  { label: "Rejected", value: "Rejected" },
];

const GRID_COLUMNS = (actions: (row: LeaveApplication) => GridAction[]): ColDef[] => [
  { colId: "serNo", headerName: "Ser No.", valueGetter: (p) => Number(p.node?.["rowIndex"] ?? 0) + 1, width: 90, sortable: false },
  { field: "personalNumber", headerName: "Personnel No.", width: 140 },
  { field: "name", headerName: "Name", flex: 1 },
  { field: "rank", headerName: "Rank", width: 120 },
  { field: "department", headerName: "Department", width: 150, valueGetter: (p) => (p.data as LeaveApplication).department || "—" },
  { field: "leaveType", headerName: "Leave Type", width: 120 },
  { field: "prefixStartDate", headerName: "Prefix Start Date", width: 150, valueGetter: (p) => (p.data as LeaveApplication).prefixStartDate || "—" },
  { field: "startDate", headerName: "Commencement", width: 140 },
  { field: "endDate", headerName: "Completion", width: 140 },
  { field: "noOfDays", headerName: "Days", width: 90 },
  { field: "station", headerName: "Station", width: 140, valueGetter: (p) => (p.data as LeaveApplication).station || "—" },
  {
    field: "applicationStatus",
    headerName: "Status",
    width: 120,
    cellRenderer: GridStatusChipRenderer,
  },
  { field: "appliedAt", headerName: "Applied At", width: 160 },
  {
    headerName: "Actions",
    field: "id",
    width: 110,
    sortable: false,
    filter: false,
    cellRenderer: ActionRendererComponent,
    cellRendererParams: { actions: (row: unknown) => actions(row as LeaveApplication) },
  },
];

const PRINT_COLUMNS: PrintColumn[] = [
  { header: "Ser No.", field: "serNo" },
  { header: "Personnel No.", field: "personalNumber" },
  { header: "Name", field: "name" },
  { header: "Rank", field: "rank" },
  { header: "Department", field: "department" },
  { header: "Leave Type", field: "leaveType" },
  { header: "Prefix Start Date", field: "prefixStartDate" },
  { header: "Commencement", field: "startDate" },
  { header: "Completion", field: "endDate" },
  { header: "Days", field: "noOfDays" },
  { header: "Station", field: "station" },
  { header: "Status", field: "applicationStatus" },
  { header: "Applied At", field: "appliedAt" },
];

const HELP_HTML = `
  <p class="mb-0">Lists your own leave and TY duty amendment requests along with their approval status. Use &quot;Input details for Leave Forecast&quot; to submit a new request. HOD and CO also see a Leave Forecast Amendment Requests tab to approve or reject pending requests.</p>
`;

@Component({
  selector: "app-leave-ty-duty",
  standalone: true,
  imports: [FormsModule, DataGrid, ModalComponent, ToolbarSearch, ExportToolbar, IconComponent, FileInput, InputField, HelpGuidance, SelectInput, ButtonComponent],
  templateUrl: "./leave-ty-duty.html",
  styleUrl: "./leave-ty-duty.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaveTyDuty implements OnInit {
  private readonly api = inject(CrewApiService);
  private readonly notifications = inject(NotificationService);
  private readonly exportService = inject(ReportExportService);

  readonly helpHtml = HELP_HTML;
  readonly leaveTypeFilterOptions = LEAVE_TYPE_FILTER_OPTIONS;
  readonly statusFilterOptions = STATUS_FILTER_OPTIONS;
  readonly activeTab = signal<LtdTab>("my-applications");
  readonly myApplications = signal<LeaveApplication[]>([]);
  readonly pendingApplications = signal<LeaveApplication[]>([]);
  readonly personnel = signal<CrewPersonnel[]>([]);

  readonly searchText = signal("");
  readonly leaveTypeFilter = signal<"" | LeaveType>("");
  readonly statusFilter = signal<StatusFilter>("");
  readonly dateFrom = signal("");
  readonly dateTo = signal("");
  readonly amendStatusFilter = signal<StatusFilter>("Pending");
  readonly amendLeaveTypeFilter = signal<"" | LeaveType>("");

  readonly showApplyModal = signal(false);
  readonly exportBusy = signal<ExportKind | null>(null);

  readonly myApplicationsColumns = GRID_COLUMNS((row) =>
    row.applicationStatus === "Pending"
      ? [{ icon: "delete", label: "Delete", color: "#dc2626", action: () => this.deleteApplication(row.id) }]
      : [],
  );
  readonly pendingColumns = GRID_COLUMNS((row) => [
    { icon: "check", label: "Approve", color: "#16a34a", action: () => this.approve(row.id) },
    { icon: "delete", label: "Reject", color: "#dc2626", action: () => this.openRejectModal(row.id) },
  ]);

  get columnDefs(): ColDef[] {
    return this.activeTab() === "my-applications" ? this.myApplicationsColumns : this.pendingColumns;
  }

  readonly filteredRows = computed(() => {
    const isMine = this.activeTab() === "my-applications";
    const query = this.searchText().trim().toLowerCase();
    const leaveType = isMine ? this.leaveTypeFilter() : this.amendLeaveTypeFilter();
    const status = isMine ? this.statusFilter() : this.amendStatusFilter();
    const from = this.dateFrom();
    const to = this.dateTo();
    const source = isMine ? this.myApplications() : this.pendingApplications();

    return source.filter((a) => {
      if (leaveType && a.leaveType !== leaveType) return false;
      if (status && a.applicationStatus !== status) return false;
      if (isMine && from && a.startDate < from) return false;
      if (isMine && to && a.startDate > to) return false;
      if (
        query &&
        ![a.name, a.personalNumber, a.rank, a.department ?? ""].some((v) => v.toLowerCase().includes(query))
      ) {
        return false;
      }
      return true;
    });
  });

  // ── Apply modal ──────────────────────────────────────────────
  selectedPno: string | null = null;
  personnelName = "";
  personnelNumber = "";
  leaveType: LeaveType = "On Leave";
  hasPrefix = false;
  prefixStartDate = "";
  startDate = "";
  endDate = "";
  hasSuffix = false;
  suffixCompletionDate = "";
  reportingDate = "";
  station = "";
  reason = "";
  attachment: File | null = null;
  attachmentName = "";
  readonly submitAttempted = signal(false);

  readonly personnelOptions = computed<DropdownOption[]>(() =>
    this.personnel().map((p) => ({ value: p.pno, label: `${p.firstName} ${p.lastName} (${p.pno})` })),
  );

  get sectionLabel(): string {
    return this.leaveType === "On Leave" ? "LEAVE DETAILS" : "TY DUTY DETAILS";
  }

  get typeLabel(): string {
    return this.leaveType === "On Leave" ? "Leave" : "TY Duty";
  }

  get noOfDays(): number {
    if (!this.startDate || !this.endDate) return 0;
    return Math.max(1, Math.round((+new Date(this.endDate) - +new Date(this.startDate)) / 86400000) + 1);
  }

  /** Fired when a personnel is chosen from the dropdown — fills the Name/Personnel Number
   * fields as a convenience default, but both stay freely editable/overridable afterwards. */
  onSelectPersonnel(value: unknown): void {
    const pno = typeof value === "string" ? value : null;
    this.selectedPno = pno;
    const match = pno ? this.personnel().find((p) => p.pno === pno) : undefined;
    if (match) {
      this.personnelName = `${match.firstName} ${match.lastName}`.trim();
      this.personnelNumber = match.pno;
    }
  }

  get nameInvalid(): boolean {
    return this.submitAttempted() && !this.personnelName.trim();
  }

  get personnelNumberInvalid(): boolean {
    return this.submitAttempted() && !this.personnelNumber.trim();
  }

  get startDateInvalid(): boolean {
    return this.submitAttempted() && !this.startDate;
  }

  get endDateInvalid(): boolean {
    if (!this.submitAttempted()) return false;
    if (!this.endDate) return true;
    return !!this.startDate && this.endDate < this.startDate;
  }

  // ── Reject modal ─────────────────────────────────────────────
  readonly showRejectModal = signal(false);
  private rejectTargetId: number | null = null;
  rejectionReason = "";

  ngOnInit(): void {
    void this.load();
  }

  selectTab(tab: LtdTab): void {
    this.activeTab.set(tab);
    this.searchText.set("");
  }

  private async load(): Promise<void> {
    const [mine, pending, personnel] = await Promise.all([
      firstValueFrom(this.api.getMyApplications()),
      firstValueFrom(this.api.getPendingApplications("all")),
      firstValueFrom(this.api.getPersonnel()),
    ]);
    this.myApplications.set(mine);
    this.pendingApplications.set(pending);
    this.personnel.set(personnel);
  }

  clearFilters(): void {
    this.leaveTypeFilter.set("");
    this.statusFilter.set("");
    this.dateFrom.set("");
    this.dateTo.set("");
    this.amendStatusFilter.set("Pending");
    this.amendLeaveTypeFilter.set("");
    this.searchText.set("");
  }

  private static toLeaveTypeFilter(value: unknown): "" | LeaveType {
    return value === "On Leave" || value === "Ty Duty" ? value : "";
  }

  private static toStatusFilter(value: unknown): StatusFilter {
    return value === "Pending" || value === "Approved" || value === "Rejected" ? value : "";
  }

  onLeaveTypeFilterChange(value: unknown): void {
    this.leaveTypeFilter.set(LeaveTyDuty.toLeaveTypeFilter(value));
  }

  onStatusFilterChange(value: unknown): void {
    this.statusFilter.set(LeaveTyDuty.toStatusFilter(value));
  }

  onAmendStatusFilterChange(value: unknown): void {
    this.amendStatusFilter.set(LeaveTyDuty.toStatusFilter(value));
  }

  onAmendLeaveTypeFilterChange(value: unknown): void {
    this.amendLeaveTypeFilter.set(LeaveTyDuty.toLeaveTypeFilter(value));
  }

  openApplyModal(): void {
    this.selectedPno = null;
    this.personnelName = "";
    this.personnelNumber = "";
    this.leaveType = "On Leave";
    this.hasPrefix = false;
    this.prefixStartDate = "";
    this.startDate = "";
    this.endDate = "";
    this.hasSuffix = false;
    this.suffixCompletionDate = "";
    this.reportingDate = "";
    this.station = "";
    this.reason = "";
    this.attachment = null;
    this.attachmentName = "";
    this.submitAttempted.set(false);
    this.showApplyModal.set(true);
  }

  onAttachmentChange(file: File | null): void {
    this.attachment = file;
    this.attachmentName = file?.name ?? "";
  }

  async submitApply(): Promise<void> {
    this.submitAttempted.set(true);
    if (this.nameInvalid || this.personnelNumberInvalid) {
      this.notifications.error("Name of Personnel and Personnel Number are required — select an employee or enter them directly.");
      return;
    }
    if (this.startDateInvalid) {
      this.notifications.error(`${this.typeLabel} Commencement Date is required.`);
      return;
    }
    if (this.endDateInvalid) {
      this.notifications.error(
        this.endDate
          ? `${this.typeLabel} Completion Date cannot be before the Commencement Date.`
          : `${this.typeLabel} Completion Date is required.`,
      );
      return;
    }
    if (this.hasPrefix && !this.prefixStartDate) {
      this.notifications.error("Prefix Start Date is required when Prefix Applicable is checked.");
      return;
    }
    if (this.hasSuffix && !this.suffixCompletionDate) {
      this.notifications.error("Suffix Till Date is required when Suffix Applicable is checked.");
      return;
    }
    await firstValueFrom(
      this.api.applyLeaveOnBehalf({
        personalNumber: this.personnelNumber.trim(),
        leaveType: this.leaveType,
        hasPrefix: this.hasPrefix,
        prefixStartDate: this.hasPrefix ? this.prefixStartDate : undefined,
        startDate: this.startDate,
        endDate: this.endDate,
        hasSuffix: this.hasSuffix,
        suffixCompletionDate: this.hasSuffix ? this.suffixCompletionDate : undefined,
        reportingDate: this.hasSuffix ? this.reportingDate : undefined,
        station: this.station,
        reason: this.reason,
        attachment: this.attachment,
      }),
    );
    this.showApplyModal.set(false);
    await this.load();
  }

  // ── Generic confirm modal (replaces native `confirm()` popups) ──
  readonly pendingConfirm = signal<{ message: string; confirmLabel: string; run: () => void | Promise<void> } | null>(null);

  private askConfirm(message: string, confirmLabel: string, run: () => void | Promise<void>): void {
    this.pendingConfirm.set({ message, confirmLabel, run });
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

  deleteApplication(id: number): void {
    this.askConfirm("Delete this application?", "Delete", async () => {
      await firstValueFrom(this.api.deleteLeaveApplication(id));
      await this.load();
    });
  }

  approve(id: number): void {
    this.askConfirm("Approve this application?", "Approve", async () => {
      await firstValueFrom(this.api.actionLeave(id, "Approved"));
      await this.load();
    });
  }

  openRejectModal(id: number): void {
    this.rejectTargetId = id;
    this.rejectionReason = "";
    this.showRejectModal.set(true);
  }

  async confirmReject(): Promise<void> {
    if (this.rejectTargetId === null || !this.rejectionReason.trim()) {
      this.notifications.error("Please enter a rejection reason.");
      return;
    }
    await firstValueFrom(this.api.actionLeave(this.rejectTargetId, "Rejected", this.rejectionReason.trim()));
    this.showRejectModal.set(false);
    await this.load();
  }

  private get exportRows(): Record<string, unknown>[] {
    return this.filteredRows().map((a, i) => ({
      serNo: i + 1,
      personalNumber: a.personalNumber,
      name: a.name,
      rank: a.rank,
      department: a.department ?? "",
      leaveType: a.leaveType,
      prefixStartDate: a.prefixStartDate ?? "",
      startDate: a.startDate,
      endDate: a.endDate,
      noOfDays: a.noOfDays,
      station: a.station ?? "",
      applicationStatus: a.applicationStatus,
      appliedAt: a.appliedAt,
    }));
  }

  onExport(kind: ExportKind): void {
    const title = this.activeTab() === "my-applications" ? "My Applications" : "Leave Forecast Amendment Requests";
    if (kind === "excel") {
      this.exportService.downloadCsv(PRINT_COLUMNS, this.exportRows, `${this.activeTab()}.csv`);
      return;
    }
    this.exportService.printRows(title, PRINT_COLUMNS, this.exportRows);
  }

}
