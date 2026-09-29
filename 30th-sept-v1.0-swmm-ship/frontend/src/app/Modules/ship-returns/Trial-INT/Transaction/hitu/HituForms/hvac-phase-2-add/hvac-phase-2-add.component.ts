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
import { ToastComponent } from '../../../../ui/toast/toast.component';
import { MasterService } from '../../../../services/master.service';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { Apiendpoints } from '../../../../ApiEndPoints';
import { ReusableInputTableComponent } from '../../../../ui/reusable-input-table/reusable-input-table.component';
import {
  FormInputTableWithHeaders,
  ReusableHeaderCell,
  ReusableTableColumnWithHeaders,
} from '../../../../ui/form-input-table-with-headers/form-input-table-with-headers.component';
import { ParameterCardComponent } from '../../../../ui/parameter-card/parameter-card.component';
import {
  FileUploadComponent,
  UploadedFileItem,
} from '../../../../ui/file-upload/file-upload.component';
import { SelectWithSearchComponent } from '../../../../ui/select-with-search/select-with-search-box.component';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { SelectComponent } from '../../../../ui/select.component';
import { CalenderComponent } from '../../../../ui/calender.component';
import { InputComponent } from '../../../../ui/input.component';
import { TabsComponent } from '../../../../ui/tabs/tabs.component';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-hvac-phase-2-add',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    ToastComponent,
    SelectComponent,
    CalenderComponent,
    InputComponent,
    FormInputTableWithHeaders,
    ParameterCardComponent,
    FileUploadComponent,
    ApprovalWorkFlow,
    TabsComponent,
  ],
  templateUrl: './hvac-phase-2-add.component.html',
})
export class HvacPhase2AddComponent implements OnInit {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
  loading = false;

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  readonly restartIcon = 'rotate-ccw';

  form!: FormGroup;

  shipTypeOptions = [
    { label: 'Ship', value: 'ship' },
    { label: 'Submarine', value: 'submarine' },
  ];

  uploadedAuthorityFiles: UploadedFileItem[] = [];

  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  locationOptions: any[] = [];
  occasionOptions: any[] = [];
  compartmentOptions: any[] = [];
  regimeOptions: any[] = [];
  atuHeOptions: any[] = [];
  fedBySupplyOptions: any[] = [];

  totalRowsAmbient = 1;
  totalRowsAcPlant = 1;
  totalRowsChilledWater = 1;
  totalRowsRecordValueInMachinery = 1;
  totalRowsRecordValueInCompartment = 1;

  // ------------------------------------ TABLES DATA ARRAYS --------------------------------
  ambientConditionsTableData: any[] = [];
  acPlantTableData: any[] = [];
  childWaterMgmtTableData: any[] = [];
  recordOfValuesInMachineryTableData: any[] = [];
  recordOfValuesInCompartmentTableData: any[] = [];
  acPlantObservationOptions: any[] = [];
  acPlantNoOptions: any[] = [];
  private vesselTypeValue = '';

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
    private masterService: MasterService,
    private apiService: ApiService,
    private toastService: ToastService,
    public formApiService: FormApiService,
    private route: ActivatedRoute,
    private toast: ToastService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadClasses();
    this.loadLocation();
    this.listenToClassChanges();
    this.loadCompartments();
    this.loadOccassionOfConductTrail();
    this.loadRegime();
    this.loadAcPlantObservations();
    this.loadAcPlantNo();
    this.loadAtuHeOptions();
    this.loadFedBySupplyOptions();
    // Initialise all tables with their first row
    this.updateAmbientConditionsTableRows(this.totalRowsAmbient);
    this.updateAcPlantDataTableRows(this.totalRowsAcPlant);
    this.updatechildWaterMgmtTableRows(this.totalRowsChilledWater);
    this.updaterecordOfValuesInCompartmentTableRows(
      this.totalRowsRecordValueInCompartment,
    );
    this.updaterecordOfValuesInMachineryTableRows(
      this.totalRowsRecordValueInMachinery,
    );
    this.loadTrialPrefillFromQuery();

