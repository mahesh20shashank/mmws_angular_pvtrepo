import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnInit,
  Output,
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
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
import { YearCalendarComponent } from '../../../../ui/year-calender/year-calendar.component';
import {
  FileUploadComponent,
  UploadedFileItem,
} from '../../../../ui/file-upload/file-upload.component';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-air-pressure-hose-test',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    SelectComponent,
    CalenderComponent,
    InputComponent,
    FileUploadComponent,
    ApprovalWorkFlow,
    ParameterCardComponent,
  ],
  templateUrl: './air-pressure-hose-test.html',
})
export class AirPressureHoseTest {
  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  readonly restartIcon = 'rotate-ccw';

  bdcForm!: FormGroup;
  loading = false;

  occasionOfConduct: any[] = [];
  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  yearOfManufactureOptions: any[] = [];
  commandOptions: any[] = [];
  stbdOptions: any[] = [];
  ocationofconduct: any[] = [];
  clusterOptions: any[] = [];
  placesOptions: any[] = [];

  showApprovalWorkflowPopup = false;
  isSubmitTime = false;

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

  typeOfTestOptions = [
    { label: 'Air Pressure ', value: 'air_pressure' },
    { label: 'Hose Test', value: 'hose_test' },
  ];

  occasionOptions = [
    { label: 'Pre Refit Trials', value: 'pre_refit_trials' },
    { label: 'End of Refit Trials', value: 'end_of_refit_trials' },
    { label: 'Surprice Checks', value: 'surprice_checks' },
    { label: 'As per APT cycle', value: 'as_per_apt_cycle' },
  ];

  selectedFile: File | null = null;
  fileName: string = 'No file chosen';

  @Output() fileSelected = new EventEmitter<File | null>();
  statusOptions: any;
  dropOfPressureObservationOptions: any;

  onFileChange(event: any) {
    const file = event.target.files[0];

    if (file) {
      this.selectedFile = file;
      this.fileName = file.name;
      this.fileSelected.emit(file);
    }
  }
  removeFile() {
    this.selectedFile = null;
    this.fileName = 'No file chosen';
    this.fileSelected.emit(null);
  }

