import { Component, EventEmitter, Output, ChangeDetectionStrategy, computed, signal } from "@angular/core";
import { CommonModule } from "@angular/common";

import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { ButtonComponent } from "../../../../shared/components/button/button.component";

type ActivityKind =
  | "Defect"
  | "Services"
  | "OPDEF"
  | "OPDEM"
  | "CANDEF"
  | "Guarantee Defect"
  | "As&As / ABER"
  | "RA";

type ActivityStatus = "Draft" | "Open" | "Raised" | "Verification Pending" | "Closed";

interface ActivityRecord {
  title: string;
  kind: ActivityKind;
  code: string;
  dateLabel: string;
  hrsLabel: string;
  status: ActivityStatus;
  note?: string;
}

interface KindMeta {
  icon: string;
  iconClass: string;
}

const KIND_META: Record<ActivityKind, KindMeta> = {
  Defect: { icon: "triangle-alert", iconClass: "ram-icon--danger" },
  OPDEF: { icon: "triangle-alert", iconClass: "ram-icon--danger" },
  OPDEM: { icon: "triangle-alert", iconClass: "ram-icon--danger" },
  CANDEF: { icon: "triangle-alert", iconClass: "ram-icon--danger" },
  Services: { icon: "wrench", iconClass: "ram-icon--success" },
  RA: { icon: "send", iconClass: "ram-icon--info" },
  "Guarantee Defect": { icon: "shield-alert", iconClass: "ram-icon--warning" },
  "As&As / ABER": { icon: "flag", iconClass: "ram-icon--violet" },
};

const STATUS_BADGE_CLASS: Record<ActivityStatus, string> = {
  Draft: "ram-badge--draft",
  Open: "ram-badge--open",
  Raised: "ram-badge--raised",
  "Verification Pending": "ram-badge--pending",
  Closed: "ram-badge--closed",
};

// Static demo data — matches the "Recent Activity" mock; swap for a real API call once
// the backend endpoint for cross-module recent transactions exists.
const ACTIVITY_RECORDS: ActivityRecord[] = [
  { title: "Services — Ventilation Trunk Cleaning", kind: "Services", code: "D-X-00148", dateLabel: "Yesterday", hrsLabel: "1655 hrs", status: "Draft", note: "Form Awaiting Completion" },
  { title: "Defect — LO Pump - ME No.1", kind: "Defect", code: "D-E-00142", dateLabel: "22-Jul", hrsLabel: "1815 hrs", status: "Raised" },
  { title: "RA — Sea Viper Director", kind: "RA", code: "RA-2026-0058", dateLabel: "21-Jul", hrsLabel: "1050 hrs", status: "Raised" },
  { title: "RA — Gyro Compass", kind: "RA", code: "RA-2026-0012", dateLabel: "19-Jul", hrsLabel: "1330 hrs", status: "Verification Pending" },
  { title: "Services — Painting — Hull", kind: "Services", code: "D-X-00136", dateLabel: "16-Jul", hrsLabel: "1420 hrs", status: "Raised" },
  { title: "Defect — 440V Switchboard", kind: "Defect", code: "D-E-00131", dateLabel: "15-Jul", hrsLabel: "1210 hrs", status: "Closed" },
  { title: "OPDEF — Fire Main Pump", kind: "OPDEF", code: "D-E-00124", dateLabel: "09-Jul", hrsLabel: "0940 hrs", status: "Draft" },
  { title: "OPDEM — Diesel Alternator", kind: "OPDEM", code: "D-E-00128", dateLabel: "11-Jul", hrsLabel: "1105 hrs", status: "Draft" },
  { title: "CANDEF — Gyro Compass", kind: "CANDEF", code: "D-E-00119", dateLabel: "05-Jul", hrsLabel: "0830 hrs", status: "Draft" },
  { title: "Guarantee Defect — Crane — Dockyard", kind: "Guarantee Defect", code: "D-G-00108", dateLabel: "02-Jul", hrsLabel: "1600 hrs", status: "Draft" },
  { title: "As&As — Sea Viper Director", kind: "As&As / ABER", code: "D-A-00097", dateLabel: "28-Jun", hrsLabel: "1740 hrs", status: "Raised" },
  { title: "RA — 440V Switchboard", kind: "RA", code: "RA-2026-0041", dateLabel: "24-Jun", hrsLabel: "1200 hrs", status: "Raised" },
  { title: "Services — Fire Main Pump", kind: "Services", code: "D-X-00090", dateLabel: "20-Jun", hrsLabel: "0950 hrs", status: "Open" },
  { title: "Defect — Crane — Dockyard", kind: "Defect", code: "D-E-00082", dateLabel: "15-Jun", hrsLabel: "1105 hrs", status: "Closed" },
];

