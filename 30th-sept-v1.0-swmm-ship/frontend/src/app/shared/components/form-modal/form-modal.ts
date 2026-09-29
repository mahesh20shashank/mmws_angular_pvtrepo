import { ButtonComponent } from '../button/button.component';
import { ChangeDetectorRef, Component, Input, Output, EventEmitter, inject, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SelectInput } from '../select-input/select-input';
import { InputField } from '../input-field/input-field';
import { DefectService } from '../../../Modules/operational-maintenance/action-forms/defact-form/defect-service';
import { OperationalMaintenanceApi } from '../../../Modules/operational-maintenance/services/operational-maintenance-api';

interface ModalField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'textarea';

  placeholder?: string;

  options?: {
    label: string;
    value: string | number;
  }[];

  value?: string | number;
  readonly?: boolean;
}

/** A single entry from the `ops_period`/`refit_period` arrays already returned
 * by `add_dart/?department_id=<id>` — there is no separate "maintenance period
 * name" endpoint; that data lives here. */
interface MaintenancePeriodEntry {
  id: number | string;
  maintaince_period_type: string;
  occassion: string;
  period_name: string;
  start_date: string;
  end_date: string;
}

interface MaintenanceMasterData {
  maitainance_period_types?: string[];
  ops_period?: MaintenancePeriodEntry[];
  refit_period?: MaintenancePeriodEntry[];
}

interface MaintenancePeriodOption {
  id: number | string;
  name: string;
  start_date: string;
  end_date: string;
}

// Occasions that carry a linked existing-period lookup (id + start/end date), matching the
// legacy DART flow exactly: Operational's AMP/SMP/EAMP show an "Existing Nomenclature"
// picker + Completion Date; Refit's DL II shows an "Existing Refit" picker + End Date.
// Everything else is a plain occasion with no extra fields.
const OPERATIONAL_PERIOD_OCCASIONS = ['AMP', 'SMP', 'EAMP'];
const REFIT_PERIOD_OCCASIONS = ['DL II'];
const OPERATIONAL_TYPE = 'OPERATIONAL';
const REFIT_TYPE = 'REFIT';
const ABER_OCCASION = 'DL III (As and As / ABER)';

// DL II and DL III (ABER) both pick the "Existing Refit" from the ship's equipment
// master (`equipment_list`) rather than from a maintenance-period lookup, and don't
// offer the "Add New Nomenclature" escape hatch that AMP/SMP/EAMP use.
const EQUIPMENT_LIST_OCCASIONS = ['DL II', ABER_OCCASION];

// DART Occasion is a fixed, hardcoded list per maintenance period type — there is no
// backend endpoint for this, and none is planned; these match the legacy DART UI exactly.
const OPERATIONAL_OCCASIONS = [
  'Normal Defect',
  'Signal RA',
  'OPDEF',
  'Guarantee DEFECT',
  'AMP',
  'SMP',
  'EAMP',
  'Trial Unit Observations',
  'OST/Workup Observations',
];
const REFIT_OCCASIONS = ['DL II', 'SDL', 'AWRF', 'REFIT RA'];

// Sentinel value for the "Existing Nomenclature" dropdown's escape hatch — selecting it
// sends the user to the SMP/AMP/EAMP master-data page instead of picking a period.
const CREATE_NEW_NOMENCLATURE = 'create_new';

import { ModalComponent } from '../modal/modal.component';

@Component({
  selector: 'app-form-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SelectInput,
    InputField,
    ButtonComponent,
    ModalComponent
  ],
  templateUrl: './form-modal.html',
  styleUrl: './form-modal.css',
})


