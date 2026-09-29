import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../../Core/services/notification/notification.service';
import { AdministrationApi } from '../services/administration-api';
import { firstValueFrom } from 'rxjs';
import { DataGrid } from '../../../shared/components/data-grid/data-grid';
import { CellClickedEvent, ColDef, ICellRendererParams } from 'ag-grid-community';
import { HelpGuidance } from '../../../shared/components/help-guidance/help-guidance';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ModalComponent } from '../../../shared/components/modal/modal.component';

export interface Designation {
  id: number;
  designation_name: string;
}

export interface UserRole {
  id: number;
  role_name: string;
  code?: string | null;
  description?: string;
  is_system?: boolean;
}

export interface UserProfile {
  firstname?: string;
  lastname?: string;
  personal_number?: string;
  rank?: string;
  rank_detail?: { id?: number; name?: string } | string;
  designation?: string;
  designation_master?: number | null;
  designation_master_detail?: {
    id?: number;
    designation_name?: string;
    name?: string;
  };
  department?: string | null;
  department_detail?: {
    id: number;
    name: string;
  };
  sub_department?: number | string | null;
  sub_department_detail?: {
    id: number;
    name: string;
  };
  role_master?: number | null;
  role_master_detail?: {
    id: number;
    role_name: string;
  };
  is_ood?: boolean;
  is_regulator?: boolean;
}

export interface UserAccount {
  id: number;
  username: string;
  is_active: boolean;
  is_admin: boolean;
  personal_number?: string;
  firstname?: string;
  lastname?: string;
  name?: string;
  department?: string;
  department_id?: number | null;
  role?: string;
  role_id?: number | null;
  role_assigned_by?: string | null;
  user_active?: boolean;
  is_role?: boolean;
  is_ood?: boolean;
  is_regulator?: boolean;
  executive_sub_department?: string;
  profile?: UserProfile;
}

export interface Department {
  id: number;
  name: string;
  code?: string;
  dep_code?: string | null;
  description?: string | null;
  active?: number | boolean;
}

export interface UserManagementApiResponse {
  status: string;
  title: string;
  department: string;
  users_count: number;
  users: UserAccount[];
  pending_requests?: PendingRoleRequest[];
  assignable_roles?: UserRole[];
  departments?: Department[];
}

export interface EditUserForm {
  userId: number | null;
  username: string;
  firstName: string;
  lastName: string;
  personalNumber: string;
  designationMaster: string | number | null;
  rank: string;
  department: string;
  subDepartment: string | null;
  roleId: number | null;
  isOod: boolean;
  isRegulator: boolean;
  isActive: boolean;
  isAdmin: boolean;
}

export interface PendingRoleRequest {
  id: number;
  requester_id?: number;
  requester_name?: string;
  requested_role_id?: number | null;
  requested_role?: string | { id: number; role_name: string } | null;
  department?: string | { id: number; name: string } | null;
  status?: string;
  source?: string;
  remarks?: string;
  created_on: string;
  acted_on?: string | null;
  selected_role_id?: number | null;
  requester?: {
    id?: number;
    personal_number?: string;
    firstname?: string;
    lastname?: string;
  };
}

import { User } from '../../../Core/services/user/user';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule, FormsModule, DataGrid, HelpGuidance, IconComponent, ModalComponent, ButtonComponent],
  templateUrl: './user-list.component.html',
  styleUrls: ['./user-list.component.css']
})
export class UserListComponent implements OnInit, OnDestroy {
  private readonly adminApi = inject(AdministrationApi);
  private readonly notification = inject(NotificationService);
  private readonly userStore = inject(User);

  private readonly onSelectChangeListener = (e: Event) => {
    const customEvt = e as CustomEvent<{ id: number; value: string }>;
    if (customEvt.detail) {
      const { id, value } = customEvt.detail;
      const req = this.pendingRequests().find(r => r.id === id);
      if (req) {
        req.selected_role_id = value ? Number(value) : undefined;
      }
    }
  };

