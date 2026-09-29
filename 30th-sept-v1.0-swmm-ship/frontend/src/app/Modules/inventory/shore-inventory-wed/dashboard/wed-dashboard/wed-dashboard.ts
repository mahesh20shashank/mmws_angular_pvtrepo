import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { IconComponent } from "../../../../../shared/components/icon/icon.component";
import { KpiCard } from "../../../../../shared/components/kpi-card/kpi-card";
import { LineChart, LineSeries } from "../../../../../shared/components/line-chart/line-chart";
import { BarChart, BarDatum } from "../../../../../shared/components/bar-chart/bar-chart";
import { HelpGuidance } from "../../../../../shared/components/help-guidance/help-guidance";
import { WedApiService } from "../../services/wed-api.service";
import { WedDashboardCounts } from "../../models/wed.model";

interface WedDashboardTile {
  label: string;
  count: number;
  icon: string;
  iconColor: string;
  iconBg: string;
  viewMoreRoute: string;
}

const WED_BASE = "/afterAuth/inventory/shore-inventory-wed";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

@Component({
  selector: "app-wed-dashboard",
  standalone: true,
  imports: [IconComponent, KpiCard, LineChart, BarChart, HelpGuidance],
  templateUrl: "./wed-dashboard.html",
  styleUrl: "./wed-dashboard.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WedDashboard implements OnInit {
  private readonly api = inject(WedApiService);
  private readonly router = inject(Router);

  readonly tiles = signal<WedDashboardTile[]>([]);
  readonly demandReceiptSeries = signal<LineSeries[]>([]);
  readonly ptsData = signal<BarDatum[]>([]);
  readonly months = MONTHS;

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const counts = await firstValueFrom(this.api.getDashboardCounts());
    this.tiles.set(this.buildTiles(counts));

    this.demandReceiptSeries.set([
      { label: "Demand", color: "#007bff", values: [5, 7, 6, 8, 9, 6, 7, 5, 8, 9, 10, 11] },
      { label: "Receipt", color: "#28a745", values: [4, 6, 5, 7, 8, 5, 6, 4, 7, 8, 9, 10] },
    ]);
    this.ptsData.set(MONTHS.map((label, i) => ({ label, value: [10, 12, 9, 14, 16, 11, 13, 10, 15, 17, 18, 20][i] })));
  }

  private buildTiles(counts: WedDashboardCounts): WedDashboardTile[] {
    return [
      {
        label: "Survey In Progress",
        count: counts.surveyInProgress,
        icon: "chart-pie",
        iconColor: "#fa5a7d",
        iconBg: "rgba(250,90,125,0.12)",
        viewMoreRoute: "transactions/survey",
      },
      {
        label: "Demand in Progress",
        count: counts.demandInProgress,
        icon: "wrench",
        iconColor: "#0095ff",
        iconBg: "rgba(0,149,255,0.12)",
        viewMoreRoute: "transactions/demand",
      },
      {
        label: "PTS Demand in Progress",
        count: counts.ptsDemandInProgress,
        icon: "globe",
        iconColor: "#bf83ff",
        iconBg: "rgba(191,131,255,0.12)",
        viewMoreRoute: "transactions/pts",
      },
      {
        label: "Outstanding Demands",
        count: counts.outstandingDemands,
        icon: "clock",
        iconColor: "#1cc88a",
        iconBg: "rgba(28,200,138,0.12)",
        viewMoreRoute: "transactions/receive",
      },
      {
        label: "IIF In progress",
        count: counts.iifInProgress,
        icon: "clock",
        iconColor: "#3fbaf3",
        iconBg: "rgba(63,186,243,0.12)",
        viewMoreRoute: "transactions/iif",
      },
      {
        label: "PTS/ RIO Demands - Survey Pending",
        count: counts.ptsRioSurveyPending,
        icon: "clock",
        iconColor: "#ff9f43",
        iconBg: "rgba(255,159,67,0.12)",
        viewMoreRoute: "transactions/pts-rio-pending",
      },
    ];
  }

  viewMore(route: string): void {
    this.router.navigate([WED_BASE, ...route.split("/")]);
  }
}
