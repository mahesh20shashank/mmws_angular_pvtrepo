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
import { SelectComponent } from '../../../../ui/select.component';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { Apiendpoints } from '../../../../ApiEndPoints';
import { CalenderComponent } from '../../../../ui/calender.component';
import { ParameterCardComponent } from '../../../../ui/parameter-card/parameter-card.component';
import { MonthYearCalendarComponent } from '../../../../ui/month-year-calendar.component';
import { InputComponent } from '../../../../ui/input.component';
import { FileUploadComponent, UploadedFileItem } from '../../../../ui/file-upload/file-upload.component';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import { resolveTrialQueryParam, trialRowFromGetFormResponse  } from '../../../../trial-route-prefill';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-vkt-movable-hight-point',
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
    ApprovalWorkFlow
  ],
  templateUrl: './vkt-movable-hight-point.html',
  styleUrl: './vkt-movable-hight-point.css',
})
export class VktMovableHightPoint {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
 
 
  readonly restartIcon = 'rotate-ccw';
  draftLoading = false;
  saveLoading = false;
  submitLoading = false;
  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';



  showApprovalWorkflowPopup = false;
  isSubmitTime = false;
 
  form!: FormGroup;
  loading = false;
 
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
  // Nil → SAT | Observation → SAT with obs / UNSAT + dialog box (Ser 5a, 5b, 5c, 10)
  nilObservationOptions = [
    { label: 'Nil', value: 'Nil' },
    { label: 'Observation', value: 'Observation' },
  ];
 
  // Ser 6: Foundations
  ObservationsOptions = [
    { label: 'No Observation', value: 'NoObservation' },
    { label: 'Observation', value: 'Observation' },
  ];
 
  // Ser 7, 8: Lubrication condition
  // Charged → SAT | Painted/Choked/Missing → UNSAT | Others → dialog box
  greaseConditionOptions = [
    { label: 'Charged', value: 'Charged' },
    { label: 'Painted', value: 'Painted' },
    { label: 'Choked', value: 'Choked' },
    { label: 'Missing', value: 'Missing' },
    { label: 'Others', value: 'Others' },
  ];
 
  // Ser 9: Drive noise
  // Nil → SAT | Noise Observed → UNSAT + dialog box
  noiseObservedOptions = [
    { label: 'Nil', value: 'Nil' },
    { label: 'Noise Observed', value: 'Noise Observed' },
  ];
 
  // Ser 12: Oil level options
  // 40-100% filled → SAT | Less than 40% → SAT with observation | Empty → UNSAT
  oilLevelOptions = [
    { label: '40-100% filled', value: '40-100' },
    { label: 'Less than 40% filled', value: 'less_than_40' },
    { label: 'Empty', value: 'Empty' },
  ];
 
  // Ser 13: Oil type reference dropdown
  oilTypeOptions = [
    { label: 'OC300', value: 'OC300' },
    { label: 'SS320', value: 'SS320' },
    { label: 'Others', value: 'Others' },
  ];
 
  SatUnsatOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];
 
  // Used when Observation is selected (Ser 5a, 5b, 5c, 10)
  SatWithObsUnsatOptions = [
    { label: 'SAT with observation', value: 'SAT with observation' },
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
 
  montlyQuarterlyOption = [
    { label: 'Monthly', value: 'Monthly' },
    { label: 'Quarterly', value: 'Quarterly' },
  ];
 
  // Ser 24: Periodicity measured
  montlyQuarterlyNilOption = [
    { label: 'Monthly', value: 'Monthly' },
    { label: 'Quarterly', value: 'Quarterly' },
    { label: 'Nil', value: 'Nil' },
  ];
 
  // Ser 25: SPM Check — NA (Motor fitted inside the capstan casing) | Green | Yellow | Red
  spmCheckOptions = [
    { label: 'NA (Motor fitted inside the capstan casing)', value: 'NA' },
    { label: 'Green', value: 'Green' },
    { label: 'Yellow', value: 'Yellow' },
    { label: 'Red', value: 'Red' },
  ];
 
  // ---- Show/hide booleans for conditional rendering ----
 
  // Ser 5a: JB/Control electrical hygiene — Observation → dialog box + SatWithObsUnsatOptions
  showJbControlInput = false;
 
  // Ser 5b: Status of Switches — Observation → dialog box + SatWithObsUnsatOptions
  showJbSwitchesInput = false;
 
  // Ser 5c: Status of Indicators — Observation → dialog box + SatWithObsUnsatOptions
  showJbIndicatorsInput = false;
 
  // Ser 6: Foundations — Observation → show 4 sub-input dialog boxes
  showFoundationInspectionFields = false;
 
  // Ser 7: Lubrication of Mechanical Part — Others → dialog box
  showLubricationMechanicalInput = false;
 
  // Ser 8: Lubrication Points — Others → dialog box
  showLubricationPointsInput = false;
 
  // Ser 9: Drive — Noise Observed → dialog box
  showDriveNoiseInput = false;
 
  // Ser 10: Limit Switch/sensor — Observation → dialog box + SatWithObsUnsatOptions
  showLimitSwitchInput = false;

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
  return this.activeTab || this.formApiService?.currentEquipmentNomenclature || null;
}

