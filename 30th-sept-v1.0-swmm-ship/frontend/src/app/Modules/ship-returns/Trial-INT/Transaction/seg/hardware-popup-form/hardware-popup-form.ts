import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  getUserShipId,
  getUserShipName,
  isUserShipProcess,
} from '../../../../../../shared/utils/user-satellite-unit';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import {
  applySegSystemSubsystemPrefill,
  loadSegTrialContext,
} from '../seg-form-trial.service';
import {
  HardwarePopupSelectOption,
  SEG_HARDWARE_POPUP_DEFECT_TYPE_OPTIONS,
  buildEmptyHardwarePopupFormData,
  buildHardwarePopupInfoFromForm,
  hardwarePopupPatchFromSavedJson,
  mapHardwarePopupRowToFormData,
  mapTrialRowToHardwarePopupFormData,
  mergeHardwarePopupOptionsFromTrial,
  mergeHardwarePopupMmdTypeOptions,
  resolveHardwarePopupMmdTypeFormValue,
  resolveTrialSectionIds,
} from './seg-hardware-popup-form.shared';
import { FormCardComponent } from '../../../ui/master-compat';
import { LucideAngularModule, Save, SaveAllIcon } from '../../../ui/lucide-compat';
import { SelectComponent } from '../../../ui/select.component';
import { InputComponent } from '../../../ui/input.component';
import { TextareaComponent } from '../../../ui/textarea';
import { CalenderComponent } from '../../../ui/calender.component';
import { ApiService, RequestParams } from '../../../api.service';
import { ToastService } from '../../../services/toast.service';
import { FormApiService } from '../../../angulerFromconverting/form-api.service';
import { resolveTrialQueryParam } from '../../../trial-route-prefill';
import { Apiendpoints } from '../../../ApiEndPoints';
import { environment } from '../../../../../../../environments/environment';

export interface HardwarePopupPrefillContext {
  shipId?: string;
  shipLabel?: string;
  systemId?: string;
  subsystemId?: string;
  subSubSystemId?: string;
  mmdType?: string;
}

@Component({
  selector: 'app-hardware-popup-form',
  templateUrl: './hardware-popup-form.html',
  host: {
    class: 'block min-h-0',
    '[class.flex]': '!embedded',
    '[class.h-full]': '!embedded',
    '[class.flex-1]': '!embedded',
    '[class.flex-col]': '!embedded',
    '[class.overflow-hidden]': '!embedded',
  },
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LucideAngularModule,
    SelectComponent,
    InputComponent,
    TextareaComponent,
    CalenderComponent,
  ],
})
export class HardwarePopupFormComponent implements OnInit, OnChanges, OnDestroy {
  @Input() embedded = false;
  @Input() prefillContext: HardwarePopupPrefillContext | null = null;
  /** Ship dropdown options from parent (Raise Request dialog) — preferred over re-fetch. */
  @Input() prefillShipOptions: HardwarePopupSelectOption[] = [];
  /** When true, lock ship to prefilled value (ship-request Raise Request). */
  @Input() lockShipToPrefill = false;
  /** When false, embedded form skips hierarchy API prefill (e.g. hidden Repair tab). */
  @Input() embeddedPrefillEnabled = true;
  /** When embedded in Request Backup Popup, still load trial/`?trial=` prefill. */
  @Input() useTrialQueryPrefill = false;

  editMode = false;
  rowId: string | null = null;
  editDataDetails: Record<string, unknown> | null = null;
  workflowTrialId: string | undefined;
  pageReady = false;

  readonly draftIcon = Save;
  readonly saveIcon = SaveAllIcon;

  form!: FormGroup;
  loading = false;

  readonly defectTypeOptions = SEG_HARDWARE_POPUP_DEFECT_TYPE_OPTIONS;
  shipOptions: HardwarePopupSelectOption[] = [];
  systemOptions: HardwarePopupSelectOption[] = [];
  subsystemOptions: HardwarePopupSelectOption[] = [];
  subSubSystemOptions: HardwarePopupSelectOption[] = [];
  mmdTypeOptions: HardwarePopupSelectOption[] = [];
  shipFieldLocked = false;
  lockedShipLabel = '';

