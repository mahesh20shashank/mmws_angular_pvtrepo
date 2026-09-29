import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';

import { filter, Subscription } from 'rxjs';


import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ToastComponent } from '../../../../ui/toast/toast.component';
import { SelectComponent } from '../../../../ui/select.component';
import { CalenderComponent } from '../../../../ui/calender.component';
import { ParameterCardComponent } from '../../../../ui/parameter-card/parameter-card.component';
import { MonthYearCalendarComponent } from '../../../../ui/month-year-calendar.component';
import { InputComponent } from '../../../../ui/input.component';
import {
  FileUploadComponent,
  UploadedFileItem,
} from '../../../../ui/file-upload/file-upload.component';

import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { MasterService } from '../../../../services/master.service';
import { Apiendpoints } from '../../../../ApiEndPoints';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import { FileUrlUtil } from '../../../../file-url-util';
import { MultiSelectDropdownComponent } from '../../../../ui/multiselect';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-hello-deck-flight-friction',

  standalone: true,

  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    SelectComponent,
    CalenderComponent,
    ParameterCardComponent,
    InputComponent,
    FileUploadComponent,
    ApprovalWorkFlow,
    MultiSelectDropdownComponent,
  ],

  templateUrl: './hello-deck-flight-friction.html',
  styleUrl: './hello-deck-flight-friction.css',
})
export class HelloDeckFlightFriction implements OnInit, OnDestroy {
  form!: FormGroup;
  uploadedAuthorityFiles: UploadedFileItem[] = [];

  loading = false;

  readonly restartIcon = 'rotate-ccw';

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  uploadedFilesList: any[] = [];

  showApprovalWorkflowPopup = false;
      isSubmitTime = false;

  shipOptions: any[] = [];
  commandOptions: any[] = [];
  locationOptions: any[] = [];
  occasionOptions: any[] = [];
  reps_present_options: any[] = [];
  usersList: any[] = [];
  // ------------------------------- EQUIPMENT TABS -------------------------------
  eqpList: any[] = [];
  activeTab: any = null;

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
  // -------------------------------------------------------------------------------

  yesNoOptions = [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ];

  workflowTrialId: string | undefined;

  routeSubscription!: Subscription;

  constructor(
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private masterService: MasterService,
    private apiService: ApiService,
    private toast: ToastService,
    private toastService: ToastService,
    public formApiService: FormApiService,
    private route: ActivatedRoute,
  ) {
    // IMPORTANT FIX
    this.router.routeReuseStrategy.shouldReuseRoute = () => false;
  }

  // =====================================================
  // INIT
  // =====================================================

