import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ToastComponent } from '../../../../ui/toast/toast.component';
import { SelectComponent } from '../../../../ui/select.component';
import { MultiSelectDropdownComponent } from '../../../../ui/multiselect';
import { Apiendpoints } from '../../../../ApiEndPoints';
import { CalenderComponent } from '../../../../ui/calender.component';
import { ParameterCardComponent } from '../../../../ui/parameter-card/parameter-card.component';
import { MonthYearCalendarComponent } from '../../../../ui/month-year-calendar.component';
import { InputComponent } from '../../../../ui/input.component';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import {
  UploadedFileItem,
  FileUploadComponent,
} from '../../../../ui/file-upload/file-upload.component';
import { DynamicTextarea } from '../../../../ui/dynamic-textarea/dynamic-textarea';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-ship-ohmi',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    SelectComponent,
    MultiSelectDropdownComponent,
    CalenderComponent,
    ParameterCardComponent,
    MonthYearCalendarComponent,
    ApprovalWorkFlow,
    InputComponent,
    FileUploadComponent,
    DynamicTextarea,
    ParameterCardComponent,
  ],
  standalone: true,
  templateUrl: './ship-ohmi.html',
  styleUrl: './ship-ohmi.css',
})
export class ShipOhmi {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;
  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';
  // uploadedAuthorityFiles: UploadedFileItem[] = [];

  // readonly draftIcon = 'save';
  // readonly saveIcon = 'save-all';
  readonly restartIcon = 'rotate-ccw';
  readonly plusIcon = 'plus';
  readonly minusIcon = 'minus';

  form!: FormGroup;
  loading = false;
  showOtherDefectInput = false;
  showSatDate = false;
  showSatInput = false;
  showOtherOccasion = false;
  showLastRenewed = false;
  showOtherDef = false;
  showDeffects = false;
  showDetailsdefects = false;
  showDetailsdef = false;
  ShowanyDfetcs = false;
  ShowSanitaryDfetcs = false;
  ShowBoatDefetcs = false;
  showAuth = false;
  showImplementationDetails = false;
  showImpDetails = false;
  showImplementation = false;
  showImplemDetails = false;
  showImplementedDetails = false;
  showStpDetails = false;
  showUtiDetails = false;

  commandOptions: any[] = [];
  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  locationOptions: any[] = [];
  capstanTypeOptions: any[] = [];
  makeOptions: any[] = [];
  compartmentOptions: any[] = [];

  deckPlatingObsOptions = [
    { label: 'Observed', value: 'observed' },
    { label: 'Not Observed', value: 'notobserved' },
  ];
  applicableOptions = [
    { label: 'Applicable', value: 'applicable' },
    { label: 'Not Applicable', value: 'notapplicable' },
  ];
  appOptions = [
    { label: 'NA', value: 'na' },
    { label: 'Applicable', value: 'applicable' },
  ];

  naApplicableOptions = [
    { label: 'NA', value: 'na' },
    { label: 'Applicable', value: 'applicable' },
  ];

  opsNonOpsOptions = [
    { label: 'Ops', value: 'ops' },
    { label: 'Non Ops', value: 'non_ops' },
  ];

  yesNoCertOptions = [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ];

  // Conditional flags for Appendix A
  showHangarDoorNormalOps = false;
  showHangarDoorEmergencyOps = false;
  showTraversingNormalOps = false;
  showTraversingEmergencyOps = false;
  showTraversingLoadTestPortYes = false;
  showTraversingLoadTestStbdYes = false;
  showHarpoonFitted = false;

  showHangerDoor = false;
  showEmer = false;
  showFitted = false;
  showApp = false;

  paintSchemeOptions = [
    { label: 'M/s Akzonobel', value: 'akzonobel' },
    { label: 'M/s Jotun', value: 'jotun' },
    { label: 'M/s Sigma/PPG', value: 'sigma' },
  ];
  satunsatOptions = [
    { label: 'SAT', value: 'sat' },
    { label: 'SAT with observation', value: 'sat_with_observation' },
    { label: 'UNSAT', value: 'unsat' },
  ];
  yesNoOptions = [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ];
  presentSystemOptions = [
    { label: 'Implemented - Light weight deck covering', value: 'implemented' },
    {
      label: 'Not Implemented - Light weight deck covering',
      value: 'not_implemented',
    },
  ];

  heldNotHeldOptions = [
    { label: 'Held and Updated', value: 'held' },
    { label: 'Held Not Updated', value: 'not_updated' },
    { label: 'Not Held', value: 'not_held' },
  ];

  heldOptions = [
    { label: 'Held', value: 'held' },
    { label: 'Not Held', value: 'not_held' },
  ];

  comspletedOptions = [
    { label: 'All Completed', value: 'allcompleted' },
    {
      label: 'Being undertaken on progressive basis',
      value: 'being_undertaken',
    },
  ];
  frequencyOptions = [
    { label: 'Half Yearly', value: 'half_yearly' },
    { label: 'Annually', value: 'annually' },
    { label: 'Pre-refit', value: 'pre-refit' },
    { label: 'Post-refit', value: 'post-refit' },
    { label: 'Any other occasion', value: 'any-other' },
  ];

  opsOptions = [
    { label: 'Ops', value: 'ops' },
    { label: 'Non Ops', value: 'non-ops' },
  ];

  nilYesOptions = [
    { label: 'Nil', value: 'nil' },
    { label: 'Yes', value: 'yes' },
  ];

  implemnetedOptions = [
    { label: 'Implemented', value: 'implemented' },
    { label: 'Partially Implemented', value: 'partially-implemented' },
    { label: 'Not Implemented', value: 'not-implemented' },
  ];

  fittedOptions = [
    { label: 'NA', value: 'na' },
    { label: 'Fitted', value: 'fitted' },
    { label: 'Not Fitted', value: 'not-fitted' },
  ];

  showDeckPlatingObsFields = false;

  uploadedAuthorityFiles: UploadedFileItem[] = [];

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

  /** Saare dynamic-textarea "+" FormArrays — generic loop se skip karke alag handle honge */
  private readonly dynamicArrayFields = [
    'app_vi_deck_head',
    'app_vi_hangar_top',
    'app_vi_bulkheads',
    'app_vi_deck_dadoes',
    'app_hd_defects',
    'app_ht_defects',
    'app_lp_visual',
    'app_pres_present_condition',
    'app_final_other_obs',
    'extra_modes1',
    'extra_modes2',
    'extra_modes3',
    'extra_modes4',
    'extra_modes5',
    'extra_modes6',
    'extra_modes7',
    'extra_modes8',
    'extra_modes9',
    'extra_modes10',
  ];

  /** File-upload fields jinke liye special object-shape conversion chahiye */
  private readonly fileUploadFields = [
    'app_ht_load_test_port_certificate',
    'app_ht_load_test_stbd_certificate',
    'harpoon_doc',
    'app_hg_certificate',
    'app_lp_certificate',
    'app_hsn_certificate',
    'app_ht_load_test_port_certificate',
    'app_ht_load_test_stbd_certificate',
    'harpoon_doc',
    'app_hg_certificate',
    'app_lp_certificate',
    'app_hsn_certificate',
    'crane_p_certificate',
    'crane_s_certificate',
    'ladder_p_certificate',
    'ladder_s_certificate',
    'ras_winch_p_certificate',
    'ras_winch_s_certificate',
    'cargo_winch_certificate',
    'ships_brows_certificate',
    'towing_hook_certificate',
  ];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private toastService: ToastService,
    public formApiService: FormApiService,
    private route: ActivatedRoute,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.setupConditionalLogic();
    this.loadCompartments();
    this.loadTrialPrefillFromQuery();
    this.loadLocation();

