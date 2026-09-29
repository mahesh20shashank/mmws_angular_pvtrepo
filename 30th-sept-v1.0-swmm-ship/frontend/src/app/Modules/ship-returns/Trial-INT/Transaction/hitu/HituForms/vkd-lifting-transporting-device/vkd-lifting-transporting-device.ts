import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ToastComponent } from '../../../../ui/toast/toast.component';
import { SelectComponent } from '../../../../ui/select.component';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { Apiendpoints } from '../../../../ApiEndPoints';
import { CalenderComponent } from '../../../../ui/calender.component';
import { ParameterCardComponent } from '../../../../ui/parameter-card/parameter-card.component';
import { MonthYearCalendarComponent } from '../../../../ui/month-year-calendar.component';
import { InputComponent } from '../../../../ui/input.component';
import {
  FileUploadComponent,
  UploadedFileItem,
} from '../../../../ui/file-upload/file-upload.component';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-vkd-lifting-transporting-device',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    SelectComponent,
    CalenderComponent,
    MonthYearCalendarComponent,
    InputComponent,
    ApprovalWorkFlow,
  ],
  templateUrl: './vkd-lifting-transporting-device.html',
  styleUrl: './vkd-lifting-transporting-device.css',
})
export class VkdLiftingTransportingDevice {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;

  readonly restartIcon = 'rotate-ccw';

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  form!: FormGroup;
  loading = false;

  showApprovalWorkflowPopup = false;
  isSubmitTime = false;

  uploadedAuthorityFiles: UploadedFileItem[] = [];

  commandOptions: any[] = [];
  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  placesOptions: any[] = [];

  occasionOptions = [
    { label: 'Pre Refit Trials', value: 'pre_refit_trials' },
    { label: 'End of Refit Trials', value: 'end_of_refit_trials' },
    { label: 'Surprice Checks', value: 'surprice_checks' },
  ];

  // Nil / Observation dropdown
  // Nil → SAT | Observation → dialog box (Ser 7, 20)
  nilObservationOptions = [
    { label: 'Nil', value: 'Nil' },
    { label: 'Observation', value: 'Observation' },
  ];

  // Ser 10: Gear Box noise
  noiseObservedOptions = [
    { label: 'Nil', value: 'Nil' },
    { label: 'Noise Observed', value: 'Noise Observed' },
  ];

  // Ser 14: Visual Inspection / Foundations
  ObservationsOptions = [
    { label: 'No Observation', value: 'NoObservation' },
    { label: 'Observation', value: 'Observation' },
  ];

  // Ser 11: Oil level options
  // 40-100% filled → SAT | Less than 40% → SAT with observation | Empty → UNSAT
  oilLevelOptions = [
    { label: '40-100% filled', value: '40-100' },
    { label: 'Less than 40% filled', value: 'less_than_40' },
    { label: 'Empty', value: 'Empty' },
  ];

  // Ser 12: Oil type reference dropdown
  oilTypeOptions = [
    { label: 'OC300', value: 'OC300' },
    { label: 'SS320', value: 'SS320' },
    { label: 'Others', value: 'Others' },
  ];

  // Ser 15: Greased / Not Greased
  greasedOptions = [
    { label: 'Greased', value: 'Greased' },
    { label: 'Not Greased', value: 'Not Greased' },
  ];

  // Ser 16: Grease nipple condition
  // Charged → SAT | Painted/Choked/Missing → UNSAT | Others → dialog box
  greaseNippleOptions = [
    { label: 'Charged', value: 'Charged' },
    { label: 'Painted', value: 'Painted' },
    { label: 'Choked', value: 'Choked' },
    { label: 'Missing', value: 'Missing' },
    { label: 'Others', value: 'Others' },
  ];

  // Ser 9 / 18 / 19: Ops status (NA / Ops / Non-ops)
  opsStatusNaOptions = [
    { label: 'NA', value: 'NA' },
    { label: 'Ops', value: 'Ops' },
    { label: 'Non-ops', value: 'Non-ops' },
  ];

  // Ser 9 (switches): Ops / Non-ops only
  opsStatusOptions = [
    { label: 'Ops', value: 'Ops' },
    { label: 'Non-ops', value: 'Non-ops' },
  ];

