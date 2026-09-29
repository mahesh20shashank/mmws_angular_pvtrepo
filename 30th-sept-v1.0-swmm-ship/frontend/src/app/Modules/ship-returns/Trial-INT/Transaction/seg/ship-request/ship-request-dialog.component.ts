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
  ViewChild,
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  catchError,
  defaultIfEmpty,
  finalize,
  forkJoin,
  of,
  Subject,
  takeUntil,
} from 'rxjs';
import { SegSelectOption } from '../seg-trial-prefill.shared';
import {
  buildShipRequestRepairTrialPayload,
  buildShipRequestTrialPayload,
  extractCatalogueApiRows,
  extractLastAvailableBackupRows,
  findCatalogueRowBySelection,
  mapCatalogueApiToRequestBackupForm,
  mapCatalogueRowsToMmdOptions,
  mapLastAvailableBackupToDisplay,
  mapLastAvailableBackupToPreferenceValues,
  resolveCatalogueRowOptionValue,
  resolveCatalogueSubSubSystemLabel,
  resolveLastAvailableBackupParams,
  resolveSelectLabel,
  RESTORATION_PREFERENCE_COUNT,
  SEG_CATALOGUES_API,
  SEG_LAST_AVAILABLE_BACKUP_API,
} from '../request-backup-popup/seg-request-backup-form.shared';
import { SEG_TRIALS_API } from '../seg-trials-tabs.shared';
import { getUserShipId, getUserShipName } from '../../../../../../shared/utils/user-satellite-unit';
import {
  HardwarePopupFormComponent,
  HardwarePopupPrefillContext,
} from '../hardware-popup-form/hardware-popup-form';
import {
  AddMmdFilterContext,
  resolveCatalogueMmdIdentificationNumber,
  SEG_MMD_MASTER_LOOKUP_CODES,
  setCatalogueMmdLookupOptions,
} from '../create-catalogue/seg-catalogue-form.shared';
import { AddMmdDialogComponent } from '../create-catalogue/add-mmd-dialog.component';
import { SelectComponent, SelectOption } from '../../../ui/select.component';
import { InputComponent } from '../../../ui/input.component';
import { TextareaComponent } from '../../../ui/textarea';
import { CalenderComponent } from '../../../ui/calender.component';
import { ApiService } from '../../../api.service';
import { ToastService } from '../../../services/toast.service';

export interface ShipRequestMmdContext {
  shipId?: string;
  departmentId?: string;
  systemId?: string;
  subsystemId?: string;
  subSubSystemId?: string;
  subSubSystemLabel?: string;
  mmdType?: string;
  catalogueRow?: Record<string, unknown> | null;
}

@Component({
  selector: 'app-ship-request-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SelectComponent,
    InputComponent,
    TextareaComponent,
    CalenderComponent,
    HardwarePopupFormComponent,
    AddMmdDialogComponent,
  ],
  templateUrl: './ship-request-dialog.component.html',
})
export class ShipRequestDialogComponent implements OnChanges, OnDestroy {
  @ViewChild(HardwarePopupFormComponent)
  private hardwareForm?: HardwarePopupFormComponent;

  /** Stable Repair prefill — avoid getter identity churn on every CD cycle. */
  repairPrefillContext: HardwarePopupPrefillContext | null = null;
  private pendingRepairPrefillContext: HardwarePopupPrefillContext | null = null;

  @Input() open = false;
  @Input() mmdContext: ShipRequestMmdContext | null = null;
  @Output() openChange = new EventEmitter<boolean>();
  @Output() submitted = new EventEmitter<void>();
  @Output() mmdAdded = new EventEmitter<void>();

  readonly preferenceLabels = ['Preference 1', 'Preference 2', 'Preference 3'];
  readonly modeOptions: SelectOption[] = [
    { label: 'Insitu', value: 'insitu' },
    { label: 'SEG LAB', value: 'seg_lab' },
  ];

  form!: FormGroup;
  saving = false;
  catalogueLoading = false;
  lastWorkingBackupLoading = false;
  showAddMmdDialog = false;
  isFullscreen = false;

  shipOptions: SegSelectOption[] = [];
  mmdDepartmentOptions: SegSelectOption[] = [];
  mmdSystemOptions: SegSelectOption[] = [];
  mmdSubsystemOptions: SegSelectOption[] = [];
  mmdSubSubSystemOptions: SegSelectOption[] = [];
  mmdSelectOptions: SegSelectOption[] = [];
  mmdDetails: Record<string, string> = {};
  lastWorkingBackup: Record<string, string> = {};
  availableBackupRows: Record<string, unknown>[] = [];
  selectedAvailableBackupIndex: number | null = null;
  preferredBackupMarked = false;
  activePreferenceIndex = 0;
  selectedMmdContext: ShipRequestMmdContext | null = null;
  mmdSelectionLoading = false;

  private selectionCatalogueRows: Record<string, unknown>[] = [];
  private prefillingMmdSelection = false;
  /** Raw API row for Last Working Backup (driven by form MMD selection). */
  private lastWorkingBackupRow: Record<string, unknown> | null = null;
  /** Resolved when MMDTYPE/MMDSIZE master lookups are loaded for option labels. */
  private mmdLookupsReady: Promise<void> = Promise.resolve();