get activeEquipmentId(): number | null {
  return this.activeHeaderEquipment?.equipment_id ?? this.activeHeaderEquipment?.id ?? null;
}
// -------------------------------------------------------------------------------
 
  constructor(
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private toastService: ToastService,
     private toast: ToastService,
    private route: ActivatedRoute,
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
 
      // Ser 1: Make (CMMS dropdown)
      make: [''],
      manufacturer_name: [{ value: '', disabled: true }],
 
      // Ser 2: Type (alphanumeric — Electric Operated)
      type: [''],
 
      // Ser 3: Year of Manufacture (CMMS dropdown)
      year_of_manufacture: [''],
 
      // Ser 4: Load Testing
      // < 27 months from Date of Load Testing → SAT | >= 27 months → UNSAT
      load_testing_last_date: [''],
      load_testing_remark: [''],
 
      // Ser 5: Condition of JB/Control
 
      // 5a: Electrical hygiene
      // Nil → SAT | Observation → dialog box → SAT with observation / UNSAT
      jb_control_observation: [''],
      jb_control_observation_value: [''],
      jb_control_remark: [''],
 
      // 5b: Status of Switches
      // Nil → SAT | Observation → dialog box → SAT with observation / UNSAT
      jb_switches_observation: [''],
      jb_switches_observation_value: [''],
      jb_switches_remark: [''],
 
      // 5c: Status of Indicators
      // Nil → SAT | Observation → dialog box → SAT with observation / UNSAT
      jb_indicators_observation: [''],
      jb_indicators_observation_value: [''],
      jb_indicators_remark: [''],
 
      // Ser 6: Condition of Foundations/
      // No Observation → SAT | Observation → 4 dialog boxes
      foundation_inspection: [''],
      foundation_inspection_remark: [''],
      foundation_corrosion: [''],
      foundation_pitting: [''],
      foundation_unpainted: [''],
      foundation_others: [''],
 
      // Ser 7: Lubrication of Mechanical Part
      // Charged → SAT | Painted/Choked/Missing → UNSAT | Others → dialog box
      lubrication_mechanical: [''],
      lubrication_mechanical_value: [''],
      lubrication_mechanical_remark: [''],
 
      // Ser 8: Lubrication Points
      // Charged → SAT | Painted/Choked/Missing → UNSAT | Others → dialog box
      lubrication_points: [''],
      lubrication_points_value: [''],
      lubrication_points_remark: [''],
 
      // Ser 9: Drive
      // Nil → SAT | Noise Observed → UNSAT + dialog box
      drive_noise: [''],
      drive_noise_value: [''],
      drive_noise_remark: [''],
 
      // Ser 10: Limit Switch/ sensor
      // Nil → SAT | Observation → dialog box → SAT with observation / UNSAT
      limit_switch_observation: [''],
      limit_switch_observation_value: [''],
      limit_switch_remark: [''],
 
      // Ser 11: Insulation Motor
      // >= 2 M Ohms → SAT | < 2 M Ohms → UNSAT
      insulation_motor_value: [''],
      insulation_motor_remark: [''],
 
      // CBPM Parameters
 
      // Ser 12: Oil Level in Gear Box
      // 40-100% filled → SAT | Less than 40% → SAT with observation | Empty → UNSAT
      oil_level_gear_box: [''],
      oil_level_gear_box_remark: [''],
 
      // Ser 13: Oil being used in Gear Box
      // Yes → SAT | No → UNSAT
      oil_type_reference: [''],
      oil_type_measured: [''],
      oil_type_remark: [''],
 
      // Ser 14: Change of Oil (in Drum and Gear Box)
      // < 12 months from last date of oil change → SAT | >= 12 months → UNSAT
      oil_change_last_date: [''],
      oil_change_remark: [''],
 
      // Ser 15-20: Lub oil analysis parameters (all alphanumeric)
      lub_water_content: [''],
      lub_viscosity: [''],
      lub_base_number: [''],
      lub_acid_number: [''],
      lub_metal_traces: [''],
 
      // Ser 21: Starting current group
      starting_current_reference: [''],
      starting_current_measured: [''],
      starting_current_remark: [''],
      starting_current_slide_reference: [''],
      starting_current_slide_measured: [''],
      starting_current_slide_remark: [''],
      starting_current_tilt_reference: [''],
      starting_current_tilt_measured: [''],
      starting_current_tilt_remark: [''],
      starting_current_lowering_reference: [''],
      starting_current_lowering_measured: [''],
      starting_current_lowering_remark: [''],
 
      // Ser 22: Running Current group
      running_current_reference: [''],
      running_current_measured: [''],
      running_current_remark: [''],
      running_current_slide_reference: [''],
      running_current_slide_measured: [''],
      running_current_slide_remark: [''],
      running_current_tilt_reference: [''],
      running_current_tilt_measured: [''],
      running_current_tilt_remark: [''],
      running_current_lowering_reference: [''],
      running_current_lowering_measured: [''],
      running_current_lowering_remark: [''],
 
      // Ser 23: Log book exist
      // Yes → SAT | No → UNSAT
      log_book_measured: [''],
      log_book_remarks: [''],
 
      // Ser 24: Periodicity of measurement
      // Monthly/Quarterly → SAT | Nil → UNSAT
      periodicity_measured: [''],
      periodicity_remarks: [''],
 
      // Ser 25: SPM Check of Motor (For Motor Vibration)
      // NA → NA | Green → SAT | Yellow → SAT with observation | Red → UNSAT
      spm_measured: [''],
      spm_remarks: [''],
 
      // Ser 26: Any other observations (alphanumeric)
      other_observation: [''],
 
      // Ser 27: Overall Remarks (auto-computed, disabled)
      overall_remark: [''],
    });
  }
 
  setupConditionalLogic() {
 
    // -------- Ser 4: Load Testing --------
    // < 27 months → SAT | >= 27 months → UNSAT
    this.form.get('load_testing_last_date')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('load_testing_remark');
 
      if (!value) {
        remarkControl?.setValue(null);
        return;
      }
 
      const lastDate = new Date(value);
      const now = new Date();
      const monthsDiff = this.getMonthsDiff(lastDate, now);
 
      remarkControl?.setValue(monthsDiff < 27 ? 'SAT' : 'UNSAT');
      this.computeOverallRemark();
    });
 
    // -------- Ser 5a: Condition of JB/Control – Electrical hygiene --------
    // Nil → SAT | Observation → dialog box + SatWithObsUnsatOptions
    this.form.get('jb_control_observation')?.valueChanges.subscribe((value) => {
  const remarkControl = this.form.get('jb_control_remark');
  const valueControl = this.form.get('jb_control_observation_value');

  this.showJbControlInput = false;
  valueControl?.reset();

  if (value === 'Nil') {
    this.showJbControlInput = false;

    remarkControl?.setValue('SAT', { emitEvent: false });
    remarkControl?.disable(); // User should not change SAT

    valueControl?.reset();
    valueControl?.disable();
  }
  else if (value === 'Observation') {
    this.showJbControlInput = true;

    remarkControl?.reset();
    remarkControl?.enable(); // User selects SAT with Observation / UNSAT

    valueControl?.enable(); // Alphanumeric input enabled
  }
  else {
    remarkControl?.reset();
    remarkControl?.disable();

    valueControl?.reset();
    valueControl?.disable();
  }

  this.computeOverallRemark();
});

