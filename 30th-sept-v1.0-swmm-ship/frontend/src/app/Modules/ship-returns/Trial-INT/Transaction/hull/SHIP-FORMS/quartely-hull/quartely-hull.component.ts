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
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';
import { ReusableButtonComponent } from '../../../../ui/master-compat';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-quartely-hull',
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
    ApprovalWorkFlow,
    ReusableButtonComponent,
  ],
  templateUrl: './quartely-hull.component.html',
})
export class QuartelyHullSacrificalAnodesComponent implements OnInit {
  editMode = false;
  rowId: string | null = null;
  editDataDetails: any = null;
  showApprovalWorkflowPopup = false;

  user: any = null;
  LoggedInUser = '';

  readonly draftIcon = Save;
  readonly saveIcon = SaveAllIcon;
  readonly restartIcon = RotateCcw;
  readonly deleteIcon = Trash;

  draftLoading = false;
  saveLoading = false;

  form!: FormGroup;

  selectedRow: any = null;
  selectedRowIndex: number | null = null;
  selectedTable: 'firstTable' | 'forthTable' | null = null;
  tableRowDeleteDialogOpen = false;

  // Ship options from API
  shipOptions: any[] = [];

  // Table 1: Sacrificial Anodes Replaced During Last Docking
  anodesRows = 1;
  anodesData: any[] = [];
  anodeOptions = [
    { label: '02', value: '02' },
    { label: '03', value: '03' },
  ];
  portStbdOptions = [
    { label: 'Port', value: 'port' },
    { label: 'STBD', value: 'stbd' },
  ];
  referenceElectrodeOptions = [
    { label: 'PINC REFERENCE ELECTRODE', value: 'pinc_reference_electrode' },
    { label: 'UHrotruded type Zinc', value: 'uhrotruded_type_zinc' },
  ];
  quarterlyEndingOptions = [
    { label: 'MAR', value: 'march' },
    { label: 'JUN', value: 'june' },
    { label: 'SEP', value: 'september' },
    { label: 'DEC', value: 'december' },
  ];

  anodesColumns: ReusableTableColumn[] = [
    {
      field: 's_no',
      header: 'Sr No.',
      width: '20px',
      align: 'center' as const,
      template: 'serialNumberTpl',
    },
    {
      field: 'name',
      header: 'Port/STBD',
      width: '250px',
      fieldType: 'drop-down',
      options: this.portStbdOptions,
    },
    {
      field: 'from_location',
      header: 'From',
      width: '200px',
      fieldType: 'text',
    },
    {
      field: 'to_location',
      header: 'To',
      width: '200px',
      fieldType: 'text',
    },
    {
      field: 'replaced_during_last_docking',
      header: 'Replaced During Last Dry Docking',
      width: '200px',
      fieldType: 'drop-down',
      options: [
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ],
    },
    {
      field: 'remarks',
      header: 'Remarks',
      width: '200px',
      fieldType: 'textarea',
    },
  ];

  anodeHeaderRow: ReusableHeaderCell[][] = [
    [
      { header: 'Sr No.', rowspan: 2 },
      { header: 'Port/STBD', rowspan: 2 },
      { header: 'Location/Frame station', colspan: 2 },
      { header: 'Replaced During Last Dry Docking', rowspan: 2 },
      { header: 'Remarks', rowspan: 2 },
    ],
    [{ header: 'From' }, { header: 'To' }],
  ];

