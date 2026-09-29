import { Injectable, WritableSignal, computed, inject, signal } from "@angular/core";
import { firstValueFrom, Observable } from "rxjs";

import { NotificationService } from "../../../Core/services/notification/notification.service";
import { BarDatum } from "../../../shared/components/bar-chart/bar-chart";
import { LineSeries } from "../../../shared/components/line-chart/line-chart";
import { KmsCertificateTypeDto, KmsDashboardCorrespondenceRowDto, KmsDashboardDto, KmsEquipmentCategoryDto, KmsEquipmentDocumentDto, KmsSfdEquipmentOptionDto } from "../models/kms-api.models";
import { Certificate, CertificateCategory, DashboardStat, EquipmentCategory, EquipmentDocument } from "../models/kms.model";
import { KmsApiService } from "../services/kms-api.service";
import { mapCategory, mapCertificate, mapEquipmentCategory, mapEquipmentDocument, mapSharedCertificateRow } from "./kms-mapper.util";

const CORRESPONDENCE_MONTHS_SHOWN = 12;

/**
 * Shared state for the whole KMS module. Owns API access via `KmsApiService`
 * and reshapes raw `dms` responses into view-ready signals so every KMS page
 * (dashboard, certificates, technical, in-mail, out-mail, sharepoint,
 * category-master) reads pre-mapped data instead of re-deriving it per component.
 *
 * List loads (GET) track their own loading/error signals and toast on failure —
 * the HTTP interceptors don't cover GET. Mutations (POST/PUT/DELETE) don't: the
 * app's `loaderInterceptor`/`feedbackInterceptor` already show the full-screen
 * loader and success/error toast for every mutating call automatically.
 */
@Injectable({ providedIn: "root" })
export class KmsStateService {
  private readonly api = inject(KmsApiService);
  private readonly notification = inject(NotificationService);

  private async load<T>(loading: WritableSignal<boolean>, error: WritableSignal<string | null>, source: Observable<T>, apply: (value: T) => void, message: string): Promise<void> {
    loading.set(true);
    error.set(null);
    try {
      apply(await firstValueFrom(source));
    } catch {
      error.set(message);
      this.notification.error(message);
    } finally {
      loading.set(false);
    }
  }

  private async mutate(source: Observable<unknown>): Promise<boolean> {
    try {
      await firstValueFrom(source);
      return true;
    } catch {
      return false;
    }
  }

  // --- Dashboard ---

  readonly dashboard = signal<KmsDashboardDto | null>(null);
  readonly dashboardLoading = signal(false);
  readonly dashboardError = signal<string | null>(null);

  readonly stats = computed<DashboardStat[]>(() => {
    const d = this.dashboard();
    if (!d) return [];
    return [
      { title: "Technical Documents", value: d.count_technicals, iconName: "folder-open", iconBg: "rgba(74,168,255,0.16)", iconColor: "#4AA8FF", route: "/afterAuth/kms/technical/overview" },
      { title: "Certificates Inventory", value: d.count_certificates, iconName: "award", iconBg: "rgba(168,85,247,0.16)", iconColor: "#a855f7", route: "/afterAuth/kms/certificates/overview" },
      { title: "Certificates Expiring in 6 Month", value: d.expiring_count, iconName: "triangle-alert", iconBg: "rgba(245,158,11,0.16)", iconColor: "#F59E0B", route: "/afterAuth/kms/certificates/overview" },
      { title: "Correspondences Received", value: d.count_correspondence, iconName: "mail", iconBg: "rgba(236,72,153,0.16)", iconColor: "#ec4899", route: "/afterAuth/kms/in-mail/overview" },
      { title: "Correspondences Replied", value: d.replied_count, iconName: "send", iconBg: "rgba(34,197,94,0.16)", iconColor: "#22C55E", route: "/afterAuth/kms/out-mail/overview" },
      { title: "Correspondences Awaiting Reply", value: d.not_replied_count, iconName: "clock", iconBg: "rgba(248,44,54,0.16)", iconColor: "#F82C36", route: "/afterAuth/kms/in-mail/overview" },
    ];
  });

