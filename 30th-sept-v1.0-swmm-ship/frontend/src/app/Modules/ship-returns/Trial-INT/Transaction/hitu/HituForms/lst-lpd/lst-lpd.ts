import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import {
  ReactiveFormsModule,
  FormGroup,
  FormBuilder,
  FormArray,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DynamicSelectTextarea } from '../../../../ui/dynamic-select-textarea/dynamic-select-textarea';
import { DynamicTextarea } from '../../../../ui/dynamic-textarea/dynamic-textarea';
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ParameterCardComponent } from '../../../../ui/parameter-card/parameter-card.component';
import { CalenderComponent } from '../../../../ui/calender.component';
import {
  FileUploadComponent,
  UploadedFileItem,
} from '../../../../ui/file-upload/file-upload.component';
import { InputComponent } from '../../../../ui/input.component';
import { SelectWithSearchComponent } from '../../../../ui/select-with-search/select-with-search-box.component';
import { SelectComponent } from '../../../../ui/select.component';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { MonthYearCalendarComponent } from '../../../../ui/month-year-calendar.component';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-lst-lpd',
  standalone: true,
  templateUrl: './lst-lpd.html',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    SelectComponent,
    CalenderComponent,
    InputComponent,
    ParameterCardComponent,
    LoadingButtonComponent,
    FileUploadComponent,
    DynamicTextarea,
    MonthYearCalendarComponent,
    ApprovalWorkFlow,
  ],
})
export class LSTLPD {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
  loading = false;
  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  readonly restartIcon = 'rotate-ccw';
  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';
  form!: FormGroup;
  uploadedAuthorityFiles: UploadedFileItem[] = [];

