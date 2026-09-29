import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { defaultIfEmpty, finalize, forkJoin, of, Subject, takeUntil } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import { SelectComponent, SelectOption } from '../../../../ui/select.component';
import { InputComponent } from '../../../../ui/input.component';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  SEG_CATALOGUE_SUB_SYSTEM_OPTIONS,
  SEG_MMD_MASTER_LOOKUP_CODES,
  SEG_MMD_MASTER_LOOKUP_FALLBACKS,
  SEG_VERIFICATION_OPTIONS,
  buildCatalogueInfoFromForm,
  buildEmptyCatalogueFormData,
  buildSystemHierarchyPayload,
  cataloguePatchFromSavedJson,
  extractCatalogueTrialJsonData,
  firstCatalogueTrialFromResponse,
  mapCatalogueRowToFormData,
  mapTrialRowToCatalogueFormData,
  resolveSegCatalogueTrialId,
  showSegVerificationField,
  SEG_TRIALS_API,
} from '../seg-catalogue-form.shared';
import { resolveTrialQueryParam } from '../../../../trial-route-prefill';

@Component({
  selector: 'app-seg-catalogue-form',
  standalone: true,
  host: {
    class: 'flex h-full min-h-0 flex-1 flex-col overflow-hidden',
  },
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    SelectComponent,
    InputComponent,
  ],
  templateUrl: './seg-catalogue-form.component.html',
})
export class SegCatalogueFormComponent implements OnInit, OnDestroy {
  editMode = false;
  recordId: string | null = null;
  editingItem: Record<string, unknown> | null = null;
  trialRow: Record<string, unknown> | null = null;
  workflowTrialId: string | undefined;

  form!: FormGroup;
  draftLoading = false;
  submitLoading = false;
  pageReady = false;

  shipOptions: SelectOption[] = [];
  systemOptions: SelectOption[] = [];
  subSystemOptions: SelectOption[] = [...SEG_CATALOGUE_SUB_SYSTEM_OPTIONS];
  mediaTypeOptions: SelectOption[] = [
    ...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdType,
  ];
  sizeOptions: SelectOption[] = [...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdSize];
  osOptions: SelectOption[] = [...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdOs];
  interfaceOptions: SelectOption[] = [
    ...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdInterface,
  ];
  readonly segVerificationOptions = SEG_VERIFICATION_OPTIONS;
  get showSegVerification(): boolean {
    return showSegVerificationField();
  }

  get canEditForm(): boolean {
    return this.formApiService?.context?.workflow_rights?.can_edit !== false;
  }

  get canShowSaveDraft(): boolean {
    if (!this.canEditForm) return false;
    const raw =
      this.formApiService?.context?.workflow_rights?.save_draft ??
      this.formApiService?.context?.save_draft;
    return raw !== false;
  }

