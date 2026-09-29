import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { ModalComponent } from "../../../../../shared/components/modal/modal.component";
import { FileInput } from "../../../../../shared/components/file-input/file-input";
import { InputField } from "../../../../../shared/components/input-field/input-field";
import { NotificationService } from "../../../../../Core/services/notification/notification.service";
import { CrewApiService } from "../../../services/crew-api.service";
import { CrewPersonnel, LeaveType } from "../../../models/crew.model";

/**
 * "Apply Leave" / "Apply TY Duty" modal launched from the crew dashboard grid's status radios —
 * mirrors `crew-utilities/leave-ty-duty`'s apply modal (same fields, same
 * `applyLeaveOnBehalf()` call), minus the personnel-picker/leave-type-picker since both are
 * already fixed by which row/radio the HOD clicked.
 */
@Component({
  selector: "app-status-leave-modal",
  standalone: true,
  imports: [FormsModule, ModalComponent, FileInput, InputField, ButtonComponent],
  templateUrl: "./status-leave-modal.html",
  styleUrl: "./status-leave-modal.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusLeaveModal {
  private readonly api = inject(CrewApiService);
  private readonly notifications = inject(NotificationService);

  @Input({ required: true }) personnel!: CrewPersonnel;
  @Input({ required: true }) leaveType!: LeaveType;
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<void>();

  hasPrefix = false;
  prefixStartDate = "";
  startDate = "";
  endDate = "";
  hasSuffix = false;
  suffixCompletionDate = "";
  reportingDate = "";
  station = "";
  reason = "";
  attachment: File | null = null;
  readonly submitAttempted = signal(false);
  readonly submitting = signal(false);

  get typeLabel(): string {
    return this.leaveType === "On Leave" ? "Leave" : "TY Duty";
  }

  get noOfDays(): number {
    if (!this.startDate || !this.endDate) return 0;
    return Math.max(1, Math.round((+new Date(this.endDate) - +new Date(this.startDate)) / 86400000) + 1);
  }

  get startDateInvalid(): boolean {
    return this.submitAttempted() && !this.startDate;
  }

  get endDateInvalid(): boolean {
    if (!this.submitAttempted()) return false;
    if (!this.endDate) return true;
    return !!this.startDate && this.endDate < this.startDate;
  }

  onAttachmentChange(file: File | null): void {
    this.attachment = file;
  }

  async submit(): Promise<void> {
    this.submitAttempted.set(true);
    if (this.startDateInvalid) {
      this.notifications.error(`${this.typeLabel} Commencement Date is required.`);
      return;
    }
    if (this.endDateInvalid) {
      this.notifications.error(
        this.endDate
          ? `${this.typeLabel} Completion Date cannot be before the Commencement Date.`
          : `${this.typeLabel} Completion Date is required.`,
      );
      return;
    }
    if (this.hasPrefix && !this.prefixStartDate) {
      this.notifications.error("Prefix Start Date is required when Prefix Applicable is checked.");
      return;
    }
    if (this.hasSuffix && !this.suffixCompletionDate) {
      this.notifications.error("Suffix Till Date is required when Suffix Applicable is checked.");
      return;
    }

    this.submitting.set(true);
    try {
      await firstValueFrom(
        this.api.applyLeaveOnBehalf({
          personalNumber: this.personnel.pno,
          leaveType: this.leaveType,
          hasPrefix: this.hasPrefix,
          prefixStartDate: this.hasPrefix ? this.prefixStartDate : undefined,
          startDate: this.startDate,
          endDate: this.endDate,
          hasSuffix: this.hasSuffix,
          suffixCompletionDate: this.hasSuffix ? this.suffixCompletionDate : undefined,
          reportingDate: this.hasSuffix ? this.reportingDate : undefined,
          station: this.station,
          reason: this.reason,
          attachment: this.attachment,
        }),
      );
      this.submitted.emit();
    } finally {
      this.submitting.set(false);
    }
  }

  cancel(): void {
    this.closed.emit();
  }
}
