import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { Router } from "@angular/router";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { MailNotiCenter } from "../../../../Core/layout/components/mail-noti-center/mail-noti-center";
import { Auth } from "../../../../Core/auth/services/auth.service";
import { NetworkStatusService } from "../../../../Core/http/services/network-status.service";
import { NotificationStore } from "../../../../Core/services/notification/notification-store";
import { ThemeService } from "../../../../Core/services/theme/theme.service";
import { InventoryTabItem } from "../models/inventory-nav.model";

/**
 * Config-driven top nav shared by every Shore/Ship Inventory sub-module
 * (OBS, MO, WED, ...). Owns the same icon cluster the global app header
 * shows (online status, theme, notifications, mail, logout) so swapping
 * this in for `<app-header>` (see MainLayout) doesn't lose any of that
 * functionality — only the module-specific tabs differ, passed in via `tabs`.
 */
@Component({
  selector: "app-inventory-tab-nav",
  standalone: true,
  imports: [IconComponent, MailNotiCenter, NgTemplateOutlet, ButtonComponent],
  templateUrl: "./inventory-tab-nav.html",
  styleUrl: "./inventory-tab-nav.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryTabNav {
  private readonly router = inject(Router);
  readonly networkStatus = inject(NetworkStatusService);
  readonly themeService = inject(ThemeService);
  readonly notifications = inject(NotificationStore);
  private readonly auth = inject(Auth);

  readonly tabs = input.required<InventoryTabItem[]>();
  readonly title = input<string>();

  private readonly currentUrl = signal(this.router.url);
  readonly openTab = signal<string | null>(null);
  readonly openSubmenu = signal<string | null>(null);

  readonly activeUrl = computed(() => this.currentUrl());

  popupType: "mail" | "notification" = "mail";
  showPopup = signal(false);

  constructor() {
    this.router.events.subscribe(() => {
      this.currentUrl.set(this.router.url);
      this.openTab.set(null);
      this.openSubmenu.set(null);
    });
  }

  isActive(item: InventoryTabItem): boolean {
    if (item.route) return this.activeUrl().startsWith(item.route);
    return !!item.children?.some((child) => this.isActive(child));
  }

  toggleTab(item: InventoryTabItem, event: Event): void {
    event.stopPropagation();
    if (!item.children) {
      this.openTab.set(null);
      if (item.route) this.router.navigateByUrl(item.route);
      return;
    }
    this.openTab.set(this.openTab() === item.label ? null : item.label);
    this.openSubmenu.set(null);
  }

  toggleSubmenu(item: InventoryTabItem, event: Event): void {
    event.stopPropagation();
    this.openSubmenu.set(this.openSubmenu() === item.label ? null : item.label);
  }

  selectChild(item: InventoryTabItem, event: Event): void {
    event.stopPropagation();
    if (item.children) return;
    this.openTab.set(null);
    this.openSubmenu.set(null);
    if (item.route) this.router.navigateByUrl(item.route);
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  togglePopup(event: MouseEvent, type: "mail" | "notification"): void {
    event.stopPropagation();
    if (this.showPopup() && this.popupType === type) {
      this.showPopup.set(false);
      return;
    }
    this.popupType = type;
    this.showPopup.set(true);
    if (type === "notification") {
      this.notifications.loadFeed();
    }
  }

  closePopup(): void {
    this.showPopup.set(false);
  }

  logout(): void {
    void this.auth.logout();
  }

  @HostListener("document:click")
  onDocumentClick(): void {
    this.openTab.set(null);
    this.openSubmenu.set(null);
    this.showPopup.set(false);
  }
}