this.form.get('jb_control_remark')?.valueChanges.subscribe(() => {
  this.computeOverallRemark();
});
    // -------- Ser 5b: Status of Switches --------
    // Nil → SAT | Observation → dialog box + SatWithObsUnsatOptions
    this.form.get('jb_switches_observation')?.valueChanges.subscribe((value) => {
  const remarkControl = this.form.get('jb_switches_remark');
  const valueControl = this.form.get('jb_switches_observation_value');

  this.showJbSwitchesInput = false;
  valueControl?.reset();

  if (value === 'Nil') {
    this.showJbSwitchesInput = false;

    remarkControl?.setValue('SAT', { emitEvent: false });
    remarkControl?.disable();

    valueControl?.reset();
    valueControl?.disable();
  }
  else if (value === 'Observation') {
    this.showJbSwitchesInput = true;

    remarkControl?.reset();
    remarkControl?.enable();

    valueControl?.enable();
  }
  else {
    remarkControl?.reset();
    remarkControl?.disable();

    valueControl?.reset();
    valueControl?.disable();
  }

  this.computeOverallRemark();
});

this.form.get('jb_switches_remark')?.valueChanges.subscribe(() => {
  this.computeOverallRemark();
});
    // -------- Ser 5c: Status of Indicators --------
    // Nil → SAT | Observation → dialog box + SatWithObsUnsatOptions
    this.form.get('jb_indicators_observation')?.valueChanges.subscribe((value) => {
  const remarkControl = this.form.get('jb_indicators_remark');
  const valueControl = this.form.get('jb_indicators_observation_value');

  this.showJbIndicatorsInput = false;
  valueControl?.reset();

  if (value === 'Nil') {
    this.showJbIndicatorsInput = false;

    remarkControl?.setValue('SAT', { emitEvent: false });
    remarkControl?.disable();

    valueControl?.reset();
    valueControl?.disable();
  }
  else if (value === 'Observation') {
    this.showJbIndicatorsInput = true;

    remarkControl?.reset();
    remarkControl?.enable();

    valueControl?.enable();
  }
  else {
    remarkControl?.reset();
    remarkControl?.disable();

    valueControl?.reset();
    valueControl?.disable();
  }

  this.computeOverallRemark();
});

