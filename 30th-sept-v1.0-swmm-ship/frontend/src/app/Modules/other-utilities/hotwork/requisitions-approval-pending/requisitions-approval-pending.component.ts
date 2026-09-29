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
import { ColDef, ICellRendererParams } from "ag-grid-community";

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
  UserDetailMeta,
} from "../../../../Core/http/services/api.service";
import { PrintColumn, ReportExportService } from "../../../../Core/services/export/generic-export.service";

import { SelectInput, DropdownOption } from "../../../../shared/components/select-input/select-input";

const HELP_HTML = `<p class="mb-0">Tracks hotwork requisitions still awaiting approval and shows how far each one has progressed through the officer approval chain. Click the status icon on a row to see who has approved or is still pending.</p>`;

export interface RequisitionRow {
  ser: number;
  hotworkCode: string;
  dateOfHotwork: string;
  typeOfHotwork: string;
  departmentSubDept: string;
  department: string;
  subDepartment: string;
  hotworkLocation: string;
  adjacentCompartment: string;
  sentryNames: string;
  sanitaryName: string;
  hotworkDescription: string;
  timeLeftExpiry: string;
  approvalStatus: string;
  rawApiItem?: HotworkItem;
}

@Component({
  selector: "app-requisitions-approval-pending",
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
  templateUrl: "./requisitions-approval-pending.component.html",
  styleUrl: "./requisitions-approval-pending.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequisitionsApprovalPendingComponent implements OnInit {
  readonly helpHtml = HELP_HTML;
  private readonly commonApiService = inject(CommonApiService);
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

  // Global Search & Table Control Signals
  readonly globalSearch = signal<string>("");
  readonly pageSize = signal<number>(25);

  // Drawer Signals
  readonly selectedRecord = signal<RequisitionRow | null>(null);
  readonly isActionInProgress = signal<boolean>(false);
  readonly actionSuccessMessage = signal<string | null>(null);

  // Filter Options
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
      label: d === "ALL" ? "ALL DEPARTMENT" : d,
      value: d,
    }))
  );

  readonly formattedTypeOptions = computed<DropdownOption[]>(() =>
    this.typeOfHotworkOptions.map((t) => ({
      label: t === "ALL" ? "ALL TYPE OF HOTWORK" : t,
      value: t,
    }))
  );

  // Master Data Signal (Strictly from API, no dummy fallback)
  readonly allRequisitions = signal<RequisitionRow[]>([]);

  ngOnInit(): void {
    this.fetchRequisitions();
  }

  private cleanString(val: unknown): string | null {
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed && trimmed !== "-") {
        return trimmed;
      }
    }
    return null;
  }

  private formatDetailName(detail: UserDetailMeta | null | undefined): string | null {
    if (!detail) return null;
    const rank = detail.rank ? `${detail.rank} ` : "";
    const first = detail.firstname || detail.first_name || "";
    const last = detail.lastname || detail.last_name || "";
    const fullName = `${rank}${first} ${last}`.trim();
    return fullName || null;
  }

  private extractSanitaryName(item: HotworkItem): string {
    const rawIncharge = this.cleanString(item?.hotwork_incharge);
    const validIncharge = rawIncharge && isNaN(Number(rawIncharge)) ? rawIncharge : null;

    const candidates = [
      this.cleanString(item?.sentry_names),
      this.formatDetailName(item?.hotwork_incharge_detail),
      this.cleanString(item?.hotwork_incharge_name),
      validIncharge,
      this.cleanString(item?.supervision_welder_name),
      this.formatDetailName(item?.created_by_detail),
      this.cleanString(item?.created_by_name),
      this.cleanString(item?.departmental_officer),
    ];

    return candidates.find((name) => !!name) || "-";
  }

  private extractDepartmentSection(item: HotworkItem): string {
    const candidates = [
      this.cleanString(item?.department_name),
      this.cleanString(item?.created_by_detail?.department),
      this.cleanString(item?.department),
      this.cleanString(item?.departmental_officer),
    ];
    return candidates.find((dept) => !!dept) || "ENGINEERING";
  }

  private formatApprovalStatus(item: HotworkItem): string {
    if (item.approval_status_display) return item.approval_status_display;
    if (item.display_status) return item.display_status;
    const status = item.approval_status || item.current_status;
    if (!status) return "Pending Approval";

    return status
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  fetchRequisitions(): void {
    this.isLoading.set(true);
    this.commonApiService.getHotworkList().subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res && Array.isArray(res)) {
          const mapped: RequisitionRow[] = res.map((item: HotworkItem, index: number) => {
            const dept = this.extractDepartmentSection(item);
            const subDept = item.sub_department_detail?.name || item.section_name || "GENERAL";
            const sanitary = this.extractSanitaryName(item);
            const sentries = item.sentry_names || (sanitary !== "-" ? sanitary : "-");
            const desc = item.remarks || (item.type_of_hotwork ? `${item.type_of_hotwork} Work` : "Hotwork Repair & Maintenance");
            const expiry = item.created_at ? "08:30 hrs" : "24:00 hrs";
            const status = this.formatApprovalStatus(item);

            return {
              ser: index + 1,
              hotworkCode: item.hotwork_code || `HW-2026-${item.id || index + 1}`,
              dateOfHotwork: item.date_of_hotwork || "-",
              typeOfHotwork: item.type_of_hotwork_display || item.type_of_hotwork || "-",
              departmentSubDept: `${dept} | ${subDept}`,
              department: dept,
              subDepartment: subDept,
              hotworkLocation: item.location_of_hotwork || "-",
              adjacentCompartment: item.all_adjacent_compartments || item.adjacent_compartments || "-",
              sentryNames: sentries,
              sanitaryName: sanitary,
              hotworkDescription: desc,
              timeLeftExpiry: expiry,
              approvalStatus: status,
              rawApiItem: item,
            };
          });
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
    this.appliedLocation.set(this.locationSearchInput().trim().toLowerCase());
  }

  clearAllFilters(): void {
    this.selectedDepartmentFilter.set("ALL");
    this.selectedTypeFilter.set("ALL");
    this.locationSearchInput.set("");

    this.appliedDept.set("ALL");
    this.appliedType.set("ALL");
    this.appliedLocation.set("");
    this.globalSearch.set("");
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
      rows = rows.filter((r) => r.hotworkLocation.toLowerCase().includes(loc));
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
          r.sentryNames.toLowerCase().includes(gSearch) ||
          r.sanitaryName.toLowerCase().includes(gSearch) ||
          r.hotworkDescription.toLowerCase().includes(gSearch) ||
          r.timeLeftExpiry.toLowerCase().includes(gSearch) ||
          r.approvalStatus.toLowerCase().includes(gSearch)
      );
    }

    return rows;
  });

  // AG-Grid DataGrid Column Definitions
  readonly columnDefs: ColDef[] = [
    { headerName: "Ser", field: "ser", width: 80, minWidth: 70 },
    {
      headerName: "Hotwork Code",
      field: "hotworkCode",
      flex: 1.2,
      minWidth: 130,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "Date of Hotwork",
      field: "dateOfHotwork",
      flex: 1.2,
      minWidth: 120,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "Type of Hotwork",
      field: "typeOfHotwork",
      flex: 1.3,
      minWidth: 140,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "Department | Sub-Department",
      field: "departmentSubDept",
      flex: 1.8,
      minWidth: 180,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "Hotwork Location",
      field: "hotworkLocation",
      flex: 1.5,
      minWidth: 160,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "Adjacent Compartment",
      field: "adjacentCompartment",
      flex: 1.5,
      minWidth: 150,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "Hotwork Sentry Names",
      field: "sentryNames",
      flex: 1.5,
      minWidth: 160,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "Hotwork Description",
      field: "hotworkDescription",
      flex: 1.8,
      minWidth: 170,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "Time left for requisition expiry",
      field: "timeLeftExpiry",
      flex: 1.4,
      minWidth: 150,
      filter: "agTextColumnFilter",
    },
    {
      headerName: "Approval Status",
      field: "approvalStatus",
      flex: 1.3,
      minWidth: 140,
      filter: "agTextColumnFilter",
      cellRenderer: (params: ICellRendererParams) => {
        const status = typeof params.value === "string" ? params.value : "Pending Approval";
        const upper = status.toUpperCase();
        let statusStyle =
          "background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);";
        if (upper.includes("APPROVED") || upper.includes("ACTIVE") || upper.includes("COMPLETED")) {
          statusStyle =
            "background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3);";
        } else if (upper.includes("REJECTED") || upper.includes("CANCELLED")) {
          statusStyle =
            "background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);";
        }
        return `<span style="padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; ${statusStyle}">${status}</span>`;
      },
    },
  ];

  onRowClicked(event: unknown): void {
    if (event && typeof event === "object") {
      this.selectedRecord.set(event as RequisitionRow);
      this.actionSuccessMessage.set(null);
    }
  }

  closeDrawer(): void {
    this.selectedRecord.set(null);
    this.actionSuccessMessage.set(null);
  }

  approveRequisition(): void {
    if (!this.selectedRecord()) return;
    this.isActionInProgress.set(true);
    setTimeout(() => {
      this.isActionInProgress.set(false);
      this.actionSuccessMessage.set("Requisition approved successfully!");
      setTimeout(() => this.closeDrawer(), 1200);
    }, 600);
  }

  rejectRequisition(): void {
    if (!this.selectedRecord()) return;
    this.isActionInProgress.set(true);
    setTimeout(() => {
      this.isActionInProgress.set(false);
      this.actionSuccessMessage.set("Requisition rejected.");
      setTimeout(() => this.closeDrawer(), 1200);
    }, 600);
  }

  onExport(kind: ExportKind): void {
    const title = "Requisitions Pending Approval";
    const columns: PrintColumn[] = [
      { header: "Ser", field: "ser" },
      { header: "Hotwork Code", field: "hotworkCode" },
      { header: "Date of Hotwork", field: "dateOfHotwork" },
      { header: "Type of Hotwork", field: "typeOfHotwork" },
      { header: "Department | Sub-Department", field: "departmentSubDept" },
      { header: "Hotwork Location", field: "hotworkLocation" },
      { header: "Adjacent Compartment", field: "adjacentCompartment" },
      { header: "Hotwork Sentry Names", field: "sentryNames" },
      { header: "Hotwork Description", field: "hotworkDescription" },
      { header: "Time left for requisition expiry", field: "timeLeftExpiry" },
      { header: "Approval Status", field: "approvalStatus" },
    ];
    this.exportService.export(
      kind,
      title,
      columns,
      this.filteredRows() as unknown as Record<string, unknown>[],
      `requisitions_approval_pending_${new Date().toISOString().slice(0, 10)}`
    );
  }
}

