import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FormCardComponent } from '../../../../ui/form-card/form-card.component';
import { LoadingButtonComponent } from '../../../../ui/loading-button.component';
import { CalenderComponent } from '../../../../ui/calender.component';
import { InputComponent } from '../../../../ui/input.component';
import { SelectComponent } from '../../../../ui/select.component';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import { FormApiService } from '../../../../angulerFromconverting/form-api.service';
import {
  resolveTrialQueryParam,
  trialRowFromGetFormResponse,
} from '../../../../trial-route-prefill';
import { ApprovalWorkFlow } from '../../../../ui/approval-work-flow/approval-work-flow';

type DraftStatus = 'draft' | 'save';

@Component({
  selector: 'app-checks-of-iccp-system',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    LoadingButtonComponent,
    SelectComponent,
    CalenderComponent,
    ApprovalWorkFlow,
    InputComponent,
  ],
  templateUrl: './checks-of-iccp-system.html',
  styleUrl: './checks-of-iccp-system.css',
})
export class ChecksOfIccpSystem implements OnInit {
  readonly restartIcon = 'rotate-ccw';

  draftLoading = false;
  saveLoading = false;
  submitLoading = false;
  draftIcon = 'file-text';
  saveIcon = 'save';
  submitIcon = 'check-check';

  form!: FormGroup;
  loading = false;

  readonly reNumbers = [1, 2, 3, 4, 5, 6, 7, 8];
  readonly anodeNumbers = [1, 2, 3, 4, 5, 6, 7, 8];
  readonly firstFour = [1, 2, 3, 4];
  readonly secondFour = [5, 6, 7, 8];
  readonly acuRows = [1, 2, 3, 4, 5];
  showApprovalWorkflowPopup = false;
  isSubmitTime = false;

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

  classOfShipOptions: any[] = [];
  shipOptions: any[] = [];
  makeOptions: any[] = [];
  berthedOptions: any[] = [];
  shipAlongSideOptions: any[] = [];

  anodeTypeOptions: any[] = [];
  reTypeOptions: any[] = [];
  noOfAnodesOptions: any[] = [];
  noOfResOptions: any[] = [];
  portableReOptions: any[] = [];

  occasionOptions = [
    { label: 'OHMI', value: 'OHMI' },
    { label: 'Surprise Checks', value: 'Surprise Checks' },
    { label: 'Refit', value: 'Refit' },
    { label: 'Any other occasion', value: 'Any other occasion' },
  ];

  refitOptions = [
    { label: 'Ops-Docking', value: 'Ops-Docking' },
    { label: 'GRDD', value: 'GRDD' },
    { label: 'E-AMP', value: 'E-AMP' },
    { label: 'SR', value: 'SR' },
    { label: 'NR', value: 'NR' },
    { label: 'MR', value: 'MR' },
    { label: 'ERDD', value: 'ERDD' },
    { label: 'Others', value: 'Others' },
  ];

  locationOptions = [
    { label: 'Port', value: 'Port' },
    { label: 'Stbd', value: 'Stbd' },
    { label: 'Centre', value: 'Centre' },
  ];

  remarksOptions = [
    { label: 'Over protected', value: 'Over protected' },
    { label: 'Fully protected', value: 'Fully protected' },
    { label: 'Not protected', value: 'Not protected' },
  ];

  satUnsatOptions = [
    { label: 'SAT', value: 'SAT' },
    { label: 'UNSAT', value: 'UNSAT' },
  ];

  openClosedOptions = [
    { label: 'Closed', value: 'Closed' },
    { label: 'Open', value: 'Open' },
  ];

  constructor(
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private apiService: ApiService,
    private toastService: ToastService,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastService,
    public formApiService: FormApiService,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadDropdowns();
    this.loadTrialPrefillFromQuery();
  }

