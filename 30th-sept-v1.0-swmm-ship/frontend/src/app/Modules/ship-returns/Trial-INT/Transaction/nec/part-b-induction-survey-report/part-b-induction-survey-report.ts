import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ChangeDetectorRef,
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  FormControl,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FormApiService } from '../../../angulerFromconverting/form-api.service';
import { ApiService } from '../../../api.service';
import { equipmentHtml } from '../../../ApiEndPoints';
import { FormCardComponent } from '../../../ui/form-card/form-card.component';
import { ToastService } from '../../../services/toast.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../trial-route-prefill';
import { InputComponent } from '../../../ui/input.component';
import {
  SelectComponent,
  SelectOption,
} from '../../../ui/select.component';
import { ApprovalWorkFlow } from '../../../ui/approval-work-flow/approval-work-flow';
import { CalenderComponent } from '../../../ui/calender.component';
import { FileUploadComponent } from '../../../ui/file-upload/file-upload.component';
import { TextareaComponent } from '../../../ui/textarea';
import { ReviewTableComponent } from '../../../ui/final-remark-observation/review-table.component';
import { RadioGroupComponent } from '../../../ui/radio-group/radio-group.component';
import { ParameterCardComponent } from '../../../ui/parameter-card/parameter-card.component';

@Component({
  selector: 'app-part-b-induction-survey-report',
  standalone: true,
  host: {
    class: 'flex h-full min-h-0 flex-1 flex-col overflow-hidden',
  },
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputComponent,
    SelectComponent,
    FileUploadComponent,
    FormCardComponent,
    ApprovalWorkFlow,
    ReviewTableComponent,
    RadioGroupComponent,
    ParameterCardComponent,
  ],
  templateUrl: './part-b-induction-survey-report.html',
  styleUrl: './part-b-induction-survey-report.css',
})
export class PartBInductionSurveyReport implements OnInit, OnDestroy {
  @ViewChild('formCard') formCard: any;

  form!: FormGroup;

  isSavingDraft = false;
  isSubmitting = false;

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  /** Stored trial ID resolved once during init — shared by saveDraft & submitFinalForm */
  workflowTrialId: string | undefined = undefined;

  /** Controls the Approval Workflow popup visibility */
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;
  eqpList: any[] = [];
  activeTab: any = null;

  get canEditForm(): boolean {
    return this.formApiService?.context?.workflow_rights?.can_edit === true;
  }

  get canShowSaveDraft(): boolean {
    if (!this.canEditForm) return false;
    const raw =
      this.formApiService?.context?.workflow_rights?.save_draft ??
      this.formApiService?.context?.save_draft;
    return raw === true || raw === 'true' || raw === 1 || raw === '1';
  }

  get headerEquipmentTabs(): any[] {
    if (this.eqpList.length) return this.eqpList;

    const contextEquipments = this.formApiService?.context?.equipment_details;
    if (Array.isArray(contextEquipments) && contextEquipments.length) {
      return contextEquipments;
    }

    return this.formApiService?.currentEquipmentNomenclature
      ? [this.formApiService.currentEquipmentNomenclature]
      : [];
  }

  get activeHeaderEquipment(): any {
    return (
      this.activeTab ||
      this.formApiService?.currentEquipmentNomenclature ||
      null
    );
  }

  get activeEquipmentId(): number | null {
    return (
      this.activeHeaderEquipment?.equipment_id ??
      this.activeHeaderEquipment?.id ??
      null
    );
  }

  // ── EMI Matrix config ──────────────────────────────────────────────
  /** Fixed size of the cross-matrix (rows == columns) */
  private readonly EMI_MATRIX_SIZE = 5;
  private readonly EMI_MATRIX_MAX_SIZE = 20;

  /** Options for each matrix cell */
  matrixCellOptions: SelectOption[] = [
    { label: 'Yes', value: 'Yes' },
    { label: 'No', value: 'No' },
    { label: 'N/A', value: 'N/A' },
  ];

  /** Fixed frequency list repeated for every compartment group */
  private readonly SE_FREQUENCIES: string[] = [
    '81 MHz',
    '130 MHz',
    '160 MHz',
    '260 MHz',
    '327 MHz',
    '710 MHz',
    '1.86 GHz',
    '3.29 GHz',
    '5.8 GHz',
    '8.4 GHz',
    '13.2 GHz',
    '18.0 GHz',
  ];

  /** Tracks valueChanges subscriptions, kept 1:1 with seCompartmentsArray rows */
  private seCompartmentSubscriptions: Subscription[] = [];
  private shipSubscription?: Subscription;
  private matrixSizeSubscriptions: Subscription[] = [];

