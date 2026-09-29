import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
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
import { SelectComponent } from '../../../../ui/select.component';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { ReusableTableColumn } from '../../../../ui/reusable-input-table/reusable-input-table.component';
import { ReusableHeaderCell } from '../../../../ui/form-input-table-with-headers/form-input-table-with-headers.component';
import { CalenderComponent } from '../../../../ui/calender.component';

@Component({
  selector: 'iccp-system-check-add',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    SelectComponent,
    CalenderComponent,
  ],
  templateUrl: './iccp-system-check-add.component.html',
})
export class IccpSystemcheckAdd implements OnInit {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;

  readonly draftIcon = 'save';
  readonly saveIcon = 'save-all';
  readonly restartIcon = 'rotate-ccw';

  form!: FormGroup;
  loading = false;

  classOfShipOptions: any[] = [];

  occasionOptions = [
    { label: 'OHMI', value: 'OHMI' },
    { label: 'Surprise Checks', value: 'Surprise Checks' },
    { label: 'Refit', value: 'Refit' },
    {
      label: 'Any other occasion (details–alphanumeric)',
      value: 'Any other occasion (details–alphanumeric)',
    },
  ];
  // Port/ Stbd/ Centre

  ReOptions = [
    { label: 'Port', value: 'Port' },
    { label: 'Stbd', value: 'Stbd' },
    { label: 'Centre', value: 'Centre' },
  ];

  openClosedOptions = [
    { label: 'Closed', value: 'Closed' },
    { label: 'Open', value: 'Open' },
  ];

  satUnsatOption = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  refitOptions = [
    { label: 'Ops-Docking', value: 'Ops-Docking' },
    { label: 'GRDD', value: 'GRDD' },
    { label: 'E-AMP', value: 'E-AMP' },
    { label: 'SR', value: 'SR' },
    { label: 'NR', value: 'NR' },
    { label: 'MR', value: 'MR' },
    { label: 'ERDD', value: 'ERDD' },
    { label: 'Others', value: 'Others' },
  ];

  locationOptions: any[] = [];

  totalRowsAmbient = 1;
  totalRowsAcPlant = 1;
  totalRowsChilledWater = 1;
  totalRowsRecordValueInMachinery = 1;

