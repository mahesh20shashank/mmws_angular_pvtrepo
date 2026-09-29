import { Component, signal, computed, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { RowData } from "ag-grid-community";

import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { ButtonComponent } from "../../../../shared/components/button/button.component";
import { MasterCard } from "../../../refit-maintenance/master-card/master-card";
import {
  DropdownOption,
  SelectInput,
} from "../../../../shared/components/select-input/select-input";

import { DefectActionRenderer } from "../renderer/defect-action-renderer";
import { DefectDartNoRenderer } from "../renderer/defect-dart-no-renderer";
import { CmmsSyncStatusRenderer } from "../renderer/cmms-sync-status-renderer";
import { GridStatusChipRenderer } from "../../../../shared/components/data-grid/grid-status-chip-renderer";
import { DefectActionForm } from "../defect-action-form/defect-action-form";
import { DefectRecordDetailsModal } from "../defect-record-details-modal/defect-record-details-modal";
import { RecentActivityModal } from "../recent-activity-modal/recent-activity-modal";
import { OperationalMaintenanceApi } from "../../services/operational-maintenance-api";
import { AppService, NotificationService } from "../../../../Core";

// TEMP: dummy rows so the "awaiting sync" hover/click behaviour can be tested
// without the backend — remove once getRowData() is relied on exclusively.
// const DUMMY_DEFECT_ROWS: any[] = [
//   {
//     id: 1,
//     dart_number: "DART-2026-0142",
//     equipment_name: "LO Pump - ME No.1",
//     trigger: "Inspection",
//     status: "In Progress – With FMU",
//     dart_date: "22-Jun-26",
//     severity: "OPDEF",
//     reason: "Defect",
//     cmms_sync_status: false,
//     equipment_nomenclature: "PUMP,LUB OIL,CENTRIFUGAL",
//     equipment_serial_no: "SNME0142-A",
//     location_on_board: "Machinery Space No.1",
//     equipment_availability_status: "Partially Non Ops",
//     defect_rectified: "No",
//     spares_used: "Yes",
//     defect_description:
//       "Excessive vibration and abnormal noise observed on the drive-end bearing during routine running. Suspected bearing wear; equipment run restricted pending rectification.",
//   },
//   {
//     id: 2,
//     dart_number: "DART-2026-0139",
//     equipment_name: "Sea Viper Director",
//     trigger: "OST Observation",
//     status: "In Progress – With FMU",
//     dart_date: "18-Jun-26",
//     severity: "OPDEF (STA)",
//     reason: "ABER",
//     cmms_sync_status: true,
//     equipment_nomenclature: "DIRECTOR,MISSILE,TRACKING",
//     equipment_serial_no: "SVD0139-B",
//     location_on_board: "Ops Room",
//     equipment_availability_status: "Non Operational",
//     defect_rectified: "No",
//     spares_used: "No",
//     defect_description:
//       "Tracking radar intermittently loses lock during OST observation; suspected servo fault under investigation.",
//   },
//   {
//     id: 3,
//     dart_number: "DART-2026-0136",
//     equipment_name: "Painting — Hull",
//     trigger: "Not Applicable",
//     status: "In Progress – With Yard",
//     dart_date: "16-Jun-26",
//     severity: "Normal Defect",
//     reason: "Services",
//     cmms_sync_status: true,
//     equipment_nomenclature: "HULL,EXTERNAL,COATING",
//     equipment_serial_no: "-",
//     location_on_board: "Hull — Waterline",
//     equipment_availability_status: "Fully Operational",
//     defect_rectified: "No",
//     spares_used: "No",
//     defect_description:
//       "Localised coating breakdown observed along the waterline; recoating scheduled with yard support.",
//   },
//   {
//     id: 4,
//     dart_number: "DART-2026-0131",
//     equipment_name: "440V Switchboard",
//     trigger: "Not Applicable",
//     status: "Closed",
//     dart_date: "15-Jun-26",
//     severity: "Normal Defect",
//     reason: "Defect",
//     cmms_sync_status: true,
//     equipment_nomenclature: "SWITCHBOARD,440V,MAIN",
//     equipment_serial_no: "SB0131-C",
//     location_on_board: "Main Switchboard Room",
//     equipment_availability_status: "Fully Operational",
//     defect_rectified: "Yes",
//     spares_used: "Yes",
//     defect_description:
//       "Loose terminal connection on outgoing feeder causing intermittent tripping; terminals re-torqued and tested satisfactory.",
//   },
//   {
//     id: 5,
//     dart_number: "DART-2026-0145",
//     equipment_name: "Gyro Compass",
//     trigger: "Inspection",
//     status: "Draft",
//     dart_date: "14-Jun-26",
//     severity: "Normal Defect",
//     reason: "Defect",
//     cmms_sync_status: false,
//     equipment_nomenclature: "COMPASS,GYRO,MASTER",
//     equipment_serial_no: "GC0145-D",
//     location_on_board: "Compass Platform",
//     equipment_availability_status: "Partially Non Ops",
//     defect_rectified: "No",
//     spares_used: "No",
//     defect_description:
//       "Heading drift noted during routine inspection; recalibration pending.",
//   },
//   {
//     id: 6,
//     dart_number: "DART-2026-0128",
//     equipment_name: "Diesel Alternator",
//     trigger: "Not Applicable",
//     status: "In Progress",
//     dart_date: "11-Jun-26",
//     severity: "Normal Defect",
//     reason: "As&As",
//     cmms_sync_status: true,
//     equipment_nomenclature: "ALTERNATOR,DIESEL,AUX",
//     equipment_serial_no: "DA0128-E",
//     location_on_board: "Engine Room",
//     equipment_availability_status: "Partially Non Ops",
//     defect_rectified: "No",
//     spares_used: "Yes",
//     defect_description:
//       "Abnormal exhaust smoke observed during As&As; fuel injection system under inspection.",
//   },
//   {
//     id: 7,
//     dart_number: "DART-2026-0124",
//     equipment_name: "Fire Main Pump",
//     trigger: "Trial Agency Observation",
//     status: "In Progress – With FMU",
//     dart_date: "09-Jun-26",
//     severity: "OPDEF",
//     reason: "Defect",
//     cmms_sync_status: false,
//     equipment_nomenclature: "PUMP,FIRE MAIN,CENTRIFUGAL",
//     equipment_serial_no: "FMP0124-F",
//     location_on_board: "Machinery Space No.2",
//     equipment_availability_status: "Non Operational",
//     defect_rectified: "No",
//     spares_used: "Yes",
//     defect_description:
//       "Pump fails to build rated pressure on trial; suspected impeller wear, FMU assistance requested.",
//   },
//   {
//     id: 8,
//     dart_number: "DART-2026-0119",
//     equipment_name: "Crane — Dockyard",
//     trigger: "Not Applicable",
//     status: "Closed",
//     dart_date: "05-Jun-26",
//     severity: "Normal Defect",
//     reason: "Services",
//     cmms_sync_status: true,
//     equipment_nomenclature: "CRANE,DOCKYARD,MOBILE",
//     equipment_serial_no: "-",
//     location_on_board: "Jetty",
//     equipment_availability_status: "Fully Operational",
//     defect_rectified: "Yes",
//     spares_used: "No",
//     defect_description:
//       "Minor hydraulic leak at boom cylinder reported by dockyard; seal replaced and function tested.",
//   },
// ];

@Component({
  selector: "app-defect-view",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DataGrid,
    IconComponent,
    ButtonComponent,
    MasterCard,
    SelectInput,
    DefectActionForm,
    DefectRecordDetailsModal,
    RecentActivityModal,
  ],
  templateUrl: "./defect-view.html",
  styleUrl: "./defect-view.css",
})
export class DefectView implements OnInit {
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private opService = inject(OperationalMaintenanceApi);
  private readonly notification = inject(NotificationService);
  private appService = inject(AppService);

