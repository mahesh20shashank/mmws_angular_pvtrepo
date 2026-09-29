import { Injectable, inject } from '@angular/core';
import { User } from './user';
import { UserProfile } from './user.model';

const ROLE_COMMAND = 'COMMAND';
const ROLE_ADMIN = 'SHIPADMIN';
const ROLE_HOD = 'Head of Department';
const ROLE_DY_HOD = 'DY HOD';
const ROLE_CO = 'CO';

@Injectable({
  providedIn: 'root',
})
export class TabAccessService {
  private readonly userService = inject(User);

  async canAccessKnowYourRegulators(): Promise<boolean> {
    try {
      const user = await this.userService.getLoggedInUserDetails();
      return this.isCommandOrAdmin(user);
    } catch {
      return false;
    }
  }

  async canAccessDivisionalOrganisation(): Promise<boolean> {
    try {
      const user = await this.userService.getLoggedInUserDetails();
      return this.isHodOrAbove(user);
    } catch {
      return false;
    }
  }

  private getRoleName(user: UserProfile): string | null {
    return user?.profile?.role_master_detail?.role_name ?? null;
  }

  private isCommandOrAdmin(user: UserProfile): boolean {
    const role = this.getRoleName(user);
    return role === ROLE_COMMAND || role === ROLE_ADMIN || role === ROLE_CO;
  }

  private isHodOrAbove(user: UserProfile): boolean {
    const role = this.getRoleName(user);
    return (
      role === ROLE_HOD ||
      role === ROLE_DY_HOD ||
      role === ROLE_COMMAND ||
      role === ROLE_ADMIN ||
      role === ROLE_CO
    );
  }
}
