import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { ColDef, RowData } from "ag-grid-community";
import { firstValueFrom } from "rxjs";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { AccessControlService } from "../../../../Core/navigation/access-control.service";
import { WedApiService } from "../services/wed-api.service";
import { ApprovalEntry } from "../models/wed.model";

/** "Send to WLMS - Multiple" finalizes HOD-approved cart entries and syncs them to WLMS — a
 * HOD-tier action, not something every user who can view this page should be able to trigger.
 * UX hint only; real enforcement is (or should be) on the backend `mark-synced` action. */
const SEND_TO_WLMS_ROLES = ["Head of Department", "DY HOD", "CO"];

@Component({
  selector: "app-wed-approval",
  standalone: true,
  imports: [DataGrid, HelpGuidance, ButtonComponent],
  templateUrl: "./approval.html",
  styleUrl: "./approval.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Approval implements OnInit {
  private readonly api = inject(WedApiService);
  private readonly notifications = inject(NotificationService);
  private readonly accessControl = inject(AccessControlService);

  readonly canSendToWlms = computed(() => this.accessControl.hasAnyRole(SEND_TO_WLMS_ROLES));
  readonly entries = signal<ApprovalEntry[]>([]);
  readonly selectedRows = signal<ApprovalEntry[]>([]);
  readonly sending = signal(false);

  readonly columnDefs: ColDef[] = [
    { field: "spareCartName", headerName: "Spare Cart Name", flex: 1 },
    { field: "patternNo", headerName: "Pattern No", flex: 1 },
    { field: "spareDescription", headerName: "Spare Description", flex: 1.4 },
    { field: "dartNo", headerName: "DART No", width: 120 },
    { field: "equipmentClass", headerName: "Equipment Class", flex: 1 },
    { field: "category", headerName: "Category", width: 100 },
    {
      field: "critical",
      headerName: "Critical",
      width: 100,
      valueGetter: (p) => ((p.data as ApprovalEntry).critical ? "YES" : "NO"),
    },
    { field: "qty", headerName: "Qty", width: 90 },
  ];

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.entries.set(await firstValueFrom(this.api.getApprovalList()));
  }

  onSelectionChanged(rows: RowData[]): void {
    this.selectedRows.set(rows as unknown as ApprovalEntry[]);
  }

  async sendToWlms(): Promise<void> {
    if (!this.selectedRows().length || !this.canSendToWlms()) return;
    this.sending.set(true);
    try {
      await firstValueFrom(this.api.sendApprovalsToWlms(this.selectedRows().map((e) => e.id)));
      this.notifications.success("Sent to WLMS.");
      void this.load();
    } finally {
      this.sending.set(false);
    }
  }
}