  occasionOptions = [
    { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
    { label: 'End of Refit Trials', value: 'End of Refit Trials' },
    { label: 'Surprise Checks', value: 'Surprise Checks' },
    { label: 'HVAC Audit', value: 'HVAC Audit' },
  ];

  ObservationsNilOptions = [
    { label: 'Nil', value: 'nil' },
    { label: 'Observation', value: 'observation' },
  ];

  calenderOptions = [
    { label: 'Nil', value: 'nil' },
    { label: 'Calendar', value: 'observation' },
  ];

  noiseObserved = [
    { label: 'Nil', value: 'nil' },
    { label: 'Noise Observed', value: 'observation' },
  ];

  deckOptions = [
    { label: 'Corrosion', value: 'corrosion' },
    { label: 'Pitting', value: 'pitting' },
    { label: 'Unpainted', value: 'unpainted' },
    { label: 'Others', value: 'others' },
  ];
  derrickDeckTypeOptions = [
    { label: 'Corrosion', value: 'corrosion' },
    { label: 'Pitting', value: 'pitting' },
    { label: 'Unpainted', value: 'unpainted' },
    { label: 'Bonding straps condition', value: 'bonding_straps' },
  ];

  derrickWinchPositionOptions = [
    { label: 'Port', value: 'port' },
    { label: 'Stbd', value: 'stbd' },
    { label: 'Other', value: 'other' },
  ];

  greaseOptions = [
    { label: 'Charged', value: 'charged' },
    { label: 'Painted', value: 'painted' },
    { label: 'Choked', value: 'choked' },
    { label: 'Missing', value: 'missing' },
    { label: 'Others', value: 'others' },
  ];

  remarkOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'SAT with observation', value: 'SAT_OBS' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  oilLevelOptions = [
    { label: '40-100% filled', value: 'full' },
    { label: 'Less than 40%', value: 'low' },
    { label: 'Empty', value: 'empty' },
  ];

  satUnsatOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'SAT with observation', value: 'SAT_OBS' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  satUnsatOptions1 = [
    { label: 'SAT', value: 'SAT' },

    { label: 'UNSAT', value: 'UNSAT' },
  ];

  yesNoOptions = [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ];

  periodicityOptions = [
    { label: 'Monthly', value: 'monthly' },
    { label: 'Quarterly', value: 'quarterly' },
    { label: 'Nil', value: 'nil' },
  ];

  periodicityOptions1 = [
    { label: 'Monthly', value: 'monthly' },
    { label: 'Quarterly', value: 'quarterly' },
  ];

  spmOptions = [
    { label: 'NA', value: 'na' },
    { label: 'Green', value: 'green' },
    { label: 'Yellow', value: 'yellow' },
    { label: 'Red', value: 'red' },
  ];

  rampConditionOptions = [
    { label: 'Corrosion', value: 'corrosion' },
    { label: 'Bent', value: 'bent' },
    { label: 'Damage', value: 'damage' },
    { label: 'Dent', value: 'dent' },
  ];

  hydraulicLineOptions = [
    { label: 'Corrosion', value: 'corrosion' },
    { label: 'Bent', value: 'bent' },
    { label: 'Damage', value: 'damage' },
    { label: 'Outer dia reduced', value: 'outer dia reduced' },
  ];

  lockingCleatsOptions = [
    { label: 'Bents', value: 'bents' },
    { label: 'Damage', value: 'damage' },
    { label: 'Corrosion', value: 'corrosion' },
  ];
  emergencyCleatsOptions = [
    { label: 'Bents', value: 'bents' },
    { label: 'Damage', value: 'damage' },
    { label: 'Corrosion', value: 'corrosion' },
  ];

  limitSwitchOptions = [
    { label: 'Working', value: 'working' },
    { label: 'Not Working', value: 'not_working' },
  ];

  hingesOptions = [
    { label: 'Corrosion', value: 'corrosion' },
    { label: 'Thinned', value: 'thinned' },
  ];

  pistonOptions = [
    { label: 'Corrosion', value: 'corrosion' },
    { label: 'Broken', value: 'broken' },
  ];

  rubberOptions = [
    { label: 'Damaged', value: 'damaged' },
    { label: 'Deteriorated', value: 'deteriorated' },
  ];
  pumpOptions = [
    { label: 'Operational', value: 'operational' },
    { label: 'Non Operational', value: 'non_operational' },
  ];
  combinedOptions = [
    { label: 'Nil', value: 'nil' },
    { label: 'Observation', value: 'observation' },
    ...this.rampConditionOptions,
  ];

  obsRemarkOptions = [
    { label: 'SAT with observation', value: 'SAT_OBS' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];
  modeOptions = [
    { label: 'Ops', value: 'ops' },
    { label: 'Non Ops', value: 'non_ops' },
    { label: 'NA', value: 'na' },
  ];

  yesNaOptions = [
    { label: 'NA', value: 'NA' },
    { label: 'Calendar', value: 'calendar' },
    { label: 'Observation', value: 'observation' },
  ];

  obsOptions = [
    { label: 'No Observation', value: 'nil' },
    { label: 'Observation', value: 'obs' },
  ];

  capstanPositionOptions = [
    { label: 'Fwd', value: 'fwd' },
    { label: 'Mid', value: 'mid' },
    { label: 'Aft', value: 'aft' },
    { label: 'Other', value: 'other' },
  ];

  tableSectionOptions = [
    { id: 'tank_hauling_capstan', label: 'TANK HAULING CAPSTAN' },
    { id: 'vehicle_ramp', label: 'VEHICLE RAMP' },
    { id: 'cargo_hatch', label: 'CARGO HATCH' },
    { id: 'bow_door', label: 'BOW DOOR' },
    { id: 'aft_winch', label: 'AFT General Purpose Winch' },
    { id: 'derrick_winch', label: 'DERRICK WINCH' },
  ];

  selectedTableSections = new Set<string>();

  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  locationOptions: any[] = [];

  showCargoToOperationalRemarks = false;

  // ------------------------------- EQUIPMENT TABS -------------------------------
  eqpList: any[] = [];
  activeTab: any = null;
  workflowTrialId: string | undefined = undefined;
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;

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

  /** Saare dynamic-textarea FormArrays */
  private readonly stringArrayFields = [
    'extra_modes',
    'extra_modes1',
    'extra_modes2',
  ];

  /** "status/select/date" driver fields — inke upar valueChanges subscription ya
   *  template (valueChange)/(change) handler hai jo dusre fields derive/reset karta hai.
   *  Ye pehle patch karne honge taaki handlers khud sahi state bana dein */
  private readonly driverFields = [
    'ferrodo_status',
    'gearbox_status',
    'deck_obs',
    'grease_status',
    'oil_level',
    'oil_level_status',
    'oil_level_obs_cbpm',
    'grease_points_status',
    'foundation_status',
    'indicators_remark',
    'switches_status',
    'switches_remark',
    'manual_status',
    'extra_status2',
    'manual_mode2',
    'manual_status1',
    'spm_status',
    'spm_status1',
    'oil_level_status1',
    'grease_status1',
    'ramp_status',
    'ramp_status_hatch',
    'bow_door_status',
    'derrick_date',
    'rope_test_date',
    'rope_fitment_date',
    'jb_status',
    'mech_grease_status',
    'drive_status',
    'motor_ir_value',
    'motor_ir_value1',
    'motor_ir_value2',
    'ferrodo_status1',
    'gearbox_status1',
    'deck_status1',
  ];

  /** Remark fields jinhe drivers auto-derive karte hain, ya "observation" case mein
   *  blank karke user-choice ke liye chhod dete hain — driver ke baad force-patch
   *  karna zaroori hai warna actual saved value overwrite ho jayega */
  private readonly overrideRemarkFields = [
    'switches_remark1',
    'indicator_remark',
    'speed_remark',
    'limit_switch_remark',
    'ramp_remark_hatch',
    'bow_door_remark',
    'ramp_remark',
    'extra_remark2',
    'manual_remark',
    'manual_remark2',
    'foundation_remark',
    'mech_grease_remark',
    'drive_remark',
    'grease_points_remark',
    'ferrodo_remark',
    'ferrodo_remark1',
    'gearbox_remark',
    'gearbox_remark1',
    'deck_remark',
    'deck_remark1',
    'grease_remark',
    'grease_remark1',
    'oil_level_remark_cbpm',
    'oil_change_remark_cbpm',
    'oil_level_remark1',
    'spm_remark',
    'spm_remark1',
    'motor_ir_remark',
    'motor_ir_remark1',
    'motor_ir_remark2',
    'ramp_remark_if_sat',
  ];

  /** Free-text/obs detail fields — sabse aakhir mein patch, warna driver/remark
   *  resets inhe khaali kar denge */
  private readonly dependentFreeTextFields = [
    'ferrodo_obs',
    'ferrodo_obs1',
    'gearbox_obs',
    'gearbox_obs1',
    'deck_remark_obs',
    'deck_obs_corrosion1',
    'deck_detail1',
    'grease_remark_obs',
    'grease_other',
    'grease_other1',
    'spm_obs',
    'spm_obs1',
    'ramp_obs',
    'ramp_obs_hatch',
    'bow_door_obs',
    'switches_obs',
    'switches_obs1',
    'indicate_obs',
    'foundation_obs',
    'mech_grease_obs',
    'grease_points_other',
    'drive_obs',
    'limit_switch_obs',
    'manual_obs',
    'manual_obs1',
    'manual_obs2',
    'extra_obs2',
    'speed_remark_obs',
  ];

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private toastService: ToastService,
    public formApiService: FormApiService,
    private toast: ToastService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadClasses();
    this.listenToClassChanges();
    this.loadLocation();

    this.form.get('speed_remark')?.valueChanges.subscribe((value) => {
      if (value === 'SAT') {
        this.form.patchValue({
          speed_remark_obs: '',
        });
      }
    });

    this.form.get('oil_level_obs_cbpm')?.valueChanges.subscribe(() => {
      this.handleLubOilDate();
    });

    this.form.get('oil_level_status')?.valueChanges.subscribe(() => {
      this.handleOilLevel();
    });

    this.form.get('grease_points_status')?.valueChanges.subscribe(() => {
      this.handleOperationalTrials();
    });

    this.form.get('foundation_status')?.valueChanges.subscribe(() => {
      this.handleFoundationStatus();
    });

    this.form.get('indicators_remark')?.valueChanges.subscribe(() => {
      this.handleFoundationObservation();
    });

    this.form.get('switches_remark1')?.valueChanges.subscribe((value) => {
      if (value === 'SAT') {
        this.form.patchValue({
          switches_obs1: '',
        });
      }
    });

    this.form.get('indicator_remark')?.valueChanges.subscribe((value) => {
      if (value === 'SAT') {
        this.form.patchValue({
          indicate_obs: '',
        });
      }
    });

    this.form.get('switches_status')?.valueChanges.subscribe(() => {
      this.handleSwitchesStatus();
    });

    this.form.get('switches_remark')?.valueChanges.subscribe(() => {
      this.handleSwitchesRemark();
    });

    this.form.get('manual_status')?.valueChanges.subscribe(() => {
      this.handleVehicleRampObservation(
        'manual_status',
        'manual_remark',
        'manual_obs',
      );
    });

    this.form.get('switches_status')?.valueChanges.subscribe(() => {
      this.handleSwitchesStatus();
    });

    this.form.get('extra_status2')?.valueChanges.subscribe(() => {
      this.handleVehicleRampObservation(
        'extra_status2',
        'extra_remark2',
        'extra_obs2',
      );
    });

    this.form.get('manual_mode2')?.valueChanges.subscribe(() => {
      this.handleModesOfOperation(
        'manual_mode2',
        'manual_status2',
        'manual_remark2',
        'manual_obs2',
      );
    });

    this.form.get('extra_modes2')?.valueChanges.subscribe(() => {
      this.handleModesOfOperation(
        'extra_modes2',
        'extra_status2',
        'extra_remark2',
        'extra_obs2',
      );
    });

    this.form.get('manual_status1')?.valueChanges.subscribe(() => {
      this.handleManualStatus1();
    });

    this.form.get('grease_status')?.valueChanges.subscribe((value: string) => {
      this.handleGreasingPoint(value);
    });

    this.form.get('oil_level')?.valueChanges.subscribe(() => {
      this.handleOilLevel();
    });

    this.form.get('spm_status')?.valueChanges.subscribe(() => {
      this.handleSPM('spm_status', 'spm_remark', 'spm_obs');
    });

    this.form.get('spm_status1')?.valueChanges.subscribe(() => {
      this.handleSPM('spm_status1', 'spm_remark1', 'spm_obs1');
    });

    this.form.get('oil_level_status1')?.valueChanges.subscribe(() => {
      this.handleDerrickOilLevel();
    });

    this.form.get('grease_status1')?.valueChanges.subscribe((value: string) => {
      this.handleDerrickGreasePoint(value);
    });

    this.loadTrialPrefillFromQuery();
  }

  buildForm() {
    this.form = this.fb.group({
      classOfShip: [''],
      ship: [''],
      date_of_conduct_trail: [''],
      place_of_conduct_trail: [''],
      document_no: [''],
      occasion_of_conduct_trail: [''],
      authority: [''],
      authority_date: [''],
      authority_doc: [''],

      file: [''],
      make: [''],
      tank_capstan_position: [''],
      tank_capstan_position_other: [''],
      deck_obs: [''],

      manual_obs1: [''],

      oil_change_remark_cbpm: [''],

      // deck_remark: [''],
      deck_corrosion: [''],
      deck_pitting: [''],
      deck_unpainted: [''],
      deck_others: [''],

      deck_remark_obs: [''],
      rope_fitment_obs: [''],
      year_of_manufacture: [''],
      ferrodo_status: [''],
      ferrodo_remark: [''],
      ferrodo_obs: [''],
      gearbox_status: [''],
      gearbox_remark: [''],
      gearbox_obs: [''],
      motor_ir_value: [''],
      motor_ir_remark: [''],
      deck_status: [''],
      deck_obs_corrosion: [''],
      deck_remark: [''],
      operational_trials: [''],
      operational_trials_1: [''],
      operational_trials_remark: [''],
      grease_status: [''],
      grease_other: [''],
      grease_remark: [''],
      grease_remark_obs: [''],
      oil_used: [''],
      oil_level: [''],
      oil_level_obs: [''],
      oil_level_remark: [''],
      oil_change_date: [''],
      oil_change_batch: [''],
      oil_change_remark: [''],
      kitti_water: [''],
      kitti_file: [''],
      start_current_ref: [''],
      start_current_meas: [''],
      start_current_remark: [''],
      running_current_ref: [''],
      running_current_meas: [''],
      running_current_remark: [''],
      logbook_ref: [''],
      logbook_meas: [''],
      log_book_remark: [''],
      periodicity_ref: [''],
      periodicity_meas: [''],
      period_measure_remark: [''],
      spm_status: [''],
      spm_obs: [''],
      spm_remark: [{ value: '', disabled: true }],
      load_other_obs: [''],
      load_overall_remark: [''],
      load_overall_obs: [''],
      kitti_water2: [''],
      kitti_file2: [''],
      ramp_condition: [''],
      ramp_make: [''],
      ramp_year: [''],
      ramp_status: [''],
      ramp_remark_if_sat: [{ value: '', disabled: true }],
      ramp_remark: [''],
      ramp_obs: [''],
      ramp_hydraulic: [''],
      ramp_hydraulic_obs: [''],
      ramp_hydraulic_remark: [''],
      ramp_hydraulic_detail: [''],
      ramp_cleats: [''],
      ramp_cleats_obs: [''],
      ramp_cleats_remark: [''],
      ramp_cleats_detail: [''],
      ramp_limit_obs: [''],
      ramp_limit_remark: [''],
      ramp_limit_detail: [''],
      ramp_lines: [''],
      ramp_lines_obs: [''],
      ramp_lines_remark: [''],
      ramp_lines_detail: [''],
      ramp_hinges: [''],
      ramp_hinges_obs: [''],
      ramp_hinges_remark: [''],
      ramp_hinges_detail: [''],
      ramp_seal: [''],
      ramp_seal_obs: [''],
      ramp_seal_remark: [''],
      ramp_seal_detail: [''],
      ramp_rubber: [''],
      ramp_rubber_obs: [''],
      ramp_rubber_remark: [''],
      ramp_rubber_detail: [''],
      ramp_pumps: [''],
      ramp_pumps_obs: [''],
      ramp_pumps_remark: [''],
      ramp_pumps_detail: [''],
      pump_pressure: [''],
      ramp_pressure_obs: [''],
      ramp_pressure_remark: [''],
      ramp_pressure_detail: [''],
      manual_mode: [''],
      manual_status: [''],
      manual_remark: [''],
      manual_obs: [''],
      extra_status: [''],
      extra_remark: [''],
      extra_obs: [''],
      other_obs_mode: [''],
      overall_mode_remark: [''],
      overall_mode_obs: [''],
      ramp_make_vehicle: [''],
      ramp_make_hatch: [''],
      ramp_make_bow: [''],
      bow_door_status: [''],
      bow_door_remark: [''],
      bow_door_obs: [''],
      ramp_make_aft: [''],
      ramp_make_cbpm: [''],
      ramp_make_winch: [''],
      operational_obs: [''],
      ramp_year_hatch: [''],
      ramp_status_hatch: [''],
      ramp_obs_hatch: [''],
      ramp_remark_hatch: [''],
      cargo_hatch_locking_pin: [''],
      ramp_remark_lim: [''],
      ramp_remark_rollers: [''],
      ramp_remark_hinges: [''],
      ramp_remark_piston: [''],
      ramp_remark_coaming: [''],
      ramp_remark_pum: [''],
      pump_pressure1: [''],
      pump_pressure11: [''],
      manual_mode1: [''],
      manual_status1: [''],
      manual_remark1: [''],

      extra_status1: [''],
      extra_remark1: [''],
      extra_obs1: [''],
      other_obs_mode1: [''],
      overall_mode_remark1: [''],
      overall_mode_obs1: [''],
      pump_pressure2: [''],
      manual_mode2: [''],
      manual_status2: [''],
      manual_remark2: [''],
      manual_obs2: [''],
      extra_status2: [''],
      extra_remark2: [''],
      extra_obs2: [''],
      other_obs_mode2: [''],
      overall_mode_remark2: [''],
      overall_mode_obs2: [''],
      type_AFT: [''],
      ramp_year_bow: [''],
      derrick_date: [''],
      derrick_na: [''],
      derrick_remark: [''],
      rope_test_date: [''],
      rope_test_na: [''],
      rope_test_remark: [''],
      rope_visual_date: [''],
      rope_visual_na: [''],
      rope_visual_status: [''],
      rope_visual_obs: [''],
      rope_visual_remark: [''],
      rope_fitment_date: [''],
      rope_fitment_na: [''],
      rope_fitment_remark: [''],
      jb_status: [''],
      jb_remark: [''],
      jb_obs: [''],
      switches_status: [''],
      switches_text: [''],
      switches_remark: [''],
      switches_obs: [''],
      indicators_text: [''],
      indicators_remark: [''],
      indicators_obs: [''],
      foundation_status: [''],
      foundation_remark: [''],
      foundation_obs: [''],
      mech_grease_status: [''],
      mech_grease_remark: [''],
      mech_grease_obs: [''],
      grease_points_status: [''],
      grease_points_other: [''],
      grease_points_remark: [''],
      drive_status: [''],
      drive_remark: [''],
      drive_obs: [''],
      limit_switch_remark: [''],
      limit_switch_obs: [''],
      motor_ir_value1: [''],
      motor_ir_remark1: [''],
      oil_level_status: [''],
      ramp_make1: [''],
      oil_level_obs_cbpm: [''],
      oil_level_remark_cbpm: [''],
      start_current_design: [''],
      start_current_measured: [''],
      start_current_remark2: [''],
      run_current_design: [''],
      run_current_measured: [''],
      run_current_remark: [''],
      log_design: [''],
      log_measured: [''],
      log_book_remark2: [''],
      periodicity_design: [''],
      periodicity_measured: [''],
      periodicity_remark: [''],
      spm_status1: [''],
      spm_obs1: [''],
      spm_remark1: [{ value: '', disabled: true }],
      other_obs_current: [''],
      overall_current_remark: [''],
      overall_current_obs: [''],
      ramp_year_winch: [''],
      ramp_year_aft: [''],
      derrick_winch_position: [''],
      derrick_winch_position_other: [''],
      ferrodo_status1: [''],
      ferrodo_remark1: [''],
      ferrodo_obs1: [''],
      gearbox_status1: [''],
      gearbox_remark1: [''],
      gearbox_obs1: [''],
      motor_ir_value2: [''],
      motor_ir_remark2: [''],
      deck_status1: [''],
      deck_obs_corrosion1: [''],
      deck_remark1: [''],
      deck_detail1: [''],
      speed1_obs: [''],

      speed2_obs: [''],
      speed3_obs: [''],

      speed_remark: [''],
      speed_remark_obs: [''],

      grease_status1: [''],
      grease_other1: [''],
      grease_remark1: [''],
      oil_level_status1: [''],
      oil_level_obs1: [''],
      oil_level_remark1: [''],
      kitti_water1: [''],
      kitti_file1: [''],
      start_current_design1: [''],
      start_current_measured1: [''],
      start_current_remark1: [''],
      run_current_design1: [''],
      run_current_measured1: [''],
      run_current_remark1: [''],
      log_design1: [''],
      log_measured1: [''],
      log_book_remark1: [''],
      periodicity_design1: [''],
      periodicity_measured1: [''],
      periodicity_remark1: [''],
      other_obs_current1: [''],
      overall_current_remark1: [''],
      overall_current_obs1: [''],
      ramp_remark_lock: [''],
      ramp_remark_line: [''],
      ramp_remark_mech: [''],
      ramp_remark_hin: [''],
      ramp_remark_coam: [''],
      ramp_remark_oil: [''],
      ramp_remark_pump1: [''],
      indicator_status: [''],
      indicator_remark: [''],
      indicate_obs: [''],
      switches_remark1: [''],
      switches_obs1: [''],
      hoisting: [''],
      lowering: [''],
      extra_modes1: this.fb.array([this.fb.control('')]),
      extra_modes2: this.fb.array([this.fb.control('')]),
      extra_modes: this.fb.array([this.fb.control('')]),
    });
  }

  isTableSectionVisible(sectionId: string): boolean {
    return this.selectedTableSections.has(sectionId);
  }

  toggleTableSection(sectionId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.selectedTableSections.add(sectionId);
    } else {
      this.selectedTableSections.delete(sectionId);
    }
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }

