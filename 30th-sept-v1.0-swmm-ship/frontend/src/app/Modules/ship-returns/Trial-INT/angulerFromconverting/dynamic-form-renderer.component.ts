import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import {
  DynamicSectionRendererComponent,
  DynamicSectionSchema,
} from './dynamic-section-renderer.component';
import { FormApiService } from './form-api.service';
import { NotificationService } from '../../../../Core/services/notification/notification.service';

import { DynamicTableConfigService } from './dynamic-table-config.service';
import { applyMatrixFormulas, evaluateFormulaExpression } from './matrix-cell-formula.util';
import { ApiService } from '../api.service';
import { AddFormComponent } from '../ui/add-form/add-form.component';
import { ApprovalWorkFlow } from '../ui/approval-work-flow/approval-work-flow';


export interface DynamicFormSchema {
  formId: string;
  title: string;
  sourceFile?: string;
  sectionGroup?: any;
  sections: DynamicSectionSchema[];
}

@Component({
  selector: 'app-dynamic-form-renderer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex h-full min-h-0 flex-1 flex-col',
  },
  imports: [
    CommonModule,
    FormsModule,
    DynamicSectionRendererComponent,
    ApprovalWorkFlow,
    AddFormComponent,
  ],
  template: `
    <div class="dynamic-form-renderer-shell glass-card flex min-h-0 flex-1 flex-col text-white">
      <!-- TOP BAR (pinned — scroll only in content area below) -->
      <div class="border-b border-white/15 px-6 py-2 max-xl:px-4">
        <div
          class="relative z-[1] mx-auto grid max-w-[1680px] grid-cols-[minmax(180px,1fr)_minmax(520px,2.4fr)_minmax(220px,1fr)] items-center gap-4 max-xl:grid-cols-1"
        >
          <div class="flex items-center justify-start gap-2 max-xl:justify-center">
            <button
              type="button"
              class="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/20 bg-white/10 px-5 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/15 focus:border-[#61C2FF] focus:outline-none"
            >
                  <i class="fa fa-clock-rotate-left text-white/70" aria-hidden="true"></i>
              <span>Previous Report</span>
            </button>


          </div>

          <div class="min-w-0">
            <div
                class="mx-auto flex w-fit max-w-full gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <button
                *ngFor="let tab of eqpList"
                type="button"
                (click)="setActiveTab(tab)"
                class="relative shrink-0 overflow-hidden rounded-lg border border-transparent px-3 py-2 text-center text-white/70 transition hover:text-white hover:bg-[linear-gradient(90deg,rgba(0,0,0,0.01)_0.09%,rgba(26,163,242,0.24)_99.92%)]"
                [class.nav-item-active]="activeTab?.id === tab?.id"
                [class.text-white]="activeTab?.id === tab?.id"
                [attr.title]="tab?.name + ' - ' + tab?.nomenclature + ' - ' + tab?.serial_no"
                [attr.aria-label]="tab?.name + ' - ' + tab?.nomenclature + ' - ' + tab?.serial_no"
              >
                <span
                  class="relative block max-w-[195px] overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-medium tracking-wide"
                >
                  {{ tab?.nomenclature }}
                </span>
              </button>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 max-xl:flex-wrap max-xl:justify-center">
            <button
              type="button"
              (click)="shouldShowUserPopup = true"
               class="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/20 bg-white/10 px-5 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/15 focus:border-[#61C2FF] focus:outline-none"
            >
              <i class="fa fa-user" aria-hidden="true"></i>
              <span>User Action</span>
            </button>

            <!-- ACCEPT RETURN BUTTON - can_accept_trial true hone par show hoga -->
                   <button
                     type="button"
                     *ngIf="canAcceptTrial && api.urlPrefix === 'returns'"
                     (click)="acceptReturnDirect()"
                     [disabled]="returnActionLoading"
                      class="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/20 bg-white/10 px-5 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/15 focus:border-[#61C2FF] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                   >
                     <i
                       class="fa"
                       [ngClass]="returnActionLoading ? 'fa-spinner fa-spin' : 'fa-check-circle'"
                       aria-hidden="true"
                     ></i>
                     <span>Accept Return</span>
                   </button>

                   <button
                     type="button"
                     *ngIf="canRejectTrial && api.urlPrefix === 'returns'"
                     (click)="openRejectReturnPopup()"
                     [disabled]="returnActionLoading"
                      class="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/20 bg-white/10 px-5 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/15 focus:border-[#61C2FF] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                   >
                     <i class="fa fa-times-circle" aria-hidden="true"></i>
                     <span>Reject Return</span>
                   </button>

            <button
              type="button"
              *ngIf="context?.workflow_rights?.can_generate_trial_pass "
              (click)="openTrialPassDialog()"
               class="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#4f8fd5] bg-[#1069AB] px-5 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-[#195d95] active:translate-y-px"
            >
              <i class="fa fa-plus" aria-hidden="true"></i>
              <span> Trial Pass</span>
            </button>
          </div>
        </div>
      </div>

      <!-- SCROLLABLE MAIN CONTENT -->
      <div class="min-h-0 flex-1 overflow-y-auto max-md:px-3">
        <div class="mx-auto w-full py-3">
          <div class=" min-h-full p-5 max-md:p-3">
            <app-dynamic-section-renderer
              *ngIf="currentSection"
              [section]="currentSection"
              [sectionGroup]="currentSection?.sectionGroup"
              [formData]="currentFormData"
              [isFormReadOnly]="isFormReadOnly"
              [isLastSection]="currentSectionIndex === totalSections - 1"
              [equipmentId]="activeEquipmentId"
              (sectionChange)="onSectionChange(currentSectionIndex, $event)"
              (tableDataChange)="onTableDataChange($event)"
            ></app-dynamic-section-renderer>
          </div>
        </div>
      </div>

      <!-- BOTTOM FOOTER (pinned) -->
      <div class="border-t border-white/15 px-6 py-2 max-md:px-3">
        <div
          class="relative z-[1] mx-auto grid max-w-[1680px] grid-cols-[minmax(220px,1fr)_auto_minmax(220px,1fr)] items-center gap-4 max-xl:grid-cols-1"
        >
          <div class="flex items-center justify-start gap-2 max-xl:flex-wrap max-xl:justify-center">
            <button
              type="button"
              (click)="goback()"
              class="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/20 bg-white/10 px-5 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/15 focus:border-[#61C2FF] focus:outline-none max-md:w-full"
            >
              <span>←</span>
              <span>Go Back</span>
            </button>

            <button
              type="button"
              (click)="prevSection()"
              [disabled]="currentSectionIndex === 0"
              class="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/20 bg-white/10 px-5 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/15 focus:border-[#61C2FF] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 max-md:w-full"
            >
              <span>←</span>
              <span>Prev Section</span>
            </button>
          </div>

          <div class="mx-auto flex items-center gap-1 max-md:w-full max-md:flex-wrap max-md:justify-center">
            <button
              type="button"
              (click)="goToSection(0)"
              [disabled]="currentSectionIndex === 0"
              class="flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-white/10 text-base font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              «
            </button>

            <div
              class="flex items-center gap-1 max-[480px]:max-w-[180px] max-[480px]:overflow-x-auto max-[480px]:[scrollbar-width:none] max-[480px]:[&::-webkit-scrollbar]:hidden"
            >
              <button
                *ngFor="let pageIndex of visiblePageIndexes"
                type="button"
                (click)="goToSection(pageIndex)"
                class="flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-white/10 text-[11px] font-semibold text-white transition hover:bg-white/15"
                [class.border-[#4da6ff]]="pageIndex === currentSectionIndex"
                [class.bg-[#1069AB]]="pageIndex === currentSectionIndex"
              >
                {{ pageIndex + 1 }}
              </button>
            </div>

            <button
              type="button"
              (click)="goToSection(totalSections - 1)"
              [disabled]="currentSectionIndex === totalSections - 1"
              class="flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-white/10 text-base font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              »
            </button>

            <div class="mx-1 h-6 border-l border-white/15 max-md:hidden"></div>

            <div class="flex items-center gap-2 max-md:w-full max-md:justify-center">
              <span class="text-white/60 text-[10px] font-semibold uppercase tracking-wide">
                Go to
              </span>

              <input
                type="number"
                [(ngModel)]="pageJumpValue"
                (keyup.enter)="goToPageInput()"
                min="1"
                [max]="totalSections"
                class="h-8 w-14 rounded-md border border-white/20 bg-white/10 text-center text-xs font-semibold text-white outline-none focus:border-[#61C2FF]"
              />

              <button
                type="button"
                (click)="goToPageInput()"
                class="inline-flex h-8 items-center justify-center rounded-md border border-[#4f8fd5] bg-[#1069AB] px-4 text-[10px] font-semibold uppercase tracking-wide text-white hover:bg-[#195d95]"
              >
                GO
              </button>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 max-xl:flex-wrap max-xl:justify-center">
            <button
              type="button"
              (click)="saveDraft()"
              [disabled]="!context?.workflow_rights?.can_edit"
              class="inline-flex h-9 items-center justify-center rounded-md border border-white/20 bg-white/10 px-5 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/15 focus:border-[#61C2FF] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 max-md:w-full"
            >
              Save Draft
            </button>

            <button
              *ngIf="!isLastSection"
              type="button"
              (click)="nextSection()"
              class="inline-flex h-9 items-center justify-center rounded-md border border-white/20 bg-white/10 px-5 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/15 focus:border-[#61C2FF] focus:outline-none max-md:w-full"
            >
              Next →
            </button>

            <button
              *ngIf="isLastSection"
              type="button"
              (click)="submitForm()"
              [disabled]="!context?.workflow_rights?.can_edit"
              class="inline-flex h-9 items-center justify-center rounded-[10px] border border-green-500/50 bg-green-500/30 px-5 text-[11px] font-semibold uppercase tracking-wide text-white shadow-[0_4px_16px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-md transition hover:bg-green-500/40 disabled:cursor-not-allowed disabled:opacity-40 max-md:w-full"
            >
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>

    <app-approval-work-flow
      [showUserPopuphead]="shouldShowUserPopup"
      [isSubmitTime]="isSubmitTime"
      [context]="context"
      [isSubmitTime]="isSubmitTime"
      (showUserPopupChange)="
        shouldShowUserPopup = $event; isSubmitTime = $event
      "
    ></app-approval-work-flow>

    <!-- <app-add-trial-pass
      *ngIf="showTrialPassLayout"
      [context]="context"
      [showTrialPassLayout]="showTrialPassLayout"
      (showTrialPassLayoutChange)="onTrialPassDialogChange($event)"
    ></app-add-trial-pass> -->

    <!-- REJECT RETURN POPUP USING REUSABLE APP-ADD-FORM -->
    <app-add-form
  *ngIf="showRejectReturnPopup"
  width="65vw"
  [open]="showRejectReturnPopup"
  [formConfig]="rejectReturnFormConfig"
  [formData]="rejectReturnFormData"
  [isEditMode]="false"
  [submitLabel]="'Submit'"
  (onSubmit)="submitRejectReturn($event)"
  (onFieldChange)="onRejectReturnFieldChange($event)"
  (onOpenChange)="onRejectReturnPopupChange($event)"
  [fromTitle]="'Reject Return'"
>
</app-add-form>
  `,
})
export class DynamicFormRendererComponent implements OnInit, OnChanges {
  @Input() schema!: DynamicFormSchema;

