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
} from '../../../../ui/lucide-compat';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ToastComponent } from '../../../../ui/master-compat';
import { SelectComponent as NewSelectComponent } from '../../../../ui/select.component';
import { MasterService } from '../../../../services/master.service';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { Apiendpoints } from '../../../../ApiEndPoints';
import {
  ReusableInputTableComponent,
  ReusableTableColumn,
} from '../../../../ui/reusable-input-table/reusable-input-table.component';
import { ReusableButtonComponent } from '../../../../ui/master-compat';
import { CalenderComponent } from '../../../../ui/calender.component';
import { RadioGroupComponent } from '../../../../ui/radio-group/radio-group.component';
import { InputComponent } from '../../../../ui/input.component';
import { finalize } from 'rxjs';
import { MonthYearCalendarComponent as YearPickerComponent } from '../../../../ui/month-year-calendar.component';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-in378part-i-add',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LucideAngularModule,
    LoadingButtonComponent,
    ToastComponent,
    NewSelectComponent,
    ReusableInputTableComponent,
    ReusableButtonComponent,
    CalenderComponent,
    InputComponent,
    YearPickerComponent,
    ApprovalWorkFlow,
  ],
  templateUrl: './in378part-i-add.component.html',
})
export class In378partIAddComponent implements OnInit {
  rowId: string | null = null;
  editDataDetails: any = null;
  showApprovalWorkflowPopup = false;
  editMode = false;
  viewMode = false;

  saveLoading = false;
  draftLoading = false;

  readonly draftIcon = Save;
  readonly saveIcon = SaveAllIcon;
  readonly restartIcon = RotateCcw;

  form!: FormGroup;
  loading = false;

  commandOptions: any[] = [];
  shipOptions: any[] = [];

  totalRows = 1;
  initialTotalRows = 1;

  reportData: any[] = [];
  compartmentOptions: any[] = [];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private masterService: MasterService,
    private apiService: ApiService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

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
    this.rowId = this.route.snapshot.paramMap.get('id');
    const mode = this.route.snapshot.data['mode'];
    this.buildForm();

    this.loadShips();
    this.loadCompartment();

    this.updateReportTableRows(this.totalRows);

    if (mode === 'view') {
      this.viewMode = true;
    } else if (mode === 'edit') {
      this.editMode = true;
    }

