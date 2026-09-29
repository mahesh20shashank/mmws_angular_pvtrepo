import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { SelectInput } from "../../../../../shared/components/select-input/select-input";
import { TextareaInput } from "../../../../../shared/components/textarea-input/textarea-input";
import { NotificationService } from "../../../../../Core/services/notification/notification.service";
import { ObsApiService } from "../../services/obs-api.service";
import { ObsRequisitionSelectionStore } from "../../services/obs-requisition-selection-store";
import { RequisitionEntry, IssueRequisitionPayload } from "../../models/requisition.model";
import { obsUserOptionLabel } from "../../models/issue.model";
import { DropdownOptionDto } from "../../models/spare.model";

@Component({
  selector: "app-obs-requisition-issue",
  standalone: true,
  imports: [ReactiveFormsModule, SelectInput, TextareaInput, ButtonComponent],
  templateUrl: "./requisition-issue.html",
  styleUrl: "./requisition-issue.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequisitionIssue implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly selectionStore = inject(ObsRequisitionSelectionStore);
  private readonly notifications = inject(NotificationService);

  private kind: "routine" | "defect" = "routine";
  readonly entries = signal<RequisitionEntry[]>([]);
  readonly quantities = signal<Record<string, number>>({});
  readonly usernameOptions = signal<DropdownOptionDto[]>([]);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    username: ["", Validators.required],
    remarks: ["", Validators.required],
  });

  ngOnInit(): void {
    this.kind = (this.route.snapshot.paramMap.get("kind") as "routine" | "defect") ?? "routine";
    const selected = this.selectionStore.selectedEntries();
    if (!selected.length) {
      this.goBack();
      return;
    }
    this.entries.set(selected);
    this.quantities.set(Object.fromEntries(selected.map((e) => [e.id, e.quantityRequired || 1])));
    // `selectableForIssue` keeps the accounts `seed_all.py` writes (`PN0001`…) out of the
    // picker — a spare must not be issued against a demo row — and applies the department
    // scoping the previous `users/users/active/` endpoint did server-side. Labelled the same
    // way as Return's "Returned by" so one person reads identically across Ship Inventory.
    void firstValueFrom(this.api.getInventoryUsers()).then((users) =>
      this.usernameOptions.set(
        users
          .filter((user) => user.selectableForIssue)
          .map((user) => ({ value: user.id, label: obsUserOptionLabel(user) })),
      ),
    );
  }

  quantityFor(entryId: string): number {
    return this.quantities()[entryId] ?? 1;
  }

  updateQuantity(entryId: string, value: string): void {
    this.quantities.update((current) => ({ ...current, [entryId]: Number(value) || 0 }));
  }

  /** Just "must be at least 1" — unlike the Search Spare > Issue form, a requisition row's
   * Qty Auth/Qty Held reflect the *matching Spares record*, which routinely doesn't exist yet
   * for a planned-but-not-yet-catalogued spare (both show 0 in that case — that's the normal,
   * expected state for something being requisitioned, not a sign of insufficient stock). Capping
   * against it here would block a legitimate requisition for no reason. The backend's own real
   * "Spare not found" / "Issued quantity exceeds available" checks (`_create_pattern_issues`)
   * still apply and are what actually decide whether this can succeed. */
  quantityInvalid(entry: RequisitionEntry): boolean {
    return this.quantityFor(entry.id) < 1;
  }

  hasRowErrors(): boolean {
    return this.entries().some((e) => this.quantityInvalid(e));
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error("Fill in every required field before submitting.");
      return;
    }
    const invalidRows = this.entries().filter((entry) => this.quantityInvalid(entry));
    if (invalidRows.length) {
      this.notifications.error(
        "Quantity Issued must be at least 1 for: " +
          invalidRows.map((entry) => entry.patternNumber).join(", "),
      );
      return;
    }
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const payload: IssueRequisitionPayload = {
        ...raw,
        rows: this.entries().map((entry) => ({
          entryId: entry.id,
          patternNumber: entry.patternNumber,
          description: entry.description,
          quantityAuthorised: entry.quantityAuthorised,
          quantityAvailable: entry.quantityAvailable,
          quantityIssued: this.quantityFor(entry.id),
          dartNumber: entry.dartNumber,
        })),
      };
      const result = await firstValueFrom(this.api.issueRequisition(this.kind, payload));
      if (result.errors.length) {
        // `_create_pattern_issues` accepts/rejects each row independently — a row can still fail
        // server-side here even though it passed the client-side checks above, e.g. a requisition
        // for a pattern with no matching catalogued Spares record yet ("Spare not found"). Surface
        // exactly which rows didn't go through instead of reporting a blanket success.
        this.notifications.error(
          result.errors.map((e) => `${e.patternNumber}: ${e.error}`).join("; "),
        );
        if (!result.issued.length) {
          return;
        }
      }
      this.selectionStore.clear();
      this.goBack();
    } finally {
      this.saving.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/requisitions", this.kind]);
  }
}
