import { CommonModule, DOCUMENT } from '@angular/common';
import { ChangeDetectorRef, Component, Inject, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import {
  LucideAngularModule,
  RotateCcw,
  Save,
  SaveAllIcon,
  Trash,
} from '../../../../ui/lucide-compat';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ToastComponent } from '../../../../ui/master-compat';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import {
  ReusableInputTableComponent,
  ReusableTableColumn,
} from '../../../../ui/reusable-input-table/reusable-input-table.component';
import { SelectComponent as NewSelectComponent } from '../../../../ui/select.component';
import { CalenderComponent } from '../../../../ui/calender.component';
import { InputComponent } from '../../../../ui/input.component';
import { MasterService } from '../../../../services/master.service';
import { ReusableDeleteDialogDynamicContentComponent as ReusableDeleteDialogDynamicContent } from '../../../../ui/master-compat';
import {
  FormInputTableWithHeadersComponent as FormInputTableWithHeaders,
  ReusableHeaderCell,
} from '../../../../ui/form-input-table-with-headers/form-input-table-with-headers.component';
import { Apiendpoints } from '../../../../ApiEndPoints';
import { ReusableButtonComponent } from '../../../../ui/master-compat';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';
import { MonthYearCalendarComponent as YearPickerComponent } from '../../../../ui/month-year-calendar.component';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-quarterly-hull-modular-iccp-system',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LucideAngularModule,
    LoadingButtonComponent,
    ToastComponent,
    NewSelectComponent,
    CalenderComponent,
    InputComponent,
    ReusableDeleteDialogDynamicContent,
    FormInputTableWithHeaders,
    ReusableButtonComponent,
    ApprovalWorkFlow,
    YearPickerComponent,
  ],
  templateUrl: './quarterly-hull-modular-iccp-system.html',
})
export class QuarterlyHullModularIccpSystem implements OnInit {
  editMode = false;
  viewMode = false;
  rowId: string | null = null;
  editDataDetails: any = null;
  showApprovalWorkflowPopup = false;

  readonly draftIcon = Save;
  readonly saveIcon = SaveAllIcon;
  readonly restartIcon = RotateCcw;
  readonly deleteIcon = Trash;

  draftLoading = false;
  saveLoading = false;

  form!: FormGroup;

  selectedRow: any = null;
  selectedRowIndex: number | null = null;
  selectedTable:
    | 'firstTable'
    | 'secondTable'
    | 'thirdTable'
    | 'forthTable'
    | null = null;
  tableRowDeleteDialogOpen = false;

  quarterEndingOptions = [
    { label: 'MAR', value: 'mar' },
    { label: 'JUN', value: 'jun' },
    { label: 'SEP', value: 'sep' },
    { label: 'DEC', value: 'dec' },
  ];

  satUnsatOptions = [
    { label: 'SAT', value: 'sat' },
    { label: 'UNSAT', value: 'unsat' },
  ];

  portStbdOptions = [
    { label: 'Port', value: 'port' },
    { label: 'STBD', value: 'stbd' },
  ];

