import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
// import { ApiService } from 'app/services/api.service';
import { FormControl, FormGroup } from '@angular/forms';
// import { FormApiService } from 'app/angulerFromconverting/form-api.service';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { advanceOilPropertiesColumns, basicOilPropertiesColumns, coolentTest, coolentTestColumns } from './ePol';
import { FormCardComponent } from '../../ui/form-card/form-card.component';
import { ApiService } from '../../api.service';
import { FormApiService } from '../../angulerFromconverting/form-api.service';
import { SelectComponent } from '../../ui/select.component';
import { CalenderComponent } from '../../ui/calender.component';
import { RadioGroupComponent } from '../../ui/radio-group/radio-group.component';
import { InputComponent } from '../../ui/input.component';
import { FileUploadComponent } from '../../ui/file-upload/file-upload.component';
import { ReusableInputTableComponent } from '../../ui/reusable-input-table/reusable-input-table.component';
import { ReviewTableComponent } from '../../ui/final-remark-observation/review-table.component';
import { LoadingButtonComponent } from '../../ui/loading-button.component';

@Component({
  selector: 'app-e-pol',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardComponent,
    SelectComponent,
    CalenderComponent,
    RadioGroupComponent,
    InputComponent,
    FileUploadComponent,
    ReusableInputTableComponent,
    ReviewTableComponent,
    LoadingButtonComponent,
  ],
  templateUrl: './e-pol.html',
})
export class EPol implements OnInit {
  @ViewChild('formCard') formCard!: FormCardComponent;
  ePol = {
    basicOilPropertiesColumns,
    advanceOilPropertiesColumns,
    coolentTestColumns,
    basicOilProperties: [] as any[],
    advanceOilProperties: [] as any[],
    coolentTest: [] as any[],
  };

  isDTTT = false;
  draftLoading = false;
  submitLoading = false;
  equipmentOptions: any[] = [];
  selectedEquipment: any = null;
  completedEquipmentList: any[] = [];

  equipmentStatusOptions = [
    { label: 'OPS', value: 'OPS' },
    { label: 'Non Ops', value: 'Non Ops' },
  ];
  oilTypeOptions = [
    { label: 'Lub Oil', value: 1 },
    { label: 'Hydraulic Oil', value: 2 },
  ];
  returnTypeOptions = [
    { label: 'Monthly', value: 'Monthly' },
    { label: 'Quaterly', value: 'Quaterly' },
  ];

  form: FormGroup = new FormGroup({
    equipment: new FormControl(''),
    samplingDate: new FormControl(''),
    equipmentStatus: new FormControl(''),
    oilType: new FormControl(''),
    returnType: new FormControl('Monthly'),
    typeOfLubricant: new FormControl(''),
    runningHrsAfterMajorOverhaul: new FormControl(''),
    hrsSinceLastRoutineOilChange: new FormControl(''),
    qtyOfFreshOilAdded: new FormControl(''),
    uploadFile: new FormControl(''),
  });

  trialId = '';

  constructor(
    private apiService: ApiService,
    private cdr: ChangeDetectorRef,
    public formApiService: FormApiService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.formApiService.urlPrefix = 'returns';
    this.route.queryParams.subscribe((params: any) => {
      this.trialId = params['trial'];
      if (!this.trialId) return;
      this.geteEpoldata();
    });
  }

  getEquipmentOptions(): void {
    this.apiService.get(`api/data/returns/equipment-oil-candidates/?uuid=${this.trialId}`).subscribe((res: any) => {
      const completedList = Array.isArray(this.completedEquipmentList) ? this.completedEquipmentList : [];
      const completedIds = new Set(
        completedList
          .map((item: any) => item?.equipmentId)
          .filter((id: any) => id != null),
      );
      this.equipmentOptions = (res?.data ?? []).filter(
        (item: any) => item.equipment_id != null && !completedIds.has(item.equipment_id),
      );
      this.cdr.markForCheck();
    });
  } 
  async geteEpoldata(): Promise<void> {
    try {
      const res: any = await this.formApiService.getForm(this.trialId);
      const formData = res?.json_data ?? res;
      console.log('agsftyzsavzga zavzahs ytvashg ayxvahvx',formData)
      this.completedEquipmentList = Array.isArray(formData) ? formData : [];
    } catch {
      this.completedEquipmentList = [];
    }
    this.getEquipmentOptions();
    this.cdr.markForCheck();
  }

  get completionPercent(): number {
    const total = this.completedEquipmentList.length + this.equipmentOptions.length;
    return total ? (this.completedEquipmentList.length / total) * 100 : 0;
  }

  private sameId(left: unknown, right: unknown): boolean {
    return left != null && right != null && String(left) === String(right);
  }

