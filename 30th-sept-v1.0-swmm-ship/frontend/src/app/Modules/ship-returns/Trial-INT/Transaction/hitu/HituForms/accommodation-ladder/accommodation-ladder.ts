import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnInit,
  Output,
} from '@angular/core';
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
import { YearCalendarComponent } from '../../../../ui/year-calender/year-calendar.component';
import { SelectWithSearchComponent } from '../../../../ui/select-with-search/select-with-search-box.component';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import { UploadedFileItem } from '../anchor-capstan-add/anchor-capstan-add.component';
import { FileUrlUtil } from '../../../../file-url-util';
import { FileUploadComponent } from '../../../../ui/file-upload/file-upload.component';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-accommodation-ladder',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    SelectComponent,
    CalenderComponent,
    InputComponent,
    ParameterCardComponent,
    ApprovalWorkFlow,
    FileUploadComponent,
    ToastComponent,
  ],
  templateUrl: './accommodation-ladder.html',
})
export class AccommodationLadder implements OnInit {
  readonly restartIcon = 'rotate-ccw';

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  bdcForm!: FormGroup;
  uploadedAuthorityFiles: UploadedFileItem[] = [];
  uploadAuFile: UploadedFileItem[] = [];

  // ------------------------------- EQUIPMENT TABS -------------------------------
  eqpList: any[] = [];
  activeTab: any = null;
  workflowTrialId: string | undefined = undefined;

  port_stbd_options = [
    { label: 'PORT', value: 'port' },
    { label: 'STBD', value: 'stbd' },
  ];

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

  showApprovalWorkflowPopup = false;
  isSubmitTime = false;

  loading: boolean = false;
  occasionOfConduct: any[] = [];
  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  yearOfManufactureOptions: any[] = [];
  commandOptions: any[] = [];
  stbdOptions: any[] = [];
  ocationofconduct: any[] = [];
  ladderTypeOptions: any[] = [];
  makeOptions: any[] = [];
  yearOptions: any[] = [];
  statusOptions: any[] = [];
  obsOptions: any[] = [];
  lubOptions: any[] = [];
  oilOptions: any[] = [];
  oilTypeOptions: any[] = [];
  yesNoOptions: any[] = [];
  periodicityOptions: any[] = [];
  spmOptions: any[] = [];
  spmStatusOptions: any[] = [];
  overallOptions: any[] = [];
  ladderOptions: any[] = [];
  condition_observationOptions: any[] = [];
  condition_observationOptions1: any[] = [];
  foundationOptions: any[] = [];
  gearboxOilOptions: any[] = [];
  yesnoOptions: any[] = [];
  spmcheckmoterOptions: any[] = [];
  year_of_manufacture: any[] = [];
  authority_for_conduct_of_trials: any[] = [];
  type_of_ladder: any[] = [];
  logBookOptions: any[] = [];
  statusOptions1: any[] = [];
  statusOptions2: any[] = [];

  placesOptions: any[] = [];

  selectedFile: File | null = null;
  fileName: string = 'No file chosen';

  @Output() fileSelected = new EventEmitter<File | null>();

