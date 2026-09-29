import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnInit,
  Output,
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
import { YearCalendarComponent } from '../../../../ui/year-calender/year-calendar.component';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { FileUrlUtil } from '../../../../file-url-util';
import { FileUploadComponent } from '../../../../ui/file-upload/file-upload.component';
import { MasterService } from '../../../../services/master.service';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

export interface UploadedFileItem {
  id?: string;
  name: string;
  file_path: string;
}

@Component({
  selector: 'app-boat-davit-crane',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    SelectComponent,
    CalenderComponent,
    InputComponent,
    FileUploadComponent,
    ApprovalWorkFlow,
    ParameterCardComponent,
  ],
  templateUrl: './boat-davit-crane.html',
})
export class BoatDavitCrane implements OnInit {
  readonly restartIcon = 'rotate-ccw';

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;

  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  bdcForm!: FormGroup;
  loading = false;
  uploadedAuthorityFiles: UploadedFileItem[] = [];

  ocationofconduct: any[] = [];
  commandOptions: any[] = [];
  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  stbdOptions: any[] = [];
  yearOfManufactureOptions: any[] = [];
  satunsat: any[] = [];
  satunsatwoNa: any[] = [];
  statusOptions: any[] = [];
  yesNoOptions: any[] = [];
  oilTypeOptions: any[] = [];
  oilOptions: any[] = [];

  yesnoOptions: any[] = [];
  plantingfoundationoption: any[] = [];
  greasingoption: any[] = [];
  opsStatusOptions: any[] = [];
  optiongearbox: any[] = [];
  spmOptions: any[] = [];

  // Additional dropdown options
  wireRopeStatusOptions: any[] = [];
  observationOptions: any[] = [];
  greaseNippleOptions: any[] = [];
  logBookOptions: any[] = [];
  satUnsatObservations: any[] = [];
  filteredWireRopeOptions: any[] = [];
  locationOptions: any[] = [];
  showApprovalWorkflowPopup = false;
    isSubmitTime = false;
  port_stbd_options = [
    { label: 'PORT', value: 'port' },
    { label: 'STBD', value: 'stbd' },
  ];

  boat_davit_crane_options = [
    { label: 'Boat David', value: 'boat_davit' },
    { label: 'Crane', value: 'crane' },
  ];

  selectedFile: File | null = null;
  fileName: string = 'No file chosen';

  @Output() fileSelected = new EventEmitter<File | null>();

  onFileChange(event: any) {
    const file = event.target.files[0];

    if (file) {
      this.selectedFile = file;
      this.fileName = file.name;
      this.fileSelected.emit(file);
    }
  }

  removeFile() {
    this.selectedFile = null;
    this.fileName = 'No file chosen';
    this.fileSelected.emit(null);
  }

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
    public formApiService: FormApiService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private masterService: MasterService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.setupValueListeners();
    this.loadLocation();
    this.loadTrialPrefillFromQuery();

    // Add this in ngOnInit() after satunsat array
    this.logBookOptions = [
      { label: 'Yes, updated', value: 'Yes, updated' },
      { label: 'Yes, but not updated', value: 'Yes, but not updated' },
      { label: 'Not Held', value: 'Not Held' },
    ];

    this.ocationofconduct = [
      { label: 'Pre-Refit Trials', value: 'Pre-Refit Trials' },
      { label: 'End of Refit Trials', value: 'End of Refit Trials' },
      { label: 'Surprise Checks', value: 'Surprise Checks' },
    ];

    this.satunsat = [
      { label: 'SAT', value: 'SAT' },
      { label: 'UNSAT', value: 'UNSAT' },
      { label: 'SAT with Observation', value: 'SAT with Observation' },
      { label: 'NA', value: 'NA' },
    ];

    this.satunsatwoNa = [
      { label: 'SAT', value: 'SAT' },
      { label: 'UNSAT', value: 'UNSAT' },
      { label: 'SAT with Observation', value: 'SAT with Observation' },
    ];

    this.spmOptions = [
      { label: '0 - 20 dBM (Green)', value: 'Green' },
      { label: '20-35 dBM (Yellow)', value: 'Yellow' },
      { label: '>35 dBM (Red)', value: 'Red' },
    ];

