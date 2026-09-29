import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, merge, firstValueFrom } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { FormApiService } from '../../../angulerFromconverting/form-api.service';
import { FormCardComponent } from '../../../ui/form-card/form-card.component';
import { LoadingButtonComponent } from '../../../ui/loading-button.component';
import { ToastService } from '../../../services/toast.service';
import { ApiService } from '../../../api.service';

import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../trial-route-prefill';
import { CalenderComponent } from '../../../ui/calender.component';
import { FileUploadComponent } from '../../../ui/file-upload/file-upload.component';
import { InputComponent } from '../../../ui/input.component';
import { SelectComponent, SelectOption } from '../../../ui/select.component';
import { TextareaComponent } from '../../../ui/textarea';
import { EtmaProformaTableComponent } from '../etma-proforma-table/etma-proforma-table.component';
import {
  SteadyStateLoadRow,
  STEADY_STATE_LOAD_ROWS,
  TRANSIENT_TEST_LOAD_ROWS,
} from './load-trial-proforma-da.data';
import {
  GOVERNOR_RANGE_LOAD_ROWS,
  GOVERNOR_RATE_LOAD_ROWS,
  GOVERNOR_RATE_PERMISSIBLE_LIMIT,
  ALL_SPEED_TRANSIENT_SUBSECTIONS,
  getGovernorTransientCategoryTables,
  normalizeGovernorEquipmentType,
  VOLTAGE_BALANCE_LOAD_ROWS,
  VOLTAGE_RANGE_GROUPS,
  VOLTAGE_RANGE_LOAD_ROWS,
  VOLTAGE_STEADY_STATE_LOAD_ROWS,
  VOLTAGE_TRANSIENT_LOAD_ROWS,
  SpeedTransientSubsection,
} from './load-trial-proforma-da.extended.data';
import {
  DA_PANEL_COLUMNS,
  DA_PANEL_SECTIONS,
  EQUIPMENT_DETAILS_GROUPS,
  INSULATION_RESISTANCE_ROWS,
  INSTRUMENTATION_COLUMNS,
  INSTRUMENTATION_SECTIONS,
  MISCELLANEOUS_COLUMNS,
  MISCELLANEOUS_SECTIONS,
  PROTECTION_CHECK_COLUMNS,
  PROTECTION_CHECK_SECTIONS,
} from './load-trial-proforma-da.table-config';
import {
  STEADY_STATE_ROW_INDEX,
  calculateFrequencyModulation,
  calculateGovernorDroop,
  calculateGovernorRangeLimits,
  calculateParallelingSharing,
  calculatePeakPercent,
  calculateRecoveryFinalValue,
  calculateVoltageBalanceDifference,
  calculateVoltageBalancePermissibleLimit,
  calculateVoltageModulation,
  calculateVoltageRangeBounds,
  calculateVoltageRecoveryFinalValue,
  evaluateFrequencyModulationStatus,
  evaluateGovernorDroopStatus,
  evaluateGovernorRangeStatus,
  evaluateGovernorRateStatus,
  evaluateParallelingSharingStatus,
  evaluateSpeedTransient25PercentStatus,
  evaluateSpeedTransientSubsectionStatus,
  evaluateVoltageBalanceStatus,
  evaluateVoltageModulationStatus,
  evaluateVoltageRangeStatus,
  evaluateVoltageTransientStatus,
  formatGovernorRangePermissibleLimit,
  formatVoltageRangeDisplayedLimits,
  governorMotorRateBand,
  isElectronicGovernor,
  isFilledNonZeroFrequency,
  isVoltageMotorStartRow,
  parseFrequency,
  parsePercentLabel,
  roundFrequencyCalculation,
  speedTransientPeakLimitPercent,
  ELECTRONIC_SPEED_TRANSIENT_PEAK_LIMIT_PERCENT,
} from './load-trial-proforma-da.calculations';
import {
  buildLoadTrialProformaDaPayload,
  legacyPayloadToDaFormFill,
} from './load-trial-proforma-da.payload';
import { getUserSatelliteUnitId } from '../../../../../../shared/utils/user-satellite-unit';

@Component({
  selector: 'app-load-trial-proforma-da',
  standalone: true,
  host: {
    class: 'flex min-h-0 min-w-0 flex-1 flex-col self-stretch',
  },
  templateUrl: './load-trial-proforma-da.html',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    InputComponent,
    SelectComponent,
    CalenderComponent,
    FileUploadComponent,
    TextareaComponent,
    EtmaProformaTableComponent,
  ],
  styleUrl: './load-trial-proforma-da.css',
})
export class LoadTrialProformaDa implements OnInit, AfterViewInit, OnDestroy {


  form: FormGroup;
  draftLoading = false;
  submitLoading = false;
  workflowTrialId: string | undefined = undefined;
  showDecisionPopup = false;
  decisionLoading = false;


  saveLoading = false;

  get canEditForm(): boolean {
    return this.formApiService?.context?.workflow_rights?.can_edit === true;
  }

  get canShowSaveDraft(): boolean {
    if (!this.canEditForm) return false;
    const raw =
      this.formApiService?.context?.workflow_rights?.save_draft ??
      this.formApiService?.context?.save_draft;
    return raw === true || raw === 'true' || raw === 1 || raw === '1';
  }

  eqpList: any[] = [];
  activeTab: any = null;

  get headerEquipmentTabs(): any[] {
    if (this.eqpList.length) return this.eqpList;

    const contextEquipments = this.formApiService?.context?.equipment_details;
    if (Array.isArray(contextEquipments) && contextEquipments.length) {
      return contextEquipments;
    }

    return this.formApiService?.currentEquipmentNomenclature
      ? [this.formApiService.currentEquipmentNomenclature]
      : [];
  }

  get activeHeaderEquipment(): any {
    return this.activeTab || this.formApiService?.currentEquipmentNomenclature || null;
  }

  get activeEquipmentId(): number | null {
    return this.activeHeaderEquipment?.equipment_id ?? this.activeHeaderEquipment?.id ?? null;
  }

  trackByEquipment(_: number, equipment: any): string | number {
    return equipment?.equipment_id ?? equipment?.id ?? equipment?.nomenclature ?? _;
  }

  isSameEquipment(left: any, right: any): boolean {
    return (
      (left?.equipment_id ?? left?.id ?? left?.nomenclature) ===
      (right?.equipment_id ?? right?.id ?? right?.nomenclature)
    );
  }

  isGovernorTableTransitioning = false;
  private governorTransitionTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly speedControlSubscriptions: Subscription[] = [];
  private readonly transientTestSubscriptions: Subscription[] = [];
  private readonly voltageControlSubscriptions: Subscription[] = [];

  readonly totalPages = 2;
  currentPage = 1;

  testEquipmentOptions: SelectOption[] = [
    { label: 'Select Test Equipment', value: '' },
  ];
  parallelingEquipmentOptions: SelectOption[] = [
    { label: 'Select Equipment', value: '' },
  ];

  readonly parallelingLoadRows = [
    { direction: 'increasing', directionLabel: 'Increasing Loads', percent: 20, directionStart: true },
    { direction: 'increasing', directionLabel: 'Increasing Loads', percent: 30, directionStart: false },
    { direction: 'increasing', directionLabel: 'Increasing Loads', percent: 45, directionStart: false },
    { direction: 'increasing', directionLabel: 'Increasing Loads', percent: 60, directionStart: false },
    { direction: 'increasing', directionLabel: 'Increasing Loads', percent: 75, directionStart: false },
    { direction: 'decreasing', directionLabel: 'Decreasing Loads', percent: 75, directionStart: true },
    { direction: 'decreasing', directionLabel: 'Decreasing Loads', percent: 60, directionStart: false },
    { direction: 'decreasing', directionLabel: 'Decreasing Loads', percent: 45, directionStart: false },
    { direction: 'decreasing', directionLabel: 'Decreasing Loads', percent: 30, directionStart: false },
    { direction: 'decreasing', directionLabel: 'Decreasing Loads', percent: 20, directionStart: false },
  ] as const;
  readonly parallelingSharingTables = [
    { kind: 'kw' as const, title: 'kW sharing' },
    { kind: 'kvar' as const, title: 'kVA sharing' },
  ];