  readonly equipmentChartData = computed<BarDatum[]>(() =>
    (this.dashboard()?.equipment_data ?? []).map((row) => ({ label: row.equipment, value: row.count, primary: true })),
  );

  readonly categoryChartData = computed<BarDatum[]>(() =>
    (this.dashboard()?.cert_category_data ?? []).map((row) => ({ label: row.category, value: row.count, primary: true })),
  );

  private readonly recentMonths = computed(() => (this.dashboard()?.chart_data_subtype ?? []).slice(-CORRESPONDENCE_MONTHS_SHOWN));

  readonly correspondenceLabels = computed<string[]>(() => this.recentMonths().map((row) => row.month));

  readonly correspondenceSeries = computed<LineSeries[]>(() => {
    const months = this.recentMonths();
    return [
      { label: "Received (In-mail)", color: "#4AA8FF", values: months.map((row) => Number(row["inmail"] ?? 0)) },
      { label: "Sent (Out-mail)", color: "#22C55E", values: months.map((row) => Number(row["outmail"] ?? 0)) },
    ];
  });

  readonly correspondenceDetail = computed<KmsDashboardCorrespondenceRowDto[]>(() => this.dashboard()?.certificates_list ?? []);

  async loadDashboard(): Promise<void> {
    await this.load(this.dashboardLoading, this.dashboardError, this.api.getDashboard(), (d) => this.dashboard.set(d), "Failed to load KMS dashboard data.");
  }

  // --- Certificates ("other" — the Certificates tab) ---

  readonly certificatesOther = signal<Certificate[]>([]);
  readonly certificatesOtherLoading = signal(false);
  readonly certificatesOtherError = signal<string | null>(null);

  async loadCertificatesOther(): Promise<void> {
    await this.load(
      this.certificatesOtherLoading,
      this.certificatesOtherError,
      this.api.getCertificatesByType("other"),
      (res) => this.certificatesOther.set(res.certificates.map(mapCertificate)),
      "Failed to load certificates.",
    );
  }

  async addCertificateOther(payload: FormData): Promise<boolean> {
    const ok = await this.mutate(this.api.addCertificate(payload));
    if (ok) await this.loadCertificatesOther();
    return ok;
  }

  async deleteCertificateOther(id: number): Promise<boolean> {
    const ok = await this.mutate(this.api.deleteCertificate(id));
    if (ok) this.certificatesOther.update((list) => list.filter((c) => c.id !== id));
    return ok;
  }

  /** Opens a certificate's attachment in a new tab. Fetched as a blob (not a plain `<a href>`) so the
   *  auth interceptor's Bearer token is attached — a direct browser navigation wouldn't carry it. */
  async viewCertificateAttachment(id: number): Promise<void> {
    try {
      const blob = await firstValueFrom(this.api.getCertificateAttachment(id));
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      this.notification.error("Failed to load the attachment.");
    }
  }

  // --- Certificate categories (master list, also used as a filter source on the Certificates tab) ---

  readonly categories = signal<CertificateCategory[]>([]);
  readonly categoriesLoading = signal(false);
  readonly categoriesError = signal<string | null>(null);

  async loadCategories(): Promise<void> {
    await this.load(
      this.categoriesLoading,
      this.categoriesError,
      this.api.getCategories(),
      (rows) => this.categories.set(rows.map(mapCategory)),
      "Failed to load certificate categories.",
    );
  }

  async createCategory(categoryName: string): Promise<boolean> {
    const ok = await this.mutate(this.api.createCategory(categoryName));
    if (ok) await this.loadCategories();
    return ok;
  }

