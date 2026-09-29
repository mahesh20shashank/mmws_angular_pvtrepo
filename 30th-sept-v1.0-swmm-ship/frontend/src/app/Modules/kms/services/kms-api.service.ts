import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { resolveCmmsApiUrl } from "../../../../environments/api-url";
import {
  KmsCategoryDto,
  KmsCertificateDto,
  KmsCertificatesListResponseDto,
  KmsCertificateTypeDto,
  KmsDashboardDto,
  KmsEquipmentCategoriesResponseDto,
  KmsEquipmentCategoryDto,
  KmsEquipmentDocumentDto,
  KmsEquipmentDocumentsResponseDto,
  KmsInMailResponseDto,
  KmsOutMailResponseDto,
  KmsSfdEquipmentDropdownsResponseDto,
  KmsSharedCertificatesResponseDto,
} from "../models/kms-api.models";

/** Dedicated API surface for the KMS module (`Modules/kms/`), backed by the `dms` Django app. */
@Injectable({
  providedIn: "root",
})
export class KmsApiService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${resolveCmmsApiUrl()}api/v1/documents/`;
  // The DMS `dms_equipment_category` list this module owns has nothing to do with SFD's real
  // equipment catalog — "Select Equipment from SFD" needs SFD's own reference data instead,
  // hence the different base path.
  private readonly sfdBaseUrl = `${resolveCmmsApiUrl()}api/v1/sfd/`;

  getDashboard(): Observable<KmsDashboardDto> {
    return this.http.get<KmsDashboardDto>(`${this.baseUrl}dashboard/`);
  }

  // --- Certificates (other / technical / correspondence / sharepoint) ---

  getCertificatesByType(certType: KmsCertificateTypeDto): Observable<KmsCertificatesListResponseDto> {
    return this.http.get<KmsCertificatesListResponseDto>(`${this.baseUrl}get/${certType}/`);
  }

  getSharedCertificatesByType(certType: KmsCertificateTypeDto): Observable<KmsSharedCertificatesResponseDto> {
    return this.http.get<KmsSharedCertificatesResponseDto>(`${this.baseUrl}get_shared/${certType}/`);
  }

  getCertificateDetail(id: number): Observable<KmsCertificateDto> {
    return this.http.get<KmsCertificateDto>(`${this.baseUrl}detail/${id}/`);
  }

  getCertificateAttachment(id: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}view/${id}/`, { responseType: "blob" });
  }

  addCertificate(payload: FormData): Observable<KmsCertificateDto> {
    return this.http.post<KmsCertificateDto>(`${this.baseUrl}add/`, payload);
  }

  deleteCertificate(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}delete/${id}/`);
  }

  shareCertificate(certId: number, userIds: number[]): Observable<KmsCertificateDto> {
    return this.http.post<KmsCertificateDto>(`${this.baseUrl}share_certificate/`, { cert_id: certId, user_ids: userIds });
  }

  getInMail(): Observable<KmsInMailResponseDto> {
    return this.http.get<KmsInMailResponseDto>(`${this.baseUrl}in_mail/`);
  }

  getOutMail(): Observable<KmsOutMailResponseDto> {
    return this.http.get<KmsOutMailResponseDto>(`${this.baseUrl}out_mail/`);
  }

  // --- Certificate categories (master list) ---

  getCategories(): Observable<KmsCategoryDto[]> {
    return this.http.get<KmsCategoryDto[]>(`${this.baseUrl}get_category/`);
  }

  createCategory(categoryName: string): Observable<KmsCategoryDto> {
    return this.http.post<KmsCategoryDto>(`${this.baseUrl}save_category/`, { category_name: categoryName });
  }

  updateCategory(id: number, categoryName: string): Observable<KmsCategoryDto> {
    return this.http.post<KmsCategoryDto>(`${this.baseUrl}update_category/`, { id, category_name: categoryName });
  }

  deleteCategory(id: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}delete_category/`, { id });
  }

  // --- Technical manuals: equipment categories + documents ---

  getEquipmentCategories(): Observable<KmsEquipmentCategoriesResponseDto> {
    return this.http.get<KmsEquipmentCategoriesResponseDto>(`${this.baseUrl}get_equipment_categories/`);
  }

  getSfdEquipmentOptions(): Observable<KmsSfdEquipmentDropdownsResponseDto> {
    return this.http.get<KmsSfdEquipmentDropdownsResponseDto>(`${this.sfdBaseUrl}add-sfd-equipement/dropdowns`);
  }

  addEquipmentCategory(equipmentName: string): Observable<KmsEquipmentCategoryDto> {
    return this.http.post<KmsEquipmentCategoryDto>(`${this.baseUrl}add_equipment_category/`, { equipment_name: equipmentName });
  }

  deleteEquipmentCategory(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}delete_equipment_category/${id}/`);
  }

  getEquipmentDocuments(): Observable<KmsEquipmentDocumentsResponseDto> {
    return this.http.get<KmsEquipmentDocumentsResponseDto>(`${this.baseUrl}get_equipment_documents/`);
  }

  addEquipmentDocument(payload: FormData): Observable<KmsEquipmentDocumentDto> {
    return this.http.post<KmsEquipmentDocumentDto>(`${this.baseUrl}add_equipment_document/`, payload);
  }

  deleteEquipmentDocument(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}delete_equipment_document/${id}/`);
  }

  /** Mirrors getCertificateAttachment — backend/dms/urls.py's "view_document/<id>/" route
   *  (equipment_document_stream), already implemented server-side, just never called from here. */
  getEquipmentDocumentAttachment(id: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}view_document/${id}/`, { responseType: "blob" });
  }
}