  constructor(
    private fb: FormBuilder,
    public formApiService: FormApiService,
    private router: Router,
    private toast: ToastService,
    private apiService: ApiService,
    private toastService: ToastService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.bdcForm = this.fb.group({});
    this.buildForm();
    this.loadDropdowns();
    this.loadPlaceOfConductTrail();

    this.ocationofconduct = [
      { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
      { label: 'End of Refit Trials', value: 'End of Refit Trials' },
      { label: 'Surprise Checks', value: 'Surprise Checks' },
    ];

    this.statusOptions = [
      { label: 'SAT', value: 'satisfactory' },
      { label: 'UNSAT', value: 'unsatisfactory' },
      { label: 'SAT with TY blanking', value: 'sat_with _ty_blanking' },
    ];

    this.dropOfPressureObservationOptions = [
      {
        label: 'Counting number will open from 0 to 1000 and NA',
        value: 'counting_number',
      },
      { label: 'For machinery Compartmen', value: 'machinery_compartment' },
    ];

    this.loadTrialPrefillFromQuery();
  }

  buildForm() {
    this.bdcForm = this.fb.group({
      // Header Fields
      port: [''],
      class_of_ship: [''],
      ship: [{ value: '', disabled: false }],
      date_of_inspection: [''],
      place_of_conduct_of_trials: [''],
      occasion_for_conduct_of_trials: [''],
      authority_for_conduct_of_trials: [''],
      authority_date: [''],
      dop_observation: [''],
      dop_remarks: [''],
      date_of_conduct_trail: [''],
      place_of_conduct_trail: [''],
      occasion_of_conduct_trail: [''],
      authority: [''],
      authority_doc: [''],

      dop_machinery_input: [''],

      // Table fields
      type_of_test: [''],
      reference_document: [''],
      cluster_no: [''],
      compartments: [''],
      frame_station: [''],
      itp_location: [''],
      test_pressure: [''],
      last_test_date: [''],
      fwd: [''],
      aft: [''],
      above: [''],
      below: [''],
      stbd: [''],
      date_of_test: [''],
      dop_type: [''],
      preparation: [''],
      ty_blanking: [''],
      ty_blanking_item_1: [''],
      ty_blanking_item_2: [''],
      ty_blanking_item_3: [''],
      ty_blanking_item_4: [''],
      ty_blanking_item_5: [''],
      ty_blanking_item_6: [''],
      ty_blanking_item_7: [''],
      ty_blanking_item_8: [''],
      ty_blanking_item_9: [''],
      ty_blanking_item_10: [''],
      observations: this.fb.array([this.fb.control('')]),
      recommendations: [''],
      overall_status: [''],
    });
  }

  // ── Serial 14: Observations FormArray ─────────────────────────────────────
  get observationsArray(): FormArray {
    return this.bdcForm.get('observations') as FormArray;
  }

  addObservation(): void {
    this.observationsArray.push(this.fb.control(''));
  }

  removeObservation(index: number): void {
    if (this.observationsArray.length > 1) {
      this.observationsArray.removeAt(index);
    }
  }

  /** Returns the validated count (1-10) from the ty_blanking field */
  getTyBlankingCount(): number {
    const val = Number(this.bdcForm.get('ty_blanking')?.value);
    if (!val || isNaN(val) || val < 1) return 0;
    return Math.min(Math.floor(val), 10);
  }

  /** Returns an array of indices used to drive *ngFor for dynamic inputs */
  getTyBlankingInputsArray(): number[] {
    return Array.from({ length: this.getTyBlankingCount() }, (_, i) => i);
  }

  validateForm(): boolean {
    if (this.bdcForm.invalid) {
      this.bdcForm.markAllAsTouched();
      this.toastService.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  buildPayload() {
    const formDataValues = this.bdcForm.value;

    const payload: any = {
      ...formDataValues,
      authority_doc: FileUrlUtil.getFileUrl(formDataValues.authority_doc?.id),
    };

    return payload;
  }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      this.bdcForm.reset();
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
            this.showApprovalWorkflowPopup = true;
            this.isSubmitTime = true;
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

  private loadDropdowns(): void {
    this.loadOptions('master/ship-classes/', 'classOfShipOptions', []);
    this.loadOptions('master/ships/', 'shipOptions', []);
    this.loadOptions('master/clusters/', 'clusterOptions', []);
  }
  private loadOptions(
    endpoint: string,
    target: keyof AirPressureHoseTest,
    fallback: any[],
  ): void {
    (this[target] as any) = fallback;
    this.apiService
      .getDropdownData(endpoint, { labelKey: 'name', valueKey: 'id' })
      .subscribe({
        next: (res: any[]) => {
          if (res?.length) {
            (this[target] as any) = res;
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

      this.bdcForm.patchValue(
        { ship: trialRow.ship_name },
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
      console.error('Trial prefill failed (Air Pressure/Hose Test)', e);
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
        'Failed to load Air Pressure/Hose Test data for selected equipment',
        error,
      );
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'type_of_test' in jsonData ||
      'date_of_conduct_trail' in jsonData ||
      'cluster_no' in jsonData;
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

  /** Tab switch pe form reset — ship field ko preserve karke,
   *  observations FormArray ko bhi ek empty row pe wapas laata hai */
  private resetFormData(): void {
    const ship = this.bdcForm.get('ship')?.value;

    Object.keys(this.bdcForm.controls).forEach((key) => {
      const control = this.bdcForm.get(key);
      if (!control || key === 'observations') return;
      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    // observations FormArray — ek khaali row pe reset
    this.observationsArray.clear();
    this.observationsArray.push(this.fb.control(''));

    this.bdcForm.patchValue({ ship }, { emitEvent: false });
  }

  /** Poore form ko equipment-specific payload se hydrate karta hai —
   *  saath hi observations FormArray, ty_blanking dynamic fields aur
   *  dono file-upload controls (authority_doc, reference_document) ko
   *  special handling deta hai. */
  fillData(payload: any): void {
    if (!payload) return;

    const specialKeys = [
      'authority_doc',
      'reference_document',
      'ship',
      'observations',
    ];

    Object.keys(payload).forEach((key) => {
      if (specialKeys.includes(key)) return;

      const control = this.bdcForm.get(key);
      if (control) {
        control.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });

    // ship — fallback trialRow.ship_name se agar equipment payload mein khaali ho
    this.bdcForm
      .get('ship')
      ?.setValue(payload.ship || this.bdcForm.get('ship')?.value || '', {
        emitEvent: false,
      });

    // Dono file-upload fields — URL string ko required object shape mein convert karo
    this.bdcForm
      .get('authority_doc')
      ?.setValue(this.buildFileUploadValue(payload.authority_doc), {
        emitEvent: false,
      });
    this.bdcForm
      .get('reference_document')
      ?.setValue(this.buildFileUploadValue(payload.reference_document), {
        emitEvent: false,
      });

    // Serial 14 — Observations FormArray: saved array ke hisaab se rows banao
    this.patchObservations(payload.observations);

    // Serial 13 — Ty Blanking: 'ty_blanking' (count) aur uske dynamic
    // ty_blanking_item_1..10 fields already generic loop se patch ho chuke hain
    // (ye plain flat controls hain, FormArray nahi). Bas UI ko count ke hisaab
    // se render karne ke liye change detection trigger karna zaroori hai.
    // fillData() ke baad caller already this.cdr.detectChanges() call karta hai.
  }

  /** Observations ko FormArray mein hydrate karta hai — saved data ke jitne
   *  bhi rows hain utne hi controls banata hai (kam se kam 1 empty row). */
  private patchObservations(observations: any): void {
    const values =
      Array.isArray(observations) && observations.length ? observations : [''];

    this.observationsArray.clear();
    values.forEach((val: any) => {
      this.observationsArray.push(this.fb.control(val ?? ''));
    });
  }

  /** Backend se aayi file-URL string (authority_doc / reference_document)
   *  ko FileUploadComponent ke required { id, name, file_path } shape mein
   *  convert karta hai */
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
