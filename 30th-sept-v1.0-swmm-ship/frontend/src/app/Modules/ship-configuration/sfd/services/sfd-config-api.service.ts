import { HttpParams, HttpResponse } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { AppService } from "../../../../Core/services/app/app.service";
import { skipFeedback } from "../../../../Core/http/services/http-feedback";
import { DepartmentMasterResponse, EquipmentMasterResponse, ManufacturerResponse, ShipMaster, SupplierResponse, SystemMasterResponse } from "../../ship-configuration.model";
import {
  ApiResponse,
  Compartment,
  CompartmentResponse,
  ConvertEquipmentToSystemPayload,
  ConvertEquipmentToSystemResponse,
  ConvertSystemToEquipmentPayload,
  ConvertSystemToEquipmentResponse,
  CreateCompartmentPayload,
  CreateEquipmentMappingPayload,
  CreateEquipmentSystemMappingPayload,
  CreateLocationMappingPayload,
  CreateSubdepartmentPayload,
  EquipmentCompartmentDropdownResponse,
  EquipmentCompartmentMappingResponse,
  EquipmentDropdownResponse,
  EquipmentSystemDropdownResponse,
  EquipmentSystemMappingResponse,
  GetCompartmentsParams,
  GetEquipmentCompartmentMappingsParams,
  GetEquipmentSystemMappingsParams,
  GetMasterListParams,
  MappedEquipmentRaw,
  GetSfdEquipmentParams,
  GetSubDepartmentsParams,
  PaginationParams,
  SfdEquipmentResponse,
  SubDepartment,
  SubDepartmentResponse,
  SubDepartmentSummary,
  SystemListResponse,
  UpdateEquipmentSystemMappingPayload,
} from "../config/sfd-config.models";

function toHttpParams<T extends object>(params: T): HttpParams {
  let httpParams = new HttpParams();

  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      httpParams = httpParams.set(key, String(value));
    }
  });

  return httpParams;
}

/** API layer for the Ship Configuration "Configuration" tab — compartments and sub-departments. */
@Injectable({ providedIn: "root" })
export class SfdConfigApiService {
  private readonly appService = inject(AppService);
  private readonly mutationContext = () => skipFeedback({ loader: true, toast: false });

  getCompartments(params?: GetCompartmentsParams): Observable<CompartmentResponse> {
    if (!params) {
      return this.appService.get<CompartmentResponse>("api/v1/sfd/compartments/");
    }

    return this.appService.get<CompartmentResponse>("api/v1/sfd/compartments/", {
      params: toHttpParams(params),
    });
  }

  addCompartment(
    payload: CreateCompartmentPayload,
  ): Observable<HttpResponse<ApiResponse<Compartment>>> {
    return this.appService.post<ApiResponse<Compartment>>(
      "api/v1/sfd/compartments/",
      payload,
      { observe: "response", context: this.mutationContext() },
    );
  }

  updateCompartment(
    id: number,
    payload: CreateCompartmentPayload,
  ): Observable<HttpResponse<ApiResponse<Compartment>>> {
    return this.appService.put<ApiResponse<Compartment>>(
      `api/v1/sfd/compartments/${id}/`,
      payload,
      { observe: "response", context: this.mutationContext() },
    );
  }

  deleteCompartment(id: number): Observable<HttpResponse<unknown>> {
    return this.appService.delete(`api/v1/sfd/compartments/${id}/`, {
      observe: "response",
      context: this.mutationContext(),
    });
  }

  getSubDepartments(params?: GetSubDepartmentsParams): Observable<SubDepartmentResponse> {
    if (!params) {
      return this.appService.get<SubDepartmentResponse>("api/v1/sfd/sub-departments/");
    }

    return this.appService.get<SubDepartmentResponse>("api/v1/sfd/sub-departments/", {
      params: toHttpParams(params),
    });
  }

  /** Per-department {total, cmms, swmm, in_use} breakdown behind the summary strip above
   *  the Sub-Departments grid — same visibility scope the list itself uses. */
  getSubDepartmentSummary(): Observable<SubDepartmentSummary> {
    return this.appService.get<SubDepartmentSummary>("api/v1/sfd/sub-departments/summary/");
  }

