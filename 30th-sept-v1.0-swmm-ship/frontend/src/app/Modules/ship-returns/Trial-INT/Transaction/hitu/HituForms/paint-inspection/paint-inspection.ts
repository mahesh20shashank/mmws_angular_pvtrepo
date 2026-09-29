import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import {
  ReactiveFormsModule,
  FormGroup,
  FormBuilder,
  FormArray,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
import { FileUrlUtil } from '../../../../file-url-util';
import { Apiendpoints } from '../../../../ApiEndPoints';
import { MultiSelectDropdownComponent } from '../../../../ui/multiselect';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-paint-inspection',
  standalone: true,
  templateUrl: './paint-inspection.html',
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
    ApprovalWorkFlow,
    MultiSelectDropdownComponent,
  ],
})
export class PaintInspection {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
  loading = false;
  // readonly draftIcon = 'save';
  // readonly saveIcon = 'save-all';
  readonly restartIcon = 'rotate-ccw';
  form!: FormGroup;
  reps_present_options: any[] = [];
  usersList: any[] = [];
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;
  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  occasionOptions = [
    { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
    { label: 'End of Refit Trials', value: 'End of Refit Trials' },
    { label: 'Surprise Checks', value: 'Surprise Checks' },
    { label: 'HVAC Audit', value: 'HVAC Audit' },
  ];

  locationOption = [
    { label: 'Fwd Battery Pits', value: 'fwd' },
    { label: 'AFT Battery Pits', value: 'aft' },
  ];

  obsOptions = [
    { label: 'No specific defects observed', value: 'nil' },
    { label: 'Observations', value: 'obs' },
  ];

  paintOptions = [
    { label: 'EP 1', value: 'ep1' },
    { label: 'EP 2', value: 'ep2' },
    { label: 'V-61', value: 'v61' },
    { label: 'SCI 050806', value: 'sci' },
    { label: 'Other', value: 'other' },
  ];

  kalvariOptions = [
    { label: 'Less than 270', value: 'lt270' },
    { label: '≥ 270', value: 'gte270' },
  ];

  ekmSskOptions = [
    { label: '950-1050', value: 'range' },
    { label: 'Less than 950', value: 'lt950' },
    { label: 'More than 1050', value: 'gt1050' },
  ];

  overallOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'SAT with observation', value: 'SAT_OBS' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  locationOptions: any[] = [];
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

  /** ye dono FormArrays hain (dynamic-textarea), generic loop se skip karke alag handle honge */
  private readonly stringArrayFields = ['fwd_paint_other', 'aft_paint_other'];

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private toast: ToastService,
    private toastService: ToastService,
    public formApiService: FormApiService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadRepsPresentOptions();
    this.loadClasses();
    this.listenToClassChanges();
    this.loadLocation();
    this.form.get('reps_present')?.valueChanges.subscribe((userType) => {
      console.log('userType', userType);
      if (userType) {
        this.getUsersByType(userType);
      }
    });

    this.loadTrialPrefillFromQuery();
  }

  buildForm() {
    this.form = this.fb.group({
      classOfShip: [''],
      ship: [''],
      reps_present: [''],
      reps_present_user: [''],
      date_of_conduct_trail: [''],
      place_of_conduct_trail: [''],
      document_no: [''],
      occasion_of_conduct_trail: [''],
      authority: [''],
      authority_date: [''],
      authority_doc: [''],
      location: [''],
      fwd_status: [''],
      fwd_obs: [''],
      fwd_paint: [''],
      fwd_paint_other: this.fb.array([this.fb.control('')]),
      fwd_dft_kalvari: [''],
      fwd_dft_ekm: [''],
      fwd_dft_ssk: [''],
      fwd_overall: [''],
      aft_status: [''],
      aft_obs: [''],
      aft_paint: [''],
      aft_paint_other: this.fb.array([this.fb.control('')]),
      aft_dft_kalvari: [''],
      aft_dft_ekm: [''],
      aft_dft_ssk: [''],
      aft_overall: [''],
      defect_status: [''],
      defect_obs: [''],
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
    const shipId = this.form.get('ship')?.value;

    const selectedOption = this.reps_present_options.find(
      (item) => item.value === selectedId,
    );

    const selectedName = selectedOption?.label?.toLowerCase();

    let apiUrl = '';

    if (selectedName === 'ship staff') {
      if (!shipId) {
        this.toastService.showError('Please select a ship first.');
        return;
      }
      apiUrl = `${Apiendpoints.MASTER_USER}?ship_id=${shipId}`;
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

  radioOptions1 = [
    { label: 'Ops', value: 'ops' },
    { label: 'Non Ops', value: 'non_ops' },
  ];

  handleObsWithChoice(statusKey: string, remarkKey: string, obsKey: string) {
    const value = this.form.get(statusKey)?.value;

    if (value === 'nil') {
      this.form.patchValue({
        [remarkKey]: 'SAT',
        [obsKey]: '',
      });
    }

    if (value === 'observation') {
      this.form.patchValue({
        [remarkKey]: '', // user must choose
      });
    }
  }

  handleCompressor(threshold: number) {
    const value = Number(this.form.get('compressor_value')?.value);

    if (!value && value !== 0) {
      this.form.patchValue({ compressor_remark: '' });
      return;
    }

    this.form.patchValue({
      compressor_remark: value > threshold ? 'SAT' : 'UNSAT',
    });
  }

  handleOilLevelCBPM() {
    const value = this.form.get('oil_level_cbpm')?.value;

    if (value === 'full') {
      this.form.patchValue({
        oil_level_cbpm_remark: 'SAT',
        oil_level_cbpm_obs: '',
      });
    }

    if (value === 'low') {
      this.form.patchValue({
        oil_level_cbpm_remark: 'SAT_OBS',
      });
    }

    if (value === 'empty') {
      this.form.patchValue({
        oil_level_cbpm_remark: 'UNSAT',
        oil_level_cbpm_obs: '',
      });
    }
  }
  handleSPMFinal() {
    const value = this.form.get('spm_status')?.value;

    if (value === 'na') {
      this.form.patchValue({
        spm_remark: 'NA',
        spm_obs: '',
      });
    }

    if (value === 'green') {
      this.form.patchValue({
        spm_remark: 'SAT',
        spm_obs: '',
      });
    }

    if (value === 'yellow') {
      this.form.patchValue({
        spm_remark: 'SAT_OBS',
      });
    }

    if (value === 'red') {
      this.form.patchValue({
        spm_remark: 'UNSAT',
        spm_obs: '',
      });
    }
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
    this.form.get('classOfShip')?.valueChanges.subscribe((classId: any) => {
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
      .subscribe((res: any) => {
        this.shipOptions = res || [];
      });
  }
  loadLocation() {
    this.api
      .getDropdownData('master/locations/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((res: any) => {
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
      console.error('Trial prefill failed (Paint Inspection)', e);
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
        'Failed to load Paint Inspection data for selected equipment',
        error,
      );
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'location' in jsonData ||
      'date_of_conduct_trail' in jsonData ||
      'fwd_paint' in jsonData;
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
   *  dono FormArrays (fwd_paint_other, aft_paint_other) bhi ek default row pe wapas laata hai */
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

  /** Poore form ko equipment-specific payload se hydrate karta hai — dono
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

    // fwd_paint_other, aft_paint_other — dynamic-textarea FormArrays
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
}
