import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import {
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

import {
  ReusableInputTableComponent,
  ReusableTableColumn,
} from '../../../../ui/reusable-input-table/reusable-input-table.component';

import { CalenderComponent } from '../../../../ui/calender.component';
import { ParameterCardComponent } from '../../../../ui/parameter-card/parameter-card.component';
import { InputComponent } from '../../../../ui/input.component';
import {
  FileUploadComponent,
  UploadedFileItem,
} from '../../../../ui/file-upload/file-upload.component';

import { SelectWithSearchComponent } from '../../../../ui/select-with-search/select-with-search-box.component';
import { TabsComponent } from '../../../../ui/tabs/tabs.component';

import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-float-worthiness-submarine',
  standalone: true,
  templateUrl: './float-worthiness-submarine.html',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    SelectComponent,
    ReusableInputTableComponent,
    CalenderComponent,
    InputComponent,
    ParameterCardComponent,
    FileUploadComponent,
    ApprovalWorkFlow,
    TabsComponent,
  ],
})
export class FloatWorthinessSubmarine implements OnInit {
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
  uploadedAuthorityFiles: UploadedFileItem[] = [];

  shipOptions: any[] = [];
  placesOptions: any[] = [];

  // =========================================================
  // TABLE DATA
  // =========================================================

  visualInspectionDetails: any[] = [];

  internalUnderwaterTankDetails: any[] = [];

  internalUnderwaterCompartmentDetails: any[] = [];

  // =========================================================
  // TABLE COLUMNS
  // =========================================================

  visualInspectionColumns: ReusableTableColumn[] = [];

  internalUnderwaterTankColumns: ReusableTableColumn[] = [];

