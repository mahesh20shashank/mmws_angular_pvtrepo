import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
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
import {
  ReusableInputTableComponent,
  ReusableTableColumn,
} from '../../../../ui/reusable-input-table/reusable-input-table.component';
import { CalenderComponent } from '../../../../ui/calender.component';
import { ParameterCardComponent } from '../../../../ui/parameter-card/parameter-card.component';
import {
  FileUploadComponent,
  UploadedFileItem,
} from '../../../../ui/file-upload/file-upload.component';
import { SelectWithSearchComponent } from '../../../../ui/select-with-search/select-with-search-box.component';
import { InputComponent } from '../../../../ui/input.component';
import { MasterService } from '../../../../services/master.service';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'emergency-escape-hatches-add',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    SelectComponent,
    ReusableInputTableComponent,
    CalenderComponent,
    ParameterCardComponent,
    FileUploadComponent,
    ApprovalWorkFlow,
    InputComponent,
  ],
  templateUrl: './emergency-escape-hatches-add.component.html',
})
export class EmergencyEscapeHatchesAdd implements OnInit {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

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

  // readonly draftIcon = 'save';
  // readonly saveIcon = 'save-all';
  readonly restartIcon = 'rotate-ccw';

  form!: FormGroup;
  loading = false;

  commandOptions: any[] = [];
  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  occasionOptions: any[] = [];
  locationOptions: [] = [];
  placesOptions: any[] = [];
  locationsOptions: any[] = [];
  doorOptions: any[] = [];
  materialRubberBeadingOptions: any[] = [];

  dockingDetailsRows = 1;
  dockingDetailsData: any[] = [];
  dockingDetailsColumns: ReusableTableColumn[] = [];

