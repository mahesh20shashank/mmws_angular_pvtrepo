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
import { MultiSelectDropdownComponent } from '../../../../ui/multiselect';
import { MasterService } from '../../../../services/master.service';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-helo-traversing-sys-port-stbd-add',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    ToastComponent,
    SelectComponent,
    CalenderComponent,
    ParameterCardComponent,
    MonthYearCalendarComponent,
    InputComponent,
    FileUploadComponent,
    MultiSelectDropdownComponent,
    ApprovalWorkFlow,
    InputComponent,
  ],
  templateUrl: './helo-traversing-sys-port-stbd-add.component.html',
})
export class HeloTraversingSysPortStbdAddComponent {
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

  form!: FormGroup;
  loading = false;

  selectedShipId: number = 0;

  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  reps_present_options: any[] = [];
  locationOptions: any[] = [];
  usersList: any[] = [];
  uploadedAuthorityFiles: UploadedFileItem[] = [];
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;

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

  LubricatiedOptions = [
    { label: 'Lubricated', value: 'Lubricated' },
    { label: 'Not Lubricated', value: 'Not Lubricated' },
  ];
  heloTraversingOptions = [
    { label: 'Port', value: 'Port' },
    { label: 'STBD', value: 'STBD' },
    { label: 'Center', value: 'Center' },
  ];
  occasionOptions: any[] = [];
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
      label: 'Less than 40% filled Empty',
      value: 'Less than 40% filled Empty',
    },
    { label: 'Empty', value: 'Empty' },
  ];

  SatUnsatOptions = [
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
    { label: 'No Observation', value: 'NoObservation' },
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

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private toast: ToastService,
    public formApiService: FormApiService,
    private masterService: MasterService,
  ) {}

  showRustObservationFields = false;
  showFillingDrainRemarkInput = false;
  showVisualInspectionInput = false;
  showNoiseRemarkInput = false;

  ngOnInit(): void {
    this.buildForm();
    this.loadRepsPresentOptions();
    this.loadConductofTrialOptions();
    this.setupConditionalLogic();
    this.loadLocation();
    this.loadTrialPrefillFromQuery();

    if (this.rowId) {
      this.editMode = true;
      this.getEditDataByRowId(this.rowId);
    }
    // ------------------------------------- CORRSOSION CHECK ---------------------------
    this.form.get('rust_corrosion_check')?.valueChanges.subscribe((value) => {
      if (value === 'Observation') {
        this.showRustObservationFields = true;

        // Enable controls
        this.enableRustFields();
      } else {
        this.showRustObservationFields = false;

        // Clear + disable controls
        this.resetRustFields();

        // Auto set SAT
        this.form.get('rust_corrosion_value')?.setValue('SAT');
      }
    });
    // When reps_present changes, fetch users of that type
    this.form.get('reps_present')?.valueChanges.subscribe((userType) => {
      if (userType) {
        this.getUsersByType(userType);
      }
    });
  }
  // ------------------------------------------------------
  loadRepsPresentOptions() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=HITUINSP`,
        { labelKey: 'name', valueKey: 'name' },
      )
      .subscribe((res) => {
        Promise.resolve().then(() => {
          this.reps_present_options = res || [];
          this.cdr.markForCheck();
        });
      });
  }
  // ------------------------------------------------------

  loadConductofTrialOptions() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=OCCHITU`,
        { labelKey: 'name', valueKey: 'name' },
      )
      .subscribe((res) => {
        Promise.resolve().then(() => {
          this.occasionOptions = res || [];
          this.cdr.markForCheck();
        });
      });
  }

  loadLocation() {
    this.masterService.getLocations().subscribe((res) => {
      this.locationOptions = res.data.map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
    });
  }
  // ------------------------------------------------------

  getUsersByType(selectedId: number) {
    const selectedOption = this.reps_present_options.find(
      (item) => item.value === selectedId,
    );
    const selectedName = selectedOption?.label?.toLowerCase();

    let apiUrl = '';

    if (selectedName === 'ship staff') {
      if (!this.selectedShipId) {
        this.toastService.showError('Please select a ship first.');
        return;
      }
      apiUrl = `${Apiendpoints.MASTER_USER}?ship_id=${this.selectedShipId}`;
    } else if (selectedName === 'hitu') {
      apiUrl = `${Apiendpoints.MASTER_USER}?user_type=HITU`;
    } else if (selectedName === 'dockyard') {
      apiUrl = `${Apiendpoints.MASTER_USER}?user_type=SHIPYARD`;
    } else {
      return;
    }

    this.apiService.get(apiUrl).subscribe({
      next: (res: any) => {
        this.usersList = (res?.data || []).map((user: any) => ({
          label: `${user.first_name} ${user?.last_name}`,
          value: user.id,
        }));
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(err);
      },
    });
  }

  enableRustFields() {
    ['Corrosion', 'Pitting', 'Preserved', 'Others'].forEach((field) => {
      this.form.get(field)?.enable();
    });
  }

  resetRustFields() {
    ['Corrosion', 'Pitting', 'Preserved', 'Others'].forEach((field) => {
      this.form.get(field)?.reset();
      this.form.get(field)?.disable();
    });
  }

  buildForm() {
    this.form = this.fb.group({
      ship: [{ value: '', disabled: true }],
      helo_traversing: [''],
      reps_present: [''],
      reps_present_user: [''],
      manufacturer_name: [{ value: '', disabled: true }],
      model: [{ value: '', disabled: true }],

      reps_present_other_user: [''],
      ship_staff: [''],
      hitu: [''],
      shipyard_dockyard: [''],
      date_of_conduct_of_trials: [''],
      place_of_conduct_of_trials: [''],
      occasion_of_conduct_of_trials: [''],
      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],
      authority_of_conduct_of_trials: [''],
      trials_table: this.fb.group({
        type_of_capstan: [''],
        make: [''],
        lubrication_check: [''],
        lubrication_check_remark: [{ value: '', disabled: true }],
        excessive_noise: [''],
        excessive_noise_remark: [{ value: '', disabled: true }],
        excessive_noise_value: [{ value: '', disabled: true }],
        filling_drain: [''],
        filling_drain_remark: [{ value: '', disabled: true }],
        filling_drain_value: [{ value: '', disabled: true }],
        rust_corrosion_check: [''],
        rust_corrosion_value: [{ value: '', disabled: true }],
        rust_corrosion_remark: [{ value: '', disabled: true }],
        Corrosion: [{ value: '', disabled: true }],
        Pitting: [{ value: '', disabled: true }],
        Preserved: [{ value: '', disabled: true }],
        Others: [{ value: '', disabled: true }],
        cable_wound_on_capstan: [''],
        cable_wound_remark: [{ value: '', disabled: true }],
        oil_level: [''],
        oil_level_remark: [{ value: '', disabled: true }],
        visual_inspection: [''],
        visual_inspection_remark: [{ value: '', disabled: true }],
        visual_inspection_value: [{ value: '', disabled: true }],
        slow_speed: [''],
        fast_speed: [''],
        speed_remark: [{ value: '', disabled: true }],
        greasing_check: [''],
        greasing_remark: [{ value: '', disabled: true }],
        last_replacement_date: [''],
        next_due_date: [{ value: '', disabled: true }],
        replacement_remark: [{ value: '', disabled: true }],
        load_test_date: [''],
        load_test_next_due: [{ value: '', disabled: true }],
        load_test_remark: [{ value: '', disabled: true }],
        other_observation: [''],
        overall_remark: [''],
        model: [''],
      }),

      // 1 & 2
      type: [''],
      make: [''],

      // 3a Lubrication
      lubrication_check: [''],
      lubrication_check_remark: [''],

      excessive_noise: [''],
      excessive_noise_remark: [''],
      excessive_noise_value: [''],

      // 3b Filling drain
      filling_drain: [''],
      filling_drain_remark: [''],
      filling_drain_value: [''],

      // 4a Rust
      rust_corrosion_check: [''],
      rust_corrosion_value: [''],
      rust_corrosion_remark: [''],

      // RUST OBSERVATION
      Corrosion: [{ value: '', disabled: true }],
      Pitting: [{ value: '', disabled: true }],
      Preserved: [{ value: '', disabled: true }],
      Others: [{ value: '', disabled: true }],

      // RUST OBSERVATION REMARKS (one per sub-type)
      corrosion_remark: [''],
      pitting_remark: [''],
      preserved_remark: [''],
      others_remark: [''],

      // 4b Cable
      cable_wound_on_capstan: [''],
      cable_wound_remark: [''],

      // 5 Oil level
      oil_level: [''],
      oil_level_remark: [''],

      // 6 Visual inspection
      visual_inspection: [''],
      visual_inspection_remark: [''],
      visual_inspection_value: [''],

      // 8 Speed
      slow_speed: [''],
      fast_speed: [''],
      slow_speed_remark: [''],
      fast_speed_remark: [''],

      // 8 Greasing
      greasing_check: [''],
      greasing_remark: [''],

      // 9 Pulling ropes
      last_replacement_date: [''],
      next_due_date: [''],
      replacement_remark: [''],

      // 10 Load test
      load_test_date: [''],
      load_test_next_due: [''],
      load_test_remark: [''],

      // 11 & 12
      other_observation: [''],
      overall_remark: [''],
    });
  }

  setupConditionalLogic() {
    // 3a Lubrication
    this.form.get('lubrication_check')?.valueChanges.subscribe((val) => {
      const remark = this.form.get('lubrication_check_remark');
      if (val === 'Lubricated') {
        remark?.setValue('SAT');
      } else if (val === 'Not Lubricated') {
        remark?.setValue('UNSAT');
      }
    });

    // 3a Noise
    this.form.get('excessive_noise')?.valueChanges.subscribe((val) => {
      const remark = this.form.get('excessive_noise_remark');

      if (val === 'Nil') {
        remark?.setValue('SAT');
        this.showNoiseRemarkInput = false;
        this.form.get('excessive_noise_value')?.reset();
      } else if (val === 'Noise Observed') {
        remark?.setValue('UNSAT');
        this.showNoiseRemarkInput = true;
      } else {
        this.showNoiseRemarkInput = false;
      }
    });

    // 3b Filling Drain
    this.form.get('filling_drain')?.valueChanges.subscribe((val) => {
      const remark = this.form.get('filling_drain_remark');

      // Reset everything first
      remark?.reset();
      this.showFillingDrainRemarkInput = false;

      if (val === 'Charged') {
        remark?.setValue('SAT');
      } else if (['Painted', 'Choked', 'Missing'].includes(val)) {
        remark?.setValue('UNSAT');
      } else if (val === 'Others') {
        this.showFillingDrainRemarkInput = true;
      }
    });

    // 4a Rust
    this.form.get('rust_corrosion_check')?.valueChanges.subscribe((val) => {
      const remark = this.form.get('rust_corrosion_remark');

      if (val === 'NoObservation') {
        remark?.setValue('SAT');
      } else {
        remark?.setValue('UNSAT');
      }
    });

    // 4b Cable
    this.form.get('cable_wound_on_capstan')?.valueChanges.subscribe((val) => {
      const remark = this.form.get('cable_wound_remark');
      remark?.setValue(val === 'Secured' ? 'SAT' : 'UNSAT');
    });

    // 5 Oil Level
    this.form.get('oil_level')?.valueChanges.subscribe((val) => {
      const remark = this.form.get('oil_level_remark');

      if (val === '40-100% filled') {
        remark?.setValue('SAT');
      } else if (val === 'Less than 40% filled Empty') {
        remark?.setValue('SAT with observations');
      } else {
        remark?.setValue('UNSAT');
      }
    });

    // 6 Visual Inspection
    this.form.get('visual_inspection')?.valueChanges.subscribe((val) => {
      const remark = this.form.get('visual_inspection_remark');
      const valueField = this.form.get('visual_inspection_value');

      if (val === 'Nil') {
        remark?.setValue('SAT');
      } else {
        remark?.setValue('UNSAT');
        this.showVisualInspectionInput = true;
        valueField?.enable();
      }
    });

    // 8 Greasing
    this.form.get('greasing_check')?.valueChanges.subscribe((val) => {
      const remark = this.form.get('greasing_remark');
      remark?.setValue(val === 'Greased' ? 'SAT' : 'UNSAT');
    });

    // 9 Replacement 60 months check
    this.form.get('last_replacement_date')?.valueChanges.subscribe((date) => {
      if (!date) return;

      const last = new Date(date);
      const today = new Date();
      const diffMonths =
        (today.getFullYear() - last.getFullYear()) * 12 +
        (today.getMonth() - last.getMonth());

      const remark = this.form.get('replacement_remark');

      if (diffMonths <= 60) {
        remark?.setValue('SAT');
      } else {
        remark?.setValue('UNSAT');
      }

      remark?.enable();
    });

    // 10 Load Test 27 months check
    this.form.get('load_test_date')?.valueChanges.subscribe((date) => {
      if (!date) return;

      const last = new Date(date);
      const today = new Date();
      const diffMonths =
        (today.getFullYear() - last.getFullYear()) * 12 +
        (today.getMonth() - last.getMonth());

      const remark = this.form.get('load_test_remark');

      if (diffMonths <= 27) {
        remark?.setValue('SAT');
      } else {
        remark?.setValue('UNSAT');
      }

      remark?.enable();
    });
  }

  checkSpeed() {
    const slow = parseFloat(this.form.get('slow_speed')?.value);
    const fast = parseFloat(this.form.get('fast_speed')?.value);

    const MIN = 2; // Replace with actual values provided by HIT-J/N6
    const MAX = 5;

    const slowRemark = this.form.get('slow_speed_remark');
    const fastRemark = this.form.get('fast_speed_remark');

    if (!isNaN(slow)) {
      const slowValid = slow >= MIN && slow <= MAX;
      slowRemark?.setValue(slowValid ? 'SAT' : 'UNSAT');
      // slowRemark?.disable();
    }

    if (!isNaN(fast)) {
      const fastValid = fast >= MIN && fast <= MAX;
      fastRemark?.setValue(fastValid ? 'SAT' : 'UNSAT');
      // fastRemark?.disable();
    }
  }

  /* ----------------------------- EQUIPMENT TABS -------------------------------- */

  /** Loads the trial + equipment list on init and hydrates the form for the
   *  currently active equipment (or the first tab, if none is active yet). */
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
      this.selectedShipId = trialRow?.ship_id;

      // Build equipment tab list
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

      // Resolve json_data for the active equipment
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
      console.error('Trial prefill failed (load trial proforma DA)', e);
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

  /** Called when user switches equipment tab */
  async setActiveTab(tab: any): Promise<void> {
    if (!tab || this.isSameEquipment(this.activeTab, tab)) return;

    this.activeTab = tab;
    this.formApiService.setCurrentEquipmentNomenclature(tab);

    if (!this.workflowTrialId) return;

    this.resetFormData();
    this.applyEquipmentDefaults(this.activeTab);

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
      console.error('Failed to load HELO data for selected equipment', error);
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    // Already flat — known top-level keys present
    const isFlat =
      'helo_traversing' in jsonData ||
      'date_of_conduct_of_trials' in jsonData ||
      'lubrication_check' in jsonData;
    if (isFlat) return jsonData;

    // Wrapped — nested under equipment name
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

  /** Reset form fields (except ship) when switching tabs, including the
   *  conditional rust-observation state that is otherwise sticky. */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    this.form.reset({}, { emitEvent: false });
    this.form.patchValue({ ship }, { emitEvent: false });

    this.resetRustFields();
    this.showRustObservationFields = false;
    this.showFillingDrainRemarkInput = false;
    this.showVisualInspectionInput = false;
    this.showNoiseRemarkInput = false;
  }

  /** Hydrates the whole form from the equipment-specific saved/draft payload. */
  fillData(payload: any): void {
    if (!payload) return;

    this.form.patchValue({
      ship: payload.ship ?? '',
      helo_traversing: payload.helo_traversing ?? '',
      reps_present: payload.reps_present ?? '',
      reps_present_user: payload.reps_present_user ?? '',
      reps_present_other_user: payload.reps_present_other_user ?? '',
      date_of_conduct_of_trials: payload.date_of_conduct_of_trials ?? '',
      place_of_conduct_of_trials: payload.place_of_conduct_of_trials ?? '',
      occasion_of_conduct_of_trials:
        payload.occasion_of_conduct_of_trials ?? '',
      authority: payload.authority ?? '',
      authority_date: payload.authority_date ?? '',
      // authority_doc: payload.authority_doc ?? '',
      authority_doc: this.buildFileUploadValue(payload.authority_doc),

      type: payload.type ?? '',
      make: payload.make ?? '',

      lubrication_check: payload.lubrication_check ?? '',
      lubrication_check_remark: payload.lubrication_check_remark ?? '',

      excessive_noise: payload.excessive_noise ?? '',
      excessive_noise_remark: payload.excessive_noise_remark ?? '',
      excessive_noise_value: payload.excessive_noise_value ?? '',

      filling_drain: payload.filling_drain ?? '',
      filling_drain_remark: payload.filling_drain_remark ?? '',
      filling_drain_value: payload.filling_drain_value ?? '',

      rust_corrosion_check: payload.rust_corrosion_check ?? '',
      rust_corrosion_value: payload.rust_corrosion_value ?? '',
      rust_corrosion_remark: payload.rust_corrosion_remark ?? '',

      corrosion_remark: payload.corrosion_remark ?? '',
      pitting_remark: payload.pitting_remark ?? '',
      preserved_remark: payload.preserved_remark ?? '',
      others_remark: payload.others_remark ?? '',

      cable_wound_on_capstan: payload.cable_wound_on_capstan ?? '',
      cable_wound_remark: payload.cable_wound_remark ?? '',

      oil_level: payload.oil_level ?? '',
      oil_level_remark: payload.oil_level_remark ?? '',

      visual_inspection: payload.visual_inspection ?? '',
      visual_inspection_remark: payload.visual_inspection_remark ?? '',
      visual_inspection_value: payload.visual_inspection_value ?? '',

      slow_speed: payload.slow_speed ?? '',
      fast_speed: payload.fast_speed ?? '',
      slow_speed_remark: payload.slow_speed_remark ?? '',
      fast_speed_remark: payload.fast_speed_remark ?? '',

      greasing_check: payload.greasing_check ?? '',
      greasing_remark: payload.greasing_remark ?? '',

      last_replacement_date: payload.last_replacement_date ?? '',
      next_due_date: payload.next_due_date ?? '',
      replacement_remark: payload.replacement_remark ?? '',

      load_test_date: payload.load_test_date ?? '',
      load_test_next_due: payload.load_test_next_due ?? '',
      load_test_remark: payload.load_test_remark ?? '',

      other_observation: payload.other_observation ?? '',
      overall_remark: payload.overall_remark ?? '',
    });

    // The rust-observation radio group is disabled until "Observation" is
    // selected, so it must be explicitly enabled before patching values.
    if (payload.rust_corrosion_check === 'Observation') {
      this.enableRustFields();
      this.showRustObservationFields = true;
      this.form.patchValue({
        Corrosion: payload.Corrosion ?? '',
        Pitting: payload.Pitting ?? '',
        Preserved: payload.Preserved ?? '',
        Others: payload.Others ?? '',
      });
    }

    if (payload.reps_present) {
      this.getUsersByType(payload.reps_present);
    }
  }

  private buildFileUploadValue(value: any): UploadedFileItem | null {
    if (!value) {
      return null;
    }

    // Pehle se sahi object shape mein hai
    if (typeof value === 'object' && value.name && value.file_path) {
      return value as UploadedFileItem;
    }

    // Plain URL string hai — id extract karke object banao
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

  /* ----------------------------- EDIT MODE ----------------------------------- */

  getEditDataByRowId(rowId: string) {
    this.apiService.get(`${Apiendpoints.BER_CERTIFICATE}${rowId}`).subscribe({
      next: (res: any) => {
        if (res?.data) {
          this.editDataDetails = res.data;
          this.form.patchValue({
            command: this.editDataDetails?.ship?.command?.id,
            class_of_ship: this.editDataDetails?.ship?.classofship?.id,
            ship: this.editDataDetails?.ship?.id,
            ship_status:
              this.editDataDetails?.ship_status === 'refit' ? 'REFIT' : 'OPS',
            refit_status: this.editDataDetails?.refit?.id,
            refit_date: this.editDataDetails?.refit_recommencement_date
              ? new Date(this.editDataDetails.refit_recommencement_date)
              : null,
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
    const formDataValues = this.form.getRawValue();

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

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }
}