  setData(data: any): void {
    const mapProps = (list: any[] = []) =>
      list.map((p, i) => ({
        sr_no: i + 1,
        test: p.test ?? '',
        method: p.method ?? '',
        unit: p.unit ?? '',
        range: p.acceptable_range ?? p.range ?? '',
        sample_oil: p.sample_oil ?? '',
        fresh_oil: p.fresh_oil ?? '',
        id: p.id ?? '',
      }));
      if(data?.coolentTest){
        this.ePol.coolentTest = mapProps(data?.coolentTest);
        this.isDTTT = true;
      }
    this.ePol.basicOilProperties = mapProps(data?.oil_properties_basic);
    this.ePol.advanceOilProperties = mapProps(data?.oil_properties_advance);
    this.cdr.markForCheck();
  }

  onEquipmentChange(event: any): void {
    const equipmentId =
      typeof event === 'object'
        ? event?.equipment_id ?? event?.equipmentId ?? event?.value ?? event?.id
        : event;
    const saved = this.completedEquipmentList.find((item) =>
      this.sameId(item?.equipmentId ?? item?.equipment_id, equipmentId),
    );
    if (saved) {
      this.onEquipmentClick(saved);
      return;
    }

    this.selectedEquipment = this.equipmentOptions.find((o) =>
      this.sameId(o?.equipment_id, equipmentId),
    );
    if (!this.selectedEquipment) return;

    const mapping = this.selectedEquipment?.data?.[0];
    this.form.patchValue({
      equipment: this.selectedEquipment.equipment_id,
      oilType: mapping?.oil_type_mapping,
      typeOfLubricant: mapping?.oil_data?.oil_name ?? '',
    });
    this.setData(mapping?.oil_data);
  }

  onEquipmentClick(item: any): void {
    this.selectedEquipment = {
      equipment_id: item.equipmentId,
      equipment_name: item.equipmentName,
      equipment_nomenclature: item.equipmentNomenclature,
    };
    this.form.patchValue(item.formValue);
    this.ePol.basicOilProperties = [...item.basicOilProperties];
    this.ePol.advanceOilProperties = [...item.advanceOilProperties];
    this.ePol.coolentTest = [...item.coolentTest];
    this.cdr.markForCheck();
  }

  async handleSave(type: string): Promise<void> {
    const equipmentId = this.form.get('equipment')?.value;
    if (!equipmentId || !this.trialId) {
      // this.submitLoading = true;
        this.formCard.shouldShowUserPopup=true;
        this.formCard.isSubmitTimes=true;
        await firstValueFrom(this.formApiService.submitForm(this.completedEquipmentList, this.trialId));
        return;
    }

    const equipment =
      this.selectedEquipment ??
      this.equipmentOptions.find((o) => o.equipment_id == equipmentId);

    const entry = {
      equipmentName: equipment?.equipment_name ?? equipment?.equipmentName ?? '',
      equipmentId: equipment?.equipment_id ?? equipment?.equipmentId ?? equipmentId,
      equipmentNomenclature: equipment?.equipment_nomenclature ?? equipment?.equipmentNomenclature ?? '',
      formValue: { ...this.form.getRawValue() },
      basicOilProperties: [...this.ePol.basicOilProperties],
      advanceOilProperties: [...this.ePol.advanceOilProperties],
      coolentTest: [...this.ePol.coolentTest],
    };

    const idx = this.completedEquipmentList.findIndex((i) => i.equipmentId == equipmentId);
    idx >= 0 ? (this.completedEquipmentList[idx] = entry) : this.completedEquipmentList.push(entry);

    
    
    try {
      if (type === 'draft') {
        this.draftLoading = true;
        await firstValueFrom(this.formApiService.saveDraft(this.completedEquipmentList, this.trialId));
      } else if (type === 'save') {
        this.submitLoading = true;
        this.formCard.shouldShowUserPopup=true;
        this.formCard.isSubmitTimes=true;

        await firstValueFrom(this.formApiService.submitForm(this.completedEquipmentList, this.trialId));
      }

      this.equipmentOptions = this.equipmentOptions.filter((o) => o.equipment_id != equipmentId);
      this.resetForm();
    } catch (error) {
      console.error('E-POL save failed', error);
    } finally {
      this.draftLoading = false;
      this.submitLoading = false;
      this.cdr.markForCheck();
    }
  }
  resetForm(): void {
    this.selectedEquipment = null;
    this.form.reset({ returnType: 'Monthly' ,uploadFile: ''});
    this.ePol.basicOilProperties = [];
    this.ePol.advanceOilProperties = [];
    this.ePol.coolentTest = [...coolentTest];
    this.cdr.markForCheck();
  }
}