  searchText = "";
  showFilters = false;
  isOpenDefectForm: boolean = false;
  readonly selectedRecord = signal<any | null>(null);
  readonly showRecentActivity = signal(false);
  pageNo: number = 1;
  size: number = 10;
  totalRecords: number = 0;

  readonly tabs: {
    shortLabel: string;
    activeLabel: string;
    value: "all" | "OPDEF" | "OPDEM" | "CANDEF";
  }[] = [
    { shortLabel: "DART", activeLabel: "DART List", value: "all" },
    {
      shortLabel: "OPDEF",
      activeLabel: "OPDEF / OPDEF (STA) List",
      value: "OPDEF",
    },
    { shortLabel: "OPDEM", activeLabel: "OPDEM List", value: "OPDEM" },
    { shortLabel: "CANDEF", activeLabel: "CANDEF List", value: "CANDEF" },
  ];
  readonly activeTab = signal<"all" | "OPDEF" | "OPDEM" | "CANDEF">("all");

  readonly syncStatus = signal("Online");

  /** Hover previews the "what's pending" view; click pins it so it stays after the
   * mouse leaves. Either one being true brings pending rows to the top and highlights them. */
  private readonly syncBannerHover = signal(false);
  readonly syncBannerPinned = signal(false);
  readonly syncFocusActive = computed(
    () => this.syncBannerHover() || this.syncBannerPinned(),
  );

