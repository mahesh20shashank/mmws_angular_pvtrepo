import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import {
  FormArray,
  FormBuilder,
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
import {
  FileUploadComponent,
  UploadedFileItem,
} from '../../../../ui/file-upload/file-upload.component';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-vkd-ras-winch',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    SelectComponent,
    CalenderComponent,
    MonthYearCalendarComponent,
    InputComponent,
    ApprovalWorkFlow,
  ],
  templateUrl: './vkd-ras-winch.html',
  styleUrl: './vkd-ras-winch.css',
})
export class VkdRasWinch {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;

  readonly restartIcon = 'rotate-ccw';
  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  form!: FormGroup;
  loading = false;

  uploadedAuthorityFiles: UploadedFileItem[] = [];

  commandOptions: any[] = [];
  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  placesOptions: any[] = [];

  occasionOptions = [
    { label: 'Pre Refit Trials', value: 'pre_refit_trials' },
    { label: 'End of Refit Trials', value: 'end_of_refit_trials' },
    { label: 'Surprice Checks', value: 'surprice_checks' },
  ];

  // PORT/ STBD
  stbdOptions = [
    { label: 'PORT', value: 'PORT' },
    { label: 'STBD', value: 'STBD' },
  ];

  noiseObserved = [
    { label: 'Nil', value: 'Nil' },
    { label: 'Noise Observed', value: 'Noise Observed' },
  ];

  OilLevelGauge = [
    { label: '40-100% filled', value: '40-100% filled' },
    { label: 'Less than 40% filled', value: 'Less than 40% filled' },
    { label: 'Empty', value: 'Empty' },
  ];

  SatUnsatOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  SatUnsatNAOptions = [
    { label: 'NA', value: 'NA' },
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  // Grease points: Charged → SAT | Painted/Choked/Missing → UNSAT | Others → dialog box
  fillingDrainPlugs = [
    { label: 'Charged', value: 'Charged' },
    { label: 'Painted', value: 'Painted' },
    { label: 'Choked', value: 'Choked' },
    { label: 'Missing', value: 'Missing' },
    { label: 'Others', value: 'Others' },
  ];

  ObservationsOptions = [
    { label: 'No Observation', value: 'NoObservation' },
    { label: 'Observation', value: 'Observation' },
  ];

  overallRemarksOptions = [
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

  yesNoOptions = [
    { label: 'Yes', value: 'Yes' },
    { label: 'No', value: 'No' },
  ];

  // Oil type options for Gear Box (Ser 8)
  gearBoxOilOptions = [
    { label: 'OC300', value: 'OC300' },
    { label: 'SS320', value: 'SS320' },
    { label: 'Servomesh SP 150', value: 'Servomesh SP 150' },
    { label: 'Others', value: 'Others' },
  ];

  montlyQuarterlyOption = [
    { label: 'Monthly', value: 'Monthly' },
    { label: 'Quarterly', value: 'Quarterly' },
  ];

  montlyQuarterlyNilOption = [
    { label: 'Monthly', value: 'Monthly' },
    { label: 'Quarterly', value: 'Quarterly' },
    { label: 'Nil', value: 'Nil' },
  ];
  loadTestOptions = [
    { label: 'Nil', value: 'Nil' },
    { label: 'Observed', value: 'Observed' },
  ];

  // SPM: NA (Motor fitted inside the Winch casing) | Green | Yellow | Red
  spmCheckOptions = [
    { label: 'NA (Motor fitted inside the Winch casing)', value: 'NA' },
    { label: 'Green', value: 'Green' },
    { label: 'Yellow', value: 'Yellow' },
    { label: 'Red', value: 'Red' },
  ];

  // Show/hide booleans for conditional fields
  showGearBoxInput = false; // Ser 3: Noise Observed → show dialog
  showVisualInspectionFields = false; // Ser 5: Observation → show sub-fields
  showOperationalTrialsInput = false; // Ser 6: UNSAT → show dialog
  showGreasePointsInput = false; // Ser 7: Others → show dialog
  showOilGearBoxOthersInput = false; // Ser 8: Others → show dialog

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
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private toastService: ToastService,
    private route: ActivatedRoute,
    private toast: ToastService,
    public formApiService: FormApiService,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadPlaceOfConductTrail();
    this.setupConditionalLogic();
    this.loadTrialPrefillFromQuery();

    if (this.rowId) {
      this.editMode = true;
      this.getEditDataByRowId(this.rowId);
    }
  }

  buildForm() {
    this.form = this.fb.group({
      // Header fields
      ship: ['', Validators.required],
      class_of_ship: [''],
      date_of_inspection: [''],
      place_of_conduct_trail: ['', Validators.required],
      occasion_of_conduct_trail: ['', Validators.required],
      date_of_conduct_trail: [''],
      authority: [''],
      authority_date: [''],
      load_test: [''],
      load_test_remark: [''],
      load_test_value: [''],

      // Ser 1 & 2
      type: [''],
      make: [''],
      manufacturer_name: [{ value: '', disabled: true }],

      // Ser 3: Condition of Gear Box
      condition_gear_box: [''],
      condition_gear_box_remark: [''],
      condition_gear_box_value: [''],

      // Ser 4: Condition of Motor (insulation > 10 M Ohms)
      condition_motor_value: [''],
      condition_motor_remark: [''],

      // Ser 5: Visual Inspection of structure/Equipment
      visual_inspection: [''],
      visual_inspection_remark: [''],
      visual_corrosion: [''],
      visual_pitting: [''],
      visual_unpainted: [''],
      visual_others: [''],

      // Ser 6: Operational Trials
      operational_trials: [''],
      operational_trials_value: [''],

      // Ser 7: Grease Points
      grease_points: [''],
      grease_points_remark: [''],
      grease_points_value: [''],

      // Ser 8: Oil being used in Gear Box
      oil_gear_box_type: [''],
      oil_gear_box_type_others: [''],
      oil_gear_box_value: [''],
      oil_gear_box_remark: [''],

      // Ser 9: Oil Level in Gear Box
      oil_level: [''],
      oil_level_remark: [''],

      // Ser 10: Lub oil analysis
      water_content_value: [''],
      Viscosity_value: [''],
      base_number_value: [''],
      acid_number_value: [''],
      metal_traces_value: [''],

      // Ser 11: Change of Oil
      lastDateOfOilChange: [''],
      lastOilChangeDate: [''],
      lastOilChangeDate_marks: [''],

      // Ser 12: Starting current
      starting_current_reference: [''],
      starting_current_measured: [''],
      starting_current_remarks: [''],

      // Ser 13: Running current
      running_current_reference: [''],
      running_current_measured: [''],
      running_current_remarks: [''],

      // Ser 14: Log book
      log_book_measured: [''],
      log_book_remarks: [''],

      // Ser 15: Periodicity
      periodicity_reference: [''],
      periodicity_measured: [''],
      periodicity_remarks: [''],

      // Ser 16: SPM Check
      spm_measured: [''],
      spm_remarks: [''],

      // Ser 17 & 18
      other_observation: [''],
      overall_remark: [''],
    });
  }
  showLoadTest: boolean = false;
  setupConditionalLogic() {
    // ---------------- Ser 3: Condition of Gear Box ----------------
    // Nil → SAT | Noise Observed → UNSAT + dialog box
    this.form.get('condition_gear_box')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('condition_gear_box_remark');
      const valueControl = this.form.get('condition_gear_box_value');

      this.showGearBoxInput = false;
      valueControl?.reset();

      if (value === 'Nil') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Noise Observed') {
        this.showGearBoxInput = true;
        remarkControl?.setValue('UNSAT');
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    //3

    this.form.get('load_test')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('load_test_remark');
      const valueControl = this.form.get('load_test_value');

      this.showLoadTest = false;
      valueControl?.reset();

      if (value === 'Nil') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
        valueControl?.reset(); // clear input
      } else if (value === 'Observed') {
        this.showLoadTest = true;
        remarkControl?.reset();
        remarkControl?.disable(); // clear dropdown
      }
    });

    // ---------------- Ser 4: Condition of Motor ----------------
    // > 10 M Ohms → SAT | < 10 M Ohms → UNSAT
    this.form.get('condition_motor_value')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('condition_motor_remark');
      const numericValue = Number(value);
      remarkControl?.disable();

      if (
        value === null ||
        value === undefined ||
        value === '' ||
        Number.isNaN(numericValue)
      ) {
        remarkControl?.setValue(null);
        remarkControl?.disable();
        return;
      }

      remarkControl?.setValue(numericValue >= 10 ? 'SAT' : 'UNSAT');
      remarkControl?.disable();
    });

    // ---------------- Ser 5: Visual Inspection ----------------
    // No Observation → SAT | Observation → show sub-fields (Corrosion/Pitting/Unpainted/Others dialog boxes)
    this.form.get('visual_inspection')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('visual_inspection_remark');

      this.showVisualInspectionFields = false;

      this.form.get('visual_corrosion')?.reset();
      this.form.get('visual_pitting')?.reset();
      this.form.get('visual_unpainted')?.reset();
      this.form.get('visual_others')?.reset();

      if (value === 'NoObservation' || value === 'No Observation') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Observation') {
        this.showVisualInspectionFields = true;
        remarkControl?.setValue(null);
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // ---------------- Ser 6: Operational Trials ----------------
    // UNSAT → dialog box will appear
    this.form.get('operational_trials')?.valueChanges.subscribe((value) => {
      const valueControl = this.form.get('operational_trials_value');

      this.showOperationalTrialsInput = false;
      valueControl?.reset();

      if (value === 'UNSAT') {
        this.showOperationalTrialsInput = true;
      }
    });

    // ---------------- Ser 7: Grease Points ----------------
    // Charged → SAT | Painted/Choked/Missing → UNSAT | Others → dialog box
    this.form.get('grease_points')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('grease_points_remark');
      const valueControl = this.form.get('grease_points_value');

      this.showGreasePointsInput = false;
      valueControl?.reset();

      if (value === 'Charged') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (
        value === 'Painted' ||
        value === 'Choked' ||
        value === 'Missing'
      ) {
        remarkControl?.setValue('UNSAT');
        remarkControl?.disable();
      } else if (value === 'Others') {
        this.showGreasePointsInput = true;
        remarkControl?.setValue(null);
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // ---------------- Ser 8: Oil being used in Gear Box ----------------
    // Others → show dialog box for custom oil type
    this.form.get('oil_gear_box_type')?.valueChanges.subscribe((value) => {
      this.showOilGearBoxOthersInput = value === 'Others';
      if (value !== 'Others') {
        this.form.get('oil_gear_box_type_others')?.reset();
      }
    });

    // Yes → SAT | No → UNSAT
    this.form.get('oil_gear_box_value')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('oil_gear_box_remark');

      if (value === 'Yes') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'No') {
        remarkControl?.setValue('UNSAT');
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // ---------------- Ser 9: Oil Level in Gear Box ----------------
    // 40-100% filled → SAT | Less than 40% filled → SAT with observation | Empty → UNSAT
    this.form.get('oil_level')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('oil_level_remark');
      const remarkMap: Record<string, string> = {
        '40-100% filled': 'SAT',
        'Less than 40% filled': 'SAT with observations',
        Empty: 'UNSAT',
      };

      remarkControl?.setValue(remarkMap[value] ?? null);
      remarkControl?.disable();
    });

    // ---------------- Ser 11: Change of Oil ----------------
    // Less than 12 months from last date → SAT | More than 12 months → UNSAT
    this.form.get('lastOilChangeDate')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('lastOilChangeDate_marks');

      if (!value) {
        remarkControl?.setValue(null);
        return;
      }

      const lastChange = new Date(value);
      const now = new Date();
      const monthsDiff =
        (now.getFullYear() - lastChange.getFullYear()) * 12 +
        (now.getMonth() - lastChange.getMonth());

      remarkControl?.setValue(monthsDiff <= 12 ? 'SAT' : 'UNSAT');
    });

    // ---------------- Ser 14: Log book ----------------
    // Yes → SAT | No → UNSAT
    /*this.form.get('log_book_measured')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('log_book_remarks');
  
      if (value === 'Yes') {
        remarkControl?.setValue('SAT');
      } else if (value === 'No') {
        remarkControl?.setValue('UNSAT');
      } else {
        remarkControl?.setValue(null);
      }
    });*/

    // ---------------- Ser 15: Periodicity ----------------
    // Monthly/Quarterly → SAT | Nil → UNSAT
    /*this.form.get('periodicity_measured')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('periodicity_remarks');
  
      if (value === 'Monthly' || value === 'Quarterly') {
        remarkControl?.setValue('SAT');
      } else if (value === 'Nil') {
        remarkControl?.setValue('UNSAT');
      } else {
        remarkControl?.setValue(null);
      }
    });*/

    // ---------------- Ser 16: SPM Check ----------------
    // NA → NA | Green → SAT | Yellow → SAT with observation | Red → UNSAT
    this.form.get('spm_measured')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('spm_remarks');
      const remarkMap: Record<string, string> = {
        NA: 'NA',
        Green: 'SAT',
        Yellow: 'SAT with observations',
        Red: 'UNSAT',
      };
      remarkControl?.disable();

      remarkControl?.setValue(remarkMap[value] ?? null);
      remarkControl?.disable();
    });

    //7
  }

  /* ----------------------------- EDIT MODE ----------------------------------- */

  getEditDataByRowId(rowId: string) {
    this.apiService.get(`${Apiendpoints.BER_CERTIFICATE}${rowId}`).subscribe({
      next: (res: any) => {
        if (res?.data) {
          this.editDataDetails = res.data;
          this.form.patchValue({
            command: this.editDataDetails?.ship?.command?.id,
            class_of_ship: this.editDataDetails?.ship?.classofship?.id,
          });
        }
      },
      error: (err) => {
        console.error('Error fetching data:', err);
        this.toastService.showError('Failed to load details.');
      },
    });
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  /* ------------------------------- SAVE --------------------------------------- */

  buildPayload() {
    const formDataValues = this.form.value;

    const payload: any = {
      ...formDataValues,
      authority_files: this.uploadedAuthorityFiles.map(
        (f) => f.id || f.file_path,
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
      console.error('Trial prefill failed (RAS Winch)', e);
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
        'Failed to load RAS Winch data for selected equipment',
        error,
      );
      this.toastService.showError('Failed to load selected equipment data.');
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
      'ship' in jsonData ||
      'condition_gear_box' in jsonData ||
      'overall_remark' in jsonData;
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

  /** Tab switch pe form reset — reset() ko emitEvent:true (default) hi rehne diya hai
   *  taaki setupConditionalLogic() ke subscriptions khud SAT/UNSAT aur dialog-box
   *  flags ko clean kar dein (jaise reset hone par hote hain) */
  private resetFormData(): void {
    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;
      control.enable({ emitEvent: false });
      control.reset('');
    });
  }

  /** Equipment-specific payload se poore form ko hydrate karta hai.
   *  PHASE 1 — "driver" fields jinke upar valueChanges subscriptions hain (SAT/UNSAT
   *  auto-derive karte hain aur dialog-box flags toggle karte hain) — inhe pehle
   *  patch karo taaki subscription khud sahi remark/flag set kar de.
   *  PHASE 2 — un driver-subscriptions se reset ho jaane wale free-text fields —
   *  inhe baad mein, silently (emitEvent:false) patch karo taaki phase-1 ka reset
   *  overwrite na kare.
   *  PHASE 3 — baaki saare plain fields (koi conditional side-effect nahi). */
  fillData(payload: any): void {
    if (!payload) return;

    const driverFields = [
      'condition_gear_box',
      'load_test',
      'condition_motor_value',
      'visual_inspection',
      'operational_trials',
      'grease_points',
      'oil_gear_box_type',
      'oil_gear_box_value',
      'oil_level',
      'lastOilChangeDate',
      'spm_measured',
    ];

    const dependentFreeTextFields = [
      'condition_gear_box_value',
      'load_test_value',
      'visual_corrosion',
      'visual_pitting',
      'visual_unpainted',
      'visual_others',
      'operational_trials_value',
      'grease_points_value',
      'oil_gear_box_type_others',
    ];

    // PHASE 1
    driverFields.forEach((key) => {
      if (key in payload) {
        this.form.get(key)?.setValue(payload[key] ?? '');
      }
    });

    // PHASE 2
    dependentFreeTextFields.forEach((key) => {
      if (key in payload) {
        this.form.get(key)?.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });

    // PHASE 3
    const handledKeys = [...driverFields, ...dependentFreeTextFields];
    Object.keys(payload).forEach((key) => {
      if (handledKeys.includes(key)) return;
      const control = this.form.get(key);
      if (control) {
        control.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });
  }
}
