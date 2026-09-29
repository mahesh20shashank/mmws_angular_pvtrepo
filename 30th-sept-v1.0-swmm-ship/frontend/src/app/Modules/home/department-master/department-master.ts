import { ButtonComponent } from '../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { ColDef, ICellRendererParams, RowData, RowNode } from "ag-grid-community";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { Call } from "../../../Core/http/services/call";
import { HomeApi } from "../services/home-api";
import { AdministrationApi } from "../../administration/services/administration-api";
import { NotificationService } from "../../../Core/services/notification/notification.service";
import { ModalComponent } from "../../../shared/components/modal/modal.component";
import { MasterCard } from "../../refit-maintenance/master-card/master-card";
import { IconComponent } from "../../../shared/components/icon/icon.component";
import { ExportToolbar, ExportKind } from "../../../shared/components/export-toolbar/export-toolbar";
import { PrintColumn, ReportExportService } from "../../../Core/services/export/generic-export.service";
import { DataGrid } from "../../../shared/components/data-grid/data-grid";
import { ActionRendererComponent } from "../../../shared/components/data-grid/grid-action-icons";
import {
  CoMessageApi,
  CommandMessage,
  CrewDetail,
  LoginPageImage,
  LoginPageImageApi,
  MasterNavGroup,
  MemberDetailApi,
  MemberDetailPayload,
  QuoteApi,
  QuoteOfTheDay,
  ShipOfficer,
  ShipRole,
  ShipRoleApi,
  UpcomingEvent,
  UpcomingEventApi,
} from "./department-master.model";
import { HelpGuidance } from '../../../shared/components/help-guidance/help-guidance';
import { ConfirmDeleteModal } from "../../../shared/components/confirm-delete-modal/confirm-delete-modal";

const HELP_HTML = `
  <ul class="list-disc pl-4 mb-2 space-y-1">
    <li class="pb-1 leading-relaxed">
      The chart runs 
      <span class="whitespace-nowrap"><strong>Commanding Officer</strong> →</span> 
      <span class="whitespace-nowrap"><strong>Head of Department</strong> →</span> 
      <span class="whitespace-nowrap"><strong>Divisional Officer</strong> →</span> 
      <span class="whitespace-nowrap"><strong>Division</strong> →</span> 
      <span class="whitespace-nowrap"><strong>Sailor.</strong></span> 
      Switch to <strong>Edit Mode</strong> to add or change anything.
    </li>
    <li class="pb-1 leading-relaxed">A Divisional Officer may hold <strong>further Divisional Officers</strong>, up to five officer levels below the HOD card.</li>
    <li class="pb-1 leading-relaxed">An officer's children are <strong>all one kind</strong>. Once a Division exists under an officer, that level offers only <strong>+ Add Division</strong>, so further divisions can still be added there. A <strong>Division is terminal</strong> — it holds sailors only, never another officer.</li>
    <li class="pb-1 leading-relaxed">A Divisional Officer placed <strong>directly under a HOD</strong> may be tagged as the <strong>Departmental Officer</strong> (the Dy HOD billet).</li>
    <li class="pb-1 leading-relaxed"><strong>Advisory, not enforced:</strong> a division is best kept to roughly <strong>11 to 15 sailors.</strong> Larger or smaller divisions are accepted and nothing will block you — treat this as a planning guide only.</li>
    <li class="pb-1 leading-relaxed">Click a Division card to open its sailor list. Inside that list, click a sailor's <strong>name</strong> to see their photo, and in Edit Mode to upload or replace it. A sailor photo is <strong>optional;</strong> the default photo is shown when none has been uploaded.</li>
  </ul>
`;


function toCrewDetail(api: MemberDetailApi, serNo: number): CrewDetail {
  return {
    id: api.id,
    serNo,
    fullName: api.name,
    designation: api.designation,
    rank: api.rank,
    image: api.image_path || "assets/images/demo_pic.jpg",
  };
}

function toShipOfficer(api: MemberDetailApi, serNo: number): ShipOfficer {
  return {
    id: api.id,
    serNo,
    fullName: api.name,
    designation: api.designation,
    rank: api.rank,
    dateOfJoining: api.date_of_joining ?? null,
    image: api.image_path || "assets/images/demo_pic.jpg",
  };
}

function toQuoteOfTheDay(api: QuoteApi, serNo: number): QuoteOfTheDay {
  return {
    id: api.id,
    serNo,
    quote: api.quoteText,
    uploadedDate: api.addedDate,
    active: api.is_active,
  };
}

function toCommandMessage(api: CoMessageApi, serNo: number): CommandMessage {
  return {
    id: api.id,
    serNo,
    message: api.message,
    uploadedDate: api.uploaded_date,
    validTillDate: api.valid_till_date,
  };
}

function toUpcomingEvent(api: UpcomingEventApi, serNo: number): UpcomingEvent {
  return {
    id: api.id,
    serNo,
    eventName: api.title,
    startDate: api.start_date,
    endDate: api.end_date,
    document: api.document,
    uploadedDate: api.created_at,
  };
}

function toLoginPageImage(api: LoginPageImageApi): LoginPageImage {
  return {
    id: api.id,
    image: api.image,
    name: api.name,
    designation: api.designation,
    uploadedAt: api.uploaded_at,
  };
}

function toShipRole(api: ShipRoleApi, serNo: number): ShipRole {
  return {
    id: api.id,
    serNo,
    title: api.role_title ?? "",
    description: api.current_text,
    uploadedDate: api.uploaded_date,
    images: api.images,
  };
}

export interface QuoteActionParams extends ICellRendererParams {
  activate?: (quote: QuoteOfTheDay) => void;
  edit?: (quote: QuoteOfTheDay) => void;
  delete?: (quote: QuoteOfTheDay) => void;
}

