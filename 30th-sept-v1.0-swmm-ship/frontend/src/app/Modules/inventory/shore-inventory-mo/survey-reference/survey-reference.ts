import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { ColDef, RowData } from "ag-grid-community";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { getErrorMessage } from "../../../../Core/http/services/http-feedback";
import { MoApiService } from "../services/mo-api.service";
import { MoCartEntry } from "../models/mo.model";
import { SurveyActionOption, SurveyActionSelect } from "./survey-action-select";

const ACTION_OPTIONS: SurveyActionOption[] = [
  { value: "add", label: "Add" },
  { value: "update_approve", label: "Update & Approve" },
  { value: "delete", label: "Pre-approval Delete" },
  { value: "close", label: "Close" },
  { value: "vet_fcl", label: "Vet FCL" },
  { value: "authorize", label: "Authorize" },
];

const HELP_HTML = `<p class="mb-0">Items raised for survey. Use the Action dropdown on a row —
  "Update &amp; Approve"/"Authorize" and "Close" call the same real approval/completion actions used
  elsewhere in MO Inventory; "Pre-approval Delete" and "Vet FCL" have no equivalent in this backend yet
  and are shown as unavailable rather than pretending to work.</p>`;

/**
 * Reference: `ilms/transaction/survey.html`. Wired to the real backend for the 2 dropdown options
 * that have a genuine match in `ApprovalWorkflowMixin` (`approve`, `complete`) — the reference's
 * other 4 options either have no backend concept ("Pre-approval Delete", "Vet FCL") or duplicate a
 * flow that already exists elsewhere ("Add" is the real "Spares Transaction Cart > Survey Cart"'s
 * item-picker-driven add-to-cart, not a per-row action — not re-implemented here).
 */
@Component({
  selector: "app-mo-survey-reference",
  standalone: true,
  imports: [DataGrid, HelpGuidance],
  templateUrl: "./survey-reference.html",
  styleUrl: "./survey-reference.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyReference implements OnInit {
  private readonly api = inject(MoApiService);
  private readonly notifications = inject(NotificationService);

  readonly helpHtml = HELP_HTML;
  readonly entries = signal<MoCartEntry[]>([]);
  readonly busyId = signal<string | null>(null);

  readonly columnDefs: ColDef[] = [
    { field: "itemCode", headerName: "Item Code", flex: 1 },
    { field: "itemDescription", headerName: "Item Description", flex: 1.4 },
    { field: "category", headerName: "Category", width: 110 },
    { field: "equipmentClass", headerName: "Equipment Class", flex: 1 },
    { field: "dartNo", headerName: "Dart No", width: 110 },
    { field: "qty", headerName: "Qty", width: 90 },
    { field: "syncStatus", headerName: "Sync Status", width: 120 },
    { field: "hodApprovalStatus", headerName: "HOD Approval Status", width: 160 },
    {
      headerName: "Action",
      width: 170,
      sortable: false,
      filter: false,
      cellRenderer: SurveyActionSelect,
      cellRendererParams: {
        options: ACTION_OPTIONS,
        onSelect: (row: RowData, value: string) => this.handleAction(row as MoCartEntry, value),
      },
    },
  ];

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const all = await firstValueFrom(this.api.getCart("survey"));
    this.entries.set(all.filter((entry) => entry.isHod));
  }

  handleAction(row: MoCartEntry, value: string): void {
    switch (value) {
      case "add":
        this.notifications.error('Use "Spares Transaction Cart > Survey Cart" to add new items — this page only actions items already raised.');
        return;
      case "delete":
        this.notifications.error("Pre-approval delete is not available for Survey in this backend yet.");
        return;
      case "vet_fcl":
        this.notifications.error('"Vet FCL" is not available for Survey in this backend yet.');
        return;
      case "update_approve":
      case "authorize":
        void this.approve(row);
        return;
      case "close":
        void this.complete(row);
        return;
    }
  }

  private async approve(row: MoCartEntry): Promise<void> {
    if (row.hodApprovalStatus === "Approved") {
      this.notifications.error(`${row.itemCode} is already approved.`);
      return;
    }
    this.busyId.set(row.id);
    try {
      await firstValueFrom(this.api.approveCartEntry("survey", row.id));
      this.notifications.success(`${row.itemCode} approved.`);
      void this.load();
    } catch (error) {
      this.notifications.error(getErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  private async complete(row: MoCartEntry): Promise<void> {
    this.busyId.set(row.id);
    try {
      await firstValueFrom(this.api.completeCartEntry("survey", row.id));
      this.notifications.success(`${row.itemCode} closed.`);
      void this.load();
    } catch (error) {
      this.notifications.error(getErrorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }
}
