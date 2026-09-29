import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { Component, ChangeDetectionStrategy, signal, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { PanelCard } from "../../../../shared/components/panel-card/panel-card";
import { DetailDrawer } from "../../../../shared/components/detail-drawer/detail-drawer";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { SrarService, SrarRecord, SrarFullReportPayload } from "../services/srar.service";
import { ColDef, ICellRendererParams, CellCallbackParams } from "ag-grid-community";

@Component({
  selector: "app-srar-history",
  standalone: true,
  imports: [CommonModule, DataGrid, PanelCard, DetailDrawer, IconComponent, HelpGuidance, ModalComponent, ButtonComponent],
  templateUrl: "./srar-history.component.html",
  styleUrls: ["./srar-history.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SrarHistoryComponent implements OnInit {
  readonly helpHtml = `
    <p class="mb-2">Guidance for this page is being prepared.</p>`;

  private readonly srarService = inject(SrarService);
  private readonly router = inject(Router);

  records = signal<SrarRecord[]>([]);
  isLoading = signal<boolean>(false);
  isModalOpen = signal<boolean>(false);
  isLoadingDetail = signal<boolean>(false);
  modalTitle = signal<string>("");
  selectedReport = signal<SrarFullReportPayload | null>(null);
  isDeleteConfirmModalOpen = signal<boolean>(false);
  recordToDelete = signal<SrarRecord | null>(null);
  isDeleting = signal<boolean>(false);

  ngOnInit(): void {
    this.loadHistoryRecords();
  }

  loadHistoryRecords(): void {
    this.isLoading.set(true);

    this.srarService.getDashboard().subscribe({
      next: (data) => {
        if (data && Array.isArray(data)) {
          const list: SrarRecord[] = data.map((item) => ({
            id: String(item["id"] ?? ""),
            srarNo: String(
              item["srarNo"] ||
              `SRAR/${item["year"] || 2026}/${String(
                item["month"] || 8
              ).padStart(2, "0")}/${String(item["id"] ?? "").padStart(3, "0")}`
            ),
            shipName: String(item["shipName"] || ""),
            month: String(item["month"] || "August"),
            year: Number(item["year"] || 2026),
            submissionDate: String(
              item["submissionDate"] ||
              new Date().toISOString().split("T")[0]
            ),
            // The dashboard API returns `status` ("CMMS Synced" / ...) plus the raw
            // flags; it has never returned `approvalStatus`, so reading that key
            // made every row fall through to "Draft" — including returns pulled
            // straight from CMMS. Prefer the API's own label, then derive from the
            // flags, most-final state first.
            approvalStatus: String(
              item["status"] ||
              (item["cmms_sync_status"] ?? item["cmmsSyncStatus"] ? "CMMS Synced" :
                item["co_approved"] ? "Approved" :
                  item["send_to_co"] ? "Sent to CO" : "Draft")
            ),
            engineerOfficer: String(
              item["engineerOfficer"] ||
              "N/A"
            )
          }));

          this.records.set(list);
        }

        this.isLoading.set(false);
      },

      error: (err) => {
        console.error("Failed to load SRAR history records:", err);
        this.isLoading.set(false);
      }
    });

  }

  columnDefs: ColDef[] = [
    {
      headerName: "Month / Year",
      flex: 1.2,
      minWidth: 120,
      valueGetter: (params: CellCallbackParams) => {
        const data = params.data as SrarRecord;
        return `${data?.month || ""} ${data?.year || ""}`;
      },
    },
    { headerName: "Submission Date", field: "submissionDate", flex: 1.2, minWidth: 120 },
    { headerName: "Engineer Officer", field: "engineerOfficer", flex: 1.5, minWidth: 140 },
    {
      headerName: "Status",
      field: "approvalStatus",
      flex: 1.2,
      minWidth: 120,
      cellRenderer: (params: ICellRendererParams) => {
        const status = params.value || "Draft";
        let badgeClass = "badge-secondary";
        if (status === "Sent to CO") badgeClass = "badge-warning";
        else if (status === "Approved" || status === "CMMS Synced") badgeClass = "badge-success";

        return `<span class="status-pill ${badgeClass}">${status}</span>`;
      },
    },
    {
      headerName: "Action",
      flex: 1,
      minWidth: 110,
      sortable: false,
      filter: false,
      cellRenderer: (params: ICellRendererParams) => {
        const wrapper = document.createElement("div");
        wrapper.className = "flex items-center gap-2";

        const viewBtn = document.createElement("button");
        viewBtn.className = "action-btn";
        viewBtn.title = "View Form 15 Summary";
        viewBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        `;
        viewBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          const data = params.data as SrarRecord;
          if (data?.id) {
            this.viewReportDetails(data.id);
          }
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "action-btn";
        deleteBtn.title = "Delete SRAR Entry";
        deleteBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
          </svg>
        `;
        deleteBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          const data = params.data as SrarRecord;
          if (data) {
            this.openDeleteConfirmModal(data);
          }
        });

        wrapper.appendChild(viewBtn);
        wrapper.appendChild(deleteBtn);
        return wrapper;
      },
    },
  ];

  onRowClicked(row: unknown): void {
    const item = (row && typeof row === "object" && "data" in row)
      ? (row as { data: SrarRecord }).data
      : (row as SrarRecord);
    if (item?.id) {
      this.viewReportDetails(item.id);
    }
  }

  viewReportDetails(headerId: string | number): void {
    const numericId = Number(headerId) || 101;
    this.modalTitle.set(`Archived SRAR Details - ID #${numericId}`);
    this.isModalOpen.set(true);
    this.isLoadingDetail.set(true);
    this.selectedReport.set(null);

    this.srarService.getReportDetails(numericId).subscribe({
      next: (details) => {
        this.selectedReport.set(details as unknown as SrarFullReportPayload);
        this.isLoadingDetail.set(false);
      },
      error: () => {
        this.isLoadingDetail.set(false);
      }
    });
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.selectedReport.set(null);
  }

  openDeleteConfirmModal(record: SrarRecord): void {
    this.recordToDelete.set(record);
    this.isDeleteConfirmModalOpen.set(true);
  }

  closeDeleteConfirmModal(): void {
    this.isDeleteConfirmModalOpen.set(false);
    this.recordToDelete.set(null);
  }

  confirmDeleteRecord(): void {
    const record = this.recordToDelete();
    if (!record?.id) {
      this.closeDeleteConfirmModal();
      return;
    }

    this.isDeleting.set(true);
    this.srarService.deleteHistoryRecord(record.id).subscribe({
      next: () => {
        this.records.update((items) => items.filter((item) => item.id !== record.id));
        this.isDeleting.set(false);
        this.closeDeleteConfirmModal();
      },
      error: (err) => {
        console.error("Failed to delete SRAR history record:", err);
        this.isDeleting.set(false);
        this.closeDeleteConfirmModal();
      }
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case "Approved":
      case "CMMS Synced":
        return "badge-success";
      case "Sent to CO":
        return "badge-warning";
      case "Draft":
      default:
        return "badge-secondary";
    }
  }

  getMonthName(monthNum?: number): string {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    if (!monthNum || monthNum < 1 || monthNum > 12) return "August";
    return months[monthNum - 1];
  }

  formatReportId(id?: number, month?: number, year?: number): string {
    const m = String(month || 8).padStart(2, "0");
    const rId = String(id || 0).padStart(3, "0");
    const y = year || 2026;
    return `SRAR/${y}/${m}/${rId}`;
  }
}
