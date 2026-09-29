import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  AfterViewInit,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  ChangeDetectionStrategy,
  signal,
  ChangeDetectorRef,
  effect
} from "@angular/core";

import { NavigationEnd, Router, RouterModule } from "@angular/router";
import { filter } from "rxjs/operators";
import { User } from "../../../services/user/user";
import { NavigationNode } from "../../../navigation/navigation.model";
import { NavigationService } from "../../../navigation/navigation.service";
import { SidebarDataService, SidebarSection } from "./SidebarDataService";
import { LandingPageService } from "../../../../Modules/landing/services/landing-page.service";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { ThemeService } from "../../../services/theme/theme.service";
import { ThisShipService } from "../../../services/ship/this-ship.service";

/** Small icon shown before each section header label — keyed by sectionLabel
 *  text (matches the SECTIONS constant in navigation.config.ts). Sections not
 *  listed here (e.g. Home's un-labelled section) simply render no icon. */
const SECTION_ICONS: Record<string, string> = {
  "Operations & Maintenance": "wrench",
  "Inventory & Returns": "package",
  "Utilities & Crew": "id-card",
  "Admin": "shield",
};
const DEV_IN_PROGRESS_IDS = new Set<string>(["e-logbooks"]);

@Component({
  selector: "app-sidebar",
  standalone: true,
  imports: [RouterModule, IconComponent, ButtonComponent],
  templateUrl: "./sidebar.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./sidebar.css"],
})
export class Sidebar implements OnInit, AfterViewInit {
  readonly router = inject(Router);
  readonly landingService = inject(LandingPageService);
  readonly userStore = inject(User);
  readonly sidebarDataService = inject(SidebarDataService);
  readonly cdr = inject(ChangeDetectorRef);
  readonly themeService = inject(ThemeService);
  // Developed with Understanding: source of the ship badge name.
  readonly thisShip = inject(ThisShipService);
  readonly devInProgressIds = DEV_IN_PROGRESS_IDS;

  // Bottom-of-sidebar profile card (avatar/name/role) is hidden now that the
  // header shows "Welcome, {role}" instead — kept here, flag-gated, so it can
  // be switched back on in a future version instead of being deleted.
  readonly showProfileFooter = false;
  constructor() {
    effect(() => {
      this.userStore.pendingRoleRequestsCount();
      this.currentUser();
      this.cdr.markForCheck();
    });
  }

  readonly currentUser = computed(() => {
    return this.userStore.userDetails() || this.landingService.user();
  });

  @Input() collapsed = false;
  @Output() collapsedChange = new EventEmitter<boolean>();

  // Developed with Understanding: an other-unit login (a guest, D30) gets no module groups. The pinned
  // Home item and the HR CDF Step 1 link both derive from this list, so they go with it, and the
  // ship badge stays.
  readonly sections = computed<SidebarSection[]>(() =>
    this.userStore.isOtherUnit() ? [] : this.sidebarDataService.getSidebarSections(),
  );
  /** Home has no section label (rendered header-less, pinned above Inbox/Outbox) — pulled out
   *  of `sections()` here so the template can pin it outside the scrollable nav. */
  readonly homeItem = computed<NavigationNode | undefined>(
    () => this.sections().find((s) => !s.sectionLabel)?.items[0],
  );
  readonly scrollableSections = computed<SidebarSection[]>(() =>
    this.sections().filter((s) => !!s.sectionLabel),
  );
  readonly currentUrl = signal(this.router.url);
  expandedItems = new Set<string>();
  /** Section headers (e.g. "Operations & Maintenance") collapsed by the user — absent from this set means expanded, so every section starts open by default. */
  collapsedSections = new Set<string>();

  ngOnInit(): void {
    this.userStore.loadPendingRoleRequestsCount();
    // Developed with Understanding: one read of this-ship/ when the signed-in layout starts.
    this.thisShip.load();
  }

  getItemBadge(item: NavigationNode): number | undefined {
    const isUserItem =
      item.id === "User_List" ||
      item.label?.toLowerCase() === "users" ||
      item.route?.includes("user-list") ||
      item.route?.includes("users") ||
      item.children?.some(
        (child) =>
          child.id === "User_List" ||
          child.label?.toLowerCase() === "users" ||
          child.route?.includes("user-list") ||
          child.route?.includes("users")
      );

    if (isUserItem) {
      const count = this.userStore.pendingRoleRequestsCount();
      return count > 0 ? count : undefined;
    }
    return item.badge;
  }

