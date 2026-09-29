import { Injectable, computed, inject, signal } from "@angular/core";
import { User } from "../services/user/user";
import { AccessControlled } from "./navigation.model";
import { firstValueFrom } from "rxjs";
import { NavVisibilityService, NavVisibilityResponse, ApiNavItem, NavRole } from "../../Modules/administration/nav-visibility/nav-visibility.service";

export const NAV_KEY_MAP: Record<string, string> = {
  "home": "home",
  "activity": "activity_planner",
  "activity_planner": "activity_planner",
  "technical-dashboard": "op_maintenance",
  "technical_dashboard": "op_maintenance",
  "ship": "ship_configuration",
  "ship_configuration": "ship_configuration",
  "op-maintenance": "op_maintenance",
  "op_maintenance": "op_maintenance",
  "inventory": "inventory",
  "refit_dashboard": "refit_maintenance",
  "refit_maintenance": "refit_maintenance",
  "ship-returns": "ship_returns",
  "ship_returns": "ship_returns",
  "trials": "trials",
  "other-utilities": "other_utilities",
  "other_utilities": "other_utilities",
  "kms": "kms",
  "Ship_Crew_and_HR": "ship_crew",
  "ship_crew": "ship_crew",
  "Administration": "nav_visibility",
  "Navigation_Visibility": "nav_visibility",
  "nav_visibility": "nav_visibility",
  "User_List": "users",
  "users": "users",
  "Ticket_Management": "help_desk",
  "help_desk": "help_desk",
};

const ADMIN_RESTRICTED_MODULES = new Set(["Administration", "User_List"]);
const ADMIN_ALLOWED_ROLES = new Set([
  "SHIPADMIN",
  "CO",
  "COMMAND",
  "SUPER ADMINISTRATOR",
  "ADMIN",
  "ADMINISTRATOR",
  "HEAD OF DEPARTMENT",
  "DY HOD",
]);

// Nav Visibility edits the role x nav-item matrix that everyone's menu is built from, so it's
// held to a tighter allowlist than the rest of the admin area — mirrors the backend's
// NAV_VISIBILITY_LOCKED_ROLES (users/rbac.py) exactly, not the wider ADMIN_ALLOWED_ROLES.
const NAV_VISIBILITY_MODULE = "Navigation_Visibility";
const NAV_VISIBILITY_ALLOWED_ROLES = new Set(["SHIPADMIN", "ADMIN"]);

@Injectable({
  providedIn: "root",
})
export class AccessControlService {
  private readonly navVisibilityService = inject(NavVisibilityService);
  readonly userStore = inject(User);

  readonly navVisibilityData = signal<NavVisibilityResponse | null>(null);

  readonly currentRoleId = computed<number | null>(() => {
    const user = this.userStore.userDetails();
    if (!user) return null;
    if (typeof user.role_id === 'number') return user.role_id;
    if (typeof user.profile?.role_master === 'number') return user.profile.role_master;
    if (user.profile?.role_master_detail?.id) return user.profile.role_master_detail.id;
    return null;
  });

  readonly roles = computed<ReadonlySet<string>>(() => {
    const raw = this.userStore.userDetails()?.roles;
    return new Set(Array.isArray(raw) ? raw : []);
  });

  /** The logged-in user's single role name, upper-cased. `/me/` never returns a `roles` array
   * (see `roles` above, which is consequently always empty) — the only place the current user's
   * role actually lives is `profile.role_master_detail.role_name`. Used by `hasAdminRole()` so
   * role-based admin gating works for accounts that don't also carry `is_staff`/`is_admin`. */
  readonly currentRoleName = computed<string>(() => {
    const user = this.userStore.userDetails();
    const roleName = user?.profile?.role_master_detail?.role_name || user?.role || "";
    return roleName.toUpperCase();
  });

  readonly rbacActive = computed<boolean>(() =>
    Array.isArray(this.userStore.userDetails()?.roles),
  );

  readonly isSuperUser = computed<boolean>(() => {
    const user = this.userStore.userDetails();
    return user?.is_staff === true || user?.is_superuser === true || user?.is_admin === true;
  });

  /** Mirrors the backend's `rbac.can_see_all_departments()` more precisely than `isSuperUser` —
   * `capabilities.is_privileged` is computed server-side from `access_level`/`is_admin`, not the
   * broader Django staff/superuser flags `isSuperUser` reads. Use this specifically when gating a
   * cross-department view (e.g. an admin-only Department filter), not general admin-only UI. */
  readonly isPrivileged = computed<boolean>(
    () => this.userStore.userDetails()?.capabilities?.is_privileged === true,
  );

