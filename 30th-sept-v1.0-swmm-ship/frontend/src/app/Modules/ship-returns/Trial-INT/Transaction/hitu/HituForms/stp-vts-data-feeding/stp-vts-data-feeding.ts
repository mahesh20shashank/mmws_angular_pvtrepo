import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { DuctCalculatorDialogComponent } from '../../../../ui/duct-calculator-dialog/duct-calculator-dialog.component';
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import { FormInputTableWithHeaders } from '../../../../ui/form-input-table-with-headers/form-input-table-with-headers.component';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ParameterCardComponent } from '../../../../ui/parameter-card/parameter-card.component';
import { ReusableDeleteDialogDynamicContent } from '../../../../ui/reusable-delete-dialog-dynamic-content/reusable-delete-dialog-dynamic-content';
import { ToastComponent } from '../../../../ui/toast/toast.component';
import { CalenderComponent } from '../../../../ui/calender.component';
import {
  FileUploadComponent,
  UploadedFileItem,
} from '../../../../ui/file-upload/file-upload.component';
import { InputComponent } from '../../../../ui/input.component';
import { SelectWithSearchComponent } from '../../../../ui/select-with-search/select-with-search-box.component';
import { SelectComponent } from '../../../../ui/select.component';
import { ApiService } from '../../../../api.service';
import { RadioGroupComponent } from '../../../../ui/radio-group/radio-group.component';
import { Apiendpoints } from '../../../../ApiEndPoints';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastService } from '../../../../services/toast.service';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-stp-vts-data-feeding',
  standalone: true,
  templateUrl: './stp-vts-data-feeding.html',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    SelectComponent,
    CalenderComponent,
    InputComponent,
    ParameterCardComponent,
    FileUploadComponent,
    ApprovalWorkFlow,
  ],
})
export class STPVTSDataFeeding implements OnInit {
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

  readonly restartIcon = 'rotate-ccw';
  form!: FormGroup;
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;

