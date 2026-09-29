import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, defaultIfEmpty, takeUntil } from 'rxjs';
import {
  ApiService,
  DropdownOption,
  RequestParams,
} from '../../api.service';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
// import { TrailService } from '../../../../../services/trail.service';
import { Apiendpoints, equipmentHtml } from '../../ApiEndPoints';
import { TransactionOptionMap } from './initiate-trials-dialog.types';
// import { trialTypeNavigateOptions } from '../../../../../../utils/trial-type-route';
import { TrailService } from '../../trail.service';

const DD = {
  nameId: { labelKey: 'name' as const, valueKey: 'id' as const },
  nameHtml: {
    labelKey: 'name' as const,
    valueKey: 'id' as const,
    htmlTag: `
      <div>
        <div class="font-bold text-[15px] leading-[1.05]">
          {{item.name}}
        </div>
        <div class="text-[12px] text-gray-100 mt-[2px]">
          Equipment Nomenclature: {{item.nomenclature || '-'}}<span *ngIf="item.nomenclature">,</span>
          Model: {{item.model || '-'}}<span *ngIf="item.model">,</span>
          Serial Number: {{item.serial_no || '-'}}
        </div>
      </div>
    ` as const,
  },
  satelliteByTrial: 'trial_unit' as const,
  sectionBySatellite: 'satellite_unit' as const,
  equipmentBySection: 'section' as const,
  subsystemBySystem: 'system' as const,
  systemHtml: {
    labelKey: 'name' as const,
    valueKey: 'id' as const,
    htmlTag: `
      <div>
        <div class="font-bold text-[15px] leading-[1.05]">{{item.name}}</div>
        <div class="text-[12px] text-gray-100 mt-[2px]">
          Code: {{item.code || '-'}}
        </div>
      </div>
    ` as const,
  },
};

const SUB_SATELLITE_TRIAL_UNIT_ID = 6;

type SegSelectionMode = 'none' | 'system' | 'equipment';

interface SegSystemDetail {
  system_id: string | number;
  system_name: string;
}

interface SegSubsystemDetail {
  subsystem_id: string | number;
  subsystem_name: string;
  system_id: string | number;
  system_name: string;
}

@Component({
  selector: 'app-initiate-trials-dialog',
  standalone: true,
  imports: [CommonModule, AddFormComponent],
  templateUrl: './initiate-trials-dialog.component.html',
})
export class InitiateTrialsDialogComponent implements OnChanges, OnDestroy {
  @ViewChild(AddFormComponent) private initiateForm?: AddFormComponent;

  @Input() open = false;
  @Output() openChange = new EventEmitter<boolean>();

  @Input() title = 'INITIATE TRIALS';
  @Input() readOnly = false;
  formData: any = {};
  /** Options loaded by parent after forkJoin; drives form config */
  @Input() optionMap!: TransactionOptionMap;
  /** When parent finishes loading dropdowns, form config is rebuilt */
  @Input() dropdownsLoaded = false;
  /** SEG Forms: after section, user picks System or Equipment via checkboxes */
  readonly segFormsMode = input(false);
  /** SEG Catalogue: lock trial type to Create Catalogue */
  readonly segCatalogueMode = input(false);

  TABS = [
    { key: 'operational_trial', label: 'Operational Trial' },
    { key: 'refit_trial', label: 'Refit Trial' },
  ];

  formConfigForInitiateTrial: any[] = [];

  private initiateCascade = {
    satelliteUnit: [] as DropdownOption[],
    subSatelliteUnit: [] as DropdownOption[],
    section: [] as DropdownOption[],
    equipment: [] as DropdownOption[],
    system: [] as DropdownOption[],
    subsystem: [] as DropdownOption[],
  };
  private initiateTrialTypeOptions: DropdownOption[] = [];
  private segSelectionMode: SegSelectionMode = 'none';

  /** Fallback if form snapshot omits ship/trial_unit when section changes */
  private lastShipId: string | number | undefined;
  private lastTrialUnitId: string | number | undefined;
  /** Maps subsystem id → detail row (includes parent system for initiate payload) */
  private readonly subsystemRowById = new Map<string, SegSubsystemDetail>();

