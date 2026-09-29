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
import { ICellRendererAngularComp } from "ag-grid-angular";

import { IconComponent } from "../../../../../shared/components/icon/icon.component";
import {
  ExportToolbar,
  ExportKind,
} from "../../../../../shared/components/export-toolbar/export-toolbar";
import { DataGrid } from "../../../../../shared/components/data-grid/data-grid";
import {
  CommonApiService,
  HotworkItem,
  UserDetailMeta,
} from "../../../../../Core/http/services/api.service";
import { PrintColumn, ReportExportService } from "../../../../../Core/services/export/generic-export.service";

import { PanelCard } from "../../../../../shared/components/panel-card/panel-card";
import { ButtonComponent } from "../../../../../shared/components/button/button.component";
import { DetailDrawer } from "../../../../../shared/components/detail-drawer/detail-drawer";
import { HelpGuidance } from "../../../../../shared/components/help-guidance/help-guidance";
import { SelectInput, DropdownOption } from "../../../../../shared/components/select-input/select-input";

const HELP_HTML = `<p class="mb-0">Shows hotwork requisitions you have already approved, rejected, or forwarded, along with their current approval status. Filter by department, type, or location, and click a row to view its full details.</p>`;

export interface OutboxRecord {
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
  timeLeftExpiry: string;
  status: string;
  rawApiItem?: HotworkItem;
}

@Component({
  selector: "app-hotwork-outbox-detail-action-renderer",
  standalone: true,
  imports: [IconComponent],
  template: `
    <button
      type="button"
      class="text-sky-400 hover:text-sky-300 transition-colors p-1.5 rounded-md hover:bg-white/10 flex items-center justify-center cursor-pointer"
      title="Detail View"
      (click)="onClick($event)"
    >
      <app-icon name="eye" [size]="16" color="#38bdf8" />
    </button>
  `,
})
export class HotworkOutboxDetailActionRenderer implements ICellRendererAngularComp {
  private params: (ICellRendererParams & { onClick?: (data: OutboxRecord) => void }) | null = null;

  agInit(params: ICellRendererParams & { onClick?: (data: OutboxRecord) => void }): void {
    this.params = params;
  }

  refresh(params: ICellRendererParams & { onClick?: (data: OutboxRecord) => void }): boolean {
    this.params = params;
    return true;
  }

  onClick(event: MouseEvent): void {
    event.stopPropagation();
    if (this.params?.data && typeof this.params.onClick === "function") {
      this.params.onClick(this.params.data as OutboxRecord);
    }
  }
}

