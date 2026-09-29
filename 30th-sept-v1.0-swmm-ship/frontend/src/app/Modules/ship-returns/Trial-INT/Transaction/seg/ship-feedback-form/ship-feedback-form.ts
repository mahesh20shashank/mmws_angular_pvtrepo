import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, finalize, switchMap } from 'rxjs';
import { getStoredUser } from '../../../../../../shared/utils/user-satellite-unit';
import {
  loadSegTrialContext,
  resolveSegTrialJsonSaved,
} from '../seg-form-trial.service';
import { SEG_TRIALS_API } from '../seg-trials-tabs.shared';
import {
  SHIP_FEEDBACK_API,
  buildShipFeedbackApiPayload,
  buildShipFeedbackInfoFromForm,
  isShipFeedbackRecordSubmitted,
  mmdWorkingToFormValue,
  mapShipFeedbackRowToFormData,
  mapTrialRowToShipFeedbackFormData,
  resolveShipFeedbackApiRow,
  shipFeedbackPatchFromSavedJson,
} from './seg-ship-feedback-form.shared';
import { FormCardComponent } from '../../../ui/master-compat';
import { LucideAngularModule, Star } from '../../../ui/lucide-compat';
import { InputComponent } from '../../../ui/input.component';
import { TextareaComponent } from '../../../ui/textarea';
import { ApiService } from '../../../api.service';
import { FormApiService } from '../../../angulerFromconverting/form-api.service';
import { ToastService } from '../../../services/toast.service';
import { resolveTrialQueryParam } from '../../../trial-route-prefill';

@Component({
  selector: 'app-ship-feedback-form',
  templateUrl: './ship-feedback-form.html',
  standalone: true,
  host: {
    class: 'block min-h-0',
    '[class.flex]': '!popupMode',
    '[class.h-full]': '!popupMode',
    '[class.flex-1]': '!popupMode',
    '[class.flex-col]': '!popupMode',
    '[class.overflow-hidden]': '!popupMode',
  },
  styles: [
    `
      .ship-feedback-form .sf-star-btn {
        padding: 2px;
        border: none;
        background: transparent;
        cursor: pointer;
        line-height: 0;
      }
      .ship-feedback-form .sf-star-btn--readonly,
      .ship-feedback-form--readonly .sf-star-btn {
        cursor: default;
        pointer-events: none;
      }
      .ship-feedback-form .sf-star-btn:focus-visible {
        outline: 2px solid var(--shell-accent, #2563eb);
        outline-offset: 2px;
        border-radius: 2px;
      }
      .ship-feedback-form .sf-star-icon {
        width: 1.5rem;
        height: 1.5rem;
        color: var(--shell-text-faint, #94a3b8);
        stroke-width: 1.5;
      }
      .ship-feedback-form .sf-star-active .sf-star-icon {
        color: #f59e0b;
        fill: color-mix(in srgb, #f59e0b 35%, transparent);
      }
      .ship-feedback-form--readonly {
        opacity: 0.95;
      }
      .ship-feedback-form input[type='radio'] {
        width: 1rem;
        height: 1rem;
        accent-color: var(--shell-accent, #61c2ff);
      }
      .ship-feedback-form label.flex.items-center span {
        color: var(--shell-text-secondary);
      }
    `,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LucideAngularModule,
    InputComponent,
    TextareaComponent,
  ],
})
export class ShipFeedbackFormComponent implements OnInit, OnChanges {
  @Input() popupMode = false;
  @Input() trialRow: Record<string, unknown> | null = null;

  @Output() saved = new EventEmitter<void>();

  editMode = false;
  rowId: string | null = null;
  workflowTrialId: string | undefined;

  form!: FormGroup;
  loading = false;
  isSubmitted = false;
  showMmdReason = false;
  hoveredStar = 0;

  readonly StarIcon = Star;

  readonly starRatingLabels: Record<number, string> = {
    1: 'Poor',
    2: 'Fair',
    3: 'Good',
    4: 'Very good',
    5: 'Excellent',
  };

