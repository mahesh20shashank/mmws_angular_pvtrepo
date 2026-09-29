import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom, Observable, Subject } from 'rxjs';
import { ApiService } from '../api.service';
import { ActivatedRoute } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class FormApiService {
  currentFormId: string | null = null;
  currentEquipmentNomenclature: any = null;
  currentFormName: string | null = null;
  context: any = {};
  urlPrefix = 'trials';

  private formSubmitSource = new Subject<void>();
  formSubmit$ = this.formSubmitSource.asObservable();

  private equipmentChangeSource = new Subject<any>();
  equipmentChange$ = this.equipmentChangeSource.asObservable();

  private liveFormDataSource = new BehaviorSubject<any | null>(null);
  liveFormData$ = this.liveFormDataSource.asObservable();
  liveFormData: any | null = null;
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  /** SEG / other trials without equipment use top-level payload instead of an equipment key. */
  private wrapFormPayload(payload: any): Record<string, unknown> {
    const nomenclature = this.resolveNomenclature(this.currentEquipmentNomenclature);
    if (!nomenclature) {
      return payload || {};
    }
    return { [nomenclature]: payload };
  }

  saveDraft(payload: any, id?: string | undefined): Observable<any> {
    const formId = id || this.currentFormId;
    const formPayload = {
      trial_number: formId,
      data: this.wrapFormPayload(payload),
    };

    this.formSubmitSource.next();
    return this.api.put(`/api/drafts/${this.urlPrefix}/`, formPayload);
  }

  submitForm(payload: any, id?: string): Observable<any> {
    const formId = id || this.currentFormId;
    const formPayload = {
      id: formId,
      json_data: this.wrapFormPayload(payload),
    };

    this.formSubmitSource.next();
    return this.api.post(`/api/data/${this.urlPrefix}/`, formPayload);
  }

  async getForm(id: string): Promise<any> {
    this.urlPrefix =
      (await firstValueFrom(this.route.queryParamMap)).get('type') || 'trials';

    if (!id) return {};

    const res: any = await firstValueFrom(
      this.api.get(`/api/data/${this.urlPrefix}/?uuid=${id}`)
    );

    const row = Array.isArray(res) ? res[0] : res;
    this.context = row ?? res;
    if(res?.json_data){
      return res?.json_data
    }
    const equipment = row?.equipment_details?.[0] || row?.system_details?.[0] || null;
    this.setCurrentEquipmentNomenclature(equipment);

    const nomenclature = this.resolveNomenclature(equipment);

    // if (!this.hasTrialJsonData(this.context)) {
    //   return this.fetchTrialDraftData(id, nomenclature);
    // }

    return this.getFormByEquipment(id, nomenclature);
  }

  async fetchTrialDraftData(
    trialId: string,
    nomenclature = '',
  ): Promise<Record<string, unknown> | null> {
    const equipmentQuery = nomenclature
      ? `&nomenclature=${encodeURIComponent(nomenclature)}`
      : '';

    const draft: any = await firstValueFrom(
      this.api.get(
        `/api/drafts/${this.urlPrefix}/?trial_number=${trialId}${equipmentQuery}`,
      ),
    );

    const data =
      draft?.json_data ??
      draft?.data ??
      draft?.data?.json_data

      if (data && typeof data === 'object' && !Array.isArray(data)) {
        if(data?.[nomenclature]) return data?.[nomenclature];

      return data ?? {};
    }

    return {} as Record<string, unknown>;
  }

  async getFormByEquipment(id: string, nomenclature = ''): Promise<any> {
    const equipmentQuery = nomenclature
      ? `&nomenclature=${encodeURIComponent(nomenclature)}`
      : '';

    if (nomenclature) {
      const details = this.context?.equipment_details || this.context?.system_details;
      const equipment = details?.find((item: any) => item?.nomenclature === nomenclature) ?? { nomenclature };
      this.setCurrentEquipmentNomenclature(equipment);
    }

    const systemNameQuery = this.buildSystemNameQuery();
    const res: any = await firstValueFrom(
      this.api.get(
        `/api/data/${this.urlPrefix}/json-data/?uuid=${id}${equipmentQuery}${systemNameQuery}`,
      ),
    );

    const row = Array.isArray(res) ? (res[0]?.data || res[0]?.json_data) : (res?.data || res?.json_data);

    const JsonData = row
      ? row
      : await this.fetchTrialDraftData(id, nomenclature);

    if(JsonData?.[nomenclature]){
      console.log(JsonData?.[nomenclature],'------------s--------------------------------------------')
      return JsonData?.[nomenclature]
    }
    return JsonData ?? {};
  }

  setCurrentForm(id: string | null, name: string) {
    const changed = this.currentFormId !== id || this.currentFormName !== name;
    this.currentFormId = id;
    this.currentFormName = name;
    if (changed) this.setLiveFormData(null);
  }

  setLiveFormData(data: any | null): void {
    this.liveFormData = data;
    this.liveFormDataSource.next(data);
  }

  setCurrentEquipmentNomenclature(equipmentNomenclature: any): void {
    const prevId = this.currentEquipmentNomenclature?.id;
    const nextId = equipmentNomenclature?.id;

    this.currentEquipmentNomenclature = equipmentNomenclature;

    if (nextId && nextId !== prevId) {
      this.equipmentChangeSource.next(equipmentNomenclature);
    }
  }

  public resolveNomenclature(equipment: any): string {
    if (!equipment) return '';
    if (typeof equipment === 'string') return equipment;
    return equipment.nomenclature ?? '';
  }



  private hasTrialJsonData(context: unknown): boolean {
    if (!context || typeof context !== 'object') return false;

    const raw = (context as Record<string, unknown>)['json_data'];
    if (raw == null) return false;

    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed || trimmed === 'null') return false;
      try {
        const parsed = JSON.parse(trimmed);
        return (
          parsed != null &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          Object.keys(parsed as object).length > 0
        );
      } catch {
        return false;
      }
    }

    if (typeof raw === 'object' && !Array.isArray(raw)) {
      return Object.keys(raw as object).length > 0;
    }

    return false;
  }

  /** SEG / catalogue forms: json-data expects `system_name` from trial context. */
  private buildSystemNameQuery(): string {
    const details = this.context?.system_details;
    if (!Array.isArray(details) || details.length === 0) return '';

    const name = details[0]?.nomenclature || details[0]?.name;
    if (!name) return '';

    return `&nomenclature=${encodeURIComponent(String(name))}`;
  }

  getFinalData(trial: string): Observable<any> {
    const equipmentId = this.currentEquipmentNomenclature?.equipment_id;
    return this.api.get('/api/data/final-observation/', {
      trial,
      equipment: equipmentId,
    });
  }

  /**
   * Return Accept / Reject API
   * POST /api/data/returns/accept/
   */
  acceptRejectReturn(payload: {
    return_id: number;
    editor_turn_id: number;
    accept: boolean;
    remarks: string;
  }): Observable<any> {
    return this.api.post('/api/data/returns/accept/', payload);
  }

  segGettransactionDetails(trial: string) {
    this.api.get('/api/data/trials/', { uuid: trial, }).subscribe((data: any) => {
      this.context = data;
    });
  }
}
