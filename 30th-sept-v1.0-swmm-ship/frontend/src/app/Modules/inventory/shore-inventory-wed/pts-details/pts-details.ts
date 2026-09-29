import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { TextareaInput } from "../../../../shared/components/textarea-input/textarea-input";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { WedApiService } from "../services/wed-api.service";
import { WedCartEntry } from "../models/wed.model";

const HELP_HTML = `<p class="mb-0">Add authority remarks, enter a serial number for each unit, then Save.</p>`;

/** Reference: `wlms_pts_details.html`. Real backend: `GET/POST pts/<pk>/` + `pts/<pk>/save/`
 * (`PTSDemandDetailsViewSet.detail`/`save`). */
@Component({
  selector: "app-wed-pts-details",
  standalone: true,
  imports: [ReactiveFormsModule, TextareaInput, HelpGuidance, ButtonComponent],
  templateUrl: "./pts-details.html",
  styleUrl: "./pts-details.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PtsDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WedApiService);
  private readonly notifications = inject(NotificationService);

  readonly helpHtml = HELP_HTML;
  private id = "";
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly generatedPtsDemandNo = signal("");
  readonly demandQty = signal(0);
  readonly entry = signal<WedCartEntry | null>(null);

  readonly form = this.fb.nonNullable.group({
    authorityRemarks: ["", Validators.required],
    serialNumbers: this.fb.array<FormControl<string>>([]),
  });

  get serialNumbers(): FormArray<FormControl<string>> {
    return this.form.controls.serialNumbers;
  }

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get("id") ?? "";
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [context, cart] = await Promise.all([
        firstValueFrom(this.api.getPtsDetails(this.id)),
        firstValueFrom(this.api.getCart("pts")),
      ]);
      this.generatedPtsDemandNo.set(context.generated_pts_demand_no);
      this.demandQty.set(context.quantity);
      this.entry.set(cart.find((row) => row.id === this.id) ?? null);
      if (context.pts.remarks) this.form.controls.authorityRemarks.setValue(context.pts.remarks);

      this.serialNumbers.clear();
      const qty = Math.max(context.quantity || 0, context.items.length);
      for (let i = 0; i < qty; i++) {
        this.serialNumbers.push(this.fb.nonNullable.control(context.items[i]?.item_serial_no ?? ""));
      }
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { authorityRemarks, serialNumbers } = this.form.getRawValue();
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.api.savePtsDetails(this.id, {
          demandQty: String(this.demandQty()),
          authorityRemarks,
          serialNumbers: serialNumbers as string[],
        }),
      );
      this.notifications.success(`PTS details saved for ${this.generatedPtsDemandNo() || "this row"}.`);
      void this.router.navigateByUrl("/afterAuth/inventory/shore-inventory-wed/transactions/pts");
    } catch (error) {
      this.notifications.error(error instanceof Error ? error.message : "Saving PTS details failed.");
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    void this.router.navigateByUrl("/afterAuth/inventory/shore-inventory-wed/transactions/pts");
  }
}
