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

// Shared Components
import {
  ExportToolbar,
  ExportKind,
} from "../../../../shared/components/export-toolbar/export-toolbar";
import { PanelCard } from "../../../../shared/components/panel-card/panel-card";
import { DatePickerComponent } from "../../../../shared/components/date-picker/picker";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import {
  CommonApiService,
  HotworkTrackingItem,
  UserDetailMeta,
} from "../../../../Core/http/services/api.service";

export interface HotworkRecord {
  sNo: number;
  hotworkCode: string;
  dateOfHotwork: string;
  hotworkType: string;
  departmentSection: string;
  hotworkLocation: string;
  adjacentCompartments: string;
  sentryNames: string;
  sanitaryName: string;
  descriptionOfHotwork: string;
  safeToWeldCert: string;
  currentStatus: string;
  hotworkTime?: string;
  locationAdjacent?: string;
  rawApiItem?: HotworkTrackingItem;
}

function parseDateRange(rawDateRange: unknown): {
  startDateStr: string;
  endDateStr: string;
} {
  if (typeof rawDateRange === "string") {
    if (rawDateRange.includes("-")) {
      const parts = rawDateRange.split("-").map((s) => s.trim());
      return {
        startDateStr: parts[0] || "",
        endDateStr: parts[1] || parts[0] || "",
      };
    }
    const trimmed = rawDateRange.trim();
    return { startDateStr: trimmed, endDateStr: trimmed };
  }
  if (rawDateRange && typeof rawDateRange === "object") {
    const dr = rawDateRange as { start?: string; end?: string };
    return {
      startDateStr: dr.start || "",
      endDateStr: dr.end || dr.start || "",
    };
  }
  return { startDateStr: "", endDateStr: "" };
}

function isDateWithinRange(
  dateOfHotwork: string,
  startDateStr: string,
  endDateStr: string,
): boolean {
  if (!startDateStr || !dateOfHotwork || dateOfHotwork === "-") return true;

  const itemDate = new Date(dateOfHotwork).getTime();
  const start = new Date(startDateStr).getTime();
  const end = new Date(endDateStr).getTime();

  if (Number.isNaN(itemDate) || Number.isNaN(start)) return true;
  if (itemDate < start) return false;
  if (!Number.isNaN(end) && itemDate > end) return false;

  return true;
}

function matchesSearch(r: HotworkRecord, search: string): boolean {
  if (!search) return true;
  return (
    r.sNo.toString().includes(search) ||
    r.hotworkCode.toLowerCase().includes(search) ||
    r.dateOfHotwork.toLowerCase().includes(search) ||
    r.hotworkType.toLowerCase().includes(search) ||
    r.departmentSection.toLowerCase().includes(search) ||
    r.hotworkLocation.toLowerCase().includes(search) ||
    r.adjacentCompartments.toLowerCase().includes(search) ||
    r.sentryNames.toLowerCase().includes(search) ||
    r.sanitaryName.toLowerCase().includes(search) ||
    r.descriptionOfHotwork.toLowerCase().includes(search) ||
    r.safeToWeldCert.toLowerCase().includes(search) ||
    r.currentStatus.toLowerCase().includes(search)
  );
}

import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { DetailDrawer } from "../../../../shared/components/detail-drawer/detail-drawer";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { PrintColumn, ReportExportService } from "../../../../Core/services/export/generic-export.service";

import { SelectInput, DropdownOption } from "../../../../shared/components/select-input/select-input";

const HELP_HTML = `<p class="mb-0">Search past hotwork requisitions by department, date, time, type, location, or status. Click a row to view its full detail and progress history.</p>`;

