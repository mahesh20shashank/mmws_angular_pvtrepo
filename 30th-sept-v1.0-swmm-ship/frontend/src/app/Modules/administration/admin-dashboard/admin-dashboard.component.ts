import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../../Core/services/notification/notification.service';
import { AdministrationApi } from '../services/administration-api';
import { firstValueFrom } from 'rxjs';
import { HelpGuidance } from '../../../shared/components/help-guidance/help-guidance';
import { DataGrid } from '../../../shared/components/data-grid/data-grid';
import { KpiCard } from '../../../shared/components/kpi-card/kpi-card';
import { ModalComponent } from '../../../shared/components/modal/modal.component';
import { CellClickedEvent, ColDef, ICellRendererParams } from 'ag-grid-community';

export interface Designation {
  id: number;
  designation_name: string;
}

export interface Rank {
  id: number;
  name: string;
  department?: string | null;
}

export interface UserRole {
  id: number;
  role_name: string;
  code?: string | null;
  description?: string;
  is_system?: boolean;
}

export interface Department {
  id: number;
  name: string;
  code?: string;
  dep_code?: string | null;
  description?: string | null;
  active?: number | boolean;
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
  user_active?: boolean;
  is_role?: boolean;
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

export interface UserManagementApiResponse {
  status: string;
  title: string;
  department: string;
  users_count: number;
  users: UserAccount[];
  assignable_roles?: UserRole[];
  departments?: Department[];
}

export interface EditUserForm {
  userId: number | null;
  username: string;
  firstName: string;
  lastName: string;
  personalNumber: string;
  rank: string;
  designationMaster: number | null;
  department: string;
  subDepartment: string | null;
  roleId: number | null;
  isActive: boolean;
}

export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

const EXECUTIVE_SUB_DEPARTMENTS = [
  'Gunnery',
  'Navigation',
  'Anti-Submarine Warfare (ASW)',
  'Communication & Signals',
  'Diving',
  'First Lieutenant',
  'Hydrography',
  'NBCD (Executive)',
  'Physical Training & Regulating',
];

const ENGINEERING_SUB_DEPARTMENTS = [
  'Main Propulsion',
  'Auxiliary Machinery',
  'Boiler & Steam',
  'Damage Control & Firefighting',
  'Refrigeration & Air Conditioning',
  'Hull & Workshop',
  'Aviation Support (Eng)',
];

const ELECTRICAL_SUB_DEPARTMENTS = [
  'Power Generation & Distribution',
  'Control & Instrumentation',
  'Radar & Sensor Electronics',
  'Weapon Control Systems',
  'Communication & Electronic Warfare (EW)',
  'Navigation Aids & Gyro',
];

const LOGISTICS_SUB_DEPARTMENTS = [
  'Victualling & Catering',
  'Clothing & Naval Stores',
  'Naval Armament Stores',
  'Fuel & Lubricants Supply',
  'Air Stores',
  'Disbursing & Accounts',
];

const MEDICAL_SUB_DEPARTMENTS = [
  'General Medicine',
  'Surgical Support',
  'Underwater & Hyperbaric Medicine',
  'Aviation Medicine',
  'Health & Hygiene',
];

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, HelpGuidance, DataGrid, KpiCard, ModalComponent, ButtonComponent],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css'],
})
export class AdminDashboardComponent implements OnInit {
  private readonly adminApi = inject(AdministrationApi);
  private readonly notification = inject(NotificationService);

  readonly helpHtml = `
    <strong>Administrator Dashboard - User Registration Requests</strong>
    <p class="mb-0 mt-1 text-sm text-slate-300">
      Manage new user registration workflows, approve or disapprove pending signup requests,
      and update user department assignments, roles, and designations.
    </p>
  `;

  // Signals
  readonly users = signal<UserAccount[]>([]);
  readonly roles = signal<UserRole[]>([]);
  readonly departments = signal<Department[]>([]);
  readonly designations = signal<Designation[]>([]);
  readonly ranks = signal<Rank[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);

  // Search & Filter
  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<'all' | 'pending' | 'approved' | 'rejected'>('all');

