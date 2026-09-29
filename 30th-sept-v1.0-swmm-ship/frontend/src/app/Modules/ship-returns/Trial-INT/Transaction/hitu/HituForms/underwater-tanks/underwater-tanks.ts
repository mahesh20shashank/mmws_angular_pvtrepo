import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
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
import { TabsComponent } from '../../../../ui/tabs/tabs.component';
import {
  ReusableInputTableComponent,
  ReusableTableColumn,
} from '../../../../ui/reusable-input-table/reusable-input-table.component';
import { ReusableDeleteDialogDynamicContent } from '../../../../ui/reusable-delete-dialog-dynamic-content/reusable-delete-dialog-dynamic-content';
import { ToastComponent } from '../../../../ui/toast/toast.component';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import { FileUrlUtil } from '../../../../file-url-util';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';
import { Apiendpoints } from '../../../../ApiEndPoints';

@Component({
  selector: 'app-underwater-tanks',
  standalone: true,
  templateUrl: './underwater-tanks.html',
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
    TabsComponent,
    ReusableInputTableComponent,
    ReusableDeleteDialogDynamicContent,
    ApprovalWorkFlow,
    ToastComponent,
  ],
})
export class UnderwaterTanks implements OnInit {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  uploadedAuthorityFiles: UploadedFileItem[] = [];
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;

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

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  form!: FormGroup;
  placesOptions: any[] = [];
  // ─── Dropdown options ────────────────────────────────────────────────────
  nilObsOptions = [
    { label: 'Nil', value: 'nil' },
    { label: 'Observation', value: 'observation' },
  ];

  occasionOptions = [
    { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
    { label: 'End of Refit Trials', value: 'End of Refit Trials' },
    { label: 'Surprise Checks', value: 'Surprise Checks' },
    { label: 'HVAC Audit', value: 'HVAC Audit' },
  ];

  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  locationOptions: any[] = [];
  componentOptions: any[] = [];

  // ─── Internal table ──────────────────────────────────────────────────────
  internalTableData: any[] = [];
  internalColumns: ReusableTableColumn[] = [];

  internalDeleteDialogOpen = false;
  internalSelectedRowIndex: number | null = null;

  // ─── External table ──────────────────────────────────────────────────────
  externalTableData: any[] = [];
  externalColumns: ReusableTableColumn[] = [];

  externalDeleteDialogOpen = false;
  externalSelectedRowIndex: number | null = null;

  constructor(
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private toast: ToastService,
    private route: ActivatedRoute,
    public formApiService: FormApiService,
    private apiService: ApiService,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.initializeColumns();
    this.addInternalRow();
    this.addExternalRow();
    this.loadPlaceOfConductTrail();
    this.loadLocation();
    this.loadCompartments();
    this.loadTrialPrefillFromQuery();
  }

  buildForm() {
    this.form = this.fb.group({
      ship_or_submarine: [{ value: '', disabled: true }],
      ship: [{ value: '', disabled: true }],
      date_of_conduct_trail: [''],
      place_of_conduct_trail: [''],
      document_no: [''],
      occasion_of_conduct_trail: [''],
      authority: [''],
      authority_date: [''],
      authority_doc: [''],
    });
  }

  // ─── Column definitions ──────────────────────────────────────────────────
  initializeColumns(): void {
    // ================= INTERNAL TABLE =================
    this.internalColumns = [
      {
        field: 'sr_no',
        header: 'Ser No.',
        width: '60px',
        align: 'center' as const,
      },
      {
        field: 'compartment_name',
        header: 'Compartment / Location / Equipment',
        width: '280px',
        fieldType: 'select',
        options: this.componentOptions,
        required: true,
      },
      {
        field: 'observation',
        header: 'Observation',
        width: '160px',
        fieldType: 'select',
        options: [
          { label: 'Nil', value: 'nil' },
          { label: 'Observation', value: 'observation' },
        ],
        required: true,
      },
      {
        field: 'remarks',
        header: 'Remarks',
        width: '200px',
        fieldType: 'text',
        showWhen: {
          field: 'observation',
          value: 'observation',
        },
      },
    ];

    // ================= EXTERNAL TABLE =================
    this.externalColumns = [
      {
        field: 'sr_no',
        header: 'Ser No.',
        width: '60px',
        align: 'center' as const,
      },
      {
        field: 'compartment_name',
        header: 'Compartment / Location / Equipment',
        width: '280px',
        fieldType: 'select',
        options: this.componentOptions,
        required: true,
      },
      {
        field: 'observation',
        header: 'Observation',
        width: '160px',
        fieldType: 'select',
        options: [
          { label: 'Nil', value: 'nil' },
          { label: 'Observation', value: 'observation' },
        ],
        required: true,
      },
      {
        field: 'remarks',
        header: 'Remarks',
        width: '200px',
        fieldType: 'text',
        showWhen: {
          field: 'observation',
          value: 'observation',
        },
      },
    ];
  }

  // ─── Internal table helpers ──────────────────────────────────────────────
  addInternalRow(): void {
    this.internalTableData.push({
      sr_no: `${this.internalTableData.length + 1}`,
      compartment_name: '',
      observation: '',
      remarks: '',
    });
    this.internalTableData = [...this.internalTableData];
  }

  handleInternalTableAction(event: any): void {
    if (event.type === 'add') {
      this.addInternalRow();
    }
    if (event.type === 'delete') {
      this.internalSelectedRowIndex = event.index;
      this.internalDeleteDialogOpen = true;
    }
  }

  handleInternalTableChange(index: number, field: string, value: any): void {
    if (!this.internalTableData[index]) {
      return;
    }

    this.internalTableData[index][field] = value;

    if (field === 'observation' && value === 'nil') {
      this.internalTableData[index].remarks = '';
    }

    this.internalTableData = [...this.internalTableData];
  }

  closeInternalDeleteDialog(): void {
    this.internalDeleteDialogOpen = false;
  }

  confirmInternalDelete(): void {
    if (this.internalSelectedRowIndex !== null) {
      this.internalTableData.splice(this.internalSelectedRowIndex, 1);
      // Re-number
      this.internalTableData = this.internalTableData.map((row, i) => ({
        ...row,
        sr_no: `${i + 1}`,
      }));
    }
    this.internalDeleteDialogOpen = false;
  }

  // ─── External table helpers ──────────────────────────────────────────────
  addExternalRow(): void {
    this.externalTableData.push({
      sr_no: `${this.internalTableData.length + 1}`,
      compartment_name: '',
      observation: '',
      remarks: '',
    });
    this.externalTableData = [...this.externalTableData];
  }

  handleExternalTableAction(event: any): void {
    if (event.type === 'add') {
      this.addExternalRow();
    }
    if (event.type === 'delete') {
      this.externalSelectedRowIndex = event.index;
      this.externalDeleteDialogOpen = true;
    }
  }

  handleExternalTableChange(index: number, field: string, value: any): void {
    if (!this.externalTableData[index]) {
      return;
    }

    this.externalTableData[index][field] = value;

    // If Nil is selected,
    // remove any previously entered remarks.

    if (field === 'observation' && value === 'nil') {
      this.externalTableData[index].remarks = '';
    }

    this.externalTableData = [...this.externalTableData];
  }

  closeExternalDeleteDialog(): void {
    this.externalDeleteDialogOpen = false;
  }

  confirmExternalDelete(): void {
    if (this.externalSelectedRowIndex !== null) {
      this.externalTableData.splice(this.externalSelectedRowIndex, 1);
      // Re-number
      this.externalTableData = this.externalTableData.map((row, i) => ({
        ...row,
        sr_no: `${i + 1}`,
      }));
    }
    this.externalDeleteDialogOpen = false;
  }

  loadLocation() {
    this.api
      .getDropdownData('master/locations/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((res: any) => {
        this.locationOptions = res || [];
      });
  }