  onFileChange(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.fileName = file.name;
      this.fileSelected.emit(file);
    }
  }

  removeFile() {
    this.selectedFile = null;
    this.fileName = 'No file chosen';
    this.fileSelected.emit(null);
  }

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private toast: ToastService,
    public formApiService: FormApiService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.setupValueListeners();
    this.loadPlaceOfConductTrail();
    console.log('for service', this.formApiService);

    this.ocationofconduct = [
      { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
      { label: 'End of Refit Trials', value: 'End of Refit Trials' },
      { label: 'Surprise Checks', value: 'Surprise Checks' },
    ];
    this.spmOptions = [
      { label: 'Green', value: 'Green' },
      { label: 'Yellow', value: 'Yellow' },
      { label: 'Red', value: 'Red' },
      { label: 'NA', value: 'NA' },
    ];

    this.statusOptions = [
      { label: 'SAT', value: 'SAT' },
      { label: 'UNSAT', value: 'UNSAT' },
    ];
    this.statusOptions2 = [
      { label: 'SAT', value: 'SAT' },
      { label: 'UNSAT', value: 'UNSAT' },
      { label: 'SAT with observation', value: 'SAT_OBS' },
    ];
    this.spmStatusOptions = [
      { label: 'SAT', value: 'SAT' },
      { label: 'SAT with observation', value: 'SAT_OBS' },
      { label: 'UNSAT', value: 'UNSAT' },
      { label: 'NA', value: 'NA' },
    ];
    this.statusOptions1 = [
      { label: 'SAT', value: 'SAT' },
      { label: 'SAT with Obs/UNSAT', value: 'UNSAT' },
    ];

    this.condition_observationOptions = [
      { label: 'Nil', value: 'Nil' },
      { label: 'Noise Observed', value: 'Noise Observed' },
    ];
    this.condition_observationOptions1 = [
      { label: 'Nil', value: 'Nil' },
      { label: 'Observation', value: 'Observation' },
    ];

    this.foundationOptions = [
      { label: 'No Observation', value: 'No Observation' },
      { label: 'Observation', value: 'Observation' },
    ];

    this.lubOptions = [
      { label: 'Charged', value: 'Charged' },
      { label: 'Painted', value: 'Painted' },
      { label: 'Choked', value: 'Choked' },
      { label: 'Missing', value: 'Missing' },
      { label: 'Others', value: 'Others' },
    ];

    this.oilOptions = [
      { label: '40-100% filled', value: '40-100% filled' },
      { label: 'Less than 40% filled', value: 'Less than 40% filled' },
      { label: 'Empty', value: 'Empty' },
    ];

    this.gearboxOilOptions = [
      { label: 'OC300', value: 'OC300' },
      { label: 'SS320', value: 'SS320' },
      { label: 'Others', value: 'Others' },
    ];

    this.yesnoOptions = [
      { label: 'Yes', value: 'Yes' },
      { label: 'No', value: 'No' },
    ];

    this.spmcheckmoterOptions = [
      { label: 'NA', value: 'NA' },
      { label: 'Green', value: 'Green' },
      { label: 'Yellow', value: 'Yellow' },
      { label: 'Red', value: 'Red' },
    ];

    this.periodicityOptions = [
      { label: 'Monthly', value: 'Monthly' },
      { label: 'Quarterly', value: 'Quarterly' },
      { label: 'Nil', value: 'Nil' },
    ];

    this.logBookOptions = [
      { label: 'Yes', value: 'Yes' },
      { label: 'No', value: 'No' },
    ];

    this.loadTrialPrefillFromQuery();
  }

  setupValueListeners() {
    // Row 4: Load Testing (27 months validity)
    this.bdcForm.get('load_test_date')?.valueChanges.subscribe((value) => {
      if (value) {
        this.evaluateLoadTestValidity(value, 'load_test_observation');
      }
    });

    // Row 5: Serviceability/Visual Survey (24 months validity)
    this.bdcForm.get('survey_date')?.valueChanges.subscribe((value) => {
      if (value) {
        this.evaluateSurveyValidity(value, 'survey_observation');
      }
    });

    // Row 6: Destruction test certificate
    this.bdcForm
      .get('destruction_test_date')
      ?.valueChanges.subscribe((value) => {
        if (value) {
          this.evaluateDestructionTestValidity(
            value,
            'destruction_test_observation',
          );
        }
      });

    // Row 7: Wire rope fitment
    this.bdcForm.get('date_of_fitment')?.valueChanges.subscribe((value) => {
      if (value) {
        this.evaluateWireRopeValidity(value, 'date_of_fitment_observation');
      }
    });

    // Row 8a: JB Electrical condition
    this.bdcForm.get('jb_electrical')?.valueChanges.subscribe((value) => {
      this.determineObservationRemarks(value, 'jb_electrical_observation');
    });

    // Row 8b: Status of Switches
    this.bdcForm.get('jb_switches')?.valueChanges.subscribe((value) => {
      this.determineObservationRemarks(value, 'jb_switches_observation');
    });

    // Row 8c: Status of Indicators
    this.bdcForm.get('jb_indicators')?.valueChanges.subscribe((value) => {
      this.determineObservationRemarks(value, 'jb_indicators_observation');
    });

    // Row 9: Condition of Foundations
    this.bdcForm
      .get('foundation_observation')
      ?.valueChanges.subscribe((value) => {
        this.determineFoundationRemarks(value, 'foundation_status');
      });

    // Row 10: Lubrication of Mechanical Part
    this.bdcForm.get('lubrication')?.valueChanges.subscribe((value) => {
      this.determineLubricationRemarks(value, 'lubrication_status');
    });

    // Row 11: Lubrication Points
    this.bdcForm.get('lubrication_points')?.valueChanges.subscribe((value) => {
      this.determineLubricationPointsRemarks(
        value,
        'lubrication_points_status',
      );
    });

    // Row 12: Drive noise
    this.bdcForm.get('drive')?.valueChanges.subscribe((value) => {
      this.determineDriveRemarks(value, 'drive_observation');
    });

    // Row 13: Limit Switch/Sensor
    this.bdcForm.get('limit_switch')?.valueChanges.subscribe((value) => {
      this.determineObservationRemarks(value, 'limit_switch_observation');
    });

    // Row 14: Insulation Motor
    this.bdcForm.get('insulation_value')?.valueChanges.subscribe((value) => {
      this.determineInsulationRemarks(value, 'insulation_observation');
    });

    // Row 15: Operational Trials at SWL
    this.bdcForm.get('operational_trials')?.valueChanges.subscribe((value) => {
      this.determineObservationRemarks(value, 'operational_trials_observation');
    });

    this.bdcForm
      .get('oil_type_observation')
      ?.valueChanges.subscribe((value) => {
        this.determineObservationRemarks1(value, 'bdc_17_remark');
      });

    // Row 16: Oil Level in Gear Box
    this.bdcForm.get('oil_level')?.valueChanges.subscribe((value) => {
      this.determineOilLevelRemarks(value, 'oil_level_observation');
    });

    // Row 17: Oil being used in Gear Box
    this.bdcForm.get('oil_type')?.valueChanges.subscribe((value) => {
      this.determineYesNoRemarks(value, 'oil_type_observation');
    });

    // Row 18: Change of Oil (12 months validity)
    this.bdcForm.get('oil_change_date')?.valueChanges.subscribe((value) => {
      if (value) {
        this.evaluateOilChangeValidity(value, 'oil_change_observation');
      }
    });

    // Row 20: SPM Check of Motor
    this.bdcForm.get('spm_check')?.valueChanges.subscribe((value) => {
      this.determineSPMRemarks(value, 'spm_check_observation');
    });

    // Row 22: Starting current & other current checks
    this.bdcForm.get('starting_current')?.valueChanges.subscribe(() => {
      this.evaluateCurrentValue('starting_current', 'status_26_1');
    });
    this.bdcForm.get('slideinout_start')?.valueChanges.subscribe(() => {
      this.evaluateCurrentValue('slideinout_start', 'status_26_2');
    });
    this.bdcForm.get('tiltinout_start')?.valueChanges.subscribe(() => {
      this.evaluateCurrentValue('tiltinout_start', 'status_26_3');
    });
    this.bdcForm.get('loweringhoisting_start')?.valueChanges.subscribe(() => {
      this.evaluateCurrentValue('loweringhoisting_start', 'status_26_4');
    });

    // Row 23: Running current
    this.bdcForm.get('runningcurrent')?.valueChanges.subscribe(() => {
      this.evaluateCurrentValue('runningcurrent', 'status_27_1');
    });
    this.bdcForm.get('slideinout_run')?.valueChanges.subscribe(() => {
      this.evaluateCurrentValue('slideinout_run', 'status_27_2');
    });
    this.bdcForm.get('tiltinout_run')?.valueChanges.subscribe(() => {
      this.evaluateCurrentValue('tiltinout_run', 'status_27_3');
    });
    this.bdcForm.get('loweringhoisting_run')?.valueChanges.subscribe(() => {
      this.evaluateCurrentValue('loweringhoisting_run', 'status_27_4');
    });

    // Row 24: Log book exist ---------------------- NO NEED TO UPDATE AS THE OPTIONS OF SAT/ UNSAT WILL RENDER NO AUTO FILLING
    // this.bdcForm.get('log_measured')?.valueChanges.subscribe((value) => {
    //   this.determineLogBookRemarks(value, 'status_28');
    // });

    // Row 25: Periodicity of measurement --------------------- NO NEED TO UPDATE AS THE OPTIONS OF SAT/ UNSAT WILL RENDER NO AUTO FILLING
    // this.bdcForm.get('periodicity')?.valueChanges.subscribe((value) => {
    //   this.determinePeriodicityRemarks(value, 'status_29');
    // });

    // Row 26: SPM Check Motor
    this.bdcForm.get('spm_check_motor')?.valueChanges.subscribe((value) => {
      this.determineSPMRemarks(value, 'status_30');
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

  // Helper methods for auto-calculation and remarks
  evaluateLoadTestValidity(dateValue: string, remarkControl: string) {
    if (dateValue) {
      const loadTestDate = new Date(dateValue);
      const today = new Date();
      const monthsDiff =
        (today.getFullYear() - loadTestDate.getFullYear()) * 12 +
        (today.getMonth() - loadTestDate.getMonth());

      if (monthsDiff < 27) {
        this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
      } else {
        this.bdcForm
          .get(remarkControl)
          ?.setValue('UNSAT', { emitEvent: false });
      }
    }
  }

  evaluateSurveyValidity(dateValue: string, remarkControl: string) {
    if (dateValue) {
      const surveyDate = new Date(dateValue);
      const today = new Date();
      const monthsDiff =
        (today.getFullYear() - surveyDate.getFullYear()) * 12 +
        (today.getMonth() - surveyDate.getMonth());

      if (monthsDiff < 24) {
        this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
      } else {
        this.bdcForm
          .get(remarkControl)
          ?.setValue('UNSAT', { emitEvent: false });
      }
    }
  }

  evaluateDestructionTestValidity(dateValue: string, remarkControl: string) {
    if (dateValue) {
      // Check if destruction test certificate is valid
      this.bdcForm.get(remarkControl)?.setValue('', { emitEvent: false });
    }
  }

  evaluateWireRopeValidity(dateValue: string, remarkControl: string) {
    if (dateValue) {
      this.bdcForm.get(remarkControl)?.setValue('', { emitEvent: false });
    }
  }

  evaluateOilChangeValidity(dateValue: string, remarkControl: string) {
    if (dateValue) {
      const oilChangeDate = new Date(dateValue);
      const today = new Date();
      const monthsDiff =
        (today.getFullYear() - oilChangeDate.getFullYear()) * 12 +
        (today.getMonth() - oilChangeDate.getMonth());

      if (monthsDiff < 12) {
        this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
      } else {
        this.bdcForm
          .get(remarkControl)
          ?.setValue('UNSAT', { emitEvent: false });
      }
    }
  }

  evaluateCurrentValue(valueControl: string, remarkControl: string) {
    // Current values are measured and compared to reference
    // If value exists, assume SAT, otherwise can be UNSAT
    const value = this.bdcForm.get(valueControl)?.value;
    if (value && value.trim() !== '') {
      this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
    } else {
      this.bdcForm.get(remarkControl)?.setValue('UNSAT', { emitEvent: false });
    }
  }

  determineObservationRemarks(observationValue: string, remarkControl: string) {
    if (observationValue === 'Nil') {
      this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
    } else if (observationValue === 'Observation') {
      this.bdcForm
        .get(remarkControl)
        ?.setValue('SAT OBS', { emitEvent: false });
    }
  }

  determineObservationRemarks1(
    observationValue: string,
    remarkControl: string,
  ) {
    if (observationValue === 'Yes') {
      this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
    } else if (observationValue === 'No') {
      this.bdcForm.get(remarkControl)?.setValue('UNSAT', { emitEvent: false });
    }
  }

  determineFoundationRemarks(observationValue: string, remarkControl: string) {
    if (observationValue === 'No Observation') {
      this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
    } else {
      this.bdcForm.get(remarkControl)?.setValue('UNSAT', { emitEvent: false });
    }
  }

  determineLubricationRemarks(lubValue: string, remarkControl: string) {
    if (lubValue === 'Charged') {
      this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
    } else if (
      lubValue === 'Painted' ||
      lubValue === 'Choked' ||
      lubValue === 'Missing'
    ) {
      this.bdcForm.get(remarkControl)?.setValue('UNSAT', { emitEvent: false });
    } else if (lubValue === 'Others') {
      this.bdcForm
        .get(remarkControl)
        ?.setValue('SAT_OBS', { emitEvent: false });
    }
  }

  determineLubricationPointsRemarks(lubValue: string, remarkControl: string) {
    if (lubValue === 'Charged') {
      this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
    } else if (
      lubValue === 'Painted' ||
      lubValue === 'Choked' ||
      lubValue === 'Missing'
    ) {
      this.bdcForm.get(remarkControl)?.setValue('UNSAT', { emitEvent: false });
    } else if (lubValue === 'Others') {
      this.bdcForm
        .get(remarkControl)
        ?.setValue('SAT_OBS', { emitEvent: false });
    }
  }

  determineDriveRemarks(driveValue: string, remarkControl: string) {
    if (driveValue === 'Nil') {
      this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
    } else if (driveValue === 'Noise Observed') {
      this.bdcForm.get(remarkControl)?.setValue('UNSAT', { emitEvent: false });
    }
  }

  determineInsulationRemarks(value: string, remarkControl: string) {
    const numericValue = parseFloat(value);
    if (!isNaN(numericValue) && numericValue >= 2) {
      this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
    } else if (!isNaN(numericValue) && numericValue < 2) {
      this.bdcForm.get(remarkControl)?.setValue('UNSAT', { emitEvent: false });
    }
  }

  determineOilLevelRemarks(levelValue: string, remarkControl: string) {
    if (levelValue === '40-100% filled') {
      this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
    } else if (levelValue === 'Less than 40% filled') {
      this.bdcForm
        .get(remarkControl)
        ?.setValue('SAT_OBS', { emitEvent: false });
    } else if (levelValue === 'Empty') {
      this.bdcForm.get(remarkControl)?.setValue('UNSAT', { emitEvent: false });
    }
  }

  determineYesNoRemarks(value: string, remarkControl: string) {
    if (value === 'Yes') {
      this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
    } else if (value === 'No') {
      this.bdcForm.get(remarkControl)?.setValue('UNSAT', { emitEvent: false });
    }
  }

  determineSPMRemarks(spmValue: string, remarkControl: string) {
    if (spmValue === 'NA') {
      this.bdcForm.get(remarkControl)?.setValue('NA', { emitEvent: false });
    } else if (spmValue === 'Green') {
      this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
    } else if (spmValue === 'Yellow') {
      this.bdcForm
        .get(remarkControl)
        ?.setValue('SAT_OBS', { emitEvent: false });
    } else if (spmValue === 'Red') {
      this.bdcForm.get(remarkControl)?.setValue('UNSAT', { emitEvent: false });
    }
  }

  // determineLogBookRemarks(logValue: string, remarkControl: string) {
  //   if (logValue === 'Yes') {
  //     this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
  //   } else if (logValue === 'No') {
  //     this.bdcForm.get(remarkControl)?.setValue('UNSAT', { emitEvent: false });
  //   }
  // }

  // determinePeriodicityRemarks(periodValue: string, remarkControl: string) {
  //   if (periodValue === 'Monthly' || periodValue === 'Quarterly') {
  //     this.bdcForm.get(remarkControl)?.setValue('SAT', { emitEvent: false });
  //   } else if (periodValue === 'Nil') {
  //     this.bdcForm.get(remarkControl)?.setValue('UNSAT', { emitEvent: false });
  //   }
  // }

  buildForm() {
    this.bdcForm = this.fb.group({
      ship: [{ value: '', disabled: true }],
      port_stbd: [''],
      date_of_inspection: [''],
      place_of_conduct_of_trials: [''],
      occasion_for_conduct_of_trials: [''],
      authority_for_conduct_of_trials: [''],
      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],
      upl_file: [''],
      // Row 1-3
      type_of_ladder: [''],
      // makeOptions: [''],
      manufacturer_name: [{ value: '', disabled: true }],
      year_of_manufacture: [''],

      // Row 4
      load_test_date: [''],
      load_test_observation: [''],

      // Row 5
      survey_date: [''],
      survey_observation: [''],

      // Row 6
      destruction_test_date: [''],
      destruction_test_observation: [''],
      status_32: [''], // New control for status of destruction test certificate
      bdc_6_remark: [''], // New control for additional remarks for Row 6
      bdc_6_remark2: [''], // New control for additional remarks for Row 6

      // Row 7
      date_of_fitment: [''],
      date_of_fitment_observation: [''],

      // Row 8a
      jb_electrical: [''],
      jb_electrical_observation: [''],
      bdc_8_remark2: [''], // New control for additional remarks for Row 8a
      bdc_8c_remark2: [''], // New control for additional remarks for Row 8c
      bdc_8b_remark2: [''], // New control for additional remarks for Row 8b

      // Row 8b
      jb_switches: [''],
      jb_switches_observation: [''],

      // Row 8c
      jb_indicators: [''],
      jb_indicators_observation: [''],

      // Row 9
      foundation_observation: [''],
      foundation_status: [''],
      deck_plating_corrosion_remark: [''], // New control for corrosion remark
      deck_plating_pitting_remark: [''], // New control for pitting remark
      deck_plating_unpainted_remark: [''], // New control for unpainted remark
      deck_plating_others_remark: [''], // New control for others remark

      // Row 10
      lubrication: [''],
      lubrication_status: [''],
      bdc_10_remark: [''],

      // Row 11
      lubrication_points: [''],
      lubrication_points_status: [''],
      bdc_11_remark: [''], // New control for additional remarks for Row 11

      // Row 12
      drive: [''],
      drive_observation: [''],
      bdc_12_remark: [''], // New control for additional remarks for Row 12
      loweringhoisting: [''],
      tiltinout_drive: [''],
      slideinout_drive: [''],
      yes_no: [''],

      // Row 13
      limit_switch: [''],
      limit_switch_observation: [''],
      bdc_13_remark: [''], // New control for additional remarks for Row 13

      // Row 14
      insulation_value: [''],
      insulation_observation: [''],

      // Row 15
      operational_trials: [''],
      operational_trials_observation: [''],
      bdc_15_remark: [''], // New control for additional remarks for Row 15

      // Row 16
      oil_level: [''],
      oil_level_observation: [''],

      // Row 17
      oil_type: [''],
      oil_type_observation: [''],
      bdc_17_remark: [''], // New control for additional remarks for Row 17
      tiltinout: [''],

      // Row 18
      oil_change_date: [''],
      oil_change_observation: [''],

      // Row 19 (Lub oil analysis parameters)
      water_content: [''],
      viscosity: [''],
      base_number: [''],
      acid_number: [''],
      metal_traces: [''],

      // Row 20
      spm_check: [''],
      spm_check_observation: [''],

      // Row 22 - Starting current
      starting_current: [''],
      slideinout_start: [''],
      tiltinout_start: [''],
      loweringhoisting_start: [''],
      status_26_1: [''],
      status_26_2: [''],
      status_26_3: [''],
      status_26_4: [''],
      slideinout: [''],

      // Row 23 - Running current
      runningcurrent: [''],
      slideinout_run: [''],
      tiltinout_run: [''],
      loweringhoisting_run: [''],
      status_27_1: [''],
      status_27_2: [''],
      status_27_3: [''],
      status_27_4: [''],

      // Row 24
      log_measured: [''],
      status_28: [''],

      // Row 25
      periodicity: [''],
      status_29: [''],

      // Row 26
      spm_check_motor: [''],
      status_30: [''],

      // Row 27
      other_observations: [''],

      // Row 28
      overall_remarks: [''],
    });
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }

  handleuploadFile(files: UploadedFileItem[]): void {
    this.uploadAuFile = files;
  }

  validateForm(): boolean {
    if (this.bdcForm.invalid) {
      this.bdcForm.markAllAsTouched();
      this.toast.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  buildPayload() {
    const formDataValues = this.bdcForm.getRawValue();
    const payload = {
      ...formDataValues,
      authority_doc: FileUrlUtil.getFileUrl(formDataValues.authority_doc?.id),
      upl_file: FileUrlUtil.getFileUrl(formDataValues.upl_file?.id),
    };
    return payload;
  }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      this.bdcForm.reset();
      this.toast.showSuccess('Form cleared successfully');
      return;
    }
    const payload = this.buildPayload();
    // return;
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

      this.bdcForm.patchValue(
        { ship: trialRow.ship_name },
        { emitEvent: false },
      );

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
      console.error('Trial prefill failed (Accommodation Ladder)', e);
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
        'Failed to load Accommodation Ladder data for selected equipment',
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

    this.bdcForm.patchValue(
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
      'type_of_ladder' in jsonData ||
      'load_test_date' in jsonData ||
      'jb_electrical' in jsonData;
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

  /** Tab switch pe form reset — ship field ko preserve karke */
  private resetFormData(): void {
    const ship = this.bdcForm.get('ship')?.value;

    Object.keys(this.bdcForm.controls).forEach((key) => {
      const control = this.bdcForm.get(key);
      if (!control) return;
      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    this.bdcForm.patchValue({ ship }, { emitEvent: false });
  }

  /** Poore form ko equipment-specific payload se generic tarike se hydrate karta hai. */
  fillData(payload: any): void {
    if (!payload) return;

    const specialKeys = ['authority_doc', 'upl_file', 'ship'];

    Object.keys(payload).forEach((key) => {
      if (specialKeys.includes(key)) return;

      const control = this.bdcForm.get(key);
      if (control) {
        control.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });

    // ship — fallback trialRow.ship_name se agar equipment payload mein khaali ho
    this.bdcForm
      .get('ship')
      ?.setValue(payload.ship || this.bdcForm.get('ship')?.value || '', {
        emitEvent: false,
      });

    // Dono file-upload fields — URL string ko required object shape mein convert karo
    this.bdcForm
      .get('authority_doc')
      ?.setValue(this.buildFileUploadValue(payload.authority_doc), {
        emitEvent: false,
      });
    this.bdcForm
      .get('upl_file')
      ?.setValue(this.buildFileUploadValue(payload.upl_file), {
        emitEvent: false,
      });
  }

  /** Backend se aayi file-URL string (authority_doc / upl_file) ko
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
