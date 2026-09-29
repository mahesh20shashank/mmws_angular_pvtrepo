import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ColDef, RowData } from "ag-grid-community";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { ActionRendererComponent } from "../../../../shared/components/data-grid/grid-action-icons";
import { DetailDrawer } from "../../../../shared/components/detail-drawer/detail-drawer";
import { DynamicField, DynamicFieldSpec } from "../../../../shared/components/dynamic-field/dynamic-field";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { NotificationService } from "../../../../Core/services/notification/notification.service";

interface IssueAuthoriseRow extends RowData {
  srNo: number;
  internalDemandNo: string;
  authorityTp: string;
  itemCode: string;
  deptCode: string;
  subDepartmentCode: string;
  logoStock: string;
  demandQty: number;
  issueQty: number;
  issuedDatetime: string;
  shNo: string;
  intStockSerial: string;
  handedOverQty: number;
  authorised: boolean;
}

const FIELDS: DynamicFieldSpec[] = [
  {
    key: "demandType",
    label: "Demand Type",
    kind: "select",
    options: [
      { label: "Demands Pending for Issue", value: "pending" },
      { label: "Closed demand", value: "closed" },
    ],
  },
  { key: "internalDemandNo", label: "Internal Demand No", kind: "text" },
  {
    key: "specification",
    label: "Specification",
    kind: "select",
    options: [
      { label: "ABR", value: "ABR" },
      { label: "ARS", value: "ARS" },
      { label: "PTS", value: "PTS" },
    ],
  },
];

const ROWS: IssueAuthoriseRow[] = [
  {
    srNo: 1, internalDemandNo: "IA-2026-001", authorityTp: "AUTH-001", itemCode: "ITM001", deptCode: "DEPT001",
    subDepartmentCode: "SUB-DEPT-001", logoStock: "LGO-STK-001", demandQty: 100, issueQty: 50,
    issuedDatetime: "2026-02-10 10:30:00", shNo: "SH-001", intStockSerial: "ISS-001-A", handedOverQty: 50, authorised: false,
  },
  {
    srNo: 2, internalDemandNo: "IA-2026-002", authorityTp: "AUTH-002", itemCode: "ITM002", deptCode: "DEPT002",
    subDepartmentCode: "SUB-DEPT-002", logoStock: "LGO-STK-002", demandQty: 250, issueQty: 150,
    issuedDatetime: "2026-02-09 14:15:00", shNo: "SH-002", intStockSerial: "ISS-002-B", handedOverQty: 150, authorised: false,
  },
  {
    srNo: 3, internalDemandNo: "IA-2026-003", authorityTp: "AUTH-003", itemCode: "ITM003", deptCode: "DEPT003",
    subDepartmentCode: "SUB-DEPT-003", logoStock: "LGO-STK-003", demandQty: 175.5, issueQty: 100,
    issuedDatetime: "2026-02-08 11:45:00", shNo: "SH-003", intStockSerial: "ISS-003-C", handedOverQty: 100, authorised: false,
  },
  {
    srNo: 4, internalDemandNo: "IA-2026-004", authorityTp: "AUTH-004", itemCode: "ITM004", deptCode: "DEPT004",
    subDepartmentCode: "SUB-DEPT-004", logoStock: "LGO-STK-004", demandQty: 300, issueQty: 200,
    issuedDatetime: "2026-02-07 09:20:00", shNo: "SH-004", intStockSerial: "ISS-004-D", handedOverQty: 200, authorised: false,
  },
];

const HELP_HTML = `<p class="mb-0">Lists internal demands pending issue authorization, showing the demanded and
  issued quantity for each. Click Add on a row to review the issue details and authorize the handover.</p>`;

/**
 * Reference: `ilms/transaction/issue_auth.html`. No real "issue authorization" action exists
 * anywhere in the backend (confirmed against the current `ilms` DRF API) — this stays local/demo,
 * same fidelity as the reference itself, matching its "Internal Issue Details" sidebar + Authorize
 * button.
 */
@Component({
  selector: "app-mo-issue-authorise",
  standalone: true,
  imports: [ReactiveFormsModule, DynamicField, DataGrid, HelpGuidance, DetailDrawer, ButtonComponent],
  templateUrl: "./issue-authorise.html",
  styleUrl: "./issue-authorise.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IssueAuthorise {
  private readonly notifications = inject(NotificationService);

  readonly helpHtml = HELP_HTML;
  readonly fields = FIELDS;
  readonly rows = signal<IssueAuthoriseRow[]>(ROWS);
  readonly activeRow = signal<IssueAuthoriseRow | null>(null);
  readonly form = new FormGroup(Object.fromEntries(FIELDS.map((f) => [f.key, new FormControl("")])));

  readonly columnDefs: ColDef[] = [
    { field: "srNo", headerName: "Sr No", width: 80 },
    { field: "internalDemandNo", headerName: "Internal Demand No", width: 160 },
    { field: "authorityTp", headerName: "AuthorityTP", width: 120 },
    { field: "itemCode", headerName: "Item Code", width: 110 },
    { field: "deptCode", headerName: "Dept Code", width: 110 },
    { field: "subDepartmentCode", headerName: "SubDepartmentCode", width: 160 },
    { field: "logoStock", headerName: "LogoStock", width: 120 },
    { field: "demandQty", headerName: "Demand Qty", width: 110 },
    { field: "issueQty", headerName: "Issue Qty", width: 110 },
    {
      headerName: "Action",
      width: 90,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: RowData) => [
          { icon: "add", label: "Add", color: "#1d96e9", action: () => this.activeRow.set(row as IssueAuthoriseRow) },
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

  closeDrawer(): void {
    this.activeRow.set(null);
  }

  authorise(): void {
    const row = this.activeRow();
    if (!row) return;
    this.rows.update((rows) => rows.map((r) => (r.internalDemandNo === row.internalDemandNo ? { ...r, authorised: true } : r)));
    this.activeRow.set({ ...row, authorised: true });
    this.notifications.success(`Issue authorized for ${row.internalDemandNo}.`);
  }
}
