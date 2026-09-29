import { Component, ChangeDetectionStrategy, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { PanelCard } from "../../../../shared/components/panel-card/panel-card";
import { DetailDrawer, DrawerStat } from "../../../../shared/components/detail-drawer/detail-drawer";
import { KpiCard } from "../../../../shared/components/kpi-card/kpi-card";

export type ReturnFrequency = "monthly" | "quarterly" | "half_yearly" | "yearly";

export interface ReturnSummaryItem {
  id: string;
  name: string;
  department: string;
  frequency: ReturnFrequency;
  initiatedDate?: string;
  status: "Initiated" | "Pending" | "Synced" | "Approved";
}

export interface TimelineItem {
  name: string;
  frequency: "Monthly" | "Quarterly" | "Half-Yearly" | "Annual";
  freqColor: string;
  initDay: number;
  syncDay?: number;
  approvedDay?: number;
  status: "Initiated" | "Synced" | "Approved" | "Not Initiated";
}

@Component({
  selector: "app-trial-dashboard",
  standalone: true,
  imports: [CommonModule, PanelCard, DetailDrawer, KpiCard],
  templateUrl: "./trial-dashboard.component.html",
  styleUrls: ["./trial-dashboard.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrialDashboardComponent {
  // Modal State
  isModalOpen = signal<boolean>(false);
  selectedFrequency = signal<ReturnFrequency>("monthly");
  activeModalTab = signal<"initiated" | "pending">("initiated");

  // Summary counts
  monthlyDueCount = signal<string>("3/4");
  quarterlyDueCount = signal<string>("1/3");
  halfYearlyDueCount = signal<string>("1/2");
  yearlyDueCount = signal<string>("1/3");

  // Detailed Returns Data
  returnsList = signal<ReturnSummaryItem[]>([
    // Monthly Initiated
    { id: "M01", name: "Main Propulsion Trial Log", department: "Engineering", frequency: "monthly", initiatedDate: "02 Aug 2026", status: "Initiated" },
    { id: "M02", name: "Steering Gear Monthly Performance Return", department: "Engineering", frequency: "monthly", initiatedDate: "03 Aug 2026", status: "Approved" },
    { id: "M03", name: "Auxiliary Power Monthly Return", department: "Electrical", frequency: "monthly", initiatedDate: "04 Aug 2026", status: "Synced" },
    // Monthly Pending
    { id: "M04", name: "Radar & EW Monthly Calibration Return", department: "Weapons", frequency: "monthly", status: "Pending" },

    // Quarterly Initiated
    { id: "Q01", name: "Hull Integrity & Cathodic Protection Return", department: "Hull", frequency: "quarterly", initiatedDate: "15 Jul 2026", status: "Approved" },
    // Quarterly Pending
    { id: "Q02", name: "Sonar & Acoustic Sensor Quarterly Return", department: "Weapons", frequency: "quarterly", status: "Pending" },
    { id: "Q03", name: "Aviation & Helo Deck Trial Return", department: "Air", frequency: "quarterly", status: "Pending" },

    // Half-Yearly Initiated
    { id: "H01", name: "WEAT Combat System Half-Yearly Return", department: "Weapons", frequency: "half_yearly", initiatedDate: "10 Jun 2026", status: "Synced" },
    // Half-Yearly Pending
    { id: "H02", name: "Naval Ordnance & Torpedo Handling Return", department: "Weapons", frequency: "half_yearly", status: "Pending" },

    // Yearly Initiated
    { id: "Y01", name: "Annual Refit & Dockyard Trial Summary", department: "Executive", frequency: "yearly", initiatedDate: "12 Jan 2026", status: "Approved" },
    // Yearly Pending
    { id: "Y02", name: "Annual Machinery Overhaul Return", department: "Engineering", frequency: "yearly", status: "Pending" },
    { id: "Y03", name: "Annual Environmental & Safety Return", department: "Safety", frequency: "yearly", status: "Pending" },
  ]);

  // Timeline Data
  timelineItems = signal<TimelineItem[]>([
    { name: "Main Propulsion Trial Log", frequency: "Monthly", freqColor: "#0EA5E9", initDay: 3, syncDay: 8, approvedDay: 14, status: "Approved" },
    { name: "Steering Gear Performance", frequency: "Monthly", freqColor: "#0EA5E9", initDay: 5, syncDay: 10, approvedDay: 18, status: "Approved" },
    { name: "Auxiliary Power Monthly Return", frequency: "Monthly", freqColor: "#0EA5E9", initDay: 6, syncDay: 12, status: "Synced" },
    { name: "Radar & EW Calibration Return", frequency: "Monthly", freqColor: "#0EA5E9", initDay: 0, status: "Not Initiated" },
    { name: "Hull Integrity Protection Return", frequency: "Quarterly", freqColor: "#10B981", initDay: 8, syncDay: 15, approvedDay: 22, status: "Approved" },
    { name: "Sonar Acoustic Sensor Return", frequency: "Quarterly", freqColor: "#10B981", initDay: 0, status: "Not Initiated" },
    { name: "WEAT Combat System Return", frequency: "Half-Yearly", freqColor: "#F59E0B", initDay: 4, syncDay: 11, status: "Synced" },
    { name: "Naval Ordnance Handling Return", frequency: "Half-Yearly", freqColor: "#F59E0B", initDay: 0, status: "Not Initiated" },
    { name: "Annual Refit & Dockyard Trial", frequency: "Annual", freqColor: "#F43F5E", initDay: 2, syncDay: 7, approvedDay: 25, status: "Approved" },
    { name: "Annual Machinery Overhaul Return", frequency: "Annual", freqColor: "#F43F5E", initDay: 0, status: "Not Initiated" },
  ]);

  days = Array.from({ length: 31 }, (_, i) => i + 1);

  // Modal Computed Filters
  filteredInitiated = computed(() => {
    return this.returnsList().filter(
      (item) => item.frequency === this.selectedFrequency() && item.status !== "Pending"
    );
  });

  filteredPending = computed(() => {
    return this.returnsList().filter(
      (item) => item.frequency === this.selectedFrequency() && item.status === "Pending"
    );
  });

  totalCount = computed(() => {
    return this.returnsList().filter((item) => item.frequency === this.selectedFrequency()).length;
  });

  initiatedCount = computed(() => this.filteredInitiated().length);
  pendingCount = computed(() => this.filteredPending().length);
  overdueCount = computed(() => (this.selectedFrequency() === "monthly" ? 1 : 0));

  initiatedSharePercent = computed(() => {
    const total = this.totalCount();
    if (!total) return 0;
    return Math.round((this.initiatedCount() / total) * 100);
  });

  pendingSharePercent = computed(() => {
    const total = this.totalCount();
    if (!total) return 0;
    return Math.round((this.pendingCount() / total) * 100);
  });

  modalHeaderTitle = computed(() => {
    const titles: Record<ReturnFrequency, string> = {
      monthly: "MONTHLY RETURNS DUE COUNT",
      quarterly: "QUARTERLY RETURNS DUE COUNT",
      half_yearly: "HALF-YEARLY RETURNS DUE COUNT",
      yearly: "ANNUAL RETURNS DUE COUNT",
    };
    return titles[this.selectedFrequency()];
  });

  modalSubtitle = computed(() => {
    return "operational defects with readiness impact";
  });

  modalIconName = computed(() => {
    const icons: Record<ReturnFrequency, string> = {
      monthly: "activity",
      quarterly: "file-text",
      half_yearly: "activity",
      yearly: "file-text",
    };
    return icons[this.selectedFrequency()];
  });

  modalIconColor = computed(() => {
    const colors: Record<ReturnFrequency, string> = {
      monthly: "#F472B6",
      quarterly: "#38BDF8",
      half_yearly: "#C084FC",
      yearly: "#34D399",
    };
    return colors[this.selectedFrequency()];
  });

  modalIconBg = computed(() => {
    const bgs: Record<ReturnFrequency, string> = {
      monthly: "rgba(244, 114, 182, 0.15)",
      quarterly: "rgba(56, 189, 248, 0.15)",
      half_yearly: "rgba(192, 132, 252, 0.15)",
      yearly: "rgba(52, 211, 153, 0.15)",
    };
    return bgs[this.selectedFrequency()];
  });

  drawerStats = computed<DrawerStat[]>(() => [
    { value: this.initiatedCount(), label: "INITIATED", color: "var(--text-primary)" },
    { value: this.pendingCount(), label: "PENDING", color: "#FBBF24" },
    { value: this.overdueCount(), label: "> 7 DAYS", color: "#F43F5E" },
  ]);

  get modalTitle(): string {
    const titles: Record<ReturnFrequency, string> = {
      monthly: "Monthly Returns Details",
      quarterly: "Quarterly Returns Details",
      half_yearly: "Half-Yearly Returns Details",
      yearly: "Annual Returns Details",
    };
    return titles[this.selectedFrequency()];
  }

  openReturnModal(freq: ReturnFrequency): void {
    this.selectedFrequency.set(freq);
    this.activeModalTab.set("initiated");
    this.isModalOpen.set(true);
  }

  closeReturnModal(): void {
    this.isModalOpen.set(false);
  }

  setModalTab(tab: "initiated" | "pending"): void {
    this.activeModalTab.set(tab);
  }
}
