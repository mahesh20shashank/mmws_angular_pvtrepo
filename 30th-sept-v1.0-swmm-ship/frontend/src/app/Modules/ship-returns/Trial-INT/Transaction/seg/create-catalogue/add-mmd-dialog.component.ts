import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { defaultIfEmpty, finalize, forkJoin, of, Subject, takeUntil } from 'rxjs';
import { catchError } from 'rxjs/operators';
// Old imports:
// import { InputComponent } from '../../../../../Components/ui/input.component';
// import { SelectComponent, SelectOption } from '../../../../../Components/ui/select.component';
// import { ApiService } from '../../../../../services/api.service';
// import { ToastService } from '../../../../../services/toast.service';
import { InputComponent } from '../../../ui/input.component';
import { SelectComponent, SelectOption } from '../../../ui/select.component';
import { ApiService } from '../../../api.service';
import { ToastService } from '../../../services/toast.service';
import {
  AddMmdFilterContext,
  AddMmdFormValue,
  buildAddMmdTrialPayload,
  SEG_TRIALS_API,
  SEG_MMD_MASTER_LOOKUP_CODES,
  SEG_MMD_MASTER_LOOKUP_FALLBACKS,
} from './seg-catalogue-form.shared';
import {
  getUserShipId,
  getUserShipName,
  isUserShipProcess,
} from '../../../../../../shared/utils/user-satellite-unit';

