import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { FileInput } from "../../../../shared/components/file-input/file-input";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { TextareaInput } from "../../../../shared/components/textarea-input/textarea-input";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { WedApiService } from "../services/wed-api.service";
import { WedCartEntry } from "../models/wed.model";

const HELP_HTML = `<p class="mb-0">Complete the IIF request form for this item — costing, drawing, vendor,
  and specification details — then Save.</p>`;

/** Reference: `wlms_iifdetails.html`. Real backend: `GET/PATCH wlmsiifdetails/<pk>/`
 * (`WEDIIFDetailsViewSet` — `pk` is the `WEDIIF` cart-row id; auto-provisions a `WEDIIFDetails`
 * row and `iif_no` on first touch). Equipment name/category/item desc/denomination are read-only
 * display fields sourced from the linked spare in the reference too — not stored on
 * `WEDIIFDetails` — so they come from the already-adapted cart row, not this form. */
@Component({
  selector: "app-wed-iif-details",
  standalone: true,
  imports: [ReactiveFormsModule, TextareaInput, FileInput, HelpGuidance, ButtonComponent],
  templateUrl: "./iif-details.html",
  styleUrl: "./iif-details.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IifDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WedApiService);
  private readonly notifications = inject(NotificationService);

  readonly helpHtml = HELP_HTML;
  private id = "";
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly iifNo = signal<string | null>(null);
  readonly entry = signal<WedCartEntry | null>(null);
  readonly existingIifPhoto = signal<string | null>(null);
  readonly existingDrawingDoc = signal<string | null>(null);
  readonly existingBqDoc = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    comlyInOtherEqpt: [""],
    annualReq: ["", Validators.required],
    // `phone_no` is a plain IntegerField server-side (backend/wlms/models.py) — max 2,147,483,647,
    // so a numeric-only pattern plus that ceiling catches an invalid value here instead of a
    // round-trip 400.
    phoneNo: ["", [Validators.required, Validators.pattern(/^\d+$/), Validators.max(2147483647)]],
    specification: [""],
    address: ["", Validators.required],
    qtyFittedInEqpt: ["", Validators.required],
    proposedMsl: ["", Validators.required],
    drawingNo: ["", Validators.required],
    poevCostingRs: ["", Validators.required],
    bqAmountRs: ["", Validators.required],
    ssRemarks: [""],
    iifPhoto: this.fb.control<File | null>(null),
    drawingDoc: this.fb.control<File | null>(null),
    bqDoc: this.fb.control<File | null>(null),
  });

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get("id") ?? "";
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [details, cart] = await Promise.all([
        firstValueFrom(this.api.getIifDetails(this.id)),
        firstValueFrom(this.api.getCart("iif")),
      ]);
      this.entry.set(cart.find((row) => row.id === this.id) ?? null);
      this.iifNo.set(details.iif_no);
      this.existingIifPhoto.set(details.iif_photo);
      this.existingDrawingDoc.set(details.drawing_doc);
      this.existingBqDoc.set(details.bq_doc);
      this.form.patchValue({
        comlyInOtherEqpt: details.comly_in_other_eqpt ?? "",
        annualReq: details.annual_req ?? "",
        phoneNo: details.phone_no != null ? String(details.phone_no) : "",
        specification: details.Specification ?? "",
        address: details.address ?? "",
        qtyFittedInEqpt: details.Qty_fitted_in_eqpt ?? "",
        proposedMsl: details.proposed_MSL ?? "",
        drawingNo: details.drawing_no ?? "",
        poevCostingRs: details.poev_costing_rs ?? "",
        bqAmountRs: details.bq_amount_rs ?? "",
        ssRemarks: details.ss_remarks ?? "",
      });
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.saveIifDetails(this.id, this.form.getRawValue()));
      this.notifications.success("IIF details saved.");
      void this.router.navigateByUrl("/afterAuth/inventory/shore-inventory-wed/transactions/iif");
    } catch (error) {
      this.notifications.error(error instanceof Error ? error.message : "Saving IIF details failed.");
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    void this.router.navigateByUrl("/afterAuth/inventory/shore-inventory-wed/transactions/iif");
  }
}