  ngAfterViewInit(): void {
    this.expandParentsForActiveRoute();
    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd,
        ),
      )
      .subscribe((event: NavigationEnd) => {
        this.currentUrl.set(event.urlAfterRedirects);
        this.expandParentsForActiveRoute();
        this.userStore.loadPendingRoleRequestsCount();
        this.cdr.markForCheck();
      });
  }

  getUserInitial(): string {
    const profile = this.currentUser()?.['profile'] as Record<string, unknown> | undefined;
    const firstName = (profile?.['firstname'] as string) || (this.currentUser()?.['first_name'] as string);
    return firstName?.charAt(0) || "U";
  }

  // Developed with Understanding: the ship badge name - this ship's display name ("INS " plus the
  // HR CDF Step 1 ship name) and nothing else (D23). The CMMS Step 0 choice
  // (userStore.activeShipName) and the profile ship_name are no longer read. An empty string means
  // Step 1 has not run, and the template then shows no badge. It is a signal, so the OnPush badge
  // redraws when the name arrives or is reloaded.
  getShipName(): string {
    return this.thisShip.displayName();
  }

  // Developed with Understanding: whether to offer the "complete HR CDF Step 1" link. It reuses the
  // sidebar's own access decision - the Nav Visibility module (whose header carries the HR CDF tab)
  // is in sections() only when AccessControlService.canAccess lets SHIPADMIN or ADMIN through - so
  // no second role check is added here.
  readonly canCompleteShipName = computed<boolean>(() =>
    this.sections().some((section) => section.items.some((item) => item.id === "Navigation_Visibility")),
  );

  getUserFullName(): string {
    const user = this.currentUser();
    if (!user) {
      return "Profile & Settings";
    }
    const profile = user['profile'] as Record<string, unknown> | undefined;
    if (profile) {
      const firstName = (profile['firstname'] as string) || "";
      const lastName = (profile['lastname'] as string) || "";
      return `${firstName} ${lastName}`.trim();
    }
    const firstName = (user['first_name'] as string) || "";
    const lastName = (user['last_name'] as string) || "";
    return `${firstName} ${lastName}`.trim();
  }

  getUserFirstName(): string {
    const profile = this.currentUser()?.['profile'] as Record<string, unknown> | undefined;
    return (profile?.['firstname'] as string) || (this.currentUser()?.['first_name'] as string) || "User";
  }

  getUserDesignation(): string {
    const profile = this.currentUser()?.['profile'] as Record<string, unknown> | undefined;
    return (profile?.['designation'] as string) || (this.currentUser()?.['designation'] as string) || "--";
  }

  isExpanded(item: NavigationNode): boolean {
    return this.expandedItems.has(item.label);
  }

  toggle(item: NavigationNode): void {
    if (item.children?.length) {
      if (this.expandedItems.has(item.label)) {
        this.expandedItems.delete(item.label);
      } else {
        this.expandedItems.add(item.label);
      }

      this.expandedItems = new Set(this.expandedItems);

      if (item.route) {
        this.navigate(item.route);
      }
    }
  }

  open(item: NavigationNode): void {
    this.navigate(item.route);
  }

  isSectionExpanded(sectionLabel: string): boolean {
    return !this.collapsedSections.has(sectionLabel);
  }

  sectionIcon(sectionLabel: string): string | undefined {
    return SECTION_ICONS[sectionLabel];
  }

  toggleSection(sectionLabel: string): void {
    if (this.collapsedSections.has(sectionLabel)) {
      this.collapsedSections.delete(sectionLabel);
    } else {
      this.collapsedSections.add(sectionLabel);
    }
    this.collapsedSections = new Set(this.collapsedSections);
  }

  toggleSidebar(): void {
    this.collapsed = !this.collapsed;
    this.collapsedChange.emit(this.collapsed);
  }

  navigate(route?: string): void {
    if (route) this.router.navigateByUrl(route);
  }

  readonly navigationService = inject(NavigationService);

  isActive(route?: string): boolean {
    if (!route) {
      return false;
    }
    const url = this.currentUrl().split("?")[0];
    if (url === route || url.startsWith(route + "/")) {
      return true;
    }

    // Match sub-module routes (e.g. /afterAuth/inventory/ship-inventory-obs -> /afterAuth/inventory/ship-inventory-obs/dashboard)
    const normalizedRoute = route.replace(/\/$/, "");
    if (url.startsWith(normalizedRoute + "/")) {
      return true;
    }

    const parts = route.split("/").filter(Boolean);
    if (parts.length > 3) {
      const routeWithoutTab = "/" + parts.slice(0, -1).join("/");
      if (routeWithoutTab && url.startsWith(routeWithoutTab + "/")) {
        return true;
      }
    }
    return false;
  }

  isModuleActive(item: NavigationNode): boolean {
    const currentModule = this.navigationService.getCurrentModule(this.currentUrl());
    if (currentModule && (item.id === currentModule.id || item.id === currentModule.sidebar?.id)) {
      return true;
    }

    if (!item.route) {
      return this.isChildActive(item);
    }

    const url = this.currentUrl().split("?")[0];

    // If item.route is an exact match or prefix of currentUrl
    if (url === item.route || url.startsWith(item.route + "/")) {
      return true;
    }

    return this.isChildActive(item);
  }

  isChildActive(item: NavigationNode): boolean {
    const url = this.currentUrl().split("?")[0];
    return (
      item.children?.some((child) => {
        if (!child.route) return false;
        return (
          url === child.route ||
          url.startsWith(child.route + "/") ||
          this.isActive(child.route)
        );
      }) ?? false
    );
  }

  get allItems(): NavigationNode[] {
    return this.sections().flatMap((s) => s.items);
  }

  private expandParentsForActiveRoute(): void {
    let changed = false;
    for (const item of this.allItems) {
      if (item.children?.length && this.isChildActive(item)) {
        if (!this.expandedItems.has(item.label)) {
          this.expandedItems.add(item.label);
          changed = true;
        }
      }
    }
    if (changed) this.expandedItems = new Set(this.expandedItems);
  }

  getLogoPath(): string {
    // Light theme uses a single dedicated logo asset for both collapsed and
    // expanded states. Dark theme keeps its existing per-state assets.
    if (this.themeService.theme() === "light") {
      return "assests/logo/swmm-sidebar-logo-light.png";
    }
    return this.collapsed
      ? "assests/logo/swmm-sidebar-collaps-logo.png"
      : "assests/logo/swmm-sidebar-open-logo.png";
  }
}