    if (this.rowId) {
      this.editMode = true;
      this.getEditDataByRowId(this.rowId);
    }
  }

  loadCompartments() {
    this.apiService
      .getDropdownData(`${Apiendpoints.MASTER_COMPARTMENT}`, {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((res) => {
        this.compartmentOptions = res || [];
      });
  }

  loadLocation() {
    this.apiService
      .getDropdownData('master/locations/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((res) => {
        this.locationOptions = res || [];
      });
  }
  flag: any;
  setupConditionalLogic() {
    // Row 3: Ferrodo Lining (Wear and tear)
    this.form
      .get('trials_table.ferrodo_lining_obs')
      ?.valueChanges.subscribe((val) => {
        const remark = this.form.get('trials_table.ferrodo_lining_remarks');
        if (val === 'nil') {
          remark?.setValue('SAT');
          this.flag = 'false';
        } else if (val === 'obs') {
          remark?.setValue('UNSAT');
          this.flag = 'true';
        } else {
          remark?.setValue('');
        }
      });

    // Row 4: Gear Box
    this.form
      .get('trials_table.gear_box_obs')
      ?.valueChanges.subscribe((val) => {
        const remark = this.form.get('trials_table.gear_box_remarks');
        if (val === 'nil') {
          remark?.setValue('SAT');
        } else if (val === 'noise') {
          remark?.setValue('UNSAT');
        } else {
          remark?.setValue('');
        }
      });

    // Row 6: Deck Plating
    this.form
      .get('trials_table.deck_plating_obs')
      ?.valueChanges.subscribe((val) => {
        const remark = this.form.get('trials_table.deck_plating_remarks');
        if (val === 'NoObservation') {
          remark?.setValue('SAT');
          this.showDeckPlatingObsFields = false;
          this.resetDeckPlatingFields();
        } else if (val === 'Observation') {
          remark?.setValue('UNSAT');
          this.showDeckPlatingObsFields = true;
          this.enableDeckPlatingFields();
        } else {
          remark?.setValue('');
          this.showDeckPlatingObsFields = false;
        }
      });

    // Row 8: Grease Points
    this.form
      .get('trials_table.grease_points_obs')
      ?.valueChanges.subscribe((val) => {
        const remark = this.form.get('trials_table.grease_points_remarks');
        if (val === 'charged') {
          remark?.setValue('SAT');
        } else if (val) {
          remark?.setValue('UNSAT');
        } else {
          remark?.setValue('');
        }
      });

    // Row 5: Capstan Motor — auto-fill on numeric input change
    this.form
      .get('trials_table.motor_insulation_value')
      ?.valueChanges.subscribe((val) => {
        const remarks = this.form.get('trials_table.motor_insulation_remarks');
        const num = +val;
        if (!val && val !== 0) {
          remarks?.setValue('', { emitEvent: false });
          return;
        }
        remarks?.setValue(num >= 10 ? 'SAT' : 'UNSAT', { emitEvent: false });
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
    });

    // Row 15: Log Book
    this.form
      .get('trials_table.log_book_exist')
      ?.valueChanges.subscribe((val) => {
        const remarks = this.form.get('trials_table.log_book_remarks');
        if (!val) {
          remarks?.setValue('', { emitEvent: false });
          return;
        }
        remarks?.setValue(val === 'yes' ? 'SAT' : 'UNSAT', {
          emitEvent: false,
        });
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
          return;
        }
        remarks?.setValue(
          val === 'monthly' || val === 'quarterly' ? 'SAT' : 'UNSAT',
          { emitEvent: false },
        );
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
    });

    // Row 1.6: Helo Hangar Structural Inspection
    this.form.get('deck_plating_obs_3')?.valueChanges.subscribe((val) => {
      const rem1 = this.form.get('rem1');

      if (val === 'notapplicable') {
        rem1?.setValue('NA', { emitEvent: false });
      } else if (val === 'applicable') {
        rem1?.setValue('SAT', { emitEvent: false });
      } else {
        rem1?.setValue('', { emitEvent: false });
      }
    });

    // Row 1.6: Helo Hangar Structural Inspection
    this.form.get('deck_plating_obs_4')?.valueChanges.subscribe((val) => {
      const deck_plating_obs_4_remark = this.form.get(
        'deck_plating_obs_4_remark',
      );

      if (val === 'notapplicable') {
        deck_plating_obs_4_remark?.setValue('NA', { emitEvent: false });
      } else if (val === 'applicable') {
        deck_plating_obs_4_remark?.setValue('SAT', { emitEvent: false });
      } else {
        deck_plating_obs_4_remark?.setValue('', { emitEvent: false });
      }
    });

    // Row 2.5.3: Any other defect
    this.form.get('deck_plating_obs_16')?.valueChanges.subscribe((val) => {
      this.showOtherDefectInput = val === 'yes';

      if (!this.showOtherDefectInput) {
        this.form.get('other_defect')?.reset();
      }
    });

    // Row: SAT / UNSAT date condition
    this.form.get('deck_plating_obs_46')?.valueChanges.subscribe((val) => {
      this.showSatDate = val === 'unsat';
      this.showSatInput = val === 'sat';

      // Clear fields when switching
      if (val !== 'unsat') {
        this.form.get('sat_date')?.reset();
      }

      if (val !== 'sat') {
        this.form.get('sat_input')?.reset();
      }
    });

    // Row 4.2.2: Frequency
    this.form.get('deck_plating_obs_47')?.valueChanges.subscribe((val) => {
      this.showOtherOccasion = val === 'any-other';

      if (!this.showOtherOccasion) {
        this.form.get('other_occasion')?.reset();
      }
    });

    // Row 4.2.5
    this.form.get('deck_plating_obs_50')?.valueChanges.subscribe((val) => {
      this.showLastRenewed = val === 'yes';

      if (!this.showLastRenewed) {
        this.form.get('last_renewed')?.reset();
      }
    });

    // Row 4.2.6
    this.form.get('deck_plating_obs_51')?.valueChanges.subscribe((val) => {
      this.showOtherDef = val === 'yes';

      if (!this.showOtherDef) {
        this.form.get('other_def')?.reset();
      }
    });

    // Row 4.4.2
    this.form.get('deck_plating_obs_58')?.valueChanges.subscribe((val) => {
      this.showDeffects = val === 'yes';

      if (!this.showDeffects) {
        this.form.get('defects')?.reset();
      }
    });

    // Row 6.2
    this.form.get('deck_plating_obs_70')?.valueChanges.subscribe((val) => {
      this.showDetailsdefects = val === 'yes';

      if (!this.showDetailsdefects) {
        this.form.get('details_defects')?.reset();
      }
    });

    // Row 6.3.2
    this.form.get('deck_plating_obs_75')?.valueChanges.subscribe((val) => {
      this.showDetailsdef = val === 'yes';

      if (!this.showDetailsdef) {
        this.form.get('defects_details')?.reset();
      }
    });

    // Row 6.5.3
    this.form.get('deck_plating_obs_78')?.valueChanges.subscribe((val) => {
      this.ShowanyDfetcs = val === 'yes';

      if (!this.ShowanyDfetcs) {
        this.form.get('any_defects')?.reset();
      }
    });

    // Row 6.6.1
    this.form.get('deck_plating_obs_79')?.valueChanges.subscribe((val) => {
      this.ShowSanitaryDfetcs = val === 'yes';

      if (!this.ShowSanitaryDfetcs) {
        this.form.get('sanitary_defects')?.reset();
      }
    });

    // Row 8.1.5
    this.form.get('deck_plating_obs_92')?.valueChanges.subscribe((val) => {
      this.ShowBoatDefetcs = val === 'yes';

      if (!this.ShowBoatDefetcs) {
        this.form.get('boat_defects')?.reset();
      }
    });

    // Row 10.1
    this.form.get('deck_plating_obs_101')?.valueChanges.subscribe((val) => {
      this.showAuth = val === 'yes';

      if (!this.showAuth) {
        this.form.get('auth_date')?.reset();
      }
    });

    // Row 11.1: Light weight deck Covering
    this.form.get('deck_plating_obs_102')?.valueChanges.subscribe((val) => {
      this.showImplementationDetails =
        val === 'partially-implemented' || val === 'not-implemented';

      if (!this.showImplementationDetails) {
        this.form.get('implementation_details')?.reset();
      }
    });

    // Row 11.2
    this.form.get('deck_plating_obs_103')?.valueChanges.subscribe((val) => {
      this.showImpDetails =
        val === 'partially-implemented' || val === 'not-implemented';

      if (!this.showImpDetails) {
        this.form.get('imp_details')?.reset();
      }
    });

    // Row 11.3
    this.form.get('deck_plating_obs_104')?.valueChanges.subscribe((val) => {
      this.showImplementation =
        val === 'partially-implemented' || val === 'not-implemented';

      if (!this.showImplementation) {
        this.form.get('implementation')?.reset();
      }
    });

    // Row 11.4
    this.form.get('deck_plating_obs_105')?.valueChanges.subscribe((val) => {
      this.showImplemDetails =
        val === 'partially-implemented' || val === 'not-implemented';

      if (!this.showImplemDetails) {
        this.form.get('implem_details')?.reset();
      }
    });

    // Row 11.5
    this.form.get('deck_plating_obs_106')?.valueChanges.subscribe((val) => {
      this.showImplementedDetails =
        val === 'partially-implemented' || val === 'not-implemented';

      if (!this.showImplementedDetails) {
        this.form.get('implemented_details')?.reset();
      }
    });

    // Row 11.6
    this.form.get('deck_plating_obs_107')?.valueChanges.subscribe((val) => {
      this.showStpDetails =
        val === 'partially-implemented' || val === 'not-implemented';

      if (!this.showStpDetails) {
        this.form.get('stp_details')?.reset();
      }
    });

    // Row 11.7
    this.form.get('deck_plating_obs_108')?.valueChanges.subscribe((val) => {
      this.showUtiDetails =
        val === 'partially-implemented' || val === 'not-implemented';

      if (!this.showUtiDetails) {
        this.form.get('stp_details')?.reset();
      }
    });

    // Appendix A – Hangar Door Normal Mode
    this.form.get('app_hd_normal_mode')?.valueChanges.subscribe((val) => {
      this.showHangarDoorNormalOps = val === 'applicable';
      if (!this.showHangarDoorNormalOps) {
        this.form.get('app_hd_normal_ops')?.reset();
      }
    });

    this.form.get('deck_plating_obs_113')?.valueChanges.subscribe((val) => {
      this.showHangerDoor = val === 'applicable';
      if (!this.showHangerDoor) {
        this.form.get('app_hd_normal')?.reset();
      }
    });

    // Appendix A – Hangar Door Emergency Mode
    this.form.get('app_hd_emergency_mode')?.valueChanges.subscribe((val) => {
      this.showHangarDoorEmergencyOps = val === 'applicable';
      if (!this.showHangarDoorEmergencyOps) {
        this.form.get('app_hd_emergency_ops')?.reset();
      }
    });

    // Appendix A – Helo Traversing Normal Mode
    this.form.get('app_ht_normal_mode')?.valueChanges.subscribe((val) => {
      this.showTraversingNormalOps = val === 'applicable';
      if (!this.showTraversingNormalOps) {
        this.form.get('app_ht_normal_ops')?.reset();
      }
    });

    // Appendix A – Helo Traversing Emergency Mode
    this.form.get('app_ht_emergency_mode')?.valueChanges.subscribe((val) => {
      this.showTraversingEmergencyOps = val === 'applicable';
      if (!this.showTraversingEmergencyOps) {
        this.form.get('app_ht_emergency_ops')?.reset();
      }
    });

    // Appendix A – Load Test Port (Yes → show date)
    this.form.get('app_ht_load_test_port')?.valueChanges.subscribe((val) => {
      this.showTraversingLoadTestPortYes = val === 'yes';
      if (!this.showTraversingLoadTestPortYes) {
        this.form.get('app_ht_load_test_port_date')?.reset();
      }
    });

    // Appendix A – Load Test Stbd (Yes → show date)
    this.form.get('app_ht_load_test_stbd')?.valueChanges.subscribe((val) => {
      this.showTraversingLoadTestStbdYes = val === 'yes';
      if (!this.showTraversingLoadTestStbdYes) {
        this.form.get('app_ht_load_test_stbd_date')?.reset();
      }
    });

    // Appendix A – Harpoon Grid (Fitted → show dates)
    this.form.get('app_hg_status')?.valueChanges.subscribe((val) => {
      this.showHarpoonFitted = val === 'fitted';
      if (!this.showHarpoonFitted) {
        this.form.get('app_hg_load_test_date')?.reset();
        this.form.get('app_hg_certificate')?.reset();
      }
    });

    // Appendix A – Drainage Hangar (Applicable → show ops)
    this.form.get('app_drain_hangar')?.valueChanges.subscribe((val) => {
      if (val !== 'applicable') {
        this.form.get('app_drain_hangar_ops')?.reset();
      }
    });

    this.form.get('deck_plating_obs_114')?.valueChanges.subscribe((val) => {
      this.showEmer = val === 'applicable';
      if (!this.showEmer) {
        this.form.get('emer_mode')?.reset();
      }
    });

    this.form.get('app_ht_load_test_port')?.valueChanges.subscribe((val) => {
      this.showTraversingLoadTestPortYes = val === 'yes';

      if (!this.showTraversingLoadTestPortYes) {
        this.form.get('app_ht_load_test_port_date')?.reset();
        this.form.get('app_ht_load_test_port_certificate')?.reset();
      }
    });

    this.form.get('app_ht_load_test_stbd')?.valueChanges.subscribe((val) => {
      this.showTraversingLoadTestStbdYes = val === 'yes';

      if (!this.showTraversingLoadTestStbdYes) {
        this.form.get('app_ht_load_test_stbd_date')?.reset();
        this.form.get('app_ht_load_test_stbd_certificate')?.reset();
      }
    });

    this.form.get('deck_plating_obs_117')?.valueChanges.subscribe((val) => {
      this.showFitted = val === 'fitted';

      if (!this.showFitted) {
        this.form.get('harpoon_date')?.reset();
        this.form.get('harpoon_doc')?.reset();
      }
    });
  }

  buildForm() {
    this.form = this.fb.group({
      ship: [''],
      fax_document_no: [''],
      date_of_conduct_trail_from: [''],
      date_of_conduct_trail_to: [''],
      place_of_conduct_trail: [''],
      fax_date: [''],
      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],
      deck_plating_obs_4: [''],
      deck_plating_corrosion_4: [''],
      deck_plating_pitting_4: [''],
      deck_plating_unpainted_4: [''],
      deck_plating_others_4: [''],
      deck_plating_obs_5: [''],
      deck_plating_corrosion_5: [''],
      deck_plating_pitting_5: [''],
      deck_plating_unpainted_5: [''],
      deck_plating_others_5: [''],
      last_oil_change_date_3: [''],
      deck_plating_obs_6: [''],
      last_renewed: [''],
      // extra_modes1:[''],
      defects: [''],
      deck_plating_obs_24_cross_curves: [''],
      deck_plating_obs_24_stability_book: [''],
      deck_plating_obs_24_weight_mgmt: [''],
      deck_plating_obs_24_inclining: [''],
      hydrostatic_curves: [''],
      deck_plating_corrosion_6: [''],
      deck_plating_pitting_6: [''],
      deck_plating_unpainted_6: [''],
      deck_plating_others_6: [''],
      deck_plating_obs_7: [''],
      deck_plating_corrosion_7: [''],
      deck_plating_pitting_7: [''],
      sat_input: [''],
      sat_date: [''],
      deck_plating_unpainted_7: [''],
      deck_plating_others_7: [''],
      deck_plating_obs_8: [''],
      deck_plating_corrosion_8: [''],
      deck_plating_pitting_8: [''],
      deck_plating_unpainted_8: [''],
      deck_plating_others_8: [''],
      deck_plating_obs_9: [''],
      deck_plating_corrosion_9: [''],
      deck_plating_pitting_9: [''],
      deck_plating_unpainted_9: [''],
      deck_plating_others_9: [''],
      last_oil_change_date_4: [''],
      deck_plating_obs_10: [''],
      deck_plating_corrosion_10: [''],
      deck_plating_pitting_10: [''],
      deck_plating_unpainted_10: [''],
      deck_plating_others_10: [''],
      deck_plating_obs_11: [''],
      deck_plating_corrosion_11: [''],
      deck_plating_pitting_11: [''],
      deck_plating_unpainted_11: [''],
      deck_plating_others_11: [''],
      deck_plating_obs_12: [[]],
      deck_plating_corrosion_12: [''],
      deck_plating_pitting_12: [''],
      deck_plating_unpainted_12: [''],
      deck_plating_others_12: [''],
      deck_plating_obs_13: [''],
      deck_plating_corrosion_13: [''],
      deck_plating_pitting_13: [''],
      deck_plating_unpainted_13: [''],
      deck_plating_others_13: [''],
      deck_plating_obs_14: [''],
      deck_plating_corrosion_14: [''],
      deck_plating_pitting_14: [''],
      deck_plating_unpainted_14: [''],
      deck_plating_others_14: [''],
      deck_plating_obs_15: [''],
      deck_plating_corrosion_15: [''],
      deck_plating_pitting_15: [''],
      deck_plating_unpainted_15: [''],
      deck_plating_others_15: [''],
      deck_plating_obs_16: [''],
      deck_plating_corrosion_16: [''],
      deck_plating_pitting_16: [''],
      deck_plating_unpainted_16: [''],
      deck_plating_others_16: [''],
      deck_plating_obs_17: [''],
      deck_plating_corrosion_17: [''],
      deck_plating_pitting_17: [''],
      deck_plating_unpainted_17: [''],
      deck_plating_others_17: [''],
      deck_plating_obs_18: [''],
      deck_plating_corrosion_18: [''],
      deck_plating_pitting_18: [''],
      deck_plating_unpainted_18: [''],
      deck_plating_others_18: [''],
      deck_plating_obs_19: [''],
      deck_plating_corrosion_19: [''],
      deck_plating_pitting_19: [''],
      deck_plating_unpainted_19: [''],
      deck_plating_others_19: [''],
      deck_plating_obs_20: [''],
      deck_plating_corrosion_20: [''],
      deck_plating_pitting_20: [''],
      deck_plating_unpainted_20: [''],
      deck_plating_others_20: [''],
      deck_plating_obs_21: [''],
      deck_plating_corrosion_21: [''],
      deck_plating_pitting_21: [''],
      deck_plating_unpainted_21: [''],
      deck_plating_others_21: [''],
      deck_plating_obs_22: [''],
      deck_plating_corrosion_22: [''],
      deck_plating_pitting_22: [''],
      deck_plating_unpainted_22: [''],
      deck_plating_others_22: [''],
      deck_plating_obs_23: [''],
      deck_plating_corrosion_23: [''],
      deck_plating_pitting_23: [''],
      deck_plating_unpainted_23: [''],
      deck_plating_others_23: [''],
      deck_plating_obs_24: [''],
      deck_plating_corrosion_24: [''],
      deck_plating_pitting_24: [''],
      deck_plating_unpainted_24: [''],
      deck_plating_others_24: [''],
      deck_plating_obs_25: [''],
      deck_plating_corrosion_25: [''],
      deck_plating_pitting_25: [''],
      deck_plating_unpainted_25: [''],
      deck_plating_others_25: [''],
      deck_plating_obs_26: [''],
      deck_plating_corrosion_26: [''],
      deck_plating_pitting_26: [''],
      deck_plating_unpainted_26: [''],
      deck_plating_others_26: [''],
      deck_plating_obs_27: [''],
      deck_plating_corrosion_27: [''],
      deck_plating_pitting_27: [''],
      deck_plating_unpainted_27: [''],
      deck_plating_others_27: [''],
      deck_plating_obs_28: [''],
      deck_plating_corrosion_28: [''],
      deck_plating_pitting_28: [''],
      deck_plating_unpainted_28: [''],
      deck_plating_others_28: [''],
      deck_plating_obs_29: [''],
      deck_plating_corrosion_29: [''],
      deck_plating_pitting_29: [''],
      deck_plating_unpainted_29: [''],
      deck_plating_others_29: [''],
      other_defect: [''],
      other_def: [''],
      rem1: [{ value: '', disabled: true }],
      deck_plating_obs_4_remark: [{ value: '', disabled: true }],
      deck_plating_obs_30: [''],
      deck_plating_corrosion_30: [''],
      deck_plating_pitting_30: [''],
      deck_plating_unpainted_30: [''],
      deck_plating_others_30: [''],
      deck_plating_obs_31: [''],
      deck_plating_corrosion_31: [''],
      deck_plating_pitting_31: [''],
      deck_plating_unpainted_31: [''],
      deck_plating_others_31: [''],
      deck_plating_obs_32: [''],
      deck_plating_corrosion_32: [''],
      deck_plating_pitting_32: [''],
      deck_plating_unpainted_32: [''],
      deck_plating_others_32: [''],
      deck_plating_obs_33: [''],
      deck_plating_corrosion_33: [''],
      deck_plating_pitting_33: [''],
      deck_plating_unpainted_33: [''],
      deck_plating_others_33: [''],
      deck_plating_obs_34: [''],
      deck_plating_corrosion_34: [''],
      deck_plating_pitting_34: [''],
      deck_plating_unpainted_34: [''],
      deck_plating_others_34: [''],
      deck_plating_obs_35: [''],
      deck_plating_corrosion_35: [''],
      deck_plating_pitting_35: [''],
      deck_plating_unpainted_35: [''],
      deck_plating_others_35: [''],
      deck_plating_obs_36: [''],
      deck_plating_corrosion_36: [''],
      deck_plating_pitting_36: [''],
      deck_plating_unpainted_36: [''],
      deck_plating_others_36: [''],
      deck_plating_obs_37: [''],
      deck_plating_corrosion_37: [''],
      deck_plating_pitting_37: [''],
      deck_plating_unpainted_37: [''],
      deck_plating_others_37: [''],
      deck_plating_obs_38: [''],
      deck_plating_corrosion_38: [''],
      deck_plating_pitting_38: [''],
      deck_plating_unpainted_38: [''],
      deck_plating_others_38: [''],
      deck_plating_obs_39: [''],
      deck_plating_corrosion_39: [''],
      deck_plating_pitting_39: [''],
      deck_plating_unpainted_39: [''],
      deck_plating_others_39: [''],
      deck_plating_obs_40: [''],
      deck_plating_corrosion_40: [''],
      deck_plating_pitting_40: [''],
      deck_plating_unpainted_40: [''],
      deck_plating_others_40: [''],
      deck_plating_obs_41: [''],
      deck_plating_corrosion_41: [''],
      deck_plating_pitting_41: [''],
      deck_plating_unpainted_41: [''],
      deck_plating_others_41: [''],
      deck_plating_obs_42: [''],
      deck_plating_corrosion_42: [''],
      deck_plating_pitting_42: [''],
      deck_plating_unpainted_42: [''],
      deck_plating_others_42: [''],
      deck_plating_obs_43: [''],
      deck_plating_corrosion_43: [''],
      deck_plating_pitting_43: [''],
      deck_plating_unpainted_43: [''],
      deck_plating_others_43: [''],
      deck_plating_obs_44: [''],
      deck_plating_corrosion_44: [''],
      deck_plating_pitting_44: [''],
      deck_plating_unpainted_44: [''],
      deck_plating_others_44: [''],
      deck_plating_obs_45: [''],
      deck_plating_corrosion_45: [''],
      deck_plating_pitting_45: [''],
      deck_plating_unpainted_45: [''],
      deck_plating_others_45: [''],
      deck_plating_obs_46: [''],
      deck_plating_corrosion_46: [''],
      deck_plating_pitting_46: [''],
      deck_plating_unpainted_46: [''],
      deck_plating_others_46: [''],
      deck_plating_obs_47: [''],
      other_occasion: [''],
      deck_plating_corrosion_47: [''],
      deck_plating_pitting_47: [''],
      deck_plating_unpainted_47: [''],
      deck_plating_others_47: [''],
      deck_plating_obs_48: [''],
      deck_plating_corrosion_48: [''],
      deck_plating_pitting_48: [''],
      deck_plating_unpainted_48: [''],
      deck_plating_others_48: [''],
      deck_plating_obs_49: [''],
      deck_plating_corrosion_49: [''],
      deck_plating_pitting_49: [''],
      deck_plating_unpainted_49: [''],
      deck_plating_others_49: [''],
      deck_plating_obs_50: [''],
      deck_plating_corrosion_50: [''],
      deck_plating_pitting_50: [''],
      deck_plating_unpainted_50: [''],
      deck_plating_others_50: [''],
      deck_plating_obs_51: [''],
      deck_plating_corrosion_51: [''],
      deck_plating_pitting_51: [''],
      deck_plating_unpainted_51: [''],
      deck_plating_others_51: [''],
      deck_plating_obs_52: [''],
      deck_plating_corrosion_52: [''],
      deck_plating_pitting_52: [''],
      deck_plating_unpainted_52: [''],
      deck_plating_others_52: [''],
      deck_plating_obs_53: [''],
      deck_plating_corrosion_53: [''],
      deck_plating_pitting_53: [''],
      deck_plating_unpainted_53: [''],
      deck_plating_others_53: [''],
      deck_plating_obs_54: [''],
      deck_plating_corrosion_54: [''],
      deck_plating_pitting_54: [''],
      deck_plating_unpainted_54: [''],
      deck_plating_others_54: [''],
      deck_plating_obs_55: [''],
      deck_plating_corrosion_55: [''],
      deck_plating_pitting_55: [''],
      deck_plating_unpainted_55: [''],
      deck_plating_others_55: [''],
      deck_plating_obs_56: [''],
      deck_plating_corrosion_56: [''],
      deck_plating_pitting_56: [''],
      deck_plating_unpainted_56: [''],
      deck_plating_others_56: [''],
      deck_plating_obs_57: [''],
      deck_plating_corrosion_57: [''],
      deck_plating_pitting_57: [''],
      deck_plating_unpainted_57: [''],
      deck_plating_others_57: [''],
      deck_plating_obs_58: [''],
      deck_plating_corrosion_58: [''],
      deck_plating_pitting_58: [''],
      deck_plating_unpainted_58: [''],
      deck_plating_others_58: [''],
      last_oil_change_date_5: [''],
      deck_plating_obs_59: [''],
      deck_plating_corrosion_59: [''],
      deck_plating_pitting_59: [''],
      deck_plating_unpainted_59: [''],
      deck_plating_others_59: [''],
      last_oil_change_date_6: [''],
      deck_plating_obs_60: [''],
      deck_plating_corrosion_60: [''],
      deck_plating_pitting_60: [''],
      deck_plating_unpainted_60: [''],
      deck_plating_others_60: [''],
      last_oil_change_date_7: [''],
      deck_plating_obs_61: [''],
      deck_plating_corrosion_61: [''],
      deck_plating_pitting_61: [''],
      deck_plating_unpainted_61: [''],
      deck_plating_others_61: [''],
      last_oil_change_date_8: [''],
      deck_plating_obs_62: [''],
      deck_plating_corrosion_62: [''],
      deck_plating_pitting_62: [''],
      deck_plating_unpainted_62: [''],
      deck_plating_others_62: [''],
      last_oil_change_date_9: [''],
      deck_plating_obs_63: [''],
      deck_plating_corrosion_63: [''],
      deck_plating_pitting_63: [''],
      deck_plating_unpainted_63: [''],
      deck_plating_others_63: [''],
      last_oil_change_date_10: [''],
      deck_plating_obs_64: [''],
      deck_plating_corrosion_64: [''],
      deck_plating_pitting_64: [''],
      deck_plating_unpainted_64: [''],
      deck_plating_others_64: [''],
      last_oil_change_date_11: [''],
      deck_plating_obs_65: [''],
      deck_plating_corrosion_65: [''],
      deck_plating_pitting_65: [''],
      deck_plating_unpainted_65: [''],
      deck_plating_others_65: [''],
      last_oil_change_date_12: [''],
      deck_plating_obs_66: [''],
      deck_plating_corrosion_66: [''],
      deck_plating_pitting_66: [''],
      deck_plating_unpainted_66: [''],
      deck_plating_others_66: [''],
      last_oil_change_date: [''],
      deck_plating_obs_67: [''],
      deck_plating_corrosion_67: [''],
      deck_plating_pitting_67: [''],
      deck_plating_unpainted_67: [''],
      deck_plating_others_67: [''],
      deck_plating_obs_68: [''],
      deck_plating_corrosion_68: [''],
      deck_plating_pitting_68: [''],
      deck_plating_unpainted_68: [''],
      deck_plating_others_68: [''],
      deck_plating_obs_69: [''],
      deck_plating_corrosion_69: [''],
      deck_plating_pitting_69: [''],
      deck_plating_unpainted_69: [''],
      deck_plating_others_69: [''],
      deck_plating_obs_70: [''],
      details_defects: [''],
      defects_details: [''],
      deck_plating_corrosion_70: [''],
      deck_plating_pitting_70: [''],
      deck_plating_unpainted_70: [''],
      deck_plating_others_70: [''],
      deck_plating_obs_71: [''],
      deck_plating_corrosion_71: [''],
      deck_plating_pitting_71: [''],
      deck_plating_unpainted_71: [''],
      deck_plating_others_71: [''],
      deck_plating_obs_72: [''],
      deck_plating_corrosion_72: [''],
      deck_plating_pitting_72: [''],
      deck_plating_unpainted_72: [''],
      deck_plating_others_72: [''],
      deck_plating_obs_73: [''],
      deck_plating_corrosion_73: [''],
      deck_plating_pitting_73: [''],
      deck_plating_unpainted_73: [''],
      deck_plating_others_73: [''],
      deck_plating_obs_74: [''],
      deck_plating_corrosion_74: [''],
      deck_plating_pitting_74: [''],
      deck_plating_unpainted_74: [''],
      deck_plating_others_74: [''],
      deck_plating_obs_75: [''],
      deck_plating_corrosion_75: [''],
      deck_plating_pitting_75: [''],
      deck_plating_unpainted_75: [''],
      deck_plating_others_75: [''],
      deck_plating_obs_76: [''],
      deck_plating_corrosion_76: [''],
      deck_plating_pitting_76: [''],
      deck_plating_unpainted_76: [''],
      deck_plating_others_76: [''],
      deck_plating_obs_77: [''],
      deck_plating_corrosion_77: [''],
      deck_plating_pitting_77: [''],
      deck_plating_unpainted_77: [''],
      deck_plating_others_77: [''],
      date_of_conduct_of_trials_3: [''],
      deck_plating_obs_78: [''],
      any_defects: [''],
      deck_plating_corrosion_78: [''],
      deck_plating_pitting_78: [''],
      deck_plating_unpainted_78: [''],
      deck_plating_others_78: [''],
      deck_plating_obs_79: [''],
      sanitary_defects: [''],
      deck_plating_corrosion_79: [''],
      deck_plating_pitting_79: [''],
      deck_plating_unpainted_79: [''],
      deck_plating_others_79: [''],
      deck_plating_obs_80: [''],
      deck_plating_corrosion_80: [''],
      deck_plating_pitting_80: [''],
      deck_plating_unpainted_80: [''],
      deck_plating_others_80: [''],
      deck_plating_obs_81: [''],
      deck_plating_corrosion_81: [''],
      deck_plating_pitting_81: [''],
      deck_plating_unpainted_81: [''],
      deck_plating_others_81: [''],
      deck_plating_obs_82: [''],
      deck_plating_corrosion_82: [''],
      deck_plating_pitting_82: [''],
      deck_plating_unpainted_82: [''],
      deck_plating_others_82: [''],
      deck_plating_obs_83: [''],
      deck_plating_corrosion_83: [''],
      deck_plating_pitting_83: [''],
      deck_plating_unpainted_83: [''],
      deck_plating_others_83: [''],
      deck_plating_obs_84: [''],
      deck_plating_corrosion_84: [''],
      deck_plating_pitting_84: [''],
      deck_plating_unpainted_84: [''],
      deck_plating_others_84: [''],
      deck_plating_obs_85: [''],
      deck_plating_corrosion_85: [''],
      deck_plating_pitting_85: [''],
      deck_plating_unpainted_85: [''],
      deck_plating_others_85: [''],
      deck_plating_obs_86: [''],
      deck_plating_corrosion_86: [''],
      deck_plating_pitting_86: [''],
      deck_plating_unpainted_86: [''],
      deck_plating_others_86: [''],
      deck_plating_obs_87: [''],
      deck_plating_corrosion_87: [''],
      deck_plating_pitting_87: [''],
      deck_plating_unpainted_87: [''],
      deck_plating_others_87: [''],
      deck_plating_obs_88: [''],
      deck_plating_corrosion_88: [''],
      deck_plating_pitting_88: [''],
      deck_plating_unpainted_88: [''],
      deck_plating_others_88: [''],
      deck_plating_obs_89: [''],
      deck_plating_corrosion_89: [''],
      deck_plating_pitting_89: [''],
      deck_plating_unpainted_89: [''],
      deck_plating_others_89: [''],
      deck_plating_obs_90: [''],
      deck_plating_corrosion_90: [''],
      deck_plating_pitting_90: [''],
      deck_plating_unpainted_90: [''],
      deck_plating_others_90: [''],
      deck_plating_obs_91: [''],
      deck_plating_corrosion_91: [''],
      deck_plating_pitting_91: [''],
      deck_plating_unpainted_91: [''],
      deck_plating_others_91: [''],
      deck_plating_obs_92: [''],
      boat_defects: [''],
      deck_plating_corrosion_92: [''],
      deck_plating_pitting_92: [''],
      deck_plating_unpainted_92: [''],
      deck_plating_others_92: [''],
      deck_plating_obs_93: [''],
      deck_plating_corrosion_93: [''],
      deck_plating_pitting_93: [''],
      deck_plating_unpainted_93: [''],
      deck_plating_others_93: [''],
      deck_plating_obs_94: [''],
      deck_plating_corrosion_94: [''],
      deck_plating_pitting_94: [''],
      deck_plating_unpainted_94: [''],
      deck_plating_others_94: [''],
      deck_plating_obs_95: [''],
      deck_plating_corrosion_95: [''],
      deck_plating_pitting_95: [''],
      deck_plating_unpainted_95: [''],
      deck_plating_others_95: [''],
      deck_plating_obs_96: [''],
      deck_plating_corrosion_96: [''],
      deck_plating_pitting_96: [''],
      deck_plating_unpainted_96: [''],
      deck_plating_others_96: [''],
      deck_plating_obs_97: [''],
      deck_plating_corrosion_97: [''],
      deck_plating_pitting_97: [''],
      deck_plating_unpainted_97: [''],
      deck_plating_others_97: [''],
      date_of_conduct_of_trials_4: [''],
      deck_plating_obs_98: [''],
      deck_plating_corrosion_98: [''],
      deck_plating_pitting_98: [''],
      deck_plating_unpainted_98: [''],
      deck_plating_others_98: [''],
      deck_plating_obs_99: [''],
      deck_plating_corrosion_99: [''],
      deck_plating_pitting_99: [''],
      deck_plating_unpainted_99: [''],
      deck_plating_others_99: [''],
      deck_plating_obs_100: [''],
      deck_plating_corrosion_100: [''],
      deck_plating_pitting_100: [''],
      deck_plating_unpainted_100: [''],
      deck_plating_others_100: [''],
      deck_plating_obs_101: [''],
      auth_date: [''],
      authorization: [''],
      deck_plating_corrosion_101: [''],
      deck_plating_pitting_101: [''],
      deck_plating_unpainted_101: [''],
      deck_plating_others_101: [''],
      deck_plating_obs_102: [''],
      implementation_details: [''],
      deck_plating_corrosion_102: [''],
      deck_plating_pitting_102: [''],
      deck_plating_unpainted_102: [''],
      deck_plating_others_102: [''],
      deck_plating_obs_103: [''],
      imp_details: [''],
      deck_plating_corrosion_103: [''],
      deck_plating_pitting_103: [''],
      deck_plating_unpainted_103: [''],
      deck_plating_others_103: [''],
      deck_plating_obs_104: [''],
      implementation: [''],
      deck_plating_corrosion_104: [''],
      deck_plating_pitting_104: [''],
      deck_plating_unpainted_104: [''],
      deck_plating_others_104: [''],
      deck_plating_obs_105: [''],
      implem_details: [''],
      deck_plating_corrosion_105: [''],
      deck_plating_pitting_105: [''],
      deck_plating_unpainted_105: [''],
      deck_plating_others_105: [''],
      deck_plating_obs_106: [''],
      implemented_details: [''],
      deck_plating_corrosion_106: [''],
      deck_plating_pitting_106: [''],
      deck_plating_unpainted_106: [''],
      deck_plating_others_106: [''],
      deck_plating_obs_107: [''],
      stp_details: [''],
      deck_plating_corrosion_107: [''],
      deck_plating_pitting_107: [''],
      deck_plating_unpainted_107: [''],
      deck_plating_others_107: [''],
      deck_plating_obs_108: [''],
      uti_details: [''],
      deck_plating_corrosion_108: [''],
      deck_plating_pitting_108: [''],
      deck_plating_unpainted_108: [''],
      deck_plating_others_108: [''],
      extra_obs1_2: [''],
      extra_obs1_3: [''],
      deck_plating_obs_109: [''],
      deck_plating_corrosion_109: [''],
      deck_plating_pitting_109: [''],
      deck_plating_unpainted_109: [''],
      deck_plating_others_109: [''],
      deck_plating_obs_110: [''],
      deck_plating_corrosion_110: [''],
      deck_plating_pitting_110: [''],
      deck_plating_unpainted_110: [''],
      deck_plating_others_110: [''],
      deck_plating_obs_111: [''],
      deck_plating_corrosion_111: [''],
      deck_plating_pitting_111: [''],
      deck_plating_unpainted_111: [''],
      deck_plating_others_111: [''],
      deck_plating_obs_112: [''],
      deck_plating_corrosion_112: [''],
      deck_plating_pitting_112: [''],
      deck_plating_unpainted_112: [''],
      deck_plating_others_112: [''],
      extra_obs1_4: [''],
      extra_obs1: [''],
      deck_plating_obs_113: [''],
      deck_plating_corrosion_113: [''],
      deck_plating_pitting_113: [''],
      deck_plating_unpainted_113: [''],
      deck_plating_others_113: [''],
      deck_plating_obs_114: [''],
      deck_plating_corrosion_114: [''],
      deck_plating_pitting_114: [''],
      deck_plating_unpainted_114: [''],
      deck_plating_others_114: [''],
      deck_plating_obs_115: [''],
      deck_plating_corrosion_115: [''],
      deck_plating_pitting_115: [''],
      deck_plating_unpainted_115: [''],
      deck_plating_others_115: [''],
      deck_plating_obs_116: [''],
      deck_plating_corrosion_116: [''],
      deck_plating_pitting_116: [''],
      deck_plating_unpainted_116: [''],
      deck_plating_others_116: [''],
      date_of_conduct_of_trials_5: [''],
      deck_plating_obs_117: [''],
      deck_plating_corrosion_117: [''],
      deck_plating_pitting_117: [''],
      deck_plating_unpainted_117: [''],
      deck_plating_others_117: [''],
      deck_plating_obs_118: [''],
      deck_plating_corrosion_118: [''],
      deck_plating_pitting_118: [''],
      deck_plating_unpainted_118: [''],
      deck_plating_others_118: [''],
      date_of_conduct_of_trials_6: [''],
      date_of_conduct_of_trials: [''],
      deck_plating_obs_119: [''],
      deck_plating_corrosion_119: [''],
      deck_plating_pitting_119: [''],
      deck_plating_unpainted_119: [''],
      deck_plating_others_119: [''],
      deck_plating_obs_120: [''],
      deck_plating_corrosion_120: [''],
      deck_plating_pitting_120: [''],
      deck_plating_unpainted_120: [''],
      deck_plating_others_120: [''],
      deck_plating_obs_121: [''],
      deck_plating_obs_1210: [''],
      deck_plating_corrosion_121: [''],
      deck_plating_pitting_121: [''],
      deck_plating_unpainted_121: [''],
      deck_plating_others_121: [''],
      deck_plating_obs: [''],
      deck_plating_corrosion: [''],
      deck_plating_pitting: [''],
      deck_plating_unpainted: [''],
      deck_plating_others: [''],
      last_oil_change_date_1: [''],
      refit_details: [''],
      opdefs_since_last_inspection: [''],
      hull_opdefs_details: [''],
      hull_concessions_details: [''],

      last_oil_change_date_2: [''],
      deck_plating_obs_2: [''],
      deck_plating_corrosion_2: [''],
      deck_plating_pitting_2: [''],
      deck_plating_unpainted_2: [''],
      deck_plating_others_2: [''],
      deck_plating_obs_3: [''],
      deck_plating_corrosion_3: [''],
      deck_plating_pitting_3: [''],
      deck_plating_unpainted_3: [''],
      deck_plating_others_3: [''],

      // ---------- Appendix A – CHECKS FOR STRUCTURAL SOUNDNESS OF HELO HANGAR ----------
      // Ser 1 – Visual Inspection (dynamic input rows)
      app_vi_deck_head: this.fb.array([this.fb.control('')]),
      app_vi_hangar_top: this.fb.array([this.fb.control('')]),
      app_vi_bulkheads: this.fb.array([this.fb.control('')]),
      app_vi_deck_dadoes: this.fb.array([this.fb.control('')]),

      // Ser 2 – Hangar Door
      app_hd_make: [''],
      app_hd_model: [''],
      app_hd_normal_mode: [''],
      app_hd_normal_ops: [''],
      app_hd_emergency_mode: [''],
      app_hd_emergency_ops: [''],
      app_hd_defects: this.fb.array([this.fb.control('')]),
      app_hd_remarks: [''],

      app_hd_normal: [''],
      emer_mode: [''],

      // Ser 3 – Helo Traversing System
      app_ht_make: [''],
      app_ht_model: [''],
      app_ht_normal_mode: [''],
      app_ht_normal_ops: [''],
      app_ht_emergency_mode: [''],
      app_ht_emergency_ops: [''],
      app_ht_load_test_port: [''],
      app_ht_load_test_port_date: [''],
      app_ht_load_test_stbd: [''],
      app_ht_load_test_stbd_date: [''],
      app_ht_defects: this.fb.array([this.fb.control('')]),
      app_ht_remarks: [''],

      // Ser 4 – Lashing Points
      app_lp_visual: this.fb.array([this.fb.control('')]),
      app_lp_load_test_date: [''],
      app_lp_qty: [''],
      app_lp_certificate: [''],

      // Ser 5 – Helo Safety Nets
      app_hsn_qty: [''],
      app_hsn_load_tested_on: [''],
      app_hsn_certificate: [''],

      // Ser 6 – Harpoon Grid
      app_hg_status: [''],
      app_hg_load_test_date: [''],
      app_hg_certificate: [''],

      // Ser 7 – Helo/Aircraft Lifts/Turntable – NA (no fields)

      // Ser 8 – Preservation of Helo/Hangar Deck
      app_pres_paint_scheme: [''],
      app_pres_full_paint_renewed: [''],
      app_pres_present_condition: this.fb.array([this.fb.control('')]),
      app_pres_friction_test_on: [''],
      app_pres_remarks: [''],

      // Ser 9 – Drainage
      app_drain_helo_deck: [''],
      app_drain_hangar: [''],
      app_drain_hangar_ops: [''],

      // Ser 10 – Final Observations
      app_final_other_obs: this.fb.array([this.fb.control('')]),
      app_final_overall_remarks: [''],

      harpoon_doc: [''],
      harpoon_date: [''],

      crane_p_certificate: [''],
      crane_s_certificate: [''],
      ladder_p_certificate: [''],
      ladder_s_certificate: [''],
      ras_winch_p_certificate: [''],
      ras_winch_s_certificate: [''],
      cargo_winch_certificate: [''],
      ships_brows_certificate: [''],
      towing_hook_certificate: [''],

      //start

      app_ht_load_test_stbd_certificate: [''],
      app_ht_load_test_port_certificate: [''],
      //end
      extra_modes1: this.fb.array([this.fb.control('')]),
      extra_modes2: this.fb.array([this.fb.control('')]),
      extra_modes3: this.fb.array([this.fb.control('')]),
      extra_modes4: this.fb.array([this.fb.control('')]),
      extra_modes5: this.fb.array([this.fb.control('')]),
      extra_modes6: this.fb.array([this.fb.control('')]),
      extra_modes7: this.fb.array([this.fb.control('')]),
      extra_modes8: this.fb.array([this.fb.control('')]),
      extra_modes9: this.fb.array([this.fb.control('')]),
      extra_modes10: this.fb.array([this.fb.control('')]),
    });
  }

  // ---------- FormArray helpers ----------
  getArray(name: string): FormArray {
    return this.form.get(name) as FormArray;
  }

  addRow(name: string): void {
    this.getArray(name).push(this.fb.control(''));
  }

  removeRow(name: string, index: number): void {
    const arr = this.getArray(name);
    if (arr.length > 1) {
      arr.removeAt(index);
    }
  }

  getControls(name: string): FormControl[] {
    return this.getArray(name).controls as FormControl[];
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
      this.form.get(f)?.enable();
    });
  }

  resetDeckPlatingFields() {
    [
      'deck_plating_corrosion',
      'deck_plating_pitting',
      'deck_plating_unpainted',
      'deck_plating_others',
    ].forEach((f) => {
      this.form.get(f)?.reset();
      this.form.get(f)?.disable();
    });
    [
      'deck_plating_corrosion_remark',
      'deck_plating_pitting_remark',
      'deck_plating_unpainted_remark',
      'deck_plating_others_remark',
    ].forEach((f) => {
      this.form.get(f)?.reset();
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
      ...formDataValues,
      authority_doc: FileUrlUtil.getFileUrl(formDataValues.authority_doc?.id),
    };
    // File-upload fields ko URL mein resolve karo (agar upload hue hain)
    this.fileUploadFields.forEach((field) => {
      payload[field] = FileUrlUtil.getFileUrl(formDataValues[field]?.id);
    });

    return payload;
  }

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

  satOptions = [
    { label: 'SAT', value: 'sat' },
    { label: 'UNSAT', value: 'unsat' },
  ];

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

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
    console.log('Uploaded files => ', this.uploadedAuthorityFiles);
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

      this.form.patchValue({ ship: trialRow.ship_name }, { emitEvent: false });

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
      this.cdr?.detectChanges?.();
    } catch (e) {
      console.error('Trial prefill failed (Ship OHMI)', e);
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
      this.cdr?.detectChanges?.();
    } catch (error) {
      console.error(
        'Failed to load Ship OHMI data for selected equipment',
        error,
      );
      this.toastService.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'refit_details' in jsonData || 'deck_plating_obs_4' in jsonData;
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

  /** Tab switch pe form reset — ship field preserve karke, saare dynamic
   *  FormArrays bhi ek default row pe wapas laata hai */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;

      if (control instanceof FormArray) return; // FormArrays alag handle honge

      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    this.dynamicArrayFields.forEach((field) => {
      const arr = this.form.get(field) as FormArray;
      if (!arr) return;
      arr.clear();
      arr.push(this.fb.control(''));
    });

    // rem1 aur deck_plating_obs_4_remark permanently disabled hain — wapas as-is rakho
    this.form.get('rem1')?.disable({ emitEvent: false });
    this.form.get('deck_plating_obs_4_remark')?.disable({ emitEvent: false });

    this.form.patchValue({ ship }, { emitEvent: false });
    this.syncConditionalFlags();
  }

  private syncConditionalFlags(): void {
    const v = (path: string) => this.form.get(path)?.value;

    // Row 2.5.3
    this.showOtherDefectInput = v('deck_plating_obs_16') === 'yes';

    // Row 4.2.1 – Citadel test status
    this.showSatDate = v('deck_plating_obs_46') === 'unsat';
    this.showSatInput = v('deck_plating_obs_46') === 'sat';

    // Row 4.2.2 – Frequency
    this.showOtherOccasion = v('deck_plating_obs_47') === 'any-other';

    // Row 4.2.5 – AFU due for renewal
    this.showLastRenewed = v('deck_plating_obs_50') === 'yes';

    // Row 4.2.6 – Other defects
    this.showOtherDef = v('deck_plating_obs_51') === 'yes';

    // Row 4.4.2 – Mushroom heads other defects
    this.showDeffects = v('deck_plating_obs_58') === 'yes';

    // Row 6.2 – Ventilation details of defects
    this.showDetailsdefects = v('deck_plating_obs_70') === 'yes';

    // Row 6.3.2 – Fresh water details of defects
    this.showDetailsdef = v('deck_plating_obs_75') === 'yes';

    // Row 6.5.3 – Pre-wetting details of defects
    this.ShowanyDfetcs = v('deck_plating_obs_78') === 'yes';

    // Row 6.6.1 – Sanitary defects
    this.ShowSanitaryDfetcs = v('deck_plating_obs_79') === 'yes';

    // Row 8.1.5 – Boat defects
    this.ShowBoatDefetcs = v('deck_plating_obs_92') === 'yes';

    // Row 10.1 – Authorisation of tools
    this.showAuth = v('deck_plating_obs_101') === 'yes';

    // Row 11.1 – 11.7 Implementation plan
    this.showImplementationDetails = [
      'partially-implemented',
      'not-implemented',
    ].includes(v('deck_plating_obs_102'));
    this.showImpDetails = ['partially-implemented', 'not-implemented'].includes(
      v('deck_plating_obs_103'),
    );
    this.showImplementation = [
      'partially-implemented',
      'not-implemented',
    ].includes(v('deck_plating_obs_104'));
    this.showImplemDetails = [
      'partially-implemented',
      'not-implemented',
    ].includes(v('deck_plating_obs_105'));
    this.showImplementedDetails = [
      'partially-implemented',
      'not-implemented',
    ].includes(v('deck_plating_obs_106'));
    this.showStpDetails = ['partially-implemented', 'not-implemented'].includes(
      v('deck_plating_obs_107'),
    );
    this.showUtiDetails = ['partially-implemented', 'not-implemented'].includes(
      v('deck_plating_obs_108'),
    );

    // Appendix A – Hangar Door
    this.showHangarDoorNormalOps = v('app_hd_normal_mode') === 'applicable';
    this.showHangarDoorEmergencyOps =
      v('app_hd_emergency_mode') === 'applicable';
    this.showHangerDoor = v('deck_plating_obs_113') === 'applicable';
    this.showEmer = v('deck_plating_obs_114') === 'applicable';

    // Appendix A – Helo Traversing System
    this.showTraversingNormalOps = v('app_ht_normal_mode') === 'applicable';
    this.showTraversingEmergencyOps =
      v('app_ht_emergency_mode') === 'applicable';
    this.showTraversingLoadTestPortYes = v('app_ht_load_test_port') === 'yes';
    this.showTraversingLoadTestStbdYes = v('app_ht_load_test_stbd') === 'yes';

    // Appendix A – Harpoon Grid
    this.showHarpoonFitted = v('app_hg_status') === 'fitted';
    this.showFitted = v('deck_plating_obs_117') === 'fitted';

    // Row 1.5 – Structural defects (deck plating obs fields group)
    this.showDeckPlatingObsFields = v('deck_plating_obs') === 'Observation';
  }

  /** Poore form ko equipment-specific payload se generic tarike se hydrate karta hai —
   *  saare dynamic "+" FormArrays aur file-upload fields ko special handling deta hai. */
  fillData(payload: any): void {
    if (!payload) return;

    const specialKeys = [
      'ship',
      ...this.dynamicArrayFields,
      ...this.fileUploadFields,
    ];

    Object.keys(payload).forEach((key) => {
      if (specialKeys.includes(key)) return;

      const control = this.form.get(key);
      if (control) {
        control.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });

    // ship — fallback trialRow.ship_name se agar equipment payload mein khaali ho
    this.form
      .get('ship')
      ?.setValue(payload.ship || this.form.get('ship')?.value || '', {
        emitEvent: false,
      });

    // Saare dynamic "+" FormArrays hydrate karo (jitni bhi saved rows hain,
    // utni hi controls form mein banega — jitni user ne "+" se add ki thi)
    this.dynamicArrayFields.forEach((field) => {
      this.patchDynamicArray(field, payload[field]);
    });

    // File-upload fields — URL string ko required object shape mein convert karo
    this.fileUploadFields.forEach((field) => {
      this.form
        .get(field)
        ?.setValue(this.buildFileUploadValue(payload[field]), {
          emitEvent: false,
        });
    });

    // rem1 / deck_plating_obs_4_remark — auto-computed via valueChanges hai
    // (isliye conditional-lock logic ko manually re-apply karna zaroori nahi —
    //  ye field permanently disabled hain buildForm() mein, patch honi chahiye
    //  seedhe payload se, valueChanges trigger nahi honi chahiye)
    this.form.get('rem1')?.setValue(payload.rem1 ?? '', { emitEvent: false });
    this.form
      .get('deck_plating_obs_4_remark')
      ?.setValue(payload.deck_plating_obs_4_remark ?? '', { emitEvent: false });

    this.syncConditionalFlags();
  }

  /** Ek "+" wale dynamic FormArray ko saved values ke hisaab se hydrate karta hai —
   *  jitne bhi saved items hain utni hi rows banayega (jaisa user ne "+" se banayi thi) */
  private patchDynamicArray(field: string, values: any): void {
    const arr = this.form.get(field) as FormArray;
    if (!arr) return;

    const list = Array.isArray(values) && values.length ? values : [''];

    arr.clear();
    list.forEach((val: any) => {
      arr.push(this.fb.control(val ?? ''));
    });
  }

  /** Backend se aayi file-URL string ko FileUploadComponent ke required
   *  { id, name, file_path } shape mein convert karta hai */
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
