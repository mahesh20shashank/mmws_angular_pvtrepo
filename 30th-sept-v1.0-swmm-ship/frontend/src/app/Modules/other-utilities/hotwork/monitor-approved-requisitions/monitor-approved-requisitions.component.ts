import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ColDef, ICellRendererParams, CellCallbackParams } from "ag-grid-community";

// Shared Components
import { ExportToolbar, ExportKind } from "../../../../shared/components/export-toolbar/export-toolbar";
import { PanelCard } from "../../../../shared/components/panel-card/panel-card";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { DetailDrawer } from "../../../../shared/components/detail-drawer/detail-drawer";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import {
  CommonApiService,
  HotworkItem,
} from "../../../../Core/http/services/api.service";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { PrintColumn, ReportExportService } from "../../../../Core/services/export/generic-export.service";

import { SelectInput, DropdownOption } from "../../../../shared/components/select-input/select-input";

const HELP_HTML = `<p class="mb-0">Lists fully approved hotwork requisitions that are ready to be carried out. Print the permit, use Start/Pause to track progress with remarks, and mark it Complete once the hotwork is finished.</p>`;

export type SafeToWeldCertStatus = "Issued" | "Pending" | "N/A";
export type StartPauseStatus = "Not Started" | "In Progress" | "Paused" | "Completed";

export interface ApprovedRequisitionRow {
  ser: number;
  hotworkCode: string;
  dateOfHotwork: string;
  typeOfHotwork: string;
  departmentSubDept: string;
  department: string;
  subDepartment: string;
  hotworkLocation: string;
  adjacentCompartment: string;
  hotworkSentryNames: string;
  hotworkDescription: string;
  safeToWeldCert: SafeToWeldCertStatus;
  startPauseStatus: StartPauseStatus;
  isCompleted: boolean;
  rawApiItem?: HotworkItem;
}

