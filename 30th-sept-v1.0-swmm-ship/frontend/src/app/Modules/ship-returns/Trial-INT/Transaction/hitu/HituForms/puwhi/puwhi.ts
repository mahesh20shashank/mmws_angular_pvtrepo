import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import {
  ReactiveFormsModule,
  FormGroup,
  FormBuilder,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ParameterCardComponent } from '../../../../ui/parameter-card/parameter-card.component';
import { CalenderComponent } from '../../../../ui/calender.component';
import { MonthYearCalendarComponent } from '../../../../ui/month-year-calendar.component';
import {
  FileUploadComponent,
  UploadedFileItem,
} from '../../../../ui/file-upload/file-upload.component';
import { InputComponent } from '../../../../ui/input.component';
import { SelectWithSearchComponent } from '../../../../ui/select-with-search/select-with-search-box.component';
import { SelectComponent } from '../../../../ui/select.component';
import { MultiSelectDropdownComponent } from '../../../../ui/multiselect';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { Apiendpoints } from '../../../../ApiEndPoints';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-puwhi',
  standalone: true,
  templateUrl: './puwhi.html',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    SelectComponent,
    MultiSelectDropdownComponent,
    CalenderComponent,
    MonthYearCalendarComponent,
    InputComponent,
    ParameterCardComponent,
    LoadingButtonComponent,
    FileUploadComponent,
    ApprovalWorkFlow,
  ],
})
export class PUWHI {
  editMode = false;
  uploadedAuthorityFiles: UploadedFileItem[] = [];

  rowId!: string | null;
  editDataDetails: any = null;
  draftLoading = false;
  saveLoading = false;
  submitLoading = false;
  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';
  form!: FormGroup;
  selectedShipId: number = 0;

  reps_present_options: any[] = [];

  showApprovalWorkflowPopup = false;
  isSubmitTime = false;

  occasionOptions = [
    { label: 'SR', value: 'SR' },
    { label: 'NR', value: 'NR' },
    { label: 'MR', value: 'MR' },
    { label: 'EAMP', value: 'EAMP' },
    { label: 'AMP', value: 'AMP' },
    { label: 'Ops Docking', value: 'Ops Docking' },
    { label: 'Emergency docking', value: 'Emergency docking' },
  ];

  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  locationOptions: any[] = [];
  usersList: any[] = [];

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

  /** Saare file-upload fields — inhe generic loop se skip karke object-shape mein convert karte hain */
  private readonly fileUploadFields = [
    'authority_doc',
    'watt_report',
    'ship_staff_signature',
    'refitting_authority_signature',
    'hitu_inspector_signature',
  ];

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private toast: ToastService,
    private route: ActivatedRoute,
    public formApiService: FormApiService,
    private toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadPlaceOfConductTrail();
    this.loadLocation();
    this.loadRepsPresentOptions();