    this.opsStatusOptions = [
      { label: 'NA', value: 'NA' },
      { label: 'Ops', value: 'Ops' },
      { label: 'Non-ops', value: 'Non-ops' },
    ];

    this.optiongearbox = [
      { label: 'Nil', value: 'Nil' },
      { label: 'Noise Observed', value: 'Noise Observed' },
    ];

    this.oilOptions = [
      { label: '40-100% filled', value: '40-100% filled' },
      { label: 'Less than 40% filled', value: 'Less than 40% filled' },
      { label: 'Empty', value: 'Empty' },
    ];

    this.oilTypeOptions = [
      { label: 'OC300', value: 'OC300' },
      { label: 'SS320', value: 'SS320' },
      { label: 'Others', value: 'Others' },
    ];

    this.yesnoOptions = [
      { label: 'Yes', value: 'Yes' },
      { label: 'No', value: 'No' },
    ];

    this.plantingfoundationoption = [
      { label: 'No Observation', value: 'No Observation' },
      { label: 'Observation', value: 'Observation' },
    ];

    this.greasingoption = [
      { label: 'Greased', value: 'Greased' },
      { label: 'Not Greased', value: 'Not Greased' },
    ];

    this.greaseNippleOptions = [
      { label: 'Charged', value: 'Charged' },
      { label: 'Painted', value: 'Painted' },
      { label: 'Choked', value: 'Choked' },
      { label: 'Missing', value: 'Missing' },
      { label: 'Others', value: 'Others' },
    ];

    this.wireRopeStatusOptions = [
      { label: 'Nil', value: 'Nil' },
      { label: 'Observation', value: 'Observation' },
    ];