  // Data Signals
  readonly users = signal<UserAccount[]>([]);
  readonly roles = signal<UserRole[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly pendingRequests = signal<PendingRoleRequest[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);

  readonly pageTitle = signal<string>('User Management');
  readonly userDepartment = signal<string>('');
  readonly usersCount = signal<number>(0);

  readonly designations = signal<Designation[]>([]);

  // "Reset SWMM" — hits DatabaseResetAPIView, which wipes and reseeds the
  // database. Irreversible, so the confirm modal requires typing the literal word
  // "RESET" (matching the backend's own required `{ confirm: "RESET" }` payload)
  // before the button enables, instead of a plain "are you sure" click-through.
  // Relocated here from the Admin Dashboard page.
  readonly showResetConfirm = signal(false);
  readonly resetConfirmText = signal('');
  readonly isResetting = signal(false);

  readonly subDepartmentsMap: Record<string, string[]> = {
    'EXECUTIVE': ['Gunnery', 'Navigation', 'Communication', 'Anti-Submarine Warfare', 'Aviation', 'ND', 'Operations'],
    'ENGINEERING': ['Main Propulsion', 'Auxiliaries', 'Boiler Room', 'Damage Control', 'Workshop', 'Power Generation'],
    'ELECTRICAL': ['Power Distribution', 'Radio & Radar', 'Control & Instrumentation', 'Weapons Electrical'],
    'LOGISTICS': ['Victualling', 'Clothing & Stores', 'Cash & Accounts', 'Naval Armament Stores'],
    'MEDICAL': ['Ward', 'Dental', 'Operation Theatre', 'Pharmacy']
  };

  readonly currentSubDepartments = computed(() => {
    const dept = (this.editForm().department || '').toUpperCase().trim();
    return this.subDepartmentsMap[dept] || ['General', 'Operations', 'Technical', 'Administration', 'Support'];
  });

  readonly helpHtml = `<p><strong>What this page is for</strong><br>
This is where roles are granted. It has two parts — the Pending Role Requests list at the top, and the full user list below it. The hourglass icon that used to open this page from the top right has been removed, and this page now sits at the bottom of the left menu.</p>

<p><strong>What you can see here</strong></p>
<ul>
  <li><strong>Head of Department or Dy HOD</strong> — requests and users from your own department only.</li>
  <li><strong>Command</strong> — requests to make somebody a Head of Department.</li>
  <li><strong>Application admin</strong> — every request from every department, and every user.</li>
</ul>

<p><strong>Acting on a request</strong></p>
<ul>
  <li>Check the <strong>Role requested</strong> column and the reason the person gave.</li>
  <li>If you want to grant a different role from the one asked for, pick it in the <strong>Grant role</strong> dropdown on that row before approving.</li>
  <li>Press <strong>Approve</strong> to grant the role, or <strong>Reject</strong> to decline it. The person sees the outcome on their own Request Role page.</li>
  <li>The new menu items appear for them as soon as they refresh. They do not need to log out.</li>
</ul>

<p><strong>Who may grant what</strong></p>
<ul>
  <li>A <strong>HOD</strong> or <strong>Dy HOD</strong> may grant any role to people in their own department, except <em>SHIPADMIN</em>, <em>COMMAND</em> and <em>Head of Department</em>.</li>
  <li><strong>Command</strong> grants the Head of Department role.</li>
  <li>The <strong>application admin</strong> may grant any role to anyone.</li>
</ul>

<p><strong>User Type</strong><br>
The <strong>User Type</strong> column shows where an account came from. <strong>Active Directory</strong> accounts are the ship's crew, created from their directory record when they first log in. <strong>Local</strong> accounts were registered or added onboard. <strong>Static</strong> accounts are the fixed installation logins that come with the system; they are listed only for the application admin, and only that account can edit them or act on their role requests.</p>

<p><strong>Who assigned a role</strong><br>
The <strong>Role assigned by</strong> column shows who granted the person their current role. If the application admin assigned it on your behalf, their name appears there rather than yours, so you can always see how a role was granted.</p>

<p><strong>Requests that appear on their own</strong><br>
When somebody logs in and has no role, a request is raised for them automatically. Those rows show <em>Any role</em> in the <strong>Role requested</strong> column, because the person has not chosen one yet. Use the <strong>Grant role</strong> dropdown to pick a suitable role before approving, or reject the request and ask them to raise a specific one from their Request Role page.</p>`;

  // Search & Filter Signals
  readonly searchQuery = signal<string>('');

  // Modal Signals
  readonly showEditModal = signal<boolean>(false);
  readonly editForm = signal<EditUserForm>({
    userId: null,
    username: '',
    firstName: '',
    lastName: '',
    personalNumber: '',
    designationMaster: null,
    rank: '',
    department: '',
    subDepartment: null,
    roleId: null,
    isOod: false,
    isRegulator: false,
    isActive: true,
    isAdmin: false
  });

  updateFormField<K extends keyof EditUserForm>(key: K, value: EditUserForm[K]): void {
    this.editForm.update(current => ({ ...current, [key]: value }));
    if (key === 'department') {
      this.editForm.update(current => ({ ...current, subDepartment: null }));
    }
  }

  // ag-grid Column Definitions
  readonly userColumnDefs: ColDef<UserAccount>[] = [
    {
      headerName: 'Sr. No',
      valueGetter: 'node.rowIndex + 1',
      width: 80,
      minWidth: 80,
      maxWidth: 80,
      sortable: false,
      cellClass: 'text-center font-mono'
    },
    {
      headerName: 'Personal Number / Username',
      field: 'username',
      flex: 1.2,
      minWidth: 170,
      cellRenderer: (params: ICellRendererParams<UserAccount>) => {
        const u = params.data;
        const pNum = u?.personal_number || u?.profile?.personal_number || u?.username || '';
        return `<span class="fw-semibold text-primary">${pNum}</span>`;
      }
    },
    {
      headerName: 'Full Name',
      valueGetter: (params) => {
        const u = params.data;
        const fullName = u?.name || ((u?.firstname || u?.profile?.firstname || '') + ' ' + (u?.lastname || u?.profile?.lastname || '')).trim();
        return fullName || u?.username || '—';
      },
      flex: 1.4,
      minWidth: 160,
      cellClass: 'fw-bold'
    },
    {
      headerName: 'Department',
      valueGetter: (params) => {
        const u = params.data;
        return u?.department || u?.profile?.department_detail?.name || (typeof u?.profile?.department === 'string' ? u.profile.department : '') || 'N/A';
      },
      flex: 1.2,
      minWidth: 140
    },
    {
      headerName: 'Role',
      valueGetter: (params) => {
        const u = params.data;
        return u?.role || u?.profile?.role_master_detail?.role_name || 'N/A';
      },
      flex: 1.3,
      minWidth: 150
    },
    {
      headerName: 'Account Status',
      field: 'is_active',
      width: 140,
      cellRenderer: (params: ICellRendererParams<UserAccount>) => {
        const u = params.data;
        const active = params.value ?? u?.user_active ?? true;
        const badgeClass = active ? 'bg-success-soft' : 'bg-danger-soft';
        const label = active ? 'Active' : 'Inactive';
        return `<span class="badge ${badgeClass}">${label}</span>`;
      }
    },
    {
      headerName: 'Admin Status',
      field: 'is_admin',
      width: 140,
      cellRenderer: (params: ICellRendererParams<UserAccount>) => {
        const admin = params.value;
        const badgeClass = admin ? 'bg-primary-soft' : 'bg-secondary-soft';
        const label = admin ? 'Admin' : 'User';
        return `<span class="badge ${badgeClass}">${label}</span>`;
      }
    },
    {
      headerName: 'Actions',
      width: 90,
      minWidth: 90,
      sortable: false,
      cellClass: 'text-center',
      cellRenderer: () => {
        return `<button class="action-icon-btn" data-action="edit" title="Edit User Profile & Role">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
        </button>`;
      }
    }
  ];

  onUserCellClicked(event: CellClickedEvent<UserAccount>): void {
    if (event.event?.target && (event.event.target as HTMLElement).closest('[data-action="edit"]')) {
      if (event.data) {
        this.openEditModal(event.data);
      }
    }
  }

  onUserRowClicked(data: UserAccount): void {
    if (data) {
      this.openEditModal(data);
    }
  }

  // ag-grid Column Definitions for Pending Role Requests
  readonly pendingRequestColumnDefs: ColDef<PendingRoleRequest>[] = [
    {
      headerName: 'Sr. No',
      valueGetter: 'node.rowIndex + 1',
      width: 75,
      minWidth: 75,
      maxWidth: 75,
      sortable: false,
      cellClass: 'text-center font-mono'
    },
    {
      headerName: 'Raised',
      field: 'created_on',
      width: 120,
      valueFormatter: (params) => {
        const val = params['value'] as string | undefined;
        if (!val) return '—';
        const d = new Date(val);
        return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    },
    {
      headerName: 'Personal Number',
      valueGetter: (params) => {
        const req = params.data;
        if (req?.requester?.personal_number) return req.requester.personal_number;
        if (req?.requester_id) return `PN${String(req.requester_id).padStart(4, '0')}`;
        return 'N/A';
      },
      width: 150,
      cellClass: 'fw-semibold'
    },
    {
      headerName: 'Name',
      valueGetter: (params) => {
        const req = params.data;
        if (req?.requester_name) return req.requester_name;
        const fn = (req?.requester?.firstname || '') + ' ' + (req?.requester?.lastname || '');
        return fn.trim() || '—';
      },
      flex: 1.2,
      minWidth: 150,
      cellClass: 'fw-bold'
    },
    {
      headerName: 'Department',
      valueGetter: (params) => {
        const d = params.data?.department;
        return typeof d === 'object' ? (d?.name || '—') : (d || '—');
      },
      flex: 1,
      minWidth: 130
    },
    {
      headerName: 'Role Requested',
      valueGetter: (params) => {
        const r = params.data?.requested_role;
        return typeof r === 'object' ? (r?.role_name || 'Any role') : (r || 'Any role');
      },
      flex: 1.2,
      minWidth: 150,
      cellRenderer: (params: ICellRendererParams<PendingRoleRequest>) => {
        const role = params.value || 'Any role';
        return `<span class="requested-role-pill">${role}</span>`;
      }
    },
    {
      headerName: 'Reason',
      field: 'remarks',
      flex: 1.2,
      minWidth: 140,
      valueFormatter: (params) => {
        const val = params['value'];
        return val ? String(val) : '—';
      }
    },
    {
      headerName: 'Action',
      minWidth: 330,
      width: 340,
      flex: 1.8,
      sortable: false,
      suppressNavigable: true,
      suppressKeyboardEvent: () => true,
      cellRenderer: (params: ICellRendererParams<PendingRoleRequest>) => {
        const req = params.data;
        if (!req) return '';
        const selectedId = req.selected_role_id || '';
        const optionsHtml = this.roles().map(r =>
          `<option value="${r.id}" ${r.id === selectedId ? 'selected' : ''}>${r.role_name}</option>`
        ).join('');

        return `<div class="action-form">
          <select class="role-grant-select" data-id="${req.id}" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" onchange="window.dispatchEvent(new CustomEvent('pendingRoleSelectChange', { detail: { id: ${req.id}, value: this.value } }))">
            <option value="">Grant role...</option>
            ${optionsHtml}
          </select>
          <button type="button" class="btn-req-approve" data-action="approve" data-id="${req.id}">Approve</button>
          <button type="button" class="btn-req-reject" data-action="reject" data-id="${req.id}">Reject</button>
        </div>`;
      }
    }
  ];

  onPendingCellClicked(event: CellClickedEvent<PendingRoleRequest>): void {
    const target = (event.event?.target || (event as unknown as { event: MouseEvent })?.event?.target) as HTMLElement | null;
    if (!target || !event.data) return;

    // Ignore clicks directly on the select element to let standard dropdown behavior work
    if (target.tagName.toLowerCase() === 'select' || target.closest('select')) {
      return;
    }

    const action = target.getAttribute('data-action') || target.closest('[data-action]')?.getAttribute('data-action');
    if (!action) return;

    const selectEl = target.closest('.action-form')?.querySelector('.role-grant-select') as HTMLSelectElement | null;
    if (selectEl && selectEl.value) {
      event.data.selected_role_id = Number(selectEl.value);
    }

    if (action === 'approve') {
      this.openApproveConfirm(event.data);
    } else if (action === 'reject') {
      this.openRejectConfirm(event.data);
    }
  }

  readonly filteredUsers = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.users();

    return this.users().filter(u => {
      const username = (u.username || '').toLowerCase();
      const pNum = (u.personal_number || u.profile?.personal_number || u.username || '').toLowerCase();
      const fullName = (
        u.name || ((u.firstname || u.profile?.firstname || '') + ' ' + (u.lastname || u.profile?.lastname || '')).trim()
      ).toLowerCase();
      const dept = (u.department || u.profile?.department_detail?.name || (typeof u.profile?.department === 'string' ? u.profile.department : '') || '').toLowerCase();
      const role = (u.role || u.profile?.role_master_detail?.role_name || '').toLowerCase();

      return (
        username.includes(q) ||
        pNum.includes(q) ||
        fullName.includes(q) ||
        dept.includes(q) ||
        role.includes(q)
      );
    });
  });

