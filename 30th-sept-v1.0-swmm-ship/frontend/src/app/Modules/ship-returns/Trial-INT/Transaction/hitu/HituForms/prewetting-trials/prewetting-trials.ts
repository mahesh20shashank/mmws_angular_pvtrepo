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
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-prewetting-trials',
  standalone: true,
  templateUrl: './prewetting-trials.html',
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
  ],
})
export class PrewettingTrials {
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

  occasionOptions = [
    { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
    { label: 'End of Refit Trials', value: 'End of Refit Trials' },
    { label: 'Surprise Checks', value: 'Surprise Checks' },
    { label: 'HVAC Audit', value: 'HVAC Audit' },
  ];

  locationOptions: any[] = [];
  zoneOptions = Array.from({ length: 50 }, (_, index) => index + 1);
  nozzleTypeCountFields = [
    {
      label: 'Type A',
      controlName: 'nozzle_type_a_count',
      defectiveControlName: 'nozzle_type_a_defective',
    },
    {
      label: 'Type B',
      controlName: 'nozzle_type_b_count',
      defectiveControlName: 'nozzle_type_b_defective',
    },
    {
      label: 'Type C',
      controlName: 'nozzle_type_c_count',
      defectiveControlName: 'nozzle_type_c_defective',
    },
    {
      label: 'Others',
      controlName: 'nozzle_type_others_count',
      defectiveControlName: 'nozzle_type_others_defective',
    },
  ];
  coverageOptions = ['FULL', 'HALF', 'PARTIAL'];
  remarksOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'SAT WITH OBS', value: 'SAT_OBS' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

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

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private toast: ToastService,
    public formApiService: FormApiService,
    private toastService: ToastService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadLocation();
    this.loadTrialPrefillFromQuery();
  }

  buildForm() {
    this.form = this.fb.group({
      ship: [{ value: '', disabled: true }],
      date_of_conduct_trail: [''],
      place_of_conduct_trail: [''],
      occasion_of_conduct_trail: [''],
      authority: [''],
      authority_date: [''],
      authority_doc: [''],
      remote_mode_remarks: [''],
      local_mode_remarks: [''],
      remote_mode_offered: [''],
      remote_mode_status: [''],
      local_mode_offered: [''],
      local_mode_status: [''],
      fireman_remark: [''],
      fireman_dynamic: ['', [Validators.min(1), Validators.max(50)]],
      firemain_pressure: ['', [Validators.min(1), Validators.max(50)]],
      firemain_pressure_remark: [''],
      zone_no: ['', [Validators.min(1), Validators.max(50)]],
      zone_no_1: [''],
      nozzle_type_a_count: [''],
      nozzle_type_b_count: [''],
      nozzle_type_c_count: [''],
      nozzle_type_others_count: [''],
      nozzle_type_a_defective: [''],
      nozzle_type_b_defective: [''],
      nozzle_type_c_defective: [''],
      nozzle_type_others_defective: [''],
      zone_no_2: [''],
      zone_no_3: [''],
      nozzle_checks_remark: [''],
      sprayed_area_zone: [''],
      sprayed_area_coverage: [''],
      spared_area_remark: [''],
      leakage_zone_no: [''],
      leakage_status: [''],
      leakage_remark: [''],
      leakage_obs: [''],
      operation_mode: [''],
      operation_remark: [''],
      operation_obs: [''],
      overall_remark_9: [''],
      overall_remark_9_obs: [''],
      spared_area_remark_obs: [''],
      file: [''],
    });
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }

  radioOptions1 = [
    { label: 'Ops', value: 'ops' },
    { label: 'Non Ops', value: 'non_ops' },
  ];

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

    this.form.patchValue({
      file: file.id,
    });

    console.log('File ID:', file.id);
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
    const formDataValues = this.form.value;

    const payload: any = {
      ...formDataValues,
      authority_doc: FileUrlUtil.getFileUrl(formDataValues.authority_doc?.id),
    };

    return payload;
  }

  handleSave(type: 'draft' | 'save' | 'submit'): void {
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

  onOfferedChange(event: Event, statusKey: string, remarksKey: string) {
    const value = (event.target as HTMLSelectElement).value;

    if (value === 'offered') {
      this.form.patchValue({
        [statusKey]: 'SAT',
        [remarksKey]: '',
      });
    } else if (value === 'not_offered') {
      this.form.patchValue({
        [statusKey]: 'UNSAT',
        [remarksKey]: '',
      });
    } else {
      this.form.patchValue({
        [statusKey]: '',
        [remarksKey]: '',
      });
    }
  }

  normalizeNumberRange(controlName: string, min = 1, max = 50) {
    const control = this.form.get(controlName);
    const value = control?.value;

    if (value === '' || value === null || value === undefined) {
      return;
    }

    const numericValue = Number(value);

    if (Number.isNaN(numericValue)) {
      control?.patchValue('', { emitEvent: false });
      return;
    }

    const boundedValue = Math.min(Math.max(numericValue, min), max);
    control?.patchValue(boundedValue, { emitEvent: false });
  }

  normalizeWholeNumber(controlName: string, min = 0, max?: number) {
    const control = this.form.get(controlName);
    const value = control?.value;

    if (value === '' || value === null || value === undefined) {
      return;
    }

    const numericValue = Number(value);

    if (Number.isNaN(numericValue)) {
      control?.patchValue('', { emitEvent: false });
      return;
    }

    let wholeValue = Math.floor(numericValue);
    wholeValue = Math.max(wholeValue, min);

    if (max !== undefined) {
      wholeValue = Math.min(wholeValue, max);
    }

    control?.patchValue(wholeValue, { emitEvent: false });
  }

  /*onLeakageSelectionChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
  
    if (value === 'NO LEAKAGE') {
      this.form.patchValue({
        leakage_remark: 'SAT',
        leakage_obs: ''
      });
    } else if (value === 'LEAKAGE') {
      this.form.patchValue({
        leakage_remark: '',
        leakage_obs: ''
      });
    } else {
      this.form.patchValue({
        leakage_remark: '',
        leakage_obs: ''
      });
    }
  }*/

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
      console.error('Trial prefill failed (Prewetting System Trials)', e);
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
        'Failed to load Prewetting Trials data for selected equipment',
        error,
      );
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat = 'ship' in jsonData || 'remote_mode_offered' in jsonData;
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

  /** Tab switch pe form reset — ship field preserve karke.
   *  Is form mein koi valueChanges-driven auto-derive nahi hai (onOfferedChange
   *  waghera sirf template (selectionChange)/(input) se wired hain, valueChanges
   *  subscribe nahi karte) — sirf classOfShip -> ship reset ka ek subscription
   *  hai, isliye emitEvent:false rakh kar us se bhi bachte hain */
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

  /** Poore form ko equipment-specific payload se hydrate karta hai.
   *  Koi driver/dependent phasing zaroori nahi — is form ke saare "derive"
   *  handlers (onOfferedChange, normalizeNumberRange, etc.) sirf template
   *  event bindings hain, valueChanges subscriptions nahi — isliye
   *  emitEvent:false ke saath ek hi generic pass safe hai */
  fillData(payload: any): void {
    if (!payload) return;

    const specialKeys = ['authority_doc', 'ship'];

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
