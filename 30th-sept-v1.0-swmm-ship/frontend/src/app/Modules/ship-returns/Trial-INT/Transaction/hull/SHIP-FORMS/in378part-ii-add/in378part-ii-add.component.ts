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
import { InputComponent } from '../../../../ui/input.component';
import { CalenderComponent } from '../../../../ui/calender.component';
import { finalize } from 'rxjs';
import { ReusableButtonComponent } from '../../../../ui/master-compat';
import { MonthYearCalendarComponent as YearPickerComponent } from '../../../../ui/month-year-calendar.component';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-in378part-ii-add',
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
    InputComponent,
    CalenderComponent,
    ReusableButtonComponent,
    YearPickerComponent,
    ApprovalWorkFlow,
  ],
  templateUrl: './in378part-ii-add.component.html',
})
export class In378partIIAddComponent implements OnInit {
  rowId: string | null = null;
  editDataDetails: any = null;
  showApprovalWorkflowPopup = false;
  editMode = false;
  viewMode = false;

  readonly draftIcon = Save;
  readonly saveIcon = SaveAllIcon;
  readonly restartIcon = RotateCcw;

  form!: FormGroup;
  saveLoading = false;
  draftLoading = false;

  commandOptions: any[] = [];
  shipOptions: any[] = [];
  clusterOptions: any[] = [];

  totalRows = 1;
  initialTotalRows = 1;

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

  ngOnInit(): void {
    this.buildForm();
    this.loadShips();
    this.loadClusters();
    this.updateReportTableRows(this.totalRows);

    this.rowId = this.route.snapshot.paramMap.get('id');
    const mode = this.route.snapshot.data['mode'];

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

  loadClusters() {
    this.masterService.getClusters().subscribe((res: any) => {
      this.clusterOptions = (res?.data || []).map((item: any) => ({
        label: item.name,
        value: item.id,
      }));

      this.updateClusterColumnOptions();
    });
  }

  updateClusterColumnOptions() {
    this.reportColumns = this.reportColumns.map((col) => {
      if (col.field === 'cluster') {
        return {
          ...col,
          options: this.clusterOptions,
        };
      }
      return col;
    });
  }

  reportColumns: ReusableTableColumn[] = [
    {
      field: 'sr_no',
      header: 'Sr No.',
      width: '70px',
      align: 'center' as const,
    },
    {
      field: 'approved_status',
      header: 'APT Status',
      fieldType: 'drop-down',
      options: [
        { label: 'SAT', value: 'sat' },
        { label: 'UNSAT', value: 'unsat' },
        { label: 'IN PROGRESS', value: 'in_progress' },
      ],
    },
    {
      field: 'cluster',
      header: 'Cluster Name',
      fieldType: 'drop-down',
      options: this.clusterOptions,
    },
    {
      field: 'date_of_initiation',
      header: 'Date of Initiation',
      fieldType: 'date',
    },
    {
      field: 'd_o_examination',
      header: 'Date of examination',
      fieldType: 'date',
    },
    {
      field: 'defect_discovered',
      header: 'Defect Discovered',
      fieldType: 'text',
    },
    {
      field: 'action_taken',
      header: 'Action Taken',
      fieldType: 'text',
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
          sr_no: i + 1,
          approved_status: '',
          cluster: '',
          date_of_initiation: '',
          d_o_examination: '',
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

  handleTableChange(index: number, field: string, value: any) {
    if (this.viewMode) return;
    this.reportData[index][field] = value;
  }

  buildForm() {
    this.form = this.fb.group({
      ship_id: ['', Validators.required],
      date_of_return: [''],
      period: [''],
      initiated_by: [''],
      year: [''],
    });
  }

  get opsTable(): FormArray {
    return this.form.get('opsTable') as FormArray;
  }

  getEditDataByRowId(rowId: string, openWorkflow: boolean = false) {
    this.apiService.get(`${Apiendpoints.IN_378_PART_II}${rowId}/`).subscribe({
      next: (res: any) => {
        if (!res?.data) return;

        const data = res.data;
        this.editDataDetails = data;

        const tableArray = data.in378_render_part2_table || data?.table;

        if (Array.isArray(tableArray) && tableArray.length > 0) {
          this.reportData = tableArray.map((item: any, index: number) => ({
            ...item,
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
          initiated_by: data.initiated_by || '',
          date_of_return: data.date_of_return || null,
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

  onApprovalPopupChange(open: boolean): void {
    this.showApprovalWorkflowPopup = open;
    this.cdr.detectChanges();
  }

  openApprovalWorkflow(): void {
    this.showApprovalWorkflowPopup = true;
    this.cdr.detectChanges();
  }

  handleBack() {
    this.router.navigate(['/ship/returns/in-378-part2']);
  }

  clear() {
    this.form.reset();
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  isRefitRowEmpty(item: any): boolean {
    return !(
      item?.approved_status ||
      item?.cluster ||
      item?.date_of_initiation ||
      item?.d_o_examination ||
      item?.defect_discovered ||
      item?.action_taken
    );
  }

  async handleSave(draftStatus: 'draft' | 'save' | 'clear') {
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
        sr_no: index + 1,
        approved_status: item?.approved_status,
        cluster: item?.cluster,
        date_of_initiation: item?.date_of_initiation,
        date_of_examination: item?.d_o_examination,
        defect_discovered: item?.defect_discovered,
        action_taken: item?.action_taken,
      }));

    payload.in378_render_part2_table = formatOPSTableData;

    if (this.editMode) {
      payload.id = this.editDataDetails?.id;
    }

    this.apiService
      .post(Apiendpoints.IN_378_PART_II, payload)
      .pipe(
        finalize(() => {
          this.saveLoading = false;
          this.draftLoading = false;
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.toastService.showSuccess(
            res?.message || 'IN-378 Part-2 request saved successfully',
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
              console.error(
                'In-378 part-II ID not found in API response:',
                res,
              );
              this.toastService.showError(
                'Record saved, but approval workflow could not be opened.',
              );
            }
          } else {
            setTimeout(() => {
              this.router.navigateByUrl('/ship/returns/in-378-part2');
            }, 1000);
          }
        },

        error: (err) => {
          console.error('Error in filling Returns', err);
          this.toastService.showError('Failed to save IN-378 part-2 data.');
        },
      });
  }
}

