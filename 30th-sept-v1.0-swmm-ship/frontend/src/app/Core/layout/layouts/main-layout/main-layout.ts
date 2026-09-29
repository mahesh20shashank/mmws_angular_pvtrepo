import { Component, ElementRef, ViewChild, OnInit, AfterViewInit, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';

import {
  Router,
  RouterOutlet,
  NavigationEnd
} from '@angular/router';

import { filter } from 'rxjs/operators';

import { Sidebar } from '../../components/sidebar/sidebar';
import { Header } from '../../components/header/header';
import { Breadcrum } from '../../components/breadcrumb/breadcrum';
import { Footer } from '../../components/footer/footer';
import { ThemeService } from '../../../services/theme/theme.service';
import { InventoryTabNav } from '../../../../Modules/inventory/shared/inventory-tab-nav/inventory-tab-nav';
import { InventoryTabItem } from '../../../../Modules/inventory/shared/models/inventory-nav.model';

// Every module that owns its own top nav (in place of the shared app header)
// registers its base route + tab config here. Ship Crew used to be here too —
// moved onto the shared app-header's config (navigation.config.ts's
// createShipCrewHeader) so it renders the same header as every other module.
// All three Inventory sub-modules (OBS, MO, WED) made the same move — this list
// is empty for now but kept, along with `<app-inventory-tab-nav>` in
// main-layout.html and its import below, as the opt-out mechanism a future
// sub-module can register into if its nav doesn't fit the shared header.
const INVENTORY_MODULE_TABS: { base: string; tabs: InventoryTabItem[]; title?: string }[] = [];

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    Header,
    InventoryTabNav,
    Breadcrum,
    RouterOutlet,
    Footer,
    Sidebar
  ],
  templateUrl: './main-layout.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './main-layout.css'
})
export class MainLayout implements OnInit, AfterViewInit {
  readonly router = inject(Router);

  readonly themeService = inject(ThemeService);

  sidebarCollapsed = false;

  // A handful of inventory sub-modules own their own top nav (with the same
  // online/theme/notification/mail/logout cluster) in place of the shared
  // app header — this resolves which config (if any) applies to the URL.
  readonly currentUrl = signal(this.router.url);
  readonly activeInventoryTabs = computed<InventoryTabItem[] | null>(() => {
    const url = this.currentUrl();
    return INVENTORY_MODULE_TABS.find((module) => url.startsWith(module.base))?.tabs ?? null;
  });
  readonly activeInventoryTitle = computed<string | undefined>(() => {
    const url = this.currentUrl();
    return INVENTORY_MODULE_TABS.find((module) => url.startsWith(module.base))?.title;
  });

  @ViewChild('contentArea')
  contentArea!: ElementRef<HTMLElement>;

  ngOnInit(): void {
    // Restore theme preference from localStorage
    this.themeService.initTheme();
  }

  ngAfterViewInit(): void {
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd)
      )
      .subscribe((event: NavigationEnd) => {
        this.currentUrl.set(event.urlAfterRedirects || event.url);

        setTimeout(() => {
          if (this.contentArea?.nativeElement) {
            this.contentArea.nativeElement.scrollTo({
              top: 0,
              left: 0,
              behavior: 'auto'
            });
          }
        }, 0);

      });
  }
}
