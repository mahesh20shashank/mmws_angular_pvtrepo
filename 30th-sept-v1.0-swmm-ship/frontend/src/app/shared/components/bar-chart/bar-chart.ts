import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, inject } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts/core';
import { ThemeService } from '../../../Core/services/theme/theme.service';

export interface BarDatum {
  label: string;
  value: number;
  /** Highlighted (accent-coloured) bar. */
  primary?: boolean;
  /** Explicit per-bar colour; overrides the primary/muted colour when set. */
  color?: string;
  /** Opaque id carried through to (barClick) — not read by the chart itself. */
  id?: string | number;
}

export interface StackedBarSeries {
  name: string;
  color?: string;
  data: number[];
}

// Dark-theme (default) chart text colours — light blue-gray, readable on the app's dark backgrounds.
const AXIS_LABEL_DARK = '#93a8bd';
const AXIS_NAME_DARK = '#9db6cc';
const MUTED_VALUE_DARK = '#9db6cc';
// Light-theme overrides — same hues, darkened so they stay legible on a white background.
const AXIS_LABEL_LIGHT = '#475569';
const AXIS_NAME_LIGHT = '#334155';
const MUTED_VALUE_LIGHT = '#334155';
const GRID_LINE = 'rgba(127,150,178,0.22)';

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--bg-dropdown)',
  borderColor: 'var(--border-primary)',
  borderWidth: 1,
  padding: 10,
  extraCssText: 'box-shadow: none; border-radius: 8px;',
  textStyle: { color: 'var(--text-primary)', fontSize: 12, fontFamily: 'Inter, sans-serif' },
};

/**
 * Reusable bar chart rendered with ECharts (via ngx-echarts). Pass a list of
 * `{ label, value, primary }` or stacked series data.
 */
@Component({
  selector: 'app-bar-chart',
  standalone: true,
  imports: [NgxEchartsDirective],
  templateUrl: './bar-chart.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './bar-chart.css',
})
export class BarChart {
  @Input() data: BarDatum[] = [];
  @Input() categories?: string[];
  @Input() stackedSeries?: StackedBarSeries[];
  @Input() xAxisTitle = '';
  @Input() yAxisTitle = '';
  @Input() orientation: 'vertical' | 'horizontal' = 'vertical';
  /** Show the value axis line, ticks and gridlines. */
  @Input() showAxes = true;
  /** Show a value label on each bar. */
  @Input() showValues = true;
  /** Show the category (label) axis text. */
  @Input() showCategoryLabels = true;
  /** Suffix appended to each value label (e.g. '%'). */
  @Input() valueSuffix = '';
  /** Draw a full-length track behind each bar (pill-style progress bars). */
  @Input() showTrack = false;
  @Input() trackColor = 'rgba(127,150,178,0.15)';
  /** Chart height in px (ECharts needs a definite height). */
  @Input() heightPx = 250;
  @Input() primaryColor = '#0088FF';
  @Input() mutedColor = 'rgba(122,150,178,0.4)';
  /** Explicit override — leave unset to use the theme-aware default (light blue on dark,
   *  darkened on light) computed by `mutedValueColorResolved`. */
  @Input() primaryValueColor?: string;
  @Input() mutedValueColor?: string;

  private readonly themeService = inject(ThemeService);

  private get isLightTheme(): boolean {
    return this.themeService.theme() === 'light';
  }

  private get axisLabelStyle() {
    return {
      color: this.isLightTheme ? AXIS_LABEL_LIGHT : AXIS_LABEL_DARK,
      fontSize: 9.5,
      fontFamily: 'Inter, sans-serif',
    };
  }

  private get axisNameStyle() {
    return {
      color: this.isLightTheme ? AXIS_NAME_LIGHT : AXIS_NAME_DARK,
      fontSize: 10.5,
      fontWeight: 600,
      fontFamily: 'Poppins, sans-serif',
    };
  }

  private get primaryValueColorResolved(): string {
    return this.primaryValueColor ?? (this.isLightTheme ? '#0057B8' : '#7FC0FF');
  }

  private get mutedValueColorResolved(): string {
    return this.mutedValueColor ?? (this.isLightTheme ? MUTED_VALUE_LIGHT : MUTED_VALUE_DARK);
  }
  /** Emits the clicked bar's datum (e.g. to open an "update this value" dialog).
   *  Only fires in flat `data` mode — see `categoryClick` for `stackedSeries`. */
  @Output() barClick = new EventEmitter<BarDatum>();
  /** Emits the clicked category's index into `categories`/each series' `data`
   *  array — the click signal for `stackedSeries` mode, where there's no single
   *  `BarDatum` per bar for `barClick` to read from. */
  @Output() categoryClick = new EventEmitter<number>();