    this.form.get('reps_present')?.valueChanges.subscribe((userType) => {
      if (userType) {
        this.getUsersByType(userType);
      }
    });
    this.loadTrialPrefillFromQuery();
  }

  buildForm() {
    this.form = this.fb.group({
      ship: [{ value: '', disabled: true }],
      ship_or_submarine: [{ value: '', disabled: true }],
      date_of_conduct_trail: [''],
      place_of_conduct_trail: [''],
      document_no: [''],
      date_of_docking: [''],
      reps_present: [''],
      reps_present_user: [[]],
      reps_present_other_user: [''],

      occasion_of_conduct_trail: [''],
      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],
      docking_version: [''],
      docking_version_other: [''],
      nature_of_docking: [''],
      nature_of_docking_other: [''],
      last_refit_type: [''],
      last_refit_other: [''],
      last_refit_year: [''],
      nr_mr_type: [''],
      nr_mr_other: [''],
      nr_mr_date: [''],
      docked_at: [''],
      docked_at1: [''],
      docking_version_1: [''],
      docking_version_other_1: [''],
      nature_of_docking_1: [''],
      nature_of_docking_other_1: [''],
      dock_blocks_wedged: [''],
      dock_blocks_wedged_obs: [''],
      dock_blocks_crushed: [''],
      dock_blocks_crushed_obs: [''],
      uw_openings_clear1: [''],
      uw_openings_clear: [''],
      uw_openings_obs: [''],
      docking_duration: [''],
      docking_duration_obs: [''],
      marine_growth: [''],
      marine_growth1: [''],
      marine_growth_obs: [''],
      propeller_cleaning: [''],
      propeller_cleaning_obs: [''],
      foreign_objects: [''],
      foreign_objects_obs: [''],
      paint_refit_type: [''],
      paint_refit_other: [''],
      paint_refit_year: [''],
      paint_oem_type: [''],
      paint_oem_other: [''],
      paint_oem_year: [''],
      primer_full: [''],
      AC1_full: [''],
      AC2_full: [''],
      AC3_full: [''],
      TC_full: [''],
      AF1_full: [''],
      AF2_full: [''],
      paint_scheme_type: [''],
      paint_scheme_other: [''],
      paint_scheme_year: [''],
      paint_touch_type: [''],
      paint_touch_other: [''],
      paint_touch_year: [''],
      primer_touch: [''],
      AC1_touch: [''],
      AC2_touch: [''],
      AC3_touch: [''],
      TC_touch: [''],
      AF1_touch: [''],
      AF2_touch: [''],
      af_bilge_keel_condition: [[]],
      af_bilge_keel_location: [''],
      af_stern_aft_condition: [[]],
      af_stern_aft_location: [''],
      af_boot_top_condition: [[]],
      af_boot_top_location: [''],
      af_rudders_condition: [[]],
      af_rudders_location: [''],
      af_stabilisers_condition: [[]],
      af_stabilisers_location: [''],
      af_dock_block_condition: [[]],
      af_dock_block_location: [''],
      af_other_observations_condition: [[]],
      af_other_observations_location: [''],
      paint_scope: [[]],
      paint_scope_other: [''],
      rust_general_outer_bottom: [[]],
      rust_general_outer_bottom_other: [''],
      rust_general_outer_bottom_location: [''],
      rust_boot_top: [[]],
      rust_boot_top_other: [''],
      rust_boot_top_location: [''],
      rust_stern_aft: [[]],
      rust_stern_aft_other: [''],
      rust_stern_aft_location: [''],
      rust_rudders: [[]],
      rust_rudders_other: [''],
      rust_rudders_location: [''],
      rust_bilge_keel_stem: [[]],
      rust_bilge_keel_stem_other: [''],
      rust_bilge_keel_stem_location: [''],
      rust_dock_block: [[]],
      rust_dock_block_other: [''],
      rust_dock_block_location: [''],
      rust_other_observations: [''],
      rust_other_observations_remarks: [''],
      robotic_refit_type: [''],
      robotic_refit_other: [''],
      robotic_refit_year: [''],
      hull_survey_extent: [''],
      hull_survey_details: [''],
      dents_status: [''],
      dents_details: [''],
      cracks_status: [''],
      cracks_details: [''],
      scratch_status: [''],
      scratch_details: [''],
      holes_status: [''],
      holes_details: [''],
      other_obs2_status: [''],
      other_obs2_details: [''],
      structural_defects_status: [''],
      structural_defects_details: [''],
      stabilizer_status: [''],
      stabilizer_details: [''],
      bilge_keel_type: [''],
      bilge_keel_other: [''],
      clean_ship_status: [''],
      clean_ship_details: [''],
      hull_issues_status: [''],
      hull_issues_details: [''],
      grp_dome_status: [''],
      grp_dome_details: [''],
      fairing_skirt_status: [''],
      fairing_skirt_details: [''],
      align_cracks_status: [''],
      align_cracks_details: [''],
      align_misalignment_status: [''],
      align_misalignment_details: [''],
      iccp_service_status: [''],
      iccp_service_details: [''],
      sacrificial_anodes_status: [''],
      sacrificial_anodes_count: [''],
      iccp_anodes_status: [''],
      file: [],
      iccp_anodes_details: [''],
      iccp_reference_status: [''],
      iccp_reference_details: [''],
      dielectric_shield_status: [''],
      dielectric_shield_details: [''],
      iccp_predocking_status: [''],
      predocking_report_status: [''],
      prop_cleaning_status: [''],
      prop_cleaning_details: [''],
      prop_blade_edges_status: [''],
      prop_blade_edges_details: [''],
      prop_hub_status: [''],
      prop_hub_details: [''],
      prop_pitting_status: [''],
      prop_pitting_details: [''],
      shaft_coating_status: [''],
      shaft_coating_details: [''],
      eddy_items_status: [''],
      eddy_items_other: [''],
      eddy_items_details: [''],
      water_seepage_status: [''],
      water_seepage_details: [''],
      missing_parts_status: [''],
      missing_parts_details: [''],
      blanking_parts_status: [''],
      blanking_parts_details: [''],
      scupper_lips_status: [''],
      scupper_lips_other: [''],
      scupper_lips_details: [''],
      rudder_fairing_details: [''],
      angle_of_list: [''],
      general_other_observations: [''],
      final_other_observations: [''],
      ship_name: [''],
      ship_rank: [''],
      ship_designation: [''],
      refit_name: [''],
      refit_rank: [''],
      refit_designation: [''],
      hitu_name: [''],
      hitu_rank: [''],
      hitu_designation: [''],
      uw_checklist_view: [''],
      watt_report: [''],
      // -----------------signatres

      ship_staff_signature: [''],
      refitting_authority_signature: [''],
      hitu_inspector_signature: [''],

      ship_staff_name: [''],
      refitting_authority_name: [''],
      hitu_inspector_name: [''],

      ship_staff_rank: [''],
      refitting_authority_rank: [''],
      hitu_inspector_rank: [''],

      ship_staff_dsg: [''],
      refitting_authority_dsg: [''],
      hitu_inspector_dsg: [''],
    });
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }

  handleFileInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    this.form.get('authority_doc')?.setValue(file);
  }

  placesOptions: any[] = [];
  radioOptions = [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ];

  radioOptions1 = [
    { label: 'Yes', value: 'yes' },
    { label: 'Nil', value: 'no' },
  ];

  dockingVersionOptions = [
    { label: 'Ver I', value: 'ver1' },
    { label: 'Ver II', value: 'ver2' },
    { label: 'NHQ/MoD approved', value: 'nhq' },
    { label: 'Others', value: 'other' },
  ];

  natureOfDockingOptions = [
    { label: 'Ops', value: 'ops' },
    { label: 'Emergency', value: 'emergency' },
    { label: 'AMP', value: 'amp' },
    { label: 'EAMP', value: 'eamp' },
    { label: 'SR', value: 'sr' },
    { label: 'NR', value: 'nr' },
    { label: 'MR', value: 'mr' },
    { label: 'Others', value: 'other' },
  ];

  refitTypeOptions = [
    { label: 'NR', value: 'nr' },
    { label: 'MR', value: 'mr' },
    { label: 'SR', value: 'sr' },
    { label: 'EAMP', value: 'eamp' },
    { label: 'AMP', value: 'amp' },
    { label: 'Others', value: 'other' },
  ];

  refitTypeOtherOptions = [
    { label: 'NR', value: 'nr' },
    { label: 'MR', value: 'mr' },
    { label: 'SR', value: 'sr' },
    { label: 'EAMP', value: 'eamp' },
    { label: 'AMP', value: 'amp' },
    { label: 'Other', value: 'other' },
  ];

  yesNoOptions = [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ];

  yesNilOptions = [
    { label: 'Yes', value: 'yes' },
    { label: 'Nil', value: 'nil' },
  ];

  satUnsatOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  propellerCleaningOptions = [
    { label: 'Completed', value: 'completed' },
    { label: 'Pending', value: 'pending' },
    { label: 'In Progress', value: 'in_progress' },
  ];

  outerBottomConditionOptions = [
    { label: 'Bare metal', value: 'bare_metal' },
    { label: 'Delamination', value: 'delamination' },
    { label: 'Flaking', value: 'flaking' },
    { label: 'Peeled off', value: 'peeled' },
    { label: 'Blisters', value: 'blisters' },
    { label: 'Cracks', value: 'cracks' },
    { label: 'Deteriorated', value: 'deteriorated' },
    { label: 'Nil', value: 'nil' },
  ];

  paintScopeOptions = [
    { label: 'Full Renewal', value: 'full' },
    { label: 'Maintenance', value: 'maintenance' },
    { label: 'Others', value: 'other' },
  ];

  rustOuterBottomOptions = [
    { label: 'Minor', value: 'minor' },
    { label: 'Major', value: 'major' },
    { label: 'Bare metal', value: 'bare' },
    { label: 'Others', value: 'other' },
  ];

  bilgeKeelTypeOptions = [
    { label: 'Box type', value: 'box' },
    { label: 'Flat plate', value: 'flat' },
    { label: 'Other', value: 'other' },
  ];

  iccpServiceOptions = [
    { label: 'Undertaken', value: 'undertaken' },
    { label: 'Not undertaken', value: 'not_undertaken' },
  ];

  sacrificialAnodesOptions = [
    { label: 'Intact', value: 'intact' },
    { label: 'Partially consumed(less than 50%)', value: 'partially_consumed' },
    { label: 'Fully consumed(more than 50%)', value: 'fully_consumed' },
  ];

  predockingReportOptions = [
    { label: 'Submitted', value: 'submitted' },
    { label: 'Pending', value: 'pending' },
  ];

  eddyItemsStatusOptions = [
    { label: 'Damaged', value: 'damaged' },
    { label: 'Deteriorated', value: 'deteriorated' },
    { label: 'Others', value: 'other' },
  ];

  uwChecklistViewOptions = [{ label: 'Show Checklist', value: 'show' }];

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
  hasMultiSelectOption(controlName: string, option: string): boolean {
    const value = this.form.get(controlName)?.value;
    return Array.isArray(value) && value.includes(option);
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

  handleSave(type: 'draft' | 'save' | 'submit') {
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

      this.selectedShipId = trialRow?.ship_id;
      this.form.patchValue(
        { ship_or_submarine: trialRow.ship_type_name },
        { emitEvent: false },
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
      console.error('Trial prefill failed (PUWHI)', e);
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
      console.error('Failed to load PUWHI data for selected equipment', error);
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'date_of_docking' in jsonData ||
      'docking_version' in jsonData ||
      'date_of_conduct_trail' in jsonData;
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

  /** Tab switch pe form reset — ship field preserve karke */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;
      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    this.form.patchValue({ ship }, { emitEvent: false });
  }

  /** Poore form ko equipment-specific payload se generic tarike se hydrate karta hai,
   *  aur saare file-upload fields ko special handling deta hai. */
  fillData(payload: any): void {
    if (!payload) return;

    Object.keys(payload).forEach((key) => {
      if (key === 'ship' || this.fileUploadFields.includes(key)) return;

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

    // Saare file-upload fields — URL string ko required object shape mein convert karo
    this.fileUploadFields.forEach((field) => {
      this.form
        .get(field)
        ?.setValue(this.buildFileUploadValue(payload[field]), {
          emitEvent: false,
        });
    });
  }

  /** Backend se aayi file-URL string ko FileUploadComponent ke required
   *  { id, name, file_path } shape mein convert karta hai */
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
