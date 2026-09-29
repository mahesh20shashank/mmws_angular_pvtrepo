import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";

import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { ButtonComponent } from "../../../../shared/components/button/button.component";
import { ChipTone, StatusChip } from "../../../../shared/components/status-chip/status-chip";

type FieldSource = "System" | "SFD" | "User";

interface DefectRecordField {
  label: string;
  value: string;
  source: FieldSource;
}

const STATUS_TONE_MAP: Record<string, ChipTone> = {
  "In Progress – With FMU": "warning",
  "In Progress – With Yard": "warning",
  "In Progress": "warning",
  Closed: "success",
  Draft: "neutral",
  Open: "info",
};

/**
 * Read-only "Digital Defect Book" record details modal, opened when a DART No.
 * is clicked in the Defect / DART List. Every field carries a small badge
 * showing whether it was captured by the System, pulled from SFD, or entered
 * by the User — mirroring the badges on the Create DART form.
 */
@Component({
  selector: "app-defect-record-details-modal",
  standalone: true,
  imports: [CommonModule, ModalComponent, IconComponent, ButtonComponent, StatusChip],
  templateUrl: "./defect-record-details-modal.html",
  styleUrl: "./defect-record-details-modal.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefectRecordDetailsModal {
  @Input({ required: true }) record!: Record<string, any>;
  @Output() closeModal = new EventEmitter<void>();

  private value(key: string): string {
    const raw = this.record?.[key];
    return raw === undefined || raw === null || raw === "" ? "-" : String(raw);
  }

  get title(): string {
    return this.value("equipment_ship_name");
  }

  get dartNumber(): string {
    return this.value("dart_number");
  }

  get status(): string {
    return this.value("status");
  }

  get statusTone(): ChipTone {
    return STATUS_TONE_MAP[this.record?.["status"]] ?? "neutral";
  }

  get description(): string {
    return this.value("defective_discriptions");
  }

  get fields(): DefectRecordField[] {
    return [
      { label: "DART No.", value: this.value("dart_number"), source: "System" },
      { label: "Equipment Name", value: this.value("equipment_ship_name"), source: "SFD" },
      { label: "Reason", value: this.value("reason"), source: "User" },//not in present now
      { label: "Equipment Nomenclature", value: this.value("equipment_nomenclature"), source: "SFD" },
      { label: "Equipment Serial No", value: this.value("equipment_serial_no"), source: "SFD" },
      { label: "Location On Board", value: this.value("location_on_board"), source: "User" },
      { label: "Date of Occurrence", value: this.value("dart_date"), source: "User" },
      { label: "Equipment Availability Status", value: this.value("equipment_status_display"), source: "User" },
      { label: "Operational Severity", value: this.value("severity"), source: "User" },
      { label: "Defect Rectified", value: this.value("defect_rectified"), source: "User" },
      { label: "Status", value: this.value("status"), source: "System" },
      { label: "Spares Used", value: this.value("sapres_required"), source: "User" },
    ];
  }

  badgeClass(source: FieldSource): string {
    return source === "User" ? "drd-badge drd-badge--user" : "drd-badge";
  }

  onClose(): void {
    this.closeModal.emit();
  }
}