  private buildForm(): void {
    this.form = this.fb.group({
      class_of_ship: [''],
      ship: [{ value: '', disabled: true }],
      manufacturer_name: [{ value: '', disabled: true }],
      date_of_inspection: [''],
      occasion_of_inspection: [''],
      other_occasion: [''],
      type_of_refit: [''],
      docking_date: [''],
      berthed_at: [''],
      ship_alongside: [''],
      type_of_anodes: [''],
      no_of_anodes: [''],
      type_of_res: [''],
      no_of_res: [''],
      portable_re: [''],
      date_of_last_diving_checks: [''],
      date_of_last_cleaning_iccp: [''],
      calibration_details_portable_re: [''],

      check_1_frame_stn: [''],
      check_1_port_mv: [''],
      check_1_stbd_mv: [''],
      check_1_remarks: [''],

      check_3_frame_stn: [''],
      check_3_port_mv: [''],
      check_3_stbd_mv: [''],
      check_3_remarks: [''],

      check_10_anode_voltage: [''],
      check_11_cofferdam_status: [''],
      check_11_observation: [''],

      ...this.buildPresetControls(),
      ...this.buildCheckControls(),
    });
  }

  private buildPresetControls(): Record<string, any[]> {
    const controls: Record<string, any[]> = {};

    this.reNumbers.forEach((item) => {
      controls[`re${item}_location`] = [''];
      controls[`re${item}_fr_stn`] = [''];
      controls[`pre_re${item}_location`] = [''];
      controls[`pre_re${item}_fr_stn`] = [''];
    });

    this.anodeNumbers.forEach((item) => {
      controls[`anode${item}_location`] = [''];
      controls[`anode${item}_fr_stn`] = [''];
    });

    return controls;
  }

  private buildCheckControls(): Record<string, any[]> {
    const controls: Record<string, any[]> = {};

    this.reNumbers.forEach((item) => {
      controls[`check_2_re${item}`] = [''];
      controls[`check_4_terminal_hull_re${item}`] = [''];
      controls[`check_4_display_hull_re${item}`] = [''];
      controls[`check_5_re${item}`] = [''];
      controls[`check_10_hull_re${item}`] = [''];
    });

    this.anodeNumbers.forEach((item) => {
      controls[`check_4_terminal_voltage_a${item}`] = [''];
      controls[`check_4_terminal_current_a${item}`] = [''];
      controls[`check_4_display_voltage_a${item}`] = [''];
      controls[`check_4_display_current_a${item}`] = [''];
      controls[`check_6_a${item}`] = [''];
      controls[`check_9_a${item}`] = [''];
      controls[`check_10_current_a${item}`] = [''];
    });

    this.acuRows.forEach((row) => {
      controls[`check_7_row${row}_preset_potential`] = ['ANSC'];
      controls[`check_8_row${row}_preset_potential`] = ['ANSC'];

      this.anodeNumbers.forEach((item) => {
        controls[`check_7_row${row}_a${item}_amp`] = [''];
        controls[`check_7_row${row}_a${item}_voltage`] = [''];
        controls[`check_8_row${row}_a${item}_amp`] = [''];
        controls[`check_8_row${row}_a${item}_voltage`] = [''];
      });

      this.reNumbers.forEach((item) => {
        controls[`check_7_row${row}_re${item}`] = [''];
        controls[`check_8_row${row}_re${item}`] = [''];
      });
    });

    return controls;
  }

  private loadDropdowns(): void {
    this.loadOptions('master/ship-classes/', 'classOfShipOptions', []);
    this.loadOptions('master/ships/', 'shipOptions', []);
    // this.loadOptions('master/makes/', 'makeOptions', [
    //   // { label: 'Make 1', value: 'Make 1' },
    //   // { label: 'Make 2', value: 'Make 2' },
    // ]);
    // NEEDS TO BE CONFIRMES THE BERTHED OPTION
    // this.loadOptions('master/locations/', 'berthedOptions', []);

    this.anodeTypeOptions = [
      { label: 'Zinc', value: 'Zinc' },
      { label: 'Aluminium', value: 'Aluminium' },
      { label: 'Mixed', value: 'Mixed' },
    ];
    this.reTypeOptions = [
      { label: 'Ag/AgCl', value: 'Ag/AgCl' },
      { label: 'Portable RE', value: 'Portable RE' },
      { label: 'Fixed RE', value: 'Fixed RE' },
    ];
    this.noOfAnodesOptions = this.numberOptions(8);
    this.noOfResOptions = this.numberOptions(8);
    this.portableReOptions = [
      { label: 'Yes', value: 'Yes' },
      { label: 'No', value: 'No' },
    ];
  }

