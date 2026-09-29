import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, firstValueFrom, merge } from 'rxjs';
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
import { EtmaProformaTableComponent } from '../etma-proforma-table/etma-proforma-table.component';
import {
  GTG_PHM_TRANSIENT_OFF_ROWS,
  GTG_PHM_TRANSIENT_ON_ROWS,
  GTG_STEADY_STATE_LOAD_ROWS,
  GTG_GOVERNOR_DROOP_ROW_INDEX,
  GTG_STEADY_STATE_OFF_ROWS,
  GTG_VOLTAGE_STEADY_STATE_LOAD_ROWS,
  GTG_VOLTAGE_TRANSIENT_ROWS,
  GtgPhmTransientRow,
} from './load-trial-proforma-gtg.data';
import {
  GOVERNOR_RANGE_LOAD_ROWS,
  GOVERNOR_RATE_LOAD_ROWS,
  GOVERNOR_RATE_PERMISSIBLE_LIMIT,
  VOLTAGE_BALANCE_LOAD_ROWS,
  VOLTAGE_RANGE_GROUPS,
  VOLTAGE_RANGE_LOAD_ROWS,
} from './load-trial-proforma-gtg.extended.data';
import {
  GTG_PANEL_COLUMNS,
  GTG_PANEL_SECTIONS,
  EQUIPMENT_DETAILS_GROUPS,
  INSULATION_RESISTANCE_ROWS,
  INSTRUMENTATION_COLUMNS,
  INSTRUMENTATION_SECTIONS,
  MISCELLANEOUS_COLUMNS,
  MISCELLANEOUS_SECTIONS,
  PROTECTION_CHECK_COLUMNS,
  PROTECTION_CHECK_SECTIONS,
} from './load-trial-proforma-gtg.table-config';
import {
  calculateFrequencyModulation,
  calculateGovernorDroop,
  calculateGovernorRangeLimits,
  calculateNominalFrequency,
  calculateParallelingSharing,
  calculatePeakPercent,
  calculateTransientRecoveryFinalValue,
  calculateVoltageBalanceDifference,
  calculateVoltageBalancePermissibleLimit,
  calculateVoltageModulation,
  calculateVoltageRangeBounds,
  evaluateFrequencyModulationStatus,
  evaluateGovernorDroopStatus,
  evaluateGovernorRangeStatus,
  evaluateGovernorRateStatus,
  evaluateParallelingSharingStatus,
  evaluatePeakStatus,
  evaluateTransientRowStatus,
  evaluateVoltageBalanceStatus,
  evaluateVoltageModulationStatus,
  evaluateVoltageRangeStatus,
  formatVoltageRangePermissibleLimit,
  parseFrequency,
  parsePercentLabel,
  roundFrequencyCalculation,
} from './load-trial-proforma-gtg.calculations';
import {
  buildLoadTrialProformaGtgPayload,
  legacyParallelingRowToFormPatch,
  legacyPayloadToGtgFormFill,
} from './load-trial-proforma-gtg.payload';
import {
  PARALLELING_SHARING_ROWS,
  ParallelingSharingRowConfig,
} from './load-trial-proforma-gtg.paralleling.data';
import { equipmentHtml } from '../../../ApiEndPoints';
import { InputComponent } from '../../../ui/input.component';
import { SelectComponent, SelectOption } from '../../../ui/select.component';
import { CalenderComponent } from '../../../ui/calender.component';
import { FileUploadComponent } from '../../../ui/file-upload/file-upload.component';
import { TextareaComponent } from '../../../ui/textarea';


@Component({
  selector: 'app-load-trial-proforma-gtg',
  standalone: true,
  host: {
    class: 'flex h-full min-h-0 flex-1 flex-col overflow-hidden',
  },
  templateUrl: './load-trial-proforma-gtg.html',
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
  styleUrl: './load-trial-proforma-gtg.css',
})
export class LoadTrialProformaGtg implements OnInit, OnDestroy {


  form: FormGroup;
  workflowTrialId: string | undefined = undefined;
  showDecisionPopup = false;
  decisionLoading = false;
  draftLoading = false;
  submitLoading = false;

   
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
  

  private readonly speedControlSubscriptions: Subscription[] = [];
  private readonly transientTestSubscriptions: Subscription[] = [];
  private readonly voltageControlSubscriptions: Subscription[] = [];
  private readonly parallelingSubscriptions: Subscription[] = [];
  private readonly governorAuxSubscriptions: Subscription[] = [];

  readonly parallelingSharingRows = PARALLELING_SHARING_ROWS;
  readonly parallelingIncreasingRows = PARALLELING_SHARING_ROWS.filter((r) => r.direction === 'incrs');
  readonly parallelingDecreasingRows = PARALLELING_SHARING_ROWS.filter((r) => r.direction === 'decrs');
  private shipSubscription?: Subscription;
  equipmentOptions: SelectOption[] = [];

  readonly totalPages = 1;
  currentPage = 1;

  testEquipmentOptions: SelectOption[] = [
    { label: 'Select Test Equipment', value: '' },
  ];

