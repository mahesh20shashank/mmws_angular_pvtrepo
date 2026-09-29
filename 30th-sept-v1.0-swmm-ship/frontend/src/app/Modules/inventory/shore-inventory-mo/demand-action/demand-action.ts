import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { ColDef, RowData } from "ag-grid-community";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { ActionRendererComponent } from "../../../../shared/components/data-grid/grid-action-icons";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { getErrorMessage } from "../../../../Core/http/services/http-feedback";
import { MoApiService } from "../services/mo-api.service";
import { MoCartEntry } from "../models/mo.model";

/** Row label -> `MoCartEntry` field shown in the Details modal — mirrors `cart-list.ts`'s own
 * detail-field list, trimmed to what's meaningful for a raised demand. */
const DETAIL_FIELDS: { label: string; field: keyof MoCartEntry }[] = [
  { label: "Item Code", field: "itemCode" },
  { label: "Item Description", field: "itemDescription" },
  { label: "Category", field: "category" },
  { label: "Equipment Class", field: "equipmentClass" },
  { label: "Equipment Nomenclature", field: "equipmentNomenclature" },
  { label: "DART No", field: "dartNo" },
  { label: "HOD Approval Status", field: "hodApprovalStatus" },
];

const HELP_HTML = `<p class="mb-0">Internal demands already sent for HOD approval. Click the info icon for
  full details, or the check icon to approve — this calls the same real approval action used elsewhere in
  MO Inventory, so approving here is reflected on the Approval tab too.</p>`;

/**
 * Reference: `ilms/transaction/demand_action.html`. Wired to the real backend — the current
 * `ilms` DRF API already has a generic HOD-approval workflow (`ApprovalWorkflowMixin`) shared by
 * Survey/PTS/Demand, the same one the real "Spares Transaction Cart"/"Approval" tabs use. Data
 * source is the existing `MoApiService.getCart("demand")`, scoped to entries already sent for HOD
 * approval (`isHod`). The reference's Dt Raised/Sub Department/Role Name/Closing Code columns have
 * no backing field on `DemandDetails` and are dropped rather than faked.
 */
@Component({
  selector: "app-mo-demand-action",
  standalone: true,
  imports: [DataGrid, HelpGuidance, ModalComponent, ButtonComponent],
  templateUrl: "./demand-action.html",
  styleUrl: "./demand-action.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemandAction implements OnInit {
  private readonly api = inject(MoApiService);
  private readonly notifications = inject(NotificationService);

  readonly helpHtml = HELP_HTML;
  readonly entries = signal<MoCartEntry[]>([]);
  readonly loading = signal(false);
  readonly approving = signal(false);

  readonly detailEntry = signal<MoCartEntry | null>(null);
  readonly approveEntry = signal<MoCartEntry | null>(null);
  readonly writeEntry = signal<MoCartEntry | null>(null);

  readonly detailRows = computed(() => {
    const entry = this.detailEntry();
    if (!entry) return [];
    return DETAIL_FIELDS.map(({ label, field }) => ({ label, value: entry[field] })).filter((row) => !!row.value);
  });

  readonly columnDefs: ColDef[] = [
    { field: "ilmsDemandNo", headerName: "Internal Demand No", flex: 1 },
    { field: "itemCode", headerName: "Item Code", flex: 1 },
    { field: "itemDescription", headerName: "Item Description", flex: 1.4 },
    { field: "category", headerName: "Category", width: 110 },
    { field: "equipmentClass", headerName: "Equipment Class", flex: 1 },
    { field: "dartNo", headerName: "Dart No", width: 110 },
    { field: "qty", headerName: "Qty", width: 90 },
    { field: "hodApprovalStatus", headerName: "HOD Approval Status", width: 160 },
    {
      headerName: "Details",
      width: 90,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: RowData) => [
          { icon: "info", label: "Details", color: "#1d96e9", action: () => this.detailEntry.set(row as MoCartEntry) },
        ],
      },
    },
    {
      headerName: "Action",
      width: 130,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: RowData) => {
          const entry = row as MoCartEntry;
          const approved = entry.hodApprovalStatus === "Approved";
          return [
            {
              icon: "check",
              label: approved ? "Approved" : "Approve",
              color: approved ? "#16a34a" : "#9CA3AF",
              disabled: approved,
              action: () => this.approveEntry.set(entry),
            },
            { icon: "edit", label: "Write/Edit", color: "#7fb3e0", action: () => this.writeEntry.set(entry) },
          ];
        },
      },
    },
  ];

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const all = await firstValueFrom(this.api.getCart("demand"));
      this.entries.set(all.filter((entry) => entry.isHod));
    } finally {
      this.loading.set(false);
    }
  }

  closeDetail(): void {
    this.detailEntry.set(null);
  }

  closeApprove(): void {
    this.approveEntry.set(null);
  }

  closeWrite(): void {
    this.writeEntry.set(null);
  }

  async confirmApprove(): Promise<void> {
    const entry = this.approveEntry();
    if (!entry) return;
    this.approving.set(true);
    try {
      await firstValueFrom(this.api.approveCartEntry("demand", entry.id));
      this.notifications.success(`${entry.ilmsDemandNo || entry.id} approved.`);
      this.closeApprove();
      void this.load();
    } catch (error) {
      this.notifications.error(getErrorMessage(error));
    } finally {
      this.approving.set(false);
    }
  }

  confirmWrite(): void {
    // No real update endpoint exists for arbitrary demand fields — matches the reference, which
    // never had real write/edit logic either. Local confirmation only, not persisted.
    const entry = this.writeEntry();
    if (!entry) return;
    this.notifications.success(`Noted for ${entry.ilmsDemandNo || entry.id} — no field-level edit is available yet.`);
    this.closeWrite();
  }
}
