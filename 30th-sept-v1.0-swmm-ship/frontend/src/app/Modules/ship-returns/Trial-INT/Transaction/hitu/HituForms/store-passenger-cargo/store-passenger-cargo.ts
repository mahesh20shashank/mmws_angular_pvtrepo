import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import {
  ReactiveFormsModule,
  FormGroup,
  FormBuilder,
  Validators,
} from '@angular/forms';
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import { ParameterCardComponent } from '../../../../ui/parameter-card/parameter-card.component';
import { CalenderComponent } from '../../../../ui/calender.component';
import {
  FileUploadComponent,
  UploadedFileItem,
} from '../../../../ui/file-upload/file-upload.component';
import { InputComponent } from '../../../../ui/input.component';
import { RadioGroupComponent } from '../../../../ui/radio-group/radio-group.component';
import { SelectWithSearchComponent } from '../../../../ui/select-with-search/select-with-search-box.component';
import { SelectComponent } from '../../../../ui/select.component';
import { ApiService } from '../../../../api.service';
import { DynamicSelectTextarea } from '../../../../ui/dynamic-select-textarea/dynamic-select-textarea';
import { DynamicTextarea } from '../../../../ui/dynamic-textarea/dynamic-textarea';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ToastService } from '../../../../services/toast.service';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import { ActivatedRoute, Router } from '@angular/router';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-store-passenger-cargo',
  standalone: true,
  templateUrl: './store-passenger-cargo.html',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    SelectComponent,
    CalenderComponent,
    InputComponent,
    ParameterCardComponent,
    FileUploadComponent,
    ApprovalWorkFlow,
    LoadingButtonComponent,
  ],
})
export class StorePassengerCargo {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
  loading = false;
  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';
  showApprovalWorkflowPopup = false;
      isSubmitTime = false;

  readonly restartIcon = 'rotate-ccw';
  form!: FormGroup;
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

  occasionOptions = [
    { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
    { label: 'End of Refit Trials', value: 'End of Refit Trials' },
    { label: 'Surprise Checks', value: 'Surprise Checks' },
    { label: 'HVAC Audit', value: 'HVAC Audit' },
  ];

  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  locationOptions: any[] = [];

  // Fixed: was a plain string array ["Yes","No"] but template used option.label/option.value
  radioOptions = [
    { label: 'Yes', value: 'Yes' },
    { label: 'No', value: 'No' },
  ];

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private toast: ToastService,
    public formApiService: FormApiService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadClasses();
    this.listenToClassChanges();
    this.loadLocation();
    this.setupValueListeners();
    this.loadTrialPrefillFromQuery();
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

  buildForm() {
    this.form = this.fb.group({
      classOfShip: [''],
      ship: [{ value: '', disabled: true }],
      date_of_conduct_trail: [''],
      place_of_conduct_trail: [''],
      document_no: [''],
      occasion_of_conduct_trail: [''],
      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],
      make: [''],
      model: [''],
      manufacturing: [''],
      load_test_date: [''],
      manufacturer_name: [''],
      load_test_remark: [''],
      rope_survey_date: [''],
      sur_of_rope_remark: [''],
      destruction_test_date: [''],
      destruction_test_remark: [''],
      wire_rope_date: [''],
      wire_rope_remark: [''],
      jb_condition: [''],
      jb_obs: [''],
      status_of_switches: [''],
      switches: [''],
      noise_op: [''],
      status_of_indicators: [''],
      indicators: [''],
      jb_control_rem: [''],
      status_of_switches_rem: [''],
      status_of_ind_remarks: [''],
      jb_control_remark_detail: [''],
      status_of_switches_remark_detail: [''],
      status_of_ind_remark_detail: [''],
      // ------------------9 ------------------
      foundation_observation: [''],
      foundation_remarks: [''],
      corrosion_remark: [''],
      pitting_remark: [''],
      unpainted_remark: [''],
      others_remark: [''],

      lift_well_remark: [''],

      // ------------------10 -----------------
      lubrication_mech: [''],
      lubrication_mech_other: [''],
      lub_of_mech_remark: [''],

      // ------------------11 -----------------
      lubrication_points: [''],
      lubrication_points_other: [''],
      greasing_point_remarks: [''],
      greasing_point_remarks_other: [''],

      // ------------------12 -----------------
      drive_condition: [''],
      noise_operan_remarks: [''],

      // ------------------13 -----------------
      limit_switch: [''],
      limit_switch_obs: [''],
      limit_switch_remarks: [''],
      limit_switch_remark_detail: [''],

      // ------------------14 -----------------
      insulation_motor: [''],
      insulation_motor_remarks: [''],

      // ------------------15 -----------------
      operational_trials: [''],
      operational_trials_obs: [''],
      opera_SWL_remarks: [''],
      operational_trials_remark_detail: [''],

      // ------------------16 -----------------
      oil_level: [''],
      oil_level_remark: [''],
      oil_level_remark_obs: [''],

      // ------------------17 -----------------
      oil_type: [''],
      oil_type_other: [''],
      oil_available: [''],
      oil_remark: [''],

      // ------------------18 -----------------
      oil_change_date: [''],
      oil_change_remark: [''],

      // ------------------19-24 --------------
      water_content: [''],
      viscosity: [''],
      base_number: [''],
      acid_number: [''],
      metal_traces: [''],

      // ------------------25 -----------------
      start_curr: [''],
      start_curr_remark: [''],
      start_slide: [''],
      start_slide_remark: [''],
      start_tilt: [''],
      start_tilt_remark: [''],
      start_lower: [''],
      start_lower_remark: [''],

      // ------------------26 -----------------
      runn_curr: [''],
      runn_curr_remark: [''],
      run_slide: [''],
      run_slide_remark: [''],
      run_tilt: [''],
      run_tilt_remark: [''],
      run_lower: [''],
      run_lower_remark: [''],

      // ------------------27-31 --------------
      logbook_exist: [''],
      logbook_exist_remark: [''],
      periodicity: [''],
      periodicity_remark: [''],
      spm_motor: [''],
      spm_motor_remark: [''],
      other_observation: [''],
      overall_remark: [''],
      overall_sel_remark: [''],
    });
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }

  // =====================================================================
  // CENTRAL LISTENER SETUP — every parameter's logic is wired here
  // =====================================================================
  setupValueListeners() {
    // Row 4: Load Testing (27 months validity)
    this.form.get('load_test_date')?.valueChanges.subscribe(() => {
      this.updateDateRemark('load_test_date', 'load_test_remark', 27);
    });

    // Row 5: Serviceability/Visual Survey (24 months validity)
    this.form.get('rope_survey_date')?.valueChanges.subscribe(() => {
      this.updateDateRemark('rope_survey_date', 'sur_of_rope_remark', 24);
    });

    // Row 8a: JB / Control - electrical condition
    this.form.get('jb_condition')?.valueChanges.subscribe(() => {
      this.handleObservation(
        'jb_condition',
        'jb_obs',
        'jb_control_rem',
        'jb_control_remark_detail',
      );
    });

    // Row 8b: Status of Switches
    this.form.get('status_of_switches')?.valueChanges.subscribe(() => {
      this.handleObservation(
        'status_of_switches',
        'switches',
        'status_of_switches_rem',
        'status_of_switches_remark_detail',
      );
    });

    // Row 8c: Status of Indicators
    this.form.get('status_of_indicators')?.valueChanges.subscribe(() => {
      this.handleObservation(
        'status_of_indicators',
        'indicators',
        'status_of_ind_remarks',
        'status_of_ind_remark_detail',
      );
    });

    // Row 9: Condition of Foundations / Lift well
    this.form.get('foundation_observation')?.valueChanges.subscribe(() => {
      this.onFoundationObservationChange();
    });

    // Row 10: Lubrication of Mechanical Part
    this.form.get('lubrication_mech')?.valueChanges.subscribe((value) => {
      this.onLubricationChange(value);
    });

    // Row 11: Lubrication Points
    this.form.get('lubrication_points')?.valueChanges.subscribe((value) => {
      this.onLubricationPointsChange(value);
    });

    // Row 12: Drive — excessive noise during operation
    this.form.get('drive_condition')?.valueChanges.subscribe((value) => {
      this.determineDriveRemarks(value, 'noise_operan_remarks');
    });

    // Row 13: Limit Switch / Sensor
    this.form.get('limit_switch')?.valueChanges.subscribe(() => {
      this.handleObservation(
        'limit_switch',
        'limit_switch_obs',
        'limit_switch_remarks',
        'limit_switch_remark_detail',
      );
    });

    // Row 14: Insulation Motor (numeric, >=2 SAT else UNSAT)
    this.form.get('insulation_motor')?.valueChanges.subscribe((value) => {
      this.determineInsulationRemarks(value, 'insulation_motor_remarks');
    });

    // Row 15: Operational Trials at SWL
    this.form.get('operational_trials')?.valueChanges.subscribe(() => {
      this.handleObservation(
        'operational_trials',
        'operational_trials_obs',
        'opera_SWL_remarks',
        'operational_trials_remark_detail',
      );
    });

    // Row 16: Oil Level in Gear Box
    this.form.get('oil_level')?.valueChanges.subscribe((value) => {
      this.determineOilLevelRemarks(value, 'oil_level_remark');
    });

    // Row 17: Oil being used in Gear Box (Yes/No)
    this.form.get('oil_available')?.valueChanges.subscribe((value) => {
      this.determineYesNoRemarks(value, 'oil_remark');
    });

    // Row 18: Change of Oil (12 months validity)
    this.form.get('oil_change_date')?.valueChanges.subscribe(() => {
      this.updateDateRemark('oil_change_date', 'oil_change_remark', 12);
    });

    // Row 25: Starting current & related checks
    // ['start_curr', 'start_slide', 'start_tilt', 'start_lower'].forEach((key) => {
    //   this.form.get(key)?.valueChanges.subscribe(() => {
    //     this.evaluateCurrentValue(key, `${key}_remark`);
    //   });
    // });

    // Row 26: Running current & related checks
    ['runn_curr', 'run_slide', 'run_tilt', 'run_lower'].forEach((key) => {
      this.form.get(key)?.valueChanges.subscribe(() => {
        this.evaluateCurrentValue(key, `${key}_remark`);
      });
    });

    // Row 27: Log book exist (Yes/No)
    this.form.get('logbook_exist')?.valueChanges.subscribe((value) => {
      this.determineLogBookRemarks(value, 'logbook_exist_remark');
    });

    // Row 28: Periodicity of measurement
    this.form.get('periodicity')?.valueChanges.subscribe((value) => {
      this.determinePeriodicityRemarks(value, 'periodicity_remark');
    });

    // Row 29: SPM Check of Motor
    this.form.get('spm_motor')?.valueChanges.subscribe((value) => {
      this.onSpmChange(value);
    });
  }