  readonly equipmentDetailsGroups = EQUIPMENT_DETAILS_GROUPS;
  readonly insulationResistanceRows = INSULATION_RESISTANCE_ROWS;
  readonly protectionCheckColumns = PROTECTION_CHECK_COLUMNS;
  readonly protectionCheckSections = PROTECTION_CHECK_SECTIONS;
  readonly instrumentationColumns = INSTRUMENTATION_COLUMNS;
  readonly instrumentationSections = INSTRUMENTATION_SECTIONS;
  readonly gtgPanelColumns = GTG_PANEL_COLUMNS;
  readonly gtgPanelSections = GTG_PANEL_SECTIONS;
  readonly miscellaneousColumns = MISCELLANEOUS_COLUMNS;
  readonly miscellaneousSections = MISCELLANEOUS_SECTIONS;
  readonly gtgSteadyStateLoadRows = GTG_STEADY_STATE_LOAD_ROWS;
  readonly gtgSteadyStateOffRows = GTG_STEADY_STATE_OFF_ROWS;
  readonly gtgTransientOnRows = GTG_PHM_TRANSIENT_ON_ROWS;
  readonly gtgTransientOffRows = GTG_PHM_TRANSIENT_OFF_ROWS;
  readonly governorRangeLoadRows = GOVERNOR_RANGE_LOAD_ROWS;
  readonly governorRateLoadRows = GOVERNOR_RATE_LOAD_ROWS;
  readonly governorRatePermissibleLimit = GOVERNOR_RATE_PERMISSIBLE_LIMIT;
  readonly gtgVoltageSteadyStateLoadRows = GTG_VOLTAGE_STEADY_STATE_LOAD_ROWS;
  readonly gtgVoltageTransientRows = GTG_VOLTAGE_TRANSIENT_ROWS;
  readonly voltageBalanceLoadRows = VOLTAGE_BALANCE_LOAD_ROWS;
  readonly voltageRangeGroups = VOLTAGE_RANGE_GROUPS;
  readonly voltageRangeLoadRows = VOLTAGE_RANGE_LOAD_ROWS;

  parallelingTrial: 'yes' | 'no' | '' = '';
  showParallelingSection = false;

  eqpForShips: SelectOption[] = [{ label: 'Select Equipment', value: '' }];

