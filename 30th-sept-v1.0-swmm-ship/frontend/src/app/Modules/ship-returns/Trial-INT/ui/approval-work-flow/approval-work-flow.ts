import { CommonModule, Location } from '@angular/common'; //YHa location add krrha hu
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Apiendpoints, userDropdownOptions } from '../../ApiEndPoints';
import { SelectComponent } from '../../ui/select.component';
import { QRCodeComponent } from 'angularx-qrcode';

import { FormsModule } from '@angular/forms';
import { EditorComponent } from '@tinymce/tinymce-angular';
import { ApiService } from '../../api.service';
import { FormApiService } from '../../angulerFromconverting/form-api.service';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { init } from '../editor.config';
import { ConfirmPopupService } from '../confirm-popup/confirm-popup.service';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';


@Component({
  selector: 'app-approval-work-flow',
  standalone: true,
  imports: [CommonModule, SelectComponent, QRCodeComponent, FormsModule, EditorComponent, IconComponent],
  templateUrl: './approval-work-flow.html',
  styles: [`
    .workflow-modal-card {
      background-color: var(--bg-sfd-modal, #18222C) !important;
    }
    .workflow-modal-header,
    .workflow-modal-footer {
      background-color: var(--bg-sfd-modal, #18222C);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApprovalWorkFlow implements OnInit {
  private readonly fromApi = inject(FormApiService);
  private readonly apiService = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notificationService = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly confirmPopupService = inject(ConfirmPopupService);
  private readonly location = inject(Location);

  dropDownOptions = {
    dropdown: { labelKey: 'name', valueKey: 'id' },
  };

  @Input() showUserPopuphead = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  @Input() context: any = {};
  @Input() rowData: any;
  @Input() isSubmitTime = false;
  @Input() workflowTrialId = '';
  @Input() type: 'returns' | 'trial' = 'trial';
  /** When true, render inline (no separate modal backdrop) for parent dialogs. */
  @Input() embedded = false;
  //Tanishk --> Auto Open The History when we click on STATUS button in action column
  @Input() autoOpenHistory = false;
  @Output() showUserPopupChange = new EventEmitter<boolean>();
  showSecondaryPopup = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectUnit: any[] = [];
  triaalType: string | 'returns' | 'trial' | 'refit' = 'trial';

  activeTab: 'internal' | 'external' = 'internal';
  editorConfig = init;
  remarks = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflowData: any[] = [];
  trialId = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any = { selected: null };


  ngOnInit(): void {
    // Prefer explicit [context] input; fall back to form API context when empty.
    const hasInputContext =
      this.context &&
      typeof this.context === 'object' &&
      Object.keys(this.context).length > 0;
    if (!hasInputContext) {
      this.context = this.fromApi?.context;
    }
    if (this.workflowTrialId) {
      this.trialId = this.workflowTrialId;
    } else {
      this.trialId = this.route.snapshot.queryParamMap.get('trial') || '';
    }
    this.triaalType = this.resolveWorkflowType();
    this.getTimelineData();
    this.userList?.length > 0 ? '' : this.getUser();
    //to auto open the history --> TANISHK
    if (this.autoOpenHistory) {
      this.getWorkflowHistory();
    }
  }

  private resolveWorkflowType(): string {
    const fromRoute = this.route.snapshot.queryParamMap.get('type')?.trim() === 'trials' ? 'trial' : this.route.snapshot.queryParamMap.get('type')?.trim();
    if (fromRoute) {
      return fromRoute;
    }
    if (this.type === 'returns') {
      return 'returns';
    }
    return 'trial';
  }

  getTimelineData(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.apiService.get(`/api/workflow/${this.trialId}/timeline`, { type: this.triaalType }).subscribe((data: any) => {
      this.workflowData = data.timeline || [];

      this.cdr.markForCheck();
    })
  }



  setTab(tab: 'internal' | 'external' | string): void {
    this.activeTab = tab as 'internal' | 'external';
    if (tab === 'internal') {
      this.getUser();
    } else {
      const currentUnit = this.workflowData.findIndex((step) => step.is_active === 2);
      if (currentUnit !== -1 && this.workflowData[currentUnit + 1]) {
        this.payload.selected = this.workflowData[currentUnit + 1].editors[0]?.unit_id || '';
      }

      this.getUnit();
    }
    this.cdr.markForCheck();
  }
  userList: any[] = [];
  getUser() {
    const unitId = JSON.parse(localStorage.getItem('user') || '{}')?.unit_id || '';
    this.apiService.getDropdownData(Apiendpoints.MASTER_USER, userDropdownOptions, { unit_id: unitId }).subscribe((data: any) => {
      this.userList = data || [];
      this.cdr.markForCheck();
    });
  }
  unitList: any[] = [];
  getUnit() {
    this.apiService.getDropdownData(Apiendpoints.MASTER_UNIT, this.dropDownOptions.dropdown).subscribe((data: any) => {
      this.unitList = data || [];
      this.cdr.markForCheck();

    });
  }



  closePopup(): void {
    this.showUserPopupChange.emit(false);
  }

  confirm(): void {
    this.showUserPopupChange.emit(false);
  }

  onSelectionChange(event: any): void {
    this.payload = event;
    this.cdr.markForCheck();
  }

  onPayloadSelectedChange(value: any): void {
    this.payload.selected = value;
    this.cdr.markForCheck();
  }

  onRemarksChange(value: string): void {
    this.remarks = value;
    this.cdr.markForCheck();
  }

  // Inside your component class
  isSigned = false;
  userDetailseData: any = null;

  toggleSignature() {
    this.isSigned = !this.isSigned;
    if (this.isSigned && !this.userDetailseData) {
      this.apiService.get(`api/auth/digital-signature-profile`).subscribe((res: any) => {
        this.userDetailseData = res.data;
        this.cdr.markForCheck();
      });
    }
  }

  get qrSignatureData(): string {
    if (!this.userDetailseData) return '';
    const d = this.userDetailseData;
    return `Signed By: ${d.first_name} ${d.last_name}\nUnit: ${d.unit_name}\nRole: ${d.user_role_name}\nTime: ${d.timestamp}`;
  }

  openUserList(step: any): void {
    this.showSecondaryPopup = true;
    this.selectUnit = step.editors;
  }

  trackByUserId(index: number, user: any): string | number {
    return user?.id ?? user?.user_id ?? user?.loginname ?? index;
  }


  submitData(): void {
    if (this.remarks.trim() === '') {
      this.notificationService.error('Remarks are required');
      return;
    }
    let payload: any = {};
    let url = '';
    if (this.activeTab === 'internal') {
      url = `/api/workflow/editor/add-user/`;
      const user = this.userList.find((user) => user.value === this.payload.selected);
      this.cdr.markForCheck();
      payload = {
        user_name: user ? user.label : '',
        user_id: user ? user.value : '',
        editor_turn: this.context?.workflow_rights?.editor_turn || 0
      };
      !this.context?.workflow_rights?.can_approve_reject ? payload['remarks'] = this.remarks : '';
    } else {
      const unit = this.unitList.find((unit) => unit.value === this.payload.selected);
      // const type = this.route.snapshot.queryParamMap.get('type') || '';
      url = `/api/workflow/editor/add/`;
      payload = {
        type: this.triaalType,
        is_external: true,
        trial_id: this.trialId,
        unit_name: unit ? unit.label : '',
        unit_id: unit ? unit.value : '',
        editor_turn: this.context?.workflow_rights?.editor_turn || 0
      };
    }
    this.apiService.post(url, payload).subscribe((response) => {
      this.notificationService.success('Assignment successful');
      if (this.activeTab === 'external') {
        this.goToGenrateReport();
      }
      if (this.context?.workflow_rights?.can_approve_reject) {
        this.submitDecision();
      }

      this.closePopup();
      this.getTimelineData();
    });
  }
  submitDecision(): void {
    this.apiService.post('api/workflow/editor/approve/', {
      remarks: this.remarks || '',
      editor_turn: this.context?.workflow_rights?.editor_turn || 0,
    }).subscribe({
      next: () => {
        //seg redirection logic add krrha hu
        // const selectedUnitId = Number(this.payload?.selected);
        // const isSeg = selectedUnitId === 27;
        //YE SEG WALA LOGIC PART COMMENT OUT KIYA HU GENERALISED WAY ADD KRNE KE LIYE
        // let selectedUnitId: Number;
        // if (this.activeTab === 'external'){
        //   selectedUnitId = Number(this.payload?.selected);
        // } else {
        //   selectedUnitId = Number(
        //     JSON.parse(localStorage.getItem('user') || '{}')?.unit_id
        //   );
        // }
        // const isSeg = selectedUnitId === 27;
        // const type = this.route.snapshot.queryParamMap.get('type') || '';
        // const redirectUrl = this.triaalType === 'returns' ? '/transactions/return':'/afterAuth/ship-returns/transactions/trial';

        //yha pr seg redirection update krrha hu bss
        // const redirectUrl = isSeg? '/transactions/request-review': this.triaalType === 'returns'? '/transactions/return': '/afterAuth/ship-returns/transactions/trial';
        // this.router.navigate([redirectUrl]);

        this.notificationService.success('From Forworded successfully');
        //Simple logic added jo hr case mai work krega
        this.location.back();
      },
      error: () => {
        this.notificationService.error('Failed to submit decision');
      },
    });

  }

  goToGenrateReport(): void {
    const context = this.getEffectiveContext();
    const formName = this.resolveFormName(context);

    const payload = {
      trial_id: this.trialId || context?.uuid || context?.trial_id || this.rowData?.uuid,
      form_name: formName,
      trial_number: context?.trial_number || this.rowData?.trial_number || '',
      version_name: 'ship',
      report_type: 'ship',
      readonly: 0,
      auto_save_version: true,
    };

    console.log('Generate Report Payload:', payload);

    if (!formName) {
      console.warn('[ApprovalWorkFlow] form_name could not be resolved for trial payload:', payload);
    }

    this.apiService.post('/api/reports/trial-reports/generate/', payload).subscribe({
      next: () => {
        this.notificationService.success('Report generated successfully');
      },
      error: (err) => {
        console.error('Failed to generate report', err);
        this.notificationService.error('Failed to generate report');
      },
    });
  }

  private getEffectiveContext(): any {
    if (this.context && typeof this.context === 'object' && Object.keys(this.context).length > 0) {
      return this.context;
    }
    if (this.fromApi?.context && typeof this.fromApi.context === 'object' && Object.keys(this.fromApi.context).length > 0) {
      return this.fromApi.context;
    }
    if (this.rowData && typeof this.rowData === 'object' && Object.keys(this.rowData).length > 0) {
      return this.rowData;
    }
    return this.context || this.fromApi?.context || {};
  }

  /**
   * Resolves the form name from all available sources:
   * 1. Direct form_name property on context, rowData, or FormApiService
   * 2. Active route parameter :formName
   * 3. trial_type_url / url on context or rowData (e.g. 'dynamic-form/cbiu_T_phase_1_wptOfPortBoiler' -> 'cbiu_T_phase_1_wptOfPortBoiler')
   * 4. report_url on context or rowData (if not a generic route like 'report-view')
   * 5. Current router URL path (e.g. /afterAuth/ship-returns/trials/dynamic-form/cbiu_T_phase_1_wptOfPortBoiler)
   * 6. Fallback to trial_type_name
   */
  resolveFormName(context?: any): string {
    const ctx = context ?? this.getEffectiveContext();

    // 1. Direct form_name property on context, rowData, or formApi
    const directFormName = String(
      ctx?.form_name ||
      ctx?.formName ||
      this.rowData?.form_name ||
      this.rowData?.formName ||
      this.fromApi?.currentFormName ||
      ''
    ).trim();
    if (directFormName && !this.isGenericRouteSegment(directFormName)) {
      return directFormName;
    }

    // 2. From route param :formName
    const routeFormName = this.getRouteParamFormName();
    if (routeFormName) {
      return routeFormName;
    }

    // 3. From trial_type_url on context, rowData, or trial_type object
    const trialTypeUrl =
      ctx?.trial_type_url ||
      ctx?.trialTypeUrl ||
      ctx?.trial_type?.url ||
      ctx?.url ||
      this.rowData?.trial_type_url ||
      this.rowData?.url;
    const fromTrialTypeUrl = this.extractSlug(trialTypeUrl);
    if (fromTrialTypeUrl) {
      return fromTrialTypeUrl;
    }

    // 4. From report_url (if it contains a valid form slug, not generic 'report-view')
    const reportUrl = ctx?.report_url || this.rowData?.report_url;
    const fromReportUrl = this.extractSlug(reportUrl);
    if (fromReportUrl) {
      return fromReportUrl;
    }

    // 5. From current router URL
    const fromRouterUrl = this.extractFromRouterUrl();
    if (fromRouterUrl) {
      return fromRouterUrl;
    }

    // 6. Fallback to trial_type_name if available without spaces
    const trialTypeName = String(ctx?.trial_type_name || this.rowData?.trial_type_name || '').trim();
    if (trialTypeName && !trialTypeName.includes(' ')) {
      return trialTypeName;
    }

    return '';
  }

  getFormName(url?: string): string {
    if (url) {
      const slug = this.extractSlug(url);
      if (slug) return slug;
    }
    return this.resolveFormName();
  }

  private extractSlug(url: string | null | undefined): string {
    if (!url || typeof url !== 'string') return '';
    const cleanUrl = url.split(/[?#]/)[0].trim();
    if (!cleanUrl) return '';
    const segments = cleanUrl.replace(/\/+$/, '').split('/').filter(Boolean);
    const last = segments.pop() || '';
    if (this.isGenericRouteSegment(last)) {
      return '';
    }
    return last;
  }

  private extractFromRouterUrl(): string {
    const rawUrl = this.router.url || '';
    const cleanUrl = rawUrl.split(/[?#]/)[0];

    // Check if URL matches dynamic-form/:formName
    const dynamicFormMatch = cleanUrl.match(/\/dynamic-form\/([^/?#]+)/);
    if (dynamicFormMatch && dynamicFormMatch[1]) {
      return decodeURIComponent(dynamicFormMatch[1]).trim();
    }

    return this.extractSlug(cleanUrl);
  }

  private getRouteParamFormName(): string {
    let current: ActivatedRoute | null = this.route;
    while (current) {
      const formName = current.snapshot.params?.['formName'] || current.snapshot.paramMap?.get('formName');
      if (formName && typeof formName === 'string') {
        const trimmed = formName.trim();
        if (trimmed && !this.isGenericRouteSegment(trimmed)) {
          return trimmed;
        }
      }
      current = current.parent;
    }
    return '';
  }

  private isGenericRouteSegment(segment: string): boolean {
    const generic = [
      'report-view',
      'transaction',
      'dashboard',
      'inbox',
      'outbox',
      'history',
      'aboutus',
      'reports',
      'trials',
      'returns',
      'trial-returns',
      'srar',
    ];
    return generic.includes(segment.toLowerCase());
  }

  showHistoryPopup = false;
  workflowHistoryItems: any[] = []; // Ye filtered history store karega

  getWorkflowHistory(): void {
    const type = this.triaalType;
    const params = { type };

    this.apiService.get('api/workflow/status/history/?trial_id=' + this.trialId, params).subscribe((res: any) => {
      if (res && res.data) {
        this.workflowHistoryItems = res.data
        this.showHistoryPopup = true;
        this.cdr.markForCheck();
      } else {
        this.workflowHistoryItems = [];
        // Aap yahan koi toast message dikha sakte hain "No history found"
      }
    });
  }
  //To close that --> Tanishk
  closeHistoryPopup(): void {
    this.showHistoryPopup = false;
    if (this.autoOpenHistory) {
      this.showUserPopupChange.emit(false);
    }
  }

  // QR Code generate karne ka helper function
  getQRData(signature: any): string {
    if (!signature) return 'No Signature Available';
    return `Signed By: ${signature.full_name}\n` +
      `Unit: ${signature.unit_name}\n` +
      `Role: ${signature.user_role_name}\n` +
      `Time: ${signature.timestamp}`;
  }

  timedDifferenceOfTwoDates(date1: string, date2: string): string {
    const d1 = new Date(date1);
    const d2 = new Date(date2);

    const diffMs = Math.abs(d2.getTime() - d1.getTime());

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(
      (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const diffMinutes = Math.floor(
      (diffMs % (1000 * 60 * 60)) / (1000 * 60)
    );

    return `${diffDays} day(s)`;
  }

  showSignatureToast() {
    this.notificationService.warning('Add signature first before submitting');
  }

  settlementLiteId = JSON.parse(localStorage.getItem('user') || '{}')?.satellite_unit_id || '';
  finalApproval(): void {
    this.confirmPopupService.open({
      title: 'Final Approval',
      message: 'Are you sure you want to submit final approval?',
      type: 'warning',
      confirmText: 'Yes, Approve',
      confirmClass: 'border-[#4f8fd5] bg-[#1069AB] text-white hover:bg-[#195d95]',
      onConfirm: () => this.submitFinalApproval(),
    });
  }

  private submitFinalApproval(): void {
    this.apiService.post('api/workflow/editor/approve/', {
      remarks: this.remarks || '',
      editor_turn: this.context?.workflow_rights?.editor_turn || 0,
      final_approval: 1,
    }).subscribe({
      next: () => {
        this.notificationService.success('Final approval successful'); this.getTimelineData(); this.closePopup();
        //yha bss seg redirection logic add krrha hu
        const unitId = Number(
          JSON.parse(localStorage.getItem('user') || '{}')?.unit_id);
        if (unitId === 27) {
          this.router.navigate(['/transactions/request-review']);
        }

      },
      error: () => this.confirmPopupService.error('Final approval failed'),
    });
  }
}
