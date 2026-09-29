import { CommonModule, Location } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormCardComponent } from '../../ui/form-card/form-card.component';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { defaultIfEmpty, finalize, firstValueFrom, Subject, takeUntil } from 'rxjs';
import { FormApiService } from '../../angulerFromconverting/form-api.service';
import { SelectComponent, SelectOption } from '../../ui/select.component';
import { TextareaComponent } from '../../ui/textarea';
import { CalenderComponent } from '../../ui/calender.component';
import { MultiSelectDropdownComponent } from '../../ui/multiselect';
import {
  FileUploadComponent,
  UploadedFileItem,
} from '../../ui/file-upload/file-upload.component';
import { ApiService, RequestParams } from '../../api.service';
import { ToastService } from '../../services/toast.service';
import { resolveTrialQueryParam, fetchTrialPrefill } from '../../trial-route-prefill';
import { equipmentHtml } from '../../ApiEndPoints';
import { ApprovalWorkFlow } from '../../ui/approval-work-flow/approval-work-flow';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';
import { LucideCompass } from '@lucide/angular';

const DD = { labelKey: 'name' as const, valueKey: 'id' as const };
type RequisitionFormValue = {
  trial_unit_id: string;
  satellite_unit_id: string;
  trial_occasion_id: string;
  department_ids: string[];
  section_ids: string[];
  equipment_ids: string[];
  presented_by_id: string;
  reason_for_trial: string;
  proposed_date: string;
  reference_document: UploadedFileItem | UploadedFileItem[] | null;
  remarks: string;
};

function stringifyId(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    if (row['id'] != null && row['id'] !== '') {
      return String(row['id']);
    }
    if (row['value'] != null && row['value'] !== '') {
      return String(row['value']);
    }
  }
  return String(value);
}

function ensureSelectOption(options: SelectOption[], value: string, label?: string): SelectOption[] {
  if (options.some((option) => String(option.value) === String(value))) return options;
  return [...options, { value: String(value), label: label || String(value) }];
}

function hasPatchValues(patch: Record<string, unknown>): boolean {
  return Object.values(patch).some((value) =>
    Array.isArray(value) ? value.length > 0 : value != null && value !== '',
  );
}

function resolveTrialDateString(row: Record<string, unknown>): string {
  return String(row['proposed_date'] ?? row['trial_date'] ?? row['date'] ?? '').slice(0, 10);
}

function getStoredUser(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Read department FK from a section API row (`department` / `department_id` / nested object). */
function resolveDepartmentIdFromSection(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) return '';
  return stringifyId(row['department'] ?? row['department_id']);
}

function resolveDepartmentLabelFromSection(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) return '';
  const raw = row['department'] ?? row['department_id'];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const dept = raw as Record<string, unknown>;
    return String(dept['name'] ?? dept['label'] ?? '').trim();
  }
  return String(row['department_name'] ?? '').trim();
}

function resolveIdList(value: unknown): string[] {
  if (value == null || value === '') return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter((item) => item != null && item !== '')
    .map((item) => stringifyId(item))
    .filter(Boolean);
}

function pickDetailIds(details: unknown, key: string): string[] {
  if (!Array.isArray(details)) return [];
  return details
    .map((item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)[key]
        : null,
    )
    .filter((id) => id != null && String(id).trim() !== '')
    .map((id) => String(id));
}

function resolveRequisitionEquipmentIds(
  row: Record<string, unknown> | null | undefined,
): string[] {
  if (!row) return [];
  const fromTop = resolveIdList(row['equipment_ids']);
  if (fromTop.length) return fromTop;
  return pickDetailIds(row['equipment_details'], 'equipment_id');
}

function mapTrialRowToRequisitionPatch(
  trialRow: Record<string, unknown>,
): Partial<RequisitionFormValue> {
  return {
    trial_unit_id: stringifyId(
      trialRow['trial_unit_id'] ?? trialRow['trial_unit'],
    ),
    satellite_unit_id: stringifyId(
      trialRow['satellite_unit_id'] ?? trialRow['satellite_unit'],
    ),
    section_ids: resolveIdList(
      trialRow['section_ids'] ?? trialRow['section_id'],
    ),
    equipment_ids: resolveRequisitionEquipmentIds(trialRow),
    department_ids: resolveIdList(
      trialRow['department_ids'] ??
      trialRow['department_id'] ??
      trialRow['department'],
    ),
    proposed_date: resolveTrialDateString(trialRow),
  };
}

