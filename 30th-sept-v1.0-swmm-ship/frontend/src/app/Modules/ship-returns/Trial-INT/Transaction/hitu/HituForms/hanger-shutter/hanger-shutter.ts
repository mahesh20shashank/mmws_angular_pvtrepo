import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormBuilder } from '@angular/forms';
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
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-hanger-shutter',
  standalone: true,
  templateUrl: './hanger-shutter.html',
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
export class HangerShutter {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
  loading = false;

  readonly restartIcon = 'rotate-ccw';

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';
  draftLoading = false;
  saveLoading = false;
  submitLoading = false;
  form!: FormGroup;
  uploadedAuthorityFiles: UploadedFileItem[] = [];
  uploadedKittiwakeFiles: UploadedFileItem[] = [];
  uploadedLabFiles: UploadedFileItem[] = [];

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

  occasionOptions = [
    { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
    { label: 'End of Refit Trials', value: 'End of Refit Trials' },
    { label: 'Surprise Checks', value: 'Surprise Checks' },
  ];
  yesNoOptions = [
    { label: 'Yes', value: 'Yes' },
    { label: 'No', value: 'No' },
  ];

  satUnsatOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  nilObsOptions = [
    { label: 'Nil', value: 'Nil' },
    { label: 'Observation', value: 'Observation' },
  ];

  obsRemarkOptions = [
    { label: 'SAT with observation', value: 'SAT with observation' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  defectOptions = [
    { label: 'Defects liquidated', value: 'Defects liquidated' },
    { label: 'Not liquidated', value: 'Not liquidated' },
  ];

  oilLevelOptions = [
    { label: '40-100% filled', value: '40-100% filled' },
    { label: 'Less than 40% filled', value: 'Less than 40% filled' },
    { label: 'Empty', value: 'Empty' },
  ];

  periodicityOptions = [
    { label: 'Monthly', value: 'Monthly' },
    { label: 'Quarterly', value: 'Quarterly' },
    { label: 'No', value: 'No' },
  ];

  spmOptions = [
    { label: 'NA (Motor fitted inside the cover casing)', value: 'NA' },
    { label: 'Green', value: 'Green' },
    { label: 'Yellow', value: 'Yellow' },
    { label: 'Red', value: 'Red' },
  ];

  overallOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
    { label: 'SAT with observations', value: 'SAT with observations' },
  ];

  overallRemarksNaOptions = [
    { label: 'NA', value: 'NA' },
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
    { label: 'SAT with observations', value: 'SAT with observations' },
  ];
  hangerOptions = [
    { label: 'Hangar Cover', value: 'hanger_cover' },
    { label: 'Hangar Shutter', value: 'hanger_shutter' },
  ];
  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  locationOptions: any[] = [];

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
    this.loadClasses();
    this.listenToClassChanges();
    this.loadLocation();
    this.setupConditionalLogic();
    this.loadTrialPrefillFromQuery();
    console.log('form api service', this.formApiService);
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
      kitti_doc: [''],
      lab_doc: [''],
      // cover_make:[''],
      manufacturer_name: [{ value: '', disabled: true }],
      cover_condition_status: [''],
      cover_condition_remark: [''],
      cover_condition_obs: [''],
      slats_status: [''],
      slats_remark: [''],
      slats_obs: [''],
      hood_status: [''],
      hood_remark: [''],
      hood_obs: [''],
      bottom_bar_status: [''],
      bottom_bar_remark: [''],
      bottom_bar_obs: [''],
      rubber_status: [''],
      rubber_remark: [''],
      rubber_obs: [''],
      neoprene_status: [''],
      neoprene_remark: [''],
      neoprene_obs: [''],
      compressor_value: [''],
      compressor_remark: [''],
      limit_status: [''],
      limit_remark: [''],
      limit_obs: [''],
      gearbox_seal_status: [''],
      gearbox_seal_remark: [''],
      gearbox_seal_obs: [''],
      manual_speed: [''],
      manual_status: [''],
      manual_remark: [''],
      manual_obs: [''],
      pneumatic_speed: [''],
      pneumatic_status: [''],
      pneumatic_remark: [''],
      pneumatic_obs: [''],
      electrical_speed: [''],
      electrical_status: [''],
      electrical_remark: [''],
      electrical_obs: [''],
      defect_status: [''],
      defect_obs: [''],
      oil_used_cbpm: [''],
      oil_level_cbpm: [''],
      oil_level_cbpm_obs: [''],
      oil_level_cbpm_remark: [''],
      oil_change_date_cbpm: [''],
      oil_batch_cbpm: [''],
      kitti_water: [''],
      kitti_file: [''],
      kitti_viscosity: [''],
      kitti_base: [''],
      kitti_acid: [''],
      lab_water: [''],
      lab: [''],
      lab_viscosity: [''],
      lab_base: [''],
      lab_acid: [''],
      lab_metal: [''],
      start_current_design: [''],
      start_current_measured: [''],
      start_current_remark: [''],
      running_current_design: [''],
      running_current_measured: [''],
      running_current_remark: [''],
      logbook_design: [''],
      logbook_measured: [''],
      logbook_obs: [''],
      periodicity_design: [''],
      periodicity_measured: [''],
      spm_value: [''],
      spm_status: [''],
      spm_obs: [''],
      spm_remark: [''],
      other_obs_final: [''],
      overall_remark_final: [''],
      overall_obs_final: [''],
      periodicity_remark: [''],
    });
  }

  setupConditionalLogic() {
    [
      [
        'cover_condition_status',
        'cover_condition_remark',
        'cover_condition_obs',
      ],
      ['slats_status', 'slats_remark', 'slats_obs'],
      ['hood_status', 'hood_remark', 'hood_obs'],
      ['bottom_bar_status', 'bottom_bar_remark', 'bottom_bar_obs'],
      ['rubber_status', 'rubber_remark', 'rubber_obs'],
      ['neoprene_status', 'neoprene_remark', 'neoprene_obs'],
      ['limit_status', 'limit_remark', 'limit_obs'],
      ['gearbox_seal_status', 'gearbox_seal_remark', 'gearbox_seal_obs'],
      ['manual_status', 'manual_remark', 'manual_obs'],
      ['pneumatic_status', 'pneumatic_remark', 'pneumatic_obs'],
      ['electrical_status', 'electrical_remark', 'electrical_obs'],
    ].forEach(([statusKey, remarkKey, obsKey]) => {
      this.form
        .get(statusKey)
        ?.valueChanges.subscribe(() =>
          this.handleObsWithChoice(statusKey, remarkKey, obsKey),
        );
    });

    this.form
      .get('compressor_value')
      ?.valueChanges.subscribe(() => this.handleCompressor(10));
    this.form
      .get('oil_level_cbpm')
      ?.valueChanges.subscribe(() => this.handleOilLevelCBPM());
    this.form
      .get('spm_status')
      ?.valueChanges.subscribe(() => this.handleSPMFinal());
    this.form.get('overall_remark_final')?.valueChanges.subscribe((value) => {
      if (value !== 'SAT with observations') {
        this.form
          .get('overall_obs_final')
          ?.patchValue('', { emitEvent: false });
      }
    });

    this.form.get('logbook_measured')?.valueChanges.subscribe((value) => {
      this.form
        .get('logbook_obs')
        ?.patchValue(value === 'Yes' ? 'SAT' : value === 'No' ? 'UNSAT' : '', {
          emitEvent: false,
        });
    });

    this.form.get('periodicity_measured')?.valueChanges.subscribe((value) => {
      this.form
        .get('periodicity_remark')
        ?.patchValue(
          value === 'Monthly' || value === 'Quarterly'
            ? 'SAT'
            : value === 'No'
              ? 'UNSAT'
              : '',
          { emitEvent: false },
        );
    });
  }

  radioOptions1 = [
    { label: 'Ops', value: 'ops' },
    { label: 'Non Ops', value: 'non_ops' },
  ];

  handleObsWithChoice(statusKey: string, remarkKey: string, obsKey: string) {
    const value = this.form.get(statusKey)?.value;
    const remarkControl = this.form.get(remarkKey);
    const obsControl = this.form.get(obsKey);

    if (value === 'Nil') {
      remarkControl?.setValue('SAT');
      remarkControl?.disable({ emitEvent: false }); // Not editable
      obsControl?.setValue('');
    } else if (value === 'Observation') {
      remarkControl?.enable({ emitEvent: false }); // Editable again
      remarkControl?.setValue('');
      obsControl?.setValue('');
    }
  }
  handleCompressor(threshold: number) {
    const value = Number(this.form.get('compressor_value')?.value);
    const remarkControl = this.form.get('compressor_remark');

    if (!value && value !== 0) {
      remarkControl?.enable({ emitEvent: false });
      remarkControl?.setValue('');
      return;
    }

    const remark = value > threshold ? 'SAT' : 'UNSAT';

    remarkControl?.setValue(remark);
    remarkControl?.disable({ emitEvent: false }); // Fixed, not editable
  }

  limitValue(event: any) {
    let value = Number(event.target.value);

    if (value < 1) value = 1;
    if (value > 100) value = 100;

    event.target.value = value;
    this.form.get('compressor_value')?.setValue(value, { emitEvent: false });
  }

  handleOilLevelCBPM() {
    const value = this.form.get('oil_level_cbpm')?.value;
    const remarkControl = this.form.get('oil_level_cbpm_remark');

    // If nothing is selected
    if (!value) {
      remarkControl?.enable({ emitEvent: false });
      remarkControl?.setValue('');
      this.form.get('oil_level_cbpm_obs')?.setValue('');
      return;
    }

    if (value === '40-100% filled') {
      remarkControl?.setValue('SAT');
      this.form.get('oil_level_cbpm_obs')?.setValue('');
    }

    if (value === 'Less than 40% filled') {
      remarkControl?.setValue('SAT with observations');
    }

    if (value === 'Empty') {
      remarkControl?.setValue('UNSAT');
      this.form.get('oil_level_cbpm_obs')?.setValue('');
    }

    // Make the remark fixed (not editable)
    remarkControl?.disable({ emitEvent: false });
  }

  handleSPMFinal() {
    const value = this.form.get('spm_status')?.value;
    if (!value) return;

    if (value === 'NA') {
      this.form.patchValue(
        {
          spm_remark: 'NA',
          spm_obs: '',
        },
        { emitEvent: false },
      );
    }

    if (value === 'Green') {
      this.form.patchValue(
        {
          spm_remark: 'SAT',
          spm_obs: '',
        },
        { emitEvent: false },
      );
    }

    if (value === 'Yellow') {
      this.form.patchValue(
        {
          spm_remark: 'SAT with observations',
        },
        { emitEvent: false },
      );
    }

    if (value === 'Red') {
      this.form.patchValue(
        {
          spm_remark: 'UNSAT',
          spm_obs: '',
        },
        { emitEvent: false },
      );
    }
  }
  isSpmLocked = false;

  handleSPMValueInput(event: any) {
    const raw = event.target.value;

    if (!raw) {
      this.isSpmLocked = false;

      this.form.patchValue({
        spm_status: '',
        spm_remark: '',
        spm_obs: '',
      });
      return;
    }

    const num = Number(raw);

    if (num >= 0 && num <= 20) {
      this.form.patchValue({
        spm_status: 'Green',
        spm_remark: 'SAT',
        spm_obs: '',
      });
    } else if (num > 20 && num <= 35) {
      this.form.patchValue({
        spm_status: 'Yellow',
        spm_remark: 'SAT with observations',
        spm_obs: '',
      });
    } else if (num > 35) {
      this.form.patchValue({
        spm_status: 'Red',
        spm_remark: 'UNSAT',
        spm_obs: '',
      });
    }

    this.isSpmLocked = true;
    this.form.get('spm_status')?.disable();
    this.form.get('spm_remark')?.disable();
  }

  shouldShowObservationInput(remarkKey: string): boolean {
    const value = this.form.get(remarkKey)?.value;
    return (
      value === 'SAT with observation' ||
      value === 'SAT with observations' ||
      value === 'UNSAT'
    );
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }

  handleKittiwakeFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedKittiwakeFiles = files;
  }

  handleLabFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedLabFiles = files;
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
    // const formDataValues = this.form.value;
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
      this.applyEquipmentDefaults(this.activeTab);
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Trial prefill failed (Hanger Shutter)', e);
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
        'Failed to load Hanger Shutter data for selected equipment',
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

    this.form.patchValue(
      {
        manufacturer_name: selectedEquipment?.manufacturer_name ?? '',
        model: selectedEquipment?.model ?? '',
      },
      { emitEvent: false },
    );
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    // flat check — koi bhi known top-level key ho to already flat hai
    const isFlat =
      'cover_make' in jsonData ||
      'cover_condition_status' in jsonData ||
      'date_of_conduct_trail' in jsonData;
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

  /** Tab switch pe form reset — ship field ko preserve karke,
   *  disabled controls (jaise cover_condition_remark, compressor_remark, etc)
   *  ko bhi pehle enable karke reset karta hai */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;
      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    this.isSpmLocked = false;
    this.form.patchValue({ ship }, { emitEvent: false });
  }

  /** Poore form ko equipment-specific payload se generic tarike se hydrate karta hai. */
  fillData(payload: any): void {
    if (!payload) return;

    Object.keys(payload).forEach((key) => {
      // if (key === 'authority_doc' || key === 'ship') return;   // ye alag se handle honge
      if (
        key === 'authority_doc' ||
        key === 'ship' ||
        key === 'kitti_doc' ||
        key === 'lab_doc'
      )
        return;

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

    this.form
      .get('kitti_doc')
      ?.setValue(this.buildFileUploadValue(payload.kitti_doc), {
        emitEvent: false,
      });
    this.form
      .get('lab_doc')
      ?.setValue(this.buildFileUploadValue(payload.lab_doc), {
        emitEvent: false,
      });

    // Conditional-lock wale fields ka disabled state bhi restore karo
    // (kyunki humne emitEvent:false rakha hai, valueChanges listeners trigger nahi honge)
    if (payload.cover_condition_status === 'Nil')
      this.form.get('cover_condition_remark')?.disable({ emitEvent: false });
    if (payload.slats_status === 'Nil')
      this.form.get('slats_remark')?.disable({ emitEvent: false });
    if (payload.hood_status === 'Nil')
      this.form.get('hood_remark')?.disable({ emitEvent: false });
    if (payload.bottom_bar_status === 'Nil')
      this.form.get('bottom_bar_remark')?.disable({ emitEvent: false });
    if (payload.rubber_status === 'Nil')
      this.form.get('rubber_remark')?.disable({ emitEvent: false });
    if (payload.neoprene_status === 'Nil')
      this.form.get('neoprene_remark')?.disable({ emitEvent: false });
    if (payload.limit_status === 'Nil')
      this.form.get('limit_remark')?.disable({ emitEvent: false });
    if (payload.gearbox_seal_status === 'Nil')
      this.form.get('gearbox_seal_remark')?.disable({ emitEvent: false });
    if (payload.manual_status === 'Nil')
      this.form.get('manual_remark')?.disable({ emitEvent: false });
    if (payload.pneumatic_status === 'Nil')
      this.form.get('pneumatic_remark')?.disable({ emitEvent: false });
    if (payload.electrical_status === 'Nil')
      this.form.get('electrical_remark')?.disable({ emitEvent: false });

    if (
      payload.compressor_value !== undefined &&
      payload.compressor_value !== ''
    ) {
      this.form.get('compressor_remark')?.disable({ emitEvent: false });
    }
    if (payload.oil_level_cbpm) {
      this.form.get('oil_level_cbpm_remark')?.disable({ emitEvent: false });
    }
    if (payload.spm_value !== undefined && payload.spm_value !== '') {
      this.isSpmLocked = true;
      this.form.get('spm_status')?.disable({ emitEvent: false });
      this.form.get('spm_remark')?.disable({ emitEvent: false });
    }
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
