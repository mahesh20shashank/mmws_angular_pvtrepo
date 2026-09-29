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
  FormInputTableWithHeaders,
  ReusableHeaderCell,
  ReusableTableColumnWithHeaders,
} from '../../../../ui/form-input-table-with-headers/form-input-table-with-headers.component';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FileUploadComponent } from '../../../../ui/file-upload/file-upload.component';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';
export interface UploadedFileItem {
  id?: string;
  name: string;
  file_path: string;
}

@Component({
  selector: 'app-citadel-data-feeding',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    SelectComponent,
    CalenderComponent,
    InputComponent,
    FormInputTableWithHeaders,
    ParameterCardComponent,
    ApprovalWorkFlow,
    FileUploadComponent,
  ],
  templateUrl: './citadel-data-feeding.html',
  styleUrl: './citadel-data-feeding.css',
})
export class CitadelDataFeeding implements OnInit {
  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  readonly restartIcon = 'rotate-ccw';
  showApprovalWorkflowPopup = false;
    isSubmitTime = false;

  bdcForm!: FormGroup;
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
  loading = false;

  ocationofconduct: any[] = [];
  nbcCategoryOptions: { label: string; value: string }[] = [];
  commandOptions: any[] = [];
  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  stbdOptions: any[] = [];
  yearOfManufactureOptions: any[] = [];

  totalRowsTrialStatus = 1;
  trialStatusTableData: Record<string, string>[] = [];

  totalRowsOtherObservations = 1;
  otherObservationsTableData: Record<string, string>[] = [];
  placesOptions: any[] = [];

  readonly overallRemarksOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'SAT with observations', value: 'SAT with observations' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  trialStatusColumns: ReusableTableColumnWithHeaders[] = [
    { field: 's_no', header: 'Ser No', width: '60px', fieldType: 'serial' },
    {
      field: 'citadel_zone',
      header: 'Citadel (as per design)',
      width: '180px',
      fieldType: 'text',
    },
    {
      field: 'air_pressure_design',
      header: 'Design',
      width: '120px',
      fieldType: 'text',
    },
    {
      field: 'air_pressure_achieved',
      header: 'Achieved',
      width: '120px',
      fieldType: 'text',
    },
    { field: 'bleed_ops', header: 'Ops', width: '100px', fieldType: 'text' },
    {
      field: 'bleed_non_ops',
      header: 'Non Ops',
      width: '100px',
      fieldType: 'text',
    },
    { field: 'soqc_ops', header: 'Ops', width: '100px', fieldType: 'text' },
    {
      field: 'soqc_non_ops',
      header: 'Non Ops',
      width: '100px',
      fieldType: 'text',
    },
    {
      field: 'afu_manual_ops',
      header: 'Ops',
      width: '140px',
      fieldType: 'textarea',
    },
    {
      field: 'afu_manual_non_ops',
      header: 'Non Ops',
      width: '140px',
      fieldType: 'textarea',
    },
    {
      field: 'afu_remote_ops',
      header: 'Ops',
      width: '140px',
      fieldType: 'textarea',
    },
    {
      field: 'afu_remote_non_ops',
      header: 'Non Ops',
      width: '140px',
      fieldType: 'textarea',
    },
  ];

  otherObservationsColumns: ReusableTableColumnWithHeaders[] = [
    { field: 's_no', header: 'Ser No', width: '60px', fieldType: 'serial' },
    {
      field: 'observation',
      header: 'Observation',
      width: '100%',
      fieldType: 'textarea',
    },
  ];

  trialStatusHeaderRows: ReusableHeaderCell[][] = [
    [
      { header: 'Ser No', rowspan: 3 },
      { header: 'Citadel (as per design)', rowspan: 3 },
      { header: 'Air pressure', colspan: 2 },
      { header: 'Remarks', colspan: 8 },
    ],
    [
      { header: 'Design', rowspan: 2 },
      { header: 'Achieved', rowspan: 2 },
      { header: 'Bleed Valve', colspan: 2 },
      { header: 'SOQC Valve', colspan: 2 },
      { header: 'AFU Blower — Manual', colspan: 2 },
      { header: 'AFU Blower — Remote', colspan: 2 },
    ],
    [
      { header: 'Ops' },
      { header: 'Non Ops' },
      { header: 'Ops' },
      { header: 'Non Ops' },
      { header: 'Ops' },
      { header: 'Non Ops' },
      { header: 'Ops' },
      { header: 'Non Ops' },
    ],
  ];

