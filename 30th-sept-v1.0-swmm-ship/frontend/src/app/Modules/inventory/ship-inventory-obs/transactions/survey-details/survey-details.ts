import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { InputField } from "../../../../../shared/components/input-field/input-field";
import { TextareaInput } from "../../../../../shared/components/textarea-input/textarea-input";
import { ObsApiService } from "../../services/obs-api.service";
import { SurveyEntry } from "../../models/transaction.model";

@Component({
  selector: "app-obs-survey-details",
  standalone: true,
  imports: [ReactiveFormsModule, InputField, TextareaInput, ButtonComponent],
  templateUrl: "./survey-details.html",
  styleUrl: "./survey-details.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyDetails implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  private entryId = "";
  readonly entry = signal<SurveyEntry | null>(null);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    surveyNumber: ["", Validators.required],
    quantitySurveyed: [1, [Validators.required, Validators.min(1)]],
    surveyReportDate: ["", Validators.required],
    remarks: ["", Validators.required],
  });

  ngOnInit(): void {
    this.entryId = this.route.snapshot.paramMap.get("id") ?? "";
    void this.load();
  }

  private async load(): Promise<void> {
    const entry = await firstValueFrom(this.api.getSurveyEntry(this.entryId));
    this.entry.set(entry ?? null);
    if (entry) {
      this.form.patchValue({ quantitySurveyed: entry.quantity });
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      await firstValueFrom(
        this.api.submitSurveyDetails(this.entryId, { ...raw, quantitySurveyed: Number(raw.quantitySurveyed) }),
      );
      this.goBack();
    } finally {
      this.saving.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/transactions/survey"]);
  }
}