    if (this.rowId) {
      this.editMode = true;
      this.getEditDataByRowId(this.rowId);
    }
  }

  // ------------------------------ SETTING NEEDED APIS DATA --------------------------------
  loadClasses() {
    this.masterService.getClasses().subscribe((res) => {
      this.classOfShipOptions = res?.data.map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
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
    this.masterService.getShipsByClass(id).subscribe((res) => {
      this.shipOptions = res.data.map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
    });
  }

  loadLocation() {
    this.masterService.getLocations().subscribe((res) => {
      this.locationOptions = res.data.map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
    });
  }

  loadOccassionOfConductTrail() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=OCCHITU`,
        {
          labelKey: 'name',
          valueKey: 'id',
        },
      )
      .subscribe((res) => {
        Promise.resolve().then(() => {
          this.occasionOptions = res || [];
          this.cdr.markForCheck();
        });
      });
  }

  loadCompartments() {
    this.apiService
      .getDropdownData(`${Apiendpoints.MASTER_COMPARTMENT}`, {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((res) => {
        this.compartmentOptions = res || [];

        // Update machinery table compartment dropdown
        const machineryCol = this.recordOfValuesInMachineryColumns.find(
          (col) => col.field === 'compartment',
        );
        if (machineryCol) machineryCol.options = [...this.compartmentOptions];
        this.recordOfValuesInMachineryColumns = [
          ...this.recordOfValuesInMachineryColumns,
        ];

        // Update compartment table compartment dropdown
        const compartmentCol = this.recordOfValuesInCompartmentColumns.find(
          (col) => col.field === 'compartment',
        );
        if (compartmentCol)
          compartmentCol.options = [...this.compartmentOptions];
        this.recordOfValuesInCompartmentColumns = [
          ...this.recordOfValuesInCompartmentColumns,
        ];

        this.cdr.detectChanges();
      });
  }

  loadRegime() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=REGIME`,
        { labelKey: 'name', valueKey: 'id' },
      )
      .subscribe((res) => {
        this.regimeOptions = res || [];
        const col = this.ambientConditionsColumns.find(
          (c) => c.field === 'regime',
        );
        if (col) col.options = [...this.regimeOptions];
        this.ambientConditionsColumns = [...this.ambientConditionsColumns];
        this.cdr.detectChanges();
      });
  }

  loadAcPlantObservations() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=ACPOBS`,
        { labelKey: 'name', valueKey: 'id' },
      )
      .subscribe((res) => {
        this.acPlantObservationOptions = res || [];
        const col = this.acPlantDataColumns.find(
          (c) => c.field === 'observations',
        );
        if (col) col.options = [...this.acPlantObservationOptions];
        this.acPlantDataColumns = [...this.acPlantDataColumns];
        this.cdr.detectChanges();
      });
  }

  loadAcPlantNo() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=ACPNO`,
        { labelKey: 'name', valueKey: 'id' },
      )
      .subscribe((res) => {
        this.acPlantNoOptions = res || [];
        const col = this.acPlantDataColumns.find((c) => c.field === 'plant_no');
        if (col) col.options = [...this.acPlantNoOptions];
        this.acPlantDataColumns = [...this.acPlantDataColumns];
        this.cdr.detectChanges();
      });
  }

  loadAtuHeOptions() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=ATUHE`,
        {
          labelKey: 'name',
          valueKey: 'id',
        },
      )
      .subscribe((res) => {
        this.atuHeOptions = res || [];

        // CHILD WATER TABLE
        const chilledWaterCol = this.childWaterMgmtColumns.find(
          (col) => col.field === 'fed_by_atu_he',
        );

        if (chilledWaterCol) {
          chilledWaterCol.fieldType = 'drop-down';
          chilledWaterCol.options = [...this.atuHeOptions];
        }

        this.childWaterMgmtColumns = [...this.childWaterMgmtColumns];

        // MACHINERY TABLE
        const machineryCol = this.recordOfValuesInMachineryColumns.find(
          (col) => col.field === 'fed_by_atu',
        );

        if (machineryCol) {
          machineryCol.fieldType = 'drop-down';
          machineryCol.options = [...this.atuHeOptions];
        }

        this.recordOfValuesInMachineryColumns = [
          ...this.recordOfValuesInMachineryColumns,
        ];

        this.cdr.detectChanges();
      });
  }

  loadFedBySupplyOptions() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=SUPEX`,
        {
          labelKey: 'name',
          valueKey: 'id',
        },
      )
      .subscribe((res) => {
        this.fedBySupplyOptions = res || [];

        const machineryCol = this.recordOfValuesInMachineryColumns.find(
          (col) => col.field === 'fed_by_supply',
        );

        if (machineryCol) {
          machineryCol.fieldType = 'drop-down';
          machineryCol.options = [...this.fedBySupplyOptions];
        }

        this.recordOfValuesInMachineryColumns = [
          ...this.recordOfValuesInMachineryColumns,
        ];

        this.cdr.detectChanges();
      });
  }

  handleFile(file: File | null) {
    console.log('Selected file:', file);
  }

  /* -------------------------------- FORM SETUP ------------------------------- */
  buildForm() {
    this.form = this.fb.group({
      vesselType: [{ value: '', disabled: true }],
      ship_or_submarine: ['', Validators.required],
      date_of_conduct_trail: ['', Validators.required],
      place_of_conduct_trail: ['', Validators.required],
      occasion_of_conduct_trail: ['', Validators.required],
      document_no: ['', Validators.required],
      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],

      doc: [],
    });
  }

  // ============================================================================
  // TABLE ONE — AMBIENT CONDITIONS
  // ============================================================================

  ambientConditionsColumns: ReusableTableColumnWithHeaders[] = [
    { field: 's_no', header: 'Ser No.', width: '20px', fieldType: 'serial' },

    {
      field: 'regime',
      header: 'Regime',
      width: '220px',
      fieldType: 'drop-down',
      options: this.regimeOptions,
      required: true,
    },

    // SEA WATER TEMPERATURE
    {
      field: 'swp_0900hrs',
      header: 'Time(Hrs)',
      fieldType: 'composite',
      width: '190px',
      compositeFields: [
        {
          field: 'swp_0900hrs_time',
          fieldType: 'time',
          required: true,
        },
        {
          field: 'swp_0900hrs_value',
          fieldType: 'number',
          placeholder: 'Value',
          decimalPlaces: 1,
          required: true,
        },
      ],
    },

    {
      field: 'swp_1200hrs',
      header: 'Time(Hrs)',
      fieldType: 'composite',
      width: '190px',
      compositeFields: [
        {
          field: 'swp_1200hrs_time',
          fieldType: 'time',
          required: true,
        },
        {
          field: 'swp_1200hrs_value',
          fieldType: 'number',
          placeholder: 'Value',
          decimalPlaces: 1,
          required: true,
        },
      ],
    },

    // ATMOSPHERE TEMPERATURE
    {
      field: 'at_0900hrs',
      header: 'Time(Hrs)',
      fieldType: 'composite',
      width: '190px',
      compositeFields: [
        {
          field: 'at_0900hrs_time',
          fieldType: 'time',
          required: true,
        },
        {
          field: 'at_0900hrs_value',
          fieldType: 'number',
          decimalPlaces: 1,
          placeholder: 'Value',
          required: true,
        },
      ],
    },

    {
      field: 'at_1200hrs',
      header: 'Time(Hrs)',
      fieldType: 'composite',
      width: '190px',
      compositeFields: [
        {
          field: 'at_1200hrs_time',
          fieldType: 'time',
          required: true,
        },
        {
          field: 'at_1200hrs_value',
          fieldType: 'number',
          decimalPlaces: 1,
          placeholder: 'Value',
          required: true,
        },
      ],
    },

    // ATMOSPHERIC RELATIVITY
    {
      field: 'ar_0900hrs',
      header: 'Time(Hrs)',
      fieldType: 'composite',
      width: '190px',
      compositeFields: [
        {
          field: 'ar_0900hrs_time',
          fieldType: 'time',
          required: true,
        },
        {
          field: 'ar_0900hrs_value',
          fieldType: 'number',
          placeholder: 'Value',
          required: true,
        },
      ],
    },

    {
      field: 'ar_1200hrs',
      header: 'Time(Hrs)',
      fieldType: 'composite',
      width: '190px',
      compositeFields: [
        {
          field: 'ar_1200hrs_time',
          fieldType: 'time',
          required: true,
        },
        {
          field: 'ar_1200hrs_value',
          fieldType: 'number',
          placeholder: 'Value',
          required: true,
        },
      ],
    },

    {
      field: 'remark',
      header: 'Remarks',
      width: '220px',
      required: true,
      fieldType: 'drop-down',
      options: [
        { label: 'Sat', value: 'SAT' },
        { label: 'Sat with observations', value: 'SAT with observations' },
        { label: 'UnSat', value: 'UNSAT' },
      ],
    },
  ];

  ambientConditionsHeaderRows: ReusableHeaderCell[][] = [
    [
      { header: 'Ser No.', rowspan: 2 },
      { header: 'Regime', rowspan: 2, required: true },
      { header: 'Sea Water Temperature (°C)', colspan: 2, required: true },
      { header: 'Atmosphere Temperature (°C)', colspan: 2, required: true },
      { header: 'Atmospheric Relativity (%)', colspan: 2, required: true },
      { header: 'Remarks', rowspan: 2, required: true },
    ],
    [
      { header: 'Time(Hrs)' },
      { header: 'Time(Hrs)' },
      { header: 'Time(Hrs)' },
      { header: 'Time(Hrs)' },
      { header: 'Time(Hrs)' },
      { header: 'Time(Hrs)' },
    ],
  ];

  ambientConditionsRowCountChange(event: Event) {
    const value = +(event.target as HTMLInputElement).value;
    this.totalRowsAmbient = value;
    this.updateAmbientConditionsTableRows(value);
  }

  updateAmbientConditionsTableRows(count: number) {
    const currentLength = this.ambientConditionsTableData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        // FIX #1: removed sr_no — reusable table manages s_no
        // FIX #6: removed flat composite keys — backfillRow seeds them
        this.ambientConditionsTableData.push({
          regime: '',
          remark: '',
        });
      }
    }
    if (count < currentLength) this.ambientConditionsTableData.splice(count);
  }

  handleAmbientConditionsTableChange(
    index: number,
    field: string,
    value: string,
  ) {
    this.ambientConditionsTableData[index][field] = value;

    // IF A TIME FIELD CHANGES → SYNC ALL 6 TIME FIELDS IN THAT ROW
    const timeFields = [
      'swp_0900hrs_time',
      'swp_1200hrs_time',
      'at_0900hrs_time',
      'at_1200hrs_time',
      'ar_0900hrs_time',
      'ar_1200hrs_time',
    ];

    if (timeFields.includes(field)) {
      const row = this.ambientConditionsTableData[index];
      timeFields.forEach((timeField) => {
        row[timeField] = value;
      });
    }

    this.ambientConditionsTableData = [...this.ambientConditionsTableData];
  }

  // isAmbientConditionsRowEmpty(item: any): boolean {
  //   return !(
  //     item?.regime || item?.swp_0900hrs || item?.swp_1200hrs ||
  //     item?.at_0900hrs || item?.at_1200hrs ||
  //     item?.ar_0900hrs || item?.ar_1200hrs || item?.remark
  //   );
  // }
  isAmbientConditionsRowEmpty(item: any): boolean {
    return !(
      item?.regime ||
      item?.swp_0900hrs_time ||
      item?.swp_0900hrs_value ||
      item?.swp_1200hrs_time ||
      item?.swp_1200hrs_value ||
      item?.at_0900hrs_time ||
      item?.at_0900hrs_value ||
      item?.at_1200hrs_time ||
      item?.at_1200hrs_value ||
      item?.ar_0900hrs_time ||
      item?.ar_0900hrs_value ||
      item?.ar_1200hrs_time ||
      item?.ar_1200hrs_value ||
      item?.remark
    );
  }

  // ============================================================================
  // TABLE TWO — AC PLANT DATA
  // ============================================================================

  acPlantDataColumns: ReusableTableColumnWithHeaders[] = [
    { field: 's_no', header: 'Ser No.', width: '20px', fieldType: 'serial' },
    {
      field: 'plant_no',
      header: 'AC Plant No.',
      width: '220px',
      fieldType: 'drop-down',
      options: this.acPlantNoOptions,
      required: true,
    },
    {
      field: 'cw_in_design',
      header: 'Design',
      fieldType: 'number',
      width: '140px',
      decimalPlaces: 2,
      required: true,
    },
    {
      field: 'cw_in_actual',
      header: 'Actual',
      fieldType: 'number',
      width: '140px',
      decimalPlaces: 1,
      required: true,
    },
    {
      field: 'cw_out_design',
      header: 'Design',
      fieldType: 'number',
      width: '140px',
      decimalPlaces: 1,
      required: true,
    },
    {
      field: 'cw_out_actual',
      header: 'Actual',
      fieldType: 'number',
      width: '140px',
      decimalPlaces: 1,
      required: true,
    },
    {
      field: 'flow_meter_status',
      header: 'Meter Status',
      width: '220px',
      fieldType: 'drop-down',
      required: true,
      options: [
        { label: 'Flow meter present', value: 'present' },
        { label: 'Flow meter defective', value: 'defective' },
        { label: 'Flow meter not available', value: 'not_available' },
      ],
    },
    {
      field: 'cw_flow_design',
      header: 'Design',
      fieldType: 'number',
      step: '0.01',
      width: '140px',
      disabled: (row: any) =>
        row.flow_meter_status === 'not_available' || !row.flow_meter_status,
    },
    {
      field: 'cw_flow_actual',
      header: 'Actual',
      fieldType: 'number',
      step: '0.01',
      width: '140px',
      disabled: (row: any) =>
        row.flow_meter_status === 'defective' ||
        row.flow_meter_status === 'not_available' ||
        !row.flow_meter_status,
    },
    {
      field: 'observations',
      header: 'Observations',
      width: '220px',
      fieldType: 'drop-down',
      options: this.acPlantObservationOptions,
      required: true,
    },
    {
      field: 'remark',
      header: 'Remarks',
      width: '220px',
      fieldType: 'drop-down',
      required: true,
      options: [
        { label: 'Sat', value: 'SAT' },
        { label: 'Sat with observations', value: 'SAT with observations' },
        { label: 'UnSat', value: 'UNSAT' },
      ],
    },
  ];

  acPlantDataHeaderRows: ReusableHeaderCell[][] = [
    [
      { header: 'Ser No.', rowspan: 2 },
      { header: 'AC Plant No.', rowspan: 2, required: true },
      { header: 'CW Inlet Temp (°C)', colspan: 2, required: true },
      { header: 'CW Outlet Temp (°C)', colspan: 2, required: true },
      { header: 'CW Flow (m3/hr)', colspan: 3, required: true },
      { header: 'Observations', rowspan: 2, required: true },
      { header: 'Remarks', rowspan: 2, required: true },
    ],
    [
      { header: 'Design' },
      { header: 'Actual' },
      { header: 'Design' },
      { header: 'Actual' },
      { header: 'Meter Status' },
      { header: 'Design' },
      { header: 'Actual' },
    ],
  ];

  acPlantDataCountChange(event: Event) {
    const value = +(event.target as HTMLInputElement).value;
    this.totalRowsAcPlant = value;
    this.updateAcPlantDataTableRows(value);
  }

  updateAcPlantDataTableRows(count: number) {
    const currentLength = this.acPlantTableData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        // FIX #1: removed sr_no — reusable table manages s_no
        this.acPlantTableData.push({
          plant_no: '',
          cw_in_design: '',
          cw_in_actual: '',
          cw_out_design: '',
          cw_out_actual: '',
          flow_meter_status: '',
          cw_flow_design: '',
          cw_flow_actual: '',
          observations: '',
          remark: '',
        });
      }
    }
    if (count < currentLength) this.acPlantTableData.splice(count);
  }

  handleAcPlantDataTableChange(index: number, field: string, value: string) {
    this.acPlantTableData[index][field] = value;
  }

  isAcPlantRowEmpty(item: any): boolean {
    // FIX #3: added flow_meter_status check
    return !(
      item?.plant_no ||
      item?.cw_in_design ||
      item?.cw_in_actual ||
      item?.cw_out_design ||
      item?.cw_out_actual ||
      item?.flow_meter_status ||
      item?.cw_flow_design ||
      item?.cw_flow_actual ||
      item?.observations ||
      item?.remark
    );
  }

  // ============================================================================
  // TABLE THREE — CHILLED WATER MEASUREMENTS
  // ============================================================================

  childWaterMgmtColumns: ReusableTableColumnWithHeaders[] = [
    { field: 's_no', header: 'Ser No.', width: '20px', fieldType: 'serial' },
    {
      field: 'fed_by_atu_he',
      header: 'ATU/ HE',
      width: '150px',
      fieldType: 'drop-down',
      options: this.atuHeOptions,
      required: true,
    },
    {
      field: 'fed_by_ac_plant',
      header: 'Fed by AC plant',
      template: 'inputTpl',
      width: '150px',
      required: true,
    },
    {
      field: 'flow_meter_status',
      header: 'Meter Status',
      width: '220px',
      fieldType: 'drop-down',
      options: [
        { label: 'Flow meter present', value: 'present' },
        { label: 'Flow meter defective', value: 'defective' },
        { label: 'Flow meter not available', value: 'not_available' },
      ],
      required: true,
    },
    {
      field: 'cw_flow_design',
      header: 'Design',
      fieldType: 'number',
      step: '0.01',
      width: '140px',
      disabled: (row: any) =>
        row.flow_meter_status === 'not_available' || !row.flow_meter_status,
    },
    {
      field: 'cw_flow_actual',
      header: 'Actual',
      fieldType: 'number',
      step: '0.01',
      width: '140px',
      disabled: (row: any) =>
        row.flow_meter_status === 'defective' ||
        row.flow_meter_status === 'not_available' ||
        !row.flow_meter_status,
    },
    {
      field: 'cw_in_design',
      header: 'Design',
      fieldType: 'number',
      width: '140px',
      decimalPlaces: 1,
      required: true,
    },
    {
      field: 'cw_in_actual',
      header: 'Actual',
      fieldType: 'number',
      width: '140px',
      decimalPlaces: 1,
      required: true,
    },
    {
      field: 'cw_out_design',
      header: 'Design',
      fieldType: 'number',
      width: '140px',
      decimalPlaces: 1,
      required: true,
    },
    {
      field: 'cw_out_actual',
      header: 'Actual',
      fieldType: 'number',
      width: '140px',
      decimalPlaces: 1,
      required: true,
    },
    {
      field: 'observations',
      header: 'Observations',
      width: '220px',
      fieldType: 'drop-down',
      required: true,
      options: [
        { label: 'Sub-optimal air flow', value: 'Sub-optimal air flow' },
        { label: 'Non-ops', value: 'Non-ops' },
        { label: 'Nil', value: 'Nil' },
        { label: 'Others', value: 'Others' },
      ],
    },
    {
      field: 'remark',
      header: 'Remarks',
      width: '220px',
      fieldType: 'drop-down',
      required: true,
      options: [
        { label: 'Sat', value: 'SAT' },
        { label: 'Sat with observations', value: 'SAT with observations' },
        { label: 'UnSat', value: 'UNSAT' },
      ],
    },
  ];

  childWaterMgmtheaderRows: ReusableHeaderCell[][] = [
    [
      { header: 'Ser No.', rowspan: 2 },
      { header: 'ATU/ HE', rowspan: 2, required: true },
      { header: 'Fed by AC plant', rowspan: 2, required: true },
      { header: 'Chilled Water Flow (m3/hr)', colspan: 3, required: true },
      { header: 'CW Inlet Temp (°C)', colspan: 2, required: true },
      { header: 'CW Outlet Temp (°C)', colspan: 2, required: true },
      { header: 'Observations', rowspan: 2, required: true },
      { header: 'Remarks', rowspan: 2, required: true },
    ],
    [
      { header: 'Meter Status' },
      { header: 'Design' },
      { header: 'Actual' },
      { header: 'Design' },
      { header: 'Actual' },
      { header: 'Design' },
      { header: 'Actual' },
    ],
  ];

  childWaterMgmtCountChange(event: Event) {
    const value = +(event.target as HTMLInputElement).value;
    this.totalRowsChilledWater = value;
    this.updatechildWaterMgmtTableRows(value);
  }

  updatechildWaterMgmtTableRows(count: number) {
    const currentLength = this.childWaterMgmtTableData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        // FIX #1: removed sr_no — reusable table manages s_no
        this.childWaterMgmtTableData.push({
          fed_by_atu_he: '',
          fed_by_ac_plant: '',
          flow_meter_status: '',
          cw_flow_design: '',
          cw_flow_actual: '',
          cw_in_design: '',
          cw_in_actual: '',
          cw_out_design: '',
          cw_out_actual: '',
          observations: '',
          remark: '',
        });
      }
    }
    if (count < currentLength) this.childWaterMgmtTableData.splice(count);
  }

  handlechildWaterMgmtTableChange(index: number, field: string, value: string) {
    this.childWaterMgmtTableData[index][field] = value;
  }

  isChilledWaterRowEmpty(item: any): boolean {
    // FIX #4: added flow_meter_status check
    return !(
      item?.fed_by_atu_he ||
      item?.fed_by_ac_plant ||
      item?.flow_meter_status ||
      item?.cw_flow_design ||
      item?.cw_flow_actual ||
      item?.cw_in_design ||
      item?.cw_in_actual ||
      item?.cw_out_design ||
      item?.cw_out_actual ||
      item?.observations ||
      item?.remark
    );
  }

  // ============================================================================
  // TABLE FOUR — RECORD OF VALUES IN COMPARTMENTS SERVED BY ATUs/HEs
  // ============================================================================

  recordOfValuesInCompartmentColumns: ReusableTableColumnWithHeaders[] = [
    { field: 's_no', header: 'Ser No.', width: '20px', fieldType: 'serial' },
    {
      field: 'served_by',
      header: 'Served By',
      template: 'inputTpl',
      width: '200px',
      required: true,
    },
    {
      field: 'compartment',
      header: 'Compartment',
      fieldType: 'drop-down',
      options: this.compartmentOptions,
      width: '220px',
      required: true,
    },
    {
      field: 'occupancy_d',
      header: 'D',
      fieldType: 'number',
      width: '100px',
      required: true,
    },
    {
      field: 'occupancy_a',
      header: 'A',
      fieldType: 'number',
      width: '100px',
      required: true,
    },
    {
      field: 'fed_by_ac_plant',
      header: 'Fed by AC Plant',
      template: 'inputTpl',
      width: '150px',
      required: true,
    },
    {
      field: 'drybulb_d',
      header: 'D',
      fieldType: 'number',
      width: '100px',
      decimalPlaces: 1,
      required: true,
    },
    {
      field: 'drybulb_a',
      header: 'A',
      fieldType: 'number',
      width: '100px',
      decimalPlaces: 1,
      required: true,
    },
    {
      field: 'dryBulbRemarks',
      header: 'Remarks',
      template: '#dryBuldRemarks',
      width: '100px',
      decimalPlaces: 1,
      required: true,
    },

    {
      field: 'wetbulb_a',
      header: 'A',
      fieldType: 'number',
      width: '100px',
      decimalPlaces: 1,
      required: true,
    },
    {
      field: 'wetbulb_remarks',
      header: 'Remarks',
      fieldType: 'number',
      width: '100px',
      decimalPlaces: 1,
      required: true,
    },
    {
      field: 'rh_d',
      header: 'D',
      fieldType: 'number',
      width: '100px',
      required: true,
    },
    {
      field: 'rh_a',
      header: 'A',
      fieldType: 'number',
      width: '100px',
      required: true,
    },
    {
      field: 'rh_remarks',
      header: 'Remarks',
      fieldType: 'number',
      width: '100px',
      decimalPlaces: 1,
      required: true,
    },

    {
      field: 'remark',
      header: 'Remarks',
      width: '150px',
      fieldType: 'drop-down',
      required: true,
      options: [
        { label: 'Sat', value: 'SAT' },
        { label: 'Sat with observations', value: 'SAT with observations' },
        { label: 'UnSat', value: 'UNSAT' },
      ],
    },
  ];

  recordOfValuesInCompartmentheaderRows: ReusableHeaderCell[][] = [
    // ROW 1
    [
      { header: 'Ser No.', rowspan: 3, required: true },
      { header: 'Served By', rowspan: 3, required: true },
      { header: 'Compartment', rowspan: 3, required: true },
      { header: 'Occupancy c.', colspan: 2, required: true },
      { header: 'Fed by AC Plant d.', rowspan: 3, required: true },
      { header: 'Temperature (°C) e.', colspan: 5, required: true },
      { header: 'Relative Humidity (%) f.', colspan: 3, required: true },
      { header: 'Remarks', rowspan: 3, required: true },
    ],
    // ROW 2
    [
      { header: 'D', rowspan: 2 }, // Occupancy D — spans rows 2 & 3
      { header: 'A', rowspan: 2 }, // Occupancy A — spans rows 2 & 3
      { header: 'Dry Bulb', colspan: 3 }, // splits into D/A in row 3
      { header: 'Wet Bulb', colspan: 2 }, // single col
      { header: 'D', rowspan: 2 }, // RH D — spans rows 2 & 3
      { header: 'A', rowspan: 2 }, // RH A — spans rows 2 & 3
      { header: 'Remarks', rowspan: 2 },
    ],
    // ROW 3 — FIX #5: removed extra { header: 'A' }, only Dry Bulb D & A here
    [
      { header: 'D' }, // Dry Bulb D
      { header: 'A' }, // Dry Bulb A
      { header: 'Remarks' },
      { header: 'A' }, // Dry Bulb A
      { header: 'Remarks' },
    ],
  ];

  recordOfValuesInCompartmentCountChange(event: Event) {
    const value = +(event.target as HTMLInputElement).value;
    this.totalRowsRecordValueInCompartment = value;
    this.updaterecordOfValuesInCompartmentTableRows(value);
  }

  updaterecordOfValuesInCompartmentTableRows(count: number) {
    const currentLength = this.recordOfValuesInCompartmentTableData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        // FIX #1: removed sr_no — reusable table manages s_no
        this.recordOfValuesInCompartmentTableData.push({
          served_by: '',
          compartment: '',
          occupancy_d: '',
          occupancy_a: '',
          fed_by_ac_plant: '',
          drybulb_d: '',
          drybulb_a: '',
          wetbulb_a: '',
          rh_d: '',
          rh_a: '',
          remark: '',
        });
      }
    }
    if (count < currentLength)
      this.recordOfValuesInCompartmentTableData.splice(count);
  }

  handlerecordOfValuesInCompartmentTableChange(
    index: number,
    field: string,
    value: string,
  ) {
    this.recordOfValuesInCompartmentTableData[index][field] = value;
  }

  isCompartmentRowEmpty(item: any): boolean {
    return !(
      item?.served_by ||
      item?.compartment ||
      item?.occupancy_d ||
      item?.occupancy_a ||
      item?.fed_by_ac_plant ||
      item?.drybulb_d ||
      item?.drybulb_a ||
      item?.wetbulb_a ||
      item?.rh_d ||
      item?.rh_a ||
      item?.remark
    );
  }

  // ============================================================================
  // TABLE FIVE — RECORD OF VALUES IN MACHINERY / GENERAL COMPARTMENTS
  // ============================================================================

  recordOfValuesInMachineryColumns: ReusableTableColumnWithHeaders[] = [
    { field: 's_no', header: 'Ser No.', width: '20px', fieldType: 'serial' },
    {
      field: 'compartment',
      header: 'Compt Name',
      fieldType: 'drop-down',
      options: this.compartmentOptions,
      width: '220px',
      required: true,
    },
    {
      field: 'occupancy_d',
      header: 'Design',
      fieldType: 'number',
      width: '140px',
      required: true,
    },
    {
      field: 'occupancy_a',
      header: 'Actual',
      fieldType: 'number',
      width: '140px',
      required: true,
    },
    {
      field: 'fed_by_atu',
      header: 'Fed by ATU/ HE',
      width: '140px',
      required: true,
      fieldType: 'drop-down',
      options: this.atuHeOptions,
    },
    {
      field: 'fed_by_supply',
      header: 'Fed by Supply/ Exhaust',
      width: '140px',
      required: true,
      fieldType: 'drop-down',
      options: this.fedBySupplyOptions,
    },
    {
      field: 'drybulb_d',
      header: 'Design',
      fieldType: 'number',
      width: '140px',
      required: true,
      decimalPlaces: 1,
    },
    {
      field: 'drybulb_a',
      header: 'Actual',
      fieldType: 'number',
      width: '140px',
      required: true,
      decimalPlaces: 1,
    },
    {
      field: 'wetbulb_d',
      header: 'Design',
      fieldType: 'number',
      width: '140px',
      required: true,
      decimalPlaces: 1,
    },
    {
      field: 'wetbulb_a',
      header: 'Actual',
      fieldType: 'number',
      width: '140px',
      required: true,
      decimalPlaces: 1,
    },
    {
      field: 'rh_designed',
      header: 'Design',
      fieldType: 'number',
      width: '140px',
      required: true,
    },
    {
      field: 'rh_measured',
      header: 'Measured',
      fieldType: 'number',
      width: '140px',
      required: true,
    },
    {
      field: 'remark',
      header: 'Remarks',
      width: '150px',
      required: true,
      fieldType: 'drop-down',
      options: [
        { label: 'Sat', value: 'SAT' },
        { label: 'Sat with observations', value: 'SAT with observations' },
        { label: 'UnSat', value: 'UNSAT' },
      ],
    },
  ];

  recordOfValuesInMachineryheaderRows: ReusableHeaderCell[][] = [
    [
      { header: 'Ser No.', rowspan: 2, required: true },
      { header: 'Compt Name', rowspan: 2, required: true },
      { header: 'Occupancy', colspan: 2, required: true },
      { header: 'Fed by ATU/ HE', rowspan: 2, required: true },
      { header: 'Fed by Supply/ Exhaust', rowspan: 2, required: true },
      { header: 'Dry Bulb Temperature (°C)', colspan: 2, required: true },
      { header: 'Wet Bulb Temperature (°C)', colspan: 2, required: true },
      { header: 'Relative Humidity (%)', colspan: 2, required: true },
      { header: 'Remarks', rowspan: 2, required: true },
    ],
    [
      { header: 'Design' },
      { header: 'Actual' },
      { header: 'Design' },
      { header: 'Actual' },
      { header: 'Design' },
      { header: 'Actual' },
      { header: 'Design' },
      { header: 'Measured' },
    ],
  ];

  recordOfValuesInMachineryCountChange(event: Event) {
    const value = +(event.target as HTMLInputElement).value;
    this.totalRowsRecordValueInMachinery = value;
    this.updaterecordOfValuesInMachineryTableRows(value);
  }

  updaterecordOfValuesInMachineryTableRows(count: number) {
    const currentLength = this.recordOfValuesInMachineryTableData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        // FIX #1: removed sr_no — reusable table manages s_no
        this.recordOfValuesInMachineryTableData.push({
          compartment: '',
          occupancy_d: '',
          occupancy_a: '',
          fed_by_atu: '',
          fed_by_supply: '',
          drybulb_d: '',
          drybulb_a: '',
          wetbulb_d: '',
          wetbulb_a: '',
          rh_designed: '',
          rh_measured: '',
          remark: '',
        });
      }
    }
    if (count < currentLength)
      this.recordOfValuesInMachineryTableData.splice(count);
  }

  handlerecordOfValuesInMachineryTableChange(
    index: number,
    field: string,
    value: string,
  ) {
    this.recordOfValuesInMachineryTableData[index][field] = value;
  }

  isMachineryRowEmpty(item: any): boolean {
    return !(
      item?.compartment ||
      item?.occupancy_d ||
      item?.occupancy_a ||
      item?.fed_by_atu ||
      item?.fed_by_supply ||
      item?.drybulb_d ||
      item?.drybulb_a ||
      item?.wetbulb_d ||
      item?.wetbulb_a ||
      item?.rh_designed ||
      item?.rh_measured ||
      item?.remark
    );
  }

  /* ============================================================================
     PAYLOAD FORMATTERS  — filter empty rows, map to API shape
  ============================================================================ */

  // private formatAmbientConditions() {
  //   return this.ambientConditionsTableData
  //     .filter((item) => !this.isAmbientConditionsRowEmpty(item))
  //     .map((item) => ({
  //       id: item?.id || null,
  //       sr_no: item.s_no,   // FIX #1: was item.sr_no
  //       regime: item.regime,
  //       swp_0900hrs: item.swp_0900hrs,
  //       swp_1200hrs: item.swp_1200hrs,
  //       at_0900hrs: item.at_0900hrs,
  //       at_1200hrs: item.at_1200hrs,
  //       ar_0900hrs: item.ar_0900hrs,
  //       ar_1200hrs: item.ar_1200hrs,
  //       remark: item.remark,
  //     }));
  // }

  private formatAmbientConditions() {
    return this.ambientConditionsTableData
      .filter((item) => !this.isAmbientConditionsRowEmpty(item))
      .map((item) => ({
        id: item?.id || null,
        sr_no: item.s_no,
        regime: item.regime,
        swp_0900hrs_time: item.swp_0900hrs_time,
        swp_0900hrs_value: item.swp_0900hrs_value,
        swp_1200hrs_time: item.swp_1200hrs_time,
        swp_1200hrs_value: item.swp_1200hrs_value,
        at_0900hrs_time: item.at_0900hrs_time,
        at_0900hrs_value: item.at_0900hrs_value,
        at_1200hrs_time: item.at_1200hrs_time,
        at_1200hrs_value: item.at_1200hrs_value,
        ar_0900hrs_time: item.ar_0900hrs_time,
        ar_0900hrs_value: item.ar_0900hrs_value,
        ar_1200hrs_time: item.ar_1200hrs_time,
        ar_1200hrs_value: item.ar_1200hrs_value,
        remark: item.remark,
      }));
  }

  private formatAcPlantData() {
    return this.acPlantTableData
      .filter((item) => !this.isAcPlantRowEmpty(item))
      .map((item) => ({
        id: item?.id || null,
        sr_no: item.s_no, // FIX #1: was item.sr_no
        plant_no: item.plant_no,
        cw_in_design: item.cw_in_design,
        cw_in_actual: item.cw_in_actual,
        cw_out_design: item.cw_out_design,
        cw_out_actual: item.cw_out_actual,
        cw_flow_design: item.cw_flow_design,
        cw_flow_actual: item.cw_flow_actual,
        observations: item.observations,
        remark: item.remark,
      }));
  }

  private formatChilledWaterData() {
    return this.childWaterMgmtTableData
      .filter((item) => !this.isChilledWaterRowEmpty(item))
      .map((item) => ({
        id: item?.id || null,
        sr_no: item.s_no, // FIX #1: was item.sr_no
        fed_by_atu_he: item.fed_by_atu_he,
        fed_by_ac_plant: item.fed_by_ac_plant,
        cw_flow_design: item.cw_flow_design,
        cw_flow_actual: item.cw_flow_actual,
        cw_in_design: item.cw_in_design,
        cw_in_actual: item.cw_in_actual,
        cw_out_design: item.cw_out_design,
        cw_out_actual: item.cw_out_actual,
        observations: item.observations,
        remark: item.remark,
      }));
  }

  private formatCompartmentData() {
    return this.recordOfValuesInCompartmentTableData
      .filter((item) => !this.isCompartmentRowEmpty(item))
      .map((item) => ({
        id: item?.id || null,
        sr_no: item.s_no, // FIX #1: was item.sr_no
        served_by: item.served_by,
        compartment_id: item.compartment,
        occupancy_d: item.occupancy_d,
        occupancy_a: item.occupancy_a,
        fed_by_ac_plant: item.fed_by_ac_plant,
        drybulb_d: item.drybulb_d,
        drybulb_a: item.drybulb_a,
        wetbulb_a: item.wetbulb_a,
        rh_d: item.rh_d,
        rh_a: item.rh_a,
        remark: item.remark,
      }));
  }

  private formatMachineryData() {
    return this.recordOfValuesInMachineryTableData
      .filter((item) => !this.isMachineryRowEmpty(item))
      .map((item) => ({
        id: item?.id || null,
        sr_no: item.s_no, // FIX #1: was item.sr_no
        compartment_id: item.compartment,
        occupancy_d: item.occupancy_d,
        occupancy_a: item.occupancy_a,
        fed_by_atu: item.fed_by_atu,
        fed_by_supply: item.fed_by_supply,
        drybulb_d: item.drybulb_d,
        drybulb_a: item.drybulb_a,
        wetbulb_d: item.wetbulb_d,
        wetbulb_a: item.wetbulb_a,
        rh_designed: item.rh_designed,
        rh_measured: item.rh_measured,
        remark: item.remark,
      }));
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }

  /* ----------------------------- EDIT MODE ----------------------------------- */

  getEditDataByRowId(rowId: string) {
    this.apiService.get(`${Apiendpoints.BER_CERTIFICATE}${rowId}`).subscribe({
      next: (res: any) => {
        if (res?.data) {
          this.editDataDetails = res.data;
          this.form.patchValue({
            occasion_of_conduct_trail: res.data.occasion_of_conduct_trail ?? '',
            classOfShip: res.data.classOfShip ?? '',
            ship: res.data.ship ?? '',
            date_of_conduct_trail: res.data.date_of_conduct_trail ?? '',
            place_of_conduct_trail: res.data.place_of_conduct_trail ?? '',
            document_no: res.data.document_no ?? '',
            authority_conduct_trail_remarks:
              res.data.authority_conduct_trail_remarks ?? '', // FIX #2: matched form control key
            authority_date: res.data.authority_date ?? '',
          });
        }
      },
      error: (err) => {
        console.error('Error fetching HVAC Phase 2 data:', err);
        this.toastService.showError('Failed to load HVAC Phase 2 details.');
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

  /* ============================================================================
     SAVE
  ============================================================================ */

  buildPayload() {
    const formDataValues = this.form.getRawValue();
    const payload: any = {
      ...this.form.value,
      ambient_conditions: this.formatAmbientConditions(),
      ac_plant_data: this.formatAcPlantData(),
      chilled_water_measurements: this.formatChilledWaterData(),
      compartment_values: this.formatCompartmentData(),
      machinery_values: this.formatMachineryData(),
      authority_doc: FileUrlUtil.getFileUrl(formDataValues.authority_doc?.id),
    };
    return payload;
  }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      this.form.reset();
      this.toast.showSuccess('Form cleared successfully');
      return;
    }
    const payload = this.buildPayload();
    console.log(
      'AMBIENT PAYLOAD →',
      JSON.stringify(payload.ambient_conditions, null, 2),
    );
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
      // this.form.patchValue({ vesselType: trialRow.ship_type_name }, { emitEvent: false });
      this.vesselTypeValue = trialRow.ship_type_name ?? '';

      this.form.patchValue(
        { vesselType: this.vesselTypeValue },
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
      console.error('Trial prefill failed (HVAC Phase 2)', e);
    }
  }

  /** Tab switch hone par call hota hai */
  async setActiveTab(tab: any): Promise<void> {
    if (!tab || this.isSameEquipment(this.activeTab, tab)) return;

    this.activeTab = tab;
    this.formApiService.setCurrentEquipmentNomenclature(tab);

    if (!this.workflowTrialId) return;

    this.resetFormData();
    // Restore ship-level field after reset
    this.form.patchValue(
      { vesselType: this.vesselTypeValue },
      { emitEvent: false },
    );
    this.form.get('vesselType')?.disable({ emitEvent: false });

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
      this.form.patchValue(
        { vesselType: this.vesselTypeValue },
        { emitEvent: false },
      );
      this.form.get('vesselType')?.disable({ emitEvent: false });
      this.cdr.detectChanges();
    } catch (error) {
      console.error(
        'Failed to load HVAC Phase 2 data for selected equipment',
        error,
      );
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  /** Ship-level flat payload ya equipment-keyed nested payload dono handle karta hai */
  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'document_no' in jsonData ||
      'date_of_conduct_trail' in jsonData ||
      'ambient_conditions' in jsonData;
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

  /** Tab switch pe form + saari 5 tables reset — default 1-1 row ke saath */
  private resetFormData(): void {
    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;
      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    this.ambientConditionsTableData = [];
    this.updateAmbientConditionsTableRows(1);
    this.totalRowsAmbient = 1;

    this.acPlantTableData = [];
    this.updateAcPlantDataTableRows(1);
    this.totalRowsAcPlant = 1;

    this.childWaterMgmtTableData = [];
    this.updatechildWaterMgmtTableRows(1);
    this.totalRowsChilledWater = 1;

    this.recordOfValuesInCompartmentTableData = [];
    this.updaterecordOfValuesInCompartmentTableRows(1);
    this.totalRowsRecordValueInCompartment = 1;

    this.recordOfValuesInMachineryTableData = [];
    this.updaterecordOfValuesInMachineryTableRows(1);
    this.totalRowsRecordValueInMachinery = 1;
  }

  /** Poore form + paanchon reusable tables ko equipment-specific payload se hydrate karta hai */
  fillData(payload: any): void {
    if (!payload) return;

    const specialKeys = [
      'authority_doc',
      'ambient_conditions',
      'ac_plant_data',
      'chilled_water_measurements',
      'compartment_values',
      'machinery_values',
    ];

    Object.keys(payload).forEach((key) => {
      if (specialKeys.includes(key)) return;
      const control = this.form.get(key);
      if (control) {
        control.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });

    // authority_doc — URL string ko file-upload component ke required shape mein convert karo
    this.form
      .get('authority_doc')
      ?.setValue(this.buildFileUploadValue(payload.authority_doc), {
        emitEvent: false,
      });

    // ----- TABLE 1: Ambient Conditions -----
    const ambientRows = Array.isArray(payload.ambient_conditions)
      ? payload.ambient_conditions
      : [];
    this.ambientConditionsTableData = ambientRows.length
      ? ambientRows.map((item: any) => ({
          id: item?.id ?? null,
          s_no: item.sr_no,
          regime: item.regime ?? '',
          swp_0900hrs_time: item.swp_0900hrs_time ?? '',
          swp_0900hrs_value: item.swp_0900hrs_value ?? '',
          swp_1200hrs_time: item.swp_1200hrs_time ?? '',
          swp_1200hrs_value: item.swp_1200hrs_value ?? '',
          at_0900hrs_time: item.at_0900hrs_time ?? '',
          at_0900hrs_value: item.at_0900hrs_value ?? '',
          at_1200hrs_time: item.at_1200hrs_time ?? '',
          at_1200hrs_value: item.at_1200hrs_value ?? '',
          ar_0900hrs_time: item.ar_0900hrs_time ?? '',
          ar_0900hrs_value: item.ar_0900hrs_value ?? '',
          ar_1200hrs_time: item.ar_1200hrs_time ?? '',
          ar_1200hrs_value: item.ar_1200hrs_value ?? '',
          remark: item.remark ?? '',
        }))
      : [{ regime: '', remark: '' }];
    this.totalRowsAmbient = this.ambientConditionsTableData.length;

    // ----- TABLE 2: AC Plant Data -----
    const acPlantRows = Array.isArray(payload.ac_plant_data)
      ? payload.ac_plant_data
      : [];
    this.acPlantTableData = acPlantRows.length
      ? acPlantRows.map((item: any) => ({
          id: item?.id ?? null,
          s_no: item.sr_no,
          plant_no: item.plant_no ?? '',
          cw_in_design: item.cw_in_design ?? '',
          cw_in_actual: item.cw_in_actual ?? '',
          cw_out_design: item.cw_out_design ?? '',
          cw_out_actual: item.cw_out_actual ?? '',
          flow_meter_status: item.flow_meter_status ?? '',
          cw_flow_design: item.cw_flow_design ?? '',
          cw_flow_actual: item.cw_flow_actual ?? '',
          observations: item.observations ?? '',
          remark: item.remark ?? '',
        }))
      : [
          {
            plant_no: '',
            cw_in_design: '',
            cw_in_actual: '',
            cw_out_design: '',
            cw_out_actual: '',
            flow_meter_status: '',
            cw_flow_design: '',
            cw_flow_actual: '',
            observations: '',
            remark: '',
          },
        ];
    this.totalRowsAcPlant = this.acPlantTableData.length;

    // ----- TABLE 3: Chilled Water Measurements -----
    const chilledRows = Array.isArray(payload.chilled_water_measurements)
      ? payload.chilled_water_measurements
      : [];
    this.childWaterMgmtTableData = chilledRows.length
      ? chilledRows.map((item: any) => ({
          id: item?.id ?? null,
          s_no: item.sr_no,
          fed_by_atu_he: item.fed_by_atu_he ?? '',
          fed_by_ac_plant: item.fed_by_ac_plant ?? '',
          flow_meter_status: item.flow_meter_status ?? '',
          cw_flow_design: item.cw_flow_design ?? '',
          cw_flow_actual: item.cw_flow_actual ?? '',
          cw_in_design: item.cw_in_design ?? '',
          cw_in_actual: item.cw_in_actual ?? '',
          cw_out_design: item.cw_out_design ?? '',
          cw_out_actual: item.cw_out_actual ?? '',
          observations: item.observations ?? '',
          remark: item.remark ?? '',
        }))
      : [
          {
            fed_by_atu_he: '',
            fed_by_ac_plant: '',
            flow_meter_status: '',
            cw_flow_design: '',
            cw_flow_actual: '',
            cw_in_design: '',
            cw_in_actual: '',
            cw_out_design: '',
            cw_out_actual: '',
            observations: '',
            remark: '',
          },
        ];
    this.totalRowsChilledWater = this.childWaterMgmtTableData.length;

    // ----- TABLE 4: Record of Values in Compartments -----
    const compartmentRows = Array.isArray(payload.compartment_values)
      ? payload.compartment_values
      : [];
    this.recordOfValuesInCompartmentTableData = compartmentRows.length
      ? compartmentRows.map((item: any) => ({
          id: item?.id ?? null,
          s_no: item.sr_no,
          served_by: item.served_by ?? '',
          compartment: item.compartment_id ?? '',
          occupancy_d: item.occupancy_d ?? '',
          occupancy_a: item.occupancy_a ?? '',
          fed_by_ac_plant: item.fed_by_ac_plant ?? '',
          drybulb_d: item.drybulb_d ?? '',
          drybulb_a: item.drybulb_a ?? '',
          wetbulb_a: item.wetbulb_a ?? '',
          rh_d: item.rh_d ?? '',
          rh_a: item.rh_a ?? '',
          remark: item.remark ?? '',
        }))
      : [
          {
            served_by: '',
            compartment: '',
            occupancy_d: '',
            occupancy_a: '',
            fed_by_ac_plant: '',
            drybulb_d: '',
            drybulb_a: '',
            wetbulb_a: '',
            rh_d: '',
            rh_a: '',
            remark: '',
          },
        ];
    this.totalRowsRecordValueInCompartment =
      this.recordOfValuesInCompartmentTableData.length;

    // ----- TABLE 5: Record of Values in Machinery / General Compartments -----
    const machineryRows = Array.isArray(payload.machinery_values)
      ? payload.machinery_values
      : [];
    this.recordOfValuesInMachineryTableData = machineryRows.length
      ? machineryRows.map((item: any) => ({
          id: item?.id ?? null,
          s_no: item.sr_no,
          compartment: item.compartment_id ?? '',
          occupancy_d: item.occupancy_d ?? '',
          occupancy_a: item.occupancy_a ?? '',
          fed_by_atu: item.fed_by_atu ?? '',
          fed_by_supply: item.fed_by_supply ?? '',
          drybulb_d: item.drybulb_d ?? '',
          drybulb_a: item.drybulb_a ?? '',
          wetbulb_d: item.wetbulb_d ?? '',
          wetbulb_a: item.wetbulb_a ?? '',
          rh_designed: item.rh_designed ?? '',
          rh_measured: item.rh_measured ?? '',
          remark: item.remark ?? '',
        }))
      : [
          {
            compartment: '',
            occupancy_d: '',
            occupancy_a: '',
            fed_by_atu: '',
            fed_by_supply: '',
            drybulb_d: '',
            drybulb_a: '',
            wetbulb_d: '',
            wetbulb_a: '',
            rh_designed: '',
            rh_measured: '',
            remark: '',
          },
        ];
    this.totalRowsRecordValueInMachinery =
      this.recordOfValuesInMachineryTableData.length;
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