function extractFileIdFromPath(filePath?: string): string | null {
  if (!filePath) return null;
  const match = String(filePath).match(/api\/files\/([^/]+)\/?$/i);
  return match?.[1] ?? null;
}

function resolveReferenceDocumentId(
  value: UploadedFileItem | UploadedFileItem[] | null | undefined,
  savedId?: unknown,
): string | null {
  if (value) {
    const file = Array.isArray(value) ? value[0] : value;
    if (file?.id != null && String(file.id).trim() !== '') {
      return String(file.id);
    }

    const fromPath = extractFileIdFromPath(file?.file_path);
    if (fromPath) return fromPath;
  }

  if (savedId != null && String(savedId).trim() !== '') {
    return String(savedId);
  }

  return null;
}

function referenceDocumentFromSaved(
  saved: Record<string, unknown>,
): UploadedFileItem | null {
  const doc = saved['reference_document'];
  if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
    const row = doc as UploadedFileItem;
    if (row.name && row.file_path) {
      return {
        ...row,
        id: row.id ?? resolveReferenceDocumentId(row) ?? undefined,
      };
    }
  }

  const id = saved['reference_document_id'];
  if (id == null || id === '') return null;

  const idStr = String(id);
  return {
    id: idStr,
    name: String(saved['reference_document_name'] ?? 'Reference document'),
    file_path: `api/files/${idStr}/`,
  };
}

function mapRequisitionSavedRow(
  saved: Record<string, unknown>,
): Partial<RequisitionFormValue> {
  return {
    trial_unit_id: stringifyId(saved['trial_unit_id']),
    satellite_unit_id: stringifyId(saved['satellite_unit_id']),
    trial_occasion_id: stringifyId(
      saved['trial_occasion_id'] ?? saved['trial_occasion'],
    ),
    department_ids: resolveIdList(
      saved['department_ids'] ?? saved['department_id'] ?? saved['department'],
    ),
    section_ids: resolveIdList(saved['section_ids'] ?? saved['section_id']),
    equipment_ids: resolveRequisitionEquipmentIds(saved),
    presented_by_id: stringifyId(
      saved['presented_by_id'] ?? saved['presented_by'],
    ),
    reason_for_trial: String(saved['reason_for_trial'] ?? ''),
    proposed_date: String(
      saved['proposed_date'] ?? saved['trial_date'] ?? '',
    ).slice(0, 10),
    reference_document: referenceDocumentFromSaved(saved),
    remarks: String(saved['remarks'] ?? ''),
  };
}

function requisitionPatchFromSavedJson(
  saved: Record<string, unknown> | null | undefined,
): Partial<RequisitionFormValue> | null {
  if (!saved || typeof saved !== 'object') return null;
  const mapped = mapRequisitionSavedRow(saved);
  return hasPatchValues(mapped as Record<string, unknown>) ? mapped : null;
}

function mergeRequisitionOptionsFromTrial(
  options: {
    trialUnit: SelectOption[];
    satelliteUnit: SelectOption[];
    section: SelectOption[];
    equipment: SelectOption[];
  },
  trialRow: Record<string, unknown> | null | undefined,
  patch: Partial<RequisitionFormValue>,
): {
  trialUnit: SelectOption[];
  satelliteUnit: SelectOption[];
  section: SelectOption[];
  equipment: SelectOption[];
} {
  if (!trialRow) return options;

  let trialUnit = options.trialUnit;
  let satelliteUnit = options.satelliteUnit;
  let section = options.section;
  let equipment = options.equipment;

  if (patch.trial_unit_id) {
    trialUnit = ensureSelectOption(
      trialUnit,
      patch.trial_unit_id,
      String(trialRow['trial_unit_name'] ?? ''),
    );
  }
  if (patch.satellite_unit_id) {
    satelliteUnit = ensureSelectOption(
      satelliteUnit,
      patch.satellite_unit_id,
      String(trialRow['satellite_unit_name'] ?? ''),
    );
  }

  for (const sectionId of patch.section_ids ?? []) {
    section = ensureSelectOption(section, sectionId);
  }

  const equipmentDetails = trialRow['equipment_details'];
  if (Array.isArray(equipmentDetails)) {
    for (const item of equipmentDetails) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const equipmentId = row['equipment_id'] ?? row['id'];
      const equipmentName = String(
        row['name'] ?? row['nomenclature'] ?? '',
      );
      if (equipmentId != null && equipmentId !== '') {
        equipment = ensureSelectOption(
          equipment,
          String(equipmentId),
          equipmentName,
        );
      }
    }
  }

  for (const equipmentId of patch.equipment_ids ?? []) {
    equipment = ensureSelectOption(equipment, equipmentId);
  }

  return { trialUnit, satelliteUnit, section, equipment };
}

