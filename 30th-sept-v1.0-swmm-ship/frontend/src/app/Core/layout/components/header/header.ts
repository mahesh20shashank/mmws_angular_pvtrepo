import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { Component, OnInit, HostListener, ElementRef, ViewChild, inject, effect, computed, ChangeDetectorRef, ChangeDetectionStrategy, signal } from "@angular/core";
import { Router, RouterModule, NavigationEnd } from "@angular/router";

import { filter } from "rxjs/operators";
import { MailNotiCenter } from "../mail-noti-center/mail-noti-center";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { Auth } from "../../../auth/services/auth.service";
import { NetworkStatusService } from "../../../http/services/network-status.service";
import { NavigationService } from "../../../navigation/navigation.service";
import { AccessControlService } from "../../../navigation/access-control.service";
import { HeaderTabConfig, HeaderTabKey, NavigationNode } from "../../../navigation/navigation.model";
import { NotificationStore } from "../../../services/notification/notification-store";
import { ThemeService } from "../../../services/theme/theme.service";
import { User } from "../../../services/user/user";
import { LandingPageService } from "../../../../Modules/landing/services/landing-page.service";
import { CommonModule } from "@angular/common";

const DEFAULT_TAB_LABELS: Record<HeaderTabKey, string> = {
  overview: "Overview",
  configuration: "Configuration",
  actions: "Actions",
  reports: "Reports",
  dlGeneration: "DL I Generation",
  insights: "Insights",
  references: "References",
};

