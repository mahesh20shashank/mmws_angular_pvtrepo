import { CommonModule } from "@angular/common";
import { OnInit, ChangeDetectorRef, Component, inject } from "@angular/core";
import { ReactiveFormsModule, FormGroup, FormBuilder, Validators, FormArray } from "@angular/forms";
import { Router, ActivatedRoute } from "@angular/router";
// import { Component } from "ag-grid-community";
import { FormApiService } from "../../../../angulerFromconverting/form-api.service";
import { ApiService } from "../../../../api.service";
import { Apiendpoints } from "../../../../ApiEndPoints";
import { FileUrlUtil } from "../../../../file-url-util";
import { resolveTrialQueryParam, trialRowFromGetFormResponse } from "../../../../trial-route-prefill";
import { ApprovalWorkFlow } from "../../../../ui/approval-work-flow/approval-work-flow";
import { CalenderComponent } from "../../../../ui/calender.component";
import { DuctCalculatorDialogComponent } from "../../../../ui/duct-calculator-dialog/duct-calculator-dialog.component";
import { FileUploadComponent } from "../../../../ui/file-upload/file-upload.component";
import { FormInputTableWithHeaders } from "../../../../ui/form-input-table-with-headers/form-input-table-with-headers.component";
import { InputComponent } from "../../../../ui/input.component";
import { LoadingButtonComponent } from "../../../../ui/loading-button.component";
import { ReusableInputTableComponent, ReusableTableColumn } from "../../../../ui/master-compat";
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import { ParameterCardComponent } from "../../../../ui/parameter-card/parameter-card.component";
import { ReusableDeleteDialogDynamicContent } from "../../../../ui/reusable-delete-dialog-dynamic-content/reusable-delete-dialog-dynamic-content";
import { SelectWithSearchComponent } from "../../../../ui/select-with-search/select-with-search-box.component";
import { SelectComponent } from "../../../../ui/select.component";
import { UploadedFileItem } from "../anchor-capstan-add/anchor-capstan-add.component";
import { NotificationService } from "../../../../../../../Core/services/notification/notification.service";

@Component({
  selector: 'app-water-tight-hatches-add',
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
    InputComponent,
    ApprovalWorkFlow,
    ReusableDeleteDialogDynamicContent,
  ],
  templateUrl: './water-tight-hatches-add.component.html',
})
export class WaterTightHatchesAdd implements OnInit {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  readonly restartIcon = 'rotate-ccw';

  locationOptions: [] = [];
  readonly deleteIcon = 'trash';
  form!: FormGroup;
  loading = false;
  showApprovalWorkflowPopup = false;
      isSubmitTime = false;

  commandOptions: any[] = [];
  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  placesOptions: any[] = [];
  locationsOptions: any[] = [];
  doorOptions: any[] = [];
  occasionOptions: any[] = [];
  materialRubberBeadingOptions: any[] = [];

  dockingDetailsRows = 0;
  dockingDetailsData: any[] = [];
  dockingDetailsColumns: ReusableTableColumn[] = [];

  selectedRow: any = null;
  selectedRowIndex: number | null = null;

