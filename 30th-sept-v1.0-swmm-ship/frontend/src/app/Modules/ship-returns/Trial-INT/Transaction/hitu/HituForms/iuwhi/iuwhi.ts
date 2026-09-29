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
  selector: 'app-iuwhi',
  standalone: true,
  templateUrl: './iuwhi.html',
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
export class IUWHI {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;
  form!: FormGroup;
  uploadedAuthorityFiles: UploadedFileItem[] = [];
  uploadDoc: UploadedFileItem[] = [];
  selectedShipId: number = 0;

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  placesOptions: any[] = [];
  usersList: any[] = [];
  private readonly fileControlNames = [
    'file',
    'file1',
    'file2',
    'file3',
    'file4',
    'file5',
    'file6',
    'file7',
    'pressure_cert_files',
    'mlab_report_files',
    'uw_hull_files',
    'endoscopy_files',
    'internal_hull_files',
    'repair_list_files',
    'pressure_cert_files3',
    'hose_test_files',
    'iccp_dd_files',
  ];

  occasionOptions = [
    { label: 'SR', value: 'SR' },
    { label: 'NR', value: 'NR' },
    { label: 'MR', value: 'MR' },
    { label: 'EAMP', value: 'EAMP' },
    { label: 'AMP', value: 'AMP' },
    { label: 'Ops Docking', value: 'Ops Docking' },
    { label: 'Emergency docking', value: 'Emergency docking' },
  ];

  yesNoOptions = [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ];

  yesNilOptions = [
    { label: 'Yes', value: 'yes' },
    { label: 'Nil', value: 'nil' },
  ];

  yesNoNilOptions = [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
    { label: 'Nil', value: 'nil' },
  ];

  surveyTypeOptions = [
    { label: 'Visual', value: 'visual' },
    { label: 'USG', value: 'usg' },
    { label: 'Hammer', value: 'hammer' },
    { label: 'Other', value: 'other' },
  ];

  bilgeTypeOptions = [
    { label: 'Box type', value: 'box' },
    { label: 'Flat plate', value: 'flat' },
    { label: 'Other', value: 'other' },
  ];

  submittedPendingOptions = [
    { label: 'Submitted', value: 'submitted' },
    { label: 'Pending', value: 'pending' },
  ];
  submittedPendingNAOptions = [
    { label: 'Submitted', value: 'submitted' },
    { label: 'Pending', value: 'pending' },
    { label: 'NA', value: 'Na' },
  ];

  submittedPendingNilOptions = [
    { label: 'Submitted', value: 'submitted' },
    { label: 'Pending', value: 'pending' },
    { label: 'Nil', value: 'nil' },
  ];

  undertakenPendingOptions = [
    { label: 'Undertaken', value: 'undertaken' },
    { label: 'Pending', value: 'pending' },
  ];

  completedPendingOptions = [
    { label: 'Completed', value: 'completed' },
    { label: 'Pending', value: 'pending' },
  ];

  clearedPendingOptions = [
    { label: 'Cleared', value: 'cleared' },
    { label: 'Pending', value: 'pending' },
  ];

  satUnsatOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  checklistViewOptions = [{ label: 'Show Checklist', value: 'show' }];

  shipOptions: any[] = [];
  locationOptions: any[] = [];
  reps_present_options: any[] = [];

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

  /** Ye 'multiple' file-upload fields hain ([multiple]="true" HTML mein) — inki value
   *  array honi chahiye, baaki fileControlNames single-object honge */
  private readonly multiFileControlNames = [
    'pressure_cert_files',
    'mlab_report_files',
    'uw_hull_files',
    'endoscopy_files',
    'internal_hull_files',
    'repair_list_files',
    'pressure_cert_files3',
    'hose_test_files',
    'iccp_dd_files',
  ];

