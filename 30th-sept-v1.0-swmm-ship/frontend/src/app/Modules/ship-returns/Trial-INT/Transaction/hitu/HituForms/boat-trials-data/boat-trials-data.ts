import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import {
  ReactiveFormsModule,
  FormGroup,
  FormBuilder,
  FormsModule,
} from '@angular/forms';
import { Router } from '@angular/router';
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
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { ActivatedRoute } from '@angular/router';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-boat-trials-data',
  standalone: true,
  templateUrl: './boat-trials-data.html',
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
    ApprovalWorkFlow,
    FormsModule,
  ],
})
export class BoatTrialsData {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
  loading = false;
  uploadedAuthorityFiles: UploadedFileItem[] = [];

  readonly restartIcon = 'rotate-ccw';
  draftLoading = false;
  saveLoading = false;
  submitLoading = false;
  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';
  form!: FormGroup;

  readonly SatUnsatOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];
  showHarbourHullRemark = false;
  occasionOptions = [
    { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
    { label: 'End of Refit Trials', value: 'End of Refit Trials' },
    { label: 'Surprise Checks', value: 'Surprise Checks' },
    { label: 'HVAC Audit', value: 'HVAC Audit' },
  ];

  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  locationOptions: any[] = [];

  SatObsUnsatOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'SAT with observation', value: 'SAT_OBS' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  SatUnsatNaOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
    { label: 'SAT with observation', value: 'SAT_OBS' },
    { label: 'Not applicable', value: 'NA' },
  ];
  boatTypeOptions = [
    { label: 'RIB', value: 'RIB' },
    { label: 'FRP Boat', value: 'FRP' },
    { label: 'Gemini Boat', value: 'GEMINI' },
    { label: 'LCVP', value: 'LCVP' },
    { label: 'Whaler', value: 'WHALER' },
    { label: 'Rescue Boat', value: 'RESCUE' },
  ];

  heldOptions = [
    { label: 'Held & Updated', value: 'HELD_UPDATED' },
    { label: 'Held & Not Updated', value: 'HELD_NOT_UPDATED' },
    { label: 'Not Held', value: 'NOT_HELD' },
  ];
  shipOfficerOptions = [
    { label: 'Boat Officer', value: 'BOAT_OFFICER' },
    { label: 'HMO', value: 'HMO' },
  ];

  trialTeamOptions = [
    { label: 'HITU(V)', value: 'HITU(V)' },
    { label: 'MTU(V)', value: 'MTU(V)' },
    { label: 'ETMU(V)', value: 'ETMU(V)' },
  ];

  seaStateOptions = [
    { label: 'Calm Sea', value: 'CALM_SEA' },
    { label: 'SS 1', value: 'SS_1' },
    { label: 'SS 2', value: 'SS_2' },
    { label: 'SS 3', value: 'SS_3' },
    { label: 'SS 4', value: 'SS_4' },
  ];

  runOptions = ['Up', 'Down'];

  power50Rows = [
    { run: 'Up', engineSpeed: '', coolantTemp: '', loPressure: '', speed: '' },
    {
      run: 'Down',
      engineSpeed: '',
      coolantTemp: '',
      loPressure: '',
      speed: '',
    },
    { run: 'Up', engineSpeed: '', coolantTemp: '', loPressure: '', speed: '' },
    {
      run: 'Down',
      engineSpeed: '',
      coolantTemp: '',
      loPressure: '',
      speed: '',
    },
  ];

  power85Rows = [
    { run: 'Up', engineSpeed: '', coolantTemp: '', loPressure: '', speed: '' },
    {
      run: 'Down',
      engineSpeed: '',
      coolantTemp: '',
      loPressure: '',
      speed: '',
    },
    { run: 'Up', engineSpeed: '', coolantTemp: '', loPressure: '', speed: '' },
    {
      run: 'Down',
      engineSpeed: '',
      coolantTemp: '',
      loPressure: '',
      speed: '',
    },
  ];

  power100Rows = [
    { run: 'Up', engineSpeed: '', coolantTemp: '', loPressure: '', speed: '' },
    {
      run: 'Down',
      engineSpeed: '',
      coolantTemp: '',
      loPressure: '',
      speed: '',
    },
    { run: 'Up', engineSpeed: '', coolantTemp: '', loPressure: '', speed: '' },
    {
      run: 'Down',
      engineSpeed: '',
      coolantTemp: '',
      loPressure: '',
      speed: '',
    },
  ];

  fullLoad50Rows = [
    { run: 'Up', engineSpeed: '', coolantTemp: '', loPressure: '', speed: '' },
    {
      run: 'Down',
      engineSpeed: '',
      coolantTemp: '',
      loPressure: '',
      speed: '',
    },
    { run: 'Up', engineSpeed: '', coolantTemp: '', loPressure: '', speed: '' },
    {
      run: 'Down',
      engineSpeed: '',
      coolantTemp: '',
      loPressure: '',
      speed: '',
    },
  ];

  fullLoad85Rows = [
    { run: 'Up', engineSpeed: '', coolantTemp: '', loPressure: '', speed: '' },
    {
      run: 'Down',
      engineSpeed: '',
      coolantTemp: '',
      loPressure: '',
      speed: '',
    },
    { run: 'Up', engineSpeed: '', coolantTemp: '', loPressure: '', speed: '' },
    {
      run: 'Down',
      engineSpeed: '',
      coolantTemp: '',
      loPressure: '',
      speed: '',
    },
  ];

  fullLoad100Rows = [
    { run: 'Up', engineSpeed: '', coolantTemp: '', loPressure: '', speed: '' },
    {
      run: 'Down',
      engineSpeed: '',
      coolantTemp: '',
      loPressure: '',
      speed: '',
    },
    { run: 'Up', engineSpeed: '', coolantTemp: '', loPressure: '', speed: '' },
    {
      run: 'Down',
      engineSpeed: '',
      coolantTemp: '',
      loPressure: '',
      speed: '',
    },
  ];

  subComponentChecks = [
    {
      label: 'Main Engine functional trials',
      status: 'sub_main_engine_status',
      remark: 'sub_main_engine_remark',
    },
    {
      label: 'Steering system including propeller and rudder functional checks',
      status: 'sub_steering_status',
      remark: 'sub_steering_remark',
    },
    {
      label: 'Main Engine gauges and alarms',
      status: 'sub_engine_gauges_status',
      remark: 'sub_engine_gauges_remark',
    },
    {
      label:
        'Battery: Terminal voltage (pre and post starting operation), Specific Gravity, Electrolyte levels',
      status: 'sub_battery_status',
      remark: 'sub_battery_remark',
    },
    {
      label:
        'Battery charging mechanism including integrity of connectors, battery charging sockets and associated switches',
      status: 'sub_battery_charging_status',
      remark: 'sub_battery_charging_remark',
    },
    {
      label: 'Fuel system including tanks and associated piping',
      status: 'sub_fuel_system_status',
      remark: 'sub_fuel_system_remark',
    },
    {
      label: 'Bilge Pump (Motor driven)',
      status: 'sub_bilge_motor_status',
      remark: 'sub_bilge_motor_remark',
    },
    {
      label: 'Engine Cabinet and securing clips',
      status: 'sub_engine_cabinet_status',
      remark: 'sub_engine_cabinet_remark',
    },
    {
      label: 'Bilge Pump (Hand operated)',
      status: 'sub_bilge_hand_status',
      remark: 'sub_bilge_hand_remark',
    },
    {
      label: 'Status of Bilges',
      status: 'sub_bilges_status',
      remark: 'sub_bilges_remark',
    },
    {
      label: 'Lights',
      status: 'sub_lights_status',
      remark: 'sub_lights_remark',
    },
    { label: 'Horn', status: 'sub_horn_status', remark: 'sub_horn_remark' },
    {
      label: 'Mast Light',
      status: 'sub_mast_light_status',
      remark: 'sub_mast_light_remark',
    },
    {
      label: 'Side Light Port',
      status: 'sub_side_light_port_status',
      remark: 'sub_side_light_port_remark',
    },
    {
      label: 'Side Light Stbd',
      status: 'sub_side_light_stbd_status',
      remark: 'sub_side_light_stbd_remark',
    },
    {
      label: 'NUC Lights',
      status: 'sub_nuc_lights_status',
      remark: 'sub_nuc_lights_remark',
    },
    {
      label: 'Search Light',
      status: 'sub_search_light_status',
      remark: 'sub_search_light_remark',
    },
    {
      label: 'Fire and Smoke Detector',
      status: 'sub_fire_smoke_status',
      remark: 'sub_fire_smoke_remark',
    },
    {
      label: 'Navigation and Communication System',
      status: 'sub_nav_comm_status',
      remark: 'sub_nav_comm_remark',
    },
    {
      label:
        'Control System / Wiring including proper cleaning, sealing, insulation and continuity',
      status: 'sub_control_wiring_status',
      remark: 'sub_control_wiring_remark',
    },
  ];

  showNavCommRemark = false;
  showOverallRemark = false;
  showHarbourCheckRemark = false;
  showSeaCheckRemark = false;
  speedSum = 0;
  averageSpeed: any;

  calculateAverage(rows: any[]) {
    const speeds = rows.map((r) => Number(r.speed) || 0);

    this.speedSum = speeds.reduce((a, b) => a + b, 0);

    this.averageSpeed = speeds.length
      ? (this.speedSum / speeds.length).toFixed(2)
      : 0;
  }
  dropdownOptions = ['Option 1', 'Option 2']; // replace if needed

  // toggles
  showHullRemark = false;
  showPaintRemark = false;
  showHullFitRemark = false;
  showLiftRemark = false;
  showSlingRemark = false;
  showWebbingRemark = false;

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

  /** Saare file-upload controls jo formControlName se bound hain — inko
   *  buildFileUploadValue() se convert karna hai, generic loop se skip karke */
  private readonly documentFields = [
    'davit_cert_upload',
    'arh_cert_upload',
    'lifting_sling_upload',
    'reference_document',
    'pdi_report',
    'weigh_report',
    'load_test_certificate',
    'arh_certificate',
    'bhs_certificate',
    'webbing_slings_certificate',
  ];

  /** Multiple-file-upload fields (template mein [multiple]="true") — inke liye
   *  array-of-UploadedFileItem convert karna hai, single object nahi */
  private readonly multiFileFields = ['reference_document'];

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastService,
    public formApiService: FormApiService,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadClasses();
    this.listenToClassChanges();
    this.loadLocation();

    this.calculateAverage(this.fullLoad100Rows);

    setTimeout(() => {
      this.generateRemarks();
    });
    this.loadTrialPrefillFromQuery();
  }

  isSatObs(field: string): boolean {
    const value = this.form?.get(field)?.value;
    return value === 'SAT_OBS' || value === 'UNSAT';
  }

  needsObservation(field: string): boolean {
    const value = this.form?.get(field)?.value;
    return value === 'SAT_OBS' || value === 'UNSAT';
  }

  needsAnyObservation(fields: string[]): boolean {
    return fields.some((field) => this.needsObservation(field));
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
      boat_log_book_status: [''],
      inspection_records: [''],
      boat_weighing_status: [''],
      boat_weight: [''],
      log_book_folder_check: [''],
      place: [''],
      date: [''],
      boat_type: [''],
      boat_regn_no: [''],
      ship_rep: [''],
      trial_teams: [''],
      davit_cert_status: [''],
      davit_cert_date: [''],
      davit_cert_upload: [''],
      arh_cert_status: [''],
      arh_cert_date: [''],
      arh_cert_upload: [''],
      lifting_sling_status: [''],
      lifting_sling_upload: [''],
      hull_condition: [''],
      hull_remark: [''],
      paint_condition: [''],
      paint_remark: [''],
      hull_fittings: [''],
      hull_fittings_remark: [''],
      lifting_arrangement: [''],
      lifting_arrangement_remark: [''],
      lifting_sling_record: [''],
      lifting_sling_record_remark: [''],
      webbing_visual: [''],
      webbing_visual_remark: [''],
      webbing_year: [''],
      harbour_place: [''],
      harbour_date: [''],
      harbour_boat_type: [''],
      harbour_boat_regn: [''],
      harbour_ship_rep: [''],
      harbour_trial_teams: [''],
      harbour_hull_condition: [''],
      harbour_hull_remark: [''],
      main_engine_make: [''],
      main_engine_power: [''],
      drive_units_make: [''],
      drive_units_serial: [''],
      transom_shield_make: [''],
      transom_shield_serial: [''],
      bilge_pump_make: [''],
      bilge_pump_capacity: [''],
      batteries_make: [''],
      batteries_model: [''],
      dg_set_make: [''],
      dg_set_model: [''],
      harbour_additional_remarks: [''],
      sea_place: [''],
      sea_date: [''],
      sea_wind: [''],
      sea_state: [''],
      sea_boat_type: [''],
      sea_boat_regn: [''],
      sea_distance: [''],
      sea_ship_rep: [''],
      sea_trial_teams: [''],
      full_load_speed: [''],
      nav_comm_status: [''],
      nav_comm_remark: [''],
      overall_status: [''],
      overall_remark: [''],
      achieved_speed: [''],
      reference_speed: [''],
      reference_document: [''],
      harbour_check_status: [''],
      harbour_check_remark: [''],
      sea_check_status: [''],
      sea_check_remark: [''],
      pdi_report: [''],
      weigh_report: [''],
      load_test_certificate: [''],
      arh_certificate: [''],
      bhs_certificate: [''],
      webbing_slings_certificate: [''],
      light_load_result_status: [''],
      full_load_result_status: [''],
      sub_main_engine_status: [''],
      sub_main_engine_remark: [''],
      sub_steering_status: [''],
      sub_steering_remark: [''],
      sub_engine_gauges_status: [''],
      sub_engine_gauges_remark: [''],
      sub_battery_status: [''],
      sub_battery_remark: [''],
      sub_battery_charging_status: [''],
      sub_battery_charging_remark: [''],
      sub_fuel_system_status: [''],
      sub_fuel_system_remark: [''],
      sub_bilge_motor_status: [''],
      sub_bilge_motor_remark: [''],
      sub_engine_cabinet_status: [''],
      sub_engine_cabinet_remark: [''],
      sub_bilge_hand_status: [''],
      sub_bilge_hand_remark: [''],
      sub_bilges_status: [''],
      sub_bilges_remark: [''],
      sub_lights_status: [''],
      sub_lights_remark: [''],
      sub_horn_status: [''],
      sub_horn_remark: [''],
      sub_mast_light_status: [''],
      sub_mast_light_remark: [''],
      sub_side_light_port_status: [''],
      sub_side_light_port_remark: [''],
      sub_side_light_stbd_status: [''],
      sub_side_light_stbd_remark: [''],
      sub_nuc_lights_status: [''],
      sub_nuc_lights_remark: [''],
      sub_search_light_status: [''],
      sub_search_light_remark: [''],
      sub_fire_smoke_status: [''],
      sub_fire_smoke_remark: [''],
      sub_nav_comm_status: [''],
      sub_nav_comm_remark: [''],
      sub_control_wiring_status: [''],
      sub_control_wiring_remark: [''],
    });
  }

  showBoatWeightInputField = false;

  onFieldChange(event: any) {
    const v = event.formValue;
    const value = event?.formValue?.boat_weighing_status;

    this.showBoatWeightInputField = value === 'SAT';
    this.showHullRemark = v.hull_condition !== 'SAT';
    this.showPaintRemark = v.paint_condition !== 'SAT';
    this.showHullFitRemark = v.hull_fittings !== 'SAT';
    this.showLiftRemark = v.lifting_arrangement !== 'SAT';
    this.showSlingRemark = v.lifting_sling_record !== 'SAT';
    this.showWebbingRemark = v.webbing_visual !== 'SAT';
    this.showNavCommRemark = v.nav_comm_status !== 'SAT';
    this.showOverallRemark = v.overall_status !== 'SAT';
    this.showHarbourCheckRemark = v.harbour_check_status !== 'SAT';
    this.showSeaCheckRemark = v.sea_check_status !== 'SAT';

    this.showHarbourHullRemark = v.harbour_hull_condition !== 'SAT';
    this.calculateAverage(this.fullLoad100Rows);
  }

  getMaxSpeed(rows: any[], runType: string) {
    return Math.max(
      ...rows.filter((r) => r.run === runType).map((r) => Number(r.speed) || 0),
    );
  }
  autoRemarks: any;
  generateRemarks() {
    const upMax = this.getMaxSpeed(this.fullLoad100Rows, 'Up');
    const downMax = this.getMaxSpeed(this.fullLoad100Rows, 'Down');

    this.autoRemarks = `
On running the boat at full throttle, it was observed that the engine achieved a maximum
${upMax} knots upstream & ${downMax} knots downstream at sea.

The speed trials were carried out at 50% and 100% power by taking four runs at each speed
(two runs in each direction). The speed during each run was measured by GPS and recorded.

The average speed at each RPM as well as the recorded engine/stern drive parameters are given above.
`;
  }

  buildSeaTrialRemarks(rows: any[]) {
    const upMax = this.getMaxSpeed(rows, 'Up');
    const downMax = this.getMaxSpeed(rows, 'Down');

    return `On running the boat at full throttle, it was observed that the engine achieved a maximum ${upMax} knots up stream and ${downMax} knots downstream at sea. The speed trials were carried out at 50% and 100% power by taking four runs at each speed (two runs in each direction). The speed during each run was measured by GPS and recorded. The average speed at each RPM as well as the recorded engine / stern drive parameters are given above.`;
  }

  onSpeedChange() {
    this.cdr.detectChanges();
  }

  getAverageData(rows: any[]) {
    const speeds = rows.map((r) => Number(r.speed) || 0);

    const sum = speeds.reduce((a, b) => a + b, 0);

    const avg = speeds.length ? +(sum / speeds.length).toFixed(2) : 0;

    return {
      sum,
      avg,
    };
  }
  handleSatUnsat(statusKey: string, remarkKey: string, detailsKey: string) {
    const value = this.form.get(statusKey)?.value;

    if (value === 'SAT') {
      this.form.get(remarkKey)?.patchValue('SAT');
      this.form.get(detailsKey)?.patchValue('NIL');
    }

    if (value === 'UNSAT') {
      this.form.get(remarkKey)?.patchValue('UNSAT');
      this.form.get(detailsKey)?.patchValue('');
    }
  }

  onRadioChange(value: string, remarkKey: string) {
    const mapping: Record<string, string> = {
      yes: 'UNSAT',
      no: 'SAT',
      ops: 'SAT',
      non_ops: 'UNSAT',
    };

    const remark = mapping[value] ?? '';

    this.form.get(remarkKey)?.patchValue(remark);
  }

  handleObservation(selectKey: string, obsKey: string, remarkKey: string) {
    const value = this.form.get(selectKey)?.value;

    if (value === 'observation') {
      this.form.get(remarkKey)?.patchValue('UNSAT');
    } else if (value === 'nil') {
      this.form.get(remarkKey)?.patchValue('SAT');
      this.form.get(obsKey)?.patchValue(''); // clear textarea
    }
  }

  onSelectMappingChange(
    value: string,
    remarkKey: string,
    mapping: Record<string, string>,
  ) {
    const remark = mapping[value] ?? '';
    this.form.get(remarkKey)?.patchValue(remark);
  }

  onTimeCheck(fieldKey: string, remarkKey: string, threshold: number) {
    const value = Number(this.form.get(fieldKey)?.value);

    if (!value && value !== 0) {
      this.form.get(remarkKey)?.patchValue('');
      return;
    }

    const remark = value <= threshold ? 'SAT' : 'UNSAT';
    this.form.get(remarkKey)?.patchValue(remark);
  }

  handleFile(file: any) {
    if (!file) return;
    const files: UploadedFileItem[] = Array.isArray(file) ? file : [file];
    this.uploadedAuthorityFiles = files;
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
      this.toast.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  buildPayload() {
    const formValues = this.form.getRawValue();

    // Extracts the file ID from whatever the file-upload component writes:
    // - plain string/number  → returned as-is
    // - UploadedFileItem     → returns .id or .file_path
    // - Array (multiple)     → maps each element to its ID
    // - null / undefined     → returns null
    const extractId = (value: any): any => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'string' || typeof value === 'number') return value;
      if (Array.isArray(value)) {
        return value.map((v) => v?.id || v?.file_path || v).filter(Boolean);
      }
      return value?.id || value?.file_path || null;
    };

    // All formControlName-bound file-upload fields
    const documentFields = [
      'davit_cert_upload',
      'arh_cert_upload',
      'lifting_sling_upload',
      'reference_document',
      'pdi_report',
      'weigh_report',
      'load_test_certificate',
      'arh_certificate',
      'bhs_certificate',
      'webbing_slings_certificate',
    ];

    const mappedDocs: Record<string, any> = {};
    for (const key of documentFields) {
      mappedDocs[key] = extractId(formValues[key]);
    }

    const payload: any = {
      ...formValues,
      // Overwrite raw file-object values with extracted IDs
      ...mappedDocs,
      // Authority document uploads (tracked separately via handleFile/handleFilesUploaded)
      authority_files: this.uploadedAuthorityFiles.map(
        (f) => f.id || f.file_path,
      ),
      // Power trial row data (stored outside reactive form)
      power_50_rows: this.power50Rows,
      power_85_rows: this.power85Rows,
      power_100_rows: this.power100Rows,
      full_load_50_rows: this.fullLoad50Rows,
      full_load_85_rows: this.fullLoad85Rows,
      full_load_100_rows: this.fullLoad100Rows,
      authority_doc: FileUrlUtil.getFileUrl(formValues.authority_doc?.id),
    };

    return payload;
  }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      this.form.reset();
      this.cdr.detectChanges();
      this.toast.showSuccess('Form cleared successfully');
      return;
    }

    if (type === 'save' && !this.validateForm()) {
      return;
    }

    const payload = this.buildPayload();

    if (type === 'draft') {
      console.log('Saving draft with payload:', payload);
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
      console.error('Trial prefill failed (Ship Borne Boat Trials)', e);
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
        'Failed to load Ship Borne Boat Trials data for selected equipment',
        error,
      );
      this.toast.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'ship' in jsonData ||
      'boat_type' in jsonData ||
      'power_50_rows' in jsonData;
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

  /** Tab switch pe form + power-trial row arrays + uploaded-files reset —
   *  ship field preserve karke. Is form mein koi driver/dependent valueChanges
   *  chain nahi hai (isSatObs/needsObservation sirf template method calls
   *  hain, subscriptions nahi) — isliye reset simple hai */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;
      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    this.form.patchValue({ ship }, { emitEvent: false });

    this.resetPowerRows(this.power50Rows);
    this.resetPowerRows(this.power85Rows);
    this.resetPowerRows(this.power100Rows);
    this.resetPowerRows(this.fullLoad50Rows);
    this.resetPowerRows(this.fullLoad85Rows);
    this.resetPowerRows(this.fullLoad100Rows);

    this.uploadedAuthorityFiles = [];

    this.calculateAverage(this.fullLoad100Rows);
    this.generateRemarks();
  }

  private resetPowerRows(rows: any[]): void {
    rows.forEach((row) => {
      row.engineSpeed = '';
      row.coolantTemp = '';
      row.loPressure = '';
      row.speed = '';
    });
  }

  /** Poore form + chhe power-trial row arrays ko equipment-specific payload
   *  se hydrate karta hai. Koi driver/dependent phasing zaroori nahi — is
   *  form mein koi valueChanges-based reset chain nahi hai */
  fillData(payload: any): void {
    if (!payload) return;

    const specialKeys = [
      'authority_doc',
      'ship',
      ...this.documentFields,
      'power_50_rows',
      'power_85_rows',
      'power_100_rows',
      'full_load_50_rows',
      'full_load_85_rows',
      'full_load_100_rows',
    ];

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

    // saare document-upload fields — single ya multiple, dono handle karo
    this.documentFields.forEach((field) => {
      const value = payload[field];
      if (this.multiFileFields.includes(field)) {
        const list = Array.isArray(value) ? value : value ? [value] : [];
        this.form
          .get(field)
          ?.setValue(
            list.map((v: any) => this.buildFileUploadValue(v)).filter(Boolean),
            { emitEvent: false },
          );
      } else {
        this.form
          .get(field)
          ?.setValue(this.buildFileUploadValue(value), { emitEvent: false });
      }
    });

    // chhe power-trial row arrays hydrate karo (form ka hissa nahi, [(ngModel)] se bound hain)
    this.patchPowerRows(this.power50Rows, payload.power_50_rows);
    this.patchPowerRows(this.power85Rows, payload.power_85_rows);
    this.patchPowerRows(this.power100Rows, payload.power_100_rows);
    this.patchPowerRows(this.fullLoad50Rows, payload.full_load_50_rows);
    this.patchPowerRows(this.fullLoad85Rows, payload.full_load_85_rows);
    this.patchPowerRows(this.fullLoad100Rows, payload.full_load_100_rows);

    // averages aur auto-remarks fullLoad100Rows se derive hote hain — patch ke baad recompute karo
    this.calculateAverage(this.fullLoad100Rows);
    this.generateRemarks();
  }

  /** Ek power-trial row array (fixed 4-row shape: Up/Down/Up/Down) ko saved
   *  values se hydrate karta hai — row count/order preserve karke, sirf
   *  measured values overwrite karta hai */
  private patchPowerRows(targetRows: any[], savedRows: any): void {
    if (!Array.isArray(savedRows) || !savedRows.length) return;

    targetRows.forEach((row, index) => {
      const saved = savedRows[index];
      if (!saved) return;
      row.engineSpeed = saved.engineSpeed ?? '';
      row.coolantTemp = saved.coolantTemp ?? '';
      row.loPressure = saved.loPressure ?? '';
      row.speed = saved.speed ?? '';
    });
  }

  /** Backend se aayi file value (plain URL string ya already-object) ko
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