  readonly equipmentDetailsGroups = EQUIPMENT_DETAILS_GROUPS;
  readonly insulationResistanceRows = INSULATION_RESISTANCE_ROWS;
  readonly protectionCheckColumns = PROTECTION_CHECK_COLUMNS;
  readonly protectionCheckSections = PROTECTION_CHECK_SECTIONS;
  readonly instrumentationColumns = INSTRUMENTATION_COLUMNS;
  readonly instrumentationSections = INSTRUMENTATION_SECTIONS;
  readonly daPanelColumns = DA_PANEL_COLUMNS;
  readonly daPanelSections = DA_PANEL_SECTIONS;
  readonly miscellaneousColumns = MISCELLANEOUS_COLUMNS;
  readonly miscellaneousSections = MISCELLANEOUS_SECTIONS;
  readonly steadyStateLoadRows = STEADY_STATE_LOAD_ROWS;
  readonly transientTestLoadRows = TRANSIENT_TEST_LOAD_ROWS;
  readonly governorRangeLoadRows = GOVERNOR_RANGE_LOAD_ROWS;
  readonly governorRateLoadRows = GOVERNOR_RATE_LOAD_ROWS;
  readonly governorRatePermissibleLimit = GOVERNOR_RATE_PERMISSIBLE_LIMIT;
  readonly voltageSteadyStateLoadRows = VOLTAGE_STEADY_STATE_LOAD_ROWS;
  readonly voltageTransientLoadRows = VOLTAGE_TRANSIENT_LOAD_ROWS;
  readonly voltageBalanceLoadRows = VOLTAGE_BALANCE_LOAD_ROWS;
  readonly voltageRangeGroups = VOLTAGE_RANGE_GROUPS;
  readonly voltageRangeLoadRows = VOLTAGE_RANGE_LOAD_ROWS;