  ngOnInit(): void {
    this.buildForm();
    this.initializeComponent();
    this.loadRepsPresentOptions();

    this.loadLocation();
    this.loadConductofTrialOptions();

    // ROUTE CHANGE LISTENER
    this.routeSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.initializeComponent();
      });

    // When reps_present changes, fetch users of that type
    this.form.get('reps_present')?.valueChanges.subscribe((userType) => {
      console.log('userType', userType);
      if (userType) {
        this.getUsersByType(userType);
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
  }

  loadConductofTrialOptions() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=OCCHITU`,
        { labelKey: 'name', valueKey: 'name' },
      )
      .subscribe((res) => {
        Promise.resolve().then(() => {
          this.occasionOptions = res || [];
          this.cdr.markForCheck();
        });
      });
  }

  loadLocation() {
    this.masterService.getLocations().subscribe((res) => {
      this.locationOptions = res.data.map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
    });
  }

  loadRepsPresentOptions() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=HITUINSP`,
        { labelKey: 'name', valueKey: 'name' },
      )
      .subscribe((res) => {
        Promise.resolve().then(() => {
          this.reps_present_options = res || [];
          this.cdr.markForCheck();
        });
      });
  }

  getUsersByType(selectedId: number) {
    const shipId = this.form.get('ship')?.value;

    const selectedOption = this.reps_present_options.find(
      (item) => item.value === selectedId,
    );

    const selectedName = selectedOption?.label?.toLowerCase();

    let apiUrl = '';

    if (selectedName === 'ship staff') {
      if (!shipId) {
        this.toastService.showError('Please select a ship first.');
        return;
      }
      apiUrl = `${Apiendpoints.MASTER_USER}?ship_id=${shipId}`;
    } else if (selectedName === 'hitu') {
      apiUrl = `${Apiendpoints.MASTER_USER}?user_type=HITU`;
    } else if (selectedName === 'dockyard') {
      apiUrl = `${Apiendpoints.MASTER_USER}?user_type=SHIPYARD`;
    } else {
      return;
    }

    this.apiService.get(apiUrl).subscribe({
      next: (res: any) => {
        this.usersList = (res?.data || []).map((user: any) => ({
          label: `${user.first_name} ${user?.last_name}`,
          value: user.id,
        }));
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(err);
      },
    });
  }

  // =====================================================
  // INITIALIZE COMPONENT
  // =====================================================

  // initializeComponent(): void {
  //   this.loadShipOptions();

  //   this.workflowTrialId =
  //     this.route.snapshot.queryParamMap.get('trial') ||
  //     undefined;

  //   this.loadTrialDetails();

  //   console.log('FORM RELOADED');
  // }

  // =====================================================
  // BUILD FORM
  // =====================================================

  buildForm(): void {
    this.form = this.fb.group({
      // HEADER
      ship: ['', Validators.required],

      date_of_conduct_of_trials: [''],

      place_of_conduct_of_trials: [''],

      occasion_of_conduct_of_trials: [''],

      reps_present: [''],
      reps_present_user: [''],

      authority: [''],
      authority_doc: [''],

      authority_date: [''],

      structural_defects: [''],
      rust_marks: [''],
      pitting: [''],
      paint_blisters: [''],
      burn_spots: [''],
      scratch_marks: [''],
      paint_peeling: [''],
      loose_adhesion: [''],
      paint_cracking: [''],
      paint_chipped: [''],
      undulations: [''],
      patch_repairs: [''],
      other_observations: [''],

      structural_defects_total_area: [''],
      structural_defects_location: [''],
      structural_defects_frame_station: [''],

      rust_marks_total_area: [''],
      rust_marks_location: [''],
      rust_marks_frame_station: [''],

      pitting_total_area: [''],
      pitting_location: [''],
      pitting_frame_station: [''],

      paint_blisters_total_area: [''],
      paint_blisters_location: [''],
      paint_blisters_frame_station: [''],

      burn_spots_total_area: [''],
      burn_spots_location: [''],
      burn_spots_frame_station: [''],

      scratch_marks_total_area: [''],
      scratch_marks_location: [''],
      scratch_marks_frame_station: [''],

      paint_peeling_total_area: [''],
      paint_peeling_location: [''],
      paint_peeling_frame_station: [''],

      loose_adhesion_total_area: [''],
      loose_adhesion_location: [''],
      loose_adhesion_frame_station: [''],

      paint_cracking_total_area: [''],
      paint_cracking_location: [''],
      paint_cracking_frame_station: [''],

      paint_chipped_total_area: [''],
      paint_chipped_location: [''],
      paint_chipped_frame_station: [''],

      undulations_total_area: [''],
      undulations_location: [''],
      undulations_frame_station: [''],

      // Row 12 (patch_repairs) aur 13 (other_observations) yahan bhi same problem hai
      patch_repairs_total_area: [''],
      patch_repairs_location: [''],
      patch_repairs_frame_station: [''],

      other_observations_total_area: [''],
      other_observations_location: [''],
      other_observations_frame_station: [''],

      // TABLE
      trials_table: this.fb.group({
        // WET
        wet_209_p: [''],
        wet_209_cl: [''],
        wet_209_s: [''],

        wet_214_p: [''],
        wet_214_cl: [''],
        wet_214_s: [''],

        wet_218_p: [''],
        wet_218_cl: [''],
        wet_218_s: [''],

        // OILY
        oily_209_p: [''],
        oily_209_cl: [''],
        oily_209_s: [''],

        oily_214_p: [''],
        oily_214_cl: [''],
        oily_214_s: [''],

        oily_218_p: [''],
        oily_218_cl: [''],
        oily_218_s: [''],

        // OVERALL
        overall_remarks: [''],
      }),
    });
  }

  // =====================================================
  // LOAD SHIP OPTIONS
  // =====================================================

  loadShipOptions(): void {
    this.apiService.get<any>('master/ships/').subscribe({
      next: (res: any) => {
        const data = res?.data || res || [];

        this.shipOptions = data.map((item: any) => ({
          label: item.name || item.ship_name,
          value: item.id,
        }));
      },

      error: (err) => {
        console.error(err);
      },
    });
  }

  // =====================================================
  // LOAD TRIAL DETAILS
  // =====================================================

  // loadTrialDetails(): void {

  //   if (!this.workflowTrialId) return;

  //   const url =
  //     `api/data/trials/?uuid=${this.workflowTrialId}`;

  //   this.apiService.get<any>(url).subscribe({

  //     next: (response: any) => {

  //       const trial =
  //         Array.isArray(response)
  //           ? response[0]
  //           : response?.results?.[0] ||
  //           response?.data?.[0] ||
  //           response?.data ||
  //           response;

  //       if (!trial) return;

  //       // PATCH HEADER
  //       this.form.patchValue({

  //         ship:
  //           trial?.ship_id ||
  //           trial?.ship ||
  //           '',

  //         date_of_conduct_of_trials:
  //           trial?.date_of_conduct_of_trials || '',

  //         place_of_conduct_of_trials:
  //           trial?.place_of_conduct_of_trials || '',

  //         occasion_of_conduct_of_trials:
  //           trial?.occasion_of_conduct_of_trials || '',

  //         reps_present:
  //           trial?.reps_present || '',

  //         authority:
  //           trial?.authority || '',

  //         authority_date:
  //           trial?.authority_date || '',
  //       });

  //       // PATCH JSON DATA
  //       if (trial?.json_data) {

  //         this.form.patchValue({

  //           ...trial.json_data,

  //           trials_table: {
  //             ...trial.json_data?.trials_table,
  //           },
  //         });
  //       }

  //       console.log('DATA PATCHED');
  //     },

  //     error: (err) => {
  //       console.error(err);
  //     },
  //   });
  // }

  initializeComponent(): void {
    this.loadShipOptions();
    this.loadTrialPrefillFromQuery();
    console.log('FORM RELOADED');
  }

  /* ----------------------------- EQUIPMENT TABS -------------------------------- */

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

      // ship dropdown ID-based hai, isliye trialRow.ship_id use karo (ship_name nahi)
      if (trialRow.ship_id != null) {
        this.form.patchValue({ ship: trialRow.ship_id }, { emitEvent: false });
      }

      const jsonData =
        response?.json_data ?? response?.data?.json_data ?? response;
      const finalJsonData =
        typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

      const equipmentKey =
        this.activeTab?.name ||
        this.activeTab?.nomenclature ||
        Object.keys(finalJsonData || {})[0];

      const equipmentPayload = this.extractEquipmentPayload(
        finalJsonData,
        equipmentKey,
      );

      this.fillData(equipmentPayload);
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Trial prefill failed (Helo Deck Flight Friction)', e);
    }
  }

  /** Tab switch hone par call hota hai */
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

      const jsonData =
        response?.json_data ?? response?.data?.json_data ?? response;
      const finalJsonData =
        typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      const equipmentPayload = this.extractEquipmentPayload(
        finalJsonData,
        nomenclature,
      );

      this.fillData(equipmentPayload);
      this.cdr.detectChanges();
    } catch (error) {
      console.error(
        'Failed to load Helo Deck Flight Friction data for selected equipment',
        error,
      );
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'structural_defects' in jsonData ||
      'date_of_conduct_of_trials' in jsonData ||
      'trials_table' in jsonData;
    if (isFlat) return jsonData;

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

  /** Tab switch pe form reset — ship field preserve karke */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;
    this.form.reset({}, { emitEvent: false });
    this.form.patchValue({ ship }, { emitEvent: false });
  }

  /** Poore form ko equipment-specific payload se generic tarike se hydrate karta hai. */
  fillData(payload: any): void {
    if (!payload) return;

    const specialKeys = ['authority_doc', 'ship', 'trials_table'];

    Object.keys(payload).forEach((key) => {
      if (specialKeys.includes(key)) return;

      const control = this.form.get(key);
      if (control) {
        control.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });

    // ship — fallback existing value se agar equipment payload mein khaali ho
    if (payload.ship) {
      this.form.get('ship')?.setValue(payload.ship, { emitEvent: false });
    }

    // authority_doc — URL string ko file-upload component ke required object shape mein convert karo
    this.form
      .get('authority_doc')
      ?.setValue(this.buildFileUploadValue(payload.authority_doc), {
        emitEvent: false,
      });

    // ----- Nested trials_table FormGroup -----
    const trialsTableGroup = this.form.get('trials_table');
    if (trialsTableGroup && payload.trials_table) {
      trialsTableGroup.patchValue(payload.trials_table, { emitEvent: false });
    }
  }

  /** Backend se aayi authority_doc (plain URL string ya already-object) ko
   *  FileUploadComponent ke required { id, name, file_path } shape mein convert karta hai */
  private buildFileUploadValue(value: any): UploadedFileItem | null {
    if (!value) {
      return null;
    }

    if (typeof value === 'object' && value.name && value.file_path) {
      return value as UploadedFileItem;
    }

    if (typeof value === 'string') {
      const match = value.match(/api\/files\/([^/]+)\/?$/i);
      const id = match?.[1];

      return {
        id,
        name: id ?? 'Uploaded file',
        file_path: value,
      };
    }

    return null;
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }

  buildPayload() {
    const formDataValues = this.form.value;
    const formValues = this.form.getRawValue();

    const payload: any = {
      ...formDataValues,
      authority_doc: FileUrlUtil.getFileUrl(formValues.authority_doc?.id),
    };

    return payload;
  }

  /* ------------------------------- SAVE ------------------------------- */

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      this.form.reset();
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
            this.router.navigate(['/afterAuth/ship-returns/transactions/trial']);
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