  ngOnInit(): void {
    window.addEventListener('pendingRoleSelectChange', this.onSelectChangeListener);
    this.loadAllData();
  }

  ngOnDestroy(): void {
    window.removeEventListener('pendingRoleSelectChange', this.onSelectChangeListener);
  }

  async loadAllData(): Promise<void> {
    this.isLoading.set(true);
    try {
      await Promise.all([this.loadRoles(), this.loadDepartments(), this.loadDesignations()]);
      await this.loadUsersAndRequests();
    } catch (e) {
      console.error(e);
      this.notification.error('Failed to load user management data');
    } finally {
      this.isLoading.set(false);
    }
  }

  openResetConfirm(): void {
    this.resetConfirmText.set('');
    this.showResetConfirm.set(true);
  }

  closeResetConfirm(): void {
    this.showResetConfirm.set(false);
    this.resetConfirmText.set('');
  }

  async confirmDatabaseReset(): Promise<void> {
    if (this.resetConfirmText() !== 'RESET' || this.isResetting()) {
      return;
    }
    this.isResetting.set(true);
    try {
      await firstValueFrom(
        this.adminApi.resetDatabase()
      );
      this.notification.success('Database reset successfully.');
      this.closeResetConfirm();
      await this.loadAllData();
    } catch (e) {
      console.error('Database reset failed:', e);
      this.notification.error('Database reset failed. Please try again.');
    } finally {
      this.isResetting.set(false);
    }
  }