    this.observationOptions = [
      { label: 'SAT with Observation', value: 'SAT with Observation' },
      { label: 'UNSAT', value: 'UNSAT' },
    ];
    this.satUnsatObservations = [
      { label: 'SAT with Observation', value: 'SAT with Observation' },
      { label: 'UNSAT', value: 'UNSAT' },
    ];
  }

  loadLocation() {
    this.masterService.getLocations().subscribe((res) => {
      this.locationOptions = res.data.map((item: any) => ({
        label: item.name,
        value: item.id,
      }));
    });
  }

  setupValueListeners() {
    this.bdcForm.get('bdc_4_due')?.valueChanges.subscribe(() => {
      this.evaluateLoadTestValidity('bdc_4_last', 'bdc_4_due', 'bdc_4_rem');
    });

    // Row 5: Load Testing of Wire Rope
    this.bdcForm.get('bdc_5_last')?.valueChanges.subscribe(() => {
      this.calculateDueDate('bdc_5_last', 'bdc_5_due', 27);
    });
    this.bdcForm.get('bdc_5_due')?.valueChanges.subscribe(() => {
      this.evaluateLoadTestValidity('bdc_5_last', 'bdc_5_due', 'bdc_5_rem');
    });

    // Row 6: Serviceability Checks
    this.bdcForm.get('bdc_6_last')?.valueChanges.subscribe(() => {
      this.calculateDueDate('bdc_6_last', 'bdc_6_due', 12);
    });
    this.bdcForm.get('bdc_6_due')?.valueChanges.subscribe(() => {
      this.evaluateServiceabilityValidity(
        'bdc_6_last',
        'bdc_6_due',
        'bdc_6_rem',
      );
    });

    // Row 7: Wire rope defects
    // this.bdcForm.get('bdc_7_obs')?.valueChanges.subscribe((value) => {
    //   this.determineWireRopeRemarks(value, 'bdc_7_rem');
    // });
    this.bdcForm.get('bdc_7_obs')?.valueChanges.subscribe((value) => {
      const remarkCtrl = this.bdcForm.get('bdc_7_rem');

      if (value === 'Nil') {
        remarkCtrl?.setValue('SAT', { emitEvent: false });
        remarkCtrl?.disable({ emitEvent: false });
      } else if (value === 'Observation') {
        remarkCtrl?.enable({ emitEvent: false });
      }
    });

    // Row 8: Wire rope replacement
    this.bdcForm.get('bdc_8_last')?.valueChanges.subscribe(() => {
      this.calculateDueDate('bdc_8_last', 'bdc_8_due', 60); // 5 years = 60 months
    });
    this.bdcForm.get('bdc_8_due')?.valueChanges.subscribe(() => {
      this.evaluateReplacementValidity('bdc_8_last', 'bdc_8_due', 'bdc_8_rem');
    });

    // Row 9a: JB/Control condition
    this.bdcForm.get('bdc_9a_obs')?.valueChanges.subscribe((value) => {
      this.determineConditionRemarks(value, 'bdc_9a_remark1');
    });
    this.bdcForm.get('bdc_9a_obs')?.valueChanges.subscribe((value) => {
      console.log('Selected Value:', value);
    });

    // Row 9b: Switch status
    this.bdcForm.get('bdc_9b_obs')?.valueChanges.subscribe((value) => {
      this.determineOpsStatusRemarks(value, 'bdc_9b_rem');
      if (value === 'Ops') {
        this.bdcForm.get('bdc_9b_remark2')?.setValue('SAT');
      }
    });

    // Row 9c: Indicator status
    this.bdcForm.get('bdc_9c_obs')?.valueChanges.subscribe((value) => {
      this.determineOpsStatusRemarks(value, 'bdc_9c_rem');
    });

    // Row 10: Gear box noise
    this.bdcForm.get('bdc_10_obs')?.valueChanges.subscribe((value) => {
      this.determineGearBoxRemarks(value, 'bdc_10_rem');
    });

    // Row 11: Oil level
    this.bdcForm.get('bdc_11_obs')?.valueChanges.subscribe((value) => {
      this.determineOilLevelRemarks(value, 'bdc_11_rem');
    });

    // Row 12: Oil type compliance
    this.bdcForm.get('bdc_12_obs')?.valueChanges.subscribe((value) => {
      this.determineOilTypeRemarks(value, 'bdc_12_rem');
    });

    // Row 13: Oil change
    this.bdcForm.get('bdc_13_obs')?.valueChanges.subscribe(() => {
      this.evaluateOilChangeValidity('bdc_13_obs', 'bdc_13_rem');
    });

    // Row 14: Foundation condition
    this.bdcForm.get('bdc_14_obs')?.valueChanges.subscribe((value) => {
      this.determineFoundationRemarks(value, 'bdc_14_rem');
    });

    // Row 15: Greasing
    this.bdcForm.get('bdc_15_obs')?.valueChanges.subscribe((value) => {
      this.determineGreasingRemarks(value, 'bdc_15_rem');
    });

    // Row 16: Grease nipples
    this.bdcForm.get('bdc_16_obs')?.valueChanges.subscribe((value) => {
      this.determineGreaseNippleRemarks(value, 'bdc_16_rem');
    });

    // Row 18: Emergency mode
    this.bdcForm.get('bdc_18_obs')?.valueChanges.subscribe((value) => {
      this.determineOpsStatusRemarks(value, 'bdc_18_rem');
    });

    // Row 19: Limit switch
    this.bdcForm.get('bdc_19_obs')?.valueChanges.subscribe((value) => {
      this.determineOpsStatusRemarks(value, 'bdc_19_rem');
    });

    // Row 20: Heave compensation
    this.bdcForm.get('bdc_20_obs')?.valueChanges.subscribe((value) => {
      this.determineOpsStatusRemarks(value, 'bdc_20_rem');
    });

    // Row 21: Arm condition
    this.bdcForm.get('bdc_21_obs')?.valueChanges.subscribe((value) => {
      this.determineArmRemarks(value, 'bdc_21_rem');
    });

    // Row 22: Pulley condition
    this.bdcForm.get('bdc_22_obs')?.valueChanges.subscribe((value) => {
      this.determinePulleyRemarks(value, 'bdc_22_rem');
    });

    // Row 23: Insulation
    this.bdcForm.get('bdc_23_obs')?.valueChanges.subscribe((value) => {
      this.determineInsulationRemarks(value, 'bdc_23_rem');
    });

    // Row 24: SPM vibration
    this.bdcForm.get('bdc_24_obs')?.valueChanges.subscribe((value) => {
      this.determineSPMRemarks(value, 'bdc_24_rem');
    });

    // Row 32: Log book
    this.bdcForm.get('bdc_32_obs')?.valueChanges.subscribe((value) => {
      this.determineLogBookRemarks(value, 'bdc_32_rem');
    });

    // Row 34: SPM
    this.bdcForm.get('bdc_34_obs')?.valueChanges.subscribe((value) => {
      this.determineSPMRemarks(value, 'bdc_34_rem');
    });
  }

  // Helper methods for auto-calculation and remarks
  calculateDueDate(
    lastDateControl: string,
    dueDateControl: string,
    monthsToAdd: number,
  ) {
    const lastDate = this.bdcForm.get(lastDateControl)?.value;
    if (lastDate) {
      const date = new Date(lastDate);
      date.setMonth(date.getMonth() + monthsToAdd);
      const dueDate = date.toISOString().split('T')[0];
      this.bdcForm.get(dueDateControl)?.setValue(dueDate, { emitEvent: false });
    }
  }

  evaluateLoadTestValidity(
    lastDateControl: string,
    dueDateControl: string,
    remarkControl: string,
  ) {
    const lastDate = this.bdcForm.get(lastDateControl)?.value;
    const dueDate = this.bdcForm.get(dueDateControl)?.value;

    if (lastDate && dueDate) {
      const last = new Date(lastDate);
      const due = new Date(dueDate);

      const monthDiff =
        (due.getFullYear() - last.getFullYear()) * 12 +
        (due.getMonth() - last.getMonth());

      const remarkCtrl = this.bdcForm.get(remarkControl);

      if (monthDiff <= 27) {
        remarkCtrl?.setValue('SAT', { emitEvent: false });
        remarkCtrl?.disable({ emitEvent: false }); // Disable dropdown
      } else {
        remarkCtrl?.setValue('UNSAT', { emitEvent: false });
        remarkCtrl?.enable({ emitEvent: false }); // Optional: enable again
      }
    }
  }
  evaluateServiceabilityValidity(
    lastDateControl: string,
    dueDateControl: string,
    remarkControl: string,
  ) {
    const lastDate = this.bdcForm.get(lastDateControl)?.value;
    const dueDate = this.bdcForm.get(dueDateControl)?.value;

    if (lastDate && dueDate) {
      const last = new Date(lastDate);
      const due = new Date(dueDate);

      const monthDiff =
        (due.getFullYear() - last.getFullYear()) * 12 +
        (due.getMonth() - last.getMonth());

      const remarkCtrl = this.bdcForm.get(remarkControl);

      if (monthDiff <= 12) {
        remarkCtrl?.setValue('SAT', { emitEvent: false });
      } else {
        remarkCtrl?.setValue('UNSAT', { emitEvent: false });
      }

      // Disable the dropdown after the value is set
      remarkCtrl?.disable({ emitEvent: false });
    }
  }

  evaluateReplacementValidity(
    lastDateControl: string,
    dueDateControl: string,
    remarkControl: string,
  ) {
    const lastDate = this.bdcForm.get(lastDateControl)?.value;
    const dueDate = this.bdcForm.get(dueDateControl)?.value;
    const remarkCtrl = this.bdcForm.get(remarkControl);

    if (lastDate && dueDate) {
      const today = new Date();
      const due = new Date(dueDate);

      if (today <= due) {
        remarkCtrl?.setValue('SAT', { emitEvent: false });
      } else {
        remarkCtrl?.setValue('UNSAT', { emitEvent: false });
      }

      // disable after condition applied
      remarkCtrl?.disable({ emitEvent: false });
    }
  }

  evaluateOilChangeValidity(lastDateControl: string, remarkControl: string) {
    const lastDate = this.bdcForm.get(lastDateControl)?.value;
    const remarkCtrl = this.bdcForm.get(remarkControl);

    if (!lastDate) return;

    const last = new Date(lastDate);
    const today = new Date();

    const monthsDiff =
      (today.getFullYear() - last.getFullYear()) * 12 +
      (today.getMonth() - last.getMonth());

    remarkCtrl?.setValue(monthsDiff < 12 ? 'SAT' : 'UNSAT', {
      emitEvent: false,
    });

    remarkCtrl?.disable({ emitEvent: false });
  }
  determineWireRopeRemarks(observationValue: string, remarkControl: string) {
    const remarkCtrl = this.bdcForm.get(remarkControl);

    if (observationValue === 'Nil') {
      remarkCtrl?.setValue('SAT', { emitEvent: false });
    } else if (observationValue === 'Observation') {
      remarkCtrl?.setValue('SAT with Observation', { emitEvent: false });
    }

    // disable dropdown after condition is applied
    remarkCtrl?.disable({ emitEvent: false });
  }

  determineConditionRemarks(conditionValue: string, remarkControl: string) {
    // SAT → auto SAT
    if (conditionValue === 'SAT') {
      this.bdcForm.get(remarkControl)?.setValue('SAT', {
        emitEvent: false,
      });
    }

    // SAT with Observation / UNSAT
    else if (
      conditionValue === 'SAT with Observation' ||
      conditionValue === 'UNSAT'
    ) {
      // allow user input / dialogue box flow
      this.bdcForm.get(remarkControl)?.setValue('', {
        emitEvent: false,
      });
    }
  }

  determineOpsStatusRemarks(opsValue: string, remarkControl: string) {
    const remarkCtrl = this.bdcForm.get(remarkControl);
    const extraCtrl = this.bdcForm.get('bdc_9b_remark1');

    if (!remarkCtrl) return;

    if (opsValue === 'Ops') {
      remarkCtrl.setValue('SAT', { emitEvent: false });
      remarkCtrl.disable({ emitEvent: false });

      extraCtrl?.setValue('', { emitEvent: false });
      extraCtrl?.disable({ emitEvent: false });
    } else if (opsValue === 'Non-ops') {
      remarkCtrl.setValue('UNSAT', { emitEvent: false });
      remarkCtrl.disable({ emitEvent: false });

      extraCtrl?.enable({ emitEvent: false }); // show input
    } else if (opsValue === 'NA') {
      remarkCtrl.setValue('NA', { emitEvent: false });
      remarkCtrl.disable({ emitEvent: false });

      extraCtrl?.setValue('', { emitEvent: false });
      extraCtrl?.disable({ emitEvent: false });
    }
  }

  determineGearBoxRemarks(noiseValue: string, remarkControl: string) {
    const remarkCtrl = this.bdcForm.get(remarkControl);

    remarkCtrl?.setValue(noiseValue === 'Nil' ? 'SAT' : 'UNSAT', {
      emitEvent: false,
    });

    remarkCtrl?.disable({ emitEvent: false });
  }

  determineOilLevelRemarks(levelValue: string, remarkControl: string) {
    const remarkCtrl = this.bdcForm.get(remarkControl);

    const map: Record<string, string> = {
      '40-100% filled': 'SAT',
      'Less than 40% filled': 'SAT with Observation',
      Empty: 'UNSAT',
    };

    if (map[levelValue]) {
      remarkCtrl?.setValue(map[levelValue], { emitEvent: false });
      remarkCtrl?.disable({ emitEvent: false });
    }
  }

  determineOilTypeRemarks(complianceValue: string, remarkControl: string) {
    const remarkCtrl = this.bdcForm.get(remarkControl);

    remarkCtrl?.setValue(complianceValue === 'Yes' ? 'SAT' : 'UNSAT', {
      emitEvent: false,
    });

    remarkCtrl?.disable({ emitEvent: false });
  }

  determineFoundationRemarks(observationValue: string, remarkControl: string) {
    const remarkCtrl = this.bdcForm.get(remarkControl);

    remarkCtrl?.setValue(
      observationValue === 'No Observation' ? 'SAT' : 'UNSAT',
      { emitEvent: false },
    );

    remarkCtrl?.disable({ emitEvent: false });
  }

  determineGreasingRemarks(greasingValue: string, remarkControl: string) {
    const remarkCtrl = this.bdcForm.get(remarkControl);

    const map: Record<string, string> = {
      Greased: 'SAT',
      'Not Greased': 'UNSAT',
    };

    if (map[greasingValue]) {
      remarkCtrl?.setValue(map[greasingValue], { emitEvent: false });
      remarkCtrl?.disable({ emitEvent: false });
    }
  }

  determineGreaseNippleRemarks(conditionValue: string, remarkControl: string) {
    const remarkCtrl = this.bdcForm.get(remarkControl);

    const remarks: { [key: string]: string } = {
      Charged: 'SAT',
      Painted: 'UNSAT',
      Choked: 'UNSAT',
      Missing: 'UNSAT',
    };

    if (remarks[conditionValue]) {
      remarkCtrl?.setValue(remarks[conditionValue], {
        emitEvent: false,
      });
      remarkCtrl?.disable({ emitEvent: false });
    } else if (conditionValue === 'Others') {
      remarkCtrl?.setValue('', { emitEvent: false });
      remarkCtrl?.enable({ emitEvent: false });
    }
  }

  determineArmRemarks(observationValue: string, remarkControl: string) {
    const remarkCtrl = this.bdcForm.get(remarkControl);

    const remarks: { [key: string]: string } = {
      Nil: 'SAT',
      Observation: 'SAT with Observation',
    };

    if (remarks[observationValue]) {
      remarkCtrl?.setValue(remarks[observationValue], {
        emitEvent: false,
      });
      remarkCtrl?.disable({ emitEvent: false });
    }
  }

  determinePulleyRemarks(observationValue: string, remarkControl: string) {
    const remarkCtrl = this.bdcForm.get(remarkControl);

    const remarks: { [key: string]: string } = {
      Nil: 'SAT',
      Observation: 'SAT with Observation',
    };

    if (remarks[observationValue]) {
      remarkCtrl?.setValue(remarks[observationValue], {
        emitEvent: false,
      });
      remarkCtrl?.disable({ emitEvent: false });
    }
  }

  determineInsulationRemarks(value: string, remarkControl: string) {
    const numericValue = parseFloat(value);
    const remarkCtrl = this.bdcForm.get(remarkControl);

    if (isNaN(numericValue)) {
      return;
    }

    remarkCtrl?.setValue(numericValue >= 2 ? 'SAT' : 'UNSAT', {
      emitEvent: false,
    });

    remarkCtrl?.disable({ emitEvent: false });
  }

  determineSPMRemarks(spmValue: string, remarkControl: string) {
    const remarkCtrl = this.bdcForm.get(remarkControl);

    const remarks: { [key: string]: string } = {
      Green: 'SAT',
      Yellow: 'SAT with Observation',
      Red: 'UNSAT',
    };

    if (remarks[spmValue]) {
      remarkCtrl?.setValue(remarks[spmValue], { emitEvent: false });
      remarkCtrl?.disable({ emitEvent: false });
    }
  }

  determineLogBookRemarks(logValue: string, remarkControl: string) {
    const remarkCtrl = this.bdcForm.get(remarkControl);

    const remarks: { [key: string]: string } = {
      'Yes, updated': 'SAT',
      'Yes, but not updated': 'SAT with Observation',
      'Not Held': 'UNSAT',
    };

    if (remarks[logValue]) {
      remarkCtrl?.setValue(remarks[logValue], { emitEvent: false });
      remarkCtrl?.disable({ emitEvent: false });
    }
  }

  buildForm() {
    this.bdcForm = this.fb.group({
      // Header Fields
      port: [''],
      boat_davit_crane: [''],
      class_of_ship: [''],
      ship: [{ value: '', disabled: false }],
      date_of_inspection: [''],
      place_of_conduct_of_trials: [''],
      occasion_for_conduct_of_trials: [''],
      place_of_conduct_trail: [''],
      authority_for_conduct_of_trials: [''],
      authority: ['', Validators.required],
      authority_date: ['', Validators.required],
      authority_doc: [''],
      make_checks: [''],
      type_checks: [''],
      year_of_manufacture: [''],
      year_of_manufacture_checks: [{ value: '', disabled: false }],
      manufacturer_name: [{ value: '', disabled: false }],

      // Row 1
      bdc_1_obs: [''],
      bdc_1_rem: [{ value: '', disabled: false }],

      // Row 4
      bdc_4_last: [''],
      bdc_4_due: [''],
      bdc_4_rem: [{ value: '', disabled: false }],

      // Row 5
      bdc_5_last: [''],
      bdc_5_due: [''],
      bdc_5_rem: [{ value: '', disabled: false }],

      // Row 6
      bdc_6_last: [''],
      bdc_6_due: [''],
      bdc_6_rem: [{ value: '', disabled: false }],

      // Row 7
      bdc_7_obs: [''],
      bdc_7_rem: [{ value: '', disabled: false }],
      bdc_7_obs_remark: [''],

      // Row 8
      bdc_8_last: [''],
      bdc_8_due: [''],
      bdc_8_rem: [{ value: '', disabled: false }],

      // Row 9
      bdc_9a_obs: [''],
      bdc_9a_obs_rem: [{ value: '', disabled: false }],
      bdc_9a_rem: [{ value: '', disabled: false }],
      bdc_9a_extra_rem: [{ value: '', disabled: false }],

      bdc_9b_obs: [''],

      bdc_9c_obs: [''],
      bdc_9c_rem: [{ value: '', disabled: false }],
      bdc_9a_remark2: [''], // New control for additional remarks for Row 9a
      other_observation: [''],
      bdc_9c_remark1: [''], // New control for additional remarks for Row 9c
      bdc_9c_remark2: [''], // New control for additional remarks for Row 9c
      bdc_9b_remark1: [''], // New control for additional remarks for Row 9b
      bdc_9b_remark2: [''], // New control for additional remarks for Row 9b

      bdc_9a_remark1: [''], // New control for additional remarks for Row 9a

      // Row 10
      bdc_10_obs: [''],
      bdc_10_rem: [{ value: '', disabled: false }],
      bdc_10_remark2: [''], // New control for additional remarks for Row 10
      bdc_10_remark1: [''], // New control for additional remarks for Row 10
      overall_remark: [''], // New control for overall remarks

      // Row 11
      bdc_11_obs: [''],
      bdc_11_rem: [{ value: '', disabled: false }],

      // Row 12
      bdc_12_check: [''],
      bdc_12_obs: [''],
      bdc_12_rem: [{ value: '', disabled: false }],

      // Row 13
      bdc_13_obs: [''],
      bdc_13_rem: [{ value: '', disabled: false }],

      // Row 14
      bdc_14_obs: [''],
      bdc_14_rem: [{ value: '', disabled: false }],
      deck_plating_corrosion: [''], // New control for additional remarks for Row 14
      deck_plating_pitting: [''], // New control for additional remarks for Row 14
      deck_plating_unpainted: [''], // New control for additional remarks for Row 14
      deck_plating_others: [''], // New control for additional remarks for Row 14
      deck_plating_corrosion_remark: [''], // New control for additional remarks for Row 14
      deck_plating_pitting_remark: [''], // New control for additional remarks for Row 14
      deck_plating_unpainted_remark: [''], // New control for additional remarks for Row 14
      deck_plating_others_remark: [''], // New control for additional remarks for Row 14
      // Row 15
      bdc_15_obs: [''],
      bdc_15_rem: [{ value: '', disabled: false }],

      // Row 16
      bdc_16_obs: [''],
      bdc_16_rem: [{ value: '', disabled: false }],
      bdc_16_remark: [''], // New control for additional remarks for Row 16

      // Row 17
      bdc_17_hoist_obs: [''],
      bdc_17_hoist_rem: [''],
      bdc_17_power_obs: [''],
      bdc_17_power_rem: [''],
      bdc_17_gravity_obs: [''],
      bdc_17_gravity_rem: [''],
      bdc_17_slew_obs: [''],
      bdc_17_slew_rem: [''],

      // Row 18
      bdc_18_obs: [''],
      bdc_18_rem: [{ value: '', disabled: false }],
      bdc_18_remark2: [''], // New control for additional remarks for Row 18
      bdc_18_remark1: [''], // New control for additional remarks for Row 18

      // Row 19
      bdc_19_obs: [''],
      bdc_19_rem: [{ value: '', disabled: false }],
      bdc_19_remark2: [''], // New control for additional remarks for Row 19
      bdc_19_remark1: [''], // New control for additional remarks for Row 19

      // Row 20
      bdc_20_obs: [''],
      bdc_20_rem: [{ value: '', disabled: false }],
      bdc_20_remark2: [''], // New control for additional remarks for Row 20
      bdc_20_remark1: [''], // New control for additional remarks for Row 20

      // Row 21
      bdc_21_obs: [''],
      bdc_21_rem: [{ value: '', disabled: false }],
      bdc_21_remark1: [''], // New control for additional remarks for Row 21
      bdc_21_remark2: [''], // New control for additional remarks for Row 21

      // Row 22
      bdc_22_obs: [''],
      bdc_22_rem: [{ value: '', disabled: false }],
      bdc_22_remark1: [''], // New control for additional remarks for Row 21
      bdc_22_remark2: [''],

      // Row 23
      bdc_23_obs: [''],
      bdc_23_rem: [{ value: '', disabled: false }],

      // Row 24
      bdc_24_obs: [''],
      bdc_24_rem: [{ value: '', disabled: false }],

      // Row 25
      bdc_25_check: [''],

      // Row 26
      bdc_26_obs: [''],
      bdc_26_dialog: [''],

      // Row 28
      bdc_28_obs_1: [''],
      bdc_28_rem_1: [''],
      bdc_28_obs_2: [''],
      bdc_28_batch: [''],

      // Row 29
      bdc_29_water: [''],
      bdc_29_viscosity: [''],
      bdc_29_base: [''],
      bdc_29_acid: [''],
      bdc_29_metal: [''],

      // Row 30-31
      bdc_30_check: [''],
      bdc_31_check: [''],

      // Row 32
      bdc_32_obs: [''],
      bdc_32_rem: [{ value: '', disabled: false }],

      // Row 33
      bdc_33_check: [''],

      // Row 34
      bdc_34_obs: [''],
      bdc_34_rem: [{ value: '', disabled: false }],

      // Row 35
      bdc_35_check: [''],

      // Row 36
      bdc_36_obs: [''],
      bdc_36_dialog: [''],
    });
  }

  buildPayload() {
    const formDataValues = this.bdcForm.getRawValue();
    const payload: any = {
      ...formDataValues,
      authority_doc: FileUrlUtil.getFileUrl(formDataValues.authority_doc?.id),
    };
    return payload;
  }

  handleFilesUploaded(files: UploadedFileItem[]): void {
    this.uploadedAuthorityFiles = files;
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

      // ship ka fallback value (agar equipment payload mein khaali ho)
      this.bdcForm.patchValue(
        { ship: trialRow.ship_name },
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
      console.error('Trial prefill failed (Boat Davit Crane)', e);
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
        'Failed to load Boat Davit Crane data for selected equipment',
        error,
      );
      this.toast.showError('Failed to load selected equipment data.');
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

    this.bdcForm.patchValue(
      {
        manufacturer_name: selectedEquipment?.manufacturer_name ?? '',
        model: selectedEquipment?.model ?? '',
      },
      { emitEvent: false },
    );
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    // flat check — koi bhi ek known bdc_* key top-level pe ho to already flat hai
    const isFlat =
      'bdc_1_obs' in jsonData ||
      'make_checks' in jsonData ||
      'ship' in jsonData;
    if (isFlat) return jsonData;

    // wrapped case — equipment name ke andar
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

  /** Tab switch pe form reset — ship field ko preserve karke,
   *  disabled/auto-computed remark fields ko bhi reset karta hai */
  private resetFormData(): void {
    const ship = this.bdcForm.get('ship')?.value;

    Object.keys(this.bdcForm.controls).forEach((key) => {
      const control = this.bdcForm.get(key);
      if (!control) return;
      control.reset('', { emitEvent: false });
    });

    this.bdcForm.patchValue({ ship }, { emitEvent: false });
  }

  /** Poore form ko equipment-specific payload se generic tarike se hydrate karta hai.
   *  Field count bohot zyada hone ki wajah se ek-ek field manually likhne ke bajaye,
   *  jo bhi key form mein control ke roop mein maujood hai, usko payload se patch kar diya jaata hai. */
  fillData(payload: any): void {
    if (!payload) return;

    Object.keys(payload).forEach((key) => {
      if (key === 'authority_doc') return; // ye alag se handle hoga

      const control = this.bdcForm.get(key);
      if (control) {
        control.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });

    // authority_doc — URL string ko file-upload component ke required object shape mein convert karo
    this.bdcForm
      .get('authority_doc')
      ?.setValue(this.buildFileUploadValue(payload.authority_doc), {
        emitEvent: false,
      });
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

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    if (type === 'clear') {
      // this.form.reset();
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
}
