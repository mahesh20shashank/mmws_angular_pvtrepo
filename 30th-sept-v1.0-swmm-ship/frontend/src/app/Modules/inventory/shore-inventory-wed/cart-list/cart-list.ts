import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { ColDef, RowData } from "ag-grid-community";
import { firstValueFrom } from "rxjs";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { TextActionRenderer } from "../../../../shared/components/data-grid/grid-text-action-renderer";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { WedApiService, WedCartKind } from "../services/wed-api.service";
import { WedCartEntry } from "../models/wed.model";

type DetailsAction = "survey" | "pts" | "demand" | "iif" | "receive";

interface CartListRouteData {
  kind: WedCartKind;
  title: string;
  columns: ColDef[];
  showCheckboxes?: boolean;
  showApprovalButton?: boolean;
  showSyncButton?: boolean;
  syncButtonLabel?: string;
  showRaiseButton?: boolean;
  raiseButtonLabel?: string;
  detailsAction?: DetailsAction;
}

/**
 * Generic list+actions component reused for all 6 "Spares Transaction Cart"
 * pages (Survey/PTS/Demand/Receive/IIF/PTS-RIO-Pending) — same pattern as
 * Shore Inventory - MO's CartList, parametrized entirely via route data.
 */
@Component({
  selector: "app-wed-cart-list",
  standalone: true,
  imports: [DataGrid, HelpGuidance, ModalComponent, ReactiveFormsModule, ButtonComponent],
  templateUrl: "./cart-list.html",
  styleUrl: "./cart-list.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartList implements OnInit {
  private readonly api = inject(WedApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);

  private kind: WedCartKind = "survey";
  title = "";
  columnDefs: ColDef[] = [];
  showCheckboxes = true;
  showApprovalButton = true;
  showSyncButton = false;
  syncButtonLabel = "Sync With WLMS";
  showRaiseButton = false;
  raiseButtonLabel = "Raise IIF";

  readonly entries = signal<WedCartEntry[]>([]);
  readonly selectedRows = signal<WedCartEntry[]>([]);
  readonly syncing = signal(false);
  readonly sending = signal(false);
  readonly raising = signal(false);
  readonly downloadingEdps = signal(false);

  /** Survey cart only — reference: `wlms_surveylist.html`'s "EDPS" button. */
  get showEdpsButton(): boolean {
    return this.kind === "survey";
  }

  /** Receive cart only — the row currently open in the "Enter Receipt Details" modal. */
  readonly receiptEntry = signal<WedCartEntry | null>(null);
  readonly savingReceipt = signal(false);
  readonly today = new Date().toISOString().slice(0, 10);
  readonly receiptForm = this.fb.nonNullable.group({
    receivedQty: [0, [Validators.required, Validators.min(1)]],
    // Can't record a receipt dated in the future.
    receivedDate: [this.today, [Validators.required, this.notFutureDateValidator]],
  });

  private notFutureDateValidator(control: AbstractControl): ValidationErrors | null {
    return control.value && control.value > new Date().toISOString().slice(0, 10)
      ? { futureDate: true }
      : null;
  }

  ngOnInit(): void {
    const data = this.route.snapshot.data as CartListRouteData;
    this.kind = data.kind;
    this.title = data.title;
    this.showCheckboxes = data.showCheckboxes ?? true;
    this.showApprovalButton = data.showApprovalButton ?? true;
    this.showSyncButton = data.showSyncButton ?? false;
    this.syncButtonLabel = data.syncButtonLabel ?? "Sync With WLMS";
    this.showRaiseButton = data.showRaiseButton ?? false;
    this.raiseButtonLabel = data.raiseButtonLabel ?? "Raise IIF";
    this.columnDefs = data.detailsAction
      ? [...data.columns, this.buildDetailsColumn(data.detailsAction)]
      : data.columns;
    void this.load();
  }

  /** "Enter Details"/"Edit" for Survey/PTS/Demand (gated on `isSave`, matching the reference's
   * `{% if not X.is_save %}Enter…Details{% else %}<pencil>{% endif %}`) and IIF (always editable,
   * no gate in the reference); a "Enter Receipt Details" modal trigger for Receive. */
  private buildDetailsColumn(action: DetailsAction): ColDef {
    return {
      headerName: "Actions",
      width: 170,
      sortable: false,
      filter: false,
      cellRenderer: TextActionRenderer,
      cellRendererParams: {
        actions: (row: RowData) => {
          const entry = row as WedCartEntry;
          if (action === "receive") {
            if ((entry.qty ?? 0) <= 0) {
              return [{ label: "Fully Received", color: "#16a34a", action: () => undefined }];
            }
            return [
              { label: "Enter Receipt Details", color: "#1d96e9", action: () => this.openReceiptModal(entry) },
            ];
          }
          if (action === "iif") {
            return [{ label: "Edit", color: "#1d96e9", action: () => this.goToDetails(entry) }];
          }
          return [
            entry.isSave
              ? { label: "Edit", color: "#1d96e9", action: () => this.goToDetails(entry) }
              : { label: "Enter Details", color: "#1d96e9", action: () => this.goToDetails(entry) },
          ];
        },
      },
    };
  }

  private goToDetails(entry: WedCartEntry): void {
    void this.router.navigate([entry.id, "details"], { relativeTo: this.route });
  }

  openReceiptModal(entry: WedCartEntry): void {
    this.receiptEntry.set(entry);
    this.receiptForm.reset({
      receivedQty: entry.qty ?? 0,
      receivedDate: this.today,
    });
    // Balance Qty (Yet to Receive) caps how much can be recorded in one receipt — set fresh per
    // row since it depends on which entry the modal was opened for.
    this.receiptForm.controls.receivedQty.setValidators([
      Validators.required,
      Validators.min(1),
      Validators.max(entry.qty ?? 0),
    ]);
    this.receiptForm.controls.receivedQty.updateValueAndValidity();
  }

  closeReceiptModal(): void {
    this.receiptEntry.set(null);
  }

  async submitReceipt(): Promise<void> {
    const entry = this.receiptEntry();
    if (!entry || this.receiptForm.invalid) {
      this.receiptForm.markAllAsTouched();
      return;
    }
    const { receivedQty, receivedDate } = this.receiptForm.getRawValue();
    if (!entry.receiveSourceId) {
      this.notifications.error("This row isn't linked to a demand or PTS record — cannot record a receipt.");
      return;
    }
    this.savingReceipt.set(true);
    try {
      await firstValueFrom(
        this.api.createReceipt({
          demandDetailsId: entry.receiveSourceKind === "pts" ? null : entry.receiveSourceId,
          ptsDetailsId: entry.receiveSourceKind === "pts" ? entry.receiveSourceId : null,
          receivedQty,
          receivedDate,
        }),
      );
      this.notifications.success("Receipt recorded.");
      this.closeReceiptModal();
      void this.load();
    } catch (error) {
      this.notifications.error(error instanceof Error ? error.message : "Recording the receipt failed.");
    } finally {
      this.savingReceipt.set(false);
    }
  }

  private async load(): Promise<void> {
    this.entries.set(await firstValueFrom(this.api.getCart(this.kind)));
  }

  onSelectionChanged(rows: RowData[]): void {
    this.selectedRows.set(rows as unknown as WedCartEntry[]);
  }

  async sendForHodApproval(): Promise<void> {
    if (!this.selectedRows().length) return;
    this.sending.set(true);
    try {
      await firstValueFrom(
        this.api.sendCartForHodApproval(this.kind, this.selectedRows().map((e) => e.id)),
      );
      this.notifications.success("Sent for HOD approval.");
      void this.load();
    } finally {
      this.sending.set(false);
    }
  }

  async sync(): Promise<void> {
    this.syncing.set(true);
    try {
      const result = await firstValueFrom(this.api.syncCartWithWlms(this.kind));
      this.notifications.success(result.updated ? `Sync complete — ${result.updated} record(s) synced.` : result.message);
      void this.load();
    } finally {
      this.syncing.set(false);
    }
  }

  async raise(): Promise<void> {
    this.raising.set(true);
    try {
      await firstValueFrom(this.api.raiseIif(this.kind, this.selectedRows().map((e) => e.id)));
      this.notifications.success("IIF raised.");
    } finally {
      this.raising.set(false);
    }
  }

  async downloadEdpsPdf(): Promise<void> {
    if (!this.selectedRows().length) return;
    this.downloadingEdps.set(true);
    try {
      const blob = await firstValueFrom(this.api.downloadEdpsPdf(this.selectedRows().map((e) => e.id)));
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Revoke once the new tab has had a chance to load the blob URL.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      this.notifications.error(error instanceof Error ? error.message : "Downloading the EDPS-3 Return Note failed.");
    } finally {
      this.downloadingEdps.set(false);
    }
  }
}