  /** Trial row from `?trial=` — used for filters and dropdown merge on prefill. */
  private trialContext: Record<string, unknown> | null = null;
  private readonly destroy$ = new Subject<void>();
  private lastPrefillKey = '';
  private embeddedShipPrefillDone = false;

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
    this.loadMmdTypeOptions();
    this.listenToCascadeChanges();

    if (this.embedded) {
      this.form.patchValue(buildEmptyHardwarePopupFormData());
      this.pageReady = true;
      if (this.useTrialQueryPrefill) {
        void this.bootstrapTrialPrefillWhenEmbedded();
        return;
      }
      // Apply parent ship options/id immediately (no wait on network).
      this.syncEmbeddedShipFromParent();
      if (this.embeddedPrefillEnabled) {
        void this.bootstrapEmbeddedPrefill();
      }
      return;
    }

    void this.loadShipOptions();
    void this.loadTrialPrefillFromQuery();

    if (!resolveTrialQueryParam(this.route, this.router)) {
      if (this.editMode && this.rowId) {
        this.getEditDataByRowId(this.rowId);
      } else {
        this.form.patchValue(buildEmptyHardwarePopupFormData());
        this.pageReady = true;
      }
    } else {
      this.pageReady = true;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.form || !this.embedded) {
      return;
    }

    // Only sync ship options / lock label — do not re-apply hierarchy on every
    // parent object identity change (that wiped user-entered System etc.).
    if (changes['prefillShipOptions'] || changes['lockShipToPrefill']) {
      this.syncEmbeddedShipFromParent();
    }

    if (
      changes['embeddedPrefillEnabled']?.currentValue === true &&
      changes['embeddedPrefillEnabled']?.previousValue === false
    ) {
      void this.bootstrapEmbeddedPrefill();
    }