  constructor(
    private readonly fb: FormBuilder,
    private readonly cdr: ChangeDetectorRef,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly toastService: ToastService,
    public formApiService: FormApiService,
    private apiService: ApiService,
  ) {
    this.form = this.fb.group({
      trials_date: [null, Validators.required],
      gtg: ['', Validators.required],
      kw: ['', Validators.required],
      // ship: ['', Validators.required],
      ship: [{value:'',disabled:true, },Validators.required],
      ship_id: [''],
      trial_report_no: [''],

      presented_by: ['', Validators.required],
      trial_date: [null, Validators.required],
      trial_undertaken_by: ['', Validators.required],
      occasion_of_current_trial: ['', Validators.required],
      date_of_last_trial: [null, Validators.required],
      proposal_reference: [null, Validators.required],
      file_reference: ['', Validators.required],
      reference_document_for_trial: [
        { value: 'Def Stan 08-142, EED-Q-242(R3) and GTG Technical Manual', disabled: true },
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
      gtg_panel_checks: this.fb.array(
        GTG_PANEL_SECTIONS[0].rows.map((row) =>
          this.createGtgPanelRowGroup((row as { detailsType?: 'yes_no' }).detailsType),
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

      nominal_frequency: ['', [Validators.required, Validators.min(0)]],
      phm_on_steady_state: this.fb.array(
        GTG_STEADY_STATE_LOAD_ROWS.map(() => this.createGtgSteadyStateRowGroup()),
      ),
      phm_off_steady_state: this.fb.array(
        GTG_STEADY_STATE_OFF_ROWS.map((row) =>
          row.calculatedDroop
            ? this.createGtgSteadyStateOffDroopRowGroup()
            : this.createGtgSteadyStateRowGroup(),
        ),
      ),
      phm_on_transient: this.fb.array(
        GTG_PHM_TRANSIENT_ON_ROWS.map(() => this.createGtgTransientRowGroup()),
      ),
      phm_off_transient: this.fb.array(
        GTG_PHM_TRANSIENT_OFF_ROWS.map(() => this.createGtgTransientRowGroup()),
      ),
      governor_range: this.fb.array(
        GOVERNOR_RANGE_LOAD_ROWS.map(() => this.createGovernorRangeRowGroup()),
      ),
      governor_rate: this.fb.array(
        GOVERNOR_RATE_LOAD_ROWS.map(() => this.createGovernorRateRowGroup()),
      ),

      nominal_voltage: ['', [Validators.required, Validators.min(0)]],
      m_load_amps: ['', [Validators.required, Validators.min(0)]],
      voltage_steady_state: this.fb.array(
        GTG_VOLTAGE_STEADY_STATE_LOAD_ROWS.map(() => this.createVoltageSteadyStateRowGroup()),
      ),
      voltage_transient: this.fb.array(
        GTG_VOLTAGE_TRANSIENT_ROWS.map(() => this.createVoltageTransientRowGroup()),
      ),
      voltage_balance: this.fb.array(
        VOLTAGE_BALANCE_LOAD_ROWS.map(() => this.createVoltageBalanceRowGroup()),
      ),
      voltage_range_avr: this.fb.array(
        VOLTAGE_RANGE_LOAD_ROWS.map(() => this.createVoltageRangeRowGroup()),
      ),
      voltage_range_hand: this.fb.array(
        VOLTAGE_RANGE_LOAD_ROWS.map(() => this.createVoltageRangeRowGroup()),
      ),
      voltage_range_permissible_limit: [''],
      harmonic_content: ['', [Validators.required, Validators.min(0)]],

      gen_r_ship_engineer_officer: [''],
      trial_officer: [''],
      recommendations: [''],
      final_status: [''],

      dynamic_paralleling_trial_rows: this.fb.array([]),
    });

    this.setupGtgSpeedControlCalculations();
    this.setupGtgTransientCalculations('phm_on_transient');
    this.setupGtgTransientCalculations('phm_off_transient');
    this.setupGovernorAuxCalculations();
    this.setupVoltageControlCalculations();
    this.setupParallelingCalculations();
  }

  ngOnInit(): void {
    void this.loadTrialPrefillFromQuery();
    this.updateGtgSpeedControlCalculations();
    this.updateGtgTransientCalculations('phm_on_transient', GTG_PHM_TRANSIENT_ON_ROWS);
    this.updateGtgTransientCalculations('phm_off_transient', GTG_PHM_TRANSIENT_OFF_ROWS);
    this.updateGovernorAuxCalculations();
    this.updateVoltageControlCalculations();
    this.updateParallelingCalculations();
    this.shipSubscription = this.form.get('ship_id')!.valueChanges.subscribe((shipId: string) => {
    this.loadEquipmentOptions(shipId);
  });
  }

  private loadEquipmentOptions(shipId?: string | number | null): void {
      const params: Record<string, any> = {};
      if (shipId) {
        params['ship_id'] = shipId;
      }
      console.log('param is', params);
      console.log('equipmentHtml:', equipmentHtml, typeof equipmentHtml);
      this.apiService
        .getDropdownData('master/equipments/', equipmentHtml, params)
        .subscribe((options) => {
          this.equipmentOptions = options;
          console.log('equipmentOptions result:', options); 
        });
    }

  /** Equipment tabs shown in the form-card header */
  // for equipment header starts here
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
//for equipment header ends here


 private async loadTrialPrefillFromQuery(): Promise<void> {
  const trialId = resolveTrialQueryParam(this.route, this.router);
  if (!trialId) return;

  this.workflowTrialId = trialId;

  try {
    const response = await this.formApiService.getForm(trialId);

    console.log('Response:', response);
    console.log('FormApiService:', this.formApiService);
    console.log('Context:', this.formApiService?.context);

    const trialRow = trialRowFromGetFormResponse(this.formApiService, response);
    console.log('trialRow:', trialRow);
    // for equipment header
    this.eqpList = Array.isArray(trialRow?.equipment_details) ? trialRow.equipment_details : [];
this.activeTab = this.formApiService.currentEquipmentNomenclature || this.eqpList[0] || null;
if (this.activeTab) {
  this.formApiService.setCurrentEquipmentNomenclature(this.activeTab);
}
// for equipment header end here

    const equipmentPayload = this.extractEquipmentPayload(response);
    console.log('typeof response.json_data:', typeof response?.json_data);
console.log('response keys:', response ? Object.keys(response) : null);
console.log('equipmentPayload:', equipmentPayload);

    // Draft data agar available hai tabhi fillData call karo
    // kyunki response me "Draft not found or expired" aa raha hai
    // if (
    //   response &&
    //   !response?.detail &&
    //   (
    //     response?.json_data ||
    //     response?.data ||
    //     response?.formGroupKey ||
    //     response?.loadTrialPerformaDA
    //   )
    // ) {
    //   this.fillData(response);
    // }

    // const context: any = this.formApiService?.context || {};
    // const shipValue =
    //   context?.ship_name ||
    //   trialRow?.ship_name ||
    //   response?.ship_name ||
    //   '';

    // console.log('shipValue:', shipValue);

    // this.form.get('ship')?.setValue(shipValue, { emitEvent: false });
    // this.form.get('ship')?.updateValueAndValidity({ emitEvent: false });

    // this.cdr.detectChanges();
    if (equipmentPayload) {
      this.fillData(equipmentPayload);
    }

    const context: any = this.formApiService?.context || {};
    const shipValue =
      context?.ship_name ||
      trialRow?.ship_name ||
      response?.ship_name ||
      '';

      const shipId = context?.ship_id ?? trialRow?.ship_id ?? response?.ship_id ?? null;
const shipName = context?.ship_name ?? trialRow?.ship_name ?? response?.ship_name ?? '';

    this.form.get('ship')?.setValue(shipValue, { emitEvent: false });
    this.form.get('ship')?.updateValueAndValidity({ emitEvent: false });
    this.form.get('ship_id')?.setValue(shipId, { emitEvent: false });
    if (shipId) this.loadEquipmentOptions(shipId);
    this.applyGtgFromActiveEquipment(); 

    this.cdr.detectChanges();
  } catch (e) {
    console.error('Trial prefill failed (load trial proforma DA)', e);
  }
}

private extractEquipmentPayload(response: any): any {
  if (!response) return null;

  // Shape A: response.data seedha bhara ho
  if (response?.data && typeof response.data === 'object') return response.data;
  if (response?.loadTrialPerformaDA) return response.loadTrialPerformaDA;

  // Shape B: response.json_data wrapper (string ya object)
  let jsonData = response?.json_data ?? response?.jsonData ?? response?.formData ?? null;
  if (typeof jsonData === 'string') {
    try { jsonData = JSON.parse(jsonData); } catch (e) {
      console.error('json_data parse fail:', e);
      jsonData = null;
    }
  }

  // Shape C: response khud hi { "<Equipment Nomenclature>": {...fields} } hai
  if (!jsonData && this.looksLikeEquipmentMap(response)) {
    jsonData = response;
  }

  if (jsonData && typeof jsonData === 'object') {
    const nomenclature = this.formApiService?.currentEquipmentNomenclature;
    if (nomenclature && jsonData[nomenclature]) {
      return jsonData[nomenclature];
    }
    const firstKey = Object.keys(jsonData)[0];
    if (firstKey && jsonData[firstKey] && typeof jsonData[firstKey] === 'object') {
      console.log('Using equipment key:', firstKey);
      return jsonData[firstKey];
    }
  }

  // Shape D: response khud hi flat form-data hai
  if (response?.formGroupKey) return response;

  console.warn('extractEquipmentPayload: shape match nahi hua', response);
  return null;
}
//for equilment header
async setActiveTab(tab: any): Promise<void> {
  if (!tab || this.isSameEquipment(this.activeTab, tab)) return;

  this.activeTab = tab;
  this.formApiService.setCurrentEquipmentNomenclature(tab);

  if (!this.workflowTrialId) return;

  this.resetFormData();

  try {
    const nomenclature = this.formApiService.resolveNomenclature(tab);
    const response = await this.formApiService.getFormByEquipment(this.workflowTrialId, nomenclature);
    const equipmentPayload = this.extractEquipmentPayload(response);
    if (equipmentPayload) {
      this.fillData(equipmentPayload);
    }
    this.cdr.detectChanges();
  } catch (error) {
    console.error('Failed to load GTG load trial data for selected equipment', error);
    this.toastService.showError('Failed to load selected equipment data.');
  }
}

/** Clears form back to defaults (keeps ship) before loading the newly-selected equipment's data */
private resetFormData(): void {
  const ship = this.form.get('ship')?.value;

  this.form.reset(undefined, { emitEvent: false });
  this.form.patchValue(
    {
      reference_document_for_trial: 'Def Stan 08-142, EED-Q-242(R3) and GTG Technical Manual',
      ship,
    },
    { emitEvent: false },
  );
  this.applyGtgFromActiveEquipment(true);

  this.dynamicParallelingTrialRows.clear();
  this.parallelingTrial = '';
  this.showParallelingSection = false;

  this.refreshCalculatedFields();
}

/** Check karta hai ki object ki values equipment-form-data jaisi dikhti hain (formGroupKey wali) */
private looksLikeEquipmentMap(obj: any): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return Object.values(obj).some(
    (v: any) => v && typeof v === 'object' && 'formGroupKey' in v,
  );
}
  ngOnDestroy(): void {
    this.speedControlSubscriptions.forEach((sub) => sub.unsubscribe());
    this.transientTestSubscriptions.forEach((sub) => sub.unsubscribe());
    this.voltageControlSubscriptions.forEach((sub) => sub.unsubscribe());
    this.parallelingSubscriptions.forEach((sub) => sub.unsubscribe());
    this.governorAuxSubscriptions.forEach((sub) => sub.unsubscribe());
  }

  get dynamicParallelingTrialRows(): FormArray {
    return this.form.get('dynamic_paralleling_trial_rows') as FormArray;
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

  get gtgPanelChecks(): FormArray {
    return this.form.get('gtg_panel_checks') as FormArray;
  }

  get miscellaneousChecks(): FormArray {
    return this.form.get('miscellaneous_checks') as FormArray;
  }

  voltageRangeArrayName(groupKey: string): string {
    return `voltage_range_${groupKey}`;
  }

  setParallelingTrial(value: 'yes' | 'no'): void {
    this.parallelingTrial = value;
    if (value === 'yes') {
      this.showParallelingSection = true;
      if (this.dynamicParallelingTrialRows.length === 0) {
        this.addParallelingTrialRow();
      }
      return;
    }
    this.showParallelingSection = false;
    this.dynamicParallelingTrialRows.clear();
  }

  addParallelingTrialRow(): void {
    this.showParallelingSection = true;
    this.parallelingTrial = 'yes';
    this.dynamicParallelingTrialRows.push(this.createParallelingTrialRowGroup());
    this.updateParallelingCalculations();
  }

  removeParallelingTrialRow(index: number): void {
    if (index < 0 || index >= this.dynamicParallelingTrialRows.length) return;
    this.dynamicParallelingTrialRows.removeAt(index);
    if (this.dynamicParallelingTrialRows.length === 0) {
      this.parallelingTrial = 'no';
      this.showParallelingSection = false;
    }
  }

  // Old code:
  // parallelingSharingControlName(config: ParallelingSharingRowConfig, unit: 'kw' | 'kva'): string {
  //   return `${config.direction}_${config.loadPercent}_${unit}`;
  // }
  parallelingSharingControlName(config: ParallelingSharingRowConfig, unit: 'kw' | 'kva' | string): string {
    return `${config.direction}_${config.loadPercent}_${unit}`;
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

  openPreviousReport(): void {
    this.router.navigate(['/etma/load-trial-proforma-gtg-report'], {
      queryParams: this.route.snapshot.queryParams,
    });
  }

  @ViewChild('formCard') formCard!: FormCardComponent;

  async handleSave(type: 'clear' | 'draft' | 'save' | 'submit'): Promise<void> {
    if (type === 'clear') {
      this.form.reset();
      this.form.patchValue({
        reference_document_for_trial: 'Def Stan 08-142, EED-Q-242(R3) and GTG Technical Manual',
      });
      this.dynamicParallelingTrialRows.clear();
      this.parallelingTrial = '';
      this.showParallelingSection = false;
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

    const payload = buildLoadTrialProformaGtgPayload(this.form, this.parallelingTrial);

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
        this.formCard.context = this.formApiService.context;
        this.formCard.isSubmitTimes = true;
        this.formCard.shouldShowUserPopup = true;
        await firstValueFrom(this.formApiService.submitForm(payload, this.workflowTrialId || ''));
        this.toastService.showSuccess('Form submitted successfully.');
      }
    } catch (error) {
      console.error('Load Trial Proforma GTG save failed', error);
      this.toastService.showError(
        type === 'draft' ? 'Failed to save draft.' : 'Failed to submit form.',
      );
    } finally {
      this.draftLoading = false;
      this.saveLoading = false;
      this.submitLoading = false;
      this.cdr.markForCheck();
    }
  }

  fillData(payload: unknown): void {
    if (!payload) return;
    const { formPatch, parallelingTrial, parallelingRows } = legacyPayloadToGtgFormFill(payload);
    this.form.patchValue(formPatch);
    this.parallelingTrial = parallelingTrial;
    this.dynamicParallelingTrialRows.clear();
    if (parallelingTrial === 'yes') {
      this.showParallelingSection = true;
      for (const legacyRow of parallelingRows) {
        const rowGroup = this.createParallelingTrialRowGroup();
        rowGroup.patchValue(legacyParallelingRowToFormPatch(legacyRow));
        this.dynamicParallelingTrialRows.push(rowGroup);
      }
    } else {
      this.showParallelingSection = false;
    }
    this.refreshCalculatedFields();
    this.applyGtgFromActiveEquipment();
    this.cdr.detectChanges();
  }

  private applyGtgFromActiveEquipment(overwrite = false): void {
    const tab = this.activeHeaderEquipment;
    const gtgName = tab?.equipment_name || tab?.name || tab?.nomenclature || '';
    if (!gtgName) return;
    const control = this.form.get('gtg');
    if (overwrite || !control?.value) {
      control?.setValue(gtgName, { emitEvent: false });
    }
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
    this.updateGtgSpeedControlCalculations();
    this.updateGtgTransientCalculations('phm_on_transient', GTG_PHM_TRANSIENT_ON_ROWS);
    this.updateGtgTransientCalculations('phm_off_transient', GTG_PHM_TRANSIENT_OFF_ROWS);
    this.updateGovernorAuxCalculations();
    this.updateVoltageControlCalculations();
    this.updateParallelingCalculations();
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

  private createGtgPanelRowGroup(detailsType?: 'yes_no'): FormGroup {
    if (detailsType === 'yes_no') {
      return this.fb.group({
        details: ['', Validators.required],
      });
    }
    return this.fb.group({
      status: ['', Validators.required],
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

  private createGtgSteadyStateRowGroup(): FormGroup {
    return this.fb.group({
      initial_speed_hz: ['', [Validators.required, Validators.min(0)]],
      final_speed_hz: ['', [Validators.required, Validators.min(0)]],
      frequency_modulation: [''],
      status: ['', Validators.required],
    });
  }

  private createGtgSteadyStateOffDroopRowGroup(): FormGroup {
    return this.fb.group({
      initial_speed_hz: ['', [Validators.required, Validators.min(0)]],
      final_speed_hz: ['', [Validators.required, Validators.min(0)]],
      governor_droop: [''],
      status: ['', Validators.required],
    });
  }

  private createGtgTransientRowGroup(): FormGroup {
    return this.fb.group({
      initial_speed_hz: ['', [Validators.required, Validators.min(0)]],
      momentary_speed_hz: ['', [Validators.required, Validators.min(0)]],
      final_speed_hz: ['', [Validators.required, Validators.min(0)]],
      peak_observed: [''],
      recovery_final_value: [''],
      recovery_observed: ['', [Validators.required, Validators.min(0)]],
      status: ['', Validators.required],
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
      voltage_modulation: [''],
      status: ['', Validators.required],
    });
  }

  private createVoltageTransientRowGroup(): FormGroup {
    return this.fb.group({
      initial_voltage: ['', [Validators.required, Validators.min(0)]],
      momentary_voltage: ['', [Validators.required, Validators.min(0)]],
      final_voltage: ['', [Validators.required, Validators.min(0)]],
      peak_observed: [''],
      final_value: [''],
      recovery_observed: ['', [Validators.required, Validators.min(0)]],
      status: ['', Validators.required],
    });
  }

  private createVoltageBalanceRowGroup(): FormGroup {
    return this.fb.group({
      line_voltage_ry: ['', [Validators.required, Validators.min(0)]],
      line_voltage_yb: ['', [Validators.required, Validators.min(0)]],
      line_voltage_br: ['', [Validators.required, Validators.min(0)]],
      difference: [''],
      permissible_limit: [''],
      status: ['', Validators.required],
    });
  }

  private createVoltageRangeRowGroup(): FormGroup {
    return this.fb.group({
      voltage_lowest: ['', [Validators.required, Validators.min(0)]],
      voltage_highest: ['', [Validators.required, Validators.min(0)]],
      status: ['', Validators.required],
    });
  }

  private setupGtgSpeedControlCalculations(): void {
    const onSteady = this.form.get('phm_on_steady_state') as FormArray;
    const offSteady = this.form.get('phm_off_steady_state') as FormArray;
    const nominalControl = this.form.get('nominal_frequency');
    if (!onSteady || !offSteady || !nominalControl) return;

    const speedFieldChanges = [...onSteady.controls, ...offSteady.controls].flatMap((row) => {
      const initial = row.get('initial_speed_hz');
      const final = row.get('final_speed_hz');
      return [initial?.valueChanges, final?.valueChanges].filter(Boolean);
    });

    const subscription = merge(nominalControl.valueChanges, ...speedFieldChanges)
      .pipe(debounceTime(100))
      .subscribe(() => this.updateGtgSpeedControlCalculations());

    this.speedControlSubscriptions.push(subscription);
  }

  private updateGtgSpeedControlCalculations(): void {
    const nominalFrequency = parseFrequency(this.form.get('nominal_frequency')?.value);

    const onSteady = this.form.get('phm_on_steady_state') as FormArray;
    onSteady?.controls.forEach((rowGroup) => {
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

    const offSteady = this.form.get('phm_off_steady_state') as FormArray;
    if (!offSteady) return;

    const droopRow = offSteady.at(GTG_GOVERNOR_DROOP_ROW_INDEX);
    const governorDroop = calculateGovernorDroop(
      parseFrequency(droopRow.get('initial_speed_hz')?.value),
      parseFrequency(droopRow.get('final_speed_hz')?.value),
    );
    droopRow
      .get('governor_droop')
      ?.setValue(governorDroop !== null ? roundFrequencyCalculation(governorDroop) : '', {
        emitEvent: false,
      });
    droopRow
      .get('status')
      ?.setValue(evaluateGovernorDroopStatus(governorDroop), { emitEvent: false });

    offSteady.controls.forEach((rowGroup, index) => {
      const rowMeta = GTG_STEADY_STATE_OFF_ROWS[index];
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

  private setupGtgTransientCalculations(arrayName: string): void {
    const transient = this.form.get(arrayName) as FormArray;
    const nominalControl = this.form.get('nominal_frequency');
    if (!transient || !nominalControl) return;

    const fieldChanges = transient.controls.flatMap((row) => {
      const names = [
        'initial_speed_hz',
        'momentary_speed_hz',
        'final_speed_hz',
        'recovery_observed',
      ];
      return names.map((name) => row.get(name)?.valueChanges).filter(Boolean);
    });

    const subscription = merge(
      transient.valueChanges,
      nominalControl.valueChanges,
      ...fieldChanges,
    )
      .pipe(debounceTime(100))
      .subscribe(() => {
        this.updateGtgTransientCalculations('phm_on_transient', GTG_PHM_TRANSIENT_ON_ROWS);
        this.updateGtgTransientCalculations('phm_off_transient', GTG_PHM_TRANSIENT_OFF_ROWS);
      });

    this.transientTestSubscriptions.push(subscription);
  }

  private updateGtgTransientCalculations(
    arrayName: string,
    rowMeta: GtgPhmTransientRow[],
  ): void {
    const transient = this.form.get(arrayName) as FormArray;
    const nominalFrequency = parseFrequency(this.form.get('nominal_frequency')?.value);
    if (!transient) return;

    transient.controls.forEach((rowGroup, index) => {
      const meta = rowMeta[index];
      if (!meta) return;
      const peakObserved = calculatePeakPercent(
        parseFrequency(rowGroup.get('initial_speed_hz')?.value),
        parseFrequency(rowGroup.get('momentary_speed_hz')?.value),
        nominalFrequency,
      );

      const sourceFinalSpeed =
        arrayName === 'phm_off_transient'
          ? this.getMatchingOnFinalSpeed(meta.loadInitial, meta.loadTo)
          : parseFrequency(rowGroup.get('final_speed_hz')?.value);
      const recoveryFinalValue = calculateTransientRecoveryFinalValue(
        sourceFinalSpeed,
        meta.loadInitial,
        meta.loadTo,
      );

      this.patchCalculatedControl(
        rowGroup.get('peak_observed'),
        peakObserved !== null ? roundFrequencyCalculation(peakObserved) : '',
      );
      this.patchCalculatedControl(
        rowGroup.get('recovery_final_value'),
        recoveryFinalValue !== null ? roundFrequencyCalculation(recoveryFinalValue) : '',
      );

      this.patchCalculatedControl(
        rowGroup.get('status'),
        evaluateTransientRowStatus(
          arrayName === 'phm_on_transient' ? 'on' : 'off',
          meta.loadInitial,
          meta.loadTo,
          peakObserved,
          parseFrequency(rowGroup.get('recovery_observed')?.value),
        ),
      );
    });
  }

  private getMatchingOnFinalSpeed(loadInitial: string, loadTo: string): number | null {
    const onRows = this.form.get('phm_on_transient') as FormArray;
    const index = GTG_PHM_TRANSIENT_ON_ROWS.findIndex(
      (row) => row.loadInitial === loadInitial && row.loadTo === loadTo,
    );
    if (index < 0 || !onRows) return null;
    return parseFrequency(onRows.at(index)?.get('final_speed_hz')?.value);
  }

  private setupGovernorAuxCalculations(): void {
    const range = this.form.get('governor_range') as FormArray;
    const rate = this.form.get('governor_rate') as FormArray;
    const governorType = this.form.get('governor_type');
    const ratedFrequency = this.form.get('alternator_rated_frequency');
    const nominalFrequency = this.form.get('nominal_frequency');
    if (!range || !rate) return;

    const subscription = merge(
      range.valueChanges,
      rate.valueChanges,
      governorType?.valueChanges ?? range.valueChanges,
      ratedFrequency?.valueChanges ?? range.valueChanges,
      nominalFrequency?.valueChanges ?? range.valueChanges,
    )
      .pipe(debounceTime(100))
      .subscribe(() => this.updateGovernorAuxCalculations());

    this.governorAuxSubscriptions.push(subscription);
  }

  private updateGovernorAuxCalculations(): void {
    const ratedFrequency =
      parseFrequency(this.form.get('alternator_rated_frequency')?.value) ??
      parseFrequency(this.form.get('nominal_frequency')?.value);
    const rangeLimits = calculateGovernorRangeLimits(
      this.form.get('governor_type')?.value,
      ratedFrequency,
    );

    const range = this.form.get('governor_range') as FormArray;
    range?.controls.forEach((rowGroup) => {
      this.patchCalculatedControl(
        rowGroup.get('status'),
        evaluateGovernorRangeStatus(
          parseFrequency(rowGroup.get('measured_frequency_hz')?.value),
          rangeLimits,
        ),
      );
    });

    const rate = this.form.get('governor_rate') as FormArray;
    rate?.controls.forEach((rowGroup) => {
      this.patchCalculatedControl(
        rowGroup.get('status'),
        evaluateGovernorRateStatus(
          parseFrequency(rowGroup.get('rate_up')?.value),
          parseFrequency(rowGroup.get('rate_down')?.value),
        ),
      );
    });
  }

  private setupVoltageControlCalculations(): void {
    const steadyState = this.form.get('voltage_steady_state') as FormArray;
    const nominalControl = this.form.get('nominal_voltage');
    const transient = this.form.get('voltage_transient') as FormArray;
    const voltageBalance = this.form.get('voltage_balance') as FormArray;
    const voltageRangeAvr = this.form.get('voltage_range_avr') as FormArray;
    const voltageRangeHand = this.form.get('voltage_range_hand') as FormArray;
    const ratedVoltageControl = this.form.get('alternator_rated_voltage');
    if (!steadyState || !nominalControl || !transient) return;

    const subscription = merge(
      nominalControl.valueChanges,
      steadyState.valueChanges,
      transient.valueChanges,
      voltageBalance.valueChanges,
      voltageRangeAvr?.valueChanges ?? nominalControl.valueChanges,
      voltageRangeHand?.valueChanges ?? nominalControl.valueChanges,
      ratedVoltageControl?.valueChanges ?? nominalControl.valueChanges,
    )
      .pipe(debounceTime(100))
      .subscribe(() => this.updateVoltageControlCalculations());

    this.voltageControlSubscriptions.push(subscription);
  }

  private updateVoltageControlCalculations(): void {
    const steadyState = this.form.get('voltage_steady_state') as FormArray;
    const nominalControl = this.form.get('nominal_voltage');
    const transient = this.form.get('voltage_transient') as FormArray;
    if (!steadyState || !nominalControl || !transient) return;

    const noLoadVolts = this.getVoltageSteadyStateAverage(steadyState, 0);
    const fullLoadVolts = this.getVoltageSteadyStateAverage(steadyState, 4);
    const calculatedNominal = calculateNominalFrequency(noLoadVolts, fullLoadVolts);
    if (calculatedNominal !== null) {
      nominalControl.patchValue(roundFrequencyCalculation(calculatedNominal), { emitEvent: false });
    }
    const nominalVoltage = parseFrequency(nominalControl.value) ?? calculatedNominal ?? null;

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
      const rowMeta = GTG_VOLTAGE_TRANSIENT_ROWS[index];
      const peakObserved = calculatePeakPercent(
        parseFrequency(rowGroup.get('initial_voltage')?.value),
        parseFrequency(rowGroup.get('momentary_voltage')?.value),
        nominalVoltage,
      );
      const finalVoltage = parseFrequency(rowGroup.get('final_voltage')?.value);
      this.patchCalculatedControl(
        rowGroup.get('peak_observed'),
        peakObserved !== null ? roundFrequencyCalculation(peakObserved) : '',
      );
      this.patchCalculatedControl(rowGroup.get('final_value'), finalVoltage ?? '');
      this.patchCalculatedControl(
        rowGroup.get('status'),
        evaluatePeakStatus(peakObserved, parsePercentLabel(rowMeta.peakPermissibleLimit)),
      );
    });

    const voltageBalance = this.form.get('voltage_balance') as FormArray;
    voltageBalance?.controls.forEach((rowGroup) => {
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

    const ratedVoltage =
      parseFrequency(this.form.get('alternator_rated_voltage')?.value) ?? nominalVoltage;
    const rangeBounds = calculateVoltageRangeBounds(ratedVoltage);
    this.patchCalculatedControl(
      this.form.get('voltage_range_permissible_limit'),
      formatVoltageRangePermissibleLimit(rangeBounds),
    );

    ['voltage_range_avr', 'voltage_range_hand'].forEach((arrayName) => {
      const rangeRows = this.form.get(arrayName) as FormArray;
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

  private createParallelingSharingRowGroup(): FormGroup {
    return this.fb.group({
      combined_val: [''],
      proportionate_a: [''],
      proportionate_b: [''],
      machine_a: ['', [Validators.min(0)]],
      machine_b: ['', [Validators.min(0)]],
      difference: [''],
      tolerance_band: [''],
      status: [''],
    });
  }

  private createParallelingTrialRowGroup(): FormGroup {
    const sharingControls: Record<string, FormGroup> = {};
    for (const config of PARALLELING_SHARING_ROWS) {
      sharingControls[this.parallelingSharingControlName(config, 'kw')] =
        this.createParallelingSharingRowGroup();
      sharingControls[this.parallelingSharingControlName(config, 'kva')] =
        this.createParallelingSharingRowGroup();
    }

    return this.fb.group({
      paralleling_trial_machine_1: ['', Validators.required],
      paralleling_trial_machine_2: ['', Validators.required],
      parallel_rated_dg1: ['', [Validators.min(0)]],
      parallel_rated_dg2: ['', [Validators.min(0)]],
      parallel_amps_dg1: ['', [Validators.min(0)]],
      parallel_amps_dg2: ['', [Validators.min(0)]],
      ...sharingControls,
    });
  }

  private setupParallelingCalculations(): void {
    const rowsControl = this.form.get('dynamic_paralleling_trial_rows');
    if (!rowsControl) return;

    const subscription = merge(rowsControl.valueChanges)
      .pipe(debounceTime(100))
      .subscribe(() => this.updateParallelingCalculations());
    this.parallelingSubscriptions.push(subscription);
  }

  private updateParallelingCalculations(): void {
    this.dynamicParallelingTrialRows.controls.forEach((rowGroup) => {
      const ratedA = parseFrequency(rowGroup.get('parallel_rated_dg1')?.value);
      const ratedB = parseFrequency(rowGroup.get('parallel_rated_dg2')?.value);
      let sharedTolerance: number | null = null;
      if (ratedA !== null && ratedB !== null) {
        sharedTolerance = roundFrequencyCalculation(0.1 * ((ratedA + ratedB) / 2));
      }

      for (const config of PARALLELING_SHARING_ROWS) {
        for (const unit of ['kw', 'kva'] as const) {
          const sharingGroup = rowGroup.get(this.parallelingSharingControlName(config, unit));
          if (!sharingGroup) continue;

          const machineA = parseFrequency(sharingGroup.get('machine_a')?.value);
          const machineB = parseFrequency(sharingGroup.get('machine_b')?.value);
          const calculated = calculateParallelingSharing(
            config.loadPercent,
            ratedA,
            ratedB,
            machineA,
            machineB,
          );

          this.patchCalculatedControl(
            sharingGroup.get('combined_val'),
            calculated.combinedVal !== null ? roundFrequencyCalculation(calculated.combinedVal) : '',
          );
          this.patchCalculatedControl(
            sharingGroup.get('proportionate_a'),
            calculated.proportionateA !== null
              ? roundFrequencyCalculation(calculated.proportionateA)
              : '',
          );
          this.patchCalculatedControl(
            sharingGroup.get('proportionate_b'),
            calculated.proportionateB !== null
              ? roundFrequencyCalculation(calculated.proportionateB)
              : '',
          );
          this.patchCalculatedControl(
            sharingGroup.get('difference'),
            calculated.difference !== null ? roundFrequencyCalculation(calculated.difference) : '',
          );
          this.patchCalculatedControl(
            sharingGroup.get('tolerance_band'),
            sharedTolerance ?? '',
          );
          this.patchCalculatedControl(
            sharingGroup.get('status'),
            evaluateParallelingSharingStatus(calculated.difference, sharedTolerance),
          );
        }
      }
    });
  }

  private getVoltageSteadyStateAverage(steadyState: FormArray, index: number): number | null {
    const row = steadyState.at(index);
    const max = parseFrequency(row.get('volts_max')?.value);
    const min = parseFrequency(row.get('volts_min')?.value);
    if (max !== null && min !== null) return (max + min) / 2;
    return max ?? min;
  }

}
