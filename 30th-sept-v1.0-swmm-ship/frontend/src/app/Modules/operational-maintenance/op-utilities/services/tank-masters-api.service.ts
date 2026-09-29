import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { resolveCmmsApiUrl } from '../../../../../environments/api-url';
import {
  CategoryDropdownResponse,
  CrudDeleteResponse,
  CrudListResponse,
  CrudWriteResponse,
  FluidApi,
  FluidTypeApi,
  TankCategoryApi,
  TankLocationApi,
  TankSoundingMasterApi,
  TankTypeDetailApi,
} from '../models/tank-masters.model';

@Injectable({
  providedIn: 'root',
})
export class TankMastersApiService {
  private readonly http = inject(HttpClient);
  private readonly tankBaseUrl = `${resolveCmmsApiUrl()}api/v1/tank/`;
  private readonly baseUrl = `${this.tankBaseUrl}crud/`;

  // Fluid/POL Types
  getFluidTypes(): Observable<CrudListResponse<FluidTypeApi>> {
    return this.http.get<CrudListResponse<FluidTypeApi>>(`${this.baseUrl}fluid-types/`);
  }
  createFluidType(payload: Partial<FluidTypeApi>): Observable<CrudWriteResponse<FluidTypeApi>> {
    return this.http.post<CrudWriteResponse<FluidTypeApi>>(`${this.baseUrl}fluid-types/`, payload);
  }
  deleteFluidType(id: number): Observable<CrudDeleteResponse> {
    return this.http.delete<CrudDeleteResponse>(`${this.baseUrl}fluid-types/${id}/`);
  }

  // Fluid/POL Names
  getFluids(): Observable<CrudListResponse<FluidApi>> {
    return this.http.get<CrudListResponse<FluidApi>>(`${this.baseUrl}fluids/`);
  }
  createFluid(payload: Partial<FluidApi>): Observable<CrudWriteResponse<FluidApi>> {
    return this.http.post<CrudWriteResponse<FluidApi>>(`${this.baseUrl}fluids/`, payload);
  }
  deleteFluid(id: number): Observable<CrudDeleteResponse> {
    return this.http.delete<CrudDeleteResponse>(`${this.baseUrl}fluids/${id}/`);
  }

  // Tank Categories
  getTankCategories(): Observable<CrudListResponse<TankCategoryApi>> {
    return this.http.get<CrudListResponse<TankCategoryApi>>(`${this.baseUrl}categories/`);
  }
  createTankCategory(payload: Partial<TankCategoryApi>): Observable<CrudWriteResponse<TankCategoryApi>> {
    return this.http.post<CrudWriteResponse<TankCategoryApi>>(`${this.baseUrl}categories/`, payload);
  }
  deleteTankCategory(id: number): Observable<CrudDeleteResponse> {
    return this.http.delete<CrudDeleteResponse>(`${this.baseUrl}categories/${id}/`);
  }

  // Tank Locations
  getTankLocations(): Observable<CrudListResponse<TankLocationApi>> {
    return this.http.get<CrudListResponse<TankLocationApi>>(`${this.baseUrl}locations/`);
  }
  createTankLocation(payload: Partial<TankLocationApi>): Observable<CrudWriteResponse<TankLocationApi>> {
    return this.http.post<CrudWriteResponse<TankLocationApi>>(`${this.baseUrl}locations/`, payload);
  }
  deleteTankLocation(id: number): Observable<CrudDeleteResponse> {
    return this.http.delete<CrudDeleteResponse>(`${this.baseUrl}locations/${id}/`);
  }

  // Tank Master — per-tank rows (Tank Type Details)
  getTankTypeDetails(): Observable<CrudListResponse<TankTypeDetailApi>> {
    return this.http.get<CrudListResponse<TankTypeDetailApi>>(`${this.baseUrl}type-details/`);
  }
  createTankTypeDetail(payload: Partial<TankTypeDetailApi>): Observable<CrudWriteResponse<TankTypeDetailApi>> {
    return this.http.post<CrudWriteResponse<TankTypeDetailApi>>(`${this.baseUrl}type-details/`, payload);
  }
  deleteTankTypeDetail(id: number): Observable<CrudDeleteResponse> {
    return this.http.delete<CrudDeleteResponse>(`${this.baseUrl}type-details/${id}/`);
  }

  // Tank Master — sounding-chart capacity rows (95%/100% per tank)
  getSoundingMasters(): Observable<CrudListResponse<TankSoundingMasterApi>> {
    return this.http.get<CrudListResponse<TankSoundingMasterApi>>(`${this.baseUrl}sounding-masters/`);
  }
  createSoundingMaster(payload: Partial<TankSoundingMasterApi>): Observable<CrudWriteResponse<TankSoundingMasterApi>> {
    return this.http.post<CrudWriteResponse<TankSoundingMasterApi>>(`${this.baseUrl}sounding-masters/`, payload);
  }
  updateSoundingMaster(id: number, payload: Partial<TankSoundingMasterApi>): Observable<CrudWriteResponse<TankSoundingMasterApi>> {
    return this.http.patch<CrudWriteResponse<TankSoundingMasterApi>>(`${this.baseUrl}sounding-masters/${id}/`, payload);
  }

  // Tank Master — category dropdown, pre-enriched with fluid/fluid-type/measuring-unit
  getCategoryDropdown(): Observable<CategoryDropdownResponse> {
    return this.http.get<CategoryDropdownResponse>(`${this.tankBaseUrl}category-dropdown/`);
  }
}
