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
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import { DetailDrawer } from "../../../../shared/components/detail-drawer/detail-drawer";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import {
  CommonApiService,
  HotworkItem,
} from "../../../../Core/http/services/api.service";
import { PrintColumn, ReportExportService } from "../../../../Core/services/export/generic-export.service";

const HELP_HTML = `<p class="mb-0">Manage active hot work permits, inspect safety risk assessments, verify fire watch precautions, and track permit progress across compartments. Click any row to open detailed drawer specs.</p>`;

export interface HotworkRecord {
  sNo: number;
  hotworkCode: string;
  parentCode: string;
  dateOfHotwork: string;
  departmentSection: string;
  descriptionOfHotwork: string;
  locationAdjacent: string;
  hotworkType: string;
  currentStatus: string;
  safeToWeldCert: string;
  rawApiItem?: HotworkItem;
}

@Component({
  selector: "app-hotwork-detail-action-renderer",
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
export class HotworkDetailActionRenderer implements ICellRendererAngularComp {
  private params: (ICellRendererParams & { onClick?: (data: HotworkRecord) => void }) | null = null;

  agInit(params: ICellRendererParams & { onClick?: (data: HotworkRecord) => void }): void {
    this.params = params;
  }

  refresh(params: ICellRendererParams & { onClick?: (data: HotworkRecord) => void }): boolean {
    this.params = params;
    return true;
  }

  onClick(event: MouseEvent): void {
    event.stopPropagation();
    if (this.params?.data && typeof this.params.onClick === "function") {
      this.params.onClick(this.params.data as HotworkRecord);
    }
  }
}

@Component({
  selector: "app-manage-hotwork",
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
  ],
  templateUrl: "./manage-hotwork.component.html",
  styleUrl: "./manage-hotwork.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageHotworkComponent implements OnInit {
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

  // Master Hotwork Records (Fetched from API)
  readonly hotworkRecords = signal<HotworkRecord[]>([]);

  ngOnInit(): void {
    this.commonApiService.getHotworkList().subscribe({
      next: (res) => {
        if (res && Array.isArray(res)) {
          const mapped: HotworkRecord[] = res.map(
            (item: HotworkItem, index: number) => ({
              sNo: index + 1,
              hotworkCode: item.hotwork_code || `HW-2026-00${item.id}`,
              parentCode: item.created_by_name || "-",
              dateOfHotwork: item.date_of_hotwork || "-",
              departmentSection: item.hotwork_incharge_name || "-",
              descriptionOfHotwork: `${item.type_of_hotwork || "Hotwork"} Work`,
              locationAdjacent: item.location_of_hotwork || "-",
              hotworkType: item.type_of_hotwork || "-",
              currentStatus:
                item.current_status || item.approval_status || "Pending",
              safeToWeldCert: item.night_work ? "Issued" : "Pending",
              rawApiItem: item,
            }),
          );
          this.hotworkRecords.set(mapped);
        } else {
          this.hotworkRecords.set([]);
        }
      },
      error: (err) => {
        console.warn("API GET /api/v1/hotwork/ fallback", err);
        this.hotworkRecords.set([]);
      },
    });
  }

  // AG-Grid DataGrid Column Definitions
  readonly manageColumnDefs: ColDef[] = [
    { headerName: "Sr No", field: "sNo", width: 90, minWidth: 80 },
    {
      headerName: "Hotwork Code",
      field: "hotworkCode",
      flex: 1.2,
      minWidth: 130,
    },
    { headerName: "Parent Code", field: "parentCode", flex: 1, minWidth: 110 },
    {
      headerName: "Date of Hotwork",
      field: "dateOfHotwork",
      flex: 1.2,
      minWidth: 130,
    },
    {
      headerName: "Department/Section",
      field: "departmentSection",
      flex: 1.3,
      minWidth: 140,
    },
    {
      headerName: "Description of Hotwork",
      field: "descriptionOfHotwork",
      flex: 2,
      minWidth: 180,
    },
    {
      headerName: "Location/Adjacent Compartments",
      field: "locationAdjacent",
      flex: 2,
      minWidth: 180,
    },
    {
      headerName: "Hotwork Type",
      field: "hotworkType",
      flex: 1.1,
      minWidth: 110,
    },
    {
      headerName: "Current Status",
      field: "currentStatus",
      flex: 1.1,
      minWidth: 110,
      cellRenderer: (params: ICellRendererParams) => {
        const status =
          typeof params.value === "string" ? params.value : "Pending";
        let statusStyle =
          "background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);";
        if (status === "Active") {
          statusStyle =
            "background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3);";
        } else if (status === "Completed") {
          statusStyle =
            "background: rgba(59,130,246,0.15); color: #3b82f6; border: 1px solid rgba(59,130,246,0.3);";
        }
        return `<span style="padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; ${statusStyle}">${status}</span>`;
      },
    },
    {
      headerName: "Detail View",
      field: "detailView",
      width: 110,
      minWidth: 100,
      cellRenderer: HotworkDetailActionRenderer,
      cellRendererParams: {
        onClick: (record: HotworkRecord) => this.onRowClicked(record),
      },
      sortable: false,
      filter: false,
    },
    {
      headerName: "Safe To Weld Cert",
      field: "safeToWeldCert",
      flex: 1.2,
      minWidth: 130,
      cellRenderer: (params: ICellRendererParams) => {
        const cert = typeof params.value === "string" ? params.value : "N/A";
        return `<span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: rgba(6,78,59,0.6); color: #34d399; border: 1px solid rgba(6,95,70,0.6);">${cert}</span>`;
      },
    },
  ];

  // Filters
  readonly globalSearch = signal<string>("");
  readonly pageSize = signal<number>(10);

  readonly filteredRecords = computed(() => {
    const list = this.hotworkRecords();
    const search = this.globalSearch().toLowerCase().trim();
    if (!search) return list;

    return list.filter((r) => {
      return (
        r.sNo.toString().includes(search) ||
        r.hotworkCode.toLowerCase().includes(search) ||
        r.parentCode.toLowerCase().includes(search) ||
        r.dateOfHotwork.toLowerCase().includes(search) ||
        r.departmentSection.toLowerCase().includes(search) ||
        r.descriptionOfHotwork.toLowerCase().includes(search) ||
        r.locationAdjacent.toLowerCase().includes(search) ||
        r.hotworkType.toLowerCase().includes(search) ||
        r.currentStatus.toLowerCase().includes(search)
      );
    });
  });

  onExport(kind: ExportKind): void {
    const title = "Manage Hotwork Requisitions";
    const columns: PrintColumn[] = [
      { header: "Sr No", field: "sNo" },
      { header: "Hotwork Code", field: "hotworkCode" },
      { header: "Parent Code", field: "parentCode" },
      { header: "Date of Hotwork", field: "dateOfHotwork" },
      { header: "Department / Section", field: "departmentSection" },
      { header: "Description of Hotwork", field: "descriptionOfHotwork" },
      { header: "Location / Adjacent Compartments", field: "locationAdjacent" },
      { header: "Hotwork Type", field: "hotworkType" },
      { header: "Current Status", field: "currentStatus" },
    ];
    this.exportService.export(
      kind,
      title,
      columns,
      this.filteredRecords() as unknown as Record<string, unknown>[],
      `ManageHotwork_${new Date().toISOString().slice(0, 10)}`
    );
  }

  copyData(): void {
    const headers = [
      "Sr No",
      "Hotwork Code",
      "Parent Code",
      "Date of Hotwork",
      "Department/Section",
      "Description of Hotwork",
      "Location/Adjacent Compartments",
      "Hotwork Type",
      "Current Status",
    ];
    const rows = this.filteredRecords().map((r) =>
      [
        r.sNo,
        r.hotworkCode,
        r.parentCode,
        r.dateOfHotwork,
        r.departmentSection,
        r.descriptionOfHotwork,
        r.locationAdjacent,
        r.hotworkType,
        r.currentStatus,
      ].join("\t"),
    );
    const text = [headers.join("\t"), ...rows].join("\n");
    navigator.clipboard.writeText(text);
  }
}
