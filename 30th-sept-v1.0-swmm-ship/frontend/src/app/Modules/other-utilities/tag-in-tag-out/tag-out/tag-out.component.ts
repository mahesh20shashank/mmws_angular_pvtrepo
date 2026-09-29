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
import { TagRecord } from "../tag-in-tag-out.component";
import {
  CommonApiService,
  TagoutItem,
} from "../../../../Core/http/services/api.service";

import { DetailDrawer } from "../../../../shared/components/detail-drawer/detail-drawer";

interface TagoutApprovalActionParams extends ICellRendererParams {
  onApprove?: (data: TagRecord) => void;
  onReject?: (data: TagRecord) => void;
  approveLabel?: string;
  rejectLabel?: string;
}

@Component({
  selector: "app-tagout-approval-action-renderer",
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="flex items-center gap-1.5 py-1 shrink-0">
      <button
        type="button"
        class="px-2.5 py-1 text-[11px] font-bold rounded-md transition-all duration-150 flex items-center gap-1 cursor-pointer shrink-0 shadow-sm"
        [ngClass]="isApproved ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/60 shadow-emerald-950/20' : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/35 border border-emerald-500/35'"
        (click)="onApprove($event)"
        title="Approve TagOut"
      >
        <app-icon name="check" [size]="12" />
        <span>{{ approveLabel }}</span>
      </button>
      <button
        type="button"
        class="px-2.5 py-1 text-[11px] font-bold rounded-md transition-all duration-150 flex items-center gap-1 cursor-pointer shrink-0 shadow-sm"
        [ngClass]="isRejected ? 'bg-rose-500/30 text-rose-300 border border-rose-500/60 shadow-rose-950/20' : 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/35 border border-rose-500/35'"
        (click)="onReject($event)"
        title="Reject TagOut with Remark"
      >
        <app-icon name="x" [size]="12" />
        <span>{{ rejectLabel }}</span>
      </button>
    </div>
  `,
})
export class TagoutApprovalActionRenderer implements ICellRendererAngularComp {
  private params: TagoutApprovalActionParams | null = null;

  approveLabel = "Approve";
  rejectLabel = "Reject";

  get isApproved(): boolean {
    const data = this.params?.data as TagRecord | undefined;
    const status = String(data?.hodApprovalStatus || "").toLowerCase();
    return status === "approved";
  }

  get isRejected(): boolean {
    const data = this.params?.data as TagRecord | undefined;
    const status = String(data?.hodApprovalStatus || "").toLowerCase();
    return status === "rejected";
  }

  agInit(params: TagoutApprovalActionParams): void {
    this.params = params;
    if (params?.approveLabel) this.approveLabel = params.approveLabel;
    if (params?.rejectLabel) this.rejectLabel = params.rejectLabel;
  }

  refresh(params: TagoutApprovalActionParams): boolean {
    this.params = params;
    if (params?.approveLabel) this.approveLabel = params.approveLabel;
    if (params?.rejectLabel) this.rejectLabel = params.rejectLabel;
    return true;
  }

  onApprove(event: MouseEvent): void {
    event.stopPropagation();
    const data = this.params?.data as TagRecord | undefined;
    if (data && typeof this.params?.onApprove === "function") {
      this.params.onApprove(data);
    }
  }

  onReject(event: MouseEvent): void {
    event.stopPropagation();
    const data = this.params?.data as TagRecord | undefined;
    if (data && typeof this.params?.onReject === "function") {
      this.params.onReject(data);
    }
  }
}

import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { SelectInput, DropdownOption } from "../../../../shared/components/select-input/select-input";

const HELP_HTML = `<p class="mb-0">Lists your tag out records, filterable by date range and department. Click a row to view its full detail in the side panel, or print the tag out slip once it is approved.</p>`;

@Component({
  selector: "app-tag-out",
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, DataGrid, DetailDrawer, HelpGuidance, ButtonComponent, SelectInput],
  templateUrl: "./tag-out.component.html",
  styleUrl: "./tag-out.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagOutComponent implements OnInit {
  readonly helpHtml = HELP_HTML;
  private readonly router = inject(Router);
  private readonly commonApiService = inject(CommonApiService);

  readonly selectedRecord = signal<TagRecord | null>(null);

  readonly isApprovalMode = computed<boolean>(() =>
    this.router.url.includes("-approval")
  );

  readonly approvalModalOpen = signal<boolean>(false);
  readonly activeApprovalRecord = signal<TagRecord | null>(null);
  readonly approvalStatusInput = signal<string>("Approved");
  readonly approvalRemarkInput = signal<string>("");

  onRowClicked(row: unknown): void {
    if (row && typeof row === "object") {
      this.selectedRecord.set(row as TagRecord);
    }
  }

  closeDrawer(): void {
    this.selectedRecord.set(null);
  }

  createTagout(): void {
    this.router.navigate(["/afterAuth/other-utilities/tag-in-tag-out/create-tagout"]);
  }

  readonly fromDate = signal<string>("");
  readonly toDate = signal<string>("");
  readonly isLoading = signal<boolean>(false);

  // Master Tag Records
  readonly tagRecords = signal<TagRecord[]>([]);

  ngOnInit(): void {
    this.fetchTagouts();
  }

  fetchTagouts(): void {
    this.isLoading.set(true);
    const filters = {
      from_date: this.fromDate(),
      to_date: this.toDate(),
      department: this.selectedDepartment(),
    };
    this.commonApiService.getTagoutList(filters).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res && Array.isArray(res)) {
          const mapped: TagRecord[] = res.map(
            (item: TagoutItem, index: number) => {
              const statusStr = (item.approval_status || "").toLowerCase();
              let statusVal: "Tagged Out" | "Tagged In" | "Pending Approval" =
                "Tagged Out";
              if (statusStr === "in_progress" || statusStr === "pending") {
                statusVal = "Pending Approval";
              } else if (
                statusStr === "tagged_in" ||
                statusStr === "completed"
              ) {
                statusVal = "Tagged In";
              }

              let equipName = item.name_of_component || item.name_of_subsystem;
              if (!equipName) {
                if (typeof item.tagout_equipment_name === "string") {
                  equipName = item.tagout_equipment_name;
                } else if (item.tagout_equipment_name) {
                  equipName = `Equipment #${item.tagout_equipment_name}`;
                } else {
                  equipName = "-";
                }
              }

              const hodStatusRaw = item.approval_status || "Pending";
              const formattedHodStatus =
                hodStatusRaw.charAt(0).toUpperCase() + hodStatusRaw.slice(1).toLowerCase();

              return {
                id: item.id,
                sNo: index + 1,
                tagNo: item.tagout_number || `TAG-2026-00${item.id}`,
                equipmentName: equipName,
                isolationBoundary:
                  item.special_instructions || item.tagout_description || "-",
                taggedBy: item.tagout_maintainer_name_rank || "-",
                dateTagged: item.date || "-",
                status: statusVal,
                hodApprovalStatus: formattedHodStatus,
                remark: item.remarks || item.remark || item.special_instructions || "-",
                rawItem: item as unknown as Record<string, unknown>,
              };
            }
          );
          this.tagRecords.set(mapped);
        } else {
          this.tagRecords.set([]);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        console.warn("API GET /api/v1/inout-tags/tag-outs/ fallback", err);
        this.tagRecords.set([]);
      },
    });
  }

  onSearch(): void {
    this.fetchTagouts();
  }

  private extractEquipmentId(raw: Record<string, unknown>): number | null {
    const equip = raw["tagout_equipment_name"];
    if (typeof equip === "number" && equip > 0) {
      return equip;
    }
    if (equip && typeof equip === "object" && Number((equip as Record<string, unknown>)["id"]) > 0) {
      return Number((equip as Record<string, unknown>)["id"]);
    }
    const detail = raw["tagout_equipment_name_detail"] as Record<string, unknown> | undefined;
    if (detail && Number(detail["id"]) > 0) {
      return Number(detail["id"]);
    }
    if (typeof equip === "string" && !Number.isNaN(Number(equip)) && Number(equip) > 0) {
      return Number(equip);
    }
    return null;
  }

  private extractDepartments(raw: Record<string, unknown>): number[] {
    let rawDepts: unknown[] = [];
    if (Array.isArray(raw["departments_affected"])) {
      rawDepts = raw["departments_affected"];
    } else if (Array.isArray(raw["department_affected"])) {
      rawDepts = raw["department_affected"];
    }

    return rawDepts
      .map((d: unknown) => (typeof d === "object" && d !== null ? (d as Record<string, unknown>)["id"] : Number(d)))
      .map(Number)
      .filter((id: number) => !Number.isNaN(id) && id > 0);
  }

  private buildApprovePayload(record: TagRecord, status: string, remark: string): Record<string, unknown> {
    const raw = (record.rawItem || {}) as Record<string, unknown>;
    const today = new Date().toISOString().split("T")[0];

    const equipId = this.extractEquipmentId(raw);
    const depts = this.extractDepartments(raw);

    const payload: Record<string, unknown> = {
      date: raw["date"] || (record.dateTagged !== "-" ? record.dateTagged : today),
      name_of_subsystem: raw["name_of_subsystem"] || "N/A",
      name_of_component: raw["name_of_component"] || (record.equipmentName !== "-" ? record.equipmentName : "N/A"),
      serial_number_of_component: raw["serial_number_of_component"] || raw["serial_no_of_component"] || "N/A",
      pattern_number_of_component: raw["pattern_number_of_component"] || raw["pattern_no_of_components"] || "N/A",
      weight_of_component: raw["weight_of_component"] || raw["weight_of_item"] || "-",
      type: raw["type"] || "danger",
      condition: raw["condition"] || "ops",
      special_instructions: raw["special_instructions"] || (record.isolationBoundary !== "-" ? record.isolationBoundary : "None"),
      expected_date_of_tagin: raw["expected_date_of_tagin"] || today,
      tagout_reason: raw["tagout_reason"] || "ty_loan_rtlapp",
      tagout_description: raw["tagout_description"] || (record.isolationBoundary !== "-" ? record.isolationBoundary : "TagOut"),
      tagout_maintainer_name_rank: raw["tagout_maintainer_name_rank"] || (record.taggedBy !== "-" ? record.taggedBy : "Maintainer"),
      ty_loan_ship: raw["ty_loan_ship"] || "",
      ty_authority: raw["ty_authority"] || "",
      ty_item_taken_by: raw["ty_item_taken_by"] || "",
      ty_additional_items: raw["ty_additional_items"] || "",
      survery_demand_authority: raw["survery_demand_authority"] || raw["survey_authority"] || "",
      repair_ra_number: raw["repair_ra_number"] || raw["ra_number"] || "",
      repair_landed_details: raw["repair_landed_details"] || raw["oem_details"] || "",
      repair_item_taken_by: raw["repair_item_taken_by"] || "",
      repair_additional_items: raw["repair_additional_items"] || "",
      aber_authority: raw["aber_authority"] || "",
      replacement_item: raw["replacement_item"] || "",
      estimated_bom_arrival_date: raw["estimated_bom_arrival_date"] || today,
      approval_status: status.toLowerCase(),
      remark: remark || "",
      remarks: remark || "",
    };

    if (equipId && equipId > 0) {
      payload["tagout_equipment_name"] = equipId;
    }

    if (depts.length > 0) {
      payload["departments_affected"] = depts;
    }

    return payload;
  }

  approveDirectly(record: TagRecord): void {
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
      const payload = this.buildApprovePayload(record, "approved", record.remark || "");
      this.commonApiService
        .updateTagoutApproval(record.id, "approved", record.remark || "", payload)
        .subscribe({
          error: (err) => {
            console.warn("API updateTagoutApproval fallback", err);
          },
        });
    }
  }

  openRejectModal(record: TagRecord): void {
    this.activeApprovalRecord.set(record);
    this.approvalStatusInput.set("Rejected");
    const existingRemark = record.remark && record.remark !== "-" ? record.remark : "";
    this.approvalRemarkInput.set(existingRemark);
    this.approvalModalOpen.set(true);
  }

  openApprovalModal(record: TagRecord, targetStatus: string): void {
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
      const payload = this.buildApprovePayload(rec, newStatus, newRemark);
      this.commonApiService
        .updateTagoutApproval(rec.id, newStatus.toLowerCase(), newRemark, payload)
        .subscribe({
          error: (err) => {
            console.warn("API updateTagoutApproval fallback", err);
          },
        });
    }

    this.closeApprovalModal();
  }

  readonly tagColumnDefs = computed<ColDef[]>(() => {
    const isApproval = this.isApprovalMode();
    const base: ColDef[] = [
      { headerName: "Sr No", field: "sNo", width: 75, minWidth: 65 },
      { headerName: "Tag No", field: "tagNo", flex: 1.2, minWidth: 120 },
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
        headerName: "Equipment Name",
        field: "equipmentName",
        flex: 1.6,
        minWidth: 150,
      },
      {
        headerName: "Isolation Boundary",
        field: "isolationBoundary",
        flex: 2,
        minWidth: 170,
      },
      { headerName: "Tagged By", field: "taggedBy", flex: 1.2, minWidth: 120 },
      {
        headerName: "Date Tagged",
        field: "dateTagged",
        flex: 1.1,
        minWidth: 110,
      },
      {
        headerName: "Status",
        field: "status",
        flex: 1.4,
        minWidth: 155,
        cellRenderer: (params: ICellRendererParams) => {
          const status =
            typeof params.value === "string" ? params.value : "Tagged Out";
          let style =
            "background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);";
          if (status === "Tagged In") {
            style =
              "background: rgba(6,182,212,0.15); color: #06b6d4; border: 1px solid rgba(6,182,212,0.3);";
          } else if (status === "Pending Approval") {
            style =
              "background: rgba(168,85,247,0.15); color: #a855f7; border: 1px solid rgba(168,85,247,0.3);";
          }
          return `<span style="padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; ${style}">${status}</span>`;
        },
      },
    ];

    if (isApproval) {
      base.push(
        {
          headerName: "HOD REMARK",
          field: "remark",
          flex: 2,
          minWidth: 200,
          cellRenderer: (params: ICellRendererParams) => {
            const val = params.value || "-";
            return `<span class="text-slate-300 text-xs italic truncate" title="${val}">${val}</span>`;
          },
        },
        {
          headerName: "APPROVAL ACTION",
          field: "action",
          flex: 2,
          minWidth: 210,
          cellRenderer: TagoutApprovalActionRenderer,
          cellRendererParams: {
            approveLabel: "Approve",
            rejectLabel: "Reject",
            onApprove: (row: TagRecord) => this.approveDirectly(row),
            onReject: (row: TagRecord) => this.openRejectModal(row),
          },
        }
      );
    }

    return base;
  });

  readonly globalSearch = signal<string>("");
  readonly selectedDepartment = signal<string>("ALL");

  readonly departmentOptions = [
    "ALL",
    "ADMIN",
    "ELECTRICAL",
    "ENGINEERING",
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

  readonly filteredRecords = computed(() => {
    let list = this.tagRecords();

    const fDate = this.fromDate();
    const tDate = this.toDate();
    if (fDate || tDate) {
      const fTime = fDate ? new Date(fDate).getTime() : 0;
      const tTime = tDate ? new Date(tDate).getTime() + 86400000 - 1 : Infinity;

      list = list.filter((r) => {
        if (!r.dateTagged || r.dateTagged === "-") return true;
        const itemTime = new Date(r.dateTagged).getTime();
        if (Number.isNaN(itemTime)) return true;
        return itemTime >= fTime && itemTime <= tTime;
      });
    }

    const dept = this.selectedDepartment();
    if (dept && dept !== "ALL" && dept !== "All") {
      list = list.filter((r) => {
        const itemDept = String(
          r.equipmentName || r.taggedBy || ""
        ).toUpperCase();
        return itemDept.includes(dept.toUpperCase());
      });
    }
    const search = this.globalSearch().toLowerCase().trim();
    if (!search) return list;

    return list.filter((r) => {
      return (
        r.sNo.toString().includes(search) ||
        r.tagNo.toLowerCase().includes(search) ||
        r.equipmentName.toLowerCase().includes(search) ||
        r.isolationBoundary.toLowerCase().includes(search) ||
        r.taggedBy.toLowerCase().includes(search) ||
        r.dateTagged.toLowerCase().includes(search) ||
        r.status.toLowerCase().includes(search) ||
        r.hodApprovalStatus?.toLowerCase().includes(search) ||
        r.remark?.toLowerCase().includes(search)
      );
    });
  });
}
