import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { resolveCmmsApiUrl } from '../../../../../environments/api-url';
import {
  BulkSoundingItem,
  BulkSoundingSaveResponse,
  CalibrationCurveResponse,
  CalibrationLookupResponse,
  GraphSlotReassignPayload,
  GraphSlotReassignResponse,
  TankDashboardResponse,
  TankDetailQuery,
  TankDetailResponse,
  TanksByTypeResponse,
  UnassignedCategoriesResponse,
} from '../models/pol-status-dashboard.model';

@Injectable({
  providedIn: 'root',
})
export class PolStatusDashboardApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${resolveCmmsApiUrl()}api/v1/tank/`;

  getDashboard(): Observable<TankDashboardResponse> {
    return this.http.get<TankDashboardResponse>(`${this.baseUrl}dashboard/`);
  }

  getDetail(query: TankDetailQuery = {}): Observable<TankDetailResponse> {
    let params = new HttpParams();
    if (query.category_id != null) params = params.set('category_id', query.category_id);
    if (query.location) params = params.set('location', query.location);
    if (query.subtype) params = params.set('subtype', query.subtype);
    return this.http.get<TankDetailResponse>(`${this.baseUrl}detail/`, { params });
  }

  getTanksByType(typeId: number): Observable<TanksByTypeResponse> {
    return this.http.get<TanksByTypeResponse>(`${this.baseUrl}by-type/`, {
      params: { type_id: typeId },
    });
  }

  getCalibrationCurve(tankId: number): Observable<CalibrationCurveResponse> {
    return this.http.get<CalibrationCurveResponse>(`${this.baseUrl}calibrations/`, {
      params: { tank_id: tankId },
    });
  }

  getCalibrationLookup(tankId: number, mm: number): Observable<CalibrationLookupResponse> {
    return this.http.get<CalibrationLookupResponse>(`${this.baseUrl}calibrations/`, {
      params: { tank_id: tankId, mm },
    });
  }

  bulkSaveSounding(items: BulkSoundingItem[]): Observable<BulkSoundingSaveResponse> {
    return this.http.post<BulkSoundingSaveResponse>(`${this.baseUrl}sounding/bulk-save/`, {
      data: items,
    });
  }

  reassignGraphSlot(payload: GraphSlotReassignPayload): Observable<GraphSlotReassignResponse> {
    return this.http.post<GraphSlotReassignResponse>(`${this.baseUrl}graph-slots/reassign/`, payload);
  }

  getUnassignedCategories(): Observable<UnassignedCategoriesResponse> {
    return this.http.get<UnassignedCategoriesResponse>(`${this.baseUrl}categories/unassigned/`);
  }
}