export class FormModal implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly defectService = inject(DefectService);
  private readonly opMaintenance = inject(OperationalMaintenanceApi);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  @Input() title = 'Confirm Save';

  // A's & A's / ABER always saves under a fixed Operational / DL III occasion — those
  // two fields are pre-filled and locked rather than left for the user to (re)pick.
  @Input() dartType: 'defect' | 'guarantee' | 'aber' | null = null;

  @Output() save = new EventEmitter<Record<string, unknown>>();

  @Output() cancel_btn = new EventEmitter<void>();
  showRefitFields = false;
  form!: FormGroup;


  fields: ModalField[] = [
    {
      key: 'dartForMaintenance',
      label: 'Maintenance Period Type',
      type: 'select',
      value: '',
      options: []
    },
    {
      key: 'dartOccasion',
      label: 'Occasion',
      type: 'select',
      value: '',
      options: []
    },
    {
      key: 'existingRefit',
      label: 'Existing Refit',
      type: 'select',
      value: '',
      options: []
    },
    {
      key: 'startDate',
      label: 'Start Date',
      type: 'date',
      readonly: true
    },
    {
      key: 'endDate',
      label: 'End Date',
      type: 'date',
      readonly: true
    }
  ];

  /** Raw period entries from add_dart/'s `ops_period`/`refit_period` — filtered
   * down (by occasion, for Operational) into `maintenancePeriods` below whenever
   * the Occasion field changes. */
  private opsPeriods: MaintenancePeriodEntry[] = [];
  private refitPeriods: MaintenancePeriodEntry[] = [];
  maintenancePeriods: MaintenancePeriodOption[] = [];

  async ngOnInit() {
    await this.loadMasterData();

    const controls: Record<string, unknown> = {};

    this.fields.forEach(field => {
      controls[field.key] = [
        {
          value: field.value ?? '',
          disabled: !!field.readonly
        },
        this.isRequiredField(field.key) ? [Validators.required] : []
      ];
    });

    this.form = this.fb.group(controls);

    if (this.dartType === 'aber') {
      this.applyAberDefaults();
    }

    // Maintenance Type Change
    this.form
      .get('dartForMaintenance')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        this.updateDartOccasionOptions(value);
        this.resetPeriodFieldLabels();

        this.form.patchValue({
          dartOccasion: null,
          existingRefit: null,
          startDate: null,
          endDate: null
        });
      });

    // Occasion Change
    this.form
      .get('dartOccasion')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(occasion => {

        const maintenanceType: string =
          this.form.get('dartForMaintenance')?.value ?? '';

        const isOperationalPeriod =
          maintenanceType.toUpperCase() === OPERATIONAL_TYPE &&
          OPERATIONAL_PERIOD_OCCASIONS.includes(occasion);

        const isRefitPeriod =
          maintenanceType.toUpperCase() === REFIT_TYPE &&
          REFIT_PERIOD_OCCASIONS.includes(occasion);

        const needsPeriodBlock = isOperationalPeriod || isRefitPeriod;

        this.showRefitFields = needsPeriodBlock;

        const existingRefitControl = this.form.get('existingRefit');
        existingRefitControl?.setValidators(needsPeriodBlock ? [Validators.required] : []);
        existingRefitControl?.updateValueAndValidity({ emitEvent: false });

        const refitField = this.fields.find(f => f.key === 'existingRefit');
        const endDateField = this.fields.find(f => f.key === 'endDate');

        if (refitField) {
          refitField.label = isOperationalPeriod
            ? `Existing Nomenclature ${occasion}`
            : 'Existing Refit';
        }
        if (endDateField) {
          endDateField.label = isOperationalPeriod ? 'Completion Date' : 'End Date';
        }

        if (!needsPeriodBlock) {
          this.form.patchValue({
            existingRefit: null,
            startDate: null,
            endDate: null
          });

          return;
        }

        this.applyExistingPeriodOptions(occasion, isOperationalPeriod);
        this.cdr.detectChanges();
      });

    // Existing Refit / Existing Nomenclature Change
    this.form
      .get('existingRefit')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(id => {

        if (id === CREATE_NEW_NOMENCLATURE) {
          this.router.navigateByUrl('/afterAuth/op-maintenance/defect/references-masters');
          this.cancel_btn.emit();
          return;
        }

        const selected =
          this.maintenancePeriods.find(
            x => x.id === id
          );

        if (!selected) {
          return;
        }

        this.form.patchValue({
          startDate: selected.start_date,
          endDate: selected.end_date
        });
      });

    this.cdr.detectChanges();
  }
  private applyAberDefaults(): void {
    const occasionField = this.fields.find(f => f.key === 'dartOccasion');
    if (occasionField) {
      occasionField.options = [{ label: ABER_OCCASION, value: ABER_OCCASION }];
    }

    this.form.patchValue(
      {
        dartForMaintenance: OPERATIONAL_TYPE,
        dartOccasion: ABER_OCCASION,
      },
      { emitEvent: false },
    );

    this.form.get('dartForMaintenance')?.disable({ emitEvent: false });
    this.form.get('dartOccasion')?.disable({ emitEvent: false });

    // ABER always shows the linked "Existing Refit" picker + its Start/Completion
    // Date block, same as the AMP/SMP/EAMP occasions — it just isn't reached via the
    // normal maintenance-type/occasion valueChanges chain since the occasion here is
    // fixed rather than user-picked.
    this.showRefitFields = true;
    this.applyExistingPeriodOptions(ABER_OCCASION, true);

    // Unlike AMP/SMP/EAMP/DL II, ABER doesn't require the user to pick an
    // existing refit — the picker is offered but left optional and empty.
    const existingRefitControl = this.form.get('existingRefit');
    existingRefitControl?.setValidators([]);
    existingRefitControl?.setValue(null, { emitEvent: false });
    existingRefitControl?.updateValueAndValidity({ emitEvent: false });
  }

  async loadMasterData() {
    const departmentId = (await this.opMaintenance.getCurrentDepartmentId()) ?? 1;
    const data =
      (await this.defectService.getMasterData(departmentId)) as MaintenanceMasterData;

    // Maintenance Type Dropdown — always Operational/Refit. There is no backend endpoint
    // for this (RefitMaintenancePeriod has no rows to derive it from, and isn't meant to),
    // so it's a fixed pair rather than something fetched.
    const maintenanceField =
      this.fields.find(
        f => f.key === 'dartForMaintenance'
      );

    if (maintenanceField) {
      maintenanceField.options = [
        { label: 'Operational', value: OPERATIONAL_TYPE },
        { label: 'Refit', value: REFIT_TYPE },
      ];
    }

    // ops_period/refit_period come straight from add_dart/'s response — there is
    // no separate "maintenance period name" endpoint to call.
    this.opsPeriods = data.ops_period ?? [];
    this.refitPeriods = data.refit_period ?? [];
  }

  /** Populates the "Existing Nomenclature"/"Existing Refit" dropdown from the
   * already-fetched master data instead of a network call:
   * - DL II / DL III (ABER): left empty — no options bound, no create-new option.
   * - Operational + AMP/SMP/EAMP: every `opsPeriods` entry, unfiltered — the picker
   *   shows all existing nomenclature regardless of which occasion (AMP/SMP/EAMP) it
   *   was originally created under, plus the create-new escape hatch. */
  private applyExistingPeriodOptions(occasion: string, isOperationalPeriod: boolean): void {
    const refitField = this.fields.find(f => f.key === 'existingRefit');

    if (EQUIPMENT_LIST_OCCASIONS.includes(occasion)) {
      this.maintenancePeriods = [];

      if (refitField) {
        refitField.options = [];
      }

      this.form.patchValue({
        existingRefit: null,
        startDate: null,
        endDate: null
      }, { emitEvent: false });
      return;
    }

    const source = isOperationalPeriod ? this.opsPeriods : this.refitPeriods;

    this.maintenancePeriods = source.map(p => ({
      id: p.id,
      name: p.period_name,
      start_date: p.start_date,
      end_date: p.end_date,
    }));

    if (refitField) {
      const periodOptions = this.maintenancePeriods.map(item => ({
        label: item.name,
        value: item.id,
      }));

      refitField.options = [
        ...periodOptions,
        { label: 'Add New Nomenclature', value: CREATE_NEW_NOMENCLATURE },
      ];
    }

    this.form.patchValue({
      existingRefit: null,
      startDate: null,
      endDate: null
    }, { emitEvent: false });
  }

  private resetPeriodFieldLabels(): void {
    const refitField = this.fields.find(f => f.key === 'existingRefit');
    const endDateField = this.fields.find(f => f.key === 'endDate');

    if (refitField) {
      refitField.label = 'Existing Refit';
    }
    if (endDateField) {
      endDateField.label = 'End Date';
    }
  }

  updateDartOccasionOptions(
    maintenanceType: string
  ) {
    const occasionField =
      this.fields.find(
        f => f.key === 'dartOccasion'
      );

    if (!occasionField) {
      return;
    }

    const maintenanceTypeKey = (maintenanceType ?? '').toUpperCase();
    let occasions: string[] = [];

    if (maintenanceTypeKey === REFIT_TYPE) {
      occasions = REFIT_OCCASIONS;
    } else if (maintenanceTypeKey === OPERATIONAL_TYPE) {
      occasions = OPERATIONAL_OCCASIONS;
    }

    occasionField.options = occasions.map((item: string) => ({
      label: item,
      value: item
    }));
  }

  // Maintenance Period Type and Occasion are always required; Existing Refit/Nomenclature
  // is only required once its dropdown is actually shown (AMP/SMP/EAMP/DL II occasions).
  isRequiredField(key: string): boolean {
    if (key === 'existingRefit') {
      return this.showRefitFields && this.dartType !== 'aber';
    }
    return key === 'dartForMaintenance' || key === 'dartOccasion';
  }

  getError(fieldName: string): string {
    const control = this.form.get(fieldName);

    if (!control?.touched || !control.invalid) {
      return '';
    }

    if (control.hasError('required')) {
      return 'This field is required';
    }

    return '';
  }

  shouldShowField(field: ModalField): boolean {
    const dependentFields = [
      'existingRefit',
      'startDate',
      'endDate'
    ];

    if (dependentFields.includes(field.key)) {
      return this.showRefitFields;
    }

    return true;
  }
  onSave() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.save.emit(this.form.getRawValue());
  }

  onCancel() {
    this.cancel_btn.emit();
  }

}
