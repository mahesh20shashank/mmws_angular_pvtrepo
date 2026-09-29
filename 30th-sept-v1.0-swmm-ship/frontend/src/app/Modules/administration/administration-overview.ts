import { ButtonComponent } from '../../shared/components/button/button.component';
import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NotificationService } from "../../Core/services/notification/notification.service";
import { NavVisibilityComponent } from "./nav-visibility/nav-visibility.component";
import { AdministrationApi } from "./services/administration-api";
import { firstValueFrom } from "rxjs";
import { ModalComponent } from "../../shared/components";
import { ColDef, CellCallbackParams } from "ag-grid-community";
import { DataGrid } from "../../shared/components/data-grid/data-grid";

export interface Role {
  id: number;
  role_name: string;
  code: string | null;
  description: string;
  is_system: boolean;
  assigned_users_count: number;
}

export interface RolePermission {
  id: number;
  module_id: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
  can_approve: boolean;
}

export interface UserDetail {
  id: number;
  username: string;
  is_active: boolean;
  is_admin: boolean;
  profile: {
    firstname: string;
    lastname: string;
    department: number | null;
    department_detail?: {
      id: number;
      name: string;
    };
    role_master?: number | null;
    role_master_detail?: {
      id: number;
      role_name: string;
    };
  } | null;
}

const MODULE_DISPLAY_NAMES: Record<string, { title: string; category: string }> = {
  dashboard: { title: "Dashboard & Overview", category: "Cmd & Situational Awareness" },
  ship_crew: { title: "Ship Crew & Divisional Org", category: "Operations & Sustainment" },
  activity_planner: { title: "Activity & Routine Planner", category: "Operations & Sustainment" },
  inventory: { title: "Inventory & Logistics", category: "Operations & Sustainment" },
  kms: { title: "Knowledge Management System", category: "Operations & Sustainment" },
  dms: { title: "Defect Management System", category: "Operations & Sustainment" },
  srar: { title: "SRAR & Returns", category: "Refit Management" },
  refit: { title: "Refit Monitoring", category: "Refit Management" },
  references: { title: "Master & References", category: "Application Admin & Security" },
  rbac_admin: { title: "RBAC & Security Admin", category: "Application Admin & Security" },
  other_utilities: { title: "Other Utilities", category: "Utilities & Crew" },
};

@Component({
  selector: "app-administration-overview",
  standalone: true,
  imports: [CommonModule, FormsModule, NavVisibilityComponent, ButtonComponent, DataGrid, ModalComponent],
  templateUrl: "./administration-overview.html",
  styleUrls: ["./administration-overview.css"],
})
export class AdministrationOverview implements OnInit {
  private readonly adminApi = inject(AdministrationApi);
  private readonly notification = inject(NotificationService);

  // Tabs management
  readonly activeTab = signal<"matrix" | "nav-visibility" | "catalog" | "assignments">("matrix");

  // Data stores
  readonly roles = signal<Role[]>([]);
  readonly users = signal<UserDetail[]>([]);
  readonly selectedRoleId = signal<number | null>(null);
  readonly permissions = signal<RolePermission[]>([]);

  // Search & Filters
  readonly searchUserQuery = signal<string>("");

  // Modals state
  readonly showRoleModal = signal<boolean>(false);
  readonly showAssignModal = signal<boolean>(false);

  // Form bindings
  readonly roleForm = signal<{
    id: number | null;
    role_name: string;
    code: string;
    description: string;
    is_system: boolean;
  }>({
    id: null,
    role_name: "",
    code: "",
    description: "",
    is_system: false,
  });

  readonly assignForm = signal<{
    userId: number | null;
    username: string;
    fullName: string;
    roleId: number | null;
  }>({
    userId: null,
    username: "",
    fullName: "",
    roleId: null,
  });

  // Saving states
  readonly isSaving = signal<boolean>(false);