@Component({
  selector: "app-hotwork-history",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IconComponent,
    ExportToolbar,
    PanelCard,
    DatePickerComponent,
    DataGrid,
    DetailDrawer,
    HelpGuidance,
    SelectInput,
  ],
  templateUrl: "./hotwork-history.component.html",
  styleUrl: "./hotwork-history.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HotworkHistoryComponent implements OnInit {
  readonly helpHtml = HELP_HTML;
  private readonly commonApiService = inject(CommonApiService);
  private readonly exportService = inject(ReportExportService);

  readonly selectedRecord = signal<HotworkRecord | null>(null);

  onRowClicked(row: unknown): void {
    if (row && typeof row === "object") {
      this.selectedRecord.set(row as HotworkRecord);
    }
  }

  closeDrawer(): void {
    this.selectedRecord.set(null);
  }

  // Master Hotwork Records (Populated dynamically from API)
  readonly hotworkRecords = signal<HotworkRecord[]>([]);

  // Filter signals
  readonly departmentFilter = signal<string>("ALL");
  readonly dateFilter = signal<string | null>("");
  readonly timeFilter = signal<string>("ALL");
  readonly typeFilter = signal<string>("ALL");
  readonly locationFilter = signal<string>("");
  readonly statusFilter = signal<string>("ALL");

  // Applied filter signals
  readonly appliedDept = signal<string>("ALL");
  readonly appliedDate = signal<string | null>("");
  readonly appliedTime = signal<string>("ALL");
  readonly appliedType = signal<string>("ALL");
  readonly appliedLocation = signal<string>("");
  readonly appliedStatus = signal<string>("ALL");

  readonly historyGlobalSearch = signal<string>("");
  readonly historyPageSize = signal<number>(10);

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

  readonly timeOptions: string[] = [
    "ALL",
    "Day",
    "Night",
  ];

  readonly typeOptions: string[] = [
    "ALL",
    "Gas Cutting",
    "Electric Arc Welding",
    "Grinding / Chipping",
    "Brazing / Soldering",
    "TIG / MIG Welding",
  ];

  readonly statusOptions: string[] = [
    "ALL",
    "Active",
    "Pending",
    "Paused",
    "Completed",
  ];

  readonly formattedDepartmentOptions = computed<DropdownOption[]>(() =>
    this.departmentOptions.map((d) => ({
      label: d === "ALL" ? "ALL DEPARTMENT" : d,
      value: d,
    }))
  );

  readonly formattedTimeOptions = computed<DropdownOption[]>(() =>
    this.timeOptions.map((t) => ({
      label: t === "ALL" ? "ALL TIME OF HOTWORK" : t,
      value: t,
    }))
  );

  readonly formattedTypeOptions = computed<DropdownOption[]>(() =>
    this.typeOptions.map((t) => ({
      label: t === "ALL" ? "ALL TYPE OF HOTWORK" : t,
      value: t,
    }))
  );

  readonly formattedStatusOptions = computed<DropdownOption[]>(() =>
    this.statusOptions.map((s) => ({
      label: s === "ALL" ? "ALL HOTWORK STATUS" : s,
      value: s,
    }))
  );

  applyFilters(): void {
    this.appliedDept.set(this.departmentFilter());
    this.appliedDate.set(this.dateFilter());
    this.appliedTime.set(this.timeFilter());
    this.appliedType.set(this.typeFilter());
    this.appliedLocation.set(this.locationFilter().trim().toLowerCase());
    this.appliedStatus.set(this.statusFilter());
  }

  resetFilters(): void {
    this.departmentFilter.set("ALL");
    this.dateFilter.set("");
    this.timeFilter.set("ALL");
    this.typeFilter.set("ALL");
    this.locationFilter.set("");
    this.statusFilter.set("ALL");
    this.historyGlobalSearch.set("");

    this.appliedDept.set("ALL");
    this.appliedDate.set("");
    this.appliedTime.set("ALL");
    this.appliedType.set("ALL");
    this.appliedLocation.set("");
    this.appliedStatus.set("ALL");
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

  private extractSanitaryName(item: HotworkTrackingItem): string {
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

  private extractDepartmentSection(item: HotworkTrackingItem): string {
    const createdByDetail = item?.created_by_detail as Record<string, unknown> | undefined;
    const mainDept =
      this.cleanString(item?.department_name) ||
      this.cleanString(createdByDetail?.["department"]) ||
      this.cleanString(item?.department) ||
      this.cleanString(item?.departmental_officer) ||
      "ENGINEERING";
    const subDept = item?.sub_department_detail?.name || item?.section_name || "GENERAL";

    return `${mainDept} / ${subDept}`;
  }

  ngOnInit(): void {
    this.commonApiService.getHotworkTrackingList().subscribe({
      next: (res) => {
        if (res && Array.isArray(res)) {
          const mapped: HotworkRecord[] = res.map(
            (item: HotworkTrackingItem, index: number) => {
              const dept = this.extractDepartmentSection(item);
              const sanitary = this.extractSanitaryName(item);
              const sentries = item.sentry_names || (sanitary !== "-" ? sanitary : "-");
              const cert = item.safe_cert || (item.sentries_required ? "Issued" : "Pending");
              const status = item.approval_status_display || item.current_status || (item.night_work ? "Active" : "Completed");

              let locationAdjacent = "-";
              if (item.location_of_hotwork) {
                const compartments = item.all_adjacent_compartments ? ` (${item.all_adjacent_compartments})` : "";
                locationAdjacent = `${item.location_of_hotwork}${compartments}`;
              }

              return {
                sNo: index + 1,
                hotworkCode:
                  item.previous_hotwork_code ||
                  item.dl_number ||
                  `HW-2026-00${item.id}`,
                dateOfHotwork: item.date_of_hotwork || "-",
                hotworkType: item.type_of_hotwork || "Welding",
                departmentSection: dept,
                hotworkLocation: item.location_of_hotwork || "-",
                adjacentCompartments: item.all_adjacent_compartments || item.adjacent_compartments || "-",
                sentryNames: sentries,
                sanitaryName: sanitary,
                descriptionOfHotwork: item.remarks || item.type_of_hotwork || "-",
                safeToWeldCert: cert,
                currentStatus: status,
                hotworkTime: item.night_work ? "22:00 hrs" : "09:00 hrs",
                locationAdjacent,
                rawApiItem: item,
              };
            },
          );
          this.hotworkRecords.set(mapped);
        } else {
          this.hotworkRecords.set([]);
        }
      },
      error: (err) => {
        console.warn("API GET /api/v1/hotwork/tracking/ error:", err);
        this.hotworkRecords.set([]);
      },
    });
  }

  // AG-Grid DataGrid Column Definitions for History Table
  readonly historyColumnDefs: ColDef[] = [
    { headerName: "Ser", field: "sNo", width: 80, minWidth: 70 },
    {
      headerName: "Hotwork Code",
      field: "hotworkCode",
      flex: 1.2,
      minWidth: 130,
    },
    {
      headerName: "Date of Hotwork",
      field: "dateOfHotwork",
      flex: 1.2,
      minWidth: 120,
    },
    {
      headerName: "Type of Hotwork",
      field: "hotworkType",
      flex: 1.3,
      minWidth: 140,
    },
    {
      headerName: "Department/ Sub-Department",
      field: "departmentSection",
      flex: 1.8,
      minWidth: 180,
    },
    {
      headerName: "Hotwork Location",
      field: "hotworkLocation",
      flex: 1.5,
      minWidth: 160,
    },
    {
      headerName: "Adjacent Compartment",
      field: "adjacentCompartments",
      flex: 1.5,
      minWidth: 150,
    },
    {
      headerName: "Hotwork Sentry Names",
      field: "sentryNames",
      flex: 1.5,
      minWidth: 160,
    },
    {
      headerName: "Hotwork Description",
      field: "descriptionOfHotwork",
      flex: 1.8,
      minWidth: 170,
    },
    {
      headerName: "Safe to Weld certificate",
      field: "safeToWeldCert",
      flex: 1.3,
      minWidth: 140,
      cellRenderer: (params: ICellRendererParams) => {
        const cert = typeof params.value === "string" ? params.value : "N/A";
        const upper = cert.toUpperCase();
        let certStyle = "background: rgba(100,116,139,0.15); color: #94a3b8; border: 1px solid rgba(100,116,139,0.3);";
        if (upper.includes("ISSUED") || upper.includes("YES") || upper.includes("ACTIVE")) {
          certStyle = "background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3);";
        } else if (upper.includes("PENDING")) {
          certStyle = "background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);";
        }
        return `<span style="padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; ${certStyle}">${cert}</span>`;
      },
    },
    {
      headerName: "Hotwork Status",
      field: "currentStatus",
      flex: 1.3,
      minWidth: 140,
      cellRenderer: (params: ICellRendererParams) => {
        const status = typeof params.value === "string" ? params.value : "Pending";
        const upper = status.toUpperCase();
        let statusStyle =
          "background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);";
        if (upper.includes("ACTIVE") || upper.includes("APPROVED")) {
          statusStyle =
            "background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3);";
        } else if (upper.includes("COMPLETED")) {
          statusStyle =
            "background: rgba(59,130,246,0.15); color: #3b82f6; border: 1px solid rgba(59,130,246,0.3);";
        } else if (upper.includes("REJECTED") || upper.includes("CANCELLED")) {
          statusStyle =
            "background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);";
        }
        return `<span style="padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; ${statusStyle}">${status}</span>`;
      },
    },
  ];

  readonly filteredHistoryRecords = computed(() => {
    let list = this.hotworkRecords();
    const dept = this.appliedDept();
    const dateVal = this.appliedDate();
    const timeVal = this.appliedTime();
    const hwType = this.appliedType();
    const locVal = this.appliedLocation();
    const statusVal = this.appliedStatus();
    const search = this.historyGlobalSearch().toLowerCase().trim();

    const { startDateStr, endDateStr } = parseDateRange(dateVal);

    if (dept !== "ALL") {
      list = list.filter((r) => r.departmentSection.toUpperCase().includes(dept.toUpperCase()));
    }
    if (hwType !== "ALL") {
      list = list.filter((r) => r.hotworkType.toLowerCase() === hwType.toLowerCase());
    }
    if (statusVal !== "ALL") {
      list = list.filter((r) => r.currentStatus.toLowerCase() === statusVal.toLowerCase());
    }
    if (locVal) {
      list = list.filter((r) => r.hotworkLocation.toLowerCase().includes(locVal));
    }
    if (timeVal && timeVal !== "ALL") {
      const tv = timeVal.toLowerCase();
      if (tv === "day") {
        list = list.filter((r) => !r.hotworkTime?.toLowerCase().includes("night") && (r.hotworkTime?.includes("09:") || r.hotworkTime?.toLowerCase().includes("day") || r.hotworkTime?.includes("hrs")));
      } else if (tv === "night") {
        list = list.filter((r) => r.hotworkTime?.toLowerCase().includes("night") || r.hotworkTime?.includes("22:"));
      } else {
        list = list.filter((r) => r.hotworkTime?.toLowerCase().includes(tv));
      }
    }
    if (startDateStr) {
      list = list.filter((r) => isDateWithinRange(r.dateOfHotwork, startDateStr, endDateStr));
    }

    return list.filter((r) => matchesSearch(r, search));
  });

  onExport(kind: ExportKind): void {
    const title = "Hotwork History Records";
    const columns: PrintColumn[] = [
      { header: "Ser", field: "sNo" },
      { header: "Hotwork Code", field: "hotworkCode" },
      { header: "Date of Hotwork", field: "dateOfHotwork" },
      { header: "Type of Hotwork", field: "hotworkType" },
      { header: "Department/ Sub-Department", field: "departmentSection" },
      { header: "Hotwork Location", field: "hotworkLocation" },
      { header: "Adjacent Compartment", field: "adjacentCompartments" },
      { header: "Hotwork Sentry Names", field: "sentryNames" },
      { header: "Hotwork Description", field: "descriptionOfHotwork" },
      { header: "Safe to Weld certificate", field: "safeToWeldCert" },
      { header: "Hotwork Status", field: "currentStatus" },
    ];
    this.exportService.export(
      kind,
      title,
      columns,
      this.filteredHistoryRecords() as unknown as Record<string, unknown>[],
      `HotworkHistory_${new Date().toISOString().slice(0, 10)}`
    );
  }

  copyData(): void {
    const headers = [
      "Ser",
      "Hotwork Code",
      "Date of Hotwork",
      "Type of Hotwork",
      "Department/ Sub-Department",
      "Hotwork Location",
      "Adjacent Compartment",
      "Hotwork Sentry Names",
      "Hotwork Description",
      "Safe to Weld certificate",
      "Hotwork Status",
    ];
    const rows = this.filteredHistoryRecords().map((r) =>
      [
        r.sNo,
        r.hotworkCode,
        r.dateOfHotwork,
        r.hotworkType,
        r.departmentSection,
        r.hotworkLocation,
        r.adjacentCompartments,
        r.sentryNames,
        r.descriptionOfHotwork,
        r.safeToWeldCert,
        r.currentStatus,
      ].join("\t"),
    );
    const text = [headers.join("\t"), ...rows].join("\n");
    navigator.clipboard.writeText(text);
  }
}
