import { ChangeDetectorRef, Component } from '@angular/core';
import { FormGroup, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { CommonModule } from '@angular/common';
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { ParameterCardComponent } from '../../../../ui/parameter-card/parameter-card.component';
import { CalenderComponent } from '../../../../ui/calender.component';
import {
  FileUploadComponent,
  UploadedFileItem,
} from '../../../../ui/file-upload/file-upload.component';
import { InputComponent } from '../../../../ui/input.component';
import { SelectWithSearchComponent } from '../../../../ui/select-with-search/select-with-search-box.component';
import { SelectComponent } from '../../../../ui/select.component';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FileUrlUtil } from '../../../../file-url-util';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

@Component({
  selector: 'app-rss',
  standalone: true,
  templateUrl: './rss.html',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    SelectComponent,
    CalenderComponent,
    InputComponent,
    ParameterCardComponent,
    LoadingButtonComponent,
    FileUploadComponent,
    ApprovalWorkFlow,
  ],
})
export class RSS {
  editMode = false;
  rowId!: string | null;
  editDataDetails: any = null;
  loading = false;

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';
  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  readonly restartIcon = 'rotate-ccw';
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;
  form!: FormGroup;
  uploadedAuthorityFiles: UploadedFileItem[] = [];

  occasionOptions = [
    { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
    { label: 'End of Refit Trials', value: 'End of Refit Trials' },
    { label: 'Surprise Checks', value: 'Surprise Checks' },
    { label: 'HVAC Audit', value: 'HVAC Audit' },
  ];

  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  locationOptions: any[] = [];

  // ------------------------------- EQUIPMENT TABS -------------------------------
  eqpList: any[] = [];
  activeTab: any = null;
  workflowTrialId: string | undefined = undefined;

  get headerEquipmentTabs(): any[] {
    if (this.eqpList.length) return this.eqpList;

    const contextEquipments = this.formApiService?.context?.equipment_details;
    console.log('Context Equipments:', contextEquipments);
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
    private api: ApiService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private toast: ToastService,
    public formApiService: FormApiService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadClasses();
    this.listenToClassChanges();
    this.loadLocation();

    this.form.get('max_pos')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            max_pos_remarks: 'SAT',
            max_pos_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            max_pos_remarks: 'UNSAT',
            max_pos_obs: '',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('downward')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            downward_remarks: 'SAT',
            downward_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            downward_remarks: 'UNSAT',
            downward_obs: '',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('frame')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            frame_remarks: 'SAT',
            frame_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            frame_remarks: 'UNSAT',
            frame_obs: '',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('winch')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            winch_remarks: 'SAT',
            winch_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            winch_remarks: 'UNSAT',
            winch_obs: '',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('latch')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            latch_remarks: 'SAT',
            latch_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            latch_remarks: 'UNSAT',
            latch_obs: '',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('lock_level')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            lock_level_remarks: 'SAT',
            lock_level_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            lock_level_remarks: 'UNSAT',
            lock_level_obs: '',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('motor_cut')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            motor_cut_remarks: 'SAT',
            motor_cut_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            motor_cut_remarks: 'UNSAT',
            motor_cut_obs: '',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('cut_off1')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            cut_off1_remarks: 'SAT',
            cut_off1_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            cut_off1_remarks: 'UNSAT',
            cut_off1_obs: '',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('s1_switch')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            s1_switch_remarks: 'SAT',
            s1_switch_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            s1_switch_remarks: 'UNSAT',
            s1_switch_obs: '',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('electrical_pan')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            electrical_pan_remarks: 'SAT',
            electrical_pan_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            electrical_pan_remarks: 'UNSAT',
            electrical_pan_obs: '',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('electrical_mode')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            electrical_mode_remarks: 'SAT',
            electrical_mode_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            electrical_mode_remarks: 'UNSAT',
            electrical_mode_obs: '',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('final_pos')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            final_pos_remarks: 'SAT',
            final_pos_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            final_pos_remarks: 'UNSAT',
            final_pos_obs: '',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('cut_off')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            cut_off_remarks: 'SAT',
            cut_off_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            cut_off_remarks: 'UNSAT',
            cut_off_obs: '',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('switch_hold')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            switch_hold_remarks: 'SAT',
            switch_hold_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            switch_hold_remarks: 'UNSAT',
            switch_hold_obs: '',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('manual_locks')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            manual_locks_remarks: 'SAT',
            manual_locks_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            manual_locks_remarks: 'UNSAT',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('electrical_panel')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            electrical_panel_remarks: 'SAT',
            electrical_panel_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            electrical_panel_remarks: 'UNSAT',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('gear_box')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            gear_box_remarks: 'SAT',
            gear_box_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            gear_box_remarks: 'UNSAT',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('manual_mode')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            manual_mode_remarks: 'SAT',
            manual_mode_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            manual_mode_remarks: 'UNSAT',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('rss_screen')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            rss_screen_remarks: 'SAT',
            rss_screen_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            rss_screen_remarks: 'UNSAT',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('rss_closure')?.valueChanges.subscribe((val) => {
      const v = val?.value ?? val;

      if (v === 'nil') {
        this.form.patchValue(
          {
            rss_closure_remarks: 'SAT',
            rss_closure_obs: '',
          },
          { emitEvent: false },
        );
      }

      if (v === 'observation') {
        this.form.patchValue(
          {
            rss_closure_remarks: 'UNSAT',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('rss_closure')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            rss_closure_remarks: 'SAT',
            rss_closure_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            rss_closure_remarks: 'UNSAT',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('electrical_oper')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            electrical_oper_remarks: 'SAT',
            electrical_oper_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            electrical_oper_remarks: 'UNSAT',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('drive_condition')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'nil') {
        this.form.patchValue(
          {
            noise_operan_remarks: 'SAT',
            noise_op: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            noise_operan_remarks: 'UNSAT',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('lubrication_points')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      // RESET others field always first
      if (v !== 'others') {
        this.form.get('lubrication_points_other')?.reset();
      }

      // CASE 1: Charged → SAT
      if (v === 'charged') {
        this.form.patchValue(
          {
            greasing_point_remarks: 'SAT',
          },
          { emitEvent: false },
        );
      }

      // CASE 2: Painted / Choked / Missing → UNSAT
      else if (['painted', 'choked', 'missing'].includes(v)) {
        this.form.patchValue(
          {
            greasing_point_remarks: 'UNSAT',
          },
          { emitEvent: false },
        );
      }

      // CASE 3: Others → UNSAT + wait for input
      else if (v === 'others') {
        this.form.patchValue(
          {
            greasing_point_remarks: 'UNSAT',
          },
          { emitEvent: false },
        );
      }
    });

    // ✅ LIMIT SWITCH LOGIC (ADD THIS ONLY)
    this.form.get('limit_switch')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'ops') {
        this.form.patchValue(
          {
            lim_switch_remark: 'SAT',
          },
          { emitEvent: false },
        );
      }

      if (v === 'non_ops') {
        this.form.patchValue(
          {
            lim_switch_remark: 'UNSAT',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('oil_level')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === '40_100') {
        this.form.patchValue(
          {
            oil_level_remark: 'SAT',
            oil_level_remark_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'less_40') {
        this.form.patchValue(
          {
            oil_level_remark: 'SAT_OBS',
          },
          { emitEvent: false },
        );
      } else if (v === 'empty') {
        this.form.patchValue(
          {
            oil_level_remark: 'UNSAT',
            oil_level_remark_obs: '',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('oil_available')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'yes') {
        this.form.patchValue(
          {
            oil_remark: 'SAT',
          },
          { emitEvent: false },
        );
      }

      if (v === 'no') {
        this.form.patchValue(
          {
            oil_remark: 'UNSAT',
          },
          { emitEvent: false },
        );
      }
    });

    this.form.get('foundation_condition')?.valueChanges.subscribe((value) => {
      const v = value?.value ?? value;

      if (v === 'no_observation') {
        this.form.patchValue(
          {
            foundation_remark: 'SAT',
            foundation_remark_obs: '',
          },
          { emitEvent: false },
        );
      } else if (v === 'observation') {
        this.form.patchValue(
          {
            foundation_remark: 'UNSAT',
          },
          { emitEvent: false },
        );
      }
    });

    this.loadTrialPrefillFromQuery();
  }

  buildForm() {
    this.form = this.fb.group({
      classOfShip: [''],
      ship: [{ value: '', disabled: true }],
      date_of_conduct_trail: [''],
      place_of_conduct_trail: [''],
      document_no: [''],
      occasion_of_conduct_trail: [''],
      manufacturer_name: [{ value: '', disabled: true }],
      authority: [''],
      authority_date: [''],
      authority_doc: [''],
      make: [''],
      model: [{ value: '', disabled: true }],
      year_of_manuf: [''],
      electrical_check_status: [''],
      electrical_check_details: [''],
      electrical_check_remark: [''],
      limit_switch: [''],
      lim_switch_remark: [{ value: '', disabled: true }],
      oil_level: [''],
      oil_level_remark: [''],
      oil_level_remark_obs: [''],
      oil_type: [''],
      oil_available: [''],
      oil_remark: [''],
      foundation_condition: [''],
      foundation_type: [''],
      foundation_obs: [''],
      lift_well_remark: [''],
      lubrication_points: [''],
      lubrication_points_other: [''],
      greasing_point_remarks: [''],
      drive_condition: [''],
      noise_op: [''],
      noise_operan_remarks: [''],
      limit_switch_obs: [''],
      limit_switch_remarks: [''],
      electrical_oper: [''],
      electrical_oper_obs: [''],
      electrical_oper_remarks: [''],
      rss_closure: [''],
      rss_closure_obs: [''],
      rss_closure_remarks: [''],
      rss_screen: [''],
      rss_screen_obs: [''],
      rss_screen_remarks: [''],

      foundation_remark: [''],
      foundation_remark_obs: [''],

      corrosion_obs: [''],
      pitting_obs: [''],
      unpainted_obs: [''],
      others_obs: [''],

      manual_mode: [''],
      manual_mode_obs: [''],
      manual_mode_remarks: [''],
      gear_box: [''],
      gear_box_obs: [''],
      gear_box_remarks: [''],
      electrical_panel: [''],
      electrical_panel_obs: [''],
      electrical_panel_remarks: [''],
      manual_locks: [''],
      manual_locks_obs: [''],
      manual_locks_remarks: [''],
      switch_hold: [''],
      switch_hold_obs: [''],
      switch_hold_remarks: [''],
      cut_off: [''],
      cut_off_obs: [''],
      cut_off_remarks: [''],
      final_pos: [''],
      final_pos_obs: [''],
      final_pos_remarks: [''],
      electrical_mode: [''],
      electrical_mode_obs: [''],
      electrical_mode_remarks: [''],
      electrical_pan: [''],
      electrical_pan_obs: [''],
      electrical_pan_remarks: [''],
      engage_manual: [''],
      engage_manual_obs: [''],
      engage_manual_remarks: [''],
      s1_switch: [''],
      s1_switch_obs: [''],
      s1_switch_remarks: [''],
      cut_off1: [''],
      cut_off1_obs: [''],
      cut_off1_remarks: [''],
      file: [''],
      motor_cut: [''],
      motor_cut_obs: [''],
      motor_cut_remarks: [''],
      lock_level: [''],
      lock_level_obs: [''],
      lock_level_remarks: [''],
      latch: [''],
      latch_obs: [''],
      latch_remarks: [''],
      winch: [''],
      winch_obs: [''],
      winch_remarks: [''],
      shipside: [''],
      shipside_obs: [''],
      shipside_remarks: [''],
      frame: [''],
      frame_obs: [''],
      frame_remarks: [''],
      downward: [''],
      downward_obs: [''],
      downward_remarks: [''],
      max_pos: [''],
      max_pos_obs: [''],
      max_pos_remarks: [''],
      open_time_electric: [''],
      open_time_electric_remark: [''],
      closing_time_electric: [''],
      closing_time_electric_remark: [''],
      open_time_manual: [''],
      open_time_manual_remark: [''],
      closing_time_manual: [''],
      closing_time_manual_remark: [''],
      any_other_observations: [''],
      overall_remark: [''],
      overall_remark_details: [''],
      lift_well_status: [''],
      lift_well_obs: [''],
    });
  }

  radioOptions1 = [
    { label: 'Ops', value: 'ops' },
    { label: 'Non Ops', value: 'non_ops' },
  ];

  radioOptions = [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ];

  rssClosureOptions = [
    { label: 'Nil', value: 'nil' },
    { label: 'Observation', value: 'observation' },
  ];

  satOptions = [{ label: 'SAT', value: 'SAT' }];

  handleSatUnsat(statusKey: string, remarkKey: string, detailsKey: string) {
    const value = this.form.get(statusKey)?.value;

    if (value === 'SAT') {
      this.form.get(remarkKey)?.patchValue('SAT');
      this.form.get(detailsKey)?.patchValue('NIL');
    }

    if (value === 'UNSAT') {
      this.form.get(remarkKey)?.patchValue('UNSAT');
      this.form.get(detailsKey)?.patchValue('');
    }
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
  }

  onRadioChange(value: string, remarkKey: string) {
    const mapping: Record<string, string> = {
      yes: 'UNSAT',
      no: 'SAT',
      ops: 'SAT',
      non_ops: 'UNSAT',
    };

    const remark = mapping[value] ?? '';

    this.form.get(remarkKey)?.setValue(remark);
  }

  handleObservation(selectKey: string, obsKey: string, remarkKey: string) {
    const value = this.form.get(selectKey)?.value;

    if (value === 'observation') {
      this.form.get(remarkKey)?.patchValue('UNSAT');
    } else if (value === 'nil') {
      this.form.get(remarkKey)?.patchValue('SAT');
      this.form.get(obsKey)?.patchValue(''); // clear textarea
    }
  }

  handleGreasingPoint() {
    const value = this.form.get('lubrication_points')?.value;

    if (value === 'charged') {
      this.form.patchValue({
        greasing_point_remarks: 'SAT',
      });
    }

    if (['painted', 'choked', 'missing', 'others'].includes(value)) {
      this.form.patchValue({
        greasing_point_remarks: 'UNSAT',
      });
    }

    // optional cleanup
    if (value !== 'others') {
      this.form.get('lubrication_points_other')?.reset();
    }
  }
  onSelectMappingChange(
    value: string,
    remarkKey: string,
    mapping: Record<string, string>,
  ) {
    const remark = mapping[value] ?? '';
    this.form.get(remarkKey)?.patchValue(remark);
  }

  onTimeCheck(fieldKey: string, remarkKey: string, threshold: number) {
    const value = Number(this.form.get(fieldKey)?.value);

    if (!value && value !== 0) {
      this.form.get(remarkKey)?.patchValue('');
      return;
    }

    const remark = value <= threshold ? 'SAT' : 'UNSAT';
    this.form.get(remarkKey)?.patchValue(remark);
  }

  extract(key: string): string {
    const val = this.form.get(key)?.value;
    return val?.value ?? val; // THIS is the fix
  }

  handleNilObservation(statusKey: string, remarkKey: string, obsKey: string) {
    const value = this.form.get(statusKey)?.value;

    if (value === 'nil') {
      this.form.patchValue({
        [remarkKey]: 'SAT',
        [obsKey]: 'NIL',
      });
    }

    if (value === 'observation') {
      this.form.patchValue({
        [remarkKey]: 'UNSAT',
        [obsKey]: '',
      });
    }
  }

  handleFile(file: any) {
    if (!file) return;

    this.form.patchValue({
      file: file.id,
    });

    console.log('File ID:', file);
  }

  handleMultipleFiles(files: FileList, controlName: string) {
    const fileArray = Array.from(files);
    this.form.get(controlName)?.patchValue(fileArray);
  }

  loadClasses() {
    this.api
      .getDropdownData('master/ship-classes/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((res: any) => {
        this.classOfShipOptions = res || [];
        this.cdr.detectChanges();
      });
  }
  listenToClassChanges() {
    this.form.get('classOfShip')?.valueChanges.subscribe((classId) => {
      if (classId) {
        this.loadShips(classId);
        this.form.get('ship')?.reset();
      } else {
        this.shipOptions = [];
        this.form.get('ship')?.reset();
      }
    });
  }

  onElectricalCheckChange(value: string | Event): void {
    value = value instanceof Event
      ? ((value.target as HTMLSelectElement | null)?.value ?? '')
      : value;
    if (value === 'SAT') {
      this.form.patchValue({
        electrical_check_status: 'SAT',
        electrical_check_details: 'NIL',
        electrical_check_remark: 'SAT',
      });
    } else if (value === 'UNSAT') {
      this.form.patchValue({
        electrical_check_status: 'UNSAT',
        electrical_check_details: '',
        electrical_check_remark: 'UNSAT',
      });
    }
  }

  onLimitSwitchChange(value: string): void {
    let remark = '';

    if (value === 'ops') {
      remark = 'SAT';
    } else if (value === 'non_ops') {
      remark = 'UNSAT';
    }

    this.form.patchValue({
      limit_switch: value,
      lim_switch_remark: remark,
    });
  }

  loadShips(id: number) {
    this.api
      .getDropdownData('master/ships/', { labelKey: 'name', valueKey: 'id' })
      .subscribe((res) => {
        this.shipOptions = res || [];
      });
  }
  loadLocation() {
    this.api
      .getDropdownData('master/locations/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((res) => {
        this.locationOptions = res || [];
      });
  }
  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
  }

  buildPayload() {
    const formValues = this.form.getRawValue();

    const payload: any = {
      ...formValues,
      authority_doc: FileUrlUtil.getFileUrl(formValues.authority_doc?.id),
    };

    return payload;
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
      this.applyEquipmentDefaults(this.activeTab);
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Trial prefill failed (RSS Screen Closure)', e);
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
    //   const equipmentList = this.formApiService?.context?.equipment_details || [];
    //   console.log('Equipment List:', equipmentList);

    // const selectedEquipment = equipmentList.find(
    //   (eq: any) => eq.id === tab.id
    // );

    // if (selectedEquipment) {
    //   console.log('Selected Equipment:', selectedEquipment);
    //   this.form.patchValue({
    //     manufacturer_name: selectedEquipment.manufacturer_name,
    //     model: selectedEquipment.model,
    //   });
    // }

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
      this.cdr.detectChanges();
    } catch (error) {
      console.error(
        'Failed to load RSS Screen Closure data for selected equipment',
        error,
      );
      this.toast.showError('Failed to load selected equipment data.');
    }
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    const isFlat =
      'electrical_check_status' in jsonData ||
      'date_of_conduct_trail' in jsonData ||
      'lubrication_points' in jsonData;
    if (isFlat) return jsonData;

    return jsonData[equipmentKey] ?? null;
  }

  /** Sets Make/Model from the equipment's master data (equipment_details) — always
   *  reflects the currently active equipment, regardless of what's in the saved form JSON. */
  private applyEquipmentDefaults(tab: any): void {
    if (!tab) return;

    const equipmentList =
      this.formApiService?.context?.equipment_details || this.eqpList || [];
    const selectedEquipment =
      equipmentList.find(
        (eq: any) =>
          (eq.id ?? eq.equipment_id) === (tab.id ?? tab.equipment_id),
      ) || tab; // tab itself already carries manufacturer_name/model per the API shape

    this.form.patchValue(
      {
        manufacturer_name: selectedEquipment?.manufacturer_name ?? '',
        model: selectedEquipment?.model ?? '',
      },
      { emitEvent: false },
    );
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
   *  lim_switch_remark ko bhi wapas permanently-disabled state mein reset karta hai */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;
      control.enable({ emitEvent: false });
      control.reset('', { emitEvent: false });
    });

    // lim_switch_remark buildForm() mein permanently disabled tha — wapas as-is rakho
    this.form.get('lim_switch_remark')?.disable({ emitEvent: false });

    this.form.patchValue({ ship }, { emitEvent: false });
  }

  /** Poore form ko equipment-specific payload se generic tarike se hydrate karta hai. */
  fillData(payload: any): void {
    if (!payload) return;

    Object.keys(payload).forEach((key) => {
      if (key === 'ship' || key === 'authority_doc') return;

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

    // authority_doc — URL string ko file-upload component ke required object shape mein convert karo
    this.form
      .get('authority_doc')
      ?.setValue(this.buildFileUploadValue(payload.authority_doc), {
        emitEvent: false,
      });

    // lim_switch_remark — buildForm() mein permanently disabled hai, isliye
    // generic loop ne ise skip nahi kiya (control.setValue kaam karta hai chahe
    // control disabled ho), lekin agar tab switch se pehle enable() hua ho to
    // usko wapas disable karo taaki UI-behavior consistent rahe
    this.form.get('lim_switch_remark')?.disable({ emitEvent: false });
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
