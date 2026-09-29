import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest } from 'rxjs';
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ToastComponent } from '../../../../ui/toast/toast.component';
import { SelectComponent } from '../../../../ui/select.component';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { Apiendpoints } from '../../../../ApiEndPoints';
import { CalenderComponent } from '../../../../ui/calender.component';
import { ParameterCardComponent } from '../../../../ui/parameter-card/parameter-card.component';
import { MonthYearCalendarComponent } from '../../../../ui/month-year-calendar.component';
import { InputComponent } from '../../../../ui/input.component';
import { MultiSelectDropdownComponent } from '../../../../ui/multiselect';
import { FileUploadComponent } from '../../../../ui/file-upload/file-upload.component';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';
import { MasterService } from '../../../../services/master.service';

export interface UploadedFileItem {
  id?: string;
  name: string;
  file_path: string;
}

@Component({
  selector: 'app-anchor-capstan-add',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    ToastComponent,
    SelectComponent,
    CalenderComponent,
    MonthYearCalendarComponent,
    InputComponent,
    MultiSelectDropdownComponent,
    ParameterCardComponent,
    ApprovalWorkFlow,
    FileUploadComponent,
  ],
  templateUrl: './anchor-capstan-add.component.html',
})
export class AnchorCapstanAdd {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
  uploadedAuthorityFiles: UploadedFileItem[] = [];

  readonly restartIcon = 'rotate-ccw';

  selectedShipId: number = 0;

  form!: FormGroup;
  loading = false;
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  locationOptions: any[] = [];
  occasionOptions: any[] = [];
  shipOptions: any[] = [];
  private shipSubmarine = '';

  port_stbd_options = [
    { label: 'PORT', value: 'port' },
    { label: 'STBD', value: 'stbd' },
  ];

  ship_submarine = [
    { label: 'Ship', value: 'ship' },
    { label: 'Submarine', value: 'Submarine' },
  ];

  reps_present_options: any[] = [];

  capstanTypeOptions: any[] = [];
  makeOptions: any[] = [];

  deckPlatingObsOptions = [
    { label: 'No Observation', value: 'NoObservation' },
    { label: 'Observation', value: 'Observation' },
  ];

  satOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  showDeckPlatingObsFields = false;
  showOperationalTrialDialog = false;
  usersList: any[] = [];

  flag: any;

  // Master data for selected ship — speed ranges come from here
  selectedShipMasterData: any = {
    low_speed_min: 0,
    low_speed_max: 0,
    rated_speed_min: 0,
    rated_speed_max: 0,
    max_speed_min: 0,
    max_speed_max: 0,
  };

  // ------------------------------- EQUIPMENT TABS -------------------------------
  eqpList: any[] = [];
  activeTab: any = null;
  workflowTrialId: string | undefined = undefined;

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

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private toastService: ToastService,
    public formApiService: FormApiService,
    private route: ActivatedRoute,
    private toast: ToastService,
    private masterService: MasterService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.setupConditionalLogic();
    this.loadRepsPresentOptions();
    this.loadOccassionOfConductTrail();
    this.loadLocation();
    this.loadShipOptions();
    this.loadTrialPrefillFromQuery();

    if (this.rowId) {
      this.editMode = true;
      this.getEditDataByRowId(this.rowId);
    }