  internalUnderwaterCompartmentColumns: ReusableTableColumn[] = [];

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
    public formApiService: FormApiService,
    private toast: ToastService,
    private route: ActivatedRoute,
  ) {}

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    this.buildForm();

    this.initializeColumns();

    this.initializeDefaultRows();

    this.loadShips();

    this.loadPlaceOfConductTrail();
    this.loadTrialPrefillFromQuery();
  }

  // =========================================================
  // FORM
  // =========================================================

  buildForm() {
    this.form = this.fb.group({
      submarine: ['', Validators.required],

      date_of_conduct_trail: ['', Validators.required],

      place_of_conduct_trail: ['', Validators.required],

      authority: ['', Validators.required],

      authority_date: ['', Validators.required],

      authority_doc: [''],
    });
  }

  // =========================================================
  // INITIALIZE COLUMNS
  // =========================================================

  initializeColumns(): void {
    // =====================================================
    // TABLE 1
    // =====================================================

    this.visualInspectionColumns = [
      {
        field: 'sr_no',
        header: 'Ser no.',
        width: '60px',
        align: 'center' as const,
      },

      {
        field: 'location',
        header: 'Location',
        width: '200px',
        fieldType: 'drop-down',
        required: true,

        options: [
          { label: 'Foxle', value: 'foxle' },
          { label: 'Catwalk', value: 'catwalk' },
          { label: 'Helo Deck', value: 'helo-deck' },
          { label: 'Weather Deck', value: 'weather-deck' },
          { label: 'Boat Deck', value: 'boat-deck' },
          { label: 'Bridge Top', value: 'bridge-top' },
          { label: 'Other Locations', value: 'others' },
        ],
      },

      {
        field: 'observations',
        header: 'Observations',
        width: '200px',
        fieldType: 'drop-down',
        required: true,

        options: [
          { label: 'Nil', value: 'nil' },
          { label: 'Observation', value: 'obs' },
        ],
      },

      {
        field: 'remarks',
        header: 'Remarks',
        width: '250px',
        fieldType: 'text',
        required: true,
      },
    ];

    // =====================================================
    // TABLE 2
    // =====================================================

    this.internalUnderwaterTankColumns = [
      {
        field: 'sr_no',
        header: 'Ser',
        width: '70px',
        align: 'center',
      },

      {
        field: 'tank_name',
        header: 'Tank Name',
        width: '220px',
        fieldType: 'text',
        required: true,
      },

      {
        field: 'observations',
        header: 'Observations',
        width: '200px',
        fieldType: 'drop-down',
        required: true,

        options: [
          { label: 'Nil', value: 'nil' },
          { label: 'Observation', value: 'obs' },
        ],
      },

      {
        field: 'remarks',
        header: 'Remarks',
        width: '250px',
        fieldType: 'text',
        required: true,
      },
    ];

    // =====================================================
    // TABLE 3
    // =====================================================

    this.internalUnderwaterCompartmentColumns = [
      {
        field: 'sr_no',
        header: 'Ser',
        width: '70px',
        align: 'center',
      },

      {
        field: 'compartment_name',
        header: 'Compartment Name',
        width: '220px',
        fieldType: 'text',
        required: true,
      },

      {
        field: 'observations',
        header: 'Observations',
        width: '200px',
        fieldType: 'drop-down',
        required: true,

        options: [
          { label: 'Nil', value: 'nil' },
          { label: 'Observation', value: 'obs' },
        ],
      },

      {
        field: 'remarks',
        header: 'Remarks',
        width: '250px',
        fieldType: 'text',
        required: true,
      },
    ];
  }

  // =========================================================
  // DEFAULT ROWS
  // =========================================================

  initializeDefaultRows(): void {
    this.visualInspectionDetails = [
      {
        sr_no: 1,
        location: '',
        observations: '',
        remarks: '',
      },
    ];

    this.internalUnderwaterTankDetails = [
      {
        sr_no: 1,
        tank_name: '',
        observations: '',
        remarks: '',
      },
    ];

    this.internalUnderwaterCompartmentDetails = [
      {
        sr_no: 1,
        compartment_name: '',
        observations: '',
        remarks: '',
      },
    ];
  }

  // =========================================================
  // LOAD DROPDOWNS
  // =========================================================

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

  // =========================================================
  // EMPTY CHECKS
  // =========================================================

  isVisualInspectionTableRowEmpty(item: any): boolean {
    return !(item.location || item.observations || item.remarks);
  }

  isTankTableRowEmpty(item: any): boolean {
    return !(item.tank_name || item.observations || item.remarks);
  }

  isCompartmentTableRowEmpty(item: any): boolean {
    return !(item.compartment_name || item.observations || item.remarks);
  }

  // =========================================================
  // VALIDATION
  // =========================================================

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();

      this.toastService.showError('Please fill all required fields.');

      return false;
    }

    const hasEmptyVisualRows = this.visualInspectionDetails.some((item) =>
      this.isVisualInspectionTableRowEmpty(item),
    );

    if (hasEmptyVisualRows) {
      this.toastService.showError(
        'Please fill all rows in Visual Inspection table.',
      );

      return false;
    }

    const hasEmptyTankRows = this.internalUnderwaterTankDetails.some((item) =>
      this.isTankTableRowEmpty(item),
    );

    if (hasEmptyTankRows) {
      this.toastService.showError(
        'Please fill all rows in Internal Underwater Tank table.',
      );

      return false;
    }

    const hasEmptyCompartmentRows =
      this.internalUnderwaterCompartmentDetails.some((item) =>
        this.isCompartmentTableRowEmpty(item),
      );

    if (hasEmptyCompartmentRows) {
      this.toastService.showError(
        'Please fill all rows in Internal Underwater Compartment table.',
      );

      return false;
    }

    return true;
  }

  // =========================================================
  // BUILD PAYLOAD
  // =========================================================

  buildPayload() {
    const value = this.form.value;
    const formDataValues = this.form.getRawValue();
    const visualInspectionData = this.visualInspectionDetails
      .filter((item) => !this.isVisualInspectionTableRowEmpty(item))
      .map((item, index) => ({
        sr_no: index + 1,
        location: item.location,
        observations: item.observations,
        remarks: item.remarks,
      }));

    const internalTankData = this.internalUnderwaterTankDetails
      .filter((item) => !this.isTankTableRowEmpty(item))
      .map((item, index) => ({
        sr_no: index + 1,
        tank_name: item.tank_name,
        observations: item.observations,
        remarks: item.remarks,
      }));

    const internalCompartmentData = this.internalUnderwaterCompartmentDetails
      .filter((item) => !this.isCompartmentTableRowEmpty(item))
      .map((item, index) => ({
        sr_no: index + 1,
        compartment_name: item.compartment_name,
        observations: item.observations,
        remarks: item.remarks,
      }));

    const payload: any = {
      ...value,
      visual_inspection_weather_deck: visualInspectionData,
      internal_underwater_tanks: internalTankData,
      authority_doc: FileUrlUtil.getFileUrl(formDataValues.authority_doc?.id),

      internal_underwater_compartments: internalCompartmentData,
    };
    return payload;
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
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
      console.error('Trial prefill failed (Float Worthiness Submarine)', e);
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
        'Failed to load Float Worthiness data for selected equipment',
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
      'visual_inspection_weather_deck' in jsonData;
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

  /** Tab switch pe form + teeno tables reset — submarine field preserve karke */
  private resetFormData(): void {
    const submarine = this.form.get('submarine')?.value;

    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;
      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    this.form.patchValue({ submarine }, { emitEvent: false });

    this.initializeDefaultRows();
  }

  /** Poore form + teeno reusable tables ko equipment-specific payload se hydrate karta hai */
  fillData(payload: any): void {
    if (!payload) return;

    const specialKeys = [
      'authority_doc',
      'submarine',
      'visual_inspection_weather_deck',
      'internal_underwater_tanks',
      'internal_underwater_compartments',
    ];

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

    // authority_doc — URL string ko file-upload component ke required shape mein convert karo
    this.form
      .get('authority_doc')
      ?.setValue(this.buildFileUploadValue(payload.authority_doc), {
        emitEvent: false,
      });

    // ----- TABLE 1: Visual Inspection of Weather Deck -----
    const visualRows = Array.isArray(payload.visual_inspection_weather_deck)
      ? payload.visual_inspection_weather_deck
      : [];
    this.visualInspectionDetails = visualRows.length
      ? visualRows.map((item: any, index: number) => ({
          sr_no: index + 1,
          location: item?.location ?? '',
          observations: item?.observations ?? '',
          remarks: item?.remarks ?? '',
        }))
      : [{ sr_no: 1, location: '', observations: '', remarks: '' }];

    // ----- TABLE 2: Internal Underwater Tanks -----
    const tankRows = Array.isArray(payload.internal_underwater_tanks)
      ? payload.internal_underwater_tanks
      : [];
    this.internalUnderwaterTankDetails = tankRows.length
      ? tankRows.map((item: any, index: number) => ({
          sr_no: index + 1,
          tank_name: item?.tank_name ?? '',
          observations: item?.observations ?? '',
          remarks: item?.remarks ?? '',
        }))
      : [{ sr_no: 1, tank_name: '', observations: '', remarks: '' }];

    // ----- TABLE 3: Internal Underwater Compartments -----
    const compartmentRows = Array.isArray(
      payload.internal_underwater_compartments,
    )
      ? payload.internal_underwater_compartments
      : [];
    this.internalUnderwaterCompartmentDetails = compartmentRows.length
      ? compartmentRows.map((item: any, index: number) => ({
          sr_no: index + 1,
          compartment_name: item?.compartment_name ?? '',
          observations: item?.observations ?? '',
          remarks: item?.remarks ?? '',
        }))
      : [{ sr_no: 1, compartment_name: '', observations: '', remarks: '' }];
  }

  /** Backend se aayi authority_doc (plain URL string ya already-object) ko
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