  addSubDepartment(
    payload: CreateSubdepartmentPayload,
  ): Observable<HttpResponse<ApiResponse<SubDepartment>>> {
    return this.appService.post<ApiResponse<SubDepartment>>(
      "api/v1/sfd/sub-departments/",
      payload,
      { observe: "response", context: this.mutationContext() },
    );
  }

  updateSubDepartment(
    id: number,
    payload: CreateSubdepartmentPayload,
  ): Observable<HttpResponse<ApiResponse<SubDepartment>>> {
    return this.appService.put<ApiResponse<SubDepartment>>(
      `api/v1/sfd/sub-departments/${id}/`,
      payload,
      { observe: "response", context: this.mutationContext() },
    );
  }

  deleteSubdepartment(id: number): Observable<HttpResponse<unknown>> {
    return this.appService.delete(`api/v1/sfd/sub-departments/${id}/`, {
      observe: "response",
      context: this.mutationContext(),
    });
  }

  deleteLocationMapping(id: number): Observable<HttpResponse<unknown>>{
    return this.appService.delete(`api/v1/sfd/equipment-compartment-mappings/${id}/`, {
      observe: "response",
      context: this.mutationContext(),
    });

  }

  getManufacturers(params: PaginationParams = {}): Observable<ManufacturerResponse> {
    return this.appService.get<ManufacturerResponse>(
      "api/v1/master/manufacturer/",
      { params: toHttpParams(params) },
    );
  }


  getSuppliers(params: PaginationParams = {}): Observable<SupplierResponse> {
    return this.appService.get<SupplierResponse>(
      "api/v1/master/supplier/",
      { params: toHttpParams(params) },
    );
  }

  getEquipmentMaster(params: PaginationParams = {}): Observable<EquipmentMasterResponse> {
    return this.appService.get<EquipmentMasterResponse>(
      "api/v1/sfd/reference-equipment-master/",
      { params: toHttpParams(params) },
    );
  }


  getDepartmentMaster(params: PaginationParams = {}): Observable<DepartmentMasterResponse> {
    return this.appService.get<DepartmentMasterResponse>(
      "api/v1/sfd/reference-standard-department/",
      { params: toHttpParams(params) },
    );
  }

  getSystemMaster(params: PaginationParams = {}): Observable<SystemMasterResponse> {
    return this.appService.get<SystemMasterResponse>(
      "api/v1/sfd/reference-system-master/",
      { params: toHttpParams(params) },
    );
  }

  getShipMaster(): Observable<ShipMaster> {
    return this.appService.get<ShipMaster>(
      "api/v1/sfd/reference-ship-details/"
    );
  }


  addEquipmentSystemMapping(
    payload: CreateEquipmentSystemMappingPayload,
  ): Observable<HttpResponse<ApiResponse<unknown>>> {
    return this.appService.post<ApiResponse<unknown>>(
      "api/v1/sfd/equipment-system/map/",
      payload,
      {
        observe: "response",
        context: this.mutationContext(),
      },
    );
  }

  getEquipmentSystemMappings(
    params: GetEquipmentSystemMappingsParams = {}
  ): Observable<EquipmentSystemMappingResponse> {
    return this.appService.get<EquipmentSystemMappingResponse>(
      "api/v1/sfd/equipment-system-mappings/",
      {
        params: toHttpParams(params),
      }
    );
  }
  getMappedEquipmentList(): Observable<MappedEquipmentRaw[]> {
    return this.appService.get<MappedEquipmentRaw[]>(
      "api/v1/sfd/equipment-system/mapping-list/"
    );
  }

  updateEquipmentSystemMapping(
    id: string,
    payload: UpdateEquipmentSystemMappingPayload
  ) {
    return this.appService.patch(
      `api/v1/sfd/equipment-system-mappings/${id}/`,
      payload,
      {
        observe: 'response',
        context: this.mutationContext(),
      }
    );
  }


  deleteEquipmentSystemMapping(id: string): Observable<HttpResponse<unknown>> {
    return this.appService.delete(`api/v1/sfd/equipment-system-mappings/${id}/`, {
      observe: "response",
      context: this.mutationContext(),
    });
  }

  getEquipmentLocationDropdowns() {
    return this.appService.get<EquipmentCompartmentDropdownResponse>(
      'api/v1/sfd/equipment-compartment/dropdowns/'
    );
  }