  onSyncBannerEnter(): void {
    this.syncBannerHover.set(true);
  }

  onSyncBannerLeave(): void {
    this.syncBannerHover.set(false);
  }

  onSyncBannerClick(): void {
    this.syncBannerPinned.update((pinned) => !pinned);
  }

  readonly filterForm = this.fb.group({
    currentStatus: [""],
    severity: [""],
    reason: [""],
    dateRange: [""],
  });

  private readonly filterValues = signal(this.filterForm.value);

  constructor() {
    this.filterForm.valueChanges.subscribe((value) =>
      this.filterValues.set(value),
    );
  }
  ngOnInit(): void {
    this.getRowData();
  }
  getRowData() {
    this.appService.showLoader();
    this.opService.getRowDataDefect(this.pageNo, this.size).subscribe({
      next: (res: any) => {
        this.totalRecords = res.data.count;
        this.rowData.set(res.data.results);
        this.appService.hideLoader();
      },
      error: (e: any) => {
        this.appService.showLoader();
      },
    });
  }
  readonly selectedRows = signal<any[]>([]);
  readonly hasSelection = computed(() => this.selectedRows().length > 0);

  onSelectionChanged(rows: RowData[]): void {
    this.selectedRows.set(rows as any[]);
  }

  rowData = signal<any[]>([]);

  /** Sync-focus view: while the banner is hovered or pinned, rows still awaiting
   * shore sync (cmms_sync_status === false) are moved to the top, keeping each
   * group's relative order. Un-hovering or clicking again drops syncFocusActive
   * back to false and this simply returns the rows in their original order. */
  readonly sortedRowData = computed(() => {
    const rows = this.rowData();
    if (!this.syncFocusActive()) return rows;

    const pending = rows.filter((row) => row.cmms_sync_status === false);
    const synced = rows.filter((row) => row.cmms_sync_status !== false);
    return [...pending, ...synced];
  });

  /** Row highlight for the sync-focus view: pending rows stand out, already-synced rows
   * dim back. `rowClassRules` (unlike `getRowClass`) is re-evaluated by ag-grid on every
   * refresh, so each class is added AND removed correctly as `syncFocusActive` toggles —
   * the table reliably returns to its normal look on unhover/unselect. */
  readonly rowClassRules = {
    "row-sync-pending": (params: { data: RowData }) =>
      this.syncFocusActive() && (params.data as any).cmms_sync_status === false,
    "row-sync-dim": (params: { data: RowData }) =>
      this.syncFocusActive() && (params.data as any).cmms_sync_status !== false,
  };

  readonly recordCount = computed(() => this.rowData().length);

  readonly pendingSyncCount = computed(
    () => this.rowData().filter((row) => row.cmms_sync_status === false).length,
  );

  private readonly toOptions = (values: Iterable<string>): DropdownOption[] =>
    [...new Set(values)].map((value) => ({ label: value, value }));

  readonly statusOptions = computed<DropdownOption[]>(() => [
    { label: "All Current Status", value: "" },
    ...this.toOptions(this.rowData().map((row) => row.status)),
  ]);

  readonly severityOptions = computed<DropdownOption[]>(() => [
    { label: "All Severity", value: "" },
    ...this.toOptions(this.rowData().map((row) => row.severity)),
  ]);