    if (changes['prefillContext'] && this.embeddedPrefillEnabled) {
      const prev = changes['prefillContext'].previousValue as
        | HardwarePopupPrefillContext
        | null
        | undefined;
      const next = changes['prefillContext'].currentValue as
        | HardwarePopupPrefillContext
        | null
        | undefined;
      const prevKey = this.prefillIdentityKey(prev);
      const nextKey = this.prefillIdentityKey(next);
      if (prevKey !== nextKey) {
        this.syncEmbeddedShipFromParent();
        void this.applyPrefillContext(next);
      }
    }
  }

  private prefillIdentityKey(
    context: HardwarePopupPrefillContext | null | undefined,
  ): string {
    if (!context) {
      return '';
    }
    return [
      context.shipId ?? '',
      context.systemId ?? '',
      context.subsystemId ?? '',
      context.subSubSystemId ?? '',
      context.mmdType ?? '',
    ].join('|');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Used by Raise Request dialog when Repair tab is submitted. */
  buildEmbeddedPayload(): Record<string, unknown> {
    return buildHardwarePopupInfoFromForm(this.form.getRawValue());
  }

  /** Apply System / Sub System / Sub Sub System from parent context when available. */
  applyExternalHierarchy(input: {
    systemId?: string;
    subsystemId?: string;
    subSubSystemId?: string;
    mmdType?: string;
  }): void {
    if (!this.form) {
      return;
    }
    const systemId = String(input.systemId ?? '').trim();
    const subsystemId = String(input.subsystemId ?? '').trim();
    const subSubSystemId = String(input.subSubSystemId ?? '').trim();
    const mmdType = String(input.mmdType ?? '').trim();

    if (
      systemId &&
      !this.systemOptions.some((o) => String(o.value) === systemId)
    ) {
      this.systemOptions = [
        { label: `System #${systemId}`, value: systemId },
        ...this.systemOptions,
      ];
    }
    if (
      subsystemId &&
      !this.subsystemOptions.some((o) => String(o.value) === subsystemId)
    ) {
      this.subsystemOptions = [
        { label: `Sub System #${subsystemId}`, value: subsystemId },
        ...this.subsystemOptions,
      ];
    }
    if (
      subSubSystemId &&
      !this.subSubSystemOptions.some((o) => String(o.value) === subSubSystemId)
    ) {
      this.subSubSystemOptions = [
        { label: `Sub Sub System #${subSubSystemId}`, value: subSubSystemId },
        ...this.subSubSystemOptions,
      ];
    }

    this.form.patchValue(
      {
        system: systemId,
        sub_system: subsystemId,
        sub_sub_system: subSubSystemId,
        ...(mmdType ? { mmd_type: mmdType } : {}),
      },
      { emitEvent: false },
    );

    if (systemId) {
      this.form.get('sub_system')?.enable({ emitEvent: false });
      this.loadSubsystemOptions(systemId, () => {
        if (subsystemId) {
          this.form.get('sub_system')?.setValue(subsystemId, { emitEvent: false });
          this.form.get('sub_sub_system')?.enable({ emitEvent: false });
          this.loadSubSubSystemOptions(systemId, subsystemId, () => {
            if (subSubSystemId) {
              this.form
                .get('sub_sub_system')
                ?.setValue(subSubSystemId, { emitEvent: false });
            }
            this.cdr.detectChanges();
          });
        }
        this.cdr.detectChanges();
      });
    }

    if (mmdType) {
      this.applyMmdTypeToForm(mmdType);
    }
    this.cdr.detectChanges();
  }

  getSystemOptionsForSubmit(): HardwarePopupSelectOption[] {
    return this.systemOptions;
  }

  getSubsystemOptionsForSubmit(): HardwarePopupSelectOption[] {
    return this.subsystemOptions;
  }

  getSubSubSystemOptionsForSubmit(): HardwarePopupSelectOption[] {
    return this.subSubSystemOptions;
  }

  get canEdit(): boolean {
    return this.formApiService?.context?.workflow_rights?.can_edit !== false;
  }

  get canShowSaveDraft(): boolean {
    if (!this.canEdit) return false;
    const raw =
      this.formApiService?.context?.workflow_rights?.save_draft ??
      this.formApiService?.context?.save_draft;
    return raw !== false;
  }

  handleSubmit(): void {
    void this.handleSave('save');
  }

  /** Request Backup Popup: embedded chrome, but same trial/`?trial=` prefill as standalone. */
  private async bootstrapTrialPrefillWhenEmbedded(): Promise<void> {
    await this.loadShipOptions();
    await this.loadTrialPrefillFromQuery();
    this.enableHierarchyControlsFromForm();
    this.lockShipFieldFromTrial();
    this.cdr.detectChanges();
  }

  private enableHierarchyControlsFromForm(): void {
    const systemId = String(this.form?.get('system')?.value ?? '').trim();
    const subsystemId = String(this.form?.get('sub_system')?.value ?? '').trim();
    const subSubId = String(this.form?.get('sub_sub_system')?.value ?? '').trim();

    if (systemId) {
      this.form.get('sub_system')?.enable({ emitEvent: false });
    }
    if (systemId && subsystemId) {
      this.form.get('sub_sub_system')?.enable({ emitEvent: false });
      this.loadSubSubSystemOptions(systemId, subsystemId, () => {
        if (subSubId) {
          this.form.get('sub_sub_system')?.setValue(subSubId, { emitEvent: false });
        }
        this.cdr.detectChanges();
      });
    }
  }

  private lockShipFieldFromTrial(): void {
    const shipId =
      String(this.form?.get('ship_name')?.value ?? '').trim() || getUserShipId();
    if (!shipId) {
      return;
    }
    this.shipOptions = this.mergeUserShipIntoOptions(this.shipOptions, shipId);
    const label =
      getUserShipName() ||
      this.shipOptions.find((option) => String(option.value) === shipId)?.label ||
      `Ship #${shipId}`;
    if (isUserShipProcess()) {
      this.shipFieldLocked = true;
      this.lockedShipLabel = label;
    }
  }

  private async bootstrapEmbeddedPrefill(): Promise<void> {
    // Parent options are preferred; only fetch if parent has none yet.
    if (!this.prefillShipOptions?.length && !this.shipOptions.length) {
      await this.loadShipOptions();
    }
    this.syncEmbeddedShipFromParent();
    await this.applyPrefillContext(this.prefillContext);
  }

  /** Sync ship field from parent Raise Request dialog (options + id). */
  private syncEmbeddedShipFromParent(): void {
    if (!this.form || !this.embedded) {
      return;
    }

    if (this.prefillShipOptions?.length) {
      this.shipOptions = this.prefillShipOptions.map((option) => ({
        label: option.label,
        value: String(option.value),
      }));
    }

    const shipId = this.resolveEmbeddedShipId();
    if (!shipId) {
      this.shipFieldLocked = false;
      this.lockedShipLabel = '';
      this.cdr.detectChanges();
      return;
    }

    this.applyEmbeddedShipPrefill(shipId);
  }

  private resolveEmbeddedShipId(): string {
    const fromContext = String(this.prefillContext?.shipId ?? '').trim();
    if (fromContext) {
      return fromContext;
    }
    const fromUser = getUserShipId();
    if (fromUser) {
      return fromUser;
    }
    if (this.shipOptions.length === 1) {
      return String(this.shipOptions[0].value);
    }
    const shipName = (
      this.prefillContext?.shipLabel ||
      getUserShipName() ||
      ''
    )
      .trim()
      .toLowerCase();
    if (shipName) {
      const match = this.shipOptions.find(
        (option) => option.label.trim().toLowerCase() === shipName,
      );
      if (match) {
        return String(match.value);
      }
    }
    return '';
  }

  /** Ensure ship options include the logged-in ship, then set the control. */
  private applyEmbeddedShipPrefill(shipIdRaw?: string | null): void {
    if (!this.form) {
      return;
    }

    const shipId = String(shipIdRaw || this.resolveEmbeddedShipId() || '').trim();
    if (!shipId) {
      this.shipFieldLocked = false;
      this.lockedShipLabel = '';
      return;
    }

    this.shipOptions = this.mergeUserShipIntoOptions(this.shipOptions, shipId);
    this.form.get('ship_name')?.setValue(shipId, { emitEvent: false });

    const label =
      this.prefillContext?.shipLabel ||
      getUserShipName() ||
      this.shipOptions.find((o) => String(o.value) === shipId)?.label ||
      `Ship #${shipId}`;

    if (this.lockShipToPrefill || isUserShipProcess()) {
      this.shipFieldLocked = true;
      this.lockedShipLabel = label;
    } else {
      this.shipFieldLocked = false;
      this.lockedShipLabel = '';
    }

    this.embeddedShipPrefillDone = true;
    if (this.embeddedPrefillEnabled) {
      this.loadSystemOptions(shipId, resolveTrialSectionIds(this.trialContext));
    }
    this.cdr.detectChanges();
  }

  private mergeUserShipIntoOptions(
    apiShipOptions: HardwarePopupSelectOption[],
    shipId: string,
  ): HardwarePopupSelectOption[] {
    if (!shipId) {
      return apiShipOptions;
    }
    if (apiShipOptions.some((option) => String(option.value) === shipId)) {
      return apiShipOptions;
    }
    const shipName =
      this.prefillContext?.shipLabel ||
      getUserShipName() ||
      `Ship #${shipId}`;
    return [{ label: shipName, value: shipId }, ...apiShipOptions];
  }

  private async applyPrefillContext(
    context: HardwarePopupPrefillContext | null | undefined,
  ): Promise<void> {
    if (!this.form) {
      return;
    }

    // Keep embedded ship in sync with latest parent context/options.
    if (this.embedded) {
      this.syncEmbeddedShipFromParent();
    }

    const shipId = String(
      this.form.get('ship_name')?.value ||
        context?.shipId ||
        getUserShipId() ||
        '',
    ).trim();
    const systemId = String(context?.systemId ?? '').trim();
    const subsystemId = String(context?.subsystemId ?? '').trim();
    const mmdType = String(context?.mmdType ?? '').trim();

    // Only apply hierarchy from parent context when it actually has values —
    // do not wipe a user-selected System/Sub System on empty context refresh.
    if (this.embedded && (systemId || subsystemId || context?.subSubSystemId)) {
      this.applyExternalHierarchy({
        systemId,
        subsystemId,
        subSubSystemId: context?.subSubSystemId,
        mmdType,
      });
    }

    const key = [
      shipId,
      systemId,
      subsystemId,
      context?.subSubSystemId ?? '',
      mmdType,
    ].join('|');
    if (key === this.lastPrefillKey) {
      return;
    }
    this.lastPrefillKey = key;
    this.cdr.detectChanges();
  }

  private async loadTrialPrefillFromQuery(): Promise<void> {
    const loaded = await loadSegTrialContext({
      formApi: this.formApiService,
      route: this.route,
      router: this.router,
      formKey: 'hardware_popup_form',
    });
    if (!loaded) return;

    this.workflowTrialId = loaded.trialId;
    this.trialContext = loaded.trialRow;

    if (loaded.trialRow['id'] != null) {
      this.rowId = String(loaded.trialRow['id']);
      this.editMode = true;
      this.editDataDetails = loaded.trialRow;
    }

    let patch = mapTrialRowToHardwarePopupFormData(loaded.trialRow);
    const fromDraft = loaded.jsonSaved
      ? hardwarePopupPatchFromSavedJson(loaded.jsonSaved)
      : null;
    if (fromDraft) patch = { ...patch, ...fromDraft };

    await applySegSystemSubsystemPrefill({
      api: this.apiService,
      form: this.form,
      trialRow: loaded.trialRow,
      patch,
      systemOptions: this.systemOptions,
      subsystemOptions: this.subsystemOptions,
      setSystemOptions: (o) => (this.systemOptions = o),
      setSubsystemOptions: (o) => (this.subsystemOptions = o),
      cdr: this.cdr,
      shipId: patch['ship_name'] as string | number,
    });

    this.applyMmdTypeToForm(patch['mmd_type']);

    this.pageReady = true;
    this.cdr.detectChanges();
  }

  private buildForm(): void {
    this.form = this.fb.group({
      defect_type: ['', Validators.required],
      ship_name: ['', Validators.required],
      system: ['', Validators.required],
      sub_system: [{ value: '', disabled: true }],
      sub_sub_system: [{ value: '', disabled: true }],
      mmd_type: [''],
      description: ['', Validators.required],
      popup_date: ['', Validators.required],
      dart_no: [''],
      // Raise Request dialog already collects this when embedded.
      ship_proposed_date: [
        '',
        this.embedded ? [] : Validators.required,
      ],
    });
  }

  private listenToCascadeChanges(): void {
    this.form
      .get('ship_name')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((shipId) => {
        this.form.patchValue(
          { system: '', sub_system: '', sub_sub_system: '' },
          { emitEvent: false },
        );
        this.subsystemOptions = [];
        this.subSubSystemOptions = [];
        this.form.get('sub_system')?.disable({ emitEvent: false });
        this.form.get('sub_sub_system')?.disable({ emitEvent: false });
        if (shipId) {
          this.loadSystemOptions(shipId, resolveTrialSectionIds(this.trialContext));
        } else {
          this.systemOptions = [];
        }
        this.cdr.detectChanges();
      });
  }

  /** Called when System select changes — loads Sub System options. */
  onSystemSelected(systemId: string | number | null | undefined): void {
    const id =
      systemId != null && String(systemId).trim() !== ''
        ? String(systemId).trim()
        : '';

    this.form.patchValue(
      { sub_system: '', sub_sub_system: '' },
      { emitEvent: false },
    );
    this.subSubSystemOptions = [];
    this.form.get('sub_sub_system')?.disable({ emitEvent: false });

    if (!id) {
      this.subsystemOptions = [];
      this.form.get('sub_system')?.disable({ emitEvent: false });
      this.cdr.detectChanges();
      return;
    }

    this.form.get('sub_system')?.enable({ emitEvent: false });
    this.loadSubsystemOptions(id);
    this.cdr.detectChanges();
  }

  /** Called when Sub System select changes — loads Sub Sub System options. */
  onSubsystemSelected(subsystemId: string | number | null | undefined): void {
    const id =
      subsystemId != null && String(subsystemId).trim() !== ''
        ? String(subsystemId).trim()
        : '';
    const systemId = String(this.form.get('system')?.value ?? '').trim();

    this.form.patchValue({ sub_sub_system: '' }, { emitEvent: false });

    if (!id || !systemId) {
      this.subSubSystemOptions = [];
      this.form.get('sub_sub_system')?.disable({ emitEvent: false });
      this.cdr.detectChanges();
      return;
    }

    this.form.get('sub_sub_system')?.enable({ emitEvent: false });
    this.loadSubSubSystemOptions(systemId, id);
    this.cdr.detectChanges();
  }

  private loadMmdTypeOptions(): void {
    this.apiService
      .getDropdownData(
        'master/lookups/?type__code=MMDTYPE',
        { labelKey: 'name', valueKey: 'id' },
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.mmdTypeOptions = res.map((o: any) => ({
            label: o.label,
            value: String(o.value),
          }));
          this.applyMmdTypeToForm(this.form.get('mmd_type')?.value);
          this.cdr.detectChanges();
        },
        error: () => {
          this.mmdTypeOptions = [];
          this.cdr.detectChanges();
        },
      });
  }

  private applyMmdTypeToForm(raw: unknown): void {
    if (raw == null || raw === '') {
      return;
    }
    this.mmdTypeOptions = mergeHardwarePopupMmdTypeOptions(
      this.mmdTypeOptions,
      raw as string | number,
    );
    const resolved = resolveHardwarePopupMmdTypeFormValue(
      this.mmdTypeOptions,
      raw as string | number,
    );
    this.form.get('mmd_type')?.setValue(resolved, { emitEvent: false });
  }

  private async loadShipOptions(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.apiService.getDropdownData('master/ships/', {
          labelKey: 'name',
          valueKey: 'id',
        }),
      );
      const mapped = (res as any[]).map((o: any) => ({
        label: o.label,
        value: String(o.value),
      }));
      const shipId = getUserShipId();
      this.shipOptions = shipId
        ? this.mergeUserShipIntoOptions(mapped, shipId)
        : mapped;
    } catch {
      const shipId = getUserShipId();
      this.shipOptions = shipId
        ? this.mergeUserShipIntoOptions([], shipId)
        : [];
    }
    this.cdr.detectChanges();
  }

  private loadSystemOptions(
    shipId: string | number,
    sectionIds?: string,
    onDone?: () => void,
  ): void {
    const params: RequestParams = { ship: shipId };
    if (sectionIds) {
      params['section'] = sectionIds;
    }

    this.apiService
      .getDropdownData(Apiendpoints.MASTER_SYSTEM, { labelKey: 'name', valueKey: 'id' }, params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          const base = res.map((o: any) => ({
            label: o.label,
            value: String(o.value),
          }));
          this.systemOptions = mergeHardwarePopupOptionsFromTrial(
            base,
            this.trialContext,
            'system',
          );
          onDone?.();
          this.cdr.detectChanges();
        },
        error: () => {
          this.systemOptions = mergeHardwarePopupOptionsFromTrial(
            [],
            this.trialContext,
            'system',
          );
          onDone?.();
          this.cdr.detectChanges();
        },
      });
  }

  private loadSubsystemOptions(systemId: string | number, onDone?: () => void): void {
    const id = String(systemId ?? '').trim();
    if (!id) {
      this.subsystemOptions = [];
      onDone?.();
      this.cdr.detectChanges();
      return;
    }

    this.apiService
      .getDropdownData(
        'master/subsystems/',
        { labelKey: 'name', valueKey: 'id' },
        { system: id },
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          const base = res.map((o: any) => ({
            label: o.label,
            value: String(o.value),
          }));
          this.subsystemOptions = mergeHardwarePopupOptionsFromTrial(
            base,
            this.trialContext,
            'subsystem',
          );
          onDone?.();
          this.cdr.detectChanges();
        },
        error: () => {
          this.subsystemOptions = mergeHardwarePopupOptionsFromTrial(
            [],
            this.trialContext,
            'subsystem',
          );
          onDone?.();
          this.cdr.detectChanges();
        },
      });
  }

  private loadSubSubSystemOptions(
    _systemId: string,
    subsystemId: string,
    onDone?: () => void,
  ): void {
    if (!subsystemId) {
      this.subSubSystemOptions = [];
      onDone?.();
      this.cdr.detectChanges();
      return;
    }

    this.apiService
      .getDropdownData(
        'master/sub-sub-system/',
        { labelKey: 'name', valueKey: 'id' },
        { sub_system: subsystemId },
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.subSubSystemOptions = res.map((o: any) => ({
            label: o.label,
            value: String(o.value),
          }));
          onDone?.();
          this.cdr.detectChanges();
        },
        error: () => {
          this.subSubSystemOptions = [];
          onDone?.();
          this.cdr.detectChanges();
        },
      });
  }

  private getEditDataByRowId(rowId: string): void {
    this.apiService
      .get(`${environment.API_URL}seg/hardware-popup-form/${rowId}`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          if (res?.data) {
            this.editDataDetails = res.data;
            const patch = mapHardwarePopupRowToFormData(res.data);
            void applySegSystemSubsystemPrefill({
              api: this.apiService,
              form: this.form,
              trialRow: this.trialContext,
              patch,
              systemOptions: this.systemOptions,
              subsystemOptions: this.subsystemOptions,
              setSystemOptions: (o) => (this.systemOptions = o),
              setSubsystemOptions: (o) => (this.subsystemOptions = o),
              cdr: this.cdr,
              shipId: patch['ship_name'] as string | number,
            }).then(() => {
              this.applyMmdTypeToForm(patch['mmd_type']);
              this.pageReady = true;
              this.cdr.detectChanges();
            });
          }
        },
        error: () => {
          this.toastService.showError('Failed to load hardware popup form.');
        },
      });
  }

  validateForm(): boolean {
    const fieldLabels: Record<string, string> = {
      defect_type: 'Defect Type',
      ship_name: 'Ship',
      system: 'System',
      sub_system: 'Sub System',
      sub_sub_system: 'Sub Sub System',
      mmd_type: 'MMD Type',
      description: 'Description',
      popup_date: 'Date of Defect',
      dart_no: 'Dart Number',
      ship_proposed_date: 'Ship Proposed Date',
    };

    const raw = this.form.getRawValue() as Record<string, unknown>;
    const fieldStatus = Object.keys(this.form.controls).map((key) => {
      const control = this.form.get(key);
      const rawValue = raw[key];
      const valueText =
        rawValue == null ? '' : String(rawValue).trim();
      const isRequired = !!control?.hasValidator?.(Validators.required);
      const isFilled = valueText !== '';
      const isDisabled = !!control?.disabled;
      return {
        field: key,
        label: fieldLabels[key] ?? key,
        required: isRequired,
        filled: isFilled,
        disabled: isDisabled,
        valid: !!control?.valid,
        errors: control?.errors ?? null,
        value: valueText || '(empty)',
      };
    });

    const requiredMissing = fieldStatus.filter(
      (row) => row.required && !row.filled && !row.disabled,
    );
    const filled = fieldStatus.filter((row) => row.filled);
    const emptyOptional = fieldStatus.filter(
      (row) => !row.required && !row.filled,
    );

    console.group('[Repair Form] Field validation');
    console.table(fieldStatus);
    console.log('Required & filled:', filled.filter((r) => r.required).map((r) => r.label));
    console.log(
      'Required & NOT filled:',
      requiredMissing.map((r) => r.label),
    );
    console.log(
      'Optional empty:',
      emptyOptional.map((r) => r.label),
    );
    console.log('Form valid:', this.form.valid, '| Form invalid:', this.form.invalid);
    console.groupEnd();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const missingLabels = requiredMissing.map((r) => r.label).join(', ');
      this.toastService.showError(
        missingLabels
          ? `Please fill required fields: ${missingLabels}`
          : 'Please fill all required fields correctly.',
      );
      return false;
    }
    return true;
  }

  private buildPayload(): Record<string, unknown> {
    return {
      hardwarePopupInfo: buildHardwarePopupInfoFromForm(this.form.getRawValue()),
    };
  }

  async handleSave(draftStatus: 'draft' | 'save' | 'clear'): Promise<void> {
    if (draftStatus === 'clear') {
      this.form.reset(buildEmptyHardwarePopupFormData());
      this.systemOptions = [];
      this.subsystemOptions = [];
      this.subSubSystemOptions = [];
      this.cdr.detectChanges();
      this.toastService.showSuccess('Form cleared successfully');
      return;
    }

    if (draftStatus === 'save' && !this.validateForm()) {
      return;
    }

    const payload = this.buildPayload();
    const trialId =
      this.workflowTrialId ||
      resolveTrialQueryParam(this.route, this.router) ||
      '';

    if (draftStatus === 'draft') {
      this.loading = true;
      this.formApiService.saveDraft(payload, trialId).subscribe({
        next: () => this.toastService.showSuccess('Draft saved successfully'),
        error: () => this.toastService.showError('Draft save failed'),
        complete: () => {
          this.loading = false;
        },
      });
      return;
    }

    this.loading = true;
    this.formApiService.submitForm(payload, trialId).subscribe({
      next: () => {
        this.toastService.showSuccess('Form submitted successfully');
        setTimeout(() => this.router.navigate(['/seg/hardware_popup_form']), 800);
      },
      error: () => this.toastService.showError('Failed to submit form'),
      complete: () => {
        this.loading = false;
      },
    });
  }
}
