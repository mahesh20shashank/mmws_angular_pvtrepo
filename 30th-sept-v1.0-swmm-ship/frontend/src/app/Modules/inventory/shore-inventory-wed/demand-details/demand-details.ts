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

const HELP_HTML = `<p class="mb-0">Add remarks justifying the demand and upload the supporting PDF, then Save.</p>`;

/** Reference: `wlms_demand_details.html`. Real backend: `GET/POST demand/<pk>/` +
 * `demand/<pk>/save/` (`DemandDetailsViewSet.detail`/`save`). */
@Component({
  selector: "app-wed-demand-details",
  standalone: true,
  imports: [ReactiveFormsModule, TextareaInput, FileInput, HelpGuidance, ButtonComponent],
  templateUrl: "./demand-details.html",
  styleUrl: "./demand-details.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemandDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WedApiService);
  private readonly notifications = inject(NotificationService);

  readonly helpHtml = HELP_HTML;
  private id = "";
  readonly loading = signal(true);
  readonly saving = signal(false);
  /** Gates the inline PDF-required error so it doesn't appear before the first Save attempt —
   * `pdfMissing()` alone is true from initial load for a never-saved row. */
  readonly attemptedSubmit = signal(false);
  readonly generatedDemandNo = signal("");
  readonly demandQty = signal("");
  readonly existingPdfName = signal<string | null>(null);
  readonly entry = signal<WedCartEntry | null>(null);

  readonly form = this.fb.nonNullable.group({
    remarks: ["", Validators.required],
    certificateFile: this.fb.control<File | null>(null),
  });

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get("id") ?? "";
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [context, cart] = await Promise.all([
        firstValueFrom(this.api.getDemandDetails(this.id)),
        firstValueFrom(this.api.getCart("demand")),
      ]);
      this.generatedDemandNo.set(context.generated_demand_no);
      this.demandQty.set(context.demand.demand_qty ?? "");
      this.existingPdfName.set(context.demand_pdf_name);
      this.entry.set(cart.find((row) => row.id === this.id) ?? null);
      if (context.demand.remarks) this.form.controls.remarks.setValue(context.demand.remarks);
    } finally {
      this.loading.set(false);
    }
  }

  // The reference requires a PDF the first time; once one is already on file, re-uploading is
  // optional (matches `wlms_demand_details.html`'s conditional "Previously uploaded" notice).
  pdfMissing(): boolean {
    return !this.form.controls.certificateFile.value && !this.existingPdfName();
  }

  async submit(): Promise<void> {
    this.attemptedSubmit.set(true);
    if (this.form.invalid || this.pdfMissing()) {
      this.form.markAllAsTouched();
      if (this.pdfMissing()) this.notifications.error("Upload the demand PDF.");
      return;
    }
    const { remarks, certificateFile } = this.form.getRawValue();
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.saveDemandDetails(this.id, { authorityRemarks: remarks, certificateFile }));
      this.notifications.success(`Demand details saved for ${this.generatedDemandNo() || "this row"}.`);
      void this.router.navigateByUrl("/afterAuth/inventory/shore-inventory-wed/transactions/demand");
    } catch (error) {
      this.notifications.error(error instanceof Error ? error.message : "Saving demand details failed.");
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    void this.router.navigateByUrl("/afterAuth/inventory/shore-inventory-wed/transactions/demand");
  }
}