    // When reps_present changes, fetch users of that type
    this.form.get('reps_present')?.valueChanges.subscribe((userType) => {
      if (userType) {
        this.getUsersByType(userType);
      }
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

  loadLocation() {
    this.masterService.getLocations().subscribe((res) => {
      this.locationOptions = res.data.map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
    });
  }

  loadOccassionOfConductTrail() {
    this.apiService
      .getDropdownData(
        `${Apiendpoints.MASTERS_DROPDOWN_VALUE}?type__code=OCCHITU`,
        {
          labelKey: 'name',
          valueKey: 'id',
        },
      )
      .subscribe((res) => {
        Promise.resolve().then(() => {
          this.occasionOptions = res || [];
          this.cdr.markForCheck();
        });
      });
  }

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

  getUsersByType(selectedId: number) {
    const selectedOption = this.reps_present_options.find(
      (item) => item.value === selectedId,
    );
    const selectedName = selectedOption?.label?.toLowerCase();

    let apiUrl = '';

    if (selectedName === 'ship staff') {
      if (!this.selectedShipId) {
        this.toastService.showError('Please select a ship first.');
        return;
      }
      apiUrl = `${Apiendpoints.MASTER_USER}?ship_id=${this.selectedShipId}`;
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

  private checkSpeedRange(value: number, min: number, max: number): string {
    if (!value && value !== 0) {
      return '';
    }
    return value >= min && value <= max ? 'SAT' : 'UNSAT';
  }

  checkOperationalTrialResult() {
    const low = this.form.get('trials_table.low_speed_remark')?.value;
    const rated = this.form.get('trials_table.rated_speed_remark')?.value;
    const max = this.form.get('trials_table.max_speed_remark')?.value;

    if (!low || !rated || !max) {
      return;
    }

    if (low === 'SAT' && rated === 'SAT' && max === 'SAT') {
      this.form
        .get('trials_table.operational_trials_remarks')
        ?.setValue('SAT', { emitEvent: false });
      this.showOperationalTrialDialog = false;
    } else {
      this.form
        .get('trials_table.operational_trials_remarks')
        ?.setValue('UNSAT', { emitEvent: false });
      this.showOperationalTrialDialog = true;
    }
  }

  setupConditionalLogic() {
    // Row 3: Ferrodo Lining
    this.form
      .get('trials_table.ferrodo_lining_obs')
      ?.valueChanges.subscribe((val) => {
        const remark = this.form.get('trials_table.ferrodo_lining_remarks');
        if (val === 'nil') {
          remark?.setValue('SAT');
          remark?.disable();
          this.flag = 'false';
        } else if (val === 'obs') {
          remark?.setValue('UNSAT');
          remark?.disable();
          this.flag = 'true';
        } else {
          remark?.setValue('');
          remark?.disable();
        }
      });

    // Row 4: Gear Box
    this.form
      .get('trials_table.gear_box_obs')
      ?.valueChanges.subscribe((val) => {
        const remark = this.form.get('trials_table.gear_box_remarks');
        if (val === 'nil') {
          remark?.setValue('SAT');
          remark?.disable();
        } else if (val === 'noise') {
          remark?.setValue('UNSAT');
          remark?.disable();
        } else {
          remark?.setValue('');
          remark?.disable();
        }
      });

    // Row 5: Capstan Motor insulation
    this.form
      .get('trials_table.motor_insulation_value')
      ?.valueChanges.subscribe((val) => {
        const remarks = this.form.get('trials_table.motor_insulation_remarks');
        const num = +val;
        if (!val && val !== 0) {
          remarks?.setValue('', { emitEvent: false });
          remarks?.disable();
          return;
        }
        remarks?.setValue(num >= 10 ? 'SAT' : 'UNSAT', { emitEvent: false });
        remarks?.disable();
      });

    // Row 6: Deck Plating
    this.form
      .get('trials_table.deck_plating_obs')
      ?.valueChanges.subscribe((val) => {
        const remark = this.form.get('trials_table.deck_plating_remarks');
        if (val === 'NoObservation') {
          remark?.setValue('SAT');
          remark?.disable();
          this.showDeckPlatingObsFields = false;
          this.resetDeckPlatingFields();
        } else if (val === 'Observation') {
          remark?.setValue('UNSAT');
          remark?.disable();
          this.showDeckPlatingObsFields = true;
          this.enableDeckPlatingFields();
        } else {
          remark?.setValue('');
          this.showDeckPlatingObsFields = false;
          remark?.disable();
        }
      });

    // Row 7: Speed checks
    this.form
      .get('trials_table.low_speed_value')
      ?.valueChanges.subscribe((value) => {
        const result = this.checkSpeedRange(
          Number(value),
          this.selectedShipMasterData.low_speed_min,
          this.selectedShipMasterData.low_speed_max,
        );
        this.form
          .get('trials_table.low_speed_remark')
          ?.setValue(result, { emitEvent: false });
        this.checkOperationalTrialResult();
      });

    this.form
      .get('trials_table.rated_speed_value')
      ?.valueChanges.subscribe((value) => {
        const result = this.checkSpeedRange(
          Number(value),
          this.selectedShipMasterData.rated_speed_min,
          this.selectedShipMasterData.rated_speed_max,
        );
        this.form
          .get('trials_table.rated_speed_remark')
          ?.setValue(result, { emitEvent: false });
        this.checkOperationalTrialResult();
      });

    this.form
      .get('trials_table.max_speed_value')
      ?.valueChanges.subscribe((value) => {
        const result = this.checkSpeedRange(
          Number(value),
          this.selectedShipMasterData.max_speed_min,
          this.selectedShipMasterData.max_speed_max,
        );
        this.form
          .get('trials_table.max_speed_remark')
          ?.setValue(result, { emitEvent: false });
        this.checkOperationalTrialResult();
      });

    // Row 8: Grease Points
    this.form
      .get('trials_table.grease_points_obs')
      ?.valueChanges.subscribe((val) => {
        const remark = this.form.get('trials_table.grease_points_remarks');
        if (val === 'charged') {
          remark?.setValue('SAT');
          remark?.disable();
        } else if (val) {
          remark?.setValue('UNSAT');
          remark?.disable();
        } else {
          remark?.setValue('');
        }
      });

    // Row 9: Oil Type Correct
    this.form
      .get('trials_table.oil_type_correct')
      ?.valueChanges.subscribe((val) => {
        const remarks = this.form.get('trials_table.oil_type_remarks');
        if (!val) {
          remarks?.setValue('', { emitEvent: false });
          return;
        }
        remarks?.setValue(val === 'yes' ? 'SAT' : 'UNSAT', {
          emitEvent: false,
        });
        remarks?.disable();
      });

    // Row 10: Oil Level
    this.form.get('trials_table.oil_level')?.valueChanges.subscribe((val) => {
      const remarks = this.form.get('trials_table.oil_level_remarks');
      const map: Record<string, string> = {
        ok: 'SAT',
        low: 'SAT with Observation',
        empty: 'UNSAT',
      };
      remarks?.setValue(map[val] ?? '', { emitEvent: false });
      remarks?.disable();
    });

    // Row 12: Change of Oil — compare date with today
    // this.form.get('trials_table.last_oil_change_date')?.valueChanges.subscribe((selectedDate) => {
    //   console.log('selectedDate:', selectedDate);
    //   console.log('type:', typeof selectedDate);
    //   if (!selectedDate) {
    //     return;
    //   }
    //   const today = new Date();
    //   const lastDate = new Date(selectedDate);
    //   const months =
    //     (today.getFullYear() - lastDate.getFullYear()) * 12 +
    //     (today.getMonth() - lastDate.getMonth());
    //   const status = months < 12 ? 'SAT' : 'UNSAT';
    //   this.form
    //     .get('trials_table.oil_change_status')
    //     ?.setValue(status, { emitEvent: false });
    // });

    this.form
      .get('trials_table.last_oil_change_date')
      ?.valueChanges.subscribe((value) => {
        console.log('value->>>>>>>>>>>>', value);
        const remarkControl = this.form.get('trials_table.oil_change_status');

        if (!value) {
          remarkControl?.setValue(null);
          remarkControl?.enable();
          return;
        }

        const [month, year] = value.split('/').map(Number);

        const today = new Date();
        const currentMonth = today.getMonth() + 1; // 1-12
        const currentYear = today.getFullYear();

        const monthsDiff = (currentYear - year) * 12 + (currentMonth - month);

        console.log('Months Difference:', monthsDiff);

        if (monthsDiff >= 0 && monthsDiff < 12) {
          console.log('here in sat condition');
          remarkControl?.setValue('SAT');
        } else {
          console.log('here in unsat condition');

          remarkControl?.setValue('UNSAT');
        }

        remarkControl?.disable();
      });

    // Row 13: Starting Current — design >= measured → SAT
    /*combineLatest([
      this.form.get('trials_table.starting_current_design')!.valueChanges,
      this.form.get('trials_table.starting_current_measured')!.valueChanges,
    ]).subscribe(([design, measured]) => {
      if (
        design === null ||
        measured === null ||
        design === '' ||
        measured === ''
      ) {
        return;
      }
      const status = Number(design) >= Number(measured) ? 'SAT' : 'UNSAT';
      this.form
        .get('trials_table.starting_current_sat')
        ?.setValue(status, { emitEvent: false });
    });*/

    // Row 14: Running Current — design >= measured → SAT
    /*combineLatest([
      this.form.get('trials_table.running_current_design')!.valueChanges,
      this.form.get('trials_table.running_current_measured')!.valueChanges,
    ]).subscribe(([design, measured]) => {
      if (
        design === null ||
        measured === null ||
        design === '' ||
        measured === ''
      ) {
        return;
      }
      const status = Number(design) >= Number(measured) ? 'SAT' : 'UNSAT';
      this.form
        .get('trials_table.running_current_sat')
        ?.setValue(status, { emitEvent: false });
    });*/

    // Row 15: Log Book
    this.form
      .get('trials_table.log_book_exist')
      ?.valueChanges.subscribe((val) => {
        const remarks = this.form.get('trials_table.log_book_remarks');
        if (!val) {
          remarks?.setValue('', { emitEvent: false });
          remarks?.disable();
          return;
        }
        remarks?.setValue(val === 'yes' ? 'SAT' : 'UNSAT', {
          emitEvent: false,
        });
        remarks?.disable();
      });

    // Row 16: Periodicity
    this.form
      .get('trials_table.measurement_periodicity')
      ?.valueChanges.subscribe((val) => {
        const remarks = this.form.get(
          'trials_table.measurement_periodicity_remarks',
        );
        if (!val) {
          remarks?.setValue('', { emitEvent: false });
          remarks?.disable();
          return;
        }
        remarks?.setValue(
          val === 'monthly' || val === 'quarterly' ? 'SAT' : 'UNSAT',
          { emitEvent: false },
        );
        remarks?.disable();
      });

    // Row 17: SPM Check
    this.form.get('trials_table.spm_check')?.valueChanges.subscribe((val) => {
      const remarks = this.form.get('trials_table.spm_check_remarks');
      const map: Record<string, string> = {
        na: 'N/A',
        green: 'SAT',
        yellow: 'SAT with Observation',
        red: 'UNSAT',
      };
      remarks?.setValue(map[val] ?? '', { emitEvent: false });
      remarks?.disable();
    });
  }

  buildForm() {
    this.form = this.fb.group({
      // ── Header fields ──────────────────────────────────────────
      ship: [{ value: '', disabled: true }],
      ship_or_submarine: [{ value: '', disabled: true }],
      port_stbd: [''],
      date_of_conduct_of_trials: [''],
      place_of_conduct_of_trials: [''],
      place_of_conduct_trail: [''],
      occasion_of_conduct_trail: [''],
      occasion_of_conduct_of_trials: [''],
      authority_of_conduct_of_trials: [''],
      reps_present: [''],
      reps_present_user: [''],
      reps_present_other_user: [''],
      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],

      // ── Table rows ─────────────────────────────────────────────
      trials_table: this.fb.group({
        // Row 1 & 2
        type_of_capstan: [''],
        manufacturer_name: [{ value: '', disabled: true }],

        // Row 3: Ferrodo Lining
        ferrodo_lining_obs: [''],
        ferrodo_lining_remarks: [''],
        ferrodo_lining_remarks1: [''],

        // Row 4: Gear Box
        gear_box_obs: [''],
        gear_box_remarks: [''],
        gear_box_unsat_remarks: [''],

        // Row 5: Capstan Motor
        motor_insulation_value: [null],
        motor_insulation_remarks: [''],

        // Row 6: Deck Plating
        deck_plating_obs: [''],
        deck_plating_remarks: [''],
        deck_plating_corrosion: [{ value: '', disabled: true }],
        deck_plating_pitting: [{ value: '', disabled: true }],
        deck_plating_unpainted: [{ value: '', disabled: true }],
        deck_plating_others: [{ value: '', disabled: true }],
        deck_plating_corrosion_remark: [''],
        deck_plating_pitting_remark: [''],
        deck_plating_unpainted_remark: [''],
        deck_plating_others_remark: [''],
        // Row 7: Operational Trials — 3 speeds
        low_speed_value: [''],
        low_speed_remark: [{ value: '', disabled: true }],
        rated_speed_value: [],
        rated_speed_remark: [{ value: '', disabled: true }],
        max_speed_value: [''],
        max_speed_remark: [{ value: '', disabled: true }],
        operational_trials_remarks: [{ value: '', disabled: true }],

        // Row 8: Grease Points
        grease_points_obs: [''],
        grease_points_remarks: [''],
        grease_points_remarks1: [''],

        // Row 9: Oil Type
        oil_type: [''],
        oil_type_correct: [''],
        oil_type_remarks: [''],

        // Row 10: Oil Level
        oil_level: [''],
        oil_level_remarks: [''],

        // Row 11: Lub Oil Analysis
        lub_water_content: [''],
        lub_viscosity: [''],
        lub_base_number: [''],
        lub_acid_number: [''],
        lub_metal_traces: [''],
        lub_analysis_remarks: [''],
        lub_water_content_remarks: [''],
        lub_viscosity_remarks: [''],
        lub_base_number_remarks: [''],
        lub_acid_number_remarks: [''],
        lub_metal_traces_remarks: [''],

        // Row 12: Change of Oil
        last_oil_change_date: [''],
        oil_change_status: [{ value: '', disabled: true }], // ← auto-set from date comparison

        // Row 13: Starting Current
        starting_current_design: [null], // ← design value input
        starting_current_measured: [''],
        starting_current_sat: [''], // ← auto-set

        // Row 14: Running Current
        running_current_design: [null], // ← design value input
        running_current_measured: [''],
        running_current_sat: [''], // ← auto-set

        // Row 15: Log Book
        log_book_exist: [''],
        log_book_remarks: [''],

        // Row 16: Periodicity
        measurement_periodicity: [''],
        measurement_periodicity_remarks: [''],
        other_observations_parameter: [''],

        // Row 17: SPM Check
        spm_check: [''],
        spm_check_remarks: [''],

        // Row 18: Other Observations
        other_observations: [''],

        // Row 19: Overall Remarks
        overall_remarks: [''],
      }),
    });
  }

  get watertightDoors(): FormArray {
    return this.form.get('watertight_hatches') as FormArray;
  }

  enableDeckPlatingFields() {
    [
      'deck_plating_corrosion',
      'deck_plating_pitting',
      'deck_plating_unpainted',
      'deck_plating_others',
    ].forEach((f) => {
      this.form.get(`trials_table.${f}`)?.enable();
    });
  }

  resetDeckPlatingFields() {
    [
      'deck_plating_corrosion',
      'deck_plating_pitting',
      'deck_plating_unpainted',
      'deck_plating_others',
    ].forEach((f) => {
      this.form.get(`trials_table.${f}`)?.reset();
      this.form.get(`trials_table.${f}`)?.disable();
    });
    [
      'deck_plating_corrosion_remark',
      'deck_plating_pitting_remark',
      'deck_plating_unpainted_remark',
      'deck_plating_others_remark',
    ].forEach((f) => {
      this.form.get(`trials_table.${f}`)?.reset();
    });
  }

  /* ----------------------------- EDIT MODE ----------------------------------- */

  getEditDataByRowId(rowId: string) {
    this.apiService.get(`${Apiendpoints.BER_CERTIFICATE}${rowId}`).subscribe({
      next: (res: any) => {
        if (res?.data) {
          this.editDataDetails = res.data;
          this.form.patchValue({
            command: this.editDataDetails?.ship?.command?.id,
            class_of_ship: this.editDataDetails?.ship?.classofship?.id,
            ship: this.editDataDetails?.ship?.id,
            ship_status:
              this.editDataDetails?.ship_status === 'refit' ? 'REFIT' : 'OPS',
            refit_status: this.editDataDetails?.refit?.id,
            refit_date: this.editDataDetails?.refit_recommencement_date
              ? new Date(this.editDataDetails.refit_recommencement_date)
              : null,
          });
        }
      },
      error: (err) => {
        console.error('Error fetching BER certificate data:', err);
        this.toastService.showError('Failed to load BER certificate details.');
      },
    });
  }

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  /* ------------------------------- SAVE --------------------------------------- */
  buildPayload() {
    const formDataValues = this.form.getRawValue();
    const payload: any = {
      authority_doc: FileUrlUtil.getFileUrl(formDataValues.authority_doc?.id),

      // ---------------- BASIC DETAILS ----------------
      basicDetails: {
        classOfShip: this.form.value.class_of_ship,
        ship: this.form.value.ship,
        portStbd: this.form.value.port_stbd,
        shipOrSubmarine: this.form.value.ship_or_submarine,
        trialDate: this.form.value.date_of_conduct_of_trials,
        trialPlace: this.form.value.place_of_conduct_of_trials,
        trialOccasion: this.form.value.occasion_of_conduct_of_trials,
        trialAuthority: this.form.value.authority_of_conduct_of_trials,
        representativesPresent: this.form.value.reps_present,
      },
      oil_change_status:
        this.form.getRawValue().trials_table?.oil_change_status,
      // ---------------- TABLE DATA ----------------
      tableData: {
        // ROW 1
        type_of_capstan: this.form.value.trials_table?.type_of_capstan,
        manufacturer_name: this.form.value.trials_table?.manufacturer_name,

        // ROW 2
        // make: this.form.value.trials_table?.make,

        // ROW 3
        ferrodo_lining_obs: this.form.value.trials_table?.ferrodo_lining_obs,
        ferrodo_lining_remarks:
          this.form.value.trials_table?.ferrodo_lining_remarks,
        ferrodo_lining_remarks1:
          this.form.value.trials_table?.ferrodo_lining_remarks1,

        // ROW 4
        gear_box_obs: this.form.value.trials_table?.gear_box_obs,
        gear_box_remarks: this.form.value.trials_table?.gear_box_remarks,

        // ROW 5
        motor_insulation_value:
          this.form.value.trials_table?.motor_insulation_value,
        motor_insulation_remarks:
          this.form.value.trials_table?.motor_insulation_remarks,

        // ROW 6
        deck_plating_obs: this.form.value.trials_table?.deck_plating_obs,
        deck_plating_remarks:
          this.form.value.trials_table?.deck_plating_remarks,
        deck_plating_corrosion:
          this.form.getRawValue().trials_table?.deck_plating_corrosion,
        deck_plating_pitting:
          this.form.getRawValue().trials_table?.deck_plating_pitting,
        deck_plating_unpainted:
          this.form.getRawValue().trials_table?.deck_plating_unpainted,
        deck_plating_others:
          this.form.getRawValue().trials_table?.deck_plating_others,
        deck_plating_corrosion_remark:
          this.form.value.trials_table?.deck_plating_corrosion_remark,
        deck_plating_pitting_remark:
          this.form.value.trials_table?.deck_plating_pitting_remark,
        deck_plating_unpainted_remark:
          this.form.value.trials_table?.deck_plating_unpainted_remark,
        deck_plating_others_remark:
          this.form.value.trials_table?.deck_plating_others_remark,

        // ROW 7 (Speeds)
        low_speed_value: this.form.value.trials_table?.low_speed_value,
        low_speed_remark: this.form.value.trials_table?.low_speed_remark,
        rated_speed_value: this.form.value.trials_table?.rated_speed_value,
        rated_speed_remark: this.form.value.trials_table?.rated_speed_remark,
        max_speed_value: this.form.value.trials_table?.max_speed_value,
        max_speed_remark: this.form.value.trials_table?.max_speed_remark,
        operational_trials_remarks:
          this.form.value.trials_table?.operational_trials_remarks,

        // ROW 8
        grease_points_obs: this.form.value.trials_table?.grease_points_obs,
        grease_points_remarks:
          this.form.value.trials_table?.grease_points_remarks,
        grease_points_remarks1:
          this.form.value.trials_table?.grease_points_remarks1,

        // ROW 9
        oil_type: this.form.value.trials_table?.oil_type,
        oil_type_correct: this.form.value.trials_table?.oil_type_correct,
        oil_type_remarks: this.form.value.trials_table?.oil_type_remarks,

        // ROW 10
        oil_level: this.form.value.trials_table?.oil_level,
        oil_level_remarks: this.form.value.trials_table?.oil_level_remarks,

        // ROW 11 (Lub Analysis)
        lub_water_content: this.form.value.trials_table?.lub_water_content,
        lub_water_content_remarks:
          this.form.value.trials_table?.lub_water_content_remarks,
        lub_viscosity: this.form.value.trials_table?.lub_viscosity,
        lub_viscosity_remarks:
          this.form.value.trials_table?.lub_viscosity_remarks,
        lub_base_number: this.form.value.trials_table?.lub_base_number,
        lub_base_number_remarks:
          this.form.value.trials_table?.lub_base_number_remarks,
        lub_acid_number: this.form.value.trials_table?.lub_acid_number,
        lub_acid_number_remarks:
          this.form.value.trials_table?.lub_acid_number_remarks,
        lub_metal_traces: this.form.value.trials_table?.lub_metal_traces,
        lub_metal_traces_remarks:
          this.form.value.trials_table?.lub_metal_traces_remarks,

        // ROW 12
        last_oil_change_date:
          this.form.value.trials_table?.last_oil_change_date,
        oil_change_status: this.form.value.trials_table?.oil_change_status,

        // ROW 13
        starting_current_design:
          this.form.value.trials_table?.starting_current_design,
        starting_current_measured:
          this.form.value.trials_table?.starting_current_measured,
        starting_current_sat:
          this.form.value.trials_table?.starting_current_sat,

        // ROW 14
        running_current_design:
          this.form.value.trials_table?.running_current_design,
        running_current_measured:
          this.form.value.trials_table?.running_current_measured,
        running_current_sat: this.form.value.trials_table?.running_current_sat,

        // ROW 15
        log_book_exist: this.form.value.trials_table?.log_book_exist,
        log_book_remarks: this.form.value.trials_table?.log_book_remarks,

        // ROW 16
        measurement_periodicity:
          this.form.value.trials_table?.measurement_periodicity,
        measurement_periodicity_remarks:
          this.form.value.trials_table?.measurement_periodicity_remarks,

        // ROW 17
        spm_check: this.form.value.trials_table?.spm_check,
        spm_check_remarks: this.form.value.trials_table?.spm_check_remarks,

        // ROW 18
        other_observations_parameter:
          this.form.value.trials_table?.other_observations_parameter,
        other_observations: this.form.value.trials_table?.other_observations,

        // ROW 19
        overall_remarks: this.form.value.trials_table?.overall_remarks,
      },
    };

    return payload;
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      this.form.reset();
      this.toast.showSuccess('Form cleared successfully');
      return;
    }
    const payload = this.buildPayload();
    // return;
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

  /* ----------------------------- SAT HELPERS --------------------------------- */

  getSatClass(path: string, ...satValues: string[]): object {
    const val = this.form.get(path)?.value;
    const isSat = satValues.includes(val);
    return {
      'text-green-600 font-semibold': isSat && val,
      'text-red-600 font-semibold': !isSat && val,
    };
  }

  getSatLabel(path: string, ...satValues: string[]): string {
    const val = this.form.get(path)?.value;
    if (!val) return '—';
    return satValues.includes(val) ? 'SAT' : 'UNSAT';
  }

  getMotorSatClass(): object {
    const val = +this.form.get('trials_table.motor_insulation_value')?.value;
    return {
      'text-green-600 font-semibold': val >= 10,
      'text-red-600 font-semibold': val > 0 && val < 10,
    };
  }

  getMotorSatLabel(): string {
    const val = +this.form.get('trials_table.motor_insulation_value')?.value;
    if (!val) return '—';
    return val >= 10 ? 'SAT' : 'UNSAT';
  }

  getOilLevelSatClass(): object {
    const val = this.form.get('trials_table.oil_level')?.value;
    return {
      'text-green-600 font-semibold': val === 'ok',
      'text-yellow-600 font-semibold': val === 'low',
      'text-red-600 font-semibold': val === 'empty',
    };
  }

  getOilLevelSatLabel(): string {
    const map: Record<string, string> = {
      ok: 'SAT',
      low: 'SAT with Observation',
      empty: 'UNSAT',
    };
    return map[this.form.get('trials_table.oil_level')?.value] ?? '—';
  }

  getSpmSatClass(): object {
    const val = this.form.get('trials_table.spm_check')?.value;
    return {
      'text-slate-500': val === 'na',
      'text-green-600 font-semibold': val === 'green',
      'text-yellow-600 font-semibold': val === 'yellow',
      'text-red-600 font-semibold': val === 'red',
    };
  }

  getSpmSatLabel(): string {
    const map: Record<string, string> = {
      na: 'N/A',
      green: 'SAT',
      yellow: 'SAT with Observation',
      red: 'UNSAT',
    };
    return map[this.form.get('trials_table.spm_check')?.value] ?? '—';
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

      this.selectedShipId = trialRow?.ship_id;

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

      this.form.patchValue({ ship: trialRow.ship_name }, { emitEvent: false });
      // this.form.patchValue(
      //   { ship_or_submarine: trialRow.ship_type_name },
      //   { emitEvent: false },
      // );

      this.shipSubmarine = trialRow.ship_type_name ?? '';

      this.form.patchValue(
        { ship_or_submarine: this.shipSubmarine },
        { emitEvent: false },
      );

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
      this.applyEquipmentDefaults(this.activeTab);
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Trial prefill failed (Anchor Capstan)', e);
    }
  }

  /** Tab switch hone par call hota hai */
  async setActiveTab(tab: any): Promise<void> {
    if (!tab || this.isSameEquipment(this.activeTab, tab)) return;

    this.activeTab = tab;
    this.formApiService.setCurrentEquipmentNomenclature(tab);

    if (!this.workflowTrialId) return;

    this.resetFormData();
    this.applyEquipmentDefaults(tab);
    this.form.patchValue(
      { ship_or_submarine: this.shipSubmarine },
      { emitEvent: false },
    );
    this.form.get('ship_or_submarine')?.disable({ emitEvent: false });

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
      this.applyEquipmentDefaults(this.activeTab);
      this.form.patchValue(
        { ship_or_submarine: this.shipSubmarine },
        { emitEvent: false },
      );
      this.form.get('ship_or_submarine')?.disable({ emitEvent: false });
      this.cdr.detectChanges();
    } catch (error) {
      console.error(
        'Failed to load Anchor Capstan data for selected equipment',
        error,
      );
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private applyEquipmentDefaults(tab: any): void {
    if (!tab) return;

    const equipmentList =
      this.formApiService?.context?.equipment_details || this.eqpList || [];
    const selectedEquipment =
      equipmentList.find(
        (eq: any) =>
          (eq.id ?? eq.equipment_id) === (tab.id ?? tab.equipment_id),
      ) || tab; // tab itself already carries manufacturer_name/model per the API shape

    (this.form.get('trials_table') as FormGroup).patchValue(
      {
        manufacturer_name: selectedEquipment?.manufacturer_name ?? '',
      },
      { emitEvent: false },
    );
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    // Ye payload custom shape mein hai: { basicDetails, tableData, authority_doc, oil_change_status }
    const isFlat = 'basicDetails' in jsonData || 'tableData' in jsonData;
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

  /** Tab switch pe form reset — ship field preserve karke,
   *  trials_table ke saare auto-locked fields ko bhi pehle enable karke reset karta hai */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;
    const trialsTable = this.form.get('trials_table') as FormGroup;

    Object.keys(this.form.controls).forEach((key) => {
      if (key === 'trials_table') return;
      const control = this.form.get(key);
      control?.enable({ emitEvent: false });
      control?.reset('', { emitEvent: false });
    });

    Object.keys(trialsTable.controls).forEach((key) => {
      const control = trialsTable.get(key);
      control?.enable({ emitEvent: false });
      control?.reset('', { emitEvent: false });
    });

    this.showDeckPlatingObsFields = false;
    this.showOperationalTrialDialog = false;
    this.flag = undefined;

    this.form.patchValue({ ship }, { emitEvent: false });
  }

  /** Poore form ko custom-shape equipment payload se hydrate karta hai.
   *  buildPayload() nested { basicDetails, tableData } structure banata hai
   *  jo form ke actual structure se match nahi karta, isliye yahan reverse-map
   *  karke wapas form ke trials_table + top-level fields mein bharna padta hai. */
  fillData(payload: any): void {
    if (!payload) return;

    const basic = payload.basicDetails || {};
    const table = payload.tableData || {};

    // ---- Top-level header fields (basicDetails se) ----
    this.form.patchValue(
      {
        class_of_ship: basic.classOfShip ?? '',
        ship: basic.ship || this.form.get('ship')?.value || '',
        port_stbd: basic.portStbd ?? '',
        // ship_or_submarine: basic.shipOrSubmarine ?? '',
        ship_or_submarine:
          basic.ship_or_submarine ||
          this.form.get('ship_or_submarine')?.value ||
          '',
        date_of_conduct_of_trials: basic.trialDate ?? '',
        place_of_conduct_of_trials: basic.trialPlace ?? '',
        occasion_of_conduct_of_trials: basic.trialOccasion ?? '',
        authority_of_conduct_of_trials: basic.trialAuthority ?? '',
        reps_present: basic.representativesPresent ?? '',
      },
      { emitEvent: false },
    );

    // authority_doc — URL string ko file-upload component ke required object shape mein convert karo
    this.form
      .get('authority_doc')
      ?.setValue(this.buildFileUploadValue(payload.authority_doc), {
        emitEvent: false,
      });

    // ---- trials_table (tableData se) ----
    const trialsTable = this.form.get('trials_table') as FormGroup;

    trialsTable.patchValue(
      {
        type_of_capstan: table.type_of_capstan ?? '',
        // make: table.make ?? '',
        manufacturer_name: table.manufacturer_name ?? '',

        ferrodo_lining_obs: table.ferrodo_lining_obs ?? '',
        ferrodo_lining_remarks: table.ferrodo_lining_remarks ?? '',
        ferrodo_lining_remarks1: table.ferrodo_lining_remarks1 ?? '',

        gear_box_obs: table.gear_box_obs ?? '',
        gear_box_remarks: table.gear_box_remarks ?? '',

        motor_insulation_value: table.motor_insulation_value ?? null,
        motor_insulation_remarks: table.motor_insulation_remarks ?? '',

        deck_plating_obs: table.deck_plating_obs ?? '',
        deck_plating_remarks: table.deck_plating_remarks ?? '',
        deck_plating_corrosion: table.deck_plating_corrosion ?? '',
        deck_plating_pitting: table.deck_plating_pitting ?? '',
        deck_plating_unpainted: table.deck_plating_unpainted ?? '',
        deck_plating_others: table.deck_plating_others ?? '',
        deck_plating_corrosion_remark:
          table.deck_plating_corrosion_remark ?? '',
        deck_plating_pitting_remark: table.deck_plating_pitting_remark ?? '',
        deck_plating_unpainted_remark:
          table.deck_plating_unpainted_remark ?? '',
        deck_plating_others_remark: table.deck_plating_others_remark ?? '',

        low_speed_value: table.low_speed_value ?? '',
        low_speed_remark: table.low_speed_remark ?? '',
        rated_speed_value: table.rated_speed_value ?? '',
        rated_speed_remark: table.rated_speed_remark ?? '',
        max_speed_value: table.max_speed_value ?? '',
        max_speed_remark: table.max_speed_remark ?? '',
        operational_trials_remarks: table.operational_trials_remarks ?? '',

        grease_points_obs: table.grease_points_obs ?? '',
        grease_points_remarks: table.grease_points_remarks ?? '',
        grease_points_remarks1: table.grease_points_remarks1 ?? '',

        oil_type: table.oil_type ?? '',
        oil_type_correct: table.oil_type_correct ?? '',
        oil_type_remarks: table.oil_type_remarks ?? '',

        oil_level: table.oil_level ?? '',
        oil_level_remarks: table.oil_level_remarks ?? '',

        lub_water_content: table.lub_water_content ?? '',
        lub_water_content_remarks: table.lub_water_content_remarks ?? '',
        lub_viscosity: table.lub_viscosity ?? '',
        lub_viscosity_remarks: table.lub_viscosity_remarks ?? '',
        lub_base_number: table.lub_base_number ?? '',
        lub_base_number_remarks: table.lub_base_number_remarks ?? '',
        lub_acid_number: table.lub_acid_number ?? '',
        lub_acid_number_remarks: table.lub_acid_number_remarks ?? '',
        lub_metal_traces: table.lub_metal_traces ?? '',
        lub_metal_traces_remarks: table.lub_metal_traces_remarks ?? '',

        last_oil_change_date: table.last_oil_change_date ?? '',
        oil_change_status:
          table.oil_change_status ?? payload.oil_change_status ?? '',

        starting_current_design: table.starting_current_design ?? null,
        starting_current_measured: table.starting_current_measured ?? '',
        starting_current_sat: table.starting_current_sat ?? '',

        running_current_design: table.running_current_design ?? null,
        running_current_measured: table.running_current_measured ?? '',
        running_current_sat: table.running_current_sat ?? '',

        log_book_exist: table.log_book_exist ?? '',
        log_book_remarks: table.log_book_remarks ?? '',

        measurement_periodicity: table.measurement_periodicity ?? '',
        measurement_periodicity_remarks:
          table.measurement_periodicity_remarks ?? '',
        other_observations_parameter: table.other_observations_parameter ?? '',

        spm_check: table.spm_check ?? '',
        spm_check_remarks: table.spm_check_remarks ?? '',

        other_observations: table.other_observations ?? '',
        overall_remarks: table.overall_remarks ?? '',
      },
      { emitEvent: false },
    );

    // ---- Conditional visibility flags + disabled state restore ----

    // Row 3: Ferrodo Lining
    if (table.ferrodo_lining_obs === 'nil') {
      this.flag = 'false';
      trialsTable.get('ferrodo_lining_remarks')?.disable({ emitEvent: false });
    } else if (table.ferrodo_lining_obs === 'obs') {
      this.flag = 'true';
      trialsTable.get('ferrodo_lining_remarks')?.disable({ emitEvent: false });
    }

    // Row 4: Gear Box
    if (table.gear_box_obs === 'nil' || table.gear_box_obs === 'noise') {
      trialsTable.get('gear_box_remarks')?.disable({ emitEvent: false });
    }

    // Row 5: Motor Insulation
    if (
      table.motor_insulation_value !== undefined &&
      table.motor_insulation_value !== null &&
      table.motor_insulation_value !== ''
    ) {
      trialsTable
        .get('motor_insulation_remarks')
        ?.disable({ emitEvent: false });
    }

    // Row 6: Deck Plating
    if (table.deck_plating_obs === 'NoObservation') {
      trialsTable.get('deck_plating_remarks')?.disable({ emitEvent: false });
      this.showDeckPlatingObsFields = false;
    } else if (table.deck_plating_obs === 'Observation') {
      trialsTable.get('deck_plating_remarks')?.disable({ emitEvent: false });
      this.showDeckPlatingObsFields = true;
      this.enableDeckPlatingFields();
      // enableDeckPlatingFields() ne inhe enable kiya, ab dobara set karna padega
      // kyunki patchValue upar disabled controls pe silently ignore ho sakta hai
      trialsTable.patchValue(
        {
          deck_plating_corrosion: table.deck_plating_corrosion ?? '',
          deck_plating_pitting: table.deck_plating_pitting ?? '',
          deck_plating_unpainted: table.deck_plating_unpainted ?? '',
          deck_plating_others: table.deck_plating_others ?? '',
        },
        { emitEvent: false },
      );
    }

    // Row 7: Speed remarks — hamesha disabled hote hain buildForm() mein
    trialsTable.get('low_speed_remark')?.disable({ emitEvent: false });
    trialsTable.get('rated_speed_remark')?.disable({ emitEvent: false });
    trialsTable.get('max_speed_remark')?.disable({ emitEvent: false });
    trialsTable
      .get('operational_trials_remarks')
      ?.disable({ emitEvent: false });
    if (table.operational_trials_remarks === 'UNSAT') {
      this.showOperationalTrialDialog = true;
    }

    // Row 8: Grease Points
    if (table.grease_points_obs === 'charged' || table.grease_points_obs) {
      trialsTable.get('grease_points_remarks')?.disable({ emitEvent: false });
    }

    // Row 9: Oil Type
    if (table.oil_type_correct) {
      trialsTable.get('oil_type_remarks')?.disable({ emitEvent: false });
    }

    // Row 10: Oil Level
    if (table.oil_level) {
      trialsTable.get('oil_level_remarks')?.disable({ emitEvent: false });
    }

    // Row 12: Change of Oil — hamesha disabled
    trialsTable.get('oil_change_status')?.disable({ emitEvent: false });

    // Row 15: Log Book
    if (table.log_book_exist) {
      trialsTable.get('log_book_remarks')?.disable({ emitEvent: false });
    }

    // Row 16: Periodicity
    if (table.measurement_periodicity) {
      trialsTable
        .get('measurement_periodicity_remarks')
        ?.disable({ emitEvent: false });
    }

    // Row 17: SPM Check
    if (table.spm_check) {
      trialsTable.get('spm_check_remarks')?.disable({ emitEvent: false });
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
}
