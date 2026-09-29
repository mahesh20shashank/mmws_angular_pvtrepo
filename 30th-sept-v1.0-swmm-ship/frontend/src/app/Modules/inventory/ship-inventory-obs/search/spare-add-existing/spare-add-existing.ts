import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { InputField } from "../../../../../shared/components/input-field/input-field";
import { SelectInput } from "../../../../../shared/components/select-input/select-input";
import { TextareaInput } from "../../../../../shared/components/textarea-input/textarea-input";
import { IconComponent } from "../../../../../shared/components/icon/icon.component";
import { ObsApiService } from "../../services/obs-api.service";
import {
  CRITICALITY_STRENGTH_LABEL,
  DropdownOptionDto,
  HIGH_HOLDING_REASON_MIN_LENGTH,
  HIGH_HOLDING_THRESHOLD,
  Spare,
} from "../../models/spare.model";

@Component({
  selector: "app-obs-spare-add-existing",
  standalone: true,
  imports: [ReactiveFormsModule, SelectInput, InputField, TextareaInput, IconComponent, ButtonComponent],
  templateUrl: "./spare-add-existing.html",
  styleUrl: "./spare-add-existing.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpareAddExisting implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly CRITICALITY_STRENGTH_LABEL = CRITICALITY_STRENGTH_LABEL;
  readonly highHoldingThreshold = HIGH_HOLDING_THRESHOLD;
  readonly saving = signal(false);
  /** Department-scoped server-side already (`search_result/`'s `_filtered_queryset`)
   * — no dedicated list endpoint needed for this picker. */
  readonly allSpares = signal<Spare[]>([]);
  /** True until the spare list `patternOptions`/`descriptionOptions` are built from has
   * loaded. Both pickers show "Loading spares..." as their placeholder and are disabled while
   * this is true, rather than an empty, clickable "Search by..." box that opens on to nothing
   * for however long the fetch takes. */
  readonly loadingSpares = signal(true);

  readonly form = this.fb.nonNullable.group({
    spareId: ["", Validators.required],
    quantityToAdd: [1, [Validators.required, Validators.min(1)]],
    remarks: [""],
  });

  // The two pickers below share this one control, so they're synced by
  // construction rather than needing manual cross-wiring between two controls.
  readonly spareIdValue = toSignal(this.form.controls.spareId.valueChanges, { initialValue: "" });
  readonly quantityToAddValue = toSignal(this.form.controls.quantityToAdd.valueChanges, {
    initialValue: 1,
  });
  readonly remarksValue = toSignal(this.form.controls.remarks.valueChanges, { initialValue: "" });

  readonly selectedSpare = computed<Spare | null>(() => {
    const id = this.spareIdValue();
    return id ? (this.allSpares().find((spare) => spare.id === id) ?? null) : null;
  });

  readonly patternOptions = computed<DropdownOptionDto[]>(() =>
    this.allSpares().map((spare) => ({ value: spare.id, label: spare.patternNumber })),
  );
  readonly descriptionOptions = computed<DropdownOptionDto[]>(() =>
    this.allSpares().map((spare) => ({ value: spare.id, label: spare.description })),
  );

  /** Live mirror of the backend's >20-holding-needs-a-reason rule
   * (`HIGH_HOLDING_QUANTITY_THRESHOLD` in `backend/obs/models.py`) — UX hint only,
   * the server call stays the real enforcement. */
  readonly projectedTotal = computed(() => {
    const spare = this.selectedSpare();
    const quantity = Number(this.quantityToAddValue()) || 0;
    return spare ? spare.quantityAuthorised + quantity : 0;
  });

  readonly needsReason = computed(() => {
    const remarks = (this.remarksValue() || "").trim();
    return (
      this.projectedTotal() > HIGH_HOLDING_THRESHOLD && remarks.length < HIGH_HOLDING_REASON_MIN_LENGTH
    );
  });

  ngOnInit(): void {
    void this.loadSpares();
  }

  private async loadSpares(): Promise<void> {
    this.loadingSpares.set(true);
    try {
      this.allSpares.set(await firstValueFrom(this.api.searchSpares({})));
    } finally {
      this.loadingSpares.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.needsReason()) {
      this.form.markAllAsTouched();
      return;
    }
    const spare = this.selectedSpare();
    if (!spare) return;

    const raw = this.form.getRawValue();
    this.saving.set(true);
    try {
      // Mutating POST — success/error toast and the full-screen loader come from
      // the app-wide feedback interceptor, same as every other mutation in this
      // service that doesn't opt out via skipFeedback().
      await firstValueFrom(
        this.api.increaseSpareHolding(spare.id, {
          quantityToAdd: Number(raw.quantityToAdd),
          remarks: raw.remarks,
        }),
      );
      this.goBack();
    } finally {
      this.saving.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/search"]);
  }
}
