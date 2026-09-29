import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, ChangeDetectionStrategy, OnInit, signal, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ColDef } from "ag-grid-community";

import { InputField } from "../../../shared/components/input-field/input-field";
import { FileInput } from "../../../shared/components/file-input/file-input";
import { ModalComponent } from "../../../shared/components/modal/modal.component";
import { IconComponent } from "../../../shared/components/icon/icon.component";
import { PageHeaderBar } from "../../../shared/components/page-header-bar/page-header-bar";
import { DataGrid } from "../../../shared/components/data-grid/data-grid";
import { ActionRendererComponent, GridAction } from "../../../shared/components/data-grid/grid-action-icons";
import { GridStatusChipRenderer } from "../../../shared/components/data-grid/grid-status-chip-renderer";
import { ExportToolbar, ExportKind } from "../../../shared/components/export-toolbar/export-toolbar";
import { HelpGuidance } from "../../../shared/components/help-guidance/help-guidance";
import { NotificationService } from "../../../Core/services/notification/notification.service";
import { ReportExportService } from "../../../Core/services/export/generic-export.service";
import { Certificate, Personnel } from "../models/kms.model";
import { MOCK_PERSONNEL } from "../data/kms-mock-data";
import { KmsStateService } from "../state/kms-state.service";
import { toFormData } from "../state/kms-mapper.util";
import { ConfirmDeleteModal } from "../../../shared/components/confirm-delete-modal/confirm-delete-modal";

type StatusFilter = "all" | "uploaded" | "shared";

const HELP_HTML = `
  <h6 class="fw-bold mb-1">What this page is for</h6>
  <p class="mb-0">Shared document repository. Add a document here, and use the status filter to show everything, only what you uploaded, or only what has been shared with you.</p>
`;