this.form.get('jb_indicators_remark')?.valueChanges.subscribe(() => {
  this.computeOverallRemark();
});
    // -------- Ser 6: Condition of Foundations/ --------
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
      } else {
        remarkControl?.setValue(null);
      }
      this.computeOverallRemark();
    });
 
    this.form.get('foundation_inspection_remark')?.valueChanges.subscribe(() => this.computeOverallRemark());
 
    // -------- Ser 7: Lubrication of Mechanical Part --------
    // Charged → SAT | Painted/Choked/Missing → UNSAT | Others → dialog box
    this.form.get('lubrication_mechanical')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('lubrication_mechanical_remark');
      const valueControl = this.form.get('lubrication_mechanical_value');
 
      this.showLubricationMechanicalInput = false;
      valueControl?.reset();
 
      if (value === 'Charged') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (['Painted', 'Choked', 'Missing'].includes(value)) {
        remarkControl?.setValue('UNSAT');
        remarkControl?.disable();
      } else if (value === 'Others') {
        this.showLubricationMechanicalInput = true;
        remarkControl?.setValue(null);
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
      this.computeOverallRemark();
    });
 
    this.form.get('lubrication_mechanical_remark')?.valueChanges.subscribe(() => this.computeOverallRemark());
 
    // -------- Ser 8: Lubrication Points --------
    // Charged → SAT | Painted/Choked/Missing → UNSAT | Others → dialog box
    this.form.get('lubrication_points')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('lubrication_points_remark');
      const valueControl = this.form.get('lubrication_points_value');
 
      this.showLubricationPointsInput = false;
      valueControl?.reset();
 
      if (value === 'Charged') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (['Painted', 'Choked', 'Missing'].includes(value)) {
        remarkControl?.setValue('UNSAT');
        remarkControl?.disable();
      } else if (value === 'Others') {
        this.showLubricationPointsInput = true;
        remarkControl?.setValue(null);
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
      this.computeOverallRemark();
    });
 
    this.form.get('lubrication_points_remark')?.valueChanges.subscribe(() => this.computeOverallRemark());
 
    // -------- Ser 9: Drive --------
    // Nil → SAT | Noise Observed → UNSAT + dialog box
    this.form.get('drive_noise')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('drive_noise_remark');
      const valueControl = this.form.get('drive_noise_value');
 
      this.showDriveNoiseInput = false;
      valueControl?.reset();
 
      if (value === 'Nil') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Noise Observed') {
        this.showDriveNoiseInput = true;
        remarkControl?.setValue('UNSAT');
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
      this.computeOverallRemark();

    });
 
    this.form.get('drive_noise_remark')?.valueChanges.subscribe(() => this.computeOverallRemark());
 
    // -------- Ser 10: Limit Switch/ sensor --------
    // Nil → SAT | Observation → dialog box + SatWithObsUnsatOptions
    this.form.get('limit_switch_observation')?.valueChanges.subscribe((value) => {
  const remarkControl = this.form.get('limit_switch_remark');
  const valueControl = this.form.get('limit_switch_observation_value');

  this.showLimitSwitchInput = false;
  valueControl?.reset();

  if (value === 'Nil') {
    this.showLimitSwitchInput = false;

    remarkControl?.setValue('SAT', { emitEvent: false });
    remarkControl?.disable();

    valueControl?.reset();
    valueControl?.disable();
  }
  else if (value === 'Observation') {
    this.showLimitSwitchInput = true;

    remarkControl?.reset();
    remarkControl?.enable();

    valueControl?.enable();
  }
  else {
    remarkControl?.reset();
    remarkControl?.disable();

    valueControl?.reset();
    valueControl?.disable();
  }

  this.computeOverallRemark();
});

