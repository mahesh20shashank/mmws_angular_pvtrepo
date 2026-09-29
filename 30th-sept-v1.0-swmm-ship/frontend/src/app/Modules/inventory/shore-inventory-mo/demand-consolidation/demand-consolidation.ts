import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ColDef, RowData } from "ag-grid-community";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { TextActionRenderer } from "../../../../shared/components/data-grid/grid-text-action-renderer";
import { DetailDrawer } from "../../../../shared/components/detail-drawer/detail-drawer";
import { DynamicField, DynamicFieldSpec } from "../../../../shared/components/dynamic-field/dynamic-field";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { NotificationService } from "../../../../Core/services/notification/notification.service";

interface ConsolidationRow extends RowData {
  srNo: number;
  custCode: string;
  itemCode: string;
  demo: string;
  description: string;
  demandQty: number;
  demandNo: string;
  dtRaised: string;
  drmRegistered: string;
  dateRequirement: string;
  stnCode: string;
  priorityCode: string;
  urgencyRef: string;
  equipmentCode: string;
  authority: string;
  requestNo: string;
  dtmRequest: string;
  custName: string;
  den: string;
  crp: string;
  authTp: string;
  requestByRole: string;
  qtyRequest: number;
  qtyApproved: number;
  selStnCode: string;
  demandingStn: string;
  authorityRef: string;
  authorityRefUnit: string;
  authorityDeUnit: string;
  cli: string;
  namecode: string;
  status: "pending" | "generated" | "rejected";
}

type DrawerKind = "reject" | "generate" | "hq" | null;

const FIELDS: DynamicFieldSpec[] = [
  {
    key: "demandType",
    label: "Demand Type",
    kind: "select",
    options: [
      { label: "Consolidated Demand to be Forward for HQ Approval", value: "hq" },
      { label: "Consolidated Demand to be Forward to Mo", value: "mo" },
    ],
  },
  { key: "itemCode", label: "Item Code", kind: "text" },
  {
    key: "authorityCode",
    label: "Authority Type",
    kind: "select",
    options: [
      { label: "ABR", value: "ABR" },
      { label: "ARS", value: "ARS" },
      { label: "PTS", value: "PTS" },
    ],
  },
];

const ROWS: ConsolidationRow[] = [
  {
    srNo: 1, custCode: "EA3050TRN421529402060", itemCode: "ITM001", demo: "NO",
    description: "Diesel, rubber, ship related items", demandQty: 100, demandNo: "DMD-001",
    dtRaised: "2026-02-01", drmRegistered: "No", dateRequirement: "-", stnCode: "STN01",
    priorityCode: "P1", urgencyRef: "U1", equipmentCode: "EQ-001", authority: "AUTH-001",
    requestNo: "REQ-2026-001", dtmRequest: "2026-02-10 10:00:00", custName: "Customer A",
    den: "DEN-001", crp: "CRP-001", authTp: "AUTH-TP-001", requestByRole: "Manager",
    qtyRequest: 100, qtyApproved: 100, selStnCode: "STN01", demandingStn: "STN-DEM-001",
    authorityRef: "AUTH-REF-001", authorityRefUnit: "AUTH-REF-UNIT-001", authorityDeUnit: "AUTH-DE-UNIT-001",
    cli: "CLI-00123", namecode: "NC-8899", status: "pending",
  },
  {
    srNo: 2, custCode: "EA3050TRN421529402061", itemCode: "ITM002", demo: "NO",
    description: "Diesel, rubber, ship related items", demandQty: 250, demandNo: "DMD-002",
    dtRaised: "2026-02-02", drmRegistered: "No", dateRequirement: "-", stnCode: "STN02",
    priorityCode: "P2", urgencyRef: "U2", equipmentCode: "EQ-002", authority: "AUTH-002",
    requestNo: "REQ-2026-002", dtmRequest: "2026-02-10 11:00:00", custName: "Customer B",
    den: "DEN-002", crp: "CRP-002", authTp: "AUTH-TP-002", requestByRole: "Supervisor",
    qtyRequest: 250, qtyApproved: 250, selStnCode: "STN02", demandingStn: "STN-DEM-002",
    authorityRef: "AUTH-REF-002", authorityRefUnit: "AUTH-REF-UNIT-002", authorityDeUnit: "AUTH-DE-UNIT-002",
    cli: "CLI-00124", namecode: "NC-8890", status: "pending",
  },
  {
    srNo: 3, custCode: "EA3050TRN421529402062", itemCode: "ITM003", demo: "YES",
    description: "Diesel, rubber, ship related items", demandQty: 175.5, demandNo: "DMD-003",
    dtRaised: "2026-02-03", drmRegistered: "Yes", dateRequirement: "2026-02-10", stnCode: "STN03",
    priorityCode: "P3", urgencyRef: "U3", equipmentCode: "EQ-003", authority: "AUTH-003",
    requestNo: "REQ-2026-003", dtmRequest: "2026-02-10 12:00:00", custName: "Customer C",
    den: "DEN-003", crp: "CRP-003", authTp: "AUTH-TP-003", requestByRole: "Engineer",
    qtyRequest: 175.5, qtyApproved: 175.5, selStnCode: "STN03", demandingStn: "STN-DEM-003",
    authorityRef: "AUTH-REF-003", authorityRefUnit: "AUTH-REF-UNIT-003", authorityDeUnit: "AUTH-DE-UNIT-003",
    cli: "CLI-00125", namecode: "NC-8891", status: "pending",
  },
];