  onChartClick(event: { dataIndex: number }): void {
    if (this.stackedSeries && this.stackedSeries.length > 0) {
      this.categoryClick.emit(event.dataIndex);
      return;
    }
    const datum = this.data[event.dataIndex];
    if (datum) {
      this.barClick.emit(datum);
    }
  }

  get chartOption(): EChartsCoreOption {
    if (this.stackedSeries && this.stackedSeries.length > 0) {
      return {
        grid: {
          left: 6,
          right: 18,
          top: 24,
          bottom: 36,
          containLabel: true,
        },
        legend: {
          show: true,
          bottom: 0,
          icon: 'rect',
          itemWidth: 14,
          itemHeight: 14,
          textStyle: this.axisLabelStyle,
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          ...TOOLTIP_STYLE,
        },
        xAxis: {
          type: 'category',
          data: this.categories || [],
          name: this.xAxisTitle,
          nameLocation: 'middle',
          nameGap: 28,
          nameTextStyle: this.axisNameStyle,
          axisLine: { show: this.showAxes, lineStyle: { color: GRID_LINE } },
          axisTick: { show: false },
          axisLabel: { show: this.showCategoryLabels, ...this.axisLabelStyle },
        },
        yAxis: {
          type: 'value',
          minInterval: 1,
          name: this.yAxisTitle,
          nameLocation: 'middle',
          nameGap: 38,
          nameTextStyle: this.axisNameStyle,
          axisLine: { show: false },
          axisLabel: { show: this.showAxes, ...this.axisLabelStyle },
          splitLine: { show: this.showAxes, lineStyle: { color: GRID_LINE, type: 'dashed' } },
        },
        series: this.stackedSeries.map((s) => ({
          name: s.name,
          type: 'bar',
          stack: 'total',
          barWidth: '42%',
          barMaxWidth: 46,
          itemStyle: { color: s.color },
          data: s.data,
        })),
      } as EChartsCoreOption;
    }

    const horizontal = this.orientation === 'horizontal';
    const hasTitle = !!(this.xAxisTitle || this.yAxisTitle);

    const categoryAxis = {
      type: 'category',
      data: this.data.map((d) => d.label),
      name: horizontal ? this.yAxisTitle : this.xAxisTitle,
      nameLocation: 'middle',
      nameGap: horizontal ? 48 : 28,
      nameTextStyle: this.axisNameStyle,
      axisLine: { show: this.showAxes, lineStyle: { color: GRID_LINE } },
      axisTick: { show: false },
      axisLabel: { show: this.showCategoryLabels, ...this.axisLabelStyle },
      splitLine: { show: false },
      inverse: horizontal,
    };

    const valueAxis = {
      type: 'value',
      name: horizontal ? this.xAxisTitle : this.yAxisTitle,
      nameLocation: 'middle',
      nameGap: horizontal ? 26 : 38,
      nameTextStyle: this.axisNameStyle,
      axisLine: { show: false },
      axisLabel: { show: this.showAxes, ...this.axisLabelStyle },
      splitLine: { show: this.showAxes, lineStyle: { color: GRID_LINE, type: 'dashed' } },
    };

    const radius = horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0];

    return {
      grid: {
        left: 6,
        right: 18,
        top: this.showValues ? 24 : 12,
        bottom: hasTitle ? 40 : 12,
        containLabel: true,
      },
      tooltip: { trigger: 'axis', axisPointer: { type: 'none' }, ...TOOLTIP_STYLE },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      series: [
        {
          type: 'bar',
          barWidth: '42%',
          barMaxWidth: 46,
          showBackground: this.showTrack,
          backgroundStyle: { color: this.trackColor, borderRadius: 100 },
          label: {
            show: this.showValues,
            position: horizontal ? 'right' : 'top',
            formatter: `{c}${this.valueSuffix}`,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'Poppins, sans-serif',
          },
          data: this.data.map((d) => ({
            value: d.value,
            itemStyle: { color: d.color ?? (d.primary ? this.primaryColor : this.mutedColor), borderRadius: radius },
            label: { color: d.primary ? this.primaryValueColorResolved : this.mutedValueColorResolved },
          })),
        },
      ],
    } as EChartsCoreOption;
  }
}
