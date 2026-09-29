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
  selector: 'app-vkd-sac-blade-replacement-device',
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
  templateUrl: './vkd-sac-blade-replacement-device.html',
  styleUrl: './vkd-sac-blade-replacement-device.css',
})
export class VkdSacBladeReplacementDevice {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;

  readonly restartIcon = 'rotate-ccw';

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  showApprovalWorkflowPopup = false;
      isSubmitTime = false;

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

  // Ser 3 & 6: Nil / Observation dropdown
  // Nil → SAT | Observation → UNSAT + dialog box (Ser 3) or SAT with Obs / UNSAT (Ser 6)
  nilObservationOptions = [
    { label: 'Nil', value: 'Nil' },
    { label: 'Observation', value: 'Observation' },
  ];

  // Ser 8: Gear Box noise
  // Nil → SAT | Noise Observed → UNSAT + dialog box
  noiseObserved = [
    { label: 'Nil', value: 'Nil' },
    { label: 'Noise Observed', value: 'Noise Observed' },
  ];

  // Ser 10: Visual Inspection
  ObservationsOptions = [
    { label: 'No Observation', value: 'NoObservation' },
    { label: 'Observation', value: 'Observation' },
  ];

  // Ser 12: Grease nipple condition
  // Charged → SAT | Painted/Choked/Missing → UNSAT | Others → dialog box
  fillingDrainPlugs = [
    { label: 'Charged', value: 'Charged' },
    { label: 'Painted', value: 'Painted' },
    { label: 'Choked', value: 'Choked' },
    { label: 'Missing', value: 'Missing' },
    { label: 'Others', value: 'Others' },
  ];

  SatUnsatOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  // Used for Ser 6 when Observation is selected
  SatWithObsUnsatOptions = [
    { label: 'SAT with Observation', value: 'SAT with Observation' },
    { label: 'UNSAT', value: 'UNSAT' },
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

  montlyQuarterlyOption = [
    { label: 'Monthly', value: 'Monthly' },
    { label: 'Quarterly', value: 'Quarterly' },
  ];

  montlyQuarterlyNilOption = [
    { label: 'Monthly', value: 'Monthly' },
    { label: 'Quarterly', value: 'Quarterly' },
    { label: 'Nil', value: 'Nil' },
  ];

  // Ser 17: SPM Check — NA (Motor fitted inside the Winch casing) | Green | Yellow | Red
  spmCheckOptions = [
    { label: 'NA (Motor fitted inside the Winch casing)', value: 'NA' },
    { label: 'Green', value: 'Green' },
    { label: 'Yellow', value: 'Yellow' },
    { label: 'Red', value: 'Red' },
  ];

  // ---- Show/hide booleans for conditional rendering ----

  // Ser 3: Observation → UNSAT + dialog box
  showLoadTestDetailsInput = false;

  // Ser 6: Observation → dialog box input + switch to SatWithObsUnsatOptions
  showWireRopeObservationInput = false;

  // Ser 8: Noise Observed → UNSAT + dialog box
  showGearBoxInput = false;

  // Ser 10: Observation → show 4 sub-input dialog boxes
  showVisualInspectionFields = false;

  // Ser 11: UNSAT → dialog box
  showOperationalTrialsInput = false;

  // Ser 12: Others → dialog box
  showGreasePointsInput = false;

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
      date_of_conduct_trail: [''],
      authority: [''],
      authority_date: [''],

      // Ser 1: Type (CMMS dropdown)
      type: [''],

      // Ser 2: Make (CMMS dropdown)
      make: [''],
      manufacturer_name: [{ value: '', disabled: true }],

      // Ser 3: Load Test Details
      // Nil → SAT | Observation → UNSAT + dialog box
      load_test_details: [''],
      load_test_details_remark: [''],
      load_test_details_value: [''],

      // Ser 4: Load Testing of Wire Rope
      // < 27 months from last date of Load Test → SAT | > 27 months → UNSAT
      wire_rope_load_test_last_date: [''],
      wire_rope_load_test_last_month_year: [''],
      wire_rope_load_test_next_due: [''],
      wire_rope_load_test_remark: [''],

      // Ser 5: Serviceability Checks / Visual Survey of Rope
      // < 12 months from last date of serviceability → SAT | > 12 months → UNSAT
      serviceability_last_date: [''],
      serviceability_last_month_year: [''],
      serviceability_next_due: [''],
      serviceability_remark: [''],

      // Ser 6: Check wire rope for signs of excessive wear, corrosion or other defects
      // Nil → SAT | Observation → dialog box → SAT with Observation / UNSAT
      wire_rope_status: [''],
      wire_rope_status_observation: [''],
      wire_rope_status_remark: [''],

      // Ser 7: Wire Rope fitment
      // < 5 years (60 months) → SAT | > 27 months → UNSAT
      wire_rope_fitment_date: [''],
      wire_rope_fitment_month_year: [''],
      wire_rope_replacement_due: [''],
      wire_rope_fitment_remark: [''],

      // Ser 8: Condition of Gear Box
      // Nil → SAT | Noise Observed → UNSAT + dialog box
      condition_gear_box: [''],
      condition_gear_box_remark: [''],
      condition_gear_box_value: [''],

      // Ser 9: Condition of Motor
      // >= 10 M Ohms → SAT | < 10 M Ohms → UNSAT
      condition_motor_value: [''],
      condition_motor_remark: [''],

      // Ser 10: Visual Inspection of structure/Equipment
      // No Observation → SAT | Observation → 4 dialog boxes
      visual_inspection: [''],
      visual_inspection_remark: [''],
      visual_corrosion: [''],
      visual_pitting: [''],
      visual_unpainted: [''],
      visual_others: [''],

      // Ser 11: Operational Trials (SAC Blade replacement device)
      // UNSAT → dialog box
      operational_trials: [''],
      operational_trials_value: [''],

      // Ser 12: Grease Points
      // Charged → SAT | Painted/Choked/Missing → UNSAT | Others → dialog box
      grease_points: [''],
      grease_points_remark: [''],
      grease_points_value: [''],

      // Ser 13: Starting current
      starting_current_reference: [''],
      starting_current_measured: [''],
      starting_current_remarks: [''],

      // Ser 14: Running current
      running_current_reference: [''],
      running_current_measured: [''],
      running_current_remarks: [''],

      // Ser 15: Log book exist
      // Yes → SAT | No → UNSAT
      log_book_measured: [''],
      log_book_remarks: [''],

      // Ser 16: Periodicity of measurement
      // Monthly/Quarterly → SAT | Nil → UNSAT
      periodicity_reference: [''],
      periodicity_measured: [''],
      periodicity_remarks: [''],

      // Ser 17: SPM Check of Motor
      // NA → NA | Green → SAT | Yellow → SAT with observation | Red → UNSAT
      spm_measured: [''],
      spm_remarks: [''],

      // Ser 18 & 19
      other_observation: [''],
      overall_remark: [''],
    });
  }

  setupConditionalLogic() {
    // -------- Ser 3: Load Test Details --------
    // Nil → SAT (plain dropdown)
    // Observation → UNSAT + dialog box appears for alphanumeric data
    this.form.get('load_test_details')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('load_test_details_remark');
      const valueControl = this.form.get('load_test_details_value');

      this.showLoadTestDetailsInput = false;
      valueControl?.reset();

      if (value === 'Nil') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Observation') {
        this.showLoadTestDetailsInput = true;
        remarkControl?.setValue('UNSAT');
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // -------- Ser 4: Load Testing of Wire Rope --------
    // < 27 months from last date of Load Test → SAT
    // > 27 months from last date of Load Test → UNSAT
    this.form
      .get('wire_rope_load_test_last_date')
      ?.valueChanges.subscribe((value) => {
        this.computeNextDueAndRemark(
          value,
          27,
          'wire_rope_load_test_next_due',
          'wire_rope_load_test_remark',
        );
      });

    // -------- Ser 5: Serviceability Checks / Visual Survey of Rope --------
    // < 12 months from last date of serviceability → SAT
    // > 12 months from last date of serviceability → UNSAT
    this.form
      .get('serviceability_last_date')
      ?.valueChanges.subscribe((value) => {
        this.computeNextDueAndRemark(
          value,
          12,
          'serviceability_next_due',
          'serviceability_remark',
        );
      });

    // -------- Ser 6: Check wire rope for signs of excessive wear --------
    // Nil → SAT
    // Observation → Show textbox + SAT with Observation / UNSAT dropdown
    this.form.get('wire_rope_status')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('wire_rope_status_remark');
      const observationControl = this.form.get('wire_rope_status_observation');

      this.showWireRopeObservationInput = false;
      observationControl?.reset();

      // Enable first because it might have been disabled previously
      remarkControl?.enable({ emitEvent: false });

      if (value === 'Nil') {
        this.showWireRopeObservationInput = false;

        remarkControl?.setValue('SAT', { emitEvent: false });
        remarkControl?.disable({ emitEvent: false });
      } else if (value === 'Observation') {
        this.showWireRopeObservationInput = true;

        // Clear previous value and keep dropdown enabled
        remarkControl?.reset('', { emitEvent: false });
      } else {
        remarkControl?.reset('', { emitEvent: false });
      }
    });

    // -------- Ser 7: Wire Rope Fitment --------
    // < 5 years (60 months) from last date of fitment of wire rope → SAT
    // > 27 months from last date of fitment of wire rope → UNSAT
    this.form.get('wire_rope_fitment_date')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('wire_rope_fitment_remark');
      const nextDueControl = this.form.get('wire_rope_replacement_due');

      if (!value) {
        remarkControl?.setValue(null);
        return;
      }

      const fitmentDate = new Date(value);
      const now = new Date();
      const monthsDiff = this.getMonthsDiff(fitmentDate, now);

      // Replacement due = fitment date + 5 years (60 months)
      const replacementDue = new Date(fitmentDate);
      replacementDue.setMonth(replacementDue.getMonth() + 60);
      nextDueControl?.setValue(this.formatMonthYear(replacementDue), {
        emitEvent: false,
      });

      // < 60 months (5 years) → SAT | >= 60 months → UNSAT
      remarkControl?.setValue(monthsDiff < 60 ? 'SAT' : 'UNSAT');
    });

    // -------- Ser 8: Condition of Gear Box --------
    // Nil → SAT | Noise Observed → UNSAT + dialog box for alphanumeric data
    this.form.get('condition_gear_box')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('condition_gear_box_remark');
      const valueControl = this.form.get('condition_gear_box_value');

      this.showGearBoxInput = false;
      valueControl?.reset();

      if (value === 'Nil') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Noise Observed') {
        remarkControl?.setValue('UNSAT');
        this.showGearBoxInput = true;

        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // -------- Ser 9: Condition of Motor --------
    // >= 10 M Ohms → SAT | < 10 M Ohms → UNSAT
    this.form.get('condition_motor_value')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('condition_motor_remark');
      const numericValue = Number(value);

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

    // -------- Ser 10: Visual Inspection of structure/Equipment --------
    // No Observation → SAT
    // Observation → dialog box against all observation options (Corrosion/Pitting/Unpainted/Others)
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

    // -------- Ser 11: Operational Trials --------
    // UNSAT → dialog box for alphanumeric data
    this.form.get('operational_trials')?.valueChanges.subscribe((value) => {
      const valueControl = this.form.get('operational_trials_value');

      this.showOperationalTrialsInput = false;
      valueControl?.reset();
      // valueControl?.disable();

      if (value === 'UNSAT') {
        this.showOperationalTrialsInput = true;
        // valueControl?.disable();
      }
    });

    // -------- Ser 12: Grease Points --------
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

    // -------- Ser 15: Log book exist --------
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

    // -------- Ser 16: Periodicity of measurement --------
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

    // -------- Ser 17: SPM Check of Motor --------
    // NA → NA | Green → SAT | Yellow → SAT with observations | Red → UNSAT
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
  }

  /**
   * Helper: compute next due date and set SAT/UNSAT remark
   * Less than threshold months → SAT | More than or equal to threshold months → UNSAT
   */
  private computeNextDueAndRemark(
    lastDateValue: string,
    thresholdMonths: number,
    nextDueControlName: string,
    remarkControlName: string,
  ): void {
    const remarkControl = this.form.get(remarkControlName);
    const nextDueControl = this.form.get(nextDueControlName);

    if (!lastDateValue) {
      remarkControl?.setValue(null);
      return;
    }

    const lastDate = new Date(lastDateValue);
    const now = new Date();
    const monthsDiff = this.getMonthsDiff(lastDate, now);

    // Next due = last date + threshold months
    const nextDue = new Date(lastDate);
    nextDue.setMonth(nextDue.getMonth() + thresholdMonths);
    nextDueControl?.setValue(this.formatMonthYear(nextDue), {
      emitEvent: false,
    });

    remarkControl?.setValue(monthsDiff < thresholdMonths ? 'SAT' : 'UNSAT');
  }

  /**
   * Helper: get months difference between two dates
   */
  private getMonthsDiff(from: Date, to: Date): number {
    return (
      (to.getFullYear() - from.getFullYear()) * 12 +
      (to.getMonth() - from.getMonth())
    );
  }

  /**
   * Helper: format a date as "Month YYYY" string for month-year display
   */
  private formatMonthYear(date: Date): string {
    return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
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
    const formDataValues = this.form.getRawValue();

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
      console.error(
        'Trial prefill failed (VKD SAC Blade Replacement Device)',
        e,
      );
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
        'Failed to load VKD SAC Blade Replacement Device data for selected equipment',
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
      'load_test_details' in jsonData ||
      'date_of_conduct_trail' in jsonData ||
      'wire_rope_status' in jsonData;
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
   *  saare auto-locked remark fields ko bhi pehle enable karke reset karta hai */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;
      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    this.showLoadTestDetailsInput = false;
    this.showWireRopeObservationInput = false;
    this.showGearBoxInput = false;
    this.showVisualInspectionFields = false;
    this.showOperationalTrialsInput = false;
    this.showGreasePointsInput = false;

    this.form.patchValue({ ship }, { emitEvent: false });
  }

  /** Poore form ko equipment-specific payload se generic tarike se hydrate karta hai,
   *  aur conditional-lock wale remark fields ka disabled state + visibility flags
   *  bhi manually restore karta hai (kyunki emitEvent:false hone ki wajah se
   *  valueChanges listeners trigger nahi hote patch ke time). */
  fillData(payload: any): void {
    if (!payload) return;

    Object.keys(payload).forEach((key) => {
      if (key === 'ship') return;

      const control = this.form.get(key);
      if (control) {
        control.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });

    this.form
      .get('ship')
      ?.setValue(payload.ship || this.form.get('ship')?.value || '', {
        emitEvent: false,
      });

    // ---- Ser 3: Load Test Details ----
    if (payload.load_test_details === 'Nil') {
      this.form.get('load_test_details_remark')?.disable({ emitEvent: false });
    } else if (payload.load_test_details === 'Observation') {
      this.showLoadTestDetailsInput = true;
      this.form.get('load_test_details_remark')?.disable({ emitEvent: false });
    }

    // ---- Ser 4: Load Testing of Wire Rope — auto-computed, is form mein disable() nahi hota, as-is ----

    // ---- Ser 6: Wire Rope Status ----
    if (payload.wire_rope_status === 'Nil') {
      this.form.get('wire_rope_status_remark')?.disable({ emitEvent: false });
    } else if (payload.wire_rope_status === 'Observation') {
      this.showWireRopeObservationInput = true;
      // remark control yahan enabled hi rehta hai (user select karta hai)
    }

    // ---- Ser 8: Condition of Gear Box ----
    if (payload.condition_gear_box === 'Nil') {
      this.form.get('condition_gear_box_remark')?.disable({ emitEvent: false });
    } else if (payload.condition_gear_box === 'Noise Observed') {
      this.showGearBoxInput = true;
      this.form.get('condition_gear_box_remark')?.disable({ emitEvent: false });
    }

    // ---- Ser 9: Condition of Motor ----
    if (
      payload.condition_motor_value !== undefined &&
      payload.condition_motor_value !== ''
    ) {
      this.form.get('condition_motor_remark')?.disable({ emitEvent: false });
    }

    // ---- Ser 10: Visual Inspection ----
    if (
      payload.visual_inspection === 'NoObservation' ||
      payload.visual_inspection === 'No Observation'
    ) {
      this.form.get('visual_inspection_remark')?.disable({ emitEvent: false });
    } else if (payload.visual_inspection === 'Observation') {
      this.showVisualInspectionFields = true;
      this.form.get('visual_inspection_remark')?.disable({ emitEvent: false });
    }

    // ---- Ser 11: Operational Trials ----
    if (payload.operational_trials === 'UNSAT') {
      this.showOperationalTrialsInput = true;
      this.form.get('operational_trials_value')?.enable({ emitEvent: false });
    } else {
      this.form.get('operational_trials_value')?.enable({ emitEvent: false });
    }

    // ---- Ser 12: Grease Points ----
    if (
      ['Charged', 'Painted', 'Choked', 'Missing'].includes(
        payload.grease_points,
      )
    ) {
      this.form.get('grease_points_remark')?.disable({ emitEvent: false });
    } else if (payload.grease_points === 'Others') {
      this.showGreasePointsInput = true;
      this.form.get('grease_points_remark')?.disable({ emitEvent: false });
    }

    // ---- Ser 17: SPM Check of Motor — hamesha locked ----
    if (payload.spm_measured) {
      this.form.get('spm_remarks')?.disable({ emitEvent: false });
    }
  }
}
