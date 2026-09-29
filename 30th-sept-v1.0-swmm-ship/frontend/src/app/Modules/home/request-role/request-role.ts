import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, OnInit, inject, signal, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ColDef } from "ag-grid-community";
import { Call } from "../../../Core/http/services/call";
import { HomeApi } from "../services/home-api";
import { RoleItem, RoleRequestItemApi, RoleRequestResponse } from "../../home/home/home.model";
import { IconComponent } from "../../../shared/components/icon/icon.component";
import { MasterCard } from "../../refit-maintenance/master-card/master-card";
import { HelpGuidance } from "../../../shared/components/help-guidance/help-guidance";
import { CurrentUserResponse } from "../../../Core/http/services/api.service";
import { PanelCard } from "../../../shared/components/panel-card/panel-card";
import { CommonModule, NgClass } from "@angular/common";
import { SelectInput, DropdownOption } from "../../../shared/components/select-input/select-input";
import { DataGrid } from "../../../shared/components/data-grid/data-grid";
import { GridStatusChipRenderer } from "../../../shared/components/data-grid/grid-status-chip-renderer";

interface RoleRequestItem {
  id: number | string;
  raised: string;
  role: string;
  status: string;
  actedBy: string;
}

@Component({
  selector: "app-request-role",
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, MasterCard, HelpGuidance, PanelCard, SelectInput, DataGrid, ButtonComponent],
  templateUrl: "./request-role.html",
  styleUrl: "./request-role.css"
})
export class RequestRole implements OnInit {
  private readonly callService = inject(Call);
  private readonly homeApi = inject(HomeApi);

  readonly roles = signal<RoleItem[]>([]);
  readonly requests = signal<RoleRequestItem[]>([]);
  readonly submitting = signal(false);
  readonly currentUserProfile = signal<CurrentUserResponse | null>(null);
  readonly shipadminError = signal(false);
  readonly formTouched = signal(false);
  readonly selectedRoleId = signal<number | null>(null);

  readonly roleOptions = computed<DropdownOption[]>(() =>
    this.roles().map(r => ({ label: r.role_name, value: r.id }))
  );
  shipadminConfirmed = false;
  remarks = "";

  readonly requestColumnDefs: ColDef[] = [
    { headerName: "Raised", field: "raised", flex: 1, minWidth: 130 },
    { headerName: "Role", field: "role", flex: 1, minWidth: 140 },
    {
      headerName: "Status",
      field: "status",
      flex: 1,
      minWidth: 130,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: {
        toneMap: { Pending: "warning", Approved: "success", Rejected: "danger" },
      },
    },
    {
      headerName: "Acted by",
      field: "actedBy",
      flex: 1,
      minWidth: 160,
      valueFormatter: (params) => (params["value"] as string) || "—",
    },
  ];

  readonly isShipadminSelected = computed(() => {
    const roleId = this.selectedRoleId();
    if (!roleId) return false;
    const role = this.roles().find(r => r.id === Number(roleId));
    return role?.role_name?.toUpperCase() === 'SHIPADMIN';
  });