  tableRowDeleteDialogOpen = false;

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
    public formApiService: FormApiService,
    private route: ActivatedRoute,
  ) {}

  private readonly notification = inject(NotificationService);

  ngOnInit(): void {
    this.buildForm();
    this.initializeColumns();
    this.updateDockingDetailsRows(this.dockingDetailsRows);
    this.loadClasses();
    this.listenToClassChanges();
    this.loadLocations();
    this.loadMaterialOfRubberBeading();
    this.loadPlaceOfConductTrail();
    this.loadOccassionOfConductTrail();
    this.loadTypeOfHatchesOptions();
    this.loadTrialPrefillFromQuery();

    if (this.rowId) {
      this.editMode = true;
      this.getEditDataByRowId(this.rowId);
    }
  }

  handleFile(file: File | null) {
    console.log('Selected file:', file);
  }

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
  loadTypeOfHatchesOptions() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=DOORTYPE`,
        { labelKey: 'name', valueKey: 'id' },
      )
      .subscribe((res) => {
        this.doorOptions = res || [];

        // UPDATE COLUMN OPTIONS DYNAMICALLY
        const typeOfHatchColumn = this.dockingDetailsColumns.find(
          (col) => col["field"] === 'hatch_type',
        );

        if (typeOfHatchColumn) {
          typeOfHatchColumn["options"] = [...this.doorOptions];
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
          (col:any) => col.field === 'location',
        );

        if (locationColumn) {
          locationColumn["options"] = [...this.locationsOptions];
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
          (col) => col["field"] === 'rubber_beading_material',
        );

        if (materialRubberBeadingColumn) {
          materialRubberBeadingColumn["options"] = [
            ...this.materialRubberBeadingOptions,
          ];
        }

        // force table refresh
        this.dockingDetailsColumns = [...this.dockingDetailsColumns];

        this.cdr.detectChanges();
      });
  }

  buildForm() {
    this.form = this.fb.group({
      ship: [{ value: '', disabled: true }],
      classOfShip: ['', Validators.required],
      place_of_conduct_trail: [''],
      date_of_conduct_trail: [''],
      occasion_of_conduct_trail: [''],
      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],
    });
  }

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
        field: 'hatch_type',
        header: 'Type of Hatch',
        width: '140px',
        fieldType: 'drop-down',
        options: this.doorOptions,
        required: true,
      },
      {
        field: 'condition_coaming_cover',
        header: 'Condition of Hatch Coaming Cover',
        width: '140px',
        fieldType: 'drop-down',
        options: [
          { label: 'Sound', value: 'Sound' },
          { label: 'Defective', value: 'Defective' },
        ],
        required: true,
      },
      {
        field: 'condition_coaming',
        header: 'Condition of Hatch Coaming',
        width: '140px',
        fieldType: 'drop-down',
        options: [
          { label: 'Sound', value: 'Sound' },
          { label: 'Defective', value: 'Defective' },
        ],
        required: true,
      },

      {
        field: 'condition_dog_clips_hinges',
        header: 'Condition of Dog Clips/ Hinges',
        fieldType: 'drop-down',
        width: '140px',
        options: [
          { label: 'SAT', value: 'SAT' },
          { label: 'UNSAT', value: 'UNSAT' },
        ],
        required: true,
      },
      {
        field: 'condition_wedges',
        header: 'Condition of Wedges',
        width: '140px',
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
        width: '140px',
        options: [
          { label: 'SAT', value: 'SAT' },
          { label: 'UNSAT', value: 'UNSAT' },
        ],
        required: true,
      },
      {
        field: 'rubber_beading_adhesion_size',
        header: 'Adhesion & Size of Rubber Beading',
        width: '140px',
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
        width: '140px',
        fieldType: 'drop-down',
        options: this.materialRubberBeadingOptions,
        required: true,
      },
      {
        field: 'condition_rubber_beading',
        header: 'Condition of Rubber Beading',
        width: '140px',
        fieldType: 'drop-down',
        options: [
          { label: 'SAT', value: 'SAT' },
          { label: 'UNSAT', value: 'UNSAT' },
        ],
        required: true,
      },
      {
        field: 'condition_spring_piston_mechanism',
        header: 'Condition of Spring Piston',
        width: '140px',
        fieldType: 'drop-down',
        options: [
          { label: 'Ops', value: 'Ops' },
          { label: 'Non-ops', value: 'Non-ops' },
          { label: 'Sub-optimal', value: 'Sub-optimal' },
        ],
        required: true,
      },
      {
        field: 'condition_auto_lock_retaining',
        header: 'Condition of Auto-lock/ Retaining Arrangement',
        width: '140px',
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
        width: '140px',
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
        header: 'Preservation Status of hatches',
        width: '140px',
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
        width: '140px',
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
        header: 'Final Result',
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

  get watertightDoors(): FormArray {
    return this.form.get('watertight_hatches') as FormArray;
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
          hatch_type: '',
          door_type: '',
          condition_coaming_cover: '',
          condition_coaming: '',
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

  handleTableAction(event: any) {
    console.log('Table action:', event);

    if (event.type === 'delete') {
      console.log('here in this delet');
      this.selectedRow = {
        ...event.row,
        table: event.table,
      };
      this.tableRowDeleteDialogOpen = true;

      this.selectedRowIndex = event.index;

      console.log(
        'this.tableRowDeleteDialogOpen',
        this.tableRowDeleteDialogOpen,
      );
    }
  }

  closeDeleteDialog() {
    this.tableRowDeleteDialogOpen = false;
  }
  // ----------------------------------------- CONFIRM DELETE ---------------------------
  confirmDelete() {
    if (this.selectedRowIndex !== null) {
      this.dockingDetailsData.splice(this.selectedRowIndex, 1);
    }
    this.tableRowDeleteDialogOpen = false;
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
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Trial prefill failed (Water Tight Hatches)', e);
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
        'Failed to load Water Tight Hatches data for selected equipment',
        error,
      );
      this.notification.error('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'date_of_conduct_trail' in jsonData ||
      'watertight_hatches' in jsonData ||
      'authority' in jsonData;
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

  /** Tab switch pe form + table reset (ship field ko bacha ke) */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    this.form.reset({}, { emitEvent: false });
    this.form.patchValue({ ship }, { emitEvent: false });

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
    const hatches = Array.isArray(payload.watertight_hatches)
      ? payload.watertight_hatches
      : [];

    if (hatches.length) {
      this.dockingDetailsData = hatches.map((item: any, index: number) => ({
        sr_no: `${index + 1}`,
        location: item?.location ?? '',
        hatch_type: item?.hatch_type ?? '',
        condition_coaming_cover: item?.condition_coaming_cover ?? '',
        condition_coaming: item?.condition_coaming ?? '',
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
    this.apiService.get(`wrstg/water-tight-hatches/${rowId}`).subscribe({
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
        this.notification.error('Failed to load BER certificate details.');
      },
    });
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notification.error('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  /* ------------------------------- SAVE --------------------------------------- */

  isWaterTightHatchesTableRowEmpty(item: any): boolean {
    return !(
      item?.location ||
      item?.hatch_type ||
      item?.condition_coaming_cover ||
      item?.condition_coaming ||
      item?.condition_dog_clips_hinges ||
      item?.condition_wedges ||
      item?.surface_trueness_metallic_coaming ||
      item?.rubber_beading_adhesion_size ||
      item?.rubber_beading_material ||
      item?.condition_rubber_beading ||
      item?.condition_spring_piston_mechanism || // ✅ hatches has this, doors don't
      item?.condition_auto_lock_retaining ||
      item?.itp ||
      item?.preservation_status ||
      item?.lubrication ||
      item?.uld_status || // ✅ composite sub-field
      item?.remarks ||
      item?.final_result
    );
  }

  buildPayload() {
    const value = this.form.value;
    const waterTightHatchesFormat = this.dockingDetailsData
      .filter((item) => !this.isWaterTightHatchesTableRowEmpty(item))
      .map((item) => ({
        location: item?.location,
        hatch_type: item?.hatch_type,
        condition_coaming_cover: item?.condition_coaming_cover,
        condition_coaming: item?.condition_coaming,
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
      watertight_hatches: waterTightHatchesFormat,
      authority_doc: FileUrlUtil.getFileUrl(formDataValues.authority_doc?.id),
    };
    return payload;
  }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      this.form.reset();
      this.notification.success('Form cleared successfully');
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
        next: () => this.notification.success('Draft saved successfully.'),
        error: () => this.notification.error('Failed to save draft.'),
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
            this.notification.success('Forms Submitted successfully.');
            this.isSubmitTime = true;
            this.showApprovalWorkflowPopup = true;
          } else {
            this.notification.success('Forms Saved successfully.');
            this.router.navigate(['/afterAuth/ship-returns/transactions/trial']);
          }
          this.cdr.detectChanges();
        },
        error: () => {
          if (type === 'submit') {
            this.notification.error('Failed to submit form.');
          } else {
            this.notification.success('Failed to save form.');
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
