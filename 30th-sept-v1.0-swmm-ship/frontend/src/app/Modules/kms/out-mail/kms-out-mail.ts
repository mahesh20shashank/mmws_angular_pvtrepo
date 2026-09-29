import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, ChangeDetectionStrategy, OnInit, signal, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ColDef } from "ag-grid-community";

import { InputField } from "../../../shared/components/input-field/input-field";
import { SelectInput, DropdownOption } from "../../../shared/components/select-input/select-input";
import { TextareaInput } from "../../../shared/components/textarea-input/textarea-input";
import { FileInput } from "../../../shared/components/file-input/file-input";
import { ModalComponent } from "../../../shared/components/modal/modal.component";
import { IconComponent } from "../../../shared/components/icon/icon.component";
import { PageHeaderBar } from "../../../shared/components/page-header-bar/page-header-bar";
import { DataGrid } from "../../../shared/components/data-grid/data-grid";
import { ActionRendererComponent } from "../../../shared/components/data-grid/grid-action-icons";
import { ExportToolbar, ExportKind } from "../../../shared/components/export-toolbar/export-toolbar";
import { HelpGuidance } from "../../../shared/components/help-guidance/help-guidance";
import { NotificationService } from "../../../Core/services/notification/notification.service";
import { ReportExportService } from "../../../Core/services/export/generic-export.service";
import { Certificate } from "../models/kms.model";
import { UNIT_OPTIONS, SHIP_OPTIONS, COMMAND_OPTIONS, OUTMAIL_CATEGORY_OPTIONS } from "../shared/kms-static-options";
import { KmsStateService } from "../state/kms-state.service";
import { toFormData } from "../state/kms-mapper.util";
import { ConfirmDeleteModal } from "../../../shared/components/confirm-delete-modal/confirm-delete-modal";

const HELP_HTML = `
  <h6 class="fw-bold mb-1">What this page is for</h6>
  <p class="mb-0">Lists outgoing correspondence (out-mail). Add a new out-mail entry with its attachment, or view/delete an existing entry. Use the year/month breadcrumb on the side to filter the list by date.</p>
`;