@Component({
  selector: "app-quote-action-renderer",
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .quote-btn-activated {
        height: 30px;
        padding: 0 16px;
        font-size: 13px;
        font-weight: 600;
        border-radius: 6px;
        border: 1px solid var(--border-primary, #d1d5db);
        background-color: var(--bg-card, #ffffff) !important;
        color: var(--text-muted, #9ca3af) !important;
        white-space: nowrap;
        cursor: not-allowed;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      }

      .quote-btn-activate {
        height: 30px;
        padding: 0 16px;
        font-size: 13px;
        font-weight: 600;
        border-radius: 6px;
        border: 1px solid var(--border-primary, #d1d5db);
        background-color: var(--bg-card, #ffffff) !important;
        color: var(--accent-blue, #1d96e9) !important;
        white-space: nowrap;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        transition: all 0.15s ease;
      }

      .quote-btn-activate:hover {
        background-color: rgba(29, 150, 233, 0.08) !important;
        border-color: var(--accent-blue, #1d96e9) !important;
      }

      :host-context([data-theme="dark"]) .quote-btn-activated,
      :host-context([data-theme="dark"]) .quote-btn-activate {
        background-color: var(--bg-card, #1e293b) !important;
        border-color: var(--border-primary, #374151) !important;
      }

      :host-context([data-theme="dark"]) .quote-btn-activated {
        color: #9ca3af !important;
      }

      :host-context([data-theme="dark"]) .quote-btn-activate:hover {
        background-color: rgba(255, 255, 255, 0.06) !important;
      }

      .action-btn {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        outline: none;
        cursor: pointer;
        border-radius: 7px;
        background: var(--sfd-chip-bg, rgba(255, 255, 255, 0.06));
        transition: background-color 0.15s ease;
      }

      .action-btn:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .action-btn:focus-visible {
        outline: 2px solid rgba(127, 179, 224, 0.5);
        outline-offset: 2px;
      }
    `,
  ],
  template: `
    <div class="flex items-center gap-2 h-full py-0.5">
      @if (quote?.active) {
        <button
          type="button"
          disabled
          class="quote-btn-activated"
        >
          Activated
        </button>
      } @else {
        <button
          type="button"
          (click)="onActivate($event)"
          class="quote-btn-activate"
        >
          Activate
        </button>
      }

      <button
        type="button"
        title="Edit"
        (click)="onEdit($event)"
        class="action-btn"
      >
        <app-icon name="square-pen" [size]="14" color="#7fb3e0" />
      </button>

      <button
        type="button"
        title="Delete"
        (click)="onDelete($event)"
        class="action-btn"
      >
        <app-icon name="trash" [size]="14" color="#F82C36" />
      </button>
    </div>
  `,
})
export class QuoteActionRendererComponent implements ICellRendererAngularComp {
  quote: QuoteOfTheDay | null = null;
  private params: QuoteActionParams | null = null;

  agInit(
    params: QuoteActionParams
  ): void {
    this.params = params;
    this.quote = (params.data as QuoteOfTheDay) ?? null;
  }

  refresh(params: QuoteActionParams): boolean {
    this.params = params;
    this.quote = (params.data as QuoteOfTheDay) ?? null;
    return true;
  }

  onActivate(event: MouseEvent): void {
    event.stopPropagation();
    if (this.quote && !this.quote.active && typeof this.params?.activate === "function") {
      this.params.activate(this.quote);
    }
  }

  onEdit(event: MouseEvent): void {
    event.stopPropagation();
    if (this.quote && typeof this.params?.edit === "function") {
      this.params.edit(this.quote);
    }
  }

  onDelete(event: MouseEvent): void {
    event.stopPropagation();
    if (this.quote && typeof this.params?.delete === "function") {
      this.params.delete(this.quote);
    }
  }
}

@Component({
  selector: "app-department-master",
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, MasterCard, IconComponent, ExportToolbar, DataGrid, HelpGuidance, ConfirmDeleteModal, ButtonComponent],
  templateUrl: "./department-master.html",
  styleUrl: "./department-master.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DepartmentMasterComponent implements OnInit {
  private readonly call = inject(Call);
  private readonly homeApi = inject(HomeApi);
  private readonly adminApi = inject(AdministrationApi);
  private readonly notify = inject(NotificationService);
  private readonly exportService = inject(ReportExportService);
  readonly helpHtml = HELP_HTML;
  @ViewChild(DataGrid) dataGrid!: DataGrid;

  readonly navGroups: MasterNavGroup[] = [
    {
      title: "Dashboard",
      items: [
        { key: "quote-of-the-day", label: "Quote of The Day", icon: "message-square-text" },
        { key: "ship-role", label: "Ship Role", icon: "ship" },
        { key: "message-from-command", label: "Message From Command", icon: "send" },
        { key: "upcoming-event-updates", label: "Upcoming Event Updates", icon: "bell" },
        { key: "crew-details", label: "Crew Details", icon: "users" },
        { key: "ship-officers-scrollbar", label: "Ship Officers for Scrollbar", icon: "user-check" },
      ],
    },
    {
      title: "Landing Page - Admiral pics",
      items: [{ key: "login-page-image", label: "Admiral Photos", icon: "image" }],
    },
  ];

  readonly activeKey = signal("crew-details");

  readonly activeLabel = computed(
    () => this.navGroups.flatMap((g) => g.items).find((i) => i.key === this.activeKey())?.label ?? "",
  );

  readonly searchText = signal("");
  readonly pageSize = signal(10);

  readonly crewLoading = signal(true);
  readonly crewList = signal<CrewDetail[]>([]);

  readonly filteredCrew = computed(() => {
    const search = this.searchText().trim().toLowerCase();
    const rows = this.crewList();
    if (!search) return rows;
    return rows.filter((c) =>
      [c.fullName, c.designation, c.rank].some((v) => v.toLowerCase().includes(search)),
    );
  });

  readonly crewColumnDefs: ColDef[] = [
    { field: "serNo", headerName: "Ser No.", maxWidth: 100, filter: false },
    { field: "fullName", headerName: "Full Name", flex: 2, minWidth: 180, filter: "agTextColumnFilter", floatingFilter: true },
    { field: "designation", headerName: "Designation", flex: 2, minWidth: 160, filter: "agTextColumnFilter", floatingFilter: true },
    { field: "rank", headerName: "Rank", flex: 1, minWidth: 140, filter: "agTextColumnFilter", floatingFilter: true },
    {
      field: "image",
      headerName: "Image",
      maxWidth: 110,
      sortable: false,
      filter: false,
      cellRenderer: (params: { value: string | null }) => {
        const src = params.value || "assets/images/demo_pic.jpg";
        return `<img src="${src}" alt="" style="width:64px;height:40px;border-radius:6px;object-fit:cover;" onerror="this.onerror=null;this.src='assets/images/demo_pic.jpg';" />`;
      },
    },
    {
      headerName: "Actions",
      minWidth: 110,
      maxWidth: 110,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: RowData) => [
          {
            icon: "edit",
            label: "Edit",
            color: "#2563eb",
            action: () => this.openEditModal(row as unknown as CrewDetail),
          },
          {
            icon: "delete",
            label: "Delete",
            color: "#dc2626",
            action: () => this.deleteCrew(row as unknown as CrewDetail),
          },
        ],
      },
    },
  ];

  readonly showFormModal = signal(false);
  readonly editingCrew = signal<CrewDetail | null>(null);
  readonly formFullName = signal("");
  readonly formDesignation = signal("");
  readonly formRank = signal("");
  readonly formCrewImage = signal<File | null>(null);
  readonly formError = signal("");
  readonly savingCrew = signal(false);

  // --- Ship Officers for Scrollbar Section ---
  readonly officerRankOptions = signal<string[]>([]);

  readonly officerLoading = signal(true);
  readonly officerList = signal<ShipOfficer[]>([]);

  readonly filteredOfficers = computed(() => {
    const search = this.searchText().trim().toLowerCase();
    const rows = this.officerList();
    if (!search) return rows;
    return rows.filter((o) =>
      [o.fullName, o.designation, o.rank, o.dateOfJoining || ""].some((v) =>
        (v ?? "").toLowerCase().includes(search)
      )
    );
  });

  readonly officerColumnDefs: ColDef[] = [
    { field: "serNo", headerName: "SER NO.", maxWidth: 100, filter: false },
    { field: "fullName", headerName: "FULL NAME", flex: 2, minWidth: 160, filter: "agTextColumnFilter", floatingFilter: true },
    { field: "designation", headerName: "DESIGNATION", flex: 2, minWidth: 160, filter: "agTextColumnFilter", floatingFilter: true },
    { field: "rank", headerName: "RANK", flex: 1.5, minWidth: 140, filter: "agTextColumnFilter", floatingFilter: true },
    { field: "dateOfJoining", headerName: "DATE OF JOINING", flex: 1.5, minWidth: 140, valueFormatter: (p) => (p["value"] as string) || "—" },
    {
      field: "image",
      headerName: "IMAGE",
      maxWidth: 110,
      sortable: false,
      filter: false,
      cellRenderer: (params: { value: string | null }) => {
        const src = params.value || "assets/images/demo_pic.jpg";
        return `<img src="${src}" alt="" style="width:48px;height:36px;border-radius:4px;object-fit:cover;" onerror="this.onerror=null;this.src='assets/images/demo_pic.jpg';" />`;
      },
    },
    {
      headerName: "ACTIONS",
      minWidth: 110,
      maxWidth: 110,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: RowData) => [
          {
            icon: "edit",
            label: "Edit",
            color: "#2563eb",
            action: () => this.openEditOfficerModal(row as unknown as ShipOfficer),
          },
          {
            icon: "delete",
            label: "Delete",
            color: "#dc2626",
            action: () => this.deleteOfficer(row as unknown as ShipOfficer),
          },
        ],
      },
    },
  ];

  readonly showOfficerModal = signal(false);
  readonly editingOfficer = signal<ShipOfficer | null>(null);
  readonly officerFullName = signal("");
  readonly officerDesignation = signal("");
  readonly officerRank = signal("Select Rank");
  readonly officerDateOfJoining = signal("");
  readonly officerImageFile = signal<File | null>(null);
  readonly officerImagePreview = signal<string | null>(null);
  readonly officerFormError = signal("");
  readonly savingOfficer = signal(false);

  openAddOfficerModal(): void {
    this.editingOfficer.set(null);
    this.officerFullName.set("");
    this.officerDesignation.set("");
    this.officerRank.set("Select Rank");
    this.officerDateOfJoining.set("");
    this.officerImageFile.set(null);
    this.officerImagePreview.set(null);
    this.officerFormError.set("");
    this.showOfficerModal.set(true);
  }

  async openEditOfficerModal(officer: ShipOfficer): Promise<void> {
    this.editingOfficer.set(officer);
    this.officerFullName.set(officer.fullName);
    this.officerDesignation.set(officer.designation);
    this.officerRank.set(officer.rank || "Select Rank");
    this.officerDateOfJoining.set(officer.dateOfJoining || "");
    this.officerImageFile.set(null);
    this.officerImagePreview.set(officer.image || null);
    this.officerFormError.set("");
    this.showOfficerModal.set(true);

    try {
      const detail = await firstValueFrom(this.homeApi.getMemberDetailById(officer.id));
      if (detail) {
        this.officerFullName.set(detail.name ?? officer.fullName);
        this.officerDesignation.set(detail.designation ?? officer.designation);
        this.officerRank.set(detail.rank || officer.rank || "Select Rank");
        this.officerDateOfJoining.set(detail.date_of_joining ?? officer.dateOfJoining ?? "");
        this.officerImagePreview.set(detail.image_path || officer.image || null);
      }
    } catch {
      // fallback values already populated above
    }
  }

  closeOfficerModal(): void {
    this.showOfficerModal.set(false);
    this.editingOfficer.set(null);
  }

  onOfficerFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.officerImageFile.set(file);
      const reader = new FileReader();
      reader.onload = (e) => this.officerImagePreview.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  async saveOfficer(): Promise<void> {
    const name = this.officerFullName().trim();
    const desig = this.officerDesignation().trim();
    const rank = this.officerRank();
    const dateOfJoining = this.officerDateOfJoining();

    if (!name) {
      this.officerFormError.set("Full Name is required.");
      return;
    }
    if (!desig) {
      this.officerFormError.set("Designation is required.");
      return;
    }
    if (!rank || rank === "Select Rank") {
      this.officerFormError.set("Rank is required.");
      return;
    }

    this.savingOfficer.set(true);

    const payload = new FormData();
    payload.append("name", name);
    payload.append("designation", desig);
    payload.append("rank", rank);
    if (dateOfJoining) {
      payload.append("date_of_joining", dateOfJoining);
    }

    if (this.officerImageFile()) {
      payload.append("image_path", this.officerImageFile() as File);
    }

    const edit = this.editingOfficer();

    try {
      if (edit) {
        await firstValueFrom(this.homeApi.updateMemberDetail(edit.id, payload));
      } else {
        await firstValueFrom(this.homeApi.createMemberDetail(payload));
      }
      this.closeOfficerModal();
      await this.loadOfficerList();
    } catch {
      this.notify.error("Failed to save officer details.");
    } finally {
      this.savingOfficer.set(false);
    }
  }

  deleteOfficer(officer: ShipOfficer): void {
    this.pendingDelete.set({ type: 'officer', data: officer });
  }

  readonly quoteLoading = signal(true);
  readonly quoteList = signal<QuoteOfTheDay[]>([]);

  readonly filteredQuotes = computed(() => {
    const search = this.searchText().trim().toLowerCase();
    const rows = this.quoteList();
    if (!search) return rows;
    return rows.filter((q) =>
      [q.quote, q.uploadedDate].some((v) => (v ?? "").toLowerCase().includes(search)),
    );
  });

  readonly quoteColumnDefs: ColDef[] = [
    { field: "serNo", headerName: "Ser No.", maxWidth: 100, filter: false },
    { field: "quote", headerName: "Quote", flex: 2, minWidth: 220, filter: "agTextColumnFilter", floatingFilter: true },
    {
      field: "uploadedDate",
      headerName: "Uploaded Date",
      flex: 1,
      minWidth: 160,
      filter: "agTextColumnFilter",
      floatingFilter: true,
    },
    {
      headerName: "Actions",
      minWidth: 200,
      maxWidth: 220,
      sortable: false,
      filter: false,
      cellRenderer: QuoteActionRendererComponent,
      cellRendererParams: {
        activate: (quote: QuoteOfTheDay) => this.activateQuote(quote),
        edit: (quote: QuoteOfTheDay) => this.openEditQuoteModal(quote),
        delete: (quote: QuoteOfTheDay) => this.deleteQuote(quote),
      },
    },
  ];

  readonly showQuoteModal = signal(false);
  readonly editingQuote = signal<QuoteOfTheDay | null>(null);
  readonly formQuote = signal("");
  readonly quoteFormError = signal("");
  readonly savingQuote = signal(false);

  readonly MAX_SHIP_ROLE_IMAGES = 5;
  readonly shipRoleLoading = signal(true);
  readonly shipRoleList = signal<ShipRole[]>([]);

  readonly filteredShipRoles = computed(() => {
    const search = this.searchText().trim().toLowerCase();
    const rows = this.shipRoleList();
    if (!rows.length) return [];
    if (!search) return [rows[0]];
    const filtered = rows.filter((r) =>
      [r.title, r.description, r.uploadedDate].some((v) => (v ?? "").toLowerCase().includes(search)),
    );
    return filtered.length ? [filtered[0]] : [];
  });

  readonly shipRoleColumnDefs: ColDef[] = [
    { field: "serNo", headerName: "Ser No.", maxWidth: 100, filter: false },
    { field: "title", headerName: "Ship Role Title", flex: 2, minWidth: 180, filter: "agTextColumnFilter", floatingFilter: true },
    { field: "description", headerName: "Description", flex: 2, minWidth: 220, filter: "agTextColumnFilter", floatingFilter: true },
    {
      field: "uploadedDate",
      headerName: "Uploaded Date",
      flex: 1,
      minWidth: 160,
      filter: "agTextColumnFilter",
      floatingFilter: true,
    },
    {
      field: "images",
      headerName: "Images",
      minWidth: 150,
      flex: 1,
      sortable: false,
      filter: false,
      cellRenderer: (params: { value: { image: string }[] }) => {
        const list = params.value;
        if (!list || !list.length) return "-";
        const firstImg = list[0]?.image || "";
        if (!firstImg) return "-";
        const remainingCount = list.length - 1;
        const imgHtml = `<img src="${firstImg}" alt="" style="width:32px;height:32px;border-radius:4px;object-fit:cover;border:1px solid var(--border-primary, #cbd5e1);" />`;
        const moreHtml = remainingCount > 0
          ? `<span style="font-size:0.85rem;font-weight:600;color:var(--accent-blue, #2563eb);white-space:nowrap;">+${remainingCount} more</span>`
          : "";
        return `<div style="display:flex;align-items:center;gap:8px;height:100%;">${imgHtml}${moreHtml}</div>`;
      },
    },
    {
      headerName: "Actions",
      minWidth: 120,
      maxWidth: 120,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: RowData) => [
          {
            icon: "edit",
            label: "Edit",
            color: "#2563eb",
            action: () => this.openEditShipRoleModal(row as unknown as ShipRole),
          },
          {
            icon: "view",
            label: "Preview",
            color: "#2563eb",
            action: () => this.openImagePreview(row as unknown as ShipRole),
          },
          {
            icon: "delete",
            label: "Delete",
            color: "#dc2626",
            action: () => this.deleteShipRole(row as unknown as ShipRole),
          },
        ],
      },
    },
  ];

  readonly commandMessageLoading = signal(true);
  readonly commandMessageList = signal<CommandMessage[]>([]);

  readonly filteredCommandMessages = computed(() => {
    const search = this.searchText().trim().toLowerCase();
    const rows = this.commandMessageList();
    if (!search) return rows;
    return rows.filter((m) =>
      [m.message, m.uploadedDate, m.validTillDate].some((v) => (v ?? "").toLowerCase().includes(search)),
    );
  });

  readonly commandMessageColumnDefs: ColDef[] = [
    { field: "serNo", headerName: "Ser No.", maxWidth: 100, filter: false },
    {
      field: "message",
      headerName: "Command Message",
      flex: 2,
      minWidth: 220,
      filter: "agTextColumnFilter",
      floatingFilter: true,
    },
    {
      field: "uploadedDate",
      headerName: "Uploaded Date",
      flex: 1,
      minWidth: 160,
      filter: "agTextColumnFilter",
      floatingFilter: true,
    },
    {
      field: "validTillDate",
      headerName: "Valid Till",
      flex: 1,
      minWidth: 160,
      filter: "agTextColumnFilter",
      floatingFilter: true,
    },
    {
      headerName: "Actions",
      minWidth: 120,
      maxWidth: 120,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: RowData) => [
          {
            icon: "edit",
            label: "Edit",
            color: "#2563eb",
            action: () => this.openEditCommandMessageModal(row as unknown as CommandMessage),
          },
          {
            icon: "delete",
            label: "Delete",
            color: "#dc2626",
            action: () => this.deleteCommandMessage(row as unknown as CommandMessage),
          },
        ],
      },
    },
  ];

  readonly showCommandMessageModal = signal(false);
  readonly editingCommandMessage = signal<CommandMessage | null>(null);
  readonly formCommandMessage = signal("");
  readonly formCommandMessageValidTill = signal("");
  readonly commandMessageFormError = signal("");
  readonly savingCommandMessage = signal(false);

  readonly eventLoading = signal(true);
  readonly eventList = signal<UpcomingEvent[]>([]);

  readonly filteredEvents = computed(() => {
    const search = this.searchText().trim().toLowerCase();
    const rows = this.eventList();
    if (!search) return rows;
    return rows.filter((e) =>
      [e.eventName, e.uploadedDate, e.startDate, e.endDate].some((v) => (v ?? "").toLowerCase().includes(search)),
    );
  });

  readonly eventColumnDefs: ColDef[] = [
    { field: "serNo", headerName: "Ser No.", maxWidth: 100, filter: false },
    { field: "eventName", headerName: "Event Name", flex: 2, minWidth: 200, filter: "agTextColumnFilter", floatingFilter: true },
    {
      field: "uploadedDate",
      headerName: "Uploaded Date",
      flex: 1,
      minWidth: 160,
      filter: "agTextColumnFilter",
      floatingFilter: true,
    },
    {
      headerName: "Event Date",
      flex: 1,
      minWidth: 160,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      valueGetter: (params: { data: unknown }) => {
        const row = params.data as UpcomingEvent;
        return row.endDate && row.endDate !== row.startDate
          ? `${row.startDate} - ${row.endDate}`
          : row.startDate;
      },
    },
    {
      headerName: "Actions",
      minWidth: 150,
      maxWidth: 150,
      sortable: false,
      filter: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: RowData) => [
          {
            icon: "view",
            label: "Preview",
            color: "#2563eb",
            action: () => this.openEventPreview(row as unknown as UpcomingEvent),
          },
          {
            icon: "edit",
            label: "Edit",
            color: "#2563eb",
            action: () => this.openEditEventModal(row as unknown as UpcomingEvent),
          },
          {
            icon: "delete",
            label: "Delete",
            color: "#dc2626",
            action: () => this.deleteEvent(row as unknown as UpcomingEvent),
          },
        ],
      },
    },
  ];

  readonly showEventModal = signal(false);
  readonly editingEvent = signal<UpcomingEvent | null>(null);
  readonly eventDayType = signal<"single" | "multiple">("single");
  readonly formEventDate = signal("");
  readonly formEventStartDate = signal("");
  readonly formEventEndDate = signal("");
  readonly formEventName = signal("");
  readonly formEventDocument = signal<File | null>(null);
  readonly eventFormError = signal("");
  readonly savingEvent = signal(false);

  readonly showEventPreviewModal = signal(false);
  readonly previewEvent = signal<UpcomingEvent | null>(null);

  readonly showImagePreviewModal = signal(false);
  readonly previewShipRole = signal<ShipRole | null>(null);

  readonly showShipRoleModal = signal(false);
  readonly editingShipRole = signal<ShipRole | null>(null);
  readonly formShipRoleTitle = signal("");
  readonly formShipRoleDescription = signal("");
  readonly formShipRoleImages = signal<File[]>([]);
  readonly formShipRoleImagePreviews = signal<string[]>([]);
  readonly shipRoleFormError = signal("");
  readonly savingShipRole = signal(false);

  readonly loginImageLoading = signal(true);
  readonly loginImageList = signal<LoginPageImage[]>([]);

  readonly showLoginImageModal = signal(false);
  readonly editingLoginImage = signal<LoginPageImage | null>(null);
  readonly formLoginImage = signal<File | null>(null);
  readonly formLoginImageName = signal("");
  readonly formLoginImageDesignation = signal("");
  readonly loginImageFormError = signal("");
  readonly savingLoginImage = signal(false);

  private get printColumns(): PrintColumn[] {
    const key = this.activeKey();
    if (key === 'crew-details') {
      return [
        { header: 'Ser No.', field: 'serNo' },
        { header: 'Full Name', field: 'fullName' },
        { header: 'Designation', field: 'designation' },
        { header: 'Rank', field: 'rank' },
      ];
    } else if (key === 'quote-of-the-day') {
      return [
        { header: 'Ser No.', field: 'serNo' },
        { header: 'Quote', field: 'quote' },
        { header: 'Uploaded Date', field: 'uploadedDate' },
      ];
    } else if (key === 'ship-role') {
      return [
        { header: 'Ser No.', field: 'serNo' },
        { header: 'Ship Role Title', field: 'title' },
        { header: 'Description', field: 'description' },
        { header: 'Uploaded Date', field: 'uploadedDate' },
      ];
    } else if (key === 'message-from-command') {
      return [
        { header: 'Ser No.', field: 'serNo' },
        { header: 'Command Message', field: 'message' },
        { header: 'Uploaded Date', field: 'uploadedDate' },
        { header: 'Valid Till', field: 'validTillDate' },
      ];
    } else if (key === 'upcoming-event-updates') {
      return [
        { header: 'Ser No.', field: 'serNo' },
        { header: 'Event Name', field: 'eventName' },
        { header: 'Uploaded Date', field: 'uploadedDate' },
        { header: 'Event Date', field: 'eventDate' },
      ];
    } else if (key === 'ship-officers-scrollbar') {
      return [
        { header: 'Ser No.', field: 'serNo' },
        { header: 'Full Name', field: 'fullName' },
        { header: 'Designation', field: 'designation' },
        { header: 'Rank', field: 'rank' },
      ];
    }
    return [];
  }

  private get exportRows(): Record<string, unknown>[] {
    const key = this.activeKey();
    const api = this.dataGrid?.gridApi;

    type GridRow = CrewDetail | ShipOfficer | QuoteOfTheDay | ShipRole | CommandMessage | UpcomingEvent;

    const mapRow = (data: GridRow, index: number): Record<string, unknown> => {
      if (key === 'crew-details' || key === 'ship-officers-scrollbar') {
        const row = data as (CrewDetail | ShipOfficer);
        return {
          serNo: index,
          fullName: row.fullName ?? '',
          designation: row.designation ?? '',
          rank: row.rank ?? '',
        };
      } else if (key === 'quote-of-the-day') {
        const row = data as QuoteOfTheDay;
        return {
          serNo: index,
          quote: row.quote ?? '',
          uploadedDate: row.uploadedDate ?? '',
        };
      } else if (key === 'ship-role') {
        const row = data as ShipRole;
        return {
          serNo: index,
          title: row.title ?? '',
          description: row.description ?? '',
          uploadedDate: row.uploadedDate ?? '',
        };
      } else if (key === 'message-from-command') {
        const row = data as CommandMessage;
        return {
          serNo: index,
          message: row.message ?? '',
          uploadedDate: row.uploadedDate ?? '',
          validTillDate: row.validTillDate ?? '',
        };
      } else if (key === 'upcoming-event-updates') {
        const row = data as UpcomingEvent;
        const eventDate = row.endDate && row.endDate !== row.startDate
          ? `${row.startDate} - ${row.endDate}`
          : (row.startDate ?? '');
        return {
          serNo: index,
          eventName: row.eventName ?? '',
          uploadedDate: row.uploadedDate ?? '',
          eventDate,
        };
      }
      return {};
    };

    if (api) {
      const rows: Record<string, unknown>[] = [];
      const currentPage = api.paginationGetCurrentPage();
      const pageSize = api.paginationGetPageSize();
      const startRow = currentPage * pageSize;
      const endRow = startRow + pageSize;

      if (typeof api['forEachNodeAfterFilterAndSort'] === 'function') {
        api['forEachNodeAfterFilterAndSort']((node: RowNode) => {
          const rowIndex = node['rowIndex'];
          if (typeof rowIndex === 'number' && rowIndex >= startRow && rowIndex < endRow) {
            if (node.data) {
              rows.push(mapRow(node.data as GridRow, rowIndex + 1));
            }
          }
        });
        return rows;
      }
    }

    let sourceList: GridRow[] = [];
    if (key === 'crew-details') sourceList = this.filteredCrew();
    else if (key === 'ship-officers-scrollbar') sourceList = this.filteredOfficers();
    else if (key === 'quote-of-the-day') sourceList = this.filteredQuotes();
    else if (key === 'ship-role') sourceList = this.filteredShipRoles();
    else if (key === 'message-from-command') sourceList = this.filteredCommandMessages();
    else if (key === 'upcoming-event-updates') sourceList = this.filteredEvents();

    return sourceList.map((item, index) => mapRow(item, index + 1));
  }

  onExport(kind: ExportKind): void {
    const title = this.activeLabel();
    const filenamePrefix = title.replace(/\s+/g, '');
    const dateStr = new Date().toISOString().slice(0, 10);

    if (kind === 'excel') {
      this.exportService.downloadExcel(this.printColumns, this.exportRows, `${filenamePrefix}_${dateStr}`);
    } else if (kind === 'pdf') {
      this.exportService.downloadPdf(title, this.printColumns, this.exportRows, `${filenamePrefix}_${dateStr}`);
    } else {
      this.exportService.printRows(title, this.printColumns, this.exportRows);
    }
  }

  copyData(): void {
    void this.exportService.copyRows(this.printColumns, this.exportRows);
  }

  ngOnInit(): void {
    void this.loadRanks();
    void this.loadMemberDetails();
    void this.loadQuotes();
    void this.loadShipRoles();
    void this.loadCommandMessages();
    void this.loadEvents();
    void this.loadLoginImages();
  }

  async loadRanks(): Promise<void> {
    try {
      const res = await firstValueFrom(this.adminApi.getRanks<{ id: number; name: string }[]>());
      if (Array.isArray(res) && res.length) {
        const rankNames = res
          .map((r) => (typeof r === "string" ? r : r.name))
          .filter((name): name is string => Boolean(name) && name !== "Select Rank");
        this.officerRankOptions.set(rankNames);
      }
    } catch {
      // fallback ranks stay active
    }
  }

  async loadMemberDetails(): Promise<void> {
    this.officerLoading.set(true);
    this.crewLoading.set(true);
    try {
      const res = await firstValueFrom(this.homeApi.getMemberDetails());
      const list = res || [];
      this.officerList.set(list.map((api, idx) => toShipOfficer(api, idx + 1)));
      this.crewList.set(list.map((api, idx) => toCrewDetail(api, idx + 1)));
    } catch {
      this.notify.error("Failed to load member details.");
    } finally {
      this.officerLoading.set(false);
      this.crewLoading.set(false);
    }
  }

  loadOfficerList(): Promise<void> {
    return this.loadMemberDetails();
  }

  loadCrewList(): Promise<void> {
    return this.loadMemberDetails();
  }

  async loadQuotes(): Promise<void> {
    this.quoteLoading.set(true);
    try {
      const res = await firstValueFrom(this.homeApi.getQuotes());
      this.quoteList.set((res || []).map((api, idx) => toQuoteOfTheDay(api, idx + 1)));
    } catch {
      this.notify.error("Failed to load quotes.");
    } finally {
      this.quoteLoading.set(false);
    }
  }

  async loadShipRoles(): Promise<void> {
    this.shipRoleLoading.set(true);
    try {
      const res = await firstValueFrom(this.call.getShipRoles());
      this.shipRoleList.set((res || []).map((api, idx) => toShipRole(api, idx + 1)));
    } catch {
      this.notify.error("Failed to load ship roles.");
    } finally {
      this.shipRoleLoading.set(false);
    }
  }

  async loadLoginImages(): Promise<void> {
    this.loginImageLoading.set(true);
    try {
      const res = await firstValueFrom(this.homeApi.getLoginPageImages());
      this.loginImageList.set((res || []).map((api) => toLoginPageImage(api)));
    } catch {
      this.notify.error("Failed to load login page image.");
    } finally {
      this.loginImageLoading.set(false);
    }
  }

  openAddLoginImageModal(): void {
    this.editingLoginImage.set(null);
    this.formLoginImage.set(null);
    this.formLoginImageName.set("");
    this.formLoginImageDesignation.set("");
    this.loginImageFormError.set("");
    this.showLoginImageModal.set(true);
  }

  openEditLoginImageModal(image: LoginPageImage): void {
    this.editingLoginImage.set(image);
    this.formLoginImage.set(null);
    this.formLoginImageName.set(image.name || "");
    this.formLoginImageDesignation.set(image.designation || "");
    this.loginImageFormError.set("");
    this.showLoginImageModal.set(true);
  }

  closeLoginImageModal(): void {
    this.showLoginImageModal.set(false);
  }

  onLoginImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.formLoginImage.set(input.files?.[0] ?? null);
  }

  async saveLoginImage(): Promise<void> {
    const editing = this.editingLoginImage();
    const file = this.formLoginImage();
    if (!editing && !file) {
      this.loginImageFormError.set("Please select an image.");
      return;
    }
    const name = this.formLoginImageName().trim();
    if (!name) {
      this.loginImageFormError.set("Name is required.");
      return;
    }

    const payload = new FormData();
    if (file) payload.append("image", file);
    payload.append("name", name);
    const designation = this.formLoginImageDesignation().trim();
    if (designation) payload.append("designation", designation);

    this.savingLoginImage.set(true);
    try {
      if (editing) {
        const updated = await firstValueFrom(this.homeApi.updateLoginPageImage(editing.id, payload));
        this.loginImageList.set(
          this.loginImageList().map((img) => (img.id === editing.id ? toLoginPageImage(updated) : img)),
        );
      } else {
        // DRF's BooleanField treats a missing key as `false` for multipart/HTML
        // form input (mimicking an unticked checkbox) instead of falling back to
        // the model's `default=True` — so this must be sent explicitly.
        payload.append("is_active", "true");
        let created = await firstValueFrom(this.homeApi.createLoginPageImage(payload));
        if (!created.is_active) {
          const activatePayload = new FormData();
          activatePayload.append("is_active", "true");
          created = await firstValueFrom(this.homeApi.updateLoginPageImage(created.id, activatePayload));
        }
        this.loginImageList.set([toLoginPageImage(created), ...this.loginImageList()]);
      }
      this.closeLoginImageModal();
      await this.loadLoginImages();
    } catch (err) {
      this.notify.error(this.extractErrorMessage(err, "Failed to save login page image."));
    } finally {
      this.savingLoginImage.set(false);
    }
  }

  private extractErrorMessage(err: unknown, fallback: string): string {
    const httpError = err as { error?: { detail?: string; message?: string } };
    return httpError?.error?.detail ?? httpError?.error?.message ?? fallback;
  }

  async loadCommandMessages(): Promise<void> {
    this.commandMessageLoading.set(true);
    try {
      const res = await firstValueFrom(this.call.getCoMessages());
      this.commandMessageList.set((res || []).map((api, idx) => toCommandMessage(api, idx + 1)));
    } catch {
      this.notify.error("Failed to load command messages.");
    } finally {
      this.commandMessageLoading.set(false);
    }
  }

  async loadEvents(): Promise<void> {
    this.eventLoading.set(true);
    try {
      const res = await firstValueFrom(this.call.getEvents());
      this.eventList.set((res || []).map((api, idx) => toUpcomingEvent(api, idx + 1)));
    } catch {
      this.notify.error("Failed to load upcoming event updates.");
    } finally {
      this.eventLoading.set(false);
    }
  }

  selectNav(key: string): void {
    this.activeKey.set(key);
    this.searchText.set("");
  }

  openAddModal(): void {
    this.editingCrew.set(null);
    this.formFullName.set("");
    this.formDesignation.set("");
    this.formRank.set("");
    this.formCrewImage.set(null);
    this.formError.set("");
    this.showFormModal.set(true);
  }

  openEditModal(crew: CrewDetail): void {
    this.editingCrew.set(crew);
    this.formFullName.set(crew.fullName);
    this.formDesignation.set(crew.designation);
    this.formRank.set(crew.rank);
    this.formCrewImage.set(null);
    this.formError.set("");
    this.showFormModal.set(true);
  }

  closeFormModal(): void {
    this.showFormModal.set(false);
  }

  onCrewImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.formCrewImage.set(input.files?.[0] ?? null);
  }

  async saveCrew(): Promise<void> {
    if (!this.formFullName().trim()) {
      this.formError.set("Full name is required.");
      return;
    }
    if (!this.formDesignation().trim()) {
      this.formError.set("Designation is required.");
      return;
    }
    if (!this.formRank().trim()) {
      this.formError.set("Rank is required.");
      return;
    }

    const payload = new FormData();
    payload.append("name", this.formFullName().trim());
    payload.append("designation", this.formDesignation().trim());
    payload.append("rank", this.formRank().trim());
    if (this.formCrewImage()) {
      payload.append("image_path", this.formCrewImage() as File);
    }

    this.savingCrew.set(true);
    try {
      const editing = this.editingCrew();
      if (editing) {
        await firstValueFrom(this.homeApi.updateMemberDetail(editing.id, payload));
      } else {
        await firstValueFrom(this.homeApi.createMemberDetail(payload));
      }
      // this.notify.success("Saved successfully.");
      this.closeFormModal();
      await this.loadCrewList();
    } catch {
      this.notify.error("Failed to save crew details.");
    } finally {
      this.savingCrew.set(false);
    }
  }

  readonly pendingDelete = signal<{
    type: 'crew' | 'officer' | 'quote' | 'commandMessage' | 'event' | 'shipRole' | 'loginImage';
    data: CrewDetail | ShipOfficer | QuoteOfTheDay | CommandMessage | UpcomingEvent | ShipRole | LoginPageImage;
  } | null>(null);

  deleteCrew(crew: CrewDetail): void {
    this.pendingDelete.set({ type: 'crew', data: crew });
  }

  deleteLoginImage(image: LoginPageImage): void {
    this.pendingDelete.set({ type: 'loginImage', data: image });
  }

  openAddQuoteModal(): void {
    this.editingQuote.set(null);
    this.formQuote.set("");
    this.quoteFormError.set("");
    this.showQuoteModal.set(true);
  }

  openEditQuoteModal(quote: QuoteOfTheDay): void {
    this.editingQuote.set(quote);
    this.formQuote.set(quote.quote);
    this.quoteFormError.set("");
    this.showQuoteModal.set(true);
  }

  closeQuoteModal(): void {
    this.showQuoteModal.set(false);
  }

  async saveQuote(): Promise<void> {
    if (!this.formQuote().trim()) {
      this.quoteFormError.set("Quote is required.");
      return;
    }

    const payload = { quoteText: this.formQuote().trim() };

    this.savingQuote.set(true);
    try {
      const editing = this.editingQuote();
      if (editing) {
        await firstValueFrom(this.homeApi.updateQuote(editing.id, payload));
      } else {
        await firstValueFrom(this.homeApi.createQuote(payload));
      }
      // this.notify.success("Saved successfully.");
      this.closeQuoteModal();
      await this.loadQuotes();
    } catch {
      this.notify.error("Failed to save quote.");
    } finally {
      this.savingQuote.set(false);
    }
  }

  deleteQuote(quote: QuoteOfTheDay): void {
    this.pendingDelete.set({ type: 'quote', data: quote });
  }

  async activateQuote(quote: QuoteOfTheDay): Promise<void> {
    try {
      await firstValueFrom(this.homeApi.activateQuote(quote.id));
      await this.loadQuotes();
    } catch {
      this.notify.error("Failed to activate quote.");
    }
  }

  openAddCommandMessageModal(): void {
    this.editingCommandMessage.set(null);
    this.formCommandMessage.set("");
    this.formCommandMessageValidTill.set("");
    this.commandMessageFormError.set("");
    this.showCommandMessageModal.set(true);
  }

  openEditCommandMessageModal(message: CommandMessage): void {
    this.editingCommandMessage.set(message);
    this.formCommandMessage.set(message.message);
    this.formCommandMessageValidTill.set(message.validTillDate);
    this.commandMessageFormError.set("");
    this.showCommandMessageModal.set(true);
  }

  closeCommandMessageModal(): void {
    this.showCommandMessageModal.set(false);
  }

  async saveCommandMessage(): Promise<void> {
    if (!this.formCommandMessage().trim()) {
      this.commandMessageFormError.set("Command message is required.");
      return;
    }
    if (!this.formCommandMessageValidTill()) {
      this.commandMessageFormError.set("Valid till date is required.");
      return;
    }

    const payload = {
      message: this.formCommandMessage().trim(),
      valid_till_date: this.formCommandMessageValidTill(),
    };

    this.savingCommandMessage.set(true);
    try {
      const editing = this.editingCommandMessage();
      if (editing) {
        await firstValueFrom(this.homeApi.updateCoMessage(editing.id, payload));
      } else {
        await firstValueFrom(this.homeApi.createCoMessage(payload));
      }
      // this.notify.success("Saved successfully.");
      this.closeCommandMessageModal();
      await this.loadCommandMessages();
    } catch {
      this.notify.error("Failed to save command message.");
    } finally {
      this.savingCommandMessage.set(false);
    }
  }

  deleteCommandMessage(message: CommandMessage): void {
    this.pendingDelete.set({ type: 'commandMessage', data: message });
  }

  openAddEventModal(): void {
    this.editingEvent.set(null);
    this.eventDayType.set("single");
    this.formEventDate.set("");
    this.formEventStartDate.set("");
    this.formEventEndDate.set("");
    this.formEventName.set("");
    this.formEventDocument.set(null);
    this.eventFormError.set("");
    this.showEventModal.set(true);
  }

  openEditEventModal(event: UpcomingEvent): void {
    this.editingEvent.set(event);
    const isMultiple = !!event.endDate && event.endDate !== event.startDate;
    this.eventDayType.set(isMultiple ? "multiple" : "single");
    this.formEventDate.set(event.startDate);
    this.formEventStartDate.set(event.startDate);
    this.formEventEndDate.set(event.endDate ?? "");
    this.formEventName.set(event.eventName);
    this.formEventDocument.set(null);
    this.eventFormError.set("");
    this.showEventModal.set(true);
  }

  closeEventModal(): void {
    this.showEventModal.set(false);
  }

  setEventDayType(type: "single" | "multiple"): void {
    this.eventDayType.set(type);
    this.eventFormError.set("");
  }

  onEventDocumentSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.formEventDocument.set(input.files?.[0] ?? null);
  }

  async saveEvent(): Promise<void> {
    const isMultiple = this.eventDayType() === "multiple";

    if (!this.formEventName().trim()) {
      this.eventFormError.set("Event name is required.");
      return;
    }
    if (isMultiple && (!this.formEventStartDate() || !this.formEventEndDate())) {
      this.eventFormError.set("Date range is required.");
      return;
    }
    if (isMultiple && this.formEventEndDate() < this.formEventStartDate()) {
      this.eventFormError.set("End date cannot be less than start date.");
      return;
    }
    if (!isMultiple && !this.formEventDate()) {
      this.eventFormError.set("Date is required.");
      return;
    }

    const payload = new FormData();
    payload.append("title", this.formEventName().trim());
    payload.append("start_date", isMultiple ? this.formEventStartDate() : this.formEventDate());
    if (isMultiple) {
      payload.append("end_date", this.formEventEndDate());
    }
    payload.append("start_time", "00:00:00");
    payload.append("category", "others");
    if (this.formEventDocument()) {
      payload.append("document", this.formEventDocument() as File);
    }

    this.savingEvent.set(true);
    try {
      const editing = this.editingEvent();
      if (editing) {
        await firstValueFrom(this.call.updateEvent(editing.id, payload));
      } else {
        await firstValueFrom(this.call.createEvent(payload));
      }
      // this.notify.success("Saved successfully.");
      this.closeEventModal();
      await this.loadEvents();
    } catch {
      // this.notify.error("Failed to save event.");
    } finally {
      this.savingEvent.set(false);
    }
  }

  deleteEvent(event: UpcomingEvent): void {
    this.pendingDelete.set({ type: 'event', data: event });
  }

  isImageDocument(url: string | null): boolean {
    if (!url) return false;
    return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(url.split("?")[0]);
  }

  openEventPreview(event: UpcomingEvent): void {
    this.previewEvent.set(event);
    this.showEventPreviewModal.set(true);
  }

  closeEventPreview(): void {
    this.showEventPreviewModal.set(false);
  }

  openImagePreview(role: ShipRole): void {
    this.previewShipRole.set(role);
    this.showImagePreviewModal.set(true);
  }

  closeImagePreview(): void {
    this.showImagePreviewModal.set(false);
  }

  openAddShipRoleModal(): void {
    if (this.shipRoleList().length > 0) {
      this.openEditShipRoleModal(this.shipRoleList()[0]);
      return;
    }
    this.editingShipRole.set(null);
    this.formShipRoleTitle.set("");
    this.formShipRoleDescription.set("");
    this.formShipRoleImages.set([]);
    this.formShipRoleImagePreviews.set([]);
    this.shipRoleFormError.set("");
    this.showShipRoleModal.set(true);
  }

  openEditShipRoleModal(role: ShipRole): void {
    this.editingShipRole.set(role);
    this.formShipRoleTitle.set(role.title);
    this.formShipRoleDescription.set(role.description);
    this.formShipRoleImages.set([]);
    this.formShipRoleImagePreviews.set([]);
    this.shipRoleFormError.set("");
    this.showShipRoleModal.set(true);
  }

  closeShipRoleModal(): void {
    this.showShipRoleModal.set(false);
    this.formShipRoleImagePreviews.set([]);
  }

  onShipRoleImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length > this.MAX_SHIP_ROLE_IMAGES) {
      this.shipRoleFormError.set(`You can upload a maximum of ${this.MAX_SHIP_ROLE_IMAGES} images.`);
      input.value = "";
      return;
    }
    this.shipRoleFormError.set("");
    this.formShipRoleImages.set(files);

    const previews: string[] = [];
    if (!files.length) {
      this.formShipRoleImagePreviews.set([]);
      return;
    }

    let loadedCount = 0;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          previews.push(e.target.result as string);
        }
        loadedCount++;
        if (loadedCount === files.length) {
          this.formShipRoleImagePreviews.set(previews);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  async saveShipRole(): Promise<void> {
    if (!this.formShipRoleTitle().trim()) {
      this.shipRoleFormError.set("Ship Role Title is required.");
      return;
    }
    if (!this.formShipRoleDescription().trim()) {
      this.shipRoleFormError.set("Description is required.");
      return;
    }

    const payload = new FormData();
    payload.append("role_title", this.formShipRoleTitle().trim());
    payload.append("current_text", this.formShipRoleDescription().trim());
    if (this.formShipRoleImages().length > 0) {
      payload.append("replace_images", "true");
      payload.append("clear_images", "true");
      this.formShipRoleImages().forEach((file) => payload.append("images", file));
    }

    this.savingShipRole.set(true);
    try {
      let editing = this.editingShipRole();
      if (!editing && this.shipRoleList().length > 0) {
        editing = this.shipRoleList()[0];
      }
      if (editing) {
        await firstValueFrom(this.homeApi.updateShipRole(editing.id, payload));
      } else {
        await firstValueFrom(this.homeApi.createShipRole(payload));
      }
      // this.notify.success("Saved successfully.");
      this.closeShipRoleModal();
      await this.loadShipRoles();
    } catch {
      this.notify.error("Failed to save ship role.");
    } finally {
      this.savingShipRole.set(false);
    }
  }

  deleteShipRole(role: ShipRole): void {
    this.pendingDelete.set({ type: 'shipRole', data: role });
  }

  async confirmDelete(): Promise<void> {
    const item = this.pendingDelete();
    if (!item) return;
    this.pendingDelete.set(null);

    try {
      switch (item.type) {
        case 'crew':
          await firstValueFrom(this.homeApi.deleteMemberDetail((item.data as CrewDetail).id));
          await this.loadCrewList();
          break;
        case 'officer':
          await firstValueFrom(this.homeApi.deleteMemberDetail((item.data as ShipOfficer).id));
          await this.loadOfficerList();
          break;
        case 'quote':
          await firstValueFrom(this.homeApi.deleteQuote((item.data as QuoteOfTheDay).id));
          await this.loadQuotes();
          break;
        case 'commandMessage':
          await firstValueFrom(this.homeApi.deleteCoMessage((item.data as CommandMessage).id));
          await this.loadCommandMessages();
          break;
        case 'event':
          await firstValueFrom(this.homeApi.deleteEvent((item.data as UpcomingEvent).id));
          this.notify.success("Event deleted.");
          await this.loadEvents();
          break;
        case 'shipRole':
          await firstValueFrom(this.homeApi.deleteShipRole((item.data as ShipRole).id));
          await this.loadShipRoles();
          break;
        case 'loginImage':
          await firstValueFrom(this.homeApi.deleteLoginPageImage((item.data as LoginPageImage).id));
          await this.loadLoginImages();
          break;
      }
    } catch {
      this.notify.error("Failed to delete item.");
    }
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }
}