  // VENTILATION TRIALS PHASE II FUNCTIONAL CHECKS (AT SEA)
  // AC Plant Data (SS-E to assist HITUs in record of these parameters. D-Design, A-Actual)
  // Chilled Water Measurements at ATU/ HEs
  // Record of Values in Machinery/ General Compartments
  airFlowMeasurementOfAc: any[] = [];
  airFlowMeasurementOfMachineryComp: any[] = [];
  // ------------------------------------ TABLES DATA ARRAYS--------------------------------
  ambientConditionsData: any[] = [];
  acPlantData: any[] = [];
  childWaterMgmtData: any[] = [];
  recordOfValuesInMachineryData: any[] = [];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private toastService: ToastService,
  ) { }

  ngOnInit(): void {
    this.buildForm();
    this.loadClasses();
    this.loadLocation();
    // ------------------------------ UPDATING ALL THE TABLES WITH THE INITIAL NO OF ROWS VALUE
    this.updaterecordOfValuesInMachineryTableRows(
      this.totalRowsRecordValueInMachinery,
    );
    this.updatechildWaterMgmtTableRows(this.totalRowsChilledWater);
    this.updateAcPlantDataTableRows(this.totalRowsAcPlant);
    this.updateAmbientConditionsTableRows(this.totalRowsAmbient);

    if (this.rowId) {
      this.editMode = true;
      this.getEditDataByRowId(this.rowId);
    }
  }

  loadClasses() {
    this.apiService.getDropdownData('master/ship-classes/', { labelKey: 'name', valueKey: 'id' }).subscribe((res: any) => {
      this.classOfShipOptions = res || [];
    });
  }
  loadLocation() {
    this.apiService.getDropdownData('master/locations/', { labelKey: 'name', valueKey: 'id' }).subscribe((res: any) => {
      this.locationOptions = res || [];
    });
  }

  /* -------------------------------- FORM SETUP ------------------------------- */
  buildForm() {
    this.form = this.fb.group({
      classOfShip: ['', Validators.required],
      ship: ['', Validators.required],
      make: ['', Validators.required],
      date_of_inspection: ['', Validators.required],
      date_of_conduct_trail: ['', Validators.required],
      place_of_conduct_trail: ['', Validators.required],

      // RE _ LOCATION
      re1_location: [''],
      re2_location: [''],
      re3_location: [''],
      re4_location: [''],
      re5_location: [''],
      re6_location: [''],
      re7_location: [''],
      re8_location: [''],

      // RE_STN
      re1_stn: [''],
      re2_stn: [''],
      re3_stn: [''],
      re4_stn: [''],
      re5_stn: [''],
      re6_stn: [''],
      re7_stn: [''],
      re8_stn: [''],

      // ANODE _ LOCATION
      A1_location: [''],
      A2_location: [''],
      A3_location: [''],
      A4_location: [''],
      A5_location: [''],
      A6_location: [''],
      A7_location: [''],
      A8_location: [''],

      // ANODE_STN
      A1_stn: [''],
      A2_stn: [''],
      A3_stn: [''],
      A4_stn: [''],
      A5_stn: [''],
      A6_stn: [''],
      A7_stn: [''],
      A8_stn: [''],

      // CHECK_6
      check_6_A1: [''],
      check_6_A2: [''],
      check_6_A3: [''],
      check_6_A4: [''],
      check_6_A5: [''],
      check_6_A6: [''],
      check_6_A7: [''],
      check_6_A8: [''],

      // CHECK_9
      check_9_A1: [''],
      check_9_A2: [''],
      check_9_A3: [''],
      check_9_A4: [''],
      check_9_A5: [''],
      check_9_A6: [''],
      check_9_A7: [''],
      check_9_A8: [''],
    });
  }

  //  --------------------------------------- FOR BUILDING TABLES DATA FOR BUILD FORM --------------------------
  get opsTable(): FormArray {
    return this.form.get('opsTable') as FormArray;
  }

  get refitTable(): FormArray {
    return this.form.get('refitTable') as FormArray;
  }

  createOpsRow(): FormGroup {
    return this.fb.group({
      lightship_displacement: [''],
      ref_load_condition: [''],
      disp_c: [''],
      disp_d: [''],
      net_diff: [''],
      corrected_disp: [''],
      net_increase: [''],
      percentage_increase: [''],
      net_weight_add: [''],
      net_kg_add: [''],
    });
  }

  createRefitRow(): FormGroup {
    return this.fb.group({
      lightship_displacement: [''],
      wght_change_prior_refit: [''],
      net_wght_change_refit: [''],
      net_kg: [''],
    });
  }
  // ---------------------------------------------------------------------------- TABLE CONTENT CONFIGURATION -------------------------------------------------

  // TABLE ONE CONFIGUARTION ------------------------------------------------------------------------------------------------------------------------
  ambientConditionsColumns: ReusableTableColumn[] = [
    { field: 'id', header: 'Ser', width: '20px' },
    {
      field: 'regime',
      header: 'Regime',
      width: '150px',
      fieldType: 'drop-down',
      options: [
        { label: 'Crusing', value: 'Crusing' },
        { label: 'Combat', value: 'Combat' },
        { label: 'Action Station', value: 'Action Station' },
        { label: 'Others', value: 'Others' },
      ],
    },
    {
      field: 'swp_0900hrs',
      header: '09:00 HRS',
      fieldType: 'number',
    },
    {
      field: 'swp_1200hrs',
      header: '12:00 HRS',
      fieldType: 'number',
    },
    {
      field: 'at_0900hrs',
      header: '09:00 HRS',
      fieldType: 'number',
    },

    {
      field: 'at_1200hrs',
      header: '12:00 HRS',
      fieldType: 'number',
    },
    {
      field: 'ar_0900hrs',
      header: '09:00 HRS',
      fieldType: 'number',
    },

    {
      field: 'ar_1200hrs',
      header: '12:00 HRS',
      fieldType: 'number',
    },
    {
      field: 'remark',
      header: 'Remarks',
      width: '150px',
      fieldType: 'drop-down',
      options: [
        { label: 'Sat', value: 'SAT' },
        { label: 'Sat with observations', value: 'SAT with observations' },
        { label: 'UnSat', value: 'UNSAT' },
      ], // Will be populated from API
    },
  ];
  ambientConditionsHeaderRows: ReusableHeaderCell[][] = [
    [
      { header: 'Ser', rowspan: 2 },
      { header: 'Regime', rowspan: 2 },
      { header: 'Sea Water Temperature(°C)', colspan: 2 },
      { header: 'Atmosphere Temperature (°C)', colspan: 2 },
      { header: 'Atmospheric Relativity (%)', colspan: 2 },
      { header: 'Remarks', rowspan: 2 },
    ],
    [
      {
        header: '09:00 HRS',
      },
      {
        header: '12:00 HRS',
      },
      {
        header: '09:00 HRS',
      },
      {
        header: '12:00 HRS',
      },
      {
        header: '09:00 HRS',
      },
      {
        header: '12:00 HRS',
      },
    ],
  ];

  ambientConditionsRowCountChange(event: Event) {
    const value = +(event.target as HTMLInputElement).value;
    this.totalRowsAmbient = value;
    this.updateAmbientConditionsTableRows(value);
  }

  updateAmbientConditionsTableRows(count: number) {
    const currentLength = this.ambientConditionsData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.ambientConditionsData.push({
          id: i + 1,
          servedBy: '',
          compartement_name: '',
          no_of_ducts: '',
          duct_area: '',
          air_flow: '',
          flow_rate: '',
          design_value: '',
          measured_value: '',
          observations: '',
          remark: '',
        });
      }
    }

    if (count < currentLength) {
      this.ambientConditionsData.splice(count);
    }
  }
  handleAmbientConditionsTableChange(
    index: number,
    field: string,
    value: string,
  ) {
    this.ambientConditionsData[index][field] = value;
  }

  // TABLE TWO CONFIGUARTION ------------------------------------------------------------------------------------------------------------------------
  acPlantDataColumns: ReusableTableColumn[] = [
    { field: 'id', header: 'Ser', width: '20px' },
    {
      field: 'plant_no',
      header: 'AC Plant No.',
    },
    //     "ac_plants:[{
    // "section": "AC_PLANT_PERFORMANCE",
    //     "plant_no": "AC-01",
    // "eva_temp_in": "12",
    // "eva_temp_out": "7",
    // "tev_temp_in": "5",
    // "tev_temp_out": "10",
    // "cond_temp_in": "32",
    // "cond_temp_out": "38",
    //     "remark": "Working normal",
    //     "sr_no": 1
    // }
    {
      field: 'Design',
      header: '09:00 HRS',
      fieldType: 'number',
    },
    {
      field: 'swp_1200hrs',
      header: '12:00 HRS',
      fieldType: 'number',
    },
    {
      field: 'at_0900hrs',
      header: '09:00 HRS',
      fieldType: 'number',
    },

    {
      field: 'at_1200hrs',
      header: '12:00 HRS',
      fieldType: 'number',
    },
    {
      field: 'ar_0900hrs',
      header: '09:00 HRS',
      fieldType: 'number',
    },

    {
      field: 'ar_1200hrs',
      header: '12:00 HRS',
      fieldType: 'number',
    },
    {
      field: 'remark',
      header: 'Remarks',
      width: '150px',
      fieldType: 'drop-down',
      options: [
        { label: 'Sat', value: 'SAT' },
        { label: 'Sat with observations', value: 'SAT with observations' },
        { label: 'UnSat', value: 'UNSAT' },
      ], // Will be populated from API
    },
  ];
  acPlantDataHeaderRows: ReusableHeaderCell[][] = [
    [
      { header: 'Ser', rowspan: 2 },
      { header: 'Regime', rowspan: 2 },
      { header: 'Sea Water Temperature(°C)', colspan: 2 },
      { header: 'Atmosphere Temperature (°C)', colspan: 2 },
      { header: 'Atmospheric Relativity (%)', colspan: 2 },
      { header: 'Remarks', rowspan: 2 },
    ],
    [
      {
        header: '09:00 HRS',
      },
      {
        header: '12:00 HRS',
      },
      {
        header: '09:00 HRS',
      },
      {
        header: '12:00 HRS',
      },
      {
        header: '09:00 HRS',
      },
      {
        header: '12:00 HRS',
      },
    ],
  ];

  acPlantDataCountChange(event: Event) {
    const value = +(event.target as HTMLInputElement).value;
    this.totalRowsAcPlant = value;
    this.updateAcPlantDataTableRows(value);
  }

  updateAcPlantDataTableRows(count: number) {
    const currentLength = this.acPlantData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.acPlantData.push({
          id: i + 1,
          servedBy: '',
          compartement_name: '',
          no_of_ducts: '',
          duct_area: '',
          air_flow: '',
          flow_rate: '',
          design_value: '',
          measured_value: '',
          observations: '',
          remark: '',
        });
      }
    }

    if (count < currentLength) {
      this.acPlantData.splice(count);
    }
  }
  handleAcPlantDataTableChange(index: number, field: string, value: string) {
    this.acPlantData[index][field] = value;
  }

  // TABLE THREE CONFIGUARTION ------------------------------------------------------------------------------------------------------------------------
  childWaterMgmtColumns: ReusableTableColumn[] = [
    { field: 'id', header: 'Ser', width: '20px' },
    {
      field: 'servedByBlower',
      header:
        'Served By Blower/ Fan Supply/ Fan Exhaust/ MCS/ MCE/ MCR/ MS/ ME',
      width: '150px',
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
    },
    {
      field: 'compartmentName',
      header: 'Compartment Name',
      template: 'inputTpl',
    },
    {
      field: 'noOfDucts',
      header: 'No of Ducts',
      template: 'inputTpl',
    },
    {
      field: 'ductArea',
      header: 'Duct Area (m²)',
      template: 'inputTpl',
    },

    {
      field: 'airFlow',
      header: 'Air flow (m/s)',
      template: 'inputTpl',
    },
    {
      field: 'airFlowRate',
      header: 'Flow Rate at Duct (m3/ hr)',
      template: 'inputTpl',
    },
    {
      field: 'design_value',
      header: 'Design Value',
      template: 'inputTpl',
    },
    {
      field: 'measured_value',
      header: 'Measured Value',
      template: 'inputTpl',
    },
    {
      field: 'observations',
      header: 'Observations',
      template: 'inputTpl',
    },
    {
      field: 'remark',
      header: 'Remarks',
      width: '150px',
      fieldType: 'drop-down',
      options: [
        { label: 'Sat', value: 'SAT' },
        { label: 'Sat with observations', value: 'SAT with observations' },
        { label: 'UnSat', value: 'UNSAT' },
      ],
    },
  ];

  childWaterMgmtheaderRows: ReusableHeaderCell[][] = [
    [
      { header: 'Ser', rowspan: 2 },
      {
        header:
          'Served By Blower/ Fan Supply/ Fan Exhaust/ MCS/ MCE/ MCR/ MS/ ME',
        rowspan: 2,
      },
      { header: 'Compartment Name', rowspan: 2 },
      { header: 'No of Ducts', rowspan: 2 },
      { header: 'Duct Area (m²)', rowspan: 2 },
      { header: 'Air flow (m/s)', rowspan: 2 },
      { header: 'Flow Rate at Duct (m3/ hr)', rowspan: 2 },
      { header: 'Total Air Flow in each Compartment (m³/hr)', colspan: 2 },
      { header: 'Observations', rowspan: 2 },
      { header: 'Remarks', rowspan: 2 },
    ],
    [{ header: 'Design Value' }, { header: 'Measured Value' }],
  ];

  childWaterMgmtCountChange(event: Event) {
    const value = +(event.target as HTMLInputElement).value;
    this.totalRowsChilledWater = value;
    this.updatechildWaterMgmtTableRows(value);
  }

  updatechildWaterMgmtTableRows(count: number) {
    const currentLength = this.childWaterMgmtData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.childWaterMgmtData.push({
          id: i + 1,
          servedBy: '',
          compartement_name: '',
          no_of_ducts: '',
          duct_area: '',
          air_flow: '',
          flow_rate: '',
          design_value: '',
          measured_value: '',
          observations: '',
          remark: '',
        });
      }
    }

    if (count < currentLength) {
      this.childWaterMgmtData.splice(count);
    }
  }
  handlechildWaterMgmtTableChange(index: number, field: string, value: string) {
    this.childWaterMgmtData[index][field] = value;
  }

  // TABLE FOUR CONFIGUARTION ------------------------------------------------------------------------------------------------------------------------
  // recordOfValuesInMachineryData: any[] = [];

  //   "refrigerated_vehicle_machinery":[
  // {
  //     "section": "REFRIGERATED_VEHICLE_MACHINERY",
  //     "compartment_name": "Machinery Room 1",
  //     "occupancy_d": "2",
  //     "occupancy_a": "2",
  //     "fed_by_atu": "ATU-03",
  //     "fed_by_supply": "SUP-01",
  //     "drybulb_d": "25",
  //     "drybulb_a": "23",
  //     "wetbulb_d": "19",
  //     "wetbulb_a": "18",
  //     "rh_designed": "55",
  //     "rh_measured": "53",
  //     "remark": "All parameters within limit",
  //     "sr_no": 1
  // }

  recordOfValuesInMachineryColumns: ReusableTableColumn[] = [
    { field: 'id', header: 'Ser', width: '20px' },
    {
      field: 'compartment_name',
      header: 'Compt Name',
    },
    {
      field: 'occupancy_d',
      header: 'Design',
    },
    {
      field: 'occupancy_a',
      header: 'Actual',
    },
    {
      field: 'ductArea',
      header: 'Fed by ATU/ HE',
    },

    {
      field: 'airFlow',
      header: 'Fed by Supply/ Exhaust',
    },
    {
      field: 'airFlowRate',
      header: 'Flow Rate at Duct (m3/ hr)',
    },
    {
      field: 'design_value',
      header: 'Design Value',
    },
    {
      field: 'measured_value',
      header: 'Measured Value',
    },
    {
      field: 'observations',
      header: 'Observations',
    },
    {
      field: 'remark',
      header: 'Remarks',
      width: '150px',
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
      { header: 'Ser', rowspan: 2 },
      {
        header:
          'Served By Blower/ Fan Supply/ Fan Exhaust/ MCS/ MCE/ MCR/ MS/ ME',
        rowspan: 2,
      },
      { header: 'Compartment Name', rowspan: 2 },
      { header: 'No of Ducts', rowspan: 2 },
      { header: 'Duct Area (m²)', rowspan: 2 },
      { header: 'Air flow (m/s)', rowspan: 2 },
      { header: 'Flow Rate at Duct (m3/ hr)', rowspan: 2 },
      { header: 'Total Air Flow in each Compartment (m³/hr)', colspan: 2 },
      { header: 'Observations', rowspan: 2 },
      { header: 'Remarks', rowspan: 2 },
    ],
    [{ header: 'Design Value' }, { header: 'Measured Value' }],
  ];

  recordOfValuesInMachineryCountChange(event: Event) {
    const value = +(event.target as HTMLInputElement).value;
    this.totalRowsRecordValueInMachinery = value;
    this.updaterecordOfValuesInMachineryTableRows(value);
  }

  updaterecordOfValuesInMachineryTableRows(count: number) {
    const currentLength = this.recordOfValuesInMachineryData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.recordOfValuesInMachineryData.push({
          id: i + 1,
          servedBy: '',
          compartement_name: '',
          no_of_ducts: '',
          duct_area: '',
          air_flow: '',
          flow_rate: '',
          design_value: '',
          measured_value: '',
          observations: '',
          remark: '',
        });
      }
    }

    if (count < currentLength) {
      this.recordOfValuesInMachineryData.splice(count);
    }
  }
  handlerecordOfValuesInMachineryTableChange(
    index: number,
    field: string,
    value: string,
  ) {
    this.recordOfValuesInMachineryData[index][field] = value;
  }

  /* ----------------------------- EDIT MODE ----------------------------------- */

  getEditDataByRowId(rowId: string) {
    this.apiService.get(`hitumodule/iccp-system-check/${rowId}`).subscribe({
      next: (res: any) => {
        if (res?.data) {
          this.editDataDetails = res.data;
          this.form.patchValue({});
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

  async handleSave(draftStatus: 'draft' | 'save') {
    this.loading = true;

    // const payload = this.form.value;
    const value = this.form.value;

    const payload: any = {
      // ─── BASIC INFO ───────────────────────────────────────────
      ship: value.ship,
      class_of_ship: value.classOfShip,
      make: value.make,
      date_of_inspection: value.date_of_inspection,
      occasion_of_inspection: value.place_of_conduct_trail,   // ⚠️ mapped from template
      berthed_at: value.berthed_at ?? null,                   // ⚠️ add to buildForm()
      docking_date: value.date_of_conduct_trail,
      type_of_refit: value.occasion_of_conduct_trail,
      ship_alongside: value.ship_alongside ?? null,           // ⚠️ add to buildForm()
      type_of_anodes: value.type_of_anodes ?? null,           // ⚠️ add to buildForm()
      no_of_anodes: value.no_of_anodes ?? null,               // ⚠️ add to buildForm()
      type_of_res: value.type_of_res ?? null,                 // ⚠️ add to buildForm()
      no_of_res: value.no_of_res ?? null,                     // ⚠️ add to buildForm()
      portable_re: value.portable_re ?? null,                 // ⚠️ add to buildForm()
      date_of_last_diving_checks: value.date_of_last_diving_checks ?? null,       // ⚠️ add to buildForm()
      date_of_last_cleaning_iccp: value.date_of_last_cleaning_iccp ?? null,       // ⚠️ add to buildForm()
      calibration_details_portable_re: value.calibration_details_portable_re ?? null, // ⚠️ add to buildForm()

      draft_status: draftStatus,

      // ─── PRESET POTENTIAL VALUE - RE TABLE ───────────────────
      re_preset: {
        re1: { location: value.re1_location, fr_stn: value.re1_stn },
        re2: { location: value.re2_location, fr_stn: value.re2_stn },
        re3: { location: value.re3_location, fr_stn: value.re3_stn },
        re4: { location: value.re4_location, fr_stn: value.re4_stn },
        re5: { location: value.re5_location, fr_stn: value.re5_stn },
        re6: { location: value.re6_location, fr_stn: value.re6_stn },
        re7: { location: value.re7_location, fr_stn: value.re7_stn },
        re8: { location: value.re8_location, fr_stn: value.re8_stn },
      },

      // ─── PRESET POTENTIAL VALUE - ANODE TABLE ────────────────
      anode_preset: {
        A1: { location: value.A1_location, fr_stn: value.A1_stn },
        A2: { location: value.A2_location, fr_stn: value.A2_stn },
        A3: { location: value.A3_location, fr_stn: value.A3_stn },
        A4: { location: value.A4_location, fr_stn: value.A4_stn },
        A5: { location: value.A5_location, fr_stn: value.A5_stn },
        A6: { location: value.A6_location, fr_stn: value.A6_stn },
        A7: { location: value.A7_location, fr_stn: value.A7_stn },
        A8: { location: value.A8_location, fr_stn: value.A8_stn },
      },

      // ─── CHECK 1 - Hull potential with Portable RE (ACU OFF) ─
      check_1: {
        frame_stn: value.check_1_frame_stn ?? null,       // ⚠️ add to buildForm()
        port_mv: value.check_1_port_mv ?? null,           // ⚠️ add to buildForm()
        stbd_mv: value.check_1_stbd_mv ?? null,           // ⚠️ add to buildForm()
        remarks: value.check_1_remarks ?? null,           // ⚠️ add to buildForm()
      },

      // ─── CHECK 2 - Hull potential on RE terminals (ACU OFF) ──
      check_2: {
        re1: value.check_2_re1 ?? null,    // ⚠️ add to buildForm()
        re2: value.check_2_re2 ?? null,
        re3: value.check_2_re3 ?? null,
        re4: value.check_2_re4 ?? null,
        re5: value.check_2_re5 ?? null,
        re6: value.check_2_re6 ?? null,
        re7: value.check_2_re7 ?? null,
        re8: value.check_2_re8 ?? null,
      },

      // ─── CHECK 3 - Hull potential with Portable RE (ACU Auto) ─
      check_3: {
        frame_stn: value.check_3_frame_stn ?? null,       // ⚠️ add to buildForm()
        port_mv: value.check_3_port_mv ?? null,           // ⚠️ add to buildForm()
        stbd_mv: value.check_3_stbd_mv ?? null,           // ⚠️ add to buildForm()
        remarks: value.check_3_remarks ?? null,           // ⚠️ add to buildForm()
      },

      // ─── CHECK 4a - Terminal Reading (Auto mode) ─────────────
      check_4a: {
        hull_potential_mv: {
          re1: value.check_6_A1,   // NOTE: template reuses check_6 names for 4a
          re2: value.check_6_A2,
          re3: value.check_6_A3,
          re4: value.check_6_A4,
          re5: value.check_6_A5,
          re6: value.check_6_A6,
          re7: value.check_6_A7,
          re8: value.check_6_A8,
        },
        anode_current_amps: {
          A1: value.check_4a_anode_A1 ?? null,   // ⚠️ add to buildForm() - template reuses check_6 names
          A2: value.check_4a_anode_A2 ?? null,
          A3: value.check_4a_anode_A3 ?? null,
          A4: value.check_4a_anode_A4 ?? null,
          A5: value.check_4a_anode_A5 ?? null,
          A6: value.check_4a_anode_A6 ?? null,
          A7: value.check_4a_anode_A7 ?? null,
          A8: value.check_4a_anode_A8 ?? null,
        },
        anode_voltage_v: value.check_4a_anode_vol ?? null,   // ⚠️ add to buildForm()
      },

      // ─── CHECK 4b - Display Reading (Auto mode) ──────────────
      check_4b: {
        hull_potential_mv: {
          re1: value.check_4b_re1 ?? null,   // ⚠️ add to buildForm()
          re2: value.check_4b_re2 ?? null,
          re3: value.check_4b_re3 ?? null,
          re4: value.check_4b_re4 ?? null,
          re5: value.check_4b_re5 ?? null,
          re6: value.check_4b_re6 ?? null,
          re7: value.check_4b_re7 ?? null,
          re8: value.check_4b_re8 ?? null,
        },
        anode_current_amps: {
          A1: value.check_4b_anode_A1 ?? null,
          A2: value.check_4b_anode_A2 ?? null,
          A3: value.check_4b_anode_A3 ?? null,
          A4: value.check_4b_anode_A4 ?? null,
          A5: value.check_4b_anode_A5 ?? null,
          A6: value.check_4b_anode_A6 ?? null,
          A7: value.check_4b_anode_A7 ?? null,
          A8: value.check_4b_anode_A8 ?? null,
        },
        anode_voltage_v: value.check_4b_anode_vol ?? null,
      },

      // ─── CHECK 5 - Hull Potential (Manual mode, current = 0) ─
      check_5: {
        re1: value.check_5_re1 ?? null,    // ⚠️ add to buildForm()
        re2: value.check_5_re2 ?? null,
        re3: value.check_5_re3 ?? null,
        re4: value.check_5_re4 ?? null,
        re5: value.check_5_re5 ?? null,
        re6: value.check_5_re6 ?? null,
        re7: value.check_5_re7 ?? null,
        re8: value.check_5_re8 ?? null,
      },

      // ─── CHECK 6 - Open circuit voltage of Anodes (ACU OFF) ──
      check_6: {
        A1: value.check_6_A1,
        A2: value.check_6_A2,
        A3: value.check_6_A3,
        A4: value.check_6_A4,
        A5: value.check_6_A5,
        A6: value.check_6_A6,
        A7: value.check_6_A7,
        A8: value.check_6_A8,
      },

      // ─── CHECK 7 - ICCP Functionality (ACU-1 Manual mode) ────
      check_7: {
        re1: value.check_7_re1 ?? null,    // ⚠️ add to buildForm()
        re2: value.check_7_re2 ?? null,
        re3: value.check_7_re3 ?? null,
        re4: value.check_7_re4 ?? null,
        re5: value.check_7_re5 ?? null,
        re6: value.check_7_re6 ?? null,
        re7: value.check_7_re7 ?? null,
        re8: value.check_7_re8 ?? null,
      },

      // ─── CHECK 9 - Fuse Continuity (SAT/UNSAT) ───────────────
      check_9: {
        A1: value.check_9_A1,
        A2: value.check_9_A2,
        A3: value.check_9_A3,
        A4: value.check_9_A4,
        A5: value.check_9_A5,
        A6: value.check_9_A6,
        A7: value.check_9_A7,
        A8: value.check_9_A8,
      },

      // ─── CHECK 10 - Previous day hull potential/current/voltage
      check_10: {
        hull_potential_mv: {
          re1: value.check_10_re1 ?? null,   // ⚠️ add to buildForm()
          re2: value.check_10_re2 ?? null,
          re3: value.check_10_re3 ?? null,
          re4: value.check_10_re4 ?? null,
          re5: value.check_10_re5 ?? null,
          re6: value.check_10_re6 ?? null,
          re7: value.check_10_re7 ?? null,
          re8: value.check_10_re8 ?? null,
        },
        anode_current_amps: {
          A1: value.check_10_anode_A1 ?? null,
          A2: value.check_10_anode_A2 ?? null,
          A3: value.check_10_anode_A3 ?? null,
          A4: value.check_10_anode_A4 ?? null,
          A5: value.check_10_anode_A5 ?? null,
          A6: value.check_10_anode_A6 ?? null,
          A7: value.check_10_anode_A7 ?? null,
          A8: value.check_10_anode_A8 ?? null,
        },
        anode_voltage_v: value.check_10_anode_vol ?? null,
      },

      // ─── CHECK 11 - Inspection of Cofferdams ─────────────────
      check_11: {
        inspection_of_cofferdams: value.check_9_A2,  // ⚠️ template reuses check_9_A2 — fix formControlName
      },
    };
    console.log('Payload for ICCP System Check:', payload);
    if (this.editMode) {
      payload.id = this.editDataDetails.id;
    }
    this.apiService
      .post('hitumodule/iccp-system-check', payload)
      .subscribe({
        next: (res: any) => {
          this.toastService.showSuccess(
            res?.message || 'ICCP system check saved successfully',
          );

          setTimeout(() => {
            this.router.navigate(['/app/ship/ber-certificate']);
          }, 1000);
        },
        error: (err: any) => {
          console.error('Error in adding ICCP system check', err);
          this.toastService.showError('Failed to save ICCP system check data.');
        },
        complete: () => {
          this.loading = false;
        },
      });

    this.router.navigate(['/app/ship/ber-certificate']);
  }
}
