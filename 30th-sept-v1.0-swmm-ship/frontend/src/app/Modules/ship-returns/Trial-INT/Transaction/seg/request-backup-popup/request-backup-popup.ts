import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormArray,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin, of, takeUntil } from 'rxjs';
import { catchError, defaultIfEmpty } from 'rxjs/operators';
import {
  SegSelectOption,
  mergeTrialOptionsFromTrial,
  resolveTrialSectionIds,
  resolveTrialShipId,
  resolveTrialSubsystemId,
  resolveTrialSubsystemName,
  resolveTrialSystemId,
  resolveTrialSystemName,
} from '../seg-trial-prefill.shared';
import {
  applySegSystemSubsystemPrefill,
  loadSegTrialContext,
} from '../seg-form-trial.service';
import {
  SEG_MMD_MASTER_LOOKUP_CODES,
  SEG_MMD_MASTER_LOOKUP_FALLBACKS,
  setCatalogueMmdLookupOptions,
} from '../create-catalogue/seg-catalogue-form.shared';
import {
  RequestBackupTabType,
  RESTORATION_PREFERENCE_COUNT,
  SEG_CATALOGUES_API,
  buildEmptyRequestBackupFormData,
  buildEmptyRestorationPreference,
  buildRequestBackupJsonData,
  extractCatalogueApiRows,
  findCatalogueRowBySelection,
  fromShipRequestBackupTypeApi,
  toShipRequestBackupTypeApi,
  mapCatalogueApiToPreferenceCatalogueData,
  mapCatalogueApiToRequestBackupForm,
  mapCatalogueRowsToMmdOptions,
  mapTrialRowToRequestBackupFormData,
  normalizeRestorationPreferences,
  requestBackupPatchForTab,
  resolveSelectLabel,
} from './seg-request-backup-form.shared';
import { ensureSelectOption } from '../seg-item-handling-form.shared';
import { HardwarePopupFormComponent } from '../hardware-popup-form/hardware-popup-form';
import { FormCardComponent } from '../../../ui/form-card/form-card.component';
import { SelectComponent } from '../../../ui/select.component';
import { InputComponent } from '../../../ui/input.component';
import { TextareaComponent } from '../../../ui/textarea';
import { CalenderComponent } from '../../../ui/calender.component';
import { ApprovalWorkFlow } from '../../../ui/approval-work-flow/approval-work-flow';
import { ApiService, RequestParams } from '../../../api.service';
import { Apiendpoints } from '../../../ApiEndPoints';
import { resolveTrialQueryParam } from '../../../trial-route-prefill';
import { ToastService } from '../../../services/toast.service';
import { FormApiService } from '../../../angulerFromconverting/form-api.service';

@Component({
  selector: 'app-request-backup-popup',
  templateUrl: './request-backup-popup.html',
  host: {
    class: 'flex min-h-0 flex-1 flex-col overflow-hidden',
  },
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    SelectComponent,
    InputComponent,
    TextareaComponent,
    CalenderComponent,
    HardwarePopupFormComponent,
    ApprovalWorkFlow,
  ],
})
export class RequestBackupPopupComponent implements OnInit, OnDestroy {
  @ViewChild(HardwarePopupFormComponent)
  hardwareForm?: HardwarePopupFormComponent;

  editMode = false;
  rowId: string | null = null;
  editDataDetails: Record<string, unknown> | null = null;
  workflowTrialId: string | undefined;

  form!: FormGroup;
  loading = false;
  shouldShowUserPopup = false;
  isSubmitTime = false;

  readonly locationOptions = [
    { label: 'Insitu', value: 'insitu' },
    { label: 'SEG LAB', value: 'seg_lab' },
  ];

