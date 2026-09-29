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
import {
  ReusableInputTableComponent,
  ReusableTableColumn,
} from '../../../../ui/reusable-input-table/reusable-input-table.component';
import { ReusableButtonComponent } from '../../../../ui/master-compat';
import { InputComponent } from '../../../../ui/input.component';
import { CalenderComponent } from '../../../../ui/calender.component';
import { finalize } from 'rxjs';
import { MonthYearCalendarComponent as YearPickerComponent } from '../../../../ui/month-year-calendar.component';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-load-test-certificate-add',
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
    InputComponent,
    CalenderComponent,
    YearPickerComponent,
    ApprovalWorkFlow,
  ],
  templateUrl: './load-test-certificate-add.component.html',
})
export class LoadTestCertificateAddComponent implements OnInit {
  editMode = false;
  viewMode = false;
  rowId: string | null = null;
  editDataDetails: any = null;
  showApprovalWorkflowPopup = false;

  readonly draftIcon = Save;
  readonly saveIcon = SaveAllIcon;
  readonly restartIcon = RotateCcw;
  readonly deleteIcon = Trash;
  saveLoading = false;
  draftLoading = false;

  selectedRow: any = null;
  selectedRowIndex: number | null = null;
  tableRowDeleteDialogOpen = false;

  form!: FormGroup;
  loading = false;

  shipOptions: any[] = [];
  equipmentOptions: any[] = [];
  equipmentStatus: any[] = [
    { label: 'OPS', value: 'ops' },
    { label: 'NON-OPS', value: 'non_ops' },
  ];

  totalRows = 1;
  initialRowsCountInEditMode = 1;

  reportData: any[] = [];

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
    this.loadShips();
    this.updateReportTableRows(this.totalRows);
    this.loadEquipment();

    this.rowId = this.route.snapshot.paramMap.get('id');
    const mode = this.route.snapshot.data['mode'];

    if (this.rowId) {
      this.getEditDataByRowId(this.rowId);
    }
    if (this.rowId && mode === 'view') {
      this.viewMode = true;
      this.form.disable();
      this.totalRows = this.initialRowsCountInEditMode;
    } else if (mode === 'edit') {
      this.editMode = true;
    }

    if (this.viewMode) {
      this.form.disable();
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

  loadEquipment() {
    this.masterService.getEquipment().subscribe((res: any) => {
      this.equipmentOptions = (res?.data || []).map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
    });
  }

  reportColumns: ReusableTableColumn[] = [
    { field: 'sr_no', header: 'Ser', width: '70px', align: 'center' as const },
    {
      field: 'repairs_description',
      header: 'Repair Description',
      fieldType: 'text',
    },
  ];

  onReportRowChanges(event: Event) {
    const input = event.target as HTMLInputElement;
    let value = +input.value;
    if (this.editMode && value < this.initialRowsCountInEditMode) {
      value = this.initialRowsCountInEditMode;
      input.value = value.toString();
    }
    this.totalRows = value;
    this.updateReportTableRows(value);
  }

  updateReportTableRows(count: number) {
    const currentLength = this.reportData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.reportData.push({
          sr_no: i + 1,
          repairs_description: '',
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
    if (this.reportData[index]) {
      this.reportData[index][field] = value;
    }
    const rowGroup = this.repairsUndertaken.at(index) as FormGroup;
    if (rowGroup && rowGroup.get(field)) {
      rowGroup.get(field)?.setValue(value);
    }
  }

  handleTableAction(event: any) {
    if (event.type === 'delete') {
      this.selectedRow = {
        ...event.row,
        table: event.table,
      };
      this.tableRowDeleteDialogOpen = true;
      this.selectedRowIndex = event.index;
    }
  }

  buildForm() {
    this.form = this.fb.group({
      ship_id: ['', Validators.required],
      year: ['', Validators.required],
      equipment: ['', Validators.required],
      patt_no: ['', Validators.required],
      location: ['', Validators.required],
      mfg_date: ['', Validators.required],
      installation_date: [''],
      eqpt_status: ['', Validators.required],
      load_tested_date: ['', Validators.required],
      load_tested_due_date: [''],
      static: [''],
      running: [''],
      working: [''],
      proof: [''],
    });
  }

  get repairsUndertaken(): FormArray {
    return this.form.get('repairs_undertaken') as FormArray;
  }

  backButton() {
    this.router.navigate(['/ship/returns/load-test-certificate']);
  }

  getEditDataByRowId(rowId: string, openWorkflow: boolean = false) {
    this.apiService
      .get(`${Apiendpoints.LOAD_TEST_CERTIFICATE}${rowId}`)
      .subscribe({
        next: (res: any) => {
          if (res?.data) {
            this.editDataDetails = res.data;
            this.patchFormData(res.data);
            if (openWorkflow) {
              this.openApprovalWorkflow();
            }
          }
        },
        error: (err) => {
          console.error('Error fetching load test certificate data:', err);
          this.toastService.showError(
            'Failed to load test certificate details.',
          );
        },
      });
  }

  patchFormData(data: any): void {
    this.form.patchValue({
      ship_id: data?.ship?.id || data?.ship || '',
      year: data?.year || '',
      equipment: data?.equipment || '',
      patt_no: data?.patt_no || '',
      location: data?.location || '',

      mfg_date: data?.mfg_date || '',
      installation_date: data?.installation_date || '',

      eqpt_status: data?.eqpt_status || '',

      load_tested_date: data?.load_tested_date || '',
      load_tested_due_date: data?.load_tested_due_date || '',

      static: data?.static || '',
      running: data?.running || '',
      working: data?.working || '',
      proof: data?.proof || '',
    });

    if (data?.repairs_undertaken?.length) {
      this.reportData = data.repairs_undertaken.map(
        (item: any, index: number) => ({
          sr_no: index + 1,
          repairs_description: item?.repairs_description || '',
        }),
      );
      this.initialRowsCountInEditMode = this.reportData.length;
    } else {
      this.reportData = [];
      this.totalRows = 1;
      this.updateReportTableRows(1);
    }

    this.cdr.detectChanges();
  }

  handleBack() {
    this.router.navigate(['/ship/returns/load-test-certificate']);
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  clear() {
    this.form.reset();
  }

  async handleSave(draftStatus: 'draft' | 'save') {
    if (draftStatus === 'save' && !this.validateForm()) {
      return;
    }
    if (draftStatus === 'save') {
      this.saveLoading = true;
    } else {
      this.draftLoading = true;
    }

    const repairsTableData = this.reportData
      .filter((item) => item?.repairs_description)
      .map((item, index) => ({
        sr_no: index + 1,
        repairs_description: item.repairs_description,
      }));

    const formValues = this.form.getRawValue();

    const payload = {
      ...formValues,
      draft_status: draftStatus === 'save' ? 'approved' : 'draft',
      repairs_undertaken: repairsTableData,
    };

    if (this.editMode) {
      payload.id = this.rowId;
    }

    this.apiService
      .post(Apiendpoints.LOAD_TEST_CERTIFICATE, payload)
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
            res?.message || 'Load test certificate request saved successfully',
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
              this.router.navigate(['/ship/returns/load-test-certificate']);
            }, 1000);
          }
        },
        error: () => {
          this.toastService.showError(
            'Failed to save load test certificate data.',
          );
        },
      });
  }
}

