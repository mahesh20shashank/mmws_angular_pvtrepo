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
  selector: 'app-vkd-manual-lifting-transporting-device',
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
  templateUrl: './vkd-manual-lifting-transporting-device.html',
  styleUrl: './vkd-manual-lifting-transporting-device.css',
})
export class VkdManualLiftingTransportingDevice {
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

  form!: FormGroup;
  loading = false;
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;
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

  // Ser 7: Wire rope status options
  // Nil → SAT | Observation → show dialog box → SAT with Observation / UNSAT
  wireRopeStatusOptions = [
    { label: 'Nil', value: 'Nil' },
    { label: 'Observation', value: 'Observation' },
  ];

  // Ser 9: Foundation observation options
  ObservationsOptions = [
    { label: 'No Observation', value: 'NoObservation' },
    { label: 'Observation', value: 'Observation' },
  ];

  // Ser 13: Pulley condition options (Nil / Observation)
  ObservationsNilOptions = [
    { label: 'Nil', value: 'Nil' },
    { label: 'Observation', value: 'Observation' },
  ];

  // Ser 10: Greasing options
  greasingOptions = [
    { label: 'Greased', value: 'Greased' },
    { label: 'Not Greased', value: 'Not Greased' },
  ];

  // Ser 11: Grease nipple condition options
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

