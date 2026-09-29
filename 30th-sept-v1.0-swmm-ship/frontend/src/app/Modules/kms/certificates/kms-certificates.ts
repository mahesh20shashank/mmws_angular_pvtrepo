import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, ChangeDetectionStrategy, OnInit, signal, computed, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { ColDef } from "ag-grid-community";

import { InputField } from "../../../shared/components/input-field/input-field";
import { SelectInput, DropdownOption } from "../../../shared/components/select-input/select-input";
import { TextareaInput } from "../../../shared/components/textarea-input/textarea-input";
import { FileInput } from "../../../shared/components/file-input/file-input";
import { ModalComponent } from "../../../shared/components/modal/modal.component";
import { ChipTone } from "../../../shared/components/status-chip/status-chip";
import { IconComponent } from "../../../shared/components/icon/icon.component";
import { PageHeaderBar } from "../../../shared/components/page-header-bar/page-header-bar";
import { DataGrid } from "../../../shared/components/data-grid/data-grid";
import { ActionRendererComponent } from "../../../shared/components/data-grid/grid-action-icons";
import { GridStatusChipRenderer } from "../../../shared/components/data-grid/grid-status-chip-renderer";
import { ExportToolbar, ExportKind } from "../../../shared/components/export-toolbar/export-toolbar";
import { HelpGuidance } from "../../../shared/components/help-guidance/help-guidance";
import { NotificationService } from "../../../Core/services/notification/notification.service";
import { ReportExportService } from "../../../Core/services/export/generic-export.service";
import { Certificate } from "../models/kms.model";
import { computeExpiryFlags, expiryTier, EXPIRY_LABEL, ExpiryTier } from "../shared/kms-expiry.util";
import { getFileIcon } from "../shared/kms-file-icon.util";
import { KmsStateService } from "../state/kms-state.service";
import { toFormData } from "../state/kms-mapper.util";
import { ConfirmDeleteModal } from "../../../shared/components/confirm-delete-modal/confirm-delete-modal";

const HELP_HTML = `
  <h6 class="fw-bold mb-1">What this page is for</h6>
  <p class="mb-0">Lists certificates outside Technical Manuals and Correspondences. Add a certificate with its category, issued-by, and validity, and filter the list by category or by how soon it expires (6/3/1 month, or already expired).</p>
`;

const EXPIRY_FILTERS: { key: ExpiryTier; label: string }[] = [
  { key: "soon", label: "Expiring Within 6 Months" },
  { key: "very-soon", label: "Expiring Within 3 Months" },
  { key: "urgent", label: "Expiring Within 1 Month" },
  { key: "expired", label: "Expired" },
];

const TONE_BY_TIER: Record<ExpiryTier, ChipTone> = {
  expired: "neutral",
  urgent: "danger",
  "very-soon": "warning",
  soon: "info",
  valid: "success",
  none: "neutral",
};

/** Status-column tone lookup, keyed by the label text `GridStatusChipRenderer` receives as its value. */
const STATUS_TONE_MAP: Record<string, ChipTone> = Object.fromEntries(
  (Object.keys(EXPIRY_LABEL) as ExpiryTier[]).map((tier) => [EXPIRY_LABEL[tier], TONE_BY_TIER[tier]]),
);