function buildRequisitionSavePayload(
  formValue: RequisitionFormValue,
  referenceDocumentId: string | null,
): Record<string, unknown> {
  return {
    trial_unit_id: formValue.trial_unit_id,
    satellite_unit_id: formValue.satellite_unit_id,
    trial_occasion_id: formValue.trial_occasion_id,
    department_ids: formValue.department_ids ?? [],
    section_ids: formValue.section_ids ?? [],
    equipment_ids: formValue.equipment_ids ?? [],
    presented_by_id: formValue.presented_by_id || null,
    reason_for_trial: formValue.reason_for_trial,
    proposed_date: formValue.proposed_date || null,
    reference_document_id: referenceDocumentId,
    remarks: formValue.remarks || '',
  };
}

@Component({
  selector: 'app-requisition-form',
  standalone: true,
  host: {
    class: 'flex h-full min-h-0 flex-1 flex-col overflow-hidden',
  },
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    SelectComponent,
    TextareaComponent,
    CalenderComponent,
    MultiSelectDropdownComponent,
    FileUploadComponent,
    ApprovalWorkFlow, //Approvalworjlfow
    IconComponent,
  ],
  templateUrl: './requisition-form.html',
  styleUrl: './requisition-form.css',
})
export class RequisitionFormComponent implements OnInit, OnDestroy {
  @ViewChild('formCard') formCard?: FormCardComponent;

  readonly LucideCompass = LucideCompass;
  readonly draftIcon = 'file-text';
  readonly saveIcon = 'save';
  // For Pop-up workflow on submit button click
  shouldShowUserPopup = false;
  isSubmitTime = false;

  form!: FormGroup;
  loading = false;
  workflowTrialId: string | undefined;

  trialUnitOptions: SelectOption[] = [];
  satelliteUnitOptions: SelectOption[] = [];
  trialOccasionOptions: SelectOption[] = [];
  departmentOptions: SelectOption[] = [];
  sectionOptions: SelectOption[] = [];
  equipmentOptions: SelectOption[] = [];
  presentedByOptions: SelectOption[] = [];