  @Input() autosave = false;
  @Input() context: any = {};

  @Input() eqpList: any[] = [
    { id: 'EQP001', label: 'Equipment 1', icon: 'fa-solid fa-computer' },
    { id: 'EQP002', label: 'Equipment 2', icon: 'fa-solid fa-desktop' },
    { id: 'EQP003', label: 'Equipment 3', icon: 'fa-solid fa-laptop' },
  ];

  isSubmitTime = false;
  activeTab: any = {};

  @Output() schemaChange = new EventEmitter<DynamicFormSchema>();
  @Output() formValueChange = new EventEmitter<any>();
  @Output() draftSave = new EventEmitter<any>();
  @Output() formSubmit = new EventEmitter<any>();
  @Output() equipmentChange = new EventEmitter<any>();

  shouldShowUserPopup = false;
  showTrialPassLayout = false;

  currentFormData: Record<string, any> = {};
  currentSectionIndex = 0;
  pageWindowSize = 5;
  pageWindowStart = 0;
  pageJumpValue: number | null = null;

  // formId: string | null = null;

  // NEW RETURN ACCEPT / REJECT VARIABLES
  returnActionLoading = false;
  showRejectReturnPopup = false;

  rejectReturnFormData: any = {
    remarks: '',
  };

  rejectReturnFormConfig: any = [
    {
      key: 'remarks',
      name: 'remarks',
      fieldName: 'remarks',
      label: 'Remarks',
      type: 'textarea',
      placeholder: 'Enter rejection remarks',
      required: true,
      rows: 6,

      // IMPORTANT: add-form html colSpan use karta hai, col nahi
      colSpan: 3,

      // IMPORTANT: app-textarea bypass karke native textarea use hoga
      nativeTextarea: true,
    },
  ];