  /** Options for "Potential source for EMI" and "Potential victim for EMI" dropdowns
   *  — populated dynamically from master/systems/ API */
  systemsOptions: SelectOption[] = [];
  shipOptions: SelectOption[] = [];
  equipmentOptions: SelectOption[] = [];
  compartmentOptions: SelectOption[] = [];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private toastService: ToastService,
    public formApiService: FormApiService,
    private toast: ToastService,
    private apiService: ApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.matrixSizeSubscriptions = [
      this.form
        .get('monitorEquipmentCount')!
        .valueChanges.subscribe(() => this.resizeEmiMatrix()),
      this.form
        .get('activeEquipmentCount')!
        .valueChanges.subscribe(() => this.resizeEmiMatrix()),
    ];
    this.loadShipOptions();
    this.loadSystemsOptions();
    this.loadCompartmentOptions();
    void this.loadTrialPrefillFromQuery();

    // Ship change hote hi equipment list re-fetch karo
    this.shipSubscription = this.form
      .get('ship')!
      .valueChanges.subscribe((shipId: string) => {
        this.loadEquipmentOptions(shipId);
      });
  }

  /** Fetches ships from master/ships/ and populates the Ship dropdown */
  private loadShipOptions(): void {
    this.apiService
      .getDropdownData('master/ships/', { labelKey: 'name', valueKey: 'id' })
      .subscribe((options) => {
        this.shipOptions = options;
        this.updateShipDisplay(this.form.get('ship')?.value);
        this.cdr.markForCheck();
      });
  }

  private updateShipDisplay(
    shipId?: string | number | null,
    fallbackName = '',
  ): void {
    const matchedShip = this.shipOptions.find(
      (option) => String(option.value) === String(shipId),
    );
    this.form
      .get('shipDisplay')
      ?.setValue(matchedShip?.label || fallbackName || '', {
        emitEvent: false,
      });
  }

  /** Reads the `trial` query param, calls getForm, and sets the ship field from ship_id */
  private async loadTrialPrefillFromQuery(): Promise<void> {
    const trialId = resolveTrialQueryParam(this.route, this.router);
    if (!trialId) return;
    this.workflowTrialId = trialId;
    try {
      const response = await this.formApiService.getForm(trialId);
      const trialRow = trialRowFromGetFormResponse(
        this.formApiService,
        response,
      );
      if (!trialRow) return;
      this.eqpList = Array.isArray(trialRow.equipment_details)
        ? trialRow.equipment_details
        : [];
      this.activeTab =
        this.formApiService.currentEquipmentNomenclature ||
        this.eqpList[0] ||
        null;
      if (this.activeTab) {
        this.formApiService.setCurrentEquipmentNomenclature(this.activeTab);
      }
      if (trialRow.ship_id != null) {
        this.form
          .get('ship')
          ?.setValue(String(trialRow.ship_id), { emitEvent: false });
        this.updateShipDisplay(trialRow.ship_id, trialRow.ship_name ?? '');
        // emitEvent false hai, isliye valueChanges fire nahi hoga — manually call karo
        this.loadEquipmentOptions(trialRow.ship_id);
      }
      // Populate all form fields from saved/draft data
      // this.fillData(response?.data || response?.json_data || response);
      const jsonData =
        response?.json_data ?? // agar kabhi wrapped mila to
        response?.data?.json_data ??
        response; // fallback: response itself is json_data
      const finalJsonData =
        typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

       const equipmentKey =
         this.formApiService.resolveNomenclature(this.activeTab) ||
         this.activeTab?.name ||
         Object.keys(finalJsonData || {})[0];

      // const equipmentPayload = finalJsonData?.[equipmentKey];
      const equipmentPayload = this.extractEquipmentPayload(
        finalJsonData,
        equipmentKey,
      );

      this.fillData(equipmentPayload);
      this.cdr.markForCheck();
    } catch (e) {
      console.error(
        'Trial prefill failed (NEC Part B Induction Survey Report)',
        e,
      );
    }
  }

  async setActiveTab(tab: any): Promise<void> {
    if (!tab || this.isSameEquipment(this.activeTab, tab)) return;

    this.activeTab = tab;
    this.formApiService.setCurrentEquipmentNomenclature(tab);

    if (!this.workflowTrialId) return;

    this.resetFormData();

    try {
      const nomenclature = this.formApiService.resolveNomenclature(tab);
      const response = await this.formApiService.getFormByEquipment(
        this.workflowTrialId,
        nomenclature,
      );
      // this.fillData(response?.data || response?.json_data || response);
      const jsonData =
        response?.json_data ?? response?.data?.json_data ?? response;

      const finalJsonData =
        typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      // const equipmentPayload = finalJsonData?.[nomenclature] || finalJsonData?.[Object.keys(finalJsonData)[0]];
      const equipmentPayload = this.extractEquipmentPayload(
        finalJsonData,
        nomenclature,
      );

      this.fillData(equipmentPayload);
      this.cdr.markForCheck();
    } catch (error) {
      console.error(
        'Failed to load NEC Part B data for selected equipment',
        error,
      );
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    // Flat check — agar 'ship' ya 'vswr_checks' jaisi known key top-level pe hai, to already flat hai
    const isFlat =
      'ship' in jsonData ||
      'vswr_checks' in jsonData ||
      'emi_matrix' in jsonData;
    if (isFlat) return jsonData;

    // Wrapped case — equipment name ke andar hai
    return jsonData[equipmentKey] ?? null;
  }

  trackByEquipment(_: number, equipment: any): string | number {
    return (
      equipment?.equipment_id ?? equipment?.id ?? equipment?.nomenclature ?? _
    );
  }

  isSameEquipment(left: any, right: any): boolean {
    return (
      (left?.equipment_id ?? left?.id ?? left?.nomenclature) ===
      (right?.equipment_id ?? right?.id ?? right?.nomenclature)
    );
  }

  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;
    const shipDisplay = this.form.get('shipDisplay')?.value;

    this.interferenceChecksArray.clear();
    Array.from({ length: 1 }, () =>
      this.interferenceChecksArray.push(this.createInterferenceRow()),
    );

    this.vswrChecksArray.clear();
    this.vswrChecksArray.push(this.createVswrRow());

    this.visualSurveyArray.clear();
    this.visualSurveyArray.push(this.createVisualSurveyRow());

    this.fileUploadsArray.clear();
    this.fileUploadsArray.push(this.createFileUploadRow());

    this.groundingChecksArray.clear();
    this.groundingChecksArray.push(this.createGroundingCheckRow());

    this.radhazMeasurementArray.clear();
    this.radhazMeasurementArray.push(this.createRadhazRow());

    this.spectrumFilesArray.clear();
    this.spectrumFilesArray.push(this.createSpectrumFileRow());

    this.seCompartmentSubscriptions.forEach((sub) => sub.unsubscribe());
    this.seCompartmentSubscriptions = [];
    this.seCompartmentsArray.clear();
    this.seFrequencyGroupsArray.clear();
    this.addSeCompartmentRow();

    this.emiMatrixHeadersArray.controls.forEach((control) =>
      control.setValue('', { emitEvent: false }),
    );
    this.emiMatrixRowsArray.controls.forEach((row) => {
      const group = row as FormGroup;
      group.get('activeEquipment')?.setValue('', { emitEvent: false });
      (group.get('cells') as FormArray).controls.forEach((cell) =>
        cell.setValue('', { emitEvent: false }),
      );
    });

    this.form.patchValue({ ship, shipDisplay }, { emitEvent: false });
  }

  /** Fetches systems from master/systems/ and populates the interference dropdown arrays */
  private loadSystemsOptions(): void {
    this.apiService
      .getDropdownData('master/systems/', { labelKey: 'name', valueKey: 'id' })
      .subscribe((options) => {
        this.systemsOptions = options;
      });
  }

  private loadEquipmentOptions(shipId?: string | number | null): void {
    const params: Record<string, any> = {};
    if (shipId) {
      params['ship_id'] = shipId;
    }
    this.apiService
      .getDropdownData('master/equipments/', equipmentHtml, params)
      .subscribe((options) => {
        this.equipmentOptions = options;
      });
  }

  private loadCompartmentOptions(): void {
    this.apiService
      .getDropdownData('master/compartments/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((options) => {
        this.compartmentOptions = options;
        this.refreshCompartmentLabels();
      });
  }

  private refreshCompartmentLabels(): void {
    this.seCompartmentsArray.controls.forEach((compartmentRow, index) => {
      const value = compartmentRow.get('compartment')?.value;
      if (!value) return;

      const matchedOption = this.compartmentOptions.find(
        (opt) => String(opt.value) === String(value),
      );
      if (matchedOption) {
        const group = this.seFrequencyGroupsArray.at(index) as FormGroup;
        group
          .get('compartmentLabel')
          ?.setValue(matchedOption.label, { emitEvent: false });
      }
    });
  }

  private buildForm(): void {
    this.form = this.fb.group({
      ship: [''],
      shipDisplay: [''],
      interferenceChecks: this.fb.array(
        Array.from({ length: 1 }, () => this.createInterferenceRow()),
      ),
      vswrChecks: this.fb.array([this.createVswrRow()]),
      visualSurvey: this.fb.array([this.createVisualSurveyRow()]),
      fileUploads: this.fb.array([this.createFileUploadRow()]),
      groundingChecks: this.fb.array([this.createGroundingCheckRow()]),
      radhazMeasurement: this.fb.array([this.createRadhazRow()]),
      seCompartments: this.fb.array([]),
      seFrequencyGroups: this.fb.array([]),
      spectrumFiles: this.fb.array([this.createSpectrumFileRow()]),
      monitorEquipmentCount: [this.EMI_MATRIX_SIZE],
      activeEquipmentCount: [this.EMI_MATRIX_SIZE],
      // ── EMI Matrix (fixed size, no add/remove) ──────────────────
      emiMatrixHeaders: this.fb.array(
        Array.from({ length: this.EMI_MATRIX_SIZE }, () => this.fb.control('')),
      ),
      emiMatrixRows: this.fb.array(
        Array.from({ length: this.EMI_MATRIX_SIZE }, () =>
          this.createEmiMatrixRow(),
        ),
      ),
    });
    // Seed the SE tables with one linked compartment + frequency group
    this.addSeCompartmentRow();
  }

  // ─── FormArray getters ────────────────────────────────────────────

  get interferenceChecksArray(): FormArray {
    return this.form.get('interferenceChecks') as FormArray;
  }

  get vswrChecksArray(): FormArray {
    return this.form.get('vswrChecks') as FormArray;
  }

  get visualSurveyArray(): FormArray {
    return this.form.get('visualSurvey') as FormArray;
  }

  get seCompartmentsArray(): FormArray {
    return this.form.get('seCompartments') as FormArray;
  }

  get seFrequencyGroupsArray(): FormArray {
    return this.form.get('seFrequencyGroups') as FormArray;
  }

  get emiMatrixHeadersArray(): FormArray {
    return this.form.get('emiMatrixHeaders') as FormArray;
  }

  get emiMatrixRowsArray(): FormArray {
    return this.form.get('emiMatrixRows') as FormArray;
  }

  get spectrumFilesArray(): FormArray {
    return this.form.get('spectrumFiles') as FormArray;
  }

  getEmiMatrixHeaderControl(colIndex: number): FormControl {
    return this.emiMatrixHeadersArray.at(colIndex) as FormControl;
  }

  getEmiMatrixCellControl(rowIndex: number, colIndex: number): FormControl {
    const row = this.emiMatrixRowsArray.at(rowIndex) as FormGroup;
    return (row.get('cells') as FormArray).at(colIndex) as FormControl;
  }

  /** Helper for the template — gets the 12-row frequency FormArray for a given group index */
  getSeFrequencyRows(groupIndex: number): FormArray {
    return this.seFrequencyGroupsArray.at(groupIndex).get('rows') as FormArray;
  }

  private createEmiMatrixRow(columnCount = this.EMI_MATRIX_SIZE): FormGroup {
    return this.fb.group({
      activeEquipment: [''],
      cells: this.fb.array(
        Array.from({ length: columnCount }, () => this.fb.control('')),
      ),
    });
  }

  resizeEmiMatrix(): void {
    const columnCount = this.normaliseMatrixSize(
      this.form.get('monitorEquipmentCount')?.value,
    );
    const rowCount = this.normaliseMatrixSize(
      this.form.get('activeEquipmentCount')?.value,
    );

    while (this.emiMatrixHeadersArray.length < columnCount) {
      this.emiMatrixHeadersArray.push(this.fb.control(''));
    }
    while (this.emiMatrixHeadersArray.length > columnCount) {
      this.emiMatrixHeadersArray.removeAt(
        this.emiMatrixHeadersArray.length - 1,
      );
    }

    this.emiMatrixRowsArray.controls.forEach((row) => {
      const cells = row.get('cells') as FormArray;
      while (cells.length < columnCount) cells.push(this.fb.control(''));
      while (cells.length > columnCount) cells.removeAt(cells.length - 1);
    });

    while (this.emiMatrixRowsArray.length < rowCount) {
      this.emiMatrixRowsArray.push(this.createEmiMatrixRow(columnCount));
    }
    while (this.emiMatrixRowsArray.length > rowCount) {
      this.emiMatrixRowsArray.removeAt(this.emiMatrixRowsArray.length - 1);
    }
  }

  private normaliseMatrixSize(value: any): number {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(this.EMI_MATRIX_MAX_SIZE, Math.max(1, parsed));
  }

  private createSpectrumFileRow(): FormGroup {
    return this.fb.group({
      file_name: [''],
      file: [null],
    });
  }

  // ─── Row creators ─────────────────────────────────────────────────

  private createInterferenceRow(): FormGroup {
    return this.fb.group({
      potential_source: [''],
      potential_victim: [''],
      remarks: [''],
    });
  }

  private createVswrRow(): FormGroup {
    return this.fb.group({
      system: [''],
      observations: [''],
      remarks: [''],
    });
  }

  private createVisualSurveyRow(): FormGroup {
    return this.fb.group({
      equipment: [''],
      location: [''],
      observation: [''],
    });
  }

  private createFileUploadRow(): FormGroup {
    return this.fb.group({
      file_name: [''],
      file: [null],
    });
  }

  private createGroundingCheckRow(): FormGroup {
    return this.fb.group({
      equipment: [''],
      compt: [''],
      resistance: ['', [Validators.max(10), Validators.min(0)]],
      remarks: [''],
    });
  }

  private createRadhazRow(): FormGroup {
    return this.fb.group({
      location: [''],
      efield_value: [''],
      remarks: [''],
    });
  }

  private createSeCompartmentRow(): FormGroup {
    return this.fb.group({
      compartment: [''],
      remarks: [''],
    });
  }

  private createSeFrequencyGroup(label: string): FormGroup {
    return this.fb.group({
      compartmentLabel: [label],
      rows: this.fb.array(
        this.SE_FREQUENCIES.map((freq) => this.createSeFrequencyRow(freq)),
      ),
    });
  }

  private createSeFrequencyRow(freq: string): FormGroup {
    const row = this.fb.group({
      freq: [freq],
      power_level: [''],
      signal_open: [''],
      signal_close: [''],
      difference_db: [''],
      remarks: [''],
    });

    // Auto-calculate Difference dB (SE) = Open door level - Close door level
    row
      .get('signal_open')!
      .valueChanges.subscribe(() => this.updateSeDifference(row));
    row
      .get('signal_close')!
      .valueChanges.subscribe(() => this.updateSeDifference(row));

    return row;
  }

  private updateSeDifference(row: FormGroup): void {
    const open = parseFloat(row.get('signal_open')!.value);
    const close = parseFloat(row.get('signal_close')!.value);
    if (!isNaN(open) && !isNaN(close)) {
      row
        .get('difference_db')!
        .setValue((open - close).toFixed(2), { emitEvent: false });
    } else {
      row.get('difference_db')!.setValue('', { emitEvent: false });
    }
  }

  get fileUploadsArray(): FormArray {
    return this.form.get('fileUploads') as FormArray;
  }

  get groundingChecksArray(): FormArray {
    return this.form.get('groundingChecks') as FormArray;
  }

  get radhazMeasurementArray(): FormArray {
    return this.form.get('radhazMeasurement') as FormArray;
  }

  // ─── Add / Remove: SE Compartments + linked Frequency Groups ────

  addSeCompartmentRow(): void {
    const compartmentRow = this.createSeCompartmentRow();
    this.seCompartmentsArray.push(compartmentRow);

    const freqGroup = this.createSeFrequencyGroup('');
    this.seFrequencyGroupsArray.push(freqGroup);

    // Whenever this row's compartment dropdown changes, update the
    // matching frequency group's header label. We look up the current
    // index at emit-time (not capture it) so this stays correct even
    // if earlier rows are removed later.
    const sub = compartmentRow
      .get('compartment')!
      .valueChanges.subscribe((value: string) => {
        const currentIndex =
          this.seCompartmentsArray.controls.indexOf(compartmentRow);
        if (currentIndex === -1) return;
        const group = this.seFrequencyGroupsArray.at(currentIndex) as FormGroup;
        // Look up the human-readable label (name) from compartmentOptions so the
        // header displays the compartment name instead of the numeric ID.
        const matchedOption = this.compartmentOptions.find(
          (opt) => String(opt.value) === String(value),
        );
        group
          .get('compartmentLabel')!
          .setValue(matchedOption ? matchedOption.label : value ? value : '', {
            emitEvent: false,
          });
      });

    this.seCompartmentSubscriptions.push(sub);
  }

  removeSeCompartmentRow(index: number): void {
    if (this.seCompartmentsArray.length <= 1) return;
    this.seCompartmentsArray.removeAt(index);
    this.seFrequencyGroupsArray.removeAt(index);

    const sub = this.seCompartmentSubscriptions.splice(index, 1)[0];
    sub?.unsubscribe();
  }

  ngOnDestroy(): void {
    this.seCompartmentSubscriptions.forEach((sub) => sub.unsubscribe());
    this.shipSubscription?.unsubscribe();
    this.matrixSizeSubscriptions.forEach((sub) => sub.unsubscribe());
  }

  // ─── Add / Remove: Interference Checks ───────────────────────────

  addInterferenceRow(): void {
    this.interferenceChecksArray.push(this.createInterferenceRow());
  }

  removeInterferenceRow(index: number): void {
    if (index < 1) return; // only allow removing rows beyond the pre-seeded 11
    this.interferenceChecksArray.removeAt(index);
  }

  // ─── Add / Remove: VSWR Checks ───────────────────────────────────

  addVswrRow(): void {
    this.vswrChecksArray.push(this.createVswrRow());
  }

  removeVswrRow(index: number): void {
    if (this.vswrChecksArray.length <= 1) return;
    this.vswrChecksArray.removeAt(index);
  }

  // ─── Add / Remove: Visual Survey ─────────────────────────────────

  addVisualSurveyRow(): void {
    this.visualSurveyArray.push(this.createVisualSurveyRow());
  }

  removeVisualSurveyRow(index: number): void {
    if (this.visualSurveyArray.length <= 1) return;
    this.visualSurveyArray.removeAt(index);
  }

  // ─── Add / Remove: File Uploads ──────────────────────────────────

  addFileUploadRow(): void {
    this.fileUploadsArray.push(this.createFileUploadRow());
  }

  removeFileUploadRow(index: number): void {
    if (this.fileUploadsArray.length <= 1) return;
    this.fileUploadsArray.removeAt(index);
  }

  // ─── Add / Remove: Grounding Discontinuity Checks ────────────────

  addGroundingCheckRow(): void {
    this.groundingChecksArray.push(this.createGroundingCheckRow());
  }

  removeGroundingCheckRow(index: number): void {
    if (this.groundingChecksArray.length <= 1) return;
    this.groundingChecksArray.removeAt(index);
  }

  // ─── Add / Remove: RADHAZ Measurement ────────────────────────────

  addRadhazRow(): void {
    this.radhazMeasurementArray.push(this.createRadhazRow());
  }

  removeRadhazRow(index: number): void {
    if (this.radhazMeasurementArray.length <= 1) return;
    this.radhazMeasurementArray.removeAt(index);
  }

  // ─── Add / Remove: Spectrum of Radar and Communication Set ──────

  addSpectrumFileRow(): void {
    this.spectrumFilesArray.push(this.createSpectrumFileRow());
  }

  removeSpectrumFileRow(index: number): void {
    if (this.spectrumFilesArray.length <= 1) return;
    this.spectrumFilesArray.removeAt(index);
  }

  // ─── Payload ──────────────────────────────────────────────────────

  private buildPayload(): any {
    const raw = this.form.getRawValue();
    return {
      ship: raw.ship,
      interference_checks: raw.interferenceChecks,
      vswr_checks: raw.vswrChecks,
      visual_survey: raw.visualSurvey,
      file_uploads: raw.fileUploads,
      grounding_checks: raw.groundingChecks,
      radhaz_measurement: raw.radhazMeasurement,
      spectrum_files: raw.spectrumFiles,
      se_compartments: raw.seCompartments,
      se_frequency_groups: raw.seFrequencyGroups,
      emi_matrix: {
        monitor_equipment_headers: raw.emiMatrixHeaders,
        rows: raw.emiMatrixRows,
      },
    };
  }

  /**
   * Hydrates the entire form from a saved/draft payload.
   * Mirrors the Part A `fillData()` pattern.
   */
  fillData(payload: any): void {
    if (!payload) return;

    // ── Top-level scalar fields ───────────────────────────────────
    if (payload.ship != null) {
      this.form
        .get('ship')
        ?.setValue(String(payload.ship), { emitEvent: false });
      this.updateShipDisplay(payload.ship, payload.ship_name ?? '');
      this.loadEquipmentOptions(payload.ship);
    }

    // ── interferenceChecks ────────────────────────────────────────
    if (
      Array.isArray(payload.interference_checks) &&
      payload.interference_checks.length
    ) {
      this.interferenceChecksArray.clear();
      payload.interference_checks.forEach((row: any) => {
        const fg = this.createInterferenceRow();
        fg.patchValue(row);
        this.interferenceChecksArray.push(fg);
      });
    }

    // ── vswrChecks ───────────────────────────────────────────────
    if (Array.isArray(payload.vswr_checks) && payload.vswr_checks.length) {
      this.vswrChecksArray.clear();
      payload.vswr_checks.forEach((row: any) => {
        const fg = this.createVswrRow();
        fg.patchValue(row);
        this.vswrChecksArray.push(fg);
      });
    }

    // ── visualSurvey ─────────────────────────────────────────────
    if (Array.isArray(payload.visual_survey) && payload.visual_survey.length) {
      this.visualSurveyArray.clear();
      payload.visual_survey.forEach((row: any) => {
        const fg = this.createVisualSurveyRow();
        fg.patchValue(row);
        this.visualSurveyArray.push(fg);
      });
    }

    // ── fileUploads ──────────────────────────────────────────────
    if (Array.isArray(payload.file_uploads) && payload.file_uploads.length) {
      this.fileUploadsArray.clear();
      payload.file_uploads.forEach((row: any) => {
        const fg = this.createFileUploadRow();
        fg.patchValue(row);
        this.fileUploadsArray.push(fg);
      });
    }

    // ── groundingChecks ──────────────────────────────────────────
    if (
      Array.isArray(payload.grounding_checks) &&
      payload.grounding_checks.length
    ) {
      this.groundingChecksArray.clear();
      payload.grounding_checks.forEach((row: any) => {
        const fg = this.createGroundingCheckRow();
        fg.patchValue(row);
        this.groundingChecksArray.push(fg);
      });
    }

    // ── radhazMeasurement ────────────────────────────────────────
    if (
      Array.isArray(payload.radhaz_measurement) &&
      payload.radhaz_measurement.length
    ) {
      this.radhazMeasurementArray.clear();
      payload.radhaz_measurement.forEach((row: any) => {
        const fg = this.createRadhazRow();
        fg.patchValue(row);
        this.radhazMeasurementArray.push(fg);
      });
    }

    // ── spectrumFiles ────────────────────────────────────────────
    if (
      Array.isArray(payload.spectrum_files) &&
      payload.spectrum_files.length
    ) {
      this.spectrumFilesArray.clear();
      payload.spectrum_files.forEach((row: any) => {
        const fg = this.createSpectrumFileRow();
        fg.patchValue(row);
        this.spectrumFilesArray.push(fg);
      });
    }

    // ── SE Compartments + linked Frequency Groups ────────────────
    if (
      Array.isArray(payload.se_compartments) &&
      payload.se_compartments.length &&
      Array.isArray(payload.se_frequency_groups) &&
      payload.se_frequency_groups.length
    ) {
      // Clear existing subscriptions & arrays
      this.seCompartmentSubscriptions.forEach((sub) => sub.unsubscribe());
      this.seCompartmentSubscriptions = [];
      this.seCompartmentsArray.clear();
      this.seFrequencyGroupsArray.clear();

      payload.se_compartments.forEach((compRow: any, idx: number) => {
        const compartmentGroup = this.createSeCompartmentRow();
        compartmentGroup.patchValue(compRow);
        this.seCompartmentsArray.push(compartmentGroup);

        const freqGroupData = payload.se_frequency_groups[idx];
        const label =
          freqGroupData?.compartmentLabel ?? `Cat 'A' Compartment ${idx + 1}`;
        const freqGroup = this.createSeFrequencyGroup(label);

        if (Array.isArray(freqGroupData?.rows) && freqGroupData.rows.length) {
          const rowsArray = freqGroup.get('rows') as FormArray;
          rowsArray.clear();
          freqGroupData.rows.forEach((freqRow: any) => {
            const fg = this.createSeFrequencyRow(freqRow.freq ?? '');
            fg.patchValue(freqRow);
            rowsArray.push(fg);
          });
        }

        this.seFrequencyGroupsArray.push(freqGroup);

        // Re-attach compartment → label subscription
        const sub = compartmentGroup
          .get('compartment')!
          .valueChanges.subscribe((value: string) => {
            const currentIndex =
              this.seCompartmentsArray.controls.indexOf(compartmentGroup);
            if (currentIndex === -1) return;
            const group = this.seFrequencyGroupsArray.at(
              currentIndex,
            ) as FormGroup;
            const matchedOption = this.compartmentOptions.find(
              (opt) => String(opt.value) === String(value),
            );
            group
              .get('compartmentLabel')!
              .setValue(
                matchedOption
                  ? matchedOption.label
                  : value
                    ? value
                    : `Cat 'A' Compartment ${currentIndex + 1}`,
                { emitEvent: false },
              );
          });
        this.seCompartmentSubscriptions.push(sub);
      });
    }

    // ── EMI Matrix ───────────────────────────────────────────────
    if (payload.emi_matrix) {
      const emi = payload.emi_matrix;
      const savedColumnCount = Array.isArray(emi.monitor_equipment_headers)
        ? emi.monitor_equipment_headers.length
        : 0;
      const savedRowCount = Array.isArray(emi.rows) ? emi.rows.length : 0;
      if (savedColumnCount > 0 && savedRowCount > 0) {
        this.form.patchValue(
          {
            monitorEquipmentCount: savedColumnCount,
            activeEquipmentCount: savedRowCount,
          },
          { emitEvent: false },
        );
        this.resizeEmiMatrix();
      }
      if (Array.isArray(emi.monitor_equipment_headers)) {
        emi.monitor_equipment_headers.forEach((val: string, i: number) => {
          this.emiMatrixHeadersArray.at(i)?.setValue(val, { emitEvent: false });
        });
      }
      if (Array.isArray(emi.rows)) {
        emi.rows.forEach((rowData: any, i: number) => {
          const matrixRow = this.emiMatrixRowsArray.at(i) as FormGroup;
          if (!matrixRow) return;
          matrixRow
            .get('activeEquipment')
            ?.setValue(rowData.activeEquipment ?? '', { emitEvent: false });
          if (Array.isArray(rowData.cells)) {
            const cells = matrixRow.get('cells') as FormArray;
            rowData.cells.forEach((cellVal: string, j: number) => {
              cells.at(j)?.setValue(cellVal ?? '', { emitEvent: false });
            });
          }
        });
      }
    }
  }

  // ─── Save / Submit ────────────────────────────────────────────────

  // saveDraft(): void {
  //   this.isSavingDraft = true;
  //   const payload = this.buildPayload();
  //   this.formApiService.saveDraft(payload, this.workflowTrialId || '').subscribe({
  //     next: () => {
  //       this.toastService.showSuccess('Draft saved successfully.');
  //       this.isSavingDraft = false;
  //     },
  //     error: (err: any) => {
  //       console.error('Save draft error:', err);
  //       this.toastService.showError('Failed to save draft.');
  //       this.isSavingDraft = false;
  //     },
  //   });
  // }

  // submitFinalForm(): void {
  //   if (this.form.invalid) {
  //     this.form.markAllAsTouched();
  //     this.toastService.showError('Please fill all required fields.');
  //     return;
  //   }
  //   this.isSubmitting = true;
  //   this.isSubmitTime = true;
  //   this.showApprovalWorkflowPopup = true;
  //   const payload = this.buildPayload();
  //   this.formApiService.submitForm(payload, this.workflowTrialId || '').subscribe({
  //     next: () => {
  //       this.isSubmitting = false;
  //     },
  //     error: (err: any) => {
  //       console.error('Submit error:', err);
  //       this.toastService.showError('Failed to submit form.');
  //       this.isSubmitting = false;
  //     },
  //   });
  // }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      this.form.reset();

      this.cdr.detectChanges();
      this.toast.showSuccess('Form cleared successfully');
      return;
    }

    const payload = this.buildPayload();

    if (type === 'draft') {
      this.saveDraft(payload);
      return;
    }

    this.submitFinalForm(payload, type);
  }

  private saveDraft(payload: any): void {
    this.draftLoading = true;

    this.formApiService
      .saveDraft(payload, resolveTrialQueryParam(this.route, this.router) || '')
      .subscribe({
        next: () => this.toast.showSuccess('Draft saved successfully.'),
        error: () => this.toast.showError('Failed to save draft.'),
        complete: () => {
          this.draftLoading = false;
        },
      });
  }

  private submitFinalForm(payload: any, type: 'save' | 'submit'): void {
    if (type === 'save') {
      this.saveLoading = true;
    } else {
      this.submitLoading = true;
    }

    this.formApiService
      .submitForm(
        payload,
        resolveTrialQueryParam(this.route, this.router) || '',
      )
      .subscribe({
        next: () => {
          if (type === 'submit') {
            this.toast.showSuccess('Forms Submitted successfully.');
            this.isSubmitTime = true;
            this.showApprovalWorkflowPopup = true;
          } else {
            this.toast.showSuccess('Forms Saved successfully.');
            this.router.navigate(['/afterAuth/ship-returns/trials/transaction']);
          }
          this.cdr.detectChanges();
        },
        error: () => {
          if (type === 'submit') {
            this.toast.showError('Failed to submit form.');
          } else {
            this.toast.showSuccess('Failed to save form.');
          }

          if (type === 'save') {
            this.saveLoading = false;
          } else {
            this.submitLoading = false;
          }
        },
        complete: () => {
          if (type === 'save') {
            this.saveLoading = false;
          } else {
            this.submitLoading = false;
          }
        },
      });
  }
}