  private async loadDesignations(): Promise<void> {
    try {
      const designationsRes = await firstValueFrom(
        this.adminApi.getDesignations<Designation[]>()
      );
      if (Array.isArray(designationsRes)) {
        this.designations.set(designationsRes);
      }
    } catch (e) {
      console.warn('Failed to load designations from API', e);
    }
  }

  private async loadDepartments(): Promise<void> {
    try {
      const deptsRes = await firstValueFrom(
        this.adminApi.getDepartments<Department[]>()
      );
      if (Array.isArray(deptsRes)) {
        this.departments.set(deptsRes);
      }
    } catch (e) {
      console.warn('Failed to load departments from API', e);
    }
  }

  private deduplicateRoles(rawRoles: UserRole[]): UserRole[] {
    const seenNames = new Set<string>();
    const seenIds = new Set<number>();
    const unique: UserRole[] = [];

    for (const r of rawRoles) {
      if (!r) continue;
      const nameKey = (r.role_name || '').trim().toLowerCase();
      if (!nameKey) continue;

      if (!seenNames.has(nameKey) && !seenIds.has(r.id)) {
        seenNames.add(nameKey);
        seenIds.add(r.id);
        unique.push(r);
      }
    }
    return unique;
  }

  private async loadRoles(): Promise<void> {
    try {
      const rolesRes = await firstValueFrom(
        this.adminApi.getRoles<UserRole[]>()
      );
      if (Array.isArray(rolesRes)) {
        this.roles.set(this.deduplicateRoles(rolesRes));
      }
    } catch (e) {
      console.warn('Failed to load roles from API, fallback to default roles', e);
    }
  }

