import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import { MasterService } from '../../../../services/master.service';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { Apiendpoints } from '../../../../ApiEndPoints';
import {
  LucideAngularModule,
  PenIcon,
  RotateCcw,
  Save,
  SaveAllIcon,
} from '../../../../ui/lucide-compat';
// @ts-ignore
import QRCode from 'qrcode';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ToastComponent } from '../../../../ui/master-compat';
import { SelectComponent as NewSelectComponent } from '../../../../ui/select.component';
import { InputComponent } from '../../../../ui/input.component';
import { FileUploadComponent } from '../../../../ui/file-upload/file-upload.component';
import { ReusableButtonComponent } from '../../../../ui/master-compat';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';
import { finalize } from 'rxjs';
import { TabStateService } from '../../../../services/tab-state.service';
import { StorageService } from '../../../../services/storage.service';

interface CurrentUser {
  first_name: string;
  last_name: string;
  user_id: number;
  role: string;
}

interface SignatureData {
  user_id?: number;
  first_name?: string;
  last_name?: string;
  role?: string;
  rankName?: string;
  hrcdf_designation?: string;
  directorate?: string;
  hrcdf_desig?: string;
  designation?: string;
  rank?: string;
  unit?: { name?: string };
  qr_code?: string;
  signed_at?: string | null;
}

@Component({
  standalone: true,
  selector: 'app-ber-certificate-add',
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
    ApprovalWorkFlow,
  ],
  templateUrl: './ber-certificate-add.component.html',
})
export class BerCertificateAddComponent implements OnInit {
  form!: FormGroup;
  saveLoading = false;
  draftLoading = false;

  editMode = false;
  viewMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
  isApprover: boolean = true;
  showApprovalWorkflowPopup = false;
  workflowTrialId: string = '';
  readonly draftIcon = Save;
  readonly saveIcon = SaveAllIcon;
  readonly restartIcon = RotateCcw;
  activeTab = 'draft';
  user: any = null;
  LoggedInUser = '';

  currentUser!: CurrentUser;