  private readonly destroy$ = new Subject<void>();
  private readonly apiService= inject(ApiService);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly ngZone = inject(NgZone);
    private readonly trailService = inject(TrailService);
    private readonly router = inject(Router);

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['dropdownsLoaded'] && this.dropdownsLoaded) ||
      changes['optionMap']
    ) {
      if (this.optionMap?.trialUnit && this.optionMap?.ship) {
        this.initiateTrialTypeOptions = [];
        this.rebuildInitiateFormConfig();
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Reset cascade and open modal — called from parent Initiate button / deep link */
  openForm(): void {
    this.initiateCascade = {
      satelliteUnit: [],
      subSatelliteUnit: [],
      section: [],
      equipment: [],
      system: [],
      subsystem: [],
    };
    this.segSelectionMode = this.segFormsMode() ? 'system' : 'none';
    this.lastShipId = undefined;
    this.lastTrialUnitId = undefined;
    this.subsystemRowById.clear();
    this.initiateTrialTypeOptions = [];
    const segUnit = this.segFormsMode() ? this.findSegTrialUnitOption() : undefined;
    if (segUnit) {
      this.lastTrialUnitId = this.normalizeId(segUnit.value);
    }
    this.formData = {
        self_certified: false,
      ...(this.segFormsMode() || this.segCatalogueMode()
        ? {
            select_system: true,
            select_equipment: false,
            section: '',
            system: [],
            subsystem: [],
            equipment: [],
            ...(segUnit ? { trial_unit: segUnit.value } : {}),
          }
        : {}),
    };
    this.rebuildInitiateFormConfig();
    this.openChange.emit(true);
    if (this.segFormsMode()) {
      setTimeout(() => {
        this.applySegTrialUnitDefaults();
        this.applySegSystemCheckboxDefaults();
      }, 0);
    } else if (this.segCatalogueMode()) {
      setTimeout(() => this.applySegCatalogueTrialTypeDefaults(), 0);
    }
  }

  /** Resolve SEG trial unit from master/trial-units dropdown options */
  private findSegTrialUnitOption(): DropdownOption | undefined {
    const units = this.optionMap?.trialUnit ?? [];
    return (
      units.find((u) => String(u.label ?? '').trim().toUpperCase() === 'SEG') ??
      units.find((u) => String(u.label ?? '').toUpperCase().includes('SEG'))
    );
  }

  /** SEG Forms: lock trial unit to SEG and load satellite units */
  private applySegTrialUnitDefaults(): void {
    if (!this.segFormsMode()) {
      return;
    }

    const segUnit = this.findSegTrialUnitOption();
    if (!segUnit) {
      console.warn('[InitiateTrials] SEG trial unit not found in trial unit options.');
      return;
    }

    const segValue = segUnit.value;
    this.lastTrialUnitId = this.normalizeId(segValue);
    this.formData.trial_unit = segValue;

    this.formConfigForInitiateTrial = this.formConfigForInitiateTrial.map((f) =>
      f.key === 'trial_unit'
        ? {
            ...f,
            disabled: true,
            options: [segUnit],
            label: 'Trial Unit (SEG)',
          }
        : f,
    );

    if (this.lastTrialUnitId !== undefined) {
      this.loadTrialTypesForInitiate(this.lastTrialUnitId);
      this.apiService
        .getDropdownData('master/satellite-units/', DD.nameId, {
          [DD.satelliteByTrial]: segValue,
        } as RequestParams)
        .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
        .subscribe((opts) =>
          this.updateInitiateFieldOptions('satellite_unit', opts),
        );
    }

    setTimeout(() => {
      this.initiateForm?.patchFormPartial({ trial_unit: segValue });
      const ctrl = this.initiateForm?.form?.get('trial_unit');
      if (ctrl && this.segFormsMode()) {
        ctrl.disable({ emitEvent: false });
      }
      this.initiateForm?.form?.updateValueAndValidity();
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    }, 0);
  }

  /** SEG Forms / Catalogue: default to System checked and show system fields */
  private applySegSystemCheckboxDefaults(): void {
    if (!this.segFormsMode()) {
      return;
    }

    this.formData.select_system = true;
    this.formData.select_equipment = false;
    this.segSelectionMode = 'system';
    this.applySegSelectionMode('system');

    const section =
      this.formData.section ??
      this.initiateForm?.getFormSnapshot?.()?.['section'];
    // Load systems only after user picks section (onFieldChange), not on dialog open
    if (this.hasVal(section) && !this.segCatalogueMode() && !this.segFormsMode()) {
      this.loadSystemsForInitiate(section);
    }

    setTimeout(() => {
      this.initiateForm?.patchFormPartial({
        select_system: true,
        select_equipment: false,
        equipment: [],
      });
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    }, 0);
  }

  /** Resolve Create Catalogue trial type from loaded trial-type options */
  private findCreateCatalogueTrialTypeOption(): DropdownOption | undefined {
    const opts =
      this.initiateTrialTypeOptions.length > 0
        ? this.initiateTrialTypeOptions
        : (this.optionMap?.trialType ?? []);
    const normalized = (label: string) => label.trim().toUpperCase();
    return (
      opts.find((t) => normalized(String(t.label ?? '')) === 'CREATE CATALOGUE') ??
      opts.find((t) => normalized(String(t.label ?? '')) === 'SEG-CREATE CATALOGUE') ??
      opts.find((t) => normalized(String(t.label ?? '')).includes('CREATE CATALOGUE'))
    );
  }

  /** SEG Catalogue: lock trial type to Create Catalogue */
  private applySegCatalogueTrialTypeDefaults(): void {
    if (!this.segCatalogueMode()) {
      return;
    }

    const catalogueType = this.findCreateCatalogueTrialTypeOption();
    if (!catalogueType) {
      console.warn(
        '[InitiateTrials] Create Catalogue trial type not found in trial type options.',
      );
      return;
    }

    const typeValue = catalogueType.value;
    this.formData.trial_type = typeValue;

    this.formConfigForInitiateTrial = this.formConfigForInitiateTrial.map((f) =>
      f.key === 'trial_type'
        ? {
            ...f,
            disabled: true,
            options: [catalogueType],
            label: 'Trial Type (Create Catalogue)',
          }
        : f,
    );

    setTimeout(() => {
      this.initiateForm?.patchFormPartial({ trial_type: typeValue });
      const ctrl = this.initiateForm?.form?.get('trial_type');
      if (ctrl && this.segCatalogueMode()) {
        ctrl.disable({ emitEvent: false });
      }
      this.initiateForm?.form?.updateValueAndValidity();
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    }, 0);
  }

  onShellOpenChange(next: boolean): void {
    this.openChange.emit(next);
  }

  private initiateFieldLabel(fieldKey: string): string {
    const map = this.optionMap;
    const cascade = this.initiateCascade;
    switch (fieldKey) {
      case 'ship_id':
        return `Ship/Submarine (${map.ship.length} available)`;
      case 'trial_unit':
        return `Selected Trial Unit (${map.trialUnit.length} available)`;
      case 'satellite_unit':
        return `Select Satellite Unit (${cascade.satelliteUnit.length} available)`;
      case 'sub_satellite_unit':
        return `Select Sub Satellite Unit (${cascade.subSatelliteUnit.length} available)`;
      case 'section':
        return `Select Section (${cascade.section.length} available)`;
      case 'equipment':
        return `Select Equipment (${cascade.equipment.length} available)`;
      case 'system':
        return `Select System (${cascade.system.length} available)`;
      case 'subsystem':
        return `Select Sub System (${cascade.subsystem.length} available)`;
      case 'select_system':
        return 'System';
      case 'select_equipment':
        return 'Equipment';
      case 'trial_type':
        return `Select Trial Type (${this.initiateTrialTypeOptions.length} available)`;
      case 'refit_type':
        return `Refit Type`;
      default:
        return fieldKey;
    }
  }

  private rebuildInitiateFormConfig(): void {
    const map = this.optionMap;
    const cascade = this.initiateCascade;
    const userDetails = JSON.parse(localStorage.getItem('user') || '{}');
    const shipId = userDetails?.ship_id;
    const satelliteUnit = userDetails?.satellite_unit_id;
    this.formConfigForInitiateTrial = [
      {
        label: this.initiateFieldLabel('section'),
        key: 'section',
        type: 'select-multiple',
        required: true,
        options: [...cascade.section],
        placeholder: 'Select Section',
        colSpan: 3,
      },
      ...this.buildPostSectionFields(),
      {
        label: this.initiateFieldLabel('trial_type'),
        key: 'trial_type',
        type: 'select',
        required: true,
        options: [...this.initiateTrialTypeOptions],
        colSpan: shipId ? 1.5 : 2,
        placeholder: 'Select Trial Type',
        dropdownPlacement: 'top',
      },
      ...(shipId
        ? [
            {
              label: 'Self Certified',
              key: 'self_certified',
              type: 'radio',
              required: false,
              colSpan: 1.5,
              options: [
                { label: 'Yes', value: true },
                { label: 'No', value: false },
              ],
            },
          ]
        : []),
    ];
    if (satelliteUnit) {
      this.formData.satellite_unit = satelliteUnit;
      this.formConfigForInitiateTrial.unshift(this.subSatelliteUnitField());
      if (this.formData.trial_unit) {
        this.lastTrialUnitId = this.normalizeId(this.formData.trial_unit);
        this.loadTrialTypesForInitiate(this.formData.trial_unit);
      } else {
        this.getTrialType(satelliteUnit);
      }
      cascade.satelliteUnit?.length > 0
        ? this.updateInitiateFieldOptions('satellite_unit', [
            ...cascade.satelliteUnit,
          ])
        : this.onInitiateFieldChange({
            key: 'satellite_unit',
            value: satelliteUnit,
            form: this.formData,
          });
    } else {
      // Insert the object at index 2 (i.e., after index 1), shifting others to the right
      const segUnit = this.segFormsMode() ? this.findSegTrialUnitOption() : undefined;
      this.formConfigForInitiateTrial.unshift(
        {
          label: segUnit ? 'Trial Unit (SEG)' : this.initiateFieldLabel('trial_unit'),
          key: 'trial_unit',
          type: 'select',
          required: true,
          options: segUnit ? [segUnit] : map.trialUnit,
          placeholder: 'Select Trial Unit',
          colSpan: 1.5,
          disabled: this.segFormsMode(),
        },
        {
          label: this.initiateFieldLabel('satellite_unit'),
          key: 'satellite_unit',
          type: 'radio',
          required: true,
          options: [...cascade.satelliteUnit],
          placeholder: 'Select Satellite Unit',
          colSpan: 1.5,
        },
        this.subSatelliteUnitField(),
      );
    }
    if (shipId) {
      this.formData.ship_id = shipId;
    } else {
      this.formConfigForInitiateTrial.unshift({
        label: this.initiateFieldLabel('ship_id'),
        key: 'ship_id',
        type: 'select',
        required: true,
        options: map.ship,
        placeholder: 'Select Ship',
        colSpan: 1.5,
      });
    }

    this.applySegTrialUnitDefaults();

    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  private subSatelliteUnitField(): any {
    const show = this.shouldShowSubSatelliteUnit();
    return {
      label: this.initiateFieldLabel('sub_satellite_unit'),
      key: 'sub_satellite_unit',
      type: 'select',
      required: show,
      options: [...this.initiateCascade.subSatelliteUnit],
      placeholder: 'Select Sub Satellite Unit',
      colSpan: 1.5,
      hide: !show,
    };
  }

  /** Trial: equipment only. SEG Forms: System / Equipment checkboxes + conditional dropdowns. */
  private buildPostSectionFields(): any[] {
    if (!this.segFormsMode()) {
      return [
        {
          label: this.initiateFieldLabel('equipment'),
          key: 'equipment',
          type: 'select-multiple',
          required: true,
          options: [...this.initiateCascade.equipment],
          colSpan: 3,
          placeholder: 'Select Equipment',
        },
      ];
    }

    const showSystem = this.segSelectionMode === 'system';
    const showEquipment = this.segSelectionMode === 'equipment';

    return [
      {
        label: this.initiateFieldLabel('select_system'),
        key: 'select_system',
        type: 'checkbox',
        required: false,
        colSpan: 1.5,
      },
      {
        label: this.initiateFieldLabel('select_equipment'),
        key: 'select_equipment',
        type: 'checkbox',
        required: false,
        colSpan: 1.5,
      },
      {
        label: this.initiateFieldLabel('system'),
        key: 'system',
        type: 'select-multiple',
        required: showSystem,
        options: [...this.initiateCascade.system],
        colSpan: 3,
        placeholder: 'Select System',
        hide: !showSystem,
      },
      {
        label: this.initiateFieldLabel('subsystem'),
        key: 'subsystem',
        type: 'select-multiple',
        required: false,
        options: [...this.initiateCascade.subsystem],
        colSpan: 3,
        placeholder: 'Select Sub System',
        hide: !showSystem,
      },
      {
        label: this.initiateFieldLabel('equipment'),
        key: 'equipment',
        type: 'select-multiple',
        required: showEquipment,
        options: [...this.initiateCascade.equipment],
        colSpan: 3,
        placeholder: 'Select Equipment',
        hide: !showEquipment,
      },
    ];
  }

  private applySegSelectionMode(mode: SegSelectionMode): void {
    this.segSelectionMode = mode;
    const sectionIdx = this.formConfigForInitiateTrial.findIndex(
      (f) => f.key === 'section',
    );
    if (sectionIdx === -1) {
      return;
    }
    const trialTypeField = this.formConfigForInitiateTrial.find(
      (f) => f.key === 'trial_type',
    );
    const head = this.formConfigForInitiateTrial.slice(0, sectionIdx + 1);
    this.formConfigForInitiateTrial = [
      ...head,
      ...this.buildPostSectionFields(),
      ...(trialTypeField ? [trialTypeField] : []),
    ];
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  private handleSegCheckboxChange(
    key: 'select_system' | 'select_equipment',
    checked: boolean,
    form?: Record<string, any>,
  ): void {
    if (key === 'select_system' && checked) {
      queueMicrotask(() =>
        this.initiateForm?.patchFormPartial({
          select_equipment: false,
          equipment: [],
        }),
      );
      this.segSelectionMode = 'system';
      this.updateInitiateFieldOptions('equipment', []);
      this.applySegSelectionMode('system');
      const section = form?.['section'] ?? this.initiateForm?.getFormSnapshot?.()?.['section'];
      if (this.hasVal(section)) {
        this.loadSystemsForInitiate(section, form);
      }
      return;
    }

    if (key === 'select_equipment' && checked) {
      queueMicrotask(() =>
        this.initiateForm?.patchFormPartial({
          select_system: false,
          system: [],
          subsystem: [],
        }),
      );
      this.segSelectionMode = 'equipment';
      this.updateInitiateFieldOptions('system', []);
      this.updateInitiateFieldOptions('subsystem', []);
      this.applySegSelectionMode('equipment');
      const section = form?.['section'] ?? this.initiateForm?.getFormSnapshot?.()?.['section'];
      if (this.hasVal(section)) {
        this.loadEquipmentForInitiate(section, form);
      }
      return;
    }

    if (!checked) {
      if (key === 'select_system') {
        this.clearInitiateFields(['system', 'subsystem']);
        this.updateInitiateFieldOptions('system', []);
        this.updateInitiateFieldOptions('subsystem', []);
      }
      if (key === 'select_equipment') {
        this.clearInitiateFields(['equipment']);
        this.updateInitiateFieldOptions('equipment', []);
      }
      this.segSelectionMode = 'none';
      this.applySegSelectionMode('none');
    }
  }

  private getTrialType(trial_type_id: number) {
    this.apiService
      .get<any>('master/satellite-units/?id=' + trial_type_id)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        const trial_unit = res?.data?.[0]?.trial_unit || '';
        this.formData.trial_unit = trial_unit;
        this.lastTrialUnitId = this.hasVal(trial_unit)
          ? this.normalizeId(trial_unit)
          : undefined;
        if (trial_unit) {
          sessionStorage.setItem('trial_unit', String(trial_unit));
        }
        this.updateSubSatelliteUnitVisibility();
        if (this.shouldShowSubSatelliteUnit() && this.hasVal(trial_type_id)) {
          this.loadSubSatelliteUnitsForSatelliteUnit(trial_type_id);
        }
        this.loadTrialTypesForInitiate(trial_unit || '');
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      });
  }
  private updateInitiateFieldOptions(
    fieldKey: string,
    options: DropdownOption[],
  ): void {
    this.ngZone.run(() => {
      if (fieldKey === 'satellite_unit') this.initiateCascade.satelliteUnit = options;
      if (fieldKey === 'sub_satellite_unit') this.initiateCascade.subSatelliteUnit = options;
      if (fieldKey === 'section') this.initiateCascade.section = options;
      if (fieldKey === 'equipment') this.initiateCascade.equipment = options;
      if (fieldKey === 'system') this.initiateCascade.system = options;
      if (fieldKey === 'subsystem') this.initiateCascade.subsystem = options;
      if (fieldKey === 'trial_type') this.initiateTrialTypeOptions = options;
      this.formConfigForInitiateTrial = this.formConfigForInitiateTrial.map(
        (f) =>
          f.key === fieldKey
            ? {
                ...f,
                options: [...options],
                label:
                  fieldKey === 'trial_unit' && this.segFormsMode()
                    ? 'Trial Unit (SEG)'
                    : this.initiateFieldLabel(fieldKey),
                disabled:
                  (fieldKey === 'trial_unit' && this.segFormsMode()) ||
                  (fieldKey === 'trial_type' && this.segCatalogueMode())
                    ? true
                    : f.disabled,
              }
            : f,
      );
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    });
  }

  private hasVal(v: any): boolean {
    return v !== null && v !== undefined && v !== '';
  }

  private normalizeId(v: any): string | number | undefined {
    if (v === null || v === undefined || v === '') {
      return undefined;
    }
    if (typeof v === 'object' && v !== null && 'value' in v) {
      const inner = (v as { value: unknown }).value;
      if (inner === null || inner === undefined || inner === '') {
        return undefined;
      }
      return inner as string | number;
    }
    return v as string | number;
  }

  private currentSatelliteUnit(): any {
    const stored = JSON.parse(localStorage.getItem('user') || '{}')?.satellite_unit_id;
    const value = this.formData?.satellite_unit ?? this.initiateForm?.form?.get('satellite_unit')?.value ?? stored;
    return this.hasVal(value) ? value : undefined;
  }

  private currentSubSatelliteUnit(): any {
    const value = this.formData?.sub_satellite_unit ?? this.initiateForm?.form?.get('sub_satellite_unit')?.value;
    return this.hasVal(value) ? value : undefined;
  }

  private shouldShowSubSatelliteUnit(): boolean {
    const trialUnit = this.lastTrialUnitId ?? this.formData?.trial_unit ?? this.initiateForm?.form?.get('trial_unit')?.value;
    return String(this.normalizeId(trialUnit) ?? '') === String(SUB_SATELLITE_TRIAL_UNIT_ID);
  }

  private updateSubSatelliteUnitVisibility(): void {
    const show = this.shouldShowSubSatelliteUnit();
    this.formConfigForInitiateTrial = this.formConfigForInitiateTrial.map((field) =>
      field.key === 'sub_satellite_unit'
        ? { ...field, hide: !show, required: show }
        : field,
    );
    if (!show) {
      this.formData.sub_satellite_unit = '';
      this.initiateForm?.patchFormPartial({ sub_satellite_unit: '' });
    }
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  /**
   * Ship dropdown uses form key `ship`; profile prefill may use `ship_id`.
   * Prefer explicit dropdown selection over stored profile defaults.
   */
  private resolveInitiateShipId(
    formValue?: Record<string, unknown> | null,
  ): string | number | undefined {
    return (
      (formValue ? this.normalizeId(formValue['ship']) : undefined) ??
      this.lastShipId ??
      (formValue ? this.normalizeId(formValue['ship_id']) : undefined) ??
      this.normalizeId(
        JSON.parse(localStorage.getItem('user') || '{}')?.ship_id,
      )
    );
  }

  /** Params for GET `master/systems/` — `section` + `ship` only */
  private buildMasterSystemsParams(
    section: unknown,
    form?: Record<string, any> | null,
  ): RequestParams {
    const params: RequestParams = {};
    if (this.hasVal(section)) {
      const sections = Array.isArray(section) ? section : [section];
      params['section'] = sections
        .filter((v: unknown) => this.hasVal(v))
        .join(',');
    }
    const shipId = this.resolveInitiateShipId(form ?? undefined);
    if (shipId !== undefined) {
      params['ship'] = shipId;
    }
    return params;
  }

  /** Params for GET `master/equipments/` — `section` + `ship_id` + `trial_unit_id` */
  private buildMasterEquipmentsParams(
    section: any,
    form?: Record<string, any> | null,
  ): Record<string, any> {
    const params: Record<string, any> = {
      [DD.equipmentBySection]: section,
    };
    const shipId = this.resolveInitiateShipId(form ?? undefined);
    const trialUnitId =
      (form ? this.normalizeId(form['trial_unit']) : undefined) ??
      this.lastTrialUnitId;
    if (shipId !== undefined) {
      params['ship_id'] = shipId;
    }
    if (trialUnitId !== undefined) {
      params['trial_unit_id'] = trialUnitId;
    }
    console.log('[InitiateTrials][buildMasterEquipmentsParams]', {
      section,
      formShip: form?.['ship'],
      formTrialUnit: form?.['trial_unit'],
      lastShipId: this.lastShipId,
      lastTrialUnitId: this.lastTrialUnitId,
      resolvedShipId: shipId,
      resolvedTrialUnitId: trialUnitId,
      params,
    });
    return params;
  }

  private clearInitiateFields(keys: string[]): void {
    if (keys.some((k) => k === 'system' || k === 'subsystem' || k === 'section')) {
      this.subsystemRowById.clear();
    }
    const patch: Record<string, any> = {};
    const arrayKeys = new Set(['equipment', 'system', 'subsystem']);
    const boolKeys = new Set(['select_system', 'select_equipment']);
    for (const k of keys) {
      if (arrayKeys.has(k)) {
        patch[k] = [];
      } else if (boolKeys.has(k)) {
        patch[k] = false;
      } else {
        patch[k] = '';
      }
    }
    queueMicrotask(() => this.initiateForm?.patchFormPartial(patch));
  }

  private segCascadeResetKeys(): string[] {
    const base = [
      'satellite_unit',
      'sub_satellite_unit',
      'section',
      'equipment',
      'trial_type',
      'system',
      'subsystem',
      'select_system',
      'select_equipment',
    ];
    return base;
  }

  private loadSubSatelliteUnitsForSatelliteUnit(satelliteUnitId: unknown): void {
    this.apiService
      .getDropdownData('master/sub-satellite-units/', {labelKey: 'name', valueKey: 'mapped_satellite_unit_id'}, {
        satellite_unit: satelliteUnitId,
        ctt_s_u: satelliteUnitId,
      })
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe((opts) => this.updateInitiateFieldOptions('sub_satellite_unit', opts));
  }

  private loadTrialTypesForInitiate(trialUnitId: string | number): void {
    const params: RequestParams = {
      type: 'trial',
      trial_unit: trialUnitId,
    };
    const satelliteUnit = this.currentSatelliteUnit();
    const subSatelliteUnit = this.currentSubSatelliteUnit();
    if (this.hasVal(satelliteUnit)) params['satellite_unit_id'] = this.normalizeId(satelliteUnit);
    if (this.hasVal(subSatelliteUnit)) params['sub_satellite_unit_id'] = this.normalizeId(subSatelliteUnit);
    this.apiService
      .getDropdownData('master/trial-types/', DD.nameId, params)
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe((opts) => {
        this.updateInitiateFieldOptions('trial_type', opts);
        if (this.segCatalogueMode()) {
          setTimeout(() => this.applySegCatalogueTrialTypeDefaults(), 0);
        }
      });
  }

  private preserveLockedSegFields(keys: string[]): string[] {
    return keys.filter((k) => {
      if (k === 'trial_unit' && this.segFormsMode()) {
        return false;
      }
      if (k === 'trial_type' && this.segCatalogueMode()) {
        return false;
      }
      return true;
    });
  }

  onInitiateFieldChange(evt: { key: string; value: any; form?: any }): void {
    const key = evt.key;
    const value = evt.value;

    if (this.segFormsMode() && key === 'select_system') {
      this.handleSegCheckboxChange('select_system', !!value, evt.form);
      return;
    }
    if (this.segFormsMode() && key === 'select_equipment') {
      this.handleSegCheckboxChange('select_equipment', !!value, evt.form);
      return;
    }

    if (key === 'ship') {
      this.lastShipId = this.hasVal(value)
        ? this.normalizeId(value)
        : undefined;
      if (!this.segFormsMode()) {
        this.lastTrialUnitId = undefined;
      }
      this.formData.satellite_unit = '';
      this.formData.sub_satellite_unit = '';
      this.clearInitiateFields(
        this.segFormsMode() || this.segCatalogueMode()
          ? this.preserveLockedSegFields(this.segCascadeResetKeys())
          : ['trial_unit', 'satellite_unit', 'sub_satellite_unit', 'section', 'equipment', 'trial_type'],
      );
      this.segSelectionMode = this.segFormsMode() ? 'system' : 'none';
      this.updateInitiateFieldOptions('section', []);
      this.updateInitiateFieldOptions('equipment', []);
      this.updateInitiateFieldOptions('system', []);
      this.updateInitiateFieldOptions('subsystem', []);
      this.updateInitiateFieldOptions('sub_satellite_unit', []);
      this.updateInitiateFieldOptions('satellite_unit', []);
      if (this.segFormsMode()) {
        this.applySegTrialUnitDefaults();
        this.applySegSystemCheckboxDefaults();
      } else {
        this.updateInitiateFieldOptions('trial_unit', [...this.optionMap.trialUnit]);
      }
      if (!this.segCatalogueMode()) {
        this.updateInitiateFieldOptions('trial_type', []);
      }
      return;
    }

    if (key === 'trial_unit') {
      if (this.segFormsMode()) {
        return;
      }
      this.lastTrialUnitId = this.hasVal(value)
        ? this.normalizeId(value)
        : undefined;
      const storedSatelliteUnit = JSON.parse(localStorage.getItem('user') || '{}')?.satellite_unit_id || '';
      this.formData.trial_unit = value;
      this.formData.satellite_unit = storedSatelliteUnit;
      this.formData.sub_satellite_unit = '';
      this.clearInitiateFields(
        this.segFormsMode() || this.segCatalogueMode()
          ? this.preserveLockedSegFields([
              'satellite_unit',
              'sub_satellite_unit',
              'section',
              'equipment',
              'trial_type',
            ])
          : ['satellite_unit', 'sub_satellite_unit', 'section', 'equipment', 'trial_type'],
      );
      this.segSelectionMode = this.segFormsMode() ? 'system' : 'none';
      this.updateSubSatelliteUnitVisibility();
      this.updateInitiateFieldOptions('section', []);
      this.updateInitiateFieldOptions('equipment', []);
      this.updateInitiateFieldOptions('system', []);
      this.updateInitiateFieldOptions('subsystem', []);
      this.updateInitiateFieldOptions('sub_satellite_unit', []);
      if (this.segFormsMode()) {
        this.applySegSystemCheckboxDefaults();
      }
      if (!this.hasVal(value)) {
        this.updateInitiateFieldOptions('satellite_unit', []);
        this.updateInitiateFieldOptions('trial_type', []);
        return;
      }
      if (this.lastTrialUnitId !== undefined) {
        this.loadTrialTypesForInitiate(this.lastTrialUnitId);
      }
      const satelliteUnit = this.currentSatelliteUnit();
      if (this.shouldShowSubSatelliteUnit() && this.hasVal(satelliteUnit)) {
        this.loadSubSatelliteUnitsForSatelliteUnit(satelliteUnit);
      }
      this.apiService
        .getDropdownData(
          'master/satellite-units/',
          DD.nameId,
          { [DD.satelliteByTrial]: value } as any,
        )
        .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
        .subscribe((opts) =>
          this.updateInitiateFieldOptions('satellite_unit', opts),
        );
      return;
    }

    if (key === 'satellite_unit') {
      this.formData.satellite_unit = value;
      this.formData.sub_satellite_unit = '';
      this.clearInitiateFields(['sub_satellite_unit', 'section', 'equipment', 'trial_type']);
      this.updateInitiateFieldOptions('sub_satellite_unit', []);
      this.updateInitiateFieldOptions('trial_type', []);
      this.updateInitiateFieldOptions('equipment', []);
      if (!this.hasVal(value)) {
        this.updateInitiateFieldOptions('section', []);
        return;
      }
      if (this.shouldShowSubSatelliteUnit()) {
        this.loadSubSatelliteUnitsForSatelliteUnit(value);
      }
      if (this.lastTrialUnitId !== undefined) {
        this.loadTrialTypesForInitiate(this.lastTrialUnitId);
      }
      this.apiService
        .getDropdownData('master/sections/', DD.nameId,{satellite_unit_id: value})
        .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
        .subscribe((opts) => this.updateInitiateFieldOptions('section', opts));
      return;
    }

    if (key === 'sub_satellite_unit') {
      this.formData.sub_satellite_unit = value;
      this.clearInitiateFields(['trial_type']);
      this.updateInitiateFieldOptions('trial_type', []);
      if (this.lastTrialUnitId !== undefined) {
        this.loadTrialTypesForInitiate(this.lastTrialUnitId);
      }
      return;
    }

    if (key === 'section') {
      if (this.segFormsMode()) {
        this.clearInitiateFields(['equipment', 'system', 'subsystem']);
        this.updateInitiateFieldOptions('equipment', []);
        this.updateInitiateFieldOptions('system', []);
        this.updateInitiateFieldOptions('subsystem', []);
        this.applySegSystemCheckboxDefaults();
        if (this.hasVal(value)) {
          this.loadSystemsForInitiate(value, evt.form);
        }
        return;
      }
      this.clearInitiateFields(['equipment']);
      if (!this.hasVal(value)) {
        this.updateInitiateFieldOptions('equipment', []);
        return;
      }
      console.log('[InitiateTrials][section change]', {
        sectionValue: value,
      },evt.form);
      this.loadEquipmentForInitiate(value, evt.form);
      return;
    }

    if (key === 'trial_type' && this.segCatalogueMode()) {
      return;
    }

    if (key === 'system' && this.segFormsMode()) {
      this.clearInitiateFields(['subsystem']);
      if (!this.hasVal(value)) {
        this.updateInitiateFieldOptions('subsystem', []);
        return;
      }
      this.loadSubsystemsForInitiate(value);
    }
  }

  private loadSystemsForInitiate(
    section: unknown,
    evtForm?: Record<string, any> | null,
  ): void {
    if (!this.hasVal(section)) {
      this.updateInitiateFieldOptions('system', []);
      return;
    }
    const formSnapshot = this.initiateForm?.getFormSnapshot?.() ?? evtForm ?? {};
    const params = this.buildMasterSystemsParams(section, formSnapshot);
    this.apiService
      .getDropdownData(Apiendpoints.MASTER_SYSTEM, DD.nameId, params)
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe((opts) => this.updateInitiateFieldOptions('system', opts));
  }

  private loadSubsystemsForInitiate(system: unknown): void {
    if (!this.hasVal(system)) {
      this.subsystemRowById.clear();
      this.updateInitiateFieldOptions('subsystem', []);
      return;
    }
    const systemIds = Array.isArray(system) ? system : [system];
    const params: RequestParams = {
      [DD.subsystemBySystem]: systemIds
        .map((id) => this.normalizeId(id))
        .filter((id): id is string | number => id !== undefined)
        .join(','),
    };
    this.apiService
      .get<any>('master/subsystems/', params)
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe((res) => {
        const items: Record<string, unknown>[] = Array.isArray(res)
          ? res
          : res?.data ?? res?.results ?? [];
        this.cacheSubsystemRows(items);
        const opts: DropdownOption[] = items.map((item) => ({
          label: String(item['name'] ?? item['sub_system_name'] ?? ''),
          value: item['id'] as string | number,
        }));
        this.updateInitiateFieldOptions('subsystem', opts);
      });
  }

  private cacheSubsystemRows(items: Record<string, unknown>[]): void {
    const systemLabels = new Map(
      this.initiateCascade.system.map((o) => [String(o.value), String(o.label ?? '')]),
    );
    for (const item of items) {
      const subId = item['id'];
      if (subId === null || subId === undefined || subId === '') {
        continue;
      }
      const sysId = item['system_id'] ?? item['system'];
      const sysKey = sysId !== null && sysId !== undefined ? String(sysId) : '';
      this.subsystemRowById.set(String(subId), {
        subsystem_id: subId as string | number,
        subsystem_name: String(item['name'] ?? item['sub_system_name'] ?? ''),
        system_id: (sysId ?? '') as string | number,
        system_name:
          systemLabels.get(sysKey) ?? String(item['system_name'] ?? ''),
      });
    }
  }

  private loadEquipmentForInitiate(
    section: [],
    evtForm?: Record<string, any> | null,
  ): void {
    if (!this.hasVal(section)) {
      this.updateInitiateFieldOptions('equipment', []);
      return;
    }
    const params: RequestParams = {
      section: section,
      ship_id: evtForm?.['ship_id'] || JSON.parse(localStorage.getItem('user') || '{}').ship_id,
      trial_unit_id: evtForm?.["trial_unit"] || sessionStorage.getItem('trial_unit'),
    };
    this.apiService
      .getDropdownData('master/equipments/', equipmentHtml, params)
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe((opts) => this.updateInitiateFieldOptions('equipment', opts));
  }

  handleInitiateSubmit(formValue: any): void {
    // Include hidden/prefilled formData plus disabled controls from the raw form snapshot.
    formValue = {
      ...this.formData,
      ...formValue,
      ...(this.initiateForm?.getFormSnapshot?.() ?? {}),
    };

    if (this.segCatalogueMode() || this.segFormsMode()) {
      this.submitSegDirectInitiate(formValue);
      return;
    }

    const selectedSections = Array.isArray(formValue.section)
      ? formValue.section
      : [formValue.section];
    const selectedEquipments = Array.isArray(formValue.equipment)
      ? formValue.equipment
      : [formValue.equipment];
    const sectionQuery = selectedSections
      .filter((v: any) => this.hasVal(v))
      .join(',');

    const equipmentParams: RequestParams = { section: sectionQuery };
    const selectedShipId = this.resolveInitiateShipId(formValue);
    const shipParam = selectedShipId;
    const trialUnitParam =
      this.normalizeId(formValue.trial_unit) ?? this.lastTrialUnitId;
    const satelliteUnitParam =
      this.normalizeId(formValue.satellite_unit) ?? this.normalizeId(this.currentSatelliteUnit());
    const subSatelliteUnitParam =
      this.normalizeId(formValue.sub_satellite_unit) ?? this.normalizeId(this.currentSubSatelliteUnit());
    if (shipParam !== undefined) {
      equipmentParams['ship_id'] = shipParam;
    }
    if (trialUnitParam !== undefined) {
      equipmentParams['trial_unit_id'] = trialUnitParam;
    }
    console.log('[InitiateTrials][submit] master/equipments prefetch', equipmentParams);

    this.apiService.get<any>('master/equipments/', equipmentParams).subscribe({
        next: (equipRes: any) => {
          const equipmentData = equipRes?.data || equipRes || [];
          const matchedEquipments = equipmentData.filter((item: any) =>
            selectedEquipments.includes(item.id),
          );

          const equipmentDetails = matchedEquipments.map((item: any) => ({
            equipment_id: item.id,
            equipment_name: item.name || '',
            code: item.code || item?.sfd?.code || '',
            manufacturer_name: item.ManufacturerName || item?.sfd?.ManufacturerName || '',
            supplier_name: item.SupplierName || item?.sfd?.SupplierName || '',
            serial_no:
              item.serial_no ||
              item.EquipmentSrNo ||
              item?.sfd?.EquipmentSrNo ||
              '',
            model:
              item.model || item.EquipmentModel || item?.sfd?.EquipmentModel || '',
            nomenclature:
              item.nomenclature ||
              item.Nomenclature ||
              item?.sfd?.Nomenclature ||
              '',
            section_name:
              item.section_name || item?.sfd?.SectionName || '',
          }));

          const shipSource = matchedEquipments[0] || equipmentData[0] || {};
          const shipLabelFromForm =
            this.optionMap.ship.find((s) => s.value == selectedShipId)?.label ||
            '';
          const trialUnitLabel =
            this.optionMap.trialUnit.find((u) => u.value == trialUnitParam)
              ?.label || '';
          const satelliteUnitLabel =
            this.optionMap.satelliteUnit.find(
              (s) => s.value == satelliteUnitParam,
            )?.label || '';
          const subSatelliteUnitLabel =
            this.initiateCascade.subSatelliteUnit.find(
              (s) => s.value == subSatelliteUnitParam,
            )?.label || '';

          const payload = {
            trial_unit_id: trialUnitParam,
            satellite_unit_id: satelliteUnitParam,
            sub_satellite_unit_id: subSatelliteUnitParam,
            section_id: selectedSections,
            equipment_details: equipmentDetails,
            trial_type_id: formValue.trial_type,
            trial_unit_name: trialUnitLabel,
            command_name: '',
            satellite_unit_name: satelliteUnitLabel,
            sub_satellite_unit_name: subSatelliteUnitLabel,
            ship_name:
              shipLabelFromForm ||
              shipSource.ship_name ||
              shipSource?.sfd?.ShipName ||
              JSON.parse(localStorage.getItem('user') || '{}').ship_name,
            shipclass_name: '',
            command_id: 2,
            ship_id:
              selectedShipId ??
              shipSource.ship_id ??
              JSON.parse(localStorage.getItem('user') || '{}').ship_id,
            trial_date: null,
            legacy_data: '',
            approved_level: 1,
            ops_refit_trial: null,
            ship_report: false,
            trial_report: false,
            trial_level: null,
            acceptance_yard: '',
            acceptance_equipment: '',
            trial_mode: null,
            self_certified: formValue.self_certified === true,
            ...(this.segFormsMode()
              ? { module_type: 'seg', selection_type: 'equipment' }
              : {}),
          };

          console.log('FINAL API PAYLOAD', payload);

          this.apiService.post('api/data/trials/', payload).subscribe({
            next: (response: any) => {
              console.log('API SUCCESS', response);
              this.trailService.setTrialPayload(response);
              this.openChange.emit(false);
              this.navigateToCreatedTrial(response);
            },
            error: (error) => {
              console.error('API ERROR', error);
            },
          });
        },
        error: (error: any) => {
          console.error('Equipment API ERROR', error);
        },
      });
  }

  /** SEG Forms / Catalogue: POST `api/data/trials/` using form selections (no systems/subsystems prefetch on submit). */
  private submitSegDirectInitiate(formValue: any): void {
    if (!formValue.select_system && !formValue.select_equipment) {
      console.warn('[InitiateTrials] Select System or Equipment before initiating.');
      return;
    }

    const selectedSections = Array.isArray(formValue.section)
      ? formValue.section
      : [formValue.section];

    if (formValue.select_system) {
      const selectedSystems = this.toIdList(formValue.system);
      if (!selectedSystems.length) {
        console.warn('[InitiateTrials] Select at least one System before initiating.');
        return;
      }

      const { system_details, subsystem_details } =
        this.buildSegSystemSubsystemPayload(formValue);
      this.postTrialPayload(formValue, selectedSections, {
        system_details,
        subsystem_details,
        module_type: 'seg',
        selection_type: 'system',
      });
      return;
    }

    // Equipment selection on catalogue initiate (uncommon; same initiate API as transaction trail)
    const selectedEquipments = this.toIdList(formValue.equipment);
    if (!selectedEquipments.length) {
      console.warn('[InitiateTrials] Select at least one Equipment before initiating.');
      return;
    }

    const equipmentDetails = selectedEquipments.map((id) => {
      const opt = this.initiateCascade.equipment.find((o) => o.value == id);
      return {
        equipment_id: id,
        equipment_name: opt?.label ?? '',
        manufacturer_name: '',
        supplier_name: '',
        serial_no: '',
        model: '',
        nomenclature: '',
        section_name: '',
      };
    });

    this.postTrialPayload(formValue, selectedSections, {
      equipment_details: equipmentDetails,
      module_type: 'seg',
      selection_type: 'equipment',
    });
  }

  private toIdList(value: unknown): (string | number)[] {
    if (value === null || value === undefined || value === '') {
      return [];
    }
    const raw = Array.isArray(value) ? value : [value];
    return raw
      .map((v) => this.normalizeId(v))
      .filter((v): v is string | number => v !== undefined);
  }

  private buildSegSystemSubsystemPayload(formValue: Record<string, unknown>): {
    system_details: SegSystemDetail[];
    subsystem_details: SegSubsystemDetail[];
  } {
    const selectedSystems = this.toIdList(formValue['system']);
    const selectedSubsystems = this.toIdList(formValue['subsystem']);
    const systemLabels = new Map(
      this.initiateCascade.system.map((o) => [String(o.value), String(o.label ?? '')]),
    );
    const subsystemLabels = new Map(
      this.initiateCascade.subsystem.map((o) => [String(o.value), String(o.label ?? '')]),
    );

    const system_details: SegSystemDetail[] = selectedSystems.map((sysId) => ({
      system_id: sysId,
      system_name: systemLabels.get(String(sysId)) ?? '',
    }));

    const subsystem_details: SegSubsystemDetail[] = selectedSubsystems.map((subId) => {
      const cached = this.subsystemRowById.get(String(subId));
      if (cached) {
        return { ...cached };
      }
      const defaultSystemId = selectedSystems[0];
      return {
        subsystem_id: subId,
        subsystem_name: subsystemLabels.get(String(subId)) ?? '',
        system_id: defaultSystemId ?? '',
        system_name:
          defaultSystemId != null
            ? systemLabels.get(String(defaultSystemId)) ?? ''
            : '',
      };
    });

    return { system_details, subsystem_details };
  }

  private postTrialPayload(
    formValue: any,
    selectedSections: any[],
    extra: Record<string, unknown>,
  ): void {
    const resolvedShipId = this.resolveInitiateShipId(formValue);
    const resolvedTrialUnitId =
      this.normalizeId(formValue.trial_unit) ?? this.lastTrialUnitId;
    const resolvedSatelliteUnitId =
      this.normalizeId(formValue.satellite_unit) ?? this.normalizeId(this.currentSatelliteUnit());
    const resolvedSubSatelliteUnitId =
      this.normalizeId(formValue.sub_satellite_unit) ?? this.normalizeId(this.currentSubSatelliteUnit());
    const shipLabelFromForm =
      this.optionMap.ship.find((s) => s.value == resolvedShipId)?.label || '';
    const trialUnitLabel =
      this.optionMap.trialUnit.find((u) => u.value == resolvedTrialUnitId)?.label ||
      '';
    const satelliteUnitLabel =
      this.optionMap.satelliteUnit.find((s) => s.value == resolvedSatelliteUnitId)
        ?.label || '';
    const subSatelliteUnitLabel =
      this.initiateCascade.subSatelliteUnit.find(
        (s) => s.value == resolvedSubSatelliteUnitId,
      )?.label || '';

    const payload = {
      trial_unit_id: resolvedTrialUnitId,
      satellite_unit_id: resolvedSatelliteUnitId,
      sub_satellite_unit_id: resolvedSubSatelliteUnitId,
      section_id: selectedSections,
      trial_type_id: formValue.trial_type,
      trial_unit_name: trialUnitLabel,
      command_name: '',
      satellite_unit_name: satelliteUnitLabel,
      sub_satellite_unit_name: subSatelliteUnitLabel,
      ship_name:
        shipLabelFromForm ||
        JSON.parse(localStorage.getItem('user') || '{}').ship_name,
      shipclass_name: '',
      command_id: 2,
      ship_id:
        resolvedShipId ??
        JSON.parse(localStorage.getItem('user') || '{}').ship_id,
      trial_date: null,
      legacy_data: '',
      approved_level: 1,
      ops_refit_trial: null,
      ship_report: false,
      trial_report: false,
      trial_level: null,
      acceptance_yard: '',
      acceptance_equipment: '',
      trial_mode: null,
      self_certified: formValue.self_certified === true,
      ...extra,
    };

    this.apiService.post('api/data/trials/', payload).subscribe({
      next: (response: any) => {
        this.trailService.setTrialPayload(response);
        this.openChange.emit(false);
        this.navigateToCreatedTrial(response);
      },
      error: (error) => console.error('API ERROR', error),
    });
  }

  private navigateToCreatedTrial(response: {
    trial_type_url?: string;
    uuid?: string;
    trial_form_type?: number;
  }): void {
    const { path, queryParams } = this.trailService.trialTypeNavigateOptions(
      '/afterAuth/ship-returns/trials/'+ (response?.trial_type_url ?? ''),
      response?.uuid,
    );
    if (path.length) {
      this.router.navigate(path, { queryParams : {...queryParams, type: 'trials' } });
    }
  }

  /**
   * Tab switch: Refit trial adds `refit_type`; operational removes it.
   */
  onTabChange(tab: { key: string }): void {
    if (tab.key === 'operational_trial') {
      this.formConfigForInitiateTrial = this.formConfigForInitiateTrial.filter(
        (f) => f.key !== 'refit_type',
      );
    } else {
      this.formConfigForInitiateTrial = [
        ...this.formConfigForInitiateTrial,
        {
          label: this.initiateFieldLabel('refit_type'),
          key: 'refit_type',
          type: 'radio',
          visible: true,
          options: this.optionMap.refitType,
        },
      ];
    }
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }
}