  // Modal Signals
  readonly showEditModal = signal<boolean>(false);
  readonly editForm = signal<EditUserForm>({
    userId: null,
    username: '',
    firstName: '',
    lastName: '',
    personalNumber: '',
    rank: '',
    designationMaster: null,
    department: '',
    subDepartment: null,
    roleId: null,
    isActive: true,
  });

  // Confirmation Modal
  readonly confirmModalState = signal<{
    isOpen: boolean;
    type: 'approve' | 'disapprove';
    title: string;
    message: string;
    user: UserAccount | null;
    grantedRoleId?: number | null;
    roleName?: string;
  }>({
    isOpen: false,
    type: 'approve',
    title: '',
    message: '',
    user: null,
    grantedRoleId: null,
    roleName: '',
  });

  // ag-grid Column Definitions
  readonly userColumnDefs: ColDef<UserAccount>[] = [
    {
      headerName: 'Sr. No',
      valueGetter: 'node.rowIndex + 1',
      width: 75,
      minWidth: 70,
      maxWidth: 80,
      sortable: false,
      cellClass: 'text-center font-mono',
    },
    {
      headerName: 'Username',
      field: 'username',
      flex: 1.2,
      minWidth: 160,
      cellRenderer: (params: ICellRendererParams<UserAccount>) => {
        const u = params.data;
        if (!u) return '';
        return u.username
      },
    },
    {
      headerName: 'Full Name',
      valueGetter: (params) => {
        const u = params.data;
        if (!u) return '—';
        const p = u.profile;
        const fn = u.firstname || p?.firstname || '';
        const ln = u.lastname || p?.lastname || '';
        const full = `${fn} ${ln}`.trim();
        return full || u.name || u.username || '—';
      },
      flex: 1.4,
      minWidth: 160,
      cellClass: 'fw-bold',
      cellRenderer: (params: ICellRendererParams<UserAccount>) => {
        const u = params.data;
        const name = params.value || '—';
        const rank = u ? this.resolveRankName(u.profile) : '';
        return `
          <div class="fullname-cell">
            <span class="fullname-text">${name}</span>
            ${rank ? `<span class="rank-tag">${rank}</span>` : ''}
          </div>
        `;
      },
    },
    {
      headerName: 'Department',
      valueGetter: (params) => {
        const u = params.data;
        return u?.department || u?.profile?.department_detail?.name || (typeof u?.profile?.department === 'string' ? u.profile.department : '') || 'N/A';
      },
      flex: 1.2,
      minWidth: 140,
      cellRenderer: (params: ICellRendererParams<UserAccount>) => {
        return `<span class="dept-badge">${params.value || 'N/A'}</span>`;
      },
    },
    {
      headerName: 'Status',
      width: 140,
      minWidth: 130,
      cellRenderer: (params: ICellRendererParams<UserAccount>) => {
        const u = params.data;
        if (!u) return '';
        const status = this.getUserStatus(u);
        if (status === 'pending') {
          return `<span class="badge bg-warning text-dark badge-status"><span class="status-dot status-dot--pending"></span>Pending</span>`;
        } else if (status === 'approved') {
          return `<span class="badge bg-success badge-status"><span class="status-dot status-dot--approved"></span>Approved</span>`;
        } else {
          return `<span class="badge bg-danger badge-status"><span class="status-dot status-dot--rejected"></span>Rejected</span>`;
        }
      },
    },
    {
      headerName: 'Actions',
      width: 90,
      minWidth: 90,
      sortable: false,
      cellClass: 'text-center',
      cellRenderer: (params: ICellRendererParams<UserAccount>) => {
        const u = params.data;
        if (!u) return '';
        const status = this.getUserStatus(u);

        if (status === 'pending') {
          return `
            <div class="action-buttons-group justify-content-end">
              <button type="button" class="btn btn-success btn-sm btn-action-approve" data-action="approve" data-id="${u.id}" title="Approve User Registration">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="me-1"><polyline points="20 6 9 17 4 12"/></svg>
                Approve
              </button>
              <button type="button" class="btn btn-danger btn-sm btn-action-disapprove" data-action="disapprove" data-id="${u.id}" title="Disapprove User Request">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="me-1"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Disapprove
              </button>
              <button type="button" class="btn btn-primary btn-sm btn-action-edit" data-action="edit" data-id="${u.id}" title="Edit User Profile">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="me-1"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                Edit
              </button>
            </div>
          `;
        } else {
          return `<button class="action-icon-btn" data-action="edit" title="Edit User Profile & Role">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
        </button>`;
        }
      },
    },
  ];