  readonly PenIcon = PenIcon;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private masterService: MasterService,
    private apiService: ApiService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef,
    private tabStateService: TabStateService,
  ) { }


  getUser(): any {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  }

  onApprovalPopupChange(open: boolean): void {
    this.showApprovalWorkflowPopup = open;
    this.cdr.detectChanges();
  }
  openApprovalWorkflow(): void {
    this.showApprovalWorkflowPopup = true;
    this.workflowTrialId = this.rowId || this.form.get('id')?.value || '';
    this.cdr.detectChanges();
  }

  commandOptions: any[] = [];
  shipOptions: any[] = [];

  signatureData: SignatureData | null = null;

  // --------------- INITIATED BY || BER_FOR_OPTIONS || HULL_OPTIONS || ENGINE_OPTIONS || DG_OPTIONS ----------

  InitiatedByOptions = [
    { label: '--Select--', value: '' },
    { label: 'IHQ', value: 'IHQ' },
    { label: 'HQWNC', value: 'HQWNC' },
    { label: 'HQSNC', value: 'HQSNC' },
    { label: 'HQENC', value: 'HQENC' },
    { label: 'HQANC', value: 'HQANC' },
  ];
  berForOptions = [
    { label: '--Select--', value: '' },
    { label: 'HULL', value: 'HULL' },
    { label: 'ENGINE', value: 'ENGINE' },
  ];
  hullOptions = [
    { label: '--Select--', value: '' },
    { label: 'NA', value: 'NA' },
    { label: 'BER', value: 'BER' },
  ];
  engineOptions = [
    { label: '--Select--', value: '' },
    { label: 'NA', value: 'NA' },
    { label: 'BER', value: 'BER' },
    { label: 'SERVICEABLE/ Sl.no', value: 'SER_SL_NO' },
  ];
  dgOptions = [
    { label: '--Select--', value: '' },
    { label: 'NA', value: 'NA' },
    { label: 'SI.NO', value: 'SL_NO' },
  ];

  selectedFile!: File | null;

  ngOnInit(): void {
    this.rowId = this.route.snapshot.paramMap.get('id');
    const mode = this.route.snapshot.data['mode'];

    this.buildForm();
    this.loadCommands();

    this.user = this.getUser();
    this.LoggedInUser = this.user?.user_roles?.[0]?.process_name || '';

    if (this.LoggedInUser === 'Ship Staff') {
      this.loadShips();

      const shipId = this.user?.ship_id || this.user?.user_roles?.[0]?.ship_id;

      if (shipId) {
        this.form.patchValue({
          ship_id: shipId,
        });
      }
    } else {
      this.loadCommands();
      this.listenToCommandChanges();
    }

    if (mode === 'view') {
      this.viewMode = true;
    } else if (mode === 'edit') {
      this.editMode = true;
    }

    if (this.rowId) {
      this.getEditDataByRowId(this.rowId);
    }

    this.tabStateService.activeTab$.subscribe((tab) => {
      this.activeTab = tab;
    });
  }

  buildForm() {
    this.form = this.fb.group({
      command: [''],
      ship_id: ['', Validators.required],
      initiatedBy: ['', Validators.required],
      type_of_boat: ['', Validators.required],
      registration_no: ['', Validators.required],
      ber_for: ['', Validators.required],
      ber_hull: [''],
      ber_engine: [''],
      dg: ['', Validators.required],
      remarks: ['', Validators.required],
      ref_auth: null,
    });
  }

  // ---------------------- IF THE ROW ID IS THERE THEN THE DATA WILL BE SET
  getEditDataByRowId(rowId: string, openWorkflow: boolean = false) {
    this.apiService.get(`${Apiendpoints.BER_CERTIFICATE}${rowId}/`).subscribe({
      next: (res: any) => {
        if (!res?.data) return;

        this.editDataDetails = res.data;

        const patchForm = () => {
          this.form.patchValue({
            command: this.editDataDetails?.command?.id || this.editDataDetails?.command || '',
            ship_id: this.editDataDetails?.ship?.id || this.editDataDetails?.ship_id || this.editDataDetails?.ship || '',
            type_of_boat: this.editDataDetails?.type_of_boat || '',
            registration_no: this.editDataDetails?.registration_no || '',
            ber_for: this.editDataDetails?.ber_for || '',
            ber_hull: this.editDataDetails?.ber_hull || '',
            ber_engine: this.editDataDetails?.ber_engine || '',
            dg: this.editDataDetails?.dg || '',
            remarks: this.editDataDetails?.remarks || '',
            initiatedBy: this.editDataDetails?.initiatedBy || this.editDataDetails?.initiated_by || '',
          });

          // ✅ IMPORTANT: Disable AFTER patch
          if (this.viewMode) {
            this.form.disable();
          }

          console.log('Form patched successfully (view/edit)');
        };

        const interval = setInterval(() => {
          if (this.commandOptions.length > 0 || this.shipOptions.length > 0) {
            patchForm();
            clearInterval(interval);
          }
        }, 100);

        // Signature
        if (res.data.signatureData) {
          this.signatureData = res.data.signatureData;
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

  // --------------- FETCH AND SET DATA OF COMMANDS AND UNITS ---------------------

  loadCommands() {
    this.masterService.getCommands().subscribe((res: any) => {
      this.commandOptions = (res?.data || []).map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
      this.cdr.detectChanges();
    });
  }

  listenToCommandChanges() {
    this.form.get('command')?.valueChanges.subscribe((cmdId) => {
      if (cmdId) {
        this.loadShipsByCommand(cmdId);
        this.form.get('ship_id')?.reset();
      } else {
        this.shipOptions = [];
        this.form.get('ship_id')?.reset();
      }
    });
  }

  loadShipsByCommand(cmdId: number) {
    this.masterService.getShipsByCommand(cmdId).subscribe((res: any) => {
      this.shipOptions = (res?.data || []).map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
    });
  }

  loadShips(shipId?: number) {
    this.masterService.getVessels().subscribe((res: any) => {
      this.shipOptions = (res?.data || []).map((item: any) => ({
        label: item.name,
        value: item.id,
      }));

      if (shipId) {
        this.form.patchValue({
          ship_id: shipId,
        });
      }

      this.cdr.detectChanges();
    });
  }

  generateQRCode(text: string): Promise<string> {
    return QRCode.toDataURL(text, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 200,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });
  }

  onFileChange(file: File) {
    console.log('file', file);
    this.selectedFile = file;
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
    this.selectedFile = null;
  }

  handleBack() {
    window.history.back();
  }

  uploadReferenceDocument(file: File, recordId: string) {
    const formData = new FormData();
    formData.append('resource', 'ber-certificate');
    formData.append('record_id', recordId);
    formData.append('field_name', 'ref_auth');
    formData.append('file', file);
    return this.apiService.post(Apiendpoints.DOCUMENT_UPLOAD, formData);
  }

  // -------------------------------------- HANDLE SUBMIT METHOD ------------------------
  handleSave(draftStatus: 'draft' | 'save') {
    if (draftStatus === 'save' && !this.validateForm()) {
      return;
    }

    if (draftStatus === 'save') {
      this.saveLoading = true;
    } else {
      this.draftLoading = true;
    }

    const formValues = this.form.value;

    const payload: any = {
      draft_status: draftStatus,
      ...formValues,
    };

    payload.ref_auth = formValues?.ref_auth?.id ?? null;

    if (this.editMode) {
      payload.id = this.editDataDetails.id;
    }

    this.apiService
      .post(Apiendpoints.BER_CERTIFICATE, payload)
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
            res?.message || 'BER Certificate request saved successfully',
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
                'Certificate saved, but approval workflow could not be opened.',
              );
            }
          } else {
            setTimeout(() => {
              window.history.back();
            }, 1000);
          }
        },

        error: (err) => {
          console.error('BER Certificate save error:', err);
          this.toastService.showError('Failed to save Ber Certificate data.');
        },
      });
  }
}