  handleSubmit(): void {
    this.handleSave('save');
  }

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly apiService: ApiService,
    private readonly toast: ToastService,
    public formApiService: FormApiService,
  ) {}

  ngOnInit(): void {
    this.recordId = this.route.snapshot.paramMap.get('id');
    this.editMode = !!this.recordId;
    this.buildForm();
    this.loadDropdownOptions();

    const trialRef = resolveTrialQueryParam(this.route, this.router);
    if (trialRef) {
      this.workflowTrialId = trialRef;
      this.loadCatalogueTrialData();
      this.pageReady = true;
    } else if (this.editMode) {
      this.loadCatalogueRecord();
    } else {
      this.form.patchValue(buildEmptyCatalogueFormData());
      this.pageReady = true;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private currentTrialRef(): string {
    return (
      this.workflowTrialId ||
      resolveTrialQueryParam(this.route, this.router) ||
      ''
    );
  }

  private loadCatalogueTrialData(): void {
    const trialRef = this.currentTrialRef();
    if (!trialRef) {
      return;
    }

    this.formApiService.setCurrentForm(trialRef, 'create_catalogue');

    const trialUrl = /^\d+$/.test(trialRef)
      ? `api/data/trials/?id=${encodeURIComponent(trialRef)}`
      : `api/data/trials/?uuid=${encodeURIComponent(trialRef)}`;

    this.apiService.get<unknown>(trialUrl).subscribe({
      next: (response: any) => {
        const trial = firstCatalogueTrialFromResponse(response);
        if (!trial) {
          this.loadCatalogueTrialDraft(trialRef);
          return;
        }

        this.applyTrialContext(trial, trialRef);

        const jsonData = extractCatalogueTrialJsonData(trial, trial);
        if (jsonData) {
          this.fillData(jsonData);
          return;
        }

        // No usable json_data — fall back to trial row fields, then draft.
        this.patchFormWithSystemOptions(mapTrialRowToCatalogueFormData(trial));
        this.loadCatalogueTrialDraft(String(trial['uuid'] ?? trialRef));
      },
      error: () => {
        this.loadCatalogueTrialDraft(trialRef);
      },
    });
  }

  private loadCatalogueTrialDraft(uuid: string): void {
    if (!uuid || /^\d+$/.test(uuid)) {
      return;
    }

    this.apiService
      .get<unknown>(
        `api/drafts/trials/?trial_number=${encodeURIComponent(uuid)}`,
      )
      .subscribe({
        next: (response: any) => {
          const draft =
            firstCatalogueTrialFromResponse(response) ??
            (response as Record<string, unknown>);
          const jsonData = extractCatalogueTrialJsonData(
            draft,
            this.trialRow,
          );
          if (jsonData) {
            this.fillData(jsonData);
          }
          this.cdr.detectChanges();
        },
        error: () => {
          this.cdr.detectChanges();
        },
      });
  }

  private applyTrialContext(
    trial: Record<string, unknown>,
    trialRef: string,
  ): void {
    this.trialRow = trial;
    this.workflowTrialId = resolveSegCatalogueTrialId(trial) || trialRef;
    this.formApiService.context = trial;

    const equipmentDetails = trial['equipment_details'];
    const equipment = Array.isArray(equipmentDetails)
      ? (equipmentDetails[0] as Record<string, unknown>)
      : null;
    this.formApiService.setCurrentEquipmentNomenclature(equipment);

    if (trial['id'] != null) {
      this.recordId = String(trial['id']);
      this.editMode = true;
      this.editingItem = trial;
    }

    // Do not patch the form here — fillData / explicit fallback handles it
    // to avoid racing sparse trial-row values over json_data details.
  }

  private fillData(payload: unknown): void {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const fromTrial = mapTrialRowToCatalogueFormData(this.trialRow);
    const saved = cataloguePatchFromSavedJson(
      payload as Record<string, unknown>,
      this.trialRow,
    );
    if (saved) {
      this.patchFormWithSystemOptions(this.mergeCataloguePatch(fromTrial, saved));
      return;
    }

    const mapped = mapCatalogueRowToFormData(payload);
    const hasValues = Object.values(mapped).some(
      (v) => v !== '' && v !== null && v !== undefined,
    );
    if (hasValues) {
      this.patchFormWithSystemOptions(
        this.mergeCataloguePatch(fromTrial, mapped),
      );
    }
  }

  /** Prefer non-empty saved/json values; keep trial-level fields like approved. */
  private mergeCataloguePatch(
    base: Record<string, unknown>,
    overlay: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
      if (value !== '' && value != null) {
        merged[key] = value;
      }
    }
    return merged;
  }

  private patchFormWithSystemOptions(patch: Record<string, unknown>): void {
    const shipId = String(patch['ship_name'] ?? '').trim();
    const systemId = String(patch['system_name'] ?? '').trim();
    const subsystemId = String(patch['sub_system_name'] ?? '').trim();
    const finish = () => {
      this.form.patchValue(patch, { emitEvent: false });
      this.cdr.detectChanges();
    };

    const afterSystems = () => {
      this.ensureSystemOption(systemId);
      if (systemId) {
        this.loadSubsystemOptions(systemId, () => {
          this.ensureSubsystemOption(subsystemId);
          finish();
        });
        return;
      }
      this.subSystemOptions = [...SEG_CATALOGUE_SUB_SYSTEM_OPTIONS];
      this.ensureSubsystemOption(subsystemId);
      finish();
    };

    if (shipId) {
      this.loadSystemOptions(shipId, afterSystems);
      return;
    }

    this.systemOptions = [];
    afterSystems();
  }

  get formTitle(): string {
    return this.editMode ? 'EDIT SEG CATALOGUE' : 'ADD SEG CATALOGUE';
  }

  private buildForm(): void {
    const controls: Record<string, unknown> = {
      ship_name: ['', Validators.required],
      system_name: ['', Validators.required],
      sub_system_name: ['', Validators.required],
      media_type: ['', Validators.required],
      select_size: ['', Validators.required],
      select_os: ['', Validators.required],
      select_interface: ['', Validators.required],
      application_name: ['', Validators.required],
      application_version: ['', Validators.required],
      serial_no: [''],
      oem_of_module: [''],
      pattern_number: [''],
      oem_part: [''],
    };
    if (this.showSegVerification) {
      controls['approved'] = [2, Validators.required];
    }
    this.form = this.fb.group(controls as Record<string, [unknown, ...unknown[]]>);
    this.listenToShipChanges();
  }

  private listenToShipChanges(): void {
    this.form
      .get('ship_name')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((shipId) => {
        this.form.patchValue(
          { system_name: '', sub_system_name: '' },
          { emitEvent: false },
        );
        this.subSystemOptions = [...SEG_CATALOGUE_SUB_SYSTEM_OPTIONS];
        const id = String(shipId ?? '').trim();
        if (id) {
          this.loadSystemOptions(id);
        } else {
          this.systemOptions = [];
        }
        this.cdr.detectChanges();
      });

    this.form
      .get('system_name')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((systemId) => {
        this.form.patchValue({ sub_system_name: '' }, { emitEvent: false });
        const id = String(systemId ?? '').trim();
        if (id) {
          this.loadSubsystemOptions(id);
        } else {
          this.subSystemOptions = [...SEG_CATALOGUE_SUB_SYSTEM_OPTIONS];
        }
        this.cdr.detectChanges();
      });
  }

  private loadSystemOptions(shipId: string, onDone?: () => void): void {
    this.apiService
      .getDropdownData(
        'master/systems/',
        { labelKey: 'name', valueKey: 'id' },
        { ship_id: shipId },
      )
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe({
        next: (options: any) => {
          this.systemOptions = options.map((option: any) => ({
            label: option.label,
            value: String(option.value),
          }));
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
          const mapped = options.map((option: any) => ({
            label: option.label,
            value: String(option.value),
          }));
          this.subSystemOptions = mapped.length
            ? mapped
            : [...SEG_CATALOGUE_SUB_SYSTEM_OPTIONS];
          this.cdr.detectChanges();
          onDone?.();
        },
        error: () => {
          this.subSystemOptions = [...SEG_CATALOGUE_SUB_SYSTEM_OPTIONS];
          this.cdr.detectChanges();
          onDone?.();
        },
      });
  }

  /** Keep selected system visible even if master list is incomplete. */
  private ensureSystemOption(selectedRaw: string): void {
    const selected = String(selectedRaw ?? '').trim();
    if (!selected) {
      return;
    }
    if (
      this.systemOptions.some((option) => String(option.value) === selected)
    ) {
      return;
    }

    const details = this.trialRow?.['system_details'];
    const first = Array.isArray(details)
      ? (details[0] as {
          system_id?: string | number;
          system_name?: string;
        })
      : null;
    const label =
      first && String(first.system_id ?? '') === selected
        ? String(first.system_name ?? selected)
        : selected;

    this.systemOptions = [...this.systemOptions, { label, value: selected }];
  }

  /** Keep selected subsystem visible even if master list is incomplete. */
  private ensureSubsystemOption(selectedRaw: string): void {
    const selected = String(selectedRaw ?? '').trim();
    if (!selected) {
      return;
    }
    if (
      this.subSystemOptions.some((option) => String(option.value) === selected)
    ) {
      return;
    }

    const details = this.trialRow?.['subsystem_details'];
    const first = Array.isArray(details)
      ? (details[0] as {
          subsystem_id?: string | number;
          subsystem_name?: string;
        })
      : null;
    const label =
      first && String(first.subsystem_id ?? '') === selected
        ? String(first.subsystem_name ?? selected)
        : selected;

    this.subSystemOptions = [
      ...this.subSystemOptions,
      { label, value: selected },
    ];
  }

  private loadDropdownOptions(): void {
    const lookupConfig = { labelKey: 'name', valueKey: 'id' } as const;

    forkJoin({
      ships: this.apiService
        .getDropdownData('master/ships/', { labelKey: 'name', valueKey: 'id' })
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
          this.shipOptions = options.ships.map((option: any) => ({
            label: option.label,
            value: String(option.value),
          }));
          this.mediaTypeOptions = this.mapMasterOptions(
            options.mmdType,
            SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdType,
          );
          this.sizeOptions = this.mapMasterOptions(
            options.mmdSize,
            SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdSize,
          );
          this.osOptions = this.mapMasterOptions(
            options.mmdOs,
            SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdOs,
          );
          this.interfaceOptions = this.mapMasterOptions(
            options.mmdInterface,
            SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdInterface,
          );
          this.cdr.detectChanges();
        },
        error: () => {
          this.mediaTypeOptions = [
            ...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdType,
          ];
          this.sizeOptions = [...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdSize];
          this.osOptions = [...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdOs];
          this.interfaceOptions = [
            ...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdInterface,
          ];
          this.cdr.detectChanges();
        },
      });
  }

  private mapMasterOptions(
    options: { label: string; value: string | number }[],
    fallback: SelectOption[],
  ): SelectOption[] {
    if (!options.length) {
      return [...fallback];
    }

    return options.map((option) => ({
      label: option.label,
      value: String(option.value),
    }));
  }

  private loadCatalogueRecord(): void {
    const stateRow = history.state?.['catalogue'] as Record<string, unknown>;
    if (stateRow && String(stateRow['id']) === String(this.recordId)) {
      this.applyRow(stateRow);
      return;
    }

    if (!this.recordId) {
      this.toast.showError('Invalid catalogue id.');
      this.goBack();
      return;
    }

    this.apiService
      .get<unknown>(`seg/create-catalogue/${this.recordId}/`)
      .subscribe({
        next: (res: unknown) => {
          const row =
            (res as { data?: unknown })?.data ??
            (res as { catalogueInfo?: unknown })?.catalogueInfo ??
            res;
          this.applyRow(row as Record<string, unknown>);
        },
        error: () => {
          this.toast.showError('Failed to load catalogue details.');
          this.goBack();
        },
      });
  }

  private applyRow(row: Record<string, unknown>): void {
    this.editingItem = row;
    this.patchFormWithSystemOptions(mapCatalogueRowToFormData(row));
    this.pageReady = true;
  }

  goBack(): void {
    this.router.navigate(['/transactions/seg-catalogue']);
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  private buildPayload(): Record<string, unknown> {
    return {
      catalogueInfo: buildCatalogueInfoFromForm(this.form.getRawValue()),
    };
  }

  private buildSystemHierarchyFromForm(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    const systemId = String(raw['system_name'] ?? '').trim();
    const subsystemId = String(raw['sub_system_name'] ?? '').trim();
    const systemName =
      this.systemOptions.find((option) => String(option.value) === systemId)
        ?.label ?? '';
    const subsystemName =
      this.subSystemOptions.find((option) => String(option.value) === subsystemId)
        ?.label ?? '';

    return buildSystemHierarchyPayload({
      systemId,
      systemName,
      subsystemId,
      subsystemName,
    });
  }

  private resolveTrialUuid(fallbackTrialId = ''): string {
    return (
      resolveSegCatalogueTrialId(this.trialRow) ||
      resolveSegCatalogueTrialId({ uuid: fallbackTrialId }) ||
      fallbackTrialId
    );
  }

  private syncTrialApproved(): void {
    if (!this.showSegVerification) {
      return;
    }

    const trialId = this.resolveTrialUuid(this.currentTrialRef());
    const approved = this.form.getRawValue()['approved'];
    if (!trialId || approved == null || approved === '') {
      return;
    }

    this.apiService
      .post(SEG_TRIALS_API, {
        id: trialId,
        approved: Number(approved),
        ...this.buildSystemHierarchyFromForm(),
      })
      .subscribe({
        error: () =>
          this.toast.showError(
            'Catalogue saved but SEG Verification update failed.',
          ),
      });
  }

  private syncTrialSystemHierarchy(trialId: string): void {
    const hierarchy = this.buildSystemHierarchyFromForm();
    if (!Object.keys(hierarchy).length) {
      return;
    }

    this.apiService
      .post(SEG_TRIALS_API, {
        id: trialId,
        ...hierarchy,
      })
      .subscribe({
        error: () =>
          this.toast.showError(
            'Catalogue saved but system hierarchy update failed.',
          ),
      });
  }

  private saveCatalogueTrial(
    jsonData: Record<string, unknown>,
    mode: 'draft' | 'save',
  ): void {
    const trialRef = this.currentTrialRef();
    if (!trialRef) {
      this.toast.showError('Trial reference missing');
      return;
    }

    this.workflowTrialId = trialRef;

    if (mode === 'draft') {
      this.draftLoading = true;
      this.formApiService
        .saveDraft(jsonData, trialRef)
        .pipe(
          finalize(() => {
            this.draftLoading = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: () => {
            if (this.showSegVerification) {
              this.syncTrialApproved();
            } else {
              this.syncTrialSystemHierarchy(trialRef);
            }
            this.toast.showSuccess('Draft saved successfully');
          },
          error: () => this.toast.showError('Draft save failed'),
        });
      return;
    }

    this.submitLoading = true;
    this.formApiService
      .submitForm(jsonData, trialRef)
      .pipe(
        finalize(() => {
          this.submitLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: () => {
          if (this.showSegVerification) {
            this.syncTrialApproved();
          } else {
            this.syncTrialSystemHierarchy(trialRef);
          }
          this.toast.showSuccess('Form submitted successfully');
          setTimeout(() => this.goBack(), 800);
        },
        error: () => this.toast.showError('Failed to submit form'),
      });
  }

  handleSave(mode: 'save' | 'draft' | 'clear'): void {
    if (mode === 'clear') {
      this.form.reset(buildEmptyCatalogueFormData());
      this.cdr.detectChanges();
      this.toast.showSuccess('Form cleared successfully');
      return;
    }

    if (mode === 'save' && !this.validateForm()) {
      return;
    }

    this.saveCatalogueTrial(this.buildPayload(), mode);
  }
}