    if (this.rowId) {
      this.getEditDataByRowId(this.rowId);
    }
  }

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

  loadCompartment() {
    this.masterService.getCompartments().subscribe((res: any) => {
      this.compartmentOptions = (res?.data || []).map((item: any) => ({
        label: item.name,
        value: item.id,
      }));

      this.reportColumns = this.reportColumns.map((col) => {
        if (col.field === 'compartment') {
          return {
            ...col,
            options: this.compartmentOptions,
          };
        }
        return col;
      });
    });
  }

  reportColumns: ReusableTableColumn[] = [
    { field: 's_no', header: 'Ser', width: '70px', align: 'center' as const },
    {
      field: 'door_status',
      header: 'Status',
      fieldType: 'drop-down',
      options: [
        { label: 'SAT', value: 'sat' },
        { label: 'UNSAT', value: 'unsat' },
      ],
      width: '150px',
      required: true,
    },
    {
      field: 'type_of_door',
      header: 'Type of Door/Hatch',
      fieldType: 'drop-down',
      options: [
        { label: 'Door', value: 'door' },
        { label: 'Hatch', value: 'hatch' },
      ],
      width: '200px',
      required: true,
    },
    {
      field: 'compartment',
      header: 'Compartment',
      fieldType: 'drop-down',
      width: '250px',
      required: true,
    },
    {
      field: 'type_of_test_undertaken',
      header: 'Type of Test Undertaken',
      fieldType: 'text',
      width: '250px',
    },
    {
      field: 'date_of_chalk_test',
      header: 'Date of Chalk Test',
      fieldType: 'date',
      width: '250px',
    },
    {
      field: 'defect_discovered',
      header: 'Defect Discovered',
      fieldType: 'text',
      width: '250px',
      required: true,
    },
    {
      field: 'action_taken',
      header: 'Action Taken',
      fieldType: 'text',
      width: '250px',
      required: true,
    },
  ];

  onReportRowChanges(event: Event) {
    let value = +(event.target as HTMLInputElement).value;

    if (this.editMode && value < this.initialTotalRows) {
      value = this.initialTotalRows;
    }

    this.totalRows = value;
    this.updateReportTableRows(value);
  }

  updateReportTableRows(count: number) {
    const currentLength = this.reportData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.reportData.push({
          s_no: i + 1,
          door_status: '',
          type_of_door: '',
          compartment: '',
          type_of_test_undertaken: '',
          date_of_chalk_test: '',
          defect_discovered: '',
          action_taken: '',
        });
      }
    }

    if (count < currentLength) {
      this.reportData.splice(count);
    }
    this.reportData = [...this.reportData];
    this.cdr.detectChanges();
  }

  handleTableChange(index: number, field: string, value: string) {
    if (this.viewMode) return;
    this.reportData[index][field] = value;
  }

  buildForm() {
    this.form = this.fb.group({
      ship_id: ['', Validators.required],
      period: [''],
      year: [''],
      date_of_return: [''],
      initiated_by: [''],
    });
  }

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

  clear() {
    this.form.reset();
  }

  getEditDataByRowId(rowId: string, openWorkflow: boolean = false) {
    this.apiService.get(`${Apiendpoints.IN_378}${rowId}/`).subscribe({
      next: (res: any) => {
        if (!res?.data) return;

        const data = res.data;
        this.editDataDetails = data;

        const tableArray = data.in378_render_part1_table || data?.table;

        if (Array.isArray(tableArray) && tableArray.length > 0) {
          this.reportData = tableArray.map((item: any, index: number) => ({
            ...item,
            s_no: index + 1,
          }));
          this.totalRows = this.reportData.length;
          this.initialTotalRows = this.reportData.length;
        } else {
          this.updateReportTableRows(1);
        }

        const shipValue =
          typeof data.ship === 'object' && data.ship !== null
            ? data.ship.id
            : data.ship || '';

        this.form.patchValue({
          ship_id: shipValue,
          year: data.year || '',
          period: data.period || '',
          date_of_return: data.date_of_return || null,
          initiated_by: data.initiated_by || '',
        });

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
        this.toastService.showError('Failed to load details.');
      },
    });
  }

  validateReportTable(): boolean {
    const requiredColumns = this.reportColumns.filter((col) => col.required);

    for (let rowIndex = 0; rowIndex < this.reportData.length; rowIndex++) {
      const row = this.reportData[rowIndex];

      if (this.isRefitRowEmpty(row)) {
        continue;
      }

      for (const col of requiredColumns) {
        const value = row[col.field];

        if (value === null || value === undefined || value === '') {
          this.toastService.showError(
            `${col.header} is required in row ${rowIndex + 1}`,
          );
          return false;
        }
      }
    }

    return true;
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError(
        'Please fill all required fields in the form.',
      );
      return false;
    }

    if (!this.validateReportTable()) {
      return false;
    }

    return true;
  }

  isRefitRowEmpty(item: any): boolean {
    return !(
      item?.door_status ||
      item?.type_of_door ||
      item?.compartment ||
      item?.type_of_test_undertaken ||
      item?.date_of_chalk_test ||
      item?.defect_discovered ||
      item?.action_taken
    );
  }

  async handleSave(draftStatus: 'draft' | 'save') {
    if (draftStatus === 'save' && !this.validateForm()) {
      return;
    }

    this.saveLoading = draftStatus === 'save';
    this.draftLoading = draftStatus !== 'save';

    const formValues = this.form.getRawValue();

    const payload: any = {
      draft_status: draftStatus,
      ...formValues,
    };

    const formatOPSTableData = this.reportData
      .filter((item) => !this.isRefitRowEmpty(item))
      .map((item, index) => ({
        id: item?.id || null,
        s_no: index + 1,
        door_status: item?.door_status,
        type_of_door: item?.type_of_door,
        compartment: item?.compartment,
        type_of_test_undertaken: item?.type_of_test_undertaken,
        date_of_chalk_test: item?.date_of_chalk_test,
        defect_discovered: item?.defect_discovered,
        action_taken: item?.action_taken,
      }));

    payload.in378_render_part1_table = formatOPSTableData;

    if (this.editMode) {
      payload.id = this.editDataDetails?.id;
    }

    this.apiService
      .post(Apiendpoints.IN_378, payload)
      .pipe(
        finalize(() => {
          this.saveLoading = false;
          this.draftLoading = false;
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.toastService.showSuccess(
            res?.message || 'Returns filled successfully',
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
              console.error('In-378 part-I ID not found in API response:', res);
              this.toastService.showError(
                'Record saved, but approval workflow could not be opened.',
              );
            }
          } else {
            setTimeout(() => {
              this.router.navigateByUrl('/ship/returns/in-378-part1');
            }, 1000);
          }
        },

        error: (err) => {
          console.error('Error in filling Returns', err);
          this.toastService.showError('Error in filling Returns');
        },
      });
  }
}
