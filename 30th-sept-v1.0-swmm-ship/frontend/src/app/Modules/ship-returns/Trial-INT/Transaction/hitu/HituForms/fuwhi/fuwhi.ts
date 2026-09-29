import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormBuilder } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
import { Apiendpoints } from '../../../../ApiEndPoints';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { MultiSelectDropdownComponent } from '../../../../ui/multiselect';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-fuwhi',
  standalone: true,
  templateUrl: './fuwhi.html',
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
    MultiSelectDropdownComponent,
  ],
})
export class FUWHI {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
  draftLoading = false;
  saveLoading = false;
  submitLoading = false;
  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';
  form!: FormGroup;

  selectedShipId: number = 0;

  placesOptions: any[] = [];
  usersList: any[] = [];
  occasionOptions = [
    { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
    { label: 'End of Refit Trials', value: 'End of Refit Trials' },
    { label: 'Surprise Checks', value: 'Surprise Checks' },
    { label: 'HVAC Audit', value: 'HVAC Audit' },
  ];

  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  locationOptions: any[] = [];
  reps_present_options: any[] = [];

  // Dropdown option arrays for native-select replacements
  iuwhiDefectOptions = [
    { label: 'Liquidated', value: 'liquidated' },
    { label: 'Pending', value: 'pending' },
  ];

  internalDefectsOptions = [
    { label: 'Completed', value: 'completed' },
    { label: 'Pending', value: 'pending' },
  ];

  valveFitmentOptions = [
    { label: 'Completed', value: 'completed' },
    { label: 'Pending', value: 'pending' },
  ];

  trimConditionOptions = [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ];

  doublersOptions = [
    { label: 'Confirmed', value: 'confirmed' },
    { label: 'No', value: 'no' },
  ];

  undockingOptions = [
    {
      label: 'Ship cleared for undocking (Subject to liquidation of defects)',
      value: 'cleared',
    },
    {
      label: 'Ship not cleared for undocking (Re-offer for inspection)',
      value: 'not_cleared',
    },
  ];

  // Uploaded file tracking arrays
  uploadedIuwhiDefectFiles: UploadedFileItem[] = [];

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
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private apiService: ApiService,
    private toast: ToastService,
    private toastService: ToastService,
    public formApiService: FormApiService,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadShips();
    this.loadLocation();
    this.loadRepsPresentOptions();
    this.loadPlaceOfConductTrail();
    this.loadTrialPrefillFromQuery();
    this.form.get('reps_present')?.valueChanges.subscribe((userType) => {
      if (userType) {
        this.getUsersByType(userType);
      }
    });
  }

  buildForm() {
    this.form = this.fb.group({
      ship: [{ value: '', disabled: true }],
      ship_or_submarine: [{ value: '', disabled: true }],
      date_of_conduct_trail: [''],
      place_of_conduct_trail: [''],
      document_no: [''],
      occasion_of_conduct_trail: [''],
      authority: [''],
      authority_date: [''],
      authority_doc: [''],

      defect_doc: [''],

      reps_present: [''],
      iuwhi_defect_status: [''],
      iuwhi_defect_details: [''],
      internal_defects_status: [''],
      internal_defects_details: [''],
      valve_fitment_status: [''],
      valve_fitment_details: [''],
      trim_condition_status: [''],
      doublers_status: [''],
      doublers_details: [''],
      fresh_defects: [''],
      undocking_status: [''],
      final_ship_name: [''],
      final_ship_rank: [''],
      final_ship_dsg: [''],
      final_refit_name: [''],
      final_refit_rank: [''],
      final_refit_dsg: [''],
      final_hitu_name: [''],
      final_hitu_rank: [''],
      final_hitu_dsg: [''],
      ship_staff_signature: [''],
      refitting_authority_signature: [''],
      hitu_inspector_signature: [''],

      ship_staff_name: [''],
      refitting_authority_name: [''],
      hitu_inspector_name: [''],

      ship_staff_rank: [''],
      refitting_authority_rank: [''],
      hitu_inspector_rank: [''],

      ship_staff_dsg: [''],
      refitting_authority_dsg: [''],
      hitu_inspector_dsg: [''],
    });
  }

  radioOptions = ['Yes', 'No'];

  loadShips() {
    this.apiService
      .getDropdownData('master/ships/', {
        labelKey: 'name',
        valueKey: 'id',
      })

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
        { labelKey: 'name', valueKey: 'id' },
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
  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  /* ------------------------------- BUILD PAYLOAD ------------------------------- */

  buildPayload() {
    const formDataValues = this.form.value;
    const formValues = this.form.getRawValue();

    const payload: any = {
      ...formDataValues,
      authority_doc: FileUrlUtil.getFileUrl(formValues.authority_doc?.id),
      defect_doc: FileUrlUtil.getFileUrl(formValues.defect_doc?.id),
      ship_staff_signature: FileUrlUtil.getFileUrl(
        formValues.ship_staff_signature?.id,
      ),
      refitting_authority_signature: FileUrlUtil.getFileUrl(
        formValues.refitting_authority_signature?.id,
      ),
      hitu_inspector_signature: FileUrlUtil.getFileUrl(
        formValues.hitu_inspector_signature?.id,
      ),
      iuwhi_defect_files: this.uploadedIuwhiDefectFiles.map(
        (f) => f.id || f.file_path,
      ),
    };

    return payload;
  }

  /* ------------------------------- SAVE ------------------------------- */

  handleSave(type: 'draft' | 'save' | 'submit') {
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

      this.form.patchValue(
        { ship_or_submarine: trialRow.ship_type_name },
        { emitEvent: false },
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
      console.error('Trial prefill failed (FUWHI)', e);
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
      console.error('Failed to load FUWHI data for selected equipment', error);
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'ship' in jsonData ||
      'date_of_conduct_trail' in jsonData ||
      'undocking_status' in jsonData;
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

  /** Tab switch pe form reset — ship field preserve karke */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;
      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    this.form.patchValue({ ship }, { emitEvent: false });

    this.uploadedIuwhiDefectFiles = [];
  }

  /** Poore form ko equipment-specific payload se hydrate karta hai.
   *  Is form mein koi valueChanges subscription nahi hai jo dusre fields ko
   *  reset/derive karta ho — saare *ngIf sirf apne khud ke control ki value
   *  dekhte hain — isliye ek hi generic loop kaafi hai */
  fillData(payload: any): void {
    if (!payload) return;

    const fileFields = [
      'authority_doc',
      'ship_staff_signature',
      'refitting_authority_signature',
      'hitu_inspector_signature',
    ];

    Object.keys(payload).forEach((key) => {
      if (fileFields.includes(key) || key === 'ship') return;
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

    // saare 4 file-upload fields ko required { id, name, file_path } shape mein convert karo
    fileFields.forEach((field) => {
      this.form
        .get(field)
        ?.setValue(this.buildFileUploadValue(payload[field]), {
          emitEvent: false,
        });
    });
  }

  /** Backend se aayi file URL (plain string ya already-object) ko
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