  readonly reasonOptions = computed<DropdownOption[]>(() => [
    { label: "All Reason", value: "" },
    ...this.toOptions(this.rowData().map((row) => row.reason)),
  ]);

  readonly dateRangeOptions: DropdownOption[] = [
    { label: "All Date Range", value: "" },
    { label: "Today", value: "today" },
    { label: "Last 7 Days", value: "last_7_days" },
    { label: "Last 30 Days", value: "last_30_days" },
    { label: "This Month", value: "this_month" },
    { label: "Last Month", value: "last_month" },
  ];

  readonly statusToneMap: Record<
    string,
    "success" | "warning" | "danger" | "info" | "neutral"
  > = {
    "In Progress – With FMU": "warning",
    "In Progress – With Yard": "warning",
    "In Progress": "warning",
    Closed: "success",
    Draft: "neutral",
  };

  // Fixed (not `flex`) widths — the grid keeps its natural content width and
  // scrolls horizontally (themed in defect-view.css) once that width exceeds
  // the panel, rather than the columns compressing to fit.
  colDef = [
    {
      field: "dart_number",
      headerName: "DART No.",
      width: 220,
      cellRenderer: DefectDartNoRenderer,
      cellRendererParams: {
        onResume: (row: any) => this.resumeDraft(row),
        onView: (row: any) => this.viewRecordDetails(row),
      },
    },
    {
      field: "equipment_name",
      headerName: "Equipment / Service",
    },
    { field: "trigger", headerName: "Trigger" },
    {
      field: "status",
      headerName: "Status",
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: this.statusToneMap },
    },
    { field: "dart_date", headerName: "Date Occurred" },
    {
      field: "cmms_sync_status",
      headerName: "Shore Sync",
      cellRenderer: CmmsSyncStatusRenderer,
    },
    {
      field: "actions",
      headerName: "Action",
      suppressCellFocus: true,
      sortable: false,
      pinned: "right",
      width: 90,
      cellRenderer: DefectActionRenderer,
      cellRendererParams: {
        onEdit: (row: any) => this.editDefect(row),
        onDelete: (row: any) => this.deleteDraft(row),
      },
    },
  ];

  rowId = (data: RowData) => String((data as unknown as any).id);

  onSearch(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value;
  }

  clearFilters(): void {
    this.searchText = "";
    this.filterForm.reset({
      currentStatus: "",
      severity: "",
      reason: "",
      dateRange: "",
    });
  }

  goToRecentActivity(): void {
    this.showRecentActivity.set(true);
  }

  closeRecentActivity(): void {
    this.showRecentActivity.set(false);
  }

  goToApprovalRaStatus(): void {}

  goToAddDefect(): void {
    this.isOpenDefectForm = true;
  }

  goToRaDraft(): void {
    const selected = this.selectedRows();
    console.log("Selected DARTs sent to Raise RA:", selected);
    this.router.navigateByUrl("/afterAuth/op-maintenance/defect/actions/raise-ra", {
      state: { selectedRows: selected },
    });
  }

  editDefect(row: any): void {
    // this.router.navigateByUrl(
    //   `/afterAuth/op-maintenance/defect/defect/${row.id}`,
    // );
  }

  resumeDraft(row: any): void {
    // this.router.navigateByUrl(
    //   `/afterAuth/op-maintenance/defect/defect/${row.id}`,
    // );
  }

  viewRecordDetails(row: any): void {
    this.appService.showLoader();

    this.opService.getDefectDetail(row.id).subscribe({
      next: (res: any) => {
        console.log(res.data);
        this.selectedRecord.set(res.data);
        this.appService.hideLoader();
      },
      error: (e) => {
        this.selectedRecord.set(null);
        this.notification.error(e.error.message);
        this.appService.hideLoader();
      },
    });
  }

  closeRecordDetailsModal(): void {
    this.selectedRecord.set(null);
  }

  deleteDraft(row: any): void {
    this.rowData.update((rows) => rows.filter((r) => r.id !== row.id));
  }
  backFromAction(event:any) {
    this.isOpenDefectForm = false;
    this.getRowData();
  }
}
