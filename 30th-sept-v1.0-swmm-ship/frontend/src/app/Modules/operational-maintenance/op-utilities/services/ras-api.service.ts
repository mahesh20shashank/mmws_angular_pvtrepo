import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { resolveCmmsApiUrl } from '../../../../../environments/api-url';
import {
  FuellingDetailsPayload,
  FuellingHistoryResponse,
  FuellingSaveResponse,
  RasMonitorResponse,
} from '../models/ras.model';

@Injectable({
  providedIn: 'root',
})
export class RasApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${resolveCmmsApiUrl()}api/v1/tank/`;

  getFuellingHistory(): Observable<FuellingHistoryResponse> {
    return this.http.get<FuellingHistoryResponse>(`${this.baseUrl}fuelling/history/`);
  }

  saveFuelling(payload: FuellingDetailsPayload): Observable<FuellingSaveResponse> {
    return this.http.post<FuellingSaveResponse>(`${this.baseUrl}fuelling/save/`, payload);
  }

  getRasMonitor(id: number): Observable<RasMonitorResponse> {
    return this.http.get<RasMonitorResponse>(`${this.baseUrl}ras-monitor/${id}/`);
  }
}