  readonly starRatingOptions = [
    { label: '1', value: '1' },
    { label: '2', value: '2' },
    { label: '3', value: '3' },
    { label: '4', value: '4' },
    { label: '5', value: '5' },
  ];

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly apiService: ApiService,
    public formApiService: FormApiService,
    private readonly toastService: ToastService,
  ) {}

  get isReadOnly(): boolean {
    return this.isSubmitted;
  }

  get canSubmit(): boolean {
    if (this.isReadOnly) {
      return false;
    }
    if (this.popupMode) {
      return true;
    }
    return this.formApiService?.context?.workflow_rights?.can_edit !== false;
  }

  get canShowSaveDraft(): boolean {
    if (!this.canSubmit) return false;
    const raw =
      this.formApiService?.context?.workflow_rights?.save_draft ??
      this.formApiService?.context?.save_draft;
    return raw !== false;
  }

  ngOnInit(): void {
    if (!this.popupMode) {
      this.rowId = this.route.snapshot.paramMap.get('id');
      this.editMode = !!this.rowId;
    }
    this.buildForm();
    this.applyStoredUserNameRank();
    this.listenToMmdWorkingChanges();
    void this.initializeTrialData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      this.popupMode &&
      changes['trialRow'] &&
      !changes['trialRow'].firstChange &&
      this.form
    ) {
      void this.loadFromTrialRow(this.trialRow);
    }
  }

  private async initializeTrialData(): Promise<void> {
    if (this.popupMode) {
      await this.loadFromTrialRow(this.trialRow);
      return;
    }
    await this.loadTrialPrefillFromQuery();
  }

  private async loadFromTrialRow(
    trialRow: Record<string, unknown> | null | undefined,
  ): Promise<void> {
    if (!trialRow) return;

    const trialId = String(trialRow['uuid'] || trialRow['trial_uuid'] || '');
    this.workflowTrialId = trialId || undefined;
    this.formApiService.setCurrentForm(trialId, 'ship_feedback_form');
    this.formApiService.context = trialRow;

    if (trialRow['id'] != null) {
      this.rowId = String(trialRow['id']);
      this.editMode = true;
    }

    let patch = mapTrialRowToShipFeedbackFormData(trialRow);
    let submitted = false;

    if (this.popupMode && trialId) {
      try {
        const response = await firstValueFrom(
          this.apiService.get(SHIP_FEEDBACK_API, { trial: trialId }),
        );
        const apiRow = resolveShipFeedbackApiRow(response);
        if (apiRow) {
          patch = { ...patch, ...mapShipFeedbackRowToFormData(apiRow) };
          submitted = isShipFeedbackRecordSubmitted(apiRow);
        }
      } catch {
        const jsonSaved = resolveSegTrialJsonSaved(trialRow, null);
        const fromDraft = jsonSaved
          ? shipFeedbackPatchFromSavedJson(jsonSaved)
          : null;
        if (fromDraft) {
          patch = { ...patch, ...fromDraft };
          submitted = isShipFeedbackRecordSubmitted(fromDraft);
        }
      }
    } else {
      const jsonSaved = resolveSegTrialJsonSaved(trialRow, null);
      const fromDraft = jsonSaved
        ? shipFeedbackPatchFromSavedJson(jsonSaved)
        : null;
      if (fromDraft) {
        patch = { ...patch, ...fromDraft };
        submitted = isShipFeedbackRecordSubmitted(fromDraft);
      }
    }

    const storedUserPatch = this.getStoredUserNameRankPatch();
    if (storedUserPatch) {
      patch = { ...patch, ...storedUserPatch };
    }

    this.applyFormPatch(patch, submitted);
  }

  private async loadTrialPrefillFromQuery(): Promise<void> {
    const loaded = await loadSegTrialContext({
      formApi: this.formApiService,
      route: this.route,
      router: this.router,
      formKey: 'ship_feedback_form',
    });
    if (!loaded) return;

    this.workflowTrialId = loaded.trialId;
    if (loaded.trialRow['id'] != null) {
      this.rowId = String(loaded.trialRow['id']);
      this.editMode = true;
    }

    let patch = mapTrialRowToShipFeedbackFormData(loaded.trialRow);
    const fromDraft = loaded.jsonSaved
      ? shipFeedbackPatchFromSavedJson(loaded.jsonSaved)
      : null;
    if (fromDraft) patch = { ...patch, ...fromDraft };

    const storedUserPatch = this.getStoredUserNameRankPatch();
    if (storedUserPatch) {
      patch = { ...patch, ...storedUserPatch };
    }

    this.applyFormPatch(
      patch,
      isShipFeedbackRecordSubmitted(fromDraft ?? patch),
    );
  }

  private applyFormPatch(
    patch: Record<string, unknown>,
    submitted = false,
  ): void {
    this.patchFormIncludingDisabledControls(patch);
    this.showMmdReason = mmdWorkingToFormValue(patch['mmd_working']) === 'no';
    this.applyReadOnlyState(submitted);
    this.cdr.detectChanges();
  }

  private applyStoredUserNameRank(): void {
    const storedUserPatch = this.getStoredUserNameRankPatch();
    if (!storedUserPatch) {
      return;
    }

    this.patchFormIncludingDisabledControls(storedUserPatch);
    this.form.get('name')?.disable({ emitEvent: false });
    this.form.get('rank')?.disable({ emitEvent: false });
    this.cdr.detectChanges();
  }

  /** Angular skips patchValue on disabled controls; briefly enable to update fields. */
  private patchFormIncludingDisabledControls(
    patch: Record<string, unknown>,
  ): void {
    this.form.get('name')?.enable({ emitEvent: false });
    this.form.get('rank')?.enable({ emitEvent: false });
    this.form.patchValue(patch, { emitEvent: false });
  }

  private getStoredUserNameRankPatch(): { name: string; rank: string } | null {
    const user = getStoredUser();
    const firstName = String(user['first_name'] ?? '').trim();
    const lastName = String(user['last_name'] ?? '').trim();
    const name = [firstName, lastName].filter(Boolean).join(' ').trim();
    const rank = String(user['rank_code'] ?? '').trim();

    if (!name && !rank) {
      return null;
    }

    return { name, rank };
  }

  private applyReadOnlyState(readOnly: boolean): void {
    this.isSubmitted = readOnly;
    if (!this.form) return;

    this.form.get('name')?.disable({ emitEvent: false });
    this.form.get('rank')?.disable({ emitEvent: false });

    const editableFields = [
      'mmd_working',
      'mmd_not_working_reason',
      'seg_rating',
      'other_comments',
    ];

    if (readOnly) {
      editableFields.forEach((key) => {
        this.form.get(key)?.disable({ emitEvent: false });
      });
      return;
    }

    editableFields.forEach((key) => {
      this.form.get(key)?.enable({ emitEvent: false });
    });
  }

  private buildForm(): void {
    this.form = this.fb.group({
      name: [{ value: '', disabled: true }, Validators.required],
      rank: [{ value: '', disabled: true }],
      mmd_working: ['yes'],
      mmd_not_working_reason: [''],
      seg_rating: ['', Validators.required],
      other_comments: [''],
    });
  }

  get selectedStar(): number {
    const raw = this.form?.get('seg_rating')?.value;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 0;
  }

  get starRatingCaption(): string {
    if (!this.selectedStar) {
      return 'Select a rating';
    }
    const label = this.starRatingLabels[this.selectedStar] ?? '';
    return label ? `${this.selectedStar} / 5 — ${label}` : `${this.selectedStar} / 5`;
  }

  setStarRating(value: string): void {
    if (this.isReadOnly) return;
    this.form.get('seg_rating')?.setValue(value);
    this.form.get('seg_rating')?.markAsTouched();
    this.cdr.detectChanges();
  }

  isStarFilled(starValue: string): boolean {
    const active = this.hoveredStar || this.selectedStar;
    return active >= Number(starValue);
  }

  private listenToMmdWorkingChanges(): void {
    this.form.get('mmd_working')?.valueChanges.subscribe((value) => {
      this.showMmdReason = value === 'no';
      if (value !== 'no') {
        this.form.get('mmd_not_working_reason')?.reset('');
      }
      this.cdr.detectChanges();
    });
  }

  validateForm(): boolean {
    const raw = this.form.getRawValue();
    if (!String(raw.name ?? '').trim()) {
      this.toastService.showError('Unable to load user name.');
      return false;
    }

    const mmdWorking = this.form.get('mmd_working')?.value;
    if (mmdWorking === 'no' && !this.form.get('mmd_not_working_reason')?.value?.trim()) {
      this.form.get('mmd_not_working_reason')?.markAsTouched();
      this.toastService.showError('Please specify reason when MMD is not working.');
      return false;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const missing = ['seg_rating']
        .filter((key) => this.form.get(key)?.invalid)
        .map((key) => {
          const labels: Record<string, string> = {
            seg_rating: 'SEG service rating',
          };
          return labels[key] ?? key;
        });
      this.toastService.showError(
        missing.length
          ? `Please complete: ${missing.join(', ')}.`
          : 'Please fill all required fields correctly.',
      );
      return false;
    }
    return true;
  }

  private buildSavePayload(): Record<string, unknown> {
    return {
      shipFeedbackInfo: buildShipFeedbackInfoFromForm(this.collectFormPayload()),
    };
  }

  private collectFormPayload(): Record<string, unknown> {
    return {
      ...this.form.getRawValue(),
      other_comments: this.form.get('other_comments')?.value ?? '',
    };
  }

  private resolveTrialId(): string {
    return (
      this.workflowTrialId ||
      resolveTrialQueryParam(this.route, this.router) ||
      String(this.trialRow?.['uuid'] ?? this.trialRow?.['trial_uuid'] ?? '') ||
      ''
    );
  }

  async handleSave(mode: 'draft' | 'save'): Promise<void> {
    if (!this.canSubmit) return;
    if (mode === 'save' && !this.validateForm()) return;

    const trialId = this.resolveTrialId();
    if (!trialId) {
      this.toastService.showError('Trial reference is missing.');
      return;
    }

    const formPayload = this.buildSavePayload();
    this.loading = true;

    if (this.popupMode) {
      const trialsPayload = {
        id: trialId,
        json_data: formPayload,
      };

      if (mode === 'draft') {
        this.apiService
          .post(SEG_TRIALS_API, trialsPayload)
          .pipe(
            finalize(() => {
              this.loading = false;
              this.cdr.detectChanges();
            }),
          )
          .subscribe({
            next: () => {
              this.toastService.showSuccess('Draft saved successfully');
            },
            error: (err: { message?: string }) => {
              this.toastService.showError(
                err?.message || 'Failed to save draft',
              );
            },
          });
        return;
      }

      this.apiService
        .post(SEG_TRIALS_API, trialsPayload)
        .pipe(
          switchMap(() =>
            this.apiService.post(
              SHIP_FEEDBACK_API,
              buildShipFeedbackApiPayload(trialId, this.collectFormPayload()),
            ),
          ),
          switchMap(() =>
            this.apiService.post('api/data/status-change/', {
              trial: trialId,
              ship_feedback_status: 'Submitted',
            }),
          ),
          finalize(() => {
            this.loading = false;
            this.cdr.detectChanges();
          }),
        )
        .subscribe({
          next: () => {
            this.toastService.showSuccess('Ship feedback submitted successfully');
            this.applyReadOnlyState(true);
            this.saved.emit();
          },
          error: (err: { message?: string }) => {
            this.toastService.showError(
              err?.message || 'Failed to submit ship feedback',
            );
          },
        });
      return;
    }

    if (mode === 'draft') {
      this.formApiService.saveDraft(formPayload, trialId).subscribe({
        next: () => this.toastService.showSuccess('Draft saved successfully'),
        error: () => this.toastService.showError('Failed to save draft'),
        complete: () => {
          this.loading = false;
        },
      });
      return;
    }

    this.formApiService.submitForm(formPayload, trialId).subscribe({
      next: () => {
        this.toastService.showSuccess('Form submitted successfully');
        this.applyReadOnlyState(true);
        setTimeout(() => this.router.navigate(['/seg/ship_feedback_form']), 800);
      },
      error: () => this.toastService.showError('Failed to submit form'),
      complete: () => {
        this.loading = false;
      },
    });
  }

  async handleSubmit(): Promise<void> {
    await this.handleSave('save');
  }
}