  private async loadUsersAndRequests(): Promise<void> {
    try {
      const usersRes = await firstValueFrom(
        this.adminApi.getUsers<UserManagementApiResponse | UserAccount[]>()
      );
      if (usersRes && !Array.isArray(usersRes) && Array.isArray(usersRes.users)) {
        this.applyUserManagementResponse(usersRes);
      } else if (Array.isArray(usersRes)) {
        this.users.set(usersRes);
      }
    } catch (e) {
      console.warn('Failed to load users from API', e);
    }
  }

  private applyUserManagementResponse(res: UserManagementApiResponse): void {
    this.users.set(res.users);
    if (res.title) this.pageTitle.set(res.title);
    if (res.department) this.userDepartment.set(res.department);
    if (typeof res.users_count === 'number') this.usersCount.set(res.users_count);
    if (res.assignable_roles?.length) {
      const combined = [...this.roles(), ...res.assignable_roles];
      this.roles.set(this.deduplicateRoles(combined));
    }
    if (res.departments?.length) {
      this.departments.set(res.departments);
    }
    if (res.pending_requests?.length) {
      const mapped = res.pending_requests.map(req => ({
        ...req,
        selected_role_id: req.requested_role_id || (typeof req.requested_role === 'object' ? req.requested_role?.id : null) || null
      }));
      this.pendingRequests.set(mapped);
      this.userStore.pendingRoleRequestsCount.set(mapped.length);
    } else {
      this.pendingRequests.set([]);
      this.userStore.pendingRoleRequestsCount.set(0);
    }
  }