  handleLubOilDate() {
    const date = this.form.get('oil_level_obs_cbpm')?.value;

    if (!date) {
      this.form.patchValue({
        oil_change_remark_cbpm: '',
      });
      return;
    }

    const months = this.calculateMonths(date);

    this.form.patchValue({
      oil_change_remark_cbpm: months <= 12 ? 'SAT' : 'UNSAT',
    });
  }

  handleOperationalTrials() {
    const status = this.form.get('grease_points_status')?.value;

    if (status === 'nil') {
      this.form.patchValue({
        grease_points_remark: 'SAT',
        grease_points_other: '',
      });

      this.form.get('grease_points_remark')?.disable();
      this.form.get('grease_points_other')?.disable();
    } else if (status === 'observation') {
      this.form.patchValue({
        grease_points_remark: '',
        grease_points_other: '',
      });

      this.form.get('grease_points_remark')?.enable();
      this.form.get('grease_points_other')?.enable();
    }
  }

  handleFile(file: File | Event | null) {
    console.log('Selected file:', file);
  }

  handleFoundationStatus() {
    const status = this.form.get('foundation_status')?.value;

    if (status === 'nil') {
      this.form.patchValue({
        foundation_remark: 'SAT',
        foundation_obs: '',
      });

      this.form.get('foundation_remark')?.disable();
      this.form.get('foundation_obs')?.disable();
    } else if (status === 'observation') {
      this.form.patchValue({
        foundation_remark: '',
        foundation_obs: '',
      });

      this.form.get('foundation_remark')?.enable();
      this.form.get('foundation_obs')?.enable();
    }
  }