function parseDateRange(rawDateRange: unknown): {
  startDateStr: string;
  endDateStr: string;
} {
  if (!rawDateRange) return { startDateStr: "", endDateStr: "" };
  if (typeof rawDateRange === "string") {
    if (rawDateRange.includes(" to ")) {
      const parts = rawDateRange.split(" to ").map((s) => s.trim());
      return {
        startDateStr: parts[0] || "",
        endDateStr: parts[1] || parts[0] || "",
      };
    }
    if (rawDateRange.includes(" - ")) {
      const parts = rawDateRange.split(" - ").map((s) => s.trim());
      return {
        startDateStr: parts[0] || "",
        endDateStr: parts[1] || parts[0] || "",
      };
    }
    const trimmed = rawDateRange.trim();
    return { startDateStr: trimmed, endDateStr: trimmed };
  }
  if (typeof rawDateRange === "object") {
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
  endDateStr: string
): boolean {
  if (!startDateStr || !dateOfHotwork || dateOfHotwork === "-") return true;

  const itemDate = new Date(dateOfHotwork).getTime();
  const start = new Date(startDateStr).getTime();
  const end = new Date(endDateStr).getTime();

  if (Number.isNaN(itemDate) || Number.isNaN(start)) return true;

  if (!Number.isNaN(end)) {
    const endOfDay = end + 86400000 - 1;
    return itemDate >= start && itemDate <= endOfDay;
  }
  return itemDate >= start;
}

@Component({
  selector: "app-outbox",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IconComponent,
    ExportToolbar,
    DataGrid,
    DetailDrawer,
    HelpGuidance,
    PanelCard,
    ButtonComponent,
    SelectInput,
  ],
  templateUrl: "./outbox.html",
  styleUrl: "./outbox.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OutboxComponent implements OnInit {
  readonly helpHtml = HELP_HTML;
  private readonly commonApiService = inject(CommonApiService);
  private readonly exportService = inject(ReportExportService);

  readonly selectedRecord = signal<OutboxRecord | null>(null);

  onRowClicked(row: unknown): void {
    if (row && typeof row === "object") {
      this.selectedRecord.set(row as OutboxRecord);
    }
  }

  closeDrawer(): void {
    this.selectedRecord.set(null);
  }

  // Filter signals
  readonly selectedHotworkCode = signal<string>("ALL");
  readonly selectedDateRange = signal<string | null>("");
  readonly selectedDepartment = signal<string>("ALL");
  readonly selectedType = signal<string>("ALL");
  readonly locationSearch = signal<string>("");
  readonly globalSearch = signal<string>("");

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

  readonly typeOptions: string[] = [
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
    this.typeOptions.map((t) => ({
      label: t === "ALL" ? "ALL TYPE OF HOTWORK" : t,
      value: t,
    }))
  );

  // Outbox data (Fetched dynamically from API)
  readonly rowData = signal<OutboxRecord[]>([]);

  readonly hotworkCodes = computed(() => {
    const codes = this.rowData()
      .map((r) => r.hotworkCode)
      .filter(Boolean);
    return Array.from(new Set(codes));
  });

  readonly filteredRowData = computed(() => {
    let list = this.rowData();
    const code = this.selectedHotworkCode();
    const dept = this.selectedDepartment();
    const hwType = this.selectedType();
    const locSearch = this.locationSearch().trim().toLowerCase();
    const gSearch = this.globalSearch().trim().toLowerCase();
    const { startDateStr, endDateStr } = parseDateRange(this.selectedDateRange());

    if (code && code !== "ALL") {
      list = list.filter((r) => r.hotworkCode === code);
    }
    if (dept && dept !== "ALL") {
      list = list.filter((r) => r.departmentSection.toUpperCase().includes(dept.toUpperCase()));
    }
    if (hwType && hwType !== "ALL") {
      list = list.filter((r) => r.hotworkType.toLowerCase() === hwType.toLowerCase());
    }
    if (locSearch) {
      list = list.filter((r) => r.hotworkLocation.toLowerCase().includes(locSearch));
    }
    if (startDateStr) {
      list = list.filter((r) => isDateWithinRange(r.dateOfHotwork, startDateStr, endDateStr));
    }
    if (gSearch) {
      list = list.filter((r) =>
        r.hotworkCode.toLowerCase().includes(gSearch) ||
        r.dateOfHotwork.toLowerCase().includes(gSearch) ||
        r.hotworkType.toLowerCase().includes(gSearch) ||
        r.departmentSection.toLowerCase().includes(gSearch) ||
        r.hotworkLocation.toLowerCase().includes(gSearch) ||
        r.adjacentCompartments.toLowerCase().includes(gSearch) ||
        r.sentryNames.toLowerCase().includes(gSearch) ||
        r.sanitaryName.toLowerCase().includes(gSearch) ||
        r.descriptionOfHotwork.toLowerCase().includes(gSearch) ||
        (r.status && r.status.toLowerCase().includes(gSearch))
      );
    }
    return list;
  });

  applyFilters(): void {
    // Computed signals automatically trigger re-evaluation
  }

  clearFilters(): void {
    this.selectedHotworkCode.set("ALL");
    this.selectedDateRange.set("");
    this.selectedDepartment.set("ALL");
    this.selectedType.set("ALL");
    this.locationSearch.set("");
    this.globalSearch.set("");
  }

  private getTrimmedString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  private extractNameFromDetail(detail: UserDetailMeta | null | undefined): string {
    if (!detail) return "";
    const rank = detail.rank ? `${detail.rank} ` : "";
    const first = detail.firstname || detail.first_name || "";
    const last = detail.lastname || detail.last_name || "";
    return `${rank}${first} ${last}`.trim();
  }

  private extractSanitaryName(item: HotworkItem): string {
    const sentry = this.getTrimmedString(item?.sentry_names);
    if (sentry && sentry !== "-") return sentry;

    const inchargeDetail = this.extractNameFromDetail(item?.hotwork_incharge_detail);
    if (inchargeDetail) return inchargeDetail;

    const inchargeName = this.getTrimmedString(item?.hotwork_incharge_name);
    if (inchargeName) return inchargeName;

    const incharge = this.getTrimmedString(item?.hotwork_incharge);
    if (incharge && isNaN(Number(incharge))) return incharge;

    const welder = this.getTrimmedString(item?.supervision_welder_name);
    if (welder) return welder;

    const createdDetail = this.extractNameFromDetail(item?.created_by_detail);
    if (createdDetail) return createdDetail;

    const createdName = this.getTrimmedString(item?.created_by_name);
    if (createdName) return createdName;

    const officer = this.getTrimmedString(item?.departmental_officer);
    if (officer) return officer;

    return "-";
  }

  private extractDepartmentSection(item: HotworkItem): string {
    const createdByDetail = item?.created_by_detail as Record<string, unknown> | undefined;
    const mainDept =
      this.getTrimmedString(item?.department_name) ||
      this.getTrimmedString(createdByDetail?.["department"]) ||
      this.getTrimmedString(item?.department) ||
      this.getTrimmedString(item?.departmental_officer) ||
      "ENGINEERING";
    const subDept = item?.sub_department_detail?.name || item?.section_name || "GENERAL";

    return `${mainDept} | ${subDept}`;
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

  ngOnInit(): void {
    this.commonApiService.getHotworkOutbox().subscribe({
      next: (res) => {
        if (res && Array.isArray(res)) {
          const mapped: OutboxRecord[] = res.map(
            (item: HotworkItem, index: number) => {
              const dept = this.extractDepartmentSection(item);
              const sanitary = this.extractSanitaryName(item);
              const sentries = item.sentry_names || (sanitary !== "-" ? sanitary : "-");
              const expiry = item.created_at ? "08:30 hrs" : "24:00 hrs";
              const status = this.formatApprovalStatus(item);
              return {
                sNo: index + 1,
                hotworkCode: item.hotwork_code || `HW-2026-00${item.id}`,
                dateOfHotwork: item.date_of_hotwork || "-",
                hotworkType: item.type_of_hotwork || "-",
                departmentSection: dept,
                hotworkLocation: item.location_of_hotwork || "-",
                adjacentCompartments: item.all_adjacent_compartments || item.adjacent_compartments || "-",
                sentryNames: sentries,
                sanitaryName: sanitary,
                descriptionOfHotwork: item.remarks || `${item.type_of_hotwork || "Hotwork"} Work`,
                timeLeftExpiry: expiry,
                status: status,
                rawApiItem: item,
              };
            },
          );
          this.rowData.set(mapped);
        } else {
          this.rowData.set([]);
        }
      },
      error: (err) => {
        console.warn("API GET /api/v1/hotwork/outbox/ fallback", err);
        this.rowData.set([]);
      },
    });
  }

  readonly colDefs: ColDef[] = [
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
      headerName: "Department | Sub-Department",
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
      headerName: "Detail View",
      field: "detailView",
      width: 110,
      minWidth: 100,
      cellRenderer: HotworkOutboxDetailActionRenderer,
      cellRendererParams: {
        onClick: (record: OutboxRecord) => this.onRowClicked(record),
      },
      sortable: false,
      filter: false,
    },
    {
      headerName: "Approval Status",
      field: "status",
      flex: 1.3,
      minWidth: 140,
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

  handleExport(kind: ExportKind): void {
    const title = "Hotwork Outbox";
    const columns: PrintColumn[] = [
      { header: "Ser", field: "sNo" },
      { header: "Hotwork Code", field: "hotworkCode" },
      { header: "Date of Hotwork", field: "dateOfHotwork" },
      { header: "Type of Hotwork", field: "hotworkType" },
      { header: "Department | Sub-Department", field: "departmentSection" },
      { header: "Hotwork Location", field: "hotworkLocation" },
      { header: "Adjacent Compartment", field: "adjacentCompartments" },
      { header: "Hotwork Sentry Names", field: "sentryNames" },
      { header: "Hotwork Description", field: "descriptionOfHotwork" },
      { header: "Approval Status", field: "status" },
    ];
    this.exportService.export(
      kind,
      title,
      columns,
      this.filteredRowData() as unknown as Record<string, unknown>[],
      `HotworkOutbox_${new Date().toISOString().slice(0, 10)}`
    );
  }

  downloadCSV(): void {
    const headers = [
      "Ser",
      "Hotwork Code",
      "Date of Hotwork",
      "Type of Hotwork",
      "Department | Sub-Department",
      "Hotwork Location",
      "Adjacent Compartment",
      "Hotwork Sentry Names",
      "Hotwork Description",
      "Approval Status",
    ];
    const rows = this.filteredRowData().map((r) => [
      r.sNo,
      `"${r.hotworkCode || ""}"`,
      `"${r.dateOfHotwork || ""}"`,
      `"${r.hotworkType || ""}"`,
      `"${r.departmentSection || ""}"`,
      `"${r.hotworkLocation || ""}"`,
      `"${r.adjacentCompartments || ""}"`,
      `"${r.sentryNames || ""}"`,
      `"${r.descriptionOfHotwork || ""}"`,
      `"${r.status || ""}"`,
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((e) => e.join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `HotworkOutbox_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