  // Confirmation Modal Signals & State
  readonly confirmModalState = signal<{
    isOpen: boolean;
    type: 'approve' | 'reject';
    title: string;
    message: string;
    request: PendingRoleRequest | null;
    grantedRoleId?: number | null;
    roleName?: string;
  }>({
    isOpen: false,
    type: 'approve',
    title: '',
    message: '',
    request: null,
    grantedRoleId: null,
    roleName: ''
  });

  openApproveConfirm(req: PendingRoleRequest): void {
    const grantedRoleId = req.selected_role_id;
    if (!grantedRoleId) {
      this.notification.warning('Please select a role to grant before approving.');
      return;
    }

    const roleObj = this.roles().find(r => r.id === grantedRoleId);
    const roleName = roleObj ? roleObj.role_name : 'Selected Role';
    const reqName = req.requester_name || ((req.requester?.firstname || '') + ' ' + (req.requester?.lastname || '')).trim() || 'User';

    this.confirmModalState.set({
      isOpen: true,
      type: 'approve',
      title: 'Confirm Approval',
      message: `Are you sure you want to approve role request for <strong>${reqName}</strong> and assign role <strong>${roleName}</strong>?`,
      request: req,
      grantedRoleId: grantedRoleId,
      roleName: roleName
    });
  }

  openRejectConfirm(req: PendingRoleRequest): void {
    const reqName = req.requester_name || ((req.requester?.firstname || '') + ' ' + (req.requester?.lastname || '')).trim() || 'User';

    this.confirmModalState.set({
      isOpen: true,
      type: 'reject',
      title: 'Confirm Disapproval',
      message: `Are you sure you want to disapprove the role request for <strong>${reqName}</strong>?`,
      request: req,
      grantedRoleId: null,
      roleName: ''
    });
  }

  closeConfirmModal(): void {
    this.confirmModalState.set({
      isOpen: false,
      type: 'approve',
      title: '',
      message: '',
      request: null,
      grantedRoleId: null,
      roleName: ''
    });
  }

  async executeConfirmedAction(): Promise<void> {
    const state = this.confirmModalState();
    if (!state.request) return;

    if (state.type === 'approve') {
      await this.approveRequest(state.request, state.grantedRoleId);
    } else {
      await this.rejectRequest(state.request);
    }
    this.closeConfirmModal();
  }

  // Pending Role Request Actions
  async approveRequest(req: PendingRoleRequest, grantedRoleId?: number | null): Promise<void> {
    const roleIdToGrant = grantedRoleId || req.selected_role_id || req.requested_role_id;
    if (!roleIdToGrant) {
      this.notification.warning('Please select a role to grant before approving.');
      return;
    }

    const reqUserId = req?.id;
    this.isSaving.set(true);
    try {
      if (reqUserId) {
        await firstValueFrom(
          this.adminApi.actOnRoleRequest(reqUserId, {
            action: 'approve',
            granted_role: roleIdToGrant
          })
        );
      }

      const remaining = this.pendingRequests().filter(r => r.id !== req.id);
      this.pendingRequests.set(remaining);
      this.userStore.pendingRoleRequestsCount.set(remaining.length);
      await this.loadAllData();
    } catch (e) {
      console.error(e);
      // const remaining = this.pendingRequests().filter(r => r.id !== req.id);
      // this.pendingRequests.set(remaining);
      // this.userStore.pendingRoleRequestsCount.set(remaining.length);
    } finally {
      this.isSaving.set(false);
    }
  }

  async rejectRequest(req: PendingRoleRequest): Promise<void> {
    const reqUserId = req?.id;
    this.isSaving.set(true);
    try {
      if (reqUserId) {
        await firstValueFrom(
          this.adminApi.actOnRoleRequest(reqUserId, {
            action: 'reject',
            granted_role: null
          })
        );
      }
      const remaining = this.pendingRequests().filter(r => r.id !== req.id);
      this.pendingRequests.set(remaining);
      this.userStore.pendingRoleRequestsCount.set(remaining.length);
    } catch (e) {
      console.error(e);
      // const remaining = this.pendingRequests().filter(r => r.id !== req.id);
      // this.pendingRequests.set(remaining);
      // this.userStore.pendingRoleRequestsCount.set(remaining.length);
    } finally {
      this.isSaving.set(false);
    }
  }