  /** section id → department id. Empty string means looked up with no department. */
  private readonly sectionDepartmentById = new Map<string, string>();
  private trialContext: Record<string, unknown> | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly apiService: ApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
    private readonly location: Location,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    public readonly formApiService: FormApiService,
  ) { }

  get canEdit(): boolean {
    return this.formApiService?.context?.workflow_rights?.can_edit !== false;
  }

  //for hide of save dardt --> Tanishk
  get canSaveDraft(): boolean {
    return this.formApiService?.context?.workflow_rights?.save_draft !== false;
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      // Locked in template via [disabled]="true" — prefilled from trial.
      trial_unit_id: ['', Validators.required],
      satellite_unit_id: ['', Validators.required],
      proposed_date: [''],
      equipment_ids: [[], Validators.required],
      section_ids: [[], Validators.required],
      // Prefills from section.department via master/departments/, but remains editable.
      department_ids: [[]],
      trial_occasion_id: ['', Validators.required],
      presented_by_id: [''],
      reason_for_trial: ['', Validators.required],
      reference_document: [null],
      remarks: [''],
    });

    this.loadStaticDropdowns();
    this.listenToCascadeChanges();
    void this.loadTrialPrefillFromQuery();

    if (!resolveTrialQueryParam(this.route, this.router)) {
      this.prefillFromUser();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  handleCancel(): void {
    this.location.back();
  }

  //for save button 
  handleSubmitRequisition(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.showError('Please fill all mandatory fields.');
      return;
    }

    const trialId = this.resolveTrialId();
    if (!trialId) {
      this.toast.showError('Open this form from a trial to submit.');
      return;
    }

    const payload = this.buildPayload();

    // SET THESE TO OPEN POPUP
    this.isSubmitTime = true;
    this.shouldShowUserPopup = true;
    this.cdr.detectChanges();

    // SUBMIT THE FORM
    this.loading = true;
    this.formApiService.submitForm(payload, trialId)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: () => {
          this.toast.showSuccess('Requisition submitted successfully.');
          // setTimeout(() => this.location.back(), 800);
        },
        error: (err: { message?: string }) => {
          this.toast.showError(err?.message || 'Failed to submit requisition.');
        },
      });
  }
  handleSave(type: 'draft' | 'save'): void {
    if (type === 'save' && this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.showError('Please fill all mandatory fields.');
      return;
    }

    const trialId = this.resolveTrialId();
    if (!trialId) {
      this.toast.showError('Open this form from a trial to save or submit.');
      return;
    }

    const payload = this.buildPayload();
    this.loading = true;

    const request$ =
      type === 'draft'
        ? this.formApiService.saveDraft(payload, trialId)
        : this.formApiService.submitForm(payload, trialId);

    request$
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: () => {
          this.toast.showSuccess(
            type === 'draft'
              ? 'Draft saved successfully.'
              : 'Requisition submitted successfully.',
          );
          if (type === 'save') {
            setTimeout(() => this.location.back(), 800);
          }
        },
        error: (err: { message?: string }) => {
          this.toast.showError(
            err?.message ||
            (type === 'draft'
              ? 'Failed to save draft.'
              : 'Failed to submit requisition.'),
          );
        },
      });
  }

  private async loadTrialPrefillFromQuery(): Promise<void> {
    try {
      const trialId = resolveTrialQueryParam(this.route, this.router);
      if (!trialId) return;
      const loaded = await fetchTrialPrefill(trialId, this.formApiService);

      this.workflowTrialId = trialId;
      this.trialContext = loaded.trialRow;

      let patch: Partial<RequisitionFormValue> = mapTrialRowToRequisitionPatch(
        loaded.trialRow,
      );
      const fromDraft = loaded.fillPayload
        ? requisitionPatchFromSavedJson(loaded.fillPayload)
        : null;
      if (fromDraft) {
        patch = { ...patch, ...fromDraft };
      }

      await this.applyPatchWithCascade(patch);
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Trial prefill failed (requisition form)', error);
    }
  }

  private async applyPatchWithCascade(
    patch: Partial<RequisitionFormValue>,
  ): Promise<void> {
    const trialUnitId = patch.trial_unit_id ?? '';
    const satelliteUnitId = patch.satellite_unit_id ?? '';
    const sectionIds = patch.section_ids ?? [];
    const equipmentIds = patch.equipment_ids ?? [];

    if (trialUnitId) {
      await this.loadSatelliteUnitsAsync(trialUnitId);
    }

    if (satelliteUnitId) {
      await this.loadSectionsAsync(satelliteUnitId);
    }

    if (sectionIds.length) {
      await this.loadEquipmentAsync(sectionIds, trialUnitId);
      await this.ensureSectionDepartmentIndex(sectionIds);
    }

    const merged = mergeRequisitionOptionsFromTrial(
      {
        trialUnit: this.trialUnitOptions,
        satelliteUnit: this.satelliteUnitOptions,
        section: this.sectionOptions,
        equipment: this.equipmentOptions,
      },
      this.trialContext,
      patch,
    );
    this.trialUnitOptions = merged.trialUnit;
    this.satelliteUnitOptions = merged.satelliteUnit;
    this.sectionOptions = merged.section;
    this.equipmentOptions = merged.equipment;

    this.form.patchValue(patch, { emitEvent: false });

    if (sectionIds.length) {
      await this.prefillDepartmentsFromSections(sectionIds);
      const synced = resolveIdList(this.form.get('department_ids')?.value);
      if (!synced.length && patch.department_ids?.length) {
        await this.loadDepartmentsByIds(patch.department_ids);
        this.form
          .get('department_ids')
          ?.setValue([...patch.department_ids], { emitEvent: false });
      }
    } else if (patch.department_ids?.length) {
      await this.loadDepartmentsByIds(patch.department_ids);
      this.form
        .get('department_ids')
        ?.setValue([...patch.department_ids], { emitEvent: false });
    }

    setTimeout(() => {
      if (trialUnitId) {
        this.form.get('trial_unit_id')?.setValue(trialUnitId, { emitEvent: false });
      }
      if (satelliteUnitId) {
        this.form
          .get('satellite_unit_id')
          ?.setValue(satelliteUnitId, { emitEvent: false });
      }
      if (sectionIds.length) {
        this.form.get('section_ids')?.setValue([...sectionIds], { emitEvent: false });
        void this.prefillDepartmentsFromSections(sectionIds).then(() =>
          this.cdr.detectChanges(),
        );
      }
      if (equipmentIds.length) {
        this.form
          .get('equipment_ids')
          ?.setValue([...equipmentIds], { emitEvent: false });
      }
      this.cdr.detectChanges();
    }, 0);
  }

  private buildPayload(): Record<string, unknown> {
    const v = this.form.getRawValue() as RequisitionFormValue;
    return buildRequisitionSavePayload(
      v,
      resolveReferenceDocumentId(v.reference_document),
    );
  }

  private resolveTrialId(): string {
    return (
      this.workflowTrialId ||
      resolveTrialQueryParam(this.route, this.router) ||
      ''
    );
  }

  private prefillFromUser(): void {
    const user = getStoredUser();
    const trialUnitId = user?.['trial_unit_id'];
    const satelliteUnitId = user?.['satellite_unit_id'];

    if (trialUnitId != null && trialUnitId !== '') {
      this.form.patchValue({ trial_unit_id: String(trialUnitId) }, { emitEvent: true });
    } else if (satelliteUnitId != null && satelliteUnitId !== '') {
      this.form.patchValue(
        { satellite_unit_id: String(satelliteUnitId) },
        { emitEvent: true },
      );
    }
  }

  private listenToCascadeChanges(): void {
    this.form
      .get('trial_unit_id')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((trialUnitId) => {
        this.form.patchValue(
          {
            satellite_unit_id: '',
            section_ids: [],
            equipment_ids: [],
            department_ids: [],
          },
          { emitEvent: false },
        );
        this.sectionOptions = [];
        this.equipmentOptions = [];
        this.sectionDepartmentById.clear();
        trialUnitId
          ? this.loadSatelliteUnits(trialUnitId)
          : (this.satelliteUnitOptions = []);
        this.cdr.detectChanges();
      });

    this.form
      .get('satellite_unit_id')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((satelliteUnitId) => {
        this.form.patchValue(
          { section_ids: [], equipment_ids: [], department_ids: [] },
          { emitEvent: false },
        );
        this.equipmentOptions = [];
        this.sectionDepartmentById.clear();
        satelliteUnitId
          ? this.loadSections(satelliteUnitId)
          : (this.sectionOptions = []);
        this.cdr.detectChanges();
      });

    this.form
      .get('section_ids')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((sectionIds) => {
        this.form.patchValue({ equipment_ids: [] }, { emitEvent: false });
        const ids = Array.isArray(sectionIds)
          ? sectionIds.filter(Boolean).map(String)
          : [];
        if (ids.length) {
          this.loadEquipment(ids);
          void this.ensureSectionDepartmentIndex(ids)
            .then(() => this.prefillDepartmentsFromSections(ids))
            .then(() => this.cdr.detectChanges());
        } else {
          this.equipmentOptions = [];
          this.form.get('department_ids')?.setValue([], { emitEvent: false });
          this.cdr.detectChanges();
        }
      });
  }

  private loadStaticDropdowns(): void {
    this.loadTrialUnits();
    this.loadTrialOccasions();
    this.loadDepartments();
    this.loadPresentedByOptions();
  }

  private loadTrialUnits(): void {
    this.apiService
      .getDropdownData('master/trial-units/', DD)
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe((res) => {
        this.trialUnitOptions = this.mapOptions(res);
        this.cdr.detectChanges();
      });
  }

  private loadSatelliteUnits(trialUnitId: string | number): void {
    void this.loadSatelliteUnitsAsync(trialUnitId).then(() => this.cdr.detectChanges());
  }

  private loadSections(satelliteUnitId: string | number): void {
    void this.loadSectionsAsync(satelliteUnitId).then(() => this.cdr.detectChanges());
  }

  private loadEquipment(sectionIds: Array<string | number>): void {
    const trialUnitId = this.form.get('trial_unit_id')?.value;
    void this.loadEquipmentAsync(sectionIds, trialUnitId).then(() =>
      this.cdr.detectChanges(),
    );
  }

  private async loadSatelliteUnitsAsync(
    trialUnitId: string | number,
  ): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.apiService
          .getDropdownData(
            'master/satellite-units/',
            DD,
            { trial_unit: trialUnitId } as RequestParams,
          )
          .pipe(defaultIfEmpty([])),
      );
      this.satelliteUnitOptions = this.mapOptions(res);
    } catch {
      this.satelliteUnitOptions = [];
    }
  }

  private async loadSectionsAsync(satelliteUnitId: string | number): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.apiService
          .get('master/sections/', {
            satellite_unit_id: satelliteUnitId,
          } as RequestParams)
          .pipe(defaultIfEmpty({ data: [] })),
      );
      const rows = this.extractRows(response);
      this.sectionDepartmentById.clear();
      this.sectionOptions = rows
        .map((item) => {
          this.indexSectionDepartment(item);
          const id = String(item['id'] ?? '');
          return {
            label: String(item['name'] ?? ''),
            value: id,
          };
        })
        .filter((option) => option.value);
    } catch {
      this.sectionOptions = [];
      this.sectionDepartmentById.clear();
    }
  }

  private indexSectionDepartment(item: Record<string, unknown>): void {
    const id = String(item['id'] ?? '');
    if (!id) return;
    const departmentId = resolveDepartmentIdFromSection(item);
    this.sectionDepartmentById.set(id, departmentId);
    const label = resolveDepartmentLabelFromSection(item);
    if (departmentId) {
      this.departmentOptions = ensureSelectOption(
        this.departmentOptions,
        departmentId,
        label,
      );
    }
  }

  /**
   * Make sure every selected section id is indexed for its `department` FK.
   * Falls back to an unfiltered sections fetch / per-id fetch when missing.
   */
  private async ensureSectionDepartmentIndex(sectionIds: string[]): Promise<void> {
    const missing = sectionIds
      .map(String)
      .filter((id) => id && !this.sectionDepartmentById.has(id));
    if (!missing.length) return;

    try {
      const response = await firstValueFrom(
        this.apiService.get('master/sections/').pipe(defaultIfEmpty({ data: [] })),
      );
      for (const item of this.extractRows(response)) {
        this.indexSectionDepartment(item);
      }
    } catch {
      // ignore — try per-id below
    }

    const stillMissing = missing.filter((id) => !this.sectionDepartmentById.has(id));
    await Promise.all(
      stillMissing.map(async (id) => {
        try {
          const response = await firstValueFrom(
            this.apiService.get(`master/sections/${id}/`),
          );
          const row =
            response && typeof response === 'object' && !Array.isArray(response)
              ? (((response as { data?: unknown }).data as
                | Record<string, unknown>
                | undefined) ?? (response as Record<string, unknown>))
              : null;
          if (row && typeof row === 'object') {
            this.indexSectionDepartment(row);
          } else {
            this.sectionDepartmentById.set(id, '');
          }
        } catch {
          this.sectionDepartmentById.set(id, '');
        }
      }),
    );
  }

  /**
   * Collect department ids from selected sections, load those rows from
   * `master/departments/`, then prefill (still editable).
   */
  private async prefillDepartmentsFromSections(sectionIds: string[]): Promise<void> {
    const departmentIds = this.collectDepartmentIdsFromSections(sectionIds);
    if (!departmentIds.length) {
      this.form.get('department_ids')?.setValue([], { emitEvent: false });
      return;
    }

    await this.loadDepartmentsByIds(departmentIds);
    this.form.get('department_ids')?.setValue(departmentIds, { emitEvent: false });
  }

  private collectDepartmentIdsFromSections(sectionIds: string[]): string[] {
    const fromMap = sectionIds
      .map((id) => this.sectionDepartmentById.get(String(id)) ?? '')
      .filter((id) => !!id);

    const fromDetails: string[] = [];
    const details = this.trialContext?.['section_details'];
    if (Array.isArray(details)) {
      for (const item of details) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const sectionId = stringifyId(row['section_id'] ?? row['id']);
        if (!sectionIds.map(String).includes(sectionId)) continue;
        const departmentId = resolveDepartmentIdFromSection(row);
        if (departmentId) fromDetails.push(departmentId);
      }
    }

    return [...new Set([...fromMap, ...fromDetails])];
  }

  /** Fetch department labels for the given ids from master/departments/. */
  private async loadDepartmentsByIds(departmentIds: string[]): Promise<void> {
    const ids = [...new Set(departmentIds.map(String).filter(Boolean))];
    if (!ids.length) return;

    try {
      const response = await firstValueFrom(
        this.apiService
          .get('master/departments/', {
            id__in: ids.join(','),
          } as RequestParams)
          .pipe(defaultIfEmpty({ data: [] })),
      );
      const rows = this.extractRows(response);
      if (rows.length) {
        for (const row of rows) {
          const id = String(row['id'] ?? '');
          if (!id) continue;
          this.departmentOptions = ensureSelectOption(
            this.departmentOptions,
            id,
            String(row['name'] ?? ''),
          );
        }
        return;
      }
    } catch {
      // fall through to unfiltered load
    }

    // Fallback: load full list and keep matching ids.
    try {
      const response = await firstValueFrom(
        this.apiService
          .getDropdownData('master/departments/', DD)
          .pipe(defaultIfEmpty([])),
      );
      const mapped = this.mapOptions(response);
      const byId = new Map(mapped.map((o) => [String(o.value), o]));
      for (const id of ids) {
        const opt = byId.get(id);
        this.departmentOptions = ensureSelectOption(
          this.departmentOptions,
          id,
          opt?.label,
        );
      }
      // Keep full list available so the field stays editable beyond prefilled values.
      for (const opt of mapped) {
        this.departmentOptions = ensureSelectOption(
          this.departmentOptions,
          String(opt.value),
          opt.label,
        );
      }
    } catch {
      for (const id of ids) {
        this.departmentOptions = ensureSelectOption(this.departmentOptions, id);
      }
    }
  }

  private async loadEquipmentAsync(
    sectionIds: Array<string | number>,
    trialUnitId?: string | number,
  ): Promise<void> {
    const params: RequestParams = {
      section: sectionIds.map(String).join(','),
    };
    if (trialUnitId) {
      params['trial_unit_id'] = trialUnitId;
    }

    try {
      const res = await firstValueFrom(
        this.apiService
          .getDropdownData('master/equipments/', equipmentHtml, params)
          .pipe(defaultIfEmpty([])),
      );
      this.equipmentOptions = this.mapOptions(res);
    } catch {
      this.equipmentOptions = [];
    }
  }

  private loadTrialOccasions(): void {
    this.apiService
      .get('master/lookups/?type__code=OCC')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: unknown) => {
          const rows = this.extractRows(response);
          this.trialOccasionOptions = rows.map((item) => ({
            label: String(item['name'] ?? item['label'] ?? ''),
            value: String(item['id'] ?? ''),
          }));
          this.cdr.detectChanges();
        },
        error: () => {
          this.trialOccasionOptions = [];
          this.cdr.detectChanges();
        },
      });
  }

  private loadDepartments(): void {
    this.apiService
      .getDropdownData('master/departments/', DD)
      .pipe(defaultIfEmpty([]), takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          // Full list keeps Department editable beyond auto-prefill values.
          const mapped = this.mapOptions(res);
          for (const opt of mapped) {
            this.departmentOptions = ensureSelectOption(
              this.departmentOptions,
              String(opt.value),
              opt.label,
            );
          }
          const sectionIds = resolveIdList(this.form.get('section_ids')?.value);
          if (sectionIds.length) {
            void this.prefillDepartmentsFromSections(sectionIds).then(() =>
              this.cdr.detectChanges(),
            );
          } else {
            this.cdr.detectChanges();
          }
        },
        error: () => {
          this.cdr.detectChanges();
        },
      });
  }

  private loadPresentedByOptions(): void {
    const unitId = getStoredUser()['unit_id'];
    const params =
      unitId != null && unitId !== '' ? { unit_id: String(unitId) } : undefined;

    this.apiService
      .get('api/auth/users', params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: unknown) => {
          const rows = this.extractRows(response);
          this.presentedByOptions = rows.map((user) => {
            const first = String(user['first_name'] ?? '').trim();
            const last = String(user['last_name'] ?? '').trim();
            const fullName = [first, last].filter(Boolean).join(' ');
            return {
              label: fullName || String(user['username'] ?? user['email'] ?? 'User'),
              value: String(user['id'] ?? ''),
            };
          });
          this.cdr.detectChanges();
        },
        error: () => {
          this.presentedByOptions = [];
          this.cdr.detectChanges();
        },
      });
  }

  private mapOptions(
    items: Array<{ label: string; value: unknown }>,
  ): SelectOption[] {
    return items.map((o) => ({ label: o.label, value: String(o.value) }));
  }

  private extractRows(response: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(response)) {
      return response as Array<Record<string, unknown>>;
    }
    const data = (response as { data?: unknown })?.data;
    return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  }
}