  // =====================================================================
  // HELPERS
  // =====================================================================

  private setRemarkAndLock(controlName: string, value: string) {
    const control = this.form.get(controlName);

    if (!control) return;

    control.enable({ emitEvent: false });
    control.setValue(value, { emitEvent: false });
    control.disable({ emitEvent: false });
  }

  // private setRemarkAndLock(controlName: string, value: string) {
  //   const control = this.form.get(controlName);

  //   if (!control) return;

  //   control.enable({ emitEvent: false });
  //   control.setValue(value, { emitEvent: false });
  //   control.disable({ emitEvent: false });
  // }

  updateDateRemark(dateKey: string, remarkKey: string, monthsLimit: number) {
    const dateValue = this.form.get(dateKey)?.value;
    if (!dateValue) return;

    const selected = new Date(dateValue);
    const today = new Date();

    if (selected > today) {
      this.form.get(remarkKey)?.patchValue('', { emitEvent: false });
      return;
    }

    const thresholdDate = new Date(selected);
    thresholdDate.setMonth(thresholdDate.getMonth() + monthsLimit);

    const remark = today <= thresholdDate ? 'SAT' : 'UNSAT';

    this.form.get(remarkKey)?.patchValue(remark, { emitEvent: false });
  }

  // Row 8a/8b/8c & 13 & 15: Nil -> SAT (locked) | Observation -> user picks
  // SAT with Observation / UNSAT + alphanumeric detail box
  handleObservation(
    selectKey: string,
    obsKey: string,
    remarkKey: string,
    remarkDetailKey?: string,
  ) {
    const value = this.form.get(selectKey)?.value;

    if (value === 'observation') {
      // Allow user to select SAT_OBS / UNSAT
      this.form.get(remarkKey)?.enable({ emitEvent: false });
      this.form.get(remarkKey)?.reset('', { emitEvent: false });

      if (remarkDetailKey) {
        this.form.get(remarkDetailKey)?.reset('', { emitEvent: false });
      }
    } else if (value === 'nil') {
      // Auto-set SAT and lock it
      this.setRemarkAndLock(remarkKey, 'SAT');

      this.form.get(obsKey)?.reset('', { emitEvent: false });

      if (remarkDetailKey) {
        this.form.get(remarkDetailKey)?.reset('', { emitEvent: false });
      }
    }
  }