@Component({
  selector: "app-kms-sharepoint",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InputField, FileInput, ModalComponent, IconComponent, PageHeaderBar, DataGrid, ExportToolbar, HelpGuidance, ConfirmDeleteModal, ButtonComponent],
  templateUrl: "./kms-sharepoint.html",
  styleUrl: "./kms-sharepoint.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KmsSharepoint implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly notify = inject(NotificationService);
  private readonly store = inject(KmsStateService);
  private readonly exportService = inject(ReportExportService);

  readonly helpHtml = HELP_HTML;

  /** No backend endpoint lists personnel yet (the divisional-organisation "available-users" route is scoped to hierarchy placement, not a general roster) — stays mock until one exists. */
  readonly personnel: Personnel[] = MOCK_PERSONNEL;
  readonly certificates = this.store.sharepointCertificates;
  readonly statusFilter = signal<StatusFilter>("all");
  /** Search box for the main documents table — distinct from `shareSearch`,
   *  which filters the personnel picker inside the Share modal. */
  readonly documentSearch = signal("");
  readonly exportBusy = signal<ExportKind | null>(null);

  ngOnInit(): void {
    void this.store.loadSharepoint();
  }

  readonly filteredCertificates = computed(() => {
    const filter = this.statusFilter();
    const search = this.documentSearch().trim().toLowerCase();
    return this.certificates().filter((cert) => {
      const isOwned = this.isOwned(cert);
      if (filter === "uploaded" && !isOwned) return false;
      if (filter === "shared" && isOwned) return false;
      if (search) {
        const matchSearch = [cert.name, cert.uploadedByName].some((field) => (field ?? "").toLowerCase().includes(search));
        if (!matchSearch) return false;
      }
      return true;
    });
  });

  isOwned(cert: Certificate): boolean {
    return cert.isOwnedByViewer ?? false;
  }

  setStatusFilter(filter: StatusFilter): void {
    this.statusFilter.set(filter);
  }

  readonly columnDefs: ColDef[] = [
    { field: "name", headerName: "Name", flex: 1.3 },
    {
      headerName: "Uploaded/Shared On",
      width: 160,
      valueGetter: (params) => {
        const cert = params.data as Certificate | undefined;
        if (!cert) return "";
        return this.isOwned(cert) ? cert.issueDate : cert.sharedOn;
      },
    },
    {
      headerName: "Status",
      width: 170,
      sortable: false,
      valueGetter: (params) => (params.data && this.isOwned(params.data as Certificate) ? "Uploaded By You" : "Shared With You"),
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: { "Uploaded By You": "info", "Shared With You": "neutral" } },
    },
    { field: "uploadedByName", headerName: "Uploaded/Shared By", flex: 1 },
    {
      headerName: "Actions",
      width: 150,
      sortable: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: Certificate): GridAction[] => {
          const actions: GridAction[] = [
            this.isZip(row)
              ? { icon: "download", label: "Download", action: () => this.view(row) }
              : { icon: "view", label: "View", action: () => this.view(row) },
          ];
          if (this.isOwned(row)) {
            actions.push(
              { icon: "share", label: "Share", action: () => this.openShareModal(row) },
              { icon: "delete", label: "Delete", action: () => this.remove(row) },
            );
          }
          return actions;
        },
      },
    },
  ];

  readonly showAddModal = signal(false);
  readonly showDetailModal = signal(false);
  readonly showShareModal = signal(false);
  readonly activeCertificate = signal<Certificate | null>(null);
  readonly shareSearch = signal("");
  readonly shareSelection = signal<Set<number>>(new Set());

  readonly filteredPersonnel = computed(() => {
    const search = this.shareSearch().toLowerCase();
    if (!search) return this.personnel;
    return this.personnel.filter((p) => `${p.rank} ${p.firstName} ${p.lastName} ${p.personalNumber}`.toLowerCase().includes(search));
  });

  readonly allVisibleSelected = computed(() => {
    const visible = this.filteredPersonnel();
    return visible.length > 0 && visible.every((p) => this.shareSelection().has(p.id));
  });

  readonly form = this.formBuilder.group({
    name: ["", Validators.required],
    attachment: [null as File | null, Validators.required],
  });

  openAddModal(): void {
    this.form.reset({ name: "", attachment: null });
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify.error("Fill all required fields");
      return;
    }
    const v = this.form.getRawValue();
    const formData = toFormData({ certificate_type: "sharepoint", name: v.name }, v.attachment);
    if (await this.store.addSharepoint(formData)) {
      this.closeAddModal();
    }
  }

  view(cert: Certificate): void {
    this.activeCertificate.set(cert);
    this.showDetailModal.set(true);
  }

  closeDetailModal(): void {
    this.showDetailModal.set(false);
  }

  readonly pendingDelete = signal<Certificate | null>(null);

  remove(cert: Certificate): void {
    this.pendingDelete.set(cert);
  }

  async confirmDelete(): Promise<void> {
    const cert = this.pendingDelete();
    if (!cert) return;
    this.pendingDelete.set(null);
    await this.store.deleteSharepoint(cert.id);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  async openShareModal(cert: Certificate): Promise<void> {
    this.activeCertificate.set(cert);
    this.shareSearch.set("");
    this.shareSelection.set(new Set());
    this.showShareModal.set(true);
    const sharedWithIds = await this.store.getCertificateSharedWith(cert.id);
    this.shareSelection.set(new Set(sharedWithIds));
  }

  closeShareModal(): void {
    this.showShareModal.set(false);
  }

  toggleShareUser(userId: number): void {
    this.shareSelection.update((set) => {
      const next = new Set(set);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  toggleSelectAll(): void {
    const visibleIds = this.filteredPersonnel().map((p) => p.id);
    const shouldSelect = !this.allVisibleSelected();
    this.shareSelection.update((set) => {
      const next = new Set(set);
      visibleIds.forEach((id) => (shouldSelect ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  async confirmShare(): Promise<void> {
    const cert = this.activeCertificate();
    if (!cert) return;
    const ids = [...this.shareSelection()];
    if (await this.store.shareCertificate(cert.id, ids)) {
      this.closeShareModal();
    }
  }

  isZip(cert: Certificate): boolean {
    return (cert.attachmentName ?? "").toLowerCase().endsWith(".zip");
  }

  /** No backend export endpoint exists for SharePoint, so this generates the
   *  file entirely client-side via ReportExportService. */
  onExport(kind: ExportKind): void {
    this.exportBusy.set(kind);
    try {
      const ok = this.exportService.export(kind, "SharePoint Documents", this.columnDefs, this.filteredCertificates(), "SharePoint Documents");
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