  /** Options for the System-Equipment "unmapped" transfer list. Values are
   *  `universal_id_t_equipment_ship_detail` — the identifier the mapping/convert
   *  endpoints actually key on (NOT the `sfd.Equipment` catalog id). */
  getEquipmentSystemDropdown(): Observable<EquipmentSystemDropdownResponse> {
    return this.appService.get<EquipmentSystemDropdownResponse>(
      'api/v1/sfd/equipment-system/dropdowns/'
    );
  }

  addLocationMapping(
    payload: CreateLocationMappingPayload,
  ): Observable<HttpResponse<ApiResponse<unknown>>> {
    return this.appService.post<ApiResponse<unknown>>(
      'api/v1/sfd/equipment-compartment/map/',
      payload,
      {
        observe: 'response',
        context: this.mutationContext(),
      }
    );
  }

  /** Edit mode PATCHes the existing row instead of hitting the create-only
   *  equipment-compartment/map/ endpoint — that one never passes `instance` to its
   *  serializer, so its unique_together check always rejected the very row being edited
   *  (equipment+compartment already exists — as itself). Ported from Aug_15. */
  updateLocationMapping(
    id: number,
    payload: Partial<CreateLocationMappingPayload>,
  ): Observable<HttpResponse<ApiResponse<unknown>>> {
    return this.appService.patch<ApiResponse<unknown>>(
      `api/v1/sfd/equipment-compartment-mappings/${id}/`,
      payload,
      {
        observe: 'response',
        context: this.mutationContext(),
      }
    );
  }

  getShipFitDefinitions(
    params: GetSfdEquipmentParams = {},
  ): Observable<SfdEquipmentResponse> {
    return this.appService.get<SfdEquipmentResponse>(
      "api/v1/sfd/ship-fit-definitions/",
      {
        params: toHttpParams(params),
      },
    );
  }

  getEquipmentCompartmentMappings(
    params: GetEquipmentCompartmentMappingsParams = {}
  ): Observable<EquipmentCompartmentMappingResponse> {
    return this.appService.get<EquipmentCompartmentMappingResponse>(
      'api/v1/sfd/equipment-compartment-mappings/',
      {
        params: toHttpParams(params),
      }
    );
  }

  getEquipmentList(
    params: GetMasterListParams = {}
  ): Observable<EquipmentDropdownResponse> {
    return this.appService.get<EquipmentDropdownResponse>(
      'api/v1/master/equipment/',
      {
        params: toHttpParams(params),
      }
    );
  }

  getSystemList(
    params: GetMasterListParams = {}
  ): Observable<SystemListResponse> {
    return this.appService.get<SystemListResponse>(
      'api/v1/master/systems/',
      {
        params: toHttpParams(params),
      }
    );
  }

  convertSystemToEquipment(
    payload: ConvertSystemToEquipmentPayload
  ): Observable<ConvertSystemToEquipmentResponse> {
    return this.appService.post<ConvertSystemToEquipmentResponse>(
      'api/v1/sfd/convert-system-to-equipment/',
      payload,
      {
        context: this.mutationContext(),
      }
    );
  }

  convertEquipmentToSystem(
    payload: ConvertEquipmentToSystemPayload
  ) {
    return this.appService.post<ConvertEquipmentToSystemResponse>(
      `api/v1/sfd/equipment/convert-to-system/`,
      payload,
         {
        context: this.mutationContext(),
      }
    );
  }


  createEquipmentSystemMapping(
    payload: CreateEquipmentMappingPayload
  ): Observable<unknown> {
    return this.appService.post<unknown>(
      `api/v1/sfd/equipment-system/mapping/`,
      payload,
        {
        context: this.mutationContext(),
      }
    );
  }

  updateEquipmentSystem(
    equipmentId: string,
    payload: { system_id: number }
  ) {
    return this.appService.patch(
      `api/v1/sfd/equipment-system/update-equipment-system/${equipmentId}/`,
      payload,
      {
        observe: 'response',
        context: this.mutationContext(),
      }
    );
  }

  unmapEquipmentSystem(id: number | string) {
    return this.appService.patch(
      `api/v1/sfd/equipment-system/unmap-equipment-system/${id}/`,{},
      {
        observe: 'response',
        context: this.mutationContext(),
      }
    );
  }


}