const HELP_HTML = `<p class="mb-0">Filter individual customer demands by item code or authority type. Click
  Add on a row to review it before generating a consolidated demand, Reject to drop it with a reason, or the
  HQ Approval action once a consolidated demand is ready to forward.</p>`;

/**
 * Reference: `ilms/transaction/demand_consolidation.html`. The real backend has a `consolidation`
 * GET action (`DemandDetailsViewSet.consolidation`), but it returns an aggregated item+vendor+count
 * shape with no per-row add/reject action — it doesn't fit this page's interactive per-customer-
 * demand UI, so this stays local/demo, matching the reference's own 3 sidebars.
 */
@Component({
  selector: "app-mo-demand-consolidation",
  standalone: true,
  imports: [ReactiveFormsModule, DynamicField, DataGrid, HelpGuidance, DetailDrawer, ButtonComponent],
  templateUrl: "./demand-consolidation.html",
  styleUrl: "./demand-consolidation.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemandConsolidation {
  private readonly notifications = inject(NotificationService);

  readonly helpHtml = HELP_HTML;
  readonly fields = FIELDS;
  readonly rows = signal<ConsolidationRow[]>(ROWS);
  readonly form = new FormGroup(Object.fromEntries(FIELDS.map((f) => [f.key, new FormControl("")])));

  readonly activeRow = signal<ConsolidationRow | null>(null);
  readonly drawer = signal<DrawerKind>(null);
  readonly rejectReason = new FormControl("");

  readonly columnDefs: ColDef[] = [
    { field: "srNo", headerName: "Sr No", width: 80 },
    { field: "custCode", headerName: "Cust Code" },
    { field: "itemCode", headerName: "Item Code", width: 110 },
    { field: "demo", headerName: "Demo", width: 90 },
    { field: "description", headerName: "Description" },
    { field: "demandQty", headerName: "Demand Qty", width: 120 },
    {
      headerName: "Action",
      width: 180,
      sortable: false,
      filter: false,
      cellRenderer: TextActionRenderer,
      cellRendererParams: {
        actions: (row: RowData) => [
          { label: "Add", color: "#1d96e9", action: () => this.open(row as ConsolidationRow, "generate") },
          { label: "Reject", color: "#dc2626", action: () => this.open(row as ConsolidationRow, "reject") },
          { label: "HQ", color: "#7c3aed", action: () => this.open(row as ConsolidationRow, "hq") },
        ],
      },
    },
  ];

  getControl(key: string): FormControl {
    return this.form.get(key) as FormControl;
  }

  clear(): void {
    this.form.reset();
  }

  open(row: ConsolidationRow, drawer: Exclude<DrawerKind, null>): void {
    this.activeRow.set(row);
    this.drawer.set(drawer);
    this.rejectReason.reset("");
  }

  close(): void {
    this.activeRow.set(null);
    this.drawer.set(null);
  }

  reject(): void {
    const row = this.activeRow();
    if (!row) return;
    if (!this.rejectReason.value?.trim()) {
      this.notifications.error("Enter a reason before rejecting.");
      return;
    }
    this.rows.update((rows) => rows.filter((r) => r.custCode !== row.custCode));
    this.notifications.success(`Rejected internal demand for ${row.custCode}.`);
    this.close();
  }

  generate(): void {
    const row = this.activeRow();
    if (!row) return;
    this.rows.update((rows) => rows.map((r) => (r.custCode === row.custCode ? { ...r, status: "generated" } : r)));
    this.notifications.success(`Internal demand ${row.demandNo} generated for ${row.custCode}.`);
    this.close();
  }

  approveForHq(): void {
    const row = this.activeRow();
    if (!row) return;
    this.notifications.success(`${row.custCode} approved for HQ.`);
    this.close();
  }
}
