import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts/core';

// Segment for dynamically handling the ring data.
export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * Reusable doughnut chart rendered with ECharts (via ngx-echarts). Pass the ring
 * `segments` and an optional centre caption; the centre value/label/description
 * are overlaid with HTML on top of the ring.
 */
const TOOLTIP_STYLE = {
  backgroundColor: 'var(--bg-dropdown)',
  borderColor: 'var(--border-primary)',
  borderWidth: 1,
  padding: 10,
  extraCssText: 'box-shadow: none; border-radius: 8px;',
  textStyle: { color: 'var(--text-primary)', fontSize: 12, fontFamily: 'Inter, sans-serif' },
};

export type DonutChartType = 'doughnut' | 'line';

@Component({
  selector: 'app-donut-chart',
  standalone: true,
  imports: [NgxEchartsDirective],
  templateUrl: './donut-chart.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./donut-chart.css'],
})
export class DonutChart {
  @Input() segments: DonutSegment[] = [];

  @Input() centerValue = '';
  @Input() centerLabel = '';
  @Input() centerDescription = '';
  // default height, width and cut-off
  @Input() width = 170;
  @Input() height = 170;
  @Input() cutout = '85%';
  @Input() showLegend = false;

  /** Chart mode: the classic ring ('doughnut', default) or a filled sparkline ('line'). */
  @Input() chartType: DonutChartType = 'doughnut';
  /** 'line' mode: x-axis category labels. */
  @Input() labels: string[] = [];
  /** 'line' mode: the series values. */
  @Input() lineData: number[] = [];
  /** 'line' mode: stroke + gradient fill color. */
  @Input() lineColor = '#FF4D4F';

  get chartOption(): EChartsCoreOption {
    if (this.chartType === 'line') {
      return {
        grid: { left: 0, right: 0, top: 4, bottom: 4 },
        xAxis: { type: 'category', show: false, data: this.labels },
        yAxis: { type: 'value', show: false },
        series: [
          {
            type: 'line',
            data: this.lineData,
            showSymbol: false,
            smooth: 0.45,
            lineStyle: { color: this.lineColor, width: 2 },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: this.lineColor },
                  { offset: 1, color: 'transparent' },
                ],
              },
              opacity: 0.35,
            },
          },
        ],
      } as EChartsCoreOption;
    }

    return {
      tooltip: { trigger: 'item', ...TOOLTIP_STYLE },
      series: [
        {
          type: 'pie',
          radius: [this.cutout, '96%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          label: { show: false },
          labelLine: { show: false },
          emphasis: { scale: false },
          data: this.segments.map((s) => ({
            value: s.value,
            name: s.label,
            itemStyle: { color: s.color },
          })),
        },
      ],
    } as EChartsCoreOption;
  }
}