  handleFoundationObservation() {
    const status = this.form.get('indicators_remark')?.value;

    if (status === 'nil') {
      this.form.patchValue({
        foundation_remark: 'SAT',
        foundation_obs: '',
      });
    } else if (status === 'observation') {
      this.form.patchValue({
        foundation_remark: '',
        foundation_obs: '',
      });
    }
  }

  getFoundationRemarkOptions() {
    const status = this.form.get('indicators_remark')?.value;

    if (status === 'observation') {
      return this.remarkOptions.filter((opt) => opt.value !== 'SAT');
    }

    return this.remarkOptions;
  }

  handleSwitchesRemark() {
    const remark = this.form.get('switches_remark')?.value;

    if (remark === 'SAT') {
      this.form.patchValue({
        switches_obs: '',
      });
    }
  }

  handleModesOfOperation(
    modeKey: string,
    statusKey: string,
    remarkKey: string,
    obsKey: string,
  ) {
    const mode = this.form.get(modeKey)?.value;
    const status = this.form.get(statusKey)?.value;

    const remarkControl = this.form.get(remarkKey);

    // OPS or NA => Nil + SAT
    if (mode === 'ops' || mode === 'na') {
      this.form.patchValue({
        [statusKey]: 'nil',
        [remarkKey]: 'SAT',
        [obsKey]: '',
      });

      remarkControl?.disable();
    }

    // NON OPS => Observation
    else if (mode === 'non_ops') {
      this.form.patchValue({
        [statusKey]: 'observation',
      });

      remarkControl?.enable();

      if (this.form.get(remarkKey)?.value === 'SAT') {
        this.form.patchValue({
          [remarkKey]: '',
        });
      }
    }
  }

