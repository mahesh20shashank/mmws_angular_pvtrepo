import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  output,
  signal,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";

import { ButtonComponent } from "../../../../shared/components/button/button.component";
import { DatePickerComponent } from "../../../../shared/components/date-picker/picker";
import { FileInput } from "../../../../shared/components/file-input/file-input";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { InputField } from "../../../../shared/components/input-field/input-field";
import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { RichTextEditor } from "../../../../shared/components/rich-text-editor/rich-text-editor";
import {
  SelectOptionConfig,
  SingleSelect,
} from "../../../../shared/components/single-select/single-select";
import { OperationalMaintenanceApi } from "../../services/operational-maintenance-api";
import { forkJoin } from "rxjs";
import { AppService } from "../../../../Core";

const YES_NO_OPTIONS = [
  { label: "Yes", value: true },
  { label: "No", value: false },
];

const TRIALS_REQUIRED_OPTIONS = [
  { label: "Yes — raise trial request", value: true },
  { label: "No", value: false },
];

const DEFECT_RECTIFIED_OPTIONS = [
  { label: "Yes — close DART", value: true },
  { label: "No — Raise RA", value: false },
];

const DART_TRIGGER_OPTIONS = [
  "Not Applicable",
  "Inspection",
  "Trial Agency Observation",
  "OLSAT Observation",
  "OST Observation",
  "FOLSAT Observation",
];

/** Digital Defect Book — Defect / Routines reason. Explicit, named reactive form
 *  controls (not spec-driven) so every field's value/validity is directly addressable. */