  async updateCategory(id: number, categoryName: string): Promise<boolean> {
    const ok = await this.mutate(this.api.updateCategory(id, categoryName));
    if (ok) await this.loadCategories();
    return ok;
  }

  async deleteCategory(id: number): Promise<boolean> {
    const ok = await this.mutate(this.api.deleteCategory(id));
    if (ok) this.categories.update((list) => list.filter((c) => c.id !== id));
    return ok;
  }

  // --- Technical manuals: equipment categories + documents ---

  private readonly equipmentCategoriesRaw = signal<KmsEquipmentCategoryDto[]>([]);
  private readonly equipmentDocumentsRaw = signal<KmsEquipmentDocumentDto[]>([]);
  // SFD's own fitted-equipment names, for the "Add Equipment Category" modal's "Select
  // Equipment from SFD" picker — distinct from equipmentCategoriesRaw (the dms_equipment_category
  // rows this module itself owns), which used to be wired into that picker by mistake.
  readonly sfdEquipmentOptions = signal<KmsSfdEquipmentOptionDto[]>([]);
  readonly technicalLoading = signal(false);
  readonly technicalError = signal<string | null>(null);

  // The `get_equipment_documents/` rows only carry `equipment_name` (no FK id) — categories are
  // unique by name in the DB (see EquipmentCategory.equipment_name), so name is a safe join key.
  readonly equipmentCategories = computed<EquipmentCategory[]>(() => {
    const docs = this.equipmentDocumentsRaw();
    return this.equipmentCategoriesRaw().map((dto) =>
      mapEquipmentCategory(dto, docs.filter((doc) => doc.equipment_name === dto.equipment_name).length),
    );
  });

  readonly documents = computed<EquipmentDocument[]>(() => {
    const idByName = new Map(this.equipmentCategoriesRaw().map((eq) => [eq.equipment_name, eq.id]));
    return this.equipmentDocumentsRaw().map((dto) => mapEquipmentDocument(dto, idByName.get(dto.equipment_name) ?? 0));
  });

  async loadTechnical(): Promise<void> {
    this.technicalLoading.set(true);
    this.technicalError.set(null);
    try {
      const [categoriesRes, documentsRes, sfdEquipmentRes] = await Promise.all([
        firstValueFrom(this.api.getEquipmentCategories()),
        firstValueFrom(this.api.getEquipmentDocuments()),
        firstValueFrom(this.api.getSfdEquipmentOptions()),
      ]);
      this.equipmentCategoriesRaw.set(categoriesRes.equipments);
      this.equipmentDocumentsRaw.set(documentsRes.documents);
      this.sfdEquipmentOptions.set(sfdEquipmentRes.equipment_name);
    } catch {
      this.technicalError.set("Failed to load technical manuals.");
      this.notification.error("Failed to load technical manuals.");
    } finally {
      this.technicalLoading.set(false);
    }
  }

  async addEquipmentCategory(equipmentName: string): Promise<boolean> {
    const ok = await this.mutate(this.api.addEquipmentCategory(equipmentName));
    if (ok) await this.loadTechnical();
    return ok;
  }

  async addEquipmentDocument(payload: FormData): Promise<boolean> {
    const ok = await this.mutate(this.api.addEquipmentDocument(payload));
    if (ok) await this.loadTechnical();
    return ok;
  }

  async deleteEquipmentDocument(id: number): Promise<boolean> {
    const ok = await this.mutate(this.api.deleteEquipmentDocument(id));
    if (ok) this.equipmentDocumentsRaw.update((list) => list.filter((d) => d.id !== id));
    return ok;
  }

  /** Mirrors viewCertificateAttachment — same reasoning: fetched as a blob (not a plain
   *  `<a href>`) so the auth interceptor's Bearer token is attached. */
  async viewEquipmentDocumentAttachment(id: number): Promise<void> {
    try {
      const blob = await firstValueFrom(this.api.getEquipmentDocumentAttachment(id));
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      this.notification.error("Failed to load the attachment.");
    }
  }