  systemOptions: SegSelectOption[] = [];
  subsystemOptions: SegSelectOption[] = [];
  shipOptions: SegSelectOption[] = [];
  osOptions: SegSelectOption[] = [...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdOs];
  interfaceOptions: SegSelectOption[] = [
    ...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdInterface,
  ];
  sizeOptions: SegSelectOption[] = [...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdSize];
  readonly preferenceLabels = ['Preference 1', 'Preference 2', 'Preference 3'];
  preferenceCascadeState: {
    systemOptions: SegSelectOption[];
    subsystemOptions: SegSelectOption[];
    mmdOptions: SegSelectOption[];
    catalogueRows: Record<string, unknown>[];
  }[] = Array.from({ length: RESTORATION_PREFERENCE_COUNT }, () => ({
    systemOptions: [],
    subsystemOptions: [],
    mmdOptions: [],
    catalogueRows: [],
  }));
  catalogueLoading = false;

  private readonly catalogueFieldKeys = [
    'system',
    'subsystem',
    'mmd_typeos',
    'interface',
    'size',
    'application',
    'name',
    'application_version',
    'part_no_mother_board',
    'pattern_no_selected_mmd',
  ] as const;

  private trialContext: Record<string, unknown> | null = null;
  private savedJsonData: Record<string, unknown> = {};
  private activeBackupTab: RequestBackupTabType = 'restoration';
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly apiService: ApiService,
    private readonly toastService: ToastService,
    public formApiService: FormApiService,
  ) {}

  ngOnInit(): void {
    this.rowId = this.route.snapshot.paramMap.get('id');
    this.editMode = !!this.rowId;
    this.buildForm();
    this.lockBackupTypeIfEditing();
    this.loadShipOptions();
    this.loadMmdMasterLookupOptions();
    this.listenToSystemChanges();
    this.listenToBackupTypeChanges();
    this.setupPreferenceCascadeListeners();
    void this.loadTrialPrefillFromQuery();
  }

  /** Resolve IDs → names for the read-only LAST WORKING BACKUP section. */
  get lastWorkingBackupDisplay(): Record<string, string> {
    const valueOf = (key: string): string =>
      String(this.form?.get(key)?.value ?? '').trim();

    const systemId = valueOf('system');
    const subsystemId = valueOf('subsystem');

    return {
      system: this.resolveHierarchyDisplayName(
        systemId,
        this.systemOptions,
        resolveTrialSystemName(this.trialContext),
      ),
      subsystem: this.resolveHierarchyDisplayName(
        subsystemId,
        this.subsystemOptions,
        resolveTrialSubsystemName(this.trialContext),
      ),
      mmd_typeos: this.resolveLookupDisplayName(
        this.osOptions,
        valueOf('mmd_typeos'),
      ),
      interface: this.resolveLookupDisplayName(
        this.interfaceOptions,
        valueOf('interface'),
      ),
      size: this.resolveLookupDisplayName(this.sizeOptions, valueOf('size')),
      application: valueOf('application'),
      name: valueOf('name'),
      application_version: valueOf('application_version'),
      part_no_mother_board: valueOf('part_no_mother_board'),
      pattern_no_selected_mmd: valueOf('pattern_no_selected_mmd'),
    };
  }

  private resolveHierarchyDisplayName(
    id: string,
    options: SegSelectOption[],
    trialNameFallback: string,
  ): string {
    if (!id) {
      return trialNameFallback || '';
    }
    const fromOptions = resolveSelectLabel(options, id);
    if (fromOptions && fromOptions !== '-' && fromOptions !== id) {
      return fromOptions;
    }
    if (trialNameFallback) {
      return trialNameFallback;
    }
    return fromOptions === '-' ? '' : fromOptions;
  }

  private resolveLookupDisplayName(
    options: SegSelectOption[],
    value: string,
  ): string {
    if (!value) {
      return '';
    }
    const label = resolveSelectLabel(options, value);
    return label === '-' ? value : label;
  }

  private loadMmdMasterLookupOptions(): void {
    const lookupConfig = { labelKey: 'name', valueKey: 'id' } as const;

    forkJoin({
      mmdType: this.apiService
        .getDropdownData(
          `master/lookups/?type__code=${SEG_MMD_MASTER_LOOKUP_CODES.mmdType}`,
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
      mmdSize: this.apiService
        .getDropdownData(
          `master/lookups/?type__code=${SEG_MMD_MASTER_LOOKUP_CODES.mmdSize}`,
          lookupConfig,
        )
        .pipe(defaultIfEmpty([]), catchError(() => of([]))),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (options) => {
          this.osOptions = this.mapMasterLookupOptions(
            options.mmdOs,
            SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdOs,
          );
          this.interfaceOptions = this.mapMasterLookupOptions(
            options.mmdInterface,
            SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdInterface,
          );
          this.sizeOptions = this.mapMasterLookupOptions(
            options.mmdSize,
            SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdSize,
          );
          setCatalogueMmdLookupOptions({
            mmdType: this.mapMasterLookupOptions(
              options.mmdType,
              SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdType,
            ),
            mmdSize: this.sizeOptions,
            mmdOs: this.osOptions,
            mmdInterface: this.interfaceOptions,
          });
          this.preferenceCascadeState.forEach((state) => {
            if (state.catalogueRows.length) {
              state.mmdOptions = mapCatalogueRowsToMmdOptions(
                state.catalogueRows,
              );
            }
          });
          this.syncCatalogueLookupOptionsFromForm();
          this.cdr.detectChanges();
        },
        error: () => {
          this.osOptions = [...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdOs];
          this.interfaceOptions = [
            ...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdInterface,
          ];
          this.sizeOptions = [...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdSize];
          setCatalogueMmdLookupOptions({
            mmdType: [...SEG_MMD_MASTER_LOOKUP_FALLBACKS.mmdType],
            mmdSize: this.sizeOptions,
            mmdOs: this.osOptions,
            mmdInterface: this.interfaceOptions,
          });
          this.syncCatalogueLookupOptionsFromForm();
          this.cdr.detectChanges();
        },
      });
  }

  private syncCatalogueLookupOptionsFromForm(): void {
    const os = this.form?.get('mmd_typeos')?.value;
    const iface = this.form?.get('interface')?.value;
    const size = this.form?.get('size')?.value;
    this.osOptions = ensureSelectOption(this.osOptions, os);
    this.interfaceOptions = ensureSelectOption(this.interfaceOptions, iface);
    this.sizeOptions = ensureSelectOption(this.sizeOptions, size);
  }

  private mapMasterLookupOptions(
    options: { label: string; value: string | number }[],
    fallback: SegSelectOption[],
  ): SegSelectOption[] {
    if (!options.length) {
      return [...fallback];
    }
    return options.map((option) => ({
      label: option.label,
      value: String(option.value),
    }));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadTrialPrefillFromQuery(): Promise<void> {
    const loaded = await loadSegTrialContext({
      formApi: this.formApiService,
      route: this.route,
      router: this.router,
      formKey: 'request_backup_popup',
    });
    if (!loaded) return;

    this.workflowTrialId = loaded.trialId;
    this.trialContext = loaded.trialRow;
    this.savedJsonData = { ...(loaded.jsonSaved ?? {}) };

    if (loaded.trialRow['id'] != null) {
      this.rowId = String(loaded.trialRow['id']);
      this.editMode = true;
      this.lockBackupTypeIfEditing();
    }

    const backupType = this.resolveSavedBackupType(this.savedJsonData);
    this.form.patchValue({ backup_type: backupType }, { emitEvent: false });

    if (backupType === 'hardware_popup') {
      this.lockBackupTypeIfEditing();
      this.cdr.detectChanges();
      return;
    }

    this.activeBackupTab = backupType;
    await this.applyTabPrefill(backupType, loaded.trialRow);
    this.lockBackupTypeIfEditing();
    this.cdr.detectChanges();
  }

  /** Edit mode: keep the saved backup type locked (no tab switching). */
  private lockBackupTypeIfEditing(): void {
    const control = this.form?.get('backup_type');
    if (!control) return;
    if (this.editMode) {
      control.disable({ emitEvent: false });
    } else {
      control.enable({ emitEvent: false });
    }
  }

  /** Prefer flat `backup_type`, then nested / legacy repair markers. */
  private resolveSavedBackupType(
    saved: Record<string, unknown>,
  ): RequestBackupTabType | 'hardware_popup' {
    const flat = String(saved['backup_type'] ?? '').trim();
    if (flat) {
      return fromShipRequestBackupTypeApi(flat);
    }

    if (
      saved['hardwarePopupInfo'] ||
      saved['defect_type'] != null ||
      saved['description'] != null
    ) {
      return 'hardware_popup';
    }

    for (const key of Object.keys(saved)) {
      const bucket = saved[key];
      if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) {
        continue;
      }
      const record = bucket as Record<string, unknown>;
      if (record['hardware_popup'] || record['assistance']) {
        return 'hardware_popup';
      }
      if (record['backup'] || record['extraction']) {
        return 'backup';
      }
      if (record['restoration']) {
        return 'restoration';
      }
    }

    return 'restoration';
  }

  private async applyTabPrefill(
    backupType: RequestBackupTabType,
    trialRow?: Record<string, unknown> | null,
  ): Promise<void> {
    const trial = trialRow ?? this.trialContext;
    const savedForTab = requestBackupPatchForTab(
      this.savedJsonData,
      backupType,
      trial,
      this.systemOptions,
    );

    let patch: Record<string, unknown>;

    if (savedForTab) {
      patch = { ...savedForTab, backup_type: backupType };
    } else if (backupType === 'restoration') {
      patch = {
        ...mapTrialRowToRequestBackupFormData(trial, backupType),
        backup_type: backupType,
      };
    } else {
      patch = buildEmptyRequestBackupFormData(backupType);
    }

    if (
      !String(patch['ship_proposed_date'] ?? '').trim() &&
      trial?.['ship_proposed_date'] != null
    ) {
      patch['ship_proposed_date'] = String(trial['ship_proposed_date']).slice(
        0,
        10,
      );
    }

    await applySegSystemSubsystemPrefill({
      api: this.apiService,
      form: this.form,
      trialRow: trial,
      patch,
      systemOptions: this.systemOptions,
      subsystemOptions: this.subsystemOptions,
      setSystemOptions: (o) => (this.systemOptions = o),
      setSubsystemOptions: (o) => (this.subsystemOptions = o),
      cdr: this.cdr,
      shipId: trial?.['ship_id'] as string | number,
    });

    if (backupType === 'restoration') {
      await this.applyRestorationPreferencesPrefill(
        patch['restoration_preferences'],
        trial,
      );
    }

    this.updateValidatorsForBackupType(backupType);
    this.refreshFormControlViews(patch);
  }

  private async applyRestorationPreferencesPrefill(
    savedPreferences: unknown,
    trial: Record<string, unknown> | null | undefined,
  ): Promise<void> {
    let preferences = normalizeRestorationPreferences(savedPreferences);
    const hasSavedPreference = preferences.some(
      (row) => row.ship || row.system || row.subsystem,
    );

    if (!hasSavedPreference && trial) {
      preferences[0] = {
        ship: resolveTrialShipId(trial),
        system: resolveTrialSystemId(trial),
        subsystem: resolveTrialSubsystemId(trial),
        mmd_type: '',
        catalogue: null,
      };
    }

    for (let index = 0; index < preferences.length; index += 1) {
      const row = preferences[index];
      const group = this.restorationPreferences.at(index);
      group.patchValue(
        {
          ship: row.ship,
          system: row.system,
          subsystem: row.subsystem,
          mmd_type: row.mmd_type ?? '',
        },
        { emitEvent: false },
      );

      if (!row.ship) continue;

      await this.loadPreferenceSystems(index, row.ship);
      if (!row.system) continue;

      await this.loadPreferenceSubsystems(index, row.system);
      if (!row.subsystem) continue;

      await this.loadPreferenceMmdOptions(
        index,
        row.ship,
        row.system,
        row.subsystem,
      );

      if (row.mmd_type) {
        this.applyMmdSelection(index, row.mmd_type, false);
      }
    }
  }

  private listenToBackupTypeChanges(): void {
    this.form
      .get('backup_type')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((nextType) => {
        if (nextType === 'hardware_popup') {
          this.cdr.detectChanges();
          return;
        }

        if (nextType !== 'restoration' && nextType !== 'backup') {
          return;
        }

        this.updateValidatorsForBackupType(nextType);
        void this.onBackupTabChange(nextType);
      });
  }

  private async onBackupTabChange(
    nextType: RequestBackupTabType,
  ): Promise<void> {
    this.activeBackupTab = nextType;
    await this.applyTabPrefill(nextType);
    this.cdr.detectChanges();
  }

  private updateValidatorsForBackupType(backupType: RequestBackupTabType): void {
    for (const key of this.catalogueFieldKeys) {
      const control = this.form?.get(key);
      if (!control) continue;
      control.setValidators(key === 'subsystem' ? [] : Validators.required);
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  private listenToSystemChanges(): void {
    this.form
      .get('system')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((systemId) => {
        this.form.patchValue({ subsystem: '' }, { emitEvent: false });
        if (systemId) {
          this.loadSubsystems(systemId);
        } else {
          this.subsystemOptions = [];
        }
        this.cdr.detectChanges();
      });
  }

  private loadShipOptions(): void {
    this.apiService
      .getDropdownData('master/ships/', { labelKey: 'name', valueKey: 'id' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.shipOptions = res.map((o) => ({
            label: o.label,
            value: String(o.value),
          }));
          this.cdr.detectChanges();
        },
        error: () => {
          this.shipOptions = [];
          this.cdr.detectChanges();
        },
      });
  }

  private setupPreferenceCascadeListeners(): void {
    this.restorationPreferences.controls.forEach((group, index) => {
      group
        .get('ship')
        ?.valueChanges.pipe(takeUntil(this.destroy$))
        .subscribe((shipId) => {
          group.patchValue(
            { system: '', subsystem: '', mmd_type: '' },
            { emitEvent: false },
          );
          this.preferenceCascadeState[index].subsystemOptions = [];
          this.preferenceCascadeState[index].mmdOptions = [];
          this.preferenceCascadeState[index].catalogueRows = [];
          if (shipId) {
            void this.loadPreferenceSystems(index, shipId);
          } else {
            this.preferenceCascadeState[index].systemOptions = [];
          }
          this.cdr.detectChanges();
        });

      group
        .get('system')
        ?.valueChanges.pipe(takeUntil(this.destroy$))
        .subscribe((systemId) => {
          group.patchValue({ subsystem: '', mmd_type: '' }, { emitEvent: false });
          this.preferenceCascadeState[index].mmdOptions = [];
          this.preferenceCascadeState[index].catalogueRows = [];
          if (systemId) {
            void this.loadPreferenceSubsystems(index, systemId);
          } else {
            this.preferenceCascadeState[index].subsystemOptions = [];
          }
          this.cdr.detectChanges();
        });

      group
        .get('subsystem')
        ?.valueChanges.pipe(takeUntil(this.destroy$))
        .subscribe((subsystemId) => {
          group.patchValue({ mmd_type: '' }, { emitEvent: false });
          this.preferenceCascadeState[index].mmdOptions = [];
          this.preferenceCascadeState[index].catalogueRows = [];
          const shipId = group.get('ship')?.value;
          const systemId = group.get('system')?.value;
          if (shipId && systemId && subsystemId) {
            void this.loadPreferenceMmdOptions(
              index,
              shipId,
              systemId,
              subsystemId,
            );
          }
          this.cdr.detectChanges();
        });

      group
        .get('mmd_type')
        ?.valueChanges.pipe(takeUntil(this.destroy$))
        .subscribe((mmdType) => {
          if (mmdType) {
            this.applyMmdSelection(index, mmdType);
          } else if (index === 0) {
            this.clearCatalogueDetailFields();
          }
          this.cdr.detectChanges();
        });
    });
  }

  private loadPreferenceSystems(
    index: number,
    shipId: string | number,
  ): Promise<void> {
    const params: RequestParams = { ship: shipId };
    const sectionIds = resolveTrialSectionIds(this.trialContext);
    if (sectionIds) {
      params['section'] = sectionIds;
    }

    return new Promise((resolve) => {
      this.apiService
        .getDropdownData(
          Apiendpoints.MASTER_SYSTEM,
          { labelKey: 'name', valueKey: 'id' },
          params,
        )
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (res) => {
            this.preferenceCascadeState[index].systemOptions =
              mergeTrialOptionsFromTrial(
                res.map((o) => ({ label: o.label, value: String(o.value) })),
                this.trialContext,
                'system',
              );
            this.cdr.detectChanges();
            resolve();
          },
          error: () => {
            this.preferenceCascadeState[index].systemOptions =
              mergeTrialOptionsFromTrial([], this.trialContext, 'system');
            this.cdr.detectChanges();
            resolve();
          },
        });
    });
  }

  private loadPreferenceSubsystems(
    index: number,
    systemId: string | number,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.apiService
        .getDropdownData(
          'master/subsystems/',
          { labelKey: 'name', valueKey: 'id' },
          { system: systemId },
        )
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (res) => {
            this.preferenceCascadeState[index].subsystemOptions =
              mergeTrialOptionsFromTrial(
                res.map((o) => ({ label: o.label, value: String(o.value) })),
                this.trialContext,
                'subsystem',
              );
            this.cdr.detectChanges();
            resolve();
          },
          error: () => {
            this.preferenceCascadeState[index].subsystemOptions =
              mergeTrialOptionsFromTrial([], this.trialContext, 'subsystem');
            this.cdr.detectChanges();
            resolve();
          },
        });
    });
  }

  private loadPreferenceMmdOptions(
    index: number,
    shipId: string | number,
    systemId: string | number,
    subsystemId: string | number,
  ): Promise<void> {
    this.catalogueLoading = true;
    this.cdr.detectChanges();

    return new Promise((resolve) => {
      this.apiService
        .get(SEG_CATALOGUES_API, {
          ship_id: shipId,
          system_id: systemId,
          subsystem_id: subsystemId,
          approved: '1,2,3',
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            const rows = extractCatalogueApiRows(response);
            this.preferenceCascadeState[index].catalogueRows = rows;
            this.preferenceCascadeState[index].mmdOptions =
              mapCatalogueRowsToMmdOptions(rows);
            this.catalogueLoading = false;
            this.cdr.detectChanges();
            resolve();
          },
          error: () => {
            this.preferenceCascadeState[index].catalogueRows = [];
            this.preferenceCascadeState[index].mmdOptions = [];
            this.catalogueLoading = false;
            this.cdr.detectChanges();
            resolve();
          },
        });
    });
  }

  private applyMmdSelection(
    index: number,
    mmdType: string,
    showNoDataToast = true,
  ): void {
    const rows = this.preferenceCascadeState[index].catalogueRows;
    const match = findCatalogueRowBySelection(rows, mmdType);

    if (!match) {
      if (showNoDataToast) {
        this.toastService.showError('No catalogue details found for the selected MMD.');
      }
      return;
    }

    if (index !== 0) {
      return;
    }

    const group = this.restorationPreferences.at(0);
    const systemId = group.get('system')?.value;
    const subsystemId = group.get('subsystem')?.value;

    const cataloguePatch = mapCatalogueApiToRequestBackupForm(match);
    cataloguePatch['system'] =
      systemId != null && systemId !== '' ? String(systemId) : cataloguePatch['system'];
    cataloguePatch['subsystem'] =
      subsystemId != null && subsystemId !== ''
        ? String(subsystemId)
        : cataloguePatch['subsystem'];

    this.form.patchValue(cataloguePatch, { emitEvent: false });
    this.syncCatalogueLookupOptionsFromForm();
    this.cdr.detectChanges();
  }

  private clearCatalogueDetailFields(): void {
    const patch: Record<string, string> = {};
    for (const key of this.catalogueFieldKeys) {
      patch[key] = '';
    }
    this.form.patchValue(patch, { emitEvent: false });
  }

  private loadSubsystems(systemId: string | number): void {
    this.apiService
      .getDropdownData(
        'master/subsystems/',
        { labelKey: 'name', valueKey: 'id' },
        { system: systemId },
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.subsystemOptions = mergeTrialOptionsFromTrial(
            res.map((o: any) => ({ label: o.label, value: String(o.value) })),
            this.trialContext,
            'subsystem',
          );
          this.cdr.detectChanges();
        },
        error: () => {
          this.subsystemOptions = mergeTrialOptionsFromTrial(
            [],
            this.trialContext,
            'subsystem',
          );
          this.cdr.detectChanges();
        },
      });
  }

  private refreshFormControlViews(patch: Record<string, unknown>): void {
    setTimeout(() => {
      this.form.patchValue(patch, { emitEvent: false });
      this.syncCatalogueLookupOptionsFromForm();
      this.cdr.detectChanges();
    }, 0);
  }

  get canEditForm(): boolean {
    return this.formApiService?.context?.workflow_rights?.can_edit === true;
  }

  /** Show Save Draft only when the user can edit and workflow/context `save_draft` is true. */
  get canShowSaveDraft(): boolean {
    if (!this.canEditForm) return false;
    const context = this.formApiService?.context;
    const raw = context?.workflow_rights?.save_draft ?? context?.save_draft;
    return raw === true || raw === 'true' || raw === 1 || raw === '1';
  }

  get isHardwarePopupType(): boolean {
    return this.form?.get('backup_type')?.value === 'hardware_popup';
  }

  get isRestorationType(): boolean {
    return this.form?.get('backup_type')?.value === 'restoration';
  }

  get restorationPreferences(): FormArray {
    return this.form.get('restoration_preferences') as FormArray;
  }

  private buildRestorationPreferencesArray(): FormArray {
    return this.fb.array(
      Array.from({ length: RESTORATION_PREFERENCE_COUNT }, () =>
        this.fb.group({
          ship: [''],
          system: [''],
          subsystem: [''],
          mmd_type: [''],
        }),
      ),
    );
  }

  private buildForm(): void {
    this.form = this.fb.group({
      backup_type: ['restoration'],
      restoration_preferences: this.buildRestorationPreferencesArray(),
      system: ['', Validators.required],
      subsystem: [''],
      mmd_typeos: ['', Validators.required],
      interface: ['', Validators.required],
      size: ['', Validators.required],
      application: ['', Validators.required],
      name: ['', Validators.required],
      application_version: ['', Validators.required],
      part_no_mother_board: ['', Validators.required],
      pattern_no_selected_mmd: ['', Validators.required],
      dart_no: [''],
      ship_proposed_date: ['', Validators.required],
      location: ['', Validators.required],
      landing_date: ['', Validators.required],
      reason_for_request: ['', Validators.required],
    });
  }

  validateForm(): boolean {
    if (this.isHardwarePopupType) {
      return this.hardwareForm?.validateForm() === true;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  private buildJsonData(): Record<string, unknown> {
    if (this.isHardwarePopupType) {
      const hardwareInfo = this.hardwareForm?.buildEmbeddedPayload() ?? {};
      const jsonData: Record<string, unknown> = {
        ...(this.savedJsonData ?? {}),
        ...hardwareInfo,
        backup_type: toShipRequestBackupTypeApi('hardware_popup'),
        hardwarePopupInfo: hardwareInfo,
      };
      this.savedJsonData = jsonData;
      return jsonData;
    }

    const raw = this.form.getRawValue() as Record<string, unknown>;
    if (this.activeBackupTab === 'restoration') {
      const preferences = normalizeRestorationPreferences(
        raw['restoration_preferences'],
      ).map((row, index) => {
        const match = row.mmd_type
          ? findCatalogueRowBySelection(
              this.preferenceCascadeState[index].catalogueRows,
              row.mmd_type,
            )
          : undefined;
        const group = this.restorationPreferences.at(index);
        const catalogue = match
          ? mapCatalogueApiToPreferenceCatalogueData(
              match,
              String(group.get('ship')?.value ?? ''),
              String(group.get('system')?.value ?? ''),
              String(group.get('subsystem')?.value ?? ''),
              this.shipOptions,
              this.preferenceCascadeState[index].systemOptions,
              this.preferenceCascadeState[index].subsystemOptions,
            )
          : row.catalogue ?? null;
        return {
          ...row,
          mmd_type: match
            ? String(match['mmd_type'] ?? row.mmd_type)
            : row.mmd_type,
          catalogue,
        };
      });
      raw['restoration_preferences'] = preferences;
    }

    const jsonData = buildRequestBackupJsonData(
      this.savedJsonData,
      raw,
      this.trialContext,
      this.systemOptions,
    );
    this.savedJsonData = jsonData;
    return jsonData;
  }

  async handleSave(draftStatus: 'draft' | 'save' | 'clear'): Promise<void> {
    if (draftStatus === 'clear') {
      const empty = buildEmptyRequestBackupFormData(this.activeBackupTab);
      this.form.patchValue(empty, { emitEvent: false });
      this.restorationPreferences.controls.forEach((group, index) => {
        group.reset(buildEmptyRestorationPreference(), { emitEvent: false });
        this.preferenceCascadeState[index] = {
          systemOptions: [],
          subsystemOptions: [],
          mmdOptions: [],
          catalogueRows: [],
        };
      });
      this.subsystemOptions = [];
      this.cdr.detectChanges();
      this.toastService.showSuccess('Form cleared successfully');
      return;
    }

    if (draftStatus === 'save' && !this.validateForm()) {
      return;
    }

    const jsonData = this.buildJsonData();
    const trialId =
      this.workflowTrialId ||
      resolveTrialQueryParam(this.route, this.router) ||
      '';

    if (draftStatus === 'draft') {
      this.loading = true;
      this.apiService
        .put('api/drafts/trials/', {
          trial_number: trialId,
          data: jsonData,
        })
        .subscribe({
          next: () => this.toastService.showSuccess('Draft saved successfully'),
          error: () => this.toastService.showError('Draft save failed'),
          complete: () => {
            this.loading = false;
          },
        });
      return;
    }

    this.loading = true;
    this.apiService
      .post('api/data/trials/', {
        id: trialId,
        json_data: jsonData,
      })
      .subscribe({
        next: () => this.toastService.showSuccess('Saved successfully'),
        error: () => this.toastService.showError('Failed to save data'),
        complete: () => {
          this.loading = false;
        },
      });
  }

  handleSubmit(): void {
    if (!this.validateForm()) {
      return;
    }

    const jsonData = this.buildJsonData();
    const trialId =
      this.workflowTrialId ||
      resolveTrialQueryParam(this.route, this.router) ||
      '';

    this.isSubmitTime = true;
    this.shouldShowUserPopup = true;
    this.cdr.detectChanges();

    this.loading = true;
    this.apiService
      .post('api/data/trials/', {
        id: trialId,
        json_data: jsonData,
      })
      .subscribe({
        next: () => this.toastService.showSuccess('Form submitted successfully'),
        error: () => this.toastService.showError('Failed to submit form'),
        complete: () => {
          this.loading = false;
        },
      });
  }
}