  activeGovernorTab: 'governor1' | 'governor2' = 'governor1';
  activeAvrTab: 'avr1' | 'avr2' = 'avr1';
  parallelingTrial: 'yes' | 'no' | '' = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly cdr: ChangeDetectorRef,
    private readonly hostEl: ElementRef<HTMLElement>,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly toastService: ToastService,
    private readonly apiService: ApiService,
    public formApiService: FormApiService,
  ) {
    this.form = this.fb.group({
      trials_date: [null, Validators.required],
      da_ta: ['', Validators.required],
      kw: ['', Validators.required],
      ship: [{ value: '', disabled: true }],
      trial_report_no: [''],

      presented_by: ['', Validators.required],
      trial_date: [null, Validators.required],
      trial_undertaken_by: ['', Validators.required],
      occasion_of_current_trial: ['', Validators.required],
      date_of_last_trial: [null, Validators.required],
      proposal_reference: [null, Validators.required],
      file_reference: ['', Validators.required],
      reference_document_for_trial: [
        { value: 'Def Stan 08-142, EED-Q-242(R2) and BR 6500', disabled: true },
      ],

      test_equipment_used: ['', Validators.required],
      test_equipment_remarks: [''],

      engine_make: ['', Validators.required],
      engine_model_serial_no: ['', Validators.required],
      engine_rpm: ['', [Validators.required, Validators.min(0)]],

      governor_make: ['', Validators.required],
      governor_model_serial_no: ['', Validators.required],
      governor_type: ['', Validators.required],

      alternator_make_and_rating: ['', Validators.required],
      alternator_model_serial_no: ['', Validators.required],
      alternator_rated_voltage: ['', [Validators.required, Validators.min(0)]],
      alternator_rated_frequency: ['', [Validators.required, Validators.min(0)]],
      alternator_rated_kva_kw: ['', [Validators.required, Validators.min(0)]],
      alternator_rated_current: ['', [Validators.required, Validators.min(0)]],
      alternator_bearing_number: ['', Validators.required],

      avr_make_and_type: ['', Validators.required],
      avr_model_serial_no: ['', Validators.required],

      supply_breaker_make: ['', Validators.required],
      supply_breaker_model_serial_no: ['', Validators.required],
      supply_breaker_rated_capacity_amps: ['', [Validators.required, Validators.min(0)]],

      insulation_generator_hot: ['', [Validators.required, Validators.min(0)]],
      insulation_generator_cold: ['', [Validators.required, Validators.min(0)]],
      insulation_switchboard: ['', [Validators.required, Validators.min(0)]],
      insulation_generator_to_switchboard_cable: ['', [Validators.required, Validators.min(0)]],
      insulation_breaker: ['', [Validators.required, Validators.min(0)]],

      breaker_protection: this.fb.array(
        PROTECTION_CHECK_SECTIONS[0].rows.map(() => this.createProtectionRowGroup()),
      ),
      generator_switchboard_protection: this.fb.array(
        PROTECTION_CHECK_SECTIONS[1].rows.map(() => this.createProtectionRowGroup()),
      ),
      instrumentation: this.fb.array(
        INSTRUMENTATION_SECTIONS[0].rows.map(() => this.createInstrumentationRowGroup()),
      ),
      da_panel_checks: this.fb.array(
        DA_PANEL_SECTIONS[0].rows.map((row) =>
          this.createDaPanelRowGroup((row as { detailsType?: 'yes_no' }).detailsType),
        ),
      ),
      miscellaneous_checks: this.fb.array(
        MISCELLANEOUS_SECTIONS[0].rows.map((row) =>
          this.createMiscellaneousRowGroup(
            (row as { detailsType: 'text' | 'sat_unsat' | 'yes_no' | 'avl_na' | 'ops_non_ops' | 'date' })
              .detailsType,
          ),
        ),
      ),

      governor1_nominal_frequency: ['', [Validators.required, Validators.min(0)]],
      governor1_steady_state: this.fb.array(
        STEADY_STATE_LOAD_ROWS.map((row) => this.createSteadyStateRowGroup(row)),
      ),
      governor2_nominal_frequency: ['', [Validators.required, Validators.min(0)]],
      governor2_steady_state: this.fb.array(
        STEADY_STATE_LOAD_ROWS.map((row) => this.createSteadyStateRowGroup(row)),
      ),

      governor1_peak_permissible_limit: ['', [Validators.required, Validators.min(0)]],
      governor1_transient: this.fb.array(
        TRANSIENT_TEST_LOAD_ROWS.map(() => this.createTransientRowGroup()),
      ),
      governor2_peak_permissible_limit: ['', [Validators.required, Validators.min(0)]],
      governor2_transient: this.fb.array(
        TRANSIENT_TEST_LOAD_ROWS.map(() => this.createTransientRowGroup()),
      ),

      ...this.buildSpeedTransientSubsectionControls('governor1'),
      ...this.buildSpeedTransientSubsectionControls('governor2'),

      governor1_governor_range: this.fb.array(
        GOVERNOR_RANGE_LOAD_ROWS.map(() => this.createGovernorRangeRowGroup()),
      ),
      governor2_governor_range: this.fb.array(
        GOVERNOR_RANGE_LOAD_ROWS.map(() => this.createGovernorRangeRowGroup()),
      ),
      governor1_governor_rate: this.fb.array(
        GOVERNOR_RATE_LOAD_ROWS.map(() => this.createGovernorRateRowGroup()),
      ),
      governor2_governor_rate: this.fb.array(
        GOVERNOR_RATE_LOAD_ROWS.map(() => this.createGovernorRateRowGroup()),
      ),

      avr1_nominal_voltage: ['', [Validators.required, Validators.min(0)]],
      avr1_voltage_steady_state: this.fb.array(
        VOLTAGE_STEADY_STATE_LOAD_ROWS.map(() => this.createVoltageSteadyStateRowGroup()),
      ),
      avr1_voltage_permissible_limit: ['', [Validators.required, Validators.min(0)]],
      avr1_voltage_transient: this.fb.array(
        VOLTAGE_TRANSIENT_LOAD_ROWS.map(() => this.createVoltageTransientRowGroup()),
      ),
      avr1_voltage_balance: this.fb.array(
        VOLTAGE_BALANCE_LOAD_ROWS.map(() => this.createVoltageBalanceRowGroup()),
      ),
      avr1_voltage_range_avr: this.fb.array(
        VOLTAGE_RANGE_LOAD_ROWS.map(() => this.createVoltageRangeRowGroup()),
      ),
      avr1_voltage_range_hand: this.fb.array(
        VOLTAGE_RANGE_LOAD_ROWS.map(() => this.createVoltageRangeRowGroup()),
      ),
      avr1_voltage_range_permissible_limit: ['', [Validators.required, Validators.min(0)]],
      avr1_harmonic_content: ['', [Validators.required, Validators.min(0)]],

      avr2_nominal_voltage: ['', [Validators.required, Validators.min(0)]],
      avr2_voltage_steady_state: this.fb.array(
        VOLTAGE_STEADY_STATE_LOAD_ROWS.map(() => this.createVoltageSteadyStateRowGroup()),
      ),
      avr2_voltage_permissible_limit: ['', [Validators.required, Validators.min(0)]],
      avr2_voltage_transient: this.fb.array(
        VOLTAGE_TRANSIENT_LOAD_ROWS.map(() => this.createVoltageTransientRowGroup()),
      ),
      avr2_voltage_balance: this.fb.array(
        VOLTAGE_BALANCE_LOAD_ROWS.map(() => this.createVoltageBalanceRowGroup()),
      ),
      avr2_voltage_range_avr: this.fb.array(
        VOLTAGE_RANGE_LOAD_ROWS.map(() => this.createVoltageRangeRowGroup()),
      ),
      avr2_voltage_range_hand: this.fb.array(
        VOLTAGE_RANGE_LOAD_ROWS.map(() => this.createVoltageRangeRowGroup()),
      ),
      avr2_voltage_range_permissible_limit: ['', [Validators.required, Validators.min(0)]],
      avr2_harmonic_content: ['', [Validators.required, Validators.min(0)]],
      paralleling_combinations: this.fb.array([]),
    });

    this.setupSpeedControlCalculations('governor1');
    this.setupSpeedControlCalculations('governor2');
    this.setupTransientTestCalculations('governor1');
    this.setupTransientTestCalculations('governor2');
    this.setupSpeedTransientSubsectionCalculations('governor1');
    this.setupSpeedTransientSubsectionCalculations('governor2');
    this.setupGovernorAuxCalculations('governor1');
    this.setupGovernorAuxCalculations('governor2');
    this.setupVoltageControlCalculations('avr1');
    this.setupVoltageControlCalculations('avr2');
    this.transientTestSubscriptions.push(
      this.form.get('governor_type')!.valueChanges.subscribe(() => {
        this.updateSpeedTransientValidators();
      }),
    );
    this.updateSpeedTransientValidators();
    this.transientTestSubscriptions.push(
      this.parallelingCombinations.valueChanges.pipe(debounceTime(30)).subscribe(() => {
        this.refreshParallelingCalculations();
      }),
    );
  }

  ngOnInit(): void {
    this.loadParallelingEquipmentOptions();
    this.loadTestEquipmentOptions();
    void this.loadTrialPrefillFromQuery();
    this.refreshCalculatedFields();
  }

  ngAfterViewInit(): void {
    this.scheduleLayoutRefresh();
  }

  private loadParallelingEquipmentOptions(): void {
    this.apiService
      .getDropdownData<Record<string, any>>('master/equipments/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe({
        next: (options) => {
          this.parallelingEquipmentOptions = [
            { label: 'Select Equipment', value: '' },
            ...(options || []),
          ];
          this.cdr.markForCheck();
        },
        error: () => {
          this.parallelingEquipmentOptions = [{ label: 'Select Equipment', value: '' }];
          this.cdr.markForCheck();
        },
      });
  }

  private resolveSatelliteUnitId(source?: Record<string, any> | null): number | null {
    const context = this.formApiService?.context || {};
    const raw =
      source?.['satellite_unit_id'] ??
      source?.['satellite_unit'] ??
      context?.['satellite_unit_id'] ??
      context?.['satellite_unit'] ??
      getUserSatelliteUnitId();
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private loadTestEquipmentOptions(satelliteUnitId?: number | null): void {
    const params: Record<string, any> = {};
    const resolvedSatelliteUnitId = satelliteUnitId ?? this.resolveSatelliteUnitId();
    if (resolvedSatelliteUnitId != null) {
      params['satellite_unit'] = resolvedSatelliteUnitId;
    }
    this.apiService
      .getDropdownData<Record<string, any>>(
        'master/tools/',
        {
          labelKey: 'name',
          valueKey: 'id',
        },
        params,
      )
      .subscribe({
        next: (options) => {
          this.testEquipmentOptions = [
            { label: 'Select Test Equipment', value: '' },
            ...(options || []),
          ];
          this.cdr.markForCheck();
        },
        error: () => {
          this.testEquipmentOptions = [
            { label: 'Select Test Equipment', value: '' },
          ];
          this.toastService.showError('Failed to load test equipment options.');
          this.cdr.markForCheck();
        },
      });
  }

  private async loadTrialPrefillFromQuery(): Promise<void> {
    const trialId = resolveTrialQueryParam(this.route, this.router);
    if (!trialId) {
      this.scheduleLayoutRefresh();
      return;
    }
    this.workflowTrialId = trialId;

    try {
      const response = await this.formApiService.getForm(trialId);
      const trialRow = trialRowFromGetFormResponse(this.formApiService, response);

      this.eqpList = Array.isArray(trialRow?.equipment_details) ? trialRow.equipment_details : [];
      this.activeTab = this.formApiService.currentEquipmentNomenclature || this.eqpList[0] || null;
      if (this.activeTab) {
        this.formApiService.setCurrentEquipmentNomenclature(this.activeTab);
      }

      this.loadTestEquipmentOptions(
        this.resolveSatelliteUnitId(trialRow ?? (response as Record<string, any>)),
      );

      const equipmentPayload = this.extractEquipmentPayload(response);
      if (equipmentPayload) {
        this.fillData(equipmentPayload);
      } else if (response) {
        this.fillData(response);
      }
      this.scheduleLayoutRefresh();
    } catch (e) {
      console.error('Trial prefill failed (load trial proforma DA)', e);
      this.scheduleLayoutRefresh();
    }
  }

  /** Flex/percent height can stay at 0 until a window resize; force a layout pass after paint. */
  private scheduleLayoutRefresh(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const host = this.hostEl?.nativeElement;
        if (host) {
          void host.offsetHeight;
        }
        this.cdr.markForCheck();
      });
    });
  }

  ngOnDestroy(): void {
    if (this.governorTransitionTimer) {
      clearTimeout(this.governorTransitionTimer);
    }
    this.speedControlSubscriptions.forEach((sub) => sub.unsubscribe());
    this.transientTestSubscriptions.forEach((sub) => sub.unsubscribe());
    this.voltageControlSubscriptions.forEach((sub) => sub.unsubscribe());
  }

  get breakerProtection(): FormArray {
    return this.form.get('breaker_protection') as FormArray;
  }

  get generatorSwitchboardProtection(): FormArray {
    return this.form.get('generator_switchboard_protection') as FormArray;
  }

  get instrumentation(): FormArray {
    return this.form.get('instrumentation') as FormArray;
  }

  get daPanelChecks(): FormArray {
    return this.form.get('da_panel_checks') as FormArray;
  }

  get miscellaneousChecks(): FormArray {
    return this.form.get('miscellaneous_checks') as FormArray;
  }

  get governor1SteadyState(): FormArray {
    return this.form.get('governor1_steady_state') as FormArray;
  }

  get governor2SteadyState(): FormArray {
    return this.form.get('governor2_steady_state') as FormArray;
  }

  get activeNominalFrequencyControl(): string {
    return this.activeGovernorTab === 'governor1'
      ? 'governor1_nominal_frequency'
      : 'governor2_nominal_frequency';
  }

  get activeSteadyStateRows(): FormArray {
    return this.activeGovernorTab === 'governor1'
      ? this.governor1SteadyState
      : this.governor2SteadyState;
  }

  get parallelingCombinations(): FormArray {
    return this.form.get('paralleling_combinations') as FormArray;
  }

  // Old code:
  // parallelingSharingRows(combination: FormGroup, kind: 'kw' | 'kvar'): FormArray {
  //   return combination.get(`${kind}_rows`) as FormArray;
  // }
  parallelingSharingRows(combination: AbstractControl | FormGroup | any, kind: 'kw' | 'kvar'): FormArray {
    return (combination as FormGroup).get(`${kind}_rows`) as FormArray;
  }

  get activeNominalFrequencyFormControl(): FormControl {
    return this.form.get(this.activeNominalFrequencyControl) as FormControl;
  }

  activeSteadyStateRow(index: number): FormGroup {
    return this.activeSteadyStateRows.at(index) as FormGroup;
  }

  get governor1Transient(): FormArray {
    return this.form.get('governor1_transient') as FormArray;
  }

  get governor2Transient(): FormArray {
    return this.form.get('governor2_transient') as FormArray;
  }

  get activeTransientRows(): FormArray {
    return this.activeGovernorTab === 'governor1'
      ? this.governor1Transient
      : this.governor2Transient;
  }

  activeTransientRow(index: number): FormGroup {
    return this.activeTransientRows.at(index) as FormGroup;
  }

  get activePeakPermissibleLimitFormControl(): FormControl {
    return this.form.get(this.activePeakPermissibleLimitControl) as FormControl;
  }

  get activeTransientArrayName(): string {
    return this.activeGovernorTab === 'governor1'
      ? 'governor1_transient'
      : 'governor2_transient';
  }

  get activePeakPermissibleLimitControl(): string {
    return this.activeGovernorTab === 'governor1'
      ? 'governor1_peak_permissible_limit'
      : 'governor2_peak_permissible_limit';
  }

  get activeGovernorPrefix(): 'governor1' | 'governor2' {
    return this.activeGovernorTab;
  }

  get activeGovernorTransientTables() {
    return getGovernorTransientCategoryTables(
      normalizeGovernorEquipmentType(this.form.get('governor_type')?.value),
    );
  }

  get governorRangePermissibleLimit(): string {
    return formatGovernorRangePermissibleLimit(
      calculateGovernorRangeLimits(
        this.form.get('governor_type')?.value,
        parseFrequency(this.form.get('alternator_rated_frequency')?.value),
      ),
    );
  }

  get voltageRangeDisplayedLimits(): string {
    return formatVoltageRangeDisplayedLimits(
      parseFrequency(this.form.get('alternator_rated_voltage')?.value),
    );
  }

  get isPeakLimitAutomatic(): boolean {
    return speedTransientPeakLimitPercent(
      String(this.form.get('governor_type')?.value ?? ''),
      this.currentShipName(),
    ) !== null;
  }

  private currentShipName(): string {
    return String(
      this.form.get('ship')?.value || this.formApiService?.context?.ship_name || '',
    );
  }

  governorTransientArrayName(subsectionKey: string): string {
    return `${this.activeGovernorPrefix}_${subsectionKey}_transient`;
  }

  activeGovernorTransientRow(subsectionKey: string, index: number): FormGroup {
    return (this.form.get(this.governorTransientArrayName(subsectionKey)) as FormArray).at(index) as FormGroup;
  }

  governorPeakLimitFormControl(subsectionKey: string): FormControl {
    return this.form.get(this.governorPeakLimitControlName(subsectionKey)) as FormControl;
  }

  governorPeakLimitControlName(subsectionKey: string): string {
    return `${this.activeGovernorPrefix}_${subsectionKey}_peak_limit`;
  }

  get activeAvrPrefix(): 'avr1' | 'avr2' {
    return this.activeAvrTab;
  }

  get activeNominalVoltageControl(): string {
    return `${this.activeAvrPrefix}_nominal_voltage`;
  }

  get activeNominalVoltageFormControl(): FormControl {
    return this.form.get(this.activeNominalVoltageControl) as FormControl;
  }

  get activeVoltageSteadyStateArrayName(): string {
    return `${this.activeAvrPrefix}_voltage_steady_state`;
  }

  get activeVoltagePermissibleLimitControl(): string {
    return `${this.activeAvrPrefix}_voltage_permissible_limit`;
  }

  get activeVoltagePermissibleLimitFormControl(): FormControl {
    return this.form.get(this.activeVoltagePermissibleLimitControl) as FormControl;
  }

  get activeVoltageTransientArrayName(): string {
    return `${this.activeAvrPrefix}_voltage_transient`;
  }

  get activeVoltageBalanceArrayName(): string {
    return `${this.activeAvrPrefix}_voltage_balance`;
  }

  get activeVoltageRangePermissibleControl(): string {
    return `${this.activeAvrPrefix}_voltage_range_permissible_limit`;
  }

  get activeVoltageRangePermissibleFormControl(): FormControl {
    return this.form.get(this.activeVoltageRangePermissibleControl) as FormControl;
  }

  get activeHarmonicContentControl(): string {
    return `${this.activeAvrPrefix}_harmonic_content`;
  }

  get activeHarmonicContentFormControl(): FormControl {
    return this.form.get(this.activeHarmonicContentControl) as FormControl;
  }

  get activeGovernorRangeArrayName(): string {
    return `${this.activeGovernorPrefix}_governor_range`;
  }

  get activeGovernorRateArrayName(): string {
    return `${this.activeGovernorPrefix}_governor_rate`;
  }

  voltageRangeArrayName(groupKey: string): string {
    return `${this.activeAvrPrefix}_voltage_range_${groupKey}`;
  }

  activeGovernorRangeRow(index: number): FormGroup {
    return (this.form.get(this.activeGovernorRangeArrayName) as FormArray).at(index) as FormGroup;
  }

  activeGovernorRateRow(index: number): FormGroup {
    return (this.form.get(this.activeGovernorRateArrayName) as FormArray).at(index) as FormGroup;
  }

  activeVoltageSteadyStateRow(index: number): FormGroup {
    return (this.form.get(this.activeVoltageSteadyStateArrayName) as FormArray).at(index) as FormGroup;
  }

  activeVoltageTransientRow(index: number): FormGroup {
    return (this.form.get(this.activeVoltageTransientArrayName) as FormArray).at(index) as FormGroup;
  }

  activeVoltageBalanceRow(index: number): FormGroup {
    return (this.form.get(this.activeVoltageBalanceArrayName) as FormArray).at(index) as FormGroup;
  }

  activeVoltageRangeRow(groupKey: string, index: number): FormGroup {
    return (this.form.get(this.voltageRangeArrayName(groupKey)) as FormArray).at(index) as FormGroup;
  }

  setAvrTab(tab: 'avr1' | 'avr2'): void {
    this.activeAvrTab = tab;
  }

  setParallelingTrial(value: 'yes' | 'no'): void {
    this.parallelingTrial = value;
    if (value === 'yes') {
      if (this.parallelingCombinations.length === 0) {
        this.addParallelingCombination();
      }
      return;
    }
    this.parallelingCombinations.clear({ emitEvent: false });
  }

  openPreviousReport(): void {
    this.router.navigate(['/etma/load-trial-proformaDa-report'], {
      queryParams: this.route.snapshot.queryParams,
    });
  }

  setAnotherParallelingCombination(index: number, value: 'yes' | 'no'): void {
    if (value === 'yes') {
      if (index === this.parallelingCombinations.length - 1) {
        this.addParallelingCombination();
      }
      return;
    }

    while (this.parallelingCombinations.length > index + 1) {
      this.parallelingCombinations.removeAt(this.parallelingCombinations.length - 1, {
        emitEvent: false,
      });
    }
  }

  addParallelingCombination(initialValue?: Record<string, any>): void {
    this.parallelingCombinations.push(
      this.createParallelingCombinationGroup(initialValue),
      { emitEvent: false },
    );
    this.refreshParallelingCalculations();
  }

  private createParallelingCombinationGroup(initialValue?: Record<string, any>): FormGroup {
    const group = this.fb.group({
      machine_1: [initialValue?.['machine_1'] ?? '', Validators.required],
      machine_2: [initialValue?.['machine_2'] ?? '', Validators.required],
      rated_dg1: [initialValue?.['rated_dg1'] ?? '', [Validators.required, Validators.min(0)]],
      rated_dg2: [initialValue?.['rated_dg2'] ?? '', [Validators.required, Validators.min(0)]],
      amps_dg1: [initialValue?.['amps_dg1'] ?? '', [Validators.required, Validators.min(0)]],
      amps_dg2: [initialValue?.['amps_dg2'] ?? '', [Validators.required, Validators.min(0)]],
      kw_tolerance: [{ value: initialValue?.['kw_tolerance'] ?? '', disabled: true }],
      kvar_tolerance: [{ value: initialValue?.['kvar_tolerance'] ?? '', disabled: true }],
      kw_rows: this.fb.array(
        this.parallelingLoadRows.map((_, index) =>
          this.createParallelingSharingRowGroup(initialValue?.['kw_rows']?.[index]),
        ),
      ),
      kvar_rows: this.fb.array(
        this.parallelingLoadRows.map((_, index) =>
          this.createParallelingSharingRowGroup(initialValue?.['kvar_rows']?.[index]),
        ),
      ),
    });
    return group;
  }

  private createParallelingSharingRowGroup(initialValue?: Record<string, any>): FormGroup {
    return this.fb.group({
      combined_load: [{ value: initialValue?.['combined_load'] ?? '', disabled: true }],
      proportionate_a: [{ value: initialValue?.['proportionate_a'] ?? '', disabled: true }],
      proportionate_b: [{ value: initialValue?.['proportionate_b'] ?? '', disabled: true }],
      actual_a: [initialValue?.['actual_a'] ?? '', [Validators.min(0)]],
      actual_b: [initialValue?.['actual_b'] ?? '', [Validators.min(0)]],
      difference: [{ value: initialValue?.['difference'] ?? '', disabled: true }],
      status: [{ value: initialValue?.['status'] ?? '', disabled: true }],
    });
  }

  private refreshParallelingCalculations(): void {
    this.parallelingCombinations.controls.forEach((control) => {
      const combination = control as FormGroup;
      const ratedKwA = this.optionalParallelNumber(combination.get('rated_dg1')?.value);
      const ratedKwB = this.optionalParallelNumber(combination.get('rated_dg2')?.value);
      const ratedAmpsA = this.optionalParallelNumber(combination.get('amps_dg1')?.value);
      const ratedAmpsB = this.optionalParallelNumber(combination.get('amps_dg2')?.value);

      const kwSample = calculateParallelingSharing(20, ratedKwA, ratedKwB, null, null);
      const kvaSample = calculateParallelingSharing(20, ratedAmpsA, ratedAmpsB, null, null);
      combination.get('kw_tolerance')?.setValue(
        this.parallelCalculatedValue(kwSample.toleranceBand),
        { emitEvent: false },
      );
      combination.get('kvar_tolerance')?.setValue(
        this.parallelCalculatedValue(kvaSample.toleranceBand),
        { emitEvent: false },
      );

      (['kw', 'kvar'] as const).forEach((kind) => {
        const ratedA = kind === 'kw' ? ratedKwA : ratedAmpsA;
        const ratedB = kind === 'kw' ? ratedKwB : ratedAmpsB;
        this.parallelingSharingRows(combination, kind).controls.forEach((rowControl, index) => {
          const row = rowControl as FormGroup;
          const percent = this.parallelingLoadRows[index].percent;
          const calculated = calculateParallelingSharing(
            percent,
            ratedA,
            ratedB,
            this.optionalParallelNumber(row.get('actual_a')?.value),
            this.optionalParallelNumber(row.get('actual_b')?.value),
          );
          row.patchValue({
            combined_load: this.parallelCalculatedValue(calculated.combinedVal),
            proportionate_a: this.parallelCalculatedValue(calculated.proportionateA),
            proportionate_b: this.parallelCalculatedValue(calculated.proportionateB),
            difference: this.parallelCalculatedValue(calculated.difference),
            status: evaluateParallelingSharingStatus(calculated.difference, calculated.toleranceBand),
          }, { emitEvent: false });
        });
      });
    });
  }

  private optionalParallelNumber(value: unknown): number | null {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parallelCalculatedValue(value: number | null): number | '' {
    return value === null ? '' : roundFrequencyCalculation(value);
  }

  goToPage(page: number): void {
    if (!Number.isFinite(page) || page < 1 || page > this.totalPages || page === this.currentPage) {
      return;
    }
    this.currentPage = page;
  }

  goToPreviousPage(): void {
    this.goToPage(this.currentPage - 1);
  }

  goToNextPage(): void {
    this.goToPage(this.currentPage + 1);
  }

  goToFirstPage(): void {
    this.goToPage(1);
  }

  goToLastPage(): void {
    this.goToPage(this.totalPages);
  }

  async setActiveTab(tab: any): Promise<void> {
    if (!tab || this.isSameEquipment(this.activeTab, tab)) return;

    this.activeTab = tab;
    this.formApiService.setCurrentEquipmentNomenclature(tab);

    if (!this.workflowTrialId) return;

    this.resetFormData();

    try {
      const nomenclature = this.formApiService.resolveNomenclature(tab);
      const response = await this.formApiService.getFormByEquipment(
        this.workflowTrialId,
        nomenclature,
      );
      const equipmentPayload = this.extractEquipmentPayload(response);
      if (equipmentPayload) {
        this.fillData(equipmentPayload);
      }
      this.scheduleLayoutRefresh();
    } catch (error) {
      console.error('Failed to load DA load trial data for selected equipment', error);
      this.toastService.showError('Failed to load selected equipment data.');
      this.scheduleLayoutRefresh();
    }
  }

  private extractEquipmentPayload(response: any): any {
    if (!response) return null;

    if (response?.data && typeof response.data === 'object') return response.data;
    if (response?.loadTrialPerformaDA) return response.loadTrialPerformaDA;

    let jsonData = response?.json_data ?? response?.jsonData ?? response?.formData ?? null;
    if (typeof jsonData === 'string') {
      try {
        jsonData = JSON.parse(jsonData);
      } catch {
        jsonData = null;
      }
    }

    if (!jsonData && this.looksLikeEquipmentMap(response)) {
      jsonData = response;
    }

    if (jsonData && typeof jsonData === 'object') {
      const nomenclature = this.formApiService?.currentEquipmentNomenclature;
      const resolved =
        typeof nomenclature === 'string'
          ? nomenclature
          : this.formApiService.resolveNomenclature(nomenclature);
      if (resolved && jsonData[resolved]) {
        return jsonData[resolved];
      }
      const firstKey = Object.keys(jsonData)[0];
      if (firstKey && jsonData[firstKey] && typeof jsonData[firstKey] === 'object') {
        return jsonData[firstKey];
      }
    }

    if (response?.formGroupKey) return response;
    return null;
  }

  private looksLikeEquipmentMap(obj: any): boolean {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    return Object.values(obj).some(
      (value: any) => value && typeof value === 'object' && 'formGroupKey' in value,
    );
  }

  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    this.form.reset(undefined, { emitEvent: false });
    this.form.patchValue(
      {
        reference_document_for_trial: 'Def Stan 08-142, EED-Q-242(R2) and BR 6500',
        ship,
      },
      { emitEvent: false },
    );

    this.parallelingCombinations.clear({ emitEvent: false });
    this.parallelingTrial = '';
    this.currentPage = 1;
    this.refreshCalculatedFields();
  }

  setGovernorTab(tab: 'governor1' | 'governor2'): void {
    if (this.activeGovernorTab === tab) return;
    if (this.governorTransitionTimer) {
      clearTimeout(this.governorTransitionTimer);
    }
    this.isGovernorTableTransitioning = true;
    this.activeGovernorTab = tab;
    this.governorTransitionTimer = setTimeout(() => {
      this.isGovernorTableTransitioning = false;
      this.governorTransitionTimer = null;
    }, 360);
  }

  @ViewChild('formCard') formCard!: FormCardComponent;

  async handleSave(type: 'clear' | 'draft' | 'save' | 'submit'): Promise<void> {
    if (type === 'clear') {
      this.form.reset();
      this.form.patchValue({
        reference_document_for_trial: 'Def Stan 08-142, EED-Q-242(R2) and BR 6500',
      });
      this.parallelingCombinations.clear({ emitEvent: false });
      this.parallelingTrial = '';
      this.currentPage = 1;
      this.refreshCalculatedFields();
      this.cdr.detectChanges();
      this.toastService.showSuccess('Form cleared successfully');
      return;
    }

    this.refreshCalculatedFields();

    if ((type === 'save' || type === 'submit') && this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError('Please fill all required fields correctly.');
      return;
    }

    const payload = buildLoadTrialProformaDaPayload(this.form, this.parallelingTrial);

    try {
      if (type === 'draft') {
        this.draftLoading = true;
        await firstValueFrom(this.formApiService.saveDraft(payload, this.workflowTrialId || ''));
        this.toastService.showSuccess('Draft saved successfully.');
      } else if (type === 'save') {
        this.saveLoading = true;
        await firstValueFrom(this.formApiService.submitForm(payload, this.workflowTrialId || ''));
        this.toastService.showSuccess('Form saved successfully.');
      } else if (type === 'submit') {
        this.submitLoading = true;
        this.formCard.isSubmitTimes = true;
        this.formCard.shouldShowUserPopup = true;
        await firstValueFrom(this.formApiService.submitForm(payload, this.workflowTrialId || ''));
        this.toastService.showSuccess('Form submitted successfully.');
      }
    } catch (error) {
      console.error('Load Trial Proforma DA save failed', error);
    } finally {
      this.draftLoading = false;
      this.saveLoading = false;
      this.submitLoading = false;
      this.cdr.markForCheck();
    }
  }

  //  fillData(payload: unknown): void {
  //   if (!payload) return;
  //     const { formPatch, parallelingTrial } = legacyPayloadToDaFormFill(payload);
  //     this.form.patchValue(formPatch);
  //     this.parallelingTrial = parallelingTrial;
  //   this.refreshCalculatedFields();
  //   this.cdr.detectChanges();
  // }
  fillData(payload: unknown): void {
    if (!payload) return;

    const { formPatch, parallelingTrial, parallelingCombinations } = legacyPayloadToDaFormFill(payload);

    this.form.patchValue(formPatch, { emitEvent: false });
    this.parallelingCombinations.clear({ emitEvent: false });
    parallelingCombinations.forEach((combination) => this.addParallelingCombination(combination));
    this.parallelingTrial = parallelingCombinations.length > 0 ? 'yes' : parallelingTrial;
    this.updateSpeedTransientValidators();
    this.form.patchValue({
      ship: this.formApiService?.context?.ship_name,
    });
    this.refreshCalculatedFields();
    this.scheduleLayoutRefresh();
  }

  closeSubmitDecisionPopup(): void {
    this.showDecisionPopup = false;
  }

  onDecisionSubmit(event: { decision: 'accept' | 'reject'; remarks: string }): void {
    this.decisionLoading = true;
    this.toastService.showSuccess(
      event.decision === 'accept' ? 'Decision accepted.' : 'Decision rejected.',
    );
    this.showDecisionPopup = false;
    this.decisionLoading = false;
  }

  private refreshCalculatedFields(): void {
    this.updateSpeedControlCalculations('governor1');
    this.updateSpeedControlCalculations('governor2');
    this.updateTransientTestCalculations('governor1');
    this.updateTransientTestCalculations('governor2');
    this.updateSpeedTransientSubsectionCalculations('governor1');
    this.updateSpeedTransientSubsectionCalculations('governor2');
    this.updateGovernorAuxCalculations('governor1');
    this.updateGovernorAuxCalculations('governor2');
    this.updateVoltageControlCalculations('avr1');
    this.updateVoltageControlCalculations('avr2');
    this.refreshParallelingCalculations();
  }

  private buildSpeedTransientSubsectionControls(
    governor: 'governor1' | 'governor2',
  ): Record<string, FormArray | ReturnType<FormBuilder['control']>> {
    const controls: Record<string, FormArray | ReturnType<FormBuilder['control']>> = {};
    for (const subsection of ALL_SPEED_TRANSIENT_SUBSECTIONS) {
      controls[`${governor}_${subsection.key}_transient`] = this.fb.array(
        subsection.rows.map(() => this.createTransientRowGroup()),
      );
      if (subsection.peakLimitInput) {
        controls[`${governor}_${subsection.key}_peak_limit`] = this.fb.control('', [
          Validators.required,
          Validators.min(0),
        ]);
      }
    }
    return controls;
  }

  /** Hidden type-specific rows must not keep the complete form invalid. */
  private updateSpeedTransientValidators(): void {
    const selectedType = normalizeGovernorEquipmentType(this.form.get('governor_type')?.value);
    const activeTables = getGovernorTransientCategoryTables(selectedType);
    const activeKeys = new Set(activeTables.map((table) => table.subsection.key));

    for (const governor of ['governor1', 'governor2'] as const) {
      for (const subsection of ALL_SPEED_TRANSIENT_SUBSECTIONS) {
        const active = activeKeys.has(subsection.key);
        const rows = this.form.get(`${governor}_${subsection.key}_transient`) as FormArray;
        for (const row of rows.controls) {
          for (const key of [
            'initial_speed_hz',
            'momentary_speed_hz',
            'final_speed_hz',
            'recovery_observed',
          ]) {
            const control = row.get(key);
            control?.setValidators(active ? [Validators.required, Validators.min(0)] : []);
            control?.updateValueAndValidity({ emitEvent: false });
          }
        }

        if (subsection.peakLimitInput) {
          const limit = this.form.get(`${governor}_${subsection.key}_peak_limit`);
          limit?.setValidators(active ? [Validators.required, Validators.min(0)] : []);
          limit?.updateValueAndValidity({ emitEvent: false });
        }
      }
    }
  }

  private createProtectionRowGroup(): FormGroup {
    return this.fb.group({
      calibration_date: [null, Validators.required],
      calibration_cert_provided: ['', Validators.required],
      observed_value: ['', [Validators.required, Validators.min(0)]],
      status: ['', Validators.required],
      remarks: [''],
      upload_file: [null],
    });
  }

  private createInstrumentationRowGroup(): FormGroup {
    return this.fb.group({
      ops_non_ops: ['', Validators.required],
      calibration_date: [null, Validators.required],
      calibration_cert_provided: ['', Validators.required],
      status: ['', Validators.required],
      remarks: [''],
      upload_file: [null],
    });
  }

  private createDaPanelRowGroup(detailsType?: 'yes_no'): FormGroup {
    if (detailsType === 'yes_no') {
      return this.fb.group({
        details: ['', Validators.required],
        remarks: [''],
      });
    }
    return this.fb.group({
      status: ['', Validators.required],
      remarks: [''],
    });
  }

  private createMiscellaneousRowGroup(
    detailsType: 'text' | 'sat_unsat' | 'yes_no' | 'avl_na' | 'ops_non_ops' | 'date',
  ): FormGroup {
    return this.fb.group({
      details: ['', Validators.required],
      remarks: [''],
      upload_file: [null],
    });
  }

  private createTransientRowGroup(): FormGroup {
    return this.fb.group({
      initial_speed_hz: ['', [Validators.required, Validators.min(0)]],
      momentary_speed_hz: ['', [Validators.required, Validators.min(0)]],
      final_speed_hz: ['', [Validators.required, Validators.min(0)]],
      peak_observed: [{ value: '', disabled: true }],
      recovery_observed: ['', [Validators.required, Validators.min(0)]],
      recovery_final_value: [{ value: '', disabled: true }],
      status: [{ value: '', disabled: true }],
    });
  }

  private createGovernorRangeRowGroup(): FormGroup {
    return this.fb.group({
      measured_frequency_hz: ['', [Validators.required, Validators.min(0)]],
      status: ['', Validators.required],
    });
  }

  private createGovernorRateRowGroup(): FormGroup {
    return this.fb.group({
      rate_up: ['', [Validators.required, Validators.min(0)]],
      rate_down: ['', [Validators.required, Validators.min(0)]],
      status: ['', Validators.required],
    });
  }

  private createVoltageSteadyStateRowGroup(): FormGroup {
    return this.fb.group({
      kw: ['', [Validators.required, Validators.min(0)]],
      volts_max: ['', [Validators.required, Validators.min(0)]],
      volts_min: ['', [Validators.required, Validators.min(0)]],
      power_factor: ['', [Validators.required, Validators.min(0)]],
      rated_amps: ['', [Validators.required, Validators.min(0)]],
      observed_amps: ['', [Validators.required, Validators.min(0)]],
      voltage_modulation: [{ value: '', disabled: true }],
      status: ['', Validators.required],
    });
  }

  private createVoltageTransientRowGroup(): FormGroup {
    return this.fb.group({
      initial_voltage: ['', [Validators.required, Validators.min(0)]],
      momentary_voltage: ['', [Validators.required, Validators.min(0)]],
      final_voltage: ['', [Validators.required, Validators.min(0)]],
      peak_observed: [{ value: '', disabled: true }],
      final_value: [{ value: '', disabled: true }],
      recovery_observed: ['', [Validators.required, Validators.min(0)]],
      status: ['', Validators.required],
    });
  }

  private createVoltageBalanceRowGroup(): FormGroup {
    return this.fb.group({
      line_voltage_ry: ['', [Validators.required, Validators.min(0)]],
      line_voltage_yb: ['', [Validators.required, Validators.min(0)]],
      line_voltage_br: ['', [Validators.required, Validators.min(0)]],
      difference: [{ value: '', disabled: true }],
      permissible_limit: [{ value: '', disabled: true }],
      status: [{ value: '', disabled: true }],
    });
  }

  private createVoltageRangeRowGroup(): FormGroup {
    return this.fb.group({
      voltage_lowest: ['', [Validators.required, Validators.min(0)]],
      voltage_highest: ['', [Validators.required, Validators.min(0)]],
      status: ['', Validators.required],
    });
  }

  private createSteadyStateRowGroup(row: SteadyStateLoadRow): FormGroup {
    const isCalculatedDroopRow = row.calculatedDroop === true;

    return this.fb.group({
      initial_speed_hz: ['', [Validators.required, Validators.min(0)]],
      final_speed_hz: ['', [Validators.required, Validators.min(0)]],
      governor_droop: [{ value: '', disabled: isCalculatedDroopRow }],
      frequency_modulation: [{ value: '', disabled: !row.frequencyModulationNA }],
      status: ['', Validators.required],
    });
  }

  private setupSpeedControlCalculations(governor: 'governor1' | 'governor2'): void {
    const steadyState = this.form.get(`${governor}_steady_state`) as FormArray;
    const nominalControl = this.form.get(`${governor}_nominal_frequency`);
    const governorTypeControl = this.form.get('governor_type');
    const shipControl = this.form.get('ship');
    if (!steadyState || !nominalControl) return;

    const subscription = merge(
      nominalControl.valueChanges,
      steadyState.valueChanges,
      ...(governorTypeControl ? [governorTypeControl.valueChanges] : []),
      ...(shipControl ? [shipControl.valueChanges] : []),
    )
      .pipe(debounceTime(100))
      .subscribe(() => this.updateSpeedControlCalculations(governor));

    this.speedControlSubscriptions.push(subscription);
  }

  private updateSpeedControlCalculations(governor: 'governor1' | 'governor2'): void {
    const steadyState = this.form.get(`${governor}_steady_state`) as FormArray;
    const nominalControl = this.form.get(`${governor}_nominal_frequency`);
    if (!steadyState || !nominalControl) return;

    const nominalFrequency = parseFrequency(nominalControl.value);
    const droopRow = steadyState.at(STEADY_STATE_ROW_INDEX.GOVERNOR_DROOP);
    const governorDroop = calculateGovernorDroop(
      parseFrequency(droopRow.get('initial_speed_hz')?.value),
      parseFrequency(droopRow.get('final_speed_hz')?.value),
      nominalFrequency,
    );
    this.patchCalculatedControl(
      droopRow.get('governor_droop'),
      governorDroop !== null ? roundFrequencyCalculation(governorDroop) : '',
    );
    this.patchCalculatedControl(
      droopRow.get('status'),
      evaluateGovernorDroopStatus(
        governorDroop,
        String(this.form.get('governor_type')?.value ?? ''),
        this.currentShipName(),
      ),
    );

    steadyState.controls.forEach((rowGroup, index) => {
      const rowMeta = STEADY_STATE_LOAD_ROWS[index];
      if (rowMeta.frequencyModulationNA) return;

      const modulation = calculateFrequencyModulation(
        parseFrequency(rowGroup.get('initial_speed_hz')?.value),
        parseFrequency(rowGroup.get('final_speed_hz')?.value),
        nominalFrequency,
      );
      this.patchCalculatedControl(
        rowGroup.get('frequency_modulation'),
        modulation !== null ? roundFrequencyCalculation(modulation) : '',
      );
      this.patchCalculatedControl(
        rowGroup.get('status'),
        evaluateFrequencyModulationStatus(modulation),
      );
    });
  }

  private setupTransientTestCalculations(governor: 'governor1' | 'governor2'): void {
    const transient = this.form.get(`${governor}_transient`) as FormArray;
    const peakLimitControl = this.form.get(`${governor}_peak_permissible_limit`);
    const nominalControl = this.form.get(`${governor}_nominal_frequency`);
    const governorTypeControl = this.form.get('governor_type');
    const shipControl = this.form.get('ship');
    if (!transient || !peakLimitControl || !nominalControl) return;

    const subscription = merge(
      peakLimitControl.valueChanges,
      nominalControl.valueChanges,
      transient.valueChanges,
      ...(governorTypeControl ? [governorTypeControl.valueChanges] : []),
      ...(shipControl ? [shipControl.valueChanges] : []),
    )
      .pipe(debounceTime(100))
      .subscribe(() => this.updateTransientTestCalculations(governor));

    this.transientTestSubscriptions.push(subscription);
  }

  private updateTransientTestCalculations(governor: 'governor1' | 'governor2'): void {
    const transient = this.form.get(`${governor}_transient`) as FormArray;
    const peakLimitControl = this.form.get(`${governor}_peak_permissible_limit`);
    const nominalControl = this.form.get(`${governor}_nominal_frequency`);
    if (!transient || !peakLimitControl || !nominalControl) return;

    const nominalFrequency = parseFrequency(nominalControl.value);
    const governorType = String(this.form.get('governor_type')?.value ?? '');
    const autoPeakLimit = speedTransientPeakLimitPercent(governorType, this.currentShipName());
    if (autoPeakLimit !== null) {
      this.patchCalculatedControl(peakLimitControl, autoPeakLimit);
    }
    const peakPermissibleLimit = isElectronicGovernor(governorType)
      ? ELECTRONIC_SPEED_TRANSIENT_PEAK_LIMIT_PERCENT
      : parseFrequency(peakLimitControl.value) ?? autoPeakLimit;

    transient.controls.forEach((rowGroup, index) => {
      const rowMeta = TRANSIENT_TEST_LOAD_ROWS[index];
      const initialRaw = rowGroup.get('initial_speed_hz')?.value;
      const momentaryRaw = rowGroup.get('momentary_speed_hz')?.value;
      const bothSpeedsFilled =
        isFilledNonZeroFrequency(initialRaw) && isFilledNonZeroFrequency(momentaryRaw);
      const peakObserved = bothSpeedsFilled
        ? calculatePeakPercent(
          parseFrequency(initialRaw),
          parseFrequency(momentaryRaw),
          nominalFrequency,
        )
        : null;
      const roundedPeak = peakObserved !== null ? roundFrequencyCalculation(peakObserved) : null;
      this.patchCalculatedControl(rowGroup.get('peak_observed'), roundedPeak ?? '');

      const recoveryFinalValue = rowMeta
        ? calculateRecoveryFinalValue(
          parseFrequency(rowGroup.get('final_speed_hz')?.value),
          rowMeta.loadInitial,
          rowMeta.loadTo,
        )
        : null;
      this.patchCalculatedControl(
        rowGroup.get('recovery_final_value'),
        recoveryFinalValue !== null ? roundFrequencyCalculation(recoveryFinalValue) : '',
      );
      this.patchCalculatedControl(
        rowGroup.get('status'),
        bothSpeedsFilled
          ? evaluateSpeedTransient25PercentStatus(
            roundedPeak,
            peakPermissibleLimit,
            parseFrequency(rowGroup.get('recovery_observed')?.value),
          )
          : '',
      );
    });
    this.cdr.detectChanges();
  }

  private setupSpeedTransientSubsectionCalculations(governor: 'governor1' | 'governor2'): void {
    const nominalControl = this.form.get(`${governor}_nominal_frequency`);
    const governorTypeControl = this.form.get('governor_type');
    if (!nominalControl) return;

    const sources = [nominalControl.valueChanges];
    if (governorTypeControl) sources.push(governorTypeControl.valueChanges);
    for (const subsection of ALL_SPEED_TRANSIENT_SUBSECTIONS) {
      const array = this.form.get(`${governor}_${subsection.key}_transient`) as FormArray;
      if (array) sources.push(array.valueChanges);
      if (subsection.peakLimitInput) {
        const peakControl = this.form.get(`${governor}_${subsection.key}_peak_limit`);
        if (peakControl) sources.push(peakControl.valueChanges);
      }
    }

    const subscription = merge(...sources)
      .pipe(debounceTime(100))
      .subscribe(() => this.updateSpeedTransientSubsectionCalculations(governor));
    this.transientTestSubscriptions.push(subscription);
  }

  private updateSpeedTransientSubsectionCalculations(governor: 'governor1' | 'governor2'): void {
    const nominalFrequency = parseFrequency(this.form.get(`${governor}_nominal_frequency`)?.value);
    for (const subsection of ALL_SPEED_TRANSIENT_SUBSECTIONS) {
      this.updateTransientSubsectionRows(governor, subsection, nominalFrequency);
    }
  }

  private updateTransientSubsectionRows(
    governor: 'governor1' | 'governor2',
    subsection: SpeedTransientSubsection,
    nominalFrequency: number | null,
  ): void {
    const transient = this.form.get(`${governor}_${subsection.key}_transient`) as FormArray;
    if (!transient) return;

    const peakPermissibleLimit = subsection.peakLimitInput
      ? parseFrequency(this.form.get(`${governor}_${subsection.key}_peak_limit`)?.value)
      : parsePercentLabel(subsection.peakLimitLabel);

    transient.controls.forEach((rowGroup, index) => {
      const rowMeta = subsection.rows[index];
      const initialRaw = rowGroup.get('initial_speed_hz')?.value;
      const momentaryRaw = rowGroup.get('momentary_speed_hz')?.value;
      const bothSpeedsFilled =
        isFilledNonZeroFrequency(initialRaw) && isFilledNonZeroFrequency(momentaryRaw);
      const peakObserved = bothSpeedsFilled
        ? calculatePeakPercent(
          parseFrequency(initialRaw),
          parseFrequency(momentaryRaw),
          nominalFrequency,
        )
        : null;
      const roundedPeak = peakObserved !== null ? roundFrequencyCalculation(peakObserved) : null;
      this.patchCalculatedControl(rowGroup.get('peak_observed'), roundedPeak ?? '');
      const recoveryFinalValue = rowMeta
        ? calculateRecoveryFinalValue(
          parseFrequency(rowGroup.get('final_speed_hz')?.value),
          rowMeta.loadInitial,
          rowMeta.loadTo,
        )
        : null;
      this.patchCalculatedControl(
        rowGroup.get('recovery_final_value'),
        recoveryFinalValue !== null ? roundFrequencyCalculation(recoveryFinalValue) : '',
      );
      this.patchCalculatedControl(
        rowGroup.get('status'),
        bothSpeedsFilled
          ? evaluateSpeedTransientSubsectionStatus(
            subsection.key,
            roundedPeak,
            peakPermissibleLimit,
            parseFrequency(rowGroup.get('recovery_observed')?.value),
          )
          : '',
      );
    });
    this.cdr.markForCheck();
  }

  isAutomaticRecoveryFinalValue(_governorType?: string): boolean {
    return true;
  }

  governorTypeForTransientSubsection(subsection: SpeedTransientSubsection): string {
    if (subsection.key.endsWith('_mg')) return 'Mechanical Governor';
    if (subsection.key.endsWith('_eg')) return 'Electronic Governor';
    if (subsection.key.endsWith('_nwp')) return 'For Non-Weapon Platform';
    if (subsection.key.endsWith('_sbc')) return 'For Ship Build Class';
    return '';
  }

  private setupGovernorAuxCalculations(governor: 'governor1' | 'governor2'): void {
    const range = this.form.get(`${governor}_governor_range`) as FormArray;
    const rate = this.form.get(`${governor}_governor_rate`) as FormArray;
    const governorType = this.form.get('governor_type');
    const ratedFrequency = this.form.get('alternator_rated_frequency');
    if (!range || !rate) return;

    const subscription = merge(
      range.valueChanges,
      rate.valueChanges,
      ...(governorType ? [governorType.valueChanges] : []),
      ...(ratedFrequency ? [ratedFrequency.valueChanges] : []),
    )
      .pipe(debounceTime(100))
      .subscribe(() => this.updateGovernorAuxCalculations(governor));

    this.speedControlSubscriptions.push(subscription);
  }

  private updateGovernorAuxCalculations(governor: 'governor1' | 'governor2'): void {
    const governorType = this.form.get('governor_type')?.value;
    const rangeLimits = calculateGovernorRangeLimits(
      governorType,
      parseFrequency(this.form.get('alternator_rated_frequency')?.value),
    );

    const range = this.form.get(`${governor}_governor_range`) as FormArray;
    range?.controls.forEach((rowGroup) => {
      this.patchCalculatedControl(
        rowGroup.get('status'),
        evaluateGovernorRangeStatus(
          parseFrequency(rowGroup.get('measured_frequency_hz')?.value),
          rangeLimits,
        ),
      );
    });

    const rate = this.form.get(`${governor}_governor_rate`) as FormArray;
    rate?.controls.forEach((rowGroup, index) => {
      const load = this.governorRateLoadRows[index];
      this.patchCalculatedControl(
        rowGroup.get('status'),
        evaluateGovernorRateStatus(
          parseFrequency(rowGroup.get('rate_up')?.value),
          parseFrequency(rowGroup.get('rate_down')?.value),
          governorMotorRateBand(load, governorType),
        ),
      );
    });
  }

  private setupVoltageControlCalculations(avr: 'avr1' | 'avr2'): void {
    const steadyState = this.form.get(`${avr}_voltage_steady_state`) as FormArray;
    const nominalControl = this.form.get(`${avr}_nominal_voltage`);
    const transient = this.form.get(`${avr}_voltage_transient`) as FormArray;
    const voltageBalance = this.form.get(`${avr}_voltage_balance`) as FormArray;
    const voltageRangeAvr = this.form.get(`${avr}_voltage_range_avr`) as FormArray;
    const voltageRangeHand = this.form.get(`${avr}_voltage_range_hand`) as FormArray;
    const ratedVoltageControl = this.form.get('alternator_rated_voltage');
    if (!steadyState || !nominalControl || !transient || !voltageBalance) return;

    const subscription = merge(
      nominalControl.valueChanges,
      steadyState.valueChanges,
      transient.valueChanges,
      voltageBalance.valueChanges,
      ...(voltageRangeAvr ? [voltageRangeAvr.valueChanges] : []),
      ...(voltageRangeHand ? [voltageRangeHand.valueChanges] : []),
      ...(ratedVoltageControl ? [ratedVoltageControl.valueChanges] : []),
    )
      .pipe(debounceTime(100))
      .subscribe(() => this.updateVoltageControlCalculations(avr));
    this.voltageControlSubscriptions.push(subscription);
  }

  private updateVoltageControlCalculations(avr: 'avr1' | 'avr2'): void {
    const steadyState = this.form.get(`${avr}_voltage_steady_state`) as FormArray;
    const nominalControl = this.form.get(`${avr}_nominal_voltage`);
    const transient = this.form.get(`${avr}_voltage_transient`) as FormArray;
    const voltageBalance = this.form.get(`${avr}_voltage_balance`) as FormArray;
    if (!steadyState || !nominalControl || !transient || !voltageBalance) return;

    const ratedVoltage = parseFrequency(this.form.get('alternator_rated_voltage')?.value);
    const typedNominal = parseFrequency(nominalControl.value);
    if (typedNominal === null && ratedVoltage !== null) {
      this.patchCalculatedControl(nominalControl, roundFrequencyCalculation(ratedVoltage));
    }
    const nominalVoltage = parseFrequency(nominalControl.value) ?? ratedVoltage;

    steadyState.controls.forEach((rowGroup) => {
      const modulation = calculateVoltageModulation(
        parseFrequency(rowGroup.get('volts_max')?.value),
        parseFrequency(rowGroup.get('volts_min')?.value),
        nominalVoltage,
      );
      this.patchCalculatedControl(
        rowGroup.get('voltage_modulation'),
        modulation !== null ? roundFrequencyCalculation(modulation) : '',
      );
      this.patchCalculatedControl(
        rowGroup.get('status'),
        evaluateVoltageModulationStatus(modulation),
      );
    });

    transient.controls.forEach((rowGroup, index) => {
      const rowMeta = VOLTAGE_TRANSIENT_LOAD_ROWS[index];
      const peakObserved = calculatePeakPercent(
        parseFrequency(rowGroup.get('initial_voltage')?.value),
        parseFrequency(rowGroup.get('momentary_voltage')?.value),
        nominalVoltage,
      );
      const recoveryFinalValue = calculateVoltageRecoveryFinalValue(
        parseFrequency(rowGroup.get('final_voltage')?.value),
        rowMeta.loadInitial,
      );
      this.patchCalculatedControl(
        rowGroup.get('peak_observed'),
        peakObserved !== null ? roundFrequencyCalculation(peakObserved) : '',
      );
      this.patchCalculatedControl(
        rowGroup.get('final_value'),
        recoveryFinalValue !== null ? roundFrequencyCalculation(recoveryFinalValue) : '',
      );
      this.patchCalculatedControl(
        rowGroup.get('status'),
        evaluateVoltageTransientStatus(
          peakObserved,
          parseFrequency(rowGroup.get('recovery_observed')?.value),
          isVoltageMotorStartRow(rowMeta.loadInitial),
        ),
      );
    });

    voltageBalance.controls.forEach((rowGroup) => {
      const ry = parseFrequency(rowGroup.get('line_voltage_ry')?.value);
      const yb = parseFrequency(rowGroup.get('line_voltage_yb')?.value);
      const br = parseFrequency(rowGroup.get('line_voltage_br')?.value);
      const difference = calculateVoltageBalanceDifference(ry, yb, br);
      const permissibleLimit = calculateVoltageBalancePermissibleLimit(ry, yb, br);
      this.patchCalculatedControl(
        rowGroup.get('difference'),
        difference !== null ? roundFrequencyCalculation(difference) : '',
      );
      this.patchCalculatedControl(
        rowGroup.get('permissible_limit'),
        permissibleLimit !== null ? roundFrequencyCalculation(permissibleLimit) : '',
      );
      this.patchCalculatedControl(
        rowGroup.get('status'),
        evaluateVoltageBalanceStatus(difference, permissibleLimit),
      );
    });

    const rangeBounds = calculateVoltageRangeBounds(ratedVoltage ?? nominalVoltage, 5);
    this.patchCalculatedControl(
      this.form.get(`${avr}_voltage_range_permissible_limit`),
      5,
    );

    (['avr', 'hand'] as const).forEach((groupKey) => {
      const rangeRows = this.form.get(`${avr}_voltage_range_${groupKey}`) as FormArray;
      rangeRows?.controls.forEach((rowGroup) => {
        this.patchCalculatedControl(
          rowGroup.get('status'),
          evaluateVoltageRangeStatus(
            parseFrequency(rowGroup.get('voltage_lowest')?.value),
            parseFrequency(rowGroup.get('voltage_highest')?.value),
            rangeBounds,
          ),
        );
      });
    });
  }

  /** Angular skips patchValue on disabled controls; briefly enable to update calculated fields. */
  private patchCalculatedControl(
    control: AbstractControl | null | undefined,
    value: unknown,
  ): void {
    if (!control) return;
    const wasDisabled = control.disabled;
    if (wasDisabled) {
      control.enable({ emitEvent: false });
    }
    control.patchValue(value, { emitEvent: false });
    if (wasDisabled) {
      control.disable({ emitEvent: false });
    }
  }
}