  readonly visibleNavKeys = computed<ReadonlySet<string>>(() => {
    const navMatrix = this.navVisibilityData();
    const roleId = this.currentRoleId();

    // 1. If nav visibility matrix is loaded and roleId is available, resolve from matrix
    if (navMatrix?.nav_items && roleId != null) {
      const matrixKeys = this.extractVisibleKeysForRole(navMatrix.nav_items, roleId);
      if (matrixKeys) return matrixKeys;
    }

    // 2. Read from user capabilities (returned directly by login & me API)
    const capabilitiesNavKeys = this.userStore.userDetails()?.capabilities?.nav_keys;
    if (Array.isArray(capabilitiesNavKeys) && capabilitiesNavKeys.length > 0) {
      return new Set(capabilitiesNavKeys);
    }

    // 3. Fallback: match by role name if roleId didn't match directly
    if (navMatrix) {
      const roleNameKeys = this.resolveMatrixByRoleName(navMatrix);
      if (roleNameKeys) return roleNameKeys;
    }

    // 4. Last-resort fallback for guest users
    return new Set(["home", "ship_crew"]);
  });

  private extractVisibleKeysForRole(navItems: ApiNavItem[], roleId: number | string): Set<string> | null {
    const visibleSet = new Set<string>(["home"]);
    const key = String(roleId);
    for (const item of navItems) {
      if (item.visibility?.[key]) {
        visibleSet.add(item.key);
      }
    }
    return visibleSet;
  }

  private findMatchingRole(roles: NavRole[], userRoles: ReadonlySet<string>): NavRole | undefined {
    return roles.find(r =>
      userRoles.has(r.role_name) ||
      userRoles.has(r.role_name.toLowerCase()) ||
      userRoles.has(r.role_name.toUpperCase())
    );
  }

  private resolveMatrixByRoleName(navMatrix: NavVisibilityResponse): Set<string> | null {
    if (!navMatrix.roles || !navMatrix.nav_items) return null;
    const matchedRole = this.findMatchingRole(navMatrix.roles, this.roles());
    if (!matchedRole) return null;
    return this.extractVisibleKeysForRole(navMatrix.nav_items, matchedRole.id);
  }

  async loadNavVisibility(): Promise<void> {
    try {
      const res = await firstValueFrom(this.navVisibilityService.getNavVisibility());
      this.navVisibilityData.set(res);
    } catch (e) {
      console.warn("Failed to load nav visibility matrix from backend", e);
    }
  }

  private hasAnyOfRoles(allowedRoles: ReadonlySet<string>): boolean {
    if (this.isSuperUser()) return true;
    if (allowedRoles.has(this.currentRoleName())) return true;
    const granted = this.roles();
    return Array.from(granted).some((r) => allowedRoles.has(r.toUpperCase()));
  }

  private hasAdminRole(): boolean {
    return this.hasAnyOfRoles(ADMIN_ALLOWED_ROLES);
  }

  private hasNavVisibilityRole(): boolean {
    return this.hasAnyOfRoles(NAV_VISIBILITY_ALLOWED_ROLES);
  }

  private isNavVisible(ruleId?: string): boolean {
    if (!ruleId) return true;
    const navKey = NAV_KEY_MAP[ruleId];
    return !navKey || this.visibleNavKeys().has(navKey);
  }

  private hasRequiredRoles(required?: readonly string[]): boolean {
    if (!required || required.length === 0 || !this.rbacActive()) {
      return true;
    }
    const granted = this.roles();
    return required.some((role) => granted.has(role));
  }

  canAccess(rule?: AccessControlled | null): boolean {
    if (!rule) return true;

    // Home is universally accessible to all authenticated users
    if (rule.id === 'home') {
      return true;
    }

    // 0a. Hard restriction: Nav Visibility is limited to SHIPADMIN and ADMIN only (mirrors the
    // backend's NAV_VISIBILITY_LOCKED_ROLES) -- tighter than the rest of the admin area below.
    if (rule.id === NAV_VISIBILITY_MODULE && !this.hasNavVisibilityRole()) {
      return false;
    }

    // 0b. Hard restriction: Administration module is strictly limited to SHIPADMIN, CO, and Super Admins
    if (rule.id && ADMIN_RESTRICTED_MODULES.has(rule.id) && !this.hasAdminRole()) {
      return false;
    }

    // 1. Check Nav Visibility mapping against visibleNavKeys
    if (!this.isNavVisible(rule.id)) {
      return false;
    }

    // 2. Fall back to superuser check
    if (this.isSuperUser()) {
      return true;
    }

    // 3. Role-based fallback check
    return this.hasRequiredRoles(rule.roles);
  }

  hasRole(role: string): boolean {
    return this.isSuperUser() || this.roles().has(role);
  }

  /** Case-insensitive `hasRole` for a set of roles — same matching style as the private
   * `hasAdminRole()` this mirrors, so a differently-cased role name in the granted set (or in the
   * caller's list) still matches. Use this instead of a component rolling its own role check
   * against `profile.role_master_detail.role_name` or similar — that reads a different, unrelated
   * property path and can silently diverge from what the Nav Visibility matrix / `roles()` set
   * says (see `srar-transaction.component.ts`'s former `isCoUser`, folded into this). */
  hasAnyRole(roles: readonly string[]): boolean {
    if (this.isSuperUser()) return true;
    const granted = this.roles();
    const wanted = new Set(roles.map((r) => r.toUpperCase()));
    return Array.from(granted).some((r) => wanted.has(r.toUpperCase()));
  }

  hasPermission(_moduleId?: string, _action?: string): boolean {
    return this.isSuperUser();
  }
}

