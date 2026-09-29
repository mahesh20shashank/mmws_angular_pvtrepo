import { ChangeDetectionStrategy, Component, Input } from "@angular/core";

import { DonutChart, DonutSegment } from "../donut-chart/donut-chart";
import { LineChart, LineSeries } from "../line-chart/line-chart";
import { BarChart, BarDatum } from "../bar-chart/bar-chart";
import { GaugeChart } from "../gauge-chart/gauge-chart";

/** Every visualisation kind the reusable `app-chart` facade can render. */
export type ChartKind = "donut" | "line" | "bar" | "hbar" | "gauge" | "stat";

/** A single bar in a `bar` (vertical) or `hbar` (horizontal) chart. */
export interface ChartBar {
  label: string;
  value: number;
  /** Per-bar colour; falls back to the accent blue when omitted. */
  color?: string;
}

/**
 * One flexible payload covering every chart kind — only the fields relevant to the
 * chosen `type` are read, so a caller passes just what that kind needs.
 */
export interface ChartData {
  /** donut — the ring segments (centre value is their sum). */
  segments?: DonutSegment[];
  /** donut — centre caption under the total (default "Total"). */
  centerLabel?: string;
  /** line — one or more series. */
  series?: LineSeries[];
  /** line — x-axis labels. */
  labels?: string[];
  /** bar / hbar — the bars. */
  bars?: ChartBar[];
  /** gauge — 0–100 percentage; stat — the headline number. */
  value?: number;
  /** gauge — caption inside the ring; stat — unit shown beside the number. */
  unit?: string;
  /** gauge — arc colour; stat — value colour. */
  color?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
}

const ACCENT = "#4AA8FF";

/**
 * Reusable chart facade — pass a `type` and a `data` payload and it renders the
 * matching visualisation. Line/donut delegate to the existing `app-line-chart` /
 * `app-donut-chart`; bar, horizontal-bar, gauge and stat are drawn inline so a
 * single component covers every dashboard chart shape.
 *
 * ```html
 * <app-chart type="donut" [data]="{ segments: severity }" />
 * <app-chart type="hbar"  [data]="{ bars: repeatDefects }" />
 * <app-chart type="gauge" [data]="{ value: 82, unit: 'Exposure', color: '#22C55E' }" />
 * ```
 */
@Component({
  selector: "app-chart",
  standalone: true,
  imports: [DonutChart, LineChart, BarChart, GaugeChart],
  templateUrl: "./chart.html",
  styleUrls: ["./chart.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Chart {
  @Input() type: ChartKind = "bar";
  @Input() data: ChartData = {};

  // --- Donut ----------------------------------------------------------------
  get segments(): DonutSegment[] {
    return this.data.segments ?? [];
  }

  get donutTotal(): string {
    return String(this.segments.reduce((sum, s) => sum + s.value, 0));
  }

  // --- Line -----------------------------------------------------------------
  get series(): LineSeries[] {
    return this.data.series ?? [];
  }

  // --- Bar / horizontal bar -------------------------------------------------
  get bars(): ChartBar[] {
    return this.data.bars ?? [];
  }

  /** Map the facade's `ChartBar[]` to the shared bar-chart's `BarDatum[]`. */
  get barData(): BarDatum[] {
    return this.bars.map((b) => ({ label: b.label, value: b.value, color: b.color || ACCENT }));
  }

  /** Height for the horizontal-bar tile — scales with the number of bars. */
  get hbarHeightPx(): number {
    return Math.max(90, this.bars.length * 34 + 24);
  }

  // --- Gauge ----------------------------------------------------------------
  get gaugeValue(): number {
    return Math.max(0, Math.min(100, this.data.value ?? 0));
  }
}
