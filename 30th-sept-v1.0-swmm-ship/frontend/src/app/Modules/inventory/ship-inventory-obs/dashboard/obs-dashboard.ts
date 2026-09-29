import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { Router } from "@angular/router";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { KpiCard } from "../../../../shared/components/kpi-card/kpi-card";
import { BarChart, BarDatum } from "../../../../shared/components/bar-chart/bar-chart";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { ObsApiService } from "../services/obs-api.service";
import { IssuedReturnedTrend, ObsDashboardCounts } from "../models/issue.model";

interface DashboardTile {
  label: string;
  count: number;
  icon: string;
  iconColor: string;
  iconBg: string;
  viewMoreRoute: string;
}

const HELP_HTML = `
  <h6 class="fw-bold mb-1">What this page is for</h6>
  <p class="mb-2">The home dashboard of your ship's spare-parts store. It shows live counts so you can see the store's status at a glance.</p>
  <h6 class="fw-bold mb-1">What each card means</h6>
  <ul class="mb-2">
    <li><strong>Spares Issued (Return Pending)</strong> — spares given to maintainers that haven't been returned yet.</li>
    <li><strong>Spares Surveyed</strong> — spares sent for survey (to be landed to shore).</li>
    <li><strong>Spares Demanded</strong> — spares for which a demand has been raised.</li>
    <li><strong>Spares Received</strong> — spares received back on board.</li>
    <li><strong>Spares &lt; 50%</strong> — items whose stock has dropped below half; plan to top these up.</li>
    <li><strong>D787J Deficiency</strong> — items short against the ship's authorised scale (D787J).</li>
  </ul>
  <p class="mb-0"><strong>Tip:</strong> Click any card to open its full list.</p>
`;

@Component({
  selector: "app-obs-dashboard",
  standalone: true,
  imports: [IconComponent, KpiCard, BarChart, HelpGuidance],
  templateUrl: "./obs-dashboard.html",
  styleUrl: "./obs-dashboard.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObsDashboard implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly router = inject(Router);

  readonly helpHtml = HELP_HTML;
  readonly tiles = signal<DashboardTile[]>([]);
  readonly issuedFilter = signal<"defect" | "tyLoan">("defect");
  readonly returnedFilter = signal<"defect" | "tyLoan">("defect");
  private trend: IssuedReturnedTrend | null = null;

  readonly issuedData = signal<BarDatum[]>([]);
  readonly returnedData = signal<BarDatum[]>([]);

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const [counts, trend] = await Promise.all([
      firstValueFrom(this.api.getDashboardCounts()),
      firstValueFrom(this.api.getIssuedReturnedTrend()),
    ]);
    this.trend = trend;
    this.tiles.set(this.buildTiles(counts));
    this.updateChartData();
  }

  private buildTiles(counts: ObsDashboardCounts): DashboardTile[] {
    return [
      {
        label: "Spares Issued to Maintainers",
        count: counts.sparesIssuedToMaintainers,
        icon: "chart-column",
        iconColor: "#fa5a7d",
        iconBg: "rgba(250,90,125,0.12)",
        viewMoreRoute: "spares-issued-to-maintainers",
      },
      {
        label: "Spares Issued on Ty Loan",
        count: counts.sparesIssuedOnTyLoan,
        icon: "repeat",
        iconColor: "#0095ff",
        iconBg: "rgba(0,149,255,0.12)",
        viewMoreRoute: "spares-issued-on-tyloan",
      },
      {
        label: "Spares Returned",
        count: counts.sparesReturned,
        icon: "rotate-ccw",
        iconColor: "#bf83ff",
        iconBg: "rgba(191,131,255,0.12)",
        viewMoreRoute: "spares-returned",
      },
      {
        label: "Spares < 50% in Inventory",
        count: counts.sparesLessThan50Percent,
        icon: "circle-alert",
        iconColor: "#1cc88a",
        iconBg: "rgba(28,200,138,0.12)",
        viewMoreRoute: "spares-less-than-50",
      },
      {
        label: "D787J Deficiency",
        count: counts.d787jDeficiency,
        icon: "clipboard-list",
        iconColor: "#3fbaf3",
        iconBg: "rgba(63,186,243,0.12)",
        viewMoreRoute: "d787j-deficiency",
      },
      {
        label: "Critical Spare List",
        count: counts.criticalSpareList,
        icon: "shield-alert",
        iconColor: "#ff9f43",
        iconBg: "rgba(255,159,67,0.12)",
        viewMoreRoute: "critical-spare-list",
      },
    ];
  }

  onIssuedFilterChange(value: string): void {
    this.issuedFilter.set(value === "tyLoan" ? "tyLoan" : "defect");
    this.updateChartData();
  }

  onReturnedFilterChange(value: string): void {
    this.returnedFilter.set(value === "tyLoan" ? "tyLoan" : "defect");
    this.updateChartData();
  }

  private updateChartData(): void {
    if (!this.trend) return;
    const months = this.trend.months;
    const issuedSeries = this.trend[this.issuedFilter()];
    const returnedSeries = this.trend[this.returnedFilter()];
    this.issuedData.set(months.map((label, i) => ({ label, value: issuedSeries.issued[i], primary: true })));
    this.returnedData.set(months.map((label, i) => ({ label, value: returnedSeries.returned[i], primary: true })));
  }

  viewMore(route: string): void {
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs", route]);
  }
}
