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
import { FileUploadComponent, UploadedFileItem } from '../../../../ui/file-upload/file-upload.component';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import { resolveTrialQueryParam, trialRowFromGetFormResponse  } from '../../../../trial-route-prefill';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-grease-separator',
  standalone: true,
   imports: [
      CommonModule,
      ReactiveFormsModule,
      FormCardComponent,
      LoadingButtonComponent,
      SelectComponent,
      CalenderComponent,
      InputComponent,
      ApprovalWorkFlow,
    ],
  templateUrl: './grease-separator.html',
  styleUrl: './grease-separator.css',
})
export class GreaseSeparator {
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
   showApprovalWorkflowPopup=false;
   isSubmitTime = false;
 
  uploadedAuthorityFiles: UploadedFileItem[] = [];
 
  placesOptions: any[] = [];
 
  occasionOptions = [
    { label: 'Pre Refit Trials', value: 'pre_refit_trials' },
    { label: 'End of Refit Trials', value: 'end_of_refit_trials' },
    { label: 'Surprice Checks', value: 'surprice_checks' },
  ];
 
  // SAT / UNSAT / SAT with observation — used across all remark dropdowns
  satUnsatObsOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
    { label: 'SAT with observation', value: 'SAT with observation' },
  ];
 
  // Ops / Non-ops — used for switch, indicator, auto mode observations
  // Ops → SAT | Non-ops → UNSAT + dialog box
  opsNonOpsOptions = [
    { label: 'Ops', value: 'Ops' },
    { label: 'Non-ops', value: 'Non-ops' },
  ];
 
  // ---- Show/hide booleans for conditional rendering ----
 
  // Ser 4b: Remote Panel – Switches Non-ops → dialog box
  showRemotePanelSwitchesInput = false;
 
  // Ser 4c: Remote Panel – Indicators Non-ops → dialog box
  showRemotePanelIndicatorsInput = false;
 
  // Ser 5b: Local Panel – Switches Non-ops → dialog box
  showLocalPanelSwitchesInput = false;
 
  // Ser 5c: Local Panel – Indicators Non-ops → dialog box
  showLocalPanelIndicatorsInput = false;
 
  // Ser 6: Auto Mode Non-ops → dialog box
  showAutoModeInput = false;

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
  return this.activeTab || this.formApiService?.currentEquipmentNomenclature || null;
}