  private loadOptions(
    endpoint: string,
    target: keyof ChecksOfIccpSystem,
    fallback: any[],
  ): void {
    (this[target] as any) = fallback;
    this.apiService
      .getDropdownData(endpoint, { labelKey: 'name', valueKey: 'id' })
      .subscribe({
        next: (res: any[]) => {
          if (res?.length) {
            (this[target] as any) = res;
          }
        },
      });
  }

  private numberOptions(count: number): any[] {
    return Array.from({ length: count }, (_, index) => {
      const value = String(index + 1);
      return { label: value, value };
    });
  }

  clearForm(): void {
    this.form.reset();
    this.acuRows.forEach((row) => {
      this.form.patchValue({
        [`check_7_row${row}_preset_potential`]: 'ANSC',
        [`check_8_row${row}_preset_potential`]: 'ANSC',
      });
    });
  }

  handleSave(type: 'clear' | 'draft' | 'save' | 'submit') {
    // if (draftStatus === 'save' && !this.validateForm()) {
    //   return;
    // }
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

  validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError('Please fill all required fields correctly.');
      return false;
    }
    return true;
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

  private buildPayload(): any {
    const value = this.form.value;

    return {
      class_of_ship: value.class_of_ship,
      ship: value.ship,
      make: value.make,
      date_of_inspection: value.date_of_inspection,
      occasion_of_inspection: value.occasion_of_inspection,
      other_occasion: value.other_occasion,
      type_of_refit: value.type_of_refit,
      docking_date: value.docking_date,
      berthed_at: value.berthed_at,
      ship_alongside: value.ship_alongside,
      type_of_anodes: value.type_of_anodes,
      no_of_anodes: value.no_of_anodes,
      type_of_res: value.type_of_res,
      no_of_res: value.no_of_res,
      portable_re: value.portable_re,
      date_of_last_diving_checks: value.date_of_last_diving_checks,
      date_of_last_cleaning_iccp: value.date_of_last_cleaning_iccp,
      calibration_details_portable_re: value.calibration_details_portable_re,
      preset_potential_value_mv: {
        res: this.mapRe('re', value),
        anodes: this.mapAnodes('anode', value),
        pre_fed_res: this.mapRe('pre_re', value),
      },
      checks: {
        check_1: {
          frame_stn: value.check_1_frame_stn,
          port_mv: value.check_1_port_mv,
          stbd_mv: value.check_1_stbd_mv,
          remarks: value.check_1_remarks,
        },
        check_2: this.mapReValues('check_2_re', value),
        check_3: {
          frame_stn: value.check_3_frame_stn,
          port_mv: value.check_3_port_mv,
          stbd_mv: value.check_3_stbd_mv,
          remarks: value.check_3_remarks,
        },
        check_4: {
          terminal_reading: this.buildReadingPayload('check_4_terminal', value),
          display_reading: this.buildReadingPayload('check_4_display', value),
        },
        check_5: this.mapReValues('check_5_re', value),
        check_6: this.mapAnodeValues('check_6_a', value),
        check_7: {
          acu_no: 1,
          readings: this.buildAcuRows('check_7', value),
        },
        check_8: {
          acu_no: 1,
          readings: this.buildAcuRows('check_8', value),
        },
        check_9: this.mapAnodeValues('check_9_a', value),
        check_10: {
          hull_potential_mv: this.mapReValues('check_10_hull_re', value),
          anode_current_amps: this.mapAnodeValues('check_10_current_a', value),
          anode_voltage_v: value.check_10_anode_voltage,
        },
        check_11: {
          inspection_of_cofferdams: value.check_11_cofferdam_status,
          observation: value.check_11_observation,
        },
      },
    };
  }