this.form.get('limit_switch_remark')?.valueChanges.subscribe(() => {
  this.computeOverallRemark();
});
    // -------- Ser 11: Insulation Motor --------
    // >= 2 M Ohms → SAT | < 2 M Ohms → UNSAT
    this.form.get('insulation_motor_value')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('insulation_motor_remark');
      const numericValue = Number(value);
 
      if (value === null || value === undefined || value === '' || Number.isNaN(numericValue)) {
        remarkControl?.setValue(null);
        return;
      }
 
      remarkControl?.setValue(numericValue >= 2 ? 'SAT' : 'UNSAT');
      this.computeOverallRemark();
      remarkControl?.disable();
    });
 
    this.form.get('insulation_motor_remark')?.valueChanges.subscribe(() => this.computeOverallRemark());
 
    // -------- Ser 12: Oil Level in Gear Box --------
    // 40-100% filled → SAT | Less than 40% → SAT with observation | Empty → UNSAT
    this.form.get('oil_level_gear_box')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('oil_level_gear_box_remark');
 
      const remarkMap: Record<string, string> = {
        '40-100': 'SAT',
        'less_than_40': 'SAT with observations',
        'Empty': 'UNSAT',
      };
      remarkControl?.disable();
 
      remarkControl?.setValue(remarkMap[value] ?? null);
      remarkControl?.disable();
    });
 
    // -------- Ser 13: Oil being used in Gear Box --------
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
 
    // -------- Ser 14: Change of Oil --------
    // < 12 months from last date of oil change → SAT | >= 12 months → UNSAT
    this.form.get('oil_change_last_date')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('oil_change_remark');
 
      if (!value) {
        remarkControl?.setValue(null);
        return;
      }
 
      const lastDate = new Date(value);
      const now = new Date();
      const monthsDiff = this.getMonthsDiff(lastDate, now);
 
      remarkControl?.setValue(monthsDiff < 12 ? 'SAT' : 'UNSAT');
    });
 
    // -------- Ser 23: Log book exist --------
    // Yes → SAT | No → UNSAT
    /*this.form.get('log_book_measured')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('log_book_remarks');
 
      if (value === 'Yes') {
        remarkControl?.setValue('SAT');
      } else if (value === 'No') {
        remarkControl?.setValue('UNSAT');
      } else {
        remarkControl?.setValue(null);
      }
    });*/
 
    // -------- Ser 24: Periodicity of measurement --------
    // Monthly/Quarterly → SAT | Nil → UNSAT
    /*this.form.get('periodicity_measured')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('periodicity_remarks');
 
      if (value === 'Monthly' || value === 'Quarterly') {
        remarkControl?.setValue('SAT');
      } else if (value === 'Nil') {
        remarkControl?.setValue('UNSAT');
      } else {
        remarkControl?.setValue(null);
      }
    });*/
 
    // -------- Ser 25: SPM Check of Motor --------
    // NA → NA | Green → SAT | Yellow → SAT with observations | Red → UNSAT
    this.form.get('spm_measured')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('spm_remarks');
      const remarkMap: Record<string, string> = {
        NA: 'NA',
        Green: 'SAT',
        Yellow: 'SAT with observations',
        Red: 'UNSAT',
      };
      remarkControl?.setValue(remarkMap[value] ?? null);
      remarkControl?.disable();
    });
  }
 
  /**
   * Compute the overall remark based on key inspection remarks (Ser 4-11):
   * - If ANY remark is 'UNSAT' → overall = 'UNSAT'
   * - Else if ANY remark is 'SAT with observation' → overall = 'SAT with observations'
   * - Else if ALL remarks are 'SAT' → overall = 'SAT'
   * - Else → null (not all filled yet)
   */
  private computeOverallRemark(): void {
    const remarkFields = [
      'load_testing_remark',
      'jb_control_remark',
      'jb_switches_remark',
      'jb_indicators_remark',
      'foundation_inspection_remark',
      'lubrication_mechanical_remark',
      'lubrication_points_remark',
      'drive_noise_remark',
      'limit_switch_remark',
      'insulation_motor_remark',
    ];
 
    const values = remarkFields
      .map(field => this.form.get(field)?.value)
      .filter(v => v !== null && v !== undefined && v !== '');
 
    const overallControl = this.form.get('overall_remark');
 
    if (values.length === 0) {
      overallControl?.setValue(null, { emitEvent: false });
      return;
    }
 
    if (values.includes('UNSAT')) {
      overallControl?.setValue('UNSAT', { emitEvent: false });
    } else if (values.includes('SAT with observation') || values.includes('SAT with observations')) {
      overallControl?.setValue('SAT with observations', { emitEvent: false });
    } else if (values.every(v => v === 'SAT')) {
      overallControl?.setValue('SAT', { emitEvent: false });
    } else {
      overallControl?.setValue(null, { emitEvent: false });
    }
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
      authority_files: this.uploadedAuthorityFiles.map(f => f.id || f.file_path),
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
            (this.toast.showSuccess('Forms Submitted successfully.'),
              (this.showApprovalWorkflowPopup = true));
          } else {
            (this.toast.showSuccess('Forms Saved successfully.'),
              this.router.navigate(['/afterAuth/ship-returns/transactions/trial']));
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
    this.apiService.getDropdownData('master/locations/', { labelKey: 'name', valueKey: 'id' }).subscribe((res) => {
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
    const trialRow = trialRowFromGetFormResponse(this.formApiService, response);

    this.eqpList = Array.isArray(trialRow.equipment_details)
      ? trialRow.equipment_details
      : [];
    this.activeTab =
      this.formApiService.currentEquipmentNomenclature || this.eqpList[0] || null;

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

    const equipmentPayload = this.extractEquipmentPayload(finalJsonData, equipmentKey);

    this.fillData(equipmentPayload);
    this.applyEquipmentDefaults(this.activeTab);
    this.cdr.detectChanges();
  } catch (e) {
    console.error('Trial prefill failed (VKT Movable Height Point)', e);
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
    const equipmentPayload = this.extractEquipmentPayload(finalJsonData, nomenclature);

    this.fillData(equipmentPayload);
    this.applyEquipmentDefaults(this.activeTab); 
    this.cdr.detectChanges();
  } catch (error) {
    console.error('Failed to load VKT Movable Height Point data for selected equipment', error);
    this.toastService.showError('Failed to load selected equipment data.');
  }
}

private applyEquipmentDefaults(tab: any): void {
  if (!tab) return;

  const equipmentList = this.formApiService?.context?.equipment_details || this.eqpList || [];
  const selectedEquipment =
    equipmentList.find(
      (eq: any) => (eq.id ?? eq.equipment_id) === (tab.id ?? tab.equipment_id)
    ) || tab; // tab itself already carries manufacturer_name/model per the API shape

  this.form.patchValue(
    {
      manufacturer_name: selectedEquipment?.manufacturer_name ?? '',
      model: selectedEquipment?.model ?? '',
    },
    { emitEvent: false }
  );
}

private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
  if (!jsonData || typeof jsonData !== 'object') return null;

  const isFlat =
    'jb_control_observation' in jsonData ||
    'date_of_conduct_trail' in jsonData ||
    'load_testing_last_date' in jsonData;
  if (isFlat) return jsonData;

  return jsonData[equipmentKey] ?? null;
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

  this.showJbControlInput = false;
  this.showJbSwitchesInput = false;
  this.showJbIndicatorsInput = false;
  this.showFoundationInspectionFields = false;
  this.showLubricationMechanicalInput = false;
  this.showLubricationPointsInput = false;
  this.showDriveNoiseInput = false;
  this.showLimitSwitchInput = false;

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

  this.form.get('ship')?.setValue(
    payload.ship || this.form.get('ship')?.value || '',
    { emitEvent: false },
  );

  // ---- Ser 4: Load Testing — hamesha (jab date set ho) locked nahi hota is form mein, as-is ----

  // ---- Ser 5a: JB Control Electrical hygiene ----
  if (payload.jb_control_observation === 'Nil') {
    this.form.get('jb_control_remark')?.disable({ emitEvent: false });
    this.form.get('jb_control_observation_value')?.disable({ emitEvent: false });
  } else if (payload.jb_control_observation === 'Observation') {
    this.showJbControlInput = true;
    // remark aur value dono enabled rehte hain is case mein
  } else {
    this.form.get('jb_control_remark')?.disable({ emitEvent: false });
    this.form.get('jb_control_observation_value')?.disable({ emitEvent: false });
  }

  // ---- Ser 5b: Status of Switches ----
  if (payload.jb_switches_observation === 'Nil') {
    this.form.get('jb_switches_remark')?.disable({ emitEvent: false });
    this.form.get('jb_switches_observation_value')?.disable({ emitEvent: false });
  } else if (payload.jb_switches_observation === 'Observation') {
    this.showJbSwitchesInput = true;
  } else {
    this.form.get('jb_switches_remark')?.disable({ emitEvent: false });
    this.form.get('jb_switches_observation_value')?.disable({ emitEvent: false });
  }

  // ---- Ser 5c: Status of Indicators ----
  if (payload.jb_indicators_observation === 'Nil') {
    this.form.get('jb_indicators_remark')?.disable({ emitEvent: false });
    this.form.get('jb_indicators_observation_value')?.disable({ emitEvent: false });
  } else if (payload.jb_indicators_observation === 'Observation') {
    this.showJbIndicatorsInput = true;
  } else {
    this.form.get('jb_indicators_remark')?.disable({ emitEvent: false });
    this.form.get('jb_indicators_observation_value')?.disable({ emitEvent: false });
  }

  // ---- Ser 6: Condition of Foundations ----
  if (payload.foundation_inspection === 'NoObservation' || payload.foundation_inspection === 'No Observation') {
    this.form.get('foundation_inspection_remark')?.disable({ emitEvent: false });
  } else if (payload.foundation_inspection === 'Observation') {
    this.showFoundationInspectionFields = true;
  }

  // ---- Ser 7: Lubrication of Mechanical Part ----
  if (['Charged', 'Painted', 'Choked', 'Missing'].includes(payload.lubrication_mechanical)) {
    this.form.get('lubrication_mechanical_remark')?.disable({ emitEvent: false });
  } else if (payload.lubrication_mechanical === 'Others') {
    this.showLubricationMechanicalInput = true;
    this.form.get('lubrication_mechanical_remark')?.disable({ emitEvent: false });
  }

  // ---- Ser 8: Lubrication Points ----
  if (['Charged', 'Painted', 'Choked', 'Missing'].includes(payload.lubrication_points)) {
    this.form.get('lubrication_points_remark')?.disable({ emitEvent: false });
  } else if (payload.lubrication_points === 'Others') {
    this.showLubricationPointsInput = true;
    this.form.get('lubrication_points_remark')?.disable({ emitEvent: false });
  }

  // ---- Ser 9: Drive ----
  if (payload.drive_noise === 'Nil' || payload.drive_noise === 'Noise Observed') {
    this.form.get('drive_noise_remark')?.disable({ emitEvent: false });
    if (payload.drive_noise === 'Noise Observed') {
      this.showDriveNoiseInput = true;
    }
  }

  // ---- Ser 10: Limit Switch/sensor ----
  if (payload.limit_switch_observation === 'Nil') {
    this.form.get('limit_switch_remark')?.disable({ emitEvent: false });
    this.form.get('limit_switch_observation_value')?.disable({ emitEvent: false });
  } else if (payload.limit_switch_observation === 'Observation') {
    this.showLimitSwitchInput = true;
  } else {
    this.form.get('limit_switch_remark')?.disable({ emitEvent: false });
    this.form.get('limit_switch_observation_value')?.disable({ emitEvent: false });
  }

  // ---- Ser 11: Insulation Motor — hamesha locked jab value ho ----
  if (payload.insulation_motor_value !== undefined && payload.insulation_motor_value !== '') {
    this.form.get('insulation_motor_remark')?.disable({ emitEvent: false });
  }

  // ---- Ser 12: Oil Level — hamesha locked ----
  this.form.get('oil_level_gear_box_remark')?.disable({ emitEvent: false });

  // ---- Ser 13: Oil Type — hamesha locked jab measured ho ----
  if (payload.oil_type_measured) {
    this.form.get('oil_type_remark')?.disable({ emitEvent: false });
  }

  // ---- Ser 25: SPM Check — hamesha locked ----
  if (payload.spm_measured) {
    this.form.get('spm_remarks')?.disable({ emitEvent: false });
  }
}

}
