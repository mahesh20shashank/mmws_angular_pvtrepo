import { Component, ChangeDetectionStrategy } from "@angular/core";

import {
  DonutChart,
  DonutSegment,
  PageHeaderBar,
} from "../../../../shared/components";
import { LineChart, LineSeries } from "../../../../shared/components/line-chart/line-chart";
import { BarChart, BarDatum } from "../../../../shared/components/bar-chart/bar-chart";
import { GaugeChart } from "../../../../shared/components/gauge-chart/gauge-chart";

type InsightChart =
  | "stat"
  | "bars"
  | "donut"
  | "hbars"
  | "addRemove"
  | "line"
  | "gauge";

interface Insight {
  n: number;
  title: string;
  chart: InsightChart;
  purpose: string;
  formula: string;
  threshold: string;
  action: string;
  // variant payloads
  value?: string;
  statColor?: string;
  bars?: { pct: number; color: string }[];
  segments?: DonutSegment[];
  legend?: { label: string; value: string; color: string }[];
  hbars?: { label: string; pct: number; value: string; color: string }[];
  added?: string;
  removed?: string;
  labels?: string[];
  lineData?: number[];
  gaugePct?: number;
  gaugeColor?: string;
}

/**
 * SFD Insights screen — a responsive grid of metric cards, each with a mini
 * visual (stat / bars / donut / horizontal bars / add-remove / line / gauge)
 * and Formula / Threshold / Action rows. The donut reuses app-donut-chart and
 * the line reuses app-line-chart (both ECharts); the rest are lightweight
 * inline visuals.
 */
@Component({
  selector: "app-sfd-insights",
  standalone: true,
  imports: [DonutChart, LineChart, BarChart, GaugeChart, PageHeaderBar],
  templateUrl: "./sfd-insights.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./sfd-insights.component.css"],
})
export class SfdInsightsComponent {
  readonly insights: Insight[] = [
    {
      n: 1,
      title: "Total SFD Records",
      chart: "stat",
      value: "1,284",
      statColor: "#4AA8FF",
      purpose: "Overall count of equipment and systems currently fitted onboard.",
      formula: "COUNT(active SFD records)",
      threshold: "No hard limit — trend watched",
      action: "Reconcile against baseline quarterly",
    },
    {
      n: 2,
      title: "Fits by Department",
      chart: "bars",
      bars: [
        { pct: 90, color: "#4AA8FF" },
        { pct: 76, color: "#22C55E" },
        { pct: 58, color: "#F59E0B" },
        { pct: 47, color: "#A855F7" },
        { pct: 40, color: "#F82C36" },
        { pct: 33, color: "#14B8A6" },
        { pct: 20, color: "#EC4899" },
      ],
      purpose: "Distribution of fitted equipment across departments.",
      formula: "COUNT(records) GROUP BY department",
      threshold: "Flag departments > 40% of total",
      action: "Rebalance maintenance load if skewed",
    },
    {
      n: 3,
      title: "Transactions by Category",
      chart: "donut",
      segments: [
        { label: "New Fit", value: 42, color: "#4AA8FF" },
        { label: "Modification", value: 28, color: "#22C55E" },
        { label: "Removal", value: 18, color: "#F82C36" },
        { label: "Reassignment", value: 12, color: "#F59E0B" },
      ],
      legend: [
        { label: "New Fit", value: "42", color: "#4AA8FF" },
        { label: "Modification", value: "28", color: "#22C55E" },
        { label: "Removal", value: "18", color: "#F82C36" },
        { label: "Reassignment", value: "12", color: "#F59E0B" },
      ],
      purpose: "Split of SFD transactions by category this quarter.",
      formula: "COUNT(txn) GROUP BY category",
      threshold: "Removals > 25% needs review",
      action: "Investigate high removal categories",
    },
    {
      n: 4,
      title: "Approval Turnaround",
      chart: "hbars",
      hbars: [
        { label: "< 3 days", pct: 62, value: "62%", color: "#22C55E" },
        { label: "3–7 days", pct: 24, value: "24%", color: "#F59E0B" },
        { label: "> 7 days", pct: 14, value: "14%", color: "#F82C36" },
      ],
      purpose: "How quickly INSMA approvals are cleared.",
      formula: "AVG(approved_at − submitted_at)",
      threshold: "> 7 days should stay under 15%",
      action: "Escalate ageing approval requests",
    },
    {
      n: 5,
      title: "Added vs Removed",
      chart: "addRemove",
      added: "54",
      removed: "18",
      purpose: "Net change in fitted equipment this quarter.",
      formula: "COUNT(added) − COUNT(removed)",
      threshold: "Net negative trend to be reviewed",
      action: "Confirm removals are authorised",
    },
    {
      n: 6,
      title: "Installation Trend",
      chart: "line",
      labels: ["Mar", "Apr", "May", "Jun", "Jul", "Aug"],
      lineData: [30, 52, 44, 61, 55, 72],
      purpose: "Trend of new installations over recent months.",
      formula: "COUNT(new fits) per month",
      threshold: "Sudden spikes to be validated",
      action: "Align with refit / upgrade schedule",
    },
    {
      n: 7,
      title: "Pending Approvals",
      chart: "gauge",
      value: "23",
      gaugePct: 62,
      gaugeColor: "#F59E0B",
      purpose: "Share of requests awaiting INSMA decision.",
      formula: "COUNT(status = pending)",
      threshold: "Keep pending queue below 20",
      action: "Clear backlog before next audit",
    },
    {
      n: 8,
      title: "Data Completeness",
      chart: "gauge",
      value: "94%",
      gaugePct: 94,
      gaugeColor: "#22C55E",
      purpose: "Records with all mandatory fields populated.",
      formula: "complete records ÷ total × 100",
      threshold: "Target ≥ 95% completeness",
      action: "Chase records missing mandatory data",
    },
  ];

  donutTotal(segs: DonutSegment[] = []): string {
    return segs.reduce((a, b) => a + b.value, 0).toString();
  }

  /** Wrap a bare number series into the app-line-chart `LineSeries` shape. */
  lineSeries(values: number[] = []): LineSeries[] {
    return [{ label: "Trend", color: "#4AA8FF", values, area: true }];
  }

  /** Map the tile's percentage bars to the shared bar-chart shape. */
  barsData(bars: { pct: number; color: string }[] = []): BarDatum[] {
    return bars.map((b) => ({ label: "", value: b.pct, color: b.color }));
  }

  hbarsData(hbars: { label: string; pct: number; color: string }[] = []): BarDatum[] {
    return hbars.map((h) => ({ label: h.label, value: h.pct, color: h.color }));
  }

  addRemoveData(added = "0", removed = "0"): BarDatum[] {
    return [
      { label: "Added", value: Number(added) || 0, color: "#22C55E" },
      { label: "Removed", value: Number(removed) || 0, color: "#F82C36" },
    ];
  }
}
