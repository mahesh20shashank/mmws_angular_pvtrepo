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
import { SelectWithSearchComponent } from '../../../../ui/select-with-search/select-with-search-box.component';
import { SelectComponent } from '../../../../ui/select.component';
import { ApiService } from '../../../../api.service';
import { DynamicSelectTextarea } from '../../../../ui/dynamic-select-textarea/dynamic-select-textarea';
import { DynamicTextarea } from '../../../../ui/dynamic-textarea/dynamic-textarea';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastService } from '../../../../services/toast.service';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FileUrlUtil } from '../../../../file-url-util';
import { Apiendpoints } from '../../../../ApiEndPoints';
import { MultiSelectDropdownComponent } from '../../../../ui/multiselect';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-submarine-door',
  standalone: true,
  templateUrl: './submarine-door.html',
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
    MultiSelectDropdownComponent,
    ApprovalWorkFlow,
  ],
})
export class SubmarineDoor {
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
  compartmentOptions: any[] = [];

  form!: FormGroup;
  uploadedAuthorityFiles: UploadedFileItem[] = [];
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;

  private lastEquipmentPayload: any = null;

  occasionOptions = [
    { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
    { label: 'End of Refit Trials', value: 'End of Refit Trials' },
    { label: 'Surprise Checks', value: 'Surprise Checks' },
    { label: 'HVAC Audit', value: 'HVAC Audit' },
  ];
  locationOptions: any[] = [];

  lidPositionOptions = [
    { label: 'Upper Lid', value: 'upper' },
    { label: 'Lower Lid', value: 'lower' },
  ];
  statusOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];
  overallRemarksOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'SAT with observations', value: 'SAT_OBS' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  showFwdInput = false;
  showConningInput = false;
  showAftInput = false;
  showOverallInput = false;

