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
import {
  ReusableInputTableComponent,
  ReusableTableColumn,
} from '../../../../ui/reusable-input-table/reusable-input-table.component';
import { CalenderComponent } from '../../../../ui/calender.component';
import { ReusableButtonComponent } from '../../../../ui/master-compat';
import { finalize } from 'rxjs';
import { FileUploadComponent } from '../../../../ui/file-upload/file-upload.component';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-ship-weight-management-add',
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
    CalenderComponent,
    ReusableButtonComponent,
    FileUploadComponent,
    ApprovalWorkFlow,
  ],
  templateUrl: './ship-weight-management-add.component.html',
})
export class ShipWeightManagementAddComponent implements OnInit {
  editMode = false;
  viewMode = false;

  rowId: string | null = null;
  editDataDetails: any = null;
  addButtonText = 'Add new record';
  showApprovalWorkflowPopup = false;
  workflowTrialId: string = '';
  readonly draftIcon = Save;
  readonly saveIcon = SaveAllIcon;
  readonly restartIcon = RotateCcw;
  readonly deleteIcon = Trash;

  LoggedInUser = '';

  form!: FormGroup;

  saveLoading = false;
  draftLoading = false;

  commandOptions: any[] = [];
  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  refitStatusOptions: any[] = [];

  selectedFile: File | null = null;
  activeTab = 'draft';

  totalRowsOps = 1;
  totalRowsRefit = 1;
  totalRowsOpsInEditMode = 1;
  totalRowsRefitInEditMode = 1;

  opsTableData: any[] = [];
  refitTableData: any[] = [];

  shipStatusOptions = [
    { label: '--Select--', value: '' },
    { label: 'OPS', value: 'ops' },
    { label: 'REFIT', value: 'refit' },
  ];

  OPSColumns: ReusableTableColumn[] = [
    { field: 's_no', header: 'Ser', width: '70px', align: 'center' as const },
    {
      field: 'lightship_displacement',
      header: 'Lightship Disp as Per Inclining Exp/ Stability Booklet',
      template: 'inputTpl',
    },
    {
      field: 'ref_load_condition',
      header: 'Reference Load Condition (Deep / Light / Lightship)',
      template: 'inputTpl',
    },
    {
      field: 'disp_c',
      header: 'Disp (C)',
      template: 'inputTpl',
    },
    {
      field: 'disp_d',
      header: 'Disp (D)',
      template: 'inputTpl',
    },
    {
      field: 'net_diff',
      header: 'Net Diff in Liquid & Stores (C-D)',
      template: 'inputTpl',
    },
    {
      field: 'corrected_disp',
      header: 'Corrected Disp (E-C)',
      template: 'inputTpl',
    },
    {
      field: 'net_increase',
      header: 'Net Increase in Disp (E-A)',
      template: 'inputTpl',
    },
    {
      field: 'percentage_increase',
      header: '% Increase in Disp',
      template: 'inputTpl',
    },
    {
      field: 'net_weight_add',
      header: 'Net Weight Addition',
      template: 'inputTpl',
    },
    {
      field: 'net_kg_add',
      header: 'Net KG Addition',
      template: 'inputTpl',
    },
  ];

  RefitColumns: ReusableTableColumn[] = [
    { field: 's_no', header: 'Ser', width: '70px', align: 'center' as const },
    {
      field: 'lightship_displacement',
      header: 'Lightship Disp (A)',
      template: 'inputTpl',
    },
    {
      field: 'wght_change_prior_refit',
      header: 'Weight change prior refit',
      template: 'inputTpl',
    },
    {
      field: 'net_wght_change_refit',
      header: 'Net weight change during refit',
      template: 'inputTpl',
    },
    {
      field: 'net_kg',
      header: 'Net KG',
      template: 'inputTpl',
    },
  ];

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
    const user = this.getUser();
    if (user && this.isShipUser(user)) {
      this.LoggedInUser = 'Ship Staff';
    }

    this.buildForm();
    this.loadShips();
    this.loadCommands();
    this.loadClasses();
    this.listenToCommandAndClassChanges();
    this.handleDependentDropdowns();