  loadCompartments() {
    this.api
      .getDropdownData(`${Apiendpoints.MASTER_COMPARTMENT}`, {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((res: any) => {
        this.componentOptions = res || [];

        // Patch the loaded options into the compartment_name column
        // for both Internal and External tables
        const patchColumn = (columns: ReusableTableColumn[]) => {
          const col = columns.find((c) => c.field === 'compartment_name');
          if (col) {
            col.options = [...this.componentOptions];
          }
        };

        patchColumn(this.internalColumns);
        patchColumn(this.externalColumns);

        // Trigger re-render
        this.internalColumns = [...this.internalColumns];
        this.externalColumns = [...this.externalColumns];
        this.cdr.markForCheck();
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

  // ─── Save ────────────────────────────────────────────────────────────────
  buildPayload() {
    const formDataValues = this.form.getRawValue();
    console.log('this.internalTableData', this.internalTableData);
    console.log('this.externalTableData', this.externalTableData);

    return {
      ...formDataValues,
      internal_compartments: this.internalTableData,
      external_compartments: this.externalTableData,
      authority_doc: FileUrlUtil.getFileUrl(formDataValues.authority_doc?.id),
    };
  }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      this.form.reset();
      this.internalTableData = [];
      this.externalTableData = [];
      this.addInternalRow();
      this.addExternalRow();
      this.cdr.detectChanges();
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

      this.form.patchValue(
        { ship_or_submarine: trialRow.ship_type_name },
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
      console.error('Trial prefill failed (Underwater Tanks)', e);
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
        'Failed to load Underwater Tanks data for selected equipment',
        error,
      );
      this.toast.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'date_of_conduct_trail' in jsonData ||
      'internal_compartments' in jsonData ||
      'external_compartments' in jsonData;
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
    const ship = this.form.get('ship')?.value;

    this.form.reset({}, { emitEvent: false });
    this.form.patchValue({ ship }, { emitEvent: false });

    this.internalTableData = [];
    this.externalTableData = [];
    this.addInternalRow();
    this.addExternalRow();
  }

  /** Poore form + dono tables ko equipment-specific payload se hydrate karta hai. */
  fillData(payload: any): void {
    if (!payload) return;

    const specialKeys = [
      'authority_doc',
      'ship',
      'internal_compartments',
      'external_compartments',
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

    // authority_doc — URL string ko file-upload component ke required object shape mein convert karo
    this.form
      .get('authority_doc')
      ?.setValue(this.buildFileUploadValue(payload.authority_doc), {
        emitEvent: false,
      });

    this.internalTableData = this.buildTableRows(payload.internal_compartments);

    // ----- EXTERNAL TABLE -----
    this.externalTableData = this.buildTableRows(payload.external_compartments);
  }

  /** Saved array ko table-row shape mein convert karta hai — agar data khaali ho
   *  to ek default empty row return karta hai (jaisa addInternalRow()/addExternalRow() karte hain). */
  private buildTableRows(rows: any): any[] {
    const values = Array.isArray(rows) ? rows : [];

    if (!values.length) {
      return [
        {
          sr_no: '1',
          compartment_name: '',
          observation: '',
          remarks: '',
        },
      ];
    }

    return values.map((item: any, index: number) => ({
      sr_no: `${index + 1}`,
      compartment_name: item?.compartment_name ?? '',
      observation: item?.observation ?? '',
      remarks: item?.remarks ?? '',
    }));
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
