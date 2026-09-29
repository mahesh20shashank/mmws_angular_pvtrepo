import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { KpiPanelService } from '../../../services/kpi/kpi-panel.service';
import { NavigationService } from '../../../navigation/navigation.service';
import { ModalComponent } from '../../../../shared/components';
import { SendNotificationModal } from '../send-notification-modal/send-notification-modal';
import { LandingPageService } from '../../../../Modules/landing/services/landing-page.service';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

interface BreadcrumbItem {
  label: string;
  url: string;
  isLast: boolean;
}

@Component({
  selector: 'app-breadcrum',
  standalone: true,
  imports: [CommonModule, RouterModule, ModalComponent, SendNotificationModal, IconComponent, ButtonComponent],
  templateUrl: './breadcrum.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './breadcrum.css'
})
export class Breadcrum implements OnInit {
  readonly router = inject(Router);
  readonly landingService = inject(LandingPageService);

  kpiPanel = inject(KpiPanelService);
  readonly navigationService = inject(NavigationService);

  readonly isStaff = computed(() => {
    const user = this.landingService.user();
    return user ? !!user['is_admin'] : false;
  });
  showSendModal = false;


  // Signal so the OnPush view re-renders when the route changes
  readonly breadcrumbs = signal<BreadcrumbItem[]>([]);

  ngOnInit(): void {
    this.build();
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.build());
  }
  private build(): void {
    // Strip query params / fragment, then the 'afterAuth' prefix
    // e.g. '/afterAuth/refit/dl-monitoring?tab=x' → ['refit', 'dl-monitoring']
    const path = this.router.url.split('?')[0].split('#')[0];
    const allSegments = path.split('/').filter(Boolean);
    const segments = allSegments[0] === 'afterAuth' ? allSegments.slice(1) : allSegments;

    // Stop at 'dynamic-form' segment, don't include it or anything after
    const dynamicFormIndex = segments.indexOf('dynamic-form');
    const filteredSegments = dynamicFormIndex !== -1 ? segments.slice(0, dynamicFormIndex) : segments;

    const module = this.navigationService.getModuleByBaseRoute(filteredSegments[0]);

    const crumbs: BreadcrumbItem[] = [];
    let builtUrl = '/afterAuth';

    filteredSegments.forEach((seg, i) => {
      builtUrl += '/' + seg;
      let label: string;
      if (i === 0) {
        label = module?.title ?? this.formatRaw(seg);
      } else if (module) {
        const relativePath = filteredSegments.slice(1, i + 1).join('/');
        label = this.navigationService.resolveLabel(module, relativePath, path) ?? this.formatRaw(seg);
      } else {
        label = this.formatRaw(seg);
      }

      // Collapse consecutive segments that resolve to the same label (e.g. an
      // intermediate route segment and its full route both naming one screen)
      // into a single crumb, keeping the deepest URL as its target.
      const previous = crumbs.at(-1);
      if (previous && previous.label === label) {
        previous.url = builtUrl;
      } else {
        crumbs.push({ label, url: builtUrl, isLast: false });
      }
    });

    if (crumbs.length > 0) crumbs.at(-1)!.isLast = true;
    this.breadcrumbs.set(crumbs);
  }

  // KPI / action button visibility.
  // Shown on any page that hosts <app-customize-kpi> (it registers with the
  // shared KpiPanelService), so no per-URL list to keep in sync.
  get showKpiButton(): boolean {
    return this.kpiPanel.hasHost();
  }

  get showSendButton(): boolean {
    const url = this.router.url;
    return url.includes('/afterAuth/inbox') || url.includes('/afterAuth/outbox');
  }

  openSendModal(): void {
    this.showSendModal = true;
  }

  closeSendModal(): void {
    this.showSendModal = false;
  }

  navigate(url: string, isLast: boolean): void {
    if (!isLast) this.router.navigateByUrl(url);
  }

  private formatRaw(seg: string): string {
    return seg.replaceAll('-', ' ').replaceAll(/\b\w/g, c => c.toUpperCase());
  }

  /** Click-driven open/close. Positions the panel under the button, right
   *  aligned to the panel width, then clamps it inside the viewport so it
   *  never overflows off-screen on narrow windows. */
  toggleKpi(button: HTMLElement) {
    const rect = button.getBoundingClientRect();
    const panelWidth = Math.min(420, window.innerWidth - 24);
    const panelHeightEstimate = 480;
    const margin = 12;

    const left = Math.min(
      Math.max(margin, rect.right - panelWidth),
      window.innerWidth - panelWidth - margin,
    );
    const top = Math.min(
      rect.bottom + 8,
      window.innerHeight - panelHeightEstimate - margin,
    );

    this.kpiPanel.setPosition({ top: Math.max(margin, top), left });

    this.kpiPanel.toggle();
  }
}