@Component({
  selector: "app-header",
  standalone: true,
  imports: [RouterModule, MailNotiCenter, IconComponent, CommonModule, ButtonComponent],
  templateUrl: "./header.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./header.css",
})
export class Header implements OnInit {
  router = inject(Router);
  navigationService = inject(NavigationService);
  readonly authService = inject(Auth);
  private readonly access = inject(AccessControlService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly networkStatus = inject(NetworkStatusService);
  readonly notifications = inject(NotificationStore);
  readonly themeService = inject(ThemeService);
  private readonly userStore = inject(User);
  private readonly landingService = inject(LandingPageService);
  readonly currentUrl = signal(this.router.url);

  readonly currentUser = computed(() => {
    return this.userStore.userDetails() || this.landingService.user();
  });

  getUserDesignation(): string {
    const profile = this.currentUser()?.['profile'] as Record<string, unknown> | undefined;
    return (profile?.['designation'] as string) || (this.currentUser()?.['designation'] as string) || '--';
  }

  constructor() {
    effect(() => {
      this.access.roles();
      this.access.rbacActive();
      this.updateHeader(this.currentUrl());
      this.cdr.markForCheck();
    });
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  pageTitle = "";
  headerTabs: Partial<Record<HeaderTabKey, HeaderTabConfig>> = {};
  currentModuleId = "";
  currentModuleBaseRoute = "";
  private currentModuleHeaderKeys: string[] | null = null;

  @ViewChild("popupRef") popupRef!: ElementRef;
  @ViewChild("mailBtn") mailBtn?: ElementRef;
  @ViewChild("notificationBtn") notificationBtn!: ElementRef;
  @ViewChild("profileBtn") profileBtn!: ElementRef;
  @ViewChild("mobileToggleBtn") mobileToggleBtn?: ElementRef;
  @ViewChild("navContainer") navContainer?: ElementRef;

  popupType: "mail" | "notification" | "profile" = "mail";
  showMailPopup = false;
  /** Mail button hidden for now — flip back to true to restore it. */
  readonly showMailButton = false;
  /** Notification bell hidden for now — not wired up to working notifications
   *  in this patch. Flip back to true to restore it in a future patch. */
  readonly showNotificationButton = false;
  hoveredTab: string | null = null;
  /** Which dropdown child (by id) has its own nested submenu open — mirrors
   *  InventoryTabNav's openSubmenu, now on the shared header so a dropdown child
   *  can itself have children (e.g. Inventory's "References" tab) without
   *  flattening the menu. Click-toggled, not hover, same as InventoryTabNav. */
  openSubmenu: string | null = null;
  mobileMenuOpen = false;
  readonly HeaderTabKeys: HeaderTabKey[] = ["overview", "actions", "reports", "dlGeneration", "insights", "references", "configuration"];
  tabOrder: HeaderTabKey[] = this.HeaderTabKeys;

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
    this.hoveredTab = null;
    this.openSubmenu = null;
  }

  toggleMailPopup(event: MouseEvent, type: "mail" | "notification" | "profile"): void {
    event.stopPropagation();
    if (this.showMailPopup && this.popupType === type) {
      this.showMailPopup = false;
      return;
    }
    this.popupType = type;
    this.showMailPopup = true;
    if (type === "notification") {
      this.notifications.loadFeed();
    }
  }

  closeMailPopup(): void {
    this.showMailPopup = false;
  }

  onTabClick(tabKey: HeaderTabKey): void {
    const tab = this.headerTabs[tabKey];
    if (!tab) return;
    if (this.hasDropdownChildren(tabKey)) {
      this.openDropdown(tabKey);
      return;
    }
    if (tab.route) {
      const route = this.buildTabRoute(tab.route, tab.absoluteRoute);
      this.navigate(route);
    }
  }

  private buildTabRoute(tabRoute: string, absoluteRoute = false): string {
    const baseRoute = this.currentModuleBaseRoute || this.currentModuleId;
    if (absoluteRoute) {
      return this.navigationService.buildRoute(baseRoute, tabRoute);
    }

    const currentUrl = this.currentUrl().split('?')[0];
    const segments = currentUrl.split('/').filter(Boolean);
    const afterAuthIndex = segments.indexOf('afterAuth');

    if (afterAuthIndex === -1) {
      return this.navigationService.buildRoute(baseRoute, tabRoute);
    }

    const nextSegment = segments[afterAuthIndex + 2];

    if (this.currentModuleHeaderKeys) {
      if (nextSegment && this.currentModuleHeaderKeys.includes(nextSegment)) {
        return this.navigationService.buildRoute(baseRoute, `${nextSegment}/${tabRoute}`);
      }
      return this.navigationService.buildRoute(baseRoute, tabRoute);
    }

    if (this.currentModuleId === 'refit_dashboard') {
      return this.navigationService.buildRoute(baseRoute, tabRoute);
    }

    if (nextSegment && nextSegment !== 'overview' && nextSegment !== 'actions' &&
      nextSegment !== 'configuration' && nextSegment !== 'reports' && nextSegment !== 'insights') {
      return this.navigationService.buildRoute(baseRoute, `${nextSegment}/${tabRoute}`);
    }
    if (this.currentModuleId === 'ship-returns') {
      const activeChild = nextSegment && nextSegment !== 'overview' ? nextSegment : 'srar';
      if (tabRoute.startsWith(activeChild + '/')) {
        return this.navigationService.buildRoute(baseRoute, tabRoute);
      }
      return this.navigationService.buildRoute(baseRoute, `${activeChild}/${tabRoute}`);
    }


    return this.navigationService.buildRoute(baseRoute, tabRoute);
  }

  buildDropdownRoute(route: string, absoluteRoute = false): string {
    return this.buildTabRoute(route, absoluteRoute);
  }

  openDropdown(tabKey: string): void {
    this.hoveredTab = tabKey;
    this.openSubmenu = null;
  }

  closeDropdown(): void {
    this.hoveredTab = null;
    this.openSubmenu = null;
  }

  hasNestedChildren(child: NavigationNode): boolean {
    return !!child.children?.length;
  }

  hasAnyNestedChildren(tabKey: HeaderTabKey): boolean {
    return !!this.headerTabs[tabKey]?.children?.some((child) => child.children?.length);
  }

  /** Toggles a dropdown child's own nested submenu open/closed — click-based,
   *  same interaction InventoryTabNav's toggleSubmenu used. */
  toggleChildSubmenu(child: NavigationNode, event: Event): void {
    event.stopPropagation();
    this.openSubmenu = this.openSubmenu === child.id ? null : child.id;
  }

  navigate(route: string): void {
    this.closeMobileMenu();
    this.router.navigateByUrl(route);
  }

  /** For dropdown children that carry `externalHref` (e.g. a downloadable template)
   *  instead of an in-app `route` — opens directly rather than routing. */
  openExternalLink(href: string): void {
    this.closeMobileMenu();
    window.open(href, "_blank", "noopener");
  }

  tabRoute(tabKey: HeaderTabKey): string {
    const route = this.headerTabs[tabKey]?.route;
    if (!route) return "";
    return this.buildTabRoute(route, this.headerTabs[tabKey]?.absoluteRoute);
  }

  tabLabel(tabKey: HeaderTabKey): string {
    return this.headerTabs[tabKey]?.label ?? DEFAULT_TAB_LABELS[tabKey];
  }

  isActive(route: string): boolean {
    if (!route) return false;
    const urlWithoutQuery = this.currentUrl().split('?')[0];

    if (urlWithoutQuery === route || urlWithoutQuery.startsWith(route + "/")) {
      return true;
    }

    if (route.endsWith('/dashboard') && route.slice(0, -10) === urlWithoutQuery) {
      return true;
    }

    return false;
  }

  isTabActive(tabKey: HeaderTabKey): boolean {
    if (this.isActive(this.tabRoute(tabKey))) return true;
    const children = this.headerTabs[tabKey]?.children ?? [];
    return children.some((child) => this.isChildActive(child));
  }

  /** Recurses into a dropdown child's own children (e.g. Inventory's "As is
   *  Transaction" group) so the top-level tab still highlights correctly when
   *  the current page is a grandchild, not just a direct child. */
  private isChildActive(child: NavigationNode): boolean {
    if (child.route && this.isActive(this.buildTabRoute(child.route, child.absoluteRoute))) {
      return true;
    }
    return child.children?.some((grandchild) => this.isChildActive(grandchild)) ?? false;
  }

  hasDropdownChildren(tabKey: HeaderTabKey): boolean {
    return !!this.headerTabs[tabKey]?.children?.length;
  }

  @HostListener("document:click", ["$event"])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const clickedPopup = this.popupRef?.nativeElement?.contains(target);
    const clickedMailBtn = this.mailBtn?.nativeElement?.contains(target);
    const clickedNotificationBtn = this.notificationBtn?.nativeElement?.contains(target);
    const clickedProfileBtn = this.profileBtn?.nativeElement?.contains(target);

    if (!clickedPopup && !clickedMailBtn && !clickedNotificationBtn && !clickedProfileBtn) {
      this.showMailPopup = false;
    }

    if (this.mobileMenuOpen) {
      const clickedToggle = this.mobileToggleBtn?.nativeElement?.contains(target);
      const clickedNav = this.navContainer?.nativeElement?.contains(target);
      if (!clickedToggle && !clickedNav) {
        this.closeMobileMenu();
      }
    }
  }