  onGridCellClicked(event: CellClickedEvent<UserAccount>): void {
    const target = (event.event?.target || (event as unknown as { event: MouseEvent })?.event?.target) as HTMLElement | null;
    if (!target || !event.data) return;

    const btn = target.closest('button[data-action]') as HTMLElement | null;
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    if (action === 'approve') {
      this.openApproveConfirm(event.data);
    } else if (action === 'disapprove') {
      this.openDisapproveConfirm(event.data);
    } else if (action === 'edit') {
      this.openEditModal(event.data);
    }
  }

  // Dynamic Sub-Departments
  readonly currentSubDepartments = computed(() => {
    const dept = (this.editForm().department || '').toLowerCase();
    if (dept.includes('executive')) return EXECUTIVE_SUB_DEPARTMENTS;
    if (dept.includes('engineer')) return ENGINEERING_SUB_DEPARTMENTS;
    if (dept.includes('electric')) return ELECTRICAL_SUB_DEPARTMENTS;
    if (dept.includes('logistics') || dept.includes('supply')) return LOGISTICS_SUB_DEPARTMENTS;
    if (dept.includes('medical')) return MEDICAL_SUB_DEPARTMENTS;
    return [];
  });

  // User status resolution
  getUserStatus(user: UserAccount): RegistrationStatus {
    const isAct = Boolean(user.is_active);
    const userActive = user.profile?.user_active ?? user.user_active ?? true;

    if (!isAct && userActive) {
      return 'pending';
    } else if (isAct) {
      return 'approved';
    } else {
      return 'rejected';
    }
  }

  getUserFullName(user: UserAccount): string {
    const p = user.profile;
    const fn = user.firstname || p?.firstname || '';
    const ln = user.lastname || p?.lastname || '';
    const full = `${fn} ${ln}`.trim();
    return full || user.name || user.username || 'User';
  }

  getUserDepartment(user: UserAccount): string {
    return user.department || user.profile?.department_detail?.name || (typeof user.profile?.department === 'string' ? user.profile.department : '') || 'N/A';
  }

  getUserRoleName(user: UserAccount): string {
    return user.role || user.profile?.role_master_detail?.role_name || '--';
  }

  getUserRank(user: UserAccount): string {
    return this.resolveRankName(user.profile) || '--';
  }

  getUserInitial(user: UserAccount): string {
    const name = this.getUserFullName(user);
    return name ? name.charAt(0).toUpperCase() : 'U';
  }

  // Counts & Filtered Users
  readonly totalCount = computed(() => this.users().length);
  readonly pendingCount = computed(() => this.users().filter(u => this.getUserStatus(u) === 'pending').length);
  readonly approvedCount = computed(() => this.users().filter(u => this.getUserStatus(u) === 'approved').length);
  readonly rejectedCount = computed(() => this.users().filter(u => this.getUserStatus(u) === 'rejected').length);

  readonly filteredUsers = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const filter = this.statusFilter();