  private mapRe(prefix: string, value: any): any {
    return this.reNumbers.reduce((acc: any, item) => {
      acc[`re${item}`] = {
        location: value[`${prefix}${item}_location`],
        fr_stn: value[`${prefix}${item}_fr_stn`],
      };
      return acc;
    }, {});
  }

  private mapAnodes(prefix: string, value: any): any {
    return this.anodeNumbers.reduce((acc: any, item) => {
      acc[`a${item}`] = {
        location: value[`${prefix}${item}_location`],
        fr_stn: value[`${prefix}${item}_fr_stn`],
      };
      return acc;
    }, {});
  }

  private mapReValues(prefix: string, value: any): any {
    return this.reNumbers.reduce((acc: any, item) => {
      acc[`re${item}`] = value[`${prefix}${item}`];
      return acc;
    }, {});
  }

  private mapAnodeValues(prefix: string, value: any): any {
    return this.anodeNumbers.reduce((acc: any, item) => {
      acc[`a${item}`] = value[`${prefix}${item}`];
      return acc;
    }, {});
  }

  private buildReadingPayload(prefix: string, value: any): any {
    return {
      hull_potential_mv: this.reNumbers.reduce((acc: any, item) => {
        acc[`re${item}`] = value[`${prefix}_hull_re${item}`];
        return acc;
      }, {}),
      anode_voltage_v: this.anodeNumbers.reduce((acc: any, item) => {
        acc[`a${item}`] = value[`${prefix}_voltage_a${item}`];
        return acc;
      }, {}),
      anode_current_amps: this.anodeNumbers.reduce((acc: any, item) => {
        acc[`a${item}`] = value[`${prefix}_current_a${item}`];
        return acc;
      }, {}),
    };
  }

  private buildAcuRows(prefix: string, value: any): any[] {
    return this.acuRows.map((row) => ({
      sr_no: row,
      preset_potential: value[`${prefix}_row${row}_preset_potential`],
      anode_current_amps: this.anodeNumbers.reduce((acc: any, item) => {
        acc[`a${item}`] = value[`${prefix}_row${row}_a${item}_amp`];
        return acc;
      }, {}),
      anode_voltage_v: this.anodeNumbers.reduce((acc: any, item) => {
        acc[`a${item}`] = value[`${prefix}_row${row}_a${item}_voltage`];
        return acc;
      }, {}),
      hull_potential_mv: this.reNumbers.reduce((acc: any, item) => {
        acc[`re${item}`] = value[`${prefix}_row${row}_re${item}`];
        return acc;
      }, {}),
    }));
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
      console.error('Trial prefill failed (Checks of ICCP System)', e);
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
      console.error('Failed to load ICCP data for selected equipment', error);
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

    this.form.patchValue(
      {
        manufacturer_name: selectedEquipment?.manufacturer_name ?? '',
        model: selectedEquipment?.model ?? '',
      },
      { emitEvent: false },
    );
  }

