import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";

import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { ColDef, ICellRendererParams } from "ag-grid-community";
import { ICellRendererAngularComp } from "ag-grid-angular";
import {
  CommonApiService,
  TaginItem,
} from "../../../../Core/http/services/api.service";

import { DetailDrawer } from "../../../../shared/components/detail-drawer/detail-drawer";

export interface TagInRecord {
  id?: number;
  sNo?: number;
  hodApprovalStatus?: string;
  overallStatus?: string;
  tagInDetails?: string;
  tagoutDetails?: string;
  tagoutReason?: string;
  action?: string;
  remark?: string;
}

export interface TagApprovalActionParams extends ICellRendererParams {
  onApprove?: (data: TagInRecord) => void;
  onReject?: (data: TagInRecord) => void;
  approveLabel?: string;
  rejectLabel?: string;
}

@Component({
  selector: "app-tag-approval-action-renderer",
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="flex items-center gap-1.5 py-1 shrink-0">
      <button
        type="button"
        class="px-2.5 py-1 text-[11px] font-bold rounded-md transition-all duration-150 flex items-center gap-1 cursor-pointer shrink-0 shadow-sm"
        [ngClass]="isApproved ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/60 shadow-emerald-950/20' : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/35 border border-emerald-500/35'"
        (click)="onApprove($event)"
        title="Approve"
      >
        <app-icon name="check" [size]="12" />
        <span>{{ approveLabel }}</span>
      </button>
      <button
        type="button"
        class="px-2.5 py-1 text-[11px] font-bold rounded-md transition-all duration-150 flex items-center gap-1 cursor-pointer shrink-0 shadow-sm"
        [ngClass]="isRejected ? 'bg-rose-500/30 text-rose-300 border border-rose-500/60 shadow-rose-950/20' : 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/35 border border-rose-500/35'"
        (click)="onReject($event)"
        title="Reject with Remark"
      >
        <app-icon name="x" [size]="12" />
        <span>{{ rejectLabel }}</span>
      </button>
    </div>
  `,
})
export class TagApprovalActionRenderer implements ICellRendererAngularComp {
  private params: TagApprovalActionParams | null = null;

  approveLabel = "Approve";
  rejectLabel = "Reject";

  get isApproved(): boolean {
    const data = this.params?.data as TagInRecord | undefined;
    const status = String(data?.hodApprovalStatus || "").toLowerCase();
    return status === "approved";
  }

  get isRejected(): boolean {
    const data = this.params?.data as TagInRecord | undefined;
    const status = String(data?.hodApprovalStatus || "").toLowerCase();
    return status === "rejected";
  }

  agInit(params: TagApprovalActionParams): void {
    this.params = params;
    if (params?.approveLabel) this.approveLabel = params.approveLabel;
    if (params?.rejectLabel) this.rejectLabel = params.rejectLabel;
  }

  refresh(params: TagApprovalActionParams): boolean {
    this.params = params;
    if (params?.approveLabel) this.approveLabel = params.approveLabel;
    if (params?.rejectLabel) this.rejectLabel = params.rejectLabel;
    return true;
  }

  onApprove(event: MouseEvent): void {
    event.stopPropagation();
    const data = this.params?.data as TagInRecord | undefined;
    if (data && typeof this.params?.onApprove === "function") {
      this.params.onApprove(data);
    }
  }

  onReject(event: MouseEvent): void {
    event.stopPropagation();
    const data = this.params?.data as TagInRecord | undefined;
    if (data && typeof this.params?.onReject === "function") {
      this.params.onReject(data);
    }
  }
}

import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";

import { SelectInput, DropdownOption } from "../../../../shared/components/select-input/select-input";

const HELP_HTML = `<p class="mb-0">Lists tag in records with their department approval status and linked tag out details, filterable by date range and department. Click a row to view its full detail in the side panel.</p>`;

@Component({
  selector: "app-tag-in",
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, DataGrid, DetailDrawer, HelpGuidance, ButtonComponent, SelectInput],
  templateUrl: "./tag-in.component.html",
  styleUrl: "./tag-in.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagInComponent implements OnInit {
  readonly helpHtml = HELP_HTML;
  private readonly router = inject(Router);
  private readonly commonApiService = inject(CommonApiService);

  readonly selectedRecord = signal<TagInRecord | null>(null);

  readonly isApprovalMode = computed<boolean>(() =>
    this.router.url.includes("-approval")
  );

  readonly approvalModalOpen = signal<boolean>(false);
  readonly activeApprovalRecord = signal<TagInRecord | null>(null);
  readonly approvalStatusInput = signal<string>("Approved");
  readonly approvalRemarkInput = signal<string>("");

  onRowClicked(row: unknown): void {
    if (row && typeof row === "object") {
      this.selectedRecord.set(row as TagInRecord);
    }
  }

  closeDrawer(): void {
    this.selectedRecord.set(null);
  }

  createTagin(): void {
    this.router.navigate(["/afterAuth/other-utilities/tag-in-tag-out/create-tagin"]);
  }

  readonly fromDate = signal<string>("");
  readonly toDate = signal<string>("");
  readonly selectedDepartment = signal<string>("ALL");
  readonly isLoading = signal<boolean>(false);

  readonly departmentOptions: string[] = [
    "ALL",
    "ENGINEERING",
    "ELECTRICAL",
    "EXECUTIVE",
    "HULL & STRUCTURE",
    "WEAPONS & SENSORS",
    "LOGISTICS",
    "DAMAGE CONTROL",
  ];

  readonly formattedDepartmentOptions = computed<DropdownOption[]>(() =>
    this.departmentOptions.map((d) => ({
      label: d === "ALL" ? "ALL" : d,
      value: d,
    }))
  );

  readonly tagRecords = signal<TagInRecord[]>([]);

  ngOnInit(): void {
    this.fetchTagins();
  }

  fetchTagins(): void {
    this.isLoading.set(true);
    const filters = {
      from_date: this.fromDate(),
      to_date: this.toDate(),
      department: this.selectedDepartment(),
    };
    this.commonApiService.getTaginList(filters).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res && Array.isArray(res)) {
          const mapped: TagInRecord[] = res.map((item: TaginItem, index: number) => {
            const hodStatusRaw = item.approval_status || "Pending";
            const formattedHodStatus =
              hodStatusRaw.charAt(0).toUpperCase() + hodStatusRaw.slice(1).toLowerCase();

            return {
              id: item.id,
              sNo: index + 1,
              hodApprovalStatus: formattedHodStatus,
              overallStatus: item.approval_status || item.status || "Pending",
              tagInDetails: item.tagin_description || item.special_instructions || `TagIn #${item.id}`,
              tagoutDetails: item.tagout_details || item.tagout_equipment_name || (item.tagout ? `TagOut #${item.tagout}` : "-"),
              tagoutReason: item.tagout_reason || item.tagin_maintainer_name_rank || item.tagin_maintainer || "-",
              remark: item.remarks || item.remark || item.tagin_remarks || "-",
            };
          });
          this.tagRecords.set(mapped);
        } else {
          this.tagRecords.set([]);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        console.warn("API GET /api/v1/inout-tags/tagins/ fallback", err);
        this.tagRecords.set([]);
      },
    });
  }

  onSearch(): void {
    this.fetchTagins();
  }

  approveDirectly(record: TagInRecord): void {
    const updatedList = this.tagRecords().map((item) => {
      if (item.sNo === record.sNo || (record.id && item.id === record.id)) {
        return {
          ...item,
          hodApprovalStatus: "Approved",
        };
      }
      return item;
    });
    this.tagRecords.set(updatedList);

    if (record.id) {
      this.commonApiService
        .updateTaginApproval(record.id, "approved", record.remark || "")
        .subscribe({
          error: (err) => {
            console.warn("API updateTaginApproval fallback", err);
          },
        });
    }
  }

  openRejectModal(record: TagInRecord): void {
    this.activeApprovalRecord.set(record);
    this.approvalStatusInput.set("Rejected");
    const existingRemark = record.remark && record.remark !== "-" ? record.remark : "";
    this.approvalRemarkInput.set(existingRemark);
    this.approvalModalOpen.set(true);
  }

  openApprovalModal(record: TagInRecord, targetStatus: string): void {
    this.activeApprovalRecord.set(record);
    this.approvalStatusInput.set(targetStatus);
    const existingRemark = record.remark && record.remark !== "-" ? record.remark : "";
    this.approvalRemarkInput.set(existingRemark);
    this.approvalModalOpen.set(true);
  }

  closeApprovalModal(): void {
    this.approvalModalOpen.set(false);
    this.activeApprovalRecord.set(null);
  }

  saveApproval(): void {
    const rec = this.activeApprovalRecord();
    if (!rec) return;

    const newStatus = this.approvalStatusInput();
    const newRemark = this.approvalRemarkInput().trim() || "-";

    const updatedList = this.tagRecords().map((item) => {
      if (item.sNo === rec.sNo || (rec.id && item.id === rec.id)) {
        return {
          ...item,
          hodApprovalStatus: newStatus,
          remark: newRemark,
        };
      }
      return item;
    });

    this.tagRecords.set(updatedList);

    if (rec.id) {
      this.commonApiService
        .updateTaginApproval(rec.id, newStatus.toLowerCase(), newRemark)
        .subscribe({
          error: (err) => {
            console.warn("API updateTaginApproval fallback", err);
          },
        });
    }

    this.closeApprovalModal();
  }

  readonly tagColumnDefs = computed<ColDef[]>(() => {
    const isApproval = this.isApprovalMode();
    const base: ColDef[] = [
      { headerName: "S.NO", field: "sNo", width: 80, minWidth: 70 },
      {
        headerName: "HOD APPROVAL STATUS",
        field: "hodApprovalStatus",
        flex: 1.4,
        minWidth: 160,
        cellRenderer: (params: ICellRendererParams) => {
          const status = String(params.value || "Pending").trim();
          const sLower = status.toLowerCase();
          let style = "background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3);";
          if (sLower === "approved") {
            style = "background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3);";
          } else if (sLower === "rejected") {
            style = "background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3);";
          }
          return `<span style="padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; ${style}">${status}</span>`;
        },
      },
      {
        headerName: "OVERALL STATUS",
        field: "overallStatus",
        flex: 1.3,
        minWidth: 140,
      },
      {
        headerName: "TAG IN DETAILS",
        field: "tagInDetails",
        flex: 2,
        minWidth: 160,
      },
      {
        headerName: "TAGOUT DETAILS",
        field: "tagoutDetails",
        flex: 2,
        minWidth: 160,
      },
      {
        headerName: "TAGOUT REASON",
        field: "tagoutReason",
        flex: 2,
        minWidth: 160,
      },
    ];

    if (isApproval) {
      base.push(
        {
          headerName: "HOD REMARK",
          field: "remark",
          flex: 1.5,
          minWidth: 150,
          cellRenderer: (params: ICellRendererParams) => {
            const val = params.value || "-";
            return `<span class="text-slate-300 text-xs italic truncate" title="${val}">${val}</span>`;
          },
        },
        {
          headerName: "APPROVAL ACTION",
          field: "action",
          flex: 2,
          minWidth: 200,
          cellRenderer: TagApprovalActionRenderer,
          cellRendererParams: {
            approveLabel: "Approve",
            rejectLabel: "Reject",
            onApprove: (row: TagInRecord) => this.approveDirectly(row),
            onReject: (row: TagInRecord) => this.openRejectModal(row),
          },
        }
      );
    } else {
      base.push({ headerName: "ACTION", field: "action", flex: 1, minWidth: 90 });
    }

    return base;
  });

  readonly globalSearch = signal<string>("");

  readonly filteredRecords = computed(() => {
    let list = this.tagRecords();
    const dept = this.selectedDepartment();
    if (dept && dept !== "ALL" && dept !== "All") {
      list = list.filter((r) => {
        const itemDept = String(
          r.tagInDetails || r.tagoutReason || ""
        ).toUpperCase();
        return itemDept.includes(dept.toUpperCase());
      });
    }
    const search = this.globalSearch().toLowerCase().trim();
    if (!search) return list;

    return list.filter((r) => {
      return (
        r["sNo"]?.toString().includes(search) ||
        r["hodApprovalStatus"]?.toLowerCase().includes(search) ||
        r["overallStatus"]?.toLowerCase().includes(search) ||
        r["tagInDetails"]?.toLowerCase().includes(search) ||
        r["tagoutDetails"]?.toLowerCase().includes(search) ||
        r["tagoutReason"]?.toLowerCase().includes(search) ||
        r["remark"]?.toLowerCase().includes(search)
      );
    });
  });
}
