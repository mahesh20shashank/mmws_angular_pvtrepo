import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { SelectInput } from "../../../../shared/components/select-input/select-input";
import { TextareaInput } from "../../../../shared/components/textarea-input/textarea-input";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { WedApiService } from "../services/wed-api.service";
import { DropdownOptionDto, SignalDemandEntry, SignalDemandStatus, SignalDemandType } from "../models/wed.model";

const DEMAND_TYPE_OPTIONS: DropdownOptionDto[] = [
  { value: "OPDEM", label: "OPDEM — Operational Demand" },
  { value: "STOREDEM", label: "STOREDEM — Store Demand" },
  { value: "CANDEM", label: "CANDEM — Cannibalisation Demand" },
];

const STATUS_FILTER_OPTIONS: DropdownOptionDto[] = [
  { value: "", label: "All Statuses" },
  { value: "REGISTERED", label: "Registered" },
  { value: "FORWARDED", label: "Forwarded" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

const HELP_HTML = `<p class="mb-1">Register an Operational (OPDEM), Store (STOREDEM) or Cannibalisation
(CANDEM) demand between ships. A Cannibalisation demand additionally needs the receiving ship.</p>
<p class="mb-0">Once registered, a demand moves Registered → Forwarded → Approved/Rejected, or can be
Cancelled at any point before it's Approved/Rejected. There is no edit — only these status actions.</p>`;

/** Reference: `signal_demand.html`. Real backend: `signaldemand/` (list, create) +
 * `signaldemand/<pk>/{forward|approve|reject|cancel}/` — no retrieve/update/delete route is
 * wired server-side, so this page is list + create + status actions only, never edit-in-place. */
@Component({
  selector: "app-wed-signal-demand",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SelectInput, TextareaInput, HelpGuidance, ButtonComponent],
  templateUrl: "./signal-demand.html",
  styleUrl: "./signal-demand.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignalDemand implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WedApiService);
  private readonly notifications = inject(NotificationService);

  readonly helpHtml = HELP_HTML;
  readonly demandTypeOptions = DEMAND_TYPE_OPTIONS;
  readonly demandTypeFilterOptions: DropdownOptionDto[] = [{ value: "", label: "All Types" }, ...DEMAND_TYPE_OPTIONS];
  readonly statusFilterOptions = STATUS_FILTER_OPTIONS;

  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly transitioningId = signal<string | null>(null);
  readonly demands = signal<SignalDemandEntry[]>([]);

  readonly shipOptions = signal<DropdownOptionDto[]>([]);
  readonly wedSpareOptions = signal<DropdownOptionDto[]>([]);
  readonly obsSpareOptions = signal<DropdownOptionDto[]>([]);
  readonly equipmentOptions = signal<DropdownOptionDto[]>([]);

  readonly filterForm = this.fb.nonNullable.group({
    demandType: this.fb.nonNullable.control<SignalDemandType | "">(""),
    status: this.fb.nonNullable.control<SignalDemandStatus | "">(""),
    q: "",
  });

  readonly form = this.fb.nonNullable.group({
    demandType: this.fb.nonNullable.control<SignalDemandType>("OPDEM", Validators.required),
    demandNumber: ["", Validators.required],
    dtg: ["", Validators.required],
    requestingShip: ["", Validators.required],
    receiverShip: [""],
    wedSpare: [""],
    obsSpare: [""],
    equipment: [""],
    ptsNumber: [""],
    demandQuantity: this.fb.nonNullable.control(1, [Validators.required, Validators.min(1)]),
    remarks: [""],
  });

  ngOnInit(): void {
    void this.loadOptions();
    void this.load();
  }

  private async loadOptions(): Promise<void> {
    const [ships, wedSpares, obsSpares, equipment] = await Promise.all([
      firstValueFrom(this.api.getShipOptions()),
      firstValueFrom(this.api.getWedSpareOptions()),
      firstValueFrom(this.api.getObsSpareOptions()),
      firstValueFrom(this.api.getWedEquipmentOptions()),
    ]);
    this.shipOptions.set(ships);
    this.wedSpareOptions.set(wedSpares);
    this.obsSpareOptions.set(obsSpares);
    this.equipmentOptions.set(equipment);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const raw = this.filterForm.getRawValue();
      this.demands.set(
        await firstValueFrom(
          this.api.getSignalDemands({
            demandType: raw.demandType || undefined,
            status: raw.status || undefined,
            q: raw.q || undefined,
          }),
        ),
      );
    } finally {
      this.loading.set(false);
    }
  }

  resetFilters(): void {
    this.filterForm.reset({ demandType: "", status: "", q: "" });
    void this.load();
  }

  isCandem(): boolean {
    return this.form.controls.demandType.value === "CANDEM";
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error("Fill in every required field before registering the demand.");
      return;
    }
    const raw = this.form.getRawValue();
    if (raw.demandType === "CANDEM") {
      if (!raw.receiverShip) {
        this.notifications.error("Receiver Ship is required for a Cannibalisation Demand.");
        return;
      }
      if (raw.receiverShip === raw.requestingShip) {
        this.notifications.error("Receiver Ship must be different from Requesting Ship.");
        return;
      }
    }
    if (!raw.wedSpare && !raw.obsSpare) {
      this.notifications.error("Select either a WED Spare or an Onboard (OBS) Spare for this demand.");
      return;
    }

    this.submitting.set(true);
    try {
      await firstValueFrom(
        this.api.createSignalDemand({
          demandType: raw.demandType,
          demandNumber: raw.demandNumber,
          dtg: raw.dtg,
          requestingShipId: raw.requestingShip,
          receiverShipId: raw.demandType === "CANDEM" ? raw.receiverShip : undefined,
          wedSpareId: raw.wedSpare || undefined,
          obsSpareId: raw.obsSpare || undefined,
          equipmentId: raw.equipment || undefined,
          ptsNumber: raw.ptsNumber,
          demandQuantity: raw.demandQuantity,
          remarks: raw.remarks,
        }),
      );
      this.form.reset({ demandType: "OPDEM", demandQuantity: 1 });
      void this.load();
    } finally {
      this.submitting.set(false);
    }
  }

  canForward(entry: SignalDemandEntry): boolean {
    return entry.status === "REGISTERED";
  }

  canApproveOrReject(entry: SignalDemandEntry): boolean {
    return entry.status === "FORWARDED";
  }

  canCancel(entry: SignalDemandEntry): boolean {
    return entry.status === "REGISTERED" || entry.status === "FORWARDED";
  }

  async forward(entry: SignalDemandEntry): Promise<void> {
    await this.transition(entry, () => this.api.forwardSignalDemand(entry.id));
  }

  async approve(entry: SignalDemandEntry): Promise<void> {
    await this.transition(entry, () => this.api.approveSignalDemand(entry.id));
  }

  async reject(entry: SignalDemandEntry): Promise<void> {
    await this.transition(entry, () => this.api.rejectSignalDemand(entry.id));
  }

  async cancel(entry: SignalDemandEntry): Promise<void> {
    await this.transition(entry, () => this.api.cancelSignalDemand(entry.id));
  }

  private async transition(entry: SignalDemandEntry, call: () => ReturnType<WedApiService["forwardSignalDemand"]>): Promise<void> {
    this.transitioningId.set(entry.id);
    try {
      await firstValueFrom(call());
      void this.load();
    } finally {
      this.transitioningId.set(null);
    }
  }
}