const KIND_TABS: { label: string; key: ActivityKind | "all" }[] = [
  { label: "All", key: "all" },
  { label: "Defect", key: "Defect" },
  { label: "Services", key: "Services" },
  { label: "OPDEF / STOREDEM", key: "OPDEF" },
  { label: "OPDEM", key: "OPDEM" },
  { label: "CANDEF / CANDEM", key: "CANDEF" },
  { label: "Guarantee Defect", key: "Guarantee Defect" },
  { label: "As&As / ABER", key: "As&As / ABER" },
  { label: "RA", key: "RA" },
];

const STATUS_TABS: { label: string; key: ActivityStatus | "all" }[] = [
  { label: "All", key: "all" },
  { label: "Draft", key: "Draft" },
  { label: "Open", key: "Open" },
  { label: "RA Raised", key: "Raised" },
  { label: "Verification Pending", key: "Verification Pending" },
  { label: "Closed", key: "Closed" },
];

/**
 * "Recent Activity" modal — the Defect / DART List's latest defect, service and RA
 * transactions, filterable by activity type and status, so an interrupted entry can
 * be resumed. Data is static for now (see ACTIVITY_RECORDS); wire to a real endpoint
 * once one exists.
 */
@Component({
  selector: "app-recent-activity-modal",
  standalone: true,
  imports: [CommonModule, ModalComponent, IconComponent, ButtonComponent],
  templateUrl: "./recent-activity-modal.html",
  styleUrl: "./recent-activity-modal.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecentActivityModal {
  @Output() closeModal = new EventEmitter<void>();
  @Output() selectRecord = new EventEmitter<ActivityRecord>();

  readonly kindTabs = KIND_TABS;
  readonly statusTabs = STATUS_TABS;

  readonly activeKind = signal<ActivityKind | "all">("all");
  readonly activeStatus = signal<ActivityStatus | "all">("all");

  private readonly records = ACTIVITY_RECORDS;

  readonly recordCount = computed(() => this.records.length);

  readonly statusCounts = computed(() => {
    const counts: Partial<Record<ActivityStatus, number>> = {};
    for (const record of this.records) {
      counts[record.status] = (counts[record.status] ?? 0) + 1;
    }
    return counts;
  });

  readonly filteredRecords = computed(() => {
    const kind = this.activeKind();
    const status = this.activeStatus();
    return this.records.filter(
      (record) =>
        (kind === "all" || record.kind === kind) &&
        (status === "all" || record.status === status),
    );
  });

  statusCount(key: ActivityStatus | "all"): number {
    return key === "all" ? this.recordCount() : (this.statusCounts()[key] ?? 0);
  }

  kindOf(record: ActivityRecord) {
    return KIND_META[record.kind];
  }

  badgeClass(status: ActivityStatus): string {
    return STATUS_BADGE_CLASS[status];
  }

  isDraft(status: ActivityStatus): boolean {
    return status === "Draft";
  }

  onSelect(record: ActivityRecord): void {
    this.selectRecord.emit(record);
  }

  onClose(): void {
    this.closeModal.emit();
  }
}