  handleManualStatus1() {
    const status = this.form.get('manual_status1')?.value;
    const remarkControl = this.form.get('manual_remark1');

    if (status === 'nil') {
      this.form.patchValue({
        manual_remark1: 'SAT',
        manual_obs1: '',
      });

      // Lock SAT
      remarkControl?.disable();
    } else if (status === 'observation') {
      remarkControl?.enable();

      this.form.patchValue({
        manual_remark1: '',
      });
    } else {
      remarkControl?.enable();

      this.form.patchValue({
        manual_remark1: '',
        manual_obs1: '',
      });
    }
  }

  getExtraModesRemarkOptions() {
    const status = this.form.get('extra_status2')?.value;

    if (status === 'observation') {
      return this.remarkOptions.filter((option) => option.value !== 'SAT');
    }

    return this.remarkOptions;
  }

  getModesRemarkOptions() {
    const status = this.form.get('manual_status')?.value;

    if (status === 'observation') {
      return this.remarkOptions.filter((option) => option.value !== 'SAT');
    }

    return this.remarkOptions;
  }

  handleObservation(selectKey: string, remarkKey: string, detailKey: string) {
    const value = this.form.get(selectKey)?.value;
    const detailControl = this.form.get(detailKey);

    if (value === 'nil') {
      this.form.patchValue({
        [remarkKey]: 'SAT',
        [detailKey]: '',
      });

      // Disable the Checks dropdown
      detailControl?.disable();
    } else if (value === 'observation') {
      this.form.patchValue({
        [remarkKey]: 'UNSAT',
      });

      // Enable the Checks dropdown
      detailControl?.enable();
    } else {
      this.form.patchValue({
        [remarkKey]: '',
        [detailKey]: '',
      });

      // Enable when nothing is selected
      detailControl?.enable();
    }
  }
  handleGreasingPoint(value: string) {
    if (value === 'charged') {
      this.form.patchValue({ grease_remark: 'SAT', grease_remark_obs: '' });
    } else if (['painted', 'choked', 'missing', 'others'].includes(value)) {
      this.form.patchValue({ grease_remark: 'UNSAT' });
    } else {
      this.form.patchValue({ grease_remark: '', grease_remark_obs: '' });
    }

    if (value !== 'others') {
      this.form.get('grease_other')?.reset();
    }
  }
  calculateMonths(date: string): number {
    const selected = new Date(date);
    const today = new Date();

    let months =
      (today.getFullYear() - selected.getFullYear()) * 12 +
      (today.getMonth() - selected.getMonth());

    if (today.getDate() < selected.getDate()) {
      months--;
    }

    return months;
  }

