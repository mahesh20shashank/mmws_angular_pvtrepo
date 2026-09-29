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
  Trash,
} from '../../../../ui/lucide-compat';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ToastComponent } from '../../../../ui/master-compat';
import { SelectComponent as NewSelectComponent } from '../../../../ui/select.component';
import { MasterService } from '../../../../services/master.service';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { Apiendpoints } from '../../../../ApiEndPoints';
import { CalenderComponent } from '../../../../ui/calender.component';
import { InputComponent } from '../../../../ui/input.component';
import { RadioGroupComponent } from '../../../../ui/radio-group/radio-group.component';
import { ParameterCardComponent } from '../../../../ui/parameter-card/parameter-card.component';
import { FileUploadComponent } from '../../../../ui/file-upload/file-upload.component';
import { TextareaComponent } from '../../../../ui/textarea';
import { ReusableDeleteDialogDynamicContentComponent as ReusableDeleteDialogDynamicContent } from '../../../../ui/master-compat';
import {
  ReusableInputTableComponent,
  ReusableTableColumn,
} from '../../../../ui/reusable-input-table/reusable-input-table.component';
import { finalize } from 'rxjs';
import { MonthYearCalendarComponent as YearPickerComponent } from '../../../../ui/month-year-calendar.component';
import { ReusableButtonComponent } from '../../../../ui/master-compat';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-bhs-add-form',
  templateUrl: './bhs-add-form.html',
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
    RadioGroupComponent,
    FileUploadComponent,
    TextareaComponent,
    ReusableDeleteDialogDynamicContent,
    ReusableInputTableComponent,
    YearPickerComponent,
    ReusableButtonComponent,
    ApprovalWorkFlow,
  ],
})
export class BhsAddFormComponent implements OnInit {
  editMode = false;
  viewMode = false;

  rowId: string | null = null;
  editDataDetails: any = null;
  showApprovalWorkflowPopup = false;

  readonly draftIcon = Save;
  readonly saveIcon = SaveAllIcon;
  readonly restartIcon = RotateCcw;
  readonly deleteIcon = Trash;

  // Options
  boatRegistrationOptions: any[] = [];
  shipOptions: any[] = [];

  BerAberOptions: any[] = [
    { label: 'BER', value: 'ber' },
    { label: 'ABER', value: 'aber' },
    { label: 'SAT', value: 'sat' },
  ];

  satUnsatOptions: any[] = [
    { label: 'SAT', value: 'sat' },
    { label: 'UNSAT', value: 'unsat' },
  ];

  form!: FormGroup;
  saveLoading = false;
  draftLoading = false;

  // Table Configuration
  tableRows = 1;
  tableDetailsData: any[] = [];
  selectedRowIndex: number | null = null;
  tableRowDeleteDialogOpen = false;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private masterService: MasterService,
    private apiService: ApiService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  // =========================================================================
  // USER HELPERS
  // =========================================================================

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

  // =========================================================================
  // INIT
  // =========================================================================

  ngOnInit(): void {
    const mode = this.route.snapshot.data['mode'];
    this.rowId = this.route.snapshot.paramMap.get('id');

    this.buildForm();

    if (mode === 'view') {
      this.viewMode = true;
    } else if (mode === 'edit') {
      this.editMode = true;
    }

    this.listenToShipChanges();
    this.listenToBoatRegistrationChanges();

    this.loadShips();

    this.updateTableRows(this.tableRows);

    if (this.rowId) {
      this.getEditDataByRowId(this.rowId);
    }
  }

  // =========================================================================
  // FORM SETUP
  // =========================================================================