  onFoundationObservationChange() {
    const value = this.form.get('foundation_observation')?.value;
    const remarkControl = this.form.get('foundation_remarks');

    if (value === 'no_observation') {
      // Auto set SAT
      remarkControl?.setValue('SAT', { emitEvent: false });

      // Lock remark field
      remarkControl?.disable({ emitEvent: false });

      // Clear observation fields
      this.form.get('corrosion_remark')?.reset('', { emitEvent: false });
      this.form.get('pitting_remark')?.reset('', { emitEvent: false });
      this.form.get('unpainted_remark')?.reset('', { emitEvent: false });
      this.form.get('others_remark')?.reset('', { emitEvent: false });
    } else if (value === 'observation') {
      // Allow editing if required
      remarkControl?.enable({ emitEvent: false });

      // Clear previous value
      remarkControl?.reset('', { emitEvent: false });
    }
  }

  // Row 10: Lubrication of Mechanical Part
  // Charged -> SAT | Painted/Choked/Missing -> UNSAT | Others -> dialogue box
  onLubricationChange(value: string) {
    const remarkControl = this.form.get('lub_of_mech_remark');

    const mapping: Record<string, string> = {
      charged: 'SAT',
      painted: 'UNSAT',
      choked: 'UNSAT',
      missing: 'UNSAT',
    };

    if (value === 'others') {
      // allow manual selection
      remarkControl?.enable({ emitEvent: false });
      remarkControl?.reset('', { emitEvent: false });
    } else {
      // auto assign
      remarkControl?.setValue(mapping[value], { emitEvent: false });

      // lock remark field
      remarkControl?.disable({ emitEvent: false });

      this.form.get('lubrication_mech_other')?.reset('', { emitEvent: false });
    }
  }

  // Row 11: Lubrication Points — same Charged/Painted/Choked/Missing/Others scale
  onLubricationPointsChange(value: string) {
    const mapping: Record<string, string> = {
      charged: 'SAT',
      painted: 'UNSAT',
      choked: 'UNSAT',
      missing: 'UNSAT',
    };

    if (value === 'others') {
      // Allow manual selection
      this.form.get('greasing_point_remarks')?.enable({ emitEvent: false });

      this.form.get('greasing_point_remarks')?.reset('', { emitEvent: false });
    } else {
      // Auto set and lock
      this.setRemarkAndLock('greasing_point_remarks', mapping[value]);

      this.form
        .get('greasing_point_remarks_other')
        ?.reset('', { emitEvent: false });

      this.form
        .get('lubrication_points_other')
        ?.reset('', { emitEvent: false });
    }
  }

  // Row 12: Drive — Nil -> SAT | Noise Observed -> UNSAT (+ dialogue via noise_op)
  determineDriveRemarks(value: string, remarkControl: string) {
    if (value === 'nil') {
      this.setRemarkAndLock(remarkControl, 'SAT');

      this.form.get('noise_op')?.reset('', { emitEvent: false });
    } else if (value === 'observation') {
      this.setRemarkAndLock(remarkControl, 'UNSAT');
    }
  }

  // Row 14: Insulation of Motor — numeric value, >=2 SAT else UNSAT
  determineInsulationRemarks(value: string, remarkControl: string) {
    const numericValue = parseFloat(value);

    if (!isNaN(numericValue) && numericValue >= 2) {
      this.setRemarkAndLock(remarkControl, 'SAT');
    } else if (!isNaN(numericValue)) {
      this.setRemarkAndLock(remarkControl, 'UNSAT');
    } else {
      const control = this.form.get(remarkControl);

      control?.enable({ emitEvent: false });
      control?.setValue('', { emitEvent: false });
    }
  }
  // Row 16: Oil Level in Gear Box
  // 40-100% filled -> SAT | Less than 40% filled -> SAT_OBS | Empty -> UNSAT
  determineOilLevelRemarks(value: string, remarkControl: string) {
    const mapping: Record<string, string> = {
      '40_100': 'SAT',
      less_40: 'SAT_OBS',
      empty: 'UNSAT',
    };

    const remark = mapping[value] || '';

    if (remark) {
      this.setRemarkAndLock(remarkControl, remark);
    } else {
      const control = this.form.get(remarkControl);
      control?.enable({ emitEvent: false });
      control?.setValue('', { emitEvent: false });
    }

    // Observation textbox only for SAT_OBS
    if (remark !== 'SAT_OBS') {
      this.form.get('oil_level_remark_obs')?.reset(null, { emitEvent: false });
    }
  }

