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
import { YearCalendarComponent } from '../../../../ui/year-calender/year-calendar.component';
import {
  FileUploadComponent,
  UploadedFileItem,
} from '../../../../ui/file-upload/file-upload.component';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'ras-cargo-winch-add',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    SelectComponent,
    CalenderComponent,
    ParameterCardComponent,
    MonthYearCalendarComponent,
    InputComponent,
    YearCalendarComponent,
    ApprovalWorkFlow,
    FileUploadComponent,
  ],
  templateUrl: './ras-cargo-winch-data-feeding-add.component.html',
})
export class RASCargoWinchAdd {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;
  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  readonly restartIcon = 'rotate-ccw';
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;

  form!: FormGroup;
  loading = false;
  uploadedAuthorityFiles: UploadedFileItem[] = [];
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
  commandOptions: any[] = [];
  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];

  placesOptions: any[] = [];
  occasionOptions = [
    { label: 'Pre Refit Trials', value: 'pre_refit_trials' },
    { label: 'End of Refit Trials', value: 'end_of_refit_trials' },
    { label: 'Surprice Checks', value: 'surprice_checks' },
  ];

  capstanOptions = [
    { label: 'MOORING CAPSTAN', value: 'MOORING CAPSTAN' },
    { label: 'WARPING CAPSTAN', value: 'WARPING CAPSTAN' },
  ];
  // PORT/ STBD
  stbdOptions = [
    { label: 'PORT', value: 'PORT' },
    { label: 'STBD', value: 'STBD' },
  ];

  opsOptions = [
    { label: 'Ops', value: 'Ops' },
    { label: 'Non-ops', value: 'Non-ops' },
  ];
  opsNaOptions = [
    { label: 'NA', value: 'NA' },
    { label: 'Ops', value: 'Ops' },
    { label: 'Non-ops', value: 'Non-ops' },
  ];

  LubricatiedOptions = [
    { label: 'Lubricated', value: 'Lubricated' },
    { label: 'Not Lubricated', value: 'Not Lubricated' },
  ];

  noiseObserved = [
    { label: 'Nil', value: 'Nil' },
    { label: 'Noise Observed', value: 'Noise Observed' },
  ];

  securedNotSecured = [
    { label: 'Secured', value: 'Secured' },
    { label: 'Not Secured', value: 'Not Secured' },
  ];

  OilLevelGauge = [
    { label: '40-100% filled', value: '40-100% filled' },
    {
      label: 'Less than 40% filled',
      value: 'Less than 40% filled',
    },
    { label: 'Empty', value: 'Empty' },
  ];

  SatUnsatOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  SatUnsatNAOptions = [
    { label: 'NA', value: 'NA' },
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  fillingDrainPlugs = [
    { label: 'Charged', value: 'Charged' },
    { label: 'Painted', value: 'Painted' },
    { label: 'Choked', value: 'Choked' },
    { label: 'Missing', value: 'Missing' },
    { label: 'Others', value: 'Others' },
  ];

  ObservationsOptions = [
    { label: 'No Observation', value: 'No Observation' },
    { label: 'Observation', value: 'Observation' },
  ];

  ObservationsNilOptions = [
    { label: 'Nil', value: 'Nil' },
    { label: 'Observation', value: 'Observation' },
  ];
  greasingOptions = [
    { label: 'Greased', value: 'Greased' },
    { label: 'Not Greased', value: 'Not Greased' },
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

  gearBoxOptions = [
    { label: 'OC300', value: 'OC300' },
    { label: 'SS320', value: 'SS320' },
    { label: 'Others', value: 'Others' },
  ];

  montlyQuarterlyOption = [
    { label: 'Monthly', value: 'Monthly' },
    { label: 'Quarterly', value: 'Quarterly' },
  ];

  montlyQuarterlyNilOption = [
    { label: 'Monthly', value: 'Monthly' },
    { label: 'Quarterly', value: 'Quarterly' },
    { label: 'Nil', value: 'Nil' },
  ];

  spmCheckOptions = [
    { label: 'NA (Motor fitted inside the capstan casing) ', value: 'NA' },
    { label: 'Green', value: 'Green' },
    { label: 'Yellow', value: 'Yellow' },
    { label: 'Red', value: 'Red' },
  ];

  constructor(
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private toastService: ToastService,
    private route: ActivatedRoute,
    public formApiService: FormApiService,
    private toast: ToastService,
  ) {}

  showFillingDrainRemarkInput = false;
  showVisualInspectionInput = false;

  // Remarks feilds show and hide booleans ---------------------
  showJBControlInputFeild = false;
  showSwitchesInputField = false;
  showIndicatorInputField = false;
  showConditionFoundationInputFeilds = false;
  showlubricationMechanicalRemarkInput = false;
  showLubricationPointsRemarkInput = false;
  showDriveRemarkInput = false;
  showLimitSwitchRemarkInput = false;
  showOperationalTrailsRemarkInput = false;

  showElectricalHygieneInput = false;
  showOpsSwitchInput = false;
  showIndicatorInput = false;
  showRustObservationFields = false;

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
      port: [''],
      ship: [{ value: '', disabled: true }],
      class_of_ship: [''],
      date_of_inspection: [''],

      date_of_conduct_trail: [''],
      place_of_conduct_trail: ['', Validators.required],
      occasion_of_conduct_trail: ['', Validators.required],
      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],

      capstan: [''],
      lastDateOfOilChange: [''],

      // 1,2 & 3
      type: [''],
      make: [''],
      manufacturer_name: [{ value: '', disabled: true }],
      year_of_manufacture: [''],
      // 4
      last_load_test: [''],
      next_due_load_test: [''],
      load_test_remark: [{ value: '', disabled: true }],

      // 5
      last_visual_rope_survey: [''],
      next_due_visual_rope_survey: [''],
      visual_rope_survey_remark: [{ value: '', disabled: true }],

      // 6
      destruction_test_date: [''],
      destruction_test_date_remark: [''],

      // 7
      wire_rope_fitment_date: [''],
      wire_rope_fitment_date_remark: [''],

      // 8a
      condition_of_jb_control: [''],
      condition_of_jb_control_remark: [''],
      // 8b
      switches_status: [''],
      switches_status_remark: [''],

      // 8c
      indicator_status: [''],
      indicator_status_remark: [''],

      // 9
      condition_of_foundation: [''],
      condition_of_foundation_remark: [''],
      Corrosion: [''],
      Pitting: [''],
      Preserved: [''],
      Others: [''],

      // 10
      lubrication_mechanical_part: [''],
      lubrication_mechanical_part_remark: [''],

      // 11
      lubrication_point: [''],
      lubrication_point_remark: [''],

      // 12
      drive_check: [''],
      drive_check_remark: [''],

      // 13
      limit_switch_sensor: [''],
      limit_switch_sensor_remark: [''],

      // 14
      insulation_motor: [''],
      insulation_motor_remark: [''],

      // 15
      operational_trails_swl: [''],
      operational_trails_swl_remark: [''],

      // 16
      oil_level_gear_box: [''],
      oil_level_gear_box_remarks: [''],

      // 17
      gear_box: [''],
      gear_box_observation: [''],
      gear_box_remark: [''],

      // 18
      lastOilChangeDate: [''],
      nextDueOilChangeDate: [''],
      lastOilChangeDate_remarks: [''],

      // 19 20 21 22 23
      water_content_value: [''],
      Viscosity_value: [''],
      base_number_value: [''],
      acid_number_value: [''],
      metal_traces_value: [''],

      // 25
      spm_measured: [''],
      spm_remarks: [''],

      // 26 a
      starting_current_reference: [''],
      starting_current_measured: [''],
      starting_current_remarks: [''],

      // 26 b
      slide_in_out_reference: [''],
      slide_in_out_reference_measured: [''],
      slide_in_out_reference_remarks: [''],
      // 26c
      tilt_in_out_reference: [''],
      tilt_in_out_measured: [''],
      tilt_in_out_remarks: [''],

      // 27 a
      running_current_reference: [''],
      running_current_measured: [''],
      running_current_remarks: [''],

      // 28
      log_book_reference: [''],
      log_book_measured: [''],
      log_book_remarks: [''],

      // 29
      periodicity_reference: [''],
      periodicity_measured: [''],
      periodicity_remarks: [''],

      // 31
      other_observation: [''],
      // 32
      overall_remark: [''],
    });
  }

  setupConditionalLogic() {
    const monthsSince = (value: any): number | null => {
      if (!value) return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return null;
      const today = new Date();
      return (
        (today.getFullYear() - parsed.getFullYear()) * 12 +
        today.getMonth() -
        parsed.getMonth()
      );
    };

    // --------------------------------------------------- PARAMETER 4 - Load Testing ----------------
    const lastLoadControl = this.form.get('last_load_test');
    const remarkControl = this.form.get('load_test_remark');

    const checkLoadTestValidity = () => {
      const totalMonths = monthsSince(lastLoadControl?.value);
      remarkControl?.enable();
      if (totalMonths === null) {
        remarkControl?.setValue(null);
        return;
      }

      remarkControl?.setValue(
        totalMonths <= 27 && totalMonths >= 0 ? 'SAT' : 'UNSAT',
      );
      remarkControl?.disable();
    };
    // Trigger when either date changes
    lastLoadControl?.valueChanges.subscribe(() => checkLoadTestValidity());

    // ----------------------------------------------------- PARAMETER 5 - Visual Rope Survey ----------------
    const lastVisualControl = this.form.get('last_visual_rope_survey');
    const visualRemarkControl = this.form.get('visual_rope_survey_remark');

    const checkVisualSurveyValidity = () => {
      const totalMonths = monthsSince(lastVisualControl?.value);
      visualRemarkControl?.enable();
      if (totalMonths === null) {
        visualRemarkControl?.setValue(null);
        return;
      }

      visualRemarkControl?.setValue(
        totalMonths <= 24 && totalMonths >= 0 ? 'SAT' : 'UNSAT',
      );
      visualRemarkControl?.disable();
    };

    // Trigger when either date changes
    lastVisualControl?.valueChanges.subscribe(() =>
      checkVisualSurveyValidity(),
    );

    // --------------------------------------------------- PARAMETER - 8a Condition of JB / Control ----------------
    this.form
      .get('condition_of_jb_control')
      ?.valueChanges.subscribe((value) => {
        const remarkControl = this.form.get('condition_of_jb_control_remark');

        if (value === 'Nil') {
          this.showJBControlInputFeild = false;

          remarkControl?.enable({ emitEvent: false });
          remarkControl?.setValue('SAT', { emitEvent: false });
          remarkControl?.disable({ emitEvent: false });
        } else if (value === 'Observation') {
          this.showJBControlInputFeild = true;

          remarkControl?.enable({ emitEvent: false });
          remarkControl?.reset();
        } else {
          this.showJBControlInputFeild = false;

          remarkControl?.enable({ emitEvent: false });
          remarkControl?.reset();
        }
      });
    // ---------------------------------------------------- PARAMETER 8b - Status of Switches ----------------
    this.form.get('switches_status')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('switches_status_remark');

      if (value === 'Nil') {
        this.showSwitchesInputField = false;

        remarkControl?.enable({ emitEvent: false });
        remarkControl?.setValue('SAT', { emitEvent: false });
        remarkControl?.disable({ emitEvent: false });
      } else if (value === 'Observation') {
        this.showSwitchesInputField = true;

        remarkControl?.enable({ emitEvent: false });
        remarkControl?.reset();
      } else {
        this.showSwitchesInputField = false;

        remarkControl?.enable({ emitEvent: false });
        remarkControl?.reset();
      }
    });

    // ---------------- PARAMETER 8c - Status of Indicators ----------------
    this.form.get('indicator_status')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('indicator_status_remark');

      if (value === 'Nil') {
        this.showIndicatorInputField = false;

        remarkControl?.enable({ emitEvent: false });
        remarkControl?.setValue('SAT', { emitEvent: false });
        remarkControl?.disable({ emitEvent: false });
      } else if (value === 'Observation') {
        this.showIndicatorInputField = true;

        remarkControl?.enable({ emitEvent: false });
        remarkControl?.reset();
      } else {
        this.showIndicatorInputField = false;

        remarkControl?.enable({ emitEvent: false });
        remarkControl?.reset();
      }
    });

    //  ----------------------------------- PARAMETER - 9  ---------------------------------------------
    // ---------------- Condition of Foundations ----------------
    this.form
      .get('condition_of_foundation')
      ?.valueChanges.subscribe((value) => {
        console.log('Selected value:', value);

        const remarkControl = this.form.get('condition_of_foundation_remark');

        // Reset observation inputs
        this.form.get('Corrosion')?.reset();
        this.form.get('Pitting')?.reset();
        this.form.get('Preserved')?.reset();
        this.form.get('Others')?.reset();

        if (value === 'No Observation') {
          // 👈 use correct actual value here

          this.showConditionFoundationInputFeilds = false;

          remarkControl?.enable(); // IMPORTANT: enable first
          remarkControl?.setValue('SAT');

          remarkControl?.disable(); // then disable
        } else if (value === 'Observation') {
          this.showConditionFoundationInputFeilds = true;

          remarkControl?.enable();
          remarkControl?.reset();
        } else {
          this.showConditionFoundationInputFeilds = false;

          remarkControl?.enable();
          remarkControl?.reset();
        }
      });
    // --------------------------------- PARAMETER 10- ------------------------------------------
    this.form
      .get('lubrication_mechanical_part')
      ?.valueChanges.subscribe((value) => {
        const remarkControl = this.form.get(
          'lubrication_mechanical_part_remark',
        );

        // Always reset first
        remarkControl?.enable();
        remarkControl?.reset();

        // Hide input by default
        this.showlubricationMechanicalRemarkInput = false;

        // DEBUG (remove later)
        console.log('Lubrication selected:', value);

        if (value === 'Charged') {
          remarkControl?.setValue('SAT');
          remarkControl?.disable();
        } else if (
          value === 'Painted' ||
          value === 'Choked' ||
          value === 'Missing'
        ) {
          remarkControl?.setValue('UNSAT');
          remarkControl?.disable();
        } else if (value === 'Others') {
          // Show input field
          this.showlubricationMechanicalRemarkInput = true;

          // Make it editable text field
          remarkControl?.enable();
          remarkControl?.reset();
        }
      });

    // ---------------------------------- PARAMETER 11 ----------------------------------------
    this.form.get('lubrication_point')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('lubrication_point_remark');

      // Always enable first
      remarkControl?.enable();
      remarkControl?.reset();

      this.showLubricationPointsRemarkInput = false;

      console.log('Selected:', value);

      if (value === 'Charged') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (['Painted', 'Choked', 'Missing'].includes(value)) {
        remarkControl?.setValue('UNSAT');
        remarkControl?.disable();
      } else if (value === 'Others') {
        this.showLubricationPointsRemarkInput = true;

        remarkControl?.reset();
        remarkControl?.enable();
      }
    });
    // ---------------------------------- PARAMETER 12 ----------------------------------------

    this.form.get('drive_check')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('drive_check_remark');

      // Always reset first
      remarkControl?.enable();
      remarkControl?.reset();

      this.showFillingDrainRemarkInput = false;
      this.showDriveRemarkInput = false;

      console.log('Drive selected:', value);

      if (value === 'Nil') {
        // Auto SAT
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Noise Observed') {
        // Set UNSAT first
        remarkControl?.setValue('UNSAT');

        // Show input field
        this.showDriveRemarkInput = true;

        // Enable so user can type alphanumeric remark
        remarkControl?.enable();
      }
    });

    this.form.get('limit_switch_sensor')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('limit_switch_sensor_remark');
      remarkControl?.enable();
      remarkControl?.reset();
      this.showLimitSwitchRemarkInput = false;

      if (value === 'Nil') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Observation') {
        this.showLimitSwitchRemarkInput = true;
        remarkControl?.enable();
      }
    });

    this.form.get('insulation_motor')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('insulation_motor_remark');
      const numericValue = Number(value);
      remarkControl?.enable();

      if (
        value === null ||
        value === undefined ||
        value === '' ||
        Number.isNaN(numericValue)
      ) {
        remarkControl?.setValue(null);
        return;
      }

      remarkControl?.setValue(numericValue >= 2 ? 'SAT' : 'UNSAT');
      remarkControl?.disable();
    });

    this.form.get('operational_trails_swl')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('operational_trails_swl_remark');
      remarkControl?.enable();
      remarkControl?.reset();
      this.showOperationalTrailsRemarkInput = false;

      if (value === 'Nil') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Observation') {
        this.showOperationalTrailsRemarkInput = true;
        remarkControl?.enable();
      }
    });
    // ---------------------------------- PARAMETER 16----------------------------------------
    this.form.get('oil_level_gear_box')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('oil_level_gear_box_remarks');

      remarkControl?.enable();
      remarkControl?.reset();

      if (value === '40-100% filled') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
        // Less than 40% filled
      } else if (value === 'Less than 40% filled') {
        remarkControl?.setValue('SAT with observations'); // use correct value key
        remarkControl?.disable();
      } else if (value === 'Empty') {
        remarkControl?.setValue('UNSAT');
        remarkControl?.disable();
      }
    });

    // ----------------------------------- PARAMETER 17 -------------------------------------
    this.form.get('gear_box_observation')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('gear_box_remark');

      // Enable first
      remarkControl?.enable({ emitEvent: false });

      if (value === 'Yes') {
        remarkControl?.setValue('SAT', { emitEvent: false });
        remarkControl?.disable({ emitEvent: false });
      } else if (value === 'No') {
        remarkControl?.setValue('UNSAT', { emitEvent: false });
        remarkControl?.disable({ emitEvent: false });
      } else {
        remarkControl?.reset();
        remarkControl?.enable({ emitEvent: false });
      }
    });
    // --------------------------------- PARAMETER 18 -------------------------------------

    this.form.get('lastOilChangeDate')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('lastOilChangeDate_remarks');

      if (!value) {
        remarkControl?.setValue(null);
        remarkControl?.enable();
        return;
      }

      const [month, year] = value.split('/').map(Number);

      const today = new Date();
      const currentMonth = today.getMonth() + 1; // 1-12
      const currentYear = today.getFullYear();

      const monthsDiff = (currentYear - year) * 12 + (currentMonth - month);

      console.log('Months Difference:', monthsDiff);

      if (monthsDiff >= 0 && monthsDiff < 12) {
        remarkControl?.setValue('SAT');
      } else {
        remarkControl?.setValue('UNSAT');
      }

      remarkControl?.disable();
    });

    // --------------------------------- PARAMETER 25 -------------------------------------
    const spmMeasuredControl = this.form.get('spm_measured');
    const spmRemarksControl = this.form.get('spm_remarks');

    const handleSpmCheck = () => {
      const value = spmMeasuredControl?.value;

      if (!value) {
        spmRemarksControl?.reset();
        spmRemarksControl?.enable();
        return;
      }
      spmRemarksControl?.enable();

      switch (value) {
        case 'NA':
          spmRemarksControl?.setValue('NA');
          break;

        case 'Green':
          spmRemarksControl?.setValue('SAT');
          break;

        case 'Yellow':
          spmRemarksControl?.setValue('SAT with observations');
          break;

        case 'Red':
          spmRemarksControl?.setValue('UNSAT');
          break;
      }

      // Disable after auto selection
      spmRemarksControl?.disable();
    };

    // Trigger on change
    spmMeasuredControl?.valueChanges.subscribe(() => {
      handleSpmCheck();
    });

    // --------------------------------PARAMETER 26----------------------------------------
    /*const logBookReferenceControl = this.form.get('log_book_reference');
    const logBookMeasuredControl = this.form.get('log_book_measured');
    const logBookRemarksControl = this.form.get('log_book_remarks');

    const handleLogBookCheck = () => {
      const reference = logBookReferenceControl?.value;
      const measured = logBookMeasuredControl?.value;

      if (!reference || !measured) {
        logBookRemarksControl?.reset();
        return;
      }
      if (reference === 'Yes' && measured === 'Yes') {
        logBookRemarksControl?.setValue('SAT');
      } else {
        logBookRemarksControl?.setValue('UNSAT');
      }
    };
    // Subscribe to both fields
    logBookReferenceControl?.valueChanges.subscribe(() => {
      handleLogBookCheck();
    });

    logBookMeasuredControl?.valueChanges.subscribe(() => {
      handleLogBookCheck();
    });*/

    // ------------------------------------------ PARAMETER 27------------------------------------
    /*const periodicityReferenceControl = this.form.get('periodicity_reference');
    const periodicityMeasuredControl = this.form.get('periodicity_measured');
    const periodicityRemarksControl = this.form.get('periodicity_remarks');

    const handlePeriodicityCheck = () => {
      const reference = periodicityReferenceControl?.value;
      const measured = periodicityMeasuredControl?.value;

      periodicityRemarksControl?.enable();

      if (reference === measured) {
        periodicityRemarksControl?.setValue('SAT');
      } else {
        periodicityRemarksControl?.setValue('UNSAT');
      }
    };
    // Subscribe to both
    periodicityReferenceControl?.valueChanges.subscribe(() => {
      handlePeriodicityCheck();
    });

    periodicityMeasuredControl?.valueChanges.subscribe(() => {
      handlePeriodicityCheck();
    });*/
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
        console.error('Error fetching BER certificate data:', err);
        this.toastService.showError('Failed to load BER certificate details.');
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
    const formDataValues = this.form.value;

    const payload: any = {
      ...formDataValues,
      authority_doc: FileUrlUtil.getFileUrl(formDataValues.authority_doc?.id),
    };

    return payload;
  }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      this.form.reset();
      this.toast.showSuccess('Form cleared successfully');
      return;
    }
    // if (type === 'save' && !this.validateForm()) {
    //   return;
    // }

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

  handleFilesUploaded(files: UploadedFileItem[]) {
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

      // ship ka fallback value (agar equipment-level payload mein khaali ho)
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
      console.error('Trial prefill failed (RAS Cargo)', e);
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
        'Failed to load Ras cargo data for selected equipment',
        error,
      );
      this.toast.showError('Failed to load selected equipment data.');
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

    // flat check — koi bhi known top-level key ho to already flat hai
    const isFlat =
      'make' in jsonData ||
      'document_no' in jsonData ||
      'jb_condition' in jsonData;
    if (isFlat) return jsonData;

    // wrapped case — equipment name ke andar
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

  /** Tab switch pe form reset — ship field ko preserve karke */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;
      // enable() zaroori hai warna disabled control reset() se value clear nahi hoti thodi jagah
      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    this.form.patchValue({ ship }, { emitEvent: false });
  }

  /** Poore form ko equipment-specific payload se generic tarike se hydrate karta hai.
   *  Field count bohot zyada hone ki wajah se ek-ek field manually likhne ke bajaye,
   *  jo bhi key form mein control ke roop mein maujood hai, usko payload se patch kar diya jaata hai. */
  fillData(payload: any): void {
    if (!payload) return;

    Object.keys(payload).forEach((key) => {
      if (key === 'authority_doc' || key === 'ship') return; // ye alag se handle honge

      const control = this.form.get(key);
      if (control) {
        control.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });

    // ship — agar equipment payload mein khaali ho to already-patched trialRow.ship_name preserve karo
    this.form
      .get('ship')
      ?.setValue(payload.ship || this.form.get('ship')?.value || '', {
        emitEvent: false,
      });

    // authority_doc — URL string ko file-upload component ke required object shape mein convert karo
    this.form
      .get('authority_doc')
      ?.setValue(this.buildFileUploadValue(payload.authority_doc), {
        emitEvent: false,
      });
  }

  /** Backend se aayi authority_doc (plain URL string ya already-object) ko
   *  FileUploadComponent ke required { id, name, file_path } shape mein convert karta hai */
  private buildFileUploadValue(value: any): UploadedFileItem | null {
    if (!value) {
      return null;
    }

    if (typeof value === 'object' && value.name && value.file_path) {
      return value as UploadedFileItem;
    }

    if (typeof value === 'string') {
      const match = value.match(/api\/files\/([^/]+)\/?$/i);
      const id = match?.[1];

      return {
        id,
        name: id ?? 'Uploaded file',
        file_path: value,
      };
    }

    return null;
  }
}