  initializeColumns(): void {
    this.dockingDetailsColumns = [
      {
        field: 'sr_no',
        header: 'Ser no.',
        width: '80px',
        align: 'center' as const,
      },
      {
        field: 'location',
        header: 'Location',
        width: '250px',
        fieldType: 'drop-down',
        options: this.locationsOptions,
        required: true,
      },

      {
        field: 'type_of_eeh_ees',
        header: 'Type of EEH/ EES',
        width: '160px',
        fieldType: 'drop-down',
        options: this.doorOptions,
        required: true,
      },
      {
        field: 'condition_eeh_ees_cover',
        header: 'Condition of EEH/ EES Coaming Cover',
        width: '160px',
        fieldType: 'drop-down',
        options: [
          { label: 'Sound', value: 'Sound' },
          { label: 'Defective', value: 'Defective' },
        ],
        required: true,
      },
      {
        field: 'condition_eeh_ees_coaming',
        header: 'Condition of EEH/ EES Coaming',
        width: '160px',
        fieldType: 'drop-down',
        options: [
          { label: 'Sound', value: 'Sound' },
          { label: 'Defective', value: 'Defective' },
        ],
        required: true,
      },

      {
        field: 'condition_dog_clips_hinges',
        header: 'Condition of Dog clips/ Hinges',
        fieldType: 'drop-down',
        width: '160px',
        options: [
          { label: 'SAT', value: 'SAT' },
          { label: 'UNSAT', value: 'UNSAT' },
        ],
        required: true,
      },
      {
        field: 'condition_wedges',
        header: 'Condition of Wedges',
        width: '160px',
        fieldType: 'drop-down',
        options: [
          { label: 'Sound', value: 'Sound' },
          { label: 'Defective', value: 'Defective' },
        ],
        required: true,
      },
      {
        field: 'surface_trueness_metallic_coaming',
        header: 'Surface Trueness of Metallic Coaming',
        fieldType: 'drop-down',
        width: '160px',
        options: [
          { label: 'SAT', value: 'SAT' },
          { label: 'UNSAT', value: 'UNSAT' },
        ],
        required: true,
      },
      {
        field: 'rubber_beading_adhesion_size',
        header: 'Adhesion & Size of Rubber Beading',
        width: '160px',
        fieldType: 'drop-down',
        options: [
          { label: 'Intact', value: 'Intact' },
          { label: 'Defective', value: 'Defective' },
        ],
        required: true,
      },
      {
        field: 'rubber_beading_material',
        header: 'Material of Rubber Beading',
        width: '160px',
        fieldType: 'drop-down',
        options: this.materialRubberBeadingOptions,
        required: true,
      },
      {
        field: 'condition_rubber_beading',
        header: 'Condition of Rubber Beading',
        width: '160px',
        fieldType: 'drop-down',
        options: [
          { label: 'SAT', value: 'SAT' },
          { label: 'UNSAT', value: 'UNSAT' },
        ],
        required: true,
      },
      {
        field: 'condition_spring_piston_mechanism',
        header: 'Condition of Spring / Piston Mechanism',
        fieldType: 'drop-down',
        width: '160px',
        options: [
          { label: 'Ops', value: 'Ops' },
          { label: 'Non-ops', value: 'Non-ops' },
          { label: 'Sub-optimal', value: 'Sub-optimal' },
        ],
        required: true,
      },
      {
        field: 'condition_auto_lock_retaining',
        header: 'Condition of Auto-lock/ retaining arrangement',
        width: '160px',
        fieldType: 'drop-down',
        options: [
          { label: 'Ops', value: 'Ops' },
          { label: 'Non-ops', value: 'Non-ops' },
          { label: 'Sub-optimal', value: 'Sub-optimal' },
        ],
        required: true,
      },
      {
        field: 'itp',
        header: 'ITP',
        width: '160px',
        fieldType: 'drop-down',
        options: [
          { label: 'NA', value: 'NA' },
          { label: 'SAT', value: 'SAT' },
          { label: 'UNSAT', value: 'UNSAT' },
        ],
        required: true,
      },
      {
        field: 'preservation_status',
        header: 'Preservation Status of EEH/ EES',
        width: '160px',
        fieldType: 'drop-down',
        options: [
          { label: 'SAT', value: 'SAT' },
          { label: 'UNSAT', value: 'UNSAT' },
          { label: 'SAT with Observation', value: 'SAT with Observation' },
        ],
        required: true,
      },
      {
        field: 'lubrication',
        header: 'Lubrication ',
        width: '160px',
        fieldType: 'drop-down',
        options: [
          { label: 'SAT', value: 'SAT' },
          { label: 'UNSAT', value: 'UNSAT' },
        ],
        required: true,
      },
      {
        field: 'uld',
        header: 'ULD(db)',
        fieldType: 'composite',
        width: '200px',
        required: true,
        compositeFields: [
          {
            field: 'uld_status',
            fieldType: 'drop-down',
            options: [
              { label: 'ULD undertaken', value: 'uld_undertaken' },
              { label: 'Waiver accorded', value: 'waiver_accorded' },
            ],
            required: true,
          },
          {
            field: 'uld_value',
            fieldType: 'number',
            decimalPlaces: 2,
            placeholder: '',
            required: true,
            showWhen: { field: 'uld_status', value: 'uld_undertaken' },
          },
        ],
      },
      {
        field: 'remarks',
        header: 'Remarks',
        width: '220px',
        fieldType: 'textarea',
        required: true,
      },
      {
        field: 'final_result',
        header: 'Final Remarks',
        width: '200px',
        fieldType: 'drop-down',
        required: true,
        options: [
          { label: 'SAT', value: 'SAT' },
          { label: 'UNSAT', value: 'UNSAT' },
          { label: 'SAT with Observation', value: 'SAT with Observation' },
        ],
      },
    ];
  }

  constructor(
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private masterService: MasterService,
    private apiService: ApiService,
    private toast: ToastService,
    private toastService: ToastService,
    public formApiService: FormApiService,
    private route: ActivatedRoute,
  ) {}