  buildForm() {
    this.form = this.fb.group({
      ship_id: [''],
      bhs_reg_no: [''],

      // Auto-populated boat details
      bhs_type_of_boat: [{ value: '', disabled: true }],
      bhs_engine_oem: [{ value: '', disabled: true }],
      bhs_boat_builder: [{ value: '', disabled: true }],
      bhs_built_year: [{ value: '', disabled: true }],
      bhs_date_of_supply: [{ value: '', disabled: true }],
      bhs_unit: [{ value: '', disabled: true }],
      bhs_date_reappropriation: [{ value: '', disabled: true }],
      bhs_sn_port: [{ value: '', disabled: true }],
      bhs_sn_stbd: [{ value: '', disabled: true }],
      bhs_sn_center: [{ value: '', disabled: true }],

      bhs_year_of_rendering: ['', Validators.required],
      bhs_ber_aber: ['', Validators.required],
      bhs_occ_of_rendering: ['', Validators.required],
      bhs_cond_of_hull: ['', Validators.required],
      bhs_cond_of_fittings: ['', Validators.required],
      bhs_cond_of_davit_lifting: ['', Validators.required],
      status_of_integrated_navigation: ['', Validators.required],

      // Speed Trials
      max_speed_during_current_trails: [''],
      max_rpm_during_current_trails: [''],
      max_speed_during_pdi_speed_trails: [''],
      max_rpm_during_pdi_speed_trails: [''],
      remedial_action_taken: [''],

      // Weighing of Boat
      weighing_undertaken_on: [''],
      weighing_location: [''],
      observed_weight: [''],
      pdi_trial_weight: [''],
      weight_remedial_action_taken: [''],
      major_repairs_since_last_return: [''],
      due_date_change_of_collar: [null],
      imo_certificate_validity: [null],
      assessment_board_remarks: [''],
      boardFormationAuthority: [null],
      boardMember1: [null],
      boardMember2: [null],
      boardPresident: [null],
      board_formation_authority: [null],
      board_member1: [null],
      board_member2: [null],
      board_president: [null],
    });
  }

  // =========================================================================
  // LISTENERS
  // =========================================================================

  listenToShipChanges() {
    this.form.get('ship_id')?.valueChanges.subscribe((shipId) => {
      if (!shipId) {
        this.boatRegistrationOptions = [];
        this.form.patchValue({ bhs_reg_no: '' }, { emitEvent: false });
        this.clearBoatDetails();
        return;
      }
      this.loadBoatRegistrationDetails(shipId);
    });
  }

  listenToBoatRegistrationChanges() {
    this.form.get('bhs_reg_no')?.valueChanges.subscribe((boatId) => {
      if (boatId) {
        this.setBoatDetails(boatId);
      } else {
        this.clearBoatDetails();
      }
    });
  }

  // =========================================================================
  // LOAD SHIPS
  // =========================================================================