  // Ser 9 (JB Control): SAT / SAT with observation / UNSAT
  jbControlObservationOptions = [
    { label: 'Nil', value: 'Nil' },
    { label: 'SAT with observation', value: 'SAT with observation' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  SatUnsatOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  // Used when Observation is selected (Ser 7, 20)
  SatWithObsUnsatOptions = [
    { label: 'SAT with Observation', value: 'SAT with Observation' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  overallRemarksOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
    { label: 'SAT with observations', value: 'SAT with observations' },
  ];

  overallRemarksNaOptions = [
    { label: 'NA', value: 'NA' },
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
    { label: 'SAT with observations', value: 'SAT with observations' },
  ];

  yesNoOptions = [
    { label: 'Yes', value: 'Yes' },
    { label: 'No', value: 'No' },
  ];

  // Ser 30: Log book options
  // Yes, updated → SAT | Yes, but not updated → SAT with Observation | Not Held → UNSAT
  logBookOptions = [
    { label: 'Yes, updated', value: 'Yes_updated' },
    { label: 'Yes, but not updated', value: 'Yes_not_updated' },
    { label: 'Not Held', value: 'Not Held' },
  ];

  // Ser 22: SPM Check with NA option
  spmCheckOptions = [
    { label: 'NA (Motor fitted inside the capstan casing)', value: 'NA' },
    { label: 'Green', value: 'Green' },
    { label: 'Yellow', value: 'Yellow' },
    { label: 'Red', value: 'Red' },
  ];

  // Ser 32: SPM CBPM (no NA option)
  spmColorOptions = [
    { label: 'Green', value: 'Green' },
    { label: 'Yellow', value: 'Yellow' },
    { label: 'Red', value: 'Red' },
  ];

  // ---- Show/hide booleans for conditional rendering ----

  // Ser 7: wire rope status Observation → dialog input + SatWithObsUnsatOptions
  showWireRopeObservationInput = false;

  // Ser 9 JB Control: SAT with Obs or UNSAT → dialog box
  showJbControlInput = false;

  // Ser 9 Ops Switches: Non-ops → dialog box
  showOpsSwitchesInput = false;

  // Ser 9 Ops Indicators: Non-ops → dialog box
  showOpsIndicatorsInput = false;

  // Ser 10: Noise Observed → UNSAT + dialog box
  showGearBoxInput = false;

  // Ser 14: Observation → show 4 sub-input dialog boxes
  showFoundationInspectionFields = false;

  // Ser 16: Others → dialog box
  showGreasePointsInput = false;

  // Ser 18: Non-ops → dialog box
  showEmergencyModeInput = false;

  // Ser 19: Non-ops → dialog box
  showLimitSwitchInput = false;

  // Ser 20: Observation → dialog input + SatWithObsUnsatOptions
  showPulleyObservationInput = false;

  // ------------------------------- EQUIPMENT TABS -------------------------------
  eqpList: any[] = [];
  activeTab: any = null;
  workflowTrialId: string | undefined = undefined;

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
    return (
      this.activeTab ||
      this.formApiService?.currentEquipmentNomenclature ||
      null
    );
  }

  get activeEquipmentId(): number | null {
    return (
      this.activeHeaderEquipment?.equipment_id ??
      this.activeHeaderEquipment?.id ??
      null
    );
  }
  // -------------------------------------------------------------------------------

  constructor(
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private toastService: ToastService,
    private route: ActivatedRoute,
    private toast: ToastService,
    public formApiService: FormApiService,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadPlaceOfConductTrail();
    this.setupConditionalLogic();
    this.loadTrialPrefillFromQuery();

    if (this.rowId) {
      this.editMode = true;
      this.getEditDataByRowId(this.rowId);
    }
  }

  buildForm() {
    this.form = this.fb.group({
      // Header fields
      ship: ['', Validators.required],
      class_of_ship: [''],
      date_of_inspection: [''],
      // place_of_conduct_trail: ['', Validators.required],
      // occasion_of_conduct_trail: ['', Validators.required],
      date_of_conduct_trail: [''],
      authority: [''],
      authority_date: [''],
      jb_control_observation_value_1: [''],
      ops_switches_value_1: [''],
      ops_indicators_value_1: [''],

      // Ser 1: Make (alphanumeric)
      // make: [''],
      manufacturer_name: [{ value: '', disabled: true }],

      // Ser 2: Type (alphanumeric)
      type: [''],

      // Ser 3: Year of Manufacture (CMMS dropdown)
      year_of_manufacture: [''],

      // Ser 4: Load Testing
      // < 27 months from last date of Load Test → SAT | > 27 months → UNSAT
      load_testing_last_date: [''],
      load_testing_last_month_year: [''],
      load_testing_next_due: [''],
      load_testing_remark: [''],

      // Ser 5: Load Testing of Wire Rope
      // < 27 months from last date of Load Test → SAT | > 27 months → UNSAT
      wire_rope_load_test_last_date: [''],
      wire_rope_load_test_last_month_year: [''],
      wire_rope_load_test_next_due: [''],
      wire_rope_load_test_remark: [''],

      // Ser 6: Serviceability Checks / Visual Survey of Rope
      // < 12 months from last date of serviceability → SAT | > 12 months → UNSAT
      serviceability_last_date: [''],
      serviceability_last_month_year: [''],
      serviceability_next_due: [''],
      serviceability_remark: [''],

      // Ser 7: Check wire rope for signs of excessive wear, corrosion or other defects
      // Nil → SAT | Observation → dialog box → SAT with Observation / UNSAT
      wire_rope_status: [''],
      wire_rope_status_observation: [''],
      wire_rope_status_remark: [''],

      // Ser 8: Wire Rope fitment
      // < 5 years (60 months) from fitment → SAT | > 5 years → UNSAT
      wire_rope_fitment_date: [''],
      wire_rope_fitment_month_year: [''],
      wire_rope_replacement_due: [''],
      wire_rope_fitment_remark: [''],

      // Ser 9: Condition of JB/Control
      // Nil → SAT | SAT with observation → dialog | UNSAT → dialog
      jb_control_observation: [''],
      jb_control_observation_value: [''],
      jb_control_remark: [''],
      // Ops status of switches: Ops → SAT | Non-ops → UNSAT + dialog
      ops_switches: [''],
      ops_switches_value: [''],
      ops_switches_remark: [''],
      // Ops status of indicators: NA → NA | Ops → SAT | Non-ops → UNSAT + dialog
      ops_indicators: [''],
      ops_indicators_value: [''],
      ops_indicators_remark: [''],

      // Ser 10: Condition of Gear Box
      // Nil → SAT | Noise Observed → UNSAT + dialog box
      condition_gear_box: [''],
      condition_gear_box_value: [''],
      condition_gear_box_remark: [''],
      condition_gear_box_value_1: [''],

      // Ser 11: Oil level in Gear Box
      // 40-100% filled → SAT | Less than 40% → SAT with observation | Empty → UNSAT
      oil_level_gear_box: [''],
      oil_level_gear_box_remark: [''],

      // Ser 12: Oil in Gear Box as per Maintops/Manual
      // Yes → SAT | No → UNSAT
      oil_type_reference: [''],
      oil_type_measured: [''],
      oil_type_remark: [''],

      // Ser 13: Change of Oil (in Drum and Gear Box)
      // < 12 months from last date of oil change → SAT | > 12 months → UNSAT
      oil_change_last_date: [''],
      oil_change_next_due: [''],
      oil_change_remark: [''],

      // Ser 14: Condition of Foundations and Plating under Foundation
      // No Observation → SAT | Observation → 4 dialog boxes
      foundation_inspection: [''],
      foundation_inspection_remark: [''],
      foundation_corrosion: [''],
      foundation_pitting: [''],
      foundation_unpainted: [''],
      foundation_others: [''],

      // Ser 15: Greasing of Mechanical Part
      // Greased → SAT | Not Greased → UNSAT
      greasing_mechanical: [''],
      greasing_mechanical_remark: [''],

      // Ser 16: Greasing Points
      // Charged → SAT | Painted/Choked/Missing → UNSAT | Others → dialog box
      grease_points: [''],
      grease_points_remark: [''],
      grease_points_value: [''],

      // Ser 17: Operation Trials Manual (m/min) — all alphanumeric
      hoisting_speed: [''],
      hoisting_speed_remark: [''],
      power_lowering_speed: [''],
      power_lowering_speed_remark: [''],
      gravity_lowering_speed: [''],
      gravity_lowering_speed_remark: [''],
      slewing_speed: [''],
      slewing_speed_remark: [''],

      // Ser 18: Emergency Mode Operation
      // Ops → SAT | Non-ops → UNSAT + dialog box
      emergency_mode: [''],
      emergency_mode_value: [''],
      emergency_mode_remark: [''],
      emergency_mode_value_1: [''],

      // Ser 19: Limit Switch
      // Ops → SAT | Non-ops → UNSAT + dialog box
      limit_switch: [''],
      limit_switch_value: [''],
      limit_switch_remark: [''],
      limit_switch_value_1: [''],

      // Ser 20: Condition of Pulley
      // Nil → SAT | Observation → dialog box → SAT with Observation / UNSAT
      pulley_condition: [''],
      pulley_condition_value: [''],
      pulley_condition_remark: [''],

      // Ser 21: Insulation of Motor and Cable
      // >= 2 M Ohms → SAT | < 2 M Ohms → UNSAT
      insulation_motor_value: [''],
      insulation_motor_remark: [''],

      // Ser 22: SPM Check of Motor (For Motor Vibration)
      // NA → NA | Green → SAT | Yellow → SAT with observation | Red → UNSAT
      spm_check_measured: [''],
      spm_check_remark: [''],

      // Ser 23: Any other observations (pre-CBPM)
      other_observation_pre: [''],

      // Ser 24: Overall Remarks (pre-CBPM, auto-computed)
      overall_remark_pre: [''],

      // CBPM Parameters

      // Ser 25: Oil being used in gear box (alphanumeric)
      oil_being_used: [''],

      // Ser 26: Oil level of gear box
      oil_level_observation: [''],
      oil_level_remark_cbpm: [''],
      lub_oil_last_changed_date: [''],
      lub_oil_remark: [''],

      // Ser 27: Lub oil analysis parameters (all alphanumeric)
      lub_water_content: [''],
      lub_viscosity: [''],
      lub_base_number: [''],
      lub_acid_number: [''],
      lub_metal_traces: [''],

      // Ser 28: Starting current (alphanumeric)
      starting_current: [''],

      // Ser 29: Running current (alphanumeric)
      running_current: [''],

      // Ser 30: Log book exist
      // Yes, updated → SAT | Yes, but not updated → SAT with Observation | Not Held → UNSAT
      log_book_measured: [''],
      log_book_remarks: [''],

      // Ser 31: Periodicity of measurement (alphanumeric)
      periodicity_measurement: [''],

      // Ser 32: SPM (CBPM)
      // Green → SAT | Yellow → SAT with observation | Red → UNSAT
      spm_cbpm_measured: [''],
      spm_cbpm_remark: [''],

      // Ser 33: Any other observation (CBPM)
      other_observation: [''],

      // Ser 34: Overall remarks (auto-computed, disabled)
      overall_remark: [''],
    });
  }

  setupConditionalLogic() {
    // -------- Ser 4: Load Testing --------
    // < 27 months → SAT | >= 27 months → UNSAT
    this.form.get('load_testing_last_date')?.valueChanges.subscribe((value) => {
      this.computeNextDueAndRemark(
        value,
        27,
        'load_testing_next_due',
        'load_testing_remark',
      );
    });

    // -------- Ser 5: Load Testing of Wire Rope --------
    // < 27 months → SAT | >= 27 months → UNSAT
    this.form
      .get('wire_rope_load_test_last_date')
      ?.valueChanges.subscribe((value) => {
        this.computeNextDueAndRemark(
          value,
          27,
          'wire_rope_load_test_next_due',
          'wire_rope_load_test_remark',
        );
      });

    // -------- Ser 6: Serviceability Checks --------
    // < 12 months → SAT | >= 12 months → UNSAT
    this.form
      .get('serviceability_last_date')
      ?.valueChanges.subscribe((value) => {
        this.computeNextDueAndRemark(
          value,
          12,
          'serviceability_next_due',
          'serviceability_remark',
        );
      });

    // -------- Ser 7: Check wire rope status --------
    this.form.get('wire_rope_status')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('wire_rope_status_remark');
      const observationControl = this.form.get('wire_rope_status_observation');

      this.showWireRopeObservationInput = false;
      observationControl?.reset();

      // Enable first because it might have been disabled previously
      remarkControl?.enable({ emitEvent: false });

      if (value === 'Nil') {
        // Nil → SAT
        remarkControl?.setValue('SAT', { emitEvent: false });
        remarkControl?.disable({ emitEvent: false });
      } else if (value === 'Observation') {
        // Observation → Show textbox and keep remark enabled
        this.showWireRopeObservationInput = true;
        remarkControl?.reset('', { emitEvent: false });
      } else {
        remarkControl?.reset('', { emitEvent: false });
      }
    });
    // -------- Ser 8: Wire Rope Fitment --------
    // < 60 months (5 years) → SAT | >= 60 months → UNSAT
    this.form.get('wire_rope_fitment_date')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('wire_rope_fitment_remark');
      const nextDueControl = this.form.get('wire_rope_replacement_due');

      if (!value) {
        remarkControl?.setValue(null);
        return;
      }

      remarkControl?.disable({ emitEvent: false });

      const fitmentDate = new Date(value);
      const now = new Date();
      const monthsDiff = this.getMonthsDiff(fitmentDate, now);

      const replacementDue = new Date(fitmentDate);
      replacementDue.setMonth(replacementDue.getMonth() + 60);
      nextDueControl?.setValue(this.formatMonthYear(replacementDue), {
        emitEvent: false,
      });

      remarkControl?.setValue(monthsDiff < 60 ? 'SAT' : 'UNSAT');
    });

    // -------- Ser 9: Condition of JB/Control --------
    // Nil → SAT | SAT with observation → dialog box | UNSAT → dialog box
    this.form.get('jb_control_observation')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('jb_control_remark');
      const valueControl = this.form.get('jb_control_observation_value');

      this.showJbControlInput = false;
      valueControl?.reset();
      remarkControl?.enable({ emitEvent: false });

      if (value === 'Nil') {
        remarkControl?.setValue('SAT');
        // remarkControl?.disable();
        remarkControl?.disable({ emitEvent: false });
      } else if (value === 'SAT with observation') {
        this.showJbControlInput = true;
        remarkControl?.setValue('SAT with observation');
        // remarkControl?.disable();
      } else if (value === 'UNSAT') {
        this.showJbControlInput = true;
        remarkControl?.setValue('');
        // remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // -------- Ser 9: Ops status of switches --------
    // Ops → SAT | Non-ops → UNSAT + dialog box
    this.form.get('ops_switches')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('ops_switches_remark');
      const valueControl = this.form.get('ops_switches_value');

      this.showOpsSwitchesInput = false;
      valueControl?.reset();

      if (value === 'Ops') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Non-ops') {
        this.showOpsSwitchesInput = true;
        remarkControl?.setValue('');
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // -------- Ser 9: Ops status of indicators --------
    // NA → NA | Ops → SAT | Non-ops → UNSAT + dialog box
    this.form.get('ops_indicators')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('ops_indicators_remark');
      const valueControl = this.form.get('ops_indicators_value');

      this.showOpsIndicatorsInput = false;
      valueControl?.reset();

      const remarkMap: Record<string, string> = {
        NA: 'NA',
        Ops: 'SAT',
      };

      if (value === 'Non-ops') {
        this.showOpsIndicatorsInput = true;
        remarkControl?.setValue('');
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(remarkMap[value] ?? null);
        remarkControl?.disable();
      }
    });

    // -------- Ser 10: Condition of Gear Box --------
    // Nil → SAT | Noise Observed → UNSAT + dialog box
    this.form.get('condition_gear_box')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('condition_gear_box_remark');
      const valueControl = this.form.get('condition_gear_box_value');

      this.showGearBoxInput = false;
      valueControl?.reset();

      if (value === 'Nil') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Noise Observed') {
        this.showGearBoxInput = true;
        remarkControl?.setValue('');
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // -------- Ser 11: Oil level in Gear Box --------
    // 40-100% filled → SAT | Less than 40% → SAT with observation | Empty → UNSAT
    this.form.get('oil_level_gear_box')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('oil_level_gear_box_remark');

      const remarkMap: Record<string, string> = {
        '40-100': 'SAT',
        less_than_40: 'SAT with observations',
        Empty: 'UNSAT',
      };

      remarkControl?.setValue(remarkMap[value] ?? null);
      remarkControl?.disable();
    });

    // -------- Ser 12: Oil in Gear Box as per Maintops/Manual --------
    // Yes → SAT | No → UNSAT
    this.form.get('oil_type_measured')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('oil_type_remark');

      if (value === 'Yes') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'No') {
        remarkControl?.setValue('UNSAT');
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // -------- Ser 13: Change of Oil --------
    // < 12 months from last date of oil change → SAT | >= 12 months → UNSAT
    this.form.get('oil_change_last_date')?.valueChanges.subscribe((value) => {
      this.computeNextDueAndRemark(
        value,
        12,
        'oil_change_next_due',
        'oil_change_remark',
      );
    });

    // -------- Ser 14: Condition of Foundations --------
    // No Observation → SAT | Observation → 4 dialog boxes
    this.form.get('foundation_inspection')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('foundation_inspection_remark');

      this.showFoundationInspectionFields = false;
      this.form.get('foundation_corrosion')?.reset();
      this.form.get('foundation_pitting')?.reset();
      this.form.get('foundation_unpainted')?.reset();
      this.form.get('foundation_others')?.reset();

      if (value === 'NoObservation' || value === 'No Observation') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Observation') {
        this.showFoundationInspectionFields = true;
        remarkControl?.setValue(null);
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // -------- Ser 15: Greasing of Mechanical Part --------
    // Greased → SAT | Not Greased → UNSAT
    this.form.get('greasing_mechanical')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('greasing_mechanical_remark');

      if (value === 'Greased') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Not Greased') {
        remarkControl?.setValue('UNSAT');
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // -------- Ser 16: Greasing Points --------
    // Charged → SAT | Painted/Choked/Missing → UNSAT | Others → dialog box
    this.form.get('grease_points')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('grease_points_remark');
      const valueControl = this.form.get('grease_points_value');

      this.showGreasePointsInput = false;
      valueControl?.reset();

      if (value === 'Charged') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (['Painted', 'Choked', 'Missing'].includes(value)) {
        remarkControl?.setValue('UNSAT');
        remarkControl?.disable();
      } else if (value === 'Others') {
        this.showGreasePointsInput = true;
        remarkControl?.setValue(null);
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // -------- Ser 18: Emergency Mode Operation --------
    // Ops → SAT | Non-ops → UNSAT + dialog box
    this.form.get('emergency_mode')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('emergency_mode_remark');
      const valueControl = this.form.get('emergency_mode_value');

      this.showEmergencyModeInput = false;
      valueControl?.reset();

      if (value === 'Ops') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Non-ops') {
        this.showEmergencyModeInput = true;
        remarkControl?.setValue('');
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // -------- Ser 19: Limit Switch --------
    // Ops → SAT | Non-ops → UNSAT + dialog box
    this.form.get('limit_switch')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('limit_switch_remark');
      const valueControl = this.form.get('limit_switch_value');

      this.showLimitSwitchInput = false;
      valueControl?.reset();

      if (value === 'Ops') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Non-ops') {
        this.showLimitSwitchInput = true;
        remarkControl?.setValue('');
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // -------- Ser 20: Condition of Pulley --------
    // Nil → SAT | Observation → dialog + SatWithObsUnsatOptions
    // -------- Ser : Condition of Pulley --------
    this.form.get('pulley_condition')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('pulley_condition_remark');
      const valueControl = this.form.get('pulley_condition_value');

      this.showPulleyObservationInput = false;
      valueControl?.reset();

      // Enable first in case it was disabled previously
      remarkControl?.enable({ emitEvent: false });

      if (value === 'Nil') {
        // Nil → SAT
        remarkControl?.setValue('SAT', { emitEvent: false });
        remarkControl?.disable({ emitEvent: false });
      } else if (value === 'Observation') {
        // Observation → Show textbox and allow dropdown selection
        this.showPulleyObservationInput = true;
        remarkControl?.reset('', { emitEvent: false });
        // Keep enabled
      } else {
        remarkControl?.reset('', { emitEvent: false });
      }
    });
    // -------- Ser 21: Insulation of Motor and Cable --------
    // >= 2 M Ohms → SAT | < 2 M Ohms → UNSAT
    this.form.get('insulation_motor_value')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('insulation_motor_remark');
      const numericValue = Number(value);

      if (
        value === null ||
        value === undefined ||
        value === '' ||
        Number.isNaN(numericValue)
      ) {
        remarkControl?.setValue(null);
        remarkControl?.disable();
        return;
      }

      remarkControl?.setValue(numericValue >= 2 ? 'SAT' : 'UNSAT');
      remarkControl?.disable();
    });

    // -------- Ser 22: SPM Check of Motor --------
    // NA → NA | Green → SAT | Yellow → SAT with observations | Red → UNSAT
    this.form.get('spm_check_measured')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('spm_check_remark');
      const remarkMap: Record<string, string> = {
        NA: 'NA',
        Green: 'SAT',
        Yellow: 'SAT with observations',
        Red: 'UNSAT',
      };
      remarkControl?.setValue(remarkMap[value] ?? null);
      remarkControl?.disable();
    });

    // -------- Ser 30: Log book exist --------
    // Yes, updated → SAT | Yes, but not updated → SAT with Observation | Not Held → UNSAT
    this.form.get('log_book_measured')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('log_book_remarks');
      const remarkMap: Record<string, string> = {
        Yes_updated: 'SAT',
        Yes_not_updated: 'SAT with observations',
        'Not Held': 'UNSAT',
      };
      remarkControl?.setValue(remarkMap[value] ?? null);
      remarkControl?.disable();
    });

    // -------- Ser 32: SPM CBPM --------
    // Green → SAT | Yellow → SAT with observation | Red → UNSAT
    this.form.get('spm_cbpm_measured')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('spm_cbpm_remark');
      const remarkMap: Record<string, string> = {
        Green: 'SAT',
        Yellow: 'SAT with observations',
        Red: 'UNSAT',
      };
      remarkControl?.setValue(remarkMap[value] ?? null);
      remarkControl?.disable();
    });
  }

  /**
   * Helper: compute next due date and set SAT/UNSAT remark
   * Less than threshold months → SAT | >= threshold months → UNSAT
   */
  private computeNextDueAndRemark(
    lastDateValue: string,
    thresholdMonths: number,
    nextDueControlName: string,
    remarkControlName: string,
  ): void {
    const remarkControl = this.form.get(remarkControlName);
    const nextDueControl = this.form.get(nextDueControlName);

    if (!lastDateValue) {
      remarkControl?.setValue(null);
      return;
    }
    remarkControl?.disable({ emitEvent: false });

    const lastDate = new Date(lastDateValue);
    const now = new Date();
    const monthsDiff = this.getMonthsDiff(lastDate, now);

    const nextDue = new Date(lastDate);
    nextDue.setMonth(nextDue.getMonth() + thresholdMonths);
    nextDueControl?.setValue(this.formatMonthYear(nextDue), {
      emitEvent: false,
    });

    remarkControl?.setValue(monthsDiff < thresholdMonths ? 'SAT' : 'UNSAT');
  }

  /**
   * Helper: get months difference between two dates
   */
  private getMonthsDiff(from: Date, to: Date): number {
    return (
      (to.getFullYear() - from.getFullYear()) * 12 +
      (to.getMonth() - from.getMonth())
    );
  }

  /**
   * Helper: format a date as "Month YYYY" string for month-year display
   */
  private formatMonthYear(date: Date): string {
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }

  /* ----------------------------- EDIT MODE ----------------------------------- */

  getEditDataByRowId(rowId: string) {
    this.apiService.get(`${Apiendpoints.BER_CERTIFICATE}${rowId}`).subscribe({
      next: (res: any) => {
        if (res?.data) {
          this.editDataDetails = res.data;
          this.form.patchValue({
            command: this.editDataDetails?.ship?.command?.id,
            class_of_ship: this.editDataDetails?.ship?.classofship?.id,
          });
        }
      },
      error: (err) => {
        console.error('Error fetching data:', err);
        this.toastService.showError('Failed to load details.');
      },
    });
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  /* ------------------------------- SAVE --------------------------------------- */

  buildPayload() {
    const formDataValues = this.form.getRawValue();

    const payload: any = {
      ...formDataValues,
      authority_files: this.uploadedAuthorityFiles.map(
        (f) => f.id || f.file_path,
      ),
    };

    return payload;
  }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      this.form.reset();
      this.toast.showSuccess('Form cleared successfully');
      return;
    }
    if (type === 'save' && !this.validateForm()) {
      return;
    }

    const payload = this.buildPayload();

    if (type === 'draft') {
      this.saveDraft(payload);
      return;
    }

    this.submitFinalForm(payload, type);
  }
  private saveDraft(payload: any): void {
    this.draftLoading = true;

    this.formApiService
      .saveDraft(payload, resolveTrialQueryParam(this.route, this.router) || '')
      .subscribe({
        next: () => this.toast.showSuccess('Draft saved successfully.'),
        error: () => this.toast.showError('Failed to save draft.'),
        complete: () => {
          this.draftLoading = false;
        },
      });
  }

  private submitFinalForm(payload: any, type: 'save' | 'submit'): void {
    if (type === 'save') {
      this.saveLoading = true;
    } else {
      this.submitLoading = true;
    }

    this.formApiService
      .submitForm(
        payload,
        resolveTrialQueryParam(this.route, this.router) || '',
      )
      .subscribe({
        next: () => {
          if (type === 'submit') {
            this.toast.showSuccess('Forms Submitted successfully.');
            this.isSubmitTime = true;
            this.showApprovalWorkflowPopup = true;
          } else {
            this.toast.showSuccess('Forms Saved successfully.');
            this.router.navigate(['/afterAuth/ship-returns/transactions/trial']);
          }
          this.cdr.detectChanges();
        },
        error: () => {
          if (type === 'submit') {
            this.toast.showError('Failed to submit form.');
          } else {
            this.toast.showSuccess('Failed to save form.');
          }

          if (type === 'save') {
            this.saveLoading = false;
          } else {
            this.submitLoading = false;
          }
        },
        complete: () => {
          if (type === 'save') {
            this.saveLoading = false;
          } else {
            this.submitLoading = false;
          }
        },
      });
  }

  // ---------------- place of conduct trial --------------------------------
  loadPlaceOfConductTrail() {
    this.apiService
      .getDropdownData('master/locations/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((res) => {
        Promise.resolve().then(() => {
          this.placesOptions = res || [];
          this.cdr.markForCheck();
        });
      });
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }

  /* ----------------------------- EQUIPMENT TABS -------------------------------- */

  private async loadTrialPrefillFromQuery(): Promise<void> {
    const trialId = resolveTrialQueryParam(this.route, this.router);
    if (!trialId) return;
    this.workflowTrialId = trialId;

    try {
      const response = await this.formApiService.getForm(trialId);
      const trialRow = trialRowFromGetFormResponse(
        this.formApiService,
        response,
      );

      this.eqpList = Array.isArray(trialRow.equipment_details)
        ? trialRow.equipment_details
        : [];
      this.activeTab =
        this.formApiService.currentEquipmentNomenclature ||
        this.eqpList[0] ||
        null;

      if (this.activeTab) {
        this.formApiService.setCurrentEquipmentNomenclature(this.activeTab);
      }

      this.form.patchValue({ ship: trialRow.ship_name }, { emitEvent: false });

      const jsonData =
        response?.json_data ?? response?.data?.json_data ?? response;
      const finalJsonData =
        typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

      const equipmentKey =
        this.activeTab?.name ||
        this.activeTab?.nomenclature ||
        Object.keys(finalJsonData || {})[0];

      const equipmentPayload = this.extractEquipmentPayload(
        finalJsonData,
        equipmentKey,
      );

      this.fillData(equipmentPayload);
      this.applyEquipmentDefaults(this.activeTab);
      this.cdr.detectChanges();
    } catch (e) {
      console.error(
        'Trial prefill failed (VKD Lifting Transporting Device)',
        e,
      );
    }
  }

  /** Tab switch hone par call hota hai */
  async setActiveTab(tab: any): Promise<void> {
    if (!tab || this.isSameEquipment(this.activeTab, tab)) return;

    this.activeTab = tab;
    this.formApiService.setCurrentEquipmentNomenclature(tab);

    if (!this.workflowTrialId) return;

    this.resetFormData();
    this.applyEquipmentDefaults(tab);

    try {
      const nomenclature = this.formApiService.resolveNomenclature(tab);
      const response = await this.formApiService.getFormByEquipment(
        this.workflowTrialId,
        nomenclature,
      );

      const jsonData =
        response?.json_data ?? response?.data?.json_data ?? response;
      const finalJsonData =
        typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      const equipmentPayload = this.extractEquipmentPayload(
        finalJsonData,
        nomenclature,
      );

      this.fillData(equipmentPayload);
      this.applyEquipmentDefaults(this.activeTab);
      this.cdr.detectChanges();
    } catch (error) {
      console.error(
        'Failed to load VKD Lifting Transporting Device data for selected equipment',
        error,
      );
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private applyEquipmentDefaults(tab: any): void {
    if (!tab) return;

    const equipmentList =
      this.formApiService?.context?.equipment_details || this.eqpList || [];
    const selectedEquipment =
      equipmentList.find(
        (eq: any) =>
          (eq.id ?? eq.equipment_id) === (tab.id ?? tab.equipment_id),
      ) || tab; // tab itself already carries manufacturer_name/model per the API shape

    this.form.patchValue(
      {
        manufacturer_name: selectedEquipment?.manufacturer_name ?? '',
        model: selectedEquipment?.model ?? '',
      },
      { emitEvent: false },
    );
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'jb_control_observation' in jsonData ||
      'date_of_conduct_trail' in jsonData ||
      'wire_rope_status' in jsonData;
    if (isFlat) return jsonData;

    return jsonData[equipmentKey] ?? null;
  }

  trackByEquipment(_: number, equipment: any): string | number {
    return (
      equipment?.equipment_id ?? equipment?.id ?? equipment?.nomenclature ?? _
    );
  }

  isSameEquipment(left: any, right: any): boolean {
    return (
      (left?.equipment_id ?? left?.id ?? left?.nomenclature) ===
      (right?.equipment_id ?? right?.id ?? right?.nomenclature)
    );
  }

  /** Tab switch pe form reset — ship field preserve karke,
   *  saare auto-locked remark fields ko bhi pehle enable karke reset karta hai */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;
      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    this.showWireRopeObservationInput = false;
    this.showJbControlInput = false;
    this.showOpsSwitchesInput = false;
    this.showOpsIndicatorsInput = false;
    this.showGearBoxInput = false;
    this.showFoundationInspectionFields = false;
    this.showGreasePointsInput = false;
    this.showEmergencyModeInput = false;
    this.showLimitSwitchInput = false;
    this.showPulleyObservationInput = false;

    this.form.patchValue({ ship }, { emitEvent: false });
  }

  /** Poore form ko equipment-specific payload se generic tarike se hydrate karta hai,
   *  aur conditional-lock wale remark fields ka disabled state + visibility flags
   *  bhi manually restore karta hai (kyunki emitEvent:false hone ki wajah se
   *  valueChanges listeners trigger nahi hote patch ke time). */
  fillData(payload: any): void {
    if (!payload) return;

    Object.keys(payload).forEach((key) => {
      if (key === 'ship') return;

      const control = this.form.get(key);
      if (control) {
        control.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });

    this.form
      .get('ship')
      ?.setValue(payload.ship || this.form.get('ship')?.value || '', {
        emitEvent: false,
      });

    // ---- Ser 4/5/6/13: date-based auto-computed remarks — hamesha as-is rehte hain (disable() nahi hota) ----

    // ---- Ser 7: Wire Rope Status ----
    if (payload.wire_rope_status === 'Nil') {
      this.form.get('wire_rope_status_remark')?.disable({ emitEvent: false });
    } else if (payload.wire_rope_status === 'Observation') {
      this.showWireRopeObservationInput = true;
    }

    // ---- Ser 9: JB Control ----
    if (
      ['Nil', 'SAT with observation', 'UNSAT'].includes(
        payload.jb_control_observation,
      )
    ) {
      this.form.get('jb_control_remark')?.disable({ emitEvent: false });
      if (
        payload.jb_control_observation === 'SAT with observation' ||
        payload.jb_control_observation === 'UNSAT'
      ) {
        this.showJbControlInput = true;
      }
    }

    // ---- Ser 9: Ops Switches ----
    if (payload.ops_switches === 'Ops' || payload.ops_switches === 'Non-ops') {
      this.form.get('ops_switches_remark')?.disable({ emitEvent: false });
      if (payload.ops_switches === 'Non-ops') {
        this.showOpsSwitchesInput = true;
      }
    }

    // ---- Ser 9: Ops Indicators ----
    if (payload.ops_indicators) {
      this.form.get('ops_indicators_remark')?.disable({ emitEvent: false });
      if (payload.ops_indicators === 'Non-ops') {
        this.showOpsIndicatorsInput = true;
      }
    }

    // ---- Ser 10: Condition of Gear Box ----
    if (
      payload.condition_gear_box === 'Nil' ||
      payload.condition_gear_box === 'Noise Observed'
    ) {
      this.form.get('condition_gear_box_remark')?.disable({ emitEvent: false });
      if (payload.condition_gear_box === 'Noise Observed') {
        this.showGearBoxInput = true;
      }
    }

    // ---- Ser 11: Oil Level — hamesha locked ----
    this.form.get('oil_level_gear_box_remark')?.disable({ emitEvent: false });

    // ---- Ser 12: Oil Type Measured ----
    if (payload.oil_type_measured) {
      this.form.get('oil_type_remark')?.disable({ emitEvent: false });
    }

    // ---- Ser 14: Condition of Foundations ----
    if (
      payload.foundation_inspection === 'NoObservation' ||
      payload.foundation_inspection === 'No Observation'
    ) {
      this.form
        .get('foundation_inspection_remark')
        ?.disable({ emitEvent: false });
    } else if (payload.foundation_inspection === 'Observation') {
      this.showFoundationInspectionFields = true;
      this.form
        .get('foundation_inspection_remark')
        ?.disable({ emitEvent: false });
    }

    // ---- Ser 15: Greasing of Mechanical Part ----
    if (
      payload.greasing_mechanical === 'Greased' ||
      payload.greasing_mechanical === 'Not Greased'
    ) {
      this.form
        .get('greasing_mechanical_remark')
        ?.disable({ emitEvent: false });
    }

    // ---- Ser 16: Greasing Points ----
    if (
      ['Charged', 'Painted', 'Choked', 'Missing'].includes(
        payload.grease_points,
      )
    ) {
      this.form.get('grease_points_remark')?.disable({ emitEvent: false });
    } else if (payload.grease_points === 'Others') {
      this.showGreasePointsInput = true;
      this.form.get('grease_points_remark')?.disable({ emitEvent: false });
    }

    // ---- Ser 18: Emergency Mode Operation ----
    if (
      payload.emergency_mode === 'Ops' ||
      payload.emergency_mode === 'Non-ops'
    ) {
      this.form.get('emergency_mode_remark')?.disable({ emitEvent: false });
      if (payload.emergency_mode === 'Non-ops') {
        this.showEmergencyModeInput = true;
      }
    }

    // ---- Ser 19: Limit Switch ----
    if (payload.limit_switch === 'Ops' || payload.limit_switch === 'Non-ops') {
      this.form.get('limit_switch_remark')?.disable({ emitEvent: false });
      if (payload.limit_switch === 'Non-ops') {
        this.showLimitSwitchInput = true;
      }
    }

    // ---- Ser 20: Condition of Pulley ----
    if (payload.pulley_condition === 'Nil') {
      this.form.get('pulley_condition_remark')?.disable({ emitEvent: false });
    } else if (payload.pulley_condition === 'Observation') {
      this.showPulleyObservationInput = true;
      // remark control enabled rehta hai — as-is
    }

    // ---- Ser 21: Insulation Motor — hamesha locked jab value ho ----
    if (
      payload.insulation_motor_value !== undefined &&
      payload.insulation_motor_value !== ''
    ) {
      this.form.get('insulation_motor_remark')?.disable({ emitEvent: false });
    }

    // ---- Ser 22: SPM Check — hamesha locked ----
    if (payload.spm_check_measured) {
      this.form.get('spm_check_remark')?.disable({ emitEvent: false });
    }

    // ---- Ser 30: Log Book — hamesha locked ----
    if (payload.log_book_measured) {
      this.form.get('log_book_remarks')?.disable({ emitEvent: false });
    }

    // ---- Ser 32: SPM CBPM — hamesha locked ----
    if (payload.spm_cbpm_measured) {
      this.form.get('spm_cbpm_remark')?.disable({ emitEvent: false });
    }
  }
}
