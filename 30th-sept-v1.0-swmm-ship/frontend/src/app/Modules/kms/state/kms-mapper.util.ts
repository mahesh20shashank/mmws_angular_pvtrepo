import {
  Certificate,
  CertificateCategory,
  EquipmentCategory,
  EquipmentDocument,
} from "../models/kms.model";
import {
  KmsCategoryDto,
  KmsCertificateDto,
  KmsEquipmentCategoryDto,
  KmsEquipmentDocumentDto,
  KmsSharedCertificateRowDto,
} from "../models/kms-api.models";
import { computeExpiryFlags } from "../shared/kms-expiry.util";

/** Backend `attachment` fields are file URLs; the UI only ever shows the file name. */
export function fileNameFromUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const clean = url.split("?")[0] ?? url;
  return clean.split("/").pop() || undefined;
}

export function mapCertificate(dto: KmsCertificateDto): Certificate {
  return {
    id: dto.id,
    name: dto.name ?? "",
    certificateType: dto.certificate_type,
    certificateSubtype: dto.certificate_subtype ?? undefined,
    certificateId: dto.certificate_id ?? undefined,
    issueDate: dto.issue_date,
    expiryDate: dto.expiry_date ?? undefined,
    placeOfIssue: dto.place_of_issue ?? undefined,
    remarks: dto.remarks ?? undefined,
    attachmentName: fileNameFromUrl(dto.attachment),
    category: dto.category ?? undefined,
    equipment: dto.equipment ?? undefined,
    uploadedById: Number(dto.uploaded_by) || 0,
    uploadedByName: dto.uploaded_by_name ?? "",
    isShared: dto.is_shared,
    sharedOn: dto.shared_on ?? undefined,
    sharedWithIds: dto.shared_with,
    letterDescription: dto.letter_description ?? undefined,
    letterDate: dto.letter_date ?? undefined,
    letterReceivedOn: dto.letter_received_on ?? undefined,
    letterRefNo: dto.letter_ref_no ?? undefined,
    receivedFromUnit: dto.recieved_from_unit ?? undefined,
    repliedRequired: dto.replied === "Yes" || dto.replied === "No" ? dto.replied : undefined,
    addressedToUnit: dto.addressed_to_unit ?? undefined,
    fileNumber: dto.filenumber ?? undefined,
    ship: dto.ship ?? undefined,
    command: dto.command ?? undefined,
    outmailCategory: dto.outmail_category ?? undefined,
    // The `get/<type>/` / `get_shared/<type>/` list endpoints only send `expired`, not the
    // `expiring_soon`/`expiring_very_soon`/`expiring_urgent` tiers `detail/<id>/` sends — compute
    // all four client-side from `expiry_date` instead, so filtering/status stay consistent
    // regardless of which endpoint's response is behind a given Certificate.
    ...computeExpiryFlags(dto.expiry_date ?? undefined),
  };
}

/** Rows from `GET get_shared/<cert_type>/` — same shape as a regular certificate, plus `status`
 *  marking whether the viewer owns the row (vs. it having been shared with them). */
export function mapSharedCertificateRow(row: KmsSharedCertificateRowDto): Certificate {
  return {
    ...mapCertificate(row),
    isOwnedByViewer: row.status === "uploaded",
  };
}

export function mapCategory(dto: KmsCategoryDto): CertificateCategory {
  return {
    id: dto.id,
    categoryName: dto.category_name,
    isSystem: dto.is_system,
  };
}

export function mapEquipmentCategory(dto: KmsEquipmentCategoryDto, documentCount = 0): EquipmentCategory {
  return {
    id: dto.id,
    equipmentName: dto.equipment_name,
    createdByName: "",
    createdAt: dto.created_at,
    documentCount,
  };
}

/** `equipmentId` isn't on this endpoint's rows (only `equipment_name` is) — callers resolve it by
 *  matching `equipment_name` against the loaded equipment categories (unique by name in the DB). */
export function mapEquipmentDocument(dto: KmsEquipmentDocumentDto, equipmentId: number): EquipmentDocument {
  return {
    id: dto.id,
    equipmentId,
    equipmentName: dto.equipment_name,
    documentName: dto.document_name,
    documentType: dto.document_type,
    attachmentName: fileNameFromUrl(dto.attachment) ?? "",
    uploadedDate: dto.uploaded_date,
  };
}

/** Builds multipart form data for create/update calls that accept an optional file attachment. */
export function toFormData(fields: Record<string, string | number | boolean | null | undefined>, file?: File | null): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === "") continue;
    formData.append(key, String(value));
  }
  if (file) {
    formData.append("attachment", file);
  }
  return formData;
}
