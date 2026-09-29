import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { FileInput } from "../../../../shared/components/file-input/file-input";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { SelectInput } from "../../../../shared/components/select-input/select-input";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { WedApiService } from "../services/wed-api.service";
import { WedCartEntry } from "../models/wed.model";

const HELP_HTML = `<p class="mb-0">Select the Held Certificate Type and enter its number and date. Upload
  the certificate PDF (required unless the item is a Consumable). Enter serial numbers, then Save.</p>`;

const CERTIFICATE_TYPE_OPTIONS = [
  { label: "BER", value: "BER" },
  { label: "BERC", value: "BERC" },
  { label: "BLR", value: "BLR" },
  { label: "SERVICEABLE", value: "Serviceable" },
  { label: "BERS", value: "BERS" },
];

const SS_REMARKS_OPTIONS = [
  { label: "BER", value: "BER" },
  { label: "BERC", value: "BERC" },
  { label: "BLR", value: "BLR" },
  { label: "SERVICEABLE", value: "Serviceable" },
  { label: "BERS", value: "BER Scrap" },
];

/** Reference: `wlms_survey_details.html`. No per-row prefetch action exists for Survey (unlike
 * PTS/Demand) — the form is built from the cart row already in hand. Real backend:
 * `POST survey/save/` (`SurveyReceiptsDetailsViewSet.save`, bulk `survey_pks: []`, used here with
 * a single-element array). */
@Component({
  selector: "app-wed-survey-details",
  standalone: true,
  imports: [ReactiveFormsModule, SelectInput, FileInput, HelpGuidance, ButtonComponent],
  templateUrl: "./survey-details.html",
  styleUrl: "./survey-details.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WedApiService);
  private readonly notifications = inject(NotificationService);

  readonly helpHtml = HELP_HTML;
  readonly certificateTypeOptions = CERTIFICATE_TYPE_OPTIONS;
  readonly ssRemarksOptions = SS_REMARKS_OPTIONS;

  private id = "";
  readonly loading = signal(true);
  readonly saving = signal(false);
  /** Gates the inline PDF-required error so it doesn't appear before the first Save attempt. */
  readonly attemptedSubmit = signal(false);
  readonly entry = signal<WedCartEntry | null>(null);

  readonly form = this.fb.nonNullable.group({
    certificateType: ["", Validators.required],
    heldCertNumber: ["", Validators.required],
    heldCertDate: ["", Validators.required],
    ssRemarks: ["", Validators.required],
    certificateFile: this.fb.control<File | null>(null),
    serialNumbers: this.fb.array<FormControl<string>>([]),
  });

  get serialNumbers(): FormArray<FormControl<string>> {
    return this.form.controls.serialNumbers;
  }

  get pdfRequired(): boolean {
    return (this.entry()?.category ?? "").toUpperCase() !== "CONSUMABLE";
  }

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get("id") ?? "";
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const cart = await firstValueFrom(this.api.getCart("survey"));
      const row = cart.find((r) => r.id === this.id) ?? null;
      this.entry.set(row);
      this.serialNumbers.clear();
      const qty = Math.max(row?.qty ?? 0, 0);
      for (let i = 0; i < qty; i++) {
        this.serialNumbers.push(this.fb.nonNullable.control(""));
      }
    } finally {
      this.loading.set(false);
    }
  }

  get pdfMissing(): boolean {
    return this.pdfRequired && !this.form.controls.certificateFile.value;
  }

  async submit(): Promise<void> {
    this.attemptedSubmit.set(true);
    if (this.form.invalid || this.pdfMissing) {
      this.form.markAllAsTouched();
      if (this.pdfMissing) this.notifications.error("Upload the held certificate PDF.");
      return;
    }
    const { certificateType, heldCertNumber, heldCertDate, ssRemarks, certificateFile, serialNumbers } =
      this.form.getRawValue();
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.api.saveSurveyDetails(this.id, {
          certificateType,
          heldCertNumber,
          heldCertDate,
          ssRemarks,
          otherRemarks: "",
          serialNumbers: serialNumbers as string[],
          certificateFile,
        }),
      );
      this.notifications.success("Survey details saved.");
      void this.router.navigateByUrl("/afterAuth/inventory/shore-inventory-wed/transactions/survey");
    } catch (error) {
      this.notifications.error(error instanceof Error ? error.message : "Saving survey details failed.");
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    void this.router.navigateByUrl("/afterAuth/inventory/shore-inventory-wed/transactions/survey");
  }
}