  // handle27Month(controlDate: string, controlNa: string, controlRemark: string) {
  //   console.log("here in method")
  //   const selection = this.form.get(controlNa)?.value;
  //   const date = this.form.get(controlDate)?.value;

  //   if (selection === 'nil') {
  //     this.form.patchValue({
  //       [controlRemark]: 'NA'
  //     });
  //     return;
  //   }

  //   if (selection === 'observation' && date) {
  //     const months = this.calculateMonths(date);

  //     this.form.patchValue({
  //       [controlRemark]: months <= 27 ? 'SAT' : 'UNSAT'
  //     });
  //     return;
  //   }

  //   this.form.patchValue({
  //     [controlRemark]: ''
  //   });
  // }

  handle27Month(controlDate: string, controlRemark: string) {
    console.log('controlRemark', controlRemark);
    const date = this.form.get(controlDate)?.value;

    if (!date) {
      this.form.patchValue({
        [controlRemark]: '',
      });
      return;
    }

    const months = this.calculateMonths(date);

    console.log('months', months);

    // Future date
    if (months < 0) {
      this.form.patchValue({
        [controlRemark]: 'INVALID DATE',
      });
      return;
    }

    this.form.patchValue({
      [controlRemark]: months <= 27 ? 'SAT' : 'UNSAT',
    });
  }

  handleSwitchesStatus() {
    const status = this.form.get('switches_status')?.value;
    const remarkControl = this.form.get('switches_remark');

    if (status === 'nil') {
      this.form.patchValue({
        switches_remark: 'SAT',
        switches_obs: '',
      });

      remarkControl?.disable();
    } else if (status === 'observation') {
      remarkControl?.enable();

      this.form.patchValue({
        switches_remark: '',
        switches_obs: '',
      });
    } else {
      remarkControl?.enable();

      this.form.patchValue({
        switches_remark: '',
        switches_obs: '',
      });
    }
  }

  getSwitchesRemarkOptions() {
    const status = this.form.get('switches_status')?.value;

    if (status === 'observation') {
      return this.remarkOptions.filter((option) => option.value !== 'SAT');
    }

    return this.remarkOptions;
  }

  handle24Month(controlDate: string, controlNa: string, controlRemark: string) {
    const isNA = this.form.get(controlNa)?.value;
    const date = this.form.get(controlDate)?.value;

    if (isNA) {
      this.form.patchValue({ [controlRemark]: 'NA' });
      return;
    }

    const months = this.calculateMonths(date);

    this.form.patchValue({
      [controlRemark]: months <= 24 ? 'SAT' : 'UNSAT',
    });
  }

  handleLimitSwitch() {
    const val = this.form.get('limit_switch_remark')?.value;

    if (val === 'SAT' || val === 'NA') {
      this.form.patchValue({ limit_switch_obs: '' });
    }
  }
  handle60Month(controlDate: string, controlNa: string, controlRemark: string) {
    const isNA = this.form.get(controlNa)?.value;
    const date = this.form.get(controlDate)?.value;

    if (isNA) {
      this.form.patchValue({ [controlRemark]: 'NA' });
      return;
    }

    const months = this.calculateMonths(date);

    this.form.patchValue({
      [controlRemark]: months <= 60 ? 'SAT' : 'UNSAT',
    });
  }

  handleMotorIR() {
    const value = this.form.get('motor_ir_value')?.value;

    if (!value) {
      this.form.patchValue({ motor_ir_remark: '' });
      return;
    }

    // simple rule: if contains ">" or >=10 → SAT
    if (value.includes('>') || Number(value) >= 10) {
      this.form.patchValue({ motor_ir_remark: 'SAT' });
    } else {
      this.form.patchValue({ motor_ir_remark: 'UNSAT' });
    }
  }

  handleOilChange(monthLimit: number = 12) {
    const date = this.form.get('oil_change_date')?.value;

    if (!date) return;

    const selected = new Date(date);
    const today = new Date();

    const months =
      (today.getFullYear() - selected.getFullYear()) * 12 +
      (today.getMonth() - selected.getMonth());

    this.form.patchValue({
      oil_change_remark: months <= monthLimit ? 'SAT' : 'UNSAT',
    });
  }
  handleOilLevel() {
    const value = this.form.get('oil_level_status')?.value;

    if (value === 'full') {
      this.form.patchValue({
        oil_level_remark_cbpm: 'SAT',
      });
    } else if (value === 'low') {
      this.form.patchValue({
        oil_level_remark_cbpm: 'SAT_OBS',
      });
    } else if (value === 'empty') {
      this.form.patchValue({
        oil_level_remark_cbpm: 'UNSAT',
      });
    } else {
      this.form.patchValue({
        oil_level_remark_cbpm: '',
      });
    }
  }
  handleSPM(statusControl: string, remarkControl: string, obsControl?: string) {
    const value = this.form.get(statusControl)?.value;

    const statusMap: any = {
      na: 'NA',
      green: 'SAT',
      yellow: 'SAT_OBS',
      red: 'UNSAT',
    };

    this.form.patchValue({
      [remarkControl]: statusMap[value] || '',
    });

    // Clear observation except SAT_OBS
    if (obsControl && value !== 'yellow') {
      this.form.patchValue({
        [obsControl]: '',
      });
    }
  }