@Component({
  selector: 'app-add-mmd-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SelectComponent,
    InputComponent,
  ],
  templateUrl: './add-mmd-dialog.component.html',
  styles: [
    `
      .add-mmd-dialog__section-heading {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        margin-top: 0.25rem;
        padding-top: 0.875rem;
        border-top: 1px solid var(--shell-divider-soft);
      }

      .add-mmd-dialog__section-bar {
        width: 0.25rem;
        height: 1rem;
        flex-shrink: 0;
        border-radius: 0.25rem;
        background: linear-gradient(
          180deg,
          var(--shell-brand-start),
          var(--shell-brand-end)
        );
      }

      .add-mmd-dialog__section-title {
        margin: 0;
        font-size: 0.8125rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: var(--shell-text-secondary);
      }
    `,
  ],
})
export class AddMmdDialogComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Input() filterContext: AddMmdFilterContext = {};
  @Output() openChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  departmentOptions: SelectOption[] = [];
  systemOptions: SelectOption[] = [];
  subsystemOptions: SelectOption[] = [];
  subSubSystemOptions: SelectOption[] = [];
  mmdTypeOptions: SelectOption[] = [...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdType];
  mmdSizeOptions: SelectOption[] = [...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdSize];
  mmdOsOptions: SelectOption[] = [...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdOs];
  interfaceOptions: SelectOption[] = [
    ...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdInterface,
  ];
  shipOptions: SelectOption[] = [];
  shipFieldLocked = false;
  lockedShipLabel = '';

  readonly textPlaceholder = 'Enter NA if not applicable';
  saving = false;
  masterOptionsLoading = false;
  hierarchyLoading = false;

  form: FormGroup;

  private readonly destroy$ = new Subject<void>();
  private readonly hierarchyDestroy$ = new Subject<void>();
  private masterOptionsLoaded = false;
  private hierarchyListenersBound = false;
  private applyingFilterPrefill = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly apiService: ApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.form = this.fb.group({
      ship_id: ['', Validators.required],
      department_id: ['', Validators.required],
      system_id: ['', Validators.required],
      subsystem_id: [''],
      sub_sub_system_id: [''],
      mmd_type: ['', Validators.required],
      mmd_size: ['', Validators.required],
      mmd_os: ['', Validators.required],
      interface: ['', Validators.required],
      application_name: [''],
      application_version: [''],
      serial_no: [''],
      oem_of_module: [''],
      pattern_number: [''],
      oem_part: [''],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue === true) {
      if (!this.hierarchyListenersBound) {
        this.listenToHierarchyCascade();
        this.hierarchyListenersBound = true;
      }

      this.resetForm();

      if (!this.masterOptionsLoaded) {
        this.loadMasterDropdownOptions();
      } else {
        this.applyFilterContextPrefill();
      }
    }
  }

  ngOnDestroy(): void {
    this.hierarchyDestroy$.next();
    this.hierarchyDestroy$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  close(): void {
    this.openChange.emit(false);
  }

  onBackdropClick(): void {
    this.close();
  }

  onSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.showError('Please select all required dropdown values.');
      return;
    }

    const formValue = this.form.getRawValue() as AddMmdFormValue;
    if (!formValue.ship_id) {
      this.toast.showError('Please select Ship before adding MMD.');
      return;
    }

    const equipmentNomenclature =
      this.subSubSystemOptions.find(
        (option) => String(option.value) === String(formValue.sub_sub_system_id),
      )?.label ?? '';

    const systemName =
      this.systemOptions.find(
        (option) => String(option.value) === String(formValue.system_id),
      )?.label ?? '';
    const subsystemName =
      this.subsystemOptions.find(
        (option) => String(option.value) === String(formValue.subsystem_id),
      )?.label ?? '';

    const payload = buildAddMmdTrialPayload(
      formValue,
      this.filterContext,
      equipmentNomenclature,
      { systemName, subsystemName },
    );

    this.saving = true;
    this.apiService
      .post(SEG_TRIALS_API, payload)
      .pipe(
        finalize(() => {
          this.saving = false;
        }),
      )
      .subscribe({
        next: () => {
          this.toast.showSuccess(
            'MMD added successfully and pending for verification with SEG',
          );
          this.resetForm();
          this.saved.emit();
          this.close();
        },
        error: (err: { message?: string }) => {
          this.toast.showError(err?.message || 'Failed to add MMD');
        },
      });
  }

  private loadMasterDropdownOptions(): void {
    this.masterOptionsLoading = true;
    const lookupConfig = { labelKey: 'name', valueKey: 'id' } as const;

    forkJoin({
      ships: this.apiService
        .getDropdownData('master/ships/', { labelKey: 'name', valueKey: 'id' })
        .pipe(defaultIfEmpty([]), catchError(() => of([]))),
      departments: this.apiService
        .getDropdownData('master/departments/', {
          labelKey: 'name',
          valueKey: 'id',
        })
        .pipe(defaultIfEmpty([]), catchError(() => of([]))),
      mmdType: this.apiService
        .getDropdownData(
          `master/lookups/?type__code=${SEG_MMD_MASTER_LOOKUP_CODES.mmdType}`,
          lookupConfig,
        )
        .pipe(defaultIfEmpty([]), catchError(() => of([]))),
      mmdSize: this.apiService
        .getDropdownData(
          `master/lookups/?type__code=${SEG_MMD_MASTER_LOOKUP_CODES.mmdSize}`,
          lookupConfig,
        )
        .pipe(defaultIfEmpty([]), catchError(() => of([]))),
      mmdOs: this.apiService
        .getDropdownData(
          `master/lookups/?type__code=${SEG_MMD_MASTER_LOOKUP_CODES.mmdOs}`,
          lookupConfig,
        )
        .pipe(defaultIfEmpty([]), catchError(() => of([]))),
      mmdInterface: this.apiService
        .getDropdownData(
          `master/lookups/?type__code=${SEG_MMD_MASTER_LOOKUP_CODES.mmdInterface}`,
          lookupConfig,
        )
        .pipe(defaultIfEmpty([]), catchError(() => of([]))),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (options: any) => {
          const apiShipOptions = options.ships.map((option: any) => ({
            label: option.label,
            value: String(option.value),
          }));
          this.shipOptions = this.mergeShipOptions(apiShipOptions);
          this.departmentOptions = this.mapSelectOptions(options.departments);
          this.mmdTypeOptions = this.mapMasterOptions(
            options.mmdType,
            SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdType,
          );
          this.mmdSizeOptions = this.mapMasterOptions(
            options.mmdSize,
            SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdSize,
          );
          this.mmdOsOptions = this.mapMasterOptions(
            options.mmdOs,
            SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdOs,
          );
          this.interfaceOptions = this.mapMasterOptions(
            options.mmdInterface,
            SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdInterface,
          );
          this.masterOptionsLoaded = true;
          this.masterOptionsLoading = false;
          this.applyShipPrefill();
          this.applyFilterContextPrefill();
          this.cdr.detectChanges();
        },
        error: () => {
          this.shipOptions = this.mergeShipOptions([]);
          this.departmentOptions = [];
          this.mmdTypeOptions = [...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdType];
          this.mmdSizeOptions = [...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdSize];
          this.mmdOsOptions = [...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdOs];
          this.interfaceOptions = [
            ...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdInterface,
          ];
          this.masterOptionsLoaded = true;
          this.masterOptionsLoading = false;
          this.applyShipPrefill();
          this.applyFilterContextPrefill();
          this.cdr.detectChanges();
        },
      });
  }

  private listenToHierarchyCascade(): void {
    this.form
      .get('ship_id')
      ?.valueChanges.pipe(takeUntil(this.hierarchyDestroy$))
      .subscribe((shipId) => {
        if (this.applyingFilterPrefill) {
          return;
        }
        this.form.patchValue(
          { system_id: '', subsystem_id: '', sub_sub_system_id: '' },
          { emitEvent: false },
        );
        this.subsystemOptions = [];
        this.subSubSystemOptions = [];
        const departmentId = String(
          this.form.get('department_id')?.value ?? '',
        ).trim();
        if (departmentId && String(shipId ?? '').trim()) {
          this.loadSystemOptions(departmentId);
        } else if (!departmentId) {
          this.systemOptions = [];
        } else {
          this.systemOptions = [];
        }
        this.cdr.detectChanges();
      });

    this.form
      .get('department_id')
      ?.valueChanges.pipe(takeUntil(this.hierarchyDestroy$))
      .subscribe((departmentId) => {
        if (this.applyingFilterPrefill) {
          return;
        }
        this.form.patchValue(
          { system_id: '', subsystem_id: '', sub_sub_system_id: '' },
          { emitEvent: false },
        );
        this.subsystemOptions = [];
        this.subSubSystemOptions = [];
        const id = String(departmentId ?? '').trim();
        if (id) {
          this.loadSystemOptions(id);
        } else {
          this.systemOptions = [];
        }
        this.cdr.detectChanges();
      });

    this.form
      .get('system_id')
      ?.valueChanges.pipe(takeUntil(this.hierarchyDestroy$))
      .subscribe((systemId) => {
        if (this.applyingFilterPrefill) {
          return;
        }
        this.form.patchValue(
          { subsystem_id: '', sub_sub_system_id: '' },
          { emitEvent: false },
        );
        this.subSubSystemOptions = [];
        const id = String(systemId ?? '').trim();
        if (id) {
          this.loadSubsystemOptions(id);
        } else {
          this.subsystemOptions = [];
        }
        this.cdr.detectChanges();
      });

    this.form
      .get('subsystem_id')
      ?.valueChanges.pipe(takeUntil(this.hierarchyDestroy$))
      .subscribe((subsystemId) => {
        if (this.applyingFilterPrefill) {
          return;
        }
        this.form.patchValue({ sub_sub_system_id: '' }, { emitEvent: false });
        const id = String(subsystemId ?? '').trim();
        if (id) {
          this.loadSubSubSystemOptions(id);
        } else {
          this.subSubSystemOptions = [];
        }
        this.cdr.detectChanges();
      });
  }

  private applyFilterContextPrefill(): void {
    const departmentId = String(this.filterContext.department_id ?? '').trim();
    const systemId = String(this.filterContext.system_id ?? '').trim();
    const subsystemId = String(this.filterContext.subsystem_id ?? '').trim();
    const subSubSystemId = String(
      this.filterContext.sub_sub_system_id ?? '',
    ).trim();

    if (!departmentId && !systemId && !subsystemId && !subSubSystemId) {
      return;
    }

    this.applyingFilterPrefill = true;
    this.hierarchyLoading = true;

    const finish = (): void => {
      this.applyingFilterPrefill = false;
      this.hierarchyLoading = false;
      this.cdr.detectChanges();
    };

    if (departmentId) {
      this.form.patchValue({ department_id: departmentId }, { emitEvent: false });
      this.loadSystemOptions(departmentId, () => {
        if (!systemId) {
          finish();
          return;
        }
        this.form.patchValue({ system_id: systemId }, { emitEvent: false });
        this.loadSubsystemOptions(systemId, () => {
          if (!subsystemId) {
            finish();
            return;
          }
          this.form.patchValue(
            { subsystem_id: subsystemId },
            { emitEvent: false },
          );
          this.loadSubSubSystemOptions(subsystemId, () => {
            if (subSubSystemId) {
              this.form.patchValue(
                { sub_sub_system_id: subSubSystemId },
                { emitEvent: false },
              );
            }
            finish();
          });
        });
      });
      return;
    }

    if (systemId) {
      this.form.patchValue({ system_id: systemId }, { emitEvent: false });
      this.loadSubsystemOptions(systemId, () => {
        if (!subsystemId) {
          finish();
          return;
        }
        this.form.patchValue(
          { subsystem_id: subsystemId },
          { emitEvent: false },
        );
        this.loadSubSubSystemOptions(subsystemId, () => {
          if (subSubSystemId) {
            this.form.patchValue(
              { sub_sub_system_id: subSubSystemId },
              { emitEvent: false },
            );
          }
          finish();
        });
      });
      return;
    }

    if (subsystemId) {
      this.form.patchValue({ subsystem_id: subsystemId }, { emitEvent: false });
      this.loadSubSubSystemOptions(subsystemId, () => {
        if (subSubSystemId) {
          this.form.patchValue(
            { sub_sub_system_id: subSubSystemId },
            { emitEvent: false },
          );
        }
        finish();
      });
      return;
    }

    if (subSubSystemId) {
      this.form.patchValue(
        { sub_sub_system_id: subSubSystemId },
        { emitEvent: false },
      );
    }
    finish();
  }

  private loadSystemOptions(departmentId: string, onDone?: () => void): void {
    const shipId = String(this.form.get('ship_id')?.value ?? '').trim();
    const params: Record<string, string> = {
      section__department_id: departmentId,
    };
    if (shipId) {
      params['ship_id'] = shipId;
    }

    this.apiService
      .getDropdownData(
        'master/systems/',
        { labelKey: 'name', valueKey: 'id' },
        params,
      )
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe({
        next: (options: any) => {
          this.systemOptions = this.mapSelectOptions(options);
          this.cdr.detectChanges();
          onDone?.();
        },
        error: () => {
          this.systemOptions = [];
          this.cdr.detectChanges();
          onDone?.();
        },
      });
  }

  private loadSubsystemOptions(systemId: string, onDone?: () => void): void {
    this.apiService
      .getDropdownData(
        'master/subsystems/',
        { labelKey: 'name', valueKey: 'id' },
        { system: systemId },
      )
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe({
        next: (options: any) => {
          this.subsystemOptions = this.mapSelectOptions(options);
          this.cdr.detectChanges();
          onDone?.();
        },
        error: () => {
          this.subsystemOptions = [];
          this.cdr.detectChanges();
          onDone?.();
        },
      });
  }

  private loadSubSubSystemOptions(
    subsystemId: string,
    onDone?: () => void,
  ): void {
    this.apiService
      .getDropdownData(
        'master/sub-sub-system/',
        { labelKey: 'name', valueKey: 'id' },
        { sub_system: subsystemId },
      )
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe({
        next: (options: any) => {
          this.subSubSystemOptions = this.mapSelectOptions(options);
          this.cdr.detectChanges();
          onDone?.();
        },
        error: () => {
          this.subSubSystemOptions = [];
          this.cdr.detectChanges();
          onDone?.();
        },
      });
  }

  private mergeShipOptions(apiShipOptions: SelectOption[]): SelectOption[] {
    const shipId = getUserShipId();
    const shipName = getUserShipName();
    if (
      shipId &&
      shipName &&
      !apiShipOptions.some((option) => String(option.value) === shipId)
    ) {
      return [{ label: shipName, value: shipId }, ...apiShipOptions];
    }
    return apiShipOptions;
  }

  private resetForm(): void {
    this.form.reset({
      ship_id: '',
      department_id: '',
      system_id: '',
      subsystem_id: '',
      sub_sub_system_id: '',
      mmd_type: '',
      mmd_size: '',
      mmd_os: '',
      interface: '',
      application_name: '',
      application_version: '',
      serial_no: '',
      oem_of_module: '',
      pattern_number: '',
      oem_part: '',
    });
    this.systemOptions = [];
    this.subsystemOptions = [];
    this.subSubSystemOptions = [];
    this.applyShipPrefill();
  }

  private applyShipPrefill(): void {
    const shipControl = this.form.get('ship_id');
    if (!shipControl) {
      return;
    }

    if (isUserShipProcess()) {
      const shipId = getUserShipId();
      const shipName = getUserShipName();

      if (shipId) {
        this.lockedShipLabel = shipName || `Ship #${shipId}`;
        this.shipOptions = this.mergeShipOptions(this.shipOptions);
        shipControl.setValue(shipId, { emitEvent: false });
        this.shipFieldLocked = true;
        this.cdr.detectChanges();
        return;
      }
    }

    this.shipFieldLocked = false;
    this.lockedShipLabel = '';
    shipControl.setValue('', { emitEvent: false });
    this.cdr.detectChanges();
  }

  private mapSelectOptions(
    options: { label: string; value: string | number }[],
  ): SelectOption[] {
    return options.map((option) => ({
      label: option.label,
      value: String(option.value),
    }));
  }

  private mapMasterOptions(
    options: { label: string; value: string | number }[],
    fallback: SelectOption[],
  ): SelectOption[] {
    if (!options.length) {
      return [...fallback];
    }

    return this.mapSelectOptions(options);
  }
}