  occasionOptions = [
    { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
    { label: 'End of Refit Trials', value: 'End of Refit Trials' },
    { label: 'Surprise Checks', value: 'Surprise Checks' },
    { label: 'HVAC Audit', value: 'HVAC Audit' },
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
    this.loadClasses();
    this.listenToClassChanges();
    this.loadLocation();
    this.loadTrialPrefillFromQuery();
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
      pressure_test_certificate: [''],
      manufacturer_name: [{ value: '', disabled: true }],
      model: [{ value: '', disabled: true }],
      remote_eh: [''],
      remote_eh_remark: [''],
      remote_switch: [''],

      remote_switch_remark: [''],
      remote_indicator: [''],

      remote_indicator_remark: [''],
      local_eh: [''],

      local_eh_remark: [''],
      watertight: [''],

      watertight_remark: [''],
      locking: [''],

      locking_remark: [''],
      local_switch: [''],

      local_switch_remark: [''],
      local_indicator: [''],

      local_indicator_remark: [''],
      level_sensor_ops: [''],

      level_sensor_remark: [''],
      onega_alarm_ops: [''],

      onega_alarm_remark: [''],
      fixed_h2s_date: [''],
      fixed_h2s_remark: [''],
      portable_h2s_date: [''],
      portable_h2s_extra: [''],
      portable_h2s_remark: [''],
      glass_check: [''],

      glass_remark: [''],
      logbook: [''],

      logbook_remark: [''],
      motor_value: [''],
      macerator_value: [{ value: '', disabled: true }],
      spm_value: [''],
      spm_remark: [''],
      tank_alarm: [''],

      tank_alarm_remark: [''],
      pressure_gauge: [''],

      pressure_gauge_remark: [''],
      ventilation: [''],

      ventilation_remark: [''],
      forced_ventilation: [''],

      forced_ventilation_remark: [''],
      exhaust_ventilation: [''],

      exhaust_ventilation_remark: [''],
      foundation_condition: [''],
      foundation_extra: [''],
      foundation_remark: [''],
      pressure_test_date: [''],
      pressure_test_remark: [''],
      bod_value: [''],
      BOD_remark: [''],
      tss_value: [''],
      fecal_value: [''],
      effluent_date: [''],
      effluent_remark: [''],
      isppc_date: [''],
      isppc_remark: [''],
      other_obs_extra: [''],
      overall: [''],
    });
  }

  onNumberChange(fieldKey: string, remarkKey: string, threshold: number) {
    const rawValue = this.form.get(fieldKey)?.value;

    // ✅ Handle empty / null / undefined
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      this.form.get(remarkKey)?.patchValue('');
      return;
    }

    const value = Number(rawValue);

    // ✅ Extra safety
    if (isNaN(value)) {
      this.form.get(remarkKey)?.patchValue('');
      return;
    }

    const remark = value >= threshold ? 'SAT' : 'UNSAT';

    this.form.get(remarkKey)?.patchValue(remark);
  }

  checkCombinedWaterQuality() {
    const bod = Number(this.form.get('bod_value')?.value);
    const tss = Number(this.form.get('tss_value')?.value);
    const fecal = Number(this.form.get('fecal_value')?.value);

    if (!bod || !tss || !fecal) {
      return;
    }

    const isSat = bod <= 50 && tss <= 100 && fecal <= 250;

    const finalRemark = isSat ? 'SAT' : 'UNSAT';

    this.form.get('BOD_remark')?.patchValue(finalRemark);
  }

  onRadioChange(value: string, remarkKey: string) {
    const mapping: Record<string, string> = {
      yes: 'UNSAT',
      no: 'SAT',
      ops: 'SAT',
      non_ops: 'UNSAT',
    };

    const remark = mapping[value] ?? '';

    const control = this.form.get(remarkKey);

    control?.patchValue(remark); // set SAT/UNSAT automatically
    control?.disable();
  }

  onSpmChange(value: string | Event) {
    value = value instanceof Event
      ? ((value.target as HTMLSelectElement | null)?.value ?? '')
      : value;
    const mapping: Record<string, string> = {
      NA: 'NA',
      Green: 'SAT',
      Yellow: 'SAT_WITH_OBS',
      Red: 'UNSAT',
    };

    const remark = mapping[value as keyof typeof mapping] ?? '';

    this.form.get('spm_remark')?.patchValue(remark);
  }

  radioOptions = [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ];

  radioOptions1 = [
    { label: 'Ops', value: 'ops' },
    { label: 'Non Ops', value: 'non_ops' },
  ];

  handleFile(file: File | null) {
    console.log('Selected file:', file);
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
    const formDataValues = this.form.getRawValue();

    const payload: any = {
      ...formDataValues,
      authority_doc: FileUrlUtil.getFileUrl(formDataValues.authority_doc?.id),
    };

    return payload;
  }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
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

  /* ---------------- FINAL SAVE ---------------- */

  // this.apiService.post(Apiendpoints.WATER_TIGHT_DOOR, payload).subscribe({
  //   next: (res: any) => {
  //     this.toast.showSuccess(res?.message || 'Saved successfully');
  //   },
  //   error: (err) => {
  //     console.error(err);
  //     this.toast.showError('Save failed');
  //   },
  //   complete: () => {
  //     this.loading = false;
  //   }
  // });

  handleFilesUploaded(files: UploadedFileItem[]): void {
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
      this.applyEquipmentDefaults(this.activeTab);
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Trial prefill failed (STP VTS Data Feeding)', e);
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
        'Failed to load STP VTS data for selected equipment',
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

    const isFlat =
      'make' in jsonData ||
      'date_of_conduct_trail' in jsonData ||
      'remote_eh' in jsonData;
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
   *  radio-driven auto-locked remark fields ko bhi pehle enable karke reset karta hai */
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
   *  aur radio-button-driven remark fields ka disabled state bhi restore karta hai
   *  (kyunki onRadioChange() sirf live-click ke time chalta hai, prefill ke time nahi). */
  fillData(payload: any): void {
    if (!payload) return;

    const specialKeys = ['authority_doc', 'pressure_test_certificate', 'ship'];

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

    // Serial 20 — pressure_test_certificate bhi file-upload hai
    this.form
      .get('pressure_test_certificate')
      ?.setValue(this.buildFileUploadValue(payload.pressure_test_certificate), {
        emitEvent: false,
      });

    // ---- Radio-driven remark controls — hamesha locked hote hain jab bhi radio select ho ----
    // onRadioChange() ye pattern follow karta hai: yes→UNSAT, no→SAT, ops→SAT, non_ops→UNSAT — remark disable()
    const radioDrivenPairs: [string, string][] = [
      ['remote_eh', 'remote_eh_remark'],
      ['remote_switch', 'remote_switch_remark'],
      ['remote_indicator', 'remote_indicator_remark'],
      ['local_eh', 'local_eh_remark'],
      ['watertight', 'watertight_remark'],
      ['locking', 'locking_remark'],
      ['local_switch', 'local_switch_remark'],
      ['local_indicator', 'local_indicator_remark'],
      ['level_sensor_ops', 'level_sensor_remark'],
      ['onega_alarm_ops', 'onega_alarm_remark'],
      ['tank_alarm', 'tank_alarm_remark'],
    ];

    radioDrivenPairs.forEach(([radioField, remarkField]) => {
      if (payload[radioField]) {
        this.form.get(remarkField)?.disable({ emitEvent: false });
      }
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