  // Row 17: Oil being used in Gear Box — Yes/No
  determineYesNoRemarks(value: string, remarkControl: string) {
    if (value === 'Yes') {
      this.setRemarkAndLock(remarkControl, 'SAT');
    } else if (value === 'No') {
      this.setRemarkAndLock(remarkControl, 'UNSAT');
    } else {
      const control = this.form.get(remarkControl);
      control?.enable({ emitEvent: false });
      control?.setValue('', { emitEvent: false });
    }
  }

  // Row 25 & 26: Current checks — SAT if value entered, else UNSAT
  evaluateCurrentValue(valueControl: string, remarkControl: string) {
    const value = this.form.get(valueControl)?.value;

    if (value && String(value).trim() !== '') {
      this.setRemarkAndLock(remarkControl, 'SAT');
    } else {
      this.setRemarkAndLock(remarkControl, 'UNSAT');
    }
  }

  // Row 27: Log book exists — Yes/No
  determineLogBookRemarks(value: string, remarkControl: string) {
    if (value === 'yes') {
      this.setRemarkAndLock(remarkControl, 'SAT');
    } else if (value === 'no') {
      this.setRemarkAndLock(remarkControl, 'UNSAT');
    } else {
      const control = this.form.get(remarkControl);

      control?.enable({ emitEvent: false });
      control?.setValue('', { emitEvent: false });
    }
  }

  // Row 28: Periodicity of measurement — Monthly/Quarterly => SAT, Nil => UNSAT
  determinePeriodicityRemarks(value: string, remarkControl: string) {
    if (value === 'monthly' || value === 'quarterly') {
      this.setRemarkAndLock(remarkControl, 'SAT');
    } else if (value === 'nil') {
      this.setRemarkAndLock(remarkControl, 'UNSAT');
    } else {
      const control = this.form.get(remarkControl);

      control?.enable({ emitEvent: false });
      control?.setValue('', { emitEvent: false });
    }
  }

  // Row 29: SPM Check of Motor
  onSpmChange(value: string) {
    const mapping: Record<string, string> = {
      NA: 'NA',
      Green: 'SAT',
      Yellow: 'SAT_OBS',
      Red: 'UNSAT',
    };

    const remark = mapping[value] || '';

    if (remark) {
      this.setRemarkAndLock('spm_motor_remark', remark);
    } else {
      const control = this.form.get('spm_motor_remark');
      control?.enable({ emitEvent: false });
      control?.setValue('', { emitEvent: false });
    }
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
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Trial prefill failed (Store Passenger Cargo)', e);
    }
  }

  /** Tab switch hone par call hota hai */
  async setActiveTab(tab: any): Promise<void> {
    if (!tab || this.isSameEquipment(this.activeTab, tab)) return;

    this.activeTab = tab;
    this.formApiService.setCurrentEquipmentNomenclature(tab);

    if (!this.workflowTrialId) return;

    this.resetFormData();
    const equipmentList = this.formApiService?.context?.equipment_details || [];
    const selectedEquipment = equipmentList.find((eq: any) => eq.id === tab.id);

    if (selectedEquipment) {
      console.log('Selected Equipment:', selectedEquipment);
      this.form.patchValue({
        manufacturer_name: selectedEquipment.manufacturer_name,
        model: selectedEquipment.model,
      });
    }

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
        'Failed to load Store Passenger Cargo data for selected equipment',
        error,
      );
      this.toast.showError('Failed to load selected equipment data.');
    }
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

  selectedFile!: File;

  handleFile(file: File | null) {
    if (!file) return;
    this.selectedFile = file;
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
}