  readonly helpHtml = `
    <div class="role-req-help-body-inner">
      <div class="role-req-help-section">
        <h4 class="role-req-help-section-title">What this page is for</h4>
        <p>Use this page to ask for a role. A role decides which parts of SWMM you can open. Until someone grants you a role you will only see Home and Ship Crew in the left menu, and you will not be able to open the Inventory, Maintenance or Returns modules.</p>
      </div>

      <div class="role-req-help-section">
        <h4 class="role-req-help-section-title">How to raise a request</h4>
        <ul class="role-req-help-list-style">
          <li>Pick the role you need from the Role requested list.</li>
          <li>Write a short reason. This helps your Head of Department decide quickly.</li>
          <li>Press Send Request.</li>
        </ul>
      </div>

      <div class="role-req-help-section">
        <h4 class="role-req-help-section-title">Where your request goes</h4>
        <p>It goes to the Head of Department of your own department, shown above as Your department. Your HOD sees it inside the Users item at the bottom of their left menu. If you are asking to become a Head of Department yourself, the request goes to Command instead. The application admin can also see and act on any request.</p>
      </div>

      <div class="role-req-help-section">
        <h4 class="role-req-help-section-title">Which roles you can ask for</h4>
        <ul class="role-req-help-list-style">
          <li><strong>Maintainer</strong> — raise and close defects, work on equipment routines, trials and returns.</li>
          <li><strong>STOREKEEPER</strong> — run the ship's spare-parts store and the shore inventory screens.</li>
          <li><strong>HODWRITER</strong> — prepare and submit ship returns and planning entries on behalf of a department.</li>
          <li><strong>DY HOD</strong> — deputy head of a department, with the same rights as the Head of Department.</li>
          <li><strong>Head of Department</strong> — head of your department. This request goes to Command rather than to a HOD.</li>
          <li><strong>SHIPADMIN</strong> — the application administrator. For the ship IT Officer only, see below.</li>
        </ul>
      </div>

      <div class="role-req-help-section">
        <h4 class="role-req-help-section-title">Requesting SHIPADMIN</h4>
        <p>SHIPADMIN is the role the ship IT Officer needs in order to assign roles and configure the application after installation. When you select it, a tick box appears asking you to confirm that you are the IT Officer of this ship. The request will not send until you tick it, and your confirmation is written onto the request so the approver can see it was given. If you are not the IT Officer the request will simply be rejected, so do not select it on a guess.</p>
        <p><em>COMMAND is not offered here. The Commanding Officer role is assigned directly by the application admin.</em></p>
      </div>

      <div class="role-req-help-section">
        <h4 class="role-req-help-section-title">After you send it</h4>
        <ul class="role-req-help-list-style">
          <li>Your request shows as <strong>Pending</strong> in the table on the right.</li>
          <li>You may only have <strong>one open request at a time.</strong> Sending again updates the request you already have rather than creating a second one, so your HOD is not flooded.</li>
          <li>Once it is decided, the status changes to <strong>Approved</strong> or <strong>Rejected</strong>, and the <strong>Acted by</strong> column shows who decided it.</li>
          <li>When a role is approved, refresh the page. The new menu items appear straight away — you do not need to log out.</li>
        </ul>
      </div>
    </div>
  `;

  ngOnInit(): void {
    this.loadCurrentUser();
    this.loadRequestHistory();
  }

  onRoleChange(value: number | null): void {
    this.selectedRoleId.set(value);
    this.shipadminConfirmed = false;
    this.shipadminError.set(false);
  }

  submitRequest(): void {
    this.formTouched.set(true);

    if (!this.selectedRoleId() || this.submitting()) return;

    if (this.isShipadminSelected() && !this.shipadminConfirmed) {
      this.shipadminError.set(true);
      return;
    }

    this.shipadminError.set(false);
    this.submitting.set(true);

    this.homeApi.submitRequestRole({
      role_id: Number(this.selectedRoleId()),
      reason: this.remarks,
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.resetForm();
        this.loadRequestHistory();
      },
      error: (err: unknown) => {
        console.warn('Failed submitting role request', err);
        this.submitting.set(false);
      }
    });
  }

  private resetForm(): void {
    this.selectedRoleId.set(null);
    this.remarks = '';
    this.shipadminConfirmed = false;
    this.formTouched.set(false);
    this.shipadminError.set(false);
  }

  private loadCurrentUser(): void {
    this.callService.getCurrentUser().subscribe({
      next: (res: CurrentUserResponse) => this.currentUserProfile.set(res),
      error: (err: unknown) => console.warn("Failed loading user details from /me API", err)
    });
  }

  private loadRequestHistory(): void {
    this.homeApi.getRequestRoleHistory().subscribe({
      next: (res: RoleRequestResponse) => {
        if (res?.offerable && Array.isArray(res.offerable)) {
          const offerableRoles: RoleItem[] = res.offerable.map((r) => ({
            id: r.id,
            role_name: r.role_name,
          }));
          this.roles.set(offerableRoles);
        }

        const list: RoleRequestItemApi[] = Array.isArray(res) ? res : res?.requests || [];
        const mapped: RoleRequestItem[] = list.map((item: RoleRequestItemApi) => {
          const dateVal = item.created_on || item.created_at;
          const rawStatus = item.status || 'Pending';
          const formattedStatus = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();

          return {
            id: item.id,
            raised: dateVal
              ? new Date(dateVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
              : '—',
            role: item.role_name || item.requested_role_detail?.role_name || '—',
            status: formattedStatus,
            actedBy: item.acted_by_detail
              ? `${item.acted_by_detail.firstname || ''} ${item.acted_by_detail.lastname || ''}`.trim()
              : item.acted_by || '—',
          };
        });
        this.requests.set(mapped);
      },
      error: (err: unknown) => {
        console.warn('Failed loading role request history & offerable roles', err);
        this.requests.set([]);
        this.roles.set([]);
      }
    });
  }
}
