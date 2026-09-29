import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import {
  ReactiveFormsModule,
  FormGroup,
  FormBuilder,
  FormArray,
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
import { DynamicTextarea } from '../../../../ui/dynamic-textarea/dynamic-textarea';
import { DynamicSelectTextarea } from '../../../../ui/dynamic-select-textarea/dynamic-select-textarea';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastService } from '../../../../services/toast.service';
import { Apiendpoints } from '../../../../ApiEndPoints';
import { MultiSelectDropdownComponent } from '../../../../ui/multiselect';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-structural-helo-hanger',
  standalone: true,
  templateUrl: './structural-helo-hanger.html',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    SelectComponent,
    CalenderComponent,
    InputComponent,
    LoadingButtonComponent,
    ParameterCardComponent,
    FileUploadComponent,
    DynamicTextarea,
    ApprovalWorkFlow,
    MultiSelectDropdownComponent,
  ],
})
export class StructuralHeloHanger {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
  loading = false;

  readonly restartIcon = 'rotate-ccw';

  selectedShipId: number = 0;
  draftLoading = false;
  saveLoading = false;
  submitLoading = false;
  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';
  form!: FormGroup;
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;
  uploadedAuthorityFiles: UploadedFileItem[] = [];
  uploadedLashingLoadTestCertificateFiles: UploadedFileItem[] = [];
  uploadedHeloLoadTestCertificateFiles: UploadedFileItem[] = [];

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

  /** Simple string-array FormArrays — inhe generic loop se skip karke alag handle karte hain */
  private readonly stringArrayFields = [
    'deck_head',
    'bulkhead',
    'hangar_top',
    'deck_dadoes',
    'other_observations',
    'paint_condition',
    'visual_inspection',
    'defects_extra',
    'defects_obs',
  ];