  // --- In-mail ---

  readonly inMailCertificates = signal<Certificate[]>([]);
  readonly inMailYears = signal<number[]>([]);
  readonly inMailLoading = signal(false);
  readonly inMailError = signal<string | null>(null);

  async loadInMail(): Promise<void> {
    await this.load(
      this.inMailLoading,
      this.inMailError,
      this.api.getInMail(),
      (res) => {
        this.inMailCertificates.set(res.certificates.map(mapCertificate));
        this.inMailYears.set(res.years);
      },
      "Failed to load in-mail correspondence.",
    );
  }

  async addInMail(payload: FormData): Promise<boolean> {
    const ok = await this.mutate(this.api.addCertificate(payload));
    if (ok) await this.loadInMail();
    return ok;
  }

  async deleteInMail(id: number): Promise<boolean> {
    const ok = await this.mutate(this.api.deleteCertificate(id));
    if (ok) this.inMailCertificates.update((list) => list.filter((c) => c.id !== id));
    return ok;
  }

  // --- Out-mail ---

  readonly outMailCertificates = signal<Certificate[]>([]);
  readonly outMailYears = signal<number[]>([]);
  readonly outMailFilenumbers = signal<string[]>([]);
  readonly outMailLoading = signal(false);
  readonly outMailError = signal<string | null>(null);

  async loadOutMail(): Promise<void> {
    await this.load(
      this.outMailLoading,
      this.outMailError,
      this.api.getOutMail(),
      (res) => {
        this.outMailCertificates.set(res.certificates.map(mapCertificate));
        this.outMailYears.set(res.years);
        this.outMailFilenumbers.set(res.filenumbers);
      },
      "Failed to load out-mail correspondence.",
    );
  }

  async addOutMail(payload: FormData): Promise<boolean> {
    const ok = await this.mutate(this.api.addCertificate(payload));
    if (ok) await this.loadOutMail();
    return ok;
  }

  async deleteOutMail(id: number): Promise<boolean> {
    const ok = await this.mutate(this.api.deleteCertificate(id));
    if (ok) this.outMailCertificates.update((list) => list.filter((c) => c.id !== id));
    return ok;
  }

  // --- Sharepoint ---

  readonly sharepointCertificates = signal<Certificate[]>([]);
  readonly sharepointLoading = signal(false);
  readonly sharepointError = signal<string | null>(null);

  private readonly sharepointType: KmsCertificateTypeDto = "sharepoint";

  async loadSharepoint(): Promise<void> {
    await this.load(
      this.sharepointLoading,
      this.sharepointError,
      this.api.getSharedCertificatesByType(this.sharepointType),
      (res) => this.sharepointCertificates.set(res.certificates.map(mapSharedCertificateRow)),
      "Failed to load shared documents.",
    );
  }

  async addSharepoint(payload: FormData): Promise<boolean> {
    const ok = await this.mutate(this.api.addCertificate(payload));
    if (ok) await this.loadSharepoint();
    return ok;
  }

  async deleteSharepoint(id: number): Promise<boolean> {
    const ok = await this.mutate(this.api.deleteCertificate(id));
    if (ok) this.sharepointCertificates.update((list) => list.filter((c) => c.id !== id));
    return ok;
  }

  async shareCertificate(certId: number, userIds: number[]): Promise<boolean> {
    const ok = await this.mutate(this.api.shareCertificate(certId, userIds));
    if (ok) await this.loadSharepoint();
    return ok;
  }

  /** Full certificate detail includes `shared_with`, needed to pre-select the share modal — the list/shared-list endpoints don't return it. */
  async getCertificateSharedWith(id: number): Promise<number[]> {
    try {
      const detail = await firstValueFrom(this.api.getCertificateDetail(id));
      return detail.shared_with;
    } catch {
      return [];
    }
  }
}
