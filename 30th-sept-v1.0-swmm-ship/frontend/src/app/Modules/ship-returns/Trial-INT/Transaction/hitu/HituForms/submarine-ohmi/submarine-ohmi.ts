import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import {
  ReactiveFormsModule,
  FormGroup,
  FormBuilder,
  Validators,
  FormArray,
} from '@angular/forms';
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
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
import { DynamicSelectTextarea } from '../../../../ui/dynamic-select-textarea/dynamic-select-textarea';
import { DynamicTextarea } from '../../../../ui/dynamic-textarea/dynamic-textarea';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import { ToastService } from '../../../../services/toast.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';
import { Apiendpoints } from '../../../../ApiEndPoints';
import { MultiSelectDropdownComponent } from '../../../../ui/multiselect';

@Component({
  selector: 'app-submarine-ohmi',
  standalone: true,
  templateUrl: './submarine-ohmi.html',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    SelectComponent,
    CalenderComponent,
    InputComponent,
    ParameterCardComponent,
    FileUploadComponent,
    DynamicTextarea,
    DynamicSelectTextarea,
    ApprovalWorkFlow,
    MultiSelectDropdownComponent,
    LoadingButtonComponent,
  ],
})
export class SubmarineOHMI {
  form!: FormGroup;

  uploadedAuthorityFiles: UploadedFileItem[] = [];
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;
  showWarpingRem = false;
  showCompRem = false;

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  locationOptions: any[] = [];
  compartmentOptions: any[] = [];
  loading = false;
  showBollardsRem = false;
  showFairleadsRem = false;
  showFwdEscapeRem = false;
  showConningRem = false;
  showAftEscapeRem = false;

  tankRows: [] | any;
  compartmentRows: [] | any;

  heldNotHeldOptions = [
    { label: 'Held and Updated', value: 'held' },
    { label: 'Held Not Updated', value: 'not_updated' },
    { label: 'Not Held', value: 'not_held' },
  ];