    this.updateOpsTableRows(this.totalRowsOps);
    this.updateRefitTableRows(this.totalRowsRefit);

    const mode = this.route.snapshot.data['mode'];

    this.editMode = mode === 'edit';
    this.viewMode = mode === 'view';
    this.rowId = this.route.snapshot.paramMap.get('id');

    if (this.rowId) {
      this.getFormDetailsByRowId(this.rowId);
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
          this.form.patchValue({ ship: user.ship_id });
          this.form.get('ship')?.disable();
        } else if (user?.ship_id && !this.rowId) {
          this.form.patchValue({ ship: user.ship_id });
        } else if (this.shipOptions.length === 1 && !this.rowId) {
          this.form.patchValue({
            ship: this.shipOptions[0].value,
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
          this.form.patchValue({ ship: user.ship_id });
          if (this.isShipUser(user)) {
            this.form.get('ship')?.disable();
          }
        }
        this.toastService.showError('Failed to load ships.');
        this.cdr.detectChanges();
      },
    });
  }

  loadCommands() {
    this.masterService.getCommands().subscribe((res: any) => {
      this.commandOptions = (res?.data || []).map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
    });
  }

  loadClasses() {
    this.masterService.getClasses().subscribe((res: any) => {
      this.classOfShipOptions = (res?.data || []).map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
    });
  }

  listenToCommandAndClassChanges() {
    this.form.get('command')!.valueChanges.subscribe((cmdId) => {
      if (!cmdId) return;
      this.masterService.getShipsByCommand(cmdId).subscribe((res: any) => {
        this.shipOptions = (res?.data || []).map((item: any) => ({
          label: item.name,
          value: item.id,
        }));
      });
    });

    this.form.get('class_of_ship')!.valueChanges.subscribe((classId) => {
      if (!classId) return;
      this.masterService.getShipsByClass(classId).subscribe((res: any) => {
        this.shipOptions = (res?.data || []).map((item: any) => ({
          label: item.name,
          value: item.id,
        }));
      });
    });
  }

  updateOpsTableRows(count: number) {
    const currentLength = this.opsTableData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.opsTableData.push({
          s_no: i + 1,
          lightship_displacement: '',
          ref_load_condition: '',
          disp_c: '',
          disp_d: '',
          net_diff: '',
          corrected_disp: '',
          net_increase: '',
          percentage_increase: '',
          net_weight_add: '',
          net_kg_add: '',
        });
      }
    }
    if (count < currentLength) {
      this.opsTableData.splice(count);
    }
    this.opsTableData = [...this.opsTableData];
    this.cdr.detectChanges();
  }

  handleOpsTableChange(index: number, field: string, value: string) {
    if (this.viewMode) return;
    this.opsTableData[index][field] = value;
  }

  onOpsRowCountChange(event: Event) {
    let value = +(event.target as HTMLInputElement).value;
    if (isNaN(value) || value < 1) return;
    if (this.editMode) {
      value = Math.max(value, this.totalRowsOpsInEditMode);
    }
    this.totalRowsOps = Math.min(99, value);
    this.updateOpsTableRows(this.totalRowsOps);
  }

  onRefitRowCountChange(event: Event) {
    let value = +(event.target as HTMLInputElement).value;
    if (isNaN(value) || value < 1) return;
    if (this.editMode) {
      value = Math.max(value, this.totalRowsRefitInEditMode);
    }
    this.totalRowsRefit = Math.min(99, value);
    this.updateRefitTableRows(this.totalRowsRefit);
  }

  updateRefitTableRows(count: number) {
    const currentLength = this.refitTableData.length;
    if (count > currentLength) {
      for (let i = currentLength; i < count; i++) {
        this.refitTableData.push({
          s_no: i + 1,
          lightship_displacement: '',
          wght_change_prior_refit: '',
          net_wght_change_refit: '',
          net_kg: '',
        });
      }
    }
    if (count < currentLength) {
      this.refitTableData.splice(count);
    }
    this.refitTableData = [...this.refitTableData];
    this.cdr.detectChanges();
  }

  handleRefitTableChange(index: number, field: string, value: string) {
    if (this.viewMode) return;
    this.refitTableData[index][field] = value;
  }

  buildForm() {
    this.form = this.fb.group({
      command: [''],
      class_of_ship: [''],
      ship: ['', Validators.required],
      ship_status: ['', Validators.required],
      refit_status: [''],
      refit_date: [null],
      date_of_return: [null],
      ref_auth: [''],
    });
  }

  loadRefits() {
    this.masterService.getRefits().subscribe((res: any) => {
      this.refitStatusOptions = (res?.data || []).map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
    });
  }

  onFileChange(file: File) {
    this.selectedFile = file;
  }

  clear() {
    this.form.reset();
    this.selectedFile = null;
  }

  handleDependentDropdowns() {
    this.form.get('ship_status')!.valueChanges.subscribe((status) => {
      if (status === 'refit') {
        this.loadRefits();
        this.form.get('refit_status')!.setValidators(Validators.required);
        this.form.get('refit_date')!.setValidators(Validators.required);
      } else {
        this.form.get('refit_status')!.clearValidators();
        this.form.get('refit_date')!.clearValidators();
      }
      this.form.get('refit_status')!.updateValueAndValidity();
      this.form.get('refit_date')!.updateValueAndValidity();
    });
  }

  getFormDetailsByRowId(rowId: string, openWorkflow: boolean = false) {
    this.apiService
      .get(`${Apiendpoints.SHIP_WEIGHT_MANAGEMENT}${rowId}/`)
      .subscribe({
        next: (res: any) => {
          if (res?.data) {
            this.editDataDetails = res.data;

            const classId = this.editDataDetails?.ship?.classofship?.id;
            const shipId = this.editDataDetails?.ship?.id;

            this.form.patchValue(
              {
                command: this.editDataDetails?.ship?.command?.id,
                class_of_ship: classId,
              },
              { emitEvent: false },
            );

            this.masterService.getShipsByClass(classId).subscribe((res: any) => {
              this.shipOptions = (res?.data || []).map((item: any) => ({
                label: item.name,
                value: item.id,
              }));

              this.form.patchValue({
                ship: shipId,
                ship_status:
                  this.editDataDetails?.ship_status === 'refit'
                    ? 'refit'
                    : this.editDataDetails?.ship_status === 'ops'
                      ? 'ops'
                      : '',
                refit_status: this.editDataDetails?.refit?.id,
                refit_date: this.editDataDetails?.refit_recommencement_date
                  ? new Date(this.editDataDetails.refit_recommencement_date)
                  : null,
              });

              if (this.editDataDetails.ship_weight_management_ops) {
                const opsData = this.editDataDetails.ship_weight_management_ops;

                this.opsTableData = opsData.map((item: any, index: number) => ({
                  id: item.id || null,
                  s_no: index + 1,
                  lightship_displacement: item.lightship_displacement || '',
                  ref_load_condition: item.ref_load_condition || '',
                  disp_c: item.disp_c || '',
                  disp_d: item.disp_d || '',
                  net_diff: item.net_diff || '',
                  corrected_disp: item.corrected_disp || '',
                  net_increase: item.net_increase || '',
                  percentage_increase: item.percentage_increase || '',
                  net_weight_add: item.net_weight_add || '',
                  net_kg_add: item.net_kg_add || '',
                }));

                this.totalRowsOps = this.opsTableData.length || 1;
                this.totalRowsOpsInEditMode = this.totalRowsOps;
                this.updateOpsTableRows(this.totalRowsOps);
              }

              if (this.editDataDetails.ship_weight_management_refit) {
                const refitData =
                  this.editDataDetails.ship_weight_management_refit;

                this.refitTableData = refitData.map(
                  (item: any, index: number) => ({
                    id: item.id || null,
                    s_no: index + 1,
                    lightship_displacement: item.lightship_displacement || '',
                    wght_change_prior_refit: item.wght_change_prior_refit || '',
                    net_wght_change_refit: item.net_wght_change_refit || '',
                    net_kg: item?.net_kg || '',
                  }),
                );

                this.totalRowsRefit = this.refitTableData.length || 1;
                this.totalRowsRefitInEditMode = this.totalRowsRefit;
                this.updateRefitTableRows(this.totalRowsRefit);
              }

              if (openWorkflow) {
                this.openApprovalWorkflow();
              }
              this.cdr.detectChanges();
            });
          }
        },
        error: (err) => {
          console.error(err);
          this.toastService.showError('Failed to load data.');
        },
      });
  }

  handleBack() {
    window.history.back();
  }

  backButton() {
    this.handleBack();
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError(
        'Please fill all required fields correctly marked as * .',
      );
      return false;
    }
    return true;
  }

  private validateDraftForm(): boolean {
    const requiredFields = ['ship', 'ship_status'];
    let isValid = true;

    requiredFields.forEach((field) => {
      const control = this.form.get(field);
      if (!control || !control.value) {
        control?.markAsTouched();
        isValid = false;
      }
    });

    if (!isValid) {
      this.toastService.showError(
        'Please select Ship Name and Ship Status before saving draft.',
      );
    }
    return isValid;
  }

  isOPSRowsEmpty(item: any): boolean {
    return !(
      item?.lightship_displacement ||
      item?.ref_load_condition ||
      item?.disp_c ||
      item?.disp_d ||
      item?.net_diff ||
      item?.corrected_disp ||
      item?.net_increase ||
      item?.percentage_increase ||
      item?.net_weight_add ||
      item?.net_kg_add
    );
  }

  isRefitRowEmpty(item: any): boolean {
    return !(
      item?.lightship_displacement ||
      item?.wght_change_prior_refit ||
      item?.net_wght_change_refit ||
      item?.net_kg
    );
  }

  uploadReferenceDocument(file: File, recordId: string) {
    const formData = new FormData();
    formData.append('file_type', 'ref_auth');
    formData.append('form_master_name', 'ship_weight_management');
    formData.append('record_id', recordId);
    formData.append('file', file);

    return this.apiService.post(Apiendpoints.DOCUMENT_UPLOAD, formData);
  }

  async handleSave(draftStatus: 'draft' | 'save') {
    if (draftStatus === 'save' && !this.validateForm()) {
      return;
    }
    if (draftStatus === 'draft' && !this.validateDraftForm()) {
      return;
    }
    if (draftStatus === 'save') {
      this.saveLoading = true;
    } else {
      this.draftLoading = true;
    }

    const formatOPSTableData = this.opsTableData
      .filter((item) => !this.isOPSRowsEmpty(item))
      .map((item, index) => ({
        ...item,
        id: item?.id || null,
        s_no: index + 1,
      }));
    const formatRefitTableData = this.refitTableData
      .filter((item) => !this.isRefitRowEmpty(item))
      .map((item, index) => ({
        ...item,
        id: item?.id || null,
        s_no: index + 1,
      }));

    const formValues = this.form.getRawValue();

    const payload: any = { draft_status: draftStatus, ...formValues };

    if (formValues.ship_status === 'ops') {
      payload.ship_weight_management_ops = formatOPSTableData;
    } else {
      payload.ship_weight_management_refit = formatRefitTableData;
      payload.refit = formValues.refit_status;
      payload.refit_recommencement_date = formValues.refit_date
        ? new Date(formValues.refit_date).toISOString().split('T')[0]
        : null;
      payload.ref_auth = formValues?.ref_auth?.id || formValues?.ref_auth;
    }

    if (this.editMode) {
      payload.id = this.editDataDetails.id;
    }

    this.apiService
      .post(Apiendpoints.SHIP_WEIGHT_MANAGEMENT, payload)
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
            res?.message || 'Ship weight management request saved successfully',
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
              this.router.navigate(['/ship/returns/ship-weight-management']);
            }, 1000);
          }
        },
        error: () => {
          this.toastService.showError(
            'Failed to save Ship weight management data.',
          );
        },
      });
  }
}
