import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideAngularModule,
  RotateCcw,
  Save,
  SaveAllIcon,
} from '../../../../ui/lucide-compat';
import { MasterService } from '../../../../services/master.service';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { Apiendpoints } from '../../../../ApiEndPoints';
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ToastComponent } from '../../../../ui/master-compat';
import { SelectComponent as NewSelectComponent } from '../../../../ui/select.component';
import { InputComponent } from '../../../../ui/input.component';
import { FileUploadComponent } from '../../../../ui/file-upload/file-upload.component';
import { ReusableButtonComponent } from '../../../../ui/master-compat';
import { finalize } from 'rxjs';
import {
  ReusableInputTableComponent,
  ReusableTableColumn,
} from '../../../../ui/reusable-input-table/reusable-input-table.component';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';
import { CalenderComponent } from '../../../../ui/calender.component';

@Component({
  selector: 'app-in-305-new-add',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LucideAngularModule,
    LoadingButtonComponent,
    ToastComponent,
    NewSelectComponent,
    InputComponent,
    FileUploadComponent,
    ReusableButtonComponent,
    ReusableInputTableComponent,
    ApprovalWorkFlow,
    CalenderComponent,
  ],
  templateUrl: './in-305-new-add.html',
})
export class In305NewAdd implements OnInit {
  readonly draftIcon = Save;
  readonly saveIcon = SaveAllIcon;
  readonly restartIcon = RotateCcw;

  editMode = false;
  viewMode = false;
  rowId: string | null = null;
  editDataDetails: any = null;
  showApprovalWorkflowPopup = false;
  addButtonText = 'Add new record';

  form!: FormGroup;
  saveLoading = false;
  draftLoading = false;

  selectedShipStaffFile: File | null = null;
  selectedHodFile: File | null = null;

  shipOptions: any[] = [];
  forwardToOptions: any[] = [];
  dockYardOptions: any[] = [];

  totalRows = 1;
  tableData: any[] = [];

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
    const mode = this.route.snapshot.data['mode'];
    this.rowId = this.route.snapshot.paramMap.get('id');
    this.updateOpsTableRows(this.totalRows);

    this.editMode = mode === 'edit';
    this.viewMode = mode === 'view';

    this.loadShips();
    this.loadDockyard();

    if (this.rowId) {
      this.getFormDetailsByRowId(this.rowId);
    }