  handleObsWithChoice(statusKey: string, remarkKey: string, _obsKey?: string) {
    this.handleVehicleRampObservation(statusKey, remarkKey);
  }

  handleVehicleRampObservation(
    statusKey: string,
    remarkKey: string,
    detailKey = 'ramp_obs',
  ) {
    const value = this.form.get(statusKey)?.value;
    const remarkControl = this.form.get(remarkKey);

    if (value === 'nil') {
      remarkControl?.enable();

      this.form.patchValue({
        [remarkKey]: 'SAT',
        [detailKey]: '',
      });

      remarkControl?.disable();
    } else if (value === 'observation') {
      remarkControl?.enable();
      remarkControl?.reset(); // clears SAT
    } else {
      remarkControl?.enable();

      this.form.patchValue({
        [remarkKey]: '',
        [detailKey]: '',
      });
    }
  }

  onVehicleRampSharedRemarkChange() {
    const value = this.form.get('ramp_status')?.value;
    console.log('showCargoToOperationalRemarks', value);
    if (value === 'nil') {
      this.showCargoToOperationalRemarks = true;
    } else {
      this.showCargoToOperationalRemarks = false;
    }
  }

  getVehicleRampRemarkOptions() {
    const status = this.form.get('ramp_status')?.value;
    if (status === 'observation') {
      // Remove SAT when observation is selected
      return this.remarkOptions.filter((opt) => opt.value !== 'SAT');
    }
    return this.remarkOptions;
  }

  getCargoHatchRemarkOptions() {
    const status = this.form.get('ramp_status_hatch')?.value;
    if (status === 'observation') {
      // Remove SAT when observation is selected
      return this.remarkOptions.filter((opt) => opt.value !== 'SAT');
    }
    return this.remarkOptions;
  }

  getBowDoorRemarkOptions() {
    const status = this.form.get('bow_door_status')?.value;
    if (status === 'observation') {
      // Remove SAT when observation is selected
      return this.remarkOptions.filter((opt) => opt.value !== 'SAT');
    }
    return this.remarkOptions;
  }

  onCargoHatchSharedRemarkChange() {
    this.onSharedRemarkChange('ramp_remark_hatch', 'ramp_obs_hatch');
  }

  onCargoHatchModesRemarkChange() {
    this.onSharedRemarkChange('manual_remark2', 'manual_obs2');
  }

  onCargoHatchExtraModesRemarkChange() {
    this.onSharedRemarkChange('extra_remark2', 'extra_obs2');
  }

  onBowDoorSharedRemarkChange() {
    this.onSharedRemarkChange('bow_door_remark', 'bow_door_obs');
  }

  onBowDoorModesRemarkChange() {
    this.onSharedRemarkChange('manual_remark', 'manual_obs');
  }

  onBowDoorExtraModesRemarkChange() {
    this.onSharedRemarkChange('extra_remark', 'extra_obs');
  }

  handleDerrickNilUnsat(
    statusKey: string,
    remarkKey: string,
    detailKey: string,
  ) {
    const value = this.form.get(statusKey)?.value;
    const isNil = value === 'nil' || value === 'Nil';
    const isObs = value === 'observation';

    if (isNil) {
      this.form.patchValue({ [remarkKey]: 'SAT', [detailKey]: '' });
    } else if (isObs) {
      this.form.patchValue({ [remarkKey]: 'UNSAT' });
    } else if (!value) {
      this.form.patchValue({ [remarkKey]: '', [detailKey]: '' });
    }
  }

  handleDerrickDeckFoundation() {
    const status = this.form.get('deck_status1')?.value;

    if (status === 'nil') {
      this.form.patchValue({
        deck_remark1: 'SAT',
        deck_obs_corrosion1: '',
        deck_detail1: '',
      });

      this.form.get('deck_obs_corrosion1')?.disable();
      this.form.get('deck_detail1')?.disable();
    } else if (status === 'obs') {
      this.form.patchValue({
        deck_remark1: 'UNSAT',
      });

      this.form.get('deck_obs_corrosion1')?.enable();
      this.form.get('deck_detail1')?.enable();
    } else {
      this.form.patchValue({
        deck_remark1: '',
        deck_obs_corrosion1: '',
        deck_detail1: '',
      });

      this.form.get('deck_obs_corrosion1')?.disable();
      this.form.get('deck_detail1')?.disable();
    }
  }

  handleDerrickGreasePoint(value: string) {
    if (value === 'charged') {
      this.form.patchValue({ grease_remark1: 'SAT', grease_other1: '' });
    } else if (['painted', 'choked', 'missing', 'others'].includes(value)) {
      this.form.patchValue({ grease_remark1: 'UNSAT' });
    } else {
      this.form.patchValue({ grease_remark1: '' });
    }
    if (value !== 'others') {
      this.form.get('grease_other1')?.reset();
    }
  }

  handleDerrickOilLevel() {
    const value = this.form.get('oil_level_status1')?.value;

    if (value === 'full') {
      this.form.patchValue({
        oil_level_remark1: 'SAT',
        oil_level_obs1: '',
      });
    } else if (value === 'low') {
      this.form.patchValue({ oil_level_remark1: 'SAT_OBS' });
    } else if (value === 'empty') {
      this.form.patchValue({
        oil_level_remark1: 'UNSAT',
        oil_level_obs1: '',
      });
    } else {
      this.form.patchValue({
        oil_level_remark1: '',
        oil_level_obs1: '',
      });
    }
  }