  selectedFile: File | null = null;
  fileName: string = 'No file chosen';

  @Output() fileSelected = new EventEmitter<File | null>();

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
    private router: Router,
    private apiService: ApiService,
    private toast: ToastService,
    public formApiService: FormApiService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.bdcForm = this.fb.group({});
    this.buildForm();

    this.ocationofconduct = [
      { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
      { label: 'End of Refit Trials', value: 'End of Refit Trials' },
      { label: 'Surprise Checks', value: 'Surprise Checks' },
    ];

    this.nbcCategoryOptions = [
      { label: 'A', value: 'A' },
      { label: 'B', value: 'B' },
      { label: 'C', value: 'C' },
      { label: 'D', value: 'D' },
    ];

    this.updateTrialStatusTableRows(this.totalRowsTrialStatus);
    this.updateOtherObservationsTableRows(this.totalRowsOtherObservations);
    this.loadPlaceOfConductTrail();
    this.loadTrialPrefillFromQuery();
  }

  buildForm() {
    this.bdcForm = this.fb.group({
      // Header Fields
      port: [''],
      class_of_ship: [''],
      ship: [''],
      date_of_inspection: [''],
      place_of_conduct_of_trials: [''],
      occasion_for_conduct_of_trials: [''],
      authority_for_conduct_of_trials: [''],
      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],
      nbc_category: [''],
      total_citadel_zones: [''],
      no_of_nbc_filters: [''],
      nbc_last_renewal: [''],
      nbc_next_due: [{ value: '', disabled: true }],

      overall_remarks: [''],
    });