  radioOptions = ['Yes', 'No'];

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
    this.loadLocation();
    this.loadCompartments();
    this.setupConditionalLogic();
    this.loadTrialPrefillFromQuery();
  }

  buildForm() {
    this.form = this.fb.group({
      submarine_id: [{ value: '', disabled: true }],
      date_of_conduct_trail: [''],
      place_of_conduct_trail: [''],
      document_no: [''],
      occasion_of_conduct_trail: [''],

      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],

      // Fwd Escape Hatch
      fwd_lid_position: [''],
      fwd_status: [''],
      fwd_obs: [''],

      // Conning Tower
      conning_lid_position: [''],
      conning_status: [''],
      conning_obs: [''],

      // Aft Escape Hatch
      aft_lid_position: [''],
      aft_status: [''],
      aft_obs: [''],

      // Compartment Masters
      compartment: [''],
      compartment_remarks: [''],
      deck_plating_obs_12: [''],
      compartment_master: this.fb.array([this.fb.control('')]),

      // Any Other Observations
      other_obs: [''],

      // Overall Remarks
      overall_sel_remark: [''],
      overall_remark: [''],
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
        if (this.lastEquipmentPayload) {
          this.patchCompartmentMaster(
            this.lastEquipmentPayload.compartment_master,
          );
        }
      });
  }

  setupConditionalLogic() {
    // Fwd Escape Hatch status -> observation field
    this.form.get('fwd_status')?.valueChanges.subscribe((value) => {
      if (value === 'UNSAT') {
        this.showFwdInput = true;
      } else {
        this.showFwdInput = false;
        this.form.get('fwd_obs')?.setValue('', { emitEvent: false });
      }
    });

    // Conning Tower status -> observation field
    this.form.get('conning_status')?.valueChanges.subscribe((value) => {
      if (value === 'UNSAT') {
        this.showConningInput = true;
      } else {
        this.showConningInput = false;
        this.form.get('conning_obs')?.setValue('', { emitEvent: false });
      }
    });

    // Aft Escape Hatch status -> observation field
    this.form.get('aft_status')?.valueChanges.subscribe((value) => {
      if (value === 'UNSAT') {
        this.showAftInput = true;
      } else {
        this.showAftInput = false;
        this.form.get('aft_obs')?.setValue('', { emitEvent: false });
      }
    });

    // Compartment Masters status -> auto-fill / clear remarks
    this.form.get('compartment')?.valueChanges.subscribe((value) => {
      const remark = this.form.get('compartment_remarks');
      if (value === 'SAT') {
        remark?.setValue('SAT', { emitEvent: false });
      } else if (value === 'UNSAT') {
        remark?.setValue('', { emitEvent: false });
      }
    });

    // Overall remark -> show textarea only when SAT with observations / UNSAT
    this.form.get('overall_sel_remark')?.valueChanges.subscribe((value) => {
      this.showOverallInput = value === 'SAT_OBS' || value === 'UNSAT';
      if (!this.showOverallInput) {
        this.form.get('overall_remark')?.setValue('', { emitEvent: false });
      }
    });
  }

  handleFile(file: File | null) {
    console.log('Selected file:', file);
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

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
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
      this.form.patchValue(
        { submarine_id: trialRow.ship_type_name },
        { emitEvent: false },
      );

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
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Trial prefill failed (load trial proforma DA)', e);
    }
  }

  /** Called when user switches equipment tab */
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
        'Failed to load Submarine Door data for selected equipment',
        error,
      );
      this.toast.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    // Already flat — known top-level keys present
    const isFlat =
      'submarine_id' in jsonData ||
      'date_of_conduct_trail' in jsonData ||
      'fwd_status' in jsonData;
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

  /** Reset form fields (except submarine id) when switching tabs, including the
   *  conditional observation-input state that is otherwise sticky. */
  private resetFormData(): void {
    const submarineId = this.form.get('submarine_id')?.value;

    this.form.reset({}, { emitEvent: false });
    this.form.patchValue({ submarine_id: submarineId }, { emitEvent: false });

    // const compartmentMasterArr = this.form.get('compartment_master') as any;
    // while (compartmentMasterArr && compartmentMasterArr.length > 1) {
    //   compartmentMasterArr.removeAt(compartmentMasterArr.length - 1);
    // }
    // compartmentMasterArr?.at(0)?.setValue('');
    this.lastEquipmentPayload = null;

    this.showFwdInput = false;
    this.showConningInput = false;
    this.showAftInput = false;
    this.showOverallInput = false;
  }

  /** Hydrates the whole form from the equipment-specific saved/draft payload. */
  fillData(payload: any): void {
    if (!payload) return;
    this.lastEquipmentPayload = payload;

    this.form.patchValue({
      submarine_id: payload.submarine_id ?? '',
      date_of_conduct_trail: payload.date_of_conduct_trail ?? '',
      place_of_conduct_trail: payload.place_of_conduct_trail ?? '',
      document_no: payload.document_no ?? '',
      occasion_of_conduct_trail: payload.occasion_of_conduct_trail ?? '',

      authority: payload.authority ?? '',
      authority_date: payload.authority_date ?? '',
      authority_doc: this.buildFileUploadValue(payload.authority_doc),

      fwd_lid_position: payload.fwd_lid_position ?? '',
      fwd_status: payload.fwd_status ?? '',
      fwd_obs: payload.fwd_obs ?? '',

      conning_lid_position: payload.conning_lid_position ?? '',
      conning_status: payload.conning_status ?? '',
      conning_obs: payload.conning_obs ?? '',

      aft_lid_position: payload.aft_lid_position ?? '',
      aft_status: payload.aft_status ?? '',
      aft_obs: payload.aft_obs ?? '',

      compartment: payload.compartment ?? '',
      compartment_remarks: payload.compartment_remarks ?? '',

      other_obs: payload.other_obs ?? '',

      overall_sel_remark: payload.overall_sel_remark ?? '',
      overall_remark: payload.overall_remark ?? '',
    });

    this.showFwdInput = payload.fwd_status === 'UNSAT';
    this.showConningInput = payload.conning_status === 'UNSAT';
    this.showAftInput = payload.aft_status === 'UNSAT';
    this.showOverallInput =
      payload.overall_sel_remark === 'SAT_OBS' ||
      payload.overall_sel_remark === 'UNSAT';

    // this.fillCompartmentMasters(payload.compartment_master);
  }

  private fillCompartmentMasters(values: any): void {
    const arr = this.form.get('compartment_master') as any;
    if (!arr) return;

    const list: string[] = Array.isArray(values)
      ? values
      : values
        ? [values]
        : [''];

    while (arr.length) arr.removeAt(0);
    list.forEach((v) => arr.push(this.fb.control(v ?? '')));
    if (!arr.length) arr.push(this.fb.control(''));
  }

  private buildFileUploadValue(value: any): UploadedFileItem | null {
    if (!value) {
      return null;
    }

    // Already in the right object shape
    if (typeof value === 'object' && value.name && value.file_path) {
      return value as UploadedFileItem;
    }

    // Plain URL string — extract id and build the object
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
    // if (type === 'save' && !this.validateForm()) {
    //   return;
    // }
    if (type === 'clear') {
      this.form.reset();
      this.toast.showSuccess('Form cleared successfully');
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
  private patchCompartmentMaster(value: any): void {
    const list = Array.isArray(value) ? value : value ? [value] : [];
    this.form.get('compartment_master')?.setValue(list, { emitEvent: false });
  }
}
