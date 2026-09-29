import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, ChangeDetectionStrategy, OnInit, signal, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ColDef } from "ag-grid-community";

import { InputField } from "../../../shared/components/input-field/input-field";
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
import { CertificateCategory } from "../models/kms.model";
import { KmsStateService } from "../state/kms-state.service";
import { ConfirmDeleteModal } from "../../../shared/components/confirm-delete-modal/confirm-delete-modal";

@Component({
  selector: "app-kms-category-master",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InputField, ModalComponent, IconComponent, PageHeaderBar, DataGrid, ExportToolbar, HelpGuidance, ConfirmDeleteModal, ButtonComponent],
  templateUrl: "./kms-category-master.html",
  styleUrl: "./kms-category-master.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KmsCategoryMaster implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly notify = inject(NotificationService);
  private readonly store = inject(KmsStateService);
  private readonly exportService = inject(ReportExportService);

  readonly categories = this.store.categories;
  readonly categorySearch = signal("");
  readonly exportBusy = signal<ExportKind | null>(null);

  readonly filteredCategories = computed(() => {
    const search = this.categorySearch().trim().toLowerCase();
    if (!search) return this.categories();
    return this.categories().filter((c) => c.categoryName.toLowerCase().includes(search));
  });

  ngOnInit(): void {
    void this.store.loadCategories();
  }

  readonly columnDefs: ColDef[] = [
    { field: "categoryName", headerName: "Category Name", flex: 1.5 },
    {
      headerName: "Type",
      width: 130,
      sortable: false,
      valueGetter: (params) => (params.data && (params.data as CertificateCategory).isSystem ? "System" : "Custom"),
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: { System: "neutral", Custom: "info" } },
    },
    {
      headerName: "Actions",
      width: 110,
      sortable: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: CertificateCategory): GridAction[] =>
          row.isSystem
            ? []
            : [
                { icon: "edit", label: "Edit", action: () => this.openEditModal(row) },
                { icon: "delete", label: "Delete", action: () => this.remove(row) },
              ],
      },
    },
  ];

  readonly showModal = signal(false);
  readonly editingId = signal<number | null>(null);

  readonly form = this.formBuilder.group({
    categoryName: ["", Validators.required],
  });

  get modalTitle(): string {
    return this.editingId() !== null ? "Edit Category" : "Add Category";
  }

  openAddModal(): void {
    this.editingId.set(null);
    this.form.reset({ categoryName: "" });
    this.showModal.set(true);
  }

  openEditModal(category: CertificateCategory): void {
    if (category.isSystem) {
      this.notify.error("System categories cannot be edited.");
      return;
    }
    this.editingId.set(category.id);
    this.form.reset({ categoryName: category.categoryName });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify.error("Category name is required");
      return;
    }
    const name = this.form.getRawValue().categoryName ?? "";
    const editId = this.editingId();

    const ok = editId !== null ? await this.store.updateCategory(editId, name) : await this.store.createCategory(name);
    if (ok) {
      this.closeModal();
    }
  }

  readonly pendingDelete = signal<CertificateCategory | null>(null);

  remove(category: CertificateCategory): void {
    if (category.isSystem) {
      this.notify.error("Default categories cannot be deleted.");
      return;
    }
    this.pendingDelete.set(category);
  }

  async confirmDelete(): Promise<void> {
    const category = this.pendingDelete();
    if (!category) return;
    this.pendingDelete.set(null);
    await this.store.deleteCategory(category.id);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  /** No backend export endpoint exists for Category Master, so this generates
   *  the file entirely client-side via ReportExportService. */
  onExport(kind: ExportKind): void {
    this.exportBusy.set(kind);
    try {
      const ok = this.exportService.export(kind, "Category Master", this.columnDefs, this.filteredCategories(), "Category Master");
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