  readonly api = inject(FormApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notificationService = inject(NotificationService);
  private readonly tableConfigService = inject(DynamicTableConfigService);
  private readonly apiService = inject(ApiService);

  constructor() { }

  ngOnInit(): void {
    this.context = this.api.context;
    this.eqpList = this.context?.equipment_details || this.context?.system_details || [];
    this.activeTab = this.eqpList?.[0];

    if (this.activeTab) {
      this.api.setCurrentEquipmentNomenclature(this.activeTab);
    }
  }

  ngOnChanges(changes: SimpleChanges): void { }

  openTrialPassDialog(): void {
    this.showTrialPassLayout = true;
    this.cdr.markForCheck();
  }

  onTrialPassDialogChange(open: boolean): void {
    this.showTrialPassLayout = open;
    this.cdr.markForCheck();
  }

  get currentSection(): DynamicSectionSchema | null {
    return this.schema?.sections?.[this.currentSectionIndex] || null;
  }

  get totalSections(): number {
    return this.schema?.sections?.length || 0;
  }

  get isLastSection(): boolean {
    return this.currentSectionIndex === this.totalSections - 1;
  }

  get isFormReadOnly(): boolean {
    // Missing permissions should not disable the form while context is loading.
    return this.context?.workflow_rights?.can_edit === false;
  }

  get activeEquipmentId(): number | null {
    return this.activeTab?.id ?? null;
  }

  get visiblePageIndexes(): number[] {
    const end = Math.min(
      this.pageWindowStart + this.pageWindowSize,
      this.totalSections,
    );

    return Array.from(
      { length: end - this.pageWindowStart },
      (_, i) => this.pageWindowStart + i,
    );
  }

  // NEW RETURN ACCEPT / REJECT RIGHTS
  get canAcceptTrial(): boolean {
    return !!this.context?.workflow_rights?.can_accept_trial;
  }

  get canRejectTrial(): boolean {
    return !!this.context?.workflow_rights?.can_reject_trial;
  }

  get canShowReturnActionButton(): boolean {
    return this.canAcceptTrial || this.canRejectTrial;
  }

  private getReturnPayloadBase(): { return_id: number; editor_turn_id: number } | null {
    const returnId = this.context?.id;
    const editorTurnId =
      this.context?.workflow_rights?.editor_turn || this.context?.editor_turn;

    if (!returnId) {
      this.notificationService.error('Return ID not found');
      return null;
    }

    if (!editorTurnId) {
      this.notificationService.error('Editor turn ID not found');
      return null;
    }

    return {
      return_id: Number(returnId),
      editor_turn_id: Number(editorTurnId),
    };
  }

  acceptReturnDirect(): void {
    const basePayload = this.getReturnPayloadBase();
    if (!basePayload) return;

    const payload = {
      ...basePayload,
      accept: true,
      remarks: '',
    };

    this.returnActionLoading = true;
    this.cdr.markForCheck();

    this.api.acceptRejectReturn(payload).subscribe({
      next: () => {
        this.notificationService.success('Return accepted successfully');

        this.returnActionLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.notificationService.error('Failed to accept return');

        this.returnActionLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  openRejectReturnPopup(): void {
    this.rejectReturnFormData = {
      remarks: '',
    };

    this.showRejectReturnPopup = true;
    this.cdr.markForCheck();
  }

  onRejectReturnPopupChange(open: boolean): void {
    this.showRejectReturnPopup = open;

    if (!open) {
      this.rejectReturnFormData = {
        remarks: '',
      };
    }

    this.cdr.markForCheck();
  }

  onRejectReturnFieldChange(event: any): void {
    if (!event) return;

    const formValue =
      event?.form ||
      event?.formValue ||
      event?.data ||
      event;

    const remarks =
      formValue?.remarks ??
      event?.remarks ??
      event?.value ??
      this.rejectReturnFormData?.remarks ??
      '';

    this.rejectReturnFormData = {
      ...this.rejectReturnFormData,
      remarks,
    };

    this.cdr.markForCheck();
  }

  submitRejectReturn(event: any): void {
    const basePayload = this.getReturnPayloadBase();
    if (!basePayload) return;

    const formValue =
      event?.form ||
      event?.formValue ||
      event?.data ||
      event;

    const remarks =
      formValue?.remarks ??
      event?.remarks ??
      this.rejectReturnFormData?.remarks ??
      '';

    if (!String(remarks).trim()) {
      this.notificationService.error('Please enter rejection remarks');
      return;
    }

    const payload = {
      ...basePayload,
      accept: false,
      remarks: String(remarks).trim(),
    };

    this.returnActionLoading = true;
    this.cdr.markForCheck();

    this.api.acceptRejectReturn(payload).subscribe({
      next: () => {
        this.notificationService.success('Return rejected successfully');

        this.returnActionLoading = false;
        this.showRejectReturnPopup = false;
        this.rejectReturnFormData = {
          remarks: '',
        };

        this.cdr.markForCheck();
      },
      error: () => {
        this.notificationService.error('Failed to reject return');

        this.returnActionLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  goToSection(index: number): void {
    if (index < 0 || index >= this.totalSections) return;

    this.currentSectionIndex = index;
    this.ensureCurrentPageVisible();
  }

  prevSection(): void {
    if (this.currentSectionIndex > 0) {
      this.currentSectionIndex--;
      this.ensureCurrentPageVisible();
    }
  }

  nextSection(): void {
    if (this.currentSectionIndex < this.totalSections - 1) {
      this.currentSectionIndex++;
      this.ensureCurrentPageVisible();
    }
  }

  shiftWindowLeft(): void {
    this.pageWindowStart = Math.max(
      0,
      this.pageWindowStart - this.pageWindowSize,
    );
  }

  shiftWindowRight(): void {
    const maxStart = Math.max(0, this.totalSections - this.pageWindowSize);

    this.pageWindowStart = Math.min(
      maxStart,
      this.pageWindowStart + this.pageWindowSize,
    );
  }

  goToPageInput(): void {
    if (this.pageJumpValue == null) return;

    const pageIndex = Number(this.pageJumpValue) - 1;
    if (Number.isNaN(pageIndex)) return;

    if (pageIndex >= 0 && pageIndex < this.totalSections) {
      this.currentSectionIndex = pageIndex;
      this.ensureCurrentPageVisible();
    }

    this.pageJumpValue = null;
  }

  ensureCurrentPageVisible(): void {
    if (this.currentSectionIndex < this.pageWindowStart) {
      this.pageWindowStart = this.currentSectionIndex;
      return;
    }

    if (
      this.currentSectionIndex >=
      this.pageWindowStart + this.pageWindowSize
    ) {
      this.pageWindowStart = this.currentSectionIndex - this.pageWindowSize + 1;
    }
  }

  onSectionChange(index: number, updatedSection: DynamicSectionSchema): void {
    const previousSection = this.schema.sections[index];
    const changedFieldName = this.resolveChangedFieldName(previousSection, updatedSection);
    const updatedSections = [...this.schema.sections];
    updatedSections[index] = updatedSection;

    this.schema = {
      ...this.schema,
      sections: updatedSections,
    };

    this.schemaChange.emit(this.schema);

    this.currentFormData = this.buildRawFlatPayload();

    const payload = this.buildFlatPayload(this.currentFormData);
    this.formValueChange.emit(payload);

    if (this.autosave) {
      this.api.saveDraft(payload).subscribe({
        next: (res: any) => {
          if (res?.status === 200) this.draftSave.emit(payload);
        },
        error: () => { },
      });
    }

    if (changedFieldName) {
      void this.refreshDependentDropdowns(changedFieldName).then(() => {
        this.currentFormData = this.buildRawFlatPayload();
        this.schemaChange.emit(this.schema);
        this.formValueChange.emit(this.buildFlatPayload(this.currentFormData));
        this.cdr.markForCheck();
      });
    }
  }

  onTableDataChange(_: { tableId: string; data: any[] }): void {
    this.currentFormData = this.buildRawFlatPayload();
    this.formValueChange.emit(this.buildFlatPayload(this.currentFormData));
  }

  saveDraft(): void {
    this.currentFormData = this.buildRawFlatPayload();

    const payload = this.buildFlatPayload(this.currentFormData);
    const formId = this.context?.uuid;

    this.api.saveDraft(payload, formId || undefined).subscribe({
      next: (res: any) => {
        this.draftSave.emit(payload);
        this.notificationService.success('Draft saved successfully');
      },
      error: () => {
        this.notificationService.error('Failed to save draft');
        this.draftSave.emit(payload);
      },
    });
  }

  submitForm(): void {

    this.currentFormData = this.buildRawFlatPayload();

    if (!this.validateRequiredFields(this.currentFormData)) {
      return;
    }
    this.isSubmitTime = true;
    this.shouldShowUserPopup = true;

    const payload = this.buildFlatPayload(this.currentFormData);

    this.api.submitForm(payload).subscribe({
      next: () => {
        // this.notificationService.showSuccess('Data updated successfully');
        this.formSubmit.emit(payload);
      },
      error: () => {
        this.notificationService.error('Failed to update data');
        this.formSubmit.emit(payload);
      },
    });
  }

  private validateRequiredFields(rawPayload: any): boolean {
    for (let sectionIndex = 0; sectionIndex < (this.schema?.sections || []).length; sectionIndex++) {
      const section = this.schema.sections[sectionIndex];

      for (const block of this.getSectionBlocks(section)) {
        for (const field of block.fields || []) {
          if (this.isRequiredControlInvalid(field, rawPayload)) {
            this.showRequiredValidationError(sectionIndex, field);
            return false;
          }
        }

        for (const table of block.tables || []) {
          if (!this.tableConfigService.isVisible(table, rawPayload)) {
            continue;
          }

          const rows = applyMatrixFormulas(table.rows || [], {
            tableId: table.id,
            formData: rawPayload,
          });

          for (const row of rows || []) {
            for (const cell of row.cells || []) {
              if (this.isRequiredControlInvalid(cell, rawPayload)) {
                this.showRequiredValidationError(sectionIndex, cell);
                return false;
              }
            }
          }
        }
      }
    }

    return true;
  }

  private showRequiredValidationError(sectionIndex: number, control: any): void {
    this.currentSectionIndex = sectionIndex;
    this.ensureCurrentPageVisible();
    const fieldName = [
      control?.label,
      control?.lb,
      control?.name,
      control?.key,
      control?.id,
    ]
      .map(value => String(value ?? '').trim())
      .find(Boolean) ?? 'Unknown field';
      this.notificationService.error(`Please fill the required field: ${fieldName}`);
    this.cdr.markForCheck();
  }

  private isRequiredControlInvalid(control: any, rawPayload: any): boolean {
    if (!control?.required || control.disabled || control.readonly || control.formula) {
      return false;
    }

    if (!this.isRequiredControlType(control.type)) {
      return false;
    }

    if (!this.tableConfigService.isVisible(control, rawPayload)) {
      return false;
    }

    return this.isEmptyRequiredValue(control.value, control.type);
  }

  private isRequiredControlType(type: string | undefined): boolean {
    return [
      'input',
      'textarea',
      'select',
      'tree-select',
      'multiselect',
      'date',
      'time',
      'checkbox',
      'checkbox-multiple',
      'radio',
      'file',
      'editor',
    ].includes(type || '');
  }

  private isEmptyRequiredValue(value: any, type: string | undefined): boolean {
    if (type === 'checkbox') return value !== true;
    if (Array.isArray(value)) return value.length === 0;
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    return false;
  }

  buildFlatPayload(rawPayload: any = this.buildRawFlatPayload()): any {
    const payload: any = {};

    for (const section of this.schema?.sections || []) {
      for (const block of this.getSectionBlocks(section)) {
        for (const field of block.fields || []) {
          if (!this.tableConfigService.isVisible(field, rawPayload)) {
            continue;
          }

          payload[field.name] = this.resolveFieldValue(field, rawPayload);

          if (field.hiddenKey && field.hiddenValue !== undefined) {
            payload[field.hiddenKey] = field.hiddenValue ?? null;
          }
        }

        for (const table of block.tables || []) {
          if (!this.tableConfigService.isVisible(table, rawPayload)) {
            continue;
          }

          if (this.isNestedDynamicTable(table)) {
            payload[table.id] = this.nestedTableToPayload(table);
            continue;
          }

          const rows = applyMatrixFormulas(table.rows || [], {
            tableId: table.id,
            formData: rawPayload,
          });

          payload[table.id] = this.rowsToPayload(rows);
        }
      }
    }

    return payload;
  }

  private buildRawFlatPayload(): any {
    const payload: any = {};
    const formulaTables: { id: string; rows: any[] }[] = [];
    const formulaFields: any[] = [];

    for (const section of this.schema?.sections || []) {
      for (const block of this.getSectionBlocks(section)) {
        for (const field of block.fields || []) {
          if (!field?.name) continue;

          payload[field.name] = field.value ?? null;

          if (field.formula) {
            formulaFields.push(field);
          }

          if (field.hiddenKey && field.hiddenValue !== undefined) {
            payload[field.hiddenKey] = field.hiddenValue ?? null;
          }
        }

        for (const table of block.tables || []) {
          if (!table?.id) continue;

          if (this.isNestedDynamicTable(table)) {
            payload[table.id] = this.nestedTableToPayload(table);
            continue;
          }

          payload[table.id] = this.rowsToPayload(table.rows || []);
          formulaTables.push({ id: table.id, rows: table.rows || [] });
        }
      }
    }

    for (const table of formulaTables) {
      const rows = applyMatrixFormulas(table.rows, {
        tableId: table.id,
        formData: payload,
      });

      payload[table.id] = this.rowsToPayload(rows);
    }

    for (const field of formulaFields) {
      if (!field?.name) continue;
      payload[field.name] = this.resolveFieldValue(field, payload);
    }

    return payload;
  }

  private resolveFieldValue(field: any, formData: Record<string, any>): any {
    if (field?.formula?.expression) {
      return evaluateFormulaExpression(field.formula, formData || {});
    }

    return field?.value ?? null;
  }

  private resolveChangedFieldName(
    previousSection: DynamicSectionSchema | undefined,
    nextSection: DynamicSectionSchema | undefined,
  ): string | null {
    const previousValues = this.collectFieldValues(previousSection);
    const nextValues = this.collectFieldValues(nextSection);

    for (const [name, nextValue] of nextValues.entries()) {
      if (!previousValues.has(name)) continue;
      if (!this.areValuesEqual(previousValues.get(name), nextValue)) {
        return name;
      }
    }

    return null;
  }

  private collectFieldValues(section: DynamicSectionSchema | undefined): Map<string, any> {
    const values = new Map<string, any>();
    if (!section) return values;

    for (const field of this.collectFieldsFromSection(section)) {
      if (!field?.name || values.has(field.name)) continue;
      values.set(field.name, field.value);
    }

    return values;
  }

  private collectFieldsFromSection(section: any): any[] {
    const fields: any[] = [...(section?.fields || [])];
    const sectionGroup = section?.sectionGroup;

    if (sectionGroup && typeof sectionGroup === 'object') {
      Object.entries(sectionGroup).forEach(([key, value]) => {
        if (!/^fields_\d+$/.test(key) || !Array.isArray(value)) return;
        fields.push(...value);
      });
    }

    return fields;
  }

  private areValuesEqual(left: any, right: any): boolean {
    if (Array.isArray(left) || Array.isArray(right)) {
      return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
    }
    return String(left ?? '') === String(right ?? '');
  }

  private async refreshDependentDropdowns(parentFieldName: string, visited = new Set<string>()): Promise<void> {
    if (visited.has(parentFieldName)) return;
    visited.add(parentFieldName);

    const dependents = this.findDependentFields(parentFieldName);
    if (!dependents.length) return;

    for (const dependent of dependents) {
      const dependentName = dependent?.name || dependent?.key;
      if (!dependentName) continue;

      const formData = this.buildRawFlatPayload();
      if (!this.hasDependencyValues(dependent, formData)) {
        this.updateFieldByName(dependentName, (field) => ({
          ...field,
          value: this.emptyFieldValue(field),
          options: [],
        }));
        await this.refreshDependentDropdowns(dependentName, visited);
        continue;
      }

      try {
        const options = await this.loadDependentOptions(dependent, formData);
        const currentValue = dependent.value;
        const nextValue = this.isValueAvailableInOptions(currentValue, options)
          ? currentValue
          : this.emptyFieldValue(dependent);

        this.updateFieldByName(dependentName, (field) => ({
          ...field,
          value: nextValue,
          options,
        }));

        if (!this.isEmptyRequiredValue(nextValue, dependent.type)) {
          await this.refreshDependentDropdowns(dependentName, visited);
        } else {
          await this.clearDependentDropdowns(dependentName, visited);
        }
      } catch (error) {
        console.warn(`Failed to load dependent dropdown: ${dependentName}`, error);
        this.updateFieldByName(dependentName, (field) => ({
          ...field,
          value: this.emptyFieldValue(field),
          options: [],
        }));
        await this.clearDependentDropdowns(dependentName, visited);
      }
    }
  }

  private async clearDependentDropdowns(parentFieldName: string, visited = new Set<string>()): Promise<void> {
    if (visited.has(`clear:${parentFieldName}`)) return;
    visited.add(`clear:${parentFieldName}`);

    for (const dependent of this.findDependentFields(parentFieldName)) {
      const dependentName = dependent?.name || dependent?.key;
      if (!dependentName) continue;

      this.updateFieldByName(dependentName, (field) => ({
        ...field,
        value: this.emptyFieldValue(field),
        options: [],
      }));
      await this.clearDependentDropdowns(dependentName, visited);
    }
  }

  private findDependentFields(parentFieldName: string): any[] {
    const dependents = new Map<string, any>();

    for (const section of this.schema?.sections || []) {
      for (const field of this.collectFieldsFromSection(section)) {
        const name = field?.name || field?.key;
        if (!name || dependents.has(name)) continue;
        if (this.fieldDependsOn(field, parentFieldName)) {
          dependents.set(name, field);
        }
      }
    }

    return Array.from(dependents.values());
  }

  private fieldDependsOn(field: any, parentFieldName: string): boolean {
    const dependsOn = field?.api?.dependsOn;
    if (Array.isArray(dependsOn) && dependsOn.includes(parentFieldName)) return true;
    if (dependsOn === parentFieldName) return true;
    return this.valueReferencesFormField(field?.api?.params, parentFieldName);
  }

  private valueReferencesFormField(value: any, fieldName: string): boolean {
    if (value == null) return false;
    if (typeof value === 'string') {
      return new RegExp(`\\{\\{\\s*form\\.${fieldName}\\s*\\}\\}`).test(value);
    }
    if (Array.isArray(value)) return value.some((item) => this.valueReferencesFormField(item, fieldName));
    if (typeof value === 'object') {
      return Object.values(value).some((item) => this.valueReferencesFormField(item, fieldName));
    }
    return false;
  }

  private hasDependencyValues(field: any, formData: Record<string, any>): boolean {
    const dependencies = this.getDependencyNames(field);
    return dependencies.every((name) => !this.isBlankValue(formData?.[name]));
  }

  private getDependencyNames(field: any): string[] {
    const names = new Set<string>();
    const dependsOn = field?.api?.dependsOn;

    if (Array.isArray(dependsOn)) {
      dependsOn.forEach((name) => names.add(String(name)));
    } else if (dependsOn) {
      names.add(String(dependsOn));
    }

    this.collectFormReferences(field?.api?.params).forEach((name) => names.add(name));
    return Array.from(names);
  }

  private collectFormReferences(value: any): string[] {
    const names = new Set<string>();
    const visit = (node: any) => {
      if (node == null) return;
      if (typeof node === 'string') {
        const regex = /\{\{\s*form\.([^}\s]+)\s*\}\}/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(node))) {
          names.add(match[1]);
        }
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (typeof node === 'object') {
        Object.values(node).forEach(visit);
      }
    };

    visit(value);
    return Array.from(names);
  }

  private async loadDependentOptions(field: any, formData: Record<string, any>): Promise<any[]> {
    const api = field?.api || {};
    const endpoint = api.url || api.endpoint;
    if (!endpoint) return [];

    const params = this.resolveDynamicParams(api.params, formData);
    const response = await firstValueFrom(this.apiService.get<any>(endpoint, params));
    const items = this.extractList(response, api.responsePath);

    return this.mapItemsToOptions(
      items,
      api.labelKey || 'label',
      api.valueKey || 'value',
      api.childrenKey || 'children',
    );
  }

  private resolveDynamicParams(params: Record<string, any> | undefined, formData: Record<string, any>): Record<string, any> {
    if (!params || typeof params !== 'object') return {};

    return Object.entries(params).reduce((resolved: Record<string, any>, [key, value]) => {
      const nextValue = this.resolveDynamicValue(value, formData);
      if (nextValue !== null && nextValue !== undefined && nextValue !== '') {
        resolved[key] = nextValue;
      }
      return resolved;
    }, {});
  }

  private resolveDynamicValue(value: any, formData: Record<string, any>): any {
    if (value == null) return value;

    if (typeof value === 'string') {
      const exactFormMatch = value.match(/^\{\{\s*form\.([^}]+)\s*\}\}$/);
      if (exactFormMatch) return this.resolvePath(formData, exactFormMatch[1]);

      const exactContextMatch = value.match(/^\{\{\s*context\.([^}]+)\s*\}\}$/);
      if (exactContextMatch) return this.resolvePath(this.context, exactContextMatch[1]);

      return value
        .replace(/\{\{\s*form\.([^}]+)\s*\}\}/g, (_, key: string) => String(this.resolvePath(formData, key) ?? ''))
        .replace(/\{\{\s*context\.([^}]+)\s*\}\}/g, (_, key: string) => String(this.resolvePath(this.context, key) ?? ''));
    }

    if (Array.isArray(value)) return value.map((item) => this.resolveDynamicValue(item, formData));

    if (typeof value === 'object') {
      return Object.entries(value).reduce((resolved: Record<string, any>, [key, nestedValue]) => {
        resolved[key] = this.resolveDynamicValue(nestedValue, formData);
        return resolved;
      }, {});
    }

    return value;
  }

  private extractList(response: any, responsePath?: string): any[] {
    let data = response;
    if (responsePath) {
      for (const part of String(responsePath).split('.')) {
        if (!part) continue;
        data = data?.[part];
      }
    }

    if (Array.isArray(data)) return data;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.results)) return response.results;
    if (Array.isArray(response?.result)) return response.result;
    return [];
  }

  private mapItemsToOptions(items: any[], labelKey: string, valueKey: string, childrenKey: string): any[] {
    return (items || []).map((item) => ({
      label: String(this.resolvePath(item, labelKey) ?? item?.label ?? item?.name ?? this.resolvePath(item, valueKey) ?? ''),
      value: this.resolvePath(item, valueKey) ?? item?.value ?? item?.id ?? item,
      raw: item,
      htmlTag: item?.htmlTag,
      children: Array.isArray(item?.[childrenKey])
        ? this.mapItemsToOptions(item[childrenKey], labelKey, valueKey, childrenKey)
        : undefined,
    }));
  }

  private updateFieldByName(fieldName: string, updater: (field: any) => any): void {
    this.schema = {
      ...this.schema,
      sections: (this.schema?.sections || []).map((section) => this.updateFieldInSection(section, fieldName, updater)),
    };
  }

  private updateFieldInSection(section: any, fieldName: string, updater: (field: any) => any): any {
    const updateFields = (fields: any[] = []) =>
      fields.map((field) => (field?.name === fieldName || field?.key === fieldName ? updater(field) : field));

    const nextSection: any = {
      ...section,
      fields: updateFields(section?.fields || []),
    };

    if (section?.sectionGroup && typeof section.sectionGroup === 'object') {
      nextSection.sectionGroup = Object.entries(section.sectionGroup).reduce((group: Record<string, any>, [key, value]) => {
        group[key] = /^fields_\d+$/.test(key) && Array.isArray(value) ? updateFields(value) : value;
        return group;
      }, {});
    }

    return nextSection;
  }

  private emptyFieldValue(field: any): any {
    return ['multiselect', 'checkbox-multiple'].includes(field?.type) ? [] : null;
  }

  private isValueAvailableInOptions(value: any, options: any[]): boolean {
    if (this.isBlankValue(value)) return false;
    const flatOptions = this.flattenOptions(options);

    if (Array.isArray(value)) {
      return value.every((item) => flatOptions.some((option) => this.areValuesEqual(option.value, item)));
    }

    return flatOptions.some((option) => this.areValuesEqual(option.value, value));
  }

  private flattenOptions(options: any[]): any[] {
    return (options || []).flatMap((option) => [option, ...this.flattenOptions(option?.children || [])]);
  }

  private isBlankValue(value: any): boolean {
    if (Array.isArray(value)) return value.length === 0;
    return value === null || value === undefined || value === '';
  }

  private resolvePath(source: any, path: string): any {
    return String(path || '')
      .split('.')
      .filter(Boolean)
      .reduce((acc: any, key: string) => acc?.[key], source);
  }

  private rowsToPayload(rows: any[]): any[] {
    return (rows || []).map((row: any) => {
      const rowObj: any = {};

      for (const cell of row.cells || []) {
        if (cell.key) rowObj[cell.key] = cell.value ?? null;

        if (cell.hiddenKey && cell.hiddenValue !== undefined) {
          rowObj[cell.hiddenKey] = cell.hiddenValue ?? null;
        }
      }

      return rowObj;
    });
  }

  private isNestedDynamicTable(table: any): boolean {
    return table?.sectionType === 'nestedDynamicTable';
  }

  private nestedTableToPayload(table: any): any {
    const clone = structuredClone(table);
    delete clone._renderKey;
    return clone;
  }

  setActiveTab(tab: any): void {
    if (this.activeTab?.id === tab?.id) return;

    this.activeTab = tab;

    this.api.setCurrentEquipmentNomenclature(tab);

    this.equipmentChange.emit({
      id: tab?.id,
      name: tab?.name,
      nomenclature: tab?.nomenclature,
    });

    this.cdr.markForCheck();
  }

  private getSectionBlocks(
    section: any,
  ): { fields: any[]; tables: any[] }[] {
    const blocks: { fields: any[]; tables: any[] }[] = [
      {
        fields: section?.fields || [],
        tables: section?.tables || [],
      },
    ];

    const sectionGroup = section?.sectionGroup;
    if (!sectionGroup || typeof sectionGroup !== 'object') return blocks;

    const grouped = new Map<number, { fields: any[]; tables: any[] }>();

    Object.entries(sectionGroup).forEach(([key, value]) => {
      const match = key.match(/^(fields|tables)_(\d+)$/);
      if (!match || !Array.isArray(value)) return;

      const groupIndex = Number(match[2]);
      const group = grouped.get(groupIndex) || {
        fields: [],
        tables: [],
      };

      if (match[1] === 'fields') group.fields = value;
      if (match[1] === 'tables') group.tables = value;

      grouped.set(groupIndex, group);
    });

    return [
      ...blocks,
      ...Array.from(grouped.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, group]) => group),
    ];
  }

  goback(): void {
    window.history.back();
  }
}