@Component({
  selector: "app-kms-certificates",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    InputField,
    SelectInput,
    TextareaInput,
    FileInput,
    ModalComponent,
    IconComponent,
    PageHeaderBar,
    DataGrid,
    RouterLink,
    ExportToolbar,
    HelpGuidance,
    ConfirmDeleteModal, ButtonComponent],
  templateUrl: "./kms-certificates.html",
  styleUrl: "./kms-certificates.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KmsCertificates implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly notify = inject(NotificationService);
  private readonly store = inject(KmsStateService);
  private readonly exportService = inject(ReportExportService);

  readonly helpHtml = HELP_HTML;

  readonly certificates = this.store.certificatesOther;
  readonly categories = this.store.categories;

  ngOnInit(): void {
    void this.store.loadCertificatesOther();
    void this.store.loadCategories();
  }

  readonly activeCategoryFilters = signal<Set<string>>(new Set());
  readonly activeExpiryFilters = signal<Set<ExpiryTier>>(new Set());
  readonly expiryFilters = EXPIRY_FILTERS;
  readonly certificateSearch = signal("");
  readonly exportBusy = signal<ExportKind | null>(null);

  readonly categoryOptions = computed<DropdownOption[]>(() =>
    this.categories().map((c) => ({ label: c.categoryName, value: c.categoryName })),
  );

  readonly filteredCertificates = computed(() => {
    const cats = this.activeCategoryFilters();
    const tiers = this.activeExpiryFilters();
    const search = this.certificateSearch().trim().toLowerCase();
    return this.certificates().filter((cert) => {
      const matchCategory = cats.size === 0 || cats.has(cert.category ?? "");
      const matchExpiry = tiers.size === 0 || tiers.has(expiryTier(cert));
      const matchSearch =
        !search ||
        [cert.name, cert.placeOfIssue, cert.category, cert.issueDate, cert.expiryDate].some((field) =>
          (field ?? "").toLowerCase().includes(search),
        );
      return matchCategory && matchExpiry && matchSearch;
    });
  });

  pillClass(active: boolean): string {
    return active ? "kms-pill kms-pill--active" : "kms-pill";
  }

  toggleCategoryFilter(category: string): void {
    this.activeCategoryFilters.update((set) => {
      const next = new Set(set);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  clearCategoryFilters(): void {
    this.activeCategoryFilters.set(new Set());
  }

  toggleExpiryFilter(tier: ExpiryTier): void {
    this.activeExpiryFilters.update((set) => {
      const next = new Set(set);
      if (next.has(tier)) {
        next.delete(tier);
      } else {
        next.add(tier);
      }
      return next;
    });
  }

  clearExpiryFilters(): void {
    this.activeExpiryFilters.set(new Set());
  }

  rowTone(cert: Certificate): ChipTone {
    return TONE_BY_TIER[expiryTier(cert)];
  }

  rowLabel(cert: Certificate): string {
    return EXPIRY_LABEL[expiryTier(cert)];
  }

  readonly columnDefs: ColDef[] = [
    { field: "name", headerName: "Certificate Name", flex: 1.3 },
    { field: "issueDate", headerName: "Uploaded Date", width: 140 },
    { field: "expiryDate", headerName: "Expiring Date", width: 140 },
    { field: "placeOfIssue", headerName: "Issued By", flex: 1 },
    { field: "category", headerName: "Category", flex: 1 },
    {
      headerName: "Status",
      width: 190,
      sortable: false,
      valueGetter: (params) => (params.data ? this.rowLabel(params.data as Certificate) : ""),
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: STATUS_TONE_MAP },
    },
    {
      headerName: "Actions",
      width: 130,
      sortable: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: Certificate) => [
          { icon: "view", label: "View", action: () => this.viewCertificate(row) },
          { icon: "delete", label: "Delete", action: () => this.deleteCertificate(row) },
        ],
      },
    },
  ];

  readonly showAddModal = signal(false);
  readonly showDetailModal = signal(false);
  readonly activeCertificate = signal<Certificate | null>(null);

  readonly certificateForm = this.formBuilder.group({
    name: ["", Validators.required],
    expiryDate: ["", Validators.required],
    category: ["", Validators.required],
    placeOfIssue: ["", Validators.required],
    remarks: [""],
    attachment: [null as File | null],
  });

  private readonly expiryDateValue = toSignal(this.certificateForm.controls.expiryDate.valueChanges, {
    initialValue: this.certificateForm.controls.expiryDate.value,
  });

  readonly computedStatus = computed(() => {
    const expiry = this.expiryDateValue();
    if (!expiry) return "";
    const flags = computeExpiryFlags(expiry);
    if (flags.expired) return "Expired";
    if (flags.expiringUrgent) return "Expiring Soon";
    return "Valid";
  });

  openAddModal(): void {
    this.certificateForm.reset({ name: "", expiryDate: "", category: "", placeOfIssue: "", remarks: "", attachment: null });
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
  }

  async saveCertificate(): Promise<void> {
    if (this.certificateForm.invalid) {
      this.certificateForm.markAllAsTouched();
      this.notify.error("Fill all required fields");
      return;
    }
    const value = this.certificateForm.getRawValue();
    const formData = toFormData(
      {
        certificate_type: "other",
        name: value.name,
        expiry_date: value.expiryDate,
        category: value.category,
        place_of_issue: value.placeOfIssue,
        remarks: value.remarks,
      },
      value.attachment,
    );
    if (await this.store.addCertificateOther(formData)) {
      this.closeAddModal();
    }
  }

  viewCertificate(cert: Certificate): void {
    this.activeCertificate.set(cert);
    this.showDetailModal.set(true);
  }

  closeDetailModal(): void {
    this.showDetailModal.set(false);
  }

  getFileIcon = getFileIcon;

  async viewFile(cert: Certificate): Promise<void> {
    await this.store.viewCertificateAttachment(cert.id);
  }

  readonly pendingDelete = signal<Certificate | null>(null);

  deleteCertificate(cert: Certificate): void {
    this.pendingDelete.set(cert);
  }

  async confirmDelete(): Promise<void> {
    const cert = this.pendingDelete();
    if (!cert) return;
    this.pendingDelete.set(null);
    await this.store.deleteCertificateOther(cert.id);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  /** No backend export endpoint exists for Certificates, so this generates
   *  the file entirely client-side via ReportExportService. */
  onExport(kind: ExportKind): void {
    this.exportBusy.set(kind);
    try {
      const ok = this.exportService.export(kind, "Certificates", this.columnDefs, this.filteredCertificates(), "Certificates");
      if (!ok) {
        this.notify.error("Your browser blocked the preview window. Please allow pop-ups for this site and try again.");
      }
    } catch {
      this.notify.error(`${kind.toUpperCase()} export failed. Please try again.`);
    } finally {
      this.exportBusy.set(null);
    }
  }
}