  // User Actions
  private resolveDesignationId(prof: UserProfile): number | null {
    if (typeof prof.designation_master === 'number') return prof.designation_master;
    if (prof.designation_master_detail?.id) return prof.designation_master_detail.id;

    const desigName = prof.designation_master_detail?.designation_name || prof.designation_master_detail?.name || prof.designation;
    if (!desigName) return null;

    const match = this.designations().find(d => d.designation_name.toLowerCase() === desigName.toLowerCase());
    return match ? match.id : null;
  }

  private resolveRoleId(user: UserAccount, prof: UserProfile): number | null {
    const currentRoles = this.roles();
    const directId = (typeof user.role_id === 'number') ? user.role_id :
                     (typeof prof.role_master === 'number') ? prof.role_master :
                     prof.role_master_detail?.id ?? null;

    if (directId && currentRoles.some(r => r.id === directId)) {
      return directId;
    }

    const userRoleName = (user.role || prof.role_master_detail?.role_name || '').toLowerCase().trim();
    if (userRoleName) {
      const matchRole = currentRoles.find(r => r.role_name?.toLowerCase().trim() === userRoleName);
      if (matchRole) return matchRole.id;
    }

    return directId;
  }

  openEditModal(user: UserAccount): void {
    const prof: UserProfile = user.profile || {};
    const rankName = typeof prof.rank_detail === 'object' ? (prof.rank_detail?.name || '') : (prof.rank || '');
    const deptName = user.department || prof.department_detail?.name || (typeof prof.department === 'string' ? prof.department : '') || '';
    const subDeptName = user.executive_sub_department || prof.sub_department_detail?.name || (typeof prof.sub_department === 'string' ? prof.sub_department : '') || null;

    this.editForm.set({
      userId: user.id,
      username: user.username || user.personal_number || prof.personal_number || '',
      firstName: user.firstname || prof.firstname || '',
      lastName: user.lastname || prof.lastname || '',
      personalNumber: user.personal_number || prof.personal_number || user.username || '',
      designationMaster: this.resolveDesignationId(prof),
      rank: rankName,
      department: deptName,
      subDepartment: subDeptName,
      roleId: this.resolveRoleId(user, prof),
      isOod: Boolean(user.is_ood ?? prof.is_ood ?? false),
      isRegulator: Boolean(user.is_regulator ?? prof.is_regulator ?? false),
      isActive: user.is_active ?? user.user_active ?? true,
      isAdmin: user.is_admin ?? false
    });

    this.showEditModal.set(true);
  }

  async saveUserChanges(): Promise<void> {
    const form = this.editForm();
    if (!form.userId) return;

    if (!form.firstName?.trim() || !form.lastName?.trim()) {
      this.notification.warning('Firstname and Lastname are required.');
      return;
    }

    this.isSaving.set(true);
    try {
      const selectedRoleObj = this.roles().find(r => r.id === form.roleId);
      const selectedDesigObj = this.designations().find(d => d.id === form.designationMaster);
      const payload: Record<string, unknown> = {
        username: form.username,
        is_active: form.isActive,
        user_active: form.isActive,
        is_admin: form.isAdmin,
        is_ood: form.isOod,
        is_regulator: form.isRegulator,
        firstname: form.firstName,
        lastname: form.lastName,
        name: `${form.firstName} ${form.lastName}`.trim(),
        personal_number: form.personalNumber,
        department: form.department,
        executive_sub_department: form.subDepartment || '',
        role_id: form.roleId,
        role: selectedRoleObj ? selectedRoleObj.role_name : undefined,
        role_master: form.roleId,
        profile: {
          firstname: form.firstName,
          lastname: form.lastName,
          personal_number: form.personalNumber,
          rank: form.rank,
          designation: selectedDesigObj ? selectedDesigObj.designation_name : undefined,
          designation_master: form.designationMaster,
          role_master: form.roleId,
          is_ood: form.isOod,
          is_regulator: form.isRegulator
        }
      };

      await firstValueFrom(
        this.adminApi.updateUser(form.userId, payload)
      );

      // this.notification.success(`Updated profile for ${form.firstName || form.username}`);
      this.showEditModal.set(false);
      await this.loadAllData();
    } catch (e) {
      console.error(e);

      this.showEditModal.set(false);
    } finally {
      this.isSaving.set(false);
    }
  }
}