  shipOptions: any[] = [];
  referenceElectrodeOptions: any[] = [];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private toastService: ToastService,
    @Inject(DOCUMENT) public document: Document,
    private masterService: MasterService,
    private cdr: ChangeDetectorRef,
  ) {}

  onApprovalPopupChange(open: boolean): void {
    this.showApprovalWorkflowPopup = open;
    this.cdr.detectChanges();
  }

  openApprovalWorkflow(): void {
    this.showApprovalWorkflowPopup = true;
    this.cdr.detectChanges();
  }

  ngOnInit(): void {
    this.buildForm();
    this.initializeTableData();
    this.loadShips();
    this.loadReferenceElectrodes();

    const mode = this.route.snapshot.data['mode'];
    this.route.paramMap.subscribe((params) => {
      this.rowId = params.get('id');
      if (this.rowId) {
        this.getEditDataByRowId(this.rowId);
      }
      if (mode === 'view') {
        this.viewMode = true;
      }
      if (mode === 'edit') {
        this.editMode = true;
      }
      if (mode === 'edit' || mode === 'view') {
        ((this.iccp_system_rows = this.iccp_system_rows_In_editMode),
          (this.potentialRows = this.potentialRows_In_editMode),
          (this.sacrificialAnodeRows = this.sacrificialAnodeRows_In_editMode),
          (this.forthTableRows = this.forthTableRows_In_editMode));
      }

      console.log('mode', mode);
    });
  }

  buildForm(): void {
    this.form = this.fb.group({
      ship_id: ['', [Validators.required]],
      year: ['', [Validators.required]],
      date_of_return: ['', [Validators.required]],
      ship_last_undocked_date: ['', [Validators.required]],
      brief_paint_details_during_last_docking: ['', [Validators.required]],
      complete_anti_corrosive_last_renewed_date: ['', [Validators.required]],
      type_reference_electrode_used: ['', [Validators.required]],
      hull_material: ['', [Validators.required]],
      iccp_anode_material: ['', [Validators.required]],
      quarter_ending: ['', [Validators.required]],
      last_calibration_portable_re_date: ['', [Validators.required]],
      preset_potential_iccp_acu: ['', [Validators.required]],
      oem_iccp_system: ['', [Validators.required]],
      visual_inspection_date: ['', [Validators.required]],
      inspection_carried_by: ['', [Validators.required]],
      no_of_modules: ['', [Validators.required]],
      no_of_anodes_per_module: ['', [Validators.required]],
      cables_observation: [''],
      conduits_observation: [''],
      cofferdams_observation: [''],
      cables_remarks: [''],
      conduits_remarks: [''],
      cofferdams_remarks: [''],
    });
  }

  // Load ships from API
  loadShips() {
    this.masterService.getVessels().subscribe((res) => {
      this.shipOptions = res.data.map((item: any) => ({
        label: item.name,
        value: item.id,
      }));

      // ✅ AUTO SELECT if only one ship
      if (this.shipOptions.length === 1) {
        this.form.patchValue({
          ship_id: this.shipOptions[0].value,
        });
      }
    });
  }

  loadReferenceElectrodes() {
    this.masterService.getReferenceElectrodes().subscribe((res) => {
      this.referenceElectrodeOptions = res.data.map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
    });
  }
  // getReferenceElectrodes

  //
  // ------------------------------- TABLE CONFIGURATION ----------------------------------------
  iccp_system_rows = 1;
  iccp_system_rows_In_editMode = 1;

  iccp_system_data: any[] = [];
  iccp_system_columns: ReusableTableColumn[] = [
    {
      field: 's_no',
      header: 'Sr No.',
      width: '20px',
      align: 'center' as const,
      template: 'serialNumberTpl',
    },
    {
      field: 'date',
      header: 'Date',
      width: '150px',
      fieldType: 'date',
    },
    {
      field: 'time',
      header: 'Time (Hrs)',
      width: '120px',
      fieldType: 'time',
    },

    // Hull Potential
    {
      field: 'forward_port',
      header: 'Port',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'forward_stbd',
      header: 'Stbd',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'output_anode_voltage',
      header: 'Output Anode Voltage',
      width: '80px',
      fieldType: 'number',
    },

    // Individual Anode Current
    {
      field: 'anode_1',
      header: 'Anode 1',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'anode_2',
      header: 'Anode 2',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'anode_3',
      header: 'Anode 3',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'anode_4',
      header: 'Anode 4',
      width: '80px',
      fieldType: 'number',
    },

    // Total Current
    {
      field: 'total_current',
      header: 'Total current Amps',
      width: '120px',
      fieldType: 'number',
    },

    // Berthed Ship
    {
      field: 'ship_berthed',
      header: 'If berthed alongside some other ship, then name of the ship',
      width: '200px',
      fieldType: 'textarea',
    },

    // Sailing Speed
    {
      field: 'speed',
      header: 'If sailing, speed in knots',
      width: '120px',
      fieldType: 'number',
    },

    {
      field: 'remarks',
      header: 'Remarks',
      width: '200px',
      fieldType: 'textarea',
    },
  ];
  iccp_system_header_Row: ReusableHeaderCell[][] = [
    [
      { header: 'Sr No.', rowspan: 3 },
      { header: 'Date', rowspan: 3 },
      { header: 'Time (Hrs)', rowspan: 3 },
      { header: 'Hull potential mV', colspan: 2 },
      { header: 'Output Anode Voltage', rowspan: 3 },
      { header: 'Individual anode current (Amps)', colspan: 4 },
      { header: 'Total current Amps', rowspan: 3 },
      {
        header: 'If berthed alongside some other ship, then name of the ship',
        rowspan: 3,
      },
      { header: 'If sailing, speed in knots', rowspan: 3 },
      { header: 'Remarks', rowspan: 3 },
    ],
    [
      { header: 'Port' },
      { header: 'Stbd' },
      { header: 'Anode 1' },
      { header: 'Anode 2' },
      { header: 'Anode 3' },
      { header: 'Anode 4' },
    ],
    [
      { header: '' },
      { header: '' },
      { header: '' },
      { header: '' },
      { header: '' },
      { header: '' },
    ],
  ];

  // -------------------------------Table 2 -------------------------------
  sacrificialAnodeRows = 1;
  sacrificialAnodeRows_In_editMode = 1;
  sacrificialAnodeData: any[] = [];
  sacrificialAnodeColumns: ReusableTableColumn[] = [
    {
      field: 's_no',
      header: 'Sr No.',
      width: '20px',
      align: 'center',
      template: 'serialNumberTpl',
    },
    {
      field: 'type_of_anode',
      header: 'Type of Anode (MK I, II etc)',
      width: '150px',
      fieldType: 'text',
    },
    {
      field: 'port_stbd',
      header: 'Port/STBD',
      width: '150px',
      fieldType: 'select',
      options: this.portStbdOptions,
    },
    {
      field: 'frame_from',
      header: 'From',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'frame_to',
      header: 'To',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'renewed',
      header: 'Whether anode was renewed in last dry-docking',
      width: '150px',
      fieldType: 'text',
    },
    {
      field: 'remarks',
      header: 'Remarks',
      width: '200px',
      fieldType: 'textarea',
    },
  ];
  sacrificialAnodeHeaderRow: ReusableHeaderCell[][] = [
    [
      { header: 'Sr No.', rowspan: 2 },
      { header: 'Type of Anode (MK I, II etc)', rowspan: 2 },
      { header: 'Port/STBD', rowspan: 2 },
      { header: 'Frame', colspan: 2 },
      { header: 'Whether anode was renewed in last dry-docking', rowspan: 2 },
      { header: 'Remarks', rowspan: 2 },
    ],
    [{ header: 'From' }, { header: 'To' }],
  ];

  //------------------------------ Table 3: Hull Potential Measurements -------------------------------
  potentialRows = 1;
  potentialRows_In_editMode = 1;
  potentialData: any[] = [];
  potentialColumns: ReusableTableColumn[] = [
    {
      field: 's_no',
      header: 'Sr No.',
      width: '20px',
      align: 'center' as const,
      template: 'serialNumberTpl',
    },
    {
      field: 'date',
      header: 'Date',
      width: '150px',
      fieldType: 'date',
    },
    {
      field: 'time',
      header: 'Time',
      width: '120px',
      fieldType: 'time',
    },
    {
      field: 'forward_port',
      header: 'Port',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'forward_stbd',
      header: 'Stbd',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'midship_port',
      header: 'Port',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'midship_stbd',
      header: 'Stbd',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'midship_port2',
      header: 'Port',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'midship_stbd2',
      header: 'Stbd',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'aft_port',
      header: 'Port',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'aft_stbd',
      header: 'Stbd',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'remarks',
      header: 'Remarks',
      width: '200px',
      fieldType: 'textarea',
    },
  ];
  potentialHeaderRow: ReusableHeaderCell[][] = [
    [
      { header: 'Sr No.', rowspan: 2 },
      { header: 'Date', rowspan: 2 },
      { header: 'Time', rowspan: 2 },
      { header: 'Forward (Frame station)', colspan: 2 },
      { header: 'Midship (Frame station)', colspan: 4 },
      { header: 'Aft (Frame station)', colspan: 2 },
      { header: 'Remarks', rowspan: 2 },
    ],
    [
      { header: 'Port' },
      { header: 'Stbd' },
      { header: 'Port' },
      { header: 'Stbd' },
      { header: 'Port' },
      { header: 'Stbd' },
      { header: 'Port' },
      { header: 'Stbd' },
    ],
  ];

  //------------------------------- Table 4 -------------------------------
  forthTableRows = 1;
  forthTableRows_In_editMode = 1;
  forthTableData: any[] = [];
  forthTableColumns: ReusableTableColumn[] = [
    {
      field: 's_no',
      header: 'Sr No.',
      width: '20px',
      align: 'center' as const,
      template: 'serialNumberTpl',
    },
    {
      field: 'ac_date',
      header: 'Date',
      width: '150px',
      fieldType: 'date',
    },
    {
      field: 'ac_time',
      header: 'Time',
      width: '120px',
      fieldType: 'time',
    },
    {
      field: 'ac_forward_port',
      header: 'Port',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'ac_forward_stbd',
      header: 'Stbd',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'ac_midship_port',
      header: 'Port',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'ac_midship_stbd',
      header: 'Stbd',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'ac_midship_port2',
      header: 'Port',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'ac_midship_stbd2',
      header: 'Stbd',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'ac_aft_port',
      header: 'Port',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'ac_aft_stbd',
      header: 'Stbd',
      width: '80px',
      fieldType: 'number',
    },
    {
      field: 'ac_remarks',
      header: 'Remarks',
      width: '200px',
      fieldType: 'textarea',
    },
  ];
  forthTableHeaderRow: ReusableHeaderCell[][] = [
    [
      { header: 'Sr No.', rowspan: 2 },
      { header: 'Date', rowspan: 2 },
      { header: 'Time', rowspan: 2 },
      { header: 'Forward (Frame station)', colspan: 2 },
      { header: 'Midship (Frame station)', colspan: 4 },
      { header: 'Aft (Frame station)', colspan: 2 },
      { header: 'Remarks', rowspan: 2 },
    ],
    [
      { header: 'Port' },
      { header: 'Stbd' },
      { header: 'Port' },
      { header: 'Stbd' },
      { header: 'Port' },
      { header: 'Stbd' },
      { header: 'Port' },
      { header: 'Stbd' },
    ],
  ];

  initializeTableData(): void {
    this.updateicpp_system(this.iccp_system_rows);
    this.updatePotentialRows(this.potentialRows);
    this.updateSacrificialRows(this.sacrificialAnodeRows);
    this.updateForthTableRows(this.forthTableRows);
  }

  // TABLE 1 : Update anodes table rows
  updateicpp_system(count: number): void {
    const currentLength = this.iccp_system_data.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.iccp_system_data.push({
          s_no: i + 1,
          date: '',
          time: '',
          forward_port: '',
          forward_stbd: '',
          output_anode_voltage: '', // ✅ ADDED
          anode_1: '',
          anode_2: '',
          anode_3: '',
          anode_4: '',
          total_current: '',
          ship_berthed: '',
          speed: '',
          remarks: '',
        });
      }
    } else if (count < currentLength) {
      this.iccp_system_data.splice(count);
    }
    this.iccp_system_data = [...this.iccp_system_data];
    this.cdr.detectChanges();
  }
  // TABLE 2 : Update anodes table rows
  updateSacrificialRows(count: number): void {
    const currentLength = this.sacrificialAnodeData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.sacrificialAnodeData.push({
          s_no: i + 1,
          type_of_anode: '',
          port_stbd: '',
          frame_from: '',
          frame_to: '',
          renewed: '',
          remarks: '',
        });
      }
    } else {
      this.sacrificialAnodeData.splice(count);
    }
    this.sacrificialAnodeData = [...this.sacrificialAnodeData];
    this.cdr.detectChanges();
  }
  // TABLE 3 : Update POTENTIAL table rows
  updatePotentialRows(count: number): void {
    const currentLength = this.potentialData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.potentialData.push({
          s_no: i + 1,
          date: '',
          time: '',
          forward_port: '',
          forward_stbd: '',
          midship_port: '',
          midship_stbd: '',
          midship_port2: '',
          midship_stbd2: '',
          aft_port: '',
          aft_stbd: '',
          remarks: '',
        });
      }
    } else if (count < currentLength) {
      this.potentialData.splice(count);
    }
    this.potentialData = [...this.potentialData];
    this.cdr.detectChanges();
  }
  // TABLE 4 : Update FORTH table rows
  updateForthTableRows(count: number): void {
    const currentLength = this.forthTableData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.forthTableData.push({
          s_no: i + 1,
          ac_date: '',
          ac_time: '',
          ac_forward_port: '',
          ac_forward_stbd: '',
          ac_midship_port: '',
          ac_midship_stbd: '',
          ac_midship_port2: '',
          ac_midship_stbd2: '',
          ac_aft_port: '',
          ac_aft_stbd: '',
          ac_remarks: '',
        });
      }
    } else if (count < currentLength) {
      this.forthTableData.splice(count);
    }
    this.forthTableData = [...this.forthTableData];
    this.cdr.detectChanges();
  }

  updateIccpSystemActionColumnVisibility() {
    const actionColumn = this.iccp_system_columns.find(
      (c) => c.field === 'action',
    );

    if (!actionColumn) return;

    const shouldShow = this.editMode;

    actionColumn.hidden = !shouldShow;

    this.iccp_system_columns = [...this.iccp_system_columns];
  }
  //

  updateSacrificialAnodeColumnVisibility() {
    const actionColumn = this.sacrificialAnodeColumns.find(
      (c) => c.field === 'action',
    );

    if (!actionColumn) return;

    const shouldShow = this.editMode;

    actionColumn.hidden = !shouldShow;

    this.sacrificialAnodeColumns = [...this.sacrificialAnodeColumns];
  }

  updateHullPotentialColumnVisibility() {
    const actionColumn = this.potentialColumns.find(
      (c) => c.field === 'action',
    );

    if (!actionColumn) return;

    const shouldShow = this.editMode;

    actionColumn.hidden = !shouldShow;

    this.potentialColumns = [...this.potentialColumns];
  }

  updateForthTableColumnVisibility() {
    const actionColumn = this.forthTableColumns.find(
      (c) => c.field === 'action',
    );

    if (!actionColumn) return;

    const shouldShow = this.editMode;

    actionColumn.hidden = !shouldShow;

    this.forthTableColumns = [...this.forthTableColumns];
  }

  // ------------------------------- HANDLE TABLE CHANGES ------------------------------
  handleIccpSystemTableChange(
    rowIndex: number,
    field: string,
    value: any,
  ): void {
    if (this.viewMode) return;
    this.iccp_system_data[rowIndex][field] = value;
  }

  handleSacrificialAnodeTableChange(
    rowIndex: number,
    field: string,
    value: any,
  ): void {
    if (this.viewMode) return;
    this.sacrificialAnodeData[rowIndex][field] = value;
  }

  handlePotentialTableChange(
    rowIndex: number,
    field: string,
    value: any,
  ): void {
    if (this.viewMode) return;
    this.potentialData[rowIndex][field] = value;
  }

  handleForthTableChange(rowIndex: number, field: string, value: any): void {
    if (this.viewMode) return;
    this.forthTableData[rowIndex][field] = value;
  }

  handleTableAction(event: any) {
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

  onIccpSystemRowChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = +input.value;
    const minValue = this.editMode ? this.iccp_system_rows_In_editMode : 1;
    const maxValue = 99;
    value = Math.max(minValue, Math.min(maxValue, value));
    input.value = value.toString();
    this.iccp_system_rows = value;
    this.updateicpp_system(this.iccp_system_rows);
  }

  onPotentialRowChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = +input.value;
    const minValue = this.editMode ? this.potentialRows_In_editMode : 1;
    const maxValue = 99;
    value = Math.max(minValue, Math.min(maxValue, value));
    input.value = value.toString();
    this.potentialRows = value;
    this.updatePotentialRows(this.potentialRows);
  }

  onSacrificialAnodeRowsChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = +input.value;
    const minValue = this.editMode ? this.sacrificialAnodeRows_In_editMode : 1;
    const maxValue = 99;
    value = Math.max(minValue, Math.min(maxValue, value));
    input.value = value.toString();
    this.sacrificialAnodeRows = value;
    this.updateSacrificialRows(this.sacrificialAnodeRows);
  }

  onForthTableRowChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = +input.value;
    const minValue = this.editMode ? this.forthTableRows_In_editMode : 1;
    const maxValue = 99;
    value = Math.max(minValue, Math.min(maxValue, value));
    input.value = value.toString();
    this.forthTableRows = value;
    this.updateForthTableRows(this.forthTableRows);
  }

  getEditDataByRowId(rowId: string, openWorkflow: boolean = false): void {
    this.apiService
      .get(
        `${Apiendpoints.QUARTERLY_HULL_POTENTIAL_DATA_OF_SHIPS_FITTED_WITH_MODULAR_ICCP_SYSTEM}${rowId}/`,
      )
      .subscribe({
        next: (res: any) => {
          if (!res?.data) return;

          const data = res.data;

          // ✅ ---------------- FORM PATCH ----------------
          this.form.patchValue({
            ship_id: data.ship?.id || '',
            year: data.year,
            date_of_return: data.date_of_return,
            ship_last_undocked_date: data.ship_last_undocked_date,
            brief_paint_details_during_last_docking:
              data.brief_paint_details_during_last_docking,
            complete_anti_corrosive_last_renewed_date:
              data.complete_anti_corrosive_last_renewed_date,
            type_reference_electrode_used: data.type_reference_electrode_used,
            hull_material: data.hull_material,
            iccp_anode_material: data.iccp_anode_material,
            quarter_ending: data.quarter_ending,
            last_calibration_portable_re_date:
              data.last_calibration_portable_re_date,
            preset_potential_iccp_acu: data.preset_potential_iccp_acu,
            oem_iccp_system: data.oem_iccp_system,
            visual_inspection_date: data.visual_inspection_date,
            inspection_carried_by: data.inspection_carried_by,
            total_no_of_anodes: data.total_no_of_anodes,
            no_of_res: data.no_of_res,
            cables_observation: data.cables_observation,
            conduits_observation: data.conduits_observation,
            cofferdams_observation: data.cofferdams_observation,
            cables_remarks: data.cables_remarks,
            conduits_remarks: data.conduits_remarks,
            cofferdams_remarks: data.cofferdams_remarks,
          });

          // ✅ ---------------- TABLE 1 ----------------
          this.iccp_system_data = (data.iccp_measurements || []).map(
            (item: any, index: number) => ({
              id: item.id,
              s_no: index + 1,
              date: item.iccp_date,
              time: item.iccp_time,
              forward_port: item.iccp_port,
              forward_stbd: item.iccp_stbd,
              output_anode_voltage: item.output_anode_voltage,
              anode_1: item.anode1,
              anode_2: item.anode2,
              anode_3: item.anode3,
              anode_4: item.anode4,
              total_current: item.iccp_total_current,
              ship_berthed: item.iccp_berthed_alongside,
              speed: item.iccp_sailing_speed,
              remarks: item.iccp_remarks,
            }),
          );
          this.iccp_system_rows = this.iccp_system_data.length || 1;

          // ✅ ---------------- TABLE 2 ----------------
          this.sacrificialAnodeData = (data.hull_potential_readings || []).map(
            (item: any, index: number) => ({
              id: item.id,
              s_no: index + 1,
              type_of_anode: item.type_of_anode,
              port_stbd: item.port_stbd,
              frame_from: item.from_frame,
              frame_to: item.to_frame,
              renewed: item.anode_renewed,
              remarks: item.remarks,
            }),
          );
          this.sacrificialAnodeRows = this.sacrificialAnodeData.length || 1;

          // ✅ ---------------- TABLE 3 (ACU OFF) ----------------
          this.potentialData = (data.acu_off || []).map(
            (item: any, index: number) => ({
              id: item.id,
              s_no: index + 1,
              date: item.date,
              time: item.time,
              forward_port: item.forward_port,
              forward_stbd: item.forward_stbd,
              midship_port: item.midship_port,
              midship_stbd: item.midship_stbd,
              midship_port2: item.midship_port2,
              midship_stbd2: item.midship_stbd2,
              aft_port: item.aft_port,
              aft_stbd: item.aft_stbd,
              remarks: item.remarks,
            }),
          );
          this.potentialRows = this.potentialData.length || 1;

          // ✅ ---------------- TABLE 4 (ACU ON) ----------------
          this.forthTableData = (data.acu_on || []).map(
            (item: any, index: number) => ({
              id: item.id,
              s_no: index + 1,
              ac_date: item.date,
              ac_time: item.time,
              ac_forward_port: item.forward_port,
              ac_forward_stbd: item.forward_stbd,
              ac_midship_port: item.midship_port,
              ac_midship_stbd: item.midship_stbd,
              ac_midship_port2: item.midship_port2,
              ac_midship_stbd2: item.midship_stbd2,
              ac_aft_port: item.aft_port,
              ac_aft_stbd: item.aft_stbd,
              ac_remarks: item.remarks,
            }),
          );
          this.forthTableRows = this.forthTableData.length || 1;

          if (this.viewMode) {
            this.form.disable();
          }

          if (openWorkflow) {
            this.openApprovalWorkflow();
          }

          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error fetching data:', err);
          this.toastService.showError('Failed to load report details.');
        },
      });
  }

  closeDeleteDialog() {
    this.tableRowDeleteDialogOpen = false;
  }

  confirmDelete() {
    if (this.selectedTable === 'firstTable' && this.selectedRowIndex !== null) {
      this.iccp_system_data.splice(this.selectedRowIndex, 1);
    }

    if (this.selectedTable === 'forthTable' && this.selectedRowIndex !== null) {
      this.potentialData.splice(this.selectedRowIndex, 1);
    }

    this.tableRowDeleteDialogOpen = false;
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  handleBack() {
    this.router.navigate([
      '/ship/returns/quarterly-hull-potential-with-modular-iccp-system',
    ]);
  }

  // ------------------------ CHECKING EMPTY ROWS
  // Table 1 :
  iccpSystemTableRemoveEmptyRows(item: any): boolean {
    return !(
      item?.date ||
      item?.time ||
      item?.forward_port ||
      item?.forward_stbd ||
      item?.output_anode_voltage ||
      item?.anode_1 ||
      item?.anode_2 ||
      item?.anode_3 ||
      item?.anode_4 ||
      item?.total_current ||
      item?.ship_berthed ||
      item?.speed ||
      item?.remarks
    );
  }
  // Table 2 :
  sacrificialAnodesTableRemoveEmptyRows(item: any): boolean {
    return !(
      item?.type_of_anode ||
      item?.port_stbd ||
      item?.frame_from ||
      item?.frame_to ||
      item?.renewed ||
      item?.remarks
    );
  }
  // Table 3 :
  hullPotentialTableRemoveEmptyRows(item: any): boolean {
    return !(
      item?.date ||
      item?.time ||
      item?.forward_port ||
      item?.forward_stbd ||
      item?.midship_port ||
      item?.midship_stbd ||
      item?.midship_port2 ||
      item?.midship_stbd2 ||
      item?.aft_port ||
      item?.aft_stbd ||
      item?.remarks
    );
  }

  forthTableRemoveEmptyRows(item: any): boolean {
    return !(
      item?.ac_date ||
      item?.ac_time ||
      item?.ac_forward_port ||
      item?.ac_forward_stbd ||
      item?.ac_midship_port ||
      item?.ac_midship_stbd ||
      item?.ac_midship_port2 ||
      item?.ac_midship_stbd2 ||
      item?.ac_aft_port ||
      item?.ac_aft_stbd ||
      item?.ac_remarks
    );
  }

  handleSave(draftStatus: 'draft' | 'save'): void {
    if (draftStatus === 'save' && !this.validateForm()) {
      return;
    }
    if (draftStatus === 'save') {
      this.saveLoading = true;
    } else {
      this.draftLoading = true;
    }

    const firstTableFormattedData = this.iccp_system_data
      .filter((item) => !this.iccpSystemTableRemoveEmptyRows(item))
      .map((item, index) => ({
        id: item?.id || null,
        s_no: index + 1,
        iccp_date: item?.date,
        iccp_time: item?.time,
        iccp_port: item?.forward_port,
        iccp_stbd: item?.forward_stbd,
        output_anode_voltage: item?.output_anode_voltage,
        anode1: item?.anode_1,
        anode2: item?.anode_2,
        anode3: item?.anode_3,
        anode4: item?.anode_4,
        iccp_total_current: item?.total_current,
        iccp_berthed_alongside: item?.ship_berthed,
        iccp_sailing_speed: item?.speed,
        iccp_remarks: item?.remarks,
      }));

    const secondTableFormattedData = this.sacrificialAnodeData
      .filter((item) => !this.sacrificialAnodesTableRemoveEmptyRows(item))
      .map((item, index) => ({
        id: item?.id || null,
        s_no: index + 1,
        type_of_anode: item?.type_of_anode,
        port_stbd: item?.port_stbd,
        from_frame: item?.frame_from,
        to_frame: item?.frame_to,
        anode_renewed: item?.renewed,
        remarks: item?.remarks,
      }));

    const ThirdTableFormattedData = this.potentialData
      .filter((item) => !this.hullPotentialTableRemoveEmptyRows(item))
      .map((item, index) => ({
        id: item?.id || null,
        s_no: index + 1,
        date: item?.date,
        time: item?.time,
        forward_port: item?.forward_port,
        forward_stbd: item?.forward_stbd,
        midship_port: item?.midship_port,
        midship_stbd: item?.midship_stbd,
        midship_port2: item?.midship_port2,
        midship_stbd2: item?.midship_stbd2,
        aft_port: item?.aft_port,
        aft_stbd: item?.aft_stbd,
        remark: item?.remark,
      }));

    const ForthTableFormattedData = this.forthTableData
      .filter((item) => !this.forthTableRemoveEmptyRows(item))
      .map((item, index) => ({
        id: item?.id || null,
        s_no: index + 1,
        date: item?.ac_date,
        time: item?.ac_time,
        forward_port: item?.ac_forward_port,
        forward_stbd: item?.ac_forward_stbd,
        midship_port: item?.ac_midship_port,
        midship_stbd: item?.ac_midship_stbd,
        midship_port2: item?.ac_midship_port2,
        midship_stbd2: item?.ac_midship_stbd2,
        aft_port: item?.ac_aft_port,
        aft_stbd: item?.ac_aft_stbd,
        remarks: item?.ac_remarks,
      }));
    const payload = {
      ...this.form.getRawValue(),
      draft_status: draftStatus,
      iccp_measurements: firstTableFormattedData,
      hull_potential_readings: secondTableFormattedData,
      acu_off: ThirdTableFormattedData,
      acu_on: ForthTableFormattedData,
    };

    if (this.editMode) {
      payload.id = this.rowId;
    }

    this.apiService
      .post(
        Apiendpoints.QUARTERLY_HULL_POTENTIAL_DATA_OF_SHIPS_FITTED_WITH_MODULAR_ICCP_SYSTEM,
        payload,
      )
      .pipe(
        finalize(() => {
          if (draftStatus === 'save') {
            this.saveLoading = false;
          } else {
            this.draftLoading = false;
          }
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.toastService.showSuccess(
            res?.message ||
              'Error in filling Quarterly Hull potential conventional iccp system data',
          );

          if (draftStatus === 'save') {
            const savedId =
              res?.data?.id ??
              res?.data?.rowId ??
              res?.id ??
              this.editDataDetails?.id;

            if (savedId) {
              this.rowId = String(savedId);
              if (res?.data) {
                this.editDataDetails = res.data;
              } else if (this.editDataDetails) {
                this.editDataDetails.id = savedId;
              }
              this.getEditDataByRowId(this.rowId, true);
            } else {
              this.toastService.showError(
                'Record saved, but approval workflow could not be opened.',
              );
            }
          } else {
            setTimeout(() => {
              this.router.navigate([
                '/ship/returns/quarterly-hull-potential-with-modular-iccp-system',
              ]);
            }, 1000);
          }
        },
        error: () => {
          this.toastService.showError('Failed to save Record.');
        },
      });
  }
  clear(): void {
    if (confirm('Are you sure you want to clear all form data?')) {
      this.form.reset();
      this.iccp_system_rows = 1;
      this.potentialRows = 1;
      this.sacrificialAnodeRows = 1;
      this.initializeTableData();
      this.toastService.showSuccess('Form has been cleared.');
    }
  }
}