@Component({
  selector: "app-kms-out-mail",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InputField, SelectInput, TextareaInput, FileInput, ModalComponent, IconComponent, PageHeaderBar, DataGrid, ExportToolbar, HelpGuidance, ConfirmDeleteModal, ButtonComponent],
  templateUrl: "./kms-out-mail.html",
  styleUrl: "./kms-out-mail.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KmsOutMail implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly notify = inject(NotificationService);
  private readonly store = inject(KmsStateService);
  private readonly exportService = inject(ReportExportService);

  readonly helpHtml = HELP_HTML;

  readonly unitOptions = UNIT_OPTIONS;
  readonly shipOptions = SHIP_OPTIONS;
  readonly commandOptions = COMMAND_OPTIONS;
  readonly outmailCategoryOptions = OUTMAIL_CATEGORY_OPTIONS;

  readonly certificates = this.store.outMailCertificates;

  ngOnInit(): void {
    void this.store.loadOutMail();
  }

  /** In-mail file numbers eligible for a reply — server-resolved (`out_mail`'s `filenumbers`, in-mail rows with `replied = 'Yes'`). */
  readonly fileNumberOptions = computed<DropdownOption[]>(() => this.store.outMailFilenumbers().map((fileNumber) => ({ label: fileNumber, value: fileNumber })));

  readonly years = computed(() =>
    [...new Set(this.certificates().map((c) => new Date(c.letterDate ?? c.issueDate).getFullYear()))].sort((a, b) => b - a),
  );
  readonly activeYear = signal<number | null>(null);
  readonly activeMonth = signal<number | null>(null);
  readonly activeDay = signal<number | null>(null);

  private dateOf(cert: Certificate): Date {
    return new Date(cert.letterDate ?? cert.issueDate);
  }

  monthsForYear(year: number): number[] {
    return [
      ...new Set(
        this.certificates()
          .filter((c) => this.dateOf(c).getFullYear() === year)
          .map((c) => this.dateOf(c).getMonth()),
      ),
    ].sort((a, b) => a - b);
  }

  daysForYearMonth(year: number, month: number): number[] {
    return [
      ...new Set(
        this.certificates()
          .filter((c) => this.dateOf(c).getFullYear() === year && this.dateOf(c).getMonth() === month)
          .map((c) => this.dateOf(c).getDate()),
      ),
    ].sort((a, b) => a - b);
  }

  monthLabel(month: number): string {
    return new Date(2000, month, 1).toLocaleString("en-US", { month: "long" });
  }

  monthClass(month: number): string {
    return this.activeMonth() === month ? "kms-list-item kms-list-item--active" : "kms-list-item";
  }

  dayClass(day: number): string {
    return this.activeDay() === day ? "kms-list-item kms-list-item--boxed kms-list-item--active" : "kms-list-item kms-list-item--boxed";
  }

  selectYear(year: number): void {
    this.activeYear.set(year);
    this.activeMonth.set(null);
    this.activeDay.set(null);
  }

  selectMonth(month: number): void {
    this.activeMonth.set(month);
    this.activeDay.set(null);
  }

  selectDay(day: number): void {
    this.activeDay.set(this.activeDay() === day ? null : day);
  }

  resetToYears(): void {
    this.activeYear.set(null);
    this.activeMonth.set(null);
    this.activeDay.set(null);
  }

  resetToYear(): void {
    this.activeMonth.set(null);
    this.activeDay.set(null);
  }

  readonly certificateSearch = signal("");
  readonly exportBusy = signal<ExportKind | null>(null);

  readonly filteredCertificates = computed(() => {
    const year = this.activeYear();
    const month = this.activeMonth();
    const day = this.activeDay();
    const search = this.certificateSearch().trim().toLowerCase();
    return this.certificates().filter((c) => {
      const date = this.dateOf(c);
      if (year !== null && date.getFullYear() !== year) return false;
      if (month !== null && date.getMonth() !== month) return false;
      if (day !== null && date.getDate() !== day) return false;
      if (search) {
        const matchSearch = [c.outmailCategory, c.addressedToUnit, c.command].some((field) =>
          (field ?? "").toLowerCase().includes(search),
        );
        if (!matchSearch) return false;
      }
      return true;
    });
  });

  readonly columnDefs: ColDef[] = [
    { field: "outmailCategory", headerName: "Correspondence Category", flex: 1.2 },
    { field: "letterDate", headerName: "Correspondence Date", width: 160 },
    { field: "addressedToUnit", headerName: "Addressed To", flex: 1 },
    { field: "command", headerName: "Command", flex: 1 },
    {
      headerName: "Actions",
      width: 110,
      sortable: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: Certificate) => [
          { icon: "view", label: "View", action: () => this.view(row) },
          { icon: "delete", label: "Delete", action: () => this.remove(row) },
        ],
      },
    },
  ];

  readonly showAddModal = signal(false);
  readonly showDetailModal = signal(false);
  readonly activeCertificate = signal<Certificate | null>(null);

  readonly form = this.formBuilder.group({
    outmailCategory: ["", Validators.required],
    fileNumber: [""],
    addressedToUnit: ["", Validators.required],
    ship: ["", Validators.required],
    command: ["", Validators.required],
    letterDate: ["", Validators.required],
    remarks: [""],
    attachment: [null as File | null],
  });

  private readonly selectedCategory = toSignal(this.form.controls.outmailCategory.valueChanges, {
    initialValue: this.form.controls.outmailCategory.value,
  });

  readonly isReplyToInMail = computed(() => this.selectedCategory() === "Reply To In-mail");

  openAddModal(): void {
    this.form.reset({
      outmailCategory: "",
      fileNumber: "",
      addressedToUnit: "",
      ship: "",
      command: "",
      letterDate: "",
      remarks: "",
      attachment: null,
    });
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
  }

  async save(): Promise<void> {
    const fileNumberControl = this.form.controls.fileNumber;
    if (this.isReplyToInMail()) {
      fileNumberControl.addValidators(Validators.required);
    } else {
      fileNumberControl.clearValidators();
      fileNumberControl.setValue("");
    }
    fileNumberControl.updateValueAndValidity();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify.error("Fill all required fields");
      return;
    }
    const v = this.form.getRawValue();
    const formData = toFormData(
      {
        certificate_type: "correspondence",
        certificate_subtype: "outmail",
        // No dedicated name field in this form (unlike in-mail's letterRefNo) — the backend requires
        // `name`, so derive a display id from the current list size. Sequential, not a real unique id.
        name: `OM-${1000 + this.certificates().length}`,
        outmail_category: v.outmailCategory,
        filenumber: v.fileNumber || undefined,
        addressed_to_unit: v.addressedToUnit,
        ship: v.ship,
        command: v.command,
        letter_date: v.letterDate,
        remarks: v.remarks,
      },
      v.attachment,
    );
    if (await this.store.addOutMail(formData)) {
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
    await this.store.deleteOutMail(cert.id);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  /** No backend export endpoint exists for Out Mail, so this generates the
   *  file entirely client-side via ReportExportService. */
  onExport(kind: ExportKind): void {
    this.exportBusy.set(kind);
    try {
      const ok = this.exportService.export(kind, "Out Mail", this.columnDefs, this.filteredCertificates(), "Out Mail");
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
