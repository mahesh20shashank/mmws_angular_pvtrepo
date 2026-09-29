import { ChangeDetectionStrategy, Component, inject, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DropdownOption } from '../../../../shared/components/select-input/select-input';
import { FileInput } from '../../../../shared/components/file-input/file-input';
import { InputField } from '../../../../shared/components/input-field/input-field';
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import { RichTextEditor } from '../../../../shared/components/rich-text-editor/rich-text-editor';
import { SelectInput } from '../../../../shared/components/select-input/select-input';
import { SelectOptionConfig, SingleSelect } from '../../../../shared/components/single-select/single-select';
import { SpareDetails } from '../spare-details/spare-details';
import { OperationalMaintenanceApi } from '../../services/operational-maintenance-api';

const YES_NO_OPTIONS = [
  { label: 'Yes', value: 'Yes' },
  { label: 'No', value: 'No' },
];



/** Digital Defect Book — As&As reason. Explicit, named reactive form controls (not
 *  spec-driven) so every field's value/validity is directly addressable. */
@Component({
  selector: 'app-as-and-as-form',
  standalone: true,
  imports: [ReactiveFormsModule, ButtonComponent, SelectInput, SingleSelect, InputField, FileInput],
  templateUrl: './as-and-as-form.html',
  styleUrl: './as-and-as-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AsAndAsForm implements OnInit {
  ngOnInit(): void {
    this.getStaticData()
    this.getEquipmentdropdown()
    this.getSeverity()
    this.getEquipmentStatus()
  }
  private readonly fb = inject(FormBuilder);
  private readonly notification = inject(NotificationService);
  private opService = inject(OperationalMaintenanceApi)

  /** Emitted when the user clicks Cancel. */
  readonly back = output<void>();
  /** Emitted after a successful "Raise DART" submit — the session stays open (see
   *  `RecordedDefectsPanel`) instead of navigating away like Cancel does. */
  readonly raiseDart = output<void>();

  readonly submitAttempted = signal(false);

  readonly yesNoOptions = YES_NO_OPTIONS;
  readonly equipmentNameConfig: SelectOptionConfig = {
    value: 'id',
    label: 'equipment_name'
  }
  nomenclatureConfig: SelectOptionConfig = {
    value: 'id',
    label: 'nomenclature'
  }
  severtiyConfig: SelectOptionConfig = {
    value: 'id',
    label: 'severity_name'
  }
  trailAgencies: SelectOptionConfig = {
    value: 'id',
    label: 'name'
  }
  equipmentStatusConfig: SelectOptionConfig = {
    value: 'id',
    label: 'description'
  }

  asAndAsTypeOptions: DropdownOption[] = [];
  categoryOptions: DropdownOption[] = []
  equipmentStatusOptions:Record<string, unknown>[] = []
  natureOfAsAndAsOptions: DropdownOption[] = []
  equipmentNomenclatureOptions: Record<string, unknown>[] = []
  equipmentNameOptions: Record<string, unknown>[] = []
  operationalSeverityOptions: Record<string, unknown>[] = []
  trialAgencyOptions: Record<string, unknown>[] = []



  readonly form = this.fb.nonNullable.group({
    asAndAsType: ['', Validators.required],
    category: ['', Validators.required],
    equipmentName: ['', Validators.required],
    equipmentNomenclature: [''],
    equipmentSerialNumber: [{ value: '', disabled: true }],
    equipmentcode: ['', Validators.required],
    compartment: ['', Validators.required],
    locationOnBoard: [{ value: '', disabled: true }],
    dateOfOccurrence: ['', Validators.required],
    equipmentStatus: ['', Validators.required],
    operationalSeverity: ['', Validators.required],
    defectDescription: ['', Validators.required],
    trialsRequired: ['No'],
    trialAgency: [''],
    attachment: this.fb.control<File | null>(null),
    sparesUsedRequired: ['No', Validators.required],
    natureOfAsAndAs: ['', Validators.required],
    asAndAsJustification: ['', Validators.required],
    targetCompletionDate: ['', Validators.required],
    sanctioningAuthority: ['', Validators.required],

  });

  get showTrialAgency(): boolean {
    if (this.form.controls.trialsRequired.value === 'Yes') this.getTrialAgency()
    return this.form.controls.trialsRequired.value === 'Yes';
  }

  get showSpareDetails(): boolean {

    return this.form.controls.sparesUsedRequired.value === 'Yes';
  }

  cancel(): void {
    this.back.emit();
  }

  /** Maps this form's controls onto the `add-defect` API's field names and
   *  packs them into `FormData` (multipart, so the `photograph` file rides
   *  alongside the rest). `spares` is a JSON-encoded array per the API contract. */
  private buildPayload(status:string): FormData {
    const raw = this.form.getRawValue();
    const payload = new FormData();
    console.log(raw);

    const fields: Record<string, unknown> = {
      status:status,
      defect_type: 'AS_AND_AS',
      dart_date: raw.dateOfOccurrence,
      defective_discriptions: raw.defectDescription,
      category: raw.category,
      equipment_nomenclature: raw.equipmentNomenclature,
      equipment_serial_no: raw.equipmentSerialNumber,
      equipment_code: raw.equipmentcode,
      equipment_ship: raw.equipmentName,//id i am already patch here Id 
      compartment: raw.compartment,
      equipment_status: raw.equipmentStatus,
      severity_code: raw.operationalSeverity,
      as_and_as_type: raw.asAndAsType,
      nature_of_as_and_as: raw.natureOfAsAndAs,
      target_completion_date: raw.targetCompletionDate,
      as_and_as_justification: raw.asAndAsJustification,
      sanctioning_authority: raw.sanctioningAuthority,
      trial_required: raw.trialsRequired === 'Yes',
      trial_agency: raw.trialAgency || null,
      sapres_required: raw.sparesUsedRequired === 'Yes',
      spares: [],
    };

    Object.entries(fields).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      payload.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    });

    if (raw.attachment) {
      payload.append('photograph', raw.attachment, raw.attachment.name);
    }

    return payload;
  }

  saveDraft(): void {
    this.opService.addDefect(this.buildPayload('DRAFT')).subscribe({
      next: () => this.notification.info('Draft saved'),
      error: () => this.notification.error('Failed to save draft.'),
    });
  }

  submit(): void {
    this.submitAttempted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notification.error('Some mandatory fields are still required.');
      return;
    }

    this.notification.success('Digital Defect Book saved — hidden DART generated');
    this.raiseDart.emit();
  }
  getStaticData() {
    this.opService.getStaticDropdownDataDefect().subscribe({
      next: (res) => {
        this.asAndAsTypeOptions = res.data.as_and_as_type
        this.categoryOptions = res.data.category
        this.natureOfAsAndAsOptions = res.data.nature_of_as_and_as


      }
    })
  }
  getEquipmentdropdown() {
    this.opService.getEquipmentdropdown().subscribe({
      next: (res) => {
        this.equipmentNameOptions = res.data
      }
    })
  }
  getEquipmentStatus() {
    this.opService.getEquipmentStatus().subscribe({
      next: (res) => {
        this.equipmentStatusOptions = res.data
      }
    })
  }
  getSeverity() {
    this.opService.getSeverity().subscribe({
      next: (res) => {
        this.operationalSeverityOptions = res.data
      }
    })
  }
  // if trail agencies true then call this api
  getTrialAgency() {
    this.opService.getTrialAgency().subscribe({
      next: (res) => {
        this.trialAgencyOptions = res.data
      }
    })
  }
  onSelectEquipmentName(event: any) {
    this.form.get('equipmentcode')?.setValue(event.equipment_code)
    this.form.get('compartment')?.setValue(event.compartment?.id)
    this.opService.getNomenclatureByCode(event.equipment_code
    ).subscribe({
      next: (res) => {
        this.equipmentNomenclatureOptions = res.data.ship_equipments

      }
    })
  }
  onSelectEquipmentNomenclature(event: any) {
    this.opService.getNomenclatureDetailByID(event.id).subscribe({
      next: (res) => {
        this.form.get('equipmentSerialNumber')?.setValue(res.data.equipment_serial_no)
        this.form.get('locationOnBoard')?.setValue(res.data.location_on_board)
      }
    })
  }

}
