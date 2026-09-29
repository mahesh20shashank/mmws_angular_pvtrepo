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
import { FileUploadComponent } from '../../../../ui/file-upload/file-upload.component';
import { InputComponent } from '../../../../ui/input.component';
import { SelectWithSearchComponent } from '../../../../ui/select-with-search/select-with-search-box.component';
import { SelectComponent } from '../../../../ui/select.component';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';
import { UploadedFileItem } from '../../../../ui/file-upload/file-upload.component';
import { FileUrlUtil } from '../../../../file-url-util';

@Component({
  selector: 'app-tow-worthiness',
  standalone: true,
  templateUrl: './tow-worthiness.html',
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
    DynamicTextarea,
  ],
})
export class TowWorthiness {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
  loading = false;

  readonly restartIcon = 'rotate-ccw';
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

  chalkOptions = [
    { label: 'WT / GT Door', value: 'door' },
    { label: 'WT Hatches', value: 'hatch' },
    { label: 'EEH/EES', value: 'eeh' },
    { label: 'Port Holes/ Scuttles', value: 'port' },
  ];

  nilObservationOptions = [
    { label: 'Nil', value: 'nil' },
    { label: 'Observation', value: 'observation' },
  ];

  // this should come from API (Masters)
  locationOption = [
    { label: 'Fwd', value: 'fwd' },
    { label: 'Aft', value: 'aft' },
    { label: 'Hull', value: 'hull' },
  ];

  placesOptions: any[] = [];

  uploadedAuthorityFiles: UploadedFileItem[] = [];

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

  /** Saare dynamic-textarea FormArrays — generic loop se skip karke alag handle honge */
  private readonly stringArrayFields = [
    'internal_compartments',
    'external_compartments',
    'towing_arrangements',
    'weather_deck',
    'loose_items',
    'tank_manhole',
    'stability_data',
  ];

  constructor(
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private toastService: ToastService,
    private toast: ToastService,
    public formApiService: FormApiService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadPlaceOfConductTrail();
    this.loadTrialPrefillFromQuery();
  }

  buildForm() {
    this.form = this.fb.group({
      submarine: [''],
      date_of_conduct_trail: [''],
      place_of_conduct_trail: [''],
      authority: [''],
      authority_date: [''],
      auth_doc: [],
      visual_inspection: [''],
      chalk_test_type: [''],
      chalk_test_obs: [''],
      towing_qty: [''],
      weather_qty: [''],
      vacuum_test_date: [''],
      casing_area: [''],
      fax_no: [''],
      fax_date: [''],
      submarine_name: [''],
      casing_location: [''],
      casing_status: [''],
      casing_obs: [''],
      internal_status: [''],
      internal_obs: [''],
      external_status: [''],
      external_obs: [''],
      internal_compartments: this.fb.array([this.fb.control('')]),
      external_compartments: this.fb.array([this.fb.control('')]),
      towing_arrangements: this.fb.array([this.fb.control('')]),
      weather_deck: this.fb.array([this.fb.control('')]),
      loose_items: this.fb.array([this.fb.control('')]),
      tank_manhole: this.fb.array([this.fb.control('')]),
      stability_data: this.fb.array([this.fb.control('')]),
    });
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

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError('Please fill all required fields.');
      return false;
    }
    return true;
  }

  //   handleSave(type: 'draft' | 'save') {
  //     const value = this.form.value;
  //     console.log("value->>>>>>>>>>>>>>>",value);
  //     return;
  //     const payload = value

  //     if (type === 'draft') {
  //         this.saveDraft(payload);
  //         return;
  //     }
  //     this.submitFinalForm(payload);
  // }
  buildPayload() {
    const value = this.form.value;
    const formDataValues = this.form.getRawValue();

    const payload: any = {
      ...value,
      internal_compartments: formDataValues.internal_compartments,
      external_compartments: formDataValues.external_compartments,
      towing_arrangements: formDataValues.towing_arrangements,
      weather_deck: formDataValues.weather_deck,
      loose_items: formDataValues.loose_items,
      tank_manhole: formDataValues.tank_manhole,
      stability_data: formDataValues.stability_data,
      auth_doc: FileUrlUtil.getFileUrl(formDataValues.auth_doc?.id),
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

      this.form.patchValue(
        { submarine: trialRow.ship_name },
        { emitEvent: false },
      );

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
      console.error('Trial prefill failed (Tow Worthiness Submarine)', e);
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
        'Failed to load Tow Worthiness Submarine data for selected equipment',
        error,
      );
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'submarine' in jsonData ||
      'date_of_conduct_trail' in jsonData ||
      'casing_status' in jsonData;
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

  /** Tab switch pe form + saare FormArrays reset — submarine field preserve karke */
  private resetFormData(): void {
    const submarine = this.form.get('submarine')?.value;

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

    this.form.patchValue({ submarine }, { emitEvent: false });
  }

  /** Poore form ko equipment-specific payload se hydrate karta hai.
   *  Is form mein koi valueChanges subscription nahi hai (handleObservation
   *  jaisi methods template ke (change) se wired hi nahi hain) — isliye ek
   *  hi generic pass kaafi hai */
  fillData(payload: any): void {
    if (!payload) return;

    const specialKeys = ['auth_doc', 'submarine', ...this.stringArrayFields];

    Object.keys(payload).forEach((key) => {
      if (specialKeys.includes(key)) return;
      const control = this.form.get(key);
      if (control) {
        control.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });

    // submarine — fallback trialRow.ship_name se agar equipment payload mein khaali ho
    this.form
      .get('submarine')
      ?.setValue(payload.submarine || this.form.get('submarine')?.value || '', {
        emitEvent: false,
      });

    // auth_doc — URL string ko file-upload component ke required shape mein convert karo
    this.form
      .get('auth_doc')
      ?.setValue(this.buildFileUploadValue(payload.auth_doc), {
        emitEvent: false,
      });

    // saare 7 dynamic-textarea FormArrays hydrate karo
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

  /** Backend se aayi auth_doc (plain URL string ya already-object) ko
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
