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

import {
  LucideAngularModule,
  RotateCcw,
  Save,
  SaveAllIcon,
  FileText,
  Trash,
} from '../../../../ui/lucide-compat';

import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ToastComponent } from '../../../../ui/master-compat';

import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { MasterService } from '../../../../services/master.service';

import {
  ReusableInputTableComponent,
  ReusableTableColumn,
} from '../../../../ui/reusable-input-table/reusable-input-table.component';

import { SelectComponent as NewSelectComponent } from '../../../../ui/select.component';
import { InputComponent } from '../../../../ui/input.component';
import { MonthYearCalendarComponent as YearPickerComponent } from '../../../../ui/month-year-calendar.component';
import { CalenderComponent } from '../../../../ui/calender.component';

import {
  FormInputTableWithHeadersComponent as FormInputTableWithHeaders,
  ReusableHeaderCell,
} from '../../../../ui/form-input-table-with-headers/form-input-table-with-headers.component';

import { ReusableButtonComponent } from '../../../../ui/master-compat';

import { Apiendpoints } from '../../../../ApiEndPoints';

import { finalize, firstValueFrom } from 'rxjs';

import { ShellExpensionGaDrawingDialogViewer } from '../../../../ui/master-compat';

import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-hull-inspection-report',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LucideAngularModule,
    LoadingButtonComponent,
    ToastComponent,
    NewSelectComponent,
    YearPickerComponent,
    CalenderComponent,
    FormInputTableWithHeaders,
    ReusableButtonComponent,
    ApprovalWorkFlow,
  ],
  templateUrl: './hull-inspection-report.component.html',
})
export class HullInspectionReportComponent implements OnInit {
  // ---------------------------------------------------------------------------
  // MODE
  // ---------------------------------------------------------------------------

  editMode = false;
  viewMode = false;

  rowId: string | null = null;
  editDataDetails: any = null;

  showApprovalWorkflowPopup = false;

  // ---------------------------------------------------------------------------
  // ICONS
  // ---------------------------------------------------------------------------

  readonly draftIcon = Save;
  readonly saveIcon = SaveAllIcon;
  readonly deleteIcon = Trash;
  readonly restartIcon = RotateCcw;
  readonly fetchIcon = FileText;

  // ---------------------------------------------------------------------------
  // FORM
  // ---------------------------------------------------------------------------

  form!: FormGroup;

  saveLoading = false;
  draftLoading = false;

  // ---------------------------------------------------------------------------
  // MASTER DATA
  // ---------------------------------------------------------------------------

  shipOptions: any[] = [];

  /**
   * Compartments are loaded dynamically based on selected ship.
   */
  compartmentOptions: any[] = [];

  /**
   * Strakes are loaded dynamically based on ship class.
   */
  strakesOptions: any[] = [];

  // ---------------------------------------------------------------------------
  // TABLE / ROW STATE
  // ---------------------------------------------------------------------------

  selectedRow: any = null;
  selectedRowIndex: number | null = null;

  tableRowDeleteDialogOpen = false;

  // ---------------------------------------------------------------------------
  // SHELL EXPANSION / GA DATA
  // ---------------------------------------------------------------------------

  shipDrawingData: any = null;
  isDrawingLoaded = false;
  drawingLoadFailed = false;

  frameRanges: any[] = [];

  /**
   * Contains the compartment values selected in inspection rows.
   */
  selectedCompartmentList: Array<string | number> = [];

  // ---------------------------------------------------------------------------
  // QUARTER OPTIONS
  // ---------------------------------------------------------------------------

  quarterlyEndingOptions = [
    { label: 'MAR', value: 'march' },
    { label: 'JUN', value: 'june' },
    { label: 'SEP', value: 'september' },
    { label: 'DEC', value: 'december' },
  ];

  // ---------------------------------------------------------------------------
  // INSPECTION TABLE
  // ---------------------------------------------------------------------------

  inspectionRows = 1;
  inspectionData: any[] = [];