  ngOnInit(): void {
    this.updateHeader(this.router.url);
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.currentUrl.set(event.urlAfterRedirects);
        this.updateHeader(event.urlAfterRedirects);
        this.cdr.markForCheck();
      });
  }

  private updateHeader(url: string = this.currentUrl()): void {
    const module = this.navigationService.getCurrentModule(url);
    if (!module) {
      this.pageTitle = "";
      this.currentModuleId = "";
      this.currentModuleBaseRoute = "";
      this.currentModuleHeaderKeys = null;
      this.headerTabs = {};
      this.tabOrder = this.HeaderTabKeys;
      return;
    }

    this.currentModuleId = module.id;
    this.currentModuleBaseRoute = module.baseRoute;
    this.currentModuleHeaderKeys = module.headers
      ? module.headerNestedKeys ?? Object.keys(module.headers)
      : null;
    const activeHeaderKey = this.navigationService.getActiveHeaderKey(module, url);
    this.tabOrder =
      (activeHeaderKey ? module.headerTabOrders?.[activeHeaderKey] : undefined) ??
      module.headerTabOrder ??
      this.HeaderTabKeys;
    this.pageTitle = module.title;
    if (this.currentModuleId === 'ship-returns' || this.currentModuleId === 'refit_dashboard') {
      this.headerTabs = this.navigationService.getAccessibleHeader(module, url);
      return
    }
    this.headerTabs = this.navigationService.getAccessibleHeader(module, this.router.url);

  }

  logout(): void {
    this.authService.logout();
  }
}