  // Used for Ser 7 and Ser 13 when Observation is selected
  SatWithObsUnsatOptions = [
    { label: 'SAT with Observation', value: 'SAT with Observation' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  overallRemarksOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
    { label: 'SAT with observations', value: 'SAT with observations' },
  ];

  // ---- Show/hide booleans for conditional rendering ----

  // Ser 7: Observation selected → show dialog box input
  showWireRopeObservationInput = false;

  // Ser 9: Observation selected → show 4 sub-input fields
  showFoundationObservationFields = false;

  // Ser 11: Others selected → show dialog box input
  showGreasingPointsInput = false;

  // Ser 13: Observation selected → show dialog box input
  showPulleyObservationInput = false;

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
    private toast: ToastService,
    private route: ActivatedRoute,
    public formApiService: FormApiService,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadPlaceOfConductTrail();
    this.setupConditionalLogic();

    this.form.get('load_test_next_due')?.valueChanges.subscribe((v) => {
      console.log('RAW next_due value from calendar component:', v, typeof v);
    });

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

      // Ser 1: Make (Alphanumeric)
      // make: [''],
      manufacturer_name: [''],

      // Ser 2: Type (Alphanumeric)
      type: [''],

      // Ser 3: Year of Manufacture (CMMS dropdown)
      year_of_manufacture: [''],

      // Ser 4: Load Testing
      // < 27 months from last date of Load Test → SAT
      // > 27 months from last date of Load Test → UNSAT
      load_test_last_date: [''],
      load_test_last_month_year: [''],
      load_test_next_due: [''],
      load_test_remark: [''],

      // Ser 5: Load Testing of Wire Rope
      // < 27 months from last date of Load Test → SAT
      // > 27 months from last date of Load Test → UNSAT
      wire_rope_load_test_last_date: [''],
      wire_rope_load_test_last_month_year: [''],
      wire_rope_load_test_next_due: [''],
      wire_rope_load_test_remark: [''],

      // Ser 6: Serviceability Checks / Visual Survey of Rope
      // < 12 months from last date of serviceability → SAT
      // > 12 months from last date of serviceability → UNSAT
      serviceability_last_date: [''],
      serviceability_last_month_year: [''],
      serviceability_next_due: [''],
      serviceability_remark: [''],

      // Ser 7: Check wire rope for signs of excessive wear, corrosion or other defects
      // Nil → SAT
      // Observation → dialog box → SAT with Observation / UNSAT
      wire_rope_status: [''],
      wire_rope_status_observation: [''],
      wire_rope_status_remark: [''],

      // Ser 8: Wire Rope (Date of fitment → Replacement due)
      // < 5 years from last date of fitment of wire rope → SAT
      // > 27 months from last date of fitment of wire rope → UNSAT
      wire_rope_fitment_date: [''],
      wire_rope_fitment_month_year: [''],
      wire_rope_replacement_due: [''],
      wire_rope_fitment_remark: [''],

      // Ser 9: Condition of Foundations and Plating under Foundation
      // No Observation → SAT
      // Observation → dialog box against all observation options (Corrosion/Pitting/Unpainted/Others)
      condition_foundation: [''],
      condition_foundation_remark: [''],
      foundation_corrosion: [''],
      foundation_pitting: [''],
      foundation_unpainted: [''],
      foundation_others: [''],

      // Ser 10: Greasing of Mechanical Part
      // Greased → SAT | Not Greased → UNSAT
      greasing_check: [''],
      greasing_remark: [''],

      // Ser 11: Greasing Points
      // Charged → SAT | Painted/Choked/Missing → UNSAT | Others → dialog box
      greasing_points: [''],
      greasing_points_remark: [''],
      greasing_points_value: [''],

      // Ser 12: Operation Trials (3 sub-rows – all Alphanumeric)
      op_trial_lowering_hoisting: [''],
      op_trial_lowering_hoisting_remark: [''],
      op_trial_noise_vibration: [''],
      op_trial_noise_vibration_remark: [''],
      op_trial_pulleys: [''],
      op_trial_pulleys_remark: [''],

      // Ser 13: Condition of Pulley
      // Nil → SAT
      // Observation → dialog box → SAT with Observation / UNSAT
      condition_pulley: [''],
      condition_pulley_observation: [''],
      condition_pulley_remark: [''],

      // Ser 14 & 15
      other_observation: [''],
      overall_remark: [''],
    });
  }

  setupConditionalLogic() {
    // -------- Ser 4: Load Testing --------
    // Compute next due as last_date + 27 months; auto-set SAT/UNSAT
    this.form.get('load_test_last_date')?.valueChanges.subscribe((value) => {
      console.log('here in set up fun');
      this.computeNextDueAndRemark(
        'load_test_last_date',
        27, // threshold in months
        'load_test_next_due',
        'load_test_remark',
      );
    });

    // -------- Ser 5: Load Testing of Wire Rope --------
    // Same 27-month logic
    this.form
      .get('wire_rope_load_test_last_date')
      ?.valueChanges.subscribe((value) => {
        this.computeNextDueAndRemark(
          'wire_rope_load_test_last_date',
          27,
          'wire_rope_load_test_next_due',
          'wire_rope_load_test_remark',
        );
      });

    // -------- Ser 6: Serviceability Checks / Visual Survey --------
    // < 12 months → SAT | > 12 months → UNSAT
    this.form
      .get('serviceability_last_date')
      ?.valueChanges.subscribe((value) => {
        this.computeNextDueAndRemark(
          'serviceability_last_date',
          12, // threshold in months
          'serviceability_next_due',
          'serviceability_remark',
        );
      });

    // -------- Ser 7: Wire Rope Status --------
    // Nil → SAT (plain SAT/UNSAT dropdown shown)
    // Observation → show dialog box input; switch remark dropdown to SatWithObsUnsatOptions
    this.form.get('wire_rope_status')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('wire_rope_status_remark');
      const observationControl = this.form.get('wire_rope_status_observation');

      this.showWireRopeObservationInput = false;
      observationControl?.reset();

      // Enable in case it was disabled previously
      remarkControl?.enable({ emitEvent: false });

      if (value === 'Nil') {
        // Nil → SAT
        remarkControl?.setValue('SAT', { emitEvent: false });
        remarkControl?.disable({ emitEvent: false });
      } else if (value === 'Observation') {
        // Observation → Show textbox and let user select remark
        this.showWireRopeObservationInput = true;
        remarkControl?.reset('', { emitEvent: false });
        // Keep enabled
      } else {
        remarkControl?.reset('', { emitEvent: false });
      }
    });

    // -------- Ser 8: Wire Rope Fitment --------
    // < 5 years (60 months) from date of fitment → SAT
    // > 27 months from date of fitment → UNSAT
    // Note: per image: "less than 05 Year → SAT", "more than 27 months → UNSAT"
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

      // < 60 months (5 years) from fitment → SAT; >= 60 months → UNSAT
      // Also UNSAT if > 27 months (per image: "more than 27 months → UNSAT")
      if (monthsDiff < 60) {
        remarkControl?.setValue('SAT');
      } else {
        remarkControl?.setValue('UNSAT');
      }
    });

    // -------- Ser 9: Condition of Foundations --------
    // No Observation → SAT
    // Observation → show 4 dialog boxes (Corrosion/Pitting/Unpainted/Others)
    this.form.get('condition_foundation')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('condition_foundation_remark');

      this.showFoundationObservationFields = false;

      this.form.get('foundation_corrosion')?.reset();
      this.form.get('foundation_pitting')?.reset();
      this.form.get('foundation_unpainted')?.reset();
      this.form.get('foundation_others')?.reset();

      if (value === 'NoObservation' || value === 'No Observation') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Observation') {
        this.showFoundationObservationFields = true;
        remarkControl?.setValue(null);
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // -------- Ser 10: Greasing of Mechanical Part --------
    // Greased → SAT | Not Greased → UNSAT
    this.form.get('greasing_check')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('greasing_remark');

      if (value === 'Greased') {
        remarkControl?.setValue('SAT');
        remarkControl?.disable();
      } else if (value === 'Not Greased') {
        remarkControl?.setValue('UNSAT');
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // -------- Ser 11: Greasing Points --------
    // Charged → SAT | Painted/Choked/Missing → UNSAT | Others → dialog box
    this.form.get('greasing_points')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('greasing_points_remark');
      const valueControl = this.form.get('greasing_points_value');

      this.showGreasingPointsInput = false;
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
        this.showGreasingPointsInput = true;
        remarkControl?.setValue(null);
        remarkControl?.disable();
      } else {
        remarkControl?.setValue(null);
        remarkControl?.disable();
      }
    });

    // -------- Ser 13: Condition of Pulley --------
    // Nil → SAT (plain SAT/UNSAT dropdown shown)
    // Observation → show dialog box input; switch dropdown to SatWithObsUnsatOptions
    // -------- Ser 13: Condition of Pulley --------
    this.form.get('condition_pulley')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('condition_pulley_remark');
      const observationControl = this.form.get('condition_pulley_observation');

      this.showPulleyObservationInput = false;
      observationControl?.reset();

      // Enable first in case it was disabled previously
      remarkControl?.enable({ emitEvent: false });

      if (value === 'Nil') {
        // Nil → SAT
        remarkControl?.setValue('SAT', { emitEvent: false });
        remarkControl?.disable({ emitEvent: false });
      } else if (value === 'Observation') {
        // Observation → Show textbox and remark dropdown
        this.showPulleyObservationInput = true;
        remarkControl?.reset('', { emitEvent: false });
        // Keep enabled so user can select:
        // SAT with Observation / UNSAT
      } else {
        remarkControl?.reset('', { emitEvent: false });
      }
    });
  }

  /**
   * Helper: compute next due date and set SAT/UNSAT remark
   * based on whether monthsDiff < thresholdMonths.
   * Less than threshold → SAT | More than threshold → UNSAT
   */
  private parseMonthYear(value: string): Date | null {
    if (!value) return null;

    // Expecting "MM/YYYY"
    const parts = value.split('/');
    if (parts.length !== 2) return null;

    const month = parseInt(parts[0], 10);
    const year = parseInt(parts[1], 10);

    if (isNaN(month) || isNaN(year)) return null;

    // JS Date months are 0-indexed
    return new Date(year, month - 1, 1);
  }

  private computeNextDueAndRemark(
    lastDateControlName: string,
    thresholdMonths: number,
    nextDueControlName: string,
    remarkControlName: string,
  ): void {
    const lastDateControl = this.form.get(lastDateControlName);
    const nextDueControl = this.form.get(nextDueControlName);
    const remarkControl = this.form.get(remarkControlName);

    const lastDateValue = lastDateControl?.value;
    // const nextDueValue = nextDueControl?.value;

    // if (!lastDateValue || !nextDueValue) {
    //   remarkControl?.setValue(null, { emitEvent: false });
    //   return;
    // }

    if (!lastDateValue) {
      nextDueControl?.setValue(null, { emitEvent: false });
      remarkControl?.setValue(null, { emitEvent: false });
      remarkControl?.enable({ emitEvent: false });
      return;
    }

    // last_date comes from app-calendar (likely ISO string or Date)
    const lastDate = new Date(lastDateValue);

    // next_due comes from app-month-year-calendar as "MM/YYYY" — needs manual parsing
    // const nextDue = this.parseMonthYear(nextDueValue);

    // if (!lastDate || isNaN(lastDate.getTime()) || !nextDue || isNaN(nextDue.getTime())) {
    //   console.warn('Invalid date(s) passed to computeNextDueAndRemark', { lastDateValue, nextDueValue });
    //   remarkControl?.setValue(null, { emitEvent: false });
    //   return;
    // }

    // const monthsDiff = this.getMonthsDiff(lastDate, nextDue);

    // console.log('lastDate', lastDate);
    // console.log('nextDue', nextDue);
    // console.log('monthsDiff', monthsDiff);

    // remarkControl?.setValue(
    //   monthsDiff > thresholdMonths ? 'UNSAT' : 'SAT',
    //   { emitEvent: false }
    // );

    // remarkControl?.disable({ emitEvent: false });
    const nextDue = new Date(lastDate);
    nextDue.setMonth(nextDue.getMonth() + thresholdMonths);
    nextDueControl?.setValue(this.formatMonthYear(nextDue), {
      emitEvent: false,
    });

    // Months elapsed from last_date to TODAY (not to next_due)
    const now = new Date();
    const monthsDiff = this.getMonthsDiff(lastDate, now);

    console.log('lastDate', lastDate);
    console.log('today', now);
    console.log('monthsDiff (elapsed)', monthsDiff);

    remarkControl?.setValue(monthsDiff > thresholdMonths ? 'UNSAT' : 'SAT', {
      emitEvent: false,
    });

    remarkControl?.disable({ emitEvent: false });
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
   * Helper: format a date as "MMM YYYY" string for month-year display
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
    // if (type === 'save' && !this.validateForm()) {
    //   return;
    // }

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
        'Trial prefill failed (VKD Manual Lifting Transporting Device)',
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
        'Failed to load VKD Manual Lifting Transporting Device data for selected equipment',
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
      'load_test_last_date' in jsonData ||
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

    this.showWireRopeObservationInput = false;
    this.showFoundationObservationFields = false;
    this.showGreasingPointsInput = false;
    this.showPulleyObservationInput = false;

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

    // ---- Ser 4: Load Testing — auto-computed & locked ----
    if (payload.load_test_last_date && payload.load_test_next_due) {
      this.form.get('load_test_remark')?.disable({ emitEvent: false });
    }

    // ---- Ser 5: Load Testing of Wire Rope — auto-computed & locked ----
    if (
      payload.wire_rope_load_test_last_date &&
      payload.wire_rope_load_test_next_due
    ) {
      this.form
        .get('wire_rope_load_test_remark')
        ?.disable({ emitEvent: false });
    }

    // ---- Ser 6: Serviceability Checks — auto-computed & locked ----
    if (payload.serviceability_last_date && payload.serviceability_next_due) {
      this.form.get('serviceability_remark')?.disable({ emitEvent: false });
    }

    // ---- Ser 7: Wire Rope Status ----
    if (payload.wire_rope_status === 'Nil') {
      this.form.get('wire_rope_status_remark')?.disable({ emitEvent: false });
    } else if (payload.wire_rope_status === 'Observation') {
      this.showWireRopeObservationInput = true;
      // remark control yahan enabled hi rehta hai (user select karta hai) — as-is chhodo
    }

    // ---- Ser 8: Wire Rope Fitment — remark kabhi disable nahi hota is component mein ----
    // (koi extra handling nahi chahiye)

    // ---- Ser 9: Condition of Foundations — hamesha locked hai dono branches mein ----
    if (
      payload.condition_foundation === 'NoObservation' ||
      payload.condition_foundation === 'No Observation'
    ) {
      this.form
        .get('condition_foundation_remark')
        ?.disable({ emitEvent: false });
    } else if (payload.condition_foundation === 'Observation') {
      this.showFoundationObservationFields = true;
      this.form
        .get('condition_foundation_remark')
        ?.disable({ emitEvent: false });
    }

    // ---- Ser 10: Greasing of Mechanical Part — hamesha locked ----
    if (
      payload.greasing_check === 'Greased' ||
      payload.greasing_check === 'Not Greased'
    ) {
      this.form.get('greasing_remark')?.disable({ emitEvent: false });
    }

    // ---- Ser 11: Greasing Points — hamesha locked ----
    if (
      ['Charged', 'Painted', 'Choked', 'Missing'].includes(
        payload.greasing_points,
      )
    ) {
      this.form.get('greasing_points_remark')?.disable({ emitEvent: false });
    } else if (payload.greasing_points === 'Others') {
      this.showGreasingPointsInput = true;
      this.form.get('greasing_points_remark')?.disable({ emitEvent: false });
    }

    // ---- Ser 13: Condition of Pulley ----
    if (payload.condition_pulley === 'Nil') {
      this.form.get('condition_pulley_remark')?.disable({ emitEvent: false });
    } else if (payload.condition_pulley === 'Observation') {
      this.showPulleyObservationInput = true;
      // remark control enabled rehta hai — as-is chhodo
    }
  }
}
