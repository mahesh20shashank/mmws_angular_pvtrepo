import { ChangeDetectionStrategy, Component, inject, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { FileInput } from '../../../../shared/components/file-input/file-input';
import { InputField } from '../../../../shared/components/input-field/input-field';
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import { OperationalMaintenanceApi } from '../../services/operational-maintenance-api';
import { RichTextEditor } from '../../../../shared/components/rich-text-editor/rich-text-editor';
import { SelectCard, SelectCards } from '../../../../shared/components/select-cards/select-cards';
import { SelectOptionConfig, SingleSelect } from '../../../../shared/components/single-select/single-select';
import { SpareDetails } from '../spare-details/spare-details';
import { TextareaInput } from '../../../../shared/components/textarea-input/textarea-input';
import { TrialDetails } from '../trial-details/trial-details';

const YES_NO_OPTIONS = [
  { label: 'Yes', value: 'Yes' },
  { label: 'No', value: 'No' },
];

const RAISED_WITH_AS_AND_AS_CARDS: SelectCard[] = [
  { id: 'With As&As', title: 'With As&As', desc: 'Item replaced under a ship-level A&A — survey board records the A&A reference.' },
  { id: 'Without As&As', title: 'Without As&As', desc: 'Straight condemnation onboard; no alteration or addition involved.' },
];

/** Digital Defect Book — ABER reason. Explicit, named reactive form controls (not
 *  spec-driven) so every field's value/validity is directly addressable. */
@Component({
  selector: 'app-aber-form',
  standalone: true,
  imports: [ReactiveFormsModule, ButtonComponent, SingleSelect, InputField, FileInput, TrialDetails, SpareDetails, SelectCards, TextareaInput],
  templateUrl: './aber-form.html',
  styleUrl: './aber-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AberForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly notification = inject(NotificationService);
  private readonly opService = inject(OperationalMaintenanceApi);

  ngOnInit(): void {
    this.getStaticData();
    this.getEquipmentdropdown();
    this.getOem();
    this.getSupplier();
    this.getEquipmentStatus()
    this.getSeverity()
  }

  /** Emitted when the user clicks Cancel. */
  readonly back = output<void>();
  /** Emitted after a successful "Raise DART" submit — the session stays open (see
   *  `RecordedDefectsPanel`) instead of navigating away like Cancel does. */
  readonly raiseDart = output<void>();

  readonly submitAttempted = signal(false);

  readonly yesNoOptions = YES_NO_OPTIONS;

  readonly raisedWithAsAndAsCards = RAISED_WITH_AS_AND_AS_CARDS;

  readonly equipmentNameConfig: SelectOptionConfig = {
    value: 'id',
    label: 'equipment_name',
  };

  readonly nomenclatureConfig: SelectOptionConfig = {
    value: 'id',
    label: 'nomenclature',
  };

  readonly oemConfig: SelectOptionConfig = {
    value: 'id',
    label: 'name',
  };

  readonly supplierConfig: SelectOptionConfig = {
    value: 'id',
    label: 'name',
  };
  readonly equipmentStatusConfig: SelectOptionConfig = {
    value: 'id',
    label: 'description'
  }
  readonly severtiyConfig: SelectOptionConfig = {
    value: 'id',
    label: 'severity_name'
  }
  categoryOptions: Record<string, unknown>[] = [];

  equipmentNameOptions: Record<string, unknown>[] = [];

  equipmentStatusOptions: Record<string, unknown>[] = [

  ];

  operationalSeverityOptions: Record<string, unknown>[] = [

  ];

  /** Options for the newer item-detail dropdowns below — not yet backed by an
   *  API, so these start empty and render as "No results found" until a
   *  master-data endpoint is wired up for each. */
  modelOptions: Record<string, unknown>[] = [];
  equipmentNomenclatureOptions: Record<string, unknown>[] = [];
  oemNameOptions: Record<string, unknown>[] = [];
  supplierOptions: Record<string, unknown>[] = [];
  oemDartNoOptions: Record<string, unknown>[] = [];
  equipmentSerialNumberOptions: Record<string, unknown>[] = [];
  locationOnBoardOptions: Record<string, unknown>[] = [];
  compartmentNameOptions: Record<string, unknown>[] = [];
  shelfLifeOptions: Record<string, unknown>[] = [];
  linkedAsAndAsReferenceOptions: Record<string, unknown>[] = [];

  form = this.fb.nonNullable.group({
    category: ['', Validators.required],
    raisedWithAsAndAs: ['Without As&As', Validators.required],
    equipmentName: ['', Validators.required],
    equipmentModel: [''],
    equipmentNomenclature: [''],
    oemName: [''],
    supplier: [''],
    oemPartNo: [''],
    equipmentSerialNumber: [''],
    deckNumber: [''],
    frameStation: [''],
    locationOnBoard: [''],
    compartmentName: [''],
    installationDate: [''],
    authorityForInstallation: [''],
    quantityFitted: [''],
    shelfLife: [''],
    dateOfOccurrence: ['', Validators.required],
    equipmentStatus: ['', Validators.required],
    operationalSeverity: ['', Validators.required],
    trialsRequired: [''],
    defectDescription: ['', Validators.required],
    sparesUsedRequired: ['', Validators.required],
    attachment: this.fb.control<File | null>(null),
    repairCost: [''],
    bookValue: [{ value: '', disabled: true }],
    aberJustification: [''],
    asAndAsType: [{ value: '', disabled: true }],
    asAndAsReferenceNumber: [{ value: '', disabled: true }],
    linkedAsAndAsReference: [''],
  });

  pickRaisedWithAsAndAs(value: string): void {
    this.form.controls.raisedWithAsAndAs.setValue(value);
  }

  get showTrialDetails(): boolean {
    return this.form.controls.trialsRequired.value === 'Yes';
  }

  get showSpareDetails(): boolean {
    return this.form.controls.sparesUsedRequired.value === 'Yes';
  }

  get isWithAsAndAs(): boolean {
    return this.form.controls.raisedWithAsAndAs.value === 'With As&As';
  }

  cancel(): void {
    this.back.emit();
  }

  saveDraft(): void {
    this.notification.info('Draft saved');
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

  getStaticData(): void {
    this.opService.getStaticDropdownDataDefect().subscribe({
      next: (res) => {
        this.categoryOptions = res.data.category;
      },
    });
  }

  getEquipmentdropdown(): void {
    this.opService.getEquipmentdropdown().subscribe({
      next: (res) => {
        this.equipmentNameOptions = res.data;
      },
    });
  }

  getOem(): void {
    this.opService.getOem().subscribe({
      next: (res) => {
        this.oemNameOptions = res.data;
      },
    });
  }

  getSupplier(): void {
    this.opService.getSupplier().subscribe({
      next: (res) => {
        this.supplierOptions = res.data;
      },
    });
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
  onSelectEquipmentName(event: any): void {


    this.form.get('equipmentModel')?.setValue(event?.equipment_model)
    this.form.get('oemPartNo')?.setValue(event?.oem_part_no)
    this.form.get('shelfLife')?.setValue(event?.service_life)
    console.log(event);

    this.opService.getNomenclatureByCode(event.equipment_code).subscribe({
      next: (res) => {
        this.equipmentNomenclatureOptions = res.data.ship_equipments;
      },
    });
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
