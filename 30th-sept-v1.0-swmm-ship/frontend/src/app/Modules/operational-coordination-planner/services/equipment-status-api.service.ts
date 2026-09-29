import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { resolveCmmsApiUrl } from '../../../../environments/api-url';

export interface EquipmentStatusItem {
  id: number;
  name: string;
  status: 'Operational' | 'Non-Operational';
}

export interface EquipmentStatusResponse {
  AER_equipment_list: EquipmentStatusItem[];
  FER_equipment_list: EquipmentStatusItem[];
  OMS_equipment_list: EquipmentStatusItem[];
  AMR_equipment_list: EquipmentStatusItem[];
}

@Injectable({
  providedIn: 'root',
})
export class EquipmentStatusApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${resolveCmmsApiUrl()}api/v1`;

  getEquipmentStatus(): Observable<EquipmentStatusResponse> {
    return this.http.get<EquipmentStatusResponse>(`${this.baseUrl}/equipment-status/`);
  }
}