    this.setupNbcRenewalDateLogic();
  }

  private setupNbcRenewalDateLogic(): void {
    this.bdcForm
      .get('nbc_last_renewal')
      ?.valueChanges.subscribe((lastRenewal) => {
        const nextDueControl = this.bdcForm.get('nbc_next_due');

        if (!lastRenewal) {
          nextDueControl?.setValue('', { emitEvent: false });
          return;
        }

        const parts = String(lastRenewal).split('-').map(Number);
        if (parts.length !== 3 || parts.some((n) => isNaN(n))) {
          nextDueControl?.setValue('', { emitEvent: false });
          return;
        }

        const [year, month, day] = parts;
        const nextDue = `${year + 5}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        nextDueControl?.setValue(nextDue, { emitEvent: false });
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
  updateTrialStatusTableRows(count: number): void {
    const currentLength = this.trialStatusTableData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.trialStatusTableData.push({
          citadel_zone: '',
          air_pressure_design: '',
          air_pressure_achieved: '',
          bleed_ops: '',
          bleed_non_ops: '',
          soqc_ops: '',
          soqc_non_ops: '',
          afu_manual_ops: '',
          afu_manual_non_ops: '',
          afu_remote_ops: '',
          afu_remote_non_ops: '',
        });
      }
    }
    if (count < currentLength) {
      this.trialStatusTableData.splice(count);
    }
  }

  handleTrialStatusTableChange(
    index: number,
    field: string,
    value: string,
  ): void {
    this.trialStatusTableData[index][field] = value;
    this.trialStatusTableData = [...this.trialStatusTableData];
  }

  updateOtherObservationsTableRows(count: number): void {
    const currentLength = this.otherObservationsTableData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.otherObservationsTableData.push({ observation: '' });
      }
    }
    if (count < currentLength) {
      this.otherObservationsTableData.splice(count);
    }
  }

  handleOtherObservationsTableChange(
    index: number,
    field: string,
    value: string,
  ): void {
    this.otherObservationsTableData[index][field] = value;
    this.otherObservationsTableData = [...this.otherObservationsTableData];
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }

  buildPayload() {
    const formDataValues = this.bdcForm.getRawValue();

    const payload: any = {
      ...formDataValues,
      trial_status: this.trialStatusTableData,
      other_observations: this.otherObservationsTableData,
    };

    return payload;
  }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      this.bdcForm.reset();
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
      console.error('Trial prefill failed (Citadel Data Feeding)', e);
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
        'Failed to load Citadel Data Feeding data for selected equipment',
        error,
      );
      this.toast.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'nbc_category' in jsonData ||
      'total_citadel_zones' in jsonData ||
      'trial_status' in jsonData;
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

  /** Tab switch pe form + dono tables reset — ship field ko preserve karke */
  private resetFormData(): void {
    const ship = this.bdcForm.get('ship')?.value;

    Object.keys(this.bdcForm.controls).forEach((key) => {
      const control = this.bdcForm.get(key);
      if (!control) return;
      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    this.bdcForm.patchValue({ ship }, { emitEvent: false });

    // nbc_next_due wapas disabled state mein (auto-computed field)
    this.bdcForm.get('nbc_next_due')?.disable({ emitEvent: false });

    this.trialStatusTableData = [];
    this.totalRowsTrialStatus = 1;
    this.updateTrialStatusTableRows(1);

    this.otherObservationsTableData = [];
    this.totalRowsOtherObservations = 1;
    this.updateOtherObservationsTableRows(1);
  }

  /** Poore form + dono tables ko equipment-specific payload se hydrate karta hai. */
  fillData(payload: any): void {
    if (!payload) return;

    const specialKeys = [
      'authority_doc',
      'ship',
      'nbc_next_due',
      'trial_status',
      'other_observations',
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

    // nbc_next_due — auto-computed hai (disabled control), directly set karo
    this.bdcForm
      .get('nbc_next_due')
      ?.setValue(payload.nbc_next_due ?? '', { emitEvent: false });

    // authority_doc — URL string ko file-upload component ke required object shape mein convert karo
    this.bdcForm
      .get('authority_doc')
      ?.setValue(this.buildFileUploadValue(payload.authority_doc), {
        emitEvent: false,
      });

    // ----- Trial Status Table -----
    const trialStatus = Array.isArray(payload.trial_status)
      ? payload.trial_status
      : [];
    if (trialStatus.length) {
      this.trialStatusTableData = trialStatus.map((row: any) => ({
        citadel_zone: row?.citadel_zone ?? '',
        air_pressure_design: row?.air_pressure_design ?? '',
        air_pressure_achieved: row?.air_pressure_achieved ?? '',
        bleed_ops: row?.bleed_ops ?? '',
        bleed_non_ops: row?.bleed_non_ops ?? '',
        soqc_ops: row?.soqc_ops ?? '',
        soqc_non_ops: row?.soqc_non_ops ?? '',
        afu_manual_ops: row?.afu_manual_ops ?? '',
        afu_manual_non_ops: row?.afu_manual_non_ops ?? '',
        afu_remote_ops: row?.afu_remote_ops ?? '',
        afu_remote_non_ops: row?.afu_remote_non_ops ?? '',
      }));
      this.totalRowsTrialStatus = this.trialStatusTableData.length;
    } else {
      this.trialStatusTableData = [];
      this.updateTrialStatusTableRows(1);
    }

    // ----- Other Observations Table -----
    const otherObs = Array.isArray(payload.other_observations)
      ? payload.other_observations
      : [];
    if (otherObs.length) {
      this.otherObservationsTableData = otherObs.map((row: any) => ({
        observation: row?.observation ?? '',
      }));
      this.totalRowsOtherObservations = this.otherObservationsTableData.length;
    } else {
      this.otherObservationsTableData = [];
      this.updateOtherObservationsTableRows(1);
    }
  }

  /** Backend se aayi authority_doc (plain URL string ya already-object) ko
   *  FileUploadComponent ke required { id, name, file_path } shape mein convert karta hai */
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