  buildForm() {
    this.form = this.fb.group({
      classOfShip: [''],
      ship: [{ value: '', disabled: true }],
      date_of_conduct_trail: ['', Validators.required],
      place_of_conduct_trail: ['', Validators.required],
      occasion_of_conduct_trail: [''],
      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],
    });
  }

  get watertightDoors(): FormArray {
    return this.form.get('watertight_hatches') as FormArray;
  }

  ngOnInit(): void {
    this.buildForm();
    this.initializeColumns();
    this.updateDockingDetailsRows(this.dockingDetailsRows);

    this.loadTypeOfESSnEEHOptions();
    this.loadOccassionOfConductTrail();
    this.loadPlaceOfConductTrail();
    this.loadMaterialOfRubberBeading();
    this.loadLocations();
    this.loadTrialPrefillFromQuery();

    if (this.rowId) {
      this.editMode = true;
      this.getEditDataByRowId(this.rowId);
    }
  }
  handleFile(file: File | null) {
    console.log('Selected file:', file);
  }
  // ------------------------------ SEETING NEEDED APIS DATA --------------------------------
  loadClasses() {
    this.apiService
      .getDropdownData('master/ship-classes/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((res) => {
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
    this.apiService
      .getDropdownData('master/ships/', { labelKey: 'name', valueKey: 'id' })
      .subscribe((res) => {
        this.shipOptions = res || [];
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

  // -------------------- ocassion of conduct trial --------------------------------
  loadOccassionOfConductTrail() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=OCC`,
        { labelKey: 'name', valueKey: 'id' },
      )
      .subscribe((res) => {
        Promise.resolve().then(() => {
          this.occasionOptions = res || [];
          this.cdr.markForCheck();
        });
      });
  }
  // ----------------------TYPE OF HATCHES OPTIONS -------------------------------
  loadTypeOfESSnEEHOptions() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=TYPE_EEHS`,
        { labelKey: 'name', valueKey: 'id' },
      )
      .subscribe((res) => {
        this.doorOptions = res || [];

        // UPDATE COLUMN OPTIONS DYNAMICALLY
        const typeOfHatchColumn = this.dockingDetailsColumns.find(
          (col) => col.field === 'hatch_type',
        );

        if (typeOfHatchColumn) {
          typeOfHatchColumn.options = [...this.doorOptions];
        }

        // force table refresh
        this.dockingDetailsColumns = [...this.dockingDetailsColumns];

        this.cdr.detectChanges();
      });
  }
  // ------------- LOAD LOCATIONS FOR TABLE----------------
  loadLocations() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=WTHL`,
        { labelKey: 'name', valueKey: 'id' },
      )
      .subscribe((res) => {
        this.locationsOptions = res || [];

        // UPDATE COLUMN OPTIONS DYNAMICALLY
        const locationColumn = this.dockingDetailsColumns.find(
          (col) => col.field === 'location',
        );

        if (locationColumn) {
          locationColumn.options = [...this.locationsOptions];
        }

        // force table refresh
        this.dockingDetailsColumns = [...this.dockingDetailsColumns];

        this.cdr.detectChanges();
      });
  }
  // ------------------------------------- MATERIAL OF RUBBER BEADING OPTIONS -------------------------------
  loadMaterialOfRubberBeading() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=MATRB`,
        { labelKey: 'name', valueKey: 'id' },
      )
      .subscribe((res) => {
        this.materialRubberBeadingOptions = res || [];

        // UPDATE COLUMN OPTIONS DYNAMICALLY
        const materialRubberBeadingColumn = this.dockingDetailsColumns.find(
          (col) => col.field === 'rubber_beading_material',
        );

        if (materialRubberBeadingColumn) {
          materialRubberBeadingColumn.options = [
            ...this.materialRubberBeadingOptions,
          ];
        }

        // force table refresh
        this.dockingDetailsColumns = [...this.dockingDetailsColumns];

        this.cdr.detectChanges();
      });
  }

  // Main Docking Details Table handlers
  onDockingDetailsRowChanges(event: Event): void {
    const value = +(event.target as HTMLInputElement).value;
    this.dockingDetailsRows = Math.max(1, Math.min(99, value));
    this.updateDockingDetailsRows(this.dockingDetailsRows);
  }
  updateDockingDetailsRows(count: number): void {
    const currentLength = this.dockingDetailsData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.dockingDetailsData.push({
          sr_no: `${i + 1}`,
          location: '',
          type_of_eeh_ees: '',
          condition_eeh_ees_cover: '',
          condition_eeh_ees_coaming: '',
          condition_dog_clips_hinges: '',
          condition_wedges: '',
          surface_trueness_metallic_coaming: '',
          rubber_beading_adhesion_size: '',
          rubber_beading_material: '',
          condition_rubber_beading: '',
          condition_spring_piston_mechanism: '',
          condition_auto_lock_retaining: '',
          itp: '',
          preservation_status: '',
          lubrication: '',
          uld: 0,
          remarks: '',
          final_result: '',
        });
      }
    } else if (count < currentLength) {
      this.dockingDetailsData.splice(count);
    }
  }

  handleDockingDetailsChange(
    rowIndex: number,
    field: string,
    value: any,
  ): void {
    if (this.dockingDetailsData[rowIndex]) {
      this.dockingDetailsData[rowIndex][field] = value;
    }
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

      // ship ka fallback value (agar equipment-level payload mein khaali ho)
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
      console.error('Trial prefill failed (Emergency Escape Hatches)', e);
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
        'Failed to load Emergency Escape Hatches data for selected equipment',
        error,
      );
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    // flat check — koi bhi known top-level key ho to already flat hai
    const isFlat =
      'date_of_conduct_trail' in jsonData ||
      'escape_hatches' in jsonData ||
      'authority' in jsonData;
    if (isFlat) return jsonData;

    // nested/wrapped case — equipment name ke andar
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

  /** Tab switch pe form + table reset (ship field ko bacha ke) */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    this.form.reset({}, { emitEvent: false });
    this.form.patchValue({ ship }, { emitEvent: false });

    // Table bhi reset — default ek empty row pe wapas
    this.dockingDetailsData = [];
    this.dockingDetailsRows = 0;
    this.updateDockingDetailsRows(1);
  }

  /** Poora form + table hydrate karo equipment-specific payload se */
  fillData(payload: any): void {
    if (!payload) return;

    this.form.patchValue({
      ship: payload.ship || this.form.get('ship')?.value || '',
      date_of_conduct_trail: payload.date_of_conduct_trail ?? '',
      place_of_conduct_trail: payload.place_of_conduct_trail ?? '',
      occasion_of_conduct_trail: payload.occasion_of_conduct_trail ?? '',
      authority: payload.authority ?? '',
      authority_date: payload.authority_date ?? '',
      authority_doc: this.buildFileUploadValue(payload.authority_doc),
    });

    // ----- TABLE DATA PATCHING (dockingDetailsData) -----
    const hatches = Array.isArray(payload.escape_hatches)
      ? payload.escape_hatches
      : [];

    if (hatches.length) {
      this.dockingDetailsData = hatches.map((item: any, index: number) => ({
        sr_no: `${index + 1}`,
        location: item?.location ?? '',
        type_of_eeh_ees: item?.type_of_eeh_ees ?? '',
        condition_eeh_ees_cover: item?.condition_eeh_ees_cover ?? '',
        condition_eeh_ees_coaming: item?.condition_eeh_ees_coaming ?? '',
        condition_dog_clips_hinges: item?.condition_dog_clips_hinges ?? '',
        condition_wedges: item?.condition_wedges ?? '',
        surface_trueness_metallic_coaming:
          item?.surface_trueness_metallic_coaming ?? '',
        rubber_beading_adhesion_size: item?.rubber_beading_adhesion_size ?? '',
        rubber_beading_material: item?.rubber_beading_material ?? '',
        condition_rubber_beading: item?.condition_rubber_beading ?? '',
        condition_spring_piston_mechanism:
          item?.condition_spring_piston_mechanism ?? '',
        condition_auto_lock_retaining:
          item?.condition_auto_lock_retaining ?? '',
        itp: item?.itp ?? '',
        preservation_status: item?.preservation_status ?? '',
        lubrication: item?.lubrication ?? '',
        uld_status: item?.uld_status ?? '',
        uld_value: item?.uld_value ?? null,
        remarks: item?.remarks ?? '',
        final_result: item?.final_result ?? '',
      }));
      this.dockingDetailsRows = this.dockingDetailsData.length;
    } else {
      this.dockingDetailsData = [];
      this.updateDockingDetailsRows(1);
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

  /* ----------------------------- EDIT MODE ----------------------------------- */

  getEditDataByRowId(rowId: string) {
    this.apiService.get(`${Apiendpoints.BER_CERTIFICATE}${rowId}`).subscribe({
      next: (res: any) => {
        if (res?.data) {
          this.editDataDetails = res.data;
          this.form.patchValue({
            command: this.editDataDetails?.ship?.command?.id,
            class_of_ship: this.editDataDetails?.ship?.classofship?.id,
            ship: this.editDataDetails?.ship?.id,
            ship_status:
              this.editDataDetails?.ship_status === 'refit' ? 'REFIT' : 'OPS',
            refit_status: this.editDataDetails?.refit?.id,
            refit_date: this.editDataDetails?.refit_recommencement_date
              ? new Date(this.editDataDetails.refit_recommencement_date)
              : null,
          });
        }
      },
      error: (err) => {
        console.error('Error fetching BER certificate data:', err);
        this.toastService.showError('Failed to load BER certificate details.');
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

  isEmergencyEscapeHatchesRowEmpty(item: any): boolean {
    return !(
      item?.location ||
      item?.type_of_eeh_ees ||
      item?.condition_eeh_ees_cover ||
      item?.condition_eeh_ees_coaming ||
      item?.condition_dog_clips_hinges ||
      item?.condition_wedges ||
      item?.surface_trueness_metallic_coaming ||
      item?.rubber_beading_adhesion_size ||
      item?.rubber_beading_material ||
      item?.condition_rubber_beading ||
      item?.condition_spring_piston_mechanism ||
      item?.condition_auto_lock_retaining ||
      item?.itp ||
      item?.preservation_status ||
      item?.lubrication ||
      item?.uld_status ||
      item?.remarks ||
      item?.final_result
    );
  }

  buildPayload() {
    const value = this.form.value;

    const escapeHatchesFormat = this.dockingDetailsData
      .filter((item) => !this.isEmergencyEscapeHatchesRowEmpty(item))
      .map((item) => ({
        location: item?.location,
        type_of_eeh_ees: item?.type_of_eeh_ees,
        condition_eeh_ees_cover: item?.condition_eeh_ees_cover,
        condition_eeh_ees_coaming: item?.condition_eeh_ees_coaming,
        condition_dog_clips_hinges: item?.condition_dog_clips_hinges,
        condition_wedges: item?.condition_wedges,
        surface_trueness_metallic_coaming:
          item?.surface_trueness_metallic_coaming,
        rubber_beading_adhesion_size: item?.rubber_beading_adhesion_size,
        rubber_beading_material: item?.rubber_beading_material,
        condition_rubber_beading: item?.condition_rubber_beading,
        condition_spring_piston_mechanism:
          item?.condition_spring_piston_mechanism,
        condition_auto_lock_retaining: item?.condition_auto_lock_retaining,
        itp: item?.itp,
        preservation_status: item?.preservation_status,
        lubrication: item?.lubrication,
        uld_status: item?.uld_status,
        uld_value: item?.uld_value ?? null,
        remarks: item?.remarks,
        final_result: item?.final_result,
      }));
    const formDataValues = this.form.getRawValue();

    const payload: any = {
      ...value,
      escape_hatches: escapeHatchesFormat,
      authority_doc: FileUrlUtil.getFileUrl(formDataValues.authority_doc?.id),
    };

    if (this.editMode) {
      payload.id = this.editDataDetails.id;
    }
    return payload;
  }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      this.form.reset();
      this.toast.showSuccess('Form cleared successfully');
      return;
    }
    const payload = this.buildPayload();
    // console.log("this.submitFinalForm(payload)", this.submitFinalForm(payload))
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
}