  // ---------------------------------------------------------------------------
  // CONSTRUCTOR
  // ---------------------------------------------------------------------------

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private toastService: ToastService,
    private masterService: MasterService,
    private cdr: ChangeDetectorRef,
  ) {}

  // ===========================================================================
  // USER HELPERS
  // ===========================================================================

  getUser(): any {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  }

  isShipUser(user: any): boolean {
    if (!user) return false;
    if (user.process_name === 'Ship') return true;
    if (Array.isArray(user.role_center) && user.role_center.length > 0) {
      const rc = user.role_center[0];
      if (
        rc?.process_name === 'Ship' ||
        rc?.process_details?.name === 'Ship' ||
        rc?.process_name === 'ship' ||
        rc?.process_details?.name === 'ship'
      ) {
        return true;
      }
    }
    return false;
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  ngOnInit(): void {
    this.buildForm();
    this.initializeTableData();

    const mode = this.route.snapshot.data['mode'];
    this.rowId = this.route.snapshot.paramMap.get('id');

    // Determine page mode.
    this.editMode = mode === 'edit';
    this.viewMode = mode === 'view';

    this.form.get('ship_id')?.valueChanges.subscribe(async (shipId) => {
      if (!shipId) {
        this.clearShipDependentData();
        return;
      }

      await this.handleShipChange(shipId);
    });

    this.loadShips();
  }

  // ===========================================================================
  // FORM
  // ===========================================================================

  buildForm(): void {
    this.form = this.fb.group({
      ship_id: ['', Validators.required],
      year: ['', Validators.required],
      date_of_return: ['', Validators.required],
      quarter_ending: ['', Validators.required],
    });
  }

  // ===========================================================================
  // SHIP
  // ===========================================================================

  loadShips(): void {
    const user = this.getUser();
    this.apiService.get(Apiendpoints.MASTER_SHIP).subscribe({
      next: (res: any) => {
        this.shipOptions = (res?.results || res?.data || []).map((item: any) => ({
          label: item.name,
          value: item.id,
          classOfShip: item.classofship,
        }));

        if (
          user?.ship_id &&
          !this.shipOptions.some((s: any) => s.value === user.ship_id)
        ) {
          this.shipOptions.unshift({
            label: user.ship_name || `Ship ${user.ship_id}`,
            value: user.ship_id,
          });
        }

        if (this.isShipUser(user) && user?.ship_id) {
          this.form.patchValue({ ship_id: user.ship_id });
          this.form.get('ship_id')?.disable();
        } else if (user?.ship_id && !this.rowId) {
          this.form.patchValue({ ship_id: user.ship_id });
        } else if (this.shipOptions.length === 1 && !this.rowId) {
          this.form.patchValue({
            ship_id: this.shipOptions[0].value,
          });
        }

        if (this.rowId) {
          this.getEditDataByRowId(this.rowId);
        }

        this.cdr.detectChanges();
      },

      error: (err) => {
        console.error('Error loading ships:', err);
        if (user?.ship_id) {
          this.shipOptions = [
            { label: user.ship_name || 'INS KOLKATA', value: user.ship_id },
          ];
          this.form.patchValue({ ship_id: user.ship_id });
          if (this.isShipUser(user)) {
            this.form.get('ship_id')?.disable();
          }
        }
        if (this.rowId) {
          this.getEditDataByRowId(this.rowId);
        }
        this.toastService.showError('Failed to load ships.');
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Handles everything dependent on the selected ship.
   */
  async handleShipChange(shipId: number | string): Promise<void> {
    const selectedShip = this.shipOptions.find(
      (ship) => String(ship.value) === String(shipId),
    );

    const classId = selectedShip?.classOfShip;

    if (!classId) {
      console.warn('No classOfShip found for selected ship_id:', shipId);

      this.strakesOptions = [];
      this.updateStrakeColumnOptions();

      this.loadCompartment(shipId);

      return;
    }

    // -------------------------------------------------------------------------
    // Load compartments
    // -------------------------------------------------------------------------

    this.loadCompartment(shipId);

    // -------------------------------------------------------------------------
    // Load strakes
    // -------------------------------------------------------------------------

    this.fetchStrakes(classId);

    // -------------------------------------------------------------------------
    // Load drawing
    // -------------------------------------------------------------------------

    try {
      const data = await this.getShellExpansionAndGaDrawing(Number(shipId));

      if (data) {
        this.shipDrawingData = data;
        this.isDrawingLoaded = true;
        this.drawingLoadFailed = false;
      } else {
        this.shipDrawingData = null;
        this.isDrawingLoaded = false;
        this.drawingLoadFailed = true;
      }
    } catch (error) {
      console.error('Error loading shell expansion / GA drawing:', error);

      this.shipDrawingData = null;
      this.isDrawingLoaded = false;
      this.drawingLoadFailed = true;
    }

    this.cdr.detectChanges();
  }

  /**
   * Clears data that depends on selected ship.
   */
  private clearShipDependentData(): void {
    this.compartmentOptions = [];
    this.strakesOptions = [];

    this.shipDrawingData = null;
    this.isDrawingLoaded = false;
    this.drawingLoadFailed = false;

    this.updateStrakeColumnOptions();
    this.updateCompartmentColumnOptions();

    this.cdr.detectChanges();
  }

  // ===========================================================================
  // COMPARTMENTS
  // ===========================================================================

  /**
   * Load compartments for the selected ship.
   *
   * IMPORTANT:
   * The compartment API is ship-specific.
   *
   * The result is converted into:
   *
   * {
   *   label: item.name,
   *   value: item.id
   * }
   *
   * and then assigned to the "compartment_name" table column.
   */
  loadCompartment(shipId: number | string, selectedIds: number[] = []): void {
    if (!shipId) {
      this.compartmentOptions = [];
      this.updateCompartmentColumnOptions();
      return;
    }

    this.masterService.getCompartments(shipId).subscribe({
      next: (res: any) => {
        this.compartmentOptions = (res?.data || []).map((item: any) => ({
          label: item.name,
          value: item.id,
        }));

        /**
         * Update the table dropdown options.
         */
        this.updateCompartmentColumnOptions();

        /**
         * This is useful if you later add a form-level
         * compartment_ids control.
         *
         * Currently the inspection table stores compartment_name,
         * so this will normally not be used.
         */
        if (selectedIds.length && this.form.get('compartment_ids')) {
          this.form.get('compartment_ids')?.setValue(selectedIds);
        }

        this.cdr.detectChanges();
      },

      error: (err) => {
        console.error('Error loading compartments:', err);

        this.compartmentOptions = [];

        this.updateCompartmentColumnOptions();

        this.toastService.showError('Failed to load compartments.');

        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Update only the compartment column.
   */
  private updateCompartmentColumnOptions(): void {
    this.inspectionColumns = this.inspectionColumns.map((column) =>
      column.field === 'compartment_name'
        ? {
            ...column,
            options: this.compartmentOptions,
          }
        : column,
    );
  }

  // ===========================================================================
  // SHELL EXPANSION / GA DRAWING
  // ===========================================================================

  async getShellExpansionAndGaDrawing(shipId: number): Promise<any | null> {
    try {
      /**
       * IMPORTANT:
       *
       * Previously this was hard-coded:
       *
       * ?ship_id=1&drawing=ga
       *
       * Now the actual selected ship ID is used.
       */
      const res = await firstValueFrom(
        this.apiService.getText(
          `${Apiendpoints.SHELL_EXPANSION_GA_DRAWING}?ship_id=${shipId}&drawing=ga`,
        ),
      );

      const jsonString = res
        .replace(/^const\s+SHIP_DATA\s*=\s*/, '')
        .replace(/;?\s*$/, '');

      return JSON.parse(jsonString);
    } catch (err) {
      console.error('Error fetching drawing data:', err);

      return null;
    }
  }

  // ===========================================================================
  // STRAKES
  // ===========================================================================

  fetchStrakes(classId: number): void {
    this.apiService
      .get(`${Apiendpoints.MASTER_STRAKES}?classofship_id=${classId}`)
      .subscribe({
        next: (res: any) => {
          this.strakesOptions = (res?.data || [])
            .filter((strike: any) => strike.active)
            .map((strike: any) => ({
              label: strike.strake_no,
              value: strike.id,
            }));

          this.updateStrakeColumnOptions();

          this.cdr.detectChanges();
        },

        error: (err) => {
          console.error('Error fetching strakes:', err);

          this.strakesOptions = [];

          this.updateStrakeColumnOptions();

          this.cdr.detectChanges();
        },
      });
  }

  /**
   * Update Strake/Deck dropdown options.
   */
  private updateStrakeColumnOptions(): void {
    this.inspectionColumns = this.inspectionColumns.map((column) =>
      column.field === 'strake_deck_no'
        ? {
            ...column,
            options: this.strakesOptions,
          }
        : column,
    );
  }

  // ===========================================================================
  // INSPECTION TABLE COLUMNS
  // ===========================================================================

  inspectionColumns: ReusableTableColumn[] = [
    {
      field: 's_no',
      header: 'Sr No.',
      width: '80px',
      align: 'center',
      template: 'serialNumberTpl',
    },

    {
      field: 'strake_deck_no',
      header: 'Strake/Deck No.',
      fieldType: 'drop-down',
      options: this.strakesOptions,
      width: '180px',
    },

    {
      field: 'compartment_name',
      header: 'Compartment Name',
      fieldType: 'drop-down',

      /**
       * IMPORTANT:
       *
       * Do NOT use hard-coded compartmentData here.
       *
       * This will be populated by loadCompartment().
       */
      options: this.compartmentOptions,

      width: '200px',
    },

    {
      field: 'port_stbd_cl',
      header: 'Port/Stbd/CL',
      fieldType: 'drop-down',
      options: [
        { label: 'Port', value: 'port' },
        { label: 'Stbd', value: 'stbd' },
        { label: 'CL', value: 'cl' },
      ],
      width: '180px',
    },

    {
      field: 'location_survey_frame_from',
      header: 'From',
      fieldType: 'number',
      width: '120px',
    },

    {
      field: 'location_survey_frame_to',
      header: 'To',
      fieldType: 'number',
      width: '120px',
    },

    {
      field: 'ot_mm',
      header: 'OT(mm)',
      fieldType: 'number',
      width: '120px',
    },

    {
      field: 'corrosion_extent',
      header: 'Extent of Corrosion/Pitting/Thinning',
      fieldType: 'select',
      options: [
        { label: 'A', value: 'A' },
        { label: 'B', value: 'B' },
        { label: 'C', value: 'C' },
      ],
      width: '220px',
    },

    {
      field: 't1',
      header: 'Average residual thickness outside pitted area(T1)',
      fieldType: 'select',
      options: [
        { label: 'A', value: 'A' },
        { label: 'B', value: 'B' },
        { label: 'C', value: 'C' },
      ],
      width: '220px',
    },

    {
      field: 't2',
      header: 'Average residual thickness of pitted area(T2)',
      fieldType: 'select',
      options: [
        { label: 'A', value: 'A' },
        { label: 'B', value: 'B' },
        { label: 'C', value: 'C' },
      ],
      width: '220px',
    },

    {
      field: 'mean_thickness',
      header: 'Mean Thickness',
      fieldType: 'text',
      width: '220px',
    },

    {
      field: 'percentage_reduction',
      header: '% reduction in thickness',
      fieldType: 'text',
      width: '220px',
    },

    {
      field: 'grading',
      header: 'Grading',
      fieldType: 'select',
      options: [
        { label: 'A', value: 'A' },
        { label: 'B', value: 'B' },
        { label: 'C', value: 'C' },
      ],
      width: '220px',
    },

    {
      field: 'defect',
      header: 'Defect (Yes/No)',
      fieldType: 'select',
      options: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ],
      width: '220px',
    },

    {
      field: 'type_of_defect',
      header: 'Type of Defect',
      fieldType: 'select',
      width: '220px',
      options: [
        { label: 'Undulation', value: 'undulation' },
        { label: 'Corrosion', value: 'corrosion' },
        { label: 'Pitting', value: 'pitting' },
        { label: 'Hole', value: 'hole' },
        { label: 'Thinning', value: 'thinning' },
        { label: 'Paint defect', value: 'paint_defect' },
        { label: 'Broken', value: 'broken' },
        { label: 'Crack', value: 'crack' },
        { label: 'Minor Pitting', value: 'minor_pitting' },
        {
          label: 'Minor Undulation',
          value: 'minor_undulation',
        },
        {
          label: 'Minor Corrosion',
          value: 'minor_corrosion',
        },
        { label: 'Dent', value: 'dent' },
      ],
    },

    {
      field: 'location_defect',
      header: 'Location Defect',
      fieldType: 'select',
      width: '220px',
      options: [
        { label: 'Deck', value: 'deck' },
        { label: 'Ship Side', value: 'ship_side' },
        {
          label: 'Fwd Bulkhead',
          value: 'fwd_bulkhead',
        },
        {
          label: 'Aft Bulkhead',
          value: 'aft_bulkhead',
        },
        { label: 'Deck Head', value: 'deck_head' },
        { label: 'Port Bld', value: 'port_bld' },
        { label: 'Stb Bld', value: 'stb_bld' },
      ],
    },

    {
      field: 'defect_frame_from',
      header: 'From',
      fieldType: 'number',
      width: '120px',
    },

    {
      field: 'defect_frame_to',
      header: 'To',
      fieldType: 'number',
      width: '120px',
    },

    {
      field: 'height_from_deck',
      header: 'Height from Deck (mm)',
      fieldType: 'number',
      width: '120px',
    },

    {
      field: 'structural_member_name',
      header: 'Name',
      fieldType: 'select',
      width: '220px',
      options: [
        {
          label: 'Deck Fittings',
          value: 'deck_fittings',
        },
        { label: 'Trunk', value: 'trunk' },
        { label: 'Plate', value: 'plate' },
        { label: 'Stiffner', value: 'stiffner' },
        { label: 'Foundation', value: 'foundation' },
        { label: 'Pipe', value: 'pipe' },
        { label: 'Dadeo', value: 'dadeo' },
        { label: 'Coaming', value: 'coaming' },
        { label: 'Bracket', value: 'bracket' },
      ],
    },

    {
      field: 'structural_member_description',
      header: 'Description',
      fieldType: 'select',
      width: '220px',
      options: [
        {
          label: 'Mushroom Head',
          value: 'mushroom_head',
        },
        { label: 'Plate', value: 'plate' },
        {
          label: 'Logitudinal Stiffner',
          value: 'logitudinal_stiffner',
        },
        { label: 'Port AC', value: 'port_ac' },
        {
          label: 'Breather Pipe',
          value: 'breather_pipe',
        },
        {
          label: 'Inside Dadeo',
          value: 'inside_dadeo',
        },
        {
          label: 'Hatch Coaming',
          value: 'hatch_coaming',
        },
        {
          label: 'Ship side bracket',
          value: 'ship_side_bracket',
        },
      ],
    },

    {
      field: 'repair_action_taken',
      header: 'Action Taken',
      fieldType: 'select',
      width: '220px',
      options: [
        {
          label: 'Permissible limit',
          value: 'permissible_limit',
        },
        { label: 'Renewed', value: 'renewed' },
        { label: 'Build Up', value: 'build_up' },
        { label: 'Welding', value: 'welding' },
      ],
    },

    {
      field: 'repair_frame_from',
      header: 'From',
      fieldType: 'number',
      width: '120px',
    },

    {
      field: 'repair_frame_to',
      header: 'To',
      fieldType: 'number',
      width: '120px',
    },

    {
      field: 'length_l',
      header: 'L',
      fieldType: 'number',
      width: '120px',
    },

    {
      field: 'breadth_b',
      header: 'B',
      fieldType: 'number',
      width: '120px',
    },
  ];

  // ===========================================================================
  // TABLE HEADERS
  // ===========================================================================

  inpectionHeaderRow: ReusableHeaderCell[][] = [
    [
      { header: 'Sr No.', rowspan: 3 },

      {
        header: 'Location of Survey',
        colspan: 6,
      },

      {
        header: 'Grading of Hull Structure',
        colspan: 6,
      },

      {
        header: 'Defect Description',
        colspan: 6,
      },

      {
        header: 'Repair Undertaken',
        colspan: 7,
      },
    ],

    [
      {
        header: 'Strake/Deck No.',
        rowspan: 2,
      },

      {
        header: 'Compartment Name',
        rowspan: 2,
      },

      {
        header: 'Port/Stbd/CL',
        rowspan: 2,
      },

      {
        header: 'Frame Station',
        colspan: 2,
      },

      {
        header: 'OT(mm)',
        rowspan: 2,
      },

      {
        header: 'Extent of Corrosion/Pitting/Thinning',
        rowspan: 2,
      },

      {
        header: 'Average residual thickness outside pitted area(T1)',
        rowspan: 2,
      },

      {
        header: 'Average residual thickness of pitted area(T2)',
        rowspan: 2,
      },

      {
        header: 'Mean Thickness',
        rowspan: 2,
      },

      {
        header: '% reduction in thickness',
        rowspan: 2,
      },

      {
        header: 'Grading',
        rowspan: 2,
      },

      {
        header: 'Defect (Yes/No)',
        rowspan: 2,
      },

      {
        header: 'Type of Defect',
        rowspan: 2,
      },

      {
        header: 'Location Defect',
        rowspan: 2,
      },

      {
        header: 'Frame Stn',
        colspan: 2,
      },

      {
        header: 'Height from Deck (mm)',
        rowspan: 2,
      },

      {
        header: 'Structural Members',
        colspan: 2,
      },

      {
        header: 'Action Taken',
        rowspan: 2,
      },

      {
        header: 'Frame',
        colspan: 2,
      },

      {
        header: 'Size(mm)',
        colspan: 2,
      },
    ],

    [
      { header: 'From' },
      { header: 'To' },

      { header: 'From' },
      { header: 'To' },

      { header: 'Name' },
      { header: 'Description' },

      { header: 'From' },
      { header: 'To' },

      { header: 'L' },
      { header: 'B' },
    ],
  ];

  // ===========================================================================
  // TABLE EVENTS
  // ===========================================================================

  onTableValueChanged(event: {
    index: number;
    field: string;
    value: any;
  }): void {
    this.handlePotentialTableChange(event.index, event.field, event.value);

    this.updateHullPotentialColumnVisibility();
  }

  /**
   * Existing method preserved.
   */
  updateHullPotentialColumnVisibility(): void {
    const actionColumn = this.inspectionColumns.find(
      (column) => column.field === 'action',
    );

    if (!actionColumn) {
      return;
    }

    const shouldShow = this.editMode;

    actionColumn.hidden = !shouldShow;

    this.inspectionColumns = [...this.inspectionColumns];
  }

  // ===========================================================================
  // APPROVAL WORKFLOW
  // ===========================================================================

  onApprovalPopupChange(open: boolean): void {
    this.showApprovalWorkflowPopup = open;
    this.cdr.detectChanges();
  }

  openApprovalWorkflow(): void {
    this.showApprovalWorkflowPopup = true;
    this.cdr.detectChanges();
  }

  // ===========================================================================
  // FORM VALIDATION
  // ===========================================================================

  isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);

    return field ? field.invalid && (field.dirty || field.touched) : false;
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();

      this.toastService.showError('Please fill all required fields correctly.');

      return false;
    }

    return true;
  }

  // ===========================================================================
  // TABLE INITIALIZATION
  // ===========================================================================

  initializeTableData(): void {
    this.updateInspectionRows(this.inspectionRows);
  }

  updateInspectionRows(count: number): void {
    const currentLength = this.inspectionData.length;

    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.inspectionData.push({
          s_no: i + 1,

          strake_deck_no: '',
          compartment_name: '',
          port_stbd_cl: '',

          location_survey_frame_from: null,
          location_survey_frame_to: null,
          ot_mm: null,

          corrosion_extent: '',
          t1: '',
          t2: '',
          mean_thickness: '',
          percentage_reduction: '',
          grading: '',

          defect: '',
          type_of_defect: '',
          location_defect: '',

          defect_frame_from: null,
          defect_frame_to: null,

          height_from_deck: null,

          structural_member_name: '',
          structural_member_description: '',

          repair_action_taken: '',

          repair_frame_from: null,
          repair_frame_to: null,

          length_l: null,
          breadth_b: null,
        });
      }
    } else if (count < currentLength) {
      this.inspectionData.splice(count);
    }
    this.inspectionData = [...this.inspectionData];
    this.cdr.detectChanges();
  }

  onInspectionRowChange(event: Event): void {
    const value = +(event.target as HTMLInputElement).value;
    if (isNaN(value) || value < 1) return;
    this.inspectionRows = Math.min(99, value);
    this.updateInspectionRows(this.inspectionRows);
  }

  // ===========================================================================
  // TABLE VALUE CHANGE
  // ===========================================================================

  handlePotentialTableChange(
    rowIndex: number,
    field: string,
    value: any,
  ): void {
    if (!this.inspectionData[rowIndex]) {
      return;
    }

    this.inspectionData[rowIndex][field] = value;

    this.updateFrameRanges();
    this.updateCompartment();
  }

  // ===========================================================================
  // FRAME RANGES
  // ===========================================================================

  updateFrameRanges(): void {
    this.frameRanges = this.inspectionData
      .filter(
        (row) =>
          row.defect_frame_from !== null &&
          row.defect_frame_from !== '' &&
          row.defect_frame_to !== null &&
          row.defect_frame_to !== '',
      )
      .map((row, index) => ({
        s: Number(row.defect_frame_from),
        e: Number(row.defect_frame_to),
        colorIndex: index,
      }));
  }

  // ===========================================================================
  // SELECTED COMPARTMENTS
  // ===========================================================================

  updateCompartment(): void {
    this.selectedCompartmentList = [
      ...new Set(
        this.inspectionData
          .filter(
            (row) =>
              row.compartment_name !== null &&
              row.compartment_name !== undefined &&
              row.compartment_name !== '',
          )
          .map((row) => row.compartment_name),
      ),
    ];
  }

  // ===========================================================================
  // TABLE ACTION
  // ===========================================================================

  handleTableAction(event: any): void {
    if (event.type === 'delete') {
      this.selectedRow = {
        ...event.row,
        table: event.table,
      };

      this.tableRowDeleteDialogOpen = true;
      this.selectedRowIndex = event.index;
    }
  }

  // ===========================================================================
  // EDIT / VIEW DATA
  // ===========================================================================

  getEditDataByRowId(rowId: string, openWorkflow: boolean = false): void {
    this.apiService
      .get(`${Apiendpoints.SHIP_STAFF_REPORT_ON_HULL_INSPECTION}${rowId}/`)
      .subscribe({
        next: (res: any) => {
          if (!res?.data) {
            return;
          }

          const data = res.data;

          // Store complete response
          this.editDataDetails = data;

          // ---------------------------------------------------------
          // Set main form
          // ---------------------------------------------------------

          const shipId = data?.ship?.id ?? data?.ship_id ?? '';

          this.form.patchValue({
            ship_id: shipId,
            year: data?.year ?? '',
            date_of_return: data?.date_of_return ?? '',
            quarter_ending: data?.quarter_ending ?? '',
          });

          // ---------------------------------------------------------
          // Set inspection table data
          // ---------------------------------------------------------

          const readings = Array.isArray(data?.hull_inspection_readings)
            ? data.hull_inspection_readings
            : [];

          this.inspectionData = readings.map((item: any, index: number) => ({
            id: item.id ?? index + 1,

            s_no: item.s_no ?? index + 1,

            // IMPORTANT:
            // Dropdown needs the ID, not "Boiler Room"
            compartment_name:
              item.compartment ?? this.getId(item.compartment_name) ?? '',

            // If strake_deck_no is an object, getId() handles it.
            strake_deck_no: this.getId(item.strake_deck_no) ?? '',

            port_stbd_cl: item.port_stbd_cl ?? '',

            location_survey_frame_from: item.location_survey_frame_from ?? null,

            location_survey_frame_to: item.location_survey_frame_to ?? null,

            ot_mm: item.ot_mm ?? null,

            corrosion_extent: item.corrosion_extent ?? '',

            t1: item.t1 ?? '',

            t2: item.t2 ?? '',

            mean_thickness: item.mean_thickness ?? '',

            percentage_reduction: item.percentage_reduction ?? '',

            grading: item.grading ?? '',

            defect: item.defect ?? '',

            type_of_defect: item.type_of_defect ?? '',

            location_defect: item.location_defect ?? '',

            defect_frame_from: item.defect_frame_from ?? null,

            defect_frame_to: item.defect_frame_to ?? null,

            height_from_deck: item.height_from_deck ?? null,

            structural_member_name: item.structural_member_name ?? '',

            structural_member_description:
              item.structural_member_description ?? '',

            repair_action_taken: item.repair_action_taken ?? '',

            repair_frame_from: item.repair_frame_from ?? null,

            repair_frame_to: item.repair_frame_to ?? null,

            length_l: item.length_l ?? null,

            breadth_b: item.breadth_b ?? null,
          }));

          // ---------------------------------------------------------
          // Set number of rows
          // ---------------------------------------------------------

          this.inspectionRows = Math.max(1, this.inspectionData.length);

          // ---------------------------------------------------------
          // Update derived data
          // ---------------------------------------------------------

          this.updateFrameRanges();
          this.updateCompartment();

          // ---------------------------------------------------------
          // Load dropdown options
          // ---------------------------------------------------------

          if (shipId) {
            this.loadCompartment(shipId);

            const classId = data?.ship?.classofship?.id;

            if (classId) {
              this.fetchStrakes(classId);
            }
          }

          if (openWorkflow) {
            this.openApprovalWorkflow();
          }

          this.cdr.detectChanges();
        },

        error: (err) => {
          console.error('Error fetching Hull Inspection Report data:', err);

          this.toastService.showError('Failed to load report details.');
        },
      });
  }
  /**
   * Safely get an ID from:
   *
   * 123
   * { id: 123 }
   * { value: 123 }
   */
  private getId(value: any): any {
    if (value && typeof value === 'object') {
      return value.id ?? value.value ?? null;
    }

    return value;
  }

  /**
   * Normalize compartment values in existing inspection data.
   *
   * This is useful when backend returns:
   *
   * compartment_name: { id: 10, name: 'Engine Room' }
   *
   * instead of:
   *
   * compartment_name: 10
   */
  private normalizeInspectionRow(item: any, index: number): any {
    return {
      ...item,

      id: item.id ?? index + 1,

      s_no: item.s_no ?? index + 1,

      compartment_name: this.getId(item.compartment_name),

      strake_deck_no: this.getId(item.strake_deck_no),
    };
  }

  /**
   * Patch API response into form/table.
   */
  patchFormData(data: any): void {
    // -------------------------------------------------------------------------
    // Extract inspection rows
    // -------------------------------------------------------------------------

    let inspectionDefects: any[] = [];

    if (Array.isArray(data?.observations?.inspection_defects)) {
      inspectionDefects = data.observations.inspection_defects;
    } else if (Array.isArray(data?.inspection_defects)) {
      inspectionDefects = data.inspection_defects;
    } else if (Array.isArray(data?.hull_inspection_readings)) {
      inspectionDefects = data.hull_inspection_readings;
    }

    if (inspectionDefects.length) {
      this.inspectionData = inspectionDefects.map((item: any, index: number) =>
        this.normalizeInspectionRow(item, index),
      );

      this.inspectionRows = this.inspectionData.length;
    } else {
      this.inspectionData = [];

      this.inspectionRows = 1;

      this.initializeTableData();
    }

    // -------------------------------------------------------------------------
    // Extract ship ID
    // -------------------------------------------------------------------------

    const shipId = this.getId(data?.ship_id ?? data?.ship);

    // -------------------------------------------------------------------------
    // Patch main form
    // -------------------------------------------------------------------------

    const formData = {
      ship_id: shipId ?? '',
      year: data?.year ?? '',
      date_of_return: data?.date_of_return ?? '',
      quarter_ending: data?.quarter_ending ?? data?.quarterEnding ?? '',
    };

    this.form.patchValue(formData, {
      emitEvent: true,
    });

    /**
     * emitEvent:true means the ship_id valueChanges subscription
     * will call:
     *
     * - loadCompartment(shipId)
     * - fetchStrakes(classId)
     * - getShellExpansionAndGaDrawing(shipId)
     */

    // -------------------------------------------------------------------------
    // Update derived table data
    // -------------------------------------------------------------------------

    this.updateFrameRanges();
    this.updateCompartment();

    // -------------------------------------------------------------------------
    // Make sure compartment dropdown is loaded.
    // -------------------------------------------------------------------------

    if (shipId) {
      this.loadCompartment(shipId);
    }

    this.cdr.detectChanges();
  }

  // ===========================================================================
  // CHECK EMPTY TABLE ROW
  // ===========================================================================

  isTableRowEmpty(item: any): boolean {
    return !(
      item?.strake_deck_no ||
      item?.compartment_name ||
      item?.port_stbd_cl ||
      item?.location_survey_frame_from ||
      item?.location_survey_frame_to ||
      item?.ot_mm ||
      item?.corrosion_extent ||
      item?.t1 ||
      item?.t2 ||
      item?.mean_thickness ||
      item?.percentage_reduction ||
      item?.grading ||
      item?.defect ||
      item?.type_of_defect ||
      item?.location_defect ||
      item?.defect_frame_from ||
      item?.defect_frame_to ||
      item?.height_from_deck ||
      item?.structural_member_name ||
      item?.structural_member_description ||
      item?.repair_action_taken ||
      item?.repair_frame_from ||
      item?.repair_frame_to ||
      item?.length_l ||
      item?.breadth_b
    );
  }

  // ===========================================================================
  // SAVE
  // ===========================================================================

  handleSave(draftStatus: 'draft' | 'save'): void {
    /**
     * Only full save requires validation.
     */
    if (draftStatus === 'save' && !this.validateForm()) {
      return;
    }

    if (draftStatus === 'save') {
      this.saveLoading = true;
    } else {
      this.draftLoading = true;
    }

    const formattableData = this.inspectionData
      .filter((item) => !this.isTableRowEmpty(item))
      .map((item, index) => ({
        ...item,
        s_no: index + 1,
        compartment: this.getId(item.compartment_name),
        strake_deck_no: this.getId(item.strake_deck_no),
      }));

    // -------------------------------------------------------------------------
    // Payload
    // -------------------------------------------------------------------------

    const payload = {
      ...this.form.getRawValue(),
      draft_status: draftStatus,
      hull_inspection_readings: formattableData,
    };

    if (this.editMode) {
      payload.id = this.editDataDetails.id;
    }

    // -------------------------------------------------------------------------
    // API
    // -------------------------------------------------------------------------

    this.apiService
      .post(Apiendpoints.SHIP_STAFF_REPORT_ON_HULL_INSPECTION, payload)
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
            res?.message || 'Quarterly hull survey request saved successfully',
          );

          // -------------------------------------------------------------------
          // FULL SAVE
          // -------------------------------------------------------------------

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
          }

          // -------------------------------------------------------------------
          // DRAFT
          // -------------------------------------------------------------------
          else {
            setTimeout(() => {
              this.router.navigate([
                '/ship/returns/ship-staff-hull-inspection-report',
              ]);
            }, 1000);
          }
        },

        error: (err) => {
          console.error('Failed to save Quarterly hull survey data:', err);

          this.toastService.showError(
            'Failed to save Quarterly hull survey data.',
          );
        },
      });
  }

  // ===========================================================================
  // CLEAR
  // ===========================================================================

  clear(): void {
    if (!confirm('Are you sure you want to clear all form data?')) {
      return;
    }

    this.form.reset();

    this.inspectionData = [];

    this.inspectionRows = 1;

    this.initializeTableData();

    this.editMode = false;
    this.viewMode = false;

    this.rowId = null;
    this.editDataDetails = null;

    this.compartmentOptions = [];
    this.strakesOptions = [];

    this.shipDrawingData = null;
    this.isDrawingLoaded = false;
    this.drawingLoadFailed = false;

    this.frameRanges = [];
    this.selectedCompartmentList = [];

    this.updateStrakeColumnOptions();
    this.updateCompartmentColumnOptions();

    this.toastService.showSuccess('Form has been cleared.');

    this.cdr.detectChanges();
  }

  // ===========================================================================
  // BACK
  // ===========================================================================

  handleBack(): void {
    this.router.navigate(['/ship/returns/ship-staff-hull-inspection-report']);
  }
}
