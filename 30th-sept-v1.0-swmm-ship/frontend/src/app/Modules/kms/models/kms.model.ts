export type CertificateType = "technical" | "other" | "correspondence" | "sharepoint";
export type CorrespondenceSubtype = "inmail" | "outmail";
export type OutmailCategory = "Independent Outmail" | "Reply To In-mail";

export interface Certificate {
  id: number;
  name: string;
  certificateType: CertificateType;
  certificateSubtype?: CorrespondenceSubtype | string;
  certificateId?: string;
  issueDate: string;
  expiryDate?: string;
  placeOfIssue?: string;
  remarks?: string;
  attachmentName?: string;
  category?: string;
  equipment?: string;
  uploadedById: number;
  uploadedByName: string;
  isShared: boolean;
  sharedOn?: string;
  sharedWithIds?: number[];
  /** Sharepoint-only: true when the viewer uploaded this doc, false when it was shared with them. Server-resolved (`list_shared_by_type`). */
  isOwnedByViewer?: boolean;
  // correspondence-only fields
  letterDescription?: string;
  letterDate?: string;
  letterReceivedOn?: string;
  letterRefNo?: string;
  receivedFromUnit?: string;
  repliedRequired?: "Yes" | "No";
  addressedToUnit?: string;
  fileNumber?: string;
  ship?: string;
  command?: string;
  outmailCategory?: OutmailCategory | string;
  // expiry status flags (computed server-side in Django; kept as plain fields here)
  expired?: boolean;
  expiringSoon?: boolean;
  expiringVerySoon?: boolean;
  expiringUrgent?: boolean;
}

export interface EquipmentCategory {
  id: number;
  equipmentName: string;
  createdByName: string;
  createdAt: string;
  documentCount: number;
}

export interface EquipmentDocument {
  id: number;
  equipmentId: number;
  equipmentName: string;
  documentName: string;
  documentType: "TDOI" | "TD" | "OI" | "Other" | string;
  attachmentName: string;
  uploadedDate: string;
}

export interface CertificateCategory {
  id: number;
  categoryName: string;
  isSystem: boolean;
}

export interface Personnel {
  id: number;
  rank: string;
  firstName: string;
  lastName: string;
  personalNumber: string;
  department: string;
}

export interface DashboardStat {
  title: string;
  value: number;
  iconName: string;
  iconBg: string;
  iconColor: string;
  route: string;
}