  placesOptions: any[] = [];
  reps_present_options: any[] = [];
  usersList: any[] = [];
  occasionOptions = [
    { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
    { label: 'End of Refit Trials', value: 'End of Refit Trials' },
    { label: 'Surprise Checks', value: 'Surprise Checks' },
    { label: 'HVAC Audit', value: 'HVAC Audit' },
  ];

  naApplicableOptions = [
    { label: 'NA', value: 'NA' },
    { label: 'Applicable', value: 'Applicable' },
  ];

  opsStatusOptions = [
    { label: 'Ops', value: 'ops' },
    { label: 'Non Ops', value: 'non_ops' },
  ];

  yesNoOptions = [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ];

  harpoonGridStatusOptions = [
    { label: 'NA', value: 'NA' },
    { label: 'Fitted', value: 'Fitted' },
    { label: 'Not Fitted', value: 'Not Fitted' },
  ];

  paintSchemeOptions = [
    { label: 'M/s Akzonobel', value: 'akzonobel' },
    { label: 'M/s Jotun', value: 'jotun' },
    { label: 'M/s Sigma / PPG', value: 'sigma' },
  ];

  hangarStatusOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];
  overAllOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
    { label: 'SAT with observation', value: 'sat_with_observation' },
  ];

  makeCmmsOptions: any[] = [];
  modelCmmsOptions: any[] = [];

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
    this.loadPlaceOfConductTrail();

    // When reps_present changes, fetch users of that type
    this.form.get('reps_present')?.valueChanges.subscribe((userType) => {
      if (userType) {
        this.getUsersByType(userType);
      }
      console.log('Reps present data', this.form.get('reps_present')?.value);
    });

    this.loadTrialPrefillFromQuery();
  }

  buildForm() {
    this.form = this.fb.group({
      classOfShip: [''],
      ship: [''],
      date_of_conduct_trail: [''],
      place_of_conduct_trail: [''],
      document_no: [''],
      occasion_of_conduct_trail: [''],
      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],
      lashing_load_test_certificate: [''],
      helo_load_test_certificate: [''],
      make_cmms: [''],
      reps_present: [''],

      reps_present_user: [[]],
      reps_present_other_user: [''],

      model_cmms: [''],
      normal_mode: [''],
      manual_mode: [''],
      manual_mode_status: [''],
      manual_mode_2: [''],
      manual_mode_status_2: [''],
      normal_mode_status: [''],
      emergency_mode: [''],
      emergency_mode_1: [''],
      emergency_mode_status: [''],
      defects: [''],
      final_remark: [''],
      paint_final_sel_remark: [''],
      helo_deck_remark: [''],
      overall_sel_remark: [''],
      helo_make_cmms: [''],
      helo_model_cmms: [''],
      normal_mode_1: [''],
      normal_mode_status_1: [''],
      emergency_mode_status_1: [''],
      port_test: [''],
      port_date: [''],
      stbd_test: [''],
      stbd_date: [''],
      final_remark_1: [''],
      load_test_date: [''],
      load_test_qty: [''],
      helo_qty: [''],
      helo_load_date: [''],
      harpoon_grid_status: [''],
      harpoon_grid_ops: [''],
      helo_lifts_turntable_status: [''],
      helo_lifts_turntable_ops: [''],
      helo_lifts_turntable_remark: [''],
      paint_scheme: [''],
      paint_renewed_date: [''],
      friction_test_date: [''],
      paint_final_remark: [''],
      helo_deck: [''],
      hangar_mode: [''],
      hangar_status: [''],
      overall_remark: [''],
      deck_head: this.fb.array([this.fb.control('')]),
      bulkhead: this.fb.array([this.fb.control('')]),
      hangar_top: this.fb.array([this.fb.control('')]),
      deck_dadoes: this.fb.array([this.fb.control('')]),
      other_observations: this.fb.array([this.fb.control('')]),
      paint_condition: this.fb.array([this.fb.control('')]),
      visual_inspection: this.fb.array([this.fb.control('')]),
      defects_extra: this.fb.array([this.fb.control('')]),
      defects_obs: this.fb.array([this.fb.control('')]),
      load_tests: this.fb.array([this.createLoadTest()]),
    });
  }

  createLoadTest() {
    return this.fb.group({
      load_test_date: [''],
      load_test_qty: [''],
    });
  }

  get loadTests() {
    return this.form.get('load_tests') as FormArray;
  }

  addLoadTest() {
    this.loadTests.push(this.createLoadTest());
  }

  removeLoadTest(index: number) {
    this.loadTests.removeAt(index);
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }

  handleLashingLoadTestCertificateUploaded(files: UploadedFileItem[]): void {
    this.uploadedLashingLoadTestCertificateFiles = files;
  }

  handleHeloLoadTestCertificateUploaded(files: UploadedFileItem[]): void {
    this.uploadedHeloLoadTestCertificateFiles = files;
  }

  handleFile(file: File | null, _docType?: string) {
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
      lashing_load_test_certificate: FileUrlUtil.getFileUrl(
        formDataValues.lashing_load_test_certificate?.id,
      ),
      helo_load_test_certificate: FileUrlUtil.getFileUrl(
        formDataValues.helo_load_test_certificate?.id,
      ),
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
      console.error('Trial prefill failed (Structural Helo Hangar)', e);
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
        'Failed to load Structural Helo Hangar data for selected equipment',
        error,
      );
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'date_of_conduct_trail' in jsonData ||
      'make_cmms' in jsonData ||
      'harpoon_grid_status' in jsonData;
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
   *  saare string-array FormArrays aur load_tests bhi ek default row pe wapas laata hai */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;

      if (control instanceof FormArray) return; // FormArrays alag handle honge

      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    // String-array FormArrays — ek khaali control pe reset
    this.stringArrayFields.forEach((field) => {
      const arr = this.form.get(field) as FormArray;
      arr.clear();
      arr.push(this.fb.control(''));
    });

    // load_tests — ek default row pe reset
    this.loadTests.clear();
    this.loadTests.push(this.createLoadTest());

    this.form.patchValue({ ship }, { emitEvent: false });
  }

  /** Poore form ko equipment-specific payload se hydrate karta hai — string-array
   *  FormArrays, load_tests FormArray, aur dono file-upload fields ko special
   *  handling deta hai. */
  fillData(payload: any): void {
    if (!payload) return;

    const specialKeys = [
      'authority_doc',
      'lashing_load_test_certificate',
      'helo_load_test_certificate',
      'ship',
      'load_tests',
      ...this.stringArrayFields,
    ];

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

    // Teeno file-upload fields — URL string ko required object shape mein convert karo
    this.form
      .get('authority_doc')
      ?.setValue(this.buildFileUploadValue(payload.authority_doc), {
        emitEvent: false,
      });
    this.form
      .get('lashing_load_test_certificate')
      ?.setValue(
        this.buildFileUploadValue(payload.lashing_load_test_certificate),
        { emitEvent: false },
      );
    this.form
      .get('helo_load_test_certificate')
      ?.setValue(
        this.buildFileUploadValue(payload.helo_load_test_certificate),
        { emitEvent: false },
      );

    // Saare string-array FormArrays (deck_head, bulkhead, hangar_top, deck_dadoes,
    // other_observations, paint_condition, visual_inspection, defects_extra, defects_obs)
    // — jitne bhi saved values hain utne hi controls banao ("add" button se jitni
    // rows user ne banayi thi, prefill ke time bhi utni hi rows banengi)
    this.stringArrayFields.forEach((field) => {
      this.patchStringArray(field, payload[field]);
    });

    // load_tests — array of {load_test_date, load_test_qty}
    this.patchLoadTests(payload.load_tests);
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

  /** load_tests FormArray ko saved rows ke hisaab se hydrate karta hai */
  private patchLoadTests(values: any): void {
    const list = Array.isArray(values) && values.length ? values : null;

    this.loadTests.clear();

    if (!list) {
      this.loadTests.push(this.createLoadTest());
      return;
    }

    list.forEach((row: any) => {
      const fg = this.createLoadTest();
      fg.patchValue(
        {
          load_test_date: row?.load_test_date ?? '',
          load_test_qty: row?.load_test_qty ?? '',
        },
        { emitEvent: false },
      );
      this.loadTests.push(fg);
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