get activeEquipmentId(): number | null {
  return this.activeHeaderEquipment?.equipment_id ?? this.activeHeaderEquipment?.id ?? null;
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
 
      // Ser 1: Make (alphanumeric)
      make: [''],
 
      // Ser 2: Model (alphanumeric)
      model: [''],
 
      // Ser 3: Type (alphanumeric)
      type: [''],
 
      // Ser 4: Remote Indicator Panel (DCHQ)
 
      // 4a: Electrical hygiene — AN input observation
      // If observation is filled → user selects SAT with observation or UNSAT from remark dropdown
      // If blank → SAT
      remote_panel_elec_hygiene_observation: [''],
      remote_panel_elec_hygiene_remark: [''],
 
      // 4b: Functioning of Switches
      // Ops → SAT | Non-ops → UNSAT + dialog box
      remote_panel_switches_observation: [''],
      remote_panel_switches_value: [''],
      remote_panel_switches_remark: [''],
 
      // 4c: Functioning of Indicators
      // Ops → SAT | Non-ops → UNSAT + dialog box
      remote_panel_indicators_observation: [''],
      remote_panel_indicators_value: [''],
      remote_panel_indicators_remark: [''],
 
      // Ser 5: Local Control Panel
 
      // 5a: Electrical hygiene — AN input observation
      // If observation is filled → user selects SAT with observation or UNSAT from remark dropdown
      // If blank → SAT
      local_panel_elec_hygiene_observation: [''],
      local_panel_elec_hygiene_remark: [''],
 
      // 5b: Functioning of switches
      // Ops → SAT | Non-ops → UNSAT + dialog box
      local_panel_switches_observation: [''],
      local_panel_switches_value: [''],
      local_panel_switches_remark: [''],
 
      // 5c: Functioning of indicators
      // Ops → SAT | Non-ops → UNSAT + dialog box
      local_panel_indicators_observation: [''],
      local_panel_indicators_value: [''],
      local_panel_indicators_remark: [''],
 
      // Ser 6: Auto Mode
      // Ops → SAT | Non-ops → UNSAT + dialog box
      auto_mode_observation: [''],
      auto_mode_value: [''],
      auto_mode_remark: [''],
 
      // Ser 7: Condition of Foundations
      // AN input observation
      // If observation is filled → user selects SAT with observation or UNSAT
      // If blank → SAT
      foundation_observation: [''],
      foundation_remark: [''],
 
      // Ser 8: Any other Observations (alphanumeric, free text)
      other_observations: [''],
 
      // Ser 9: Overall remark (auto-computed, disabled)
      // UNSAT if any remark = UNSAT
      // SAT with observation if any remark = SAT with observation (and none UNSAT)
      // SAT if all remarks = SAT
      overall_remark: [''],
    });
  }
 
  setupConditionalLogic() {
 
    // -------- Ser 4a: Remote Panel – Electrical Hygiene --------
    // If observation text is entered → set remark to SAT with observation (user can override to UNSAT)
    // If observation is cleared → set remark to SAT
    this.form.get('remote_panel_elec_hygiene_observation')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('remote_panel_elec_hygiene_remark');
      if (value && value.trim() !== '') {
        if (!remarkControl?.value || remarkControl?.value === 'SAT') {
          remarkControl?.setValue('SAT with observation', { emitEvent: false });
        }
      } else {
        remarkControl?.setValue('SAT', { emitEvent: false });
      }
      this.computeOverallRemark();
    });
 
    this.form.get('remote_panel_elec_hygiene_remark')?.valueChanges.subscribe(() => {
      this.computeOverallRemark();
    });
 
    // -------- Ser 4b: Remote Panel – Switches --------
    // Ops → SAT | Non-ops → UNSAT + dialog box
    this.form.get('remote_panel_switches_observation')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('remote_panel_switches_remark');
      const valueControl = this.form.get('remote_panel_switches_value');
 
      this.showRemotePanelSwitchesInput = false;
      valueControl?.reset();
 
      if (value === 'Ops') {
        remarkControl?.setValue('SAT');
      } else if (value === 'Non-ops') {
        this.showRemotePanelSwitchesInput = true;
        remarkControl?.setValue('UNSAT');
      } else {
        remarkControl?.setValue(null);
      }
      this.computeOverallRemark();
    });
 
    this.form.get('remote_panel_switches_remark')?.valueChanges.subscribe(() => {
      this.computeOverallRemark();
    });
 
    // -------- Ser 4c: Remote Panel – Indicators --------
    // Ops → SAT | Non-ops → UNSAT + dialog box
    this.form.get('remote_panel_indicators_observation')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('remote_panel_indicators_remark');
      const valueControl = this.form.get('remote_panel_indicators_value');
 
      this.showRemotePanelIndicatorsInput = false;
      valueControl?.reset();
 
      if (value === 'Ops') {
        remarkControl?.setValue('SAT');
      } else if (value === 'Non-ops') {
        this.showRemotePanelIndicatorsInput = true;
        remarkControl?.setValue('UNSAT');
      } else {
        remarkControl?.setValue(null);
      }
      this.computeOverallRemark();
    });
 
    this.form.get('remote_panel_indicators_remark')?.valueChanges.subscribe(() => {
      this.computeOverallRemark();
    });
 
    // -------- Ser 5a: Local Panel – Electrical Hygiene --------
    // If observation text entered → SAT with observation | If blank → SAT
    this.form.get('local_panel_elec_hygiene_observation')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('local_panel_elec_hygiene_remark');
      if (value && value.trim() !== '') {
        if (!remarkControl?.value || remarkControl?.value === 'SAT') {
          remarkControl?.setValue('SAT with observation', { emitEvent: false });
        }
      } else {
        remarkControl?.setValue('SAT', { emitEvent: false });
      }
      this.computeOverallRemark();
    });
 
    this.form.get('local_panel_elec_hygiene_remark')?.valueChanges.subscribe(() => {
      this.computeOverallRemark();
    });
 
    // -------- Ser 5b: Local Panel – Switches --------
    // Ops → SAT | Non-ops → UNSAT + dialog box
    this.form.get('local_panel_switches_observation')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('local_panel_switches_remark');
      const valueControl = this.form.get('local_panel_switches_value');
 
      this.showLocalPanelSwitchesInput = false;
      valueControl?.reset();
 
      if (value === 'Ops') {
        remarkControl?.setValue('SAT');
      } else if (value === 'Non-ops') {
        this.showLocalPanelSwitchesInput = true;
        remarkControl?.setValue('UNSAT');
      } else {
        remarkControl?.setValue(null);
      }
      this.computeOverallRemark();
    });
 
    this.form.get('local_panel_switches_remark')?.valueChanges.subscribe(() => {
      this.computeOverallRemark();
    });
 
    // -------- Ser 5c: Local Panel – Indicators --------
    // Ops → SAT | Non-ops → UNSAT + dialog box
    this.form.get('local_panel_indicators_observation')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('local_panel_indicators_remark');
      const valueControl = this.form.get('local_panel_indicators_value');
 
      this.showLocalPanelIndicatorsInput = false;
      valueControl?.reset();
 
      if (value === 'Ops') {
        remarkControl?.setValue('SAT');
      } else if (value === 'Non-ops') {
        this.showLocalPanelIndicatorsInput = true;
        remarkControl?.setValue('UNSAT');
      } else {
        remarkControl?.setValue(null);
      }
      this.computeOverallRemark();
    });
 
    this.form.get('local_panel_indicators_remark')?.valueChanges.subscribe(() => {
      this.computeOverallRemark();
    });
 
    // -------- Ser 6: Auto Mode --------
    // Ops → SAT | Non-ops → UNSAT + dialog box
    this.form.get('auto_mode_observation')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('auto_mode_remark');
      const valueControl = this.form.get('auto_mode_value');
 
      this.showAutoModeInput = false;
      valueControl?.reset();
 
      if (value === 'Ops') {
        remarkControl?.setValue('SAT');
      } else if (value === 'Non-ops') {
        this.showAutoModeInput = true;
        remarkControl?.setValue('UNSAT');
      } else {
        remarkControl?.setValue(null);
      }
      this.computeOverallRemark();
    });
 
    this.form.get('auto_mode_remark')?.valueChanges.subscribe(() => {
      this.computeOverallRemark();
    });
 
    // -------- Ser 7: Condition of Foundations --------
    // AN input — if observation text entered → SAT with observation | If blank → SAT
    this.form.get('foundation_observation')?.valueChanges.subscribe((value) => {
      const remarkControl = this.form.get('foundation_remark');
      if (value && value.trim() !== '') {
        if (!remarkControl?.value || remarkControl?.value === 'SAT') {
          remarkControl?.setValue('SAT with observation', { emitEvent: false });
        }
      } else {
        remarkControl?.setValue('SAT', { emitEvent: false });
      }
      this.computeOverallRemark();
    });
 
    this.form.get('foundation_remark')?.valueChanges.subscribe(() => {
      this.computeOverallRemark();
    });
  }
 
  /**
   * Compute the overall remark based on all individual remarks:
   * - If ANY remark is 'UNSAT' → overall = 'UNSAT'
   * - Else if ANY remark is 'SAT with observation' → overall = 'SAT with observation'
   * - Else if ALL remarks are 'SAT' → overall = 'SAT'
   * - Else → null (not all filled yet)
   */
  private computeOverallRemark(): void {
    const remarkFields = [
      'remote_panel_elec_hygiene_remark',
      'remote_panel_switches_remark',
      'remote_panel_indicators_remark',
      'local_panel_elec_hygiene_remark',
      'local_panel_switches_remark',
      'local_panel_indicators_remark',
      'auto_mode_remark',
      'foundation_remark',
    ];
 
    const values = remarkFields
      .map(field => this.form.get(field)?.value)
      .filter(v => v !== null && v !== undefined && v !== '');
 
    const overallControl = this.form.get('overall_remark');
 
    if (values.length === 0) {
      overallControl?.setValue(null, { emitEvent: false });
      return;
    }
 
    if (values.includes('UNSAT')) {
      overallControl?.setValue('UNSAT', { emitEvent: false });
    } else if (values.includes('SAT with observation')) {
      overallControl?.setValue('SAT with observation', { emitEvent: false });
    } else if (values.every(v => v === 'SAT')) {
      overallControl?.setValue('SAT', { emitEvent: false });
    } else {
      overallControl?.setValue(null, { emitEvent: false });
    }
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
      authority_files: this.uploadedAuthorityFiles.map(f => f.id || f.file_path),
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
            (this.toast.showSuccess('Forms Submitted successfully.'),
              (this.showApprovalWorkflowPopup = true));
          } else {
            (this.toast.showSuccess('Forms Saved successfully.'),
              this.router.navigate(['/afterAuth/ship-returns/transactions/trial']));
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
    this.apiService.getDropdownData('master/locations/', { labelKey: 'name', valueKey: 'id' }).subscribe((res) => {
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
    const trialRow = trialRowFromGetFormResponse(this.formApiService, response);

    this.eqpList = Array.isArray(trialRow.equipment_details)
      ? trialRow.equipment_details
      : [];
    this.activeTab =
      this.formApiService.currentEquipmentNomenclature || this.eqpList[0] || null;

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

    const equipmentPayload = this.extractEquipmentPayload(finalJsonData, equipmentKey);

    this.fillData(equipmentPayload);
    this.cdr.detectChanges();
  } catch (e) {
    console.error('Trial prefill failed (Grease Separator)', e);
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
    const equipmentPayload = this.extractEquipmentPayload(finalJsonData, nomenclature);

    this.fillData(equipmentPayload);
    this.cdr.detectChanges();
  } catch (error) {
    console.error('Failed to load Grease Separator data for selected equipment', error);
    this.toastService.showError('Failed to load selected equipment data.');
  }
}

private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
  if (!jsonData || typeof jsonData !== 'object') return null;

  const isFlat =
    'remote_panel_elec_hygiene_observation' in jsonData ||
    'date_of_conduct_trail' in jsonData ||
    'foundation_observation' in jsonData;
  if (isFlat) return jsonData;

  return jsonData[equipmentKey] ?? null;
}