    if (this.viewMode) {
      this.form.disable();
    }
  }

  buildForm() {
    this.form = this.fb.group({
      ship_id: ['', Validators.required],
      date_of_return: ['', Validators.required],
      forward_to: ['', Validators.required],
    });
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

  clear() {
    this.form.reset();
  }

  loadDockyard() {
    this.masterService.getDockYards().subscribe((res: any) => {
      this.dockYardOptions = (res?.data || []).map((item: any) => ({
        label: item.name,
        value: item.id,
      }));

      this.tableColumns = this.tableColumns.map((col) => {
        if (col.field === 'dockyard') {
          return {
            ...col,
            options: this.dockYardOptions,
          };
        }
        return col;
      });

      this.cdr.detectChanges();
    });
  }

  onFileChange(file: File, type: 'shipStaff' | 'hod') {
    if (type === 'shipStaff') {
      this.selectedShipStaffFile = file;
    } else if (type === 'hod') {
      this.selectedHodFile = file;
    }
  }

  tableColumns: ReusableTableColumn[] = [
    { field: 's_no', header: 'Ser', width: '70px', align: 'center' as const },
    {
      field: 'chain_cable_fitting',
      header: 'Chain Cable and Gear Para vane Towing Chains and Fitting ',
      template: 'inputTpl',
      width: '350px',
    },
    {
      field: 'quantity',
      header: 'Quantity',
      template: 'inputTpl',
      width: '200px',
    },
    {
      field: 'thickness_weight',
      header: 'Thickness/Weight (Diameter)',
      template: 'inputTpl',
      width: '200px',
    },
    {
      field: 'initially_supplied_by',
      header: 'Initially Supplied By',
      template: 'inputTpl',
      width: '200px',
    },
    {
      field: 'initialy_supplied_on',
      header: 'Initially Supplied On',
      fieldType: 'date',
      width: '300px',
    },
    {
      field: 'dockyard',
      header: 'Dockyard Where Last Carried Out',
      fieldType: 'drop-down',
      options: this.dockYardOptions,
      width: '350px',
    },
    {
      field: 'dockyard_retest_date',
      header: 'Dockyard Retesting Date',
      fieldType: 'date',
      width: '200px',
    },
    {
      field: 'half_yearly_survey',
      header: 'Last survey date',
      fieldType: 'date',
      width: '200px',
    },
    {
      field: 'annealing',
      header: 'Annealing (if valid)',
      fieldType: 'date',
      width: '200px',
    },
  ];

  onOpsRowCountChange(event: Event) {
    const value = +(event.target as HTMLInputElement).value;
    this.totalRows = value;
    this.updateOpsTableRows(value);
  }

  updateOpsTableRows(count: number) {
    const currentLength = this.tableData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.tableData.push({
          s_no: i + 1,
          chain_cable_fitting: '',
          quantity: '',
          thickness_weight: '',
          initially_supplied_by: '',
          initialy_supplied_on: null,
          dockyard: '',
          dockyard_retest_date: null,
          half_yearly_survey: null,
          annealing: null,
        });
      }
    }
    if (count < currentLength) {
      this.tableData.splice(count);
    }
    this.tableData = [...this.tableData];
    this.cdr.detectChanges();
  }

  handleOpsTableChange(index: number, field: string, value: string) {
    if (this.viewMode) return;
    this.tableData[index][field] = value;
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
    this.router.navigate(['/ship/returns/in-305']);
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  getFormDetailsByRowId(rowId: string, openWorkflow: boolean = false) {
    this.apiService.get(`${Apiendpoints.IN_305}${rowId}/`).subscribe({
      next: (res: any) => {
        if (!res?.data) return;

        const data = res.data;
        this.editDataDetails = data;

        this.form.patchValue({
          ship_id: data.ship?.id || data.ship || data.ship_id || '',
          forward_to: data.forward_to || '',
          date_of_return: data.date_of_return || '',
        });

        this.tableData = (data.chain_data || []).map(
          (item: any, index: number) => ({
            id: item.id,
            s_no: index + 1,
            chain_cable_fitting: item.chain_cable_fitting || '',
            quantity: item.quantity || '',
            thickness_weight: item.thickness_weight || '',
            initially_supplied_by: item.initially_supplied_by || '',
            initialy_supplied_on: item.initially_supplied_on || null,
            dockyard: item.dockyard || '',
            dockyard_retest_date: item.dockyard_retest_date || null,
            half_yearly_survey: item.half_yearly_survey || null,
            annealing: item.annealing || null,
          }),
        );

        this.totalRows = this.tableData.length || 1;

        if (this.tableData.length === 0) {
          this.updateOpsTableRows(1);
        }

        if (openWorkflow) {
          this.openApprovalWorkflow();
        }

        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.toastService.showError('Failed to load data.');
      },
    });
  }

  isTableRowEmpty(item: any): boolean {
    return !(
      item?.chain_cable_fitting ||
      item?.quantity ||
      item?.thickness_weight ||
      item?.initially_supplied_by ||
      item?.initialy_supplied_on ||
      item?.dockyard ||
      item?.dockyard_retest_date ||
      item?.half_yearly_survey ||
      item?.annealing
    );
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

    const formattableData = this.tableData
      .filter((item) => !this.isTableRowEmpty(item))
      .map((item, index) => ({
        ...item,
        id: item?.id || null,
        s_no: index + 1,
      }));

    const formValues = this.form.getRawValue();

    const payload: any = {
      draft_status: draftStatus,
      ...formValues,
      chain_data: formattableData,
    };

    if (this.editMode) {
      payload.id = this.editDataDetails.id;
    }

    this.apiService
      .post(Apiendpoints.IN_305, payload)
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
            res?.message || 'In-305 request saved successfully',
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
              this.getFormDetailsByRowId(this.rowId, true);
            } else {
              this.toastService.showError(
                'Record saved, but approval workflow could not be opened.',
              );
            }
          } else {
            setTimeout(() => {
              this.router.navigate(['/ship/returns/in-305']);
            }, 1000);
          }
        },
        error: () => {
          this.toastService.showError('Failed to save In-305 data.');
        },
      });
  }
}

