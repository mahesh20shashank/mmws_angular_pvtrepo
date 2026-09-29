import { Component, OnDestroy, OnInit, inject, signal, ChangeDetectionStrategy } from "@angular/core";

import { ActivatedRoute, NavigationSkipped, Router } from "@angular/router";
import { Subscription, filter } from "rxjs";
import { SfdOverviewComponent } from "./overview/sfd-overview.component";
import { SfdConfigComponent } from "./config/sfd-config.component";
import { SfdManagementComponent } from "./management/sfd-management.component";
import { SfdReportsComponent } from "./reports/sfd-reports.component";
import { SfdInsightsComponent } from "./insights/sfd-insights.component";
import { SfdReferencesComponent } from "./sfd-references/sfd-references.component";
import { SfdActionsService } from "./services/management-services/sfd-actions.service";

export type SfdTab =
  | "overview"
  | "config"
  | "actions"
  | "reports"
  | "insights"
  | "sfd-references";

/** Header tab route segment (:tab) → internal screen id. */
const TAB_ROUTE_MAP: Record<string, SfdTab> = {
  overview: "overview",
  configuration: "config",
  actions: "actions",
  reports: "reports",
  insights: "insights",
  "sfd-references": "sfd-references",
};

/**
 * Host shell for the SFD (Ship Fit Definition) module. The active screen is
 * driven by the `:tab` route segment, which is navigated to by the existing
 * app Header tabs (navigation.config: dashboard/overview|configuration|…).
 * No local tab strip and no Header/Sidebar changes.
 */
@Component({
  selector: "app-sfd-shell",
  standalone: true,
  imports: [
    SfdOverviewComponent,
    SfdConfigComponent,
    SfdManagementComponent,
    SfdReportsComponent,
    SfdInsightsComponent,
    SfdReferencesComponent
],
  templateUrl: "./sfd-shell.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./sfd-shell.component.css"],
})
export class SfdShellComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sfdActions = inject(SfdActionsService);
  private sub?: Subscription;
  private navSkipSub?: Subscription;

  readonly activeTab = signal<SfdTab>("overview");

  ngOnInit(): void {
    this.sub = this.route.paramMap.subscribe((params) => {
      const tab = params.get("tab") ?? "overview";
      this.activeTab.set(TAB_ROUTE_MAP[tab] ?? "overview");
    });

    // Clicking the "Actions" header tab while ALREADY on it (mid Add-form, deep in Approval
    // Tracking, ...) must jump back to the Actions main screen — explicit product direction. The
    // target URL never actually changes for this (Actions' own sub-views are pure client state on
    // SfdManagementComponent, never reflected in the route/query string), so the router's default
    // onSameUrlNavigation: "ignore" swallows that click as a no-op navigation — no paramMap
    // re-emission above, no recreation, nothing this shell would otherwise ever notice.
    // NavigationSkipped fires specifically for that ignored case; SfdActionsService.lastMgmtView
    // is the shared signal SfdManagementComponent's own reverse-sync effect actually applies the
    // reset through (this shell has no direct reference to that component to call into instead).
    this.navSkipSub = this.router.events
      .pipe(filter((e): e is NavigationSkipped => e instanceof NavigationSkipped))
      .subscribe(() => {
        if (this.activeTab() === "actions") {
          this.sfdActions.requestActionsReset();
        }
      });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.navSkipSub?.unsubscribe();
  }
}