  // ---- Reusable option lists ----
  nilObservationOptions = [
    { label: 'Nil', value: 'nil' },
    { label: 'Observation', value: 'observation' },
  ];
  nilObservationNaOptions = [
    { label: 'NA', value: 'na' },
    { label: 'Nil', value: 'nil' },
    { label: 'Observation', value: 'observation' },
  ];
  satUnsatOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];
  satObsUnsatOptions = [
    { label: 'SAT with observation', value: 'SAT_OBS' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];
  applicableOptions = [
    { label: 'Applicable', value: 'applicable' },
    { label: 'Not Applicable', value: 'not_applicable' },
  ];

  satOptions = [
    { label: 'SAT', value: 'sat' },
    { label: 'UNSAT', value: 'unsat' },
  ];

  nilObsOptions = [
    { label: 'Nil', value: 'nil' },
    { label: 'Observation', value: 'observation' },
  ];

  lidOptions = [
    { label: 'Upper Lid', value: 'upper' },
    { label: 'Lower Lid', value: 'lower' },
  ];
  satWithObsOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'SAT with observations', value: 'SAT_OBS' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  heldNotHeldOpt = [
    { label: 'Held', value: 'held' },
    { label: 'Not Held', value: 'not-held' },
  ];

  heldNotHeldApplicableOpt = [
    { label: 'Applicable', value: 'applicable' },
    { label: 'Held', value: 'held' },
    { label: 'Not Held', value: 'not-held' },
    { label: 'Not applicable', value: 'not-applicable' },
  ];

  // ---- Range thresholds for numeric SAT/UNSAT checks ----
  // NOTE: image placeholders were "** to ^^" — update these once actual limits are confirmed
  vacuumAchievedMin = 0;
  vacuumAchievedMax = 20;
  openLoopPressureMin = 0;
  openLoopPressureMax = 20;
  closedLoopPressureMin = 0;
  closedLoopPressureMax = 20;

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

  /** Saare dynamic-textarea FormArrays — generic loop se skip karke alag handle honge */
  private readonly stringArrayFields = [
    'tank',
    'compartment',
    'overall_remark',
  ];

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    public formApiService: FormApiService,
    private toastService: ToastService,
    private route: ActivatedRoute,
    private toast: ToastService,
    private apiService: ApiService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadClasses();
    this.listenToClassChanges();
    this.loadLocation();
    this.loadCompartments();
    this.setUpConditionalLogic();

    this.setupMultiFieldCheck(
      [
        'manua',
        'pneumatic',
        'manua_a',
        'pneumatic_a',
        'manua_c',
        'pneumatic_c',
      ],
      'pneumatic_rem',
    );

    this.loadTrialPrefillFromQuery();
  }

  buildForm() {
    this.form = this.fb.group({
      ship: [{ value: '', disabled: true }],
      date_of_conduct_trail_from: [''],
      date_of_conduct_trail_to: [''],
      place_of_conduct_trail: [''],
      fax_document_no: [''],
      fax_date: [''],
      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],
      vacuum_test_date: [''],
      vacuum_test_remark: [''],
      load_test: [''],
      vacuum_value: [''],
      vacuum_ach_remark: [''],
      status_of_switches: [''],

      compartment_master: [''],
      overall_sel_remark: [''],
      deck_plating_obs_12: [''],

      leak_obs: [''],
      leak_rem: [''],
      structural_status: [''],
      structural_obs: [''],
      structural_rem: [''],
      rubber_seal_status: [''],
      rubber_seal_obs: [''],
      rubber_seal_rem: [''],
      joint_status: [''],
      joint_status_obs: [''],
      joint_status_rem: [''],
      tightness_status: [''],
      tightness_obs: [''],
      tightness_rem: [''],
      hull_status: [''],
      hull_obs: [''],
      weight_status: [''],
      weight_remark: [''],
      weight_remark_obs: [''],
      rough_status: [''],
      rough_remark: [''],
      rough_remark_obs: [''],
      master_status: [''],
      master_remark: [''],
      master_remark_obs: [''],
      docking_status: [''],
      docking_remark: [''],
      docking_remark_obs: [''],
      stability_status: [''],
      stability_remark: [''],
      stability_remark_obs: [''],
      defect_status: [''],
      defects: [''],
      status_of_switches_rem: [''],
      ohmi_date: [''],
      pending_status: [''],
      status_of_pending_rem: [''],
      preservative_status: [''],
      // status_of_preservative_rem: [''],
      rusting_status: [''],
      rusting_rem: [''],
      structural_status_1: [''],
      structural_def_rem: [''],
      misc_status: [''],
      misc_rem: [''],
      int_preservation_status: [''],
      preservation: [''],
      preservation_status_rem: [''],
      rusting_status_1: [''],
      rusting: [''],
      rusting_rem_1: [''],
      status_of_int_structural: [''],
      int_structural: [''],
      status_of_int_structural_rem: [''],
      status_of_preserv: [''],
      preserve: [''],
      status_of_preserve_rem: [''],
      status_of_preservative_remarks: [''],
      wet_rust_status: [''],
      wet_rust: [''],
      wet_rust_rem: [''],
      wet_struct_def: [''],
      wet_struc: [''],
      wet_struct_rem: [''],
      preser_stand_status: [''],
      preser_stand: [''],
      status_of_preser_rem: [''],
      status_of_tank_rust: [''],
      tank_rust: [''],
      status_of_tank_rust_rem: [''],
      status_of_tank_def: [''],
      tank_struc_def: [''],
      status_of_tank_rem: [''],
      status_of_mach_pres: [''],
      mach_pres: [''],
      hull_remark: [''],
      hull_remark_obs: [''],
      status_of_mach_pres_rem: [''],
      mach_rust_status: [''],
      mach_rust: [''],
      leak_status: [''],
      mach_rust_rem: [''],
      gen_bilge_hyg: [''],
      gen_bilge: [''],
      gen_bilge_rem: [''],
      deck_cover_status: [''],
      deck_cover: [''],
      deck_cover_rem: [''],
      mach_stru_def_status: [''],
      mach_str_def: [''],
      mach_str_def_rem: [''],
      battery_paint_scheme: [''],
      battery_paint_other: [''],
      battery_fwd_date: [''],
      battery_fwd_note: [''],
      battery_aft_date: [''],
      battery_aft_note: [''],
      battery_def_status: [''],
      battery_def: [''],
      battery_def_rem: [''],
      open_loop_applicable: [''],
      open_loop_pressure: [''],
      closed_loop_applicable: [''],
      closed_loop_pressure: [''],
      tank_paint_scheme: [''],
      date: [''],
      tank_def_status: [''],
      tank_def: [''],
      tank_def_remarks: [''],
      ballast_status: [''],
      ballast_obs: [''],
      // ------------------------ towing keys
      towing_hook_count: [''],
      towing_pendant: [''],
      towing_rope: [''],
      towing_bollards: [''],
      towing_cleats: [''],
      towing_fairleads: [''],
      towing_cable_clench: [''],
      // ------------------------- misllenous
      hdlj_status: [''],
      hdlj_qty: [''],
      hdlj_due: [''],
      gslj_status: [''],
      gslj_qty: [''],
      gslj_due: [''],
      raft_qty: [''],
      raft_due: [''],
      escape_applicable: [''],
      escape_status: [''],
      escape_qty: [''],
      escape_due: [''],

      // ------------------------ indicator

      indicator_status: [''],
      indicator: [''],
      indicator_rem: [''],
      boyd_status: [''],
      boyd: [''],
      boyd_rem: [''],
      cutting_status: [''],
      cutting: [''],
      cutting_rem: [''],
      buoy_date: [''],
      chain_size: [''],
      chain_inspection: [''],
      chain_length: [''],
      chain_load: [''],
      chain_mass: [''],
      steel_diameter: [''],
      steel_inspection: [''],
      steel_length: [''],
      steel_load: [''],
      steel_mass: [''],
      bollards_status: [''],
      bollards: [{ value: '', disabled: true }],
      bollards_rem: [''],
      fairleads_status: [''],
      fairleads: [{ value: '', disabled: true }],
      fairleads_rem: [''],
      warping_status: [''],
      warping: [{ value: '', disabled: true }],
      warping_rem: [''],
      comp1: [{ value: '', disabled: true }],
      comp_rem: [''],
      fwd_lid: [''],
      fwd_escape_status: [''],
      fwd_escape: [{ value: '', disabled: true }],
      fwd_escape_rem: [''],
      conning_lid: [''],
      conning_lid_status: [''],
      conning: [{ value: '', disabled: true }],
      conning_lid_rem: [''],
      aft_lid: [''],
      aft_escape_status: [''],
      aft_escape: [{ value: '', disabled: true }],
      aft_escape_rem: [''],
      other_obs: [''],
      manua: [''],
      pneumatic: [''],
      pneumatic_rem: [''],
      manua_a: [''],
      pneumatic_a: [''],
      manua_c: [''],
      pneumatic_c: [''],
      tank: this.fb.array([this.fb.control('')]),
      compartment: this.fb.array([this.fb.control('')]),
      overall_remark: this.fb.array([this.fb.control('')]),
      status_of_preservat: [''],
      status_of_preservation: [''],
      status_of_preservatt: [''],
      status_of_rem: [''],
      status_of_mach_press: [''],

      preservative_obs: [''],
      status_of_preservative_rem: [{ value: '', disabled: false }], // enabled only in observation branch — see handlePreservationOuter
      open_loop_remark: [{ value: '', disabled: true }],
      closed_loop_remark: [{ value: '', disabled: true }],
    });
  }

  loadCompartments() {
    this.apiService
      .getDropdownData(`${Apiendpoints.MASTER_COMPARTMENT}`, {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((res) => {
        this.compartmentOptions = res || [];
      });
  }

  buildPayload() {
    const formDataValues = this.form.getRawValue();

    const payload: any = {
      ...formDataValues,
      authority_doc: FileUrlUtil.getFileUrl(formDataValues.authority_doc?.id),
    };

    return payload;
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
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

  updateDateRemark(dateKey: string, remarkKey: string, monthsLimit: number) {
    const dateValue = this.form.get(dateKey)?.value;
    if (!dateValue) return;

    const selected = new Date(dateValue);
    const today = new Date();

    if (selected > today) {
      this.form.get(remarkKey)?.patchValue('');
      return;
    }

    const thresholdDate = new Date(selected);
    thresholdDate.setMonth(thresholdDate.getMonth() + monthsLimit);

    const remark = today <= thresholdDate ? 'SAT' : 'UNSAT';

    this.form.get(remarkKey)?.patchValue(remark);
  }

  setupMultiFieldCheck(fields: string[], resultKey: string) {
    fields.forEach((field) => {
      this.form.get(field)?.valueChanges.subscribe(() => {
        this.evaluateMulti(fields, resultKey);
      });
    });

    // Initial evaluation
    this.evaluateMulti(fields, resultKey);
  }

  evaluateMulti(fields: string[], resultKey: string) {
    const values = fields.map((field) => this.form.get(field)?.value);

    const remarkControl = this.form.get(resultKey);

    if (!remarkControl) return;

    // If any dropdown is UNSAT → overall UNSAT immediately
    if (values.some((value) => value === 'unsat')) {
      remarkControl.setValue('unsat', { emitEvent: false });
      remarkControl.disable({ emitEvent: false });
      return;
    }

    // If all dropdowns are SAT → overall SAT
    if (values.every((value) => value === 'sat')) {
      remarkControl.setValue('sat', { emitEvent: false });
      remarkControl.disable({ emitEvent: false });
      return;
    }

    // If some dropdowns are still empty
    remarkControl.setValue('', { emitEvent: false });
    remarkControl.disable({ emitEvent: false });
  }

  // handleObservation(selectKey: string, obsKey: string, remarkKey: string) {
  //   const value = this.form.get(selectKey)?.value;

  //   if (value === 'observation') {
  //     this.form.get(remarkKey)?.patchValue('UNSAT');
  //   } else if (value === 'nil') {
  //     this.form.get(remarkKey)?.patchValue('SAT');
  //     this.form.get(obsKey)?.patchValue(''); // clear textarea
  //   }
  // }

  handleObservation1(selectKey: string, obsKey: string, remarkKey: string) {
    const value = this.form.get(selectKey)?.value;

    if (value === 'SAT') {
      this.form.get(remarkKey)?.patchValue('SAT');
    } else if (value === 'UNSAT') {
      this.form.get(remarkKey)?.patchValue('UNSAT');
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

  addTankRow() {}
  addCompartment() {}

  handleFile(file: File | null) {
    console.log('Selected file:', file);
  }

  radioOptions = ['Yes', 'No'];

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
      console.error('Trial prefill failed (Submarine OHMI)', e);
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
        'Failed to load Submarine OHMI data for selected equipment',
        error,
      );
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'vacuum_test_remark' in jsonData ||
      'date_of_conduct_trail_from' in jsonData ||
      'date_of_conduct_trail_to' in jsonData ||
      'hull_status' in jsonData;
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
   *  teeno FormArrays bhi ek default row pe wapas laata hai */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;

      if (control instanceof FormArray) return; // FormArrays alag handle honge

      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    this.stringArrayFields.forEach((field) => {
      const arr = this.form.get(field) as FormArray;
      arr.clear();
      arr.push(this.fb.control(''));
    });

    this.form.patchValue({ ship }, { emitEvent: false });
  }

  /** Poore form ko equipment-specific payload se hydrate karta hai — teeno
   *  FormArrays aur authority_doc ko special handling deta hai. */
  fillData(payload: any): void {
    if (!payload) return;

    const specialKeys = ['authority_doc', 'ship', ...this.stringArrayFields];

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

    // authority_doc — URL string ko file-upload component ke required object shape mein convert karo
    this.form
      .get('authority_doc')
      ?.setValue(this.buildFileUploadValue(payload.authority_doc), {
        emitEvent: false,
      });

    // Teeno FormArrays hydrate karo (tank, compartment, overall_remark)
    this.stringArrayFields.forEach((field) => {
      this.patchStringArray(field, payload[field]);
    });
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

  /** Pattern A — Nil => SAT, Observation => UNSAT, both auto + disabled remark */
  handleObservation(selectKey: string, obsKey: string, remarkKey: string) {
    const value = this.form.get(selectKey)?.value;
    const remarkControl = this.form.get(remarkKey);

    if (value === 'observation') {
      remarkControl?.setValue('UNSAT');
    } else if (value === 'nil') {
      remarkControl?.setValue('SAT');
      this.form.get(obsKey)?.setValue('');
    } else {
      remarkControl?.setValue('');
      this.form.get(obsKey)?.setValue('');
    }
    remarkControl?.disable({ emitEvent: false });
  }

  /** Pattern B — Nil/NA => nothing, Observation => textbox only, no remark control at all */
  toggleObservationOnly(selectKey: string, obsKey: string) {
    const value = this.form.get(selectKey)?.value;
    if (value !== 'observation') {
      this.form.get(obsKey)?.setValue('');
    }
  }

  /** Pattern C — Preservation standards triple pattern.
   * Nil => remark auto SAT + disabled.
   * Observation => remark cleared + ENABLED so user manually picks SAT_OBS / UNSAT,
   * and the obs textbox only appears (via app-dynamic-select-textarea) when SAT_OBS is picked.
   */
  handlePreservationOuter(outerKey: string, remarkKey: string, obsKey: string) {
    const value = this.form.get(outerKey)?.value;
    const remarkControl = this.form.get(remarkKey);

    if (value === 'nil') {
      remarkControl?.setValue('SAT');
      remarkControl?.disable({ emitEvent: false });
      this.form.get(obsKey)?.setValue('');
    } else if (value === 'observation') {
      remarkControl?.setValue('');
      remarkControl?.enable({ emitEvent: false });
    } else {
      remarkControl?.setValue('');
      remarkControl?.disable({ emitEvent: false });
      this.form.get(obsKey)?.setValue('');
    }
  }

  /** Pattern Held-status (Books & Records) — auto SAT/UNSAT, always disabled, textbox on UNSAT */
  handleHeldStatus(selectKey: string, remarkKey: string, obsKey: string) {
    const value = this.form.get(selectKey)?.value;
    const remarkControl = this.form.get(remarkKey);

    if (value === 'held') {
      remarkControl?.setValue('SAT');
      this.form.get(obsKey)?.setValue('');
    } else if (value === 'not_updated' || value === 'not_held') {
      remarkControl?.setValue('UNSAT');
    } else {
      remarkControl?.setValue('');
      this.form.get(obsKey)?.setValue('');
    }
    remarkControl?.disable({ emitEvent: false });
  }

  /** Pattern D — numeric range check => auto SAT/UNSAT, always disabled */
  evaluateRange(valueKey: string, remarkKey: string, min: number, max: number) {
    const raw = this.form.get(valueKey)?.value;
    const remarkControl = this.form.get(remarkKey);

    if (raw === '' || raw === null || raw === undefined) {
      remarkControl?.setValue('');
      remarkControl?.disable({ emitEvent: false });
      return;
    }
    const num = Number(raw);
    remarkControl?.setValue(num >= min && num <= max ? 'SAT' : 'UNSAT');
    remarkControl?.disable({ emitEvent: false });
  }

  setUpConditionalLogic() {
    this.form.get('bollards_status')?.valueChanges.subscribe((val) => {
      const bollards = this.form.get('bollards');
      const bollardsRem = this.form.get('bollards_rem');

      if (val === 'nil') {
        // Nil selected → SAT
        bollards?.setValue('SAT', { emitEvent: false });

        // Hide observation field
        this.showBollardsRem = false;

        // Clear observation remark
        bollardsRem?.setValue('', { emitEvent: false });
      } else if (val === 'observation') {
        // Observation selected → show input
        this.showBollardsRem = true;

        // Clear automatic SAT
        bollards?.setValue('UNSAT', { emitEvent: false });
      } else {
        this.showBollardsRem = false;

        bollards?.setValue('', { emitEvent: false });
        bollardsRem?.setValue('', { emitEvent: false });
      }
    });

    // 4 b

    this.form.get('fairleads_status')?.valueChanges.subscribe((val) => {
      const bollards = this.form.get('fairleads');

      if (val === 'nil') {
        // Nil selected → SAT
        bollards?.setValue('SAT', { emitEvent: false });

        // Hide observation field
        this.showFairleadsRem = false;
      } else if (val === 'observation') {
        // Observation selected → show input
        this.showFairleadsRem = true;

        // Clear automatic SAT
        bollards?.setValue('UNSAT', { emitEvent: false });
      } else {
        this.showBollardsRem = false;

        bollards?.setValue('', { emitEvent: false });
      }
    });

    // 4 c

    this.form.get('warping_status')?.valueChanges.subscribe((val) => {
      const bollards = this.form.get('warping');

      if (val === 'nil') {
        // Nil selected → SAT
        bollards?.setValue('SAT', { emitEvent: false });

        // Hide observation field
        this.showWarpingRem = false;
      } else if (val === 'observation') {
        // Observation selected → show input
        this.showWarpingRem = true;

        // Clear automatic SAT
        bollards?.setValue('UNSAT', { emitEvent: false });
      } else {
        this.showWarpingRem = false;

        bollards?.setValue('', { emitEvent: false });
      }
    });

    //Annexure II

    this.form.get('fwd_escape_status')?.valueChanges.subscribe((val) => {
      const bollards = this.form.get('fwd_escape');

      if (val === 'sat') {
        // Nil selected → SAT
        bollards?.setValue('SAT', { emitEvent: false });

        // Hide observation field
        this.showFwdEscapeRem = false;
      } else if (val === 'unsat') {
        // Observation selected → show input
        this.showFwdEscapeRem = true;

        // Clear automatic SAT
        bollards?.setValue('UNSAT', { emitEvent: false });
      } else {
        this.showFwdEscapeRem = false;

        bollards?.setValue('', { emitEvent: false });
      }
    });

    //Annexure II 2

    this.form.get('conning_lid_status')?.valueChanges.subscribe((val) => {
      const bollards = this.form.get('conning');

      if (val === 'sat') {
        // Nil selected → SAT
        bollards?.setValue('SAT', { emitEvent: false });

        // Hide observation field
        this.showConningRem = false;
      } else if (val === 'unsat') {
        // Observation selected → show input
        this.showConningRem = true;

        // Clear automatic SAT
        bollards?.setValue('UNSAT', { emitEvent: false });
      } else {
        this.showConningRem = false;

        bollards?.setValue('', { emitEvent: false });
      }
    });

    //Annexure II 3

    this.form.get('aft_escape_status')?.valueChanges.subscribe((val) => {
      const bollards = this.form.get('aft_escape');

      if (val === 'sat') {
        // Nil selected → SAT
        bollards?.setValue('SAT', { emitEvent: false });

        // Hide observation field
        this.showAftEscapeRem = false;
      } else if (val === 'unsat') {
        // Observation selected → show input
        this.showAftEscapeRem = true;

        // Clear automatic SAT
        bollards?.setValue('UNSAT', { emitEvent: false });
      } else {
        this.showAftEscapeRem = false;

        bollards?.setValue('', { emitEvent: false });
      }
    });

    //Annexure II 4

    this.form.get('compartment_master')?.valueChanges.subscribe((val) => {
      const bollards = this.form.get('comp1');

      if (val === 'sat') {
        // Nil selected → SAT
        bollards?.setValue('SAT', { emitEvent: false });

        // Hide observation field
        this.showCompRem = false;
      } else if (val === 'unsat') {
        // Observation selected → show input
        this.showCompRem = true;

        // Clear automatic SAT
        bollards?.setValue('UNSAT', { emitEvent: false });
      } else {
        this.showCompRem = false;

        bollards?.setValue('', { emitEvent: false });
      }
    });
  }
}