  readonly userColumnDefs: ColDef[] = [
    {
      headerName: "User",
      field: "username",
      flex: 1.2,
      minWidth: 200,
      cellRenderer: (params: CellCallbackParams) => {
        const user = params.data as UserDetail | undefined;
        const fullName = `${user?.profile?.firstname || ""} ${user?.profile?.lastname || ""}`.trim() || "—";
        return `
          <div style="display:flex;flex-direction:column;line-height:1.2;">
            <span>${fullName}</span>
            <span style="color:var(--text-muted,#888);font-size:12px;">@${user?.username ?? ""}</span>
          </div>
        `;
      },
    },
    {
      headerName: "Department",
      field: "profile.department_detail.name",
      flex: 1,
      minWidth: 160,
      valueGetter: (params) => (params.data as UserDetail | undefined)?.profile?.department_detail?.name || "Unassigned",
    },
    {
      headerName: "Assigned Roles",
      field: "profile.role_master_detail.role_name",
      flex: 1,
      minWidth: 180,
      valueGetter: (params) => (params.data as UserDetail | undefined)?.profile?.role_master_detail?.role_name || "No Role Assigned",
    },
    {
      headerName: "Action",
      field: "id",
      width: 140,
      sortable: false,
      cellRenderer: () => `<button type="button" class="manage-btn">Manage Roles</button>`,
    },
  ];

  onUserGridCellClicked(event: CellCallbackParams): void {
    if (event.colDef?.headerName !== "Action") return;
    const user = event.data as UserDetail | undefined;
    if (user) this.openAssignRoleModal(user);
  }

  ngOnInit() {
    this.loadRolesAndUsers();
  }

  async loadRolesAndUsers() {
    try {
      const rolesRes = await firstValueFrom(
        this.adminApi.getRoles<Role[]>()
      );
      this.roles.set(rolesRes);

      if (rolesRes.length > 0 && !this.selectedRoleId()) {
        this.selectRoleForMatrix(rolesRes[0].id);
      }

      const usersRes = await firstValueFrom(
        this.adminApi.getUsers<UserDetail[]>()
      );
      this.users.set(usersRes);
    } catch (e) {
      console.error(e);
      this.notification.error("Failed to load initial RBAC data");
    }
  }

  getModuleMeta(moduleId: string) {
    return MODULE_DISPLAY_NAMES[moduleId] || { title: moduleId, category: "General" };
  }

  getSelectedRoleName(): string {
    const roleId = this.selectedRoleId();
    if (!roleId) return "";
    const match = this.roles().find((r) => r.id === roleId);
    return match ? match.role_name : "";
  }

  async selectRoleForMatrix(roleId: number) {
    this.selectedRoleId.set(roleId);
    try {
      const res = await firstValueFrom(
        this.adminApi.getRoleMatrix<RolePermission[]>(roleId)
      );
      const mapped = res.map((p) => {
        if (p.module_id === "dashboard") {
          return { ...p, can_view: true };
        }
        return p;
      });
      this.permissions.set(mapped);
    } catch (e) {
      console.error(e);
      this.notification.error("Failed to load permission matrix");
    }
  }

  // Toggle Matrix column-wise
  toggleColumn(field: keyof RolePermission) {
    const list = this.permissions();
    const allChecked = list.every((p) => p[field] === true);
    const updated = list.map((p) => ({
      ...p,
      [field]: !allChecked,
    }));
    this.permissions.set(updated as RolePermission[]);
  }

  // Toggle Matrix row-wise
  toggleRow(perm: RolePermission) {
    const allChecked =
      perm.can_view &&
      perm.can_create &&
      perm.can_edit &&
      perm.can_delete &&
      perm.can_export &&
      perm.can_approve;

    const list = this.permissions();
    const updated = list.map((p) => {
      if (p.id === perm.id) {
        return {
          ...p,
          can_view: !allChecked,
          can_create: !allChecked,
          can_edit: !allChecked,
          can_delete: !allChecked,
          can_export: !allChecked,
          can_approve: !allChecked,
        };
      }
      return p;
    });
    this.permissions.set(updated);
  }

  // Select All Matrix
  selectAllPermissions() {
    const updated = this.permissions().map((p) => ({
      ...p,
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: true,
      can_export: true,
      can_approve: true,
    }));
    this.permissions.set(updated);
  }

