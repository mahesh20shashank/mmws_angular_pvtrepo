import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DoCheck, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import { ToastComponent } from '../../../../ui/toast/toast.component';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { Apiendpoints } from '../../../../ApiEndPoints';
import {
  FormInputTableWithHeaders,
  ReusableHeaderCell,
  ReusableTableColumnWithHeaders,
} from '../../../../ui/form-input-table-with-headers/form-input-table-with-headers.component';
import { DuctCalculatorDialogComponent } from '../../../../ui/duct-calculator-dialog/duct-calculator-dialog.component';
import { ParameterCardComponent } from '../../../../ui/parameter-card/parameter-card.component';
import {
  FileUploadComponent,
  UploadedFileItem,
} from '../../../../ui/file-upload/file-upload.component';
import { SelectWithSearchComponent } from '../../../../ui/select-with-search/select-with-search-box.component';
import { ReusableDeleteDialogDynamicContent } from '../../../../ui/reusable-delete-dialog-dynamic-content/reusable-delete-dialog-dynamic-content';
import { InputComponent } from '../../../../ui/input.component';
import { CalenderComponent } from '../../../../ui/calender.component';
import { MasterService } from '../../../../services/master.service';
import { SelectComponent } from '../../../../ui/select.component';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { TabsComponent } from '../../../../ui/tabs/tabs.component';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-hvac-phase-1-add',
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
    DuctCalculatorDialogComponent,
    ParameterCardComponent,
    FileUploadComponent,
    ApprovalWorkFlow,
    ReusableDeleteDialogDynamicContent,
    TabsComponent,
  ],
  templateUrl: './hvac-phase-1-add.component.html',
})
export class HvacPhase1AddComponent implements OnInit, DoCheck {
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

  readonly CalculatorIcon = 'calculator';
  readonly deleteIcon = 'trash';

  tableRowDeleteDialogOpen = false;

  CalculatedDuctAreaDetails = '';
  CalculatedAirFlowDetails = '';

  form!: FormGroup;
  loading = false;
  showApprovalWorkflowPopup = false;
      isSubmitTime = false;

  workflowTrialId: string | undefined = undefined;

  shipTypeOptions = [
    { label: 'Ship', value: 'ship' },
    { label: 'Submarine', value: 'submarine' },
  ];

  shipOptions: any[] = [];
  locationOptions: any[] = [];
  compartmentOptions: any[] = [];
  occasionOptions: any[] = [];

  totalRowsOps = 1;
  initialRowsCountOpsInEditMode = 1; // FOR EDIT MODE

  totalRowsMachineComp = 1;
  initialRowsCountMachineCompInEditMode = 1; // FOR EDIT MODE

  airFlowMeasurementOfAc: any[] = [];
  airFlowMeasurementOfMachineryComp: any[] = [];

  selectedReportFile: File | null = null;

  previousAcRows: any[] = [];

  uploadedAuthorityFiles: UploadedFileItem[] = [];

  selectedRow: any = null;
  selectedRowIndex: number | null = null;
  selectedTable: 'ac' | 'machinery' | null = null;
  ductDialogOpen = false;

  positiveObservationOptions = [
    { label: 'Observations', value: 'observations' },
    { label: 'No observations', value: 'no_observations' },
    { label: 'Nill', value: 'nill' },
    { label: 'NA', value: 'na' },
  ];

  negativeObservationOptions = [
    { label: 'Sub-optimal air flow', value: 'Sub-optimal air flow' },
    { label: 'Non-ops', value: 'non_ops' },
    { label: 'Others', value: 'Others' },
  ];

  eqpList: any[] = [];
  activeTab: any = null;