@Component({
  selector: "app-monitor-approved-requisitions",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ExportToolbar,
    PanelCard,
    DataGrid,
    DetailDrawer,
    IconComponent,
    HelpGuidance,
    ButtonComponent,
    SelectInput,
  ],
  templateUrl: "./monitor-approved-requisitions.component.html",
  styleUrl: "./monitor-approved-requisitions.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonitorApprovedRequisitionsComponent implements OnInit {
  readonly helpHtml = HELP_HTML;
  private readonly commonApiService = inject(CommonApiService);
  private readonly notificationService = inject(NotificationService);
  private readonly exportService = inject(ReportExportService);

  // Loading State
  readonly isLoading = signal<boolean>(false);

  // Top Filter Bar Signals
  readonly selectedDepartmentFilter = signal<string>("ALL");
  readonly selectedTypeFilter = signal<string>("ALL");
  readonly locationSearchInput = signal<string>("");

  // Applied Top Filters
  readonly appliedDept = signal<string>("ALL");
  readonly appliedType = signal<string>("ALL");
  readonly appliedLocation = signal<string>("");

  // Above Table Control Signals
  readonly scheduledTodayOnly = signal<boolean>(false);
  readonly globalSearch = signal<string>("");
  readonly pageSize = signal<number>(25);

  // Detail Drawer State
  readonly selectedRecord = signal<ApprovedRequisitionRow | null>(null);
  readonly actionSuccessMessage = signal<string | null>(null);
  readonly isActionInProgress = signal<boolean>(false);

  // Dropdown Options
  readonly departmentOptions: string[] = [
    "ALL",
    "ENGINEERING",
    "ELECTRICAL",
    "EXECUTIVE",
    "HULL & STRUCTURE",
    "WEAPONS & SENSORS",
    "LOGISTICS",
    "DAMAGE CONTROL",
  ];

  readonly typeOfHotworkOptions: string[] = [
    "ALL",
    "Gas Cutting",
    "Electric Arc Welding",
    "Grinding / Chipping",
    "Brazing / Soldering",
    "TIG / MIG Welding",
  ];

  readonly formattedDepartmentOptions = computed<DropdownOption[]>(() =>
    this.departmentOptions.map((d) => ({
      label: d === "ALL" ? "ALL" : d,
      value: d,
    }))
  );

  readonly formattedTypeOptions = computed<DropdownOption[]>(() =>
    this.typeOfHotworkOptions.map((t) => ({
      label: t === "ALL" ? "ALL" : t,
      value: t,
    }))
  );

  // Master Data Signal (Strictly from API, no dummy fallback)
  readonly allRequisitions = signal<ApprovedRequisitionRow[]>([]);

  ngOnInit(): void {
    this.fetchRequisitions();
  }

  fetchRequisitions(): void {
    this.isLoading.set(true);
    this.commonApiService.getHotworkList().subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res && Array.isArray(res)) {
          const mapped: ApprovedRequisitionRow[] = res.map(
            (item: HotworkItem, index: number) => {
              let safeToWeldCert: SafeToWeldCertStatus = "Pending";
              if (
                item.safe_cert === "Issued" ||
                item.safe_cert === "Pending" ||
                item.safe_cert === "N/A"
              ) {
                safeToWeldCert = item.safe_cert;
              }

              let startPauseStatus: StartPauseStatus = "Not Started";
              if (item.is_completed || item.current_status === "Completed") {
                startPauseStatus = "Completed";
              } else if (item.is_paused || item.current_status === "Paused") {
                startPauseStatus = "Paused";
              } else if (item.is_started || item.current_status === "In Progress") {
                startPauseStatus = "In Progress";
              }

              const dept = item.department_name || item.created_by_detail?.department || "Engineering";
              const subDept = item.sub_department_detail?.name || item.section_name || "";
              const deptSubDept =
                dept && subDept
                  ? `${dept} | ${subDept}`
                  : dept || subDept || "-";

              return {
                ser: index + 1,
                hotworkCode: item.hotwork_code || (item.id ? `HW-2026-${item.id}` : "-"),
                dateOfHotwork: item.date_of_hotwork || "-",
                typeOfHotwork: item.type_of_hotwork_display || item.type_of_hotwork || "-",
                departmentSubDept: deptSubDept,
                department: dept,
                subDepartment: subDept,
                hotworkLocation: item.location_of_hotwork || "-",
                adjacentCompartment: item.all_adjacent_compartments || item.adjacent_compartments || "-",
                hotworkSentryNames: item.sentry_names || "-",
                hotworkDescription: item.remarks || "-",
                safeToWeldCert,
                startPauseStatus,
                isCompleted: item.is_completed || item.current_status === "Completed",
                rawApiItem: item,
              };
            }
          );
          this.allRequisitions.set(mapped);
        } else {
          this.allRequisitions.set([]);
        }
      },
      error: (err) => {
        console.warn("API GET /api/v1/hotwork/ error:", err);
        this.isLoading.set(false);
        this.allRequisitions.set([]);
      },
    });
  }

  applyTopFilters(): void {
    this.appliedDept.set(this.selectedDepartmentFilter());
    this.appliedType.set(this.selectedTypeFilter());
    this.appliedLocation.set(this.locationSearchInput().trim());
  }

  clearAllFilters(): void {
    this.selectedDepartmentFilter.set("ALL");
    this.selectedTypeFilter.set("ALL");
    this.locationSearchInput.set("");
    this.appliedDept.set("ALL");
    this.appliedType.set("ALL");
    this.appliedLocation.set("");
    this.globalSearch.set("");
    this.scheduledTodayOnly.set(false);
  }

  // Computed Filtered List
  readonly filteredRows = computed(() => {
    let rows = this.allRequisitions();

    // Top Filter: Department
    const dept = this.appliedDept();
    if (dept !== "ALL") {
      rows = rows.filter(
        (r) =>
          r.department.toUpperCase() === dept.toUpperCase() ||
          r.departmentSubDept.toUpperCase().includes(dept.toUpperCase())
      );
    }

    // Top Filter: Type of Hotwork
    const hwType = this.appliedType();
    if (hwType !== "ALL") {
      rows = rows.filter(
        (r) => r.typeOfHotwork.toLowerCase() === hwType.toLowerCase()
      );
    }

    // Top Filter: Location
    const loc = this.appliedLocation();
    if (loc) {
      rows = rows.filter((r) => r.hotworkLocation.toLowerCase().includes(loc.toLowerCase()));
    }

    // Checkbox Filter: Scheduled for the Day
    if (this.scheduledTodayOnly()) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayDisplay = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      rows = rows.filter((r) => r.dateOfHotwork.includes(todayStr) || r.dateOfHotwork.includes(todayDisplay));
      const count = rows.length;
      setTimeout(() => {
        if (count === 0) {
          this.notificationService.info("No hotwork requisitions scheduled for day.", "Scheduled for day");
        } else {
          this.notificationService.info(`Showing ${count} hotwork requisition(s) scheduled for day.`, "Scheduled for day");
        }
      }, 0);
    }

    // Global Search Filter
    const gSearch = this.globalSearch().trim().toLowerCase();
    if (gSearch) {
      rows = rows.filter(
        (r) =>
          r.hotworkCode.toLowerCase().includes(gSearch) ||
          r.dateOfHotwork.toLowerCase().includes(gSearch) ||
          r.typeOfHotwork.toLowerCase().includes(gSearch) ||
          r.departmentSubDept.toLowerCase().includes(gSearch) ||
          r.hotworkLocation.toLowerCase().includes(gSearch) ||
          r.adjacentCompartment.toLowerCase().includes(gSearch) ||
          r.hotworkSentryNames.toLowerCase().includes(gSearch) ||
          r.hotworkDescription.toLowerCase().includes(gSearch)
      );
    }

    return rows;
  });

  // Action Helpers with API Integration
  toggleStartPause(row: ApprovedRequisitionRow, event?: Event): void {
    if (event) event.stopPropagation();
    const id = row.rawApiItem?.id || row.ser;
    const isRunning = row.startPauseStatus === "In Progress";

    if (isRunning) {
      // POST /api/v1/hotwork/{id}/pause/
      this.commonApiService
        .pauseHotwork(id, {
          current_status: "Paused",
          status: "Paused",
        })
        .subscribe({
          next: (res: { status?: string; message?: string; detail?: string }) => {
            if (res?.status === "error") {
              const msg = res.message || res.detail || "Hotwork could not be paused.";
              this.notificationService.error(msg);
              return;
            }
            this.updateRowStatus(row.hotworkCode, "Paused", false);
            this.actionSuccessMessage.set(`Hotwork ${row.hotworkCode} paused successfully.`);
          },
          error: (err) => {
            console.warn(`POST /api/v1/hotwork/${id}/pause/ error:`, err);
            const msg = err?.error?.message || err?.error?.detail || err?.message || "Hotwork could not be paused.";
            this.notificationService.error(msg);
            this.updateRowStatus(row.hotworkCode, "Paused", false);
          },
        });
    } else {
      // POST /api/v1/hotwork/{id}/start/
      this.commonApiService
        .startHotwork(id, {
          current_status: "In Progress",
          status: "In Progress",
        })
        .subscribe({
          next: (res: { status?: string; message?: string; detail?: string }) => {
            if (res?.status === "error") {
              const msg = res.message || res.detail || "Hotwork could not be started.";
              this.notificationService.error(msg);
              return;
            }
            this.updateRowStatus(row.hotworkCode, "In Progress", false);
            this.actionSuccessMessage.set(`Hotwork ${row.hotworkCode} started successfully.`);
          },
          error: (err) => {
            console.warn(`POST /api/v1/hotwork/${id}/start/ error:`, err);
            const msg = err?.error?.message || err?.error?.detail || err?.message || "Hotwork could not be started.";
            this.notificationService.error(msg);
            this.updateRowStatus(row.hotworkCode, "In Progress", false);
          },
        });
    }
  }

  markCompleted(row: ApprovedRequisitionRow, event?: Event): void {
    if (event) event.stopPropagation();
    const id = row.rawApiItem?.id || row.ser;

    // POST /api/v1/hotwork/{id}/complete/
    this.commonApiService
      .completeHotwork(id, {
        current_status: "Completed",
        status: "Completed",
      })
      .subscribe({
        next: (res: { status?: string; message?: string; detail?: string }) => {
          if (res?.status === "error") {
            const msg = res.message || res.detail || "Hotwork could not be completed.";
            this.notificationService.error(msg);
            return;
          }
          this.updateRowStatus(row.hotworkCode, "Completed", true);
          this.actionSuccessMessage.set(`Hotwork ${row.hotworkCode} marked as completed.`);
        },
        error: (err) => {
          console.warn(`POST /api/v1/hotwork/${id}/complete/ error:`, err);
          const msg = err?.error?.message || err?.error?.detail || err?.message || "Hotwork could not be completed.";
          this.notificationService.error(msg);
          this.updateRowStatus(row.hotworkCode, "Completed", true);
        },
      });
  }

  private updateRowStatus(
    hotworkCode: string,
    status: StartPauseStatus,
    isCompleted: boolean
  ): void {
    const updated = this.allRequisitions().map((item) => {
      if (item.hotworkCode === hotworkCode) {
        return {
          ...item,
          startPauseStatus: status,
          isCompleted: isCompleted || item.isCompleted,
        };
      }
      return item;
    });
    this.allRequisitions.set(updated);
    if (this.selectedRecord()?.hotworkCode === hotworkCode) {
      this.selectedRecord.set(
        updated.find((r) => r.hotworkCode === hotworkCode) || null
      );
    }
  }

  // AG-Grid DataGrid Column Definitions matching standard application UI
  readonly columnDefs: ColDef[] = [
    { headerName: "SER", field: "ser", width: 70, minWidth: 60 },
    {
      headerName: "HOTWORK CODE",
      field: "hotworkCode",
      flex: 1.2,
      minWidth: 130,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "DATE OF HOTWORK",
      field: "dateOfHotwork",
      flex: 1.2,
      minWidth: 120,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "TYPE OF HOTWORK",
      field: "typeOfHotwork",
      flex: 1.3,
      minWidth: 140,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "DEPARTMENT | SUB-DEPARTMENT",
      field: "departmentSubDept",
      flex: 1.8,
      minWidth: 180,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "HOTWORK LOCATION",
      field: "hotworkLocation",
      flex: 1.5,
      minWidth: 160,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "ADJACENT COMPARTMENT",
      field: "adjacentCompartment",
      flex: 1.5,
      minWidth: 160,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "HOTWORK SENTRY NAMES",
      field: "hotworkSentryNames",
      flex: 1.5,
      minWidth: 160,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "HOTWORK DESCRIPTION",
      field: "hotworkDescription",
      flex: 2,
      minWidth: 180,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "SAFE TO WELD CERTIFICATE",
      field: "safeToWeldCert",
      flex: 1.5,
      minWidth: 160,
      filter: "agTextColumnFilter",
      cellRenderer: (params: ICellRendererParams) => {
        const cert = typeof params.value === "string" ? params.value : "Pending";
        const isIssued = cert.toUpperCase() === "ISSUED";
        const bg = isIssued ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)";
        const color = isIssued ? "#34d399" : "#fbbf24";
        const border = isIssued ? "rgba(16,185,129,0.4)" : "rgba(245,158,11,0.4)";
        return `<div style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;box-sizing:border-box;"><button type="button" style="display:inline-flex;align-items:center;justify-content:center;height:26px;line-height:1;padding:0 14px;border-radius:8px;font-size:11px;font-weight:600;background:${bg};color:${color};border:1px solid ${border};cursor:default;box-sizing:border-box;white-space:nowrap;">${cert}</button></div>`;
      },
    },
    {
      headerName: "START/ PAUSE HOTWORK",
      field: "startPauseStatus",
      flex: 1.6,
      minWidth: 170,
      onCellClicked: (params: CellCallbackParams) => {
        const data = params.data as ApprovedRequisitionRow | undefined;
        if (data && data.startPauseStatus !== "Completed") {
          this.toggleStartPause(data, params["event"] as Event);
        }
      },
      cellRenderer: (params: ICellRendererParams) => {
        const status = params.value as string;
        if (status === "Completed") {
          return `<div style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;box-sizing:border-box;"><button type="button" style="display:inline-flex;align-items:center;justify-content:center;height:26px;line-height:1;padding:0 14px;border-radius:8px;font-size:11px;font-weight:600;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.4);cursor:default;box-sizing:border-box;white-space:nowrap;">Completed</button></div>`;
        }
        const isRunning = status === "In Progress";
        let label = "Start";
        let bg = "rgba(14,165,233,0.15)";
        let hoverBg = "rgba(14,165,233,0.28)";
        let color = "#38bdf8";
        let border = "rgba(14,165,233,0.4)";
        let hoverBorder = "rgba(14,165,233,0.6)";

        if (isRunning) {
          label = "Pause";
          bg = "rgba(245,158,11,0.15)";
          hoverBg = "rgba(245,158,11,0.28)";
          color = "#fbbf24";
          border = "rgba(245,158,11,0.4)";
          hoverBorder = "rgba(245,158,11,0.6)";
        } else if (status === "Paused") {
          label = "Resume";
        }
        return `<div style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;box-sizing:border-box;"><button type="button" style="display:inline-flex;align-items:center;justify-content:center;height:26px;line-height:1;padding:0 14px;border-radius:8px;font-size:11px;font-weight:600;background:${bg};color:${color};border:1px solid ${border};cursor:pointer;box-sizing:border-box;white-space:nowrap;transition:all 0.2s;" onmouseover="this.style.backgroundColor='${hoverBg}';this.style.borderColor='${hoverBorder}';" onmouseout="this.style.backgroundColor='${bg}';this.style.borderColor='${border}';">${label}</button></div>`;
      },
    },
    {
      headerName: "MARK AS COMPLETE",
      field: "isCompleted",
      flex: 1.5,
      minWidth: 150,
      onCellClicked: (params: CellCallbackParams) => {
        const data = params.data as ApprovedRequisitionRow | undefined;
        if (data && !data.isCompleted) {
          this.markCompleted(data, params["event"] as Event);
        }
      },
      cellRenderer: (params: ICellRendererParams) => {
        const row = params.data as ApprovedRequisitionRow | undefined;
        const isDone = params.value === true || row?.startPauseStatus === "Completed";
        if (isDone) {
          return `<div style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;box-sizing:border-box;"><button type="button" style="display:inline-flex;align-items:center;justify-content:center;height:26px;line-height:1;padding:0 14px;border-radius:8px;font-size:11px;font-weight:600;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.4);cursor:default;box-sizing:border-box;white-space:nowrap;">Completed</button></div>`;
        }
        return `<div style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;box-sizing:border-box;"><button type="button" style="display:inline-flex;align-items:center;justify-content:center;height:26px;line-height:1;padding:0 14px;border-radius:8px;font-size:11px;font-weight:600;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.4);cursor:pointer;box-sizing:border-box;white-space:nowrap;transition:all 0.2s;" onmouseover="this.style.backgroundColor='rgba(16,185,129,0.28)';this.style.borderColor='rgba(16,185,129,0.6)';" onmouseout="this.style.backgroundColor='rgba(16,185,129,0.15)';this.style.borderColor='rgba(16,185,129,0.4)';">Complete</button></div>`;
      },
    },
  ];

  onRowClicked(event: unknown): void {
    if (event && typeof event === "object") {
      this.selectedRecord.set(event as ApprovedRequisitionRow);
      this.actionSuccessMessage.set(null);
    }
  }

  closeDrawer(): void {
    this.selectedRecord.set(null);
    this.actionSuccessMessage.set(null);
  }

  onExport(kind: ExportKind): void {
    const title = "Approved Requisition Records";
    const columns: PrintColumn[] = [
      { header: "Ser No", field: "ser" },
      { header: "Hotwork Code", field: "hotworkCode" },
      { header: "Date of Hotwork", field: "dateOfHotwork" },
      { header: "Type of Hotwork", field: "typeOfHotwork" },
      { header: "Department / Sub Dept", field: "departmentSubDept" },
      { header: "Hotwork Location", field: "hotworkLocation" },
      { header: "Adjacent Compartment", field: "adjacentCompartment" },
      { header: "Hotwork Sentry Names", field: "hotworkSentryNames" },
      { header: "Hotwork Description", field: "hotworkDescription" },
      { header: "Safe to Weld Certificate", field: "safeToWeldCert" },
      { header: "Start/Pause Status", field: "startPauseStatus" },
    ];
    this.exportService.export(
      kind,
      title,
      columns,
      this.filteredRows() as unknown as Record<string, unknown>[],
      `monitor_approved_requisitions_${new Date().toISOString().slice(0, 10)}`
    );
  }
}