  preferenceCascadeState: {
    systemOptions: SegSelectOption[];
    subsystemOptions: SegSelectOption[];
    subSubSystemOptions: SegSelectOption[];
    mmdOptions: SegSelectOption[];
    catalogueRows: Record<string, unknown>[];
  }[] = Array.from({ length: RESTORATION_PREFERENCE_COUNT }, () => ({
    systemOptions: [],
    subsystemOptions: [],
    subSubSystemOptions: [],
    mmdOptions: [],
    catalogueRows: [],
  }));

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly apiService: ApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.buildForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue === true) {
      this.isFullscreen = false;
      this.resetForm();
      this.loadShipOptions();
      void this.loadMmdLookupOptions();
      this.loadMmdDepartmentOptions();
      void this.loadMmdSystemOptions();
      this.applyMmdContext();
      this.refreshRepairPrefillContext();
      return;
    }

    if (changes['open'] && changes['open'].currentValue === false) {
      this.isFullscreen = false;
    }

    if (
      changes['mmdContext'] &&
      this.open &&
      changes['mmdContext'].currentValue != null
    ) {
      this.applyMmdContext();
      this.refreshRepairPrefillContext();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isRestorationType(): boolean {
    return this.form?.get('request_type')?.value === 'restoration';
  }

  get isBackupType(): boolean {
    return this.form?.get('request_type')?.value === 'backup';
  }

  get showDartNo(): boolean {
    return this.isRestorationType;
  }

  get isRepairType(): boolean {
    return this.form?.get('request_type')?.value === 'hardware_popup';
  }

  private refreshRepairPrefillContext(): void {
    const selection =
      (this.form.get('mmd_selection')?.getRawValue() as Record<string, string>) ??
      {};
    const context = this.selectedMmdContext ?? this.mmdContext;
    const shipId =
      context?.shipId || this.resolveUserShipId() || undefined;
    const shipLabel =
      (shipId
        ? resolveSelectLabel(this.shipOptions, shipId)
        : '') ||
      getUserShipName() ||
      undefined;
    const systemId =
      selection['system'] || context?.systemId || undefined;
    const subsystemId =
      selection['subsystem'] || context?.subsystemId || undefined;
    const subSubSystemId =
      selection['sub_sub_system'] || context?.subSubSystemId || undefined;
    const mmdSelection = selection['mmd'];
    const selectedCatalogueRow = mmdSelection
      ? findCatalogueRowBySelection(this.selectionCatalogueRows, mmdSelection)
      : null;
    const mmdType =
      (selectedCatalogueRow
        ? String(selectedCatalogueRow['mmd_type'] ?? '')
        : '') ||
      context?.mmdType ||
      undefined;

    const next: typeof this.repairPrefillContext = {
      shipId,
      shipLabel:
        shipLabel && shipLabel !== '-'
          ? shipLabel
          : getUserShipName() || undefined,
      systemId: systemId ? String(systemId) : undefined,
      subsystemId: subsystemId ? String(subsystemId) : undefined,
      subSubSystemId: subSubSystemId ? String(subSubSystemId) : undefined,
      mmdType: mmdType ? String(mmdType) : undefined,
    };

    const prev = this.isRepairType
      ? this.repairPrefillContext
      : this.pendingRepairPrefillContext;
    const same =
      prev &&
      prev.shipId === next.shipId &&
      prev.shipLabel === next.shipLabel &&
      prev.systemId === next.systemId &&
      prev.subsystemId === next.subsystemId &&
      prev.subSubSystemId === next.subSubSystemId &&
      prev.mmdType === next.mmdType;

    this.pendingRepairPrefillContext = next;

    if (!this.isRepairType || same) {
      return;
    }
    this.repairPrefillContext = next;
  }

  get hasLastWorkingBackup(): boolean {
    return Object.values(this.lastWorkingBackup).some(
      (value) => String(value ?? '').trim() !== '' && String(value) !== '-',
    );
  }

  get hasAvailableBackups(): boolean {
    return this.availableBackupRows.length > 0;
  }

  get canQueryAvailableBackups(): boolean {
    if (!this.isRestorationType) {
      return false;
    }

    return this.restorationPreferences.controls.some(
      (group) => !!group.get('ship')?.value && !!group.get('system')?.value,
    );
  }

  get availableBackupDisplays(): Record<string, string>[] {
    return this.availableBackupRows.map((row) =>
      mapLastAvailableBackupToDisplay(row),
    );
  }

  get addMmdFilterContext(): AddMmdFilterContext {
    const selection =
      (this.form.get('mmd_selection')?.getRawValue() as Record<string, string>) ??
      {};
    const subSubSystemOption = this.mmdSubSubSystemOptions.find(
      (option) =>
        String(option.value) === String(selection['sub_sub_system'] ?? ''),
    );

    return {
      system_id: selection['system'] || this.selectedMmdContext?.systemId,
      subsystem_id:
        selection['subsystem'] || this.selectedMmdContext?.subsystemId,
      sub_sub_system_id:
        selection['sub_sub_system'] || this.selectedMmdContext?.subSubSystemId,
      equipment_nomenclature:
        subSubSystemOption?.label || this.selectedMmdContext?.subSubSystemLabel,
    };
  }

  get restorationPreferences(): FormArray {
    return this.form.get('restoration_preferences') as FormArray;
  }

  close(): void {
    this.isFullscreen = false;
    this.openChange.emit(false);
  }

  onBackdropClick(): void {
    if (this.isFullscreen) {
      return;
    }
    this.close();
  }

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
  }

  openAddMmdDialog(): void {
    this.showAddMmdDialog = true;
  }

  onAddMmdDialogOpenChange(open: boolean): void {
    this.showAddMmdDialog = open;
  }

  onMmdSaved(): void {
    const selection =
      (this.form.get('mmd_selection')?.getRawValue() as Record<string, string>) ??
      {};

    if (selection['system']) {
      void this.loadMmdSelectOptions(
        this.resolveUserShipId() || undefined,
        String(selection['system']),
        selection['subsystem'] ? String(selection['subsystem']) : undefined,
        selection['sub_sub_system']
          ? String(selection['sub_sub_system'])
          : undefined,
      ).then(() => this.mmdAdded.emit());
      return;
    }

    this.mmdAdded.emit();
  }

  selectAsPreferred(): void {
    // Prefer Last Working Backup from form MMD selection.
    if (this.lastWorkingBackupRow) {
      void this
        .applyPreferenceValues(
          0,
          mapLastAvailableBackupToPreferenceValues(this.lastWorkingBackupRow),
        )
        .then(() => this.markPreferredBackup('Backup marked as preferred.'));
      return;
    }

    if (this.selectedAvailableBackupIndex != null) {
      this.applyAvailableBackupToPreference(this.selectedAvailableBackupIndex);
      this.markPreferredBackup('Backup marked as preferred.');
      return;
    }

    if (this.availableBackupRows.length) {
      this.applyAvailableBackupToPreference(0);
      this.markPreferredBackup('Backup marked as preferred.');
      return;
    }

    const firstPreference = this.restorationPreferences.at(0);
    const context = this.selectedMmdContext ?? this.mmdContext;
    if (!firstPreference || !context) {
      return;
    }

    void this
      .applyPreferenceValues(0, {
        ship: context.shipId ?? '',
        system: context.systemId ?? '',
        subsystem: context.subsystemId ?? '',
        sub_sub_system: context.subSubSystemId ?? '',
        mmd_type: context.mmdType ?? '',
      })
      .then(() => this.markPreferredBackup('Backup marked as preferred.'));
  }

  selectAvailableBackup(index: number): void {
    this.activePreferenceIndex = 0;
    this.applyAvailableBackupToPreference(index);
    this.markPreferredBackup('Backup selection marked.');
  }

  onPreferenceSelectionChanged(index: number): void {
    this.activePreferenceIndex = index;
    this.preferredBackupMarked = false;
  }

  onPreferenceMmdChange(index: number, mmdType: string | number | null): void {
    if (!this.isRestorationType) {
      this.clearAvailableBackupState();
      return;
    }

    void this.loadAvailableBackupsForPreference(
      index,
      mmdType != null && String(mmdType).trim() !== ''
        ? String(mmdType)
        : undefined,
    );
  }

  onSubmit(): void {
    if (this.isRepairType) {
      this.submitRepairRequest();
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.showError('Please fill all required fields.');
      return;
    }

    const formRaw = {
      ...(this.form.getRawValue() as Record<string, unknown>),
    };
    delete formRaw['mmd_selection'];

    const payload = buildShipRequestTrialPayload({
      formRaw,
      mmdContext: this.selectedMmdContext ?? this.mmdContext,
      mmdDetails: this.mmdDetails,
      lastWorkingBackup: this.lastWorkingBackup,
      shipOptions: this.shipOptions,
      systemOptions: this.mmdSystemOptions,
      subsystemOptions: this.mmdSubsystemOptions,
      subSubSystemOptions: this.mmdSubSubSystemOptions,
      preferenceState: this.preferenceCascadeState,
    });

    this.saving = true;
    this.apiService
      .post(SEG_TRIALS_API, payload)
      .pipe(
        finalize(() => {
          this.saving = false;
          this.cdr.detectChanges();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: () => {
          this.toast.showSuccess('Request submitted successfully.');
          this.submitted.emit();
          this.close();
        },
        error: (err: { message?: string }) => {
          this.toast.showError(err?.message || 'Failed to submit request.');
        },
      });
  }

  private submitRepairRequest(): void {
    const hardware = this.hardwareForm;
    if (!hardware) {
      this.toast.showError('Repair form is not ready.');
      return;
    }

    const shipProposedDate = String(
      this.form.get('ship_proposed_date')?.value ?? '',
    ).trim();
    console.group('[Raise Request] Repair submit checks');
    console.log('Ship Proposed Date:', shipProposedDate || '(empty)');
    console.log('Request type:', this.form.get('request_type')?.value);
    console.groupEnd();
    if (!shipProposedDate) {
      this.form.get('ship_proposed_date')?.markAsTouched();
      this.toast.showError('Please select Ship Proposed Date.');
      return;
    }

    if (!hardware.validateForm()) {
      return;
    }

    const hardwareInfo: Record<string, unknown> = {
      ...hardware.buildEmbeddedPayload(),
      ship_proposed_date: shipProposedDate,
    };
    const systemId = String(hardwareInfo['system'] ?? '').trim();
    const subsystemId = String(hardwareInfo['sub_system'] ?? '').trim();
    const subSubSystemId = String(hardwareInfo['sub_sub_system'] ?? '').trim();
    const subSubSystemOption = hardware
      .getSubSubSystemOptionsForSubmit()
      .find((option) => String(option.value) === subSubSystemId);

    const mmdContext = {
      ...(this.selectedMmdContext ?? this.mmdContext ?? {}),
      shipId:
        String(hardwareInfo['ship_name'] ?? '').trim() ||
        this.resolveUserShipId() ||
        undefined,
      systemId: systemId || undefined,
      subsystemId: subsystemId || undefined,
      subSubSystemId: subSubSystemId || undefined,
      subSubSystemLabel: subSubSystemOption?.label,
      mmdType: String(hardwareInfo['mmd_type'] ?? '').trim() || undefined,
    };

    const payload = buildShipRequestRepairTrialPayload({
      hardwareInfo,
      mmdContext,
      shipOptions: this.shipOptions,
      systemOptions: hardware.getSystemOptionsForSubmit(),
      subsystemOptions: hardware.getSubsystemOptionsForSubmit(),
      subSubSystemOptions: hardware.getSubSubSystemOptionsForSubmit(),
    });

    this.saving = true;
    this.apiService
      .post(SEG_TRIALS_API, payload)
      .pipe(
        finalize(() => {
          this.saving = false;
          this.cdr.detectChanges();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: () => {
          this.toast.showSuccess('Request submitted successfully.');
          this.submitted.emit();
          this.close();
        },
        error: (err: { message?: string }) => {
          this.toast.showError(err?.message || 'Failed to submit request.');
        },
      });
  }

  private buildForm(): void {
    this.form = this.fb.group({
      request_type: ['restoration', Validators.required],
      mmd_selection: this.fb.group({
        department: [''],
        system: ['', Validators.required],
        subsystem: [''],
        sub_sub_system: [''],
        mmd: ['', Validators.required],
      }),
      mmd_identification_number: [{ value: '', disabled: false }],
      mode: ['', Validators.required],
      landing_date: ['', Validators.required],
      ship_proposed_date: ['', Validators.required],
      reason_for_request: ['', Validators.required],
      dart_no: [''],
      restoration_preferences: this.fb.array(
        Array.from({ length: RESTORATION_PREFERENCE_COUNT }, () =>
          this.fb.group({
            ship: [''],
            system: [''],
            subsystem: [''],
            sub_sub_system: [''],
            mmd_type: [''],
          }),
        ),
      ),
    });

    this.form
      .get('request_type')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((requestType) => {
        this.refreshRepairPrefillContext();
        if (requestType === 'restoration') {
          // Select Available Backup from preferences; Last Working Backup from form MMD.
          this.reloadAvailableBackupsFromPreferences();
          this.reloadLastWorkingBackupFromForm();
        } else {
          this.clearAvailableBackupState();
          this.clearLastWorkingBackupState();
        }
        this.cdr.detectChanges();
      });

    this.setupPreferenceListeners();
    this.setupMmdSelectionListeners();
  }

  private resetForm(): void {
    this.form.reset({
      request_type: 'restoration',
      mmd_selection: {
        department: '',
        system: '',
        subsystem: '',
        sub_sub_system: '',
        mmd: '',
      },
      mmd_identification_number: '',
      mode: '',
      landing_date: '',
      ship_proposed_date: '',
      reason_for_request: '',
      dart_no: '',
    });
    this.restorationPreferences.controls.forEach((group, index) => {
      group.reset({
        ship: '',
        system: '',
        subsystem: '',
        sub_sub_system: '',
        mmd_type: '',
      });
      this.preferenceCascadeState[index] = {
        systemOptions: [],
        subsystemOptions: [],
        subSubSystemOptions: [],
        mmdOptions: [],
        catalogueRows: [],
      };
    });
    this.mmdDepartmentOptions = [];
    this.mmdSystemOptions = [];
    this.mmdSubsystemOptions = [];
    this.mmdSubSubSystemOptions = [];
    this.mmdSelectOptions = [];
    this.selectionCatalogueRows = [];
    this.mmdDetails = {};
    this.selectedMmdContext = null;
    this.repairPrefillContext = null;
    this.pendingRepairPrefillContext = null;
    this.clearAvailableBackupState();
    this.clearLastWorkingBackupState();
    this.lastWorkingBackupLoading = false;
    this.mmdSelectionLoading = false;
  }

  private applyMmdContext(): void {
    void this.prefillMmdSelectionFromContext();
  }

  private async prefillMmdSelectionFromContext(): Promise<void> {
    const context = this.mmdContext;
    if (!context) {
      this.mmdDetails = {};
      this.selectedMmdContext = null;
      this.form.patchValue(
        { mmd_identification_number: '' },
        { emitEvent: false },
      );
      return;
    }

    this.prefillingMmdSelection = true;

    try {
      if (context.departmentId) {
        this.form
          .get('mmd_selection')
          ?.patchValue({ department: context.departmentId }, { emitEvent: false });
        await this.loadMmdSystemOptions(context.departmentId);
      } else if (context.systemId) {
        await this.loadMmdSystemOptions();
      }

      if (context.systemId) {
        this.form
          .get('mmd_selection')
          ?.patchValue({ system: context.systemId }, { emitEvent: false });
        await this.loadMmdSubsystemOptions(context.systemId);
      }

      if (context.subsystemId) {
        this.form
          .get('mmd_selection')
          ?.patchValue({ subsystem: context.subsystemId }, { emitEvent: false });
        await this.loadMmdSubSubSystemOptions(context.subsystemId);
      }

      if (context.subSubSystemId) {
        this.form
          .get('mmd_selection')
          ?.patchValue(
            { sub_sub_system: context.subSubSystemId },
            { emitEvent: false },
          );
      }

      const shipId = context.shipId || this.resolveUserShipId();
      if (context.systemId) {
        await this.loadMmdSelectOptions(
          shipId || undefined,
          context.systemId,
          context.subsystemId || undefined,
          context.subSubSystemId || undefined,
        );
      }

      if (context.catalogueRow || context.mmdType) {
        const row =
          context.catalogueRow ??
          (context.mmdType
            ? findCatalogueRowBySelection(
                this.selectionCatalogueRows,
                context.mmdType,
              )
            : undefined);
        const optionValue = row
          ? resolveCatalogueRowOptionValue(row)
          : context.mmdType;
        if (optionValue) {
          this.form
            .get('mmd_selection')
            ?.patchValue({ mmd: optionValue }, { emitEvent: false });
        }
        if (row) {
          this.applySelectedCatalogueRow(
            row,
            String(row['mmd_type'] ?? context.mmdType ?? ''),
          );
        }
      }
    } finally {
      this.prefillingMmdSelection = false;
      this.cdr.detectChanges();
    }
  }

  private applySelectedCatalogueRow(
    row: Record<string, unknown>,
    mmdType: string,
  ): void {
    const mapped = mapCatalogueApiToRequestBackupForm(row);
    const selection =
      (this.form.get('mmd_selection')?.getRawValue() as Record<string, string>) ??
      {};
    const subSubSystemOption = this.mmdSubSubSystemOptions.find(
      (option) =>
        String(option.value) === String(selection['sub_sub_system'] ?? ''),
    );

    this.mmdDetails = {
      system: String(row['system_name'] ?? mapped['system'] ?? ''),
      subsystem: String(row['subsystem_name'] ?? mapped['subsystem'] ?? ''),
      sub_sub_system: String(resolveCatalogueSubSubSystemLabel(row) || ''),
      mmd_typeos: String(mapped['mmd_typeos'] ?? row['mmd_type'] ?? ''),
      interface: String(mapped['interface'] ?? ''),
      size: String(mapped['size'] ?? ''),
      application: String(mapped['application'] ?? ''),
      name: String(mapped['name'] ?? ''),
      application_version: String(mapped['application_version'] ?? ''),
      part_no_mother_board: String(mapped['part_no_mother_board'] ?? ''),
      pattern_no_selected_mmd: String(mapped['pattern_no_selected_mmd'] ?? ''),
    };

    this.selectedMmdContext = {
      shipId: this.resolveUserShipId() || this.mmdContext?.shipId,
      departmentId: selection['department'] || this.mmdContext?.departmentId,
      systemId: selection['system'] || this.mmdContext?.systemId,
      subsystemId: selection['subsystem'] || this.mmdContext?.subsystemId,
      subSubSystemId:
        selection['sub_sub_system'] || this.mmdContext?.subSubSystemId,
      subSubSystemLabel:
        subSubSystemOption?.label ||
        this.mmdContext?.subSubSystemLabel ||
        resolveCatalogueSubSubSystemLabel(row) ||
        undefined,
      mmdType: mmdType || undefined,
      catalogueRow: row,
    };
    this.refreshRepairPrefillContext();

    this.form.patchValue(
      {
        mmd_identification_number: resolveCatalogueMmdIdentificationNumber(row),
      },
      { emitEvent: false },
    );

    if (this.isRestorationType) {
      this.reloadLastWorkingBackupFromForm();
    }

    this.cdr.detectChanges();
  }

  private clearAvailableBackupState(): void {
    this.availableBackupRows = [];
    this.selectedAvailableBackupIndex = null;
    this.preferredBackupMarked = false;
  }

  private clearLastWorkingBackupState(): void {
    this.lastWorkingBackup = {};
    this.lastWorkingBackupRow = null;
  }

  private markPreferredBackup(message: string): void {
    this.preferredBackupMarked = true;
    this.toast.showSuccess(message);
    this.cdr.detectChanges();
  }

  private clearSelectedMmdDetails(): void {
    this.mmdDetails = {};
    this.selectedMmdContext = null;
    this.clearLastWorkingBackupState();
    this.form.patchValue(
      { mmd_identification_number: '' },
      { emitEvent: false },
    );
  }

  private resolveUserShipId(): string {
    const fromUser = getUserShipId();
    if (fromUser) {
      return fromUser;
    }

    const fromContext =
      this.selectedMmdContext?.shipId || this.mmdContext?.shipId || '';
    if (fromContext) {
      return String(fromContext);
    }

    if (this.shipOptions.length === 1) {
      return String(this.shipOptions[0].value);
    }

    const shipName = getUserShipName().trim().toLowerCase();
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

  private setupMmdSelectionListeners(): void {
    const selectionGroup = this.form.get('mmd_selection');
    if (!selectionGroup) {
      return;
    }

    selectionGroup
      .get('department')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((departmentId) => {
        if (this.prefillingMmdSelection) {
          return;
        }

        selectionGroup.patchValue(
          {
            system: '',
            subsystem: '',
            sub_sub_system: '',
            mmd: '',
          },
          { emitEvent: false },
        );
        this.mmdSubsystemOptions = [];
        this.mmdSubSubSystemOptions = [];
        this.mmdSelectOptions = [];
        this.selectionCatalogueRows = [];
        this.clearSelectedMmdDetails();

        if (departmentId) {
          void this.loadMmdSystemOptions(String(departmentId));
        } else {
          void this.loadMmdSystemOptions();
        }
        this.refreshRepairPrefillContext();
        this.cdr.detectChanges();
      });

    selectionGroup
      .get('system')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((systemId) => {
        if (this.prefillingMmdSelection) {
          return;
        }

        selectionGroup.patchValue(
          { subsystem: '', sub_sub_system: '', mmd: '' },
          { emitEvent: false },
        );
        this.mmdSubSubSystemOptions = [];
        this.mmdSelectOptions = [];
        this.selectionCatalogueRows = [];
        this.clearSelectedMmdDetails();

        if (systemId) {
          void this.loadMmdSubsystemOptions(String(systemId));
          // MMD options load as soon as System is selected.
          void this.loadMmdSelectOptions(
            this.resolveUserShipId() || undefined,
            String(systemId),
          );
        } else {
          this.mmdSubsystemOptions = [];
        }
        this.refreshRepairPrefillContext();
        this.cdr.detectChanges();
      });

    selectionGroup
      .get('subsystem')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((subsystemId) => {
        if (this.prefillingMmdSelection) {
          return;
        }

        selectionGroup.patchValue(
          { sub_sub_system: '', mmd: '' },
          { emitEvent: false },
        );
        this.mmdSelectOptions = [];
        this.selectionCatalogueRows = [];
        this.clearSelectedMmdDetails();

        const shipId = this.resolveUserShipId();
        const systemId = selectionGroup.get('system')?.value;
        if (subsystemId) {
          void this.loadMmdSubSubSystemOptions(String(subsystemId));
        } else {
          this.mmdSubSubSystemOptions = [];
        }
        // Refresh MMD list with optional subsystem filter.
        if (systemId) {
          void this.loadMmdSelectOptions(
            shipId || undefined,
            String(systemId),
            subsystemId ? String(subsystemId) : undefined,
          );
        }
        this.refreshRepairPrefillContext();
        this.cdr.detectChanges();
      });

    selectionGroup
      .get('sub_sub_system')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((subSubSystemId) => {
        if (this.prefillingMmdSelection) {
          return;
        }

        selectionGroup.patchValue({ mmd: '' }, { emitEvent: false });
        this.mmdSelectOptions = [];
        this.selectionCatalogueRows = [];
        this.clearSelectedMmdDetails();

        const shipId = this.resolveUserShipId();
        const systemId = selectionGroup.get('system')?.value;
        const subsystemId = selectionGroup.get('subsystem')?.value;
        if (systemId) {
          void this.loadMmdSelectOptions(
            shipId || undefined,
            String(systemId),
            subsystemId ? String(subsystemId) : undefined,
            subSubSystemId ? String(subSubSystemId) : undefined,
          );
        }
        this.refreshRepairPrefillContext();
        this.cdr.detectChanges();
      });

    selectionGroup
      .get('mmd')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((selected) => {
        if (this.prefillingMmdSelection) {
          return;
        }

        if (!selected) {
          this.clearSelectedMmdDetails();
          this.refreshRepairPrefillContext();
          this.cdr.detectChanges();
          return;
        }

        const row = findCatalogueRowBySelection(
          this.selectionCatalogueRows,
          selected,
        );
        if (row) {
          this.applySelectedCatalogueRow(
            row,
            String(row['mmd_type'] ?? selected),
          );
        } else {
          this.clearSelectedMmdDetails();
          this.refreshRepairPrefillContext();
          this.cdr.detectChanges();
        }
      });
  }

  private loadMmdLookupOptions(): Promise<void> {
    const lookupConfig = { labelKey: 'name', valueKey: 'id' } as const;

    this.mmdLookupsReady = new Promise((resolve) => {
      forkJoin({
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
      })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (options) => {
            setCatalogueMmdLookupOptions({
              mmdType: options.mmdType.map((option) => ({
                label: option.label,
                value: String(option.value),
              })),
              mmdSize: options.mmdSize.map((option) => ({
                label: option.label,
                value: String(option.value),
              })),
            });
            this.refreshMappedMmdSelectOptions();
            this.cdr.detectChanges();
            resolve();
          },
          error: () => resolve(),
        });
    });

    return this.mmdLookupsReady;
  }

  /** Re-map MMD option labels / backup displays after master lookups arrive. */
  private refreshMappedMmdSelectOptions(): void {
    if (this.selectionCatalogueRows.length) {
      this.mmdSelectOptions = mapCatalogueRowsToMmdOptions(
        this.selectionCatalogueRows,
      );
    }

    this.preferenceCascadeState.forEach((state) => {
      if (state.catalogueRows.length) {
        state.mmdOptions = mapCatalogueRowsToMmdOptions(state.catalogueRows);
      }
    });

    if (this.lastWorkingBackupRow) {
      this.lastWorkingBackup = mapLastAvailableBackupToDisplay(
        this.lastWorkingBackupRow,
      );
    }
  }

  private loadMmdDepartmentOptions(): void {
    this.apiService
      .getDropdownData('master/departments/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe({
        next: (options) => {
          this.mmdDepartmentOptions = options.map((option) => ({
            label: option.label,
            value: String(option.value),
          }));
          this.cdr.detectChanges();
        },
        error: () => {
          this.mmdDepartmentOptions = [];
          this.cdr.detectChanges();
        },
      });
  }

  private loadMmdSystemOptions(departmentId?: string): Promise<void> {
    return new Promise((resolve) => {
      const shipId = this.resolveUserShipId();
      const params: Record<string, string> = {};
      if (shipId) {
        params['ship_id'] = shipId;
      }
      if (departmentId) {
        params['section__department_id'] = departmentId;
      }

      this.apiService
        .getDropdownData(
          'master/systems/',
          { labelKey: 'name', valueKey: 'id' },
          Object.keys(params).length ? params : undefined,
        )
        .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
        .subscribe({
          next: (options) => {
            this.mmdSystemOptions = options.map((option) => ({
              label: option.label,
              value: String(option.value),
            }));
            this.cdr.detectChanges();
            resolve();
          },
          error: () => {
            this.mmdSystemOptions = [];
            this.cdr.detectChanges();
            resolve();
          },
        });
    });
  }

  private loadMmdSubsystemOptions(systemId: string): Promise<void> {
    return new Promise((resolve) => {
      this.apiService
        .getDropdownData(
          'master/subsystems/',
          { labelKey: 'name', valueKey: 'id' },
          { system: systemId },
        )
        .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
        .subscribe({
          next: (options) => {
            this.mmdSubsystemOptions = options.map((option) => ({
              label: option.label,
              value: String(option.value),
            }));
            this.cdr.detectChanges();
            resolve();
          },
          error: () => {
            this.mmdSubsystemOptions = [];
            this.cdr.detectChanges();
            resolve();
          },
        });
    });
  }

  private loadMmdSubSubSystemOptions(subsystemId: string): Promise<void> {
    return new Promise((resolve) => {
      this.apiService
        .getDropdownData(
          'master/sub-sub-system/',
          { labelKey: 'name', valueKey: 'id' },
          { sub_system: subsystemId },
        )
        .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
        .subscribe({
          next: (options) => {
            this.mmdSubSubSystemOptions = options.map((option) => ({
              label: option.label,
              value: String(option.value),
            }));
            this.cdr.detectChanges();
            resolve();
          },
          error: () => {
            this.mmdSubSubSystemOptions = [];
            this.cdr.detectChanges();
            resolve();
          },
        });
    });
  }

  private loadMmdSelectOptions(
    shipId: string | undefined,
    systemId?: string,
    subsystemId?: string,
    subSubSystemId?: string,
  ): Promise<void> {
    const params: Record<string, string> = {};
    if (shipId) {
      params['ship_id'] = shipId;
    }
    if (systemId) {
      params['system_id'] = systemId;
    }
    if (subsystemId) {
      params['subsystem_id'] = subsystemId;
    }
    if (subSubSystemId) {
      params['sub_sub_system_id'] = subSubSystemId;
    }
    // Include Approved / Pending / Rejected (do not restrict to approved only).
    params['approved'] = '1,2,3';

    if (!shipId && !systemId && !subsystemId && !subSubSystemId) {
      this.selectionCatalogueRows = [];
      this.mmdSelectOptions = [];
      return Promise.resolve();
    }

    this.mmdSelectionLoading = true;
    this.cdr.detectChanges();

    return new Promise((resolve) => {
      void this.mmdLookupsReady.finally(() => {
        this.apiService
          .get(SEG_CATALOGUES_API, params)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (response) => {
              this.selectionCatalogueRows = extractCatalogueApiRows(response);
              this.mmdSelectOptions = mapCatalogueRowsToMmdOptions(
                this.selectionCatalogueRows,
              );
              this.mmdSelectionLoading = false;
              this.cdr.detectChanges();
              resolve();
            },
            error: () => {
              this.selectionCatalogueRows = [];
              this.mmdSelectOptions = [];
              this.mmdSelectionLoading = false;
              this.cdr.detectChanges();
              resolve();
            },
          });
      });
    });
  }

  private reloadAvailableBackupsFromPreferences(): void {
    const index = this.restorationPreferences.controls.findIndex(
      (group) => !!group.get('ship')?.value && !!group.get('system')?.value,
    );
    if (index < 0) {
      this.clearAvailableBackupState();
      return;
    }

    const mmdType = this.restorationPreferences.at(index).get('mmd_type')?.value;
    void this.loadAvailableBackupsForPreference(
      index,
      mmdType != null && String(mmdType).trim() !== ''
        ? String(mmdType)
        : undefined,
    );
  }

  private reloadLastWorkingBackupFromForm(): void {
    if (!this.isRestorationType) {
      this.clearLastWorkingBackupState();
      return;
    }

    const selection =
      (this.form.get('mmd_selection')?.getRawValue() as Record<string, string>) ??
      {};
    const context = this.selectedMmdContext ?? this.mmdContext;
    const shipId =
      context?.shipId || this.resolveUserShipId() || undefined;
    const systemId = selection['system'] || context?.systemId || undefined;

    if (!shipId || !systemId) {
      this.clearLastWorkingBackupState();
      return;
    }

    const mmdSelection = selection['mmd'];
    const catalogueRow =
      context?.catalogueRow ??
      (mmdSelection
        ? findCatalogueRowBySelection(this.selectionCatalogueRows, mmdSelection)
        : null);
    const subsystemId =
      selection['subsystem'] || context?.subsystemId || undefined;
    const subSubSystemId =
      selection['sub_sub_system'] || context?.subSubSystemId || undefined;
    const subSubSystemOption = this.mmdSubSubSystemOptions.find(
      (option) => String(option.value) === String(subSubSystemId ?? ''),
    );
    const subSubSystemLabel =
      context?.subSubSystemLabel ||
      (subSubSystemOption?.label && subSubSystemOption.label !== '-'
        ? subSubSystemOption.label
        : undefined) ||
      resolveCatalogueSubSubSystemLabel(catalogueRow) ||
      undefined;
    const mmdType =
      context?.mmdType ||
      (catalogueRow ? String(catalogueRow['mmd_type'] ?? '') : '') ||
      mmdSelection ||
      undefined;

    this.fetchLastWorkingBackupFromForm(
      resolveLastAvailableBackupParams({
        shipId,
        systemId,
        subsystemId,
        subSubSystemLabel,
        mmdType: mmdType || undefined,
        catalogueRow,
      }),
    );
  }

  private loadAvailableBackupsForPreference(
    index: number,
    mmdType?: string,
  ): void {
    const group = this.restorationPreferences.at(index);
    const shipId = group.get('ship')?.value;
    const systemId = group.get('system')?.value;

    // Only ship + system are mandatory.
    if (!shipId || !systemId) {
      this.clearAvailableBackupState();
      return;
    }

    const selectedKey =
      mmdType ||
      (group.get('mmd_type')?.value != null
        ? String(group.get('mmd_type')?.value)
        : '');
    const catalogueRow = selectedKey
      ? this.findPreferenceCatalogueRow(index, selectedKey)
      : null;
    const resolvedMmdType = catalogueRow
      ? String(catalogueRow['mmd_type'] ?? '')
      : selectedKey;
    const subSubSystemId = group.get('sub_sub_system')?.value;
    const subSubSystemLabelRaw = resolveSelectLabel(
      this.preferenceCascadeState[index].subSubSystemOptions,
      subSubSystemId,
    );
    const subSubSystemLabel =
      subSubSystemLabelRaw && subSubSystemLabelRaw !== '-'
        ? subSubSystemLabelRaw
        : resolveCatalogueSubSubSystemLabel(catalogueRow) ||
          undefined;

    this.fetchAvailableBackups(
      resolveLastAvailableBackupParams({
        shipId,
        systemId,
        subsystemId: group.get('subsystem')?.value || undefined,
        subSubSystemLabel,
        mmdType: resolvedMmdType || undefined,
        catalogueRow,
      }),
    );
  }

  private findPreferenceCatalogueRow(
    index: number,
    selected: string,
  ): Record<string, unknown> | null {
    const rows = this.preferenceCascadeState[index].catalogueRows;
    const subSubSystemId =
      this.restorationPreferences.at(index).get('sub_sub_system')?.value;

    if (subSubSystemId) {
      const filtered = rows.filter((row) => {
        const equipmentId =
          row['equipment_id'] ??
          row['sub_sub_system_id'] ??
          row['equipment'];
        return String(equipmentId ?? '') === String(subSubSystemId);
      });
      return (
        findCatalogueRowBySelection(
          filtered.length ? filtered : rows,
          selected,
        ) ?? null
      );
    }

    return findCatalogueRowBySelection(rows, selected) ?? null;
  }

  /** Select Available Backup table — preference-driven; no auto-mark. */
  private fetchAvailableBackups(
    params: Record<string, string> | null,
  ): void {
    if (!params) {
      this.clearAvailableBackupState();
      return;
    }

    this.lastWorkingBackupLoading = true;
    this.apiService
      .get(SEG_LAST_AVAILABLE_BACKUP_API, params)
      .pipe(
        finalize(() => {
          this.lastWorkingBackupLoading = false;
          this.cdr.detectChanges();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (response) => {
          const backupRows = extractLastAvailableBackupRows(response);
          this.availableBackupRows = backupRows;
          // Do not auto-mark — user must click Select.
          this.selectedAvailableBackupIndex = null;
          this.cdr.detectChanges();
        },
        error: () => {
          this.clearAvailableBackupState();
          this.cdr.detectChanges();
        },
      });
  }

  /** Last Working Backup — driven by form MMD selection IDs. */
  private fetchLastWorkingBackupFromForm(
    params: Record<string, string> | null,
  ): void {
    if (!params) {
      this.clearLastWorkingBackupState();
      return;
    }

    this.lastWorkingBackupLoading = true;
    this.apiService
      .get(SEG_LAST_AVAILABLE_BACKUP_API, params)
      .pipe(
        finalize(() => {
          this.lastWorkingBackupLoading = false;
          this.cdr.detectChanges();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (response) => {
          const backupRows = extractLastAvailableBackupRows(response);
          this.lastWorkingBackupRow = backupRows[0] ?? null;
          void this.mmdLookupsReady.finally(() => {
            this.lastWorkingBackup = this.lastWorkingBackupRow
              ? mapLastAvailableBackupToDisplay(this.lastWorkingBackupRow)
              : {};
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.clearLastWorkingBackupState();
          this.cdr.detectChanges();
        },
      });
  }

  private applyAvailableBackupToPreference(index: number): void {
    const row = this.availableBackupRows[index];
    if (!row) {
      return;
    }

    this.selectedAvailableBackupIndex = index;
    // Do not overwrite Last Working Backup — that comes from form MMD selection.
    void this.applyPreferenceValues(
      0,
      mapLastAvailableBackupToPreferenceValues(row),
    );
    this.cdr.detectChanges();
  }

  private async applyPreferenceValues(
    preferenceIndex: number,
    values: {
      ship: string;
      system: string;
      subsystem: string;
      sub_sub_system: string;
      mmd_type: string;
    },
  ): Promise<void> {
    const group = this.restorationPreferences.at(preferenceIndex);
    if (!group) {
      return;
    }

    if (values.ship) {
      await this.loadPreferenceSystems(preferenceIndex, values.ship);
    }
    if (values.system) {
      await this.loadPreferenceSubsystems(preferenceIndex, values.system);
    }
    if (values.system && values.subsystem) {
      await this.loadPreferenceSubSubSystems(
        preferenceIndex,
        values.system,
        values.subsystem,
      );
    }

    // If API returned a sub-sub-system label instead of id, resolve to option value.
    let subSubSystemValue = values.sub_sub_system;
    if (subSubSystemValue) {
      const options =
        this.preferenceCascadeState[preferenceIndex].subSubSystemOptions;
      const byValue = options.find(
        (option) => String(option.value) === String(subSubSystemValue),
      );
      if (!byValue) {
        const byLabel = options.find(
          (option) =>
            option.label.trim().toLowerCase() ===
            String(subSubSystemValue).trim().toLowerCase(),
        );
        if (byLabel) {
          subSubSystemValue = String(byLabel.value);
        }
      }
    }

    if (values.ship && values.system) {
      await this.loadPreferenceMmdOptions(
        preferenceIndex,
        values.ship,
        values.system,
        values.subsystem || undefined,
        subSubSystemValue || undefined,
      );
    }

    let mmdValue = values.mmd_type;
    if (mmdValue) {
      const row = findCatalogueRowBySelection(
        this.preferenceCascadeState[preferenceIndex].catalogueRows,
        mmdValue,
      );
      if (row) {
        mmdValue = resolveCatalogueRowOptionValue(row);
      }
    }

    group.patchValue(
      {
        ship: values.ship,
        system: values.system,
        subsystem: values.subsystem,
        sub_sub_system: subSubSystemValue,
        mmd_type: mmdValue,
      },
      { emitEvent: false },
    );
    this.cdr.detectChanges();
  }

  private loadShipOptions(): void {
    this.apiService
      .getDropdownData('master/ships/', { labelKey: 'name', valueKey: 'id' })
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe({
        next: (options) => {
          this.shipOptions = options.map((option) => ({
            label: option.label,
            value: String(option.value),
          }));
          this.refreshRepairPrefillContext();
          this.cdr.detectChanges();
        },
        error: () => {
          this.shipOptions = [];
          this.refreshRepairPrefillContext();
          this.cdr.detectChanges();
        },
      });
  }

  private setupPreferenceListeners(): void {
    this.restorationPreferences.controls.forEach((group, index) => {
      group
        .get('ship')
        ?.valueChanges.pipe(takeUntil(this.destroy$))
        .subscribe((shipId) => {
          group.patchValue(
            { system: '', subsystem: '', sub_sub_system: '', mmd_type: '' },
            { emitEvent: false },
          );
          this.preferenceCascadeState[index].subsystemOptions = [];
          this.preferenceCascadeState[index].subSubSystemOptions = [];
          this.preferenceCascadeState[index].mmdOptions = [];
          this.preferenceCascadeState[index].catalogueRows = [];
          this.clearAvailableBackupState();
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
          group.patchValue(
            { subsystem: '', sub_sub_system: '', mmd_type: '' },
            { emitEvent: false },
          );
          this.preferenceCascadeState[index].subSubSystemOptions = [];
          this.preferenceCascadeState[index].mmdOptions = [];
          this.preferenceCascadeState[index].catalogueRows = [];
          const shipId = group.get('ship')?.value;
          if (systemId) {
            void this.loadPreferenceSubsystems(index, systemId);
            // Load MMD + available backups as soon as ship + system are selected.
            if (shipId) {
              void this.loadPreferenceMmdOptions(
                index,
                String(shipId),
                String(systemId),
              );
            }
            void this.loadAvailableBackupsForPreference(index);
          } else {
            this.preferenceCascadeState[index].subsystemOptions = [];
            this.clearAvailableBackupState();
          }
          this.cdr.detectChanges();
        });

      group
        .get('subsystem')
        ?.valueChanges.pipe(takeUntil(this.destroy$))
        .subscribe((subsystemId) => {
          group.patchValue(
            { sub_sub_system: '', mmd_type: '' },
            { emitEvent: false },
          );
          this.preferenceCascadeState[index].mmdOptions = [];
          this.preferenceCascadeState[index].catalogueRows = [];
          const shipId = group.get('ship')?.value;
          const systemId = group.get('system')?.value;
          if (systemId && subsystemId) {
            void this.loadPreferenceSubSubSystems(
              index,
              String(systemId),
              String(subsystemId),
            );
          } else {
            this.preferenceCascadeState[index].subSubSystemOptions = [];
          }
          // Refresh MMD with optional subsystem filter (ship + system still enough).
          if (shipId && systemId) {
            void this.loadPreferenceMmdOptions(
              index,
              String(shipId),
              String(systemId),
              subsystemId ? String(subsystemId) : undefined,
            );
          }
          void this.loadAvailableBackupsForPreference(index);
          this.cdr.detectChanges();
        });

      group
        .get('sub_sub_system')
        ?.valueChanges.pipe(takeUntil(this.destroy$))
        .subscribe((subSubSystemId) => {
          group.patchValue({ mmd_type: '' }, { emitEvent: false });
          this.preferenceCascadeState[index].mmdOptions = [];
          this.preferenceCascadeState[index].catalogueRows = [];
          const shipId = group.get('ship')?.value;
          const systemId = group.get('system')?.value;
          const subsystemId = group.get('subsystem')?.value;
          if (shipId && systemId) {
            void this.loadPreferenceMmdOptions(
              index,
              String(shipId),
              String(systemId),
              subsystemId ? String(subsystemId) : undefined,
              subSubSystemId ? String(subSubSystemId) : undefined,
            );
          }
          void this.loadAvailableBackupsForPreference(index);
          this.cdr.detectChanges();
        });

      group
        .get('mmd_type')
        ?.valueChanges.pipe(takeUntil(this.destroy$))
        .subscribe((mmdType) => {
          void this.loadAvailableBackupsForPreference(
            index,
            mmdType != null && String(mmdType).trim() !== ''
              ? String(mmdType)
              : undefined,
          );
          this.cdr.detectChanges();
        });
    });
  }

  private loadPreferenceSystems(
    index: number,
    shipId: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.apiService
        .getDropdownData(
          'master/systems/',
          { labelKey: 'name', valueKey: 'id' },
          { ship: shipId },
        )
        .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
        .subscribe({
          next: (options) => {
            this.preferenceCascadeState[index].systemOptions = options.map(
              (option) => ({
                label: option.label,
                value: String(option.value),
              }),
            );
            this.cdr.detectChanges();
            resolve();
          },
          error: () => {
            this.preferenceCascadeState[index].systemOptions = [];
            this.cdr.detectChanges();
            resolve();
          },
        });
    });
  }

  private loadPreferenceSubsystems(
    index: number,
    systemId: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.apiService
        .getDropdownData(
          'master/subsystems/',
          { labelKey: 'name', valueKey: 'id' },
          { system: systemId },
        )
        .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
        .subscribe({
          next: (options) => {
            this.preferenceCascadeState[index].subsystemOptions = options.map(
              (option) => ({
                label: option.label,
                value: String(option.value),
              }),
            );
            this.cdr.detectChanges();
            resolve();
          },
          error: () => {
            this.preferenceCascadeState[index].subsystemOptions = [];
            this.cdr.detectChanges();
            resolve();
          },
        });
    });
  }

  private loadPreferenceSubSubSystems(
    index: number,
    _systemId: string,
    subsystemId: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.apiService
        .getDropdownData(
          'master/sub-sub-system/',
          { labelKey: 'name', valueKey: 'id' },
          { sub_system: subsystemId },
        )
        .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
        .subscribe({
          next: (options) => {
            this.preferenceCascadeState[index].subSubSystemOptions =
              options.map((option) => ({
                label: option.label,
                value: String(option.value),
              }));
            this.cdr.detectChanges();
            resolve();
          },
          error: () => {
            this.preferenceCascadeState[index].subSubSystemOptions = [];
            this.cdr.detectChanges();
            resolve();
          },
        });
    });
  }

  private loadPreferenceMmdOptions(
    index: number,
    shipId: string,
    systemId: string,
    subsystemId?: string,
    subSubSystemId?: string,
  ): Promise<void> {
    if (!shipId || !systemId) {
      this.preferenceCascadeState[index].catalogueRows = [];
      this.preferenceCascadeState[index].mmdOptions = [];
      return Promise.resolve();
    }

    this.catalogueLoading = true;
    this.cdr.detectChanges();

    const params: Record<string, string> = {
      ship_id: shipId,
      system_id: systemId,
      // Include Approved / Pending / Rejected catalogues.
      approved: '1,2,3',
    };
    if (subsystemId) {
      params['subsystem_id'] = subsystemId;
    }
    if (subSubSystemId) {
      params['sub_sub_system_id'] = subSubSystemId;
    }

    return new Promise((resolve) => {
      void this.mmdLookupsReady.finally(() => {
        this.apiService
          .get(SEG_CATALOGUES_API, params)
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
    });
  }
}