  private extractEquipmentPayload(jsonData: any, equipmentKey: string): any {
    if (!jsonData || typeof jsonData !== 'object') return null;

    // Ye payload custom nested shape mein hai: { checks, preset_potential_value_mv, ship, make, ... }
    const isFlat =
      'checks' in jsonData || 'preset_potential_value_mv' in jsonData;
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

  /** Tab switch pe form reset — ship field preserve karke, preset potential
   *  default value 'ANSC' bhi restore karta hai */
  private resetFormData(): void {
    const ship = this.form.get('ship')?.value;

    this.form.reset({}, { emitEvent: false });

    this.acuRows.forEach((row) => {
      this.form.patchValue(
        {
          [`check_7_row${row}_preset_potential`]: 'ANSC',
          [`check_8_row${row}_preset_potential`]: 'ANSC',
        },
        { emitEvent: false },
      );
    });

    this.form.patchValue({ ship }, { emitEvent: false });
  }

  /** Poore form ko custom-nested equipment payload se reverse-map karke hydrate
   *  karta hai. buildPayload() jo nested structure banata hai, ye method usko
   *  wapas flat form-control values mein todta hai. */
  fillData(payload: any): void {
    if (!payload) return;

    // ---- Top-level scalar fields ----
    const topLevelKeys = [
      'ship',
      'make',
      'date_of_inspection',
      'occasion_of_inspection',
      'other_occasion',
      'type_of_refit',
      'docking_date',
      'berthed_at',
      'ship_alongside',
      'type_of_anodes',
      'no_of_anodes',
      'type_of_res',
      'no_of_res',
      'portable_re',
      'date_of_last_diving_checks',
      'date_of_last_cleaning_iccp',
      'calibration_details_portable_re',
    ];

    topLevelKeys.forEach((key) => {
      if (key === 'ship') return;
      const control = this.form.get(key);
      if (control) {
        control.setValue(payload[key] ?? '', { emitEvent: false });
      }
    });

    this.form
      .get('ship')
      ?.setValue(payload.ship || this.form.get('ship')?.value || '', {
        emitEvent: false,
      });

    // ---- preset_potential_value_mv → re*_location, re*_fr_stn, anode*_location, anode*_fr_stn, pre_re*_* ----
    const preset = payload.preset_potential_value_mv || {};
    this.unmapRe('re', preset.res);
    this.unmapAnodes('anode', preset.anodes);
    this.unmapRe('pre_re', preset.pre_fed_res);

    // ---- checks.* → check_1_*, check_2_*, ... check_11_* ----
    const checks = payload.checks || {};

    if (checks.check_1) {
      this.form.patchValue(
        {
          check_1_frame_stn: checks.check_1.frame_stn ?? '',
          check_1_port_mv: checks.check_1.port_mv ?? '',
          check_1_stbd_mv: checks.check_1.stbd_mv ?? '',
          check_1_remarks: checks.check_1.remarks ?? '',
        },
        { emitEvent: false },
      );
    }

    this.unmapReValues('check_2_re', checks.check_2);

    if (checks.check_3) {
      this.form.patchValue(
        {
          check_3_frame_stn: checks.check_3.frame_stn ?? '',
          check_3_port_mv: checks.check_3.port_mv ?? '',
          check_3_stbd_mv: checks.check_3.stbd_mv ?? '',
          check_3_remarks: checks.check_3.remarks ?? '',
        },
        { emitEvent: false },
      );
    }

    if (checks.check_4) {
      this.unmapReadingPayload(
        'check_4_terminal',
        checks.check_4.terminal_reading,
      );
      this.unmapReadingPayload(
        'check_4_display',
        checks.check_4.display_reading,
      );
    }

    this.unmapReValues('check_5_re', checks.check_5);
    this.unmapAnodeValues('check_6_a', checks.check_6);

    if (checks.check_7?.readings) {
      this.unmapAcuRows('check_7', checks.check_7.readings);
    }
    if (checks.check_8?.readings) {
      this.unmapAcuRows('check_8', checks.check_8.readings);
    }

    this.unmapAnodeValues('check_9_a', checks.check_9);

    if (checks.check_10) {
      this.unmapReValues('check_10_hull_re', checks.check_10.hull_potential_mv);
      this.unmapAnodeValues(
        'check_10_current_a',
        checks.check_10.anode_current_amps,
      );
      this.form
        .get('check_10_anode_voltage')
        ?.setValue(checks.check_10.anode_voltage_v ?? '', { emitEvent: false });
    }

    if (checks.check_11) {
      this.form.patchValue(
        {
          check_11_cofferdam_status:
            checks.check_11.inspection_of_cofferdams ?? '',
          check_11_observation: checks.check_11.observation ?? '',
        },
        { emitEvent: false },
      );
    }
  }

  /** preset.res / preset.pre_fed_res → re{n}_location, re{n}_fr_stn (ya pre_re{n}_*) */
  private unmapRe(prefix: string, data: any): void {
    if (!data) return;
    this.reNumbers.forEach((item) => {
      const entry = data[`re${item}`];
      if (!entry) return;
      this.form.patchValue(
        {
          [`${prefix}${item}_location`]: entry.location ?? '',
          [`${prefix}${item}_fr_stn`]: entry.fr_stn ?? '',
        },
        { emitEvent: false },
      );
    });
  }

  /** preset.anodes → anode{n}_location, anode{n}_fr_stn */
  private unmapAnodes(prefix: string, data: any): void {
    if (!data) return;
    this.anodeNumbers.forEach((item) => {
      const entry = data[`a${item}`];
      if (!entry) return;
      this.form.patchValue(
        {
          [`${prefix}${item}_location`]: entry.location ?? '',
          [`${prefix}${item}_fr_stn`]: entry.fr_stn ?? '',
        },
        { emitEvent: false },
      );
    });
  }

  /** { re1: val, re2: val, ... } → check_{prefix}{n} controls */
  private unmapReValues(prefix: string, data: any): void {
    if (!data) return;
    this.reNumbers.forEach((item) => {
      this.form
        .get(`${prefix}${item}`)
        ?.setValue(data[`re${item}`] ?? '', { emitEvent: false });
    });
  }

  /** { a1: val, a2: val, ... } → check_{prefix}{n} controls */
  private unmapAnodeValues(prefix: string, data: any): void {
    if (!data) return;
    this.anodeNumbers.forEach((item) => {
      this.form
        .get(`${prefix}${item}`)
        ?.setValue(data[`a${item}`] ?? '', { emitEvent: false });
    });
  }

  /** check_4 ke terminal_reading / display_reading nested object ko flat controls mein todta hai */
  private unmapReadingPayload(prefix: string, data: any): void {
    if (!data) return;

    this.reNumbers.forEach((item) => {
      this.form
        .get(`${prefix}_hull_re${item}`)
        ?.setValue(data.hull_potential_mv?.[`re${item}`] ?? '', {
          emitEvent: false,
        });
    });

    this.anodeNumbers.forEach((item) => {
      this.form
        .get(`${prefix}_voltage_a${item}`)
        ?.setValue(data.anode_voltage_v?.[`a${item}`] ?? '', {
          emitEvent: false,
        });
      this.form
        .get(`${prefix}_current_a${item}`)
        ?.setValue(data.anode_current_amps?.[`a${item}`] ?? '', {
          emitEvent: false,
        });
    });
  }

  /** check_7 / check_8 ke readings array (5 rows) ko flat controls mein todta hai */
  private unmapAcuRows(prefix: string, readings: any[]): void {
    if (!Array.isArray(readings)) return;

    readings.forEach((reading) => {
      const row = reading.sr_no;
      if (!row) return;

      this.form
        .get(`${prefix}_row${row}_preset_potential`)
        ?.setValue(reading.preset_potential ?? 'ANSC', { emitEvent: false });

      this.anodeNumbers.forEach((item) => {
        this.form
          .get(`${prefix}_row${row}_a${item}_amp`)
          ?.setValue(reading.anode_current_amps?.[`a${item}`] ?? '', {
            emitEvent: false,
          });
        this.form
          .get(`${prefix}_row${row}_a${item}_voltage`)
          ?.setValue(reading.anode_voltage_v?.[`a${item}`] ?? '', {
            emitEvent: false,
          });
      });

      this.reNumbers.forEach((item) => {
        this.form
          .get(`${prefix}_row${row}_re${item}`)
          ?.setValue(reading.hull_potential_mv?.[`re${item}`] ?? '', {
            emitEvent: false,
          });
      });
    });
  }
}