@Component({
  selector: "app-defect-form",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    IconComponent,
    SingleSelect,
    InputField,
    DatePickerComponent,
    RichTextEditor,
    FileInput,
    ModalComponent,
  ],
  templateUrl: "./defect-form.html",
  styleUrl: "./defect-form.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefectForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly notification = inject(NotificationService);
  private readonly opService = inject(OperationalMaintenanceApi);
  private appService = inject(AppService);

  ngOnInit(): void {
    this.getShipDropdownData();

    this.form.controls.trialsRequired.valueChanges.subscribe((value) => {
      if (value === true && this.trialAgencyOptions.length === 0) {
        this.getTrialAgency();
      }
    });
  }
  /** Emitted when the user clicks Cancel. */
  readonly back = output<void>();
  /** Emitted after a successful "Raise DART" submit — the session stays open (see
   *  `RecordedDefectsPanel`) instead of navigating away like Cancel does. */
  readonly raiseDart = output<void>();

  /** Shown after "Raise DART" succeeds, asking whether to log another defect in this
   *  same session (see `logAnotherDefect` / `finishAndRaiseRA`). */
  readonly showConfirmationModal = signal(false);

  readonly yesNoOptions = YES_NO_OPTIONS;
  readonly trialsRequiredOptions = TRIALS_REQUIRED_OPTIONS;
  readonly defectRectifiedOptions = DEFECT_RECTIFIED_OPTIONS;
  readonly dartTriggerOptions = DART_TRIGGER_OPTIONS;


  readonly equipmentConfig: SelectOptionConfig = {
    value: "id",
    label: "equipment_name",
  };
  readonly equipmentStatus: SelectOptionConfig = {
    value: "id",
    label: "description",
  };
  readonly ssRemarkConfig: SelectOptionConfig = {
    value: "id",
    label: "description",
  };
  readonly symptomsConfig: SelectOptionConfig = {
    value: "id",
    label: "symptom_code",
  };
  readonly trailAgencies: SelectOptionConfig = {
    value: "id",
    label: "name",
  };
  equipmentOptions: Record<string, unknown>[] = [];

  defectiveComponentOptions: Record<string, unknown>[] = [];

  equipmentAvailabilityStatusOptions: Record<string, unknown>[] = [];
  ssRemarksOptions: Record<string, unknown>[] = [];
  symptomsOptions: Record<string, unknown>[] = [];
  trialAgencyOptions: Record<string, unknown>[] = [];

  selectedEquipment: any;

  /** Read-only, auto-fetched from CMMS — not a submitted field, just shown for context. */
  readonly pastDartCount = signal(6);

  readonly form = this.fb.nonNullable.group({
    equipmentNameDescription: ["", Validators.required],
    systemName: [{ value: "", disabled: true }],
    defectDateOccurrence: ["", Validators.required],
    defectiveComponent: ["", Validators.required],
    equipmentAvailabilityStatus: ["", Validators.required],
    ssRemarks: [""],
    attachment: this.fb.control<File | null>(null),
    defectDescription: ["", Validators.required],
    symptoms: ["", Validators.required],
    trialsRequired: [false],
    hotworks: [false, Validators.required],
    sparesUsedRequired: [false, Validators.required],
    standbyAvailable: [false, Validators.required],
    dartTrigger: ["Not Applicable", Validators.required],
    defectRectifiedOnboard: [false, Validators.required],
    trialAgency: [""],
  });

  get showTrialAgency(): boolean {
    return this.form.controls.trialsRequired.value === true;
  }

  get showSpareDetails(): boolean {
    return this.form.controls.sparesUsedRequired.value === true;
  }

  viewPastDartHistory(): void {
    this.notification.info(
      `Showing ${this.pastDartCount()} past DART(s) for this equipment`,
    );
  }

  cancel(): void {
    this.back.emit();
  }

  saveDraft(): void {
    this.opService.addDefect(this.buildDefectPayload("DRAFT")).subscribe({
      next: () => this.notification.info("saved"),
      error: (e) => this.notification.error(e?.error?.message),
      complete: () => this.showConfirmationModal.set(false),
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notification.error("Some mandatory fields are still required.");
      return;
    }
    this.showConfirmationModal.set(true);
  }

  /** "Yes, log another" — clears the form for a fresh, blank entry and keeps this
   *  session open (parent opens/refreshes the recorded-defects panel alongside it). */
  logAnotherDefect(): void {
    this.opService.addDefect(this.buildDefectPayload("OPEN")).subscribe({
      next: () => this.notification.info("saved"),
      error: (e) => this.notification.error(e?.error?.message),
      complete: () => this.showConfirmationModal.set(false),
    });
    // this.form.reset();
    this.raiseDart.emit();
  }

  /** "No, raise RA" — done logging defects for this session. */
  finishAndRaiseRA(): void {
    this.showConfirmationModal.set(false);
  }

  dismissLogAnotherModal(): void {
    this.showConfirmationModal.set(false);
  }

  onSelectEquipment(event: any) {
    this.selectedEquipment = event;
    this.form.get("systemName")?.setValue(event.system_name);
  }

  // if trail agencies true then call this api
  getTrialAgency() {
    this.appService.showLoader();

    this.opService.getTrialAgency().subscribe({
      next: (res) => {
        this.trialAgencyOptions = res.data;
        this.appService.hideLoader();
      },
      error: (e) => {
        this.appService.hideLoader();
      },
    });
  }
  getShipDropdownData(): void {
    this.appService.showLoader();

    forkJoin({
      remarks: this.opService.getShipRemarks(),
      equipment: this.opService.getShipEquipment(),
      symptoms: this.opService.getShipSymptoms(),
      equipmentStatus: this.opService.getShipEquipmentStatus(),
    }).subscribe({
      next: (res: any) => {
        this.ssRemarksOptions = res.remarks.data;
        this.equipmentOptions = res.equipment.data;
        this.symptomsOptions = res.symptoms.data;
        this.equipmentAvailabilityStatusOptions = res.equipmentStatus.data;
        this.appService.hideLoader();
      },
      error: (_error) => {
        this.appService.hideLoader();
      },
    });
  }
  /** Maps this form's controls onto the DART creation API's payload shape. */
  buildDefectPayload(status: string) {
    const raw = this.form.getRawValue();
    const payload = new FormData();

    const fields: Record<string, unknown> = {
      status: status,
      defect_type: "DEFECT",
      equipment_ship: raw.equipmentNameDescription,
      dart_date: raw.defectDateOccurrence,
      equipment_status: raw.equipmentAvailabilityStatus,
      trial_required: raw.trialsRequired,
      defective_discriptions: raw.defectDescription,
      defective_component: raw.defectiveComponent,
      sapres_required: raw.sparesUsedRequired,
      ss_remark_code: raw.ssRemarks,
      symptom_code: raw.symptoms,
      standby_available: raw.standbyAvailable,
      defect_closed_remark: "", // no dedicated closure-remark field on this form yet
      // dart_trigger: raw.dartTrigger,
      hot_work: raw.hotworks,
      photograph: raw.attachment,
      spares: [], // spare-details panel doesn't emit its selection back to the host form yet
      is_defect_rectified: raw.defectRectifiedOnboard,
      trial_agency: raw.trialAgency || null,
    };

    Object.entries(fields).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      payload.append(
        key,
        typeof value === "object" ? JSON.stringify(value) : String(value),
      );
    });

    if (raw.attachment) {
      payload.append("photograph", raw.attachment, raw.attachment.name);
    }

    return payload;
  }
}