trackByEquipment(_: number, equipment: any): string | number {
  return equipment?.equipment_id ?? equipment?.id ?? equipment?.nomenclature ?? _;
}

isSameEquipment(left: any, right: any): boolean {
  return (
    (left?.equipment_id ?? left?.id ?? left?.nomenclature) ===
    (right?.equipment_id ?? right?.id ?? right?.nomenclature)
  );
}

/** Tab switch pe form reset — ship field preserve karke */
private resetFormData(): void {
  const ship = this.form.get('ship')?.value;

  Object.keys(this.form.controls).forEach((key) => {
    const control = this.form.get(key);
    if (!control) return;
    control.enable({ emitEvent: false });
    control.reset('', { emitEvent: false });
  });

  this.showRemotePanelSwitchesInput = false;
  this.showRemotePanelIndicatorsInput = false;
  this.showLocalPanelSwitchesInput = false;
  this.showLocalPanelIndicatorsInput = false;
  this.showAutoModeInput = false;

  this.form.patchValue({ ship }, { emitEvent: false });
}

/** Poore form ko equipment-specific payload se generic tarike se hydrate karta hai,
 *  aur "Non-ops" wale dialog-box visibility flags ko bhi manually restore karta hai
 *  (kyunki setupConditionalLogic() abhi call hi nahi ho rahi hai ngOnInit mein,
 *  isliye ye flags kisi bhi valueChanges se automatically set nahi honge). */
fillData(payload: any): void {
  if (!payload) return;

  Object.keys(payload).forEach((key) => {
    if (key === 'ship') return;

    const control = this.form.get(key);
    if (control) {
      control.setValue(payload[key] ?? '', { emitEvent: false });
    }
  });

  this.form.get('ship')?.setValue(
    payload.ship || this.form.get('ship')?.value || '',
    { emitEvent: false },
  );

  // ---- Dialog-box visibility flags restore karo saved "Non-ops" values se ----
  this.showRemotePanelSwitchesInput = payload.remote_panel_switches_observation === 'Non-ops';
  this.showRemotePanelIndicatorsInput = payload.remote_panel_indicators_observation === 'Non-ops';
  this.showLocalPanelSwitchesInput = payload.local_panel_switches_observation === 'Non-ops';
  this.showLocalPanelIndicatorsInput = payload.local_panel_indicators_observation === 'Non-ops';
  this.showAutoModeInput = payload.auto_mode_observation === 'Non-ops';
}

}
