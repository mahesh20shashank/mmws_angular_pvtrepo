/**
 * DTOs for the KMS backend (`dms` Django app, mounted at `api/v1/documents/`).
 * Field names mirror the API response verbatim (snake_case, including the
 * upstream `recieved_from_unit` typo) so the shape stays a straight decode of
 * what the server sends — UI-friendly reshaping happens in `KmsStateService`
 * (via `kms-mapper.util.ts`).
 */

export type KmsCertificateTypeDto = "technical" | "other" | "correspondence" | "sharepoint";

export interface KmsCertificateDto {
  id: number;
  name: string | null;
  certificate_type: KmsCertificateTypeDto;
  certificate_subtype?: string | null;
  certificate_id?: string | null;
  issue_date: string;
  expiry_date?: string | null;
  place_of_issue?: string | null;
  remarks?: string | null;
  letter_description?: string | null;
  letter_received_on?: string | null;
  letter_date?: string | null;
  letter_ref_no?: string | null;
  recieved_from_unit?: string | null;
  replied?: string | null;
  addressed_to_unit?: string | null;
  attachment?: string | null;
  category?: string | null;
  equipment?: string | null;
  equipment_id?: string | null;
  user_department?: string | null;
  filenumber?: string | null;
  ship?: string | null;
  command?: string | null;
  outmail_category?: string | null;
  is_shared: boolean;
  shared_with: number[];
  /** Comes back as a number from most endpoints, a numeric string from `get_shared/<type>/`. */
  uploaded_by: number | string | null;
  /** Pre-formatted "| Rank | Name | PN" display string — only present on the `get/<type>/` /
   *  `get_shared/<type>/` list endpoints, not on `detail/<id>/`. */
  uploaded_by_name?: string;
  shared_on?: string | null;
  expired: boolean;
}

/** `GET get_shared/<cert_type>/` (list_shared_by_type) returns the same shape as
 *  `GET get/<cert_type>/`, plus `status` marking whether the viewer owns the row. */
export type KmsSharedCertificateRowDto = KmsCertificateDto & { status: "uploaded" | "shared" };

/** `GET get/<cert_type>/` (list_by_type) — wrapped in an envelope, not a bare array. */
export interface KmsCertificatesListResponseDto {
  certificates: KmsCertificateDto[];
}

export interface KmsSharedCertificatesResponseDto {
  success: boolean;
  certificates: KmsSharedCertificateRowDto[];
}

export interface KmsInMailResponseDto {
  certificates: KmsCertificateDto[];
  years: number[];
}

export interface KmsOutMailResponseDto {
  certificates: KmsCertificateDto[];
  years: number[];
  filenumbers: string[];
}

export interface KmsCategoryDto {
  id: number;
  category_name: string;
  is_system: boolean;
  date: string;
}

export interface KmsEquipmentCategoryDto {
  id: number;
  equipment_name: string;
  created_at: string;
}

/** `GET get_equipment_categories/` — wrapped in an envelope, not a bare array. */
export interface KmsEquipmentCategoriesResponseDto {
  success: boolean;
  equipments: KmsEquipmentCategoryDto[];
}

/** Shape confirmed against `AddSFDEquipementAPIView.get()` (`sfd/source_contract.py`) — its
 * `equipment_name` list is `{universal_id_m_equipment, equipment_name}` pairs, NOT `{value,
 * label}` (that shape belongs to a different helper, `_get_equipment_names()`, used elsewhere
 * for the Reports filter dropdown — easy to confuse since both are named "equipment_name"). */
export interface KmsSfdEquipmentOptionDto {
  universal_id_m_equipment: string;
  equipment_name: string;
}

/** `GET api/v1/sfd/add-sfd-equipement/dropdowns` — only `equipment_name` is used here (the
 * SFD Add form's own reference-data payload has ~12 other dropdown lists in the same
 * response, irrelevant to this module). Names are deduplicated/sorted server-side, already
 * scoped to equipment actually fitted on this ship. */
export interface KmsSfdEquipmentDropdownsResponseDto {
  equipment_name: KmsSfdEquipmentOptionDto[];
}

export interface KmsEquipmentDocumentDto {
  id: number;
  document_name: string;
  document_type: string;
  attachment: string | null;
  uploaded_date: string;
  /** Server resolves the equipment name directly here — there's no FK id on this endpoint's rows. */
  equipment_name: string;
}

/** `GET get_equipment_documents/` — wrapped in an envelope, not a bare array. */
export interface KmsEquipmentDocumentsResponseDto {
  success: boolean;
  documents: KmsEquipmentDocumentDto[];
}

export interface KmsDashboardCertCategoryDto {
  category: string;
  count: number;
}

export interface KmsDashboardEquipmentDto {
  equipment: string;
  count: number;
}

/** One row per month; certificate-type/subtype keys are added dynamically by the backend. */
export interface KmsDashboardMonthlyBucketDto {
  month: string;
  [key: string]: string | number;
}

export interface KmsDashboardCorrespondenceRowDto {
  id: number;
  name: string;
  certificate_type: string;
  certificate_subtype: string;
  certificate_id: string;
  issue_date: string;
  expiry_date: string;
  place_of_issue: string;
  remarks: string;
  letter_ref_no: string;
  letter_date: string;
  recieved_from_unit: string;
  addressed_to_unit: string;
  replied: string;
  month: string;
}

export interface KmsDashboardDto {
  cert_category_data: KmsDashboardCertCategoryDto[];
  chart_data_type: KmsDashboardMonthlyBucketDto[];
  chart_data_subtype: KmsDashboardMonthlyBucketDto[];
  cert_types: string[];
  subtypes: string[];
  count_technicals: number;
  count_certificates: number;
  count_correspondence: number;
  expiring_count: number;
  replied_count: number;
  not_replied_count: number;
  equipment_data: KmsDashboardEquipmentDto[];
  certificates_list: KmsDashboardCorrespondenceRowDto[];
}