  get headerEquipmentTabs(): any[] {
    if (this.eqpList.length) return this.eqpList;

    const contextEquipments = this.formApiService?.context?.equipment_details;
    console.log('contextEquipments', contextEquipments);
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

  constructor(
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private masterService: MasterService,
    private apiService: ApiService,
    private toastService: ToastService,
    public formApiService: FormApiService,
    private toast: ToastService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadLocation();
    this.loadCompartments();
    this.loadOccassionOfConductTrail();
    this.loadTrialPrefillFromQuery();

    //------------------------ INITIALIZING WITH NO OF ROWS
    this.updateAcCompartmentTableRows(this.totalRowsOps);
    this.updateAirMeasurementMachineCompTableRows(this.totalRowsMachineComp);
    if (this.rowId) {
      this.editMode = true;
      this.getEditDataByRowId(this.rowId);
    }
    //------------------------------ IN CASE OF EDIT MODE --------------------
    if (this.editMode) {
      this.totalRowsOps = this.initialRowsCountOpsInEditMode;
      this.totalRowsMachineComp = this.initialRowsCountMachineCompInEditMode;
    }
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
  // -------------------- ocassion of conduct trial --------------------------------
  loadOccassionOfConductTrail() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=OCCHITU`,
        { labelKey: 'name', valueKey: 'id' },
      )
      .subscribe((res) => {
        Promise.resolve().then(() => {
          this.occasionOptions = res || [];
          this.cdr.markForCheck();
        });
      });
  }
  // ------------- LOAD COMPARTMENTS FOR TABLE----------------
  loadCompartments() {
    this.apiService
      .getDropdownData(`${Apiendpoints.MASTER_COMPARTMENT}`, {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((res) => {
        this.compartmentOptions = res || [];

        // FIRST TABLE COLUMN
        const opsCompartmentColumn = this.OPSColumns.find(
          (col) => col.field === 'compartmentName',
        );

        // SECOND TABLE COLUMN
        const machineCompartmentColumn =
          this.airMeasurementMachineCompColumns.find(
            (col) => col.field === 'compartmentName',
          );

        // UPDATE FIRST TABLE OPTIONS
        if (opsCompartmentColumn) {
          opsCompartmentColumn.options = [...this.compartmentOptions];
        }

        // UPDATE SECOND TABLE OPTIONS
        if (machineCompartmentColumn) {
          machineCompartmentColumn.options = [...this.compartmentOptions];
        }

        // FORCE REFRESH
        this.OPSColumns = [...this.OPSColumns];
        this.airMeasurementMachineCompColumns = [
          ...this.airMeasurementMachineCompColumns,
        ];

        this.cdr.detectChanges();
      });
  }

  // ---------------------------------- DUCT DETAILS SET UP ----------------------------
  handleDuctSave(data: {
    ductDetails: {
      ductArea: string;
      airFlow: string;
      flowRate: string;
    }[];
    flowRateAtDucts: string;
    duct_no: string;
    duct_type: [];
  }) {
    if (this.selectedRowIndex === null || !this.selectedTable) return;
    // -----------------TO SHOW IN DUCT AREA FEILD --------------
    const ductArea = data.ductDetails
      .map((d, i) => `${i + 1}.) ${d.ductArea}`)
      .join('\n');

    // -----------------TO AIR FLOW AREA FEILD --------------
    const airFlow = data.ductDetails
      .map((d, i) => `${i + 1}.) ${d.airFlow}`)
      .join('\n');
    // -----------------TO SHOW IN FLOW RATE FEILD --------------
    const flowRate = data.ductDetails
      .map((d, i) => `${i + 1}.) ${d.flowRate}`)
      .join('\n');

    const updatedRow = {
      ...this.selectedRow,
      ductArea,
      airFlow,
      flowRateAtDucts: flowRate,
      measuredValue: data?.flowRateAtDucts,
      calCulatedDetails: data?.ductDetails,
      duct_no: data?.duct_no,
      noOfDucts: data?.ductDetails?.length,
      typeOfDuct: data?.duct_type,
    };

    const measured =
      updatedRow.measuredValue !== '' && updatedRow.measuredValue != null
        ? Number(updatedRow.measuredValue)
        : null;
    const design =
      updatedRow.design_value !== '' && updatedRow.design_value != null
        ? Number(updatedRow.design_value)
        : null;
    updatedRow.flowRateObservation =
      measured !== null && design !== null
        ? measured >= design
          ? 'SAT'
          : 'UNSAT'
        : '';

    // 🔹 Update correct table
    if (this.selectedTable === 'ac') {
      this.airFlowMeasurementOfAc[this.selectedRowIndex] = updatedRow;
      this.airFlowMeasurementOfAc = [...this.airFlowMeasurementOfAc];
    }

    if (this.selectedTable === 'machinery') {
      this.airFlowMeasurementOfMachineryComp[this.selectedRowIndex] =
        updatedRow;
      this.airFlowMeasurementOfMachineryComp = [
        ...this.airFlowMeasurementOfMachineryComp,
      ];
    }
    this.handleDialogClose();
  }

  /* -------------------------------- FORM SETUP ------------------------------- */
  buildForm() {
    this.form = this.fb.group({
      vesselType: ['', Validators.required],
      ship_or_submarine: ['', Validators.required],
      date_of_conduct_trail: ['', Validators.required],
      place_of_conduct_trail: ['', Validators.required],
      occasion_of_conduct_trail: ['', Validators.required],
      document_no: ['', Validators.required],
      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],
      ship: [{ value: '', disabled: true }],
    });
  }

  // ----------------------------------------------- TABLE CONTENT CONFIGURATION -------------------------------------------------
  handleTableAction(event: any, table: 'ac' | 'machinery') {
    console.log('event', event);
    if (event.type === 'calculate') {
      if (table === 'ac') {
        this.selectedRow = {
          ...this.airFlowMeasurementOfAc[event.index],
          table: 'ac',
        };
      }

      if (table === 'machinery') {
        this.selectedRow = {
          ...this.airFlowMeasurementOfMachineryComp[event.index],
          table: 'machinery',
        };
      }

      this.selectedRowIndex = event.index;
      this.selectedTable = table;

      this.ductDialogOpen = true;
    }

    if (event.type === 'delete') {
      this.selectedRow = {
        ...event.row,
        table: event.table,
      };
      this.tableRowDeleteDialogOpen = true;

      this.selectedRowIndex = event.index;
      this.selectedTable = event.table;
    }
  }

  closeDeleteDialog() {
    this.tableRowDeleteDialogOpen = false;
  }
  // ----------------------------------------- CONFIRM DELETE ---------------------------
  confirmDelete() {
    if (this.selectedTable === 'ac' && this.selectedRowIndex !== null) {
      this.airFlowMeasurementOfAc.splice(this.selectedRowIndex, 1);
    }

    if (this.selectedTable === 'machinery' && this.selectedRowIndex !== null) {
      this.airFlowMeasurementOfMachineryComp.splice(this.selectedRowIndex, 1);
    }

    this.tableRowDeleteDialogOpen = false;
  }
  // ---------------------- TO CHECK THE MEASURE VALUE AND DESIGN VALUE IN EACH ROW AND TO CHECK WHETHER THE REMARKS ARE GETTING AUTO SET OR NOT ---------------------------------
  ngDoCheck() {
    this.airFlowMeasurementOfAc.forEach((row, index) => {
      const prev = this.previousAcRows[index];

      if (!prev || prev.measuredValue !== row.measuredValue) {
        console.log('measuredValue changed => ', row.measuredValue);
      }

      if (!prev || prev.design_value !== row.design_value) {
        console.log('design_value changed => ', row.design_value);
      }

      if (!prev || prev.observations !== row.observations) {
        console.log('observations changed => ', row.observations);
      }
    });

    this.previousAcRows = JSON.parse(
      JSON.stringify(this.airFlowMeasurementOfAc),
    );
  }

  autoSetRemark(row: any, changedField?: string): void {
    console.log('Auto-setting remark for row => ', row);

    const measured =
      row.measuredValue !== '' &&
      row.measuredValue !== null &&
      row.measuredValue !== undefined
        ? Number(row.measuredValue)
        : null;

    const design =
      row.design_value !== '' &&
      row.design_value !== null &&
      row.design_value !== undefined
        ? Number(row.design_value)
        : null;

    // ---------------- FLOW RATE OBSERVATION ----------------
    // only set when measured value exists

    if (measured !== null && design !== null) {
      row.flowRateObservation = measured >= design ? 'SAT' : 'UNSAT';
    } else {
      row.flowRateObservation = '';
    }
  }

  OPSColumns: ReusableTableColumnWithHeaders[] = [
    { field: 's_no', header: 'Ser no.', width: '40px', fieldType: 'serial' },
    {
      field: 'servedByAC',
      header: 'Served by ATU/ HE/ AHU/ FCU',
      fieldType: 'drop-down',
      required: true,
      options: [
        { label: 'ATU', value: 'ATU' },
        { label: 'HE', value: 'HE' },
        { label: 'AHU', value: 'AHU' },
        { label: 'FCU', value: 'FCU' },
      ],
      width: '180px',
    },

    {
      field: 'compartmentName',
      header: 'Compartment Name',
      required: true,
      width: '250px',
      fieldType: 'drop-down',
      options: this.compartmentOptions,
    },
    {
      field: 'typeOfDuct',
      header: 'Type of Duct',
      template: 'ductTypeTemplate',
      width: '180px',
    },
    {
      field: 'noOfDucts',
      header: 'No. of Ducts',
      fieldType: 'number',
      required: true,
      width: '120px',
      disabled: (row: any) => {
        return Number(row?.measuredValue) > 0;
      },
    },
    {
      field: 'ductArea',
      header: 'Duct Area (m²)',
      template: 'ductAreaTemplate',
      width: '180px',
    },

    {
      field: 'airFlow',
      header: 'Air flow (m/s)',
      template: 'AirFlowTemplate',
      width: '180px',
    },
    {
      field: 'flowRateAtDucts',
      header: 'Flow Rate at Duct (m3/ hr)',
      width: '180px',
      template: 'FlowRateTemplate',
    },
    {
      field: 'design_value',
      header: 'Design Value',
      width: '180px',
      fieldType: 'number',
      decimalPlaces: 2,
      required: true,
    },
    {
      field: 'measuredValue',
      header: 'Measured Value',
      template: 'MeasuredValueTemplate',
      width: '180px',
    },
    {
      field: 'flowRateObservation',
      header: 'Flow rate observation',
      width: '180px',
    },
    {
      field: 'observations',
      header: 'Observations',
      fieldType: 'composite',
      width: '250px',
      required: true,

      compositeFields: [
        {
          field: 'observation_status',
          fieldType: 'drop-down',
          options: [
            { label: 'NIL', value: 'nil' },
            { label: 'Observation', value: 'observation' },
          ],
        },

        {
          field: 'observation_text',
          fieldType: 'text',
          placeholder: 'Enter observation',

          // show text field only when Observation selected
          showWhen: {
            field: 'observation_status',
            value: 'observation',
          },
        },
      ],
    },
    {
      field: 'remark',
      header: 'Remarks',
      fieldType: 'drop-down',
      required: true,
      options: [
        { label: 'SAT', value: 'SAT' },
        { label: 'SAT WITH OBSERVATION', value: 'SAT with observations' },
        { label: 'UNSAT', value: 'UNSAT' },
      ],
      width: '250px',
    },
  ];

  headerRows: ReusableHeaderCell[][] = [
    [
      { header: 'Ser no.', rowspan: 2 },
      { header: 'Served by ATU/ HE/ AHU/ FCU', rowspan: 2, required: true },
      { header: 'Compartment Name', rowspan: 2, required: true },
      { header: 'Type of Duct', rowspan: 2, required: true },
      { header: 'No. of Ducts', rowspan: 2, required: true },
      { header: 'Duct Area (m²)', rowspan: 2, required: true },
      { header: 'Air flow (m/s)', rowspan: 2, required: true },
      { header: 'Flow Rate at Duct (m3/ hr)', rowspan: 2, required: true },
      {
        header: 'Total Air Flow in each Compartment (m³/hr)',
        colspan: 2,
        required: true,
      },
      { header: 'Flow rate observation', rowspan: 2, required: true },
      { header: 'Observations', rowspan: 2, required: true },
      { header: 'Remarks', rowspan: 2, required: true },
      // { header: 'Action', rowspan: 2 },
    ],
    [{ header: 'Design Value' }, { header: 'Measured Value' }],
  ];

  onOpsRowCountChange(event: Event) {
    const input = event.target as HTMLInputElement;
    let value = +input.value;
    // Prevent decreasing below existing rows
    if (this.editMode && value < this.initialRowsCountOpsInEditMode) {
      value = this.initialRowsCountOpsInEditMode;
      input.value = value.toString();
    }

    this.totalRowsOps = value;
    this.updateAcCompartmentTableRows(value);
  }

  handleDialogClose() {
    console.log('Dialog closed');
    this.ductDialogOpen = false;
    this.selectedRow = null;
    this.selectedRowIndex = null;
    this.selectedTable = null;
  }

  updateAcCompartmentTableRows(count: number) {
    const currentLength = this.airFlowMeasurementOfAc.length;

    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.airFlowMeasurementOfAc.push({
          // s_no:            i + 1,
          servedByAC: null, // drop-down  → null
          compartmentName: null, // drop-down  → null
          typeOfDuct: null, // drop-down  → null
          noOfDucts: null, // number     → null
          ductArea: '', // template field
          airFlow: '', // template field
          flowRateAtDucts: '', // template field
          design_value: null, // number     → null
          measuredValue: '', // template field
          observations: null, // drop-down  → null
          remark: null, // drop-down  → null
          flowRateObservation: '',
        });
      }
    }

    if (count < currentLength) {
      this.airFlowMeasurementOfAc.splice(count);
    }
  }

  handleOpsTableChange(index: number, field: string, value: any) {
    const row = this.airFlowMeasurementOfAc[index];

    // directly update value
    row[field] = value;

    // ---------------- OPEN DUCT DIALOG ----------------

    if (field === 'noOfDucts' && Number(value) > 0 && !row?.measuredValue) {
      this.selectedRow = {
        ...row,
        table: 'ac',
      };

      this.selectedRowIndex = index;
      this.selectedTable = 'ac';

      this.ductDialogOpen = true;
    }

    // ---------------- FLOW RATE LOGIC ----------------

    if (field === 'measuredValue' || field === 'design_value') {
      this.updateObservationOptions(row, 'ac');
    }

    // ---------------- AUTO REMARK ----------------

    if (
      field === 'measuredValue' ||
      field === 'design_value' ||
      field === 'observations'
    ) {
      this.autoSetRemark(row, field);
    }
  }

  airMeasurementMachineCompColumns: ReusableTableColumnWithHeaders[] = [
    { field: 's_no', header: 'Ser no.', width: '40px', fieldType: 'serial' },
    {
      field: 'servedByBlower',
      header:
        'Served By Blower/ Fan Supply/ Fan Exhaust/ MCS/ MCE/ MCR/ MS/ ME',
      width: '200px',
      fieldType: 'drop-down',
      options: [
        { label: 'Blower', value: 'Blower' },
        { label: 'Fan Supply', value: 'Fan Supply' },
        { label: 'Fan Exhaust', value: 'Fan Exhaust' },
        { label: 'MCS', value: 'MCS' },
        { label: 'MCE', value: 'MCE' },
        { label: 'MCR', value: 'MCR' },
        { label: 'MS', value: 'MS' },
        { label: 'ME', value: 'ME' },
      ],
      required: true,
    },
    {
      field: 'compartmentName',
      header: 'Compartment Name',
      width: '220px',
      fieldType: 'drop-down',
      options: this.compartmentOptions,
      required: true,
    },
    {
      field: 'typeOfDuct',
      header: 'Type of Duct',
      template: 'ductTypeTemplate',
      width: '180px',
    },
    {
      field: 'noOfDucts',
      header: 'No. of Ducts',
      fieldType: 'number',
      width: '120px',
      disabled: (row: any) => {
        return Number(row?.measuredValue) > 0;
      },
    },
    {
      field: 'ductArea',
      header: 'Duct Area (m²)',
      template: 'ductAreaTemplate',
      width: '180px',
    },

    {
      field: 'airFlow',
      header: 'Air flow (m/s)',
      template: 'AirFlowTemplate',
      width: '180px',
    },
    {
      field: 'airFlowRate',
      header: 'Flow Rate at Duct (m3/ hr)',
      width: '180px',
      template: 'FlowRateTemplate',
    },
    {
      field: 'design_value',
      header: 'Design Value',
      width: '180px',
      fieldType: 'number',
      step: '0.01',
      required: true,
    },
    {
      field: 'measuredValue',
      header: 'Measured Value',
      template: 'MeasuredValueTemplate',
      width: '180px',
    },
    {
      field: 'flowRateObservation',
      header: 'Flow rate observation',
      width: '180px',
    },
    {
      field: 'observations',
      header: 'Observations',
      fieldType: 'composite',
      width: '250px',
      required: true,
      compositeFields: [
        {
          field: 'observation_status',
          fieldType: 'drop-down',
          options: [
            { label: 'NIL', value: 'nil' },
            { label: 'Observation', value: 'observation' },
          ],
        },

        {
          field: 'observation_text',
          fieldType: 'text',
          placeholder: 'Enter observation',

          // show text field only when Observation selected
          showWhen: {
            field: 'observation_status',
            value: 'observation',
          },
        },
      ],
    },
    {
      field: 'remark',
      header: 'Remarks',
      required: true,
      fieldType: 'drop-down',
      options: [
        { label: 'SAT', value: 'SAT' },
        { label: 'SAT WITH OBSERVATION', value: 'SAT with observations' },
        { label: 'UNSAT', value: 'UNSAT' },
      ],
      width: '250px',
    },
  ];

  headerRowsForMachineComp: ReusableHeaderCell[][] = [
    [
      { header: 'Ser no.', rowspan: 2 },
      {
        header:
          'Served By Blower/ Fan Supply/ Fan Exhaust/ MCS/ MCE/ MCR/ MS/ ME',
        rowspan: 2,
        required: true,
      },
      { header: 'Compartment Name', rowspan: 2, required: true },
      { header: 'Type of Duct', rowspan: 2, required: true },
      { header: 'No. of Ducts', rowspan: 2, required: true },
      { header: 'Duct Area (m²)', rowspan: 2, required: true },
      { header: 'Air flow (m/s)', rowspan: 2, required: true },
      { header: 'Flow Rate at Duct (m3/ hr)', rowspan: 2, required: true },
      {
        header: 'Total Air Flow in each Compartment (m³/hr)',
        colspan: 2,
        required: true,
      },
      { header: 'Flow rate observation', rowspan: 2, required: true },
      { header: 'Observations', rowspan: 2, required: true },
      { header: 'Remarks', rowspan: 2, required: true },
      // { header: 'Action', rowspan: 2 },
    ],
    [{ header: 'Design Value' }, { header: 'Measured Value' }],
  ];

  airMeasurementMachineCompRowCountChange(event: Event) {
    const input = event.target as HTMLInputElement;
    let value = +input.value;

    // Prevent decreasing below existing rows
    if (this.editMode && value < this.initialRowsCountMachineCompInEditMode) {
      value = this.initialRowsCountMachineCompInEditMode;
      input.value = value.toString();
    }

    this.totalRowsMachineComp = value;
    this.updateAirMeasurementMachineCompTableRows(value);
  }

  // ------------------------ Updating action column visibility of AC COMPARTMENT

  updateAirMeasurementMachineCompTableRows(count: number) {
    const currentLength = this.airFlowMeasurementOfMachineryComp.length;

    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.airFlowMeasurementOfMachineryComp.push({
          // s_no:            i + 1,
          servedByBlower: null, // drop-down  → null
          compartmentName: null, // drop-down  → null
          typeOfDuct: null,
          noOfDucts: null, // number     → null
          ductArea: '', // template field
          airFlow: '', // template field
          airFlowRate: '', // template field  ← note: col.field is 'airFlowRate' here
          design_value: null, // number     → null
          measuredValue: '', // template field
          flowRateObservation: '',
          observations: null, // drop-down  → null
          remark: null, // drop-down  → null
        });
      }
    }

    if (count < currentLength) {
      this.airFlowMeasurementOfMachineryComp.splice(count);
    }
  }

  handleAirMeasurementMachineCompTableChange(
    index: number,
    field: string,
    value: string,
  ) {
    this.airFlowMeasurementOfMachineryComp[index][field] = value;

    const row = this.airFlowMeasurementOfMachineryComp[index];

    // ---------------- OPEN DUCT DIALOG ----------------

    if (field === 'noOfDucts' && Number(value) > 0 && !row?.measuredValue) {
      this.selectedRow = {
        ...row,
        table: 'machinery',
      };

      this.selectedRowIndex = index;
      this.selectedTable = 'machinery';

      this.ductDialogOpen = true;
    }

    // update dropdown dynamically
    if (field === 'measuredValue' || field === 'design_value') {
      this.updateObservationOptions(row, 'machinery');
    }

    // auto remarks
    if (
      field === 'measuredValue' ||
      field === 'design_value' ||
      field === 'observations'
    ) {
      this.autoSetRemark(row);
    }

    this.airFlowMeasurementOfMachineryComp = [
      ...this.airFlowMeasurementOfMachineryComp,
    ];
  }

  private updateObservationOptions(row: any, table: 'ac' | 'machinery'): void {
    const measured =
      row.measuredValue !== '' &&
      row.measuredValue !== null &&
      row.measuredValue !== undefined &&
      !isNaN(parseFloat(row.measuredValue))
        ? parseFloat(row.measuredValue)
        : null;

    const design =
      row.design_value !== '' &&
      row.design_value !== null &&
      row.design_value !== undefined &&
      !isNaN(parseFloat(row.design_value))
        ? parseFloat(row.design_value)
        : null;

    const observationColumn =
      table === 'ac'
        ? this.OPSColumns.find((c) => c.field === 'observations')
        : this.airMeasurementMachineCompColumns.find(
            (c) => c.field === 'observations',
          );

    if (!observationColumn) return;

    let newOptions: any[] = [];

    // measured >= design
    if (measured !== null && design !== null && measured >= design) {
      newOptions = [...this.positiveObservationOptions];
    }

    // measured < design
    else if (measured !== null && design !== null && measured < design) {
      newOptions = [...this.negativeObservationOptions];
    }

    // ONLY update when changed
    const isDifferent =
      JSON.stringify(observationColumn.options) !== JSON.stringify(newOptions);

    if (isDifferent) {
      observationColumn.options = newOptions;

      if (table === 'ac') {
        this.OPSColumns = [...this.OPSColumns];
      } else {
        this.airMeasurementMachineCompColumns = [
          ...this.airMeasurementMachineCompColumns,
        ];
      }

      this.cdr.detectChanges();
    }
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }
  /* ----------------------------- EDIT MODE ----------------------------------- */

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
      console.log('trialRow:', trialRow);
      // this.cdr.detectChanges();
      // this.getEditDataByRowId(response, trialRow);
      // ── Build equipment tab list ───────────────────────────────
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
      // ── Resolve json_data for the active equipment ─────────────
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

      console.log('Final HVAC payload sent to fillData:', equipmentPayload);
      this.fillData(equipmentPayload);
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Trial prefill failed (load trial proforma DA)', e);
    }
  }

  // added from here
  /** Called when user switches equipment tab */
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
      console.error('Failed to load HVAC data for selected equipment', error);
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    // Already flat — known top-level keys present
    const isFlat =
      'place_of_conduct_trail' in jsonData ||
      'ship_or_submarine' in jsonData ||
      'ac_compartments' in jsonData;
    if (isFlat) return jsonData;

    // Wrapped — nested under equipment name
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
  /** Reset AC/machinery tables + form fields when switching tabs */
  // private resetFormData(): void {
  //   const ship = this.form.get('ship')?.value;

  //   this.totalRowsOps = 1;
  //   // this.updateAcCompartmentTableRows(1);

  //   this.totalRowsMachineComp = 1;
  //   this.updateAirMeasurementMachineCompTableRows(1);

  //   this.form.reset({}, { emitEvent: false });
  //   this.form.patchValue({ ship }, { emitEvent: false });
  // }
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    // Clear first, then rebuild — otherwise splice() just truncates
    // the array and leaves the previous equipment's row-0 data behind.
    this.airFlowMeasurementOfAc = [];
    this.totalRowsOps = 1;
    this.initialRowsCountOpsInEditMode = 1;
    this.updateAcCompartmentTableRows(1);

    this.airFlowMeasurementOfMachineryComp = [];
    this.totalRowsMachineComp = 1;
    this.initialRowsCountMachineCompInEditMode = 1;
    this.updateAirMeasurementMachineCompTableRows(1);

    this.form.reset({}, { emitEvent: false });
    this.form.patchValue({ ship }, { emitEvent: false });
  }

  /**
   * Hydrates the whole form (header + both tables) from the
   * equipment-specific saved/draft payload.
   */
  fillData(payload: any): void {
    if (!payload) return;

    // ── Header fields ────────────────────────────────────────────
    this.form.patchValue({
      vesselType: payload.vesselType ?? '',
      ship_or_submarine: payload.ship_or_submarine ?? '',
      date_of_conduct_trail: payload.date_of_conduct_trail ?? '',
      place_of_conduct_trail: payload.place_of_conduct_trail ?? '',
      occasion_of_conduct_trail: payload.occasion_of_conduct_trail ?? '',
      document_no: payload.document_no ?? '',
      authority: payload.authority ?? '',
      authority_date: payload.authority_date ?? '',
      authority_doc: payload.authority_doc ?? '',
    });

    // ── AC / Machinery compartment rows ─────────────────────────
    const allRows = Array.isArray(payload.ac_compartments)
      ? payload.ac_compartments
      : [];

    const acRows = allRows
      .filter((r: any) => r.section === 'AC_COMPARTMENTS')
      .map((r: any) => this.mapSavedRowToTableRow(r));

    const machineryRows = allRows
      .filter((r: any) => r.section === 'MACHINERY_COMPARTMENTS')
      .map((r: any) => this.mapSavedRowToTableRow(r));

    // Always reassign — even when empty — so a table never keeps
    // rows carried over from a previously selected equipment.
    this.airFlowMeasurementOfAc = acRows.length ? acRows : [this.emptyAcRow()];
    this.totalRowsOps = this.airFlowMeasurementOfAc.length;
    this.initialRowsCountOpsInEditMode = this.airFlowMeasurementOfAc.length;

    this.airFlowMeasurementOfMachineryComp = machineryRows.length
      ? machineryRows
      : [this.emptyMachineryRow()];
    this.totalRowsMachineComp = this.airFlowMeasurementOfMachineryComp.length;
    this.initialRowsCountMachineCompInEditMode =
      this.airFlowMeasurementOfMachineryComp.length;
  }

  private emptyAcRow(): any {
    return {
      servedByAC: null,
      compartmentName: null,
      typeOfDuct: null,
      noOfDucts: null,
      ductArea: '',
      airFlow: '',
      flowRateAtDucts: '',
      design_value: null,
      measuredValue: '',
      observations: null,
      remark: null,
      flowRateObservation: '',
    };
  }

  private emptyMachineryRow(): any {
    return {
      servedByBlower: null,
      compartmentName: null,
      typeOfDuct: null,
      noOfDucts: null,
      ductArea: '',
      airFlow: '',
      airFlowRate: '',
      design_value: null,
      measuredValue: '',
      flowRateObservation: '',
      observations: null,
      remark: null,
    };
  }

  /** Maps a saved backend row shape back into the table's UI row shape */
  private mapSavedRowToTableRow(item: any): any {
    const calCulatedDetails = (item?.trial_rows || []).map((d: any) => ({
      ductArea: d.duct_area,
      airFlow: d.air_flow,
      flowRate: d.flow_rate_at_duct,
      duct_no: d.duct_no,
      id: d.id,
    }));

    return {
      id: item?.id ?? null,
      servedByAC: item?.served_by_ac ?? null,
      servedByBlower: item?.served_by_ac ?? null,
      compartmentName: item?.compartment_name_id ?? null,
      noOfDucts: item?.no_of_ducts ?? null,
      design_value: item?.design_value ?? null,
      measuredValue: item?.measured_value ?? '',
      remark: item?.remark ?? null,
      observations: item?.observation ?? null,
      s_no: item?.sr_no,
      calCulatedDetails,
      typeOfDuct: calCulatedDetails.map((d: any) => d.duct_no).filter(Boolean),
      ductArea: calCulatedDetails
        .map((d: any, i: number) => `${i + 1}.) ${d.ductArea}`)
        .join('\n'),
      airFlow: calCulatedDetails
        .map((d: any, i: number) => `${i + 1}.) ${d.airFlow}`)
        .join('\n'),
      flowRateAtDucts: calCulatedDetails
        .map((d: any, i: number) => `${i + 1}.) ${d.flowRate}`)
        .join('\n'),
      airFlowRate: calCulatedDetails
        .map((d: any, i: number) => `${i + 1}.) ${d.flowRate}`)
        .join('\n'),
      flowRateObservation: '',
    };
  }
  // till here

  getEditDataByRowId(response: any, trialRow?: any) {
    this.editDataDetails = response.data;
    this.totalRowsOps = this.initialRowsCountOpsInEditMode;
    this.totalRowsMachineComp = this.initialRowsCountMachineCompInEditMode;
    // this.form.patchValue({});
    //   if (trialRow) {
    //     console.log("hitting")
    //   this.form.patchValue({
    //     ship: trialRow.ship_name

    //   });
    // }
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }
  // -------------------------------- HELPER FUNCTION TO CHECK WHETHER THE ROW DATA ARE EMPTY OR NOT ---------------------------------
  isAcCompartmentRowsEmpty(item: any): boolean {
    return !(
      item?.servedByAC ||
      item?.compartmentName ||
      item?.noOfDucts ||
      item?.design_value ||
      item?.measuredValue ||
      item?.remark ||
      item?.observations
    );
  }
  isMachineryCompRowEmpty(item: any): boolean {
    return !(
      item?.servedByBlower ||
      item?.compartmentName ||
      item?.noOfDucts ||
      item?.design_value ||
      item?.measuredValue ||
      item?.remark ||
      item?.observations
    );
  }
  /* ------------------------------- SAVE --------------------------------------- */

  buildPayload() {
    const formatAcCompartmentData = this.airFlowMeasurementOfAc
      .filter((item) => !this.isAcCompartmentRowsEmpty(item))
      .map((item) => ({
        id: item?.id || null,
        section: 'AC_COMPARTMENTS',
        served_by_ac: item?.servedByAC,
        compartment_name_id: item?.compartmentName,
        no_of_ducts: item?.noOfDucts,
        design_value: item?.design_value,
        measured_value: item?.measuredValue,
        remark: item?.remark,
        observation: item?.observations,
        sr_no: item?.s_no,

        trial_rows: (item?.calCulatedDetails || []).map((duct: any) => ({
          id: duct?.id || null,
          duct_no: duct?.duct_no || '',
          duct_area: duct?.ductArea,
          air_flow: duct?.airFlow,
          flow_rate_at_duct: duct?.flowRate,
          duct_type: duct?.ductType,
        })),
      }));

    const formatMachineryCompData = this.airFlowMeasurementOfMachineryComp
      .filter((item) => !this.isMachineryCompRowEmpty(item))
      .map((item) => ({
        id: item?.id || null,
        section: 'MACHINERY_COMPARTMENTS',
        served_by_ac: item?.servedByBlower,
        compartment_name_id: item?.compartmentName,
        no_of_ducts: item?.noOfDucts,
        design_value: item?.design_value,
        measured_value: item?.measuredValue,
        remark: item?.remark,
        observation: item?.observations,
        sr_no: item?.s_no,

        trial_rows: (item?.calCulatedDetails || []).map((duct: any) => ({
          id: duct?.id || null,
          duct_no: duct?.duct_no || '',
          duct_area: duct?.ductArea,
          air_flow: duct?.airFlow,
          flow_rate_at_duct: duct?.flowRate,
          duct_type: duct?.ductType,
        })),
      }));
    const formDataValues = this.form.getRawValue();

    const payload: any = {
      ...formDataValues,
      ac_compartments: [...formatAcCompartmentData, ...formatMachineryCompData],
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
