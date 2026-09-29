import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from '../../../Core/services/notification/notification.service';
import { HelpGuidance } from '../../../shared/components/help-guidance/help-guidance';
import { ModalComponent } from '../../../shared/components/modal/modal.component';
import { AccessControlService } from '../../../Core/navigation/access-control.service';
import {
  NavVisibilityService,
  NavRole,
  NavItem,
  SaveCellPayload,
  SaveNavVisibilityPayload,
} from './nav-visibility.service';

@Component({
  selector: 'app-nav-visibility',
  standalone: true,
  imports: [CommonModule, FormsModule, HelpGuidance, ModalComponent, ButtonComponent],
  templateUrl: './nav-visibility.component.html',
  styleUrls: ['./nav-visibility.component.css']
})
export class NavVisibilityComponent implements OnInit {
  private readonly notification = inject(NotificationService);
  private readonly navVisibilityService = inject(NavVisibilityService);
  private readonly accessControl = inject(AccessControlService);

  readonly isHelpOpen = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);

  readonly searchQuery = signal<string>('');
  readonly selectedCategory = signal<string>('ALL');

  readonly helpHtml = `<p><strong>What this page is for</strong><br>
This page controls <strong>which menu items each role can see</strong> in the left navigation bar. Before this page existed, the menu was fixed in the code and could only be changed by a developer. Now you can change it yourself, and the change takes effect the next time that user loads a page.</p>

<p><strong>How to read the table</strong></p>
<ul>
  <li>Each <strong>row</strong> is one menu item in the left navbar, listed in the same order it appears there.</li>
  <li>Each <strong>column</strong> is one role.</li>
  <li>A <strong>ticked box</strong> means that role sees that menu item. An unticked box means it is hidden.</li>
</ul>

<p><strong>How to make a change</strong></p>
<ul>
  <li>Tick or untick the boxes you want to change.</li>
  <li>Press <strong>Save Visibility</strong> at the bottom. Nothing is saved until you press it.</li>
  <li>Ask the affected user to refresh their page. They do not need to log out and back in.</li>
</ul>

<p><strong>Important things to know</strong></p>
<ul>
  <li><strong>Sub-menu items follow their parent.</strong> If you hide <em>Op. Maintenance</em>, everything inside it (Defect, Routines, Op. Utilities, e-Logbooks) is hidden too. There is no separate row for each child.</li>
  <li><strong>Hiding a menu item is not a security control on its own.</strong> It removes the link from the sidebar. Access to the individual pages is governed separately by the role rules built into the application.</li>
  <li><strong>Nav Visibility is deliberately admin-only.</strong> Keep the Nav Visibility row ticked for your own role. If you untick it and save, you will lose your own route back to this page and it will have to be restored from the database.</li>
  <li><strong>Home and Ship Crew are the safe minimum.</strong> A user whose role has nothing ticked will see an empty sidebar. It is good practice to leave Home ticked for every role.</li>
</ul>

<p><strong>Roles that are not listed here</strong><br>
A few older roles — <em>CO</em>, <em>Sailor</em>, <em>Regulator</em>, <em>Divisional Officer</em> and <em>GX</em> — are not part of this table. Anyone holding one of those roles automatically sees the same menu as <strong>Guest user</strong>, which is Home and Ship Crew. If you need one of those roles to see more, assign the person a role that appears in this table instead.</p>`;

  readonly roles = signal<NavRole[]>([]);
  readonly navItems = signal<NavItem[]>([]);
  readonly matrixMap = signal<Map<string, boolean>>(new Map());

  // Filter out the logged-in user's role from the displayed columns
  readonly visibleRoles = computed<NavRole[]>(() => {
    const currentRoleId = this.accessControl.currentRoleId();
    const user = this.accessControl.userStore.userDetails();
    const userRoleName = (user?.role || user?.profile?.role_master_detail?.role_name || '').toLowerCase().trim();
    //const userRolesList = Array.isArray(user?.roles) ? user.roles.map(r => String(r).toLowerCase().trim()) : [];

    return this.roles().filter(role => {
      // Check role ID match
      if (currentRoleId != null && role.id === currentRoleId) {
        return false;
      }
      // Check role name match
      const rName = (role.role_name || '').toLowerCase().trim();
      if (userRoleName && rName === userRoleName) {
        return false;
      }
      // if (userRolesList.includes(rName)) {
      //   return false;
      // }
      return true;
    });
  });

  readonly categories = computed<string[]>(() => {
    const cats = new Set(this.navItems().map(item => item.category));
    return Array.from(cats);
  });

  readonly filteredNavItems = computed<NavItem[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const cat = this.selectedCategory();

    return this.navItems().filter(item => {
      const matchesSearch = !query ||
        item.label.toLowerCase().includes(query) ||
        item.key.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query);

      const matchesCat = cat === 'ALL' || item.category === cat;
      return matchesSearch && matchesCat;
    });
  });

  readonly totalCells = computed(() => this.navItems().length * this.visibleRoles().length);
  readonly visibleCellsCount = computed(() => {
    let count = 0;
    for (const isVis of this.matrixMap().values()) {
      if (isVis) count++;
    }
    return count;
  });

  ngOnInit(): void {
    this.fetchNavVisibility();
  }

  private getCategoryForKey(key: string): string {
    const catMap: Record<string, string> = {
      home: 'Command & Overview',
      activity_planner: 'Command & Overview',
      ship_configuration: 'Operations & Configuration',
      op_maintenance: 'Maintenance & Operations',
      inventory: 'Inventory & Logistics',
      ship_returns: 'Refit & Returns',
      trials: 'Refit & Returns',
      refit_maintenance: 'Refit & Returns',
      other_utilities: 'Utilities & Settings',
      kms: 'Knowledge & Documents',
      help_desk: 'Support & Help',
      ship_crew: 'Crew & Personnel',
      nav_visibility: 'Administration & Security',
      users: 'Administration & Security'
    };
    return catMap[key] || 'Navigation Menu';
  }

  async fetchNavVisibility(): Promise<void> {
    this.isLoading.set(true);
    try {
      const data = await firstValueFrom(this.navVisibilityService.getNavVisibility());

      if (data?.roles) {
        this.roles.set(data.roles);
      }

      if (data?.nav_items) {
        const items: NavItem[] = data.nav_items.map(item => ({
          id: item.key,
          key: item.key,
          label: item.label,
          category: item.category || this.getCategoryForKey(item.key),
          order: item.order || 0,
          locked_for: item.locked_for || []
        })).sort((a, b) => a.order - b.order);

        this.navItems.set(items);

        const map = new Map<string, boolean>();
        for (const item of data.nav_items) {
          if (item.visibility) {
            for (const [roleIdStr, isVis] of Object.entries(item.visibility)) {
              map.set(`${item.key}_${roleIdStr}`, !!isVis);
            }
          }
        }
        this.matrixMap.set(map);
      }
    } catch (err) {
      console.error('Error fetching nav visibility settings:', err);
      this.notification.error('Failed to load navigation visibility data.', 'API Error');
    } finally {
      this.isLoading.set(false);
    }
  }

  isLocked(navItemKey: string | number, roleId: number | string): boolean {
    const item = this.navItems().find(i => i.key === String(navItemKey));
    if (!item?.locked_for || !Array.isArray(item.locked_for)) {
      return false;
    }
    const roleIdStr = String(roleId);
    return item.locked_for.some(id => String(id) === roleIdStr);
  }

  isVisible(navItemKey: string | number, roleId: number): boolean {
    return this.matrixMap().get(`${navItemKey}_${roleId}`) ?? false;
  }

  toggleCell(navItemKey: string | number, roleId: number): void {
    if (this.isLocked(navItemKey, roleId)) {
      return;
    }
    const key = `${navItemKey}_${roleId}`;
    const current = this.isVisible(navItemKey, roleId);
    const newMap = new Map(this.matrixMap());
    newMap.set(key, !current);
    this.matrixMap.set(newMap);
  }

  toggleRow(navItemKey: string | number): void {
    const editableRoles = this.roles().filter(role => !this.isLocked(navItemKey, role.id));
    if (editableRoles.length === 0) return;

    const allChecked = editableRoles.every(role => this.isVisible(navItemKey, role.id));
    const newMap = new Map(this.matrixMap());

    for (const role of editableRoles) {
      newMap.set(`${navItemKey}_${role.id}`, !allChecked);
    }
    this.matrixMap.set(newMap);
  }

  toggleColumn(roleId: number): void {
    const editableItems = this.filteredNavItems().filter(item => !this.isLocked(item.key, roleId));
    if (editableItems.length === 0) return;

    const allChecked = editableItems.every(item => this.isVisible(item.key, roleId));
    const newMap = new Map(this.matrixMap());

    for (const item of editableItems) {
      newMap.set(`${item.key}_${roleId}`, !allChecked);
    }
    this.matrixMap.set(newMap);
  }

  selectAllVisible(): void {
    const newMap = new Map(this.matrixMap());
    for (const item of this.filteredNavItems()) {
      for (const role of this.visibleRoles()) {
        if (!this.isLocked(item.key, role.id)) {
          newMap.set(`${item.key}_${role.id}`, true);
        }
      }
    }
    this.matrixMap.set(newMap);
  }

  clearAllVisible(): void {
    const newMap = new Map(this.matrixMap());
    for (const item of this.filteredNavItems()) {
      for (const role of this.visibleRoles()) {
        if (!this.isLocked(item.key, role.id)) {
          newMap.set(`${item.key}_${role.id}`, false);
        }
      }
    }
    this.matrixMap.set(newMap);
  }

  async resetMatrix(): Promise<void> {
    await this.fetchNavVisibility();
    this.notification.info('Navigation visibility Matrix reset successfully', 'Matrix Reset');
  }

  readonly showConfirmModal = signal<boolean>(false);

  openSaveConfirm(): void {
    this.showConfirmModal.set(true);
  }

  closeSaveConfirm(): void {
    this.showConfirmModal.set(false);
  }

  async confirmSaveVisibility(): Promise<void> {
    this.closeSaveConfirm();
    await this.saveVisibility();
  }

  async saveVisibility(): Promise<void> {
    this.isSaving.set(true);
    try {
      const cells: SaveCellPayload[] = [];
      const items = this.navItems();
      const rolesList = this.roles();

      for (const item of items) {
        for (const role of rolesList) {
          cells.push({
            role: role.id,
            nav_item: item.key,
            is_visible: this.isVisible(item.key, role.id)
          });
        }
      }

      const payload: SaveNavVisibilityPayload = { cells };
      await firstValueFrom(this.navVisibilityService.saveNavVisibility(payload));
      await this.accessControl.loadNavVisibility();

      // this.notification.success(
      //   `Nav visibility updated successfully! Active rules: ${this.visibleCellsCount()} of ${this.totalCells()} enabled.`,
      //   'Visibility Saved'
      // );
    } catch (err) {
      console.error('Error saving nav visibility updates:', err);
      this.notification.error('Failed to update navigation visibility settings.', 'Save Error');
    } finally {
      this.isSaving.set(false);
    }
  }
}