  onSharedRemarkChange(remarkKey: string, detailKey: string) {
    const remark = this.form.get(remarkKey)?.value;
    if (remark === 'SAT' || !remark) {
      this.form.get(detailKey)?.patchValue('');
    }
  }

  loadClasses() {
    this.api
      .getDropdownData('master/ship-classes/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((res: any) => {
        this.classOfShipOptions = res || [];
        this.cdr.detectChanges();
      });
  }
  listenToClassChanges() {
    this.form.get('classOfShip')?.valueChanges.subscribe((classId) => {
      if (classId) {
        this.loadShips(classId);
        this.form.get('ship')?.reset();
      } else {
        this.shipOptions = [];
        this.form.get('ship')?.reset();
      }
    });
  }

  loadShips(id: number) {
    this.api
      .getDropdownData('master/ships/', { labelKey: 'name', valueKey: 'id' })
      .subscribe((res) => {
        this.shipOptions = res || [];
      });
  }
  loadLocation() {
    this.api
      .getDropdownData('master/locations/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((res) => {
        this.locationOptions = res || [];
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

  buildPayload() {
    const formDataValues = this.form.getRawValue();

    const payload: any = {
      ...formDataValues,
      authority_doc: FileUrlUtil.getFileUrl(formDataValues.authority_doc?.id),
      selected_table_sections: Array.from(this.selectedTableSections),
    };

    return payload;
  }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      this.form.reset();
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
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Trial prefill failed (LST-LPD)', e);
    }
  }

  /** Tab switch hone par call hota hai */
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

      const jsonData =
        response?.json_data ?? response?.data?.json_data ?? response;
      const finalJsonData =
        typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      const equipmentPayload = this.extractEquipmentPayload(
        finalJsonData,
        nomenclature,
      );

      this.fillData(equipmentPayload);
      this.cdr.detectChanges();
    } catch (error) {
      console.error(
        'Failed to load LST-LPD data for selected equipment',
        error,
      );
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'ship' in jsonData ||
      'tank_capstan_position' in jsonData ||
      'document_no' in jsonData;
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

  /** Tab switch pe form + saare FormArrays + selectedTableSections reset —
   *  ship field preserve karke */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;
      if (control instanceof FormArray) return;
      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    this.stringArrayFields.forEach((field) => {
      const arr = this.form.get(field) as FormArray;
      arr.clear();
      arr.push(this.fb.control(''));
    });

    this.selectedTableSections = new Set<string>();

    this.form.patchValue({ ship }, { emitEvent: false });
  }

  /** Poore form ko equipment-specific payload se hydrate karta hai — phased order:
   *  PHASE 1: driver fields (status/select/date) — inke handlers khud remark/obs derive karte hain
   *  PHASE 2: remark fields — driver ke baad, actual saved value force karo (kai jagah driver
   *           "observation" case mein remark ko blank/reset kar deta hai user-choice ke liye)
   *  PHASE 3: free-text obs/detail fields — sabse last
   *  PHASE 4: baaki plain fields — generic loop
   *  Plus: teen FormArrays aur selectedTableSections (jo form ka hissa nahi hai) */
  fillData(payload: any): void {
    if (!payload) return;

    const specialKeys = [
      'authority_doc',
      'ship',
      ...this.stringArrayFields,
      ...this.driverFields,
      ...this.overrideRemarkFields,
      ...this.dependentFreeTextFields,
    ];

    // PHASE 1
    this.driverFields.forEach((key) => {
      if (key in payload) {
        this.form.get(key)?.setValue(payload[key] ?? '');
      }
    });

    // PHASE 2
    this.overrideRemarkFields.forEach((key) => {
      if (key in payload) {
        this.form.get(key)?.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });

    // PHASE 3
    this.dependentFreeTextFields.forEach((key) => {
      if (key in payload) {
        this.form.get(key)?.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });

    // PHASE 4 — baaki plain fields
    Object.keys(payload).forEach((key) => {
      if (specialKeys.includes(key)) return;
      const control = this.form.get(key);
      if (control) {
        control.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });

    // ship — fallback trialRow.ship_name se agar equipment payload mein khaali ho
    this.form
      .get('ship')
      ?.setValue(payload.ship || this.form.get('ship')?.value || '', {
        emitEvent: false,
      });

    // authority_doc — URL string ko file-upload component ke required shape mein convert karo
    this.form
      .get('authority_doc')
      ?.setValue(this.buildFileUploadValue(payload.authority_doc), {
        emitEvent: false,
      });

    // teen dynamic-textarea FormArrays hydrate karo
    this.stringArrayFields.forEach((field) => {
      this.patchStringArray(field, payload[field]);
    });

    // selectedTableSections — form ka hissa nahi, isliye alag se restore karo
    const savedSections = Array.isArray(payload.selected_table_sections)
      ? payload.selected_table_sections
      : [];
    this.selectedTableSections = new Set<string>(savedSections);
  }

  /** Ek simple string-array FormArray ko saved values ke hisaab se hydrate karta hai */
  private patchStringArray(field: string, values: any): void {
    const arr = this.form.get(field) as FormArray;
    if (!arr) return;

    const list = Array.isArray(values) && values.length ? values : [''];

    arr.clear();
    list.forEach((val: any) => {
      arr.push(this.fb.control(val ?? ''));
    });
  }

  /** Backend se aayi authority_doc (plain URL string ya already-object) ko
   *  FileUploadComponent ke required { id, name, file_path } shape mein convert karta hai */
  private buildFileUploadValue(value: any): UploadedFileItem | null {
    if (!value) return null;

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