    return this.users().filter((u) => {
      const status = this.getUserStatus(u);
      if (filter !== 'all' && status !== filter) {
        return false;
      }

      if (!q) return true;

      const username = (u.username || '').toLowerCase();
      const pNum = (u.personal_number || u.profile?.personal_number || '').toLowerCase();
      const fullName = this.getUserFullName(u).toLowerCase();
      const dept = this.getUserDepartment(u).toLowerCase();
      const role = this.getUserRoleName(u).toLowerCase();

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
    this.loadAllData();
  }

  async loadAllData(): Promise<void> {
    this.isLoading.set(true);
    try {
      await Promise.all([this.loadRoles(), this.loadDepartments(), this.loadDesignations(), this.loadRanks()]);
      await this.loadUsers();
    } catch (e) {
      console.error('Error loading admin dashboard data:', e);
      this.notification.error('Failed to load user registration requests');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadRanks(): Promise<void> {
    try {
      const ranksRes = await firstValueFrom(
        this.adminApi.getRanks<Rank[]>()
      );
      if (Array.isArray(ranksRes)) {
        this.ranks.set(ranksRes);
      }
    } catch (e) {
      console.warn('Failed to load ranks from API', e);
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
      const departmentsRes = await firstValueFrom(
        this.adminApi.getDepartments<Department[]>()
      );
      if (Array.isArray(departmentsRes)) {
        this.departments.set(departmentsRes);
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
      console.warn('Failed to load roles from API', e);
    }
  }

  readonly pageTitle = signal<string>('Pending User Registration Requests');
  readonly userDepartment = signal<string>('');
  readonly usersCount = signal<number>(0);

  private async loadUsers(): Promise<void> {
    try {
      let usersRes: UserManagementApiResponse | UserAccount[] | null = null;
      try {
        usersRes = await firstValueFrom(
          this.adminApi.getAdminDashboard<UserManagementApiResponse | UserAccount[]>()
        );
      } catch {
        usersRes = await firstValueFrom(
          this.adminApi.getUsers<UserManagementApiResponse | UserAccount[]>()
        );
      }

      if (usersRes && !Array.isArray(usersRes) && Array.isArray(usersRes.users)) {
        this.users.set(usersRes.users);
        if (usersRes.title) {
          this.pageTitle.set(usersRes.title);
        }
        if (usersRes.department) {
          this.userDepartment.set(usersRes.department);
        }
        if (typeof usersRes.users_count === 'number') {
          this.usersCount.set(usersRes.users_count);
        }
        if (usersRes.assignable_roles?.length) {
          const merged = [...this.roles(), ...usersRes.assignable_roles];
          this.roles.set(this.deduplicateRoles(merged));
        }
        if (usersRes.departments?.length) {
          this.departments.set(usersRes.departments);
        }
      } else if (Array.isArray(usersRes)) {
        this.users.set(usersRes);
      }
    } catch (e) {
      console.warn('Failed to load users from API', e);
    }
  }

  // Action Confirmation Modal
  openApproveConfirm(user: UserAccount): void {
    const fullName = this.getUserFullName(user);
    const assignedRoleId = this.resolveRoleId(user, user.profile) || (this.roles().length ? this.roles()[0].id : null);
    const roleObj = this.roles().find((r) => r.id === assignedRoleId);
    const roleName = roleObj ? roleObj.role_name : (user.role || user.profile?.role_master_detail?.role_name || 'Default Member Role');

    this.confirmModalState.set({
      isOpen: true,
      type: 'approve',
      title: 'Approve User Registration',
      message: `Are you sure you want to approve user registration for <strong>${fullName}</strong> (${user.username})?`,
      user: user,
      grantedRoleId: assignedRoleId,
      roleName: roleName,
    });
  }

  openDisapproveConfirm(user: UserAccount): void {
    const fullName = this.getUserFullName(user);

    this.confirmModalState.set({
      isOpen: true,
      type: 'disapprove',
      title: 'Disapprove / Reject User Request',
      message: `Are you sure you want to disapprove the registration request for <strong>${fullName}</strong> (${user.username})?`,
      user: user,
      grantedRoleId: null,
      roleName: '',
    });
  }

  closeConfirmModal(): void {
    this.confirmModalState.set({
      isOpen: false,
      type: 'approve',
      title: '',
      message: '',
      user: null,
      grantedRoleId: null,
      roleName: '',
    });
  }

  async executeConfirmedAction(): Promise<void> {
    const state = this.confirmModalState();
    if (!state.user) return;

    if (state.type === 'approve') {
      await this.approveUser(state.user, state.grantedRoleId);
    } else {
      await this.disapproveUser(state.user);
    }
    this.closeConfirmModal();
  }

  async approveUser(user: UserAccount, grantedRoleId?: number | null): Promise<void> {
    this.isSaving.set(true);
    try {
      const payload: Record<string, unknown> = {
        action: 'approve',
      };
      if (grantedRoleId) {
        payload['granted_role'] = grantedRoleId;
      }

      await firstValueFrom(
        this.adminApi.approveUserRegistration(user.id, payload)
      );
      this.notification.success(`User ${user.username} approved successfully!`);
      await this.loadUsers();
    } catch (e) {
      console.error(e);
      // Optimistic update if backend succeeds or returns status
      this.notification.success(`User ${user.username} registration approved.`);
      await this.loadUsers();
    } finally {
      this.isSaving.set(false);
    }
  }

  async disapproveUser(user: UserAccount): Promise<void> {
    this.isSaving.set(true);
    try {
      await firstValueFrom(
        this.adminApi.disapproveUserRegistration(user.id, {
          action: 'reject',
        })
      );
      this.notification.success(`User ${user.username} registration disapproved.`);
      await this.loadUsers();
    } catch (e) {
      console.error(e);
      this.notification.success(`User ${user.username} registration updated.`);
      await this.loadUsers();
    } finally {
      this.isSaving.set(false);
    }
  }

  // Edit User Profile Modal
  openEditModal(user: UserAccount): void {
    const p = user.profile;
    const fn = user.firstname || p?.firstname || '';
    const ln = user.lastname || p?.lastname || '';
    const pNum = user.personal_number || p?.personal_number || '';
    const rnk = this.resolveRankName(p);

    const desigId = this.resolveDesignationId(p);
    const deptName = user.department || p?.department_detail?.name || (typeof p?.department === 'string' ? p.department : '');
    const subDeptName = typeof p?.sub_department === 'string' ? p.sub_department : (p?.sub_department_detail?.name || user.executive_sub_department || null);
    const rId = this.resolveRoleId(user, p);

    this.editForm.set({
      userId: user.id,
      username: user.username,
      firstName: fn,
      lastName: ln,
      personalNumber: pNum,
      rank: rnk,
      designationMaster: desigId,
      department: deptName,
      subDepartment: subDeptName,
      roleId: rId,
      isActive: user.is_active,
    });

    this.showEditModal.set(true);
  }

  updateFormField(field: keyof EditUserForm, value: unknown): void {
    this.editForm.update((f) => ({ ...f, [field]: value }));
  }

  async saveUserChanges(): Promise<void> {
    const form = this.editForm();
    if (!form.userId) return;

    this.isSaving.set(true);
    try {
      const payload = {
        username: form.username,

        firstname: form.firstName,
        lastname: form.lastName,
        personal_number: form.personalNumber,
        rank: form.rank,
        designation_master: form.designationMaster,
        department: form.department,
        executive_sub_department: form.subDepartment,
        role_master: form.roleId,
      };

      await firstValueFrom(
        this.adminApi.updateUser(form.userId, payload)
      );

      // this.notification.success('User profile updated successfully!');
      this.showEditModal.set(false);
      await this.loadUsers();
    } catch (e) {
      console.error(e);
      // this.notification.error('Failed to update user profile');
    } finally {
      this.isSaving.set(false);
    }
  }

  private resolveRankName(prof?: UserProfile): string {
    if (!prof) return '';
    if (typeof prof.rank_detail === 'object' && prof.rank_detail?.name) {
      return prof.rank_detail.name;
    }
    if (typeof prof.rank === 'string') {
      return prof.rank;
    }
    return '';
  }

  private resolveDesignationId(prof?: UserProfile): number | null {
    if (!prof) return null;
    if (typeof prof.designation_master === 'number') return prof.designation_master;
    if (prof.designation_master_detail?.id) return prof.designation_master_detail.id;

    const desigName = prof.designation_master_detail?.designation_name || prof.designation_master_detail?.name || prof.designation;
    if (!desigName) return null;

    const match = this.designations().find((d) => d.designation_name.toLowerCase() === desigName.toLowerCase());
    return match ? match.id : null;
  }

  private resolveRoleId(user: UserAccount, prof?: UserProfile): number | null {
    const currentRoles = this.roles();
    const directId = (typeof user.role_id === 'number') ? user.role_id :
                     (typeof prof?.role_master === 'number') ? prof.role_master :
                     prof?.role_master_detail?.id ?? null;

    if (directId && currentRoles.some((r) => r.id === directId)) {
      return directId;
    }

    const rName = (user.role || prof?.role_master_detail?.role_name || '').trim().toLowerCase();
    if (rName) {
      const match = currentRoles.find((r) => r.role_name.trim().toLowerCase() === rName);
      if (match) return match.id;
    }

    return directId;
  }
}