  /** Signature fields — bhi single file-upload hain */
  private readonly signatureFieldNames = [
    'ship_staff_signature',
    'refitting_authority_signature',
    'hitu_inspector_signature',
  ];

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private toast: ToastService,
    private toastService: ToastService,
    private route: ActivatedRoute,
    public formApiService: FormApiService,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadPlaceOfConductTrail();
    this.loadShips();
    this.loadLocation();
    this.loadRepsPresentOptions();
    this.form.get('reps_present')?.valueChanges.subscribe((userType) => {
      if (userType) {
        this.getUsersByType(userType);
      }
    });
    this.loadTrialPrefillFromQuery();
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
      reps_present: [''],
      reps_present_user: [[]],
      reps_present_other_user: [''],
      survey_type: [''],
      survey_type_details: [''],
      doubler_repair_status: [''],
      doubler_repair_details: [''],
      plate_renewal_location: [''],
      rudder_misalignment_status: [''],
      rudder_misalignment_details: [''],
      hull_repair_status: [''],
      hull_repair_details: [''],
      bilge_type: [''],
      bilge_type_other: [''],
      bilge_type_details: [''],
      bilge_survey_status: [''],
      bilge_survey_details: [''],
      bilge_plate_renewal_status: [''],
      bilge_plate_renewal_details: [''],
      bilge_ndt_status: [''],
      bilge_ndt_details: [''],
      pressure_cert_status: [''],
      pressure_cert_details: [''],
      qc_cert_status: [''],
      qc_cert_details: [''],
      tank_pressure_status: [''],
      tank_pressure_details: [''],
      sea_tube_pressure_status: [''],
      sea_tube_pressure_details: [''],
      ndt_hotwork_status: [''],
      ndt_hotwork_details: [''],
      dd_check_status: [''],
      dd_check_result: [''],
      dd_check_details: [''],
      mlab_report_status: [''],
      mlab_report_details: [''],
      cofferdam_status: [''],
      cofferdam_details: [''],
      potting_status: [''],
      uw_hull_status: [''],
      uw_hull_details: [''],
      endoscopy_status: [''],
      endoscopy_details: [''],
      internal_hull_status: [''],
      internal_hull_details: [''],
      repair_list_status: [''],
      repair_list_details: [''],
      pressure_cert_status3: [''],
      pressure_cert_details3: [''],
      hose_test_status: [''],
      hose_test_details: [''],
      iccp_dd_status: [''],
      iccp_dd_details: [''],
      dialog_field: [''],
      new_observation: [''],
      new_ship_name: [''],
      new_ship_rank: [''],
      new_ship_designation: [''],
      new_refit_name: [''],
      new_refit_rank: [''],
      new_refit_designation: [''],
      new_hitu_name: [''],
      new_hitu_rank: [''],
      new_hitu_designation: [''],
      intermediate_checklist_view: [''],
      file: [''],
      file1: [''],
      file2: [''],
      file3: [''],
      file4: [''],
      file5: [''],
      file6: [''],
      file7: [''],
      pressure_cert_files: [''],
      mlab_report_files: [''],
      uw_hull_files: [''],
      endoscopy_files: [''],
      internal_hull_files: [''],
      repair_list_files: [''],
      pressure_cert_files3: [''],
      hose_test_files: [''],
      iccp_dd_files: [''],
      // -----------------signatres

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

  handleFile(files: UploadedFileItem[] | File | null): void {
    this.uploadDoc = Array.isArray(files) ? files : [];
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
  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  buildPayload() {
    const formValues = this.form.getRawValue();

    const extractFileReference = (value: any): any => {
      if (value === null || value === undefined || value === '') return null;
      if (typeof value === 'string' || typeof value === 'number') return value;
      if (Array.isArray(value)) {
        return value
          .map((item) => item?.id || item?.file_path || item)
          .filter(Boolean);
      }

      return value?.id || value?.file_path || null;
    };

    const payload: any = {
      ...formValues,
      authority_doc: FileUrlUtil.getFileUrl(formValues.authority_doc?.id),
    };

    for (const controlName of this.fileControlNames) {
      payload[controlName] = extractFileReference(formValues[controlName]);
    }

    return payload;
  }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      this.form.reset();
      this.cdr.detectChanges();
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

      this.form.patchValue(
        { ship_or_submarine: trialRow.ship_type_name },
        { emitEvent: false },
      );
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
      console.error('Trial prefill failed (IUWHI)', e);
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
      console.error('Failed to load IUWHI data for selected equipment', error);
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'survey_type' in jsonData ||
      'date_of_conduct_trail' in jsonData ||
      'bilge_type' in jsonData;
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
  }

  /** Poore form ko equipment-specific payload se generic tarike se hydrate karta hai,
   *  aur saare file-upload fields (single + multiple + authority_doc + signatures)
   *  ko special handling deta hai. */
  fillData(payload: any): void {
    if (!payload) return;

    const allFileFields = [
      'authority_doc',
      ...this.fileControlNames,
      ...this.signatureFieldNames,
    ];

    Object.keys(payload).forEach((key) => {
      if (key === 'ship' || allFileFields.includes(key)) return;

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

    // authority_doc — single file
    this.form
      .get('authority_doc')
      ?.setValue(this.buildFileUploadValue(payload.authority_doc), {
        emitEvent: false,
      });

    // Signature fields — single file each
    this.signatureFieldNames.forEach((field) => {
      this.form
        .get(field)
        ?.setValue(this.buildFileUploadValue(payload[field]), {
          emitEvent: false,
        });
    });

    // fileControlNames — kuch single hain, kuch multiple
    this.fileControlNames.forEach((field) => {
      const isMulti = this.multiFileControlNames.includes(field);
      const value = payload[field];

      if (isMulti) {
        this.form.get(field)?.setValue(this.buildFileUploadValueArray(value), {
          emitEvent: false,
        });
      } else {
        this.form
          .get(field)
          ?.setValue(this.buildFileUploadValue(value), { emitEvent: false });
      }
    });
  }

  /** Backend se aayi file-URL string ko FileUploadComponent ke required
   *  { id, name, file_path } shape mein convert karta hai — single file wale liye */
  private buildFileUploadValue(value: any): UploadedFileItem | null {
    if (!value) {
      return null;
    }

    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      value.name &&
      value.file_path
    ) {
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

  /** [multiple]="true" wale file-upload fields ke liye — saved value ek array
   *  (URL strings ya IDs ka) ho sakta hai, use array of UploadedFileItem mein convert karta hai */
  private buildFileUploadValueArray(value: any): UploadedFileItem[] {
    if (!value) {
      return [];
    }

    const list = Array.isArray(value) ? value : [value];

    return list
      .map((item: any) => this.buildFileUploadValue(item))
      .filter((item): item is UploadedFileItem => item !== null);
  }
}