  // Clear All Matrix
  clearAllPermissions() {
    const updated = this.permissions().map((p) => ({
      ...p,
      can_view: p.module_id === "dashboard" ? true : false,
      can_create: false,
      can_edit: false,
      can_delete: false,
      can_export: false,
      can_approve: false,
    }));
    this.permissions.set(updated);
  }

  // Save Matrix
  async savePermissionMatrix() {
    const roleId = this.selectedRoleId();
    if (!roleId) return;

    this.isSaving.set(true);
    try {
      await firstValueFrom(
        this.adminApi.saveRoleMatrix(roleId, this.permissions())
      );
      this.notification.success("Permission Matrix saved successfully!");
      //   await this.accessControl.loadMyPermissions();
    } catch (e) {
      console.error(e);
      this.notification.error("Failed to save permission matrix");
    } finally {
      this.isSaving.set(false);
    }
  }

  // Roles Catalog Actions
  openCreateRoleModal() {
    this.roleForm.set({
      id: null,
      role_name: "",
      code: "",
      description: "",
      is_system: false,
    });
    this.showRoleModal.set(true);
  }

  openEditRoleModal(role: Role) {
    this.roleForm.set({
      id: role.id,
      role_name: role.role_name,
      code: role.code || "",
      description: role.description,
      is_system: role.is_system,
    });
    this.showRoleModal.set(true);
  }

  async saveRole() {
    const form = this.roleForm();
    if (!form.role_name.trim()) {
      this.notification.error("Role Name is required");
      return;
    }

    this.isSaving.set(true);
    try {
      const payload = {
        role_name: form.role_name,
        code: form.code || form.role_name.toLowerCase().replace(/\s+/g, "_"),
        description: form.description,
        is_system: form.is_system,
      };

      if (form.id) {
        await firstValueFrom(
          this.adminApi.updateRole(form.id, payload)
        );
        this.notification.success("Role updated successfully!");
      } else {
        await firstValueFrom(
          this.adminApi.createRole(payload)
        );
        this.notification.success("Custom Role created successfully!");
      }
      this.showRoleModal.set(false);
      this.loadRolesAndUsers();
    } catch (e) {
      console.error(e);
      this.notification.error("Failed to save role configuration");
    } finally {
      this.isSaving.set(false);
    }
  }

  async deleteRole(roleId: number) {
    if (!confirm("Are you sure you want to delete this custom role?")) {
      return;
    }

    try {
      await firstValueFrom(
        this.adminApi.deleteRole(roleId)
      );
      this.notification.success("Role deleted successfully!");
      this.loadRolesAndUsers();
    } catch (e) {
      console.error(e);
      this.notification.error("Failed to delete role");
    }
  }

  // User Assignments Actions
  filteredUsers() {
    const query = this.searchUserQuery().toLowerCase().trim();
    if (!query) return this.users();

    return this.users().filter((u) => {
      const fullName = (
        (u.profile?.firstname || "") +
        " " +
        (u.profile?.lastname || "")
      ).toLowerCase();
      const username = u.username.toLowerCase();
      const dept = (u.profile?.department_detail?.name || "").toLowerCase();

      return (
        fullName.includes(query) ||
        username.includes(query) ||
        dept.includes(query)
      );
    });
  }

  openAssignRoleModal(user: UserDetail) {
    const fullName =
      (user.profile?.firstname || "") + " " + (user.profile?.lastname || "");
    this.assignForm.set({
      userId: user.id,
      username: user.username,
      fullName: fullName.trim() || user.username,
      roleId: user.profile?.role_master || null,
    });
    this.showAssignModal.set(true);
  }

  async saveUserRoleAssignment() {
    const form = this.assignForm();
    if (!form.userId) return;

    this.isSaving.set(true);
    try {
      // PATCH /api/v1/user/users/<userId>/ with role_master
      await firstValueFrom(
        this.adminApi.updateUser(form.userId, {
          role_master: form.roleId,
        })
      );
      this.notification.success("User role assignment updated!");
      this.showAssignModal.set(false);
      this.loadRolesAndUsers();
    } catch (e) {
      console.error(e);
      this.notification.error("Failed to assign role to user");
    } finally {
      this.isSaving.set(false);
    }
  }
}