  // Table 2: Hull Potential Measurements
  potentialRows = 1;
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
      width: '250px',
      fieldType: 'date',
    },
    {
      field: 'time',
      header: 'Time',
      width: '150px',
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
      field: 'ship_berthed',
      header:
        'Ship berthed/ sailing. (If berthed alongside some other ship, then name of the ship)',
      width: '250px',
      fieldType: 'textarea',
    },
    {
      field: 'remarks',
      header: 'Remarks',
      width: '220px',
      fieldType: 'textarea',
    },
  ];

  potentialHeaderRow: ReusableHeaderCell[][] = [
    [
      { header: 'Sr No.', rowspan: 3 },
      { header: 'Date', rowspan: 3 },
      { header: 'Time', rowspan: 3 },
      { header: 'Hull potential in mill volts', colspan: 6 },
      {
        header:
          'Ship berthed/ sailing. (If berthed alongside some other ship, then name of the ship)',
        rowspan: 3,
      },
      { header: 'Remarks', rowspan: 3 },
    ],
    [
      { header: 'Forward (Frame Station)', colspan: 2 },
      { header: 'Midship (Frame Station)', colspan: 2 },
      { header: 'Aft (Frame Station)', colspan: 2 },
    ],
    [
      { header: 'Port' },
      { header: 'Stbd' },
      { header: 'Port' },
      { header: 'Stbd' },
      { header: 'Port' },
      { header: 'Stbd' },
    ],
  ];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private toastService: ToastService,
    @Inject(DOCUMENT) public document: Document,
    private masterService: MasterService,
    private cdr: ChangeDetectorRef,
  ) { }

  onApprovalPopupChange(open: boolean): void {
    this.showApprovalWorkflowPopup = open;
    this.cdr.detectChanges();
  }

  openApprovalWorkflow(): void {
    this.showApprovalWorkflowPopup = true;
    this.cdr.detectChanges();
  }

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

  ngOnInit(): void {
    this.buildForm();
    this.loadShips();
    this.initializeTableData();

    const user = this.getUser();
    if (user && this.isShipUser(user)) {
      this.LoggedInUser = 'Ship Staff';
    }

    this.route.paramMap.subscribe((params) => {
      this.rowId = params.get('id');
      if (this.rowId) {
        this.editMode = true;
        this.getEditDataByRowId(this.rowId);
      }
    });
  }

  buildForm(): void {
    this.form = this.fb.group({
      ship_id: ['', [Validators.required]],
      ship_last_undocked: ['', [Validators.required]],
      brief_details: [''],
      anti_corrosive_paint_renewed: [''],
      reference_electrode_used: [''],
      reference_electrode: [''],
      reference_electrode_last_calibrated: [''],
      type_of_sacrificial_anode: [''],
      date_of_return: ['', [Validators.required]],
      quarterly_ending: ['', [Validators.required]],
    });
  }

  // Load ships from API
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
          this.form.patchValue({
            ship_id: this.shipOptions[0].value,
          });
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

  // Helper method to check if field is invalid
  isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    return field ? field.invalid && (field.dirty || field.touched) : false;
  }

  initializeTableData(): void {
    this.updateAnodesRows(this.anodesRows);
    this.updatePotentialRows(this.potentialRows);
  }

  // Update anodes table rows
  updateAnodesRows(count: number): void {
    const currentLength = this.anodesData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.anodesData.push({
          s_no: i + 1,
          name: '',
          from_location: '',
          to_location: '',
          remarks: '',
          replaced_during_last_docking: '',
        });
      }
    } else if (count < currentLength) {
      this.anodesData.splice(count);
    }
    this.anodesData = [...this.anodesData];
    this.cdr.detectChanges();
  }

  // Update potential measurements table rows
  updatePotentialRows(count: number): void {
    const currentLength = this.potentialData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.potentialData.push({
          s_no: i + 1,
          date: '',
          time: '',
          forward_port: '',
          midship_port: '',
          midship_stbd: '',
          aft_port: '',
          aft_stbd: '',
          ship_berthed: '',
          remarks: '',
        });
      }
    } else if (count < currentLength) {
      this.potentialData.splice(count);
    }
    this.potentialData = [...this.potentialData];
    this.cdr.detectChanges();
  }

  updateAnodeActionColumnVisibility() {
    const actionColumn = this.anodesColumns.find((c) => c.field === 'action');

    if (!actionColumn) return;

    const shouldShow = this.editMode;

    actionColumn.hidden = !shouldShow;

    this.anodesColumns = [...this.anodesColumns];
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

  handleAnodeTableChange(rowIndex: number, field: string, value: any): void {
    this.anodesData[rowIndex][field] = value;
  }

  handlePotentialTableChange(
    rowIndex: number,
    field: string,
    value: any,
  ): void {
    this.potentialData[rowIndex][field] = value;
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
  // Handle row count changes for anodes table
  onAnodesRowChange(event: Event): void {
    const value = +(event.target as HTMLInputElement).value;
    this.anodesRows = Math.max(1, Math.min(99, value));
    this.updateAnodesRows(this.anodesRows);
  }

  // Handle row count changes for potential table
  onPotentialRowChange(event: Event): void {
    const value = +(event.target as HTMLInputElement).value;
    this.potentialRows = Math.max(1, Math.min(99, value));
    this.updatePotentialRows(this.potentialRows);
  }

  getEditDataByRowId(rowId: string, openWorkflow: boolean = false): void {
    this.apiService
      .get(
        `${Apiendpoints.QUARTERLY_HULL_POTENTIAL_FITTED_WITH_SACRIFICIAL_ANODES}${rowId}/`,
      )
      .subscribe({
        next: (res: any) => {
          // Handle both { data: {...} } wrapper and direct response
          const responseData = res?.data || res;
          if (responseData) {
            this.editDataDetails = responseData;
            this.patchFormData(responseData);
            if (openWorkflow) {
              this.openApprovalWorkflow();
            }
            this.cdr.detectChanges();
          }
        },
        error: (err) => {
          console.error('Error fetching Quarterly Hull data:', err);
          this.toastService.showError('Failed to load report details.');
        },
      });
  }

  patchFormData(data: any): void {
    // Resolve table arrays — API returns them at the top level
    const anodesArray =
      data.sacrificial_anodes_replaced ||
      data.observations?.sacrificial_anodes_replaced ||
      data.sacrificial_anodes_replaced_replaced;

    const potentialArray =
      data.hull_potential_sacrificial_anodes_readings ||
      data.observations?.hull_potential_sacrificial_anodes_readings ||
      data.quarterly_hull_potential_sacrificial_anodes_readings_readings;

    // Patch anodes table
    if (Array.isArray(anodesArray) && anodesArray.length > 0) {
      this.anodesData = anodesArray.map((item: any, index: number) => ({
        ...item,
        s_no: index + 1,
        id: item?.id,
      }));
      this.anodesRows = this.anodesData.length;
    }

    // Patch hull potential table
    if (Array.isArray(potentialArray) && potentialArray.length > 0) {
      this.potentialData = potentialArray.map((item: any, index: number) => ({
        ...item,
        s_no: index + 1,
        id: item?.id,
      }));
      this.potentialRows = this.potentialData.length;
    }

    // Extract ID if ship is returned as an object
    const shipValue =
      typeof data.ship === 'object' && data.ship !== null
        ? data.ship.id
        : data.ship;

    // Patch form values
    const formData = {
      ship_id: shipValue || '',
      ship_last_undocked: data.ship_last_undocked || '',
      brief_details: data.brief_details || '',
      anti_corrosive_paint_renewed: data.anti_corrosive_paint_renewed || '',
      reference_electrode_used: data.reference_electrode_used || '',
      reference_electrode: data.reference_electrode || '',
      type_of_sacrificial_anode: data.type_of_sacrificial_anode || '',
      reference_electrode_last_calibrated:
        data.reference_electrode_last_calibrated || '',
      quarterly_ending: data.quarterly_ending || '',
    };

    this.form.patchValue(formData);
  }

  closeDeleteDialog() {
    this.tableRowDeleteDialogOpen = false;
  }

  confirmDelete() {
    if (this.selectedTable === 'firstTable' && this.selectedRowIndex !== null) {
      this.anodesData.splice(this.selectedRowIndex, 1);
    }

    if (this.selectedTable === 'forthTable' && this.selectedRowIndex !== null) {
      this.potentialData.splice(this.selectedRowIndex, 1);
    }

    this.tableRowDeleteDialogOpen = false;
  }

  handleBack() {
    this.router.navigate([
      '/ship/returns/quarterly-hull-potential-with-sacrifical-anodes',
    ]);
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  // ------------------------ CHECKING EMPTY ROWS
  scrificalAnodeTableRemoveEmptyRows(item: any): boolean {
    return !(
      item?.name ||
      item?.from_location ||
      item?.to_location ||
      item?.remarks ||
      item?.replaced_during_last_docking
    );
  }
  hullPotentialTableRemoveEmptyRows(item: any): boolean {
    return !(
      item?.date ||
      item?.time ||
      item?.forward_port ||
      item?.forward_stbd ||
      item?.midship_port ||
      item?.midship_stbd ||
      item?.aft_port ||
      item?.aft_stbd ||
      item?.ship_berthed ||
      item?.remarks
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

    const scrificalAnodeTableFormattedData = this.anodesData
      .filter((item) => !this.scrificalAnodeTableRemoveEmptyRows(item))
      .map((item) => ({
        id: item?.id || null,
        name: item?.name,
        from_location: item?.from_location,
        to_location: item?.to_location,
        remarks: item?.remarks,
        replaced_during_last_docking: item?.replaced_during_last_docking,
      }));

    const hullPotentialTableFormattedData = this.potentialData
      .filter((item) => !this.hullPotentialTableRemoveEmptyRows(item))
      .map((item) => ({
        id: item?.id || null,
        date: item?.date,
        time: item?.time,
        forward_port: item?.forward_port,
        forward_stbd: item?.forward_stbd,
        midship_port: item?.midship_port,
        midship_stbd: item?.midship_stbd,
        aft_port: item?.aft_port,
        aft_stbd: item?.aft_stbd,
        ship_berthed: item?.ship_berthed,
        remarks: item?.remarks,
      }));

    const payload = {
      ...this.form.getRawValue(),
      draft_status: draftStatus,
      sacrificial_anodes_replaced: scrificalAnodeTableFormattedData,
      hull_potential_sacrificial_anodes_readings:
        hullPotentialTableFormattedData,
    };

    if (this.editMode) {
      payload.id = this.rowId;
    }

    this.apiService
      .post(
        Apiendpoints.QUARTERLY_HULL_POTENTIAL_FITTED_WITH_SACRIFICIAL_ANODES,
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
            'Quarterly Hull sacrificial anodes system data record saved successfully',
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
                '/ship/returns/quarterly-hull-potential-with-sacrifical-anodes',
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
      this.anodesRows = 1;
      this.potentialRows = 1;
      this.initializeTableData();
      this.toastService.showSuccess('Form has been cleared.');
    }
  }
}