  loadShips() {
    const user = this.getUser();
    this.apiService.get(Apiendpoints.MASTER_SHIP).subscribe({
      next: (res: any) => {
        this.shipOptions = (res?.results || res?.data || []).map((item: any) => ({
          label: item.name,
          value: item.id,
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
          this.form.patchValue({ ship_id: this.shipOptions[0].value });
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
        this.toastService.showError('Failed to load ships.');
        this.cdr.detectChanges();
      },
    });
  }

  // =========================================================================
  // LOAD BOAT REGISTRATION DETAILS BY SHIP
  // =========================================================================

  loadBoatRegistrationDetails(
    shipId: number | string,
    selectedBoatId?: number | string,
  ) {
    if (!shipId) {
      this.boatRegistrationOptions = [];
      return;
    }

    this.masterService.getBoatsRegistrationNumber(shipId).subscribe({
      next: (res: any) => {
        if (!res?.data || !Array.isArray(res.data) || res.data.length === 0) {
          this.boatRegistrationOptions = [
            {
              label: 'No boat found for this selected ship',
              value: null,
              disabled: true,
            },
          ];
          this.clearBoatDetails();
          this.cdr.detectChanges();
          return;
        }

        this.boatRegistrationOptions = res.data.map((item: any) => ({
          label:
            item.display_label ||
            `${item.boat_oem || ''} — ${item.registration_no || ''}`,
          value: item.id,
          data: item,
        }));

        if (selectedBoatId !== undefined && selectedBoatId !== null) {
          const selectedOption = this.boatRegistrationOptions.find(
            (option) => String(option.value) === String(selectedBoatId),
          );

          if (selectedOption) {
            this.form.patchValue(
              { bhs_reg_no: selectedOption.value },
              { emitEvent: false },
            );
            this.setBoatDetails(selectedOption.value);
          }
        }

        this.cdr.detectChanges();
      },

      error: (err) => {
        console.error('Error loading boat registration details:', err);
        this.boatRegistrationOptions = [];
        this.clearBoatDetails();
        this.toastService.showError(
          'Failed to load boat registration details.',
        );
        this.cdr.detectChanges();
      },
    });
  }

  // =========================================================================
  // SET / CLEAR BOAT DETAILS
  // =========================================================================

  setBoatDetails(boatId: number | string) {
    const selectedBoat = this.boatRegistrationOptions.find(
      (option) => String(option.value) === String(boatId),
    );

    if (!selectedBoat?.data) return;

    const data = selectedBoat.data;

    this.form.patchValue(
      {
        bhs_type_of_boat: data.type_of_boat || '',
        bhs_engine_oem: data.engine_oem || '',
        bhs_boat_builder: data.boat_builder || '',
        bhs_built_year: data.built_year || '',
        bhs_date_of_supply: data.date_of_supply || '',
        bhs_unit: data.unit_name || '',
        bhs_date_reappropriation: data.date_of_reappropriation || '',
        bhs_sn_port: data.engine_serial_p || '',
        bhs_sn_stbd: data.engine_serial_s || '',
        bhs_sn_center: data.engine_serial_c || '',
      },
      { emitEvent: false },
    );

    this.cdr.detectChanges();
  }

  clearBoatDetails() {
    this.form.patchValue(
      {
        bhs_type_of_boat: '',
        bhs_engine_oem: '',
        bhs_boat_builder: '',
        bhs_built_year: '',
        bhs_date_of_supply: '',
        bhs_unit: '',
        bhs_date_reappropriation: '',
        bhs_sn_port: '',
        bhs_sn_stbd: '',
        bhs_sn_center: '',
      },
      { emitEvent: false },
    );

    this.cdr.detectChanges();
  }

  // =========================================================================
  // TABLE COLUMNS & ROW ACTIONS
  // =========================================================================

  tableColumns: ReusableTableColumn[] = [
    {
      field: 's_no',
      header: 'Ser',
      width: '70px',
      align: 'center' as const,
    },
    {
      field: 'condition_engine',
      header: 'Condition of Engine',
      width: '110px',
      fieldType: 'drop-down',
      options: [
        { label: 'SAT', value: 'SAT' },
        { label: 'UNSAT', value: 'UNSAT' },
      ],
    },
    {
      field: 'total_running_hrs_since_last_return',
      header: 'Total Running HRS of Engine Run Since Last Return',
      template: 'inputTpl',
    },
    {
      field: 'major_routines_undertaken',
      header: 'Major Routines undertaken Since Last Return on Engine',
      template: 'inputTpl',
    },
    {
      field: 'access_remaining_engine_life',
      header: 'Assessed Remaining life of Engine - Years',
      template: 'inputTpl',
    },
  ];

  onTableDetailsRowChanges(event: Event): void {
    const value = +(event.target as HTMLInputElement).value;
    this.tableRows = Math.max(1, Math.min(99, value));
    this.updateTableRows(this.tableRows);
  }

  updateTableRows(count: number): void {
    const currentLength = this.tableDetailsData.length;

    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.tableDetailsData.push({
          s_no: i + 1,
          condition_engine: '',
          total_running_hrs_since_last_return: '',
          major_routines_undertaken: '',
          access_remaining_engine_life: '',
        });
      }
    } else if (count < currentLength) {
      this.tableDetailsData.splice(count);
    }
    this.tableDetailsData = [...this.tableDetailsData];
    this.cdr.detectChanges();
  }

  handleTableAction(event: any) {
    if (event.type === 'delete') {
      this.tableRowDeleteDialogOpen = true;
      this.selectedRowIndex = event.index;
    }
  }

  closeDeleteDialog() {
    this.tableRowDeleteDialogOpen = false;
  }

  confirmDelete() {
    if (this.selectedRowIndex !== null) {
      this.tableDetailsData.splice(this.selectedRowIndex, 1);
    }
    this.tableRowDeleteDialogOpen = false;
  }

  handleOpsTableChange(index: number, field: string, value: string) {
    if (this.viewMode) return;
    this.tableDetailsData[index][field] = value;
  }

  // =========================================================================
  // EDIT MODE
  // =========================================================================

  getEditDataByRowId(rowId: string, openWorkflow: boolean = false) {
    this.apiService
      .get(`${Apiendpoints.BOAT_HISTORY_SHEET}${rowId}/`)
      .subscribe({
        next: (res: any) => {
          if (!res?.data) return;

          const data = res.data;
          this.editDataDetails = data;

          if (openWorkflow) {
            this.openApprovalWorkflow();
          }

          const shipId = data.ship?.id || data.ship || '';
          const selectedBoatId = data.bhs_reg_no?.id || data.bhs_reg_no || '';

          this.form.patchValue(
            {
              ship_id: shipId,
              bhs_reg_no: selectedBoatId,
              bhs_year_of_rendering: data.bhs_year_of_rendering,
              bhs_ber_aber: data.bhs_ber_aber,
              bhs_occ_of_rendering: data.bhs_occ_of_rendering,
              bhs_cond_of_hull: data.bhs_cond_of_hull,
              bhs_cond_of_fittings: data.bhs_cond_of_fittings,
              bhs_cond_of_davit_lifting: data.bhs_cond_of_davit_lifting,
              status_of_integrated_navigation:
                data.status_of_integrated_navigation,
              max_speed_during_current_trails:
                data.max_speed_during_current_trails,
              max_rpm_during_current_trails: data.max_rpm_during_current_trails,
              max_speed_during_pdi_speed_trails:
                data.max_speed_during_pdi_speed_trails,
              max_rpm_during_pdi_speed_trails:
                data.max_rpm_during_pdi_speed_trails,
              remedial_action_taken: data.remedial_action_taken,
              weighing_undertaken_on: data.weighing_undertaken_on,
              weighing_location: data.weighing_location,
              observed_weight: data.observed_weight,
              pdi_trial_weight: data.pdi_trial_weight,
              weight_remedial_action_taken: data.weight_remedial_action_taken,
              major_repairs_since_last_return:
                data.major_repairs_since_last_return,
              due_date_change_of_collar: data.due_date_change_of_collar,
              imo_certificate_validity: data.imo_certificate_validity,
              assessment_board_remarks: data.assessment_board_remarks,
              boardFormationAuthority:
                data.board_formation_authority || data.boardFormationAuthority,
              boardMember1: data.board_member1 || data.boardMember1,
              boardMember2: data.board_member2 || data.boardMember2,
              boardPresident: data.board_president || data.boardPresident,
              board_formation_authority:
                data.board_formation_authority || data.boardFormationAuthority,
              board_member1: data.board_member1 || data.boardMember1,
              board_member2: data.board_member2 || data.boardMember2,
              board_president: data.board_president || data.boardPresident,
            },
            { emitEvent: false },
          );

          if (shipId) {
            this.loadBoatRegistrationDetails(shipId, selectedBoatId);
          }

          this.tableDetailsData = (data.engine_table_data || []).map(
            (item: any, index: number) => ({
              id: item.id,
              s_no: index + 1,
              condition_engine: item.condition_engine || '',
              total_running_hrs_since_last_return:
                item.total_running_hrs_since_last_return || '',
              major_routines_undertaken: item.major_routines_undertaken || '',
              access_remaining_engine_life:
                item.access_remaining_engine_life || '',
            }),
          );

          this.tableRows = this.tableDetailsData.length || 1;

          if (this.tableDetailsData.length === 0) {
            this.updateTableRows(1);
          }

          if (this.viewMode) {
            this.form.disable();
          }

          this.cdr.detectChanges();
        },

        error: (err) => {
          console.error('Failed to load Boat History Sheet:', err);
          this.toastService.showError('Failed to load Boat History Sheet.');
        },
      });
  }

  // =========================================================================
  // CLEAR HANDLER
  // =========================================================================

  clear() {
    this.form.reset();

    this.form.patchValue(
      {
        bhs_type_of_boat: '',
        bhs_engine_oem: '',
        bhs_boat_builder: '',
        bhs_built_year: '',
        bhs_date_of_supply: '',
        bhs_unit: '',
        bhs_date_reappropriation: '',
        bhs_sn_port: '',
        bhs_sn_stbd: '',
        bhs_sn_center: '',
      },
      { emitEvent: false },
    );

    this.boatRegistrationOptions = [];
    this.tableRows = 1;
    this.tableDetailsData = [];

    this.updateTableRows(this.tableRows);

    this.selectedRowIndex = null;
    this.tableRowDeleteDialogOpen = false;
    this.saveLoading = false;
    this.draftLoading = false;

    this.cdr.detectChanges();
  }

  // =========================================================================
  // APPROVAL WORKFLOW & NAVIGATION
  // =========================================================================

  onApprovalPopupChange(open: boolean): void {
    this.showApprovalWorkflowPopup = open;
    this.cdr.detectChanges();
  }

  openApprovalWorkflow(): void {
    this.showApprovalWorkflowPopup = true;
    this.cdr.detectChanges();
  }

  handleBack() {
    window.history.back();
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  uploadReferenceDocument(file: File, recordId: number, type: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('record_id', recordId.toString());
    formData.append('file_type', type);
    return this.apiService.post(Apiendpoints.DOCUMENT_UPLOAD, formData);
  }

  isTableRowsEmpty(item: any): boolean {
    return !(
      item?.condition_engine ||
      item?.total_running_hrs_since_last_return ||
      item?.major_routines_undertaken ||
      item?.access_remaining_engine_life
    );
  }

  // =========================================================================
  // SAVE
  // =========================================================================

  async handleSave(draftStatus: 'draft' | 'save') {
    if (draftStatus === 'save' && !this.validateForm()) {
      return;
    }

    if (draftStatus === 'save') {
      this.saveLoading = true;
    } else {
      this.draftLoading = true;
    }

    const formatedTableData = this.tableDetailsData
      .filter((item) => !this.isTableRowsEmpty(item))
      .map((item, index) => ({
        ...item,
        id: item?.id || null,
        s_no: index + 1,
      }));

    const formValues = this.form.getRawValue();

    const extractFileId = (val: any) => {
      if (!val) return null;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') return val;
      if (typeof val === 'object' && val.id) return val.id;
      return val;
    };

    const bfa = extractFileId(
      formValues.boardFormationAuthority || formValues.board_formation_authority,
    );
    const bm1 = extractFileId(
      formValues.boardMember1 || formValues.board_member1,
    );
    const bm2 = extractFileId(
      formValues.boardMember2 || formValues.board_member2,
    );
    const bp = extractFileId(
      formValues.boardPresident || formValues.board_president,
    );

    const payload: any = {
      draft_status: draftStatus,
      ...formValues,
      boardFormationAuthority: bfa,
      boardMember1: bm1,
      boardMember2: bm2,
      boardPresident: bp,
      board_formation_authority: bfa,
      board_member1: bm1,
      board_member2: bm2,
      board_president: bp,
      engine_table_data: formatedTableData,
    };

    if (this.editMode) {
      payload.id = this.editDataDetails.id;
    }

    this.apiService
      .post(Apiendpoints.BOAT_HISTORY_SHEET, payload)
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
            res?.message || 'Boat history sheet request saved successfully',
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
              this.router.navigate(['/ship/returns/boat-history-sheet']);
            }, 1000);
          }
        },

        error: (err) => {
          console.error('Boat History Sheet save error:', err);
          this.toastService.showError(
            'Failed to save Boat history sheet data.',
          );
        },
      });
  }
}
